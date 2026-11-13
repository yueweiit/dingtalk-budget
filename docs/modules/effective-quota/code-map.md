# 有效预算额度与配置中心：代码映射

| 功能 | 文件 / 方法 | 数据 |
| --- | --- | --- |
| 配置页面 | [BudgetConfiguration.jsx](../../../client/src/pages/BudgetConfiguration.jsx) | options、分页记录、五组 summary |
| 请求封装 | [api/index.js](../../../client/src/api/index.js) `getQuotaConfigurationOptions/getQuotaConfigurations` | `/quota-configurations` |
| 后台权限与查询 | [quota-configurations.js](../../../server/routes/quota-configurations.js) `fetchOptions/fetchSummary`、GET 处理器 | superadmin、额度/科目、OA 当前组织 |
| 校验与 SQL | [quota-configuration.js](../../../server/services/quota-configuration.js) `normalizeQuotaConfigurationFilters/parseQuotaConfigurationPagination/buildQuotaConfigurationWhere` | 参数化 filters、限定科目和分页 |
| 额度/科目构建 | [effective-budget-quota.js](../../../server/services/effective-budget-quota.js) `buildEffectiveBudgetQuota/buildEffectiveBudgetSubjects` | 预算表单总额、六类明细和负责人 |
| 历史组织映射 | 同服务 `resolveLegacyEffectiveQuotaDepartment/organizationFromDepartmentPath` | 企业、部门、申请人精确规则 |
| 有效台账写入 | 同服务 `synchronizeEffectiveBudgetQuota` | upsert 额度、重建科目或 inactive |
| 同步调用者 | [sync.js](../../../server/routes/sync.js) `insertRecord/updateRecord/refreshEffectiveBudgetQuota` | 同步事务和独立状态刷新 |
| 当前组织选项 | [department-tree.js](../../../server/services/department-tree.js) `listCurrentOrganizationOptions/buildCurrentOrganizationOptions` | OA ding_department_tree |
| 专项 DDL | [sql/ensure-effective-budget-quota.sql](../../../sql/ensure-effective-budget-quota.sql)、[schema 脚本](../../../server/scripts/ensure-effective-budget-quota.js) | 本地额度两表 |
| 历史回填 | [backfill-effective-budget-quota.js](../../../server/scripts/backfill-effective-budget-quota.js) | 只写额度/科目 |
| 组织重核 | [reconcile-effective-budget-organizations.js](../../../server/scripts/reconcile-effective-budget-organizations.js) | 以企业+部门查当前组织 |

## 现有验证

[effective-budget-quota.test.js](../../../server/test/effective-budget-quota.test.js) 覆盖额度构造、金额差异、组织和写入；[quota-configuration.test.js](../../../server/test/quota-configuration.test.js) 覆盖参数、科目筛选和管理员限制；[department-tree.test.js](../../../server/test/department-tree.test.js) 覆盖组织选项和路径。

业务规则继续引用 [已有额度文档](../../effective-budget-quota.md)。变更状态时并查 [同步状态](../synchronization/workflow.md)，不能只改该服务的 approved 使用而遗漏调用方判定。
