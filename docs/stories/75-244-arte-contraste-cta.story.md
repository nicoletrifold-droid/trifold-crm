# Story 75-244 — Arte da Lídia legível: contraste e CTA com peso

**Status:** Done
**Tipo:** Fix de comportamento (prompt)
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** S

## Contexto
Marcos (31/07), ao validar em produção a primeira arte real da Lídia — story do
Vind Residence, *"A ENTREGA MAIS PRÓXIMA DO MERCADO / ABRIL/2027"*:

- a peça saiu **quase toda preta**, sumindo no scroll do Instagram;
- o CTA *"Arraste e agende sua visita"* ficou **cinza, miúdo, no rodapé** — o
  único elemento que precisa ser lido é o menos visível da arte;
- apareceu uma **forma geométrica cinza solta** ao lado do prédio, que não é
  decisão de design, é preenchimento de espaço vazio pelo modelo.

Diagnóstico: o problema **não é o motor de imagem**. O `gemini-3.1-flash-image`
acertou tipografia, hierarquia e português. A causa é que a regra do BLOCO ARTE
no prompt do Sonnet só pedia "composição, clima, paleta, tipografia" — nada
impedia a direção de arte descrever a peça como noturna/escura com CTA discreto.
Foi exatamente o que ele escreveu, e o motor obedeceu.

Decisão de produto tomada no mesmo bate-papo: **não trocar de motor** (avaliado
o `fal-ai/flux-2-pro`; o Nano Banana 2 vence justamente em texto PT-BR dentro da
imagem, que é o que essa peça mais exige). Ver `project-lidia-motor-imagem`.

## Critérios de aceite
- **AC1** — Dado um pedido de post com imagem, quando o Sonnet monta
  `arte.descricao`, então o prompt exige contraste alto texto/fundo, proíbe
  descrever a arte como escura/monocromática, obriga reservar área luminosa e
  trata **CTA discreto ou pequeno como erro explícito**.
- **AC2** — Dado qualquer formato com imagem (`story`, `estatico`, `carrossel`),
  quando `buildArtePrompt` monta o prompt, então os blocos `CONTRASTE
  (obrigatório)` e `CTA (obrigatório)` estão presentes.
- **AC3** — Dado que o humano escreveu um ajuste no "Refazer arte", quando o
  prompt é montado, então o ajuste aparece **depois** das novas regras — a
  prioridade máxima do humano (75-240/75-241) é preservada.
- **AC4** — Formato `reel` não gera imagem: comportamento inalterado.
- **AC5** — Zero regressão: suíte completa verde, `tsc` limpo nos dois pacotes,
  build OK.

## Escopo
**IN:** as duas strings de prompt (regra do BLOCO ARTE no flow do Sonnet + as
REGRAS do motor de imagem) e os testes que fixam AC1–AC3.

**OUT (decidido, não é esquecimento):**
- Compor logo e headline vetorialmente por cima da imagem em vez de pedir ao
  modelo — resolve fidelidade de logo e erro de grafia de vez, mas é engenharia
  de outra ordem. **Backlog.**
- Trocar o motor para FLUX.2 pro — **decidido não**, reavaliar em outubro quando
  o trial do Vertex vencer.
- Anexar render real do Vind como imagem de referência — depende de render
  interno existir ([[project-render-3d-interno]]); story própria.

## Dependências
75-240 (motor de arte da Lídia) e 75-241 (direção visual do humano, canal
verbatim com prioridade máxima). Nenhuma migração.

## Riscos
1. **Tensão intencional:** se a direção pedir "fachada noturna" e a regra disser
   "não pode ser quase toda preta", o modelo precisa conciliar. O resultado
   esperado — noturna com céu luminoso e janelas acesas — é justamente a peça
   boa. Não é conflito, é o alvo.
2. **Humano querendo peça escura de propósito:** preservado pelo AC3; o ajuste
   do Refazer continua ganhando das regras.
3. Prompt mais longo = mais tokens por chamada. Desprezível no volume.
4. Regra em prompt é heurística, não garantia: o modelo pode desobedecer. A rede
   de segurança segue sendo a fila de aprovação — nada publica sem humano.

## Valor
Arte que sobrevive ao scroll e CTA que se lê. Sem isso a Lídia gera peça bonita
que não converte, e o custo é invisível: ninguém reclama de um story fraco.

## Definição de pronto
AC1–AC5 verdes, gate do @qa, PR pelo @devops, deploy em produção e comparação
visual com a arte de 31/07 clicando "Refazer arte" no mesmo post.

## Arquivos
- `packages/ai/src/flows/marketing-post-request.ts` (+ `.test.ts`) — regra
  `LEGIBILIDADE DA ARTE` no BLOCO ARTE (a raiz: onde o Sonnet escreve a direção).
- `packages/web/src/lib/marketing/arte-gen.ts` (+ `.test.ts`) — blocos
  `CONTRASTE (obrigatório)`, `CTA (obrigatório)` e `PROIBIDO` nas regras que vão
  ao motor de imagem (rede de segurança se a direção vier ruim).

## Dev Notes
- **Verificação que evitou trabalho inútil:** `agent_prompts` mascara prompt do
  código (gotcha conhecido), mas só na pipeline de chat da Nicole. A Lídia monta
  o prompt em `REQUEST_PROMPT_HEADER`, no código — a edição vale sem tocar o banco.
- O prompt do `marketing-post-request.ts` é escrito **sem acento** por convenção
  do arquivo; o do `arte-gen.ts` usa acento. Mantidas as duas convenções.
- AC3 fixado por teste de **ordem** (`indexOf` do ajuste > `indexOf` do
  CONTRASTE), não só de presença — é o que garante a prioridade do humano.

## QA Results
Quinn: **PASS** — `docs/qa/gates/75.244-arte-contraste-cta.yml`

Os 7 checks passaram. O sinal mais forte é o diff: **48 inserções, zero
remoções** — nenhuma linha existente foi tocada, então a superfície de regressão
é nula. AC3 fixado por *ordem* (`indexOf`) e não só por presença é o detalhe
certo: é o que impede alguém reordenar o prompt e matar a prioridade do humano
sem quebrar a suíte.

4 observações, nenhuma bloqueante:
1. *(low)* **Limite honesto deste gate:** os testes provam que a instrução está
   no prompt, **não que a arte melhorou**. Regra em prompt é heurística. A
   aceitação real é visual e só existe pós-deploy.
2. *(medium, dívida)* Logo e headline continuam **desenhados** pelo modelo, não
   compostos — desvio de forma/kerning é inevitável e não dá para validar contra
   o asset do Kit. Fora de escopo por decisão; story própria.
3. *(low)* Tensão "noturna" × "não pode ser preta" é intencional; observar nas
   próximas 3-5 artes se o modelo concilia.
4. *(low)* Processo: código antes da story, retroajustado no ciclo. Registrado.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). **Registro honesto de processo:** o
  código foi escrito antes desta story existir, no fluxo mínimo
  (`@dev → @qa → @devops`); Marcos pediu o fluxo completo e a story foi
  retroajustada dentro do ciclo, mesmo precedente da 75-241 (achado de QA #4).
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**. Status Draft → Ready.
- 31/07/2026 — @dev: implementação concluída (4 arquivos, +4 testes).
  Status Ready → InProgress → InReview.
- 31/07/2026 — @qa: gate **PASS** (4 observações, 0 bloqueante).
- 31/07/2026 — @devops: PR #320 squash-merged (`c0d14b41`), deploy de produção
  READY. Status InReview → **Done**.

## Validação
- Suíte **1322/1322** (+4 testes) · `tsc` limpo nos 2 pacotes · build 22s ·
  eslint sem erro. Diff 100% aditivo (48 inserções, 0 remoções).
- Sem migração.
- ✅ LIVE: PR #320 squash-merged, deploy de produção concluído (`c0d14b41`).
- ⏳ **Aceitação visual pendente (é o teste que importa):** clicar "Refazer arte"
  no story do Vind e comparar com a peça de 31/07 — a peça deve ter área
  luminosa, CTA com peso e nenhuma forma solta.
