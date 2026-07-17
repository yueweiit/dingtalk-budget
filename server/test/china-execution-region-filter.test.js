import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBudgetWhere,
  isChinaExecutionRegion,
  isChinaOnlyDepartment,
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

test('only OBG and SG departments require China execution region', () => {
  const obg = 'OBG 线上业务组Grupo de negocios en linea';
  const sales = 'SG 销售小组Grupo de ventas';

  assert.equal(isChinaOnlyDepartment(obg), true);
  assert.equal(isChinaOnlyDepartment(sales), true);
  assert.equal(isChinaOnlyDepartment('IT&SC 信息技术和体系管理'), false);
  assert.equal(shouldIncludeDepartmentExpense(obg, '墨西哥Mexico'), false);
  assert.equal(shouldIncludeDepartmentExpense(obg, '中国China'), true);
  assert.equal(shouldIncludeDepartmentExpense('IT&SC 信息技术和体系管理', '墨西哥Mexico'), true);
});

test('budget list queries restrict China execution region only for OBG and SG', () => {
  const { whereClause } = buildBudgetWhere('n');

  assert.match(whereClause, /n\.execution_region/i);
  assert.match(whereClause, /china/i);
  assert.match(whereClause, /obg/i);
  assert.match(whereClause, /sg/i);
});

test('Mexico split is excluded only for OBG and keeps other departments', () => {
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
  ]);

  assert.equal(item.department, 'IT&SC 信息技术和体系管理');
  assert.equal(item.officeTotal, 60);
  assert.equal(item.operationTotal, 60);
});
