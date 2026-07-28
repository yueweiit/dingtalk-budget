import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expandYWTechSharedBudgetRows,
  isYWTechSharedBudgetParent,
  rollupYWTechApprovedExpenseSummaries,
  rollupYWTechBudgetRows,
  sharedBudgetDepartmentRecords,
  ywTechSharedBudgetRollupDepartment,
} from '../services/yw-tech-shared-budget.js';
import { attachExpenseAmounts } from '../routes/list.js';
import {
  buildBudgetedDepartmentMonthSet,
  shouldIncludeDepartmentExpense,
} from '../routes/list.js';

const parentBudget = {
  form_no: 'YW-BUDGET-001',
  dept_id: '1077343081',
  dept_name: '悦为智能 YW Tech_Ai',
  budget_month: '2026-07',
  total_amount: 100,
};

test('expands a July YW Tech parent budget into the parent plus four shared-budget child rows', () => {
  assert.equal(isYWTechSharedBudgetParent(parentBudget), true);

  const rows = expandYWTechSharedBudgetRows([parentBudget]);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].shared_budget_child, false);
  assert.equal(rows[0].dept_id, '1077343081');

  assert.deepEqual(
    rows.slice(1).map((row) => [row.dept_id, row.sub_department_display, row.shared_budget_parent_amount, row.budget_amount_for_totals]),
    [
      ['1090021489', 'CEO', 100, 0],
      ['1092411969', '业务', 100, 0],
      ['1092483668', '开发', 100, 0],
      ['1092530529', '运营', 100, 0],
    ]
  );
});

test('treats the parent and all four children as budget-submitted departments from July onward only', () => {
  assert.deepEqual(
    sharedBudgetDepartmentRecords(parentBudget).map((row) => row.dept_id),
    ['1077343081', '1090021489', '1092411969', '1092483668', '1092530529']
  );
  assert.deepEqual(
    sharedBudgetDepartmentRecords({ ...parentBudget, budget_month: '2026-06' }).map((row) => row.dept_id),
    ['1077343081']
  );
});

test('applies the existing China execution-region rule to a child that shares its parent budget', () => {
  const submittedDepartments = buildBudgetedDepartmentMonthSet([parentBudget]);
  const businessDepartment = { dept_id: '1092411969', dept_name: '业务' };

  assert.equal(
    shouldIncludeDepartmentExpense(businessDepartment, '2026-07', 'China', submittedDepartments),
    true
  );
  assert.equal(
    shouldIncludeDepartmentExpense(businessDepartment, '2026-07', 'Mexico', submittedDepartments),
    false
  );
});

test('attaches parent and child expenses to one parent budget row', async () => {
  const rows = await attachExpenseAmounts([parentBudget], {
    approvedDetails: [
      {
        business_id: 'CHILD-EXPENSE',
        expense_kind: 'operation',
        query_month: '2026-07',
        execution_region: 'China',
        expense_splits: [{
          business_id: 'CHILD-EXPENSE',
          department: '业务',
          department_id: '1092411969',
          split_type: 'management',
          amount: 20,
        }],
      },
      {
        business_id: 'PARENT-EXPENSE',
        expense_kind: 'operation',
        query_month: '2026-07',
        execution_region: 'China',
        applicant_department: '悦为智能 YW Tech_Ai',
        applicant_department_id: '1077343081',
        base_currency_amount: 10,
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dept_id, '1077343081');
  assert.equal(rows[0].approved_amount, 30);
  assert.deepEqual(
    rows[0].child_expenses.map((item) => [item.department_id, item.approved_amount]),
    [
      ['1090021489', 0],
      ['1092411969', 20],
      ['1092483668', 0],
      ['1092530529', 0],
    ]
  );
});

test('rolls July child expenses into one YW Tech parent budget row', () => {
  const rows = rollupYWTechBudgetRows([
    {
      ...parentBudget,
      approved_amount: 10,
      management_expense: 10,
      salary_expense: 0,
      office_expense: 0,
      tax_expense: 0,
      operation_expense: 10,
      purchase_expense: 0,
      operation_count: 1,
      purchase_count: 0,
    },
    {
      ...parentBudget,
      dept_id: '1090021489',
      dept_name: 'CEO',
      approved_amount: 5,
      management_expense: 5,
    },
    {
      ...parentBudget,
      dept_id: '1092411969',
      dept_name: '业务',
      approved_amount: 20,
      salary_expense: 20,
    },
    {
      ...parentBudget,
      dept_id: '1092483668',
      dept_name: '开发',
      approved_amount: 30,
      office_expense: 30,
    },
    {
      ...parentBudget,
      dept_id: '1092530529',
      dept_name: '运营',
      approved_amount: 40,
      tax_expense: 40,
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dept_id, '1077343081');
  assert.equal(rows[0].total_amount, 100);
  assert.equal(rows[0].approved_amount, 105);
  assert.equal(rows[0].management_expense, 15);
  assert.equal(rows[0].salary_expense, 20);
  assert.equal(rows[0].office_expense, 30);
  assert.equal(rows[0].tax_expense, 40);
  assert.deepEqual(
    rows[0].child_expenses.map((item) => [item.department_id, item.approved_amount]),
    [
      ['1090021489', 5],
      ['1092411969', 20],
      ['1092483668', 30],
      ['1092530529', 40],
    ]
  );
});

test('rolls July YW Tech child expense summaries into the parent department', () => {
  const rows = rollupYWTechApprovedExpenseSummaries([
    {
      department: '业务',
      department_id: '1092411969',
      department_identity_key: 'id:1092411969',
      month: '2026-07',
      salaryTotal: 20,
      operationCount: 1,
    },
    {
      department: '开发',
      department_id: '1092483668',
      department_identity_key: 'id:1092483668',
      month: '2026-07',
      officeTotal: 30,
      operationCount: 1,
    },
    {
      department: '悦为智能 YW Tech_Ai',
      department_id: '1077343081',
      department_identity_key: 'id:1077343081',
      month: '2026-07',
      managementTotal: 10,
      operationTotal: 10,
      operationCount: 1,
    },
  ]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    department: '悦为智能 YW Tech_Ai',
    department_id: '1077343081',
    department_identity_key: 'id:1077343081',
    department_display: '悦为智能 YW Tech_Ai',
    sub_department_display: '',
    month: '2026-07',
    operationTotal: 10,
    purchaseTotal: 0,
    managementTotal: 10,
    salaryTotal: 20,
    officeTotal: 30,
    taxTotal: 0,
    operationCount: 3,
    purchaseCount: 0,
  });
});

test('marks only July YW Tech parent and known children with the parent rollup department', () => {
  assert.deepEqual(
    ywTechSharedBudgetRollupDepartment({ department_id: '1092483668' }, '2026-07'),
    { department_id: '1077343081', department_name: '悦为智能 YW Tech_Ai' }
  );
  assert.equal(ywTechSharedBudgetRollupDepartment({ department_id: '1092483668' }, '2026-06'), null);
  assert.equal(ywTechSharedBudgetRollupDepartment({ department_id: 'unknown' }, '2026-07'), null);
});
