# Story 75-61 — Card de volume de WhatsApp no /sistema (Passo 1)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** S-M (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** admin (Marcos), **I want** ver na tela `/dashboard/sistema` um card/seção com o **volume de mensagens
de WhatsApp** (recebidas vs enviadas, por período), **so that** eu entenda o volume de troca e tenha a base
para medir custo depois — sem depender de abrir o WhatsApp Manager da Meta.

## Contexto
Ideia do usuário (2026-06-25): contador de mensagens de WhatsApp pra entender volume e, futuramente, custo.
Investigação confirmou:
- A conversa Nicole↔lead está na tabela `messages` (`role`: `user`=recebida do lead, `assistant`=enviada pela
  IA, `broker`=enviada pelo corretor). `conversations` tem `channel` (default `whatsapp`) e `org_id` →
  filtrar/agrupar exige join `messages`⋈`conversations`. Hoje: 385 recebidas, 383 enviadas, 5 broker.
- A tela `/dashboard/sistema` (`packages/web/src/app/dashboard/sistema/page.tsx`, client) busca
  `/api/system-events` (admin-only, role check na rota) → RPC `get_system_events_summary`.
- ⚠️ O card atual **"Mensagens (24h)"** NÃO conta `messages` — conta `system_events` (category='bot', level='info'),
  que não está sendo populado → por isso mostra **0**. (Reconciliar esse card é fora de escopo aqui.)

Esta é a **Passo 1** (volume — dado que já temos). O **Passo 2** (log de disparos de templates + estimativa de
custo R$) é story futura.

## Escopo
**IN:**
1. **Migration — nova RPC** `get_whatsapp_volume_summary(p_org_id uuid)` (SECURITY DEFINER, padrão das outras
   RPCs do projeto): faz `messages m JOIN conversations c ON c.id=m.conversation_id` com `c.org_id=p_org_id` e
   `c.channel='whatsapp'`, e retorna JSON com **recebidas/enviadas/total** para janelas **24h, 7d e 30d** (via
   `COUNT(*) FILTER (WHERE created_at >= now() - interval ...)`). `recebidas` = role `user`; `enviadas` = role IN
   (`assistant`,`broker`). Uma varredura só (últimos 30 dias).
2. **Rota `/api/system-events`** (`route.ts`): chamar a nova RPC (em paralelo com a existente) e incluir
   `whatsapp_volume` no JSON de resposta. Mantém o gate admin-only que já existe.
3. **Página `/sistema`** (`page.tsx`): adicionar ao tipo `Metrics`/resposta o `whatsapp_volume` e renderizar uma
   **seção "Volume de WhatsApp"** com cards no mesmo padrão visual (inline `rounded-lg border ... dark:` +
   grid `grid-cols-2 lg:grid-cols-4`): ex.: **Recebidas (24h)**, **Enviadas (24h)**, **Recebidas (7d)**,
   **Enviadas (7d)** — e um sub-texto com o total 30d. (Layout final a critério do @dev, mantendo o padrão.)

**OUT:**
- Estimativa de **custo R$** e **log de disparos de templates** (Passo 2 — story futura).
- Corrigir/reconciliar o card antigo "Mensagens (24h)" (system_events) — separado.
- Quebra por empreendimento/corretor/template (futuro; aqui é volume agregado por org).
- Telegram/outros canais (só `channel='whatsapp'`).

## Acceptance Criteria
1. **Given** a RPC `get_whatsapp_volume_summary(org)`, **when** chamada, **then** retorna recebidas/enviadas/total
   para 24h, 7d e 30d, contando só `conversations.channel='whatsapp'` do org, com `recebidas`=role user e
   `enviadas`=role assistant+broker.
2. **Given** a tela `/sistema` (admin), **when** carrega, **then** mostra a seção "Volume de WhatsApp" com os
   números reais (hoje ~385 recebidas / ~388 enviadas no total) — não mais 0.
3. **Given** um não-admin, **then** continua bloqueado (a rota já é admin-only; sem nova exposição de dados).
4. **Given** o polling de 30s da página, **then** os cards de WhatsApp atualizam junto (mesma resposta da rota).
5. **Performance:** a RPC faz no máximo uma varredura indexada (usar `idx_messages_created_at` + join por PK); não
   degrada o carregamento do /sistema.
6. typecheck/lint/vitest limpos.

## Dev Notes
- Página: `packages/web/src/app/dashboard/sistema/page.tsx` (client, tipo `Metrics` ~linha 19; cards de métrica ~181-200; polling 30s ~86).
- Rota: `packages/web/src/app/api/system-events/route.ts` (gate `user.role !== "admin"` → 403; chama `get_system_events_summary` ~82).
- RPC existente de referência de estilo: `supabase/migrations/037_dashboard_rpcs_remote_only.sql` (`get_system_events_summary`).
- `messages`: id, conversation_id, role(user/assistant/system/broker), content, media_url, media_type, metadata, created_at. Índices: `idx_messages_conversation`, `idx_messages_created_at`.
- `conversations`: id, org_id, lead_id, channel(default whatsapp), created_at. Índices: `idx_conversations_org`.
- Migration: conferir próximo número livre em `supabase/migrations/` (última = 115). NÃO aplicar em prod — @devops aplica no deploy.
- Card pattern: `<div className="rounded-lg border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">` + label xs + valor 2xl. Convenção de tema /dashboard = light/dark com `dark:` ([[feedback-theme-convention]]).

### Testing
- Não há lógica pura nova óbvia pra unit (é SQL + render). Garantir `tsc --noEmit` + `lint` + `vitest packages/web` sem regressão.
- Verificação manual: abrir /sistema como admin e conferir os números batendo com `SELECT count(*) ... role` no banco.

## Riscos
- **RPC sem filtro de org/channel** → números errados. Mitigação: AC1 + revisão da query no QA. **Baixo.**
- **Confusão com o card "Mensagens (24h)" antigo** (ainda 0). Mitigação: rotular a nova seção claramente como "WhatsApp"; reconciliar o antigo é story à parte. **Baixo.**

## File List
- `supabase/migrations/117_whatsapp_volume_rpc.sql` (novo — renumerado de 116 por colisão) — RPC `get_whatsapp_volume_summary(org)` (SECURITY DEFINER + grant authenticated).
- `packages/web/src/app/api/system-events/route.ts` — chama a RPC em paralelo e expõe `metrics.whatsapp_volume`.
- `packages/web/src/app/dashboard/sistema/page.tsx` — tipo `WhatsappVolume` + seção "Volume de WhatsApp" (4 cards 24h/7d + subtítulo 30d).

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.61-whatsapp-volume-card.yml`) · readiness 9/10
- AC1 validado em prod (SELECT inline): 30d = 379/383/762, 24h = 57, 7d = 288. AC2–AC5 OK. 265/265 testes; typecheck limpo.
- **Observação (low, security):** a RPC confia em `p_org_id` (SECURITY DEFINER) — MESMO padrão de toda a família de RPCs de dashboard (pré-existente). Inócuo hoje (single-org, dado agregado, rota admin-only). **Endurecer a família antes do pivô multi-tenant/SaaS.** Não bloqueia.
- Card antigo "Mensagens (24h)" (system_events) intacto — reconciliar é separado.

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - RPC retorna jsonb `{h24,d7,d30}` com `recebidas`/`enviadas`/`total`; uma varredura (30d), join por PK + `idx_messages_created_at`.
  - **Validação da lógica em prod** (SELECT inline, sem criar a função — isso é do @devops): 30d = **379 recebidas / 383 enviadas / 762 total**; 24h = 57; 7d = 288. Bate com a tabela `messages` e confirma AC2 (não mais 0).
  - Seção só renderiza se `whatsapp_volume` presente (guard null se a RPC falhar). Padrão visual idêntico aos cards existentes (light/dark).
  - **Validação local:** `tsc --noEmit` (web) **exit 0**; `vitest packages/web` **265/265 verdes**.
  - **Migration 116 NÃO aplicada em prod** — @devops aplica no deploy. Card antigo "Mensagens (24h)" (system_events) intacto (fora de escopo).

## Change Log
- 2026-06-25 — @sm — Story criada. Passo 1 do contador de WhatsApp: RPC de volume (recebidas/enviadas/total por
  janela, só whatsapp/org) + expor na rota system-events + cards no /sistema. Custo R$ e log de disparos = Passo 2.
- 2026-06-25 — @po — Validação (10 pontos): **GO**, 9/10. Anti-alucinação confirmou: gate admin (route:53), RPC
  `get_system_events_summary` (route:82), tipo `Metrics` (page:19), próxima migration 116. Status Draft → Ready.
- 2026-06-25 — @dev — Implementado: migration 116 (RPC), rota expõe `whatsapp_volume`, seção de cards no /sistema.
  Lógica validada em prod (379/383/762 30d). 265/265 testes, typecheck limpo. Status Ready → Review.
- 2026-06-25 — @qa — Gate **PASS** (9/10). AC validados (inclui prod). Observação low (security): RPC confia em
  p_org_id como toda a família de dashboard RPCs — endurecer antes do multi-tenant. Não bloqueia (single-org hoje).
- 2026-06-25 — @devops — PR #37 merged (`45cc6e4`); RPC aplicada em prod (idempotente). **Colisão de migration:**
  outra branch mergeou `116_distrato_sienge_contrato_cancelado` em paralelo → renomeada a nossa para
  `117_whatsapp_volume_rpc.sql` (chore PR; só higiene, RPC já no ar).
