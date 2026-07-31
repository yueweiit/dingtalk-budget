import { SHARED_BUDGET_CONFIGS } from './yw-tech-shared-budget.js';

function text(value) {
  return String(value ?? '').trim();
}

function isDingTalkUserId(value) {
  return /^\d{12,}$/.test(value);
}

function firstQueryValue(query, keys) {
  for (const key of keys) {
    const value = text(query?.[key]);
    if (value) return value;
  }
  return '';
}

export function getConnectorOriginator(query = {}) {
  return {
    userId: firstQueryValue(query, [
      'originatorUserId',
      'originator_user_id',
      'submitterUserId',
      'submitter_user_id',
    ]),
    name: firstQueryValue(query, [
      'originatorName',
      'originator_name',
      'submitterName',
      'submitter_name',
      'Applicant',
      '\u63d0\u4ea4\u4eba',
    ]),
  };
}

export function buildOriginatorDepartmentQuery({ userId, name, departmentName }) {
  const identity = text(userId) || text(name);
  const inferredUserId = !text(userId) && isDingTalkUserId(text(name)) ? text(name) : '';
  const identityColumn = text(userId) || inferredUserId ? 'user_snapshot.user_id' : 'user_snapshot.name';

  return {
    sql: `
      SELECT DISTINCT
        user_snapshot.user_id,
        user_snapshot.name AS originator_name,
        department.dept_id,
        department.name AS department_name,
        department.path_names
      FROM ding_user_snapshot AS user_snapshot
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(user_snapshot.dept_id_list) = 'array' THEN user_snapshot.dept_id_list
          ELSE '[]'::jsonb
        END
      ) AS membership(dept_id)
      JOIN ding_department_tree AS department
        ON department.corp_id = user_snapshot.corp_id
       AND department.dept_id = membership.dept_id
      WHERE user_snapshot.is_current = true
        AND user_snapshot.fetch_status = 'success'
        AND department.is_current = true
        AND BTRIM(${identityColumn}) = BTRIM($1)
        AND BTRIM(department.name) = BTRIM($2)
      ORDER BY department.dept_id
    `,
    params: [text(userId) || inferredUserId || identity, text(departmentName)],
    matchedBy: text(userId) || inferredUserId ? 'user_id' : 'name',
  };
}

function buildSharedParentFallbackQuery({ userId, name, departmentName, parentId, memberIds }) {
  const identity = text(userId) || text(name);
  const inferredUserId = !text(userId) && isDingTalkUserId(text(name)) ? text(name) : '';
  const identityColumn = text(userId) || inferredUserId ? 'user_snapshot.user_id' : 'user_snapshot.name';

  return {
    sql: `
      SELECT DISTINCT
        user_snapshot.user_id,
        user_snapshot.name AS originator_name,
        department.dept_id,
        department.name AS department_name,
        department.path_names
      FROM ding_user_snapshot AS user_snapshot
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(user_snapshot.dept_id_list) = 'array' THEN user_snapshot.dept_id_list
          ELSE '[]'::jsonb
        END
      ) AS membership(dept_id)
      JOIN ding_department_tree AS department
        ON department.corp_id = user_snapshot.corp_id
       AND department.dept_id = $3
      WHERE user_snapshot.is_current = true
        AND user_snapshot.fetch_status = 'success'
        AND department.is_current = true
        AND BTRIM(${identityColumn}) = BTRIM($1)
        AND BTRIM(department.name) = BTRIM($2)
        AND membership.dept_id = ANY($4::varchar[])
      ORDER BY department.dept_id
    `,
    params: [text(userId) || inferredUserId || identity, text(departmentName), parentId, memberIds],
    matchedBy: text(userId) || inferredUserId ? 'user_id' : 'name',
  };
}

export async function resolveOriginatorDepartment({
  originatorUserId,
  originatorName,
  departmentName,
  sharedBudgetMonth,
}, query) {
  const userId = text(originatorUserId);
  const name = text(originatorName);
  const normalizedDepartmentName = text(departmentName);

  if (!normalizedDepartmentName || (!userId && !name)) {
    return { status: 'not_requested' };
  }

  const statement = buildOriginatorDepartmentQuery({
    userId,
    name,
    departmentName: normalizedDepartmentName,
  });
  const result = await query(statement.sql, statement.params);
  let candidates = result.rows || [];

  if (candidates.length === 0 && text(sharedBudgetMonth) >= '2026-07') {
    for (const config of SHARED_BUDGET_CONFIGS) {
      const fallback = buildSharedParentFallbackQuery({
        userId,
        name,
        departmentName: normalizedDepartmentName,
        parentId: config.parent.id,
        memberIds: [config.parent.id, ...config.children.map((child) => child.id)],
      });
      const fallbackResult = await query(fallback.sql, fallback.params);
      candidates = candidates.concat(fallbackResult.rows || []);
    }
  }

  if (candidates.length === 0) {
    return {
      status: 'not_found',
      matchedBy: statement.matchedBy,
      departmentName: normalizedDepartmentName,
    };
  }

  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      matchedBy: statement.matchedBy,
      departmentName: normalizedDepartmentName,
      candidates: candidates.map((candidate) => ({
        userId: candidate.user_id,
        departmentId: candidate.dept_id,
        departmentName: candidate.department_name,
        pathNames: candidate.path_names || null,
      })),
    };
  }

  const candidate = candidates[0];
  return {
    status: 'resolved',
    matchedBy: statement.matchedBy,
    departmentId: text(candidate.dept_id),
    departmentName: text(candidate.department_name),
    originatorUserId: text(candidate.user_id),
    originatorName: text(candidate.originator_name),
  };
}
