#!/usr/bin/env bash
# Colar e rodar na VPS como root: bash vps-enable-api-ct095.sh
set -euo pipefail

APP_DIR="/opt/school-backend"
NGINX_AVAILABLE="/etc/nginx/sites-available/school-backend.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/school-backend.conf"

echo "==> Removendo ct095-api de api.ct095.com..."
rm -f /etc/nginx/sites-enabled/ct095-api.conf
rm -f /etc/nginx/sites-enabled/school-api.conf

echo "==> Criando nginx school-backend (api.ct095.com -> :3002)..."
cat > "${NGINX_AVAILABLE}" <<'NGINX'
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

ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

echo "==> Testando nginx..."
nginx -t
systemctl reload nginx

echo "==> Sites ativos com api.ct095.com:"
grep -r "api.ct095.com" /etc/nginx/sites-enabled/ || true

if [ -f "${APP_DIR}/.env.production" ]; then
  if ! grep -q '^PORT=3002' "${APP_DIR}/.env.production"; then
    echo "==> Ajustando PORT=3002 em .env.production..."
    if grep -q '^PORT=' "${APP_DIR}/.env.production"; then
      sed -i 's/^PORT=.*/PORT=3002/' "${APP_DIR}/.env.production"
    else
      echo 'PORT=3002' >> "${APP_DIR}/.env.production"
    fi
  fi
  ln -sf "${APP_DIR}/.env.production" "${APP_DIR}/.env"
fi

export NVM_DIR="${NVM_DIR:-/root/.nvm}"
if [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
fi

echo "==> Reiniciando PM2..."
cd "${APP_DIR}"
pm2 restart school-backend --update-env 2>/dev/null || pm2 start ecosystem.config.js --env production
pm2 save

echo ""
echo "==> Health local:"
curl -sf "http://127.0.0.1:3002/api/v1/health" && echo "" || echo "FALHOU (app não responde na 3002)"

echo "==> Health público:"
curl -sf "https://api.ct095.com/api/v1/health" && echo "" || echo "FALHOU (nginx/ssl ou DNS)"

echo ""
echo "✅ Concluído. pm2 logs: pm2 logs school-backend"
