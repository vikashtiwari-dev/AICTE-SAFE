-- PostgreSQL Schema for AICTE Security Deposit & FDR Management Portal

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
  parent_fdr_id INTEGER REFERENCES fdrs(id)
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
  status VARCHAR(50) DEFAULT 'Pending',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMP,
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
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
  ip_address VARCHAR(50),
  notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fdrs_institution ON fdrs(institution_id);
CREATE INDEX IF NOT EXISTS idx_fdrs_maturity ON fdrs(maturity_date);
CREATE INDEX IF NOT EXISTS idx_fdrs_status ON fdrs(status);
CREATE INDEX IF NOT EXISTS idx_alerts_institution ON alerts(institution_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts(is_resolved);
