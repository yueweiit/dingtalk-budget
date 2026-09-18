import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateBudgetAlertSnapshot,
  findAlertBudgetRow,
  resolveConnectorBudgetDepartment,
  resolveTableName,
  resolveAlertBudgetSnapshot,
} from '../routes/dingtalk.js';

test('selects non-production budget when DingTalk submits an option array', () => {
  assert.equal(
    resolveTableName(['option_0', 'option_1']),
    'non_production_budget'
  );
});

test('selects non-production budget when DingTalk submits a JSON option array string', () => {
  assert.equal(
    resolveTableName('["option_0","option_1"]'),
    'non_production_budget'
  );
});

test('retains scalar option handling for production and non-production', () => {
  assert.equal(resolveTableName('option_1'), 'non_production_budget');
  assert.equal(resolveTableName('option_2'), 'production_budget');
});

test('connector uses the submitted department ID without reading an applicant', async () => {
  const resolved = await resolveConnectorBudgetDepartment({
    departmentId: '1092411969',
    originatorName: 'Should Not Be Read',
    submitterUserId: 'should-not-be-read',
  }, '2026-08');

  assert.deepEqual(resolved, {
    status: 'ready',
    departmentId: '1077343081',
  });
});

test('connector uses an exact department name only when no department ID exists', async () => {
  const resolved = await resolveConnectorBudgetDepartment({
    department: 'Finance',
    originatorName: 'Should Not Be Read',
  }, '2026-08');

  assert.deepEqual(resolved, {
    status: 'ready',
    departmentId: '',
    legacyFilter: {
      condition: 'LOWER(BTRIM(dept_name)) = LOWER(BTRIM($1))',
      mode: 'name',
      params: ['Finance'],
      nextParamIndex: 2,
    },
  });
});

test('connector rejects a request without a department selection', async () => {
  assert.deepEqual(
    await resolveConnectorBudgetDepartment({ originatorName: 'Alice' }, '2026-08'),
    { status: 'missing_department' }
  );
});

test('alert snapshot uses the shared-budget parent and classifies 90 percent and over-budget amounts', async () => {
  const calls = [];
  const budget = await findAlertBudgetRow({
    departmentId: '1092411969',
    month: '2026-09-15',
    type: '非生产No producción',
  }, async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ alert_budget_amount: 100, dept_id: '1077343081', budget_month: '2026-09' }] };
  });

  assert.equal(budget.departmentId, '1077343081');
  assert.equal(budget.tableName, 'non_production_budget');
  assert.deepEqual(calls[0].params, ['1077343081', '2026-09']);

  assert.equal(calculateBudgetAlertSnapshot({ budgetAmount: 100, usedAmount: 80, applicationAmount: 10 }).alertLevel, 'warning_90');
  assert.equal(calculateBudgetAlertSnapshot({ budgetAmount: 100, usedAmount: 80, applicationAmount: 21 }).alertLevel, 'over_budget');
});

test('alert snapshot combines the canonical used amount with the new application amount', async () => {
  const snapshot = await resolveAlertBudgetSnapshot({
    departmentId: '1077343081',
    month: '2026-09',
    type: 'non-production',
    applicationAmount: '15',
  }, {
    findBudget: async () => ({
      row: { alert_budget_amount: 100, dept_id: '1077343081', budget_month: '2026-09' },
      tableName: 'non_production_budget',
      month: '2026-09',
      departmentId: '1077343081',
    }),
    attachExpenses: async () => [{ approved_amount: 80 }],
  });

  assert.deepEqual(snapshot, {
    departmentId: '1077343081',
    month: '2026-09',
    budgetTable: 'non_production_budget',
    budgetAmount: 100,
    usedAmount: 80,
    applicationAmount: 15,
    projectedAmount: 95,
    utilizationRate: 0.95,
    alertLevel: 'warning_90',
  });
});
