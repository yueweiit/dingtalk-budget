export function mergeBudgetListRows(...groups) {
  return groups.flat().sort((left, right) => {
    const createdAtOrder = String(right?.create_time || '').localeCompare(String(left?.create_time || ''));
    if (createdAtOrder !== 0) return createdAtOrder;
    return Number(right?.id || 0) - Number(left?.id || 0);
  });
}

export function pageBudgetListRows(rows, page = 1, pageSize = 20) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 20);
  const offset = (safePage - 1) * safePageSize;
  return rows.slice(offset, offset + safePageSize);
}

export function shouldDisplayBudgetListAmounts(status) {
  return status === '已通过' || status === '审批中';
}
