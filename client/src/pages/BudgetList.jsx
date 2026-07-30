import React, { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import DateFilter from '../components/DateFilter';
import SyncButton from '../components/SyncButton';
import ExpenseSplitSyncButton from '../components/ExpenseSplitSyncButton';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts';

import { getProductionList, getNonProductionList, getStats, getBudgetDetail, getReportData } from '../api';
import { createBudgetReportWorkbook, saveWorkbook } from '../utils/xlsxReport';
import { expenseDetailSectionDefinitions } from '../utils/expenseDetailSections';
import { departmentMatches } from '../utils/departmentIdentity.js';
import { expenseDetailSplitRecord } from '../utils/expenseDetailSplit.js';
import { formatUtcDateTime, formatUtcMonth } from '../utils/utcDate.js';

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
  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: '8px',
    maxWidth: '100%',
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
    width: 'min(1120px, 100%)',
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
  expenseDetails: {
    marginTop: '16px',
    display: 'grid',
    gap: '12px',
  },
  expenseDetailSection: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#fff',
  },
  expenseDetailHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
  },
  expenseDetailTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 700,
    color: '#374151',
  },
  expenseDetailSummary: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#16a34a',
  },
  expenseDetailTableWrap: {
    overflowX: 'auto',
  },
  expenseDetailTable: {
    width: '100%',
    minWidth: '940px',
    borderCollapse: 'collapse',
  },
  expenseDetailTh: {
    padding: '9px 10px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    background: '#fff',
    borderBottom: '1px solid #f3f4f6',
    whiteSpace: 'nowrap',
  },
  expenseDetailTd: {
    padding: '10px',
    fontSize: '12px',
    color: '#374151',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'top',
  },
  expenseDetailText: {
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.5,
  },
  expenseDetailAmount: {
    textAlign: 'right',
    whiteSpace: 'nowrap',
    fontWeight: 700,
    color: '#16a34a',
  },
  expenseDetailEmpty: {
    padding: '18px 12px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#9ca3af',
  },
};

const tabs = [
  { key: 'production', label: '生产预算' },
  { key: 'non-production', label: '非生产预算' },
];

const formatDateTime = (value) => {
  return formatUtcDateTime(value);
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

const monthStart = (value = dayjs()) => dayjs(value).startOf('month').format('YYYY-MM-DD');
const monthEnd = (value = dayjs()) => dayjs(value).endOf('month').format('YYYY-MM-DD');
const displayMonth = (startDate, endDate) => {
  const startMonth = startDate ? dayjs(startDate).format('YYYY-MM') : '';
  const endMonth = endDate ? dayjs(endDate).format('YYYY-MM') : '';
  if (startMonth && startMonth === endMonth) return startMonth;
  return startMonth || endMonth || '不限';
};

function toNum(v) { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; }
function fmtWan(v) { const n = toNum(v); return n >= 10000 ? '¥' + (n / 10000).toFixed(2) + '万' : '¥' + n.toFixed(2); }
function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '';
}

function detailMonthOf(item) {
  if (item?.query_month) return String(item.query_month).trim();
  const date = firstNonEmpty(item?.source_created_at, item?.request_date, item?.approval_completed_at);
  if (!date) return '';
  return formatUtcMonth(date);
}

function detailDepartmentOf(item) {
  return firstNonEmpty(
    item?.department_resolved,
    item?.applicant_department,
    item?.creator_department,
    item?.query_department
  );
}

function detailDepartmentRecord(item) {
  return {
    department: detailDepartmentOf(item),
    departmentId: firstNonEmpty(
      item?.applicant_department_id,
      item?.department_id,
      item?.creator_department_id,
    ),
    reportingDeptId: firstNonEmpty(item?.reporting_dept_id, item?.reportingDeptId),
    reportingDeptName: firstNonEmpty(item?.reporting_dept_name, item?.reportingDeptName),
    rollupDeptId: firstNonEmpty(item?.rollup_dept_id, item?.rollupDeptId),
    rollupDeptName: firstNonEmpty(item?.rollup_dept_name, item?.rollupDeptName),
    reportingDepartmentIdentityKey: firstNonEmpty(
      item?.reporting_department_identity_key,
      item?.reportingDepartmentIdentityKey,
    ),
  };
}

function detailAmountOf(item) {
  return toNum(firstNonEmpty(
    item?.base_currency_amount,
    item?.detail_summary_amount,
    item?.amount,
    item?.source_amount,
    item?.total_amount
  ));
}

function splitTypeLabel(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'salary') return '工资';
  if (type === 'social_insurance') return '社保公积金';
  if (type === 'office_space') return '办公场地';
  if (type === 'individual_income_tax') return '个税';
  return value || '部门拆分';
}

function expenseKindLabel(value) {
  if (value === 'operation') return '运营支出';
  if (value === 'purchase') return '采购支出';
  return value || '支出';
}

function sectionKeyForSplit(splitType) {
  const type = String(splitType || '').trim().toLowerCase();
  if (type === 'salary' || type === 'social_insurance') return 'salary';
  if (type === 'office_space') return 'office';
  if (type === 'individual_income_tax') return 'tax';
  return 'operationPurchase';
}

function extractDetailSplits(item) {
  const dbSplits = item?.expense_splits || item?.expenseSplits;
  if (Array.isArray(dbSplits)) {
    return dbSplits
      .map((entry) => ({
        ...expenseDetailSplitRecord(entry),
        queryMonth: item?.query_month,
        amount: toNum(entry.amount),
        splitType: entry.split_type || entry.splitType || '',
        note: entry.note || '',
      }))
      .filter((entry) => entry.department && entry.amount > 0);
  }

  const splitColumns = [
    { col: 'salary_by_department', splitType: 'salary' },
    { col: 'social_insurance_by_department', splitType: 'social_insurance' },
    { col: 'office_space_by_department', splitType: 'office_space' },
    { col: 'individual_income_tax_by_department', splitType: 'individual_income_tax' },
  ];
  const rows = [];

  for (const { col, splitType } of splitColumns) {
    const entries = item?.[col];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const department = firstNonEmpty(entry.department, entry.dept_name);
      const amount = toNum(entry.amount);
      if (department && amount > 0) {
        rows.push({
          department,
          departmentId: firstNonEmpty(entry.department_id, entry.departmentId, entry.dept_id),
          queryMonth: item?.query_month,
          amount,
          splitType,
          note: entry.note || '',
        });
      }
    }
  }

  return rows;
}

function expenseDetailBase(item) {
  return {
    date: firstNonEmpty(item?.source_created_at, item?.request_date, item?.approval_completed_at),
    businessId: item?.business_id || '',
    title: item?.title || '',
    description: firstNonEmpty(item?.matter_description, item?.title),
  };
}

function directExpenseDetailRow(item, amount, note = '') {
  return {
    ...expenseDetailBase(item),
    amount,
    expenseType: firstNonEmpty(
      item?.purchase_expense,
      item?.operation_expense,
      item?.expense_type,
      expenseKindLabel(item?.expense_kind)
    ),
    note,
  };
}

function splitExpenseDetailRow(item, split) {
  const label = splitTypeLabel(split.splitType);
  return {
    ...expenseDetailBase(item),
    amount: split.amount,
    expenseType: label,
    note: firstNonEmpty(split.note, `${label}拆分`),
  };
}

function matchesExpenseDetailDepartment(targetDepartment, candidate) {
  return departmentMatches(targetDepartment, candidate, {
    includeRollupDepartment: Array.isArray(targetDepartment?.child_expenses),
  });
}

function buildExpenseDetailSections(rawDetails, detail, budgetMonth) {
  const targetDepartment = { ...detail, deptName: detail?.dept_name };
  const sections = {
    operationPurchase: [],
    salary: [],
    office: [],
    tax: [],
  };

  if ((!targetDepartment.deptName && !targetDepartment.dept_id) || !budgetMonth) return sections;

  for (const item of rawDetails || []) {
    if (detailMonthOf(item) !== budgetMonth) continue;

    const amount = detailAmountOf(item);
    if (amount <= 0) continue;

    const directDepartment = detailDepartmentRecord(item);
    const splits = extractDetailSplits(item);

    if (splits.length > 0) {
      const splitTotal = splits.reduce((sum, split) => sum + toNum(split.amount), 0);

      for (const split of splits) {
        if (!matchesExpenseDetailDepartment(targetDepartment, split)) continue;
        const sectionKey = sectionKeyForSplit(split.splitType);
        sections[sectionKey].push(splitExpenseDetailRow(item, split));
      }

      const remainder = Number((amount - splitTotal).toFixed(2));
      if (remainder > 0.01 && matchesExpenseDetailDepartment(targetDepartment, directDepartment)) {
        sections.operationPurchase.push(directExpenseDetailRow(item, remainder, '未拆分余额'));
      }
      continue;
    }

    if (!matchesExpenseDetailDepartment(targetDepartment, directDepartment)) continue;
    sections.operationPurchase.push(directExpenseDetailRow(item, amount));
  }

  for (const rows of Object.values(sections)) {
    rows.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.businessId).localeCompare(String(b.businessId)));
  }

  return sections;
}

function expenseBreakdownFromSections(sections) {
  const operationPurchaseRows = sections?.operationPurchase || [];
  const salaryRows = sections?.salary || [];
  const officeRows = sections?.office || [];
  const taxRows = sections?.tax || [];
  const management = operationPurchaseRows.reduce((sum, row) => sum + toNum(row.amount), 0);
  const salary = salaryRows.reduce((sum, row) => sum + toNum(row.amount), 0);
  const office = officeRows.reduce((sum, row) => sum + toNum(row.amount), 0);
  const tax = taxRows.reduce((sum, row) => sum + toNum(row.amount), 0);

  return {
    operation: management,
    purchase: 0,
    management,
    salary,
    office,
    tax,
    total: management + salary + office + tax,
    rowCount: operationPurchaseRows.length + salaryRows.length + officeRows.length + taxRows.length,
  };
}

function computeBudgetBreakdown(detail) {
  if (detail?.budget_breakdown || detail?.budgetBreakdown) {
    const breakdown = detail.budget_breakdown || detail.budgetBreakdown;
    const hr = toNum(breakdown.hr ?? breakdown.salary);
    const office = toNum(breakdown.office);
    const operation = toNum(breakdown.management ?? breakdown.operation);
    const total = toNum(breakdown.total) || hr + office + operation;
    return { hr, office, operation, total };
  }

  const hr = (detail?.hr_items || detail?.hrItems || []).reduce((s, x) => s + toNum(x.amount), 0);
  const office = (detail?.office_items || detail?.officeItems || []).reduce((s, x) => s + toNum(x.amount), 0);
  const operation = (detail?.operation_items || detail?.operationItems || []).reduce((s, x) => s + toNum(x.amount), 0);
  const total = hr + office + operation || toNum(detail?.total_amount || detail?.budget_amount || 0);
  // If no detail items, use total_amount
  if (hr === 0 && office === 0 && operation === 0) {
    const t = toNum(detail?.total_amount || detail?.budget_amount || detail?.monthly_budget_amount || 0);
    return { hr: 0, office: 0, operation: t, total: t };
  }
  return { hr, office, operation, total };
}

function computeExpenseBreakdown(rawDetails, deptName, budgetMonth, detail) {
  if (Array.isArray(rawDetails) && rawDetails.length > 0) {
    const sectionBreakdown = expenseBreakdownFromSections(buildExpenseDetailSections(rawDetails, detail, budgetMonth));
    if (sectionBreakdown.rowCount > 0) return sectionBreakdown;
  }

  if (detail?.expense_breakdown || detail?.expenseBreakdown) {
    const breakdown = detail.expense_breakdown || detail.expenseBreakdown;
    const operation = toNum(breakdown.operation);
    const purchase = toNum(breakdown.purchase);
    const salary = toNum(breakdown.salary);
    const office = toNum(breakdown.office);
    const tax = toNum(breakdown.tax);
    const management = toNum(breakdown.management);
    const total = toNum(breakdown.total) || management + salary + office + tax;
    return {
      operation,
      purchase,
      salary,
      office,
      tax,
      total,
      management: management || operation + purchase,
    };
  }

  const targetDepartment = { ...detail, deptName };
  let operationExp = 0, purchaseExp = 0, salaryExp = 0, officeExp = 0, taxExp = 0;

  for (const item of rawDetails || []) {
    const itemMonth = item.query_month || '';
    if (itemMonth !== budgetMonth) continue;

    const dbSplits = item.expense_splits || item.expenseSplits;
    if (Array.isArray(dbSplits) && dbSplits.length > 0) {
      for (const entry of dbSplits) {
        if (!matchesExpenseDetailDepartment(targetDepartment, entry)) continue;
        const amt = toNum(entry.amount);
        const splitType = String(entry.split_type || entry.splitType || '').toLowerCase();
        if (splitType === 'salary' || splitType === 'social_insurance') salaryExp += amt;
        if (splitType === 'office_space') officeExp += amt;
        if (splitType === 'individual_income_tax') taxExp += amt;
      }
      continue;
    }

    // 从 salary/office 拆分列提取该部门的份额
    const splits = [
      { col: 'salary_by_department', target: 'salary' },
      { col: 'social_insurance_by_department', target: 'salary' },
      { col: 'office_space_by_department', target: 'office' },
      { col: 'individual_income_tax_by_department', target: 'tax' },
    ];
    for (const s of splits) {
      const entries = item[s.col];
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        if (matchesExpenseDetailDepartment(targetDepartment, e)) {
          const amt = toNum(e.amount);
          if (s.target === 'salary') salaryExp += amt;
          else if (s.target === 'office') officeExp += amt;
          else taxExp += amt;
        }
      }
    }

    // 非拆分的按部门直接归入 operation/purchase
    if (!matchesExpenseDetailDepartment(targetDepartment, detailDepartmentRecord(item))) continue;
    const amt = toNum(item.base_currency_amount);
    if (item.expense_kind === 'purchase') {
      purchaseExp += amt;
    } else {
      operationExp += amt;
    }
  }

  return {
    operation: operationExp,
    purchase: purchaseExp,
    salary: salaryExp,
    office: officeExp,
    tax: taxExp,
    total: operationExp + purchaseExp + salaryExp + officeExp + taxExp,
    management: operationExp + purchaseExp,
  };
}

function ExpenseDetailSection({ title, rows = [] }) {
  const total = (rows || []).reduce((sum, row) => sum + toNum(row.amount), 0);

  return (
    <section style={styles.expenseDetailSection}>
      <div style={styles.expenseDetailHeader}>
        <h4 style={styles.expenseDetailTitle}>{title}</h4>
        <span style={styles.expenseDetailSummary}>{rows.length} 条 / {fmtWan(total)}</span>
      </div>
      {rows.length === 0 ? (
        <div style={styles.expenseDetailEmpty}>暂无明细</div>
      ) : (
        <div style={styles.expenseDetailTableWrap}>
          <table style={styles.expenseDetailTable}>
            <thead>
              <tr>
                <th style={styles.expenseDetailTh}>日期</th>
                <th style={styles.expenseDetailTh}>业务编号</th>
                <th style={styles.expenseDetailTh}>支出类型</th>
                <th style={styles.expenseDetailTh}>事项/说明</th>
                <th style={{ ...styles.expenseDetailTh, textAlign: 'right' }}>金额</th>
                <th style={styles.expenseDetailTh}>备注</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.businessId || 'expense'}-${index}`}>
                  <td style={{ ...styles.expenseDetailTd, whiteSpace: 'nowrap' }}>{formatDateTime(row.date)}</td>
                  <td style={{ ...styles.expenseDetailTd, whiteSpace: 'nowrap' }}>{displayValue(row.businessId)}</td>
                  <td style={{ ...styles.expenseDetailTd, minWidth: 130 }}>{displayValue(row.expenseType)}</td>
                  <td style={{ ...styles.expenseDetailTd, ...styles.expenseDetailText, minWidth: 280 }}>{displayValue(row.description)}</td>
                  <td style={{ ...styles.expenseDetailTd, ...styles.expenseDetailAmount }}>{fmtWan(row.amount)}</td>
                  <td style={{ ...styles.expenseDetailTd, ...styles.expenseDetailText, minWidth: 150 }}>{displayValue(row.note)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function downloadCSV(rows, filename) {
  const BOM = '﻿';
  const csv = BOM + rows.map(r => r.map(c => '"' + String(c || '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

export default function BudgetList({ onGoToVisual }) {
  const [activeTab, setActiveTab] = useState('production');
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(monthEnd());
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [detailExpense, setDetailExpense] = useState(null);
  const [detailExpenseRaw, setDetailExpenseRaw] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const chartRef = useRef(null);

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

  const handleSyncComplete = () => {
    fetchStats();
    if (page === 1) {
      fetchData();
    } else {
      setPage(1);
    }
  };

  const handleExport = async () => {
    if (exporting) return;

    setExporting(true);
    try {
      const result = await getReportData({ startDate, endDate, includeApproved: 1 });
      const workbook = createBudgetReportWorkbook({
        ...(result.data || {}),
        reportStartDate: startDate,
        reportEndDate: endDate,
      });
      const filename = `预算报表_${displayMonth(startDate, endDate)}.xlsx`;
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
    setDetailExpense(null);
    try {
      const bm = item.budget_month || item.declaration_month || '';
      // 用 report 接口获取完整明细（含 hr_items/office_items/operation_items）
      const rpt = await getReportData({ startDate: bm, endDate: bm, includeApproved: 1 });
      // 从 nonProduction 中找到匹配的 form_no
      const records = activeTab === 'production' ? (rpt.data?.production || []) : (rpt.data?.nonProduction || []);
      const matchedDetail = records.find((record) => (
        record.form_no === item.form_no
        && record.department_identity_key === item.department_identity_key
      )) || records.find((record) => record.form_no === item.form_no) || item;
      setDetailItem(matchedDetail);
      setDetailExpense(rpt.data?.approvedExpenses || []);
      setDetailExpenseRaw(rpt.data?.approvedExpenseDetails || []);
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
              当前月份：{displayMonth(startDate, endDate)}，{activeTitle} 共 {total} 条
            </p>
          </div>
          <div style={styles.headerActions}>
            <ExpenseSplitSyncButton
              startDate={startDate}
              endDate={endDate}
              onSyncComplete={handleSyncComplete}
            />
            <SyncButton
              startDate={startDate}
              endDate={endDate}
              onSyncComplete={handleSyncComplete}
            />
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
                      <th style={styles.th}>支出金额（元）</th>
                      <th style={styles.th}>创建时间</th>
                      <th style={{ ...styles.th, minWidth: 160 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item) => {
                      const rowKey = `${item.id || item.form_no}-${item.department_identity_key || item.dept_id || ''}`;
                      return (
                      <tr key={rowKey}>
                        <td style={styles.td}>{displayValue(item.form_no)}</td>
                        <td style={styles.td}>{displayValue(item.department_display || item.dept_name)}</td>
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
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 500 }}>
                          {item.status === '已通过' ? Number(item.approved_amount || 0).toFixed(2) : '-'}
                        </td>
                        <td style={styles.td}>{formatDateTime(item.create_time)}</td>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                          <button style={styles.detailButton} onClick={() => handleOpenDetail(item)}>
                            详情
                          </button>
                          <button
                            style={{
                              ...styles.detailButton,
                              marginLeft: 6,
                              borderColor: '#d1d5db',
                              color: '#6b7280',
                              opacity: item.process_instance_id ? 1 : 0.45,
                              cursor: item.process_instance_id ? 'pointer' : 'not-allowed',
                            }}
                            disabled={!item.process_instance_id}
                            onClick={() => {
                              const instId = item.process_instance_id;
                              if (!instId) return;
                              const pcUrl = `https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?showmenu=false&dd_progress=false#/approval?procInstId=${instId}`;
                              const magicLink = `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(pcUrl)}&pc_slide=true`;
                              window.open(magicLink, '_blank');
                            }}
                          >
                            {item.process_instance_id ? '钉钉原单' : '无原单'}
                          </button>
                        </td>
                      </tr>
                      );
                    })}
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
                    ['部门', detailItem.department_display || detailItem.dept_name],
                    ['部门 ID', detailItem.dept_id],
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

                {/* 预算与支出明细模块 */}
                {detailExpenseRaw !== null && (() => {
                  const budget = computeBudgetBreakdown(detailItem);
                  const bm = detailItem.budget_month || detailItem.declaration_month || '';
                  const expenseSections = buildExpenseDetailSections(detailExpenseRaw, detailItem, bm);
                  const sectionExpense = expenseBreakdownFromSections(expenseSections);
                  const exp = sectionExpense.rowCount > 0
                    ? sectionExpense
                    : computeExpenseBreakdown(detailExpenseRaw, detailItem.dept_name, bm, detailItem);
                  const remaining = budget.total - exp.total;

                  const chartOption = {
                    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
                    toolbox: { feature: { saveAsImage: { title: '保存图片' } }, right: 10 },
                    grid: { top: 60, bottom: 40, left: 60, right: 20 },
                    legend: { data: ['预算', '支出'], top: 10 },
                    xAxis: { type: 'category', data: ['管理预算明细', '人资', '办公场地', '个税'] },
                    yAxis: { type: 'value', axisLabel: { formatter: (v) => v >= 10000 ? (v/10000)+'万' : v } },
                    series: [
                      { name: '预算', type: 'bar', color: '#2f54eb', data: [budget.operation, budget.hr, budget.office, 0], label: { show: true, position: 'top', formatter: (p) => fmtWan(p.value) }, barMaxWidth: 40 },
                      { name: '支出', type: 'bar', color: '#52c41a', data: [exp.management, exp.salary, exp.office, exp.tax], label: { show: true, position: 'top', formatter: (p) => fmtWan(p.value) }, barMaxWidth: 40 },
                    ],
                  };

                  const csvRows = [
                    ['类别', '预算金额', '支出金额', '对比(预算-支出)'],
                    ['管理预算明细', budget.operation.toFixed(2), exp.management.toFixed(2), (budget.operation - exp.management).toFixed(2)],
                    ['人资', budget.hr.toFixed(2), exp.salary.toFixed(2), (budget.hr - exp.salary).toFixed(2)],
                    ['办公场地', budget.office.toFixed(2), exp.office.toFixed(2), (budget.office - exp.office).toFixed(2)],
                    ['个税', '0.00', exp.tax.toFixed(2), (-exp.tax).toFixed(2)],
                  ];

                  return (
                    <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>预算与支出明细</h3>
                        <div style={{ position: 'relative' }}>
                          <button style={{ ...styles.detailButton, background: '#2563eb', color: '#fff', border: 'none' }}
                            onClick={(e) => { const menu = e.currentTarget.nextSibling; menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; }}>
                            导出 ▾
                          </button>
                          <div style={{ display: 'none', position: 'absolute', right: 0, top: 34, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, minWidth: 140 }}>
                            <div style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}
                              onClick={() => {
                                const chart = chartRef.current?.getEchartsInstance?.();
                                if (chart) { const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' }); const a = document.createElement('a'); a.href = url; a.download = (detailItem.form_no || 'chart') + '.png'; a.click(); }
                              }}>导出图表图片</div>
                            <div style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}
                              onClick={() => downloadCSV(csvRows, (detailItem.form_no || 'detail') + '.csv')}>导出 Excel/CSV</div>
                          </div>
                        </div>
                      </div>

                      {/* 六列卡片 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                        <div style={{ background: '#e6f0ff', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#2f54eb', marginBottom: 4 }}>管理预算明细</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#2f54eb' }}>{fmtWan(budget.operation)}</div>
                        </div>
                        <div style={{ background: '#e6f0ff', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#2f54eb', marginBottom: 4 }}>人资预算</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#2f54eb' }}>{fmtWan(budget.hr)}</div>
                        </div>
                        <div style={{ background: '#e6f0ff', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#2f54eb', marginBottom: 4 }}>办公场地预算</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#2f54eb' }}>{fmtWan(budget.office)}</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#f0fff0', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#52c41a', marginBottom: 4 }}>管理支出</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>{fmtWan(exp.management)}</div>
                        </div>
                        <div style={{ background: '#f0fff0', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#52c41a', marginBottom: 4 }}>工资/公积金支出</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>{fmtWan(exp.salary)}</div>
                        </div>
                        <div style={{ background: '#f0fff0', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#52c41a', marginBottom: 4 }}>办公场地支出</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>{fmtWan(exp.office)}</div>
                        </div>
                        <div style={{ background: '#f0fff0', padding: 12, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#52c41a', marginBottom: 4 }}>个税支出</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>{fmtWan(exp.tax)}</div>
                        </div>
                      </div>

                      {/* 图表 */}
                      <div style={{ marginBottom: 16 }}>
                        <ReactEChartsCore ref={chartRef} echarts={echarts} option={chartOption} style={{ height: 320 }} notMerge lazyUpdate />
                      </div>

                      {/* 底部汇总 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                        <div style={{ background: '#e6f0ff', padding: 14, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#2f54eb' }}>总预算</div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#2f54eb' }}>{fmtWan(budget.total)}</div>
                        </div>
                        <div style={{ background: '#f0fff0', padding: 14, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: '#52c41a' }}>总支出</div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#52c41a' }}>{fmtWan(exp.total)}</div>
                        </div>
                        <div style={{ background: remaining < 0 ? '#fff1f0' : '#fff7e6', padding: 14, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: remaining < 0 ? '#cf1322' : '#d46b08' }}>剩余</div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: remaining < 0 ? '#cf1322' : '#d46b08' }}>{fmtWan(remaining)}</div>
                        </div>
                      </div>

                      <div style={styles.expenseDetails}>
                        <h3 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 600 }}>支出明细</h3>
                        {expenseDetailSectionDefinitions.map((section) => (
                          <ExpenseDetailSection
                            key={section.key}
                            title={section.title}
                            rows={expenseSections[section.key] || []}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
