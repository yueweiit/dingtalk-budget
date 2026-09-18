import express from 'express';
import crypto from 'node:crypto';
import { query } from '../db/index.js';
import { buildConnectorDepartmentFilter } from '../services/connector-department-query.js';
import { sharedBudgetRollupDepartment } from '../services/yw-tech-shared-budget.js';
import {
  attachExpenseAmounts,
  buildBudgetedDepartmentMonthSet,
} from './list.js';
import { assertValidTable } from '../utils/db.js';
import { buildDepartmentScopeSql } from '../services/auth.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

// 转换日期格式 20260401 -> 2026-04-01
function convertDateFormat(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
  if (datePart.includes('-')) return datePart;
  if (datePart.length === 8) {
    return `${datePart.substring(0, 4)}-${datePart.substring(4, 6)}-${datePart.substring(6, 8)}`;
  }
  return datePart;
}

function getMonthRange(dateStr) {
  const normalized = convertDateFormat(dateStr);
  if (!normalized) return null;

  const [year, month] = normalized.split('-').map(Number);
  if (!year || !month) return null;

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonthStart = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`;

  return { monthStart, nextMonthStart };
}

function getBudgetMonth(dateStr) {
  const range = getMonthRange(dateStr);
  return range?.monthStart?.slice(0, 7) || '';
}

const SHANGHAI_TZ = 'Asia/Shanghai';

function getTodayYmdInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function budgetMonthDateSql() {
  return `COALESCE(
    to_date(NULLIF(budget_month::text, ''), 'YYYY-MM'),
    to_date(NULLIF(declaration_month::text, ''), 'YYYY-MM'),
    (((create_time AT TIME ZONE 'UTC') AT TIME ZONE '${SHANGHAI_TZ}')::date)
  )`;
}

export function resolveTableName(type) {
  if (!type) return null;

  let rawValues = Array.isArray(type) ? type : [type];
  if (typeof type === 'string' && type.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(type);
      if (Array.isArray(parsed)) rawValues = parsed;
    } catch {
      // Keep the original value when a connector sends non-JSON text.
    }
  }

  const typeValues = rawValues
    .map((value) => String(value).toLowerCase().trim());
  const typeLower = typeValues.join(' ');

  // 先判断“非生产”，避免“生产”关键字被误命中
  if (
    typeValues.includes('option_1') ||
    typeLower.includes('non-production') ||
    typeLower.includes('非生产') ||
    typeLower.includes('no producción') ||
    typeLower.includes('no produccion')
  ) {
    return 'non_production_budget';
  }

  if (
    typeValues.includes('option_2') ||
    typeLower.includes('production') ||
    typeLower.includes('生产') ||
    typeLower.includes('producción') ||
    typeLower.includes('produccion')
  ) {
    return 'production_budget';
  }

  return 'production_budget';
}

export async function resolveConnectorBudgetDepartment(queryParams, month) {
  const departmentFilter = buildConnectorDepartmentFilter(queryParams, 1);
  if (!departmentFilter) {
    return { status: 'missing_department' };
  }

  if (departmentFilter.mode === 'id') {
    const departmentId = departmentFilter.params[0];
    const sharedBudgetDepartment = sharedBudgetRollupDepartment({ dept_id: departmentId }, month);
    return {
      status: 'ready',
      departmentId: sharedBudgetDepartment?.department_id || departmentId,
    };
  }

  return {
    status: 'ready',
    departmentId: '',
    legacyFilter: departmentFilter,
  };
}

function normalizeAlertMonth(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (!match) return '';
  const month = Number(match[2]);
  if (month < 1 || month > 12) return '';
  return `${match[1]}-${String(month).padStart(2, '0')}`;
}

function nonNegativeAmount(value) {
  const amount = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function internalAlertKeyMatches(receivedKey, configuredKey) {
  const received = String(receivedKey || '');
  const configured = String(configuredKey || '').trim();
  if (!received || !configured) return false;
  const receivedBuffer = Buffer.from(received);
  const configuredBuffer = Buffer.from(configured);
  return receivedBuffer.length === configuredBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, configuredBuffer);
}

export function calculateBudgetAlertSnapshot({ budgetAmount, usedAmount, applicationAmount }) {
  const budget = nonNegativeAmount(budgetAmount);
  const used = nonNegativeAmount(usedAmount);
  const application = nonNegativeAmount(applicationAmount);
  if (budget === null || used === null || application === null) {
    throw new Error('预算快照金额必须是非负数字');
  }

  const projectedAmount = Number((used + application).toFixed(2));
  const utilizationRate = budget > 0 ? Number((projectedAmount / budget).toFixed(6)) : null;
  const alertLevel = budget <= 0
    ? 'missing_budget'
    : projectedAmount > budget
      ? 'over_budget'
      : projectedAmount >= budget * 0.9
        ? 'warning_90'
        : 'normal';

  return {
    budgetAmount: Number(budget.toFixed(2)),
    usedAmount: Number(used.toFixed(2)),
    applicationAmount: Number(application.toFixed(2)),
    projectedAmount,
    utilizationRate,
    alertLevel,
  };
}

export async function findAlertBudgetRow({ departmentId, month, type }, dbQuery = query) {
  const normalizedMonth = normalizeAlertMonth(month);
  const rawDepartmentId = String(departmentId || '').trim();
  if (!rawDepartmentId || !normalizedMonth) return null;

  const tableName = resolveTableName(type);
  const sharedBudgetDepartment = sharedBudgetRollupDepartment({ dept_id: rawDepartmentId }, normalizedMonth);
  const resolvedDepartmentId = sharedBudgetDepartment?.department_id || rawDepartmentId;
  const amountColumn = tableName === 'production_budget' ? 'monthly_budget_amount' : 'budget_amount';
  const result = await dbQuery(
    `SELECT *, COALESCE(${amountColumn}, 0) AS alert_budget_amount
     FROM ${tableName}
     WHERE BTRIM(COALESCE(dept_id::text, '')) = $1
       AND COALESCE(NULLIF(budget_month, ''), NULLIF(declaration_month, '')) = $2
     ORDER BY create_time DESC NULLS LAST, id DESC
     LIMIT 1`,
    [resolvedDepartmentId, normalizedMonth]
  );
  const row = result.rows[0];
  return row ? {
    row,
    tableName,
    month: normalizedMonth,
    departmentId: resolvedDepartmentId,
  } : null;
}

export async function resolveAlertBudgetSnapshot(input, dependencies = {}) {
  const findBudget = dependencies.findBudget || findAlertBudgetRow;
  const attachExpenses = dependencies.attachExpenses || attachExpenseAmounts;
  const budget = await findBudget(input);
  const applicationAmount = nonNegativeAmount(input.applicationAmount);
  if (applicationAmount === null) throw new Error('申请金额必须是非负数字');
  if (!budget) {
    return {
      month: normalizeAlertMonth(input.month),
      departmentId: String(input.departmentId || '').trim(),
      alertLevel: 'missing_budget',
      budgetAmount: 0,
      usedAmount: 0,
      applicationAmount,
      projectedAmount: applicationAmount,
      utilizationRate: null,
    };
  }

  const [withExpenses] = await attachExpenses([budget.row], {
    startDate: budget.month,
    endDate: budget.month,
    budgetedDepartmentMonths: buildBudgetedDepartmentMonthSet([budget.row]),
  });
  return {
    departmentId: budget.departmentId,
    month: budget.month,
    budgetTable: budget.tableName,
    ...calculateBudgetAlertSnapshot({
      budgetAmount: budget.row.alert_budget_amount,
      usedAmount: withExpenses?.approved_amount || 0,
      applicationAmount,
    }),
  };
}

// GET /api/dingtalk/querySimple - 钉钉专用简化接口
router.get('/querySimple', async (req, res) => {
  try {
    const { startDate, endDate, type, formNo } = req.query;
    const timeLike =
      startDate
      || endDate
      || req.query.time
      || req.query.month
      || req.query.date
      || req.query['时间']
      || req.query['申请日期'];
    const referenceDate = timeLike || getTodayYmdInTimeZone(SHANGHAI_TZ);
    const queryMonth = getBudgetMonth(referenceDate);

    const tableName = resolveTableName(type || req.query['\u751f\u4ea7/\u975e\u751f\u4ea7']);

    console.info('[connector] budget type resolved', {
      type,
      chineseType: req.query['\u751f\u4ea7/\u975e\u751f\u4ea7'] || '',
      tableName,
    });

    if (!tableName) {
      return res.json({ budgetAmount: '0' });
    }

    assertValidTable(tableName);

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // 如果提供了formNo，优先按formNo查询
    if (formNo) {
      whereClause = `WHERE form_no = $${paramIndex}`;
      params.push(formNo);
      paramIndex++;
    } else {
      const resolvedDepartment = await resolveConnectorBudgetDepartment(req.query, queryMonth);
      if (resolvedDepartment.status !== 'ready') {
        console.warn('[connector] department resolution failed', {
          queryKeys: Object.keys(req.query),
          department: req.query.department || req.query.deptName || req.query['\u90e8\u95e8'] || '',
          resolution: resolvedDepartment.status,
        });
        // DingTalk invokes the connector while dependent form values are still settling.
        // Return a safe zero value instead of surfacing the transient state as an error.
        return res.json({ budgetAmount: '0' });
      }

      // 优先按连接器传入的部门 ID 精确查询；没有 ID 时按完整部门名称精确兜底。
      const departmentFilter = resolvedDepartment.departmentId
        ? buildConnectorDepartmentFilter({ departmentId: resolvedDepartment.departmentId }, paramIndex)
        : resolvedDepartment.legacyFilter;
      if (departmentFilter) {
        whereClause += ` AND ${departmentFilter.condition}`;
        params.push(...departmentFilter.params);
        paramIndex = departmentFilter.nextParamIndex;
      }

      // 未传任何日期时，按「上海时区今天」所在自然月过滤，避免一直命中历史最新一条
      const monthRange = getMonthRange(referenceDate);
      if (monthRange) {
        const monthDate = budgetMonthDateSql();
        whereClause += ` AND ${monthDate} >= $${paramIndex}::date AND ${monthDate} < $${paramIndex + 1}::date`;
        params.push(monthRange.monthStart, monthRange.nextMonthStart);
        paramIndex += 2;
      } else if (startDate && endDate) {
        const monthDate = budgetMonthDateSql();
        whereClause += ` AND ${monthDate} >= $${paramIndex}::date AND ${monthDate} <= $${paramIndex + 1}::date`;
        params.push(convertDateFormat(startDate), convertDateFormat(endDate));
        paramIndex += 2;
      } else if (startDate) {
        whereClause += ` AND ${budgetMonthDateSql()} >= $${paramIndex}::date`;
        params.push(convertDateFormat(startDate));
        paramIndex++;
      } else if (endDate) {
        whereClause += ` AND ${budgetMonthDateSql()} <= $${paramIndex}::date`;
        params.push(convertDateFormat(endDate));
        paramIndex++;
      }
    }

    const departmentScope = buildDepartmentScopeSql('b', req.authUser, paramIndex);
    whereClause += ` AND ${departmentScope.condition}`;
    params.push(...departmentScope.params);

    const result = await query(
      `SELECT * FROM ${tableName} b ${whereClause} ORDER BY b.create_time DESC LIMIT 1`,
      params
    );

    if (result.rows.length === 0) {
      return res.json({ budgetAmount: '0' });
    }

    const targetData = result.rows[0];

    const isProductionBudget = tableName === 'production_budget';

    // 只返回本月预算金额
    const budgetAmount = isProductionBudget
      ? (targetData.monthly_budget_amount || 0)
      : (targetData.budget_amount || 0);
    res.json({ budgetAmount: String(budgetAmount) });

  } catch (error) {
    console.error('[ERROR] Query error:', error);
    res.status(500).json({ success: false, message: isProduction ? '查询失败' : '查询失败: ' + error.message });
  }
});

// Internal-only snapshot used by the OA alert service. It intentionally
// returns totals only, never approval or expense detail rows.
router.get('/alert-budget-snapshot', async (req, res) => {
  const configuredKey = process.env.BUDGET_ALERT_API_KEY;
  if (!configuredKey) {
    return res.status(503).json({ success: false, message: '预算预警接口未配置' });
  }
  if (!internalAlertKeyMatches(req.headers['x-budget-alert-key'], configuredKey)) {
    return res.status(401).json({ success: false, message: '未授权' });
  }

  try {
    const snapshot = await resolveAlertBudgetSnapshot({
      departmentId: req.query.departmentId || req.query.department_id,
      month: req.query.month || req.query.applicationDate,
      type: req.query.type || req.query.budgetType,
      applicationAmount: req.query.applicationAmount,
    });
    return res.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('[alert-budget-snapshot] 查询失败:', error);
    return res.status(400).json({
      success: false,
      message: isProduction ? '预算预警查询失败' : error.message,
    });
  }
});

// GET /api/dingtalk/query - 原接口（保留）
router.get('/query', async (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    const departmentFilter = buildConnectorDepartmentFilter(req.query, 1);

    if (!departmentFilter && !startDate && !endDate) {
      return res.status(400).json({
        success: false,
        message: '至少需要一个查询参数: deptName/departmentId, startDate, endDate',
      });
    }

    const tableName = assertValidTable(resolveTableName(type) || 'production_budget');

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (departmentFilter) {
      whereClause += ` AND ${departmentFilter.condition}`;
      params.push(...departmentFilter.params);
      paramIndex = departmentFilter.nextParamIndex;
    }

    const departmentScope = buildDepartmentScopeSql('b', req.authUser, paramIndex);
    whereClause += ` AND ${departmentScope.condition}`;
    params.push(...departmentScope.params);
    paramIndex = departmentScope.nextParamIndex;

    if (startDate) {
      whereClause += ` AND create_time >= $${paramIndex}`;
      params.push(convertDateFormat(startDate) + ' 00:00:00');
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND create_time <= $${paramIndex}`;
      params.push(convertDateFormat(endDate) + ' 23:59:59');
      paramIndex++;
    }

    const result = await query(
      `SELECT * FROM ${tableName} b ${whereClause} ORDER BY b.create_time DESC LIMIT 50`,
      params
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: '查询成功, 无数据',
        total: 0,
        data: null
      });
    }

    res.json({
      success: true,
      message: '查询成功',
      total: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    console.error('[ERROR] Query error:', error);
    res.status(500).json({ success: false, message: isProduction ? '查询失败' : '查询失败: ' + error.message });
  }
});

export default router;
