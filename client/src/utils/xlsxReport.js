import { formatUtcDate, formatUtcMonth } from './utcDate.js';
import { departmentDisplayName, departmentIdentityKey } from './departmentIdentity.js';
import {
  buildPaymentCountMap,
  buildPaymentSequenceMap,
  paymentEventDate,
  paymentEventEvidence,
  paymentEventKey,
  paymentEventLabel,
} from './paymentEventDisplay.js';

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

const formatDate = formatUtcDate;

export const formatMonth = (value) => {
  return formatUtcMonth(value);
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
          ...reportingDepartmentFields(record),
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
        ...reportingDepartmentFields(record),
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
          ...reportingDepartmentFields(record),
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
        ...reportingDepartmentFields(record),
      });
    }
  }

  return rows;
};

const worksheetXml = ({ rows, widths = [], hasDrawing = false }) => {
  const lastColumn = columnName(Math.max(...rows.map((row) => row.length), 1));
  const lastRow = Math.max(rows.length, 1);
  const colsXml = widths.length
    ? `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const drawingXml = hasDrawing ? '<drawing r:id="rId1"/>' : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${lastColumn}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${colsXml}
<sheetData>
${rows.map((cells, index) => rowXml(index + 1, cells, index === 0 ? 1 : 2)).join('')}
</sheetData>
<autoFilter ref="A1:${lastColumn}${lastRow}"/>
${drawingXml}
</worksheet>`;
};

// ── Chart XML generation helpers ──────────────────────────────────────────

const CHART_COLORS = ['FF2563EB', 'FF0F766E', 'FFB45309', 'FF7C3AED', 'FFDB2777', 'FF0891B2'];

const chartSeriesXml = (sheetName, labelCol, valueCol, rowCount, seriesName, color) => {
  const catRef = `'${sheetName}'!$${labelCol}$2:$${labelCol}$${rowCount}`;
  const valRef = `'${sheetName}'!$${valueCol}$2:$${valueCol}$${rowCount}`;
  return `<c:ser>
<c:idx val="0"/><c:order val="0"/>
<c:tx><c:strRef><c:f>${sheetName}!$${valueCol}$1</c:f></c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></c:spPr>
<c:cat><c:strRef><c:f>${catRef}</c:f></c:strRef></c:cat>
<c:val><c:numRef><c:f>${valRef}</c:f></c:numRef></c:val>
</c:ser>`;
};

const barChartXml = ({ sheetName, labelCol, series, rowCount, title, grouping = 'clustered', barDir = 'col' }) => {
  const seriesXml = series.map((s, i) =>
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>
<c:tx><c:strRef><c:f>'${sheetName}'!$${s.col}$1</c:f></c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="${CHART_COLORS[i % CHART_COLORS.length]}"/></a:solidFill></c:spPr>
<c:cat><c:strRef><c:f>'${sheetName}'!$${labelCol}$2:$${labelCol}$${rowCount}</c:f></c:strRef></c:cat>
<c:val><c:numRef><c:f>'${sheetName}'!$${s.col}$2:$${s.col}$${rowCount}</c:f></c:numRef></c:val>
</c:ser>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>
<a:p><a:r><a:rPr lang="zh-CN" sz="1200" b="1"/><a:t>${escapeXml(title)}</a:t></a:r></a:p>
</c:rich></c:tx></c:title><c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="${barDir}"/><c:grouping val="${grouping}"/>
<c:varyColors val="0"/>${seriesXml}
<c:axId val="1"/><c:axId val="2"/>
</c:barChart>
<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling>
<c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx>
<c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>
<c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>
</c:plotArea><c:legend><c:legendPos val="b"/></c:legend>
</c:chart></c:chartSpace>`;
};

const lineChartXml = ({ sheetName, labelCol, series, rowCount, title }) => {
  const seriesXml = series.map((s, i) =>
    `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>
<c:tx><c:strRef><c:f>'${sheetName}'!$${s.col}$1</c:f></c:strRef></c:tx>
<c:spPr><a:ln w="22225"><a:solidFill><a:srgbClr val="${CHART_COLORS[i % CHART_COLORS.length]}"/></a:solidFill></a:ln></c:spPr>
<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>
<c:cat><c:strRef><c:f>'${sheetName}'!$${labelCol}$2:$${labelCol}$${rowCount}</c:f></c:strRef></c:cat>
<c:val><c:numRef><c:f>'${sheetName}'!$${s.col}$2:$${s.col}$${rowCount}</c:f></c:numRef></c:val>
</c:ser>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>
<a:p><a:r><a:rPr lang="zh-CN" sz="1200" b="1"/><a:t>${escapeXml(title)}</a:t></a:r></a:p>
</c:rich></c:tx></c:title><c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>
${seriesXml}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/>
</c:lineChart>
<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling>
<c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx>
<c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling>
<c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>
</c:plotArea><c:legend><c:legendPos val="b"/></c:legend>
</c:chart></c:chartSpace>`;
};

const pieChartXml = ({ sheetName, labelCol, valueCol, rowCount, title }) => {
  const slicesXml = Array.from({ length: rowCount - 1 }, (_, i) =>
    `<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${CHART_COLORS[i % CHART_COLORS.length]}"/></a:solidFill></c:spPr></c:dPt>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>
<a:p><a:r><a:rPr lang="zh-CN" sz="1200" b="1"/><a:t>${escapeXml(title)}</a:t></a:r></a:p>
</c:rich></c:tx></c:title><c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:pieChart><c:varyColors val="1"/>
<c:ser><c:idx val="0"/><c:order val="0"/>
${slicesXml}
<c:cat><c:strRef><c:f>'${sheetName}'!$${labelCol}$2:$${labelCol}$${rowCount}</c:f></c:strRef></c:cat>
<c:val><c:numRef><c:f>'${sheetName}'!$${valueCol}$2:$${valueCol}$${rowCount}</c:f></c:numRef></c:val>
</c:ser>
</c:pieChart>
</c:plotArea><c:legend><c:legendPos val="b"/></c:legend>
</c:chart></c:chartSpace>`;
};

const drawingXml = (charts) => {
  const anchors = charts.map((chart, i) => {
    const fromCol = 5; // F
    const fromRow = 1;
    const toCol = fromCol + 15;
    const toRow = fromRow + 20;
    return `<xdr:twoCellAnchor>
<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro="">
<xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/>
</a:graphicData></a:graphic>
</xdr:graphicFrame><xdr:clientData/>
</xdr:twoCellAnchor>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchors}
</xdr:wsDr>`;
};

const drawingRelsXml = (chartRids) => {
  const rels = chartRids.map((rid) =>
    `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${rid.replace('rId', 'chart')}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
</Relationships>`;
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

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

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

const reportingDepartmentFields = (record) => ({
  deptName: departmentDisplayName(record),
  deptId: firstValue(record, [
    'reporting_dept_id',
    'reportingDeptId',
    'dept_id',
    'deptId',
  ]),
  departmentIdentityKey: departmentIdentityKey(record),
  departmentDisplay: firstValue(record, [
    'department_display',
    'departmentDisplay',
    'reporting_dept_name',
    'reportingDeptName',
    'dept_name',
    'deptName',
    'department',
  ]),
  subDepartmentDisplay: record?.reporting_dept_name || record?.reportingDeptName
    ? ''
    : firstValue(record, ['sub_department_display', 'subDepartmentDisplay']),
  reporting_dept_id: firstValue(record, ['reporting_dept_id', 'reportingDeptId']),
  reporting_dept_name: firstValue(record, ['reporting_dept_name', 'reportingDeptName']),
  reporting_department_identity_key: firstValue(record, [
    'reporting_department_identity_key',
    'reportingDepartmentIdentityKey',
  ]),
  sharedBudgetChild: Boolean(record?.shared_budget_child || record?.sharedBudgetChild),
  sharedBudgetParentAmount: firstValue(record, [
    'shared_budget_parent_amount',
    'sharedBudgetParentAmount',
  ]),
  budgetAmountForTotals: firstValue(record, [
    'budget_amount_for_totals',
    'budgetAmountForTotals',
  ]),
});

const isSharedBudgetChild = (row) => Boolean(row?.shared_budget_child || row?.sharedBudgetChild);

const budgetAmountForTotals = (row, fallback) => {
  if (isSharedBudgetChild(row)) return 0;
  return toAmount(firstValue(row, ['budgetAmountForTotals', 'budget_amount_for_totals'], fallback));
};

const budgetDisplayValue = (row, fallback) => {
  if (!isSharedBudgetChild(row)) return fallback;
  return `共享：${toAmount(firstValue(row, ['sharedBudgetParentAmount', 'shared_budget_parent_amount'], fallback)).toFixed(2)}`;
};

const addGroupedAmount = (map, row, amount, source, reportMonth) => {
  const deptName = departmentDisplayName(row);
  const departmentKey = departmentIdentityKey(row);
  const budgetMonth = String(executionMonthForBudgetRow(row, reportMonth)).trim() || 'Unspecified';
  const key = `${departmentKey}__${budgetMonth}`;
  const current = map.get(key) || {
    deptName,
    departmentIdentityKey: departmentKey,
    budgetMonth,
    productionBudget: 0,
    nonProductionBudget: 0,
    operationApproved: 0,
    purchaseApproved: 0,
    managementApproved: 0,
    salaryApproved: 0,
    officeApproved: 0,
    taxApproved: 0,
    itOperationApproved: 0,
    budgetSubmittedApprovedTotal: 0,
    budgetSubmitted: false,
    sharedBudgetChild: false,
    operationCount: 0,
    purchaseCount: 0,
  };

  if (source === 'production') {
    current.productionBudget += amount;
  } else {
    current.nonProductionBudget += amount;
  }
  current.budgetSubmitted ||= amount > 0 || isSharedBudgetChild(row);
  current.sharedBudgetChild ||= isSharedBudgetChild(row);

  map.set(key, current);
};

const expenseKindLabel = (value) => {
  if (value === 'operation') return '运营支出';
  if (value === 'purchase') return '采购支出';
  return value || '';
};

const splitTypeLabel = (value) => {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'salary') return '工资';
  if (type === 'social_insurance') return '社保公积金';
  if (type === 'office_space') return '办公场地';
  if (type === 'individual_income_tax') return '个税';
  if (type === 'it_operation') return 'IT运维费用';
  return value || '部门拆分';
};

const extractExpenseDeptSplits = (item) => {
  const entries = [];
  const dbSplits = item?.expense_splits || item?.expenseSplits;

  if (Array.isArray(dbSplits)) {
    for (const entry of dbSplits) {
      const dept = String(entry.department || '').trim();
      const amt = toAmount(entry.amount);
      if (dept && amt > 0) {
        const rollupDepartment = firstValue(entry, ['rollup_dept_name', 'rollupDeptName']);
        const rollupDepartmentId = firstValue(entry, ['rollup_dept_id', 'rollupDeptId']);
        entries.push({
          department: rollupDepartment || departmentDisplayName(entry),
          departmentId: firstValue(entry, ['reporting_dept_id', 'reportingDeptId', 'rollup_dept_id', 'rollupDeptId', 'department_id', 'departmentId']),
          departmentIdentityKey: rollupDepartmentId ? `id:${rollupDepartmentId}` : departmentIdentityKey(entry),
          amount: amt,
          splitType: entry.split_type || entry.splitType || '',
          note: entry.note || '',
          rollupDepartment,
        });
      }
    }
    return entries;
  }

  const splitColumns = [
    { col: 'salary_by_department', splitType: 'salary' },
    { col: 'social_insurance_by_department', splitType: 'social_insurance' },
    { col: 'office_space_by_department', splitType: 'office_space' },
    { col: 'individual_income_tax_by_department', splitType: 'individual_income_tax' },
    { col: 'it_operation_by_department', splitType: 'it_operation' },
  ];

  for (const { col, splitType } of splitColumns) {
    const data = item?.[col];
    if (!data || !Array.isArray(data)) continue;
    for (const entry of data) {
      const dept = String(entry.department || '').trim();
      const amt = toAmount(entry.amount);
      if (dept && amt > 0) {
        const rollupDepartment = firstValue(entry, ['rollup_dept_name', 'rollupDeptName']);
        const rollupDepartmentId = firstValue(entry, ['rollup_dept_id', 'rollupDeptId']);
        entries.push({
          department: rollupDepartment || departmentDisplayName(entry),
          departmentId: firstValue(entry, ['reporting_dept_id', 'reportingDeptId', 'rollup_dept_id', 'rollupDeptId', 'department_id', 'departmentId']),
          departmentIdentityKey: rollupDepartmentId ? `id:${rollupDepartmentId}` : departmentIdentityKey(entry),
          amount: amt,
          splitType,
          note: entry.note || '',
          rollupDepartment,
        });
      }
    }
  }

  return entries;
};

export const buildApprovedDetailRows = (approvedExpenseDetails = []) => {
  const paymentSequences = buildPaymentSequenceMap(approvedExpenseDetails);
  const paymentCounts = buildPaymentCountMap(approvedExpenseDetails);
  return approvedExpenseDetails
    .flatMap((item) => {
      const splits = extractExpenseDeptSplits(item);
      const baseAmount = toAmount(firstValue(item, ['base_currency_amount', 'detail_summary_amount', 'amount_rmb', 'amount', 'source_amount', 'total_amount'], ''));
      const accountingAt = paymentEventDate(item);
      const paymentSequence = paymentSequences.get(paymentEventKey(item)) || 0;
      const paymentEventLabelValue = paymentEventLabel(
        item,
        paymentSequence,
        paymentCounts.get(item?.business_id) || 0,
      );
      const paymentEvidence = paymentEventEvidence(item);
      const month = firstValue(item, ['query_month'], formatMonth(accountingAt));

      if (splits.length === 0) {
        // 无拆分：保持原有的单行
        const rollupDepartment = firstValue(item, ['rollup_dept_name', 'rollupDeptName']);
        const rollupDepartmentId = firstValue(item, ['rollup_dept_id', 'rollupDeptId']);
        const department = rollupDepartment || departmentDisplayName(item);
        return [{
          expenseKind: expenseKindLabel(item.expense_kind),
          department,
          departmentId: firstValue(item, [
            'reporting_dept_id',
            'reportingDeptId',
            'rollup_dept_id',
            'rollupDeptId',
            'applicant_department_id',
            'department_id',
            'creator_department_id',
          ], ''),
          departmentIdentityKey: rollupDepartmentId
            ? `id:${rollupDepartmentId}`
            : departmentIdentityKey({ ...item, deptName: department, businessId: item.business_id }),
          month,
          businessId: item.business_id,
          title: item.title,
          amount: firstValue(item, ['amount', 'detail_summary_amount', 'source_amount', 'total_amount', 'base_currency_amount'], ''),
          baseCurrencyAmount: baseAmount,
          approvalStatus: item.approval_status,
          requestDate: formatDate(item.request_date),
          sourceCreatedAt: formatDate(item.source_created_at),
          approvalCompletedAt: formatDate(item.approval_completed_at),
          accountingAt: formatDate(accountingAt),
          accountingSource: item.accounting_source || '',
          paymentEventLabel: paymentEventLabelValue,
          paymentEvidence,
          paymentAmount: item.accounting_source === 'payment_event'
            ? firstValue(item, ['payment_event_amount', 'amount', 'detail_summary_amount', 'base_currency_amount'], '')
            : '',
          bizAction: item.biz_action,
          splitNote: paymentEvidence,
          rollupDepartment: firstValue(item, ['rollup_dept_name', 'rollupDeptName']),
        }];
      }

      // 有部门拆分：直接使用 approval_expense_dept_split.amount，不再按原单总额二次分摊。
      return splits.map((entry) => ({
        expenseKind: expenseKindLabel(item.expense_kind),
        department: entry.department,
        departmentId: entry.departmentId,
        departmentIdentityKey: entry.departmentIdentityKey || departmentIdentityKey({
          ...entry,
          businessId: item.business_id,
        }),
        month,
        businessId: item.business_id,
        title: item.title,
        amount: entry.amount,
        baseCurrencyAmount: entry.amount,
        approvalStatus: item.approval_status,
        requestDate: formatDate(item.request_date),
        sourceCreatedAt: formatDate(item.source_created_at),
        approvalCompletedAt: formatDate(item.approval_completed_at),
        accountingAt: formatDate(accountingAt),
        accountingSource: item.accounting_source || '',
        paymentEventLabel: paymentEventLabelValue,
        paymentEvidence,
        paymentAmount: item.accounting_source === 'payment_event' ? entry.amount : '',
        bizAction: item.biz_action,
        splitNote: `${splitTypeLabel(entry.splitType)}拆分自 ${item.business_id || ''}${entry.note ? `：${entry.note}` : ''}`,
        rollupDepartment: entry.rollupDepartment || firstValue(item, ['rollup_dept_name', 'rollupDeptName']),
      }));
    })
    .sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.department).localeCompare(String(b.department)));
};

export const buildExecutionRows = ({ productionRows, operationRows, approvedExpenses, reportMonth }) => {
  const grouped = new Map();

  for (const row of productionRows) {
    addGroupedAmount(grouped, row, budgetAmountForTotals(row, row.requestAmount), 'production', reportMonth);
  }

  for (const row of operationRows) {
    addGroupedAmount(grouped, row, budgetAmountForTotals(row, row.amount), 'nonProduction', reportMonth);
  }

  for (const item of approvedExpenses || []) {
    const deptName = departmentDisplayName(item);
    const departmentKey = departmentIdentityKey(item);
    const budgetMonth = String(item.month || '').trim() || 'Unspecified';
    const key = `${departmentKey}__${budgetMonth}`;
    const current = grouped.get(key) || {
      deptName,
      departmentIdentityKey: departmentKey,
      budgetMonth,
      productionBudget: 0,
      nonProductionBudget: 0,
      operationApproved: 0,
      purchaseApproved: 0,
      managementApproved: 0,
      salaryApproved: 0,
      officeApproved: 0,
      taxApproved: 0,
      itOperationApproved: 0,
      budgetSubmittedApprovedTotal: 0,
      budgetSubmitted: false,
      sharedBudgetChild: false,
      operationCount: 0,
      purchaseCount: 0,
    };

    current.operationApproved += toAmount(item.operationTotal);
    current.purchaseApproved += toAmount(item.purchaseTotal);
    current.managementApproved += toAmount(item.managementTotal);
    current.salaryApproved += toAmount(item.salaryTotal);
    current.officeApproved += toAmount(item.officeTotal);
    current.taxApproved += toAmount(item.taxTotal);
    current.itOperationApproved += toAmount(item.itOperationTotal);
    current.operationCount += Number(item.operationCount || 0);
    current.purchaseCount += Number(item.purchaseCount || 0);
    if (current.budgetSubmitted) {
      const classifiedApproved = toAmount(item.managementTotal) + toAmount(item.salaryTotal) + toAmount(item.officeTotal) + toAmount(item.taxTotal) + toAmount(item.itOperationTotal);
      const fallbackApproved = toAmount(item.operationTotal) + toAmount(item.purchaseTotal);
      current.budgetSubmittedApprovedTotal += classifiedApproved > 0 ? classifiedApproved : fallbackApproved;
    }
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((row) => {
      const totalBudget = row.productionBudget + row.nonProductionBudget;
      const classifiedApproved = row.managementApproved + row.salaryApproved + row.officeApproved + row.taxApproved + row.itOperationApproved;
      const totalApproved = classifiedApproved > 0
        ? classifiedApproved
        : row.operationApproved + row.purchaseApproved;
      return {
        ...row,
        totalBudget,
        totalApproved,
        budgetSubmittedApprovedTotal: toAmount(row.budgetSubmittedApprovedTotal),
        sharedBudgetChild: Boolean(row.sharedBudgetChild),
        remainingBudget: totalBudget - totalApproved,
        executionRate: totalBudget > 0 ? `${((totalApproved / totalBudget) * 100).toFixed(2)}%` : '',
      };
    })
    .sort((a, b) => String(a.budgetMonth).localeCompare(String(b.budgetMonth)) || String(a.deptName).localeCompare(String(b.deptName)));
};

export const sumRows = (rows, key) => rows.reduce((sum, row) => sum + toAmount(row[key]), 0);

export const buildReportSummaryRows = ({
  productionCount,
  nonProductionCount,
  productionRows,
  operationRows,
  approvedDetailRows,
  budgetShareRows,
  expenseShareRows,
  executionRows,
}) => [
  ['指标', '数值'],
  ['生产预算单数', productionCount],
  ['非生产预算单数', nonProductionCount],
  ['生产预算明细行数', productionRows.length],
  ['非生产预算明细行数', operationRows.length],
  ['实际支出明细行数', approvedDetailRows.length],
  ['预算占比分组数', budgetShareRows.length],
  ['支出占比分组数', expenseShareRows.length],
  ['生产预算金额', sumRows(executionRows, 'productionBudget').toFixed(2)],
  ['非生产预算金额', sumRows(executionRows, 'nonProductionBudget').toFixed(2)],
  ['管理支出金额', sumRows(executionRows, 'managementApproved').toFixed(2)],
  ['工资/公积金支出金额', sumRows(executionRows, 'salaryApproved').toFixed(2)],
  ['办公场地支出金额', sumRows(executionRows, 'officeApproved').toFixed(2)],
  ['个税支出金额', sumRows(executionRows, 'taxApproved').toFixed(2)],
  ['IT运维费用支出金额', sumRows(executionRows, 'itOperationApproved').toFixed(2)],
  ['实际支出合计', sumRows(executionRows, 'totalApproved').toFixed(2)],
  ['有提交预算部门支出合计', sumRows(executionRows, 'budgetSubmittedApprovedTotal').toFixed(2)],
  ['剩余额度', sumRows(executionRows, 'remainingBudget').toFixed(2)],
];

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
    ...operationRows.filter((row) => !isSharedBudgetChild(row)).map((row) => ({
      department: departmentDisplayName(row),
      departmentIdentityKey: departmentIdentityKey(row),
      month: executionMonthForBudgetRow(row, reportMonth),
      category: row.project || row.budgetType || '未分类',
      detail: row.detailItem || row.project || row.budgetType || '未分类',
      amount: toAmount(row.amount),
      formNo: row.formNo,
    })),
    ...productionRows.filter((row) => !isSharedBudgetChild(row)).map((row) => ({
      department: departmentDisplayName(row),
      departmentIdentityKey: departmentIdentityKey(row),
      month: executionMonthForBudgetRow(row, reportMonth),
      category: row.category || '生产预算',
      detail: row.detailCategory || row.code || row.category || '未分类',
      amount: toAmount(row.requestAmount),
      formNo: row.formNo,
    })),
  ];

  return groupShareRows(rows, ['departmentIdentityKey', 'month'], 'amount');
};

const buildExpenseShareRows = (approvedDetailRows) => {
  const rows = approvedDetailRows.map((row) => ({
    department: row.department || 'Unknown',
    departmentIdentityKey: departmentIdentityKey(row),
    month: row.month || 'Unspecified',
    category: row.expenseKind || '未分类',
    detail: row.title || row.expenseKind || '未分类',
    amount: toAmount(row.baseCurrencyAmount || row.amount),
    formNo: row.businessId,
  }));

  return groupShareRows(rows, ['departmentIdentityKey', 'month'], 'amount');
};

export const createBudgetReportWorkbook = ({ production = [], nonProduction = [], approvedExpenses = [], approvedExpenseDetails = [], reportStartDate = '', reportEndDate = '' }) => {
  const operationRows = buildOperationRows(nonProduction);
  const productionRows = buildProductionRows(production);
  const reportMonth = resolveReportMonth(reportStartDate, reportEndDate);
  const executionRows = buildExecutionRows({ productionRows, operationRows, approvedExpenses, reportMonth });
  const approvedDetailRows = buildApprovedDetailRows(approvedExpenseDetails);
  const budgetShareRows = buildBudgetShareRows({ productionRows, operationRows, reportMonth });
  const expenseShareRows = buildExpenseShareRows(approvedDetailRows);
  const productionBudgetRecords = production.filter((row) => !isSharedBudgetChild(row));
  const nonProductionBudgetRecords = nonProduction.filter((row) => !isSharedBudgetChild(row));

  const operationSheetRows = [
    ['序号', '所属部门', '预算归属', '预算类型', '申请日期', '预算月份', '预算项目', '预算金额', '币种', '明细项目', '明细金额', '计算依据', '表单编号', '状态', '创建日期'],
    ...operationRows.map((row, index) => [
      index + 1,
      row.deptName,
      row.sharedBudgetChild ? '共享父部门预算' : '本部门预算',
      row.budgetType,
      row.applicationDate,
      row.budgetMonth,
      row.project,
      row.originalAmount,
      row.currency,
      row.detailItem,
      budgetDisplayValue(row, row.amount),
      row.basis,
      row.formNo,
      row.status,
      formatDate(row.createTime),
    ]),
  ];

  const productionSheetRows = [
    ['序号', '所属部门', '预算归属', '预算类型', '申请日期', '预算周期', '预算类别', '明细类别', '编码/费用明细', '规格/产线/岗位', '单位', '单价', '预计加班时长', '加班单价', '预算加班费', '月度预算总量', '本次申请数量', '本次申请金额', '上期已用', '用途/费用归属', '经办人', '备注', '表单编号'],
    ...productionRows.map((row, index) => [
      index + 1,
      row.deptName,
      row.sharedBudgetChild ? '共享父部门预算' : '本部门预算',
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
      budgetDisplayValue(row, row.monthlyTotal),
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
    ['序号', '所属部门', '预算归属', '月份', '生产预算', '非生产预算', '预算合计', '管理支出', '工资/公积金支出', '办公场地支出', '个税支出', 'IT运维费用支出', '实际支出合计', '剩余额度', '执行率', '运营支出单数', '采购支出单数'],
    ...executionRows.map((row, index) => [
      index + 1,
      row.deptName,
      row.sharedBudgetChild ? '共享父部门预算' : '本部门预算',
      row.budgetMonth,
      row.productionBudget.toFixed(2),
      row.nonProductionBudget.toFixed(2),
      row.totalBudget.toFixed(2),
      row.managementApproved.toFixed(2),
      row.salaryApproved.toFixed(2),
      row.officeApproved.toFixed(2),
      row.taxApproved.toFixed(2),
      row.itOperationApproved.toFixed(2),
      row.totalApproved.toFixed(2),
      row.remainingBudget.toFixed(2),
      row.executionRate,
      row.operationCount,
      row.purchaseCount,
    ]),
  ];

  const summarySheetRows = [
    ['指标', '数值'],
    ['生产预算单数', productionBudgetRecords.length],
    ['非生产预算单数', nonProductionBudgetRecords.length],
    ['生产预算明细行数', productionRows.length],
    ['非生产预算明细行数', operationRows.length],
    ['实际支出明细行数', approvedDetailRows.length],
    ['预算占比分类数', budgetShareRows.length],
    ['支出占比分类数', expenseShareRows.length],
    ['生产预算金额', sumRows(executionRows, 'productionBudget').toFixed(2)],
    ['非生产预算金额', sumRows(executionRows, 'nonProductionBudget').toFixed(2)],
    ['管理支出金额', sumRows(executionRows, 'managementApproved').toFixed(2)],
    ['工资/公积金支出金额', sumRows(executionRows, 'salaryApproved').toFixed(2)],
    ['办公场地支出金额', sumRows(executionRows, 'officeApproved').toFixed(2)],
    ['IT运维费用支出金额', sumRows(executionRows, 'itOperationApproved').toFixed(2)],
    ['实际支出合计', sumRows(executionRows, 'totalApproved').toFixed(2)],
    ['剩余额度', sumRows(executionRows, 'remainingBudget').toFixed(2)],
  ];

  executionSheetRows[0].splice(12, 0, '有提交预算部门支出合计');
  for (let i = 1; i < executionSheetRows.length; i += 1) {
    executionSheetRows[i].splice(12, 0, executionRows[i - 1].budgetSubmittedApprovedTotal.toFixed(2));
  }

  summarySheetRows.splice(
    0,
    summarySheetRows.length,
    ...buildReportSummaryRows({
      productionCount: productionBudgetRecords.length,
      nonProductionCount: nonProductionBudgetRecords.length,
      productionRows,
      operationRows,
      approvedDetailRows,
      budgetShareRows,
      expenseShareRows,
      executionRows,
    }),
  );

  const approvedDetailSheetRows = [
    ['序号', '支出类型', '所属部门', '汇总部门', '月份', '业务编号', '标题', '原始金额', '本位币金额(CNY)', '审批状态', '申请日期', '创建日期', '审批完成日期', '记账日期', '记账来源', '付款期次', '付款金额', '付款评论', '业务动作', '备注'],
    ...approvedDetailRows.map((row, index) => [
      index + 1,
      row.expenseKind,
      row.department,
      row.rollupDepartment || row.department,
      row.month,
      row.businessId,
      row.title,
      row.amount,
      row.baseCurrencyAmount,
      row.approvalStatus,
      row.requestDate,
      row.sourceCreatedAt,
      row.approvalCompletedAt,
      row.accountingAt,
      row.accountingSource,
      row.paymentEventLabel,
      row.paymentAmount,
      row.paymentEvidence,
      row.bizAction,
      row.splitNote || '',
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

  // --- 可视化报表数据 sheet ---

  // 预算类型占比（生产 vs 非生产）
  const productionGrandTotal = productionRows.reduce((s, r) => s + budgetAmountForTotals(r, r.requestAmount), 0);
  const nonProductionGrandTotal = operationRows.reduce((s, r) => s + budgetAmountForTotals(r, r.amount), 0);
  const grandTotal = productionGrandTotal + nonProductionGrandTotal;

  // 部门执行率（Top 10）
  const execRateRows = executionRows
    .map((r) => ({
      deptName: r.deptName,
      budgetMonth: r.budgetMonth,
      productionBudget: toAmount(r.productionBudget),
      nonProductionBudget: toAmount(r.nonProductionBudget),
      totalBudget: toAmount(r.totalBudget),
      totalApproved: toAmount(r.totalApproved),
      remainingBudget: toAmount(r.remainingBudget),
      executionRate: r.totalBudget > 0 ? Number(((toAmount(r.totalApproved) / toAmount(r.totalBudget)) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.executionRate - a.executionRate)
    .slice(0, 10);

  // --- 构建 sheet rows ---

  const typeDistributionSheetRows = [
    ['预算类型', '金额', '占比'],
    ['生产预算', productionGrandTotal.toFixed(2), grandTotal > 0 ? `${((productionGrandTotal / grandTotal) * 100).toFixed(2)}%` : '0%'],
    ['非生产预算', nonProductionGrandTotal.toFixed(2), grandTotal > 0 ? `${((nonProductionGrandTotal / grandTotal) * 100).toFixed(2)}%` : '0%'],
    ['合计', grandTotal.toFixed(2), '100%'],
  ];

  const execRateSheetRows = [
    ['序号', '所属部门', '预算月份', '预算总额', '实际支出', '剩余额度', '执行率'],
    ...execRateRows.map((r, i) => [
      i + 1,
      r.deptName,
      r.budgetMonth,
      r.totalBudget.toFixed(2),
      r.totalApproved.toFixed(2),
      r.remainingBudget.toFixed(2),
      `${r.executionRate}%`,
    ]),
  ];

  // 6. 地区预算分布
  const normalizeRegion = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.includes('中国') || text.toLowerCase().includes('china')) return '中国';
    if (text.includes('墨西哥') || text.toLowerCase().includes('méxico') || text.toLowerCase().includes('mexico')) return '墨西哥';
    return '';
  };
  const regionMap = new Map();
  for (const r of productionBudgetRecords) {
    const region = normalizeRegion(r.execution_region);
    if (!region) continue;
    const cur = regionMap.get(region) || { region, production: 0, nonProduction: 0 };
    cur.production += toAmount(r.total_amount || r.monthly_budget_amount);
    regionMap.set(region, cur);
  }
  for (const r of nonProductionBudgetRecords) {
    const region = normalizeRegion(r.execution_region);
    if (!region) continue;
    const cur = regionMap.get(region) || { region, production: 0, nonProduction: 0 };
    cur.nonProduction += toAmount(r.total_amount || r.budget_amount);
    regionMap.set(region, cur);
  }
  const regionRows = [...regionMap.values()]
    .map((item) => ({ ...item, total: item.production + item.nonProduction }))
    .sort((a, b) => b.total - a.total);

  const regionSheetRows = [
    ['序号', '执行地区', '生产预算金额', '非生产预算金额', '预算合计'],
    ...regionRows.map((r, i) => [
      i + 1,
      r.region,
      r.production.toFixed(2),
      r.nonProduction.toFixed(2),
      r.total.toFixed(2),
    ]),
  ];

  // 7. 预算执行状态分布（按部门 Top 10）
  const execStatusMap = new Map();
  for (const row of executionRows) {
    const dept = departmentDisplayName(row);
    const key = departmentIdentityKey(row);
    const cur = execStatusMap.get(key) || { deptName: dept, departmentIdentityKey: key, totalBudget: 0, executed: 0, inProgress: 0 };
    cur.totalBudget += toAmount(row.totalBudget);
    cur.executed += toAmount(row.totalApproved);
    execStatusMap.set(key, cur);
  }
  for (const r of productionBudgetRecords) {
    if (r.status === '审批中') {
      const dept = departmentDisplayName(r);
      const key = departmentIdentityKey(r);
      const cur = execStatusMap.get(key) || { deptName: dept, departmentIdentityKey: key, totalBudget: 0, executed: 0, inProgress: 0 };
      cur.inProgress += toAmount(r.total_amount || r.monthly_budget_amount);
      execStatusMap.set(key, cur);
    }
  }
  for (const r of nonProductionBudgetRecords) {
    if (r.status === '审批中') {
      const dept = departmentDisplayName(r);
      const key = departmentIdentityKey(r);
      const cur = execStatusMap.get(key) || { deptName: dept, departmentIdentityKey: key, totalBudget: 0, executed: 0, inProgress: 0 };
      cur.inProgress += toAmount(r.total_amount || r.budget_amount);
      execStatusMap.set(key, cur);
    }
  }
  const execStatusRows = [...execStatusMap.values()]
    .map((item) => ({
      ...item,
      unexecuted: Math.max(0, item.totalBudget - item.executed - item.inProgress),
    }))
    .sort((a, b) => (b.totalBudget) - (a.totalBudget))
    .slice(0, 10);

  const execStatusSheetRows = [
    ['序号', '所属部门', '预算总额', '已执行', '审批中', '未执行'],
    ...execStatusRows.map((r, i) => [
      i + 1,
      r.deptName,
      r.totalBudget.toFixed(2),
      r.executed.toFixed(2),
      r.inProgress.toFixed(2),
      r.unexecuted.toFixed(2),
    ]),
  ];

  // ── Charts: define which sheets get embedded charts ────────────────────

  const execRateRowCount = execRateRows.length + 1;

  // Sheet index (1-based) → chart definition
  const chartDefs = [
    { sheetIndex: 4, sheetName: '预算类型占比', chart: pieChartXml({ sheetName: '预算类型占比', labelCol: 'A', valueCol: 'B', rowCount: 4, title: '预算类型占比' }) },
    { sheetIndex: 5, sheetName: '部门执行率', chart: barChartXml({ sheetName: '部门执行率', labelCol: 'B', series: [{ col: 'G' }], rowCount: execRateRowCount, title: '各部门执行率', grouping: 'clustered', barDir: 'bar' }) },
  ];

  const sheets = [
    { name: '汇总', rows: summarySheetRows, widths: [28, 18] },
    { name: '地区预算分布', rows: regionSheetRows, widths: [8, 14, 18, 18, 18] },
    { name: '执行状态分布', rows: execStatusSheetRows, widths: [8, 28, 18, 18, 18, 18] },
    { name: '预算类型占比', rows: typeDistributionSheetRows, widths: [18, 18, 14] },
    { name: '部门执行率', rows: execRateSheetRows, widths: [8, 28, 14, 18, 18, 18, 12] },
    { name: '部门预算占比', rows: budgetShareSheetRows, widths: [8, 28, 14, 18, 28, 16, 18, 12, 10] },
    { name: '部门支出占比', rows: expenseShareSheetRows, widths: [8, 28, 14, 14, 40, 18, 20, 12, 10] },
    { name: '实际支出明细', rows: approvedDetailSheetRows, widths: [8, 12, 28, 14, 24, 36, 14, 18, 14, 14, 14, 16, 14] },
    { name: '非生产预算明细', rows: operationSheetRows, widths: [8, 22, 16, 14, 14, 18, 14, 10, 24, 14, 34, 22, 14, 14] },
  ];

  const chartSet = new Set(chartDefs.map((d) => d.sheetIndex));

  // Content types with chart and drawing overrides
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n  ')}
  ${chartDefs.map((_, i) => `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('\n  ')}
  ${chartDefs.map((d) => `<Override PartName="/xl/drawings/drawing${d.sheetIndex}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('\n  ')}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const files = [
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXmlForSheets(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXmlForSheets(sheets) },
    { name: 'xl/styles.xml', content: stylesXml },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml({ rows: sheet.rows, widths: sheet.widths, hasDrawing: chartSet.has(index + 1) }),
    })),
    // Chart XML files
    ...chartDefs.map((def, i) => ({
      name: `xl/charts/chart${i + 1}.xml`,
      content: def.chart,
    })),
    // Drawing XML files (one per sheet with a chart)
    ...chartDefs.map((def) => ({
      name: `xl/drawings/drawing${def.sheetIndex}.xml`,
      content: drawingXml([{ rid: 'rId1' }]),
    })),
    // Drawing relationship files
    ...chartDefs.map((def, i) => ({
      name: `xl/drawings/_rels/drawing${def.sheetIndex}.xml.rels`,
      content: drawingRelsXml(['rId1']),
    })),
    // Sheet relationship files (for sheets with drawings)
    ...chartDefs.map((def) => ({
      name: `xl/worksheets/_rels/sheet${def.sheetIndex}.xml.rels`,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${def.sheetIndex}.xml"/>
</Relationships>`,
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
