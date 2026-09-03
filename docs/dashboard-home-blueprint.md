# 双门户业务首页设计与数据边界

## 监管总览

1. 监管摘要：当前监管范围、运行结论、更新时间和手动刷新。
2. 六项指标：在册车辆、当前在线、当前运行、今日告警、待处置、待审批，全部可下钻。
3. 首屏工作区：实时运行态势地图（约 60%）与我的监管待办（约 40%）。
4. 研判区：七日在线趋势、当前运行状态、重点风险对象。
5. 执行区：最新告警、审批与许可。
6. 常用功能：仅展示当前账号有权限访问的入口。

## 企业运营工作台

1. 企业运营摘要：企业名称、当日运营结论、更新时间和手动刷新。
2. 六项指标：在册车辆、当前在线、今日运行、今日告警、待处理、待办申请，全部限定本企业并可下钻。
3. 首屏工作区：本企业车辆地图（约 60%）与企业待办（约 40%）。
4. 运营区：七日在线趋势、今日里程与车辆利用情况、本企业安全风险。
5. 执行区：最新告警、需要关注车辆、申请与许可、资质到期提醒。
6. 快捷入口：依据企业管理员或企业普通用户的权限动态生成。

两个首页使用独立页面结构与信息优先级；仅复用地图、图表和设计系统基础能力。

## 聚合 API

- `GET /api/dashboard/regulator`：监管摘要、指标、筛选项、地图车辆与区域、监管待办、趋势、风险、告警、审批许可和快捷入口。
- `GET /api/dashboard/enterprise`：企业摘要、指标、本企业地图车辆与区域/围栏、企业待办、趋势、风险、告警、关注车辆、申请许可、到期提醒和快捷入口。

监管接口根据登录人的 `organizationId` 及下级组织构建范围，超级管理员可查看全局。企业接口只使用 JWT 上下文中的 `enterpriseId`，不接受客户端传入其他企业 ID。首页聚合现有业务表，不建立 Dashboard 数据表。

## 当前可用业务数据

| 首页能力 | 正式数据来源 |
| --- | --- |
| 车辆与当前状态 | `Vehicle`、`VehicleRealtimeStatus` |
| 运行记录与里程 | `OperationRecord` |
| 七日在线趋势 | `VehicleOnlineDaily` |
| 告警与地图风险点 | `SafetyAlert` |
| 事故、违规、离线与应急 | `Accident`、`Violation`、`OfflineEvent`、`EmergencyTask` |
| 审批与申请 | `ApprovalTask`、`AdmissionApplication`、`ApprovalResult` |
| 牌照和企业资质 | `VehicleLicense`、`EnterpriseQualification` |
| 企业风险等级 | `EnterpriseEvaluation` 与现有安全事件聚合 |
| 运行区域与围栏 | `OperationRegion`、`ElectronicFence` |

## 当前真实数据缺口

- 没有小时级在线快照，不能真实生成“今日、昨日同期、近七日平均”的小时曲线；本轮使用正式的七日在线率。
- 没有车辆存量历史快照，不能真实计算“较上月新增”。
- 没有行政区边界几何，只展示已批准运行区域，不能伪造行政区面。
- 没有独立故障、维修工单模型；仅以离线、低电量、陈旧心跳和未关闭告警识别“需要关注车辆”。
- 没有附件对象存储服务，首页不提供伪上传入口。
- 当前 RBAC 没有独立“企业安全员”角色，企业端按现有企业管理员与企业普通用户权限生成入口和动作。

## 地图交接

```yaml
map_role: overview
base_map_strategy: muted
layers:
  - id: critical-risk
    business_meaning: 严重告警或重大风险车辆
    geometry: point
    priority: P1
    min_zoom: 8
    max_zoom: 19
    interaction: select-and-open-summary
    style_states: [default, selected, warning, error]
  - id: attention-vehicle
    business_meaning: 离线、低电量、心跳陈旧或存在未关闭告警的车辆
    geometry: point
    priority: P2
    min_zoom: 8
    max_zoom: 19
    interaction: select-and-open-summary
    style_states: [default, selected, warning]
  - id: normal-vehicle
    business_meaning: 正常在线或停驶车辆
    geometry: point
    priority: P3
    min_zoom: 11
    max_zoom: 19
    interaction: select-and-open-summary
    style_states: [default, selected]
  - id: approved-region
    business_meaning: 已批准运行区域与企业围栏
    geometry: polygon
    priority: P4
    min_zoom: 10
    max_zoom: 19
    interaction: passive-reference
    style_states: [default]
labels:
  collision_strategy: 低缩放隐藏车辆标签并使用聚合，高缩放仅展示重点与选中对象
  zoom_rules: 低于 12 级隐藏 DOM 标签，聚合图层承担概览
filters:
  dimensions: [enterprise, organization, vehicle-status]
focus_behavior: 点击待办或告警时选中并定位关联车辆；点击车辆显示紧凑概要
refresh_frequency: 手动刷新，后续可增量接入软刷新
performance_risk: 当前 30 辆；分布场景继续使用 MarkerCluster，轨迹场景保持抽样与销毁策略
```
