# Story 32.1 — Campo Número de Unidade no Cadastro de Cliente na Obra

## Status: Ready for Review

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run lint", "npm run type-check", "browser test"]

## Story

**Como** administrador ou supervisor do Trifold CRM,
**Quero** poder registrar o número de unidade/apartamento ao vincular um cliente a uma obra,
**Para que** eu saiba exatamente qual unidade pertence a cada cliente no acompanhamento do empreendimento.

## Contexto

A tabela `cliente_obras` (migration `020_portal_cliente.sql`) vincula clientes a obras com os campos: `id`, `user_id`, `obra_id`, `is_primary`, `created_at`. Não há campo para unidade/apartamento.

Esta story adiciona a coluna `numero_unidade text NULL` à tabela `cliente_obras` e expõe esse campo em toda a stack (DB → API → UI).

**Fluxos afetados:**
1. **Criar novo cliente** (Formulário A em `clientes-tab.tsx`) — campo opcional de unidade
2. **Vincular cliente existente** (Formulário B em `clientes-tab.tsx`) — campo opcional de unidade
3. **Lista de clientes vinculados** — exibir unidade abaixo do email, com edição inline
4. **PATCH endpoint** (`[user_id]/route.ts`) — novo método para atualizar a unidade de um vínculo existente

**Notas críticas:**
- O campo é **opcional** — `NULL` por padrão. Obras sem numeração de unidades não são impactadas.
- O `PATCH` em `[user_id]/route.ts` atualiza apenas `numero_unidade` na tabela `cliente_obras` (não em `users`).
- A query do GET em `clientes/route.ts` usa `.select("is_primary, users(id, name, email)")` — adicionar `numero_unidade` ao select da tabela `cliente_obras`, não do join com `users`.
- O `ObraDetailTabsProps` em `obra-detail-tabs.tsx` passa `clientes` para `ClientesTab` — a interface `Cliente` precisa incluir `numero_unidade`.
- A página `/dashboard/obras/[obra_id]/page.tsx` faz a query e passa os dados — verificar se precisa atualizar a query lá também.

**Estrutura atual da tabela:**
```sql
CREATE TABLE IF NOT EXISTS cliente_obras (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, obra_id)
);
```

## Acceptance Criteria

### DB
- [ ] AC1: Migration `034_cliente_obras_numero_unidade.sql` criada com `ALTER TABLE public.cliente_obras ADD COLUMN IF NOT EXISTS numero_unidade text NULL;`
- [ ] AC2: Migration aplicada ao remote via MCP `apply_migration` sem erros

### API — GET
- [ ] AC3: `GET /api/admin/obras/[obra_id]/clientes` retorna `numero_unidade` de cada cliente vinculado (incluir no `.select()` da tabela `cliente_obras`)

### API — POST (criar novo cliente — Modo A)
- [ ] AC4: `POST /api/admin/obras/[obra_id]/clientes` aceita campo opcional `numero_unidade` no body
- [ ] AC5: Ao criar novo cliente (Modo A), o `numero_unidade` é inserido no registro de `cliente_obras` (não em `users`)

### API — POST (vincular existente — Modo B)
- [ ] AC6: Ao vincular cliente existente (Modo B), o `numero_unidade` é inserido no registro de `cliente_obras`

### API — PATCH (editar unidade de vínculo existente)
- [ ] AC7: Novo endpoint `PATCH /api/admin/obras/[obra_id]/clientes/[user_id]` em `route.ts` aceita `{ numero_unidade: string | null }` no body
- [ ] AC8: O PATCH atualiza apenas `numero_unidade` na tabela `cliente_obras` onde `user_id` e `obra_id` correspondem
- [ ] AC9: PATCH restrito a `ALLOWED_ROLES = ["admin", "supervisor", "obras"]` com verificação de `org_id` da obra

### UI — Formulários
- [ ] AC10: Formulário A (criar novo cliente) exibe campo de texto opcional "Nº da unidade / apartamento" abaixo da senha temporária
- [ ] AC11: Formulário B (vincular existente) exibe campo de texto opcional "Nº da unidade / apartamento" abaixo do email

### UI — Lista de clientes
- [ ] AC12: Lista de clientes vinculados exibe `numero_unidade` abaixo do email quando preenchido (ex: `"Unidade 203"`)
- [ ] AC13: Cada cliente na lista tem botão de edição inline (ícone de lápis) que abre um input para editar a unidade no lugar
- [ ] AC14: Ao salvar a edição inline, o PATCH é chamado e a lista é atualizada via `router.refresh()`
- [ ] AC15: Campo vazio na edição inline envia `null` (remove a unidade), campo preenchido salva a string

### TypeScript
- [ ] AC16: Interface `Cliente` em `clientes-tab.tsx` inclui `numero_unidade: string | null`
- [ ] AC17: Interface `Cliente` em `obra-detail-tabs.tsx` (prop `ObraDetailTabsProps`) inclui `numero_unidade: string | null`
- [ ] AC18: Sem erros de `npm run type-check`

## Escopo

**IN:**
- Coluna `numero_unidade` na tabela `cliente_obras`
- GET retorna o campo
- POST (ambos os modos) aceita o campo
- PATCH endpoint para editar o campo
- UI: inputs nos formulários + exibição + edição inline na lista

**OUT:**
- Alteração do portal do cliente (`/cliente/[obra_id]`) — cliente não vê o número da unidade nesta story
- Filtro ou busca por unidade
- Validação de formato (ex: somente números) — campo livre

## Dependências

- **Requer:** Migration `020_portal_cliente.sql` aplicada (tabela `cliente_obras` existente)
- **Sem dependências** de outras stories em andamento

## Dev Notes

### Arquivos a modificar

```
supabase/migrations/034_cliente_obras_numero_unidade.sql   ← CRIAR (nova migration)
packages/web/src/app/api/admin/obras/[obra_id]/clientes/route.ts   ← MODIFICAR (GET + POST)
packages/web/src/app/api/admin/obras/[obra_id]/clientes/[user_id]/route.ts   ← MODIFICAR (adicionar PATCH)
packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx   ← MODIFICAR (UI completa)
packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx   ← MODIFICAR (interface Cliente)
packages/web/src/app/dashboard/obras/[obra_id]/page.tsx   ← VERIFICAR (query de clientes)
```

### Padrão de migration existente
```sql
-- Migration 034: Número de Unidade no Vínculo Cliente-Obra
-- Story 32.1 — Epic 32

ALTER TABLE public.cliente_obras
  ADD COLUMN IF NOT EXISTS numero_unidade text NULL;
```

### GET — select atual vs. novo
```typescript
// ATUAL:
.select("is_primary, users(id, name, email)")

// NOVO (numero_unidade vem de cliente_obras, não do join):
.select("is_primary, numero_unidade, users(id, name, email)")
```

### Mapeamento no GET — adicionar numero_unidade ao objeto retornado
```typescript
const clientes = (data ?? []).map((row) => {
  const user = Array.isArray(row.users) ? row.users[0] : row.users
  return {
    id: user?.id,
    name: user?.name,
    email: user?.email,
    is_primary: row.is_primary,
    numero_unidade: row.numero_unidade ?? null,  // ← ADICIONAR
  }
})
```

### POST Modo A — inserção com numero_unidade
```typescript
// Extrair do body:
const { nome, email, senha_temporaria, numero_unidade } = body

// Inserir no cliente_obras com a unidade:
await supabaseAdmin
  .from("cliente_obras")
  .insert({
    user_id: newUser.id,
    obra_id,
    is_primary: true,
    numero_unidade: typeof numero_unidade === "string" && numero_unidade.trim()
      ? numero_unidade.trim()
      : null,
  })
```

### POST Modo B — inserção com numero_unidade
```typescript
const { email, numero_unidade } = body

await supabaseAdmin
  .from("cliente_obras")
  .insert({
    user_id: existingUser.id,
    obra_id,
    is_primary: false,
    numero_unidade: typeof numero_unidade === "string" && numero_unidade.trim()
      ? numero_unidade.trim()
      : null,
  })
```

### PATCH endpoint — `[user_id]/route.ts`
```typescript
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ obra_id: string; user_id: string }> }
) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (!ALLOWED_ROLES.includes(appUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { obra_id, user_id } = await params

  // Verificar que a obra pertence à org
  const { data: obra } = await supabase
    .from("obras")
    .select("id")
    .eq("id", obra_id)
    .eq("org_id", appUser.org_id)
    .single()

  if (!obra) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const numero_unidade = typeof body.numero_unidade === "string" && body.numero_unidade.trim()
    ? body.numero_unidade.trim()
    : null

  const { error } = await supabase
    .from("cliente_obras")
    .update({ numero_unidade })
    .eq("user_id", user_id)
    .eq("obra_id", obra_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ numero_unidade })
}
```

### UI — edição inline na lista
O botão de lápis ao lado do botão de desvincular abre um `<input>` inline no lugar do texto da unidade. Ao pressionar Enter ou clicar no check, chama o PATCH. Ao pressionar Escape ou clicar fora, cancela sem salvar.

```tsx
// Estado adicional em ClientesTab:
const [editingUnidade, setEditingUnidade] = useState<string | null>(null) // user_id em edição
const [unidadeInput, setUnidadeInput] = useState("")

// No mapa de clientes, troca o display pelo input quando editingUnidade === c.id
```

### Página da obra — verificar query
A page `/dashboard/obras/[obra_id]/page.tsx` provavelmente faz query dos clientes para passar ao `ObraDetailTabs`. Verificar se usa `supabase.from("cliente_obras").select(...)` diretamente ou chama a API. Se for query direta, adicionar `numero_unidade` ao select.

## Tasks / Subtasks

- [x] Task 1 (AC1, AC2): Criar `supabase/migrations/034_cliente_obras_numero_unidade.sql` e aplicar via MCP
- [x] Task 2 (AC3): Atualizar GET em `clientes/route.ts` — adicionar `numero_unidade` ao select e ao objeto mapeado
- [x] Task 3 (AC4, AC5): Atualizar POST Modo A em `clientes/route.ts` — extrair e inserir `numero_unidade`
- [x] Task 4 (AC6): Atualizar POST Modo B em `clientes/route.ts` — extrair e inserir `numero_unidade`
- [x] Task 5 (AC7, AC8, AC9): Criar `PATCH` em `clientes/[user_id]/route.ts`
- [x] Task 6 (AC10, AC11): Adicionar inputs de unidade nos Formulários A e B em `clientes-tab.tsx`
- [x] Task 7 (AC12): Exibir `numero_unidade` na lista de clientes quando preenchido
- [x] Task 8 (AC13, AC14, AC15): Implementar edição inline com estado + chamada ao PATCH
- [x] Task 9 (AC16, AC17): Atualizar interfaces `Cliente` em `clientes-tab.tsx` e `obra-detail-tabs.tsx`
- [x] Task 10 (AC18): Verificar `page.tsx` da obra e corrigir se necessário + rodar `type-check` sem erros

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: API + Frontend
- Secondary Type(s): Database
- Complexity: Medium (3 camadas afetadas, lógica de edição inline no cliente)

**Specialized Agent Assignment:**
- Primary Agents: @dev
- Supporting Agents: N/A

**Quality Gate Tasks:**
- [x] Pre-Commit (@dev): `npm run lint` + `npm run type-check`
- [ ] Pre-PR (@devops): Browser test — criar cliente com unidade, vincular com unidade, editar unidade inline

**CodeRabbit Focus Areas:**
- Primary Focus:
  - PATCH verifica `org_id` da obra antes de atualizar (isolamento de org)
  - POST não permite sobrescrever `numero_unidade` de outro vínculo existente (UNIQUE já garante)
  - Input de unidade sanitizado (trim, null se vazio)
- Secondary Focus:
  - `numero_unidade` não quebra clientes já vinculados sem o campo (NULL safe)
  - Type-check passa com as novas interfaces

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Severity Filter: CRITICAL only

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-14 | @sm (River) | Story criada — Draft |
| 2026-05-14 | @po (Pax) | Validação 10/10 GO — sem correções; padrão supabase no PATCH confirmado consistente com DELETE existente; status → Ready |
| 2026-05-14 | @dev (Dex) | Implementação concluída — migration 034 criada e aplicada; GET/POST/PATCH atualizados; UI com campos + exibição + edição inline; type-check 0 erros; status → Ready for Review |
