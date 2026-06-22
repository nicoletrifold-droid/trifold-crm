# Story 63-10 — Caminho de Saída quando Janela de 24h está Fechada

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-10
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict **GO (7/10)**. Status Draft → Ready. **Escopo honesto confirmado:** AC5/Context tratam "modelo aprovado" como placeholder informativo, SEM envio real (correto — o template aprovado não existe no fluxo do corretor, Epic 51). `leads.metadata` JSONB confirmado (migrations 063 e 075) — Option B (AUTO-DECISION) viável. **Should-fix não-bloqueantes:** (1) **AC2 impreciso** — `PATCH /api/leads/[id]` NÃO aceita `metadata` (`allowedFields` route L65-85 não inclui o campo; `buildUpdatePayload` o descarta silenciosamente). Usar o fallback JÁ previsto na story (T1/Gotcha: criar `PATCH /api/broker/leads/[id]/notify-preference`) ou `createAdminClient()`. (2) **Plumbing desatualizado** — o caminho de saída fica no `BrokerMessageInput` (recebe `disabledByWindow`, correto), mas a prop `notifyOnReply` precisa passar `page.tsx` → **`ConversationThread`** → `BrokerMessageInput` (a story pula o `ConversationThread`, intermediário criado na 63-5). (3) `page.tsx` (detalhe) já seleciona o lead com `*` (L20-23) → `metadata` já disponível; T3 "se não incluído" é no-op. Depende de 63-4 (estado de janela: `getWindowStatus` + `disabledByWindow` já existem). Independe de 63-8/63-9. CON-1 OK. Liberada para @dev.
- **Priority:** P2 — quando a janela fecha, o corretor não tem nenhum caminho de ação sugerido
- **Complexity:** S (2-3h)
- **Fase:** 3 (Inteligência)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[closed_window_ux_check, db_preference_check]`
- **Depende de:** Story 63-4 Done (estado de janela fechada já implementado)

---

## User Story

**Como** corretor que abriu uma conversa mas descobriu que a janela de 24h está fechada,
**Quero** ter uma ação clara do que fazer em vez de um compositor desabilitado sem mais informações,
**Para que** eu não desista do lead — e o sistema registre que quero ser notificado quando o lead responder.

---

## Context

A Story 63-4 desabilita o compositor quando a janela está fechada e exibe a mensagem
"Janela de 24h encerrada. Aguarde o lead responder para continuar a conversa."

Isso é melhor do que nada, mas ainda é um beco sem saída. Esta story adiciona dois caminhos de saída:

### Caminho 1 — "Me avisar quando o lead responder"
Um botão que, ao ser clicado, registra que o corretor quer uma notificação quando o lead enviar
a próxima mensagem. Implementação: gravar uma linha na tabela de preferências ou num campo simples
em `conversations` ou em `leads.metadata`.

### Caminho 2 — Placeholder para template aprovado
Um elemento visual informativo (não funcional nesta story) que explica ao corretor a existência
de templates WhatsApp aprovados para iniciar conversa fora da janela. Exibe: "Modelos aprovados
de mensagem estarão disponíveis em breve." com ícone `MessageSquarePlus`.

**Esta story NÃO implementa o envio real de templates** — o template aprovado não existe ainda
no fluxo do corretor. A story apenas prepara a arquitetura (estrutura de dados para a preferência
de notificação) e a UI de placeholder, sem prometer funcionalidade que não existe.

### Estrutura de dados para preferência de notificação

Opção A: Campo `notify_broker_on_reply: boolean` em `conversations` (migration necessária)
Opção B: Entrada em `leads.metadata` como `{ notify_broker_on_reply: true }` (sem migration)
Opção C: Tabela separada `broker_notification_preferences` (overkill para Fase 3)

[AUTO-DECISION] → Usar **Opção B** (`leads.metadata` JSONB) para evitar migration e manter o
escopo de Fase 3. Se no futuro virar feature central, migrar para campo dedicado.
Razão: `leads.metadata` JSONB já existe (migration 075), aceita campos extras sem schema change.

---

## Acceptance Criteria

- [x] **AC1:** Quando a janela está fechada (estado da 63-4), o compositor desabilitado exibe, além da mensagem explicativa, o botão "Me avisar quando o lead responder"
- [x] **AC2:** Ao clicar em "Me avisar quando o lead responder", a preferência é gravada em `leads.metadata.notify_broker_on_reply = true` via `POST /api/leads/[id]/notify-on-reply` (endpoint dedicado — o PATCH genérico não aceita `metadata`)
- [x] **AC3:** Após gravar, o botão muda para estado confirmado: ícone `BellRing` + "Aviso configurado" (não clicável novamente)
- [x] **AC4:** O campo `leads.metadata.notify_broker_on_reply` é lido no carregamento da página — se já `true`, o botão já aparece em estado confirmado desde o início
- [x] **AC5:** Abaixo do botão, exibe um placeholder informativo: ícone `MessageSquarePlus` + "Modelos de mensagem aprovados estarão disponíveis em breve" (texto cinza, sem botão de ação — somente informativo)
- [x] **AC6:** TypeScript compila sem erros; ESLint passa

---

## Tasks / Subtasks

- [x] **T1 — Verificar `leads.metadata` e PATCH endpoint**
  - Confirmado: `PATCH /api/leads/[id]` NÃO aceita `metadata` (`allowedFields` L65-85 não inclui o campo → descartado por `buildUpdatePayload`)
  - Criado endpoint dedicado `POST /api/leads/[id]/notify-on-reply` que faz merge no `leads.metadata` JSONB via `createAdminClient()`, com autorização por sessão (org + ownership do corretor)

- [x] **T2 — Atualizar `BrokerMessageInput` com os caminhos de saída**
  - Quando `disabledByWindow=true` (prop da 63-4), renderiza:
    - Botão "Me avisar quando o lead responder" (estados: idle/loading/confirmado `BellRing` + "Aviso configurado")
    - Placeholder informativo `MessageSquarePlus` "Modelos de mensagem aprovados estarão disponíveis em breve" (cinza, sem ação)
  - O clique faz POST no endpoint dedicado e atualiza o state local

- [x] **T3 — Ler estado inicial de `notify_broker_on_reply`**
  - `page.tsx` (detalhe) já seleciona o lead com `*` → `metadata` disponível (no-op de query, como o PO apontou)
  - Prop `notifyOnReply` atravessa `page.tsx` → `ConversationThread` → `BrokerMessageInput` (plumbing pelo intermediário da 63-5)

- [x] **T4 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story
  - ESLint → zero erros nos arquivos da story

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx  ← EDITAR (T2)
packages/web/src/app/broker/leads/[id]/page.tsx                               ← EDITAR (T3)
```

### Contexto de código
- `leads.metadata` JSONB existe desde migration 075 — aceita campos extras sem schema change
- `PATCH /api/leads/[id]` — verificar se existe e se aceita `metadata` no body; se não, usar `createAdminClient()` para update direto (ou criar endpoint específico)
- O campo `notify_broker_on_reply` nesta story serve APENAS para UX local — a notificação real quando o lead responde é implementação futura (o webhook de WhatsApp já recebe a mensagem do lead; adicionar o check de notificação lá é escopo futuro)

### Gotchas
- **Não implementar a notificação push em si nesta story** — apenas gravar a preferência. A notificação real requer modificação no webhook handler de WhatsApp, que está fora do escopo do Epic 63
- **Se `PATCH /api/leads/[id]` não existe**: criar `PATCH /api/broker/leads/[id]/notify-preference` (endpoint simples de 20 linhas) para gravar apenas o campo de preferência

---

## File List

### Criar
- `packages/web/src/app/api/leads/[id]/notify-on-reply/route.ts` — endpoint dedicado que grava `leads.metadata.notify_broker_on_reply` (admin client + merge JSONB) (T1)

### Modificar
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` — caminhos de saída quando `disabledByWindow` (T2)
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` — repasse da prop `notifyOnReply` (plumbing 63-5)
- `packages/web/src/app/broker/leads/[id]/page.tsx` — passar `notifyOnReply` a partir de `lead.metadata` (T3)

---

## Testing

### Smoke pós-deploy
- Lead WhatsApp com janela fechada: botão "Me avisar" visível no compositor desabilitado
- Clicar "Me avisar": estado muda para "Aviso configurado"; reload da página mantém estado confirmado
- Verificar em `leads.metadata` no banco: `SELECT metadata FROM leads WHERE id='...'` → `{ notify_broker_on_reply: true }`

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `PATCH /api/leads/[id]` não aceita `metadata` — acesso negado por RLS | T1: verificar endpoint; criar endpoint específico se necessário |
| R2 | Corretor clica várias vezes — múltiplos writes ao banco | AC3: botão fica não-clicável após confirmação (estado local); PATCH é idempotente (sempre seta `true`) |
| R3 | A feature de notificação real nunca é implementada — placeholder "em breve" fica para sempre | Aceitável como P2; documentar como débito; o placeholder é informativo, não uma promessa de release |

---

## Out of Scope

- Implementação da notificação push real quando o lead responde (requer modificação no webhook)
- Envio real de template WhatsApp aprovado fora da janela
- Configuração de qual template usar (requer painel de templates)

---

## Definition of Done

- [ ] AC1–AC6 marcados como completos
- [ ] T1–T4 marcados como done
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Dev Agent Record

### Agent Model Used
- Dex (Builder) — Claude Opus 4.8 (YOLO autônomo)

### Completion Notes
- **Gravação do flag sem o PATCH genérico (AC2/should-fix):** confirmado que `PATCH /api/leads/[id]` filtra `allowedFields` (L65-85) e descarta `metadata` silenciosamente. Em vez de afrouxar o whitelist do endpoint genérico (risco de escopo), criei o endpoint **dedicado** `POST /api/leads/[id]/notify-on-reply`. Fluxo: (1) `requireAuth`; (2) autorização por sessão — lê o lead com a supabase do usuário (RLS por org) e valida ownership (`assigned_broker_id` ou role privilegiada); (3) merge preservando o JSONB existente (`{ ...metadata, notify_broker_on_reply }`); (4) escrita via `createAdminClient()` escopada por `id`+`org_id`. Idempotente (sempre seta o mesmo valor). Body opcional `{ enabled }` default `true`.
- **Plumbing (should-fix):** a prop `notifyOnReply` atravessa `page.tsx` → `ConversationThread` → `BrokerMessageInput`, sem pular o intermediário criado na 63-5. `page.tsx` já seleciona o lead com `*`, então `metadata` está disponível sem alterar a query (no-op, como o PO apontou).
- **UI (AC1/AC3/AC5):** botão "Me avisar quando o lead responder" (estados idle `Bell` / loading `Loader2` / confirmado `BellRing` "Aviso configurado"), placeholder informativo `MessageSquarePlus` (cinza, sem ação). Renderizados só quando `disabledByWindow`. Alvos ≥44px, `aria-label`/`aria-live`/`aria-hidden` nos ícones.
- **Escopo honesto:** NENHUM envio real de template — apenas persistência da preferência. A entrega real quando o lead responde permanece débito futuro (webhook WhatsApp), conforme story.
- **CON-1:** nenhum `tel:`/`wa.me`/click-to-call. **CON-3:** `is_ai_active` não tocado (endpoint só escreve `metadata.notify_broker_on_reply`).

### Validações
- Vitest (suíte completa): **431/431 passaram** (33 arquivos) — zero regressões.
- Type-check: zero erros nos arquivos da story (pré-existentes em `email-templates/visual-editor.tsx`, não relacionados).
- ESLint: zero erros nos arquivos da story.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 3, caminho de saída para janela fechada | @sm (River) |
| 2026-06-18 | 1.1 | **Implementação (@dev).** Endpoint dedicado `POST /api/leads/[id]/notify-on-reply` (admin + merge JSONB, sem o PATCH genérico); botão "me avisar" com estados + placeholder; prop `notifyOnReply` via `ConversationThread`. AC1–AC6 e T1–T4 done. Status Ready → Ready for Review. | @dev (Dex) |
| 2026-06-18 | 1.0 | **Validação PO — verdict GO (7/10). Status Draft → Ready.** Escopo honesto (placeholder de template, sem envio real — correto). `leads.metadata` confirmado (migr. 063/075), Option B viável. Should-fix não-bloqueantes: AC2 — `PATCH /api/leads/[id]` não aceita `metadata` (L65-85); usar endpoint dedicado/`createAdminClient` (já previsto em T1/Gotcha); plumbing de `notifyOnReply` deve passar pelo `ConversationThread`; `metadata` já vem no `*` do select de detalhe. Depende de 63-4 (pronto). Independe de 63-8/63-9. CON-1 OK. Liberada para @dev. | @po (Pax) |

---

## QA Results

### Review Date: 2026-06-18
### Reviewed By: Quinn (Test Architect, @qa)

**Veredito: PASS** (quality_score 93)

**Traceability AC→código:** AC1–AC6 atendidos. AC1 bloco `disabledByWindow` exibe msg + botão "Me avisar"; AC2 `POST /api/leads/[id]/notify-on-reply` grava `metadata.notify_broker_on_reply` (PATCH genérico não aceita `metadata`, confirmado); AC3 `notifyEnabled ? BellRing "Aviso configurado" : botão` (guard impede reclique); AC4 `page.tsx` passa `notifyOnReply` de `lead.metadata` → `useState` inicial; AC5 placeholder `MessageSquarePlus` cinza sem ação; AC6 lint/type-check limpos.

**Segurança do endpoint (ponto crítico):** `requireAuth` (401 sem sessão) → SELECT do lead com supabase do USUÁRIO (RLS por org) + `.eq(org_id).eq(is_active)` → gate de ownership (`isPrivileged` admin/supervisor/gerente-comercial OU `assigned_broker_id === appUser.id`, senão 403, 404 se lead ausente) → merge JSONB `{ ...currentMetadata, notify_broker_on_reply }` (preserva chaves existentes) → UPDATE via `createAdminClient()` escopado por `.eq(id).eq(org_id)` (id já validado como do usuário → sem cross-org). Idempotente (`{ enabled }` default true). **CON-3:** UPDATE só de `metadata`, `is_ai_active` intocado.

**Plumbing:** `page.tsx` (select `*` → `metadata` disponível, no-op de query) → `ConversationThread` (prop `notifyOnReply`, default false) → `BrokerMessageInput`. Não pula o intermediário da 63-5. Verificado em código.

**a11y:** botão `aria-label` ≥44px; estado confirmado `aria-live="polite"`; ícones `aria-hidden`. NFR-2 atendido.

**CON-1 INVIOLÁVEL:** `git grep` nos arquivos tocados → ZERO (exit 1).

**Escopo honesto:** persiste apenas a preferência; NENHUM envio real de template. Placeholder informativo, não promessa de release (R3).

**Testes/lint/type-check (reais):** suíte `npx vitest run` → 431/431 (33 arquivos), zero regressão. ESLint 0 e type-check 0 nos arquivos da story (3 erros ambientais pré-existentes em `visual-editor.tsx`/react-email-editor).

**Issues (LOW/CONCERNS, não-bloqueantes):** TEST-001 (endpoint/UI sem teste de rota — repo só testa helper puro); REL-001 (notificação real é débito futuro no webhook — por design, escopo Fase 3); SEC-001 (TOCTOU teórico no read-then-write, inócuo p/ flag idempotente).

### Gate Status

Gate: PASS → docs/qa/gates/63.10-saida-janela-fechada.yml
Consolidado Fase 3: docs/qa/gates/epic-63-fase3.yml

**Recomendação:** LIBERAR para @devops *push (commit 8826843). @sm rastrear REL-001 (webhook) como débito.
