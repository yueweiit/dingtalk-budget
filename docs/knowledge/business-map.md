# 业务模块与功能地图

## 角色和入口

| 角色 / 调用方 | 实际能力 | 边界证据 |
| --- | --- | --- |
| 超级管理员 `superadmin` | 全部预算和报表、审批效率、Excel、配置中心、手动同步和调度管理 | [auth.js](../../server/services/auth.js)、各路由 `router.use`、[BudgetList.jsx](../../client/src/pages/BudgetList.jsx) |
| 部门主管 `department_supervisor` | 本部门及路径包含该部门的下级预算、支出和导出，可修改自己的密码 | [buildDepartmentScopeSql](../../server/services/auth.js)、[scopeExpenseDetailsForUser](../../server/routes/list.js) |
| 钉钉连接器 | 按类型、部门、月份查询预算金额，兼容旧的列表查询 | [dingtalk.js](../../server/routes/dingtalk.js) |
| 外部 OA 预警服务 | 用专用共享密钥查询预计预算使用率快照 | [dingtalk.js](../../server/routes/dingtalk.js) 的 `/alert-budget-snapshot` |
| 定时任务 / 运维脚本 | 增量同步、pending 复查、历史回补及专项数据维护 | [scheduler.js](../../server/services/scheduler.js)、[scripts/](../../server/scripts/) |

部门主管的权限依据稳定部门 ID 和路径，不依据部门名称。接口角色控制优先于前端按钮显示。

## 实际业务模块

| 模块 | 主要功能 | 页面 / 后端入口 | 详细文档 |
| --- | --- | --- | --- |
| 预算申请与查询 | 生产、非生产、全部预算；月份筛选、分页、详情、统计和钉钉审批跳转 | `BudgetList.jsx`；`routes/list.js`；解析器六类明细 | [预算申请](../modules/budget-applications/overview.md) |
| 审批同步与调度 | 两种审批源、手动/定时同步、已有状态刷新、pending 复查、历史回补、外部支出同步代理 | `SyncButton`、`ExpenseSplitSyncButton`；`sync.js`、`config.js`、`scheduler.js` | [审批同步](../modules/synchronization/overview.md) |
| 支出核算与报表 | 运营/采购/月结、部门拆分专项支出、付款事件、执行率/趋势、审批效率和 Excel | 当前可视化页、列表详情；`list.js`、`approval-efficiency.js`、`xlsxReport.js` | [支出报表](../modules/expense-reporting/overview.md) |
| 有效预算额度 | 审批生成额度、科目和负责人；集团/公司/部门筛选汇总、当前组织选项与历史重核 | `BudgetConfiguration.jsx`；`quota-configurations.js`、`effective-budget-quota.js` | [有效额度](../modules/effective-quota/overview.md) |
| 登录与权限 | 本地账号、Cookie 会话、改密、退出、EIMS 绑定登录、角色和部门范围 | `Login.jsx`、`App.jsx`、`ChangePasswordModal.jsx`；`auth.js`、`eims-sso.js` | [登录权限](../modules/authentication/overview.md) |
| 钉钉查询与预警 | 表单连接器查询、类型和部门参数兼容、内部预算快照阈值计算 | `/api/dingtalk/*`；`connector-department-query.js` | [钉钉集成](../modules/dingtalk-integration/overview.md) |

## 预算明细分类

生产预算：物料、生产费用、人工成本。非生产预算：人资、办公场地、管理支出。表单字段支持中文/西班牙语，通过 [parser.js](../../server/services/parser.js) 六个 `parse*Items` 方法识别。预算“项目”明细字段不代表业务项目归属，目前没有稳定项目维度。

实际支出另有工资、备用金（历史键 `bonus`）、社保公积金、办公场地、个税、动态管理费用及历史兼容类别，不能直接等同于预算六类明细。见 [支出模块概览](../modules/expense-reporting/overview.md)。

## 按开发任务选文档

- 修改列表筛选、分页或预算字段：先读预算申请模块；涉及表单同步时再读同步模块。
- 修改金额、完成月份、付款、拆分或部门汇总：先读支出报表模块，同时检查预算、钉钉快照和现有报表专题。
- 修改科目、组织归属、额度生效：先读有效额度模块和已有额度专题；不能假定列表已使用额度台账。
- 修改账号、SSO 或接口权限：先读登录模块及 [authentication.md](authentication.md)，核对每条路由。
- 修改同步窗口、调度、脚本或环境变量：先读同步模块和 [deployment.md](deployment.md)。

## 仓库之外的职责

钉钉/OA 原始审批保存、组织树同步、支出拆分/付款事件识别、付款人工确认和实际预警消息发送均由外部系统承担。本仓库提供读取或代理接口；外部实现、线上监听流程和通知对象待验证，不能从本地文档推断其全部行为。
