// 钉钉审批数据解析器

function textOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return value.label || value.name || value.value || JSON.stringify(value);
  }
  return String(value);
}

function includesAny(text, keywords) {
  const normalized = textOf(text).toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function toNumber(value) {
  const raw = textOf(value).replace(/,/g, '').trim();
  if (!raw) return 0;
  const num = Number(raw);
  return Number.isFinite(num) ? num : 0;
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseExtValue(field) {
  return parseJson(field?.extValue ?? field?.extendValue, null);
}

function parseSelectLabel(value, extValue) {
  const ext = typeof extValue === 'string' ? parseJson(extValue, null) : extValue;
  if (Array.isArray(ext)) return ext.map((item) => item?.label || item?.name || item?.value).filter(Boolean).join(',');
  if (ext && typeof ext === 'object') return ext.label || ext.name || ext.value || textOf(value);
  return textOf(value);
}

function getFormValue(formValues, keywords) {
  const keys = Array.isArray(keywords) ? keywords : [keywords];
  const matchedFields = formValues.filter((f) => {
    const name = textOf(f.name);
    const id = textOf(f.id);
    return keys.some((keyword) => name === keyword || id === keyword || includesAny(name, [keyword]));
  });
  const field = matchedFields.find((f) => textOf(f.value).trim() !== '') || matchedFields[0];
  if (!field) return null;

  switch (field.componentType) {
    case 'DDSelectField':
    case 'DDMultiSelectField':
    case 'DDCascadeField':
      return parseSelectLabel(field.value, field.extValue);
    case 'DepartmentField': {
      const ext = parseExtValue(field);
      if (Array.isArray(ext)) return ext.map((item) => item?.name || item?.label).filter(Boolean).join(',');
      return parseSelectLabel(field.value, ext);
    }
    case 'DDDateRangeField':
    case 'TableField':
    case 'DDAttachment':
      return parseJson(field.value, field.componentType === 'TableField' ? [] : null);
    default:
      return field.value;
  }
}

function getDepartmentField(formValues) {
  return formValues.find((field) => {
    if (field.componentType !== 'DepartmentField') return false;
    const name = textOf(field.name);
    const id = textOf(field.id);
    return ['部门', 'Departamento'].some((keyword) =>
      name === keyword || id === keyword || includesAny(name, [keyword])
    );
  });
}

function getDepartmentId(extValue) {
  const values = Array.isArray(extValue) ? extValue : [extValue];

  for (const value of values) {
    if (!value || typeof value !== 'object') continue;
    for (const key of ['id', 'itemId', 'deptId']) {
      const departmentId = textOf(value[key]).trim();
      if (departmentId) return departmentId;
    }
  }

  return null;
}

export function getDepartmentIdentity(dingtalkData) {
  const formValues = dingtalkData.formComponentValues || [];
  const departmentId = getDepartmentId(parseExtValue(getDepartmentField(formValues)));
  if (departmentId) {
    return { dept_id: departmentId, dept_source: 'form_id' };
  }

  const originatorDeptId = textOf(dingtalkData.originatorDeptId).trim();
  if (originatorDeptId) {
    return { dept_id: originatorDeptId, dept_source: 'originator_id' };
  }

  return { dept_id: null, dept_source: 'name_only' };
}

function getStatus(dingtalkData) {
  const statusStr = String(dingtalkData.status || '').toUpperCase();
  const resultStr = String(dingtalkData.result || '').toLowerCase();

  // 驳回优先
  if (resultStr === 'refuse' || resultStr === 'reject') return '已驳回';

  // COMPLETED + agree → 已通过
  if (statusStr === 'COMPLETED' && resultStr === 'agree') return '已通过';

  // TERMINATED / CANCELLED → 已撤销（含 TERMINATED+agree+finishTime 的特殊情况）
  if (statusStr === 'TERMINATED' || statusStr === 'CANCELLED' || statusStr === 'CANCELED') return '已撤销';

  // NEW / RUNNING / 其他 → 审批中
  return '审批中';
}

function toMonthValue(value) {
  const raw = textOf(value).trim();
  if (!raw) return null;
  const date = raw.includes('T') ? raw.split('T')[0] : raw;
  if (/^\d{4}-\d{2}$/.test(date)) return date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.substring(0, 7);
  if (/^\d{6}$/.test(date)) return `${date.substring(0, 4)}-${date.substring(4, 6)}`;
  return null;
}

function parseCreateTime(dingtalkData) {
  const formNo = textOf(dingtalkData.businessId);
  const formNoTime = formNo.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (formNoTime) {
    const [, year, month, day, hour, minute, second] = formNoTime;
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  if (!dingtalkData.createTime) return null;
  const date = new Date(dingtalkData.createTime);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function getTableRows(formValues, keywords) {
  const table = formValues.find((f) => f.name && includesAny(f.name, keywords));
  if (!table) return [];
  const rows = parseJson(table.value, []);
  return Array.isArray(rows) ? rows : [];
}

function getCellValue(cell) {
  return parseSelectLabel(cell?.value, cell?.extendValue ?? cell?.extValue);
}

function parseCommonMoneyCell(item, label, value) {
  if (includesAny(label, ['原币金额', 'monto en moneda original', 'monto en moneda origen'])) {
    item.original_amount = toNumber(value);
  } else if (includesAny(label, ['币种', 'moneda'])) {
    item.currency = value;
  } else if (includesAny(label, ['汇率', 'tipo de cambio', 'tasa de cambio'])) {
    item.exchange_rate = toNumber(value);
  } else if (includesAny(label, ['人民币金额', 'monto en yuanes chinos', 'monto en rmb'])) {
    item.rmb_amount = toNumber(value);
    item.amount = item.rmb_amount;
  } else if (includesAny(label, ['计算依据', 'base de cálculo', 'base de calculo'])) {
    item.calculation_basis = value;
  }
}

function parseProductionRow(row, kind) {
  const item = { form_no: null, detail_type: kind };
  const cells = row.rowValue || [];

  for (const cell of cells) {
    const label = textOf(cell.label);
    const value = getCellValue(cell);

    parseCommonMoneyCell(item, label, value);

    if (includesAny(label, ['明细类别', 'clase de detalle'])) {
      item.item_name = value;
      item.product_name = value;
      item.post_name = value;
      item.detail_category = value;
    } else if (includesAny(label, ['编码', '费用明细', 'código', 'codigo', 'detalle de gastos'])) {
      item.specification = value;
      item.process = value;
      item.work_type = value;
      item.detail_code = value;
    } else if (includesAny(label, ['规格', '产线', '岗位', 'esp.', 'línea', 'linea', 'puesto'])) {
      item.production_line = value;
    } else if (includesAny(label, ['单位', 'unidad'])) {
      item.unit = value;
    } else if (includesAny(label, ['申请数量', 'cantidad solicitada'])) {
      item.quantity = toNumber(value);
    } else if (includesAny(label, ['单价', 'precio unitario']) && !includesAny(label, ['加班'])) {
      item.unit_price = toNumber(value);
    } else if (includesAny(label, ['预计加班时长', 'horas extra estimadas'])) {
      item.overtime_hours = toNumber(value);
      item.quantity = item.overtime_hours;
    } else if (includesAny(label, ['加班单价', 'precio unitario de horas extra'])) {
      item.overtime_unit_price = toNumber(value);
      item.unit_price = item.overtime_unit_price;
    } else if (includesAny(label, ['预计加班费'])) {
      item.estimated_overtime_amount = toNumber(value);
      item.original_amount = item.estimated_overtime_amount;
    } else if (includesAny(label, ['备注', 'observaciones'])) {
      item.remark = value;
    }
  }

  item.amount = item.rmb_amount || item.amount || item.original_amount || 0;
  return item;
}

function parseNonProductionRow(row, kind) {
  const item = { form_no: null, detail_type: kind };
  const cells = row.rowValue || [];

  for (const cell of cells) {
    const label = textOf(cell.label);
    const value = getCellValue(cell);

    parseCommonMoneyCell(item, label, value);

    if (includesAny(label, ['明细项目', 'item detallado'])) {
      item.detail_item = value;
      item.budget_purpose_detail = value;
    } else if (includesAny(label, ['管理支出', 'Gastos de operación', 'Gastos de operacion', 'detalles de pago', '付款详细事由'])) {
      item.operation_expense = value;
      item.budget_purpose_detail = value;
    } else if (includesAny(label, ['预算明细', 'detalle presupuestario'])) {
      item.budget_detail = value;
      item.budget_purpose_detail = item.budget_purpose_detail || value;
    } else if (includesAny(label, ['人数', 'número de personal', 'numero de personal'])) {
      item.headcount = toNumber(value);
    } else if (includesAny(label, ['备注', 'observaciones'])) {
      item.remark = value;
    }
  }

  item.amount = item.rmb_amount || item.amount || item.original_amount || 0;
  return item;
}

export function hasBudgetDetailItems(dingtalkData, budgetType = getBudgetType(dingtalkData)) {
  if (budgetType === 'production') {
    return parseMaterialItems(dingtalkData).length > 0 ||
      parseProductionItems(dingtalkData).length > 0 ||
      parseLaborItems(dingtalkData).length > 0;
  }

  return parseHrItems(dingtalkData).length > 0 ||
    parseOfficeItems(dingtalkData).length > 0 ||
    parseOperationItems(dingtalkData).length > 0;
}

/** 判断是否为预算申请单（排除运营/采购支出等无预算明细流程） */
export function isBudgetRequest(dingtalkData) {
  const title = String(dingtalkData.title || '').toLowerCase();
  if (title.includes('gastos de operación') || title.includes('运营支出')) return false;
  if (title.includes('purchase') || title.includes('采购支出')) return false;
  return hasBudgetDetailItems(dingtalkData);
}

export function getBudgetType(dingtalkData) {
  const formValues = dingtalkData.formComponentValues || [];
  const budgetType = textOf(getFormValue(formValues, ['预算类型', 'Tipo de presupuesto']));

  if (includesAny(budgetType, ['非生产', 'no producción', 'no produccion', 'non-production'])) {
    return 'non_production';
  }
  if (includesAny(budgetType, ['生产', 'producción', 'produccion', 'production'])) {
    return 'production';
  }

  const hasProductionTable = formValues.some((f) => f.name && includesAny(f.name, [
    '物料预算',
    '生产费用预算',
    '人工成本预算',
    'Presupuesto de materiales',
    'Presupuesto de gastos de producción',
    'Presupuesto de mano de obra',
  ]));
  return hasProductionTable ? 'production' : 'non_production';
}

function parseBaseBudget(dingtalkData, budgetType) {
  const formValues = dingtalkData.formComponentValues || [];
  const departmentIdentity = getDepartmentIdentity(dingtalkData);
  const budgetMonth = getFormValue(formValues, ['预算月份', 'Mes presupuestario', '填报月份', 'Mes de declaración']);
  const applicationDate = getFormValue(formValues, ['申请日期', 'Fecha de solicitud', '填报日期', 'Fecha de llenado']);
  // 诊断：打印所有表单字段名，便于排查金额提取问题
  const amountKeywords = ['预算总金额', 'Presupuesto Total', 'RMB', '总金额', '预算金额', '金额', 'Total', 'Monto total'];
  const rawAmountValue = getFormValue(formValues, amountKeywords);
  const totalAmount = toNumber(rawAmountValue);
  if (totalAmount === 0) {
    const fieldNames = formValues.map((f) => f.name || '').filter(Boolean);
    console.log(`[PARSER:DIAG] form_no=${dingtalkData.businessId}, amountKeywords tried=${JSON.stringify(amountKeywords)}, rawValue=${JSON.stringify(rawAmountValue)}, totalAmount=${totalAmount}`);
    console.log(`[PARSER:DIAG] Available field names: ${JSON.stringify(fieldNames)}`);
  }

  return {
    form_no: dingtalkData.businessId,
    process_instance_id: dingtalkData.processInstanceId,
    dept_name: getFormValue(formValues, ['部门', 'Departamento']) || dingtalkData.originatorDeptName,
    ...departmentIdentity,
    dept_path_ids: null,
    dept_path_names: null,
    budget_type: budgetType,
    declaration_month: toMonthValue(budgetMonth || applicationDate),
    budget_month: toMonthValue(budgetMonth || applicationDate),
    application_date: textOf(applicationDate) || null,
    execution_region: getFormValue(formValues, ['执行地区', 'Región de ejecución', 'Region de ejecucion']) || null,
    creator_name: dingtalkData.title?.split('提交的')[0] || null,
    creator_userid: dingtalkData.originatorUserId,
    create_time: parseCreateTime(dingtalkData),
    status: getStatus(dingtalkData),
    remark: getFormValue(formValues, ['备注', 'Observaciones']) || null,
    total_amount: totalAmount,
    tenant_id: 'default',
  };
}

export function parseProductionBudget(dingtalkData) {
  const budget = parseBaseBudget(dingtalkData, '生产');
  return {
    ...budget,
    monthly_budget_amount: budget.total_amount,
  };
}

export function parseNonProductionBudget(dingtalkData) {
  const budget = parseBaseBudget(dingtalkData, '非生产');
  return {
    ...budget,
    budget_amount: budget.total_amount,
  };
}

export function parseMaterialItems(dingtalkData) {
  const rows = getTableRows(dingtalkData.formComponentValues || [], ['物料预算', 'Presupuesto de materiales']);
  return rows.map((row) => ({ ...parseProductionRow(row, 'material'), form_no: dingtalkData.businessId }))
    .filter((item) => item.detail_category || item.detail_code || item.amount);
}

export function parseProductionItems(dingtalkData) {
  const rows = getTableRows(dingtalkData.formComponentValues || [], ['生产费用预算', 'Presupuesto de gastos de producción', 'Presupuesto de gastos de produccion']);
  return rows.map((row) => ({ ...parseProductionRow(row, 'production_expense'), form_no: dingtalkData.businessId }))
    .filter((item) => item.detail_category || item.detail_code || item.amount);
}

export function parseLaborItems(dingtalkData) {
  const rows = getTableRows(dingtalkData.formComponentValues || [], ['人工成本预算', 'Presupuesto de mano de obra']);
  return rows.map((row) => ({ ...parseProductionRow(row, 'labor'), form_no: dingtalkData.businessId }))
    .filter((item) => item.detail_category || item.detail_code || item.amount);
}

export function parseHrItems(dingtalkData) {
  const rows = getTableRows(dingtalkData.formComponentValues || [], ['人资预算', 'Presupuesto de Recursos Humanos']);
  return rows.map((row) => ({ ...parseNonProductionRow(row, 'hr'), form_no: dingtalkData.businessId }))
    .filter((item) => item.detail_item || item.amount || item.headcount);
}

export function parseOfficeItems(dingtalkData) {
  const rows = getTableRows(dingtalkData.formComponentValues || [], ['办公场地预算', 'Presupuesto del espacio de oficina']);
  return rows.map((row) => ({ ...parseNonProductionRow(row, 'office'), form_no: dingtalkData.businessId }))
    .filter((item) => item.amount || item.headcount);
}

export function parseOperationItems(dingtalkData) {
  const rows = getTableRows(dingtalkData.formComponentValues || [], ['预算项目', 'Proyecto presupuestario', '管理支出', 'Gastos de operación']);
  return rows.map((row) => ({ ...parseNonProductionRow(row, 'operation'), form_no: dingtalkData.businessId }))
    .filter((item) => item.budget_purpose_detail || item.amount);
}
