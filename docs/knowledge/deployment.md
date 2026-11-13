# 运行环境及部署方式

本页记录仓库已有运行方式与配置契约，不表示已部署或已验证运行。本次知识库初始化未执行安装、服务启动、数据库连接、迁移或部署。

## 环境与入口

| 项目 | 仓库事实 | 证据 |
| --- | --- | --- |
| Node | 旧 README/DEPLOY 写 >=16；当前锁定 Vite 5.4.21 的 engines 为 `^18.0.0 || >=20.0.0`，部分测试使用 `import.meta.dirname`，Node 16 不适合现有完整开发验证链路 | [client/package-lock.json](../../client/package-lock.json)、[report-query-safety.test.js](../../server/test/report-query-safety.test.js) |
| 本机 Node | 2026-10-08 初始化曾只读检查为 24.14.1；2026-10-19 未重查，不代表当前主机/目标服务器版本或兼容测试结果 | 历史初始化检查记录 |
| PostgreSQL | 代码依赖 JSONB、LATERAL、窗口函数和 pg；旧部署文档要求 >=14，实际目标版本待验证 | [DEPLOY.md](../../DEPLOY.md)、[list.js](../../server/routes/list.js) |
| 后端 | `server/` 内 `npm start` → `node index.js`；`npm run dev` → `node --watch index.js`；默认 3001，监听全部网卡 | [server/package.json](../../server/package.json)、[server/index.js](../../server/index.js) |
| 前端开发 | `client/` 内 `npm run dev`，Vite 默认 5173，`/api` 代理到 3001，可用 `VITE_DEV_API_TARGET` 覆盖 | [vite.config.js](../../client/vite.config.js) |
| 前端构建 | `npm run build` → `client/dist`，`npm run preview` 为 Vite 预览入口 | [client/package.json](../../client/package.json) |
| 部署拓扑 | 宝塔/Nginx 静态托管 dist，`/api/` 反代 Node，PM2 管理后端；未发现 Docker/Compose 或 CI 部署定义 | [DEPLOY.md](../../DEPLOY.md)、[ecosystem.config.cjs](../../server/ecosystem.config.cjs) |

运行命令仅作为后续任务参考，不属于本次执行记录。后续选择 Node 时需兼容 `--watch`、`node --test` 和测试中的 `import.meta.dirname`，并用目标环境验证，不能沿用旧 Node 16 要求。

## 配置来源

后端从自身目录 `server/.env` 加载；优先参考 [server/.env.example](../../server/.env.example)，根目录 [.env.example](../../.env.example) 与其字段不完全一致。前端变量参考 [client/.env.example](../../client/.env.example)。仅维护变量名、用途和安全默认值，不复制现有真实配置或历史文档中的凭据示例。

| 配置组 | 关键变量 / 当前默认行为 |
| --- | --- |
| 预算库 | `PGHOST`、`PGDATABASE`、`PGUSER`、`PGPASSWORD` 为启动必填；`PGPORT` 默认 5432；连接池默认 20，连接超时默认 2000 ms |
| 审批源 | `DINGTALK_SYNC_SOURCE` 默认 dingtalk，兼容 `APPROVAL_SOURCE`；oa_db 别名归一化；`DINGTALK_PROCESS_CODE` 两种源均必填 |
| 钉钉直连 | dingtalk 模式额外必填 `DINGTALK_APP_KEY/SECRET`；列表 `DINGTALK_LIST_API` 默认 old，可选 new/both；HTTP 超时默认 15000 ms |
| OA 连接 | `OA_DB_HOST/PORT/USER/PASSWORD` 回退 PG；数据库回退 `DINGTALK_OA_DATABASE` 或 dingtalk_oa；组织树与审批源各有连接池 |
| 支出读取 | `APPROVAL_DB_DATABASE` / `DINGTALK_APPROVAL_DATABASE` 指定库名；实际连接主机、端口、账号仍用 PG 参数 |
| 审批效率 | 主机/端口/账号按 OA_DB → APPROVAL_DB → PG 回退；此处库名只使用 `OA_DB_DATABASE || dingtalk_oa`，与其他 OA 服务别名规则不同 |
| 支出同步代理 | `EXPENSE_SYNC_URL` 或 `DINGTALK_EXPENSE_SYNC_URL`；超时 `EXPENSE_SYNC_TIMEOUT_MS` 默认 180000 ms；不是报表读取的数据源地址 |
| Web | `PORT` 默认 3001；`CORS_ORIGIN` 默认 http://localhost:5173；`NODE_ENV=production` 控制部分错误与 Cookie 默认行为 |
| 会话 / EIMS | `AUTH_*`、`EIMS_*`，详见 [认证模块](../modules/authentication/api.md) |
| 集成密钥 | `API_KEY`、`BUDGET_ALERT_API_KEY`；根目录示例含预警密钥变量名，server 示例未列出，需按实际接入补充配置 |
| 付款规则 | `DINGTALK_PAYMENT_EVENT_USER_IDS` 配置授权付款评论用户 ID 列表；须与外部同步识别规则一致 |
| 限流 / 容错 | `RATE_LIMIT_*`、`RETRY_*`、`CB_*`；默认为每分钟 100 请求、重试 3 次、连续失败 5 次熔断 |
| 调度 | `SYNC_CRON`、`SYNC_TIMEZONE`、`SYNC_STATE_FILE` 等，统一默认值见 [同步模块](../modules/synchronization/overview.md) |
| 支出缓存 | `APPROVED_EXPENSE_CACHE_TTL_MS`、`EXPENSE_SPLIT_CACHE_TTL_MS`，默认 60000 ms |
| 前端 | `VITE_API_BASE_URL`、`VITE_DEV_API_TARGET`、可选 `VITE_API_KEY`；Vite 变量属于浏览器可见配置 |

证据：[index.js](../../server/index.js)、[db/index.js](../../server/db/index.js)、[services/dingtalk.js](../../server/services/dingtalk.js)、[department-tree.js](../../server/services/department-tree.js)、[routes/list.js](../../server/routes/list.js)、[routes/sync.js](../../server/routes/sync.js)、[resilience.js](../../server/utils/resilience.js)。示例中的 `YUNYING_API_BASE/YUNYING_TIMEOUT_MS` 当前未发现业务代码读取，不能将其记为实际运营查询依赖。

## 数据库准备和运维脚本

本地 DDL 和风险见 [database.md](database.md)。后端启动不会自动应用 schema；额度表需在写入前存在。`public.sql` 会重建业务表，`migrate.sql` 含删列、删表和数据修正，只能在获得相应授权后使用。

| 后端脚本 | 作用 / 影响 |
| --- | --- |
| `npm run user:create` | 创建或更新账号、密码、角色及部门；同用户名可覆盖并重新启用，不是只增操作 |
| `npm run sync:dingtalk` | 预算同步 CLI；支持单实例、日期范围及 `--update-existing` 写入 |
| `npm run migrate:effective-quota` | 执行额度专项 schema |
| `npm run backfill:effective-quota` | 必须显式 `--start=<ISO> --end=<ISO>`；写额度/科目；当前数据源由配置决定，不强制 OA |
| `npm run reconcile:effective-organizations` | 从 OA 当前树读取，更新本地额度组织归属和 current 标记 |
| `node scripts/backfill-budget-department-identities.js` | 默认预览；仅 `--write=1` 写尚无部门 ID 的预算；仍会连接数据库读取 |

证据：[server/package.json](../../server/package.json)、[server/scripts/](../../server/scripts/)；脚本默认行为与状态结果见模块流程。外部 OA 的部门同步命令及支出 schema 不在本仓库，应到所属项目验证。

## 部署待核验点

- PM2 文件固定使用 `/opt/dingtalk-budget/server`，旧部署说明采用 `/www/wwwroot/dingtalk-budget/server`；实际路径和环境文件需统一。调度状态 JSON 需持久化，不能误把仓库状态当作新实例游标。
- 示例 Nginx 是 HTTP 且代理读取超时为 60 秒；当前同步/报表请求允许更长时间，长请求和 HTTPS/Cookie/SSO 行为需在目标环境验证。
- 调度锁、SSO state、缓存均为进程内；现有代码没有多实例协调机制。部署多进程前需确认任务重复和回调路由。
- `/api/health` 只返回进程状态，不检查三类数据库、schema、SSO 和外部支出同步服务。
- 历史部署及安全文档存在凭据示例，不复制到新文档。生产 HTTPS 与安全 Cookie 是现有部署要求，代码并不会自行配置反向代理证书。

证据：[ecosystem.config.cjs](../../server/ecosystem.config.cjs)、[DEPLOY.md](../../DEPLOY.md)、[scheduler.js](../../server/services/scheduler.js)、[eims-sso.js](../../server/services/eims-sso.js)、[index.js](../../server/index.js)。

## 运维责任与恢复边界

PM2 配置开启 autorestart，应用通过 console 输出日志；进程重启不能保证业务任务已补偿或 SSO state 仍在。定时状态文件、数据库备份、日志保留/访问控制、监控告警和回滚演练应由目标部署核验，仓库说明不能证明已落地。未发现覆盖三库与外部服务的统一灾备或发布回滚实现。

后续部署验收应分别确认前端静态资源版本、Node 进程版本、数据库 schema、认证回调和真实业务读链路；`/api/health` 成功只说明进程能响应。外部超时和降级详见 [集成关系](integrations.md)。这些是后续验证方向，本次没有执行部署或运行环境操作。
