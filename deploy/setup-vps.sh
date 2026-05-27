#!/bin/bash
# Setup inicial na VPS (uma vez). Deploy contínuo via GitHub Actions (SCP), igual zenvix-store.
# Rodar como root: bash deploy/setup-vps.sh

set -euo pipefail

APP_DIR="/opt/school-backend"

echo "=== Dependências do sistema ==="
apt-get update
apt-get install -y curl git nginx certbot python3-certbot-nginx

echo "=== Node + PM2 (nvm, mesmo padrão do zenvix-store) ==="
if [ ! -d /root/.nvm ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
export NVM_DIR="/root/.nvm"
# shellcheck disable=SC1091
. "${NVM_DIR}/nvm.sh"
nvm install 20
nvm alias default 20
npm install -g pm2

echo "=== PostgreSQL (se ainda não existir) ==="
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
fi

echo "=== Banco school_db ==="
sudo -u postgres psql -c "CREATE USER school WITH PASSWORD 'TROCAR_SENHA';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE school_db OWNER school;" 2>/dev/null || true

echo "=== Diretórios da aplicação ==="
mkdir -p "${APP_DIR}" /var/log/school-backend

if [ ! -f "${APP_DIR}/.env.production" ]; then
  echo "Crie ${APP_DIR}/.env.production a partir do .env.production.example após o primeiro deploy."
  echo "Ou copie manualmente antes do primeiro push em main."
fi

echo "=== PM2 startup ==="
pm2 startup
pm2 save || true

echo "=== Nginx ==="
if [ -f deploy/nginx-school-backend.conf ]; then
  cp deploy/nginx-school-backend.conf /etc/nginx/sites-available/school-backend.conf
  ln -sf /etc/nginx/sites-available/school-backend.conf /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx
fi

echo ""
echo "✅ VPS pronta para receber deploy via GitHub Actions."
echo "   - Pasta: ${APP_DIR}"
echo "   - Env:   ${APP_DIR}/.env.production (obrigatório antes do app subir)"
echo "   - Nginx: api.ct095.com → porta 3002 (ver deploy/API-DOMAIN.md)"
echo "   - SSL:   certbot --nginx -d api.ct095.com"
echo "   - Node:  $(command -v node) ($(node -v))"
