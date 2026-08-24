import express from 'express';
import axios from 'axios';
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
  isBudgetRequest,
} from '../services/parser.js';
import { getDepartmentSnapshot, resolveServiceEntityDepartment } from '../services/department-tree.js';
import { query, pool } from '../db/index.js';
import { assertValidTable } from '../utils/db.js';

// getStatus 需要直接 import 用于状态对比
function getStatusFromData(detail) {
  const statusStr = String(detail.status || '').toUpperCase();
  const resultStr = String(detail.result || detail.flowResult || '').toLowerCase();
  const bizActionStr = String(detail.bizAction || detail.biz_action || '').toUpperCase();
  const taskResults = Array.isArray(detail.tasks)
    ? detail.tasks.map((task) => String(task?.result || '').toLowerCase())
    : [];
  if (
    resultStr === 'refuse' ||
    resultStr === 'reject' ||
    taskResults.some((result) => result === 'refuse' || result === 'reject')
  ) {
    return '已驳回';
  }
  if (statusStr === 'COMPLETED' && resultStr === 'agree') return '已通过';
  if (
    statusStr === 'TERMINATED' ||
    statusStr === 'CANCELLED' ||
    statusStr === 'CANCELED' ||
    ['REVOKE', 'DELETE', 'TERMINATE', 'CANCEL', 'CANCELED', 'CANCELLED'].includes(bizActionStr)
  ) {
    return '已撤销';
  }
  return '审批中';
}

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';
const DEFAULT_STATUS_REFRESH_LIMIT = Number(process.env.MANUAL_STATUS_REFRESH_LIMIT || 500);
const EXPENSE_SYNC_URL = process.env.EXPENSE_SYNC_URL || process.env.DINGTALK_EXPENSE_SYNC_URL || '';
const EXPENSE_SYNC_TIMEOUT_MS = Number(process.env.EXPENSE_SYNC_TIMEOUT_MS || 180000);

export function applyBudgetDepartmentSnapshot(budget, snapshot) {
  return snapshot ? { ...budget, ...snapshot } : budget;
}

export function buildBudgetDepartmentValues(budget) {
  return [
    budget.dept_id,
    budget.dept_source,
    budget.dept_path_ids ? JSON.stringify(budget.dept_path_ids) : null,
    budget.dept_path_names ? JSON.stringify(budget.dept_path_names) : null,
  ];
}

export function buildBudgetInsertValues(budget, budgetType) {
  const values = [
    budget.form_no,
    budget.process_instance_id,
    budget.dept_name,
    ...buildBudgetDepartmentValues(budget),
    budget.budget_type,
    budget.declaration_month,
    budget.budget_month,
    budget.application_date,
    budget.execution_region,
  ];

  if (budgetType === 'production') {
    return [
      ...values,
      budget.monthly_budget_amount,
      budget.total_amount,
      budget.creator_name,
      budget.creator_userid,
      budget.create_time,
      budget.status,
      budget.remark,
      budget.tenant_id,
    ];
  }

  return [
    ...values,
    budget.creator_name,
    budget.creator_userid,
    budget.create_time,
    budget.status,
    budget.budget_amount,
    budget.total_amount,
    budget.remark,
    budget.tenant_id,
  ];
}

export function buildBudgetUpdateValues(processInstanceId, budget, formNo, budgetType = 'production') {
  const values = [
    processInstanceId,
    budget.dept_name,
    ...buildBudgetDepartmentValues(budget),
    budget.budget_type,
    budget.declaration_month,
    budget.budget_month,
    budget.application_date,
    budget.execution_region,
  ];

  if (budgetType === 'production') {
    return [
      ...values,
      budget.monthly_budget_amount,
      budget.total_amount,
      budget.status,
      budget.remark,
      formNo,
    ];
  }

  return [
    ...values,
    budget.status,
    budget.budget_amount,
    budget.total_amount,
    budget.remark,
    formNo,
  ];
}

export async function enrichBudgetDepartmentSnapshot(
  budget,
  departmentResolver = resolveServiceEntityDepartment,
) {
  if (budget.service_entity_expected) {
    const resolved = await departmentResolver({
      serviceEntity: budget.service_entity,
      serviceEntityCode: budget.service_entity_code,
      correspondingDepartment: budget.corresponding_department,
    });
    if (resolved.status !== 'resolved') {
      return {
        ...budget,
        dept_id: null,
        dept_name: null,
        dept_source: 'service_entity_unresolved',
        dept_path_ids: null,
        dept_path_names: null,
      };
    }
    return {
      ...budget,
      dept_id: resolved.departmentId,
      dept_name: resolved.department,
      dept_source: 'service_entity_exact',
      dept_path_ids: resolved.departmentPathIds || null,
      dept_path_names: resolved.departmentPathNames || null,
    };
  }
  if (!budget.dept_id) return budget;
  return applyBudgetDepartmentSnapshot(
    budget,
    await getDepartmentSnapshot(budget.dept_id)
  );
}

function getApprovalState(detail) {
  const statusStr = String(detail.status || '').toUpperCase();
  const resultStr = String(detail.result || detail.flowResult || '').toLowerCase();
  const bizActionStr = String(detail.bizAction || detail.biz_action || '').toUpperCase();
  const taskResults = Array.isArray(detail.tasks)
    ? detail.tasks.map((task) => String(task?.result || '').toLowerCase())
    : [];
  const hasFinishTime = Boolean(detail.finishTime || detail.finish_time);
  const isCancelled =
    statusStr === 'CANCELLED' ||
    statusStr === 'CANCELED' ||
    statusStr.includes('CANCEL') ||
    ['REVOKE', 'DELETE', 'TERMINATE', 'CANCEL', 'CANCELED', 'CANCELLED'].includes(bizActionStr);
  const isRefused =
    resultStr === 'refuse' ||
    resultStr === 'reject' ||
    taskResults.some((result) => result === 'refuse' || result === 'reject');
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

function monthFromTimestamp(value) {
  if (!value) return null;
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthFilter(alias, params, paramIndex, startTime, endTime) {
  const startMonth = monthFromTimestamp(startTime);
  const endMonth = monthFromTimestamp(endTime);
  const monthExpr = `COALESCE(NULLIF(${alias}.budget_month, ''), NULLIF(${alias}.declaration_month, ''))`;
  let sql = '';

  if (startMonth) {
    sql += ` AND ${monthExpr} >= $${paramIndex}`;
    params.push(startMonth);
    paramIndex++;
  }

  if (endMonth) {
    sql += ` AND ${monthExpr} <= $${paramIndex}`;
    params.push(endMonth);
    paramIndex++;
  }

  return { sql, paramIndex };
}

async function updateExistingBudgetStatus(tableName, formNo, detail) {
  const existing = await query(
    `SELECT id, status FROM ${tableName} WHERE form_no = $1 LIMIT 1`,
    [formNo]
  );

  if (existing.rows.length === 0) {
    return { found: false, updated: false, localStatus: null, dingtalkStatus: getStatusFromData(detail) };
  }

  const localStatus = existing.rows[0].status;
  const dingtalkStatus = detail._parsedStatus || getStatusFromData(detail);
  if (localStatus !== dingtalkStatus) {
    await query(`UPDATE ${tableName} SET status = $1 WHERE form_no = $2`, [dingtalkStatus, formNo]);
    console.log(`[SYNC] Status updated: table=${tableName}, formNo=${formNo}, ${localStatus} -> ${dingtalkStatus}`);
    detail._parsedStatus = dingtalkStatus;
    return { found: true, updated: true, localStatus, dingtalkStatus };
  }

  return { found: true, updated: false, localStatus, dingtalkStatus };
}

export async function refreshExistingBudgetStatuses(options = {}) {
  const {
    startTime,
    endTime,
    limit = DEFAULT_STATUS_REFRESH_LIMIT,
    pendingOnly = false,
  } = options;
  const params = [];
  let paramIndex = 1;
  const productionFilter = buildMonthFilter('p', params, paramIndex, startTime, endTime);
  paramIndex = productionFilter.paramIndex;
  const nonProductionFilter = buildMonthFilter('n', params, paramIndex, startTime, endTime);
  paramIndex = nonProductionFilter.paramIndex;
  params.push(Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : DEFAULT_STATUS_REFRESH_LIMIT);

  const result = await query(`
    SELECT *
    FROM (
      SELECT 'production' AS budget_kind, p.form_no, p.process_instance_id, p.status,
             COALESCE(NULLIF(p.budget_month, ''), NULLIF(p.declaration_month, '')) AS budget_month_key
      FROM production_budget p
      WHERE p.process_instance_id IS NOT NULL
        AND TRIM(p.process_instance_id) <> ''
        ${pendingOnly ? "AND p.status = '审批中'" : ''}
        ${productionFilter.sql}
      UNION ALL
      SELECT 'non_production' AS budget_kind, n.form_no, n.process_instance_id, n.status,
             COALESCE(NULLIF(n.budget_month, ''), NULLIF(n.declaration_month, '')) AS budget_month_key
      FROM non_production_budget n
      WHERE n.process_instance_id IS NOT NULL
        AND TRIM(n.process_instance_id) <> ''
        ${pendingOnly ? "AND n.status = '审批中'" : ''}
        ${nonProductionFilter.sql}
    ) rows
    ORDER BY budget_month_key DESC NULLS LAST, form_no DESC
    LIMIT $${paramIndex}
  `, params);

  const summary = {
    checked: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    limit: params[params.length - 1],
    failures: [],
  };

  for (const row of result.rows) {
    summary.checked++;
    const tableName = assertValidTable(
      row.budget_kind === 'production' ? 'production_budget' : 'non_production_budget'
    );

    try {
      const detail = await getProcessInstanceDetail(row.process_instance_id);
      if (!detail) {
        summary.failed++;
        summary.failures.push({ formNo: row.form_no, processInstanceId: row.process_instance_id, message: 'No DingTalk detail returned' });
        continue;
      }

      const statusResult = await updateExistingBudgetStatus(tableName, row.form_no, detail);
      if (statusResult.updated) {
        summary.updated++;
      } else {
        summary.unchanged++;
      }
    } catch (error) {
      summary.failed++;
      summary.failures.push({
        formNo: row.form_no,
        processInstanceId: row.process_instance_id,
        message: error.message,
      });
      console.error(`[ERROR] Failed to refresh status for ${row.form_no}:`, error.message);
    }
  }

  return summary;
}

async function triggerExpenseManualSync(startTime, endTime) {
  if (!EXPENSE_SYNC_URL) {
    return {
      success: true,
      skipped: true,
      message: '未配置 EXPENSE_SYNC_URL，已跳过支出同步',
    };
  }

  const baseUrl = EXPENSE_SYNC_URL.replace(/\/+$/, '');
  try {
    const response = await axios.post(
      `${baseUrl}/api/sync/manual`,
      { startTime, endTime },
      { timeout: EXPENSE_SYNC_TIMEOUT_MS }
    );
    return {
      success: true,
      skipped: false,
      data: response.data,
      message: response.data?.message || '支出同步已触发',
    };
  } catch (error) {
    const message = error.response?.data?.message || error.response?.data?.error || error.message;
    console.error('[ERROR] Expense manual sync failed:', message);
    return {
      success: false,
      skipped: false,
      message,
    };
  }
}

async function triggerExpenseSplitSync(startTime, endTime) {
  if (!EXPENSE_SYNC_URL) {
    const error = new Error('未配置 EXPENSE_SYNC_URL，无法同步支出拆分数据');
    error.statusCode = 400;
    throw error;
  }

  const baseUrl = EXPENSE_SYNC_URL.replace(/\/+$/, '');
  const response = await axios.post(
    `${baseUrl}/api/sync/operation-splits`,
    {
      startTime,
      endTime,
      splitTypes: ['salary', 'social_insurance', 'office_space'],
    },
    { timeout: EXPENSE_SYNC_TIMEOUT_MS }
  );
  return response.data;
}

function buildManualSyncMessage(budgetResult, statusRefresh, expenseSync) {
  const parts = [
    `预算同步：新增 ${budgetResult.added || 0}，更新 ${budgetResult.updated || 0}，已存在 ${budgetResult.existing || 0}，跳过 ${budgetResult.skipped || 0}`,
  ];

  if (statusRefresh) {
    parts.push(`状态校准：检查 ${statusRefresh.checked || 0}，更新 ${statusRefresh.updated || 0}`);
  }

  if (expenseSync) {
    if (expenseSync.skipped) {
      parts.push('支出同步：未配置，已跳过');
    } else if (expenseSync.success) {
      parts.push('支出同步：已触发');
    } else {
      parts.push(`支出同步失败：${expenseSync.message || '未知错误'}`);
    }
  }

  return parts.join('；');
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

  const formNo = detail.businessId;

  const budgetType = getBudgetType(detail);
  const tableName = assertValidTable(budgetType === 'production' ? 'production_budget' : 'non_production_budget');
  const approvalState = getApprovalState(detail);

  const existingStatus = await updateExistingBudgetStatus(tableName, formNo, detail);
  if (existingStatus.updated) {
    return {
      success: true,
      synced: 0,
      added: 0,
      updated: 1,
      existing: 0,
      pending: approvalState.retryable ? 1 : 0,
      skipped: 0,
      formNo,
      processInstanceId,
      budgetType,
      message: `Status updated: ${existingStatus.localStatus} -> ${existingStatus.dingtalkStatus}`,
    };
  }

  if (!approvalState.approved) {
    // 未审批的也入库（显示为审批中/已撤销等），但标注为 pending
    const formNo = detail.businessId;
    const budgetType = getBudgetType(detail);
    const tableName = assertValidTable(budgetType === 'production' ? 'production_budget' : 'non_production_budget');

    if (!isBudgetRequest(detail)) {
      console.log(`[SYNC] Skip expense pending: ${formNo}`);
      return {
        success: true, synced: 0, added: 0, updated: 0, existing: 0,
        pending: approvalState.retryable ? 1 : 0, skipped: approvalState.retryable ? 0 : 1,
        reason: `Expense pending skipped: ${formNo}`,
      };
    }

    const existCheck = await query(`SELECT id, status FROM ${tableName} WHERE form_no = $1 LIMIT 1`, [formNo]);
    const dingtalkStatus = getStatusFromData(detail);

    if (existCheck.rows.length > 0) {
      if (existCheck.rows[0].status !== dingtalkStatus) {
        await query(`UPDATE ${tableName} SET status = $1 WHERE form_no = $2`, [dingtalkStatus, formNo]);
        console.log(`[SYNC] Pending status updated: ${formNo}, ${existCheck.rows[0].status} -> ${dingtalkStatus}`);
      }
      return {
        success: true, synced: 0, added: 0, updated: 1, existing: 0,
        pending: approvalState.retryable ? 1 : 0, skipped: 0, processInstanceId, formNo,
        message: `Pending record updated: status=${dingtalkStatus}`,
      };
    }

    await insertRecord(processInstanceId, detail, budgetType);
    console.log(`[SYNC] Pending inserted: ${formNo}, status=${dingtalkStatus}`);
    return {
      success: true, synced: 1, added: 1, updated: 0, existing: 0,
      pending: approvalState.retryable ? 1 : 0, skipped: 0, processInstanceId, formNo,
      message: `Pending record inserted: status=${dingtalkStatus}`,
    };
  }

  // 运营支出：如果已误入预算表则更新状态，否则跳过
  if (!isBudgetRequest(detail)) {
    if (existingStatus.found) {
      return { success: true, synced: 0, added: 0, updated: 0, existing: 1, pending: 0, skipped: 0,
        formNo, processInstanceId, budgetType, message: `Expense record already exists with status ${existingStatus.localStatus}` };
    }
    console.log(`[SYNC] Skip expense instance: ${formNo}`);
    return { success: true, synced: 0, added: 0, updated: 0, existing: 0, pending: 0, skipped: 1,
      reason: `Expense instance skipped (not a budget request): ${formNo}` };
  }

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
        synced: 0, added: 0, updated: 0, existing: 1, pending: 0, skipped: 0,
        formNo, processInstanceId, budgetType,
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
      const budget = await enrichBudgetDepartmentSnapshot(parseProductionBudget(detail));
      await client.query(
        `INSERT INTO production_budget
        (form_no, process_instance_id, dept_name, dept_id, dept_source, dept_path_ids, dept_path_names,
         budget_type, declaration_month,
         budget_month, application_date, execution_region, monthly_budget_amount, total_amount,
         creator_name, creator_userid, create_time, status, remark, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        buildBudgetInsertValues(budget, 'production')
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
      const budget = await enrichBudgetDepartmentSnapshot(parseNonProductionBudget(detail));
      await client.query(
        `INSERT INTO non_production_budget
        (form_no, process_instance_id, dept_name, dept_id, dept_source, dept_path_ids, dept_path_names,
         budget_type, declaration_month,
         budget_month, application_date, execution_region, creator_name, creator_userid,
         create_time, status, budget_amount, total_amount, remark, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        buildBudgetInsertValues(budget, 'non_production')
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
      const budget = await enrichBudgetDepartmentSnapshot(parseProductionBudget(detail));
      await client.query(
        `UPDATE production_budget SET
         process_instance_id = $1, dept_name = $2, dept_id = $3, dept_source = $4,
         dept_path_ids = $5, dept_path_names = $6, budget_type = $7, declaration_month = $8,
         budget_month = $9, application_date = $10, execution_region = $11,
         monthly_budget_amount = $12, total_amount = $13, status = $14, remark = $15
         WHERE form_no = $16`,
        buildBudgetUpdateValues(processInstanceId, budget, formNo, 'production')
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
      const budget = await enrichBudgetDepartmentSnapshot(parseNonProductionBudget(detail));
      await client.query(
        `UPDATE non_production_budget SET
         process_instance_id = $1, dept_name = $2, dept_id = $3, dept_source = $4,
         dept_path_ids = $5, dept_path_names = $6, budget_type = $7, declaration_month = $8,
         budget_month = $9, application_date = $10, execution_region = $11,
         status = $12, budget_amount = $13, total_amount = $14, remark = $15
         WHERE form_no = $16`,
        buildBudgetUpdateValues(processInstanceId, budget, formNo, 'non_production')
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
    const {
      startTime,
      endTime,
      refreshExisting = true,
      syncExpenses = true,
    } = req.body;
    const result = await syncDingtalkData(startTime, endTime);
    const statusRefresh = refreshExisting
      ? await refreshExistingBudgetStatuses({ startTime, endTime })
      : null;
    const expenseSync = syncExpenses
      ? await triggerExpenseManualSync(startTime, endTime)
      : null;

    res.json({
      ...result,
      statusRefresh,
      expenseSync,
      message: buildManualSyncMessage(result, statusRefresh, expenseSync),
    });
  } catch (error) {
    console.error('[ERROR] Sync error:', error);
    res.status(500).json({ success: false, message: isProduction ? '同步失败' : error.message });
  }
});

router.post('/expense-splits', async (req, res) => {
  try {
    const { startTime, endTime } = req.body || {};
    if (startTime === undefined || endTime === undefined) {
      return res.status(400).json({
        success: false,
        message: 'startTime 和 endTime 必填',
      });
    }

    const result = await triggerExpenseSplitSync(startTime, endTime);
    res.json({
      success: true,
      data: result,
      message: result.message || '支出拆分同步完成',
    });
  } catch (error) {
    const status = error.statusCode || error.response?.status || 500;
    const message = error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      '支出拆分同步失败';
    console.error('[ERROR] Expense split sync error:', message);
    res.status(status).json({
      success: false,
      message: isProduction && status >= 500 ? '支出拆分同步失败' : message,
    });
  }
});

export default router;
