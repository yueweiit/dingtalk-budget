BEGIN;

-- 只创建审批通过后生效的预算额度台账，不修改原有预算申请表。
CREATE TABLE IF NOT EXISTS "public"."budget_effective_quota" (
  "id" bigserial PRIMARY KEY,
  "corp_id" varchar(128) NOT NULL,
  "process_instance_id" varchar(128) NOT NULL,
  "source_form_no" varchar(100),
  "source_process_code" varchar(128),
  "budget_type" varchar(32) NOT NULL,
  "approval_status" varchar(64),
  "approval_result" varchar(64),
  "approval_completed_at" timestamptz,
  "budget_year" integer,
  "budget_month" varchar(7),
  "group_dept_id" varchar(128),
  "group_name" text,
  "company_dept_id" varchar(128),
  "company_name" text,
  "department_id" varchar(128),
  "department_name" text,
  "department_path_ids" jsonb,
  "department_path_names" jsonb,
  "department_source" varchar(64),
  "organization_is_current" boolean NOT NULL DEFAULT false,
  "owner_user_id" varchar(128),
  "owner_name" text,
  "total_amount" numeric(18,2) NOT NULL DEFAULT 0,
  "detail_amount" numeric(18,2) NOT NULL DEFAULT 0,
  "detail_amount_mismatch" boolean NOT NULL DEFAULT false,
  "status" varchar(16) NOT NULL DEFAULT 'effective',
  "effective_at" timestamptz,
  "deactivated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "budget_effective_quota_source_key" UNIQUE ("corp_id", "process_instance_id")
);

ALTER TABLE "public"."budget_effective_quota"
  ADD COLUMN IF NOT EXISTS "group_dept_id" varchar(128),
  ADD COLUMN IF NOT EXISTS "group_name" text,
  ADD COLUMN IF NOT EXISTS "organization_is_current" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "public"."budget_effective_quota_subject" (
  "quota_id" bigint NOT NULL REFERENCES "public"."budget_effective_quota"("id") ON DELETE CASCADE,
  "line_no" integer NOT NULL,
  "subject_type" varchar(64) NOT NULL,
  "subject_code" text NOT NULL,
  "subject_name" text NOT NULL,
  "amount" numeric(18,2) NOT NULL DEFAULT 0,
  "source_table" varchar(64) NOT NULL,
  "source_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY ("quota_id", "line_no")
);

CREATE INDEX IF NOT EXISTS "idx_budget_effective_quota_period_company_dept"
  ON "public"."budget_effective_quota" ("budget_month", "company_dept_id", "department_id")
  WHERE "status" = 'effective';
CREATE INDEX IF NOT EXISTS "idx_budget_effective_quota_period_group_company_dept"
  ON "public"."budget_effective_quota" ("budget_month", "group_dept_id", "company_dept_id", "department_id")
  WHERE "status" = 'effective';
CREATE INDEX IF NOT EXISTS "idx_budget_effective_quota_subject_code"
  ON "public"."budget_effective_quota_subject" ("subject_code");

COMMIT;
