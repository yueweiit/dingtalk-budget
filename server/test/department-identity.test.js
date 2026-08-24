import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDepartmentIdentity,
  getServiceEntityRoutingInput,
  parseNonProductionBudget,
  parseProductionBudget,
} from '../services/parser.js';

function detailWithDepartment(departmentField, overrides = {}) {
  return {
    businessId: '202607230001000000001',
    processInstanceId: 'process-1',
    originatorDeptId: 'originator-dept-id',
    originatorDeptName: 'Originator Department',
    formComponentValues: [
      departmentField,
      { name: 'Presupuesto Total', componentType: 'TextField', value: '1' },
    ],
    ...overrides,
  };
}

test('prefers the DepartmentField ID for budget department identity', () => {
  const detail = detailWithDepartment({
    name: '申请部门/组织 Departamento Solicitante',
    componentType: 'DepartmentField',
    value: 'Form Department',
    extendValue: JSON.stringify([{ id: 'form-dept-id', name: 'Form Department' }]),
  });

  assert.deepEqual(getDepartmentIdentity(detail), {
    dept_id: 'form-dept-id',
    dept_source: 'form_id',
  });
});

test('uses the originator department ID when the DepartmentField has no ID', () => {
  const detail = detailWithDepartment({
    name: '申请部门/组织 Departamento Solicitante',
    componentType: 'DepartmentField',
    value: 'Form Department',
    extendValue: JSON.stringify([{ name: 'Form Department' }]),
  });

  assert.deepEqual(getDepartmentIdentity(detail), {
    dept_id: 'originator-dept-id',
    dept_source: 'originator_id',
  });
});

test('marks a budget as name-only when no department ID is available', () => {
  const detail = detailWithDepartment({
    name: '申请部门/组织 Departamento Solicitante',
    componentType: 'DepartmentField',
    value: 'Form Department',
  }, {
    originatorDeptId: '',
  });

  assert.deepEqual(getDepartmentIdentity(detail), {
    dept_id: null,
    dept_source: 'name_only',
  });
});

test('production and non-production budget parsers retain department identity fields', () => {
  const detail = detailWithDepartment({
    name: '申请部门/组织 Departamento Solicitante',
    componentType: 'DepartmentField',
    value: 'Form Department',
    extendValue: JSON.stringify([{ deptId: 'form-dept-id', name: 'Form Department' }]),
  });

  for (const parseBudget of [parseProductionBudget, parseNonProductionBudget]) {
    const budget = parseBudget(detail);
    assert.equal(budget.dept_id, 'form-dept-id');
    assert.equal(budget.dept_source, 'form_id');
    assert.equal(budget.dept_path_ids, null);
    assert.equal(budget.dept_path_names, null);
  }
});

test('不把其他 DepartmentField 误认为旧申请部门', () => {
  const detail = detailWithDepartment({
    name: '工资拆分部门',
    componentType: 'DepartmentField',
    value: '工资部门',
    extendValue: JSON.stringify([{ id: 'salary-dept-id' }]),
  });

  assert.deepEqual(getDepartmentIdentity(detail), {
    dept_id: 'originator-dept-id',
    dept_source: 'originator_id',
  });
});

test('服务主体多层选择读取编码和对应部门，不读取旧申请部门', () => {
  const routing = getServiceEntityRoutingInput({
    formComponentValues: [
      {
        name: '服务主体Cliente',
        componentType: 'DDCascadeField',
        value: 'YUEWEI MX核心制造/PG生产',
        extValue: JSON.stringify({ code: '1092705940', name: 'PG生产' }),
      },
      { name: '对应部门', componentType: 'TextField', value: 'PG生产' },
    ],
  });

  assert.deepEqual(routing, {
    service_entity_expected: true,
    service_entity: 'PG生产',
    service_entity_code: '1092705940',
    corresponding_department: 'PG生产',
  });
});
