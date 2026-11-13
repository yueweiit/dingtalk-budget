# 项目知识库总索引

本知识库用于理解钉钉预算系统，并作为后续开发任务的项目上下文。初始化核对日期：2026-10-08；代码基线：`773b297`。内容来自仓库代码、SQL 和已有文档，未连接实际数据库、启动服务或验证外部系统。部署状态、线上数据和外部表完整结构均不视为已验证。

项目入口证据：[后端启动与路由](../../server/index.js)、[前端页面入口](../../client/src/App.jsx)、[业务表定义](../../public.sql)、[认证表定义](../../auth.sql)。

2026-10-19 增量复核：代码仍为 `773b297`；保留既有文档与规则，补充数据字典、国际化、集成边界及可靠性分析。历史验证记录只代表当时执行情况，本次范围见文末。

## 推荐阅读顺序

1. 阅读根目录 [AGENTS.md](../../AGENTS.md)，明确开发、安全和验证约定。
2. 阅读 [项目概览](project-overview.md) 和 [业务地图](business-map.md)，找到相关领域。
3. 按任务读取下表对应模块的 `overview.md`、`workflow.md` 和 `code-map.md`；接口或数据变更时再读 `api.md`、`database.md`。
4. 通过文档链接核实当前代码，分析权限、事务、金额、时间和上下游影响后修改。

## 全局文档

| 文档 | 负责的信息 |
| --- | --- |
| [project-overview.md](project-overview.md) | 项目定位、技术栈、真实入口、目录结构 |
| [architecture.md](architecture.md) | 服务边界、调用方向、事务和缓存、架构图 |
| [business-map.md](business-map.md) | 业务模块、角色、主要功能、任务导航 |
| [database.md](database.md) | 本地表清单、数据库关系和数据归属 |
| [data-dictionary.md](data-dictionary.md) | 核心字段、关联键、金额/时间、部门及领域枚举 |
| [api-overview.md](api-overview.md) | 全部 HTTP 路由、公共约定、客户端调用关系 |
| [authentication.md](authentication.md) | 会话认证、角色和部门范围、租户边界 |
| [internationalization.md](internationalization.md) | 已有语言能力、翻译缺口、业务多语言与渐进约定 |
| [integrations.md](integrations.md) | 数据生产/消费方、认证、超时重试和跨系统失败边界 |
| [deployment.md](deployment.md) | 配置来源、运行方式、部署依赖和现有说明差异 |
| [conventions.md](conventions.md) | 实际编码风格、开发验证、文档维护方法 |

## 模块入口

模块划分是对实际代码职责的导航，不代表代码中存在同名独立服务。

| 模块 | 概览 | 流程 | 代码映射 | 数据 | 接口 |
| --- | --- | --- | --- | --- | --- |
| 预算申请与查询 | [概览](../modules/budget-applications/overview.md) | [流程](../modules/budget-applications/workflow.md) | [映射](../modules/budget-applications/code-map.md) | [数据](../modules/budget-applications/database.md) | [接口](../modules/budget-applications/api.md) |
| 审批同步与调度 | [概览](../modules/synchronization/overview.md) | [流程](../modules/synchronization/workflow.md) | [映射](../modules/synchronization/code-map.md) | [数据](../modules/synchronization/database.md) | [接口](../modules/synchronization/api.md) |
| 支出核算、报表与导出 | [概览](../modules/expense-reporting/overview.md) | [流程](../modules/expense-reporting/workflow.md) | [映射](../modules/expense-reporting/code-map.md) | [数据](../modules/expense-reporting/database.md) | [接口](../modules/expense-reporting/api.md) |
| 有效预算额度与配置中心 | [概览](../modules/effective-quota/overview.md) | [流程](../modules/effective-quota/workflow.md) | [映射](../modules/effective-quota/code-map.md) | [数据](../modules/effective-quota/database.md) | [接口](../modules/effective-quota/api.md) |
| 登录与权限 | [概览](../modules/authentication/overview.md) | [流程](../modules/authentication/workflow.md) | [映射](../modules/authentication/code-map.md) | [数据](../modules/authentication/database.md) | [接口](../modules/authentication/api.md) |
| 钉钉查询与预警集成 | [概览](../modules/dingtalk-integration/overview.md) | [流程](../modules/dingtalk-integration/workflow.md) | [映射](../modules/dingtalk-integration/code-map.md) | [数据](../modules/dingtalk-integration/database.md) | [接口](../modules/dingtalk-integration/api.md) |

## 复用现有文档

- [有效预算额度台账](../effective-budget-quota.md)：保留现有额度、组织映射和运维规则。
- [预算报表与审批效率口径](../BUDGET_REPORTING_GUIDE.md)：保留业务解释和验收用例，付款事件的代码细节见支出模块。
- [已全额抵扣报表规则](../fully-deducted-payment-rule.md)：保留零金额事件和外部 schema 顺序要求。
- [仓库 README](../../README.md)、[部署说明](../../DEPLOY.md)：保留原位置；与代码存在的差异见相关知识库页面。历史安全变更文档仅作背景，不复制其中配置值。

## 待验证及已知边界

| 事项 | 已核实的代码事实 / 下一步验证方向 |
| --- | --- |
| 运行环境与真实表结构 | 仓库定义不等于线上 schema；授权后核对实际版本、迁移历史、时区、外部表能力和数据库账号权限。见 [部署](deployment.md)、[数据库](database.md)。 |
| 审批记录写入来源 | 存在 `approval_flow` DDL 和查询，但当前仓库未发现其写入逻辑；需要确认外部写入方和数据完整性。见 [预算数据](../modules/budget-applications/database.md)。 |
| 服务主体无法解析 | 同步会置空部门 ID、名称；`public.sql` 的主表部门名称仍为 `NOT NULL`，可能导致插入失败。需要核对目标库约束和对应表单。见 [同步流程](../modules/synchronization/workflow.md)。 |
| 租户隔离 | 预算主表写入固定 `tenant_id='default'`，查询没有统一租户过滤；有效额度的企业唯一键不能证明整个系统具有多租户隔离。见 [认证](authentication.md)。 |
| 单点登录能力 | 代码实现 Discovery、state、PKCE 和用户信息映射；未见 ID Token 签名/nonce 校验或 EIMS 角色比对。需与 EIMS 契约及部署实例核验。见 [登录流程](../modules/authentication/workflow.md)。 |
| 同步失败恢复及并发 | 单实例错误可被捕获后继续，返回整体成功；调度锁只在进程内，HTTP 手动同步不复用该锁。见 [同步流程](../modules/synchronization/workflow.md)。 |
| 外部库降级 | 实际支出汇总可返回警告，但 `/list/report` 的待审批支出查询失败会使整个报表失败；不能笼统宣称支出库离线时仍完整可用。见 [报表流程](../modules/expense-reporting/workflow.md)。 |
| 额度与查询口径 | 配置中心展示有效台账；列表和预警仍读预算申请主表，预警查询未过滤审批状态。是否统一口径需要业务确认。见 [集成数据](../modules/dingtalk-integration/database.md)。 |
| 历史组织与外部通知 | 已有固定组织映射、共享预算和历史投影规则；真实组织树、未确认部门、付款授权人员及 OA 通知行为需要外部核验。见对应模块。 |
| 页面与 Excel 口径 | 执行状态图仅把待审批普通支出计入“审批中”，Excel 还计入待审批预算，且可能补入预算总额；不能直接互相对账。差异已静态确认，业务期望及真实影响待验证，见 [报表指标](../modules/expense-reporting/workflow.md#页面指标与导出差异)。 |
| 国际化 | 没有统一语言资源、切换及区域格式层；正式语言、翻译负责人和业务名称模型待确定。新功能按 [渐进约定](internationalization.md) 处理，避免把西文解析误写为界面支持。 |
| 性能与运行保障 | 全量报表、逐记录查询、进程缓存/锁、SSO 无显式 HTTP 超时等均有边界；影响取决于数据量、部署和外部服务。见 [架构](architecture.md)、[集成](integrations.md)，需授权后的压测/联调，当前未执行。 |

## 长期维护

文档不替代代码。实质变更时更新所属模块，再按影响更新全局文档和索引；规则已在现有专题文档维护时优先引用该页。新模块接入索引，废弃入口标注实际使用情况；每条新增结论附代码路径或方法名。待验证事项只在取得证据后改为已确认，不保存凭据或生产用户数据。

## 初始化验证记录

2026-10-08 初始化新增 9 份知识库文档、6 个模块共 30 份文档及项目 AGENTS.md。已静态核对相对链接、引用路径、方法名、26 个注册 HTTP 路由及 13 张本地 DDL 表；Markdown 标题、代码围栏、空白和敏感内容模式检查通过。9 个 Mermaid 块仅检查结构和括号，未进行图形渲染验收。

Git 范围检查确认本次只新增上述 Markdown，原有受版本控制文件及业务代码未改变。未安装依赖、启动服务、执行迁移/回填/部署，也未运行构建或业务测试：本次为纯文档任务，且现有数据库集成测试会产生写入。实际环境和外部契约仍按上表待验证事项处理。

## 2026-10-19 增量完善验证记录

- 已验证（静态）：保留原有9份基础文档及6个模块的30份文档，新增 data-dictionary、internationalization、integrations；兼容合并 AGENTS，并修正已有报表/额度专题。相对本次开始时的工作区，新增3份、更新15份 Markdown，没有删除文件。
- 已验证（静态）：本索引覆盖12份基础文档，6个模块均保留 overview/workflow/code-map/database/api；26个实际注册 HTTP 路由与 API 总览一致，13张本地 DDL 表与数据库总览对应。关键字段、外键、事务、状态、活动页面及外部调用已按引用路径核对。
- 已验证（静态）：检查 AGENTS、全部知识库/模块文档及3份既有专题，共46份文档、698处本地链接及锚点，无失效项；代码围栏和11个 Mermaid 块的类型/括号结构已检查。未使用完整 Mermaid 解析器或进行渲染验收，排版及渲染效果仍待验证。
- 已验证（范围）：对开始时168个非忽略文件记录 SHA-256，复核后仅文档/AGENTS变化，业务代码、SQL、配置与依赖文件未变；原有未提交文档在其基础上完善，未清理工作区。git diff --check 通过，文档敏感内容模式检查未发现疑似凭据；模式检查不等于对外部环境的安全审计。
- 已修正文档冲突：付款事件与完成态的区别、页面/Excel口径、月结明细关联键、CREATE TABLE LIKE关系、组织选项降级无来源标志、回填数据源及额度台账当前使用范围。已识别冲突均按代码澄清；尚未确认的运行/外部事实保留在待验证索引。
- 执行边界：未安装或修改依赖，未运行构建/业务测试，未连接数据库、迁移、写业务数据、触发同步、启停服务或部署；未提交、推送或执行危险 Git 操作。外部项目实现与线上验收未覆盖，当前仓库未发现另外需要独立建档的主要业务模块。

后续任务按 AGENTS → 本索引 → 相关模块 → 实际代码恢复上下文，重要变更再更新所属文档；不重复整库扫描或为每次小修改新建总结文件。
