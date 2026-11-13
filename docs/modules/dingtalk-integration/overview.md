# 钉钉查询与预警集成：概览

本模块服务钉钉表单连接器和外部 OA 预警调用方，查询预算金额或预计使用率。预算审批 API 同步属于 [同步模块](../synchronization/overview.md)，不要将本模块接口混同于审批写入入口。

## 接口用途

| 功能 | 当前行为 |
| --- | --- |
| querySimple | 按表单号，或类型+部门+月份取一条预算，返回字符串 budgetAmount；缺类型/缺部门/无数据可返回 0 |
| query | 兼容旧接口，按部门/日期查询最多 50 条主表记录 |
| alert-budget-snapshot | 专用密钥验证后，结合预算和实际支出计算本次申请后的 projectedAmount、utilizationRate、alertLevel |

定义：[routes/dingtalk.js](../../../server/routes/dingtalk.js)。querySimple 不返回完整预算详情，前端详情实际使用 report。

## 类型与部门兼容

类型支持中西/英文、数组或 JSON 数组，非生产优先判断；连接器 option_1 为非生产、option_2 为生产，未知非空值兼容回退生产。部门优先稳定 ID，兼容多个字段名包括 deptNameID；只有无 ID 时才用完整名称不区分大小写的等值回退，不模糊搜索。

证据：[dingtalk.js](../../../server/routes/dingtalk.js) 的 `resolveTableName/resolveConnectorBudgetDepartment`、[connector-department-query.js](../../../server/services/connector-department-query.js)。缺部门的简化调用返回安全零值，以兼容表单依赖参数尚未准备好的场景。

## 预警含义

快照是纯计算，`projectedAmount=usedAmount+applicationAmount`。正预算时大于预算为 over_budget，达到 90% 为 warning_90，否则 normal；预算为零或没有预算为 missing_budget，利用率为 null。不在本仓库发送 OA 通知或保存本次申请。

当前读取预算主表最新行，未过滤审批状态也未切到有效额度台账；选择预算来源和外部通知行为待业务/外部系统核验。见 [workflow.md](workflow.md)。

安全规则集中见 [认证总览](../../knowledge/authentication.md)：两个查询接口没有 requireAuth，内部预警单独强制共享密钥。继续阅读 [代码映射](code-map.md)、[数据](database.md)、[接口](api.md)。
