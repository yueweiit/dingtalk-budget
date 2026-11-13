# 有效预算额度与配置中心：接口

两个接口都在 [quota-configurations.js](../../../server/routes/quota-configurations.js) 使用 requireRole(superadmin)，主管不可访问。页面入口隐藏仅是辅助控制，无会话 401、非管理员 403。

## 筛选项

GET `/api/quota-configurations/options`，返回 `{success:true,data:{years,months,groups,companies,departments,budgetTypes,subjects}}`。

- years/months/budgetTypes/subjects 根据 effective 台账及科目取得。
- groups/companies/departments 优先 OA 当前组织树；子公司附 group，部门附 company/group，用于客户端联动。
- OA 读取失败时回退台账 current 组织选项，没有与报表一样的 warnings 字段，需结合日志和数据核验来源。

实现方法 `fetchOptions`、[department-tree.js](../../../server/services/department-tree.js) 的 `listCurrentOrganizationOptions`。

## 分页额度和汇总

GET `/api/quota-configurations`，参数规范化在 [quota-configuration.js](../../../server/services/quota-configuration.js)。

| 参数 | 规则 |
| --- | --- |
| `budgetYear` | 可空，非空必须 4 位数字 |
| `budgetMonth` | 可空，非空 YYYY-MM 且月份 01–12 |
| `groupDeptId,companyDeptId,departmentId` | 稳定 ID 精确筛选 |
| `subjectName` | 科目名称等值筛选 |
| `budgetType` | production 或 non_production |
| `page` | 默认 1，整数范围 1–100000 |
| `pageSize` | 默认 20，整数范围 1–100 |

成功返回 `{success:true,data:[额度明细],total,page,pageSize,summary}`。明细包括审批来源、期间、组织、current 标记、公司本级标记、负责人、total_amount、detail_amount/mismatch、审批完成时间、subjects、subject_amount。

summary 包含 `totals`（数量、总额、mismatch 数）、`groups/companies/departments/subjects`。汇总覆盖筛选结果，不受当前页分页限制。科目筛选后明细 subjects 和 subject_amount 只针对所选科目，total_amount 仍是整单总额。

非法格式/类型/分页返回 400 通用参数错误，其他查询异常 500，生产隐藏细节。当前不提供 POST/PUT/DELETE 的额度管理接口；金额和负责人由审批同步产生。

客户端封装：[api/index.js](../../../client/src/api/index.js) 的 `getQuotaConfigurationOptions/getQuotaConfigurations`；页面 [BudgetConfiguration.jsx](../../../client/src/pages/BudgetConfiguration.jsx)。
