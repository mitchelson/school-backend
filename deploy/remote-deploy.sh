#!/usr/bin/env bash
# Deploy na VPS (CI SSH ou manual). Carrega Node/npm em shell não interativo.
set -euo pipefail

APP_DIR="/opt/school-backend"

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

if [ -f /etc/profile ]; then
  # shellcheck disable=SC1091
  . /etc/profile
fi
if [ -f "${HOME}/.profile" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.profile"
fi
if [ -f "${HOME}/.bashrc" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.bashrc"
fi
if [ -f "${HOME}/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${HOME}/.nvm/nvm.sh"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm não encontrado no PATH."
  echo "   Instale Node.js 24 na VPS, por exemplo:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -"
  echo "   sudo apt-get install -y nodejs"
  echo "   sudo npm install -g pm2"
  echo "   PATH atual: ${PATH}"
  exit 127
fi

echo "→ Node $(node -v) | npm $(npm -v) | $(command -v npm)"

cd "${APP_DIR}"

git fetch origin main
git reset --hard origin/main

npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
npm prune --omit=dev

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart school-backend || pm2 start ecosystem.config.js
  pm2 save
else
  echo "⚠️  pm2 não encontrado — inicie o app manualmente."
fi

echo "✅ school-backend deployed ($(git rev-parse --short HEAD))"
