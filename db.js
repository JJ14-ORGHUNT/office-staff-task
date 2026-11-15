// Tiny database layer: Postgres when DATABASE_URL is set (Supabase/Neon/etc.),
// otherwise a local SQLite file (Node's built-in node:sqlite).
// All SQL in the app uses `?` placeholders and portable syntax.
const path = require('path');
const fs = require('fs');

const usePg = !!process.env.DATABASE_URL;
let pool, sqlite;

if (usePg) {
  const { Pool } = require('pg');
  const url = process.env.DATABASE_URL;
  const local = /localhost|127\.0\.0\.1/.test(url) || process.env.PGSSL === 'disable';
  pool = new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 3),
  });
} else {
  const { DatabaseSync } = require('node:sqlite');
  const file = process.env.SQLITE_FILE || path.join(__dirname, 'data', 'app.db');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
}

const toPg = sql => { let i = 0; return sql.replace(/\?/g, () => '$' + ++i); };

async function all(sql, params = []) {
  if (usePg) return (await pool.query(toPg(sql), params)).rows;
  return sqlite.prepare(sql).all(...params);
}
async function get(sql, params = []) {
  return (await all(sql, params))[0];
}
// Returns { changes, rows } — use "RETURNING id" when you need the new id.
async function run(sql, params = []) {
  if (usePg) {
    const r = await pool.query(toPg(sql), params);
    return { changes: r.rowCount, rows: r.rows };
  }
  if (/\breturning\b/i.test(sql)) {
    const rows = sqlite.prepare(sql).all(...params);
    return { changes: rows.length, rows };
  }
  const r = sqlite.prepare(sql).run(...params);
  return { changes: Number(r.changes), rows: [] };
}

const ID = usePg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id ${ID},
    emp_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id ${ID},
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    assign_all INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS task_staff (
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS attendance (
    id ${ID},
    user_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    clock_in TEXT,
    clock_out TEXT,
    UNIQUE (user_id, work_date)
  )`,
  `CREATE TABLE IF NOT EXISTS daily_items (
    id ${ID},
    user_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    task_id INTEGER,
    task_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    remarks TEXT NOT NULL DEFAULT '',
    updated_at TEXT,
    UNIQUE (user_id, work_date, task_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_items_date ON daily_items (work_date)`,
  `CREATE INDEX IF NOT EXISTS idx_att_date ON attendance (work_date)`,
];

async function migrate() {
  for (const stmt of SCHEMA) await run(stmt);
}

module.exports = { all, get, run, migrate, kind: usePg ? 'postgres' : 'sqlite' };
