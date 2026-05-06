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

## Story Numbering Tracker
- Next story after 21.3: 21.4 or novo epic
- Epic 20: stories 20-1a, 20-1b, 20-2, 20-3 (Portal do Cliente)
