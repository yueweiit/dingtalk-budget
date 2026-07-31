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
