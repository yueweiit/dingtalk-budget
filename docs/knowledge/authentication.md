# 登录、权限和租户机制

## 认证模型

本系统采用数据库 Cookie 会话。密码使用带随机盐的 scrypt；登录生成随机会话令牌，数据库只存 SHA-256 哈希，浏览器 Cookie 默认名为 `budget_session`，默认有效期 7 天、HttpOnly、SameSite=Lax。Secure 默认跟随 `NODE_ENV=production`，显式 `AUTH_COOKIE_SECURE` 优先。

证据：[services/auth.js](../../server/services/auth.js) 的 `hashPassword`、`createSession`、`setSessionCookie`、`loadSession`；[auth.sql](../../auth.sql)。详细流程、账号初始化和 SSO 边界见 [登录模块](../modules/authentication/overview.md)。

## 权限矩阵

| 能力 | 超级管理员 | 部门主管 |
| --- | --- | --- |
| 列表、详情、报表、Excel | 全范围 | 绑定部门及下级 |
| 自助改密、退出 | 当前用户 | 当前用户 |
| 手动同步、调度读取和控制 | 允许 | 403 |
| 预算配置中心和选项 | 允许 | 403 |
| OA 审批效率及节点导出 | 参数启用后返回 | 不返回 |
| 本地 `/list/approval` | 所属预算可读 | 所属预算在权限范围时可读 |

本地审批记录与 OA 审批效率是两条接口链路；不能笼统写成“部门主管不会获得任何审批人字段”。依据：[list.js](../../server/routes/list.js)、[sync.js](../../server/routes/sync.js)、[config.js](../../server/routes/config.js)、[quota-configurations.js](../../server/routes/quota-configurations.js)。

## 部门数据范围

`buildDepartmentScopeSql` 判定 `dept_id` 等于绑定部门或 JSONB `dept_path_ids` 包含绑定 ID。拆分支出通过 `scopeExpenseDetailsForUser` 先过滤可见拆分，裁剪金额和其他部门元数据后再汇总。名称相同、缺少稳定 ID 或路径的记录不能自动授予主管访问。

无用户上下文时 SQL 范围辅助方法返回 TRUE，因此调用它的 HTTP 入口必须先核对认证边界；列表路由设有 `requireAuth`，钉钉连接器路由没有该中间件。证据：[auth.js](../../server/services/auth.js)、[list.js](../../server/routes/list.js)、[dingtalk.js](../../server/routes/dingtalk.js)。

## API Key 和内部预警密钥

全局 `API_KEY` 配置后，`/api/` 校验 `X-API-Key` 或 `apiKey` 查询参数；健康检查、所有 `/auth/` 路由和内部预警快照豁免此层。已登录且路径不以 `/dingtalk` 开头的请求也豁免。API Key 不能替代需要 Cookie 会话的角色检查。

钉钉连接器 `/query`、`/querySimple` 没有独立 `requireAuth`：启用全局 API Key 时需要该密钥；未配置时可能被无会话调用并返回无部门权限限制的数据。内部预警接口另用 `BUDGET_ALERT_API_KEY` + `X-Budget-Alert-Key`，未配置返回 503，错误密钥返回 401，采用定时安全比较。

证据：[server/index.js](../../server/index.js)、[routes/dingtalk.js](../../server/routes/dingtalk.js)。`VITE_API_KEY` 会进入浏览器构建，不能视为保密服务端凭据；SSO 客户端密钥和预警内部密钥不可放入 Vite 变量。

## EIMS 和当前限制

SSO 实现通过 Discovery 的授权/令牌/用户信息/退出端点，使用授权码与 PKCE S256；`app_user_id` 精确绑定本地启用账号的 `username`，角色和部门仍从本地表读取。回调未见 EIMS 角色比对；虽发送 nonce，但没有 ID Token 签名及 nonce 验证逻辑。具体实现和待核验点见 [登录流程](../modules/authentication/workflow.md)，不得仅因旧 README 描述就宣称这些验证已存在。

改密不使其他会话失效；会话查询异常时按未登录处理；没有发现专门的 CSRF token 中间件或独立登录尝试锁定机制，现有通用 API 限流不能等同于完整账号保护。此处记录代码事实，不在初始化任务中改变认证逻辑。

## 租户与企业隔离

预算解析写固定 `tenant_id='default'`，账号没有租户字段，预算查询未统一过滤 tenant_id。有效额度以 `corp_id + process_instance_id` 防重复，但其他主表以 `form_no` 唯一，部分部门与审批源查询未使用企业联合条件。当前只能确认角色/部门范围控制，不能宣称完整多租户隔离。企业部署数量和真实数据是否存在冲突待验证。

证据：[parser.js](../../server/services/parser.js)、[public.sql](../../public.sql)、[auth.sql](../../auth.sql)、[dingtalk.js](../../server/services/dingtalk.js)、[department-tree.js](../../server/services/department-tree.js)。
