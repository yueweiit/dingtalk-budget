import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutionRows,
  buildReportSummaryRows,
} from '../src/utils/xlsxReport.js';
import { buildDeptApprovedComparison, buildExecutionStatus, buildSummaryStats } from '../src/utils/chartHelpers.js';

test('execution status uses pending ordinary expenses and ignores pending budget applications', () => {
  const rows = buildExecutionStatus([
    {
      deptName: '悦为智能 YW Tech_Ai',
      departmentId: 'yw-1',
      budgetMonth: '2026-09',
      totalBudget: 200259,
      totalApproved: 100434.02,
    },
  ], [
    {
      deptName: '悦为智能 YW Tech_Ai',
      departmentId: 'yw-1',
      expense_kind: 'operation',
      status: '审批中',
      pending_amount: 101155,
    },
  ]);

  assert.equal(rows[0].inProgress, 101155);
  assert.equal(rows[0].totalBudget, 200259);
  assert.equal(rows[0].unexecuted, 0);

  const budgetApplication = buildExecutionStatus([], [{
    deptName: '悦为智能 YW Tech_Ai',
    departmentId: 'yw-1',
    status: '审批中',
    pending_amount: 101155,
  }]);
  assert.deepEqual(budgetApplication, []);
});

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

test('导出报表汇总仅保留有金额的可选支出分类', () => {
  const summaryRows = buildReportSummaryRows({
    productionCount: 0,
    nonProductionCount: 0,
    productionRows: [],
    operationRows: [],
    approvedDetailRows: [],
    budgetShareRows: [],
    expenseShareRows: [],
    executionRows: [{
      monthlySettlementApproved: 0,
      salaryApproved: 120,
      bonusApproved: 0,
      officeEquipmentApproved: 0,
      officeApproved: 88.5,
      taxApproved: 0,
      managementApproved: 0,
      totalApproved: 208.5,
      budgetSubmittedApprovedTotal: 0,
      remainingBudget: -208.5,
    }],
  });

  const labels = new Set(summaryRows.map(([label]) => label));
  assert.ok(labels.has('工资/公积金支出金额'));
  assert.ok(labels.has('办公场地支出金额'));
  assert.equal(labels.has('月结付款金额'), false);
  assert.equal(labels.has('备用金支出金额'), false);
  assert.equal(labels.has('办公设备支出金额'), false);
  assert.equal(labels.has('个税支出金额'), false);
});

test('导出报表汇总会按动态管理费用分类汇总有数据的明细', () => {
  const summaryRows = buildReportSummaryRows({
    productionCount: 0,
    nonProductionCount: 0,
    productionRows: [],
    operationRows: [],
    approvedDetailRows: [
      { splitType: 'administrative', expenseType: '安保费明细', amount: 100, baseCurrencyAmount: 100 },
      { splitType: 'administrative', expenseType: '安保费明细', amount: 50, baseCurrencyAmount: 50 },
      { splitType: 'administrative', expenseType: '平台使用费明细', amount: 20, baseCurrencyAmount: 20 },
      { splitType: 'salary', expenseType: '工资明细', amount: 999, baseCurrencyAmount: 999 },
      { splitType: 'administrative', expenseType: '零值分类明细', amount: 0, baseCurrencyAmount: 0 },
    ],
    budgetShareRows: [],
    expenseShareRows: [],
    executionRows: [{
      monthlySettlementApproved: 0,
      salaryApproved: 0,
      bonusApproved: 0,
      officeEquipmentApproved: 0,
      officeApproved: 0,
      taxApproved: 0,
      managementApproved: 170,
      totalApproved: 170,
      budgetSubmittedApprovedTotal: 0,
      remainingBudget: -170,
    }],
  });

  assert.ok(summaryRows.some(([label, value]) => label === '安保费明细' && value === '150.00'));
  assert.ok(summaryRows.some(([label, value]) => label === '平台使用费明细' && value === '20.00'));
  assert.equal(summaryRows.some(([label]) => label === '工资明细'), false);
  assert.equal(summaryRows.some(([label]) => label === '零值分类明细'), false);
});
