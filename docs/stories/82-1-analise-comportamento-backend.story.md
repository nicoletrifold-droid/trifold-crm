# Story 82-1 — Backend: cronologia única do lead + análise de comportamento (Sonnet) + persistência

## Metadata
- **Status:** Approved
- **Epic:** 82 — Análise de Comportamento IA do lead
- **Branch:** feat/82-1-analise-comportamento-backend
- **Tipo:** Feature (backend + migration + flow LLM)
- **Complexidade:** Média-alta
- **Prioridade:** P1

## Story
**As a** gestor ou corretor, **I want** um endpoint que junte TODA a história do lead
(conversas, observação, notas, etapas, tarefas, visitas e feedbacks) em uma cronologia única
e peça a um modelo de IA uma análise comportamental estruturada, **so that** eu saiba o
estágio real do cliente e como abordá-lo — sem eu mesmo ter que garimpar 6 telas.

## Contexto
O Resumo IA atual (`api/leads/[id]/summary/route.ts`) lê só `messages` +
`conversation_state.collected_data` e gera texto corrido com Haiku. Esta story cria o motor
da análise nova SEM tocar na UI (82-2). O diferencial é a **cronologia com timestamps**:
comportamento é tempo (demora de resposta, sumiço de N dias, remarcações), não só conteúdo.
Decisões do épico: on-demand, Sonnet, JSON estruturado persistido, IA nunca move etapa.

## Escopo
**IN:**
- Migration: `leads.behavior_analysis` (jsonb, null) + `leads.behavior_analyzed_at`
  (timestamptz, null). Conferir a numeração livre antes de criar (última conhecida: 180).
- Flow novo `packages/ai/src/flows/behavior-analysis.ts`:
  - `analyzeLeadBehavior(anthropic, { chronology, leadProfile, currentStage })`.
  - Modelo **`claude-sonnet-5`** (constante exportada), `max_tokens` adequado à saída JSON,
    timeout defensivo (padrão do haiku-enrichment).
  - Prompt em pt-BR: recebe a cronologia datada + perfil/etapa atual; devolve JSON com o
    contrato do épico (`estagio_real`, `temperatura`, `sinais[]`, `objecoes[]`,
    `como_abordar`, `proxima_acao`, `dados_faltando[]`, `resumo`). Instruções explícitas:
    raciocinar sobre cadência/intervalos; NÃO inventar profundidade quando a base é rasa
    (preencher `dados_faltando`); a sugestão de estágio é opinião, nunca comando.
  - Parse robusto (JSON inválido → erro tratado, nunca persiste lixo).
- Agregador de cronologia (lib compartilhada, ex. `packages/web/src/lib/leads/behavior-chronology.ts`):
  monta lista ordenada por timestamp com eventos tipados de:
  - `messages` (role + content + created_at, todas as conversations do lead; áudio já vem transcrito no content),
  - `leads.observacao` + campos de perfil/qualificação (bloco estático, não-cronológico),
  - `activities` (broker_note, mudanças de etapa do trigger, supremo_contact, lead_lost, ai_resumed…),
  - `follow_up_log`,
  - `tasks` do lead (pendentes/atrasadas/futuras — rotas `/api/leads/[id]/tasks` mostram o shape),
  - `appointments` (status, remarcações, no-show) + `visit_feedback` quando existir.
  - Truncamento com critério se a cronologia estourar um teto (manter mais recentes + marcos:
    criação, mudanças de etapa, visitas).
- Rota `POST /api/leads/[id]/behavior-analysis`:
  - Nesta story: `requireRole` admin/supervisor (mesmo gate do /summary atual; ampliação é a 82-3).
  - Monta cronologia → chama flow → persiste `behavior_analysis` + `behavior_analyzed_at` → devolve o JSON.
  - **Nenhuma outra escrita no lead** (guard explícito: não toca stage_id, score, temperatura oficial).
- Bônus de higiene: extrair a string de modelo da rota `/summary` (hoje `claude-haiku-4-20250414`,
  divergente do cron que usa `claude-haiku-4-5-20251001`) para a constante única do packages/ai.

**OUT:**
- UI (82-2), acesso corretor/gerente (82-3), cron/automação, mover etapa, reprocessar visit_feedback.

## Acceptance Criteria
1. **Given** lead com conversa + notas + visita, **when** POST `/api/leads/[id]/behavior-analysis`
   (admin), **then** responde 200 com JSON no contrato do épico e persiste
   `behavior_analysis`/`behavior_analyzed_at`; segundo POST regenera e sobrescreve.
2. **Given** a cronologia montada, **then** ela contém eventos das 7 fontes quando existirem,
   ordenados por timestamp, cada um com data legível — verificável por teste unitário do agregador.
3. **Given** lead raso (ex.: só uma observação de ligação não atendida), **when** analisado,
   **then** a resposta tem `dados_faltando` preenchido e NÃO inventa sinais/objeções sem lastro.
4. **Given** qualquer análise, **then** `leads.stage_id`, `qualification_score` e demais campos
   do lead permanecem intocados (só as 2 colunas novas mudam).
5. **Given** resposta do modelo com JSON inválido ou timeout, **then** a rota devolve erro
   tratado (5xx com mensagem) e NADA é persistido.
6. Testes verdes (vitest incluindo o flow com mock, no padrão de `haiku-enrichment.test.ts`),
   type-check e lint OK. Rota `/summary` passa a usar a constante de modelo unificada.

## Dev Notes
- Padrão de client/flow: `packages/ai/src/client/anthropic.ts` + `packages/ai/src/flows/haiku-enrichment.ts`.
- Admin client no route handler (padrão do cron enrich-leads) para ler activities/appointments sem fricção de RLS — o gate de acesso é o requireRole da rota.
- Tipos de activity relevantes e onde nascem: `broker_note` (`api/leads/[id]/notes`), stage change (trigger mig 124/125), `supremo_contact` (sync-history), `lead_lost`, `ai_resumed`.
- Convenção: NUNCA inserir org_id em `messages` (não tem a coluna) — leitura apenas, mas atenção ao montar joins.
- Numeração de migration: conferir `supabase/migrations/` E o schema remoto de prod antes de aplicar (lição do 75-188: "LIVE" no dev ≠ prod).

## File List
- `docs/stories/82-1-analise-comportamento-backend.story.md` (this file)
- `supabase/migrations/182_leads_behavior_analysis.sql` (novo)
- `packages/ai/src/flows/behavior-analysis.ts` (novo) + `behavior-analysis.test.ts` (novo)
- `packages/ai/src/flows/index.ts` (exports)
- `packages/ai/src/client/anthropic.ts` (ANTHROPIC_MODELS: haiku + sonnet)
- `packages/ai/src/flows/haiku-enrichment.ts` (usa ANTHROPIC_MODELS.haiku)
- `packages/web/src/lib/leads/behavior-chronology.ts` (novo) + `behavior-chronology.test.ts` (novo)
- `packages/web/src/app/api/leads/[id]/behavior-analysis/route.ts` (novo)
- `packages/web/src/app/api/leads/[id]/summary/route.ts` (constante de modelo unificada)

## Dev Agent Record (@dev Dex — 2026-07-21)
- Implementado conforme escopo. Notas de implementação:
  - Tabela de tarefas real é **`lead_tasks`** (não `tasks`) — shape confirmado na mig 053.
  - Cronologia usa o client do usuário (RLS por org), não admin — todas as 7 fontes têm
    policy org-scoped; o gate de role fica na rota (decisão registrada, diverge do Dev Note
    original com justificativa: menos superfície de service-role).
  - Parte pura (`buildChronologyEvents`/`truncateChronology`) separada do fetch para testes;
    truncamento em 400 eventos preserva marcos (etapa/agendamento/feedback) e loga o corte
    (condição @po b).
  - Persistência inclui `_meta` (modelo, versão, contagem de eventos, last_event_at) — o
    `last_event_at` alimenta o staleness da 82-2 sem query extra.
  - Condição @po (a): migration 182 numerada contra o local; conferência contra o schema
    remoto de prod fica registrada para o @devops antes de aplicar.
- Checks: vitest 1103/1103 verdes (10 novos), `tsc --noEmit` limpo (ai + web), eslint limpo
  nos arquivos tocados (12 erros pré-existentes na main, fora do escopo — confirmado via stash).
- Branch: feat/82-1-analise-comportamento-backend

## PO Validation (@po Pax — 2026-07-21)
**GO (9/10).** Título/descrição/ACs testáveis/escopo IN-OUT/dependências/valor/DoD OK; alinhada ao Epic 82.
Condições registradas (não bloqueiam): (a) conferir numeração de migration contra o schema REMOTO de prod
antes de aplicar (lição 75-188); (b) truncamento da cronologia deve logar quando cortar (sem silêncio).
Status: Draft → Approved.

## Change Log
- 2026-07-21 @sm (River): story criada a partir do Epic 82 (decisões do Marcos de 2026-07-21). Status: Draft.
- 2026-07-21 @po (Pax): validação GO 9/10, condições (a)(b) acima. Status: Approved.
