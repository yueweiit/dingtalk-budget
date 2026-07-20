import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBudgetedDepartmentMonthSet,
  shouldIncludeDepartmentExpense,
} from '../routes/list.js';

test('filters non-China expense only for departments with a budget in the same month', () => {
  const department = 'FC CN财务中心 Centro de finanzas';
  const budgetedDepartments = buildBudgetedDepartmentMonthSet([
    {
      dept_name: department,
      budget_month: '2026-07',
      total_amount: 11678.55,
    },
  ]);

  assert.equal(
    shouldIncludeDepartmentExpense(department, '2026-07', '墨西哥Mexico', budgetedDepartments),
    false
  );
  assert.equal(
    shouldIncludeDepartmentExpense(department, '2026-07', '中国China', budgetedDepartments),
    true
  );
  assert.equal(
    shouldIncludeDepartmentExpense(department, '2026-07', '', budgetedDepartments),
    false
  );
  assert.equal(
    shouldIncludeDepartmentExpense(department, '2026-08', '墨西哥Mexico', budgetedDepartments),
    true
  );
  assert.equal(
    shouldIncludeDepartmentExpense('未提交预算部门', '2026-07', '墨西哥Mexico', budgetedDepartments),
    true
  );
});
