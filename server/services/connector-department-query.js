function firstNonEmptyQueryValue(query, keys) {
  for (const key of keys) {
    const value = String(query?.[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

export function buildConnectorDepartmentFilter(query, paramIndex) {
  const departmentId = firstNonEmptyQueryValue(query, [
    'departmentId',
    'department_id',
    'deptId',
    'dept_id',
  ]);
  if (departmentId) {
    return {
      condition: `dept_id = $${paramIndex}`,
      mode: 'id',
      params: [departmentId],
      nextParamIndex: paramIndex + 1,
    };
  }

  const departmentName = firstNonEmptyQueryValue(query, [
    'deptName',
    'department',
    '\u90e8\u95e8',
  ]);
  if (!departmentName) return null;

  return {
    condition: `LOWER(BTRIM(dept_name)) = LOWER(BTRIM($${paramIndex}))`,
    mode: 'name',
    params: [departmentName],
    nextParamIndex: paramIndex + 1,
  };
}
