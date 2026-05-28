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
- Requisições HTTP (método, URL, status, duração)
- Erros não tratados via `HttpExceptionFilter`
- Mensagens de bootstrap (porta, ambiente)

Campos estruturados nas requisições: `http_method`, `http_url`, `http_status`, `duration_ms`, `service`, `nest_context`.

## 4. Uptime monitor

1. [Better Stack → Uptime → Monitors](https://uptime.betterstack.com/)
2. **Create monitor** → HTTP(s)
3. URL: `https://api.ct095.com/api/v1/health`
4. Intervalo sugerido: 1–3 min
5. Alertas: e-mail / Slack conforme preferência

O endpoint `/health` retorna `status: ok` quando DB e schema estão OK.

## 5. Deploy na VPS

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

1. Faça uma requisição: `curl https://api.ct095.com/api/v1/health`
2. No painel Better Stack → **Live tail** do source **CT095 School API**
3. Deve aparecer log HTTP e resposta do health check

## 7. Desenvolvimento local

Opcional — use um source de **dev** ou deixe vazio:

```bash
# .env.development.local — sem token = só console
# BETTER_STACK_SOURCE_TOKEN=
```

Para testar envio local, preencha o token e reinicie `npm run dev`.
