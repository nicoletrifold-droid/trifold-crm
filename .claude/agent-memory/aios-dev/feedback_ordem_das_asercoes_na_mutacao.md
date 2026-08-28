---
name: ordem-das-asercoes-na-mutacao
description: Numa AC provada por mutação, a asserção que a AC existe para fazer vai PRIMEIRO — senão o vermelho aponta para outra linha e a prova não vale
metadata:
  type: feedback
---

Quando uma AC é fechada com **mutação** (remover o conserto e exigir vermelho), a ordem das
asserções dentro do `it` deixa de ser estilo: a **primeira** asserção que quebra é a única que
aparece no vermelho colado no PR. Coloque na frente a asserção que É a AC.

**Why:** medido na Story 87-18 (`AC2-ii`, curto-circuito de latência). O teste era
`expect(erroNoPedido).toBe(true)` → `expect(alternatives).toEqual([])` → `expect(total()).toBe(1)`.
Ao remover o curto-circuito o vermelho saiu como `expected false to be true` no `erroNoPedido` —
verdadeiro, mas prova a coisa errada: a AC é sobre **contagem de consultas** (26 sequenciais contra
um banco que acabou de falhar), não sobre a flag. Reordenado, o vermelho virou
`expected 26 to be 1` — que é a afirmação da AC, legível por quem revisa sem abrir o código.

**How to apply:** ao escrever um teste que vai ser o para-quedas de uma mutação, pergunte "se isso
ficar vermelho, a linha que o revisor vai ler é a minha tese?". Se não, reordene e escreva um
comentário de uma linha dizendo por que aquela asserção vem primeiro. Vale também no sentido
inverso: uma mutação que quebra 20 testes prova menos que uma que quebra o teste nomeado na AC —
cole o `FAIL` do teste **nomeado**, não só o total. Relacionado: [[validacao-exit-code]],
[[vitest-filtro-t-regex]].
