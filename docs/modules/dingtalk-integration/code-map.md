# 钉钉查询与预警集成：代码映射

| 功能 | 实现 | 数据 / 调用方 |
| --- | --- | --- |
| 路由挂载和 API Key | [index.js](../../../server/index.js) | `/api/dingtalk`；专用预警绕过全局 Key 后另验 |
| 预算类型解析 | [dingtalk.js](../../../server/routes/dingtalk.js) `resolveTableName` | 固定两主表，无任意表名 |
| 部门兼容参数 | [connector-department-query.js](../../../server/services/connector-department-query.js) `buildConnectorDepartmentFilter` | 优先 ID，完整名称等值回退 |
| 共享预算查询主体 | `resolveConnectorBudgetDepartment` → [yw-tech-shared-budget.js](../../../server/services/yw-tech-shared-budget.js) `sharedBudgetRollupDepartment` | 映射指定子部门到父预算 |
| 简化查询 | `/querySimple`、`getMonthRange/budgetMonthDateSql` | 钉钉表单连接器；金额字符串 |
| 旧查询 | `/query` | 主表记录数组，最多 50 |
| 内部密钥 | `internalAlertKeyMatches` | BUDGET_ALERT_API_KEY、X-Budget-Alert-Key |
| 预算来源 | `findAlertBudgetRow` | 部门、预算月份、创建时间最新主表 |
| 已用金额 | `resolveAlertBudgetSnapshot` → [list.js](../../../server/routes/list.js) `attachExpenseAmounts` | 支出来源复用报表核算 |
| 阈值计算 | `calculateBudgetAlertSnapshot` | normal/warning_90/over_budget/missing_budget |
| 历史前端封装 | [api/index.js](../../../client/src/api/index.js) `getBudgetDetail` | 调 querySimple；当前 handleOpenDetail 未用该封装 |

## 现有验证

[connector-department-query.test.js](../../../server/test/connector-department-query.test.js)、[dingtalk-type-resolution.test.js](../../../server/test/dingtalk-type-resolution.test.js)、[dingtalk-connector-missing-department.test.js](../../../server/test/dingtalk-connector-missing-department.test.js)、[yw-tech-shared-budget.test.js](../../../server/test/yw-tech-shared-budget.test.js)。

`dingtalk-type-resolution.test.js` 还验证快照阈值、共享父预算查询及已用金额与本次申请的组合；没有发现完整覆盖该 HTTP 接口认证/错误分支和外部通知的测试。后续改动应补充受影响场景，不能据单元测试宣称预警全链路已验收。
