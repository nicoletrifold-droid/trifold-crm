---
name: relatorio-impresso-brindes
description: print-modal.tsx de brindes é o ÚNICO arquivo da app com document.write — XSS same-origin real, não cosmético; e como medir a folha A4 de verdade (largura útil 673,5px)
metadata:
  type: project
---

`packages/web/src/app/dashboard/brindes/_components/print-modal.tsx` é o **único arquivo de toda a
`packages/web/src`** com `document.write` / `window.open("", "_blank")` (grep conferido no gate da
75-372). `buildPrintHtml` interpola cru 6 campos de texto: `obra_nome`, `nome`, `cargo`,
`observacao`, endereço e (desde a 75-372) `brindes_tipos.nome/tamanho`.

**Why:** a dívida é frequentemente descrita como "não escapa HTML", o que soa cosmético. Não é.
Um `about:blank` aberto por script **herda a origem do opener**, então `<script>` injetado executa
na origem da aplicação — e não existe `httpOnly` em nenhum ponto de `packages/web/src` (default do
Supabase SSR), logo `sb-*-auth-token` é legível por JS ⇒ roubo da sessão de quem imprime. Vetor
exige usuário autenticado da mesma org com escrita em brindes (`brindes_tipos_write` =
`org_id = user_org_id() AND (is_admin_or_supervisor() OR has_module_access('brindes'))`),
então é MEDIUM e escalada lateral, não vetor anônimo. `escapeHtml` **não existe** no repo.

**How to apply:** se alguém propor "escapar só o campo novo", recuse — não fecha o vetor. O
conserto é um helper de ~4 linhas + os 6 call sites, tudo dentro deste arquivo. Aceitável como
dívida num gate de escopo mínimo, mas exigindo redação honesta do impacto e story própria.

## Medir a folha A4 de verdade (AC de layout de impressão)

O CSS de impressão é `@page { margin: 10mm 8mm }` + `body { padding: 10mm 8mm }` ⇒ largura útil
= 210 − 16 − 16 = **178mm ≈ 673,5px**. Medir num viewport de 794px (A4 cheio) dá ~60px de folga
que não existe na folha e **mascara corte de coluna**. Para o teste estrito, viewport = **734px**
(194mm, já descontada a margem do `@page`); o `body` desconta o resto e `table` sai 673,5px.

Como medir o `buildPrintHtml` **real** (não uma cópia): backup do arquivo, `perl -pi -e` para
prefixar `export function buildPrintHtml(`, teste vitest que só faz `writeFileSync` do HTML,
restaurar o arquivo, conferir `git status --short -- packages/` vazio. Depois medir em Chromium
(`node_modules/@playwright/test`, browsers já instalados) com `emulateMedia({ media: 'print' })`:
`cellsOutsideSheet` (right > body.right), `cellsClipped` (`scrollWidth > clientWidth`), ordem dos
`<th>` e larguras por classe. Rodar o script como `.cjs` requerendo o playwright por caminho
absoluto — `import 'playwright'` não resolve de fora do repo.

Relacionado: [[supabase-auth-cookie-not-httponly]], [[ponte-do-client-nao-provada]].
