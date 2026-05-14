# Story 31.1 — DB Schema: Tabela de Aprovações de Uploads

## Status: Ready for Review

## Executor Assignment
executor: "@data-engineer"
quality_gate: "@dev"
quality_gate_tools: ["supabase migration list", "supabase db push", "psql query test"]

## Story

**Como** administrador do Trifold CRM,
**Quero** ter uma tabela `obra_upload_aprovacoes` no banco de dados para registrar uploads enviados pelo perfil `obras` que aguardam aprovação,
**Para que** o fluxo de aprovação das Stories 31.2 e 31.3 tenha uma fundação sólida de dados com RLS correta e rastreabilidade completa.

## Contexto

Fundação do Epic 31. Migration número `033_obra_upload_aprovacoes.sql` (próxima após `032_user_theme.sql`).

Quando um usuário com role `obras` faz upload de foto ou documento, o arquivo é salvo no Supabase Storage mas **não** deve ser inserido diretamente em `obra_fotos` ou `obra_documentos`. Em vez disso, deve existir um registro em `obra_upload_aprovacoes` com `status = 'pendente'`. A Story 31.2 modifica as API routes para usar essa tabela; a Story 31.3 cria a UI de aprovação.

**Notas críticas:**
- A função `public.is_admin_or_supervisor()` já existe em `supabase/migrations/004_rls_policies.sql` e foi estendida para incluir `obras` em `030_role_obras.sql`. A policy de escrita desta tabela deve usar `public.is_admin_or_supervisor()` para admins/supervisors aprovarem, MAS o role `obras` também deve poder inserir seus próprios uploads pendentes.
- O campo `metadata` é jsonb porque a estrutura difere entre fotos (caption, fase_id, taken_at) e documentos (name, filename, category, file_size_bytes).
- O campo `storage_path` referencia o arquivo já no Supabase Storage. Ao rejeitar, o arquivo deve ser removido do storage pela API (Story 31.2).

**Buckets de storage existentes:**
- `obra-fotos` — para fotos
- `obra-docs` — para documentos

## Acceptance Criteria

- [x] AC1: Arquivo `supabase/migrations/033_obra_upload_aprovacoes.sql` criado
- [x] AC2: Tabela `obra_upload_aprovacoes` criada com colunas:
  - `id` (uuid PK DEFAULT gen_random_uuid())
  - `org_id` (uuid NOT NULL FK → organizations ON DELETE CASCADE)
  - `obra_id` (uuid NOT NULL FK → obras ON DELETE CASCADE)
  - `tipo` (text NOT NULL CHECK IN ('foto', 'documento'))
  - `storage_path` (text NOT NULL) — caminho no Supabase Storage
  - `storage_bucket` (text NOT NULL) — nome do bucket ('obra-fotos' ou 'obra-docs')
  - `metadata` (jsonb NOT NULL DEFAULT '{}') — dados específicos do tipo (foto: caption/fase_id/taken_at; doc: name/filename/category/file_size_bytes)
  - `status` (text NOT NULL DEFAULT 'pendente' CHECK IN ('pendente', 'aprovado', 'rejeitado'))
  - `enviado_por` (uuid NOT NULL FK → users ON DELETE RESTRICT) — não permite excluir usuário com uploads pendentes
  - `aprovado_por` (uuid NULL FK → users ON DELETE SET NULL) — NULL até revisão
  - `motivo_rejeicao` (text NULL) — preenchido somente ao rejeitar
  - `created_at` (timestamptz NOT NULL DEFAULT now())
  - `reviewed_at` (timestamptz NULL) — preenchido ao aprovar ou rejeitar
- [x] AC3: RLS habilitada: `ALTER TABLE public.obra_upload_aprovacoes ENABLE ROW LEVEL SECURITY`
- [x] AC4: Policy de SELECT para toda a org:
  ```sql
  CREATE POLICY "aprovacoes_select" ON public.obra_upload_aprovacoes
    FOR SELECT USING (org_id = public.user_org_id());
  ```
- [x] AC5: Policy de INSERT restrita ao próprio usuário (role obras insere seus uploads):
  ```sql
  CREATE POLICY "aprovacoes_insert" ON public.obra_upload_aprovacoes
    FOR INSERT WITH CHECK (
      org_id = public.user_org_id()
      AND enviado_por = public.public_user_id()
    );
  ```
- [x] AC6: Policy de UPDATE restrita a admin/supervisor SOMENTE (role `obras` NÃO pode aprovar — usar subquery inline, NÃO `is_admin_or_supervisor()` pois ela inclui `obras`):
  ```sql
  CREATE POLICY "aprovacoes_update" ON public.obra_upload_aprovacoes
    FOR UPDATE USING (
      org_id = public.user_org_id()
      AND EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_id = auth.uid() AND role IN ('admin', 'supervisor')
      )
    );
  ```
- [x] AC7: Policy de DELETE restrita a admin/supervisor SOMENTE (mesma lógica do AC6):
  ```sql
  CREATE POLICY "aprovacoes_delete" ON public.obra_upload_aprovacoes
    FOR DELETE USING (
      org_id = public.user_org_id()
      AND EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_id = auth.uid() AND role IN ('admin', 'supervisor')
      )
    );
  ```
- [x] AC8: Indexes criados:
  - `idx_obra_upload_apr_org_id` ON (org_id)
  - `idx_obra_upload_apr_obra_id` ON (obra_id)
  - `idx_obra_upload_apr_status` ON (status)
  - `idx_obra_upload_apr_enviado_por` ON (enviado_por)
  - `idx_obra_upload_apr_org_status` ON (org_id, status) — para badge global
- [x] AC9: Comentário no topo da migration explica o propósito e referencia Story 31.1 e Epic 31
- [x] AC10: Migration aplicada ao remote via MCP `apply_migration` sem erros
- [x] AC11: Query de validação executada sem erros:
  ```sql
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'obra_upload_aprovacoes'
  ORDER BY ordinal_position;
  ```
  Deve retornar as 14 colunas definidas no AC2.

## Escopo

**IN:**
- Criação da tabela `obra_upload_aprovacoes`
- RLS e policies de acesso
- Indexes de performance
- Migration SQL aplicada ao remote

**OUT:**
- Modificação das API routes de upload (Story 31.2)
- UI do painel de aprovações (Story 31.3)
- Seed de dados
- Alteração de tabelas `obra_fotos` ou `obra_documentos`

## Dependências

- **Requer:** Migration `030_role_obras.sql` aplicada (função `is_admin_or_supervisor()` já inclui `obras`)
- **Depende de tabelas:** `public.organizations`, `public.obras`, `public.users`
- **Bloqueia:** Story 31.2 (API) e Story 31.3 (UI)

## Dev Notes

### Padrão de Migration Existente
```sql
-- Cabeçalho padrão (ver 031_controle_brindes.sql):
-- Migration 033: Aprovação de Uploads do Perfil Obras
-- Story 31.1 — Epic 31

CREATE TABLE IF NOT EXISTS public.obra_upload_aprovacoes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  obra_id           uuid        NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  ...
);
```

### Função RLS existente
```sql
-- 004_rls_policies.sql (atualizada em 030_role_obras.sql):
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role IN ('admin', 'supervisor', 'obras')
  );
$$ LANGUAGE sql SECURITY DEFINER;
```
**ATENÇÃO:** A função atual inclui `obras` para operações de escrita nas tabelas de obras. Para a policy de UPDATE/DELETE desta tabela (aprovações), precisamos que somente `admin` e `supervisor` possam aprovar. Criar uma função auxiliar nova `public.is_admin_or_supervisor_strict()` que verifica `role IN ('admin', 'supervisor')` APENAS, ou usar uma subquery inline na policy para evitar criar função redundante.

**Solução recomendada (sem nova função):**
```sql
CREATE POLICY "aprovacoes_update" ON public.obra_upload_aprovacoes
  FOR UPDATE USING (
    org_id = public.user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
    )
  );
```

### Metadata por tipo
```json
// Foto:
{
  "caption": "string | null",
  "fase_id": "uuid | null",
  "taken_at": "ISO8601 | null"
}

// Documento:
{
  "name": "string",
  "filename": "string",
  "category": "ART/RRT | Contratos | Memoriais | Outros",
  "file_size_bytes": 12345
}
```

### Arquivo da migration
- **Path:** `supabase/migrations/033_obra_upload_aprovacoes.sql`
- **Número:** 033 (após 032_user_theme.sql)

## Tasks / Subtasks

- [x] Task 1 (AC1, AC2): Criar `supabase/migrations/033_obra_upload_aprovacoes.sql` com a tabela completa, todas as colunas, constraints e foreign keys (AC1→AC2)
- [x] Task 2 (AC3, AC4, AC5, AC6, AC7): Adicionar RLS + 4 policies na migration — SELECT para org, INSERT para próprio usuário, UPDATE/DELETE somente admin/supervisor strict (sem incluir obras)
- [x] Task 3 (AC8): Adicionar os 5 indexes na migration
- [x] Task 4 (AC9): Adicionar comentário de cabeçalho com propósito e referência à story/epic
- [x] Task 5 (AC10): Aplicar migration via MCP Supabase `apply_migration`
- [x] Task 6 (AC11): Executar query de validação — 13 colunas confirmadas (AC11 dizia "14" por erro de contagem; AC2 define exatamente 13)

## Checklist Pré-Commit

- [x] Migration segue padrão `CREATE TABLE IF NOT EXISTS` (idempotente)
- [x] Todas as FKs usam `ON DELETE CASCADE` ou `ON DELETE SET NULL` ou `ON DELETE RESTRICT` conforme lógica de negócio
- [x] RLS habilitada antes de criar policies
- [x] Policy de UPDATE/DELETE usa subquery inline com `auth_id = auth.uid()` (NÃO `is_admin_or_supervisor()`) para excluir role `obras` das aprovações
- [x] Indexes criados com `IF NOT EXISTS`
- [x] Migration aplicada sem erros no remote

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: Database
- Secondary Type(s): N/A
- Complexity: Medium (single table, RLS com lógica de role granular)

**Specialized Agent Assignment:**
- Primary Agents: @data-engineer, @dev
- Supporting Agents: N/A

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Validar SQL antes de aplicar
- [ ] Pre-PR (@devops): Confirmar migration aplicada no remote

**CodeRabbit Focus Areas:**
- Primary Focus:
  - RLS policies: verificar que role `obras` NÃO consegue aprovar/rejeitar (UPDATE/DELETE bloqueado)
  - Migration safety: `IF NOT EXISTS`, sem DROP sem fallback
  - FK constraints com comportamento ON DELETE correto
- Secondary Focus:
  - Index coverage para queries de badge global (org_id, status)
  - Metadata jsonb — sem tipagem forçada (flexibilidade intencional)

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Severity Filter: CRITICAL only

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-14 | @sm (River) | Story criada — Draft |
| 2026-05-14 | @po (Pax) | Validação 10-pt: 8/10 GO — AC6/AC7 corrigidos (subquery inline em vez de is_admin_or_supervisor()); FK enviado_por corrigida para ON DELETE RESTRICT; status → Ready |
| 2026-05-14 | @dev (Dex) | Implementação concluída — migration 033 criada e aplicada; 13 colunas, 5 indexes, 4 policies RLS validadas no remote; correção: INSERT usa public_user_id() e policies usam auth_id=auth.uid(); status → Ready for Review |
