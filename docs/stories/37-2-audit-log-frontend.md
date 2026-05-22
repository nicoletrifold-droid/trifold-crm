# Story 37-2: Audit Log — API de Consulta, Filtros e Exportação CSV

## Status
Ready for Review

## Complexity
M (Medium) — 2 novas rotas API + 1 nova página + modificação da página Sistema

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** administrador da plataforma,
**I want** acessar uma página de log de atividades com filtros ricos e exportação CSV,
**so that** consiga investigar quem realizou qualquer ação no sistema, filtrar por usuário, obra, tipo de ação ou período, e extrair relatórios para auditoria externa.

## Acceptance Criteria

1. Um card/link "Log de Atividades" é adicionado na página `/dashboard/sistema` (em `page.tsx`), ao lado dos cards de Email Marketing. Clicando, navega para `/dashboard/sistema/logs`.

2. O endpoint `GET /api/admin/audit-logs` aceita os seguintes query params opcionais e retorna `{ logs: AuditLog[], total: number }`:
   - `user_id` — filtra por usuário específico
   - `action` — filtra por ação exata (ex: `obra.create`) ou prefixo de tipo (ex: `obra.` para todas as ações de obras) — usa `ILIKE 'action%'` quando termina em `.`
   - `entity_type` — filtra por tipo de entidade (`obra`, `documento`, `foto`, `session`)
   - `obra_id` — filtra por obra específica
   - `date_from` — filtra `created_at >= date_from` (ISO 8601)
   - `date_to` — filtra `created_at <= date_to` (ISO 8601)
   - `limit` — máximo de registros (default: 100, max: 500)
   - `offset` — paginação (default: 0)
   - Requer autenticação via `requireAuth()`, role `admin` exclusivamente (403 para outros roles)
   - Query filtra por `org_id` do usuário autenticado (isolamento multi-tenant)
   - Ordena por `created_at DESC`

3. O endpoint `GET /api/admin/audit-logs/export` retorna um CSV dos logs com os mesmos filtros do AC2 (sem limit/offset — exporta todos até 10.000 registros):
   - Content-Type: `text/csv; charset=utf-8`
   - Content-Disposition: `attachment; filename="audit-log-{date}.csv"` onde `{date}` é YYYYMMDD
   - Colunas CSV: `Data/Hora`, `Usuário`, `Ação`, `Tipo`, `Entidade`, `Obra`, `IP`
   - Data/Hora no formato `dd/MM/yyyy HH:mm:ss` (timezone America/Sao_Paulo)
   - Requer autenticação via `requireAuth()`, role `admin`

4. A página `/dashboard/sistema/logs` é um **Client Component** (`"use client"`):
   - Busca `GET /api/admin/audit-logs` com os filtros selecionados
   - Exibe tabela com colunas: **Data/Hora**, **Usuário**, **Ação**, **Entidade**, **Obra**, **IP**
   - A coluna **Ação** exibe label amigável (ver tabela de labels no AC5) e a coluna **Entidade** exibe `entity_name` quando disponível
   - Painel de filtros no topo com:
     - Select "Usuário" — populado com `GET /api/users` (lista de usuários da org)
     - Select "Tipo de ação" — opções fixas: Todos, Obras, Documentos, Fotos, Sessão
     - Select "Ação específica" — opções fixas baseadas no tipo selecionado (ver AC5)
     - Input "Obra ID" — campo de texto com placeholder "ID da obra"
     - Input "De" — date picker (type="date")
     - Input "Até" — date picker (type="date")
     - Botão "Filtrar" e botão "Limpar"
   - Botão "Exportar CSV" que chama `GET /api/admin/audit-logs/export` com os filtros ativos e dispara download
   - Exibe `total` de registros encontrados acima da tabela
   - Paginação simples: botões "Anterior" / "Próxima" (100 registros por página)
   - Estado de loading (skeleton ou spinner) enquanto carrega
   - Mensagem "Nenhum registro encontrado" quando `logs` é vazio

5. Labels amigáveis para o campo `action`:

   | action | Label |
   |--------|-------|
   | `obra.create` | Obra criada |
   | `obra.update` | Obra atualizada |
   | `obra.delete` | Obra arquivada |
   | `obra.reativar` | Obra reativada |
   | `documento.upload` | Documento enviado |
   | `documento.delete` | Documento excluído |
   | `documento.view` | Documento visualizado |
   | `foto.upload` | Foto enviada |
   | `foto.delete` | Foto excluída |
   | `session.login` | Login |
   | `session.logout` | Logout |
   | _outros_ | valor bruto da coluna `action` |

6. A rota `/dashboard/sistema/logs` é acessível apenas para admins. Se o usuário não for admin, redireciona para `/dashboard` (verificar via `getServerUser()` no layout ou via resposta 403 da API).

7. Os campos `metadata` dos logs **não** são exibidos na tabela principal — são detalhes internos não necessários para a visualização padrão desta story.

## Scope

### IN
- `GET /api/admin/audit-logs` com filtros e paginação
- `GET /api/admin/audit-logs/export` com CSV download
- Página `/dashboard/sistema/logs` com tabela, filtros e exportação
- Card "Log de Atividades" na página Sistema
- Labels amigáveis para actions conhecidos

### OUT
- Visualização de `metadata` na tabela (detalhes extras de cada log)
- Filtro por IP na UI (filtro técnico de menor valor para o usuário)
- Gráficos/estatísticas de atividade
- Notificações em tempo real de novas atividades
- Retenção automática / purge de logs antigos
- Paginação com cursor (offset é suficiente para MVP)
- Filtro por `entity_id` diretamente na UI (obra_id já cobre o caso de uso principal)

## Dependencies
- Story 37-1 (Must be Done) — tabela `audit_logs` + dados populados pelas rotas instrumentadas
- `requireAuth()` de `@web/lib/api-auth` — padrão já em uso
- `getServerUser()` para verificação de role no layout/page (padrão já em uso)
- `GET /api/users` — rota já existente para popular o select de usuários

## Dev Notes

### Rota `GET /api/admin/audit-logs`

```typescript
// Localização: packages/web/src/app/api/admin/audit-logs/route.ts
import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  if (appUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const user_id = searchParams.get("user_id")
  const action = searchParams.get("action")
  const entity_type = searchParams.get("entity_type")
  const obra_id = searchParams.get("obra_id")
  const date_from = searchParams.get("date_from")
  const date_to = searchParams.get("date_to")
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500)
  const offset = parseInt(searchParams.get("offset") ?? "0")

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (user_id) query = query.eq("user_id", user_id)
  if (action) {
    if (action.endsWith(".")) {
      query = query.like("action", `${action}%`)
    } else {
      query = query.eq("action", action)
    }
  }
  if (entity_type) query = query.eq("entity_type", entity_type)
  if (obra_id) query = query.eq("obra_id", obra_id)
  if (date_from) query = query.gte("created_at", date_from)
  if (date_to) query = query.lte("created_at", date_to)

  const { data: logs, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ logs: logs ?? [], total: count ?? 0 })
}
```

### Rota `GET /api/admin/audit-logs/export`

```typescript
// Localização: packages/web/src/app/api/admin/audit-logs/export/route.ts
// Mesma lógica de filtros, sem range/limit
// Retorna CSV com headers e linhas

const ACTION_LABELS: Record<string, string> = {
  "obra.create": "Obra criada",
  "obra.update": "Obra atualizada",
  "obra.delete": "Obra arquivada",
  "obra.reativar": "Obra reativada",
  "documento.upload": "Documento enviado",
  "documento.delete": "Documento excluído",
  "documento.view": "Documento visualizado",
  "foto.upload": "Foto enviada",
  "foto.delete": "Foto excluída",
  "session.login": "Login",
  "session.logout": "Logout",
}

function formatDateBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function csvEscape(val: string | null | undefined): string {
  if (!val) return ""
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

// Montar CSV:
const header = "Data/Hora,Usuário,Ação,Tipo,Entidade,Obra,IP"
const rows = logs.map(log => [
  formatDateBR(log.created_at),
  log.user_name,
  ACTION_LABELS[log.action] ?? log.action,
  log.entity_type ?? "",
  log.entity_name ?? "",
  log.obra_id ?? "",
  log.ip_address ?? "",
].map(csvEscape).join(",")).join("\n")

const csv = `${header}\n${rows}`
const date = new Date().toISOString().slice(0, 10).replace(/-/g, "")

return new Response(csv, {
  headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="audit-log-${date}.csv"`,
  },
})
```

### Exportação CSV no componente

```typescript
async function handleExport() {
  const params = buildParams() // mesma lógica de buildParams da tabela, sem offset/limit
  const res = await fetch(`/api/admin/audit-logs/export?${params}`)
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
```

### Card na página Sistema

```tsx
// Em packages/web/src/app/dashboard/sistema/page.tsx
// Adicionar import: import { History } from "lucide-react"
// Adicionar nova seção antes (ou depois) do bloco de Email Marketing:

<div className="rounded-lg border border-stone-200 bg-white">
  <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
    <History className="h-4 w-4 text-orange-600" />
    <h2 className="text-sm font-medium text-stone-700">Auditoria</h2>
  </div>
  <div className="p-4">
    <Link
      href="/dashboard/sistema/logs"
      className="flex items-center gap-2 rounded-lg border border-stone-200 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-orange-50"
    >
      <History className="h-4 w-4 text-orange-600" />
      Log de Atividades
      <span className="ml-auto text-xs text-stone-400">Auditoria completa →</span>
    </Link>
  </div>
</div>
```

### Localização dos novos arquivos
- `packages/web/src/app/api/admin/audit-logs/route.ts` (GET listagem)
- `packages/web/src/app/api/admin/audit-logs/export/route.ts` (GET CSV)
- `packages/web/src/app/dashboard/sistema/logs/page.tsx` (Client Component)

### Padrão de autenticação
- API routes: `requireAuth()` → `appUser.role === "admin"` obrigatório (403 caso contrário)
- Page: `getServerUser()` no layout ou verificação via resposta 403 da API com mensagem inline
- Client Component: `fetch("/api/admin/audit-logs")` diretamente

## Tasks

- [x] 1. Criar `packages/web/src/app/api/admin/audit-logs/route.ts` — GET com filtros, paginação, role admin
- [x] 2. Criar `packages/web/src/app/api/admin/audit-logs/export/route.ts` — GET CSV com mesmos filtros
- [x] 3. Criar `packages/web/src/app/dashboard/sistema/logs/page.tsx` — Client Component com tabela, filtros, paginação e botão exportar
- [x] 4. Modificar `packages/web/src/app/dashboard/sistema/page.tsx` — adicionar card "Log de Atividades" com link para `/dashboard/sistema/logs`
- [x] 5. Executar `npm run type-check` e `npm run lint` e corrigir todos os erros

## 🤖 CodeRabbit Integration

Story Type Analysis:
  Primary Type: Full-Stack (API + Frontend)
  Complexity: Medium

Specialized Agent Assignment:
  Primary Agents:
    - @dev (implementação + pre-commit reviews)
  Supporting Agents:
    - @qa (gate final)

Quality Gate Tasks:
  - [ ] Pre-Commit (@dev): `npm run type-check` + `npm run lint` antes de marcar completo
  - [ ] Pre-PR (@devops): review antes de criar PR

CodeRabbit Focus Areas:
  - Confirmar isolamento de org: query filtra por `org_id` do appUser em ambas as rotas
  - Confirmar que role `admin` é checado (não apenas autenticação) — 403 para outros roles
  - Confirmar que o CSV escapa corretamente valores com vírgulas e aspas
  - Confirmar que a exportação não tem limite arbitrário de 100 (deve buscar todos até 10.000)
  - Confirmar que o `URL.createObjectURL` / `revokeObjectURL` é chamado para download do CSV (sem leak)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.7 (1M context) — @dev (Dex), modo YOLO autônomo

### Completion Notes

**Decisões IDS:**
- **REUSE**: `requireAuth`, `requireRole` (`@web/lib/api-auth`), `getServerUser` (`@web/lib/auth`), padrão de query de usuários de `dashboard/configuracoes/usuarios/page.tsx`.
- **CREATE**: 2 rotas API (audit-logs + export) + 1 page (Client) + 1 layout (server guard) — todos novos por escopo único da story.
- **CREATE (não previsto na story)**: `GET /api/users` — a story afirmava que esta rota existia, mas o arquivo `api/users/route.ts` só implementava POST. Adicionei o GET (restrito a admin, escopo por org_id) reusando o mesmo padrão de query do componente legacy `usuarios/page.tsx`. Necessário para popular o select de usuários no painel de filtros (AC4).

**Implementação dos pontos levantados pelo @po:**
1. **Guard server-side**: criado `layout.tsx` em `/dashboard/sistema/logs/` que verifica `user.role === "admin"` via `getServerUser()` e redireciona não-admins para `/dashboard` (defesa em profundidade além do 403 da API).
2. **Hard cap export**: a rota `/export` busca sem `range/offset`, usando `.limit(10000)` como teto absoluto.
3. **BOM UTF-8 no CSV**: prepended `﻿` ao CSV — Excel pt-BR abre com encoding correto sem mojibake.

**Detalhes notáveis:**
- Filtro de tipo+ação no frontend traduz para os params do backend: `type=obra, action=""` → envia `entity_type=obra` + `action=obra.` (prefix); `type=obra, action=obra.create` → envia `entity_type=obra` + `action=obra.create` (exato). O backend usa `ILIKE` quando a ação termina em `.`.
- Filtros de data convertem `YYYY-MM-DD` (input date) para `YYYY-MM-DDT00:00:00` (from) e `YYYY-MM-DDT23:59:59.999` (to) para inclusão do dia inteiro.
- Filtros em "draft" vs "applied" no frontend: refetch só dispara ao clicar em "Filtrar", evitando flood de requisições durante digitação.
- `URL.createObjectURL` + `URL.revokeObjectURL` aplicados corretamente — sem leak de memória no download.
- CSV escape lida com `,`, `"`, `\n`, `\r`; valores `null/undefined` → string vazia.
- Backend: paginação usa `Number.isFinite` e clamp para evitar inputs inválidos (`limit` negativo, `offset` NaN).

### Debug Log References

**type-check final:**
```
../shared/src/types/commercial-rules.ts(14,19): error TS2307: Cannot find module 'zod' or its corresponding type declarations.
```
Erro pré-existente no package `packages/shared` (validado via `git stash` antes da implementação). **Zero erros novos introduzidos por esta story.**

**lint final:**
- 2 errors + 8 warnings — TODOS pré-existentes em arquivos fora do escopo desta story (`lead-detail-drawer.tsx`, `campaign-detail-client.tsx`, rotas de `email-automations`, `email-blasts`, `cron/enrich-leads` etc).
- **Zero erros/warnings introduzidos pelos arquivos desta story.**

## File List

- `packages/web/src/app/api/admin/audit-logs/route.ts` (criado)
- `packages/web/src/app/api/admin/audit-logs/export/route.ts` (criado)
- `packages/web/src/app/dashboard/sistema/logs/layout.tsx` (criado — server guard de role admin)
- `packages/web/src/app/dashboard/sistema/logs/page.tsx` (criado)
- `packages/web/src/app/dashboard/sistema/page.tsx` (modificado — card Auditoria)
- `packages/web/src/app/api/users/route.ts` (modificado — adicionado GET para listar usuários da org)

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-22 | @sm | Story criada |
| 2026-05-22 | @po | Validada (9/10 — GO). Status Draft → Ready. Observações: (1) Implementar guard de role admin no layout.tsx server-side além do 403 da API; (2) Lógica de query da rota export precisa ser implementada com hard cap .limit(10000) sem range/offset; (3) Considerar BOM UTF-8 no CSV para compatibilidade com Excel pt-BR. |
| 2026-05-22 | @dev | Implementação completa (YOLO). 6 arquivos: 2 API routes (listagem + export CSV), 1 layout server-guard, 1 page Client, 1 card adicionado em sistema/page.tsx, 1 GET adicionado em api/users (não existia apesar da story afirmar). Todas as 3 observações do @po endereçadas. type-check e lint OK (sem erros novos). Status Ready → Ready for Review. |
