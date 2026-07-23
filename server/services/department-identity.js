function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sourceRecordId(record) {
  return String(record?.form_no || record?.business_id || '').trim();
}

export function departmentIdentityKey(record = {}) {
  const departmentId = String(record.dept_id || record.department_id || '').trim();
  if (departmentId) return `id:${departmentId}`;

  const recordId = sourceRecordId(record);
  const departmentName = normalizeName(
    record.dept_name || record.department || record.applicant_department
  );
  return `legacy:${recordId}:${departmentName}`;
}

export function buildDepartmentPresentation(record = {}) {
  const identityKey = departmentIdentityKey(record);
  const pathNames = Array.isArray(record.dept_path_names)
    ? record.dept_path_names.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const yueweiIndex = pathNames.findIndex((value) => value.toUpperCase() === 'YUEWEI');

  if (!String(record.dept_id || record.department_id || '').trim() || yueweiIndex < 0) {
    return {
      departmentDisplay: '待确认',
      subDepartmentDisplay: '',
      identityKey,
    };
  }

  const departmentDisplay = pathNames[yueweiIndex + 1] || '待确认';
  const terminalDepartment = pathNames[pathNames.length - 1] || '';
  return {
    departmentDisplay,
    subDepartmentDisplay: terminalDepartment === departmentDisplay ? '' : terminalDepartment,
    identityKey,
  };
}
