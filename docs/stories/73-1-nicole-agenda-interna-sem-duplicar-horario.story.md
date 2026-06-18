# Story 73-1 — Nicole agenda na agenda interna, no horário pedido, sem duplicar

## Metadata
- **Status:** Done
- **Epic:** 61 — Nicole: Agendamento de Visitas
- **Branch:** main (incremental, padrão do repo)
- **Complexidade:** L (8 pontos) — mexe no core do agente

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, lint, unit-tests]

## Story

**As a** gestor da imobiliária,
**I want** que a Nicole pergunte o dia+horário, confira a agenda interna, marque a visita no horário pedido (criando o evento que aparece na Agenda e no Google) e **nunca** duplique um horário já ocupado — sugerindo outro horário quando estiver cheio,
**so that** as visitas confirmadas pela Nicole entrem de fato na agenda, sem conflito com marcações do Calendly/Google, e o cliente seja atendido com simpatia mesmo quando o horário escolhido não está disponível.

## Contexto (achados da investigação 2026-06-18)

- A Nicole hoje **ignora o horário que o cliente pede**: ao confirmar, o código escolhe sozinho o 1º slot livre do corretor amanhã 10–14h (`pipeline.ts:686-723`). O que ela fala no chat pode divergir do que grava.
- **Handoff bloqueia o agendamento** (`pipeline.ts:685` exige `!handoffResult.trigger`). Foi o que aconteceu com o lead Alvaro Natã: pediu preço → handoff → visita nunca criada (confirmado no banco: sem appointment, etapa "Atendimento"). **Decisão do usuário: handoff NÃO cancela mais a visita.**
- A Nicole insere direto na tabela (`pipeline.ts:725`), **sem passar pelo `createCalendarEvent`** — então a visita dela **não vai pro Google**, e o Calendly (que lê o Google) não a enxerga → **brecha de duplicação**. A tela "Novo Compromisso" (`/api/appointments`) empurra pro Google; a Nicole não.
- A tabela `appointments` é a fonte única e já recebe Calendly via cron `calendly-sync`. Logo, checar `appointments` cobre Calendly+Google (com lag do cron, **aceito pelo usuário**).
- Agenda é **única** (um `GOOGLE_CALENDAR_ID` + um Calendly). "Duplicar" = qualquer visita já marcada naquele horário.

## Escopo

**IN:**
- `packages/ai/src/flows/visit-slot.ts` (novo): `parseRequestedSlot(message, nowBRT)` → `{ startUtc, hasExplicitTime }` | null. Conservador: só retorna slot com dia (segunda–domingo / hoje / amanhã / depois de amanhã / "dia DD") + hora explícita (`15h`, `15:00`, `15 horas`, `3 da tarde`, `meio-dia`). Respeita horário comercial (Seg–Sex 8–18, Sáb 8–12, Dom fechado). Com testes.
- `checkSlotAvailability(supabase, orgId, requestedStartUtc)` → `{ free, alternatives: Date[] }` (próximos horários livres no dia/horário comercial), consultando `appointments` (status scheduled/confirmed) — fonte única que inclui Calendly. **Duração da visita = 60 min** (slots de hora em hora).
- **Injeção pré-LLM**: quando `visit_proposed` e há slot pedido, anexar bloco de contexto interno ("cliente pediu X; está LIVRE→confirme / OCUPADO→ofereça Y e Z; fora do horário→informe horário comercial") para a Nicole responder certo na mesma mensagem.
- **Criação no horário pedido + Google**: ao confirmar slot LIVRE, inserir `appointments` em `requestedStartUtc` e chamar `createCalendarEvent` (injetado via `ProcessMessageParams.createCalendarEvent`), salvando `google_event_id`. Move etapa → "Visita Agendada".
- **Handoff não bloqueia**: remover `!handoffResult.trigger` da condição de agendamento.
- **Webhook** (`/api/webhook/whatsapp/route.ts`): passar `createCalendarEvent` de `@web/lib/google-calendar` para `processMessage` (injeção de dependência — mantém `packages/ai` desacoplado de `packages/web`).
- **Prompt** (`visit-scheduling.ts`): Nicole gerencia internamente (pergunta dia+horário, confirma o horário pedido); Calendly vira **alternativa** ("se preferir escolher pelo site") em vez de caminho paralelo; remover ambiguidade atual.

**OUT:**
- Tool-calling/function-calling (segue texto + extração pós-resposta).
- Agendas por corretor (hoje é uma agenda única org-level).
- Reduzir o lag do cron Calendly (aceito como está).

## Acceptance Criteria
1. Cliente pede dia+hora livre → Nicole confirma; appointment criado naquele horário; aparece na Agenda e no Google (`google_event_id` preenchido). **O lead NÃO é movido para "Visita Agendada" — permanece na etapa atual (ex.: "Aguardando atendimento") e o corretor move manualmente.**
2. Cliente pede horário ocupado → Nicole **não** marca; informa com simpatia e oferece outro(s) horário(s) livre(s).
3. Cliente pede fora do horário comercial → Nicole informa o horário de atendimento e oferece alternativa.
4. Lead que pede preço (handoff) e confirma visita → visita é criada mesmo assim.
5. Sem dia+hora explícitos → Nicole pergunta o horário ou oferece o Calendly; não inventa horário.
6. Nunca cria duas visitas no mesmo horário (checagem em `appointments`).

## Riscos
- Parsing de data/hora em PT-BR (regex conservador + testes; fallback = perguntar/Calendly).
- Verificação ponta-a-ponta exige conversa real de WhatsApp (QA local não cobre o canal).

## QA Results
- **Verdict:** PASS
- **typecheck:** `packages/ai` (tsc --noEmit) limpo; `packages/web` limpo nos arquivos tocados.
- **unit-tests:** `vitest run packages/ai` → 307 passando, incluindo 15 novos em `visit-slot.test.ts` (parse de dia/hora PT-BR, horário comercial, passado, falso-positivos "ter"/"2 suítes").
- **lint:** 0 erros.
- **Limitação conhecida:** verificação ponta-a-ponta no WhatsApp só é possível em conversa real (canal externo). Parser cobre o caso comum (dia+hora juntos); seleção de alternativa em mensagem separada só com horário (sem repetir o dia) recai em "pergunte o horário".

## File List
- `packages/ai/src/flows/visit-slot.ts` (novo — parser + disponibilidade)
- `packages/ai/src/flows/visit-slot.test.ts` (novo — 15 testes)
- `packages/ai/src/chat/pipeline.ts` (injeção de disponibilidade, agenda no horário pedido + push Google, handoff não bloqueia, não move etapa)
- `packages/ai/src/prompts/visit-scheduling.ts` (prompt reescrito: agenda interna + Calendly alternativa)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (injeta `createCalendarEvent`)
