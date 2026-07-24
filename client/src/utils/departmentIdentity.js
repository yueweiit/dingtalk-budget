const normalizeDeptName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const compactDeptKey = (value) => normalizeDeptName(value)
  .toLowerCase()
  .replace(/[\s（）()\-_/\\,.;:，。；：&]/g, '');

const firstValue = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
};

const departmentIdOf = (record = {}) => String(firstValue(record, [
  'reportingDeptId',
  'reporting_dept_id',
  'deptId',
  'dept_id',
  'departmentId',
  'department_id',
])).trim();

const departmentNameKey = (record = {}) => compactDeptKey(firstValue(record, [
  'deptName',
  'dept_name',
  'department',
  'applicant_department',
]));

const monthOf = (record = {}) => String(firstValue(record, [
  'budgetMonth',
  'budget_month',
  'declaration_month',
  'queryMonth',
  'query_month',
])).trim();

function usesHistoricalMatching(record = {}) {
  const month = monthOf(record);
  return Boolean(month && month < '2026-07');
}

export function departmentIdentityKey(record = {}) {
  const explicitKey = firstValue(record, [
    'reportingDepartmentIdentityKey',
    'reporting_department_identity_key',
    'departmentIdentityKey',
    'department_identity_key',
  ]);
  if (explicitKey) return String(explicitKey);

  const departmentId = departmentIdOf(record);
  if (departmentId) return `id:${departmentId}`;

  const recordId = firstValue(record, ['formNo', 'form_no', 'businessId', 'business_id']);
  return `legacy:${recordId}:${departmentNameKey(record)}`;
}

export function departmentMatches(target = {}, candidate = {}) {
  if (usesHistoricalMatching(target) || usesHistoricalMatching(candidate)) {
    const targetName = departmentNameKey(target);
    const candidateName = departmentNameKey(candidate);
    return Boolean(targetName && candidateName && targetName === candidateName);
  }

  const targetId = departmentIdOf(target);
  const candidateId = departmentIdOf(candidate);
  if (targetId || candidateId) return Boolean(targetId && candidateId && targetId === candidateId);

  const targetName = departmentNameKey(target);
  const candidateName = departmentNameKey(candidate);
  return Boolean(targetName && candidateName && targetName === candidateName);
}

export function departmentDisplayName(record = {}) {
  const reportingDepartment = firstValue(record, [
    'reportingDepartmentDisplay',
    'reporting_department_display',
    'reportingDeptName',
    'reporting_dept_name',
  ]);
  if (reportingDepartment) return String(reportingDepartment);

  const parentDepartment = firstValue(record, ['departmentDisplay', 'department_display']);
  const subDepartment = firstValue(record, ['subDepartmentDisplay', 'sub_department_display']);
  const fallback = firstValue(record, ['deptName', 'dept_name', 'department', 'applicant_department']);
  const display = parentDepartment || fallback || '未知部门';

  return subDepartment && subDepartment !== display
    ? `${display} / ${subDepartment}`
    : String(display);
}
