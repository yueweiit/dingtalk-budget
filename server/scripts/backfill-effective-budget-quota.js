import { config } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getProcessInstanceDetail,
  getProcessInstanceIds,
} from '../services/dingtalk.js';
import {
  getBudgetType,
  isBudgetRequest,
  parseHrItems,
  parseLaborItems,
  parseMaterialItems,
  parseNonProductionBudget,
  parseOfficeItems,
  parseOperationItems,
  parseProductionBudget,
  parseProductionItems,
} from '../services/parser.js';
import { enrichBudgetDepartmentSnapshot } from '../routes/sync.js';
import { pool } from '../db/index.js';
import { synchronizeEffectiveBudgetQuota } from '../services/effective-budget-quota.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

function argumentValue(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((value) => value.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : '';
}

function timestampArgument(name) {
  const raw = argumentValue(name);
  if (!raw) throw new Error(`缺少 --${name}=<ISO 日期时间>`);
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) throw new Error(`--${name} 必须是 ISO 日期时间`);
  return timestamp;
}

function isApproved(detail) {
  const status = String(detail?.status || '').toUpperCase();
  const result = String(detail?.result || detail?.flowResult || detail?.flow_result || '').toLowerCase();
  const action = String(detail?.bizAction || detail?.biz_action || '').toUpperCase();
  const taskResults = Array.isArray(detail?.tasks)
    ? detail.tasks.map((task) => String(task?.result || '').toLowerCase())
    : [];
  const cancelled = status === 'CANCELLED'
    || status === 'CANCELED'
    || status.includes('CANCEL')
    || ['REVOKE', 'DELETE', 'TERMINATE', 'CANCEL', 'CANCELED', 'CANCELLED'].includes(action);
  const refused = result === 'refuse'
    || result === 'reject'
    || taskResults.some((value) => value === 'refuse' || value === 'reject');

  return !cancelled && !refused && (
    (status === 'COMPLETED' && result === 'agree')
    || (status === 'TERMINATED' && result === 'agree' && Boolean(detail?.finishTime || detail?.finish_time))
  );
}

function detailGroups(detail, budgetType) {
  if (budgetType === 'production') {
    return [
      { subjectType: 'material', sourceTable: 'budget_material', items: parseMaterialItems(detail) },
      { subjectType: 'production_expense', sourceTable: 'budget_production', items: parseProductionItems(detail) },
      { subjectType: 'labor', sourceTable: 'budget_labor', items: parseLaborItems(detail) },
    ];
  }

  return [
    { subjectType: 'hr', sourceTable: 'budget_hr', items: parseHrItems(detail) },
    { subjectType: 'office', sourceTable: 'budget_office', items: parseOfficeItems(detail) },
    { subjectType: 'operation', sourceTable: 'budget_operation', items: parseOperationItems(detail) },
  ];
}

async function saveQuota(client, detail, budgetType) {
  const parsedBudget = budgetType === 'production'
    ? parseProductionBudget(detail)
    : parseNonProductionBudget(detail);
  const budget = await enrichBudgetDepartmentSnapshot(parsedBudget);

  await client.query('BEGIN');
  try {
    const result = await synchronizeEffectiveBudgetQuota(client, {
      detail,
      budget,
      budgetType,
      detailGroups: detailGroups(detail, budgetType),
      approved: true,
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

const startTime = timestampArgument('start');
const endTime = timestampArgument('end');
if (startTime > endTime) throw new Error('--start 不能晚于 --end');

const instanceIds = await getProcessInstanceIds(startTime, endTime);
const client = await pool.connect();
const summary = {
  scanned: instanceIds.length,
  budgetForms: 0,
  approved: 0,
  quotaSynced: 0,
  missingSourceKey: 0,
  skipped: 0,
  failed: 0,
  detailAmountMismatches: 0,
};

try {
  for (const processInstanceId of instanceIds) {
    try {
      const detail = await getProcessInstanceDetail(processInstanceId);
      if (!detail || !isBudgetRequest(detail)) {
        summary.skipped++;
        continue;
      }

      summary.budgetForms++;
      if (!isApproved(detail)) {
        summary.skipped++;
        continue;
      }

      summary.approved++;
      const result = await saveQuota(client, detail, getBudgetType(detail));
      if (!result.synchronized) {
        summary.missingSourceKey++;
        continue;
      }

      summary.quotaSynced++;
      if (result.detailAmountMismatch) summary.detailAmountMismatches++;
    } catch (error) {
      summary.failed++;
      console.error(`[BACKFILL] Failed process instance ${processInstanceId}: ${error.message}`);
    }
  }
} finally {
  client.release();
  await pool.end();
}

console.log(JSON.stringify(summary));
if (summary.failed > 0) process.exitCode = 1;
