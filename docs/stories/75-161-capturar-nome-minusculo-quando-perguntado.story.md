# Story 75-161 — Capturar o nome do lead mesmo em minúsculas (quando a Nicole acabou de perguntar)

## Metadata
- **Status:** Done · **Epic:** Nicole — qualificação · **PR:** #210 · **Complexidade:** S (3 pontos) · **Branch:** feat/75-161-capturar-nome-minusculo
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Caso real (Marcos, 2026-07-16): o lead digitou **"maicon"** (minúsculo) respondendo à Nicole, mas `leads.name` ficou vazio ("Sem nome"). Causa: o extrator determinístico (`packages/ai/src/flows/qualification.ts`) tem um fallback que aceita 1–3 palavras **só se começar com maiúscula** (`/^[A-ZÀ-Ÿ]/`). "maicon" cai fora → nome não capturado. A Nicole "sabe" o nome (respondeu "Maicon") porque o **modelo** lê texto livre, mas a persistência depende do extrator regex. A rede de segurança (enrichment por IA) só roda no cron com IA ativa — aqui já era handoff.

Decisão do Marcos: capturar o minúsculo **só quando a Nicole acabou de perguntar o nome** (contexto claro) + lista de exclusão, para não gravar "quero"/"apartamento" como nome. Capitalizar ao salvar.

## Escopo
**IN:**
1. **`qualification.ts` — `extractCollectedData(aiResponse, currentData, opts?)`:** novo `opts.nameExpected`. No fallback de mensagem curta, aceitar 1–2 palavras **em minúsculas** quando `nameExpected` (além do caso capitalizado já existente). Guarda por **stoplist** por palavra (`NAME_STOPWORDS`: sim/nao/quero/vind/apartamento/etc.) e capitalização do resultado (`capitalizeName`: "maicon"→"Maicon"). Capitalização aplicada também aos nomes dos padrões regex.
2. **`pipeline.ts`:** computar `nameExpected` = a **última mensagem da Nicole no histórico** pediu o nome (regex `nome|como .* chamar|com quem .* falo`) **e** ainda não há nome; passar em `extractCollectedData(message, collectedData, { nameExpected })` (só na extração da msg do LEAD; a da IA continua sem).

**OUT:** extração de nome por LLM a cada turno (custo); reprocessar leads antigos "Sem nome"; mudar o enrichment cron.

## Acceptance Criteria
1. **Given** a Nicole perguntou o nome e o lead responde **"maicon"** (minúsculo), **then** `collected_data.name` = **"Maicon"** e é persistido em `leads.name`. — reproduz/corrige o caso.
2. **Given** `nameExpected=false` (Nicole não perguntou), **then** um "maicon" solto **não** é capturado (comportamento antigo preservado).
3. **Given** `nameExpected=true` mas a resposta é palavra comum ("quero", "não sei", "apartamento"), **then** **não** vira nome (stoplist).
4. **Given** resposta com maiúscula (fluxo antigo, ex.: "Prazer, Maria Silva"), **then** continua capturando corretamente (sem regressão) e o nome sai capitalizado.
5. tsc/lint/vitest limpos, com testes do minúsculo/stoplist/nome composto/regressão.

## Dev Notes
- Extrator: `qualification.ts` — fallback em L111-120 (exige maiúscula). Padrões regex L94-100. `finalData.name` vem só da msg do lead (`pipeline.ts:712`, a da IA é descartada para nome). Persistência em `pipeline.ts:~802` (`leadPatch.name`).
- `history` (últimas 20 msgs) disponível no `processMessageWithMetadata`; a última msg `role='assistant'` = o que o lead está respondendo.
- Rede de segurança existente (não substitui): `haiku-enrichment.ts` (LLM) via cron `enrich-leads` — gated em `is_ai_active`. Ver [[project-lead-enriquecimento]].

## 🤖 CodeRabbit Integration
- **Story Type:** AI/pipeline (NLU) · **Complexity:** Low.
- **Primary:** @dev · **Quality Gate:** @qa.
- **Focus:** falso positivo de nome (stoplist + nameExpected), sem regressão no fluxo capitalizado, capitalização consistente.

## Dev Agent Record (@dev — 2026-07-16)
- **`qualification.ts`:** `extractCollectedData` recebe `opts.nameExpected`; fallback aceita 1–2 palavras minúsculas quando `nameExpected`; `NAME_STOPWORDS` (por palavra) + `capitalizeName` (aplicado aos padrões regex e ao fallback). `charAt(0)` p/ satisfazer `noUncheckedIndexedAccess` do web.
- **`pipeline.ts`:** `nameExpected` = última msg `assistant` do `history` casa `nome|como .* chamar|com quem .* falo` E `!collected_data.name`; passado só na extração da msg do lead.
- **Testes:** +5 (minúsculo→Maicon, sem nameExpected não captura, stoplist quero/não sei/apartamento, nome composto minúsculo, stopword capitalizada).
- **Checks:** tsc web 0 · tsc ai 0 · vitest **1012/1012** (+5). Sem regressão nos testes de nome existentes.
- **Branch:** `feat/75-161-capturar-nome-minusculo`.

## QA Results (@qa — 2026-07-16)
- **PASS.** AC1 (minúsculo "maicon" → "Maicon" quando nameExpected) ✓ · AC2 (sem nameExpected não captura) ✓ · AC3 (stoplist: quero/não sei/apartamento não viram nome) ✓ · AC4 (fluxo capitalizado sem regressão + capitaliza) ✓ · AC5 (tsc/vitest 1012/1012, +5) ✓.

## Change Log
- 2026-07-16 — @devops — Push + **PR #210** + squash-merge. Deploy produção (Vercel) **SUCCESS** (commit 9507cf3). Status → **Done**.
- 2026-07-16 — @qa — **QA GATE: PASS**. 5 ACs, 1012/1012.
- 2026-07-16 — @dev — Implementado (nameExpected + stoplist + capitalizeName). tsc/1012. Status Ready → InReview.
- 2026-07-16 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-16 — @sm — Story criada (Draft).
