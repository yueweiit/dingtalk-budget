/*
  增量迁移脚本 — 从旧版本升级到最新 schema
  ============================================
  适用：已有数据库的无损升级，可重复执行（幂等）。
  全新安装请直接使用 public.sql。

  合并自以下历史脚本：
    - migrate_budget_form_fields.sql
    - ensure_report_columns.sql
    - fix_budget_month_and_create_time.sql
    - widen_budget_text_columns.sql
    - cleanup_unused_budget_fields.sql
*/

BEGIN;

-- ============================================================
-- 1. 主表：添加新列（IF NOT EXISTS 保证幂等）
-- ============================================================

ALTER TABLE "public"."production_budget"
  ADD COLUMN IF NOT EXISTS "declaration_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "budget_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "application_date" date,
  ADD COLUMN IF NOT EXISTS "execution_region" varchar(255),
  ADD COLUMN IF NOT EXISTS "monthly_budget_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creator_name" varchar(100),
  ADD COLUMN IF NOT EXISTS "creator_userid" varchar(100),
  ADD COLUMN IF NOT EXISTS "remark" text,
  ADD COLUMN IF NOT EXISTS "dept_id" varchar(64),
  ADD COLUMN IF NOT EXISTS "dept_source" varchar(32),
  ADD COLUMN IF NOT EXISTS "dept_path_ids" jsonb,
  ADD COLUMN IF NOT EXISTS "dept_path_names" jsonb;

ALTER TABLE "public"."non_production_budget"
  ADD COLUMN IF NOT EXISTS "declaration_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "budget_month" varchar(7),
  ADD COLUMN IF NOT EXISTS "application_date" date,
  ADD COLUMN IF NOT EXISTS "execution_region" varchar(255),
  ADD COLUMN IF NOT EXISTS "budget_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_amount" numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creator_name" varchar(100),
  ADD COLUMN IF NOT EXISTS "creator_userid" varchar(100),
  ADD COLUMN IF NOT EXISTS "remark" text,
  ADD COLUMN IF NOT EXISTS "dept_id" varchar(64),
  ADD COLUMN IF NOT EXISTS "dept_source" varchar(32),
  ADD COLUMN IF NOT EXISTS "dept_path_ids" jsonb,
  ADD COLUMN IF NOT EXISTS "dept_path_names" jsonb;

-- ============================================================
-- 2. 主表：删除废弃列
-- ============================================================

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

-- 删除废弃的非生产物料表
DROP TABLE IF EXISTS "public"."budget_non_production_material" CASCADE;
DROP SEQUENCE IF EXISTS "public"."budget_non_production_material_id_seq" CASCADE;

-- ============================================================
-- 3. 主表：将 varchar 列加宽为 text（避免 "值太长" 错误）
-- ============================================================

DO $$
BEGIN
  -- production_budget
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_budget' AND column_name='dept_name' AND data_type='character varying') THEN
    ALTER TABLE "public"."production_budget" ALTER COLUMN "dept_name" TYPE text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_budget' AND column_name='execution_region' AND data_type='character varying') THEN
    ALTER TABLE "public"."production_budget" ALTER COLUMN "execution_region" TYPE text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_budget' AND column_name='remark' AND data_type='character varying') THEN
    ALTER TABLE "public"."production_budget" ALTER COLUMN "remark" TYPE text;
  END IF;

  -- non_production_budget
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='non_production_budget' AND column_name='dept_name' AND data_type='character varying') THEN
    ALTER TABLE "public"."non_production_budget" ALTER COLUMN "dept_name" TYPE text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='non_production_budget' AND column_name='execution_region' AND data_type='character varying') THEN
    ALTER TABLE "public"."non_production_budget" ALTER COLUMN "execution_region" TYPE text;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='non_production_budget' AND column_name='remark' AND data_type='character varying') THEN
    ALTER TABLE "public"."non_production_budget" ALTER COLUMN "remark" TYPE text;
  END IF;
END $$;

-- ============================================================
-- 4. budget_month 格式修正：截取前 7 位 (YYYY-MM)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_budget' AND column_name='budget_month' AND data_type='character varying' AND character_maximum_length > 7) THEN
    ALTER TABLE "public"."production_budget"
      ALTER COLUMN "budget_month" TYPE varchar(7) USING substring("budget_month"::text FROM 1 FOR 7);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='production_budget' AND column_name='declaration_month' AND data_type='character varying' AND character_maximum_length > 7) THEN
    ALTER TABLE "public"."production_budget"
      ALTER COLUMN "declaration_month" TYPE varchar(7) USING substring("declaration_month"::text FROM 1 FOR 7);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='non_production_budget' AND column_name='budget_month' AND data_type='character varying' AND character_maximum_length > 7) THEN
    ALTER TABLE "public"."non_production_budget"
      ALTER COLUMN "budget_month" TYPE varchar(7) USING substring("budget_month"::text FROM 1 FOR 7);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='non_production_budget' AND column_name='declaration_month' AND data_type='character varying' AND character_maximum_length > 7) THEN
    ALTER TABLE "public"."non_production_budget"
      ALTER COLUMN "declaration_month" TYPE varchar(7) USING substring("declaration_month"::text FROM 1 FOR 7);
  END IF;
END $$;

-- ============================================================
-- 5. create_time 回填：从 form_no 前 14 位解析时间戳
-- ============================================================

UPDATE "public"."production_budget"
SET "create_time" = to_timestamp(substring("form_no" FROM 1 FOR 14), 'YYYYMMDDHH24MISS')::timestamp
WHERE "form_no" ~ '^\d{14}' AND "create_time" IS NULL;

UPDATE "public"."non_production_budget"
SET "create_time" = to_timestamp(substring("form_no" FROM 1 FOR 14), 'YYYYMMDDHH24MISS')::timestamp
WHERE "form_no" ~ '^\d{14}' AND "create_time" IS NULL;

-- ============================================================
-- 6. 非生产明细表：创建（如不存在）
-- ============================================================

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

-- ============================================================
-- 7. 审批流程表：创建（如不存在）
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS "public"."approval_flow_id_seq" INCREMENT 1 START 1 CACHE 1;

CREATE TABLE IF NOT EXISTS "public"."approval_flow" (
  "id" int8 NOT NULL DEFAULT nextval('approval_flow_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  "process_instance_id" varchar(100),
  "budget_type" varchar(20),
  "step" int4 DEFAULT 0,
  "approver_name" varchar(100),
  "approver_userid" varchar(100),
  "approve_result" varchar(50),
  "approve_opinion" text,
  "approve_time" timestamp(6),
  "tenant_id" varchar(50) DEFAULT 'default',
  CONSTRAINT "approval_flow_pkey" PRIMARY KEY ("id")
);
COMMENT ON TABLE "public"."approval_flow" IS '审批流程记录表';

-- ============================================================
-- 8. 明细表：补齐所有列（IF NOT EXISTS 保证幂等）
-- ============================================================

-- 生产明细表通用列
DO $$
DECLARE
  v_table text;
  production_tables text[] := ARRAY['budget_material', 'budget_production', 'budget_labor'];
BEGIN
  FOREACH v_table IN ARRAY production_tables LOOP
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_type" varchar(50)', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_category" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_code" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "production_line" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "item_name" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "specification" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "product_name" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "process" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "post_name" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "work_type" varchar(100)', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "unit" varchar(50)', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "quantity" numeric(12,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "unit_price" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "overtime_hours" numeric(12,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "overtime_unit_price" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "estimated_overtime_amount" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "original_amount" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "currency" varchar(50)', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(18,6) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "rmb_amount" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "amount" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "calculation_basis" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "remark" text', v_table);
  END LOOP;
END $$;

-- 非生产明细表通用列
DO $$
DECLARE
  v_table text;
  non_production_tables text[] := ARRAY['budget_hr', 'budget_office', 'budget_operation'];
BEGIN
  FOREACH v_table IN ARRAY non_production_tables LOOP
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_type" varchar(50)', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "detail_item" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "budget_purpose_detail" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "operation_expense" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "budget_detail" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "headcount" numeric(12,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "original_amount" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "currency" varchar(50)', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(18,6) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "rmb_amount" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "amount" numeric(14,2) DEFAULT 0', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "calculation_basis" text', v_table);
    EXECUTE format('ALTER TABLE "public".%I ADD COLUMN IF NOT EXISTS "remark" text', v_table);
  END LOOP;
END $$;

-- ============================================================
-- 9. 明细表：将 varchar 列加宽为 text（仅当当前类型是 varchar 时）
-- ============================================================

DO $$
DECLARE
  v_table text;
  v_column text;
  production_tables text[] := ARRAY['budget_material', 'budget_production', 'budget_labor'];
  production_columns text[] := ARRAY[
    'detail_category', 'detail_code', 'production_line', 'item_name',
    'specification', 'product_name', 'process', 'post_name', 'work_type', 'remark'
  ];
  non_production_tables text[] := ARRAY['budget_hr', 'budget_office', 'budget_operation'];
  non_production_columns text[] := ARRAY[
    'detail_item', 'budget_purpose_detail', 'operation_expense',
    'budget_detail', 'calculation_basis', 'remark'
  ];
BEGIN
  FOREACH v_table IN ARRAY production_tables LOOP
    FOREACH v_column IN ARRAY production_columns LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_table
          AND column_name = v_column AND data_type = 'character varying'
      ) THEN
        EXECUTE format('ALTER TABLE "public".%I ALTER COLUMN %I TYPE text', v_table, v_column);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH v_table IN ARRAY non_production_tables LOOP
    FOREACH v_column IN ARRAY non_production_columns LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_table
          AND column_name = v_column AND data_type = 'character varying'
      ) THEN
        EXECUTE format('ALTER TABLE "public".%I ALTER COLUMN %I TYPE text', v_table, v_column);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 10. 索引（IF NOT EXISTS 保证幂等）
-- ============================================================

CREATE INDEX IF NOT EXISTS "idx_production_budget_month" ON "public"."production_budget" ("budget_month");
CREATE INDEX IF NOT EXISTS "idx_production_form_no" ON "public"."production_budget" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_production_budget_dept_month" ON "public"."production_budget" ("dept_id", "budget_month");
CREATE INDEX IF NOT EXISTS "idx_non_production_budget_month" ON "public"."non_production_budget" ("budget_month");
CREATE INDEX IF NOT EXISTS "idx_non_production_form_no" ON "public"."non_production_budget" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_non_production_budget_dept_month" ON "public"."non_production_budget" ("dept_id", "budget_month");
CREATE INDEX IF NOT EXISTS "idx_budget_material_form_no" ON "public"."budget_material" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_budget_production_form_no" ON "public"."budget_production" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_budget_labor_form_no" ON "public"."budget_labor" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_budget_hr_form_no" ON "public"."budget_hr" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_budget_office_form_no" ON "public"."budget_office" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_budget_operation_form_no" ON "public"."budget_operation" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_approval_flow_form_no" ON "public"."approval_flow" ("form_no");
CREATE INDEX IF NOT EXISTS "idx_approval_flow_instance_id" ON "public"."approval_flow" ("process_instance_id");

COMMIT;
