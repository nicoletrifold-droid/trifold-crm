# Story 75-131 — Pastas: corrigir download do documento assinado + preview (mesmo fix da 75-130)

## Metadata
- **Status:** Done · **Epic:** Pastas · **Branch:** feat/75-131-pastas-download-assinado · **PR:** #128 (base: PR #127) · **Complexidade:** XS (2 pontos)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Follow-up direto da [[project-termo-autopreenchido]] / Story 75-130. Naquela story corrigimos o "Baixar"/"Visualizar" dos documentos da pasta, mas deixamos **de fora** o botão verde **"Assinado"** — que baixa o **PDF já assinado** pela Clicksign (aparece só depois que o envelope é assinado). Esse botão (`downloadSigned`, `pasta-detail.tsx`) tem **exatamente o mesmo bug**: `window.open(url)` depois do `await fetch(...)` → o Chrome bloqueia como popup, silenciosamente; e erro da API é engolido. Como ainda não há documento assinado em prod, o problema não apareceu — mas apareceria na 1ª assinatura real. Ver [[project-clicksign-integracao]].

## Escopo
**IN:**
1. **API `GET .../assinatura/[envId]/signed-url`:** aceitar `?download=1` → `createSignedUrl(..., { download: <nome amigável> })` (Content-Disposition attachment). Nome derivado do documento vinculado (`pasta_documentos.label`) → `"<label> - assinado.pdf"`, com fallback `"Documento assinado.pdf"`. Sem o param, mantém inline (preview).
2. **UI `pasta-detail.tsx`:** substituir `downloadSigned(sig)` por `openSigned(sig, doc, download)` no mesmo padrão de `openFile` (clique em `<a>`, sem `window.open`; erro no banner `fileError`). Botão **👁** (Visualizar assinado, inline) + **⬇ Assinado** (baixa).

**OUT:** mudar o fluxo de assinatura/webhook; preview embutido em modal.

## Acceptance Criteria
1. **Given** um documento com assinatura concluída (`hasSigned`), **then** há **👁 Visualizar** (abre o PDF assinado inline em nova aba) e **⬇ Assinado** (baixa pro disco).
2. **Given** que clico em Baixar do assinado, **then** o arquivo é salvo (Content-Disposition attachment), sem bloqueio de popup, com nome amigável (`<label> - assinado.pdf`).
3. **Given** que a URL falha (ex.: PDF ainda não disponível / 404 / 500), **then** o banner de erro aparece (não fica "nada acontece").
4. tsc/lint/testes limpos; sem regressão nos demais botões (Visualizar/Baixar comuns, Deferir/Recusar, Enviar p/ assinatura).

## Tasks (@dev)
- [ ] API: `?download=1` + nome via join `pasta_documentos.label`; `_req`→`req`.
- [ ] UI: `openSigned(sig, doc, download)` (âncora + erro); botões 👁 + ⬇ Assinado.
- [ ] tsc/eslint/vitest.

## Riscos
- **Muito baixo.** Espelha o fix já validado na 75-130. Join to-one pode vir como objeto ou array no supabase-js → normalizar antes de ler `label`.

## Dev Agent Record (@dev — 2026-07-06)
- **API `assinatura/[envId]/signed-url`:** `_req`→`req`; select += `pasta_documentos(label)` (normalizado obj/array); `?download=1` → `createSignedUrl(..., { download: "<label> - assinado.pdf" | "Documento assinado.pdf" })`.
- **UI `pasta-detail.tsx`:** `downloadSigned` → `openSigned(sig, download)` (âncora + `fileError`, sem `window.open`). Botões **👁 Ver** + **⬇ Assinado** quando `hasSigned`. Nome do download vem do Content-Disposition do servidor (`a.download=""`, já que cross-origin ignora o attr).
- **Checks:** tsc 0 · eslint 0 · vitest 757/757.
- **Files:** `app/api/pastas/[id]/assinatura/[envId]/signed-url/route.ts`; `app/dashboard/pastas/[id]/_components/pasta-detail.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (👁 Ver + ⬇ Assinado quando assinado) ✓ · AC2 (baixa via Content-Disposition, nome amigável, sem popup) ✓ · AC3 (erro no banner quando URL falha/404) ✓ · AC4 (tsc/eslint/757 limpos, sem regressão) ✓. Espelha o fix validado na 75-130; autorização da rota (`requireAuth`+`isPastaManager`+escopo pasta) intacta.

## Change Log
- 2026-07-06 — @devops — Branch off feat/75-130 + commit `2110a7d` + push + **PR #128** (base = PR #127, pra isolar o diff). Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS**. 4 ACs, 757/757.
- 2026-07-06 — @dev — Implementado (download/preview do assinado). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).
