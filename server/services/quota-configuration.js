import { isSuperAdmin } from './auth.js';

function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function optionalYear(value) {
  const normalized = text(value);
  if (!normalized) return null;
  if (!/^\d{4}$/.test(normalized)) throw new Error('预算年度格式无效');
  return Number(normalized);
}

function optionalMonth(value) {
  const normalized = text(value);
  if (!normalized) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) throw new Error('预算月份格式无效');
  return normalized;
}

function optionalBudgetType(value) {
  const normalized = text(value);
  if (!normalized) return null;
  if (!['production', 'non_production'].includes(normalized)) {
    throw new Error('预算类型无效');
  }
  return normalized;
}

export function normalizeQuotaConfigurationFilters(source = {}) {
  return {
    budgetYear: optionalYear(source.budgetYear),
    budgetMonth: optionalMonth(source.budgetMonth),
    groupDeptId: text(source.groupDeptId),
    companyDeptId: text(source.companyDeptId),
    departmentId: text(source.departmentId),
    subjectName: text(source.subjectName),
    budgetType: optionalBudgetType(source.budgetType),
  };
}

export function buildQuotaConfigurationWhere(filters = {}, authUser = null, firstParamIndex = 1) {
  const normalized = normalizeQuotaConfigurationFilters(filters);
  const params = [];
  let paramIndex = firstParamIndex;
  let whereClause = "WHERE q.status = 'effective'";

  const add = (condition, value) => {
    whereClause += ` AND ${condition.replace('?', `$${paramIndex}`)}`;
    params.push(value);
    paramIndex++;
  };

  if (normalized.budgetYear !== null) add('q.budget_year = ?', normalized.budgetYear);
  if (normalized.budgetMonth) add('q.budget_month = ?', normalized.budgetMonth);
  if (normalized.groupDeptId) add('q.group_dept_id = ?', normalized.groupDeptId);
  if (normalized.companyDeptId) add('q.company_dept_id = ?', normalized.companyDeptId);
  if (normalized.departmentId) add('q.department_id = ?', normalized.departmentId);
  if (normalized.budgetType) add('q.budget_type = ?', normalized.budgetType);

  if (normalized.subjectName) {
    whereClause += ` AND EXISTS (
      SELECT 1
      FROM budget_effective_quota_subject filter_subject
      WHERE filter_subject.quota_id = q.id
        AND filter_subject.subject_name = $${paramIndex}
    )`;
    params.push(normalized.subjectName);
    paramIndex++;
  }

  if (!isSuperAdmin(authUser)) {
    const departmentId = text(authUser?.departmentId);
    if (!departmentId) {
      whereClause += ' AND FALSE';
    } else {
      whereClause += ` AND (
        NULLIF(BTRIM(q.department_id), '') = $${paramIndex}
        OR COALESCE(q.department_path_ids, '[]'::jsonb) @> jsonb_build_array($${paramIndex}::text)
      )`;
      params.push(departmentId);
      paramIndex++;
    }
  }

  return { filters: normalized, whereClause, params, nextParamIndex: paramIndex };
}

export function parseQuotaConfigurationPagination(source = {}) {
  const parseInteger = (value, fallback, maximum) => {
    const normalized = text(value);
    if (!normalized) return fallback;
    if (!/^\d+$/.test(normalized)) throw new Error('分页参数无效');
    const parsed = Number(normalized);
    if (parsed < 1 || parsed > maximum) throw new Error('分页参数超出范围');
    return parsed;
  };

  return {
    page: parseInteger(source.page, 1, 100000),
    pageSize: parseInteger(source.pageSize, 20, 100),
  };
}

export function quotaConfigurationRowsSql(
  whereClause,
  limitParamIndex,
  offsetParamIndex,
  subjectNameParamIndex = null,
) {
  const subjectFilter = subjectNameParamIndex
    ? ` AND s.subject_name = $${subjectNameParamIndex}`
    : '';

  return `
    SELECT
      q.id,
      q.source_form_no,
      q.source_process_code,
      q.budget_year,
      q.budget_month,
      q.group_dept_id,
      q.group_name,
      q.company_dept_id,
      q.company_name,
      q.department_id,
      q.department_name,
      q.organization_is_current,
      (q.department_id IS NOT NULL AND q.department_id = q.company_dept_id) AS department_is_company,
      q.department_path_ids,
      q.department_path_names,
      q.owner_user_id,
      q.owner_name,
      q.budget_type,
      q.total_amount,
      q.detail_amount,
      q.detail_amount_mismatch,
      q.approval_completed_at,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'type', s.subject_type,
            'code', s.subject_code,
            'name', s.subject_name,
            'amount', s.amount
          )
          ORDER BY s.line_no
        ) FILTER (WHERE s.quota_id IS NOT NULL${subjectFilter}),
        '[]'::jsonb
      ) AS subjects,
      COALESCE(SUM(s.amount) FILTER (WHERE s.quota_id IS NOT NULL${subjectFilter}), 0) AS subject_amount
    FROM budget_effective_quota q
    LEFT JOIN budget_effective_quota_subject s ON s.quota_id = q.id
    ${whereClause}
    GROUP BY q.id
    ORDER BY q.budget_month DESC NULLS LAST, q.approval_completed_at DESC NULLS LAST, q.id DESC
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;
}

export function quotaRollupSql(whereClause, idColumn, nameColumn, options = {}) {
  const currentDepartmentFilter = options.currentDepartmentsOnly
    ? ` AND q.organization_is_current = true
        AND NULLIF(BTRIM(q.company_dept_id), '') IS NOT NULL
        AND q.department_id IS DISTINCT FROM q.company_dept_id`
    : '';

  return `
    SELECT
      NULLIF(BTRIM(q.${idColumn}), '') AS id,
      COALESCE(NULLIF(BTRIM(q.${nameColumn}), ''), '待确认') AS name,
      COUNT(*)::int AS quota_count,
      COALESCE(SUM(q.total_amount), 0) AS total_amount
    FROM budget_effective_quota q
    ${whereClause}
    ${currentDepartmentFilter}
    GROUP BY q.${idColumn}, q.${nameColumn}
    ORDER BY total_amount DESC, name ASC
  `;
}
