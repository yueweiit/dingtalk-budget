/*
 Navicat Premium Dump SQL

 Source Catalog        : budget_system
 Source Schema         : public
 File Encoding         : UTF-8

 Budget form fields are based on the DingTalk bilingual form:
 部门/Departamento、预算类型/Tipo de presupuesto、申请日期/Fecha de solicitud、
 预算月份/Mes presupuestario、执行地区/Región de ejecución。
*/

DROP SEQUENCE IF EXISTS "public"."production_budget_id_seq" CASCADE;
CREATE SEQUENCE "public"."production_budget_id_seq"
INCREMENT 1
MINVALUE 1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

DROP TABLE IF EXISTS "public"."production_budget" CASCADE;
CREATE TABLE "public"."production_budget" (
  "id" int8 NOT NULL DEFAULT nextval('production_budget_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  "process_instance_id" varchar(100),
  "dept_name" varchar(255) NOT NULL,
  "budget_type" varchar(20) NOT NULL,
  "declaration_month" varchar(7),
  "budget_month" varchar(7),
  "application_date" date,
  "execution_region" varchar(255),
  "monthly_budget_amount" numeric(14,2) DEFAULT 0,
  "total_amount" numeric(14,2) DEFAULT 0,
  "creator_name" varchar(100),
  "creator_userid" varchar(100),
  "create_time" timestamp(6) DEFAULT now(),
  "status" varchar(50) DEFAULT '审批中',
  "remark" text,
  "tenant_id" varchar(50) DEFAULT 'default',
  CONSTRAINT "production_budget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "production_budget_form_no_key" UNIQUE ("form_no")
);
COMMENT ON TABLE "public"."production_budget" IS '生产预算申请表';
COMMENT ON COLUMN "public"."production_budget"."budget_month" IS '预算月份 Mes presupuestario';
COMMENT ON COLUMN "public"."production_budget"."application_date" IS '申请日期 Fecha de solicitud';
COMMENT ON COLUMN "public"."production_budget"."execution_region" IS '执行地区 Región de ejecución';
COMMENT ON COLUMN "public"."production_budget"."total_amount" IS '预算总金额(人民币) Presupuesto Total (RMB)';

DROP SEQUENCE IF EXISTS "public"."non_production_budget_id_seq" CASCADE;
CREATE SEQUENCE "public"."non_production_budget_id_seq"
INCREMENT 1
MINVALUE 1
MAXVALUE 9223372036854775807
START 1
CACHE 1;

DROP TABLE IF EXISTS "public"."non_production_budget" CASCADE;
CREATE TABLE "public"."non_production_budget" (
  "id" int8 NOT NULL DEFAULT nextval('non_production_budget_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  "process_instance_id" varchar(100),
  "dept_name" varchar(255) NOT NULL,
  "budget_type" varchar(20) NOT NULL,
  "declaration_month" varchar(7),
  "budget_month" varchar(7),
  "application_date" date,
  "execution_region" varchar(255),
  "creator_name" varchar(100),
  "creator_userid" varchar(100),
  "create_time" timestamp(6) DEFAULT now(),
  "status" varchar(50) DEFAULT '审批中',
  "budget_amount" numeric(14,2) DEFAULT 0,
  "total_amount" numeric(14,2) DEFAULT 0,
  "remark" text,
  "tenant_id" varchar(50) DEFAULT 'default',
  CONSTRAINT "non_production_budget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "non_production_budget_form_no_key" UNIQUE ("form_no")
);
COMMENT ON TABLE "public"."non_production_budget" IS '非生产预算申请表';
COMMENT ON COLUMN "public"."non_production_budget"."budget_month" IS '预算月份 Mes presupuestario';
COMMENT ON COLUMN "public"."non_production_budget"."application_date" IS '申请日期 Fecha de solicitud';
COMMENT ON COLUMN "public"."non_production_budget"."execution_region" IS '执行地区 Región de ejecución';
COMMENT ON COLUMN "public"."non_production_budget"."total_amount" IS '预算总金额(人民币) Presupuesto Total (RMB)';

CREATE OR REPLACE FUNCTION "public"."touch_updated_at"()
RETURNS trigger AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 生产预算明细通用列：
-- 明细类别、编码/费用明细、规格/产线/岗位、单位、申请数量、单价、原币金额、币种、汇率、人民币金额、计算依据。
DROP SEQUENCE IF EXISTS "public"."budget_material_id_seq" CASCADE;
CREATE SEQUENCE "public"."budget_material_id_seq" INCREMENT 1 START 1 CACHE 1;

DROP TABLE IF EXISTS "public"."budget_material" CASCADE;
CREATE TABLE "public"."budget_material" (
  "id" int8 NOT NULL DEFAULT nextval('budget_material_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  "detail_type" varchar(50) DEFAULT 'material',
  "detail_category" text,
  "detail_code" text,
  "production_line" text,
  "item_name" text,
  "specification" text,
  "product_name" text,
  "process" text,
  "post_name" text,
  "work_type" varchar(100),
  "unit" varchar(50),
  "quantity" numeric(12,2) DEFAULT 0,
  "unit_price" numeric(14,2) DEFAULT 0,
  "overtime_hours" numeric(12,2) DEFAULT 0,
  "overtime_unit_price" numeric(14,2) DEFAULT 0,
  "estimated_overtime_amount" numeric(14,2) DEFAULT 0,
  "original_amount" numeric(14,2) DEFAULT 0,
  "currency" varchar(50),
  "exchange_rate" numeric(18,6) DEFAULT 0,
  "rmb_amount" numeric(14,2) DEFAULT 0,
  "amount" numeric(14,2) DEFAULT 0,
  "calculation_basis" text,
  "remark" text,
  CONSTRAINT "budget_material_pkey" PRIMARY KEY ("id")
);
COMMENT ON TABLE "public"."budget_material" IS '生产预算-物料预算';

DROP SEQUENCE IF EXISTS "public"."budget_production_id_seq" CASCADE;
CREATE SEQUENCE "public"."budget_production_id_seq" INCREMENT 1 START 1 CACHE 1;

DROP TABLE IF EXISTS "public"."budget_production" CASCADE;
CREATE TABLE "public"."budget_production" (
  LIKE "public"."budget_material" INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);
ALTER TABLE "public"."budget_production" ALTER COLUMN "id" SET DEFAULT nextval('budget_production_id_seq'::regclass);
ALTER TABLE "public"."budget_production" DROP CONSTRAINT IF EXISTS "budget_material_pkey";
ALTER TABLE "public"."budget_production" ADD CONSTRAINT "budget_production_pkey" PRIMARY KEY ("id");
COMMENT ON TABLE "public"."budget_production" IS '生产预算-生产费用预算';

DROP SEQUENCE IF EXISTS "public"."budget_labor_id_seq" CASCADE;
CREATE SEQUENCE "public"."budget_labor_id_seq" INCREMENT 1 START 1 CACHE 1;

DROP TABLE IF EXISTS "public"."budget_labor" CASCADE;
CREATE TABLE "public"."budget_labor" (
  LIKE "public"."budget_material" INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);
ALTER TABLE "public"."budget_labor" ALTER COLUMN "id" SET DEFAULT nextval('budget_labor_id_seq'::regclass);
ALTER TABLE "public"."budget_labor" DROP CONSTRAINT IF EXISTS "budget_material_pkey";
ALTER TABLE "public"."budget_labor" ADD CONSTRAINT "budget_labor_pkey" PRIMARY KEY ("id");
COMMENT ON TABLE "public"."budget_labor" IS '生产预算-人工成本预算';

-- 非生产预算明细通用列：
-- 人资预算、办公场地预算、管理支出预算的明细项目、人数、原币金额、币种、汇率、人民币金额、计算依据。
DROP SEQUENCE IF EXISTS "public"."budget_hr_id_seq" CASCADE;
CREATE SEQUENCE "public"."budget_hr_id_seq" INCREMENT 1 START 1 CACHE 1;

DROP TABLE IF EXISTS "public"."budget_hr" CASCADE;
CREATE TABLE "public"."budget_hr" (
  "id" int8 NOT NULL DEFAULT nextval('budget_hr_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  "detail_type" varchar(50) DEFAULT 'hr',
  "detail_item" text,
  "budget_purpose_detail" text,
  "operation_expense" text,
  "budget_detail" text,
  "headcount" numeric(12,2) DEFAULT 0,
  "original_amount" numeric(14,2) DEFAULT 0,
  "currency" varchar(50),
  "exchange_rate" numeric(18,6) DEFAULT 0,
  "rmb_amount" numeric(14,2) DEFAULT 0,
  "amount" numeric(14,2) DEFAULT 0,
  "calculation_basis" text,
  "remark" text,
  CONSTRAINT "budget_hr_pkey" PRIMARY KEY ("id")
);
COMMENT ON TABLE "public"."budget_hr" IS '非生产预算-人资预算';

DROP SEQUENCE IF EXISTS "public"."budget_office_id_seq" CASCADE;
CREATE SEQUENCE "public"."budget_office_id_seq" INCREMENT 1 START 1 CACHE 1;

DROP TABLE IF EXISTS "public"."budget_office" CASCADE;
CREATE TABLE "public"."budget_office" (
  LIKE "public"."budget_hr" INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);
ALTER TABLE "public"."budget_office" ALTER COLUMN "id" SET DEFAULT nextval('budget_office_id_seq'::regclass);
ALTER TABLE "public"."budget_office" DROP CONSTRAINT IF EXISTS "budget_hr_pkey";
ALTER TABLE "public"."budget_office" ADD CONSTRAINT "budget_office_pkey" PRIMARY KEY ("id");
COMMENT ON TABLE "public"."budget_office" IS '非生产预算-办公场地预算';

DROP SEQUENCE IF EXISTS "public"."budget_operation_id_seq" CASCADE;
CREATE SEQUENCE "public"."budget_operation_id_seq" INCREMENT 1 START 1 CACHE 1;

DROP TABLE IF EXISTS "public"."budget_operation" CASCADE;
CREATE TABLE "public"."budget_operation" (
  LIKE "public"."budget_hr" INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);
ALTER TABLE "public"."budget_operation" ALTER COLUMN "id" SET DEFAULT nextval('budget_operation_id_seq'::regclass);
ALTER TABLE "public"."budget_operation" DROP CONSTRAINT IF EXISTS "budget_hr_pkey";
ALTER TABLE "public"."budget_operation" ADD CONSTRAINT "budget_operation_pkey" PRIMARY KEY ("id");
COMMENT ON TABLE "public"."budget_operation" IS '非生产预算-管理支出预算';

ALTER SEQUENCE "public"."production_budget_id_seq" OWNED BY "public"."production_budget"."id";
ALTER SEQUENCE "public"."non_production_budget_id_seq" OWNED BY "public"."non_production_budget"."id";
ALTER SEQUENCE "public"."budget_material_id_seq" OWNED BY "public"."budget_material"."id";
ALTER SEQUENCE "public"."budget_production_id_seq" OWNED BY "public"."budget_production"."id";
ALTER SEQUENCE "public"."budget_labor_id_seq" OWNED BY "public"."budget_labor"."id";
ALTER SEQUENCE "public"."budget_hr_id_seq" OWNED BY "public"."budget_hr"."id";
ALTER SEQUENCE "public"."budget_office_id_seq" OWNED BY "public"."budget_office"."id";
ALTER SEQUENCE "public"."budget_operation_id_seq" OWNED BY "public"."budget_operation"."id";

CREATE INDEX "idx_production_budget_month" ON "public"."production_budget" ("budget_month");
CREATE INDEX "idx_production_form_no" ON "public"."production_budget" ("form_no");
CREATE INDEX "idx_non_production_budget_month" ON "public"."non_production_budget" ("budget_month");
CREATE INDEX "idx_non_production_form_no" ON "public"."non_production_budget" ("form_no");
CREATE INDEX "idx_budget_material_form_no" ON "public"."budget_material" ("form_no");
CREATE INDEX "idx_budget_production_form_no" ON "public"."budget_production" ("form_no");
CREATE INDEX "idx_budget_labor_form_no" ON "public"."budget_labor" ("form_no");
CREATE INDEX "idx_budget_hr_form_no" ON "public"."budget_hr" ("form_no");
CREATE INDEX "idx_budget_office_form_no" ON "public"."budget_office" ("form_no");
CREATE INDEX "idx_budget_operation_form_no" ON "public"."budget_operation" ("form_no");
