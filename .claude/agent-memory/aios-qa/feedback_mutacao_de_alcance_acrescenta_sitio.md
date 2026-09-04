---
name: mutacao-de-alcance-acrescenta-sitio
description: para provar régua de ALCANCE ("pega o próximo"), a mutação tem que ACRESCENTAR o sítio que não existe — remover escape de sítio existente só prova presença
metadata:
  type: feedback
---

Régua de **alcance** (a que promete "quem adicionar um sítio novo daqui a três meses vê vermelho")
só está provada por uma mutação que **acrescenta** uma interpolação nova. Remover o escape de um
sítio que já existe prova a régua de **presença** — é outra AC.

**Why:** no gate da Story 75-373 o @dev rodou 4 mutações de controle, todas legítimas, e **nenhuma
provava a AC6**: (a) tirou `escapeHtml` de um sítio existente, (b)/(b2) sabotou as pontas do
recorte, (c) tirou os 9 escapes de uma vez. As três classes medem presença ou vivacidade do
recorte. Acrescentei `<td class="cep">${d.endereco_cep}</td>` — sítio que não existia — e a régua
ficou vermelha **nomeando** `d.endereco_cep`. Só aí a promessa central da AC ficou medida.

**How to apply:**
- Ao revisar qualquer régua declarativa (lista de perdões + varredura de fonte), rode **três**
  mutações, não uma: remover o marcador de um sítio existente (presença), sabotar o recorte
  (vivacidade), **acrescentar um sítio novo** (alcance).
- Recorte fail-closed que devolve `""` **aprova** um `.toEqual([])` — o oposto do uso original em
  `fonte-scan.ts`, onde `""` reprova um `toContain`. Por isso o sinal de vida (`>= N`) não é
  opcional; e ele se prova mutando o **declarado** (`25 → 26`), que crava o número exato sem
  replicar o scanner. Ver [[reguas-declarativas-ac10]].
- Régua que casa por `startsWith("marcador(")` mede a **presença do marcador**, nunca a
  **suficiência** dele: teste também um sítio onde o marcador está lá e é insuficiente (atributo
  sem aspas, contexto de URL) e um drible por concatenação. Se ficarem verdes, é residual
  nomeável — não bloqueio, mas vira item de backlog com evidência, não parágrafo em story que
  será arquivada.
- Paridade "antes × depois" se prova sem sonda do @dev: compile a versão de `origin/main` numa
  cópia temporária (só acrescentando `export`, corpo intocado) ao lado da de `HEAD` e compare
  `sha256`. **Com contraprova** — dado hostil tem que DIVERGIR, senão a sonda é vacuosa.
  Ver [[paridade-provada-por-bytes]] e [[mutacao-prova-teste-real]].
