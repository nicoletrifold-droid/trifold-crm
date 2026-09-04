---
name: ac10-residual-declarado
description: Epic 900 — a régua AC10 (RESIDUAL_DECLARADO em app-url-fallback.test.ts) fica vermelha a cada arquivo novo com o host nu; como validar a story de conserto
metadata:
  type: project
---

A Story 900-66 (#565) criou em `packages/web/src/lib/tenancy/app-url-fallback.test.ts` uma régua
de **alcance**: o mapa `RESIDUAL_DECLARADO` (arquivo → contagem de `crm.trifold.eng.br` em código)
comparado com `.toEqual` contra a varredura de `packages/web/src`. Todo PR que introduza um arquivo
novo contendo o host nu **deixa `main` vermelha** — e como o check é bloqueante, cega o sinal de CI
de todo PR aberto do repositório. Aconteceu na 900-65 (#569) e vai acontecer de novo.

**Why:** a régua é `.toEqual` sobre o mapa inteiro de propósito. O cabeçalho do teste documenta
três cegueiras que ela evita (comentário, aspas/quebra de linha, e "o nome do arquivo perdoando o
sítio que mora nele" — daí a CONTAGEM ao lado de cada nome). `.has`, lista de nomes, ou remover a
contagem devolvem a régua ao estado que já deixou 4 de 29 sítios passarem.

**How to apply:** ao validar a story de conserto —
- O conserto certo é **declarar** o arquivo no mapa. Migrar o arquivo para o resolver
  `tentarAppUrl` só é certo se o literal for de fato um sítio de *fallback de ausência de dado*.
  Em `lib/tenancy/papel-do-host.ts` era o oposto (denylist de segurança `HOSTS_DE_TENANT`,
  estática, import-time) — declarar foi o correto.
- **Meça a contagem, não confie em `grep -n`.** `grep` conta linha crua; a régua usa
  `ocorrenciasNoCodigo()` de `fonte-scan.ts`, que descarta comentário de linha, de bloco e a
  continuação do bloco. Na 900-68 o draft dizia "3 no cru, 2 em comentário"; o real era 4 e 3.
  Receita que funciona: `git archive origin/main packages/web/src` para um scratch e rodar um
  script que replica `arquivosDeProducao`+`linhasDeCodigo`+`ocorrenciasNoCodigo`. Sai o mapa
  inteiro — prova que a entrada nova é **suficiente** (nenhum outro arquivo derivou), não só
  necessária.
- **Meça também o `it` irmão** (régua de PRESENÇA, `{arquivosComChamada, chamadas}`) e exija na AC
  que o @dev não toque nesses dois números. Ajustar número para o teste ficar verde é o modo de
  falha natural sob pressão de `main` vermelha.
- O JSDoc acima do mapa conta as entradas em prosa ("Cinco… O sexto…"). Story que adiciona entrada
  tem que atualizar essa prosa, senão o cabeçalho passa a mentir — e o valor da régua vem dele.

Ver também [[validar-o-conserto-no-mundo-pos-fix]], [[mitigacao-delegada-a-ferramenta]].
