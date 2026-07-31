# Story 75-250 — A arte usa o render REAL e a cor certa (fim do prédio inventado)

**Status:** InReview
**Tipo:** Fix de comportamento (dado + prompt)
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M

## Contexto
Marcos, 31/07, olhando a arte gerada com o escopo do Vind correto: *"mas esta
fachada não é nossa, você percebeu?"*. Percebi — e é o defeito mais grave da
série, porque **anunciar fachada que não existe é risco de Procon, não questão
de estética.** Uma incorporadora não pode veicular volumetria que o cliente não
vai receber.

A 75-248 funcionou (medido): pílula `#8fe6a7` do Kit, logo do Vind composto,
CTA sem invadir a faixa. Sobraram dois defeitos, e os dois foram rastreados até
a raiz.

### Defeito A — as referências não são enviadas
O Marcos citou `VIND_RENDER_FACHADA_NOITE.png` e `VIND_RENDER_PISCINA.png` no
pedido. Os 6 renders do Vind **estavam** na lista de assets do prompt (conferido:
a rota filtra por `brandById` corretamente). E o Sonnet devolveu
`arquivos_kit: []`. **Ele viu e escolheu não citar.** Sem referência, o modelo
inventa — e inventou uma torre de 11 andares que não é o Vind.

### Defeito B — o prompt do motor se contradiz sobre cor
Cadeia causal completa, verificada por query:
1. A regra do BLOCO ARTE manda o Sonnet escrever "paleta com os HEX da marca".
2. **`BrandKnowledge` não tem campo de cores** — só voz, diretrizes e briefing.
   O Sonnet nunca recebe a paleta. Instrução impossível de cumprir.
3. O **briefing da Trifold institucional contém o hex `#F27A5E` escrito no
   texto** (confirmado: `briefing ilike '%F27A5E%'` = true). Como o escopo é
   sempre institucional + empreendimento, esse hex entra em TODO post.
4. O Sonnet usa esse laranja na direção de arte do Vind: *"céu de fim de tarde
   em degradê de laranja #F27A5E"*.
5. `buildArtePrompt` acrescenta depois `PALETA OBRIGATÓRIA: #FFFFFF, #11220F,
   #8FE6A7` — a do Vind, corretamente escopada.
6. O modelo recebe **um prompt que se contradiz**: direção concreta dizendo
   laranja, regra abstrata dizendo verde. Concreto ganha.

Não é o modelo sendo rebelde. É o prompt pedindo duas coisas opostas.

## Critérios de aceite
- **AC1** — Se o pedido do humano OU a direção de arte mencionam um `file_name`
  que existe no Kit escopado, esse arquivo **entra nas referências** por decisão
  do código, independente do que o Sonnet devolveu em `arquivos_kit`.
- **AC2** — A união (forçados + citados pelo Sonnet) é **persistida** em
  `arte_arquivos`, para o "Refazer arte" preservar as referências (ele não chama
  o Sonnet).
- **AC3** — O casamento de nome é **função pura**: sem I/O, case-insensitive,
  tolerante a pontuação em volta, e **não** casa por fragmento (`VIND.png` não
  pode casar `VIND_RENDER_PISCINA.png`).
- **AC4** — A paleta escopada (empreendimento ganha da institucional, mesma
  regra que o `arte-service` já aplica) é **passada ao Sonnet**, e a regra passa
  a ser: use SOMENTE estes hex.
- **AC5** — O Sonnet é **proibido de escrever hex** que não venha da paleta
  recebida; paleta vazia ⇒ descrever cor por nome, sem hex.
- **AC6** — A regra de escopo da paleta vira **uma função pura compartilhada**,
  usada pela rota e pelo `arte-service`. Hoje a lógica está duplicada inline no
  `arte-service` — duas cópias divergem com o tempo.
- **AC7** — Zero regressão: suíte verde, `tsc` limpo nos 2 pacotes, build OK.

## Escopo
**IN:** função pura de casamento de nome de arquivo; união e persistência das
referências na rota `/pedir`; função pura compartilhada de escopo de paleta;
paleta no input do flow do Sonnet + regra de hex único; testes.

**OUT (decidido):**
- **Seletor de fotos no modal.** Seria a UX certa — o humano marca os renders e o
  código manda. Mas o AC1 já **conserta a falha observada** (o Marcos citou os
  nomes e foram ignorados); o seletor é melhoria, não correção. Story própria.
- **Tirar o hex do briefing da Trifold.** É dado, não código — o humano edita o
  Kit. Depois do AC5 ele deixa de contaminar de qualquer forma.
- Resolução 1080×1920 e conversão dos renders para JPEG (dívidas já registradas
  no gate da 75-248).

## Dependências
75-240, 75-244, 75-246, 75-248. Nenhuma migração — `arte_arquivos` já existe.

## Riscos
1. **Forçar referência pode encher o teto de bytes.** Os renders têm 2–3MB e o
   teto agregado é 7MB, então citar 3 arquivos faz o 3º ser descartado em
   silêncio. Mitigação: os forçados entram PRIMEIRO (o humano pediu), e o
   descarte já loga. A conversão para JPEG resolve de vez, e está registrada.
2. **Casamento de nome pode dar falso positivo** se um arquivo tiver nome
   genérico (ex.: `foto.png`). Mitigação: AC3 exige nome completo, não
   fragmento, e o teste cobre isso explicitamente.
3. **Com o render como base, a arte pode ficar menos "bonita"** que a invenção
   do modelo — render real tem enquadramento fixo. É o preço certo: fidelidade
   vale mais que estética numa peça de venda de imóvel.

## Valor
A Lídia passa a anunciar **o Vind**, não um prédio plausível. É o único defeito
da série com risco jurídico, e fecha o padrão: tudo que precisa ser exato — logo,
cor, CTA e agora a **fachada** — saiu do modelo. Sobra para ele o que ele faz
bem: clima, luz, composição e headline.

## Definição de pronto
AC1–AC7 verdes, gate do @qa, PR pelo @devops, deploy, e verificação com o
Marcos: gerar a arte do Vind citando o render da fachada e confirmar que **é o
prédio dele** na imagem.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). Cadeia causal do defeito B verificada
  por query em produção (o hex no briefing da Trifold), não deduzida. Numeração
  conferida em `origin/main` + worktrees + PRs abertos: a 75-249 saiu por outra
  sessão, esta é a 250.
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**. Ressalva: o AC6 é
  refactor de código que já funciona em produção — o @qa deve provar que o
  `arte-service` resolve a paleta igual a antes. **Atendida** (3 testes cobrindo
  os mesmos casos da lógica inline removida).
- 31/07/2026 — @dev: implementação. 🔥 **Achado que teria matado a story em
  silêncio:** o `select` de `marketing_brands` na rota `/pedir` não trazia a
  coluna `cores`. A paleta sairia vazia sempre, o prompt diria "Nenhuma cor
  cadastrada", e **todos os testes passariam** — porque testam a função pura, não
  a query que a alimenta. Corrigido no mesmo commit. LIÇÃO: função pura testada
  não prova que o chamador a alimenta.
- 31/07/2026 — @qa: gate **PASS**. Ver `docs/qa/gates/75.250-arte-referencia-e-paleta.yml`.
