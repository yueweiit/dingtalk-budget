import express from 'express';
import { query } from '../db/index.js';
import { AUTH_ROLES, isSuperAdmin, requireRole } from '../services/auth.js';
import { listCurrentOrganizationOptions } from '../services/department-tree.js';
import {
  buildQuotaConfigurationWhere,
  normalizeQuotaConfigurationFilters,
  parseQuotaConfigurationPagination,
  quotaConfigurationRowsSql,
  quotaRollupSql,
} from '../services/quota-configuration.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

router.use(requireRole(AUTH_ROLES.SUPERADMIN));

function configurationOptions(scopeWhereClause) {
  return {
    years: `
      SELECT DISTINCT q.budget_year AS value
      FROM budget_effective_quota q
      ${scopeWhereClause}
        AND q.budget_year IS NOT NULL
      ORDER BY value DESC
    `,
    months: `
      SELECT DISTINCT q.budget_month AS value
      FROM budget_effective_quota q
      ${scopeWhereClause}
        AND NULLIF(BTRIM(q.budget_month), '') IS NOT NULL
      ORDER BY value DESC
    `,
    groups: `
      SELECT q.group_dept_id AS id, MIN(q.group_name) AS name
      FROM budget_effective_quota q
      ${scopeWhereClause}
        AND q.organization_is_current = true
        AND NULLIF(BTRIM(q.group_dept_id), '') IS NOT NULL
      GROUP BY q.group_dept_id
      ORDER BY name ASC
    `,
    companies: `
      SELECT
        q.company_dept_id AS id,
        MIN(q.company_name) AS name,
        q.group_dept_id,
        MIN(q.group_name) AS group_name
      FROM budget_effective_quota q
      ${scopeWhereClause}
        AND q.organization_is_current = true
        AND NULLIF(BTRIM(q.company_dept_id), '') IS NOT NULL
      GROUP BY q.company_dept_id, q.group_dept_id
      ORDER BY name ASC
    `,
    departments: `
      SELECT
        q.department_id AS id,
        MIN(q.department_name) AS name,
        q.company_dept_id,
        MIN(q.company_name) AS company_name,
        q.group_dept_id
      FROM budget_effective_quota q
      ${scopeWhereClause}
        AND q.organization_is_current = true
        AND NULLIF(BTRIM(q.company_dept_id), '') IS NOT NULL
        AND NULLIF(BTRIM(q.department_id), '') IS NOT NULL
        AND q.department_id IS DISTINCT FROM q.company_dept_id
      GROUP BY q.department_id, q.company_dept_id, q.group_dept_id
      ORDER BY name ASC
    `,
    budgetTypes: `
      SELECT DISTINCT q.budget_type AS value
      FROM budget_effective_quota q
      ${scopeWhereClause}
      ORDER BY value ASC
    `,
    subjects: `
      SELECT DISTINCT s.subject_name AS value
      FROM budget_effective_quota q
      JOIN budget_effective_quota_subject s ON s.quota_id = q.id
      ${scopeWhereClause}
      ORDER BY value ASC
    `,
  };
}

async function fetchOptions(authUser) {
  const { whereClause, params } = buildQuotaConfigurationWhere({}, authUser);
  const sql = configurationOptions(whereClause);
  const entries = await Promise.all(
    Object.entries(sql).map(async ([key, statement]) => [key, (await query(statement, params)).rows])
  );
  const options = Object.fromEntries(entries);

  try {
    const currentOrganizations = await listCurrentOrganizationOptions();
    if (isSuperAdmin(authUser)) return { ...options, ...currentOrganizations };

    const allowedIds = (key) => new Set((options[key] || []).map((item) => String(item.id || '').trim()));
    return {
      ...options,
      groups: currentOrganizations.groups.filter((item) => allowedIds('groups').has(item.id)),
      companies: currentOrganizations.companies.filter((item) => allowedIds('companies').has(item.id)),
      departments: currentOrganizations.departments.filter((item) => allowedIds('departments').has(item.id)),
    };
  } catch (error) {
    console.warn('[OA_DB] Current organization options unavailable:', error.message);
    return options;
  }
}

async function fetchSummary(filters, authUser) {
  const { whereClause, params, nextParamIndex } = buildQuotaConfigurationWhere(filters, authUser);
  const subjectParams = [...params];
  let subjectFilter = '';
  if (filters.subjectName) {
    subjectFilter = ` AND s.subject_name = $${nextParamIndex}`;
    subjectParams.push(filters.subjectName);
  }

  const [totals, groups, companies, departments, subjects] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int AS quota_count,
        COALESCE(SUM(q.total_amount), 0) AS total_amount,
        COUNT(*) FILTER (WHERE q.detail_amount_mismatch)::int AS detail_amount_mismatch_count
      FROM budget_effective_quota q
      ${whereClause}
    `, params),
    query(quotaRollupSql(whereClause, 'group_dept_id', 'group_name'), params),
    query(quotaRollupSql(whereClause, 'company_dept_id', 'company_name'), params),
    query(quotaRollupSql(whereClause, 'department_id', 'department_name', { currentDepartmentsOnly: true }), params),
    query(`
      SELECT
        s.subject_type,
        s.subject_code,
        s.subject_name,
        COUNT(DISTINCT q.id)::int AS quota_count,
        COALESCE(SUM(s.amount), 0) AS total_amount
      FROM budget_effective_quota q
      JOIN budget_effective_quota_subject s ON s.quota_id = q.id
      ${whereClause}
      ${subjectFilter}
      GROUP BY s.subject_type, s.subject_code, s.subject_name
      ORDER BY total_amount DESC, s.subject_name ASC
    `, subjectParams),
  ]);

  return {
    totals: totals.rows[0] || {
      quota_count: 0,
      total_amount: 0,
      detail_amount_mismatch_count: 0,
    },
    groups: groups.rows,
    companies: companies.rows,
    departments: departments.rows,
    subjects: subjects.rows,
  };
}

router.get('/options', async (req, res) => {
  try {
    res.json({ success: true, data: await fetchOptions(req.authUser) });
  } catch (error) {
    console.error('[ERROR] Quota configuration options error:', error);
    res.status(500).json({ success: false, message: isProduction ? '查询失败' : error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const filters = normalizeQuotaConfigurationFilters(req.query);
    const { page, pageSize } = parseQuotaConfigurationPagination(req.query);
    const { whereClause, params, nextParamIndex } = buildQuotaConfigurationWhere(filters, req.authUser);
    const offset = (page - 1) * pageSize;
    const subjectNameParamIndex = filters.subjectName ? nextParamIndex : null;
    const rowsLimitParamIndex = nextParamIndex + (subjectNameParamIndex ? 1 : 0);
    const [rows, count, summary] = await Promise.all([
      query(
        quotaConfigurationRowsSql(
          whereClause,
          rowsLimitParamIndex,
          rowsLimitParamIndex + 1,
          subjectNameParamIndex,
        ),
        [...params, ...(filters.subjectName ? [filters.subjectName] : []), pageSize, offset]
      ),
      query(`SELECT COUNT(*)::int AS count FROM budget_effective_quota q ${whereClause}`, params),
      fetchSummary(filters, req.authUser),
    ]);

    res.json({
      success: true,
      data: rows.rows,
      total: count.rows[0]?.count || 0,
      page,
      pageSize,
      summary,
    });
  } catch (error) {
    const validationError = /(?:格式无效|类型无效|参数无效|超出范围)/.test(error.message || '');
    if (!validationError) console.error('[ERROR] Quota configuration query error:', error);
    res.status(validationError ? 400 : 500).json({
      success: false,
      message: validationError ? '查询参数无效' : (isProduction ? '查询失败' : error.message),
    });
  }
});

export default router;
