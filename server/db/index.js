import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || '8.135.19.108',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'budget_system',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'Postgres@123',
  max: Number(process.env.PGPOOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 2000),
});

pool.on('connect', () => {
  console.log('[DB] PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('[DB] PostgreSQL error:', err);
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('[DB] Query executed', {
    text: text.replace(/\s+/g, ' ').trim().substring(0, 120),
    duration,
    rows: res.rowCount,
  });
  return res;
}
