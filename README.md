# 钉钉预算管理系统

从钉钉审批流程同步预算数据到 PostgreSQL，提供 Web 管理后台，支持查询、筛选和报表导出。

## 系统架构

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   钉钉开放平台  │────>│  Express 服务  │────>│  PostgreSQL  │
│   API        │     │   (Node.js)  │     │ budget_system │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │  React 前端   │
                     │  (Vite)      │
                     └──────────────┘
```

- **服务端**：Node.js + Express，通过 cron 定时同步钉钉审批流程
- **前端**：React 18 + Vite 单页应用，支持日期筛选和 XLSX 报表导出
- **数据库**：PostgreSQL，共 8 张表（2 张主表 + 6 张明细表）

## 功能特性

- 定时增量同步钉钉审批数据（cron 调度）
- 手动同步，支持选择日期范围
- 生产预算 / 非生产预算分页列表
- 预算详情弹窗，展示完整表单数据
- 7 个 Sheet 的 XLSX 报表导出（汇总、预算执行、部门占比、支出明细等）
- 钉钉机器人查询接口（`/api/dingtalk/querySimple`）
- 暂未通过的审批自动回查 + 补录机制
- API Key 认证、速率限制、熔断器

## 技术栈

| 层       | 技术                                 |
| -------- | ------------------------------------ |
| 前端     | React 18、Vite、Axios、dayjs         |
| 后端     | Express、node-cron、pg、dotenv       |
| 数据库   | PostgreSQL                           |
| 外部依赖 | 钉钉开放平台 API                     |

## 项目结构

```
├── client/                    # React 前端
│   ├── src/
│   │   ├── main.jsx           # 入口
│   │   ├── App.jsx            # 根组件
│   │   ├── pages/
│   │   │   └── BudgetList.jsx # 主页面（列表 + 详情 + 导出）
│   │   ├── components/
│   │   │   ├── DateFilter.jsx # 日期筛选
│   │   │   └── SyncButton.jsx # 手动同步按钮
│   │   ├── api/index.js       # Axios API 封装
│   │   └── utils/
│   │       └── xlsxReport.js  # 前端 XLSX 生成
│   └── index.html
├── server/                    # Express 后端
│   ├── index.js               # 入口，中间件配置
│   ├── config/
│   │   └── dingtalk.js        # 钉钉 API 配置
│   ├── db/
│   │   └── index.js           # PostgreSQL 连接池
│   ├── routes/
│   │   ├── sync.js            # POST /api/sync — 数据同步
│   │   ├── list.js            # GET /api/list/* — 列表查询
│   │   ├── config.js          # GET/POST /api/config/scheduler* — 调度管理
│   │   └── dingtalk.js        # GET /api/dingtalk/* — 钉钉机器人查询
│   ├── services/
│   │   ├── dingtalk.js        # 钉钉 API 客户端（超时 + 重试 + 熔断）
│   │   ├── parser.js          # 钉钉表单字段解析（中西双语）
│   │   └── scheduler.js       # cron 调度 + pending 回查 + backfill
│   └── utils/
│       └── resilience.js      # 重试（指数退避）+ 熔断器
├── public.sql                 # 完整建表 DDL
├── migrate_*.sql              # 增量迁移脚本
└── SECURITY_CHANGELOG.md      # 安全加固记录
```

## 快速开始

### 环境要求

- Node.js >= 16
- PostgreSQL 数据库

### 1. 初始化数据库

```bash
psql -U postgres -d budget_system -f public.sql
```

### 2. 配置环境变量

```bash
cd server
cp .env.example .env
# 编辑 .env 填入实际值
```

必填变量：

| 变量                    | 说明               |
| ---------------------- | ------------------ |
| `PGHOST`               | PostgreSQL 主机地址 |
| `PGDATABASE`           | 数据库名称          |
| `PGUSER`               | 数据库用户          |
| `PGPASSWORD`           | 数据库密码          |
| `DINGTALK_APP_KEY`     | 钉钉应用 AppKey     |
| `DINGTALK_APP_SECRET`  | 钉钉应用 AppSecret  |
| `DINGTALK_PROCESS_CODE` | 钉钉审批流程编码    |

可选变量：

| 变量                     | 默认值                | 说明                         |
| ----------------------- | -------------------- | ---------------------------- |
| `PORT`                  | `3001`               | 服务端口                      |
| `CORS_ORIGIN`           | `http://localhost:5173` | 允许的跨域来源               |
| `API_KEY`               | （禁用）              | 设置后启用 API Key 认证       |
| `NODE_ENV`              | （空）                | 设为 `production` 隐藏错误详情 |
| `SYNC_CRON`             | `2 * * * *`          | 同步调度（cron 表达式）        |
| `DINGTALK_TIMEOUT_MS`   | `15000`              | 钉钉 API 超时时间（毫秒）      |
| `RETRY_COUNT`           | `3`                  | 最大重试次数                  |
| `CB_FAILURE_THRESHOLD`  | `5`                  | 连续失败多少次触发熔断         |

### 3. 安装依赖

```bash
# 服务端
cd server && npm install

# 前端
cd ../client && npm install
```

### 4. 启动

```bash
# 服务端（端口 3001）
cd server && npm start

# 前端（端口 5173）
cd client && npm run dev
```

浏览器打开 http://localhost:5173

## API 接口

| 方法   | 路径                            | 说明               |
| ------ | ------------------------------- | ------------------ |
| POST   | `/api/sync`                     | 同步钉钉数据        |
| GET    | `/api/list/production`          | 生产预算列表        |
| GET    | `/api/list/non-production`      | 非生产预算列表      |
| GET    | `/api/list/stats`               | 统计数据            |
| GET    | `/api/list/report`              | 报表导出数据        |
| GET    | `/api/list/approval`            | 审批流程记录        |
| GET    | `/api/config/scheduler`         | 调度任务状态        |
| POST   | `/api/config/scheduler/start`   | 启动调度任务        |
| POST   | `/api/config/scheduler/stop`    | 停止调度任务        |
| GET    | `/api/dingtalk/querySimple`     | 钉钉机器人查询      |
| GET    | `/api/health`                   | 健康检查            |

## 数据库表结构

**主表：**
- `production_budget` — 生产预算申请
- `non_production_budget` — 非生产预算申请

**生产明细表：**
- `budget_material` — 物料预算
- `budget_production` — 生产费用预算
- `budget_labor` — 人工成本预算

**非生产明细表：**
- `budget_hr` — 人资预算
- `budget_office` — 办公场地预算
- `budget_operation` — 管理支出预算

## 安全机制

详见 [SECURITY_CHANGELOG.md](SECURITY_CHANGELOG.md)，包括：
- 环境变量管理（dotenv），移除源码中的硬编码凭据
- API Key 认证
- 速率限制
- 生产环境错误信息隐藏
- 指数退避重试
- 熔断器模式

## 许可证

私有项目。
