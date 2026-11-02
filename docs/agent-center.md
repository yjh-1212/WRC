# 鲁行智助 · AI 智能体中心

入口为业务页面顶层导航栏的「AI智能体」以及右下角的 AI 助手，独立页面 `/agents` 参考辽粮项目的侧栏、历史对话、能力卡片及对话布局。顶层导航使用与其他菜单一致的 Lucide 线性机器人图标；首页、悬浮入口、侧栏和对话头像使用用户指定的透明蓝白机器人图片：`apps/web/public/ai/luxing-assistant-transparent.png`。入口按账号权限显示，进入智能体后可返回原业务页面。

## 能力与查询口径

| 智能体 | 授权条件 | 已接入事实 |
| --- | --- | --- |
| 监管态势总览 | `dashboard:view` | 已授权模块中的车辆、离线车辆、企业及未闭环告警数量 |
| 车辆档案查询 | `archive:vehicle:read` / ARCHIVES | 车辆台账、所属企业、在线状态；支持离线筛选及引号内编号查询 |
| 风险事件研判 | `safety:alert:read` / SAFETY | 未闭环告警；支持高风险、超速、越界、离线筛选 |
| 准入审批助手 | `admission:application:read` / ADMISSION | 申请类型、审批状态、更新时间；待办理问题筛选审核中的申请 |
| 运行分析助手 | `analytics:operation:read` / ANALYTICS | 授权范围内登记运行记录的数量、累计里程、累计时长及近期样本 |
| 平台办事指引 | `dashboard:view` | 当前平台的角色职责、线下申请后省级直接开通地市等办理流程 |

明细每次最多返回 12 条，分别提供总数、样本数和数据时点。运行分析汇总为当前授权范围内所有已登记记录，不代表仅最近 12 条，也不提供外部天气、交通预测或实时地图能力。办事指引是平台操作说明，不是外部法规。回答不能代替业务审批或执行写入。

## 模型配置

沿用辽粮项目的 DeepSeek 服务。在服务端 `.env` 配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`，可选 `DEEPSEEK_MODEL`；默认模型与辽粮相同，为 `deepseek-flash`。密钥不进入前端或 API 响应。请求走服务端 HTTPS，流式响应，60 秒超时；模型不可用时显示可重试错误，不伪造回答。

业务问答会将当前提问、经过字段裁剪且符合账号权限的查询事实、最近 4 轮有效历史发给所配置的模型服务。不会提供密码、密钥、个人联系方式或未授权记录。外部模型连接验证仅发送纯合成测试内容；本地业务事实校验及浏览器交互测试不向模型发送业务数据。

## 对话与数据隔离

- `AgentConversation` 和 `AgentTurn` 持久化个人历史；查询始终绑定当前用户、城市及企业。省级身份也不能查看其他人的对话。
- 城市与企业业务查询沿用 `workspaceContext` 及 Prisma 范围约束，能力列表同时核对业务权限和已开通模块。
- 历史回答加载时复核授权摘要和来源可见性；权限变化后隐藏旧结果，提示重新查询。
- 同一账号同时生成一个回答。`requestKey` 保证完成重放不调用模型、失败重试不新增相同问题。
- 生成中可以停止，离开页面会取消。服务重启后的未完成记录显示为可重试的中断状态。
- 每个对话最多 100 个问题；历史列表每页 20 条，可搜索、加载更多、删除。草稿按用户和对话保存在本机。

数据库迁移：`20261028140000_agent_center`。按正常部署流程执行 `pnpm db:deploy` 和 `pnpm db:generate`。

## 接口与验证

接口前缀 `/api/agents`：`GET catalog`、`GET/POST conversations`、`GET/DELETE conversations/:id`、`POST conversations/:id/cancel`、`POST conversations/:id/messages/stream`。流式事件为 `status`、`facts`、`delta`、`result` 或 `error`。

```sh
pnpm build
pnpm --filter api test
node tests/api/agent-center-api.cjs
node tests/e2e/agent-center.cjs
```

接口测试覆盖省级、济南、青岛和企业账号的隔离、查询口径与历史删除，测试记录自动清理。浏览器测试用合成 SSE 响应覆盖失败重试、停止、历史恢复、生成中离开及移动端布局。真实模型的纯合成连接测试另行验证，不消耗业务数据。
