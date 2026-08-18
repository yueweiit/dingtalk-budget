const agreedResults = [
  'agree',
  'approved',
  'pass',
  'success',
  '\u540c\u610f',
  '\u5df2\u901a\u8fc7',
  '\u901a\u8fc7',
];

export const COMPLETED_APPROVAL_RESULTS = new Set(agreedResults);

function firstNonEmpty(...values) {
  return values.find((value) => value != null && String(value).trim() !== '');
}

/**
 * OA persists its authoritative final result in `result`.
 * The two flowResult spellings are retained only for records written by older
 * sync versions, where `result` was not preserved in raw_data.
 */
export function completedApprovalResult(item) {
  return String(firstNonEmpty(
    item?.result,
    item?.flowResult,
    item?.flow_result,
  ) || '').trim().toLowerCase();
}

/**
 * Keep SQL projections and SQL predicates on the same authoritative result
 * order. The caller must supply a trusted, static table alias.
 */
export function completedApprovalResultSql(alias) {
  return `COALESCE(
    NULLIF(TRIM(${alias}.raw_data->>'result'), ''),
    NULLIF(TRIM(${alias}.raw_data->>'flowResult'), ''),
    NULLIF(TRIM(${alias}.raw_data->>'flow_result'), ''),
    ''
  )`;
}

export function isCompletedApprovedExpense(item) {
  if (!item?.approval_completed_at) return false;
  const status = String(firstNonEmpty(item.approval_status, item.status) || '').trim().toUpperCase();
  return status === 'COMPLETED' && COMPLETED_APPROVAL_RESULTS.has(completedApprovalResult(item));
}

export function completedApprovedExpenseWhere(alias) {
  const resultExpr = `LOWER(${completedApprovalResultSql(alias)})`;
  const resultList = agreedResults.map((result) => `'${result}'`).join(', ');

  return `
    AND ${alias}.approval_completed_at IS NOT NULL
    AND UPPER(COALESCE(NULLIF(TRIM(${alias}.approval_status), ''), NULLIF(TRIM(${alias}.raw_data->>'status'), ''), 'NONE')) = 'COMPLETED'
    AND ${resultExpr} IN (${resultList})
  `;
}
