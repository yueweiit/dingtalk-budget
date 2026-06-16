# 宝塔面板部署文档

## 一、环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | >= 16 |
| PostgreSQL | >= 14 |
| PM2 | 最新版 |
| Nginx | 宝塔自带 |

---

## 二、宝塔面板安装依赖

### 1. 安装 Node.js

宝塔 → 软件商店 → 搜索「Node.js版本管理器」→ 安装

安装后进入 Node.js 版本管理器，安装 **Node 18** 或 **Node 20**。

### 2. 安装 PostgreSQL

宝塔 → 软件商店 → 搜索「PostgreSQL管理器」→ 安装

安装后：
- 添加数据库 → 数据库名 `budget_system`
- 添加数据库 → 数据库名 `dingtalk_approval`
- 记下数据库用户名和密码

### 3. 安装 PM2

```bash
npm install -g pm2
```

---

## 三、部署 budget 项目

### 1. 上传项目

将项目文件上传到 `/www/wwwroot/dingtalk-budget/`，目录结构如下：

```
/www/wwwroot/dingtalk-budget/
├── server/          # 后端
├── client/          # 前端
├── public.sql       # 建表脚本
└── DEPLOY.md
```

### 2. 配置后端 .env

```bash
cd /www/wwwroot/dingtalk-budget/server
cp .env.example .env
```

编辑 `.env`：

```ini
# PostgreSQL（填宝塔创建数据库时的信息）
PGHOST=localhost
PGPORT=5432
PGDATABASE=budget_system
PGUSER=postgres
PGPASSWORD=你的数据库密码

# DingTalk API
DINGTALK_APP_KEY=ding1wtsi4vokslaoqnc
DINGTALK_APP_SECRET=你的AppSecret
DINGTALK_PROCESS_CODE=PROC-0DC5DE17-A29A-497C-8A1F-1324298A04AA

# Server
PORT=3001
CORS_ORIGIN=https://你的域名
API_KEY=DingTalk_Budget_2026_7x9KmP2bts
NODE_ENV=production

# expense 项目地址
YUNYING_API_BASE=http://localhost:3002

# Sync
SYNC_CRON=2 * * * *
```

### 3. 初始化数据库

在宝塔「数据库」中找到 `budget_system`，点击「管理」进入 phpPgAdmin（或通过命令行）：

```bash
psql -U postgres -d budget_system -f /www/wwwroot/dingtalk-budget/public.sql
```

### 4. 安装依赖并启动

```bash
cd /www/wwwroot/dingtalk-budget/server
npm install

# 用 PM2 启动（关键：指定 cwd 和环境变量文件）
pm2 start index.js \
  --name dingtalk-budget \
  --cwd /www/wwwroot/dingtalk-budget/server \
  --env-file /www/wwwroot/dingtalk-budget/server/.env

pm2 save
pm2 startup   # 设置开机自启
```

---

## 四、部署前端

### 1. 构建

```bash
cd /www/wwwroot/dingtalk-budget/client
npm install
npx vite build
```

构建产物在 `client/dist/`。

### 2. 修改 API 地址

构建前编辑 `client/src/api/index.js`，将 baseURL 改为服务器地址（或通过 Vite 代理保留 `/api`）。

如果用 Nginx 反向代理（推荐），保留 `baseURL: '/api'` 不变。

### 3. Nginx 配置

宝塔 → 网站 → 添加站点 → 填写域名

然后点击站点 → 配置文件，替换为：

```nginx
server {
    listen 80;
    server_name 你的域名.com;

    # 前端静态文件
    root /www/wwwroot/dingtalk-budget/client/dist;
    index index.html;

    # API 反向代理到后端
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }

    # 前端 SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

保存后重载 Nginx。

---

## 五、部署 expense 项目

### 1. 上传项目

将 `dingtalk-expense-sync-main` 上传到 `/www/wwwroot/dingtalk-expense/`。

### 2. 配置 .env

编辑 `/www/wwwroot/dingtalk-expense/.env`：

```ini
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dingtalk_approval
DB_USER=postgres
DB_PASSWORD=你的数据库密码

DINGTALK_APPKEY=ding1wtsi4vokslaoqnc
DINGTALK_APPSECRET=你的AppSecret
DINGTALK_PROCESS_CODES=["PROC-0DC5DE17-A29A-497C-8A1F-1324298A04AA","PROC-BFDF6F09-4551-43B3-8C55-537AA74A241B"]

PORT=3002
```

### 3. 初始化数据库

```bash
psql -U postgres -d dingtalk_approval -f /www/wwwroot/dingtalk-expense/sql/init.sql
psql -U postgres -d dingtalk_approval -f /www/wwwroot/dingtalk-expense/sql/ensure_approval_expense_schema.sql
```

### 4. 安装并启动

```bash
cd /www/wwwroot/dingtalk-expense
npm install

pm2 start src/index.ts \
  --name dingtalk-expense \
  --cwd /www/wwwroot/dingtalk-expense \
  --interpreter tsx \
  --env-file /www/wwwroot/dingtalk-expense/.env

pm2 save
```

---

## 六、验证

```bash
# 查看 PM2 进程状态
pm2 status

# 查看日志
pm2 logs dingtalk-budget
pm2 logs dingtalk-expense

# 测试 API
curl http://localhost:3001/api/health
curl http://localhost:3002/health
```

浏览器访问 `https://你的域名`，应该能看到预算管理系统页面。

---

## 七、PM2 常用命令

| 命令 | 说明 |
|------|------|
| `pm2 status` | 查看进程状态 |
| `pm2 logs 应用名` | 查看日志 |
| `pm2 restart 应用名` | 重启应用 |
| `pm2 stop 应用名` | 停止应用 |
| `pm2 delete 应用名` | 删除应用 |
| `pm2 save` | 保存当前进程列表 |
| `pm2 startup` | 设置开机自启 |
