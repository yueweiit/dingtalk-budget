const PARENT_DEPARTMENT = {
  id: '1077343081',
  name: '悦为智能 YW Tech_Ai',
};

const CHILD_DEPARTMENTS = [
  { id: '1090021489', name: 'CEO' },
  { id: '1092411969', name: '业务' },
  { id: '1092483668', name: '开发' },
  { id: '1092530529', name: '运营' },
];

const compact = (value) => String(value || '').trim();

const budgetMonthOf = (record = {}) => compact(record.budget_month || record.declaration_month);

const budgetAmountOf = (record = {}) => {
  const values = [record.total_amount, record.budget_amount, record.monthly_budget_amount]
    .map((value) => Number(String(value ?? '').replace(/,/g, '')))
    .filter(Number.isFinite);
  return Math.max(0, ...values);
};

const expenseFields = [
  'approved_amount',
  'management_expense',
  'operation_expense',
  'purchase_expense',
  'salary_expense',
  'office_expense',
  'tax_expense',
  'operation_count',
  'purchase_count',
];

const approvedSummaryFields = [
  'operationTotal',
  'purchaseTotal',
  'managementTotal',
  'salaryTotal',
  'officeTotal',
  'taxTotal',
  'operationCount',
  'purchaseCount',
];

const numberValue = (value) => {
  const amount = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : 0;
};

const rounded = (value) => Number(numberValue(value).toFixed(2));

const departmentIdOf = (record = {}) => compact(record.dept_id || record.department_id);

const isSharedBudgetDepartment = (record = {}) => (
  budgetMonthOf(record) >= '2026-07'
  && [PARENT_DEPARTMENT.id, ...CHILD_DEPARTMENTS.map((child) => child.id)].includes(departmentIdOf(record))
);

export function isYWTechSharedBudgetParent(record = {}) {
  return budgetMonthOf(record) >= '2026-07' && compact(record.dept_id || record.department_id) === PARENT_DEPARTMENT.id;
}

export function sharedBudgetDepartmentRecords(record = {}) {
  if (!isYWTechSharedBudgetParent(record)) return [record];

  return [
    record,
    ...CHILD_DEPARTMENTS.map((child) => ({
      ...record,
      dept_id: child.id,
      dept_name: child.name,
      department_display: PARENT_DEPARTMENT.name,
      sub_department_display: child.name,
      department_identity_key: `id:${child.id}`,
      reporting_dept_id: child.id,
      reporting_dept_name: '',
      reporting_department_identity_key: `id:${child.id}`,
    })),
  ];
}

export function expandYWTechSharedBudgetRows(records = []) {
  return records.flatMap((record) => {
    if (!isYWTechSharedBudgetParent(record)) return [{ ...record, shared_budget_child: false }];

    const sharedBudgetParentAmount = budgetAmountOf(record);
    const [parent, ...children] = sharedBudgetDepartmentRecords(record);
    return [
      {
        ...parent,
        shared_budget_child: false,
        shared_budget_parent_amount: sharedBudgetParentAmount,
      },
      ...children.map((child) => ({
        ...child,
        shared_budget_child: true,
        shared_budget_parent_amount: sharedBudgetParentAmount,
        budget_amount_for_totals: 0,
      })),
    ];
  });
}

export function rollupYWTechBudgetRows(records = []) {
  const unchanged = [];
  const groups = new Map();

  for (const record of records) {
    if (!isSharedBudgetDepartment(record)) {
      unchanged.push(record);
      continue;
    }

    const key = `${compact(record.form_no || record.formNo)}__${budgetMonthOf(record)}`;
    const group = groups.get(key) || { rows: [], parent: null };
    group.rows.push(record);
    if (departmentIdOf(record) === PARENT_DEPARTMENT.id) group.parent = record;
    groups.set(key, group);
  }

  const rolledUp = [];
  for (const group of groups.values()) {
    if (!group.parent) {
      rolledUp.push(...group.rows);
      continue;
    }

    const totals = Object.fromEntries(expenseFields.map((field) => [field, numberValue(group.parent[field])]));
    const childExpenses = new Map(CHILD_DEPARTMENTS.map((child) => [child.id, {
      department_id: child.id,
      department_name: child.name,
      approved_amount: 0,
    }]));

    for (const record of group.rows) {
      const departmentId = departmentIdOf(record);
      if (departmentId === PARENT_DEPARTMENT.id || record.excluded_from_expense) continue;

      const childExpense = childExpenses.get(departmentId);
      if (!childExpense) continue;
      for (const field of expenseFields) totals[field] += numberValue(record[field]);
      childExpense.approved_amount = rounded(childExpense.approved_amount + numberValue(record.approved_amount));
    }

    const managementExpense = rounded(totals.management_expense);
    const operationExpense = rounded(totals.operation_expense);
    const purchaseExpense = rounded(totals.purchase_expense);
    const salaryExpense = rounded(totals.salary_expense);
    const officeExpense = rounded(totals.office_expense);
    const taxExpense = rounded(totals.tax_expense);
    const approvedAmount = rounded(managementExpense + salaryExpense + officeExpense + taxExpense);

    rolledUp.push({
      ...group.parent,
      shared_budget_child: false,
      shared_budget_parent_amount: budgetAmountOf(group.parent),
      department_display: PARENT_DEPARTMENT.name,
      sub_department_display: '',
      management_expense: managementExpense,
      operation_expense: operationExpense,
      purchase_expense: purchaseExpense,
      salary_expense: salaryExpense,
      office_expense: officeExpense,
      tax_expense: taxExpense,
      approved_amount: approvedAmount,
      operation_count: rounded(totals.operation_count),
      purchase_count: rounded(totals.purchase_count),
      expense_breakdown: {
        management: managementExpense,
        operation: operationExpense,
        purchase: purchaseExpense,
        salary: salaryExpense,
        office: officeExpense,
        tax: taxExpense,
        total: approvedAmount,
      },
      child_expenses: CHILD_DEPARTMENTS.map((child) => childExpenses.get(child.id)),
    });
  }

  return [...unchanged, ...rolledUp];
}

export function rollupYWTechApprovedExpenseSummaries(items = []) {
  const unchanged = [];
  const grouped = new Map();

  for (const item of items) {
    const month = compact(item.month);
    if (month < '2026-07' || ![PARENT_DEPARTMENT.id, ...CHILD_DEPARTMENTS.map((child) => child.id)].includes(departmentIdOf(item))) {
      unchanged.push(item);
      continue;
    }

    const key = `${PARENT_DEPARTMENT.id}__${month}`;
    const current = grouped.get(key) || {
      department: PARENT_DEPARTMENT.name,
      department_id: PARENT_DEPARTMENT.id,
      department_identity_key: `id:${PARENT_DEPARTMENT.id}`,
      department_display: PARENT_DEPARTMENT.name,
      sub_department_display: '',
      month,
      ...Object.fromEntries(approvedSummaryFields.map((field) => [field, 0])),
    };
    for (const field of approvedSummaryFields) current[field] += numberValue(item[field]);
    grouped.set(key, current);
  }

  return [...unchanged, ...[...grouped.values()].map((item) => ({
    ...item,
    ...Object.fromEntries(approvedSummaryFields.map((field) => [field, rounded(item[field])])),
  }))];
}

export function ywTechSharedBudgetRollupDepartment(record = {}, month = '') {
  if (compact(month) < '2026-07' || ![PARENT_DEPARTMENT.id, ...CHILD_DEPARTMENTS.map((child) => child.id)].includes(departmentIdOf(record))) {
    return null;
  }
  return {
    department_id: PARENT_DEPARTMENT.id,
    department_name: PARENT_DEPARTMENT.name,
  };
}

export const YW_TECH_SHARED_BUDGET = {
  parent: PARENT_DEPARTMENT,
  children: CHILD_DEPARTMENTS,
};
