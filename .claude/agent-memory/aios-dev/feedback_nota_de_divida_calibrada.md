---
name: nota-de-divida-calibrada
description: Nota de dívida técnica tem que dizer a consequência concreta e as pré-condições, não só a mecânica — mecânica sozinha subdimensiona e vira rodapé
metadata:
  type: feedback
---

Ao anotar dívida técnica numa story, descrever a **mecânica** ("interpola sem escapar HTML")
não basta. A nota precisa trazer, na mesma frase: (a) a **consequência concreta** medida
("`<script>` executa na origem da app e rouba a sessão de quem imprime"), (b) as
**pré-condições que limitam a severidade** ("exige usuário autenticado da mesma org com
escrita no módulo; sem caminho anônimo") e (c) o **custo real do conserto**, medido — não
estimado por impressão.

**Why:** na 75-372 eu escrevi "interpola todos os campos de texto sem escapar HTML ... merece
story própria". O @qa mediu o alcance e mostrou que a redação **soava cosmética** e
subdimensionava um MEDIUM de roubo de sessão; e derrubou meu argumento de que a alternativa
estaria "fora de alcance" — era um helper de ~4 linhas + 6 call sites no arquivo que a story
já editava. Nota mal calibrada é pior que nenhuma: quem lê depois arquiva o item.

**How to apply:**
- Antes de chamar algo de "fora de alcance", **meça o alcance**: `grep` pelo helper que
  faltaria (existe? quantas ocorrências?) e pelos call sites (quantos arquivos de verdade?).
  Se der 1 arquivo, não diga que é grande.
- Diga as pré-condições **contra** a sua própria dramatização e o impacto **contra** o seu
  próprio amaciamento — as duas metades juntas.
- Fato deste repo que sobe a severidade de qualquer injeção de HTML: **não existe `httpOnly`
  em `packages/web/src`** (default do Supabase SSR), então `sb-*-auth-token` é legível por JS;
  e `about:blank` aberto por `window.open("")` **herda a origem do opener** — não é sandbox.
- Ao corrigir a nota depois do gate, registre como follow-up (ver
  [[feedback_concern_gate_como_followup]]) e diga o que **continua aberto**.

Related: [[feedback_carrasco_declarado_e_afirmacao]], [[feedback_corte_de_escopo_comentarios]]
