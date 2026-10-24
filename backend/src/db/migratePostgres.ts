import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

async function migrateToPostgres() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL environment variable is not defined.');
    console.log('Set DATABASE_URL in your .env or command line. Example:');
    console.log('DATABASE_URL=postgresql://user:password@host:5432/dbname npm run migrate:postgres');
    process.exit(1);
  }

  console.log('🐘 Connecting to PostgreSQL server...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    console.log('📄 Executing schema.postgres.sql...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf-8');
    await client.query(schemaSql);
    console.log('✅ PostgreSQL tables created successfully.');

    // Check if already seeded
    const res = await client.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(res.rows[0].count) > 0) {
      console.log('ℹ️ PostgreSQL database already contains data. Skipping seed.');
      return;
    }

    console.log('🌱 Seeding PostgreSQL database with AICTE demo records...');
    const today = new Date();

    // 1. Institutions
    const institutions = [
      ['AICTE-2024-MH-001', 'Maharashtra Institute of Technology, Pune', 'S.No. 124, Paud Road, Kothrud', 'Maharashtra', 'Pune', 'Dr. Ramesh Sharma', 'principal@mit.edu.in', '020-25465050', 'Engineering'],
      ['AICTE-2024-DL-002', 'Delhi School of Management', 'DTU Campus, Shahbad Daulatpur, Main Bawana Road', 'Delhi', 'New Delhi', 'Prof. Anjali Mehta', 'director@dsm.ac.in', '011-27871023', 'MBA'],
      ['AICTE-2024-KA-003', 'Bangalore Pharmacy College', '40/1, Rajashekhara Nagar, Bellary Road', 'Karnataka', 'Bengaluru', 'Dr. Suresh Kumar', 'principal@bpc.edu.in', '080-23606800', 'Pharmacy'],
      ['AICTE-2024-UP-004', 'Lucknow Polytechnic Institute', 'IET Campus, Sitapur Road', 'Uttar Pradesh', 'Lucknow', 'Mr. Ajay Tiwari', 'director@lpi.ac.in', '0522-2740236', 'Polytechnic'],
      ['AICTE-2024-TN-005', 'Chennai Institute of Technology', 'NH-4, Kundrathur Post', 'Tamil Nadu', 'Chennai', 'Dr. Priya Rajan', 'principal@cit.ac.in', '044-24781000', 'Engineering'],
    ];

    for (const inst of institutions) {
      await client.query(`
        INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, inst);
    }
    console.log('✅ Institutions seeded in PostgreSQL');

    // 2. Users
    const users = [
      ['admin', bcrypt.hashSync('admin123', 10), 'System Administrator', 'admin@aicte.gov.in', 'admin', null],
      ['officer1', bcrypt.hashSync('officer123', 10), 'Rajesh Verma', 'r.verma@aicte.gov.in', 'bureau_officer', null],
      ['inst_user1', bcrypt.hashSync('inst123', 10), 'MIT Admin User', 'admin@mit.edu.in', 'institution_user', 1],
      ['viewer1', bcrypt.hashSync('viewer123', 10), 'Audit Viewer', 'viewer@aicte.gov.in', 'viewer', null],
    ];

    for (const u of users) {
      await client.query(`
        INSERT INTO users (username, password_hash, full_name, email, role, institution_id)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, u);
    }
    console.log('✅ Users seeded in PostgreSQL');

    // 3. FDRs
    const fdrs = [
      [1, 'FDR-MIT-2024-001', 'State Bank of India', 'Kothrud Branch', 'SBI001234567', 5000000, addDays(today, -365), addDays(today, 10), 6.5, 'FDR', 'New Institution Approval', 'Expiring Soon', 'Verified', null, null, 3, 2, 0, null],
      [1, 'FDR-MIT-2024-002', 'Bank of Baroda', 'Pune Main', 'BOB009876543', 2500000, addDays(today, -180), addDays(today, 185), 6.8, 'Security Deposit', 'PG Program Approval', 'Active', 'Verified', null, null, 3, 2, 0, null],
      [1, 'FDR-MIT-2024-003', 'HDFC Bank', 'Karve Road', 'HDFC001122334', 1000000, addDays(today, -400), addDays(today, -35), 7.0, 'FDR', 'Extension of Approval', 'Matured', 'Verified', null, null, 3, 1, 0, null],
      [2, 'FDR-DSM-2024-001', 'Punjab National Bank', 'Rohini Sector 11', 'PNB112233445', 3000000, addDays(today, -200), addDays(today, 165), 6.9, 'Bank Guarantee', 'New Program Approval', 'Active', 'Unverified', null, null, 1, 1, 0, null],
      [2, 'FDR-DSM-2024-002', 'Axis Bank', 'Connaught Place', 'AXIS667788990', 1500000, addDays(today, -730), addDays(today, -365), 6.5, 'FDR', 'Mandatory Deposit', 'Released', 'Verified', null, null, 1, 2, 0, null],
      [2, 'FDR-DSM-2024-003', 'Canara Bank', 'CP New Delhi', 'CAN334455667', 2000000, addDays(today, -25), addDays(today, 340), 7.1, 'FDR', 'Renewal - New Program', 'Active', 'Pending', null, null, 1, 1, 1, 5],
      [3, 'FDR-BPC-2024-001', 'Indian Bank', 'Bengaluru Main', 'IB445566778', 2000000, addDays(today, -90), addDays(today, 25), 6.75, 'Security Deposit', 'Institution Approval', 'Expiring Soon', 'Discrepancy', 'Amount on certificate does not match submitted records. Please verify.', null, 1, 2, 0, null],
      [3, 'FDR-BPC-2024-002', 'UCO Bank', 'Rajajinagar', 'UCO889900112', 1000000, addDays(today, -500), addDays(today, -135), 6.5, 'FDR', 'Annual Deposit', 'Matured', 'Verified', null, null, 1, 1, 0, null],
      [3, 'FDR-BPC-2024-003', 'ICICI Bank', 'Sadashivnagar', 'ICICI334411225', 1000000, addDays(today, -135), addDays(today, 230), 7.25, 'FDR', 'Renewal of Deposit', 'Active', 'Verified', null, null, 1, 2, 1, 8],
      [4, 'FDR-LPI-2024-001', 'Bank of India', 'Lucknow Hazratganj', 'BOI556677889', 1500000, addDays(today, -300), addDays(today, 65), 6.6, 'Security Deposit', 'New Course Approval', 'Active', 'Verified', null, null, 1, 2, 0, null],
      [4, 'FDR-LPI-2024-002', 'Central Bank of India', 'Alambagh', 'CBI778899001', 500000, addDays(today, -10), addDays(today, 355), 6.4, 'FDR', 'Extension', 'Pending Verification', 'Unverified', null, null, 1, 1, 0, null],
      [5, 'FDR-CIT-2024-001', 'Indian Overseas Bank', 'Anna Nagar', 'IOB990011223', 4000000, addDays(today, -180), addDays(today, 185), 6.85, 'Bank Guarantee', 'New Institute Approval', 'Active', 'Verified', null, null, 1, 2, 0, null],
      [5, 'FDR-CIT-2024-002', 'Karur Vysya Bank', 'T Nagar', 'KVB112233440', 2500000, addDays(today, -400), addDays(today, -30), 7.0, 'FDR', 'Mandatory Deposit', 'Renewed', 'Verified', null, null, 1, 2, 0, null],
      [5, 'FDR-CIT-2024-003', 'Karur Vysya Bank', 'T Nagar', 'KVB112233441', 2500000, addDays(today, -30), addDays(today, 335), 7.2, 'FDR', 'Renewal', 'Active', 'Unverified', null, null, 1, 1, 1, 13],
      [5, 'FDR-CIT-2024-004', 'State Bank of India', 'Guindy', 'SBI009988776', 1000000, addDays(today, -5), addDays(today, 360), 6.5, 'Security Deposit', 'New Program', 'Pending Verification', 'Unverified', null, null, 1, 1, 0, null],
    ];

    for (const f of fdrs) {
      await client.query(`
        INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
          issue_date, maturity_date, interest_rate, deposit_type, purpose, status, verification_status,
          verification_notes, verified_by, submitted_by, last_updated_by, is_renewal, parent_fdr_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `, f);
    }
    console.log('✅ FDRs seeded in PostgreSQL');

    console.log('🎉 PostgreSQL database setup and migration complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

migrateToPostgres().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
