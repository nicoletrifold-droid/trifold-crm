---
id: "30.1"
epic: 30
title: "Tema Claro/Escuro — Infraestrutura (DB + API + ThemeProvider + Toggle)"
status: Ready for Review
created_at: 2026-05-13
updated_at: 2026-05-13
created_by: River (@sm)
assigned_to: "@dev"
priority: P1
points: 5
depends_on: []
---

# Story 30.1 — Tema Claro/Escuro: Infraestrutura

## Story

**Como** usuário do sistema,
**quero** poder alternar entre tema claro, escuro e preferência do sistema,
**para que** eu use o sistema com o visual que melhor se adapta ao meu ambiente e preferência.

## Contexto do Epic

Epic 30 — Sistema de Tema Claro/Escuro. Esta story entrega toda a infraestrutura necessária: coluna no banco, API para persistir, ThemeProvider no layout raiz e botão de toggle visível no topo. A Story 30.2 aplicará os `dark:` variants nos componentes.

## Acceptance Criteria

- [ ] AC1: Coluna `theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system'))` adicionada à tabela `public.users` via migration.
- [ ] AC2: `AppUser` interface e `getServerUser()` incluem o campo `theme`.
- [ ] AC3: `next-themes` instalado (`npm install next-themes`).
- [ ] AC4: `globals.css` recebe `@custom-variant dark (&:where(.dark, .dark *));` para habilitar `dark:` variants no Tailwind v4.
- [ ] AC5: `globals.css` recebe bloco `.dark { ... }` com variáveis CSS de tema escuro (background, foreground, surface, border, muted).
- [ ] AC6: `ThemeProvider` client component criado em `src/components/theme-provider.tsx`, usando `next-themes` com `attribute="class"` e `defaultTheme="system"`.
- [ ] AC7: `RootLayout` (`src/app/layout.tsx`) envolve `{children}` com `<ThemeProvider>` e passa o tema do usuário logado como `defaultTheme` quando disponível. HTML recebe `suppressHydrationWarning`.
- [ ] AC8: `ThemeToggle` component criado em `src/components/theme-toggle.tsx` — botão com ícone sol/lua/monitor (lucide: `Sun`, `Moon`, `Monitor`), cicla entre `light → dark → system` ao clicar, e ao mudar chama `PATCH /api/user/theme`.
- [ ] AC9: API route `PATCH /api/user/theme` criada em `src/app/api/user/theme/route.ts` — requer `requireAuth()`, valida `body.theme` (`light|dark|system`), atualiza coluna `theme` na tabela `users` filtrando por `appUser.id`.
- [ ] AC10: `ThemeToggle` adicionado ao header mobile (`SidebarNav`) — visível na barra sticky do topo em mobile.
- [ ] AC11: `ThemeToggle` adicionado à seção do usuário na sidebar desktop (`SidebarNav`) — ao lado do avatar/nome.
- [ ] AC12: Ao trocar o tema, a mudança é visualmente imediata (CSS vars) e persiste após reload da página.
- [ ] AC13: Usuário não logado (página `/login`) usa preferência do sistema por padrão, sem erro.

## Dev Notes

### Estrutura de arquivos a criar/modificar

```
CRIAR:
  supabase/migrations/032_user_theme.sql
  src/components/theme-provider.tsx
  src/components/theme-toggle.tsx
  src/app/api/user/theme/route.ts

MODIFICAR:
  src/lib/auth.ts                          (AppUser + getServerUser)
  src/app/layout.tsx                       (ThemeProvider + suppressHydrationWarning)
  src/app/globals.css                      (@custom-variant + .dark vars)
  src/components/layout/sidebar-nav.tsx   (ThemeToggle em mobile e desktop)
```

### Migration SQL (032_user_theme.sql)

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system'
    CONSTRAINT users_theme_check CHECK (theme IN ('light', 'dark', 'system'));
```

### ThemeProvider (src/components/theme-provider.tsx)

```tsx
"use client"
import { ThemeProvider as NextThemesProvider } from "next-themes"
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

### RootLayout — como passar o tema do usuário

O RootLayout é um Server Component. O `ThemeProvider` (client) aceita `defaultTheme`. Em páginas de dashboard, o tema vem do `getServerUser()`. Para o layout raiz (que cobre todas as rotas incluindo `/login`), usar `defaultTheme="system"` e deixar o next-themes sincronizar via localStorage na hidratação. O tema do DB é a fonte autoritativa ao trocar — não é necessário injetar no RootLayout.

```tsx
// src/app/layout.tsx
<html lang="pt-BR" suppressHydrationWarning ...>
  <body>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  </body>
</html>
```

### globals.css — dark vars + Tailwind v4 custom variant

```css
/* Habilita dark: variants pelo .dark class (Tailwind v4) */
@custom-variant dark (&:where(.dark, .dark *));

/* Tema escuro */
.dark {
  --background: #0c0a09;
  --foreground: #fafaf9;
  --color-surface: #1c1917;
  --color-surface-alt: #292524;
  --color-border: #44403c;
  --color-border-light: #292524;
  --color-muted: #a8a29e;
}
```

### ThemeToggle (src/components/theme-toggle.tsx)

```tsx
"use client"
import { useTheme } from "next-themes"
import { Sun, Moon, Monitor } from "lucide-react"
// Cicla: system → light → dark → system
// Chama PATCH /api/user/theme com novo valor
// Ícone: Sun (light), Moon (dark), Monitor (system)
```

### API PATCH /api/user/theme

```ts
// Valida: body.theme in ['light','dark','system']
// Update: supabase.from("users").update({ theme }).eq("id", appUser.id)
// Response: 200 { theme } | 400 | 401 | 500
```

### Sobre hidratação (IMPORTANTE)

- `suppressHydrationWarning` no `<html>` é OBRIGATÓRIO com next-themes para evitar erro de hidratação (servidor renderiza sem classe `.dark`, cliente adiciona após mount).
- `disableTransitionOnChange` evita flash de transição CSS ao carregar.

### Dependência de pacote

```bash
npm install next-themes
# Verificar que é compatível com Next.js 16+ e React 19
```

## Tasks

- [x] T1: Criar migration `supabase/migrations/032_user_theme.sql` e aplicar via `supabase db push` ou MCP
- [x] T2: Instalar `next-themes` (`npm install next-themes` em `packages/web`)
- [x] T3: Atualizar `globals.css` — `@custom-variant dark` + bloco `.dark { ... }` com variáveis
- [x] T4: Criar `src/components/theme-provider.tsx`
- [x] T5: Atualizar `src/lib/auth.ts` — adicionar `theme` ao `AppUser` e ao `select` do `getServerUser()`
- [x] T6: Criar `src/app/api/user/theme/route.ts`
- [x] T7: Criar `src/components/theme-toggle.tsx`
- [x] T8: Atualizar `src/app/layout.tsx` — ThemeProvider + suppressHydrationWarning
- [x] T9: Atualizar `src/components/layout/sidebar-nav.tsx` — ThemeToggle em mobile header e desktop user section
- [x] T10: Testar ciclo completo: trocar tema → UI muda imediatamente → reload mantém → verificar DB

## Testing

- Trocar tema para `dark` → classe `.dark` aparece no `<html>` → UI muda
- Recarregar página → tema persistido (localStorage + DB)
- Outro device/browser com mesmo login → tema sincronizado via DB no próximo load
- Página `/login` (sem auth) → sem erro, usa sistema
- Usuário `obras` e `admin` → ambos conseguem trocar tema

## QA Gate

- Sem erros de hidratação no console
- `type-check` sem erros
- Lint sem warnings

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log
- Import alias `@/` não existe no projeto — corrigido para `@web/` (conforme tsconfig paths)
- `useEffect + setState` bloqueado pelo lint `react-hooks/set-state-in-effect` — substituído por verificação `theme === undefined` (next-themes retorna undefined antes do mount)
- `use-user.ts` precisou de `theme` adicionado ao select e ao setUser para satisfazer AppUser interface

### Completion Notes
- Migration 032_user_theme.sql criada e aplicada via MCP (ADD COLUMN IF NOT EXISTS)
- next-themes instalado via pnpm --filter web
- ThemeToggle cicla light → dark → system e persiste no DB via PATCH /api/user/theme
- suppressHydrationWarning no <html> para evitar erros de hidratação com next-themes
- type-check: 0 erros | lint: 0 erros (7 warnings pré-existentes)

### File List
- `supabase/migrations/032_user_theme.sql` (CRIADO)
- `packages/web/src/components/theme-provider.tsx` (CRIADO)
- `packages/web/src/components/theme-toggle.tsx` (CRIADO)
- `packages/web/src/app/api/user/theme/route.ts` (CRIADO)
- `packages/web/src/lib/auth.ts` (MODIFICADO — theme em AppUser + select)
- `packages/web/src/hooks/use-user.ts` (MODIFICADO — theme em select + setUser)
- `packages/web/src/app/layout.tsx` (MODIFICADO — ThemeProvider + suppressHydrationWarning + lang pt-BR)
- `packages/web/src/app/globals.css` (MODIFICADO — @custom-variant dark + .dark vars)
- `packages/web/src/components/layout/sidebar-nav.tsx` (MODIFICADO — ThemeToggle em mobile header e desktop user)
- `packages/web/package.json` (MODIFICADO — next-themes adicionado)

### Change Log
- 2026-05-13: Story 30.1 implementada — infraestrutura completa de tema claro/escuro
