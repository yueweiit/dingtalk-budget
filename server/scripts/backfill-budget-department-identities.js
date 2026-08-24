import { config as loadEnv } from 'dotenv';
import pg from 'pg';

import { buildDepartmentSnapshotQuery, resolveServiceEntityDepartment } from '../services/department-tree.js';
import {
  buildDepartmentIdentityUpdate,
  resolveBudgetDepartmentBackfill,
} from '../services/budget-department-backfill.js';

loadEnv();

function parseArgs(args) {
  const result = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    result[key] = rest.length ? rest.join('=') : '1';
  }
  return result;
}

function createClient({ host, port, database, user, password }) {
  return new pg.Client({
    host,
    port: Number(port || 5432),
    database,
    user,
    password,
  });
}

function budgetClientConfig() {
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  };
}

function oaClientConfig() {
  return {
    host: process.env.OA_DB_HOST || process.env.PGHOST,
    port: process.env.OA_DB_PORT || process.env.PGPORT,
    database: process.env.OA_DB_DATABASE || process.env.DINGTALK_OA_DATABASE || 'dingtalk_oa',
    user: process.env.OA_DB_USER || process.env.PGUSER,
    password: process.env.OA_DB_PASSWORD || process.env.PGPASSWORD,
  };
}

function formNumberFilter(value) {
  return new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean));
}

async function loadCandidates(client, formNumbers) {
  const result = await client.query(`
    SELECT 'production_budget' AS table_name, form_no, process_instance_id, dept_id, dept_name
    FROM production_budget
    WHERE NULLIF(BTRIM(dept_id), '') IS NULL
    UNION ALL
    SELECT 'non_production_budget' AS table_name, form_no, process_instance_id, dept_id, dept_name
    FROM non_production_budget
    WHERE NULLIF(BTRIM(dept_id), '') IS NULL
    ORDER BY table_name, form_no
  `);
  return formNumbers.size === 0
    ? result.rows
    : result.rows.filter((row) => formNumbers.has(String(row.form_no)));
}

async function loadOaInstances(client, processInstanceIds) {
  if (processInstanceIds.length === 0) return new Map();
  const result = await client.query(`
    SELECT process_instance_id, originator_dept_id, originator_dept_name, form_component_values
    FROM ding_approval_instance
    WHERE process_instance_id = ANY($1::varchar[])
  `, [processInstanceIds]);

  const grouped = new Map();
  for (const row of result.rows) {
    const key = String(row.process_instance_id || '');
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }
  return grouped;
}

async function loadDepartmentSnapshot(client, departmentId, cache) {
  if (cache.has(departmentId)) return cache.get(departmentId);
  const result = await client.query(buildDepartmentSnapshotQuery(), [departmentId]);
  const row = result.rows[0];
  const snapshot = row ? {
    dept_path_ids: row.path_ids || null,
    dept_path_names: row.path_names || null,
  } : null;
  cache.set(departmentId, snapshot);
  return snapshot;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const write = String(args.write || '') === '1';
  const formNumbers = formNumberFilter(args['form-no'] || args.formNo);
  const limit = Number.parseInt(args.limit || '', 10);
  const budgetClient = createClient(budgetClientConfig());
  const oaClient = createClient(oaClientConfig());

  await Promise.all([budgetClient.connect(), oaClient.connect()]);
  try {
    let candidates = await loadCandidates(budgetClient, formNumbers);
    if (Number.isFinite(limit) && limit > 0) candidates = candidates.slice(0, limit);
    const sourceRows = await loadOaInstances(
      oaClient,
      candidates.map((row) => String(row.process_instance_id || '')).filter(Boolean)
    );
    const snapshotCache = new Map();
    const results = [];

    for (const candidate of candidates) {
      const sourceRowsForInstance = sourceRows.get(String(candidate.process_instance_id || '')) || [];
      if (sourceRowsForInstance.length !== 1) {
        results.push({
          action: 'skip',
          reason: sourceRowsForInstance.length === 0 ? 'missing_oa_instance' : 'ambiguous_oa_instance',
          table_name: candidate.table_name,
          form_no: candidate.form_no,
          process_instance_id: candidate.process_instance_id,
        });
        continue;
      }

      const resolveServiceEntity = (input) => resolveServiceEntityDepartment(input, oaClient.query.bind(oaClient));
      const preview = await resolveBudgetDepartmentBackfill(candidate, sourceRowsForInstance[0], {
        resolveServiceEntityDepartment: resolveServiceEntity,
      });
      const snapshot = preview.action === 'update'
        && !preview.dept_path_ids
        ? await loadDepartmentSnapshot(oaClient, preview.dept_id, snapshotCache)
        : null;
      results.push(await resolveBudgetDepartmentBackfill(candidate, sourceRowsForInstance[0], {
        snapshot,
        resolveServiceEntityDepartment: resolveServiceEntity,
      }));
    }

    const updates = results.filter((item) => item.action === 'update');
    let written = 0;
    if (write && updates.length > 0) {
      await budgetClient.query('BEGIN');
      try {
        for (const item of updates) {
          const update = buildDepartmentIdentityUpdate(item);
          const result = await budgetClient.query(update.sql, update.params);
          written += result.rowCount;
        }
        await budgetClient.query('COMMIT');
      } catch (error) {
        await budgetClient.query('ROLLBACK');
        throw error;
      }
    }

    console.table(results.map((item) => ({
      action: item.action,
      reason: item.reason || '',
      table: item.table_name,
      form_no: item.form_no,
      dept_id: item.dept_id || '',
      dept_source: item.dept_source || '',
      has_path: Boolean(item.dept_path_ids),
    })));
    console.log(JSON.stringify({
      mode: write ? 'write' : 'dry-run',
      candidates: candidates.length,
      resolved: updates.length,
      skipped: results.length - updates.length,
      written,
    }));
  } finally {
    await Promise.all([budgetClient.end(), oaClient.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
