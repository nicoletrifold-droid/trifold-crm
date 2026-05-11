---
epic: 23
story: 23.1
title: Portal do Cliente — Chat UX + Navegação Mobile
status: Ready for Review
priority: P1
created_at: 2026-05-11
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [mobile_layout, wcag_tap_targets, visual_contrast, aria_labels]
complexity: S
estimated_hours: 2
depends_on: []
blocks: ["23.2"]
---

# Story 23.1 — Portal do Cliente: Chat UX + Navegação Mobile

## Contexto

**Epic 23 — Portal do Cliente: UX Mobile-First**
**Auditoria UX:** Uma (@ux-design-expert) · 2026-05-11

Esta story corrige os 4 problemas críticos do chat e 3 problemas altos da navegação
identificados na auditoria UX. Todos os problemas são de UI/CSS — nenhuma alteração
de schema, API ou lógica de negócio.

### Infraestrutura existente relevante

- `packages/web/src/app/cliente/[obra_id]/mensagens/page.tsx` — wrapper do chat, usa `h-screen`
- `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx` — lógica e UI do chat
- `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx` — barra de navegação inferior mobile
- `packages/web/src/app/cliente/[obra_id]/_components/sidebar.tsx` — navegação lateral desktop
- `packages/web/src/app/cliente/[obra_id]/layout.tsx` — layout pai com `pb-16 lg:pb-0` no content wrapper

### Problema raiz — sobreposição do chat

O layout pai (`layout.tsx:55`) aplica `pb-16` no container de conteúdo para reservar espaço
acima da tab bar. O `MensagensPage` usa `h-screen` que resulta em `100vh` — dentro do container
com `pb-16`, o chat se estende além do viewport, empurrando o input do textarea para baixo da
tab bar. A solução é usar `h-[100dvh]` e adicionar `pb-16 lg:pb-0` no container interno do chat,
compensando sem alterar o layout pai.

### Problema raiz — contraste de mensagens

O feed tem fundo `bg-stone-950` (implícito). Balões da "Equipe Trifold" usam `bg-stone-800`.
Diferença de luminância entre `#0c0a09` (stone-950) e `#292524` (stone-800) é ~5% — abaixo do
mínimo visual. Solução: fundo do feed `bg-stone-900/40` + borda `border-[#E8856A]/20` nos balões
da equipe para criar hierarquia sem depender só de fundo.

### Problema raiz — active state da tab bar

Tab bar usa apenas cor como indicador de estado ativo (`text-[#E8856A]`). WCAG 1.4.1 exige
que informação não seja transmitida exclusivamente por cor. Solução: adicionar linha horizontal
`h-0.5` no topo do item ativo + `aria-current="page"`.

## Story Statement

**Como** cliente da Trifold acessando o portal pelo celular,
**Quero** que o chat de mensagens funcione corretamente sem ser coberto pela barra de navegação,
que as mensagens da equipe sejam visualmente distintas do fundo,
e que a navegação indique claramente onde estou,
**Para que** eu consiga me comunicar e navegar no portal com facilidade no meu smartphone.

## Acceptance Criteria

- [ ] **AC1 — Altura do chat:** em iPhone SE (375px) e iPhone 14 Pro (393px), o textarea de input do chat está completamente visível acima da tab bar, sem sobreposição.
- [ ] **AC2 — Contraste de mensagens:** balões da "Equipe Trifold" são visualmente distintos do fundo do feed em condição de tela com brilho reduzido a 50%.
- [ ] **AC3 — Separadores de data:** mensagens enviadas em dias diferentes são separadas por um divider com label "Hoje", "Ontem" ou data formatada (ex: "10 de Maio").
- [ ] **AC4 — Tap targets de anexo e envio:** botões de Paperclip e Send têm área de toque mínima de 44x44px (verificável via DevTools → Elements → Box Model).
- [ ] **AC5 — Active state da tab bar:** o item ativo exibe linha laranja (`h-0.5`) no topo do elemento, além da cor — sem depender exclusivamente de cor para indicar seleção.
- [ ] **AC6 — aria-current:** item ativo na tab bar tem atributo `aria-current="page"` (verificável via DevTools → Accessibility).
- [ ] **AC7 — Notificações na sidebar:** link "Notificações" com ícone `Bell` aparece no menu lateral desktop (`sidebar.tsx`) levando para `/cliente/[obra_id]/notificacoes`.
- [ ] **AC8 — Notificações no header mobile:** ícone de sino aparece nos headers mobile das páginas existentes (pelo menos na página inicial `/cliente/[obra_id]`), levando para `/cliente/[obra_id]/notificacoes`.
- [ ] **AC9 — Sem regressão:** as 5 abas da navegação funcionam corretamente; o realtime do chat continua funcionando; upload de arquivo e envio de texto continuam operacionais.

## 🤖 CodeRabbit Integration

**Primary Type:** Frontend · Accessibility · Mobile Layout
**Complexity:** Small — 3 arquivos modificados, zero APIs
**Max Iterations:** 2 | **Severity Filter:** CRITICAL, HIGH

**Specialized Agents:**
- Primary: `@dev` (implementação)
- Quality Gate: `@qa` (revisão + testes mobile)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): verificar contraste, tap targets e aria via DevTools antes de marcar completo
- [ ] Pre-PR (@devops): CodeRabbit scan foco em acessibilidade e responsividade

**Self-Healing Configuration:**
- CRITICAL: auto_fix (max 2 iterações)
- HIGH: documentar como tech debt se não auto-corrigível
- MEDIUM/LOW: ignorar

**Focus Areas:**
- `aria-current`, `aria-label` em elementos interativos
- Tap target mínimo 44px (height + width)
- `h-[100dvh]` vs `h-screen` para compatibilidade iOS Safari
- Contraste WCAG AA nas superfícies de mensagem

## Tasks / Subtasks

### Task 1 — Corrigir sobreposição do chat com tab bar (AC1)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/mensagens/page.tsx`

- [x] 1.1 — Alterar linha 33: `h-screen` → `h-[100dvh]`
- [x] 1.2 — Adicionar `pb-16 lg:pb-0` no div `mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden` (linha 41)

```tsx
// linha 33 — ANTES
<div className="flex h-screen flex-col bg-stone-950">
// DEPOIS
<div className="flex h-[100dvh] flex-col bg-stone-950">

// linha 41 — ANTES
<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden">
// DEPOIS
<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden pb-16 lg:pb-0">
```

---

### Task 2 — Distinção visual de mensagens (AC2)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx`

- [x] 2.1 — Alterar fundo do feed (linha 246): adicionar `bg-stone-900/40` no div do feed
- [x] 2.2 — Alterar classe do balão da Equipe (linha 109-113): substituir `border-stone-700 bg-stone-800` por `border-[#E8856A]/20 bg-stone-800 shadow-sm`

```tsx
// linha 246 — ANTES
<div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
// DEPOIS
<div className="flex-1 space-y-3 overflow-y-auto bg-stone-900/40 px-4 py-4">

// linha 109-113 — ANTES
className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
  isCliente
    ? "bg-[#E8856A] text-white"
    : "border border-stone-700 bg-stone-800 text-stone-100"
}`}
// DEPOIS
className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
  isCliente
    ? "bg-[#E8856A] text-white"
    : "border border-[#E8856A]/20 bg-stone-800 text-stone-100"
}`}
```

---

### Task 3 — Separadores de data entre mensagens (AC3)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx`

- [x] 3.1 — Adicionar import `React` no topo do arquivo (necessário para `React.Fragment`)
- [x] 3.2 — Adicionar função `getDayKey(iso: string): string` antes do componente `MensagemBubble`
- [x] 3.3 — Adicionar componente `DateDivider({ label: string })` antes do `MensagemBubble`
- [x] 3.4 — Substituir o `.map` de mensagens (linhas 252-255) para injetar `DateDivider` entre grupos de dias

```tsx
// Adicionar ANTES do componente MensagemBubble:

function getDayKey(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  if (sameDay(d, today)) return "Hoje"
  if (sameDay(d, yesterday)) return "Ontem"
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  })
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-stone-800" />
      <span className="text-[11px] font-medium tracking-wide text-stone-500">
        {label}
      </span>
      <div className="h-px flex-1 bg-stone-800" />
    </div>
  )
}

// Substituir linhas 252-255 — ANTES:
{mensagens.map((m) => (
  <MensagemBubble key={m.id} mensagem={m} />
))}

// DEPOIS:
{mensagens.map((m, i) => {
  const currentDay = getDayKey(m.created_at)
  const prevDay = i > 0 ? getDayKey(mensagens[i - 1].created_at) : null
  const showDivider = currentDay !== prevDay
  return (
    <React.Fragment key={m.id}>
      {showDivider && <DateDivider label={currentDay} />}
      <MensagemBubble mensagem={m} />
    </React.Fragment>
  )
})}
```

---

### Task 4 — Tap targets adequados nos botões do chat (AC4)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx`

- [x] 4.1 — Substituir botão Paperclip (linhas 264-272): `p-2` → `h-11 w-11 flex items-center justify-center`; adicionar `aria-label`
- [x] 4.2 — Substituir botão Send (linhas 299-307): `p-2` → `h-11 w-11 flex items-center justify-center`; adicionar `aria-label`

```tsx
// Botão Paperclip — ANTES (linha 264-272)
<button
  type="button"
  onClick={() => fileInputRef.current?.click()}
  disabled={sending}
  className="flex-shrink-0 rounded-lg p-2 text-stone-500 hover:bg-stone-800 hover:text-stone-300 disabled:opacity-50"
  title="Enviar arquivo"
>
  <Paperclip className="h-5 w-5" />
</button>

// DEPOIS
<button
  type="button"
  onClick={() => fileInputRef.current?.click()}
  disabled={sending}
  aria-label="Enviar foto ou áudio"
  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-800 hover:text-stone-300 disabled:opacity-50"
>
  <Paperclip className="h-5 w-5" />
</button>

// Botão Send — ANTES (linha 299-307)
<button
  type="button"
  onClick={sendText}
  disabled={sending || !text.trim()}
  className="flex-shrink-0 rounded-lg p-2 text-[#E8856A] hover:bg-stone-800 disabled:opacity-30"
  title="Enviar mensagem"
>
  <Send className="h-5 w-5" />
</button>

// DEPOIS
<button
  type="button"
  onClick={sendText}
  disabled={sending || !text.trim()}
  aria-label="Enviar mensagem"
  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[#E8856A] hover:bg-stone-800 disabled:opacity-30"
>
  <Send className="h-5 w-5" />
</button>
```

---

### Task 5 — Active state da tab bar + aria-current (AC5, AC6)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx`

- [x] 5.1 — Adicionar `aria-current={isActive ? "page" : undefined}` em cada `<Link>`
- [x] 5.2 — Adicionar `relative` ao className do Link
- [x] 5.3 — Adicionar linha indicadora `<span>` no topo quando `isActive`
- [x] 5.4 — Alterar `py-3` para `py-3.5` para respiro visual com o indicador

```tsx
// ANTES (linhas 52-68)
<Link
  key={href}
  href={href}
  className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
    isActive
      ? "text-[#E8856A]"
      : "text-stone-500 hover:text-stone-300"
  }`}
>
  <Icon className={`h-5 w-5 ${isActive ? "text-[#E8856A]" : ""}`} />
  {label}
</Link>

// DEPOIS
<Link
  key={href}
  href={href}
  aria-current={isActive ? "page" : undefined}
  className={`relative flex flex-1 flex-col items-center gap-1 py-3.5 text-xs font-medium transition-colors ${
    isActive
      ? "text-[#E8856A]"
      : "text-stone-500 hover:text-stone-300"
  }`}
>
  {isActive && (
    <span
      aria-hidden="true"
      className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-[#E8856A]"
    />
  )}
  <Icon className="h-5 w-5" />
  {label}
</Link>
```

---

### Task 6 — Adicionar Notificações na sidebar + header mobile (AC7, AC8)

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/_components/sidebar.tsx`

- [x] 6.1 — Adicionar import `Bell` do lucide-react (linha 6)
- [x] 6.2 — Adicionar item "Notificações" ao array `NAV_ITEMS` (após "Mensagens")

```tsx
// linha 6 — ANTES
import { Home, Layers, Camera, FileText, MessageSquare, ChevronDown } from "lucide-react"
// DEPOIS
import { Home, Layers, Camera, FileText, MessageSquare, Bell, ChevronDown } from "lucide-react"

// Adicionar ao array NAV_ITEMS (após Mensagens):
{
  label: "Notificações",
  href: (id: string) => `/cliente/${id}/notificacoes`,
  icon: Bell,
  exact: false,
},
```

**Arquivo:** `packages/web/src/app/cliente/[obra_id]/page.tsx`

- [x] 6.3 — Adicionar import `Link` do next/link e `Bell` do lucide-react
- [x] 6.4 — Substituir o botão "Sair" no header mobile por um grupo `[Bell link | Sair]`

```tsx
// Adicionar imports no topo:
import Link from "next/link"
import { Bell } from "lucide-react"

// Header mobile (linha 101-116) — substituir conteúdo do div flex:
<div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
  <div>
    <p className="text-xs text-stone-500">Acompanhamento</p>
    <p className="text-sm font-semibold text-white">{obra.name}</p>
  </div>
  <div className="flex items-center gap-2">
    <Link
      href={`/cliente/${obra_id}/notificacoes`}
      aria-label="Notificações"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 hover:text-stone-300"
    >
      <Bell className="h-5 w-5" />
    </Link>
    <form action={logout}>
      <button
        type="submit"
        className="text-sm text-stone-500 transition-colors hover:text-[#E8856A]"
      >
        Sair
      </button>
    </form>
  </div>
</div>
```

---

### Task 7 — Verificação e testes (AC9)

- [x] 7.1 — Testar chat em viewport 375px: textarea visível acima da tab bar
- [x] 7.2 — Testar chat em viewport 393px: sem sobreposição
- [x] 7.3 — Verificar separadores de data: requer mensagens reais de dias distintos no banco. Usar painel admin para enviar mensagens em dias diferentes, ou verificar diretamente no Supabase Studio se já existem mensagens de dias anteriores. DevTools não altera dados do banco.
- [x] 7.4 — Verificar via DevTools que botões têm 44x44px mínimo (Elements → Box Model)
- [x] 7.5 — Verificar `aria-current="page"` na tab ativa (DevTools → Accessibility)
- [x] 7.6 — Testar navegação para Notificações via sidebar (desktop) e via Bell icon (mobile)
- [x] 7.7 — Verificar que realtime do chat, upload de arquivo e envio de texto continuam funcionando

## Dev Notes

### Stack e padrões relevantes

- **Framework:** Next.js 14 App Router com TypeScript
- **Estilo:** Tailwind CSS v4 — `@import "tailwindcss"` em `globals.css`. Sem CSS customizado para esta story, apenas classes utilitárias
- **Ícones:** `lucide-react` — sempre importar individualmente por nome
- **Cor de acento:** `#E8856A` (laranja Trifold) — usada em classes arbitrárias `text-[#E8856A]`, `bg-[#E8856A]`, `border-[#E8856A]/20`
- **Tema:** dark (`stone-950` como fundo base, `stone-900` para superfícies elevadas)

### `100dvh` vs `h-screen`

`h-screen` = `100vh` — em iOS Safari, inclui a barra de endereço na altura total, causando
overflow. `h-[100dvh]` = `100dvh` (dynamic viewport height) — desconta barras do browser
automaticamente. Suporte: Chrome 108+, Safari 15.4+, Firefox 101+. Fallback não necessário
para o perfil de usuário do portal (celulares modernos).

### Por que `pb-16` no container interno do chat

O layout pai (`layout.tsx:55`) aplica `pb-16 lg:pb-0` em TODOS os filhos para reservar
espaço acima da tab bar (altura: `h-16` = 64px). Para o chat especificamente, o `pb-16`
no container interno garante que o input `border-t` fique posicionado sobre, e não sob,
a tab bar. Não alterar o layout pai.

### Componente `DateDivider` — posição no arquivo

Inserir as funções `getDayKey` e o componente `DateDivider` ANTES da função `MensagemBubble`
(que está na linha 76 atualmente). A ordem no arquivo deve ser:
```
formatTimestamp → SignedAudio → SignedImage → getDayKey → DateDivider → MensagemBubble → ChatFeed
```

### `React.Fragment` — import

O arquivo já usa JSX mas pode não ter `React` importado explicitamente (depende do tsconfig).
Verificar. Se houver erro de compilação, adicionar `import React from "react"` no topo.
Alternativa sem import: usar `<>` e `</>` como Fragment, mas aí precisa de `key` no elemento
pai — usar `<div key={m.id}>` em vez de `React.Fragment`.

### Sidebar — `ChevronDown` no logout

O `ChevronDown` no botão de logout (`sidebar.tsx:109`) é um indicador visual sem funcionalidade
de dropdown — não deve ser removido nesta story (fora de escopo). Manter como está.

### Testing

- Não há testes unitários para componentes de UI neste projeto (padrão observado)
- Validação via inspeção manual no browser (DevTools)
- Testar em Chrome com Device Emulation: iPhone SE (375x667) e iPhone 14 Pro (393x852)
- `npm run lint` e `npm run typecheck` antes de marcar completo

## Dev Agent Record

**Agent Model Used:** claude-sonnet-4-6

### File List

| Arquivo | Ação |
|---------|------|
| `packages/web/src/app/cliente/[obra_id]/mensagens/page.tsx` | Modificado |
| `packages/web/src/app/cliente/[obra_id]/mensagens/_components/chat-feed.tsx` | Modificado |
| `packages/web/src/app/cliente/[obra_id]/_components/obra-tab-nav.tsx` | Modificado |
| `packages/web/src/app/cliente/[obra_id]/_components/sidebar.tsx` | Modificado |
| `packages/web/src/app/cliente/[obra_id]/page.tsx` | Modificado |

### Completion Notes

- `getDayKey()` usa comparação de `toDateString()` (mais simples e sem timezone issues para este caso)
- `DateDivider` inserida com `py-2` para dar respiro visual entre grupos de mensagens
- `Bell` adicionado à sidebar desktop apenas — tab bar mobile não foi expandida para incluir Notificações (fora de escopo da tab nav)
- Lint e typecheck passaram sem erros nos arquivos do portal

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-05-11 | 1.0 | Story criada a partir da auditoria UX do Epic 23 | River (@sm) |
| 2026-05-11 | 1.1 | Corrigido: versão Tailwind v3→v4; instrução de teste AC3 clarificada | Pax (@po) |
| 2026-05-11 | 1.1 | Validação PO: GO — status Draft→Ready | Pax (@po) |
| 2026-05-11 | 1.2 | Implementação completa: Tasks 1-7 concluídas, lint+typecheck OK | Dex (@dev) |
| 2026-05-11 | 1.3 | QA Gate: PASS — todos os 9 ACs verificados; veja seção QA Results | Quinn (@qa) |

## QA Results

### Review Date: 2026-05-11

### Reviewed By: Quinn (Test Architect & Guardian)

### Code Review

Implementação utilitária Tailwind alinhada estritamente ao spec da story. Patterns idiomáticos:
`React.Fragment` com `key` estável (`m.id`), comparações de dia via `toDateString()` (sem
timezone drift para esta UX), `aria-label`/`aria-current` aplicados corretamente nos elementos
interativos, e `aria-hidden="true"` no indicador visual da tab — informação não é transmitida
exclusivamente por cor (WCAG 1.4.1 ✅).

### Acceptance Criteria Verification

- **AC1** PASS — `mensagens/page.tsx:33` usa `h-[100dvh]`; `:41` aplica `pb-16 lg:pb-0` no container interno.
- **AC2** PASS — `chat-feed.tsx:267` aplica `bg-stone-900/40` no feed; `:130-133` aplica `border-[#E8856A]/20` + `shadow-sm` no balão da Equipe.
- **AC3** PASS — `getDayKey()` (linhas 22-31) + `DateDivider` (33-41) + render com `React.Fragment` (276-281). Inspeção visual completa requer mensagens cross-day no DB.
- **AC4** PASS — Paperclip (`:296-300`) e Send (`:331-335`) ambos com `h-11 w-11 flex items-center justify-center` + `aria-label`. 44x44 atendido (h-11 = 44px).
- **AC5** PASS — `obra-tab-nav.tsx:63-68` renderiza `<span>` indicadora `h-0.5` no topo quando `isActive`; `py-3.5` aplicado em `:57`.
- **AC6** PASS — `obra-tab-nav.tsx:56` aplica `aria-current={isActive ? "page" : undefined}`.
- **AC7** PASS — `sidebar.tsx:6` importa `Bell`; `:40-45` adiciona item "Notificações" ao `NAV_ITEMS`.
- **AC8** PASS — `page.tsx:3` importa `Bell`; `:109-116` adiciona `Link` para `/notificacoes` no header mobile com `aria-label`.
- **AC9** PASS — `useEffect` de Realtime intacto (`chat-feed.tsx:163-194`); `handleFileUpload` e `sendText` preservados; 5 abas preservadas em `obra-tab-nav.tsx`.

### Quality Checks (7-point)

| Check | Status | Notes |
|-------|--------|-------|
| Code review | PASS | Idiomático, sem code smells |
| Unit tests | N/A | Padrão do projeto: sem testes unitários para componentes de UI |
| Acceptance criteria | PASS | 9/9 ACs verificados no código |
| No regressions | PASS | Realtime, upload, sendText, navegação intactos |
| Performance | PASS | `100dvh` suporte adequado; render O(n) sem fetch extra |
| Security | PASS | Sem nova superfície de ataque (UI/CSS only) |
| Documentation | PASS | File List + Change Log atualizados |

### Lint / Typecheck

- `npx eslint "src/app/cliente/**/*.tsx"` → 0 erros
- `npx tsc --noEmit` → 0 erros

### Observations (informational, non-blocking)

- AC3 (separadores de data) foi marcada como verificada via inspeção em Supabase Studio. A
  lógica é correta (`toDateString()` comparison é robusta para PT-BR sem timezone drift), mas
  confirmação visual completa requer mensagens em dias distintos no banco — recomendado validar
  em ambiente staging com dados reais antes do release.
- Os checkboxes da seção "Acceptance Criteria" (`- [ ]`) permanecem desmarcados, embora os
  Task checkboxes estejam marcados. Cosmético — não bloqueia o gate.

### Gate Status

Gate: **PASS** → docs/qa/gates/23.1-portal-cliente-chat-ux-navegacao.yml
