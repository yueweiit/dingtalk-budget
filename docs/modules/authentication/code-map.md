# 登录与权限：代码映射

| 行为 | 前端 | 后端 / 数据 |
| --- | --- | --- |
| 进入与恢复会话 | [App.jsx](../../../client/src/App.jsx) | GET `/auth/me` → `loadSession` |
| 本地登录、SSO 入口 | [Login.jsx](../../../client/src/pages/Login.jsx)、[api/index.js](../../../client/src/api/index.js) | [routes/auth.js](../../../server/routes/auth.js) `/login`、`/eims/start` |
| 密码哈希和验证 | 前端只提交输入 | [services/auth.js](../../../server/services/auth.js) `hashPassword/verifyPassword`，budget_users |
| 改密 | [ChangePasswordModal.jsx](../../../client/src/components/ChangePasswordModal.jsx) | `changePassword` 与 POST `/change-password` |
| Cookie 和会话 | Axios withCredentials | `setSessionCookie/loadSession/createSession/deleteSession`，budget_sessions |
| SSO 协议 | `startEimsLogin`、浏览器跳转 | [eims-sso.js](../../../server/services/eims-sso.js) Discovery、事务、兑换、userinfo |
| 单点退出与回退 | App `handleLogout` | `/eims/logout`、`/logout`、logout callback |
| 角色中间件 | 页面 role 分支 | `requireAuth/requireRole`，6 组路由分别核对 |
| 部门 SQL/记录范围 | 无权自行扩大返回范围 | `buildDepartmentScopeSql/departmentRecordVisible` |
| 拆分支出权限 | 页面只展示后端数据 | [list.js](../../../server/routes/list.js) `scopeExpenseDetailsForUser` |
| API Key 层 | 可选 VITE_API_KEY | [index.js](../../../server/index.js) 中的可选校验与豁免 |
| 账号初始化 | 无公开 UI | [create-user.js](../../../server/scripts/create-user.js) upsert，需操作授权 |
| 数据结构 | 公共用户不含密码/哈希 | [auth.sql](../../../auth.sql) 两表及约束 |

## 现有验证

[auth.test.js](../../../server/test/auth.test.js)：密码、改密、Cookie 配置、角色和部门范围；[eims-sso.test.js](../../../server/test/eims-sso.test.js)：配置、PKCE、state、userinfo 及退出 URL；[report-auth-scope.test.js](../../../server/test/report-auth-scope.test.js)：跨部门拆分金额裁剪。

这些测试不等于真实 EIMS 登录、浏览器 Cookie 与反向代理的联调验收。全局 API Key 与钉钉内部密钥边界见 [认证总览](../../knowledge/authentication.md)，无完整租户机制的事实也统一记录在那里。
