import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { DatabaseSync } = require('node:sqlite');

export interface DBStatement {
  all(...params: any[]): any[];
  get(...params: any[]): any;
  run(...params: any[]): { changes: number; lastInsertRowid: number };
}

export interface DBInterface {
  isPostgres: boolean;
  exec(sql: string): void;
  prepare(sql: string): DBStatement;
  pragma?(cmd: string): void;
}

let dbInstance: DBInterface | null = null;

// Synchronous bridge database proxy supporting both SQLite and PostgreSQL
export function createDB(): DBInterface {
  const dbUrl = process.env.DATABASE_URL;

  // Embedded SQLite driver (supporting ephemeral /tmp on Vercel Serverless)
  const DB_PATH = process.env.VERCEL
    ? path.join('/tmp', 'aicte_fdr.db')
    : path.join(__dirname, '../../data/aicte_fdr.db');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (process.env.VERCEL) {
    const bundledDb = path.join(__dirname, '../../data/aicte_fdr.db');
    if (fs.existsSync(bundledDb) && !fs.existsSync(DB_PATH)) {
      try {
        fs.copyFileSync(bundledDb, DB_PATH);
      } catch (e) {
        console.warn('Could not copy bundled SQLite database to /tmp', e);
      }
    }
  }

  const sqlite = new DatabaseSync(DB_PATH);

  return {
    isPostgres: false,
    exec(sql: string) {
      sqlite.exec(sql);
    },
    prepare(sql: string): DBStatement {
      const stmt = sqlite.prepare(sql);
      return {
        all(...params: any[]) {
          return stmt.all(...params);
        },
        get(...params: any[]) {
          return stmt.get(...params);
        },
        run(...params: any[]) {
          const res = stmt.run(...params);
          return {
            changes: res.changes,
            lastInsertRowid: res.lastInsertRowid,
          };
        },
      };
    },
    pragma(cmd: string) {
      sqlite.exec(`PRAGMA ${cmd};`);
    },
  };
}

export const db = createDB();

export function initializeDatabase() {
  db.pragma?.('journal_mode = WAL');
  db.pragma?.('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      institution_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aicte_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      state TEXT,
      city TEXT,
      contact_person TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      institution_type TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fdrs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL,
      fdr_number TEXT UNIQUE NOT NULL,
      bank_name TEXT NOT NULL,
      bank_branch TEXT,
      account_number TEXT,
      deposit_amount REAL NOT NULL,
      currency TEXT DEFAULT 'INR',
      issue_date TEXT NOT NULL,
      maturity_date TEXT NOT NULL,
      interest_rate REAL,
      deposit_type TEXT DEFAULT 'FDR',
      purpose TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      verification_status TEXT DEFAULT 'Unverified',
      verification_notes TEXT,
      verified_by INTEGER,
      verified_at TEXT,
      submitted_by INTEGER,
      submitted_at TEXT DEFAULT (datetime('now')),
      last_updated_by INTEGER,
      last_updated_at TEXT DEFAULT (datetime('now')),
      remarks TEXT,
      is_renewal INTEGER DEFAULT 0,
      parent_fdr_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS fdr_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fdr_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      uploaded_by INTEGER,
      uploaded_at TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fdr_id INTEGER NOT NULL,
      institution_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT DEFAULT 'Medium',
      message TEXT NOT NULL,
      due_date TEXT,
      is_resolved INTEGER DEFAULT 0,
      resolved_by INTEGER,
      resolved_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS release_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fdr_id INTEGER NOT NULL,
      institution_id INTEGER NOT NULL,
      request_type TEXT DEFAULT 'Release',
      reason TEXT NOT NULL,
      requested_by INTEGER NOT NULL,
      requested_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'Pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      approved_by INTEGER,
      approved_at TEXT,
      remarks TEXT
    );

    CREATE TABLE IF NOT EXISTS institution_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aicte_id TEXT NOT NULL,
      name TEXT NOT NULL,
      institution_type TEXT DEFAULT 'Engineering',
      state TEXT,
      city TEXT,
      address TEXT,
      contact_person TEXT,
      contact_email TEXT NOT NULL,
      contact_phone TEXT,
      justification TEXT,
      status TEXT DEFAULT 'Pending',
      requested_at TEXT DEFAULT (datetime('now')),
      reviewed_by INTEGER,
      reviewed_at TEXT,
      remarks TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      changed_by INTEGER,
      changed_at TEXT DEFAULT (datetime('now')),
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      notes TEXT
    );
  `);

  console.log('✅ Database schema initialized successfully');

  // Auto-seed default accounts and sample data if users table is empty
  try {
    const userRow = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any;
    if (!userRow || userRow.cnt === 0) {
      console.log('🌱 No users found in database. Auto-seeding default credentials...');
      const adminHash = '$2a$10$qDZDEZaL57uC6vGtPwmwXurLJPn/Zz8pfmJWu/oUnrV5DUEm9QYRa'; // admin123
      const officerHash = '$2a$10$uzbVo9BNwEYt.j0hSP/S/.XEnWxJvZxHJgv.jWBV/g22Rxk5xGxnG'; // officer123
      const instHash = '$2a$10$qDZDEZaL57uC6vGtPwmwXurLJPn/Zz8pfmJWu/oUnrV5DUEm9QYRa'; // inst123
      const viewerHash = '$2a$10$QLszhaR6SX6rA1wyDn5w9.1czXkAM/5ARkegWxQhy3YCDSTytMvl6'; // viewer123

      db.prepare(`
        INSERT INTO users (id, username, password_hash, full_name, email, role, institution_id)
        VALUES (1, 'admin', ?, 'System Administrator', 'admin@aicte.gov.in', 'admin', NULL)
      `).run(adminHash);

      db.prepare(`
        INSERT INTO users (id, username, password_hash, full_name, email, role, institution_id)
        VALUES (2, 'officer1', ?, 'Rajesh Verma (Bureau Officer)', 'r.verma@aicte.gov.in', 'bureau_officer', NULL)
      `).run(officerHash);

      db.prepare(`
        INSERT INTO users (id, username, password_hash, full_name, email, role, institution_id)
        VALUES (3, 'inst_user1', ?, 'MIT College Admin', 'admin@mit.edu.in', 'institution_user', 1)
      `).run(instHash);

      db.prepare(`
        INSERT INTO users (id, username, password_hash, full_name, email, role, institution_id)
        VALUES (4, 'viewer1', ?, 'Auditor General / Viewer', 'viewer@aicte.gov.in', 'viewer', NULL)
      `).run(viewerHash);

      // Also seed institutions and FDRs if institutions table is empty
      const instRow = db.prepare('SELECT COUNT(*) as cnt FROM institutions').get() as any;
      if (!instRow || instRow.cnt === 0) {
        const institutions = [
          ['AICTE-IIT-BOM-001', 'Indian Institute of Technology Bombay', 'Powai, Mumbai', 'Maharashtra', 'Mumbai', 'Prof. Shireesh Kedare', 'director@iitb.ac.in', '022-25722545', 'IIT'],
          ['AICTE-IIT-DEL-002', 'Indian Institute of Technology Delhi', 'Hauz Khas, New Delhi', 'Delhi', 'New Delhi', 'Prof. Rangan Banerjee', 'director@iitd.ac.in', '011-26591000', 'IIT'],
          ['AICTE-IIT-MAD-003', 'Indian Institute of Technology Madras', 'IIT P.O., Chennai', 'Tamil Nadu', 'Chennai', 'Prof. V. Kamakoti', 'director@iitm.ac.in', '044-22578000', 'IIT'],
          ['AICTE-NIT-TRC-001', 'National Institute of Technology Tiruchirappalli', 'Tanjore Main Road', 'Tamil Nadu', 'Tiruchirappalli', 'Dr. G. Aghila', 'director@nitt.edu', '0431-2503002', 'NIT'],
          ['AICTE-NIT-SUR-002', 'National Institute of Technology Karnataka, Surathkal', 'NH 66, Srinivasnagar', 'Karnataka', 'Mangaluru', 'Prof. B. Ravi', 'director@nitk.edu.in', '0824-2474000', 'NIT'],
          ['AICTE-2024-MH-001', 'Maharashtra Institute of Technology, Pune', 'S.No. 124, Paud Road, Kothrud', 'Maharashtra', 'Pune', 'Dr. Ramesh Sharma', 'principal@mit.edu.in', '020-25465050', 'Engineering']
        ];
        for (const inst of institutions) {
          db.prepare(`
            INSERT INTO institutions (aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(...inst);
        }

        const fdrs = [
          [1, 'FDR-IITB-2024-001', 'State Bank of India', 'Powai Institutional Branch', 'SBIN001234567', 50000000, '2023-10-01', '2026-10-01', 7.1, 'FDR', 'AICTE Mandatory Regulatory Reserve (5 Crore Guarantee)', 'Active', 'Verified', 1],
          [2, 'FDR-IITD-2024-001', 'State Bank of India', 'Hauz Khas Branch', 'SBIN002345678', 50000000, '2024-01-15', '2026-11-10', 7.1, 'FDR', 'AICTE Mandatory Regulatory Reserve', 'Active', 'Verified', 1],
          [3, 'FDR-IITM-2024-001', 'State Bank of India', 'IIT Madras Branch', 'SBIN003456789', 50000000, '2023-11-20', '2026-11-05', 7.1, 'FDR', 'AICTE Mandatory Regulatory Reserve', 'Active', 'Verified', 1],
          [4, 'FDR-NITT-2024-001', 'State Bank of India', 'NIT Trichy Branch', 'SBIN004567890', 50000000, '2023-05-10', '2026-10-30', 7.1, 'FDR', 'AICTE Mandatory Regulatory Reserve', 'Expiring Soon', 'Verified', 1],
          [5, 'FDR-NITK-2024-001', 'State Bank of India', 'Surathkal Branch', 'SBIN005678901', 50000000, '2023-04-12', '2026-10-20', 7.1, 'FDR', 'AICTE Mandatory Regulatory Reserve', 'Expiring Soon', 'Discrepancy', 1],
          [6, 'FDR-MIT-2024-001', 'Bank of Baroda', 'Kothrud Branch', 'BOB001234567', 5000000, '2023-01-10', '2026-09-01', 6.8, 'Security Deposit', 'Extension of Approval', 'Matured', 'Verified', 1]
        ];
        for (const fdr of fdrs) {
          db.prepare(`
            INSERT INTO fdrs (institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount, issue_date, maturity_date, interest_rate, deposit_type, purpose, status, verification_status, submitted_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(...fdr);
        }

        // Seed initial alerts
        db.prepare(`
          INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
          VALUES (4, 4, 'Maturity', 'Critical', 'Mandatory Regulatory FDR FDR-NITT-2024-001 is expiring in less than 15 days.', '2026-10-30')
        `).run();
        db.prepare(`
          INSERT INTO alerts (fdr_id, institution_id, alert_type, severity, message, due_date)
          VALUES (5, 5, 'Discrepancy', 'Critical', 'Bank discrepancy flagged for FDR-NITK-2024-001: Declared amount does not match core verification.', '2026-10-20')
        `).run();
      }
      console.log('✅ Auto-seed completed successfully');
    }
  } catch (seedErr) {
    console.warn('Auto-seed check error:', seedErr);
  }
}
