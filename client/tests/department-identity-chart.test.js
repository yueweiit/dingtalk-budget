import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeptApprovedComparison } from '../src/utils/chartHelpers.js';

test('同名但部门 ID 不同的部门在图表中分别统计', () => {
  const rows = buildDeptApprovedComparison([
    {
      deptName: '线上业务组',
      departmentIdentityKey: 'id:1001',
      totalBudget: 100,
      budgetSubmittedApprovedTotal: 20,
    },
    {
      deptName: '线上业务组',
      departmentIdentityKey: 'id:2002',
      totalBudget: 300,
      budgetSubmittedApprovedTotal: 80,
    },
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.budget).sort((a, b) => a - b), [100, 300]);
});
