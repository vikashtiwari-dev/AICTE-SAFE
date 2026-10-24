import bcrypt from 'bcryptjs';
import { db, initializeDatabase } from './database';

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

async function seed() {
  initializeDatabase();

  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count;
  if (userCount > 0) {
    console.log('Database already seeded. Skipping.');
    process.exit(0);
  }

  const today = new Date();

  // ─── INSTITUTIONS ───────────────────────────────────────────────────
  const institutions = [
    { aicte_id: 'AICTE-2024-MH-001', name: 'Maharashtra Institute of Technology, Pune', address: 'S.No. 124, Paud Road, Kothrud', state: 'Maharashtra', city: 'Pune', contact_person: 'Dr. Ramesh Sharma', contact_email: 'principal@mit.edu.in', contact_phone: '020-25465050', institution_type: 'Engineering' },
    { aicte_id: 'AICTE-2024-DL-002', name: 'Delhi School of Management', address: 'DTU Campus, Shahbad Daulatpur, Main Bawana Road', state: 'Delhi', city: 'New Delhi', contact_person: 'Prof. Anjali Mehta', contact_email: 'director@dsm.ac.in', contact_phone: '011-27871023', institution_type: 'MBA' },
    { aicte_id: 'AICTE-2024-KA-003', name: 'Bangalore Pharmacy College', address: '40/1, Rajashekhara Nagar, Bellary Road', state: 'Karnataka', city: 'Bengaluru', contact_person: 'Dr. Suresh Kumar', contact_email: 'principal@bpc.edu.in', contact_phone: '080-23606800', institution_type: 'Pharmacy' },
    { aicte_id: 'AICTE-2024-UP-004', name: 'Lucknow Polytechnic Institute', address: 'IET Campus, Sitapur Road', state: 'Uttar Pradesh', city: 'Lucknow', contact_person: 'Mr. Ajay Tiwari', contact_email: 'director@lpi.ac.in', contact_phone: '0522-2740236', institution_type: 'Polytechnic' },
    { aicte_id: 'AICTE-2024-TN-005', name: 'Chennai Institute of Technology', address: 'NH-4, Kundrathur Post', state: 'Tamil Nadu', city: 'Chennai', contact_person: 'Dr. Priya Rajan', contact_email: 'principal@cit.ac.in', contact_phone: '044-24781000', institution_type: 'Engineering' },
  ];

  const insertInst = db.prepare(`
    INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
    VALUES (@aicte_id, @name, @address, @state, @city, @contact_person, @contact_email, @contact_phone, @institution_type)
  `);

  for (const inst of institutions) {
    insertInst.run(inst);
  }
  console.log('✅ Institutions seeded');

  // ─── USERS ───────────────────────────────────────────────────────────
  const users = [
    { username: 'admin', password: 'admin123', full_name: 'System Administrator', email: 'admin@aicte.gov.in', role: 'admin', institution_id: null },
    { username: 'officer1', password: 'officer123', full_name: 'Rajesh Verma', email: 'r.verma@aicte.gov.in', role: 'bureau_officer', institution_id: null },
    { username: 'inst_user1', password: 'inst123', full_name: 'MIT Admin User', email: 'admin@mit.edu.in', role: 'institution_user', institution_id: 1 },
    { username: 'viewer1', password: 'viewer123', full_name: 'Audit Viewer', email: 'viewer@aicte.gov.in', role: 'viewer', institution_id: null },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, email, role, institution_id)
    VALUES (@username, @password_hash, @full_name, @email, @role, @institution_id)
  `);

  for (const user of users) {
    const hash = bcrypt.hashSync(user.password, 10);
    insertUser.run({
      username: user.username,
      password_hash: hash,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      institution_id: user.institution_id,
    });
  }
  console.log('✅ Users seeded');

  // ─── FDRs ────────────────────────────────────────────────────────────
  const fdrs = [
    { institution_id: 1, fdr_number: 'FDR-MIT-2024-001', bank_name: 'State Bank of India', bank_branch: 'Kothrud Branch', account_number: 'SBI001234567', deposit_amount: 5000000, issue_date: addDays(today, -365), maturity_date: addDays(today, 10), interest_rate: 6.5, deposit_type: 'FDR', purpose: 'New Institution Approval', status: 'Expiring Soon', verification_status: 'Verified', submitted_by: 3, last_updated_by: 2 },
    { institution_id: 1, fdr_number: 'FDR-MIT-2024-002', bank_name: 'Bank of Baroda', bank_branch: 'Pune Main', account_number: 'BOB009876543', deposit_amount: 2500000, issue_date: addDays(today, -180), maturity_date: addDays(today, 185), interest_rate: 6.8, deposit_type: 'Security Deposit', purpose: 'PG Program Approval', status: 'Active', verification_status: 'Verified', submitted_by: 3, last_updated_by: 2 },
    { institution_id: 1, fdr_number: 'FDR-MIT-2024-003', bank_name: 'HDFC Bank', bank_branch: 'Karve Road', account_number: 'HDFC001122334', deposit_amount: 1000000, issue_date: addDays(today, -400), maturity_date: addDays(today, -35), interest_rate: 7.0, deposit_type: 'FDR', purpose: 'Extension of Approval', status: 'Matured', verification_status: 'Verified', submitted_by: 3, last_updated_by: 1 },

    { institution_id: 2, fdr_number: 'FDR-DSM-2024-001', bank_name: 'Punjab National Bank', bank_branch: 'Rohini Sector 11', account_number: 'PNB112233445', deposit_amount: 3000000, issue_date: addDays(today, -200), maturity_date: addDays(today, 165), interest_rate: 6.9, deposit_type: 'Bank Guarantee', purpose: 'New Program Approval', status: 'Active', verification_status: 'Unverified', submitted_by: 1, last_updated_by: 1 },
    { institution_id: 2, fdr_number: 'FDR-DSM-2024-002', bank_name: 'Axis Bank', bank_branch: 'Connaught Place', account_number: 'AXIS667788990', deposit_amount: 1500000, issue_date: addDays(today, -730), maturity_date: addDays(today, -365), interest_rate: 6.5, deposit_type: 'FDR', purpose: 'Mandatory Deposit', status: 'Released', verification_status: 'Verified', submitted_by: 1, last_updated_by: 2 },
    { institution_id: 2, fdr_number: 'FDR-DSM-2024-003', bank_name: 'Canara Bank', bank_branch: 'CP New Delhi', account_number: 'CAN334455667', deposit_amount: 2000000, issue_date: addDays(today, -25), maturity_date: addDays(today, 340), interest_rate: 7.1, deposit_type: 'FDR', purpose: 'Renewal - New Program', status: 'Active', verification_status: 'Pending', is_renewal: 1, parent_fdr_id: 5, submitted_by: 1, last_updated_by: 1 },

    { institution_id: 3, fdr_number: 'FDR-BPC-2024-001', bank_name: 'Indian Bank', bank_branch: 'Bengaluru Main', account_number: 'IB445566778', deposit_amount: 2000000, issue_date: addDays(today, -90), maturity_date: addDays(today, 25), interest_rate: 6.75, deposit_type: 'Security Deposit', purpose: 'Institution Approval', status: 'Expiring Soon', verification_status: 'Discrepancy', verification_notes: 'Amount on certificate does not match submitted records. Please verify.', submitted_by: 1, last_updated_by: 2 },
    { institution_id: 3, fdr_number: 'FDR-BPC-2024-002', bank_name: 'UCO Bank', bank_branch: 'Rajajinagar', account_number: 'UCO889900112', deposit_amount: 1000000, issue_date: addDays(today, -500), maturity_date: addDays(today, -135), interest_rate: 6.5, deposit_type: 'FDR', purpose: 'Annual Deposit', status: 'Matured', verification_status: 'Verified', submitted_by: 1, last_updated_by: 1 },
    { institution_id: 3, fdr_number: 'FDR-BPC-2024-003', bank_name: 'ICICI Bank', bank_branch: 'Sadashivnagar', account_number: 'ICICI334411225', deposit_amount: 1000000, issue_date: addDays(today, -135), maturity_date: addDays(today, 230), interest_rate: 7.25, deposit_type: 'FDR', purpose: 'Renewal of Deposit', status: 'Active', verification_status: 'Verified', is_renewal: 1, parent_fdr_id: 8, submitted_by: 1, last_updated_by: 2 },

    { institution_id: 4, fdr_number: 'FDR-LPI-2024-001', bank_name: 'Bank of India', bank_branch: 'Lucknow Hazratganj', account_number: 'BOI556677889', deposit_amount: 1500000, issue_date: addDays(today, -300), maturity_date: addDays(today, 65), interest_rate: 6.6, deposit_type: 'Security Deposit', purpose: 'New Course Approval', status: 'Active', verification_status: 'Verified', submitted_by: 1, last_updated_by: 2 },
    { institution_id: 4, fdr_number: 'FDR-LPI-2024-002', bank_name: 'Central Bank of India', bank_branch: 'Alambagh', account_number: 'CBI778899001', deposit_amount: 500000, issue_date: addDays(today, -10), maturity_date: addDays(today, 355), interest_rate: 6.4, deposit_type: 'FDR', purpose: 'Extension', status: 'Pending Verification', verification_status: 'Unverified', submitted_by: 1, last_updated_by: 1 },

    { institution_id: 5, fdr_number: 'FDR-CIT-2024-001', bank_name: 'Indian Overseas Bank', bank_branch: 'Anna Nagar', account_number: 'IOB990011223', deposit_amount: 4000000, issue_date: addDays(today, -180), maturity_date: addDays(today, 185), interest_rate: 6.85, deposit_type: 'Bank Guarantee', purpose: 'New Institute Approval', status: 'Active', verification_status: 'Verified', submitted_by: 1, last_updated_by: 2 },
    { institution_id: 5, fdr_number: 'FDR-CIT-2024-002', bank_name: 'Karur Vysya Bank', bank_branch: 'T Nagar', account_number: 'KVB112233440', deposit_amount: 2500000, issue_date: addDays(today, -400), maturity_date: addDays(today, -30), interest_rate: 7.0, deposit_type: 'FDR', purpose: 'Mandatory Deposit', status: 'Renewed', verification_status: 'Verified', submitted_by: 1, last_updated_by: 2 },
    { institution_id: 5, fdr_number: 'FDR-CIT-2024-003', bank_name: 'Karur Vysya Bank', bank_branch: 'T Nagar', account_number: 'KVB112233441', deposit_amount: 2500000, issue_date: addDays(today, -30), maturity_date: addDays(today, 335), interest_rate: 7.2, deposit_type: 'FDR', purpose: 'Renewal', status: 'Active', verification_status: 'Unverified', is_renewal: 1, parent_fdr_id: 13, submitted_by: 1, last_updated_by: 1 },
    { institution_id: 5, fdr_number: 'FDR-CIT-2024-004', bank_name: 'State Bank of India', bank_branch: 'Guindy', account_number: 'SBI009988776', deposit_amount: 1000000, issue_date: addDays(today, -5), maturity_date: addDays(today, 360), interest_rate: 6.5, deposit_type: 'Security Deposit', purpose: 'New Program', status: 'Pending Verification', verification_status: 'Unverified', submitted_by: 1, last_updated_by: 1 },
  ];

  const insertFdr = db.prepare(`
    INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
      issue_date, maturity_date, interest_rate, deposit_type, purpose, status, verification_status,
      verification_notes, verified_by, submitted_by, last_updated_by, is_renewal, parent_fdr_id)
    VALUES (@institution_id, @fdr_number, @bank_name, @bank_branch, @account_number, @deposit_amount,
      @issue_date, @maturity_date, @interest_rate, @deposit_type, @purpose, @status, @verification_status,
      @verification_notes, @verified_by, @submitted_by, @last_updated_by, @is_renewal, @parent_fdr_id)
  `);

  for (const fdr of fdrs) {
    insertFdr.run({
      institution_id: fdr.institution_id,
      fdr_number: fdr.fdr_number,
      bank_name: fdr.bank_name,
      bank_branch: fdr.bank_branch || null,
      account_number: fdr.account_number || null,
      deposit_amount: fdr.deposit_amount,
      issue_date: fdr.issue_date,
      maturity_date: fdr.maturity_date,
      interest_rate: fdr.interest_rate || null,
      deposit_type: fdr.deposit_type,
      purpose: fdr.purpose || null,
      status: fdr.status,
      verification_status: fdr.verification_status,
      verification_notes: (fdr as any).verification_notes || null,
      verified_by: (fdr as any).verified_by || null,
      submitted_by: fdr.submitted_by,
      last_updated_by: fdr.last_updated_by,
      is_renewal: fdr.is_renewal || 0,
      parent_fdr_id: (fdr as any).parent_fdr_id || null,
    });
  }
  console.log('✅ FDRs seeded');

  // ─── ALERTS ──────────────────────────────────────────────────────────
  const alerts = [
    { fdr_id: 1, institution_id: 1, alert_type: 'Maturity', severity: 'Critical', message: 'FDR FDR-MIT-2024-001 is maturing in 10 days. Immediate renewal action required.', due_date: addDays(today, 10), is_resolved: 0 },
    { fdr_id: 7, institution_id: 3, alert_type: 'Discrepancy', severity: 'Critical', message: 'Discrepancy detected in FDR FDR-BPC-2024-001. Submitted amount does not match bank records.', due_date: addDays(today, 5), is_resolved: 0 },
    { fdr_id: 3, institution_id: 1, alert_type: 'Renewal', severity: 'High', message: 'FDR FDR-MIT-2024-003 has matured 35 days ago. Renewal or replacement FDR required urgently.', due_date: addDays(today, -35), is_resolved: 0 },
    { fdr_id: 7, institution_id: 3, alert_type: 'Maturity', severity: 'High', message: 'FDR FDR-BPC-2024-001 is expiring in 25 days. Initiate renewal process.', due_date: addDays(today, 25), is_resolved: 0 },
    { fdr_id: 4, institution_id: 2, alert_type: 'Missing_Doc', severity: 'Medium', message: 'FDR FDR-DSM-2024-001 is missing verification documents. Please upload bank-issued FDR certificate.', due_date: null, is_resolved: 0 },
    { fdr_id: 11, institution_id: 4, alert_type: 'Missing_Doc', severity: 'Medium', message: 'FDR FDR-LPI-2024-002 submitted but no supporting documents uploaded. Verification pending.', due_date: null, is_resolved: 0 },
    { fdr_id: 10, institution_id: 4, alert_type: 'Maturity', severity: 'Medium', message: 'FDR FDR-LPI-2024-001 maturing in 65 days. Plan for renewal.', due_date: addDays(today, 65), is_resolved: 0 },
    { fdr_id: 6, institution_id: 2, alert_type: 'Missing_Doc', severity: 'Low', message: 'FDR FDR-DSM-2024-003 (Renewal) - Verification of renewal FDR pending.', due_date: null, is_resolved: 0 },
    { fdr_id: 8, institution_id: 3, alert_type: 'Renewal', severity: 'High', message: 'FDR FDR-BPC-2024-002 matured 135 days ago. Renewal FDR submitted as FDR-BPC-2024-003.', due_date: addDays(today, -135), is_resolved: 1 },
    { fdr_id: 15, institution_id: 5, alert_type: 'Missing_Doc', severity: 'Medium', message: 'New FDR FDR-CIT-2024-004 requires document verification.', due_date: null, is_resolved: 0 },
  ];

  const insertAlert = db.prepare(`
    INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date, is_resolved)
    VALUES (@fdr_id, @institution_id, @alert_type, @severity, @message, @due_date, @is_resolved)
  `);

  for (const alert of alerts) {
    insertAlert.run({
      fdr_id: alert.fdr_id,
      institution_id: alert.institution_id,
      alert_type: alert.alert_type,
      severity: alert.severity,
      message: alert.message,
      due_date: alert.due_date,
      is_resolved: alert.is_resolved,
    });
  }
  console.log('✅ Alerts seeded');

  // ─── RELEASE REQUESTS ────────────────────────────────────────────────
  const releases = [
    { fdr_id: 5, institution_id: 2, request_type: 'Release', reason: 'Institution closure approved by AICTE. FDR to be released as per regulatory approval.', requested_by: 1, status: 'Completed', reviewed_by: null, approved_by: 1, remarks: 'Released after verification of closure compliance.' },
    { fdr_id: 3, institution_id: 1, request_type: 'Refund', reason: 'Matured FDR amount to be refunded. New FDR submitted separately for current approval cycle.', requested_by: 3, status: 'Approved', reviewed_by: 2, approved_by: 1, remarks: 'Approved pending new FDR verification.' },
    { fdr_id: 8, institution_id: 3, request_type: 'Release', reason: 'Renewal FDR (FDR-BPC-2024-003) submitted. Requesting release of old matured FDR.', requested_by: 1, status: 'Under Review', reviewed_by: 2, approved_by: null, remarks: 'Under review - verifying new FDR details.' },
    { fdr_id: 7, institution_id: 3, request_type: 'Discharge', reason: 'Discrepancy in FDR. Requesting discharge and resubmission of corrected FDR.', requested_by: 1, status: 'Pending', reviewed_by: null, approved_by: null, remarks: null },
    { fdr_id: 13, institution_id: 5, request_type: 'Release', reason: 'Renewed FDR (FDR-CIT-2024-003) submitted. Requesting release of old FDR.', requested_by: 1, status: 'Pending', reviewed_by: null, approved_by: null, remarks: null },
  ];

  const insertRelease = db.prepare(`
    INSERT INTO release_requests (fdr_id, institution_id, request_type, reason, requested_by, status, reviewed_by, approved_by, remarks)
    VALUES (@fdr_id, @institution_id, @request_type, @reason, @requested_by, @status, @reviewed_by, @approved_by, @remarks)
  `);

  for (const rel of releases) {
    insertRelease.run({
      fdr_id: rel.fdr_id,
      institution_id: rel.institution_id,
      request_type: rel.request_type,
      reason: rel.reason,
      requested_by: rel.requested_by,
      status: rel.status,
      reviewed_by: rel.reviewed_by,
      approved_by: rel.approved_by,
      remarks: rel.remarks,
    });
  }
  console.log('✅ Release requests seeded');

  // ─── AUDIT LOG ───────────────────────────────────────────────────────
  const auditEntries = [
    { entity_type: 'FDR', entity_id: 1, action: 'Created', changed_by: 3, old_value: null, new_value: null, notes: 'FDR submitted by institution user' },
    { entity_type: 'FDR', entity_id: 1, action: 'Verified', changed_by: 2, old_value: null, new_value: null, notes: 'FDR verified by bureau officer' },
    { entity_type: 'FDR', entity_id: 7, action: 'Created', changed_by: 1, old_value: null, new_value: null, notes: 'FDR submitted' },
    { entity_type: 'FDR', entity_id: 7, action: 'Discrepancy Flagged', changed_by: 2, old_value: null, new_value: null, notes: 'Amount mismatch detected during verification' },
    { entity_type: 'Release', entity_id: 1, action: 'Request Created', changed_by: 1, old_value: null, new_value: null, notes: 'Release request submitted' },
    { entity_type: 'Release', entity_id: 1, action: 'Approved', changed_by: 1, old_value: null, new_value: null, notes: 'Release approved by admin' },
    { entity_type: 'Release', entity_id: 1, action: 'Completed', changed_by: 1, old_value: null, new_value: null, notes: 'FDR released and marked complete' },
    { entity_type: 'FDR', entity_id: 5, action: 'Status Changed', changed_by: 2, old_value: JSON.stringify({ status: 'Active' }), new_value: JSON.stringify({ status: 'Released' }), notes: 'Released per approval' },
  ];

  const insertAudit = db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, changed_by, old_value, new_value, notes)
    VALUES (@entity_type, @entity_id, @action, @changed_by, @old_value, @new_value, @notes)
  `);

  for (const entry of auditEntries) {
    insertAudit.run(entry);
  }
  console.log('✅ Audit log seeded');

  console.log('\n🎉 Database seeding complete!');
  console.log('\nDemo credentials:');
  console.log('  admin / admin123          (Administrator)');
  console.log('  officer1 / officer123     (Bureau Officer)');
  console.log('  inst_user1 / inst123      (Institution User - MIT Pune)');
  console.log('  viewer1 / viewer123       (Viewer)');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
