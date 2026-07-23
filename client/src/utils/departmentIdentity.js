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

export function departmentIdentityKey(record = {}) {
  const explicitKey = firstValue(record, ['departmentIdentityKey', 'department_identity_key']);
  if (explicitKey) return String(explicitKey);

  const departmentId = departmentIdOf(record);
  if (departmentId) return `id:${departmentId}`;

  const recordId = firstValue(record, ['formNo', 'form_no', 'businessId', 'business_id']);
  return `legacy:${recordId}:${departmentNameKey(record)}`;
}

export function departmentMatches(target = {}, candidate = {}) {
  const targetId = departmentIdOf(target);
  const candidateId = departmentIdOf(candidate);
  if (targetId || candidateId) return Boolean(targetId && candidateId && targetId === candidateId);

  const targetName = departmentNameKey(target);
  const candidateName = departmentNameKey(candidate);
  return Boolean(targetName && candidateName && targetName === candidateName);
}

export function departmentDisplayName(record = {}) {
  const parentDepartment = firstValue(record, ['departmentDisplay', 'department_display']);
  const subDepartment = firstValue(record, ['subDepartmentDisplay', 'sub_department_display']);
  const fallback = firstValue(record, ['deptName', 'dept_name', 'department', 'applicant_department']);
  const display = parentDepartment || fallback || '未知部门';

  return subDepartment && subDepartment !== display
    ? `${display} / ${subDepartment}`
    : String(display);
}
