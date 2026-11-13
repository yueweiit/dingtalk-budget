# 预算申请与查询：代码映射

| 行为 | 前端 | 后端方法 / 数据 |
| --- | --- | --- |
| 页面进入、三页签 | [App.jsx](../../../client/src/App.jsx)、[BudgetList.jsx](../../../client/src/pages/BudgetList.jsx) `fetchData` | [list.js](../../../server/routes/list.js) `/all`、`/production`、`/non-production` |
| 请求与旧服务兼容 | [api/index.js](../../../client/src/api/index.js) `getAllBudgetList` | 404 时前端回退两类列表合并；不是后端自动切换 |
| 月份、状态、部门、地区 | [DateFilter.jsx](../../../client/src/components/DateFilter.jsx) | `buildBudgetWhere`、`appendBudgetMonthRange`、`validBudgetStatusWhere`、`submittedBudgetChinaWhere` |
| 候选去重、预算明细 | 读取 `material_items` 等字段 | `productionBudgetCte` / `nonProductionBudgetCte`，两主表与六明细表 |
| 部门展示、历史标识 | [departmentIdentity.js](../../../client/src/utils/departmentIdentity.js)、[departmentPath.js](../../../client/src/utils/departmentPath.js) | [department-identity.js](../../../server/services/department-identity.js)、[july-department-reporting-overlay.js](../../../server/services/july-department-reporting-overlay.js) |
| 合并、分页、金额显示 | [budgetList.js](../../../client/src/utils/budgetList.js) | `mergeBudgetRows`、数组 slice；`attachExpenseAmounts` 后汇总 |
| 详情弹窗 | `BudgetList.handleOpenDetail`、`buildExpenseDetailSections` | report 响应中匹配预算行；没有额外详情 Controller |
| 统计卡 | `getStats` | `/stats` → 候选总数、主表当日计数 |
| 审批记录 | `getApprovalList` 封装存在，当前页面未调用 | `/approval` → `approval_flow`，EXISTS 主表范围校验 |
| Excel | [xlsxReport.js](../../../client/src/utils/xlsxReport.js)、[reportExportScope.js](../../../client/src/utils/reportExportScope.js) | report 返回数据，后端不生成 xlsx 文件 |
| 表单解析与写入 | 手动同步组件 | [parser.js](../../../server/services/parser.js)、[sync.js](../../../server/routes/sync.js)，职责属于同步模块 |

## 现有验证

- 后端：[all-budget-list.test.js](../../../server/test/all-budget-list.test.js)、[budget-department-sync.test.js](../../../server/test/budget-department-sync.test.js)、[current-month-budget-region-filter.test.js](../../../server/test/current-month-budget-region-filter.test.js)、[department-identity-presentation.test.js](../../../server/test/department-identity-presentation.test.js)。
- 前端：[budget-list.test.js](../../../client/tests/budget-list.test.js)、[department-path.test.js](../../../client/tests/department-path.test.js)、[report-export-scope.test.js](../../../client/tests/report-export-scope.test.js)。

跨模块影响：部门变更同时核对 [同步映射](../synchronization/code-map.md)、[报表映射](../expense-reporting/code-map.md) 和 [预警映射](../dingtalk-integration/code-map.md)。
