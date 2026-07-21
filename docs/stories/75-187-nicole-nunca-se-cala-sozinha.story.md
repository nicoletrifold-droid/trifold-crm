# Story 75-187 — Nicole nunca se cala sozinha (remove auto-handoff que silencia a IA)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (Nicole / atendimento)
- **Branch:** fix/75-187-nicole-nunca-se-cala-sozinha
- **Tipo:** Bug de produto — reportado pelo Marcos (caso real: lead Luiz, 2026-07-21)

## Context
Caso real (lead Luiz, 2026-07-21 06:58): o lead escreveu "Valores para financiamento",
a palavra bateu no regex `OUT_OF_SCOPE_PATTERNS` de `packages/ai/src/flows/handoff.ts`
e o pipeline setou `is_ai_active=false` (handoff automático por conteúdo). As duas
perguntas seguintes do lead ficaram SEM RESPOSTA — a Nicole se calou e o lead nem
tinha corretor atribuído ainda (a roleta só distribui depois, por tempo de idle).

**Decisão de produto (Marcos):** a Nicole NUNCA deixa de falar com o lead por decisão
própria. Quem entrega o lead ao humano é a **roleta, por TEMPO** (regra já existente:
idle pós-conversa, cron), não score nem palavra-chave. A Nicole só pausa quando um
**humano de fato age**: corretor envia mensagem (`broker_reply`), handoff manual de
admin/supervisor, transferência, ou fluxo relacionamento (Samara).

Hoje existem DOIS pontos onde a Nicole se auto-silencia:
1. **Handoff por conteúdo** — `packages/ai/src/chat/pipeline.ts` (~linha 1080): quando
   `shouldHandoff()` dispara (financiamento/simulação/contrato/"quero corretor" ou
   score≥70 + preço), atualiza `conversations.is_ai_active=false` + `handoff_at` +
   `handoff_reason`. Vale p/ WhatsApp E Telegram (ambos passam pelo pipeline).
2. **Handoff por agendamento** (Story 63-15) — `packages/web/src/app/api/webhook/
   whatsapp/route.ts` (~linhas 980-996): após a Nicole confirmar visita
   (`appointmentCreated`), seta `is_ai_active=false` com `handoff_reason='appointment'`.

O sinal de compra do handoff por conteúdo é ÚTIL e será PRESERVADO: activity type
`handoff` na timeline + resumo rico em `leads.ai_summary`. Só o silenciamento sai.

## Acceptance Criteria
- [x] AC1: `pipeline.ts` — quando `shouldHandoff()` dispara, MANTÉM activity `handoff`
  + `ai_summary` (resumo rico) + evento `HANDOFF_TRIGGERED`, mas NÃO atualiza mais
  `conversations` (`is_ai_active`/`handoff_at`/`handoff_reason` intocados). A Nicole
  responde normalmente às mensagens seguintes do lead.
- [x] AC2: `pipeline.ts` — o bloco de memória (12.5: lead_facts/Haiku/fragments) roda
  também quando o handoff dispara (remover a condição `!handoffResult.trigger`) — se a
  Nicole continua atendendo, a memória continua alimentada.
- [x] AC3: webhook WhatsApp — remover o bloco 63-15 (`appointmentCreated` →
  `is_ai_active=false`/`handoff_reason='appointment'`). Após agendar visita, a Nicole
  continua respondendo até um humano agir. `notifyBrokerOfAppointment` permanece.
- [x] AC4: pausas por HUMANO ficam intactas: `send-message` (`broker_reply`),
  `handoff` manual, `transferir`, `start-whatsapp`, `route-inbound` (relacionamento),
  `reativar`, `resume-ai`, e a reativação de 24h (`shouldReactivateAi`/
  `resolveTakeoverAnchor`) segue funcionando para esses casos.
- [x] AC5: testes que cobriam o comportamento antigo atualizados (webhook route.test,
  pipeline tests se houver); type-check/lint/suíte verdes.

## Scope
- **IN:** os 2 pontos de auto-silenciamento acima + testes + comentários/docs inline.
- **OUT:** regras da roleta (não mudam), `shouldHandoff()`/regex em si (continua
  existindo p/ gerar o sinal/registro), fluxo relacionamento (Samara), banner
  `AiStatusBanner` (passa a refletir a realidade sem mudanças), copy do banner.

## Risks
- Nicole responder a pedido de preço/financiamento sem inventar número: o prompt já
  orienta a não passar valores exatos (comportamento observado no caso Luiz — ela
  respondeu genérico e sugeriu visita ANTES de se calar). Risco baixo.
- Lead com visita agendada: Nicole continua conversando; guard existente já impede
  duplicar agendamento (73-1) e ela nunca move etapa (75-56).

## File List
- `docs/stories/75-187-nicole-nunca-se-cala-sozinha.story.md` (this file)
- `packages/ai/src/chat/pipeline.ts` (remove update de conversations no handoff; memória roda sempre)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (remove bloco 63-15 appointment-handoff + flag `appointmentCreated`)

## Change Log
- @sm (River): draft a partir do caso real do lead Luiz + decisão de produto do Marcos
  (handoff p/ humano = roleta por tempo; Nicole nunca se cala sozinha; registro mantido).
- @po (Pax): GO 9/10 — escopo cirúrgico, ACs testáveis, risco baixo documentado. Draft → Ready.
- @dev (Dex): pipeline mantém activity+ai_summary+HANDOFF_TRIGGERED e deixa de tocar
  `conversations`; memória (12.5) roda sempre; webhook perde o bloco 63-15 e a flag
  `appointmentCreated` (notify do corretor preservado). Nenhum teste amarrava no
  comportamento antigo (handoff.test.ts testa a função pura, inalterada) — File List ajustada.
- @qa (Quinn): PASS — 1093/1093 testes, tsc verde nos 2 pacotes, lint limpo nos arquivos
  tocados (12 erros pré-existentes fora do escopo). Verificado raio de impacto: follow-up
  cron não filtra is_ai_active (reengajamento intacto); reativação 24h e pausas humanas
  preservadas. Observação (baixa): ai_summary de handoff pode ser sobrescrito pelo resumo
  vivo do Haiku — aceitável, a activity guarda o sinal permanente.
- Ops (backfill, 2026-07-21): 13 conversas em prod presas com is_ai_active=false por
  handoff automático da IA (5 fora-de-escopo, 7 score+preço, 1 appointment) reativadas
  via PATCH guardado (nenhuma tinha corretor ativo nas últimas 24h). Restam só
  broker_reply (95) e relationship (8) — pausas humanas legítimas.
