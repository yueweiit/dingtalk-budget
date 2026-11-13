# 有效预算额度与配置中心：数据字典

定义来源：[public.sql](../../../public.sql)、[migrate.sql](../../../migrate.sql)、[专项 DDL](../../../sql/ensure-effective-budget-quota.sql)；写入服务 [effective-budget-quota.js](../../../server/services/effective-budget-quota.js)。

## budget_effective_quota

| 字段组 | 主要字段 / 类型与含义 |
| --- | --- |
| 主键和来源 | `id bigserial`；`corp_id/process_instance_id varchar(128) NOT NULL` 唯一组合；`source_form_no/source_process_code` |
| 类型和审批 | `budget_type` 使用 production/non_production；`approval_status/result`、`approval_completed_at timestamptz` |
| 预算期间 | `budget_year integer`、`budget_month varchar(7)` |
| 组织 | `group_dept_id/name`、`company_dept_id/name`、`department_id/name`、JSONB `department_path_ids/names`、`department_source` |
| 当前组织 | `organization_is_current boolean`，默认 false；构建/重核逻辑更新 |
| 负责人 | `owner_user_id`、`owner_name`，没有指向本地登录账号的外键 |
| 金额 | `total_amount/detail_amount numeric(18,2)`；`detail_amount_mismatch boolean` |
| 生效状态 | `status varchar(16)` 默认 effective；业务服务写 effective/inactive，DDL 未为两状态设置 CHECK |
| 审计时间 | `effective_at/deactivated_at/created_at/updated_at timestamptz` |

source_form_no 不引用预算主表外键；有效额度来自审批解析，不应按本地自增 ID 推断来源关系。表不存余额/项目维度；total_amount 是总额度，detail_amount 是科目校对金额。

## budget_effective_quota_subject

| 字段 | 定义 / 作用 |
| --- | --- |
| `quota_id bigint` | FK → quota.id，ON DELETE CASCADE |
| `line_no integer` | 和 quota_id 组成主键，保存构建顺序 |
| `subject_type varchar(64)` | material、production_expense、labor、hr、office、operation |
| `subject_code/name text` | 明细类型/编码生成的科目识别及展示名 |
| `amount numeric(18,2)` | 单科目金额 |
| `source_table varchar(64)` | 六类预算明细来源名 |
| `source_data jsonb` | 当前解析明细快照，不含全套审批原文 |

科目没有指向六类原明细行的外键；重复同步删除旧科目并重建。失效时不删除科目，重新通过可再激活和重建。

## 索引和聚合

额度有效行有 `(budget_month,company_dept_id,department_id)` 及包含 group_dept_id 的部分索引，科目有 subject_code 索引。配置中心按 effective 状态查询，科目筛选实际按 subject_name 等值，不按 code。

集团/公司/部门的汇总按 ID 与名称分组；不能把当前实现描述为有独立组织维度表自动统一一切历史名称。当前组织选项优先外部 `ding_department_tree`，集团/公司路径识别和 fallback 见 [workflow.md](workflow.md)。

## 数据验证边界

历史映射只在服务固定规则中生效，PMO/SG 等尚未确认的旧部门不自行归属。现有专题 [effective-budget-quota.md](../../effective-budget-quota.md) 记录业务解释；实际公司和负责人、缺企业 ID 单据、金额差异、schema 版本仍需目标数据核验。初始化没有修改或回填任何表。
