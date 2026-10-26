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
  pgPool?: Pool | null;
}

let pgPool: Pool | null = null;
const dbUrl = process.env.DATABASE_URL;

if (dbUrl) {
  try {
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 7000,
    });
    console.log('✅ PostgreSQL / Supabase Pool connected for cloud persistence');
  } catch (poolErr: any) {
    console.warn('⚠️ Cloud PostgreSQL pool initialization notice:', poolErr.message);
  }
}

// Synchronous bridge database proxy supporting both SQLite and PostgreSQL replication
export function createDB(): DBInterface {
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
    isPostgres: Boolean(pgPool),
    pgPool,
    exec(sql: string) {
      sqlite.exec(sql);
      if (pgPool && !sql.toUpperCase().includes('PRAGMA') && !sql.toUpperCase().includes('AUTOINCREMENT')) {
        pgPool.query(sql).catch((err: any) => {
          // Non-blocking background sync
        });
      }
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

          // Replicate write mutations (INSERT, UPDATE, DELETE) to Cloud Supabase
          if (pgPool) {
            const upper = sql.trim().toUpperCase();
            if (upper.startsWith('INSERT') || upper.startsWith('UPDATE') || upper.startsWith('DELETE')) {
              try {
                let idx = 1;
                const pgSql = sql.replace(/\?/g, () => '$' + (idx++));
                // Convert Date objects or boolean numbers if needed
                const sanitizedParams = params.map(p => (p === undefined ? null : p));
                pgPool.query(pgSql, sanitizedParams).catch((err: any) => {
                  console.warn('Supabase cloud replication note:', err.message);
                });
              } catch (replErr: any) {
                console.warn('Supabase replication format note:', replErr.message);
              }
            }
          }

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

// Cloud hydration: Sync latest records from Supabase PostgreSQL into local SQLite
export async function syncFromSupabase() {
  if (!pgPool) return;
  try {
    console.log('🔄 Checking Supabase PostgreSQL cloud sync...');

    // 1. Sync institutions
    const pgInsts = await pgPool.query('SELECT * FROM institutions ORDER BY id ASC');
    if (pgInsts.rows.length > 0) {
      for (const inst of pgInsts.rows) {
        try {
          db.prepare(`
            INSERT OR IGNORE INTO institutions (id, aicte_id, name, address, state, city, contact_person, contact_email, contact_phone, institution_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            inst.id,
            inst.aicte_id,
            inst.name,
            inst.address || '',
            inst.state || '',
            inst.city || '',
            inst.contact_person || '',
            inst.contact_email || '',
            inst.contact_phone || '',
            inst.institution_type || 'Technical University'
          );
        } catch (_) {}
      }
      console.log(`✅ Synced ${pgInsts.rows.length} institutions from Supabase cloud`);
    }

    // 2. Sync FDRs
    const pgFdrs = await pgPool.query('SELECT * FROM fdrs ORDER BY id ASC');
    if (pgFdrs.rows.length > 0) {
      for (const f of pgFdrs.rows) {
        try {
          db.prepare(`
            INSERT OR REPLACE INTO fdrs (
              id, institution_id, fdr_number, bank_name, bank_branch, account_number, deposit_amount,
              currency, issue_date, maturity_date, interest_rate, deposit_type, purpose, status,
              verification_status, verification_notes, verified_by, verified_at, submitted_by,
              submitted_at, last_updated_by, last_updated_at, remarks, is_renewal, parent_fdr_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            f.id,
            f.institution_id,
            f.fdr_number,
            f.bank_name,
            f.bank_branch || '',
            f.account_number || '',
            parseFloat(f.deposit_amount) || 0,
            f.currency || 'INR',
            f.issue_date instanceof Date ? f.issue_date.toISOString().split('T')[0] : (f.issue_date || '2024-01-01'),
            f.maturity_date instanceof Date ? f.maturity_date.toISOString().split('T')[0] : (f.maturity_date || '2027-01-01'),
            parseFloat(f.interest_rate) || 7.0,
            f.deposit_type || 'FDR',
            f.purpose || '',
            f.status || 'Active',
            f.verification_status || 'Verified',
            f.verification_notes || '',
            f.verified_by || null,
            f.verified_at ? String(f.verified_at) : null,
            f.submitted_by || 1,
            f.submitted_at ? String(f.submitted_at) : null,
            f.last_updated_by || null,
            f.last_updated_at ? String(f.last_updated_at) : null,
            f.remarks || '',
            f.is_renewal ? 1 : 0,
            f.parent_fdr_id || null
          );
        } catch (_) {}
      }
      console.log(`✅ Synced ${pgFdrs.rows.length} FDRs from Supabase cloud`);
    }
  } catch (syncErr: any) {
    console.warn('⚠️ Supabase cloud sync non-blocking notice:', syncErr.message);
  }
}

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
      sha256_hash TEXT,
      verified_on_chain INTEGER DEFAULT 1,
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

    CREATE TABLE IF NOT EXISTS statutory_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fdr_id INTEGER NOT NULL,
      institution_id INTEGER NOT NULL,
      certificate_type TEXT NOT NULL,
      certificate_number TEXT UNIQUE NOT NULL,
      qr_verification_code TEXT UNIQUE NOT NULL,
      dsc_officer_name TEXT NOT NULL,
      dsc_officer_designation TEXT NOT NULL,
      dsc_timestamp TEXT DEFAULT (datetime('now')),
      pdf_payload TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lien_invocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fdr_id INTEGER NOT NULL,
      institution_id INTEGER NOT NULL,
      case_reference_number TEXT UNIQUE NOT NULL,
      invocation_amount REAL NOT NULL,
      section_invoked TEXT DEFAULT 'Section 10(k) AICTE Act, 1987',
      stage TEXT NOT NULL DEFAULT 'INITIATED',
      initiated_by INTEGER NOT NULL,
      initiated_at TEXT DEFAULT (datetime('now')),
      show_cause_notice_ref TEXT,
      show_cause_date TEXT,
      show_cause_due_date TEXT,
      institution_response_ref TEXT,
      institution_response_summary TEXT,
      bank_demand_letter_ref TEXT,
      bank_demand_sent_at TEXT,
      utr_number TEXT,
      remitted_amount REAL,
      remitted_at TEXT,
      forfeiture_order_doc_path TEXT,
      remarks TEXT
    );

    CREATE TABLE IF NOT EXISTS bulk_ingestion_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_reference TEXT UNIQUE NOT NULL,
      total_rows INTEGER NOT NULL,
      successful_rows INTEGER DEFAULT 0,
      failed_rows INTEGER DEFAULT 0,
      validation_errors TEXT,
      uploaded_by INTEGER NOT NULL,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS release_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fdr_id INTEGER NOT NULL,
      institution_id INTEGER NOT NULL,
      request_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      requested_by INTEGER NOT NULL,
      requested_at TEXT DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'Submitted',
      review_stage TEXT NOT NULL DEFAULT 'Dealing_Officer',
      dealing_officer_id INTEGER,
      dealing_officer_remarks TEXT,
      dealing_officer_at TEXT,
      finance_officer_id INTEGER,
      finance_officer_remarks TEXT,
      finance_officer_at TEXT,
      director_id INTEGER,
      director_remarks TEXT,
      director_at TEXT,
      statutory_order_number TEXT,
      noc_document_path TEXT,
      approved_by INTEGER,
      approved_at TEXT,
      rejection_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      fdr_id INTEGER,
      institution_id INTEGER,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      previous_state TEXT,
      new_state TEXT,
      ip_address TEXT,
      user_agent TEXT,
      timestamp TEXT DEFAULT (datetime('now'))
    );
  `);

  // Run cloud sync asynchronously
  if (pgPool) {
    syncFromSupabase().catch(err => {
      console.warn('Cloud sync initialization warning:', err);
    });
  }
}
