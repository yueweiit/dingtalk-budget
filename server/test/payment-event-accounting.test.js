import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { bonusByDepartmentSelectSql, mergeExpenseSplitRows, summarizeApprovedDetails } from '../routes/list.js';

test('uses a NULL JSONB expression when the bonus split column is unavailable', () => {
  assert.equal(bonusByDepartmentSelectSql(true), 'o.bonus_by_department');
  assert.equal(bonusByDepartmentSelectSql(false), 'NULL::jsonb');
});

test('falls back to persisted splits for empty embedded split arrays without duplicating populated ones', () => {
  const rows = mergeExpenseSplitRows([
    { business_id: 'bonus-empty', expense_splits: [] },
    { business_id: 'bonus-embedded', expense_splits: [{ business_id: 'bonus-embedded', split_type: 'bonus', amount: 120 }] },
  ], [
    { business_id: 'bonus-empty', split_type: 'bonus', amount: 80 },
    { business_id: 'bonus-embedded', split_type: 'bonus', amount: 999 },
  ]);

  assert.deepEqual(rows.map((row) => [row.business_id, row.amount]), [
    ['bonus-embedded', 120],
    ['bonus-empty', 80],
  ]);
});

test('counts a partial payment event once on its payment month and applicant department', () => {
  const [item] = summarizeApprovedDetails([{
    expense_kind: 'operation',
    accounting_source: 'payment_event',
    accounting_at: '2026-07-07T10:00:00.000Z',
    base_currency_amount: 14500,
    applicant_department: '采购部',
    applicant_department_id: 'dept-purchase',
    expense_splits: [],
  }]);

  assert.equal(item.month, '2026-07');
  assert.equal(item.department, '采购部');
  assert.equal(item.operationTotal, 14500);
  assert.equal(item.managementTotal, 14500);
});

test('payment-event query includes final-approval fallbacks without bypassing department splits', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, '..', 'routes', 'list.js'), 'utf8');

  assert.match(source, /const completedDepartmentSplitWhere/);
  assert.match(source, /const completedApprovalFallbackWhere/);
  assert.match(source, /FROM approval_expense_dept_split split/);
  assert.match(source, /'completed_department_split'::text AS accounting_source/);
  assert.match(source, /'completed_approval_fallback'::text AS accounting_source/);
  assert.match(source, /JOIN approval_expense_operation o ON o\.business_id = event\.business_id/);
  assert.match(source, /FROM approval_expense_dept_split event_split/);
  assert.match(source, /event\.paid_at AS accounting_at/);
  assert.match(source, /completedApprovalResultSql\('p'\)\} AS result/);
});

test('payment-event query exposes payment date, amount, currency, and comment evidence', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, '..', 'routes', 'list.js'), 'utf8');

  assert.match(source, /event\.paid_at AS payment_event_paid_at/);
  assert.match(source, /event\.amount AS payment_event_amount/);
  assert.match(source, /event\.currency AS payment_event_currency/);
  assert.match(source, /event\.evidence_text AS payment_event_evidence_text/);
  assert.match(source, /event\.source_user_id AS payment_event_source_user_id/);
  assert.match(source, /NULL::timestamptz AS payment_event_paid_at/);
});

test('payment-event authorization is configurable while retaining the formal defaults', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, '..', 'routes', 'list.js'), 'utf8');

  assert.match(source, /DINGTALK_PAYMENT_EVENT_USER_IDS/);
  assert.match(source, /57521312381178275/);
  assert.match(source, /02183637680221426194/);
});
