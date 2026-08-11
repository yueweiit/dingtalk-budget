import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOaDbInstanceIdsQuery } from '../services/dingtalk.js';

test('OA database list uses the latest approval change time to find cross-window status updates', () => {
  const sql = buildOaDbInstanceIdsQuery();

  assert.match(
    sql,
    /COALESCE\(last_event_time,\s*updated_at,\s*create_time\)\s*>=\s*to_timestamp\(\$2\s*\/\s*1000\.0\)/i
  );
  assert.match(
    sql,
    /COALESCE\(last_event_time,\s*updated_at,\s*create_time\)\s*<=\s*to_timestamp\(\$3\s*\/\s*1000\.0\)/i
  );
  assert.match(sql, /ORDER BY\s+COALESCE\(last_event_time,\s*updated_at,\s*create_time\)\s+ASC/i);
});
