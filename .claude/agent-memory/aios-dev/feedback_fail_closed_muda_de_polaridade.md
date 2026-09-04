---
name: fail-closed-muda-de-polaridade
description: O `""` de trechoDelimitado reprova um toContain mas APROVA um toEqual([]) — régua de varredura por lista precisa de sinal de vida, senão o recorte errado aprova tudo
metadata:
  type: feedback
---

`trechoDelimitado`/`callSiteDe` de `packages/web/src/lib/tenancy/fonte-scan.ts` são fail-closed
devolvendo `""`. **Isso só é seguro para a forma de asserção original deles.** A polaridade
inverte com o formato da régua:

| Forma da asserção | O que `""` faz |
|---|---|
| `expect(recorte).toContain("x")` | **reprova** — fail-closed de verdade |
| `expect(naoCobertas).toEqual([])` sobre o que foi EXTRAÍDO do recorte | **aprova tudo** — `""` tem zero itens, e zero item não-coberto é uma lista vazia |

**Why:** medido na Story 75-373. Sabotei as duas pontas do recorte (`ABERTURA` e `FECHAMENTO`) e a
asserção `expect(naoCobertas).toEqual([])` ficou **VERDE** com o recorte vazio; só o
`expect(total).toBeGreaterThanOrEqual(25)` reprovou. Sem o sinal de vida, a régua de alcance
inteira era uma farsa silenciosa que passaria em qualquer refatoração do arquivo.

**How to apply:**
- Régua que **conta ou lista** o que achou (`toEqual([])`, `toEqual(mapa)`, `length`) exige uma
  asserção de vivacidade separada com número medido: `expect(total).toBeGreaterThanOrEqual(N)`.
  É o mesmo papel do `expect(arquivos.length).toBeGreaterThan(100)` das réguas de tenancy.
- A mutação que prova isso não é tirar o defeito do código — é **sabotar o recorte** e conferir
  que o vermelho vem do sinal de vida, e não da régua principal. Rode as duas separadamente e
  registre os dois exit codes; ver [[carrasco-declarado-e-afirmacao]].
- `trechoDelimitado` já aplica `codigoDe`/`linhasDeCodigo`, então comentário citando o alvo em
  prosa não conta. Isso deixa de ser hipotético assim que você escreve um comentário explicando o
  sítio: na 75-373 o próprio comentário de justificativa continha `${t.nome} ${t.tamanho}` e teria
  virado duas expressões fantasma (27/25 em vez de 25/23).
- Ver [[reguas-declarativas-tenancy]] para a variante mapa-arquivo→contagem.
