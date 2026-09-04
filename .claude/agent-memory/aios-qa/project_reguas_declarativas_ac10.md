---
name: reguas-declarativas-ac10
description: Como auditar a régua declarativa AC10 (mapa arquivo→contagem do host nu) sem replicar o scanner — e por que colisão entre PRs deixa main vermelha sem culpa de nenhum PR
metadata:
  type: project
---

`packages/web/src/lib/tenancy/app-url-fallback.test.ts` guarda uma **régua
declarativa**: o mapa `RESIDUAL_DECLARADO` (arquivo → nº de ocorrências do host nu
`crm.trifold.eng.br` em CÓDIGO) comparado com `.toEqual` sobre o mapa **inteiro**
contra a varredura de `packages/web/src`. Os primitivos vivem em
`lib/tenancy/fonte-scan.ts` (`arquivosDeProducao`, `linhasDeCodigo`,
`ocorrenciasNoCodigo`). Mesma família: `trifold-org-literal.test.ts`,
`console-paleta.test.ts`, `platform-query-scan.ts`.

**Why:** essa classe de régua tem uma consequência que ninguém antecipa — ela é
**global à árvore**, então um PR pode deixar `main` vermelha sem que o PR esteja
errado. Medido na Story 900-68: o #565 criou a régua com 6 entradas; o #569
mergeou depois trazendo `lib/tenancy/papel-do-host.ts` com o literal 1× em
código; `main` ficou vermelha e cegou o CI de **todo** PR do repositório. A régua
funcionou como projetada; faltava declarar a entrada. **A saída é sempre
declarar com o motivo, nunca afrouxar a asserção** — o atalho destrutivo é trocar
`.toEqual` por `.has`, tirar a contagem, ou "consertar" `ocorrenciasNoCodigo()`
para não contar o literal (isso perdoaria o arquivo em vez do literal e cegaria a
régua para todos os declarados de uma vez).

**How to apply — auditando uma dessas sem replicar o scanner:**

1. **Não replique `ocorrenciasNoCodigo()` num script para medir a contagem.**
   Mude o valor DECLARADO (ex. `1` → `2`) e leia o lado `+ Received` do diff do
   `.toEqual`: aquilo é o scanner real rodando. Uma réplica pode divergir do
   original justamente no filtro que importa. `grep -c` cru também mente — em
   `papel-do-host.ts` dá 4 (3 em JSDoc), e a régua conta 1.
2. **A mutação que carrega a prova é a "segunda ocorrência em arquivo JÁ
   declarado"** (ex.: `lib/notificacoes.ts`, declarado `1`, ganha um `const` com
   o host → `- 1 / + 2`). Ela prova que o perdão é do **literal declarado**, não
   do **arquivo** — a cegueira nº 3 do cabeçalho. Remover a entrada só reproduz o
   defeito original; injetar em arquivo não declarado só testa o caso fácil.
3. **`arquivosDeProducao()` ignora `.test.ts`/`.tsx` e `__tests__`/`__fixtures__`/
   `__mocks__`.** Então mutar o arquivo de teste nunca suja a varredura. Para
   mutar a árvore, o mais limpo é **criar um `.ts` temporário** em
   `packages/web/src/lib/tenancy/` e `rm` depois — não suja arquivo de produção
   existente e mimetiza o defeito real (arquivo novo chegando de outro PR).
4. **Restauração se prova**, não se afirma: `shasum -c` do baseline +
   `git status --short -- packages/` vazio + `git diff --stat HEAD -- packages/`
   vazio.

**Falsos vermelhos deste repo ao forçar cache (custaram tempo ao @dev):**
`pnpm test --force` → **exit 1** com `CACError: Unknown option --force` (o `test`
da raiz é `vitest run` direto, sem turbo); `pnpm type-check -- --force` → **exit
1** com `TS5093` (o flag chega no `tsc`). O caminho que funciona é a variável de
ambiente **`TURBO_FORCE=true`**, e a prova é `Cached: 0 cached, 8 total` no
sumário. Nenhum dos dois exit 1 é reprovação de código.

Ver também [[reverificacao-focada]] e [[mutacao-prova-teste-real]].
