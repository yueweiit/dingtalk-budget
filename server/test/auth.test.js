import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_ROLES,
  buildDepartmentScopeSql,
  departmentRecordVisible,
  hashPassword,
  isSuperAdmin,
  verifyPassword,
} from '../services/auth.js';

test('密码哈希可以验证正确密码并拒绝错误密码', () => {
  const stored = hashPassword('correct-password');
  assert.equal(verifyPassword('correct-password', stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
});

test('超级管理员不受部门范围限制', () => {
  const user = { role: AUTH_ROLES.SUPERADMIN };
  assert.equal(isSuperAdmin(user), true);
  assert.deepEqual(buildDepartmentScopeSql('p', user, 2), {
    condition: 'TRUE',
    params: [],
    nextParamIndex: 2,
  });
  assert.equal(departmentRecordVisible({ dept_id: 'other' }, user), true);
});

test('部门主管可查看绑定部门及其子部门，不能查看同名或无ID部门', () => {
  const user = { role: AUTH_ROLES.DEPARTMENT_SUPERVISOR, departmentId: 'parent-1' };
  assert.equal(departmentRecordVisible({ dept_id: 'parent-1' }, user), true);
  assert.equal(departmentRecordVisible({ dept_id: 'child-1', dept_path_ids: ['root', 'parent-1', 'child-1'] }, user), true);
  assert.equal(departmentRecordVisible({ dept_id: 'same-name-other-id', dept_name: '同名部门' }, user), false);
  assert.equal(departmentRecordVisible({ dept_name: '绑定部门' }, user), false);
});

test('部门范围 SQL 使用部门ID和路径，不使用部门名称', () => {
  const scope = buildDepartmentScopeSql('n', {
    role: AUTH_ROLES.DEPARTMENT_SUPERVISOR,
    departmentId: '1089383728',
  }, 3);
  assert.match(scope.condition, /n\.dept_id/);
  assert.match(scope.condition, /n\.dept_path_ids/);
  assert.doesNotMatch(scope.condition, /dept_name/);
  assert.deepEqual(scope.params, ['1089383728']);
  assert.equal(scope.nextParamIndex, 4);
});
