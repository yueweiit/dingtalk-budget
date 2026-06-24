import { toAmount } from './xlsxReport';

function normalizeRegionName(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const lower = text.toLowerCase();
  if (text.includes('中国') || lower.includes('china') || /\bcn\b/i.test(text)) return '中国';
  if (text.includes('墨西哥') || lower.includes('méxico') || lower.includes('mexico') || /\bmx\b/i.test(text)) return '墨西哥';
  return '';
}

function detectExpenseRegionFallback(value) {
  const explicitRegion = normalizeRegionName(value);
  if (explicitRegion) return explicitRegion;
  return '中国';
}

function normalizeDeptKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s()（）\-_/\\,.;:，。；：]/g, '');
}

export function buildRegionChartRows2(
  productionRecords = [],
  nonProductionRecords = [],
  approvedDetailRows = [],
) {
  const regionMap = new Map();
  const deptRegionMap = new Map();
  const REGION_ORDER = ['中国', '墨西哥'];

  const ensureRegion = (regionValue) => {
    const region = normalizeRegionName(regionValue);
    if (!region) return null;
    if (!regionMap.has(region)) {
      regionMap.set(region, { label: region, budget: 0, expense: null });
    }
    return regionMap.get(region);
  };

  const addBudget = (record, amount) => {
    const current = ensureRegion(record.execution_region);
    if (!current) return;
    current.budget += toAmount(amount);

    const deptName = String(record.dept_name || '').trim();
    if (deptName) {
      deptRegionMap.set(normalizeDeptKey(deptName), current.label);
    }
  };

  const resolveExpenseRegion = (department) => {
    const deptKey = normalizeDeptKey(department);
    if (!deptKey) return '';

    const exact = deptRegionMap.get(deptKey);
    if (exact) return exact;

    const candidateRegions = new Set();
    for (const [knownDeptKey, region] of deptRegionMap.entries()) {
      if (!knownDeptKey) continue;
      if (knownDeptKey.length < 4 || deptKey.length < 4) continue;
      if (deptKey.includes(knownDeptKey) || knownDeptKey.includes(deptKey)) {
        candidateRegions.add(region);
      }
    }

    if (candidateRegions.size === 1) {
      return [...candidateRegions][0];
    }

    return detectExpenseRegionFallback(department);
  };

  for (const record of productionRecords) {
    addBudget(record, record.total_amount || record.monthly_budget_amount);
  }

  for (const record of nonProductionRecords) {
    addBudget(record, record.total_amount || record.budget_amount);
  }

  for (const row of approvedDetailRows) {
    const region = resolveExpenseRegion(row.department);
    if (!region) continue;

    const current = ensureRegion(region);
    if (!current) continue;
    current.expense = (current.expense ?? 0) + toAmount(row.baseCurrencyAmount || row.amount);
  }

  return [...regionMap.values()]
    .filter((item) => REGION_ORDER.includes(item.label))
    .sort((a, b) => REGION_ORDER.indexOf(a.label) - REGION_ORDER.indexOf(b.label));
}
