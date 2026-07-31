import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTableName } from '../routes/dingtalk.js';

test('selects non-production budget when DingTalk submits an option array', () => {
  assert.equal(
    resolveTableName(['option_0', 'option_1']),
    'non_production_budget'
  );
});

test('retains scalar option handling for production and non-production', () => {
  assert.equal(resolveTableName('option_1'), 'non_production_budget');
  assert.equal(resolveTableName('option_2'), 'production_budget');
});
