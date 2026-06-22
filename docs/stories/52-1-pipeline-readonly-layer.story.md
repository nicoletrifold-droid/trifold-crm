# Story 52-1 — Camada de Leitura Read-Only do Pipeline

## Metadata
- **Epic:** 52 — Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM
- **Story:** 52-1
- **Status:** Done
- **Priority:** P0 — fundação para todas as demais stories do Epic 52
- **Complexity:** L (schema-heavy, segurança crítica, ~8h)
- **Created:** 2026-06-15
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @data-engineer (Dara)
- **Quality Gate:** @dev (Dex)
- **Quality Gate Tools:** `[schema_validation, rls_test, migration_review, cross_tenant_isolation_test]`

---

## User Story

**Como** sistema Trifold CRM,
**Quero** ter uma camada de leitura read-only do pipeline comercial — composta por views SQL agregadas (funil por campanha/UTM, CPL→fechamento, distribuição por stage) mais acesso a drill de lead individual e a conteúdo de conversas — protegida por RLS estrita exigindo `role = 'admin'` e grants somente-leitura,
**Para que** as stories subsequentes (52-2, 52-3, 52-4, 52-5) possam consumir dados do pipeline com garantias técnicas de segurança, isolamento multi-tenant e impossibilidade de escrita pelo caminho do agente.

---

## Context

O Epic 52 conecta o agente de tráfego pago (que hoje só enxerga `meta_campaigns`, `meta_insights_daily` e `meta_alerts`) ao pipeline comercial do CRM, para responder perguntas como "qual campanha traz os leads que mais fecham?" e "onde os leads travam no funil?".

Esta story é **fundacional**: sem a camada de leitura e a RLS admin, nenhuma outra story tem dado seguro para consumir. O acesso ao pipeline envolve PII (`leads.name/phone/email`) e conteúdo de conversas (`messages.content`) — a arquitetura de segurança (RLS estrita, grants read-only, fail-closed) deve ser estabelecida aqui, antes de qualquer injeção de dado no contexto do modelo.

**Padrão de referência para RLS:** `supabase/migrations/004_rls_policies.sql` e `supabase/migrations/015_meta_marketing_api.sql` — usar `public.user_org_id()` para isolamento por `org_id`, mesmo padrão consolidado no projeto.

**NÃO usar `is_admin_or_supervisor()`** (definida em `084_is_admin_or_supervisor_gerente_comercial.sql`) — ela inclui `obras` e `gerente-comercial`, que são roles fora do escopo desta feature (CON-2 do épico).

**Verificação de role admin:** extrair `role` do JWT via `auth.jwt() -> 'app_metadata' ->> 'role'` OU comparar com `users.role` na tabela `public.users` — ambos devem resultar em `'admin'`.

**Próxima migration livre:** `096` (última atual: `095_knowledge_base_null_empreendimento_global.sql`). Confirmar via `ls supabase/migrations/` antes de criar o arquivo — há histórico de conflito de numeração (CON-6 do épico).

---

## Scope

### IN (esta story entrega)
- Migration `096_crm_pipeline_readonly_layer.sql` criando:
  - View agregada `v_pipeline_funnel_by_campaign` (FR-1, FR-2, FR-3)
  - View agregada `v_pipeline_stage_distribution` (FR-3)
  - View de drill de lead individual `v_lead_drill` (FR-4)
  - View de acesso a conversas e mensagens `v_lead_conversations` (FR-5)
- RLS estrita `role = 'admin'` em todas as views (NFR-SEC-1 camada a)
- Grants somente-leitura (`GRANT SELECT`) para o role autenticado (`authenticated`) exclusivamente sobre as views, sem nenhum grant de INSERT/UPDATE/DELETE (NFR-SEC-2)
- Isolamento multi-tenant por `org_id` em todas as views (NFR-SEC-5)
- Definição explícita e documentada do **contrato de dados** (nomes de views, colunas, tipos) que a Story 52-2 vai consumir
- Índices de suporte às queries das views (NFR-PERF-1)

### OUT (não entra nesta story)
- Injeção dos dados no `context-builder.ts` — escopo da Story 52-2
- Guard de API (`/api/agent/chat`) e guard de UI — escopo da Story 52-3
- Tabela de auditoria de acesso a PII — escopo da Story 52-4
- Renderização de respostas integradas na UI — escopo da Story 52-5
- Qualquer escrita sobre o pipeline (leads, stages, conversas, mensagens)
- Alteração das tabelas-base (`leads`, `kanban_stages`, `conversations`, `messages`) — apenas leitura aditiva

---

## Acceptance Criteria

- [~] **AC1 — Migration aplicável:** Migration `096_crm_pipeline_readonly_layer.sql` CRIADA e idempotente por construção (`CREATE OR REPLACE VIEW`, `CREATE INDEX IF NOT EXISTS`). APLICAÇÃO no banco DEV PENDENTE — ambiente do @data-engineer não tem CLI/PAT/psql (ver Dev Agent Record).

- [x] **AC2 — Funil por campanha (FUNÇÃO `pipeline_funnel_by_campaign(p_days)` — MUDANÇA v0.4):** Antes era a view `v_pipeline_funnel_by_campaign`; convertida em **função table-valued** `public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` por decisão do PO (janela de CPL configurável; views não aceitam parâmetro). Retorna, por `(org_id, utm_source, utm_campaign, utm_medium)`, as seguintes colunas:
  - `total_leads` (BIGINT) — total de leads nesse grupo
  - `leads_qualificado` (BIGINT) — leads que alcançaram stage type `qualificado` ou posterior
  - `leads_agendado` (BIGINT) — leads que alcançaram stage type `agendado` ou posterior
  - `leads_visitou` (BIGINT) — leads que alcançaram stage type `visitou` ou posterior
  - `leads_proposta` (BIGINT) — leads que alcançaram stage type `proposta` ou posterior
  - `leads_fechado` (BIGINT) — leads com stage type `fechado`
  - `total_spend` (NUMERIC) — soma de `meta_insights_daily.spend` para campanhas que casem com `utm_campaign` e `org_id` **dentro da janela `date >= current_date - p_days`** (default 30 dias; PERF-001). LEFT JOIN com nome normalizado `lower(trim(...))` (REL-001); NULL se sem dados de mídia correlacionados (NÃO zero)
  - `cpl_real_visitou` (NUMERIC) — `total_spend / NULLIF(leads_visitou, 0)` (CPL ponderado por leads que chegaram a visitou; NULL se sem spend)
  - `cpl_real_fechado` (NUMERIC) — `total_spend / NULLIF(leads_fechado, 0)` (CPL ponderado por leads que fecharam; NULL se sem spend)

- [x] **AC3 — View `v_pipeline_stage_distribution`:** View criada retornando, por `(org_id, utm_source, utm_campaign, stage_type)` onde `stage_type` é `kanban_stages.type`:
  - `lead_count` (BIGINT) — número de leads nesse stage para essa campanha/UTM
  - `pct_of_total` (NUMERIC) — percentual desse stage em relação ao total de leads da campanha/UTM

- [x] **AC4 — View `v_lead_drill`:** View criada retornando uma row por lead com colunas: `id`, `org_id`, `name`, `qualification_score`, `stage_type` (via JOIN com `kanban_stages`), `stage_position`, `source`, `utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `ai_summary`, `created_at`. PII (`phone`, `email`) explicitamente excluída desta view (minimização — NFR-SEC-3).

- [x] **AC5 — View `v_lead_conversations`:** View criada retornando, por `lead_id` e `org_id`:
  - Da tabela `conversations`: `id` (conversation_id), `channel`, `is_ai_active`, `created_at`
  - Da tabela `messages`: `id` (message_id), `role`, `content`, `created_at`
  - Inclui PII/conteúdo sensível — requer RLS `role = 'admin'` (documentado explicitamente nos Dev Notes)

- [x] **AC6 — RLS admin-strict em todas as views:** Implementado via filtro `public.user_role() = 'admin'` embutido no WHERE de cada view (controle determinístico, ver Change Log v0.3). Validação em runtime PENDENTE de aplicação no DEV. Dado que um usuário com `role != 'admin'` (ex.: `supervisor`, `broker`, `obras`) consulta qualquer uma das quatro views: a query retorna 0 rows — não erro, não acesso parcial. A RLS usa verificação estrita de `role = 'admin'` (NÃO `is_admin_or_supervisor()`).

- [x] **AC7 — RLS admin-strict valida org_id:** Implementado via `org_id = public.user_org_id()` no WHERE de cada view + `security_invoker = on`. Validação em runtime PENDENTE de aplicação no DEV. Dado que dois usuários `admin` de orgs diferentes consultam qualquer view: cada um vê apenas dados de sua própria `org_id`. Nenhum cross-tenant leak.

- [x] **AC8 — Grants somente-leitura (enforcement DETERMINISTICO via REVOKE — v0.5):** Apenas leitura para `authenticated`: `GRANT SELECT` nas 3 views + `GRANT EXECUTE` na função `pipeline_funnel_by_campaign(integer)`. **ACHADO DE RUNTIME (v0.5):** o Supabase concede por padrão `GRANT ALL` aos roles `authenticated` E `anon` em objetos do schema public; um simples `GRANT SELECT` NÃO revoga esse baseline amplo. Embora views com JOIN/agregação não sejam atualizáveis (writes falhariam por construção), o NFR-SEC-2 ("tecnicamente incapaz de escrever") exige enforcement determinístico, não "non-updatable por acaso". CORREÇÃO: `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES` das 3 views para `authenticated` + `REVOKE ALL ... FROM anon, PUBLIC`; `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon`. Estado final: `authenticated` só SELECT (views) / EXECUTE (função); `anon`/PUBLIC sem nada. O cenário de teste agora deve verificar que `authenticated` NÃO tem INSERT/UPDATE/DELETE/TRUNCATE nas views (não basta o INSERT falhar por a view não ser atualizável). Validação em runtime PENDENTE.

- [x] **AC9 — Índices de suporte:** Índices criados com `CREATE INDEX IF NOT EXISTS` (ADAPTADOS ao schema real — ver Dev Agent Record):
  - `idx_leads_org_utm` em `leads(org_id, utm_campaign, utm_source)` ✓
  - `idx_leads_org_stage` em `leads(org_id, stage_id)` ✓
  - ~~`idx_messages_lead_id` em `messages(lead_id)`~~ → N/A: `messages` não tem `lead_id` (só `conversation_id`, já indexado por `idx_messages_conversation` em 001). Divergência documentada.
  - ~~`idx_meta_insights_org_campaign(org_id, campaign_id)`~~ → substituído por `idx_meta_insights_org_level_entity(org_id, level, entity_id)`: `meta_insights_daily` não tem `campaign_id`, usa `level`/`entity_id`. Divergência documentada.

- [x] **AC10 — Contrato de dados documentado:** A seção "Contrato de Dados para 52-2" nesta story (ver Dev Notes) é preenchida com os nomes exatos de views, colunas e tipos que a Story 52-2 deve consumir — sem nenhuma modificação durante a implementação (contrato fixado nesta story).

- [x] **AC11 — Sem alteração de tabelas-base:** Migration cria apenas objetos novos (4 views + 3 índices). Nenhum `ALTER TABLE`/`CREATE POLICY` sobre tabelas-base. Migration não adiciona colunas, altera constraints nem modifica RLS das tabelas-base (`leads`, `kanban_stages`, `conversations`, `conversation_state`, `messages`) — apenas cria objetos novos (views, índices).

---

## Tasks / Subtasks

- [x] **T1** — Verificar numeração de migration e tabelas-base disponíveis
  - [x] T1.1 — `ls supabase/migrations/` confirma `095` como última e `096`/`097` livres
  - [x] T1.2 — Lido `001_base_schema.sql`: colunas reais confirmadas (ver Dev Agent Record)
  - [x] T1.3 — Lido `004_rls_policies.sql`: `public.user_org_id()` e `public.user_role()` confirmadas
  - [x] T1.4 — Lido `015_meta_marketing_api.sql`: naming de índices/políticas confirmado
  - [x] T1.5 — `meta_insights_daily` confirmado: NÃO tem `campaign_id`; usa `level`/`entity_id`(TEXT)/`date`/`spend`. JOIN de spend adaptado via `meta_campaigns.name` (decisão documentada)

- [x] **T2** — Criar migration `096_crm_pipeline_readonly_layer.sql` (AC1–AC9, AC11)
  - [x] T2.1 — view `v_pipeline_funnel_by_campaign` com LEFT JOIN de spend (via meta_campaigns), agregada por `(org_id, utm_source, utm_campaign, utm_medium)`, conversão cumulativa por stage type via `position` e CPL ponderado (AC2)
  - [x] T2.2 — view `v_pipeline_stage_distribution` com contagem + percentual por stage type segmentado por campanha/UTM (AC3)
  - [x] T2.3 — view `v_lead_drill` SEM `phone`/`email`, com JOIN em `kanban_stages` (stage_type, stage_position) (AC4)
  - [x] T2.4 — view `v_lead_conversations` com JOIN `conversations`↔`messages` via `conversation_id` (messages não tem lead_id); comentário inline de PII adicionado (AC5)
  - [x] T2.5 — Filtro de segurança via `public.user_role() = 'admin' AND org_id = public.user_org_id()` no WHERE de cada view + `security_invoker = on`. NÃO usado `auth.jwt() -> app_metadata` (quebraria para admins internos — ver Change Log v0.3). `CREATE POLICY` em view não é suportado pelo Postgres (AC6, AC7)
  - [x] T2.6 — `GRANT SELECT` nas 4 views para `authenticated`; sem INSERT/UPDATE/DELETE (AC8)
  - [x] T2.7 — Índices com `CREATE INDEX IF NOT EXISTS` (adaptados ao schema real) (AC9)
  - [x] T2.8 — Idempotência: `CREATE OR REPLACE VIEW` + `CREATE INDEX IF NOT EXISTS` (AC1)

- [~] **T3** — Validar migration (PENDENTE — sem CLI/PAT/psql no ambiente do @data-engineer)
  - [ ] T3.1 — Aplicar no DEV (`xnxvygyfyyyzwhiuoehz`) — PENDENTE (ver passos no Dev Agent Record)
  - [ ] T3.2 — Re-executar (idempotência) — PENDENTE
  - [ ] T3.3 — Testar RLS admin → resultado sem erro — PENDENTE
  - [ ] T3.4 — Testar RLS supervisor/broker → 0 rows — PENDENTE
  - [ ] T3.5 — Testar isolamento por `org_id` — PENDENTE
  - [ ] T3.6 — Testar INSERT bloqueado — PENDENTE

- [x] **T4** — Documentar contrato de dados (AC10)
  - [x] T4.1 — Seção "Contrato de Dados para 52-2" preenchida com nomes/colunas/tipos reais
  - [x] T4.2 — Change Log v0.3 registrado com contrato e decisões

---

## Dev Notes

### Arquivos a criar
- `supabase/migrations/096_crm_pipeline_readonly_layer.sql` — **criar** (migration principal desta story)

### Arquivos de referência obrigatórios (ler antes de escrever a migration)
- `supabase/migrations/001_base_schema.sql` — schema das tabelas-base do pipeline
- `supabase/migrations/004_rls_policies.sql` — padrão de RLS e função `public.user_org_id()`
- `supabase/migrations/015_meta_marketing_api.sql` — naming convention de índices e políticas
- `supabase/migrations/084_is_admin_or_supervisor_gerente_comercial.sql` — NÃO usar esta função; ler apenas para entender o que ela inclui e confirmar por que não serve

### Padrão de RLS do projeto
```sql
-- Padrão extraído de 004_rls_policies.sql / 015_meta_marketing_api.sql
CREATE POLICY "org_isolation" ON {table}
  FOR ALL
  USING (org_id = public.user_org_id());
```
Para esta story, a política é mais restritiva — exige `role = 'admin'` E `org_id` correto:
```sql
CREATE POLICY "admin_only_org_isolation" ON {view_name}
  FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    AND org_id = public.user_org_id()
  );
```

> **Nota de implementação:** Em Supabase/PostgreSQL, views por padrão não têm RLS própria. A segurança em views pode ser imposta via: (a) `SECURITY INVOKER` — a view herda as políticas RLS das tabelas-base (padrão Postgres 15+); ou (b) política explícita na view se o Supabase suportar. Verificar se o projeto usa Supabase com `security_invoker = on` por padrão. Se a view for `SECURITY INVOKER`, a RLS das tabelas-base já filtra — nesse caso, garantir que as tabelas-base `leads`, `kanban_stages`, `conversations`, `messages` já tenham políticas RLS que bloqueiem non-admin. Se não tiverem, criar a política diretamente nas views ou usar a abordagem de `SECURITY DEFINER` com verificação explícita de role dentro da view SQL. Documentar a abordagem escolhida no Change Log.

### Schema relevante das tabelas-base (confirmar via migration 001)

**`leads`**
- `id`, `org_id`, `name` (PII), `phone` (PII), `email` (PII)
- `qualification_score`, `stage_id` (FK → `kanban_stages.id`)
- `source` (enum `lead_source`)
- `utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`
- `ai_summary`, `created_at`, `updated_at`

**`kanban_stages`**
- `id`, `org_id`, `name`, `type` (enum: `novo`/`qualificado`/`agendado`/`visitou`/`proposta`/`fechado`/`perdido`), `position`

**`conversations`**
- `id`, `lead_id`, `org_id` (confirmar se existe ou derivar via leads), `channel`, `is_ai_active`, `created_at`

**`conversation_state`**
- `id`, `lead_id`, `collected_data` (jsonb), `qualification_step`

**`messages`**
- `id`, `conversation_id`, `role` (`user`/`assistant`/`broker`), `content` (PII/sensível), `created_at`

**`meta_insights_daily`**
- Confirmar colunas de join: `org_id`, campo que referencia campanha por UTM/nome (pode ser `campaign_id` ou `campaign_name` — verificar migration 015 ou 077_meta_alerts.sql)
- `spend` (NUMERIC), `date`

### Minimização de PII (NFR-SEC-3)
- `v_pipeline_funnel_by_campaign` e `v_pipeline_stage_distribution`: sem PII — apenas agregados
- `v_lead_drill`: excluir `phone` e `email`; incluir `name` (necessário para identificação no drill), `ai_summary` (gerado pela Nicole, não PII direta)
- `v_lead_conversations`: contém `messages.content` — PII/sensível; exige RLS admin-only explícita e será auditada na Story 52-4

### Contrato de Dados para 52-2 (preencher após T4)

> Este contrato é **fixado nesta story** e **não pode ser alterado** na Story 52-2 sem revisão e aprovação do @po + @sm. A Story 52-2 consome as views exatamente como definidas aqui.

**CONTRATO FIXADO (v0.4 — tipos SQL reais como implementados em `096_crm_pipeline_readonly_layer.sql`).**

> **MUDANÇA DE CONTRATO v0.4 (decisão do PO) — view → função:** o funil deixou de ser a view `v_pipeline_funnel_by_campaign` e passou a ser a **FUNÇÃO table-valued** `public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)`. Motivo: a janela de tempo do CPL deve ser **configurável** e views não aceitam parâmetro. A Story 52-2 (ainda Ready, não implementada) DEVE consumir a função via RPC — `@dev` da 52-2: este é o contrato a seguir.
>
> **Como a 52-2 chama (TypeScript / Supabase client):**
> ```typescript
> const { data, error } = await supabase
>   .rpc('pipeline_funnel_by_campaign', { p_days: 30 }) // default 30; configurável (ex.: 7, 90)
> ```
> `p_days` define a janela do `total_spend` (últimos N dias). Omitir o argumento usa o default 30. As demais 3 views permanecem views consumidas via `from('v_...')`.

#### `pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` — FUNÇÃO RPC (FR-1, FR-2)
| Coluna | Tipo SQL | Notas |
|--------|----------|-------|
| `org_id` | `uuid` | |
| `utm_source` | `varchar(255)` | nullable |
| `utm_campaign` | `varchar(255)` | nullable; chave de join com mídia (normalizada lower/trim) |
| `utm_medium` | `varchar(255)` | nullable |
| `total_leads` | `bigint` | |
| `leads_qualificado` | `bigint` | cumulativo: position >= min(position do type 'qualificado' na org) |
| `leads_agendado` | `bigint` | cumulativo |
| `leads_visitou` | `bigint` | cumulativo |
| `leads_proposta` | `bigint` | cumulativo |
| `leads_fechado` | `bigint` | exato: leads no stage type 'fechado' |
| `total_spend` | `numeric` | soma de spend dos últimos `p_days` dias (PERF-001). **NULL = sem mídia correlacionada por nome de campanha — interpretar como "sem dados", NÃO zero** (REL-001) |
| `cpl_real_visitou` | `numeric` | `total_spend / NULLIF(leads_visitou,0)`; NULL se sem spend |
| `cpl_real_fechado` | `numeric` | `total_spend / NULLIF(leads_fechado,0)`; NULL se sem spend |

#### `v_pipeline_stage_distribution` (FR-3)
| Coluna | Tipo SQL | Notas |
|--------|----------|-------|
| `org_id` | `uuid` | |
| `utm_source` | `varchar(255)` | nullable |
| `utm_campaign` | `varchar(255)` | nullable |
| `stage_type` | `stage_type` (enum) | `novo`/`qualificado`/.../`perdido`; NULL se lead sem stage |
| `lead_count` | `bigint` | |
| `pct_of_total` | `numeric` | ROUND(.,2); percentual sobre total da campanha/UTM |

#### `v_lead_drill` (FR-4) — SEM `phone`/`email`
| Coluna | Tipo SQL | Notas |
|--------|----------|-------|
| `id` | `uuid` | |
| `org_id` | `uuid` | |
| `name` | `varchar(255)` | PII de identificação (nullable) |
| `qualification_score` | `integer` | nullable |
| `stage_type` | `stage_type` (enum) | nullable |
| `stage_position` | `integer` | nullable |
| `source` | `lead_source` (enum) | nullable |
| `utm_source` | `varchar(255)` | |
| `utm_campaign` | `varchar(255)` | |
| `utm_medium` | `varchar(255)` | |
| `utm_content` | `varchar(255)` | |
| `ai_summary` | `text` | |
| `created_at` | `timestamptz` | |

#### `v_lead_conversations` (FR-5) — PII/sensível, auditar via `log_pii_access` (52-4)
| Coluna | Tipo SQL | Notas |
|--------|----------|-------|
| `org_id` | `uuid` | |
| `lead_id` | `uuid` | |
| `conversation_id` | `uuid` | (`conversations.id`) |
| `channel` | `varchar(20)` | |
| `is_ai_active` | `boolean` | |
| `message_id` | `uuid` | (`messages.id`) |
| `role` | `varchar(20)` | `user`/`assistant`/`system`/`broker` (NÃO é enum no schema) |
| `content` | `text` | PII / conteúdo sensível |
| `message_created_at` | `timestamptz` | (`messages.created_at`) |

> Contrato fixado nesta story. A Story 52-2 consome estas colunas exatamente como acima.

### Observação sobre RLS em Views (PostgreSQL/Supabase)
Views em PostgreSQL herdam RLS das tabelas subjacentes quando definidas com `SECURITY INVOKER` (default desde PG15). O @data-engineer deve verificar a versão do PostgreSQL e a configuração do Supabase do projeto. Se as tabelas-base já tiverem políticas RLS que filtram por `org_id`, as views agregadas herdarão esse filtro automaticamente. O filtro adicional de `role = 'admin'` deve ser aplicado de forma explícita — preferencialmente na view (via subquery com verificação de JWT) ou numa função SQL `SECURITY DEFINER` que sirva como wrapper. Documentar a abordagem no comentário da migration.

### Numeração da migration
- Última migration aplicada: `095_knowledge_base_null_empreendimento_global.sql`
- Esta story: `096_crm_pipeline_readonly_layer.sql`
- Confirmar via `ls supabase/migrations/` antes de criar — CON-6 do épico

---

## Testing

### Abordagem
- Validação de migration: aplicar em banco Supabase local e validar estrutura das views
- Validação de RLS: simular diferentes roles via manipulação de JWT claims local
- Validação de isolamento: verificar org_id filtering com dados de teste de duas orgs distintas
- Validação de read-only: tentar escrita via authenticated role

### Cenários de teste

1. **Idempotência:** Executar migration 2x consecutivas — deve passar sem erros na segunda execução (`DROP VIEW IF EXISTS` + `CREATE OR REPLACE FUNCTION` para o funil; `CREATE OR REPLACE VIEW` nas 3 views; `CREATE INDEX IF NOT EXISTS`)

2. **RLS admin — acesso permitido:** Usuário com `role = 'admin'` executa `SELECT * FROM pipeline_funnel_by_campaign(30)` — retorna dados da sua org (ou 0 rows se banco sem dados, sem erro de permissão)

3. **RLS non-admin — bloqueio:** Usuário com `role = 'supervisor'` ou `role = 'broker'` consulta qualquer view OU chama `pipeline_funnel_by_campaign(30)` — retorna 0 rows, sem acesso a dados de nenhuma org

4. **Isolamento multi-tenant:** Admin da org A não vê dados da org B em nenhuma das 3 views nem na função

5. **Read-only enforcement (DETERMINISTICO via REVOKE — v0.5):** Verificar que o role `authenticated` NÃO possui `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` nas 3 views — não basta o `INSERT INTO v_lead_drill VALUES (...)` falhar por a view não ser atualizável; o grant amplo padrão do Supabase precisa ter sido REVOGADO. Validar via `information_schema.role_table_grants` (ou `\dp v_lead_drill`) que `authenticated` lista apenas `SELECT` para as 3 views, e que `anon`/`PUBLIC` não têm nenhum privilégio. Para a função: confirmar que `authenticated` tem `EXECUTE` e `anon`/`PUBLIC` não. A função do funil não tem caminho de escrita (SELECT-only).
   ```sql
   -- Esperado: cada view lista SOMENTE 'SELECT' para 'authenticated', nada para 'anon'/PUBLIC
   SELECT grantee, privilege_type
     FROM information_schema.role_table_grants
    WHERE table_name IN ('v_pipeline_stage_distribution','v_lead_drill','v_lead_conversations')
    ORDER BY table_name, grantee, privilege_type;
   ```

6. **`v_lead_drill` sem PII crítica:** Confirmar via `\d v_lead_drill` que colunas `phone` e `email` não aparecem

7. **`pipeline_funnel_by_campaign` — CPL e janela:** Inserir lead de teste com `utm_campaign = 'camp-test'` + spend em `meta_insights_daily`/`meta_campaigns` (name='Camp-Test', com variação de caixa/espaço para validar a normalização REL-001) — confirmar `cpl_real_fechado` correto (ou NULL se 0 leads fechados). **Testar p_days variados:** spend com `date` antigo (> p_days) NÃO deve entrar; `pipeline_funnel_by_campaign(7)` vs `pipeline_funnel_by_campaign(90)` devem retornar `total_spend` diferentes conforme a janela (PERF-001).

8. **Índices criados:** Verificar via `\d leads` ou `pg_indexes` que os índices de suporte foram criados

9. **Funil para non-admin retorna 0 rows:** `SELECT count(*) FROM pipeline_funnel_by_campaign(30)` como supervisor/broker → 0 (filtro admin no WHERE da função)

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Cross-tenant leak em views (JOIN sem org_id ou RLS não aplicada) | Alta | Verificar todo JOIN inclui `org_id`; teste explícito de isolamento (cenário 4); RLS em tabelas-base protege via SECURITY INVOKER |
| R2 | RLS burlada por SECURITY DEFINER indevido nas views | Alta | Usar SECURITY INVOKER (herança de RLS das tabelas-base) ou verificação explícita de JWT; nunca SECURITY DEFINER sem verificação de role |
| R3 | Views expondo PII por engano (`phone`, `email` em `v_lead_drill`) | Média | AC4 explícito: `phone` e `email` excluídos; cenário de teste 6 valida isso |
| R4 | JOIN com `meta_insights_daily` sem coluna de correspondência com `utm_campaign` | Média | T1.5 verifica schema de `meta_insights_daily` antes de criar a view; LEFT JOIN garante que leads sem spend apareçam com `total_spend = NULL` |
| R5 | Conflito de numeração de migration | Baixa | T1.1 confirma numeração antes de criar arquivo |
| R6 | Auditoria silenciosa (fail-open) — esta story não inclui tabela de auditoria | Média | Documentado como OUT explícito; Story 52-4 entrega auditoria; 52-2 (injeção) depende de 52-4 (decisão de sequenciamento do épico) |

---

## Dependencies

- **Depende de:** nada — story fundacional do Epic 52
- **Bloqueia diretamente:** Story 52-4 (auditoria — consome estrutura das views para logar acessos), Story 52-3 (guard API/UI — valida que camada existe), Story 52-2 (injeção — consome o contrato de dados definido aqui)
- **Dependências técnicas:**
  - `supabase/migrations/001_base_schema.sql` (tabelas-base do pipeline)
  - `supabase/migrations/004_rls_policies.sql` (função `public.user_org_id()`)

---

## Definition of Done

- [ ] Migration `096_crm_pipeline_readonly_layer.sql` criada e aplicada sem erros
- [ ] Idempotência confirmada (re-execução sem falha)
- [ ] Função `pipeline_funnel_by_campaign(integer)` + três views existem no banco: `v_pipeline_stage_distribution`, `v_lead_drill`, `v_lead_conversations`
- [ ] RLS admin-only verificada: non-admin vê 0 rows em todas as views e na função
- [ ] Isolamento multi-tenant verificado: admin de org A não acessa dados de org B
- [ ] Read-only enforcement verificado: INSERT via `authenticated` role falha com erro de permissão
- [ ] `v_lead_drill` não expõe `phone` nem `email`
- [ ] Índices de suporte criados e confirmados
- [ ] Contrato de dados para 52-2 preenchido na seção Dev Notes (Change Log v0.2 registrado)
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
| 2026-06-15 | 0.1 | Story drafted a partir do Epic 52; contrato de dados definido como placeholder (a ser preenchido apos T4) | @sm (River) |
| 2026-06-15 | 0.2 | Validacao PO (checklist 10/10) — veredito GO. Status Draft → Ready. Ressalva registrada: RLS em views nao usa CREATE POLICY direto; @data-engineer deve documentar abordagem (security_invoker vs security_barrier+filtro de role) e @qa confirmar enforcement admin-only no cenario 3. | @po (Pax) |
| 2026-06-16 | 0.5 | **Fix de seguranca @data-engineer (achado de RUNTIME ao aplicar no DEV `xnxvygyfyyyzwhiuoehz`).** Ao aplicar a migration confirmou-se que o Supabase concede por padrao `GRANT ALL` (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) aos roles `authenticated` E `anon` em objetos do schema public. O `GRANT SELECT`/`GRANT EXECUTE` da migration NAO revogava esse baseline amplo. Embora views com JOIN/agregacao nao sejam atualizaveis (writes falhariam por construcao), o NFR-SEC-2 ("tecnicamente incapaz de escrever") exige enforcement DETERMINISTICO. CORRECAO no 096: apos os GRANT SELECT das 3 views, adicionado `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON (3 views) FROM authenticated` + `REVOKE ALL ON (3 views) FROM anon, PUBLIC` + re-`GRANT SELECT TO authenticated`; e para a funcao `REVOKE ALL ON FUNCTION pipeline_funnel_by_campaign(integer) FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated`. Estado final: views=authenticated so SELECT, anon/PUBLIC nada; funcao=EXECUTE so authenticated. REVOKE/GRANT idempotentes (seguro re-aplicar). AC8 e Testing cenario 5 atualizados: o teste agora verifica via `information_schema.role_table_grants` que `authenticated` NAO tem INSERT/UPDATE/DELETE/TRUNCATE. Logica das views/funcao INALTERADA. Status mantido Review. | @data-engineer (Dara) |
| 2026-06-16 | 0.4 | **Fixes QA @data-engineer.** **(PERF-001 + decisao PO):** view `v_pipeline_funnel_by_campaign` CONVERTIDA em FUNCAO table-valued `public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` (LANGUAGE sql, SECURITY INVOKER, STABLE, SET search_path). `total_spend` agora soma `meta_insights_daily.spend` so dentro de `date >= current_date - p_days` (janela CONFIGURAVEL, default 30; resolve CPL lifetime). Filtro admin+org mantido EXPLICITO no WHERE. `GRANT EXECUTE TO authenticated`. `DROP VIEW IF EXISTS` antes do CREATE FUNCTION para aplicar limpo. **(REL-001):** join `meta_campaigns.name = utm_campaign` normalizado com `lower(trim(...))` em ambos os lados; LEFT JOIN preserva leads sem spend; documentado que `total_spend`/CPL NULL = "sem midia correlacionada", NAO zero (comentario + contrato + Dev Notes para system prompt da 52-2). **MUDANCA DE CONTRATO (view→funcao)** sinalizada para o @dev da 52-2: consumir via `supabase.rpc('pipeline_funnel_by_campaign', { p_days: N })`. As 3 outras views inalteradas. Edicao direta no 096 (migration nao aplicada no DEV). Status mantido Review. | @data-engineer (Dara) |
| 2026-06-16 | 0.3 | Implementacao @data-engineer. Migration 096 criada com 4 views + 3 indices. **Decisao RLS:** filtro `public.user_role() = 'admin' AND org_id = public.user_org_id()` embutido no WHERE de cada view + `security_invoker = on`. **Decisao role:** usar `public.user_role()` (le users.role), NAO `auth.jwt() -> app_metadata` — confirmado no codigo que app_metadata.role so existe para role='cliente'; usar JWT quebraria admins internos (sempre 0 rows). **Decisao spend JOIN:** via `meta_campaigns.name = leads.utm_campaign` + soma de `meta_insights_daily` (level='campaign', entity_id=meta_campaign_id) — meta_insights_daily nao tem campaign_id/campaign_name. Divergencias de schema documentadas no Dev Agent Record. Contrato de dados fixado. Status Ready → Review. APLICACAO NO DEV PENDENTE (ambiente sem CLI/PAT/psql). | @data-engineer (Dara) |
| 2026-06-17 | 0.6 | Migration 096 aplicada no banco de producao via Management API — funcao `pipeline_funnel_by_campaign` (FUNCTION, SECURITY INVOKER), views `v_pipeline_stage_distribution`, `v_lead_drill`, `v_lead_conversations` e indices de suporte confirmados. Status → Done. | @devops (Gage) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M context) — @data-engineer (Dara)

### Debug Log References
- Schema confirmado em `001_base_schema.sql`, `004_rls_policies.sql`, `015_meta_marketing_api.sql`, `078_agent_chat.sql`.
- Verificacao do uso de `app_metadata.role`: `grep -rn app_metadata packages/web/src` → so populado para role='cliente' (admin-helpers.ts, auto-vincular-cliente-obra.ts, middleware.ts).
- Nenhuma migration existente usa `security_invoker` (grep vazio).

### Completion Notes List

**Decisao 1 — RLS em views (resolve a questao deixada aberta na story):**
PostgreSQL nao suporta `CREATE POLICY` nem `ALTER VIEW ... ENABLE ROW LEVEL SECURITY` em views. `security_invoker = on` sozinho NAO garante AC6 porque as politicas RLS das tabelas-base filtram por `org_id` mas NAO por `role='admin'` (leads/conversations/messages sao visiveis a admin/supervisor/broker). Logo, o controle load-bearing e o filtro `public.user_role() = 'admin' AND org_id = public.user_org_id()` embutido no WHERE de cada view. `security_invoker = on` foi aplicado como defesa em profundidade (a RLS de org das tabelas-base tambem filtra). Esta abordagem e deterministica e independente de versao do Postgres.

**Decisao 2 — Fonte do role = `public.user_role()` (NAO o JWT):**
A story sugeria `auth.jwt() -> 'app_metadata' ->> 'role'`. Confirmei no codigo que `app_metadata.role` so e populado para usuarios externos `role='cliente'`; usuarios internos (admin/supervisor/broker) tem `app_metadata.role = NULL`. Usar o JWT faria TODO acesso admin retornar 0 rows (quebra AC2/AC4). A fonte autoritativa, consolidada em todas as 95 migrations, e `public.user_role()` (le `public.users.role`). Adotado.

**Decisao 3 — JOIN de spend (resolve a ambiguidade da story):**
`meta_insights_daily` NAO tem `campaign_id` UUID nem `campaign_name`. Tem `level`/`entity_id`(TEXT)/`date`/`spend`, com `entity_id = meta_campaign_id` quando `level='campaign'`. Nao ha link direto de mídia para `leads.utm_campaign`. Decisao: ligar `meta_campaigns.name = leads.utm_campaign` (LEFT JOIN por org) e somar `meta_insights_daily` (level='campaign', entity_id=meta_campaign_id). E uma correspondencia por NOME de campanha — pode nao casar 100% se UTM nao espelhar o nome no Meta; LEFT JOIN garante `total_spend = NULL` nesses casos (nao perde leads). Documentado para 52-2.

**Divergencias schema assumido (story) vs real:**
1. `messages` NAO tem `lead_id` — so `conversation_id`. `v_lead_conversations` liga via `conversations`. AC9 `idx_messages_lead_id` N/A (existe `idx_messages_conversation` em 001).
2. `meta_insights_daily` sem `campaign_id` → indice AC9 `idx_meta_insights_org_campaign` substituido por `idx_meta_insights_org_level_entity(org_id, level, entity_id)`.
3. `messages.role` e `varchar(20)`, nao enum.
4. `user_role` enum so tem admin/supervisor/broker (obras/gerente-comercial nao existem como enum aqui).

**Convencao de funil cumulativo:**
"alcancou stage X ou posterior" = `kanban_stages.position >= MIN(position do type X na org)`. `leads_fechado` e exato (stage type='fechado'). Apenas `leads.is_active = true` entram nas agregacoes.

**Fixes QA v0.4 (PERF-001 + REL-001 + decisao do PO sobre janela configuravel):**
- **PERF-001 + janela configuravel:** a view `v_pipeline_funnel_by_campaign` foi CONVERTIDA na funcao table-valued `public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` (LANGUAGE sql, SECURITY INVOKER, STABLE, SET search_path). O `total_spend` agora soma `meta_insights_daily.spend` apenas dentro de `date >= current_date - p_days` (resolve o CPL lifetime). O filtro de seguranca admin+org (`public.user_role()='admin' AND org_id=public.user_org_id()`) foi mantido EXPLICITO no WHERE da funcao — controle load-bearing, identico ao que estava na view. Escolhido SECURITY INVOKER (nao DEFINER): herda RLS de org das tabelas-base como defesa em profundidade e nao precisa de elevacao. `GRANT EXECUTE ... TO authenticated` (sem escrita). Adicionado `DROP VIEW IF EXISTS public.v_pipeline_funnel_by_campaign;` antes do CREATE FUNCTION para a migration aplicar limpo caso o 096 ja tenha sido aplicado como view em algum ambiente.
- **REL-001:** o join `meta_campaigns.name = leads.utm_campaign` foi normalizado com `lower(trim(...))` em ambos os lados (reduz mismatch por caixa/espaco; NAO e fuzzy). LEFT JOIN preserva leads sem spend (`total_spend`/CPL = NULL). `WHERE mc.name IS NOT NULL` no CTE de spend evita agrupar nome nulo. Documentado (comentario na migration + contrato + AC2): NULL significa "sem dados de midia correlacionados", NAO zero — a 52-2 deve instruir o modelo a interpretar assim.
- **Contrato 52-2 atualizado:** funil agora e RPC `supabase.rpc('pipeline_funnel_by_campaign', { p_days: N })`, default 30, janela configuravel. MUDANCA de contrato (view→funcao) sinalizada no Change Log para o @dev da 52-2 (story ainda Ready). As 3 outras views permanecem inalteradas (snapshot atual).

**Fix v0.5 — REVOKE explicito (achado de RUNTIME):**
Ao aplicar a migration no DEV (`xnxvygyfyyyzwhiuoehz`) confirmou-se que o Supabase concede `GRANT ALL` por padrao aos roles `authenticated` E `anon` em objetos do schema public. O `GRANT SELECT`/`GRANT EXECUTE` da migration NAO derruba esse baseline. Views com JOIN/agregacao nao sao atualizaveis (writes falhariam por construcao), mas o NFR-SEC-2 exige enforcement DETERMINISTICO ("tecnicamente incapaz de escrever"), nao "non-updatable por acaso". Adicionado, apos os GRANT SELECT (linha ~358): `REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES` das 3 views para `authenticated`; `REVOKE ALL` das 3 views para `anon, PUBLIC`; re-`GRANT SELECT TO authenticated`; e para a funcao `REVOKE ALL ON FUNCTION pipeline_funnel_by_campaign(integer) FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated`. Estado final deterministico: views = `authenticated` so SELECT, `anon`/PUBLIC nada; funcao = EXECUTE so `authenticated`. REVOKE/GRANT sao idempotentes. Nenhuma alteracao na logica das views/funcao. Cenario de teste 5 e AC8 atualizados para verificar a ausencia de INSERT/UPDATE/DELETE/TRUNCATE via `information_schema.role_table_grants`.

**Status de aplicacao/teste:** Migration aplicada no DEV (achado v0.5 veio dessa aplicacao); o usuario vai RE-aplicar apos esta correcao (REVOKE e idempotente). O ambiente do @data-engineer nao tem Supabase CLI, nem PAT da Management API, nem psql, nem connection string Postgres (apenas SERVICE_ROLE_KEY do data-plane, que nao executa DDL). Sintaxe revisada manualmente (CTEs, parenteses, casts, grants, assinatura RETURNS TABLE com referencias qualificadas para evitar ambiguidade de OUT-params). Passos de aplicacao abaixo.

### Como aplicar e testar (PENDENTE — para o usuario/@dev/@devops)

Pre-req: apontar para o DEV (`xnxvygyfyyyzwhiuoehz`), NUNCA prod.

Opcao A — Supabase CLI:
```
supabase link --project-ref xnxvygyfyyyzwhiuoehz
supabase db push   # aplica 096 e 097
```
Opcao B — Management API (precisa de PAT `sbp_...`):
```
curl -X POST "https://api.supabase.com/v1/projects/xnxvygyfyyyzwhiuoehz/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" -H "Content-Type: application/json" \
  --data-binary @<(jq -Rs '{query: .}' supabase/migrations/096_crm_pipeline_readonly_layer.sql)
```
Opcao C — SQL Editor do Studio (DEV): colar o conteudo de 096 e 097.

Cenarios de teste (rodar como admin e como non-admin, simulando JWT/role):
1. Idempotencia: rodar 096 2x — segunda execucao sem erro (DROP VIEW IF EXISTS + CREATE OR REPLACE FUNCTION para o funil).
2. Admin: `SELECT count(*) FROM pipeline_funnel_by_campaign(30);` → sem erro (0+ rows).
3. Non-admin (supervisor/broker): mesma chamada → 0 rows.
4. Isolamento: admin org A nao ve org B em nenhuma view nem na funcao.
5. Read-only: `INSERT INTO v_lead_drill ...` como authenticated → permission denied.
6. `v_lead_drill` sem PII: `\d v_lead_drill` nao mostra phone/email.
7. CPL + janela (PERF-001/REL-001): inserir lead `utm_campaign='X'` + spend em meta_insights_daily/meta_campaigns com name='X' (variar caixa/espaco p/ validar normalizacao); confirmar cpl_real_* calculado; spend com date > p_days NAO entra; comparar `pipeline_funnel_by_campaign(7)` vs `(90)`.

### File List

#### Created
- `supabase/migrations/096_crm_pipeline_readonly_layer.sql`

#### Modified
- _(nenhuma — apenas atualizacao desta story)_

---

## QA Results

### Review Date: 2026-06-16

### Reviewed By: Quinn (Test Architect / Guardian)

### Escopo da Revisao
Revisao ESTATICA da migration `096_crm_pipeline_readonly_layer.sql`. A aplicacao em runtime no Supabase DEV (`xnxvygyfyyyzwhiuoehz`) esta PENDENTE (ambiente do @data-engineer sem CLI/PAT/psql), portanto NAO foi possivel executar os cenarios de teste ao vivo. Tudo que e verificavel estaticamente foi auditado; o restante esta listado como pendente de runtime.

### 1. Code/SQL Review — PASS
- Idempotencia correta: `CREATE OR REPLACE VIEW` nas 4 views + `CREATE INDEX IF NOT EXISTS` nos 3 indices. Re-execucao segura.
- CTEs legiveis e bem comentadas; cabecalho documenta decisoes de seguranca e divergencias de schema.
- `security_invoker = on` aplicado em todas as 4 views (defesa em profundidade — herda RLS de org das tabelas-base).
- Aderencia ao padrao do projeto (uso de `public.user_org_id()`/`public.user_role()` consolidado em 95 migrations).
- `NULLIF(...,0)` protege divisao por zero nos CPLs. `NOT DISTINCT FROM` trata corretamente UTMs NULL no JOIN de totais (view 2).

### 2. AC Mapping — PASS (estatico) / PENDENTE (runtime)
| AC | Status estatico | Nota |
|----|-----------------|------|
| AC1 idempotencia | OK por construcao | Aplicacao runtime pendente |
| AC2 funnel | OK — todas as colunas e CPLs presentes | — |
| AC3 distribution | OK — lead_count + pct_of_total | — |
| AC4 lead_drill | OK — phone/email OMITIDOS, name/ai_summary presentes | Confirmado |
| AC5 conversations | OK — join via conversation_id | messages sem lead_id confirmado |
| AC6 admin-strict | Filtro `user_role()='admin'` nas 4 views | 0-rows non-admin PENDENTE runtime |
| AC7 org isolation | `org_id = user_org_id()` nas 4 views | isolamento PENDENTE runtime |
| AC8 read-only grants | Apenas `GRANT SELECT` — nenhum INSERT/UPDATE/DELETE | enforcement PENDENTE runtime |
| AC9 indices | 3 indices adaptados ao schema real | divergencias bem documentadas |
| AC10 contrato | Preenchido com tipos SQL reais | nit DOC-001 abaixo |
| AC11 sem alteracao base | Apenas objetos novos; nenhum ALTER TABLE/CREATE POLICY em tabelas-base | Confirmado |

### 3. No Regression — PASS
Migration puramente ADITIVA. Verificado linha a linha: somente `CREATE INDEX`, `CREATE OR REPLACE VIEW`, `GRANT SELECT`, `COMMENT`. Nenhum `ALTER TABLE`, `DROP`, `CREATE POLICY` ou modificacao de RLS sobre `leads`/`kanban_stages`/`conversations`/`messages`/`meta_*`. AC11 satisfeito.

### 4. Performance — CONCERNS
- Indices de suporte adequados ao WHERE/GROUP BY das views (`idx_leads_org_utm`, `idx_leads_org_stage`, `idx_meta_insights_org_level_entity`).
- **PERF-001 (medium):** `campaign_spend` agrega `meta_insights_daily` SEM filtro de `date` — soma spend lifetime da campanha, nao do periodo do funil. CPL tende a inflar com o tempo. O AC2 menciona "no periodo" mas a SQL nao filtra periodo.
- **PERF-002 (low):** confirmar via EXPLAIN no DEV que os indices sao realmente usados pelos JOINs/agregacoes.

### 5. Security (PRIORITARIO) — PASS estatico forte / PENDENTE runtime
- **Helper `public.user_role()` CONFIRMADO** (resolve a preocupacao critica do PO): definido em `004_rls_policies.sql` e redefinido em `062_users_role_enum_to_text.sql` como `STABLE SECURITY DEFINER`, retorna `users.role` (TEXT pos-062) por `auth_id = auth.uid()`. Retorna corretamente `'admin'` para admins internos. A decisao de NAO usar `auth.jwt()->app_metadata->>'role'` esta CORRETA — confirmado que app_metadata.role so existe para role='cliente'; o JWT quebraria admins (sempre 0 rows). Esta decisao do @data-engineer foi a escolha de seguranca certa.
- **Admin-strict:** `public.user_role() = 'admin'` presente no WHERE das 4 views (linhas 173, 222, 252, 277). Como controle load-bearing, isso garante AC6 estaticamente. Validacao 0-rows non-admin pendente de runtime.
- **Isolamento multi-tenant:** `org_id = public.user_org_id()` presente nas 4 views. JOINs auditados: view 1 (funnel, type_thresholds, campaign_spend) todos correlacionam por `org_id`; view 2 idem; views 3/4 filtram org no WHERE. NENHUM join cross-tenant detectado.
- **Read-only:** apenas `GRANT SELECT` para `authenticated`. Views nao sao atualizaveis por padrao e sem grant de escrita. AC8 satisfeito estaticamente.
- **v_lead_drill NAO expoe phone/email:** CONFIRMADO (linhas 233-247) — phone e email deliberadamente omitidos; comentario inline explicito. NFR-SEC-3 satisfeito.
- **R2 (52-1):** SECURITY INVOKER nas views nao introduz escalada; controle de role e no WHERE. R2 mitigado.

### 6. Docs — PASS (com nit)
Contrato de dados preenchido com tipos SQL reais; Change Log v0.3 coerente; divergencias de schema documentadas no Dev Agent Record. **DOC-001 (low):** contrato marca `v_lead_drill.name` como nullable, mas `leads.name` e `NOT NULL` no schema 001 — divergencia de doc sem impacto funcional.

### 7. Tests — PENDENTE de runtime (BLOQUEIA Done)
Cenarios da story sao suficientes em cobertura, mas NENHUM foi executado. Antes de Done, validar no DEV:
1. Idempotencia (rodar 096 2x).
2. Admin: SELECT nas 4 views retorna sem erro.
3. **Non-admin (supervisor/broker): SELECT retorna 0 rows** (cenario critico AC6).
4. **Isolamento: admin org A nao ve org B** (AC7).
5. **Read-only: INSERT/UPDATE/DELETE via authenticated falha** (AC8).
6. `\d v_lead_drill` confirma ausencia de phone/email.
7. CPL calculado corretamente com lead + spend de teste.
8. EXPLAIN confirma uso dos indices (PERF-002).

### Issues Sumario
| ID | Severity | Categoria | Descricao | Recomendacao |
|----|----------|-----------|-----------|--------------|
| SEC-001 | medium | security | Enforcement admin-strict/isolamento/read-only nao validados em runtime | Aplicar no DEV + rodar cenarios 2-6 |
| PERF-001 | medium | performance | campaign_spend sem filtro de data -> CPL lifetime infla | Documentar como lifetime ou filtrar periodo |
| REL-001 | medium | reliability | Join spend por nome (meta_campaigns.name nullable = utm_campaign) e fragil -> CPL NULL silencioso | Validar taxa de match no DEV; normalizar/expor cobertura na 52-2 |
| PERF-002 | low | performance | Confirmar uso real dos indices | EXPLAIN no DEV |
| DOC-001 | low | docs | Contrato diz name nullable; leads.name e NOT NULL | Ajustar nota do contrato |

### Gate Status (revisao inicial)

Gate: CONCERNS → docs/qa/gates/52.1-pipeline-readonly-layer.yml

**Justificativa:** A migration esta estaticamente solida e segura — helpers confirmados, admin-strict e isolamento corretos em todas as views, read-only e minimizacao de PII satisfeitos. O verdito e CONCERNS (nao PASS) porque o enforcement de seguranca depende de validacao em runtime ainda PENDENTE, e ha 2 concerns medium de performance/reliability no calculo de CPL. NAO aprovar para Done ate: (a) aplicacao + cenarios 2-6 validados no DEV; (b) decisao documentada sobre PERF-001/REL-001.

---

## QA Results — Reavaliacao com Evidencia de Runtime

### Review Date: 2026-06-16 (re-review)

### Reviewed By: Quinn (Test Architect / Guardian)

### Escopo da Reavaliacao
A migration `096` foi APLICADA no Supabase DEV (`xnxvygyfyyyzwhiuoehz`) e os cenarios pendentes foram EXECUTADOS em runtime via Management API. Reavalio os 7 checks com a evidencia ao vivo. Tambem confirmei que o SQL em disco corresponde exatamente a evidencia (janela `mid.date >= current_date - p_days` na linha 218; normalizacao `lower(trim())` 211/241; filtro `user_role()='admin'` nas 4 objetos; REVOKE de escrita nas views + EXECUTE-only na funcao 365-372).

### Evidencia de Runtime (DEV)
**Seed:** org `52000000-...-a1` com admin (role=admin) e supervisor (role=supervisor) na MESMA org; 6 stages (novo->fechado, pos 1-6); 3 leads (1 fechado, 1 visitou, 1 novo; todos utm_campaign='Camp Teste'); campanha 'Camp Teste' com R$1000 de spend (level='campaign', <30d); 1 conversa com 2 mensagens.

**ADMIN (JWT sub = auth_id do admin):**
- `pipeline_funnel_by_campaign(30)` -> 1 row: total_leads=3, leads_qualificado=2, leads_agendado=2, leads_visitou=2, leads_proposta=1, leads_fechado=1, total_spend=1000, cpl_real_visitou=500, cpl_real_fechado=1000. Conversao cumulativa por position e CPL com janela CORRETOS.
- v_pipeline_stage_distribution: 3 rows; v_lead_drill: 3 rows (name/stage/score, SEM phone/email); v_lead_conversations: 2 mensagens.

**SUPERVISOR (mesma org, JWT sub = auth_id do supervisor):**
- pipeline_funnel_by_campaign(30) -> 0 rows; v_pipeline_stage_distribution -> 0; v_lead_drill -> 0; v_lead_conversations -> 0. Admin-only enforcement PROVADO (mesma org, role diferente, acesso zero — exclui a hipotese de o filtro ser apenas org).

**Grants efetivos (information_schema, apos REVOKE):**
- views: authenticated = {SELECT}; anon = nada.
- pipeline_funnel_by_campaign: EXECUTE so authenticated (+postgres/service_role). Baseline `GRANT ALL` do Supabase (incl. TRUNCATE/escrita) REVOGADO — read-only deterministico, nao "non-updatable por acaso".

### Reavaliacao dos 7 Checks
| # | Check | Verdito |
|---|-------|---------|
| 1 | Code/SQL Review | PASS (inalterado) |
| 2 | AC Mapping | PASS — AC1/AC6/AC7/AC8 agora confirmados em runtime (antes PENDENTE) |
| 3 | No Regression | PASS (aditiva) |
| 4 | Performance | PASS — PERF-001 resolvido (janela p_days; CPL 500/1000 correto) |
| 5 | Security | PASS — admin-strict + isolamento + read-only deterministico validados ao vivo |
| 6 | Docs | PASS (nit DOC-001 permanece, baixa) |
| 7 | Tests | PASS — cenarios runtime executados (admin, supervisor, grants) |

### Issues — Status Atualizado
| ID | Severity | Status | Nota |
|----|----------|--------|------|
| SEC-001 | medium | RESOLVED | Enforcement admin-strict + isolamento validados em runtime |
| PERF-001 | medium->low | RESOLVED | Janela p_days; CPL com janela correto (500/1000) |
| Furo de grants (TRUNCATE/escrita) | — | RESOLVED | REVOKE explicito; grants efetivos verificados via information_schema |
| REL-001 | low | FOLLOW-UP | Join de spend por nome (normalizado lower/trim); NULL = sem midia, documentado. Limitacao conhecida, nao bloqueante. A 52-2 deve interpretar NULL como ausencia de dado |
| DOC-001 | low | OPEN | Contrato diz name nullable; leads.name NOT NULL. Sem impacto funcional |

### Gate Status (reavaliacao)

Gate: CONCERNS -> **PASS** → docs/qa/gates/52.1-pipeline-readonly-layer.yml

**Justificativa:** Todas as pendencias bloqueantes da revisao inicial foram resolvidas e validadas em runtime no Supabase DEV. O enforcement admin-strict (supervisor da MESMA org ve 0 rows em tudo), o isolamento por org, o read-only deterministico (grants efetivos = SELECT-only nas views, EXECUTE-only na funcao, TRUNCATE/escrita revogados) e o calculo de CPL com janela configuravel estao comprovados. REL-001 permanece como follow-up de baixa severidade (limitacao conhecida de match por nome, nao bloqueante).

### Nota de Honestidade (escopo do "Done")

> **Done = QA PASS + validado no Supabase DEV.** O commit no git e o deploy em PROD (`dsopqkqjkmhytudaaolv`) permanecem como passo do @devops, AINDA NAO EXECUTADO. Esta story NAO esta deployada em producao. O verdito PASS atesta correcao funcional e de seguranca verificada no ambiente DEV isolado, nao presenca em prod.
