import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildApprovedDetailRows,
  buildExpenseShareRows,
  expenseDetailText,
} from '../src/utils/xlsxReport.js';
import {
  buildPaymentSequenceMap,
  paymentEventDate,
  paymentEventLabel,
} from '../src/utils/paymentEventDisplay.js';

const events = [
  {
    accounting_source: 'payment_event',
    business_id: 'PAY-001',
    payment_event_id: 2,
    payment_event_paid_at: '2026-08-03T00:00:00.000Z',
  },
  {
    accounting_source: 'payment_event',
    business_id: 'PAY-001',
    payment_event_id: 1,
    payment_event_paid_at: '2026-07-31T00:00:00.000Z',
  },
];

test('orders payment events into installments by payment time', () => {
  const sequence = buildPaymentSequenceMap(events);
  assert.equal(sequence.get('PAY-001::1'), 1);
  assert.equal(sequence.get('PAY-001::2'), 2);
  assert.equal(paymentEventLabel(events[0], sequence.get('PAY-001::2'), 2), '第2期付款');
  assert.equal(paymentEventDate(events[1]), '2026-07-31T00:00:00.000Z');
});

test('labels a single payment event as actual payment', () => {
  const singleEvent = {
    accounting_source: 'payment_event',
    business_id: 'PAY-SINGLE-001',
    payment_event_id: 1,
  };
  assert.equal(paymentEventLabel(singleEvent, 1, 1), '实际付款');
});

test('labels a fully deducted event distinctly', () => {
  assert.equal(paymentEventLabel({
    accounting_source: 'payment_event',
    payment_event_evidence_text: '已全额抵扣',
  }, 1, 1), '已全额抵扣');
});

test('exports payment date, installment, amount, and comment evidence', () => {
  const [row] = buildApprovedDetailRows([{
    accounting_source: 'payment_event',
    accounting_at: '2026-08-03T00:00:00.000Z',
    payment_event_paid_at: '2026-08-03T00:00:00.000Z',
    payment_event_id: 7,
    payment_event_amount: 1250,
    payment_event_evidence_text: '已支付：1250元',
    business_id: 'PAY-EXPORT-001',
    expense_kind: 'operation',
    applicant_department: '财务中心',
    amount: 1250,
    base_currency_amount: 1250,
    query_month: '2026-08',
    title: '付款测试',
  }]);

  assert.equal(row.month, '2026-08');
  assert.equal(row.accountingAt, '2026-08-03');
  assert.equal(row.paymentEventLabel, '实际付款');
  assert.equal(row.paymentAmount, 1250);
  assert.equal(row.paymentEvidence, '已支付：1250元');
});

test('部门支出占比使用事项说明而不是表单标题', () => {
  const [detailRow] = buildApprovedDetailRows([{
    accounting_source: 'completed_approval_fallback',
    business_id: 'EXPENSE-MATTER-001',
    expense_kind: 'operation',
    applicant_department: '财务中心',
    amount: 880,
    base_currency_amount: 880,
    query_month: '2026-08',
    title: '运营支出表单标题',
    matter_description: '事项说明组件中的真实内容',
  }]);

  const [shareRow] = buildExpenseShareRows([detailRow]);
  assert.equal(shareRow.detail, '事项说明组件中的真实内容');
});

test('采购明细使用规格明细需求说明而不是审批标题', () => {
  assert.equal(expenseDetailText({
    expense_kind: 'purchase',
    title: '某人提交的采购支出',
    specification_requirement_description: '采购规格明细需求说明',
  }), '采购规格明细需求说明');
});

test('实际支出明细行保留采购组件和月结付款说明', () => {
  const rows = buildApprovedDetailRows([
    {
      expense_kind: 'purchase',
      business_id: 'PURCHASE-DETAIL-001',
      title: '采购审批标题',
      specification_requirement_description: '采购组件内容',
      matter_description: '',
      amount: 70,
    },
    {
      accounting_source: 'monthly_settlement',
      expense_kind: 'monthly_settlement',
      business_id: 'MONTHLY-DETAIL-001',
      title: '月结审批标题',
      payment_reason: '月结付款说明内容',
      matter_description: '已支付640元',
      amount: 640,
    },
  ]);

  assert.deepEqual(rows.map((row) => row.matterDescription), ['采购组件内容', '月结付款说明内容']);
});

test('部门支出占比识别显示态采购类型并使用规格明细需求说明', () => {
  const [row] = buildExpenseShareRows(buildApprovedDetailRows([{
    expense_kind: 'purchase',
    business_id: 'PURCHASE-SHARE-001',
    title: '某人提交的采购支出 Gastos de compra',
    matter_description: '规格组件内容',
    amount: 13332,
  }]));

  assert.equal(row.category, '采购支出');
  assert.equal(row.detail, '规格组件内容');
});

test('采购和月结缺少业务说明时不回退到审批标题', () => {
  assert.equal(expenseDetailText({ expense_kind: 'purchase', title: '采购审批标题' }), '');
  assert.equal(expenseDetailText({ accounting_source: 'monthly_settlement', title: '月结审批标题' }), '');
});

test('月结付款明细使用付款说明而不是付款评论', () => {
  assert.equal(expenseDetailText({
    accounting_source: 'monthly_settlement',
    title: '月结付款',
    payment_reason: '8月办公费用结算',
    matter_description: '已支付640元',
  }), '8月办公费用结算');
});

test('导出人工公司分摊时使用中文分类标签', () => {
  const [row] = buildApprovedDetailRows([{
    accounting_source: 'completed_approval_fallback',
    business_id: 'EXPENSE-MANUAL-001',
    expense_kind: 'operation',
    query_month: '2026-08',
    base_currency_amount: 100,
    expense_splits: [{
      department: 'YW MOLDES MX模具',
      department_id: '1089528309',
      amount: 100,
      split_type: 'manual_company_allocation',
      note: '按打印量分摊',
    }],
  }]);

  assert.equal(row.splitNote, '人工公司分摊拆分自 EXPENSE-MANUAL-001：按打印量分摊');
});
