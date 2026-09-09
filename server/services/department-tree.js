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

function text(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeOrganizationName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isYueweiRootName(value) {
  return [
    'yuewei',
    '悦为集团',
    '悦为集团yuewei grupo',
  ].includes(normalizeOrganizationName(value));
}

function asArray(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

export function buildCurrentOrganizationOptions(rows = []) {
  const groups = new Map();
  const companies = new Map();
  const departments = new Map();

  for (const row of rows) {
    const ids = asArray(row.path_ids);
    const names = asArray(row.path_names);
    const groupIndex = names.findIndex(isYueweiRootName);
    if (groupIndex < 0 || !ids[groupIndex] || !names[groupIndex]) continue;

    const group = {
      id: ids[groupIndex],
      name: names[groupIndex],
    };
    groups.set(group.id, group);

    const companyIndex = groupIndex + 1;
    if (!ids[companyIndex] || !names[companyIndex]) continue;
    const company = {
      id: ids[companyIndex],
      name: names[companyIndex],
      group_dept_id: group.id,
      group_name: group.name,
    };
    companies.set(company.id, company);

    // The direct child of the group is the company itself. Every deeper node
    // is a selectable department, including nested departments.
    const departmentId = text(row.dept_id);
    const departmentName = text(row.name) || names[names.length - 1];
    if (ids.length <= companyIndex + 1 || !departmentId || !departmentName) continue;
    departments.set(departmentId, {
      id: departmentId,
      name: departmentName,
      company_dept_id: company.id,
      company_name: company.name,
      group_dept_id: group.id,
      group_name: group.name,
    });
  }

  const sortByName = (left, right) => left.name.localeCompare(right.name, 'zh-CN');
  return {
    groups: [...groups.values()].sort(sortByName),
    companies: [...companies.values()].sort(sortByName),
    departments: [...departments.values()].sort(sortByName),
  };
}

export async function listCurrentOrganizationOptions(query = oaPool.query.bind(oaPool)) {
  const result = await query(`
    SELECT corp_id, dept_id, name, path_ids, path_names
    FROM ding_department_tree
    WHERE is_current = true
  `);
  return buildCurrentOrganizationOptions(result.rows);
}

function pickUniqueDepartment(rows) {
  const candidates = new Map();
  for (const row of rows) {
    const departmentId = text(row.dept_id);
    const department = text(row.name);
    if (departmentId && department) candidates.set(departmentId, row);
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

export async function resolveServiceEntityDepartment(input, query = oaPool.query.bind(oaPool)) {
  const serviceEntity = text(input?.serviceEntity);
  const serviceEntityCode = text(input?.serviceEntityCode);
  const correspondingDepartment = text(input?.correspondingDepartment);
  if (!serviceEntity && !serviceEntityCode) return { status: 'unresolved' };

  const result = await query(`
    SELECT dept_id, name, path_ids, path_names, is_current
    FROM ding_department_tree
    WHERE NULLIF(BTRIM(dept_id), '') IS NOT NULL
      AND (
        (NULLIF($3::text, '') IS NOT NULL AND BTRIM(dept_id) = $3::text)
        OR (
          NULLIF($3::text, '') IS NULL
          AND (
            (NULLIF($2::text, '') IS NOT NULL AND BTRIM(name) = $2::text
              AND jsonb_typeof(path_names) = 'array' AND path_names @> jsonb_build_array($1::text))
            OR (NULLIF($2::text, '') IS NULL AND BTRIM(name) = $1::text)
          )
        )
      )
  `, [serviceEntity, correspondingDepartment, serviceEntityCode]);
  const selected = pickUniqueDepartment(result.rows.filter((row) => row.is_current === true));
  if (!selected) return { status: 'unresolved' };

  return {
    status: 'resolved',
    department: text(selected.name),
    departmentId: text(selected.dept_id),
    departmentPathIds: selected.path_ids || null,
    departmentPathNames: selected.path_names || null,
  };
}
