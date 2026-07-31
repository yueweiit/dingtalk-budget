import assert from 'node:assert/strict';
import test from 'node:test';

import { buildConnectorDepartmentFilter } from '../services/connector-department-query.js';

test('connector query filters a department ID with an exact database predicate', () => {
  assert.deepEqual(buildConnectorDepartmentFilter({
    deptName: 'OBG 线上业务部 Grupo de negocios en linea',
    deptId: 'new-obg-cn',
  }, 3), {
    condition: 'dept_id = $3',
    mode: 'id',
    params: ['new-obg-cn'],
    nextParamIndex: 4,
  });
});

test('connector query supports the department ID aliases used by DingTalk', () => {
  for (const key of ['departmentId', 'department_id', 'dept_id']) {
    assert.deepEqual(buildConnectorDepartmentFilter({ [key]: 'dept-100' }, 1), {
      condition: 'dept_id = $1',
      mode: 'id',
      params: ['dept-100'],
      nextParamIndex: 2,
    });
  }
});

test('connector query supports DingTalk fixed Chinese department parameter name', () => {
  assert.deepEqual(buildConnectorDepartmentFilter({
    '\u90e8\u95e8': 'Sales',
  }, 1), {
    condition: 'LOWER(BTRIM(dept_name)) = LOWER(BTRIM($1))',
    mode: 'name',
    params: ['Sales'],
    nextParamIndex: 2,
  });
});

test('connector query retains the legacy name filter only when no department ID exists', () => {
  assert.deepEqual(buildConnectorDepartmentFilter({ deptName: 'OBG 线上业务组' }, 1), {
    condition: 'LOWER(BTRIM(dept_name)) = LOWER(BTRIM($1))',
    mode: 'name',
    params: ['OBG 线上业务组'],
    nextParamIndex: 2,
  });
});
