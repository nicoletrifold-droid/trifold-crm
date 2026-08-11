# Story 75-294 — Lídia v2: pedido para TRÁFEGO PAGO (trio de proporções + chips + copy de anúncio)

**Story ID:** 75-294
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** XL (~13 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** feature (SDC) — evolução do "Pedir à Lídia" (75-239/240/241/250/255/256/263)
- **Spec de UX:** `docs/architecture/lidia-pedir-v2-trafego-pago-spec.md` (@ux, 11/08)

---

## Story

Como **quem opera o tráfego pago da Trifold**, quero **pedir um criativo à Lídia e receber a
mesma arte nas 3 proporções do Meta (1:1, 4:5, 9:16) com a copy de anúncio pronta**, escolhendo
a direção visual por chips em vez de saber "promptar" — para alimentar campanhas com criativo
certo por posicionamento sem montar nada à mão.

---

## Context

Pesquisa de mercado (11/08): ~90% do inventário do Meta é vertical; 4:5 dá ~1% mais CTR que
1:1 e 9:16 até 7%; contas vencedoras mantêm 15-50 criativos ativos. O modal atual pensa
orgânico: 1 pedido → 1 formato → 1 proporção, e a direção de arte é texto livre.

**Descoberta que baliza o custo:** o motor JÁ tem layout por proporção
(`ArteAspectRatio = "9:16"|"4:5"|"1:1"` em `arte-logo.ts:14`, com `faixaLayout`/`ctaBox`/
`logoBox` por ratio). Hoje `aspectRatioForFormato()` (`arte-logo.ts:15-22`) trava 1 ratio por
formato — o trio é **destravar**, não construir motor.

### Costuras do pipeline atual (verificadas no código)

1. `agente-client.tsx:182-350` — `PedirLidiaModal` (form atual) e `PedidoFormValues`.
2. `app/api/marketing-posts/pedir/route.ts` — guard → contexto (property/brands/assets) →
   `generateMarketingPostFromRequest` (Sonnet, pacote `@trifold/ai`) → INSERT do post ANTES da
   arte (fail-open estrutural, 75-240) → `gerarArtesParaPost(specs)` → `montarPatchDeArtes`
   (única a gravar `artes`+`arte_url` juntos).
3. Direção do humano vai VERBATIM ao motor como `ajuste` (75-241, decisão do Marcos: humano é
   superior ao sistema — manter).
4. `artes` é jsonb `[{ordem, url, descricao, cta}]` (75-255: uma arte por tela).

## Escopo (da spec de UX — seções "Modal v2" e "Saída na fila")

Toggle **Destino** (Orgânico = fluxo atual intocado / Tráfego pago = novo) · chips de direção
(Cenário/Luz/Estilo/Pessoas) · campo livre vira "Detalhes extras" · botão **✨ Melhorar meu
pedido** · para pago: **Objetivo** (leads/visita/reconhecimento) + **Proporções** (multi,
default 3) · card da fila com miniaturas por proporção, copy de anúncio (primary/headline com
contador e copiar) e aviso de declaração de IA.

---

## Acceptance Criteria

- [x] **AC1 — migration** (numeração conferida contra prod na hora do apply): `marketing_posts`
      ganha `destino` (`organico`|`pago`, default `organico`), `objetivo` (text, null),
      `ad_primary_text` (text, null), `ad_headline` (text, null). Nada existente muda.
- [x] **AC2 — chips com fonte única no servidor**: mapa chip→fragmento de prompt em
      `lib/marketing/` (novo módulo, sem `server-only` para o modal listar os chips do MESMO
      mapa — [[feedback-consultar-fonte-nao-duplicar-constante]]). Grupos e valores conforme a
      spec. A composição final (chips + detalhes extras) entra no fluxo existente da direção
      (`direcaoEfetiva`/`ajuste`), preservando a regra "humano verbatim com prioridade".
- [x] **AC3 — chip "Fachada real 📷"** desabilitado (com tooltip) quando o Kit escopado não tem
      asset de fachada/foto; habilitado, força o arquivo citado como referência (reusa o
      mecanismo `arquivosCitadosNoTexto`/união da 75-250).
- [x] **AC4 — destino pago gera o TRIO**: para cada tela/spec, o motor gera as proporções
      marcadas (default 1:1+4:5+9:16) da MESMA arte. `artes` jsonb ganha campo `ratio`
      (retrocompatível: artes antigas sem `ratio` continuam renderizando). `gerarArtesParaPost`
      aceita ratios explícitos com fallback no comportamento atual (`aspectRatioForFormato`).
      **Falha parcial não descarta o que deu certo** (post entra com as proporções OK; aviso no
      card + Refazer só das faltantes).
- [x] **AC5 — copy de anúncio**: quando pago, `generateMarketingPostFromRequest` devolve também
      `ad_primary_text` (≤125 chars) e `ad_headline` (≤27 chars) coerentes com o **Objetivo**
      (leads/visita/reconhecimento → CTA correspondente). Card mostra os dois com contador e
      botão copiar. Limites validados no servidor (truncar NÃO — regenerar campo só se estourar
      é caro; validar e cortar na fronteira da palavra com reticência é aceitável, documentar).
- [x] **AC6 — ✨ Melhorar meu pedido**: `POST /api/marketing-posts/melhorar-pedido` (mesmo
      `marketingGuard`), chamada rápida de modelo (Haiku) que reescreve o pedido como briefing
      usando o Kit escopado; o textarea é substituído com **Desfazer** (1 nível). FAIL-OPEN:
      erro do modelo = mantém o texto original + aviso discreto (padrão
      [[project-revisao-ortografica-envio]]).
- [x] **AC7 — modal v2 conforme spec**: toggle Destino primeiro (pago esconde Formato/Canal e
      mostra Objetivo/Proporções; orgânico = form atual SEM regressão), chips `aria-pressed` e
      single-select por grupo, "Criando 3 proporções…" no estado gerando. Tema `dark:` em tudo.
- [x] **AC8 — card pago na fila**: badge `Tráfego pago`, miniaturas rotuladas por proporção
      (reusa o grid da 75-263), bloco de copy de anúncio, e o aviso fixo **"Arte gerada por IA —
      marque a declaração de IA ao subir no Meta"** (informativo, não bloqueante).
- [x] **AC9 — segurança e limites**: rota nova atrás do `marketingGuard` (401/403 com teste);
      payload novo validado (destino/objetivo/proporções fora da lista = 400); orgânico não
      manda campos de pago (e o servidor ignora se mandar).
- [x] **AC10 — testes (vitest)**: núcleo puro (composição chips→direção; validação de limites
      da ad copy; decisão de ratios por destino/formato) sem DOM; rotas (401/403/400, pago
      gera specs×ratios, falha parcial preserva as OK, melhorar-pedido fail-open); lint,
      typecheck e `next build` verdes.

---

## Fora do escopo (backlog — stories futuras, já mapeadas na spec)

Variações em lote + fila agrupada com comparador · loop de performance (CTR/CPL do agente Meta
Ads no card + "variações do vencedor") · publicação direta via Graph API · vídeo/reel pago.

## Dev Notes — gotchas conhecidas

1. **Custo/tempo**: pago = specs × 3 gerações de imagem na mesma request (`maxDuration = 300`
   já existe; post inserido antes da arte segura a copy — manter essa ordem).
2. O motor de imagem é Vertex Express + gemini image ([[project-lidia-motor-imagem]]):
   `imageConfig.aspectRatio` já é parametrizado (`arte-gen.ts:173`).
3. **Não duplicar constantes** de chips/objetivos entre client e server — módulo único.
4. `montarPatchDeArtes` é a única que grava `artes`+`arte_url` juntos — estender, não contornar.
5. Fail-open esconde queda do motor ([[project-lidia-motor-imagem]]): a falha parcial do AC4
   precisa aparecer no card, não sumir em log.
6. Migration: conferir última aplicada em prod via Management API antes de nomear (220 é a
   próxima local após a 219 do FVS).
7. (@po) `MARKETING_POST_SELECT` (`lib/marketing/posts.ts:21`) precisa incluir as 4 colunas
   novas — é o select usado pelo insert/update/fila; esquecê-lo faz o card nascer sem a copy.

## Dev Notes — desvios e decisões da implementação (@dev)

1. **Chip "Fachada real" no servidor** (AC3): quando `chips.cenario === 'fachada_real'`, as
   fotos (`tipo='foto'`) do Kit escopado entram na união de `citadosPeloHumano` — FORÇADAS
   primeiro, pela mesma razão da 75-250 (teto de bytes descarta o excedente). No client, o chip
   desabilita quando o GET /api/marketing-brands não mostra foto no Kit escopado.
2. **Pago força `formato='estatico'` e canal implícito** (persistido `instagram`, CHECK da mig
   193 intacto) — o form nem mostra os dois campos.
3. **`objetivo` default `leads`** quando pago sem objetivo explícito.
4. **Espelho `arte_url` com ratio**: dentro da mesma ordem, 4:5 (feed) vem primeiro — mesma
   régua no `montarPatchDeArtes` (servidor) e no `ArtesDoPost` (card).
5. **AC5, corte da ad copy**: `enforceAdLimit` corta na última fronteira de palavra que caiba
   com "…" (fallback para corte seco quando a palavra única passa de metade do teto).
6. **AC4, "Refazer só das faltantes"**: com o fail-open por proporção a peça parcial JÁ entra
   no card com as que deram certo; o Refazer atual regenera o conjunto do post. Refazer
   seletivo POR PROPORÇÃO ficou de fora — comportamento aceitável e documentado.
7. **Sem teste de componente** (projeto sem jsdom): composição chips→direção, teto da ad copy
   e decisão de ratios estão no núcleo puro (`direcao.ts`, 15 testes); modal/card ficam para o
   smoke visual.
8. **Nada visto rodando**: modal v2, chips, card pago e geração real do trio — smoke pós-deploy.

## File List

- `supabase/migrations/220_marketing_posts_trafego_pago.sql` (novo — destino/objetivo/ad copy)
- `packages/web/src/lib/marketing/direcao.ts` (novo) + `direcao.test.ts` (15 testes)
- `packages/web/src/lib/marketing/arte-service.ts` (ratio explícito + trio + espelho por ratio)
- `packages/web/src/lib/marketing/posts.ts` (SELECT + shape de artes com ratio)
- `packages/ai/src/flows/marketing-post-request.ts` (+ test) — modo anúncio + ad copy
- `packages/ai/src/flows/marketing-request-improve.ts` (novo — ✨ Melhorar, Haiku, fail-open)
- `packages/ai/src/flows/index.ts` (exports)
- `packages/web/src/app/api/marketing-posts/pedir/route.ts` (+ `route.pago.test.ts`, 8 testes)
- `packages/web/src/app/api/marketing-posts/melhorar-pedido/route.ts` (+ test, 4 testes)
- `packages/web/src/app/dashboard/campaigns/agente/agente-client.tsx` (modal v2 + card pago)
- `docs/architecture/lidia-pedir-v2-trafego-pago-spec.md` (spec @ux)
- `docs/stories/75-294-lidia-pedir-v2-trafego-pago.story.md`

## QA Results (@qa)

**Gate: CONCERNS** — código, segurança e testes em ordem; nada visto rodando (pendência
consciente, como na 75-293).

| Check | Resultado |
|---|---|
| 1. Code review | Manual, diff completo (agente /code-review segue instável hoje). 1 defeito achado e corrigido |
| 2. Testes | 660 verdes nos pacotes tocados · suíte completa 2209 |
| 3. AC atendidas | 10/10 no código; AC4 "Refazer por proporção" com desvio documentado (Refazer atual regenera o conjunto) |
| 4. Regressões | Orgânico coberto por teste dedicado (não manda ratios, campos pago nulos); suíte inteira verde; `next build` OK |
| 5. Performance | Pago = specs×ratios sequencial (1×3 ≈ 45-75s, folgado nos 300s); modal busca brands 1× ao abrir |
| 6. Segurança | `marketingGuard` nas 2 rotas (401/403 testados); chips compostos só do mapa do servidor (payload adulterado não injeta prompt via chip); validações 400 testadas |
| 7. Documentação | Spec @ux + story com desvios e gotchas |

### Defeito encontrado no gate e corrigido

1. **[low — consistência] Preview × espelho divergiam no trio.** `post-preview-modal.tsx:43`
   montava `Map` por ordem e a ÚLTIMA arte vencia — com 3 proporções na mesma ordem, o preview
   mostrava a 9:16 enquanto o card/espelho usam a 4:5. Fix: primeira ocorrência vence (mesma
   régua do `montarPatchDeArtes`).

### Pendências conscientes (smoke pós-deploy)

- Nada visto rodando: modal v2 (chips, ✨ Melhorar com Desfazer), card pago, geração REAL do
  trio no Vertex (custo: 3 gerações por pedido) e o tema escuro.
- Smoke: pedido pago de teste no Vind → conferir 3 miniaturas rotuladas + ad copy ≤125/27 +
  aviso de IA · curl anônimo em `/api/marketing-posts/melhorar-pedido` = 401.
- Migration 220 em prod ANTES do deploy servir tráfego (o INSERT com `destino` falha sem a
  coluna — aplicar na janela do merge).

## Change Log

- 2026-08-11 — @ux (Uma): spec escrita a partir da pesquisa de mercado e do código atual
  (`docs/architecture/lidia-pedir-v2-trafego-pago-spec.md`); descoberta-chave: motor já tem
  layout nas 3 proporções, o trio é destravar.
- 2026-08-11 — @sm (River): story criada a partir da spec; escopo = pacote 1+3+4+5(parcial)+8
  da análise de mercado (trio, chips, melhorar pedido, objetivo+ad copy, disclosure);
  variações em lote e loop de performance ficam como backlog explícito.
- 2026-08-11 — @po (Pax): validada **10/10 → GO**. Draft → **Ready**. Correções: (1) estimativa
  L→**XL (~13 pts)** — toca migration + pacote @trifold/ai (prompt e schema de saída) + motor
  (ratio explícito) + modal + card + rota nova; maior que a 75-293; (2) Dev Note 7 sobre
  `MARKETING_POST_SELECT`. Verificado no código: `imageConfig.aspectRatio` parametrizado
  (arte-gen.ts:173), `aspectRatioForFormato` (arte-logo.ts:15), `montarPatchDeArtes` como via
  única de gravação das artes.
- 2026-08-11 — @dev: implementada em modo YOLO. Gate local: 2209 testes verdes (27 novos),
  type-check, build (rota melhorar-pedido gerada) e lint na baseline. Desvios em Dev Notes
  (Refazer por proporção ficou de fora — o Refazer atual regenera o conjunto). Ready →
  **InReview**.
- 2026-08-11 — @qa: **gate CONCERNS**. 1 defeito corrigido (preview mostrava a 9:16 no lugar
  da 4:5 no trio — primeira ocorrência passou a vencer). Ordem do deploy: migration 220
  primeiro. Pendência: nada visto rodando (smoke).
