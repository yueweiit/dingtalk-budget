# 登录与权限：接口

定义：[routes/auth.js](../../../server/routes/auth.js)。所有 `/auth/` 端点豁免全局 API Key，但仍受 `/api/` 通用限流和各自登录校验。Cookie 规则和角色范围见 [认证总览](../../knowledge/authentication.md)。

## 本地认证

| 方法 / 路径 | 请求 / 成功结果 | 校验或错误 |
| --- | --- | --- |
| POST `/api/auth/login` | JSON username/password；`{success:true,data:公共用户}` 并设 Cookie | 空输入 400；错误/停用账号 401；服务异常 500 |
| GET `/api/auth/me` | 当前公共用户及 authProvider | 无有效会话 401 |
| GET `/api/auth/check` | 当前身份，需 requireAuth | 未登录 401 |
| POST `/api/auth/logout` | 删除当前会话、清 Cookie，成功 `{success:true}` | 不要求预先登录，具体故障以当前实现为准 |
| POST `/api/auth/change-password` | currentPassword/newPassword/confirmPassword；success/message | requireAuth；输入无效 400、旧密码错误 401、服务异常 500 |

公共用户字段：id、username、role、departmentId、departmentName。会话读取的 authProvider 为 eims 或 null；密码哈希和令牌不放在 data 返回。改密错误另有 code=INVALID_INPUT 或 INVALID_CURRENT_PASSWORD。

## EIMS

| 方法 / 路径 | 行为 |
| --- | --- |
| GET `/api/auth/eims/start` | 发起授权重定向；失败跳前端并带 sso_error |
| GET `/api/auth/eims/callback` | 接受 state、code/error；兑换和映射后设本地 Cookie 并跳前端 |
| POST `/api/auth/eims/logout` | requireAuth；返回 `{success:true,data:{logoutUrl}}`，同时清本地会话 |
| GET `/api/auth/eims/logout/callback` | 接受退出 state，校验后跳前端 |

前端 `startEimsLogin` 固定跳 `/api/auth/eims/start`，没有使用 Axios 的自定义 baseURL；SSO 回调代理和跨域部署需核对这一差异。退出失败返回 500，App 有本地退出回退。请求内部 token/userinfo 均由后端执行，不把 EIMS 客户端密钥放在浏览器。

## 配置契约

| 变量 | 作用 |
| --- | --- |
| `AUTH_SESSION_COOKIE` | 会话 Cookie 名，默认 budget_session |
| `AUTH_SESSION_TTL_DAYS` | 默认 7 天，至少 1 天 |
| `AUTH_COOKIE_SECURE` | 显式 true/false 优先；缺省按 production |
| `AUTH_COOKIE_SAMESITE` | 默认 Lax |
| `EIMS_ISSUER` | Discovery issuer，使用其 `/oauth/.well-known/openid-configuration` |
| `EIMS_CLIENT_ID/EIMS_CLIENT_SECRET` | 后端客户端认证 |
| `EIMS_REDIRECT_URI/EIMS_POST_LOGOUT_REDIRECT_URI` | 授权/退出回调登记地址 |
| `EIMS_SCOPES` | 空白分隔的授权范围 |
| `CORS_ORIGIN` | 前端地址、SSO 登录后的跳转目标 |

EIMS 变量在发起对应流程时检查，不是预算 server 的统一必填启动列表。默认 Cookie 和协议能力来源：[services/auth.js](../../../server/services/auth.js)、[eims-sso.js](../../../server/services/eims-sso.js)。完整 ID Token 验证并未实现，详见 [workflow.md](workflow.md)。
