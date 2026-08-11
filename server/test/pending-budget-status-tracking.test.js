import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('existing and newly inserted pending budgets are retained for status rechecks', async () => {
  const syncPath = fileURLToPath(new URL('../routes/sync.js', import.meta.url));
  const source = await readFile(syncPath, 'utf8');
  const pendingStart = source.indexOf('if (!approvalState.approved) {');
  const pendingEnd = source.indexOf('\n  if (!isBudgetRequest(detail)) {', pendingStart + 1);
  const pendingBranch = source.slice(pendingStart, pendingEnd);

  const retryablePendingResults = pendingBranch.match(
    /pending:\s*approvalState\.retryable\s*\?\s*1\s*:\s*0/g
  ) || [];

  assert.equal(retryablePendingResults.length, 3);
});

test('scheduler performs a bounded current-month refresh for pending budget statuses', async () => {
  const schedulerPath = fileURLToPath(new URL('../services/scheduler.js', import.meta.url));
  const source = await readFile(schedulerPath, 'utf8');

  assert.match(source, /refreshExistingBudgetStatuses/);
  assert.match(source, /SYNC_PENDING_STATUS_REFRESH_LIMIT/);
  assert.match(source, /pendingOnly:\s*true/);
});
