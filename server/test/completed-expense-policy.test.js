import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { summarizeApprovedDetails } from '../routes/list.js';
import {
  completedApprovalResult,
  completedApprovalResultSql,
  completedApprovedExpenseWhere,
  isCompletedApprovedExpense,
} from '../utils/completed-expense-policy.js';

const completedAt = '2026-08-01T00:15:00.000Z';

test('counts only completed approvals with an agreed result and completion timestamp', () => {
  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    result: 'agree',
    approval_completed_at: completedAt,
  }), true);

  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    result: 'pass',
    approval_completed_at: completedAt,
  }), true);

  assert.equal(isCompletedApprovedExpense({
    approval_status: 'RUNNING',
    result: 'agree',
    approval_completed_at: completedAt,
  }), false);

  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    result: 'refuse',
    approval_completed_at: completedAt,
  }), false);

  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    result: 'agree',
  }), false);
});

test('ignores cashier and historical task outcomes after final approval succeeds', () => {
  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    result: 'agree',
    approval_completed_at: completedAt,
    cashier_result: 'REFUSE',
    local_cashier_status: 'REJECT',
    tasks: [{ result: 'REFUSE' }],
  }), true);
});

test('does not inspect payment or activity metadata when deciding eligibility', () => {
  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    flow_result: 'approved',
    approval_completed_at: completedAt,
    cashier_status: 'REJECTED',
    payment_status: 'FAILED',
    activityId: 'cashier-node',
    bizAction: 'REJECT',
    tasks: [{ result: 'REJECT' }],
  }), true);
});

test('supports flow_result and Chinese final approval results', () => {
  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    flow_result: '通过',
    approval_completed_at: completedAt,
  }), true);
});

test('OA result overrides conflicting legacy result fields', () => {
  assert.equal(completedApprovalResult({ result: 'agree', flowResult: 'refuse' }), 'agree');
  assert.equal(completedApprovalResult({ result: 'refuse', flow_result: 'agree' }), 'refuse');
  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    result: 'refuse',
    flowResult: 'agree',
    approval_completed_at: completedAt,
  }), false);
  assert.equal(isCompletedApprovedExpense({
    approval_status: 'COMPLETED',
    result: 'agree',
    flowResult: 'refuse',
    approval_completed_at: completedAt,
  }), true);
});

test('database filtering uses the same final-result fields without task or cashier checks', () => {
  const sql = completedApprovedExpenseWhere('expense');

  const resultIndex = sql.indexOf("expense.raw_data->>'result'");
  const camelIndex = sql.indexOf("expense.raw_data->>'flowResult'");
  const snakeIndex = sql.indexOf("expense.raw_data->>'flow_result'");
  assert.ok(resultIndex >= 0);
  assert.ok(camelIndex > resultIndex);
  assert.ok(snakeIndex > camelIndex);
  assert.match(sql, /'通过'/);
  assert.doesNotMatch(sql, /cashier|activityId|bizAction|tasks|REFUSE|REJECT/i);
});

test('approved-expense query projections use the canonical result SQL', async () => {
  const resultSql = completedApprovalResultSql('expense');
  const resultIndex = resultSql.indexOf("expense.raw_data->>'result'");
  const camelIndex = resultSql.indexOf("expense.raw_data->>'flowResult'");
  const snakeIndex = resultSql.indexOf("expense.raw_data->>'flow_result'");
  assert.ok(resultIndex >= 0);
  assert.ok(camelIndex > resultIndex);
  assert.ok(snakeIndex > camelIndex);

  const listSource = await readFile(path.join(import.meta.dirname, '..', 'routes', 'list.js'), 'utf8');
  assert.match(listSource, /completedApprovalResultSql\('o'\)\} AS result/);
  assert.match(listSource, /completedApprovalResultSql\('p'\)\} AS result/);
});

test('uses final approval completion month rather than submission month', () => {
  const [summary] = summarizeApprovedDetails([{
    expense_kind: 'purchase',
    business_id: 'completed-month-test',
    applicant_department: 'Finance',
    approval_status: 'COMPLETED',
    result: 'agree',
    source_created_at: '2026-07-31T23:00:00.000Z',
    approval_completed_at: completedAt,
    base_currency_amount: 100,
  }]);

  assert.equal(summary.month, '2026-08');
});
