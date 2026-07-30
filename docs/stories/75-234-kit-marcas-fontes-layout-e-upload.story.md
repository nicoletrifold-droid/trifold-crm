# Story 75-234 — Kit de Marcas: conserto do layout de Cores/Fontes + upload do arquivo da fonte

**Status:** InReview
**Tipo:** Bug + Feature
**Epic:** Agente de Marketing (Lídia)
**Complexidade:** M

## Contexto
Laura (social-media) travou no modal "Editar marca — Vind Residence": ao salvar,
o modal devolvia `fonte do papel "Montserrat" sem nome`.

**Causa raiz (🔥 GOTCHA Tailwind v4):** a base `inp` do modal já continha
`w-full`, e as linhas de Cores/Fontes tentavam estreitar campos com
`${inp} w-28` / `${inp} w-40`. No CSS gerado, `.w-full` é emitido DEPOIS de
`.w-28`/`.w-40` (confirmado compilando o Tailwind: w-28@4481, w-40@4533,
w-full@4585) — mesma especificidade, então **vence a ordem no arquivo, não a
ordem das classes no atributo**. Resultado: todo campo ficava 100%, a linha
estourava o modal e o segundo campo saía da tela. A Laura digitou "Montserrat"
no único campo visível — que era o *Papel* — e o servidor recusou por falta do
nome. As cores salvas em prod confirmam o sintoma: 3 cores, todas com
`nome: null` (o campo do papel também estava fora da tela).

Junto veio o pedido do Marcos: além do nome, permitir **subir o arquivo da
fonte**, como já existe nos outros campos do kit.

## Entrega

### 1. Bug do layout
- `inpBase` (sem largura) + `inp = inpBase + w-full`. Campos estreitos usam
  `${inpBase} w-28/w-36`; o campo elástico usa `min-w-0 flex-1` (sem `min-w-0`
  um flex item com conteúdo não encolhe).
- Linha de Fontes reordenada: **Nome da fonte primeiro**, Papel depois — quem
  digita no primeiro campo agora acerta o campo principal.
- Comentário no código explicando o gotcha, para não voltar.

### 2. Upload do arquivo da fonte (.ttf/.otf/.woff/.woff2)
- `marketing_brand_assets.tipo` aceita `'fonte'` (mig 199) e cada linha de
  `fontes` ganhou `asset_id` apontando para o arquivo.
- Botão "Anexar arquivo" por linha; chip com o nome do arquivo (link) + ✕.
  Nome da fonte é sugerido pelo arquivo ("Montserrat-SemiBold.ttf" →
  "Montserrat SemiBold").
- **Prévia real:** `@font-face` injetado com a fonte enviada — o campo do nome
  passa a ser renderizado na própria tipografia (confirma o upload na hora).
- `nome` deixa de ser obrigatório quando há arquivo anexado.
- Modo edição: arquivo E vínculo persistem NA HORA (autosave de `fontes` via
  PATCH + `onFontesChanged` no pai) — fechar no ✕ não perde o arquivo, mesmo
  padrão do `onAssetsChanged` (QA 75-229). Linhas incompletas ficam fora do
  autosave: o erro delas cabe ao Salvar explícito.
- Modo criação: arquivo entra na fila indexada pela linha (`fonteIndex`), sobe
  após o "Criar marca" e o vínculo entra num PATCH (o POST não pode referenciar
  asset inexistente). Fontes não aparecem na lista genérica "Aguardando criação".

### 3. Segurança
- Bucket passou a aceitar mime de fonte — inclusive `application/octet-stream`,
  porque navegador reporta .ttf/.otf de forma inconsistente. Logo a **extensão**
  virou a barreira real: `isAllowedBrandAssetFile(tipo, fileName)` valida em
  `/assets/sign` E no registro `/assets` (imagem só extensão de imagem, fonte só
  ttf/otf/woff/woff2).
- PATCH confere que todo `asset_id` referenciado é asset `tipo='fonte'` **desta**
  marca/org; POST zera `asset_id` (marca ainda não tem assets).
- `sanitizeFontes` solta vínculo com arquivo já excluído — sem isso o Salvar
  travaria com "Arquivo de fonte não encontrado nesta marca".

## Arquivos
- `supabase/migrations/199_marketing_brands_fonte_arquivo.sql` (idempotente)
- `packages/web/src/lib/marketing/brands.ts` (+ `brands.test.ts`)
- `packages/web/src/app/dashboard/campaigns/agente/marcas-section.tsx`
- `packages/web/src/app/api/marketing-brands/route.ts`
- `packages/web/src/app/api/marketing-brands/[id]/route.ts`
- `packages/web/src/app/api/marketing-brands/[id]/assets/route.ts`
- `packages/web/src/app/api/marketing-brands/[id]/assets/sign/route.ts`

## QA Results
Quinn: **CONCERNS** (3 medium + 4 low) — **todos corrigidos no mesmo ciclo**:
1. *(medium)* `setFontes(next)` com array de closure velha revertia o que a
   usuária digitava durante o upload → `fontesRef`/`assetsRef` viraram a fonte
   da verdade de toda mutação e de todo payload de rede (`applyFontes`,
   `applyAssets` aceitam updater funcional).
2. *(medium)* o autosave mandava só as linhas "salváveis" e o PATCH substitui o
   array inteiro → uma fonte já salva que estivesse sendo reescrita sumia do
   banco calada. Agora o autosave manda o MESMO payload do Salvar; se alguma
   linha estiver incompleta o servidor recusa e a mensagem aparece na hora
   ("Arquivo enviado, mas as fontes não foram salvas… clique em Salvar").
3. *(medium)* upload de imagem e de fonte tinham guards independentes e um
   sobrescrevia o `assets` do outro (chegando a zerar um vínculo válido no
   `sanitizeFontes`) → laço de imagens passou a somar via updater sobre o ref.
4. *(low)* falha no PATCH de vínculo pós-criação deixava asset de fonte órfão e
   invisível → rollback (exclui os arquivos) + `DELETE /assets/[assetId]` agora
   limpa `fontes[].asset_id` no servidor.
5. *(low)* a barreira de extensão tinha estreitado imagens → `jfif`/`jpe` de
   volta na whitelist.
6. *(low)* `application/octet-stream` **removido** do bucket: o cliente passou a
   mandar o mime canônico derivado da extensão (`mimeForBrandAssetFile`), então
   o bucket público não aceita mais bytes arbitrários. Migração re-aplicada em
   prod e dev (13 mime types, sem octet-stream).
7. *(low, aceito como debt)* a checagem de posse do asset no PATCH e o gate de
   extensão no registro `/assets` não têm teste automatizado — o repo não tem
   infra de teste de rota (só `lib/*.test.ts`). Helpers puros cobertos.

Verificado por ele também: idempotência da 199 contra os dados reais, CORS do
Storage (a prévia `@font-face` funciona), zero regressão no fluxo de imagens
(75-229/230/232), e varredura do gotcha Tailwind no repo — nenhum outro
`${base} w-N` com `w-full` na base.

## Validação
- Suíte: 1277/1277 · `tsc --noEmit` limpo · eslint limpo · `next build` OK
  (rodados antes e DEPOIS das correções de QA).
- Migração 199 aplicada em **prod** (dsopqkqjkmhytudaaolv) e **dev**
  (xnxvygyfyyyzwhiuoehz) via Management API; CHECK e `allowed_mime_types` (13
  tipos, sem octet-stream) conferidos nos dois.
- Pendente: teste real da Laura (subir a Montserrat na marca Vind Residence e
  preencher o papel das 3 cores, que ficaram `null` por causa do bug).
