import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildApprovedDetailRows,
  buildExpenseShareRows,
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
