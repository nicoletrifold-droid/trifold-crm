# Story 56-2 — Nicole envia mídia da biblioteca de forma contextual e inteligente

## Metadata
- **Status:** InReview
- **Epic:** 56 — Biblioteca de Mídia da Nicole
- **Branch:** story-56-2-nicole-envio-midia

## Context
Reportado (2026-07-10, com prints): lead **Carlos** (empreendimento **Vind**) pediu na conversa *"Se possível mais fotos, metragem e valor."* e a Nicole respondeu **só texto** (deu a metragem 66,91m², mas **não enviou nenhuma imagem**), mesmo com Planta, Fachada, Localização e fotos de lazer cadastradas para o Vind em `agent_media_assets`.

O envio de mídia pela Nicole **já existe** (Story 75-17: `sendLibraryMediaIfRequested`, chamado no path async do webhook WhatsApp logo após a resposta de texto). A investigação achou **por que não disparou** e outras lacunas:

1. **Detector estreito (causa raiz do caso Carlos):** `detectMaterialRequest` exige o par `materialNoun && sendIntent`. *"Se possível mais fotos"* casa `foto(s)` como noun, mas **não tem nenhuma palavra de `sendIntent`** (manda/quero/pode enviar/tem foto…) → retorna `null` → não envia. Pedidos educados/implícitos ("se possível", "gostaria de ver", "queria conhecer", "como é a área de lazer?", "onde fica?") passam batido.
2. **Sem inteligência de seleção:** pedido genérico faz `.limit(2)` **sem ordenação nem curadoria** → 2 assets arbitrários. Não monta combo (fachada+lazer+planta).
3. **Vocabulário pobre:** só conhece `planta`/`tabela`/`fachada`. Não casa **lazer** (piscina/academia/churrasqueira) nem **localização** — que hoje moram como `outro` com TÍTULO descritivo ("Piscina", "Localização", "Lazer").
4. **Áudio ignorado:** o webhook passa `text` ao helper, mas para voz `text = "[Mensagem de voz recebida]"` — o conteúdo real (transcrição) está em `asyncText`. Pedido de foto por áudio nunca dispara.
5. **Sem dedup:** pode reenviar o mesmo asset já mandado antes na conversa.

**Curadoria de dados (já feita 2026-07-10, prod):** no Vind, Academia/Brinquedoteca/Pilates/Piscina estavam erradamente como `category='planta'` (poluíam o pedido "planta") → movidos para `outro`. Hoje cada empreendimento tem 1 `planta` real + 1 `fachada`; lazer/localização em `outro` com título descritivo.

**Decisões (Marcos, 2026-07-10):** enviar direto quando o lead pede (não perguntar antes); teto **2–3 imagens por vez**; só do empreendimento identificado.

**Abordagem:** ADAPT do helper existente (`send-library-media.ts`) — sem tool-loop, sem reescrever o pipeline. Seleção inteligente por **categoria + título** (funciona com o dado atual, sem depender de expandir o enum).

## Acceptance Criteria
- [x] AC1 (caso Carlos): pedido educado/implícito de material ("se possível mais fotos", "gostaria de ver", "queria conhecer", "me mostra", "tem como ver") **dispara** o envio, sem exigir verbo de comando explícito.
- [x] AC2 (casamento intenção→acervo): "planta"→`planta`; "fachada/como é por fora"→`fachada`; "tabela/valores/preço"→`tabela`; "lazer/piscina/academia/churrasqueira/brinquedoteca"→assets de lazer (match por título); "onde fica/localização/endereço/mapa"→asset de localização (match por título).
- [x] AC3 (combo curado no genérico): "mais fotos"/"material" sem tipo específico → combo curado **fachada + lazer + planta** (o que existir), ordem determinística.
- [x] AC4 (teto): **no máximo 3** imagens por turno; nunca despeja o acervo.
- [x] AC5 (empreendimento): só envia do empreendimento identificado (`leads.property_interest_id`, fallback nome citado com match único). Sem empreendimento → não envia (o texto da Nicole conduz).
- [x] AC6 (áudio): o helper recebe o texto **resolvido** (`asyncText` — transcrição/caption), não o placeholder de voz.
- [x] AC7 (dedup): não reenvia asset já enviado antes nesta conversa (checa `messages.metadata.media_asset_id`).
- [x] AC8 (robustez/regressão): nunca lança; degrada com segurança (sem asset → 0 envios); respeita `is_active`; grava `messages` com `role='assistant'` + metadata `source='nicole_library'`; não altera stage do lead; não mexe no envio manual (📎) nem no texto da Nicole.

## Out of Scope
- **Expandir o enum de `category`** (`lazer`, `localizacao`) + dropdown/validação — melhora só cosmética da tela; a seleção por título já resolve. Fica como follow-up (precisa migration + UI + API juntos p/ não virar "botão que mente").
- **Proatividade pura** (enviar mídia sem o lead pedir).
- **Telegram e Portal:** não chamam o helper hoje; ficam como follow-up.
- Vídeos (segue image/pdf).

## Dependencies
- Reusa `agent_media_assets`/bucket `nicole-media` (Story 56-1), o call-site no `webhook/whatsapp/route.ts` (Story 75-17), `getSupabaseAdmin`.

## Complexity
- **T-shirt:** S/M (1 helper reescrito + testes + 1 linha no webhook). Blast radius contido: passo aditivo pós-texto.

## Business Value
Nicole passa a entregar as imagens certas quando o lead pede — inclusive em pedidos educados e por áudio — sem depender do corretor. Aumenta conversão e reduz atrito no momento de maior interesse.

## Risks
- **Falso positivo** (enviar quando o lead não pediu): mitigado por sinal de pedido + guarda de negação ("não quero foto", "recebi as fotos") + exigência de empreendimento identificado.
- **Enum não expandido:** lazer/localização casam por título; se um asset de lazer tiver título não-óbvio, pode não casar — aceitável (degrada, não quebra).

## Definition of Done
- AC1–AC8 atendidos; `tsc` + ESLint limpos; testes unitários do detector e da seleção verdes; QA gate PASS; push/deploy via @devops.

## File List
- `docs/stories/56-2-nicole-envio-midia-contextual.story.md` (this file)
- `packages/web/src/lib/ai/send-library-media.ts` (reescrita: detector rico + seleção contextual + dedup)
- `packages/web/src/lib/ai/send-library-media.test.ts` (novo — testes das funções puras)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (passa `asyncText` em vez de `text`)

## Dev Agent Record (@dev / Dex)
### Completion Notes
- **Causa raiz confirmada no código** (não hipótese): `detectMaterialRequest` exigia `materialNoun && sendIntent`; *"Se possível mais fotos"* não tinha `sendIntent` → retornava `null`. Reescrito como `detectMediaRequest` → lista de `MediaKind`, com tipos específicos auto-sinalizadores e "generic" exigindo sinal de pedido amplo (pega formas educadas/interrogativas/"mais").
- **Seleção contextual** (`selectAssets`, pura/testável): casa por **categoria + título** (lazer/localização casam por título, já que o enum não tem essas categorias), monta combo curado (fachada+lazer+planta) no genérico, teto de 3, ordem determinística (sort por categoria+título), dedup do que já foi escolhido e do que já foi enviado na conversa.
- **AC6:** webhook agora passa `asyncText` (transcrição/caption) ao helper — antes passava `text`, que para áudio é `"[Mensagem de voz recebida]"`.
- **AC7:** `loadAlreadySentIds` lê `messages.metadata.media_asset_id` da conversa (inclui envios manuais do corretor) e exclui da seleção.
- Assinatura pública `sendLibraryMediaIfRequested(admin, args)` inalterada; `detectMaterialRequest` mantido como wrapper de compat.
- **Regex fix durante o dev:** `\bvalores?\b` não casava "valor" (singular) → `\bvalor(?:es)?\b`.
- **Fora de escopo, confirmado:** expandir enum (`lazer`/`localizacao`) — desnecessário pro comportamento (match por título resolve); Telegram/Portal não chamam o helper.

### File List
- `docs/stories/56-2-nicole-envio-midia-contextual.story.md` (this file)
- `packages/web/src/lib/ai/send-library-media.ts` (reescrito)
- `packages/web/src/lib/ai/send-library-media.test.ts` (novo — 15 testes)
- `packages/web/src/app/api/webhook/whatsapp/route.ts` (passa `asyncText`)

## QA Results (@qa / Quinn)
- **Gate: PASS (com follow-up de validação real).**
- **Automatizado:** `send-library-media.test.ts` 15/15 verde (inclui caso Carlos ponta-a-ponta nas funções puras, falsos positivos, negação, dedup, combo, teto, determinismo). Suíte completa **863/863** (80 arquivos) — sem regressão. `tsc --noEmit` 0 erros. ESLint 0 avisos nos arquivos tocados.
- **Rastreabilidade:** AC1–AC8 cobertos por teste (AC5/AC8 parcialmente, pela natureza I/O — cobertos por revisão de código: guardas de empreendimento, try/catch, `is_active`, insert de `messages`).
- **Não testável headless (follow-up):** envio real via WhatsApp Cloud API. Recomendação: validar com o lead Carlos (ou lead de teste) no Vind — pedir "mais fotos, metragem e valor" e confirmar 2–3 imagens (fachada+lazer+planta) chegando, sem duplicar.
- **Risco residual baixo:** detector mais amplo pode, em casos raros, enviar mídia num "quase-pedido"; mitigado por guardas de negação/já-recebido + exigência de empreendimento identificado + dedup. Blast radius: passo aditivo pós-texto, nunca substitui a resposta.
