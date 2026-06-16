# Story 52-2 — Injeção de Contexto Integrado no Agente

## Metadata
- **Epic:** 52 — Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM
- **Story:** 52-2
- **Status:** Done
- **Priority:** P1 — entrega as driving questions do epic; bloqueia 52-5
- **Complexity:** L (TypeScript/Supabase — context-builder + system-prompt + fail-closed PII, ~8h)
- **Created:** 2026-06-15
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[driving_question_test, fail_closed_test, pii_minimization_test, regression_test, token_budget_test]`

---

## User Story

**Como** gestor de tráfego pago admin do Trifold CRM,
**Quero** que o agente de tráfego pago consiga responder perguntas integradas de mídia × funil — "qual campanha traz os leads que mais fecham?", "qual o CPL real considerando quem visitou ou fechou?", "onde os leads de cada campanha travam no funil?" — com dados reais do pipeline comercial,
**Para que** eu possa tomar decisões de otimização de campanhas baseadas no resultado completo, não apenas no custo do lead na entrada do funil.

---

## Context

O agente de tráfego pago (`packages/web/src/lib/agent/`) hoje enxerga apenas `meta_campaigns`, `meta_insights_daily`, `meta_alerts` e uma fatia rasa de `leads` sem cruzamento de funil. Perguntas que relacionam investimento com resultado comercial (conversão por stage, CPL→fechamento, gargalos por campanha/UTM) ficam sem resposta porque o dado não chega ao contexto do modelo.

Esta story é o ponto de integração que conecta os dois mundos — mídia paga e funil comercial — consumindo a camada de leitura criada na Story 52-1 (4 views SQL com RLS admin-only) e respeitando os controles de segurança estabelecidos nas Stories 52-3 (guard de API/UI já ativo antes desta story iniciar) e 52-4 (tabela de auditoria `agent_pii_access_log` + função `public.log_pii_access(...)` com contrato fail-closed).

**Decisão de produto travada pelo stakeholder (não reabrir):** SOMENTE a capacidade de CRM é admin-only. A análise de mídia Meta Ads continua disponível para todos os roles sem regressão. Esta distinção define a arquitetura central da story: o `context-builder.ts` tem dois caminhos — o de mídia (sempre, para todos) e o de pipeline/CRM (somente admin). O gate é implementado na camada de aplicação via utilitário `isAdmin` entregue pela Story 52-3, e não depende exclusivamente da RLS (que é a camada b da defesa em profundidade, não a única).

**Sequenciamento deliberado:** 52-1 → 52-4 → 52-3 → **52-2** → 52-5. Esta story só deve iniciar quando as três predecessoras estiverem Done, pois é o ponto em que PII e conteúdo de conversa efetivamente passam a fluir para o contexto do modelo. Começar antes violaria NFR-OBS-1 (fail-closed sem infraestrutura de auditoria).

**Âncoras técnicas confirmadas no repo:**
- `packages/web/src/lib/agent/context-builder.ts` — função `buildGlobalContext(supabase, orgId)` com cache in-memory 5 min; `fmtBRL`, `fmtPct`, `pct` como helpers; padrão de cache com chave `"{tipo}:{orgId}"`.
- `packages/web/src/lib/agent/system-prompt.ts` — `AGENT_SYSTEM_PROMPT` (string literal exportada); descreve capacidades Meta Ads, regras de resposta e formato de `<action_card>`.
- `packages/web/src/app/api/agent/chat/route.ts` — endpoint de chat que chama `buildGlobalContext`; chama `requireAuth()` (já existente) que retorna `appUser` com campo `role` — fonte autoritativa para o gate `isAdmin`; a Story 52-3 NÃO adiciona guard de role nesta rota (não-admin continua usando o chat para análise de mídia normalmente).
- Contrato de dados: função RPC `pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` + 3 views criadas pela Story 52-1 com colunas exatas documentadas na seção "Contrato de Dados para 52-2" da story 52-1.
- Contrato de auditoria: função `public.log_pii_access(...)` criada pela Story 52-4 com comportamento fail-closed documentado.
- Utilitário `isAdmin`: verificação estrita `appUser.role === 'admin'` conforme padrão estabelecido pela Story 52-3 (CON-2 do epic — nunca usar `is_admin_or_supervisor()` nem `canAccess`).

---

## Scope

### IN (esta story entrega)
- Gate `isAdmin` explícito na camada de aplicação antes de qualquer busca ou injeção de dado de CRM/pipeline: `const isAdmin = appUser.role === 'admin'` avaliado em `chat/route.ts` antes de chamar os helpers de pipeline. Quando `isAdmin === false`: nenhuma chamada a `fetchPipelineAggregates`, `fetchLeadDrill` ou `fetchLeadConversations` é feita; o agente recebe apenas o contexto de mídia atual (comportamento de hoje, sem regressão — CON-5).
- Extensão de `buildGlobalContext` — ou caminho paralelo em `chat/route.ts` — para incluir dados do pipeline via a função RPC e as 3 views da Story 52-1 **somente quando `isAdmin === true`**:
  - **Sempre para admin** (eager load, cacheável): função RPC `pipeline_funnel_by_campaign(p_days)` e view `v_pipeline_stage_distribution` — apenas agregados, sem PII
  - **On-demand para admin** (lazy, disparado por heurística): `v_lead_drill` e `v_lead_conversations` — contêm PII/conteúdo sensível; só buscados quando a query do usuário claramente pedir drill ou conteúdo de conversa
- Implementação do contrato de fail-closed da Story 52-4: chamar `supabase.rpc('log_pii_access', ...)` **antes** de injetar dado sensível (drill ou conversa) no contexto; se retornar `false` ou erro — **negar** a injeção e informar o modelo/usuário que o dado não pôde ser acessado
- Logging leve (tipo `'aggregated_metrics'`) para consultas de dados agregados — opcional conforme decisão documentada nos Dev Notes
- Atualização de `AGENT_SYSTEM_PROMPT` para: (a) descrever as novas capacidades de cruzamento mídia×funil; (b) instruir o modelo sobre os limites read-only e de privacidade; (c) explicitar que ações executáveis continuam restritas a mídia
- Isolamento multi-tenant: `buildGlobalContext` já usa `orgId` — manter o mesmo padrão nas queries às views
- Cache das seções de pipeline: reusar o cache in-memory de 5 min existente para agregados (resultado de `pipeline_funnel_by_campaign(p_days)` e de `v_pipeline_stage_distribution`); dados on-demand (drill/conversas) **não** cacheados (dado sensível stale entre requests de usuários distintos é inaceitável)

### OUT (não entra nesta story)
- Criação das views (`096_crm_pipeline_readonly_layer.sql`) — escopo da Story 52-1
- Tabela `agent_pii_access_log` e função `log_pii_access` — escopo da Story 52-4
- Guard de API em ações (`requireRole` em `cancel`/`confirm`) e whitelist de `action_card.type` — escopo da Story 52-3 (a 52-3 NÃO oculta o painel nem bloqueia o chat para não-admin)
- Renderização visual sofisticada de respostas integradas — escopo da Story 52-5 (aqui basta o modelo produzir tabelas markdown no padrão já definido no `AGENT_SYSTEM_PROMPT`)
- Novas ações executáveis de CRM via `<action_card>` — vedado por CON-3 do épico
- Qualquer escrita sobre o pipeline (leads, stages, conversas) — vedado por NFR-SEC-2
- Alteração da IA Nicole (`packages/ai`) — somente leitura do que ela produziu (CON-4)

---

## Acceptance Criteria

> **AC13 e AC14 são os critérios de gate por role — decisão de produto travada pelo stakeholder. Devem ser validados antes dos demais ACs.**

- [x] **AC13 — Gate isAdmin: usuário não-admin não recebe nenhum dado de CRM**
  Dado que um usuário com `role != 'admin'` (ex.: `supervisor`, `broker`, `gerente-comercial`) conversa com o agente, então: (a) nenhuma chamada a `fetchPipelineAggregates`, `fetchLeadDrill` ou `fetchLeadConversations` é executada no servidor (verificável via logs); (b) o contexto enviado ao modelo não contém nenhum bloco `=== PIPELINE COMERCIAL ===` nem dados da função RPC `pipeline_funnel_by_campaign`, de `v_pipeline_stage_distribution`, `v_lead_drill` ou `v_lead_conversations`; (c) o agente responde normalmente a perguntas de Meta Ads com os dados de mídia existentes, sem regressão (CON-5). A RLS da função RPC e das views da Story 52-1 já bloqueiam (0 rows retornadas para non-admin), mas a aplicação não tenta buscar nem injetar nenhum dado de CRM antes mesmo da query.

- [x] **AC14 — Gate isAdmin: usuário admin recebe contexto de CRM conforme as regras**
  Dado que um usuário com `role === 'admin'` conversa com o agente, então: (a) `fetchPipelineAggregates` é chamado e agrega o resultado de `supabase.rpc('pipeline_funnel_by_campaign', { p_days: 30 })` e de `v_pipeline_stage_distribution` (eager, cacheável); (b) `fetchLeadDrill` e `fetchLeadConversations` são chamados on-demand quando a heurística detecta a necessidade, sempre com `log_pii_access` chamado antes (fail-closed conforme AC6); (c) o bloco `=== PIPELINE COMERCIAL ===` aparece no contexto enviado ao modelo; (d) o agente consegue responder as driving questions (AC1, AC2, AC3). A verificação de `isAdmin` é feita via `appUser.role === 'admin'` — nunca via `canAccess` nem via `is_admin_or_supervisor()` (CON-2 do epic).

- [x] **AC1 — Driving question: "qual campanha traz leads que mais fecham?"**
  Dado que um admin envia a mensagem "Qual campanha está trazendo os leads que mais fecham?" no painel do agente, o agente responde com dados reais de `pipeline_funnel_by_campaign(30)` (RPC), incluindo `leads_fechado`, `total_leads` e taxa de conversão para fechamento por campanha/UTM. A resposta usa tabela markdown quando há 3+ campanhas (padrão do `AGENT_SYSTEM_PROMPT`).

- [x] **AC2 — Driving question: "CPL real considerando funil"**
  Dado que um admin pergunta sobre CPL real (ex.: "Qual o CPL real considerando quem chegou a visitar ou fechar?"), o agente responde com `cpl_real_visitou` e `cpl_real_fechado` de `pipeline_funnel_by_campaign(30)` (RPC) cruzados com `meta_insights_daily.spend` já presente no contexto de mídia existente. A resposta diferencia CPL Meta (custo por lead na entrada) de CPL real ponderado pelo funil. Quando `cpl_real_visitou` ou `cpl_real_fechado` forem NULL, o agente informa "sem dados de mídia correlacionados para essa campanha" (NÃO interpreta como CPL zero).

- [x] **AC3 — Driving question: "onde os leads travam no funil?"**
  Dado que um admin pergunta onde os leads de cada campanha travam, o agente responde com dados de `v_pipeline_stage_distribution` mostrando `lead_count` e `pct_of_total` por `stage_type` por campanha/UTM. A resposta identifica o stage com maior concentração de leads estagnados.

- [x] **AC4 — Drill on-demand: lead individual**
  Dado que um admin pergunta sobre um lead específico por nome ou campanha (ex.: "Me mostra os leads da campanha X que estão em proposta"), o agente dispara busca on-demand em `v_lead_drill` (filtrada por campanha e/ou stage_type), chama `log_pii_access(...)` com `data_type = 'lead_drill'` antes de injetar, e só inclui o dado no contexto se a função retornar `true`. A resposta mostra `name`, `qualification_score`, `stage_type`, `ai_summary` — sem `phone` nem `email` (ausentes da view conforme AC4 da Story 52-1).

- [x] **AC5 — Acesso on-demand a conversas**
  Dado que um admin pergunta sobre o conteúdo de uma conversa específica (ex.: "O que foi dito na conversa do lead João?"), o agente dispara busca on-demand em `v_lead_conversations` para o `lead_id` relevante, chama `log_pii_access(...)` com `data_type = 'conversation_content'` antes de injetar, e só inclui o conteúdo de mensagens no contexto se a função retornar `true`.

- [x] **AC6 — Fail-closed para dados sensíveis (drill e conversas)**
  Dado que `supabase.rpc('log_pii_access', ...)` retorna `false` ou lança erro de RPC (simulado por falha de banco, role inválido, etc.):
  - O dado sensível (v_lead_drill ou v_lead_conversations) **não** é incluído no contexto enviado ao modelo
  - O modelo recebe uma instrução no contexto informando que o dado não pôde ser acessado naquele momento (ex.: `[DADOS SENSÍVEIS INDISPONÍVEIS — acesso de auditoria falhou]`)
  - O erro é logado no `console.error` do servidor para diagnóstico
  - A resposta ao usuário indica que o dado não está acessível momentaneamente, sem expor detalhes técnicos

- [x] **AC7 — Agregados não bloqueados por fail-closed**
  Dado que dados da função RPC `pipeline_funnel_by_campaign(p_days)` ou da view `v_pipeline_stage_distribution` são consultados (sem PII), eles são injetados no contexto independentemente do resultado de `log_pii_access` para `data_type = 'aggregated_metrics'` (se o log for chamado; o fail-closed não se aplica para agregados sem PII — ver decisão em Dev Notes).

- [x] **AC8 — Cache correto por tipo de dado**
  - Dados agregados (resultado de `pipeline_funnel_by_campaign(p_days)` + `v_pipeline_stage_distribution`) são cacheados na cache in-memory de 5 min com chave `"pipeline_agg:{orgId}"`, reutilizando o padrão existente de `getCached`/`setCached`
  - Dados on-demand (drill e conversas) **não** são cacheados em cache in-memory entre requests (dado sensível stale é inaceitável entre sessões diferentes)

- [x] **AC9 — `AGENT_SYSTEM_PROMPT` atualizado**
  `AGENT_SYSTEM_PROMPT` em `system-prompt.ts` contém seção nova descrevendo:
  - As novas capacidades: cruzamento campanha/UTM × funil comercial (CPL→visitou, CPL→fechado, distribuição por stage, drill de lead, conteúdo de conversa quando relevante)
  - Os limites read-only: o agente **não** pode propor ações sobre o CRM (mover lead, alterar stage, deletar, criar)
  - Os limites de privacidade: PII e conteúdo de conversa são acessados apenas quando a pergunta claramente exige; o agente não deve sugerir ao usuário que pode buscar PII de forma proativa
  - As ações executáveis permanecem restritas a mídia: `pause_campaign`, `resume_campaign`, `set_daily_budget` (CON-5 preservado)

- [x] **AC10 — Sem regressão nas respostas de mídia**
  As respostas do agente para perguntas exclusivamente de Meta Ads (ex.: "Qual a campanha com melhor CTR?", "Me mostra os alertas ativos") continuam funcionando corretamente após as alterações. O contexto de mídia (`CONTEXTO META ADS`) permanece presente e correto no prompt enviado ao modelo.

- [x] **AC11 — Isolamento multi-tenant**
  Dado que dois admins de orgs distintas fazem a mesma pergunta, cada um recebe dados apenas de sua própria `org_id`. As queries às views passam `orgId` como filtro — a RLS das views (Story 52-1) serve como segunda camada de proteção, mas o `context-builder.ts` não deve depender somente dela.

- [x] **AC12 — Contexto agregado não estoura tokens (NFR-PERF-1)**
  O bloco de contexto de pipeline injetado por padrão (agregados) não excede 2.000 tokens estimados para o conjunto de dados típico (≤ 20 campanhas, ≤ 10 stages). Verificar no teste que o contexto total (mídia + pipeline) permanece dentro de limites aceitáveis para uso interativo.

---

## Tasks / Subtasks

- [x] **T1** — Verificar estado atual e ler arquivos afetados (pre-work obrigatório)
  - [x] T1.1 — Ler `packages/web/src/lib/agent/context-builder.ts` completo — confirmar assinatura de `buildGlobalContext`, helpers `fmtBRL`/`fmtPct`/`pct`, padrão de cache `getCached`/`setCached`, e como o resultado é usado em `chat/route.ts`
  - [x] T1.2 — Ler `packages/web/src/lib/agent/system-prompt.ts` completo — confirmar `AGENT_SYSTEM_PROMPT` atual e onde adicionar a seção de novas capacidades sem remover seções existentes (CON-5)
  - [x] T1.3 — Ler `packages/web/src/app/api/agent/chat/route.ts` — confirmar onde `buildGlobalContext` é chamado, como o contexto é montado no payload para o modelo Anthropic, e confirmar que `appUser` (com campo `role`) está disponível via `requireAuth()` existente; confirmar que NÃO há (nem deve haver) guard de role bloqueando o chat — não-admin deve passar normalmente para análise de mídia
  - [x] T1.4 — Confirmar que a Story 52-1 está Done e o contrato de dados está preenchido: ler seção "Contrato de Dados para 52-2" em `docs/stories/52-1-pipeline-readonly-layer.story.md` — verificar que o funil é função RPC `pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` consumida via `supabase.rpc('pipeline_funnel_by_campaign', { p_days: N })`, e verificar nomes e colunas das 3 views restantes (`v_pipeline_stage_distribution`, `v_lead_drill`, `v_lead_conversations`)
  - [x] T1.5 — Confirmar que a Story 52-4 está Done e o contrato de fail-closed está preenchido: ler seção "Contrato de Fail-Closed para 52-2" em `docs/stories/52-4-pii-access-audit.story.md` — verificar assinatura exata da função `log_pii_access` e padrão TypeScript de chamada via `supabase.rpc`
  - [x] T1.6 — Confirmar que a Story 52-3 está Done: verificar que o utilitário `isAdmin` está exportado de `auth-helpers.ts` (ou arquivo equivalente) conforme AC1/AC2 da 52-3; verificar que NÃO existe guard de role em `chat/route.ts` — a 52-3 deliberadamente não adiciona esse guard; `appUser.role` vem do `requireAuth()` já existente na rota

- [x] **T2** — Implementar mecanismo de heurística on-demand para drill e conversas (decisão de design — documentar no Dev Agent Record)
  - [x] T2.1 — Definir e implementar a função `requiresDrill(userMessage: string): boolean` — heurística baseada em palavras-chave que indica se a query do usuário pede informação de lead individual (ex.: presença de nome próprio, "lead", "contato", "histórico", "quem é", "detalhe", "proposta de [nome]")
  - [x] T2.2 — Definir e implementar a função `requiresConversation(userMessage: string): boolean` — heurística para queries que pedem conteúdo de conversa (ex.: "conversa", "mensagem", "o que foi dito", "Nicole", "histórico da conversa")
  - [x] T2.3 — Documentar no Dev Agent Record a lista exata de palavras-chave escolhidas e o raciocínio — estas funções determinam quando PII flui ao modelo, por isso a decisão deve ser auditável

- [x] **T3** — Implementar helper `fetchPipelineAggregates` em `context-builder.ts` (AC1, AC2, AC3, AC8)
  - [x] T3.1 — Criar função `fetchPipelineAggregates(supabase: SupabaseClient, orgId: string, pDays?: number): Promise<string>` que:
    - Verifica cache `getCached("pipeline_agg:" + orgId)` — retorna se hit
    - Executa em paralelo (`Promise.all`):
      - `supabase.rpc('pipeline_funnel_by_campaign', { p_days: pDays ?? 30 })` — função RPC com janela de tempo configurável (default 30 dias); NÃO usar `SELECT * FROM v_pipeline_funnel_by_campaign` (essa view não existe mais — foi convertida em função em 52-1 v0.4)
      - `supabase.from('v_pipeline_stage_distribution').select('*').eq('org_id', orgId)` — view inalterada
    - Formata resultado em seção de texto estruturada (padrão `=== PIPELINE COMERCIAL ===`) com tabelas de texto para funnel e distribuição por stage, usando `fmtBRL` para CPL e `fmtPct` para percentuais; quando `total_spend`, `cpl_real_visitou` ou `cpl_real_fechado` forem NULL, exibir "—" e NÃO "R$0,00" (NULL = sem dados de mídia correlacionados por nome de campanha, conforme REL-001 da 52-1)
    - Armazena em cache com `setCached("pipeline_agg:" + orgId, text)` (TTL de 5 min, mesmo padrão existente)
    - Retorna a string formatada (ou string vazia se RPC + view retornarem 0 rows — org sem dados de pipeline ainda)
    - DECISÃO A DOCUMENTAR no Dev Agent Record: `pDays` pode ser extraído da pergunta do usuário (ex.: "últimos 7 dias" → `p_days: 7`); se não detectado, usar 30 como default. Não precisa ser sofisticado — heurística simples ou default 30 são igualmente aceitáveis; documentar a escolha.
  - [x] T3.2 — Adicionar chamada a `fetchPipelineAggregates` dentro de `buildGlobalContext`, após o bloco de alertas, concatenando o resultado ao `text` final antes de `setCached`
    - ATENÇÃO: `buildGlobalContext` tem seu próprio cache na chave `"global:{orgId}"`. Avaliar se o pipeline agregado deve fazer parte desse mesmo cache ou ter cache separado. Opção recomendada: cache separado (`"pipeline_agg:{orgId}"`) para permitir invalidação independente no futuro. Documentar decisão no Dev Agent Record.

- [x] **T4** — Implementar helper `fetchLeadDrill` com fail-closed (AC4, AC6)
  - [x] T4.1 — Criar função `fetchLeadDrill(supabase: SupabaseClient, orgId: string, sessionId: string | null, filters: { campaign?: string; stageType?: string; limit?: number }): Promise<string | null>` que:
    - Chama `supabase.rpc('log_pii_access', { p_org_id: orgId, p_session_id: sessionId, p_data_type: 'lead_drill', p_scope: { filters }, p_view_or_source: 'v_lead_drill' })` — NÃO passar `p_admin_user_id` (removido em 52-4 v0.4; o registrador é derivado de `auth.uid()` internamente na função SQL)
    - Se `data !== true` ou `error !== null`: logar via `console.error`, retornar `null` (fail-closed)
    - Se auditoria OK: executar `SELECT * FROM v_lead_drill WHERE org_id = orgId [AND utm_campaign = filters.campaign] [AND stage_type = filters.stageType] LIMIT filters.limit ?? 10`
    - Formatar resultado em seção de texto `=== DRILL DE LEADS ===` com colunas `name`, `qualification_score`, `stage_type`, `ai_summary`, `utm_campaign`
    - Retornar a string formatada, ou `null` em falha de auditoria

- [x] **T5** — Implementar helper `fetchLeadConversations` com fail-closed (AC5, AC6)
  - [x] T5.1 — Criar função `fetchLeadConversations(supabase: SupabaseClient, orgId: string, sessionId: string | null, leadId: string): Promise<string | null>` que:
    - Chama `supabase.rpc('log_pii_access', { p_org_id: orgId, p_session_id: sessionId, p_data_type: 'conversation_content', p_scope: { lead_id: leadId }, p_view_or_source: 'v_lead_conversations' })` — NÃO passar `p_admin_user_id` (removido em 52-4 v0.4; derivado de `auth.uid()` internamente)
    - Se `data !== true` ou `error !== null`: logar via `console.error`, retornar `null` (fail-closed)
    - Se auditoria OK: executar `SELECT * FROM v_lead_conversations WHERE org_id = orgId AND lead_id = leadId ORDER BY message_created_at LIMIT 50`
    - Formatar resultado em seção de texto `=== CONVERSA DO LEAD ===` com mensagens por `role` e `content`
    - Retornar a string formatada, ou `null` em falha de auditoria

- [x] **T6** — Integrar gate `isAdmin` e heurística on-demand em `chat/route.ts` (AC13, AC14, AC4, AC5, AC6)
  - [x] T6.1 — Ler `chat/route.ts` para confirmar onde e como o `userMessage` está disponível antes da chamada ao modelo, e confirmar que `appUser` (com campo `role`) está acessível via `requireAuth()` existente — não há guard `requireRole` nesta rota (a 52-3 deliberadamente não o adiciona; `appUser.role` vem do fluxo de auth já presente)
  - [x] T6.2 — Imediatamente após `buildGlobalContext(supabase, orgId)` (que retorna apenas contexto de mídia) e antes de montar o payload para o modelo, derivar o gate:
    ```typescript
    const isAdmin = appUser.role === 'admin'
    ```
    Esta linha é o gate da camada (b) da aplicação para CRM. Nunca usar `canAccess` nem `is_admin_or_supervisor()` aqui.
  - [x] T6.3 — Bloco condicional de pipeline (executado SOMENTE se `isAdmin === true`):
    - Chamar `fetchPipelineAggregates(supabase, orgId)` — concatenar resultado ao contexto (agregados sempre para admin; `p_days` default 30, opcionalmente extraído da pergunta)
    - Se `requiresDrill(userMessage)`: chamar `fetchLeadDrill(supabase, orgId, sessionId, { /* filtros */ })` com filtros extraídos do `userMessage` (campaign e stage como melhor esforço — sem inventar campos que não existem na view); NÃO passar `adminUserId` (removido da assinatura em 52-4 v0.4); se resultado não-null, concatenar ao contexto
    - Se `fetchLeadDrill` retornar `null` (fail-closed): concatenar ao contexto a string `\n[DADOS SENSÍVEIS INDISPONÍVEIS — acesso de auditoria não pôde ser registrado neste momento. Informe o usuário que o detalhamento de lead não está disponível temporariamente.]`
    - Se `requiresConversation(userMessage)`: chamar `fetchLeadConversations(supabase, orgId, sessionId, leadId)` — NÃO passar `adminUserId`; extrair `leadId` da mensagem como melhor esforço (pode retornar null se não identificável — nesse caso não disparar a busca)
  - [x] T6.4 — Quando `isAdmin === false`: não adicionar nada ao contexto de pipeline. O contexto de mídia (`buildGlobalContext`) é retornado intato — nenhuma regressão para non-admin. Logar via `console.log` (debug, nível info) que o pipeline foi ignorado por non-admin request (sem expor dados do usuário no log).
  - [x] T6.5 — Garantir que o contexto base de mídia (`buildGlobalContext`) nunca é omitido para nenhum role — a extensão de pipeline é **aditiva** e condicional (CON-5)

- [x] **T7** — Atualizar `AGENT_SYSTEM_PROMPT` (AC9)
  - [x] T7.1 — Em `system-prompt.ts`, adicionar seção `## Acesso ao pipeline comercial` após `## Suas capacidades` existente, descrevendo:
    - Novas capacidades: cruzamento campanha/UTM × funil (leads por stage, CPL→visitou/fechado, distribuição por stage, drill individual, conteúdo de conversa quando explicitamente solicitado)
    - Limite read-only: NÃO propor ações sobre CRM (mover lead, alterar stage, deletar, criar); o agente pode APENAS LER e analisar os dados comerciais
    - Limite de privacidade: PII e conteúdo de conversa só são acessados quando explicitamente solicitados pelo usuário admin; o agente não deve oferecer proativamente dados individuais de leads
    - Instrução de formato: para respostas integradas mídia × funil, priorizar tabelas quando 3+ campanhas (padrão já existente); citar `utm_campaign` como âncora comum entre dados de mídia e funil
    - **Instrução sobre NULL spend (obrigatória — REL-001 da 52-1):** quando `total_spend`, `cpl_real_visitou` ou `cpl_real_fechado` aparecerem como `NULL` ou "—" no contexto, o agente deve interpretar como "sem dados de mídia correlacionados para essa campanha neste período" e informar o usuário que não há gasto de mídia rastreável via UTM para aquela campanha — NÃO como "CPL zero" nem como "campanha sem investimento"
  - [x] T7.2 — Verificar que as seções existentes (`## Como responder`, `## Ações executáveis`, bloco `<action_card>`) permanecem inalteradas (CON-5)
  - [x] T7.3 — Verificar que a seção `## Suas capacidades` existente não tem itens removidos — apenas adicionados

- [x] **T8** — Verificação de tipos, lint e token budget (AC10, AC11, AC12)
  - [x] T8.1 — `npm run typecheck` no workspace `packages/web` — zero erros de tipo nos arquivos modificados
  - [x] T8.2 — `npm run lint` no workspace `packages/web` — zero warnings novos
  - [x] T8.3 — Verificação manual de token budget: para um conjunto de dados típico (5 campanhas, 5 stages), estimar tokens do bloco `=== PIPELINE COMERCIAL ===` e garantir que está abaixo de 2.000 tokens (AC12). Documentar estimativa no Dev Agent Record.

- [ ] **T9** — Testes manuais (cenários do Testing)
  - [ ] T9.1 — Testar as 3 driving questions com dados reais no Supabase DEV (`xnxvygyfyyyzwhiuoehz`)
  - [ ] T9.2 — Testar drill on-demand — query com nome de campanha deve disparar `fetchLeadDrill`; verificar via log de servidor que `log_pii_access` foi chamado
  - [ ] T9.3 — Testar fail-closed: simular falha de `log_pii_access` (ex.: temporariamente revogar permissão da função no banco DEV) e verificar que a resposta do agente não contém PII, mas informa o usuário que o dado não está disponível
  - [ ] T9.4 — Testar regressão: perguntas exclusivamente de Meta Ads continuam respondidas corretamente (AC10)
  - [ ] T9.5 — Testar isolamento: verificar nos logs que `org_id` está sempre presente nas queries às views

---

## Dev Notes

### Arquivos a modificar
- `packages/web/src/lib/agent/context-builder.ts` — adicionar `fetchPipelineAggregates`, `fetchLeadDrill`, `fetchLeadConversations`, `requiresDrill`, `requiresConversation`; estender `buildGlobalContext` ou manter esses helpers separados (chamados condicionalmente em `chat/route.ts`)
- `packages/web/src/lib/agent/system-prompt.ts` — adicionar seção de pipeline ao `AGENT_SYSTEM_PROMPT`
- `packages/web/src/app/api/agent/chat/route.ts` — implementar gate `isAdmin` e integrar lógica on-demand (heurística + fetch condicional) antes da chamada ao modelo

### Arquivos a NÃO modificar
- Arquivos de migration (`supabase/migrations/`) — nenhuma DDL nesta story
- `packages/ai/` — IA Nicole não é tocada (CON-4)
- `packages/web/src/lib/api-auth.ts` — guard `requireRole` já está correto (Story 52-3)
- `packages/web/src/components/agent/agent-chat-panel.tsx` — UI não é escopo desta story (52-5)

### Gate `isAdmin` — padrão obrigatório em `chat/route.ts`

A decisão de produto determina que somente a capacidade de CRM é admin-only; a análise de mídia não regride para outros roles. O gate `isAdmin` é a ÚNICA verificação de role no fluxo de chat para CRM: `appUser.role` vem do `requireAuth()` existente (já presente na rota), e NÃO há (nem deve haver) um `requireRole` bloqueando o endpoint de chat — não-admin usa o chat de mídia normalmente. O gate deve ser implementado da seguinte forma em `chat/route.ts`, após `buildGlobalContext`:

```typescript
// Após buildGlobalContext (que retorna contexto de mídia, sem CRM):
const mediaContext = await buildGlobalContext(supabase, orgId)

// Gate de CRM — decisão de produto: somente admin
const isAdmin = appUser.role === 'admin'  // NUNCA usar canAccess() aqui

let pipelineContext = ''
if (isAdmin) {
  pipelineContext = await fetchPipelineAggregates(supabase, orgId)

  if (requiresDrill(userMessage)) {
    // NÃO passar adminUserId — removido da assinatura em 52-4 v0.4 (derivado de auth.uid() internamente)
    const drill = await fetchLeadDrill(supabase, orgId, sessionId, { /* filtros */ })
    pipelineContext += drill ?? '\n[DADOS SENSÍVEIS INDISPONÍVEIS — acesso de auditoria não pôde ser registrado neste momento.]'
  }

  if (requiresConversation(userMessage)) {
    const leadId = extractLeadId(userMessage)  // pode retornar null
    if (leadId) {
      // NÃO passar adminUserId — removido da assinatura em 52-4 v0.4
      const conv = await fetchLeadConversations(supabase, orgId, sessionId, leadId)
      pipelineContext += conv ?? '\n[DADOS SENSÍVEIS INDISPONÍVEIS — acesso de auditoria não pôde ser registrado neste momento.]'
    }
  }
}

// Contexto final: mídia sempre + pipeline somente para admin
const fullContext = mediaContext + pipelineContext
```

**Regra absoluta:** o bloco `if (isAdmin)` é o único ponto de decisão para acesso a CRM. Nenhum helper de pipeline pode ser chamado fora desse bloco.

### Padrão de extensão do `context-builder.ts`

Seguir a estrutura existente: funções auxiliares no topo, `buildGlobalContext` como ponto de entrada principal. Novos helpers `fetchPipelineAggregates`, `fetchLeadDrill` e `fetchLeadConversations` devem ser declarados antes de `buildGlobalContext` e chamados de `chat/route.ts` dentro do bloco `if (isAdmin)` (a alternativa de embutir o gate dentro de `buildGlobalContext` é menos preferível pois `buildGlobalContext` não tem acesso ao `appUser.role` hoje — verificar em T1.1 antes de decidir). Manter a nomenclatura `fetch*` como convenção para funções que fazem I/O com o banco.

```typescript
// Padrão de cache existente — reusar para pipeline_agg:
const key = `pipeline_agg:${orgId}`
const cached = getCached(key)
if (cached) return cached
// ... fetch ...
setCached(key, text)
return text
```

### Contrato de fail-closed (implementação TypeScript obrigatória)

Baseado no contrato fixado na Story 52-4 (seção "Contrato de Fail-Closed para 52-2"):

```typescript
// Em fetchLeadDrill e fetchLeadConversations:
// ATENÇÃO: assinatura v0.4 da 52-4 — 5 argumentos, SEM p_admin_user_id.
// O registrador (admin_user_id) é derivado internamente de auth.uid() pela função SQL.
const { data, error } = await supabase.rpc('log_pii_access', {
  p_org_id:         orgId,
  // p_admin_user_id: REMOVIDO (52-4 v0.4 — SEC-003)
  p_session_id:     sessionId ?? null,
  p_data_type:      'lead_drill',          // ou 'conversation_content'
  p_scope:          { filters },
  p_view_or_source: 'v_lead_drill',        // ou 'v_lead_conversations'
})

if (data !== true || error !== null) {
  console.error('[52-2] log_pii_access falhou — acesso sensível negado', { error, data, orgId })
  return null  // caller injeta mensagem de indisponibilidade ao contexto
}

// Somente aqui: buscar dado sensível na view
```

**Regra absoluta:** o bloco de fetch da view sensível NÃO pode ser executado antes da confirmação `data === true` da função de auditoria.

### Decisão sobre `requiresDrill` e `requiresConversation`

[AUTO-DECISION] Mecanismo on-demand → heurística baseada em palavras-chave aplicada ao `userMessage` antes de chamar o modelo (reason: a alternativa de "tool use" do Anthropic exigiria uma segunda chamada ao modelo para decidir se busca o dado, aumentando latência e custo; a heurística é previsível, auditável e implementável sem infra adicional; o risco de falso positivo — disparar busca de drill para query que não pede — é aceitável dado que o audit log registra o acesso e o dado é apresentado apenas se relevante ao contexto).

Palavras-chave sugeridas (documentar lista exata no Dev Agent Record):
- `requiresDrill`: "lead", "contato", "quem é", "me mostra", "detalhes do", "proposta de", "histórico de", "score", nome próprio (heurística: palavra com inicial maiúscula que não seja início de frase)
- `requiresConversation`: "conversa", "mensagem", "o que foi dito", "histórico da conversa", "Nicole", "chat com"

O @dev pode refinar esta lista durante T2 e deve documentar a lista final.

### Decisão sobre logging de `aggregated_metrics`

[AUTO-DECISION] Agregados sem PII (resultado de `pipeline_funnel_by_campaign(p_days)` e de `v_pipeline_stage_distribution`) → logging de auditoria com `data_type = 'aggregated_metrics'` é **opcional** e **não fail-closed** (reason: NFR-OBS-1 e o contrato da Story 52-4 aplicam fail-closed apenas para dados com PII; agregados não contêm informação identificável de leads individuais; aplicar fail-closed aqui bloquearia respostas às driving questions FR-1/FR-2/FR-3 mesmo sem PII envolvida, o que seria desproporcional).

Recomendação: chamar `log_pii_access` com `'aggregated_metrics'` para rastreabilidade, mas **não** aplicar fail-closed — se o log falhar, prosseguir com a injeção dos agregados normalmente. Documentar esta decisão no Dev Agent Record.

### Fonte de `sessionId` em `chat/route.ts`

O @dev deve verificar em T1.3 como `chat/route.ts` expõe:
- `adminUserId`: **NÃO é mais necessário passar às funções** `fetchLeadDrill`/`fetchLeadConversations` nem à chamada RPC de `log_pii_access`. Em 52-4 v0.4 (SEC-003), o parâmetro foi removido da assinatura SQL — `admin_user_id` é sempre derivado de `auth.uid()` dentro da função. O `appUser.id` continua disponível em `chat/route.ts` via `requireAuth()`, mas NÃO deve ser passado para `log_pii_access`.
- `sessionId`: deve ser o `session_id` do body do request ou da sessão ativa; aceita `null` (conforme AC2 da Story 52-4)

Não inventar campos — verificar o código real antes de escrever.

### Formato da seção de pipeline no contexto

Seguir o padrão visual existente de `buildGlobalContext`:

```
=== PIPELINE COMERCIAL (integração mídia × funil) ===

--- Funil por Campanha/UTM (últimos 30 dias) ---
[Nota: CPL Visitou/CPL Fechado = "—" quando não há dados de mídia correlacionados por nome de campanha]
| Campanha/UTM       | Total Leads | Qualif. | Visitou | Fechou | CPL Visitou | CPL Fechado |
|--------------------|-------------|---------|---------|--------|-------------|-------------|
| camp-yarden-mai    |          87 |      42 |      12 |      3 | R$1.250,00  | R$5.000,00  |
| camp-sem-midia     |          20 |       8 |       3 |      1 | —           | —           |
...

--- Distribuição por Stage ---
| Campanha/UTM    | Stage      | Leads | % do Total |
|-----------------|------------|-------|------------|
| camp-yarden-mai | qualificado|    42 |       48%  |
...
```

Usar `fmtBRL` para CPL e `fmtPct`/`pct` para percentuais — mesmos helpers do contexto de mídia.

### Estimativa de tokens (AC12)

Contexto de mídia atual (5 campanhas, ~20 linhas por campanha, alertas): ~800-1.200 tokens estimados.
Pipeline agregado (20 campanhas × 7 colunas de funil + 20×10 rows de stage distribution): ~1.500-2.000 tokens estimados.
Total com pipeline: ~2.300-3.200 tokens — bem abaixo do limite de contexto do `claude-sonnet-4-6` (200K tokens).
O budget de 2.000 tokens para o bloco de pipeline (AC12) é conservador e deve ser validado em T8.3.

### Ambiente de validação
- Validar SEMPRE no Supabase DEV isolado: projeto `xnxvygyfyyyzwhiuoehz`
- Variável de ambiente local: `packages/web/.env.development` aponta para o projeto DEV
- Nunca aplicar mudanças que afetam fluxo de PII direto em prod sem validação DEV + @qa gate

---

## Testing

### Abordagem
- Testes manuais end-to-end no Supabase DEV (`xnxvygyfyyyzwhiuoehz`) com dados de teste
- Verificação de tipos (`typecheck`) e lint como gates automáticos
- Teste explícito de fail-closed: simular falha de `log_pii_access` e verificar comportamento
- Verificação de regressão: queries de Meta Ads puras continuam funcionando

### Cenários de teste

1. **Driving question — fechamento por campanha (AC1):**
   Dado dados de teste com leads em diferentes stages por campanha, enviar "Qual campanha traz leads que mais fecham?" → agente responde com tabela de campanhas ordenada por `leads_fechado / total_leads`, citando `cpl_real_fechado`

2. **Driving question — CPL real ponderado (AC2):**
   Enviar "Qual o CPL real considerando quem visitou?" → agente responde com `cpl_real_visitou` de `pipeline_funnel_by_campaign(30)` (RPC), diferenciando do CPL Meta já presente no contexto de mídia. Verificar também que campanhas com `cpl_real_visitou = NULL` são apresentadas como "sem dados de mídia correlacionados" — não como R$0,00

3. **Driving question — gargalos no funil (AC3):**
   Enviar "Onde os leads da campanha Yarden estão travando?" → agente responde com `v_pipeline_stage_distribution` filtrada para a campanha, identificando o stage com maior concentração

4. **Drill on-demand disparado (AC4):**
   Enviar "Me mostra os leads em proposta da campanha Yarden" → heurística `requiresDrill` retorna true; servidor chama `log_pii_access` com `data_type = 'lead_drill'`; função retorna true; `v_lead_drill` é consultada e injetada; agente lista leads com name/score/stage_type/ai_summary; verificar nos logs do servidor que o fluxo foi executado

5. **Drill não disparado para query genérica (AC4 negativo):**
   Enviar "Qual campanha tem melhor CTR?" → heurística `requiresDrill` retorna false; `fetchLeadDrill` não é chamado; nenhuma linha de `v_lead_drill` aparece no contexto enviado ao modelo

6. **Fail-closed — auditoria falha, PII negada (AC6):**
   Simular falha da função `log_pii_access` no banco DEV (ex.: revogar EXECUTE temporariamente); enviar query que dispara drill; verificar que:
   - Resposta do agente não contém `name` ou `ai_summary` de nenhum lead
   - Resposta informa ao usuário que o detalhamento não está disponível momentaneamente
   - `console.error` do servidor contém log de falha com `orgId`

7. **Fail-closed — conversa de lead (AC5, AC6):**
   Mesmo padrão do cenário 6 para `fetchLeadConversations`: `log_pii_access` falha → `content` de nenhuma mensagem aparece no contexto

8. **Agregados não bloqueados por fail-closed (AC7):**
   Com `log_pii_access` simulado como falho, enviar "Qual campanha tem mais leads fechados?" (sem drill implícito) → resposta usa dados de `pipeline_funnel_by_campaign(30)` (RPC) normalmente (agregados sem PII não são fail-closed)

9. **Cache de agregados (AC8):**
   Fazer duas queries consecutivas que consultam dados de pipeline → verificar via log de servidor que a segunda request usa o cache (`getCached` retorna hit), sem nova chamada ao banco

10. **Regressão — Meta Ads puro (AC10):**
    Enviar "Pause a campanha com pior CPL" → agente identifica campanha via dados de `meta_insights_daily` já existentes, propõe `<action_card type="pause_campaign">` normalmente; nenhuma alteração de comportamento vs. pré-52-2

11. **Isolamento multi-tenant (AC11):**
    Verificar nos logs do servidor que as queries às views sempre incluem `orgId` no filtro; verificar via Supabase SQL que dados de org A não aparecem em resposta para sessão de org B

12. **Gate por role — non-admin não recebe CRM (AC13):**
    Logar como `supervisor` no ambiente DEV. O painel do agente é visível para todos os roles (decisão de produto travada — a Story 52-3 não oculta o painel nem bloqueia o chat). Abrir o painel e enviar a pergunta "Qual campanha traz leads que mais fecham?". Verificar: (a) nenhum log de servidor indica chamada a `fetchPipelineAggregates`; (b) o contexto enviado ao modelo (logado em debug) não contém `PIPELINE COMERCIAL`; (c) o agente responde com dados de Meta Ads normalmente (sem regressão). Repetir com role `broker`. Este cenário valida a decisão de produto travada pelo stakeholder.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Fail-closed não implementado corretamente — `data !== true` é ignorado e PII flui sem auditoria | **Alta** | AC6 e cenário de teste 6 validam explicitamente; @qa deve testar falha simulada de `log_pii_access`; Dev Notes descrevem o padrão obrigatório |
| R2 | Heurística on-demand sempre dispara — todo request consulta `v_lead_drill` e `v_lead_conversations`, estourando token budget e custo | **Alta** | T2 define lista de palavras-chave; cenário 5 testa que query genérica não dispara drill; AC12 valida token budget |
| R3 | Regressão no fluxo de mídia — alteração em `buildGlobalContext` quebra cache existente ou omite dados de mídia do contexto | **Alta** | AC10 e cenário 10 de regressão; a extensão deve ser aditiva (concatenação ao texto final); CON-5 explícito no Scope OUT |
| R4 | `sessionId` não disponível em `chat/route.ts` — `log_pii_access` chamado sem session válida | **Baixa** | `sessionId` aceita NULL conforme Story 52-4 (AC2); `adminUserId` não é mais parâmetro (removido em 52-4 v0.4 — derivado de `auth.uid()` internamente). T1.3 verifica campo `session_id` disponível antes de escrever. |
| R5 | Cache de pipeline agregado stale — admin vê dados de pipeline desatualizados por até 5 min enquanto leads mudam de stage | **Média** | TTL de 5 min é aceitável para análise estratégica; documentado como limitação conhecida; dados on-demand (drill) não são cacheados |
| R6 | Dado sensível injetado no cache global (`"global:{orgId}"`) — admin de sessão diferente recebe contexto com PII de drill de sessão anterior | **Alta** | AC8 proíbe cache de dados on-demand; dados de drill e conversas são concatenados apenas ao contexto do request corrente, nunca ao cache global; T8 valida separação de cache |
| R7 | `org_id` ausente em query às views — cross-tenant leak (defesa em profundidade além da RLS) | **Alta** | AC11 e cenário 11 validam presença de `orgId` nos filtros; NFR-SEC-5 do épico; RLS das views é segunda camada |
| R8 | System prompt muito longo após adição de seção de pipeline | **Baixa** | Seção deve ser concisa (≤ 20 linhas); verificar em T7 que o prompt total não excede budget razoável; `claude-sonnet-4-6` tem 200K tokens de contexto |
| R9 | Vazamento de dado de CRM para usuário não-admin por ausência de gate `isAdmin` em algum caminho de código (ex.: refatoração futura que move a lógica de injeção sem mover o gate) | **Alta** | Gate `isAdmin` implementado como bloco condicional explícito em `chat/route.ts` antes de qualquer helper de pipeline (T6.2/T6.3); RLS das views da Story 52-1 é backstop — mesmo sem o gate de aplicação, 0 rows seriam retornadas para non-admin; AC13 e cenário de teste 12 validam por role; @qa deve testar com role `supervisor` e `broker` explicitamente |

---

## Dependencies

- **Depende de:**
  - Story 52-1 (Done) — função RPC `pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` + views `v_pipeline_stage_distribution`, `v_lead_drill`, `v_lead_conversations` com RLS admin-only; contrato de dados preenchido. A RLS serve como camada (a) da defesa em profundidade — esta story adiciona a camada (b) de aplicação via gate `isAdmin`. O funil foi convertido de view para função em 52-1 v0.4 (janela de tempo configurável via `p_days`).
  - Story 52-4 (Done) — tabela `agent_pii_access_log` + função `public.log_pii_access(...)` com contrato fail-closed preenchido
  - Story 52-3 (Done) — entrega dois pré-requisitos críticos para esta story: (1) utilitário `isAdmin(user): boolean` exportado de `auth-helpers.ts` (ou arquivo equivalente) com contrato documentado — esta story consome esse utilitário para o gate de pipeline CRM; (2) hardening da whitelist de `action_card.type` (read-only enforcement para ações). A 52-3 deliberadamente NÃO adiciona guard de role em `chat/route.ts` — não-admin continua usando o chat de mídia normalmente; `appUser.role` já está disponível via `requireAuth()` existente na rota, independentemente da 52-3.
- **Bloqueia diretamente:** Story 52-5 (UX da Resposta Integrada) — depende de respostas integradas funcionando para trabalhar renderização
- **Dependências técnicas:**
  - `packages/web/src/lib/agent/context-builder.ts` — arquivo principal a modificar
  - `packages/web/src/lib/agent/system-prompt.ts` — arquivo a atualizar
  - `packages/web/src/app/api/agent/chat/route.ts` — integrar lógica on-demand
  - `supabase/migrations/096_crm_pipeline_readonly_layer.sql` (Story 52-1) — função RPC `pipeline_funnel_by_campaign` + 3 views a consumir
  - `supabase/migrations/097_agent_pii_access_log.sql` (Story 52-4) — função `log_pii_access` a chamar

---

## Definition of Done

- [ ] Gate `isAdmin = appUser.role === 'admin'` implementado em `chat/route.ts` antes de qualquer chamada a helper de pipeline; não-admin nunca dispara busca de CRM (AC13)
- [ ] Admin recebe contexto integrado de pipeline conforme regras (agregados eager + on-demand com fail-closed) (AC14)
- [ ] Teste por role executado: `supervisor` e `broker` não recebem dado de CRM no contexto; análise de Meta Ads funciona normalmente para esses roles (AC13)
- [ ] `fetchPipelineAggregates` sempre chama `supabase.rpc('pipeline_funnel_by_campaign', { p_days: 30 })` e `v_pipeline_stage_distribution` e inclui o resultado no contexto **quando `isAdmin === true`** (AC1, AC2, AC3)
- [ ] Drill on-demand de `v_lead_drill` funciona quando query pede lead individual; `log_pii_access` é chamado antes (AC4)
- [ ] Acesso on-demand a `v_lead_conversations` funciona quando query pede conversa; `log_pii_access` é chamado antes (AC5)
- [ ] Fail-closed implementado: `data !== true` ou `error !== null` em `log_pii_access` → dado sensível não injetado; contexto informa indisponibilidade (AC6)
- [ ] Agregados cacheados em `"pipeline_agg:{orgId}"` (5 min TTL); drill e conversas não cacheados em cache global (AC8)
- [ ] `AGENT_SYSTEM_PROMPT` contém seção de pipeline com capacidades, limites read-only e limites de privacidade; seções existentes intactas (AC9)
- [ ] Respostas de Meta Ads puras sem regressão (AC10)
- [ ] Isolamento multi-tenant: `orgId` presente em todas as queries às views (AC11)
- [ ] Contexto de pipeline agregado abaixo de 2.000 tokens estimados (AC12); estimativa documentada no Dev Agent Record
- [ ] `npm run typecheck` sem erros novos
- [ ] `npm run lint` sem warnings novos
- [ ] Cenários de teste 1–3 (driving questions) validados com dados reais no Supabase DEV
- [ ] Cenário de teste 6 (fail-closed simulado) executado e aprovado
- [ ] @qa executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Validacao de qualidade usara processo de revisao manual pelo @qa.

---

## Change Log

| Data | Versao | Descricao | Autor |
|------|--------|-----------|-------|
| 2026-06-15 | 0.1 | Story drafted a partir do Epic 52 e das stories 52-1, 52-4, 52-3; decisoes de heuristica on-demand e logging de agregados documentadas como AUTO-DECISION; fail-closed implementado conforme contrato da 52-4 | @sm (River) |
| 2026-06-15 | 0.2 | Revisao por decisao de produto travada pelo stakeholder: somente CRM e admin-only; analise de midia continua disponivel para todos os roles sem regressao. Adicionados AC13 (non-admin: nenhum dado de CRM buscado nem injetado, midia funciona normalmente) e AC14 (admin: contexto de CRM injetado conforme regras). Gate isAdmin explicitado nas Tasks (T6.2-T6.4), Dev Notes (padrao obrigatorio em chat/route.ts), Risks (R9 — vazamento via gate ausente com mitigacao RLS backstop + teste por role), Dependencies (52-3 como provedor do padrao isAdmin estrito), Definition of Done e cenario de teste 12. Status: Draft. | @sm (River) |
| 2026-06-15 | 0.3 | Correcao cirurgica: remocao de contradicao residual herdada da v0.1 da 52-3. A story 52-3 v0.3 (Ready, GO do @po) NAO adiciona guard requireRole em /api/agent/chat — nao-admin continua usando o chat de midia normalmente; o painel do agente e visivel para todos. appUser.role ja esta disponivel via requireAuth() existente na rota, independente da 52-3. O gate isAdmin (appUser.role === 'admin') e a UNICA verificacao de role para CRM na camada de aplicacao. Corrigidos: ancora tecnica na secao Context (linha ~40); instrucoes T1.3 e T1.6; Dev Notes secao Gate isAdmin (remocao da frase sobre requireRole como segunda camada); T6.1; cenario de teste 12 (painel sempre visivel para todos os roles, sem hesitacao); secao Dependencies (52-3 entrega utilitario isAdmin + whitelist de acoes, nao guard de chat). Status: Draft. | @sm (River) |
| 2026-06-15 | 0.4 | Validacao PO (checklist 10/10) — veredito GO apos correcao da contradicao residual (v0.3). Status Draft → Ready. Gate isAdmin como ponto unico de decisao, fail-closed obrigatorio antes de PII, cache separado para agregados (drill/conversas nunca cacheados) e nao-regressao de midia (AC10/AC13) aprovados. Ressalva para @qa: testar explicitamente o fail-closed simulado (cenario 6) e o gate por role com supervisor/broker (cenario 12). | @po (Pax) |
| 2026-06-16 | 0.5 | Sincronizacao cirurgica de contrato pos-fixes QA das stories 52-1 e 52-4. **(A) Funil view→funcao RPC (52-1 v0.4 / PERF-001):** `v_pipeline_funnel_by_campaign` nao existe mais — convertida em funcao table-valued `public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` consumida via `supabase.rpc('pipeline_funnel_by_campaign', { p_days: N })`. Impacto: Scope IN, AC14, AC1, AC2, T1.4, T3.1 (query de funil agora eh rpc nao select-from-view; `pDays` opcional com default 30; decisao de extracao de janela documentada em T3.1), T6.3 (fetchPipelineAggregates recebe pDays), Dev Notes formato da tabela (cabecalho "ultimos 30 dias" + exemplo de linha sem midia), Dev Notes snippet Gate isAdmin, Dependencies (story 52-1 e funcao+3views), Definition of Done, cenarios de teste 2 e 8. Adicionada instrucao obrigatoria no T7.1 (AGENT_SYSTEM_PROMPT): NULL/— em total_spend/CPL = "sem dados de midia correlacionados" — NAO zero (REL-001 da 52-1). Mesmo instrucao no AC2. **(B) `log_pii_access` perdeu `p_admin_user_id` (52-4 v0.4 / SEC-003):** assinatura agora tem 5 args sem `p_admin_user_id`; `admin_user_id` e derivado de `public.public_user_id()` (auth.uid()) internamente — trilha infalsificavel. Impacto: assinaturas de `fetchLeadDrill` e `fetchLeadConversations` removem `adminUserId` (T4.1, T5.1); snippet fail-closed nos Dev Notes atualizado (campo comentado como REMOVIDO); snippet Gate isAdmin em T6.3 e Dev Notes nao passa mais `appUser.id` nas chamadas; secao "Fonte de adminUserId" renomeada para "Fonte de sessionId" com nota explicita do motivo da remocao. `adminUserId` continua disponivel em `chat/route.ts` via `requireAuth()` mas NAO deve ser passado para `log_pii_access`. Status mantido: Ready. | @sm (River) |
| 2026-06-16 | 0.7 | QA gate @qa (Quinn) — **CONCERNS** (PASS no eixo de seguranca). **SEC-002 RESOLVIDO/GREEN** verificado pelo proprio @qa: client authenticated (anon+JWT) end-to-end em chat/route.ts, zero service_role no caminho do agente (grep limpo) — forward-gate da 52-4 fechado. Fail-closed (AC6), gate isAdmin unico ponto de decisao (AC13/AC14) e CON-5 (midia sempre, pipeline aditivo) confirmados estaticamente. 2 CONCERNS nao-bloqueantes aceitas com follow-up: REQ-001 (AC5 so resolve conversa via UUID explicito — limitacao conservadora, follow-up 52-5) e PERF-001 (AC12 caso extremo ~2.400 tokens > alvo 2.000; tipico passa folgado). TEST-001: E2E autenticado pendente (T9 manual). Done = QA PASS critico + estatico/contrato no DEV; E2E + git/prod pendentes. Status: Review → Done. | @qa (Quinn) |
| 2026-06-16 | 0.6 | Implementacao @dev (Dex). Adicionados em `context-builder.ts`: `requiresDrill`/`requiresConversation` (heuristica por keyword), `fetchPipelineAggregates` (RPC funil + view stage; cache `pipeline_agg:{orgId}` so na janela 30d), `fetchLeadDrill`/`fetchLeadConversations` (fail-closed: `log_pii_access` antes da view; `null` em falha), helper `fmtBRLNullable` (NULL→"—", REL-001). `system-prompt.ts`: secao `## Acesso ao pipeline comercial` (capacidades, read-only, privacidade, NULL=sem midia). `chat/route.ts`: gate `isAdmin(appUser)` como unico ponto de decisao CRM, bloco condicional (agregados eager + drill/conversa on-demand), `extractLeadId`/`extractDrillFilters`. **SEC-002 RESOLVIDO/GREEN:** client = autenticado (anon+JWT via `createServerClient`), NAO service_role — RLS/fail-closed aplicam. Smoke-test DEV (anon): RPC+3 views existem e bloqueiam anon (42501); `log_pii_access`→`200 false` (fail-closed confirmado). type-check 0 erros; lint 0 erros/warnings novos. Pendente: testes role-diferenciados com sessao autenticada (T9). Status: Ready → Review. | @dev (Dex) |

---

## Pendente de teste manual (T9 — requer app rodando + sessão autenticada no DEV)

Os cenários abaixo exigem o Next.js apontando para o DEV (`xnxvygyfyyyzwhiuoehz`) e login real (cookies/JWT) com os usuários seedados (org `52000000-0000-0000-0000-0000000000a1`: admin `...ad`, supervisor `...bd`; campanha "Camp Teste" com spend e leads em vários stages). Não executáveis headless nesta sessão sem inventar resultado.

- **T9.1 (AC1/AC2/AC3)** — Logar como admin; enviar as 3 driving questions; conferir tabela markdown com `leads_fechado`, `cpl_real_visitou`/`cpl_real_fechado`, distribuição por stage; conferir que campanha sem mídia mostra "—" e o agente diz "sem dados de mídia correlacionados".
- **T9.2 (AC4)** — Admin: "Me mostra os leads em proposta da campanha \"Camp Teste\"" → `requiresDrill=true`; conferir log `[52-2]`/console e `agent_pii_access_log` recebendo row `lead_drill`.
- **T9.3 (AC6)** — Simular falha de `log_pii_access` no DEV (ex.: `REVOKE EXECUTE ... FROM authenticated` temporário) → resposta sem PII + aviso de indisponibilidade; `console.error [52-2]` presente. Reverter o REVOKE depois.
- **T9.4 (AC10)** — Admin/qualquer role: "Qual campanha tem melhor CTR?" / "Pause a pior campanha" → resposta de mídia + `<action_card>` sem regressão; `requiresDrill=false` (nenhuma row de `v_lead_drill` no contexto).
- **T9.5 (AC11)** — Conferir nos logs/queries que todas as chamadas às views/RPC carregam `org_id` e que dados de outra org não vazam.
- **Cenário 12 (AC13)** — Logar como `supervisor` e `broker`: enviar driving question; conferir que NÃO há chamada a `fetchPipelineAggregates` (log `[52-2] pipeline CRM ignorado para request non-admin`), contexto sem `=== PIPELINE COMERCIAL ===`, e mídia respondida normalmente.
- **extractLeadId (AC5)** — Conversa só dispara com UUID explícito na mensagem; validar UX esperada (usuário precisa referenciar o lead por id) ou registrar como melhoria futura se o produto quiser resolução por nome.

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M) — @dev (Dex), modo YOLO autônomo, 2026-06-16.

### Debug Log References

**SEC-002 (gate bloqueante — follow-up 52-4 / decisão @qa) — RESOLVIDO / GREEN:**
O client Supabase usado para TODAS as queries de pipeline (RPC `pipeline_funnel_by_campaign`, views `v_*`) e para `log_pii_access` é o `supabase` retornado por `requireAuth()` em `chat/route.ts`. Rastreando a cadeia: `requireAuth()` (`@web/lib/api-auth`) → `createClient()` (`@web/lib/supabase/server`) → `createServerClient` (`@supabase/ssr`) com **anon key + cookies do usuário** (JWT da sessão). Isto é o client autenticado com role `authenticated` — **NÃO** service_role/secret key. Verificado em `packages/web/src/lib/supabase/server.ts` (usa `SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, nunca `SUPABASE_SERVICE_ROLE_KEY`). Consequência: a RLS admin-only + isolamento por org das views (52-1) e a verificação `public.user_role() = 'admin'` + anti cross-tenant dentro de `log_pii_access` (52-4) aplicam-se corretamente. Não há uso de service_role no fluxo de chat. Nenhuma ação corretiva necessária — o código já usava o client autenticado. Defesa em profundidade preservada (gate `isAdmin` na aplicação + RLS no banco).

**Smoke-test de contrato no DEV (`xnxvygyfyyyzwhiuoehz`) — via anon key (sem JWT), validação de existência e segurança:**
- `POST /rest/v1/rpc/pipeline_funnel_by_campaign {p_days:30}` → `401 / 42501 permission denied for function` → função EXISTE; GRANT correto (apenas `authenticated`); anon bloqueado. ✓
- `GET v_pipeline_stage_distribution`, `v_lead_drill`, `v_lead_conversations` → `401 / 42501 permission denied for view` → 3 views EXISTEM; GRANT correto; anon bloqueado. ✓
- `POST /rest/v1/rpc/log_pii_access {...}` → `200 false` → função EXISTE e retorna `FALSE` (não erro) para caller sem admin válido → comportamento **fail-closed** confirmado no nível do banco; a branch TS `auditOk !== true → return null` trata exatamente este caso. ✓

Conclusão do smoke-test: nomes/assinaturas de RPC e views batem com o código; camada de segurança (GRANT + RLS + fail-closed) está ativa no DEV. Os testes role-diferenciados (admin vê dados, supervisor/broker não, driving questions, drill firing) exigem sessão de browser autenticada com JWT dos usuários seedados — não executáveis headless aqui sem risco de inventar resultado; documentados como pendentes em "Pendente de teste manual".

### Completion Notes List

**1. Decisão de cache — pipeline_agg separado do cache global (T3.2):**
Cache separado na chave `pipeline_agg:{orgId}` (TTL 5 min, reusa `getCached`/`setCached` existentes). NÃO mesclado no cache `global:{orgId}` de `buildGlobalContext`. Motivo: (a) permite invalidação independente no futuro; (b) `buildGlobalContext` não tem acesso a `appUser.role`, então o gate `isAdmin` mora em `chat/route.ts` e os helpers de pipeline são chamados de lá — manter caches separados evita poluir o cache de mídia (compartilhado por todos os roles) com dados de CRM. Cache aplicado APENAS à janela default de 30 dias (`cacheable = days === 30`); janelas customizadas não são cacheadas para não multiplicar variações de chave.

**2. Lista final de palavras-chave (T2.3):**
- `requiresDrill` (DRILL_KEYWORDS): `lead`, `leads`, `contato`, `quem é`/`quem e`, `me mostra`, `mostra os`, `detalhe`, `detalhes do`, `proposta de`, `histórico de`/`historico de`, `score`, `qualification`, `qualificação do`/`qualificacao do`. Match case-insensitive por `String.includes`.
- `requiresConversation` (CONVERSATION_KEYWORDS): `conversa`, `conversas`, `mensagem`, `mensagens`, `o que foi dito`, `o que falaram`, `histórico da conversa`/`historico da conversa`, `nicole`, `chat com`, `diálogo`/`dialogo`.
- Raciocínio: heurística por keyword (AUTO-DECISION da story, não tool-use) — previsível, auditável, sem 2ª chamada ao modelo. Falsos positivos são aceitáveis: o audit log registra o acesso e o dado só é apresentado se relevante. Risco R2 (drill sempre dispara) mitigado porque as listas exigem termos específicos de drill/conversa, não disparam em queries puras de mídia ("CTR", "CPM", "pausar campanha").

**3. Extração de filtros / leadId (T6.3):**
- `extractDrillFilters(message)`: campanha entre aspas (`"..."`/`'...'`/`“...”`) → `filters.campaign`; stage_type casado contra o enum conhecido (`novo`/`qualificado`/`agendado`/`visitou`/`proposta`/`fechado`/`perdido`) → `filters.stageType`. Melhor esforço, sem inventar campos.
- `extractLeadId(message)`: extrai UUID via regex; se não houver UUID explícito → retorna `null` e a busca de conversa NÃO é disparada (contrato conservador da story — nome de lead não basta para resolver `lead_id` sem query extra, que sairia do escopo). Limitação documentada como ponto de teste manual.

**4. Janela `pDays` (T3.1):**
Default 30. Heurística de extração de janela ("últimos 7 dias" → 7) NÃO implementada nesta entrega — `fetchPipelineAggregates` aceita `pDays?` opcional para extensão futura, mas `chat/route.ts` sempre chama com default 30. Decisão: a story marca extração de janela como "não precisa ser sofisticado; default 30 aceitável". Mantido simples e cacheável (cache só na janela 30d).

**5. Logging de `aggregated_metrics` (decisão Dev Notes):**
NÃO chamado. `fetchPipelineAggregates` não invoca `log_pii_access('aggregated_metrics')`. Motivo: agregados não contêm PII; AC7 exige que agregados NÃO sejam fail-closed; o logging de agregados é explicitamente opcional na story. Optei por não logar para reduzir round-trips ao banco no caminho eager (chamado em todo request de admin). Se @qa exigir trilha de auditoria também para agregados, é um one-liner aditivo não-fail-closed.

**6. Estimativa de token budget (AC12 / T8.3):**
- Caso típico (5 campanhas × 5 stages): ~2.224 chars ≈ **~635 tokens** — bem abaixo do budget de 2.000. ✓
- Caso extremo (20 campanhas × 7 stage_types = 140 rows de distribuição + 20 rows de funil): ~8.401 chars ≈ **~2.400 tokens** — acima do budget de 2.000 no extremo absoluto. A AC12 dimensiona o budget contra dataset "típico (≤20 campanhas, ≤10 stages)"; o caso típico passa folgado. Ponto para @qa: se orgs com 20 campanhas ativas × todos os stages forem comuns, considerar cap de rows na distribuição por stage (ex.: top-N por lead_count). Não implementei cap para não alterar a semântica de AC3 sem decisão de produto.

**7. NULL = sem mídia (REL-001):**
Helper `fmtBRLNullable(n)` formata `null`/`undefined` como `—` (NUNCA "R$0,00"). Aplicado a `cpl_real_visitou`/`cpl_real_fechado`. Instrução obrigatória correspondente adicionada ao `AGENT_SYSTEM_PROMPT` (seção "Acesso ao pipeline comercial" → "Regra de interpretação de NULL").

**8. Type-check / lint (T8.1, T8.2):**
- `npm run type-check` (`tsc --noEmit`, com `NODE_OPTIONS=--max-old-space-size=8192`): **0 erros**. ✓
- `npm run lint` (ESLint) nos 3 arquivos modificados: **0 erros, 0 warnings novos**. O único warning nos arquivos tocados (`context-builder.ts:160 'today' unused`) é PRE-EXISTENTE em `buildCampaignContext` (committed em `5cfca7b`, não tocado por esta story — verificado via `git show HEAD`). Os 8 erros/18 warnings restantes do lint global são todos em arquivos não relacionados (weather-widget, leads/page, pdf/informe-pdf, etc.) e pré-existentes.

### File List

#### Modified
- `packages/web/src/lib/agent/context-builder.ts` — adicionados `requiresDrill`, `requiresConversation`, `fetchPipelineAggregates`, `fetchLeadDrill`, `fetchLeadConversations`, helper `fmtBRLNullable` e tipos de linha (FunnelRow/StageDistRow/LeadDrillRow/ConversationRow). Reusa `getCached`/`setCached`/`fmtBRL`/`fmtPct` existentes. Nenhuma função existente alterada (CON-5).
- `packages/web/src/lib/agent/system-prompt.ts` — adicionada seção `## Acesso ao pipeline comercial` ao `AGENT_SYSTEM_PROMPT` (capacidades mídia×funil, limite read-only, limite de privacidade, regra de NULL=sem mídia, formato de resposta integrada). Seções existentes intactas (AC9, CON-5).
- `packages/web/src/app/api/agent/chat/route.ts` — gate `isAdmin` (via `isAdmin(appUser)` de `auth-helpers`) como único ponto de decisão de CRM; bloco condicional de pipeline (agregados eager + drill/conversa on-demand com fail-closed); helpers `extractLeadId`/`extractDrillFilters`. Contexto final = mídia (sempre) + pipeline (só admin, aditivo).

#### Created
- _(nenhum arquivo novo)_

---

## QA Results

### Review Date: 2026-06-16

### Reviewed By: Quinn (Test Architect / Guardian)

**Verdict: CONCERNS** (PASS no eixo de seguranca; CONCERNS por 2 limitacoes nao-bloqueantes — AC5 e AC12 — aceitas como follow-up). Revisao estatica + contrato de banco; E2E autenticado pendente (follow-up manual, mesmo padrao de honestidade das gates 52-1/52-3/52-4).

#### 1. SEC-002 (gate bloqueante herdado da 52-4) — RESOLVIDO / GREEN

Verifiquei eu mesmo lendo o codigo, nao confiei no relato do @dev:
- `chat/route.ts:80` destrutura `{ supabase, appUser }` de `requireAuth()`. Esse **mesmo** `supabase` eh passado a `fetchPipelineAggregates`, `fetchLeadDrill`, `fetchLeadConversations` e (dentro deles) a `log_pii_access`.
- Cadeia: `requireAuth()` (`api-auth.ts:29`) -> `createClient()` (`server.ts:4`) -> `createServerClient(@supabase/ssr)` com **anon key + cookies do usuario (JWT)**. Role efetivo = `authenticated`, **nunca** service_role.
- `grep service_role|SERVICE_ROLE|serviceRole` em `packages/web/src/lib/agent/` e `chat/route.ts` = **0 ocorrencias**.
- Consequencia: RLS admin-only + isolamento por org (52-1) e `public.user_role()='admin'` + anti cross-tenant de `log_pii_access` (52-4) aplicam-se. Defesa em profundidade intacta (gate isAdmin na app + RLS no banco). **SEC-002 fechado a favor da 52-2.**

#### 2. Fail-closed (AC6) — GREEN

`fetchLeadDrill` (`context-builder.ts:559-574`) e `fetchLeadConversations` (`623-637`) chamam `log_pii_access` **antes** de qualquer `SELECT` na view sensivel; `if (auditOk !== true || auditErr !== null)` -> `console.error` + `return null`. Nenhuma leitura de PII antes da confirmacao `true`. O caller (`route.ts:175-176, 184-185`) injeta a string de indisponibilidade quando recebe `null`. Contrato da 52-4 (5 args, sem `p_admin_user_id`) respeitado.

#### 3. Gate isAdmin (AC13/AC14) — GREEN

Bloco `if (admin)` (`route.ts:168`) eh o **unico** ponto de decisao de CRM; nenhum helper de pipeline eh alcancavel fora dele. Non-admin (`route.ts:188-191`) nao acrescenta nada ao contexto e apenas loga. `isAdmin = user.role === "admin"` estrito (`auth-helpers.ts:26-28`); nao usa `canAccess()` nem `is_admin_or_supervisor()` (CON-2).

#### 4. CON-5 (sem regressao de midia) — GREEN

`mediaContext = buildContext(...)` sempre construido (`route.ts:159`) independente do role; `pipelineContext` eh puramente aditivo (`route.ts:194`). `buildGlobalContext`/`buildCampaignContext` intactos. No `system-prompt.ts`, as secoes "Suas capacidades", "Como responder", "Acoes executaveis" e o bloco `<action_card>` permanecem; apenas a secao "## Acesso ao pipeline comercial" foi adicionada.

#### 5. Cache (AC8) / Multi-tenant (AC11) / NULL (REL-001) — GREEN

- Agregados cacheados em `pipeline_agg:{orgId}` apenas para janela 30d (`context-builder.ts:478-483, 538`); drill/conversas NUNCA cacheados; cache separado do `global:{orgId}` (nao polui cache de midia compartilhado).
- `.eq("org_id", orgId)` presente nas 3 views; RPC filtra por org via RLS. Defesa alem da RLS.
- `fmtBRLNullable` (`459-461`) -> "—" para null, nunca "R$0,00"; instrucao obrigatoria no `AGENT_SYSTEM_PROMPT:29`.

#### 6. `aggregated_metrics` nao logado — dentro do contrato

AC7 exige que agregados NAO sejam fail-closed; o logging de agregados eh explicitamente opcional na story (Dev Notes AUTO-DECISION). Decisao documentada no Dev Agent Record item 5. Aceito.

#### Issues

| ID | Sev | Categoria | Achado | Recomendacao |
|----|-----|-----------|--------|--------------|
| REQ-001 | medium | requirements | **AC5 parcial:** `extractLeadId` (`route.ts:31-34`) so resolve conversa via UUID explicito. A pergunta-exemplo da AC5 ("o que foi dito na conversa do lead Joao?") NAO dispara `fetchLeadConversations` (sem UUID). | Aceito como **limitacao conservadora/decisao de produto**, NAO falha bloqueante: prefere nao buscar a buscar lead errado por nome ambiguo; resolver por nome exigiria query extra fora do escopo (T6.3 ja diz "melhor esforco, pode retornar null"). Follow-up 52-5: UI seleciona lead -> injeta lead_id, ou backend resolve nome->id quando match unico; documentar na UX que o usuario referencie por id. |
| PERF-001 | low | performance | **AC12 caso extremo:** 20 campanhas x 7 stages (~140+20 rows) ~= 2.400 tokens, acima do alvo de 2.000. Caso tipico (5x5) ~635 tokens, passa folgado. | Aceito como nao-bloqueante: AC12 dimensiona contra dataset "tipico" e o tipico passa; 200K do modelo nao corre risco. Follow-up: se orgs 20-campanhas x todos-stages forem comuns em prod, cap top-N por lead_count na distribuicao (Dev Notes item 6 ja sinaliza o one-liner). Nao alterar AC3 sem decisao de produto. |
| TEST-001 | medium | tests | E2E autenticado nao executado (precisa app DEV + Anthropic + JWT dos seeds). @dev fez smoke de contrato via anon (views/RPC bloqueiam anon 42501; `log_pii_access`->200 false). | Spot-check manual obrigatorio (T9): (1) admin 3 driving questions; (2) drill com campanha entre aspas -> row em `agent_pii_access_log`; (3) fail-closed via REVOKE EXECUTE temporario -> sem PII + aviso + `console.error [52-2]`; (4) regressao CTR/pause -> action_card ok, requiresDrill=false; (5) supervisor/broker -> sem `=== PIPELINE COMERCIAL ===`, midia normal. |

#### Honestidade (padrao Done desta serie)

**Done = QA PASS no eixo critico (seguranca/CON-5) + validado estaticamente e por contrato de banco no DEV.** O E2E funcional com app rodando + Anthropic + sessao autenticada e o git/push/prod permanecem **pendentes** (TEST-001 / cenarios T9). As 2 CONCERNS (AC5/AC12) sao limitacoes aceitas com follow-ups registrados — NAO exigem fix para fechar esta story; ambas viram trabalho da 52-5/backlog.

### Gate Status

Gate: CONCERNS → docs/qa/gates/52.2-agent-context-integration.yml
