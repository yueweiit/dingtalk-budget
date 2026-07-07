import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutionRows,
  buildReportSummaryRows,
} from '../src/utils/xlsxReport.js';
import { buildDeptApprovedComparison, buildSummaryStats } from '../src/utils/chartHelpers.js';

test('新增统计项只汇总有提交预算部门的支出，但保留原实际支出合计', async () => {
  const productionRows = [
    {
      deptName: 'Dept A',
      budgetMonth: '2026-06',
      requestAmount: 100,
    },
  ];
  const operationRows = [
    {
      deptName: 'Dept B',
      budgetMonth: '2026-06',
      amount: 200,
    },
  ];
  const approvedExpenses = [
    {
      department: 'Dept A',
      month: '2026-06',
      operationTotal: 30,
      purchaseTotal: 0,
      managementTotal: 10,
      salaryTotal: 5,
      officeTotal: 0,
      operationCount: 1,
      purchaseCount: 0,
    },
    {
      department: 'Dept C',
      month: '2026-06',
      operationTotal: 70,
      purchaseTotal: 0,
      managementTotal: 50,
      salaryTotal: 20,
      officeTotal: 0,
      operationCount: 1,
      purchaseCount: 0,
    },
  ];

  const executionRows = buildExecutionRows({
    productionRows,
    operationRows,
    approvedExpenses,
    reportMonth: '2026-06',
  });

  const summary = buildSummaryStats(productionRows, operationRows, executionRows, []);

  assert.equal(executionRows.length, 3);
  assert.equal(summary.approvedTotal, '85.00');
  assert.equal(summary.budgetSubmittedApprovedTotal, '15.00');
});

test('部门预算 vs 实际支出图表只统计有提交预算的部门，并使用新统计项', () => {
  const rows = buildDeptApprovedComparison([
    {
      deptName: 'Dept A',
      totalBudget: 100,
      approvedTotal: 80,
      budgetSubmittedApprovedTotal: 15,
    },
    {
      deptName: 'Dept B',
      totalBudget: 200,
      approvedTotal: 40,
      budgetSubmittedApprovedTotal: 30,
    },
    {
      deptName: 'Dept C',
      totalBudget: 0,
      approvedTotal: 999,
      budgetSubmittedApprovedTotal: 0,
    },
  ]);

  assert.deepEqual(rows, [
    { deptName: 'Dept B', budget: 200, approved: 30 },
    { deptName: 'Dept A', budget: 100, approved: 15 },
  ]);
});

test('导出报表汇总行会包含有提交预算部门支出合计字段', () => {
  const summaryRows = buildReportSummaryRows({
    productionCount: 1,
    nonProductionCount: 0,
    productionRows: [{ requestAmount: 100 }],
    operationRows: [],
    approvedDetailRows: [],
    budgetShareRows: [],
    expenseShareRows: [],
    executionRows: [
      {
        productionBudget: 100,
        nonProductionBudget: 0,
        managementApproved: 10,
        salaryApproved: 5,
        officeApproved: 0,
        totalApproved: 15,
        budgetSubmittedApprovedTotal: 15,
        remainingBudget: 85,
      },
      {
        productionBudget: 0,
        nonProductionBudget: 0,
        managementApproved: 50,
        salaryApproved: 20,
        officeApproved: 0,
        totalApproved: 70,
        budgetSubmittedApprovedTotal: 0,
        remainingBudget: -70,
      },
    ],
  });

  assert.ok(summaryRows.some(([label, value]) => label === '有提交预算部门支出合计' && value === '15.00'));
});
