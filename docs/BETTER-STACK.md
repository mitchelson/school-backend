# Better Stack — CT095 School API

Observabilidade via [Better Stack](https://betterstack.com): **logs** (Logtail) e **uptime** (monitor HTTP).

Produto separado do Zenvix — source **CT095 School API** no painel.

## 1. Criar source de logs

1. Acesse [Better Stack → Telemetry → Sources](https://telemetry.betterstack.com/team/0/sources).
2. **Connect source** → **JavaScript** (Node.js).
3. Nome sugerido: `CT095 School API`.
4. Copie o **Source token** e o **Ingesting host** (endpoint).

## 2. Variáveis de ambiente

Em `.env.production` na VPS (ou `.env.development.local` localmente):

```bash
BETTER_STACK_SOURCE_TOKEN=seu_token_aqui
BETTER_STACK_LOGS_ENDPOINT=https://SEU_INGESTING_HOST
BETTER_STACK_SERVICE_NAME=school-api
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `BETTER_STACK_SOURCE_TOKEN` | Sim (para enviar logs) | Token do source no painel |
| `BETTER_STACK_LOGS_ENDPOINT` | Recomendada | Host de ingestão (`https://…`) |
| `BETTER_STACK_SERVICE_NAME` | Não | Tag `service` nos logs (padrão: `school-api`) |

Sem `BETTER_STACK_SOURCE_TOKEN`, a API continua funcionando e loga só no stdout (PM2 / terminal).

## 3. O que é enviado

- Logs do NestJS (`Logger` em services, filters, etc.)
- Requisições HTTP via middleware (`http_method`, `http_path`, `http_status`, `duration_ms`, `client_ip`)
- Erros 5xx via `HttpExceptionFilter` (mensagem + stack estruturados)
- Mensagens de bootstrap (porta, ambiente)

Campos comuns: `service`, `environment`, `nest_context`.

## 4. Health checks (load balancer / uptime)

| Endpoint | Uso | Resposta |
|----------|-----|----------|
| `GET /api/v1/health/live` | Liveness — processo no ar | Sempre `200` + `{ status: "ok" }` |
| `GET /api/v1/health/ready` | Readiness — DB conectado | `200` se DB OK, `503` se degradado |
| `GET /api/v1/health` | Uptime monitor geral | `200` se saudável, `503` se degradado |

**Nginx / load balancer:** use `/health/live` para probe de processo e `/health/ready` para tráfego (só roteia quando DB responde).

## 5. Uptime monitor

1. [Better Stack → Uptime → Monitors](https://uptime.betterstack.com/)
2. **Create monitor** → HTTP(s)
3. URL: `https://api.ct095.com/api/v1/health/ready`
4. Intervalo sugerido: 1–3 min
5. Alertas: e-mail / Slack conforme preferência

O endpoint `/health/ready` retorna HTTP `503` quando o PostgreSQL não responde.

## 6. Deploy na VPS

Após adicionar as variáveis em `/opt/school-backend/.env.production`:

```bash
cd /opt/school-backend
bash deploy/post-deploy.sh
```

Ou reinicie o PM2:

```bash
pm2 restart school-api
```

## 6. Verificar

1. Liveness: `curl https://api.ct095.com/api/v1/health/live`
2. Readiness: `curl -i https://api.ct095.com/api/v1/health/ready`
3. No painel Better Stack → **Live tail** do source **CT095 School API**
4. Deve aparecer log HTTP estruturado nas requisições

## 7. Desenvolvimento local

Opcional — use um source de **dev** ou deixe vazio:

```bash
# .env.development.local — sem token = só console
# BETTER_STACK_SOURCE_TOKEN=
```

Para testar envio local, preencha o token e reinicie `npm run dev`.
