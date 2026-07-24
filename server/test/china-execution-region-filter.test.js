import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBudgetWhere,
  buildBudgetedDepartmentMonthSet,
  isChinaExecutionRegion,
  shouldIncludeDepartmentExpense,
  summarizeApprovedDetails,
} from '../routes/list.js';

test('recognizes China execution region values', () => {
  assert.equal(isChinaExecutionRegion('中国China'), true);
  assert.equal(isChinaExecutionRegion('China'), true);
  assert.equal(isChinaExecutionRegion('CN'), true);
  assert.equal(isChinaExecutionRegion('墨西哥Mexico'), false);
  assert.equal(isChinaExecutionRegion(''), false);
  assert.equal(isChinaExecutionRegion(null), false);
});

test('departments with a budget amount require China execution region', () => {
  const department = 'IT&SC 信息技术和体系管理';
  const budgetedDepartments = buildBudgetedDepartmentMonthSet([
    { dept_name: department, budget_month: '2026-07', total_amount: 1 },
  ]);

  assert.equal(shouldIncludeDepartmentExpense(department, '2026-07', '墨西哥Mexico', budgetedDepartments), false);
  assert.equal(shouldIncludeDepartmentExpense(department, '2026-07', '中国China', budgetedDepartments), true);
  assert.equal(shouldIncludeDepartmentExpense(department, '2026-08', '墨西哥Mexico', budgetedDepartments), true);
});

test('PD&PM 中国支出带 CN 标识时仍按同一预算部门执行地区筛选', () => {
  const budgetDepartment = 'PD&PM 产品和生产管理Administracion de productos y produccion';
  const chinaExpenseDepartment = 'PD&PM 产品和生产管理CN Administracion de productos y produccion';
  const budgetedDepartments = buildBudgetedDepartmentMonthSet([
    { dept_name: budgetDepartment, budget_month: '2026-06', total_amount: 1 },
  ]);

  assert.equal(
    shouldIncludeDepartmentExpense(chinaExpenseDepartment, '2026-06', '墨西哥Mexico', budgetedDepartments),
    false,
  );
  assert.equal(
    shouldIncludeDepartmentExpense(chinaExpenseDepartment, '2026-06', '中国China', budgetedDepartments),
    true,
  );
});

test('budget list queries restrict China execution region for nonzero budget amounts', () => {
  const { whereClause } = buildBudgetWhere('n');

  assert.match(whereClause, /n\.execution_region/i);
  assert.match(whereClause, /china/i);
  assert.match(whereClause, /n\.total_amount/i);
  assert.match(whereClause, /n\.budget_amount/i);
});

test('budget queries exclude withdrawn and rejected budget applications by default', () => {
  const { whereClause } = buildBudgetWhere('n', {}, { filterExecutionRegion: false });

  assert.match(whereClause, /n\.status/i);
  assert.match(whereClause, /撤销/);
  assert.match(whereClause, /撤回/);
  assert.match(whereClause, /驳回/);
});

test('Mexico split is excluded for a department with a budget and keeps other departments', () => {
  const budgetedDepartments = buildBudgetedDepartmentMonthSet([
    {
      dept_name: 'OBG 线上业务组Grupo de negocios en linea',
      budget_month: '2026-07',
      total_amount: 1,
    },
  ]);
  const [item] = summarizeApprovedDetails([
    {
      expense_kind: 'operation',
      execution_region: '墨西哥Mexico',
      business_id: 'sample-1',
      query_month: '2026-07',
      base_currency_amount: 100,
      applicant_department: 'IT&SC 信息技术和体系管理',
      expense_splits: [
        { department: 'OBG 线上业务组Grupo de negocios en linea', amount: 40, split_type: 'office_space' },
        { department: 'IT&SC 信息技术和体系管理', amount: 60, split_type: 'office_space' },
      ],
    },
  ], budgetedDepartments);

  assert.equal(item.department, 'IT&SC 信息技术和体系管理');
  assert.equal(item.officeTotal, 60);
  assert.equal(item.operationTotal, 60);
});
