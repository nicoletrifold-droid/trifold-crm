---
name: carrasco-declarado-e-afirmacao-testavel
description: Comentário que nomeia o carrasco ("tirar X deixa o teste vermelho") é afirmação verificável — rodar a mutação ANTES de escrever a frase, e uma frase por metade da proteção
metadata:
  type: feedback
---

Quando um comentário de teste declara **o que faz aquele teste reprovar**, essa frase é uma
afirmação sobre o código, não decoração. Rode a mutação que ela descreve **antes** de escrevê-la.
E se a proteção tem duas metades, são duas frases e dois testes — uma frase genérica cobrindo as
duas quase sempre é falsa em uma.

**Why:** no gate do webhook de WhatsApp (01/09/2026) escrevi "tirar o `try/catch` (ou o
`if (error)`) da rota faz `db.messages` ficar vazio e a resposta deixar de ser 200". O `@qa`
removeu o `if (error)` inteiro: **54 passed**. A metade do `try/catch` era verdadeira; a do
`if (error)` era falsa, porque o PostgREST **não lança** em violação de CHECK/RLS — devolve
`{data:null, error}`. O teste nunca tinha olhado o efeito observável daquela metade
(`console.error` com a mensagem do banco), então eu tinha um comentário confiante sobre um trecho
destrancado. No mesmo gate, um segundo teste afirmava "AGUARDADO, não `after()`" mas assertava
depois de `drenarAfter()` — mover o código para dentro de `after()` continuava verde.

**How to apply:**
- Antes de commitar, aplique de fato cada mutação que o comentário promete e confirme o vermelho.
  Restaure de um backup, não do editor.
- Duas causas de falha ⇒ dois testes. Cliente/rede **lança**; PostgREST devolve `error` no objeto.
  `try/catch` sozinho cobre uma; `if (error)` sozinho cobre a outra.
- Falha engolida precisa de efeito observável assertável (espião de `console.error`), senão trocar
  um silêncio por outro passa verde.
- Asserção depois de um dreno (`drenarAfter`, `flushAsync`, `await` de folga) não distingue
  "aguardado" de "agendado". Para trancar sincronismo, afirme **sem** o dreno.
- Ordem entre dois efeitos não aparece em estado final: grave a sequência (ex.: `insertsPorTabela`,
  irmão de `selectsPorTabela`) ou espie o estado no momento do segundo efeito.

Ver [[ordem-das-asercoes-na-mutacao]] e [[validacao-exit-code]].
