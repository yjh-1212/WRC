FROM node:22-alpine AS build
ARG VITE_AMAP_KEY
ARG VITE_AMAP_SECURITY_JS_CODE
ARG VITE_AMAP_SERVICE_HOST
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV VITE_AMAP_KEY=$VITE_AMAP_KEY
ENV VITE_AMAP_SECURITY_JS_CODE=$VITE_AMAP_SECURITY_JS_CODE
ENV VITE_AMAP_SERVICE_HOST=$VITE_AMAP_SERVICE_HOST
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY prisma prisma
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm db:generate && pnpm --filter api build && pnpm --filter web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production APP_VERSION=1.0.0
RUN apk add --no-cache nginx \
  && corepack enable \
  && mkdir -p /app/data /run/nginx /usr/share/nginx/html /etc/nginx/http.d \
  && rm -f /etc/nginx/http.d/default.conf
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/wrc.conf.template
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/app/docker/entrypoint.sh"]
