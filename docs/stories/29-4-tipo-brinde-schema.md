# Story 29.4 — DB Schema: Tabela `brindes_tipos` + FK em `brindes_entregas`

## Status: Ready for Review

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@qa"
quality_gate_tools: ["supabase migration list", "supabase db push", "psql query test"]

## Story

**Como** administrador do Trifold CRM,
**Quero** ter uma tabela `brindes_tipos` para cadastrar os tipos de brinde com atributos como tamanho e cor, e associar esse tipo às entregas em `brindes_entregas`,
**Para que** a equipe possa registrar exatamente qual brinde foi entregue a cada destinatário em cada data comemorativa.

## Contexto

Extensão do Epic 29 (Controle de Brindes). As stories 29.1-29.3 implementaram o sistema base. Esta story adiciona o catálogo de tipos de brinde e vincula ao registro de entrega.

A associação é feita em `brindes_entregas` (não em `brindes_destinatarios`) porque o brinde entregue pode variar por data comemorativa para o mesmo destinatário.

**Próxima migration após:** `035_materialize_meta_campaign_roas_remote_only.sql` → usar `036_brindes_tipos.sql`

## Acceptance Criteria

- [x] AC1: Arquivo `supabase/migrations/036_brindes_tipos.sql` criado
- [x] AC2: Tabela `brindes_tipos` criada com colunas:
  - `id` uuid PK DEFAULT gen_random_uuid()
  - `org_id` uuid FK organizations(id) NOT NULL
  - `nome` text NOT NULL — ex: "Cesta Básica", "Kit Vinho", "Brinquedo"
  - `descricao` text NULL
  - `tamanho` text NULL — ex: "P", "M", "G", "GG" ou texto livre
  - `cor` text NULL — ex: "Vermelho", "Azul"
  - `ativo` boolean NOT NULL DEFAULT true
  - `created_at` timestamptz DEFAULT now()
  - `updated_at` timestamptz DEFAULT now()
  - UNIQUE(org_id, nome)
- [x] AC3: Coluna `brinde_tipo_id` uuid NULL FK brindes_tipos(id) ON DELETE SET NULL adicionada à tabela `brindes_entregas`
- [x] AC4: RLS habilitada em `brindes_tipos` com `ALTER TABLE brindes_tipos ENABLE ROW LEVEL SECURITY`
- [x] AC5: Policy SELECT em `brindes_tipos`: qualquer autenticado da org pode ler (`org_id = public.user_org_id()`)
- [x] AC6: Policy INSERT/UPDATE/DELETE em `brindes_tipos`: somente admin/supervisor (`public.is_admin_or_supervisor()`)
- [x] AC7: Indexes criados: `idx_brindes_tipos_org_id` em brindes_tipos(org_id), `idx_brindes_entregas_tipo_id` em brindes_entregas(brinde_tipo_id) WHERE brinde_tipo_id IS NOT NULL
- [x] AC8: Migration aplicada ao remote via MCP `apply_migration` sem erros
- [x] AC9: Query de verificação: `SELECT column_name FROM information_schema.columns WHERE table_name = 'brindes_entregas' AND column_name = 'brinde_tipo_id';` → retorna 1 linha ✅

## Escopo

**IN:**
- Migration SQL `036_brindes_tipos.sql` (nova tabela + ALTER TABLE brindes_entregas + RLS + indexes)

**OUT:**
- API routes (Story 29.5)
- UI (Story 29.6)
- Nenhuma alteração em dados existentes de brindes_entregas (coluna nullable, sem impacto)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Conflito de numeração de migration | Baixa | Verificar `ls supabase/migrations/` antes de criar o arquivo |
| FK ON DELETE SET NULL em brindes_entregas pode causar inconsistência | Baixa | ON DELETE SET NULL é seguro — entrega fica sem tipo se tipo for deletado |

## Dev Notes

### Arquivo de migration
**Nome:** `supabase/migrations/036_brindes_tipos.sql`
**Verificar antes:** `ls supabase/migrations/ | tail -5` para confirmar que 035 é a última

### Funções RLS disponíveis (de 004_rls_policies.sql + 030_role_obras.sql)
- `public.user_org_id()` → retorna org_id do usuário autenticado
- `public.is_admin_or_supervisor()` → retorna true para roles admin, supervisor, obras

### Padrão da tabela (baseado em brindes_tipos análogo a datas_comemorativas)
```sql
CREATE TABLE brindes_tipos (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  descricao     text,
  tamanho       text,
  cor           text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, nome)
);

ALTER TABLE brindes_tipos ENABLE ROW LEVEL SECURITY;
```

### ALTER TABLE para brindes_entregas
```sql
ALTER TABLE brindes_entregas
  ADD COLUMN brinde_tipo_id uuid REFERENCES brindes_tipos(id) ON DELETE SET NULL;
```

### Padrão de RLS (baseado em 031_controle_brindes.sql)
```sql
CREATE POLICY "brindes_tipos_select" ON brindes_tipos
  FOR SELECT USING (org_id = public.user_org_id());

CREATE POLICY "brindes_tipos_write" ON brindes_tipos
  FOR ALL USING (public.is_admin_or_supervisor());
```

## Tasks / Subtasks

- [x] Task 1: Verificar última migration (`ls supabase/migrations/ | tail -5`) e confirmar numeração 036 (AC1)
- [x] Task 2: Criar `supabase/migrations/036_brindes_tipos.sql` com CREATE TABLE brindes_tipos (AC2)
- [x] Task 3: Adicionar ALTER TABLE brindes_entregas ADD COLUMN brinde_tipo_id na migration (AC3)
- [x] Task 4: Adicionar RLS e policies para brindes_tipos na migration (AC4, AC5, AC6)
- [x] Task 5: Adicionar CREATE INDEX para os 2 novos indexes (AC7)
- [x] Task 6: Aplicar migration via MCP apply_migration e verificar sem erros (AC8)
- [x] Task 7: Executar query de verificação da coluna em brindes_entregas (AC9)

## File List

- `supabase/migrations/036_brindes_tipos.sql` — criado

## 🤖 CodeRabbit Integration

### Story Type Analysis
- **Primary Type:** Database
- **Complexity:** Low (nova tabela + ALTER TABLE nullable, sem impacto em dados existentes)

### Specialized Agent Assignment
- **Primary:** @data-engineer (schema design, SQL review)
- **Supporting:** @dev (verificação de impacto na API existente)

### Quality Gate Tasks
- [ ] Pre-Commit (@data-engineer): Revisar SQL antes de aplicar migration
- [ ] Pre-PR (@devops): Verificar migration reversível e sem quebras

### CodeRabbit Focus Areas
- Migration safety: coluna nullable não quebra dados existentes
- RLS policies: padrão consistente com 031_controle_brindes.sql
- Index coverage: brinde_tipo_id indexado com partial index (WHERE NOT NULL)
