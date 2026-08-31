import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { summarizeApprovedDetails } from '../routes/list.js';

test('summarizes a monthly settlement on its payment month under the settlement department', () => {
  const [summary] = summarizeApprovedDetails([{
    expense_kind: 'monthly_settlement',
    accounting_source: 'monthly_settlement',
    accounting_at: '2026-07-31T00:00:00.000Z',
    business_id: 'monthly-settlement-test',
    applicant_department: '测试部门',
    applicant_department_id: 'dept-test',
    amount: 11600,
    base_currency_amount: 11600,
    approval_status: 'RUNNING',
  }]);

  assert.equal(summary.month, '2026-07');
  assert.equal(summary.department, '测试部门');
  assert.equal(summary.monthlySettlementTotal, 11600);
  assert.equal(summary.operationTotal, 0);
  assert.equal(summary.purchaseTotal, 0);
});

test('keeps multiple monthly settlement payment events independent from ordinary expenses', () => {
  const summaries = summarizeApprovedDetails([
    {
      expense_kind: 'monthly_settlement',
      accounting_source: 'monthly_settlement',
      accounting_at: '2026-07-31T23:50:00.000Z',
      payment_event_id: 1,
      business_id: 'monthly-settlement-test',
      applicant_department: '测试部门',
      applicant_department_id: 'dept-test',
      base_currency_amount: 100,
    },
    {
      expense_kind: 'monthly_settlement',
      accounting_source: 'monthly_settlement',
      accounting_at: '2026-08-01T00:10:00.000Z',
      payment_event_id: 2,
      business_id: 'monthly-settlement-test',
      applicant_department: '测试部门',
      applicant_department_id: 'dept-test',
      base_currency_amount: 200,
    },
  ]);

  assert.deepEqual(
    summaries.map((item) => [item.month, item.monthlySettlementTotal, item.operationTotal, item.purchaseTotal]),
    [['2026-07', 100, 0, 0], ['2026-08', 200, 0, 0]]
  );
});

test('does not apply the ordinary execution-region filter to a monthly settlement', () => {
  const [summary] = summarizeApprovedDetails([{
    expense_kind: 'monthly_settlement',
    accounting_source: 'monthly_settlement',
    accounting_at: '2026-08-01T00:10:00.000Z',
    business_id: 'monthly-settlement-without-region',
    applicant_department: '测试部门',
    applicant_department_id: 'dept-test',
    base_currency_amount: 300,
  }], new Set(['id:dept-test__2026-08']));

  assert.equal(summary.monthlySettlementTotal, 300);
});

test('monthly settlement SQL only uses authorized payment events and does not use linked approvals', async () => {
  const source = await readFile(path.join(import.meta.dirname, '..', 'routes', 'list.js'), 'utf8');
  assert.match(source, /event\.expense_kind = 'monthly_settlement'/);
  assert.match(source, /event\.paid_at AS accounting_at/);
  assert.match(source, /monthly\.applicant_department/);
  assert.doesNotMatch(source, /monthly\.resolution_status = 'resolved'/);
  assert.doesNotMatch(source, /monthlyLinkedApprovalExclusion/);
  assert.doesNotMatch(source, /approval_expense_monthly_settlement_links monthly_link/);
});
