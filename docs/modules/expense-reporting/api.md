# 支出核算、报表与导出：接口

## 主报表接口

GET `/api/list/report`，要求登录；部门主管只返回权限范围数据。处理器位于 [list.js](../../../server/routes/list.js)，前端封装 `getReportData` 位于 [api/index.js](../../../client/src/api/index.js)。

| 参数 | 含义 |
| --- | --- |
| `startDate,endDate` | 可传 YYYY-MM 或日期；预算候选用预算月，完成/付款支出用记账日，待审批预算用申请/创建日、待审批支出用 request_date |
| `includeApproved=1` | 附加实际支出汇总和明细，并用于预算行的实际支出核算；不等于要求所有支出只来自完成审批 |
| `includeApprovalEfficiency=1` | 仅 superadmin 查询并附加 OA 审批效率；主管参数开启也不会返回该数据 |

成功数据结构：

```json
{
  "success": true,
  "data": {
    "production": [],
    "nonProduction": [],
    "pendingProduction": [],
    "pendingNonProduction": [],
    "pendingExpenses": [],
    "reportStartDate": "",
    "reportEndDate": "",
    "approvedExpenses": [],
    "approvedExpenseDetails": []
  },
  "warnings": []
}
```

上例包含 includeApproved 启用的可选字段；未启用时不附加两类实际支出结果。approvalEfficiency 仅成功读取时附加，不固定返回空对象。明细字段含义见 [database.md](database.md)；权限和口径见 [workflow.md](workflow.md)。

## 审批效率结果

`data.approvalEfficiency` 包含 `timeoutHours`、`summary`、`byProcess`、`taskDetails`。summary 提供实例数、可测数量、完成/运行数、超时数/比例、平均完成与节点耗时。taskDetails 包含流程/实例/任务/节点、审批人、开始/结束时间、小时耗时及 overdue；只能给管理员。

OA 查询失败返回 warnings 并省略该字段。实际支出汇总降级与待审批外部查询失败的区别见 [workflow.md](workflow.md)，不是所有数据库故障都能返回成功。

## 页面调用和导出

- 列表详情按单行预算月请求 includeApproved=1；详情没有专门的支出 HTTP 路由。
- 可视化按选择范围请求，管理员带效率参数；另请求全年范围供趋势图使用，全年请求不带效率参数。
- 列表导出请求完整 report，再根据当前页签筛选导出范围；请求时已由后端授权。
- `createBudgetReportWorkbook` 默认生成 9 页：汇总、地区预算分布、执行状态分布、预算类型占比、部门执行率、部门预算占比、部门支出占比、实际支出明细、非生产预算明细。有 approvalEfficiency 时追加审批效率汇总、审批节点明细。

依据：[BudgetList.jsx](../../../client/src/pages/BudgetList.jsx)、[VisualReportEchartsStyle.jsx](../../../client/src/pages/VisualReportEchartsStyle.jsx)、[xlsxReport.js](../../../client/src/utils/xlsxReport.js)。当前 workbook 不嵌入图表，也没有单独生产预算明细页；不能由数据存在推断已生成该工作表。

## 失败与时间

无会话 401；report 主链异常 500，生产返回查询失败。客户端 timeout=180000 ms；反向代理示例只有 60 秒，实际长查询行为待部署验证。结束日期包含当日，短月份扩展到月首/月末；具体数据库 timestamp/date 的时区边界须按来源验证。
