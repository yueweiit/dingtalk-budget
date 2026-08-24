import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDepartmentIdentityUpdate,
  resolveBudgetDepartmentBackfill,
} from '../services/budget-department-backfill.js';

test('resolves a missing budget department identity from the OA DepartmentField', async () => {
  const result = await resolveBudgetDepartmentBackfill({
    table_name: 'non_production_budget',
    form_no: '202606291535000318730',
    process_instance_id: 'process-1',
    dept_id: null,
    dept_name: 'PD&PH 产品和采购Producto&Compras',
    total_amount: 1000,
  }, {
    process_instance_id: 'process-1',
    originator_dept_id: 'originator-1',
    originator_dept_name: 'Originator Department',
    form_component_values: [{
      name: '申请部门/组织 Departamento Solicitante',
      componentType: 'DepartmentField',
      value: 'PD&PH 产品和采购Producto&Compras',
      extendValue: JSON.stringify([{ id: '1060178527', name: 'PD&PH 产品和采购Producto&Compras' }]),
    }],
  }, {
    snapshot: {
    dept_path_ids: ['1', '1004758048', '1060178527'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PD&PH 产品和采购Producto&Compras'],
    },
  });

  assert.deepEqual(result, {
    action: 'update',
    table_name: 'non_production_budget',
    form_no: '202606291535000318730',
    process_instance_id: 'process-1',
    dept_id: '1060178527',
    dept_source: 'form_id',
    dept_path_ids: ['1', '1004758048', '1060178527'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PD&PH 产品和采购Producto&Compras'],
  });
});

test('skips a budget when the OA source has no reliable department ID', async () => {
  const result = await resolveBudgetDepartmentBackfill({
    table_name: 'production_budget',
    form_no: '202606291025000524551',
    process_instance_id: 'process-2',
    dept_id: null,
  }, {
    process_instance_id: 'process-2',
    originator_dept_id: null,
    form_component_values: [{
      name: '申请部门/组织 Departamento Solicitante',
      componentType: 'DepartmentField',
      value: '财务中心',
    }],
  });

  assert.deepEqual(result, {
    action: 'skip',
    reason: 'missing_department_id',
    table_name: 'production_budget',
    form_no: '202606291025000524551',
    process_instance_id: 'process-2',
  });
});

test('回填按服务主体编码覆盖新表单的旧部门兜底', async () => {
  const result = await resolveBudgetDepartmentBackfill({
    table_name: 'non_production_budget',
    form_no: '202608240001000000001',
    process_instance_id: 'process-service-entity',
    dept_id: null,
  }, {
    originator_dept_id: 'old-originator-id',
    originator_dept_name: '旧发起部门',
    form_component_values: [{
      name: '服务主体Cliente',
      componentType: 'DDCascadeField',
      extValue: JSON.stringify({ code: '1092705940', name: 'PG生产' }),
    }],
  }, {
    async resolveServiceEntityDepartment() {
      return {
        status: 'resolved',
        department: 'PG生产',
        departmentId: '1092705940',
        departmentPathIds: ['root', 'entity', '1092705940'],
        departmentPathNames: ['ROOT', 'YUEWEI MX核心制造', 'PG生产'],
      };
    },
  });

  assert.equal(result.dept_id, '1092705940');
  assert.equal(result.dept_source, 'service_entity_exact');
});

test('服务主体为空或无法唯一归属的回填不退回发起部门', async () => {
  const result = await resolveBudgetDepartmentBackfill({
    table_name: 'production_budget',
    form_no: '202608240001000000002',
    process_instance_id: 'process-service-entity-empty',
    dept_id: null,
  }, {
    originator_dept_id: 'old-originator-id',
    form_component_values: [{ name: '服务主体', componentType: 'DDCascadeField', value: '' }],
  }, {
    async resolveServiceEntityDepartment() {
      return { status: 'unresolved' };
    },
  });

  assert.equal(result.action, 'skip');
  assert.equal(result.reason, 'service_entity_unresolved');
});

test('builds an update guarded by the original form and an empty department ID', () => {
  const update = buildDepartmentIdentityUpdate({
    table_name: 'non_production_budget',
    form_no: '202606291535000318730',
    process_instance_id: 'process-1',
    dept_id: '1060178527',
    dept_source: 'form_id',
    dept_path_ids: ['1', '1004758048', '1060178527'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PD&PH 产品和采购Producto&Compras'],
  });

  assert.match(update.sql, /UPDATE non_production_budget/i);
  assert.match(update.sql, /NULLIF\(BTRIM\(dept_id\), ''\) IS NULL/i);
  assert.match(update.sql, /form_no = \$5/i);
  assert.match(update.sql, /process_instance_id = \$6/i);
  assert.doesNotMatch(update.sql, /dept_name\s*=/i);
  assert.deepEqual(update.params, [
    '1060178527',
    'form_id',
    JSON.stringify(['1', '1004758048', '1060178527']),
    JSON.stringify(['ROOT', 'YUEWEI', 'PD&PH 产品和采购Producto&Compras']),
    '202606291535000318730',
    'process-1',
  ]);
});
