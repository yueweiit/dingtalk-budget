const PATH_KEYS = [
  'dept_path_names',
  'department_path_names',
  'applicant_department_path_names',
  'creator_department_path_names',
  'deptPathNames',
  'departmentPathNames',
];

function firstPathValue(record) {
  return PATH_KEYS
    .map((key) => record?.[key])
    .find((value) => value !== undefined && value !== null && value !== '');
}

function displayPathNode(value) {
  const node = String(value || '').trim();
  if (!node || node.toUpperCase() === 'ROOT') return '';
  return node.toUpperCase() === 'YUEWEI' ? '悦为集团YUEWEI Grupo' : node;
}

function normalizePath(path) {
  return path.map(displayPathNode).filter(Boolean);
}

export function departmentPathOf(record = {}) {
  const value = firstPathValue(record);
  if (Array.isArray(value)) {
    return normalizePath(value);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return normalizePath(parsed);
      }
    } catch {
      // Keep non-JSON legacy path values usable.
    }
    return normalizePath(text.split(/\s*(?:>|[|\\])\s*/));
  }

  return [];
}

export function departmentPathTitle(record = {}) {
  const path = departmentPathOf(record);
  return path.length > 0 ? `完整链路：${path.join(' > ')}` : '';
}
