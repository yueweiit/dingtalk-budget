# 预算申请与查询：数据字典

定义依据：[public.sql](../../../public.sql)、[migrate.sql](../../../migrate.sql)，写入依据 [sync.js](../../../server/routes/sync.js)，读取依据 [list.js](../../../server/routes/list.js)。以下是主要字段，不替代完整 DDL。

## 主表

`production_budget`、`non_production_budget` 都有 bigint 主键 `id`，各自 `form_no varchar(50)` 非空唯一；两表及企业之间没有联合唯一约束。

| 字段组 | 字段 / 含义 |
| --- | --- |
| 来源 | `form_no` 业务编号、`process_instance_id` 审批实例 |
| 部门 | `dept_name`、`dept_id varchar(64)`、`dept_source`；路径 `dept_path_ids/dept_path_names jsonb` |
| 类型和期间 | `budget_type` 保存中文生产/非生产；`budget_month/declaration_month varchar(7)`；`application_date date`；`execution_region` |
| 金额 | `total_amount numeric(14,2)`；生产另有 `monthly_budget_amount`，非生产另有 `budget_amount`；解析阶段均以表单总额生成 |
| 申请人 | `creator_name`、`creator_userid` |
| 状态和时间 | `status` 默认审批中；`create_time timestamp(6)`；没有本地审批完成时间专列 |
| 其他 | `remark`、`tenant_id` 默认 default；当前查询无统一 tenant 过滤 |

初始 `dept_name` 为 varchar(255) NOT NULL，迁移把类型加宽到 text；`execution_region` 也可能被迁移加宽。实际库类型和部门空值约束待验证。

## 六类明细

| 主表 | 明细表 | `detail_type` |
| --- | --- | --- |
| 生产 | `budget_material` / `budget_production` / `budget_labor` | material / production / labor |
| 非生产 | `budget_hr` / `budget_office` / `budget_operation` | hr / office / operation |

每表有 bigint `id`、`form_no` 和类别字段；没有指向预算主表的外键。budget_production、budget_labor 通过 CREATE TABLE LIKE 复制 budget_material 的结构，budget_office、budget_operation 复制 budget_hr 的结构，再各设序列和主键；这不是运行时表继承关系。

| 列组 | 字段 |
| --- | --- |
| 全部明细金额 | `original_amount`、`currency`、`exchange_rate numeric(18,6)`、`rmb_amount`、`amount`、`calculation_basis`、`remark` |
| 生产通用 | `detail_category`、`detail_code`、`production_line`、`item_name`、`specification`、`product_name`、`process`、`post_name`、`work_type`、`unit`、`quantity`、`unit_price` |
| 加班兼容 | `overtime_hours`、`overtime_unit_price`、`estimated_overtime_amount` |
| 非生产通用 | `detail_item`、`budget_purpose_detail`、`operation_expense`、`budget_detail`、`headcount` |

解析器中 `amount` 优先取非零人民币金额，兼容回退已有金额/原币金额；不是统一重新按汇率计算。修改金额映射需核对 [parser.js](../../../server/services/parser.js) 的 `parseCommonMoneyCell`、`parseProductionRow`、`parseNonProductionRow`。

## 本地审批记录

`approval_flow` 保存 `id`、`form_no`、`process_instance_id`、`budget_type`、`step`、`approver_name/approver_userid`、`approve_result`、`approve_opinion`、`approve_time timestamp`、`tenant_id`。`/list/approval` 按 step 返回，并通过预算主表 EXISTS 限制部门范围；待审批预算排除规则也读取授权人员的支付意见。

当前同步代码未发现 INSERT/UPDATE approval_flow。表数据的写入方、是否持续更新和线上完整性均待验证，不能描述为“预算同步自动生成全部审批节点”。OA 审批效率使用的是另一套外部实例/任务表，见 [支出数据](../expense-reporting/database.md)。

## 索引和读模型

两主表有月份、form_no、`(dept_id,budget_month)` 索引；六明细表有 form_no 索引；审批记录有 form_no 和 process_instance_id 索引。列表取最新、支出分类、部门显示、`approved_amount`、`budget_breakdown` 均为查询/应用层读模型，不是上述表的新物理字段。

明细删除重建由同步事务负责；独立状态刷新与额度刷新不属于同一事务。额度外键、金额 mismatch 及有效状态见 [额度数据](../effective-quota/database.md)。
