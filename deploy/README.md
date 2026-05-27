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

## GitHub (environment `ENV`)

- `VPS_HOST`
- `VPS_USERNAME` (ou `VPS_USER`)
- `VPS_SSH_KEY` ou `VPS_PASSWORD`
- `VPS_PORT` (opcional)

## Manual na VPS (debug)

```bash
bash /opt/school-backend/deploy/post-deploy.sh
```
