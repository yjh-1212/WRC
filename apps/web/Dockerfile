FROM node:22-alpine AS build
ARG VITE_AMAP_KEY
ARG VITE_AMAP_SERVICE_HOST
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV VITE_AMAP_KEY=$VITE_AMAP_KEY
ENV VITE_AMAP_SERVICE_HOST=$VITE_AMAP_SERVICE_HOST
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
