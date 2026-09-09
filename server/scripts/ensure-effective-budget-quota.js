import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const required = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`缺少数据库连接配置：${missing.join(', ')}`);
}

const sqlPath = join(__dirname, '..', '..', 'sql', 'ensure-effective-budget-quota.sql');
const sql = await readFile(sqlPath, 'utf8');
const client = new pg.Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 2000),
});

try {
  await client.connect();
  await client.query(sql);
  console.log('Effective budget quota schema is ready.');
} finally {
  await client.end().catch(() => {});
}
