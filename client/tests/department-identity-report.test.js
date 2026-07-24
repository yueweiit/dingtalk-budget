import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildApprovedDetailRows,
  buildExecutionRows,
} from '../src/utils/xlsxReport.js';
import { departmentMatches } from '../src/utils/departmentIdentity.js';
import { expenseDetailSplitRecord } from '../src/utils/expenseDetailSplit.js';

test('Excel 执行明细按部门 ID 区分同名部门', () => {
  const rows = buildExecutionRows({
    productionRows: [
      { formNo: 'P-1', deptName: '线上业务组', deptId: '1001', budgetMonth: '2026-07', requestAmount: 100 },
      { formNo: 'P-2', deptName: '线上业务组', deptId: '2002', budgetMonth: '2026-07', requestAmount: 300 },
    ],
    operationRows: [],
    approvedExpenses: [
      { department: '线上业务组', department_identity_key: 'id:1001', month: '2026-07', managementTotal: 20 },
      { department: '线上业务组', department_identity_key: 'id:2002', month: '2026-07', managementTotal: 80 },
    ],
    reportMonth: '2026-07',
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.totalBudget).sort((a, b) => a - b), [100, 300]);
  assert.deepEqual(rows.map((row) => row.totalApproved).sort((a, b) => a - b), [20, 80]);
});

test('July reporting department joins a new department budget to its old department expenses', () => {
  const rows = buildExecutionRows({
    productionRows: [{
      formNo: 'P-JULY-1',
      deptName: '新产品与开发',
      deptId: '1090006841',
      reporting_dept_name: 'PD&PH 产品和采购Producto&Compras',
      reporting_dept_id: '1060178527',
      reporting_department_identity_key: 'id:1060178527',
      budgetMonth: '2026-07',
      requestAmount: 100,
    }],
    operationRows: [],
    approvedExpenses: [{
      department: 'PD&PH 产品和采购Producto&Compras',
      department_identity_key: 'id:1060178527',
      month: '2026-07',
      managementTotal: 20,
    }],
    reportMonth: '2026-07',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].deptName, 'PD&PH 产品和采购Producto&Compras');
  assert.equal(rows[0].totalBudget, 100);
  assert.equal(rows[0].totalApproved, 20);
});

test('approved detail rows present the reporting department without changing non-reporting rows', () => {
  const rows = buildApprovedDetailRows([
    {
      business_id: 'EXP-JULY-1',
      expense_kind: 'operation',
      query_month: '2026-07',
      amount: 50,
      applicant_department: '新产品与开发',
      applicant_department_id: '1090006841',
      reporting_dept_name: 'PD&PH 产品和采购Producto&Compras',
      reporting_dept_id: '1060178527',
      reporting_department_identity_key: 'id:1060178527',
    },
    {
      business_id: 'EXP-AUGUST-1',
      expense_kind: 'operation',
      query_month: '2026-08',
      amount: 60,
      applicant_department: '新产品与开发',
      applicant_department_id: '1089533879',
    },
    {
      business_id: 'EXP-MEXICO-1',
      expense_kind: 'operation',
      query_month: '2026-07',
      amount: 70,
      applicant_department: 'OBG1线上业务部',
      applicant_department_id: '1089890445',
    },
  ]);

  const byBusinessId = new Map(rows.map((row) => [row.businessId, row]));
  assert.deepEqual(
    [
      byBusinessId.get('EXP-JULY-1'),
      byBusinessId.get('EXP-AUGUST-1'),
      byBusinessId.get('EXP-MEXICO-1'),
    ].map((row) => [row.department, row.departmentId, row.departmentIdentityKey]),
    [
      ['PD&PH 产品和采购Producto&Compras', '1060178527', 'id:1060178527'],
      ['新产品与开发', '1089533879', 'legacy:EXP-AUGUST-1:新产品与开发'],
      ['OBG1线上业务部', '1089890445', 'legacy:EXP-MEXICO-1:obg1线上业务部'],
    ]
  );
});

test('July reporting department includes new OBG tax and social insurance splits in the old department detail', () => {
  const oldObgBudget = {
    dept_name: 'OBG 线上业务组Grupo de negocios en línea',
    dept_id: '1059483024',
    budget_month: '2026-07',
  };
  const socialInsurance = expenseDetailSplitRecord({
    department: 'OBG线上业务组',
    department_id: '1089481630',
    reporting_dept_id: '1059483024',
    reporting_dept_name: 'OBG 线上业务组Grupo de negocios en línea',
    split_type: 'social_insurance',
    amount: 6380.56,
  });
  const tax = expenseDetailSplitRecord({
    department: 'OBG线上业务组',
    department_id: '1089481630',
    reporting_dept_id: '1059483024',
    reporting_dept_name: 'OBG 线上业务组Grupo de negocios en línea',
    split_type: 'individual_income_tax',
    amount: 338.28,
  });

  assert.equal(departmentMatches(oldObgBudget, socialInsurance), true);
  assert.equal(departmentMatches(oldObgBudget, tax), true);
});
