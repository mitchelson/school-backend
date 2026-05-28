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
