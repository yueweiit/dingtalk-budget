function text(value) {
  return String(value ?? '').trim();
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
    ]),
  };
}

export function buildOriginatorDepartmentQuery({ userId, name, departmentName }) {
  const identity = text(userId) || text(name);
  const identityColumn = text(userId) ? 'user_snapshot.user_id' : 'user_snapshot.name';

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
    params: [identity, text(departmentName)],
    matchedBy: text(userId) ? 'user_id' : 'name',
  };
}

export async function resolveOriginatorDepartment({
  originatorUserId,
  originatorName,
  departmentName,
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
  const candidates = result.rows || [];

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
