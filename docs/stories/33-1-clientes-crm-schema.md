# Story 33.1 — Schema: tabela `clientes` + `clientes_obras_vinculos`

## Status: Ready for Review

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@dev"
quality_gate_tools: ["supabase db push", "supabase migration list", "manual RLS test"]

## Story

**Como** engenheiro de dados do Trifold CRM,
**Quero** criar as tabelas `clientes` e `clientes_obras_vinculos` com RLS e índices corretos,
**Para que** o módulo CRM de clientes tenha uma base de dados sólida, isolada por org_id e pronta para suportar as APIs das stories seguintes.

## Contexto

Esta é a story fundacional do Epic 33. Sem ela, nenhuma outra story do epic pode ser implementada.

**Entidades existentes que NÃO devem ser duplicadas ou alteradas:**
- `users` com `role = 'cliente'` — portal users (acesso ao portal do cliente)
- `cliente_obras` — vínculo user_id ↔ obra_id para autorização no portal
- `obras` — empreendimentos

As novas tabelas são entidades CRM separadas: `clientes` (ficha completa) e `clientes_obras_vinculos` (cliente_id ↔ obra_id). Um cliente CRM pode ou não ter um user correspondente — sem FK obrigatória entre eles.

**Migration file:** `supabase/migrations/041_clientes_crm.sql`

(O arquivo 040 já existe: `040_brinde_tipo_id_destinatario.sql`. O próximo número disponível é 041.)

## Acceptance Criteria

- [x] AC1: Tabela `clientes` criada com todos os campos especificados (id, org_id, nome, cpf, rg, email, telefone, whatsapp, data_nascimento, estado_civil, profissao, campos de endereço, observacao, created_at, updated_at)
- [x] AC2: Tabela `clientes_obras_vinculos` criada com campos: id, cliente_id (FK clientes ON DELETE CASCADE), obra_id (FK obras ON DELETE CASCADE), numero_unidade, created_at; constraint UNIQUE(cliente_id, obra_id)
- [x] AC3: RLS habilitado em `clientes` com políticas: SELECT/INSERT/UPDATE/DELETE requerem `is_admin_or_supervisor()` e `org_id = auth.jwt() -> 'org_id'`
- [x] AC4: RLS habilitado em `clientes_obras_vinculos` com política de acesso via JOIN em clientes (acesso permitido quando o cliente pertence à org do usuário autenticado)
- [x] AC5: Índices criados: `clientes(org_id)`, `clientes(email)`, `clientes_obras_vinculos(cliente_id)`, `clientes_obras_vinculos(obra_id)`
- [x] AC6: Trigger `updated_at` configurado para `clientes` (mesmo padrão das outras tabelas do projeto)
- [ ] AC7: Migration aplicada sem erros em ambiente de desenvolvimento (`supabase migration list` mostra 041 como applied) — *deferred: aplicada via MCP pelo agente orquestrador*
- [x] AC8: Rollback seguro: migration usa `CREATE TABLE IF NOT EXISTS` e `CREATE INDEX IF NOT EXISTS`

## Escopo

**IN:**
- Arquivo `supabase/migrations/041_clientes_crm.sql`
- Tabela `clientes` com todos os campos e RLS
- Tabela `clientes_obras_vinculos` com FK e RLS
- Índices de performance nas colunas de filtro

**OUT:**
- Tabela `brindes_destinatarios.cliente_id` FK — isso é migration 042, entregue na Story 33.5
- Qualquer alteração em `users`, `cliente_obras` ou `obras`
- Seed data de exemplo
- Código TypeScript ou API routes

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Conflito de nome com tabela existente `clientes` | Baixa | Verificar `\dt clientes` antes de aplicar; usar `CREATE TABLE IF NOT EXISTS` |
| RLS de `clientes_obras_vinculos` com policy complexa via JOIN | Média | Usar subquery: `EXISTS (SELECT 1 FROM clientes c WHERE c.id = cliente_id AND c.org_id = (auth.jwt() ->> 'org_id')::uuid)` |
| Número de migration conflitando | Baixa | 040 é o último arquivo confirmado; usar 041 |

## Dev Notes

### Padrão de migration do projeto

Seguir o padrão dos arquivos existentes. Exemplo de referência: `supabase/migrations/036_brindes_tipos.sql`.

Estrutura esperada do arquivo:
```sql
-- migration: 041_clientes_crm.sql
-- description: Tabelas clientes e clientes_obras_vinculos para o CRM

-- Tabela principal de clientes CRM
CREATE TABLE IF NOT EXISTS clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Dados pessoais
  nome varchar(255) NOT NULL,
  cpf varchar(14),
  rg varchar(20),
  email varchar(255),
  telefone varchar(20),
  whatsapp varchar(20),
  data_nascimento date,
  estado_civil varchar(50),
  profissao varchar(100),
  -- Endereço
  endereco_logradouro varchar(255),
  endereco_numero varchar(20),
  endereco_complemento varchar(100),
  endereco_bairro varchar(100),
  endereco_cidade varchar(100),
  endereco_estado varchar(2),
  endereco_cep varchar(10),
  endereco_referencia text,
  -- CRM
  observacao text,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Vínculos cliente ↔ obra (CRM — separado de cliente_obras do portal)
CREATE TABLE IF NOT EXISTS clientes_obras_vinculos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  numero_unidade text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, obra_id)
);
```

### RLS pattern (seguir padrão de `brindes_destinatarios`)

Verificar a função `is_admin_or_supervisor()` no schema existente — ela já existe e é usada em outras tabelas. Aplicar o mesmo padrão:

```sql
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_org_isolation" ON clientes
  FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid AND is_admin_or_supervisor());

ALTER TABLE clientes_obras_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_obras_vinculos_via_cliente" ON clientes_obras_vinculos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = cliente_id
        AND c.org_id = (auth.jwt() ->> 'org_id')::uuid
        AND is_admin_or_supervisor()
    )
  );
```

### Trigger updated_at

Verificar se a função `trigger_set_timestamp()` já existe no schema (ela é reutilizável). Aplicar:

```sql
CREATE TRIGGER set_clientes_updated_at
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();
```

### Índices

```sql
CREATE INDEX IF NOT EXISTS clientes_org_id_idx ON clientes(org_id);
CREATE INDEX IF NOT EXISTS clientes_email_idx ON clientes(email);
CREATE INDEX IF NOT EXISTS clientes_obras_vinculos_cliente_id_idx ON clientes_obras_vinculos(cliente_id);
CREATE INDEX IF NOT EXISTS clientes_obras_vinculos_obra_id_idx ON clientes_obras_vinculos(obra_id);
```

### Testing

Não há testes unitários para migrations. Validar manualmente:
1. `supabase db push` — sem erros
2. `supabase migration list` — 041 aparece como applied
3. Testar RLS com usuário admin: INSERT e SELECT devem funcionar
4. Testar UNIQUE constraint: tentar inserir mesmo (cliente_id, obra_id) duas vezes

## Tasks / Subtasks

- [x] Task 1: Criar arquivo `supabase/migrations/041_clientes_crm.sql` com DDL das duas tabelas (AC1, AC2)
- [x] Task 2: Adicionar RLS em `clientes` com policy de org_id isolation e `is_admin_or_supervisor()` (AC3)
- [x] Task 3: Adicionar RLS em `clientes_obras_vinculos` via subquery EXISTS em clientes (AC4)
- [x] Task 4: Adicionar trigger `updated_at` em `clientes` (AC6)
- [x] Task 5: Adicionar índices nas 4 colunas especificadas (AC5)
- [ ] Task 6: Aplicar migration com `supabase db push` e verificar `supabase migration list` (AC7, AC8) — *deferred: aplicada via MCP pelo agente orquestrador*

## File List

- `supabase/migrations/041_clientes_crm.sql` — criado (DDL clientes + clientes_obras_vinculos, RLS canônica com `public.user_org_id()` + `public.is_admin_or_supervisor()`, trigger `update_updated_at()`, 4 índices)

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation usará processo de revisão manual.

### Story Type Analysis
- **Primary Type:** Database
- **Secondary Type:** Security (RLS)
- **Complexity:** Low (schema puro, sem lógica de aplicação)

### Specialized Agent Assignment
- **Primary:** @data-engineer
- **Supporting:** @dev (quality gate — revisar SQL e RLS antes de aplicar em produção)

### Quality Gate Tasks
- [ ] Pre-Commit (@data-engineer): `supabase db push` sem erros — *deferred: aplicação via MCP pelo orquestrador*
- [ ] Pre-Commit (@data-engineer): Verificar RLS com teste manual de INSERT/SELECT por org — *deferred: validação pós-aplicação*
- [ ] Pre-PR (@devops): Confirmar que migration 041 não conflita com outros branches em aberto

### CodeRabbit Focus Areas
- RLS policies: org_id isolation em todas as tabelas
- Constraint UNIQUE em clientes_obras_vinculos
- ON DELETE CASCADE nas FKs
- IF NOT EXISTS em todos os CREATE TABLE/INDEX

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-15 | 1.0 | Story criada | @sm (River) |
| 2026-05-15 | 1.1 | Validada @po (GO 7/10). Status Draft → Ready. CORREÇÕES OBRIGATÓRIAS na implementação: (1) RLS pattern divergente — usar `org_id = public.user_org_id() AND public.is_admin_or_supervisor()` em vez de `auth.jwt() ->> 'org_id'` (padrão canônico confirmado em 007_unit_sales.sql, 008_followup.sql, 015_meta_marketing_api.sql); (2) trigger function correta é `update_updated_at()` (não `trigger_set_timestamp()`) — confirmado em 001_base_schema.sql linhas 288-292 e 002_property_schema.sql linhas 227-231. | @po (Pax) |
| 2026-05-15 | 1.2 | Implementação YOLO @dev. Criado `supabase/migrations/041_clientes_crm.sql` com ambas as correções obrigatórias aplicadas: (1) RLS usando `public.user_org_id()` + `public.is_admin_or_supervisor()` (padrão split SELECT/manage de 007_unit_sales.sql); (2) trigger `update_updated_at()`. RLS de `clientes_obras_vinculos` via EXISTS JOIN em clientes. AC7 (db push) e Task 6 deferidos — migration será aplicada via MCP pelo orquestrador. Status Ready → Ready for Review. | @dev (Dex) |
