import { toAmount } from './xlsxReport';

function normalizeRegionName(value) {
  const text = String(value || '').trim();
  if (!text) return '未指定';

  const lower = text.toLowerCase();
  if (text.includes('中国') || lower.includes('china')) return '中国';
  if (text.includes('墨西哥') || lower.includes('méxico') || lower.includes('mexico')) return '墨西哥';
  return text;
}

export function buildRegionBudgetExpenseDistribution(
  productionRecords = [],
  nonProductionRecords = [],
  approvedDetailRows = [],
) {
  const regionMap = new Map();
  const formRegionMap = new Map();

  const ensureRegion = (regionValue) => {
    const region = normalizeRegionName(regionValue);
    if (!regionMap.has(region)) {
      regionMap.set(region, { region, budget: 0, expense: 0 });
    }
    return regionMap.get(region);
  };

  const addBudget = (record, amount) => {
    const current = ensureRegion(record.execution_region);
    current.budget += toAmount(amount);

    const formNo = String(record.form_no || '').trim();
    if (formNo) {
      formRegionMap.set(formNo, current.region);
    }
  };

  for (const record of productionRecords) {
    addBudget(record, record.total_amount || record.monthly_budget_amount);
  }

  for (const record of nonProductionRecords) {
    addBudget(record, record.total_amount || record.budget_amount);
  }

  for (const row of approvedDetailRows) {
    const formNo = String(row.businessId || '').trim();
    const region = formRegionMap.get(formNo);
    if (!region) continue;

    const current = ensureRegion(region);
    current.expense += toAmount(row.baseCurrencyAmount || row.amount);
  }

  return [...regionMap.values()]
    .sort((a, b) => (b.budget + b.expense) - (a.budget + a.expense))
    .flatMap((item) => ([
      {
        region: item.region,
        type: '预算',
        amount: item.budget,
        label: `${item.region} / 预算`,
        fill: '#0f766e',
      },
      {
        region: item.region,
        type: '支出',
        amount: item.expense,
        label: `${item.region} / 支出`,
        fill: '#2563eb',
      },
    ]));
}
