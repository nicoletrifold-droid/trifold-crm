# Story 75-240 — Gerar ARTE no Pedir à Lídia (motor de imagem + Kit de Marcas)

**Status:** InReview
**Tipo:** Feature
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M

## Contexto
Parte 2 do redesenho combinado com o Marcos (30/07): o "Pedir à Lídia" (75-239)
entregava copy/roteiro e só DESCREVIA a arte. Motor validado ao vivo antes de
codar: gemini-3.1-flash-image via Vertex Express gerou um story 9:16 real do
Vind (logo do Kit aplicado, paleta #11220F/#8FE6A7, texto PT perfeito,
`~/Downloads/teste-lidia-story-vind.png`, ~R$0,60 e ~15s por arte).

## Entrega
1. **Contrato do Sonnet ganhou o bloco `arte`** (marketing-post-request):
   `descricao` = direção de arte completa (composição, clima, paleta com os HEX
   da marca e o TEXTO EXATO da arte) + `arquivos_kit` = file_names do Kit a usar
   como referência. Reel nunca tem arte; bloco tolerante (sem descrição = sem
   arte, copy sobrevive).
2. **`lib/marketing/arte-gen.ts`** (helpers puros testados): aspect ratio por
   formato (story 9:16, estático 4:5, capa de carrossel 1:1), builder do prompt
   do motor (paleta obrigatória, tipografia, regras de PT, ajuste humano com
   prioridade) e a chamada Vertex (timeout 60s, parse defensivo).
3. **`lib/marketing/arte-service.ts`**: resolve o Kit escopado
   (`scopeBrandsForPost`), identidade visual = marca do empreendimento
   (institucional como fallback), referências = arquivos citados pelo Sonnet +
   logo/ícone da identidade SEMPRE (máx. 4; pula não-imagem, >8MB e download
   falho), gera, sobe no bucket e devolve URL pública. **FAIL-OPEN por
   contrato**: qualquer falha → null → post segue sem arte.
4. **Mig 204**: bucket público `marketing-artes` (10MB, png/jpg/webp; separado
   do marketing-brands — insumo ≠ produto) + `marketing_posts.arte_descricao` e
   `arte_arquivos` (insumos do Refazer). Aplicada em prod e dev.
5. **`/pedir` gera a arte** na mesma request (maxDuration 90→150; Sonnet ~30s +
   Vertex ~15-25s) e persiste arte_url/arte_descricao/arte_arquivos.
6. **`POST /api/marketing-posts/[id]/arte` — "Refazer arte"**: regenera com
   ajuste opcional (≤500 chars) SEM chamar o Sonnet (usa a arte_descricao
   persistida; post antigo/manual usa a copy como base). Guard: só
   sugerido/aprovado, formato com arte.
7. **UI**: arte aparece INLINE no card (clicável, abre em tamanho real; link
   externo continua link); botão **🎨 Refazer arte** em sugeridos e aprovados
   com campo de ajuste inline.
8. **Chave**: `VERTEX_API_KEY` no runtime; adicionada ao `.env.local` local.
   ⚠️ PENDENTE: gravar no Vercel (token expirado — aguardando `vercel login`
   do Marcos) e redeploy. Sem a chave o post nasce sem arte (fail-open + warn).

## Arquivos
- `supabase/migrations/204_marketing_artes_bucket.sql`
- `packages/ai/src/flows/marketing-post-request.ts` (+ `.test.ts`)
- `packages/web/src/lib/marketing/arte-gen.ts` (+ `.test.ts`), `arte-service.ts`
- `packages/web/src/app/api/marketing-posts/pedir/route.ts`
- `packages/web/src/app/api/marketing-posts/[id]/arte/route.ts` (novo)
- `packages/web/src/app/dashboard/campaigns/agente/agente-client.tsx`

## QA Results
Quinn: **CONCERNS** (5 medium + 9 low/info) — acionáveis resolvidos neste ciclo:
1. *(medium #1, o mais importante)* os timeouts somados (Sonnet 75s + 4
   downloads em série 60s + Vertex 60s) estouravam o maxDuration e a função
   morria ANTES do INSERT — perdendo a copy que custou uma chamada de Sonnet →
   **post inserido ANTES da arte** (fail-open estrutural), downloads em
   PARALELO e maxDuration 300 (padrão do repo). Refazer também 300 (#6).
2. *(medium #2)* logo em SVG passava no `startsWith("image/")` mas o Gemini
   recusa com 400 → uma marca com logo SVG NUNCA geraria arte → allowlist
   png/jpeg/webp nas referências.
3. *(medium #3)* 4 fotos citadas espremiam o logo pra fora dos slots → seleção
   reordenada: logo/ícone da identidade PRIMEIRO, sempre.
4. *(medium #4)* identidade tudo-ou-nada: Yarden (cores=[] em prod) saía sem
   paleta enquanto a Trifold tem 4 cores → fallback POR CAMPO (cores/fontes do
   empreendimento quando existem, senão institucional).
5. *(medium #5)* módulo mais arriscado sem teste → `selectArteReferencias`
   extraída pura + 4 testes (cobrindo #3, #7 e #10).
6. *(lows)* fonte .ttf não gasta mais slot nem download (#7); teto AGREGADO de
   7MB nas referências (#8); contentType normalizado pela extensão (#9);
   empate de file_name entre marcas resolve pela prioridade (#10); arte
   substituída é REMOVIDA do bucket no Refazer (#11); `VERTEX_API_KEY`
   documentada no deploy-flow (#13); `<img>` com fallback onError pro link e
   RefazerArteButton remonta no sucesso + input travado no busy (#14).
7. *(registrados, sem ação)* Refazer permitido em post APROVADO sem nova
   aprovação e sem trilha do ajuste (#12 — desenho aceito; publicação segue
   humana); custo ~R$0,60/clique fora dos coletores de billing; posts do
   "Gerar sugestões" não têm formato → sem botão Refazer (contornável pelo
   Editar) (#15); injeção via ajuste = risco aceito (rota gateada).

Verificado por ele: fail-open completo nos 7 caminhos de falha; bucket com
escrita só service-role e path por org; /generate com zero impacto; contrato
do Sonnet retrocompatível; modal Editar preserva arte_url.

## Validação
- Suíte 1317/1317 (9 testes novos: bloco arte no parse, helpers do arte-gen e
  seleção de referências) ·
  tsc limpo nos 2 pacotes · build OK.
- Motor validado end-to-end fora do app (arte real do Vind com logo do Kit).
- Mig 204 aplicada em prod e dev.

## Fora de escopo (registrado)
- Artes dos demais cards do carrossel (gera só a capa; equipe segue o estilo).
- Capa de reel.
- Regeneração da COPY (o "Refazer" é só da arte; refazer copy = novo pedido).
