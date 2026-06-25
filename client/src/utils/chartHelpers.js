import { toAmount, formatMonth } from './xlsxReport';

const normalizeDeptName = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const compactDeptKey = (value) => normalizeDeptName(value)
  .toLowerCase()
  .replace(/[\s()（）\-_/\\,.;:，。；：&]/g, '');

const canonicalDeptName = (value) => {
  const name = normalizeDeptName(value) || '未知';
  const key = compactDeptKey(name);

  if (key.includes('财务中心') || key.includes('centrodefinanzas')) {
    return 'FC CN财务中心 Centro de finanzas';
  }

  if (key.includes('hrmx') || key.includes('mx人力资源')) {
    return 'HR MX人力资源Recursos humanos';
  }

  if (key.includes('hrcn') || (key.includes('hr') && key.includes('人力资源') && !key.includes('mx'))) {
    return 'HR CN人力资源Recursos humanos';
  }

  return name;
};

function aggregateExecutionRowsByDept(executionRows) {
  const deptMap = new Map();

  for (const row of executionRows) {
    const deptName = canonicalDeptName(row.deptName);
    const key = compactDeptKey(deptName);
    const current = deptMap.get(key) || {
      deptName,
      budgetTotal: 0,
      approvedTotal: 0,
      remaining: 0,
      operationApproved: 0,
      purchaseApproved: 0,
      operationCount: 0,
      purchaseCount: 0,
    };

    current.budgetTotal += toAmount(row.totalBudget);
    current.approvedTotal += toAmount(row.totalApproved);
    current.remaining += toAmount(row.remainingBudget);
    current.operationApproved += toAmount(row.operationApproved);
    current.purchaseApproved += toAmount(row.purchaseApproved);
    current.operationCount += Number(row.operationCount || 0);
    current.purchaseCount += Number(row.purchaseCount || 0);
    deptMap.set(key, current);
  }

  return [...deptMap.values()];
}

/**
 * 按部门汇总预算金额，用于柱状图
 * 返回格式: [{ deptName, production, nonProduction }]
 */
export function buildDeptBudgetSummary(productionRows, operationRows) {
  const deptMap = new Map();

  for (const row of productionRows) {
    const dept = canonicalDeptName(row.deptName);
    const amount = toAmount(row.requestAmount);
    const current = deptMap.get(dept) || { deptName: dept, production: 0, nonProduction: 0 };
    current.production += amount;
    deptMap.set(dept, current);
  }

  for (const row of operationRows) {
    const dept = canonicalDeptName(row.deptName);
    const amount = toAmount(row.amount);
    const current = deptMap.get(dept) || { deptName: dept, production: 0, nonProduction: 0 };
    current.nonProduction += amount;
    deptMap.set(dept, current);
  }

  return [...deptMap.values()]
    .sort((a, b) => (b.production + b.nonProduction) - (a.production + a.nonProduction))
    .slice(0, 12); // 取前12个部门
}

/**
 * 按月汇总预算趋势，用于折线图
 * 返回格式: [{ month, production, nonProduction, total }]
 */
export function buildBudgetTrend(productionRows, operationRows) {
  const approvedDetailRows = arguments[2] || [];
  const options = arguments[3] || {};
  const trendYear = String(options.year || '').trim();

  const createMonthRow = (month) => ({
    month,
    monthLabel: month.includes('-') ? `${Number(month.split('-')[1])}月` : month,
    production: 0,
    nonProduction: 0,
    total: 0,
    actualExpense: 0,
  });

  const monthMap = new Map();
  const ensureMonth = (month) => {
    if (!monthMap.has(month)) {
      monthMap.set(month, createMonthRow(month));
    }
    return monthMap.get(month);
  };

  if (trendYear && /^\d{4}$/.test(trendYear)) {
    for (let index = 1; index <= 12; index += 1) {
      const month = `${trendYear}-${String(index).padStart(2, '0')}`;
      ensureMonth(month);
    }
  }

  const shouldIncludeMonth = (month) => {
    if (!month || month === '未知') return false;
    if (!trendYear) return true;
    return month.startsWith(`${trendYear}-`);
  };

  for (const row of productionRows) {
    const month = (row.budgetMonth || formatMonth(row.createTime || row.applicationDate) || '未知').trim();
    if (!shouldIncludeMonth(month)) continue;
    const current = ensureMonth(month);
    current.production += toAmount(row.requestAmount);
  }

  for (const row of operationRows) {
    const month = (row.budgetMonth || formatMonth(row.createTime || row.applicationDate) || '未知').trim();
    if (!shouldIncludeMonth(month)) continue;
    const current = ensureMonth(month);
    current.nonProduction += toAmount(row.amount);
  }

  for (const row of approvedDetailRows) {
    const month = String(row.month || '').trim();
    if (!shouldIncludeMonth(month)) continue;
    const current = ensureMonth(month);
    current.actualExpense += toAmount(row.baseCurrencyAmount || row.amount);
  }

  return [...monthMap.values()]
    .map((item) => ({
      ...item,
      total: item.production + item.nonProduction,
    }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

/**
 * 预算类型分布（生产 vs 非生产），用于饼图
 * 返回格式: [{ name, value }]
 */
export function buildBudgetTypeDistribution(productionRows, operationRows) {
  const productionTotal = productionRows.reduce((sum, r) => sum + toAmount(r.requestAmount), 0);
  const nonProductionTotal = operationRows.reduce((sum, r) => sum + toAmount(r.amount), 0);

  return [
    { name: '生产预算', value: productionTotal },
    { name: '非生产预算', value: nonProductionTotal },
  ].filter((item) => item.value > 0);
}

/**
 * 各部门执行率，用于横向柱状图
 * 返回格式: [{ deptName, budgetTotal, approvedTotal, executionRate }]
 */
export function buildExecutionRateData(executionRows) {
  return aggregateExecutionRowsByDept(executionRows)
    .map((row) => ({
      deptName: row.deptName,
      budgetTotal: toAmount(row.budgetTotal),
      approvedTotal: toAmount(row.approvedTotal),
      remaining: toAmount(row.remaining),
      executionRate: row.budgetTotal > 0 ? Number(((toAmount(row.approvedTotal) / toAmount(row.budgetTotal)) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.executionRate - a.executionRate)
    .slice(0, 10);
}

/**
 * 部门预算 vs 支出对比，用于分组柱状图
 * 返回格式: [{ deptName, budget, approved }]
 */
export function buildDeptApprovedComparison(executionRows) {
  return aggregateExecutionRowsByDept(executionRows)
    .map((row) => ({
      deptName: row.deptName,
      budget: toAmount(row.budgetTotal),
      approved: toAmount(row.approvedTotal),
    }))
    .sort((a, b) => (b.budget + b.approved) - (a.budget + a.approved))
    .slice(0, 10);
}

/**
 * 按执行地区汇总预算金额，用于横向条形图
 * 返回格式: [{ region, production, nonProduction, total }]
 */
export function buildRegionDistribution(productionRecords, nonProductionRecords) {
  const regionMap = new Map();

  const normalizeRegion = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    // 统一常见写法
    if (text.includes('中国') || text.toLowerCase().includes('china')) return '中国';
    if (text.includes('墨西哥') || text.toLowerCase().includes('méxico') || text.toLowerCase().includes('mexico')) return '墨西哥';
    return '';
  };

  for (const record of productionRecords) {
    const region = normalizeRegion(record.execution_region);
    if (!region) continue;
    const cur = regionMap.get(region) || { region, production: 0, nonProduction: 0 };
    cur.production += toAmount(record.total_amount || record.monthly_budget_amount);
    regionMap.set(region, cur);
  }

  for (const record of nonProductionRecords) {
    const region = normalizeRegion(record.execution_region);
    if (!region) continue;
    const cur = regionMap.get(region) || { region, production: 0, nonProduction: 0 };
    cur.nonProduction += toAmount(record.total_amount || record.budget_amount);
    regionMap.set(region, cur);
  }

  return [...regionMap.values()]
    .map((item) => ({ ...item, total: item.production + item.nonProduction }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 预算执行状态分布（按部门），用于横向堆叠条形图
 * 返回格式: [{ deptName, executed, inProgress, unexecuted, total }]
 */
export function buildExecutionStatus(executionRows, productionRecords, nonProductionRecords) {
  const deptMap = new Map();

  // 1. 从 executionRows 汇总已执行金额 + 预算总额
  for (const row of aggregateExecutionRowsByDept(executionRows)) {
    const dept = canonicalDeptName(row.deptName);
    const cur = deptMap.get(dept) || { deptName: dept, totalBudget: 0, executed: 0, inProgress: 0 };
    cur.totalBudget += toAmount(row.budgetTotal);
    cur.executed += toAmount(row.approvedTotal);
    deptMap.set(dept, cur);
  }

  // 2. 从原始预算记录汇总「审批中」金额
  const addPending = (records) => {
    for (const r of records) {
      if (r.status === '审批中') {
        const dept = canonicalDeptName(r.dept_name);
        const cur = deptMap.get(dept) || { deptName: dept, totalBudget: 0, executed: 0, inProgress: 0 };
        cur.inProgress += toAmount(r.total_amount || r.budget_amount || r.monthly_budget_amount);
        // 审批中的记录也可能已计入 totalBudget，不需要再加一次
        if (!executionRows.some((er) => canonicalDeptName(er.deptName) === dept)) {
          cur.totalBudget += toAmount(r.total_amount || r.budget_amount || r.monthly_budget_amount);
        }
        deptMap.set(dept, cur);
      }
    }
  };
  addPending(productionRecords);
  addPending(nonProductionRecords);

  // 3. 计算未执行
  return [...deptMap.values()]
    .map((item) => {
      const remainder = Math.max(0, item.totalBudget - item.executed - item.inProgress);
      return {
        ...item,
        unexecuted: remainder,
        total: item.totalBudget,
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
}

/**
 * 汇总统计数据
 */
export function buildSummaryStats(productionRows, operationRows, executionRows, approvedDetailRows) {
  const productionTotal = productionRows.reduce((sum, r) => sum + toAmount(r.requestAmount), 0);
  const nonProductionTotal = operationRows.reduce((sum, r) => sum + toAmount(r.amount), 0);
  const approvedTotal = executionRows.reduce((sum, r) => sum + toAmount(r.totalApproved), 0);
  const remainingTotal = executionRows.reduce((sum, r) => sum + toAmount(r.remainingBudget), 0);
  const overallRate = (productionTotal + nonProductionTotal) > 0
    ? ((approvedTotal / (productionTotal + nonProductionTotal)) * 100).toFixed(1) + '%'
    : '0%';

  return {
    productionTotal: productionTotal.toFixed(2),
    nonProductionTotal: nonProductionTotal.toFixed(2),
    approvedTotal: approvedTotal.toFixed(2),
    remainingTotal: remainingTotal.toFixed(2),
    overallRate,
    productionCount: productionRows.length,
    operationCount: operationRows.length,
    approvedDetailCount: approvedDetailRows.length,
  };
}
