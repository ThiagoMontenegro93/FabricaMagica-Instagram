# Como colocar a Fábrica Mágica no ar

Guia passo a passo para publicar o site com domínio próprio, pagamento real e fotos guardadas com segurança.
Leva cerca de 1 hora na primeira vez. Nenhuma chave vai para o código nem para o chat: todas ficam no painel da hospedagem.

## O que você vai usar

| Peça | Serviço sugerido | Custo aproximado |
|---|---|---|
| Site + API (Next.js) | Railway ou Render | US$ 5 a 7/mês |
| Banco PostgreSQL 16 | Railway (Postgres) ou Neon | incluso / grátis no início |
| Fotos, vídeo e GIF dos temas | Cloudflare R2 (bucket público) | grátis até 10 GB |
| Documentos dos clientes (se ligar) | Cloudflare R2 (bucket **privado**, outro) | grátis até 10 GB |
| Domínio, DNS, CDN e proteção | Cloudflare | só o domínio |
| Pagamentos | Mercado Pago | taxa por venda |
| Rotina de hora em hora | cron do Railway/Render ou cron-job.org | grátis |

## 1. Banco de dados

1. No Railway, crie um projeto e adicione **PostgreSQL**.
2. Copie a `DATABASE_URL` que ele mostra (fica só no painel).

## 2. Site

1. **New Service → GitHub repo** → `FabricaMagica-Instagram`.
2. Configurações do serviço:
   - Build: `corepack enable && pnpm install --frozen-lockfile && pnpm db:generate && pnpm --filter @fabrica/web build`
   - Start: `pnpm db:deploy && pnpm --filter @fabrica/web start -p $PORT`
   - Healthcheck: `/api/health`
3. Variáveis (aba *Variables*). Gere os segredos com `openssl rand -base64 48` (JWT) e `openssl rand -base64 32` (documentos):

```
DATABASE_URL="(do passo 1)"
JWT_SECRET="SECRET_KEY_AQUI_MINIMO_32_CARACTERES"
TENANT_SLUG="afabricamagica"
APP_ORIGIN="https://SEU_DOMINIO_AQUI"
ADMIN_EMAIL="email-do-dono@exemplo.com"
ADMIN_PASSWORD="SENHA_FORTE_AQUI"

STORAGE_DRIVER="s3"
S3_ENDPOINT="https://ACCOUNT_ID.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_ACCESS_KEY_ID="API_KEY_AQUI"
S3_SECRET_ACCESS_KEY="SECRET_KEY_AQUI"
S3_MEDIA_BUCKET="fabrica-midia"
S3_MEDIA_PUBLIC_URL="https://midia.SEU_DOMINIO_AQUI"
S3_BUCKET="fabrica-docs"
DOCS_ENCRYPTION_KEY="CHAVE_AES256_BASE64_AQUI"

MERCADOPAGO_ACCESS_TOKEN="TOKEN_AQUI"
MERCADOPAGO_WEBHOOK_SECRET="SECRET_KEY_AQUI"
CRON_SECRET="SECRET_KEY_AQUI"
```

4. Depois do primeiro deploy, rode uma vez no *Shell* do serviço: `pnpm db:seed` (cria a loja, os 6 temas iniciais, os personagens e o login do dono).

> Não defina `PAYMENTS_SIMULATOR` em produção. O botão de teste só aparece fora de produção.

## 3. Cloudflare R2 (fotos e documentos)

1. Cloudflare → R2 → crie dois buckets: `fabrica-midia` e `fabrica-docs`.
2. `fabrica-midia`: *Settings → Custom domain* → `midia.SEU_DOMINIO`. Ele fica público (são as fotos do catálogo).
3. `fabrica-docs`: **não** ligue acesso público. Os documentos já vão criptografados (AES-256) e só abrem por link assinado de 15 minutos para a equipe logada.
4. *Manage R2 API tokens* → token com leitura e escrita só nesses dois buckets. Copie a chave e o segredo para as variáveis acima.

## 4. Domínio

1. Coloque o domínio na Cloudflare (troque os nameservers no registro.br).
2. No Railway/Render, *Custom domain* → `SEU_DOMINIO`. Crie o CNAME que ele pedir, com a nuvem laranja (proxy) ligada.
3. Ajuste `APP_ORIGIN` para `https://SEU_DOMINIO` (sem barra no fim). Sem isso o login recusa os pedidos (proteção anti-CSRF).

## 5. Mercado Pago

1. [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers) → *Suas integrações* → crie a aplicação "Fábrica Mágica".
2. **Credenciais de produção** → copie o *Access Token* para `MERCADOPAGO_ACCESS_TOKEN`.
3. **Webhooks** → URL `https://SEU_DOMINIO/api/payments/webhook`, evento **Pagamentos**. Copie a *assinatura secreta* para `MERCADOPAGO_WEBHOOK_SECRET`.
4. Teste com as credenciais de teste antes: uma reserva, Pix gerado, pagamento aprovado e a reserva vira "Pago" sozinha.

Como funciona: o cliente reserva, o estoque fica guardado por 30 minutos, ele paga com Pix (QR ou copia e cola) ou cartão em até 12x. O Mercado Pago avisa o site, o site confere a assinatura e o valor e marca como pago. Valor diferente ou pagamento depois de cancelada aparece no painel em "Pagamentos para conferir".

## 6. Rotina de hora em hora

Libera reservas não pagas, marca atrasos e apaga documentos vencidos pela política de retenção.

- Railway: *Cron* `0 * * * *` com o comando
  `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU_DOMINIO/api/cron/rotina`
- Ou em [cron-job.org](https://cron-job.org) com o mesmo endereço e o cabeçalho `Authorization`.

## 7. Conferência final

- [ ] `https://SEU_DOMINIO/api/health` responde `ok`
- [ ] Login do dono abre o painel em `/admin`
- [ ] Foto nova num tema aparece no catálogo (veio do R2)
- [ ] Reserva de teste → Pix → aparece como paga no painel
- [ ] Em *Configurações*, defina se vai receber documentos pelo site ou pelo WhatsApp

## Se algo der errado

| Sintoma | Causa provável |
|---|---|
| Login volta "Origem não permitida" | `APP_ORIGIN` diferente do endereço do site |
| Foto some depois de um deploy | `STORAGE_DRIVER` ainda em `local` |
| Pix não confirma sozinho | URL do webhook errada ou `MERCADOPAGO_WEBHOOK_SECRET` diferente |
| Upload de documento desligado | falta `DOCS_ENCRYPTION_KEY` (o painel avisa) |
| Reservas pendentes não somem | rotina de hora em hora não configurada |
