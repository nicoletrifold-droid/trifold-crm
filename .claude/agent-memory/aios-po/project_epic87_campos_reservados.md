---
name: epic87-campos-reservados
description: Epic 87 — a cerca em volta de ofertas_do_sistema/afirmado_pela_nicole (87-10) e por que nenhuma story vizinha pode escrever ou ler os dois campos
metadata:
  type: project
---

`ofertas_do_sistema` e `afirmado_pela_nicole` (hoje declarados dentro de `AgendaState`,
`packages/ai/src/flows/agenda-state.ts`) são **cercados**: nada escreve e nada lê, e isso é uma
garantia, não um acidente. Dona: **Story 87-10** (`W1-2c`, `Ready`, não implementada).

**Why:** a ratificação do @po de 10/08 (`docs/qa/po-validation-87-10-87-11.md`) se apoia em três
coisas que qualquer vizinha quebra sem perceber:
1. a **leitura** dos campos é `W3-2e`, **Onda 3** — caminho de decisão novo (`epic-87:750`); o
   cabeçalho da 87-10 diz *"não restaurar a leitura para cá"*;
2. a garantia é **categórica** — *"se nada lê, nada pode ler, nem para escolher o nível de um log"*
   — e foi ela que cortou a `AC8` da 87-10;
3. a `AC1` da 87-10 **REMOVE** os dois campos de `AgendaState` para a chave irmã `agenda_registro`,
   e a `AC1-(ii)` tem uma trava calibrada (`tsc` deve dar **exatamente 2** erros em
   `agenda-state.test.ts:48-49`; *"se aparecer um terceiro, PARE"*). Escrever nos campos faz a trava
   acusar um consumidor **mapeado** — pior estado possível para uma trava.

**How to apply:** qualquer story do Epic 87 que "só precise saber o que foi oferecido" → primeiro
verificar se dá para **recalcular**. `freeSlotsInPeriod` é determinística sobre
(dia, período, `now`, `appointments`), e `agenda_state.periodo` já está persistido (sítios
`pipeline.ts:1042` e `:1120`) sem leitor. Foi assim que a 87-17 fechou o defeito sem tocar a cerca
(ver `docs/qa/po-validation-87-17.md` §1). Contexto vizinho: [[epic87-fila-parada]].
