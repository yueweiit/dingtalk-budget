import assert from 'node:assert/strict';
import test from 'node:test';

import { enrichBudgetDepartmentSnapshot } from '../routes/sync.js';

test('新预算表单以服务主体归属覆盖旧申请部门', async () => {
  const result = await enrichBudgetDepartmentSnapshot({
    dept_id: 'old-department-id',
    dept_name: '旧申请部门',
    dept_source: 'form_id',
    service_entity_expected: true,
    service_entity: 'YUEWEI MX核心制造/PG生产',
    service_entity_code: '1092705940',
    corresponding_department: 'PG生产',
  }, async () => ({
    status: 'resolved',
    department: 'PG生产',
    departmentId: '1092705940',
    departmentPathIds: ['root', 'entity', '1092705940'],
    departmentPathNames: ['ROOT', 'YUEWEI MX核心制造', 'PG生产'],
  }));

  assert.equal(result.dept_id, '1092705940');
  assert.equal(result.dept_name, 'PG生产');
  assert.equal(result.dept_source, 'service_entity_exact');
});

test('新预算表单的空服务主体不退回旧申请部门', async () => {
  const result = await enrichBudgetDepartmentSnapshot({
    dept_id: 'old-department-id',
    dept_name: '旧申请部门',
    dept_source: 'form_id',
    service_entity_expected: true,
    service_entity: null,
    service_entity_code: null,
  }, async () => ({ status: 'unresolved' }));

  assert.equal(result.dept_id, null);
  assert.equal(result.dept_name, null);
  assert.equal(result.dept_source, 'service_entity_unresolved');
});
