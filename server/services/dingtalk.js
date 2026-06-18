import axios from 'axios';
import { dingtalkConfig } from '../config/dingtalk.js';
import { retry, createCircuitBreaker } from '../utils/resilience.js';

let accessToken = null;
let tokenExpireTime = 0;
const LIST_API_MODE = process.env.DINGTALK_LIST_API || 'old';
const REQUEST_DELAY_MS = Number(process.env.DINGTALK_REQUEST_DELAY_MS || 300);
const AXIOS_TIMEOUT_MS = Number(process.env.DINGTALK_TIMEOUT_MS || 15000);

const http = axios.create({ timeout: AXIOS_TIMEOUT_MS });

// Circuit breakers for DingTalk API groups
const tokenCircuit = createCircuitBreaker({ label: 'dingtalk-token', failureThreshold: 3, resetTimeoutMs: 30000 });
const listCircuit = createCircuitBreaker({ label: 'dingtalk-list', failureThreshold: 5, resetTimeoutMs: 60000 });
const detailCircuit = createCircuitBreaker({ label: 'dingtalk-detail', failureThreshold: 5, resetTimeoutMs: 60000 });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleDingtalkRequest() {
  if (Number.isFinite(REQUEST_DELAY_MS) && REQUEST_DELAY_MS > 0) {
    await sleep(REQUEST_DELAY_MS);
  }
}

function logDingtalkError(label, error) {
  const status = error.response?.status;
  const data = error.response?.data;
  console.error(`[ERROR] ${label}:`, error.message);
  if (status || data) {
    console.error(`[ERROR] ${label} response:`, JSON.stringify({ status, data }).substring(0, 1000));
  }
}

function snakeToCamel(key) {
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function normalizeKeys(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      snakeToCamel(key),
      normalizeKeys(entryValue),
    ])
  );
}

function normalizeOldProcessInstance(processInstance, processInstanceId) {
  const normalized = normalizeKeys(processInstance);
  if (!normalized.processInstanceId) {
    normalized.processInstanceId = processInstanceId;
  }
  return normalized;
}

export async function getAccessToken() {
  const now = Date.now();

  if (accessToken && now < tokenExpireTime) {
    return accessToken;
  }

  return tokenCircuit.execute(() =>
    retry(async () => {
      console.log('[DINGTALK] Token request - appKey:', dingtalkConfig.appKey ? dingtalkConfig.appKey.substring(0, 6) + '***' : 'UNDEFINED');
      const response = await http.get(
        `${dingtalkConfig.oapiUrl}${dingtalkConfig.getTokenUrl}`,
        {
          params: {
            appkey: dingtalkConfig.appKey,
            appsecret: dingtalkConfig.appSecret,
          },
        }
      );

      if (response.data && response.data.access_token) {
        accessToken = response.data.access_token;
        tokenExpireTime = now + (response.data.expires_in - 300) * 1000;
        console.log('[DINGTALK] Got access token successfully');
        return accessToken;
      }

      throw new Error('Failed to get access token: ' + JSON.stringify(response.data));
    }, { label: 'getAccessToken' })
  );
}

async function getProcessInstanceIdsByNewApi(token, startTime, endTime) {
  const allIds = [];
  let nextToken = 0;

  do {
    await throttleDingtalkRequest();
    const response = await http.post(
      `${dingtalkConfig.apiUrl}${dingtalkConfig.processInstanceIdsUrl}`,
      {
        processCode: dingtalkConfig.processCode,
        startTime,
        endTime,
        maxResults: 20,
        nextToken,
        statuses: ['COMPLETED'],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': token,
        },
      }
    );

    const result = response.data?.result;
    console.log('[DINGTALK] New list response:', {
      count: result?.list?.length || 0,
      nextToken: result?.nextToken || null,
      success: response.data?.success,
    });

    if (!result) break;

    allIds.push(...(result.list || []));
    nextToken = result.nextToken || null;
  } while (nextToken);

  return allIds;
}

async function getProcessInstanceIdsByOldApi(token, startTime, endTime) {
  const allIds = [];
  let cursor = 0;

  do {
    await throttleDingtalkRequest();
    const response = await http.post(
      `${dingtalkConfig.oapiUrl}${dingtalkConfig.oldProcessInstanceIdsUrl}`,
      {
        process_code: dingtalkConfig.processCode,
        start_time: startTime,
        end_time: endTime,
        size: 20,
        cursor,
      },
      {
        params: { access_token: token },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (response.data?.errcode && response.data.errcode !== 0) {
      throw new Error(`DingTalk old listids failed: ${JSON.stringify(response.data)}`);
    }

    const result = response.data?.result;
    console.log('[DINGTALK] Old list response:', {
      count: result?.list?.length || 0,
      nextCursor: result?.next_cursor || null,
      errcode: response.data?.errcode,
      errmsg: response.data?.errmsg,
    });

    if (!result) break;

    allIds.push(...(result.list || []));
    cursor = result.next_cursor || null;
  } while (cursor);

  return allIds;
}

export async function getProcessInstanceIds(startTime, endTime) {
  const token = await getAccessToken();
  const mergedIds = new Set();
  let newApiError = null;
  let oldApiError = null;

  if (LIST_API_MODE === 'new' || LIST_API_MODE === 'both') {
    try {
      const ids = await listCircuit.execute(() =>
        retry(() => getProcessInstanceIdsByNewApi(token, startTime, endTime), { label: 'listIds-new' })
      );
      ids.forEach((id) => mergedIds.add(id));
    } catch (error) {
      newApiError = error;
      logDingtalkError('getProcessInstanceIds new API', error);
    }
  }

  if (LIST_API_MODE === 'old' || LIST_API_MODE === 'both') {
    try {
      const ids = await listCircuit.execute(() =>
        retry(() => getProcessInstanceIdsByOldApi(token, startTime, endTime), { label: 'listIds-old' })
      );
      ids.forEach((id) => mergedIds.add(id));
    } catch (error) {
      oldApiError = error;
      logDingtalkError('getProcessInstanceIds old API', error);
    }
  }

  if (!['old', 'new', 'both'].includes(LIST_API_MODE)) {
    throw new Error(`Invalid DINGTALK_LIST_API mode: ${LIST_API_MODE}`);
  }

  if (mergedIds.size > 0) {
    console.log('[DINGTALK] Merged instance ids:', {
      count: mergedIds.size,
      newApiFailed: Boolean(newApiError),
      oldApiFailed: Boolean(oldApiError),
    });
    return [...mergedIds];
  }

  if (newApiError && oldApiError) {
    throw oldApiError;
  }

  return [];
}

async function getProcessInstanceDetailByNewApi(token, processInstanceId) {
  await throttleDingtalkRequest();
  const response = await http.get(
    `${dingtalkConfig.apiUrl}${dingtalkConfig.processInstanceGetUrl}`,
    {
      params: { processInstanceId },
      headers: {
        'x-acs-dingtalk-access-token': token,
      },
    }
  );

  const data = response.data?.result || response.data?.data;
  console.log('[DINGTALK] New detail response:', {
    processInstanceId,
    businessId: data?.businessId,
    status: data?.status,
    result: data?.result,
    finishTime: data?.finishTime,
  });

  if (response.data?.result) {
    return response.data.result;
  }
  if (response.data?.success && response.data?.data) {
    return response.data.data;
  }

  throw new Error('Failed to get process instance: ' + JSON.stringify(response.data));
}

async function getProcessInstanceDetailByOldApi(token, processInstanceId) {
  await throttleDingtalkRequest();
  const response = await http.post(
    `${dingtalkConfig.oapiUrl}${dingtalkConfig.oldProcessInstanceGetUrl}`,
    {
      process_instance_id: processInstanceId,
    },
    {
      params: { access_token: token },
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (response.data?.errcode && response.data.errcode !== 0) {
    throw new Error(`DingTalk old detail failed: ${JSON.stringify(response.data)}`);
  }

  const processInstance = response.data?.process_instance;
  console.log('[DINGTALK] Old detail response:', {
    processInstanceId,
    businessId: processInstance?.business_id,
    status: processInstance?.status,
    result: processInstance?.result,
    finishTime: processInstance?.finish_time,
  });

  if (processInstance) {
    return normalizeOldProcessInstance(processInstance, processInstanceId);
  }

  throw new Error('Failed to get old process instance: ' + JSON.stringify(response.data));
}

export async function getProcessInstanceDetail(processInstanceId) {
  const token = await getAccessToken();

  return detailCircuit.execute(() =>
    retry(async () => {
      try {
        const data = await getProcessInstanceDetailByNewApi(token, processInstanceId);
        if (!data.processInstanceId) {
          data.processInstanceId = processInstanceId;
        }
        return data;
      } catch (error) {
        logDingtalkError('getProcessInstanceDetail new API', error);
        console.warn('[WARN] Trying old DingTalk processinstance/get API fallback...');
        return await getProcessInstanceDetailByOldApi(token, processInstanceId);
      }
    }, { label: `detail-${processInstanceId}` })
  );
}
