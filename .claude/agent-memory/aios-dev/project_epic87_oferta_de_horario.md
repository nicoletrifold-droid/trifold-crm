---
name: epic87-oferta-de-horario
description: Story 87-17 é fatiada em 2 PRs — Fatia 1 (oferta espalhada) implementada; Fatia 2 ("mais tarde") espera a 1 em produção e não pode tocar os campos reservados da 87-10
metadata:
  type: project
---

A **Story 87-17** (Epic 87, Nicole) foi autorizada pelo @po a sair em **duas fatias, dois PRs,
na ordem A → B**, e está **fora** da fila de deploy do Epic 87 (`#428 → #429 → #431 → 87-10`).

- **Fatia 1 (Defeito A, `T0`-`T3`) — implementada em 2026-08-27** (commit local
  `fix(nicole): oferta de horário cobre o período inteiro…`). `freeSlotsInPeriod` em
  `packages/ai/src/flows/visit-slot.ts` deixou de parar nos 3 primeiros livres e passou a
  amostrar com `espalhar()`. Muda o que a Nicole oferece nos **dois** chamadores de
  `pipeline.ts` sem uma linha de diff em `pipeline.ts`.
- **Fatia 2 (Defeito B, `T4`-`T8`) — não começou.** Depende da Fatia 1 **em produção**, porque
  a `AC5` só é verdade depois que `espalhar` garante que a oferta chega ao fim do período.

**Why:** a Fatia 1 sozinha já dissolve a pergunta que gerou o incidente (a lead perguntou
"mais tarde não tem?" porque a oferta parava nas 13h). Fatiar impediu que a correção medida
ficasse atrás de uma fila de deploy parada há 9 dias.

**How to apply:** ao pegar a Fatia 2, dois limites são arbitragem do @po e não negociação de
implementação: (1) a resposta ao "mais tarde" sai de um **recálculo no próprio turno**
(`agenda_state.periodo` + `day` herdado), nunca da memória da oferta; (2) `ofertas_do_sistema`
e `afirmado_pela_nicole` (em `flows/agenda-state.ts`) **não são escritos nem lidos** — são da
Story 87-10, que os **remove** de `AgendaState` para a chave irmã `agenda_registro`, e a
`AC1-(ii)` dela tem uma trava de `tsc` calibrada que um escritor novo faria disparar à toa.
E nunca apresentar um horário mais **cedo** sob o rótulo "mais tarde": depois da Fatia 1 a
oferta já vai até o fim do período, então o que sobra no meio é anterior.
