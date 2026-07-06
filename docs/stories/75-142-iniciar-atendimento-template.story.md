# Story 75-142 — Fase 2: "Iniciar atendimento" (dispara template de abertura p/ lead frio)

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** #139 · **Complexidade:** M (5 pontos) · **Branch:** feat/75-142-iniciar-atendimento-template
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Fecha o epic (ver [[project-corretor-whatsapp-atendimento]]). Leads frios (que nunca escreveram / janela de 24h fechada) não aceitam texto livre — a Meta exige **template aprovado**. Template `abertura_atendimento_corretor` já **APROVADO** (2026-07-06). Esta story liga o botão "Iniciar atendimento" que dispara esse template pelo número da empresa.

## Escopo
**IN:**
1. **`lib/leads/whatsapp.ts`:** `toWhatsAppNumber(phone)` — normaliza p/ dígitos com DDI 55 (telefones vêm em formato misto). +testes.
2. **`lib/whatsapp/send-template.ts`** (novo): `sendWhatsAppTemplate` centralizado (mesmo padrão das campanhas).
3. **`POST /api/leads/[id]/start-whatsapp`:** valida ownership; monta variáveis {{1}} nome do lead / {{2}} corretor (assigned broker, fallback "Trifold") / {{3}} empreendimento (property_interest, fallback "nosso empreendimento") — todas não-vazias; envia o template; grava a mensagem no histórico (`role=broker`, metadata.template); faz handoff (`is_ai_active=false`); loga em `whatsapp_send_log` (marketing).
4. **`broker-message-input.tsx`:** no bloco de janela fechada, substitui o placeholder por botão **"Iniciar atendimento (mensagem de abertura)"** → chama a rota; ao concluir, mostra "Convite enviado. Aguarde a resposta do cliente para continuar."

**OUT:** múltiplos templates/escolha (v1 = 1 template); reabrir a janela sem resposta do cliente (regra da Meta — só o lead reabre); botão no dashboard read-only (gestor monitora).

## Acceptance Criteria
1. **Given** um lead com janela fechada, **then** o corretor vê "Iniciar atendimento"; **when** clica, **then** o template é enviado pelo número da empresa e aparece "Convite enviado. Aguarde a resposta do cliente".
2. **Given** o envio, **then** a mensagem de abertura é gravada no histórico (role=broker) e a Nicole é desligada (handoff) naquela conversa.
3. **Given** telefone em formato misto (`+5543…`/`44…`), **then** é normalizado p/ `55…` antes de enviar; **given** variáveis ausentes (sem empreendimento/corretor), **then** usa fallback não-vazio (Meta não aceita vazio).
4. **Given** falha no envio do template, **then** mensagem amigável e log `failed`; sem quebrar a tela.
5. tsc/lint/vitest limpos.

## Dev Agent Record (@dev — 2026-07-06)
- `toWhatsAppNumber` (+3 testes) em `lib/leads/whatsapp.ts`.
- `lib/whatsapp/send-template.ts` (helper reusável).
- Rota `start-whatsapp`: ownership + fallbacks das variáveis + template + histórico + handoff + log.
- `broker-message-input.tsx`: botão "Iniciar atendimento" + estado de sucesso/erro no bloco de janela fechada.
- **Checks:** tsc 0 · eslint 0 · vitest 816/816 (+3).

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (botão → template enviado, confirmação) ✓ · AC2 (histórico role=broker + handoff) ✓ · AC3 (número normalizado + fallbacks não-vazios) ✓ · AC4 (erro amigável + log failed, 502) ✓ · AC5 (tsc/eslint/816) ✓. Template `abertura_atendimento_corretor` APPROVED. Nota: janela freeform só reabre com a resposta do lead (regra Meta) — a UI orienta.

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #139** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 5 ACs, 816/816.
- 2026-07-06 — @dev — Implementado (rota + botão + template). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**.
- 2026-07-06 — @sm — Story criada.
