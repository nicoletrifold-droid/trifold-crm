# SM Agent Memory — River

## Project Context
- Platform: Trifold CRM — AI-powered real estate lead management (Maringá-PR, Brazil)
- Stack: Next.js 16+ / Supabase (PostgreSQL + pgvector) / Anthropic Claude / Vercel / Resend
- Stories location: `docs/stories/active/`
- Epics: `docs/stories/epics/`
- PRD: `docs/prd.md` | Architecture: `docs/architecture/`

## Active Epics (2026-05-05)
- Epic 16: Meta Ads Marketing API
- Epic 18: Nicole Memory Writer + Central Email
- Epic 19: Meta Ads Intelligence
- Epic 20: Portal do Cliente
- Epic 21: WhatsApp Channel Reliability (Stories 21.1 Done, 21.2 Draft, 21.3 Ready)
- Epic 33: Cadastro de Clientes CRM (Stories 33.1–33.5 Draft, criadas 2026-05-15)

## Nicole AI Agent — Critical Rules (always check in story drafts)
1. NÃO revelar que é AI/bot (apresentar como "Nicole, assistente Trifold")
2. NÃO enviar tabelas de preço exatas
3. NÃO prometer acabamentos/materiais específicos
4. Qualificar: nome, interesse, quartos, andar, vista, vagas, entrada disponível
5. Regra Yarden: lead sem entrada disponível NÃO qualifica para Yarden
6. Horário comercial: Seg-Sex 8h-18h, Sáb 8h-12h
7. "apartamento decorado" (NÃO "montado") — terminologia oficial do Vind

## Key Architecture Patterns
- Pipeline AI: `packages/ai/src/chat/pipeline.ts` → `processMessageWithMetadata()`
- System prompt: `packages/ai/src/prompts/index.ts` → `buildSystemPrompt()` — após Story 21.3 retornará `TextBlockParam[]`; bloco 1 = estático cacheável, bloco 2 = dinâmico opcional
- MemPalace memory (Story 14.2): `packages/ai/src/memory/loader.ts` L0-L3 progressive loading
- Lead memory facts: `lead_facts` table (KG temporal) + `lead_memories` (verbatim + embeddings)
- Phone normalization: `packages/shared/src/utils/phone.ts` → `normalizePhoneBR()`
- Webhook WhatsApp: `packages/web/src/app/api/webhook/whatsapp/route.ts`
- Leads schema: `supabase/migrations/001_base_schema.sql` (latest migration: 021_phone_normalization_part2)

## Patterns Confirmed
- Story executor: @dev for AI/pipeline/API, @data-engineer for schema/migrations, @devops for infra
- CodeRabbit integration: check `core-config.yaml` — currently NO explicit `coderabbit_integration` key (stories 14.2 showed "Disabled"; 21.1 showed "Enabled" — verify per story)
- Testing framework: Vitest (unit) + manual E2E — NOT Jest
- Supabase client in webhook/pipeline: service_role key via `createClient(url, SUPABASE_SERVICE_ROLE_KEY)`
- Always use `.maybeSingle()` not `.single()` — `.single()` throws on 0 rows (the Story 21.1 P0 bug)
- `after()` from `next/server` for fire-and-forget async in webhook handlers (Next.js 16 pattern)
- Absolute imports: `@trifold/ai`, `@trifold/shared`, `@web/lib/*`

## Recent Story History (for cross-story coherence)
- Story 21.1 (Done 2026-05-05): Webhook idempotente + phone normalization + lead dedup. Hot-fix: `leads.metadata` column does not exist (never did).
- Story 21.2 (Draft 2026-05-05): Nicole lead context injection — inject structured lead fields (`name`, `source`, `qualification_status`, etc.) into system prompt via `<lead_context>` block. P2 UX fix discovered in 21.1 smoke test.
- Story 21.3 (Ready 2026-05-05): Anthropic Prompt Caching. `buildSystemPrompt()` retorna `TextBlockParam[]`, bloco estático (~1.000–1.500 tokens) com `cache_control: { type: "ephemeral" }`, blocos dinâmicos sem cache. Observabilidade via `cache_creation_input_tokens` + `cache_read_input_tokens`. Estimativa: -50% custo, -40% latência. P1, pure TS refactor, sem schema/migration.
- Story 14.2 (Ready for Review): MemPalace-inspired memory system. Adds `lead_facts` + `lead_memories` tables, progressive L1-L3 loading. Story 21.2 is additive (not a replacement).
- Story 35-6 (InReview 2026-05-20): Exceções por usuário. Migration 049 = `user_permission_exceptions`. `canAccess` em `permissions.ts`. Aba "Exceções" no `UserEditModal`. Server actions em `permissions-exceptions-actions.ts` (arquivo separado para evitar "use server" no arquivo principal).
- Story 35-7 (Draft 2026-05-20): Sub-módulos em `configuracoes`. `SUBMODULE_MAP` em `permissions-modules.ts`. `canAccess` suporta "modulo.submodulo" com herança do pai. Guards de 8 páginas migrados. UI expansível na aba Exceções.
- Story 36-1 (Done 2026-05-20): Banco de templates de fases. Migration 050 = `obra_fase_templates`. Auto-save no POST de fases. Picker inline no `fase-create-form.tsx`.
- Story 36-2 (Draft 2026-05-20): Progresso geral automático de obras. Migration 051 = `recalculate_obra_progress()` + trigger `trigger_obra_fases_progress` em `obra_fases`. Remoção do input "Progresso (%)" em `obra-edit-modal.tsx` e do bloco `progress_pct` no PATCH handler. Executor: @data-engineer.
- Story 36-3 (InReview 2026-05-22): Soft delete de obras. Migration 058 = `deleted_at timestamptz` em `obras`. DELETE handler admin-only. Modal de confirmação destrutiva com digitação do nome da obra. Filtro `deleted_at IS NULL` em listagem + detalhe (admin + portal). ObraDeleteButton renderizado apenas para role admin.
- Story 36-4 (Draft 2026-05-22): Visibilidade de obras arquivadas + reativação admin. Sem migration. Listagem busca todas as obras (sem filtro deleted_at), separa em ativas/arquivadas em JS. Arquivadas aparecem com opacity-50 + badge "Arquivada". Botão Reativar (admin only) chama PATCH com { deleted_at: null }. Componente ObraReativarButton em `obras/_components/` (não em `[obra_id]/_components/`). router.refresh() no sucesso.

## Story Numbering Tracker
- Next story after 21.3: 21.4 or novo epic
- Epic 20: stories 20-1a, 20-1b, 20-2, 20-3 (Portal do Cliente)
- Epic 33: 33.1 (schema) → 33.2 (API) → 33.3/33.4/33.5 (UI em paralelo). Migration 041 = clientes + vinculos; migration 042 = brindes_destinatarios.cliente_id (FK ON DELETE SET NULL).
- Epic 35: stories 35-1 → 35-7 (Draft criada 2026-05-20). Próxima seria 35-8. Latest migration: 051_obra_progress_auto.sql (Story 36-2).
- Epic 36: stories 36-1 (Done) + 36-2 (Draft) + 36-3 (InReview) + 36-4 (Draft criada 2026-05-22). Próxima seria 36-5.

## Epic 35 — Permissões: Padrões Críticos (2026-05-20)
- Server actions de permissão ficam em `permissions-exceptions-actions.ts` (NÃO em `permissions.ts`) para evitar conflito `"use server"` no arquivo principal.
- `createAdminClient()` (não `createClient()`) para queries em `user_permission_exceptions` dentro de `permissions.ts` (evitar importação circular).
- `revalidateTag(tag, "max")` — requer 2 argumentos neste projeto (padrão `"max"`).
- `ALL_MODULES`, `MODULE_LABELS`, `MODULE_DESCRIPTIONS` em `permissions-modules.ts` (sem code server-side — importável em Client Components).
- `getUserPermissions` retorna apenas 17 módulos top-level; sub-módulos `"modulo.submodulo"` são resolvidos diretamente em `canAccess` com query separada.

## Epic 33 — CRM Clientes: Notas Críticas
- `clientes` e `clientes_obras_vinculos` são SEPARADOS de `users.role='cliente'` e `cliente_obras` (portal). Sem FK entre CRM e portal-users.
- Auth pattern API: `requireAuth()` de `@web/lib/api-auth` (NÃO service_role). RLS aplicado automaticamente.
- Rotas em `/api/admin/clientes/` (não em `/api/brindes/`). Segmento `search/` ANTES do `[id]/` para evitar conflito de rotas no App Router.
- Story 33.5 depende de 041 aplicada ANTES de aplicar 042 (FK para `clientes`).
