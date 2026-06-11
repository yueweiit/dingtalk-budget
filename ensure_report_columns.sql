-- Ensure columns used by list and report export APIs exist.
-- This is safe to run multiple times and does not delete data.

ALTER TABLE "public"."production_budget"
  ADD COLUMN IF NOT EXISTS "declaration_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "budget_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "application_date" date,
  ADD COLUMN IF NOT EXISTS "execution_region" text,
  ADD COLUMN IF NOT EXISTS "monthly_budget_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creator_name" varchar(100),
  ADD COLUMN IF NOT EXISTS "creator_userid" varchar(100),
  ADD COLUMN IF NOT EXISTS "remark" text;

ALTER TABLE "public"."non_production_budget"
  ADD COLUMN IF NOT EXISTS "declaration_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "budget_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "application_date" date,
  ADD COLUMN IF NOT EXISTS "execution_region" text,
  ADD COLUMN IF NOT EXISTS "budget_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creator_name" varchar(100),
  ADD COLUMN IF NOT EXISTS "creator_userid" varchar(100),
  ADD COLUMN IF NOT EXISTS "remark" text;

ALTER TABLE "public"."production_budget"
  ALTER COLUMN "dept_name" TYPE text,
  ALTER COLUMN "execution_region" TYPE text,
  ALTER COLUMN "remark" TYPE text;

ALTER TABLE "public"."non_production_budget"
  ALTER COLUMN "dept_name" TYPE text,
  ALTER COLUMN "execution_region" TYPE text,
  ALTER COLUMN "remark" TYPE text;
