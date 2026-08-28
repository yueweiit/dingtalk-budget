import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeApprovedDetails } from '../routes/list.js';

test('summarizes individual income tax independently from management expenses', () => {
  const [item] = summarizeApprovedDetails([{
    expense_kind: 'operation',
    query_month: '2026-07',
    base_currency_amount: 5423,
    applicant_department: 'HR CN人力资源Recursos humanos',
    expense_splits: [{
      department: 'HR CN人力资源Recursos humanos',
      amount: 5423,
      split_type: 'individual_income_tax',
      note: '测试',
    }],
  }]);

  assert.equal(item.taxTotal, 5423);
  assert.equal(item.managementTotal, 0);
  assert.equal(item.salaryTotal, 0);
  assert.equal(item.officeTotal, 0);
});

test('summarizes IT operation independently and includes it in the operation total', () => {
  const [item] = summarizeApprovedDetails([{
    expense_kind: 'operation',
    query_month: '2026-08',
    base_currency_amount: 876.5,
    applicant_department: '信息技术部',
    expense_splits: [{
      department: '信息技术部',
      amount: 876.5,
      split_type: 'it_operation',
      note: '服务器维护',
    }],
  }]);

  assert.equal(item.itOperationTotal, 876.5);
  assert.equal(item.operationTotal, 876.5);
  assert.equal(item.managementTotal, 0);
  assert.equal(item.salaryTotal, 0);
  assert.equal(item.officeTotal, 0);
  assert.equal(item.taxTotal, 0);
});
