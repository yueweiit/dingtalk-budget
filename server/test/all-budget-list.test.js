import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeBudgetRows } from '../routes/list.js';

test('all-budget list merges categories in the same creation-time order as each list', () => {
  const production = [
    { id: 1, form_no: 'production-old', budget_type: '生产', create_time: '2026-08-01 10:00:00' },
    { id: 3, form_no: 'production-new', budget_type: '生产', create_time: '2026-08-03 10:00:00' },
  ];
  const nonProduction = [
    { id: 2, form_no: 'non-production-middle', budget_type: '非生产', create_time: '2026-08-02 10:00:00' },
    { id: 4, form_no: 'non-production-same-time', budget_type: '非生产', create_time: '2026-08-03 10:00:00' },
  ];

  const rows = mergeBudgetRows(production, nonProduction);

  assert.deepEqual(rows.map((row) => row.form_no), [
    'non-production-same-time',
    'production-new',
    'non-production-middle',
    'production-old',
  ]);
  assert.deepEqual(rows.map((row) => row.budget_type), ['非生产', '生产', '非生产', '生产']);
});
