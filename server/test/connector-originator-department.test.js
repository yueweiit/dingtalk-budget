import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOriginatorDepartmentQuery,
  getConnectorOriginator,
  resolveOriginatorDepartment,
} from '../services/connector-originator-department.js';

test('prefers a DingTalk user ID over a display name', () => {
  assert.deepEqual(getConnectorOriginator({
    originatorUserId: 'user-1',
    originatorName: 'Alice',
  }), {
    userId: 'user-1',
    name: 'Alice',
  });

  const statement = buildOriginatorDepartmentQuery({
    userId: 'user-1',
    name: 'Alice',
    departmentName: 'Sales',
  });
  assert.deepEqual(statement.params, ['user-1', 'Sales']);
  assert.match(statement.sql, /BTRIM\(user_snapshot\.user_id\) = BTRIM\(\$1\)/);
  assert.match(statement.sql, /department\.dept_id = membership\.dept_id/);
});

test('accepts DingTalk fixed Chinese submitter parameter name', () => {
  assert.deepEqual(getConnectorOriginator({
    '\u63d0\u4ea4\u4eba': 'Alice',
  }), {
    userId: '',
    name: 'Alice',
  });
});

test('treats the numeric DingTalk submitter value as a user ID', () => {
  const statement = buildOriginatorDepartmentQuery({
    name: '02485635391924266197',
    departmentName: 'Sales',
  });
  assert.equal(statement.matchedBy, 'user_id');
  assert.deepEqual(statement.params, ['02485635391924266197', 'Sales']);
  assert.match(statement.sql, /BTRIM\(user_snapshot\.user_id\) = BTRIM\(\$1\)/);
});

test('uses the originator name only when no user ID was received', () => {
  const statement = buildOriginatorDepartmentQuery({
    name: 'Alice',
    departmentName: 'Sales',
  });

  assert.equal(statement.matchedBy, 'name');
  assert.deepEqual(statement.params, ['Alice', 'Sales']);
  assert.match(statement.sql, /BTRIM\(user_snapshot\.name\) = BTRIM\(\$1\)/);
});

test('resolves exactly one department membership', async () => {
  const result = await resolveOriginatorDepartment({
    originatorName: 'Alice',
    departmentName: 'Sales',
  }, async () => ({
    rows: [{
      user_id: 'user-1',
      originator_name: 'Alice',
      dept_id: '1092411969',
      department_name: 'Sales',
    }],
  }));

  assert.deepEqual(result, {
    status: 'resolved',
    matchedBy: 'name',
    departmentId: '1092411969',
    departmentName: 'Sales',
    originatorUserId: 'user-1',
    originatorName: 'Alice',
  });
});

test('refuses an ambiguous same-name department match', async () => {
  const result = await resolveOriginatorDepartment({
    originatorName: 'Alice',
    departmentName: 'Sales',
  }, async () => ({
    rows: [
      { user_id: 'user-1', dept_id: '100', department_name: 'Sales', path_names: ['China'] },
      { user_id: 'user-1', dept_id: '200', department_name: 'Sales', path_names: ['Mexico'] },
    ],
  }));

  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.length, 2);
});

test('allows a YW Tech child member to select the shared parent from July onward', async () => {
  let callCount = 0;
  const result = await resolveOriginatorDepartment({
    originatorUserId: 'user-1',
    departmentName: '\u60a6\u4e3a\u667a\u80fd YW Tech_Ai',
    sharedBudgetMonth: '2026-07',
  }, async (_sql, params) => {
    callCount += 1;
    if (callCount === 1) return { rows: [] };
    if (params?.[2] === '1077343081') {
      return {
        rows: [{
          user_id: 'user-1',
          originator_name: 'Alice',
          dept_id: '1077343081',
          department_name: '\u60a6\u4e3a\u667a\u80fd YW Tech_Ai',
          path_names: [],
        }],
      };
    }
    return { rows: [] };
  });

  assert.equal(result.status, 'resolved');
  assert.equal(result.status === 'resolved' && result.departmentId, '1077343081');
});

test('does not allow shared-parent fallback before July', async () => {
  const result = await resolveOriginatorDepartment({
    originatorUserId: 'user-1',
    departmentName: '\u60a6\u4e3a\u667a\u80fd YW Tech_Ai',
    sharedBudgetMonth: '2026-06',
  }, async () => ({ rows: [] }));

  assert.equal(result.status, 'not_found');
});
