#!/usr/bin/env bash
# Diagnóstico + correção na VPS (cole como root)
set -euo pipefail

APP_DIR="/opt/school-backend"
export NVM_DIR="${NVM_DIR:-/root/.nvm}"
[ -s "${NVM_DIR}/nvm.sh" ] && . "${NVM_DIR}/nvm.sh"

echo "========== 1. NGINX =========="
ls -la /etc/nginx/sites-enabled/school-backend.conf 2>/dev/null || echo "SEM school-backend.conf"
grep -r "api.ct095.com" /etc/nginx/sites-enabled/ 2>/dev/null || echo "api.ct095.com NÃO está em sites-enabled"

echo ""
echo "========== 2. ENV / PORTA =========="
grep -E '^PORT=|^DATABASE_URL=' "${APP_DIR}/.env.production" 2>/dev/null || echo "Sem .env.production"
ln -sf "${APP_DIR}/.env.production" "${APP_DIR}/.env"
ss -tlnp | grep -E ':3002|:3001' || echo "Nada escutando em 3001/3002"

echo ""
echo "========== 3. PM2 (sem wait_ready) =========="
cd "${APP_DIR}"

# ecosystem sem wait_ready — Nest não manda process.send('ready')
if grep -q 'wait_ready' ecosystem.config.js 2>/dev/null; then
  sed -i '/wait_ready/d; /listen_timeout/d; /kill_timeout/d' ecosystem.config.js
  echo "Removido wait_ready do ecosystem.config.js"
fi

pm2 delete school-backend 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save
sleep 3
pm2 list

echo ""
echo "========== 4. LOGS (últimas 40 linhas) =========="
pm2 logs school-backend --lines 40 --nostream 2>/dev/null || tail -40 /var/log/school-backend/error.log 2>/dev/null || true

echo ""
echo "========== 5. HEALTH =========="
curl -sv "http://127.0.0.1:3002/api/v1/health" 2>&1 | tail -15
echo ""
curl -sk "https://api.ct095.com/api/v1/health" 2>&1 | tail -5 || echo "HTTPS falhou"

echo ""
echo "✅ Se local OK e HTTPS falhar: nginx/ssl. Se local falhar: veja logs acima (Firebase, DATABASE_URL)."
