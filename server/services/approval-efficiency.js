export const APPROVAL_TIMEOUT_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(value) {
  return asDate(value)?.toISOString() || null;
}

function durationHours(start, end) {
  const startDate = asDate(start);
  const endDate = asDate(end);
  if (!startDate || !endDate || endDate < startDate) return null;
  return Number(((endDate - startDate) / HOUR_MS).toFixed(2));
}

function average(values) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export function buildApprovalEfficiency({ instances = [], tasks = [], now = new Date() }) {
  const nowDate = asDate(now) || new Date();
  const instanceMap = new Map(instances.map((row) => [row.process_instance_id, row]));
  const measuredInstances = instances.map((row) => {
    const elapsedHours = durationHours(row.create_time, row.finish_time || nowDate);
    return {
      ...row,
      elapsedHours,
      overdue: elapsedHours !== null && elapsedHours > APPROVAL_TIMEOUT_HOURS,
    };
  });
  const completedDurations = measuredInstances
    .filter((row) => row.finish_time && row.elapsedHours !== null)
    .map((row) => row.elapsedHours);
  const measurable = measuredInstances.filter((row) => row.elapsedHours !== null);
  const overdueInstances = measurable.filter((row) => row.overdue).length;

  const taskDetails = tasks.map((task) => {
    const instance = instanceMap.get(task.process_instance_id) || {};
    const elapsedHours = durationHours(task.start_time, task.end_time || nowDate);
    return {
      processInstanceId: task.process_instance_id,
      processCode: instance.process_code || task.process_code || '',
      title: instance.title || task.title || '',
      taskId: task.task_id,
      nodeName: task.node_name || '',
      approverUserId: task.approver_user_id || '',
      approverUserName: task.approver_user_name || '',
      status: task.status || '',
      startTime: iso(task.start_time),
      endTime: iso(task.end_time),
      durationHours: elapsedHours,
      overdue: elapsedHours !== null && elapsedHours > APPROVAL_TIMEOUT_HOURS,
    };
  });
  const measuredTasks = taskDetails.filter((row) => row.durationHours !== null);
  const overdueTasks = measuredTasks.filter((row) => row.overdue).length;

  const processMap = new Map();
  for (const row of measuredInstances) {
    const key = row.process_code || 'unknown';
    const current = processMap.get(key) || {
      processCode: key,
      processName: row.process_name || key,
      totalInstances: 0,
      completedInstances: 0,
      runningInstances: 0,
      overdueInstances: 0,
      completionHours: [],
    };
    current.totalInstances += 1;
    if (row.finish_time) {
      current.completedInstances += 1;
      if (row.elapsedHours !== null) current.completionHours.push(row.elapsedHours);
    } else {
      current.runningInstances += 1;
    }
    if (row.overdue) current.overdueInstances += 1;
    processMap.set(key, current);
  }
  for (const task of taskDetails) {
    const key = task.processCode || 'unknown';
    const current = processMap.get(key);
    if (!current) continue;
    current.taskCount = (current.taskCount || 0) + (task.durationHours === null ? 0 : 1);
    current.overdueTasks = (current.overdueTasks || 0) + (task.overdue ? 1 : 0);
    if (task.durationHours !== null) {
      current.taskHours = current.taskHours || [];
      current.taskHours.push(task.durationHours);
    }
  }

  return {
    timeoutHours: APPROVAL_TIMEOUT_HOURS,
    summary: {
      totalInstances: instances.length,
      measuredInstances: measurable.length,
      completedInstances: measuredInstances.filter((row) => Boolean(row.finish_time)).length,
      runningInstances: measuredInstances.filter((row) => !row.finish_time).length,
      overdueInstances,
      overdueRate: measurable.length ? Number(((overdueInstances / measurable.length) * 100).toFixed(2)) : 0,
      averageCompletionHours: average(completedDurations),
      measuredTasks: measuredTasks.length,
      overdueTasks,
      taskOverdueRate: measuredTasks.length ? Number(((overdueTasks / measuredTasks.length) * 100).toFixed(2)) : 0,
      averageTaskHours: average(measuredTasks.map((row) => row.durationHours)),
    },
    byProcess: [...processMap.values()].map(({ completionHours, taskHours = [], ...row }) => ({
      ...row,
      overdueRate: row.totalInstances ? Number(((row.overdueInstances / row.totalInstances) * 100).toFixed(2)) : 0,
      averageCompletionHours: average(completionHours),
      averageTaskHours: average(taskHours),
      taskOverdueRate: row.taskCount ? Number((((row.overdueTasks || 0) / row.taskCount) * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.totalInstances - a.totalInstances),
    taskDetails,
  };
}

export async function fetchApprovalEfficiency(client, { startDate, endDate } = {}) {
  const params = [startDate || null, endDate || null];
  const instanceResult = await client.query(
    `SELECT i.process_instance_id, i.process_code, p.name AS process_name,
            i.title, i.status, i.result, i.create_time, i.finish_time
       FROM ding_approval_instance i
       JOIN ding_process_template p
         ON p.corp_id = i.corp_id AND p.process_code = i.process_code
      WHERE i.deleted_at IS NULL
        AND p.enabled = true
        AND p.is_deleted = false
        AND ($1::date IS NULL OR i.create_time >= $1::date)
        AND ($2::date IS NULL OR i.create_time < $2::date + INTERVAL '1 day')
      ORDER BY i.create_time DESC`,
    params,
  );
  const taskResult = await client.query(
    `SELECT t.process_instance_id, t.task_id,
            COALESCE(NULLIF(t.node_name, ''), NULLIF(t.raw_payload->>'taskGroupName', '')) AS node_name,
            t.status, t.approver_user_id,
            CASE
              WHEN t.approver_user_id = 'bpms_system' THEN '系统自动处理'
              ELSE COALESCE(NULLIF(t.approver_user_name, ''), NULLIF(t.raw_payload->>'userName', ''), u.name)
            END AS approver_user_name,
            t.start_time, t.end_time
       FROM ding_approval_task t
       JOIN ding_approval_instance i
         ON i.corp_id = t.corp_id AND i.process_instance_id = t.process_instance_id
       JOIN ding_process_template p
         ON p.corp_id = i.corp_id AND p.process_code = i.process_code
       LEFT JOIN LATERAL (
         SELECT snapshot.name
           FROM ding_user_snapshot snapshot
          WHERE snapshot.corp_id = t.corp_id
            AND snapshot.user_id = t.approver_user_id
            AND NULLIF(snapshot.name, '') IS NOT NULL
          ORDER BY snapshot.is_current DESC, snapshot.valid_from DESC NULLS LAST, snapshot.id DESC
          LIMIT 1
       ) u ON true
      WHERE i.deleted_at IS NULL
        AND p.enabled = true
        AND p.is_deleted = false
        AND ($1::date IS NULL OR i.create_time >= $1::date)
        AND ($2::date IS NULL OR i.create_time < $2::date + INTERVAL '1 day')
      ORDER BY i.create_time DESC, t.task_order NULLS LAST, t.start_time`,
    params,
  );
  return buildApprovalEfficiency({ instances: instanceResult.rows, tasks: taskResult.rows });
}
