# CT095 School — Backend

API NestJS para gestão da escola de futvôlei CT095: planos, créditos, aulas, inscrições, presença e pagamentos Mercado Pago (marketplace split).

## Stack

- NestJS 11 + Prisma + PostgreSQL
- Firebase Admin (auth JWT)
- Mercado Pago (Pix, cartão, OAuth marketplace)
- Resend (e-mail), Better Stack (logs)

## Papéis

| Role | Descrição |
|------|-----------|
| `aluno` | Planos, créditos, aulas, pagamentos |
| `admin` | Escola: turmas, alunos, MP conectado |
| `owner` | Plataforma CT095: split, usuários, ops |

## Desenvolvimento local

```bash
npm install
npm run setup:dev    # .env + docker postgres
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3002/api/v1
```

Copie `.env.development.example` → `.env.development.local`.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | API com watch |
| `npm test` | Testes unitários |
| `npm run test:e2e` | Testes e2e (requer Postgres) |
| `npm run build` | Build produção |

## Endpoints principais

- `POST /auth/session` — login Google / primeira sessão
- `POST /auth/register` — cadastro email (token Firebase obrigatório)
- `GET /auth/me` — perfil autenticado
- `POST /webhooks/mercadopago` — webhook pagamentos
- `GET /health` — saúde da API

## Deploy

Ver [deploy/README.md](./deploy/README.md) e [deploy/CHECKLIST.md](./deploy/CHECKLIST.md).

## Configuração manual (produção)

**Tudo que exige painel externo ou secrets:** [docs/MANUAL-SETUP.md](./docs/MANUAL-SETUP.md)

## Políticas do produto

[docs/POLICIES.md](./docs/POLICIES.md)
