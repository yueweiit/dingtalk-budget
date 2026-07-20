import assert from 'node:assert/strict';
import test from 'node:test';

import { formatUtcDate, formatUtcDateTime, formatUtcMonth } from '../src/utils/utcDate.js';

test('UTC formatters keep UTC dates at the month boundary', () => {
  const value = '2026-07-31T23:30:00.000Z';

  assert.equal(formatUtcDateTime(value), '2026-07-31 23:30');
  assert.equal(formatUtcDate(value), '2026-07-31');
  assert.equal(formatUtcMonth(value), '2026-07');
});
