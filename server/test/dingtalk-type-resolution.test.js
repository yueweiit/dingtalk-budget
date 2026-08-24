import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveConnectorBudgetDepartment,
  resolveTableName,
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
