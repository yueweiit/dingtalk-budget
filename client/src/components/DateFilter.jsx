import React from 'react';
import dayjs from 'dayjs';

const styles = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'flex-end',
    padding: '16px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    marginBottom: '16px',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  field: {
    display: 'grid',
    gap: '6px',
    minWidth: '180px',
  },
  label: {
    fontSize: '13px',
    color: '#4b5563',
  },
  input: {
    height: '36px',
    padding: '0 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#111827',
    background: '#fff',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  button: {
    height: '36px',
    padding: '0 16px',
    borderRadius: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  primaryButton: {
    border: '1px solid #2563eb',
    background: '#2563eb',
    color: '#fff',
  },
  defaultButton: {
    background: '#fff',
    border: '1px solid #d1d5db',
    color: '#374151',
  },
};

export default function DateFilter({ startDate, endDate, onStartDateChange, onEndDateChange, onSearch }) {
  const sourceDate = startDate || endDate;
  const selectedMonth = sourceDate && dayjs(sourceDate).isValid()
    ? dayjs(sourceDate).format('YYYY-MM')
    : '';

  const setMonthRange = (month) => {
    if (!month) {
      onStartDateChange('');
      onEndDateChange('');
      return;
    }

    const date = dayjs(`${month}-01`);
    onStartDateChange(date.startOf('month').format('YYYY-MM-DD'));
    onEndDateChange(date.endOf('month').format('YYYY-MM-DD'));
  };

  const handleReset = () => {
    setMonthRange(dayjs().format('YYYY-MM'));
    onSearch();
  };

  return (
    <div style={styles.container}>
      <label style={styles.field}>
        <span style={styles.label}>预算月份</span>
        <input
          type="month"
          style={styles.input}
          value={selectedMonth}
          onChange={(event) => setMonthRange(event.target.value)}
        />
      </label>
      <div style={styles.actions}>
        <button style={{ ...styles.button, ...styles.primaryButton }} onClick={onSearch}>
          查询
        </button>
        <button style={{ ...styles.button, ...styles.defaultButton }} onClick={handleReset}>
          重置
        </button>
      </div>
    </div>
  );
}
