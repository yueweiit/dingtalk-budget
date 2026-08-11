import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeBudgetListRows, pageBudgetListRows, shouldDisplayBudgetListAmounts } from '../src/utils/budgetList.js';

test('budget list fallback merges and paginates production and non-production rows', () => {
  const rows = mergeBudgetListRows(
    [{ id: 1, budget_type: 'production', create_time: '2026-08-01 10:00:00' }],
    [
      { id: 2, budget_type: 'non-production', create_time: '2026-08-02 10:00:00' },
      { id: 3, budget_type: 'non-production', create_time: '2026-08-03 10:00:00' },
    ],
  );

  assert.deepEqual(rows.map((row) => row.id), [3, 2, 1]);
  assert.deepEqual(pageBudgetListRows(rows, 2, 2).map((row) => row.id), [1]);
});

test('budget list displays amounts for approved and pending rows only', () => {
  assert.equal(shouldDisplayBudgetListAmounts('已通过'), true);
  assert.equal(shouldDisplayBudgetListAmounts('审批中'), true);
  assert.equal(shouldDisplayBudgetListAmounts('已撤销'), false);
});
