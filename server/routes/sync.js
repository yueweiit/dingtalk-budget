import express from 'express';
import { getProcessInstanceIds, getProcessInstanceDetail } from '../services/dingtalk.js';
import {
  parseProductionBudget,
  parseNonProductionBudget,
  parseMaterialItems,
  parseProductionItems,
  parseLaborItems,
  parseHrItems,
  parseOfficeItems,
  parseOperationItems,
  getBudgetType,
} from '../services/parser.js';
import { query, pool } from '../db/index.js';

const router = express.Router();

function getApprovalState(detail) {
  const statusStr = String(detail.status || '').toUpperCase();
  const resultStr = String(detail.result || '').toLowerCase();
  const hasFinishTime = Boolean(detail.finishTime || detail.finish_time);
  const isCancelled =
    statusStr === 'CANCELLED' ||
    statusStr === 'CANCELED' ||
    statusStr.includes('CANCEL');
  const isRefused = resultStr === 'refuse' || resultStr === 'reject';
  const isApproved =
    (statusStr === 'COMPLETED' && resultStr === 'agree') ||
    (statusStr === 'TERMINATED' && resultStr === 'agree' && hasFinishTime);

  if (isApproved && !isCancelled && !isRefused) {
    return { approved: true, retryable: false, reason: null };
  }

  return {
    approved: false,
    retryable: !isCancelled && !isRefused,
    reason: `status=${detail.status || ''}, result=${detail.result || ''}`,
  };
}

export async function syncDingtalkData(startTime, endTime, options = {}) {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const start = startTime || (now - thirtyDays);
  const end = endTime || now;

  console.log(`[SYNC] Starting sync: ${new Date(start).toISOString()} ~ ${new Date(end).toISOString()}`);

  const instanceIds = await getProcessInstanceIds(start, end);
  console.log(`[SYNC] Found ${instanceIds.length} process instances`);

  if (instanceIds.length === 0) {
    console.log('[SYNC] Completed: 0 synced, 0 added, 0 updated, 0 existing, 0 pending, 0 skipped');
    return {
      success: true,
      synced: 0,
      added: 0,
      updated: 0,
      existing: 0,
      pending: 0,
      skipped: 0,
      pendingInstances: [],
      terminalSkippedInstances: [],
      message: 'No DingTalk process instances found',
    };
  }

  let syncedCount = 0;
  let updatedCount = 0;
  let addedCount = 0;
  let skippedCount = 0;
  let existingCount = 0;
  let pendingCount = 0;
  const pendingInstances = [];
  const terminalSkippedInstances = [];

  for (const processInstanceId of instanceIds) {
    try {
      const result = await syncDingtalkInstance(processInstanceId, options);
      syncedCount += result.synced || 0;
      addedCount += result.added || 0;
      updatedCount += result.updated || 0;
      skippedCount += result.skipped || 0;
      existingCount += result.existing || 0;
      pendingCount += result.pending || 0;
      if (result.pending) {
        pendingInstances.push({
          processInstanceId,
          status: result.status,
          result: result.result,
          message: result.message,
        });
      } else if (result.skipped) {
        terminalSkippedInstances.push({
          processInstanceId,
          status: result.status,
          result: result.result,
          message: result.message,
        });
      }
    } catch (error) {
      console.error(`[ERROR] Failed to sync instance ${processInstanceId}:`, error.message, error.stack);
    }
  }

  console.log(`[SYNC] Completed: ${syncedCount} synced, ${addedCount} added, ${updatedCount} updated, ${existingCount} existing, ${pendingCount} pending, ${skippedCount} skipped`);

  return {
    success: true,
    synced: syncedCount,
    added: addedCount,
    updated: updatedCount,
    existing: existingCount,
    pending: pendingCount,
    skipped: skippedCount,
    pendingInstances,
    terminalSkippedInstances,
    message: `Sync completed: ${syncedCount} synced, ${addedCount} added, ${updatedCount} updated, ${existingCount} existing, ${pendingCount} pending, ${skippedCount} skipped`,
  };
}

export async function syncDingtalkInstance(processInstanceId, options = {}) {
  const { updateExisting = false } = options;
  const detail = await getProcessInstanceDetail(processInstanceId);
  if (!detail) {
    return { success: true, synced: 0, added: 0, updated: 0, existing: 0, pending: 1, skipped: 0, message: 'No DingTalk detail returned' };
  }

  const approvalState = getApprovalState(detail);
  if (!approvalState.approved) {
    const logLabel = approvalState.retryable ? 'Pending instance' : 'Skip instance';
    console.log(`[SYNC] ${logLabel}: ${processInstanceId}, ${approvalState.reason}`);
    return {
      success: true,
      synced: 0,
      added: 0,
      updated: 0,
      existing: 0,
      pending: approvalState.retryable ? 1 : 0,
      skipped: approvalState.retryable ? 0 : 1,
      processInstanceId,
      status: detail.status,
      result: detail.result,
      message: approvalState.retryable
        ? `Instance pending: ${approvalState.reason}`
        : `Instance skipped: ${approvalState.reason}`,
    };
  }

  const formNo = detail.businessId;
  const budgetType = getBudgetType(detail);
  const tableName = budgetType === 'production' ? 'production_budget' : 'non_production_budget';

  console.log(`[SYNC] Sync instance: processInstanceId=${processInstanceId}, formNo=${formNo}, budgetType=${budgetType}`);

  const existCheck = await query(
    `SELECT id, status FROM ${tableName} WHERE form_no = $1 LIMIT 1`,
    [formNo]
  );

  if (existCheck.rows.length > 0) {
    if (!updateExisting) {
      console.log(`[SYNC] Already exists, no update: formNo=${formNo}`);
      return {
        success: true,
        synced: 0,
        added: 0,
        updated: 0,
        existing: 1,
        pending: 0,
        skipped: 0,
        formNo,
        processInstanceId,
        budgetType,
        message: 'Budget record already exists',
      };
    }

    await updateRecord(processInstanceId, detail, budgetType);
    console.log(`[SYNC] Updated: formNo=${formNo}`);
    return {
      success: true,
      synced: 1,
      added: 0,
      updated: 1,
      existing: 0,
      pending: 0,
      skipped: 0,
      formNo,
      processInstanceId,
      budgetType,
      message: 'Updated existing budget record',
    };
  }

  await insertRecord(processInstanceId, detail, budgetType);
  console.log(`[SYNC] Inserted: formNo=${formNo}`);
  return {
    success: true,
    synced: 1,
    added: 1,
    updated: 0,
    existing: 0,
    pending: 0,
    skipped: 0,
    formNo,
    processInstanceId,
    budgetType,
    message: 'Inserted new budget record',
  };
}

async function insertProductionDetail(client, tableName, item) {
  await client.query(
    `INSERT INTO ${tableName}
    (form_no, detail_type, detail_category, detail_code, production_line, item_name,
     specification, product_name, process, post_name, work_type, unit, quantity,
     unit_price, overtime_hours, overtime_unit_price, estimated_overtime_amount,
     original_amount, currency, exchange_rate, rmb_amount, amount, calculation_basis, remark)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
    [
      item.form_no,
      item.detail_type,
      item.detail_category,
      item.detail_code,
      item.production_line,
      item.item_name,
      item.specification,
      item.product_name,
      item.process,
      item.post_name,
      item.work_type,
      item.unit,
      item.quantity,
      item.unit_price,
      item.overtime_hours,
      item.overtime_unit_price,
      item.estimated_overtime_amount,
      item.original_amount,
      item.currency,
      item.exchange_rate,
      item.rmb_amount,
      item.amount,
      item.calculation_basis,
      item.remark,
    ]
  );
}

async function insertNonProductionDetail(client, tableName, item) {
  await client.query(
    `INSERT INTO ${tableName}
    (form_no, detail_type, detail_item, budget_purpose_detail, operation_expense,
     budget_detail, headcount, original_amount, currency, exchange_rate, rmb_amount,
     amount, calculation_basis, remark)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      item.form_no,
      item.detail_type,
      item.detail_item,
      item.budget_purpose_detail,
      item.operation_expense,
      item.budget_detail,
      item.headcount,
      item.original_amount,
      item.currency,
      item.exchange_rate,
      item.rmb_amount,
      item.amount,
      item.calculation_basis,
      item.remark,
    ]
  );
}

async function insertRecord(processInstanceId, detail, budgetType) {
  const client = await pool.connect();
  const formNo = detail.businessId;

  try {
    await client.query('BEGIN');

    if (budgetType === 'production') {
      await client.query('DELETE FROM production_budget WHERE form_no = $1', [formNo]);
      await client.query('DELETE FROM budget_material WHERE form_no = $1', [formNo]);
      await client.query('DELETE FROM budget_production WHERE form_no = $1', [formNo]);
      await client.query('DELETE FROM budget_labor WHERE form_no = $1', [formNo]);
    } else {
      await client.query('DELETE FROM non_production_budget WHERE form_no = $1', [formNo]);
      await client.query('DELETE FROM budget_hr WHERE form_no = $1', [formNo]);
      await client.query('DELETE FROM budget_office WHERE form_no = $1', [formNo]);
      await client.query('DELETE FROM budget_operation WHERE form_no = $1', [formNo]);
    }

    if (budgetType === 'production') {
      const budget = parseProductionBudget(detail);
      await client.query(
        `INSERT INTO production_budget
        (form_no, process_instance_id, dept_name, budget_type, declaration_month,
         budget_month, application_date, execution_region, monthly_budget_amount, total_amount,
         creator_name, creator_userid, create_time, status, remark, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [budget.form_no, budget.process_instance_id, budget.dept_name, budget.budget_type,
         budget.declaration_month, budget.budget_month, budget.application_date, budget.execution_region,
         budget.monthly_budget_amount, budget.total_amount, budget.creator_name, budget.creator_userid,
         budget.create_time, budget.status, budget.remark, budget.tenant_id]
      );

      for (const item of parseMaterialItems(detail)) {
        await insertProductionDetail(client, 'budget_material', item);
      }
      for (const item of parseProductionItems(detail)) {
        await insertProductionDetail(client, 'budget_production', item);
      }
      for (const item of parseLaborItems(detail)) {
        await insertProductionDetail(client, 'budget_labor', item);
      }
    } else {
      const budget = parseNonProductionBudget(detail);
      await client.query(
        `INSERT INTO non_production_budget
        (form_no, process_instance_id, dept_name, budget_type, declaration_month,
         budget_month, application_date, execution_region, creator_name, creator_userid,
         create_time, status, budget_amount, total_amount, remark, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [budget.form_no, budget.process_instance_id, budget.dept_name, budget.budget_type,
         budget.declaration_month, budget.budget_month, budget.application_date, budget.execution_region,
         budget.creator_name, budget.creator_userid, budget.create_time, budget.status,
         budget.budget_amount, budget.total_amount, budget.remark, budget.tenant_id]
      );

      for (const item of parseHrItems(detail)) {
        await insertNonProductionDetail(client, 'budget_hr', item);
      }
      for (const item of parseOfficeItems(detail)) {
        await insertNonProductionDetail(client, 'budget_office', item);
      }
      for (const item of parseOperationItems(detail)) {
        await insertNonProductionDetail(client, 'budget_operation', item);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateRecord(processInstanceId, detail, budgetType) {
  const client = await pool.connect();
  const formNo = detail.businessId;

  try {
    await client.query('BEGIN');

    if (budgetType === 'production') {
      const budget = parseProductionBudget(detail);
      await client.query(
        `UPDATE production_budget SET
         process_instance_id = $1, dept_name = $2, budget_type = $3, declaration_month = $4,
         budget_month = $5, application_date = $6, execution_region = $7,
         monthly_budget_amount = $8, total_amount = $9, status = $10, remark = $11
         WHERE form_no = $12`,
        [processInstanceId, budget.dept_name, budget.budget_type, budget.declaration_month,
         budget.budget_month, budget.application_date, budget.execution_region,
         budget.monthly_budget_amount, budget.total_amount, budget.status, budget.remark, formNo]
      );

      await client.query('DELETE FROM budget_material WHERE form_no = $1', [formNo]);
      for (const item of parseMaterialItems(detail)) {
        await insertProductionDetail(client, 'budget_material', item);
      }

      await client.query('DELETE FROM budget_production WHERE form_no = $1', [formNo]);
      for (const item of parseProductionItems(detail)) {
        await insertProductionDetail(client, 'budget_production', item);
      }

      await client.query('DELETE FROM budget_labor WHERE form_no = $1', [formNo]);
      for (const item of parseLaborItems(detail)) {
        await insertProductionDetail(client, 'budget_labor', item);
      }
    } else {
      const budget = parseNonProductionBudget(detail);
      await client.query(
        `UPDATE non_production_budget SET
         process_instance_id = $1, dept_name = $2, budget_type = $3, declaration_month = $4,
         budget_month = $5, application_date = $6, execution_region = $7,
         status = $8, budget_amount = $9, total_amount = $10, remark = $11
         WHERE form_no = $12`,
        [processInstanceId, budget.dept_name, budget.budget_type, budget.declaration_month,
         budget.budget_month, budget.application_date, budget.execution_region,
         budget.status, budget.budget_amount, budget.total_amount, budget.remark, formNo]
      );

      await client.query('DELETE FROM budget_hr WHERE form_no = $1', [formNo]);
      await client.query('DELETE FROM budget_office WHERE form_no = $1', [formNo]);
      await client.query('DELETE FROM budget_operation WHERE form_no = $1', [formNo]);
      for (const item of parseHrItems(detail)) {
        await insertNonProductionDetail(client, 'budget_hr', item);
      }
      for (const item of parseOfficeItems(detail)) {
        await insertNonProductionDetail(client, 'budget_office', item);
      }
      for (const item of parseOperationItems(detail)) {
        await insertNonProductionDetail(client, 'budget_operation', item);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

router.post('/', async (req, res) => {
  try {
    const { startTime, endTime } = req.body;
    const result = await syncDingtalkData(startTime, endTime);
    res.json(result);
  } catch (error) {
    console.error('[ERROR] Sync error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
