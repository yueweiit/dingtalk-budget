import ExcelJS from 'exceljs';

// ===== 通用辅助函数 =====

export const toAmount = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
};

export const formatMonth = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 7);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

const formatDate = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString ? date.toISOString().substring(0, 10) : String(value).substring(0, 10);
};

const normalizeItems = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
};

const firstValue = (row, keys, fb = '') => {
  for (const k of keys) { const v = row?.[k]; if (v !== undefined && v !== null && v !== '') return v; }
  return fb;
};

const amountValue = (row) => firstValue(row, ['rmb_amount', 'rmbAmount', 'amount', 'budget_amount', 'budgetAmount', 'total_amount', 'totalAmount', 'monthly_budget_amount', 'monthlyBudgetAmount', 'estimated_overtime_amount', 'estimatedOvertimeAmount', 'original_amount', 'originalAmount'], '');

const cleanDetailItem = (v) => { const t = String(v ?? '').trim(); return ['hr', 'office', 'operation', 'material', 'production', 'labor'].includes(t) ? '' : t; };
const normalizeCurrency = (v) => { const t = String(v ?? '').trim(); return !t || /^\?+$/.test(t) ? '人民币' : t; };

export const sumRows = (rows, key) => rows.reduce((s, r) => s + toAmount(r[key]), 0);

const resolveReportMonth = (s, e) => { const sm = formatMonth(s), em = formatMonth(e); return sm && sm === em ? sm : ''; };
const execMonth = (r, rm) => r.budgetMonth || rm || formatMonth(r.createTime || r.applicationDate) || 'Unspecified';

// ===== 数据行构建（不变） =====

export const buildOperationRows = (records) => {
  const rows = [];
  for (const rec of records) {
    const bc = rows.length;
    for (const [proj, items] of [['人资预算', normalizeItems(rec.hr_items || rec.hrItems)], ['办公场地预算', normalizeItems(rec.office_items || rec.officeItems)], ['管理支出预算', normalizeItems(rec.operation_items || rec.operationItems)]]) {
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        rows.push({ formNo: rec.form_no, project: proj, budgetType: rec.budget_type, originalAmount: firstValue(it, ['original_amount', 'originalAmount', 'operation_expense', 'operationExpense', 'amount'], ''), currency: normalizeCurrency(firstValue(it, ['currency'], '人民币')), detailItem: proj === '办公场地预算' ? '办公场地预算' : cleanDetailItem(firstValue(it, proj === '管理支出预算' ? ['operation_expense', 'operationExpense', 'budget_purpose_detail', 'budgetPurposeDetail', 'detail_item', 'detailItem', 'remark'] : ['detail_item', 'detailItem', 'item_name', 'itemName', 'budget_detail', 'budgetDetail', 'budget_purpose_detail', 'budgetPurposeDetail', 'remark'], '')), amount: amountValue(it), basis: firstValue(it, ['calculation_basis', 'calculationBasis', 'budget_purpose_detail', 'budgetPurposeDetail', 'remark'], ''), applicationDate: formatDate(rec.application_date), budgetMonth: formatMonth(rec.budget_month || rec.declaration_month), deptName: rec.dept_name, status: rec.status, createTime: rec.create_time, });
      }
    }
    if (rows.length === bc) rows.push({ formNo: rec.form_no, project: rec.budget_type || '非生产预算', budgetType: rec.budget_type, originalAmount: rec.budget_amount || rec.total_amount, currency: '人民币', detailItem: rec.remark, amount: rec.total_amount || rec.budget_amount, basis: rec.remark, applicationDate: formatDate(rec.application_date), budgetMonth: formatMonth(rec.budget_month || rec.declaration_month), deptName: rec.dept_name, status: rec.status, createTime: rec.create_time });
  }
  return rows;
};

export const buildProductionRows = (records) => {
  const rows = [];
  for (const rec of records) {
    const bc = rows.length;
    for (const [cat, items] of [['物料预算', normalizeItems(rec.material_items || rec.materialItems)], ['生产费用预算', normalizeItems(rec.production_items || rec.productionItems)], ['人工成本预算', normalizeItems(rec.labor_items || rec.laborItems)]]) {
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        rows.push({ formNo: rec.form_no, category: cat, detailCategory: firstValue(it, ['detail_category', 'detailCategory', 'detail_type', 'detailType', 'item_name', 'itemName'], ''), code: firstValue(it, ['detail_code', 'detailCode', 'expense_detail', 'expenseDetail', 'product_name', 'productName', 'work_type', 'workType', 'specification'], ''), spec: firstValue(it, ['specification', 'production_line', 'productionLine', 'post_name', 'postName'], ''), unit: firstValue(it, ['unit'], ''), unitPrice: firstValue(it, ['unit_price', 'unitPrice'], ''), overtimeHours: firstValue(it, ['overtime_hours', 'overtimeHours', 'quantity'], ''), overtimePrice: firstValue(it, ['overtime_unit_price', 'overtimeUnitPrice'], ''), overtimeAmount: firstValue(it, ['estimated_overtime_amount', 'estimatedOvertimeAmount', 'original_amount', 'originalAmount', 'amount'], ''), monthlyTotal: firstValue(rec, ['monthly_budget_amount', 'monthlyBudgetAmount'], ''), requestQty: firstValue(it, ['request_quantity', 'requestQuantity', 'quantity'], ''), requestAmount: amountValue(it), previousUsed: firstValue(it, ['previous_used', 'previousUsed'], ''), purpose: firstValue(it, ['budget_purpose_detail', 'budgetPurposeDetail', 'remark', 'calculation_basis', 'calculationBasis'], ''), operator: rec.creator_name, remark: firstValue(it, ['remark'], rec.remark || ''), applicationDate: formatDate(rec.application_date), budgetMonth: formatMonth(rec.budget_month || rec.declaration_month), deptName: rec.dept_name });
      }
    }
    if (rows.length === bc) rows.push({ formNo: rec.form_no, category: rec.budget_type || '生产预算', detailCategory: '', code: '', spec: '', unit: '', unitPrice: '', overtimeHours: '', overtimePrice: '', overtimeAmount: '', monthlyTotal: rec.monthly_budget_amount, requestQty: '', requestAmount: rec.total_amount || rec.monthly_budget_amount, previousUsed: '', purpose: rec.remark, operator: rec.creator_name, remark: rec.remark, applicationDate: formatDate(rec.application_date), budgetMonth: formatMonth(rec.budget_month || rec.declaration_month), deptName: rec.dept_name });
  }
  return rows;
};

const addGrouped = (m, r, amt, src, rm) => {
  const dn = String(r.deptName || '').trim() || 'Unknown';
  const bm = String(execMonth(r, rm)).trim() || 'Unspecified';
  const k = `${dn}__${bm}`;
  const c = m.get(k) || { deptName: dn, budgetMonth: bm, productionBudget: 0, nonProductionBudget: 0, operationApproved: 0, purchaseApproved: 0, operationCount: 0, purchaseCount: 0 };
  if (src === 'production') c.productionBudget += amt; else c.nonProductionBudget += amt;
  m.set(k, c);
};

export const buildExecutionRows = ({ productionRows, operationRows, approvedExpenses, reportMonth }) => {
  const g = new Map();
  for (const r of productionRows) addGrouped(g, r, toAmount(r.requestAmount), 'production', reportMonth);
  for (const r of operationRows) addGrouped(g, r, toAmount(r.amount), 'nonProduction', reportMonth);
  for (const it of approvedExpenses || []) {
    const dn = String(it.department || '').trim() || 'Unknown';
    const bm = String(it.month || '').trim() || 'Unspecified';
    const k = `${dn}__${bm}`;
    const c = g.get(k) || { deptName: dn, budgetMonth: bm, productionBudget: 0, nonProductionBudget: 0, operationApproved: 0, purchaseApproved: 0, operationCount: 0, purchaseCount: 0 };
    c.operationApproved += toAmount(it.operationTotal);
    c.purchaseApproved += toAmount(it.purchaseTotal);
    c.operationCount += Number(it.operationCount || 0);
    c.purchaseCount += Number(it.purchaseCount || 0);
    g.set(k, c);
  }
  return [...g.values()].map((r) => { const tb = r.productionBudget + r.nonProductionBudget; const ta = r.operationApproved + r.purchaseApproved; return { ...r, totalBudget: tb, totalApproved: ta, remainingBudget: tb - ta, executionRate: tb > 0 ? `${((ta / tb) * 100).toFixed(2)}%` : '' }; }).sort((a, b) => String(a.budgetMonth).localeCompare(String(b.budgetMonth)) || String(a.deptName).localeCompare(String(b.deptName)));
};

export const buildApprovedDetailRows = (d = []) => d.map((it) => ({ expenseKind: it.expense_kind === 'purchase' ? '采购支出' : '运营支出', department: firstValue(it, ['department_resolved', 'applicant_department', 'creator_department', 'query_department'], ''), month: firstValue(it, ['query_month'], formatMonth(it.source_created_at || it.request_date || it.approval_completed_at)), businessId: it.business_id, title: it.title, amount: firstValue(it, ['amount', 'detail_summary_amount', 'source_amount', 'total_amount', 'base_currency_amount'], ''), baseCurrencyAmount: firstValue(it, ['base_currency_amount', 'amount_rmb'], ''), approvalStatus: it.approval_status, requestDate: formatDate(it.request_date), sourceCreatedAt: formatDate(it.source_created_at), approvalCompletedAt: formatDate(it.approval_completed_at), bizAction: it.biz_action })).sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.department).localeCompare(String(b.department)));

// ===== 样式常量（严格匹配 Python） =====

const FONT_MAIN = 'Microsoft YaHei';
const C_TITLE_BG = '003366';
const C_HEADER_BG = '0070C0';
const C_HEADER_FONT = 'FFFFFF';
const C_ZEBRA = 'EBF1F8';
const C_WHITE = 'FFFFFF';

const makeFont = (sz, bold) => ({ name: FONT_MAIN, size: sz, bold, color: bold ? { argb: 'FF' + C_HEADER_FONT } : { argb: 'FF333333' } });
const makeFill = (color) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } });
const thinBorder = { style: 'thin', color: { argb: 'FFD9D9D9' } };
const fullBorder = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function applyCellStyle(cell, font, fill, align, border, numFmt) {
  cell.font = font;
  if (fill) cell.fill = fill;
  cell.alignment = align;
  cell.border = border || fullBorder;
  if (numFmt) cell.numFmt = numFmt;
}

function mergeAndTitle(ws, colCount, text) {
  const lastCol = String.fromCharCode(64 + colCount);
  ws.mergeCells(`A1:${lastCol}1`);
  const cell = ws.getCell('A1');
  cell.value = text;
  applyCellStyle(cell, makeFont(14, true), makeFill(C_TITLE_BG), { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder);
  ws.getRow(1).height = 40;
}

function writeHeaders(ws, row, headers, colOffset = 0) {
  headers.forEach((h, i) => {
    const cell = ws.getRow(row).getCell(colOffset + i + 1);
    cell.value = h;
    applyCellStyle(cell, makeFont(12, true), makeFill(C_HEADER_BG), { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder);
  });
  ws.getRow(row).height = 30;
}

// ===== 主导出函数 =====

export async function createBudgetReportWorkbook(data) {
  const { production = [], nonProduction = [], approvedExpenses = [], approvedExpenseDetails = [], reportStartDate = '', reportEndDate = '' } = data;

  const operationRows = buildOperationRows(nonProduction);
  const productionRows = buildProductionRows(production);
  const reportMonth = resolveReportMonth(reportStartDate, reportEndDate);
  const executionRows = buildExecutionRows({ productionRows, operationRows, approvedExpenses, reportMonth });
  const approvedDetailRows = buildApprovedDetailRows(approvedExpenseDetails);

  const productionTotal = productionRows.reduce((s, r) => s + toAmount(r.requestAmount), 0);
  const nonProductionTotal = operationRows.reduce((s, r) => s + toAmount(r.amount), 0);
  const grandTotal = productionTotal + nonProductionTotal;
  const totalApproved = sumRows(executionRows, 'totalApproved');
  const remainingAmount = grandTotal - totalApproved;
  const execRateStr = grandTotal > 0 ? `${((totalApproved / grandTotal) * 100).toFixed(2)}%` : '0%';

  // ===== 部门预算分布数据 =====
  const deptMap = new Map();
  for (const r of productionRows) { const d = (r.deptName || '未知').trim(); const c = deptMap.get(d) || { deptName: d, prod: 0, nonProd: 0 }; c.prod += toAmount(r.requestAmount); deptMap.set(d, c); }
  for (const r of operationRows) { const d = (r.deptName || '未知').trim(); const c = deptMap.get(d) || { deptName: d, prod: 0, nonProd: 0 }; c.nonProd += toAmount(r.amount); deptMap.set(d, c); }
  const deptBudgetList = [...deptMap.values()].sort((a, b) => (b.prod + b.nonProd) - (a.prod + a.nonProd)).slice(0, 12);

  // ===== 月度趋势数据 =====
  const monthMap = new Map();
  for (const r of productionRows) { const m = (r.budgetMonth || formatMonth(r.createTime || r.applicationDate) || '未知').trim(); const c = monthMap.get(m) || { month: m, prod: 0, nonProd: 0 }; c.prod += toAmount(r.requestAmount); monthMap.set(m, c); }
  for (const r of operationRows) { const m = (r.budgetMonth || formatMonth(r.createTime || r.applicationDate) || '未知').trim(); const c = monthMap.get(m) || { month: m, prod: 0, nonProd: 0 }; c.nonProd += toAmount(r.amount); monthMap.set(m, c); }
  const trendList = [...monthMap.values()].map((r) => ({ ...r, total: r.prod + r.nonProd })).sort((a, b) => String(a.month).localeCompare(String(b.month)));

  // ===== 部门执行率数据 =====
  const execRateList = executionRows.map((r) => ({ deptName: r.deptName, budgetMonth: r.budgetMonth, totalBudget: toAmount(r.totalBudget), totalApproved: toAmount(r.totalApproved), remainingBudget: toAmount(r.remainingBudget), rate: r.totalBudget > 0 ? Number(((toAmount(r.totalApproved) / toAmount(r.totalBudget)) * 100).toFixed(1)) / 100 : 0 })).sort((a, b) => b.rate - a.rate).slice(0, 10);

  // ===== 部门预算vs已审批数据 =====
  const deptCompList = executionRows.map((r) => ({ deptName: r.deptName, budgetMonth: r.budgetMonth, budget: toAmount(r.totalBudget), approved: toAmount(r.totalApproved), remaining: toAmount(r.remainingBudget) })).sort((a, b) => b.budget - a.budget).slice(0, 10);

  // 明细数据（取前10条非生产记录）
  const detailRecords = nonProduction.slice(0, 10);

  // ===== 创建工作簿（极简创建，不设额外属性） =====
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DingTalk Budget System';

  // === Sheet 1: 预算汇总表 ===
  const ws1 = wb.addWorksheet('预算汇总表');
  ws1.id = 1; ws1.orderNo = 1;
  mergeAndTitle(ws1, 2, '预算管理报表 — 汇总');
  writeHeaders(ws1, 2, ['指标', '数值']);

  const summaryData = [
    ['生产预算单数', production.length],
    ['非生产预算单数', nonProduction.length],
    ['生产预算明细行数', productionRows.length],
    ['非生产预算明细行数', operationRows.length],
    ['审批支出明细行数', approvedDetailRows.length],
    ['生产预算金额', productionTotal],
    ['非生产预算金额', nonProductionTotal],
    ['预算总额', grandTotal],
    ['已审批运营支出金额', sumRows(executionRows, 'operationApproved')],
    ['已审批采购支出金额', sumRows(executionRows, 'purchaseApproved')],
    ['已审批支出合计', totalApproved],
    ['剩余额度', remainingAmount],
    ['整体执行率', grandTotal > 0 ? totalApproved / grandTotal : 0],
  ];

  summaryData.forEach((r, i) => {
    const row = ws1.getRow(3 + i);
    const c1 = row.getCell(1); const c2 = row.getCell(2);
    c1.value = r[0]; c2.value = r[1];
    applyCellStyle(c1, makeFont(11, false), null, { horizontal: 'left', vertical: 'middle', wrapText: true }, fullBorder);
    applyCellStyle(c2, makeFont(11, false), null, { horizontal: 'right', vertical: 'middle', wrapText: true }, fullBorder, /金额|合计|额度/.test(r[0]) ? '¥#,##0.00' : /执行率/.test(r[0]) ? '0%' : null);
  });

  ws1.getColumn(1).width = 28; ws1.getColumn(2).width = 20;
  ws1.views = [{ state: 'frozen', ySplit: 2 }];

  // === Sheet 2: 预算明细数据表（显式创建 + 立即设可见） ===
  const ws2 = wb.addWorksheet('预算明细数据表');
  ws2.id = 2; ws2.orderNo = 2;
  mergeAndTitle(ws2, 9, '预算管理系统 — 非生产预算明细');
  writeHeaders(ws2, 2, ['表单编号', '部门', '预算类型', '申请日期', '预算月份', '执行地区', '状态', '创建时间', '操作']);

  detailRecords.forEach((rec, ri) => {
    const row = ws2.getRow(3 + ri);
    const vals = [rec.form_no, rec.dept_name || '', rec.budget_type || '非生产', formatDate(rec.application_date), formatMonth(rec.budget_month || rec.declaration_month), rec.execution_region || '', rec.status || '已通过', rec.create_time || '', '详情'];
    vals.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      const bg = ri % 2 === 0 ? C_WHITE : C_ZEBRA;
      applyCellStyle(cell, makeFont(11, false), makeFill(bg), { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder, ci === 0 ? '@' : null);
    });
  });

  ws2.getColumn(1).width = 26; ws2.getColumn(2).width = 32; ws2.getColumn(3).width = 12;
  ws2.getColumn(4).width = 14; ws2.getColumn(5).width = 14; ws2.getColumn(6).width = 16;
  ws2.getColumn(7).width = 10; ws2.getColumn(8).width = 20; ws2.getColumn(9).width = 8;
  ws2.views = [{ state: 'frozen', ySplit: 2 }];

  // === Sheet 3: 预算可视化仪表盘（显式创建 + 立即设可见） ===
  const ws3 = wb.addWorksheet('预算可视化仪表盘');
  ws3.id = 3; ws3.orderNo = 3;
  mergeAndTitle(ws3, 16, '预算管理系统 — 可视化仪表盘');

  // ---- 4.1 部门预算分布数据 ----
  writeHeaders(ws3, 3, ['部门', '生产预算', '非生产预算']);
  deptBudgetList.forEach((r, i) => {
    const row = ws3.getRow(4 + i);
    row.getCell(1).value = r.deptName; row.getCell(2).value = r.prod; row.getCell(3).value = r.nonProd;
    [1, 2, 3].forEach((c) => { applyCellStyle(row.getCell(c), makeFont(11, false), null, { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder, c >= 2 ? '¥#,##0' : null); });
  });
  // 合计行
  const drDept = deptBudgetList.length;
  const totalRow = ws3.getRow(4 + drDept);
  totalRow.getCell(1).value = '合计';
  totalRow.getCell(2).value = deptBudgetList.reduce((s, r) => s + r.prod, 0);
  totalRow.getCell(3).value = deptBudgetList.reduce((s, r) => s + r.nonProd, 0);
  [1, 2, 3].forEach((c) => applyCellStyle(totalRow.getCell(c), makeFont(11, true), makeFill('D6E4F0'), { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder, c >= 2 ? '¥#,##0' : null));

  // ---- 4.2 预算类型占比数据 ----
  writeHeaders(ws3, 3, ['预算类型', '金额'], 5);
  const typeRows = [['生产预算', productionTotal], ['非生产预算', nonProductionTotal], ['合计', grandTotal]];
  typeRows.forEach((r, i) => {
    const row = ws3.getRow(4 + i);
    row.getCell(5).value = r[0]; row.getCell(6).value = r[1];
    applyCellStyle(row.getCell(5), makeFont(11, false), null, { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder);
    applyCellStyle(row.getCell(6), makeFont(11, false), null, { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder, '¥#,##0.00');
  });

  // ---- 4.3 月度预算趋势数据 ----
  const trendStartRow = 32;
  writeHeaders(ws3, trendStartRow, ['月份', '合计', '生产预算', '非生产预算']);
  trendList.forEach((r, i) => {
    const row = ws3.getRow(trendStartRow + 1 + i);
    row.getCell(1).value = r.month; row.getCell(2).value = r.total; row.getCell(3).value = r.prod; row.getCell(4).value = r.nonProd;
    [1, 2, 3, 4].forEach((c) => applyCellStyle(row.getCell(c), makeFont(11, false), null, { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder, c >= 2 ? '¥#,##0.00' : null));
  });
  const drTrend = trendList.length;

  // ---- 4.4 部门执行率数据 ----
  const rateStartRow = 55;
  writeHeaders(ws3, rateStartRow, ['部门', '执行率']);
  execRateList.forEach((r, i) => {
    const row = ws3.getRow(rateStartRow + 1 + i);
    row.getCell(1).value = r.deptName; row.getCell(2).value = r.rate;
    applyCellStyle(row.getCell(1), makeFont(11, false), null, { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder);
    applyCellStyle(row.getCell(2), makeFont(11, false), null, { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder, '0%');
  });
  const drRate = execRateList.length;

  // ---- 4.5 部门预算vs已审批数据 ----
  writeHeaders(ws3, rateStartRow, ['部门', '预算金额', '已审批支出'], 5);
  deptCompList.forEach((r, i) => {
    const row = ws3.getRow(rateStartRow + 1 + i);
    row.getCell(5).value = r.deptName; row.getCell(6).value = r.budget; row.getCell(7).value = r.approved;
    [5, 6, 7].forEach((c) => applyCellStyle(row.getCell(c), makeFont(11, false), null, { horizontal: 'center', vertical: 'middle', wrapText: true }, fullBorder, c >= 6 ? '¥#,##0' : null));
  });
  const drComp = deptCompList.length;

  // === 5 个图表 ===

  // --- 4.1 各部门预算分布柱状图 ---
  const colDeptLast = String.fromCharCode(64 + 3);
  if (drDept > 0) {
    try {
      ws3.addChart('column', {
        title: { text: '各部门预算分布（Top 12）' },
        axes: { category: { title: { text: '部门' } }, value: { title: { text: '预算占比' } } },
        series: [
          { name: '生产预算', categories: `A4:A${3 + drDept}`, values: `B4:B${3 + drDept}` },
          { name: '非生产预算', categories: `A4:A${3 + drDept}`, values: `C4:C${3 + drDept}` },
        ],
      });
    } catch (e) { console.warn('Chart 1 error:', e.message); }
  }

  // --- 4.2 预算类型占比饼图 ---
  try {
    ws3.addChart('pie', {
      title: { text: '预算类型占比' },
      series: [{ name: '金额', categories: `E4:E5`, values: `F4:F5` }],
    });
  } catch (e) { console.warn('Chart 2 error:', e.message); }

  // --- 4.3 月度预算趋势折线图 ---
  if (drTrend > 0) {
    try {
      ws3.addChart('line', {
        title: { text: '月度预算趋势' },
        axes: { category: { title: { text: '月份' } }, value: { title: { text: '预算金额（元）' } } },
        series: [
          { name: '合计', categories: `A${trendStartRow + 1}:A${trendStartRow + drTrend}`, values: `B${trendStartRow + 1}:B${trendStartRow + drTrend}` },
          { name: '生产预算', categories: `A${trendStartRow + 1}:A${trendStartRow + drTrend}`, values: `C${trendStartRow + 1}:C${trendStartRow + drTrend}` },
          { name: '非生产预算', categories: `A${trendStartRow + 1}:A${trendStartRow + drTrend}`, values: `D${trendStartRow + 1}:D${trendStartRow + drTrend}` },
        ],
      });
    } catch (e) { console.warn('Chart 3 error:', e.message); }
  }

  // --- 4.4 各部门执行率条形图 ---
  if (drRate > 0) {
    try {
      ws3.addChart('bar', {
        title: { text: '各部门执行率（Top 10）' },
        axes: { category: { title: { text: '执行率' } }, value: { title: { text: '部门' } } },
        series: [{ name: '执行率', categories: `A${rateStartRow + 1}:A${rateStartRow + drRate}`, values: `B${rateStartRow + 1}:B${rateStartRow + drRate}` }],
      });
    } catch (e) { console.warn('Chart 4 error:', e.message); }
  }

  // --- 4.5 部门预算vs已审批对比柱状图 ---
  if (drComp > 0) {
    try {
      ws3.addChart('column', {
        title: { text: '部门预算 vs 已审批支出（Top 10）' },
        axes: { category: { title: { text: '部门' } }, value: { title: { text: '金额（元）' } } },
        series: [
          { name: '预算金额', categories: `E${rateStartRow + 1}:E${rateStartRow + drComp}`, values: `F${rateStartRow + 1}:F${rateStartRow + drComp}` },
          { name: '已审批支出', categories: `E${rateStartRow + 1}:E${rateStartRow + drComp}`, values: `G${rateStartRow + 1}:G${rateStartRow + drComp}` },
        ],
      });
    } catch (e) { console.warn('Chart 5 error:', e.message); }
  }

  // 列宽
  ws3.getColumn(1).width = 20; ws3.getColumn(2).width = 16; ws3.getColumn(3).width = 16; ws3.getColumn(4).width = 16;
  ws3.getColumn(5).width = 20; ws3.getColumn(6).width = 18; ws3.getColumn(7).width = 18;

  // ===== 写入 buffer =====
  const buffer = await wb.xlsx.writeBuffer({ useSharedStrings: true, useStyles: true });
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ===== 下载辅助 =====

export const saveWorkbook = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
