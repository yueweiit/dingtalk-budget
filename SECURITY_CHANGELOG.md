# 安全加固修改记录

## 第一轮：移除硬编码凭据

### 问题描述

数据库密码和钉钉 appSecret 硬编码在源码中并已提交到 git，任何有仓库访问权限的人都能获取这些敏感信息。

涉及的硬编码内容：

| 文件 | 硬编码内容 |
|------|-----------|
| `server/config/dingtalk.js` | 钉钉 appKey、appSecret、processCode |
| `server/db/index.js` | PostgreSQL host (`8.135.19.108`)、user (`postgres`)、password (`Postgres@123`) |

### 修改内容

#### 1. 新建 `server/.env.example`

环境变量模板文件，列出所有可配置项（不含实际值），供部署时复制为 `.env` 使用。

#### 2. 新建 `.gitignore`

排除 `node_modules/`、`dist/`、`.env`，防止敏感文件被意外提交。

#### 3. 添加 `dotenv` 依赖

在 `server/package.json` 中添加 `dotenv` 包，用于从 `.env` 文件加载环境变量。

#### 4. `server/index.js` — 加载 dotenv + 启动校验

- 顶部添加 `import 'dotenv/config'`，确保在其他模块加载前读取 `.env`
- 启动时检查 7 个必填环境变量（`PGHOST`、`PGDATABASE`、`PGUSER`、`PGPASSWORD`、`DINGTALK_APP_KEY`、`DINGTALK_APP_SECRET`、`DINGTALK_PROCESS_CODE`），缺失则打印明确错误并退出

#### 5. `server/config/dingtalk.js` — 移除硬编码 fallback

```diff
- appKey: process.env.DINGTALK_APP_KEY || 'dingumkeaffrev8eyd5j',
- appSecret: process.env.DINGTALK_APP_SECRET || 'mHcyqOP9s98l-buIBWn...',
- processCode: process.env.DINGTALK_PROCESS_CODE || 'PROC-45C2862D-...',
+ appKey: process.env.DINGTALK_APP_KEY,
+ appSecret: process.env.DINGTALK_APP_SECRET,
+ processCode: process.env.DINGTALK_PROCESS_CODE,
```

保留 `oapiUrl` 和 `apiUrl` 的默认值（`https://oapi.dingtalk.com`、`https://api.dingtalk.com`），这些是公开的钉钉官方地址，不属于敏感信息。

#### 6. `server/db/index.js` — 移除硬编码凭据

```diff
- host: process.env.PGHOST || '8.135.19.108',
- database: process.env.PGDATABASE || 'budget_system',
- user: process.env.PGUSER || 'postgres',
- password: process.env.PGPASSWORD || 'Postgres@123',
+ host: process.env.PGHOST,
+ database: process.env.PGDATABASE,
+ user: process.env.PGUSER,
+ password: process.env.PGPASSWORD,
```

保留 `port`、连接池参数等非敏感项的默认值。

### 使用方式

```bash
cd server
cp .env.example .env
# 编辑 .env 填入实际的数据库密码、钉钉密钥等
npm start
```

---

## 第二轮：修复其他安全问题

### 问题描述

| 问题 | 严重程度 | 说明 |
|------|---------|------|
| CORS 默认通配符 `*` | HIGH | 任何网站都能跨域请求 API |
| 无认证机制 | MEDIUM | 任何人都能触发同步、启停调度器 |
| 无速率限制 | MEDIUM | 可被暴力请求导致服务不可用 |
| 错误信息泄露 | MEDIUM | 返回 `error.message` 暴露内部细节 |
| Token 部分日志 | MEDIUM | 日志输出了 access token 前 10 位 |

### 修改内容

#### 1. CORS — 要求显式配置

```diff
- origin: process.env.CORS_ORIGIN || '*',
+ origin: corsOrigin || 'http://localhost:5173',
```

默认值从 `*` 改为 `http://localhost:5173`（Vite 开发服务器地址）。生产环境必须在 `.env` 中设置 `CORS_ORIGIN` 为实际前端域名。

同时将允许的 HTTP 方法从 `GET, POST, PUT, DELETE, OPTIONS` 缩减为 `GET, POST`。

#### 2. API Key 认证

在 `server/index.js` 中添加 API Key 认证中间件：

- 从请求头 `X-API-Key` 或查询参数 `apiKey` 获取 key
- 与环境变量 `API_KEY` 比对，不匹配返回 401
- `/api/health` 端点免认证
- 如果未设置 `API_KEY` 环境变量，认证自动禁用（向后兼容）

```env
# .env
API_KEY=your_api_key_here
```

#### 3. 速率限制

添加 `express-rate-limit` 中间件：

- 默认每 60 秒窗口内最多 100 次请求
- 超限返回 "请求过于频繁，请稍后再试"
- 可通过 `RATE_LIMIT_WINDOW_MS` 和 `RATE_LIMIT_MAX` 环境变量调整

#### 4. 错误信息隐藏

在生产环境（`NODE_ENV=production`）下，所有 API 错误返回通用消息，不暴露内部错误详情：

```diff
- message: error.message,
+ message: isProduction ? '查询失败' : error.message,
```

涉及文件：`sync.js`、`list.js`、`config.js`、`dingtalk.js`（共 4 个路由文件）。

#### 5. 移除 Token 日志

```diff
- console.log('[DINGTALK] Got access token:', accessToken.substring(0, 10) + '...');
+ console.log('[DINGTALK] Got access token successfully');
```

### 新增/修改的环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `CORS_ORIGIN` | 否 | `http://localhost:5173` | 允许的跨域来源 |
| `API_KEY` | 否 | 无（禁用认证） | API 访问密钥 |
| `NODE_ENV` | 否 | 无 | 设为 `production` 隐藏错误详情 |
| `RATE_LIMIT_WINDOW_MS` | 否 | `60000` | 速率限制窗口（毫秒） |
| `RATE_LIMIT_MAX` | 否 | `100` | 每窗口最大请求数 |

### 新增依赖

- `express-rate-limit` — 速率限制中间件

---

## 第三轮：超时、重试与熔断

### 问题描述

第三方 API（钉钉、运营系统）调用缺乏容错能力：

| 能力 | 修改前 | 风险 |
|------|--------|------|
| 超时 | 钉钉 API 无 timeout，运营 API 15s | 钉钉无响应时请求永久挂起 |
| 重试 | 无 | 网络抖动直接失败 |
| 熔断 | 无 | 上游故障时持续请求加重负担 |

### 修改内容

#### 1. 新建 `server/utils/resilience.js` — 通用容错工具

**retry（指数退避重试）**
- 默认重试 3 次，基础延迟 1s，每次翻倍（1s → 2s → 4s）
- 仅对网络错误和 5xx 状态码重试，4xx 不重试
- 每次重试打印日志，便于排查

**createCircuitBreaker（熔断器）**
- 三态：CLOSED（正常）→ OPEN（熔断）→ HALF_OPEN（探测）→ CLOSED
- 连续失败达到阈值后熔断，拒绝后续请求
- 冷却时间后自动进入半开状态，放行一次请求探测
- 探测成功则恢复，失败则继续熔断

#### 2. 钉钉 API 集成（`server/services/dingtalk.js`）

```diff
+ const http = axios.create({ timeout: 15000 });
+ const tokenCircuit = createCircuitBreaker({ label: 'dingtalk-token', failureThreshold: 3 });
+ const listCircuit = createCircuitBreaker({ label: 'dingtalk-list', failureThreshold: 5 });
+ const detailCircuit = createCircuitBreaker({ label: 'dingtalk-detail', failureThreshold: 5 });

  // getAccessToken:  circuit + retry
  // getProcessInstanceIds: circuit + retry（新旧 API 各自独立）
  // getProcessInstanceDetail: circuit + retry（新旧 fallback 保留在重试内部）
```

- 所有 axios 调用统一使用 15s timeout
- token 获取：3 次失败后熔断 30s
- 列表/详情查询：5 次失败后熔断 60s

#### 3. 运营 API 集成（`server/routes/list.js`）

```diff
+ const yunyingCircuit = createCircuitBreaker({ label: 'yunying-api', failureThreshold: 3 });

  // fetchApprovedExpenseSummary: circuit + retry
```

### 新增环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DINGTALK_TIMEOUT_MS` | 否 | `15000` | 钉钉 API 请求超时（毫秒） |
| `YUNYING_TIMEOUT_MS` | 否 | `15000` | 运营 API 请求超时（毫秒） |
| `RETRY_COUNT` | 否 | `3` | 最大重试次数 |
| `RETRY_DELAY_MS` | 否 | `1000` | 重试基础延迟（指数退避） |
| `CB_FAILURE_THRESHOLD` | 否 | `5` | 连续失败多少次触发熔断 |
| `CB_RESET_TIMEOUT_MS` | 否 | `60000` | 熔断冷却时间（毫秒） |
## 2026-09-02

- Added database-backed login sessions with HttpOnly cookies.
- Added `superadmin` and `department_supervisor` roles.
- Enforced department ID/path authorization in budget lists, statistics, approvals, details, reports, and exports.
- Report and export expense payloads now use a scoped department projection: cross-department forms expose only the supervisor's split rows and amount; the source department and whole-form amount are removed from the response.
- Restricted synchronization and scheduler controls to superadmins.
- Kept the DingTalk connector endpoint service-to-service behind `API_KEY`; user sessions cannot use it to bypass department scope.
- Scoped normalized and legacy JSON expense splits by department ID before report aggregation or XLSX generation; unrelated creator-department metadata is redacted from department-supervisor payloads.
