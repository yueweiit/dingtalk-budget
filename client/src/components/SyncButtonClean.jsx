import React, { useState } from 'react';
import { syncData } from '../api';

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
    borderColor: '#059669',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
    background: '#059669',
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

export default function SyncButtonClean({ startDate, endDate, onSyncComplete }) {
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
      const result = await syncData(
        toDayStartTimestamp(startDate),
        toDayEndTimestamp(endDate),
      );
      setLastSync(new Date());
      setMessage(result.message || '同步完成');
      if (onSyncComplete) onSyncComplete(result);
    } catch (error) {
      setIsError(true);
      setMessage(`同步失败: ${error.response?.data?.message || error.message || '未知错误'}`);
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
        {loading ? '同步中...' : '同步钉钉数据'}
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
