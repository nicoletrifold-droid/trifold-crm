# Story 37-3: Audit Log — Expansão para Clientes, Leads e Permissões

## Status
Ready for Review

## Complexity
S (Small) — sem migration, sem novo schema; instrumentação de 9 rotas existentes + expansão de filtros no frontend

## Executor Assignment
```yaml
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run type-check", "npm run lint"]
```

## Story

**As a** administrador da plataforma,
**I want** que o log de atividades também registre mudanças em clientes, leads e permissões de usuários,
**so that** eu consiga rastrear quem criou ou excluiu um cliente, quem alterou a etapa de um lead, quem mudou a role de um usuário — e filtrar por esses tipos na página de logs.

## Acceptance Criteria

1. As seguintes rotas são instrumentadas com `logAudit()` após sucesso (nunca antes, nunca em erro):

   | Arquivo | Método | action | entity_type | entity_name |
   |---------|--------|--------|-------------|-------------|
   | `api/admin/clientes/route.ts` | POST | `cliente.create` | `cliente` | `cliente.nome` |
   | `api/admin/clientes/[id]/route.ts` | PATCH | `cliente.update` | `cliente` | `cliente.nome` (do registro atualizado) |
   | `api/admin/clientes/[id]/route.ts` | DELETE | `cliente.delete` | `cliente` | `cliente.nome` (do snapshot antes do delete) |
   | `api/leads/route.ts` | POST | `lead.create` | `lead` | `lead.name` |
   | `api/leads/[id]/route.ts` | PATCH | `lead.update` | `lead` | `lead.name` (do registro atualizado) |
   | `api/leads/[id]/route.ts` | DELETE | `lead.delete` | `lead` | nome do lead (buscar antes do soft delete) |
   | `api/leads/[id]/stage/route.ts` | POST | `lead.stage_change` | `lead` | `lead.name` (buscar junto ao lead) |
   | `api/leads/[id]/mark-lost/route.ts` | POST | `lead.mark_lost` | `lead` | nome do lead (buscar antes da atualização) |
   | `api/users/[id]/route.ts` | PATCH | `permissao.update` | `permissao` | nome do usuário alvo |

2. Para `lead.stage_change`, `metadata` inclui `{ from_stage: { id, name }, to_stage: { id, name } }` — dados já disponíveis na rota.

3. Para `permissao.update`, `metadata` inclui os campos efetivamente alterados:
   - Se `role` mudou: `{ field: "role", from: valorAnterior, to: novoValor }`
   - Se `is_active` mudou: `{ field: "is_active", to: novoValor }`
   - Se ambos mudaram: array `[{ field: "role", ... }, { field: "is_active", ... }]`
   - Buscar valores anteriores com `.select("id, name, role, is_active").eq("id", id)` antes do update

4. Para `lead.mark_lost`, `metadata` inclui `{ reason, type }` quando disponíveis no body.

5. Leads **não têm** `obra_id` — o campo `obra_id` é omitido (ou `undefined`) em todos os eventos de lead e permissão.

6. A rota `mark-lost` usa `getServerUser()` de `@web/lib/auth` (não `requireAuth()`). O objeto retornado tem `user.id`, `user.orgId` (camelCase), `user.name`, `user.role`. Usar `org_id: user.orgId` ao chamar `logAudit()`.

7. A página `/dashboard/sistema/logs/page.tsx` é atualizada para incluir os novos `entity_type` no select "Tipo de entidade":
   - Opções existentes: Todos, Obras, Documentos, Fotos, Sessão
   - Novas opções: Clientes, Leads, Permissões (enviando `entity_type=cliente`, `lead`, `permissao`)

8. As labels na tabela de logs (e no CSV de exportação) são expandidas com:

   | action | Label |
   |--------|-------|
   | `cliente.create` | Cliente criado |
   | `cliente.update` | Cliente atualizado |
   | `cliente.delete` | Cliente excluído |
   | `lead.create` | Lead criado |
   | `lead.update` | Lead atualizado |
   | `lead.delete` | Lead excluído |
   | `lead.stage_change` | Lead — etapa alterada |
   | `lead.mark_lost` | Lead marcado como perdido |
   | `permissao.update` | Permissão alterada |

   Essas labels devem ser adicionadas no objeto `ACTION_LABELS` presente tanto em `dashboard/sistema/logs/page.tsx` quanto em `api/admin/audit-logs/export/route.ts`.

## Scope

### IN
- Instrumentação das 9 rotas listadas no AC1
- Expansão do select "Tipo de entidade" na página de logs (AC7)
- Expansão das `ACTION_LABELS` em `page.tsx` e `export/route.ts` (AC8)

### OUT
- Instrumentação de mensagens/chat (escopo futuro)
- Instrumentação de configurações de email (escopo futuro)
- Instrumentação de webhooks ou cron jobs
- Instrumentação de ações de broker (role não coberta por `requireAuth` admin/supervisor)
- Filtros adicionais na UI além dos entity_types
- Novos campos na migration — tabela `audit_logs` já é suficiente

## Dependencies
- Story 37-1 (Done) — tabela `audit_logs` + helper `logAudit()` + `getRequestIp()`
- Story 37-2 (Done) — página `/dashboard/sistema/logs/page.tsx` e `export/route.ts` com `ACTION_LABELS`
- `logAudit()` de `@web/lib/audit` — já criado e em uso
- `getRequestIp()` de `@web/lib/audit` — já criado e em uso
- `getServerUser()` de `@web/lib/auth` — já em uso em `mark-lost` (retorna `{ id, orgId, name, role }`)

## Dev Notes

### Padrão de instrumentação (rotas com `requireAuth`)

```typescript
// Após sucesso, antes do return:
const ip = getRequestIp(request.headers)
void logAudit({
  org_id: appUser.org_id,
  user_id: appUser.id,
  user_name: appUser.name,
  action: "cliente.create",
  entity_type: "cliente",
  entity_id: data.id,
  entity_name: data.nome,  // campo é 'nome', não 'name'
  ip_address: ip,
})
```

### Padrão especial — `mark-lost` (usa `getServerUser`)

```typescript
// user = await getServerUser() — já disponível na rota
void logAudit({
  org_id: user.orgId,       // atenção: camelCase orgId
  user_id: user.id,
  user_name: user.name,
  action: "lead.mark_lost",
  entity_type: "lead",
  entity_id: id,            // lead id dos params
  entity_name: leadName,    // buscar: select("name").eq("id", id) antes do update
  metadata: { reason, type: body.type ?? "represamento" },
  ip_address: getRequestIp(req.headers),
})
```

### Snapshot para `permissao.update` (buscar antes do update)

```typescript
// Antes de aplicar publicUpdates:
const { data: targetUser } = await supabase
  .from("users")
  .select("id, name, role, is_active")
  .eq("id", id)
  .eq("org_id", appUser.org_id)
  .maybeSingle()

// Montar metadata com campos que efetivamente mudam:
const changes: Record<string, unknown>[] = []
if (publicUpdates.role && targetUser?.role !== publicUpdates.role) {
  changes.push({ field: "role", from: targetUser?.role, to: publicUpdates.role })
}
if (publicUpdates.is_active !== undefined && targetUser?.is_active !== publicUpdates.is_active) {
  changes.push({ field: "is_active", to: publicUpdates.is_active })
}

// Após update bem-sucedido:
void logAudit({
  org_id: appUser.org_id,
  user_id: appUser.id,
  user_name: appUser.name,
  action: "permissao.update",
  entity_type: "permissao",
  entity_id: id,
  entity_name: targetUser?.name ?? id,
  metadata: changes.length === 1 ? changes[0] : { changes },
  ip_address: getRequestIp(request.headers),
})
```

### Snapshot para `lead.delete` (buscar nome antes do softDelete)

```typescript
// api/leads/[id]/route.ts DELETE
// A função softDelete() não retorna o nome — buscar antes:
const { data: leadSnapshot } = await supabase
  .from("leads")
  .select("id, name")
  .eq("id", id)
  .eq("org_id", appUser.org_id)
  .maybeSingle()

const result = await softDelete(supabase, "leads", id, appUser.org_id)
if (result.error) return result.error

void logAudit({
  org_id: appUser.org_id,
  user_id: appUser.id,
  user_name: appUser.name,
  action: "lead.delete",
  entity_type: "lead",
  entity_id: id,
  entity_name: leadSnapshot?.name ?? id,
  ip_address: getRequestIp(_req.headers),
})
```

### Expansão de ACTION_LABELS (2 arquivos)

Adicionar as 9 novas entradas ao objeto `ACTION_LABELS` em:
- `packages/web/src/app/dashboard/sistema/logs/page.tsx`
- `packages/web/src/app/api/admin/audit-logs/export/route.ts`

### Expansão do select "Tipo de entidade" na página de logs

```tsx
// Adicionar após a opção "Sessão":
<option value="cliente">Clientes</option>
<option value="lead">Leads</option>
<option value="permissao">Permissões</option>
```

### Localização dos arquivos a modificar
- `packages/web/src/app/api/admin/clientes/route.ts` (POST)
- `packages/web/src/app/api/admin/clientes/[id]/route.ts` (PATCH + DELETE)
- `packages/web/src/app/api/leads/route.ts` (POST)
- `packages/web/src/app/api/leads/[id]/route.ts` (PATCH + DELETE)
- `packages/web/src/app/api/leads/[id]/stage/route.ts` (POST)
- `packages/web/src/app/api/leads/[id]/mark-lost/route.ts` (POST)
- `packages/web/src/app/api/users/[id]/route.ts` (PATCH)
- `packages/web/src/app/dashboard/sistema/logs/page.tsx` (ACTION_LABELS + select)
- `packages/web/src/app/api/admin/audit-logs/export/route.ts` (ACTION_LABELS)

## Tasks

- [x] 1. Instrumentar `api/admin/clientes/route.ts` (POST → `cliente.create`)
- [x] 2. Instrumentar `api/admin/clientes/[id]/route.ts` (PATCH → `cliente.update`, DELETE → `cliente.delete`)
- [x] 3. Instrumentar `api/leads/route.ts` (POST → `lead.create`)
- [x] 4. Instrumentar `api/leads/[id]/route.ts` (PATCH → `lead.update`, DELETE → `lead.delete` com snapshot)
- [x] 5. Instrumentar `api/leads/[id]/stage/route.ts` (POST → `lead.stage_change` com metadata from/to stage)
- [x] 6. Instrumentar `api/leads/[id]/mark-lost/route.ts` (POST → `lead.mark_lost` via `getServerUser`)
- [x] 7. Instrumentar `api/users/[id]/route.ts` (PATCH → `permissao.update` com snapshot de campos alterados)
- [x] 8. Expandir `ACTION_LABELS` e select de entity_type em `logs/page.tsx` e `export/route.ts`
- [x] 9. Executar `npm run type-check` e `npm run lint` e corrigir todos os erros

## 🤖 CodeRabbit Integration

Story Type Analysis:
  Primary Type: Backend (instrumentação) + Frontend (UI mínima)
  Complexity: Small

Specialized Agent Assignment:
  Primary Agents:
    - @dev (implementação + pre-commit reviews)
  Supporting Agents:
    - @qa (gate final)

Quality Gate Tasks:
  - [ ] Pre-Commit (@dev): `npm run type-check` + `npm run lint` antes de marcar completo
  - [ ] Pre-PR (@devops): review antes de criar PR

CodeRabbit Focus Areas:
  - Confirmar que `org_id: user.orgId` (camelCase) é usado em `mark-lost` — nunca `user.org_id`
  - Confirmar que `entity_name` de clientes usa `data.nome` (não `data.name`)
  - Confirmar que snapshot de `lead.delete` é feito ANTES de `softDelete()`
  - Confirmar que snapshot de `permissao.update` é feito ANTES de aplicar `publicUpdates`
  - Confirmar que `logAudit()` nunca bloqueia o fluxo principal (`void logAudit(...)`)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.7 (1M) — @dev (Dex), modo YOLO

### Completion Notes

**Implementação (9 rotas + 2 arquivos de UI/labels):**

1. `api/admin/clientes/route.ts` (POST): `logAudit("cliente.create")` após sucesso; `entity_name: data.nome` (campo correto).
2. `api/admin/clientes/[id]/route.ts`:
   - PATCH: `logAudit("cliente.update")` após sucesso; `entity_name: data.nome`.
   - DELETE: Snapshot do `nome` capturado **ANTES** do `delete()` (expandido o `.select("id")` existente para `.select("id, nome")` — sem query extra).
3. `api/leads/route.ts` (POST): `logAudit("lead.create")` após sucesso, junto ao `triggerAutomations`.
4. `api/leads/[id]/route.ts`:
   - PATCH: `logAudit("lead.update")` após sucesso; `entity_name` do registro atualizado.
   - DELETE: Snapshot do `name` **ANTES** do `softDelete()` (a função não retorna o nome — confirmado).
5. `api/leads/[id]/stage/route.ts` (POST): `logAudit("lead.stage_change")` com `metadata: { from_stage, to_stage }` — `fromStage` já estava disponível na rota antes do update.
6. `api/leads/[id]/mark-lost/route.ts` (POST): Usa `getServerUser()` → `user.orgId` (camelCase, validado). Snapshot do `name` **ANTES** do update. `metadata: { reason, type }`.
7. `api/users/[id]/route.ts` (PATCH): Refatorado o fetch existente do `auth_id` para um snapshot único de `(id, auth_id, name, role, is_active)` aplicado SEMPRE (não apenas quando `needsAuthUpdate`) — fonte única de verdade para snapshot do audit log + auth_id, com a mesma proteção de cross-org. Audit log emitido apenas quando `role` e/ou `is_active` efetivamente mudaram (atualização só de nome/email/senha NÃO gera evento de permissão).
8. `dashboard/sistema/logs/page.tsx`: Adicionadas 9 entradas a `ACTION_LABELS`. Expandido `ACTION_TYPES` com `cliente`, `lead`, `permissao` — isto cobre tanto o filtro "Tipo de entidade" (AC7) quanto a UI de "Ação específica" para os novos tipos.
9. `api/admin/audit-logs/export/route.ts`: Adicionadas as mesmas 9 entradas a `ACTION_LABELS` (CSV).

**Padrões aplicados:**
- `void logAudit(...)` em todas as chamadas (fire-and-forget, nunca bloqueia).
- `logAudit` sempre APÓS sucesso da operação principal (nunca antes, nunca em erro).
- `getRequestIp(request.headers)` consistente em todas as rotas (`req.headers` em `mark-lost`).
- `obra_id` omitido em todos os eventos de cliente/lead/permissão (AC5).
- TODOS os snapshots críticos feitos antes do mutate, conforme @po validou.

**Decisões autônomas (YOLO):**
- `[AUTO-DECISION] users/[id] snapshot strategy → consolidar o fetch de auth_id existente num snapshot único que sempre executa (carrega name, role, is_active também). Razão: evita duplicação de query e mantém a verificação cross-org já existente. O `targetAuthId` agora deriva do snapshot consolidado quando `needsAuthUpdate`.`
- `[AUTO-DECISION] permissao.update emite só com mudança real de role/is_active → atualização exclusiva de nome/email/senha não gera evento de "permissão alterada". Razão: o AC3 define explicitamente metadata por mudança de role OU is_active; atualizar só o nome não é mudança de permissão.`
- `[AUTO-DECISION] expandir ACTION_TYPES em vez de adicionar <option> hardcoded → o select "Tipo de entidade" é renderizado a partir de ACTION_TYPES. Adicionar lá cobre o AC7 e também habilita o filtro de "Ação específica" para os novos tipos, dando ao admin granularidade igual à existente (ex.: filtrar só lead.stage_change).`

### Debug Log References

**Quality gates (Task 9):**
- `npm run type-check`: PASS (somente 1 erro pré-existente em `packages/shared/src/types/commercial-rules.ts` — módulo `zod` não encontrado; nada relacionado aos arquivos desta story).
- `npm run lint`: PASS para os arquivos da story (`grep -E "api/(admin/clientes|leads|admin/audit-logs|users)|dashboard/sistema/logs"` → NO ISSUES). Os 2 erros e 8 warnings reportados são pré-existentes em arquivos fora do escopo (ex.: `lead-detail-drawer.tsx:181` ref-during-render).

**IDS notes:**
- REUSE: `logAudit()` + `getRequestIp()` de `@web/lib/audit` (helper já existente da Story 37-1).
- REUSE: `requireAuth()` / `requireRole()` / `getServerUser()` / `softDelete()` — todos os helpers já em uso nas rotas.
- ADAPT (mínimo): em `users/[id]/route.ts`, o fetch de `auth_id` existente foi expandido para incluir `name, role, is_active` (mesma query, colunas adicionais) — sem mudança de comportamento, sem novos consumers.

## File List

- `packages/web/src/app/api/admin/clientes/route.ts` (modificado)
- `packages/web/src/app/api/admin/clientes/[id]/route.ts` (modificado)
- `packages/web/src/app/api/leads/route.ts` (modificado)
- `packages/web/src/app/api/leads/[id]/route.ts` (modificado)
- `packages/web/src/app/api/leads/[id]/stage/route.ts` (modificado)
- `packages/web/src/app/api/leads/[id]/mark-lost/route.ts` (modificado)
- `packages/web/src/app/api/users/[id]/route.ts` (modificado)
- `packages/web/src/app/dashboard/sistema/logs/page.tsx` (modificado)
- `packages/web/src/app/api/admin/audit-logs/export/route.ts` (modificado)

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-05-22 | @sm | Story criada |
| 2026-05-22 | @po | Validate-story-draft executado: GO 10/10. Confirmados contra source: (1) `mark-lost/route.ts` usa `user.orgId` camelCase; (2) `clientes/route.ts` usa campo `nome`; (3) `leads/[id]/route.ts` usa `softDelete()` sem retorno de nome → snapshot ANTES é necessário; (4) `users/[id]/route.ts` aplica `publicUpdates` direto → snapshot ANTES. Status Draft → Ready. |
| 2026-05-22 | @dev | Implementação YOLO concluída. 9 rotas instrumentadas + ACTION_LABELS e ACTION_TYPES expandidos em logs/page.tsx e export/route.ts. Snapshots `ANTES` em lead.delete, lead.mark_lost, cliente.delete (via expansão do select existente), permissao.update (snapshot consolidado). `user.orgId` (camelCase) usado em mark-lost. `void logAudit(...)` fire-and-forget em todas as chamadas. Quality gates: type-check e lint sem erros novos nos arquivos da story. Status InProgress → Ready for Review. |
