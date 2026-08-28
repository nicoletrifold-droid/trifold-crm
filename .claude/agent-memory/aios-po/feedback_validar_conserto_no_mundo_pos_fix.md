---
name: validar-conserto-no-mundo-pos-fix
description: Quando uma story conserta dois defeitos, validar o segundo conserto no mundo em que o primeiro JÁ está aplicado — rodar a fixture da própria story no papel
metadata:
  type: feedback
---

Numa story com dois consertos, o segundo foi desenhado contra o código de **hoje** e vai rodar no
código **depois do primeiro**. Validar cada AC isolada não pega isso: **rodar a fixture da própria
story no papel, com o conserto A já aplicado.**

**Why:** na 87-17 o conserto B filtrava "horários ainda não oferecidos" para responder "mais tarde".
Isso equivale a "mais tarde" **só enquanto** o defeito A existir (a oferta era um prefixo do
período). Com o A consertado, a oferta passa a incluir o **último** horário livre, e a diferença de
conjuntos vira o **meio** — a Nicole ofereceria `12h30/13h30/15h` chamando de "mais tarde" do que as
`17h` que ela mesma tinha oferecido. **A AC ficaria VERDE**, porque só exigia "não repetir os
anteriores". Aritmética no papel, com a fixture da story, foi o que denunciou.

**How to apply:** para cada AC do conserto nº 2, perguntar "o que esta AC **deixa passar** depois do
conserto nº 1?" e reescrevê-la como proibição explícita, não só como ausência de repetição. E
quando um dilema de fronteira parecer exigir escolher qual princípio quebrar, gastar um turno
perguntando **de qual premissa o dilema depende** — na 87-17 a premissa ("responder 'mais tarde'
exige memória da oferta") era falsa e custava um campo novo, retrabalho e uma trava calibrada.
Relacionado: [[epic87-campos-reservados]], [[feedback-validation-post-pm-review]].
