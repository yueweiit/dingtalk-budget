# 现有编码规范和维护约定

## 实际工程风格

- 前后端 package.json 均声明 `type: module`，JavaScript 使用 import/export、分号、常见两空格缩进；后端导入通常保留 `.js` 扩展名，前端 JSX 部分省略扩展名。PM2 配置例外为 `.cjs`。
- React 使用函数组件与 Hooks，页面和组件内有 `styles` 对象；没有独立样式框架、TypeScript 或统一状态管理库。按当前组件做最小修改，不借业务任务迁移技术栈。
- 数据库列多为 snake_case，API 参数和部分结果为 camelCase；部门字段还有原始/展示/报表投影等多种形式。新增字段必须核对 SQL、解析器、接口和前端转换函数，不能假定自动映射。
- 后端未拆独立 Controller 层；路由可直接组织 SQL、调用服务。业务规则尽量复用现有纯函数，如完成态口径、部门匹配、共享预算规则。

证据：[两份 package.json](../../server/package.json)、[App.jsx](../../client/src/App.jsx)、[list.js](../../server/routes/list.js)、[parser.js](../../server/services/parser.js)、[client/utils/](../../client/src/utils/)。仓库未发现统一 ESLint/Prettier 配置或 lint 脚本，这些是归纳出的现有风格，不是声称已有自动格式检查。

## 关键业务约束

| 主题 | 修改时必须核对 |
| --- | --- |
| 部门 | 稳定 ID 和路径是授权依据；历史名称只作展示/兼容，历史组织投影不得改写原始审批字段 |
| 金额 | 预算总金额、科目金额、实际支出、付款事件和待审批金额各有口径；先读所属模块，不共用一个模糊“已通过金额”定义 |
| 日期 | 支出记账采用 UTC；连接器默认月份、cron 和审批 Excel 有上海时区语义；避免全局替换时间逻辑 |
| 权限 | 前端隐藏不是安全边界；服务端先裁剪拆分和金额再汇总，缓存键保留角色/部门维度 |
| SQL | 值使用参数；动态表名沿用固定解析与 `assertValidTable` 白名单，新增表需检查所有动态入口 |
| 事务 | 使用同一 Client 执行事务，失败 rollback、finally release；不要把独立 pool.query 假定在该事务中 |
| 读兼容 | 标准拆分与历史 JSON 的优先级、付款去重、月结和可选 schema 字段不得无依据删除 |
| 凭据 | 只记录环境变量名，不读取无关 `.env` 或写出密钥、哈希、生产账号数据；Vite 配置会暴露给浏览器 |

证据和详细规则见 [architecture.md](architecture.md)、[authentication.md](authentication.md) 及模块 `workflow.md`。

## 验证要求

前后端均通过 `npm test` 运行 Node 原生测试；前端另有 `npm run build`。初始化扫描发现后端 30 个测试文件，前端 `tests/` 与 `test/` 合计 14 个，数量仅为当前基线。后续按影响范围执行相应测试及构建，不把路径计数当作测试通过。

| 变更范围 | 现有验证入口 |
| --- | --- |
| 预算列表/字段 | `all-budget-list`、`budget-department-sync`、`department-identity`、`current-month-budget-region-filter`；前端 `budget-list` |
| 支出金额/付款/时间 | `completed-expense-policy`、`payment-event-accounting`、`monthly-settlement-accounting`、`utc-expense-time`、`individual-income-tax-report`；对应前端时间、付款展示和月结测试 |
| 报表/权限/共享预算 | `report-auth-scope`、`report-query-safety`、`department-identity-report`、`yw-tech-shared-budget`；前端 `report-export-scope`、`report-summary`、`report-workbook-sheets` |
| 同步/组织/额度 | `dingtalk-oa-db`、`pending-budget-status-tracking`、`service-entity-department-routing`、`effective-budget-quota`、`quota-configuration` |
| 登录/SSO | `auth`、`eims-sso` |
| 连接器 | `connector-department-query`、`dingtalk-type-resolution`、`dingtalk-connector-missing-department` |

测试文件位于 [server/test/](../../server/test/)、[client/tests/](../../client/tests/)、[client/test/](../../client/test/)，名称均加 `.test.js`。可从对应 package 目录运行 `node --test <测试文件>`；模块代码映射提供具体链接。

[payment-event-query.integration.test.js](../../server/test/payment-event-query.integration.test.js) 在具备 PG 变量时连接支出库，插入测试记录后删除，不能在未知/生产库上默认执行。导入其他测试的业务模块也可能创建数据库连接对象；全量测试前先核对环境，数据库验证使用获准的独立测试库。没有环境或依赖时报告未执行及原因，不安装依赖或连接数据库来完成纯文档任务。

## 文档维护

1. 根 [AGENTS.md](../../AGENTS.md) 保留项目规则和入口；知识在本目录，领域映射在 `docs/modules/`。
2. 修改业务前读对应模块并核实实际代码；只加载任务需要的文档。
3. 重要字段、接口、权限、金额/时间、状态、部署依赖变化后同步已有文档；不为格式调整新建决策文档。
4. 复用现有 [额度专题](../effective-budget-quota.md)、[报表专题](../BUDGET_REPORTING_GUIDE.md)、[抵扣专题](../fully-deducted-payment-rule.md)，避免维护相互矛盾的重复规则。
5. 代码路径用相对 Markdown 链接并附方法名；无法确定的线上/外部事实写“待验证”，不补造 Controller、数据库字段或未实现功能。
6. 完成后检查 Git 差异、链接/路径、敏感信息和文档与代码一致性；未经授权不提交、推送、迁移或部署。

## 复用、兼容与国际化

开发前查 [架构复用清单](architecture.md#公共能力及跨模块影响)，以实际 import 和调用链确认活动实现。新增抽象应服务于实际复用，不为历史文件相似而进行无关重构。

字段和状态变更按 [数据字典](data-dictionary.md) 核对来源、类型/精度、空值、默认值、约束和下游；API 保留既有字段类型和错误语义，先兼容再迁移调用方。跨系统契约按 [集成关系](integrations.md) 说明生产方、消费方、超时、重试及幂等边界。

当前没有统一国际化框架，不能要求调用不存在的翻译函数。新功能先按 [国际化约定](internationalization.md) 设计有限的翻译入口与语言回退；覆盖界面、校验、枚举和输出，保持来源表单别名及旧中文状态兼容。正式语言确定后同步维护键，不擅自引入依赖、改业务名称模型或批量重构旧页面。

## 文档更新触发与验证记录

| 实质变更 | 优先更新位置 |
| --- | --- |
| 业务规则、状态、角色、流程 | 对应模块 overview/workflow；已有专题只维护同一规则的一份详细解释 |
| 页面、方法、API、字段 | 模块 code-map/api/database；跨模块字段同步核心字典，路由变化同步 API 总览 |
| 公共能力、权限、跨系统数据或运行方式 | architecture/authentication/integrations/deployment；按需更新 AGENTS 的约束和入口 |
| 语言资源、格式或业务多语言模型 | internationalization 及受影响模块；同步导出和外部文案责任 |
| 新模块或重要未决问题 | business-map 和 README；记录证据、影响、验证方向，不把猜测标为实现 |

纯文档任务只做静态核对：链接/锚点、引用方法与路径、路由/DDL、围栏/图结构及修改范围。没有执行构建、业务测试、数据库查询或 Mermaid 渲染时应明确标注；不为验证文档启动服务或运行可能写数据库的测试。保留历史验证日期，新的记录说明本次代码基线及验证边界。
