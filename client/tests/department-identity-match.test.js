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

test('共享预算子部门详情只按子部门自身 ID 匹配，不继承父部门的报表归属 ID', () => {
  const childDetail = {
    deptId: '1092483668',
    deptName: '开发',
    reportingDeptId: '1077343081',
    reportingDeptName: '悦为智能 YW Tech_Ai',
    budgetMonth: '2026-07',
  };

  assert.equal(departmentMatches(childDetail, {
    departmentId: '1077343081',
    department: '悦为智能 YW Tech_Ai',
    reportingDeptId: '1077343081',
    budgetMonth: '2026-07',
  }, { preferLocalDepartmentId: true }), false);
  assert.equal(departmentMatches(childDetail, {
    departmentId: '1092483668',
    department: '开发',
    reportingDeptId: '1092483668',
    budgetMonth: '2026-07',
  }, { preferLocalDepartmentId: true }), true);
  assert.equal(departmentMatches(childDetail, {
    departmentId: '1092411969',
    department: '业务',
    reportingDeptId: '1092411969',
    budgetMonth: '2026-07',
  }, { preferLocalDepartmentId: true }), false);
});

test('共享预算父部门详情会匹配汇总到父部门的子部门明细', () => {
  assert.equal(departmentMatches(
    { deptId: '1077343081', deptName: '悦为智能 YW Tech_Ai', budgetMonth: '2026-07' },
    {
      departmentId: '1092483668',
      department: '开发',
      rollupDeptId: '1077343081',
      rollupDeptName: '悦为智能 YW Tech_Ai',
      budgetMonth: '2026-07',
    },
    { includeRollupDepartment: true },
  ), true);
});
