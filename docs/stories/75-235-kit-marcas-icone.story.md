# Story 75-235 — Kit de Marcas: Ícone como categoria própria de arquivo

**Status:** Done
**Tipo:** Feature (pequena)
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** S

## Contexto
Pedido do Marcos (30/07), olhando o modal da marca: *"onde adiciona ícones? Não
tem o campo, temos que ter pois cada marca tem seu ícone"*. Até aqui o ícone só
cabia em **Elemento gráfico**, o que mistura o símbolo da marca com grafismos
soltos — e a Lídia, quando for gerar arte, precisa saber qual arquivo é o ícone.

## Entrega
- `marketing_brand_assets.tipo` aceita `'icone'` (mig 200, idempotente).
- Seletor de tipo do upload ganha **Ícone**; grade de arquivos ganha o grupo
  **Ícones** (mesma UX das outras categorias: variação, exclusão, contagem).
- Miniatura do card da marca: logo e, **na falta dele, o ícone** (`brandThumb`).
- Aceita PNG/JPG/WEBP/SVG (mesma whitelist de imagem), máx. 10 MB.

### Hardening vindo do QA
A união de tipos de asset estava repetida em 4 pontos da UI — `tsc` passava sem
o tipo novo aparecer na tela (exatamente a classe de bug que esta story
conserta). Agora seletor e grade derivam de `BRAND_ASSET_IMAGE_TIPOS` +
`BRAND_ASSET_LABELS` (em `lib/marketing/brands.ts`), e `BrandAsset.tipo` usa
`MarketingBrandAssetTipo`: **tipo novo aparece na tela sem edição manual**.

## Arquivos
- `supabase/migrations/200_marketing_brand_assets_icone.sql`
- `packages/web/src/lib/marketing/brands.ts` (+ `brands.test.ts`)
- `packages/web/src/app/dashboard/campaigns/agente/marcas-section.tsx`

## QA Results
Quinn: **CONCERNS** (2 low, nada bloqueante) — ambos resolvidos neste ciclo:
1. *(low, code)* união de tipos duplicada em 4 lugares → derivada de
   `brands.ts` (ver Hardening acima).
2. *(low, docs)* story sem arquivo em `docs/stories/` → este documento.

Verificado por ele: coerência do tipo novo em todos os pontos (rotas `/assets` e
`/assets/sign` são agnósticas de tipo, validam por `isValidBrandAssetTipo` +
`isAllowedBrandAssetFile`; DELETE só tem caso especial de `fonte`); zero
regressão nos fluxos 75-229/230/232/234; `fonte` não vaza para a grade de
imagens; mig 200 só **alarga** o CHECK (dados existentes em prod = 1 logo).

Observação registrada (não é bug): não existe UI para **reclassificar** um asset
já enviado — ícone que a equipe suba como "Elemento gráfico" antes deste deploy
segue nesse grupo até ser reenviado como Ícone.

## Validação
- Suíte 1278/1278 · `tsc --noEmit` limpo · eslint limpo · `next build` OK.
- ✅ LIVE: PR #310 squash-merged (`f1e658e2`), deploy de produção concluído.
- Mig 200 aplicada em **prod** (dsopqkqjkmhytudaaolv) e **dev**
  (xnxvygyfyyyzwhiuoehz); CHECK conferido nos dois:
  `logo, icone, foto, elemento, fonte`.
