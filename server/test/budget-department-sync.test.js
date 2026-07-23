import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  applyBudgetDepartmentSnapshot,
  buildBudgetDepartmentValues,
  buildBudgetInsertValues,
  buildBudgetUpdateValues,
} from '../routes/sync.js';

test('serializes all four budget department identity fields for database writes', () => {
  const values = buildBudgetDepartmentValues({
    dept_id: '1079492125',
    dept_source: 'form_id',
    dept_path_ids: ['1', '100', '1079492125'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PG1'],
  });

  assert.deepEqual(values, [
    '1079492125',
    'form_id',
    JSON.stringify(['1', '100', '1079492125']),
    JSON.stringify(['ROOT', 'YUEWEI', 'PG1']),
  ]);
});

test('keeps a budget record writable when the department tree has no path', () => {
  const budget = {
    dept_id: '1079492125',
    dept_source: 'originator_id',
    dept_path_ids: null,
    dept_path_names: null,
  };

  assert.deepEqual(applyBudgetDepartmentSnapshot(budget, null), budget);
});

test('adds the OA department tree path without replacing the selected department identity', () => {
  const budget = {
    dept_id: '1079492125',
    dept_source: 'form_id',
    dept_path_ids: null,
    dept_path_names: null,
  };

  assert.deepEqual(applyBudgetDepartmentSnapshot(budget, {
    dept_path_ids: ['1', '100', '1079492125'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PG1'],
  }), {
    dept_id: '1079492125',
    dept_source: 'form_id',
    dept_path_ids: ['1', '100', '1079492125'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PG1'],
  });
});

test('keeps department identity values in the expected positions for inserts and updates', () => {
  const budget = {
    form_no: '202607230001000000001',
    process_instance_id: 'process-1',
    dept_name: 'Form Department',
    dept_id: '1079492125',
    dept_source: 'form_id',
    dept_path_ids: ['1', '100', '1079492125'],
    dept_path_names: ['ROOT', 'YUEWEI', 'PG1'],
    budget_type: 'production',
    declaration_month: '2026-07',
    budget_month: '2026-07',
    application_date: '2026-07-23',
    execution_region: 'China',
    monthly_budget_amount: 100,
    total_amount: 100,
    creator_name: 'Applicant',
    creator_userid: 'user-1',
    create_time: '2026-07-23 12:00:00',
    status: '审批中',
    remark: 'test',
    tenant_id: 'default',
  };

  assert.deepEqual(buildBudgetInsertValues(budget, 'production').slice(0, 8), [
    '202607230001000000001',
    'process-1',
    'Form Department',
    '1079492125',
    'form_id',
    JSON.stringify(['1', '100', '1079492125']),
    JSON.stringify(['ROOT', 'YUEWEI', 'PG1']),
    'production',
  ]);
  assert.deepEqual(buildBudgetUpdateValues('process-1', budget, budget.form_no).slice(0, 8), [
    'process-1',
    'Form Department',
    '1079492125',
    'form_id',
    JSON.stringify(['1', '100', '1079492125']),
    JSON.stringify(['ROOT', 'YUEWEI', 'PG1']),
    'production',
    '2026-07',
  ]);
});

test('migration adds department identity columns and month lookup indexes to both budget tables', async () => {
  const migrationPath = fileURLToPath(new URL('../../migrate.sql', import.meta.url));
  const migration = await readFile(migrationPath, 'utf8');

  for (const tableName of ['production_budget', 'non_production_budget']) {
    for (const columnName of ['dept_id', 'dept_source', 'dept_path_ids', 'dept_path_names']) {
      assert.match(
        migration,
        new RegExp(`ALTER TABLE\\s+"public"\\."${tableName}"[\\s\\S]*?ADD COLUMN IF NOT EXISTS "${columnName}"`, 'i')
      );
    }
    assert.match(
      migration,
      new RegExp(`CREATE INDEX IF NOT EXISTS "idx_${tableName}_dept_month"[\\s\\S]*?"${tableName}" \\("dept_id", "budget_month"\\)`, 'i')
    );
  }
});

test('fresh schema defines department identity fields for both budget tables', async () => {
  const schemaPath = fileURLToPath(new URL('../../public.sql', import.meta.url));
  const schema = await readFile(schemaPath, 'utf8');

  for (const tableName of ['production_budget', 'non_production_budget']) {
    const tableDefinition = schema.match(
      new RegExp(`CREATE TABLE "public"\\."${tableName}" \\(([\\s\\S]*?)\\n\\);`, 'i')
    )?.[1] || '';
    for (const columnName of ['dept_id', 'dept_source', 'dept_path_ids', 'dept_path_names']) {
      assert.match(tableDefinition, new RegExp(`"${columnName}"`, 'i'));
    }
  }
});
