# Políticas do produto — CT095 School

## Inscrições em aulas

- Inscrição consome **vaga do plano semanal** ou **1 crédito avulso**.
- **Cancelar inscrição** antes do início da aula não devolve crédito nem “devolve” uso semanal do plano.

## Planos e renovação

- Planos são **pré-pagos por período** (vigência `validUntil`), não assinatura recorrente automática no Mercado Pago.
- O aluno renova manualmente em **Saldos → Planos** ou via e-mail de aviso de vencimento (cron diário).
- Plano expirado bloqueia novas inscrições até nova compra.

## Pagamentos

- Pix pendente pode ser cancelado pelo aluno; não libera plano/créditos.
- Confirmação via webhook Mercado Pago + validação na API MP.
- Em desenvolvimento: `MP_DEV_SIMULATE=true` simula Pix; `dev-confirm` só nesse modo.

## Contas e papéis

- Cadastro público cria sempre role **`aluno`**.
- **`admin`** e **`owner`** são atribuídos via seed ou painel owner.
- Admin pode pré-cadastrar aluno (convite); o aluno vincula a conta no primeiro login com o mesmo e-mail.

## Dados pessoais

- Telefone é solicitado para contato da escola (WhatsApp).
- CPF pode ser exigido no checkout Mercado Pago.
