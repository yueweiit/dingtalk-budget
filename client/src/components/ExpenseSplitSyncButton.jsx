import React, { useState } from 'react';
import { syncExpenseSplits } from '../api';

const styles = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  button: {
    height: '38px',
    padding: '0 16px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#2563eb',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    background: '#2563eb',
    color: '#fff',
  },
  disabledButton: {
    borderColor: '#9ca3af',
    background: '#9ca3af',
    cursor: 'not-allowed',
  },
  info: {
    fontSize: '12px',
    color: '#6b7280',
  },
  success: {
    color: '#059669',
  },
  error: {
    color: '#dc2626',
  },
};

function toDayStartTimestamp(date) {
  if (!date) return undefined;
  return new Date(`${date}T00:00:00`).getTime();
}

function toDayEndTimestamp(date) {
  if (!date) return undefined;
  return new Date(`${date}T23:59:59`).getTime();
}

function buildMessage(result) {
  const data = result?.data || result;
  if (!data) return result?.message || '支出拆分同步完成';

  const matched = Number(data.matched || 0);
  const written = Number(data.written || 0);
  const failed = Number(data.failed || 0);
  const splitCounts = data.splitCounts || {};
  const salary = Number(splitCounts.salary || 0);
  const insurance = Number(splitCounts.social_insurance || 0);
  const office = Number(splitCounts.office_space || 0);
  return `支出拆分同步完成：匹配 ${matched}，写入 ${written}，失败 ${failed}；工资 ${salary}，社保 ${insurance}，办公场地 ${office}`;
}

export default function ExpenseSplitSyncButton({ startDate, endDate, onSyncComplete }) {
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSync = async () => {
    if (loading) return;

    setLoading(true);
    setMessage('');
    setIsError(false);

    try {
      const result = await syncExpenseSplits(
        toDayStartTimestamp(startDate),
        toDayEndTimestamp(endDate)
      );
      setLastSync(new Date());
      setMessage(buildMessage(result));
      if (onSyncComplete) onSyncComplete(result);
    } catch (error) {
      setIsError(true);
      setMessage(`支出拆分同步失败：${error.response?.data?.message || error.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <button
        style={{
          ...styles.button,
          ...(loading ? styles.disabledButton : {}),
        }}
        onClick={handleSync}
        disabled={loading}
      >
        {loading ? '同步中...' : '同步支出拆分'}
      </button>
      {lastSync && (
        <span style={styles.info}>
          上次同步：{lastSync.toLocaleTimeString('zh-CN', { hour12: false })}
        </span>
      )}
      {message && (
        <span style={{ ...styles.info, ...(isError ? styles.error : styles.success) }}>
          {message}
        </span>
      )}
    </div>
  );
}
