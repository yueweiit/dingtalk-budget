import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDepartmentIdentityUpdate,
  resolveBudgetDepartmentBackfill,
} from '../services/budget-department-backfill.js';

test('resolves a missing budget department identity from the OA DepartmentField', () => {
  const result = resolveBudgetDepartmentBackfill({
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
      name: '部门Departamento',
      componentType: 'DepartmentField',
      value: 'PD&PH 产品和采购Producto&Compras',
      extendValue: JSON.stringify([{ id: '1060178527', name: 'PD&PH 产品和采购Producto&Compras' }]),
    }],
  }, {
    dept_path_ids: ['1', '1004758048', '1060178527'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PD&PH 产品和采购Producto&Compras'],
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

test('skips a budget when the OA source has no reliable department ID', () => {
  const result = resolveBudgetDepartmentBackfill({
    table_name: 'production_budget',
    form_no: '202606291025000524551',
    process_instance_id: 'process-2',
    dept_id: null,
  }, {
    process_instance_id: 'process-2',
    originator_dept_id: null,
    form_component_values: [{
      name: '部门Departamento',
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
