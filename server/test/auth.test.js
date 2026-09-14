import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_ROLES,
  buildDepartmentScopeSql,
  departmentRecordVisible,
  hashPassword,
  isSuperAdmin,
  verifyPassword,
  validatePasswordChangeInput,
  changePassword,
  shouldUseSecureCookies,
} from '../services/auth.js';

test('密码哈希可以验证正确密码并拒绝错误密码', () => {
  const stored = hashPassword('correct-password');
  assert.equal(verifyPassword('correct-password', stored), true);
  assert.equal(verifyPassword('wrong-password', stored), false);
});

test('修改密码校验输入并只更新当前用户的哈希', async () => {
  assert.equal(validatePasswordChangeInput('old-password', 'short', 'short'), '新密码至少需要 8 个字符');
  assert.equal(validatePasswordChangeInput('old-password', 'new-password', 'different-password'), '两次输入的新密码不一致');

  const oldHash = hashPassword('old-password');
  const calls = [];
  const result = await changePassword('user-1', 'old-password', 'new-password', 'new-password', async (sql, params) => {
    calls.push({ sql, params });
    if (calls.length === 1) return { rows: [{ password_hash: oldHash }] };
    return { rows: [] };
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].params, ['user-1']);
  assert.deepEqual(calls[1].params.slice(1), ['user-1']);
  assert.equal(verifyPassword('new-password', calls[1].params[0]), true);
});

test('修改密码拒绝错误的当前密码', async () => {
  const result = await changePassword('user-1', 'wrong-password', 'new-password', 'new-password', async () => ({
    rows: [{ password_hash: hashPassword('old-password') }],
  }));
  assert.deepEqual(result, {
    ok: false,
    code: 'INVALID_CURRENT_PASSWORD',
    message: '当前密码错误',
  });
});

test('显式 Cookie 安全配置优先于运行环境默认值', () => {
  assert.equal(shouldUseSecureCookies({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'false' }), false);
  assert.equal(shouldUseSecureCookies({ NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'true' }), true);
  assert.equal(shouldUseSecureCookies({ NODE_ENV: 'production' }), true);
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
