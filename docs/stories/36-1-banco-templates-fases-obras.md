# Story 36-1: Banco de Templates de Fases de Obras

## Status
Ready for Review

## Complexity
M (Medium) — nova tabela DB + migration com seed + server action + UI picker inline no form existente + auto-save de novas fases no banco

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint"]
```

## Story

**As a** administrador ou colaborador que gerencia obras,
**I want** ter um banco de templates de fases/etapas disponível ao criar fases em qualquer obra,
**so that** não precise digitar nomes e etapas já usados anteriormente, e que novas fases criadas do zero fiquem disponíveis para uso futuro em outras obras.

## Acceptance Criteria

1. Existe uma tabela `obra_fase_templates` no Supabase com colunas: `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`, `org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`, `nome text NOT NULL`, `etapa text NOT NULL`, `created_at timestamptz DEFAULT now()`. Constraint UNIQUE em `(org_id, nome, etapa)`. RLS: SELECT aberto para todos os membros da mesma org (`org_id = public.user_org_id()`); INSERT/UPDATE/DELETE bypassa via admin client no server (sem policy restritiva necessária).

2. A migration `050_obra_fase_templates.sql` cria a tabela e faz seed com todas as fases distintas da obra Yarden (`obra_id = 'ba344a5e-6bd6-4a08-8f9f-0405992b0b34'`) usando `INSERT ... SELECT DISTINCT FROM obra_fases WHERE obra_id = '...' ON CONFLICT DO NOTHING`. O campo `nome` do template vem de `obra_fases.name` e o campo `etapa` vem de `obra_fases.description`.

3. Existe um arquivo `packages/web/src/app/api/admin/obras/[obra_id]/fases/route.ts` (já existente) modificado para: ao criar uma fase com sucesso (POST), fazer `upsert` em `obra_fase_templates` com `(org_id, nome=body.name, etapa=body.description)` usando `adminSupabase` com `onConflict: 'org_id,nome,etapa'` e `ignoreDuplicates: true`. Isso garante que toda fase nova criada do zero vira template automaticamente.

4. Existe um arquivo `packages/web/src/app/api/admin/obras/fases/templates/route.ts` com GET que retorna os templates da org do usuário autenticado, ordenados por `etapa ASC, nome ASC`. Retorna `{ templates: Array<{ id, nome, etapa }> }`.

5. O componente `packages/web/src/app/dashboard/obras/[obra_id]/_components/fase-create-form.tsx` tem um botão "Escolher do banco" posicionado abaixo do campo "Nome da fase". Ao clicar, expande uma área inline (não modal separado) com:
   - Input de busca (filtra por nome e etapa, case-insensitive, client-side)
   - Lista dos templates agrupados por etapa, exibindo nome da fase em cada grupo
   - Loading state enquanto busca da API
   - Estado de vazio ("Nenhum template encontrado") se lista vazia ou busca sem resultado
   - Ao clicar em um template: fecha a área, pré-preenche `name` com `template.nome` e `description` com `template.etapa`

6. A área de templates só faz o fetch da API na primeira vez que o botão "Escolher do banco" é clicado (lazy load). Abrir e fechar sem selecionar não refaz o fetch.

7. O botão "Escolher do banco" exibe o texto "Escolher do banco" quando fechado e "Fechar banco" quando aberto.

## Scope

### IN
- Tabela `obra_fase_templates` + migration 050 com seed da Yarden
- API route GET `/api/admin/obras/fases/templates`
- Auto-save no POST `/api/admin/obras/[obra_id]/fases` existente
- UI picker inline no `fase-create-form.tsx` existente
- Busca client-side no picker

### OUT
- Gerenciamento manual do banco (adicionar/editar/excluir templates via UI dedicada)
- Templates globais entre orgs (cada org tem seu banco privado)
- Templates para outros tipos de cadastro além de fases de obras

## Dependencies
- Story 35-6 (Done) — não há dependência técnica direta, mas está no mesmo epic
- Tabela `organizations` deve existir (confirmado: migration 049 usa `REFERENCES organizations(id)`)
- Tabela `obra_fases` deve existir com colunas `name`, `description`, `org_id` (confirmado pelo código do API route existente)

## Dev Notes

### Schema da tabela alvo
```sql
-- obra_fases (existente)
-- name: "Nome da fase" (e.g. "Plantas internas")
-- description: "Etapa" / grupo (e.g. "PAISAGISMO")
-- Mapeamento para templates: nome ← name, etapa ← description
```

### Migration 050 — SQL completo
```sql
CREATE TABLE IF NOT EXISTS obra_fase_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  etapa text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT obra_fase_templates_org_nome_etapa_unique UNIQUE (org_id, nome, etapa)
);

ALTER TABLE obra_fase_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read their templates"
  ON obra_fase_templates
  FOR SELECT
  USING (org_id = public.user_org_id());

-- Seed com fases da obra Yarden (ba344a5e-6bd6-4a08-8f9f-0405992b0b34)
INSERT INTO obra_fase_templates (org_id, nome, etapa, created_at)
SELECT DISTINCT
  f.org_id,
  f.name AS nome,
  f.description AS etapa,
  now() AS created_at
FROM obra_fases f
WHERE f.obra_id = 'ba344a5e-6bd6-4a08-8f9f-0405992b0b34'
  AND f.name IS NOT NULL
  AND f.description IS NOT NULL
ON CONFLICT (org_id, nome, etapa) DO NOTHING;
```

### API route de templates — `/api/admin/obras/fases/templates/route.ts`
```typescript
// GET — retorna templates da org ordenados por etapa ASC, nome ASC
// Usar createAdminClient() para ignorar RLS (query roda no server)
// Retornar { templates: Array<{ id, nome, etapa }> }
// Auth: requireAuth() + ALLOWED_ROLES check (admin, supervisor, obras)
```

### Auto-save no POST de fases (modificação no route.ts existente)
```typescript
// Após o insert da fase com sucesso:
await adminSupabase
  .from("obra_fase_templates")
  .upsert(
    { org_id: obra.org_id, nome: name, etapa: body.description ?? "" },
    { onConflict: "org_id,nome,etapa", ignoreDuplicates: true }
  )
// Só upsert se body.description não for null/vazio
// Erros nesse upsert NÃO devem falhar a request (só logar)
```

### Picker UI — estrutura no fase-create-form.tsx
- Estado: `showPicker: boolean`, `templates: Template[] | null`, `loadingTemplates: boolean`, `search: string`
- Botão "Escolher do banco" togla `showPicker`
- Ao abrir e `templates === null`: fetch `/api/admin/obras/fases/templates` → setar `templates`
- Filtro: `templates.filter(t => t.nome.toLowerCase().includes(search) || t.etapa.toLowerCase().includes(search))`
- Agrupamento: `Object.groupBy` ou `reduce` por `etapa`
- Ao selecionar template: `setName(t.nome); setDescription(t.etapa); setShowPicker(false); setSearch("")`
- ATENÇÃO Next.js: fetch deve usar credenciais padrão (cookies), não server action, pois está dentro de Client Component sem o arquivo de actions separado

### Padrão de importação — IMPORTANTE
Este form é `"use client"`. O fetch dos templates usa `fetch("/api/...")` diretamente (não server action), para evitar o problema de `"use server"` inline em client components documentado nos feedbacks do projeto.

## Tasks

- [x] 1. Criar migration `supabase/migrations/050_obra_fase_templates.sql` com criação da tabela, RLS e seed da Yarden
- [x] 2. Criar API route `packages/web/src/app/api/admin/obras/fases/templates/route.ts` (GET)
- [x] 3. Modificar `packages/web/src/app/api/admin/obras/[obra_id]/fases/route.ts` para upsert no banco de templates após criar fase com sucesso
- [x] 4. Modificar `fase-create-form.tsx` para adicionar botão "Escolher do banco", estado do picker e UI inline de seleção com busca
- [x] 5. Executar `npm run typecheck` e `npm run lint` e corrigir todos os erros

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- `.catch()` inválido no PostgrestFilterBuilder — substituído por try/catch
- Seed retornou 42 templates, 19 grupos (nome = categoria, etapa = fase específica)

### Completion Notes
- Migration 050 aplicada com sucesso no Supabase Trifold
- Picker agrupa por `nome` (categoria, ex: "INFRAESTRUTURA") mostrando `etapa` dentro de cada grupo
- fetch direto `/api/admin/obras/fases/templates` (sem server action) conforme padrão do projeto
- ignoreDuplicates: true no upsert para evitar updates desnecessários no auto-save

## File List

- `supabase/migrations/050_obra_fase_templates.sql` (criado)
- `packages/web/src/app/api/admin/obras/fases/templates/route.ts` (criado)
- `packages/web/src/app/api/admin/obras/[obra_id]/fases/route.ts` (modificado — auto-save)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/fase-create-form.tsx` (modificado — picker)

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-20 | @sm | Story criada |
| 2026-05-20 | @dev | Implementação completa — migration aplicada, API route, auto-save, picker UI |
