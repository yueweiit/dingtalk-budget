import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudgetReportWorkbook } from '../src/utils/xlsxReport.js';

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
