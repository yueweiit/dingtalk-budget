# DingTalk Budget Management System

A budget management system that syncs approval data from DingTalk (钉钉) into PostgreSQL, providing a web dashboard for querying, filtering, and exporting budget reports.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   DingTalk   │────>│   Express    │────>│  PostgreSQL  │
│   Open API   │     │   Server     │     │  budget_system│
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │  React SPA   │
                     │  (Vite)      │
                     └──────────────┘
```

- **Server**: Node.js + Express, syncs DingTalk approval processes on a cron schedule
- **Client**: React 18 + Vite, single-page dashboard with date filtering and XLSX export
- **Database**: PostgreSQL with 8 tables (2 main + 6 detail tables)

## Features

- Automatic incremental sync from DingTalk approval workflows (cron-based)
- Manual sync with date range selection
- Production / Non-production budget tabs with pagination
- Budget detail modal with full form data
- 7-sheet XLSX report export (summary, execution, department share, expense details, etc.)
- DingTalk bot query endpoint (`/api/dingtalk/querySimple`)
- Pending approval auto-retry with backfill mechanism
- Actual expense reporting uses the whole approval's completed-and-agreed result and UTC completion month; budget application amounts keep their original submission-time rule
- Bonus details from the designated Lingxiang-Xingming operation form are split by department only when the same management-expense selection component changes from salary to `奖金/Bonificaciones` and the approval is completed and approved, then shown as a separate bonus category; the amount is included once in actual expense totals and is not merged into ordinary management expense
- Historical IT operation split rows remain readable for compatibility with old data; new IT operation selections are handled as ordinary forms by the sync service
- Historical reporting overrides are applied by exact business number: `202608281007000322547` maps to department `1089765983`, and `202608280953000047922` maps to department `1089533879`; raw database department fields are not changed
- API Key authentication, rate limiting, circuit breaker
- User login with superadmin and department-supervisor roles
- Backend-enforced department scope: supervisors see their department and descendants; superadmins see all data

## Tech Stack

| Layer    | Stack                              |
| -------- | ---------------------------------- |
| Frontend | React 18, Vite, Axios, dayjs      |
| Backend  | Express, node-cron, pg, dotenv     |
| Database | PostgreSQL                         |
| External | DingTalk Open Platform API         |

## Project Structure

```
├── client/                    # React frontend
│   ├── src/
│   │   ├── main.jsx           # Entry point
│   │   ├── App.jsx            # Root component
│   │   ├── pages/
│   │   │   └── BudgetList.jsx # Main page (list + detail + export)
│   │   ├── components/
│   │   │   ├── DateFilter.jsx # Date range filter
│   │   │   └── SyncButton.jsx # Manual sync trigger
│   │   ├── api/index.js       # Axios API layer
│   │   └── utils/
│   │       └── xlsxReport.js  # Client-side XLSX generation
│   └── index.html
├── server/                    # Express backend
│   ├── index.js               # Entry point, middleware setup
│   ├── config/
│   │   └── dingtalk.js        # DingTalk API config
│   ├── db/
│   │   └── index.js           # PostgreSQL connection pool
│   ├── routes/
│   │   ├── sync.js            # POST /api/sync
│   │   ├── list.js            # GET /api/list/*
│   │   ├── config.js          # GET/POST /api/config/scheduler*
│   │   └── dingtalk.js        # GET /api/dingtalk/*
│   ├── services/
│   │   ├── dingtalk.js        # DingTalk API client (timeout + retry + circuit breaker)
│   │   ├── parser.js          # DingTalk form field parser (CN/ES bilingual)
│   │   └── scheduler.js       # Cron scheduler + pending recheck + backfill
│   └── utils/
│       ├── resilience.js      # Retry (exponential backoff) + Circuit Breaker
│       └── db.js              # Table name whitelist validation
├── public.sql                 # Full DDL for fresh database setup
├── migrate.sql                # Idempotent migration for existing databases
└── SECURITY_CHANGELOG.md      # Security hardening changelog
```

## Quick Start

### Prerequisites

- Node.js >= 16
- PostgreSQL database

### 1. Setup Database

```bash
psql -U postgres -d budget_system -f public.sql
psql -U postgres -d budget_system -f auth.sql
```

### 2. Configure Environment

```bash
cd server
cp .env.example .env
# Edit .env with your actual values
```

Required variables:

| Variable              | Description                  |
| --------------------- | ---------------------------- |
| `PGHOST`              | PostgreSQL host              |
| `PGDATABASE`          | Database name                |
| `PGUSER`              | Database user                |
| `PGPASSWORD`          | Database password            |
| `DINGTALK_SYNC_SOURCE` | Approval sync source: `dingtalk` or `oa_db` |
| `DINGTALK_PROCESS_CODE` | DingTalk approval process code |

Optional variables:

| Variable                | Default              | Description                    |
| ----------------------- | -------------------- | ------------------------------ |
| `PORT`                  | `3001`               | Server port                    |
| `CORS_ORIGIN`           | `http://localhost:5173` | Allowed CORS origin         |
| `API_KEY`               | (disabled)           | Enable API Key auth if set     |
| `NODE_ENV`              | (empty)              | Set `production` to hide errors|
| `SYNC_CRON`             | `2 * * * *`          | Sync schedule (cron expression)|
| `OA_DB_DATABASE`        | `dingtalk_oa`        | Approval archive database name when using `oa_db` source |
| `DINGTALK_TIMEOUT_MS`   | `15000`              | DingTalk API timeout           |
| `RETRY_COUNT`           | `3`                  | Max retry attempts             |
| `CB_FAILURE_THRESHOLD`  | `5`                  | Failures before circuit opens  |
| `EXPENSE_SYNC_URL`      | (empty)              | Optional expense sync service URL, e.g. `http://localhost:3002` |

### User Roles

Run `auth.sql` once on an existing database, then create users from the `server` directory:

```bash
AUTH_PASSWORD='change-this-password' node scripts/create-user.js --username=admin --role=superadmin
AUTH_PASSWORD='change-this-password' node scripts/create-user.js --username=dept-manager --role=department_supervisor --department-id=1089383728 --department-name='广州凌翔'
```

`superadmin` can view all budgets, reports, exports, and approvals and can run synchronization or scheduler operations. `department_supervisor` can view only records whose department ID is the assigned ID or whose department path contains that ID; synchronization and scheduler management are denied. Department names are display snapshots only and are not used as permission keys.

Account provisioning rule: `admin` is the super administrator, and each department supervisor uses the stable DingTalk department ID as the username. Passwords are supplied through `AUTH_PASSWORD` or `--password` only during initialization; plaintext passwords and the `budget_users` data are intentionally excluded from GitHub.

When `DINGTALK_SYNC_SOURCE=dingtalk`, `DINGTALK_APP_KEY` and `DINGTALK_APP_SECRET` are required.

When `DINGTALK_SYNC_SOURCE=oa_db`, the budget sync reads approval instances from the `dingtalk_oa` database instead of calling DingTalk directly. In that mode, set `OA_DB_HOST` / `OA_DB_PORT` / `OA_DB_DATABASE` / `OA_DB_USER` / `OA_DB_PASSWORD` if they differ from the main PostgreSQL connection.

Report and Excel export authorization is enforced on the server. For a department supervisor, a form split across departments is reduced to the supervisor's permitted split rows and visible amount before summaries or workbook generation; other department names and whole-form amounts are not returned.

### 实际支出统计口径

列表、详情、报表和 Excel（电子表格）导出的实际支出统一只统计整单 `COMPLETED`（已完成）且最终结果为同意/通过、并且存在 `approval_completed_at`（审批完成时间）的记录；月份按该时间的 UTC（世界协调时间）月份计算。最终结果优先读取 OA 原始数据的 `result`，为空时才兼容回退到 `flowResult`、`flow_result`。预算申请金额仍按原提交时间和原有效状态逻辑统计，不受本规则改变。

### 3. Install Dependencies

```bash
# Server
cd server && npm install

# Client
cd ../client && npm install
```

### 4. Start

```bash
# Server (port 3001)
cd server && npm start

# Client (port 5173)
cd client && npm run dev
```

Open http://localhost:5173 in your browser.

## API Endpoints

| Method | Path                            | Description              |
| ------ | ------------------------------- | ------------------------ |
| POST   | `/api/sync`                     | Manually sync DingTalk budget data, refresh existing statuses, and optionally trigger expense sync |
| POST   | `/api/sync/expense-splits`      | Sync operation expense split data (salary, bonus, social insurance, office space) through the expense service |
| GET    | `/api/list/production`          | Production budget list   |
| GET    | `/api/list/non-production`      | Non-production budget list |
| GET    | `/api/list/stats`               | Dashboard statistics     |
| GET    | `/api/list/report`              | Report export data       |
| GET    | `/api/list/approval`            | Approval flow records    |
| POST   | `/api/auth/login`               | Create a login session |
| GET    | `/api/auth/me`                  | Current logged-in user |
| POST   | `/api/auth/logout`              | End the login session |
| GET    | `/api/config/scheduler`         | Scheduler status         |
| POST   | `/api/config/scheduler/start`   | Start scheduler          |
| POST   | `/api/config/scheduler/stop`    | Stop scheduler           |
| GET    | `/api/dingtalk/querySimple`     | DingTalk bot query       |
| GET    | `/api/health`                   | Health check             |

## Database Schema

**Main Tables:**
- `production_budget` - Production budget applications
- `non_production_budget` - Non-production budget applications

**Detail Tables (production):**
- `budget_material` - Material budget
- `budget_production` - Production expense budget
- `budget_labor` - Labor cost budget

**Detail Tables (non-production):**
- `budget_hr` - HR budget
- `budget_office` - Office space budget
- `budget_operation` - Management expense budget

## Security

See [SECURITY_CHANGELOG.md](SECURITY_CHANGELOG.md) for details on:
- Environment variable management (dotenv)
- API Key authentication
- Rate limiting
- Error message sanitization
- Retry with exponential backoff
- Circuit breaker pattern
- Database-backed sessions and role-based department authorization
- Department-supervisor report exports scope normalized and legacy JSON split data by department ID before aggregation, and remove unrelated creator-department metadata.

## License

Private project.

## Actual Payment Event Display

Actual expense reporting first reads `approval_expense_payment_events`, which stores confirmed payment facts from authorized approval comments. The accounting month is the UTC month of `paid_at`. Multiple events for one approval are ordered by payment time and displayed as installment labels such as `第 1 期付款` and `第 2 期付款`; the detail page and export keep the payment date, amount, and comment evidence.

When no eligible payment event exists, a non-split expense falls back to the completed-and-agreed approval amount and completion time. Salary, bonus, social insurance, housing fund, office space, and individual income tax forms continue to use department split rows and do not use whole-form payment events, preventing double counting. Bonus rows are only produced when the configured process selects `奖金/Bonificaciones` in the management-expense component and has a non-empty bonus detail table.

Before deployment, verify that `approval_expense_payment_events` and its indexes exist in the approval database. Code deployment does not migrate the server database automatically.

The budget service accepts the comma-separated `DINGTALK_PAYMENT_EVENT_USER_IDS` environment variable for authorized payment-comment users. If it is absent, it uses the two formal users configured in code. Temporary local test users must be supplied only in the local process environment and must not be added to the production environment.
