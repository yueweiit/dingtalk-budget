-- Clean up fields/tables that are no longer used by the current budget sync.
-- Run this only after uploading the updated server code.

ALTER TABLE "public"."production_budget"
  DROP COLUMN IF EXISTS "start_date",
  DROP COLUMN IF EXISTS "end_date",
  DROP COLUMN IF EXISTS "fill_date",
  DROP COLUMN IF EXISTS "current_approver",
  DROP COLUMN IF EXISTS "file_url";

ALTER TABLE "public"."non_production_budget"
  DROP COLUMN IF EXISTS "start_date",
  DROP COLUMN IF EXISTS "end_date",
  DROP COLUMN IF EXISTS "fill_date",
  DROP COLUMN IF EXISTS "current_approver",
  DROP COLUMN IF EXISTS "budget_purpose",
  DROP COLUMN IF EXISTS "file_url";

DROP TABLE IF EXISTS "public"."budget_non_production_material" CASCADE;
DROP SEQUENCE IF EXISTS "public"."budget_non_production_material_id_seq" CASCADE;
