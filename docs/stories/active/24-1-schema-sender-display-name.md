---
epic: 24
story: 24.1
title: Schema — sender_display_name + View de Auditoria Admin
status: InReview
priority: P0
created_at: 2026-05-11
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [migration_apply, rls_validation, api_response_shape, type_check]
complexity: S
estimated_hours: 2
depends_on: ["20.1a", "20.4", "20.5"]
blocks: ["24.2", "24.3"]
---

# Story 24.1 — Schema: sender_display_name + View de Auditoria Admin

## Contexto

**Epic 24 — Central de Mensagens: Admin ↔ Cliente**

Epic 20 está completo. A tabela `obra_mensagens` existe com `sender_id` (FK → `users`)
e `sender_type` (`'cliente'`|`'equipe'`). O portal do cliente já exibe "Equipe Trifold"
para mensagens da equipe (anonimização visual ✅).

**Problema atual:** O `admin-chat-feed.tsx` exibe o nome do admin **atualmente logado**
para TODAS as mensagens da equipe — independente de quem realmente enviou. Isso porque
o componente recebe `adminName` como prop genérico em vez de usar o nome real por mensagem.
O `sender_id` é gravado no banco mas não é usado para recuperar o nome no admin.

**Esta story:** Resolve a raiz do problema adicionando `sender_display_name` diretamente
em `obra_mensagens` (snapshot imutável no momento do envio), e cria a view
`v_mensagens_admin` usada pelo hub da Story 24.2.

## Story Statement

**Como** administrador da Trifold,
**Quero** que cada mensagem enviada pela equipe registre o nome real de quem a enviou,
**Para que** eu possa auditar internamente quem disse o quê para cada cliente.

## Acceptance Criteria

- [ ] **AC1 — Migration:** `supabase/migrations/024_mensagens_sender_display_name.sql` criada e aplicável:
  - `ALTER TABLE obra_mensagens ADD COLUMN sender_display_name varchar(255);`
  - Coluna nullable para compatibilidade com mensagens existentes
  - Backfill: `UPDATE obra_mensagens m SET sender_display_name = u.name FROM users u WHERE m.sender_id = u.id AND m.sender_type = 'equipe';`
  - Coluna permanece NULL para mensagens de clientes (não é necessário)

- [ ] **AC2 — View `v_mensagens_admin`:** Criada na mesma migration:
  ```sql
  CREATE OR REPLACE VIEW v_mensagens_admin AS
  SELECT
    m.id,
    m.obra_id,
    m.org_id,
    o.name AS obra_name,
    m.sender_id,
    m.sender_type,
    m.sender_display_name,
    m.content,
    m.message_type,
    m.storage_path,
    m.read_at,
    m.created_at
  FROM obra_mensagens m
  JOIN obras o ON o.id = m.obra_id;
  ```
  - View sem RLS própria; acesso controlado pelos endpoints de admin (server-side)

- [ ] **AC3 — POST atualizado:** `POST /api/admin/obras/[obra_id]/mensagens/route.ts`:
  - Adiciona `sender_display_name: appUser.name` ao objeto de insert em `obra_mensagens`
  - Response atualizado: retorna `sender_display_name` no objeto `mensagem`:
    `.select("id, content, created_at, sender_type, message_type, sender_display_name")`

- [ ] **AC4 — Admin query atualizada:** Em `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx`:
  - Query de `obra_mensagens` adiciona `sender_display_name` ao select:
    `"id, content, message_type, storage_path, sender_type, created_at, sender_display_name"`
  - Interface passada para `AdminChatFeedProps.initialMensagens` inclui `sender_display_name: string | null`

- [ ] **AC5 — admin-chat-feed.tsx atualizado:**
  - Interface `Mensagem` adiciona `sender_display_name: string | null`
  - Mensagens `sender_type === 'equipe'`: exibem `mensagem.sender_display_name ?? "Equipe Trifold"` no lugar de `{adminName}` genérico
  - Prop `adminName` mantida para fallback em mensagens sem snapshot (legado)
  - Realtime: novas mensagens de equipe chegam com `sender_display_name` via Realtime (coluna presente na tabela, admin tem SELECT RLS)
  - Após POST bem-sucedido, optimistic update usa `sender_display_name` retornado pela API

- [ ] **AC6 — Cliente não expõe campo:**
  - `GET` e `POST` em `/api/cliente/obras/[obra_id]/mensagens/route.ts` não selecionam nem retornam `sender_display_name`
  - Verificar: query do cliente usa `.select("id, content, created_at, sender_type, message_type")` sem o campo novo

- [ ] **AC7 — TypeScript compila sem erros:**
  - `npm run typecheck` passa sem erros após mudanças em interfaces e componentes

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- **Primary Type:** Database + API
- **Secondary Type:** Frontend (interface update)
- **Complexity:** Low — coluna nullable, backfill seguro, nenhuma query crítica de performance

**Specialized Agent Assignment:**
- **Primary Agents:** `@dev`, `@qa`
- **Supporting:** `@data-engineer` (revisar migration SQL antes do apply)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint`
- [ ] Pre-PR (@devops): `coderabbit --prompt-only --base main`

**CodeRabbit Focus Areas:**
- Migration segura: coluna nullable, backfill não causa lock em tabela existente
- `sender_display_name` ausente do select do cliente (AC6)
- TypeScript interfaces consistentes entre server component e client component
- Realtime payload: admin recebe `sender_display_name` corretamente

**Self-Healing:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2 | Timeout: 15 min | Severity Filter: CRITICAL

## Tasks / Subtasks

- [x] **Task 1 — Migration SQL** (AC1, AC2)
  - [x] Criar `supabase/migrations/024_mensagens_sender_display_name.sql`
  - [x] `ALTER TABLE obra_mensagens ADD COLUMN sender_display_name varchar(255);`
  - [x] Backfill de equipe com `UPDATE ... FROM users WHERE sender_type = 'equipe'`
  - [x] Criar view `v_mensagens_admin` com JOIN em `obras`
  - [x] Verificar que `npm run typecheck` não quebra tipos gerados

- [x] **Task 2 — POST API admin** (AC3)
  - [x] Em `route.ts`: adicionar `sender_display_name: appUser.name` ao `.insert({...})`
  - [x] Atualizar `.select(...)` da query pós-insert para incluir `sender_display_name`

- [x] **Task 3 — Server Component (página admin obra)** (AC4)
  - [x] Em `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx`
  - [x] Adicionar `sender_display_name` ao `.select(...)` de `obra_mensagens`
  - [x] Atualizar tipo local da variável `mensagens` para incluir `sender_display_name: string | null`

- [x] **Task 4 — admin-chat-feed.tsx** (AC5)
  - [x] Adicionar `sender_display_name: string | null` à interface `Mensagem`
  - [x] Substituir `{adminName}` por `{mensagem.sender_display_name ?? adminName}` para mensagens de equipe
  - [x] Atualizar Realtime handler (`postgres_changes`): payload `new` tipado como `Mensagem` para incluir `sender_display_name` antes de `setMensagens`

- [x] **Task 5 — Verificação cliente** (AC6)
  - [x] Confirmar que `route.ts` do cliente não seleciona `sender_display_name` ✅ (sem mudança)

- [x] **Task 6 — TypeCheck + Lint** (AC7)
  - [x] `npm run type-check` — 0 erros
  - [x] `npm run lint` nos arquivos modificados — 0 erros (erros pré-existentes em email/* não são desta story)

## Dev Notes

### Arquivos envolvidos

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/024_mensagens_sender_display_name.sql` | CRIAR |
| `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` | EDITAR |
| `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` | EDITAR |
| `packages/web/src/app/dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx` | EDITAR |
| `packages/web/src/app/api/cliente/obras/[obra_id]/mensagens/route.ts` | VERIFICAR (sem mudança) |

### Schema existente — obra_mensagens

```sql
CREATE TABLE obra_mensagens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_type varchar(20) NOT NULL CHECK (sender_type IN ('cliente', 'equipe')),
  content text,
  message_type varchar(20) NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'audio')),
  storage_path text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
  -- ADICIONAR: sender_display_name varchar(255)
);
```

### Schema users (campo de referência)

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY,
  name varchar(255) NOT NULL,  -- ← Este campo é o snapshot a copiar
  email varchar(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'broker',
  ...
);
```

### Migration segura (backfill)

O backfill é seguro porque:
1. Coluna nullable → nenhum NOT NULL constraint → sem lock table durante ALTER
2. UPDATE via JOIN é atômico e não afeta clientes (filtra por `sender_type = 'equipe'`)
3. Mensagens antigas de cliente permanecem NULL (comportamento correto)

```sql
-- Migration completa esperada:
ALTER TABLE obra_mensagens ADD COLUMN sender_display_name varchar(255);

UPDATE obra_mensagens m
SET sender_display_name = u.name
FROM users u
WHERE m.sender_id = u.id
  AND m.sender_type = 'equipe';

CREATE OR REPLACE VIEW v_mensagens_admin AS
SELECT
  m.id,
  m.obra_id,
  m.org_id,
  o.name AS obra_name,
  m.sender_id,
  m.sender_type,
  m.sender_display_name,
  m.content,
  m.message_type,
  m.storage_path,
  m.read_at,
  m.created_at
FROM obra_mensagens m
JOIN obras o ON o.id = m.obra_id;
```

### admin-chat-feed.tsx — Comportamento atual (BUG)

```tsx
// ANTES (bugado): mostra nome do admin logado para TODAS as mensagens de equipe
{isEquipe ? (
  <p className="mb-1 text-xs font-medium text-orange-100">{adminName}</p>
) : ...}

// DEPOIS (correto): mostra quem realmente enviou
{isEquipe ? (
  <p className="mb-1 text-xs font-medium text-orange-100">
    {mensagem.sender_display_name ?? adminName}
  </p>
) : ...}
```

A prop `adminName` (atualmente `user.name ?? "Admin"` do server component) é mantida
como fallback para mensagens legadas (backfill pode não cobrir casos de usuário deletado).

### Segurança — sender_display_name visível para clientes?

`sender_display_name` é adicionado a `obra_mensagens`. Clientes têm SELECT RLS na tabela
para suas próprias obras. Portanto, um cliente tecnicamente pode ler esse campo via
Supabase client direto (bypass da API).

**Mitigação MVP:** O campo contém apenas o nome da pessoa (não é credencial nem dado sensível).
A UI do cliente já exibe "Equipe Trifold" independente do valor no banco.
Para auditoria de conformidade LGPD futura, criar `message_sender_audit` em story separada.

### Próxima migration disponível

Último arquivo: `023_push_notifications.sql` → próximo é **024**.

### Testing

- Verificar `npm run typecheck` após mudanças em interfaces
- Verificar `npm run lint`
- Testar manualmente: enviar mensagem no admin → verificar que `sender_display_name` aparece corretamente
- Verificar que mensagem enviada por admin A aparece com nome de A (não de B, que está logado)

**Cenário de teste automatizado (endpoint POST):**
```
POST /api/admin/obras/{obra_id}/mensagens
Body: { content: "Olá cliente" }
Expected: response.mensagem.sender_display_name === appUser.name (não nulo, não vazio)
```
Verificar também que `GET /api/cliente/obras/{obra_id}/mensagens` **não** retorna `sender_display_name` no payload.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-11 | 1.0 | Draft inicial | River (@sm) |
| 2026-05-11 | 1.1 | GO (8.5/10) — S1 e S2 corrigidos in-place | Pax (@po) |
| 2026-05-11 | 1.2 | Implementação completa — InReview | Dex (@dev) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6 (Dex @dev)

### Completion Notes
- `AppUser` não tinha `name` — adicionado em `api-auth.ts` + select atualizado para `'id, name, role, org_id'`
- `Mensagem` em `obra-detail-tabs.tsx` precisou receber `sender_display_name` para compatibilidade com `AdminChatFeed`
- Erros de lint pré-existentes em `dashboard/sistema/email*` não relacionados a esta story
- Migration `024` criada com ALTER TABLE + backfill + view `v_mensagens_admin`

### File List
| Arquivo | Ação |
|---------|------|
| `supabase/migrations/024_mensagens_sender_display_name.sql` | CRIADO |
| `packages/web/src/lib/api-auth.ts` | EDITADO — `name` adicionado a `AppUser`, select atualizado |
| `packages/web/src/app/api/admin/obras/[obra_id]/mensagens/route.ts` | EDITADO — `sender_display_name` no insert e select |
| `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` | EDITADO — `sender_display_name` no select de mensagens |
| `packages/web/src/app/dashboard/obras/[obra_id]/_components/admin-chat-feed.tsx` | EDITADO — interface + display + Realtime handler |
| `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` | EDITADO — `sender_display_name` na interface `Mensagem` |

## QA Results
_Preencher após QA gate_
