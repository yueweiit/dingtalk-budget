# 核心数据字典

验证状态：2026-10-19 已通过仓库代码和本地 DDL 静态确认；未查询数据库。外部 OA、支出库字段只确认本项目的读取契约，物理类型、完整约束和实时数据待验证。

本页维护跨模块容易混淆的字段与编码；完整字段分组继续使用 [预算数据](../modules/budget-applications/database.md)、[额度数据](../modules/effective-quota/database.md)、[支出数据](../modules/expense-reporting/database.md)、[认证数据](../modules/authentication/database.md)，表关系和迁移边界见 [数据库总览](database.md)。

## 身份、来源与关联键

| 所属对象 | 字段 / 仓库定义 | 业务含义及关联边界 |
| --- | --- | --- |
| 两类预算主表 | `id bigint`；`form_no varchar(50)` 非空唯一 | id 是本地行号，form_no 是来源业务编号；唯一约束分别作用于两张主表，不包含企业 |
| 预算主表 | `process_instance_id varchar(100)` | 审批实例标识；不是主表唯一约束，不能替代已存在的 form_no 写入契约 |
| 六类预算明细 | `form_no varchar(50)` | 与对应预算主表逻辑关联；无主表外键，写入一致性依赖同步事务 |
| 有效额度 | `corp_id,process_instance_id varchar(128)` 非空联合唯一 | 企业＋审批实例是额度 upsert 键；`source_form_no` 为来源编号快照，无预算主表外键 |
| 额度科目 | `quota_id bigint,line_no integer` 联合主键 | quota_id 外键指向额度并级联删除；line_no 是本次构建顺序，重复同步会重建科目 |
| 外部支出 | `business_id`、`process_instance_id`、付款事件 `id` | 单据、事件与拆分按来源字段关联；本仓库没有这些外部表的完整 DDL，不将 JOIN 推断为物理外键 |
| 本地用户 / 会话 | `username varchar(100)` 唯一；`user_id bigint` 外键 | SSO 的 app_user_id 精确匹配 username；用户角色和部门仍来自本地用户表 |

依据：[public.sql](../../public.sql)、[auth.sql](../../auth.sql)、[额度写入服务](../../server/services/effective-budget-quota.js) 的 `synchronizeEffectiveBudgetQuota`、[支出查询](../../server/routes/list.js)。

## 部门、组织和租户

| 字段 | 含义 / 使用方 |
| --- | --- |
| 主表 `dept_id varchar(64)`、`dept_name` | 稳定部门 ID 与名称快照；名称初始 DDL 为 varchar(255) NOT NULL，迁移扩为 text |
| `dept_source` | 旧表单来源包括 form_id、originator_id、name_only；服务主体匹配为 service_entity_exact，无法匹配为 service_entity_unresolved |
| `dept_path_ids/dept_path_names jsonb` | 组织路径；主管权限用 ID 或路径包含关系，不按名称授权 |
| 额度 `group_dept_id/company_dept_id/department_id varchar(128)` | 集团、子公司及部门层级；公司本级也可能作为额度归属节点 |
| `organization_is_current boolean` | 额度构建/重核产生的当前组织标记，默认 false；当前组织树选项与历史额度映射应分别核对 |
| 外部 `ding_department_tree.dept_id/name/path_ids/path_names/is_current` | 当前组织目录来源；代码中的固定 ID 仅用于特定映射，不能充当完整、实时部门清单 |
| `reporting_dept_id/name`、`rollup_dept_id/name`、`department_identity_key` | 报表归属、共享预算归集和身份键，属于返回读模型，不是新增的预算主表列 |
| 主表 `tenant_id varchar(50)` | 当前解析固定 default，查询无统一 tenant 过滤；不能以该列或额度企业键宣称全系统多租户隔离 |

依据：[解析器](../../server/services/parser.js) 的 `getDepartmentIdentity/getServiceEntityRoutingInput`、[同步](../../server/routes/sync.js) 的 `enrichBudgetDepartmentSnapshot`、[组织树](../../server/services/department-tree.js)、[历史报表映射](../../server/services/july-department-reporting-overlay.js)、[共享预算](../../server/services/yw-tech-shared-budget.js)、[部门权限](../../server/services/auth.js)。服务主体无法解析时置空部门与初始 DDL 非空约束的冲突，见 [待验证事项](README.md#待验证及已知边界)。

## 金额和期间

| 所属对象 / 字段 | 类型或来源 | 业务规则 |
| --- | --- | --- |
| 主表 total_amount、monthly_budget_amount、budget_amount | numeric(14,2) | 表单总金额及类型对应字段；不能直接当作已支付、余额或有效额度台账 |
| 明细 original_amount、rmb_amount、amount | numeric(14,2) | 原币、人民币及兼容核算金额；解析以非零 rmb_amount 优先，回退 amount/original_amount，不统一重新按汇率换算 |
| 明细 currency、exchange_rate | varchar(50)、numeric(18,6) | 来源币种与汇率快照；币种展示翻译不能改变原币、本位币的核算关系 |
| 数量 quantity/headcount/overtime_hours | numeric(12,2) | 数量、人头或工时；不能因展示格式统一而截断来源精度 |
| 额度 total_amount、detail_amount | numeric(18,2) | 总额度与科目金额合计；差值绝对值大于 0.005 时标记 detail_amount_mismatch，不自动修正来源金额 |
| 支出 base_currency_amount、拆分 amount | 外部字段，物理类型待验证 | 付款事件用事件金额，拆分用分配金额；管理支出已包含普通运营/采购，不能把展示分类重复相加 |
| budget_month、declaration_month | varchar(7) | YYYY-MM；报表预算筛选优先 budget_month，空时回退 declaration_month |
| application_date、create_time | date、timestamp(6) | 申请日期与预算来源创建时间；主表 create_time 不带时区 |
| approval_completed_at、paid_at、query_month | 外部来源及派生字段 | 完成态按审批完成时间、付款事件按付款时间，以 UTC 记账；query_month 是查询/返回口径 |
| 额度及会话审计时间 | timestamptz | 额度 effective_at/deactivated_at/created_at/updated_at；会话 expires_at/last_seen_at，后者更新不延长有效期 |

依据：[DDL](../../public.sql)、[parser.js](../../server/services/parser.js) 的 `parseCommonMoneyCell/parseProductionRow/parseNonProductionRow`、[额度计算](../../server/services/effective-budget-quota.js)、[报表核算](../../server/routes/list.js)、[UTC 工具](../../client/src/utils/utcDate.js)。应用层使用 JS Number 和舍入，不能推断全链路都是十进制定点计算；金额边界与回归方向见 [架构](architecture.md)。

## 状态与枚举的领域边界

| 领域 / 字段 | 当前值或读取范围 | 使用限制 |
| --- | --- | --- |
| 主表 budget_type | 生产预算、非生产预算等中文值 | 来源解析及查询使用显示文案，历史契约需兼容；内部类型选择另用 production/non_production |
| 主表 status | 审批中、已通过、已驳回、已撤销 | 中文展示状态参与业务判断；初次解析与状态刷新存在兼容字段差异，不是严格数据库状态机 |
| 来源审批 status/result | COMPLETED、TERMINATED、CANCELLED/CANCELED、RUNNING/NEW 等；agree/refuse/reject 等 | 预算 TERMINATED+agree+finishTime 可生效，不适用于完成态支出；详细规则只维护在 [同步流程](../modules/synchronization/workflow.md) |
| 有效额度 status | effective / inactive | 服务端写入，DDL 未设此枚举 CHECK；不通过时只失活既有额度，再通过可重建科目并激活 |
| 科目 subject_type | material、production_expense、labor、hr、office、operation | 与六类来源明细对应；subject_code 是内部标识，subject_name 是展示或来源业务文字 |
| 支出 expense_kind | operation、purchase、monthly_settlement | 来源类别，与预算生产/非生产划分不同 |
| 支出 accounting_source | payment_event、monthly_settlement、completed_department_split、completed_approval_fallback | 核算分支及时间口径标识，是读取时派生值；定义见 [支出流程](../modules/expense-reporting/workflow.md) |
| 付款事件 status / rule_version | 只接受 confirmed；认可 authorized-comment-v1、manual-confirmed-v1 的规定来源组合 | 这是本项目接受范围，外部完整枚举待验证；fully_deducted 为零金额证据，不增加支出 |
| 拆分 split_type | salary、social_insurance、bonus、office_equipment、office_space、individual_income_tax、administrative、it_operation 等 | bonus 表示备用金；administrative 需保留 category_key/name；外部扩展类型不能仅按名称猜测含义 |
| 用户 role | superadmin / department_supervisor | 数据库 CHECK；主管必须有非空 department_id |
| 预警 alertLevel | missing_budget、normal、warning_90、over_budget | 预算缺失/非正不计算利用率；恰好100%仍为 warning_90，严格超过才 over_budget |

依据：[parser.js](../../server/services/parser.js)、[sync.js](../../server/routes/sync.js)、[effective-budget-quota.js](../../server/services/effective-budget-quota.js)、[list.js](../../server/routes/list.js)、[auth.sql](../../auth.sql)、[预警计算](../../server/routes/dingtalk.js) 的 `calculateBudgetAlertSnapshot`。以上只列重要枚举，不把外部未知状态当作已支持。

## 变更与国际化约定

- 新字段先核对 DDL、解析/同步、API、列表/报表/导出及外部调用方，来源数据与派生字段分别说明。
- 新内部状态/类型采用稳定编码，展示交由翻译资源；历史中文状态、预算类型、科目筛选和值匹配保持兼容，不能直接用翻译替换数据库值。
- 部门名称、category_name、subject_name、预算用途及支出描述是业务数据，不能直接当作翻译键，也不能按翻译后名称关联权限。
- 当前没有业务多语言列或统一界面翻译层；标签、提示、枚举、输出与语言回退的渐进方案见 [国际化](internationalization.md)。
