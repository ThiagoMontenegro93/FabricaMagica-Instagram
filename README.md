# 🎃 A Fábrica Mágica — Sistema de Locação Premium

> **Alugue o Medo. Celebre o Luxo.**
> Atelier de Festas Sombrias · [@afabricamagica](https://www.instagram.com/afabricamagica/) · Av. Dom Helder Câmara, 6001 – Engenho de Dentro, RJ · WhatsApp [(21) 97284-8645](https://wa.me/5521972848645)

Plataforma de locação de temas de festa (Halloween de luxo, balões, sazonais) e personagens vivos: catálogo, agenda sem overbooking, cadastro 18+ com LGPD, pagamento Pix/cartão via Mercado Pago e painel do dono com estoque, reservas e privacidade de documentos.

A especificação completa está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Estrutura

```
apps/
  web/        Next.js 14: site do cliente, painel admin e a API (Route Handlers em src/app/api)
packages/
  shared/     Regras de negócio puras + schemas Zod (CPF, 18+, preço, estoque, agenda)
  db/         Prisma: schema, migrações e seed do PostgreSQL
docs/         Arquitetura, premissas e decisões
```

## Requisitos

- Node.js 20+ (testado em 22)
- pnpm 10 (`corepack enable`)
- Docker (para o PostgreSQL/Redis locais) ou um PostgreSQL 16 próprio

## Como rodar

```bash
cp .env.example .env          # ajuste DATABASE_URL se não usar o docker compose
docker compose up -d          # Postgres 16 + Redis 7
pnpm install
pnpm db:generate
pnpm db:deploy                # aplica as migrações
pnpm db:seed                  # tenant, configurações, temas, personagens e o dono (ADMIN_EMAIL/ADMIN_PASSWORD)
pnpm --filter @fabrica/web dev   # http://localhost:3000
```

Entre em `/login` com `ADMIN_EMAIL`/`ADMIN_PASSWORD` para abrir `/admin/configuracoes`.

Com o docker compose, use `DATABASE_URL="postgresql://fabrica:fabrica_dev@localhost:5432/fabrica_magica?schema=public"`.

## Como testar

```bash
pnpm test        # regras de negócio + testes de integração das rotas num Postgres real
pnpm typecheck
```

Os testes de integração apagam o banco: eles só rodam se o nome do banco em `DATABASE_URL` contiver `test`
(ex.: `fabrica_magica_test`). Crie-o com `createdb fabrica_magica_test` e rode `pnpm db:deploy` apontando para ele.

## API

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| POST | `/api/auth/register` | público | cria conta de CLIENTE e abre sessão |
| POST | `/api/auth/login` | público | login (5/min por e-mail, 20/min por IP) |
| POST | `/api/auth/refresh` | sessão | rotaciona o refresh token |
| POST | `/api/auth/logout` | sessão | revoga o refresh |
| GET | `/api/auth/me` | logado | usuário atual |
| GET | `/api/tenant/public-settings` | público | WhatsApp e modo de documentos (upload ou WhatsApp) |
| GET | `/api/tenant/settings` | dono, atendente | configurações |
| PATCH | `/api/tenant/settings` | dono | toggle de documentos, retenção, taxa fds (auditado) |
| POST | `/api/clients` | cliente, equipe | cadastro de locação 18+ |
| GET | `/api/clients?q=` | dono, atendente | lista (atendente vê CPF mascarado) |
| GET | `/api/admin/audit-logs` | dono | logs de acesso |
| GET | `/api/health` | público | healthcheck do deploy |
| GET | `/api/themes?category=&q=&availableOn=&returnOn=` | público | catálogo com disponibilidade na data |
| GET | `/api/themes/:idOuSlug` | público | detalhe do tema |
| POST | `/api/themes` | dono | novo tema (sem limite de quantidade) |
| PATCH | `/api/themes/:id` | dono; atendente só `status` | editar ou pôr em manutenção |
| DELETE | `/api/themes/:id` | dono | exclusão lógica (bloqueada com reserva em aberto) |
| GET/POST | `/api/characters` | público / dono | personagens vivos |
| PATCH/DELETE | `/api/characters/:id` | dono | editar, desativar, excluir |
| GET | `/api/characters/:id/schedule` | equipe | agenda (festas e bloqueios) |
| POST/DELETE | `/api/characters/:id/block[/:blockId]` | equipe | bloquear ou liberar horário sem sobreposição |

Sessão: access token JWT de 15 min e refresh opaco de 30 dias, ambos em cookie `httpOnly` `SameSite=Lax`.
O PWA pode mandar `Authorization: Bearer`. POSTs de outra origem são recusados (anti-CSRF).

Painel do dono: `/admin/temas`, `/admin/personagens`, `/admin/configuracoes`.

Telas: [catálogo](docs/screens/catalogo.png), [tema](docs/screens/tema.png), [admin de temas](docs/screens/admin-temas.png), [novo tema](docs/screens/admin-novo-tema.png), [início](docs/screens/home.png), [cadastro com bloqueio 18+](docs/screens/cadastro-menor.png), [privacidade do dono](docs/screens/admin-privacidade.png).

O CI (GitHub Actions) roda typecheck, testes, migrações num Postgres limpo e o seed duas vezes (idempotência).

## Regras já implementadas em `@fabrica/shared`

| Regra | Onde |
|---|---|
| RN01 idade mínima 18 (front e back pelo mesmo schema) | `age.ts`, `ClientSchema` |
| RN04 CPF com dígitos verificadores | `cpf.ts` |
| RN02 sem overbooking de tema (com reserva temporária do PENDENTE) | `availability.ts` |
| RN03 personagem não fica em duas festas | `availability.ts` |
| RN07 taxa de fim de semana (sex/sáb, multiplicador por tema) | `pricing.ts` |
| RN08 atraso após 24h | `availability.ts` |
| RN10 transições de status da reserva | `status.ts` |
| RN11 LGPD e contrato obrigatórios | `ClientSchema` |
| RF12 retenção 30/90/365 | `TenantSettingsSchema` |
| RF13 links wa.me com mensagem pronta | `whatsapp.ts` |

## Erros comuns

- **`Environment variable not found: DATABASE_URL`**: crie o `.env` na raiz e exporte a variável, ou rode os comandos com `DATABASE_URL=... pnpm db:deploy`.
- **`P1001 Can't reach database server`**: o Postgres não está de pé; rode `docker compose up -d` e aguarde o healthcheck.
- **`@prisma/client did not initialize yet`**: rode `pnpm db:generate`.
- **`JWT_SECRET ausente ou curto`**: gere um com `openssl rand -base64 48` e coloque no `.env`.
- **Testes recusam rodar**: o banco de `DATABASE_URL` precisa ter `test` no nome.

## Segurança

Nenhum segredo vai para o repositório: `.env` está no `.gitignore` e o `.env.example` só tem placeholders. Documentos sensíveis só são armazenados se o dono ligar `hostSensitiveDocs` (desligado por padrão).
