---
epic: 52
title: Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM
status: Draft
created_at: 2026-06-15
updated_at: 2026-06-15
created_by: Morgan (@pm)
updated_by: Pax (@po)
priority: High
sub_epics:
  - 52A: Camada de Leitura Read-Only do Pipeline (views + RLS admin)
  - 52B: Injeção de Contexto no Agente (context-builder + system-prompt)
  - 52C: Guard Admin-Only (UI + API) + Read-Only Enforcement
  - 52D: Auditoria de Acesso a PII
  - 52E: UX da Resposta Integrada
  - 52F: Contexto de Performance por Criativo (extensão aditiva — admin+supervisor+gerente-comercial)
stories_planned: [52-1, 52-2, 52-3, 52-4, 52-5]
stories_added: [52-6]
stories_done: [52-6]
---

# Epic 52 — Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM

## Objetivo do Epic

Dar ao **agente gestor de tráfego pago** já existente (persona "gestor sênior de tráfego pago Meta Ads", em `packages/web/src/lib/agent/`) acesso de **LEITURA** aos dados do pipeline comercial do CRM, para que ele forneça **respostas integradas** que cruzam tráfego pago (Meta Ads) com o funil de vendas — algo impossível hoje, porque o agente só enxerga métricas de mídia (`meta_campaigns`, `meta_insights_daily`, `meta_alerts`) e uma fatia rasa de `leads`.

**Driving questions (origem da demanda):**
- "Qual campanha traz os leads que mais fecham?"
- "Qual o CPL real considerando quem chegou a visitar / fechar?"
- "Onde os leads de cada campanha travam no funil?"

Hoje o agente sabe quanto custou um lead, mas não sabe o que aconteceu com ele depois. Este epic conecta os dois mundos — mídia paga e funil comercial — preservando privacidade, com acesso restrito a admin e enforcement real de read-only.

## Problema

O agente foi construído como um analista de mídia paga isolado:

- `context-builder.ts` (`buildGlobalContext`) carrega `meta_campaigns`, `meta_insights_daily`, `meta_alerts` e apenas uma fatia de `leads` — sem cruzamento com `kanban_stages`, sem conversão por etapa, sem conteúdo de conversa.
- `AGENT_SYSTEM_PROMPT` (`system-prompt.ts`) descreve o agente exclusivamente como "gestor sênior de tráfego pago Meta Ads" e só conhece ações de mídia (`pause_campaign`, `resume_campaign`, `set_daily_budget`).
- Como consequência, perguntas que cruzam mídia × funil (CPL→fechamento, gargalos por campanha) não têm como ser respondidas: o dado não chega ao contexto do modelo.

Adicionar esse dado é sensível: o pipeline contém **PII** (nome, telefone, e-mail dos leads) e **conteúdo de conversas** (tabelas `conversations`/`messages`, a IA "Nicole"). Expor isso a um agente de IA exige tratar privacidade, controle de acesso e auditoria como preocupações centrais, não como detalhes de implementação.

## Decisões de Produto (Travadas — não reabrir)

> Estas decisões foram tomadas pelo stakeholder (lucas@) e são premissas de entrada do epic. Stories não devem reabri-las.

1. **ACESSO ADMIN-ONLY.** A feature é disponível **somente** para usuários com `role = 'admin'`. `supervisor`, `obras` e `gerente-comercial` **não** têm acesso nesta entrega.
2. **READ-ONLY ABSOLUTO.** O agente só pode **LER/visualizar** dados do pipeline. **Nunca** pode criar, alterar, mover ou deletar leads, stages, conversas ou qualquer entidade do CRM. Restrição de segurança inegociável com **enforcement real** (não apenas instrução no prompt).
3. **PROFUNDIDADE DE DADOS = TUDO do pipeline.** Métricas agregadas (contagem por stage, conversão por etapa, CPL→fechamento por campanha/UTM), drill em leads individuais (nome, score, stage, origem/UTM) **e** conteúdo de conversas (`conversations`/`messages`, IA Nicole). Isto inclui **PII** — o epic trata privacidade, RLS e auditoria como preocupação central.

## Contexto do Sistema Existente

- **Stack:** Next.js 15 (App Router) — ler `node_modules/next/dist/docs/` antes de codar — Supabase (PostgreSQL + RLS), TypeScript, Vercel.
- **Stack de IA:** Anthropic Claude apenas (`claude-sonnet-4-6` para chat, `claude-haiku-4-5` para tarefas leves). **Não há OpenAI** no projeto.
- **Multi-tenant:** todas as tabelas de domínio têm `org_id`; RLS aplica isolamento por organização.
- **`role`** vive em `app_metadata.role` (JWT) **e** na tabela `users.role`.

### Mapa Técnico Real (âncoras factuais — confirmadas no repo)

| Componente | Caminho | Estado atual |
|---|---|---|
| Persona / system prompt | `packages/web/src/lib/agent/system-prompt.ts` (`AGENT_SYSTEM_PROMPT`) | Meta Ads only; ações `pause/resume/set_daily_budget` |
| Builder de contexto | `packages/web/src/lib/agent/context-builder.ts` (`buildGlobalContext`) | Carrega `meta_campaigns`, `meta_insights_daily`, `meta_alerts`, fatia de `leads`; cache in-memory 5min |
| Endpoint de chat | `packages/web/src/app/api/agent/chat/route.ts` | POST streaming Anthropic `claude-sonnet-4-6`; rate limit 20 msg/min; extrai `<action_card>` → `agent_chat_messages.action_status` (pending/confirmed/cancelled/executed) |
| Sessões | `packages/web/src/app/api/agent/chat/sessions/` | — |
| Confirmação/cancelamento de ação | `/api/agent/action/confirm`, `/api/agent/action/cancel` | Executam ações de mídia (write no Meta) |
| Painel UI | `packages/web/src/components/agent/agent-chat-panel.tsx` | Reutilizável |
| Instâncias UI | `dashboard/campaigns/meta/campaigns-meta-client.tsx`, `[campaign_id]/campaign-detail-client.tsx` | — |
| Tabelas do agente | `agent_chat_sessions`, `agent_chat_messages` | `supabase/migrations/078_agent_chat.sql` |
| Pipeline CRM | `leads`, `kanban_stages`, `conversations`, `conversation_state`, `messages` | `supabase/migrations/001_base_schema.sql`; RLS em `004_rls_policies.sql` |
| Pipeline IA Nicole | `packages/ai/src/chat/pipeline.ts` | Qualificação de leads |
| Permissões frontend | `packages/web/src/lib/permissions.ts` (`SYSTEM_ROLES`, `getHardcodedPermissions`) | — |
| Função de acesso ampla | `is_admin_or_supervisor()` em `supabase/migrations/084_...sql` | `role IN (admin, supervisor, obras, gerente-comercial)` — **ampla demais; NÃO usar nesta feature** |

### Pipeline CRM — Esquema relevante (factual)

- **`leads`** — `org_id`, `name`, `phone`, `email` (PII), `qualification_score`, `stage_id`, `source` (enum `lead_source`), `utm_*`, `ai_summary`.
- **`kanban_stages`** — `type` (enum: `novo`/`qualificado`/`agendado`/`visitou`/`proposta`/`fechado`/`perdido`), `position`.
- **`conversations`** — `lead_id`, `channel`, `is_ai_active`.
- **`conversation_state`** — `collected_data` (jsonb), `qualification_step`.
- **`messages`** — `role` (`user`/`assistant`/`broker`), `content` (PII / conteúdo sensível).

> **Próxima migration livre: `096`** (a maior atual é `095_knowledge_base_null_empreendimento_global.sql`). Confirmar numeração no momento da criação da story de schema — há histórico de conflito em torno de 074/075.

## Escopo

### IN (entra neste epic)
- Camada de leitura **read-only** do pipeline para consumo do agente (provavelmente SQL views agregadas + acesso a drill de lead + conversas), com RLS que exige `role = 'admin'`.
- Injeção desse contexto integrado no `context-builder.ts` e atualização do `AGENT_SYSTEM_PROMPT` para refletir as novas capacidades (mídia × funil).
- Guard **admin-only** estrito na UI (painel do agente) e na API (`/api/agent/chat` e correlatos).
- **Enforcement real de read-only:** o agente não pode emitir nenhuma ação de escrita sobre o pipeline; a superfície de ação atual (`<action_card>` / `/api/agent/action/*`) deve ser confinada às ações de mídia já existentes e **proibida** de tocar entidades do CRM.
- **Auditoria** de acesso a PII / conteúdo de conversa (log de quem perguntou, quando, e que dados sensíveis foram lidos/expostos).
- **UX** da resposta integrada (tabelas CPL→fechamento, funil por campanha, drill).

### OUT (não entra)
- Acesso para roles além de `admin` (supervisor/obras/gerente-comercial) — explicitamente fora.
- Qualquer ação de **escrita** sobre o pipeline pelo agente (criar/editar/mover/deletar lead, stage, conversa).
- Novas ações executáveis de CRM via `<action_card>`.
- Substituir ou alterar a IA Nicole (`packages/ai`) — aqui apenas **lemos** o que ela produziu.
- Troca de provedor de IA (continua Anthropic Claude).
- Migração das ações de mídia existentes — `pause/resume/set_daily_budget` permanecem como estão.

## Requisitos Funcionais (FR)

- **FR-1** — O agente DEVE conseguir responder, com base em dados reais, "qual campanha traz os leads que mais fecham?", apresentando conversão por campanha/UTM até o stage `fechado`.
- **FR-2** — O agente DEVE conseguir calcular e responder o **CPL real ponderado pelo funil** (ex.: custo por lead que chegou a `visitou` ou `fechado`), cruzando `meta_insights_daily.spend` com a posição dos leads no funil por campanha/UTM.
- **FR-3** — O agente DEVE conseguir responder "onde os leads de cada campanha travam no funil?", apresentando distribuição de leads por `kanban_stages.type` segmentada por campanha/UTM.
- **FR-4** — O agente DEVE conseguir fazer **drill em lead individual** (nome, `qualification_score`, stage atual, `source`/UTM, `ai_summary`).
- **FR-5** — O agente DEVE conseguir acessar **conteúdo de conversas** (`conversations`/`messages`, incluindo mensagens da IA Nicole) quando relevante para a análise.
- **FR-6** — O `AGENT_SYSTEM_PROMPT` DEVE descrever as novas capacidades de cruzamento mídia × funil e instruir o modelo sobre os limites read-only e de privacidade.
- **FR-7** — O painel do agente (`agent-chat-panel.tsx` e suas instâncias) DEVE ficar **visível/acessível apenas para `role = 'admin'`**; para os demais roles, a feature integrada não aparece.
- **FR-8** — Cada acesso do agente a dados de pipeline contendo PII ou conteúdo de conversa DEVE gerar um **registro de auditoria** (org, usuário admin, timestamp, tipo de dado, escopo da consulta).
- **FR-9** — A UI DEVE apresentar respostas integradas de forma legível: tabelas para comparações (3+ itens, padrão já adotado no system prompt) e visualização clara de funil/CPL→fechamento.

## Requisitos Não-Funcionais (NFR) — ênfase em SEGURANÇA

- **NFR-SEC-1 (Admin-only enforcement — defesa em profundidade).** O acesso DEVE ser bloqueado em **três camadas independentes**: (a) RLS no banco exigindo `role = 'admin'`; (b) guard na API antes de montar o contexto/chamar o modelo; (c) guard de visibilidade na UI. Burlar uma camada não pode conceder acesso. **NÃO** usar `is_admin_or_supervisor()` (ampla demais) — criar verificação **estrita** `role = 'admin'`.
- **NFR-SEC-2 (Read-only enforcement real).** A camada de leitura DEVE ser tecnicamente incapaz de escrever no pipeline (ex.: views/roles/grants somente-leitura, sem políticas RLS de INSERT/UPDATE/DELETE para o caminho do agente). O enforcement NÃO pode depender apenas de instrução no prompt. As ações `<action_card>` / `/api/agent/action/*` DEVEM permanecer restritas às ações de mídia e rejeitar qualquer `type` que toque entidades do CRM.
- **NFR-SEC-3 (Privacidade / PII).** PII (`leads.name/phone/email`) e conteúdo de `messages` só trafegam para usuários `admin`. Avaliar minimização: agregados por padrão; PII/conversa apenas em drill explícito. Documentar a base de tratamento de dados sensíveis.
- **NFR-SEC-4 (Auditoria imutável).** Logs de acesso a PII/conversa DEVEM ser append-only (sem UPDATE/DELETE pelo caminho da aplicação) e isolados por `org_id` via RLS.
- **NFR-SEC-5 (Isolamento multi-tenant).** Todo acesso DEVE respeitar `org_id`; um admin de uma org nunca enxerga pipeline de outra.
- **NFR-PERF-1.** As consultas de cruzamento (agregação funil × mídia) DEVEM ser aceitáveis para uso interativo no chat; reusar/estender o cache in-memory de 5min do `context-builder` onde fizer sentido, sem servir dados sensíveis stale de forma inconsistente entre usuários/orgs.
- **NFR-MAINT-1.** Espelhar os padrões existentes do agente (estrutura de `buildGlobalContext`, formatação `fmtBRL`/`fmtPct`, isolamento por `org_id`) para minimizar drift arquitetural.
- **NFR-OBS-1.** Falhas no acesso de leitura ou na auditoria DEVEM degradar com segurança: na dúvida, **negar** o acesso e não vazar dado parcial.

## Restrições (CON)

- **CON-1** — Provedor de IA: **somente Anthropic Claude** (`claude-sonnet-4-6` / `claude-haiku-4-5`). Sem OpenAI.
- **CON-2** — Não usar `is_admin_or_supervisor()`; exigir verificação estrita `role = 'admin'`.
- **CON-3** — Read-only absoluto sobre o pipeline; nenhuma escrita, em nenhuma camada, pelo caminho do agente.
- **CON-4** — Não alterar a IA Nicole nem o esquema base do pipeline de forma incompatível; apenas leitura aditiva (views/grants/auditoria).
- **CON-5** — Backward compatible: as ações de mídia e o comportamento atual do agente para fluxos existentes não podem regredir.
- **CON-6** — Confirmar numeração de migration (próxima livre: `096`) antes de criar — histórico de conflito 074/075.
- **CON-7** — Multi-tenant: todo acesso filtrado por `org_id`.

## Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Vazamento de PII para role não-admin (bug em uma das camadas) | **Alta** | Defesa em profundidade (NFR-SEC-1): RLS + guard de API + guard de UI; teste de regressão por role |
| Read-only burlado (agente induzido a escrever via prompt injection) | **Alta** | Enforcement técnico (NFR-SEC-2): camada de leitura sem permissão de escrita; whitelist de `action_card` só para mídia |
| Exposição excessiva de conversas/PII no contexto do modelo | **Média** | Minimização (NFR-SEC-3): agregados por padrão, PII/conversa só em drill; auditoria de cada acesso |
| Custo/latência de tokens ao injetar pipeline grande no contexto | **Média** | Agregar no banco (views), não despejar linhas cruas; cache 5min; limitar drill |
| Cross-tenant leak em views/joins novos | **Média** | RLS por `org_id` em toda nova view; teste multi-tenant |
| Auditoria silenciosamente falha e acesso continua | **Média** | NFR-OBS-1: fail-closed — sem auditoria registrável, negar acesso sensível |
| Drift arquitetural vs. padrão atual do agente | **Baixa** | NFR-MAINT-1: espelhar `context-builder` e helpers existentes |
| Confusão de numeração de migration (074/075) | **Baixa** | CON-6: confirmar antes de criar |

## Dependências Técnicas

- **Schema base do pipeline** (`001_base_schema.sql`) e **RLS** (`004_rls_policies.sql`) — fonte das tabelas a serem lidas.
- **Tabelas e fluxo do agente** (`078_agent_chat.sql`; `chat/route.ts`; `context-builder.ts`; `system-prompt.ts`).
- **Permissões** (`permissions.ts`, `SYSTEM_ROLES`) e modelo de `role` (`app_metadata.role` + `users.role`).
- **IA Nicole** (`packages/ai/src/chat/pipeline.ts`) — somente como fonte de leitura (mensagens `assistant`).
- **Anthropic Claude** — provedor de IA já integrado no `chat/route.ts`.

## Proposta de Quebra em Stories

> Quebra em **camadas**, conforme orientação de produto. As stories abaixo são **candidatas** — o detalhamento (AC, tasks, frontmatter de executor/quality gate) é trabalho do **@sm** (`*draft`) e validação do **@po**. A coluna "Executor sugerido" é uma predição de planejamento, não uma atribuição final.

| Ordem | ID | Sub-epic | Título | Objetivo (1 linha) | Executor sugerido | Depende de |
|---|---|---|---|---|---|---|
| 1 | **52-1** | 52A | Camada de Leitura Read-Only do Pipeline | Criar views agregadas (funil por campanha/UTM, CPL→fechamento, distribuição por stage) + acesso a drill de lead e conversas, com RLS estrita `role = 'admin'` e grants somente-leitura. | @data-engineer | — |
| 2 | **52-4** | 52D | Auditoria de Acesso a PII | Tabela append-only de auditoria + RLS por `org_id`; registrar org/usuário/timestamp/tipo de dado/escopo a cada leitura sensível; fail-closed. | @data-engineer | 52-1 |
| 3 | **52-3** | 52C | Guard Admin-Only + Read-Only Enforcement | Verificação estrita `role = 'admin'` na API (`/api/agent/chat` e correlatos) e guard de visibilidade na UI; whitelist de `action_card` confinada a ações de mídia (rejeitar qualquer escrita de CRM). | @dev | 52-1 |
| 4 | **52-2** | 52B | Injeção de Contexto Integrado no Agente | Estender `context-builder.ts` para incluir os dados read-only (agregados + drill on-demand) e atualizar `AGENT_SYSTEM_PROMPT` com as capacidades mídia × funil e limites read-only/privacidade. | @dev | 52-1, 52-3, 52-4 |
| 5 | **52-5** | 52E | UX da Resposta Integrada | Renderização legível das respostas integradas no painel (tabelas CPL→fechamento, funil por campanha, drill de lead) seguindo o padrão visual existente do agente. | @ux-design-expert | 52-2 |

### Notas de Sequenciamento (para o @sm)

- **52-1 é fundacional** — sem a camada de leitura e a RLS admin, nenhuma outra story tem dado seguro para consumir.
- **52-4 (auditoria) e 52-3 (guards) antes de 52-2 (injeção):** os controles de segurança e o trilho de auditoria devem existir **antes** de o dado sensível efetivamente chegar ao contexto do modelo. Isto é deliberado — a injeção de PII no prompt sem guard + auditoria seria uma exposição.
- **52-2 depende dos três anteriores** porque é o ponto em que PII/conversa de fato fluem para o modelo.
- **52-5 (UX) por último**, sobre respostas já integradas.
- Sub-epics 52A→52E podem ser desenvolvidos em ondas, respeitando as dependências acima.

## Definition of Done

- [ ] Stories 52-1, 52-2, 52-3, 52-4, 52-5 com status Done.
- [ ] Apenas `role = 'admin'` consegue acessar a feature integrada — verificado nas três camadas (RLS, API, UI) com teste de regressão por role (NFR-SEC-1).
- [ ] Nenhuma escrita sobre o pipeline é possível pelo caminho do agente — verificado por teste (NFR-SEC-2).
- [ ] As driving questions são respondidas com dados reais: "qual campanha traz os leads que mais fecham?", "CPL real considerando visita/fechamento", "onde os leads travam no funil?".
- [ ] Drill em lead individual e acesso a conteúdo de conversa funcionam apenas para admin (FR-4, FR-5).
- [ ] Toda leitura de PII/conversa gera registro de auditoria append-only isolado por `org_id` (FR-8, NFR-SEC-4); acesso falha-fechado se a auditoria não puder registrar (NFR-OBS-1).
- [ ] `AGENT_SYSTEM_PROMPT` reflete as novas capacidades e os limites read-only/privacidade (FR-6).
- [ ] Respostas integradas renderizadas de forma legível no painel (FR-9).
- [ ] Sem regressão nas ações de mídia existentes e no comportamento atual do agente (CON-5).
- [ ] QA gate PASS em todas as stories técnicas; @devops fez push após cada QA gate.

## Stories Aditivas (pós-planejamento original)

> Stories adicionadas após o draft inicial do epic, fora da lista `stories_planned` original. São extensões aditivas que reusam o padrão técnico do epic sem reabrir as Decisões de Produto travadas.

| ID | Sub-epic | Título | Status | Notas |
|---|---|---|---|---|
| **52-6** | 52F | Contexto de Performance por Criativo no Agente | ✅ Done | **Extensão aditiva, não estava no plano original.** Adiciona análise por criativo (CTR/CPL/rankings por anúncio) ao agente via função SQL `creative_performance(p_days)` + `requiresCreative`/`fetchCreativePerformance` em `context-builder.ts`. **Diferença-chave vs. Decisão de Produto 1 (admin-only):** dados de criativo são **agregados anônimos** (sem PII) — por isso acesso ampliado `is_admin_or_supervisor()` (admin+supervisor+gerente-comercial), distinto do admin-only do pipeline CRM (52-1/52-2). O bloco `if (admin)` de pipeline CRM permanece intocado (AC7 / CON-5). Sem `log_pii_access` (sem PII). |
| **52-7** | 52G | Seleção de Período Específico no Agente | ✅ Done | **Extensão aditiva, não estava no plano original.** Adiciona suporte a períodos **relativos** em linguagem natural ("últimos 7 dias", "na última semana") via `extractPeriodDays(msg): number` em `context-builder.ts`. A API `chat/route.ts` prioriza o valor extraído sobre o default de 30 dias. Sem migration SQL (TypeScript puro). QA gate PASS. Migration não aplicável. |
| **52-8** | 52H | Seleção de Intervalo de Datas Específico no Agente | ✅ Done | **Extensão aditiva, complementa 52-7.** Adiciona suporte a intervalos de datas **absolutos** ("de 1 a 15 de junho", "entre 01/06 e 15/06") via `extractDateWindow(msg): DateWindow` em `context-builder.ts`; 5 regex patterns com conector PT-BR `(?:at[eé]?|[ae])`. UI: chips de período + date picker customizado em `agent-chat-panel.tsx`. Migration `104_agent_daterange_rpcs.sql` — overloads `(p_start_date DATE, p_end_date DATE)` para `pipeline_funnel_by_campaign` e `creative_performance` via PostgreSQL overloading; aplicada em produção `dsopqkqjkmhytudaaolv`. QA gate PASS with CONCERNS (2 gaps não-bloqueantes: cap 90d silencioso e cache inconsistência — aceitos pelo stakeholder). Push: commit `aef44db`. |

## Change Log do Epic

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-15 | 0.1 | Epic criado: agente de tráfego com acesso read-only ao pipeline. Stories planejadas 52-1 a 52-5; decisões de produto travadas (admin-only, read-only absoluto, profundidade = todo o pipeline). | Morgan (@pm) |
| 2026-06-17 | 0.2 | **Story 52-6 adicionada e encerrada (Done) — extensão aditiva.** Capacidade de análise por criativo no agente (não constava do plano original 52-1..52-5). Acesso ampliado `is_admin_or_supervisor()` justificado por dados agregados anônimos (sem PII), distinto do admin-only do pipeline CRM. Migration `100_creative_performance_fn.sql` aplicada em **produção** `dsopqkqjkmhytudaaolv` (commit `aba06bc`). QA gate CONCERNS (`docs/qa/gates/52.6-creative-performance.yml`) **aceito pelo stakeholder** lucas@trifold.eng.br — único gap = E2E com app não executado (TEST-001 medium); validação de runtime feita a nível de banco (admin/supervisor veem dados, não-autorizado 0 linhas). Mesmo padrão de aceitação da 52-2. Stories planejadas originais (52-1..52-5) permanecem em andamento — epic **não** está completo. | Pax (@po) |
| 2026-06-22 | 0.3 | **Stories 52-7 e 52-8 adicionadas e encerradas (Done) — extensões aditivas de usabilidade do agente.** 52-7: seleção de período relativo em NL (`extractPeriodDays`) — TypeScript puro, sem migration, QA PASS. 52-8: seleção de intervalo de datas absoluto (`extractDateWindow`, UI chips + date picker) + migration `104_agent_daterange_rpcs.sql` com overloads `(DATE, DATE)` aplicada em produção; bugfix crítico no regex de connector PT-BR `(?:at[eé]?|[ae])`; QA PASS with CONCERNS (2 gaps aceitos). Push: `aef44db`. Stories planejadas originais (52-1..52-5) **permanecem em andamento** — epic não está completo. | Pax (@po) |
