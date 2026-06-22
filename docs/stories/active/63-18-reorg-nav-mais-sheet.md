# Story 63-18 — Reorg da Nav Mobile: 4 Tabs + Botão "Mais" com Bottom Sheet

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-18
- **Status:** Ready for Review
- **Priority:** P0 — sem a nova nav, o Chat não tem acesso direto pelo polegar; "Mais" ainda é um Link sem sheet
- **Complexity:** M (3-5h)
- **Fase:** 6 (Caixa de Entrada de Conversas)
- **Leva:** Primeira (caminho crítico)
- **Created:** 2026-06-22
- **Author:** @sm (River)

> **CodeRabbit Integration:** Disabled — validação manual pelo @qa.

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[mobile_nav_render_check, sheet_a11y_check, desktop_regression_check, ts_typecheck]`
- **Depende de:** 63-17 Done (a rota `/broker/chat` precisa existir antes de navegar para ela)
- **Bloqueia:** 63-19 (badge fica no item Chat — precisa da nav nova)
- **Desktop:** inalterado — todos os itens continuam na sidebar

---

## User Story

**Como** corretor usando o PWA no celular,
**Quero** que o Chat fique numa das 4 abas principais na parte inferior da tela,
**Para que** eu acesse a inbox de conversas com um toque do polegar direito sem precisar abrir menus secundários.

---

## Context

### Estado Atual da Nav Mobile

`components/layout/sidebar-nav.tsx` L150: `items.slice(0, 5)` renderiza 5 abas na bottom bar. L180-193: `items[5]` é renderizado como um `<Link>` simples para a URL do item (atualmente "Fluxo de Pagamento", externo).

`broker/layout.tsx` L13-22 (NAV_ITEMS atual, 8 itens):
```
[0] /broker         → Início
[1] /broker/leads   → Meus Leads
[2] /broker/pipeline → Pipeline
[3] /broker/agenda  → Agenda
[4] /broker/properties → Imóveis
[5] external (Fluxo)  → vai para slot "Mais" (Link) na bottom bar
[6] /broker/instalar
[7] /broker/suporte
```

### Nova Ordem Aprovada (mobile, 4 tabs + Mais)

```
[0] /broker          → Início       (LayoutDashboard)
[1] /broker/pipeline → Pipeline     (Kanban)
[2] /broker/agenda   → Agenda       (CalendarDays)
[3] /broker/chat     → Chat         (MessageCircle) ← NOVO
[Mais] → bottom sheet com: Meus Leads, Imóveis, Fluxo de Pagamento (ext), Instalar, Suporte
```

**Ergonomia:** Chat na posição 3 (índice 3, penúltima antes de "Mais") = zona de alcance fácil do polegar direito em telas de 6". "Meus Leads" movido para "Mais" — acesso direto ao chat é mais frequente que à lista de leads no fluxo de trabalho móvel.

### Desktop — Inalterado

Na sidebar desktop (`lg:` breakpoint ≥1024px), TODOS os itens continuam visíveis em ordem. A lógica de sidebar usa `items.map(...)` sem slice — todos aparecem. Nenhuma mudança na sidebar desktop.

### Mudanças em `sidebar-nav.tsx`

1. **Mobile bottom bar:** trocar `items.slice(0, 5)` (L150) por `items.slice(0, 4)` — exibe 4 tabs
2. **Slot "Mais":** Em vez de `items[5]` como `<Link>` (L180-193), renderizar um `<button>` que abre um bottom sheet com `items.slice(4)` (todos os itens a partir do índice 4)
3. **Badge no "Mais":** `moreHasBadge` em L42 já computa se `items.slice(5).some(i => i.badge > 0)` — ajustar para `items.slice(4).some(...)` após a mudança de índice
4. **NavItem interface:** adicionar `badgeTone?: 'orange' | 'green'` para uso futuro (63-19 precisa de tom verde no Chat)

### Bottom Sheet "Mais"

Padrão de overlay do projeto: `fixed inset-0 z-60 flex items-center justify-center bg-black/50` (ver `quick-history-modal.tsx` L1-30). Para o "Mais" usar variante de sheet inferior:

```tsx
// overlay: fixed inset-0 z-50 bg-black/40
// sheet: fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white dark:bg-stone-900
//        animate: translate-y-0 / translate-y-full com transition-transform
```

A11y obrigatória:
- `role="dialog"` + `aria-modal="true"` + `aria-label="Menu principal"`
- Focus-trap: ao abrir, focar no primeiro item do sheet; Tab circula dentro do sheet
- `Esc` fecha o sheet
- Clicar/tocar fora do sheet (no overlay) fecha
- Todos os itens do sheet com alvo ≥44px de altura

### Itens no "Mais" Sheet

```
Meus Leads   → /broker/leads        (Users)
Imóveis      → /broker/properties   (Building2)
Fluxo de Pagamento → external URL   (CreditCard, externo — abre nova aba)
Instalar     → /broker/instalar     (Smartphone)
Suporte      → /broker/suporte      (MessageSquarePlus)
```

---

## Acceptance Criteria

- [x] **AC1 (Nova ordem das 4 tabs mobile):** Na bottom bar mobile, as 4 abas em ordem são: Início (`/broker`), Pipeline (`/broker/pipeline`), Agenda (`/broker/agenda`), Chat (`/broker/chat`). Verificar no Chrome DevTools modo mobile (375px largura).

- [x] **AC2 (Item Chat com ícone correto):** O item "Chat" usa ícone `MessageCircle` do `lucide-react` (mesmo ícone usado na 63-1 para ação de responder lead). Tamanho `h-[18px] w-[18px]` (padrão `ICON_SIZE` em `broker/layout.tsx` L11).

- [x] **AC3 (Botão "Mais" abre bottom sheet):** O slot "Mais" na bottom bar é um `<button>` (não `<Link>`). Ao tocar, abre um bottom sheet animado vindo de baixo com os 5 itens do menu secundário. O botão exibe o texto "Mais" e ícone `MoreHorizontal` (ou `...` como atualmente em L186).

- [x] **AC4 (Itens no sheet):** O sheet exibe em ordem: Meus Leads, Imóveis, Fluxo de Pagamento (abre em nova aba — `target="_blank"`), Instalar, Suporte. Cada item com ícone, label, alvo ≥44px de altura.

- [x] **AC5 (Fechar sheet):** O sheet fecha ao: (a) Esc teclado, (b) toque no overlay fora do sheet, (c) toque em qualquer item do sheet (após navegar). Após fechar, foco retorna ao botão "Mais" que abriu o sheet.

- [x] **AC6 (A11y do sheet):** `role="dialog"`, `aria-modal="true"`, `aria-label="Menu principal"`. Focus-trap: Tab e Shift+Tab circulam apenas dentro do sheet enquanto aberto. Primeiro item recebe foco ao abrir.

- [x] **AC7 (Desktop — sem regressão estrutural; reflete a nova lista completa):** A sidebar desktop (`lg`, ≥1024px) usa `items.map(...)` sobre o MESMO array `NAV_ITEMS`, portanto exibe TODOS os 9 itens na nova ordem: Início, Pipeline, Agenda, **Chat (novo)**, Meus Leads, Imóveis, Fluxo de Pagamento, Instalar app, Suporte. O comportamento de `slice`/bottom-sheet é **exclusivo do mobile** — a sidebar desktop NÃO sofre slice nem esconde itens. [AUTO-DECISION/PO] É aceitável (e desejável) que "Chat" apareça também na sidebar desktop; a reordenação (Pipeline antes de Meus Leads) acompanha a nova ordem do array. Critério de aceite: todos os 9 itens visíveis, sem corte, link ativo funcional, badge desktop respeitando `badgeTone`. (Correção do AC original, que enumerava 8 itens na ordem antiga e omitia o Chat — factualmente impossível, pois desktop e mobile compartilham `NAV_ITEMS`.)

- [x] **AC8 (Badge "Mais" preservado):** Se algum item no sheet tiver badge > 0, o botão "Mais" exibe o dot de badge (padrão `moreHasBadge` de `sidebar-nav.tsx` L42 e L186-189). Ajustar a slice para `items.slice(4)` após mudança de índice.

- [x] **AC9 (BadgeTone no NavItem):** A interface `NavItem` em `sidebar-nav.tsx` ganha `badgeTone?: 'orange' | 'green'`. O badge numérico na bottom bar mobile usa `bg-orange-500` quando `badgeTone` é `'orange'` ou ausente, e `bg-green-700` quando `badgeTone` é `'green'`. Desktop sidebar: idem. Este campo é usado pela story 63-19 para o badge verde do Chat.

- [x] **AC10 (TypeScript + ESLint):** Zero erros de type-check e lint nos arquivos desta story.

---

## Tasks / Subtasks

- [x] **T1 — Atualizar NAV_ITEMS em `broker/layout.tsx` (AC1, AC2)**
  - [ ] Reordenar para: `[Início, Pipeline, Agenda, Chat(novo), Meus Leads, Imóveis, Fluxo, Instalar, Suporte]`
  - [ ] Adicionar item Chat: `{ href: "/broker/chat", label: "Chat", icon: <MessageCircle className={ICON_SIZE} /> }`
  - [ ] Adicionar import de `MessageCircle` no topo do arquivo

- [x] **T2 — Atualizar `sidebar-nav.tsx`: slice 5→4 + NavItem.badgeTone (AC1, AC8, AC9)**
  - [ ] Mudar `items.slice(0, 5)` → `items.slice(0, 4)` na mobile bottom bar (L150)
  - [ ] Mudar `items.slice(5)` → `items.slice(4)` no cálculo de `moreHasBadge` (L42)
  - [ ] Adicionar `badgeTone?: 'orange' | 'green'` à interface `NavItem` (L9-16)
  - [ ] Atualizar render do badge numérico (L171-173) para usar `bg-green-700` quando `badgeTone='green'`
  - [ ] Atualizar render do badge na sidebar desktop (L91-94) com mesmo `badgeTone`

- [x] **T3 — Substituir `<Link>` do slot "Mais" por `<button>` + bottom sheet (AC3, AC4, AC5, AC6)**
  - [ ] Criar state `moreOpen: boolean` no componente (já é Client Component — `"use client"`)
  - [ ] Substituir `items[5]` render (L180-193) por `<button onClick={() => setMoreOpen(true)}>` com ícone e label "Mais"
  - [ ] Criar componente `MoreSheet` (inline ou arquivo separado `more-sheet.tsx`)
  - [ ] MoreSheet: overlay + sheet animado; itens com Link/a conforme `external`
  - [ ] Fechar em Esc (`useEffect` com `keydown` listener), tap overlay, e tap em item

- [x] **T4 — A11y do sheet (AC6)**
  - [ ] `role="dialog"` + `aria-modal="true"` + `aria-label="Menu principal"`
  - [ ] Focus-trap com `useEffect` que escuta Tab e Shift+Tab e wraps dentro do sheet
  - [ ] `useRef` no primeiro item para focar ao abrir
  - [ ] Retornar foco ao botão "Mais" ao fechar (via `useRef` no botão)

- [x] **T5 — Verificação desktop (AC7)**
  - [ ] Abrir sidebar desktop e confirmar que todos os 8+ itens aparecem sem corte
  - [ ] Nenhuma lógica de slice aplicada à sidebar desktop (L63: `items.map(...)` — não tocado)

- [x] **T6 — Type-check + lint (AC10)**

---

## Dev Notes

### Arquivos a Modificar

| Arquivo | Ação | Linhas de Referência |
|---------|------|---------------------|
| `packages/web/src/components/layout/sidebar-nav.tsx` | MODIFICAR | L9-16 (interface), L42 (moreHasBadge), L91-94 (desktop badge), L150 (mobile slice), L170-178 (badge mobile), L180-193 (slot Mais) |
| `packages/web/src/app/broker/layout.tsx` | MODIFICAR | L5 (imports lucide), L13-22 (NAV_ITEMS), adicionar Chat |

### Análise do sidebar-nav.tsx Atual

- **L9-16:** Interface `NavItem` — adicionar `badgeTone?: 'orange' | 'green'`
- **L42:** `const moreHasBadge = items.slice(5).some(...)` → mudar para `items.slice(4).some(...)`
- **L91-94:** badge desktop — adicionar lógica de `item.badgeTone`
- **L150:** `items.slice(0, 5)` → `items.slice(0, 4)` — exibir 4 tabs
- **L170-178:** render badge mobile com `badgeTone`
- **L180-193:** slot "Mais" atual é `<Link href={items[5].href}>` — transformar em `<button>`

### Padrão de Overlay do Projeto

`broker/_components/quick-history-modal.tsx` L30 (aproximado): `fixed inset-0 z-60 flex items-center justify-center`. Para o sheet inferior (bottom sheet):

```tsx
{/* Overlay */}
<div
  className="fixed inset-0 z-50 bg-black/40"
  onClick={() => setMoreOpen(false)}
  aria-hidden="true"
/>
{/* Sheet */}
<div
  role="dialog"
  aria-modal="true"
  aria-label="Menu principal"
  className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white dark:bg-stone-900 shadow-xl"
>
  {/* Handle visual */}
  <div className="mx-auto mt-3 h-1 w-8 rounded-full bg-stone-300 dark:bg-stone-600" />
  {/* Itens */}
  ...
</div>
```

Animação: adicionar `transition-transform duration-300` e controlar `translate-y-0`/`translate-y-full` via classe condicional. Ou usar `data-state` + Tailwind variant se disponível.

### Focus-Trap Simplificado

```tsx
// useEffect para focus-trap (pode ser hook customizado)
useEffect(() => {
  if (!moreOpen) return
  const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  if (!focusable?.length) return
  focusable[0].focus()
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setMoreOpen(false)
    if (e.key === 'Tab') {
      // Wrap Tab dentro do sheet
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [moreOpen])
```

### Badge Verde — Referência

Para o AC9 (preparação para 63-19):
- Badge com número: `bg-green-700 text-white` (contraste ≥4.5:1 sobre fundo branco do bottom bar)
- Badge sem número (dot): `bg-green-500 ring-2 ring-white dark:ring-stone-950` (padrão do `moreHasBadge` dot em L188-189)

### Testing

- **Visual:** Chrome DevTools mobile emulation 375px × 812px (iPhone SE) — verificar 4 abas + "Mais"
- **A11y:** testar focus-trap com Tab/Shift+Tab; testar Esc; testar tap-fora
- **Desktop:** testar sidebar em 1280px — confirmar todos os 8+ itens sem corte
- **Não existe teste Vitest para componentes de UI neste projeto** — validação manual + inspeção de tipos

---

## Dev Agent Record (Dex) — 2026-06-22

### File List
- `packages/web/src/app/broker/layout.tsx` (MODIFICADO — NAV_ITEMS reordenado + Chat + import MessageCircle)
- `packages/web/src/components/layout/sidebar-nav.tsx` (MODIFICADO — slices 5→4, badgeTone, botão Mais + bottom sheet a11y)

### Como o sheet "Mais" preserva o desktop
- A sidebar desktop continua usando `items.map(...)` sobre o MESMO `NAV_ITEMS`, **sem nenhum slice** —
  renderiza os 9 itens na nova ordem (incluindo Chat). Toda a lógica de `slice`/sheet vive em blocos
  marcados `lg:hidden` (bottom bar, overlay e sheet). O `aside` desktop é `hidden lg:flex`, intocado.
- As constantes novas (`tabItems = slice(0,4)`, `moreItems = slice(4)`) só alimentam o bottom bar e o
  sheet mobile; o desktop não as consome.

### Decisões
- Ícone do botão "Mais": `MoreHorizontal` (lucide-react), conforme AC3.
- `badgeBg(item)` centraliza a cor do badge (`bg-green-700` quando `badgeTone='green'`, senão `bg-orange-500`),
  aplicado no desktop, no bottom bar mobile e nos itens do sheet.
- `moreItems.length > 0` guarda o render do botão "Mais" (em vez de `items[5]`), robusto à nova contagem.
- Foco retorna ao botão "Mais" via `moreButtonRef` em `closeMore()` (Esc e overlay). Em clique de item,
  apenas fecha (navegação troca a página).
- Sheet usa `mobile-nav-safe` (safe-area) + `z-50` sobre overlay `z-40` (cobre o bottom bar `z-30`).

### Resultados
- ESLint: 0 erros nos 2 arquivos. type-check: 0 erros (3 pré-existentes em `visual-editor.tsx`).
- Validação visual de UI: sem teste Vitest para componentes (padrão do projeto) — verificação por tipos + inspeção.

## Validação (PO — Pax) — 2026-06-22

**Veredito: GO — Score 8/10 (após correção do AC7). Status Draft → Ready.**

Confirmado no código (`components/layout/sidebar-nav.tsx` + `app/broker/layout.tsx`):
- **L150 `items.slice(0, 5)`** → mudar p/ `slice(0,4)`. ✓ Confirmado.
- **L180-193 `items[5]` como `<Link>`** → trocar por `<button>` + bottom sheet. ✓ Confirmado.
- **L42 `moreHasBadge = items.slice(5)`** → `slice(4)`. ✓ Confirmado.
- **Interface `NavItem` (L9-16)** sem `badgeTone` — adicionar `badgeTone?: 'orange' | 'green'`. ✓
- **Cor do badge hardcoded `bg-orange-500`** (desktop L92, mobile L171) — tornar condicional p/ `bg-green-700` quando `badgeTone='green'`. ✓
- **Overlay reutilizável:** `app/broker/_components/quick-history-modal.tsx` existe. ✓ A11y (focus-trap/Esc/tap-fora/≥44px) especificada em AC6 + Dev Notes.
- **Nova ordem `NAV_ITEMS`** (9 itens, Chat no índice 3) coerente com mobile `slice(0,4)` + sheet `slice(4)` = [Meus Leads, Imóveis, Fluxo, Instalar, Suporte]. ✓ Bate com AC4.

**Correção aplicada (era blocker do AC7):** desktop e mobile compartilham o MESMO `NAV_ITEMS` (desktop usa `items.map` em L63, sem slice). Logo o AC7 original ("desktop inalterado, 8 itens na ordem antiga, sem Chat") era impossível — o desktop reflete a nova ordem e inclui Chat. **AC7 reescrito** para a realidade (9 itens, Chat incluído, slice/sheet só no mobile). Decisão PO: Chat na sidebar desktop é aceitável/desejável.

**Notas (não bloqueiam):**
- O item "Fluxo de Pagamento" tem `separator: true`; ao migrar p/ o sheet, o render do sheet deve ignorar/tratar `separator` graciosamente.

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | v1.0 | Story criada — Fase 6, reorg nav mobile + "Mais" sheet | @sm (River) |
| 2026-06-22 | v1.1 | Validada (GO 8/10). Linhas/slices de `sidebar-nav.tsx` confirmadas; overlay reutilizável existe. **AC7 corrigido** (desktop compartilha NAV_ITEMS → 9 itens c/ Chat na nova ordem; slice/sheet só mobile). Status Draft → Ready. | @po (Pax) |
