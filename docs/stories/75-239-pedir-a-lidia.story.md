# Story 75-239 — "Pedir à Lídia": diretriz livre → post pronto na fila (+ formato)

**Status:** InReview
**Tipo:** Feature
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M

## Contexto
Marcos (30/07), olhando o modal "Novo post": *"tô achando ela defasada e sem
sentido, pois já colocamos tudo dentro do CRM… Temos que ter como dar
diretrizes, como story, reels, posts… poder falar 'vamos usar a foto da
fachada', dar prompts e o sistema gerar"*. O modal era da 75-219 (era
Canva-link): pedia copy escrita à mão num momento em que a Lídia já tem
briefing, voz, diretrizes e arquivos no Kit.

Escopo COMBINADO em conversa: esta story é a **parte 1** (pedido → copy/roteiro
no formato certo). A **parte 2** (gerar a ARTE com o motor de imagem +
referências do Kit) é a próxima story. Decisões fechadas com o Marcos:
- **Reel** = a Lídia entrega ROTEIRO de gravação + legenda (o vídeo é humano).
- `arte_url` continua aceitando link externo como plano B; o rótulo "Canva" saiu.
- Ordem: copy primeiro (destrava o uso), arte depois.

## Entrega
1. **Mig 203**: `marketing_posts.formato` (estatico|reel|story|carrossel),
   `pedido` (diretriz original — insumo do futuro "Refazer") e `roteiro`.
   Aplicada em prod e dev — e de quebra descobrimos que dev não tinha NEM a
   tabela (mig 193 nunca aplicada lá); 193+203 aplicadas.
2. **Flow `generateMarketingPostFromRequest`** (packages/ai): prompt com o
   pedido + Kit de Marcas (voz/diretrizes/briefing, MESMO shape da 75-238) +
   lista de ARQUIVOS do Kit (a Lídia cita o file_name na justificativa quando o
   pedido fala "usa a foto da fachada") + instruções POR FORMATO (estático =
   legenda completa; story = texto de tela ≤40 palavras, TELA 1/2; carrossel =
   legenda + CARD 1..N; reel = legenda + roteiro OBRIGATÓRIO cena a cena).
   Regras: diretriz vence o PEDIDO (usuário pedir "promete 20%" → reformula e
   explica); escopo por marca; parse defensivo (reel sem roteiro = null).
3. **Endpoint `POST /api/marketing-posts/pedir`** (marketingGuard, maxDuration
   90): valida pedido (≤2000 chars)/formato/canal, property ativa da org, Kit
   escopado (institucional + a marca DO empreendimento — post institucional só
   leva a institucional), assets no mesmo escopo; insere com status='sugerido',
   origem='agente', created_by. Data do humano vence a sugerida pelo modelo.
4. **UI**: "+ Novo post" abre o modal **"Pedir à Lídia"** (textarea do pedido +
   empreendimento/formato/canal/data); "Prefiro escrever manualmente" leva ao
   form antigo (agora "Novo post (manual)", com campo de roteiro quando reel e
   arte como "link externo"). Cards ganham badge de FORMATO, o pedido original
   em itálico e o roteiro em `<details>` 🎬.

## Arquivos
- `supabase/migrations/203_marketing_posts_formato_pedido.sql`
- `packages/ai/src/flows/marketing-post-request.ts` (+ `.test.ts`), `flows/index.ts`
- `packages/web/src/app/api/marketing-posts/pedir/route.ts` (novo)
- `packages/web/src/app/api/marketing-posts/route.ts`, `[id]/route.ts`,
  `generate/route.ts` (POST_SELECT com os campos novos)
- `packages/web/src/lib/marketing/posts.ts` (+ `posts.test.ts`)
- `packages/web/src/app/dashboard/campaigns/agente/agente-client.tsx`

## QA Results
Quinn: **CONCERNS** (1 medium + 5 low + 2 info) — **todos os acionáveis
resolvidos neste ciclo**:
1. *(medium)* o escopo dos ASSETS usava um critério próprio (`property_id`) em
   vez de derivar das marcas já escopadas → arquivo de marca "órfã"
   (empreendimento sem property vinculada) vazava p/ post de outra marca e a
   Lídia podia citar a fachada errada → helper `scopeBrandsForPost` em
   lib/marketing/brands.ts (testado: 4 casos) e assets casados por `brand_id`
   do MESMO conjunto.
2. *(low)* lógica de escopo sem teste → extraída e coberta (item 1).
3. *(low)* whitelist de formato duplicada em 5 lugares + export morto →
   fonte client-safe única em lib/marketing/posts.ts (`MARKETING_POST_FORMATOS`
   + `FORMATO_LABELS`); o flow em @trifold/ai mantém cópia própria DOCUMENTADA
   (importar de lá arrastaria o SDK pro bundle client); export morto removido.
4. *(low)* form manual sem seletor de formato + trocar do "Pedir" pro manual
   descartava o texto digitado → seletor adicionado (roteiro abre quando reel,
   inclusive no create) e o pedido vira rascunho da copy ao trocar de modo.
5. *(low)* comentários defasados → docstring do `isMarketingPostEditable`,
   COMMENT corretivo do `created_by` na própria 203 (re-aplicada em prod+dev)
   e contagem de testes corrigida nesta story.
6. *(low)* pedido de 2000 chars empurrava o card → `line-clamp-2` com o texto
   completo no title.
7. *(info, aceito)* injeção via pedido: autor é interno (marketingGuard), sem
   tool use, única escrita é status='sugerido', publicação 100% humana.
8. *(info)* /pedir busca todos os assets da org sem limit — folgado hoje;
   revisitar se o Kit passar de ~200 arquivos.

Verificado por ele: shape do join PostgREST testado contra prod; validações do
endpoint; parse defensivo (reel sem roteiro → 502 sem inserir); posts legados
(formato NULL) não quebram; POST manual/transições/`/generate` sem regressão;
estados dos modais sem vazamento.

## Validação
- Suíte 1308/1308 (13 testes novos: 7 do flow, 2 do validador, 4 do escopo do Kit) · tsc limpo nos 2 pacotes · build OK.
- Migs 193 (dev) e 203 (prod+dev) aplicadas e conferidas.

## Fora de escopo (registrado)
- Gerar a ARTE (motor Vertex + referências do Kit) — próxima story.
- Botão "Refazer" com feedback sobre um post existente (o campo `pedido` já
  guarda o insumo).
- Publicação automática — segue inexistente por decisão de produto.
