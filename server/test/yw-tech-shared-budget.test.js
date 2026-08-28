import assert from 'node:assert/strict';
import test from 'node:test';

import {
  expandYWTechSharedBudgetRows,
  isYWTechSharedBudgetParent,
  expandSharedBudgetRows,
  isSharedBudgetParent,
  rollupSharedBudgetApprovedExpenseSummaries,
  rollupSharedBudgetRows,
  sharedBudgetRollupDepartment,
  rollupYWTechApprovedExpenseSummaries,
  rollupYWTechBudgetRows,
  sharedBudgetDepartmentRecords,
  ywTechSharedBudgetRollupDepartment,
} from '../services/yw-tech-shared-budget.js';
import {
  applyExpenseDetailReportingOverlay,
  attachExpenseAmounts,
  summarizeApprovedDetails,
} from '../routes/list.js';
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

const latinPurchaseParentBudget = {
  form_no: 'LATIN-BUDGET-001',
  dept_id: '1089990115',
  dept_name: '拉丁购',
  budget_month: '2026-07',
  total_amount: 100,
};

test('expands a July Latin Purchase parent budget into the parent plus four shared-budget child rows', () => {
  assert.equal(isSharedBudgetParent(latinPurchaseParentBudget), true);

  const rows = expandSharedBudgetRows([latinPurchaseParentBudget]);
  assert.deepEqual(rows.map((row) => row.dept_id), [
    '1089990115',
    '1089527639',
    '1092658960',
    '1092931411',
    '1092985398',
  ]);
  assert.equal(rows[0].shared_budget_child, false);
  assert.deepEqual(
    rows.slice(1).map((row) => [row.shared_budget_child, row.shared_budget_parent_amount, row.budget_amount_for_totals]),
    [
      [true, 100, 0],
      [true, 100, 0],
      [true, 100, 0],
      [true, 100, 0],
    ]
  );
});

test('rolls Latin Purchase parent and child expenses into its parent budget row', () => {
  const rows = rollupSharedBudgetRows([
    {
      ...latinPurchaseParentBudget,
      approved_amount: 10,
      management_expense: 10,
      operation_expense: 10,
      operation_count: 1,
    },
    {
      ...latinPurchaseParentBudget,
      dept_id: '1089527639',
      dept_name: 'CEO',
      approved_amount: 20,
      management_expense: 10,
      salary_expense: 20,
      operation_count: 1,
    },
    {
      ...latinPurchaseParentBudget,
      dept_id: '1092658960',
      dept_name: '直播',
      approved_amount: 30,
      office_expense: 30,
      operation_count: 1,
    },
    {
      ...latinPurchaseParentBudget,
      dept_id: '1092931411',
      dept_name: '产品',
      approved_amount: 40,
      tax_expense: 40,
      operation_count: 1,
    },
    {
      ...latinPurchaseParentBudget,
      dept_id: '1092985398',
      dept_name: '运营',
      approved_amount: 50,
      purchase_expense: 50,
      purchase_count: 1,
    },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dept_id, '1089990115');
  assert.equal(rows[0].management_expense, 20);
  assert.equal(rows[0].salary_expense, 20);
  assert.equal(rows[0].office_expense, 30);
  assert.equal(rows[0].tax_expense, 40);
  assert.equal(rows[0].purchase_expense, 50);
  assert.equal(rows[0].approved_amount, 110);
  assert.deepEqual(
    rows[0].child_expenses.map((item) => [item.department_id, item.approved_amount]),
    [
      ['1089527639', 20],
      ['1092658960', 30],
      ['1092931411', 40],
      ['1092985398', 50],
    ]
  );
});

test('rolls Latin Purchase child report and detail summaries into its parent from July only', () => {
  assert.deepEqual(
    sharedBudgetRollupDepartment({ department_id: '1092931411' }, '2026-07'),
    { department_id: '1089990115', department_name: '拉丁购' }
  );
  assert.equal(sharedBudgetRollupDepartment({ department_id: '1092931411' }, '2026-06'), null);
});

test('reports YW Tech and Latin Purchase child expense details under their parent departments', () => {
  const [ywDetail, latinDetail] = applyExpenseDetailReportingOverlay([
    {
      business_id: 'YW-CHILD-DIRECT',
      query_month: '2026-07',
      applicant_department: '开发',
      applicant_department_id: '1092483668',
    },
    {
      business_id: 'LATIN-CHILD-SPLIT',
      query_month: '2026-07',
      applicant_department: '拉丁购',
      applicant_department_id: '1089990115',
      expense_splits: [{
        department: '产品',
        department_id: '1092931411',
        amount: 50,
        split_type: 'individual_income_tax',
      }],
    },
  ]);

  assert.deepEqual(
    [ywDetail.reporting_dept_id, ywDetail.reporting_dept_name, ywDetail.reporting_department_identity_key],
    ['1077343081', '悦为智能 YW Tech_Ai', 'id:1077343081']
  );
  assert.deepEqual(
    [latinDetail.expense_splits[0].reporting_dept_id, latinDetail.expense_splits[0].reporting_dept_name, latinDetail.expense_splits[0].reporting_department_identity_key],
    ['1089990115', '拉丁购', 'id:1089990115']
  );
});

test('normalizes valid shared-budget months and rejects invalid or pre-July months', () => {
  assert.equal(isSharedBudgetParent(latinPurchaseParentBudget), true);
  assert.equal(isSharedBudgetParent({ ...latinPurchaseParentBudget, budget_month: '2026-7' }), true);
  assert.equal(isSharedBudgetParent({ ...latinPurchaseParentBudget, budget_month: '2026-06' }), false);
  assert.equal(isSharedBudgetParent({ ...latinPurchaseParentBudget, budget_month: '2026-13' }), false);
  assert.equal(isSharedBudgetParent({ ...latinPurchaseParentBudget, budget_month: 'junk' }), false);
  assert.equal(isSharedBudgetParent({ ...latinPurchaseParentBudget, budget_month: '' }), false);
  assert.deepEqual(
    sharedBudgetRollupDepartment({ department_id: '1092931411' }, '2026-7'),
    { department_id: '1089990115', department_name: '拉丁购' }
  );
  assert.equal(sharedBudgetRollupDepartment({ department_id: '1092931411' }, '2026-13'), null);
});

test('keeps the legacy YW Tech APIs scoped to YW Tech rather than Latin Purchase', () => {
  assert.equal(isYWTechSharedBudgetParent(latinPurchaseParentBudget), false);
  assert.equal(ywTechSharedBudgetRollupDepartment({ department_id: '1092931411' }, '2026-07'), null);
});

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

test('attaches a China Latin Purchase product tax split to its parent budget row', async () => {
  const rows = await attachExpenseAmounts([latinPurchaseParentBudget], {
    approvedDetails: [{
      business_id: 'LATIN-PRODUCT-TAX-CHINA',
      expense_kind: 'operation',
      query_month: '2026-07',
      execution_region: 'China',
      expense_splits: [{
        business_id: 'LATIN-PRODUCT-TAX-CHINA',
        department: 'Product',
        department_id: '1092931411',
        split_type: 'tax',
        amount: 25,
      }],
    }],
    budgetedDepartmentMonths: buildBudgetedDepartmentMonthSet([latinPurchaseParentBudget]),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].dept_id, '1089990115');
  assert.equal(rows[0].tax_expense, 25);
  assert.equal(rows[0].approved_amount, 25);
  assert.equal(
    rows[0].child_expenses.find((item) => item.department_id === '1092931411').approved_amount,
    25
  );
});

test('excludes a Mexico Latin Purchase product tax split when the budget is submitted', async () => {
  const rows = await attachExpenseAmounts([latinPurchaseParentBudget], {
    approvedDetails: [{
      business_id: 'LATIN-PRODUCT-TAX-MEXICO',
      expense_kind: 'operation',
      query_month: '2026-07',
      execution_region: 'Mexico',
      expense_splits: [{
        business_id: 'LATIN-PRODUCT-TAX-MEXICO',
        department: 'Product',
        department_id: '1092931411',
        split_type: 'tax',
        amount: 25,
      }],
    }],
    budgetedDepartmentMonths: buildBudgetedDepartmentMonthSet([latinPurchaseParentBudget]),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].approved_amount, 0);
  assert.equal(rows[0].tax_expense, 0);
  assert.equal(
    rows[0].child_expenses.find((item) => item.department_id === '1092931411').approved_amount,
    0
  );
});

test('excludes a submitted Latin Purchase product tax split in Mexico from approved summaries', () => {
  const rows = rollupSharedBudgetApprovedExpenseSummaries(summarizeApprovedDetails([{
    business_id: 'LATIN-PRODUCT-TAX-SUMMARY-MEXICO',
    expense_kind: 'operation',
    query_month: '2026-07',
    execution_region: 'Mexico',
    base_currency_amount: 30,
    expense_splits: [{
      business_id: 'LATIN-PRODUCT-TAX-SUMMARY-MEXICO',
      department: '产品',
      department_id: '1092931411',
      split_type: 'tax',
      amount: 25,
    }],
  }], buildBudgetedDepartmentMonthSet([latinPurchaseParentBudget])));

  assert.deepEqual(rows, []);
});

test('includes a submitted Latin Purchase product tax split in China in approved summaries', () => {
  const rows = rollupSharedBudgetApprovedExpenseSummaries(summarizeApprovedDetails([{
    business_id: 'LATIN-PRODUCT-TAX-SUMMARY-CHINA',
    expense_kind: 'operation',
    query_month: '2026-07',
    execution_region: 'China',
    base_currency_amount: 25,
    expense_splits: [{
      business_id: 'LATIN-PRODUCT-TAX-SUMMARY-CHINA',
      department: '产品',
      department_id: '1092931411',
      split_type: 'tax',
      amount: 25,
    }],
  }], buildBudgetedDepartmentMonthSet([latinPurchaseParentBudget])));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].department_id, '1089990115');
  assert.equal(rows[0].taxTotal, 25);
  assert.equal(rows[0].operationCount, 1);
});

test('counts each operation or purchase form once on the Latin Purchase parent row', async () => {
  const rows = await attachExpenseAmounts([latinPurchaseParentBudget], {
    approvedDetails: [
      {
        business_id: 'LATIN-PRODUCT-OPERATION',
        expense_kind: 'operation',
        query_month: '2026-07',
        execution_region: 'China',
        expense_splits: [{
          business_id: 'LATIN-PRODUCT-OPERATION',
          department: '产品',
          department_id: '1092931411',
          split_type: 'operation',
          amount: 20,
        }],
      },
      {
        business_id: 'LATIN-PRODUCT-PURCHASE',
        expense_kind: 'purchase',
        query_month: '2026-07',
        execution_region: 'China',
        expense_splits: [{
          business_id: 'LATIN-PRODUCT-PURCHASE',
          department: '产品',
          department_id: '1092931411',
          split_type: 'purchase',
          amount: 30,
        }],
      },
      {
        business_id: 'LATIN-PRODUCT-SALARY',
        expense_kind: 'operation',
        query_month: '2026-07',
        execution_region: 'China',
        expense_splits: [{
          business_id: 'LATIN-PRODUCT-SALARY',
          department: '产品',
          department_id: '1092931411',
          split_type: 'salary',
          amount: 5,
        }],
      },
      {
        business_id: 'LATIN-PRODUCT-OFFICE',
        expense_kind: 'operation',
        query_month: '2026-07',
        execution_region: 'China',
        expense_splits: [{
          business_id: 'LATIN-PRODUCT-OFFICE',
          department: '产品',
          department_id: '1092931411',
          split_type: 'office',
          amount: 6,
        }],
      },
      {
        business_id: 'LATIN-PRODUCT-TAX',
        expense_kind: 'operation',
        query_month: '2026-07',
        execution_region: 'China',
        expense_splits: [{
          business_id: 'LATIN-PRODUCT-TAX',
          department: '产品',
          department_id: '1092931411',
          split_type: 'tax',
          amount: 7,
        }],
      },
    ],
    budgetedDepartmentMonths: buildBudgetedDepartmentMonthSet([latinPurchaseParentBudget]),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].operation_count, 4);
  assert.equal(rows[0].purchase_count, 1);
});

test('applies Latin Purchase rollup departments to product expense details and splits', () => {
  const [detail] = applyExpenseDetailReportingOverlay([{
    business_id: 'LATIN-PRODUCT-DETAIL',
    query_month: '2026-07',
    applicant_department: 'Product',
    applicant_department_id: '1092931411',
    expense_splits: [{
      business_id: 'LATIN-PRODUCT-DETAIL',
      department: 'Product',
      department_id: '1092931411',
      split_type: 'tax',
      amount: 25,
    }],
  }]);

  assert.equal(detail.rollup_dept_id, '1089990115');
  assert.equal(detail.rollup_dept_name, '拉丁购');
  assert.equal(detail.expense_splits[0].rollup_dept_id, '1089990115');
  assert.equal(detail.expense_splits[0].rollup_dept_name, '拉丁购');
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
    itOperationTotal: 0,
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

test('keeps an operation split remainder on the applicant department budget row', async () => {
  const rows = await attachExpenseAmounts([latinPurchaseParentBudget], {
    approvedDetails: [{
      business_id: 'LATIN-PARTIAL-SPLIT',
      expense_kind: 'operation',
      query_month: '2026-07',
      execution_region: 'China',
      applicant_department: 'Product',
      applicant_department_id: '1092931411',
      base_currency_amount: 30,
      expense_splits: [{
        business_id: 'LATIN-PARTIAL-SPLIT',
        department: 'Product',
        department_id: '1092931411',
        split_type: 'management',
        amount: 25,
      }],
    }],
    budgetedDepartmentMonths: buildBudgetedDepartmentMonthSet([latinPurchaseParentBudget]),
  });

  assert.equal(rows[0].management_expense, 30);
  assert.equal(rows[0].approved_amount, 30);
  assert.equal(rows[0].operation_count, 1);
  assert.equal(
    rows[0].child_expenses.find((item) => item.department_id === '1092931411').approved_amount,
    30
  );
});

test('uses purchase split departments for the China-region budget filter and rollup', () => {
  const rows = rollupSharedBudgetApprovedExpenseSummaries(summarizeApprovedDetails([{
    business_id: 'LATIN-PURCHASE-SPLIT-CHINA',
    expense_kind: 'purchase',
    query_month: '2026-07',
    execution_region: 'China',
    applicant_department: 'Other',
    applicant_department_id: 'other-department',
    base_currency_amount: 30,
    expense_splits: [{
      business_id: 'LATIN-PURCHASE-SPLIT-CHINA',
      department: 'Product',
      department_id: '1092931411',
      split_type: 'purchase',
      amount: 30,
    }],
  }], buildBudgetedDepartmentMonthSet([latinPurchaseParentBudget])));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].department_id, '1089990115');
  assert.equal(rows[0].month, '2026-07');
  assert.equal(rows[0].purchaseTotal, 30);
  assert.equal(rows[0].managementTotal, 30);
  assert.equal(rows[0].purchaseCount, 1);
});

test('classifies purchase splits and counts one operation form per department', async () => {
  const rows = await attachExpenseAmounts([latinPurchaseParentBudget], {
    approvedDetails: [
      {
        business_id: 'LATIN-PURCHASE-CLASSIFICATION',
        expense_kind: 'purchase',
        query_month: '2026-07',
        execution_region: 'China',
        expense_splits: [{
          business_id: 'LATIN-PURCHASE-CLASSIFICATION',
          department: 'Product',
          department_id: '1092931411',
          split_type: 'purchase',
          amount: 30,
        }],
      },
      {
        business_id: 'LATIN-DUPLICATE-OPERATION',
        expense_kind: 'operation',
        query_month: '2026-07',
        execution_region: 'China',
        expense_splits: [
          {
            business_id: 'LATIN-DUPLICATE-OPERATION',
            department: 'Product',
            department_id: '1092931411',
            split_type: 'management',
            amount: 10,
          },
          {
            business_id: 'LATIN-DUPLICATE-OPERATION',
            department: 'Product',
            department_id: '1092931411',
            split_type: 'management',
            amount: 20,
          },
        ],
      },
    ],
    budgetedDepartmentMonths: buildBudgetedDepartmentMonthSet([latinPurchaseParentBudget]),
  });

  assert.equal(rows[0].purchase_expense, 30);
  assert.equal(rows[0].purchase_count, 1);
  assert.equal(rows[0].operation_count, 1);
});
