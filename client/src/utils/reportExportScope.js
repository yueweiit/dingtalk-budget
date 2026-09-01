import { departmentIdentityKey } from './departmentIdentity.js';

const DEPARTMENT_ID_KEYS = [
  'reporting_dept_id',
  'reportingDeptId',
  'rollup_dept_id',
  'rollupDeptId',
  'dept_id',
  'deptId',
  'department_id',
  'departmentId',
  'applicant_department_id',
  'creator_department_id',
];

const DEPARTMENT_NAME_KEYS = [
  'dept_name',
  'deptName',
  'department',
  'applicant_department',
  'creator_department',
];

const firstNonEmpty = (record, keys) => keys
  .map((key) => record?.[key])
  .find((value) => value !== undefined && value !== null && String(value).trim() !== '');

function departmentIds(record) {
  return new Set(DEPARTMENT_ID_KEYS
    .map((key) => record?.[key])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value).trim()));
}

function departmentName(record) {
  return String(firstNonEmpty(record, DEPARTMENT_NAME_KEYS) || '').trim();
}

function normalizedName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function usableIdentityKey(record) {
  const key = departmentIdentityKey(record);
  return key && key !== 'legacy::' ? key : '';
}

export function buildReportDepartmentScope({ production = [], nonProduction = [] } = {}, scope = 'all') {
  if (scope === 'all') return { all: true };

  const rows = scope === 'production' ? production : nonProduction;
  const roots = rows;
  return {
    all: false,
    ids: new Set(roots.flatMap((row) => [...departmentIds(row)])),
    identityKeys: new Set(roots.map(usableIdentityKey).filter(Boolean)),
    names: new Set(roots
      .filter((row) => departmentIds(row).size === 0)
      .map(departmentName)
      .filter(Boolean)
      .map(normalizedName)),
  };
}

export function departmentInReportScope(record = {}, scope = { all: true }) {
  if (scope?.all) return true;
  if (!scope || (!scope.ids?.size && !scope.identityKeys?.size && !scope.names?.size)) {
    return false;
  }

  const ids = departmentIds(record);
  if ([...ids].some((id) => scope.ids?.has(id))) return true;

  const identityKey = usableIdentityKey(record);
  if (identityKey && scope.identityKeys?.has(identityKey)) return true;

  // Name matching is only a last resort for legacy records where both sides
  // have no department ID. It is exact, never fuzzy.
  return ids.size === 0
    && scope.names?.has(normalizedName(departmentName(record)));
}

function filterExpenseDetail(item, scope) {
  const splits = Array.isArray(item?.expense_splits) ? item.expense_splits : null;
  // An empty split array means this is a direct expense, not an unmatched split.
  if (!splits || splits.length === 0) return departmentInReportScope(item, scope) ? item : null;

  const visibleSplits = splits.filter((split) => departmentInReportScope(split, scope));
  if (visibleSplits.length > 0) return { ...item, expense_splits: visibleSplits };
  return null;
}

export function filterReportDataForExport(data = {}, scope = 'all') {
  if (scope === 'all') return data;

  const source = {
    production: Array.isArray(data.production) ? data.production : [],
    nonProduction: Array.isArray(data.nonProduction) ? data.nonProduction : [],
    approvedExpenses: Array.isArray(data.approvedExpenses) ? data.approvedExpenses : [],
    approvedExpenseDetails: Array.isArray(data.approvedExpenseDetails) ? data.approvedExpenseDetails : [],
    pendingProduction: Array.isArray(data.pendingProduction) ? data.pendingProduction : [],
    pendingNonProduction: Array.isArray(data.pendingNonProduction) ? data.pendingNonProduction : [],
    pendingExpenses: Array.isArray(data.pendingExpenses) ? data.pendingExpenses : [],
  };
  const departmentScope = buildReportDepartmentScope(source, scope);
  const production = scope === 'production' ? source.production : [];
  const nonProduction = scope === 'non-production' ? source.nonProduction : [];
  const approvedExpenses = source.approvedExpenses.filter((item) => (
    departmentInReportScope(item, departmentScope)
  ));
  const approvedExpenseDetails = source.approvedExpenseDetails
    .map((item) => filterExpenseDetail(item, departmentScope))
    .filter(Boolean);

  return {
    ...data,
    production,
    nonProduction,
    approvedExpenses,
    approvedExpenseDetails,
    pendingProduction: scope === 'production'
      ? source.pendingProduction.filter((item) => departmentInReportScope(item, departmentScope))
      : [],
    pendingNonProduction: scope === 'non-production'
      ? source.pendingNonProduction.filter((item) => departmentInReportScope(item, departmentScope))
      : [],
    pendingExpenses: source.pendingExpenses.filter((item) => departmentInReportScope(item, departmentScope)),
  };
}
