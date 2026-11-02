# 无人快递车监管平台

平台采用省级统一部署、地市线下申请、省级直接开通和城市权限隔离。省级管理员在`/province/workspaces`点击“开通城市”，填写城市、管理单位、管理员账号及初始密码、授权模块和配额，即可开通，地市管理员可直接登录。功能调整、续期和管理员变更同样线下联系省级办理。旧线上申请入口已停用，历史申请数据保留。省级账号为`admin`；已有市级账号为`jinan_admin`、`qingdao_admin`、`linyi_admin`，登录凭据沿用现有本地配置。

使用和验证结果见[省市实施验收记录](docs/provincial-saas-acceptance-2026-10-28.md)，数据来源见[山东数据维护说明](docs/shandong-data-provenance.md)。`pnpm db:seed`使用安全增量初始化，保留已有城市和申请。

本轮已完成省级监管、市级监管、市级企业三端导航与职责调整，详情和历史收进业务页；省级协同事项可派发到城市、接收反馈并复核办结。功能与验证见[省市导航及协同验收记录](docs/navigation-business-acceptance-2026-10-28.md)。

面向交通运输监管部门与无人快递车运营企业的正式业务平台。本仓库当前完成 Phase 7：Phase 1–6 的认证、档案、准入审批、运行监管、安全监管和分析研判能力已完成全量联调，并补齐权限与数据范围验证、API 健康检查、请求追踪、地图性能、Playwright E2E 和容器部署准备。

## 技术架构

- Web：Vue 3、TypeScript、Vite、Vue Router、Pinia、Element Plus、ECharts、GSAP
- API：NestJS、TypeScript、REST、Swagger
- 数据：Prisma ORM、SQLite（Service 层保持数据库无关）
- 地图：AMap JSAPI 2.0（Marker、MarkerCluster、HeatMap、Polyline、MoveAnimation、Polygon、MouseTool）

## 目录

```text
apps/web       Vue 管理端与企业端
apps/api       NestJS API
prisma         Schema、Migration、Seed
docs           产品、权限、ER 与 API 蓝图
design-system  本项目设计系统决策
data           本地 SQLite 数据（不提交）
```

## 环境要求

- Node.js 22.x
- pnpm 10+

## 安装与初始化

```bash
pnpm install
copy .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Windows PowerShell 可使用 `Copy-Item .env.example .env`。当前工作区已配置本地开发 `.env`；生产环境必须替换 JWT Secret。

## 启动

```bash
pnpm dev
```

- Web：http://127.0.0.1:5173
- API：http://127.0.0.1:8080/api
- Swagger：http://127.0.0.1:8080/swagger
- 健康检查：http://127.0.0.1:8080/api/health

## 测试账号

所有 Seed 账号的初始密码均为：`Wrc@2026!`

| 账号 | 角色 | 门户 |
| --- | --- | --- |
| `admin` | 超级管理员 | 监管端 |
| `reg_admin` | 监管管理员 | 监管端 |
| `reg_user` | 监管工作人员 | 监管端 |
| `approver` | 审批人员 | 监管端 |
| `ent_admin` | 企业管理员 | 企业端 |
| `ent_user` | 企业普通用户 | 企业端 |

首次登录后请修改密码。账号、角色、权限、菜单和企业关系均来自 SQLite，不是前端 Mock。

## 高德配置

Web 开发 Key 放在 `apps/web/.env.local`，模板见 `apps/web/.env.example`：

```dotenv
VITE_AMAP_KEY="..."
VITE_AMAP_SECURITY_JS_CODE="..."
VITE_AMAP_SERVICE_HOST=""
```

生产环境不要发布安全密钥，应设置 `VITE_AMAP_SERVICE_HOST` 并由服务端代理高德请求。真实 `.env` 与 `.env.local` 已被 `.gitignore` 排除。

## 数据库与迁移

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:studio
```

数据库文件位于 `data/regulatory.db`。`pnpm db:seed` 在空库建立基础记录，在已有数据库执行幂等增量初始化，保留城市申请、账号与业务状态。当前山东数据覆盖济南、青岛、临沂3个已开通城市、12家企业、348辆车及关联许可、运行、安全和评价记录。

## 构建

```bash
pnpm build
```

## 测试与验收

先启动 API 与 Web，再执行联调测试：

```bash
pnpm test
pnpm test:db
pnpm test:api
pnpm test:e2e
```

- `pnpm test`：NestJS 服务单元测试。
- `pnpm test:db`：Seed 基线、组织归属、闭环证据、审计日志和评价权重一致性。
- `pnpm test:api`：6 类角色、权限拒绝、组织/企业数据范围、业务闭环、令牌轮换与请求追踪。
- `pnpm test:e2e`：按 Phase 1–7 顺序运行 Playwright 浏览器验收并把截图写入 `test-results/`。

E2E 会创建或流转开发数据；需要恢复标准演示数据时执行 `pnpm db:seed`。

## 生产部署

仓库提供 `apps/api/Dockerfile`、`apps/web/Dockerfile`、`docker-compose.yml`、Nginx SPA/反向代理配置和生产环境变量模板：

```bash
copy .env.production.example .env.production
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
```

上线前必须替换 JWT 密钥、正式域名和高德生产配置。完整拓扑、健康检查、备份与恢复步骤见 [部署说明](docs/deployment.md)。

## 权限边界

业务页面右下角的「AI 助手」进入鲁行智助，提供六类业务查询、个人历史对话和来源核对。模型配置、数据口径及验证方式见 [AI 智能体中心](docs/agent-center.md)。

- 菜单来自数据库，并根据角色权限动态生成路由。
- API 由 JWT Guard 与 Permission Guard 强制校验。
- 企业用户查询用户和企业数据时，由后端追加 `enterpriseId` 范围，不能通过 URL 或请求参数越权。
- 监管用户的数据范围以 `organizationId` 为基础；超级管理员拥有全局范围。

详细设计见 [Phase 1 蓝图](docs/phase-1-blueprint.md)、[Phase 2 监管档案蓝图](docs/phase-2-archives-blueprint.md)、[Phase 3 准入审批蓝图](docs/phase-3-admission-blueprint.md)、[Phase 4 运行监管蓝图](docs/phase-4-operations-blueprint.md)、[Phase 5 安全监管蓝图](docs/phase-5-safety-blueprint.md)、[Phase 6 分析研判蓝图](docs/phase-6-analytics-blueprint.md) 与 [Phase 7 验收记录](docs/phase-7-verification.md)。
