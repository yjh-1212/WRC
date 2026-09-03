# Phase 2 监管档案蓝图

## 交付范围

Phase 2 在现有 Vue 3 + NestJS + Prisma 单仓工程上增量实现，不替换 Phase 1 的认证、RBAC、菜单、组织与审计能力。

- 监管端：企业档案、车辆档案、车辆管理、厂商管理、车型管理
- 企业端：我的车辆、车辆档案、企业信息、企业资质
- 车辆管理负责业务维护；车辆档案为只读监管聚合视图，两者使用独立路由
- 牌照维护位于车辆管理的车辆上下文内，牌照历史在车辆档案内只读呈现

## 数据模型

| 模型 | 核心标识 | 关键关系 |
| --- | --- | --- |
| Manufacturer | businessNo、name、creditCode | 1:N VehicleModel |
| VehicleModel | businessNo、modelCode | N:1 Manufacturer；1:N Vehicle |
| Vehicle | businessNo、vin、deviceNo | N:1 VehicleModel、Enterprise、Organization |
| VehicleLicense | businessNo、licenseNo | N:1 Vehicle、Enterprise、Organization |
| VehicleArchive | archiveNo、vehicleId | 1:1 Vehicle |
| EnterpriseQualification | businessNo、certificateNo | N:1 Enterprise |

厂商、车型、车辆和企业资质使用软删除保留审计语义。车辆退出运营时同步关闭在线状态、更新档案生命周期并注销牌照。

## 数据范围

- 超级管理员：全市数据
- 监管角色：当前监管组织数据
- 企业角色：服务端强制追加当前 enterpriseId，忽略跨企业查询意图
- 厂商和车型是全局基础目录；企业角色只读
- 所有写接口同时校验功能权限和对象数据范围

## API

统一前缀为 `/api/archives`：

- `/manufacturers`：列表、新增、修改、启停、软删除
- `/models`：列表、新增、修改、启停、软删除
- `/vehicles`：列表、详情、新增、修改、启停、退出运营
- `/vehicles/:id/licenses`、`/licenses`：牌照查询、签发与状态变更
- `/enterprises`、`/enterprises/current`：监管企业档案和企业自有档案
- `/qualifications`：企业资质列表、新增、修改、状态变更、软删除
- `/options`：按登录数据范围返回车辆维护所需字典

列表查询在服务端完成搜索、筛选、排序与分页，避免仅筛选当前页产生假空结果。

## 页面与交互

所有集合页包含加载、失败重试、空结果、搜索、领域筛选、分页和刷新。可维护目录同时提供行选择、批量启停/删除、单行操作菜单与确认流程。车辆档案使用同一车辆上下文的“基本信息、运行信息、牌照信息、历史记录”标签页。

## 验证基线

- 迁移：`20260902135913_phase2_archives`
- 生产构建：`pnpm run build`
- 浏览器回归：`node .agents/skills/playwright-skill/run.js tests/e2e/phase2.cjs`
- 关键断言：厂商新增后刷新仍存在；企业管理员仅返回本企业 10 辆车；跨企业车辆详情返回 404；车辆档案牌照可见；移动端企业信息无横向滚动
