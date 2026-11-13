# 钉钉查询与预警集成：接口

定义：[routes/dingtalk.js](../../../server/routes/dingtalk.js)。query/querySimple 没有路由级 requireAuth；全局 API_KEY 已配置时需 X-API-Key 或 apiKey，有会话也不豁免 dingtalk 前缀。未配置 Key 时这些查询可无会话访问；有会话仍施加部门范围。

## GET /api/dingtalk/querySimple

| 参数 | 当前解析 |
| --- | --- |
| `type` | 中西/英文、数组/JSON 数组；option_1 非生产、option_2 生产；也支持中文“生产/非生产”参数键 |
| `formNo` | 优先按表单编号，忽略部门/月筛选 |
| 部门 ID | departmentId、departmentID、department_id、deptId、dept_id、deptNameID、部门Id，按此顺序优先 |
| 部门名称 | 无 ID 时 deptName、department、部门，完整名称等值匹配 |
| 时间 | startDate/endDate 或 time/month/date/时间/申请日期；优先参考自然月，缺省上海当天所在月 |

成功只返回 `{"budgetAmount":"0"}` 或实际金额字符串。缺类型/缺部门/无记录可安全返回 0；未知非空类型回退生产。查询异常 500；该结果没有统一 success/data 包装，不返回预算详情。

## GET /api/dingtalk/query

同类 type/部门参数，另外 startDate/endDate 按 create_time 日首/日末筛选；至少需要部门或日期之一，否则 400。默认生产；返回 `{success:true,message,total,data}`，最多 50 条。无数据时 total=0、data=null，不是空数组。这里 total 是返回条数，不是全范围统计数量。

## GET /api/dingtalk/alert-budget-snapshot

始终要求专用 `X-Budget-Alert-Key` 头与服务端 `BUDGET_ALERT_API_KEY` 相等，不使用普通登录角色或全局 API_KEY 代替。

| 参数 | 含义 |
| --- | --- |
| `departmentId` / `department_id` | 稳定部门 ID |
| `month` / `applicationDate` | 支持月份/带日期格式，规范为 YYYY-MM |
| `type` / `budgetType` | 固定两类预算解析，调用方应显式提供；有部门/月但缺类型时，当前实现可能生成无效表名查询并返回 400 |
| `applicationAmount` | 非负数字；字符串允许千分位逗号 |

成功返回 `{success:true,data:快照}`，只含汇总金额/比例/等级，字段见 [database.md](database.md)。未配置密钥 503，错误密钥 401；计算/查询异常当前统一进入 400 分支，生产返回通用查询失败。

预算或部门/月未命中会返回 missing_budget，而非必然参数错误；`applicationAmount` 非数字/负值会报错。缺申请金额当前数字转换可视为 0，调用方应显式提供，不能宣称所有参数都有严格必填校验。阈值与已用金额来源见 [workflow.md](workflow.md)。

外部消息发送不在接口实现中；本次没有调用连接器或预警端点。
