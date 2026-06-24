import axios from 'axios';

const headers = {};
if (import.meta.env.VITE_API_KEY) {
  headers['X-API-Key'] = import.meta.env.VITE_API_KEY;
}

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers,
});

// 同步钉钉数据
export async function syncData(startTime, endTime) {
  const response = await api.post('/sync', { startTime, endTime }, { timeout: 180000 });
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
  const response = await api.get('/list/report', { params });
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
