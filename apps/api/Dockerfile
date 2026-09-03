FROM node:22-alpine AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY prisma prisma
COPY apps/api apps/api
RUN pnpm db:generate && pnpm --filter api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080 APP_VERSION=1.0.0
RUN corepack enable
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/prisma ./prisma
RUN mkdir -p /app/data
EXPOSE 8080
CMD ["sh", "-c", "pnpm db:deploy && exec node apps/api/dist/main.js"]
