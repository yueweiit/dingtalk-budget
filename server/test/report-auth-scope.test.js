import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterExpenseDetailsForReport,
  scopeExpenseDetailsForUser,
  summarizeApprovedDetails,
} from '../routes/list.js';

const supervisor = {
  role: 'department_supervisor',
  departmentId: 'dept-yw',
};

test('部门主管只能看到跨部门表单中属于自己的拆分金额', () => {
  const [row] = scopeExpenseDetailsForUser([{
    business_id: 'form-1',
    applicant_department: '其他部门',
    applicant_department_id: 'dept-other',
    amount: 1000,
    base_currency_amount: 1000,
    expense_splits: [
      { department: '悦为智能', department_id: 'dept-yw', amount: 333.57, split_type: 'tax' },
      { department: '其他部门', department_id: 'dept-other', amount: 666.43, split_type: 'office_space' },
    ],
  }], supervisor);

  assert.equal(row.applicant_department_id, null);
  assert.equal(row.base_currency_amount, 333.57);
  assert.equal(row.expense_splits.length, 1);
  assert.equal(row.expense_splits[0].department_id, 'dept-yw');
  assert.equal(row.expense_splits[0].amount, 333.57);
});

test('当前部门的直接金额不包含其他部门拆分金额', () => {
  const [row] = scopeExpenseDetailsForUser([{
    business_id: 'form-2',
    applicant_department: '悦为智能',
    applicant_department_id: 'dept-yw',
    amount: 1000,
    base_currency_amount: 1000,
    expense_splits: [
      { department: '悦为智能', department_id: 'dept-yw', amount: 100, split_type: 'tax' },
      { department: '其他部门', department_id: 'dept-other', amount: 900, split_type: 'office_space' },
    ],
  }], supervisor);

  assert.equal(row.base_currency_amount, 100);
  assert.equal(row.expense_splits.length, 1);
  const [summary] = summarizeApprovedDetails([{
    ...row,
    query_month: '2026-08',
    expense_kind: 'operation',
    accounting_source: 'completed_department_split',
    execution_region: 'China',
    approval_status: 'COMPLETED',
    result: 'agree',
  }]);
  assert.equal(summary.operationTotal, 100);
  assert.equal(summary.taxTotal, 100);
});

test('部门主管看不到完全属于其他部门的表单', () => {
  const rows = scopeExpenseDetailsForUser([{
    business_id: 'form-3',
    applicant_department: '其他部门',
    applicant_department_id: 'dept-other',
    amount: 500,
    base_currency_amount: 500,
    expense_splits: [],
  }], supervisor);

  assert.deepEqual(rows, []);
});

test('导出报表会裁剪保存在旧 JSON 字段中的跨部门拆分', () => {
  const details = [{
    business_id: 'form-legacy-json-split',
    applicant_department: '悦为智能',
    applicant_department_id: 'dept-yw',
    amount: 1000,
    base_currency_amount: 1000,
    salary_by_department: [
      { department: '悦为智能', department_id: 'dept-yw', amount: 333.57 },
      { department: '其他部门', department_id: 'dept-other', amount: 666.43 },
    ],
  }];

  const [scoped] = scopeExpenseDetailsForUser(details, supervisor);
  assert.equal(scoped.base_currency_amount, 333.57);
  assert.deepEqual(scoped.expense_splits.map((entry) => entry.department), ['悦为智能']);
  assert.equal(scoped.expense_splits[0].split_type, 'salary');

  const [exportRow] = filterExpenseDetailsForReport(details, new Set(), supervisor);
  assert.equal(exportRow.base_currency_amount, 333.57);
  assert.deepEqual(exportRow.expense_splits.map((entry) => entry.department), ['悦为智能']);
  assert.equal(JSON.stringify(exportRow).includes('其他部门'), false);
});

test('无拆分的可见表单也不暴露提交人的其他部门', () => {
  const [row] = scopeExpenseDetailsForUser([{
    business_id: 'form-direct-visible',
    applicant_department: '悦为智能',
    applicant_department_id: 'dept-yw',
    creator_department: '其他部门',
    creator_department_id: 'dept-other',
    amount: 100,
    base_currency_amount: 100,
  }], supervisor);

  assert.equal(row.creator_department, null);
  assert.equal(row.creator_department_id, null);
  assert.equal(JSON.stringify(row).includes('其他部门'), false);
});
