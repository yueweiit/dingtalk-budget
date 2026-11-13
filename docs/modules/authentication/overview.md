# 登录与权限：概览

本模块负责本地账号登录、数据库会话、改密、退出和可选 EIMS 单点登录；身份角色和部门数据范围仍由预算系统本地表决定。没有 Web 注册、用户管理页面或 JWT 认证链路。

## 功能和角色

| 能力 | 实际行为 |
| --- | --- |
| 本地登录 | 启用的 username + scrypt 密码校验，创建 Cookie 会话 |
| 当前用户 | 返回 id/username/role/departmentId/departmentName，SSO 会话另有 authProvider |
| 自助改密 | 校验当前密码，新密码 8–200 字符、确认一致且不同于旧密码 |
| 本地退出 | 删除当前会话、清会话和 SSO 标记 Cookie |
| EIMS 登录 | Discovery + 授权码/PKCE，一次性 state；app_user_id 精确绑定本地 username |
| EIMS 退出 | 生成外部 logoutUrl，清本地会话，再由浏览器跳转 |
| 角色/部门 | superadmin 全范围；department_supervisor 绑定稳定部门 ID 及下级 |

来源：[routes/auth.js](../../../server/routes/auth.js)、[services/auth.js](../../../server/services/auth.js)、[eims-sso.js](../../../server/services/eims-sso.js)。权限矩阵和 API Key 边界统一维护在 [知识库认证总览](../../knowledge/authentication.md)。

## 账号供给

账号通过 [scripts/create-user.js](../../../server/scripts/create-user.js) 创建/更新，没有公开注册 API。同用户名会更新密码/角色/部门并 active=true。README 约定 admin 为管理员、主管账号采用稳定部门 ID；脚本本身允许其他用户名，不能把该约定写成已由代码强制实施。

初始化脚本只要求密码非空；8–200 字符限制出现在自助改密逻辑，不是所有密码设置入口共同约束。账号创建涉及真实数据写入，不能作为知识库验证自动执行。

## 接入页面

[App.jsx](../../../client/src/App.jsx) 首先获取当前用户，未登录显示 [Login.jsx](../../../client/src/pages/Login.jsx)。列表和当前可视化页提供 [ChangePasswordModal.jsx](../../../client/src/components/ChangePasswordModal.jsx)。EIMS 会话退出先走单点退出接口，失败时回退本地退出。

角色按钮不是权限边界；后端 requireRole/requireAuth 和数据范围必须同时核对。SSO 完整认证契约、目标 Cookie/HTTPS 和多实例 state 行为待验证。

继续阅读：[登录流程](workflow.md)、[代码映射](code-map.md)、[数据](database.md)、[接口](api.md)。
