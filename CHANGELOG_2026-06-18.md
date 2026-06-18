# 代码修改记录 — 2026-06-18

## 一、Bug 修复

### 1. 变量遮蔽导致错误信息逻辑错误

**文件：** `server/routes/dingtalk.js`

**问题：** `/querySimple` 路由内部声明了 `const isProduction = tableName === 'production_budget'`，遮蔽了模块顶层的 `const isProduction = process.env.NODE_ENV === 'production'`。导致：
- 查生产预算时，开发环境也隐藏错误详情
- 查非生产预算时，生产环境也暴露内部错误信息

**修复：** 将局部变量重命名为 `isProductionBudget`，使 catch 块正确引用模块级 `isProduction`。

```diff
- const isProduction = tableName === 'production_budget';
- const budgetAmount = isProduction ? ... : ...;
+ const isProductionBudget = tableName === 'production_budget';
+ const budgetAmount = isProductionBudget ? ... : ...;
```

### 2. `approval_flow` 表缺失

**文件：** `server/routes/list.js` → `public.sql`

**问题：** `GET /api/list/approval` 接口查询 `approval_flow` 表，但数据库建表脚本中从未创建该表，调用即报错。

**修复：** 在 `public.sql` 中添加 `approval_flow` 表定义及索引。

```sql
CREATE TABLE "public"."approval_flow" (
  "id" int8 NOT NULL DEFAULT nextval('approval_flow_id_seq'::regclass),
  "form_no" varchar(50) NOT NULL,
  "process_instance_id" varchar(100),
  "budget_type" varchar(20),
  "step" int4 DEFAULT 0,
  "approver_name" varchar(100),
  "approver_userid" varchar(100),
  "approve_result" varchar(50),
  "approve_opinion" text,
  "approve_time" timestamp(6),
  "tenant_id" varchar(50) DEFAULT 'default',
  CONSTRAINT "approval_flow_pkey" PRIMARY KEY ("id")
);
```

---

## 二、安全修复

### 3. 前端硬编码 API Key

**文件：** `client/src/api/index.js`

**问题：** API Key `DingTalk_Budget_2026_7x9KmP2bts` 直接写死在源码中，构建后暴露在浏览器 DevTools 中。

**修复：** 改为从 Vite 环境变量 `VITE_API_KEY` 读取，实际值写入 `client/.env`（已被 `.gitignore` 排除）。

```diff
- const api = axios.create({
-   baseURL: '/api',
-   timeout: 30000,
-   headers: {
-     'X-API-Key': 'DingTalk_Budget_2026_7x9KmP2bts',
-   },
- });
+ const headers = {};
+ if (import.meta.env.VITE_API_KEY) {
+   headers['X-API-Key'] = import.meta.env.VITE_API_KEY;
+ }
+
+ const api = axios.create({
+   baseURL: '/api',
+   timeout: 30000,
+   headers,
+ });
```

**新增文件：**
- `client/.env` — 实际配置（不提交）
- `client/.env.example` — 模板文件（提交）

### 4. `.gitignore` 补全

**文件：** `.gitignore`

**问题：** `client/dist/`（构建产物）和 `client/.env`（前端环境变量）未被排除。

**修复：**

```diff
  node_modules/
  dist/
+ client/dist/
  .env
+ client/.env
  *.log
```

### 5. SQL 表名白名单校验

**新增文件：** `server/utils/db.js`

**问题：** `sync.js`、`dingtalk.js` 中通过字符串拼接构造 SQL 表名，虽然当前值来自内部逻辑，但模式本身存在注入风险。

**修复：** 新增白名单校验工具，9 张合法表名，不在白名单内直接抛异常。

```js
const VALID_TABLES = new Set([
  'production_budget', 'non_production_budget',
  'budget_material', 'budget_production', 'budget_labor',
  'budget_hr', 'budget_office', 'budget_operation',
  'approval_flow',
]);

export function assertValidTable(tableName) {
  if (!VALID_TABLES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  return tableName;
}
```

**调用位置：**
- `server/routes/sync.js` — `insertRecord` 中的表名
- `server/routes/dingtalk.js` — `/querySimple` 和 `/query` 路由中的表名

---

## 三、配置修复

### 6. `.env` 端口与 CORS 不一致

**文件：** `server/.env`

**问题：** `PORT=3002`、`CORS_ORIGIN=http://localhost:8081` 与文档（3001、5173）不一致。

**修复：**

```diff
- PORT=3002
- CORS_ORIGIN=http://localhost:8081
+ PORT=3001
+ CORS_ORIGIN=http://localhost:5173
```

---

## 四、SQL 脚本整理

### 7. 合并 5 个迁移脚本为 1 个

**删除文件：**
- `migrate_budget_form_fields.sql`
- `ensure_report_columns.sql`
- `fix_budget_month_and_create_time.sql`
- `widen_budget_text_columns.sql`
- `cleanup_unused_budget_fields.sql`

**新增文件：** `migrate.sql`（幂等，可重复执行）

**合并逻辑（10 步）：**

| 步骤 | 内容 | 幂等保证 |
|------|------|----------|
| 1 | 主表添加新列（declaration_month、budget_month 等） | `ADD COLUMN IF NOT EXISTS` |
| 2 | 主表删除废弃列（start_date、end_date 等） | `DROP COLUMN IF EXISTS` |
| 3 | 主表 varchar → text（dept_name、execution_region、remark） | 检查 `data_type = 'character varying'` |
| 4 | budget_month 格式修正为 varchar(7) | 检查 `character_maximum_length > 7` |
| 5 | create_time 从 form_no 前 14 位回填 | `WHERE create_time IS NULL` |
| 6 | 非生产明细表创建（hr、office、operation） | `CREATE TABLE IF NOT EXISTS` |
| 7 | 审批流程表创建（approval_flow） | `CREATE TABLE IF NOT EXISTS` |
| 8 | 明细表补齐所有列 | `ADD COLUMN IF NOT EXISTS` |
| 9 | 明细表 varchar → text | 检查 `data_type = 'character varying'` |
| 10 | 所有索引 | `CREATE INDEX IF NOT EXISTS` |

整个脚本用 `BEGIN` / `COMMIT` 包裹，失败时自动回滚。

**最终 SQL 文件结构：**

```
public.sql   — 全新安装（DROP + CREATE 所有表）
migrate.sql  — 已有数据库升级（幂等增量）
```

---

## 五、死代码清理

### 8. 移除未使用的导出函数

**文件：** `server/services/parser.js`

移除 `parseNonProductionMaterialItems`，无任何调用方。

### 9. 移除废弃的 XLSX 常量

**文件：** `client/src/utils/xlsxReport.js`

移除被 `*ForSheets` 版本替代的：
- `workbookXml`
- `workbookRelsXml`
- `contentTypesXml`

---

## 六、文档更新

### 10. DEPLOY.md

- 目录结构新增 `migrate.sql` 说明
- 数据库初始化区分「全新安装」和「已有数据库升级」
- 前端部署改为配置 `.env` 环境变量（不再手动改源码）

### 11. README.md

- 项目结构新增 `server/utils/db.js`
- SQL 文件说明从 `migrate_*.sql` 改为 `migrate.sql`

---

## 修改文件清单

| 文件 | 操作 |
|------|------|
| `server/routes/dingtalk.js` | 修改（变量遮蔽 + 表名校验） |
| `server/routes/sync.js` | 修改（表名校验） |
| `server/services/parser.js` | 修改（移除死代码） |
| `server/utils/db.js` | 新增 |
| `server/.env` | 修改（端口 + CORS） |
| `client/src/api/index.js` | 修改（API Key 环境变量化） |
| `client/src/utils/xlsxReport.js` | 修改（移除死代码） |
| `client/.env` | 新增 |
| `client/.env.example` | 新增 |
| `.gitignore` | 修改 |
| `public.sql` | 修改（新增 approval_flow 表） |
| `migrate.sql` | 新增（合并 5 个迁移脚本） |
| `migrate_budget_form_fields.sql` | 删除 |
| `ensure_report_columns.sql` | 删除 |
| `fix_budget_month_and_create_time.sql` | 删除 |
| `widen_budget_text_columns.sql` | 删除 |
| `cleanup_unused_budget_fields.sql` | 删除 |
| `DEPLOY.md` | 修改 |
| `README.md` | 修改 |
