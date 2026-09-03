# 部署说明

## 生产拓扑

- `web`：Nginx 托管 Vite 静态文件，并把 `/api`、`/swagger` 同源代理到 API。
- `api`：NestJS 启动前自动执行 Prisma 已提交迁移，通过 `/api/health` 检查进程与数据库。
- `wrc-data`：SQLite 持久卷。单实例部署可直接使用；多实例或高并发生产环境应迁移至 PostgreSQL/MySQL。

## 上线前配置

1. 复制 `.env.production.example` 为 `.env.production`。
2. 生成两组不同的、至少 32 位的随机 JWT 密钥。
3. 将 `PUBLIC_WEB_ORIGIN` 设为最终 HTTPS 域名；多个允许来源用英文逗号分隔。
4. 设置生产高德 Web 端 Key，并在高德控制台绑定正式域名。
5. `AMAP_SERVICE_HOST` 指向已部署的高德安全代理。生产构建不应注入 `securityJsCode`。

高德 Web 服务 Key 只用于服务端地理编码、路径规划、POI 等 REST 服务。本平台当前地图页面使用 JSAPI 展示已有监管坐标，不需要为了显示底图而调用 Web 服务 Key。

## Render（Docker）

仓库根目录的 `Dockerfile` 把前端 Nginx 和 API 打进同一个镜像，浏览器只访问一个 HTTPS 域名，`/api` 由容器内反向代理。这是给 Render 用的；本机仍用下面的 `docker compose` 双容器。

1. 把包含 `Dockerfile` 和 `render.yaml` 的提交推到 GitHub。
2. 在 Render 选择 **Docker**，不要用 Node/Phoenix 的 Build/Start Command。
3. 表单按下面填写，或直接 **New > Blueprint** 导入 `render.yaml`。

| 字段 | 填写 |
|---|---|
| Language / Runtime | Docker |
| Region | Virginia (US East) |
| Root Directory | 空 |
| Dockerfile Path | `Dockerfile` |
| Docker Build Context Directory | `.` |

不要填 `mix phx.*`。选 Docker 后这两项会消失。

环境变量（勾选 Available during build，前端 Key 必须在构建时注入）：

```
NODE_ENV=production
DATABASE_URL=file:../data/regulatory.db
JWT_ACCESS_SECRET=<至少32位随机串>
JWT_REFRESH_SECRET=<另一组至少32位随机串>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
VITE_AMAP_KEY=<高德 JSAPI Key>
VITE_AMAP_SECURITY_JS_CODE=<高德安全密钥>
VITE_AMAP_SERVICE_HOST=
```

`WEB_ORIGIN` 和 `PORT` 不用填：镜像会用 Render 提供的外网地址和端口。

磁盘：挂 Persistent Disk 到 `/app/data`，否则 SQLite 每次部署都会丢。首次启动若库是空的会自动 `pnpm db:seed`。

实例需要 **Starter** 及以上（Docker + 磁盘不在免费 Web Service 上）。健康检查路径：`/api/health`。

## 容器部署

```bash
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d
docker compose ps
```

上线检查：

```bash
curl -f https://wrc.example.gov.cn/api/health
curl -I https://wrc.example.gov.cn/
```

Swagger 位于 `/swagger`。如不允许公网访问，应在外层网关通过 IP 白名单或身份认证限制该路径。

## 数据备份与恢复

SQLite 文件必须在一致性窗口内复制。容器部署推荐：

```bash
docker compose --env-file .env.production stop api
docker run --rm -v wurenche_wrc-data:/data -v "$PWD/backups:/backup" alpine cp /data/regulatory.db /backup/regulatory-$(date +%Y%m%d-%H%M%S).db
docker compose --env-file .env.production start api
```

恢复前先停止 API，把目标备份复制回卷内的 `/data/regulatory.db`，再启动 API 并检查 `/api/health`。备份文件应加密、异地保存并定期演练恢复；不要只验证“备份任务成功”。

## 非容器部署

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
pnpm db:deploy
NODE_ENV=production pnpm --filter api start
```

Web 端将 `apps/web/dist` 交给 Nginx，并按仓库中的 `apps/web/nginx.conf` 配置 SPA 回退和 API 代理。

## 运行维护

- API 日志输出请求 ID、方法、路径、状态码、耗时和用户 ID，不记录请求正文或令牌。
- 客户端可传入合法的 `x-request-id`；响应头和响应体会原样返回，便于跨系统追踪。
- 5xx 响应不向客户端暴露内部异常，服务端日志保留堆栈和请求 ID。
- 定期清理已撤销/过期刷新令牌，关注登录失败、429、5xx、地图加载失败和数据库卷容量。
