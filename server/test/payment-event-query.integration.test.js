import assert from 'node:assert/strict';
import pg from 'pg';
import test from 'node:test';

import { fetchApprovalExpenseDetails } from '../routes/list.js';

const canRun = Boolean(process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD);

function createClient() {
  return new pg.Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.APPROVAL_DB_DATABASE || process.env.DINGTALK_APPROVAL_DATABASE || 'dingtalk_approval',
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
}

test('a current-rule payment event is the only entry for an otherwise completed approval', { skip: !canRun }, async () => {
  const businessId = `test-payment-event-query-${Date.now()}`;
  const client = createClient();
  await client.connect();
  try {
    await client.query(`
      INSERT INTO approval_expense_operation (
        business_id, process_instance_id, applicant_department, execution_region,
        amount, base_currency_amount, approval_status, approval_completed_at, raw_data
      ) VALUES ($1, $2, 'Test Department', 'China', 100, 100, 'COMPLETED', '2026-08-06T01:00:00.000Z',
        '{"status":"COMPLETED","result":"agree","title":"Payment event test"}'::jsonb)
    `, [businessId, `pid-${businessId}`]);
    await client.query(`
      INSERT INTO approval_expense_payment_events (
        business_id, process_instance_id, expense_kind, paid_at, amount, base_currency_amount,
        currency, source_type, rule_version, source_user_id, source_hash, evidence_text, status
      ) VALUES ($1, $2, 'operation', '2026-08-05T01:00:00.000Z', 30, 30,
        'CNY', 'comment_explicit_amount', 'authorized-comment-v1', '57521312381178275', $3, 'paid 30', 'confirmed')
    `, [businessId, `pid-${businessId}`, 'b'.repeat(64)]);

    const details = await fetchApprovalExpenseDetails({ startDate: '2026-08', endDate: '2026-08' });
    const matching = details.filter((item) => item.business_id === businessId);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].accounting_source, 'payment_event');
    assert.equal(Number(matching[0].base_currency_amount), 30);
  } finally {
    await client.query('DELETE FROM approval_expense_payment_events WHERE business_id = $1', [businessId]);
    await client.query('DELETE FROM approval_expense_operation WHERE business_id = $1', [businessId]);
    await client.end();
  }
});

test('an explicitly reviewed manual confirmation is included as a payment event', { skip: !canRun }, async () => {
  const businessId = `test-manual-payment-event-${Date.now()}`;
  const client = createClient();
  await client.connect();
  try {
    await client.query(`
      INSERT INTO approval_expense_operation (
        business_id, process_instance_id, applicant_department, execution_region,
        amount, base_currency_amount, approval_status, raw_data
      ) VALUES ($1, $2, 'Test Department', 'China', 100, 100, 'RUNNING',
        '{"status":"RUNNING","title":"Manual payment event test"}'::jsonb)
    `, [businessId, `pid-${businessId}`]);
    await client.query(`
      INSERT INTO approval_expense_payment_events (
        business_id, process_instance_id, expense_kind, paid_at, amount, base_currency_amount,
        currency, source_type, rule_version, source_hash, evidence_text, status
      ) VALUES ($1, $2, 'operation', '2026-08-05T01:00:00.000Z', 30, 30,
        'CNY', 'manual_confirmed', 'manual-confirmed-v1', $3, '已支付（人工确认）', 'confirmed')
    `, [businessId, `pid-${businessId}`, 'manual'.repeat(13).slice(0, 64)]);

    const details = await fetchApprovalExpenseDetails({ startDate: '2026-08', endDate: '2026-08' });
    const matching = details.filter((item) => item.business_id === businessId);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].accounting_source, 'payment_event');
    assert.equal(Number(matching[0].base_currency_amount), 30);
  } finally {
    await client.query('DELETE FROM approval_expense_payment_events WHERE business_id = $1', [businessId]);
    await client.query('DELETE FROM approval_expense_operation WHERE business_id = $1', [businessId]);
    await client.end();
  }
});

test('a completed non-split approval without an authorized comment uses the final-approval fallback', { skip: !canRun }, async () => {
  const businessId = `test-completed-without-comment-${Date.now()}`;
  const client = createClient();
  await client.connect();
  try {
    await client.query(`
      INSERT INTO approval_expense_operation (
        business_id, process_instance_id, applicant_department, execution_region,
        amount, base_currency_amount, approval_status, approval_completed_at, raw_data
      ) VALUES ($1, $2, 'Test Department', 'China', 100, 100, 'COMPLETED', '2026-08-06T01:00:00.000Z',
        '{"status":"COMPLETED","result":"agree","title":"Completed without payment comment test"}'::jsonb)
    `, [businessId, `pid-${businessId}`]);

    const details = await fetchApprovalExpenseDetails({ startDate: '2026-08', endDate: '2026-08' });
    const matching = details.filter((item) => item.business_id === businessId);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].accounting_source, 'completed_approval_fallback');
    assert.equal(Number(matching[0].base_currency_amount), 100);
  } finally {
    await client.query('DELETE FROM approval_expense_operation WHERE business_id = $1', [businessId]);
    await client.end();
  }
});

test('purchase payment events and completed-approval fallbacks are both included without double-counting', { skip: !canRun }, async () => {
  const eventBusinessId = `test-purchase-event-${Date.now()}`;
  const fallbackBusinessId = `test-purchase-fallback-${Date.now()}`;
  const client = createClient();
  await client.connect();
  try {
    await client.query(`
      INSERT INTO approval_expense_purchase (
        business_id, process_instance_id, applicant_department, execution_region,
        detail_summary_amount, base_currency_amount, approval_status, approval_completed_at, raw_data
      ) VALUES
        ($1, $2, 'Test Department', 'China', 100, 100, 'COMPLETED', '2026-08-06T01:00:00.000Z',
          '{"status":"COMPLETED","result":"agree","title":"Purchase event test"}'::jsonb),
        ($3, $4, 'Test Department', 'China', 100, 100, 'COMPLETED', '2026-08-07T01:00:00.000Z',
          '{"status":"COMPLETED","result":"agree","title":"Purchase fallback test"}'::jsonb)
    `, [eventBusinessId, `pid-${eventBusinessId}`, fallbackBusinessId, `pid-${fallbackBusinessId}`]);
    await client.query(`
      INSERT INTO approval_expense_payment_events (
        business_id, process_instance_id, expense_kind, paid_at, amount, base_currency_amount,
        currency, source_type, rule_version, source_user_id, source_hash, evidence_text, status
      ) VALUES ($1, $2, 'purchase', '2026-08-05T01:00:00.000Z', 45, 45,
        'CNY', 'comment_explicit_amount', 'authorized-comment-v1', '02183637680221426194', $3, 'paid 45', 'confirmed')
    `, [eventBusinessId, `pid-${eventBusinessId}`, 'e'.repeat(64)]);

    const details = await fetchApprovalExpenseDetails({ startDate: '2026-08', endDate: '2026-08' });
    const matching = details.filter((item) => [eventBusinessId, fallbackBusinessId].includes(item.business_id));
    assert.equal(matching.length, 2);
    assert.equal(matching.reduce((total, item) => total + Number(item.base_currency_amount), 0), 145);
    assert.deepEqual(matching.map((item) => item.accounting_source).sort(), [
      'completed_approval_fallback',
      'payment_event',
    ]);
  } finally {
    await client.query('DELETE FROM approval_expense_payment_events WHERE business_id IN ($1, $2)', [eventBusinessId, fallbackBusinessId]);
    await client.query('DELETE FROM approval_expense_purchase WHERE business_id IN ($1, $2)', [eventBusinessId, fallbackBusinessId]);
    await client.end();
  }
});

test('a completed operation with department splits remains counted by its split details', { skip: !canRun }, async () => {
  const businessId = `test-completed-split-${Date.now()}`;
  const client = createClient();
  await client.connect();
  try {
    await client.query(`
      INSERT INTO approval_expense_operation (
        business_id, process_instance_id, applicant_department, execution_region,
        amount, base_currency_amount, approval_status, approval_completed_at, raw_data
      ) VALUES ($1, $2, 'Test Department', 'China', 100, 100, 'COMPLETED', '2026-08-06T01:00:00.000Z',
        '{"status":"COMPLETED","result":"agree","title":"Completed department split test"}'::jsonb)
    `, [businessId, `pid-${businessId}`]);
    await client.query(`
      INSERT INTO approval_expense_dept_split (business_id, split_type, department, amount)
      VALUES ($1, 'salary', 'Test Department', 100)
    `, [businessId]);

    const details = await fetchApprovalExpenseDetails({ startDate: '2026-08', endDate: '2026-08' });
    const matching = details.filter((item) => item.business_id === businessId);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].accounting_source, 'completed_department_split');
    assert.equal(Number(matching[0].base_currency_amount), 100);
  } finally {
    await client.query('DELETE FROM approval_expense_dept_split WHERE business_id = $1', [businessId]);
    await client.query('DELETE FROM approval_expense_operation WHERE business_id = $1', [businessId]);
    await client.end();
  }
});

test('an event from an unauthorized user is ignored and allows the completion fallback', { skip: !canRun }, async () => {
  const businessId = `test-unauthorized-event-${Date.now()}`;
  const client = createClient();
  await client.connect();
  try {
    await client.query(`
      INSERT INTO approval_expense_operation (
        business_id, process_instance_id, applicant_department, execution_region,
        amount, base_currency_amount, approval_status, approval_completed_at, raw_data
      ) VALUES ($1, $2, 'Test Department', 'China', 100, 100, 'COMPLETED', '2026-08-06T01:00:00.000Z',
        '{"status":"COMPLETED","result":"agree","title":"Unauthorized event test"}'::jsonb)
    `, [businessId, `pid-${businessId}`]);
    await client.query(`
      INSERT INTO approval_expense_payment_events (
        business_id, process_instance_id, expense_kind, paid_at, amount, base_currency_amount,
        currency, source_type, rule_version, source_user_id, source_hash, evidence_text, status
      ) VALUES ($1, $2, 'operation', '2026-08-05T01:00:00.000Z', 30, 30,
        'CNY', 'comment_explicit_amount', 'authorized-comment-v1', 'not-authorized', $3, 'paid 30', 'confirmed')
    `, [businessId, `pid-${businessId}`, 'f'.repeat(64)]);

    const details = await fetchApprovalExpenseDetails({ startDate: '2026-08', endDate: '2026-08' });
    const matching = details.filter((item) => item.business_id === businessId);
    assert.equal(matching.length, 1);
    assert.equal(matching[0].accounting_source, 'completed_approval_fallback');
    assert.equal(Number(matching[0].base_currency_amount), 100);
  } finally {
    await client.query('DELETE FROM approval_expense_payment_events WHERE business_id = $1', [businessId]);
    await client.query('DELETE FROM approval_expense_operation WHERE business_id = $1', [businessId]);
    await client.end();
  }
});
