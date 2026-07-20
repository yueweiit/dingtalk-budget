import assert from 'node:assert/strict';
import test from 'node:test';

import { approvalExpenseDateExpr } from '../routes/list.js';

test('approval expense date filtering uses UTC for timestamp values', () => {
  assert.equal(
    approvalExpenseDateExpr('o'),
    "((o.source_created_at AT TIME ZONE 'UTC')::date)"
  );
});
