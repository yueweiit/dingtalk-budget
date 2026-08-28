const YW_TECH_SHARED_BUDGET = {
  parent: {
    id: '1077343081',
    name: '悦为智能 YW Tech_Ai',
  },
  children: [
    { id: '1090021489', name: 'CEO' },
    { id: '1092411969', name: '业务' },
    { id: '1092483668', name: '开发' },
    { id: '1092530529', name: '运营' },
  ],
};

const LATIN_PURCHASE_SHARED_BUDGET = {
  parent: {
    id: '1089990115',
    name: '拉丁购',
  },
  children: [
    { id: '1089527639', name: 'CEO' },
    { id: '1092658960', name: '直播' },
    { id: '1092931411', name: '产品' },
    { id: '1092985398', name: '运营' },
  ],
};

export const SHARED_BUDGET_CONFIGS = [
  YW_TECH_SHARED_BUDGET,
  LATIN_PURCHASE_SHARED_BUDGET,
];

const compact = (value) => String(value || '').trim();

const normalizeBudgetMonth = (value) => {
  const match = compact(value).match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return '';

  const month = Number(match[2]);
  if (month < 1 || month > 12) return '';
  return `${match[1]}-${String(month).padStart(2, '0')}`;
};

const budgetMonthOf = (record = {}) => normalizeBudgetMonth(record.budget_month || record.declaration_month);

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
  'it_operation_expense',
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
  'itOperationTotal',
  'operationCount',
  'purchaseCount',
];

const numberValue = (value) => {
  const amount = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : 0;
};

const rounded = (value) => Number(numberValue(value).toFixed(2));

const departmentIdOf = (record = {}) => compact(record.dept_id || record.department_id);

const sharedBudgetConfigForDepartment = (
  record = {},
  month = budgetMonthOf(record),
  configs = SHARED_BUDGET_CONFIGS
) => {
  const normalizedMonth = normalizeBudgetMonth(month);
  if (normalizedMonth < '2026-07') return null;

  const departmentId = departmentIdOf(record);
  const applicableConfigs = Array.isArray(configs) ? configs : SHARED_BUDGET_CONFIGS;
  return applicableConfigs.find((config) => (
    [config.parent.id, ...config.children.map((child) => child.id)].includes(departmentId)
  )) || null;
};

export function isSharedBudgetParent(record = {}, configs = SHARED_BUDGET_CONFIGS) {
  const config = sharedBudgetConfigForDepartment(record, budgetMonthOf(record), configs);
  return config?.parent.id === departmentIdOf(record);
}

export function sharedBudgetDepartmentRecords(record = {}, configs = SHARED_BUDGET_CONFIGS) {
  const config = isSharedBudgetParent(record, configs)
    && sharedBudgetConfigForDepartment(record, budgetMonthOf(record), configs);
  if (!config) return [record];

  return [
    record,
    ...config.children.map((child) => ({
      ...record,
      dept_id: child.id,
      dept_name: child.name,
      department_display: config.parent.name,
      sub_department_display: child.name,
      department_identity_key: `id:${child.id}`,
      reporting_dept_id: child.id,
      reporting_dept_name: '',
      reporting_department_identity_key: `id:${child.id}`,
    })),
  ];
}

export function expandSharedBudgetRows(records = [], configs = SHARED_BUDGET_CONFIGS) {
  return records.flatMap((record) => {
    if (!isSharedBudgetParent(record, configs)) return [{ ...record, shared_budget_child: false }];

    const sharedBudgetParentAmount = budgetAmountOf(record);
    const [parent, ...children] = sharedBudgetDepartmentRecords(record, configs);
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

export function rollupSharedBudgetRows(records = [], configs = SHARED_BUDGET_CONFIGS) {
  const unchanged = [];
  const groups = new Map();

  for (const record of records) {
    const config = sharedBudgetConfigForDepartment(record, budgetMonthOf(record), configs);
    if (!config) {
      unchanged.push(record);
      continue;
    }

    const key = `${config.parent.id}__${compact(record.form_no || record.formNo)}__${budgetMonthOf(record)}`;
    const group = groups.get(key) || { config, rows: [], parent: null };
    group.rows.push(record);
    if (departmentIdOf(record) === config.parent.id) group.parent = record;
    groups.set(key, group);
  }

  const rolledUp = [];
  for (const group of groups.values()) {
    if (!group.parent) {
      rolledUp.push(...group.rows);
      continue;
    }

    const { config } = group;
    const totals = Object.fromEntries(expenseFields.map((field) => [field, numberValue(group.parent[field])]));
    const childExpenses = new Map(config.children.map((child) => [child.id, {
      department_id: child.id,
      department_name: child.name,
      approved_amount: 0,
    }]));

    for (const record of group.rows) {
      const departmentId = departmentIdOf(record);
      if (departmentId === config.parent.id || record.excluded_from_expense) continue;

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
    const itOperationExpense = rounded(totals.it_operation_expense);
    const approvedAmount = rounded(managementExpense + salaryExpense + officeExpense + taxExpense + itOperationExpense);

    rolledUp.push({
      ...group.parent,
      shared_budget_child: false,
      shared_budget_parent_amount: budgetAmountOf(group.parent),
      department_display: config.parent.name,
      sub_department_display: '',
      management_expense: managementExpense,
      operation_expense: operationExpense,
      purchase_expense: purchaseExpense,
      salary_expense: salaryExpense,
      office_expense: officeExpense,
      tax_expense: taxExpense,
      it_operation_expense: itOperationExpense,
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
        it_operation: itOperationExpense,
        total: approvedAmount,
      },
      child_expenses: config.children.map((child) => childExpenses.get(child.id)),
    });
  }

  return [...unchanged, ...rolledUp];
}

export function rollupSharedBudgetApprovedExpenseSummaries(items = [], configs = SHARED_BUDGET_CONFIGS) {
  const unchanged = [];
  const grouped = new Map();

  for (const item of items) {
    const month = normalizeBudgetMonth(item.month);
    const config = sharedBudgetConfigForDepartment(item, month, configs);
    if (!config) {
      unchanged.push(item);
      continue;
    }

    const key = `${config.parent.id}__${month}`;
    const current = grouped.get(key) || {
      department: config.parent.name,
      department_id: config.parent.id,
      department_identity_key: `id:${config.parent.id}`,
      department_display: config.parent.name,
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

export function sharedBudgetRollupDepartment(record = {}, month = '', configs = SHARED_BUDGET_CONFIGS) {
  const config = sharedBudgetConfigForDepartment(record, month, configs);
  if (!config) return null;

  return {
    department_id: config.parent.id,
    department_name: config.parent.name,
  };
}

export function isYWTechSharedBudgetParent(record = {}) {
  return isSharedBudgetParent(record, [YW_TECH_SHARED_BUDGET]);
}

export function expandYWTechSharedBudgetRows(records = []) {
  return expandSharedBudgetRows(records, [YW_TECH_SHARED_BUDGET]);
}

export function rollupYWTechBudgetRows(records = []) {
  return rollupSharedBudgetRows(records, [YW_TECH_SHARED_BUDGET]);
}

export function rollupYWTechApprovedExpenseSummaries(items = []) {
  return rollupSharedBudgetApprovedExpenseSummaries(items, [YW_TECH_SHARED_BUDGET]);
}

export function ywTechSharedBudgetRollupDepartment(record = {}, month = '') {
  return sharedBudgetRollupDepartment(record, month, [YW_TECH_SHARED_BUDGET]);
}

export { YW_TECH_SHARED_BUDGET, LATIN_PURCHASE_SHARED_BUDGET };
