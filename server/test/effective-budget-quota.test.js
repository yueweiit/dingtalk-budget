import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildEffectiveBudgetQuota,
  buildEffectiveBudgetSubjects,
  companyFromDepartmentPath,
  organizationFromDepartmentPath,
  resolveLegacyEffectiveQuotaDepartment,
  synchronizeEffectiveBudgetQuota,
} from '../services/effective-budget-quota.js';

const detail = {
  corpId: 'corp-yuewei',
  processInstanceId: 'process-budget-1',
  processCode: 'PROC-BUDGET',
  status: 'COMPLETED',
  result: 'agree',
  finishTime: '2026-09-02T03:00:00.000Z',
  originatorUserId: 'owner-1',
  originatorUserName: '',
};

const budget = {
  form_no: '202609020001000000001',
  budget_month: '2026-09',
  dept_id: 'dept-hr',
  dept_name: 'HR 人力资源中心',
  dept_path_ids: ['1', 'group-yuewei', 'company-xingming', 'dept-hr'],
  dept_path_names: ['ROOT', '悦为集团YUEWEI Grupo', '东莞星铭', 'HR 人力资源中心'],
  dept_source: 'form_id',
  creator_name: '张三',
  creator_userid: 'owner-1',
  total_amount: 8201.88,
};

const detailGroups = [
  {
    subjectType: 'hr',
    sourceTable: 'budget_hr',
    items: [{ detail_item: '招聘费用', amount: 5000 }],
  },
  {
    subjectType: 'operation',
    sourceTable: 'budget_operation',
    items: [{ budget_purpose_detail: '管理服务费', amount: 4211.88 }],
  },
];

test('uses the approved form total as the effective quota and flags a detail mismatch', () => {
  const quota = buildEffectiveBudgetQuota({
    detail,
    budget,
    budgetType: 'non_production',
    detailGroups,
  });

  assert.equal(quota.corp_id, 'corp-yuewei');
  assert.equal(quota.process_instance_id, 'process-budget-1');
  assert.equal(quota.budget_year, 2026);
  assert.equal(quota.budget_month, '2026-09');
  assert.equal(quota.group_dept_id, 'group-yuewei');
  assert.equal(quota.group_name, '悦为集团YUEWEI Grupo');
  assert.equal(quota.company_dept_id, 'company-xingming');
  assert.equal(quota.company_name, '东莞星铭');
  assert.equal(quota.department_id, 'dept-hr');
  assert.equal(quota.owner_user_id, 'owner-1');
  assert.equal(quota.owner_name, '张三');
  assert.equal(quota.total_amount, 8201.88);
  assert.equal(quota.detail_amount, 9211.88);
  assert.equal(quota.detail_amount_mismatch, true);
  assert.deepEqual(quota.subjects.map((subject) => [subject.subject_type, subject.subject_name]), [
    ['hr', '招聘费用'],
    ['operation', '管理服务费'],
  ]);
});

test('does not infer a company without the group-to-company department path', () => {
  assert.deepEqual(
    companyFromDepartmentPath(['1', 'other-company'], ['ROOT', '其他公司']),
    { company_dept_id: null, company_name: null }
  );
});

test('uses only the known group root when deriving organization levels', () => {
  assert.deepEqual(
    organizationFromDepartmentPath(
      ['1', 'company-yuewei-mx', 'dept-1'],
      ['ROOT', 'YUEWEI MX', '运营部']
    ),
    {
      group_dept_id: null,
      group_name: null,
      company_dept_id: null,
      company_name: null,
    }
  );
});

test('preserves subject rows in source order with category-specific codes', () => {
  const subjects = buildEffectiveBudgetSubjects([
    {
      subjectType: 'material',
      sourceTable: 'budget_material',
      items: [{ detail_code: 'MAT-01', detail_category: '原材料', amount: 10 }],
    },
    {
      subjectType: 'labor',
      sourceTable: 'budget_labor',
      items: [{ item_name: '临时工', amount: 20 }],
    },
  ]);

  assert.deepEqual(subjects.map((subject) => [subject.line_no, subject.subject_code, subject.subject_name]), [
    [1, 'material:MAT-01', '原材料'],
    [2, 'labor', '临时工'],
  ]);
});

test('deactivates a rejected quota without deleting its audit rows', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rowCount: 1, rows: [] };
    },
  };

  const result = await synchronizeEffectiveBudgetQuota(client, {
    detail: { ...detail, status: 'TERMINATED', result: 'refuse' },
    budget,
    budgetType: 'non_production',
    detailGroups,
    approved: false,
  });

  assert.deepEqual(result, { synchronized: true, status: 'inactive', updated: 1 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE budget_effective_quota/i);
  assert.match(calls[0].sql, /status = 'inactive'/i);
  assert.doesNotMatch(calls[0].sql, /DELETE FROM budget_effective_quota/i);
});

test('upserts one approved quota and replaces its source subject rows', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return /RETURNING id/i.test(sql) ? { rowCount: 1, rows: [{ id: 99 }] } : { rowCount: 1, rows: [] };
    },
  };

  const result = await synchronizeEffectiveBudgetQuota(client, {
    detail,
    budget,
    budgetType: 'non_production',
    detailGroups,
    approved: true,
  });

  assert.deepEqual(result, {
    synchronized: true,
    status: 'effective',
    quotaId: 99,
    subjectCount: 2,
    detailAmountMismatch: true,
  });
  assert.equal(calls.filter((call) => /INSERT INTO budget_effective_quota\s*\(/i.test(call.sql)).length, 1);
  assert.equal(calls.filter((call) => /DELETE FROM budget_effective_quota_subject/i.test(call.sql)).length, 1);
  assert.equal(calls.filter((call) => /INSERT INTO budget_effective_quota_subject/i.test(call.sql)).length, 2);
});

test('fresh and migration schemas define the effective quota source key and subject table', async () => {
  const publicPath = fileURLToPath(new URL('../../public.sql', import.meta.url));
  const migrationPath = fileURLToPath(new URL('../../migrate.sql', import.meta.url));
  const [publicSchema, migration] = await Promise.all([
    readFile(publicPath, 'utf8'),
    readFile(migrationPath, 'utf8'),
  ]);

  for (const schema of [publicSchema, migration]) {
    assert.match(schema, /budget_effective_quota/i);
    assert.match(schema, /budget_effective_quota_subject/i);
    assert.match(schema, /UNIQUE\s*\("corp_id",\s*"process_instance_id"\)/i);
  }
});

test('maps verified legacy departments to their current organization without name guessing', () => {
  const mapped = resolveLegacyEffectiveQuotaDepartment({
    corpId: 'ding144583309b2fb01c35c2f4657eb6378f',
    departmentId: '1060178527',
    ownerUserId: '0217304551217188371',
  });

  assert.deepEqual(mapped, {
    departmentId: '1090006841',
    departmentName: '供应链及采购执行单元Unidad de Ejecución de Cadena de Suministro y Compras',
    departmentPathIds: ['1', '1004758048', '1089383728', '1090006841'],
    departmentPathNames: [
      'ROOT',
      '悦为集团YUEWEI Grupo',
      'Guangzhou Lingxiang广州凌翔',
      '供应链及采购执行单元Unidad de Ejecución de Cadena de Suministro y Compras',
    ],
  });
});

test('requires the verified owner for legacy departments that later split', () => {
  const base = {
    corpId: 'ding144583309b2fb01c35c2f4657eb6378f',
    departmentId: '1059483024',
  };

  assert.equal(resolveLegacyEffectiveQuotaDepartment({
    ...base,
    ownerUserId: 'other-user',
  }), null);
  assert.deepEqual(resolveLegacyEffectiveQuotaDepartment({
    ...base,
    ownerUserId: '163527194432506164',
  }), {
    departmentId: '1089990115',
    departmentName: 'LatínGo拉丁购',
    departmentPathIds: ['1', '1004758048', '1089990115'],
    departmentPathNames: ['ROOT', '悦为集团YUEWEI Grupo', 'LatínGo拉丁购'],
  });
});

test('keeps PMO and SG legacy departments pending confirmation', () => {
  for (const departmentId of ['1058952936', '1059634386']) {
    assert.equal(resolveLegacyEffectiveQuotaDepartment({
      corpId: 'ding144583309b2fb01c35c2f4657eb6378f',
      departmentId,
      ownerUserId: 'any-user',
    }), null);
  }
});

test('applies the legacy mapping while building an effective quota', () => {
  const quota = buildEffectiveBudgetQuota({
    detail: { ...detail, corpId: 'ding144583309b2fb01c35c2f4657eb6378f' },
    budget: {
      ...budget,
      dept_id: '1079492125',
      dept_name: 'FC CN财务中心 Centro de finanzas',
      dept_path_ids: [],
      dept_path_names: [],
      creator_userid: '02183637680221426194',
    },
    budgetType: 'non_production',
    detailGroups,
  });

  assert.equal(quota.department_id, '1089928990');
  assert.equal(quota.company_dept_id, '1109001296');
  assert.equal(quota.company_name, 'Dongguan Xingming东莞星铭');
  assert.equal(quota.organization_is_current, true);
});

test('backfill requires an explicit time range, supports flow_result, and fails its process on item errors', async () => {
  const scriptPath = fileURLToPath(new URL('../scripts/backfill-effective-budget-quota.js', import.meta.url));
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /timestampArgument\('start'\)/);
  assert.match(source, /timestampArgument\('end'\)/);
  assert.match(source, /缺少 --\$\{name\}=<ISO 日期时间>/);
  assert.match(source, /detail\?\.flow_result/);
  assert.match(source, /if \(summary\.failed > 0\) process\.exitCode = 1;/);
});
