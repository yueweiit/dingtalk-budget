const JULY_REPORTING_DEPARTMENTS = new Map([
  ['1089928990', { departmentId: '1079492125', departmentName: 'FC CN财务中心 Centro de finanzas' }],
  ['1089765983', { departmentId: '1059093807', departmentName: 'HR CN人力资源Recursos humanos' }],
  ['1090235336', { departmentId: '1059634386', departmentName: 'SG 销售小组Grupo de ventas' }],
  ['1090006841', { departmentId: '1060178527', departmentName: 'PD&PH 产品和采购Producto&Compras' }],
  ['1089481630', { departmentId: '1059483024', departmentName: 'OBG 线上业务组Grupo de negocios en línea' }],
]);

// This is a one-off historical reporting correction. Keep the source
// department untouched and only change the reporting projection for this
// exact business number.
const SINGLE_RECORD_REPORTING_OVERRIDES = new Map([
  ['202607211109000332593', { departmentId: '1089928990', departmentName: 'FC财务中心' }],
  ['202608281007000322547', { departmentId: '1089765983', departmentName: 'HR人力资源中心' }],
  ['202608280953000047922', { departmentId: '1089533879', departmentName: '产品&开发' }],
]);

function compact(value) {
  return String(value || '').trim();
}

export function usesNewDepartmentIdentity(month) {
  return compact(month) >= '2026-07';
}

export function resolveJulyDepartmentReporting({ departmentId, month } = {}) {
  const sourceDepartmentId = compact(departmentId);
  if (compact(month) !== '2026-07') {
    return { departmentId: sourceDepartmentId, departmentName: '', mapped: false };
  }

  const mapped = JULY_REPORTING_DEPARTMENTS.get(sourceDepartmentId);
  if (!mapped) {
    return { departmentId: sourceDepartmentId, departmentName: '', mapped: false };
  }

  return { ...mapped, mapped: true };
}

export function resolveSingleRecordReporting({ businessId, formNo } = {}) {
  const recordId = compact(businessId || formNo);
  const mapped = SINGLE_RECORD_REPORTING_OVERRIDES.get(recordId);
  return mapped ? { ...mapped, mapped: true } : { departmentId: '', departmentName: '', mapped: false };
}

export function applyJulyDepartmentReportingOverlay(record = {}, month = record.budget_month || record.declaration_month || record.query_month) {
  const sourceRecordId = compact(record.business_id || record.businessId || record.form_no || record.formNo);
  const sourceDepartmentId = compact(
    record.dept_id || record.department_id || record.applicant_department_id || record.creator_department_id
  );
  const sourceDepartmentName = compact(
    record.dept_name || record.department || record.applicant_department || record.creator_department
  );
  const singleRecordReporting = resolveSingleRecordReporting({ businessId: sourceRecordId });
  if (singleRecordReporting.mapped) {
    return {
      ...record,
      reporting_dept_id: singleRecordReporting.departmentId,
      reporting_dept_name: singleRecordReporting.departmentName,
      reporting_department_identity_key: `id:${singleRecordReporting.departmentId}`,
      reporting_department_mapped: true,
    };
  }
  const reporting = resolveJulyDepartmentReporting({ departmentId: sourceDepartmentId, month });

  return {
    ...record,
    reporting_dept_id: reporting.departmentId || sourceDepartmentId || null,
    reporting_dept_name: reporting.departmentName || sourceDepartmentName || null,
    reporting_department_identity_key: reporting.departmentId
      ? `id:${reporting.departmentId}`
      : null,
    reporting_department_mapped: reporting.mapped,
  };
}
