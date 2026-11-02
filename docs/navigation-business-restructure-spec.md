# 省市分工与业务导航实施规格

日期：2026-10-28。依据：用户确认省级仅监管端，市级具有监管端与企业端；详情、轨迹、过程和历史记录收进对象业务页面，不作为独立侧栏功能。

后续范围调整：用户确认暂不开展试点的筹备、申报、审核、整改、验收。本轮移除试点菜单和对外接口，旧地址转到城市管理，不再初始化或展示试点阶段。下文试点相关约定仅保留为历史设计，不属于当前启用范围。

## 验收边界

- AC01：三个角色采用独立导航，省级无企业门户、无属地准入办理和企业记分写入口；后端同样禁止省级办理属地业务。
- AC02：省级：全省工作台；地市管理（开通审核、城市管理、试点管理）；全省监测（运行态势、风险监测、综合查询）；协同督办（风险通报、督办任务、跨市协同、应急统筹）；分析评价（省域运行分析、地市履责评价、监管报告）；底部平台管理（组织与人员、角色权限、标准与规则、数据接入与共享、安全审计）。每个叶子必须有真实页面和API，不使用Placeholder。
- AC03：市级监管按主体→准入→运行→安全→评价排序，底部管理设置；轨迹/运行记录/事故回溯通过监测或事件详情进入，不能丢失原业务操作。
- AC04：企业端：运营工作台；基础资料（企业资料、车辆管理、安全员管理）；申请与许可（业务申请、通行许可）；运行监测；安全管理（事件处置、应急与整改）；企业评价；底部企业设置（成员管理、接入配置）。资质与安全画像在相应主体详情内。
- AC05：市级工作台可接收省级事项、响应及反馈；省级复核/退回/办结自己的督办事项，不替代属地事故或审批状态。
- AC06：旧路由重定向到业务主入口并携带对象ID/视图筛选。详情路由通过独立权限表校验，不依赖菜单必须列出；省市越权403或安全重定向。
- AC07：省级新增流程具有真实保存、状态流转、追溯和关联地市；只读角色不可创建/派发/复核。正常、空、失败、加载、校验与重试状态齐全。
- AC08：构建、API角色/菜单/隔离测试、三端关键页面浏览器检查通过；原工作区和山东业务保留，迁移前备份。

## 省级协同 API 契约

前缀 `/api/oversight`，沿用统一 envelope。JSON 字符串仅存储时使用；输出统一展开。列表 `{items,total,page,pageSize}`；Query `{q?,status?,kind?,workspaceId?,period?,page=1,pageSize=20}`。省级以 accountLevel=PROVINCE 判断，写操作还需 system:organization:update；CITY 只能读取被分派至本市的事项和已发布评价，企业/运维拒绝。

模型（由省级后端任务创建schema及迁移）：
- ProvinceMatter：id,businessNo(unique),kind(RISK_NOTICE/SUPERVISION/CROSS_CITY/EMERGENCY),title,description,level(LOW/MEDIUM/HIGH/CRITICAL),status(DRAFT/DISPATCHED/RESPONDING/PENDING_REVIEW/CLOSED),dueAt?,basis?,resourceIdsJson(default[]),logsJson(default[]),createdById,createdByName,createdAt,updatedAt。
- ProvinceAssignment：id,matterId→ProvinceMatter,workspaceId→CityWorkspace(可标量),status(WAITING/PROCESSING/SUBMITTED/CLOSED),feedback?,evidenceNote?,respondedAt?,submittedAt?,reviewComment?,closedAt?,updatedAt；unique(matterId,workspaceId)。ProvinceMatter.assignments[] real relation。
- ProvincePilot：id,workspaceId(unique),stage(PREPARING/SUBMITTED/REVIEWING/RECTIFYING/ACCEPTED/OPERATING),responsibleName,planDate?,summary,reviewComment?,logsJson,updatedAt。
- ProvinceResource：id,workspaceId,name,kind(VEHICLE/STAFF/SITE/ENERGY/REPAIR),status(AVAILABLE/BUSY/UNAVAILABLE),capacity,contactName?,contactPhone?,conditions?,updatedAt。
- ProvinceDutyEvaluation：id,workspaceId,period(YYYY-MM),status(DRAFT/PUBLISHED),score,grade,breakdownJson,conclusion?,createdAt,publishedAt?；unique(workspaceId,period)。

省级接口：
- GET /overview → {summary:{cities,vehicles,enterprises,pendingApplications,openMatters,overdueMatters},cities:[{id,cityName,...counts}],tasks:[],risks:[]}。
- GET /options → {workspaces:[{id,cityCode,cityName}],resources:[],kinds:[{value,label}]}。
- GET /matters → matter list，行含 assignments[{id,workspaceId,cityName,status,feedback,evidenceNote,...}]。
- GET /matters/:id → 完整matter及assignments/logs/resources。
- POST /matters body {kind,title,description,level,dueAt?,basis?,workspaceIds:string[],resourceIds?:string[]} → DRAFT matter；验证城市、资源归属和数量。
- PATCH /matters/:id body同可编辑内容（DRAFT限定）。
- POST /matters/:id/actions body {action:DISPATCH|RETURN|CLOSE,comment,workspaceId?} → matter。DISPATCH DRAFT→DISPATCHED；RETURN 仅SUBMITTED assignment→PROCESSING；CLOSE workspaceId 单个SUBMITTED→CLOSED，全部CLOSED则matter CLOSED。不带workspaceId时仅全部已提交可整体复核关闭，拒绝未反馈直接办结。
- GET /pilots → list；POST /pilots body {workspaceId,stage,responsibleName,planDate?,summary,reviewComment?} → pilot upsert并保留状态历史。
- GET /resources → list；POST /resources body {workspaceId,name,kind,status,capacity,contactName?,contactPhone?,conditions?} → resource；PATCH /resources/:id同可编辑字段。
- GET /evaluations → list含workspace cityName、breakdown；POST /evaluations/generate body {period} → 逐城市DRAFT评价，指标由现有企业、车辆、数据时效及处置回执计算并展示口径；不可覆盖PUBLISHED。
- POST /evaluations/:id/publish body {conclusion} → PUBLISHED。
- GET /directory → {items:[{key,name,source,level,updatePolicy,scope,fields:[]}]}；基于实际已存在数据表/接口维护共享目录；界面不得声称已真实对外交换。

市级接口：
- GET /city-tasks → 本市assignments列表，行包含 matter 概要与反馈状态。
- GET /city-tasks/:id → 本市assignment及所属matter、公开任务日志；不得返回其他城市反馈、联系人或资源明细。
- POST /city-tasks/:id/actions body {action:RESPOND|SUBMIT,feedback?,evidenceNote?} → assignment；WAITING→PROCESSING→SUBMITTED；CITY_ADMIN或已授安全处置权限的CITY人员操作，限定本市。省级不能代替城市响应。

## 前端路由契约与分工

省级专属路由：
`/province/overview` 工作台、`/province/pilots` 试点；`/province/monitoring` 运行态势（可复用现有实时地图但省级只读）、`/province/risks` 风险监测、`/province/search` 综合查询；`/province/risk-notices`、`/province/supervision`、`/province/collaboration`、`/province/emergency`（分别按kind查询且独立列表，详情抽屉）；`/province/analysis`（复用运行分析）、`/province/evaluations` 履责评价、`/province/reports`（复用监管报表）、`/province/directory` 数据目录。已有 `/province/applications`、`/province/workspaces` 保留。平台设置可复用带明确省级身份的原系统页。

省级后端代理：仅编辑 `apps/api/src/oversight/**`、schema新增与迁移、`prisma/seed-oversight.ts`，可注册 OversightModule；不改auth、guards、router或旧业务服务。
省级UI代理：仅新增 `Province*.vue`、`Province*.css`及通用省级组件，基于上述API；不改router/auth/AppShell/既有页面。向根代理提供组件清单。
市企前端代理：修改router/AppShell和市企现有业务页面，必要新增复合业务页面；集成省级组件路由；根代理拥有auth菜单/守卫，新省级API由后端代理负责。实现市级工作台的省级事项入口和反馈详情抽屉。
根代理：菜单配置、接口职责边界、Prisma新模型scope、权限与API回归、端到端测试及文档。

## 兼容与交互

现有 Vue3/Element Plus 样式不更换框架。合并同一对象的视图可使用页内视图；独立业务功能保留独立路由。删除侧栏入口不等于撤销详情能力，所有旧链接必须有兼容行为。避免省级角色通过直接输入旧属地路由绕过职责限制。

省级试点、督办及履责评价本次新增；以现有山东城市和业务关联初始化，内部保留生成来源，不添加模拟/示例页面标签。备份与外部通知沿用前期边界，不发送短信/邮件，不接管车辆。

Gate1/2：以上为用户确认菜单与角色分工的实施细化，合同、状态、权限和验收已明确；允许独立任务按接口并行实现。Gate3/4：以实际API和浏览器结果记录，不以菜单存在判定功能完成。
