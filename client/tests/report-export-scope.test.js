import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReportDepartmentScope,
  departmentInReportScope,
  filterReportDataForExport,
} from '../src/utils/reportExportScope.js';

const nonProductionParent = {
  dept_id: 'parent-1',
  dept_name: 'Non-production parent',
  dept_path_ids: ['root', 'parent-1'],
  dept_path_names: ['ROOT', 'Non-production parent'],
};

test('all export keeps all report data', () => {
  const data = {
    production: [{ form_no: 'P-1' }],
    nonProduction: [{ form_no: 'N-1' }],
    approvedExpenses: [{ business_id: 'E-1' }],
    approvedExpenseDetails: [{ business_id: 'E-1' }],
  };

  assert.deepEqual(filterReportDataForExport(data, 'all'), data);
});

test('non-production export keeps only departments with non-production budgets', () => {
  const data = {
    production: [{ form_no: 'P-1', dept_id: 'parent-1' }],
    nonProduction: [nonProductionParent],
    approvedExpenses: [
      { business_id: 'E-PARENT', department_id: 'parent-1' },
      { business_id: 'E-CHILD', department_id: 'child-1', department_path_ids: ['root', 'parent-1', 'child-1'] },
      { business_id: 'E-OTHER', department_id: 'other-1' },
    ],
    approvedExpenseDetails: [
      { business_id: 'D-CHILD', department_id: 'child-1' },
      { business_id: 'D-OTHER', department_id: 'other-1' },
    ],
  };

  const result = filterReportDataForExport(data, 'non-production');
  assert.deepEqual(result.production, []);
  assert.deepEqual(result.nonProduction, [nonProductionParent]);
  assert.deepEqual(result.approvedExpenses.map((item) => item.business_id), ['E-PARENT']);
  assert.deepEqual(result.approvedExpenseDetails, []);
});

test('non-production export keeps direct expenses with an empty split array', () => {
  const data = {
    production: [],
    nonProduction: [nonProductionParent],
    approvedExpenses: [],
    approvedExpenseDetails: [
      { business_id: 'DIRECT-PARENT', reporting_dept_id: 'parent-1', expense_splits: [] },
      { business_id: 'DIRECT-OTHER', reporting_dept_id: 'other-1', expense_splits: [] },
    ],
  };

  const result = filterReportDataForExport(data, 'non-production');
  assert.deepEqual(result.approvedExpenseDetails.map((item) => item.business_id), ['DIRECT-PARENT']);
});

test('production export does not include non-production budgets', () => {
  const data = {
    production: [{ form_no: 'P-1', dept_id: 'production-1' }],
    nonProduction: [{ form_no: 'N-1', dept_id: 'non-production-1' }],
    approvedExpenses: [
      { business_id: 'E-P', department_id: 'production-1' },
      { business_id: 'E-N', department_id: 'non-production-1' },
    ],
    approvedExpenseDetails: [],
  };

  const result = filterReportDataForExport(data, 'production');
  assert.deepEqual(result.production, data.production);
  assert.deepEqual(result.nonProduction, []);
  assert.deepEqual(result.approvedExpenses.map((item) => item.business_id), ['E-P']);
});

test('export scope matches department IDs, not child paths or same names', () => {
  const scope = buildReportDepartmentScope({ nonProduction: [nonProductionParent] }, 'non-production');
  assert.equal(departmentInReportScope({ department_id: 'child-1', dept_path_ids: ['root', 'parent-1', 'child-1'] }, scope), false);
  assert.equal(departmentInReportScope({ department_id: 'parent-1' }, scope), true);
  assert.equal(departmentInReportScope({ department_id: 'other-1', dept_name: 'Non-production parent' }, scope), false);
});

test('mixed department splits export only matching split rows', () => {
  const data = {
    nonProduction: [nonProductionParent],
    approvedExpenses: [],
    approvedExpenseDetails: [{
      business_id: 'D-MIXED',
      department_id: 'parent-1',
      expense_splits: [
        { department_id: 'parent-1', amount: 10 },
        { department_id: 'other-1', amount: 20 },
      ],
    }],
  };

  const result = filterReportDataForExport(data, 'non-production');
  assert.equal(result.approvedExpenseDetails.length, 1);
  assert.deepEqual(result.approvedExpenseDetails[0].expense_splits.map((split) => split.amount), [10]);
});

test('records without department information do not match an empty identity key', () => {
  const scope = buildReportDepartmentScope({
    nonProduction: [{ form_no: 'N-1' }],
  }, 'non-production');

  assert.equal(departmentInReportScope({}, scope), false);
});
