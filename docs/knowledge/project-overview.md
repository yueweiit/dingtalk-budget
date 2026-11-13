# 项目概览

## 定位和业务边界

项目把钉钉预算审批同步到 PostgreSQL，提供生产/非生产预算列表、部门支出核算、图表、Excel 导出和有效预算配置中心。预算审批的发起、审批和原始表单维护在钉钉/OA；本项目未实现预算表单创建、在线审批、支付执行或项目维度管理。

实际入口依据：[server/index.js](../../server/index.js)、[client/src/App.jsx](../../client/src/App.jsx)、[server/services/parser.js](../../server/services/parser.js) 的 `isBudgetRequest`。

## 技术栈

| 层次 | 仓库声明 / 实际使用 | 证据 |
| --- | --- | --- |
| 前端 | React 18、Vite 5、JavaScript/JSX、Axios、dayjs；没有 React Router，全局页面由组件状态切换 | [client/package.json](../../client/package.json)、[App.jsx](../../client/src/App.jsx) |
| 图表 | 详情页使用 ECharts + echarts-for-react；当前可视化页虽然名为 `VisualReportEchartsStyle.jsx`，实际导入 Recharts | [BudgetList.jsx](../../client/src/pages/BudgetList.jsx)、[VisualReportEchartsStyle.jsx](../../client/src/pages/VisualReportEchartsStyle.jsx) |
| Excel | 浏览器中自行生成 Open XML、ZIP 和 Blob，无 xlsx 第三方依赖 | [xlsxReport.js](../../client/src/utils/xlsxReport.js) |
| 后端 | Node.js、Express 4、ES Modules、pg、Axios、dotenv、node-cron、cors、express-rate-limit | [server/package.json](../../server/package.json) |
| 数据库 | 本地预算库；外部 OA 库与支出库均通过 PostgreSQL 客户端读取 | [db/index.js](../../server/db/index.js)、[list.js](../../server/routes/list.js)、[department-tree.js](../../server/services/department-tree.js) |
| 身份认证 | Node 内置 crypto 的 scrypt、数据库会话 Cookie、可选 EIMS 单点登录；没有 JWT 认证实现 | [auth.js](../../server/services/auth.js)、[eims-sso.js](../../server/services/eims-sso.js) |
| 测试 | 前后端均为 `node --test`；部分后端测试使用模拟查询，另有真实数据库集成测试 | 两份 package.json、[集成测试](../../server/test/payment-event-query.integration.test.js) |
| 部署 | 文档描述宝塔 + Nginx + PM2，前端静态构建与后端进程分开 | [DEPLOY.md](../../DEPLOY.md)、[ecosystem.config.cjs](../../server/ecosystem.config.cjs) |

包版本范围见 package.json，解析版本见各目录 package-lock.json。初始化时前端锁文件中 React 为 18.3.1、Vite 为 5.4.21；这不是线上安装状态。运行版本约束与旧说明差异见 [deployment.md](deployment.md)。

## 目录结构

```text
client/
  src/main.jsx、App.jsx         前端启动、登录检查、页面切换
  src/pages/                   列表、当前报表、配置中心、登录及其他报表版本
  src/components/              日期、手动同步、拆分同步、密码修改
  src/api/index.js             Axios 请求封装
  src/utils/                   Excel、时间、部门匹配、拆分、图表数据
  tests/、test/                Node 测试，两处均有有效测试
server/
  index.js                    环境校验、中间件、路由挂载、启动调度
  routes/                     auth、list、sync、config、dingtalk、quota-configurations
  services/                   解析、同步数据源、组织树、认证、额度和业务规则
  db/index.js                 预算库连接池及查询
  utils/                      表名白名单、重试/熔断、完成态支出口径
  scripts/                    同步、建用户、额度 schema/回填/组织重核脚本
  test/                       业务规则和接口范围测试
  data/sync-state.json         调度状态持久化文件，当前被 Git 跟踪
sql/ensure-effective-budget-quota.sql  有效额度增量 DDL
public.sql、migrate.sql、auth.sql        本地数据库脚本
docs/knowledge/               项目级知识库
docs/modules/                 分模块导航、流程和映射
docs/*.md                     已有业务专题，保留原位
AGENTS.md                     后续开发任务的项目规则和文档入口
```

## 实际页面和服务入口

- 浏览器：`client/index.html` → `main.jsx` → `App.jsx`；先请求 `/auth/me`，未登录显示 `Login`。
- 登录后默认 `BudgetList`，初始页签为全部预算；可以切换生产、非生产，进入详情、可视化或配置中心。
- 可视化实际入口：`App.jsx` 导入 `VisualReportEchartsStyle.jsx`。`VisualReport.jsx`、`VisualReportClean.jsx`、`VisualReportInitial.jsx` 不在当前 App 页面链路中；不能凭文件名认定线上入口。
- 后端：`server/index.js` 监听 `PORT`，注册 6 组 API 路由、健康检查，并在监听成功后注册定时任务。
- 系统集成入口：钉钉查询和 OA 预算预警快照，见 [业务地图](business-map.md)。

以上导航和角色显示依据 [App.jsx](../../client/src/App.jsx)、[BudgetList.jsx](../../client/src/pages/BudgetList.jsx)。未发现容器配置、独立 Controller 层、ORM、独立消息队列或仓库内 CI 工作流。

## 语言与外部责任

当前活动界面主要为中文，[HTML 入口](../../client/index.html) 固定 lang=zh-CN；解析器兼容中西文钉钉表单，但未建立界面语言切换和统一资源体系。已实现范围与扩展约定见 [国际化](internationalization.md)。

本项目负责预算同步、读取核算、额度查询及本地访问控制；原始 OA 组织/审批同步、支出事件写入、付款确认、预警通知和 EIMS 身份服务由外部系统负责。调用与数据方向见 [集成关系](integrations.md)，关键字段见 [核心数据字典](data-dictionary.md)。
