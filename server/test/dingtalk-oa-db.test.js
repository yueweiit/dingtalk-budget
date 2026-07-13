import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOaDbInstanceIdsQuery } from '../services/dingtalk.js';

test('OA database list uses approval creation time to match DingTalk list windows', () => {
  const sql = buildOaDbInstanceIdsQuery();

  assert.match(sql, /create_time\s*>=\s*to_timestamp\(\$2\s*\/\s*1000\.0\)/i);
  assert.match(sql, /create_time\s*<=\s*to_timestamp\(\$3\s*\/\s*1000\.0\)/i);
  assert.doesNotMatch(sql, /last_event_time|updated_at/i);
});
