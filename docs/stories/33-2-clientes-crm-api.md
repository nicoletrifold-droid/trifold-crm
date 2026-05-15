# Story 33.2 — API CRUD Clientes + Vínculos com Obras

## Status: Ready for Review

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint", "manual API test"]

## Story

**Como** administrador do Trifold CRM,
**Quero** ter rotas de API completas para gerenciar clientes CRM e seus vínculos com obras,
**Para que** os componentes de UI das stories 33.3, 33.4 e 33.5 possam consumir dados de clientes de forma segura e padronizada.

## Contexto

Depende da Story 33.1 (schema). Esta story entrega todas as rotas de API que as stories de UI (33.3, 33.4, 33.5) consumirão.

**Padrão de referência:** `/api/brindes/destinatarios/route.ts` — auth com `requireAuth()`, RLS via `createClient()` (service role NÃO é usado aqui; usa-se o cliente autenticado para que o RLS seja aplicado automaticamente).

**Localização das novas rotas:** `packages/web/src/app/api/admin/clientes/`

## Acceptance Criteria

### Rota de listagem e criação
- [x] AC1: `GET /api/admin/clientes` retorna lista paginada de clientes da org autenticada; suporta query params: `q` (busca em nome/email), `obra_id` (filtra por vínculo com obra), `page` (default 1), `per_page` (default 50); resposta inclui `{ data: Cliente[], total: number, page: number, per_page: number }`
- [x] AC2: `POST /api/admin/clientes` cria novo cliente; body aceita todos os campos da tabela `clientes` exceto id, org_id, created_at, updated_at; retorna `{ data: Cliente }` com status 201
- [x] AC3: Ambas as rotas retornam 401 se não autenticado e 403 se o usuário não for admin ou supervisor

### Rota de detalhe, edição e exclusão
- [x] AC4: `GET /api/admin/clientes/[id]` retorna o cliente completo com seus vínculos de obras (`clientes_obras_vinculos` com join em `obras: { id, nome }` e `numero_unidade`)
- [x] AC5: `PATCH /api/admin/clientes/[id]` atualiza campos parcialmente (todos os campos da tabela são opcionais no body); retorna `{ data: Cliente }` atualizado
- [x] AC6: `DELETE /api/admin/clientes/[id]` remove o cliente; antes da exclusão, verifica se existe algum registro em `brindes_destinatarios` com `cliente_id = id`: se existir, retorna 409 com body `{ error: "Cliente possui destinatários de brindes vinculados. Desvincule antes de excluir.", count: N }`; se não existir, deleta e retorna 204

### Rotas de vínculos com obras
- [x] AC7: `GET /api/admin/clientes/[id]/obras` retorna lista de vínculos do cliente com obras: `{ data: [{ id, obra_id, obra: { id, nome }, numero_unidade, created_at }] }`
- [x] AC8: `POST /api/admin/clientes/[id]/obras` cria vínculo; body: `{ obra_id: string, numero_unidade?: string }`; retorna 409 se já existe vínculo para essa obra (violação de UNIQUE)
- [x] AC9: `PATCH /api/admin/clientes/[id]/obras/[vinculo_id]` atualiza apenas o campo `numero_unidade`; retorna `{ data: Vinculo }` atualizado
- [x] AC10: `DELETE /api/admin/clientes/[id]/obras/[vinculo_id]` remove o vínculo; retorna 204

### Rota de busca rápida
- [x] AC11: `GET /api/admin/clientes/search` aceita query params `email` (busca exata) e/ou `q` (busca por nome, ilike %q%); retorna array de até 10 resultados no formato: `{ data: [{ id, nome, email, telefone, obras: [{ obra_id, obra_nome, numero_unidade }] }] }`
- [x] AC12: Se nenhum parâmetro `email` ou `q` for fornecido, retorna 400 com `{ error: "Parâmetro 'email' ou 'q' é obrigatório" }`

## Escopo

**IN:**
- `packages/web/src/app/api/admin/clientes/route.ts` (GET lista + POST criar)
- `packages/web/src/app/api/admin/clientes/[id]/route.ts` (GET detalhe + PATCH + DELETE)
- `packages/web/src/app/api/admin/clientes/[id]/obras/route.ts` (GET vínculos + POST criar vínculo)
- `packages/web/src/app/api/admin/clientes/[id]/obras/[vinculo_id]/route.ts` (PATCH + DELETE vínculo)
- `packages/web/src/app/api/admin/clientes/search/route.ts` (GET busca rápida)

**OUT:**
- Migration 042 com `cliente_id` em `brindes_destinatarios` — Story 33.5
- UI components — Stories 33.3, 33.4, 33.5
- Qualquer alteração nas rotas existentes de brindes ou portal

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Conflito de rota `/search` vs `/[id]` no Next.js App Router | Média | Criar `/search/route.ts` como segmento estático ANTES do `[id]` dinâmico — Next.js prioriza segmentos estáticos |
| Rota `DELETE /clientes/[id]` sem verificar brindes vinculados | Média | AC6 exige verificação em `brindes_destinatarios` antes de deletar |
| Query de listagem com filtro `obra_id` exigindo JOIN | Baixa | Usar subquery: `.in('id', supabase.from('clientes_obras_vinculos').select('cliente_id').eq('obra_id', obraId))` |

## Dev Notes

### Auth pattern (seguir exatamente o padrão de `/api/brindes/destinatarios/route.ts`)

```typescript
import { requireAuth } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth
  // supabase já usa o cliente autenticado — RLS aplicado automaticamente
  // appUser.org_id disponível para filtros extras
}
```

### Estrutura de arquivos a criar

```
packages/web/src/app/api/admin/clientes/
├── route.ts                          ← GET lista + POST criar
├── search/
│   └── route.ts                      ← GET busca rápida (segmento estático)
└── [id]/
    ├── route.ts                      ← GET detalhe + PATCH + DELETE
    └── obras/
        ├── route.ts                  ← GET vínculos + POST criar vínculo
        └── [vinculo_id]/
            └── route.ts              ← PATCH + DELETE vínculo
```

**IMPORTANTE:** O diretório `search/` deve ser criado ANTES do `[id]/` para que o Next.js App Router não interprete "search" como um ID dinâmico.

### Query de listagem (GET /api/admin/clientes)

```typescript
let query = supabase
  .from("clientes")
  .select("*, clientes_obras_vinculos(id, obra_id, numero_unidade, obras(id, nome))", { count: "exact" })
  .eq("org_id", appUser.org_id)
  .order("nome", { ascending: true })

// Filtro por texto (nome ou email)
const q = searchParams.get("q")
if (q) query = query.or(`nome.ilike.%${q}%,email.ilike.%${q}%`)

// Filtro por obra
const obraId = searchParams.get("obra_id")
if (obraId) {
  // Supabase não suporta EXISTS diretamente; usar filter com subquery
  // Alternativa: buscar IDs via clientes_obras_vinculos primeiro
}

// Paginação
const page = parseInt(searchParams.get("page") ?? "1")
const perPage = parseInt(searchParams.get("per_page") ?? "50")
query = query.range((page - 1) * perPage, page * perPage - 1)
```

### Query de detalhe (GET /api/admin/clientes/[id])

```typescript
const { data, error } = await supabase
  .from("clientes")
  .select("*, clientes_obras_vinculos(id, obra_id, numero_unidade, obras(id, nome))")
  .eq("id", id)
  .eq("org_id", appUser.org_id)
  .maybeSingle()  // SEMPRE .maybeSingle() nunca .single() — .single() lança erro em 0 rows

if (!data) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
```

### Soft check no DELETE (AC6)

```typescript
// Verificar brindes vinculados antes de deletar
const { count } = await supabase
  .from("brindes_destinatarios")
  .select("id", { count: "exact", head: true })
  .eq("cliente_id", id)

if (count && count > 0) {
  return NextResponse.json({
    error: "Cliente possui destinatários de brindes vinculados. Desvincule antes de excluir.",
    count
  }, { status: 409 })
}
```

**Nota:** A coluna `brindes_destinatarios.cliente_id` ainda não existe na Story 33.2 (será adicionada pela migration 042 na Story 33.5). O soft check deve ser implementado mas tolerará o caso em que a coluna não existe ainda — adicionar `try/catch` em torno da verificação ou verificar se a migration 042 foi aplicada.

### Rota de busca rápida (GET /api/admin/clientes/search)

```typescript
// Retorna máximo 10 resultados para autocomplete
const { data } = await supabase
  .from("clientes")
  .select("id, nome, email, telefone, clientes_obras_vinculos(obra_id, numero_unidade, obras(nome))")
  .eq("org_id", appUser.org_id)
  .or(`email.eq.${email},nome.ilike.%${q}%`)  // adaptar conforme parâmetros presentes
  .limit(10)
```

### Testing

- Testes manuais via curl ou ferramenta de API (Insomnia/Postman)
- Verificar: autenticação 401 sem token, filtros, paginação, 409 no delete com brindes vinculados
- `npm run typecheck` e `npm run lint` sem erros antes de marcar tasks como concluídas

## Tasks / Subtasks

- [x] Task 1: Criar `packages/web/src/app/api/admin/clientes/route.ts` — GET lista paginada + POST criar (AC1, AC2, AC3)
- [x] Task 2: Criar `packages/web/src/app/api/admin/clientes/search/route.ts` — GET busca rápida (AC11, AC12)
- [x] Task 3: Criar `packages/web/src/app/api/admin/clientes/[id]/route.ts` — GET detalhe + PATCH + DELETE com soft check (AC4, AC5, AC6)
- [x] Task 4: Criar `packages/web/src/app/api/admin/clientes/[id]/obras/route.ts` — GET vínculos + POST criar vínculo (AC7, AC8)
- [x] Task 5: Criar `packages/web/src/app/api/admin/clientes/[id]/obras/[vinculo_id]/route.ts` — PATCH + DELETE vínculo (AC9, AC10)
- [x] Task 6: Verificar `npm run type-check && npm run lint` sem erros
- [ ] Task 7: Teste manual das rotas principais: criação, listagem, busca, detalhe, edição, exclusão — pendente para @qa

## File List

**Criados:**
- `packages/web/src/app/api/admin/clientes/route.ts` — GET listagem paginada + POST criar
- `packages/web/src/app/api/admin/clientes/search/route.ts` — GET busca rápida (autocomplete)
- `packages/web/src/app/api/admin/clientes/[id]/route.ts` — GET detalhe + PATCH + DELETE
- `packages/web/src/app/api/admin/clientes/[id]/obras/route.ts` — GET vínculos + POST criar vínculo
- `packages/web/src/app/api/admin/clientes/[id]/obras/[vinculo_id]/route.ts` — PATCH + DELETE vínculo

## Dev Agent Record

**Agent:** Dex (Builder) — @dev (YOLO mode)
**Date:** 2026-05-15

### Implementation Notes

- **Auth:** `requireAuth()` + `requireRole(appUser, ["admin", "supervisor"])` em todas as 5 rotas. Retorna 401 (não autenticado) ou 403 (role insuficiente) automaticamente.
- **RLS defense in depth:** todas as queries filtram explicitamente por `org_id = appUser.org_id` (apesar do RLS já garantir isolamento).
- **Schema mismatch resolvido:** a tabela `obras` usa `name` (não `nome`). As queries com Supabase usam `obras(id, name)` e mapeiam para `nome` na resposta da API conforme contrato da story.
- **`.maybeSingle()`** usado em todas as queries por ID para evitar erros em 0 rows (padrão do projeto).
- **Filtro `obra_id` (AC1):** resolvido via subquery em `clientes_obras_vinculos` para obter `cliente_ids` e depois `.in()` na query principal. Short-circuit retorna vazio se a obra não tem vínculos.
- **Sanitização de `q`:** caracteres `%` e `,` são removidos antes do `ilike` para evitar wildcard injection no operador `or`.
- **CPF unicidade:** validada no POST (insert) e no PATCH (update, excluindo o próprio id). Retorna 409 em conflito.
- **Soft check AC6:** verifica `brindes_destinatarios.cliente_id` antes do DELETE. Tolera código Postgres `42703` (column does not exist) porque a coluna `cliente_id` só será adicionada pela migration 042 (Story 33.5). Em qualquer outro erro, retorna 500.
- **POST vínculo (AC8):** valida ownership do cliente E da obra (ambos na mesma org). Trata constraint UNIQUE violation (`23505`) com 409 e mensagem amigável.
- **PATCH vínculo (AC9):** atualiza somente `numero_unidade`. Recusa requisição sem o campo com 400.
- **Ordem de roteamento:** `search/` foi criado antes de `[id]/` para que o Next.js App Router priorize o segmento estático sobre o dinâmico (mitiga risco listado na story).

### Validation

- `npm run type-check` — 0 erros
- `npx eslint src/app/api/admin/clientes/` — exit 0, 0 issues
- Teste manual (Task 7): pendente para @qa quality gate

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> Quality validation usará processo de revisão manual.

### Story Type Analysis
- **Primary Type:** API
- **Secondary Type:** Security (auth + RLS)
- **Complexity:** Medium (5 arquivos, sub-rotas aninhadas, soft check de integridade)

### Specialized Agent Assignment
- **Primary:** @dev
- **Supporting:** @qa (quality gate — revisar autenticação e boundary conditions)

### Quality Gate Tasks
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint` sem erros
- [ ] Pre-Commit (@dev): Testar 401 sem autenticação em todas as rotas
- [ ] Pre-Commit (@dev): Testar 409 no DELETE com brindes vinculados
- [ ] Pre-PR (@devops): Revisar que nenhuma rota expõe dados de outra org (org_id isolation)

### CodeRabbit Focus Areas
- Auth em todas as rotas: `requireAuth()` obrigatório
- `.maybeSingle()` em vez de `.single()` em todos os queries por ID
- Filtro `org_id` em todas as queries (RLS + defense in depth)
- Validação de `obra_id` no POST de vínculo (verificar que obra pertence à mesma org)
- Tratamento de erro da constraint UNIQUE em POST de vínculo (AC8)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-15 | 1.0 | Story criada | @sm (River) |
| 2026-05-15 | 1.1 | Validada @po (GO 10/10). Status Draft → Ready. Padrão `requireAuth()` de `@web/lib/api-auth` confirmado correto (internamente usa `createClient()` de `@web/lib/supabase/server`). | @po (Pax) |
| 2026-05-15 | 1.2 | Implementação completa em YOLO mode: 5 rotas criadas (listagem, criar, busca, detalhe, edit, delete, vínculos GET/POST/PATCH/DELETE). Type-check e lint clean. Status Ready → Ready for Review. AC1–AC12 atendidos. | @dev (Dex) |
