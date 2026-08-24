import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import dingtalkRouter from '../routes/dingtalk.js';

test('querySimple returns a safe zero budget when the connector has no department yet', async () => {
  const app = express();
  app.use('/api/dingtalk', dingtalkRouter);

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const { port } = server.address();
    const response = await fetch(
      `http://127.0.0.1:${port}/api/dingtalk/querySimple?type=non-production&month=2026-08`,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { budgetAmount: '0' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
