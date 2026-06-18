import express from 'express';
import ExcelJS from 'exceljs';

const router = express.Router();

// ===== 数据辅助函数(服务端) =====
const toAmount = (v) => { if (v === null || v === undefined || v === '') return 0; const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const formatMonth = (v) => { if (!v) return ''; const r = String(v).trim(); if (/^\d{4}-\d{2}$/.test(r)) return r; if (/^\d{4}-\d{2}-\d{2}/.test(r)) return r.substring(0, 7); const d = new Date(v); if (Number.isNaN(d.getTime())) return r; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const formatDate = (v) => { if (!v) return ''; const t = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.substring(0, 10); const d = new Date(v); if (Number.isNaN(d.getTime())) return t; return d.toISOString().substring(0, 10); };
const firstValue = (row, keys, fb = '') => { for (const k of keys) { const v = row?.[k]; if (v !== undefined && v !== null && v !== '') return v; } return fb; };
const normalizeItems = (v) => { if (!v) return []; if (Array.isArray(v)) return v; if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } } return []; };
const normalizeCurrency = (v) => { const t = String(v ?? '').trim(); return !t || /^\?+$/.test(t) ? '人民币' : t; };
const cleanDetailItem = (v) => { const t = String(v ?? '').trim(); return ['hr', 'office', 'operation', 'material', 'production', 'labor'].includes(t) ? '' : t; };
const amountValue = (row) => firstValue(row, ['rmb_amount', 'rmbAmount', 'amount', 'budget_amount', 'budgetAmount', 'total_amount', 'totalAmount', 'monthly_budget_amount', 'monthlyBudgetAmount', 'estimated_overtime_amount', 'estimatedOvertimeAmount', 'original_amount', 'originalAmount'], '');
const execMonth = (r, rm) => r.budgetMonth || rm || formatMonth(r.createTime || r.applicationDate) || 'Unspecified';
const resolveReportMonth = (s, e) => { const sm = formatMonth(s), em = formatMonth(e); return sm && sm === em ? sm : ''; };

const buildOperationRows = (records) => {
  const rows = [];
  for (const rec of records) {
    const bc = rows.length;
    for (const [proj, items] of [['人资预算', normalizeItems(rec.hr_items || rec.hrItems)], ['办公场地预算', normalizeItems(rec.office_items || rec.officeItems)], ['管理支出预算', normalizeItems(rec.operation_items || rec.operationItems)]]) {
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        rows.push({ formNo: rec.form_no, deptName: rec.dept_name, budgetType: rec.budget_type, project: proj, amount: amountValue(it), requestAmount: amountValue(it), detailItem: proj === '办公场地预算' ? '办公场地预算' : cleanDetailItem(firstValue(it, proj === '管理支出预算' ? ['operation_expense', 'operationExpense', 'budget_purpose_detail', 'budgetPurposeDetail', 'detail_item', 'detailItem', 'remark'] : ['detail_item', 'detailItem', 'item_name', 'itemName', 'budget_detail', 'budgetDetail', 'budget_purpose_detail', 'budgetPurposeDetail', 'remark'], '')), applicationDate: formatDate(rec.application_date), budgetMonth: formatMonth(rec.budget_month || rec.declaration_month), createTime: rec.create_time, status: rec.status, originalAmount: firstValue(it, ['original_amount', 'originalAmount', 'operation_expense', 'operationExpense', 'amount'], ''), currency: normalizeCurrency(firstValue(it, ['currency'], '人民币')), basis: firstValue(it, ['calculation_basis', 'calculationBasis', 'budget_purpose_detail', 'budgetPurposeDetail', 'remark'], '') });
      }
    }
    if (rows.length === bc) rows.push({ formNo: rec.form_no, deptName: rec.dept_name, budgetType: rec.budget_type, project: rec.budget_type || '非生产预算', amount: toAmount(rec.total_amount || rec.budget_amount), requestAmount: toAmount(rec.total_amount || rec.monthly_budget_amount), detailItem: rec.remark, applicationDate: formatDate(rec.application_date), budgetMonth: formatMonth(rec.budget_month || rec.declaration_month), createTime: rec.create_time, status: rec.status, originalAmount: rec.budget_amount || rec.total_amount, currency: '人民币', basis: rec.remark });
  }
  return rows;
};

const buildProductionRows = (records) => {
  const rows = [];
  for (const rec of records) {
    const bc = rows.length;
    for (const [cat, items] of [['物料预算', normalizeItems(rec.material_items || rec.materialItems)], ['生产费用预算', normalizeItems(rec.production_items || rec.productionItems)], ['人工成本预算', normalizeItems(rec.labor_items || rec.laborItems)]]) {
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        rows.push({ formNo: rec.form_no, deptName: rec.dept_name, category: cat, requestAmount: amountValue(it), applicationDate: formatDate(rec.application_date), budgetMonth: formatMonth(rec.budget_month || rec.declaration_month), createTime: rec.create_time });
      }
    }
    if (rows.length === bc) rows.push({ formNo: rec.form_no, deptName: rec.dept_name, category: rec.budget_type || '生产预算', requestAmount: toAmount(rec.total_amount || rec.monthly_budget_amount), applicationDate: formatDate(rec.application_date), budgetMonth: formatMonth(rec.budget_month || rec.declaration_month), createTime: rec.create_time });
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

const buildExecutionRows = ({ productionRows, operationRows, approvedExpenses, reportMonth }) => {
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
  return [...g.values()].map((r) => { const tb = r.productionBudget + r.nonProductionBudget; const ta = r.operationApproved + r.purchaseApproved; return { ...r, totalBudget: tb, totalApproved: ta, remainingBudget: tb - ta }; }).sort((a, b) => String(a.budgetMonth).localeCompare(String(b.budgetMonth)) || String(a.deptName).localeCompare(String(b.deptName)));
};

const buildApprovedDetailRows = (d = []) => d.map((it) => ({ expenseKind: it.expense_kind === 'purchase' ? '采购支出' : '运营支出', department: firstValue(it, ['department_resolved', 'applicant_department', 'creator_department', 'query_department'], ''), month: firstValue(it, ['query_month'], formatMonth(it.source_created_at || it.request_date || it.approval_completed_at)), businessId: it.business_id, title: it.title, amount: firstValue(it, ['amount', 'detail_summary_amount', 'source_amount', 'total_amount', 'base_currency_amount'], ''), baseCurrencyAmount: firstValue(it, ['base_currency_amount', 'amount_rmb'], ''), approvalStatus: it.approval_status, requestDate: formatDate(it.request_date), sourceCreatedAt: formatDate(it.source_created_at), approvalCompletedAt: formatDate(it.approval_completed_at), bizAction: it.biz_action }));

const sumRows = (rows, key) => rows.reduce((s, r) => s + toAmount(r[key]), 0);

// ===== 样式 =====
const FONT = 'Microsoft YaHei';
const titleFont = { name: FONT, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
const headerFont = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
const dataFont = { name: FONT, size: 11 };
const titleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003366' } };
const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF1F8' } };
const border = { style: 'thin', color: { argb: 'FFD9D9D9' } };
const fullBorder = { top: border, bottom: border, left: border, right: border };
const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
const leftAlign = { horizontal: 'left', vertical: 'middle', wrapText: true };
const rightAlign = { horizontal: 'right', vertical: 'middle', wrapText: true };

function mergeTitle(ws, cols, text) {
  const lastCol = String.fromCharCode(64 + cols);
  ws.mergeCells(`A1:${lastCol}1`);
  const c = ws.getCell('A1');
  c.value = text; c.font = titleFont; c.fill = titleFill; c.alignment = centerAlign; c.border = fullBorder;
  ws.getRow(1).height = 40;
}

function writeHeaders(ws, row, headers, colOff = 0) {
  headers.forEach((h, i) => {
    const c = ws.getRow(row).getCell(colOff + i + 1);
    c.value = h; c.font = headerFont; c.fill = headerFill; c.alignment = centerAlign; c.border = fullBorder;
  });
  ws.getRow(row).height = 30;
}

function styleDataCell(c, font, fill, align, numFmt) {
  c.font = font; if (fill) c.fill = fill; c.alignment = align; c.border = fullBorder; if (numFmt) c.numFmt = numFmt;
}

// ===== 主导出端点 =====
router.post('/export', async (req, res) => {
  try {
    const { production = [], nonProduction = [], approvedExpenses = [], approvedExpenseDetails = [], reportStartDate, reportEndDate } = req.body;

    const operationRows = buildOperationRows(nonProduction);
    const productionRows = buildProductionRows(production);
    const reportMonth = resolveReportMonth(reportStartDate, reportEndDate);
    const executionRows = buildExecutionRows({ productionRows, operationRows, approvedExpenses, reportMonth });
    const approvedDetailRows = buildApprovedDetailRows(approvedExpenseDetails);

    const prodTotal = productionRows.reduce((s, r) => s + toAmount(r.requestAmount), 0);
    const nonProdTotal = operationRows.reduce((s, r) => s + toAmount(r.amount), 0);
    const grandTotal = prodTotal + nonProdTotal;
    const totalAppr = sumRows(executionRows, 'totalApproved');

    // 部门预算分布
    const deptMap = new Map();
    for (const r of productionRows) { const d = (r.deptName || '未知').trim(); const c = deptMap.get(d) || { n: d, p: 0, np: 0 }; c.p += toAmount(r.requestAmount); deptMap.set(d, c); }
    for (const r of operationRows) { const d = (r.deptName || '未知').trim(); const c = deptMap.get(d) || { n: d, p: 0, np: 0 }; c.np += toAmount(r.amount); deptMap.set(d, c); }
    const deptList = [...deptMap.values()].sort((a, b) => (b.p + b.np) - (a.p + a.np)).slice(0, 12);

    // 月度趋势
    const monMap = new Map();
    for (const r of productionRows) { const m = (r.budgetMonth || formatMonth(r.createTime || r.applicationDate) || '未知').trim(); const c = monMap.get(m) || { m, p: 0, np: 0 }; c.p += toAmount(r.requestAmount); monMap.set(m, c); }
    for (const r of operationRows) { const m = (r.budgetMonth || formatMonth(r.createTime || r.applicationDate) || '未知').trim(); const c = monMap.get(m) || { m, p: 0, np: 0 }; c.np += toAmount(r.amount); monMap.set(m, c); }
    const trendList = [...monMap.values()].map((r) => ({ ...r, t: r.p + r.np })).sort((a, b) => String(a.m).localeCompare(String(b.m)));

    // 执行率
    const execRateList = executionRows.map((r) => ({ n: r.deptName, bm: r.budgetMonth, tb: toAmount(r.totalBudget), ta: toAmount(r.totalApproved), rate: r.totalBudget > 0 ? toAmount(r.totalApproved) / toAmount(r.totalBudget) : 0 })).sort((a, b) => b.rate - a.rate).slice(0, 10);

    // 部门对比
    const deptCompList = executionRows.map((r) => ({ n: r.deptName, bm: r.budgetMonth, bgt: toAmount(r.totalBudget), apr: toAmount(r.totalApproved) })).sort((a, b) => b.bgt - a.bgt).slice(0, 10);

    const detailRecords = nonProduction.slice(0, 10);

    // ===== 创建 Workbook =====
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DingTalk Budget System';

    // Sheet 1
    const ws1 = wb.addWorksheet('预算汇总表', { properties: { tabColor: { argb: 'FF003366' } } });
    mergeTitle(ws1, 2, '预算管理报表 — 汇总');
    writeHeaders(ws1, 2, ['指标', '数值']);
    const sumData = [
      ['生产预算单数', production.length], ['非生产预算单数', nonProduction.length],
      ['生产预算明细行数', productionRows.length], ['非生产预算明细行数', operationRows.length],
      ['审批支出明细行数', approvedDetailRows.length], ['生产预算金额', prodTotal],
      ['非生产预算金额', nonProdTotal], ['预算总额', grandTotal],
      ['已审批运营支出金额', sumRows(executionRows, 'operationApproved')],
      ['已审批采购支出金额', sumRows(executionRows, 'purchaseApproved')],
      ['已审批支出合计', totalAppr], ['剩余额度', grandTotal - totalAppr],
      ['整体执行率', grandTotal > 0 ? totalAppr / grandTotal : 0],
    ];
    sumData.forEach((r, i) => {
      const c1 = ws1.getRow(3 + i).getCell(1); c1.value = r[0]; styleDataCell(c1, dataFont, null, leftAlign);
      const c2 = ws1.getRow(3 + i).getCell(2); c2.value = r[1]; styleDataCell(c2, dataFont, null, rightAlign, /金额|合计|额度/.test(r[0]) ? '¥#,##0.00' : /执行率/.test(r[0]) ? '0%' : null);
    });
    ws1.getColumn(1).width = 28; ws1.getColumn(2).width = 20;
    ws1.views = [{ state: 'frozen', ySplit: 2 }];

    // Sheet 2
    const ws2 = wb.addWorksheet('预算明细数据表', { properties: { tabColor: { argb: 'FF0070C0' } } });
    mergeTitle(ws2, 9, '预算管理系统 — 明细数据');
    writeHeaders(ws2, 2, ['表单编号', '部门', '预算类型', '申请日期', '预算月份', '执行地区', '状态', '创建时间', '操作']);
    detailRecords.forEach((rec, ri) => {
      const vals = [rec.form_no, rec.dept_name || '', rec.budget_type || '非生产', formatDate(rec.application_date), formatMonth(rec.budget_month || rec.declaration_month), rec.execution_region || '', rec.status || '已通过', rec.create_time || '', '详情'];
      vals.forEach((v, ci) => {
        const cell = ws2.getRow(3 + ri).getCell(ci + 1); cell.value = v;
        styleDataCell(cell, dataFont, ri % 2 === 1 ? zebraFill : null, centerAlign, ci === 0 ? '@' : null);
      });
    });
    [26, 32, 12, 14, 14, 16, 10, 20, 8].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });
    ws2.views = [{ state: 'frozen', ySplit: 2 }];

    // Sheet 3
    const ws3 = wb.addWorksheet('预算可视化仪表盘', { properties: { tabColor: { argb: 'FF00B050' } } });
    mergeTitle(ws3, 7, '预算管理系统 — 可视化仪表盘');

    // 4.1 部门预算分布
    writeHeaders(ws3, 3, ['部门', '生产预算', '非生产预算']);
    deptList.forEach((r, i) => {
      const row = ws3.getRow(4 + i);
      const c1 = row.getCell(1); c1.value = r.n; styleDataCell(c1, dataFont, null, centerAlign);
      const c2 = row.getCell(2); c2.value = r.p; styleDataCell(c2, dataFont, null, centerAlign, '¥#,##0');
      const c3 = row.getCell(3); c3.value = r.np; styleDataCell(c3, dataFont, null, centerAlign, '¥#,##0');
    });
    const drD = deptList.length;

    // 4.2 预算类型占比
    writeHeaders(ws3, 3, ['预算类型', '金额'], 5);
    [['生产预算', prodTotal], ['非生产预算', nonProdTotal]].forEach((r, i) => {
      ws3.getRow(4 + i).getCell(5).value = r[0]; styleDataCell(ws3.getRow(4 + i).getCell(5), dataFont, null, centerAlign);
      ws3.getRow(4 + i).getCell(6).value = r[1]; styleDataCell(ws3.getRow(4 + i).getCell(6), dataFont, null, centerAlign, '¥#,##0.00');
    });

    // 4.3 月度趋势
    const tR = 32;
    writeHeaders(ws3, tR, ['月份', '合计', '生产预算', '非生产预算']);
    trendList.forEach((r, i) => {
      const row = ws3.getRow(tR + 1 + i);
      row.getCell(1).value = r.m; styleDataCell(row.getCell(1), dataFont, null, centerAlign);
      row.getCell(2).value = r.t; styleDataCell(row.getCell(2), dataFont, null, centerAlign, '¥#,##0.00');
      row.getCell(3).value = r.p; styleDataCell(row.getCell(3), dataFont, null, centerAlign, '¥#,##0.00');
      row.getCell(4).value = r.np; styleDataCell(row.getCell(4), dataFont, null, centerAlign, '¥#,##0.00');
    });
    const drT = trendList.length;

    // 4.4 执行率
    const rR = 55;
    writeHeaders(ws3, rR, ['部门', '执行率']);
    execRateList.forEach((r, i) => {
      const row = ws3.getRow(rR + 1 + i);
      row.getCell(1).value = r.n; styleDataCell(row.getCell(1), dataFont, null, centerAlign);
      row.getCell(2).value = r.rate; styleDataCell(row.getCell(2), dataFont, null, centerAlign, '0%');
    });
    const drR = execRateList.length;

    // 4.5 预算vs已审批
    writeHeaders(ws3, rR, ['部门', '预算金额', '已审批支出'], 5);
    deptCompList.forEach((r, i) => {
      const row = ws3.getRow(rR + 1 + i);
      row.getCell(5).value = r.n; styleDataCell(row.getCell(5), dataFont, null, centerAlign);
      row.getCell(6).value = r.bgt; styleDataCell(row.getCell(6), dataFont, null, centerAlign, '¥#,##0');
      row.getCell(7).value = r.apr; styleDataCell(row.getCell(7), dataFont, null, centerAlign, '¥#,##0');
    });
    const drC = deptCompList.length;

    // 图表
    if (drD > 0) try { ws3.addChart('column', { title: { text: '各部门预算分布（Top 12）' }, axes: { category: { title: { text: '部门' } }, value: { title: { text: '金额' } } }, series: [{ name: '生产预算', categories: `A4:A${3 + drD}`, values: `B4:B${3 + drD}` }, { name: '非生产预算', categories: `A4:A${3 + drD}`, values: `C4:C${3 + drD}` }] }); } catch (e) { console.warn('Chart1:', e.message); }
    try { ws3.addChart('pie', { title: { text: '预算类型占比' }, series: [{ name: '金额', categories: `E4:E5`, values: `F4:F5` }] }); } catch (e) { console.warn('Chart2:', e.message); }
    if (drT > 0) try { ws3.addChart('line', { title: { text: '月度预算趋势' }, axes: { category: { title: { text: '月份' } }, value: { title: { text: '金额(元)' } } }, series: [{ name: '合计', categories: `A${tR + 1}:A${tR + drT}`, values: `B${tR + 1}:B${tR + drT}` }, { name: '生产预算', categories: `A${tR + 1}:A${tR + drT}`, values: `C${tR + 1}:C${tR + drT}` }, { name: '非生产预算', categories: `A${tR + 1}:A${tR + drT}`, values: `D${tR + 1}:D${tR + drT}` }] }); } catch (e) { console.warn('Chart3:', e.message); }
    if (drR > 0) try { ws3.addChart('bar', { title: { text: '各部门执行率（Top 10）' }, axes: { category: { title: {} }, value: { title: {} } }, series: [{ name: '执行率', categories: `A${rR + 1}:A${rR + drR}`, values: `B${rR + 1}:B${rR + drR}` }] }); } catch (e) { console.warn('Chart4:', e.message); }
    if (drC > 0) try { ws3.addChart('column', { title: { text: '部门预算 vs 已审批支出（Top 10）' }, axes: { category: { title: { text: '部门' } }, value: { title: { text: '金额(元)' } } }, series: [{ name: '预算金额', categories: `E${rR + 1}:E${rR + drC}`, values: `F${rR + 1}:F${rR + drC}` }, { name: '已审批支出', categories: `E${rR + 1}:E${rR + drC}`, values: `G${rR + 1}:G${rR + drC}` }] }); } catch (e) { console.warn('Chart5:', e.message); }

    [18, 14, 14, 14, 18, 16, 16].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });

    // 确保所有 sheet 写入
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent('预算管理系统报表.xlsx')}"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('[EXPORT] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
