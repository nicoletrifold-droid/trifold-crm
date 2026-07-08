# Story 79-1 — Sincronizar e-mail do Sienge → CRM e propagar ao login do portal

## Metadata
- **Status:** InReview
- **Epic:** 79 — Integração Sienge: sincronização de cadastro
- **Branch:** feat/79-1-sienge-email-sync

## Context
Reportado (2026-07-08): o cliente **Sidney Franchetti** (Sienge id 1250, unidade 202 Vind) teve o e-mail atualizado no **Sienge** para `sidneyfranchetti@gmail.com`, mas no CRM continua `robson@trifold.eng.br` — tanto no cadastro (`clientes`) quanto no **login do portal** (`users` + auth). Isso é grave: se o cliente pedir "esqueci a senha", o link vai para o e-mail antigo e ele **nunca recebe**.

Dois problemas de base (confirmados no código):
1. **`sync.ts` (`findOrCreateCliente`) só grava e-mail ao CRIAR um cliente novo.** Em cliente já existente (match por CPF/e-mail), o e-mail nunca é atualizado — só telefone (backfill) e `sienge_customer_id`. Logo, mudança de e-mail no Sienge não reflete no CRM.
2. **Nada propaga o e-mail para o login do portal.** O login é `auth.users.email` (ligado por `users.auth_id`), espelhado em `users.email`. Nenhuma rotina atualiza isso quando o cadastro muda.

Não existe webhook de cadastro no Sienge (só de boleto), então "refletir mudanças do Sienge" exige **polling** dos clientes vinculados.

**Raio de impacto medido (prod, 71 clientes com `sienge_customer_id`):** apenas **2** divergem hoje — Sidney (1250: robson@ → sidneyfranchetti@gmail.com) e Diego Pessuto Grou (1442: diegrou@gmail.com → diego@trifold.eng.br). Os outros 69 já batem.

**Decisão:** para e-mail, **Sienge é a fonte da verdade** (sobrescreve o CRM quando difere e o valor do Sienge é válido). Diferente do telefone, que é backfill-only (nunca sobrescreve preenchimento manual).

## Acceptance Criteria
- [x] AC1: Ao detectar que o e-mail de um cliente no Sienge difere do CRM (e é um e-mail válido, não vazio), `clientes.email` é atualizado para o valor do Sienge.
- [x] AC2: A mudança é **propagada ao login do portal**: `public.users.email` E o e-mail de autenticação (`auth.users` via `auth.admin.updateUserById(..., { email, email_confirm: true })`) do usuário `role='cliente'` correspondente (match por `sienge_customer_id`, fallback e-mail antigo).
- [x] AC3: Após a propagação, um "esqueci a senha" vai para o e-mail NOVO (o login passa a ser o novo e-mail; o antigo deixa de dar acesso).
- [x] AC4: Existe um **cron diário** (`/api/cron/sienge-customer-sync`, auth `CRON_SECRET`) que percorre os clientes com `sienge_customer_id`, consulta `getCustomerById` e aplica AC1–AC2. Respeita o rate limit do Sienge (pacing 300ms) e `maxDuration=300`.
- [x] AC5: O **sync manual da obra** (`syncObraClientes` → `findOrCreateCliente`) também reconcilia o e-mail (mesma função compartilhada) — não só o cron.
- [x] AC6: Robustez: nunca apaga e-mail (só atualiza quando Sienge tem e-mail válido diferente); colisão (e-mail novo já usado por outro login) é capturada e registrada sem derrubar o restante do lote; e-mail comparado normalizado (trim+lower).
- [x] AC7: Sem regressão: telefone continua backfill-only; criação de cliente novo inalterada; nenhuma mudança no portal do cliente nem no fluxo de convite.

## Out of Scope
- Sincronizar nome/telefone do Sienge de forma autoritativa (telefone segue backfill-only; nome não é sincronizado aqui).
- Webhook de cadastro do Sienge (não existe na API; polling é o mecanismo).
- UI de histórico/auditoria das trocas de e-mail (o cron retorna um resumo JSON; auditoria formal fica como follow-up).

## Dependencies
- Reusa `getCustomerById` (`lib/integrations/sienge/client.ts`), `createAdminClient`, padrão de cron (`CRON_SECRET`) do `boleto-scan`.

## Complexity
- **T-shirt:** M (1 módulo novo compartilhado + 1 cron + wiring no sync existente + entry no vercel.json).

## Business Value
Garante que o cliente sempre receba comunicações e o link de redefinição de senha no e-mail correto, mantendo o CRM e o acesso ao portal em sincronia com o Sienge (sistema de origem do cadastro). Evita cliente "preso pra fora" do portal por e-mail defasado.

## Risks
- **Troca de login:** atualizar o e-mail de auth troca o login — o e-mail antigo perde acesso. É o comportamento desejado, mas afeta acesso; blast radius medido = 2 clientes hoje.
- **Colisão de e-mail** (novo e-mail já usado por outro auth user): `updateUserById` falha → capturado e registrado (`portalError`), CRM já reflete o Sienge, sem derrubar o lote.
- **Sienge autoritativo:** sobrescreve e-mail manual do CRM. Aceito por decisão (Sienge = fonte da verdade p/ e-mail).

## Definition of Done
- ACs atendidos; `tsc`+ESLint limpos; cron executado 1x em prod corrigindo Sidney (+Diego) com verificação (CRM+users+auth); QA gate PASS; push/deploy via @devops.

## File List
- `docs/stories/79-1-sienge-sync-email-cliente-login-portal.story.md` (this file)
- `packages/web/src/lib/integrations/sienge/customer-profile-sync.ts` (novo — `syncClienteEmail` + propagação portal)
- `packages/web/src/app/api/cron/sienge-customer-sync/route.ts` (novo — cron diário)
- `packages/web/src/lib/integrations/sienge/sync.ts` (wiring: reconcilia e-mail no findOrCreateCliente)
- `packages/web/vercel.json` (cron `sienge-customer-sync` às 06:15 UTC)

## Dev Agent Record (@dev / Dex)
### Completion Notes
- Módulo `customer-profile-sync.ts`: `syncClienteEmail(admin, cliente, siengeEmail)` — normaliza (trim/lower), valida regex, só age se diferente e válido; atualiza `clientes.email`; resolve o portal user por `sienge_customer_id` (fallback e-mail antigo) e atualiza `auth` (`updateUserById { email, email_confirm:true }`) + `users.email`; colisão/erro capturados em `portalError`.
- Cron `sienge-customer-sync`: Bearer `CRON_SECRET`, `maxDuration=300`, itera `clientes` com `sienge_customer_id`, `getCustomerById`, pacing 300ms, retorna `{checked, changed, errors, changes[]}`.
- `sync.ts`: nas duas ramificações (match por CPF e por e-mail) do `findOrCreateCliente`, chama `syncClienteEmail` após os updates existentes — telefone segue backfill-only.
- `vercel.json`: entry `"15 6 * * *"`.
- Verificação: `tsc`+ESLint limpos. Raio de impacto medido em prod (2 divergências). Execução real do cron pós-deploy p/ corrigir Sidney (+Diego) com verificação CRM/users/auth.

## QA Results (@qa / Quinn)
**Veredito: PASS** (9/10). Gate: `docs/qa/gates/79.1-sienge-sync-email-cliente-login-portal.yml`. 7 checks (testes automatizados = CONCERNS não-bloqueante; verificação real = execução do cron pós-deploy). Raio de impacto medido em prod: 2 divergências (Sidney + Diego). Pronta para @devops *push.

## Change Log
- @sm (River): story criada.
- @po (Pax): checklist 10 pontos → GO. Status → Ready.
- @dev (Dex): implementado (módulo compartilhado + cron + wiring + vercel.json). Status → InReview.
- @qa (Quinn): QA gate PASS (7 checks). Gate 79.1 criado. Pronta para @devops *push.
