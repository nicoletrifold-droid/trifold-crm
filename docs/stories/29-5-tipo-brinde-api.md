# Story 29.5 — API Routes: CRUD `brindes_tipos` + atualizar `brindes_entregas`

## Status: Ready

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint"]

## Story

**Como** administrador do Trifold CRM,
**Quero** ter rotas de API para gerenciar tipos de brinde (criar, listar, editar, desativar) e que o registro de entrega aceite o campo `brinde_tipo_id`,
**Para que** a interface possa oferecer CRUD de tipos e associar o tipo entregue a cada entrega registrada.

## Contexto

Depende da Story 29.4 (tabela `brindes_tipos` + coluna em `brindes_entregas`). Esta story é a camada de API que expõe o catálogo de tipos para a UI (Story 29.6).

Padrão de rotas baseado em `/api/brindes/datas` (já implementado em 29.2).

## Acceptance Criteria

### Rotas de Tipos de Brinde
- [ ] AC1: `GET /api/brindes/tipos` — lista tipos da org, ordenados por nome, com suporte ao query param `?ativo=true|false` para filtrar por status
- [ ] AC2: `POST /api/brindes/tipos` — cria tipo. Body: `{ nome, descricao?, tamanho?, cor? }`. Valida: nome obrigatório e não-vazio; retorna 400 se `nome` já existe para org (UNIQUE constraint)
- [ ] AC3: `PATCH /api/brindes/tipos/[id]` — atualiza tipo. Body: qualquer combinação de `{ nome?, descricao?, tamanho?, cor?, ativo? }`. Verifica que o tipo pertence à org antes de atualizar
- [ ] AC4: `DELETE /api/brindes/tipos/[id]` — deleta tipo (hard delete). Verifica que o tipo pertence à org. Se o tipo estiver em uso em brindes_entregas, retorna 409 com mensagem explicativa

### Atualização da Rota de Entregas
- [ ] AC5: `POST /api/brindes/entregas` — aceita campo opcional `brinde_tipo_id` (uuid). Valida: se informado, verifica que o tipo existe e pertence à org; inclui `brinde_tipo_id` no upsert
- [ ] AC6: `GET /api/brindes/entregas` — inclui detalhes do tipo via join Supabase: `.select("*, brindes_tipos(nome, tamanho, cor)")` para que a UI possa exibir nome/tamanho/cor sem busca adicional. Resposta de cada entrega inclui `brindes_tipos: { nome, tamanho, cor } | null`

### Segurança e Padrões
- [ ] AC7: Todas as rotas usam `requireAuth()` para autenticação
- [ ] AC8: Rotas de escrita (POST, PATCH, DELETE) usam `requireRole(appUser, ["admin", "supervisor", "obras"])`
- [ ] AC9: Nenhuma query sem filtro `org_id` (proteção de isolamento multi-tenant)

## Escopo

**IN:**
- `/api/brindes/tipos/route.ts` (GET, POST)
- `/api/brindes/tipos/[id]/route.ts` (PATCH, DELETE)
- Atualização de `/api/brindes/entregas/route.ts` (aceitar brinde_tipo_id)

**OUT:**
- UI (Story 29.6)
- Alterações no schema (Story 29.4)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| DELETE de tipo em uso quebrar entregas | Baixa | FK ON DELETE SET NULL já protege — mas retornar 409 é melhor UX |
| Regressão na rota de entregas existente | Baixa | brinde_tipo_id é opcional; campo inexistente no body é ignorado |

## Dev Notes

### Padrão de arquivos (baseado em brindes/datas implementado em 29.2)
```
packages/web/src/app/api/brindes/tipos/route.ts         ← GET + POST
packages/web/src/app/api/brindes/tipos/[id]/route.ts    ← PATCH + DELETE
```

### Padrão de auth (de /api/brindes/datas/route.ts existente)
```typescript
import { requireAuth, requireRole } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth
  // query com .eq("org_id", appUser.org_id)
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth
  const roleError = requireRole(appUser, ["admin", "supervisor", "obras"])
  if (roleError) return roleError
  // ...
}
```

### Verificação de propriedade antes de PATCH/DELETE
```typescript
const { data: existing } = await supabase
  .from("brindes_tipos")
  .select("id")
  .eq("id", id)
  .eq("org_id", appUser.org_id)
  .single()
if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
```

### Verificação de tipo em uso (para DELETE 409)
```typescript
const { count } = await supabase
  .from("brindes_entregas")
  .select("id", { count: "exact", head: true })
  .eq("brinde_tipo_id", id)
  .eq("org_id", appUser.org_id)
if (count && count > 0) {
  return NextResponse.json(
    { error: `Este tipo está em uso em ${count} entrega(s). Desative-o ao invés de deletar.` },
    { status: 409 }
  )
}
```

### Atualização do POST /api/brindes/entregas
```typescript
// Após validações existentes de destinatario_id, data_comemorativa_id, status:
let brinde_tipo_id: string | null = null
if (typeof body.brinde_tipo_id === "string" && body.brinde_tipo_id.trim()) {
  // Verificar que tipo pertence à org
  const { data: tipo } = await supabase
    .from("brindes_tipos")
    .select("id")
    .eq("id", body.brinde_tipo_id.trim())
    .eq("org_id", appUser.org_id)
    .single()
  if (!tipo) return NextResponse.json({ error: "Tipo de brinde não encontrado" }, { status: 400 })
  brinde_tipo_id = tipo.id
}
// Incluir brinde_tipo_id no upsert
```

### Tipo TypeScript sugerido para brindes_tipos
```typescript
export interface BrindeTipo {
  id: string
  org_id: string
  nome: string
  descricao: string | null
  tamanho: string | null
  cor: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}
```

## Tasks / Subtasks

- [ ] Task 1: Criar `packages/web/src/app/api/brindes/tipos/route.ts` com GET (lista) e POST (cria) (AC1, AC2)
- [ ] Task 2: Criar `packages/web/src/app/api/brindes/tipos/[id]/route.ts` com PATCH (edita) e DELETE (remove com 409 se em uso) (AC3, AC4)
- [ ] Task 3: Atualizar `packages/web/src/app/api/brindes/entregas/route.ts` — aceitar `brinde_tipo_id` opcional no POST e incluir no upsert (AC5, AC6)
- [ ] Task 4: Verificar `npm run typecheck` e `npm run lint` sem erros
- [ ] Task 5: Testar manualmente GET /api/brindes/tipos (deve retornar array vazio sem erros)

## File List

- `packages/web/src/app/api/brindes/tipos/route.ts` — criado
- `packages/web/src/app/api/brindes/tipos/[id]/route.ts` — criado
- `packages/web/src/app/api/brindes/entregas/route.ts` — modificado

## 🤖 CodeRabbit Integration

### Story Type Analysis
- **Primary Type:** API
- **Complexity:** Low (padrão existente bem estabelecido, sem novos patterns)

### Specialized Agent Assignment
- **Primary:** @dev
- **Supporting:** nenhum (padrão simples)

### Quality Gate Tasks
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint` sem erros
- [ ] Pre-PR (@devops): Revisar isolamento multi-tenant (org_id em todas as queries)

### CodeRabbit Focus Areas
- Isolamento multi-tenant: todas as queries filtram por org_id
- Auth: requireRole nas rotas de escrita
- Validação: campos obrigatórios e tipos corretos no body
- 409 para DELETE em uso (melhor UX que deixar FK SET NULL silenciosamente)
