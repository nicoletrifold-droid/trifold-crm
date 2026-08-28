---
name: 87-18-tri-estado-slot
description: isSlotFree virou tri-estado ("free"|"occupied"|"unknown") e nem tsc nem eslint protegem a forma booleana neste repo — a rede são dois testes nomeados
metadata:
  type: project
---

**Story 87-18** (implementada 2026-08-27, na MESMA branch/PR `#517` da `87-17` Fatia 1, commits em
cima de `cdf4411e`). `isSlotFree` (`packages/ai/src/flows/visit-slot.ts`) devolve
`SlotCheck = "free" | "occupied" | "unknown"`; `checkSlotAvailability` devolve `erroNoPedido` e
`freeSlotsInPeriod` devolve `{ slots, houveIncerteza }`, as duas com `emit?` no ÚLTIMO parâmetro.

🔴 **Este repo não tem `strict-boolean-expressions`.** `if (await isSlotFree(...))` e
`filter((_, i) => resultados[i])` compilam com `tsc --noEmit` em **EXIT=0 e zero linhas** — medido
duas vezes, com contraprova. E as três strings são truthy, então a forma booleana esquecida faz
**todo horário `"occupied"` ser ofertado e gravado como livre**: pior que o defeito original.

**Why:** a proteção que "o TypeScript obriga a comparação explícita" é falsa para union de strings
sem constituinte falsy, e o predicado de `Array.prototype.filter` é tipado `=> unknown`.

**How to apply:** ao tocar qualquer coisa que consome `SlotCheck` (a Fatia 2 da `87-17` vai tocar),
compare SEMPRE com a string literal e não confie no compilador. A rede real são dois testes
pré-existentes de `visit-slot.test.ts` — *"compromisso HOUSE no mesmo horário bloqueia"* e *"manhã de
sábado com 10h ocupado"*; se um refactor for reescrevê-los, pare. Outras duas invariantes travadas
por AC: (1) nos sítios de período de `pipeline.ts`, `slots.length` é testado **antes** de
`houveIncerteza` (inverter descarta uma oferta boa por 1 candidato incerto entre 11); (2)
`checkSlotAvailability` curto-circuita no primário `"unknown"` — sem isso são 26 consultas
sequenciais num outage. Fronteiras vizinhas de propósito NÃO consertadas: rejeição de rede (`REL-1`,
`docs/backlog.md`) e os helpers de `packages/web` (**Story 87-19**, P1, remédio OPOSTO — falhar
fechado e recusar a gravação). Ver [[epic87-oferta-de-horario]].
