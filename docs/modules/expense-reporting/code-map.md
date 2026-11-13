# 支出核算、报表与导出：代码映射

| 功能 | 后端 | 前端 / 数据 |
| --- | --- | --- |
| 核算来源选择 | [list.js](../../../server/routes/list.js) `fetchApprovalExpenseDetails/isAccountableExpense` | 外部运营、采购、月结、事件表 |
| 最终完成口径 | [completed-expense-policy.js](../../../server/utils/completed-expense-policy.js) | [utcDate.js](../../../client/src/utils/utcDate.js) UTC 展示 |
| 标准/历史拆分 | `fetchExpenseDeptSplits/attachExpenseSplitsToDetails/legacyJsonExpenseSplitRows` | [expenseDetailSplit.js](../../../client/src/utils/expenseDetailSplit.js) |
| 数据权限 | `scopeExpenseDetailsForUser/redactScopedExpenseMetadata`、[auth.js](../../../server/services/auth.js) | 前端裁剪仅控制当前导出范围，不能替代服务端授权 |
| 执行地区 | `buildBudgetedDepartmentMonthSet/shouldIncludeDepartmentExpense` | 当前图表和 Excel 读取后端结果 |
| 金额和类别 | `attachExpenseAmounts/summarizeApprovedDetails/splitExpenseCategory` | `xlsxReport.buildApprovedDetailRows/buildExecutionRows` |
| 历史部门投影 | [july-department-reporting-overlay.js](../../../server/services/july-department-reporting-overlay.js) | [departmentIdentity.js](../../../client/src/utils/departmentIdentity.js) |
| 共享预算 | [yw-tech-shared-budget.js](../../../server/services/yw-tech-shared-budget.js) `rollupSharedBudgetRows` 等 | [chartHelpers.js](../../../client/src/utils/chartHelpers.js) 与 workbook shared 字段 |
| 待审批状态 | `fetchPendingBudgetRows/fetchPendingExpenseRows` | workbook 执行状态表 |
| OA 审批效率 | [approval-efficiency.js](../../../server/services/approval-efficiency.js) `fetchApprovalEfficiency/buildApprovalEfficiency` | 当前可视化页、管理员附加工作表 |
| 详情分类 | report 明细与拆分 | [BudgetList.jsx](../../../client/src/pages/BudgetList.jsx) `buildExpenseDetailSections`、[expenseDetailSections.js](../../../client/src/utils/expenseDetailSections.js) |
| 可视化和年趋势 | report 范围查询，另查全年范围 | [VisualReportEchartsStyle.jsx](../../../client/src/pages/VisualReportEchartsStyle.jsx) `fetchReport/fetchTrendReport` |
| Excel 范围与生成 | report JSON | [reportExportScope.js](../../../client/src/utils/reportExportScope.js)、[xlsxReport.js](../../../client/src/utils/xlsxReport.js) `createBudgetReportWorkbook/saveWorkbook` |
| 付款明细展示 | 事件 ID、paid_at、evidence 字段 | [paymentEventDisplay.js](../../../client/src/utils/paymentEventDisplay.js) |

## 回归映射

- 金额/去重：[payment-event-accounting.test.js](../../../server/test/payment-event-accounting.test.js)、[completed-expense-policy.test.js](../../../server/test/completed-expense-policy.test.js)、[monthly-settlement-accounting.test.js](../../../server/test/monthly-settlement-accounting.test.js)。
- 权限/SQL：[report-auth-scope.test.js](../../../server/test/report-auth-scope.test.js)、[report-query-safety.test.js](../../../server/test/report-query-safety.test.js)。
- 部门/区域：[department-identity-report.test.js](../../../server/test/department-identity-report.test.js)、[july-department-reporting-overlay.test.js](../../../server/test/july-department-reporting-overlay.test.js)、[yw-tech-shared-budget.test.js](../../../server/test/yw-tech-shared-budget.test.js)、[china-execution-region-filter.test.js](../../../server/test/china-execution-region-filter.test.js)。
- 时间/效率：[utc-expense-time.test.js](../../../server/test/utc-expense-time.test.js)、[approval-efficiency.test.js](../../../server/test/approval-efficiency.test.js)。
- 前端：[report-summary.test.js](../../../client/tests/report-summary.test.js)、[report-workbook-sheets.test.js](../../../client/tests/report-workbook-sheets.test.js)、[payment-event-display.test.js](../../../client/tests/payment-event-display.test.js)、[monthly-settlement-display.test.js](../../../client/test/monthly-settlement-display.test.js)、[expense-detail-section-order.test.js](../../../client/test/expense-detail-section-order.test.js)。

[payment-event-query.integration.test.js](../../../server/test/payment-event-query.integration.test.js) 会写真实支出库；本次未运行，后续必须使用获准的测试数据库。修改报表时也核对 [预警](../dingtalk-integration/code-map.md)，其已用金额复用同一支出核算。
