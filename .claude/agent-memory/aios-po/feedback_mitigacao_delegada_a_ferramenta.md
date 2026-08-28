---
name: mitigacao-delegada-a-ferramenta
description: Quando uma story diz que o tsc/lint/CI "pega sozinho" um erro, rode a ferramenta antes de aceitar — a mitigação não medida é mitigação inventada
metadata:
  type: feedback
---

Quando um draft delega a rede de segurança a uma ferramenta (*"deixa de compilar"*, *"o TypeScript
pega sozinho qualquer chamador esquecido"*, *"o lint acusa"*, *"o CI barra"*), **rode a ferramenta
num arquivo mínimo, com contraprova**, antes de aceitar a mitigação. Se não pegar, a `AC` tem de
nomear qual **teste** é a rede — e uma mutação tem de provar que ele reprova.

**Why:** na validação da 87-18 (27/08/2026) a story afirmava que trocar `isSlotFree` de `boolean`
para `"free" | "occupied" | "unknown"` faria `if (await isSlotFree(...))` **deixar de compilar**, e o
`R1` usava isso como mitigação principal, com probabilidade "Baixa". Medido: `tsc --noEmit --strict`
dá **EXIT=0 e zero linhas** nessa forma (truthiness de union de strings sem constituinte falsy não é
erro; o predicado de `Array.prototype.filter` é tipado `=> unknown`, string passa), e o repo não tem
`strict-boolean-expressions`. Pior: como as três strings são truthy, a forma booleana esquecida faria
**`"occupied"` virar `"free"`** — um modo de falha maior do que o defeito que a story consertava, com
`tsc` e `lint` verdes. A rede real eram dois testes pré-existentes.

**How to apply:** (a) o teste da ferramenta é de 10 linhas em scratchpad e **precisa de contraprova**
(o mesmo comando reprovando um erro óbvio), senão o verde não vale — e capture o exit code em
variável (`out=$(cmd); rc=$?`), nunca depois de um pipe, ou você mede o `head`; (b) troca de tipo de
retorno de função **exportada** o `tsc` pega mesmo (chamador em outro módulo); chamador **interno na
mesma função/arquivo** usando o valor em posição de verdade, não pega; (c) se a rede acabar sendo um
teste existente, congele a forma dos parâmetros para que a própria story não reescreva esse teste no
mesmo PR (foi a base da minha DECISÃO 3 lá). Parente de
[[validar-conserto-no-mundo-pos-fix]] e [[validate-sibling-story-reuse-audit]].
