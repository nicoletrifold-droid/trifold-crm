# UX Validation Report — Epic 18 (Central de Email)

**Date:** 2026-04-29
**Validator:** Uma (@ux-design-expert) — Empathizer ♋
**Epic:** 18 — Central de Email
**Stories validated:** 18.2, 18.3, 18.6, 18.7, 18.8
**Reference pattern:** `packages/web/src/app/dashboard/sistema/webhooks/page.tsx` (Story 16.6) and `packages/web/src/app/dashboard/sistema/page.tsx`
**Decision:** **GO-WITH-NOTES**

---

## Executive Summary

Epic 18 has well-structured stories with clear UI specifications that broadly align with the existing Trifold CRM dashboard pattern (stone-50 background, white cards with `rounded-lg border border-stone-200`, status badges with `bg-{color}-50 / text-{color}-700`, and 30s auto-refresh). The five frontend stories (18.2, 18.3, 18.6, 18.7, 18.8) are implementable as written with **non-blocking adjustments**.

The strongest story is 18.2 (Email Design System) — its inline-CSS, table-based approach is the correct decision for Gmail/Outlook compatibility. The biggest risk is **WCAG AA contrast failure on two color tokens** in the email design system (muted text `#9ca3af` on `#f9fafb` and accent button `#4f46e5` background must be verified). Wizard story 18.8 also lacks loading/processing states between wizard steps and after the final confirmation click.

Implementation can proceed in the dependency order (18.2 → 18.3 → 18.6 → 18.7 → 18.8) provided the items in **"Required Changes Before Implementation"** are addressed during development.

---

## Story Validation Results

### 18.2 — Email Design System

**Status:** APPROVED-WITH-MINOR-FIXES

**Strengths:**
- Inline CSS exclusively + table-based layout is the correct technical choice. Gmail strips `<style>` from `<head>` and Outlook (Word renderer) requires `<table>` for reliable layout. AC5 enforces this correctly.
- Token system in `styles.ts` is well-organized with semantic naming (`primary`, `accent`, `text.muted`).
- 600px max-width is the email industry standard.
- `previewText` with `display:none` is a thoughtful detail that improves inbox listing UX.
- Zero external dependencies (AC8) — keeps bundle size minimal.

**Findings:**

1. **WCAG AA contrast risk (Footer text).** Token `text.muted: #9ca3af` on muted background `#f9fafb` measures **3.13:1 contrast ratio** — FAILS WCAG AA for body text (needs ≥4.5:1). The footer is small (12px) which makes it worse. Recommended remedy: use `#6b7280` (`text.secondary`) for footer body text instead, which gives 5.74:1 on `#f9fafb`. Keep `#9ca3af` only for placeholder/decorative text.

2. **WCAG AA contrast risk (CTA button).** Accent `#4f46e5` with white text gives **5.39:1** — PASSES AA for normal text but is borderline. Verify this in the actual rendered email. Acceptable as-is.

3. **Header logo rendering.** AC3 says "Texto 'Trifold' ou `options.orgName`" — text-based logo is fine for MVP, but consider adding a comment in `header.ts` clarifying that future iteration may swap to an `<img>` with a CDN-hosted PNG logo (since email clients block CSS background-image). Not blocking.

4. **Missing tablet/mobile breakpoint behavior.** The 600px table is correct but mobile clients (iOS Mail, Gmail mobile) need `width="100%"` declarations on inner tables and `max-width: 600px` styling to avoid horizontal scroll on narrow screens. The structure shown in Dev Notes already does `<table width="100%">` on the outer wrapper — confirm this pattern is followed in `renderHeader()` and `renderFooter()` too.

5. **Preview text length not specified.** AC6 mentions `previewText` but doesn't specify max length. Most clients display ~90-120 characters. Recommend documenting "Manter `previewText` entre 40-100 caracteres" in `styles.ts` constants.

**Recommendations:**
- Update `emailTokens.colors.text.muted` documentation: "Use only for decorative/placeholder text. For body text on `#f9fafb`, use `text.secondary` instead."
- Add a `previewTextMaxLength: 100` constant for documentation purposes.
- Add a 5th unit test: `renderBaseLayout(content, { previewText: 'abc' })` should include `display:none` style on the preview span.

---

### 18.3 — Templates Admin UI

**Status:** APPROVED-WITH-MINOR-FIXES

**Strengths:**
- 3-page structure (list / new / [id]) follows the standard Next.js App Router pattern and matches existing `/dashboard/sistema/` conventions.
- Component decomposition is well-scoped: `template-form.tsx` (organism) composed of `variable-editor.tsx` and `preview-modal.tsx` (molecules). Atomic Design alignment is good.
- Auto-detection of `{{variable}}` is intuitive — users won't need to manually declare variables.
- Soft-delete via `is_active = false` (AC1 "Arquivar") preserves email_logs FK integrity. Excellent.
- RBAC pattern (AC7) explicitly references the existing `webhook-logs/route.ts` proven pattern. No invention.
- Preview modal renders through `renderBaseLayout()` from 18.2 — proves end-to-end consistency.

**Findings:**

1. **Empty state UNDEFINED.** The story does not specify what the table shows when zero templates exist for an org. The reference `webhooks/page.tsx` line 134-137 has the pattern: `<div className="px-4 py-8 text-center text-sm text-stone-400">Nenhum evento encontrado</div>`. Recommend adding to AC1: "Quando não há templates, exibir mensagem 'Nenhum template criado. Clique em Novo Template para começar.' no corpo da tabela."

2. **Loading skeleton UNDEFINED.** No specification for the loading state of either page. Reference pattern uses `<p className="text-stone-400">Carregando...</p>`. Recommend adding to Dev Notes: "Use o padrão de loading existente em `webhooks/page.tsx` (mensagem centralizada)."

3. **Variable editor UX ambiguity.** AC3 says "Variáveis removidas do texto desaparecem da seção automaticamente" — but what happens to the Label/Type/Required metadata when a variable is removed and re-added? Recommended behavior: persist metadata in component state by variable name (so removing+re-adding `{{nome}}` keeps the label "Nome do destinatário"). This is an Empathizer concern: users will accidentally cut/paste text and lose work otherwise.

4. **Preview modal close interaction.** AC4 says "Modal tem botão de fechar" — should also close on ESC key and on backdrop click. Standard expectation, but document it explicitly to avoid omission.

5. **Slug uniqueness handling.** Auto-generated slugs from name will collide for "Boas-vindas" → "boas-vindas" if two templates are named the same. AC2 doesn't say what happens on slug collision. Recommended: append `-2`, `-3` suffix on POST when collision detected. Document this in Dev Notes.

6. **Button styling not specified.** "Salvar Rascunho" vs "Publicar" should have visual hierarchy: "Publicar" as primary (filled bg-stone-900 text-white per project pattern) and "Salvar Rascunho" as secondary (border-only). This isn't called out in AC5.

7. **Mobile responsiveness.** Three-column tabular form (Label / Tipo / Obrigatório) for variables will be cramped on mobile (<640px). Recommend stacking vertically on small screens. Use `grid-cols-1 sm:grid-cols-3` pattern.

**Recommendations:**
- Add empty state and loading state specs to AC1 (one bullet each).
- Document variable metadata persistence behavior in Dev Notes.
- Add "Modal fecha ao pressionar ESC ou clicar fora" to AC4.
- Add slug collision policy to Dev Notes.
- Specify button hierarchy in AC5: Publicar = primary (`bg-stone-900 text-white`), Salvar Rascunho = secondary (`border border-stone-300`).

---

### 18.6 — Central de Monitoramento

**Status:** APPROVED-WITH-MINOR-FIXES

**Strengths:**
- 4-card metric layout (AC1) explicitly mirrors the working pattern from `dashboard/sistema/page.tsx` lines 130-151 (`grid grid-cols-2 gap-3 lg:grid-cols-4`, white cards with `border border-stone-200`).
- 30s auto-refresh (AC5) is consistent with the entire dashboard ecosystem (lines 78-80 of webhooks page, line 84 of sistema page).
- Filters: period + status + template + search match the layered-filter pattern in `webhooks/page.tsx`.
- Resend button condition is clear: only shown for `status = 'failed'`.
- Telegram alert rate-limiting (AC7) is thoughtful — prevents alert fatigue.

**Findings:**

1. **CRITICAL: 8-status badge color system has a contrast risk.** The proposed mapping:
   - `pending` → cinza
   - `sent` → azul claro
   - `delivered` → verde claro
   - `opened` → verde
   - `clicked` → roxo
   - `bounced` → vermelho
   - `complained` → laranja
   - `failed` → vermelho escuro

   Issues:
   - "Verde claro" (delivered) and "verde" (opened) are too similar — users will not visually distinguish them. Recommend: `delivered` = `bg-emerald-50 text-emerald-700` (light) and `opened` = `bg-emerald-100 text-emerald-800` (slightly darker, with stronger weight) or use a different hue family.
   - "Vermelho" (bounced) and "vermelho escuro" (failed) — same issue. Recommend: `bounced` = `bg-red-50 text-red-700` and `failed` = `bg-red-100 text-red-900` with bold weight, OR use a "skull" icon prefix on `failed` for ultra-clear distinction.
   - **Color-only signaling fails WCAG 1.4.1 (Use of Color).** Add a status icon (✓, ⏱, ✗, ⚠) prefix or an aria-label to each badge so non-visual users distinguish them.

2. **Filter UX ambiguity.** AC3 lists 4 filters (period, status, template, search) but doesn't specify the layout. With 4 controls plus "Reenviar" buttons, the filter row will overflow on tablets. Recommend: filters in a single row on `lg:` (≥1024px), wrapping to 2x2 grid on `sm:` (≥640px), and stacked on mobile.

3. **Auto-refresh communication.** AC5 says "auto-refresh a cada 30s" but the current `webhooks/page.tsx` doesn't visually indicate when the refresh happens (no spinner, no timestamp). Users may miss that the data is live. Recommend: add a subtle "Atualizado há Xs" text in the header (similar to GitHub's "Updated X minutes ago"), updating the relative time every second.

4. **Alerts panel hierarchy.** AC4 mentions "vermelho > laranja > amarelo" implicit hierarchy but the visual specification isn't tied to atomic tokens. Recommend explicit mapping:
   - Critical (red): `bg-red-50 border-red-300 text-red-900` + AlertCircle icon
   - High (orange): `bg-orange-50 border-orange-300 text-orange-900` + AlertTriangle icon
   - Warning (yellow): `bg-amber-50 border-amber-300 text-amber-900` + Info icon

5. **Bounce card threshold visualization.** AC1 says "badge vermelho se > 5%" but doesn't specify what happens at exactly 5%. Decide: `>= 5%` triggers red (more conservative for compliance) vs `> 5%`. Recommend `>= 5%` with documentation.

6. **Resend button placement.** Putting "Reenviar" inside the table row creates a wide actions column. Reference `webhooks/page.tsx` uses a compact expandable row pattern (line 144). Consider: "Reenviar" only appears when row is expanded, not in the collapsed view, to keep the row clean.

7. **Empty state UNDEFINED for filtered results.** What if user filters to "Status: bounced" but there are zero bounced emails? Need empty state specific to filter context: "Nenhum email com status 'bounced' no período selecionado."

**Recommendations:**
- Replace color-only status with **icon + color** combination. Reference Lucide icons: `Clock`, `Send`, `CheckCircle`, `Eye`, `MousePointer`, `AlertTriangle`, `XOctagon`, `Ban`.
- Add filter row responsive layout to AC3.
- Add "Atualizado há Xs" indicator in Dev Notes.
- Specify alert color tokens explicitly in AC4.
- Add empty-state-with-filter spec to AC2.

---

### 18.7 — Automações de Email

**Status:** APPROVED-WITH-MINOR-FIXES

**Strengths:**
- Table structure (Nome, Trigger, Template, Delay, Status) matches webhooks/templates pattern.
- Conditional trigger filter (show "status alvo" select only when trigger is "lead.status_changed") is good progressive disclosure.
- Toggle activate/deactivate (AC1) is the right interaction for a binary state — much better than separate enable/disable buttons.
- Deduplication (AC7) prevents lead-fatigue automatically.

**Findings:**

1. **Conditional trigger filter UX not detailed.** AC2 says "Filtro de trigger (condicional ao trigger selecionado)" — but doesn't specify:
   - Whether the field appears with animation/transition (recommend: simple show/hide, no animation, to avoid layout jitter)
   - Whether changing the trigger clears the filter (recommend: yes — prevents stale filter values)
   - Whether the filter is required when the trigger requires it (recommend: yes — block submit if trigger=`lead.status_changed` and no status selected)

2. **Toggle vs delete confirmation asymmetry.** AC1 says toggle ativar/desativar has no confirmation, but "Excluir" has confirmation. Disabling an automation is reversible (toggle back); deletion is destructive. The pattern is correct but should be explicit: "Toggle desativa imediatamente sem confirmação. Excluir abre modal de confirmação com texto: 'Esta ação não pode ser desfeita. Tem certeza?'"

3. **Trigger select labels.** AC2 lists "Lead criado", "Lead mudou status", "Follow-up diário" — these are clear. However, consider adding a small description below each option in the select (e.g., a tooltip): "Lead criado — Dispara quando um novo lead é cadastrado". Not blocking but improves discoverability.

4. **Delay select values.** AC2 lists Imediato / 1h / 24h / 48h / 72h. Consider adding "12h" — common for evening-to-morning follow-ups. Not blocking.

5. **No empty state defined.** Same gap as 18.3, 18.6: "Nenhuma automação configurada. Clique em Nova Automação para começar."

6. **No loading state during toggle save.** Toggling activate/deactivate sends a PUT — what does the UI do during the request? Show optimistic update (instant toggle, revert on error) OR disable the toggle during request. Recommend: optimistic update with toast on error.

**Recommendations:**
- Document conditional trigger filter behavior (clear on change, required when applicable) in AC2.
- Document confirmation asymmetry in AC1 (no confirm on toggle, confirm modal on delete).
- Add empty state spec.
- Document optimistic UI for toggle in Dev Notes.

---

### 18.8 — Campanhas Manuais (Blast)

**Status:** APPROVED-WITH-MINOR-FIXES (highest UX risk of the epic)

**Strengths:**
- 3-step wizard with clear progression: Audience → Content → Schedule. Standard pattern.
- Real-time audience count (AC2 Step 1) gives users confidence about scope before sending.
- Quota distribution warning ("X leads, distribuído em Z dias") is honest and prevents user surprise.
- Double-click protection (AC8) is the right defensive UX for a destructive action with high blast radius.
- Cancel button condition (status=agendado/em_andamento AND 0 emails sent) is conservative — prevents partial cancellation chaos.
- Status badges (Rascunho / Agendado / Em andamento / Concluído / Cancelado) form a clear lifecycle.

**Findings:**

1. **CRITICAL: Wizard navigation UX not specified.** AC2 describes 3 steps but doesn't specify:
   - Back/Next button placement (recommend: bottom-right, "Voltar" left of "Continuar")
   - Whether "Voltar" preserves data entered in next steps (recommend: yes — don't punish users for backtracking)
   - Whether step 1 → 2 transition validates audience > 0 (recommend: block "Continuar" if 0 leads selected)
   - Whether the user sees a visual progress indicator (recommend: stepper "1 Audiência > 2 Conteúdo > 3 Confirmação" at top)

2. **Audience count loading state UNDEFINED.** AC2 says "Contagem de destinatários após seleção do segmento (query em tempo real)" — what does the UI show during the query? A spinner? "Calculando..."? With multi-select on 4 dimensions (status, source, property, all leads), the count query may take 200-800ms. Recommend: skeleton "Calculando..." with debounce 300ms on filter changes.

3. **Distribution preview clarity.** Step 3 says "exibir estimativa de distribuição (ex: 100 hoje, 100 amanhã, 50 depois de amanhã)" — render this as a small visual breakdown, not just text:
   ```
   Hoje (29/04):     [██████████] 100 emails
   Amanhã (30/04):   [██████████] 100 emails
   01/05:            [█████░░░░░] 50 emails
   ```
   This is much more empathetic than a sentence.

4. **Double-click protection state machine.** AC8 describes the 3-second window but doesn't specify:
   - What text shows on the button during the 3s window? Recommend: "Clique novamente para confirmar (3s)" with a visual countdown
   - What happens visually when the timer expires? Recommend: button shake or fade-pulse animation to indicate reset
   - On mobile/touch — does long-press count? Recommend: explicitly document "double-click" works on all input types (mouse click, touch tap, keyboard Enter)

5. **Preview accuracy disclaimer.** Step 2 shows preview "com dados do primeiro lead da audiência" — but if the audience changes between Step 1 and Step 2 (user goes back), the preview must refresh. Document this in Dev Notes.

6. **Cancel button safety.** The history page shows "Cancelar" button on agendado/em_andamento blasts with 0 emails sent. What if a blast is in `em_andamento` and 5 of 50 emails were already sent? AC1 says "(apenas se 0 emails enviados)" — so the button doesn't show. Good. But consider adding a passive message on the row: "Cancelamento indisponível: 5 emails já enviados" to explain the absence of the button (better than silent invisibility).

7. **History table "Audiência" column ambiguity.** AC1 lists "Audiência" but doesn't say what's shown. Recommend: total recipient count + a small icon/text summarizing the segment (e.g., "342 leads · Status: Qualificado").

8. **No loading state after final confirm.** After the user clicks "Confirmar e Enviar" (twice), the API enqueues N emails. What does the UI do? Recommend: navigate to `/dashboard/sistema/email-blasts/[id]` (the blast detail page from history), showing live "Enfileirando 342 emails..." progress — much better than just navigating to the list.

9. **Empty state on history page UNDEFINED.** "Nenhum blast criado ainda. Clique em Novo Blast para enviar sua primeira campanha."

**Recommendations:**
- Add wizard navigation spec to AC2 (back/next buttons, progress stepper, validation gates).
- Add audience count loading skeleton spec.
- Document distribution preview as visual breakdown.
- Add double-click button text and timer countdown spec.
- Add post-confirm navigation flow spec.
- Add empty states spec.

---

## Global UX Issues

### 1. Empty states inconsistent across stories
None of the 5 stories explicitly define empty states except in the most general terms. The reference `webhooks/page.tsx` has a clear pattern (line 135). All table-based pages in Epic 18 should follow this pattern uniformly:

```tsx
<div className="px-4 py-8 text-center text-sm text-stone-400">
  {emptyMessage}
</div>
```

**Required:** Add a single sentence to each story's AC defining the empty-state copy.

### 2. Loading states underspecified
The reference pattern uses a centered "Carregando..." text (line 104 of webhooks). All 5 stories should explicitly reference this pattern in Dev Notes — currently none do.

### 3. Admin role protection — pattern is consistent (good)
All 5 stories reference the same `member?.role !== 'admin'` check. This is excellent. The redirect-or-403 dichotomy is also handled consistently (pages redirect, APIs return 403). ✅

### 4. Mobile responsiveness underspecified
The dashboard layout (`packages/web/src/app/dashboard/layout.tsx` line 72-76) has `lg:pl-56` for sidebar offset and `max-w-6xl` content cap. Forms and tables in 18.3, 18.7, 18.8 must use the existing `grid-cols-1 lg:grid-cols-N` responsive pattern. Currently not enforced in the stories.

### 5. Navigation between admin pages
Sistema has 4 sibling pages now (root, webhooks, email-templates, email-automacoes, emails, email-blasts). The current sidebar (line 39 of layout.tsx) only has one "Sistema" entry. Consider adding sub-navigation or breadcrumbs within `/dashboard/sistema/*` pages to help admins navigate. Not blocking — can be addressed in a follow-up story.

### 6. Status badge token consistency across stories
Stories 18.3 (Ativo/Rascunho), 18.6 (8 email statuses), 18.7 (Ativa/Inativa), 18.8 (5 blast statuses) all define different status badges. To prevent fragmentation, recommend creating a shared `StatusBadge` component during 18.3 (the first frontend story) and reusing it. This aligns with Atomic Design — Atom level.

### 7. Date/time formatting consistency
The reference pattern (webhooks page line 82-92) uses `pt-BR / America/Sao_Paulo`. All 5 stories must use this exact formatter. Recommend extracting to a utility `formatBRTime(iso)` in `packages/web/src/lib/format.ts` during 18.3, used by all subsequent stories.

### 8. Color-only signaling (WCAG 1.4.1)
Stories 18.3, 18.6, 18.7, 18.8 all use color-only badges. Add icon prefixes or aria-labels to comply with WCAG 1.4.1.

---

## Required Changes Before Implementation

These are CRITICAL items that should be fixed before @dev starts. Ranked by priority:

| # | Story | Item | Severity |
|---|-------|------|----------|
| 1 | 18.2 | Footer text uses `#9ca3af` (3.13:1 ratio on `#f9fafb`) — fails WCAG AA. Use `#6b7280` for body text. | **HIGH** (compliance) |
| 2 | 18.6 | "delivered" vs "opened" green tones too similar. Use distinct shade pairs + add status icons. | **HIGH** (UX correctness) |
| 3 | 18.6 | "bounced" vs "failed" red tones too similar. Differentiate via shade + icon. | **HIGH** (UX correctness) |
| 4 | 18.8 | Wizard navigation (back/next, progress stepper, step validation gates) is UNDEFINED. | **HIGH** (blocking implementation) |
| 5 | 18.8 | Post-confirm flow UNDEFINED — where does the user land after clicking "Confirmar e Enviar"? | **HIGH** (blocking implementation) |
| 6 | All | Empty states not specified. Add 1-line copy per story. | **MEDIUM** |
| 7 | All | Loading states not specified. Reference `webhooks/page.tsx` pattern. | **MEDIUM** |
| 8 | 18.3, 18.6, 18.7, 18.8 | Color-only badges fail WCAG 1.4.1. Add icon prefixes. | **MEDIUM** (compliance) |
| 9 | 18.3 | Variable metadata persistence behavior (cut/paste safety) UNDEFINED. | **MEDIUM** (UX safety) |
| 10 | 18.8 | Distribution preview should be a visual breakdown, not a text sentence. | **LOW** (delight) |

---

## Implementation Order Recommendation

The dependency graph (`depends_on:` fields) allows the following sequence. **No reordering needed** — the existing dependency tree is correct:

```
1. 18.2 — Email Design System (no deps; can run in parallel with 18.4)
   └─ Outputs: renderBaseLayout(), emailTokens, renderButton()
       │
2. 18.3 — Templates Admin UI (deps: 18.1, 18.2)
   └─ Outputs: Templates CRUD, preview API, RBAC pattern, StatusBadge atom
       │
3. 18.6 — Central de Monitoramento (deps: 18.1, 18.4, 18.5)
   └─ Outputs: Email logs dashboard, alerts panel, resend API
       │
4. 18.7 — Automações de Email (deps: 18.1, 18.3, 18.4)
   └─ Outputs: Triggers, automations CRUD, deduplication
       │
5. 18.8 — Campanhas Manuais Blast (deps: 18.1, 18.3, 18.4, 18.6)
   └─ Outputs: Blast wizard, audience segmentation, distribution
```

**Why this order works for UX:**
- 18.2 establishes design tokens FIRST → all later stories inherit visual consistency.
- 18.3 establishes the admin UI shell + RBAC pattern + StatusBadge atom → 18.6, 18.7, 18.8 reuse.
- 18.6 establishes the dashboard pattern (cards + table + filters) → 18.8 history page reuses.
- 18.7 builds on templates from 18.3 → automations don't exist without templates.
- 18.8 last — has the highest UX risk and benefits from all preceding patterns.

**Parallelization opportunity:** 18.6 (frontend-only after engine 18.4 is done) can start while 18.7 backend triggers are being implemented. They share no UI components.

---

## Design Token Summary (Story 18.2 — Dev Reference)

This consolidates the email design tokens for quick @dev reference:

### Colors

| Token | Value | Usage | WCAG AA on white | WCAG AA on #f9fafb |
|-------|-------|-------|------------------|--------------------|
| `colors.primary` | `#1a1a2e` | Header bar, primary brand | 16.99:1 ✅ | 16.18:1 ✅ |
| `colors.accent` | `#4f46e5` | CTA button bg | 5.89:1 ✅ | 5.61:1 ✅ |
| `colors.background` | `#f3f4f6` | Body bg | — | — |
| `colors.surface` | `#ffffff` | Card bg | — | — |
| `colors.muted` | `#f9fafb` | Footer bg | — | — |
| `colors.border` | `#e5e7eb` | Card border | — | — |
| `colors.text.primary` | `#111827` | Body text | 17.86:1 ✅ | 17.01:1 ✅ |
| `colors.text.secondary` | `#6b7280` | Secondary text | 5.74:1 ✅ | 5.46:1 ✅ |
| `colors.text.muted` | `#9ca3af` | **Decorative only** | 2.85:1 ❌ | 3.13:1 ❌ — DO NOT use for body |
| `colors.text.inverse` | `#ffffff` | Text on dark bg | — | — |

### Typography

| Token | Value |
|-------|-------|
| `fonts.base` | `Inter, Arial, sans-serif` (Inter is requested but Arial is the fallback that actually renders in most email clients) |
| `fonts.sizes.sm` | `12px` (footer, fine print) |
| `fonts.sizes.base` | `14px` (body text) |
| `fonts.sizes.md` | `16px` (emphasized body) |
| `fonts.sizes.lg` | `20px` (header logo) |

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `spacing.sm` | `8px` | Tight spacing |
| `spacing.md` | `16px` | Default gap |
| `spacing.lg` | `24px` | Section padding |
| `spacing.xl` | `32px` | Card padding |

### Layout

| Token | Value |
|-------|-------|
| `maxWidth` | `600px` (email industry standard) |
| `borderRadius.card` | `8px` |
| `borderRadius.button` | `6px` |

### Compatibility Notes for @dev

- **Inline `style=""` only** — no `<style>` blocks, no classes.
- **Table-based layout** — all structural elements use `<table>`, not `<div>`. Outlook (Word renderer) requires this.
- **`width="100%"` on outer table** — for mobile responsive behavior.
- **`display:none` for preview text** — but content still indexed by Gmail/iOS Mail for inbox preview.
- **Inter font requires fallback** — most email clients ignore web fonts; `Arial, sans-serif` is what actually renders.
- **No `<img>` background-image via CSS** — Gmail strips it. If logo image is added in v2, use `<img src="">` with explicit `width` and `height` attributes.

---

## Final Decision: GO-WITH-NOTES

Epic 18 is implementable. The core UX patterns are sound, dependencies are correct, and the existing dashboard reference (`/dashboard/sistema/webhooks/page.tsx`) provides a strong template for visual consistency.

**Conditions for GO:**
1. Items 1-5 in "Required Changes Before Implementation" must be addressed (during @dev work, not blocking story start).
2. The shared `StatusBadge` atom and `formatBRTime` utility should be extracted in 18.3 and reused by 18.6, 18.7, 18.8.
3. Empty states + loading states must follow the `webhooks/page.tsx` reference uniformly.
4. WCAG AA contrast must be re-verified on the actual rendered email (18.2) before merge.

@dev can begin Story 18.2 immediately. The other 4 frontend stories (18.3, 18.6, 18.7, 18.8) follow the dependency chain naturally.

— Uma, desenhando com empatia 💝
