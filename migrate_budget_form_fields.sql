-- Non-destructive migration for the DingTalk bilingual budget form fields.
-- Use this on an existing database. Use public.sql only when rebuilding from scratch.

ALTER TABLE "public"."production_budget"
  ADD COLUMN IF NOT EXISTS "budget_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "application_date" date,
  ADD COLUMN IF NOT EXISTS "execution_region" varchar(255),
  ADD COLUMN IF NOT EXISTS "monthly_budget_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_amount" numeric(14,2) DEFAULT 0;

ALTER TABLE "public"."non_production_budget"
  ADD COLUMN IF NOT EXISTS "declaration_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "budget_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "application_date" date,
  ADD COLUMN IF NOT EXISTS "execution_region" varchar(255),
  ADD COLUMN IF NOT EXISTS "total_amount" numeric(14,2) DEFAULT 0;

ALTER TABLE "public"."production_budget"
  ALTER COLUMN "budget_month" SET DEFAULT NULL,
  ALTER COLUMN "application_date" SET DEFAULT NULL;

ALTER TABLE "public"."non_production_budget"
  ALTER COLUMN "budget_month" SET DEFAULT NULL,
  ALTER COLUMN "application_date" SET DEFAULT NULL;

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

CREATE SEQUENCE IF NOT EXISTS "public"."budget_hr_id_seq" INCREMENT 1 START 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS "public"."budget_office_id_seq" INCREMENT 1 START 1 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS "public"."budget_operation_id_seq" INCREMENT 1 START 1 CACHE 1;

CREATE TABLE IF NOT EXISTS "public"."budget_hr" (
  "id" int8 NOT NULL DEFAULT nextval('budget_hr_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  CONSTRAINT "budget_hr_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."budget_office" (
  "id" int8 NOT NULL DEFAULT nextval('budget_office_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  CONSTRAINT "budget_office_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."budget_operation" (
  "id" int8 NOT NULL DEFAULT nextval('budget_operation_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  CONSTRAINT "budget_operation_pkey" PRIMARY KEY ("id")
);

CREATE OR REPLACE PROCEDURE "public"."ensure_production_detail_columns"(table_name text)
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_type" varchar(50)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_category" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_code" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "production_line" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "item_name" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "specification" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "product_name" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "process" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "post_name" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "work_type" varchar(100)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "unit" varchar(50)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "quantity" numeric(12,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "unit_price" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "overtime_hours" numeric(12,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "overtime_unit_price" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "estimated_overtime_amount" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "original_amount" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "currency" varchar(50)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(18,6) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "rmb_amount" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "amount" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "calculation_basis" text', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "remark" varchar(500)', table_name);
END;
$$;

CREATE OR REPLACE PROCEDURE "public"."ensure_non_production_detail_columns"(table_name text)
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_type" varchar(50)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_item" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "budget_purpose_detail" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "operation_expense" varchar(255)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "budget_detail" text', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "headcount" numeric(12,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "original_amount" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "currency" varchar(50)', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(18,6) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "rmb_amount" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "amount" numeric(14,2) DEFAULT 0', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "calculation_basis" text', table_name);
  EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "remark" varchar(500)', table_name);
END;
$$;

CALL "public"."ensure_production_detail_columns"('budget_material');
CALL "public"."ensure_production_detail_columns"('budget_production');
CALL "public"."ensure_production_detail_columns"('budget_labor');

CALL "public"."ensure_non_production_detail_columns"('budget_hr');
CALL "public"."ensure_non_production_detail_columns"('budget_office');
CALL "public"."ensure_non_production_detail_columns"('budget_operation');

CREATE OR REPLACE PROCEDURE "public"."widen_budget_text_columns"(table_name text, column_names text[])
LANGUAGE plpgsql
AS $$
DECLARE
  column_name text;
BEGIN
  FOREACH column_name IN ARRAY column_names LOOP
    EXECUTE format('ALTER TABLE "public".%I ALTER COLUMN %I TYPE text', table_name, column_name);
  END LOOP;
END;
$$;

CALL "public"."widen_budget_text_columns"('budget_material', ARRAY[
  'detail_category',
  'detail_code',
  'production_line',
  'item_name',
  'specification',
  'product_name',
  'process',
  'post_name',
  'remark'
]);

CALL "public"."widen_budget_text_columns"('budget_production', ARRAY[
  'detail_category',
  'detail_code',
  'production_line',
  'item_name',
  'specification',
  'product_name',
  'process',
  'post_name',
  'remark'
]);

CALL "public"."widen_budget_text_columns"('budget_labor', ARRAY[
  'detail_category',
  'detail_code',
  'production_line',
  'item_name',
  'specification',
  'product_name',
  'process',
  'post_name',
  'work_type',
  'remark'
]);

CALL "public"."widen_budget_text_columns"('budget_hr', ARRAY[
  'detail_item',
  'budget_purpose_detail',
  'operation_expense',
  'remark'
]);

CALL "public"."widen_budget_text_columns"('budget_office', ARRAY[
  'detail_item',
  'budget_purpose_detail',
  'operation_expense',
  'remark'
]);

CALL "public"."widen_budget_text_columns"('budget_operation', ARRAY[
  'detail_item',
  'budget_purpose_detail',
  'operation_expense',
  'remark'
]);

DROP PROCEDURE "public"."ensure_production_detail_columns"(text);
DROP PROCEDURE "public"."ensure_non_production_detail_columns"(text);
DROP PROCEDURE "public"."widen_budget_text_columns"(text, text[]);

CREATE INDEX IF NOT EXISTS "idx_production_budget_month" ON "public"."production_budget" ("budget_month");
CREATE INDEX IF NOT EXISTS "idx_non_production_budget_month" ON "public"."non_production_budget" ("budget_month");
CREATE INDEX IF NOT EXISTS "idx_budget_hr_form_no" ON "public"."budget_hr" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_budget_office_form_no" ON "public"."budget_office" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_budget_operation_form_no" ON "public"."budget_operation" ("form_no");
