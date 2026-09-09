function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function amount(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? Math.round(normalized * 100) / 100 : 0;
}

function asPath(value) {
  return Array.isArray(value) ? value.map(text) : [];
}

function normalizeDepartmentName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isGroupDepartmentName(value) {
  return [
    'yuewei',
    '悦为集团',
    '悦为集团yuewei grupo',
  ].includes(normalizeDepartmentName(value));
}

const YUEWEI_CORP_ID = 'ding144583309b2fb01c35c2f4657eb6378f';
const YUEWEI_GROUP = {
  id: '1004758048',
  name: '悦为集团YUEWEI Grupo',
};

function mappedDepartment({ id, name, company, ancestors = [] }) {
  const isCompanyDepartment = id === company.id;
  return {
    departmentId: id,
    departmentName: name,
    departmentPathIds: [
      '1',
      YUEWEI_GROUP.id,
      company.id,
      ...ancestors.map((item) => item.id),
      ...(isCompanyDepartment ? [] : [id]),
    ],
    departmentPathNames: [
      'ROOT',
      YUEWEI_GROUP.name,
      company.name,
      ...ancestors.map((item) => item.name),
      ...(isCompanyDepartment ? [] : [name]),
    ],
  };
}

const GUANGZHOU_LINGXIANG = {
  id: '1089383728',
  name: 'Guangzhou Lingxiang广州凌翔',
};
const DONGGUAN_XINGMING = {
  id: '1109001296',
  name: 'Dongguan Xingming东莞星铭',
};
const MANAGEMENT_PLANNING = {
  id: '1090315059',
  name: '管理规划中心',
};
const LATIN_GO = {
  id: '1089990115',
  name: 'LatínGo拉丁购',
};

// These mappings come from the historical OA department tree plus the verified
// employee department transitions. Split legacy departments require the owner
// constraint so unrelated records remain pending instead of being guessed.
const legacyDepartmentMappings = Object.freeze([
  {
    sourceDepartmentId: '1060178527',
    target: mappedDepartment({
      id: '1090006841',
      name: '供应链及采购执行单元Unidad de Ejecución de Cadena de Suministro y Compras',
      company: GUANGZHOU_LINGXIANG,
    }),
  },
  {
    sourceDepartmentId: '1059483022',
    sourceOwnerUserId: '361009003232351181',
    target: mappedDepartment({
      id: '1089533879',
      name: '产品&开发Departamento de Producto y Desarrollo',
      company: GUANGZHOU_LINGXIANG,
    }),
  },
  {
    sourceDepartmentId: '1083590203',
    sourceOwnerUserId: '361009003232351181',
    target: mappedDepartment({
      id: '1089533879',
      name: '产品&开发Departamento de Producto y Desarrollo',
      company: GUANGZHOU_LINGXIANG,
    }),
  },
  {
    sourceDepartmentId: '1059093807',
    target: mappedDepartment({
      id: '1089765983',
      name: 'HR人力资源中心Centro de Recursos Humanos (RRHH)',
      company: DONGGUAN_XINGMING,
      ancestors: [MANAGEMENT_PLANNING],
    }),
  },
  {
    sourceDepartmentId: '1079492125',
    target: mappedDepartment({
      id: '1089928990',
      name: 'FC 财务中心Centro Financiero (FC)',
      company: DONGGUAN_XINGMING,
      ancestors: [MANAGEMENT_PLANNING],
    }),
  },
  {
    sourceDepartmentId: '1089527639',
    target: mappedDepartment({ id: LATIN_GO.id, name: LATIN_GO.name, company: LATIN_GO }),
  },
  {
    sourceDepartmentId: '1059483024',
    sourceOwnerUserId: '163527194432506164',
    target: mappedDepartment({ id: LATIN_GO.id, name: LATIN_GO.name, company: LATIN_GO }),
  },
]);

export function resolveLegacyEffectiveQuotaDepartment({ corpId, departmentId, ownerUserId } = {}) {
  const normalizedCorpId = text(corpId);
  const normalizedDepartmentId = text(departmentId);
  const normalizedOwnerUserId = text(ownerUserId);
  if (normalizedCorpId !== YUEWEI_CORP_ID || !normalizedDepartmentId) return null;

  const mapping = legacyDepartmentMappings.find((candidate) => (
    candidate.sourceDepartmentId === normalizedDepartmentId
    && (!candidate.sourceOwnerUserId || candidate.sourceOwnerUserId === normalizedOwnerUserId)
  ));
  return mapping ? { ...mapping.target } : null;
}

function approvalResult(detail) {
  return text(detail?.result || detail?.flowResult || detail?.flow_result);
}

function completedAt(detail) {
  return text(detail?.finishTime || detail?.finish_time);
}

export function organizationFromDepartmentPath(pathIds, pathNames) {
  const ids = asPath(pathIds);
  const names = asPath(pathNames);
  const groupIndex = names.findIndex(isGroupDepartmentName);
  const companyIndex = groupIndex + 1;

  if (groupIndex < 0 || !ids[companyIndex]) {
    return {
      group_dept_id: null,
      group_name: null,
      company_dept_id: null,
      company_name: null,
    };
  }

  return {
    group_dept_id: ids[groupIndex],
    group_name: names[groupIndex] || null,
    company_dept_id: ids[companyIndex],
    company_name: names[companyIndex] || null,
  };
}

export function companyFromDepartmentPath(pathIds, pathNames) {
  const organization = organizationFromDepartmentPath(pathIds, pathNames);
  return {
    company_dept_id: organization.company_dept_id,
    company_name: organization.company_name,
  };
}

function subjectName(subjectType, item) {
  if (subjectType === 'operation') {
    return text(item.budget_purpose_detail || item.budget_detail || item.operation_expense) || '管理支出';
  }
  if (subjectType === 'hr' || subjectType === 'office') {
    return text(item.detail_item || item.budget_purpose_detail) || (subjectType === 'hr' ? '人资预算' : '办公场地预算');
  }
  return text(item.detail_category || item.item_name || item.detail_code) || {
    material: '物料预算',
    production_expense: '生产费用预算',
    labor: '人工成本预算',
  }[subjectType] || '未分类预算科目';
}

function subjectCode(subjectType, item) {
  const detailCode = text(item.detail_code);
  return detailCode ? `${subjectType}:${detailCode}` : subjectType;
}

export function buildEffectiveBudgetSubjects(detailGroups = []) {
  let lineNo = 0;
  return detailGroups.flatMap(({ subjectType, sourceTable, items = [] }) => items.map((item) => ({
    line_no: ++lineNo,
    subject_type: subjectType,
    subject_code: subjectCode(subjectType, item),
    subject_name: subjectName(subjectType, item),
    amount: amount(item.amount),
    source_table: sourceTable,
    source_data: item,
  })));
}

export function buildEffectiveBudgetQuota({ detail, budget, budgetType, detailGroups }) {
  const corpId = text(detail?.corpId || detail?.corp_id);
  const processInstanceId = text(detail?.processInstanceId);
  if (!corpId || !processInstanceId) return null;

  const budgetMonth = text(budget?.budget_month || budget?.declaration_month);
  const budgetYear = /^\d{4}-\d{2}$/.test(budgetMonth || '') ? Number(budgetMonth.slice(0, 4)) : null;
  const subjects = buildEffectiveBudgetSubjects(detailGroups);
  const detailAmount = subjects.reduce((total, subject) => total + Math.round(subject.amount * 100), 0) / 100;
  const totalAmount = amount(budget?.total_amount);
  const ownerUserId = text(budget?.creator_userid || detail?.originatorUserId);
  const mappedDepartment = resolveLegacyEffectiveQuotaDepartment({
    corpId,
    departmentId: budget?.dept_id,
    ownerUserId,
  });
  const department = mappedDepartment || {
    departmentId: text(budget?.dept_id),
    departmentName: text(budget?.dept_name),
    departmentPathIds: asPath(budget?.dept_path_ids),
    departmentPathNames: asPath(budget?.dept_path_names),
  };
  const organization = organizationFromDepartmentPath(
    department.departmentPathIds,
    department.departmentPathNames,
  );

  return {
    corp_id: corpId,
    process_instance_id: processInstanceId,
    source_form_no: text(budget?.form_no),
    source_process_code: text(detail?.processCode || detail?.process_code),
    budget_type: budgetType,
    approval_status: text(detail?.status),
    approval_result: approvalResult(detail),
    approval_completed_at: completedAt(detail),
    budget_year: budgetYear,
    budget_month: budgetMonth,
    group_dept_id: organization.group_dept_id,
    group_name: organization.group_name,
    company_dept_id: organization.company_dept_id,
    company_name: organization.company_name,
    department_id: department.departmentId,
    department_name: department.departmentName,
    department_path_ids: department.departmentPathIds,
    department_path_names: department.departmentPathNames,
    department_source: text(budget?.dept_source),
    organization_is_current: Boolean(mappedDepartment)
      || (Array.isArray(budget?.dept_path_ids) && budget.dept_path_ids.length > 0),
    owner_user_id: ownerUserId,
    owner_name: text(budget?.creator_name || detail?.originatorUserName),
    total_amount: totalAmount,
    detail_amount: detailAmount,
    detail_amount_mismatch: Math.abs(totalAmount - detailAmount) > 0.005,
    subjects,
  };
}

export async function synchronizeEffectiveBudgetQuota(client, {
  detail,
  budget,
  budgetType,
  detailGroups,
  approved,
}) {
  const quota = buildEffectiveBudgetQuota({ detail, budget, budgetType, detailGroups });
  if (!quota) {
    return { synchronized: false, reason: 'missing_corp_or_process_instance_id' };
  }

  if (!approved) {
    const result = await client.query(`
      UPDATE budget_effective_quota
      SET status = 'inactive', deactivated_at = NOW(), updated_at = NOW(),
          approval_status = $3, approval_result = $4, approval_completed_at = $5
      WHERE corp_id = $1 AND process_instance_id = $2 AND status <> 'inactive'
    `, [
      quota.corp_id,
      quota.process_instance_id,
      quota.approval_status,
      quota.approval_result,
      quota.approval_completed_at,
    ]);
    return { synchronized: true, status: 'inactive', updated: result.rowCount };
  }

  const saved = await client.query(`
    INSERT INTO budget_effective_quota (
      corp_id, process_instance_id, source_form_no, source_process_code, budget_type,
      approval_status, approval_result, approval_completed_at, budget_year, budget_month,
      group_dept_id, group_name, company_dept_id, company_name, department_id, department_name,
      department_path_ids, department_path_names, department_source, organization_is_current,
      owner_user_id, owner_name, total_amount, detail_amount, detail_amount_mismatch,
      status, effective_at, deactivated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
      'effective', NOW(), NULL
    )
    ON CONFLICT (corp_id, process_instance_id) DO UPDATE SET
      source_form_no = EXCLUDED.source_form_no,
      source_process_code = EXCLUDED.source_process_code,
      budget_type = EXCLUDED.budget_type,
      approval_status = EXCLUDED.approval_status,
      approval_result = EXCLUDED.approval_result,
      approval_completed_at = EXCLUDED.approval_completed_at,
      budget_year = EXCLUDED.budget_year,
      budget_month = EXCLUDED.budget_month,
      group_dept_id = EXCLUDED.group_dept_id,
      group_name = EXCLUDED.group_name,
      company_dept_id = EXCLUDED.company_dept_id,
      company_name = EXCLUDED.company_name,
      department_id = EXCLUDED.department_id,
      department_name = EXCLUDED.department_name,
      department_path_ids = EXCLUDED.department_path_ids,
      department_path_names = EXCLUDED.department_path_names,
      department_source = EXCLUDED.department_source,
      organization_is_current = EXCLUDED.organization_is_current,
      owner_user_id = EXCLUDED.owner_user_id,
      owner_name = EXCLUDED.owner_name,
      total_amount = EXCLUDED.total_amount,
      detail_amount = EXCLUDED.detail_amount,
      detail_amount_mismatch = EXCLUDED.detail_amount_mismatch,
      status = 'effective', effective_at = NOW(), deactivated_at = NULL, updated_at = NOW()
    RETURNING id
  `, [
    quota.corp_id,
    quota.process_instance_id,
    quota.source_form_no,
    quota.source_process_code,
    quota.budget_type,
    quota.approval_status,
    quota.approval_result,
    quota.approval_completed_at,
    quota.budget_year,
    quota.budget_month,
    quota.group_dept_id,
    quota.group_name,
    quota.company_dept_id,
    quota.company_name,
    quota.department_id,
    quota.department_name,
    JSON.stringify(quota.department_path_ids),
    JSON.stringify(quota.department_path_names),
    quota.department_source,
    quota.organization_is_current,
    quota.owner_user_id,
    quota.owner_name,
    quota.total_amount,
    quota.detail_amount,
    quota.detail_amount_mismatch,
  ]);

  const quotaId = saved.rows[0].id;
  await client.query('DELETE FROM budget_effective_quota_subject WHERE quota_id = $1', [quotaId]);
  for (const subject of quota.subjects) {
    await client.query(`
      INSERT INTO budget_effective_quota_subject
        (quota_id, line_no, subject_type, subject_code, subject_name, amount, source_table, source_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    `, [
      quotaId,
      subject.line_no,
      subject.subject_type,
      subject.subject_code,
      subject.subject_name,
      subject.amount,
      subject.source_table,
      JSON.stringify(subject.source_data),
    ]);
  }

  return {
    synchronized: true,
    status: 'effective',
    quotaId,
    subjectCount: quota.subjects.length,
    detailAmountMismatch: quota.detail_amount_mismatch,
  };
}
