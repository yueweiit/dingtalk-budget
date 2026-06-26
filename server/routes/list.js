import express from 'express';
import axios from 'axios';
import pg from 'pg';
import { query } from '../db/index.js';
import { retry, createCircuitBreaker } from '../utils/resilience.js';
import { assertValidTable } from '../utils/db.js';

const router = express.Router();
const { Client } = pg;
const isProduction = process.env.NODE_ENV === 'production';
const YUNYING_API_BASE = process.env.YUNYING_API_BASE || 'http://localhost:3002';
const YUNYING_TIMEOUT_MS = Number(process.env.YUNYING_TIMEOUT_MS || 15000);

const yunyingCircuit = createCircuitBreaker({ label: 'yunying-api', failureThreshold: 3, resetTimeoutMs: 60000 });

const columnCache = new Map();

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

function appendBudgetMonthRange(whereClause, params, paramIndex, startDate, endDate) {
  const startMonth = formatMonth(startDate);
  const endMonth = formatMonth(endDate);

  if (startMonth) {
    whereClause += ` AND ${budgetMonthExpr} >= $${paramIndex}`;
    params.push(startMonth);
    paramIndex++;
  }

  if (endMonth) {
    whereClause += ` AND ${budgetMonthExpr} <= $${paramIndex}`;
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

/** 部门名归一化用于跨系统匹配：去掉空格、统一大小写 */
function compactDept(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

/** 从已审批支出汇总构建查找表：key = compactDept__YYYY-MM → total */
function buildExpenseLookup(expenseItems) {
  const map = new Map();
  for (const item of expenseItems || []) {
    const deptKey = compactDept(item.department);
    const month = item.month;
    if (!deptKey || !month) continue;
    const key = `${deptKey}__${month}`;
    const existing = map.get(key) || 0;
    map.set(key, existing + Number(item.operationTotal || 0) + Number(item.purchaseTotal || 0));
  }
  return (deptName, budgetMonth) => {
    const val = map.get(`${compactDept(deptName)}__${budgetMonth}`);
    return val || 0;
  };
}

/** 按部门+月份获取已审批支出，并按预算占比分配到每条记录 */
async function attachExpenseAmounts(records, { startDate, endDate, approvedItems } = {}) {
  if (!records || records.length === 0) return records;

  // 获取已审批支出汇总
  let expenseLookup = () => 0;
  try {
    const items = Array.isArray(approvedItems)
      ? approvedItems
      : (await fetchApprovedExpenseSummary({ startDate, endDate })).items;
    expenseLookup = buildExpenseLookup(items);
  } catch { /* 支出接口不可用时降级为 0 */ }

  // 按部门+月份分组，计算每组预算总额
  const groups = new Map(); // key: deptKey__month → { records, totalBudget }
  const budgetMonthFn = (row) => String(row.budget_month || row.declaration_month || '');

  for (const row of records) {
    const key = `${compactDept(row.dept_name)}__${budgetMonthFn(row)}`;
    const group = groups.get(key) || { records: [], totalBudget: 0 };
    group.records.push(row);
    group.totalBudget += Number(row.total_amount || row.budget_amount || row.monthly_budget_amount || 0);
    groups.set(key, group);
  }

  // 按预算占比分配支出到每条记录
  return records.map((row) => {
    const key = `${compactDept(row.dept_name)}__${budgetMonthFn(row)}`;
    const group = groups.get(key);
    const totalExpense = expenseLookup(row.dept_name, budgetMonthFn(row));

    let approvedAmount = 0;
    if (group && totalExpense > 0) {
      if (group.totalBudget > 0) {
        // 按预算占比分配
        const recordBudget = Number(row.total_amount || row.budget_amount || row.monthly_budget_amount || 0);
        approvedAmount = Number(((recordBudget / group.totalBudget) * totalExpense).toFixed(2));
      } else {
        // 预算全为0时均分
        approvedAmount = Number((totalExpense / group.records.length).toFixed(2));
      }
    }

    return { ...row, approved_amount: approvedAmount };
  });
}

function numberValue(value) {
  const number = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function approvedDetailMonth(item) {
  return formatMonth(firstNonEmpty(item.source_created_at, item.request_date, item.approval_completed_at));
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
    return excludedExpenseStatusKeywords.some((keyword) => text.includes(keyword));
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
  const splitColumns = ['salary_by_department', 'social_insurance_by_department', 'office_space_by_department'];

  for (const col of splitColumns) {
    const data = item[col];
    if (!data || !Array.isArray(data)) continue;
    for (const entry of data) {
      const dept = normalizeDept(entry.department);
      const amt = numberValue(entry.amount);
      if (dept && amt > 0) {
        entries.push({ department: dept, amount: amt });
      }
    }
  }

  return entries;
}

function summarizeApprovedDetails(details) {
  const grouped = new Map();

  for (const item of details) {
    const month = item.query_month || approvedDetailMonth(item);
    if (!month) continue;

    const amount = numberValue(firstNonEmpty(item.base_currency_amount, item.amount, item.detail_summary_amount));

    if (item.expense_kind === 'purchase') {
      // 采购支出：不拆分，直接归申请人部门
      const department = normalizeDept(firstNonEmpty(
        item.department_resolved, item.applicant_department,
        item.creator_department, item.query_department
      ));
      if (!department) continue;
      const key = `${department}__${month}`;
      const current = grouped.get(key) || { department, month, operationTotal: 0, operationCount: 0, purchaseTotal: 0, purchaseCount: 0 };
      current.purchaseTotal += amount;
      current.purchaseCount += 1;
      grouped.set(key, current);
      continue;
    }

    // 运营支出：检查是否有部门拆分数据
    const splitEntries = extractDeptSplitEntries(item);
    if (splitEntries.length === 0) {
      // 无拆分：直接归申请人部门
      const department = normalizeDept(firstNonEmpty(
        item.department_resolved, item.applicant_department,
        item.creator_department, item.query_department
      ));
      if (!department) continue;
      const key = `${department}__${month}`;
      const current = grouped.get(key) || { department, month, operationTotal: 0, operationCount: 0, purchaseTotal: 0, purchaseCount: 0 };
      current.operationTotal += amount;
      current.operationCount += 1;
      grouped.set(key, current);
      continue;
    }

    // 有拆分：按各部门占比分配 base_currency_amount
    const splitTotal = splitEntries.reduce((sum, e) => sum + e.amount, 0);
    for (const entry of splitEntries) {
      if (splitTotal <= 0) break;
      const ratio = entry.amount / splitTotal;
      const splitAmount = amount * ratio;
      const key = `${entry.department}__${month}`;
      const current = grouped.get(key) || { department: entry.department, month, operationTotal: 0, operationCount: 0, purchaseTotal: 0, purchaseCount: 0 };
      current.operationTotal += splitAmount;
      current.operationCount += ratio;
      grouped.set(key, current);
    }
  }

  return [...grouped.values()];
}

async function fetchApprovedExpenseSummary(dateRange) {
  const warnings = [];
  const detailMap = new Map();
  const params = {
    debug: 1,
    ...(dateRange.startDate ? { start_date: dateRange.startDate } : {}),
    ...(dateRange.endDate ? { end_date: dateRange.endDate } : {}),
  };

  try {
    const [operation, purchase] = await yunyingCircuit.execute(() =>
      retry(() => Promise.all([
        axios.get(`${YUNYING_API_BASE}/api/approvals/approved/operation/all`, { params, timeout: YUNYING_TIMEOUT_MS }),
        axios.get(`${YUNYING_API_BASE}/api/approvals/approved/purchase/all`, { params, timeout: YUNYING_TIMEOUT_MS }),
      ]), { label: 'yunying-approved' })
    );

    const operationItems = (Array.isArray(operation.data?.items) ? operation.data.items : [])
;
    const purchaseItems = (Array.isArray(purchase.data?.items) ? purchase.data.items : [])
      ;

    for (const item of operationItems.filter(isApprovedExpense)) {
      const queryMonth = approvedDetailMonth(item);
      const key = `operation__${item.business_id || ''}__${item.process_instance_id || ''}__${queryMonth}`;
      detailMap.set(key, { ...item, expense_kind: 'operation', query_month: queryMonth });
    }

    for (const item of purchaseItems.filter(isApprovedExpense)) {
      const queryMonth = approvedDetailMonth(item);
      const key = `purchase__${item.business_id || ''}__${item.process_instance_id || ''}__${queryMonth}`;
      detailMap.set(key, { ...item, expense_kind: 'purchase', query_month: queryMonth });
    }
  } catch (error) {
    warnings.push(isProduction ? '支出接口不可用' : `支出接口不可用：${error.message}`);
  }

  const details = [...detailMap.values()];
  return { items: summarizeApprovedDetails(details), details, warnings };
}

// GET /api/list/production - 获取生产预算列表
router.get('/production', async (req, res) => {
  try {
    const { startDate, endDate, status, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    ({ whereClause, paramIndex } = appendBudgetMonthRange(whereClause, params, paramIndex, startDate, endDate));

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const selectList = await buildSelectList('production_budget', [
      { name: 'id', type: 'integer' },
      { name: 'form_no' },
      { name: 'process_instance_id' },
      { name: 'dept_name' },
      { name: 'budget_type' },
      { name: 'declaration_month' },
      { name: 'budget_month' },
      { name: 'application_date' },
      { name: 'execution_region' },
      { name: 'monthly_budget_amount', type: 'numeric' },
      { name: 'total_amount', type: 'numeric' },
      { name: 'creator_name' },
      { name: 'creator_userid' },
      { name: 'create_time', type: 'timestamp' },
      { name: 'status' },
      { name: 'remark' },
    ]);

    // 查询数据
    const dataQuery = `
      SELECT ${selectList}
      FROM production_budget
      ${whereClause}
      ORDER BY create_time DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(pageSize, offset);

    const dataResult = await query(dataQuery, params);

    // 查询总数
    const countQuery = `SELECT COUNT(*) FROM production_budget ${whereClause}`;
    const countResult = await query(countQuery, params.slice(0, -2));

    // 按部门+月份分配已审批支出到每条记录
    const rowsWithExpense = await attachExpenseAmounts(dataResult.rows, { startDate, endDate });

    res.json({
      success: true,
      data: rowsWithExpense,
      total: parseInt(countResult.rows[0].count),
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

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    ({ whereClause, paramIndex } = appendBudgetMonthRange(whereClause, params, paramIndex, startDate, endDate));

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const selectList = await buildSelectList('non_production_budget', [
      { name: 'id', type: 'integer' },
      { name: 'form_no' },
      { name: 'process_instance_id' },
      { name: 'dept_name' },
      { name: 'budget_type' },
      { name: 'declaration_month' },
      { name: 'budget_month' },
      { name: 'application_date' },
      { name: 'execution_region' },
      { name: 'creator_name' },
      { name: 'creator_userid' },
      { name: 'create_time', type: 'timestamp' },
      { name: 'status' },
      { name: 'budget_amount', type: 'numeric' },
      { name: 'total_amount', type: 'numeric' },
      { name: 'remark' },
    ]);

    const dataQuery = `
      SELECT ${selectList}
      FROM non_production_budget
      ${whereClause}
      ORDER BY create_time DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(pageSize, offset);

    const dataResult = await query(dataQuery, params);

    const countQuery = `SELECT COUNT(*) FROM non_production_budget ${whereClause}`;
    const countResult = await query(countQuery, params.slice(0, -2));

    // 按部门+月份分配已审批支出到每条记录
    const rowsWithExpense = await attachExpenseAmounts(dataResult.rows, { startDate, endDate });

    res.json({
      success: true,
      data: rowsWithExpense,
      total: parseInt(countResult.rows[0].count),
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

    const statsResult = await query(`
      SELECT
        (SELECT COUNT(*) FROM production_budget WHERE DATE(create_time) = $1) as production_today,
        (SELECT COUNT(*) FROM non_production_budget WHERE DATE(create_time) = $1) as non_production_today,
        (SELECT COUNT(*) FROM production_budget) as production_total,
        (SELECT COUNT(*) FROM non_production_budget) as non_production_total
    `, [today]);

    res.json({
      success: true,
      data: statsResult.rows[0],
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
    const params = [];
    let whereClause = 'WHERE 1=1';
    let paramIndex = 1;

    if (startDate) {
      whereClause += ` AND ${budgetMonthExpr} >= $${paramIndex}`;
      params.push(formatMonth(startDate));
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND ${budgetMonthExpr} <= $${paramIndex}`;
      params.push(formatMonth(endDate));
      paramIndex++;
    }

    const exportClient = new Client({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 2000),
    });
    await exportClient.connect();

    let productionResult;
    let nonProductionResult;
    try {
      productionResult = await exportClient.query(`
        SELECT
          p.form_no, p.process_instance_id, p.dept_name, p.budget_type, p.declaration_month,
          p.budget_month, p.application_date, p.execution_region, p.monthly_budget_amount,
          p.total_amount, p.creator_name, p.creator_userid, p.create_time, p.status, p.remark,
          p.tenant_id,
          COALESCE((
            SELECT json_agg(row_to_json(x))
            FROM (
              SELECT * FROM budget_material WHERE form_no = p.form_no ORDER BY id
            ) x
          ), '[]'::json) AS material_items,
          COALESCE((
            SELECT json_agg(row_to_json(x))
            FROM (
              SELECT * FROM budget_production WHERE form_no = p.form_no ORDER BY id
            ) x
          ), '[]'::json) AS production_items,
          COALESCE((
            SELECT json_agg(row_to_json(x))
            FROM (
              SELECT * FROM budget_labor WHERE form_no = p.form_no ORDER BY id
            ) x
          ), '[]'::json) AS labor_items
        FROM production_budget p
        ${whereClause}
        ORDER BY p.create_time DESC
      `, params);

      nonProductionResult = await exportClient.query(`
        SELECT
          n.form_no, n.process_instance_id, n.dept_name, n.budget_type, n.declaration_month,
          n.budget_month, n.application_date, n.execution_region, n.creator_name, n.creator_userid,
          n.create_time, n.status, n.budget_amount, n.total_amount, n.remark, n.tenant_id,
          COALESCE((
            SELECT json_agg(row_to_json(x))
            FROM (
              SELECT * FROM budget_hr WHERE form_no = n.form_no ORDER BY id
            ) x
          ), '[]'::json) AS hr_items,
          COALESCE((
            SELECT json_agg(row_to_json(x))
            FROM (
              SELECT * FROM budget_office WHERE form_no = n.form_no ORDER BY id
            ) x
          ), '[]'::json) AS office_items,
          COALESCE((
            SELECT json_agg(row_to_json(x))
            FROM (
              SELECT * FROM budget_operation WHERE form_no = n.form_no ORDER BY id
            ) x
          ), '[]'::json) AS operation_items
        FROM non_production_budget n
        ${whereClause}
        ORDER BY n.create_time DESC
      `, params);
    } finally {
      await exportClient.end();
    }

    let warnings = [];
    let approvedItems = null;
    let approvedDetails = null;
    if (String(includeApproved || '') === '1') {
      const approved = await fetchApprovedExpenseSummary({ startDate, endDate });
      approvedItems = approved.items;
      approvedDetails = approved.details;
      warnings = approved.warnings;
    }

    const productionRows = await attachExpenseAmounts(
      productionResult.rows,
      { startDate, endDate, approvedItems }
    );
    const nonProductionRows = await attachExpenseAmounts(
      nonProductionResult.rows,
      { startDate, endDate, approvedItems }
    );

    const responseData = {
      production: productionRows,
      nonProduction: nonProductionRows,
      reportStartDate: startDate || '',
      reportEndDate: endDate || '',
    };

    if (approvedItems) {
      responseData.approvedExpenses = approvedItems;
      responseData.approvedExpenseDetails = approvedDetails;
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

export default router;
