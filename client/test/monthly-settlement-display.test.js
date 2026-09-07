import assert from 'node:assert/strict';
import test from 'node:test';

import { expenseDetailSectionDefinitions } from '../src/utils/expenseDetailSections.js';
import { buildApprovedDetailRows, buildExecutionRows } from '../src/utils/xlsxReport.js';

test('备用金拆分数据进入备用金明细栏目', () => {
  const section = expenseDetailSectionDefinitions.find((item) => item.key === 'bonus');

  assert.deepEqual(section, { key: 'bonus', title: '备用金明细' });
});

test('办公设备拆分数据进入独立的办公设备明细栏目且只计入一次', () => {
  const section = expenseDetailSectionDefinitions.find((item) => item.key === 'office_equipment');
  assert.deepEqual(section, { key: 'office_equipment', title: '办公设备明细' });

  const [detail] = buildApprovedDetailRows([{
    expense_kind: 'operation',
    accounting_source: 'completed_department_split',
    accounting_at: '2026-09-01T00:00:00.000Z',
    business_id: 'office-equipment-test',
    applicant_department: '测试部门',
    applicant_department_id: 'dept-test',
    expense_splits: [{
      department: '测试部门',
      department_id: 'dept-test',
      split_type: 'office_equipment',
      amount: 456.78,
      note: '办公设备拆分',
    }],
  }]);
  assert.equal(detail.expenseType, '办公设备');
  assert.equal(detail.amount, 456.78);

  const [summary] = buildExecutionRows({
    productionRows: [],
    operationRows: [],
    approvedExpenses: [{
      department: '测试部门',
      department_id: 'dept-test',
      month: '2026-09',
      operationTotal: 456.78,
      officeEquipmentTotal: 456.78,
      managementTotal: 0,
      salaryTotal: 0,
    }],
    reportMonth: '2026-09',
  });
  assert.equal(summary.officeEquipmentApproved, 456.78);
  assert.equal(summary.salaryApproved, 0);
  assert.equal(summary.managementApproved, 0);
  assert.equal(summary.totalApproved, 456.78);
});

test('exports a completed monthly settlement detail with its explicit payment label and amount', () => {
  const [row] = buildApprovedDetailRows([{
    expense_kind: 'purchase',
    accounting_source: 'monthly_settlement',
    accounting_at: '2026-08-31T00:00:00.000Z',
    business_id: 'monthly-settlement-test',
    title: '月结付款',
    applicant_department: '测试部门',
    applicant_department_id: 'dept-test',
    approval_status: 'COMPLETED',
    amount: 44075.13,
    base_currency_amount: 44075.13,
    payment_event_currency: '人民币RMB',
    matter_description: '8月月结款',
  }]);

  assert.equal(row.expenseKind, '月结付款');
  assert.equal(row.paymentAmount, 44075.13);
  assert.equal(row.accountingSource, 'monthly_settlement');
  assert.equal(row.month, '2026-08');
});

test('keeps monthly settlement separate while including it in the execution total', () => {
  const [row] = buildExecutionRows({
    productionRows: [],
    operationRows: [],
    approvedExpenses: [{
      department: '测试部门',
      department_id: 'dept-test',
      month: '2026-08',
      operationTotal: 10,
      purchaseTotal: 20,
      monthlySettlementTotal: 30,
    }],
    reportMonth: '2026-08',
  });

  assert.equal(row.monthlySettlementApproved, 30);
  assert.equal(row.totalApproved, 60);
});

test('exports reserve-fund split rows as reserve fund and includes them in execution totals once', () => {
  const [detail] = buildApprovedDetailRows([{
    expense_kind: 'operation',
    accounting_source: 'completed_department_split',
    accounting_at: '2026-08-20T00:00:00.000Z',
    business_id: 'bonus-test',
    title: '备用金支出',
    applicant_department: '测试部门',
    applicant_department_id: 'dept-test',
    approval_status: 'COMPLETED',
    amount: 1200,
    base_currency_amount: 1200,
    expense_splits: [{
      department: '测试部门',
      department_id: 'dept-test',
      split_type: 'bonus',
      amount: 1200,
      note: '备用金',
    }],
  }]);

  assert.equal(detail.expenseType, '备用金');
  assert.equal(detail.amount, 1200);

  const [summary] = buildExecutionRows({
    productionRows: [],
    operationRows: [],
    approvedExpenses: [{
      department: '测试部门',
      department_id: 'dept-test',
      month: '2026-08',
      operationTotal: 1200,
      bonusTotal: 1200,
      managementTotal: 0,
    }],
    reportMonth: '2026-08',
  });

  assert.equal(summary.bonusApproved, 1200);
  assert.equal(summary.managementApproved, 0);
  assert.equal(summary.totalApproved, 1200);
});
