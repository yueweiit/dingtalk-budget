import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import DateFilter from '../components/DateFilter';

import { getProductionList, getNonProductionList, getStats, getBudgetDetail, getReportData } from '../api';
import { createBudgetReportWorkbook, saveWorkbook } from '../utils/xlsxReport';

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f3f4f6',
    color: '#111827',
  },
  container: {
    padding: '24px',
    maxWidth: '1440px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '20px',
  },
  eyebrow: {
    margin: '0 0 6px',
    fontSize: '13px',
    color: '#6b7280',
  },
  title: {
    margin: 0,
    fontSize: '26px',
    fontWeight: 700,
    color: '#111827',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: '14px',
    color: '#6b7280',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  statCard: {
    background: '#fff',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  statValue: {
    fontSize: '26px',
    lineHeight: 1.1,
    fontWeight: 700,
    color: '#2563eb',
  },
  statLabel: {
    fontSize: '13px',
    color: '#6b7280',
    marginTop: '8px',
  },
  panel: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
  },
  tabList: {
    display: 'inline-flex',
    padding: '3px',
    background: '#f3f4f6',
    borderRadius: '8px',
  },
  tab: {
    minWidth: '112px',
    padding: '8px 12px',
    border: 0,
    borderRadius: '6px',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#4b5563',
  },
  activeTab: {
    background: '#fff',
    color: '#2563eb',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
  },
  exportButton: {
    height: '36px',
    padding: '0 16px',
    border: '1px solid #0f766e',
    borderRadius: '6px',
    background: '#0f766e',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    minWidth: '1120px',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px 14px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: '13px',
    color: '#374151',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '12px 14px',
    fontSize: '13px',
    color: '#374151',
    borderBottom: '1px solid #f3f4f6',
    whiteSpace: 'nowrap',
  },
  muted: {
    color: '#9ca3af',
  },
  status: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '24px',
    padding: '0 8px',
    borderRadius: '999px',
    fontSize: '12px',
    border: '1px solid #d1d5db',
    background: '#f9fafb',
    color: '#4b5563',
  },
  statusApproved: {
    background: '#ecfdf5',
    color: '#047857',
    borderColor: '#a7f3d0',
  },
  statusPending: {
    background: '#fffbeb',
    color: '#b45309',
    borderColor: '#fde68a',
  },
  statusRejected: {
    background: '#fef2f2',
    color: '#b91c1c',
    borderColor: '#fecaca',
  },
  detailButton: {
    height: '30px',
    padding: '0 10px',
    background: '#fff',
    color: '#2563eb',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  pagination: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '8px',
    padding: '14px 16px',
  },
  pageButton: {
    height: '32px',
    padding: '0 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#374151',
  },
  pageInfo: {
    fontSize: '13px',
    color: '#6b7280',
  },
  empty: {
    textAlign: 'center',
    padding: '56px 16px',
    color: '#6b7280',
    fontSize: '14px',
  },
  modal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.48)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modalContent: {
    background: '#fff',
    borderRadius: '8px',
    width: 'min(920px, 100%)',
    maxHeight: '90vh',
    overflow: 'auto',
    border: '1px solid #e5e7eb',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: '1px solid #e5e7eb',
    position: 'sticky',
    top: 0,
    background: '#fff',
  },
  modalTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
  },
  closeButton: {
    height: '32px',
    padding: '0 12px',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  detailBody: {
    padding: '20px',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '10px',
  },
  infoItem: {
    display: 'grid',
    gap: '4px',
    padding: '10px',
    background: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #f3f4f6',
  },
  infoLabel: {
    color: '#6b7280',
    fontSize: '12px',
  },
  infoValue: {
    color: '#111827',
    fontSize: '14px',
    wordBreak: 'break-all',
  },
};

const tabs = [
  { key: 'production', label: '生产预算' },
  { key: 'non-production', label: '非生产预算' },
];

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = dayjs(value);
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm') : String(value);
};

const getStatusStyle = (status = '') => {
  if (status.includes('通过') || status.toLowerCase().includes('approved')) return styles.statusApproved;
  if (status.includes('拒绝') || status.includes('驳回') || status.toLowerCase().includes('reject')) return styles.statusRejected;
  return styles.statusPending;
};

const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  return value;
};

export default function BudgetList({ onGoToVisual }) {
  const [activeTab, setActiveTab] = useState('production');
  const [startDate, setStartDate] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const activeTitle = useMemo(
    () => tabs.find((tab) => tab.key === activeTab)?.label || '预算',
    [activeTab]
  );

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params = { startDate, endDate, page, pageSize };
      const result = activeTab === 'production'
        ? await getProductionList(params)
        : await getNonProductionList(params);

      setData(result.data || []);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Fetch data error:', error);
      setErrorMessage(error.response?.data?.message || error.message || '列表加载失败');
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const result = await getStats();
      setStats(result.data || {});
    } catch (error) {
      console.error('Fetch stats error:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, page, startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleExport = async () => {
    if (exporting) return;

    setExporting(true);
    try {
      const result = await getReportData({ startDate, endDate, includeApproved: 1 });
      const workbook = createBudgetReportWorkbook(result.data || {});
      const filename = `预算报表_${startDate || '开始'}_${endDate || '结束'}.xlsx`;
      saveWorkbook(workbook, filename);
    } catch (error) {
      console.error('Export report error:', error);
      window.alert(`导出失败：${error.response?.data?.message || error.message || '未知错误'}`);
    } finally {
      setExporting(false);
    }
  };

  const handleOpenDetail = async (item) => {
    setDetailItem(item);
    try {
      const type = activeTab === 'production' ? 'production' : 'non-production';
      const detail = await getBudgetDetail(item.form_no, type);
      setDetailItem({ ...item, ...detail });
    } catch (error) {
      console.error('Fetch detail error:', error);
      setDetailItem(item);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <p style={styles.eyebrow}>DingTalk Budget</p>
            <h1 style={styles.title}>预算管理系统</h1>
            <p style={styles.subtitle}>
              当前筛选：{startDate || '不限'} 至 {endDate || '不限'}，{activeTitle} 共 {total} 条
            </p>
          </div>

        </div>

        <div style={styles.stats}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.production_today || 0}</div>
            <div style={styles.statLabel}>今日生产预算</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.non_production_today || 0}</div>
            <div style={styles.statLabel}>今日非生产预算</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.production_total || 0}</div>
            <div style={styles.statLabel}>生产预算总数</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.non_production_total || 0}</div>
            <div style={styles.statLabel}>非生产预算总数</div>
          </div>
        </div>

        <DateFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onSearch={handleSearch}
        />

        <div style={styles.panel}>
          <div style={styles.toolbar}>
            <div style={styles.tabList}>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  style={{ ...styles.tab, ...(activeTab === tab.key ? styles.activeTab : {}) }}
                  onClick={() => { setActiveTab(tab.key); setPage(1); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {onGoToVisual && (
              <button
                style={{ ...styles.exportButton, background: '#2563eb', borderColor: '#2563eb' }}
                onClick={onGoToVisual}
              >
                可视化报表
              </button>
            )}
            <button
              style={{ ...styles.exportButton, opacity: exporting ? 0.65 : 1 }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? '导出中...' : '导出报表'}
            </button>
          </div>

          {loading ? (
            <div style={styles.empty}>数据加载中...</div>
          ) : errorMessage ? (
            <div style={styles.empty}>{errorMessage}</div>
          ) : data.length === 0 ? (
            <div style={styles.empty}>暂无数据</div>
          ) : (
            <>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>表单编号</th>
                      <th style={styles.th}>部门</th>
                      <th style={styles.th}>预算类型</th>
                      <th style={styles.th}>申请日期</th>
                      <th style={styles.th}>预算月份</th>
                      <th style={styles.th}>执行地区</th>
                      <th style={styles.th}>状态</th>
                      <th style={styles.th}>预算金额（元）</th>
                      <th style={styles.th}>创建时间</th>
                      <th style={{ ...styles.th, minWidth: 160 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item) => (
                      <tr key={item.id || item.form_no}>
                        <td style={styles.td}>{displayValue(item.form_no)}</td>
                        <td style={styles.td}>{displayValue(item.dept_name)}</td>
                        <td style={styles.td}>{displayValue(item.budget_type)}</td>
                        <td style={styles.td}>{displayValue(item.application_date)}</td>
                        <td style={styles.td}>{displayValue(item.budget_month || item.declaration_month)}</td>
                        <td style={styles.td}>{displayValue(item.execution_region)}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.status, ...getStatusStyle(item.status) }}>
                            {displayValue(item.status)}
                          </span>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 500 }}>
                          {item.status === '已通过' ? Number(item.total_amount || 0).toFixed(2) : '-'}
                        </td>
                        <td style={styles.td}>{formatDateTime(item.create_time)}</td>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                          <button style={styles.detailButton} onClick={() => handleOpenDetail(item)}>
                            详情
                          </button>
                          <button
                            style={{ ...styles.detailButton, marginLeft: 6, borderColor: '#d1d5db', color: '#6b7280' }}
                            onClick={() => {
                              const instId = item.process_instance_id;
                              if (!instId) return;
                              const pcUrl = `https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?showmenu=false&dd_progress=false#/approval?procInstId=${instId}`;
                              const magicLink = `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(pcUrl)}&pc_slide=true`;
                              window.open(magicLink, '_blank');
                            }}
                          >
                            钉钉原单
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={styles.pagination}>
                <button
                  style={{ ...styles.pageButton, opacity: page === 1 ? 0.5 : 1 }}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page === 1}
                >
                  上一页
                </button>
                <span style={styles.pageInfo}>
                  第 {page} / {totalPages} 页，共 {total} 条
                </span>
                <button
                  style={{ ...styles.pageButton, opacity: page >= totalPages ? 0.5 : 1 }}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={page >= totalPages}
                >
                  下一页
                </button>
              </div>
            </>
          )}
        </div>

        {detailItem && (
          <div style={styles.modal} onClick={() => setDetailItem(null)}>
            <div style={styles.modalContent} onClick={(event) => event.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>预算详情</h2>
                <button style={styles.closeButton} onClick={() => setDetailItem(null)}>
                  关闭
                </button>
              </div>
              <div style={styles.detailBody}>
                <div style={styles.infoGrid}>
                  {[
                    ['表单编号', detailItem.form_no],
                    ['部门', detailItem.dept_name],
                    ['预算类型', detailItem.budget_type],
                    ['状态', detailItem.status],
                    ['申请日期', detailItem.application_date],
                    ['预算月份', detailItem.budget_month || detailItem.declaration_month],
                    ['执行地区', detailItem.execution_region],
                    ['预算金额', detailItem.budgetAmount || detailItem.total_amount || detailItem.budget_amount || detailItem.monthly_budget_amount],
                    ['创建时间', formatDateTime(detailItem.create_time)],
                    ['备注', detailItem.remark],
                  ].map(([label, value]) => (
                    <div style={styles.infoItem} key={label}>
                      <span style={styles.infoLabel}>{label}</span>
                      <span style={styles.infoValue}>{displayValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
