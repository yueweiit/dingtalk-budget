import cron from 'node-cron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  refreshExistingBudgetStatuses,
  syncDingtalkData,
  syncDingtalkInstance,
} from '../routes/sync.js';

const DEFAULT_SYNC_CRON = '2 * * * *';
const SYNC_CRON = process.env.SYNC_CRON || DEFAULT_SYNC_CRON;
const SYNC_TIMEZONE = process.env.SYNC_TIMEZONE || 'Asia/Shanghai';
const INITIAL_LOOKBACK_MINUTES = Number(process.env.SYNC_INITIAL_LOOKBACK_MINUTES || 60);
const BACKFILL_ENABLED = process.env.SYNC_BACKFILL_ENABLED !== '0';
const BACKFILL_INTERVAL_MINUTES = Number(process.env.SYNC_BACKFILL_INTERVAL_MINUTES || 360);
const BACKFILL_LOOKBACK_DAYS = Number(process.env.SYNC_BACKFILL_LOOKBACK_DAYS || 3);
const PENDING_STATUS_REFRESH_ENABLED = process.env.SYNC_PENDING_STATUS_REFRESH_ENABLED !== '0';
const CONFIGURED_PENDING_STATUS_REFRESH_LIMIT = Number(process.env.SYNC_PENDING_STATUS_REFRESH_LIMIT || 200);
const PENDING_STATUS_REFRESH_LIMIT = Number.isFinite(CONFIGURED_PENDING_STATUS_REFRESH_LIMIT)
  && CONFIGURED_PENDING_STATUS_REFRESH_LIMIT > 0
  ? CONFIGURED_PENDING_STATUS_REFRESH_LIMIT
  : 200;

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = process.env.SYNC_STATE_FILE || join(__dirname, '..', 'data', 'sync-state.json');

const CRON_JOBS = [
  {
    name: 'budget-sync',
    expression: SYNC_CRON,
    label: process.env.SYNC_LABEL || `every run of ${SYNC_CRON}`,
  },
];

const scheduledTasks = [];
let isRunning = false;

function getInitialStartTime(endTime) {
  const safeMinutes = Number.isFinite(INITIAL_LOOKBACK_MINUTES) && INITIAL_LOOKBACK_MINUTES > 0
    ? INITIAL_LOOKBACK_MINUTES
    : 10;
  return endTime - safeMinutes * 60 * 1000;
}

function createEmptyState() {
  return {
    lastCompletedEndTime: null,
    lastBackfillEndTime: null,
    pendingInstances: {},
    lastRun: null,
  };
}

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return {
      ...createEmptyState(),
      ...JSON.parse(raw),
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createEmptyState();
    }
    throw error;
  }
}

async function saveState(state) {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function addPendingInstances(state, pendingInstances, seenAt) {
  for (const item of pendingInstances || []) {
    state.pendingInstances[item.processInstanceId] = {
      processInstanceId: item.processInstanceId,
      status: item.status || '',
      result: item.result || '',
      message: item.message || '',
      firstSeenAt: state.pendingInstances[item.processInstanceId]?.firstSeenAt || seenAt,
      lastSeenAt: seenAt,
    };
  }
}

async function recheckPendingInstances(state) {
  const pendingIds = Object.keys(state.pendingInstances || {});
  const summary = {
    checked: 0,
    inserted: 0,
    existing: 0,
    stillPending: 0,
    removed: 0,
  };

  for (const processInstanceId of pendingIds) {
    summary.checked++;
    const result = await syncDingtalkInstance(processInstanceId, { updateExisting: false });

    if (result.added || result.synced) {
      delete state.pendingInstances[processInstanceId];
      summary.inserted += result.added || 0;
      continue;
    }

    if (result.existing) {
      delete state.pendingInstances[processInstanceId];
      summary.existing += result.existing;
      continue;
    }

    if (result.pending) {
      state.pendingInstances[processInstanceId] = {
        ...state.pendingInstances[processInstanceId],
        status: result.status || '',
        result: result.result || '',
        message: result.message || '',
        lastSeenAt: new Date().toISOString(),
      };
      summary.stillPending++;
      continue;
    }

    delete state.pendingInstances[processInstanceId];
    summary.removed++;
  }

  return summary;
}

async function runIncrementalSync() {
  const state = await loadState();
  const endTime = Date.now();
  const startTime = state.lastCompletedEndTime || getInitialStartTime(endTime);
  const runStartedAt = new Date(endTime).toISOString();

  console.log(`[SCHEDULER] Incremental window: ${new Date(startTime).toISOString()} ~ ${runStartedAt}`);

  const pendingSummary = await recheckPendingInstances(state);
  const windowResult = await syncDingtalkData(startTime, endTime, { updateExisting: false });

  addPendingInstances(state, windowResult.pendingInstances, runStartedAt);
  let pendingStatusRefresh = null;
  if (PENDING_STATUS_REFRESH_ENABLED) {
    try {
      pendingStatusRefresh = await refreshExistingBudgetStatuses({
        startTime,
        endTime,
        limit: PENDING_STATUS_REFRESH_LIMIT,
        pendingOnly: true,
      });
    } catch (error) {
      pendingStatusRefresh = { failed: 1, message: error.message };
      console.error('[SCHEDULER] Pending budget status refresh failed:', error.message);
    }
  }

  let backfillResult = null;
  const safeBackfillInterval = Number.isFinite(BACKFILL_INTERVAL_MINUTES) && BACKFILL_INTERVAL_MINUTES > 0
    ? BACKFILL_INTERVAL_MINUTES
    : 360;
  const shouldBackfill =
    BACKFILL_ENABLED &&
    (!state.lastBackfillEndTime || endTime - state.lastBackfillEndTime >= safeBackfillInterval * 60 * 1000);

  if (shouldBackfill) {
    const safeBackfillDays = Number.isFinite(BACKFILL_LOOKBACK_DAYS) && BACKFILL_LOOKBACK_DAYS > 0
      ? BACKFILL_LOOKBACK_DAYS
      : 3;
    const backfillStartTime = endTime - safeBackfillDays * 24 * 60 * 60 * 1000;
    console.log(`[SCHEDULER] Backfill window: ${new Date(backfillStartTime).toISOString()} ~ ${runStartedAt}`);
    backfillResult = await syncDingtalkData(backfillStartTime, endTime, { updateExisting: false });
    addPendingInstances(state, backfillResult.pendingInstances, runStartedAt);
    state.lastBackfillEndTime = endTime;
  }

  state.lastCompletedEndTime = endTime;
  state.lastRun = {
    startedAt: runStartedAt,
    completedAt: new Date().toISOString(),
    window: {
      startTime,
      endTime,
      startIso: new Date(startTime).toISOString(),
      endIso: new Date(endTime).toISOString(),
    },
    pendingSummary,
    windowResult,
    pendingStatusRefresh,
    backfillResult,
  };

  await saveState(state);

  return {
    success: true,
    window: state.lastRun.window,
    pendingSummary,
    windowResult,
    pendingStatusRefresh,
    backfillResult,
    pendingCount: Object.keys(state.pendingInstances).length,
  };
}

export function startScheduler() {
  if (scheduledTasks.length > 0) {
    console.log('[SCHEDULER] Already running');
    return;
  }

  for (const job of CRON_JOBS) {
    const task = cron.schedule(job.expression, async () => {
      if (isRunning) {
        console.log('[SCHEDULER] Sync already in progress, skip this run');
        return;
      }

      const startedAt = new Date().toLocaleString('zh-CN', { timeZone: SYNC_TIMEZONE });
      console.log(`[SCHEDULER] Starting scheduled sync (${job.label}) at ${startedAt}`);
      isRunning = true;

      try {
        await runIncrementalSync();
      } catch (error) {
        console.error('[SCHEDULER] Scheduled sync failed:', error.message, error.stack);
      } finally {
        isRunning = false;
      }
    }, {
      timezone: SYNC_TIMEZONE,
    });

    scheduledTasks.push(task);
  }

  console.log(`[SCHEDULER] Started - cron=${SYNC_CRON}, timezone=${SYNC_TIMEZONE}, backfill=${BACKFILL_ENABLED}, backfillIntervalMinutes=${BACKFILL_INTERVAL_MINUTES}, backfillLookbackDays=${BACKFILL_LOOKBACK_DAYS}, pendingStatusRefresh=${PENDING_STATUS_REFRESH_ENABLED}, pendingStatusRefreshLimit=${PENDING_STATUS_REFRESH_LIMIT}, stateFile=${STATE_FILE}`);
}

export function stopScheduler() {
  if (scheduledTasks.length > 0) {
    for (const task of scheduledTasks) {
      task.stop();
    }
    scheduledTasks.length = 0;
    console.log('[SCHEDULER] Stopped');
  }
}

export async function getSchedulerStatus() {
  const state = await loadState();
  return {
    running: scheduledTasks.length > 0,
    cronExpressions: CRON_JOBS.map(j => j.expression),
    schedule: CRON_JOBS.map(j => j.label).join(', '),
    cronExpression: CRON_JOBS.map(j => j.expression).join(' | '),
    nextRun: scheduledTasks.length > 0 ? CRON_JOBS.map(j => j.label).join(', ') : null,
    timezone: SYNC_TIMEZONE,
    stateFile: STATE_FILE,
    lastCompletedEndTime: state.lastCompletedEndTime,
    lastCompletedEndIso: state.lastCompletedEndTime ? new Date(state.lastCompletedEndTime).toISOString() : null,
    lastBackfillEndTime: state.lastBackfillEndTime,
    lastBackfillEndIso: state.lastBackfillEndTime ? new Date(state.lastBackfillEndTime).toISOString() : null,
    backfill: {
      enabled: BACKFILL_ENABLED,
      intervalMinutes: BACKFILL_INTERVAL_MINUTES,
      lookbackDays: BACKFILL_LOOKBACK_DAYS,
    },
    pendingStatusRefresh: {
      enabled: PENDING_STATUS_REFRESH_ENABLED,
      limit: PENDING_STATUS_REFRESH_LIMIT,
    },
    pendingCount: Object.keys(state.pendingInstances || {}).length,
    lastRun: state.lastRun,
  };
}

export async function triggerManualSync() {
  if (isRunning) {
    throw new Error('Sync task is already running. Please try again later.');
  }

  isRunning = true;
  try {
    return await runIncrementalSync();
  } finally {
    isRunning = false;
  }
}
