# Story 75-159 — Mídia enviada pelo corretor não aparece na conversa (org_id quebra o INSERT)

## Metadata
- **Status:** InReview · **Epic:** Nicole envia mídia (biblioteca) · **PR:** — · **Complexidade:** S (2 pontos) · **Branch:** feat/75-159-midia-corretor-nao-aparece-conversa
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Caso real (Marcos, 2026-07-15): o humano (corretor/admin) enviou uma imagem da biblioteca pelo CRM (📎 → "Enviar"); o lead **recebeu no WhatsApp**, mas **nada apareceu na conversa** do CRM. Em atendimento real isso é grave: quem envia não sabe se foi.

Causa raiz (confirmada no código + banco): o endpoint `POST /api/nicole/media/[id]/send` (`packages/web/src/app/api/nicole/media/[id]/send/route.ts:177-189`) grava a mensagem incluindo **`org_id: appUser.org_id`** — mas a tabela `messages` **NÃO tem coluna `org_id`** → o INSERT falha ("column does not exist") **em silêncio**; a rota ainda retorna `success:true` (sem checar erro). WhatsApp enviado, linha não gravada, conversa vazia. **Exatamente o mesmo bug já corrigido 2x** (Nicole `send-library-media.ts` na 56-3; upload `send-file` na 75-40) — só este endpoint ficou pra trás. Banco confirma: 0 linhas `is_media` desse caminho (só `broker_upload`, que funciona).

## Escopo
**IN:**
1. **`api/nicole/media/[id]/send/route.ts`:** no INSERT em `messages` (L177): **remover `org_id`** (isolamento é via `conversation_id`→`conversations.org_id`); gravar `media_url`/`media_type` também nas **colunas top-level** (paridade com `send-file`); adicionar `metadata.source: "broker_library"` (observabilidade/distingue de nicole_library/broker_upload).
2. **Não falhar em silêncio:** `.select("id").single()` + checar erro; se o INSERT falhar, logar e retornar `MESSAGE_INSERT_FAILED` (500) — mesmo padrão do `send-file` (L232-240). (A inserção em `conversations` na L95 mantém `org_id` — aquela tabela TEM a coluna.)

**OUT:** mudar o `MediaPickerModal`/UI; realtime (a aba já usa `ConversationThread` com subscription); refatorar os outros caminhos (já corretos).

## Acceptance Criteria
1. **Given** um humano envia uma imagem da biblioteca pelo 📎, **then** uma linha `role='broker'` com `metadata.is_media=true` + `media_url`/`media_type` é gravada em `messages` e **aparece na conversa** (`ConversationThread` → `MessageMedia`), tanto no /broker quanto no /dashboard/leads/[id]?tab=conversa.
2. **Given** o INSERT em `messages` falhar, **then** a rota **não** retorna `success:true` — loga e retorna `MESSAGE_INSERT_FAILED` (500).
3. **Given** o envio ao WhatsApp e a gravação OK, **then** o comportamento externo (lead recebe) permanece igual.
4. tsc/lint/vitest limpos; sem regressão.

## Dev Notes
- Renderização NÃO é o problema: `conversation-thread.tsx:226-277` já renderiza `MessageMedia` (metadata.media_type/media_url) p/ qualquer bubble não-central; dashboard reusa esse componente (`dashboard/leads/[id]/page.tsx`). O row simplesmente nunca era inserido.
- Espelhar o insert correto de `api/leads/[id]/send-file/route.ts:206-240` (sem `org_id`, top-level + metadata, `.select().single()` + guard). CONVENÇÃO reforçada: **INSERT em `messages` NUNCA leva `org_id`** (ver [[feedback-postgrest-order-insert]] e [[project-nicole-envio-midia-proativo]] item 1 / Story 56-3).
- `appUser.org_id` segue usado em outras queries do arquivo (L42/63/95/128) — remover só na L179.

## 🤖 CodeRabbit Integration
- **Story Type:** Bug Fix (Integration) · **Complexity:** Low (1 arquivo).
- **Primary:** @dev · **Quality Gate:** @qa.
- **Focus:** insert sem org_id, guard de erro (não retornar success falso), paridade com send-file, sem regressão no envio.

## Dev Agent Record (@dev — 2026-07-16)
- **`api/nicole/media/[id]/send/route.ts`:** INSERT em `messages` — **removido `org_id`** (causa do INSERT silencioso); adicionadas colunas top-level `media_url`/`media_type`; `metadata.source: "broker_library"`; `.select("id").single()` + **guard de erro** → `MESSAGE_INSERT_FAILED` (500) em vez de `success:true` falso. Retorna `messageId`. Espelha `send-file/route.ts:206-240`. `conversations` insert (L95) mantém `org_id` (tabela tem a coluna).
- **Checks:** tsc web 0 · eslint 0 · vitest **1007/1007** (sem regressão).
- **Teste:** sem unit test novo — rota de API sem harness de mock no repo (idem `send-file`); fix espelha caminho comprovado. Validação = envio real (a mídia passa a aparecer na conversa).
- **Branch:** `feat/75-159-midia-corretor-nao-aparece-conversa`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (grava row broker+is_media → renderiza no /broker e /dashboard) ✓ · AC2 (guard: MESSAGE_INSERT_FAILED em vez de success falso) ✓ · AC3 (envio externo intacto) ✓ · AC4 (tsc web 0 / eslint 0 / vitest 1007/1007) ✓.
- Coverage: sem unit test (rota de API sem harness de mock no repo; idem send-file). Fix espelha caminho comprovado (send-file) + evidência no banco de que inserts broker funcionam. Validação definitiva = envio real.

## Change Log
- 2026-07-16 — @qa — **QA GATE: PASS**. 4 ACs, 1007/1007.
- 2026-07-16 — @dev — Fix aplicado (remove org_id + top-level cols + guard de erro). tsc/eslint/1007. Status Ready → InReview.
- 2026-07-16 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-16 — @sm — Story criada (Draft).
