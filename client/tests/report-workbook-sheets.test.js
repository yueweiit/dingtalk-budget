import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudgetReportWorkbook, expenseDetailText } from '../src/utils/xlsxReport.js';

const workbookXmlText = async () => {
  const blob = createBudgetReportWorkbook({});
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new TextDecoder().decode(bytes);
};

test('导出报表只保留当前工作表并移除标记页签', async () => {
  const workbook = await workbookXmlText();
  const keptSheets = [
    '汇总',
    '地区预算分布',
    '执行状态分布',
    '预算类型占比',
    '部门执行率',
    '部门预算占比',
    '部门支出占比',
    '实际支出明细',
    '非生产预算明细',
  ];
  const removedSheets = [
    '预算执行',
    '部门预算分布',
    '2026年月度预算趋势',
    '预算vs支出',
    '生产预算明细',
  ];

  for (const sheet of keptSheets) {
    assert.ok(workbook.includes(`name="${sheet}"`), `缺少工作表：${sheet}`);
  }
  for (const sheet of removedSheets) {
    assert.ok(!workbook.includes(`name="${sheet}"`), `不应包含工作表：${sheet}`);
  }
});

test('执行报表包含奖金列且不包含 IT 运维独立列', async () => {
  const workbook = await workbookXmlText();
  assert.ok(workbook.includes('奖金支出'));
  assert.equal(workbook.includes('IT运维费用支出'), false);
  assert.equal(workbook.includes('运营支出金额（含历史IT运维）'), false);
});

test('导出执行状态使用审批中预算，实际支出明细使用统一明细且不含汇总部门', async () => {
  assert.equal(expenseDetailText({ matterDescription: '采购规格说明', title: '旧标题' }), '采购规格说明');

  const workbook = await workbookXmlText();
  assert.ok(!workbook.includes('汇总部门'));

  const pendingWorkbook = createBudgetReportWorkbook({
    reportStartDate: '2026-09-01',
    reportEndDate: '2026-09-30',
    pendingNonProduction: [{
      form_no: 'PENDING-1',
      dept_id: 'dept-1',
      dept_name: '测试部门',
      status: '审批中',
      budget_amount: 1234,
    }],
  });
  const bytes = new Uint8Array(await pendingWorkbook.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('测试部门'));
  assert.ok(text.includes('1234'));
});

test('导出执行状态包含普通支出表单的审批中金额', async () => {
  const workbook = createBudgetReportWorkbook({
    reportStartDate: '2026-08-01',
    reportEndDate: '2026-08-31',
    nonProduction: [{
      form_no: 'BUDGET-1',
      dept_id: 'dept-1',
      dept_name: '测试部门',
      status: '已通过',
      budget_amount: 99104,
    }],
    pendingExpenses: [{
      business_id: 'EXPENSE-1',
      expense_kind: 'operation',
      dept_id: 'dept-1',
      dept_name: '测试部门',
      status: 'RUNNING',
      pending_amount: 200,
    }],
  });
  const bytes = new Uint8Array(await workbook.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes('<v>200</v>'));
});
