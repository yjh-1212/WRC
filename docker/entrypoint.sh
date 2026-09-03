#!/bin/sh
set -eu

NGINX_PORT="${PORT:-80}"
export WEB_ORIGIN="${WEB_ORIGIN:-${RENDER_EXTERNAL_URL:-}}"

sed "s/__LISTEN_PORT__/${NGINX_PORT}/g" /etc/nginx/wrc.conf.template > /etc/nginx/http.d/default.conf

cd /app
pnpm db:deploy

USER_COUNT="$(node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.user.count().then((c)=>{process.stdout.write(String(c));}).catch(()=>{process.stdout.write('0');}).finally(()=>p.\$disconnect())")"
if [ "${RUN_SEED:-}" = "true" ] || [ "${USER_COUNT}" = "0" ]; then
  echo "Seeding database (user count: ${USER_COUNT})..."
  pnpm db:seed
fi

PORT=8080 node apps/api/dist/main.js &
API_PID=$!

tries=0
until node -e "fetch('http://127.0.0.1:8080/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
  tries=$((tries + 1))
  if [ "${tries}" -ge 60 ]; then
    echo "API failed to become healthy"
    kill "${API_PID}" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

nginx -g 'daemon off;' &
NGINX_PID=$!

cleanup() {
  kill "${API_PID}" "${NGINX_PID}" 2>/dev/null || true
}
trap cleanup TERM INT

while kill -0 "${API_PID}" 2>/dev/null && kill -0 "${NGINX_PID}" 2>/dev/null; do
  sleep 1
done

cleanup
exit 1
