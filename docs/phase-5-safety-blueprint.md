# Phase 5 安全监管蓝图

## 范围与决策

Phase 5 在现有 Vue 3、NestJS、Prisma 与高德地图架构上增量实现，不替换前四阶段能力。安全事件采用“统一告警入口 + 专项业务证据链”的模型：主动上报、车辆规则、电子围栏和离线规则都进入 `SafetyAlert`；事故、违规、离线事件和应急任务分别保留自己的事实、责任和处置记录。

`ElectronicFence` 与 Phase 4 的 `OperationRegion` 分离。运行区域描述获准运营边界，电子围栏描述实时安全规则（禁行、限速、运营、临时管制）；同一坐标可同时参与两类判断，但二者的生命周期与权限不混用。

## 角色与数据范围

| 角色 | 核心能力 | 服务端数据范围 |
| --- | --- | --- |
| 超级/监管管理员 | 全部查询、围栏维护、事故处理、违规认定、离线扫描、应急派发与复核 | 全局或组织树范围 |
| 监管工作人员 | 日常确认、调查、整改复核和应急处置 | 所属组织及下级组织 |
| 企业管理员 | 主动上报、告警处理、事故上报、整改反馈、离线跟进、应急响应 | 强制追加本企业 `enterpriseId` |
| 企业普通用户 | 查询与安全事件/事故上报 | 强制追加本企业 `enterpriseId` |

所有写操作先校验对象是否落在当前账号的数据范围中，不能依赖前端隐藏按钮实现权限。

## 状态机

- 告警：`PENDING_CONFIRMATION → PENDING_HANDLING → IN_PROGRESS → PENDING_REVIEW → CLOSED`，关闭后可按权限重新打开。
- 事故：`REPORTED → ACCEPTED → INVESTIGATING → RESPONSIBILITY_DETERMINED → PROCESSING → CLOSED → ARCHIVED`。
- 违规：`PENDING_DETERMINATION → CONFIRMED → RECTIFYING → PENDING_REVIEW → CLOSED`，复核可退回整改。
- 离线：`OFFLINE → INVESTIGATING → RECOVERED`；遥测恢复时系统自动解除离线状态并保留恢复说明。
- 应急：`PENDING_DISPATCH → WAITING_RESPONSE → IN_PROGRESS → PENDING_REVIEW → CLOSED`，监管复核可退回继续处置。

## 自动规则

遥测写入后复用同一次数据处理：禁行区内、限速区超速、驶出运营区或进入临时管制区时创建围栏触发记录与统一告警；车辆回到合规状态时恢复触发记录。离线扫描以 10 分钟无心跳作为默认阈值，创建离线事件与统一告警；下一次有效遥测会更新离线事件为已恢复。

## 页面与交互

- 告警中心：状态指标、搜索筛选、表格、批量确认、详情抽屉、主动上报与一键生成应急任务。
- 电子围栏：高德地图主视图、围栏列表与规则详情；编辑器通过 MouseTool 真实绘制多边形。
- 事故管理：上报、受理、调查、责任认定、处置、结案与归档，详情复用 Phase 4 轨迹。
- 违规管理/整改反馈：监管认定并要求整改，企业提交反馈，监管通过或退回。
- 离线监管：离线扫描、原因核实、跟进和恢复确认。
- 应急处置：分级派发、企业响应、现场/远程反馈、监管评价与全过程日志。

## 数据模型与接口

新增 `SafetyAlert`、`ElectronicFence`、`ElectronicFenceVehicle`、`FenceTrigger`、`Accident`、`Violation`、`OfflineEvent`、`EmergencyTask`、`EmergencyTaskLog`。接口统一位于 `/api/safety`，按告警、围栏、事故、违规、离线和应急六组资源组织；查询返回分页数据，动作接口只接受当前状态允许的 action。

## 验收门槛

1. Prisma schema 可验证，增量迁移可应用且 Seed 可重复执行。
2. API 与 Web TypeScript 生产构建通过。
3. 监管端七类页面可访问，高德围栏图层可见，抽屉/筛选/状态操作可用。
4. 企业端只能看到本企业数据，且不出现电子围栏与全局离线扫描入口。
5. 390px 视口无页面级横向滚动，错误、空状态、加载态和减少动态效果偏好均有处理。
