import express from 'express';
import pg from 'pg';
import { query } from '../db/index.js';
import { getProcessInstanceDetail } from '../services/dingtalk.js';
import {
  buildDepartmentPresentation,
  departmentIdentityKey,
} from '../services/department-identity.js';
import {
  applyJulyDepartmentReportingOverlay,
  usesNewDepartmentIdentity,
} from '../services/july-department-reporting-overlay.js';
import {
  rollupYWTechBudgetRows,
  rollupYWTechApprovedExpenseSummaries,
  sharedBudgetDepartmentRecords,
  ywTechSharedBudgetRollupDepartment,
} from '../services/yw-tech-shared-budget.js';
import { assertValidTable } from '../utils/db.js';

const router = express.Router();
const { Client } = pg;
const isProduction = process.env.NODE_ENV === 'production';
const APPROVAL_DB_DATABASE = process.env.APPROVAL_DB_DATABASE ||
  process.env.DINGTALK_APPROVAL_DATABASE ||
  'dingtalk_approval';
const VERIFY_EXPENSE_STATUS_WITH_DINGTALK = process.env.VERIFY_EXPENSE_STATUS_WITH_DINGTALK === '1';
const EXPENSE_STATUS_VERIFY_LIMIT = Number(process.env.EXPENSE_STATUS_VERIFY_LIMIT || 300);
const EXPENSE_STATUS_CACHE_TTL_MS = Number(process.env.EXPENSE_STATUS_CACHE_TTL_MS || 10 * 60 * 1000);
const EXPENSE_STATUS_VERIFY_CONCURRENCY = Number(process.env.EXPENSE_STATUS_VERIFY_CONCURRENCY || 8);
const APPROVED_EXPENSE_CACHE_TTL_MS = Number(process.env.APPROVED_EXPENSE_CACHE_TTL_MS || 60 * 1000);
const EXPENSE_SPLIT_CACHE_TTL_MS = Number(process.env.EXPENSE_SPLIT_CACHE_TTL_MS || 60 * 1000);

const columnCache = new Map();
const expenseStatusCache = new Map();
const approvedExpenseSummaryCache = new Map();
const expenseSplitCache = new Map();

async function getExistingColumns(tableName) {
  if (columnCache.has(tableName)) {
    return columnCache.get(tableName);
  }

  const result = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  columnCache.set(tableName, columns);
  return columns;
}

async function buildSelectList(tableName, columns) {
  const existingColumns = await getExistingColumns(tableName);
  return columns.map(({ name, type = 'text' }) => (
    existingColumns.has(name) ? name : `NULL::${type} AS ${name}`
  )).join(', ');
}

function formatMonth(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}/.test(text)) return text.substring(0, 7);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const budgetMonthExpr = "COALESCE(NULLIF(budget_month, ''), NULLIF(declaration_month, ''))";

function budgetMonthExprFor(alias) {
  return `COALESCE(NULLIF(${alias}.budget_month, ''), NULLIF(${alias}.declaration_month, ''))`;
}

function deptPartitionExprFor(alias) {
  const normalized = `LOWER(REGEXP_REPLACE(COALESCE(${alias}.dept_name, ''), '[\\s()（）\\-_/\\\\,.;:，。；：&]+', '', 'g'))`;
  const legacyName = `CASE
    WHEN ${normalized} LIKE '%悦为智能%'
      OR ${normalized} LIKE '%ywtechai%'
      OR (${normalized} LIKE '%it%sc%' AND ${normalized} LIKE '%信息技术%')
      OR (${normalized} LIKE '%it%sc%' AND ${normalized} LIKE '%tecnolog%' AND ${normalized} LIKE '%control%')
    THEN 'dept_yw_tech_ai'
    ELSE ${normalized}
  END`;
  return `CASE
    WHEN NULLIF(${alias}.dept_id, '') IS NOT NULL THEN 'id:' || ${alias}.dept_id
    ELSE 'legacy:' || ${alias}.form_no || ':' || (${legacyName})
  END`;
}

function appendBudgetMonthRange(whereClause, params, paramIndex, startDate, endDate, monthExpr = budgetMonthExpr) {
  const startMonth = formatMonth(startDate);
  const endMonth = formatMonth(endDate);

  if (startMonth) {
    whereClause += ` AND ${monthExpr} >= $${paramIndex}`;
    params.push(startMonth);
    paramIndex++;
  }

  if (endMonth) {
    whereClause += ` AND ${monthExpr} <= $${paramIndex}`;
    params.push(endMonth);
    paramIndex++;
  }

  return { whereClause, paramIndex };
}

function normalizeDept(value) {
  return String(value || '').trim();
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '';
}

/** 部门名归一化用于跨系统匹配：去掉标点空格、统一别名 */
function compactDept(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s()（）\-_/\\,.;:，。；：&]+/g, '');

  // 同一 PD&PM 部门在中国支出来源中会额外出现 CN 标识。
  if (key.startsWith('pdpm')) {
    return 'dept_pdpm';
  }

  if (
    key.includes('悦为智能') ||
    key.includes('ywtechai') ||
    (key.includes('it') && key.includes('sc') && key.includes('信息技术')) ||
    (key.includes('it') && key.includes('sc') && key.includes('tecnolog') && key.includes('control'))
  ) {
    return 'dept_yw_tech_ai';
  }

  return key;
}

function numberValue(value) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function budgetMonthOf(row) {
  return String(row?.budget_month || row?.declaration_month || '').trim();
}

function sumItemsAmount(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => sum + numberValue(item?.amount), 0);
}

function budgetBreakdownOf(row) {
  const hr = numberValue(firstNonEmpty(row?.hr_budget, row?.hrBudget, sumItemsAmount(row?.hr_items || row?.hrItems)));
  const office = numberValue(firstNonEmpty(row?.office_budget, row?.officeBudget, sumItemsAmount(row?.office_items || row?.officeItems)));
  const management = numberValue(firstNonEmpty(row?.operation_budget, row?.operationBudget, sumItemsAmount(row?.operation_items || row?.operationItems)));
  const detailTotal = hr + office + management;
  const total = detailTotal || numberValue(firstNonEmpty(row?.total_amount, row?.budget_amount, row?.monthly_budget_amount));

  return {
    management: Number(management.toFixed(2)),
    operation: Number(management.toFixed(2)),
    hr: Number(hr.toFixed(2)),
    salary: Number(hr.toFixed(2)),
    office: Number(office.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

function normalizeRegion(value) {
  const text = String(value || '').trim();
  const lower = text.toLowerCase();
  if (text.includes('中国') || lower.includes('china') || /\bcn\b/i.test(text)) return 'CN';
  if (text.includes('墨西哥') || lower.includes('méxico') || lower.includes('mexico') || /\bmx\b/i.test(text)) return 'MX';
  return '';
}

function isChinaExecutionRegion(value) {
  return normalizeRegion(value) === 'CN';
}

function reportingDepartmentKey(department, month) {
  const record = typeof department === 'string'
    ? { dept_name: department }
    : (department || {});
  if (!usesNewDepartmentIdentity(formatMonth(month))) {
    return compactDept(record.dept_name || record.department || record.applicant_department);
  }
  const reporting = applyJulyDepartmentReportingOverlay(record, month);
  const departmentId = normalizeDept(reporting.reporting_dept_id);
  return departmentId ? `id:${departmentId}` : compactDept(reporting.reporting_dept_name);
}

function budgetedDepartmentMonthKey(department, month) {
  const departmentKey = reportingDepartmentKey(department, month);
  const budgetMonth = formatMonth(month);
  return departmentKey && budgetMonth ? `${departmentKey}__${budgetMonth}` : '';
}

function budgetAmountOf(row) {
  return Math.max(
    numberValue(row?.total_amount),
    numberValue(row?.budget_amount),
    numberValue(row?.monthly_budget_amount)
  );
}

function buildBudgetedDepartmentMonthSet(rows) {
  const result = new Set();
  for (const row of rows || []) {
    if (budgetAmountOf(row) <= 0) continue;
    for (const departmentRecord of sharedBudgetDepartmentRecords(row)) {
      const key = budgetedDepartmentMonthKey(departmentRecord, budgetMonthOf(row));
      if (key) result.add(key);
    }
  }
  return result;
}

function shouldIncludeDepartmentExpense(department, month, executionRegion, budgetedDepartmentMonths) {
  const key = budgetedDepartmentMonthKey(department, month);
  return !key || !budgetedDepartmentMonths?.has(key) || isChinaExecutionRegion(executionRegion);
}

function chinaExecutionRegionWhere(alias) {
  const region = `COALESCE(${alias}.execution_region, '')`;
  return `(
    LOWER(${region}) LIKE '%china%'
    OR ${region} LIKE '%中国%'
    OR LOWER(BTRIM(${region})) = 'cn'
  )`;
}

function submittedBudgetChinaWhere(alias) {
  const amountColumns = alias === 'p'
    ? [`${alias}.total_amount`, `${alias}.monthly_budget_amount`]
    : [`${alias}.total_amount`, `${alias}.budget_amount`];
  const submittedAmount = `GREATEST(${amountColumns.map((column) => `COALESCE(${column}, 0)`).join(', ')})`;
  return `(
    ${submittedAmount} <= 0
    OR ${chinaExecutionRegionWhere(alias)}
  )`;
}

const excludedBudgetStatusKeywords = [
  'cancel',
  'reject',
  'refuse',
  'terminate',
  'invalid',
  'withdraw',
  '\u64a4\u56de',
  '\u64a4\u9500',
  '\u53d6\u6d88',
  '\u9a73\u56de',
  '\u62d2\u7edd',
  '\u7ec8\u6b62',
  '\u4f5c\u5e9f',
  '\u4e0d\u901a\u8fc7',
];

function validBudgetStatusWhere(alias) {
  const status = `LOWER(COALESCE(${alias}.status, ''))`;
  return `NOT (${excludedBudgetStatusKeywords
    .map((keyword) => `${status} LIKE '%${keyword.toLowerCase()}%'`)
    .join(' OR ')})`;
}

function rowRegion(row) {
  return normalizeRegion(row?.execution_region);
}

function expenseDepartment(item) {
  return normalizeDept(firstNonEmpty(
    item?.department_resolved,
    item?.applicant_department,
    item?.creator_department,
    item?.query_department
  ));
}

function expenseDepartmentRecord(item) {
  return {
    form_no: item?.form_no || item?.business_id,
    business_id: item?.business_id,
    dept_name: expenseDepartment(item),
    dept_id: firstNonEmpty(
      item?.applicant_department_id,
      item?.department_id,
      item?.creator_department_id
    ),
    dept_source: firstNonEmpty(
      item?.applicant_department_source,
      item?.department_source,
      item?.creator_department_source
    ),
    dept_path_names: firstNonEmpty(
      item?.applicant_department_path_names,
      item?.department_path_names,
      item?.creator_department_path_names
    ),
  };
}

function splitDepartmentRecord(entry, businessId) {
  return {
    form_no: businessId,
    business_id: businessId,
    dept_name: normalizeDept(entry?.department),
    dept_id: entry?.department_id,
    dept_source: entry?.department_source,
    dept_path_names: entry?.department_path_names,
  };
}

function expenseRegion(item) {
  const text = [
    item?.department_resolved,
    item?.applicant_department,
    item?.creator_department,
    item?.query_department,
    item?.title,
  ].filter(Boolean).join(' ');
  return normalizeRegion(text);
}

function isHrUnifiedExpense(item) {
  if (item?.expense_kind !== 'operation') return false;
  const text = [
    item.department_resolved,
    item.applicant_department,
    item.creator_department,
    item.query_department,
    item.title,
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes('hr cn') ||
    text.includes('hrcn') ||
    text.includes('hr mx') ||
    text.includes('hrmx') ||
    text.includes('人力资源') ||
    text.includes('recursos humanos');
}

function splitExpenseCategory(splitType) {
  const type = String(splitType || '').trim().toLowerCase();
  if (type === 'salary' || type === 'social_insurance') return 'salary';
  if (type === 'office' || type === 'office_space') return 'office';
  if (type === 'individual_income_tax' || type === 'tax') return 'tax';
  return 'management';
}

function addDirectExpense(map, department, month, item, amount, budgetedDepartmentMonths) {
  const value = numberValue(amount);
  if (value <= 0 || !shouldIncludeDepartmentExpense(department, month, item?.execution_region, budgetedDepartmentMonths)) return;
  if (item?.expense_kind === 'purchase') {
    addExpenseBreakdown(map, department, month, { purchase: value, management: value });
    return;
  }
  // 工资/公积金与办公场地只认 approval_expense_dept_split.split_type。
  // 没有拆分表明细的运营支出，按管理支出归属申请部门。
  addExpenseBreakdown(map, department, month, { operation: value, management: value });
}

function addExpenseBreakdown(map, department, month, values = {}) {
  const deptKey = reportingDepartmentKey(department, month);
  if (!deptKey || !month) return;
  const key = `${deptKey}__${month}`;
  const current = map.get(key) || {
    operation: 0,
    purchase: 0,
    salary: 0,
    office: 0,
    tax: 0,
    management: 0,
  };
  current.operation += numberValue(values.operation);
  current.purchase += numberValue(values.purchase);
  current.salary += numberValue(values.salary);
  current.office += numberValue(values.office);
  current.tax += numberValue(values.tax);
  current.management += numberValue(values.management);
  map.set(key, current);
}

async function fetchExpenseDeptSplits(details) {
  const businessIds = [...new Set(
    (details || [])
      .map((item) => String(item.business_id || '').trim())
      .filter(Boolean)
  )].sort();
  if (businessIds.length === 0) return [];
  const cacheKey = businessIds.join('|');
  const cached = expenseSplitCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < EXPENSE_SPLIT_CACHE_TTL_MS) {
    return cached.value || cached.promise;
  }

  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: APPROVAL_DB_DATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 2000),
  });

  try {
    await client.connect();
    const promise = client.query(`
      SELECT business_id, split_type, department, department_id, department_source,
             department_path_names, amount, note
      FROM approval_expense_dept_split
      WHERE business_id = ANY($1::varchar[])
    `, [businessIds]);
    expenseSplitCache.set(cacheKey, { cachedAt: Date.now(), promise: promise.then((result) => result.rows) });
    const result = await promise;
    expenseSplitCache.set(cacheKey, { cachedAt: Date.now(), value: result.rows });
    return result.rows;
  } catch (error) {
    expenseSplitCache.delete(cacheKey);
    console.warn('[WARN] Expense dept split unavailable:', error.message);
    return [];
  } finally {
    await client.end().catch(() => {});
  }
}

function embeddedExpenseSplitRows(details) {
  return (details || []).flatMap((item) => {
    if (!Array.isArray(item?.expense_splits)) return [];
    const businessId = String(item.business_id || '').trim();
    return item.expense_splits.map((row) => ({
      ...row,
      business_id: String(row.business_id || businessId).trim(),
    }));
  });
}

async function attachExpenseSplitsToDetails(details) {
  const rows = Array.isArray(details) ? details : [];
  if (rows.length === 0) return rows;
  const splitRows = await fetchExpenseDeptSplits(rows);
  const splitMap = new Map();

  for (const row of splitRows) {
    const businessId = String(row.business_id || '').trim();
    if (!businessId) continue;
    const current = splitMap.get(businessId) || [];
    current.push({
      business_id: businessId,
      split_type: String(row.split_type || '').trim(),
      category: splitExpenseCategory(row.split_type),
      department: normalizeDept(row.department),
      department_id: row.department_id || null,
      department_source: row.department_source || 'name_only',
      department_path_names: row.department_path_names || null,
      amount: numberValue(row.amount),
      note: row.note || '',
    });
    splitMap.set(businessId, current);
  }

  return rows.map((item) => ({
    ...item,
    expense_splits: splitMap.get(String(item.business_id || '').trim()) || [],
  }));
}

function buildAllocatedExpenseItems(rows) {
  const grouped = new Map();

  for (const row of rows || []) {
    const month = budgetMonthOf(row);
    const reporting = applyJulyDepartmentReportingOverlay(row, month);
    const dept = normalizeDept(reporting.reporting_dept_name);
    if (!month || !dept) continue;
    const key = `${reportingDepartmentKey(row, month)}__${month}`;
    const current = grouped.get(key) || {
      department: dept,
      month,
      operationTotal: 0,
      operationCount: 0,
      purchaseTotal: 0,
      purchaseCount: 0,
      managementTotal: 0,
      salaryTotal: 0,
      officeTotal: 0,
      taxTotal: 0,
    };

    const operationExpense = numberValue(row.operation_expense);
    const purchaseExpense = numberValue(row.purchase_expense);
    const salaryExpense = numberValue(row.salary_expense);
    const officeExpense = numberValue(row.office_expense);
    const taxExpense = numberValue(row.tax_expense);
    current.managementTotal += numberValue(row.management_expense);
    current.salaryTotal += salaryExpense;
    current.officeTotal += officeExpense;
    current.taxTotal += taxExpense;
    current.operationTotal += operationExpense + salaryExpense + officeExpense + taxExpense;
    current.purchaseTotal += purchaseExpense;
    current.operationCount += operationExpense + salaryExpense + officeExpense > 0 ? 1 : 0;
    current.purchaseCount += purchaseExpense > 0 ? 1 : 0;
    grouped.set(key, current);
  }

  return [...grouped.values()].map((item) => ({
    ...item,
    operationTotal: Number(item.operationTotal.toFixed(2)),
    purchaseTotal: Number(item.purchaseTotal.toFixed(2)),
    managementTotal: Number(item.managementTotal.toFixed(2)),
    salaryTotal: Number(item.salaryTotal.toFixed(2)),
    officeTotal: Number(item.officeTotal.toFixed(2)),
    taxTotal: Number(item.taxTotal.toFixed(2)),
  }));
}

/** 按三类预算口径为有效预算流程挂接支出金额 */
async function attachExpenseAmounts(records, {
  startDate,
  endDate,
  approvedDetails,
  budgetedDepartmentMonths = new Set(),
} = {}) {
  if (!records || records.length === 0) return records || [];

  let details = Array.isArray(approvedDetails) ? approvedDetails : [];
  if (!Array.isArray(approvedDetails)) {
    try {
      details = (await fetchApprovedExpenseSummary({ startDate, endDate })).details;
    } catch {
      details = [];
    }
  }

  const prepared = records.map((row) => ({
    ...row,
    budget_breakdown: budgetBreakdownOf(row),
  }));
  const expenseMap = new Map();
  const hasEmbeddedSplits = details.some((item) => Array.isArray(item?.expense_splits));
  const splitRows = hasEmbeddedSplits
    ? embeddedExpenseSplitRows(details)
    : await fetchExpenseDeptSplits(details);
  const splitBusinessIds = new Set(splitRows.map((row) => String(row.business_id || '').trim()).filter(Boolean));
  const detailMonthMap = new Map();
  const detailByBusinessId = new Map();
  for (const item of details) {
    const businessId = String(item.business_id || '').trim();
    if (!businessId) continue;
    const month = item.query_month || approvedDetailMonth(item);
    if (month) detailMonthMap.set(businessId, month);
    detailByBusinessId.set(businessId, item);
  }

  for (const row of splitRows) {
    const businessId = String(row.business_id || '').trim();
    const month = detailMonthMap.get(businessId);
    if (!month) continue;
    const item = detailByBusinessId.get(businessId);
    const department = splitDepartmentRecord(row, businessId);
    if (!shouldIncludeDepartmentExpense(department, month, item?.execution_region, budgetedDepartmentMonths)) continue;
    const category = splitExpenseCategory(row.split_type);
    addExpenseBreakdown(expenseMap, department, month, {
      [category]: numberValue(row.amount),
    });
  }

  for (const item of details) {
    const month = item.query_month || approvedDetailMonth(item);
    const amount = numberValue(firstNonEmpty(item.base_currency_amount, item.amount, item.detail_summary_amount));
    if (!month || amount <= 0) continue;
    const businessId = String(item.business_id || '').trim();
    if (businessId && splitBusinessIds.has(businessId)) continue;
    addDirectExpense(expenseMap, expenseDepartmentRecord(item), month, item, amount, budgetedDepartmentMonths);
  }

  const rowsWithExpense = prepared.flatMap(sharedBudgetDepartmentRecords).map((row) => {
    const month = budgetMonthOf(row);
    const direct = expenseMap.get(`${reportingDepartmentKey(row, month)}__${month}`) || {
      operation: 0,
      purchase: 0,
      salary: 0,
      office: 0,
      tax: 0,
      management: 0,
    };
    const managementExpense = direct.management || direct.operation + direct.purchase;
    const managementRounded = Number(managementExpense.toFixed(2));
    const operationRounded = Number(direct.operation.toFixed(2));
    const purchaseRounded = Number(direct.purchase.toFixed(2));
    const salaryRounded = Number(direct.salary.toFixed(2));
    const officeRounded = Number(direct.office.toFixed(2));
    const taxRounded = Number(direct.tax.toFixed(2));
    const totalRounded = Number((managementRounded + salaryRounded + officeRounded + taxRounded).toFixed(2));

    return {
      ...row,
      management_expense: managementRounded,
      operation_expense: operationRounded,
      purchase_expense: purchaseRounded,
      salary_expense: salaryRounded,
      office_expense: officeRounded,
      tax_expense: taxRounded,
      approved_amount: totalRounded,
      expense_breakdown: {
        management: managementRounded,
        operation: operationRounded,
        purchase: purchaseRounded,
        salary: salaryRounded,
        office: officeRounded,
        tax: taxRounded,
        total: totalRounded,
      },
    };
  });

  return rollupYWTechBudgetRows(rowsWithExpense);
}

function approvedDetailMonth(item) {
  return formatUtcMonth(firstNonEmpty(item.source_created_at, item.request_date, item.approval_completed_at));
}

function formatUtcMonth(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(0, 7);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatMonth(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const excludedExpenseStatusKeywords = [
  'reject',
  'refuse',
  'cancel',
  'terminate',
  '撤销',
  '取消',
  '拒绝',
  '驳回',
];

function isExcludedExpense(item) {
  const statusValues = [
    item.approval_status,
    item.local_approval_status,
    item.live_approval_status,
    item.live_status,
    item.flow_status,
    item.status,
    item.biz_action,
    item.live_biz_action,
    item.result,
    item.live_result,
    item.approval_result,
    item.approve_result,
    item.process_result,
    item.process_status,
    item.cashier_status,
    item.cashier_result,
    item.local_cashier_status,
    item.local_cashier_result,
  ];

  return statusValues.some((value) => {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return false;
    return excludedExpenseStatusKeywords.some((keyword) => text.includes(keyword));
  });
}

function needsLiveExpenseStatus(item) {
  if (!VERIFY_EXPENSE_STATUS_WITH_DINGTALK) return false;
  if (isExcludedExpense(item)) return false;
  if (!item.process_instance_id) return false;
  if (item.approval_completed_at) return false;

  const statusText = [
    item.approval_status,
    item.local_approval_status,
    item.flow_status,
    item.status,
    item.biz_action,
    item.result,
    item.approval_result,
    item.process_status,
  ].filter(Boolean).join(' ').toLowerCase();

  const resultText = String(firstNonEmpty(
    item.result,
    item.approval_result,
    item.approve_result,
    item.process_result
  ) || '').trim().toLowerCase();
  const isClearlyAgreed = resultText === 'agree' ||
    resultText === 'approved' ||
    resultText === 'pass' ||
    resultText === 'success' ||
    resultText.includes('同意') ||
    resultText.includes('通过');
  if (isClearlyAgreed) return false;

  return statusText.includes('running') ||
    statusText.includes('pending') ||
    statusText.includes('process') ||
    statusText.includes('审批中') ||
    statusText.includes('处理中');
}

async function mapLimit(items, limit, mapper) {
  const results = [];
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit || 1, items.length || 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function getCachedExpenseStatus(processInstanceId) {
  const cached = expenseStatusCache.get(processInstanceId);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > EXPENSE_STATUS_CACHE_TTL_MS) {
    expenseStatusCache.delete(processInstanceId);
    return null;
  }
  return cached.value;
}

async function getLiveExpenseStatus(processInstanceId) {
  const cached = getCachedExpenseStatus(processInstanceId);
  if (cached) return cached;

  try {
    const detail = await getProcessInstanceDetail(processInstanceId);
    const value = {
      live_approval_status: detail?.status || '',
      live_status: detail?.status || '',
      live_result: detail?.result || '',
      live_biz_action: detail?.bizAction || detail?.biz_action || '',
      live_finish_time: detail?.finishTime || detail?.finish_time || '',
    };
    expenseStatusCache.set(processInstanceId, { cachedAt: Date.now(), value });
    return value;
  } catch (error) {
    console.warn(`[WARN] Live DingTalk expense status unavailable for ${processInstanceId}: ${error.message}`);
    return null;
  }
}

async function applyLiveExpenseStatuses(items, warnings) {
  const candidates = [];
  const seen = new Set();

  for (const item of items) {
    if (!needsLiveExpenseStatus(item)) continue;
    const processInstanceId = String(item.process_instance_id || '').trim();
    if (!processInstanceId || seen.has(processInstanceId)) continue;
    seen.add(processInstanceId);
    candidates.push(processInstanceId);
  }

  if (candidates.length === 0) return items;

  const limitedCandidates = candidates.slice(0, EXPENSE_STATUS_VERIFY_LIMIT);
  if (limitedCandidates.length < candidates.length) {
    warnings.push(`有 ${candidates.length - limitedCandidates.length} 条审批中支出未做实时状态校验`);
  }

  const statuses = await mapLimit(limitedCandidates, EXPENSE_STATUS_VERIFY_CONCURRENCY, async (processInstanceId) => [
    processInstanceId,
    await getLiveExpenseStatus(processInstanceId),
  ]);
  const statusMap = new Map(statuses.filter(([, status]) => status));

  return items.map((item) => {
    const processInstanceId = String(item.process_instance_id || '').trim();
    const liveStatus = statusMap.get(processInstanceId) || getCachedExpenseStatus(processInstanceId);
    return liveStatus ? { ...item, ...liveStatus } : item;
  });
}

/** 从支出记录的 JSONB 拆分列中提取各部门明细金额（原始币种） */
const approvedExpenseStatusKeywords = [
  'completed',
  'running',        // 钉钉审批流大量已通过记录 approval_status 仍为 RUNNING，未被驳回/终止即视为有效
  'approved',
  'agree',
  'pass',
  'done',
  'finish',
  'success',
  '已通过',
  '已完成',
  '同意',
  '通过',
  '完成',
];

function isApprovedExpense(item) {
  if (isExcludedExpense(item)) return false;
  if (item.approval_completed_at) return true;

  const statusValues = [
    item.approval_status,
    item.flow_status,
    item.status,
    item.biz_action,
    item.result,
    item.approval_result,
    item.approve_result,
    item.process_result,
    item.process_status,
  ];

  return statusValues.some((value) => {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return false;
    return approvedExpenseStatusKeywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
  });
}

function extractDeptSplitEntries(item) {
  const entries = [];
  const splitColumns = [
    { col: 'salary_by_department', splitType: 'salary' },
    { col: 'social_insurance_by_department', splitType: 'social_insurance' },
    { col: 'office_space_by_department', splitType: 'office_space' },
    { col: 'individual_income_tax_by_department', splitType: 'individual_income_tax' },
  ];

  for (const { col, splitType } of splitColumns) {
    const data = item[col];
    if (!data || !Array.isArray(data)) continue;
    for (const entry of data) {
      const dept = normalizeDept(entry.department);
      const amt = numberValue(entry.amount);
      if (dept && amt > 0) {
        entries.push({ department: dept, amount: amt, splitType });
      }
    }
  }

  return entries;
}

function addApprovedExpenseGroup(grouped, departmentRecord, month, values = {}) {
  const department = typeof departmentRecord === 'string'
    ? { dept_name: departmentRecord }
    : departmentRecord;
  const reportingDepartment = applyJulyDepartmentReportingOverlay(department, month);
  const dept = normalizeDept(reportingDepartment.reporting_dept_name);
  if (!dept || !month) return '';

  const identityKey = reportingDepartmentKey(department, month);
  const presentation = reportingDepartment.reporting_department_mapped
    ? { departmentDisplay: dept, subDepartmentDisplay: '' }
    : buildDepartmentPresentation(department);
  const key = `${identityKey}__${month}`;
  const current = grouped.get(key) || {
    department: dept,
    department_id: reportingDepartment.reporting_dept_id || null,
    department_source: department?.dept_source || 'name_only',
    department_path_names: department?.dept_path_names || null,
    department_identity_key: identityKey,
    department_display: presentation.departmentDisplay,
    sub_department_display: presentation.subDepartmentDisplay,
    month,
    operationTotal: 0,
    operationCount: 0,
    purchaseTotal: 0,
    purchaseCount: 0,
    managementTotal: 0,
    salaryTotal: 0,
    officeTotal: 0,
    taxTotal: 0,
  };

  current.operationTotal += numberValue(values.operationTotal);
  current.purchaseTotal += numberValue(values.purchaseTotal);
  current.managementTotal += numberValue(values.managementTotal);
  current.salaryTotal += numberValue(values.salaryTotal);
  current.officeTotal += numberValue(values.officeTotal);
  current.taxTotal += numberValue(values.taxTotal);
  current.operationCount += numberValue(values.operationCount);
  current.purchaseCount += numberValue(values.purchaseCount);
  grouped.set(key, current);
  return identityKey;
}

function splitRowsOf(item) {
  const dbSplits = Array.isArray(item?.expense_splits) ? item.expense_splits : [];
  if (dbSplits.length > 0) {
    return dbSplits
      .map((entry) => ({
        department: normalizeDept(entry.department),
        department_id: entry.department_id || null,
        department_source: entry.department_source || 'name_only',
        department_path_names: entry.department_path_names || null,
        amount: numberValue(entry.amount),
        category: splitExpenseCategory(entry.split_type || entry.splitType),
      }))
      .filter((entry) => entry.department && entry.amount > 0);
  }

  return extractDeptSplitEntries(item).map((entry) => ({
    department: normalizeDept(entry.department),
    department_id: entry.department_id || null,
    department_source: entry.department_source || 'name_only',
    department_path_names: entry.department_path_names || null,
    amount: numberValue(entry.amount),
    category: splitExpenseCategory(entry.splitType),
  }));
}

function applyExpenseDetailReportingOverlay(details) {
  return (details || []).map((item) => {
    const month = item.query_month || approvedDetailMonth(item);
    const reporting = applyJulyDepartmentReportingOverlay(expenseDepartmentRecord(item), month);
    const rollupDepartment = ywTechSharedBudgetRollupDepartment(expenseDepartmentRecord(item), month);
    const splits = Array.isArray(item?.expense_splits)
      ? item.expense_splits.map((entry) => {
        const department = splitDepartmentRecord(entry, item.business_id);
        const splitRollupDepartment = ywTechSharedBudgetRollupDepartment(department, month);
        return {
          ...entry,
          ...applyJulyDepartmentReportingOverlay(department, month),
          reporting_department_identity_key: reportingDepartmentKey(department, month),
          ...(splitRollupDepartment ? {
            rollup_dept_id: splitRollupDepartment.department_id,
            rollup_dept_name: splitRollupDepartment.department_name,
          } : {}),
        };
      })
      : item?.expense_splits;

    return {
      ...item,
      reporting_dept_id: reporting.reporting_dept_id,
      reporting_dept_name: reporting.reporting_dept_name,
      reporting_department_identity_key: reportingDepartmentKey(expenseDepartmentRecord(item), month),
      reporting_department_mapped: reporting.reporting_department_mapped,
      ...(rollupDepartment ? {
        rollup_dept_id: rollupDepartment.department_id,
        rollup_dept_name: rollupDepartment.department_name,
      } : {}),
      ...(Array.isArray(splits) ? { expense_splits: splits } : {}),
    };
  });
}

function filterExpenseDetailsForReport(details, budgetedDepartmentMonths = new Set()) {
  const visibleDetails = (details || []).flatMap((item) => {
    const month = item.query_month || approvedDetailMonth(item);
    const splits = Array.isArray(item?.expense_splits) ? item.expense_splits : [];
    if (splits.length === 0) {
      return shouldIncludeDepartmentExpense(
        expenseDepartmentRecord(item), month, item.execution_region, budgetedDepartmentMonths
      ) ? [item] : [];
    }

    const visibleSplits = splits.filter((entry) => (
      shouldIncludeDepartmentExpense(
        splitDepartmentRecord(entry, item.business_id), month, item.execution_region, budgetedDepartmentMonths
      )
    ));
    if (visibleSplits.length === 0) return [];
    return [{ ...item, expense_splits: visibleSplits }];
  });
  return applyExpenseDetailReportingOverlay(visibleDetails);
}

function roundApprovedExpenseItems(items) {
  return items.map((item) => ({
    ...item,
    operationTotal: Number(numberValue(item.operationTotal).toFixed(2)),
    purchaseTotal: Number(numberValue(item.purchaseTotal).toFixed(2)),
    managementTotal: Number(numberValue(item.managementTotal).toFixed(2)),
    salaryTotal: Number(numberValue(item.salaryTotal).toFixed(2)),
    officeTotal: Number(numberValue(item.officeTotal).toFixed(2)),
    taxTotal: Number(numberValue(item.taxTotal).toFixed(2)),
    operationCount: Number(numberValue(item.operationCount).toFixed(2)),
    purchaseCount: Number(numberValue(item.purchaseCount).toFixed(2)),
  }));
}

function summarizeApprovedDetails(details, budgetedDepartmentMonths = new Set()) {
  const grouped = new Map();

  for (const item of details) {
    const month = item.query_month || approvedDetailMonth(item);
    if (!month) continue;

    const amount = numberValue(firstNonEmpty(item.base_currency_amount, item.amount, item.detail_summary_amount));
    if (amount <= 0) continue;

    const directDepartment = expenseDepartment(item);
    const directDepartmentRecord = expenseDepartmentRecord(item);

    if (item.expense_kind === 'purchase') {
      if (!shouldIncludeDepartmentExpense(directDepartment, month, item.execution_region, budgetedDepartmentMonths)) continue;
      addApprovedExpenseGroup(grouped, directDepartmentRecord, month, {
        purchaseTotal: amount,
        managementTotal: amount,
        purchaseCount: 1,
      });
      continue;
    }

    const splits = splitRowsOf(item);
    if (splits.length === 0) {
      if (!shouldIncludeDepartmentExpense(directDepartment, month, item.execution_region, budgetedDepartmentMonths)) continue;
      addApprovedExpenseGroup(grouped, directDepartmentRecord, month, {
        operationTotal: amount,
        managementTotal: amount,
        operationCount: 1,
      });
      continue;
    }

    const touchedDepartments = new Set();
    let classifiedSplitTotal = 0;
    for (const entry of splits) {
      classifiedSplitTotal += entry.amount;
      if (!shouldIncludeDepartmentExpense(entry.department, month, item.execution_region, budgetedDepartmentMonths)) continue;
      const category = splitExpenseCategory(entry.category);
      const values = { operationTotal: entry.amount };
      if (category === 'salary') values.salaryTotal = entry.amount;
      else if (category === 'office') values.officeTotal = entry.amount;
      else if (category === 'tax') values.taxTotal = entry.amount;
      else values.managementTotal = entry.amount;

      const departmentRecord = splitDepartmentRecord(entry, item.business_id);
      touchedDepartments.add(addApprovedExpenseGroup(grouped, departmentRecord, month, values));
    }

    const remainder = Number((amount - classifiedSplitTotal).toFixed(2));
    if (remainder > 0.01 && shouldIncludeDepartmentExpense(
      directDepartment, month, item.execution_region, budgetedDepartmentMonths
    )) {
      touchedDepartments.add(addApprovedExpenseGroup(grouped, directDepartmentRecord, month, {
        operationTotal: remainder,
        managementTotal: remainder,
      }));
    }

    for (const deptKey of touchedDepartments) {
      const current = grouped.get(`${deptKey}__${month}`);
      if (current) current.operationCount += 1;
    }
  }

  return roundApprovedExpenseItems([...grouped.values()]);
}

/** 将 YYYY-MM 短格式展开为完整日期 YYYY-MM-DD，避免支出 API 的 timestamp 列报错 */
function expandMonthDate(value, isEndDate = false) {
  if (!value) return value;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (!match) return text;
  if (isEndDate) {
    const lastDay = new Date(Number(match[1]), Number(match[2]), 0).getDate();
    return `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`;
  }
  return `${match[1]}-${match[2]}-01`;
}

function approvalExpenseDateExpr(alias) {
  return `((` + `${alias}.source_created_at AT TIME ZONE 'UTC')::date)`;
}

async function fetchApprovalExpenseDetails(dateRange) {
  const params = [];
  const startDate = expandMonthDate(dateRange.startDate, false);
  const endDate = expandMonthDate(dateRange.endDate, true);
  const startParam = startDate ? params.push(startDate) : null;
  const endParam = endDate ? params.push(endDate) : null;

  const dateWhereFor = (alias) => {
    const dateExpr = `COALESCE(${approvalExpenseDateExpr(alias)}, ${alias}.request_date, (${alias}.approval_completed_at AT TIME ZONE 'UTC')::date)`;
    let whereClause = 'WHERE 1=1';
    if (startParam) whereClause += ` AND ${dateExpr} >= $${startParam}::date`;
    if (endParam) whereClause += ` AND ${dateExpr} <= $${endParam}::date`;
    return whereClause;
  };

  const client = new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: APPROVAL_DB_DATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 2000),
  });

  try {
    await client.connect();
    const result = await client.query(`
      SELECT
        'operation'::text AS expense_kind,
        o.business_id,
        o.process_instance_id,
        o.request_date,
        o.execution_region,
        o.applicant_department,
        o.applicant_department_id,
        o.applicant_department_source,
        o.applicant_department_path_names,
        o.creator_department,
        o.applicant_department AS query_department,
        o.source_created_at,
        o.source_updated_at,
        o.updated_at,
        o.approval_completed_at,
        o.approval_status,
        o.cashier_status,
        o.cashier_result,
        o.raw_data->>'status' AS status,
        o.raw_data->>'bizAction' AS biz_action,
        o.raw_data->>'result' AS result,
        o.raw_data->>'title' AS title,
        o.expense_type,
        o.operation_expense,
        o.employee_benefits_expense,
        o.bonus_expense,
        o.salary_expense,
        o.administrative_expense,
        o.individual_income_tax_by_department,
        o.matter_description,
        o.amount,
        NULL::numeric AS detail_summary_amount,
        o.base_currency_amount
      FROM approval_expense_operation o
      ${dateWhereFor('o')}
      UNION ALL
      SELECT
        'purchase'::text AS expense_kind,
        p.business_id,
        p.process_instance_id,
        p.request_date,
        p.execution_region,
        p.applicant_department,
        p.applicant_department_id,
        p.applicant_department_source,
        p.applicant_department_path_names,
        p.creator_department,
        p.applicant_department AS query_department,
        p.source_created_at,
        p.source_updated_at,
        p.updated_at,
        p.approval_completed_at,
        p.approval_status,
        p.cashier_status,
        p.cashier_result,
        p.raw_data->>'status' AS status,
        p.raw_data->>'bizAction' AS biz_action,
        p.raw_data->>'result' AS result,
        p.raw_data->>'title' AS title,
        p.purchase_expense AS expense_type,
        NULL::varchar AS operation_expense,
        NULL::varchar AS employee_benefits_expense,
        NULL::varchar AS bonus_expense,
        NULL::varchar AS salary_expense,
        NULL::varchar AS administrative_expense,
        NULL::jsonb AS individual_income_tax_by_department,
        NULL::text AS matter_description,
        NULL::numeric AS amount,
        p.detail_summary_amount,
        p.base_currency_amount
      FROM approval_expense_purchase p
      ${dateWhereFor('p')}
    `, params);
    return result.rows;
  } finally {
    await client.end().catch(() => {});
  }
}

function expenseSummaryCacheKey(dateRange) {
  return [
    expandMonthDate(dateRange.startDate, false) || '',
    expandMonthDate(dateRange.endDate, true) || '',
    VERIFY_EXPENSE_STATUS_WITH_DINGTALK ? 'live' : 'db',
  ].join('__');
}

async function fetchApprovedExpenseSummaryFresh(dateRange) {
  const warnings = [];
  const detailMap = new Map();

  try {
    const rawDetails = (await fetchApprovalExpenseDetails(dateRange)).filter((item) => !isExcludedExpense(item));
    const verifiedDetails = await applyLiveExpenseStatuses(rawDetails, warnings);

    for (const item of verifiedDetails.filter((e) => e.expense_kind === 'operation' && !isExcludedExpense(e))) {
      const queryMonth = approvedDetailMonth(item);
      const key = `operation__${item.business_id || ''}__${item.process_instance_id || ''}__${queryMonth}`;
      detailMap.set(key, { ...item, query_month: queryMonth });
    }

    for (const item of verifiedDetails.filter((e) => e.expense_kind === 'purchase' && !isExcludedExpense(e))) {
      const queryMonth = approvedDetailMonth(item);
      const key = `purchase__${item.business_id || ''}__${item.process_instance_id || ''}__${queryMonth}`;
      detailMap.set(key, { ...item, query_month: queryMonth });
    }
  } catch (error) {
    warnings.push(isProduction ? '支出数据库不可用' : `支出数据库不可用：${error.message}`);
  }

  const details = await attachExpenseSplitsToDetails([...detailMap.values()]);
  return {
    items: summarizeApprovedDetails(details),
    details,
    reportDetails: filterExpenseDetailsForReport(details),
    warnings,
  };
}

async function fetchApprovedExpenseSummary(dateRange) {
  const key = expenseSummaryCacheKey(dateRange);
  const cached = approvedExpenseSummaryCache.get(key);
  if (cached && Date.now() - cached.cachedAt < APPROVED_EXPENSE_CACHE_TTL_MS) {
    return cached.value || cached.promise;
  }

  const promise = fetchApprovedExpenseSummaryFresh(dateRange)
    .catch((error) => {
      approvedExpenseSummaryCache.delete(key);
      throw error;
    });
  approvedExpenseSummaryCache.set(key, { cachedAt: Date.now(), promise });
  const value = await promise;
  approvedExpenseSummaryCache.set(key, { cachedAt: Date.now(), value });
  return value;
}

function buildBudgetWhere(alias, { startDate, endDate, status } = {}, { filterExecutionRegion = true } = {}) {
  let whereClause = 'WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  ({ whereClause, paramIndex } = appendBudgetMonthRange(
    whereClause,
    params,
    paramIndex,
    startDate,
    endDate,
    budgetMonthExprFor(alias)
  ));

  whereClause += ` AND ${validBudgetStatusWhere(alias)}`;

  if (filterExecutionRegion) {
    whereClause += ` AND ${submittedBudgetChinaWhere(alias)}`;
  }

  if (status) {
    whereClause += ` AND ${alias}.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  return { whereClause, params, paramIndex };
}

function productionBudgetCte(whereClause) {
  const monthExpr = budgetMonthExprFor('p');
  const deptExpr = deptPartitionExprFor('p');
  return `
    WITH filtered AS (
      SELECT
        p.id, p.form_no, p.process_instance_id, p.dept_name, p.dept_id, p.dept_source,
        p.dept_path_ids, p.dept_path_names, p.budget_type,
        p.declaration_month, p.budget_month, p.application_date, p.execution_region,
        p.monthly_budget_amount, p.total_amount, p.creator_name, p.creator_userid,
        p.create_time, p.status, p.remark, p.tenant_id,
        ${monthExpr} AS budget_month_key,
        ${deptExpr} AS dept_key
      FROM production_budget p
      ${whereClause}
        AND (
          EXISTS (SELECT 1 FROM budget_material m WHERE m.form_no = p.form_no)
          OR EXISTS (SELECT 1 FROM budget_production bp WHERE bp.form_no = p.form_no)
          OR EXISTS (SELECT 1 FROM budget_labor bl WHERE bl.form_no = p.form_no)
        )
    ),
    picked AS (
      SELECT *,
             ROW_NUMBER() OVER (
               PARTITION BY dept_key, budget_month_key
               ORDER BY create_time DESC NULLS LAST, id DESC
             ) AS rn
      FROM filtered
    ),
    ranked AS (
      SELECT
        picked.*,
        COALESCE(material.items, '[]'::json) AS material_items,
        COALESCE(production.items, '[]'::json) AS production_items,
        COALESCE(labor.items, '[]'::json) AS labor_items,
        COALESCE(material.total, 0)::numeric AS material_budget,
        COALESCE(production.total, 0)::numeric AS production_budget,
        COALESCE(labor.total, 0)::numeric AS labor_budget
      FROM picked
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) AS items,
               COALESCE(SUM(COALESCE(x.amount, 0)), 0) AS total
        FROM (SELECT * FROM budget_material WHERE form_no = picked.form_no ORDER BY id) x
      ) material ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) AS items,
               COALESCE(SUM(COALESCE(x.amount, 0)), 0) AS total
        FROM (SELECT * FROM budget_production WHERE form_no = picked.form_no ORDER BY id) x
      ) production ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) AS items,
               COALESCE(SUM(COALESCE(x.amount, 0)), 0) AS total
        FROM (SELECT * FROM budget_labor WHERE form_no = picked.form_no ORDER BY id) x
      ) labor ON TRUE
      WHERE picked.rn = 1
    )
  `;
}

function nonProductionBudgetCte(whereClause) {
  const monthExpr = budgetMonthExprFor('n');
  const deptExpr = deptPartitionExprFor('n');
  return `
    WITH filtered AS (
      SELECT
        n.id, n.form_no, n.process_instance_id, n.dept_name, n.dept_id, n.dept_source,
        n.dept_path_ids, n.dept_path_names, n.budget_type,
        n.declaration_month, n.budget_month, n.application_date, n.execution_region,
        n.creator_name, n.creator_userid, n.create_time, n.status,
        n.budget_amount, n.total_amount, n.remark, n.tenant_id,
        ${monthExpr} AS budget_month_key,
        ${deptExpr} AS dept_key
      FROM non_production_budget n
      ${whereClause}
        AND (
          EXISTS (SELECT 1 FROM budget_hr h WHERE h.form_no = n.form_no)
          OR EXISTS (SELECT 1 FROM budget_office o WHERE o.form_no = n.form_no)
          OR EXISTS (SELECT 1 FROM budget_operation op WHERE op.form_no = n.form_no)
        )
    ),
    picked AS (
      SELECT *,
             ROW_NUMBER() OVER (
               PARTITION BY dept_key, budget_month_key
               ORDER BY create_time DESC NULLS LAST, id DESC
             ) AS rn
      FROM filtered
    ),
    ranked AS (
      SELECT
        picked.*,
        COALESCE(hr.items, '[]'::json) AS hr_items,
        COALESCE(office.items, '[]'::json) AS office_items,
        COALESCE(operation.items, '[]'::json) AS operation_items,
        COALESCE(hr.total, 0)::numeric AS hr_budget,
        COALESCE(office.total, 0)::numeric AS office_budget,
        COALESCE(operation.total, 0)::numeric AS operation_budget
      FROM picked
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) AS items,
               COALESCE(SUM(COALESCE(x.amount, 0)), 0) AS total
        FROM (SELECT * FROM budget_hr WHERE form_no = picked.form_no ORDER BY id) x
      ) hr ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) AS items,
               COALESCE(SUM(COALESCE(x.amount, 0)), 0) AS total
        FROM (SELECT * FROM budget_office WHERE form_no = picked.form_no ORDER BY id) x
      ) office ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json) AS items,
               COALESCE(SUM(COALESCE(x.amount, 0)), 0) AS total
        FROM (SELECT * FROM budget_operation WHERE form_no = picked.form_no ORDER BY id) x
      ) operation ON TRUE
      WHERE picked.rn = 1
    )
  `;
}

function withBudgetDepartmentPresentation(rows) {
  return rows.map((row) => {
    const reporting = applyJulyDepartmentReportingOverlay(row, budgetMonthOf(row));
    const presentation = reporting.reporting_department_mapped
      ? { departmentDisplay: reporting.reporting_dept_name, subDepartmentDisplay: '' }
      : buildDepartmentPresentation(row);
    return {
      ...row,
      ...reporting,
      department_identity_key: reportingDepartmentKey(row, budgetMonthOf(row)) || presentation.identityKey,
      department_display: presentation.departmentDisplay,
      sub_department_display: presentation.subDepartmentDisplay,
    };
  });
}

async function fetchProductionBudgetRows(client, filters = {}, paging = null, options = {}) {
  const { whereClause, params, paramIndex } = buildBudgetWhere('p', filters, options);
  const cte = productionBudgetCte(whereClause);
  const limitSql = paging ? ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}` : '';
  const queryParams = paging ? [...params, paging.limit, paging.offset] : params;
  const result = await client.query(`
    ${cte}
    SELECT *
    FROM ranked
    WHERE rn = 1
    ORDER BY create_time DESC NULLS LAST, id DESC
    ${limitSql}
  `, queryParams);
  return withBudgetDepartmentPresentation(result.rows);
}

async function countProductionBudgetRows(client, filters = {}) {
  const { whereClause, params } = buildBudgetWhere('p', filters);
  const cte = productionBudgetCte(whereClause);
  const result = await client.query(`
    ${cte}
    SELECT COUNT(*)::int AS count
    FROM ranked
    WHERE rn = 1
  `, params);
  return result.rows[0]?.count || 0;
}

async function fetchNonProductionBudgetRows(client, filters = {}, paging = null, options = {}) {
  const { whereClause, params, paramIndex } = buildBudgetWhere('n', filters, options);
  const cte = nonProductionBudgetCte(whereClause);
  const limitSql = paging ? ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}` : '';
  const queryParams = paging ? [...params, paging.limit, paging.offset] : params;
  const result = await client.query(`
    ${cte}
    SELECT *
    FROM ranked
    WHERE rn = 1
    ORDER BY create_time DESC NULLS LAST, id DESC
    ${limitSql}
  `, queryParams);
  return withBudgetDepartmentPresentation(result.rows);
}

async function countNonProductionBudgetRows(client, filters = {}) {
  const { whereClause, params } = buildBudgetWhere('n', filters);
  const cte = nonProductionBudgetCte(whereClause);
  const result = await client.query(`
    ${cte}
    SELECT COUNT(*)::int AS count
    FROM ranked
    WHERE rn = 1
  `, params);
  return result.rows[0]?.count || 0;
}

async function fetchBudgetedDepartmentMonthSet(client, filters = {}) {
  const [productionRows, nonProductionRows] = await Promise.all([
    fetchProductionBudgetRows(client, filters, null, { filterExecutionRegion: false }),
    fetchNonProductionBudgetRows(client, filters, null, { filterExecutionRegion: false }),
  ]);
  return buildBudgetedDepartmentMonthSet([...productionRows, ...nonProductionRows]);
}

// GET /api/list/production - 获取生产预算列表
router.get('/production', async (req, res) => {
  try {
    const { startDate, endDate, status, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    const db = { query };
    const filters = { startDate, endDate, status };
    const [dataRows, budgetedDepartmentMonths] = await Promise.all([
      fetchProductionBudgetRows(db, filters),
      fetchBudgetedDepartmentMonthSet(db, filters),
    ]);
    const rowsWithExpense = await attachExpenseAmounts(dataRows, {
      startDate,
      endDate,
      budgetedDepartmentMonths,
    });

    res.json({
      success: true,
      data: rowsWithExpense.slice(offset, offset + Number(pageSize)),
      total: rowsWithExpense.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    });
  } catch (error) {
    console.error('[ERROR] List production error:', error);
    res.status(500).json({ success: false, message: isProduction ? '查询失败' : error.message });
  }
});

// GET /api/list/non-production - 获取非生产预算列表
router.get('/non-production', async (req, res) => {
  try {
    const { startDate, endDate, status, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    const db = { query };
    const filters = { startDate, endDate, status };
    const [dataRows, budgetedDepartmentMonths] = await Promise.all([
      fetchNonProductionBudgetRows(db, filters),
      fetchBudgetedDepartmentMonthSet(db, filters),
    ]);
    const rowsWithExpense = await attachExpenseAmounts(dataRows, {
      startDate,
      endDate,
      budgetedDepartmentMonths,
    });

    res.json({
      success: true,
      data: rowsWithExpense.slice(offset, offset + Number(pageSize)),
      total: rowsWithExpense.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    });
  } catch (error) {
    console.error('[ERROR] List non-production error:', error);
    res.status(500).json({ success: false, message: isProduction ? '查询失败' : error.message });
  }
});

// GET /api/list/approval - 获取审批流程记录
router.get('/approval', async (req, res) => {
  try {
    const { formNo, processInstanceId } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (formNo) {
      whereClause += ` AND form_no = $${paramIndex}`;
      params.push(formNo);
      paramIndex++;
    }

    if (processInstanceId) {
      whereClause += ` AND process_instance_id = $${paramIndex}`;
      params.push(processInstanceId);
      paramIndex++;
    }

    const dataResult = await query(
      `SELECT id, form_no, process_instance_id, budget_type, step,
              approver_name, approver_userid, approve_result, approve_opinion,
              approve_time, tenant_id
       FROM approval_flow
       ${whereClause}
       ORDER BY step ASC`,
      params
    );

    res.json({
      success: true,
      data: dataResult.rows,
    });
  } catch (error) {
    console.error('[ERROR] List approval error:', error);
    res.status(500).json({ success: false, message: isProduction ? '查询失败' : error.message });
  }
});

// GET /api/list/stats - 获取统计数据
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const db = { query };
    const [productionTotal, nonProductionTotal] = await Promise.all([
      countProductionBudgetRows(db, {}),
      countNonProductionBudgetRows(db, {}),
    ]);

    const statsResult = await query(`
      SELECT
        (SELECT COUNT(*)
         FROM production_budget p
         WHERE DATE(p.create_time) = $1
           AND ${validBudgetStatusWhere('p')}
           AND ${submittedBudgetChinaWhere('p')}
           AND (
             EXISTS (SELECT 1 FROM budget_material m WHERE m.form_no = p.form_no)
             OR EXISTS (SELECT 1 FROM budget_production bp WHERE bp.form_no = p.form_no)
             OR EXISTS (SELECT 1 FROM budget_labor bl WHERE bl.form_no = p.form_no)
           )) as production_today,
        (SELECT COUNT(*)
         FROM non_production_budget n
         WHERE DATE(n.create_time) = $1
           AND ${validBudgetStatusWhere('n')}
           AND ${submittedBudgetChinaWhere('n')}
           AND (
             EXISTS (SELECT 1 FROM budget_hr h WHERE h.form_no = n.form_no)
             OR EXISTS (SELECT 1 FROM budget_office o WHERE o.form_no = n.form_no)
             OR EXISTS (SELECT 1 FROM budget_operation op WHERE op.form_no = n.form_no)
           )) as non_production_today
    `, [today]);

    res.json({
      success: true,
      data: {
        ...statsResult.rows[0],
        production_total: productionTotal,
        non_production_total: nonProductionTotal,
      },
    });
  } catch (error) {
    console.error('[ERROR] Stats error:', error);
    res.status(500).json({ success: false, message: isProduction ? '查询失败' : error.message });
  }
});

// GET /api/list/report - 获取报表导出数据（主表 + 明细）
router.get('/report', async (req, res) => {
  try {
    const { startDate, endDate, includeApproved } = req.query;

    const exportClient = new Client({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 2000),
    });
    await exportClient.connect();

    let productionRowsRaw;
    let nonProductionRowsRaw;
    let budgetedDepartmentMonths;
    try {
      const filters = { startDate, endDate };
      [productionRowsRaw, nonProductionRowsRaw, budgetedDepartmentMonths] = await Promise.all([
        fetchProductionBudgetRows(exportClient, filters),
        fetchNonProductionBudgetRows(exportClient, filters),
        fetchBudgetedDepartmentMonthSet(exportClient, filters),
      ]);
    } finally {
      await exportClient.end();
    }

    let warnings = [];
    let approvedItems = null;
    let approvedDetails = null;
    let reportApprovedDetails = null;
    const shouldIncludeApproved = String(includeApproved || '') === '1';
    if (shouldIncludeApproved) {
      const approved = await fetchApprovedExpenseSummary({ startDate, endDate });
      approvedItems = rollupYWTechApprovedExpenseSummaries(
        summarizeApprovedDetails(approved.details, budgetedDepartmentMonths)
      );
      approvedDetails = approved.details;
      reportApprovedDetails = filterExpenseDetailsForReport(approved.details, budgetedDepartmentMonths);
      warnings = approved.warnings;
    }

    const productionRows = await attachExpenseAmounts(
      productionRowsRaw,
      {
        startDate,
        endDate,
        approvedDetails: shouldIncludeApproved ? approvedDetails : [],
        budgetedDepartmentMonths,
      }
    );
    const nonProductionRows = await attachExpenseAmounts(
      nonProductionRowsRaw,
      {
        startDate,
        endDate,
        approvedDetails: shouldIncludeApproved ? approvedDetails : [],
        budgetedDepartmentMonths,
      }
    );
    const responseData = {
      production: productionRows,
      nonProduction: nonProductionRows,
      reportStartDate: startDate || '',
      reportEndDate: endDate || '',
    };

    if (shouldIncludeApproved) {
      responseData.approvedExpenses = approvedItems;
      responseData.approvedExpenseDetails = reportApprovedDetails;
    }

    res.json({
      success: true,
      data: responseData,
      warnings,
    });
  } catch (error) {
    console.error('[ERROR] Report data error:', error);
    res.status(500).json({ success: false, message: isProduction ? '查询失败' : error.message });
  }
});

export {
  approvalExpenseDateExpr,
  applyExpenseDetailReportingOverlay,
  attachExpenseAmounts,
  buildBudgetWhere,
  buildBudgetedDepartmentMonthSet,
  filterExpenseDetailsForReport,
  isChinaExecutionRegion,
  reportingDepartmentKey,
  shouldIncludeDepartmentExpense,
  summarizeApprovedDetails,
};

export default router;
