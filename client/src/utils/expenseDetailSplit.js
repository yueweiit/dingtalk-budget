function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') || '';
}

// Keep the raw department for display while exposing the July reporting department for matching.
export function expenseDetailSplitRecord(entry = {}) {
  return {
    department: firstNonEmpty(entry.department, entry.dept_name),
    departmentId: firstNonEmpty(entry.department_id, entry.departmentId, entry.dept_id),
    reportingDeptId: firstNonEmpty(entry.reporting_dept_id, entry.reportingDeptId),
    reportingDeptName: firstNonEmpty(entry.reporting_dept_name, entry.reportingDeptName),
    rollupDeptId: firstNonEmpty(entry.rollup_dept_id, entry.rollupDeptId),
    rollupDeptName: firstNonEmpty(entry.rollup_dept_name, entry.rollupDeptName),
    reportingDepartmentIdentityKey: firstNonEmpty(
      entry.reporting_department_identity_key,
      entry.reportingDepartmentIdentityKey
    ),
  };
}
