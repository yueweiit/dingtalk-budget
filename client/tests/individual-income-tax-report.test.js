import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildExecutionRows,
  buildReportSummaryRows,
} from '../src/utils/xlsxReport.js';

test('exports individual income tax as an independent expense amount', () => {
  const executionRows = buildExecutionRows({
    productionRows: [],
    operationRows: [],
    approvedExpenses: [{
      department: 'HR CN人力资源Recursos humanos',
      month: '2026-07',
      taxTotal: 5423,
      managementTotal: 0,
      salaryTotal: 0,
      officeTotal: 0,
      operationTotal: 5423,
      purchaseTotal: 0,
      operationCount: 1,
      purchaseCount: 0,
    }],
    reportMonth: '2026-07',
  });

  assert.equal(executionRows[0].taxApproved, 5423);
  assert.equal(executionRows[0].totalApproved, 5423);

  const summaryRows = buildReportSummaryRows({
    productionCount: 0,
    nonProductionCount: 0,
    productionRows: [],
    operationRows: [],
    approvedDetailRows: [],
    budgetShareRows: [],
    expenseShareRows: [],
    executionRows,
  });

  assert.ok(summaryRows.some(([label, value]) => label === '个税支出金额' && value === '5423.00'));
});
