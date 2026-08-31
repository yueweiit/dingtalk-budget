import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApprovedDetailRows, buildExecutionRows } from '../src/utils/xlsxReport.js';

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
