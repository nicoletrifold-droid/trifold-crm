# Story 37-1: Audit Log — Migration, Helper e Instrumentação de Rotas

## Status
Ready for Review

## Complexity
M (Medium) — 1 migration nova, 1 helper novo, instrumentação em ~11 rotas/actions existentes

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** administrador da plataforma,
**I want** que todas as ações críticas dos usuários sejam registradas automaticamente em um log de atividades,
**so that** eu possa rastrear quem fez o quê e quando, para fins de auditoria, segurança e resolução de disputas.

## Acceptance Criteria

1. A migration `supabase/migrations/059_audit_logs.sql` cria a tabela `audit_logs` com as colunas:
   - `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
   - `org_id UUID NOT NULL`
   - `user_id UUID NOT NULL` — ID do user em `public.users`
   - `user_name TEXT NOT NULL` — snapshot do nome no momento da ação
   - `action TEXT NOT NULL` — identificador da ação (ex: `obra.create`, `session.login`)
   - `entity_type TEXT` — tipo da entidade afetada (`obra`, `documento`, `foto`, `cliente`, `permissao`, `session`)
   - `entity_id TEXT` — UUID ou ID da entidade afetada
   - `entity_name TEXT` — nome legível da entidade (ex: nome da obra, nome do documento)
   - `obra_id UUID` — denormalizado para facilitar filtro por obra
   - `metadata JSONB DEFAULT '{}'` — detalhes extras (categoria, tamanho, campo alterado, etc.)
   - `ip_address TEXT` — IP da requisição (opcional)
   - `created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL`
   - Índices em: `org_id`, `user_id`, `obra_id` (partial WHERE NOT NULL), `action`, `created_at DESC`, `entity_type`

2. A tabela tem RLS configurado:
   - `SELECT`: role `admin` da mesma `org_id`
   - `INSERT`: bloqueado para usuários — apenas service_role pode inserir (o helper usa `createAdminClient()`)
   - `UPDATE`/`DELETE`: NENHUM (logs são imutáveis)

3. O helper `packages/web/src/lib/audit.ts` exporta a função `logAudit(params: AuditParams): Promise<void>`:
   - Usa `createAdminClient()` de `@web/lib/supabase/admin` para o insert (service_role bypassa RLS)
   - Erros de insert são silenciados (não lançam exceção) — falha de auditoria NUNCA quebra a ação principal
   - Interface `AuditParams`: `{ org_id, user_id, user_name, action, entity_type?, entity_id?, entity_name?, obra_id?, metadata?, ip_address? }`

4. As seguintes rotas/actions são instrumentadas com `logAudit()` após sucesso (nunca antes, nunca em caso de erro):

   | Arquivo | Evento | action | entity_type |
   |---------|--------|--------|-------------|
   | `api/admin/obras` POST | criação | `obra.create` | `obra` |
   | `api/admin/obras/[obra_id]` PATCH (deleted_at!=null) | atualização | `obra.update` | `obra` |
   | `api/admin/obras/[obra_id]` PATCH (deleted_at=null) | reativação | `obra.reativar` | `obra` |
   | `api/admin/obras/[obra_id]` DELETE | exclusão (soft) | `obra.delete` | `obra` |
   | `api/admin/obras/[obra_id]/documentos` POST | upload | `documento.upload` | `documento` |
   | `api/admin/obras/[obra_id]/documentos/[doc_id]` DELETE | exclusão | `documento.delete` | `documento` |
   | `api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url` GET | visualização | `documento.view` | `documento` |
   | `api/admin/obras/[obra_id]/fotos` POST | upload | `foto.upload` | `foto` |
   | `api/admin/obras/[obra_id]/fotos/[foto_id]` DELETE | exclusão | `foto.delete` | `foto` |
   | `login/actions.ts` login() | login | `session.login` | `session` |
   | `api/auth/logout` POST | logout | `session.logout` | `session` |

5. Para cada `logAudit()` chamado, o campo `obra_id` é preenchido quando a ação está relacionada a uma obra (documentos, fotos, obras), e `null` nas demais (session).

6. Para `documento.upload` e `foto.upload`, `metadata` inclui `{ filename, file_size_bytes }`. Para `obra.update` que inclui mudança de `status`, `metadata` inclui `{ field: "status", from: oldValue, to: newValue }` quando disponível. Para `session.login`, `metadata` inclui `{ role }`.

7. O IP da requisição (`ip_address`) é populado nas rotas Next.js via `request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip")`. Para o login (server action), omitir `ip_address` (não disponível sem request object).

## Scope

### IN
- Migration `059_audit_logs.sql` com RLS
- Helper `packages/web/src/lib/audit.ts`
- Instrumentação das 11 rotas/actions listadas no AC4
- `obra_id`, `entity_name` preenchidos com dados já disponíveis no contexto das rotas

### OUT
- Instrumentação de rotas de clientes, permissões de usuários, mensagens — próxima iteração
- Log de ações de broker/cliente (apenas usuários admin/supervisor/obras nesta story)
- API de consulta dos logs — Story 37-2
- Frontend de visualização — Story 37-2
- Retenção automática / purge de logs antigos
- Exportação de logs — Story 37-2

## Dependencies
- `createAdminClient()` de `@web/lib/supabase/admin` — já existe, usado em outros handlers
- `requireAuth()` de `@web/lib/api-auth` — padrão já em uso em todas as rotas instrumentadas
- Bucket `obra-docs` e `obra-fotos` já existem — não há mudança de storage
- Migrations anteriores: `058_obras_soft_delete.sql` — esta é a `059`

## Dev Notes

### Migration `059_audit_logs.sql`

```sql
CREATE TABLE audit_logs (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id       UUID        NOT NULL,
  user_id      UUID        NOT NULL,
  user_name    TEXT        NOT NULL,
  action       TEXT        NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT,
  entity_name  TEXT,
  obra_id      UUID,
  metadata     JSONB       DEFAULT '{}' NOT NULL,
  ip_address   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_audit_logs_org_id      ON audit_logs (org_id);
CREATE INDEX idx_audit_logs_user_id     ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_obra_id     ON audit_logs (obra_id) WHERE obra_id IS NOT NULL;
CREATE INDEX idx_audit_logs_action      ON audit_logs (action);
CREATE INDEX idx_audit_logs_created_at  ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs (entity_type);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admin da mesma org pode ler
CREATE POLICY "audit_logs_select_admin"
  ON audit_logs FOR SELECT
  USING (
    org_id = (
      SELECT org_id FROM users WHERE auth_id = auth.uid()
    )
    AND (
      SELECT role FROM users WHERE auth_id = auth.uid()
    ) = 'admin'
  );

-- INSERT é bloqueado para usuários (service_role bypassa RLS)
CREATE POLICY "audit_logs_no_insert"
  ON audit_logs FOR INSERT
  WITH CHECK (false);
```

### Helper `packages/web/src/lib/audit.ts`

```typescript
import { createAdminClient } from "@web/lib/supabase/admin"

export interface AuditParams {
  org_id: string
  user_id: string
  user_name: string
  action: string
  entity_type?: string
  entity_id?: string
  entity_name?: string
  obra_id?: string
  metadata?: Record<string, unknown>
  ip_address?: string
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("audit_logs").insert({
      org_id: params.org_id,
      user_id: params.user_id,
      user_name: params.user_name,
      action: params.action,
      entity_type: params.entity_type ?? null,
      entity_id: params.entity_id ?? null,
      entity_name: params.entity_name ?? null,
      obra_id: params.obra_id ?? null,
      metadata: params.metadata ?? {},
      ip_address: params.ip_address ?? null,
    })
  } catch {
    // silently ignore — audit failure must never break the main action
  }
}
```

### Exemplo de instrumentação — `api/admin/obras/[obra_id]/documentos` POST

```typescript
// Após insert bem-sucedido e antes do return 201:
const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
await logAudit({
  org_id: appUser.org_id,
  user_id: appUser.id,
  user_name: appUser.name,
  action: "documento.upload",
  entity_type: "documento",
  entity_id: insertedDoc.id,
  entity_name: insertedDoc.name,
  obra_id: obra_id,
  metadata: { filename: insertedDoc.filename, file_size_bytes: insertedDoc.file_size_bytes },
  ip_address: ip,
})
```

### Exemplo de instrumentação — `login/actions.ts`

```typescript
// Após obter appUser com sucesso e antes do redirect:
await logAudit({
  org_id: appUser.org_id,
  user_id: appUser.id,
  user_name: appUser.name ?? "unknown",
  action: "session.login",
  entity_type: "session",
  metadata: { role: appUser.role },
  // ip_address omitido — server action não expõe request object
})
```

### Exemplo de instrumentação — `api/auth/logout` POST

```typescript
// Antes de signOut, obter user:
const { data: { user } } = await supabase.auth.getUser()
if (user) {
  const { data: appUser } = await supabase
    .from("users")
    .select("id, name, role, org_id")
    .eq("auth_id", user.id)
    .maybeSingle()
  if (appUser) {
    const ip = request.headers.get("x-forwarded-for") ?? undefined
    await logAudit({
      org_id: appUser.org_id,
      user_id: appUser.id,
      user_name: appUser.name,
      action: "session.logout",
      entity_type: "session",
      ip_address: ip,
    })
  }
}
await supabase.auth.signOut()
```

### Padrão de autenticação
- `requireAuth()` → `appUser.id`, `appUser.name`, `appUser.org_id` disponíveis em todas as rotas instrumentadas
- `logAudit()` usa `createAdminClient()` internamente — não expõe cliente admin nas rotas
- `.maybeSingle()` (nunca `.single()`) para lookup de entidade antes de logar

### Localização dos arquivos
- `supabase/migrations/059_audit_logs.sql` (novo)
- `packages/web/src/lib/audit.ts` (novo)
- 11 arquivos de rotas/actions existentes modificados (listados no AC4)

## Tasks

- [x] 1. Criar `supabase/migrations/059_audit_logs.sql` com tabela, índices e RLS
- [x] 2. Criar `packages/web/src/lib/audit.ts` com helper `logAudit()` + `getRequestIp()`
- [x] 3. Instrumentar `api/admin/obras/route.ts` (POST → `obra.create`)
- [x] 4. Instrumentar `api/admin/obras/[obra_id]/route.ts` (PATCH → `obra.update` ou `obra.reativar`; DELETE → `obra.delete`)
- [x] 5. Instrumentar `api/admin/obras/[obra_id]/documentos/route.ts` (POST → `documento.upload`)
- [x] 6. Instrumentar `api/admin/obras/[obra_id]/documentos/[doc_id]/route.ts` (DELETE → `documento.delete`)
- [x] 7. Instrumentar `api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url/route.ts` (GET → `documento.view`)
- [x] 8. Instrumentar `api/admin/obras/[obra_id]/fotos/route.ts` (POST → `foto.upload`)
- [x] 9. Instrumentar `api/admin/obras/[obra_id]/fotos/[foto_id]/route.ts` (DELETE → `foto.delete`)
- [x] 10. Instrumentar `app/login/actions.ts` (login → `session.login`)
- [x] 11. Instrumentar `api/auth/logout/route.ts` (POST → `session.logout`)
- [x] 12. Executar `npm run type-check` e `npm run lint` — erros pré-existentes apenas (sem novos erros)

## 🤖 CodeRabbit Integration

Story Type Analysis:
  Primary Type: Full-Stack (Migration + Backend)
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
  - Confirmar que erros do `logAudit()` são silenciados (try/catch) — falha de auditoria não pode quebrar o fluxo principal
  - Confirmar que INSERT usa `createAdminClient()` (service_role), não o cliente do usuário (que seria bloqueado pelo RLS)
  - Confirmar que `logAudit()` é chamado APÓS sucesso da ação principal, nunca antes
  - Confirmar que `obra_id` é preenchido para ações de documento/foto (não apenas para ações de obra)
  - Confirmar RLS: SELECT apenas para admin da mesma org, INSERT bloqueado para usuários

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- Migration `059_audit_logs.sql`: tabela com 12 colunas, 6 índices, RLS (SELECT admin-only, INSERT bloqueado, UPDATE/DELETE bloqueados)
- Helper `audit.ts`: `logAudit()` fire-and-forget com try/catch silencioso + `getRequestIp()` para extração de IP
- PATCH de obras: diferencia `obra.reativar` (body.deleted_at === null) de `obra.update` — metadata com status diff quando campo alterado
- Todas as 11 rotas/actions instrumentadas com `void logAudit(...)` (fire-and-forget)
- Erros pré-existentes: `shared/commercial-rules.ts` (Cannot find 'zod') e `lead-detail-drawer.tsx` (ref during render) — não relacionados a esta story

### Debug Log References
Nenhum

## File List

- `supabase/migrations/059_audit_logs.sql` (criado)
- `packages/web/src/lib/audit.ts` (criado)
- `packages/web/src/app/api/admin/obras/route.ts` (modificado)
- `packages/web/src/app/api/admin/obras/[obra_id]/route.ts` (modificado)
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts` (modificado)
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/[doc_id]/route.ts` (modificado)
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/[doc_id]/signed-url/route.ts` (modificado)
- `packages/web/src/app/api/admin/obras/[obra_id]/fotos/route.ts` (modificado)
- `packages/web/src/app/api/admin/obras/[obra_id]/fotos/[foto_id]/route.ts` (modificado)
- `packages/web/src/app/login/actions.ts` (modificado)
- `packages/web/src/app/api/auth/logout/route.ts` (modificado)

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-22 | @sm | Story criada |
| 2026-05-22 | @po | Validada (9.5/10 — GO). Status Draft → Ready. Observação: confirmar lógica de obra.update vs obra.reativar conforme snapshot de deleted_at antes/depois. |
| 2026-05-22 | @dev | Implementação completa — 12 tasks concluídas. Status → Ready for Review |
