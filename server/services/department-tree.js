import pg from 'pg';

const { Pool } = pg;

const oaPool = new Pool({
  host: process.env.OA_DB_HOST || process.env.PGHOST,
  port: Number(process.env.OA_DB_PORT || process.env.PGPORT || 5432),
  database: process.env.OA_DB_DATABASE || process.env.DINGTALK_OA_DATABASE || 'dingtalk_oa',
  user: process.env.OA_DB_USER || process.env.PGUSER,
  password: process.env.OA_DB_PASSWORD || process.env.PGPASSWORD,
  max: Number(process.env.OA_DB_POOL_MAX || 5),
  idleTimeoutMillis: Number(process.env.OA_DB_IDLE_TIMEOUT_MS || process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.OA_DB_CONNECT_TIMEOUT_MS || process.env.PG_CONNECT_TIMEOUT_MS || 2000),
});

oaPool.on('error', (error) => {
  console.error('[OA_DB] Department tree PostgreSQL error:', error);
});

export function buildDepartmentSnapshotQuery() {
  return `
    WITH candidates AS (
      SELECT dept_id, path_ids, path_names,
             count(*) OVER (PARTITION BY dept_id) AS corp_count
      FROM ding_department_tree
      WHERE is_current = true AND dept_id = $1
    )
    SELECT dept_id, path_ids, path_names
    FROM candidates
    WHERE corp_count = 1
  `;
}

export async function findDepartmentSnapshot(departmentId, query = oaPool.query.bind(oaPool)) {
  const normalizedDepartmentId = String(departmentId || '').trim();
  if (!normalizedDepartmentId) return null;

  const result = await query(buildDepartmentSnapshotQuery(), [normalizedDepartmentId]);
  const row = result.rows[0];
  if (!row) return null;

  return {
    dept_path_ids: row.path_ids || null,
    dept_path_names: row.path_names || null,
  };
}

export async function getDepartmentSnapshot(departmentId) {
  try {
    return await findDepartmentSnapshot(departmentId);
  } catch (error) {
    console.warn('[OA_DB] Department path unavailable:', {
      departmentId,
      message: error.message,
    });
    return null;
  }
}

export function getOaDatabaseQuery() {
  return oaPool.query.bind(oaPool);
}
