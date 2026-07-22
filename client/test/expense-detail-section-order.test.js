import assert from 'node:assert/strict';
import test from 'node:test';

import { expenseDetailSectionDefinitions } from '../src/utils/expenseDetailSections.js';

test('个税明细排在办公场地明细之前', () => {
  const keys = expenseDetailSectionDefinitions.map((section) => section.key);

  assert.ok(keys.indexOf('tax') < keys.indexOf('office'));
});
