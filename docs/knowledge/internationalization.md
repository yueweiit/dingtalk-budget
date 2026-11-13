# 国际化与多语言扩展

验证状态：2026-10-19 已通过当前 package.json、活动页面、公共组件、解析器及输出代码静态确认。下文“现状”是已实现行为，“建议”尚未实施；没有安装依赖或新增业务代码。

## 当前能力

| 范围 | 已通过代码确认的现状 | 证据 |
| --- | --- | --- |
| 界面语言 | 活动页面和公共组件以中文硬编码为主；少量技术信息/来源消息为英文，没有统一语言选择、用户语言偏好或翻译回退机制 | [App.jsx](../../client/src/App.jsx)、[Login.jsx](../../client/src/pages/Login.jsx)、[公共组件](../../client/src/components/) |
| 框架和资源 | 未发现 i18next/react-intl 等依赖、翻译 Provider、统一翻译函数或 locale 资源目录；不能声明已有 zh-CN/es 正式语言包 | [前端依赖](../../client/package.json)、[后端依赖](../../server/package.json)、[前端入口](../../client/src/main.jsx) |
| 钉钉表单解析 | 识别中文/西班牙语字段、预算类别和部分审批标题；这是来源格式兼容，不等于界面支持切换西班牙语 | [parser.js](../../server/services/parser.js) 的 `isBudgetRequest/getBudgetType/parseCommonMoneyCell` |
| 状态和枚举 | 主表 budget_type/status 使用中文，额度、角色、支出类型使用稳定英文编码，页面本地映射或直接展示 | [数据字典](data-dictionary.md)、[BudgetList.jsx](../../client/src/pages/BudgetList.jsx) |
| 后端错误 | 大多返回自然语言 message，改密部分返回 INVALID_INPUT/INVALID_CURRENT_PASSWORD；SSO 错误码由 Login 页面映射中文 | [auth.js](../../server/services/auth.js)、[auth 路由](../../server/routes/auth.js)、[Login.jsx](../../client/src/pages/Login.jsx)、[API 总览](api-overview.md) |
| 业务名称 | 部门、科目、分类、用途、描述按单字段保存来源文字，可能中西文混合；没有独立多语言数据模型 | [public.sql](../../public.sql)、[额度服务](../../server/services/effective-budget-quota.js)、[支出字典](../modules/expense-reporting/database.md) |

不能把双语部门名、能解析西文表单或浏览器默认数字格式视为完整国际化。

## 日期、数字、货币和输出

| 内容 | 当前实现及需要保留的业务含义 |
| --- | --- |
| 记账日期和月份 | [utcDate.js](../../client/src/utils/utcDate.js) 提供 formatUtcDate/formatUtcMonth；支出后端按 UTC 取日期/月。翻译不得把展示 locale 与核算时区混为一谈 |
| 审批节点 Excel | formatBeijingDateTime 显式使用 zh-CN、Asia/Shanghai，输出到秒；后端连接器缺省月份及 cron 也有上海时区语义 |
| 金额/数字 | [BudgetConfiguration.jsx](../../client/src/pages/BudgetConfiguration.jsx) 固定 zh-CN；当前 [报表页面](../../client/src/pages/VisualReportEchartsStyle.jsx) 使用浏览器默认 toLocaleString，并硬编码“万”；工作簿含 toFixed 和中文列名 |
| 币种 | [xlsxReport.js](../../client/src/utils/xlsxReport.js) 兼容人民币/美元/墨西哥比索等来源文字，金额字段有人民币/本位币与原币区别；没有面向用户语言的统一货币格式器 |
| 排序 | 部分部门/分类排序使用 zh-CN，其他 localeCompare 未指定 locale；切换展示语言后的排序策略尚未建立 |
| Excel | xlsxReport 自行生成 XML/ZIP/Blob，工作表名、表头、状态/类别显示和文件名含中文；未提供统一 language/locale 参数 |
| PDF、打印、邮件 | 未发现本仓库独立的 PDF、打印模板或邮件生成链路，不建立虚构的语言支持说明 |
| 通知和跨系统文案 | 同步结果及错误消息有中英文；实际预算预警消息由外部 OA 发送。本项目返回 alertLevel 等字段，外部通知语言待验证 |

证据补充：[钉钉接口](../../server/routes/dingtalk.js)、[调度器](../../server/services/scheduler.js)、[同步结果](../../server/routes/sync.js)、[Excel](../../client/src/utils/xlsxReport.js)。改地区格式不能改变金额精度、UTC 记账边界或预警阈值。

## 后续新增功能的约定（建议，尚未实施）

1. 先确认需要正式支持的语言及地区变体。当前界面以中文为主；西班牙语是否需要 es、es-MX 或其他区域、谁负责正式翻译均待验证，不自行宣称已支持。
2. 在获准的功能任务内建立项目级翻译入口和按领域组织的资源。可采用 `common.*`、`auth.*`、`budget.*`、`report.*`、`quota.*` 稳定键；这些命名是建议，目前不存在对应资源文件或调用 API。
3. 组件通过统一入口取得标签、占位符、帮助、校验、状态、空态和消息；插值使用命名参数，不拼接完整自然语言句子。新内容不继续在多个组件复制中文常量。
4. 先确定默认语言、用户选择保存位置、缺键回退和开发期缺键提示，再实现切换。建议保持当前中文行为为初始兼容回退，但须在实施时明确正式语言清单。
5. 新增文本同步维护已正式支持语言的键。不能准确翻译时保留键、明确标记待翻译及回退，不把机器猜测写成已审核译文。
6. 后端优先逐步增加稳定 code 和结构化参数，保留已有 message 兼容旧前端；前端优先翻译 code、未知 code 回退既有消息。不能一次删除旧字段或改变状态/HTTP 语义。
7. 新状态、类型、类别使用稳定内部编码；历史中文 status/budget_type 保留兼容转换。钉钉外部表单标签属于解析契约，其别名表不能被界面翻译键直接替换。
8. 展示格式逐步集中：语言选择控制数字/货币显示，业务规则控制时区与记账月份。日期筛选/API 值继续使用既有 ISO 日期或 YYYY-MM，不能发送本地化显示文字。
9. Excel 与界面共用类别/状态翻译与格式规则，设计可选 locale 参数时保持现有调用默认结果；核对列名、工作表名、文件名、长度约束和数字单元格类型。

不因本次知识库建设引入国际化依赖、资源目录、数据库列或公共接口。后续选型优先采用与现有 React/ESM 兼容、范围有限的方案；是否采用库由真实语言和维护需求决定。

## 界面翻译与业务数据翻译

- 菜单、按钮、提示、状态标签属于界面资源；部门名、动态 category_name、subject_name、用途及支出说明属于来源或用户维护的数据。
- 当前业务数据只有单名称/描述字段。若要求用户维护多语言名称，先确定来源责任系统、稳定 ID、语言回退及编辑权限，再评估附属翻译表或 JSON 映射；这里只提出评估方向，不表示已存在。
- 预算配置按 subject_name 筛选、解析器按表单文案识别类型，存在显示文字参与逻辑的历史约束。引入翻译时先核对 [额度查询](../../server/services/quota-configuration.js) 与 [解析器](../../server/services/parser.js)，避免改变关联和筛选结果。
- 权限继续使用稳定部门 ID/路径；报表历史归属和共享预算继续由原业务服务决定，翻译不承担组织映射。

## 渐进实施与验收

先覆盖一条活动页面链路及其公共组件，再覆盖相关错误、状态和导出，按任务扩展；不批量改写未使用的报表版本。公共组件与调用方见 [架构复用清单](architecture.md#公共能力及跨模块影响)。

后续实施检查：同一功能所有支持语言的键是否齐全、缺键回退是否可辨认、长文本和数字是否溢出、语言选择是否保留、金额/日期值是否不变、导出语言是否一致、旧 API 调用是否兼容。本次仅核实缺口及制定约定，未进行语言切换运行验证。
