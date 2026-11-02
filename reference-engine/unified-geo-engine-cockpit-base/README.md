# Unified Geo Engine · 无人车监管空间引擎底座

这是从现有 Cesium + 高德地图引擎整理出的**纯空间能力底座**，用于后续建设“国家 → 省 → 市”三级无人车监管驾驶舱。

## 本次整理原则

已移除与后续正式驾驶舱无关的内容：

- 青岛综合交通演示数据与演示入口。
- 仿真业务指标、演示路线和演示说明文件。
- 旧 HUD 业务面板和演示场景按钮。
- 本地 `.env.local`（避免真实 Key / 安全密钥随包分发）。
- 旧项目迁移说明等非开发必要文档。

保留并继续作为核心能力：

- CesiumJS 主地图引擎。
- 全球 / 中国 / 省 / 市镜头导航能力。
- 高德科技暗色 / 道路 / 卫星底图。
- 高德 JS API 路径规划能力。
- WGS84 / GCJ-02 / BD-09 坐标转换。
- 行政区边界加载与高亮。
- 流光路线、脉冲节点、热力、指标光柱、扫描波纹。
- 实时对象、对象跟随、相机环绕、俯视、2D/3D。
- 图层统一管理。

## 启动

```bash
npm install
npm run dev
```

默认开发地址由 Vite 输出。

## 高德配置

复制 `.env.example` 为 `.env.local`，填写：

```env
VITE_AMAP_KEY=
VITE_AMAP_SECURITY_CODE=
VITE_CUSTOM_XYZ_URL=
```

真实 Key / 安全密钥不要提交到公开仓库。

## 目录

```text
src/
├─ config/
│  └─ regions.js
├─ engine/
│  ├─ GeoEngine.js
│  ├─ BaseMapManager.js
│  ├─ CoordinateService.js
│  ├─ AMapService.js
│  ├─ LayerManager.js
│  ├─ RegionService.js
│  ├─ SceneNavigator.js
│  ├─ effects/
│  │  ├─ FlowRoute.js
│  │  ├─ PulseMarker.js
│  │  ├─ RegionBoundary.js
│  │  └─ VisualizationEffects.js
│  └─ providers/
│     └─ GCJ02WebMercatorTilingScheme.js
├─ ui/
│  └─ styles.css
└─ main.js
```

## 后续开发原则

后续驾驶舱业务层不要直接调用 `viewer.entities.add()`，统一通过 `GeoEngine` / `LayerManager` 管理地图对象，避免国家、省、市三套场景各自形成一套不可维护的 Cesium 代码。

本仓库当前只保留**引擎底座与开发调试壳**；国家、省、市驾驶舱的 HUD、图表、业务数据和场景配置应在下一阶段按《Codex 开发设计说明》实现。
