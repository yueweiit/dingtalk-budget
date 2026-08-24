import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDepartmentSnapshotQuery,
  findDepartmentSnapshot,
  resolveServiceEntityDepartment,
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

test('服务主体编码按当前部门树的部门 ID 精确归属', async () => {
  const resolved = await resolveServiceEntityDepartment({
    serviceEntity: 'YUEWEI MX核心制造/PG生产',
    serviceEntityCode: '1092705940',
  }, async () => ({
    rows: [{
      dept_id: '1092705940',
      name: 'PG生产',
      path_ids: ['root', 'entity', '1092705940'],
      path_names: ['ROOT', 'YUEWEI MX核心制造', 'PG生产'],
      is_current: true,
    }],
  }));

  assert.deepEqual(resolved, {
    status: 'resolved',
    department: 'PG生产',
    departmentId: '1092705940',
    departmentPathIds: ['root', 'entity', '1092705940'],
    departmentPathNames: ['ROOT', 'YUEWEI MX核心制造', 'PG生产'],
  });
});

test('服务主体空值或同名歧义不会猜测部门', async () => {
  assert.deepEqual(await resolveServiceEntityDepartment({}), { status: 'unresolved' });
  const resolved = await resolveServiceEntityDepartment({ serviceEntity: '服务主体' }, async () => ({
    rows: [
      { dept_id: '1', name: '服务主体', is_current: true },
      { dept_id: '2', name: '服务主体', is_current: true },
    ],
  }));
  assert.deepEqual(resolved, { status: 'unresolved' });
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
