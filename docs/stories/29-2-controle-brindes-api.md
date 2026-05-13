# Story 29.2 — API Routes: Controle de Brindes + Parser de Endereço

## Status: Ready for Review

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint"]

## Story

**Como** administrador do Trifold CRM,
**Quero** ter API routes para CRUD de destinatários de brindes, datas comemorativas e registro de status de entregas, além de um parser que converta endereços em texto livre (formato planilha Excel) para campos estruturados,
**Para que** o painel de brindes (Story 29.3) tenha endpoints funcionais para todas as operações.

## Contexto

Depende da Story 29.1 (tabelas criadas). Esta story cria todas as rotas em `/api/brindes/` e o utilitário `parseEndereco()` que será usado tanto pelo import quanto pelo formulário.

## Acceptance Criteria

### API Routes — Destinatários
- [x] AC1: `GET /api/brindes/destinatarios` retorna lista paginada com suporte a query params: `obra_nome`, `tipo`, `cidade`, `estado`, `nome` (busca parcial), `page`, `limit` (default 50)
- [x] AC2: `POST /api/brindes/destinatarios` cria novo destinatário; body: `{ obra_nome, tipo, nome, observacao?, endereco_logradouro?, ..., endereco_referencia? }`; retorna 201 com objeto criado
- [x] AC3: `PATCH /api/brindes/destinatarios/[id]` atualiza campos parcialmente; retorna 200 com objeto atualizado
- [x] AC4: `DELETE /api/brindes/destinatarios/[id]` remove destinatário (CASCADE apaga entregas vinculadas); retorna 204
- [x] AC5: `POST /api/brindes/import` aceita array de registros no formato `{ obra_nome, tipo, nome, observacao?, endereco_raw? }` e insere em lote; `endereco_raw` passa pelo parser automaticamente; retorna `{ inserted: N, errors: [...] }`

### API Routes — Datas Comemorativas
- [x] AC6: `GET /api/brindes/datas` retorna todas as datas da org ordenadas por `data ASC`; aceita `?ativa=true/false`
- [x] AC7: `POST /api/brindes/datas` cria nova data; body `{ nome, data, ativa? }`; retorna 201
- [x] AC8: `PATCH /api/brindes/datas/[id]` edita nome/data/ativa; retorna 200

### API Routes — Entregas (Status)
- [x] AC9: `POST /api/brindes/entregas` cria ou atualiza (upsert) status de entrega; body: `{ destinatario_id, data_comemorativa_id, status, observacao_entrega? }`; usa `ON CONFLICT (destinatario_id, data_comemorativa_id) DO UPDATE`; retorna 200

### Parser de Endereço
- [x] AC10: Função `parseEndereco(raw: string)` exportada em `packages/web/src/lib/brindes/parse-endereco.ts`
- [x] AC11: Parser detecta endereços especiais ("OBRA X", "SEDE X") e retorna `{ endereco_referencia: raw, outros_campos: null }`
- [x] AC12: Parser extrai de endereços residenciais: logradouro, número, complemento, bairro, cidade, estado (2 letras maiúsculas), CEP (8 dígitos)
- [x] AC13: Exemplos que o parser deve tratar:
  - `"Rua Itapura Nº 566, Apto 502, 87050-190, Maringá - PR"` → `{ logradouro: "Rua Itapura", numero: "566", complemento: "Apto 502", cep: "87050-190", cidade: "Maringá", estado: "PR" }`
  - `"OBRA COMUNIDADE"` → `{ referencia: "OBRA COMUNIDADE" }`
  - `"Av. João Marangoni, 1668 - 87114-630 - Sarandi"` → `{ logradouro: "Av. João Marangoni", numero: "1668", cep: "87114-630", cidade: "Sarandi" }`

### Segurança e validação
- [x] AC14: Todas as rotas verificam autenticação via `getServerUser()` e retornam 401 se não autenticado
- [x] AC15: Operações de escrita (POST, PATCH, DELETE) verificam `role IN ('admin','supervisor')` e retornam 403 se não autorizado
- [x] AC16: `org_id` é sempre obtido do usuário autenticado (nunca do body da requisição)

## Escopo

**IN:**
- 9 rotas em `packages/web/src/app/api/brindes/`
- Utilitário `parse-endereco.ts`
- Tipagem TypeScript para request/response

**OUT:**
- UI (Story 29.3)
- Nenhuma mudança em tabelas existentes
- Nenhuma autenticação nova (usa padrão existente `getServerUser()`)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Parser de endereço não cobre todos os formatos | Média | Parser retorna `referencia: raw` como fallback para qualquer formato não reconhecido — nunca perde dados |
| Rota de import pode ser lenta para 1015 registros | Baixa | Usar `INSERT ... VALUES (batch)` ao invés de 1015 inserts individuais; limite 500 registros por chamada |

## Dev Notes

### Estrutura de arquivos a criar
```
packages/web/src/app/api/brindes/
├── destinatarios/
│   ├── route.ts           (GET list + POST create)
│   └── [id]/
│       └── route.ts       (PATCH update + DELETE remove)
├── datas/
│   ├── route.ts           (GET list + POST create)
│   └── [id]/
│       └── route.ts       (PATCH update)
├── entregas/
│   └── route.ts           (POST upsert status)
└── import/
    └── route.ts           (POST bulk import)

packages/web/src/lib/brindes/
└── parse-endereco.ts      (exporta parseEndereco())
```

### Padrão de auth usado no projeto (API routes)
Ver `packages/web/src/app/api/admin/obras/route.ts` e `packages/web/src/lib/api-auth.ts` como referência.
**IMPORTANTE:** API routes usam `requireAuth()` de `@web/lib/api-auth` — NÃO `getServerUser()` de `@web/lib/auth` (este é para server components, não para route handlers).
```typescript
import { requireAuth, requireRole } from "@web/lib/api-auth"

const auth = await requireAuth()
if (auth.error) return auth.error
const { supabase, appUser } = auth

const roleError = requireRole(appUser, ["admin", "supervisor"])
if (roleError) return roleError

// org_id é snake_case no appUser retornado por requireAuth()
// usar appUser.org_id (não appUser.orgId)
```

### Padrão de Supabase client
Supabase client é retornado pelo próprio `requireAuth()` — não precisa importar `createClient` separadamente:
```typescript
// supabase já vem do auth result
const { supabase, appUser } = auth
const { data, error } = await supabase
  .from("brindes_destinatarios")
  .select("*")
  .eq("org_id", appUser.org_id)  // snake_case!
```

### GET com filtros e paginação (AC1)
```typescript
// Query params: obra_nome, tipo, cidade, estado, nome, page, limit
const searchParams = new URL(request.url).searchParams
let query = supabase
  .from("brindes_destinatarios")
  .select("*", { count: "exact" })
  .eq("org_id", appUser.org_id)  // snake_case!
if (searchParams.get("obra_nome")) query = query.ilike("obra_nome", `%${searchParams.get("obra_nome")}%`)
if (searchParams.get("tipo"))      query = query.eq("tipo", searchParams.get("tipo"))
if (searchParams.get("nome"))      query = query.ilike("nome", `%${searchParams.get("nome")}%`)
if (searchParams.get("cidade"))    query = query.ilike("endereco_cidade", `%${searchParams.get("cidade")}%`)
if (searchParams.get("estado"))    query = query.eq("endereco_estado", searchParams.get("estado"))
// paginação
const page = parseInt(searchParams.get("page") ?? "1")
const limit = parseInt(searchParams.get("limit") ?? "50")
const { data, error, count } = await query
  .range((page - 1) * limit, page * limit - 1)
  .order("obra_nome")
  .order("nome")
// Retornar: { data, total: count, page, limit }
```

### Upsert entregas (AC9)
```typescript
const { data, error } = await supabase
  .from("brindes_entregas")
  .upsert(
    {
      org_id: appUser.org_id,  // snake_case!
      destinatario_id,
      data_comemorativa_id,
      status,
      observacao_entrega,
      entregue_em: status === "entregue" ? new Date().toISOString() : null,
    },
    { onConflict: "destinatario_id,data_comemorativa_id" }
  )
  .select()
  .single()
```

### Lógica do parser parseEndereco (AC10-13)
```typescript
// Heurística em ordem:
// 1. Se começa com "OBRA " ou "SEDE " → referencia only
// 2. Extrair CEP: /\b\d{5}-?\d{3}\b/
// 3. Extrair estado: /[,\-\s]([A-Z]{2})\s*$/  ou no final após cidade
// 4. Extrair cidade: texto entre CEP e estado ou após último "-"
// 5. Extrair logradouro e número: início até primeira vírgula ou "Nº"
// 6. Complemento: tokens entre logradouro/número e CEP (Apto, Casa, Bloco etc.)
// Fallback: retorna { endereco_referencia: raw } para tudo que não parsear
```

### Arquivos de referência existentes
- `packages/web/src/app/api/admin/obras/route.ts` — padrão de auth + supabase client
- `packages/web/src/lib/auth.ts` — tipo AppUser, getServerUser
- `packages/web/src/lib/supabase/server.ts` — createClient

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não habilitado em `core-config.yaml`. Quality validation via revisão manual.

### Story Type Analysis
**Primary Type**: API
**Secondary Type(s)**: N/A
**Complexity**: Medium — 9 rotas + 1 utilitário, auth padrão do projeto

### Quality Gate Tasks
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint` sem erros antes de marcar completo

### CodeRabbit Focus Areas
**Primary Focus:**
- Autenticação: todas as rotas com getServerUser() e verificação de role
- org_id sempre do user autenticado (nunca do request body)
- Tratamento de erros: try/catch e respostas 4xx/5xx corretas

**Secondary Focus:**
- Parser: fallback para `endereco_referencia` quando não reconhecer formato
- Import em lote: não usar N inserts individuais para 1000+ registros

## Tasks

- [x] 1. Criar `packages/web/src/lib/brindes/parse-endereco.ts` com `parseEndereco()` (AC10-13)
- [x] 2. Criar `api/brindes/destinatarios/route.ts` — GET (list+filter) e POST (create) (AC1, AC2)
- [x] 3. Criar `api/brindes/destinatarios/[id]/route.ts` — PATCH e DELETE (AC3, AC4)
- [x] 4. Criar `api/brindes/datas/route.ts` — GET e POST (AC6, AC7)
- [x] 5. Criar `api/brindes/datas/[id]/route.ts` — PATCH (AC8)
- [x] 6. Criar `api/brindes/entregas/route.ts` — POST upsert (AC9)
- [x] 7. Criar `api/brindes/import/route.ts` — POST bulk import com parser (AC5)
- [x] 8. Verificar auth em todas as rotas (AC14, AC15, AC16)
- [x] 9. `npm run typecheck && npm run lint` sem erros

## Estimativa: 4h

## Dependências

- Story 29.1 concluída (tabelas existentes no banco)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Files Modified
- `packages/web/src/lib/brindes/parse-endereco.ts` — CRIADO (parseEndereco utility)
- `packages/web/src/app/api/brindes/destinatarios/route.ts` — CRIADO (GET + POST)
- `packages/web/src/app/api/brindes/destinatarios/[id]/route.ts` — CRIADO (PATCH + DELETE)
- `packages/web/src/app/api/brindes/datas/route.ts` — CRIADO (GET + POST)
- `packages/web/src/app/api/brindes/datas/[id]/route.ts` — CRIADO (PATCH)
- `packages/web/src/app/api/brindes/entregas/route.ts` — CRIADO (POST upsert)
- `packages/web/src/app/api/brindes/import/route.ts` — CRIADO (POST bulk import)

### Completion Notes
- Todas as 9 rotas criadas com `requireAuth()` pattern correto
- `org_id` sempre de `appUser.org_id` (snake_case) — nunca do body
- GET destinatarios: 5 filtros + paginação com `count: "exact"` 
- Import: batch insert (max 500), fallback de parser para `endereco_referencia`
- `npm run type-check` → 0 errors ✅
- `npm run lint` → 0 errors novos (7 warnings pré-existentes em outros arquivos) ✅

## Change Log

| Data | Versão | Descrição | Agente |
|------|--------|-----------|--------|
| 2026-05-13 | 1.0 | Story criada — Epic 29 Controle de Brindes | @sm (River) |
| 2026-05-13 | 1.1 | Should-Fixes: auth pattern corrigido para `requireAuth()`, filtro `estado` adicionado ao snippet GET, `org_id` snake_case | @po (Pax) |
| 2026-05-13 | 1.2 | Implementação completa: 7 arquivos criados, typecheck/lint limpos | @dev (Dex) |
