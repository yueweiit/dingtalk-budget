import axios from 'axios';
import { mergeBudgetListRows, pageBudgetListRows } from '../utils/budgetList.js';

const headers = {};
if (import.meta.env.VITE_API_KEY) {
  headers['X-API-Key'] = import.meta.env.VITE_API_KEY;
}

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers,
  withCredentials: true,
});

export async function login(username, password) {
  const response = await api.post('/auth/login', { username, password });
  return response.data;
}

export async function getCurrentUser() {
  const response = await api.get('/auth/me');
  return response.data;
}

export async function logout() {
  const response = await api.post('/auth/logout');
  return response.data;
}

// 同步钉钉数据
export async function syncData(startTime, endTime, options = {}) {
  const response = await api.post('/sync', { startTime, endTime, ...options }, { timeout: 600000 });
  return response.data;
}

// 同步运营支出拆分数据（工资、社保、办公场地）
export async function syncExpenseSplits(startTime, endTime) {
  const response = await api.post('/sync/expense-splits', { startTime, endTime }, { timeout: 600000 });
  return response.data;
}

// 获取生产预算列表
export async function getProductionList(params) {
  const response = await api.get('/list/production', { params });
  return response.data;
}

// 获取非生产预算列表
export async function getNonProductionList(params) {
  const response = await api.get('/list/non-production', { params });
  return response.data;
}

export async function getAllBudgetList(params = {}) {
  try {
    const response = await api.get('/list/all', { params });
    return response.data;
  } catch (error) {
    if (error.response?.status !== 404) throw error;

    // Older budget servers do not have /list/all yet. Preserve the new UI by
    // combining the two established endpoints until the server is updated.
    const fallbackParams = { ...params, page: 1, pageSize: 100000 };
    const [production, nonProduction] = await Promise.all([
      getProductionList(fallbackParams),
      getNonProductionList(fallbackParams),
    ]);
    const rows = mergeBudgetListRows(production.data || [], nonProduction.data || []);
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 20;
    return {
      success: true,
      data: pageBudgetListRows(rows, page, pageSize),
      total: rows.length,
      page,
      pageSize,
      compatibilityFallback: true,
    };
  }
}

// 获取审批流程记录
export async function getApprovalList(params) {
  const response = await api.get('/list/approval', { params });
  return response.data;
}

// 获取统计数据
export async function getStats() {
  const response = await api.get('/list/stats');
  return response.data;
}

// 获取报表导出数据
export async function getReportData(params) {
  const response = await api.get('/list/report', { params, timeout: 180000 });
  return response.data;
}

// 获取定时任务状态
export async function getSchedulerStatus() {
  const response = await api.get('/config/scheduler');
  return response.data;
}

// 启动定时任务
export async function startScheduler() {
  const response = await api.post('/config/scheduler/start');
  return response.data;
}

// 停止定时任务
export async function stopScheduler() {
  const response = await api.post('/config/scheduler/stop');
  return response.data;
}

// 获取预算详情（包含明细）
export async function getBudgetDetail(formNo, type) {
  const response = await api.get('/dingtalk/querySimple', {
    params: { formNo, type, startDate: '20200101', endDate: '20301231' }
  });
  return response.data;
}
