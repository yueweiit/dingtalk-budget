import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyJulyDepartmentReportingOverlay,
  resolveJulyDepartmentReporting,
} from '../services/july-department-reporting-overlay.js';
import {
  applyExpenseDetailReportingOverlay,
  summarizeApprovedDetails,
} from '../routes/list.js';
import {
  buildBudgetedDepartmentMonthSet,
  shouldIncludeDepartmentExpense,
} from '../routes/list.js';

test('maps the confirmed July new departments to their old reporting departments', () => {
  const cases = [
    ['1089928990', 'FC CN财务中心 Centro de finanzas', '1079492125'],
    ['1089765983', 'HR CN人力资源Recursos humanos', '1059093807'],
    ['1090235336', 'SG 销售小组Grupo de ventas', '1059634386'],
    ['1090006841', 'PD&PH 产品和采购Producto&Compras', '1060178527'],
    ['1089481630', 'OBG 线上业务组Grupo de negocios en línea', '1059483024'],
  ];

  for (const [sourceDepartmentId, expectedName, expectedDepartmentId] of cases) {
    assert.deepEqual(
      resolveJulyDepartmentReporting({ departmentId: sourceDepartmentId, month: '2026-07' }),
      { departmentId: expectedDepartmentId, departmentName: expectedName, mapped: true }
    );
  }
});

test('does not map the Mexico OBG department or non-July data', () => {
  assert.deepEqual(
    resolveJulyDepartmentReporting({ departmentId: '1089533879', month: '2026-07' }),
    { departmentId: '1089533879', departmentName: '', mapped: false }
  );
  assert.deepEqual(
    resolveJulyDepartmentReporting({ departmentId: '1089890445', month: '2026-07' }),
    { departmentId: '1089890445', departmentName: '', mapped: false }
  );
  assert.deepEqual(
    resolveJulyDepartmentReporting({ departmentId: '1089928990', month: '2026-08' }),
    { departmentId: '1089928990', departmentName: '', mapped: false }
  );
});

test('adds reporting fields without replacing raw department fields', () => {
  const row = applyJulyDepartmentReportingOverlay({
    dept_id: '1089533879',
    dept_name: '产品&开发',
    budget_month: '2026-07',
  });

  assert.equal(row.dept_id, '1089533879');
  assert.equal(row.dept_name, '产品&开发');
  assert.equal(row.reporting_dept_id, '1089533879');
  assert.equal(row.reporting_dept_name, '产品&开发');
});

test('merges all July split expense categories into the old department once', () => {
  const rows = summarizeApprovedDetails([
    {
      expense_kind: 'operation',
      business_id: 'expense-1',
      query_month: '2026-07',
      base_currency_amount: 220,
      expense_splits: [
        { department: '供应链及采购执行单元', department_id: '1090006841', split_type: 'salary', amount: 100 },
        { department: '供应链及采购执行单元', department_id: '1090006841', split_type: 'social_insurance', amount: 50 },
        { department: '供应链及采购执行单元', department_id: '1090006841', split_type: 'office_space', amount: 40 },
        { department: '供应链及采购执行单元', department_id: '1090006841', split_type: 'individual_income_tax', amount: 30 },
      ],
    },
    {
      expense_kind: 'operation',
      business_id: 'expense-2',
      query_month: '2026-07',
      base_currency_amount: 20,
      expense_splits: [
        { department: '供应链及采购执行单元', department_id: '1090006841', split_type: 'management', amount: 20 },
      ],
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].department_id, '1060178527');
  assert.equal(rows[0].department, 'PD&PH 产品和采购Producto&Compras');
  assert.equal(rows[0].salaryTotal, 150);
  assert.equal(rows[0].officeTotal, 40);
  assert.equal(rows[0].taxTotal, 30);
  assert.equal(rows[0].managementTotal, 20);
  assert.equal(rows[0].operationTotal, 240);
  assert.equal(rows[0].operationCount, 2);
});

test('matches a new July split department to the old department budget for region filtering', () => {
  const budgetedDepartments = buildBudgetedDepartmentMonthSet([
    {
      dept_id: '1060178527',
      dept_name: 'PD&PH 产品和采购Producto&Compras',
      budget_month: '2026-07',
      total_amount: 1000,
    },
  ]);
  const newDepartment = { dept_id: '1090006841', dept_name: '供应链及采购执行单元' };

  assert.equal(
    shouldIncludeDepartmentExpense(newDepartment, '2026-07', '中国China', budgetedDepartments),
    true
  );
  assert.equal(
    shouldIncludeDepartmentExpense(newDepartment, '2026-07', '墨西哥Mexico', budgetedDepartments),
    false
  );
});

test('adds reporting fields to report details without overwriting raw departments', () => {
  const [detail] = applyExpenseDetailReportingOverlay([{
    business_id: 'expense-detail-1',
    query_month: '2026-07',
    applicant_department: '供应链及采购执行单元',
    applicant_department_id: '1090006841',
    expense_splits: [{
      department: '供应链及采购执行单元',
      department_id: '1090006841',
      split_type: 'individual_income_tax',
      amount: 30,
    }],
  }]);

  assert.equal(detail.applicant_department, '供应链及采购执行单元');
  assert.equal(detail.applicant_department_id, '1090006841');
  assert.equal(detail.reporting_dept_id, '1060178527');
  assert.equal(detail.reporting_dept_name, 'PD&PH 产品和采购Producto&Compras');
  assert.equal(detail.expense_splits[0].department, '供应链及采购执行单元');
  assert.equal(detail.expense_splits[0].department_id, '1090006841');
  assert.equal(detail.expense_splits[0].reporting_dept_id, '1060178527');
  assert.equal(detail.expense_splits[0].reporting_department_identity_key, 'id:1060178527');
});
