import { getDepartmentIdentity } from './parser.js';

const BUDGET_TABLES = new Set(['production_budget', 'non_production_budget']);

function parseFormComponentValues(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function skip(record, reason) {
  return {
    action: 'skip',
    reason,
    table_name: record.table_name,
    form_no: record.form_no,
    process_instance_id: record.process_instance_id,
  };
}

export function resolveBudgetDepartmentBackfill(record, oaInstance, snapshot = null) {
  if (!record?.table_name || !record?.form_no || !record?.process_instance_id) {
    return skip(record || {}, 'invalid_budget_record');
  }
  if (String(record.dept_id || '').trim()) return skip(record, 'department_already_set');
  if (!oaInstance) return skip(record, 'missing_oa_instance');

  const identity = getDepartmentIdentity({
    originatorDeptId: oaInstance.originator_dept_id,
    originatorDeptName: oaInstance.originator_dept_name,
    formComponentValues: parseFormComponentValues(oaInstance.form_component_values),
  });
  if (!identity.dept_id) return skip(record, 'missing_department_id');

  return {
    action: 'update',
    table_name: record.table_name,
    form_no: record.form_no,
    process_instance_id: record.process_instance_id,
    dept_id: identity.dept_id,
    dept_source: identity.dept_source,
    dept_path_ids: snapshot?.dept_path_ids || null,
    dept_path_names: snapshot?.dept_path_names || null,
  };
}

export function buildDepartmentIdentityUpdate(item) {
  if (!BUDGET_TABLES.has(item?.table_name)) {
    throw new Error(`Unsupported budget table: ${item?.table_name || ''}`);
  }

  return {
    sql: `
      UPDATE ${item.table_name}
      SET dept_id = $1,
          dept_source = $2,
          dept_path_ids = $3::jsonb,
          dept_path_names = $4::jsonb
      WHERE form_no = $5
        AND process_instance_id = $6
        AND NULLIF(BTRIM(dept_id), '') IS NULL
    `,
    params: [
      item.dept_id,
      item.dept_source,
      item.dept_path_ids ? JSON.stringify(item.dept_path_ids) : null,
      item.dept_path_names ? JSON.stringify(item.dept_path_names) : null,
      item.form_no,
      item.process_instance_id,
    ],
  };
}
