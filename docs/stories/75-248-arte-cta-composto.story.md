# Story 75-248 — CTA composto com a cor da marca (e fim da moldura inventada)

**Status:** InReview
**Tipo:** Feature
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M

## Contexto
Verificação da 75-246 em produção (31/07). O que **funcionou**: o logo composto é
o arquivo do Kit — diferença medida de **1,24/255 (0,5%)** contra o asset, ou seja
identidade, não semelhança; e o modelo respeitou a proibição, não desenhou logo
duplo.

O que **quebrou**, tudo medido na arte real (`0c26c2dd…png`, 768×1376):

1. **O CTA invadiu a faixa reservada.** RGB médio do topo da faixa: `161,90,72` —
   coral puro, 58px dentro de uma área que a regra manda ser "só fundo". Resultado
   visual: a pílula encostada no logo.
2. **O CTA ficou desproporcional.** *Over-correction da regra da 75-244*: pedimos
   "corpo maior, pílula de fundo sólido" e o modelo entregou um botão que compete
   com a headline. Pedimos peso, ganhamos exagero.
3. **A moldura geométrica voltou** — linhas finas soltas nos cantos, explicitamente
   proibidas na 75-244 e ignoradas de novo.
4. 🔥 **A arte está FORA DA MARCA.** A paleta do Vind no Kit é
   `#FFFFFF / #11220F / #8FE6A7` (verde) — **não tem laranja nenhum**. O coral usado
   em tudo (ABRIL/2027, pílula, linhas do prédio) não está na paleta obrigatória que
   o prompt manda. O modelo simplesmente ignorou. Ninguém percebeu antes porque
   coral é bonito e "combina" com alto padrão.

**Conclusão que fecha o padrão de três rodadas:** instrução em prompt não segura o
que precisa ser exato. Cor de marca e CTA são exatos. Saem do modelo.

## Decisão de escopo — CTA sim, headline NÃO
A headline **continua com o modelo**, de propósito. Ele a posiciona
artisticamente sobre a região escura respeitando o prédio; uma headline
determinística sobre foto ficaria rígida e provavelmente pior. E ela **nunca
errou** — português perfeito nas três artes. O CTA é o que reincidiu duas vezes,
é texto curto e fixo, e é onde determinismo só melhora.

## Base técnica já provada (não é suposição)
- `satori` gera SVG com `<path>` e **zero `<text>`** — texto vem vetorizado, então
  a rasterização não depende de fontconfig, que é justamente o que torna texto no
  `sharp` inviável em serverless. Verificado neste repo antes desta story.
- Montserrat SemiBold estático (454KB, OFL) obtido do upstream. É a fonte que o
  Kit do Vind **nomeia**.
- ⚠️ **O Kit não tem NENHUM arquivo de fonte** (`tipo='fonte'` = 0 nas 3 marcas),
  só o nome. O schema já prevê `fontes[].asset_id`.

## Critérios de aceite
- **AC1** — O flow do Sonnet passa a devolver `arte.cta` = o texto EXATO do CTA
  (curto). Ausente ou vazio ⇒ arte sai sem CTA composto (nunca inventar CTA).
- **AC2** — O CTA é **composto** como pílula: cor de fundo = **cor de destaque da
  paleta do Kit**, cor do texto escolhida por **contraste** contra ela, fonte do
  Kit quando houver arquivo, senão a Montserrat empacotada.
- **AC3** — Escolha da cor de destaque é **função pura**: a mais cromática da
  paleta, excluindo quase-branco e quase-preto. Paleta vazia (mesmo após o
  fallback para a institucional) ⇒ **não inventa cor**, sai sem CTA composto.
- **AC4** — Cor do texto sobre a pílula é **função pura** por luminância relativa
  (WCAG), garantindo contraste ≥ 4.5:1 quando possível.
- **AC5** — Layout: a zona inferior reservada tem **duas faixas** — CTA acima,
  logo abaixo — com posições determinísticas por formato (`9:16`, `4:5`, `1:1`),
  em função pura, sem I/O.
- **AC6** — O prompt proíbe o modelo de desenhar **logo E CTA E qualquer texto na
  zona inferior**, e a proibição de moldura/forma solta é **endurecida** (já foi
  ignorada uma vez).
- **AC7** — **Fail-open em camadas:** falha de CTA não impede o logo; falha de
  logo não impede o CTA; falha de qualquer composição **nunca** perde a arte. Todo
  caminho de falha loga.
- **AC8** — Zero regressão: suíte verde, `tsc` limpo nos 2 pacotes, build OK,
  `reel` continua sem arte, posts antigos sem `arte.cta` seguem funcionando.

## Escopo
**IN:** migração 205 (`marketing_posts.arte_cta`); campo `arte.cta` no flow do Sonnet; composição da pílula com `satori`;
funções puras de cor de destaque, cor de texto e layout das duas faixas; fonte
Montserrat empacotada (+ licença OFL); `satori` como dependência de
`packages/web`; endurecimento das duas strings de prompt; testes.

**OUT (decidido):**
- **Headline composta** — decisão de produto acima, não esquecimento.
- **Resolução da arte.** Ela sai **768×1376**; o Instagram quer 1080×1920.
  Investigar se o `imageConfig` do Vertex aceita parâmetro de tamanho é ganho de
  nitidez de graça, mas é outro assunto. **Registrar como próxima.**
- **Corrigir a paleta do Vind.** Se o verde não é a marca real, o erro está no
  Kit e a correção é do humano em Config › Kit de Marcas. O código passa a
  obedecer o Kit — que é o princípio já escrito no prompt.
- Editor de posição na UI.

## Dependências
75-240 (motor), 75-244 (regras de legibilidade), 75-246 (composição do logo, que
esta story estende).

🔥 **CORREÇÃO DE ESCOPO (descoberta no @dev):** a story dizia "nenhuma migração"
e **estava errada**. O "Refazer arte" NÃO chama o Sonnet — relê o que foi
persistido — então sem coluna o CTA se perderia a cada refazer. E o texto do CTA
**não pode** ser anexado na `arte_descricao` (como a 75-241 fez com a direção do
humano), porque aquela string vai DENTRO do prompt e o modelo agora é proibido de
desenhar CTA: seria entregar a ele exatamente o que não pode ver.
⇒ **migração 205** `marketing_posts.arte_cta text` (idempotente, aditiva).
⚠️ **ORDEM OBRIGATÓRIA NO DEPLOY:** migração ANTES do código. Se o código subir
primeiro, o insert com `arte_cta` falha e a Lídia para de criar posts.

## Riscos
1. 🔥 **Se o `satori` falhar, a arte sai SEM CTA nenhum** — porque o modelo foi
   proibido de desenhar um. Antes, falha significava "CTA feio"; agora significa
   "sem CTA". Mitigação: fail-open em camadas + log alto + a fila de aprovação
   humana vê a peça antes de publicar.
2. **O modelo pode desenhar um CTA mesmo proibido** → CTA duplo, como o risco do
   logo na 75-246 (que não se materializou). Mesma mitigação.
3. **Cor de destaque "mais cromática" pode escolher errado** numa paleta atípica
   (ex.: marca cujo destaque é um cinza). Mitigação: a regra é pura e testada; o
   escape é o humano nomear as cores no Kit e, se preciso, uma story para campo
   explícito de "cor de destaque".
4. **A pílula verde menta vai chocar** depois de três artes coral. É a marca
   correta, mas é mudança visível — avisado ao Marcos antes de implementar.
5. **Peso**: +454KB de fonte no bundle da função. Irrelevante frente ao limite.

## Valor
Cor de marca e CTA deixam de ser sugestão. Junto com o logo da 75-246, a peça
passa a ter **três elementos garantidos** (logo, cor, CTA) e só o que é
genuinamente criativo — fundo e headline — fica com o modelo. É a divisão certa:
o modelo faz o que é bom, o código faz o que precisa ser exato.

## Definição de pronto
AC1–AC8 verdes, gate do @qa, PR pelo @devops, deploy em produção e verificação
**medida** (não visual): baixar a arte gerada e conferir que a pílula tem o hex do
Kit e que a faixa do logo não tem pixel de CTA.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). Base técnica validada antes de
  especificar: `satori` vetoriza texto (SVG com `<path>`, sem `<text>`), fonte
  Montserrat estática obtida, ausência de arquivo de fonte no Kit confirmada por
  query em produção. Numeração conferida em `origin/main` + arquivos em disco dos
  worktrees + PRs abertos (a 75-247 foi de outra sessão) — não só no remoto.
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**. Duas ressalvas anexadas
  ao gate: (a) exigir teste do CAMINHO DE FALHA, porque falhar agora significa
  arte SEM CTA e não "CTA feio"; (b) confirmar com o Marcos a mudança visível
  para a cor do Kit antes do merge — **confirmado por ele: "obedece o Kit"**.
- 31/07/2026 — @dev: implementação. **Correção de escopo assumida:** a story
  nasceu dizendo "nenhuma migração"; foi preciso a 205 (ver Dependências).
  Registrado em vez de escondido, com a ordem de deploy explícita — que é o
  risco operacional real. Verificações extras que não estavam nos AC:
  (1) a fonte É rastreada para dentro das duas rotas serverless (conferido no
  `.nft.json` do build, não presumido);
  (2) guard de piso de legibilidade adicionado — sem ele uma arte pequena gerava
  pílula de 2px, que "cabe" na matemática e é lixo na tela;
  (3) 3 testes da 75-244/75-246 foram atualizados porque esta story **supersede**
  a regra de "CTA com peso visual" — documentado no próprio teste.
