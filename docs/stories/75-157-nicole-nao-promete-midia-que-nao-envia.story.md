# Story 75-157 — Nicole não promete mídia que não envia (+ resolução por contexto + observabilidade)

## Metadata
- **Status:** InReview · **Epic:** Nicole envia mídia (biblioteca) · **PR:** — · **Complexidade:** M (5 pontos) · **Branch:** feat/75-157-nicole-nao-promete-midia-que-nao-envia
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Caso real (lead **Maicon**, prod 2026-07-15): pediu imagens, a Nicole respondeu *"Te mandei aqui a fachada, as plantas e algumas fotos do Vind"* — mas **nada foi enviado**. Lead reclamou 4x ("não recebi nada", "não aparece"…), degringolou até handoff e um corretor respondeu "não vou mandar nada, tem que vir aqui". **Não foi instabilidade** — a Meta nem foi chamada.

Causa raiz (confirmada no banco + código):
1. A **fala** é gerada/enviada **antes** e de forma **independente** do envio real de mídia. A guardrail **RN12** (`packages/ai/src/prompts/guardrails.ts` L87-93) **obriga** a Nicole a sempre afirmar que enviou ("PROIBIDO dizer que não consegue"). Logo a fala nunca reflete a realidade.
2. O envio (`sendLibraryMediaIfRequested`, `packages/web/src/lib/ai/send-library-media.ts`) só dispara se o lead tem `property_interest_id` **ou** cita o nome do empreendimento **na mensagem atual**. Maicon tinha `property_interest_id=NULL` e pediu "tem alguma imagem?" sem citar "Vind" (embora o Vind já estivesse estabelecido na conversa) → `return 0` **silencioso**. Assets do Vind EXISTEM (fachada, planta, +5).
3. O envio **engole erro da Meta (não checa `!res.ok`)** e o webhook **descarta** o `enviados`. **Zero log** → invisível até o lead reclamar.

## Escopo
**IN:**
1. **`send-library-media.ts` — extrair `resolveSendableMedia(admin, {orgId, leadId, text, recentText})`** que devolve `{ propertyId, propertyName, kinds }` (ou vazio). Reusa a lógica atual (interest_id → fallback nome único), mas o **fallback de nome passa a considerar o contexto recente da conversa** (últimas msgs), não só a mensagem atual. Usada por (a) checagem pré-fala e (b) o envio — **mesma resolução nos dois**, sem divergência.
2. **Checagem pré-fala + prompt honesto:** antes do `processMessage`, computar `willSendMedia` (há pedido + empreendimento resolvido + asset ativo). Passar via novo `ProcessMessageParams.mediaContext?: { willSend: boolean; empreendimento?: string|null }` → injetar linha em CONVERSATION CONTEXT (`buildSystemPrompt`, pipeline.ts ~L1112) e **tornar a RN12 condicional**: se `willSend` → afirma o envio (comportamento atual); se pediu material mas **não** dá pra enviar → **NÃO** diz que enviou — se o empreendimento não está definido, pergunta qual (respeitando RN13); senão, oferece a visita / diz que a equipe envia. Nunca afirmar envio falso.
3. **Observabilidade + erro:** `sendLibraryMediaIfRequested` emite `logEvent` (tabela `system_events`, category `ai`) com `enviados`, `skip_reason` (`no_request`/`no_property`/`no_assets`/`none_selected`) e, por asset, `res.status` quando **`!res.ok`** (hoje silencioso). Webhook loga o resultado (hoje descarta).

**OUT:** persistir automaticamente `property_interest_id` quando o empreendimento se estabelece (follow-up — reduziria o problema na origem); reenvio/retry na falha da Meta; envio de vídeo; reordenar envio-antes-da-fala (abordagem alternativa, maior — ficamos na Opção B).

## Acceptance Criteria
1. **Given** lead sem `property_interest_id` que pede "tem alguma imagem?" **com o empreendimento já estabelecido na conversa** (ex.: Vind), **then** `resolveSendableMedia` resolve o empreendimento pelo contexto recente e as imagens **são enviadas** (grava `messages` is_media). — reproduz o caso do Maicon, agora resolvido.
2. **Given** lead pede material mas **nenhum** empreendimento pode ser resolvido (nunca definido), **then** a Nicole **não afirma** que enviou — pergunta qual empreendimento (sem violar RN13) OU oferece visita; e **nenhuma** mensagem de mídia falsa é sugerida.
3. **Given** empreendimento resolvido mas **sem asset** do tipo pedido, **then** a Nicole não promete aquele material específico e oferece alternativa; sem claim falso.
4. **Given** a Meta retorna `!res.ok` (4xx/5xx) no envio, **then** é **logado** (`system_events`, com status) e não incrementa `enviados`; falha de um asset não derruba os demais (mantido).
5. **Given** qualquer envio/skip, **then** há `logEvent` com `enviados`/`skip_reason` (observabilidade), e o webhook loga o resultado.
6. tsc/lint/vitest limpos, com testes de `resolveSendableMedia` (interest_id, nome no contexto, ambíguo→não resolve, sem asset) e do prompt condicional.

## Dev Notes
- `send-library-media.ts`: hoje resolução em L202-232 (interest_id → fallback nome único **só na msg atual**, L212-230), guard `return 0` em L232/241/245; envio L263-275 sem `else` de `!res.ok` (L276). `messages` sem coluna `org_id` (não incluir — L279-282). Dedup por `metadata.media_asset_id` (loadAlreadySentIds).
- Pipeline: `ProcessMessageParams` em `packages/ai/src/chat/pipeline.ts` L204-214 (add `mediaContext?`); CONVERSATION CONTEXT montado em `buildSystemPrompt` L1112+. RN12 em `packages/ai/src/prompts/guardrails.ts` L87-93 — ajustar p/ deferir ao sinal dinâmico do turno. RN13 (L95-98) já cobre "não repergunte se já estabelecido".
- Webhook `api/webhook/whatsapp/route.ts`: `sendLibraryMediaIfRequested` chamado ~L897-911 (await, resultado descartado); `logEvent` via `@web/lib/logger`. Ordenação atual: `processMessage` (texto) → envia texto → envia mídia. A checagem pré-fala roda antes do `processMessage`; o envio continua depois, usando a MESMA resolução.
- Idioma dos prompts: sem acento (padrão do arquivo). Guardrails vivem no banco (`agent_prompts`) E no código — ver [[project-nicole-guardrails-db.md]]; conferir se RN12 tem override no banco e alinhar. Não mover stage (respeita [[feedback-nicole-nunca-move-etapa]]). Ver [[project-nicole-envio-midia-proativo]].

## 🤖 CodeRabbit Integration
- **Story Type:** Integration (Meta Cloud API) + AI/prompt · **Complexity:** Medium.
- **Primary:** @dev · **Quality Gate:** @qa.
- **Focus:** claim honesto casado com o envio real (sem divergência de resolução); logs cobrindo skip/erro; não regredir o caso feliz (envio contextual da 56-x); RN13 (não reperguntar).

## Dev Agent Record (@dev — 2026-07-16)
- **`send-library-media.ts`:** extraído `resolveSendableMedia` (fonte única: interest_id → fallback por NOME no **contexto recente da conversa**, com match por **token distintivo** — ex.: "Vind" casa "Vind Residence" — e match único). Retorna `{kinds, propertyId, propertyName, chosen, skipReason}`. `sendLibraryMediaIfRequested` agora aceita `preResolved`, trata `!res.ok` (log) e emite `logEvent` (`nicole_media_skip`/`_sent`/`_send_failed`/`_send_error`).
- **`pipeline.ts`:** novo `ProcessMessageParams.mediaContext` (`MediaAvailability`) + função pura exportada `mediaContextLine`; injetada no CONVERSATION CONTEXT (após guardrails, prevalece por turno), inclusive sem `state`.
- **`guardrails.ts` (RN12):** reescrita para **deferir ao sinal MATERIAL VISUAL do turno** — só afirma envio quando confirmado; se não houver material, pergunta o empreendimento ou oferece visita. (⚠️ RN12 também vive em `agent_prompts` no banco — atualizar no deploy, ver Change Log.)
- **`webhook/whatsapp/route.ts`:** resolve a mídia ANTES da fala (`resolveSendableMedia`) → passa `mediaContext` ao `processMessage`; reusa a mesma resolução no envio (`preResolved`) e loga o resultado (`nicole_media_result`).
- **Testes:** `resolveSendableMedia` (6: interest_id, contexto/Maicon, ambíguo, no_assets, none_selected, no_request) + `mediaContextLine` (5). `.order` adicionado ao fake admin.
- **Checks:** tsc 0 (web+ai) · eslint web 0 · vitest **995/995** (+11). Sem regressão.
- **Branch:** `feat/75-157-nicole-nao-promete-midia-que-nao-envia`.

**PENDENTE no deploy (@devops):** atualizar a linha `guardrails` em `agent_prompts` (org default) — substituir o texto da RN12 antiga pela nova (deferir ao MATERIAL VISUAL). Só APÓS o deploy do código (a linha dinâmica passa a existir). SQL preparado pelo @dev.

## QA Results (@qa — 2026-07-16)
- **PASS** (com ação obrigatória de deploy). 7 checks OK. AC1 (contexto resolve "Vind" sem interest_id) ✓ · AC2 (sem empreendimento → pergunta, sem claim falso) ✓ · AC3 (sem asset → visita) ✓ · AC4 (`!res.ok` logado, não conta) ✓ · AC5 (logEvent + webhook loga) ✓ · AC6 (tsc web+ai / eslint web / vitest 995/995, +11) ✓.
- **Ação obrigatória no deploy:** atualizar `agent_prompts.guardrails` (org default) — a RN12 do banco mascara o código e ainda diz "imagens enviadas automaticamente"; sem isso a fala não fica 100% honesta. A linha dinâmica MATERIAL VISUAL (código) já mitiga.

## Change Log
- 2026-07-16 — @qa — **QA GATE: PASS** (com ação obrigatória de deploy: update agent_prompts.guardrails). 6 ACs, 995/995.
- 2026-07-16 — @dev — Implementado (resolveSendableMedia + mediaContext/prompt honesto + observabilidade + RN12). tsc/eslint/995. Status Ready → InReview. ⏳ update DB agent_prompts.guardrails no deploy.
- 2026-07-16 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-16 — @sm — Story criada (Draft).
