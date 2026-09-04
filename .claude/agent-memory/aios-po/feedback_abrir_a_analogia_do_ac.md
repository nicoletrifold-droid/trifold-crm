---
name: abrir-a-analogia-do-ac
description: AC que diz "mesmo padrão/tratamento de X" precisa ser aberto no código — a analogia pode ser estruturalmente errada e mandar o @dev implementar outra coisa
metadata:
  type: feedback
---

Quando um AC se ancora numa analogia ("mesmo tratamento visual dado a X", "mesmo padrão
dos demais filtros", "mesmo shape já usado em Y"), abrir X/Y no arquivo citado e conferir
o que é de fato, antes de dar GO. Se a analogia não se sustenta, reescrever o AC com a
estrutura explícita — não deixar o @dev resolver a contradição na hora de codar.

**Why:** na 75-372 o AC pedia "uma célula nova, com o mesmo tratamento visual de
cargo/observação". No `print-modal.tsx`, cargo e observação **não são células** — são
`<br><span>` dentro da célula do nome. As duas metades do AC apontavam para
implementações diferentes (coluna nova × texto inline sob o nome), e a segunda contradizia
a AUTO-DECISION de posicionamento da coluna. Analogias erradas passam batido porque soam
como reuso de padrão existente.

**How to apply:** em `*validate-story-draft`, tratar cada "mesmo X que Y" como claim
verificável (igual a [[feedback_validation_post_pm_review]] e
[[feedback_mitigacao_delegada_a_ferramenta]]): grep no arquivo/linha citados. Vale
especialmente para ACs de UI/relatório, onde "célula", "coluna", "linha secundária" e
"span inline" são coisas diferentes com o mesmo nome informal.
