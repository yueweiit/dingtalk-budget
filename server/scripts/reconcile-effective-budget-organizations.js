import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  organizationFromDepartmentPath,
  resolveLegacyEffectiveQuotaDepartment,
} from '../services/effective-budget-quota.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const { Pool } = pg;

const budgetPool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const oaPool = new Pool({
  host: process.env.OA_DB_HOST || process.env.PGHOST,
  port: Number(process.env.OA_DB_PORT || process.env.PGPORT || 5432),
  database: process.env.OA_DB_DATABASE || process.env.DINGTALK_OA_DATABASE || 'dingtalk_oa',
  user: process.env.OA_DB_USER || process.env.PGUSER,
  password: process.env.OA_DB_PASSWORD || process.env.PGPASSWORD,
});

function indexKey(corpId, departmentId) {
  return `${String(corpId || '').trim()}:${String(departmentId || '').trim()}`;
}

async function main() {
  const [directoryResult, quotaResult] = await Promise.all([
    oaPool.query(`
      SELECT corp_id, dept_id, name, path_ids, path_names
      FROM ding_department_tree
      WHERE is_current = true
    `),
    budgetPool.query(`
      SELECT id, corp_id, department_id, owner_user_id
      FROM budget_effective_quota
    `),
  ]);

  const directory = new Map(
    directoryResult.rows.map((row) => [indexKey(row.corp_id, row.dept_id), row])
  );
  const client = await budgetPool.connect();
  const summary = {
    scanned: quotaResult.rows.length,
    current: 0,
    legacyMapped: 0,
    historicalOrUnresolved: 0,
    updated: 0,
  };

  try {
    await client.query('BEGIN');
    for (const quota of quotaResult.rows) {
      const mappedDepartment = resolveLegacyEffectiveQuotaDepartment({
        corpId: quota.corp_id,
        departmentId: quota.department_id,
        ownerUserId: quota.owner_user_id,
      });
      const departmentId = mappedDepartment?.departmentId || quota.department_id;
      const department = directory.get(indexKey(quota.corp_id, departmentId));
      if (!department) {
        summary.historicalOrUnresolved++;
        const changed = await client.query(`
          UPDATE budget_effective_quota
          SET organization_is_current = false, updated_at = NOW()
          WHERE id = $1 AND organization_is_current IS DISTINCT FROM false
        `, [quota.id]);
        summary.updated += changed.rowCount;
        continue;
      }

      summary.current++;
      if (mappedDepartment) summary.legacyMapped++;
      const organization = organizationFromDepartmentPath(department.path_ids, department.path_names);
      const changed = await client.query(`
        UPDATE budget_effective_quota
        SET
          group_dept_id = $2,
          group_name = $3,
          company_dept_id = $4,
          company_name = $5,
          department_id = $6,
          department_name = $7,
          department_path_ids = $8::jsonb,
          department_path_names = $9::jsonb,
          organization_is_current = true,
          updated_at = NOW()
        WHERE id = $1
          AND (
            group_dept_id IS DISTINCT FROM $2
            OR group_name IS DISTINCT FROM $3
            OR company_dept_id IS DISTINCT FROM $4
            OR company_name IS DISTINCT FROM $5
            OR department_id IS DISTINCT FROM $6
            OR department_name IS DISTINCT FROM $7
            OR department_path_ids IS DISTINCT FROM $8::jsonb
            OR department_path_names IS DISTINCT FROM $9::jsonb
            OR organization_is_current IS DISTINCT FROM true
          )
      `, [
        quota.id,
        organization.group_dept_id,
        organization.group_name,
        organization.company_dept_id,
        organization.company_name,
        department.dept_id,
        department.name,
        JSON.stringify(department.path_ids),
        JSON.stringify(department.path_names),
      ]);
      summary.updated += changed.rowCount;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(JSON.stringify(summary));
}

try {
  await main();
} finally {
  await Promise.all([budgetPool.end(), oaPool.end()]);
}
