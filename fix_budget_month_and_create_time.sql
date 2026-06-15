ALTER TABLE "public"."production_budget"
  ALTER COLUMN "budget_month" TYPE varchar(7) USING substring("budget_month"::text from 1 for 7),
  ALTER COLUMN "declaration_month" TYPE varchar(7) USING substring("declaration_month"::text from 1 for 7);

ALTER TABLE "public"."non_production_budget"
  ALTER COLUMN "budget_month" TYPE varchar(7) USING substring("budget_month"::text from 1 for 7),
  ALTER COLUMN "declaration_month" TYPE varchar(7) USING substring("declaration_month"::text from 1 for 7);

UPDATE "public"."production_budget"
SET "create_time" = to_timestamp(substring("form_no" from 1 for 14), 'YYYYMMDDHH24MISS')::timestamp
WHERE "form_no" ~ '^\d{14}';

UPDATE "public"."non_production_budget"
SET "create_time" = to_timestamp(substring("form_no" from 1 for 14), 'YYYYMMDDHH24MISS')::timestamp
WHERE "form_no" ~ '^\d{14}';
