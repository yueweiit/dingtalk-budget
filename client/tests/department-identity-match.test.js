import assert from 'node:assert/strict';
import test from 'node:test';

import { departmentMatches } from '../src/utils/departmentIdentity.js';

test('详情匹配不会把同名不同部门 ID 的拆分归到当前预算', () => {
  assert.equal(departmentMatches(
    { deptId: '1001', deptName: '线上业务组' },
    { departmentId: '2002', department: '线上业务组' },
  ), false);
});

test('详情匹配在双方缺少部门 ID 时保持旧名称匹配', () => {
  assert.equal(departmentMatches(
    { formNo: 'B-1', deptName: '线上业务组' },
    { businessId: 'E-1', department: '线上业务组' },
  ), true);
});
