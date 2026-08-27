---
name: epic87-fila-parada
description: A fila de deploy da Onda 1 do Epic 87 está parada em PR aberto — é o argumento recorrente para furar fronteiras de story
metadata:
  type: project
---

Em 2026-08-27 a fila homologada da Onda 1 do Epic 87 estava **parada**: `#428` (87-11, remove o
despejo cru de `collected_data` do prompt) estava **liberado para merge desde 18/08** — o
bloqueador dele, `#427` (87-5 deploy B), já estava em `main` — e continuava aberto **9 dias** depois.
Atrás dele: `#429` (87-12 bloco A), `#431` (87-16) e a 87-10, que nem foi implementada.

**Why:** essa fila parada é o argumento mais forte que aparece a favor de furar a fronteira de outra
story ("o defeito é medido e não tem previsão"). Na 87-17 deu para resolver sem furar; não vai dar
sempre.

**How to apply:** (a) antes de aceitar "a story X não existe / não tem previsão", conferir
`gh pr list` — no Epic 87 as stories 87-11 e 87-12 **existem** como PR implementado e revisado, com
story versionada na branch, e não em `main`; um `ls docs/stories/` diz o contrário e engana.
(b) Quando a fila parada entra como justificativa de escopo, escalar a fila ao @pm como item
próprio, em vez de deixá-la pagar a conta dentro da story. Ver [[epic87-campos-reservados]].
