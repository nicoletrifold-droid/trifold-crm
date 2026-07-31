# Story 75-246 — Logo da marca composto por cima da arte

**Status:** InReview
**Tipo:** Feature
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M

## Contexto
Dívida registrada como achado *medium* no gate da 75-244: **logo e headline são
desenhados pelo modelo de imagem, não compostos.** Nenhum modelo de difusão
reproduz um logo com exatidão — sempre há desvio de forma, kerning e proporção —
e não existe como validar automaticamente o resultado contra o asset do Kit.

Na arte aprovada de 31/07 o logo do Vind saiu bom o suficiente. Isso é sorte
amostral, não garantia: a peça seguinte pode sair com o "V" torto e ninguém
percebe até um cliente ver. Marca é o ativo que a incorporadora menos pode
deixar na mão de heurística.

**Ganho lateral:** logo em SVG hoje é descartado (a allowlist do Vertex recusa
SVG, `REF_MIME_ALLOWLIST`). Na composição, SVG é o formato ideal — escala sem
perda. Esta story aproveita assets que hoje não servem para nada.

## Decisão de escopo — só o LOGO nesta story
Compor **headline** exige motor de layout de texto (fonte do Kit carregada como
buffer, quebra de linha, área segura por formato) — trabalho de outra ordem, com
outra biblioteca (`satori`/`resvg`, porque `sharp` depende de fontconfig do
sistema para texto, o que não é confiável em serverless). Fica para story
própria; esta entrega o pedaço de maior valor por menor risco.

## Critérios de aceite
- **AC1** — Dado um post com imagem gerada e uma marca com asset `tipo='logo'`,
  quando a arte é gerada, então o logo do Kit é **composto** sobre a imagem
  (PNG/JPEG/WEBP **ou SVG**), em posição e tamanho determinísticos por formato,
  e o arquivo salvo no bucket já contém o logo.
- **AC2** — Dado que o logo agora é composto, quando o prompt é montado, então
  ele **proíbe o modelo de desenhar logo/marca** e **exige área inferior limpa**
  (sem texto, sem elemento gráfico) reservada para a aplicação.
- **AC3** — Prioridade do logo segue a mesma regra já testada de
  `selectArteReferencias`: logo do empreendimento primeiro, ícone depois, e por
  último o institucional.
- **AC4** — **Fail-open preservado:** se o download ou a composição do logo
  falhar, a arte é salva **sem** logo (nunca perde a peça inteira), e o fato é
  logado. A fila de aprovação humana é a rede de segurança.
- **AC5** — Posição/tamanho do logo são função pura testável por formato
  (`9:16`, `4:5`, `1:1`): sem I/O, sem rede — teste de unidade cobre os três.
- **AC6** — Zero regressão: suíte completa verde, `tsc` limpo, build OK; post de
  `reel` continua sem arte.

## Escopo
**IN:** composição do logo no `arte-service.ts` (entre geração e upload), função
pura de layout, ajuste das duas strings de prompt (proibir desenhar logo +
exigir área limpa), `sharp` como dependência direta de `packages/web`, testes.

**OUT (decidido):**
- **Headline composta** — story própria (é o resto da dívida).
- **Editor de posição do logo na UI** — o layout é determinístico por formato;
  se o humano quiser outro lugar, usa o "Refazer arte" ou edita fora.
- Marca d'água/assinatura em vídeo (reel não gera imagem).

## Dependências
75-240 (motor de arte), 75-234/mig 199 (assets do Kit, incl. fonte), 75-244
(regras de legibilidade — a área limpa conversa com a regra de contraste).
Nenhuma migração nova.

## Riscos
1. 🔥 **O modelo pode desenhar um logo mesmo proibido** → arte com logo duplo.
   Mitigação: regra explícita no prompt + aprovação humana na fila. Observar as
   primeiras artes; se insistir, parar de enviar o logo como referência (custo:
   perde influência de paleta/estilo).
2. **`sharp` em serverless na Vercel** — binário nativo por plataforma. Está no
   store como transitiva (0.34.5); promover a dependência direta pode mudar o
   lockfile. Verificar o build antes do merge, não depois.
3. **Logo claro sobre área clara** (ou escuro sobre escura) fica invisível. Esta
   story aplica em posição fixa; se acontecer, a saída é a regra da 75-244
   (área inferior com contraste) ou um passo futuro de escolher a variante do
   logo pela luminância da região.
4. **Peso da função** — `sharp` + download do logo somam tempo à rota. Há folga
   (`maxDuration = 300`, geração leva ~15s).

## Valor
Fidelidade de marca deixa de ser sorte. O logo passa a ser **exatamente** o
arquivo do Kit, sempre, em qualquer motor de imagem — inclusive se a decisão de
outubro trocar o Vertex por outro provedor. É a única parte da arte que não pode
ser "quase certa".

## Definição de pronto
AC1–AC6 verdes, gate do @qa, PR pelo @devops, deploy em produção e comparação
visual: gerar arte do Vind e conferir que o logo é pixel-idêntico ao asset do
Kit, sem segundo logo desenhado pelo modelo.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). Levantamento técnico prévio: `sharp`
  disponível no store, rotas em Node com `maxDuration=300`, Kit já suporta
  asset de fonte (habilita a story seguinte, da headline).
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**. Status Draft → Ready.
  **Ressalva anexada ao gate:** o risco 2 (`sharp` como dependência direta pode
  mexer no lockfile) exige build verificado ANTES do merge — @qa não fecha gate
  sem isso.
- 31/07/2026 — **renumerada 75-245 → 75-246.** Uma sessão paralela criou outra
  story 75-245 (`nicole-agendamento-fantasma`) às 09:12 no mesmo working tree;
  esta nasceu às 09:08 mas cedeu o número, porque a outra estava com código em
  andamento e renumerar no meio do voo é mais arriscado. 🔥 **Conferir o
  `origin/main` antes de numerar não basta** quando há sessão concorrente — a
  story da outra sessão ainda não estava no remoto.
- 31/07/2026 — @dev: implementação (arte-logo.ts novo + 3 arquivos, 16 testes).
  Status Ready → InProgress → InReview.
- 31/07/2026 — @qa: gate **CONCERNS** — implementação aprovada, mas a suíte e o
  build locais rodaram com código da sessão paralela no working tree. O gate só
  fecha com o preview do PR verde (compila apenas este commit).
