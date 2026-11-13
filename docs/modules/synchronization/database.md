# 审批同步与调度：数据与持久化

## 本地写入

同步写两类预算主表、六类明细及有效额度/科目。字段字典复用 [预算数据](../budget-applications/database.md)、[额度数据](../effective-quota/database.md)，不在本模块重复维护。当前同步未写 `approval_flow`。

来源：[sync.js](../../../server/routes/sync.js) `insertRecord/updateRecord`。预算主要通过 form_no 查询既有记录；额度用 corp_id+process_instance_id；两种来源唯一性不同。

## 外部 OA 读取

| 表 | 当前使用字段 / 规则 | 代码 |
| --- | --- | --- |
| `ding_approval_instance` | `corp_id/process_instance_id/process_code`、`title/status/result`、申请人/部门快照、`create_time/finish_time`、`last_event_time/updated_at/deleted_at`、`form_component_values/raw_payload` | [dingtalk.js](../../../server/services/dingtalk.js) `buildOaDbDetail/buildOaDbInstanceIdsQuery` |
| `ding_department_tree` | `corp_id/dept_id/name/path_ids/path_names/is_current`；普通路径快照只接受当前树中该 dept_id 唯一命中 | [department-tree.js](../../../server/services/department-tree.js) |

OA 列表按流程和事件时间查；OA 实例详情查询只按实例 ID，不含企业条件。部门快照防止多企业同 ID 歧义，但不等于全链路多租户隔离。外部表完整 DDL 和数据约束待验证。

## 调度状态 JSON

[scheduler.js](../../../server/services/scheduler.js) 使用 `SYNC_STATE_FILE` 或默认 [server/data/sync-state.json](../../../server/data/sync-state.json)。它是文件状态，不是数据库表；初始化只核实字段生成逻辑，不读取/复制运行实例清单。

| 字段 | 作用 |
| --- | --- |
| `lastCompletedEndTime` | 下一增量窗口开始点，毫秒时间戳 |
| `lastBackfillEndTime` | 控制回补间隔 |
| `pendingInstances` | 按审批实例 ID 存状态、结果、原因和首次/最近发现时间 |
| `lastRun` | 时间窗口、pending 摘要、窗口结果、状态刷新、回补结果 |

状态文件不存在时构造空状态；其他解析/读错误抛出。保存为 JSON 文件覆写，没有跨进程锁或数据库事务；当前文件被 Git 跟踪，部署覆盖、多个实例共享和失败恢复需额外核验。首次部署不应自动采用仓库内游标跳过历史数据。

## 外部支出代理

普通同步代理调用外部 `/api/sync/manual`；专项拆分代理调用 `/api/sync/operation-splits`，发送 salary/social_insurance/office_space。真实写入外部支出库，本项目只传参并接收结果；相关表可读字段见 [支出数据](../expense-reporting/database.md)。

部门回填默认预览，实际写入仅更新尚无 ID 且 form_no+process_instance_id 精确匹配的预算；不会改历史审批原文。额度回填与组织重核的实际影响见 [额度流程](../effective-quota/workflow.md)。
