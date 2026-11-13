# 支出核算、报表与导出：概览

## 功能

本模块读取外部支出库，把运营、采购、月结和部门专项拆分核算到预算月份及部门，提供列表已执行金额、详情分类、当前可视化页面和 Excel；可选读取 OA 审批效率。它不执行支付，也不负责识别评论后写入付款事件。

后端入口：[list.js](../../../server/routes/list.js)。当前页面：[VisualReportEchartsStyle.jsx](../../../client/src/pages/VisualReportEchartsStyle.jsx)，实际图表使用 Recharts；详情 [BudgetList.jsx](../../../client/src/pages/BudgetList.jsx) 使用 ECharts。共用报表转换与工作簿代码：[xlsxReport.js](../../../client/src/utils/xlsxReport.js)。

## 核算来源

| `accounting_source` | 场景 | 时间口径 |
| --- | --- | --- |
| `payment_event` | 无部门拆分的运营/采购，合格且 confirmed 的付款事件 | `paid_at` 的 UTC 日期/月 |
| `monthly_settlement` | 月结表与合格付款事件关联，不使用关联采购审批再累计 | 同上 |
| `completed_department_split` | 存在标准拆分或历史 JSON 拆分的已完成同意运营单 | `approval_completed_at` 的 UTC 日期/月 |
| `completed_approval_fallback` | 无合格付款事件、且运营单无拆分证据的完成态整单兜底；采购也有完成态兜底 | 同上 |

付款事件可能来自进行中的审批；完成态兜底则必须整单 COMPLETED、最终结果同意且有完成时间。规则细节见 [workflow.md](workflow.md)，不能将所有来源都限制为完成审批。

## 支出分类

| 业务类别 | 当前分类和展示 |
| --- | --- |
| 普通运营/采购 | 可分别展示，但管理支出包含相关金额，合计时不能再重复相加 |
| 工资、社保公积金 | 拆分类型 salary/social_insurance；服务端工资类别包含社保，明细可区分 |
| 备用金 | 历史键 bonus，不代表奖金；与普通管理支出分开计一次 |
| 办公场地 | office_space，统计到 office 类别 |
| 个税 | individual_income_tax，统计到 tax |
| 动态管理费用 | administrative，按 category_key/category_name 保持分类明细；汇总归入管理支出 |
| 历史办公设备 | office_equipment 保持可读；新行政选项采用动态管理费用 |
| 历史 IT 运维 | 兼容读取，当前映射普通运营类别；不恢复独立新业务入口 |
| 月结 | 独立 monthly_settlement 类别；不套普通执行地区过滤 |

依据：[list.js](../../../server/routes/list.js) 的 `splitExpenseCategory`、`attachExpenseAmounts`、`summarizeApprovedDetails`；现有专题 [仓库 README](../../../README.md)、[报表指南](../../BUDGET_REPORTING_GUIDE.md)。外部拆分生成条件必须到所属支出项目核验。

## 权限和数据范围

超级管理员查看全范围，主管仅本部门/下级；跨部门表单先裁剪拆分和金额，后汇总。普通支出在该部门该月存在正预算时限中国执行地区；没有对应正预算的支出可保留，月结独立处理。这不是简单的“所有报表数据只含中国”。

审批效率仅管理员在请求参数开启后获得；本地审批流程接口是另一条链路。现有业务说明与验收复用 [BUDGET_REPORTING_GUIDE.md](../../BUDGET_REPORTING_GUIDE.md)，全额抵扣复用 [fully-deducted-payment-rule.md](../../fully-deducted-payment-rule.md)。

继续阅读：[流程](workflow.md)、[代码映射](code-map.md)、[外部数据字典](database.md)、[接口](api.md)。
