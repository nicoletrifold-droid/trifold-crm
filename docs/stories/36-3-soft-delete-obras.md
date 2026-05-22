# Story 36-3: Soft Delete de Obras com Confirmação Admin-Only

## Status
InReview

## Complexity
M (Medium) — migration simples + DELETE handler + componente modal de confirmação + filtro em 3 queries existentes

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint"]
```

## Story

**As a** administrador da plataforma,
**I want** poder apagar uma obra no painel de gerenciamento com uma confirmação clara dos riscos,
**so that** consiga remover obras obsoletas ou criadas por engano sem risco de perda permanente acidental, mantendo a possibilidade de reativação futura.

## Acceptance Criteria

1. Existe uma migration `058_obras_soft_delete.sql` que adiciona a coluna `deleted_at timestamptz DEFAULT NULL` à tabela `obras`, e um índice parcial `idx_obras_deleted_at` em `(deleted_at) WHERE deleted_at IS NULL` para performance.

2. O endpoint `DELETE /api/admin/obras/[obra_id]` existe e é restrito exclusivamente ao role `admin` (retorna 403 para `supervisor` e `obras`). Ao receber a requisição, define `deleted_at = now()` na obra correspondente (soft delete). Retorna 404 se a obra não existir ou já estiver deletada (`deleted_at IS NOT NULL`). Retorna `{ success: true }` em caso de sucesso.

3. A query de listagem em `GET /api/admin/obras/route.ts` e a query da página `dashboard/obras/page.tsx` passam a filtrar `.is('deleted_at', null)`, excluindo obras apagadas da listagem.

4. A query de detalhe em `GET /api/admin/obras/[obra_id]/route.ts` e a página `dashboard/obras/[obra_id]/page.tsx` passam a filtrar `.is('deleted_at', null)`, retornando 404 (ou `notFound()`) para obras apagadas.

5. A página `dashboard/obras/[obra_id]/page.tsx` renderiza o componente `ObraDeleteButton` apenas quando `user.role === 'admin'`. Para outros roles, o componente não é renderizado (não apenas oculto visualmente).

6. O componente `ObraDeleteButton` é um Client Component em `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-delete-button.tsx`. Ao clicar no botão "Apagar Obra", abre um modal de confirmação de perigo com:
   - Título em destaque: **"Apagar esta obra?"**
   - Ícone de alerta (triângulo) em vermelho/laranja
   - Bloco de avisos com fundo vermelho claro listando explicitamente:
     - "Todos os clientes vinculados perderão o acesso ao portal desta obra"
     - "Fases, fotos, documentos e mensagens ficam inacessíveis"
     - "A obra deixa de aparecer em todos os relatórios e métricas"
     - "Esta ação pode ser revertida apenas por um administrador técnico"
   - Campo de texto onde o admin deve digitar o nome exato da obra para confirmar
   - Botão "Confirmar Exclusão" vermelho, habilitado somente quando o texto digitado coincide exatamente com o nome da obra
   - Botão "Cancelar" para fechar sem ação

7. Após confirmação bem-sucedida (resposta 200 da API), o modal fecha e o usuário é redirecionado para `/dashboard/obras` usando `router.push`. O botão de confirmação exibe estado de loading enquanto aguarda a resposta.

8. Caso a API retorne erro, o modal exibe a mensagem de erro inline sem fechar, permitindo nova tentativa.

9. O portal do cliente (`/api/cliente/obras/[obra_id]/route.ts`) também filtra `.is('deleted_at', null)`, retornando 404 para obras apagadas — prevenindo acesso pelo portal.

## Scope

### IN
- Migration 058: coluna `deleted_at` na tabela `obras`
- DELETE handler em `/api/admin/obras/[obra_id]/route.ts`
- Componente `ObraDeleteButton` com modal de confirmação destrutiva
- Filtro `deleted_at IS NULL` nas queries de listagem e detalhe (admin + portal)
- Guard de role `admin` na renderização do botão

### OUT
- UI para listar/reativar obras apagadas (escopo futuro)
- Endpoint de reativação de obras (escopo futuro)
- Cascade de soft delete em fases, fotos, documentos (as entidades filhas ficam no banco, apenas a obra é marcada como deletada)
- Notificação automática aos clientes sobre a remoção

## Dependencies
- Story 36-1 (Done) — tabela `obras` já existe com schema atual
- Story 36-2 (Draft) — sem dependência direta; ambas modificam a tabela `obras` mas em colunas distintas
- `requireAuth()` de `@web/lib/api-auth` para autenticação nas rotas API
- `getServerUser()` de `@web/lib/auth` para obter role do usuário na page

## Dev Notes

### Migration 058 — SQL completo
```sql
ALTER TABLE obras
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_obras_deleted_at
  ON obras(deleted_at)
  WHERE deleted_at IS NULL;
```

### DELETE handler — `/api/admin/obras/[obra_id]/route.ts`
```typescript
// ADICIONAR ao arquivo existente (mantém GET e PATCH):
const ADMIN_ONLY = ["admin"]

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ obra_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ADMIN_ONLY.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id } = await params

  const { data: existing } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { error } = await supabase
    .from("obras")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", obra_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

### Filtros a adicionar nas queries existentes

**`/api/admin/obras/route.ts` (GET — listagem):**
```typescript
// Adicionar .is("deleted_at", null) na query de .from("obras").select(...)
```

**`/api/admin/obras/[obra_id]/route.ts` (GET — detalhe):**
```typescript
// Adicionar .is("deleted_at", null) na query de .from("obras").select(...)
```

**`dashboard/obras/page.tsx` (Server Component — listagem):**
```typescript
// Adicionar .is("deleted_at", null) na query de supabase.from("obras").select(...)
```

**`dashboard/obras/[obra_id]/page.tsx` (Server Component — detalhe):**
```typescript
// Adicionar .is("deleted_at", null) na query de supabase.from("obras").select(...)
```

**`/api/cliente/obras/[obra_id]/route.ts` (portal):**
```typescript
// Adicionar .is("deleted_at", null) na query de .from("obras").select(...)
```

### Componente ObraDeleteButton — estrutura
```typescript
"use client"
// Props: obraId: string, obraName: string
// Estado: open: boolean, confirmText: string, loading: boolean, error: string | null
// isConfirmed = confirmText === obraName
// Ao submit: fetch DELETE /api/admin/obras/{obraId}
//   → success: router.push("/dashboard/obras")
//   → error: setError(res.error)
// Estilo do botão trigger: variante destrutiva (vermelho/bordô)
// Posicionamento na page: ao lado do ObraEditButton no header da página
```

### Guard na page de detalhe
```typescript
// Em dashboard/obras/[obra_id]/page.tsx:
// user.role está disponível via getServerUser() que já é chamado
// Adicionar condicionalmente: {user.role === "admin" && <ObraDeleteButton obraId={obra.id} obraName={obra.name} />}
```

### Padrão de autenticação do projeto
- Pages SSR: `getServerUser()` de `@web/lib/auth` — retorna `{ id, orgId, name, role }`
- API routes: `requireAuth()` de `@web/lib/api-auth` — retorna `{ supabase, appUser }` com `appUser.role`
- Usar `.maybeSingle()` (nunca `.single()`) em queries que podem retornar 0 rows

### Next.js — Client Component
- `ObraDeleteButton` é `"use client"` com `useRouter` de `next/navigation`
- O fetch ao DELETE handler usa `fetch("/api/admin/obras/${obraId}", { method: "DELETE" })` diretamente
- Não usar server actions (evitar conflito `"use server"` em arquivo importado por Client Component)

## Tasks

- [x] 1. Criar migration `supabase/migrations/058_obras_soft_delete.sql` e aplicar no Supabase
- [x] 2. Adicionar handler `DELETE` em `packages/web/src/app/api/admin/obras/[obra_id]/route.ts`
- [x] 3. Adicionar filtro `.is('deleted_at', null)` nas queries de listagem: `api/admin/obras/route.ts` e `dashboard/obras/page.tsx`
- [x] 4. Adicionar filtro `.is('deleted_at', null)` nas queries de detalhe: `api/admin/obras/[obra_id]/route.ts` e `dashboard/obras/[obra_id]/page.tsx`
- [x] 5. Adicionar filtro `.is('deleted_at', null)` no portal: `api/cliente/obras/[obra_id]/route.ts`
- [x] 6. Criar componente `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-delete-button.tsx` com modal de confirmação destrutiva
- [x] 7. Integrar `ObraDeleteButton` na página de detalhe `dashboard/obras/[obra_id]/page.tsx` com guard `user.role === "admin"`
- [x] 8. Executar `npm run typecheck` e `npm run lint` e corrigir todos os erros

## 🤖 CodeRabbit Integration

Story Type Analysis:
  Primary Type: Full-Stack (Database + API + Frontend)
  Complexity: Medium

Specialized Agent Assignment:
  Primary Agents:
    - @dev (implementação + pre-commit reviews)
  Supporting Agents:
    - @qa (gate final)

Quality Gate Tasks:
  - [ ] Pre-Commit (@dev): `npm run typecheck` + `npm run lint` antes de marcar completo
  - [ ] Pre-PR (@devops): review antes de criar PR

CodeRabbit Focus Areas:
  - Verificar que o guard `admin-only` está em TODAS as camadas (API + UI)
  - Confirmar `.maybeSingle()` em todas as queries novas
  - Confirmar filtro `deleted_at IS NULL` em TODAS as queries de `obras` afetadas
  - Confirmar que o fetch no Client Component usa credenciais de cookie (sem service_role exposto)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- Migration 058 aplicada com sucesso no Supabase (coluna `deleted_at` + índice parcial)
- DELETE handler exclusivo para `admin`; usa `.maybeSingle()` para segurança
- Filtro `deleted_at IS NULL` aplicado em 5 pontos: listagem admin API, listagem admin page, detalhe admin API, detalhe admin page, portal cliente
- Portal route: `.single()` substituído por `.maybeSingle()` conforme observação do @po
- Componente `ObraDeleteButton`: modal com aviso em bloco vermelho + confirmação por digitação do nome exato da obra + loading state + erro inline
- Erros de typecheck/lint pré-existentes em `shared/commercial-rules.ts` e `lead-detail-drawer.tsx` — não relacionados a esta story

### Debug Log References
- Nenhum

## File List

- `supabase/migrations/058_obras_soft_delete.sql` (criado)
- `packages/web/src/app/api/admin/obras/[obra_id]/route.ts` (modificado — DELETE handler + filtro deleted_at + maybeSingle no GET)
- `packages/web/src/app/api/admin/obras/route.ts` (modificado — filtro deleted_at na listagem)
- `packages/web/src/app/dashboard/obras/page.tsx` (modificado — filtro deleted_at)
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` (modificado — filtro deleted_at + maybeSingle + ObraDeleteButton com guard admin)
- `packages/web/src/app/api/cliente/obras/[obra_id]/route.ts` (modificado — filtro deleted_at + single → maybeSingle)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-delete-button.tsx` (criado)

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-22 | @sm | Story criada |
| 2026-05-22 | @po | Validação GO — 9/10. Obs: portal route usa `.single()`, @dev deve substituir por `.maybeSingle()` ao adicionar filtro deleted_at. Status → Ready |
| 2026-05-22 | @dev | Implementação completa — migration aplicada, 8 tasks concluídas. Status → InReview |
