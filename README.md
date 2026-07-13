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
- API Key authentication, rate limiting, circuit breaker

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

When `DINGTALK_SYNC_SOURCE=dingtalk`, `DINGTALK_APP_KEY` and `DINGTALK_APP_SECRET` are required.

When `DINGTALK_SYNC_SOURCE=oa_db`, the budget sync reads approval instances from the `dingtalk_oa` database instead of calling DingTalk directly. In that mode, set `OA_DB_HOST` / `OA_DB_PORT` / `OA_DB_DATABASE` / `OA_DB_USER` / `OA_DB_PASSWORD` if they differ from the main PostgreSQL connection.

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
| POST   | `/api/sync/expense-splits`      | Sync operation expense split data (salary, social insurance, office space) through the expense service |
| GET    | `/api/list/production`          | Production budget list   |
| GET    | `/api/list/non-production`      | Non-production budget list |
| GET    | `/api/list/stats`               | Dashboard statistics     |
| GET    | `/api/list/report`              | Report export data       |
| GET    | `/api/list/approval`            | Approval flow records    |
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

## License

Private project.
