import assert from 'node:assert/strict';
import test from 'node:test';

import { buildExecutionRows } from '../src/utils/xlsxReport.js';

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
