# Story 71-1 — Distribuir só após a conversa esfriar (idle 5 min) classificando o diálogo inteiro

## Metadata
- **Status:** Done
- **Epic:** 67 — Roleta: Triagem Não-Lead em Todos os Caminhos
- **Branch:** feature/71-1-distribuicao-pos-conversa-idle
- **Complexidade:** M-L (5 pontos)

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, unit-tests]

## Story

**As a** gestor da imobiliária,
**I want** que a Nicole conduza toda a conversa e só distribua o lead ao corretor depois que a conversa esfria (5 min sem resposta), decidindo com base no diálogo inteiro,
**so that** ninguém seja distribuído cedo demais — o "Olá → vaga de emprego" nunca chega a um corretor.

## Contexto

Hoje a distribuição acontece na PRIMEIRA mensagem (`_brand_new`). Teste real:
- Lead: "Olá" (13:17:11) → distribuído ao Odair imediatamente.
- Lead: "Sobre vaga de emprego" (13:17:32) → intenção real só na 2ª mensagem; tarde demais.
- (A Nicole respondeu o telefone corretamente — guardrail OK.)

Decisão do usuário: **não distribuir na hora**. A Nicole conversa; quando a conversa fica
**5 min sem nova mensagem do lead** (esfriou), classifica-se o **diálogo inteiro** (todas as
mensagens do lead, não só a primeira) e então decide: lead real → distribui; não-lead → arquiva.

Infra: Vercel suporta cron de minutos (`campaign-poll` roda `*/3`). Usaremos um cron frequente
com checagem de inatividade.

**Arquivos alvo:**
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — remover distribuição na 1ª mensagem
  (manter `triggerAutomations`); remover o bloco de classificação inline.
- `packages/web/src/lib/roleta/classify-lead.ts` — `loadLeadInboundForClassification` (concatena
  todas as mensagens do lead + última data inbound + hasDocument).
- `packages/web/src/app/api/cron/roleta-retry/route.ts` — vira o motor único: idle ≥5 min,
  classifica diálogo inteiro, distribui ou arquiva.
- `packages/web/vercel.json` — `roleta-retry` schedule `*/30` → `*/3`.

## Escopo

**IN:**
- Webhook WhatsApp: NÃO distribui mais na 1ª mensagem (sem distribute, sem classificação inline).
  `triggerAutomations` permanece no `_brand_new`.
- Helper `loadLeadInboundForClassification(supabase, leadId)` → `{ lastInboundAt, text, hasDocument }`
  (texto = todas as mensagens `role='user'` concatenadas).
- Cron roleta-retry:
  - Para cada lead candidato (is_active, sem corretor, criado ≤30 dias): carregar inbound.
  - Se última mensagem do lead há <5 min → pular (ainda conversando).
  - Se ≥5 min → classificar diálogo inteiro: lead → distribui; não-lead → arquiva (is_active=false) + contador.
  - Lead sem mensagem inbound → distribui (sem conversa para esperar; ex.: importados).
  - Schedule `*/3`.

**OUT:**
- Webhooks de formulário (Meta/landing) e distribuição manual — seguem distribuindo na hora (leads confirmados).
- Exceção "lead quente distribui antes dos 5 min" — janela curta torna desnecessária (decisão do usuário).
- Mudança no `distributeLeadToNextBroker`.

## Acceptance Criteria

1. O webhook do WhatsApp NÃO chama `distributeLeadToNextBroker` na 1ª mensagem.
2. `triggerAutomations("lead.created")` continua disparando para lead novo.
3. `loadLeadInboundForClassification` retorna texto concatenado de todas as mensagens do lead,
   `lastInboundAt` e `hasDocument`; sem mensagem → `{ lastInboundAt: null, text: "" }`.
4. No cron, lead cuja última mensagem foi há <5 min é PULADO (não distribuído, não arquivado).
5. No cron, lead idle ≥5 min classificado como lead é distribuído; como não-lead é arquivado (is_active=false).
6. Lead idle ≥5 min sem mensagem inbound → distribuído (default seguro).
7. `vercel.json`: roleta-retry em `*/3`.
8. Testes unitários (helper + cron idle/lead/não-lead) passam; typecheck sem erros.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Latência: lead bom espera ~5-8 min por humano | Média | Nicole conduz a conversa nesse meio tempo; janela (5 min) |
| Custo: cron a cada 3 min classificando | Baixa | Só classifica leads idle e não distribuídos; keyword fast-path evita Haiku nos óbvios |
| Lead reabre conversa após distribuir | Baixa | Idempotência por assigned_broker_id; reabertura não redistribui |
| Cron concorrente distribui 2x | Baixa | Guard de idempotência já existente (re-checa assigned_broker_id) |

## Tasks / Subtasks

- [x] **Task 1 — Webhook para de distribuir** (AC: 1, 2)
  - [x] 1.1 Remover bloco de classificação+distribuição do `_brand_new`; manter `triggerAutomations`
- [x] **Task 2 — Helper de conversa inteira** (AC: 3)
  - [x] 2.1 `loadLeadInboundForClassification(supabase, leadId)`
- [x] **Task 3 — Cron motor de distribuição idle** (AC: 4, 5, 6, 7)
  - [x] 3.1 Idle ≥5 min por lead; classificar diálogo inteiro; distribuir/arquivar
  - [x] 3.2 `vercel.json` schedule `*/3`
- [x] **Task 4 — Testes + typecheck** (AC: 8)

## Dev Notes

Idle: `lastInboundAt <= now - 5min`. Cron `*/3` + idle 5 min → latência efetiva ~5-8 min.
Reusa `classifyContactIntent` (@trifold/ai) sobre o texto concatenado.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 1.0 | Story criada e validada GO — Status → Ready | River (@sm) / Pax (@po) |
| 2026-06-18 | 1.1 | Implementado: webhook não distribui; cron idle 5min classifica diálogo inteiro (*/3); 18+14 testes verde; typecheck 0 — Status → InReview | Dex (@dev) |
| 2026-06-18 | 1.2 | QA Gate PASS 7/7 — Status → Done | Quinn (@qa) |
