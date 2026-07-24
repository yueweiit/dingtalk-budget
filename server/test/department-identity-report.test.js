import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reportingDepartmentKey,
  summarizeApprovedDetails,
} from '../routes/list.js';

test('keeps approved expenses with identical names separate when department IDs differ', () => {
  const rows = summarizeApprovedDetails([
    {
      expense_kind: 'purchase',
      business_id: 'expense-1',
      query_month: '2026-07',
      applicant_department: 'Sales',
      applicant_department_id: '100',
      applicant_department_source: 'form_id',
      applicant_department_path_names: ['ROOT', 'YUEWEI', 'Sales Group', 'Sales CN'],
      base_currency_amount: 10,
    },
    {
      expense_kind: 'purchase',
      business_id: 'expense-2',
      query_month: '2026-07',
      applicant_department: 'Sales',
      applicant_department_id: '200',
      applicant_department_source: 'form_id',
      applicant_department_path_names: ['ROOT', 'YUEWEI', 'Sales Group', 'Sales MX'],
      base_currency_amount: 20,
    },
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.department_identity_key).sort(), ['id:100', 'id:200']);
  assert.deepEqual(rows.map((row) => row.department_display), ['Sales Group', 'Sales Group']);
  assert.deepEqual(rows.map((row) => row.sub_department_display).sort(), ['Sales CN', 'Sales MX']);
});

test('uses the legacy department name key through June even when historical IDs differ', () => {
  const oldBudget = {
    dept_name: 'PD&PH 产品和采购Producto&Compras',
    dept_id: '1060178527',
  };
  const oldExpenseSplit = {
    department: 'PD&PH 产品和采购Producto&Compras',
    department_id: '1059674330',
  };

  assert.equal(
    reportingDepartmentKey(oldBudget, '2026-06'),
    reportingDepartmentKey(oldExpenseSplit, '2026-06'),
  );
  assert.notEqual(
    reportingDepartmentKey(oldBudget, '2026-07'),
    reportingDepartmentKey(oldExpenseSplit, '2026-07'),
  );
});
