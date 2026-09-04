# 已全额抵扣报表规则

`approval_expense_payment_events.source_type = fully_deducted` 表示授权用户评论了 `已全额抵扣`。该事件属于已处理单据，金额和本位币金额均为 `0`：列表、详情、可视化报表、周报和 Excel 导出可以保留该明细，但不增加实际支出或预算已用金额。

只要同一业务编号存在有效的 `comment_explicit_amount` 或 `fully_deducted` 事件，就不能再按完成审批整单金额兜底，避免重复统计。非授权用户的相同文字不会成为事件；混合抵扣与付款金额的评论由同步项目留待人工复核。

同步项目负责识别和写入，OA 项目负责保存原始评论。部署前必须先让同步项目执行 schema ensure，使 `fully_deducted` 来源类型和零金额约束在预算项目读取前可用。
