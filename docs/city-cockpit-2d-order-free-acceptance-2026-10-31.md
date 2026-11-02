# 市级驾驶舱、导航与订单信息调整验收

日期：2026-10-31

## 已完成

- 在市级顶层导航的“监管工作台”后增加“驾驶舱”，路由为 `/regulatory/cockpit`；沿用纯文字导航。
- 移除工作台顶部的可见标题、城市标签和页内驾驶舱入口。保留无障碍页面标题，将日期筛选放入“运行趋势”卡片。
- 市级驾驶舱复用省级驾驶舱的蓝色二维地图、面板框架、状态图例、运营区域边界、车辆信息弹窗和轨迹显示，所有市级层级均使用2D模式。
- 支持全市→辖区→企业→车辆下钻、面包屑返回、地图重置、全屏、刷新及URL恢复。按本市授权范围获取车辆与运营区域；企业和车辆筛选不允许跨城市。
- 已检索运行时代码，移除订单查询、订单任务面板、订单号、货物、进度、预计到达，以及车辆颜色中的订单判断。市级和省级共用的车辆面板均已调整。
- 车辆运行状态来自上报在线／行驶状态等遥测数据，轨迹起终点来自已接入运行记录和实际定位点。
- 原订单面板替换为“运行记录”，展示最近已接入记录的里程、时长及起止时间；缺失记录显示暂无记录。运行记录摘要与轨迹记录分别读取，不要求最新运行记录必须具有轨迹。

本次仅调整应用展示和数据读取，没有删除数据库中既有历史业务表或数据，也没有新增模拟订单或模拟轨迹。

## 验证

- API TypeScript检查通过，前端生产构建通过。
- 后端26个测试集、185项测试通过；新增“订单数据源不可用时驾驶舱仍可读取车辆和运行记录”的测试，更新市级导航顺序断言。
- `pnpm test:e2e:city-workbench` 通过：工作台统计、日期筛选、详情、待办、失败恢复及响应式布局。
- `pnpm test:e2e:city-cockpit` 通过：导航顺序、标题区域移除、城市隔离、市级及省级返回数据不含订单字段、所有层级二维下钻、车辆弹窗、URL刷新与返回。
- 驾驶舱检查1920×1080、1440×900及390×844尺寸。地图尺寸重排需要等待SDK完成；等待后无整页横向溢出。手机端地图与监管面板纵向排列。
- 浏览器回归无页面运行错误。保留已有bundle体积提示，不影响构建。
- 旧的 `test:e2e:city-vehicle-popup` 验收入口复用新版驾驶舱回归，避免继续使用被替换的旧界面选择器。

## 主要文件

- `apps/api/src/auth/navigation.ts`
- `apps/api/src/dashboard/cockpit.service.ts`
- `apps/web/src/views/CityCockpitView.vue`
- `apps/web/src/views/CockpitView.vue`（兼容入口）
- `apps/web/src/city-cockpit.css`
- `apps/web/src/components/CockpitCityPanels.vue`
- `apps/web/src/views/RegulatoryWorkbenchView.vue`
- `tests/e2e/city-cockpit.cjs`
- `test-results/city-cockpit/acceptance.json`

## 页面截图

- [工作台及导航](../test-results/city-cockpit/01-workbench-navigation.png)
- [市级二维驾驶舱](../test-results/city-cockpit/02-city-map.png)
- [车辆详情与定位弹窗](../test-results/city-cockpit/03-vehicle-popup.png)
- [笔记本布局](../test-results/city-cockpit/04-laptop.png)
- [手机布局](../test-results/city-cockpit/05-mobile.png)
