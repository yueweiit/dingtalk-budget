# 预算申请与查询：接口

所有 `/api/list/*` 路由在 [list.js](../../../server/routes/list.js) 统一要求登录，并对主管施加部门范围。请求封装见 [api/index.js](../../../client/src/api/index.js)。

## 列表

| 方法 / 路径 | 参数 | 返回 |
| --- | --- | --- |
| GET `/api/list/all` | `startDate,endDate,status,page,pageSize` | 两类预算合并、核算后分页 |
| GET `/api/list/production` | 同上 | 生产预算候选 |
| GET `/api/list/non-production` | 同上 | 非生产预算候选 |

默认 page=1、pageSize=20，页面实际发送 pageSize=10。返回 `{success:true,data:[记录],total,page,pageSize}`；记录包含主表字段、类别明细数组、预算分类、部门展示、`approved_amount`、支出分类和可能的共享预算字段。

日期实际转换为预算月份范围；status 不会覆盖内置无效状态排除。分页参数未使用额度配置接口的严格范围校验，不应据此声称全局统一校验。业务筛选、取最新及分页顺序见 [workflow.md](workflow.md)。

## 统计

GET `/api/list/stats` 无页面日期参数，返回：

```json
{
  "success": true,
  "data": {
    "production_today": 0,
    "non_production_today": 0,
    "production_total": 0,
    "non_production_total": 0
  }
}
```

total 为当前有效候选数量；today 为创建日期计数，两种口径不同，均按调用人范围过滤。

## 本地审批记录

GET `/api/list/approval` 可传 `formNo`、`processInstanceId`。未强制要求至少一个筛选参数，仍会通过关联预算校验权限；返回 `{success:true,data:[审批节点]}`，按 step 升序。节点包含审批人 ID/名称和意见，主管可获取自己预算范围内的本地记录；不能与仅管理员可见的 OA 效率数据混淆。

## 详情和报表衔接

当前详情使用 GET `/api/list/report`，按预算月取主表与六类明细，再匹配选中记录；完整参数和返回见 [报表接口](../expense-reporting/api.md)。

`getBudgetDetail(formNo,type)` 只是保留封装，调用 `/api/dingtalk/querySimple`，该接口当前只返回金额。修改详情时先确认 [BudgetList.jsx](../../../client/src/pages/BudgetList.jsx) 的 `handleOpenDetail`，不要按封装注释假定存在另一个完整详情接口。

未登录 401；路由查询失败 500，生产返回通用查询失败信息。列表附加支出有降级为空的路径，响应成功不等于外部实际支出已核验；见 [报表流程](../expense-reporting/workflow.md)。
