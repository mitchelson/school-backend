#!/usr/bin/env bash
# Pós-deploy na VPS (migrations + PM2). Mesmo padrão do zenvix-store: Node via nvm, sem npm no CI SSH.
set -euo pipefail

APP_DIR="/opt/school-backend"

export NVM_DIR="${NVM_DIR:-/root/.nvm}"
if [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
fi

NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
PM2_BIN="${PM2_BIN:-$(command -v pm2 || true)}"

if [ -z "${NODE_BIN}" ] || [ -z "${PM2_BIN}" ]; then
  echo "❌ Node ou PM2 não encontrado."
  echo "   Na VPS (como root): instale nvm + Node + pm2 global, igual ao zenvix-store."
  echo "   Ex.: nvm install 20 && npm i -g pm2"
  exit 127
fi

echo "→ node: ${NODE_BIN} ($(${NODE_BIN} -v))"
echo "→ pm2:  ${PM2_BIN}"

cd "${APP_DIR}"

if [ ! -f .env.production ]; then
  echo "❌ Arquivo .env.production ausente em ${APP_DIR}"
  exit 1
fi

ln -sf .env.production .env

echo "==> Prisma migrate deploy..."
PATH="$(dirname "${NODE_BIN}"):${PATH}"
./node_modules/.bin/prisma migrate deploy

echo "==> PM2 reload..."
"${PM2_BIN}" reload ecosystem.config.js --env production --update-env \
  || "${PM2_BIN}" start ecosystem.config.js --env production
"${PM2_BIN}" save

echo "✅ school-backend em produção ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
