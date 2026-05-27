#!/usr/bin/env bash
# Corrige: app na 3001 vs nginx na 3002 + nginx vazio
set -euo pipefail

APP_DIR="/opt/school-backend"
export NVM_DIR="${NVM_DIR:-/root/.nvm}"
[ -s "${NVM_DIR}/nvm.sh" ] && . "${NVM_DIR}/nvm.sh"

echo "==> 1. PORT=3002 em .env.production e .env"
cd "${APP_DIR}"
if [ -f .env.production ]; then
  if grep -q '^PORT=' .env.production; then
    sed -i 's/^PORT=.*/PORT=3002/' .env.production
  else
    echo 'PORT=3002' >> .env.production
  fi
fi
ln -sf .env.production .env
grep '^PORT=' .env.production .env

echo "==> 2. Nginx api.ct095.com -> :3002"
cat > /etc/nginx/sites-available/school-backend.conf <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name api.ct095.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.ct095.com;

    ssl_certificate /etc/letsencrypt/live/api.ct095.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.ct095.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/school-backend.conf /etc/nginx/sites-enabled/school-backend.conf
rm -f /etc/nginx/sites-enabled/ct095-api.conf
nginx -t && systemctl reload nginx
echo "Nginx server_name:"
grep server_name /etc/nginx/sites-available/school-backend.conf

echo "==> 3. PM2 com PORT=3002 explícito"
export PORT=3002
pm2 delete school-backend 2>/dev/null || true
PORT=3002 pm2 start ecosystem.config.js --env production
pm2 save
sleep 4

echo "==> 4. Portas em uso"
ss -tlnp | grep -E '3001|3002' || true

echo "==> 5. Health"
curl -sf "http://127.0.0.1:3002/api/v1/health" && echo "" || echo "3002 FALHOU"
curl -sf "http://127.0.0.1:3001/api/v1/health" && echo " (ainda responde em 3001)" || true
curl -sk "https://api.ct095.com/api/v1/health" && echo "" || echo "HTTPS FALHOU"

echo ""
pm2 logs school-backend --lines 5 --nostream 2>/dev/null | tail -8
