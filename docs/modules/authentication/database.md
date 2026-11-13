# 登录与权限：数据字典

来源：[auth.sql](../../../auth.sql)，全部保存在预算数据库。没有预置用户 INSERT；本次没有读取用户表或运行账号脚本。

## budget_users

| 字段 | 定义 / 约束 |
| --- | --- |
| `id` | BIGSERIAL 主键 |
| `username` | VARCHAR(100) 非空唯一；SSO app_user_id 的精确绑定键 |
| `password_hash` | TEXT 非空，scrypt 编码；不保存明文 |
| `role` | VARCHAR(40) 非空，CHECK superadmin/department_supervisor |
| `department_id` | VARCHAR(64)；主管 CHECK 要求非空，管理员可空 |
| `department_name_snapshot` | 展示名称，不是权限键 |
| `active` | BOOLEAN 默认 true；会话读取和登录都要求启用 |
| `created_at,updated_at` | TIMESTAMPTZ，默认当前时间 |

没有 tenant_id、EIMS 外部角色列或自动部门外键。用户名采用部门 ID 是 [README](../../../README.md) 的供给约定，不是 schema 的格式限制。

## budget_sessions

| 字段 | 定义 / 作用 |
| --- | --- |
| `id` | BIGSERIAL 主键 |
| `token_hash` | CHAR(64) 非空唯一，SHA-256 哈希 |
| `user_id` | BIGINT 外键 users.id，ON DELETE CASCADE |
| `expires_at` | TIMESTAMPTZ 非空；查询只接受未过期会话 |
| `created_at,last_seen_at` | TIMESTAMPTZ 默认当前时间；读取会话更新最近访问时间 |

会话有 expires_at 和 user_id 索引；没有 user_id 唯一约束，可多会话。退出只删当前 token；改密不会删除会话。没有发现本地会话记录中存 EIMS access_token/id_token 或 refresh_token。

## 内存和 Cookie 状态

SSO 登录/退出事务保存在 [eims-sso.js](../../../server/services/eims-sso.js) 的 Map；不是上述数据库表。`budget_session_sso_provider`（按自定义会话名变动）是 HttpOnly 来源标记，仅影响前端单点退出选择，不作为预算授权数据。

密码创建更新来自 [create-user.js](../../../server/scripts/create-user.js)，允许同用户名覆盖并重新启用。实际账号状态、过期行数量、SSO 绑定和部门路径数据待验证；不得把生产用户清单或密码哈希写入知识库。
