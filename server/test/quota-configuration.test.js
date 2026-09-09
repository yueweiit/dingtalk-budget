import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildQuotaConfigurationWhere,
  normalizeQuotaConfigurationFilters,
  parseQuotaConfigurationPagination,
  quotaConfigurationRowsSql,
} from '../services/quota-configuration.js';

test('normalizes the supported effective quota configuration filters', () => {
  assert.deepEqual(
    normalizeQuotaConfigurationFilters({
      budgetYear: '2026',
      budgetMonth: '2026-09',
      groupDeptId: 'group-1',
      companyDeptId: 'company-1',
      departmentId: 'dept-1',
      subjectName: '招聘费用',
      budgetType: 'non_production',
    }),
    {
      budgetYear: 2026,
      budgetMonth: '2026-09',
      groupDeptId: 'group-1',
      companyDeptId: 'company-1',
      departmentId: 'dept-1',
      subjectName: '招聘费用',
      budgetType: 'non_production',
    }
  );
});

test('rejects malformed quota configuration filters and pagination', () => {
  assert.throws(
    () => normalizeQuotaConfigurationFilters({ budgetMonth: '2026-13' }),
    /预算月份格式无效/
  );
  assert.throws(
    () => parseQuotaConfigurationPagination({ pageSize: '101' }),
    /分页参数超出范围/
  );
});

test('limits department supervisors to their own department subtree', () => {
  const scoped = buildQuotaConfigurationWhere(
    { companyDeptId: 'company-1' },
    { role: 'department_supervisor', departmentId: 'dept-parent' }
  );

  assert.match(scoped.whereClause, /q\.company_dept_id = \$1/);
  assert.match(scoped.whereClause, /q\.department_id/);
  assert.match(scoped.whereClause, /q\.department_path_ids/);
  assert.deepEqual(scoped.params, ['company-1', 'dept-parent']);
});

test('does not add a department constraint for super administrators', () => {
  const scoped = buildQuotaConfigurationWhere(
    { subjectName: '招聘费用' },
    { role: 'superadmin', departmentId: 'ignored' }
  );

  assert.match(scoped.whereClause, /EXISTS/);
  assert.doesNotMatch(scoped.whereClause, /department_path_ids/);
  assert.deepEqual(scoped.params, ['招聘费用']);
});

test('configuration row query keeps subject rows attached to one approved quota', () => {
  const sql = quotaConfigurationRowsSql("WHERE q.status = 'effective'", 1, 2);
  assert.match(sql, /LEFT JOIN budget_effective_quota_subject s ON s\.quota_id = q\.id/);
  assert.match(sql, /GROUP BY q\.id/);
  assert.match(sql, /LIMIT \$1 OFFSET \$2/);
});

test('configuration row query isolates the selected subject from the other subject rows', () => {
  const sql = quotaConfigurationRowsSql("WHERE q.status = 'effective'", 2, 3, 1);
  assert.match(sql, /FILTER \(WHERE s\.quota_id IS NOT NULL AND s\.subject_name = \$1\)/g);
  assert.match(sql, /SUM\(s\.amount\) FILTER \(WHERE s\.quota_id IS NOT NULL AND s\.subject_name = \$1\)/);
  assert.match(sql, /LIMIT \$2 OFFSET \$3/);
});

test('configuration routes require the super administrator role', async () => {
  const routePath = fileURLToPath(new URL('../routes/quota-configurations.js', import.meta.url));
  const source = await readFile(routePath, 'utf8');
  assert.match(source, /router\.use\(requireRole\(AUTH_ROLES\.SUPERADMIN\)\);/);
});
