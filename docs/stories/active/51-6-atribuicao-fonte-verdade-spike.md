# Story 51-6 — Decisão de Fonte de Verdade de Atribuição de Corretor (Spike/ADR)

## Metadata
- **Epic:** 51 — Handoff Nicole → Corretor + Chat do Corretor na Plataforma
- **Story:** 51-6
- **Status:** InReview
- **Validated:** 2026-06-09 by @po (Pax) — verdict GO (8/10); spike/ADR bem escopado
- **ADR sign-off:** 2026-06-09 by @architect (Aria) — técnico Accepted; ADR `Proposed` aguardando decisão de negócio do dono
- **Priority:** P2 — risco de inconsistência silenciosa; não bloqueia P0/P1
- **Complexity:** XS (1-2h)
- **Created:** 2026-06-09
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex) com review de @architect (Aria)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[adr_review, schema_audit]`
- **Autossuficiente:** sim

---

## User Story

**Como** engenheiro que mantém o sistema de atribuição de leads,
**Quero** uma decisão clara e documentada sobre qual é a fonte de verdade para `assigned_broker_id`,
**Para que** as stories 51-1, 51-3 e 51-4 (que dependem deste valor) se comportem consistentemente.

---

## Context

Existe uma **dupla fonte de atribuição** para o campo `leads.assigned_broker_id`:

### Fonte 1: Roleta de entrada (atribuição inicial)
- **Onde:** `packages/web/src/app/api/webhook/whatsapp/route.ts` (linha ~549)
- **Quando:** lead entra pelo WhatsApp; roleta (`distributor.ts`) seleciona o corretor disponível
- **Critério:** disponibilidade, carga de trabalho, configuração da roleta

### Fonte 2: Broker primário do imóvel (atribuição no agendamento)
- **Onde:** `packages/ai/src/chat/pipeline.ts:593-619`
- **Quando:** Nicole detecta intenção de agendamento; atribui o corretor primário do imóvel via `broker_assignments`
- **Critério:** `broker_assignments.is_primary = true` para o imóvel em questão

### O problema
Um lead pode entrar pelo canal WhatsApp, ser atribuído ao Corretor A (pela roleta), e depois, quando
Nicole agenda uma visita ao Vind (imóvel), ser **silenciosamente reatribuído** ao Corretor B
(broker primário do Vind). Consequências:
1. O Corretor A acompanhou o lead desde o início, mas o Corretor B recebe a notificação de agendamento (51-3)
2. O chat do corretor (51-1) valida `assigned_broker_id` para ownership — o Corretor A perde acesso
3. A roleta registra atividade no Corretor A, mas a comissão vai para o Corretor B

### Casos a investigar
- O que acontece quando `broker_assignments` não tem entrada para o imóvel? (APPOINTMENT_NO_BROKER)
- O que acontece quando `is_primary` aponta para corretor inativo/offline?
- Existe lógica de "preserve first assignment" em algum lugar do código?

---

## Acceptance Criteria

- [x] **AC1:** Um spike de 1-2h investiga o código atual para mapear exatamente todos os locais onde `leads.assigned_broker_id` é escrito (via INSERT ou UPDATE). Listar paths com linha de código — **7 call-sites mapeados** (Grupos A/B/C no ADR §Contexto)
- [x] **AC2:** Um ADR (Architecture Decision Record) é criado em `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md` com Contexto, Decisão, Opções, Consequências, Data
- [x] **AC3:** As stories 51-1, 51-3 e 51-4 são atualizadas com uma linha de `Dev Notes` referenciando o ADR e confirmando o comportamento esperado para `assigned_broker_id`
- [x] **AC4:** Spike revelou bugs reais (cenários 1, 5, 7, 8 do ADR) — follow-up #6 do ADR recomenda issue de auditoria; correção (guard) recomendada como story futura "51-7". NÃO resolvido nesta story (escopo limitado ao ADR) ✓
- [~] **AC5:** @architect (Aria) fez review e sign-off **técnico** no ADR (§Sign-off do Architect). ADR fica `Proposed` aguardando decisão de **negócio** do dono (Gabriel) — ver §Decisão Pendente do Dono

---

## Tasks / Subtasks

- [x] **T1 — Spike: mapear todos os writes em `leads.assigned_broker_id`** — 7 call-sites (Grupos A/B/C no ADR). Confirmado que o cron de follow-up apenas LÊ; o RPC `roleta_pick_and_advance` (069:119) faz `UPDATE leads SET assigned_broker_id`.

- [x] **T2 — Investigar lógica atual de precedência** — `pipeline.ts:621/659`: UPDATE **cego, SEM guard** (`if (assignedBrokerId)` só checa se ACHOU primário, não se o lead já tinha dono). `distributor.ts`: A1 (priorizar lead ativo) + A2 (RPC). Logging de troca de dono só em C1 (`broker_assigned`); B1/B2/roleta não logam a troca uniformemente.

- [x] **T3 — Redigir ADR** — `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md` (Contexto / Decisão / 4 Opções / Consequências / Follow-ups). Decisão recomendada: Opção 3 (híbrido/first-write-wins com guard).

- [x] **T4 — Review @architect** — sign-off técnico registrado no ADR (§Sign-off do Architect). Decisão de negócio pendente do dono.

- [x] **T5 — Atualizar Dev Notes das stories impactadas** — 51-1, 51-3, 51-4 atualizadas com bloco de referência ao ADR-001.

---

## Dev Notes

### Paths-chave para T1
```bash
# Comando de spike
grep -rn "assigned_broker_id" \
  packages/web/src/app/api/ \
  packages/web/src/lib/ \
  packages/ai/src/ \
  supabase/migrations/
```

### Locais suspeitos (confirmar no spike)
```
packages/ai/src/chat/pipeline.ts:619            — reatribuição no agendamento
packages/web/src/app/api/webhook/whatsapp/route.ts:549 — atribuição inicial (roleta)
packages/web/src/app/api/leads/[id]/assign/route.ts    — atribuição manual (admin)
packages/web/src/lib/roleta/distributor.ts             — seleção da roleta
```

### Template de ADR sugerido
```markdown
# ADR-001: Fonte de Verdade para leads.assigned_broker_id

## Status: Accepted

## Contexto
[Descrever as duas fontes]

## Decisão
[Escolha explícita: qual fonte tem precedência e por quê]

## Opções Consideradas
1. Roleta sempre define (agendamento não sobrescreve)
2. Broker do imóvel sempre define (agendamento sobrescreve)
3. First-write-wins (quem atribuiu primeiro mantém)

## Consequências
- Stories afetadas: 51-1, 51-3, 51-4
- Impacto em comissões/relatórios: [descrever]
- Mudanças necessárias no código: [se houver]
```

---

## File List

### Criar
- [x] `docs/architecture/adr/adr-001-broker-attribution-source-of-truth.md` — ADR criado (T3)
- [x] `docs/architecture/adr/` — diretório criado

### Modificar (Dev Notes apenas — sem código)
- [x] `docs/stories/active/51-1-chat-bidirecional-corretor.md` — bloco de referência ao ADR-001 adicionado em Dev Notes (T5)
- [x] `docs/stories/active/51-3-notificar-corretor-agendamento.md` — bloco de referência ao ADR-001 adicionado em Dev Notes (T5)
- [x] `docs/stories/active/51-4-notificar-corretor-followups-esgotados.md` — bloco de referência ao ADR-001 adicionado em Dev Notes (T5)

### Referência
- `packages/ai/src/chat/pipeline.ts:593-653` (lógica de agendamento + atribuição)
- `packages/web/src/lib/roleta/distributor.ts` (lógica de roleta)
- `packages/web/src/app/api/leads/[id]/assign/route.ts` (atribuição manual)

---

## Testing

Sem testes de código — esta story é de spike/ADR. O critério de done é o ADR com sign-off do @architect.

### Smoke (validação humana)
- @architect leu e assinou o ADR
- Dev Notes das 3 stories atualizadas com referência ao ADR
- Se spike revelar bug real: issue criado no backlog

---

## Out of Scope

- Implementar a decisão do ADR (se requerer código) → story separada
- Resolver bugs históricos de atribuição → separado
- Sistema de comissões baseado em `assigned_broker_id` → outro epic

---

## Definition of Done

- [x] AC1–AC4 completos; AC5 com sign-off técnico do @architect (decisão de negócio pendente do dono)
- [x] T1–T5 done
- [x] ADR criado e assinado tecnicamente por @architect (Status `Proposed` até sign-off de negócio)
- [ ] @qa executou quality gate com verdict ≥ PASS (revisão de ADR)
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-09 | 0.1 | Story drafted — Epic 51, GAP-7 | @sm (River) |
| 2026-06-09 | 0.2 | Validação PO (GO 8/10): escopo limitado ao ADR confirmado (não implementa); writes de assigned_broker_id verificados (pipeline.ts:619,653); QG @qa para review de ADR coerente; Status → Ready | @po (Pax) |
| 2026-06-09 | 0.3 | Spike executado: 7 call-sites mapeados (Grupos A/B/C); 8 cenários de conflito; bugs reais 1/5/7/8 identificados. ADR-001 criado com recomendação Opção 3 (híbrido/first-write-wins). Dev Notes de 51-1/3/4 atualizadas. Sign-off técnico @architect; ADR `Proposed` aguardando decisão de negócio do dono. Status → InReview | @architect (Aria) |
