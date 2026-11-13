# 审批同步与调度：接口

定义：[sync.js](../../../server/routes/sync.js)、[config.js](../../../server/routes/config.js)，两组路由均要求 superadmin；无会话 401、其他角色 403。客户端同步请求超时为 600 秒，见 [api/index.js](../../../client/src/api/index.js)。

## 手动预算同步

POST `/api/sync` 请求：

```json
{
  "startTime": 0,
  "endTime": 0,
  "refreshExisting": true,
  "syncExpenses": true
}
```

时间为毫秒时间戳；示例 0 仅说明类型，不是建议的同步范围。未给有效起止点时预算函数回退最近 30 天至当前；目前使用 truthy 回退，没有统一严格时间校验。页面将选中日期按浏览器本地日首/日末转换，不是固定 UTC。

处理顺序：预算窗口同步 → 可选既有状态刷新 → 可选支出代理。返回包含 `success,synced,added,updated,existing,pending,skipped,pendingInstances,terminalSkippedInstances,message`，以及 `statusRefresh` 和 `expenseSync` 摘要。单实例失败不保证反映为 overall success=false；需阅读 [workflow.md](workflow.md)。

HTTP 处理器不接收 `updateExisting` 重建选项；只有 CLI/内部函数显式支持。外部普通支出地址未配置时 expenseSync 为成功跳过，外部失败包装在该字段，HTTP 顶层仍可能成功。

## 专项支出拆分同步

POST `/api/sync/expense-splits`：`startTime,endTime` 均必填，缺少返回 400。转发固定 `splitTypes:['salary','social_insurance','office_space']`，不是所有报表专项类别的完整重建入口。成功返回 `{success:true,data:外部结果,message}`；外部未配置返回 400，调用失败按外部/内部状态处理。实际表写入属于外部支出服务。

## 调度管理

| 方法 / 路径 | 返回 / 行为 |
| --- | --- |
| GET `/api/config/scheduler` | `{success:true,data:{running,cronExpressions,schedule,cronExpression,nextRun,timezone,stateFile,lastCompletedEndTime,lastCompletedEndIso,lastBackfillEndTime,lastBackfillEndIso,backfill,pendingStatusRefresh,pendingCount,lastRun}}` |
| POST `/api/config/scheduler/start` | 注册进程内 cron，已有任务则保持现状，返回 success/message |
| POST `/api/config/scheduler/stop` | 停止已注册任务、清任务列表，返回 success/message |

`running` 表示调度已注册，不是正在处理实例；`nextRun` 为描述标签，不是精确时间。stop 不清状态文件，也不实现中断已开始的同步。启停不会写持久化开关，重启 server 后仍由入口自动启动调度。

普通异常返回 500，生产隐藏部分细节。此处仅记录调用契约，本次没有调用这些写入或环境改变接口。
