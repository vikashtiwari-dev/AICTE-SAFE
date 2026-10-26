import bcrypt from 'bcryptjs';
import { db, initializeDatabase } from './database';

function addDays(date: Date, days: number): string {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().split('T')[0];
}

async function seed() {
  await initializeDatabase();

  const userCountRow = await db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
  const userCount = userCountRow ? Number(userCountRow.count) : 0;
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

  for (const inst of institutions) {
    await db.execute(`
      INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [inst.aicte_id, inst.name, inst.address, inst.state, inst.city, inst.contact_person, inst.contact_email, inst.contact_phone, inst.institution_type]);
  }
  console.log('✅ Institutions seeded');

  // ─── USERS ───────────────────────────────────────────────────────────
  const users = [
    { username: 'admin', password: 'admin123', full_name: 'System Administrator', email: 'admin@aicte.gov.in', role: 'admin', institution_id: null },
    { username: 'officer1', password: 'officer123', full_name: 'Rajesh Verma', email: 'r.verma@aicte.gov.in', role: 'bureau_officer', institution_id: null },
    { username: 'inst_user1', password: 'inst123', full_name: 'MIT Admin User', email: 'admin@mit.edu.in', role: 'institution_user', institution_id: 1 },
    { username: 'viewer1', password: 'viewer123', full_name: 'Audit Viewer', email: 'viewer@aicte.gov.in', role: 'viewer', institution_id: null },
  ];

  for (const user of users) {
    const hash = bcrypt.hashSync(user.password, 10);
    await db.execute(`
      INSERT INTO users (username, password_hash, full_name, email, role, institution_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [user.username, hash, user.full_name, user.email, user.role, user.institution_id]);
  }
  console.log('✅ Users seeded');

  console.log('\n🎉 Database seeding complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
