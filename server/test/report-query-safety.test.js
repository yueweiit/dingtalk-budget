import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const source = await readFile(path.join(import.meta.dirname, '..', 'routes', 'list.js'), 'utf8');

test('report export does not run concurrent queries on one PostgreSQL Client', () => {
  const reportStart = source.indexOf("router.get('/report'");
  assert.notEqual(reportStart, -1);
  const reportSource = source.slice(reportStart, source.indexOf('\nexport {', reportStart));

  assert.doesNotMatch(reportSource, /Promise\.all\(\[/);
  assert.match(reportSource, /productionRowsRaw = await fetchProductionBudgetRows/);
  assert.match(reportSource, /budgetedDepartmentMonths = await fetchBudgetedDepartmentMonthSet/);
});

test('pending budget payment-comment exclusion is limited to authorized users', () => {
  assert.match(source, /const AUTHORIZED_PAYMENT_APPROVER_USER_SQL/);
  assert.match(source, /flow\.approver_userid IN/);
  assert.match(source, /COALESCE\(flow\.approve_opinion, ''\) ~\* '已支付\|部分支付\|已全额抵扣'/);
});

test('visual report receives ordinary pending expenses separately from budget pending rows', () => {
  const reportSource = source.slice(source.indexOf("router.get('/report'"));
  assert.match(source, /async function fetchPendingExpenseRows\(filters = \{\}\)/);
  assert.match(source, /FROM approval_expense_operation o/);
  assert.match(source, /FROM approval_expense_purchase p/);
  assert.match(source, /FROM approval_expense_monthly_settlement m/);
  assert.match(reportSource, /pendingExpenseRows = await fetchPendingExpenseRows\(filters\)/);
  assert.match(reportSource, /pendingExpenses: pendingExpenseRows/);
  assert.match(reportSource, /pendingProductionRows = await fetchPendingBudgetRows/);
  assert.match(reportSource, /pendingNonProductionRows = await fetchPendingBudgetRows/);
});
