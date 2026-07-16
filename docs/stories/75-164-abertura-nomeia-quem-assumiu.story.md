# Story 75-164 — Abertura de atendimento nomeia quem ASSUMIU (não o corretor atribuído)

## Metadata
- **Status:** Done · **Epic:** Atendimento WhatsApp do corretor · **PR:** #213 · **Complexidade:** S (2 pontos) · **Branch:** feat/75-164-abertura-nomeia-quem-assumiu
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Caso real (Marcos, 2026-07-16): a mensagem de "Iniciar atendimento" saiu **"Aqui é Valeria Costa"**, mas quem clicou/operava era o **Jonathan** (confirmado no banco: `sent_by=Jonathan`, lead atribuído à Valeria). O endpoint `start-whatsapp` (Story 75-142) preenche o nome com o `assigned_broker` do lead, não com o usuário logado que assumiu. A mensagem de transição de outro fluxo (`send-message` → `buildTransitionText(lead, appUser.name)`) já faz certo (usa quem está logado) — só o `start-whatsapp` diverge. Também: fallback do empreendimento vira "no empreendimento **nosso empreendimento**" (dobrado). Decisão do Marcos: nomear **quem assumiu** (usuário logado).

## Escopo
**IN:**
1. **`api/leads/[id]/start-whatsapp/route.ts`:** variável `corretor` do template/mirror passa a usar **`appUser.name`** (quem clicou), fallback "Trifold" — não mais o `assigned_broker`. Mantém o guard de ownership por `assigned_broker_id`.
2. Fallback do `empreendimento` de "nosso empreendimento" → **"que você procura"** (lê natural: "no empreendimento que você procura"), evitando a duplicação; melhora template E mirror.

**OUT:** reatribuir o lead ao usuário que assumiu (fora de escopo — só o nome da abertura); rótulo das bolhas na conversa (Story 75-165). **Follow-up (fora do código):** o texto do template Meta `abertura_atendimento_corretor` tem "corretor" fixo (gênero) — corrigir requer re-aprovação na Meta.

## Acceptance Criteria
1. **Given** o Jonathan (logado) clica "Iniciar atendimento" num lead atribuído à Valeria, **then** a abertura (template + histórico) diz **"Aqui é Jonathan…"** (quem assumiu), não Valeria.
2. **Given** o próprio corretor dono clica, **then** aparece o nome dele (comportamento idêntico ao esperado).
3. **Given** lead sem empreendimento definido, **then** a frase lê "no empreendimento que você procura" (sem duplicar "empreendimento").
4. **Given** `appUser.name` vazio (raro), **then** fallback "Trifold" (nunca variável vazia — Meta rejeita).
5. tsc/lint/vitest limpos; sem regressão.

## Dev Notes
- `start-whatsapp/route.ts`: `corretor` em L46-47 (troca p/ `appUser.name`); `empreendimento` fallback L49; mirror L95 (mantém estrutura = texto do template, refletindo o que o lead recebeu). `sent_by: appUser.id` já é gravado (L102). Ver [[project-corretor-whatsapp-atendimento]] (75-142) e a mensagem de transição correta em `lib/broker/transition-message.ts`.

## Dev Agent Record (@dev — 2026-07-16)
- `start-whatsapp/route.ts`: `corretor` = `appUser.name` (quem assumiu), fallback "Trifold"; removido o join `assigned_broker:users` (mantido `assigned_broker_id` p/ o guard). `empreendimento` fallback → "que você procura". Mirror mantém a estrutura do texto do template (reflete o que o lead recebeu).
- Checks: tsc web 0 · eslint 0 · vitest 1021/1021 (sem novo teste — rota sem harness; mudança é troca de variável). Status Ready → InReview.
- Branch: `feat/75-164-abertura-nomeia-quem-assumiu`. **Follow-up:** template Meta `abertura_atendimento_corretor` tem "corretor" (gênero) fixo — re-aprovar na Meta p/ neutralizar.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (nomeia quem assumiu — appUser) ✓ · AC2 (dono clica → próprio nome) ✓ · AC3 (fallback "que você procura", sem duplicar) ✓ · AC4 (fallback "Trifold" não-vazio) ✓ · AC5 (tsc/eslint/1021) ✓. Follow-up do gênero no template registrado.

## Change Log
- 2026-07-16 — @devops — PR #213 + squash-merge. Deploy prod **SUCCESS** (4df3e04). Status → **Done**.
- 2026-07-16 — @qa — **QA GATE: PASS**.
- 2026-07-16 — @dev — Implementado (corretor = appUser + fallback empreendimento). Status Ready → InReview.
- 2026-07-16 — @po — **GO**. Draft → Ready.
- 2026-07-16 — @sm — Story criada.
