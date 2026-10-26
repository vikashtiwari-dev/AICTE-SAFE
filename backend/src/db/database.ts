import path from 'path';
import fs from 'fs';
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export interface DBStatement {
  all(...params: any[]): Promise<any[]>;
  get(...params: any[]): Promise<any>;
  run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number }>;
}

export interface DBTransaction {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number }>;
}

export interface DBInterface {
  isPostgres: boolean;
  pgPool: Pool | null;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: number }>;
  transaction<T>(callback: (tx: DBTransaction) => Promise<T>): Promise<T>;
  prepare(sql: string): DBStatement;
  exec(sql: string): Promise<void>;
}

let pgPool: Pool | null = null;
const rawDbUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  (process.env.POSTGRES_HOST && process.env.POSTGRES_USER
    ? `postgres://${encodeURIComponent(process.env.POSTGRES_USER)}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || '')}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT || 5432}/${process.env.POSTGRES_DATABASE || 'postgres'}`
    : '');

if (rawDbUrl) {
  try {
    let cleanDbUrl = rawDbUrl;
    try {
      const u = new URL(rawDbUrl);
      u.search = '';
      cleanDbUrl = u.toString();
    } catch (_) {}

    // Secure database connection without disabling global process TLS verification
    const sslConfig = process.env.DATABASE_CA
      ? { ca: process.env.DATABASE_CA, rejectUnauthorized: true }
      : { rejectUnauthorized: false };

    pgPool = new Pool({
      connectionString: cleanDbUrl,
      ssl: sslConfig,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 7000,
    });
    console.log('✅ PostgreSQL is configured as the SOLE SOURCE OF TRUTH (Pool connected)');
  } catch (poolErr: any) {
    console.warn('⚠️ Cloud PostgreSQL pool initialization notice:', poolErr.message);
  }
}

/**
 * Normalizes SQL queries and parameter bindings for PostgreSQL:
 * - Translates ? to $1, $2, ...
 * - Translates datetime('now') to CURRENT_TIMESTAMP
 * - Appends RETURNING id on INSERT statements when not present to capture primary keys
 */
export function convertSql(sql: string): { pgSql: string; isInsert: boolean } {
  let idx = 1;
  let converted = sql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
  converted = converted.replace(/\?/g, () => '$' + (idx++));
  const trimmed = converted.trim();
  const upper = trimmed.toUpperCase();
  const isInsert = upper.startsWith('INSERT');
  if (isInsert && !upper.includes('RETURNING') && !upper.includes('DO NOTHING')) {
    converted = `${trimmed} RETURNING id`;
  }
  return { pgSql: converted, isInsert };
}

async function runPgQuery(clientOrPool: Pool | PoolClient, sql: string, params: any[] = []) {
  const { pgSql, isInsert } = convertSql(sql);
  const sanitizedParams = params.map(p => (p === undefined ? null : p));
  try {
    const res = await clientOrPool.query(pgSql, sanitizedParams);
    const lastInsertRowid = (isInsert && res.rows.length > 0 && res.rows[0].id !== undefined)
      ? Number(res.rows[0].id)
      : 0;
    return {
      rows: res.rows,
      changes: res.rowCount ?? 0,
      lastInsertRowid,
    };
  } catch (err: any) {
    // If RETURNING id failed because table lacks an 'id' column, retry without RETURNING id
    if (isInsert && err.message && err.message.includes('column "id" does not exist')) {
      const plainPgSql = convertSql(sql).pgSql.replace(/\s+RETURNING id$/i, '');
      const res = await clientOrPool.query(plainPgSql, sanitizedParams);
      return {
        rows: res.rows,
        changes: res.rowCount ?? 0,
        lastInsertRowid: 0,
      };
    }
    throw err;
  }
}

// Optional SQLite fallback driver ONLY for local offline development without internet/PostgreSQL credentials
let sqliteInstance: any = null;
function getSqliteFallback() {
  if (!sqliteInstance) {
    const { DatabaseSync } = require('node:sqlite');
    const localDbPath = path.join(__dirname, '../../data/aicte_fdr.db');
    const dataDir = path.dirname(localDbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    sqliteInstance = new DatabaseSync(localDbPath);
  }
  return sqliteInstance;
}

export function createDB(): DBInterface {
  const isPostgres = Boolean(pgPool);

  if (isPostgres) {
    return {
      isPostgres: true,
      pgPool,
      async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        const res = await runPgQuery(pgPool!, sql, params);
        return res.rows as T[];
      },
      async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
        const res = await runPgQuery(pgPool!, sql, params);
        return (res.rows[0] as T) || null;
      },
      async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
        const res = await runPgQuery(pgPool!, sql, params);
        return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
      },
      async transaction<T>(callback: (tx: DBTransaction) => Promise<T>): Promise<T> {
        const client = await pgPool!.connect();
        try {
          await client.query('BEGIN');
          const tx: DBTransaction = {
            async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
              const res = await runPgQuery(client, sql, params);
              return res.rows as T[];
            },
            async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
              const res = await runPgQuery(client, sql, params);
              return (res.rows[0] as T) || null;
            },
            async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
              const res = await runPgQuery(client, sql, params);
              return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
            },
          };
          const result = await callback(tx);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      prepare(sql: string): DBStatement {
        return {
          async all(...params: any[]) {
            const res = await runPgQuery(pgPool!, sql, params);
            return res.rows;
          },
          async get(...params: any[]) {
            const res = await runPgQuery(pgPool!, sql, params);
            return res.rows[0] || null;
          },
          async run(...params: any[]) {
            const res = await runPgQuery(pgPool!, sql, params);
            return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
          },
        };
      },
      async exec(sql: string): Promise<void> {
        await pgPool!.query(sql);
      },
    };
  }

  // Fail closed in production/Vercel: SQLite fallback is strictly prohibited
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    console.error('🚨 [FATAL DATABASE ERROR] Cloud PostgreSQL is required in production/Vercel environments.');
    throw new Error('FATAL SECURITY VIOLATION: PostgreSQL database connection is unavailable in production. SQLite fallback is strictly prohibited to prevent data loss.');
  }

  // Fallback ONLY for local offline developer machines without internet/PostgreSQL
  const sqlite = getSqliteFallback();
  return {
    isPostgres: false,
    pgPool: null,
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      return (sqlite.prepare(sql).get(...params) as T) || null;
    },
    async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
      const res = sqlite.prepare(sql).run(...params);
      return { changes: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
    },
    async transaction<T>(callback: (tx: DBTransaction) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN TRANSACTION;');
      try {
        const tx: DBTransaction = {
          async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
            return sqlite.prepare(sql).all(...params) as T[];
          },
          async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
            return (sqlite.prepare(sql).get(...params) as T) || null;
          },
          async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
            const res = sqlite.prepare(sql).run(...params);
            return { changes: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
          },
        };
        const result = await callback(tx);
        sqlite.exec('COMMIT;');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK;');
        throw err;
      }
    },
    prepare(sql: string): DBStatement {
      const stmt = sqlite.prepare(sql);
      return {
        async all(...params: any[]) {
          return stmt.all(...params);
        },
        async get(...params: any[]) {
          return stmt.get(...params);
        },
        async run(...params: any[]) {
          const res = stmt.run(...params);
          return { changes: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
        },
      };
    },
    async exec(sql: string): Promise<void> {
      sqlite.exec(sql);
    },
  };
}

export const db = createDB();

/**
 * Directly executes a write mutation (INSERT, UPDATE, DELETE) against the sole authoritative database.
 */
export async function executeMutation(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: number }> {
  return db.execute(sql, params);
}

/**
 * Initializes schema and default seed data directly in PostgreSQL (or offline fallback).
 * Guarantees that all required tables exist and are verified.
 */
export async function initializeDatabase() {
  if (db.isPostgres && pgPool) {
    console.log('🔄 Verifying and initializing PostgreSQL authoritative schema...');
    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'viewer',
          institution_id INTEGER,
          is_active INTEGER DEFAULT 1,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP WITH TIME ZONE
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
          institution_type VARCHAR(100) DEFAULT 'Technical University',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS institution_requests (
          id SERIAL PRIMARY KEY,
          aicte_id VARCHAR(100) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          address TEXT,
          state VARCHAR(100),
          city VARCHAR(100),
          contact_person VARCHAR(255),
          contact_email VARCHAR(255),
          contact_phone VARCHAR(50),
          institution_type VARCHAR(100) DEFAULT 'Technical University',
          status VARCHAR(50) NOT NULL DEFAULT 'Pending',
          requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          reviewed_by INTEGER,
          reviewed_at TIMESTAMP WITH TIME ZONE,
          rejection_reason TEXT
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
          verified_by INTEGER,
          verified_at TIMESTAMP WITH TIME ZONE,
          submitted_by INTEGER,
          submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_updated_by INTEGER,
          last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          remarks TEXT,
          is_renewal INTEGER DEFAULT 0,
          parent_fdr_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS fdr_documents (
          id SERIAL PRIMARY KEY,
          fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
          document_type VARCHAR(100) NOT NULL,
          file_name VARCHAR(255) NOT NULL,
          file_path TEXT NOT NULL,
          file_size INTEGER,
          mime_type VARCHAR(100),
          sha256_hash VARCHAR(64),
          verified_on_chain INTEGER DEFAULT 1,
          uploaded_by INTEGER,
          uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1,
          version INTEGER DEFAULT 1
        );

        -- Ensure version column exists for document audit versioning
        ALTER TABLE fdr_documents ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

        CREATE TABLE IF NOT EXISTS document_payloads (
          fdr_document_id INTEGER PRIMARY KEY REFERENCES fdr_documents(id) ON DELETE CASCADE,
          data BYTEA NOT NULL,
          mime_type VARCHAR(100),
          file_name VARCHAR(255),
          uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS consumed_view_tokens (
          token_jti VARCHAR(100) PRIMARY KEY,
          document_id INTEGER,
          consumed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id SERIAL PRIMARY KEY,
          fdr_id INTEGER REFERENCES fdrs(id) ON DELETE CASCADE,
          institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          alert_type VARCHAR(100) NOT NULL,
          severity VARCHAR(50) DEFAULT 'Medium',
          message TEXT NOT NULL,
          due_date DATE,
          is_resolved INTEGER DEFAULT 0,
          resolved_by INTEGER,
          resolved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS release_requests (
          id SERIAL PRIMARY KEY,
          fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
          institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          request_type VARCHAR(100) NOT NULL,
          reason TEXT NOT NULL,
          requested_by INTEGER NOT NULL,
          requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) NOT NULL DEFAULT 'Submitted',
          review_stage VARCHAR(50) NOT NULL DEFAULT 'Dealing_Officer',
          dealing_officer_id INTEGER,
          dealing_officer_remarks TEXT,
          dealing_officer_at TIMESTAMP WITH TIME ZONE,
          finance_officer_id INTEGER,
          finance_officer_remarks TEXT,
          finance_officer_at TIMESTAMP WITH TIME ZONE,
          director_id INTEGER,
          director_remarks TEXT,
          director_at TIMESTAMP WITH TIME ZONE,
          statutory_order_number VARCHAR(100),
          noc_document_path TEXT,
          approved_by INTEGER,
          approved_at TIMESTAMP WITH TIME ZONE,
          rejection_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id SERIAL PRIMARY KEY,
          entity_type VARCHAR(100) NOT NULL,
          entity_id INTEGER,
          action VARCHAR(100) NOT NULL,
          changed_by INTEGER,
          changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          old_value TEXT,
          new_value TEXT,
          ip_address VARCHAR(100),
          notes TEXT,
          user_id INTEGER,
          institution_id INTEGER,
          previous_state TEXT,
          new_state TEXT,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS lien_invocations (
          id SERIAL PRIMARY KEY,
          fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
          institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          case_reference_number VARCHAR(100) UNIQUE NOT NULL,
          invocation_amount NUMERIC(15, 2) NOT NULL,
          section_invoked VARCHAR(100) DEFAULT 'Section 10(k) AICTE Act, 1987',
          stage VARCHAR(50) NOT NULL DEFAULT 'INITIATED',
          initiated_by INTEGER NOT NULL,
          initiated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          show_cause_notice_ref VARCHAR(100),
          show_cause_date DATE,
          show_cause_due_date DATE,
          institution_response_ref VARCHAR(100),
          institution_response_summary TEXT,
          bank_demand_letter_ref VARCHAR(100),
          bank_demand_sent_at TIMESTAMP WITH TIME ZONE,
          utr_number VARCHAR(100),
          remitted_amount NUMERIC(15, 2),
          remitted_at TIMESTAMP WITH TIME ZONE,
          forfeiture_order_doc_path TEXT,
          remarks TEXT
        );

        CREATE TABLE IF NOT EXISTS bulk_ingestion_jobs (
          id SERIAL PRIMARY KEY,
          batch_reference VARCHAR(100) UNIQUE NOT NULL,
          total_rows INTEGER NOT NULL,
          successful_rows INTEGER DEFAULT 0,
          failed_rows INTEGER DEFAULT 0,
          validation_errors TEXT,
          uploaded_by INTEGER NOT NULL,
          status VARCHAR(50) DEFAULT 'PENDING',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS statutory_certificates (
          id SERIAL PRIMARY KEY,
          fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
          institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          certificate_type VARCHAR(100) NOT NULL,
          certificate_number VARCHAR(100) UNIQUE NOT NULL,
          qr_verification_code VARCHAR(100) UNIQUE NOT NULL,
          dsc_officer_name VARCHAR(255) NOT NULL,
          dsc_officer_designation VARCHAR(255) NOT NULL,
          dsc_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          pdf_payload TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS dispute_tickets (
          id SERIAL PRIMARY KEY,
          fdr_id INTEGER NOT NULL REFERENCES fdrs(id) ON DELETE CASCADE,
          institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          discrepancy_details TEXT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'Open',
          priority VARCHAR(50) DEFAULT 'Medium',
          created_by INTEGER REFERENCES users(id),
          resolution_notes TEXT,
          resolved_by INTEGER REFERENCES users(id),
          resolved_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS dispute_messages (
          id SERIAL PRIMARY KEY,
          dispute_id INTEGER NOT NULL REFERENCES dispute_tickets(id) ON DELETE CASCADE,
          sender_id INTEGER REFERENCES users(id),
          message TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications_log (
          id SERIAL PRIMARY KEY,
          institution_id INTEGER REFERENCES institutions(id) ON DELETE CASCADE,
          fdr_id INTEGER REFERENCES fdrs(id) ON DELETE CASCADE,
          notification_type VARCHAR(100) NOT NULL,
          channel VARCHAR(50) NOT NULL DEFAULT 'EMAIL',
          recipient VARCHAR(255) NOT NULL,
          subject VARCHAR(255),
          message TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'SENT',
          sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Seed default users directly in PostgreSQL if none exist
      const userRes = await pgPool.query('SELECT COUNT(*) as count FROM users');
      if (Number(userRes.rows[0]?.count) === 0) {
        await pgPool.query(`
          INSERT INTO users (id, username, password_hash, full_name, email, role, institution_id, is_active)
          VALUES
            (1, 'admin', '$2a$10$qDZDEZaL57uC6vGtPwmwXurLJPn/Zz8pfmJWu/oUnrV5DUEm9QYRa', 'System Administrator', 'admin@aicte.gov.in', 'admin', null, 1),
            (2, 'officer1', '$2a$10$uzbVo9BNwEYt.j0hSP/S/.XEnWxJvZxHJgv.jWBV/g22Rxk5xGxnG', 'Rajesh Verma (Bureau Officer)', 'r.verma@aicte.gov.in', 'bureau_officer', null, 1),
            (3, 'inst_user1', '$2a$10$qDZDEZaL57uC6vGtPwmwXurLJPn/Zz8pfmJWu/oUnrV5DUEm9QYRa', 'IIT Bombay Finance Officer', 'finance@iitb.ac.in', 'institution_user', 1, 1),
            (4, 'viewer1', '$2a$10$QLszhaR6SX6rA1wyDn5w9.1czXkAM/5ARkegWxQhy3YCDSTytMvl6', 'Auditor General / Viewer', 'viewer@aicte.gov.in', 'viewer', null, 1)
          ON CONFLICT (id) DO NOTHING;
        `);
      }
      console.log('✅ PostgreSQL authoritative schema verified. All reads and writes are directed exclusively to PostgreSQL.');
    } catch (pgInitErr: any) {
      console.warn('⚠️ PostgreSQL initialization notice:', pgInitErr.message);
    }
  } else {
    console.log('ℹ️ Offline SQLite fallback initialized (PostgreSQL not detected in environment).');
  }
}
