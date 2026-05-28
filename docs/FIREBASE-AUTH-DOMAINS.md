# Firebase — domínios autorizados (produção)

Se no navegador aparecer:

> The current domain is not authorized for OAuth operations… Add your domain (**www.ct095.com**) to the OAuth redirect domains list in the Firebase console

o **login do admin/aluno** e o botão **Conectar Mercado Pago** falham antes do redirect ao MP, porque a API exige token Firebase válido.

## Correção (uma vez)

1. Abra [Firebase Console](https://console.firebase.google.com/) → projeto do CT095.
2. **Authentication** → aba **Settings** (Configurações).
3. Em **Authorized domains** (Domínios autorizados), clique **Add domain** e inclua **todos**:
   - `www.ct095.com`
   - `ct095.com` (sem `www`, se alguém acessar assim)
   - `localhost` (já costuma existir — dev)
4. Salve.

Não confunda com o painel do **Mercado Pago** (URLs de redirecionamento OAuth do MP apontam para `api.ct095.com`, não para o Firebase).

## Variáveis no frontend (Vercel)

Confirme no painel da Vercel (school-frontend):

| Variável | Exemplo |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `seu-projeto.firebaseapp.com` |
| `NEXT_PUBLIC_API_URL` | `https://api.ct095.com/api/v1` |
| `NEXT_PUBLIC_APP_URL` | `https://www.ct095.com` |

`AUTH_DOMAIN` é o domínio do projeto Firebase, **não** `www.ct095.com`, a menos que você tenha configurado domínio customizado de auth no Firebase.

## Depois do Firebase: Mercado Pago OAuth

Só então use **Configurações → Conectar Mercado Pago**. No [developers.mercadopago.com](https://www.mercadopago.com.br/developers/panel/app), cadastre a redirect URI **idêntica** à do servidor:

`https://api.ct095.com/api/v1/marketplace/mp/oauth/callback`

Detalhes: [deploy/README.md](../deploy/README.md#mercado-pago-oauth-conectar-escola).

## Teste rápido

1. Abra `https://www.ct095.com/login` em aba anônima → login admin deve funcionar sem erro no console.
2. Vá em **Configurações** → **Conectar Mercado Pago** → deve abrir `auth.mercadopago.com.br` (login + tela “autorizar aplicativo”, sem seletor de país).
3. Após autorizar, volta para `https://www.ct095.com/admin/configuracoes?mp=connected`.

Admin autenticado: `GET https://api.ct095.com/api/v1/marketplace/mp/oauth/setup` — lista checks da config MP no servidor.
