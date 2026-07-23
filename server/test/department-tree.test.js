import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDepartmentSnapshotQuery,
  findDepartmentSnapshot,
} from '../services/department-tree.js';

test('loads a department path only when the department ID is unique across corporations', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        dept_id: '1079492125',
        path_ids: ['1', '100', '1079492125'],
        path_names: ['ROOT', 'YUEWEI', 'PG1'],
      }],
    };
  };

  assert.deepEqual(await findDepartmentSnapshot('1079492125', query), {
    dept_path_ids: ['1', '100', '1079492125'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PG1'],
  });
  assert.deepEqual(calls[0].params, ['1079492125']);
});

test('does not use a path when no unique department tree row exists', async () => {
  const query = async () => ({ rows: [] });

  assert.equal(await findDepartmentSnapshot('ambiguous-department', query), null);
});

test('department tree query rejects department IDs that are shared by corporations', () => {
  const sql = buildDepartmentSnapshotQuery();

  assert.match(sql, /count\(\*\)\s+over\s*\(partition by dept_id\)/i);
  assert.match(sql, /where corp_count = 1/i);
  assert.match(sql, /is_current\s*=\s*true/i);
});
