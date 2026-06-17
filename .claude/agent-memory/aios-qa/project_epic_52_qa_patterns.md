---
name: project-epic-52-qa-patterns
description: Epic 52 (agente CRM read-only) QA — 52-1/52-4 gate PASS validado em runtime no DEV; user_role() confirmada; REVOKE deterministico p/ append-only no Supabase; padroes de seguranca de views/auditoria PII
metadata:
  type: project
---

Epic 52 (Agente de Trafego com acesso Read-Only ao pipeline do CRM). Stories 52-1 (migration 096, funcao funnel + 3 views) e 52-4 (migration 097, audit log PII) — gate inicial **CONCERNS** (runtime pendente) elevado para **PASS** apos validacao em runtime no Supabase DEV (`xnxvygyfyyyzwhiuoehz`) em 2026-06-16. Status das stories = Done (com nota de honestidade: validado no DEV; commit/deploy PROD ainda e passo do @devops).

**Why:** @data-engineer implementou as migrations sem CLI/PAT/psql (so SERVICE_ROLE_KEY do data-plane). A validacao foi feita depois via Management API com seed de admin + supervisor na MESMA org.

**Evidencia de runtime que fechou os concerns (replicavel):**
- Admin-only PROVADO usando supervisor na MESMA org (nao outra org): supervisor ve 0 rows em todas as views/funcao e log_pii_access -> FALSE. Isso exclui a hipotese de o filtro ser apenas org. Sempre testar admin-strict com um non-admin da mesma org, nao so cross-tenant.
- SEC-003 (auditoria infalsificavel) PROVADO chamando log_pii_access SEM passar id e verificando que a row gravou o usuario autenticado (auth.uid()) — nao ha parametro p/ injetar id alheio.
- Funnel: pipeline_funnel_by_campaign(30) com 3 leads (1 fechado/1 visitou) + R$1000 spend <30d -> cpl_real_visitou=500, cpl_real_fechado=1000 (CPL com janela correto, PERF-001 resolvido).

**REVOKE deterministico (achado de runtime — IMPORTANTE):** o Supabase concede `GRANT ALL` por padrao a `authenticated` E `anon` em objetos do schema public — incl. TRUNCATE, que NAO passa por RLS. Um simples `GRANT SELECT`/`GRANT SELECT,INSERT` NAO revoga esse baseline. Para append-only/read-only deterministico: `REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ... FROM authenticated` + `REVOKE ALL ... FROM anon, PUBLIC` e DEPOIS o GRANT restritivo final. Validar grants efetivos via `information_schema.role_table_grants`. NUNCA aceitar "non-updatable por acaso" para NFR de seguranca. Validado: views=SELECT-only, funcao=EXECUTE-only, audit log=SELECT+INSERT only; anon/PUBLIC nada.

**How to apply:**
- `public.user_role()` CONFIRMADA: definida em `004_rls_policies.sql`, redefinida em `062_users_role_enum_to_text.sql` como STABLE SECURITY DEFINER, le `public.users.role` (TEXT pos-062) por `auth_id = auth.uid()`. Retorna 'admin' para admins internos. Usar SEMPRE `public.user_role()`, NUNCA `auth.jwt()->app_metadata->>'role'` — app_metadata.role so existe para role='cliente' (externos); admins internos tem NULL, o JWT quebraria acesso admin (sempre 0 rows).
- RLS em views Postgres: NAO existe CREATE POLICY em view. Padrao correto do projeto = filtro `public.user_role()='admin' AND org_id = public.user_org_id()` embutido no WHERE de cada view + `security_invoker = on` como defesa em profundidade. O WHERE e o controle load-bearing.
- Append-only no Postgres: GRANT (sem UPDATE/DELETE) e avaliado ANTES da RLS — primeira camada. Ausencia de policy UPDATE/DELETE com RLS habilitada = segunda camada.
- SECURITY DEFINER fail-safe pattern: `SET search_path = public` (anti injection) + verificacao de role interna + anti cross-tenant (`p_org_id = user_org_id()`) + `EXCEPTION WHEN OTHERS THEN RETURN FALSE` (fail-closed). log_pii_access(52-4) e o template.
- Risco recorrente R2: service_role bypassa RLS por design no Supabase — NAO mitigavel em migration; validar em runtime que o caminho do agente usa so `authenticated`.
- Concern recorrente: join de spend `meta_campaigns.name = leads.utm_campaign` e fragil (name nullable, raramente espelha utm) -> CPL NULL/inflado. `meta_insights_daily` tem level/entity_id(TEXT)/spend, sem campaign_id; entity_id=meta_campaign_id quando level='campaign'. Spend agregado sem filtro de date = lifetime, nao janela.
- Schema confirmado: messages tem conversation_id (sem lead_id); leads.name e NOT NULL (contrato 52-1 diz nullable — nit); stage_type enum = novo/qualificado/agendado/visitou/proposta/fechado/perdido.

**52-2 (injecao de contexto no agente) — gate CONCERNS, Status Done (2026-06-16):** PASS no eixo de seguranca; CONCERNS por 2 limitacoes nao-bloqueantes aceitas como follow-up.
- **SEC-002 (forward-gate da 52-4) FECHADO/GREEN:** o caminho do agente usa o client **authenticated** end-to-end. Padrao p/ validar: rastrear `requireAuth()` (api-auth.ts) -> `createClient()` (supabase/server.ts) -> `createServerClient(@supabase/ssr)` com **SUPABASE_ANON_KEY + cookies (JWT)**, role=authenticated. Confirmar que o MESMO `supabase` destruturado de requireAuth eh passado a TODOS os helpers de query e ao log_pii_access. `grep service_role|SERVICE_ROLE|serviceRole` no caminho do agente DEVE dar 0. Se aparecer service_role -> FAIL (RLS bypassada).
- **Fail-closed em codigo (AC6):** padrao correto = `const {data: auditOk, error} = await supabase.rpc('log_pii_access', {...5 args, sem p_admin_user_id...}); if (auditOk !== true || error !== null) { console.error; return null }` ANTES de qualquer SELECT na view PII. Caller injeta string de indisponibilidade no contexto quando recebe null.
- **Gate isAdmin como ponto unico:** `if (isAdmin(appUser))` (isAdmin = `user.role === 'admin'` estrito, auth-helpers.ts) deve envolver TODOS os helpers de pipeline. Nenhum helper alcancavel fora do bloco. Non-admin so loga e segue com contexto de midia (CON-5).
- **CON-5 verificacao:** `mediaContext` sempre construido independente do role; pipeline eh `mediaContext + pipelineContext` (aditivo). Confirmar que buildGlobalContext/buildCampaignContext nao foram alterados e nenhuma secao do system-prompt foi removida (so adicao).
- **Limitacao AC5 (REQ-001, aceita):** resolucao de conversa so por UUID explicito na mensagem (extractLeadId via regex UUID); nome de lead NAO dispara. Conservador por design — follow-up 52-5 (UI injeta lead_id ou resolve nome->id quando match unico).
- **AC12 (PERF-001, aceita):** caso extremo 20 camp x 7 stages ~2.400 tokens > alvo 2.000; tipico (5x5) ~635. Follow-up opcional: cap top-N por lead_count na distribuicao por stage.
- `'today' unused` em context-builder.ts (buildCampaignContext) eh PRE-EXISTENTE — confirmar via `git show HEAD:` antes de atribuir warning a story nova.

**52-6 (contexto de performance por criativo no agente) — gate CONCERNS, Status InReview (2026-06-17):** PASS em todos os eixos estaticos; CONCERNS so por TEST-001 (migration 100_creative_performance_fn.sql nao aplicada no DEV + E2E T8 nao rodados — ACs de runtime sem evidencia, igual ao padrao 52-1/52-2 inicial).
- **Diferenca-chave vs CRM (52-2):** dados de criativo sao agregados ANONIMOS (spend/CTR/CPL/rankings, sem PII de lead). Por isso o fluxo NAO tem log_pii_access nem fail-closed — e CORRETO ausenta-los aqui. Nao confundir com o padrao PII da 52-2/52-4.
- **Gate ampliado `isAdminOrSupervisor` (novo helper, paralelo a isAdmin):** `user.role === 'admin'|'supervisor'|'gerente-comercial'`, exclui obras/broker/cliente. Bloco de criativo em chat/route.ts e INDEPENDENTE do bloco `if(admin)` do CRM (validado por git diff: bloco CRM L167-193 intocado). `isAdmin`=CRM admin-only; `isAdminOrSupervisor`=criativo. Dois gates separados, nunca cruzar.
- **Divergencia intencional SQL vs TS (defense in depth):** `is_admin_or_supervisor()` (084) inclui 'obras' (SECURITY DEFINER, le users.role IN admin/supervisor/obras/gerente-comercial); o helper TS `isAdminOrSupervisor` EXCLUI 'obras'. TS mais restritivo = backstop. Documentado/aceito (SEC-001 low).
- **migration 100:** CREATE OR REPLACE, SECURITY INVOKER (herda RLS das tabelas-base, user_org_id()+is_admin_or_supervisor() com JWT do caller), REVOKE ALL FROM PUBLIC,anon + GRANT EXECUTE authenticated. JOIN meta_insights_daily(level='ad').entity_id = meta_ads.meta_ad_id. 3 subqueries correlacionadas p/ rankings (PERF-001 low, ok p/ dezenas de criativos).
- **`contextText` permanece `const`:** join final `const contextText = mediaContext + pipelineContext + creativeContext`; `let creativeContext` separado preenchido no gate. Nota do @po respeitada — verificar que NUNCA viraram `let contextText +=`.
- **requiresCreative (mesma forma de requiresDrill/requiresConversation):** keyword case-insensitive. Keywords amplas "imagem"/"copy" sao risco baixo de falso positivo (MNT-001); validados 6/6 positivos + 5/5 negativos do AC3 sem falha. "qual campanha..." NAO dispara.
- Migration 100 e a ultima da sequencia (099=agent_media_assets). Sem conflito.
Gate file: `docs/qa/gates/52.6-creative-performance.yml`.

Gate files: `docs/qa/gates/52.1-pipeline-readonly-layer.yml`, `docs/qa/gates/52.4-pii-access-audit.yml`, `docs/qa/gates/52.2-agent-context-integration.yml`.
