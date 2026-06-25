import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let dbInitialized = false;
let useSqlite = false;
let sqliteDb: any = null;
let pgPool: Pool | null = null;

// Keep export of pool for type compatibility, backed dynamically
export const pool: any = {
  query: async (text: string, params?: any[]) => {
    return query(text, params);
  },
  connect: async () => {
    return getClient();
  },
  end: async () => {
    if (pgPool) {
      await pgPool.end();
    }
  }
};

function getSqliteDb() {
  if (!sqliteDb) {
    // Dynamically require node:sqlite to bypass older typescript version typings checks
    const { DatabaseSync } = require('node:sqlite');
    sqliteDb = new DatabaseSync('crdt_editor.db');
    
    // Enable foreign keys
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    
    // Initialize schema
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          email         TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
          id          TEXT PRIMARY KEY,
          owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title       TEXT NOT NULL DEFAULT 'Untitled Document',
          snapshot    TEXT,
          share_token TEXT UNIQUE,
          updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS operations (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          op          TEXT NOT NULL,
          client_id   INTEGER NOT NULL,
          clock       INTEGER NOT NULL,
          created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS document_shares (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          shared_with   INTEGER REFERENCES users(id) ON DELETE CASCADE,
          share_token   TEXT UNIQUE,
          permission    TEXT NOT NULL DEFAULT 'read',
          created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_operations_document_created ON operations(document_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
      CREATE INDEX IF NOT EXISTS idx_document_shares_token ON document_shares(share_token);
    `);
  }
  return sqliteDb;
}

async function ensureInitialized() {
  if (dbInitialized) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log('ℹ️ No DATABASE_URL found. Using local SQLite database (crdt_editor.db).');
    useSqlite = true;
    dbInitialized = true;
    return;
  }

  // Create pg pool with short connection timeout to fail fast
  pgPool = new Pool({
    connectionString,
    connectionTimeoutMillis: 1500,
  });

  try {
    const client = await pgPool.connect();
    client.release();
    console.log('✅ Connected to PostgreSQL database successfully.');
    useSqlite = false;
  } catch (err) {
    console.warn(
      `⚠️ PostgreSQL connection failed. Falling back to local SQLite database (crdt_editor.db). Error: ${(err as Error).message}`
    );
    useSqlite = true;
    if (pgPool) {
      await pgPool.end().catch(() => {});
      pgPool = null;
    }
  }

  dbInitialized = true;
}

export async function query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  await ensureInitialized();

  const start = Date.now();

  if (useSqlite) {
    const db = getSqliteDb();

    // 1. Translate PostgreSQL features/functions to SQLite
    // Mappings:
    // - NOW() -> CURRENT_TIMESTAMP
    let sql = text.replace(/\bNOW\(\)/gi, 'CURRENT_TIMESTAMP');

    // 2. Map PostgreSQL placeholders ($1, $2, ...) to standard SQLite positional placeholders (?)
    const placeholderRegex = /\$(\d+)/g;
    const matches = [...sql.matchAll(placeholderRegex)];
    
    let finalParams = params;
    if (matches.length > 0) {
      finalParams = matches.map(match => {
        const idx = parseInt(match[1], 10) - 1;
        return params[idx];
      });
      sql = sql.replace(placeholderRegex, '?');
    }

    // 3. Serialize objects to JSON strings (SQLite does not support native JSONB)
    finalParams = finalParams.map(param => {
      if (param !== null && typeof param === 'object') {
        return JSON.stringify(param);
      }
      return param;
    });

    try {
      const stmt = db.prepare(sql);
      const resultRows = stmt.all(...finalParams);

      // 4. Parse serialised JSON objects back to real objects on SELECT
      const rows = resultRows.map((row: any) => {
        const newRow = { ...row };
        if (typeof newRow.snapshot === 'string') {
          try {
            newRow.snapshot = JSON.parse(newRow.snapshot);
          } catch (e) {
            // keep as string if parse fails
          }
        }
        if (typeof newRow.op === 'string') {
          try {
            newRow.op = JSON.parse(newRow.op);
          } catch (e) {
            // keep as string if parse fails
          }
        }
        return newRow;
      });

      const duration = Date.now() - start;
      console.log('SQLite Query:', sql, 'Duration:', duration, 'ms, Rows:', rows.length);

      return {
        rows,
        rowCount: rows.length,
      };
    } catch (err) {
      console.error('SQLite Query Error:', err, 'SQL:', sql, 'Params:', finalParams);
      throw err;
    }
  } else {
    // PostgreSQL mode
    if (!pgPool) throw new Error('PostgreSQL pool not initialized');
    const res = await pgPool.query(text, params);
    const duration = Date.now() - start;
    console.log('PostgreSQL Query:', text, 'Duration:', duration, 'ms, Rows:', res.rowCount);
    return {
      rows: res.rows,
      rowCount: res.rowCount ?? 0,
    };
  }
}

export async function getClient(): Promise<any> {
  await ensureInitialized();
  if (useSqlite) {
    // For SQLite, return a transaction client matching pg client signature
    return {
      query: async (text: string, params?: any[]) => {
        return query(text, params);
      },
      release: () => {},
    };
  } else {
    if (!pgPool) throw new Error('PostgreSQL pool not initialized');
    return pgPool.connect();
  }
}