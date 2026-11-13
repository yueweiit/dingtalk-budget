# 审批同步与调度：代码映射

| 职责 | 文件和方法 | 下游 |
| --- | --- | --- |
| 手动预算同步 | [SyncButton.jsx](../../../client/src/components/SyncButton.jsx) → `api.syncData` | [sync.js](../../../server/routes/sync.js) POST `/` |
| 专项拆分同步 | [ExpenseSplitSyncButton.jsx](../../../client/src/components/ExpenseSplitSyncButton.jsx) → `api.syncExpenseSplits` | POST `/expense-splits` → 外部 `/api/sync/operation-splits` |
| 审批源切换 | [services/dingtalk.js](../../../server/services/dingtalk.js) `getProcessInstanceIds/getProcessInstanceDetail` | 钉钉开放平台或 OA `ding_approval_instance` |
| 钉钉地址/流程 | [config/dingtalk.js](../../../server/config/dingtalk.js) | 环境变量和固定端点 |
| 双语解析 | [parser.js](../../../server/services/parser.js) `getBudgetType/isBudgetRequest/parse*Budget/parse*Items` | 主表字段与六类明细 |
| 主体和部门路径 | [department-tree.js](../../../server/services/department-tree.js) `resolveServiceEntityDepartment/getDepartmentSnapshot` | OA `ding_department_tree` |
| 单实例写入 | `syncDingtalkInstance/insertRecord/updateRecord` | 预算表、明细、有效额度事务 |
| 既有状态刷新 | `refreshExistingBudgetStatuses/updateExistingBudgetStatus/refreshEffectiveBudgetQuota` | 主表状态与额度，两段提交 |
| 有效额度 | [effective-budget-quota.js](../../../server/services/effective-budget-quota.js) `synchronizeEffectiveBudgetQuota` | [额度模块](../effective-quota/code-map.md) |
| 增量与 pending | [scheduler.js](../../../server/services/scheduler.js) `runIncrementalSync/recheckPendingInstances/startScheduler` | JSON 状态文件 |
| 调度 HTTP 管理 | [config.js](../../../server/routes/config.js) | `getSchedulerStatus/startScheduler/stopScheduler` |
| 重试、熔断 | [resilience.js](../../../server/utils/resilience.js) `retry/createCircuitBreaker` | 钉钉 HTTP，不覆盖全部外部调用 |

## 运维脚本

| 文件 | 作用 |
| --- | --- |
| [sync-dingtalk.js](../../../server/scripts/sync-dingtalk.js) | `--instance` / 日期窗口，`--update-existing` 传更新选项 |
| [backfill-budget-department-identities.js](../../../server/scripts/backfill-budget-department-identities.js) | 默认 dry-run，显式 `--write=1` 更新尚缺 ID 的主表 |
| [budget-department-backfill.js](../../../server/services/budget-department-backfill.js) | 回填决策与带条件的安全 UPDATE 构建；不覆盖已有 ID |
| [backfill-effective-budget-quota.js](../../../server/scripts/backfill-effective-budget-quota.js) | 显式范围内解析已通过预算，只写额度和科目 |
| [reconcile-effective-budget-organizations.js](../../../server/scripts/reconcile-effective-budget-organizations.js) | 按企业+部门对照 OA 当前树，重核额度组织 |

## 现有验证

[dingtalk-oa-db.test.js](../../../server/test/dingtalk-oa-db.test.js)、[budget-department-sync.test.js](../../../server/test/budget-department-sync.test.js)、[service-entity-department-routing.test.js](../../../server/test/service-entity-department-routing.test.js)、[pending-budget-status-tracking.test.js](../../../server/test/pending-budget-status-tracking.test.js)、[budget-department-backfill.test.js](../../../server/test/budget-department-backfill.test.js)。

存在未接入当前页面的 `SyncButtonClean.jsx`，实际列表导入的是 `SyncButton.jsx`；不要只改未使用的副本。
