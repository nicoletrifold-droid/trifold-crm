# SM Agent Memory — River

## Memory Index (structured files)
- [Epic 900 — SaaS Multi-Tenant / Isolamento](project_epic900.md) — 900-1..900-15; hotfix 900-15 (2026-08-24): docs/ fora do build Vercel travava produção; codegen preserva lista derivada de snapshot
- [Epic 51 — Google Ads Marketing API](project_epic51.md) — 5 stories criadas; PM review aplicado; decisões técnicas cravadas; pronto para @po validar
- [Epic 52 — Agente CRM Read-Only](project_epic52.md) — 52-1/52-4 em Review (QA CONCERNS, runtime pendente); 52-2 v0.5 Ready (contrato sincronizado: funil=RPC p_days, log_pii_access 5 args, NULL spend=sem midia)
- [Epic 75 — Cron claim/anti-duplicata](project_epic75_cron_claim.md) — padrão claim-run.ts (75-352): RUN-only vs RUN+item, fail-open do helper vs fail-closed do chamador, intervalo mínimo escalado
- [Epic 86 — Meta CAPI/Pixel Tracking](project_epic86.md) — 86-9 (formulário qualificação, Ready for Review, QA PASS, padrão de referência); 86-11 (Draft v0.2, landing Vind Residence, runtime standalone sem workspace, Opção A: CAPI disparado do CRM, agora 5 eventos completos — CompleteRegistration sem gatilho distinto de Lead, ressalva documentada)
- [Epic 87 — Nicole Confiabilidade de Contexto](project_epic87.md) — 87-10 (W1-2c, Ready, NÃO implementada); 87-17 (Draft 2026-08-27, oferta de horário colada no meio-dia + "mais tarde" sem lista nova, fronteira i/ii/iii posta ao @po, recomendação ii = só sítio 7)

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
- Story 52-1 (Review 2026-06-16): Migration 096 criada. Funil convertido de view para FUNCAO table-valued `public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` (v0.4 fix PERF-001 + REL-001). As outras 3 permanecem views: `v_pipeline_stage_distribution`, `v_lead_drill`, `v_lead_conversations`. RLS via `user_role()='admin'` no WHERE (nao CREATE POLICY — views nao suportam). `total_spend`/CPL NULL = sem midia correlacionada por nome, NAO zero. Aplicacao DEV pendente (QA CONCERNS runtime).
- Story 52-4 (Review 2026-06-16): Migration 097 criada. `log_pii_access` v0.4 fix SEC-003: `p_admin_user_id` REMOVIDO — 5 args agora (`p_org_id, p_session_id, p_data_type, p_scope, p_view_or_source`). `admin_user_id` derivado de `public.public_user_id()` (auth.uid()) internamente — trilha infalsificavel. Aplicacao DEV pendente (QA CONCERNS runtime).
- Story 52-3 (v0.2 Draft 2026-06-15): Guard Admin-Only + Read-Only Enforcement — REVISADA. Decisao PO travada: painel de midia continua para todos os roles (sem regressao). Entrega: (1) utilitario `isAdmin(user): boolean` exportado de `auth-helpers.ts` com JSDoc de contrato para 52-2; (2) guard `requireRole` em POST /api/agent/action/cancel (simetria com confirm); (3) `ALLOWED_ACTION_TYPES` constante em confirm/route.ts (400→403). NAO modifica: rotas de chat, pages-server, AgentChatPanel. 3 arquivos previstos (era 9). Sem migration.
- Story 52-2 (Ready v0.5 2026-06-16): Sincronizacao contrato pos-QA. Funil = `supabase.rpc('pipeline_funnel_by_campaign', { p_days: 30 })` (NAO select-from-view). `log_pii_access` sem `p_admin_user_id` (5 args). NULL spend/CPL = sem midia, NAO zero — instrucao obrigatoria no AGENT_SYSTEM_PROMPT. Assinaturas: `fetchLeadDrill(supabase, orgId, sessionId, filters)` e `fetchLeadConversations(supabase, orgId, sessionId, leadId)` — sem adminUserId. Executor: @dev.
- Story 52-6 (Draft 2026-06-17): Contexto de performance por criativo no agente. Migration 100 = `public.creative_performance(p_days INTEGER DEFAULT 30)` SECURITY INVOKER, filtra por `user_org_id()` + `is_admin_or_supervisor()`. Helper TS `isAdminOrSupervisor` em `auth-helpers.ts` (admin+supervisor+gerente-comercial; exclui 'obras' diferente do SQL). `requiresCreative` + `fetchCreativePerformance` em `context-builder.ts` (cache creative_perf:{orgId} 5min). Gate em `chat/route.ts` INDEPENDENTE do bloco `if (admin)` de pipeline CRM (52-2 nao tocado). Sem log_pii_access (dados de criativo sao agregados, sem PII). Proxima migration: 101.
- Story 55-1 (Draft 2026-06-10): Campaign Email Visual Editor + A/B Creative Performance. Reutiliza `visual-editor.tsx` (react-email-editor/Unlayer). Migration 092 = `campaigns.email_body_json JSONB` + `campaign_email_images` table + bucket `campaign-assets`. Helper `injectUtmToHtml()` no cron campaign-poll. Aba "Performance" em `/dashboard/campaigns/[id]/`. Compatibilidade retroativa via email_body_json nullable. Precisa de @data-engineer para RLS policy de `campaign_email_images`.
- Story 75-208 (Draft 2026-07-29): Meta Ads — atribuição e nomenclatura, follow-up do fix `leads_meta` (commit 97bc71d0, soma leads formulário + messaging_conversations_started). 3 itens: (1) renomear label "CPL"→"Custo por resultado" em campaign-funnel.tsx/campaign-detail-client.tsx + campaigns-meta-client.tsx (achado extra: mesmo dado, mesmo label desalinhado); achado documentado (AC1.3, não obrigatório): adsets/creatives/placement calculam cpl só com insight.leads, sem somar mensagens — decisão de @po se entra no escopo. (2) incluir broker_sponsored na visão Ads — bloqueado por decisão de @po (AC2.1: card separado vs inclusão condicional por utm vs não incluir), maioria sem atribuição de campanha (2/14 com utm, 0/14 campaign_id). (3) persistir campaign_id no metadata CTWA via buildCtwaMetadata() (ctwa-metadata.ts) — achado crítico: usar meta_campaigns.meta_campaign_id (não o id UUID interno), pois dual-join dos endpoints compara metadata->>campaign_id contra meta_campaign_id. Sem migration. Sem CodeRabbit (disabled, padrão do projeto).

## Story Numbering Tracker
- Epic 75 (CRM core): numeração alta em uso — 75-371 (pipeline gate/default único, InReview) é a última antes de 75-372 (criada 2026-09-04 — Brindes: tamanho/quantidade/filtro no relatório impresso, Draft, ticket Samara). Próxima livre: 75-373. (Nota: 75-208 e vizinhas são de um lote anterior, já ultrapassado — sempre confirmar com `ls docs/stories/` antes de numerar.)
- Next story after 21.3: 21.4 or novo epic
- Epic 20: stories 20-1a, 20-1b, 20-2, 20-3 (Portal do Cliente)
- Epic 33: 33.1 (schema) → 33.2 (API) → 33.3/33.4/33.5 (UI em paralelo). Migration 041 = clientes + vinculos; migration 042 = brindes_destinatarios.cliente_id (FK ON DELETE SET NULL).
- Epic 35: stories 35-1 → 35-7 (Draft criada 2026-05-20). Próxima seria 35-8. Latest migration: 051_obra_progress_auto.sql (Story 36-2).
- Epic 36: stories 36-1 (Done) + 36-2 (Draft) + 36-3 (InReview) + 36-4 (Draft criada 2026-05-22). Próxima seria 36-5.
- Epic 52: 52-1=Review (096: funcao RPC pipeline_funnel_by_campaign + 3 views; runtime pendente); 52-4=Review (097: agent_pii_access_log + log_pii_access 5 args; runtime pendente); 52-3=Ready (guards TS/React); 52-2=Done (context-builder + system-prompt + fail-closed; QA CONCERNS aceitas); 52-5=Ready (FunnelBar + parser UX); 52-6=Draft (criada 2026-06-17: criativo performance RPC — is_admin_or_supervisor, migration 100, fetchCreativePerformance, requiresCreative). Proxima: 52-7.
- Epic 55: stories 55-1 (Draft criada 2026-06-10). Campaign Email Visual Editor + A/B Creative Performance. Próxima seria 55-2. Latest confirmed migration: 091_fix_broker_novos_leads.sql → próxima é 092.

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
