import { toAmount, formatMonth } from './xlsxReport';

/**
 * 按部门汇总预算金额，用于柱状图
 * 返回格式: [{ deptName, production, nonProduction }]
 */
export function buildDeptBudgetSummary(productionRows, operationRows) {
  const deptMap = new Map();

  for (const row of productionRows) {
    const dept = (row.deptName || '未知').trim();
    const amount = toAmount(row.requestAmount);
    const current = deptMap.get(dept) || { deptName: dept, production: 0, nonProduction: 0 };
    current.production += amount;
    deptMap.set(dept, current);
  }

  for (const row of operationRows) {
    const dept = (row.deptName || '未知').trim();
    const amount = toAmount(row.amount);
    const current = deptMap.get(dept) || { deptName: dept, production: 0, nonProduction: 0 };
    current.nonProduction += amount;
    deptMap.set(dept, current);
  }

  return [...deptMap.values()]
    .sort((a, b) => (b.production + b.nonProduction) - (a.production + b.nonProduction))
    .slice(0, 12); // 取前12个部门
}

/**
 * 按月汇总预算趋势，用于折线图
 * 返回格式: [{ month, production, nonProduction, total }]
 */
export function buildBudgetTrend(productionRows, operationRows) {
  const monthMap = new Map();

  for (const row of productionRows) {
    const month = (row.budgetMonth || formatMonth(row.createTime || row.applicationDate) || '未知').trim();
    const current = monthMap.get(month) || { month, production: 0, nonProduction: 0 };
    current.production += toAmount(row.requestAmount);
    monthMap.set(month, current);
  }

  for (const row of operationRows) {
    const month = (row.budgetMonth || formatMonth(row.createTime || row.applicationDate) || '未知').trim();
    const current = monthMap.get(month) || { month, production: 0, nonProduction: 0 };
    current.nonProduction += toAmount(row.amount);
    monthMap.set(month, current);
  }

  return [...monthMap.values()]
    .map((item) => ({ ...item, total: item.production + item.nonProduction }))
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
  return executionRows
    .map((row) => ({
      deptName: row.deptName,
      budgetTotal: toAmount(row.totalBudget),
      approvedTotal: toAmount(row.totalApproved),
      remaining: toAmount(row.remainingBudget),
      executionRate: row.totalBudget > 0 ? Number(((toAmount(row.totalApproved) / toAmount(row.totalBudget)) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.executionRate - a.executionRate)
    .slice(0, 10);
}

/**
 * 部门预算 vs 已审批对比，用于分组柱状图
 * 返回格式: [{ deptName, budget, approved }]
 */
export function buildDeptApprovedComparison(executionRows) {
  return executionRows
    .map((row) => ({
      deptName: row.deptName,
      month: row.budgetMonth,
      budget: toAmount(row.totalBudget),
      approved: toAmount(row.totalApproved),
    }))
    .sort((a, b) => b.budget - a.budget)
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
    if (!text) return '未指定';
    // 统一常见写法
    if (text.includes('中国') || text.toLowerCase().includes('china')) return '中国';
    if (text.includes('墨西哥') || text.toLowerCase().includes('méxico') || text.toLowerCase().includes('mexico')) return '墨西哥';
    return text;
  };

  for (const record of productionRecords) {
    const region = normalizeRegion(record.execution_region);
    const cur = regionMap.get(region) || { region, production: 0, nonProduction: 0 };
    cur.production += toAmount(record.total_amount || record.monthly_budget_amount);
    regionMap.set(region, cur);
  }

  for (const record of nonProductionRecords) {
    const region = normalizeRegion(record.execution_region);
    const cur = regionMap.get(region) || { region, production: 0, nonProduction: 0 };
    cur.nonProduction += toAmount(record.total_amount || record.budget_amount);
    regionMap.set(region, cur);
  }

  return [...regionMap.values()]
    .map((item) => ({ ...item, total: item.production + item.nonProduction }))
    .sort((a, b) => b.total - a.total);
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
