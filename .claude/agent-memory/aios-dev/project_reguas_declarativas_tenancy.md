---
name: reguas-declarativas-tenancy
description: Réguas de mapa-declarado em packages/web/src/lib/tenancy — arquivo novo com o host nu deixa main vermelha; declarar com motivo, nunca afrouxar
metadata:
  type: project
---

`packages/web/src/lib/tenancy/` tem réguas que varrem **toda** a árvore `packages/web/src` e
comparam o achado com um mapa declarado por `.toEqual`, arquivo → contagem. A da Story 900-66 é
`app-url-fallback.test.ts` (`RESIDUAL_DECLARADO`, host nu `crm.trifold.eng.br`); os primitivos de
varredura são `arquivosDeProducao` / `linhasDeCodigo` / `ocorrenciasNoCodigo` de `fonte-scan.ts`.
Irmãs no mesmo diretório: `platform-query-scan.ts`, `console-paleta.test.ts`.

**Why:** o mapa é a régua de **alcance** — existe para ficar vermelha quando um PR posterior traz um
arquivo novo com o literal. Já aconteceu: #569 entrou depois de #565 e deixou `origin/main` vermelha
por 1 teste de 4605, cegando o CI de todo PR do repo (Story 900-68). O vermelho não é bug da régua,
é o serviço dela.

**How to apply:**
- Escrever um arquivo em `packages/web/src` que contenha `crm.trifold.eng.br` **em código** (não em
  comentário — o filtro descarta JSDoc) quebra `pnpm test`, mesmo sem tocar em nada de tenancy.
  Antes de dar a story por pronta, rode `pnpm test` inteiro, não só o teste da sua feature.
- A saída é **declarar** a entrada com uma frase dizendo por que aquele arquivo pode conter o
  literal, e atualizar a prosa do JSDoc (que conta quantos são). Nunca `.has()`, nunca remover a
  contagem ao lado do nome, nunca perdoar o arquivo, nunca mexer em `fonte-scan.ts` para "não contar"
  — isso cegaria a régua para todas as outras entradas de uma vez.
- Há um `it` irmão de **PRESENÇA** no mesmo arquivo (`{arquivosComChamada, chamadas}` de
  `tentarAppUrl(`). Se ele começar a divergir, o defeito é um sítio desmigrado, não o número: parar
  e reportar em vez de ajustar a contagem.
- Mutação que prova essas réguas vivas: injetar o literal num arquivo **já declarado** (não só num
  novo) — é a única que prova que o perdão é do literal, não do nome do arquivo.
  Ver [[carrasco-declarado-e-afirmacao]].
