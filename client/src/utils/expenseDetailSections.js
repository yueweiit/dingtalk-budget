export const expenseDetailSectionDefinitions = [
  { key: 'operationPurchase', title: '运营/采购支出明细' },
  { key: 'salary', title: '工资/社保明细' },
  { key: 'bonus', title: '备用金明细' },
  { key: 'office_equipment', title: '办公设备明细' },
  { key: 'tax', title: '个税明细' },
  { key: 'office', title: '办公场地明细' },
];

export function visibleExpenseDetailSections(sections = {}) {
  const fixed = expenseDetailSectionDefinitions
    .filter((section) => Array.isArray(sections[section.key]) && sections[section.key].length > 0);
  const dynamic = Object.entries(sections)
    .filter(([key, rows]) => key.startsWith('administrative:') && Array.isArray(rows) && rows.length > 0)
    .map(([key, rows]) => {
      const categoryName = String(rows[0]?.categoryName || '').trim() || '管理费用';
      return { key, title: `${categoryName}明细` };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  return [...fixed, ...dynamic];
}
