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
- [project_epic_35_qa_patterns.md](project_epic_35_qa_patterns.md) — Epic 35 (Roles & Permissions) QA patterns: 17 módulos canônicos, fallback hardcoded espelhado, grep patterns p/ validar migração completa de guards
- [project_epic_52_qa_patterns.md](project_epic_52_qa_patterns.md) — Epic 52 (agente CRM read-only) QA: 52-1/52-4 PASS validado em runtime DEV; user_role() (NÃO JWT app_metadata); REVOKE deterministico p/ append-only no Supabase (TRUNCATE não passa RLS); admin-only testado c/ non-admin da MESMA org; SEC-002 forward-gate da 52-2
- [Mutação prova teste real](feedback_mutacao_prova_teste_real.md) — mutar FORMA e não contagem; mock síncrono nunca prova `await`; "virou tautologia?" se responde desmigrando a chamada
- [Trava de cron: recibo vs evento](project_cron_lock_recibo_vs_evento.md) — migration 234 mede pelo `started_at`; recibo é descartável, evento em `system_events` não
- [Armadilha do .vercelignore](project_vercelignore_trap_qa.md) — import de packages/web p/ docs|scripts|bin passa local+CI e quebra SÓ na Vercel; como reproduzir com contraprova
- [Artefato gerado vs template](project_artefato_gerado_vs_template_qa.md) — provar .generated ≡ render(fonte) por sha256 + determinismo + estabilidade à reordenação, sem credencial
- [project_epic_87_qa_patterns.md](project_epic_87_qa_patterns.md) — Epic 87 (Nicole): 1 query POR candidato; tri-estado do slot (as 3 strings são truthy, tsc não pega); guard fail-open vira falso positivo em ramo sem authorizedSlotUtc
- [project_epic_86_qa_patterns.md](project_epic_86_qa_patterns.md) — Epic 86 (Pixel+CAPI) QA: 5 checks de tracking silencioso (cadeia de IP, ADAPT que muda superfície dos outros chamadores, hashing, PII em webhook_logs, dedup) + gotcha de rebase do trifold-design-system
- [Webhook do WhatsApp — armadilhas de QA](project_webhook_whatsapp_qa_patterns.md) — texto sintético vira turno do lead na Nicole; trigger 038 já cuida de last_message_at; snapshot é de prod; gate:tenancy suja a árvore
- [Baseline do trifold-design-system](project_trifold_design_system_baseline.md) — `.dc.html` untracked de propósito: baseline é a produção via `curl`, não o git; sem lint/typecheck; falso positivo de `{{ }}`
- [Relatório impresso de brindes](project_relatorio_impresso_brindes.md) — único `document.write` da app: XSS same-origin real (fechado na 75-373, 2 furos medidos); A4 útil = 673,5px (viewport 734, não 794)
- [.env.local desta máquina aponta produção](project_env_local_desta_maquina_aponta_producao.md) — existe, com service-role de prod, e vence tudo no Next; `.env.development` não existe e `build:teste` sai 1

## Método de QA

- [feedback_reverificacao_focada.md](feedback_reverificacao_focada.md) — re-verificação de gate: `turbo --force` (cache hit não é evidência), `git diff` vazio prova "não tocado", teste vacuoso, `-t` do vitest é regex e zero match sai EXIT=0, metadata vem do `git`
- [A ponte do client não provada](feedback_ponte_do_client_nao_provada.md) — teste do `.eq()` + medição por URL crua deixam o supabase-js sem prova; feche capturando a URL real com `fetch` falso
- [Mutação de alcance acrescenta sítio](feedback_mutacao_de_alcance_acrescenta_sitio.md) — remover escape prova presença; só ACRESCENTAR sítio novo prova alcance; `startsWith("marcador(")` nunca prova suficiência
- [Réguas declarativas (AC10 do host nu)](project_reguas_declarativas_ac10.md) — colisão entre PRs deixa main vermelha sem culpa de PR; medir contagem mutando o declarado, não replicando o scanner; `TURBO_FORCE=true`
