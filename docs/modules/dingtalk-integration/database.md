# 钉钉查询与预警集成：数据映射

该模块不建新表，读本地预算主表并按需读取外部支出。主表字典复用 [预算数据](../budget-applications/database.md)，外部支出字典复用 [支出数据](../expense-reporting/database.md)。

| 接口 | 主表查询 / 金额来源 | 支出读取 |
| --- | --- | --- |
| querySimple | 按 form_no 或部门+参考月，取 create_time 最新；生产 monthly_budget_amount、非生产 budget_amount | 不读取 |
| query | 部门/创建时间范围，最多 50 主表行 | 不读取 |
| alert-budget-snapshot | 部门+预算月+类型，create_time/id 最新；同上预算金额 | attachExpenseAmounts 计算 approved_amount |

证据：[dingtalk.js](../../../server/routes/dingtalk.js)。三个读取都未直接使用 `budget_effective_quota`；未统一过滤审批状态，不能写成“只查询已生效预算”。

## 部门和企业

连接器首选 dept_id，兼容完整 dept_name 精确回退；共享预算配置可调整读取父部门。没有额外集团/子公司/企业参数参与该查询，预算主表本身的 form_no 唯一也不包含企业。多企业部署、重复名称/编号时是否唯一命中待验证。

HTTP 存在用户时使用 buildDepartmentScopeSql；无用户时 TRUE，不构成独立权限过滤。真正边界取决于接口密钥配置，见 [认证总览](../../knowledge/authentication.md)。

## 派生快照

快照包含 month、departmentId、可选 budgetTable、budgetAmount、usedAmount、applicationAmount、projectedAmount、utilizationRate、alertLevel。全部由查询和计算生成，不是新增余额表或额度扣减事务；本次申请不会写入已用金额。

预警读取与配置中心台账的金额差异、支出降级为零、缺部门/无预算和历史共享配置需要按具体调用方核验。外部预警服务是否保存快照、何时发送消息及通知对象在本仓库无法确认。
