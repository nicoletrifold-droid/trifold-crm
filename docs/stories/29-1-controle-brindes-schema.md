# Story 29.1 — DB Schema: Controle de Brindes

## Status: Ready for Review

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@dev"
quality_gate_tools: ["supabase migration list", "supabase db push", "psql query test"]

## Story

**Como** administrador do Trifold CRM,
**Quero** ter as tabelas de banco de dados para controle de brindes (`datas_comemorativas`, `brindes_destinatarios`, `brindes_entregas`) com RLS e seed de datas comemorativas brasileiras pré-cadastradas,
**Para que** o módulo de controle de brindes tenha uma fundação sólida de dados para ser construído nas Stories 29.2 e 29.3.

## Contexto

Fundação do Epic 29. Migration número `031_controle_brindes.sql` (próxima após `030_role_obras.sql`).

A planilha de origem possui ~1015 registros com: Nome da Obra, Mães, Pais, Observação de entrega, Endereço (campo único). O endereço varia de texto livre residencial até abreviações como "OBRA COMUNIDADE", "SEDE TRIFOLD". O import dos dados ocorrerá na Story 29.3.

**Obs:** As 3 tabelas são criadas nesta story. A Story 29.2 cria as API routes e o parser de endereços. A Story 29.3 cria a UI e faz o import dos dados.

## Acceptance Criteria

- [x] AC1: Arquivo `supabase/migrations/031_controle_brindes.sql` criado
- [x] AC2: Tabela `datas_comemorativas` criada com colunas: id (uuid PK), org_id (FK organizations NOT NULL), nome (text NOT NULL), data (date NOT NULL), ativa (boolean DEFAULT true), created_at, updated_at; constraint `UNIQUE(org_id, nome)` para tornar seed idempotente
- [x] AC3: Tabela `brindes_destinatarios` criada com colunas: id, org_id (FK), obra_nome (text NOT NULL), tipo (text CHECK 'mae'|'pai'|'outro' NOT NULL), nome (text NOT NULL), observacao (text NULL), endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado (char(2)), endereco_cep, endereco_referencia, created_at, updated_at
- [x] AC4: Tabela `brindes_entregas` criada com colunas: id, org_id (FK), destinatario_id (FK → brindes_destinatarios ON DELETE CASCADE), data_comemorativa_id (FK → datas_comemorativas ON DELETE CASCADE), status (text CHECK 'pendente'|'entregue'|'nao_encontrado' DEFAULT 'pendente'), observacao_entrega (text NULL), entregue_em (timestamptz NULL), created_at, updated_at; UNIQUE(destinatario_id, data_comemorativa_id)
- [x] AC5: RLS habilitada nas 3 tabelas com `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [x] AC6: Policies de SELECT nas 3 tabelas usando `org_id = public.user_org_id()` (qualquer usuário autenticado da org pode ler)
- [x] AC7: Policies de INSERT/UPDATE/DELETE nas 3 tabelas usando `public.is_admin_or_supervisor()` (somente admin/supervisor/obras pode escrever)
- [x] AC8: Indexes criados: `idx_brindes_dest_org_id`, `idx_brindes_dest_obra_nome`, `idx_brindes_dest_cidade`, `idx_brindes_ent_destinatario_id`, `idx_brindes_ent_data_id`, `idx_datas_com_org_id`
- [x] AC9: Seed de datas comemorativas para 2026 e 2027 inserido via `ON CONFLICT DO NOTHING` (idempotente):
  - Carnaval 2026 (03/03/2026), Páscoa 2026 (05/04/2026), Dia do Trabalho (01/05/2026), Dia das Mães 2026 (10/05/2026), Dia dos Namorados (12/06/2026), São João (24/06/2026), Dia dos Pais 2026 (09/08/2026), Dia das Crianças (12/10/2026), Finados (02/11/2026), Natal 2026 (25/12/2026)
  - Carnaval 2027 (16/02/2027), Páscoa 2027 (28/03/2027), Dia das Mães 2027 (09/05/2027), Dia dos Pais 2027 (08/08/2027), Natal 2027 (25/12/2027)
- [x] AC10: Migration aplicada ao remote via MCP `apply_migration` sem erros
- [x] AC11: Query de teste: `SELECT count(*) FROM datas_comemorativas;` → **15** ✅

## Escopo

**IN:**
- Migration SQL `031_controle_brindes.sql` completa (tabelas + RLS + indexes + seed)

**OUT:**
- Import dos dados da planilha Excel (Story 29.3)
- API routes (Story 29.2)
- UI (Story 29.3)
- Nenhuma alteração em tabelas existentes

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Gap de numeração (migrations 031 pode conflitar com remoto) | Baixa | Rodar `supabase migration list` antes de criar o arquivo para confirmar numeração |
| `is_admin_or_supervisor()` inclui role `obras` (migration 030) | Confirmado | Documentado no AC7 — para brindes, o role obras também pode escrever por ora; refinar se necessário |
| Seed com org_id hardcoded não funciona em outros ambientes | Média | Usar SELECT com `WHERE slug = 'trifold'` ao invés de UUID fixo |

## Dev Notes

### Arquivo de migration
**Nome:** `supabase/migrations/031_controle_brindes.sql`
**Última migration local existente:** `030_role_obras.sql`
**Verificar antes:** `supabase migration list` para confirmar numeração no remote

### Funções RLS disponíveis
Definidas em `supabase/migrations/004_rls_policies.sql` e atualizadas em migrations subsequentes:
- `public.user_org_id()` → retorna org_id do usuário autenticado atual
- `public.is_admin_or_supervisor()` → retorna true para roles admin, supervisor, obras (atualizado em 030_role_obras.sql)
- `public.user_role()` → retorna role do usuário atual

### Padrão de policy SELECT (leitura por org)
```sql
CREATE POLICY "select_own_org" ON tabela
  FOR SELECT USING (org_id = public.user_org_id());
```

### Padrão de policy ALL (escrita admin)
```sql
CREATE POLICY "admin_write" ON tabela
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());
```

### Seed portátil (usar SELECT para org_id)
```sql
INSERT INTO datas_comemorativas (id, org_id, nome, data)
SELECT
  gen_random_uuid(),
  o.id,
  'Natal 2026',
  '2026-12-25'::date
FROM organizations o
WHERE o.slug = 'trifold'
ON CONFLICT DO NOTHING;
```
Ou se usar UUID fixo para seed determinístico:
```sql
-- org_id da Trifold (seed.sql): '00000000-0000-0000-0000-000000000001'
```

### Endereços: tipos observados na planilha
A coluna `endereco_referencia` captura casos especiais:
- "OBRA COMUNIDADE", "OBRA FORTEGREEN", "OBRA MARIALVA", "OBRA YARDEN" → entrega na obra
- "SEDE TRIFOLD" → entrega na sede

Endereços residenciais usam `endereco_logradouro`, `endereco_cidade`, `endereco_estado`, `endereco_cep`.
Cidades presentes no dataset: Maringá-PR, Goioerê-PR, Sarandi-PR, Astorga-PR, Tamboara-PR, Querência do Norte-PR, Colorado-PR.

### Arquivos afetados
- `supabase/migrations/031_controle_brindes.sql` — CRIAR (novo)

### SQL completo sugerido para a migration
```sql
-- Migration 031: Controle de Entrega de Brindes
-- Story 29.1 — Epic 29

-- ============================================================
-- TABELA: datas_comemorativas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.datas_comemorativas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome              text        NOT NULL,
  data              date        NOT NULL,
  ativa             boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_datas_com_org_id
  ON public.datas_comemorativas (org_id);

ALTER TABLE public.datas_comemorativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "datas_com_select" ON public.datas_comemorativas
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "datas_com_write" ON public.datas_comemorativas
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());

-- ============================================================
-- TABELA: brindes_destinatarios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brindes_destinatarios (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  obra_nome             text        NOT NULL,
  tipo                  text        NOT NULL CHECK (tipo IN ('mae', 'pai', 'outro')),
  nome                  text        NOT NULL,
  observacao            text,
  endereco_logradouro   text,
  endereco_numero       text,
  endereco_complemento  text,
  endereco_bairro       text,
  endereco_cidade       text,
  endereco_estado       char(2),
  endereco_cep          text,
  endereco_referencia   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brindes_dest_org_id
  ON public.brindes_destinatarios (org_id);
CREATE INDEX IF NOT EXISTS idx_brindes_dest_obra_nome
  ON public.brindes_destinatarios (org_id, obra_nome);
CREATE INDEX IF NOT EXISTS idx_brindes_dest_cidade
  ON public.brindes_destinatarios (org_id, endereco_cidade);

ALTER TABLE public.brindes_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brindes_dest_select" ON public.brindes_destinatarios
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "brindes_dest_write" ON public.brindes_destinatarios
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());

-- ============================================================
-- TABELA: brindes_entregas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brindes_entregas (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  destinatario_id         uuid        NOT NULL REFERENCES public.brindes_destinatarios(id) ON DELETE CASCADE,
  data_comemorativa_id    uuid        NOT NULL REFERENCES public.datas_comemorativas(id) ON DELETE CASCADE,
  status                  text        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'entregue', 'nao_encontrado')),
  observacao_entrega      text,
  entregue_em             timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destinatario_id, data_comemorativa_id)
);

CREATE INDEX IF NOT EXISTS idx_brindes_ent_destinatario_id
  ON public.brindes_entregas (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_brindes_ent_data_id
  ON public.brindes_entregas (data_comemorativa_id);

ALTER TABLE public.brindes_entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brindes_ent_select" ON public.brindes_entregas
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "brindes_ent_write" ON public.brindes_entregas
  FOR ALL USING (org_id = public.user_org_id() AND public.is_admin_or_supervisor());

-- ============================================================
-- SEED: Datas comemorativas 2026 e 2027
-- ============================================================
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'trifold' LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.datas_comemorativas (id, org_id, nome, data) VALUES
    (gen_random_uuid(), v_org_id, 'Carnaval 2026',       '2026-03-03'),
    (gen_random_uuid(), v_org_id, 'Páscoa 2026',          '2026-04-05'),
    (gen_random_uuid(), v_org_id, 'Dia do Trabalho 2026', '2026-05-01'),
    (gen_random_uuid(), v_org_id, 'Dia das Mães 2026',    '2026-05-10'),
    (gen_random_uuid(), v_org_id, 'Dia dos Namorados 2026','2026-06-12'),
    (gen_random_uuid(), v_org_id, 'São João 2026',         '2026-06-24'),
    (gen_random_uuid(), v_org_id, 'Dia dos Pais 2026',    '2026-08-09'),
    (gen_random_uuid(), v_org_id, 'Dia das Crianças 2026','2026-10-12'),
    (gen_random_uuid(), v_org_id, 'Finados 2026',          '2026-11-02'),
    (gen_random_uuid(), v_org_id, 'Natal 2026',            '2026-12-25'),
    (gen_random_uuid(), v_org_id, 'Carnaval 2027',        '2027-02-16'),
    (gen_random_uuid(), v_org_id, 'Páscoa 2027',           '2027-03-28'),
    (gen_random_uuid(), v_org_id, 'Dia das Mães 2027',    '2027-05-09'),
    (gen_random_uuid(), v_org_id, 'Dia dos Pais 2027',    '2027-08-08'),
    (gen_random_uuid(), v_org_id, 'Natal 2027',            '2027-12-25')
  ON CONFLICT DO NOTHING;
END;
$$;
```

### Query de teste
```sql
SELECT count(*) FROM public.datas_comemorativas;
-- Esperado: >= 15

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('datas_comemorativas','brindes_destinatarios','brindes_entregas');
-- Esperado: 3 linhas
```

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não habilitado em `core-config.yaml`. Quality validation via revisão manual.

### Story Type Analysis
**Primary Type**: Database
**Secondary Type(s)**: N/A
**Complexity**: Medium — 3 novas tabelas, RLS em cada, seed com 15 registros

### Specialized Agent Assignment
**Primary Agents:**
- @data-engineer (schema design, RLS policies, seed SQL)
- @dev (execução da migration, query de teste)

**Supporting Agents:**
- @devops (aplicar migration ao remote via supabase db push)

### Quality Gate Tasks
- [x] Pre-Commit (@data-engineer): Rodar migration em dev local, conferir tabelas criadas e seed inserido
- [x] Pre-PR (@devops): Confirmar `supabase migration list` alinhado antes de push

## Tasks

- [x] 1. Rodar `supabase migration list` para confirmar que `031_` é o próximo número disponível
- [x] 2. Criar `supabase/migrations/031_controle_brindes.sql` com o SQL da seção Dev Notes
- [x] 3. Aplicar localmente: `supabase db push` (ou Management API se local não estiver configurado)
- [x] 4. Validar: `SELECT count(*) FROM datas_comemorativas;` retorna >= 15 → **resultado: 15** ✅
- [x] 5. Validar: as 3 tabelas aparecem em `information_schema.tables` → **3 tabelas** ✅
- [x] 6. Validar RLS: 6 policies confirmadas (SELECT + ALL em cada tabela) + 6 indexes ✅
- [x] 7. Aplicar ao remote de produção via `supabase db push --linked` → **aplicado via MCP apply_migration** ✅

## Estimativa: 3h

## Dependências

- Nenhuma (story fundação do Epic 29)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Files Modified
- `supabase/migrations/031_controle_brindes.sql` — CRIADO (migration completa: 3 tabelas + RLS + indexes + seed)

### Completion Notes
- Migration criada e aplicada ao remote via MCP `apply_migration` com sucesso
- Validação: `SELECT count(*) FROM datas_comemorativas` → 15 ✅
- Validação: 3 tabelas presentes em `information_schema.tables` ✅
- Validação: 6 RLS policies (SELECT + ALL por tabela) + 6 indexes ✅
- Seed usa `ON CONFLICT (org_id, nome) DO NOTHING` — idempotente ✅
- Constraint `UNIQUE(org_id, nome)` garante seed não duplica em re-run

## Change Log

| Data | Versão | Descrição | Agente |
|------|--------|-----------|--------|
| 2026-05-13 | 1.0 | Story criada — Epic 29 Controle de Brindes | @sm (River) |
| 2026-05-13 | 1.1 | Should-Fix aplicado: `UNIQUE(org_id, nome)` em `datas_comemorativas` para seed idempotente | @po (Pax) |
| 2026-05-13 | 1.2 | Implementação completa: migration criada e aplicada ao remote, 15 seeds, 3 tabelas, 6 policies, 6 indexes | @dev (Dex) |
