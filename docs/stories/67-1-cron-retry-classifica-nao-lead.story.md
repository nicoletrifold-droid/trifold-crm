# Story 67-1 — Cron de retry classifica contato e arquiva não-lead

## Metadata
- **Status:** Done
- **Epic:** 67 — Roleta: Triagem Não-Lead em Todos os Caminhos
- **Branch:** feature/67-1-cron-retry-classifica-nao-lead
- **Complexidade:** M (3 pontos) — gate de IA no cron + arquivamento + webhook

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, unit-tests]

## Story

**As a** gestor da imobiliária,
**I want** que NENHUM caminho de distribuição (nem o cron de retry) envie um não-lead para corretor,
**so that** candidatos a emprego, parcerias e fornecedores nunca ocupem a fila — não só pelo webhook.

## Contexto

A Story 64-1 colocou o classificador de IA no **webhook do WhatsApp**. Mas a distribuição tem
outro caminho automático: o cron `roleta-retry`
(`packages/web/src/app/api/cron/roleta-retry/route.ts`), que busca leads **ativos sem corretor**
dos últimos 30 dias e chama `distributeLeadToNextBroker` **direto, sem classificar**.

**Caso real (18/06/2026):** o lead "João Paulo Marzola Massaroni" (candidato a emprego) foi
desatribuído manualmente, ficou ativo e sem corretor, e o cron de retry o **re-distribuiu**
para o corretor Robson — passando por cima do classificador.

Além disso, hoje o webhook, ao detectar não-lead, apenas **pula** a distribuição: o lead
permanece `is_active=true` e sem corretor, então o cron de retry voltaria a pegá-lo.

**Decisão:** marcar não-lead como `is_active=false` (arquivar) ao detectá-lo. Assim:
- Sai das listas de leads ativos (não polui).
- O cron de retry (filtro `is_active=true`) nunca mais o pega.
- A Nicole continua respondendo (depende de `conversation.is_ai_active`, não de `lead.is_active`).

**Arquivos alvo:**
- `packages/web/src/app/api/cron/roleta-retry/route.ts` (classificar antes de distribuir + arquivar)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (ao detectar não-lead, também arquivar)
- Helper compartilhado para classificar a 1ª mensagem de um lead a partir do `leadId`.

## Escopo

**IN (esta story):**
- Helper `classifyLeadFirstMessage(supabase, anthropic, leadId)` que busca a 1ª mensagem
  inbound (`role='user'`, ordenada por `created_at`) do lead e chama `classifyContactIntent`
  (com `hasDocument` do `metadata.media_type`). Sem mensagem → default seguro `isLead=true`.
- Cron `roleta-retry`: para cada lead, classificar antes de distribuir. Não-lead → `is_active=false`
  + log `roleta_retry_skip_non_lead` + não distribuir. Lead → distribui como hoje.
- Webhook: no branch de não-lead já existente, além de pular a distribuição, setar `is_active=false`.

**OUT (fora desta story):**
- Caminhos de distribuição por intenção real: `/api/roleta/distribute` (admin manual),
  `webhooks/landing-page`, `webhooks/meta-ads` (form = lead real) — não recebem o gate.
- Reverter leads não-lead antigos já distribuídos (decisão à parte; Massaroni já tratado).
- Mudança no `distributeLeadToNextBroker` (mantido intacto — gate fica nos callers automáticos).

## Acceptance Criteria

1. No cron `roleta-retry`, um lead cuja 1ª mensagem é classificada como não-lead **não** é
   distribuído e tem `is_active` setado para `false`.
2. No cron, um lead classificado como lead é distribuído normalmente (sem regressão).
3. Lead sem mensagem inbound → classificado como lead (default seguro) → distribuído.
4. O webhook, ao detectar não-lead (branch existente), seta `is_active=false` além de pular a
   distribuição e logar.
5. O helper `classifyLeadFirstMessage` retorna o veredito e nunca lança (default seguro em erro).
6. O cron contabiliza os não-leads arquivados no resultado (`nao_lead`).
7. Testes unitários do helper (com mocks) passam; typecheck do pacote web sem erros nos arquivos tocados.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Custo: Haiku por lead no cron | Baixa | Não-leads viram `is_active=false` e saem do batch; leads reais classificam 1x antes de distribuir |
| Falso-positivo arquiva lead real | Baixa | Classificador default seguro `isLead=true`; só arquiva com não-lead confiante |
| Cron lento (chamada IA no loop) | Baixa | MAX_PER_RUN=50; chamadas sequenciais aceitáveis para job em background |

## Tasks / Subtasks

- [x] **Task 1 — Helper `classifyLeadFirstMessage`** (AC: 3, 5)
  - [x] 1.1 Buscar 1ª mensagem inbound do lead (content + metadata.media_type)
  - [x] 1.2 Chamar `classifyContactIntent`; sem mensagem → `isLead=true`; nunca lança

- [x] **Task 2 — Cron `roleta-retry`** (AC: 1, 2, 6)
  - [x] 2.1 Classificar antes de distribuir; não-lead → `is_active=false` + log + skip
  - [x] 2.2 Adicionar contador `nao_lead` ao resultado

- [x] **Task 3 — Webhook arquiva não-lead** (AC: 4)
  - [x] 3.1 No branch de não-lead, `update({ is_active: false })` no lead

- [x] **Task 4 — Testes + typecheck** (AC: 7)
  - [x] 4.1 Teste do helper (lead/não-lead/sem-mensagem/erro)
  - [x] 4.2 `tsc --noEmit` no pacote web

## Dev Notes

Reusa `classifyContactIntent` de `@trifold/ai` (Story 64-1). O helper vive no pacote web
(precisa de acesso ao Supabase para buscar a mensagem). Anthropic via `createAnthropicClient`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 1.0 | Story criada | River (@sm) |
| 2026-06-18 | 1.1 | Validação 10/10 GO — Status → Ready | Pax (@po) |
| 2026-06-18 | 1.2 | Implementação concluída — helper+cron+webhook; 16 testes roleta verde (corrigido mock pré-quebrado de distributor.test.ts); typecheck 0 — Status → InReview | Dex (@dev) |
| 2026-06-18 | 1.3 | QA Gate PASS 7/7 — Status → Done | Quinn (@qa) |
