import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApprovedDetailRows, buildExecutionRows } from '../src/utils/xlsxReport.js';
import { buildBudgetTrend, buildDeptApprovedComparison } from '../src/utils/chartHelpers.js';

test('uses one YW Tech parent row for execution totals and charts', () => {
  const parentRow = {
    formNo: 'YW-BUDGET-001',
    deptName: '悦为智能 YW Tech_Ai',
    deptId: '1077343081',
    budgetMonth: '2026-07',
    amount: 100,
  };
  const rows = buildExecutionRows({
    productionRows: [],
    operationRows: [parentRow],
    approvedExpenses: [{
      department: '悦为智能 YW Tech_Ai',
      department_id: '1077343081',
      department_identity_key: 'id:1077343081',
      month: '2026-07',
      managementTotal: 10,
      salaryTotal: 20,
      officeTotal: 30,
      taxTotal: 40,
    }],
    reportMonth: '2026-07',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].deptName, '悦为智能 YW Tech_Ai');
  assert.equal(rows[0].totalBudget, 100);
  assert.equal(rows[0].totalApproved, 100);
  assert.deepEqual(buildDeptApprovedComparison(rows), [
    { deptName: '悦为智能 YW Tech_Ai', budget: 100, approved: 100 },
  ]);
  assert.deepEqual(buildBudgetTrend([], [parentRow]), [
    { month: '2026-07', monthLabel: '7月', production: 0, nonProduction: 100, total: 100, actualExpense: 0 },
  ]);
});

test('exports a shared-budget child detail under the YW Tech parent department', () => {
  const [row] = buildApprovedDetailRows([{
    business_id: 'YW-DETAIL-001',
    expense_kind: 'operation',
    query_month: '2026-07',
    expense_splits: [{
      department: '开发',
      department_id: '1092483668',
      amount: 30,
      split_type: 'office_space',
      rollup_dept_id: '1077343081',
      rollup_dept_name: '悦为智能 YW Tech_Ai',
    }],
  }]);

  assert.equal(row.department, '悦为智能 YW Tech_Ai');
  assert.equal(row.departmentId, '1077343081');
  assert.equal(row.departmentIdentityKey, 'id:1077343081');
  assert.equal(row.rollupDepartment, '悦为智能 YW Tech_Ai');
});
