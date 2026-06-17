# Checklist de deploy — produção

Use antes e depois de cada deploy com dinheiro real.

## Secrets (VPS `/opt/school-backend/.env.production`)

- [ ] `NODE_ENV=production`
- [ ] `MP_DEV_SIMULATE=false`
- [ ] `PII_ENCRYPTION_KEY` (≥32 chars) — `openssl rand -base64 32`
- [ ] `MERCADOPAGO_WEBHOOK_SECRET` (painel MP)
- [ ] `CRON_SECRET` (≥32 chars)
- [ ] `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- [ ] `DATABASE_URL` apontando para `school_db`
- [ ] `CORS_ORIGIN=https://ct095.com,https://www.ct095.com`
- [ ] (Opcional) `CRON_ALLOWED_IPS=127.0.0.1,::1`

## Mercado Pago

- [ ] OAuth redirect: `https://api.ct095.com/api/v1/marketplace/mp/oauth/callback`
- [ ] Webhook: `https://api.ct095.com/api/v1/webhooks/mercadopago`
- [ ] `MERCADOPAGO_APP_ID` = Client ID (número)
- [ ] `MERCADOPAGO_CLIENT_SECRET` = Client Secret
- [ ] `MERCADOPAGO_OAUTH_PKCE=true` se PKCE ativo no painel

## Firebase

- [ ] Google Sign-in habilitado
- [ ] Domínios: `ct095.com`, `www.ct095.com`, `localhost`
- [ ] Service account no backend

## Vercel (frontend)

- [ ] `NEXT_PUBLIC_FIREBASE_*`
- [ ] `NEXT_PUBLIC_API_URL=https://api.ct095.com/api/v1`
- [ ] `NEXT_PUBLIC_APP_URL=https://www.ct095.com`
- [ ] `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`

## Pós-deploy

```bash
curl -s https://api.ct095.com/api/v1/health
# → { "status": "ok", ... }

bash /opt/school-backend/deploy/post-deploy.sh
```

## Smoke test

- [ ] Login Google em aba anônima
- [ ] Cadastro email/senha
- [ ] Admin conecta MP em Configurações
- [ ] Compra Pix de teste → webhook confirma
- [ ] Inscrição em aula

## Cron (VPS)

```bash
0 8 * * * curl -sS -X POST https://api.ct095.com/api/v1/internal/cron/subscription-maintenance \
  -H "Authorization: Bearer SEU_CRON_SECRET" >> /var/log/school-cron.log 2>&1
```
