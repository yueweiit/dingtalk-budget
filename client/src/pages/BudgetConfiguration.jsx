import React, { useEffect, useState } from 'react';
import {
  getQuotaConfigurationOptions,
  getQuotaConfigurations,
} from '../api';

const emptyFilters = {
  budgetYear: '',
  budgetMonth: '',
  groupDeptId: '',
  companyDeptId: '',
  departmentId: '',
  subjectName: '',
  budgetType: '',
};

const emptyOptions = {
  years: [],
  months: [],
  groups: [],
  companies: [],
  departments: [],
  budgetTypes: [],
  subjects: [],
};

const emptySummary = {
  totals: {
    quota_count: 0,
    total_amount: 0,
    detail_amount_mismatch_count: 0,
  },
  groups: [],
  companies: [],
  departments: [],
  subjects: [],
};

const summaryTabs = [
  { key: 'groups', label: '集团统计', nameKey: 'name' },
  { key: 'companies', label: '子公司统计', nameKey: 'name' },
  { key: 'departments', label: '部门统计', nameKey: 'name' },
  { key: 'subjects', label: '科目统计', nameKey: 'subject_name' },
];

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f4f7fb',
    color: '#172033',
  },
  container: {
    maxWidth: 1520,
    minWidth: 1120,
    margin: '0 auto',
    padding: '28px 36px 42px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 24,
    marginBottom: 22,
  },
  eyebrow: {
    margin: '0 0 7px',
    color: '#0f766e',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    margin: 0,
    fontSize: 26,
    lineHeight: 1.25,
    fontWeight: 700,
  },
  subtitle: {
    margin: '8px 0 0',
    color: '#657089',
    fontSize: 14,
  },
  headerActions: {
    display: 'flex',
    gap: 10,
    flexShrink: 0,
  },
  button: {
    height: 34,
    padding: '0 13px',
    border: '1px solid #cbd5e1',
    borderRadius: 5,
    background: '#ffffff',
    color: '#344054',
    fontSize: 13,
    cursor: 'pointer',
  },
  primaryButton: {
    borderColor: '#0f766e',
    background: '#0f766e',
    color: '#ffffff',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 14,
    marginBottom: 16,
  },
  statCard: {
    minHeight: 98,
    padding: '17px 18px',
    border: '1px solid #dde4ee',
    borderRadius: 6,
    background: '#ffffff',
    boxSizing: 'border-box',
  },
  statLabel: {
    color: '#68748b',
    fontSize: 13,
  },
  statValue: {
    marginTop: 12,
    color: '#172033',
    fontSize: 22,
    lineHeight: 1,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  panel: {
    border: '1px solid #dde4ee',
    borderRadius: 6,
    background: '#ffffff',
    marginBottom: 16,
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '14px 16px',
    padding: 20,
    borderBottom: '1px solid #e7ecf3',
  },
  filter: {
    display: 'grid',
    gridTemplateColumns: '76px minmax(0, 1fr)',
    alignItems: 'center',
    gap: 8,
  },
  filterLabel: {
    color: '#526078',
    fontSize: 13,
    textAlign: 'right',
  },
  select: {
    width: '100%',
    height: 34,
    minWidth: 0,
    padding: '0 9px',
    border: '1px solid #cbd5e1',
    borderRadius: 4,
    outline: 'none',
    background: '#ffffff',
    color: '#25324b',
    fontSize: 13,
  },
  filterActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '0 20px 18px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '15px 20px',
    borderBottom: '1px solid #e7ecf3',
  },
  sectionTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
  },
  tabList: {
    display: 'flex',
    gap: 4,
  },
  tab: {
    height: 32,
    padding: '0 12px',
    border: '1px solid transparent',
    borderRadius: 4,
    background: 'transparent',
    color: '#637087',
    fontSize: 13,
    cursor: 'pointer',
  },
  activeTab: {
    borderColor: '#b6ded8',
    background: '#e9f7f4',
    color: '#0f766e',
    fontWeight: 700,
  },
  tableWrap: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    minWidth: 1180,
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '11px 12px',
    borderBottom: '1px solid #dfe6ef',
    background: '#f8fafc',
    color: '#516078',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #edf1f5',
    color: '#26334b',
    verticalAlign: 'top',
  },
  numericCell: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  subjectList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 180,
  },
  subject: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    color: '#46536c',
    whiteSpace: 'nowrap',
  },
  subtle: {
    color: '#7a879b',
  },
  typeBadge: {
    display: 'inline-flex',
    padding: '3px 7px',
    borderRadius: 4,
    background: '#eef2ff',
    color: '#4f46e5',
    fontSize: 12,
    whiteSpace: 'nowrap',
  },
  warningBadge: {
    display: 'inline-flex',
    marginTop: 5,
    padding: '2px 6px',
    borderRadius: 4,
    background: '#fff7e6',
    color: '#b45309',
    fontSize: 11,
  },
  empty: {
    padding: '34px 20px',
    color: '#7a879b',
    textAlign: 'center',
    fontSize: 14,
  },
  error: {
    padding: '12px 20px',
    borderBottom: '1px solid #fecaca',
    background: '#fff1f2',
    color: '#be123c',
    fontSize: 13,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '14px 20px',
    color: '#68748b',
    fontSize: 13,
  },
};

function formatAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

function budgetTypeLabel(value) {
  return value === 'production' ? '生产预算' : value === 'non_production' ? '非生产预算' : '待确认';
}

function subjectRows(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function FilterSelect({ label, value, options, onChange, optionLabel = (item) => item.name || item.value, optionValue = (item) => item.id || item.value }) {
  return (
    <label style={styles.filter}>
      <span style={styles.filterLabel}>{label}</span>
      <select style={styles.select} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">全部</option>
        {options.map((item) => {
          const itemValue = String(optionValue(item));
          return <option key={itemValue} value={itemValue}>{optionLabel(item) || '待确认'}</option>;
        })}
      </select>
    </label>
  );
}

function sameValue(left, right) {
  return String(left || '') === String(right || '');
}

function matchesCompanyScope(department, groupDeptId, companyDeptId) {
  return (!groupDeptId || sameValue(department.group_dept_id, groupDeptId))
    && (!companyDeptId || sameValue(department.company_dept_id, companyDeptId));
}

export default function BudgetConfiguration({ onBack, onLogout }) {
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState(emptyOptions);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [summaryTab, setSummaryTab] = useState('groups');
  const pageSize = 20;

  useEffect(() => {
    let active = true;
    getQuotaConfigurationOptions()
      .then((result) => {
        if (active) setOptions({ ...emptyOptions, ...(result.data || {}) });
      })
      .catch((error) => {
        if (active) setErrorMessage(error.response?.data?.message || '筛选项加载失败');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage('');
    getQuotaConfigurations({ ...filters, page, pageSize })
      .then((result) => {
        if (!active) return;
        setRecords(result.data || []);
        setSummary({ ...emptySummary, ...(result.summary || {}) });
        setTotal(Number(result.total || 0));
      })
      .catch((error) => {
        if (!active) return;
        setRecords([]);
        setSummary(emptySummary);
        setTotal(0);
        setErrorMessage(error.response?.data?.message || error.message || '额度配置加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [
    filters.budgetYear,
    filters.budgetMonth,
    filters.groupDeptId,
    filters.companyDeptId,
    filters.departmentId,
    filters.subjectName,
    filters.budgetType,
    page,
  ]);

  const updateDraftFilter = (name, value) => {
    setDraftFilters((current) => {
      const next = { ...current, [name]: value };
      if (name === 'groupDeptId') {
        const selectedCompany = options.companies.find((company) => sameValue(company.id, next.companyDeptId));
        if (selectedCompany && !sameValue(selectedCompany.group_dept_id, next.groupDeptId)) {
          next.companyDeptId = '';
        }
      }

      const selectedDepartment = options.departments.find((department) => sameValue(department.id, next.departmentId));
      if (selectedDepartment && !matchesCompanyScope(
        selectedDepartment,
        next.groupDeptId,
        next.companyDeptId,
      )) {
        next.departmentId = '';
      }
      return next;
    });
  };

  const applyFilters = () => {
    setFilters({ ...draftFilters });
    setPage(1);
  };

  const resetFilters = () => {
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeSummaryTab = summaryTabs.find((tab) => tab.key === summaryTab) || summaryTabs[0];
  const summaryRows = summary[activeSummaryTab.key] || [];
  const visibleCompanies = options.companies.filter((company) => (
    !draftFilters.groupDeptId || sameValue(company.group_dept_id, draftFilters.groupDeptId)
  ));
  const visibleDepartments = options.departments.filter((department) => (
    matchesCompanyScope(department, draftFilters.groupDeptId, draftFilters.companyDeptId)
  ));

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>DingTalk Budget</p>
            <h1 style={styles.title}>预算配置</h1>
            <p style={styles.subtitle}>审批通过的预算申请会形成生效额度，按组织层级查看与汇总。</p>
          </div>
          <div style={styles.headerActions}>
            <button type="button" style={styles.button} onClick={onBack}>返回预算列表</button>
            <button type="button" style={styles.button} onClick={onLogout}>退出登录</button>
          </div>
        </header>

        <section style={styles.stats}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>生效预算额度</div>
            <div style={styles.statValue}>{formatAmount(summary.totals?.total_amount)}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>生效预算单</div>
            <div style={styles.statValue}>{Number(summary.totals?.quota_count || 0).toLocaleString('zh-CN')}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>当前可见部门</div>
            <div style={styles.statValue}>{(summary.departments || []).length.toLocaleString('zh-CN')}</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>明细金额待核对</div>
            <div style={styles.statValue}>{Number(summary.totals?.detail_amount_mismatch_count || 0).toLocaleString('zh-CN')}</div>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.filterGrid}>
            <FilterSelect
              label="年度"
              value={draftFilters.budgetYear}
              options={options.years}
              optionLabel={(item) => `${item.value}年`}
              onChange={(value) => updateDraftFilter('budgetYear', value)}
            />
            <FilterSelect
              label="月份"
              value={draftFilters.budgetMonth}
              options={options.months}
              optionLabel={(item) => item.value}
              onChange={(value) => updateDraftFilter('budgetMonth', value)}
            />
            <FilterSelect
              label="集团"
              value={draftFilters.groupDeptId}
              options={options.groups}
              onChange={(value) => updateDraftFilter('groupDeptId', value)}
            />
            <FilterSelect
              label="子公司"
              value={draftFilters.companyDeptId}
              options={visibleCompanies}
              onChange={(value) => updateDraftFilter('companyDeptId', value)}
            />
            <FilterSelect
              label="部门"
              value={draftFilters.departmentId}
              options={visibleDepartments}
              optionLabel={(item) => (
                draftFilters.companyDeptId ? item.name : `${item.company_name || '待确认'} - ${item.name}`
              )}
              onChange={(value) => updateDraftFilter('departmentId', value)}
            />
            <FilterSelect
              label="预算科目"
              value={draftFilters.subjectName}
              options={options.subjects}
              optionLabel={(item) => item.value}
              onChange={(value) => updateDraftFilter('subjectName', value)}
            />
            <FilterSelect
              label="预算类型"
              value={draftFilters.budgetType}
              options={options.budgetTypes}
              optionLabel={(item) => budgetTypeLabel(item.value)}
              onChange={(value) => updateDraftFilter('budgetType', value)}
            />
          </div>
          <div style={styles.filterActions}>
            <button type="button" style={styles.button} onClick={resetFilters}>重置</button>
            <button type="button" style={{ ...styles.button, ...styles.primaryButton }} onClick={applyFilters}>查询</button>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>组织额度汇总</h2>
            <div style={styles.tabList}>
              {summaryTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.key}
                  style={{ ...styles.tab, ...(summaryTab === tab.key ? styles.activeTab : {}) }}
                  onClick={() => setSummaryTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div style={styles.tableWrap}>
            <table style={{ ...styles.table, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={styles.th}>{activeSummaryTab.label.replace('统计', '')}</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>生效预算单</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>预算额度（元）</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.length === 0 ? (
                  <tr><td colSpan="3" style={styles.empty}>暂无汇总数据</td></tr>
                ) : summaryRows.map((row, index) => (
                  <tr key={`${row.id || row.subject_code || row[activeSummaryTab.nameKey]}-${index}`}>
                    <td style={styles.td}>{row[activeSummaryTab.nameKey] || '待确认'}</td>
                    <td style={{ ...styles.td, ...styles.numericCell }}>{Number(row.quota_count || 0).toLocaleString('zh-CN')}</td>
                    <td style={{ ...styles.td, ...styles.numericCell }}>{formatAmount(row.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={styles.panel}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>预算额度明细</h2>
            <span style={styles.subtle}>共 {total.toLocaleString('zh-CN')} 条</span>
          </div>
          {errorMessage && <div style={styles.error}>{errorMessage}</div>}
          {loading ? (
            <div style={styles.empty}>额度配置加载中...</div>
          ) : records.length === 0 ? (
            <div style={styles.empty}>暂无审批通过后生效的预算额度</div>
          ) : (
            <>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>年度</th>
                      <th style={styles.th}>月份</th>
                      <th style={styles.th}>集团</th>
                      <th style={styles.th}>子公司</th>
                      <th style={styles.th}>部门</th>
                      <th style={styles.th}>预算科目</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>预算金额（元）</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>科目金额（元）</th>
                      <th style={styles.th}>负责人</th>
                      <th style={styles.th}>预算类型</th>
                      <th style={styles.th}>表单编号</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => {
                      const subjects = subjectRows(record.subjects);
                      return (
                        <tr key={record.id}>
                          <td style={styles.td}>{record.budget_year || '-'}</td>
                          <td style={styles.td}>{record.budget_month || '-'}</td>
                          <td style={styles.td}>{record.group_name || '待确认'}</td>
                          <td style={styles.td}>{record.company_name || '待确认'}</td>
                          <td style={styles.td}>
                            {record.department_is_company
                              ? '子公司本级'
                              : (record.department_name || '待确认')}
                          </td>
                          <td style={styles.td}>
                            {subjects.length === 0 ? <span style={styles.subtle}>未填写明细科目</span> : (
                              <div style={styles.subjectList}>
                                {subjects.map((subject, index) => (
                                  <span key={`${subject.code || subject.name}-${index}`} style={styles.subject}>
                                    <span>{subject.name || '未分类预算科目'}</span>
                                    <span style={styles.subtle}>{formatAmount(subject.amount)}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ ...styles.td, ...styles.numericCell }}>
                            {formatAmount(record.total_amount)}
                            {record.detail_amount_mismatch && <span style={styles.warningBadge}>明细与总额不一致</span>}
                          </td>
                          <td style={{ ...styles.td, ...styles.numericCell }}>{formatAmount(record.subject_amount)}</td>
                          <td style={styles.td}>{record.owner_name || record.owner_user_id || '待确认'}</td>
                          <td style={styles.td}><span style={styles.typeBadge}>{budgetTypeLabel(record.budget_type)}</span></td>
                          <td style={styles.td}>{record.source_form_no || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={styles.pagination}>
                <button
                  type="button"
                  style={{ ...styles.button, opacity: page === 1 ? 0.45 : 1 }}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                >
                  上一页
                </button>
                <span>第 {page} / {totalPages} 页</span>
                <button
                  type="button"
                  style={{ ...styles.button, opacity: page >= totalPages ? 0.45 : 1 }}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  下一页
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
