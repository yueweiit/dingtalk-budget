# 预算申请与查询：概览

## 业务功能

预算申请在钉钉发起，本模块读取同步后的申请。当前页面支持全部、生产、非生产三个页签，预算月份范围、分页、统计卡、详情、Excel 导出和钉钉审批跳转；没有在 Web 内创建、修改或审批预算的接口。

入口：[BudgetList.jsx](../../../client/src/pages/BudgetList.jsx) 的 `fetchData`、`handleOpenDetail`；[list.js](../../../server/routes/list.js) 的预算路由。同步写入职责见 [同步模块](../synchronization/overview.md)。

## 分类和规则

| 类型 | 明细类别 | 表单解析 |
| --- | --- | --- |
| 生产 | 物料、生产费用、人工成本 | `parseMaterialItems`、`parseProductionItems`、`parseLaborItems` |
| 非生产 | 人资、办公场地、管理支出 | `parseHrItems`、`parseOfficeItems`、`parseOperationItems` |

解析器 [parser.js](../../../server/services/parser.js) 支持中西双语字段；`isBudgetRequest` 排除运营/采购支出标题，并要求存在预算明细。标题或一个“金额”字段不能单独证明是预算单。

列表和预算报表按预算月份读取，过滤撤销、驳回等无效状态，要求至少一类明细；同类型、部门标识、预算月份只取最新申请。审批中的候选也可入选，这与只显示通过预算的有效额度中心不同。正金额预算默认限中国执行地区，零/负金额候选不受该地区条件排除；详见 [workflow.md](workflow.md)。

## 角色

超级管理员查看所有候选；部门主管只可见绑定部门及路径中的下级。同步按钮与配置中心入口仅管理员显示。列表金额仅对“已通过”“审批中”显示；安全边界仍在后端。

依据：[auth.js](../../../server/services/auth.js) 的 `buildDepartmentScopeSql`、[BudgetList.jsx](../../../client/src/pages/BudgetList.jsx)、[budgetList.js](../../../client/src/utils/budgetList.js)。

## 与其他模块的关系

- 预算主表保存审批历史，额度台账按企业+实例保存通过额度；不同页面不共享一个聚合查询。
- `approved_amount` 和支出分类由 [支出核算模块](../expense-reporting/overview.md) 补充，不是预算数据库里的独立已用余额字段。
- 详情从 report 响应匹配预算记录；保留的 `getBudgetDetail` 封装不在实际详情调用链中。
- 本地审批流程接口读取 `approval_flow`；写入来源待验证。

继续阅读：[业务流程](workflow.md)、[代码映射](code-map.md)、[数据字典](database.md)、[接口](api.md)。
