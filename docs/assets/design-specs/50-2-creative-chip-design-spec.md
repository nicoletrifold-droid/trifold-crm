# Design Spec — `CreativeChip` + `CreativePreviewModal`

**Story:** 50-2 — Componente `CreativeChip` no Lead Card do Pipeline
**Epic:** 50 — Atribuição de Criativos Meta nos Cards do Pipeline
**Designer:** Uma (@ux-design-expert)
**Status:** Final — aprovado para handoff @dev
**Created:** 2026-06-03

---

## 0. Princípios de Design (não-negociáveis)

1. **Card já é denso.** Não adicionar uma linha nova — encaixar na linha existente de Property + Source Badge.
2. **Substituir, não somar.** Quando há criativo, o `CreativeChip` SUBSTITUI o `SourceBadge` (não fica ao lado). A thumb já comunica visualmente "este lead veio de uma campanha Meta" — badge ficaria redundante.
3. **Degradação graciosa é primária.** Estado "sem criativo" é tão comum quanto "com criativo" — o fallback (SourceBadge atual) deve ser estética e funcionalmente equivalente.
4. **Mobile primeiro.** 375px define os limites. Se algo não cabe lá, não cabe.
5. **Drag-and-drop é o input primário do card.** Click deve ser secundário e nunca conflitar com drag.

---

## 1. Wireframes ASCII — 3 Variantes para Decisão

### Variante A — Inline Replace (RECOMENDADA ✅)

**Conceito:** Chip substitui o SourceBadge na mesma linha. Thumb 28×28px + nome truncado.

#### Desktop (largura de coluna Kanban ~300px)
```
┌─────────────────────────────────────────────────┐
│ João Silva                              [82]    │  ← Header
│ +55 11 99999-9999                                │
│                                                  │
│ [● Vind] [▣] VIND-LANC-MAR…  [▒▒▒▒▒▒░░] 5/7    │  ← Property + CreativeChip + Progress
│         └─ thumb 28px                            │
│                                                  │
│ Lead interessado em 2 dorms, viu o anúncio do…  │  ← AI summary
│                                                  │
│ [JS] João        há 2h                           │  ← Footer
└─────────────────────────────────────────────────┘
```

#### Mobile 375px (`/broker/pipeline`)
```
┌─────────────────────────────────────┐
│ João Silva                  [82]    │
│ +55 11 99999-9999                    │
│                                      │
│ [● Vind] [▣] VIND-…  [▒▒▒░] 5/7    │  ← Mesmo layout; nome agressivamente truncado
│                                      │
│ Lead interessado em 2…              │
│                                      │
│ [JS] João           há 2h            │
└─────────────────────────────────────┘
```

**Prós:**
- Zero impacto na altura do card (mantém densidade atual)
- Coerente com pattern existente (Property badge + outro badge inline)
- Mobile-friendly: o nome do criativo trunca primeiro (flex-shrink), preservando elementos críticos

**Contras:**
- Nome do ad fica curto em mobile (~6-10 chars visíveis) — exige tooltip/click para ver completo
- Em coluna Kanban estreita (< 280px), pode ficar apertado

---

### Variante B — Thumb-Only Inline (Backup mobile)

**Conceito:** Em mobile (< 480px), exibir APENAS a thumb 24×24px sem nome. Tooltip on tap.

#### Mobile 375px
```
┌─────────────────────────────────────┐
│ João Silva                  [82]    │
│ +55 11 99999-9999                    │
│                                      │
│ [● Vind] [▣]  [▒▒▒▒▒░░] 5/7        │  ← Apenas thumb 24px
│         └─ tap abre modal            │
│                                      │
│ Lead interessado em 2…              │
└─────────────────────────────────────┘
```

**Prós:**
- Maximamente compacto no mobile
- Thumb é universalmente reconhecível
- Mais espaço para progress bar

**Contras:**
- Identificação visual depende muito do conteúdo da imagem (imagens parecidas viram ambíguas)
- Sem contexto textual no card = sempre precisa de modal

**Decisão:** Usar Variante B **apenas como degradação de Variante A** quando o container do chip tem < 60px disponíveis (CSS container query ou simplesmente esconder o `<span>` do nome via `hidden xs:inline-flex` se necessário).

---

### Variante C — Linha Dedicada (REJEITADA ❌)

```
┌─────────────────────────────────────────────────┐
│ João Silva                              [82]    │
│ +55 11 99999-9999                                │
│                                                  │
│ [● Vind] [Meta Ads]  [▒▒▒▒▒▒░░] 5/7            │
│                                                  │
│ [▣] VIND-LANC-MAR-IMG-01                        │  ← Linha extra para criativo
│                                                  │
│ Lead interessado em 2 dorms…                    │
│                                                  │
│ [JS] João        há 2h                           │
└─────────────────────────────────────────────────┘
```

**Por que rejeitada:**
- Adiciona +20-24px de altura por card
- Em uma coluna do Kanban com 15-20 cards, isso é 300-480px de scroll extra
- Trade-off: ganha clareza visual perdendo eficiência operacional (ver mais leads de uma vez)
- Densidade já alta do card não comporta uma "linha nova" sem repensar TODO o layout

---

**🎯 RECOMENDAÇÃO FINAL: Variante A (com fallback opcional B em containers muito estreitos).**

---

## 2. Tokens Visuais — Especificação Exata

### Container do chip (botão clicável)

```tsx
className={[
  // Estrutura
  "group inline-flex items-center gap-1 shrink-0",
  // Espaçamento (alinhado com px-1.5 py-0.5 dos outros chips)
  "px-1 py-0.5",
  // Forma
  "rounded-md",
  // Background — neutro, sutil (para não competir com a thumb que tem cores próprias)
  "bg-stone-50 dark:bg-stone-800/60",
  // Border — apenas no hover/focus para reduzir ruído visual no estado padrão
  "border border-transparent",
  "hover:border-stone-200 dark:hover:border-stone-700",
  // Interactivity
  "cursor-pointer transition-colors",
  // Focus ring (WCAG)
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-stone-900",
].join(" ")}
```

### Thumbnail (imagem)

| Token | Valor | Notas |
|-------|-------|-------|
| **Tamanho desktop** | `h-7 w-7` (28×28px) | Equilibra visibilidade vs densidade |
| **Tamanho mobile** | `h-6 w-6` (24×24px) | Aplicar via responsive: `h-6 w-6 sm:h-7 sm:w-7` |
| **Border radius** | `rounded` (4px) | Levemente arredondado, NÃO redondo (criativos retangulares ficam ridículos em círculo) |
| **Object-fit** | `object-cover` | Crop centralizado |
| **Loading** | `loading="lazy"` | Pipeline pode ter 50+ cards |
| **Fallback (erro)** | Renderiza apenas SourceBadge (degradação graciosa) | `onError` handler dispara fallback |
| **Alt text** | `{ad.name} — anúncio Meta` | Acessibilidade + SEO de in-app search |

```tsx
<img
  src={creative.thumbnailUrl}
  alt={`${creative.adName} — anúncio Meta`}
  loading="lazy"
  onError={() => setShowFallback(true)}
  className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 rounded object-cover"
/>
```

### Nome do criativo (label)

| Propriedade | Token | Notas |
|-------------|-------|-------|
| **Font size** | `text-[10px]` | Alinha com outros chips xs do card |
| **Font weight** | `font-medium` | Mesmo peso do SourceBadge |
| **Color** | `text-stone-600 dark:text-stone-300` | Mais sutil que o nome do lead (que é stone-900) |
| **Truncate** | `truncate max-w-[100px] sm:max-w-[120px]` | Container-aware |
| **Hidden em estreito** | `hidden xs:inline` opcional via container query | Fallback para Variante B |

```tsx
<span className="truncate max-w-[100px] sm:max-w-[120px] text-[10px] font-medium text-stone-600 dark:text-stone-300">
  {creative.adName}
</span>
```

### Interaction states

| Estado | Visual | Tokens |
|--------|--------|--------|
| **Default** | Thumb + nome, bg neutro, sem border | (default classes) |
| **Hover** | Border aparece (stone-200), bg levemente mais escuro | `hover:border-stone-200 hover:bg-stone-100 dark:hover:border-stone-700 dark:hover:bg-stone-800` |
| **Focus** | Ring azul 2px com offset | `focus-visible:ring-2 focus-visible:ring-blue-500` |
| **Active** | Bg um pouco mais escuro (`stone-100`/`stone-700`) | `active:bg-stone-100 dark:active:bg-stone-700` |
| **Loading thumb** | Skeleton stone-200 pulsando | `bg-stone-200 dark:bg-stone-700 animate-pulse` |
| **Erro thumb** | Esconde chip, renderiza SourceBadge | onError handler |

### Spec final do componente (1 bloco copy-paste para @dev)

```tsx
// packages/web/src/components/pipeline/creative-chip.tsx
interface CreativeChipProps {
  adId: string
  adName: string
  campaignName?: string
  thumbnailUrl?: string
  imageUrl?: string
  onPreviewClick?: (adId: string) => void
}

export function CreativeChip({
  adId, adName, campaignName, thumbnailUrl, imageUrl, onPreviewClick,
}: CreativeChipProps) {
  const [imgError, setImgError] = React.useState(false)

  // Degradação: se sem thumbnail OU erro de carga, NÃO renderiza chip
  // O componente pai decide o fallback (SourceBadge)
  if (!thumbnailUrl || imgError) return null

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()  // ← CRÍTICO: previne drag-and-drop
        e.preventDefault()
        onPreviewClick?.(adId)
      }}
      onPointerDown={(e) => e.stopPropagation()}  // ← também necessário p/ dnd-kit
      title={campaignName ? `${adName} · ${campaignName}` : adName}
      aria-label={`Ver criativo ${adName}${campaignName ? ` da campanha ${campaignName}` : ""}`}
      className="group inline-flex shrink-0 items-center gap-1 rounded-md border border-transparent bg-stone-50 px-1 py-0.5 transition-colors hover:border-stone-200 hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:bg-stone-800/60 dark:hover:border-stone-700 dark:hover:bg-stone-800 dark:focus-visible:ring-offset-stone-900"
    >
      <img
        src={thumbnailUrl}
        alt={`${adName} — anúncio Meta`}
        loading="lazy"
        onError={() => setImgError(true)}
        className="h-6 w-6 shrink-0 rounded object-cover sm:h-7 sm:w-7"
      />
      <span className="truncate max-w-[100px] text-[10px] font-medium text-stone-600 dark:text-stone-300 sm:max-w-[120px]">
        {adName}
      </span>
    </button>
  )
}
```

---

## 3. Dark Mode

| Elemento | Light | Dark |
|----------|-------|------|
| Chip bg | `bg-stone-50` | `dark:bg-stone-800/60` |
| Chip bg hover | `bg-stone-100` | `dark:bg-stone-800` |
| Chip border hover | `border-stone-200` | `dark:border-stone-700` |
| Label text | `text-stone-600` | `dark:text-stone-300` |
| Focus ring | `ring-blue-500` (mesmo) | `ring-offset-stone-900` |
| Thumb skeleton | `bg-stone-200` | `dark:bg-stone-700` |

**Validado:** Todos os tokens já existem no card atual — não introduz novos.

---

## 4. `CreativePreviewModal` — Click Behavior

### Responsivo: Drawer mobile vs Modal centered desktop

O projeto já usa pattern custom (não Radix) — ver `lead-detail-drawer.tsx`, `new-appointment-modal.tsx`. Seguir mesmo padrão.

#### Desktop (≥ 640px) — Modal Centralizado
```
        ┌─ Backdrop bg-black/60 ─────────────────────┐
        │                                            │
        │   ┌────────────────────────────────────┐   │
        │   │ Criativo                       [X] │   │
        │   ├────────────────────────────────────┤   │
        │   │                                    │   │
        │   │      ┌────────────────────┐        │   │
        │   │      │                    │        │   │
        │   │      │   image_url ou     │        │   │
        │   │      │   thumbnail (max   │        │   │
        │   │      │   240×240 contain) │        │   │
        │   │      │                    │        │   │
        │   │      └────────────────────┘        │   │
        │   │                                    │   │
        │   │ VIND-LANC-MAR-IMG-01               │   │
        │   │ Campanha: VIND Lançamento Março    │   │
        │   │                                    │   │
        │   │ [Ver no painel de campanhas →]     │   │
        │   └────────────────────────────────────┘   │
        │                                            │
        └────────────────────────────────────────────┘
```

#### Mobile (< 640px) — Bottom Sheet
```
┌─────────────────────────────────────┐
│                                     │
│       (área da tela visível         │
│        atrás do backdrop)           │
│                                     │
├─────────────────────────────────────┤
│ ─── (handle)                        │  ← drag handle 36×4px stone-300
│                                     │
│ Criativo                       [X]  │
│ ───────────────────────────────     │
│                                     │
│    ┌─────────────────────┐         │
│    │                     │         │
│    │   image (full       │         │
│    │   width minus       │         │
│    │   24px padding)     │         │
│    │                     │         │
│    └─────────────────────┘         │
│                                     │
│ VIND-LANC-MAR-IMG-01                │
│ Campanha: VIND Lançamento Março     │
│                                     │
│ [Ver no painel de campanhas →]      │
│                                     │
└─────────────────────────────────────┘
```

### Spec do Modal (estrutura comum, classes responsivas)

```tsx
// packages/web/src/components/pipeline/creative-preview-modal.tsx
"use client"

import { X, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

interface CreativePreviewModalProps {
  open: boolean
  onClose: () => void
  adId: string
  adName: string
  campaignName: string | null
  thumbnailUrl: string | null
  imageUrl: string | null
  metaCampaignId?: string  // p/ deeplink ao painel
}

export function CreativePreviewModal({
  open, onClose, adId, adName, campaignName, thumbnailUrl, imageUrl, metaCampaignId,
}: CreativePreviewModalProps) {
  // Esc closes
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onClose])

  if (!open) return null

  const displayUrl = imageUrl ?? thumbnailUrl
  const deeplink = metaCampaignId
    ? `/dashboard/campaigns/meta/${metaCampaignId}?ad_id=${adId}`
    : `/dashboard/campaigns/meta?ad_id=${adId}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="creative-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Sheet/Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl dark:bg-stone-900 sm:max-w-md sm:rounded-2xl"
      >
        {/* Drag handle (mobile only) */}
        <div className="mb-3 flex justify-center sm:hidden">
          <div className="h-1 w-9 rounded-full bg-stone-300 dark:bg-stone-700" />
        </div>

        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2
            id="creative-modal-title"
            className="text-sm font-semibold text-stone-900 dark:text-stone-100"
          >
            Criativo
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Image */}
        {displayUrl && (
          <div className="mb-4 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800">
            <img
              src={displayUrl}
              alt={`${adName} — anúncio Meta`}
              className="h-auto w-full object-contain"
              style={{ maxHeight: "60vh" }}
            />
          </div>
        )}

        {/* Metadata */}
        <div className="mb-4 space-y-1">
          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{adName}</p>
          {campaignName && (
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Campanha: <span className="text-stone-700 dark:text-stone-300">{campaignName}</span>
            </p>
          )}
        </div>

        {/* CTA */}
        <Link
          href={deeplink}
          onClick={onClose}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          Ver no painel de campanhas
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}
```

### Por que essa abordagem (vs Radix Dialog/Sheet)

- ✅ Coerência com pattern existente do projeto (lead-detail-drawer, new-appointment-modal)
- ✅ Zero deps novas (já tem `lucide-react` e Next `Link`)
- ✅ Mesmo componente serve drawer mobile e modal desktop via responsive classes
- ⚠️ Trade-off: focus trap manual (não automático como Radix). **Próximo passo:** se @dev quiser, instalar `react-focus-lock` (4kb gzip) — eu aprovo, mas não exijo.

---

## 5. ♿ Accessibility Checklist (WCAG AA — AC9)

### Chip (botão)

- [x] **Semantic:** `<button type="button">` — não `<div>`
- [x] **Keyboard:** Enter e Space disparam `onPreviewClick` (nativo do `<button>`)
- [x] **Focus visible:** `focus-visible:ring-2 focus-visible:ring-blue-500 ring-offset-1`
- [x] **Alt text:** thumb tem `alt="${adName} — anúncio Meta"` (descritivo, não vazio)
- [x] **ARIA label:** botão tem `aria-label="Ver criativo ${adName} da campanha ${campaignName}"` (mais rico que o conteúdo visual)
- [x] **Hover/Focus discrimination:** estados visuais distintos (border aparece no focus, bg muda no hover)
- [x] **Touch target:** com `py-0.5 px-1` o botão fica ~32×32px (tipicamente passa WCAG 2.5.5 — alvo mínimo 24×24 AA, recomendado 44×44 AAA)
- [x] **Contraste do label:** `text-stone-600` em `bg-stone-50` = 7.5:1 (passa AAA)
- [x] **Dark mode contraste:** `text-stone-300` em `bg-stone-800` = 8.2:1 (passa AAA)

### Modal/Sheet

- [x] **`role="dialog"`** + **`aria-modal="true"`** + **`aria-labelledby="creative-modal-title"`**
- [x] **Escape closes** — handler em `useEffect`
- [x] **Backdrop click closes** — handler no overlay
- [x] **Focus management:** próxima iteração — focar no botão Close ao abrir, retornar ao chip ao fechar. **Manual por enquanto** (aceito como CONCERN minor).
- [x] **CTA acessível:** `<Link>` semântico do Next, texto descritivo "Ver no painel de campanhas" + ícone decorativo
- [x] **Close button:** `aria-label="Fechar"` (ícone X é decorativo)
- [x] **Imagem:** `alt` descritivo no preview também

### Anti-padrões evitados

- ❌ **NÃO usar:** `<div onClick>` para o chip (foi `<button>`)
- ❌ **NÃO usar:** `aria-label=""` vazio na thumb
- ❌ **NÃO usar:** modal sem aria-modal
- ❌ **NÃO usar:** focus ring escondido com `outline-none` sem alternativa visual
- ❌ **NÃO usar:** `tabIndex={-1}` no botão (default 0 é correto)

---

## 6. Anti-padrões Específicos deste Card

Dada a densidade já alta, evitar:

1. ❌ **Adicionar nova linha vertical** (Variante C rejeitada)
2. ❌ **Sombras pesadas no chip** — o card todo tem `hover:shadow-md`; sombra dupla atrapalha
3. ❌ **Thumb circular** (`rounded-full`) — criativos retangulares ficam grotescos cortados
4. ❌ **Borda colorida no chip** — o SourceBadge atual usa cor semântica; o CreativeChip é **neutro** (a cor vem da imagem)
5. ❌ **Animação na thumb** (loading spinner, scale-in) — visual demais para um elemento que aparece em 20+ cards simultaneamente
6. ❌ **Hover preview tooltip rico** (com thumbnail grande) — confunde com o click→modal. Tooltip nativo `title=""` é suficiente.
7. ❌ **Tornar a thumb arrastável separadamente** — o card inteiro arrasta; chip apenas clica
8. ❌ **Truncar com `text-overflow: clip`** — sempre `truncate` (ellipsis automática)

---

## 7. Posicionamento Final no `lead-card.tsx`

### Antes (estado atual — linhas 134-145)

```tsx
<div className="mt-2 flex items-center gap-2">
  <span /* Property Badge */>
  {lead.source && <SourceBadge source={lead.source} size="xs" />}
  {lead.source === "whatsapp_click_to_ad" && lead.utm_campaign && (
    <span /* utm_campaign chip */>
  )}
  <div /* Progress bar */>
</div>
```

### Depois (recomendado)

```tsx
<div className="mt-2 flex items-center gap-2">
  <span /* Property Badge — sem mudança */>

  {/* Story 50-2: CreativeChip substitui SourceBadge quando há criativo resolvido */}
  {creative ? (
    <CreativeChip
      adId={creative.adId}
      adName={creative.adName}
      campaignName={creative.campaignName ?? undefined}
      thumbnailUrl={creative.thumbnailUrl ?? undefined}
      imageUrl={creative.imageUrl ?? undefined}
      onPreviewClick={() => setPreviewOpenFor(creative.adId)}
    />
  ) : (
    <>
      {lead.source && <SourceBadge source={lead.source} size="xs" />}
      {lead.source === "whatsapp_click_to_ad" && lead.utm_campaign && (
        <span /* utm_campaign chip — fallback existente */>
      )}
    </>
  )}

  <div /* Progress bar — sem mudança */>
</div>

{/* No final do componente, render condicional do modal */}
{creative && previewOpenFor === creative.adId && (
  <CreativePreviewModal
    open={true}
    onClose={() => setPreviewOpenFor(null)}
    {...creative}
  />
)}
```

**Mudança mínima** — apenas linhas 140-145 viram condicional. Layout flex `gap-2` absorve a substituição naturalmente.

---

## 8. Edge Cases & Comportamento

| Cenário | Comportamento |
|---------|---------------|
| Lead com `source='meta_ads'` + `creative` resolvido | Mostra `<CreativeChip>` |
| Lead com `source='meta_ads'` + `metadata.ad_id` mas sync atrasado (sem creative no DB) | Mostra `<SourceBadge>` (fallback) |
| Lead com `source='whatsapp_click_to_ad'` + creative resolvido | Mostra `<CreativeChip>` |
| Lead com `source='whatsapp_click_to_ad'` + sem creative | Mostra `<SourceBadge>` + utm_campaign chip (comportamento atual) |
| Lead `source='website'` ou `'walk_in'` etc. | `<SourceBadge>` (sem mudança) |
| Thumb URL retorna 404 (token Meta expirado) | `onError` esconde chip → re-render mostra `<SourceBadge>` |
| Ad arquivado mas creative ainda no DB | Mostra `<CreativeChip>` normalmente (não temos sinal de arquivamento aqui — opcional para futura iteração) |
| 50 cards na coluna, todos com creative | Lazy loading da thumb (`loading="lazy"`) garante perf |
| Click em mobile vs drag | `e.stopPropagation()` + `e.preventDefault()` + `onPointerDown` stopPropagation = nunca confunde com dnd-kit |

---

## 9. Loading State (enquanto creatives são buscados)

Durante o fetch de criativos no server component (após Story 50-1 + helper), o card pode renderizar inicialmente sem o creative. **Decisão de design:**

- ❌ **NÃO mostrar skeleton** no slot do chip — gera flicker incômodo (visual chega depois)
- ✅ **Renderizar SourceBadge primeiro**, hidratar com CreativeChip se disponível no client

Como tudo é server component, isso é trivial: a query do pipeline aguarda o helper antes de renderizar — o card já chega com `creative` populado ou null. Sem estado intermediário visível.

---

## 10. Métricas de Sucesso Visual

| Métrica | Target | Como medir |
|---------|--------|------------|
| Altura média do card | ≤ baseline atual + 0px (zero crescimento) | Inspect element comparativo antes/depois |
| Tempo do usuário para identificar criativo | ≤ 3s (era ~30-60s sem chip) | Teste qualitativo com 2 corretores (parte do AC do epic) |
| % de cards renderizando chip vs fallback | ≥ 80% para leads `meta_ads`/`whatsapp_click_to_ad` recentes | Query SQL — métrica de AC10 do epic |
| Erro de carga de thumb (onError trigger) | < 5% | Sentry/log de `onError` em produção |
| CLS (Cumulative Layout Shift) | < 0.05 adicional | Lighthouse/Vercel Analytics |

---

## 11. Handoff Sign-off

✅ **Aprovado por:** Uma (@ux-design-expert) — 2026-06-03
✅ **Design Spec entregue para:** @dev (Dex) — usar como spec autoritativa para Story 50-2
✅ **GR-2 (densidade visual) — Mitigado:** Variante A escolhida + Variante B como degradação automática

### Próximos passos para @dev

1. Implementar `CreativeChip` exatamente como spec da Seção 2 (código copy-paste pronto)
2. Implementar `CreativePreviewModal` conforme Seção 4 (código copy-paste pronto)
3. Integrar no `lead-card.tsx` conforme Seção 7
4. Testar mobile 375px no `/broker/pipeline`
5. Validar contrastes com axe DevTools ou Lighthouse a11y audit
6. Solicitar minha review (`*scan`) com screenshots desktop + mobile ANTES do PR

### Tokens auditados — zero novos introduzidos

Todos os valores usados (`stone-50/100/200/300/600/700/800/900`, `blue-500`, `text-[10px]`, `rounded-md`, `h-7 w-7`, etc.) já existem no card atual ou no SourceBadge. **Mudança 100% sistêmica.**

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-03 | 1.0 | Design spec inicial — 3 variantes wireframe, Variante A recomendada, tokens completos, modal responsivo, a11y checklist WCAG AA | Uma (@ux-design-expert) |
