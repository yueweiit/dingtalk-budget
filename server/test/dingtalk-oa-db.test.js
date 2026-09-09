import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOaDbDetail, buildOaDbInstanceIdsQuery } from '../services/dingtalk.js';

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

test('OA database detail retains the corporation ID required by the budget ledger key', () => {
  const detail = buildOaDbDetail({
    corp_id: 'corp-yuewei',
    process_instance_id: 'process-1',
    process_code: 'PROC-BUDGET',
    raw_payload: {},
    form_component_values: [],
  });

  assert.equal(detail.corpId, 'corp-yuewei');
  assert.equal(detail.processInstanceId, 'process-1');
});
