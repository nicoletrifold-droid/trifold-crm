# Story 75-158 — Auto-persistir property_interest_id por contexto (confiável + sem clobber)

## Metadata
- **Status:** Done · **Epic:** Nicole envia mídia (biblioteca) · **PR:** #207 · **Complexidade:** M (5 pontos) · **Branch:** feat/75-158-auto-persistir-property-interest-por-contexto
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Follow-up da 75-157 (ataca a raiz do caso Maicon). Hoje o pipeline **já** auto-persiste `leads.property_interest_id` (`packages/ai/src/chat/pipeline.ts:726-727`), mas com duas falhas:
1. **Só olha a mensagem ATUAL do lead** (`identifyProperty(message, …)`, flow `identify-property.ts` — sem histórico/contexto). No caso Maicon o "Vind" foi dito pela **Nicole/contexto**; o lead nunca digitou a palavra → `identifiedPropertyId` sempre `null` → `property_interest_id` ficou **NULL** → mídia/roleta sem empreendimento.
2. **Sobrescreve incondicionalmente** (`:726-727` sem guard). **Todos** os outros pontos de escrita guardam "só se null" (meta-ads `existingPropertyId===null`, roleta-retry `.is(null)`, etc.) — só o pipeline não. Um lead com seleção **manual** (ex.: corretor setou Yarden) que cite "vind" uma vez tem o valor **trocado** → bug latente com impacto na **roleta** (roteia pro corretor errado) e na mídia.

Blast radius de `property_interest_id` (por isso guardas são críticos): roleta/distribuição (`lib/roleta/distributor.ts`), envio de mídia (`send-library-media.ts`), analytics, filtros de pipeline/lista, email-blasts, reativação.

## Escopo
**IN:**
1. **Identificação por CONTEXTO para persistência:** além da msg atual do lead, considerar o empreendimento **estabelecido no contexto recente da conversa** (reusar a resolução por token distintivo + match único da 75-157 — `resolveSendableMedia`/`identify-property`), para preencher quando o empreendimento está claro mas o lead não digitou a palavra-chave.
2. **Guard de escrita** em `pipeline.ts:726-736`:
   - **Não sobrescrever** um `property_interest_id` já setado (alinha com todos os outros writers), **exceto** quando o LEAD, na própria mensagem, nomear **explicitamente e sem ambiguidade** um empreendimento diferente (troca de interesse legítima). — política a confirmar com o Marcos (AC1).
   - Só persiste em identificação **única** (2+ empreendimentos no turno/contexto → NÃO adivinha).
3. **Observabilidade:** `logEvent` quando auto-preencher/alterar (`nicole_property_interest_set`) com origem (msg do lead vs contexto) e valor anterior.

**OUT:** UIs de seleção manual; backfill retroativo de leads antigos; mudar lógica da roleta; mudar como a mídia resolve (75-157 já cobre o fallback por contexto no envio).

## Acceptance Criteria
1. **Given** lead com `property_interest_id=NULL` e o empreendimento (ex.: Vind) **estabelecido no contexto recente** (mesmo que só a Nicole tenha citado), **when** o lead segue conversando, **then** `property_interest_id` é preenchido com o Vind (identificação única). — reproduz/corrige o caso Maicon.
2. **Given** lead com `property_interest_id` já setado (ex.: manual = Yarden) e uma menção **incidental** a outro empreendimento no contexto, **then** o valor **NÃO** é sobrescrito.
3. **Given** o lead escrever explicitamente e sem ambiguidade que quer outro empreendimento (troca real), **then** o valor é atualizado (política confirmada em AC1 pelo Marcos) e logado com valor anterior.
4. **Given** 2+ empreendimentos citados/ambíguos no turno e contexto, **then** nada é persistido (sem chute).
5. **Given** qualquer auto-preenchimento/alteração, **then** há `logEvent` (`nicole_property_interest_set`) com origem e valor anterior.
6. tsc/lint/vitest limpos, com testes cobrindo: null→preenche por contexto; não-clobber de valor existente; troca explícita do lead; ambíguo→não persiste.

## Dev Notes
- Write atual: `pipeline.ts:715-736` (batch `leadPatch`, aplicado em `:882-884`); `currentLead` já é buscado em `:719-723` (tem `property_interest_id`). O guard entra aqui.
- `identifyProperty` (`packages/ai/src/flows/identify-property.ts`) retorna `string|null`, sem confiança/ambiguidade, **primeiro match** — não distingue "citou os dois". A desambiguação real hoje só existe em `qualification.ts:132-142` (seta só se um E não o outro) e no match único de `send-library-media.ts` (75-157). Reusar essa noção de "único".
- `conversations.current_property_id` (state) já é sticky por turno (`pipeline.ts:894`) — mas também só vem de `identifyProperty` (msg do lead), então hoje também fica null no caso Maicon. Pode virar mais um sinal, não a fonte.
- Distinguir "manual" vs "auto" não é trivial (não há flag). Política proposta: **preencher quando null; alterar valor existente só com afirmação explícita do lead** (não por contexto). Respeitar [[feedback-nicole-nunca-move-etapa]] (isto NÃO mexe em stage). Ver [[project-nicole-envio-midia-proativo]] e [[project-roleta-filtro-empreendimento]].

## 🤖 CodeRabbit Integration
- **Story Type:** AI/pipeline + Database (write guard) · **Complexity:** Medium.
- **Primary:** @dev · **Quality Gate:** @qa.
- **Focus:** não-clobber (guard igual aos outros writers), unicidade (não adivinhar), blast radius roleta/mídia, sem regressão no auto-fill legítimo.

## Dev Agent Record (@dev — 2026-07-16)
**Decisões do Marcos:** (1) só troca valor existente com afirmação explícita do lead; (2) pode preencher por contexto.
- **`identify-property.ts`:** extraído `propertyKeywords`/`textMatchesProperty` (reuso); novo `identifyPropertyUnique(text, properties)` — retorna id só com match **único** (2+ → null, nunca adivinha). `identifyProperty` mantém comportamento (paridade).
- **`flows/index.ts`:** re-exporta `identifyPropertyUnique`.
- **`pipeline.ts`:** nova função pura exportada `resolvePropertyInterestWrite` (política: vazio→preenche por msg do lead > contexto > collectedData; setado→só troca com afirmação explícita e única do lead). Reescrito o write em `:725+` usando-a; contexto = msg atual + histórico (últimas 20). `emit("nicole_property_interest_set")` com origem + valor anterior (log decoplado; webhook→system_events). `identifiedPropertyId` segue usado no resto (RAG/flow/metadata).
- **Testes:** `identifyPropertyUnique` (5: único, contexto, ambíguo, vazio, amenidade) + `resolvePropertyInterestWrite` (7: fill contexto/lead/collected, não-clobber, troca explícita, reafirma mesmo, nada).
- **Checks:** tsc 0 (web+ai) · eslint web 0 · vitest **1007/1007** (+12). Sem regressão. Sem mudança de banco/prompt (só código).
- **Branch:** `feat/75-158-auto-persistir-property-interest-por-contexto`.

## QA Results (@qa — 2026-07-16)
- **PASS.** 7 checks OK. AC1 (contexto preenche vazio — Maicon) ✓ · AC2 (menção incidental NÃO sobrescreve) ✓ · AC3 (troca explícita do lead atualiza + loga previous) ✓ · AC4 (ambíguo → não persiste) ✓ · AC5 (emit `nicole_property_interest_set` com origem/anterior) ✓ · AC6 (tsc web+ai / eslint web / vitest 1007/1007, +12) ✓.
- Sem mudança de banco/prompt (só código). Blast radius (roleta/mídia): net mais seguro — preenche mais, nunca clobber.

## Change Log
- 2026-07-16 — @devops — Push + **PR #207** + squash-merge. Deploy produção (Vercel) **SUCCESS** (commit 5cff3c3). Só código, sem mudança de banco. Status → **Done**.
- 2026-07-16 — @qa — **QA GATE: PASS**. 6 ACs, 1007/1007. Aguardando @devops.
- 2026-07-16 — @dev — Implementado (identifyPropertyUnique + resolvePropertyInterestWrite + guard no pipeline). tsc/eslint/1007. Status Ready → InReview.
- 2026-07-16 — @po — **GO (10/10)**. Status Draft → Ready.
- 2026-07-16 — @sm — Story criada (Draft).
