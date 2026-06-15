-- Fix for sync failures like:
-- error: 对于可变字符类型来说，值太长了(255)
--
-- This script is non-destructive. It only widens detail text columns from
-- varchar(255)/varchar(500) to text and keeps old columns/data.

DO $$
DECLARE
  v_table_name text;
  v_column_name text;
  production_tables text[] := ARRAY['budget_material', 'budget_production', 'budget_labor'];
  production_columns text[] := ARRAY[
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
  ];
  non_production_tables text[] := ARRAY['budget_hr', 'budget_office', 'budget_operation'];
  non_production_columns text[] := ARRAY[
    'detail_item',
    'budget_purpose_detail',
    'operation_expense',
    'budget_detail',
    'calculation_basis',
    'remark'
  ];
BEGIN
  FOREACH v_table_name IN ARRAY production_tables LOOP
    FOREACH v_column_name IN ARRAY production_columns LOOP
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table_name
          AND column_name = v_column_name
      ) THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE text', v_table_name, v_column_name);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH v_table_name IN ARRAY non_production_tables LOOP
    FOREACH v_column_name IN ARRAY non_production_columns LOOP
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table_name
          AND column_name = v_column_name
      ) THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE text', v_table_name, v_column_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
