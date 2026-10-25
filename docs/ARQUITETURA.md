# Arquitetura — A Fábrica Mágica

Fonte: *Prompt Mestre Consolidado v4.0* (out/2026). Este documento registra o entendimento, as premissas e as decisões tomadas sobre ele.

## 1. Objetivo

Tirar a locação da Fábrica Mágica do WhatsApp/Instagram/planilha e levar para uma plataforma própria que impede overbooking de tema e de personagem, bloqueia menores de idade, guarda aceite de LGPD e contrato, cobra via Mercado Pago e dá ao dono controle de estoque, reservas, avarias e documentos.

## 2. Perfis

| Perfil | Pode |
|---|---|
| SUPER_ADMIN (dono) | tudo, inclusive o toggle `hostSensitiveDocs`, retenção, taxas, logs de acesso |
| ATENDENTE | reserva manual, confirmar pagamento, check-in/out; não mexe em privacidade nem apaga documentos |
| CLIENTE | catálogo, agenda, carrinho, cadastro 18+, pagamento, minhas reservas, favoritos |
| PERSONAGEM | própria agenda, confirmar presença, check-in no local (PWA) |

## 3. Premissas adotadas (ajustáveis)

1. **Monorepo pnpm** com `apps/*` e `packages/*`, como no item 11 do prompt.
2. **Prisma 6** (estável) com PostgreSQL 16. Status, papéis e tipos viraram `enum` no banco em vez de `String`, para o banco recusar valores inválidos.
3. **Valores em centavos (Int)** em tudo. Datas de evento/devolução em `@db.Date` e trafegando como `AAAA-MM-DD`, para não sofrer com fuso.
4. **Taxa de fim de semana incide só sobre temas** (aluguel diário). Personagens são cobrados por hora, sem multiplicador.
5. **Anti-overbooking com reserva temporária**: o prompt manda baixar estoque só no PAGO (RN10), mas isso deixa dois clientes pagarem o último item ao mesmo tempo. Solução: a reserva PENDENTE segura o estoque por 30 min (`holdExpiresAt`); se o pagamento não vier, o hold expira sozinho. A baixa "oficial" continua no PAGO.
6. **CPF único por tenant** (`@@unique([tenantId, cpf])`) em vez de global, para não travar a futura franquia.
7. **Modelos acrescentados** ao schema do prompt por necessidade dos próprios requisitos: `User` e `RefreshToken` (RF01), `ClientDocument` (RN06, com IV/tag do AES-GCM e retenção), `DamageReport` (RN09), `PaymentEvent` (idempotência do webhook), `Favorite` (RF11).
8. **Preços e catálogo do seed são exemplos.** O dono ajusta no painel.
9. **Documentos desligados por padrão** (`hostSensitiveDocs = false`): modo econômico, validação via WhatsApp, menor exposição LGPD.

## 4. Decisão: a API fica dentro do Next.js (escolhida por Thiago em 25/10/2026)

O prompt pede ao mesmo tempo "Base única Next.js 14 + Prisma" (item 1) e `apps/api -> NestJS` (item 11).

| Critério (peso) | A) Só Next.js (Route Handlers + Server Actions) | B) Next.js + NestJS separado |
|---|---|---|
| Performance 25% | 8 | 8 |
| Robustez 20% | 7 | 9 |
| Segurança 15% | 8 | 9 |
| Simplicidade 15% | 10 | 6 |
| Escalabilidade 10% | 7 | 9 |
| Custo 10% | 10 | 7 |
| Manutenção 5% | 9 | 7 |
| **Nota** | **8,4** | **8,0** |

Recomendação: **A para o MVP** (um deploy, um serviço, metade do custo no Railway/Render). As regras moram em `@fabrica/shared` e o acesso a dados em `@fabrica/db`, então extrair para NestJS depois é mover controllers, sem reescrever regra. Jobs (atraso, lembrete de devolução, retenção LGPD) rodam por cron do provedor chamando uma rota protegida. Se o volume crescer ou surgir app mobile nativo, migra para B.

## 5. Fluxo principal

1. Cliente escolhe tema/personagem → agenda mostra disponibilidade real (RN02/RN03) e calcula taxa fds (RN07).
2. Carrinho → cadastro 18+ com LGPD e contrato (RN01/RN11) → documentos via upload **ou** card do WhatsApp, conforme o toggle (RN05/RN06).
3. Checkout cria reserva PENDENTE com hold de 30 min → Pix/cartão no Mercado Pago.
4. Webhook confirma → PAGO (RN10), grava `PaymentEvent` (idempotente) → link wa.me de confirmação.
5. Entrega (check-in) → EM_LOCACAO → devolução com checklist de avaria (RN09) → DEVOLVIDO. Sem devolução até returnDate+24h → ATRASADO (RN08).

## 6. Segurança e LGPD

bcrypt, JWT access curto + refresh com rotação (hash no banco), Zod em toda borda, rate limit por IP/usuário, logs JSON com `tenantId`, `userId`, `action`, `target`. Documentos só com toggle ON: validação de MIME real, 5 MB, SHA-256, AES-256-GCM em repouso, URL assinada de 15 min, `AuditLog` a cada acesso, exclusão automática no fim da retenção. Soft delete de cliente para direito ao esquecimento.

## 7. Roadmap

| Sprint | Entrega | Status |
|---|---|---|
| 0 | Monorepo, regras puras + Zod, schema Prisma completo, migração, seed, CI | ✅ este PR |
| 1 | Auth JWT + RBAC, TenantSettings com toggle, cadastro de cliente 18+ | ✅ PR #2 |
| 2 | CRUD temas e personagens + estoque | próximo |
| 3 | Agenda com bloqueio, taxa fds, carrinho | |
| 4 | Uploads condicionais com hash e criptografia | |
| 5 | Pix Mercado Pago + webhook | |
| 6 | Painel admin (vendas, estoque, privacidade, logs) + PWA | |

## 8. Riscos

| Risco | Mitigação |
|---|---|
| Overbooking por pagamento simultâneo | hold de 30 min + checagem dentro de transação `SERIALIZABLE` na criação da reserva |
| Webhook duplicado ou forjado | `PaymentEvent` único por `externalId` + validação da assinatura `x-signature` do Mercado Pago |
| Vazamento de documentos | toggle desligado por padrão; quando ligado, criptografia, URL curta e auditoria |
| Fotos do Instagram sem autorização de uso | usar só material fornecido pelo dono |

## 9. Pendências conhecidas

- Rate limit em memória vale por instância. Com mais de uma instância, trocar por Redis.
- Textos completos da Política de Privacidade e do Contrato de Locação precisam vir do dono (o aceite já grava data e versão `2026-10-v1`).
- Criação de atendentes e personagens pelo painel entra no Sprint 6; até lá o dono é criado pelo seed.
