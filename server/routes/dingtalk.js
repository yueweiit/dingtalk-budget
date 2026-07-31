import express from 'express';
import { query } from '../db/index.js';
import { buildConnectorDepartmentFilter } from '../services/connector-department-query.js';
import { getOaDatabaseQuery } from '../services/department-tree.js';
import {
  getConnectorOriginator,
  resolveOriginatorDepartment,
} from '../services/connector-originator-department.js';
import { sharedBudgetRollupDepartment } from '../services/yw-tech-shared-budget.js';
import { assertValidTable } from '../utils/db.js';

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

function resolveTableName(type) {
  if (!type) return null;

  const typeLower = String(type).toLowerCase().trim();

  // 先判断“非生产”，避免“生产”关键字被误命中
  if (
    typeLower === 'option_1' ||
    typeLower.includes('non-production') ||
    typeLower.includes('非生产') ||
    typeLower.includes('no producción') ||
    typeLower.includes('no produccion')
  ) {
    return 'non_production_budget';
  }

  if (
    typeLower === 'option_2' ||
    typeLower.includes('production') ||
    typeLower.includes('生产') ||
    typeLower.includes('producción') ||
    typeLower.includes('produccion')
  ) {
    return 'production_budget';
  }

  return 'production_budget';
}

async function resolveConnectorBudgetDepartment(queryParams, month) {
  const initialFilter = buildConnectorDepartmentFilter(queryParams, 1);
  if (!initialFilter) {
    return {
      status: 'ready',
      departmentId: '',
      legacyFilter: initialFilter,
    };
  }

  if (initialFilter.mode === 'id') {
    const departmentId = initialFilter.params[0];
    const sharedBudgetDepartment = sharedBudgetRollupDepartment({ dept_id: departmentId }, month);
    return {
      status: 'ready',
      departmentId: sharedBudgetDepartment?.department_id || departmentId,
    };
  }

  const originator = getConnectorOriginator(queryParams);
  if (!originator.userId && !originator.name) {
    return { status: 'ready', departmentId: '', legacyFilter: initialFilter };
  }

  const resolution = await resolveOriginatorDepartment({
    originatorUserId: originator.userId,
    originatorName: originator.name,
    departmentName: initialFilter.params[0],
  }, getOaDatabaseQuery());

  if (resolution.status !== 'resolved') {
    return { status: resolution.status, resolution };
  }

  const sharedBudgetDepartment = sharedBudgetRollupDepartment(
    { dept_id: resolution.departmentId },
    month
  );
  return {
    status: 'ready',
    departmentId: sharedBudgetDepartment?.department_id || resolution.departmentId,
    resolution,
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
    } else {
      const resolvedDepartment = await resolveConnectorBudgetDepartment(req.query, queryMonth);
      if (resolvedDepartment.status !== 'ready') {
        console.warn('[connector] department resolution failed', {
          queryKeys: Object.keys(req.query),
          department: req.query.department || req.query.deptName || req.query['\u90e8\u95e8'] || '',
          originator: getConnectorOriginator(req.query),
          resolution: resolvedDepartment.status,
          candidateCount: resolvedDepartment.resolution?.status === 'ambiguous'
            ? resolvedDepartment.resolution.candidates.length
            : 0,
        });
        return res.status(422).json({
          success: false,
          message: resolvedDepartment.status === 'ambiguous'
            ? '部门归属不唯一，请配置提交人对应的部门'
            : '未找到提交人与部门的对应关系，请检查组织架构同步',
        });
      }

      // 连接器传入部门 ID 或能由提交人唯一解析时，按真实部门 ID 精确查询。
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

    const result = await query(
      `SELECT * FROM ${tableName} ${whereClause} ORDER BY create_time DESC LIMIT 1`,
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
      `SELECT * FROM ${tableName} ${whereClause} ORDER BY create_time DESC LIMIT 50`,
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
