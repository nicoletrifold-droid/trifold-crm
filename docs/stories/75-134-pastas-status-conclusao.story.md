# Story 75-134 — Pastas: selo de status (Aguardando / Em análise / Concluída) na listagem + banner no detalhe

## Metadata
- **Status:** Done · **Epic:** Pastas · **PR:** #131 · **Complexidade:** S (3 pontos) · **Branch:** feat/75-134-pastas-status-conclusao
- **executor:** @dev · **quality_gate:** @qa · **design:** @ux-design-expert

## Contexto
Na listagem de Pastas (`/dashboard/pastas`) hoje só aparece "X/Y documentos entregues" — bom pra ver o que falta chegar, mas não dá pra saber, batendo o olho, quando a pasta **terminou** (tudo deferido + Termo assinado). O diretor pediu um indicador visual disso, tanto na listagem quanto ao abrir a pasta. Design escolhido (com @ux-design-expert): **selo (pill) colorido ao lado do nome**. Ver [[project-pastas-documentos]] e [[project-clicksign-integracao]].

## Regra de status (3 estados)
- ⏳ **Aguardando** (cinza): `entregues < total` — falta documento chegar.
- 🔎 **Em análise** (âmbar): tudo entregue, mas nem tudo deferido **ou** Termo não assinado.
- ✅ **Concluída** (verde): **todos os docs (exceto o Termo) deferidos** **e** **Termo de Intenção assinado** (envelope Clicksign `signed`/`closed`).

`entregues` = situacao ∈ {entregue, deferido}; `deferidos` = situacao = deferido. Termo = doc slug `termo_intencao`. Sem Termo assinado ⇒ nunca "Concluída".

## Escopo
**IN:**
1. **`lib/pastas/status.ts`** (novo + teste): `computePastaStatus(docs)` → `{ status, total, entregues, deferidos }`, com a regra acima. Fonte única da verdade (usada na listagem e no detalhe).
2. **`dashboard/pastas/page.tsx`:** carregar `pasta_documentos(slug, situacao, signature_envelopes(status))`; calcular status por pasta; passar `status/total/entregues/deferidos` pro manager.
3. **`pastas-manager.tsx`:** selo (pill) ao lado do nome (3 estados/cores) + subtítulo contextual:
   - Aguardando: `{entregues}/{total} documentos entregues`
   - Em análise: `{entregues}/{total} entregues · {deferidos}/{total} deferidos`
   - Concluída: `{total}/{total} documentos entregues`
4. **`pasta-detail.tsx`:** banner/selo no topo quando **Concluída** (verde, "Pasta concluída — documentos deferidos e Termo assinado"), calculado a partir de `docs` + `signatures` já disponíveis.

**OUT:** mudar a coluna `pastas.status` (é outro conceito, não mexer); filtro/ordenação por status na lista (follow-up); notificação ao concluir.

## Acceptance Criteria
1. **Given** uma pasta com documento faltando (`entregues < total`), **then** selo **⏳ Aguardando** (cinza) e subtítulo `{entregues}/{total} documentos entregues`.
2. **Given** tudo entregue mas com algum não deferido ou Termo não assinado, **then** selo **🔎 Em análise** (âmbar) e subtítulo com `{deferidos}/{total} deferidos`.
3. **Given** todos os docs (exceto Termo) deferidos **e** Termo assinado, **then** selo **✅ Concluída** (verde) na listagem **e** banner verde no topo do detalhe.
4. **Given** pasta sem Termo (ou Termo não assinado), **then** nunca "Concluída".
5. `computePastaStatus` tem testes cobrindo os 3 estados + bordas (sem docs, sem termo, termo não assinado). tsc/lint/vitest limpos. Tema light/dark ok.

## Tasks (@dev)
- [ ] `lib/pastas/status.ts` + `status.test.ts`.
- [ ] `page.tsx`: query com signature_envelopes + cálculo do status.
- [ ] `pastas-manager.tsx`: pill + subtítulo contextual (PastaRow += status/deferidos).
- [ ] `pasta-detail.tsx`: banner de concluída.
- [ ] tsc/eslint/vitest.

## Riscos
- **Baixo.** Só leitura/apresentação; sem migration. Verificar o embed PostgREST `pasta_documentos(...signature_envelopes(status))` (FK pasta_documento_id). Cores em dark mode (seguir convenção [[feedback-theme-convention]]: /dashboard usa light/dark com `dark:`).

## Dev Agent Record (@dev — 2026-07-06)
- **`lib/pastas/status.ts`** (+ 7 testes): `computePastaStatus(docs)` → `{status,total,entregues,deferidos}`. Regra: aguardando (entregues<total) / concluida (não-termo todos deferidos + termo signed/closed) / em_analise (resto).
- **`page.tsx`:** query `pasta_documentos(slug, situacao, signature_envelopes(status))` (embed validado em prod); `signed` = envelope signed/closed; passa status/deferidos por pasta.
- **`pastas-manager.tsx`:** `StatusPill` (3 estados/cores light+dark) ao lado do nome; subtítulo contextual (em análise mostra `{deferidos}/{total} deferidos`).
- **`pasta-detail.tsx`:** banner verde "Pasta concluída" no topo quando concluída (calcula via `computePastaStatus` com `docs`+`signatures`).
- **Checks:** tsc 0 · eslint 0 · vitest 774/774 (+7). Pasta real de prod (dioasdh) já computa "Concluída".
- **Files:** `lib/pastas/status.ts` (+test); `app/dashboard/pastas/page.tsx`; `_components/pastas-manager.tsx`; `[id]/_components/pasta-detail.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (aguardando+contagem) ✓ · AC2 (em análise + deferidos) ✓ · AC3 (concluída na lista + banner no detalhe) ✓ · AC4 (sem Termo/termo não assinado ⇒ nunca concluída) ✓ · AC5 (7 testes p/ bordas; tsc/eslint/774; cores dark:) ✓. Sem migration/regressão; `pastas.status` intocada.

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #131** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 5 ACs, 774/774.
- 2026-07-06 — @dev — Implementado (helper status + pill + banner). Status → InReview.
- 2026-07-06 — @ux-design-expert — Design: selo (pill) ao lado do nome, 3 estados; banner no detalhe.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).
