---
name: vitest-filtro-t-regex
description: O filtro `-t` do vitest é REGEX, não substring — nome de teste com `+` casa zero testes e dá falso verde com exit 0
metadata:
  type: feedback
---

Ao rodar um teste específico com `npx vitest run <arquivo> -t '<nome>'`, **escape os
metacaracteres de regex no nome**. `-t 'turno-ouro: dia+período'` casa **zero** testes
(o `+` é quantificador: pede `di` + `a`s + `período`), e a saída é
`Tests  33 skipped (33)` com **exit code 0**. O correto é `-t 'turno-ouro: dia\+período'`.

**Why:** é um falso verde perfeito — nada falha, o exit code é 0, e só se percebe olhando
o campo `passed`. Custou uma rodada inteira de baseline na Fatia 1 da Story 87-17 (a captura
"antes de editar" dos goldens veio vazia e parecia verde). É a mesma família do falso verde
de `grep -c` e do `timeout` que não existe no macOS, já registrada no repo — contar linhas
ou confiar em exit code não substitui conferir **o que rodou**.

**How to apply:** sempre que capturar baseline ou provar vermelho com `-t`, confira que
`Tests  N passed` tem `N >= 1`. Se aparecer `0 passed | M skipped`, o filtro não casou —
não é teste verde, é teste que não existiu. Vale para qualquer nome com `+ ( ) [ ] . * ? |`.
Ver [[prova-vale-no-deploy]] para o mesmo princípio no lado do deploy.
