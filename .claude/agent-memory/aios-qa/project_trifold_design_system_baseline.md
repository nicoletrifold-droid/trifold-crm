---
name: trifold-design-system-baseline
description: Em landing-pages/trifold-design-system/ os .dc.html sao untracked de proposito — o baseline de QA e a producao via HTTP, nao o git
metadata:
  type: project
---

Em `landing-pages/trifold-design-system/` (site institucional trifold.eng.br) **apenas
`README.md` e `vercel.json` sao versionados**. As paginas `*.dc.html`, `support.js` e os
assets sao untracked **de proposito** — `git diff` / `git status` NAO produzem baseline
para elas.

**Why:** sao export do Claude Design Canvas (~100+ MB), o site e publicado por upload
manual (`vercel deploy --prod`, nao por git push), e versiona-las gerou conflito o
suficiente para fechar o PR #471. O `vercel.json` fica versionado como snapshot de
referencia porque a receita do proxy do Vind e sutil.

**How to apply:** ao dar gate em mudanca nesse diretorio, o baseline autoritativo e a
**producao servida por HTTP**:

```bash
curl -s -o prod-Home.dc.html https://trifold.eng.br/Home.dc.html
diff -u prod-Home.dc.html <local>/Home.dc.html
```

Isso da o diff real (o que o dev mudou vs o que esta no ar) e, aplicado a TODAS as demais
paginas, prova "nenhum outro arquivo tocado" melhor que `git status` — que aqui e cego.
Confirmar com mtime: so os arquivos editados no dia devem ter data recente.

Consequencia de processo: **aprovar o gate nao publica nada.** O deploy exige a pasta local
completa + `vercel deploy --prod --yes --scope trifold-s-projects`. Sempre separar no
veredito "codigo correto" de "esta no ar".

Gotchas de verificacao nesse alvo:
- Contar `{{` vs `}}` no arquivo inteiro da **falso positivo**: o CSS
  `@keyframes marq{...}}` fecha com `}}`. Comparar a contagem contra a producao em vez de
  exigir igualdade absoluta.
- Os `.dc.html` nao rodam lint/typecheck (sem package.json, fora do workspace pnpm). Para
  ter sinal real: extrair o bloco `<script type="text/x-dc">`, `node --check` para sintaxe,
  e instanciar a classe com `DCLogic` stubado para executar `renderVals()` e assertar os
  dados que alimentam o template. Ver [[mutacao-prova-teste-real]].

Ver tambem [[reverificacao-focada]].
