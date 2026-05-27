#!/bin/bash
# Setup inicial na VPS para o school-backend
# Rodar como root: bash deploy/setup-vps.sh

set -euo pipefail

APP_DIR="/opt/school-backend"
REPO_URL="git@github.com:SEU_USER/school-backend.git"  # Ajustar

echo "=== Instalando dependências do sistema ==="
apt-get update
apt-get install -y curl git nginx certbot python3-certbot-nginx

# Node.js 24 (se não instalado)
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

# PM2 global
npm install -g pm2

# PostgreSQL (se não instalado — provavelmente já existe do ct095-api)
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
fi

echo "=== Criando banco school_db ==="
sudo -u postgres psql -c "CREATE USER school WITH PASSWORD 'TROCAR_SENHA';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE school_db OWNER school;" 2>/dev/null || true

echo "=== Clonando repositório ==="
mkdir -p $APP_DIR
if [ ! -d "$APP_DIR/.git" ]; then
  git clone $REPO_URL $APP_DIR
fi
cd $APP_DIR

echo "=== Configurando .env.production ==="
if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  echo "⚠️  Edite /opt/school-backend/.env.production com as credenciais reais!"
fi

echo "=== Instalando dependências e buildando ==="
npm ci
npx prisma generate
npm run build
npx prisma migrate deploy
npm prune --omit=dev

echo "=== Criando diretório de logs ==="
mkdir -p /var/log/school-backend

echo "=== Iniciando com PM2 ==="
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo "=== Configurando Nginx ==="
cp deploy/nginx-school-backend.conf /etc/nginx/sites-available/school-backend.conf
ln -sf /etc/nginx/sites-available/school-backend.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo "=== SSL (Certbot) ==="
echo "Rode manualmente: certbot --nginx -d api.ct095.com"

echo ""
echo "✅ Setup completo!"
echo "   - App: $APP_DIR"
echo "   - PM2: pm2 status"
echo "   - Logs: pm2 logs school-backend"
echo "   - Nginx: /etc/nginx/sites-enabled/school-backend.conf"
echo "   - Env: $APP_DIR/.env.production (EDITAR!)"
