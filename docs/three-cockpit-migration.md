# 三级监管驾驶舱 Three.js + 高德地图实施说明

更新日期：2026-09-27。

## 本次验证结果

2026-09-27 已通过项目 Playwright 启动本机 Google Chrome（非无头）完成两组验收：

- `three-cockpit-migration.cjs`：全国/省级各五种专题、市级三种地图视图、真实 API 车辆筛选、全国和省级双击下钻、排行联动、返回状态恢复，以及 1920×1080、2560×1440、3840×2160 布局。国家与省级为铺开式 Three.js，市级为高德；无 Cesium 请求和浏览器应用错误。
- `amap-city-workflows.cjs`：使用数据库现有 348 辆车与一辆车的 68 个历史轨迹点，验证区县→运营公司→无人车、三维车模、围栏显隐、跟随、按记录时间回放、1×/64×速度、暂停、定位进度及退出。无地图请求失败或浏览器应用错误。
- 地理投影、孔洞、小岛、跨区 UV、平面背景裁剪和程序纹理共 16 项单测通过；Vue TypeScript 检查、Vite 生产构建通过。

截图保存在 `test-results/three-cockpit-migration` 和 `test-results/amap-city-workflows`。其中 `failure.png` 是修复前的故障留证，正式截图为各具名场景文件。以上测试不等同于生产并发、长期运行或目标硬件帧率验收；现有演示数据上报日期保留，未伪装为实时数据。

本说明对应全国/省级 Three.js、市级高德地图的实现方案。需求依据为《功能型无人车三级监管驾驶舱_需求规格说明书_V1.0.docx》，技术选型按用户最新要求调整；地图效果参考 `docs/demo`，市级导航和层级功能参考 `D:/项目资料/Code/Wurenche_v0.3.zip`。原有 Cesium 实施指引、参考工程和压缩包作为历史资料保留，不作为当前驾驶舱运行方案。

## 1. 技术方案

全国、省级驾驶舱使用 Vue 3 + Three.js，市级驾驶舱使用高德 AMap JSAPI 2.0。Three.js 运行依赖为 `three@0.183.2`，类型包为 `@types/three@0.183.1`；高德复用项目现有 `@amap/amap-jsapi-loader` 及统一加载器。Cesium 引擎源码、类型声明、依赖、Vite 插件和专属样式已移除。旧 NASA 地球纹理已删除。

| 范围 | 地理表达 | 业务叠加与交互 |
| --- | --- | --- |
| 全国 | 铺开式 Mercator 地图、跨省连续 UV 纹理、0.95 场景单位薄挤出、同投影周边地理背景 | 区域色阶、光柱、风险点、示意关联飞线、边界流光；双击进入已接入省份，无选中详情卡 |
| 省级 | 铺开式市级行政区、1.5 场景单位薄挤出、统一装饰纹理和周边省份背景 | 区域排行联动、风险与质量专题、双击进入已接入城市，无选中详情卡 |
| 市级 | 高德 JSAPI 道路底图、GCJ-02 坐标和原生地图覆盖物 | 复用 v0.3 的当前层级和地图视图导航；区县→运营公司→车辆逐层显示；单车层加载 `model` 目录对应的 OBJ/MTL 三维车模，并提供运营区/围栏、准行道路、轨迹和跟随 |

全国、省级保留综合态势、区域对比、风险监管、车辆结构、数据质量五种专题。市级顶部使用后端 `mapModes` 返回的综合态势、企业分布、运行区域视图；不同下钻层级按接口提供的选项变化。市级面板直接使用数据库统计的企业排行、车辆状态、订单和历史轨迹；区县聚合点由所属车辆的数据库定位计算，不再使用预设区县中心点。返回上一级恢复该级筛选和选中状态；相机记忆由渲染引擎维护。

全国和省级地图均铺开显示，不创建地球球体。周边地理背景与前景共享 Mercator 投影，薄挤出只表达行政区层次，不表示真实海拔。

地图图片、边界与业务数值分开加载。行政区 GeoJSON 的地理覆盖范围不代表相应地区已经接入业务明细。

## 2. 源码入口

| 文件 | 职责 |
| --- | --- |
| `apps/web/src/views/CockpitView.vue` | 数据请求、三级范围、专题与车辆类型筛选、选中详情和面板联动 |
| `apps/web/src/components/CockpitGeoMap.vue` | 按级别选择 Three.js / 高德引擎，管理生命周期、标注、工具条、图层和轨迹控制 |
| `apps/web/src/three-map/ThreeCockpitEngine.js` | 全国/省级场景、相机、拾取、选择高亮、行政区网格、渲染循环和资源释放 |
| `apps/web/src/three-map/geography.js` | GeoJSON 缓存、Mercator 投影、统一 UV、带孔多边形拉伸和边界线 |
| `apps/web/src/three-map/MapEffects.js` | 侧面扫光、光柱、风险点、示意飞线与边界流光 |
| `apps/web/src/three-map/PlanarBackdrop.js` | 同投影平面周边地理背景、范围裁剪、渐隐海陆和网格 |
| `apps/web/src/three-map/ProvinceTexture.js` | 本地程序生成省级低对比、可平铺的等高线风格装饰纹理 |
| `apps/web/src/cockpit-map/AmapCityEngine.js` | 高德市级地图、区县/企业/车辆分层、道路、风险、轨迹及三维车模图层 |
| `apps/web/src/amap.ts` | AMap JSAPI 2.0 统一加载、安全配置与按需插件加载 |
| `apps/web/src/components/CockpitPanels.vue` | 指标、结构、趋势、排行、风险和数据质量面板 |
| `apps/web/src/components/CockpitCityPanels.vue` | 市级运行总览、运营公司排行、车辆属性、订单任务与历史轨迹面板 |
| `apps/web/src/components/CockpitTrend.vue` | 可交互趋势图 |
| `apps/web/src/cockpit/scene-state.ts` | 分级筛选、专题、指标与选择记忆 |
| `apps/web/src/cockpit/visual-settings.ts` | 视觉设置、性能模式、减少动态偏好与数据时效判断 |
| `apps/api/src/dashboard/three-level-cockpit.service.ts` | 国家/省/市汇总和接入范围 |
| `apps/api/src/dashboard/cockpit.service.ts` | 城市、区县、企业、车辆运行明细 |

`cockpit/cartography.js` 与 `cockpit/coordinates.js` 为保留下来的独立地理工具，不依赖渲染引擎。

## 3. 参考资源出处与许可核查

### ThreeMap

原始资料：`docs/demo/threemap-main.zip`。

当前 `apps/web/public/map/threemap` 共 44 个文件，合计 13,083,502 字节。已将每个文件与压缩包对应条目进行 SHA-256 比对，44 个均一致，未修改源图片或 GeoJSON。

| 本地目录 | 数量与内容 | 压缩包原始目录 |
| --- | --- | --- |
| `geojson/` | 37 个 JSON：全国省界、国界、世界轮廓、34 个省级行政区文件 | `threemap-main/src/assets/geoJson/` |
| `textures/` | `china_tintable_hc.png`、`china_tintable.png` | `threemap-main/src/assets/images/` |
| `effects/` | `point.png`、`arrow.png`、`map-wall.png`、`foundation.png`、`default_light.png` | `threemap-main/src/assets/images/` |

当前运行实际请求全国/当前省份/世界 GeoJSON、全国高对比纹理及 `point.png`。世界 GeoJSON 用于铺开式周边地理背景。普通纹理作为加载失败时的备选；其余效果图片保留供效果扩展使用，不代表已经全部启用。

省级表面的纹理由 `ProvinceTexture.js` 在本地程序生成，未另行下载或复制参考项目图片。它使用低对比、可平铺的等高线风格装饰图案，**不是地形测绘数据，不代表真实高程、地形坡度或地貌**。全省各市共享同一 UV 范围；程序纹理不包含在上述 44 个原始参考资源中。

该压缩包 README 标注 MIT，并链接 `LICENSE`，但包内未找到独立 `LICENSE`、`COPYING` 或 `NOTICE` 文件。由此只能确认“README 声明 MIT”，尚不能确认随包附带了完整授权文本、版权署名以及各地图和纹理资源的单独授权。公开分发前应向参考项目提供方补齐上述材料；本说明不将资源授权状态写成已全部核清。

### sc-datav

原始资料：`docs/demo/sc-datav-main.zip`。效果参考包括侧面扫光、悬停抬升、轮廓流光和飞线。其 React / React Three Fiber 工程没有作为本项目运行依赖引入；当前 44 个本地地图资源均来自 ThreeMap 压缩包。

压缩包根目录存在 `sc-datav-main/LICENSE`，内容为 Apache License 2.0；未发现单独的 `NOTICE` 文件。若后续直接移植或再分发其中代码/资源，应随交付保留适用的授权文本、原有署名和修改说明。

资料包校验值：

```text
threemap-main.zip
F2585AFE59E9B4AAEA6A8429EE08A9612932570DC3EA47D099E9D7DE7E77C2DB

sc-datav-main.zip
992F235D908631D8270AA4F80C620118646757B4F7BA50933067B172888A31C4
```

## 4. 市级高德地图配置

在 `apps/web/.env.local` 中设置，下次启动开发服务器或重新构建时生效：

```dotenv
# 高德控制台申请的 Web 端（JS API）Key。
VITE_AMAP_KEY="your-web-jsapi-key"

# 本地开发使用安全密钥。
VITE_AMAP_SECURITY_JS_CODE="your-security-js-code"

# 正式部署可改用已配置好的安全代理地址；配置后优先于安全密钥。
VITE_AMAP_SERVICE_HOST=""
```

`apps/web/src/amap.ts` 要求同时具备 Key 和一种安全配置：`VITE_AMAP_SECURITY_JS_CODE` 或 `VITE_AMAP_SERVICE_HOST`。加载器先设置 `window._AMapSecurityConfig`，再加载 JSAPI 2.0，具体地图按需加载插件。安全代理的部署和转发规则需要与高德控制台应用配置匹配。

城市车辆、监管区域和高德底图使用 GCJ-02 坐标。接入 WGS84 数据时应明确转换边界，避免重复偏移。`VITE_` 变量会进入浏览器构建产物；正式部署应使用安全代理管理需要保密的凭据。上线前核对高德应用的域名、服务配额与使用授权，保留地图规定的版权和署名信息。

缺少配置或 JSAPI 加载失败应显示明确的地图错误状态。全国/省级本地地图加载成功不能代替市级高德服务验证；浏览器验收需能访问已配置的高德服务。地图切换、返回和页面卸载时应销毁市级地图及事件监听。

## 5. 数据范围与指标口径

驾驶舱读取现有业务 API，没有为面板生成随机业务数值：

- `GET /api/dashboard/regulator/cockpit/scene?level=...&regionCode=...&vehicleType=...`：三级汇总、区域排行、风险、类型结构和趋势。
- `GET /api/dashboard/regulator/cockpit?level=...&mapMode=...&vehicleType=...`：城市、区县、企业和车辆运行明细，可附带组织、企业和车辆 ID。

全国及部分省市汇总中包含现有数据库的演示快照，页面按 API 返回显示数据源和报送时间。城市明细取自现有业务库，不应将所有页面数值描述为实时实车数据。

当前可下钻业务链为 **全国 → 浙江省（330000）→ 杭州市（330100）→ 区县/企业/车辆**。其他省份可显示已报送汇总和地理边界；`connected` 为 false 时不进入不存在的下一级明细。静态资源已覆盖其他省份，不代表后台明细接入已经完成。

`processingEvents`（处置中）与 `completionRate`（处置完成率）目前没有对应的真实业务 API 字段。面板显示 `—`，不根据风险总数、待处置数或数据完整率进行推算。历史趋势缺报保留空值，历史在线状态与实时车辆状态分别表达。

全国和省级的关联飞线为视觉示意关系，页面标明“示意”，不作为实际跨区域车流或运输量使用。

## 6. 启动与测试

使用现有根目录 `.env`、SQLite 数据库和已生成的 Prisma 客户端。验证迁移不需要重新执行会重置数据的 seed。

以下 PowerShell 命令分别在工作区根目录的独立终端执行；端口可按本地占用情况修改。

```powershell
# 终端 1：API
$env:PORT='8081'
pnpm --filter api dev

# 终端 2：Web
$env:API_PROXY_TARGET='http://127.0.0.1:8081'
pnpm --filter web dev --port 5174 --strictPort
```

健康检查为 `http://127.0.0.1:8081/api/health`，驾驶舱为 `http://127.0.0.1:5174/regulatory/cockpit`。浏览器通过 Vite 的同源 `/api` 代理访问 API。

```powershell
# 生产构建，同时清理并重建 apps/web/dist
pnpm --filter web build

# 地理投影、连续 UV、孔洞、小岛、平面背景、装饰纹理与聚合单元测试
node --test --test-isolation=none tests/unit/three-geography.test.mjs tests/unit/three-planar-materials.test.mjs tests/unit/cockpit-cartography.test.mjs tests/unit/cockpit-semantic.test.mjs

# 使用真实 API，在用户已安装的可见 Chrome 中运行回归
$env:TARGET_URL='http://127.0.0.1:5173'
$env:HEADED='1'
$env:BROWSER_EXECUTABLE='C:\Users\Lenovo\AppData\Local\Google\Chrome\Application\chrome.exe'
node tests/e2e/three-cockpit-migration.cjs

# 高德市级选车、图层、跟随与历史轨迹回放
node tests/e2e/amap-city-workflows.cjs
```

浏览器测试默认使用仓库开发账号，也可通过 `TEST_USER`、`TEST_PASSWORD` 提供测试账号。脚本不拦截或伪造业务 API，覆盖五种专题、地图/排行选择联动、三级下钻、返回时状态恢复、1920/2560/3840 视口截图和 Cesium 资源残留检查。引擎断言为全国/省级 `data-engine="three"`、市级 `data-engine="amap"`；市级检查高德地图 DOM，不要求 Three.js 画布。截图输出到 `test-results/three-cockpit-migration/`。

两个浏览器脚本均支持 `HEADED` 和 `BROWSER_EXECUTABLE`。上述配置由 Playwright 以 `headless: false` 启动用户目录内的 Chrome，不连接或复用个人浏览器资料。换机器时应将路径改为实际 Chrome 可执行文件。省略这两个变量时使用 Playwright 默认 Chromium 无头模式；默认模式的结果不能替代本次可见 Chrome 验收记录。

`amap-city-workflows.cjs` 通过高德 DOM、面板状态和真实 API 验证选车高亮、区域图层切换不隐藏地图、车辆跟随提示、回放拖动、真实时间戳、倍速、暂停和退出。轨迹从已有车辆中查询，不生成测试轨迹；需要至少一辆测试账号可见车辆具有历史轨迹。该脚本不访问 Three.js 实例，截图输出到 `test-results/amap-city-workflows/`。

本次构建、功能回归与视觉检查结果见文首验证记录；生产并发、长稳运行和 FPS 目标不属于本轮通过结论，仍需在目标设备、分辨率、性能档位和数据量下单独测试。
