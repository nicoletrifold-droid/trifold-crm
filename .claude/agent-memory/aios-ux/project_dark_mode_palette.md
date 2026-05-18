---
name: Trifold CRM — dark-mode palette conventions
description: Token mapping used when adding dark: variants for the stone-based palette in packages/web
type: project
---

When adding `dark:` variants in `packages/web`, prefer this mapping (kept in sync with `.dark` CSS vars in `globals.css`):

| Light token | Dark variant |
|------------|--------------|
| `bg-white` (surface card) | `dark:bg-stone-900` (+ optional `dark:ring-1 dark:ring-stone-800`) |
| `bg-stone-50` (page bg) | `dark:bg-stone-950` |
| `border-stone-200` | `dark:border-stone-800` |
| `border-stone-100` | `dark:border-stone-800` |
| `text-stone-900` / `text-gray-900` | `dark:text-stone-100` |
| `text-stone-500` / `text-gray-500` | `dark:text-stone-400` |
| `text-stone-400` | `dark:text-stone-500` |
| `hover:bg-stone-50` | `dark:hover:bg-stone-800/60` |
| `bg-orange-50 text-orange-700` (active state) | `dark:bg-orange-500/15 dark:text-orange-300` |
| `bg-orange-100 text-orange-700` (avatar) | `dark:bg-orange-500/20 dark:text-orange-300` |
| Status pills `bg-X-100 text-X-700` | `dark:bg-X-500/15 dark:text-X-300` |
| Logo `brightness-0` | add `dark:brightness-0 dark:invert` (logo becomes white) |

**Why:** Story 30.1 ships dark mode via `next-themes` + `attribute="class"` and a `@custom-variant dark (&:where(.dark, .dark *));` in `globals.css`. The CSS vars in `.dark` use stone-950/900/800 surfaces; staying inside this scale keeps cards/borders/text consistent across the app.

**How to apply:** When migrating an existing page, do not rewrite to CSS vars — just append `dark:` Tailwind variants next to the existing light classes. Cards on `bg-stone-950` page background read better with `bg-stone-900` + a subtle `ring-1 ring-stone-800` than with raw `bg-stone-900` alone (border looks too soft against the dark backdrop).
