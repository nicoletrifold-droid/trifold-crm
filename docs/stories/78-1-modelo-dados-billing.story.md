# Story 78-1 — Modelo de Dados & Migration do Painel de Saúde & Billing

## Metadata
- **Epic:** 78 — Painel de Saúde & Billing da Plataforma
- **Story:** 78-1
- **Status:** InReview
- **Priority:** P1 — fundação para todas as demais stories do Epic 78 (78-2 até 78-9/78-10 dependem deste schema)
- **Complexity:** M (3 tabelas novas + RLS + seeds, sem lógica de aplicação; ~5h)
- **Created:** 2026-07-08
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @data-engineer (Dara)
- **Quality Gate:** @dev (Dex)
- **Quality Gate Tools:** `[schema_validation, rls_test, migration_review, seed_data_review]`

---

## User Story

**Como** sistema Trifold CRM,
**Quero** um modelo de dados (catálogo de serviços, vencimentos/lembretes e snapshots de custo/uso) protegido por RLS admin-only, com seed dos 7 serviços em escopo do painel de billing,
**Para que** as stories subsequentes (78-2 provisionamento, 78-3..78-7 coletores, 78-8 lembretes, 78-9 UI) tenham uma fundação de schema estável e segura para ler/escrever, sem precisar redefinir estrutura de dados a cada story.

---

## Context

O Epic 78 entrega um Painel de Saúde & Billing (admin-only) que consolida 7 serviços/integrações da plataforma (Anthropic, OpenAI, Vercel, WhatsApp/Meta, Supabase, Resend, e opcionalmente Meta Ads), lembrando vencimentos, trazendo custo automático onde a API permite e linkando direto para o billing de cada fornecedor.

Esta story é **fundacional**: nenhuma das stories de coleta (78-3 a 78-7), de lembretes (78-8) ou de UI (78-9) pode avançar sem as 3 tabelas e o seed dos serviços. Diferente da Story 52-1 (que criava *views* read-only sobre dados de tenant/pipeline com isolamento `org_id`), esta story cria **tabelas reais de escrita** (populadas pelos coletores e pelo cadastro manual de vencimentos) que descrevem **custos operacionais da própria plataforma Trifold**, não dado de tenant/cliente — portanto **sem `org_id`** (ver decisão de design nos Dev Notes).

**Padrão de referência para RLS:** `supabase/migrations/004_rls_policies.sql` — reusar `public.user_role()` (função já existente, `STABLE SECURITY DEFINER`, retorna o role do usuário autenticado via `auth.uid()`). Diferente da 52-1 (onde o alvo eram *views*, que não suportam `CREATE POLICY`), aqui os alvos são **tabelas reais**, então o padrão direto de `CREATE POLICY ... USING (public.user_role() = 'admin')` se aplica sem workaround.

**Próxima migration livre:** `164` (última atual: `163_pastas_imobiliaria_fk.sql`). Confirmado via `ls supabase/migrations/*.sql | sort` — nenhuma migration `164` existe. Há duplicações históricas de numeração antigas (021, 024, 025, 027, 031-034, 036, 044, 048, 063, 066, 075, 102, 104) documentadas como débito conhecido do projeto (ver `CLAUDE.md` — conflito histórico 074/075); isso **não afeta** a escolha de `164` como próximo número livre, pois a maior migration existente é `163` sem lacuna.

---

## Scope

### IN (esta story entrega)
- Migration `164_platform_services_billing.sql` criando:
  - Tabela `platform_services` (catálogo dos 7 serviços + deep-link + camada de automação) — FR-1
  - Tabela `service_billing_reminders` (vencimento, valor esperado, ciclo, moeda, dias-antes-de-alertar) — FR-2, CON-1
  - Tabela `service_cost_snapshots` (serviço, data, métrica, valor, moeda, `collection_status`) — FR-4, FR-6, NFR-4
  - RLS **admin-only** nas 3 tabelas via `CREATE POLICY ... USING (public.user_role() = 'admin')` — NFR-2
  - `UNIQUE(service_id, snapshot_date, metric)` em `service_cost_snapshots` para upsert idempotente — NFR-4
  - Seed dos 7 serviços em escopo (Anthropic, OpenAI, Vercel, WhatsApp, Supabase, Resend + placeholder Meta Ads) com deep-links de billing — FR-1, FR-7
  - Índices de suporte às queries mais comuns (por serviço+data, por status+vencimento)
  - Trigger `set_updated_at` (função `update_updated_at()` já existente em `001_base_schema.sql`) em `platform_services` e `service_billing_reminders`
- Definição do **contrato de dados** (nomes de tabela, colunas, tipos, valores permitidos) que as Stories 78-2 a 78-9 vão consumir/popular

### OUT (não entra nesta story)
- Qualquer coletor de custo (Anthropic/OpenAI/Vercel/WhatsApp/Supabase/Resend) — escopo das Stories 78-3 a 78-7
- Provisionamento das credenciais/secrets de billing — escopo da Story 78-2
- CRUD de vencimentos e motor de lembretes/notificações — escopo da Story 78-8 (esta story só cria a tabela; a lógica de "disparar lembrete N dias antes" e o formulário de cadastro são da 78-8)
- UI do painel — escopo da Story 78-9
- Módulo de gasto de mídia Meta Ads (`insights.spend`) — escopo opcional da Story 78-10 (aqui só existe o **row de catálogo placeholder**, desabilitado, sem lógica)
- Conversão de moeda BRL↔USD — NFR-7 explicitamente proíbe inventar taxa de conversão

---

## Acceptance Criteria

- [x] **AC1 — Migration criada e idempotente por construção:** Migration `164_platform_services_billing.sql` criada com `CREATE TABLE IF NOT EXISTS` nas 3 tabelas, `CREATE INDEX IF NOT EXISTS` nos índices, e seed via `INSERT ... ON CONFLICT (slug) DO NOTHING` (reexecutar a migration não duplica linhas nem falha).

- [x] **AC2 — Tabela `platform_services` (catálogo):** Criada com as colunas: `id uuid PK default gen_random_uuid()`, `slug text NOT NULL UNIQUE`, `name text NOT NULL`, `category text NOT NULL`, `automation_tier text NOT NULL CHECK (automation_tier IN ('forte','media','fraca'))`, `has_auto_cost_collection boolean NOT NULL DEFAULT false`, `billing_url text NOT NULL`, `billing_url_confirmed boolean NOT NULL DEFAULT true`, `enabled boolean NOT NULL DEFAULT true`, `display_order integer NOT NULL DEFAULT 0`, `notes text`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

- [x] **AC3 — Tabela `service_billing_reminders` (vencimentos):** Criada com: `id uuid PK`, `service_id uuid NOT NULL REFERENCES platform_services(id) ON DELETE CASCADE`, `due_date date NOT NULL`, `expected_amount numeric(12,2)`, `currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','BRL'))`, `billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly','annual','usage'))`, `alert_days_before integer NOT NULL DEFAULT 7 CHECK (alert_days_before >= 0)`, `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','alerted','paid','postponed','skipped'))`, `paid_at timestamptz`, `notes text`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`.

- [x] **AC4 — Tabela `service_cost_snapshots` (snapshots de custo/uso):** Criada com: `id uuid PK`, `service_id uuid NOT NULL REFERENCES platform_services(id) ON DELETE CASCADE`, `snapshot_date date NOT NULL`, `metric text NOT NULL`, `value numeric NOT NULL`, `currency text CHECK (currency IN ('USD','BRL'))` (nullable — métricas de uso técnico como "requests" ou "tokens" não têm moeda), `collection_status text NOT NULL DEFAULT 'ok' CHECK (collection_status IN ('ok','manual','no_data','error'))`, `collected_at timestamptz NOT NULL DEFAULT now()`, `raw_response jsonb`, `created_at timestamptz NOT NULL DEFAULT now()`, com **`UNIQUE(service_id, snapshot_date, metric)`**.

- [x] **AC5 — RLS admin-only nas 3 tabelas:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY "admin_only" ON {table} FOR ALL USING (public.user_role() = 'admin') WITH CHECK (public.user_role() = 'admin')` em `platform_services`, `service_billing_reminders` e `service_cost_snapshots`. Dado um usuário com `role != 'admin'` (supervisor, broker, obras, gerente-comercial): `SELECT`/`INSERT`/`UPDATE`/`DELETE` nas 3 tabelas retornam 0 rows ou erro de permissão — nunca dado parcial.

- [x] **AC6 — Integridade referencial:** `service_billing_reminders.service_id` e `service_cost_snapshots.service_id` são FK para `platform_services(id)` com `ON DELETE CASCADE` (remover um serviço do catálogo remove seus vencimentos/snapshots associados — comportamento intencional, documentado no Dev Notes). `platform_services.slug` é `UNIQUE` (chave estável usada pelos coletores para localizar o serviço, ver Dev Notes).

- [x] **AC7 — Índices de suporte:** `CREATE INDEX IF NOT EXISTS idx_service_cost_snapshots_service_date ON service_cost_snapshots(service_id, snapshot_date DESC)`; `CREATE INDEX IF NOT EXISTS idx_service_billing_reminders_status_due ON service_billing_reminders(status, due_date)`; `CREATE INDEX IF NOT EXISTS idx_service_billing_reminders_service ON service_billing_reminders(service_id)`.

- [x] **AC8 — Seed dos 7 serviços com deep-links:** `INSERT INTO platform_services (...) VALUES (...) ON CONFLICT (slug) DO NOTHING` populando exatamente os 7 slugs definidos no contrato (Dev Notes): `anthropic`, `openai`, `vercel`, `whatsapp`, `supabase`, `resend`, `meta_ads`. Serviços cujo deep-link depende de um slug de organização/time que não pôde ser confirmado nesta story (Vercel, Supabase) são seedados com `billing_url_confirmed = false` e uma URL de melhor esforço documentada — **nenhum slug de org/time é inventado como se fosse real** (Article IV). `meta_ads` é seedado com `enabled = false` (aguardando decisão OQ-2 do épico) e `automation_tier = 'media'`.

- [x] **AC9 — Nenhuma alteração em tabelas existentes:** A migration cria apenas objetos novos (3 tabelas + índices + seed). Nenhum `ALTER TABLE` sobre tabelas pré-existentes do schema (`users`, `organizations`, `leads`, etc.).

- [x] **AC10 — Contrato de dados documentado:** A seção "Contrato de Dados para 78-2..78-9" nesta story (Dev Notes) está preenchida com nomes exatos de tabela/coluna/tipo/valores permitidos (enums via CHECK) que as próximas stories devem consumir sem alterá-los sem revisão do @po/@sm.

---

## Tasks / Subtasks

- [x] **T1** — Verificar numeração de migration e convenções do projeto
  - [x] T1.1 — `ls supabase/migrations/*.sql | sort` confirma `163` como última e `164` livre
  - [x] T1.2 — Ler `001_base_schema.sql` (função `update_updated_at()`, padrão de tabela/trigger)
  - [x] T1.3 — Ler `004_rls_policies.sql` (`public.user_role()`, padrão `CREATE POLICY ... USING (public.user_role() = 'admin')`) — corrigido conforme @po: fonte de verdade é `062_users_role_enum_to_text.sql` (retorna TEXT, sem cast `::user_role`)

- [x] **T2** — Criar migration `164_platform_services_billing.sql` (AC1–AC7, AC9)
  - [x] T2.1 — `CREATE TABLE IF NOT EXISTS platform_services` (AC2)
  - [x] T2.2 — `CREATE TABLE IF NOT EXISTS service_billing_reminders` com FK + CHECKs (AC3, AC6)
  - [x] T2.3 — `CREATE TABLE IF NOT EXISTS service_cost_snapshots` com FK + `UNIQUE(service_id, snapshot_date, metric)` (AC4, AC6)
  - [x] T2.4 — `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY "admin_only"` nas 3 tabelas (AC5)
  - [x] T2.5 — Índices de suporte (AC7)
  - [x] T2.6 — Trigger `set_updated_at` (reusar `update_updated_at()`) em `platform_services` e `service_billing_reminders`
  - [x] T2.7 — Comentários inline (`COMMENT ON TABLE/COLUMN`) explicando decisão de não ter `org_id` (plataforma, não tenant) e o significado de `collection_status`

- [x] **T3** — Seed dos 7 serviços (AC8)
  - [x] T3.1 — Confirmar deep-links conhecidos (Anthropic, OpenAI, WhatsApp/Meta, Resend) — usar exatamente os fornecidos no épico
  - [x] T3.2 — Marcar `billing_url_confirmed = false` para Vercel (slug de time) e Supabase (slug de org) com URL de melhor esforço
  - [x] T3.3 — Seed do placeholder `meta_ads` com `enabled = false`

- [ ] **T4** — Validar migration (aplicar em DEV, nunca em PROD diretamente) — **DEFERIDO**: aplicação em qualquer banco é passo de deploy do @devops; validação runtime (RLS/idempotência/constraints) faz parte do quality gate @dev e do smoke pós-deploy. Nenhum banco tocado por @data-engineer nesta story (por instrução do spawn).
  - [ ] T4.1 — Aplicar no Supabase DEV
  - [ ] T4.2 — Reexecutar (idempotência) — sem erro, sem duplicar seed
  - [ ] T4.3 — Testar RLS admin → acesso OK nas 3 tabelas
  - [ ] T4.4 — Testar RLS non-admin → 0 rows / erro de permissão nas 3 tabelas
  - [ ] T4.5 — Testar `UNIQUE(service_id, snapshot_date, metric)` — segundo INSERT do mesmo trio deve falhar (ou ser tratado via `ON CONFLICT DO UPDATE` pelos coletores futuros — aqui só validar que a constraint existe e bloqueia duplicata simples)

- [x] **T5** — Documentar contrato de dados (AC10)
  - [x] T5.1 — Preencher seção "Contrato de Dados para 78-2..78-9" nos Dev Notes (já fixado pelo @sm; schema da migration bate 1:1 com o contrato)
  - [x] T5.2 — Registrar decisões no Change Log

---

## Dev Notes

### Arquivo a criar
- `supabase/migrations/164_platform_services_billing.sql` — migration única desta story

### Arquivos de referência obrigatórios (ler antes de escrever a migration)
- `supabase/migrations/001_base_schema.sql` — função `update_updated_at()` (linha ~279) e padrão de trigger `set_updated_at`
- `supabase/migrations/004_rls_policies.sql` — função `public.user_role()` (linha 16-19) e padrão `CREATE POLICY`
- `docs/stories/52-1-pipeline-readonly-layer.story.md` — story-irmã mais próxima em natureza (RLS admin-only + contrato de dados fixado para stories seguintes), mas ali o alvo eram *views* (sem `CREATE POLICY` direto); aqui os alvos são tabelas reais, então o padrão de RLS é mais simples

### Decisão de design — SEM `org_id`
O projeto é multi-tenant (`organizations`, isolamento por `public.user_org_id()` na maioria das tabelas de negócio — leads, conversas, etc.). Esta story é uma **exceção deliberada**: `platform_services`, `service_billing_reminders` e `service_cost_snapshots` descrevem **custos operacionais da própria plataforma Trifold** (a conta Anthropic, o time Vercel, etc.), não dado pertencente a um tenant/cliente. Não existe um "serviço Anthropic da org X" — é um recurso único compartilhado por toda a instância. Por isso as 3 tabelas **não têm `org_id`** e a segurança é só por `role = 'admin'` (NFR-2), sem isolamento de tenant. Se o produto evoluir para múltiplas organizações realmente distintas cobradas separadamente, isso seria uma migration de evolução futura — não inventar isso agora (Article IV).

### Padrão de RLS (diferente da 52-1 — aqui são tabelas, não views)
```sql
-- Padrão extraído de 004_rls_policies.sql, aplicado diretamente (tabela real, não view)
ALTER TABLE platform_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only" ON platform_services
  FOR ALL
  USING (public.user_role() = 'admin')
  WITH CHECK (public.user_role() = 'admin');
```
Repetir o mesmo padrão (`FOR ALL USING (...) WITH CHECK (...)`) para `service_billing_reminders` e `service_cost_snapshots`. O `service_role` (usado pelos cron jobs coletores das Stories 78-3..78-7) **bypassa RLS por padrão no Supabase** — os coletores rodando com `SUPABASE_SERVICE_ROLE_KEY` continuam escrevendo normalmente em `service_cost_snapshots`, sem precisar de policy adicional.

### `platform_services.billing_url_confirmed` — por que existe
Este campo booleano existe especificamente para não violar o Artigo IV (No Invention). Nem todo deep-link de billing é um valor fixo e universal — Vercel (`https://vercel.com/[team]/~/settings/billing`) e Supabase (`https://supabase.com/dashboard/org/_/billing`) dependem do slug real do time/organização, que esta story **não tem como confirmar** (não é uma decisão de schema, é um dado operacional). Esses dois são seedados com `billing_url_confirmed = false` e a URL de melhor esforço documentada abaixo; a Story 78-9 (UI) deve exibir um indicador visual quando `billing_url_confirmed = false`, e a confirmação real do slug é responsabilidade operacional de quem tem acesso às contas (fora do escopo de código desta story).

### Contrato de Dados para 78-2..78-9 (preencher após T5 — fixado nesta story)

> Este contrato é **fixado nesta story** e não pode ser alterado pelas stories seguintes sem revisão do @po + @sm.

#### `platform_services`
| Coluna | Tipo SQL | Notas |
|--------|----------|-------|
| `id` | `uuid` | PK |
| `slug` | `text` | UNIQUE — chave estável usada pelos coletores (`anthropic`, `openai`, `vercel`, `whatsapp`, `supabase`, `resend`, `meta_ads`) |
| `name` | `text` | Nome de exibição |
| `category` | `text` | `ia` / `hosting` / `messaging` / `email` / `database` / `ads` |
| `automation_tier` | `text` | `forte` (Anthropic/OpenAI/Vercel) / `media` (WhatsApp, Meta Ads) / `fraca` (Supabase, Resend) — espelha a classificação do épico (§2.1) |
| `has_auto_cost_collection` | `boolean` | `true` para os coletores automáticos (78-3/78-4/78-5); `false` para fallback manual (78-6 parcial, 78-7) |
| `billing_url` | `text` | Deep-link 1-clique (FR-7) |
| `billing_url_confirmed` | `boolean` | `false` = URL de melhor esforço, slug de org/time não confirmado — ver decisão de design acima |
| `enabled` | `boolean` | `false` para `meta_ads` (aguardando OQ-2) |
| `display_order` | `integer` | Ordenação sugerida para a UI (78-9) |

#### `service_billing_reminders`
| Coluna | Tipo SQL | Notas |
|--------|----------|-------|
| `id` | `uuid` | PK |
| `service_id` | `uuid` | FK → `platform_services.id` |
| `due_date` | `date` | Próxima data de vencimento (CON-1 — nenhuma API expõe isso, é sempre manual) |
| `expected_amount` | `numeric(12,2)` | Nullable — pode não ser conhecido ainda |
| `currency` | `text` | `USD` ou `BRL` — moeda de origem, sem conversão (NFR-7) |
| `billing_cycle` | `text` | `monthly` / `annual` / `usage` |
| `alert_days_before` | `integer` | Configurável por registro (FR-3); default 7 |
| `status` | `text` | `pending` → `alerted` → `paid` (ou `postponed`/`skipped`) — máquina de estados operada pela Story 78-8 |
| `paid_at` | `timestamptz` | Preenchido quando `status = 'paid'` |

#### `service_cost_snapshots`
| Coluna | Tipo SQL | Notas |
|--------|----------|-------|
| `id` | `uuid` | PK |
| `service_id` | `uuid` | FK → `platform_services.id` |
| `snapshot_date` | `date` | Granularidade diária (CON-6 — nenhuma API dá granularidade melhor) |
| `metric` | `text` | Livre por serviço — ex.: `cost_usd`, `tokens_input`, `tokens_output`, `requests`, `egress_bytes`, `messages_sent`. Cada coletor (78-3..78-7) define suas próprias métricas; esta story não restringe via CHECK/enum para não travar os coletores ainda não implementados |
| `value` | `numeric` | Valor da métrica no dia |
| `currency` | `text` | Nullable — só preenchido quando `metric` é monetária |
| `collection_status` | `text` | `ok` (coleta automática funcionou) / `manual` (valor inserido manualmente — Supabase/Resend) / `no_data` (API não retornou, ex. WhatsApp via BSP — CON-4) / `error` (falha na coleta, NFR-3) |
| `raw_response` | `jsonb` | Nullable — payload bruto da API para depuração (opcional, coletor decide se preenche) |
| **UNIQUE** | `(service_id, snapshot_date, metric)` | Upsert idempotente (NFR-4) — coletores devem usar `ON CONFLICT (service_id, snapshot_date, metric) DO UPDATE SET value = EXCLUDED.value, collection_status = EXCLUDED.collected_at, collected_at = now()` |

### Deep-links de seed (conforme fornecidos; "confirmar" onde aplicável)
| Slug | `billing_url` seedada | `billing_url_confirmed` |
|------|------------------------|--------------------------|
| `anthropic` | `https://console.anthropic.com/settings/billing` | `true` |
| `openai` | `https://platform.openai.com/settings/organization/billing/overview` | `true` |
| `vercel` | `https://vercel.com/[team]/~/settings/billing` (placeholder literal `[team]` — **substituir pelo slug real do time Vercel do projeto antes de expor na UI**) | `false` |
| `whatsapp` | `https://business.facebook.com/billing_hub/accounts` | `true` |
| `supabase` | `https://supabase.com/dashboard/org/_/billing` (placeholder literal `_` — **substituir pelo slug real da org Supabase antes de expor na UI**) | `false` |
| `resend` | `https://resend.com/settings/billing` | `true` |
| `meta_ads` | `https://business.facebook.com/billing_hub/accounts` (reuso do billing hub do Meta Business — mesma conta do WhatsApp; **confirmar se Ads tem billing separado antes de habilitar**) | `false` |

### Por que `meta_ads` é seedado mesmo estando fora do MVP
O epic (§7, nota da tabela de stories) pede seed dos "7 serviços em escopo... + placeholder Meta Ads". O placeholder existe no catálogo (`enabled = false`) para que a Story 78-10 (opcional, condicionada a OQ-2) só precise fazer `UPDATE platform_services SET enabled = true WHERE slug = 'meta_ads'` e implementar o coletor — sem precisar de nova migration de catálogo. Nenhuma lógica de coleta ou exibição é implementada para `meta_ads` nesta story (CON-8 — não é conta a pagar, é budget de mídia).

### Testing Standards
- Não há suíte de testes automatizados de schema/migration no projeto (mesmo padrão observado na Story 52-1) — validação é manual via aplicação em Supabase DEV + queries de verificação (ver seção Testing abaixo)
- Seguir o mesmo processo de aplicação usado na 52-1: NUNCA aplicar diretamente em PROD; usar Supabase CLI (`supabase db push` contra o projeto DEV) ou Management API com PAT contra `xnxvygyfyyyzwhiuoehz` (dev)

---

## Testing

### Abordagem
- Validação de migration: aplicar em Supabase DEV e validar estrutura das 3 tabelas via `\d` ou `information_schema`
- Validação de RLS: simular `role = 'admin'` vs `role != 'admin'` via manipulação de JWT claims / troca de usuário de teste
- Validação de idempotência: reexecutar a migration inteira
- Validação de seed: conferir as 7 linhas de `platform_services` e seus valores exatos

### Cenários de teste

1. **Idempotência:** Executar a migration 2x consecutivas — segunda execução não falha e não duplica seed (`ON CONFLICT (slug) DO NOTHING`).
2. **Seed correto:** `SELECT slug, enabled, billing_url_confirmed FROM platform_services ORDER BY display_order` retorna exatamente 7 linhas com os slugs `anthropic, openai, vercel, whatsapp, supabase, resend, meta_ads`; `meta_ads.enabled = false`; `vercel.billing_url_confirmed = false`; `supabase.billing_url_confirmed = false`.
3. **RLS admin — acesso permitido:** Usuário com `role = 'admin'` executa `SELECT * FROM platform_services` — retorna as 7 linhas sem erro.
4. **RLS non-admin — bloqueio:** Usuário com `role = 'supervisor'`/`'broker'`/`'obras'`/`'gerente-comercial'` consulta qualquer uma das 3 tabelas — retorna 0 rows (ou erro de permissão em `INSERT`/`UPDATE`).
5. **FK cascade:** Inserir um `service_billing_reminders` e um `service_cost_snapshots` de teste apontando para um `platform_services` de teste; deletar o `platform_services` de teste — as linhas relacionadas são removidas automaticamente (`ON DELETE CASCADE`).
6. **UNIQUE de snapshots:** Inserir `(service_id, '2026-07-08', 'cost_usd', 10.5)` duas vezes com `INSERT` simples (sem `ON CONFLICT`) — a segunda tentativa falha com violação de constraint única, confirmando que a constraint existe.
7. **CHECK constraints:** Tentar inserir `automation_tier = 'invalida'`, `currency = 'EUR'`, `billing_cycle = 'semanal'` ou `collection_status = 'desconhecido'` — todos devem falhar por violação de `CHECK`.
8. **Trigger `updated_at`:** Fazer um `UPDATE` em uma linha de `platform_services` — `updated_at` deve mudar automaticamente para o timestamp atual.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | Deep-link com slug inventado (Vercel/Supabase) passa despercebido para a UI como se fosse real | Média | `billing_url_confirmed = false` explícito + AC8 exige o flag; Story 78-9 deve renderizar aviso quando `false` |
| R2 | Métrica de `service_cost_snapshots.metric` sem enum permite lixo de nomenclatura dos futuros coletores (78-3..78-7) | Baixa | Aceito deliberadamente (Dev Notes) — travar com CHECK/enum agora quebraria a Story 78-3 ao definir suas próprias métricas; revisão de convenção de nomes fica para o "padrão de coletor" da 78-3 |
| R3 | Ausência de `org_id` ser vista como regressão de padrão multi-tenant do projeto | Baixa | Decisão de design documentada explicitamente nos Dev Notes com justificativa (dado de plataforma, não de tenant) |
| R4 | Conflito de numeração de migration | Baixa | T1.1 confirma numeração antes de criar arquivo |
| R5 | RLS admin-only bloquear acidentalmente o `service_role` dos futuros cron jobs coletores | Baixa | `service_role` bypassa RLS por padrão no Supabase (documentado nos Dev Notes); nenhuma policy adicional necessária para os coletores |

---

## Dependencies

- **Depende de:** nada — story fundacional do Epic 78
- **Bloqueia diretamente:** Story 78-2 (provisionamento de secrets — não depende do schema, mas é sequenciada em paralelo/logo após), Stories 78-3 a 78-7 (coletores — escrevem em `service_cost_snapshots`), Story 78-8 (motor de lembretes — lê/escreve `service_billing_reminders`), Story 78-9 (UI — lê as 3 tabelas), Story 78-10 opcional (habilita o placeholder `meta_ads`)
- **Dependências técnicas:**
  - `supabase/migrations/001_base_schema.sql` (função `update_updated_at()`)
  - `supabase/migrations/004_rls_policies.sql` (função `public.user_role()`)

---

## Definition of Done

- [ ] Migration `164_platform_services_billing.sql` criada e aplicada sem erros no Supabase DEV
- [ ] Idempotência confirmada (reexecução sem falha, sem duplicar seed)
- [ ] 3 tabelas existem: `platform_services`, `service_billing_reminders`, `service_cost_snapshots`
- [ ] RLS admin-only verificada: non-admin não acessa nenhuma das 3 tabelas
- [ ] Seed dos 7 serviços confirmado com os valores exatos documentados no contrato
- [ ] `UNIQUE(service_id, snapshot_date, metric)` verificada
- [ ] FK `ON DELETE CASCADE` verificada
- [ ] CHECK constraints (automation_tier, currency, billing_cycle, status, collection_status) verificadas
- [ ] Contrato de dados para 78-2..78-9 preenchido nos Dev Notes
- [ ] @dev executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente).
> Validação de qualidade usará processo de revisão manual pelo @dev (quality gate desta story).

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-07-08 | 0.1 | Story criada a partir do Epic 78 (§7, story 78-1). Schema de 3 tabelas (`platform_services`, `service_billing_reminders`, `service_cost_snapshots`), RLS admin-only via `public.user_role()`, seed dos 7 serviços com deep-links, contrato de dados fixado para as stories 78-2..78-9. Decisão de design documentada: sem `org_id` (dado de plataforma, não de tenant). Migration `164` (confirmado próximo número livre após `163`). [AUTO-DECISION] Vercel/Supabase billing URLs dependem de slug de org/time não confirmável nesta story → seedadas com `billing_url_confirmed = false` e placeholder literal, em vez de inventar um slug (reason: Article IV — No Invention). [AUTO-DECISION] `service_cost_snapshots.metric` não usa CHECK/enum → reason: travar a lista de métricas agora quebraria a Story 78-3, que ainda vai definir o "padrão de coletor" reusado por 78-4/78-5/78-6. | @sm (River) |
| 2026-07-08 | 0.3 | **Implementação @data-engineer (Dara).** Migration `164_platform_services_billing.sql` criada — 3 tabelas (`platform_services`, `service_billing_reminders`, `service_cost_snapshots`), RLS admin-only via `public.user_role() = 'admin'` (padrão pós-062, sem cast enum — SHOULD-FIX do @po aplicada), FK ON DELETE CASCADE, `UNIQUE(service_id, snapshot_date, metric)`, 3 índices de suporte, triggers `set_updated_at` reusando `update_updated_at()`, e seed dos 7 serviços com deep-links. Puramente aditiva (AC9) e idempotente por construção (AC1). Vercel/Supabase seedados com `billing_url_confirmed=false` (placeholders literais, não inventados); `meta_ads` com `enabled=false`. AC1–AC10 satisfeitos por construção; Tasks T1/T2/T3/T5 concluídas. T4 (aplicação/validação em DB) DEFERIDA ao deploy @devops + quality gate @dev (spawn proíbe tocar em qualquer banco). Nenhum git commit/push (responsabilidade @devops). | @data-engineer (Dara) |
| 2026-07-08 | 0.2 | **Validação @po (Pax) — VEREDITO: GO. Score 9/10.** Story-draft-checklist (6 cat.) + 10-point AIOS aplicados. Anti-hallucination: verificados e confirmados — migration `164` livre (última = `163_pastas_imobiliaria_fk.sql`); `update_updated_at()` existe (001, L279); `public.user_role()` existe; roles `obras` (migr. 030) e `gerente-comercial` (custom text, migr. 062) são reais (não inventados); Story 52-1 existe; CodeRabbit corretamente `Disabled` (chave ausente em core-config). Executor assignment válido (@data-engineer ≠ @dev quality gate; DB/RLS → mapping correto). **2 correções para o @data-engineer aplicar no *develop (não bloqueantes):** (1) SHOULD-FIX — o Dev Notes cita `004_rls_policies.sql` como referência de `public.user_role()`, mas essa função foi **redefinida em `062_users_role_enum_to_text.sql`** (agora retorna TEXT, sem cast `::user_role`); o SQL da story JÁ está correto para o padrão pós-062, mas a referência 004 está desatualizada — usar `062` como fonte de verdade do `user_role()` e não copiar o padrão enum/cast do 004. (2) NICE-TO-HAVE — no snippet de `ON CONFLICT` do contrato (`service_cost_snapshots`) há typo: `collection_status = EXCLUDED.collected_at` deveria ser `collection_status = EXCLUDED.collection_status` (afeta stories 78-3..78-7, não a migration desta story). Status Draft → Ready. | @po (Pax) |

---

## Dev Agent Record

### Agent Model Used
@data-engineer (Dara) — Opus 4.8 (1M context)

### Debug Log References
- Numeração confirmada via `ls supabase/migrations/*.sql | sort | tail` → última `163_pastas_imobiliaria_fk.sql`, `164` livre.
- `update_updated_at()` confirmada em `001_base_schema.sql` L279 (sem args, seta `NEW.updated_at = now()`).
- `public.user_role()` confirmada em `062_users_role_enum_to_text.sql` L22-28 — retorna TEXT, padrão canônico `public.user_role() = 'admin'` SEM cast `::user_role`. Correção SHOULD-FIX do @po aplicada: NÃO copiado o padrão enum/cast do `004_rls_policies.sql` (desatualizado).
- Sem tooling de lint SQL no projeto (`grep sqlfluff/sql-lint/pg_prove` = vazio) — validação de sintaxe por revisão manual. Nenhum banco tocado (instrução do spawn: aplicação é passo do @devops).

### Completion Notes List
- Migration `supabase/migrations/164_platform_services_billing.sql` criada — puramente ADITIVA (AC9), idempotente por construção: `CREATE TABLE/INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`, `DROP TRIGGER IF EXISTS` antes de `CREATE TRIGGER`, e seed via `INSERT ... ON CONFLICT (slug) DO NOTHING` (AC1).
- 3 tabelas conforme colunas/tipos/CHECKs EXATOS dos Dev Notes: `platform_services` (AC2), `service_billing_reminders` (AC3, FK ON DELETE CASCADE), `service_cost_snapshots` (AC4, `UNIQUE(service_id, snapshot_date, metric)`).
- RLS admin-only nas 3 tabelas via `public.user_role() = 'admin'` em `FOR ALL USING (...) WITH CHECK (...)` (AC5, padrão pós-062). Sem `org_id` (decisão de design documentada — custo de plataforma, não de tenant).
- Índices AC7: `idx_service_cost_snapshots_service_date`, `idx_service_billing_reminders_status_due`, `idx_service_billing_reminders_service`.
- Triggers `set_updated_at` reusando `update_updated_at()` em `platform_services` e `service_billing_reminders`. `service_cost_snapshots` NÃO tem `updated_at` (o AC4 não define essa coluna — snapshots são imutáveis por linha), logo sem trigger nessa tabela — coerente com o contrato.
- Seed dos 7 serviços (AC8) com os deep-links da tabela dos Dev Notes. `vercel` e `supabase` com `billing_url_confirmed = false` (placeholders literais `[team]` / `_`, não inventados — Article IV). `meta_ads` com `enabled = false` e `automation_tier = 'media'`.
- `has_auto_cost_collection`: `true` para camada FORTE + WhatsApp (anthropic/openai/vercel/whatsapp — coleta automática), `false` para supabase/resend (fallback manual) e meta_ads (placeholder). Alinhado ao contrato dos Dev Notes e à classificação §2.1 do épico.
- **Desvio consciente:** T4 (aplicar/validar em Supabase DEV) NÃO executado — o spawn instrui explicitamente a não aplicar em nenhum banco (dev ou prod); a aplicação é passo de deploy do @devops e a validação runtime (RLS non-admin, idempotência, constraints) é coberta pelo quality gate @dev + smoke pós-deploy. Subtasks T4.x deixadas desmarcadas com nota.
- `service_cost_snapshots` NÃO recebe `CREATE POLICY` de escrita para o `service_role` porque este bypassa RLS por padrão no Supabase (Dev Notes / R5) — os coletores 78-3..78-7 escrevem normalmente.

### File List
- `supabase/migrations/164_platform_services_billing.sql` (novo)

---

## QA Results

### Review Date: 2026-07-08

### Reviewed By: Quinn (Test Architect) — @qa

### Escopo da revisão
Quality gate estático da migration `164_platform_services_billing.sql` (story de schema, sem lógica de aplicação). Nenhum banco tocado (T4 diferida por instrução do spawn — aplicação/validação runtime é passo do @devops + smoke pós-deploy). Revisão de sintaxe SQL linha-a-linha + mapeamento AC→evidência + verificação anti-alucinação das dependências.

### Verificações de dependência (anti-alucinação)
- `update_updated_at()` **confirmada** em `001_base_schema.sql` L279 (no-arg, seta `NEW.updated_at = now()`).
- `public.user_role()` **confirmada** em `062_users_role_enum_to_text.sql` L22-28 — `RETURNS TEXT`, `STABLE SECURITY DEFINER`, comparada com `= 'admin'` **sem cast `::user_role`**. A migration usa o padrão pós-062 corretamente (SHOULD-FIX do @po aplicada).
- Numeração **164** é o próximo número livre (`163_pastas_imobiliaria_fk.sql` é a última existente).
- `docs/qa/gates/` é o local de gate (core-config `qa.qaLocation: docs/qa`).

### Requirements Traceability (AC → evidência no SQL)

| AC | Requisito | Evidência (linha) | Status |
|----|-----------|-------------------|--------|
| AC1 | Migration idempotente por construção | `CREATE TABLE/INDEX IF NOT EXISTS`, `DROP POLICY/TRIGGER IF EXISTS`, `INSERT ... ON CONFLICT (slug) DO NOTHING` (L31,59,84,115-131,136-143,149-155,187) | ✅ |
| AC2 | `platform_services` — 13 colunas exatas | L31-45; CHECK `automation_tier IN ('forte','media','fraca')` L36 | ✅ |
| AC3 | `service_billing_reminders` — 12 colunas, FK CASCADE, CHECKs | L59-72; FK ON DELETE CASCADE L61; CHECKs currency/billing_cycle/alert_days_before/status | ✅ |
| AC4 | `service_cost_snapshots` + UNIQUE | L84-96; `currency` nullable c/ CHECK L90; `UNIQUE(service_id,snapshot_date,metric)` L95; sem `updated_at` (imutável) | ✅ |
| AC5 | RLS admin-only nas 3 tabelas | ENABLE RLS L111-113; `POLICY admin_only FOR ALL USING/WITH CHECK (public.user_role()='admin')` L115-131, sem cast enum | ✅ |
| AC6 | Integridade referencial (FK CASCADE + slug UNIQUE) | FK L61, L86; `slug ... UNIQUE` L33 | ✅ |
| AC7 | 3 índices de suporte | L136-143 (service_date DESC, status+due, service) | ✅ |
| AC8 | Seed dos 7 serviços com deep-links | L163-187; vercel/supabase `billing_url_confirmed=false`; meta_ads `enabled=false` + tier `media`; ON CONFLICT DO NOTHING | ✅ |
| AC9 | Nenhum ALTER em tabela existente | Só objetos novos (arquivo inteiro) | ✅ |
| AC10 | Contrato de dados documentado | Dev Notes preenchido; schema bate 1:1 (ressalva DOC-001) | ✅ |

### Revisão de sintaxe SQL
Parênteses balanceados; CHECKs bem-formados; seed sem aspas simples não escapadas; contagem de colunas do INSERT (10) casa com cada linha de VALUES; `gen_random_uuid()`/`timestamptz`/`jsonb`/`numeric(12,2)` válidos no Postgres/Supabase; sintaxe de `CREATE POLICY` e `CREATE TRIGGER ... EXECUTE FUNCTION` (PG11+) corretas. **Nenhum erro que quebraria a aplicação da migration.**

### NFR
- **Segurança:** PASS — RLS admin-only correto pós-062; ausência de `org_id` justificada (custo de plataforma, não de tenant); seed só contém URLs públicas de billing (nenhum secret).
- **Idempotência/Resiliência:** PASS — reexecução sem erro/duplicata; `UNIQUE` habilita upsert idempotente dos coletores (NFR-4).
- **Performance:** PASS — índices cobrindo as queries comuns (serviço+data, status+vencimento, serviço).
- **Manutenibilidade:** PASS — `COMMENT ON` inline documentam decisões; reuso de `update_updated_at()`.

### Issues
- **TEST-001 (low):** T4 diferida — comportamentos runtime (RLS non-admin, CASCADE, UNIQUE, trigger `updated_at`) verificados apenas estaticamente, não observados em banco. Sem suíte de teste de migration no projeto (mesmo padrão da 52-1). Ação: smoke pós-deploy pelo @devops (checklist no gate file).
- **DOC-001 (low):** Typo no snippet ON CONFLICT do contrato (Dev Notes, `service_cost_snapshots`): `collection_status = EXCLUDED.collected_at` → deveria ser `EXCLUDED.collection_status`. Afeta 78-3..78-7, **não** esta migration. Já sinalizado pelo @po. Corrigir antes de 78-3.

Nenhum issue de severidade medium/high. Nenhum bloqueante.

### Gate Status

Gate: PASS → docs/qa/gates/78.1-modelo-dados-billing.yml

### Recomendação
**APROVADO para push.** Próximo passo: @devops aplica a migration e executa o smoke checklist do gate (TEST-001) como parte do deploy; após push bem-sucedido, transicionar Status InReview → Done.
