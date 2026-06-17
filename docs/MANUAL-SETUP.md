# Configuração manual — CT095 School

Tudo que **você** precisa fazer fora do código: painéis, secrets, deploy e validação.

---

## 1. Firebase — Google Login + domínios

1. [Firebase Console](https://console.firebase.google.com/) → projeto CT095
2. **Authentication** → **Sign-in method** → **Google** → **Enable**
3. E-mail de suporte do projeto (obrigatório)
4. **Settings** → **Authorized domains**:
   - `localhost`
   - `ct095.com`
   - `www.ct095.com`

### OAuth consent (Google Cloud)

Se aparecer “app não verificado”:

- [Google Cloud Console](https://console.cloud.google.com/) → **OAuth consent screen**
- Nome: **CT095**, domínios autorizados, e-mail de suporte
- Em modo teste: adicionar test users

---

## 2. Firebase — Service Account (backend)

1. Firebase → **Project settings** → **Service accounts**
2. **Generate new private key** (JSON)
3. No VPS `.env.production`:

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@....iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Nunca commitar esses valores.

---

## 3. Frontend — variáveis (Vercel)

Em **school-frontend** → Settings → Environment Variables:

| Variável | Produção |
|----------|----------|
| `NEXT_PUBLIC_API_URL` | `https://api.ct095.com/api/v1` |
| `NEXT_PUBLIC_APP_URL` | `https://www.ct095.com` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase → Project settings → Web app |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `xxx.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | |
| `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | Painel MP → credenciais de produção |

**Dev local:** copie `.env.development.local.example` → `.env.development.local`

---

## 4. Backend — secrets obrigatórios (VPS)

Arquivo: `/opt/school-backend/.env.production`

### Gerar chaves

```bash
openssl rand -base64 32   # PII_ENCRYPTION_KEY
openssl rand -hex 32      # CRON_SECRET
```

### Obrigatórios em produção

```bash
NODE_ENV=production
MP_DEV_SIMULATE=false

PII_ENCRYPTION_KEY=...              # mín. 32 caracteres
MERCADOPAGO_WEBHOOK_SECRET=...      # painel MP → Webhooks
CRON_SECRET=...                     # mín. 32 caracteres

DATABASE_URL=postgresql://...
CORS_ORIGIN=https://ct095.com,https://www.ct095.com
APP_BASE_URL=https://www.ct095.com
API_PUBLIC_URL=https://api.ct095.com
```

A API **não inicia** sem `PII_ENCRYPTION_KEY`, `MERCADOPAGO_WEBHOOK_SECRET` e `MP_DEV_SIMULATE=false`.

### Opcionais recomendados

```bash
CRON_ALLOWED_IPS=127.0.0.1,::1
MERCADOPAGO_OAUTH_STATE_SECRET=...
THROTTLE_LIMIT=120
THROTTLE_AUTH_LIMIT=20
```

---

## 5. Mercado Pago

### Webhook

1. [developers.mercadopago.com](https://www.mercadopago.com.br/developers/panel/app)
2. **Webhooks** → URL:
   `https://api.ct095.com/api/v1/webhooks/mercadopago`
3. Copiar **secret** → `MERCADOPAGO_WEBHOOK_SECRET`

### OAuth (conectar escola)

1. **URLs de redirecionamento** (exatamente):
   `https://api.ct095.com/api/v1/marketplace/mp/oauth/callback`
2. `.env.production`:
   - `MERCADOPAGO_APP_ID` = número da aplicação (Client ID)
   - `MERCADOPAGO_CLIENT_SECRET` = Client Secret
   - `MERCADOPAGO_OAUTH_REDIRECT_URI` = mesma URL acima
   - `MERCADOPAGO_OAUTH_PKCE=true` (se PKCE no painel)

### Credenciais de checkout

- `MERCADOPAGO_ACCESS_TOKEN` — token da aplicação marketplace
- Chave pública no frontend: `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY`

---

## 6. E-mail (Resend) — opcional

```bash
RESEND_API_KEY=...
EMAIL_FROM="CT095 <noreply@ct095.com>"
FRONTEND_URL=https://www.ct095.com
```

Cron de aviso de plano: ver seção 8.

---

## 7. Deploy

### Backend (VPS)

```bash
# Após push em main (GitHub Actions) ou manual:
cd /opt/school-backend
ln -sf .env.production .env
bash deploy/post-deploy.sh
```

Checklist completo: [deploy/CHECKLIST.md](../deploy/CHECKLIST.md)

### Frontend (Vercel)

Push na branch conectada → deploy automático com env vars da seção 3.

---

## 8. Cron na VPS

```bash
sudo crontab -e
```

```cron
0 8 * * * curl -sS -X POST https://api.ct095.com/api/v1/internal/cron/subscription-maintenance \
  -H "Authorization: Bearer SEU_CRON_SECRET" >> /var/log/school-cron.log 2>&1
```

Com `CRON_ALLOWED_IPS=127.0.0.1,::1` o curl deve rodar **na própria VPS**.

---

## 9. Usuários admin / owner

Seed cria `admin@ct095.com` e `owner@ct095.com` com UID placeholder.

**Primeiro login com Google** usando o **mesmo e-mail** vincula automaticamente a conta.

Alternativas:

- Criar usuário no Firebase com email/senha e mesmo e-mail do seed
- Promover roles no painel `/owner/usuarios`

---

## 10. Better Stack (logs) — opcional

```bash
BETTER_STACK_SOURCE_TOKEN=...
BETTER_STACK_LOGS_ENDPOINT=...
BETTER_STACK_SERVICE_NAME=school-api
```

---

## 11. Testes pós-configuração

```bash
# API
curl -s https://api.ct095.com/api/v1/health

# CORS
curl -sI -X OPTIONS "https://api.ct095.com/api/v1/plans" \
  -H "Origin: https://www.ct095.com" \
  -H "Access-Control-Request-Method: GET"
```

No navegador (aba anônima):

1. `https://www.ct095.com/login` → **Continuar com Google**
2. Completar telefone se pedido
3. Admin → Configurações → Conectar Mercado Pago
4. Aluno → comprar plano (Pix real em staging/prod)

---

## 12. Problemas comuns

| Sintoma | Solução |
|---------|---------|
| API não sobe | Verificar `PII_ENCRYPTION_KEY`, `MERCADOPAGO_WEBHOOK_SECRET`, `MP_DEV_SIMULATE=false` |
| `auth/unauthorized-domain` | Domínios Firebase (seção 1) |
| Google desabilitado | Habilitar provider Google |
| MP OAuth `redirect_uri` | URL idêntica no painel MP e `.env` |
| Webhook não confirma pagamento | Secret correto + URL pública |
| Admin Google não entra | Mesmo e-mail do seed ou email/senha |
| Redirect loop no app | Limpar cookies; login de novo |

---

## O que o código já faz (não precisa configurar)

- Validação Firebase em todas as rotas protegidas
- Login Google + cadastro seguro (`/auth/session`, `/auth/register`)
- Rate limiting por IP
- Webhook HMAC + confirmação MP API
- Tokens MP criptografados (com `PII_ENCRYPTION_KEY`)
- Convite admin → aluno vincula no primeiro login
- Cookie de sessão no frontend (middleware UX)
