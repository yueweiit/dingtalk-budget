import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import DateFilter from '../components/DateFilter';
import { getReportData } from '../api';
import {
  buildApprovedDetailRows,
  buildExecutionRows,
  buildOperationRows,
  buildProductionRows,
  formatMonth,
} from '../utils/xlsxReport';
import {
  buildBudgetTrend,
  buildBudgetTypeDistribution,
  buildDeptApprovedComparison,
  buildDeptBudgetSummary,
  buildExecutionRateData,
  buildExecutionStatus,
  buildSummaryStats,
} from '../utils/chartHelpers';
import { buildRegionChartRows2 } from '../utils/regionChartRows2';

const COLORS = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#db2777', '#0891b2'];
const CHART_BLUE = '#5470c6';
const CHART_GREEN = '#b7d92d';
const CHART_TEAL = '#0f766e';
const CHART_AMBER = '#b45309';

const styles = {
  page: { minHeight: '100vh', background: '#f3f4f6', color: '#111827' },
  container: { padding: '24px', maxWidth: '1440px', margin: '0 auto' },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '20px',
  },
  title: { margin: 0, fontSize: '26px', fontWeight: 700, color: '#111827' },
  subtitle: { margin: '8px 0 0', fontSize: '14px', color: '#6b7280' },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  refreshButton: {
    height: '36px',
    padding: '0 16px',
    border: '1px solid #2563eb',
    borderRadius: '6px',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  statsRow: {
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
  statValue: { fontSize: '26px', lineHeight: 1.1, fontWeight: 700, color: '#2563eb' },
  statLabel: { fontSize: '13px', color: '#6b7280', marginTop: '8px' },
  chartGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
    gap: '16px',
  },
  chartCard: {
    background: '#fff',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
  },
  chartFull: {
    background: '#fff',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    gridColumn: '1 / -1',
  },
  chartTitle: { margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: '#374151' },
  empty: { textAlign: 'center', padding: '56px 16px', color: '#6b7280', fontSize: '14px' },
  loading: { textAlign: 'center', padding: '56px 16px', color: '#6b7280', fontSize: '14px' },
};

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '0';
  const num = Number(value);
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return num.toLocaleString();
};

const truncateLabel = (label, maxLen = 10) => {
  if (!label || label.length <= maxLen) return label;
  return `${String(label).slice(0, maxLen)}...`;
};

function resolveReportMonth(startDate, endDate) {
  const startMonth = formatMonth(startDate);
  const endMonth = formatMonth(endDate);
  return startMonth && startMonth === endMonth ? startMonth : '';
}

const monthStart = (value = dayjs()) => dayjs(value).startOf('month').format('YYYY-MM-DD');
const monthEnd = (value = dayjs()) => dayjs(value).endOf('month').format('YYYY-MM-DD');
const displayMonth = (startDate, endDate) => resolveReportMonth(startDate, endDate) || '不限';
const reportYear = (startDate, endDate) => dayjs(startDate || endDate || dayjs()).format('YYYY');
const yearStart = (year) => `${year}-01-01`;
const yearEnd = (year) => `${year}-12-31`;

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      padding: '10px 14px',
      boxShadow: '0 4px 6px rgba(15, 23, 42, 0.1)',
      fontSize: '13px',
    }}>
      <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#374151' }}>{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ margin: 0, color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? formatCurrency(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function VisualReportEchartsStyle({ onBack }) {
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(monthEnd());
  const [reportData, setReportData] = useState(null);
  const [trendReportData, setTrendReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [trendErrorMessage, setTrendErrorMessage] = useState('');

  const fetchReport = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await getReportData({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        includeApproved: 1,
      });
      setReportData(result.data || {});
    } catch (error) {
      console.error('Fetch report error:', error);
      setErrorMessage(error.response?.data?.message || error.message || '加载报表数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendReport = async () => {
    const year = reportYear(startDate, endDate);
    setTrendLoading(true);
    setTrendErrorMessage('');
    try {
      const result = await getReportData({
        startDate: yearStart(year),
        endDate: yearEnd(year),
        includeApproved: 1,
      });
      setTrendReportData(result.data || {});
    } catch (error) {
      console.error('Fetch trend report error:', error);
      setTrendReportData(null);
      setTrendErrorMessage(error.response?.data?.message || error.message || '加载全年趋势数据失败');
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    fetchTrendReport();
  }, [startDate, endDate]);

  const refreshAllReports = () => {
    fetchReport();
    fetchTrendReport();
  };

  const chartData = useMemo(() => {
    if (!reportData) return null;

    const productionRows = buildProductionRows(reportData.production || []);
    const operationRows = buildOperationRows(reportData.nonProduction || []);
    const approvedDetailRows = buildApprovedDetailRows(reportData.approvedExpenseDetails || []);
    const reportMonth = resolveReportMonth(startDate, endDate);
    const trendYear = reportYear(startDate, endDate);
    const trendProductionRows = buildProductionRows(trendReportData?.production || []);
    const trendOperationRows = buildOperationRows(trendReportData?.nonProduction || []);
    const trendApprovedDetailRows = buildApprovedDetailRows(trendReportData?.approvedExpenseDetails || []);
    const execRows = buildExecutionRows({
      productionRows,
      operationRows,
      approvedExpenses: reportData.approvedExpenses || [],
      reportMonth,
    });

    return {
      deptSummary: buildDeptBudgetSummary(productionRows, operationRows),
      trend: buildBudgetTrend(trendProductionRows, trendOperationRows, trendApprovedDetailRows, { year: trendYear }),
      trendYear,
      typeDist: buildBudgetTypeDistribution(productionRows, operationRows),
      execRate: buildExecutionRateData(execRows),
      deptComp: buildDeptApprovedComparison(execRows),
      regionDist: buildRegionChartRows2(reportData.production || [], reportData.nonProduction || [], approvedDetailRows),
      execStatus: buildExecutionStatus(execRows, reportData.production || [], reportData.nonProduction || []),
      stats: buildSummaryStats(productionRows, operationRows, execRows, approvedDetailRows),
    };
  }, [reportData, trendReportData, startDate, endDate]);

  if (loading) return <div style={styles.loading}>数据加载中...</div>;
  if (errorMessage) return <div style={styles.empty}>{errorMessage}</div>;
  if (!chartData) return <div style={styles.empty}>暂无报表数据</div>;

  const { deptSummary, trend, trendYear, typeDist, execRate, deptComp, regionDist, execStatus, stats } = chartData;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>可视化报表</h1>
            <p style={styles.subtitle}>当前月份：{displayMonth(startDate, endDate)}</p>
          </div>
          {onBack && (
            <button style={styles.refreshButton} onClick={onBack}>
              返回列表
            </button>
          )}
        </div>

        <div style={styles.toolbar}>
          <DateFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onSearch={refreshAllReports}
          />
          <button style={styles.refreshButton} onClick={refreshAllReports}>
            刷新数据
          </button>
        </div>

        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.productionCount}</div>
            <div style={styles.statLabel}>生产预算明细数</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.operationCount}</div>
            <div style={styles.statLabel}>非生产预算明细数</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: CHART_TEAL }}>{formatCurrency(stats.productionTotal)}</div>
            <div style={styles.statLabel}>生产预算总金额</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: CHART_AMBER }}>{formatCurrency(stats.nonProductionTotal)}</div>
            <div style={styles.statLabel}>非生产预算总金额</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#7c3aed' }}>{formatCurrency(stats.approvedTotal)}</div>
            <div style={styles.statLabel}>实际支出合计</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.overallRate}</div>
            <div style={styles.statLabel}>整体执行率</div>
          </div>
        </div>

        <div style={styles.chartGrid}>
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>各部门预算分布（Top 12）</h3>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={deptSummary} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="deptName" tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(v) => truncateLabel(v, 8)} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="production" name="生产预算" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="nonProduction" name="非生产预算" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>地区预算分布</h3>
            <ResponsiveContainer width="100%" height={Math.max(260, regionDist.length * 72)}>
              <BarChart data={regionDist} layout="vertical" margin={{ top: 5, right: 40, left: 90, bottom: 5 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 13, fill: '#374151' }} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="budget" name="预算" fill={CHART_BLUE} radius={[0, 2, 2, 0]} barSize={16} />
                <Bar dataKey="expense" name="支出" fill={CHART_GREEN} radius={[0, 2, 2, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>预算类型占比</h3>
            <ResponsiveContainer width="100%" height={360}>
              <PieChart>
                <Pie
                  data={typeDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={130}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                >
                  {typeDist.map((entry, index) => (
                    <Cell key={`pie-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>预算执行状态分布（Top 10）</h3>
            <ResponsiveContainer width="100%" height={Math.max(280, execStatus.length * 48)}>
              <BarChart data={execStatus} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <YAxis type="category" dataKey="deptName" tick={{ fontSize: 12, fill: '#374151' }} tickFormatter={(v) => truncateLabel(v, 10)} width={75} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="executed" name="已执行" fill="#52c41a" barSize={20} stackId="a" />
                <Bar dataKey="inProgress" name="审批中" fill="#faad14" barSize={20} stackId="a" />
                <Bar dataKey="unexecuted" name="未执行" fill="#d9d9d9" barSize={20} stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.chartFull}>
            <h3 style={styles.chartTitle}>月度预算趋势（{trendYear}）</h3>
            {trendErrorMessage && (
              <div style={{ ...styles.empty, padding: '8px 0 16px', color: '#b45309' }}>
                {trendErrorMessage}
              </div>
            )}
            {trendLoading ? (
              <div style={styles.loading}>全年趋势数据加载中...</div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="预算合计" stroke={CHART_AMBER} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="production" name="生产预算" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="nonProduction" name="非生产预算" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="actualExpense" name="实际支出" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>各部门执行率（Top 10）</h3>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={execRate} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} unit="%" />
                <YAxis type="category" dataKey="deptName" tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(v) => truncateLabel(v, 10)} width={120} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="executionRate" name="执行率" radius={[0, 4, 4, 0]}>
                  {execRate.map((entry, index) => {
                    const rate = entry.executionRate || 0;
                    const color = rate >= 100 ? '#dc2626' : rate >= 80 ? CHART_AMBER : CHART_TEAL;
                    return <Cell key={`rate-cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>部门预算 vs 实际支出（Top 10）</h3>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={deptComp} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="deptName" tick={{ fontSize: 13, fill: '#6b7280' }} tickFormatter={(v) => truncateLabel(v, 10)} angle={-90} textAnchor="end" height={120} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="budget" name="预算金额" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="approved" name="实际支出" fill={CHART_AMBER} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
