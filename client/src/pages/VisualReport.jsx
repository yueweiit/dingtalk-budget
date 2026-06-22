import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import DateFilter from '../components/DateFilter';
import { getReportData } from '../api';
import {
  buildOperationRows,
  buildProductionRows,
  buildExecutionRows,
  buildApprovedDetailRows,
  formatMonth,
} from '../utils/xlsxReport';
import {
  buildDeptBudgetSummary,
  buildBudgetTrend,
  buildBudgetTypeDistribution,
  buildExecutionRateData,
  buildDeptApprovedComparison,
  buildRegionDistribution,
  buildExecutionStatus,
  buildSummaryStats,
} from '../utils/chartHelpers';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

const COLORS = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#db2777', '#0891b2'];

const CHART_BLUE = '#2563eb';
const CHART_TEAL = '#0f766e';
const CHART_AMBER = '#b45309';

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
  chartTitle: {
    margin: '0 0 16px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#374151',
  },
  empty: {
    textAlign: 'center',
    padding: '56px 16px',
    color: '#6b7280',
    fontSize: '14px',
  },
  loading: {
    textAlign: 'center',
    padding: '56px 16px',
    color: '#6b7280',
    fontSize: '14px',
  },
};

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
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
};

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '0';
  const num = Number(value);
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toLocaleString();
};

/** X 轴标签过长时截断 */
const truncateLabel = (label, maxLen = 10) => {
  if (!label || label.length <= maxLen) return label;
  return String(label).slice(0, maxLen) + '…';
};

/** 计算报表月份 */
function resolveReportMonth(startDate, endDate) {
  const s = formatMonth(startDate);
  const e = formatMonth(endDate);
  return s && s === e ? s : '';
}

export default function VisualReport({ onBack }) {
  const [startDate, setStartDate] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const chartData = useMemo(() => {
    if (!reportData) return null;

    const productionRows = buildProductionRows(reportData.production || []);
    const operationRows = buildOperationRows(reportData.nonProduction || []);
    const approvedDetailRows = buildApprovedDetailRows(reportData.approvedExpenseDetails || []);
    const reportMonth = resolveReportMonth(startDate, endDate);
    const execRows = buildExecutionRows({
      productionRows,
      operationRows,
      approvedExpenses: reportData.approvedExpenses || [],
      reportMonth,
    });

    const deptSummary = buildDeptBudgetSummary(productionRows, operationRows);
    const trend = buildBudgetTrend(productionRows, operationRows);
    const typeDist = buildBudgetTypeDistribution(productionRows, operationRows);
    const execRate = buildExecutionRateData(execRows);
    const deptComp = buildDeptApprovedComparison(execRows);
    const regionDist = buildRegionDistribution(reportData.production || [], reportData.nonProduction || []);
    const execStatus = buildExecutionStatus(execRows, reportData.production || [], reportData.nonProduction || []);
    const stats = buildSummaryStats(productionRows, operationRows, execRows, approvedDetailRows);

    return { deptSummary, trend, typeDist, execRate, deptComp, regionDist, execStatus, stats };
  }, [reportData, startDate, endDate]);

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.loading}>数据加载中...</div>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.empty}>{errorMessage}</div>
        </div>
      </div>
    );
  }

  if (!chartData) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.empty}>暂无报表数据</div>
        </div>
      </div>
    );
  }

  const { deptSummary, trend, typeDist, execRate, deptComp, regionDist, execStatus, stats } = chartData;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>可视化报表</h1>
            <p style={styles.subtitle}>
              当前筛选：{startDate || '不限'} 至 {endDate || '不限'}
            </p>
          </div>
          {onBack && (
            <button style={styles.refreshButton} onClick={onBack}>
              ← 返回列表
            </button>
          )}
        </div>

        <div style={styles.toolbar}>
          <DateFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onSearch={fetchReport}
          />
          <button style={styles.refreshButton} onClick={fetchReport}>
            刷新数据
          </button>
        </div>

        {/* 汇总统计卡片 */}
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
            <div style={{ ...styles.statValue, color: '#0f766e' }}>¥{formatCurrency(stats.productionTotal)}</div>
            <div style={styles.statLabel}>生产预算总金额</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#b45309' }}>¥{formatCurrency(stats.nonProductionTotal)}</div>
            <div style={styles.statLabel}>非生产预算总金额</div>
          </div>
          <div style={styles.statCard}>
            <div style={{ ...styles.statValue, color: '#7c3aed' }}>¥{formatCurrency(stats.approvedTotal)}</div>
            <div style={styles.statLabel}>已审批支出合计</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.overallRate}</div>
            <div style={styles.statLabel}>整体执行率</div>
          </div>
        </div>

        {/* 图表网格 */}
        <div style={styles.chartGrid}>
          {/* 各部门预算分布 - 柱状图 */}
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>各部门预算分布（Top 12）</h3>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={deptSummary} margin={{ top: 5, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="deptName" tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(v) => truncateLabel(v, 8)} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="production" name="生产预算" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
                <Bar dataKey="nonProduction" name="非生产预算" fill={CHART_TEAL} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 地区预算分布 - 横向条形图 */}
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>地区预算分布</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, regionDist.length * 52)}>
              <BarChart data={regionDist} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 13, fill: '#374151' }} width={70} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="production" name="生产预算" fill={CHART_BLUE} radius={[0, 4, 4, 0]} barSize={24} />
                <Bar dataKey="nonProduction" name="非生产预算" fill={CHART_TEAL} radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 预算类型占比 - 饼图 */}
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
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 预算执行状态分布 - 横向堆叠条形图 */}
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>预算执行状态分布（Top 10）</h3>
            <ResponsiveContainer width="100%" height={Math.max(280, execStatus.length * 48)}>
              <BarChart data={execStatus} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <YAxis type="category" dataKey="deptName" tick={{ fontSize: 12, fill: '#374151' }} tickFormatter={(v) => truncateLabel(v, 10)} width={75} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="executed" name="已执行" fill="#52c41a" barSize={20} stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="inProgress" name="审批中" fill="#faad14" barSize={20} stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="unexecuted" name="未执行" fill="#d9d9d9" barSize={20} stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 月度预算趋势 - 折线图 */}
          <div style={styles.chartFull}>
            <h3 style={styles.chartTitle}>月度预算趋势</h3>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="production" name="生产预算" stroke={CHART_BLUE} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="nonProduction" name="非生产预算" stroke={CHART_TEAL} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="total" name="合计" stroke={CHART_AMBER} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 各部门执行率 - 横向柱状图 */}
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
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 部门预算 vs 已审批对比 - 分组柱状图 */}
          <div style={styles.chartCard}>
            <h3 style={styles.chartTitle}>部门预算 vs 已审批支出（Top 10）</h3>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={deptComp} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="deptName" tick={{ fontSize: 13, fill: '#6b7280' }} tickFormatter={(v) => truncateLabel(v, 10)} angle={-90} textAnchor="end" height={120} />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={formatCurrency} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="budget" name="预算金额" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
                <Bar dataKey="approved" name="已审批支出" fill={CHART_AMBER} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
