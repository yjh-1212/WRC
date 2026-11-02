# 无人车国家—省—市三级监管驾驶舱 Codex 开发设计说明

> 基于已整理的 `unified-geo-engine-cockpit-base` 地图引擎底座开发。
>
> 本说明只定义正式监管驾驶舱，不建设演示模式、自动巡航、自动讲解、随机数据演示或青岛示例场景。

---

## 1. 开发目标

在现有 Cesium + 高德地图空间引擎基础上，建设一套“国家 → 省 → 市”连续空间下钻的无人车监管驾驶舱。

核心体验：

```text
国家级驾驶舱
  ↓ 用户点击某省
省级驾驶舱
  ↓ 用户点击某市
市级驾驶舱
```

三级不是简单地图缩放，而是同时发生：

1. 地图相机平滑飞行；
2. 地图图层按层级卸载 / 加载；
3. 左右信息面板切换到对应监管颗粒度；
4. 地图交互对象从“省”切换到“市”，再切换到“企业 / 车辆 / 路权 / 风险”；
5. 指标和图表同步切换；
6. Breadcrumb 同步更新；
7. 返回上一级时恢复上一层视角、选中对象、Tab 和筛选条件。

正式空间层级只到“市”。企业、车辆、任务属于市级驾驶舱内部对象交互，不再形成新的驾驶舱层级。

---

## 2. 当前代码基线

清理后的代码保留以下核心能力：

- `GeoEngine`：统一地图对象和地图能力入口；
- `SceneNavigator`：镜头飞行、全览、俯视、跟随、环绕、2D/3D；
- `LayerManager`：图层统一创建、显隐和清理；
- `RegionService`：行政区边界加载；
- `BaseMapManager`：高德科技暗色、高德道路、高德卫星、OSM、自定义 XYZ；
- `AMapService`：高德 JS API 路径规划和行政区能力；
- `CoordinateService`：WGS84 / GCJ-02 / BD-09 坐标转换；
- `FlowRoute`：流光线路；
- `PulseMarker`：脉冲节点；
- `RegionBoundary`：行政区边界高亮；
- `VisualizationEffects`：热力、指标光柱、扫描波纹；
- `addObject / updateObject / trackObject`：实时车辆对象与跟随。

已经清除：

- 青岛综合交通演示数据；
- `demoNetwork.js`；
- 演示按钮、演示摘要；
- 仿真业务指标和演示路线；
- 原大屏 HUD 示例业务布局；
- `DEMO_DATA.md`、旧迁移说明；
- `.env.local` 真实凭据文件；
- “DemoEffects”命名，改为通用 `VisualizationEffects`。

后续禁止重新引入演示数据作为正式业务数据源。

---

## 3. 最高开发原则

### 3.1 一套地图引擎，三套场景

不得复制三套 Cesium 初始化代码。

建议结构：

```text
CockpitShell
├─ NationalScene
├─ ProvinceScene
└─ CityScene
```

`GeoEngine` 仍为唯一地图底座。

### 3.2 地图是核心交互区

所有驾驶舱都必须实现双向联动：

```text
地图对象点击
→ 左右面板同步

图表 / 排行点击
→ 地图选中、高亮、飞行或聚焦
```

不得出现“地图只是背景、所有功能都在列表里”的实现。

### 3.3 不做自动演示

本期明确禁止：

- 自动巡航；
- 自动国家→省→市轮播；
- 自动镜头讲解；
- 无用户操作的定时场景切换；
- 演示数据定时随机跳动；
- 为展示效果构造虚假的实时车辆数据。

所有下钻和切换均由用户操作触发。

### 3.4 数据按层级加载

国家级不加载全国单车；省级不加载全省所有单车；只有市级根据当前视口按需加载车辆。

---

# 4. 总体技术架构

建议在现有工程中新建：

```text
src/
├─ cockpit/
│  ├─ CockpitController.js
│  ├─ SceneManager.js
│  ├─ SceneStateStore.js
│  ├─ scenes/
│  │  ├─ NationalScene.js
│  │  ├─ ProvinceScene.js
│  │  └─ CityScene.js
│  ├─ layers/
│  │  ├─ AdminRegionLayer.js
│  │  ├─ RegionStatusLayer.js
│  │  ├─ FlowRelationLayer.js
│  │  ├─ EnterpriseLayer.js
│  │  ├─ VehicleLayer.js
│  │  ├─ VehicleTrackLayer.js
│  │  ├─ OperationAreaLayer.js
│  │  ├─ RoadRightLayer.js
│  │  ├─ RiskLayer.js
│  │  └─ BuildingExtrusionLayer.js
│  ├─ interactions/
│  │  ├─ MapInteractionController.js
│  │  ├─ RegionSelectionController.js
│  │  └─ ObjectSelectionController.js
│  └─ api/
│     ├─ nationalDashboardApi.js
│     ├─ provinceDashboardApi.js
│     └─ cityDashboardApi.js
└─ engine/
   └─ 保持现有 GeoEngine 核心
```

如果最终嵌入现有 Vue3 监管平台：

- `engine/` 保持框架无关；
- `cockpit/` 中业务状态可由 Pinia 接管；
- UI 使用 Vue 组件实现；
- Vue 组件不得直接操作 `viewer.entities`，统一调用 `GeoEngine / SceneManager / LayerManager`。

---

# 5. SceneManager 设计

新增 `SceneManager`，统一管理三级驾驶舱状态。

场景枚举：

```js
NATIONAL
PROVINCE
CITY
```

建议核心接口：

```js
sceneManager.enterNational(options)
sceneManager.enterProvince(region, options)
sceneManager.enterCity(region, options)
sceneManager.back()
sceneManager.selectRegion(regionId)
sceneManager.restoreState(level)
```

每个 Scene 必须实现统一生命周期：

```js
enter(context)
loadData(context)
mountLayers(context)
bindInteractions(context)
updateSelection(selection)
leave(context)
destroy()
```

场景切换顺序：

```text
锁定重复点击
→ 保存当前场景状态
→ 高亮当前选中区域
→ 执行镜头过渡
→ 卸载当前业务图层
→ 切换场景配置
→ 请求下一层聚合数据
→ 加载下一层图层
→ 刷新左右面板
→ 解锁交互
```

---

# 6. 状态缓存

为三级场景分别保存：

```text
camera
activeTab
selectedRegion
selectedObject
visibleLayers
filters
mapMode
```

例如：

```text
全国选择浙江
→ 进入浙江
→ 进入杭州
→ 返回浙江
```

返回浙江时必须恢复：

- 原浙江省地图视角；
- 当前选中的杭州市；
- 省级当前 Tab；
- 当前车辆类型筛选；
- 当前图层开关。

不得每次返回都重置为初始状态。

---

# 7. Breadcrumb 与返回机制

统一显示：

```text
全国
全国 > 浙江省
全国 > 浙江省 > 杭州市
```

交互规则：

- 点击“全国”返回国家级；
- 点击“浙江省”返回省级；
- `返回上一级` 与 Breadcrumb 保持一致；
- 国家级没有“返回上一级”；
- 下钻过程中禁止再次连续触发新的下钻。

---

# 8. 国家级驾驶舱设计

## 8.1 页面风格

参考用户提供视频：

- 科技感立体中国行政区地图；
- 深蓝 / 青蓝 HUD；
- 省域发光轮廓；
- 轻量挤出立体效果；
- 少量光柱、脉冲点、飞线；
- 三栏布局；
- 中央地图保持最大面积。

不得使用“华东、华南、华北”等大区分组作为主分析维度。

## 8.2 三栏布局

### 左栏

#### A. 全国运行总览

建议 6 项：

- 备案车辆；
- 当前活跃车辆；
- 接入省份；
- 接入城市；
- 活跃率；
- 运营企业。

#### B. 重点省域排行 TOP5

字段：

```text
省份 | 备案车辆 | 活跃率 | 风险状态
```

列表与地图选择双向联动。

#### C. 车辆类型结构

五类：

- 配送；
- 环卫；
- 巡逻；
- 零售；
- 接驳。

点击某类型后地图、排行、右侧风险均按该类型过滤。

### 中栏：全国地图

地图主要表达：

- 中国省域边界；
- 省域状态填色；
- 重点省份标签；
- 重点省份脉冲 / 光柱；
- 全国关系飞线（仅业务确有关系数据时显示）；
- 风险事件聚合标记。

交互：

- Hover 省份：轮廓增强 + Tooltip；
- Click 省份：选中省域 + 联动左右；
- DoubleClick 或 Tooltip 中“进入省级”按钮：执行国家→省下钻；
- 不建议单击即下钻，避免用户无法查看联动信息。

### 右栏

#### A. 全国安全态势

- 风险事件；
- 高风险省份；
- 重大事件；
- 未闭环重大事件；
- 重点监管企业；
- 运行异常省份。

#### B. 重点监管对象

Tab：

```text
重点省域 | 重点企业
```

#### C. 当前联动详情

当选中浙江时显示：

- 浙江备案车辆；
- 活跃率；
- 重点企业数；
- 风险事件；
- 数据质量；
- 近期监管要情。

---

# 9. 国家级地图效果

建议保留：

1. 省域边界发光；
2. 省域轻量挤出；
3. Hover 外轮廓增强；
4. Selected 省份轻微抬升 / 亮度增强；
5. 重点省份脉冲；
6. 风险状态分色；
7. 有真实业务关系时显示流光飞线；
8. 下钻时相机缓动飞行。

不要：

- 全国车辆 Marker；
- 大量粒子覆盖地图；
- 无业务含义的飞线；
- 不停旋转的地球；
- 自动动画巡航。

---

# 10. 省级驾驶舱设计

## 10.1 页面风格

同样参考视频的行政区立体地图风格，但监管对象切换为地市。

中央重点：

- 省域发光轮廓；
- 地市边界；
- 地市轻量挤出；
- 地市状态色；
- 地市标签；
- 重点企业聚合；
- 风险事件聚合。

## 10.2 三栏布局

### 左栏

#### A. 全省运行总览

- 备案车辆；
- 当前在线；
- 当前运行；
- 在线率；
- 运营企业；
- 今日里程。

#### B. 地市运行排行

```text
地市 | 备案车辆 | 在线率 | 风险状态
```

#### C. 车辆类型分布

五类车辆结构，与地图筛选联动。

### 中栏：省域地图

- 地市边界；
- 地市聚合标签；
- 重点企业聚合点；
- 风险聚合；
- 真实业务需要时显示跨市关系线。

交互：

- Hover 地市：强化边界；
- Click 地市：只选中并联动；
- DoubleClick 或 Tooltip “进入市级”：执行省→市下钻。

### 右栏

#### A. 全省风险态势

- 风险事件；
- 高风险地市；
- 重大事件；
- 未闭环重大事件；
- 数据异常地市；
- 重点监管企业。

#### B. 重点监管对象

```text
重点地市 | 重点企业
```

#### C. 当前联动详情

选中杭州后显示：

- 备案车辆；
- 在线率；
- 企业数量；
- 风险事件；
- 数据质量；
- 近期关注事项。

---

# 11. 市级驾驶舱设计

## 11.1 页面风格

参考用户上传的“青岛市南区水环境监测数据平台可视化”图片：

- 城市 2.5D / 3D 空间感；
- 地图占中心最大面积；
- 建筑块、道路、园区形成城市空间；
- 监管点位使用立柱、光圈、扫描、标签；
- 左右图表半透明叠加在地图之上；
- 三栏布局但中央城市空间感明显更强。

当前项目不恢复倾斜摄影 / 3D Tiles 体系。

城市建筑建议采用：

- 建筑 footprint 矢量数据；
- Cesium Polygon extrusion；
- 分高度挤出；
- 深蓝建筑材质；
- 重点建筑轻微发光；
- 道路使用矢量光带。

## 11.2 三栏布局

### 左栏

#### A. 运行总体态势

- 在册车辆；
- 当前在线；
- 当前运行；
- 在线率；
- 运营企业；
- 今日里程。

#### B. 企业运行态势

```text
企业 | 在线车辆 | 在线率 | 风险状态
```

#### C. 辖区车辆 / 运行区域分布

根据当前业务最终确定为区县分布或重点区域分布。

### 中栏：城市数字孪生监管地图

加载：

- 建筑；
- 道路；
- 企业；
- 车辆；
- 路权区域；
- 运行区域；
- 风险区域；
- 当前任务路线；
- 事故 / 告警点。

### 右栏

#### A. 当前风险态势

- 今日告警；
- 严重告警；
- 未处置；
- 事故；
- 违规；
- 离线异常。

#### B. 重点监管对象

```text
重点企业 | 重点车辆
```

#### C. 当前联动详情

根据地图选中对象自动切换：

- 企业详情；
- 车辆详情；
- 运行区域详情；
- 风险事件详情。

---

# 12. 市级地图交互

## 12.1 企业

点击企业：

```text
企业点高亮
→ 镜头轻微聚焦
→ 本企业车辆高亮
→ 其他企业弱化
→ 两侧图表过滤为该企业
→ 右侧联动详情显示企业状态
```

## 12.2 车辆

点击车辆：

```text
车辆高亮
→ 当前路线高亮
→ 当前任务起终点出现
→ 右侧显示车辆详情
```

允许用户手动选择：

- 跟随；
- 历史轨迹；
- 轨迹回放；
- 取消跟随。

不得自动进入跟随。

## 12.3 路权 / 运行区域

点击 Polygon：

- 区域高亮；
- 显示名称、类型、有效期；
- 统计区域内车辆；
- 展示越界 / 风险数量。

## 12.4 风险事件

点击风险点：

- 脉冲增强；
- 相机适当聚焦；
- 显示事件类型、车辆、企业、时间、状态；
- 同时高亮关联车辆。

---

# 13. 地图视觉效果与现有引擎映射

| 目标效果 | 现有能力 / 新增方式 |
|---|---|
| 行政区发光边界 | `RegionBoundary` 扩展 |
| 流光路线 | `FlowRoute` |
| 脉冲节点 | `PulseMarker` |
| 扫描波纹 | `VisualizationEffects.addScanMarker` |
| 热力区域 | `addHeatSpot`，后续可升级真正 Heatmap |
| 指标光柱 | `addValueColumn` |
| 车辆对象 | `GeoEngine.addObject` |
| 车辆跟随 | `trackObject` |
| 相机飞行 | `SceneNavigator.navigate` / `GeoEngine.flyTo` |
| 区域轻量抬升 | 新增 `RegionExtrusionLayer` |
| 城市建筑挤出 | 新增 `BuildingExtrusionLayer` |
| 道路光带 | 基于 `FlowRoute` 新增 RoadGlow 材质或单独图层 |
| 选中描边 | 新增 SelectionStyle 管理 |
| Tooltip | UI Overlay + Cesium worldToWindowCoordinates |

---

# 14. RegionBoundary 必须升级

当前 `RegionBoundary` 更适合“单一区域边界高亮”。

三级驾驶舱需要支持：

```text
一批省份 / 一批地市同时加载
每个区域有自己的业务 ID
支持 hover
支持 selected
支持 riskLevel
支持填色
支持 extrusionHeight
```

建议新增：

```js
AdminRegionLayer.loadRegions(regions)
AdminRegionLayer.setHover(regionId)
AdminRegionLayer.setSelected(regionId)
AdminRegionLayer.setRisk(regionId, riskLevel)
AdminRegionLayer.clearSelection()
```

每个行政区 Entity / Primitive 必须保存：

```js
{
  featureType: 'admin-region',
  level: 'province' | 'city',
  regionCode,
  regionName,
  businessData
}
```

便于 `scene.pick()` 后准确识别。

---

# 15. 地图与 UI 联动事件总线

不要让 Vue 面板直接互相引用。

建议统一事件：

```text
MAP_REGION_HOVER
MAP_REGION_SELECT
MAP_OBJECT_SELECT
TABLE_REGION_SELECT
FILTER_CHANGE
SCENE_DRILL_DOWN
SCENE_GO_BACK
LAYER_VISIBILITY_CHANGE
VEHICLE_TRACK_START
VEHICLE_TRACK_STOP
```

联动例子：

```text
用户点击“重点省域排行-浙江省”
→ TABLE_REGION_SELECT(330000)
→ NationalScene.setSelectedRegion(330000)
→ 地图高亮浙江
→ 相机轻微聚焦
→ 右侧刷新浙江联动详情
```

---

# 16. 下钻交互规范

## 16.1 国家 → 省

推荐：

```text
单击省份 = 选中 / 联动
双击省份 或 点击 Tooltip“进入省级” = 下钻
```

动画：

1. 省域轮廓增强；
2. 选中省份亮度提高；
3. 300ms 选中反馈；
4. 镜头飞入 1.2~1.6s；
5. 国家图层淡出；
6. 省级地市图层渐入；
7. 左右面板 250~400ms 过渡。

## 16.2 省 → 市

同上：

```text
单击地市 = 选中 / 联动
双击地市 或 Tooltip“进入市级” = 下钻
```

镜头进入城市后：

- 行政区抽象地图淡出；
- 道路、建筑、企业、车辆图层逐步加载；
- 相机 pitch 从省级约 -65~-75° 过渡到城市约 -35~-55°。

---

# 17. 顶部 Tab

不同层级 Tab 不共用。

## 国家级

```text
全国态势 | 省域监管 | 安全态势 | 行业发展
```

## 省级

```text
综合态势 | 地市监管 | 风险监测
```

## 市级

建议：

```text
综合态势 | 运行监管 | 风险监管
```

Tab 切换只改变当前 Scene 的图层、数据和面板，不改变空间层级。

---

# 18. 图层控制策略

统一图层定义建议：

```text
admin        行政区
roads        道路
routes       路线
nodes        节点
labels       标签
enterprises  企业
vehicles     车辆
tracks       轨迹
road-rights  路权
operation    运行区域
risks        风险
heat         热力
columns      光柱
scans        扫描
buildings    建筑
```

国家：

```text
admin / labels / risk / columns / routes(按需)
```

省：

```text
admin / labels / enterprises(聚合) / risk / routes(按需)
```

市：

```text
roads / buildings / enterprises / vehicles / tracks / road-rights / operation / risks
```

---

# 19. 数据接口设计

必须使用真实后端 API，不在前端 hardcode 驾驶舱核心业务数据。

## 19.1 国家级

```http
GET /api/cockpit/national/summary
GET /api/cockpit/national/provinces
GET /api/cockpit/national/vehicle-types
GET /api/cockpit/national/risks
GET /api/cockpit/national/key-objects
GET /api/cockpit/national/region/:provinceCode
```

## 19.2 省级

```http
GET /api/cockpit/province/:provinceCode/summary
GET /api/cockpit/province/:provinceCode/cities
GET /api/cockpit/province/:provinceCode/vehicle-types
GET /api/cockpit/province/:provinceCode/risks
GET /api/cockpit/province/:provinceCode/key-objects
GET /api/cockpit/province/:provinceCode/city/:cityCode
```

## 19.3 市级

```http
GET /api/cockpit/city/:cityCode/summary
GET /api/cockpit/city/:cityCode/enterprises
GET /api/cockpit/city/:cityCode/districts
GET /api/cockpit/city/:cityCode/risks
GET /api/cockpit/city/:cityCode/operation-areas
GET /api/cockpit/city/:cityCode/road-rights
GET /api/cockpit/city/:cityCode/vehicles?bbox=...
GET /api/cockpit/vehicle/:vehicleId/status
GET /api/cockpit/vehicle/:vehicleId/track
```

车辆接口必须支持 bbox / viewport 按视口加载。

---

# 20. 刷新频率

## 国家 / 省

聚合态势：

- 30s~60s 更新实时聚合项；
- 基础规模 1~5 分钟缓存；
- 不接单车 1Hz 推送。

## 市

- 车辆实时位置可使用 WebSocket / SSE；
- 只推送当前市级、当前视口、当前筛选范围车辆；
- 图表指标 10~30s 聚合刷新；
- 车辆详情按需订阅。

---

# 21. 城市建筑与道路实现约束

本期继续遵循：**不使用倾斜摄影 3D Tiles**。

市级参考图的三维城市效果建议通过：

1. 深色高德底图；
2. 建筑 footprint GeoJSON；
3. Polygon extrusion；
4. 道路矢量发光；
5. 重点区域 Polygon；
6. 少量车辆 GLB；
7. 轨迹 / 路线流光；
8. 监管点位扫描和标签。

重点是“空间层次 + 业务可视化”，不是追求真实照片级城市。

---

# 22. 性能要求

## 国家

- 行政区对象数量控制为省级；
- 禁止加载全国车辆；
- 标签控制数量；
- 飞线仅加载业务需要部分。

## 省

- 默认只加载地市聚合；
- 企业使用聚合 / 重点企业；
- 不加载全部车辆。

## 市

- 车辆视口加载；
- 车辆聚合 / LOD；
- 地图移动结束后再发 bbox 查询；
- 建筑按瓦片 / 区域分块；
- 轨迹按选中对象加载；
- 避免一次加载全市历史轨迹。

目标：

- 页面达到可交互状态 ≤ 3s（正常内网条件）；
- 场景切换动画过程中不出现明显白屏；
- 常规操作保持 30fps 以上，推荐 45~60fps。

---

# 23. UI 设计约束

三级统一：

- 1920×1080 为设计基准；
- 适配 2560×1440；
- 深蓝透明 HUD；
- 细线科技边框；
- 青蓝为主色；
- 绿色正常；
- 黄色 / 橙色关注预警；
- 红色高风险；
- 图表使用 ECharts；
- 不使用大面积实心卡片遮住地图。

三栏宽度建议：

```text
左栏 22%~25%
中央 50%~56%
右栏 22%~25%
```

市级中央可扩大到 56%~60%，让城市三维场景更突出。

---

# 24. Codex 开发顺序

## Phase 0：只检查，不重构引擎

Codex 先完整阅读：

- `GeoEngine.js`
- `SceneNavigator.js`
- `LayerManager.js`
- `RegionService.js`
- `AMapService.js`
- `effects/*`

不得直接替换现有 Cesium + AMap 方案。

## Phase 1：三级 Scene 框架

完成：

- `SceneManager`
- `SceneStateStore`
- Breadcrumb
- National / Province / City 空 Scene
- 返回逻辑
- 场景切换动画框架

先确认：

```text
全国 → 浙江省 → 杭州市 → 返回浙江 → 返回全国
```

镜头和状态切换正常。

## Phase 2：国家级

完成：

- 省域行政图层；
- 省域选中 / Hover；
- 三栏 HUD；
- 全国运行总览；
- 重点省域排行；
- 车辆类型；
- 安全态势；
- 重点监管对象；
- 当前联动详情；
- 省域双击 / 按钮下钻。

## Phase 3：省级

以浙江为首个完整实例：

- 浙江11地市；
- 地市边界；
- 地市状态；
- 三栏 HUD；
- 地图 / 表格双向联动；
- 杭州下钻。

## Phase 4：市级

先完成杭州：

- 城市底图；
- 建筑挤出；
- 道路光带；
- 企业；
- 车辆；
- 运行区域；
- 路权；
- 风险；
- 轨迹；
- 跟随；
- 回放；
- 三栏 HUD。

## Phase 5：真实 API

逐步替换接口占位数据。

生产页面不得保留 Mock fallback 冒充真实数据。

---

# 25. 验收重点

## 国家级

- 中国省域正确加载；
- 省份可 Hover / Click；
- 点击省份两侧联动；
- 单击不自动下钻；
- 指定操作能下钻省级；
- 国家级不加载车辆；
- 车辆类型筛选有效。

## 省级

- 浙江11地市正确；
- 地市可 Hover / Click；
- 排行与地图双向联动；
- 指定操作可下钻杭州；
- 省级不加载全省车辆。

## 市级

- 城市场景具有明显 2.5D / 3D 空间层次；
- 企业、车辆、区域、风险均可交互；
- 车辆跟随必须由用户主动触发；
- 轨迹回放可暂停 / 继续 / 退出；
- 车辆 / 图表 / 地图联动正确。

## 返回

- 杭州 → 浙江 → 全国返回链路正常；
- 状态恢复正确；
- 无重复图层残留；
- 无重复事件监听；
- 无相机锁死。

---

# 26. 明确禁止事项

1. 禁止重新加入青岛 demo。
2. 禁止自动巡航、自动演示和无人操作自动下钻。
3. 禁止三套页面复制三套 Cesium 初始化代码。
4. 禁止业务组件直接调用 `viewer.entities.add()`。
5. 禁止国家级加载全国单车。
6. 禁止省级加载全省单车。
7. 禁止为“大气”添加无业务含义的大量飞线。
8. 禁止恢复倾斜摄影 3D Tiles 作为本期依赖。
9. 禁止在前端写死正式监管指标。
10. 禁止通过随机数模拟“实时生产数据”。
11. 禁止单击行政区立即下钻，必须保留地图联动查看能力。
12. 禁止场景切换后残留上一层实体、监听器或定时器。

---

# 27. Codex 总提示词

可直接将以下内容放在 Codex 任务开头：

> 当前仓库是已经清理后的 Cesium + AMap 无人车监管空间引擎底座。不要重写 GeoEngine，不要更换地图技术路线，不要恢复任何 demo 数据或自动演示功能。在现有 GeoEngine、SceneNavigator、LayerManager、RegionService、AMapService 和 effects 能力上增量建设“国家 → 省 → 市”三级监管驾驶舱。
>
> 国家和省采用科技感行政区立体大屏风格，市级采用城市 2.5D/3D 数字孪生监管风格。三级统一采用三栏布局，并实现地图与左右图表的双向联动。国家层按省聚合、省层按地市聚合、市层才加载企业、车辆、轨迹、路权、运行区域和风险。
>
> 下钻必须由用户主动操作触发：单击行政区只进行选中和联动；双击或 Tooltip 中“进入”操作才执行下钻。建立统一 SceneManager 和 SceneStateStore，支持全国→浙江→杭州以及返回时的相机、Tab、筛选和选中状态恢复。正式空间层级只到市，企业和车辆是市级内部对象交互。
>
> 首先只完成场景框架和全国→浙江→杭州的真实地图切换，不急于堆业务面板。每阶段完成后实际运行页面、检查 Cesium 图层释放、相机状态、事件监听、地图交互和性能，再进入下一阶段。

