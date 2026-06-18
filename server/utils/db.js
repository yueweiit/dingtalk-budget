const VALID_TABLES = new Set([
  'production_budget',
  'non_production_budget',
  'budget_material',
  'budget_production',
  'budget_labor',
  'budget_hr',
  'budget_office',
  'budget_operation',
  'approval_flow',
]);

export function assertValidTable(tableName) {
  if (!VALID_TABLES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  return tableName;
}
