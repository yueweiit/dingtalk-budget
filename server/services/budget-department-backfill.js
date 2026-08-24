import { getDepartmentIdentity, getServiceEntityRoutingInput } from './parser.js';

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

export async function resolveBudgetDepartmentBackfill(record, oaInstance, options = {}) {
  const { snapshot = null, resolveServiceEntityDepartment } = options;
  if (!record?.table_name || !record?.form_no || !record?.process_instance_id) {
    return skip(record || {}, 'invalid_budget_record');
  }
  if (String(record.dept_id || '').trim()) return skip(record, 'department_already_set');
  if (!oaInstance) return skip(record, 'missing_oa_instance');

  const dingtalkData = {
    originatorDeptId: oaInstance.originator_dept_id,
    originatorDeptName: oaInstance.originator_dept_name,
    formComponentValues: parseFormComponentValues(oaInstance.form_component_values),
  };
  const serviceEntityRouting = getServiceEntityRoutingInput(dingtalkData);
  if (serviceEntityRouting.service_entity_expected) {
    const resolved = await resolveServiceEntityDepartment?.({
      serviceEntity: serviceEntityRouting.service_entity,
      serviceEntityCode: serviceEntityRouting.service_entity_code,
      correspondingDepartment: serviceEntityRouting.corresponding_department,
    });
    if (resolved?.status !== 'resolved' || !resolved.departmentId || !resolved.department) {
      return skip(record, 'service_entity_unresolved');
    }
    return {
      action: 'update',
      table_name: record.table_name,
      form_no: record.form_no,
      process_instance_id: record.process_instance_id,
      dept_id: resolved.departmentId,
      dept_source: 'service_entity_exact',
      dept_path_ids: resolved.departmentPathIds || null,
      dept_path_names: resolved.departmentPathNames || null,
    };
  }

  const identity = getDepartmentIdentity(dingtalkData);
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
