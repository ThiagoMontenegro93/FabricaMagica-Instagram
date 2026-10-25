# 🎃 A Fábrica Mágica — Sistema de Locação Premium

> **Alugue o Medo. Celebre o Luxo.**
> Atelier de Festas Sombrias · [@afabricamagica](https://www.instagram.com/afabricamagica/) · Av. Dom Helder Câmara, 6001 – Engenho de Dentro, RJ · WhatsApp [(21) 97284-8645](https://wa.me/5521972848645)

Plataforma de locação de temas de festa (Halloween de luxo, balões, sazonais) e personagens vivos: catálogo, agenda sem overbooking, cadastro 18+ com LGPD, pagamento Pix/cartão via Mercado Pago e painel do dono com estoque, reservas e privacidade de documentos.

A especificação completa está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Estrutura

```
apps/
  web/        Next.js 14 (cliente + admin + PWA)        ← próximos sprints
  api/        API (decisão pendente, ver docs)          ← próximos sprints
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
pnpm db:seed                  # tenant Fábrica Mágica, configurações, temas e personagens de exemplo
```

Com o docker compose, use `DATABASE_URL="postgresql://fabrica:fabrica_dev@localhost:5432/fabrica_magica?schema=public"`.

## Como testar

```bash
pnpm test        # 26 testes das regras de negócio (vitest) + validação do schema Prisma
pnpm typecheck
```

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

## Segurança

Nenhum segredo vai para o repositório: `.env` está no `.gitignore` e o `.env.example` só tem placeholders. Documentos sensíveis só são armazenados se o dono ligar `hostSensitiveDocs` (desligado por padrão).
