# Story 75-130 — Pastas: corrigir "Baixar", adicionar Visualizar (preview) e renomear status "Enviado"

## Metadata
- **Status:** InReview · **Epic:** Pastas · **Branch:** feat/75-130-pastas-download-preview · **Complexidade:** S (3 pontos)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
No detalhe da pasta (`/dashboard/pastas/[id]`) o diretor apontou 3 problemas ao conferir os documentos e o Termo de Intenção (ver [[project-pastas-documentos]] e [[project-termo-autopreenchido]]):

1. **"Baixar" não faz nada.** `download()` faz `await fetch(signed-url)` e depois `window.open(url, "_blank")` — como o `window.open` roda **fora do gesto do usuário** (após o await), o Chrome bloqueia como popup, silenciosamente. Pior: se a API retornar erro (403/404/500), o código engole sem avisar (`if (res.ok && data?.url) ...`).
2. **Falta preview.** Hoje o único botão ("Baixar") na verdade **abre em nova aba** (comportamento de *visualizar*, não de baixar). O diretor quer um **olhinho de Visualizar** (preview inline) **além** de um Baixar que realmente salve no computador — pra conferir tanto os arquivos quanto o Termo.
3. **Status "Enviado" confunde.** O Termo (e qualquer doc anexado) aparece com status **"Enviado"**, que dá a entender "enviado para assinatura". Na verdade é o status `entregue` = documento anexado, aguardando o gestor **Deferir/Recusar**. A assinatura é uma coluna separada ("Aguardando assinatura"/"Assinado").

## Decisão (diretor, 2026-07-06)
1. Separar **👁 Visualizar** (abre inline em nova aba) de **⬇ Baixar** (força download pro disco).
2. Corrigir o disparo pra não depender de `window.open` pós-await (usar clique em `<a>`) e **mostrar erro** quando falhar.
3. Renomear o rótulo do status `entregue`: **"Enviado" → "Recebido"** (só o texto de exibição; o valor no banco continua `entregue`).

## Escopo
**IN:**
1. **API `GET .../documentos/[docId]/signed-url`:** aceitar query `?download=1` → gerar signed URL com `{ download: filename }` (Content-Disposition attachment). Sem o param, mantém URL inline (preview).
2. **UI `pasta-detail.tsx`:**
   - `download()`: buscar signed-url com `?download=1`; disparar via `<a href download>` (clique programático), não `window.open`; surfacing de erro (estado + mensagem visível).
   - Novo `preview()`: buscar signed-url sem param; abrir em nova aba (mesma robustez / tratamento de erro).
   - Adicionar botão **👁 Visualizar** (ícone `Eye`) ao lado de **⬇ Baixar** para cada doc anexado.
3. **Rótulo:** `SITUACAO_LABEL.entregue` de `"Enviado"` → `"Recebido"` (`pasta-detail.tsx:46`).

**OUT:**
- Preview do **documento assinado** (Clicksign) — segue como está (`downloadSigned`), fora de escopo.
- Preview embutido/modal na própria página (visualizar = nova aba já resolve).
- Mudar o valor `entregue` no banco ou os textos "entregues"/"documentos entregues" da listagem e da tela pública (só o rótulo de status do gestor muda).

## Acceptance Criteria
1. **Given** um documento anexado, **then** aparecem dois botões: **👁 Visualizar** e **⬇ Baixar**.
2. **Given** que clico em **Baixar**, **then** o arquivo é salvo no computador (Content-Disposition attachment), sem ser bloqueado como popup.
3. **Given** que clico em **Visualizar**, **then** o PDF/imagem abre inline em nova aba.
4. **Given** que a geração da URL falha (ex.: 403/404/500), **then** uma mensagem de erro é exibida (não fica "nada acontece").
5. **Given** o Termo de Intenção recém-gerado (status `entregue`), **then** o status exibido é **"Recebido"** (não "Enviado"); Deferir/Recusar seguem funcionando e a coluna de assinatura é independente.
6. tsc/lint/testes limpos; sem regressão no upload, deferir/recusar, enviar p/ assinatura e baixar assinado.

## Tasks (@dev)
- [ ] API signed-url: suportar `?download=1` (passar `{ download: filename }` no `createSignedUrl`), preservando comportamento inline por padrão.
- [ ] UI: refatorar `download()` (âncora + `?download=1` + erro visível); criar `preview()` (nova aba + erro visível).
- [ ] UI: adicionar botão **Visualizar** (ícone `Eye`) por doc; manter **Baixar**.
- [ ] UI: rótulo `entregue` → "Recebido".
- [ ] tsc/eslint/vitest.

## Riscos
- **Baixo.** Mudança localizada no detalhe da pasta + 1 param opcional na API. Preservar o caminho do "Baixar assinado" (`downloadSigned`), que usa outra rota.
- Popup blocker: garantir que o clique em `<a>` (não `window.open`) seja robusto no Chrome; para Visualizar em nova aba, usar `<a target="_blank" rel="noopener">` clicado programaticamente.
- Verificar assinatura de `createSignedUrl(path, expiresIn, { download })` na versão do supabase-js do projeto.

## Dev Agent Record (@dev — 2026-07-06)
- **API `signed-url`:** `req` (era `_req`); select += `filename`; `?download=1` → `createSignedUrl(path, 3600, { download: filename ?? true })` (Content-Disposition attachment). Sem o param, URL inline (preview). Confirmado no bundle do supabase-js 2.49 que o option `download` gera `&download=...`.
- **UI `pasta-detail.tsx`:**
  - Removido `download()` com `window.open` pós-await (bloqueado como popup, silencioso). Novo `openFile(doc, download)`: fetch (`?download=1` quando baixar) + **clique em `<a>`** (`download` attr / `target=_blank`+`rel=noopener` no preview) + **surfacing de erro** (`fileError` state → banner vermelho dismissível).
  - Botão **👁 Visualizar** (ícone `Eye`, `openFile(doc,false)`) ao lado de **⬇ Baixar** (`openFile(doc,true)`), por doc anexado.
  - Rótulo `SITUACAO_LABEL.entregue`: "Enviado" → **"Recebido"** (valor `entregue` no banco inalterado).
- **Fora de escopo, preservado:** `downloadSigned` (documento assinado Clicksign), textos "entregues"/"documentos entregues" da listagem e da tela pública.
- **Checks:** tsc 0 · eslint 0 · vitest 757/757.
- **Files:** `app/api/pastas/[id]/documentos/[docId]/signed-url/route.ts`; `app/dashboard/pastas/[id]/_components/pasta-detail.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (👁 Visualizar + ⬇ Baixar por doc) ✓ · AC2 (Baixar força save via Content-Disposition, sem bloqueio de popup — não usa mais `window.open`) ✓ · AC3 (Visualizar abre inline em nova aba) ✓ · AC4 (banner vermelho dismissível em 403/404/500/conexão — não fica "nada acontece") ✓ · AC5 (Termo `entregue` exibe "Recebido"; Deferir/Recusar e coluna de assinatura independentes seguem OK) ✓ · AC6 (tsc 0 · eslint 0 · vitest 757/757) ✓.
- **Sem regressão:** `downloadSigned` (assinado Clicksign) usa outra rota, intacto; textos "entregues"/"documentos entregues" da listagem e tela pública preservados; segurança da rota mantida (`requireAuth` + `isPastaManager` + escopo org/pasta).
- **Observação (não bloqueia):** preview via clique em `<a target="_blank" rel="noopener">` (padrão robusto p/ Chrome).

## Change Log
- 2026-07-06 — @qa — **QA GATE: PASS**. 6 ACs, 757/757, sem regressão.
- 2026-07-06 — @dev — Implementado (download via âncora + preview + erro visível + rótulo "Recebido"). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).
