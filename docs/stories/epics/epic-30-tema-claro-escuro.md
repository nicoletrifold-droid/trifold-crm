---
epic: 30
title: Sistema de Tema Claro/Escuro
status: In Progress
created_at: 2026-05-13
updated_at: 2026-05-13
created_by: River (@sm)
priority: P1
depends_on: []
blocks: []
stories_planned: [30.1, 30.2]
estimated_points: 8
estimated_duration: ~2 dias úteis
---

# Epic 30 — Sistema de Tema Claro/Escuro

## Objetivo

Permitir que cada usuário escolha o tema visual do sistema (claro, escuro ou preferência do sistema operacional). A preferência é persistida no banco de dados e aplicada em todas as páginas do sistema.

## Escopo

- Todas as páginas: dashboard, login, obras, brindes, portal cliente
- Toggle no topo da interface (mobile: header sticky; desktop: seção do usuário na sidebar)
- Padrão: preferência do sistema operacional (`system`)
- Persistência: coluna `theme` na tabela `public.users`

## Stories

| Story | Título | Pontos | Status |
|-------|--------|--------|--------|
| 30.1 | Infraestrutura: DB + API + ThemeProvider + Toggle | 5 | Draft |
| 30.2 | Aplicação de dark: variants em todos os componentes | 3 | Draft |

## Decisões técnicas

- **next-themes**: gerencia classe `.dark` no `<html>`, SSR-safe, `suppressHydrationWarning`
- **Tailwind v4**: `@custom-variant dark (&:where(.dark, .dark *));` em globals.css
- **Persistência**: DB como fonte autoritativa; localStorage como cache do next-themes
- **Carga inicial**: `getServerUser()` lê `theme` do DB → passado ao ThemeProvider como `forcedTheme` ou `defaultTheme`
