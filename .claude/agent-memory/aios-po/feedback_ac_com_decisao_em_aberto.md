---
name: ac-com-decisao-em-aberto
description: AC que diz "decisão do @dev" ou oferece duas abordagens à escolha não é AC — o @po decide na validação, com o motivo
metadata:
  type: feedback
---

AC que delega a decisão de desenho ao executor ("decisão do @dev, desde que documentada",
"escolha e justifique uma das duas abordagens", "discutir com o @po antes de fechar") **não é AC
testável e reprova o ponto 3 do checklist**. Na validação eu decido, cravo no AC e escrevo o
motivo — não devolvo ao @sm nem deixo passar.

**Why:** o gate não tem contra o que medir, e a story fecha "verde" com a metade mais fácil de cada
escolha. A 75-373 entrou com **seis** decisões em aberto; a mais grave era a AC6 oferecer, como
alternativa aceitável, um teste de injeção por campo "satisfeito por disciplina de revisão futura"
— que não cumpre o objetivo escrito na própria AC ("quem adicionar uma 9ª coluna daqui a três meses
deve ver o teste vermelho"). Um teste por campo existente nunca fica vermelho por campo que ainda
não existe: é a AC de injeção contada duas vezes.

**How to apply:**
- Cada decisão cravada precisa do **motivo medido**, não da preferência. Exemplos que funcionaram:
  escolher `export` in place em vez de extrair um módulo **porque** `gh pr view` mostrou o PR-base
  em `CHANGES_REQUESTED` (mais commits vindo no mesmo arquivo ⇒ conflito de rebase); escolher
  escapar no consumidor em vez do módulo puro **porque** o módulo tem contrato de "valor exato"
  consumido por filtro de igualdade contra o banco.
- Prefira **uma regra única auditável** a "às vezes aqui, às vezes lá". "Todo `${}` de dado é
  `${escapeHtml(…)}`" é verificável por varredura; "pode escapar dentro ou no call site" não é.
- Régua de alcance sempre precisa de **sinal de vida numérico medido** (`>= N` itens encontrados).
  Varredura com recorte fail-closed devolve `""` ⇒ zero itens ⇒ aprova tudo. E exija **mutação de
  controle**: ver a régua reprovando, uma vez, antes de commitar.
- Numa régua de "lista declarada", diga explicitamente que **o perdão é da expressão, nunca da
  variável** — `${cargo}` pode ser declarado seguro, `${d.cargo}` dentro dele não.

Ver também [[mitigacao-delegada-a-ferramenta]], [[abrir-a-analogia-do-ac]],
[[ac10-residual-declarado]].
