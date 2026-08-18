import assert from 'node:assert/strict';
import test from 'node:test';

import { approvalExpenseDateExpr } from '../routes/list.js';

test('approval expense date filtering uses final approval completion time in UTC', () => {
  assert.equal(
    approvalExpenseDateExpr('o'),
    "((o.approval_completed_at AT TIME ZONE 'UTC')::date)"
  );
});
