#!/usr/bin/env bash
# Correção imediata: app já responde na 3001, nginx estava na 3002 → 502
set -euo pipefail

sed -i 's|proxy_pass http://127.0.0.1:3002|proxy_pass http://127.0.0.1:3001|g' \
  /etc/nginx/sites-available/school-backend.conf

nginx -t && systemctl reload nginx

echo "==> Health"
curl -sf "http://127.0.0.1:3001/api/v1/health" && echo ""
curl -sk "https://api.ct095.com/api/v1/health" && echo ""

echo "✅ API pública deve responder. Depois do próximo deploy, pode voltar para 3002."
