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

  // Embedded SQLite driver
  const DB_PATH = path.join(__dirname, '../../data/aicte_fdr.db');
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
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
}
