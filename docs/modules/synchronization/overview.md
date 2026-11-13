# 审批同步与调度：概览

## 功能和数据源

同步模块把预算审批解析为预算主表及明细，维护状态和有效额度；通过 HTTP 可代理外部支出普通同步或专项拆分同步。审批源由 `DINGTALK_SYNC_SOURCE` 控制：默认直接调用钉钉，oa_db 模式读取外部 OA 库；并不是两种源同时合并。

钉钉实例列表可选 old/new/both，both 合并去重；详情先调用新 API，失败回退旧 API。OA 列表以配置的 process_code 及 `COALESCE(last_event_time,updated_at,create_time)` 窗口读取未删除实例，详情按 process_instance_id 取最新。

证据：[services/dingtalk.js](../../../server/services/dingtalk.js)、[config/dingtalk.js](../../../server/config/dingtalk.js)。

## 入口和权限

- `SyncButton` 的手动更新：POST `/api/sync`；默认同步预算、刷新既有状态、代理外部支出同步。
- `ExpenseSplitSyncButton`：POST `/api/sync/expense-splits`，代理工资、社保、办公场地三类拆分。
- 服务启动后自动注册 node-cron；`/api/config/scheduler*` 提供管理员状态/启停。
- CLI：[scripts/sync-dingtalk.js](../../../server/scripts/sync-dingtalk.js)；专项回填脚本见 [代码映射](code-map.md)。

HTTP 同步和调度管理均要求 superadmin；CLI 没有 Web 会话校验，直接依赖运行环境及数据库权限。证据：[routes/sync.js](../../../server/routes/sync.js)、[routes/config.js](../../../server/routes/config.js)。

## 调度默认值

| 参数 | 默认 | 实际含义 |
| --- | --- | --- |
| `SYNC_CRON` | `2 * * * *` | 每小时第 2 分钟执行 |
| `SYNC_TIMEZONE` | Asia/Shanghai | cron 调度与运行日志时区 |
| `SYNC_INITIAL_LOOKBACK_MINUTES` | 60 | 无已完成游标时初始回看 |
| `SYNC_BACKFILL_ENABLED` | 开启，设置 0 关闭 | 定期再扫最近历史窗口 |
| `SYNC_BACKFILL_INTERVAL_MINUTES` | 360 | 回补间隔 |
| `SYNC_BACKFILL_LOOKBACK_DAYS` | 3 | 回补天数 |
| `SYNC_PENDING_STATUS_REFRESH_ENABLED` | 开启，设置 0 关闭 | 刷新已落库的审批中预算状态 |
| `SYNC_PENDING_STATUS_REFRESH_LIMIT` | 200 | 每次刷新上限 |
| `SYNC_STATE_FILE` | server/data/sync-state.json | 游标、pending 和上次运行结果 |
| `MANUAL_STATUS_REFRESH_LIMIT` | 500 | 手动既有状态刷新上限 |

来源：[scheduler.js](../../../server/services/scheduler.js)、[sync.js](../../../server/routes/sync.js)。`getSchedulerStatus.nextRun` 返回标签而非下次精确时间，启动仅注册任务，不立即完整回补历史数据。

## 维护边界

读取已有预算的普通同步默认不重建其金额明细，CLI `--update-existing` 才显式走更新路径；状态变更有提前返回逻辑，详见 [workflow.md](workflow.md)。外部支出识别/写表在其他项目，不能在本仓库补造相应实现。

继续阅读：[流程](workflow.md)、[映射](code-map.md)、[数据](database.md)、[接口](api.md)。
