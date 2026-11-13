# 支出核算、报表与导出：外部数据字典

本模块本身主要只读。外部支出 schema 不在本仓库，下面仅列本地查询已使用的字段和逻辑关系，不宣称完整表定义/约束。来源：[list.js](../../../server/routes/list.js) 的各 SQL 和能力检测；配置默认库为 dingtalk_approval。

## 外部支出表

| 表 | 当前读取职责 / 关键字段 |
| --- | --- |
| `approval_expense_operation` | 运营单：business_id/process_instance_id、request_date/execution_region、申请/创建部门 ID/路径、source_created_at/updated_at、approval_completed_at/approval_status/raw_data、amount/base_currency_amount、专项分类与拆分 JSON、matter_description |
| `approval_expense_purchase` | 采购单：同类来源/部门/时间/状态字段，detail_summary_amount/base_currency_amount；采购用途与明细兼容读取 |
| `approval_expense_monthly_settlement` | 月结：business_id、实例、申请日期/部门、total_amount/base_currency_amount、状态/raw_data；通过付款事件记账 |
| `approval_expense_payment_events` | 付款事件：id、business_id/process_instance_id/expense_kind、paid_at、amount/base_currency_amount/currency、status、source_type、rule_version、source_user_id、evidence_text；授权来源和版本判定 |
| `approval_expense_dept_split` | 部门拆分：business_id、split_type、category_key/category_name、department/department_id/department_source、department_path_ids/names、amount/note |
| `approval_expense_purchase_processors` | 可选采购处理明细；用于采购用途说明，关联 business_id |
| `approval_expense_monthly_settlement_details` | 可选月结明细；用于付款事由说明，按 detail.settlement_id = monthly.id 关联；依据 monthlySettlementPaymentReasonSql |

事件与单据按 business_id JOIN；拆分也按业务编号读。当前读取没有统一企业/tenant 条件，外部编号唯一性和跨企业隔离待验证；不要擅自把这些逻辑 JOIN 写成已经有物理外键。

## 标准拆分与历史 JSON

运营单历史字段包含 salary_by_department、bonus_by_department、office_equipment_by_department、administrative_by_department、social_insurance_by_department、office_space_by_department、individual_income_tax_by_department、it_operation_by_department。不是所有旧库都有 bonus、office_equipment、administrative 列，代码对这些列进行能力检测。

标准拆分 table 行优先；缺失时兼容 JSON。任一拆分证据会排除运营整单核算。动态 administrative 必须保留 category_key/name，不能把不同费用子类混成一张明细。拆分字段与读模型见 [list.js](../../../server/routes/list.js) 的 `departmentSplitEvidenceSql`、`extractDeptSplitEntries`、`attachExpenseSplitsToDetails`。

## 时间、金额和返回读模型

- 完成态按 approval_completed_at AT TIME ZONE UTC，事件按 paid_at AT TIME ZONE UTC；月底/年界需同时验证后端 SQL 和前端格式。
- amount、base_currency_amount、detail_summary_amount 的优先级由具体来源决定；付款事件用事件金额，拆分用各行金额，不使用整单总额重复覆盖。
- 统一返回补充 expense_kind、accounting_source、accounting_at、query_month、payment_event_id/paid_at/amount/currency/evidence_text/source_user_id、expense_splits、reporting/rollup 字段；这些可能是 SELECT 常量或应用派生，不能视为数据库新列。
- confirmed 事件、rule_version、source_type 的外部约束和 schema 初始化由支出同步项目负责。全额抵扣零金额约束须先在外部库可用，见 [既有专题](../../fully-deducted-payment-rule.md)。

## OA 审批效率数据

来源：[approval-efficiency.js](../../../server/services/approval-efficiency.js)，默认 OA 数据库 dingtalk_oa。

| 表 | 关键字段 / 关系 |
| --- | --- |
| `ding_approval_instance` | corp_id/process_instance_id/process_code、title/status/result、create_time/finish_time/deleted_at |
| `ding_process_template` | corp_id/process_code、name、enabled/is_deleted；实例与模板按企业+流程关联 |
| `ding_approval_task` | corp_id/process_instance_id、task_id/task_order/node_name、approver_user_id/name、start_time/end_time/status/raw_payload |
| `ding_user_snapshot` | corp_id/user_id、name/is_current/valid_from/id；缺姓名时查询最新有效快照展示 |

数据仅按当前查询时间计算效率，没有本项目效率结果表。任务实例 JOIN 含 corp_id，但部分后续内存映射使用 process_instance_id；真实多企业实例唯一性仍需验证。节点数据只在管理员 opt-in 响应中提供，见 [api.md](api.md)。

## 变更和兼容边界

预算/支出字段能力检测并不覆盖所有必需表列，缺少必需 schema 仍会失败。外部 schema 改动必须由所属项目维护；本项目只同步读取契约和测试。实际已运行迁移、索引与数据库权限均待验证。
