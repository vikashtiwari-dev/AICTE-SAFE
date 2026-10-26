-- ====================================================================
-- AICTE-SAFE: Master Database Setup for Supabase / PostgreSQL
-- Covers complete DDL Schema, Default Administrative Users,
-- and the complete National Dataset for all 23 IITs & 31 NITs (54 Institutes)
-- ====================================================================

-- 1. DDL: Create Tables & Relations
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'viewer',
  institution_id INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institutions (
  id SERIAL PRIMARY KEY,
  aicte_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  state VARCHAR(100),
  city VARCHAR(100),
  contact_person VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  institution_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fdrs (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  fdr_number VARCHAR(100) UNIQUE NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  bank_branch VARCHAR(255),
  account_number VARCHAR(100),
  deposit_amount NUMERIC(15, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  issue_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  interest_rate NUMERIC(5, 2),
  deposit_type VARCHAR(50) DEFAULT 'FDR',
  purpose TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'Active',
  verification_status VARCHAR(50) DEFAULT 'Unverified',
  verification_notes TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_at TIMESTAMP,
  submitted_by INTEGER REFERENCES users(id),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated_by INTEGER REFERENCES users(id),
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  remarks TEXT,
  is_renewal INTEGER DEFAULT 0,
  parent_fdr_id INTEGER REFERENCES fdrs(id),
  aph_programme VARCHAR(100),
  lock_in_years INTEGER DEFAULT 8,
  sfms_ifn_ref VARCHAR(100),
  nesl_bg_identifier VARCHAR(100),
  is_encashed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fdr_documents (
  id SERIAL PRIMARY KEY,
  fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) DEFAULT 'Medium',
  message TEXT NOT NULL,
  due_date DATE,
  is_resolved INTEGER DEFAULT 0,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS release_requests (
  id SERIAL PRIMARY KEY,
  fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  request_type VARCHAR(50) DEFAULT 'Release',
  reason TEXT NOT NULL,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'Submitted',
  review_stage VARCHAR(50) DEFAULT 'Dealing_Officer',
  dealing_officer_id INTEGER REFERENCES users(id),
  dealing_officer_remarks TEXT,
  dealing_officer_at TIMESTAMP,
  finance_officer_id INTEGER REFERENCES users(id),
  finance_officer_remarks TEXT,
  finance_officer_at TIMESTAMP,
  director_id INTEGER REFERENCES users(id),
  director_remarks TEXT,
  director_at TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  statutory_order_number VARCHAR(100),
  noc_document_path TEXT,
  rejection_reason TEXT,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS institution_requests (
  id SERIAL PRIMARY KEY,
  aicte_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  institution_type VARCHAR(100) DEFAULT 'Engineering',
  state VARCHAR(100),
  city VARCHAR(100),
  address TEXT,
  contact_person VARCHAR(255),
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  justification TEXT,
  status VARCHAR(50) DEFAULT 'Pending',
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER NOT NULL,
  action VARCHAR(100) NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  old_value TEXT,
  new_value TEXT,
  user_id INTEGER,
  institution_id INTEGER,
  previous_state TEXT,
  new_state TEXT,
  ip_address VARCHAR(50),
  notes TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lien_invocations (
  id SERIAL PRIMARY KEY,
  fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  invocation_ref VARCHAR(100) UNIQUE NOT NULL,
  reason_code VARCHAR(100) NOT NULL,
  justification TEXT NOT NULL,
  demand_amount NUMERIC(15, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'Initiated',
  show_cause_ref VARCHAR(100),
  show_cause_issued_at TIMESTAMP,
  show_cause_deadline DATE,
  bank_demand_ref VARCHAR(100),
  bank_demand_served_at TIMESTAMP,
  recovery_utr_challan VARCHAR(100),
  recovery_date DATE,
  initiated_by INTEGER REFERENCES users(id),
  initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  dsc_sign_hash TEXT,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS bulk_ingestion_jobs (
  id SERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  total_rows INTEGER NOT NULL,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Completed',
  summary_log TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS statutory_certificates (
  id SERIAL PRIMARY KEY,
  certificate_type VARCHAR(100) NOT NULL,
  fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  certificate_number VARCHAR(100) UNIQUE NOT NULL,
  qr_code_data TEXT NOT NULL,
  dsc_sign_hash TEXT,
  signer_designation VARCHAR(100),
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  issued_by INTEGER REFERENCES users(id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_fdrs_institution ON fdrs(institution_id);
CREATE INDEX IF NOT EXISTS idx_fdrs_maturity ON fdrs(maturity_date);
CREATE INDEX IF NOT EXISTS idx_fdrs_status ON fdrs(status);
CREATE INDEX IF NOT EXISTS idx_alerts_institution ON alerts(institution_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(is_resolved);

-- --------------------------------------------------------------------
-- 2. Default Portal Users (Pass: admin123, officer123, viewer123)
-- --------------------------------------------------------------------
INSERT INTO users (id, username, password_hash, full_name, email, role)
VALUES
  (1, 'admin', '$2a$10$qDZDEZaL57uC6vGtPwmwXurLJPn/Zz8pfmJWu/oUnrV5DUEm9QYRa', 'System Administrator', 'admin@aicte.gov.in', 'admin'),
  (2, 'officer1', '$2a$10$uzbVo9BNwEYt.j0hSP/S/.XEnWxJvZxHJgv.jWBV/g22Rxk5xGxnG', 'Rajesh Verma (Bureau Officer)', 'r.verma@aicte.gov.in', 'bureau_officer'),
  (3, 'viewer1', '$2a$10$QLszhaR6SX6rA1wyDn5w9.1czXkAM/5ARkegWxQhy3YCDSTytMvl6', 'Auditor General / Viewer', 'viewer@aicte.gov.in', 'viewer')
ON CONFLICT (username) DO UPDATE 
SET password_hash = EXCLUDED.password_hash;

-- Reset sequence for users table
SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));

-- --------------------------------------------------------------------
-- 3. All 23 IITs (Indian Institutes of Technology)
-- --------------------------------------------------------------------
INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
VALUES
  ('AICTE-IIT-BOM-001', 'Indian Institute of Technology Bombay', 'Powai, Mumbai', 'Maharashtra', 'Mumbai', 'Prof. Shireesh Kedare', 'director@iitb.ac.in', '022-25722545', 'IIT'),
  ('AICTE-IIT-DEL-002', 'Indian Institute of Technology Delhi', 'Hauz Khas, New Delhi', 'Delhi', 'New Delhi', 'Prof. Rangan Banerjee', 'director@iitd.ac.in', '011-26591000', 'IIT'),
  ('AICTE-IIT-MAD-003', 'Indian Institute of Technology Madras', 'IIT P.O., Chennai', 'Tamil Nadu', 'Chennai', 'Prof. V. Kamakoti', 'director@iitm.ac.in', '044-22578000', 'IIT'),
  ('AICTE-IIT-KGP-004', 'Indian Institute of Technology Kharagpur', 'Kharagpur', 'West Bengal', 'Kharagpur', 'Prof. V. K. Tewari', 'director@iitkgp.ac.in', '03222-255221', 'IIT'),
  ('AICTE-IIT-KAN-005', 'Indian Institute of Technology Kanpur', 'Kalyanpur, Kanpur', 'Uttar Pradesh', 'Kanpur', 'Prof. Manindra Agrawal', 'director@iitk.ac.in', '0512-2590151', 'IIT'),
  ('AICTE-IIT-ROO-006', 'Indian Institute of Technology Roorkee', 'Roorkee, Haridwar District', 'Uttarakhand', 'Roorkee', 'Prof. K. K. Pant', 'director@iitr.ac.in', '01332-285500', 'IIT'),
  ('AICTE-IIT-GHY-007', 'Indian Institute of Technology Guwahati', 'Surjyamukhi, Guwahati', 'Assam', 'Guwahati', 'Prof. Devendra Jalihal', 'director@iitg.ac.in', '0361-2583000', 'IIT'),
  ('AICTE-IIT-HYD-008', 'Indian Institute of Technology Hyderabad', 'Kandi, Sangareddy', 'Telangana', 'Hyderabad', 'Prof. B. S. Murty', 'director@iith.ac.in', '040-23016002', 'IIT'),
  ('AICTE-IIT-IND-009', 'Indian Institute of Technology Indore', 'Khandwa Road, Simrol', 'Madhya Pradesh', 'Indore', 'Prof. Suhas Joshi', 'director@iiti.ac.in', '0731-6603555', 'IIT'),
  ('AICTE-IIT-BHU-010', 'Indian Institute of Technology (BHU) Varanasi', 'Banaras Hindu University Campus', 'Uttar Pradesh', 'Varanasi', 'Prof. Amit Patra', 'director@iitbhu.ac.in', '0542-2368106', 'IIT'),
  ('AICTE-IIT-ISM-011', 'Indian Institute of Technology (ISM) Dhanbad', 'Police Line Road, Sardar Patel Nagar', 'Jharkhand', 'Dhanbad', 'Prof. Sukumar Mishra', 'director@iitism.ac.in', '0326-2235001', 'IIT'),
  ('AICTE-IIT-BHI-012', 'Indian Institute of Technology Bhilai', 'GEC Campus, Sejbahar', 'Chhattisgarh', 'Bhilai', 'Prof. Rajiv Prakash', 'director@iitbhilai.ac.in', '0771-2973600', 'IIT'),
  ('AICTE-IIT-GOA-013', 'Indian Institute of Technology Goa', 'GEC Campus, Farmagudi, Ponda', 'Goa', 'Ponda', 'Prof. B. K. Mishra', 'director@iitgoa.ac.in', '0832-2490800', 'IIT'),
  ('AICTE-IIT-JAM-014', 'Indian Institute of Technology Jammu', 'Jagti, NH-44, PO Nagrota', 'Jammu and Kashmir', 'Jammu', 'Prof. Manoj Singh Gaur', 'director@iitjammu.ac.in', '0191-2570381', 'IIT'),
  ('AICTE-IIT-DHA-015', 'Indian Institute of Technology Dharwad', 'WALMI Campus, PB Road', 'Karnataka', 'Dharwad', 'Prof. Venkappayya Desai', 'director@iitdh.ac.in', '0836-2212839', 'IIT'),
  ('AICTE-IIT-PAL-016', 'Indian Institute of Technology Palakkad', 'Ahalia Integrated Campus, Kozhippara', 'Kerala', 'Palakkad', 'Prof. A. Seshadri Sekhar', 'director@iitpkd.ac.in', '04923-226300', 'IIT'),
  ('AICTE-IIT-TPR-017', 'Indian Institute of Technology Tirupati', 'Yerpedu Post', 'Andhra Pradesh', 'Tirupati', 'Prof. K. N. Satyanarayana', 'director@iittp.ac.in', '0877-2503531', 'IIT'),
  ('AICTE-IIT-PAT-018', 'Indian Institute of Technology Patna', 'Bihta, Patna', 'Bihar', 'Patna', 'Prof. T. N. Singh', 'director@iitp.ac.in', '06115-233002', 'IIT'),
  ('AICTE-IIT-GAN-019', 'Indian Institute of Technology Gandhinagar', 'Palaj, Gandhinagar', 'Gujarat', 'Gandhinagar', 'Prof. Rajat Moona', 'director@iitgn.ac.in', '079-23952000', 'IIT'),
  ('AICTE-IIT-ROP-020', 'Indian Institute of Technology Ropar', 'Rupnagar', 'Punjab', 'Ropar', 'Prof. Rajeev Ahuja', 'director@iitrpr.ac.in', '01881-227078', 'IIT'),
  ('AICTE-IIT-JOD-021', 'Indian Institute of Technology Jodhpur', 'NH 62, Nagaur Road, Karwar', 'Rajasthan', 'Jodhpur', 'Prof. Santanu Chaudhury', 'director@iitj.ac.in', '0291-2801000', 'IIT'),
  ('AICTE-IIT-MAN-022', 'Indian Institute of Technology Mandi', 'Kamand Campus, VPO Kamand', 'Himachal Pradesh', 'Mandi', 'Prof. Laxmidhar Behera', 'director@iitmandi.ac.in', '01905-267001', 'IIT'),
  ('AICTE-IIT-BBS-023', 'Indian Institute of Technology Bhubaneswar', 'Argul, Jatni', 'Odisha', 'Bhubaneswar', 'Prof. Shreepad Karmalkar', 'director@iitbbs.ac.in', '0674-7134444', 'IIT')
ON CONFLICT (aicte_id) DO UPDATE SET name = EXCLUDED.name, state = EXCLUDED.state, city = EXCLUDED.city;

-- --------------------------------------------------------------------
-- 4. All 31 NITs (National Institutes of Technology)
-- --------------------------------------------------------------------
INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
VALUES
  ('AICTE-NIT-TRC-001', 'National Institute of Technology Tiruchirappalli', 'Tanjore Main Road, National Highway 67', 'Tamil Nadu', 'Tiruchirappalli', 'Dr. G. Aghila', 'director@nitt.edu', '0431-2503002', 'NIT'),
  ('AICTE-NIT-SUR-002', 'National Institute of Technology Karnataka, Surathkal', 'NH 66, Srinivasnagar', 'Karnataka', 'Mangaluru', 'Prof. B. Ravi', 'director@nitk.edu.in', '0824-2474000', 'NIT'),
  ('AICTE-NIT-WAR-003', 'National Institute of Technology Warangal', 'Fathimanagar, Kazipet', 'Telangana', 'Warangal', 'Prof. Bidyadhar Subudhi', 'director@nitw.ac.in', '0870-2459191', 'NIT'),
  ('AICTE-NIT-ROU-004', 'National Institute of Technology Rourkela', 'Sector 1, Rourkela', 'Odisha', 'Rourkela', 'Prof. K. Umamaheshwar Rao', 'director@nitrkl.ac.in', '0661-2462001', 'NIT'),
  ('AICTE-NIT-CAL-005', 'National Institute of Technology Calicut', 'NIT Campus P.O.', 'Kerala', 'Kozhikode', 'Prof. Prasad Krishna', 'director@nitc.ac.in', '0495-2286100', 'NIT'),
  ('AICTE-NIT-MNN-006', 'Motilal Nehru National Institute of Technology Allahabad', 'Teliarganj, Prayagraj', 'Uttar Pradesh', 'Prayagraj', 'Prof. Rama Shanker Verma', 'director@mnnit.ac.in', '0532-2545404', 'NIT'),
  ('AICTE-NIT-VNIT-007', 'Visvesvaraya National Institute of Technology Nagpur', 'South Ambazari Road', 'Maharashtra', 'Nagpur', 'Prof. Pramod M. Padole', 'director@vnit.ac.in', '0712-2801363', 'NIT'),
  ('AICTE-NIT-MNIT-008', 'Malaviya National Institute of Technology Jaipur', 'Jawahar Lal Nehru Marg', 'Rajasthan', 'Jaipur', 'Prof. N. P. Padhy', 'director@mnit.ac.in', '0141-2529087', 'NIT'),
  ('AICTE-NIT-MAN-009', 'Maulana Azad National Institute of Technology Bhopal', 'Link Road Number 3', 'Madhya Pradesh', 'Bhopal', 'Prof. Karunesh Kumar Shukla', 'director@manit.ac.in', '0755-4051000', 'NIT'),
  ('AICTE-NIT-KUR-010', 'National Institute of Technology Kurukshetra', 'Thanesar', 'Haryana', 'Kurukshetra', 'Prof. B. V. Ramana Reddy', 'director@nitkkr.ac.in', '01744-233208', 'NIT'),
  ('AICTE-NIT-DGP-011', 'National Institute of Technology Durgapur', 'Mahatma Gandhi Avenue', 'West Bengal', 'Durgapur', 'Prof. Arvind Choubey', 'director@nitdgp.ac.in', '0343-2754000', 'NIT'),
  ('AICTE-NIT-JAL-012', 'Dr. B. R. Ambedkar National Institute of Technology Jalandhar', 'GT Road, Amritsar Bypass', 'Punjab', 'Jalandhar', 'Prof. Binod Kumar Kanaujia', 'director@nitj.ac.in', '0181-2690301', 'NIT'),
  ('AICTE-NIT-JSH-013', 'National Institute of Technology Jamshedpur', 'Adityapur', 'Jharkhand', 'Jamshedpur', 'Prof. Goutam Sutradhar', 'director@nitjsr.ac.in', '0657-2373407', 'NIT'),
  ('AICTE-NIT-PAT-014', 'National Institute of Technology Patna', 'Ashok Rajpath', 'Bihar', 'Patna', 'Prof. P. K. Jain', 'director@nitp.ac.in', '0612-2371715', 'NIT'),
  ('AICTE-NIT-RAI-015', 'National Institute of Technology Raipur', 'GE Road', 'Chhattisgarh', 'Raipur', 'Prof. N. V. Ramana Rao', 'director@nitrr.ac.in', '0771-2254200', 'NIT'),
  ('AICTE-NIT-SIL-016', 'National Institute of Technology Silchar', 'Silchar', 'Assam', 'Silchar', 'Prof. Dilip Kumar Baidya', 'director@nits.ac.in', '03842-224879', 'NIT'),
  ('AICTE-NIT-HAM-017', 'National Institute of Technology Hamirpur', 'Anu', 'Himachal Pradesh', 'Hamirpur', 'Prof. H. M. Suryawanshi', 'director@nith.ac.in', '01972-254011', 'NIT'),
  ('AICTE-NIT-SRI-018', 'National Institute of Technology Srinagar', 'Hazratbal', 'Jammu and Kashmir', 'Srinagar', 'Prof. Sudhakar Yedla', 'director@nitsri.net', '0194-2422032', 'NIT'),
  ('AICTE-NIT-AGA-019', 'National Institute of Technology Agartala', 'Jirania', 'Tripura', 'Agartala', 'Prof. S. K. Patra', 'director@nita.ac.in', '0381-2546363', 'NIT'),
  ('AICTE-NIT-MEG-020', 'National Institute of Technology Meghalaya', 'Bijni Complex, Laitumkhrah', 'Meghalaya', 'Shillong', 'Prof. Pinakeswar Mahanta', 'director@nitm.ac.in', '0364-2501215', 'NIT'),
  ('AICTE-NIT-MANI-021', 'National Institute of Technology Manipur', 'Langol', 'Manipur', 'Imphal', 'Prof. D. C. Saxena', 'director@nitmanipur.ac.in', '0385-2445812', 'NIT'),
  ('AICTE-NIT-NAG-022', 'National Institute of Technology Nagaland', 'Chumukedima', 'Nagaland', 'Dimapur', 'Prof. S. Venugopal', 'director@nitnagaland.ac.in', '03862-241801', 'NIT'),
  ('AICTE-NIT-MIZ-023', 'National Institute of Technology Mizoram', 'Chaltlang', 'Mizoram', 'Aizawl', 'Prof. S. Sundar', 'director@nitmz.ac.in', '0389-2391234', 'NIT'),
  ('AICTE-NIT-ARU-024', 'National Institute of Technology Arunachal Pradesh', 'Jote', 'Arunachal Pradesh', 'Papum Pare', 'Prof. Mohan Shanker', 'director@nitap.ac.in', '0360-2954549', 'NIT'),
  ('AICTE-NIT-SIK-025', 'National Institute of Technology Sikkim', 'Ravangla', 'Sikkim', 'South Sikkim', 'Prof. M. C. Govil', 'director@nitsikkim.ac.in', '03595-260042', 'NIT'),
  ('AICTE-NIT-GOA-026', 'National Institute of Technology Goa', 'Cuncolim', 'Goa', 'South Goa', 'Prof. O. R. Jaiswal', 'director@nitgoa.ac.in', '0832-2404200', 'NIT'),
  ('AICTE-NIT-PY-027', 'National Institute of Technology Puducherry', 'Thiruvettakudy, Karaikal', 'Puducherry', 'Karaikal', 'Prof. Usha Natesan', 'director@nitpy.ac.in', '04368-262901', 'NIT'),
  ('AICTE-NIT-UK-028', 'National Institute of Technology Uttarakhand', 'Srinagar (Garhwal)', 'Uttarakhand', 'Pauri Garhwal', 'Prof. Lalit Kumar Awasthi', 'director@nituk.ac.in', '01346-257400', 'NIT'),
  ('AICTE-NIT-DEL-029', 'National Institute of Technology Delhi', 'Plot No. FA7, Zone P1, GT Karnal Road', 'Delhi', 'New Delhi', 'Prof. Ajay K. Sharma', 'director@nitdelhi.ac.in', '011-33861000', 'NIT'),
  ('AICTE-NIT-AP-030', 'National Institute of Technology Andhra Pradesh', 'Tadepalligudem', 'Andhra Pradesh', 'West Godavari', 'Prof. C. S. P. Rao', 'director@nitandhra.ac.in', '08818-284710', 'NIT'),
  ('AICTE-IIEST-SHI-031', 'Indian Institute of Engineering Science and Technology Shibpur', 'PO Botanic Garden, Shalimar', 'West Bengal', 'Howrah', 'Prof. Parthasarathi Chakrabarti', 'director@iiests.ac.in', '033-26684561', 'NIT')
ON CONFLICT (aicte_id) DO UPDATE SET name = EXCLUDED.name, state = EXCLUDED.state, city = EXCLUDED.city;

-- --------------------------------------------------------------------
-- 5. Primary Mandatory Regulatory FDRs for all IITs & NITs (₹5,00,00,000)
-- --------------------------------------------------------------------
INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate, deposit_type, purpose, status, verification_status, submitted_by)
SELECT 
  id,
  'FDR-' || UPPER(SUBSTRING(aicte_id FROM 11 FOR 3)) || '-2024-001',
  'State Bank of India',
  city || ' Main Institutional Branch',
  'SBIN' || LPAD(CAST(id * 137 AS VARCHAR), 8, '0'),
  5000000.00,
  CURRENT_DATE - INTERVAL '365 days',
  CASE 
    WHEN id % 7 = 0 THEN CURRENT_DATE + INTERVAL '12 days'   -- Expiring Soon (<15d)
    WHEN id % 5 = 0 THEN CURRENT_DATE + INTERVAL '24 days'   -- Expiring Soon (<30d)
    WHEN id % 3 = 0 THEN CURRENT_DATE - INTERVAL '40 days'   -- Matured without renewal
    ELSE CURRENT_DATE + INTERVAL '220 days'                   -- Active & Compliant
  END,
  7.10,
  'Fixed Deposit Receipt',
  'AICTE Mandatory Regulatory Reserve (5 Crore Guarantee)',
  CASE 
    WHEN id % 7 = 0 THEN 'Expiring Soon'
    WHEN id % 5 = 0 THEN 'Expiring Soon'
    WHEN id % 3 = 0 THEN 'Matured'
    ELSE 'Active'
  END,
  CASE 
    WHEN id % 8 = 0 THEN 'Discrepancy'
    WHEN id % 4 = 0 THEN 'Pending'
    ELSE 'Verified'
  END,
  1
FROM institutions
WHERE institution_type IN ('IIT', 'NIT')
ON CONFLICT (fdr_number) DO NOTHING;

-- --------------------------------------------------------------------
-- 6. Secondary PG / Supercomputer Escrow FDRs for IITs (₹2,50,00,000)
-- --------------------------------------------------------------------
INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate, deposit_type, purpose, status, verification_status, submitted_by)
SELECT 
  id,
  'FDR-' || UPPER(SUBSTRING(aicte_id FROM 11 FOR 3)) || '-PG-2024-002',
  'Punjab National Bank',
  city || ' University Branch',
  'PNBN' || LPAD(CAST(id * 243 AS VARCHAR), 8, '0'),
  2500000.00,
  CURRENT_DATE - INTERVAL '180 days',
  CURRENT_DATE + INTERVAL '360 days',
  7.25,
  'Bank Guarantee',
  'AICTE Postgraduate Intake & Doctoral Fellowship Escrow',
  'Active',
  'Verified',
  1
FROM institutions
WHERE institution_type = 'IIT'
ON CONFLICT (fdr_number) DO NOTHING;

-- --------------------------------------------------------------------
-- 7. Automatically Populate Regulatory Compliance Alerts
-- --------------------------------------------------------------------

-- 1. Urgent Maturity Warnings (<15 days)
INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date, is_resolved)
SELECT 
  f.id,
  f.institution_id,
  'Maturity',
  'Critical',
  'Mandatory Regulatory FDR ' || f.fdr_number || ' for ' || i.name || ' is expiring in less than 15 days. Immediate renewal obligation required.',
  f.maturity_date,
  0
FROM fdrs f
JOIN institutions i ON f.institution_id = i.id
WHERE f.status = 'Expiring Soon' AND f.maturity_date <= CURRENT_DATE + INTERVAL '15 days';

-- 2. Matured Instruments requiring Renewal / Council Discharge
INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date, is_resolved)
SELECT 
  f.id,
  f.institution_id,
  'Renewal',
  'High',
  'Instrument ' || f.fdr_number || ' (' || i.name || ') reached maturity. Council Lien discharge or replacement FDR required.',
  f.maturity_date,
  0
FROM fdrs f
JOIN institutions i ON f.institution_id = i.id
WHERE f.status = 'Matured';

-- 3. Core Banking Discrepancies
INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date, is_resolved)
SELECT 
  f.id,
  f.institution_id,
  'Discrepancy',
  'Critical',
  'Bank discrepancy flagged for ' || f.fdr_number || ' at ' || i.name || '. Declared amount does not match core banking verification API.',
  CURRENT_DATE + INTERVAL '5 days',
  0
FROM fdrs f
JOIN institutions i ON f.institution_id = i.id
WHERE f.verification_status = 'Discrepancy';
