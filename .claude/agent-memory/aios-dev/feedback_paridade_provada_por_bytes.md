---
name: paridade-provada-por-bytes
description: Afirmar "visualmente idêntico" / "no-op para o caso comum" exige sonda temporária + sha256 antes e depois, não leitura do diff
metadata:
  type: feedback
---

Quando uma AC diz "o comportamento para o caso comum não muda" (paridade funcional, no-op,
refatoração sem efeito visível), a prova é **byte a byte**, não leitura do diff.

Receita medida na Story 75-373 (`buildPrintHtml`, 9 escapes de HTML aplicados):

1. Faça primeiro **só a mudança inerte** que dá acesso à função (ex.: acrescentar `export`).
2. Crie uma sonda temporária `__algo-probe.test.ts` ao lado do fonte, que chama a função com um
   conjunto de dados do caso comum e grava a saída num arquivo **fora do repo**
   (`process.env.PROBE_OUT`, scratchpad). O sufixo `.test.ts` a mantém fora de
   `arquivosDeProducao`, então ela não polui régua de varredura nenhuma.
3. Rode → baseline. Aplique a mudança de verdade. Rode → pós. `diff` + `shasum -a 256` nos dois.
4. **Apague a sonda** e registre os hashes + o exit 0 do `diff` no Completion Notes.

**Why:** "conferi o diff e não muda nada" é opinião; `sha256` igual é medição. Na 75-373 isso
transformou a AC7 (a mais fácil de fechar com hand-waving) na evidência mais forte da story —
mesmo hash `968bf963…`, 3286 bytes, `diff` exit 0 — e custou dois minutos.

**How to apply:**
- Só serve se a saída for determinística no intervalo entre as duas rodadas. `new Date()` dentro da
  função é aceitável no mesmo dia, mas confira se o formato tem hora antes de confiar.
- O teste que **fica** no repo cobre a propriedade por asserção (`toContain` do valor cru na
  célula); a igualdade de bytes é medição de sessão, vai no Completion Notes. Não commite a sonda.
- Complementa, não substitui, a mutação de controle: paridade prova que não quebrou; mutação prova
  que o teste novo é capaz de reprovar. Ver [[carrasco-declarado-e-afirmacao]] e
  [[validacao-exit-code]].
