# QA Agent Memory

## Freelans Project Patterns

### Feature Module Structure (confirmed across certifications, services, FAQs)
- `features/{name}/components/` - UI components
- `features/{name}/services/` - API service layer
- `features/{name}/schemas/` - Zod schemas
- `features/{name}/index.ts` - Barrel exports

### API Route Patterns
- Auth: `getRequiredSession()` + `requireProfessional(user)` on all endpoints
- Ownership: `findFirst({ where: { id, professionalId: profile.id } })` -- never `findUnique({ where: { id } })`
- Error format: `{ error: { code: string, message: string } }` with optional `details`
- Limit enforcement: check count before create, return 422/LIMIT_EXCEEDED

### Profile Completeness WEIGHTS (as of Epic 11)
- hasAvatar: 10, hasDescription: 10, hasDifferentials: 8, hasCoverageCities: 8
- hasPricing: 15, hasBusinessHours: 15, hasFAQs: 8, hasPaymentMethods: 8
- hasPhotos: 10, hasCertifications: 8
- **Total: 100** -- ALWAYS verify sum when new weights are added

### Smart Actions Priority Order (as of Epic 11)
1. add-photo, 2. set-hours, 3. add-services, 4. add-certifications
5. create-faqs, 6. payment-methods, 7. complete-description, 8. add-avatar, 9. verify-cnpj

### Test Infrastructure
- Vitest, not Jest
- Test files in `__tests__/` directories or `*.test.ts`
- Insights tests: profile-completeness.test.ts, rules.test.ts, engine.test.ts
- When adding fields to ProfessionalData/SmartActionsData, fixtures in ALL test files must be updated

### Auth & Feature Gating Chain (Epic 12)
- `/api/auth/me` returns `activePlan: 'free' | 'premium' | 'ai_premium' | null`
- `auth-store.ts` UserData interface includes `activePlan`
- `useAuth()` hook exposes `activePlan: user?.activePlan ?? null`
- Pattern: `activePlan === 'ai_premium'` for gating checks (strict equality)
- Both `dashboard-nav.tsx` and `dashboard-bottom-nav.tsx` consume `activePlan`

### Dashboard Shared Components (Epic 12)
- Location: `apps/web/src/features/dashboard/components/shared/`
- Components: PageHeader, PageContainer, IncentiveBanner, EmptyState, ConfirmDialog
- Barrel export: `@/features/dashboard/components/shared`
- PageContainer: `max-w-5xl mx-auto space-y-6` (layout main has padding only, no width)

### Brand Token Conventions (Epic 12)
- Primary blue: `#1B4FD8`, Success: `#027A48`/`#6CE9A6`/`#ECFDF3`
- Neutral bg: `#F5F5FA`, Neutral border: `#E8E8F0`, Disabled text: `#B8B8C5`
- Verde Receita `#1A7A4A` is EXCLUSIVE to Selo CNPJ contexts

### Navigation Architecture (Epic 12)
- Desktop sidebar: `DashboardNav` in layout.tsx aside
- Mobile: `DashboardMobileShell` -> `DashboardBottomNav` (4 slots) + `MobileDashboardNav` (drawer)
- framer-motion used in `dashboard-bottom-nav.tsx` and `smart-actions-grid.tsx` (client components only)

### Common QA Review Corrections
- Previous review of 11.2 incorrectly stated `window.confirm()` was used; actual implementation uses shadcn AlertDialog -- always verify actual code, not just spec assumptions
- Test fixture updates may lag behind interface changes -- always run `vitest run` to confirm
- All 134 test files / 1281 assertions as of Epic 12+13

## Trifold CRM Project

- [project_trifold_dev_ports.md](project_trifold_dev_ports.md) — Port 3000 locally is often Markuva, not Trifold — verify before browser-driving
- [project_supabase_auth_cookie_not_httponly.md](project_supabase_auth_cookie_not_httponly.md) — sb-*-auth-token is NOT httpOnly in Trifold (Supabase SSR design); validate logout by cookie removal, not flag state
- [project_epic_31_qa_patterns.md](project_epic_31_qa_patterns.md) — Epic 31 (Nicole Data Layer) QA patterns + lint web pré-existente conhecido (eslint-plugin-import no Next 16)
- [project_story_31_2_gate_passed.md](project_story_31_2_gate_passed.md) — Story 31.2 (migration 043 CHECK constraint) PASS — 9 patterns para validar DDL JSON CHECK em produção (Management API + convalidated + post-rollback verify)
