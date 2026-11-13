# 钉钉预算项目开发约定

本文件补充全局 AGENTS.md，默认简体中文交流；不替代全局安全与开发规范。

## 项目事实和上下文入口

- 前端：React 18 + Vite 5，JavaScript/JSX、ES Modules；App 以状态切换页面，没有 React Router。当前报表入口是 `client/src/pages/VisualReportEchartsStyle.jsx`，实际使用 Recharts；列表详情使用 ECharts。Excel 在 `client/src/utils/xlsxReport.js` 中生成。
- 后端：Node.js + Express 4 + pg + node-cron；路由中保留业务 SQL，没有独立 Controller/ORM 层。预算库可写，外部 OA/支出库主要只读；外部支出同步和 EIMS 属于其他服务。入口为 [server/index.js](server/index.js) 与 [client/src/App.jsx](client/src/App.jsx)。
- 首先读取 [知识库总索引](docs/knowledge/README.md)，再按任务读取 [业务地图](docs/knowledge/business-map.md) 指向的 `docs/modules/<模块>/overview.md`、`workflow.md`、`code-map.md`；接口/数据变更再读 `api.md`、`database.md`，避免一次加载全部文档。
- 现有 [额度专题](docs/effective-budget-quota.md)、[报表指南](docs/BUDGET_REPORTING_GUIDE.md)、[全额抵扣规则](docs/fully-deducted-payment-rule.md) 保留原位并复用。文档与代码不符时以核实后的代码为准，线上和外部事实标记待验证。
- 字段/枚举查 [核心数据字典](docs/knowledge/data-dictionary.md)，跨系统责任与失败边界查 [集成关系](docs/knowledge/integrations.md)，公共组件和服务复用查 [架构](docs/knowledge/architecture.md#公共能力及跨模块影响)。

## 修改前与业务约束

1. 先检查 Git 状态，保护已有修改；读取对应模块并核实实际页面、路由、服务、SQL、权限、事务和上下游，采用最小必要修改。
2. 部门授权使用稳定 ID 和路径。跨部门支出必须在后端裁剪拆分、金额和元数据后汇总；不得用名称模糊匹配扩大权限，也不得删除缓存中的角色/部门维度。
3. 区分预算申请候选、有效额度台账和实际支出。列表取最新部门/月候选，配置中心按企业+审批实例有效额度；不要假定两者已使用相同数据源。预算审批 TERMINATED 兼容规则不能套到完成态支出。
4. 支出付款事件、完成态兜底、部门拆分和月结必须保持防重复；`bonus` 是备用金历史键，动态管理费用保留 category_key/name。部门/金额/时间变更同时核对列表、详情、图表、Excel 和预警。
5. 支出记账按 UTC；cron、连接器缺省月份和审批节点 Excel 有上海时区语义。历史部门 reporting 投影与共享预算规则只影响读模型，不擅自改写原始审批数据。
6. SQL 值参数化，动态预算表名沿用 `server/utils/db.js` 白名单和固定类型解析；事务使用同一 Client，失败回滚并释放。遵循现有 ESM 和函数组件风格，不无关引入依赖、分层或迁移技术栈。
7. 当前界面主要硬编码中文，未建立统一翻译框架；中西文表单解析不等于界面多语言。新增用户文本先按 [国际化约定](docs/knowledge/internationalization.md) 设计可扩展入口，覆盖标签、提示、枚举与导出；不擅自安装依赖或全量重构。正式支持语言确定后同步维护翻译键，未确认译文标记待翻译。
8. 新字段/状态先检查类型、精度、默认值、空值、索引和历史数据；稳定编码与展示文字分离。API 调整兼容既有字段、错误及调用方，核对数据生产方和消费方；不能把页面翻译用于权限、组织匹配或改写历史中文状态。

## 验证与安全

- 两端 `npm test` 均为 `node --test`，前端另有 `npm run build`；按模块影响运行已有相关测试，详情见 [编码与验证约定](docs/knowledge/conventions.md)。后端 Node 16 的旧文档要求与当前依赖/测试不匹配，按 [运行环境](docs/knowledge/deployment.md) 核实。
- `server/test/payment-event-query.integration.test.js` 会写支出库，未知或生产环境不得默认执行；需已授权的独立测试库。同步/建用户/回填/组织重核脚本可能写数据，默认预览脚本也会连接库读取，运行前核实影响与授权。
- `public.sql` 含 DROP CASCADE，`migrate.sql` 含删列删表和数据修正；未经明确授权不得执行生产迁移、数据写入、部署或危险 Git 操作，不擅自提交、推送。
- 不读取无关实际 `.env`、运行用户清单或敏感数据；文档只记录变量名，不保存密码、Token、私钥、会话/密码哈希。Vite 变量对浏览器可见，不能放 EIMS 客户端密钥或预警内部密钥。
- 当前 `tenant_id='default'` 和额度企业复合键不等于完整多租户隔离；角色/数据范围、连接器 API Key 和预警专用 Key 边界见 [认证说明](docs/knowledge/authentication.md)。不得把已有部署说明或注释当作已实施的安全机制。
- 纯分析/文档任务不改业务代码，不安装依赖、不启动服务、不执行迁移部署；未执行的测试必须说明，不能声称通过。

## 知识库维护

重要业务规则、接口、字段、权限、状态、时间或架构发生实质变化后，更新对应模块和受影响的现有专题，再按需更新全局索引/总览。新增结论附代码路径及方法名，无法确认保留待验证；简单格式调整不新增无意义文档。AGENTS.md 保持精简，详细知识放在文档中。
