# Apontar api.ct095.com para o school-backend

Hoje `api.ct095.com` na VPS costuma ir para o **ct095-api** (`proxy_pass` → porta **18080**).
Para o **school** responder nesse domínio, faça na VPS como **root**:

## 1. Ver o que está ativo

```bash
grep -r "api.ct095.com" /etc/nginx/sites-enabled/
pm2 list
ss -tlnp | grep -E '3002|18080|3001'
```

## 2. Tirar api.ct095.com do ct095-api

No seu servidor está em `ct095-api.conf`:

```bash
rm -f /etc/nginx/sites-enabled/ct095-api.conf
```

(O arquivo em `sites-available/ct095-api.conf` pode ficar desativado.)

## 3. Ativar o nginx do school (reusa o certificado SSL existente)

```bash
cp /opt/school-backend/deploy/nginx-school-backend.conf \
   /etc/nginx/sites-available/school-backend.conf
ln -sf /etc/nginx/sites-available/school-backend.conf \
       /etc/nginx/sites-enabled/school-backend.conf
nginx -t && systemctl reload nginx
```

Se `nginx -t` falhar em `options-ssl-nginx.conf`, rode: `certbot install --cert-name api.ct095.com`

## 4. Confirmar o PM2 do school

Em `/opt/school-backend/.env.production`:

```env
PORT=3002
```

```bash
cd /opt/school-backend
pm2 restart school-backend --update-env
# ou: bash deploy/post-deploy.sh
curl -s http://127.0.0.1:3002/api/v1/health
curl -s https://api.ct095.com/api/v1/health
```

## 5. SSL (se o HTTPS quebrar após trocar o backend)

```bash
certbot --nginx -d api.ct095.com
```

## 6. Frontend

Build de produção com:

```env
NEXT_PUBLIC_API_URL=https://api.ct095.com/api/v1
```

---

**ct095-api:** se ainda precisar dele, use outro host (ex. subdomínio novo) ou outra porta no nginx — não compartilhe `api.ct095.com` com os dois ao mesmo tempo.
