const textEncoder = new TextEncoder();

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const columnName = (index) => {
  let name = '';
  let current = index;
  while (current > 0) {
    const mod = (current - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    current = Math.floor((current - mod) / 26);
  }
  return name;
};

const isNumberLike = (value) => {
  if (value === null || value === undefined || value === '') return false;
  const text = String(value).trim().replace(/,/g, '');
  if (/^\d{15,}$/.test(text)) return false;
  return text !== '' && !Number.isNaN(Number(text));
};

const cellXml = (rowIndex, colIndex, value, style = 2) => {
  const ref = `${columnName(colIndex)}${rowIndex}`;
  if (isNumberLike(value)) {
    return `<c r="${ref}" s="3"><v>${Number(String(value).replace(/,/g, ''))}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${escapeXml(value)}</t></is></c>`;
};

const rowXml = (rowIndex, cells, style = 2) => (
  `<row r="${rowIndex}">${cells.map((value, index) => cellXml(rowIndex, index + 1, value, style)).join('')}</row>`
);

const normalizeItems = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const firstValue = (row, keys, fallback = '') => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return fallback;
};

const amountValue = (row) => firstValue(row, [
  'rmb_amount',
  'rmbAmount',
  'amount',
  'budget_amount',
  'budgetAmount',
  'total_amount',
  'totalAmount',
  'monthly_budget_amount',
  'monthlyBudgetAmount',
  'estimated_overtime_amount',
  'estimatedOvertimeAmount',
  'original_amount',
  'originalAmount',
], '');

const formatDate = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const formatMonth = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 7);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

const normalizeCurrency = (value) => {
  const text = String(value ?? '').trim();
  if (!text || /^\?+$/.test(text)) return '人民币';
  return text;
};

const cleanDetailItem = (value) => {
  const text = String(value ?? '').trim();
  return ['hr', 'office', 'operation', 'material', 'production', 'labor'].includes(text)
    ? ''
    : text;
};

export const buildOperationRows = (records) => {
  const rows = [];

  for (const record of records) {
    const beforeCount = rows.length;
    const groups = [
      ['人资预算', normalizeItems(record.hr_items || record.hrItems)],
      ['办公场地预算', normalizeItems(record.office_items || record.officeItems)],
      ['管理支出预算', normalizeItems(record.operation_items || record.operationItems)],
    ];

    for (const [project, items] of groups) {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        rows.push({
          formNo: record.form_no,
          project,
          budgetType: record.budget_type,
          originalAmount: firstValue(item, ['original_amount', 'originalAmount', 'operation_expense', 'operationExpense', 'amount'], ''),
          currency: normalizeCurrency(firstValue(item, ['currency'], '人民币')),
          detailItem: project === '办公场地预算'
            ? '办公场地预算'
            : cleanDetailItem(firstValue(item, project === '管理支出预算'
              ? ['operation_expense', 'operationExpense', 'budget_purpose_detail', 'budgetPurposeDetail', 'detail_item', 'detailItem', 'remark']
              : ['detail_item', 'detailItem', 'item_name', 'itemName', 'budget_detail', 'budgetDetail', 'budget_purpose_detail', 'budgetPurposeDetail', 'remark'], '')),
          amount: amountValue(item),
          basis: firstValue(item, ['calculation_basis', 'calculationBasis', 'budget_purpose_detail', 'budgetPurposeDetail', 'remark'], ''),
          applicationDate: formatDate(record.application_date),
          budgetMonth: formatMonth(record.budget_month || record.declaration_month),
          deptName: record.dept_name,
          status: record.status,
          createTime: record.create_time,
        });
      }
    }

    if (rows.length === beforeCount) {
      rows.push({
        formNo: record.form_no,
        project: record.budget_type || '非生产预算',
        budgetType: record.budget_type,
        originalAmount: record.budget_amount || record.total_amount,
        currency: '人民币',
        detailItem: record.remark,
        amount: record.total_amount || record.budget_amount,
        basis: record.remark,
        applicationDate: formatDate(record.application_date),
        budgetMonth: formatMonth(record.budget_month || record.declaration_month),
        deptName: record.dept_name,
        status: record.status,
        createTime: record.create_time,
      });
    }
  }

  return rows;
};

export const buildProductionRows = (records) => {
  const rows = [];

  for (const record of records) {
    const beforeCount = rows.length;
    const groups = [
      ['物料预算', normalizeItems(record.material_items || record.materialItems)],
      ['生产费用预算', normalizeItems(record.production_items || record.productionItems)],
      ['人工成本预算', normalizeItems(record.labor_items || record.laborItems)],
    ];

    for (const [category, items] of groups) {
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        rows.push({
          formNo: record.form_no,
          category,
          detailCategory: firstValue(item, ['detail_category', 'detailCategory', 'detail_type', 'detailType', 'item_name', 'itemName'], ''),
          code: firstValue(item, ['detail_code', 'detailCode', 'expense_detail', 'expenseDetail', 'product_name', 'productName', 'work_type', 'workType', 'specification'], ''),
          spec: firstValue(item, ['specification', 'production_line', 'productionLine', 'post_name', 'postName'], ''),
          unit: firstValue(item, ['unit'], ''),
          unitPrice: firstValue(item, ['unit_price', 'unitPrice'], ''),
          overtimeHours: firstValue(item, ['overtime_hours', 'overtimeHours', 'quantity'], ''),
          overtimePrice: firstValue(item, ['overtime_unit_price', 'overtimeUnitPrice'], ''),
          overtimeAmount: firstValue(item, ['estimated_overtime_amount', 'estimatedOvertimeAmount', 'original_amount', 'originalAmount', 'amount'], ''),
          monthlyTotal: firstValue(record, ['monthly_budget_amount', 'monthlyBudgetAmount'], ''),
          requestQty: firstValue(item, ['request_quantity', 'requestQuantity', 'quantity'], ''),
          requestAmount: amountValue(item),
          previousUsed: firstValue(item, ['previous_used', 'previousUsed'], ''),
          purpose: firstValue(item, ['budget_purpose_detail', 'budgetPurposeDetail', 'remark', 'calculation_basis', 'calculationBasis'], ''),
          operator: record.creator_name,
          remark: firstValue(item, ['remark'], record.remark || ''),
          applicationDate: formatDate(record.application_date),
          budgetMonth: formatMonth(record.budget_month || record.declaration_month),
          deptName: record.dept_name,
        });
      }
    }

    if (rows.length === beforeCount) {
      rows.push({
        formNo: record.form_no,
        category: record.budget_type || '生产预算',
        detailCategory: '',
        code: '',
        spec: '',
        unit: '',
        unitPrice: '',
        overtimeHours: '',
        overtimePrice: '',
        overtimeAmount: '',
        monthlyTotal: record.monthly_budget_amount,
        requestQty: '',
        requestAmount: record.total_amount || record.monthly_budget_amount,
        previousUsed: '',
        purpose: record.remark,
        operator: record.creator_name,
        remark: record.remark,
        applicationDate: formatDate(record.application_date),
        budgetMonth: formatMonth(record.budget_month || record.declaration_month),
        deptName: record.dept_name,
      });
    }
  }

  return rows;
};

const worksheetXml = ({ rows, widths = [] }) => {
  const lastColumn = columnName(Math.max(...rows.map((row) => row.length), 1));
  const lastRow = Math.max(rows.length, 1);
  const colsXml = widths.length
    ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${lastColumn}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${colsXml}
<sheetData>
${rows.map((cells, index) => rowXml(index + 1, cells, index === 0 ? 1 : 2)).join('')}
</sheetData>
<autoFilter ref="A1:${lastColumn}${lastRow}"/>
</worksheet>`;
};

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFD9E2EC"/></left><right style="thin"><color rgb="FFD9E2EC"/></right><top style="thin"><color rgb="FFD9E2EC"/></top><bottom style="thin"><color rgb="FFD9E2EC"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="1" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="非生产预算" sheetId="1" r:id="rId1"/>
    <sheet name="生产预算" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (array, offset, value) => {
  array[offset] = value & 0xff;
  array[offset + 1] = (value >>> 8) & 0xff;
};

const writeUint32 = (array, offset, value) => {
  array[offset] = value & 0xff;
  array[offset + 1] = (value >>> 8) & 0xff;
  array[offset + 2] = (value >>> 16) & 0xff;
  array[offset + 3] = (value >>> 24) & 0xff;
};

const concatBytes = (parts) => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const zipFiles = (files) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = textEncoder.encode(file.name);
    const data = textEncoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);

    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0x0800);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, 0);
    writeUint16(local, 12, 0);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0x0800);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, 0);
    writeUint16(central, 14, 0);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, offset);

  return concatBytes([...localParts, centralDirectory, end]);
};

const workbookXmlForSheets = (sheets) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}
  </sheets>
</workbook>`;

const workbookRelsXmlForSheets = (sheets) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const contentTypesXmlForSheets = (sheets) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

export const toAmount = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : 0;
};

const resolveReportMonth = (startDate, endDate) => {
  const startMonth = formatMonth(startDate);
  const endMonth = formatMonth(endDate);
  return startMonth && startMonth === endMonth ? startMonth : '';
};

const executionMonthForBudgetRow = (row, reportMonth) => (
  row.budgetMonth || reportMonth || formatMonth(row.createTime || row.applicationDate) || 'Unspecified'
);

const addGroupedAmount = (map, row, amount, source, reportMonth) => {
  const deptName = String(row.deptName || '').trim() || 'Unknown';
  const budgetMonth = String(executionMonthForBudgetRow(row, reportMonth)).trim() || 'Unspecified';
  const key = `${deptName}__${budgetMonth}`;
  const current = map.get(key) || {
    deptName,
    budgetMonth,
    productionBudget: 0,
    nonProductionBudget: 0,
    operationApproved: 0,
    purchaseApproved: 0,
    operationCount: 0,
    purchaseCount: 0,
  };

  if (source === 'production') {
    current.productionBudget += amount;
  } else {
    current.nonProductionBudget += amount;
  }

  map.set(key, current);
};

const expenseKindLabel = (value) => {
  if (value === 'operation') return '运营支出';
  if (value === 'purchase') return '采购支出';
  return value || '';
};

export const buildApprovedDetailRows = (approvedExpenseDetails = []) => approvedExpenseDetails
  .map((item) => ({
    expenseKind: expenseKindLabel(item.expense_kind),
    department: firstValue(item, ['department_resolved', 'applicant_department', 'creator_department', 'query_department'], ''),
    month: firstValue(item, ['query_month'], formatMonth(item.source_created_at || item.request_date || item.approval_completed_at)),
    businessId: item.business_id,
    title: item.title,
    amount: firstValue(item, ['amount', 'detail_summary_amount', 'source_amount', 'total_amount', 'base_currency_amount'], ''),
    baseCurrencyAmount: firstValue(item, ['base_currency_amount', 'amount_rmb'], ''),
    approvalStatus: item.approval_status,
    requestDate: formatDate(item.request_date),
    sourceCreatedAt: formatDate(item.source_created_at),
    approvalCompletedAt: formatDate(item.approval_completed_at),
    bizAction: item.biz_action,
  }))
  .sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.department).localeCompare(String(b.department)));

export const buildExecutionRows = ({ productionRows, operationRows, approvedExpenses, reportMonth }) => {
  const grouped = new Map();

  for (const row of productionRows) {
    addGroupedAmount(grouped, row, toAmount(row.requestAmount), 'production', reportMonth);
  }

  for (const row of operationRows) {
    addGroupedAmount(grouped, row, toAmount(row.amount), 'nonProduction', reportMonth);
  }

  for (const item of approvedExpenses || []) {
    const deptName = String(item.department || '').trim() || 'Unknown';
    const budgetMonth = String(item.month || '').trim() || 'Unspecified';
    const key = `${deptName}__${budgetMonth}`;
    const current = grouped.get(key) || {
      deptName,
      budgetMonth,
      productionBudget: 0,
      nonProductionBudget: 0,
      operationApproved: 0,
      purchaseApproved: 0,
      operationCount: 0,
      purchaseCount: 0,
    };

    current.operationApproved += toAmount(item.operationTotal);
    current.purchaseApproved += toAmount(item.purchaseTotal);
    current.operationCount += Number(item.operationCount || 0);
    current.purchaseCount += Number(item.purchaseCount || 0);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((row) => {
      const totalBudget = row.productionBudget + row.nonProductionBudget;
      const totalApproved = row.operationApproved + row.purchaseApproved;
      return {
        ...row,
        totalBudget,
        totalApproved,
        remainingBudget: totalBudget - totalApproved,
        executionRate: totalBudget > 0 ? `${((totalApproved / totalBudget) * 100).toFixed(2)}%` : '',
      };
    })
    .sort((a, b) => String(a.budgetMonth).localeCompare(String(b.budgetMonth)) || String(a.deptName).localeCompare(String(b.deptName)));
};

export const sumRows = (rows, key) => rows.reduce((sum, row) => sum + toAmount(row[key]), 0);

const percentText = (part, total) => (
  total > 0 ? `${((part / total) * 100).toFixed(2)}%` : ''
);

const groupShareRows = (rows, groupKeys, amountKey) => {
  const totals = new Map();
  const groups = new Map();

  for (const row of rows) {
    const amount = toAmount(row[amountKey]);
    const totalKey = groupKeys.map((key) => row[key]).join('__');
    const detailKey = [...groupKeys.map((key) => row[key]), row.category, row.detail].join('__');
    totals.set(totalKey, (totals.get(totalKey) || 0) + amount);

    const current = groups.get(detailKey) || { ...row, amount: 0, count: 0, totalKey };
    current.amount += amount;
    current.count += 1;
    groups.set(detailKey, current);
  }

  return [...groups.values()]
    .map((row) => {
      const total = totals.get(row.totalKey) || 0;
      return {
        ...row,
        total,
        percent: percentText(row.amount, total),
      };
    })
    .sort((a, b) => String(a.month).localeCompare(String(b.month))
      || String(a.department).localeCompare(String(b.department))
      || Number(b.amount) - Number(a.amount));
};

const buildBudgetShareRows = ({ productionRows, operationRows, reportMonth }) => {
  const rows = [
    ...operationRows.map((row) => ({
      department: row.deptName || 'Unknown',
      month: executionMonthForBudgetRow(row, reportMonth),
      category: row.project || row.budgetType || '未分类',
      detail: row.detailItem || row.project || row.budgetType || '未分类',
      amount: toAmount(row.amount),
      formNo: row.formNo,
    })),
    ...productionRows.map((row) => ({
      department: row.deptName || 'Unknown',
      month: executionMonthForBudgetRow(row, reportMonth),
      category: row.category || '生产预算',
      detail: row.detailCategory || row.code || row.category || '未分类',
      amount: toAmount(row.requestAmount),
      formNo: row.formNo,
    })),
  ];

  return groupShareRows(rows, ['department', 'month'], 'amount');
};

const buildExpenseShareRows = (approvedDetailRows) => {
  const rows = approvedDetailRows.map((row) => ({
    department: row.department || 'Unknown',
    month: row.month || 'Unspecified',
    category: row.expenseKind || '未分类',
    detail: row.title || row.expenseKind || '未分类',
    amount: toAmount(row.baseCurrencyAmount || row.amount),
    formNo: row.businessId,
  }));

  return groupShareRows(rows, ['department', 'month'], 'amount');
};

export const createBudgetReportWorkbook = ({ production = [], nonProduction = [], approvedExpenses = [], approvedExpenseDetails = [], reportStartDate = '', reportEndDate = '' }) => {
  const operationRows = buildOperationRows(nonProduction);
  const productionRows = buildProductionRows(production);
  const reportMonth = resolveReportMonth(reportStartDate, reportEndDate);
  const executionRows = buildExecutionRows({ productionRows, operationRows, approvedExpenses, reportMonth });
  const approvedDetailRows = buildApprovedDetailRows(approvedExpenseDetails);
  const budgetShareRows = buildBudgetShareRows({ productionRows, operationRows, reportMonth });
  const expenseShareRows = buildExpenseShareRows(approvedDetailRows);

  const operationSheetRows = [
    ['序号', '所属部门', '预算类型', '申请日期', '预算月份', '预算项目', '预算金额', '币种', '明细项目', '明细金额', '计算依据', '表单编号', '状态', '创建日期'],
    ...operationRows.map((row, index) => [
      index + 1,
      row.deptName,
      row.budgetType,
      row.applicationDate,
      row.budgetMonth,
      row.project,
      row.originalAmount,
      row.currency,
      row.detailItem,
      row.amount,
      row.basis,
      row.formNo,
      row.status,
      formatDate(row.createTime),
    ]),
  ];

  const productionSheetRows = [
    ['序号', '所属部门', '预算类型', '申请日期', '预算周期', '预算类别', '明细类别', '编码/费用明细', '规格/产线/岗位', '单位', '单价', '预计加班时长', '加班单价', '预算加班费', '月度预算总量', '本次申请数量', '本次申请金额', '上期已用', '用途/费用归属', '经办人', '备注', '表单编号'],
    ...productionRows.map((row, index) => [
      index + 1,
      row.deptName,
      '生产预算',
      row.applicationDate,
      row.budgetMonth,
      row.category,
      row.detailCategory,
      row.code,
      row.spec,
      row.unit,
      row.unitPrice,
      row.overtimeHours,
      row.overtimePrice,
      row.overtimeAmount,
      row.monthlyTotal,
      row.requestQty,
      row.requestAmount,
      row.previousUsed,
      row.purpose,
      row.operator,
      row.remark,
      row.formNo,
    ]),
  ];

  const executionSheetRows = [
    ['序号', '所属部门', '月份', '生产预算', '非生产预算', '预算合计', '已审批运营支出', '已审批采购支出', '已审批支出合计', '剩余额度', '执行率', '运营支出单数', '采购支出单数'],
    ...executionRows.map((row, index) => [
      index + 1,
      row.deptName,
      row.budgetMonth,
      row.productionBudget.toFixed(2),
      row.nonProductionBudget.toFixed(2),
      row.totalBudget.toFixed(2),
      row.operationApproved.toFixed(2),
      row.purchaseApproved.toFixed(2),
      row.totalApproved.toFixed(2),
      row.remainingBudget.toFixed(2),
      row.executionRate,
      row.operationCount,
      row.purchaseCount,
    ]),
  ];

  const summarySheetRows = [
    ['指标', '数值'],
    ['生产预算单数', production.length],
    ['非生产预算单数', nonProduction.length],
    ['生产预算明细行数', productionRows.length],
    ['非生产预算明细行数', operationRows.length],
    ['审批支出明细行数', approvedDetailRows.length],
    ['预算占比分类数', budgetShareRows.length],
    ['支出占比分类数', expenseShareRows.length],
    ['生产预算金额', sumRows(executionRows, 'productionBudget').toFixed(2)],
    ['非生产预算金额', sumRows(executionRows, 'nonProductionBudget').toFixed(2)],
    ['已审批运营支出金额', sumRows(executionRows, 'operationApproved').toFixed(2)],
    ['已审批采购支出金额', sumRows(executionRows, 'purchaseApproved').toFixed(2)],
    ['已审批支出合计', sumRows(executionRows, 'totalApproved').toFixed(2)],
    ['剩余额度', sumRows(executionRows, 'remainingBudget').toFixed(2)],
  ];

  const approvedDetailSheetRows = [
    ['序号', '支出类型', '所属部门', '月份', '业务编号', '标题', '原始金额', '本位币金额(CNY)', '审批状态', '申请日期', '创建日期', '审批完成日期', '业务动作'],
    ...approvedDetailRows.map((row, index) => [
      index + 1,
      row.expenseKind,
      row.department,
      row.month,
      row.businessId,
      row.title,
      row.amount,
      row.baseCurrencyAmount,
      row.approvalStatus,
      row.requestDate,
      row.sourceCreatedAt,
      row.approvalCompletedAt,
      row.bizAction,
    ]),
  ];

  const budgetShareSheetRows = [
    ['序号', '所属部门', '月份', '预算类别', '明细项目', '明细金额', '部门预算总额', '占比', '单据数'],
    ...budgetShareRows.map((row, index) => [
      index + 1,
      row.department,
      row.month,
      row.category,
      row.detail,
      row.amount.toFixed(2),
      row.total.toFixed(2),
      row.percent,
      row.count,
    ]),
  ];

  const expenseShareSheetRows = [
    ['序号', '所属部门', '月份', '支出类型', '支出明细', '支出金额(CNY)', '部门支出总额(CNY)', '占比', '单据数'],
    ...expenseShareRows.map((row, index) => [
      index + 1,
      row.department,
      row.month,
      row.category,
      row.detail,
      row.amount.toFixed(2),
      row.total.toFixed(2),
      row.percent,
      row.count,
    ]),
  ];

  const sheets = [
    { name: '汇总', rows: summarySheetRows, widths: [28, 18] },
    { name: '预算执行', rows: executionSheetRows, widths: [8, 28, 14, 16, 18, 16, 18, 18, 18, 18, 14, 16, 16] },
    { name: '部门预算占比', rows: budgetShareSheetRows, widths: [8, 28, 14, 18, 28, 16, 18, 12, 10] },
    { name: '部门支出占比', rows: expenseShareSheetRows, widths: [8, 28, 14, 14, 40, 18, 20, 12, 10] },
    { name: '审批支出明细', rows: approvedDetailSheetRows, widths: [8, 12, 28, 14, 24, 36, 14, 18, 14, 14, 14, 16, 14] },
    { name: '非生产预算明细', rows: operationSheetRows, widths: [8, 22, 16, 14, 14, 18, 14, 10, 24, 14, 34, 22, 14, 14] },
    { name: '生产预算明细', rows: productionSheetRows, widths: [8, 22, 14, 14, 14, 16, 16, 24, 22, 10, 12, 14, 14, 16, 16, 16, 16, 16, 26, 14, 24, 22] },
  ];

  const files = [
    { name: '[Content_Types].xml', content: contentTypesXmlForSheets(sheets) },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXmlForSheets(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXmlForSheets(sheets) },
    { name: 'xl/styles.xml', content: stylesXml },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml({ rows: sheet.rows, widths: sheet.widths }),
    })),
  ];

  return new Blob([zipFiles(files)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
};

export const saveWorkbook = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
