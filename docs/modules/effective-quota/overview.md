# 有效预算额度与配置中心：概览

本模块将已获通过的预算审批形成额度台账，保存预算期间、集团/公司/部门、负责人、总额与科目，供只读配置中心筛选和汇总。已有详细业务说明保留在 [effective-budget-quota.md](../../effective-budget-quota.md)，本目录补充当前代码映射和实际边界。

## 核心规则

- 来源唯一键为 corp_id+process_instance_id，不按表单编号跨企业去重。
- 总额度来自表单 total_amount；科目明细之和仅用于统计，不覆盖总额度；差异记录 detail_amount_mismatch。
- 通过时 upsert 为 effective；不通过时仅把既有额度标为 inactive，不删除科目，不为从未生效的审批创建无效额度行。
- 集团/子公司从组织路径已认可集团根和其直属下级确定；路径不足保留待确认，不推断业务项目归属。
- 历史组织映射限定企业和旧部门，部分还要求申请人 ID；规则在服务内集中维护，不能用名称模糊合并。

依据：[effective-budget-quota.js](../../../server/services/effective-budget-quota.js) 的 `buildEffectiveBudgetQuota`、`synchronizeEffectiveBudgetQuota`、`resolveLegacyEffectiveQuotaDepartment`。

## 用户与页面

[BudgetConfiguration.jsx](../../../client/src/pages/BudgetConfiguration.jsx) 展示额度数量/金额/差异、组织和科目统计、分页审批来源记录及负责人；只读，没有手工改额度或负责人 API。后台路由只允许超级管理员。组织选项优先 OA 当前树，不要求每个组织已有额度；OA 不可用时回退台账中的当前组织。

按年度、月份、集团、子公司、部门、科目名称和预算类型筛选。选择科目时，只显示/汇总该科目行，但总额度仍为整单总额；不能把科目金额再当成整单额度。

证据：[quota-configurations.js](../../../server/routes/quota-configurations.js)、[quota-configuration.js](../../../server/services/quota-configuration.js)。

## 与预算报表的区别

有效台账保存每个通过审批的额度，配置中心可汇总多条；列表按每类型/部门/月取最新候选，且仍允许审批中候选。当前列表和预警不直接读取本台账，因此配置中心总额与报表预算金额不保证相等。是否统一口径是待确认的业务变更，不在初始化中实施。

继续阅读：[流程](workflow.md)、[代码](code-map.md)、[数据库](database.md)、[接口](api.md)。
