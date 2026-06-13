---
epic: 51
title: Handoff Nicole → Corretor + Chat do Corretor na Plataforma
status: Draft
created_at: 2026-06-09
updated_at: 2026-06-09 (51-7 adicionada)
created_by: River (@sm)
priority: P0/P1
objetivo_negocio:
  - Notificar o corretor nos dois momentos de maior intenção do lead (agendamento de visita e follow-ups esgotados)
  - Permitir que o corretor responda ao lead diretamente dentro do CRM (chat bidirecional)
  - Dar ao lead a percepção de continuidade e profissionalismo ao ser atendido pelo corretor
depends_on:
  - Epic 11 (Motor de Follow-up) — follow_up_log, brokerSentRecently, cron /api/cron/followup em produção
  - Story 21.1 (webhook idempotente + phone normalization) — base do canal WhatsApp
  - Stories 85 + 86 (RLS corretor) — corretor vê só seus próprios leads
related:
  - packages/ai/src/chat/pipeline.ts (scheduling logic, linhas 582-633; handoff separado em 635-674)
  - packages/ai/src/flows/handoff.ts (handoff existente — NÃO modificar trigger de agendamento)
  - packages/web/src/lib/roleta/notify-broker.ts (notificação de corretor — REUSAR)
  - packages/web/src/app/api/cron/followup/route.ts (follow-up engine — ESTENDER)
stories_planned: [51.1, 51.2, 51.3, 51.4, 51.5, 51.6, 51.7]
---

# Epic 51 — Handoff Nicole → Corretor + Chat do Corretor na Plataforma

## Objetivo do Epic

A Nicole já atende leads automaticamente 24/7 via WhatsApp e Telegram. Há dois momentos críticos em que um humano precisa
entrar em cena: **(a)** quando o lead agendou uma visita (é o pico de intenção — o corretor precisa ser notificado imediatamente)
e **(b)** quando a Nicole esgotou seus follow-ups sem resposta (o lead esfriou — o corretor precisa fazer contato humano:
novo follow-up ou ligação).

Hoje nesses dois cenários **nada acontece**: o agendamento é criado silenciosamente, e os follow-ups esgotados criam apenas
um log interno (`alert_broker` no follow_up_log) sem disparar nenhuma notificação real.

Além disso, quando o corretor quer interagir com o lead, **não existe canal de envio no CRM** — as telas de conversa são
read-only. O corretor precisa sair do CRM, abrir o WhatsApp pessoal, e o histórico se fragmenta.

Este epic fecha essas lacunas em 6 stories sequenciais e paralelas.

---

## Contexto do Sistema Existente — O que JÁ EXISTE (não recriar)

### Controle de IA ativa
- `conversations.is_ai_active` (boolean, default true) — controla se a Nicole responde
- Checado em `packages/web/src/app/api/webhook/whatsapp/route.ts:555` e `packages/web/src/app/api/telegram/webhook/route.ts:450`

### Takeover pelo corretor (automático via cron)
- `packages/web/src/app/api/cron/followup/route.ts:177` — `brokerSentRecently`: se `messages.role='broker'` recente, pausa Nicole por 24h
- `nicole_takeover_days` — após N dias sem resposta do broker, Nicole retoma automaticamente
- Portanto: quando o corretor envia a 1ª mensagem, o takeover JÁ é ativado automaticamente pelo cron

### Agendamento automático pela Nicole
- `packages/ai/src/chat/pipeline.ts:582–633` — detecta intenção de agendamento, cria `appointments`, move para stage `visita_agendada`, atribui `assigned_broker_id` (= `user_id` do broker primário) via `broker_assignments` (`is_primary=true`)
- `packages/ai/src/flows/handoff.ts:48-50` — agendamento NÃO dispara handoff (comentário explícito — manter esse comportamento)

### Handoff manual (admin/dashboard) com resumo Haiku
- `packages/web/src/app/api/leads/[id]/handoff/route.ts` — gera resumo da conversa com Claude Haiku e seta `is_ai_active=false`

### Notificação ao corretor (push + email + WhatsApp)
- `packages/web/src/lib/roleta/notify-broker.ts` — funções `notifyBroker`, `sendBrokerWhatsApp` (importa `sendPushToUser` e `sendEmail`)
- **Hoje**: chamada APENAS pela roleta (call-site real: `packages/web/src/lib/roleta/distributor.ts:137,231`; o webhook WhatsApp chama `distributeLeadToNextBroker` que chama `notifyBroker`) — não cobre agendamento nem follow-ups esgotados
- **Credenciais WhatsApp**: lidas da tabela `whatsapp_config` (`org_id` + `status='active'`), NÃO de env vars — vale para TODAS as stories que enviam WhatsApp (51-1, 51-3, 51-4, 51-5)

### Follow-up engine (cron)
- `packages/web/src/app/api/cron/followup/route.ts` — processa todos os leads, aplica regras por stage
- `alert_broker`: cria entry no `follow_up_log` com `type='alert_broker'` e `type='followup_alert_broker'` — MAS não dispara notificação real (push/email/WhatsApp) ao corretor
- `sendFollowUpMessage` (linha 13–16): envia via Telegram APENAS — WhatsApp não suportado hoje

### Toast de novo lead (realtime)
- `packages/web/src/app/broker/_components/new-lead-notification.tsx` — toast realtime para corretor

### Schema de mensagens
- `messages.role` aceita: 'user', 'assistant', 'system', **'broker'** (presente no schema desde o início)

### Telas de conversa (read-only hoje)
- `packages/web/src/app/broker/leads/[id]/page.tsx` — detalhe do lead do corretor
- `packages/web/src/app/dashboard/conversas/[id]/page.tsx` — conversa no dashboard admin

---

## Gaps que este Epic Fecha

| Gap | Severidade | Story que resolve |
|-----|-----------|-------------------|
| GAP-1: Sem input/API para corretor enviar mensagem ao lead | P0 — tela completamente read-only | 51-1 |
| GAP-3: Lead não sabe que passou a falar com humano | P1 — UX de confiança | 51-2 |
| GAP-5a: Notificação ao corretor não cobre agendamento | P1 — maior intenção do lead | 51-3 |
| GAP-5b: alert_broker no cron não dispara notificação real | P1 — leads esfriando sem aviso | 51-4 |
| GAP-6: sendFollowUpMessage só funciona no Telegram | P2 — parity WhatsApp | 51-5 |
| GAP-7: Dupla fonte de atribuição de corretor | P2 — consistência de dados | 51-6 |

---

## Decisão de Produto (verbatim do PO)

> "Mantemos como está, porém mostra o lead para o corretor e dispara mensagem de aviso apenas em duas situações:
> (1) Quando o lead chega a agendar com a Nicole a visita,
> (2) depois dos follow-ups que a Nicole fizer, se mesmo assim o lead não responder — aí mostramos o lead para o
> corretor e avisamos sobre novo lead para ele fazer novo follow-up e possível ligação para o lead.
> O corretor responde DENTRO do CRM (chat na plataforma)."

**Interpretação validada:**
- Nicole CONTINUA atendendo automaticamente — NÃO desligar `is_ai_active` no agendamento
- Dois gatilhos NOTIFICAM o corretor e destacam o lead (não desligam IA)
- Gatilho A: appointment criado pela Nicole → `notifyBroker` com contexto "visita agendada"
- Gatilho B: follow-ups esgotados sem resposta → `notifyBroker` real (hoje só grava log)
- Chat bidirecional no CRM: corretor envia → WhatsApp/Telegram via API → gravado com `role='broker'`
- Takeover de 24h via `brokerSentRecently` (JÁ EXISTE, não precisa reimplementar)

---

## Stories

### Story 51-1 — Chat Bidirecional do Corretor (P0)
**Executor:** @dev | **QG:** @qa | **Complexity:** M (4-6h) | **Prioridade:** P0
Criar input de mensagem nas telas de conversa do corretor e API route que envia ao lead via WhatsApp (Graph API) ou Telegram conforme canal, gravando `role='broker'`.
**Depende de:** nada (autossuficiente)
**Bloqueia:** 51-2

### Story 51-2 — Mensagem de Transição ao Lead (P1)
**Executor:** @dev | **QG:** @qa | **Complexity:** S (2h) | **Prioridade:** P1
Na 1ª mensagem do corretor (via 51-1), enviar automaticamente mensagem de boas-vindas ao lead: "Olá {nome_lead}, sou o {nome_corretor} da Trifold! Agora estou aqui para te ajudar 😊"
**Depende de:** 51-1

### Story 51-3 — Notificar Corretor no Agendamento (Gatilho A) (P1)
**Executor:** @dev | **QG:** @qa | **Complexity:** S (2-3h) | **Prioridade:** P1
No `pipeline.ts`, após criar appointment e atribuir `assigned_broker_id`, disparar `notifyBroker` com contexto "lead agendou visita com a Nicole".
**Depende de:** nada (autossuficiente)

### Story 51-4 — Notificar Corretor quando Follow-ups Esgotam (Gatilho B) (P1)
**Executor:** @dev | **QG:** @qa | **Complexity:** S/M (3-4h) | **Prioridade:** P1
No cron followup, quando `alert_broker` é criado, disparar `notifyBroker` real ao corretor (hoje só grava log).
**Depende de:** nada (autossuficiente)

### Story 51-5 — Paridade WhatsApp no Envio Automático de Follow-up (P2)
**Executor:** @dev | **QG:** @qa | **Complexity:** M (4-5h) | **Prioridade:** P2
Estender `sendFollowUpMessage` para WhatsApp Cloud API quando `phone` não começa com `tg:`, respeitando janela de 24h e templates aprovados.
**Depende de:** nada, mas complementa 51-4

### Story 51-6 — Decisão de Fonte de Verdade de Atribuição (Spike/Doc) (P2)
**Executor:** @dev/@architect | **QG:** @qa | **Complexity:** XS (1-2h) | **Prioridade:** P2
Documentar e alinhar: roleta de entrada (assign no `whatsapp/route.ts`) vs. broker primário do imóvel (`broker_assignments`) evitando troca silenciosa de `assigned_broker_id`.
**Depende de:** nada

### Story 51-7 — Guard de Precedência em `assigned_broker_id` (P0)
**Executor:** @dev | **QG:** @qa | **Complexity:** S (2-3h) | **Prioridade:** P0
Implementar a Opção 3 do ADR-001: guard de first-write-wins em `pipeline.ts`. Pontos B1 (linha 621) e B2 (linha 659) só setam `leadPatch.assigned_broker_id` quando o lead atual tem `assigned_broker_id IS NULL`. Corrige bug que sobrescrevia silenciosamente o corretor da roleta e dono do chat, quebrando RLS 085 e Story 51-1.
**Depende de:** 51-6 (ADR-001 aceito — sign-off produto Gabriel 2026-06-09)
**Bloqueia:** estabilidade dos fluxos de 51-1, 51-3, 51-4

---

## Ordem de Execução Recomendada

```
51-1 (Chat Bidirecional) — P0, base de tudo
    ↓ depende
51-2 (Transição ao Lead) — P1, feature UX

Em paralelo com 51-1:
51-3 (Notificação Agendamento) — P1, autossuficiente
51-4 (Notificação Follow-up) — P1, autossuficiente
51-5 (Paridade WhatsApp) — P2, complementa 51-4
51-6 (Atribuição Spike) — P2, decisão de design
    ↓ depende (ADR-001 aceito)
51-7 (Guard Precedência) — P0, corrige bug de reatribuição silenciosa
```

---

## Constraints (CON)

- **CON-1:** NÃO desligar `is_ai_active` nos novos gatilhos — Nicole continua ativa em paralelo
- **CON-2:** NÃO reimplementar takeover — `brokerSentRecently` no cron já cuida disso automaticamente
- **CON-3:** REUSAR `notifyBroker` de `packages/web/src/lib/roleta/notify-broker.ts` — não duplicar lógica de push/email/WhatsApp
- **CON-4:** REUSAR padrão de `WhatsAppAdapter` em `packages/bot/src/adapters/whatsapp-adapter.ts` e helper de envio em `cron/appointment-whatsapp-reminders` para o canal de envio de mensagens
- **CON-5:** Mensagens enviadas pelo corretor via CRM devem ser gravadas em `messages` com `role='broker'` — o cron followup já checa isso para o `brokerSentRecently`
- **CON-6:** RLS do corretor (migration 085) — corretor vê só seus próprios leads; API routes de envio devem validar ownership
- **CON-7:** Janela de 24h WhatsApp Business API para mensagens não-template — corretor só pode enviar mensagem freeform se lead enviou mensagem nas últimas 24h (verificar `last_message_at` na conversation)
- **CON-8:** No-Invention (Article IV) — todos os paths e campos neste epic foram verificados em código antes de escrever

---

## NFRs do Epic

- **NFR-1:** Notificações de agendamento devem ser enviadas em < 5s após o insert do appointment
- **NFR-2:** API de envio do corretor deve ser idempotente — reenvio acidental não duplica mensagem ao lead
- **NFR-3:** Falha no envio (WhatsApp 401/429/timeout) não deve quebrar o fluxo principal — tentar e logar sem throw
- **NFR-4:** Mensagem de transição (51-2) só enviada na 1ª mensagem do corretor na conversa, nunca repetida

---

## Critérios de Done do Epic

- [ ] Story 51-1 Done → corretor consegue enviar mensagem ao lead pela tela de detalhe do lead no CRM
- [ ] Story 51-2 Done → lead recebe mensagem de apresentação do corretor na primeira interação
- [ ] Story 51-3 Done → corretor notificado (push/email/WhatsApp) quando Nicole agenda visita
- [ ] Story 51-4 Done → corretor notificado quando cron detecta follow-ups esgotados
- [ ] Story 51-5 Done (P2) → Nicole envia follow-up também via WhatsApp (não só Telegram)
- [ ] Story 51-6 Done (P2) → ADR registrado sobre fonte de verdade de `assigned_broker_id`
- [ ] Story 51-7 Done (P0) → pipeline nunca sobrescreve `assigned_broker_id` já preenchido; RLS 085 e chat 51-1 estáveis
- [ ] Zero regressão no webhook WhatsApp (lead continua sendo processado normalmente)
- [ ] Zero regressão no cron followup (Nicole continua funcionando para Telegram)

---

## Riscos Globais do Epic

| ID | Risco | Prob | Impacto | Mitigação |
|----|-------|------|---------|-----------|
| GR-1 | Janela de 24h do WhatsApp impede broker de enviar freeform | Alta | Alto | Verificar `last_message_at < 24h`; fallback com template aprovado; instruir corretor na UI |
| GR-2 | Corretor recebe notificação duplicada (roleta + agendamento) | Média | Médio | Checar `assigned_broker_id` — se mesmo broker, suprimir notificação de roleta após agendamento |
| GR-3 | Nicole e corretor enviam mensagens simultâneas ao lead | Baixa | Alto | `brokerSentRecently` já protege — garante window de 24h antes de Nicole retomar |
| GR-4 | Mensagem de transição enviada múltiplas vezes | Média | Médio | CON-8: checar `messages.role='broker'` antes de enviar; idempotência por conversation_id |
| GR-5 | `broker_assignments` sem entrada para a property → sem corretor atribuído no agendamento | Média | Médio | APPOINTMENT_NO_BROKER warn já existe; story 51-3 trata gracefully |

---

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-09 | @sm (River) | Epic criado após auditoria de código + decisão de produto do PO |
| 2026-06-09 | @sm (River) | Story 51-7 adicionada (guard ADR-001 — P0, implementação do sign-off de produto) |
