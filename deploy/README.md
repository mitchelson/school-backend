# Deploy school-backend

Mesmo modelo do **zenvix-store/backend**:

1. **CI** (`ci.yml`) — PR: testes + build.
2. **Deploy** (`deploy.yml`) — `main`: build no GitHub → **SCP** para `/opt/school-backend` → SSH só roda migrate + PM2.

## VPS (uma vez)

```bash
# Na VPS, como root — após clonar ou copiar este repo
bash deploy/setup-vps.sh
```

Crie `/opt/school-backend/.env.production` com credenciais reais (não vai no GitHub).

Na VPS com **dois PostgreSQL** (ex. `ct095` na 5432 e `school_db` na 5433), o `DATABASE_URL` do school deve apontar para a porta do banco **school_db** apenas.

### Domínio api.ct095.com

Passo a passo na VPS: **[deploy/API-DOMAIN.md](./API-DOMAIN.md)** — desativa o nginx do ct095-api nesse host e aponta para o school na porta **3002**.

### Erro P3005 (schema não vazio)

Se o banco já foi criado com `db push` ou SQL manual, o `post-deploy.sh` faz **baseline** automático da migration `20250327000000_init`. Manualmente:

```bash
cd /opt/school-backend && ln -sf .env.production .env
./node_modules/.bin/prisma migrate resolve --applied 20250327000000_init
./node_modules/.bin/prisma migrate deploy
```

## GitHub (environment `ENV`)

- `VPS_HOST`
- `VPS_USERNAME` (ou `VPS_USER`)
- `VPS_SSH_KEY` ou `VPS_PASSWORD`
- `VPS_PORT` (opcional)

## Manual na VPS (debug)

```bash
bash /opt/school-backend/deploy/post-deploy.sh
```

## Better Stack (logs + uptime)

Ver [docs/BETTER-STACK.md](../docs/BETTER-STACK.md) — produto **CT095 School API**, separado do Zenvix.

## Firebase (login em www.ct095.com)

Se o console do navegador mostrar que **www.ct095.com não está autorizado para OAuth**, o admin não consegue nem chamar a API do Mercado Pago.

**Correção:** Firebase Console → Authentication → Settings → **Authorized domains** → adicionar `www.ct095.com` e `ct095.com`.

Passo a passo: [docs/FIREBASE-AUTH-DOMAINS.md](../docs/FIREBASE-AUTH-DOMAINS.md).

## Erro ao conectar MP: `Invalid prisma.user.update()` / coluna inexistente

O OAuth do Mercado Pago pode ter funcionado, mas o **banco** ainda não tem todas as colunas `mp*` em `User`.

Na VPS:

```bash
cd /opt/school-backend && ln -sf .env.production .env
./node_modules/.bin/prisma db execute --file deploy/ensure-platform-settings.sql --schema prisma/schema.prisma
./node_modules/.bin/prisma migrate deploy
bash deploy/post-deploy.sh
```

Confira: `curl -s https://api.ct095.com/api/v1/health` → `schema.userMpColumns` deve ser `true`.

## Mercado Pago OAuth (conectar escola)

Se o MP mostrar *“não foi possível conectar o aplicativo”*:

1. Em [developers.mercadopago.com](https://www.mercadopago.com.br/developers/panel/app) → sua aplicação → **URLs de redirecionamento**, cadastre **exatamente**:
   `https://api.ct095.com/api/v1/marketplace/mp/oauth/callback` (sem `/` no final).
2. Em `.env.production`:
   - `MERCADOPAGO_APP_ID` = **número** da aplicação (Client ID), não `APP_USR-…`
   - `MERCADOPAGO_CLIENT_SECRET` = Client Secret da aplicação, não Access Token
   - `MERCADOPAGO_OAUTH_REDIRECT_URI` = mesma URL do passo 1
3. Secret para OAuth state (mín. 32 caracteres): `MERCADOPAGO_OAUTH_STATE_SECRET` ou `CRON_SECRET` / `PII_ENCRYPTION_KEY` já preenchidos no `.env.production`.
4. No painel da aplicação **5499739331207762** (ou a sua): em **Detalhes** → se **PKCE** estiver ligado, no servidor `MERCADOPAGO_OAUTH_PKCE=true` (padrão após o último deploy).
5. Após deploy, admin autenticado: `GET /api/v1/marketplace/mp/oauth/setup` — lista checks da configuração.

**Seleção de país antes do login:** o backend usa por padrão `https://auth.mercadopago.com.br/authorization` (Brasil). A URL global `auth.mercadopago.com` mostra seletor de país — não use em produção CT095 salvo app internacional.

**HTTP 400 em** `auth.mercadopago.com/authorization` quase sempre é:
- redirect URI não cadastrada ou diferente da env; ou
- PKCE obrigatório no app e `code_challenge` ausente na URL (corrigido no backend com `MERCADOPAGO_OAUTH_PKCE=true`).
