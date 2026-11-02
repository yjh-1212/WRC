# Cleanup Notes

本次清理目标：把原项目收敛为“国家→省→市无人车监管驾驶舱”的纯地图引擎底座。

## 已删除

- `src/demo/demoNetwork.js`
- `src/demo/`
- `DEMO_DATA.md`
- `MIGRATION.md`
- `src/ui/HudController.js`
- 原 index.html 演示场景、演示摘要、演示按钮
- `.env.local`

## 已调整

- `DemoEffects.js` → `VisualizationEffects.js`
- `GeoEngine.js` 更新 effect 引用
- `main.js` 改为纯引擎初始化，不自动加载任何业务演示数据
- `index.html` 改为最小开发调试壳
- `styles.css` 改为最小引擎调试样式
- 浙江省城市预置补齐 11 个地市，便于后续省→市场景开发
- README 改为正式驾驶舱引擎底座说明

## 保留

- Cesium 主引擎
- 高德底图 / 路径规划
- 行政边界
- 图层管理
- 流光路线
- 脉冲点
- 热力 / 光柱 / 扫描
- 实时对象
- 跟随 / 环绕 / 俯视 / 2D3D

正式业务数据和三级驾驶舱 UI 尚未在本次清理中实现，后续按 `CODEX_DEVELOPMENT_GUIDE.md` 开发。
