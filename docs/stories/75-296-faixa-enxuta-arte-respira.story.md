# Story 75-296 — A arte respira: faixa enxuta no pago + CTA na banda do logo

**Story ID:** 75-296
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M (~5 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** UX fix (SDC YOLO) — feedback do Marcos no smoke da 75-295 ("olha o tamanho da tarja")

## O problema (medido na geometria real)

No 1:1, a pilha título(0.11) + subtítulo(0.062) + CTA(0.05) + banda do logo(0.12) + respiros
fecha em **~40% da peça** — a imagem, que é o que para o scroll, ficou espremida. Agravante no
tráfego pago: o Meta renderiza headline e botão de CTA **fora da imagem** (e a 75-294 já gera
os dois), então a arte paga duplicava informação e pagava metade da peça por isso.

## O fix — 3 mudanças

- [x] **AC1 — pago = faixa enxuta**: `destino='pago'` ⇒ specs com `cta: null` e
      `subtitulo: null` (arte = imagem + título curto + logo; CTA vira o botão do anúncio e o
      detalhe vai no primary text). `arte_cta` persiste null no post pago.
- [x] **AC2 — CTA divide a banda do logo** (orgânico): a pílula deixa de ser um andar próprio —
      entra NA banda inferior, à esquerda (largura 0.46, margem 8%), com o logo alinhado à
      DIREITA quando há CTA (novo param de `composeLogo`; sem CTA, centralizado como sempre).
      `faixaLayout` passa a empilhar o texto direto sobre `logoBox().bandTop` — um andar e um
      respiro a menos para TODO post com CTA.
- [x] **AC3 — tipografia proporcional nos quadrados**: PILHA do 4:5 (título 0.1→0.085, sub
      0.058→0.05) e do 1:1 (0.11→0.09, 0.062→0.052). O 9:16 fica como está.
- [x] **AC4 — fração final** (título+sub+CTA, 1:1): ~40% → **~30%**; pago (título+logo, 1:1):
      **~25%**; pago 9:16: **~18%**. `fracaoReservada` continua vindo do layout (fonte única —
      o prompt reserva exatamente o que a composição cobre).
- [x] **AC5 — testes**: geometria pura atualizada (empilhamento sem andar de CTA, CTA dentro da
      banda, logo à direita com CTA, frações-alvo) + rota (pago zera cta/subtitulo nos specs);
      suíte/type-check/lint verdes.

## Fora do escopo

Gradiente no lugar de faixa sólida · arte pago SEM título nenhum (avaliar depois do próximo
smoke visual) · reposicionar título para topo.

## File List

- `packages/web/src/lib/marketing/arte-faixa.ts` (PILHA dos quadrados + baseTexto = bandTop)
- `packages/web/src/lib/marketing/arte-cta.ts` (ctaBox dentro da banda, à esquerda)
- `packages/web/src/lib/marketing/arte-logo.ts` (logoPosition/composeLogo com alinhamento)
- `packages/web/src/lib/marketing/arte-service.ts` (logo à direita quando há CTA)
- `packages/web/src/app/api/marketing-posts/pedir/route.ts` (pago zera cta/subtitulo)
- testes dos 4 módulos + `route.pago.test.ts`

## QA Results (@qa)

**Gate: CONCERNS** — geometria provada por teste puro (frações-alvo asseridas); o que o gate
não prova é o RESULTADO VISUAL (satori/sharp renderizando) — validação final = novo pedido
pago do Marcos + um orgânico com CTA para conferir a banda dividida.

## Change Log

- 2026-08-11 — @sm→@dev→@qa (YOLO): 3 mudanças, frações medidas antes/depois na própria
  geometria. Pendência: smoke visual (pago E orgânico com CTA).
