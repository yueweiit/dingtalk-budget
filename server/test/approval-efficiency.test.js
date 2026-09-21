import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPROVAL_TIMEOUT_HOURS,
  buildApprovalEfficiency,
} from '../services/approval-efficiency.js';

test('审批效率按 24 小时标准汇总完成和进行中实例', () => {
  const result = buildApprovalEfficiency({
    instances: [
      { process_instance_id: 'done-fast', status: 'COMPLETED', create_time: '2026-09-01T00:00:00Z', finish_time: '2026-09-01T12:00:00Z' },
      { process_instance_id: 'done-slow', status: 'COMPLETED', create_time: '2026-09-01T00:00:00Z', finish_time: '2026-09-02T06:00:00Z' },
      { process_instance_id: 'running-slow', status: 'RUNNING', create_time: '2026-09-01T00:00:00Z', finish_time: null },
    ],
    tasks: [],
    now: new Date('2026-09-03T00:00:00Z'),
  });

  assert.equal(APPROVAL_TIMEOUT_HOURS, 24);
  assert.equal(result.summary.totalInstances, 3);
  assert.equal(result.summary.completedInstances, 2);
  assert.equal(result.summary.runningInstances, 1);
  assert.equal(result.summary.overdueInstances, 2);
  assert.equal(result.summary.overdueRate, 66.67);
  assert.equal(result.summary.averageCompletionHours, 21);
});

test('审批节点明细包含审批人、节点耗时和超时标记', () => {
  const result = buildApprovalEfficiency({
    instances: [{ process_instance_id: 'instance-1', title: '付款审批', process_code: 'PROC-1' }],
    tasks: [{
      process_instance_id: 'instance-1',
      task_id: 'task-1',
      node_name: '财务审批',
      approver_user_id: 'user-1',
      approver_user_name: '张三',
      status: 'COMPLETED',
      start_time: '2026-09-01T00:00:00Z',
      end_time: '2026-09-02T01:00:00Z',
    }],
    now: new Date('2026-09-03T00:00:00Z'),
  });

  assert.deepEqual(result.taskDetails[0], {
    processInstanceId: 'instance-1',
    processCode: 'PROC-1',
    title: '付款审批',
    taskId: 'task-1',
    nodeName: '财务审批',
    approverUserId: 'user-1',
    approverUserName: '张三',
    status: 'COMPLETED',
    startTime: '2026-09-01T00:00:00.000Z',
    endTime: '2026-09-02T01:00:00.000Z',
    durationHours: 25,
    overdue: true,
  });
  assert.equal(result.summary.overdueTasks, 1);
  assert.equal(result.summary.taskOverdueRate, 100);
});

test('缺少起始时间的实例和节点不参与耗时统计', () => {
  const result = buildApprovalEfficiency({
    instances: [{ process_instance_id: 'missing-time', status: 'RUNNING', create_time: null }],
    tasks: [{ process_instance_id: 'missing-time', task_id: 'task-1', start_time: null }],
    now: new Date('2026-09-03T00:00:00Z'),
  });

  assert.equal(result.summary.totalInstances, 1);
  assert.equal(result.summary.measuredInstances, 0);
  assert.equal(result.summary.overdueRate, 0);
  assert.equal(result.taskDetails[0].durationHours, null);
  assert.equal(result.taskDetails[0].overdue, false);
});
