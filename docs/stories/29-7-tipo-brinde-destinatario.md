# Story 29.7: Tipo de Brinde Padrão no Destinatário

## Status

Ready for Review

## Executor Assignment

```yaml
executor: "@dev"
quality_gate: "@data-engineer"
quality_gate_tools: ["supabase/migrations", "schema review"]
```

## Story

**As a** usuário do painel de controle de brindes,
**I want** poder definir um "Tipo de Brinde padrão" ao cadastrar ou editar um destinatário,
**so that** ao registrar uma entrega para esse destinatário o tipo seja pré-selecionado automaticamente, agilizando o processo de registro.

## Acceptance Criteria

1. No modal "Novo Destinatário" e "Editar Destinatário" existe um campo "Tipo de Brinde padrão" (dropdown) com todos os tipos ativos (`brindes_tipos` onde `ativo = true`) já cadastrados; o campo aceita valor nulo ("sem padrão").
2. Ao lado do dropdown de "Tipo de Brinde padrão" existe um botão "+" que abre um sub-formulário inline (sem fechar o modal atual) para criar um novo tipo de brinde; ao salvar o novo tipo, o dropdown é atualizado e o novo tipo é selecionado automaticamente.
3. Ao salvar o destinatário (POST ou PATCH), o `brinde_tipo_id` selecionado é persistido na tabela `brindes_destinatarios` via a nova coluna `brinde_tipo_id` (FK para `brindes_tipos`).
4. A nova coluna `brinde_tipo_id uuid NULL` existe em `brindes_destinatarios` com FK `REFERENCES brindes_tipos(id) ON DELETE SET NULL`, sem quebrar registros existentes.
5. Ao abrir o dropdown de status de entrega (`StatusBadge`) para um destinatário que possui `brinde_tipo_id` definido, o seletor de tipo de brinde é pré-selecionado com esse tipo (se o tipo ainda estiver ativo); o usuário pode sobrescrever a seleção antes de confirmar o status.
6. A interface do `DestinatarioModal` em modo edição exibe o tipo padrão já selecionado no dropdown ao abrir, refletindo o valor atual do banco.
7. O tipo `Destinatario` em `types.ts` inclui o campo `brinde_tipo_id: string | null`.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

## Tasks / Subtasks

- [x] Task 1 — Migration: adicionar coluna `brinde_tipo_id` em `brindes_destinatarios` (AC: 4)
  - [x] Criar `supabase/migrations/040_brinde_tipo_id_destinatario.sql`
  - [x] Coluna: `brinde_tipo_id uuid NULL REFERENCES brindes_tipos(id) ON DELETE SET NULL`
  - [x] Adicionar índice: `CREATE INDEX IF NOT EXISTS idx_brindes_destinatarios_tipo_id ON brindes_destinatarios(brinde_tipo_id);`
  - [ ] Aplicar migration via MCP Supabase (`execute_sql` no projeto `dsopqkqjkmhytudaaolv`) — **PENDENTE: a aplicar pelo lead/parent agent (MCP tools não disponíveis no contexto autônomo do @dev)**

- [x] Task 2 — Atualizar tipo `Destinatario` em `types.ts` (AC: 7)
  - [x] Adicionar `brinde_tipo_id: string | null` à interface `Destinatario` em `packages/web/src/app/dashboard/brindes/_components/types.ts`

- [x] Task 3 — Atualizar API POST `/api/brindes/destinatarios` para aceitar `brinde_tipo_id` (AC: 3)
  - [x] Em `packages/web/src/app/api/brindes/destinatarios/route.ts`, extrair e validar `brinde_tipo_id` do body (string uuid ou null) — incluindo verificação de ownership (`org_id`)
  - [x] Incluir `brinde_tipo_id` no `insert` do Supabase

- [x] Task 4 — Atualizar API PATCH `/api/brindes/destinatarios/[id]` para aceitar `brinde_tipo_id` (AC: 3)
  - [x] Em `packages/web/src/app/api/brindes/destinatarios/[id]/route.ts`, adicionar tratamento de `brinde_tipo_id` nos `updates` (aceita string uuid ou null explícito), com validação de ownership

- [x] Task 5 — Atualizar `DestinatarioModal` com campo "Tipo de Brinde padrão" + botão "+" inline (AC: 1, 2, 6)
  - [x] Adicionar `brinde_tipo_id` ao estado `EMPTY` do modal (valor padrão `""`)
  - [x] Carregar lista de tipos ativos via `GET /api/brindes/tipos?ativo=true` no `useEffect` de mount
  - [x] Renderizar dropdown de "Tipo de Brinde padrão" com opção "— Sem padrão —" + tipos ativos
  - [x] Renderizar botão "+" ao lado do dropdown que expande sub-formulário inline (campos: Nome*, Tamanho, Cor) — sem abrir novo modal
  - [x] No submit do sub-formulário: `POST /api/brindes/tipos`, atualizar lista local, selecionar novo tipo automaticamente
  - [x] No `useEffect` que popula campos do destinatário em modo edição, incluir `brinde_tipo_id`
  - [x] Incluir `brinde_tipo_id` no `body` enviado no `handleSubmit` (converter `""` → `null`)

- [x] Task 6 — Atualizar `StatusBadge` para pré-selecionar tipo padrão do destinatário (AC: 5)
  - [x] Adicionar prop `defaultTipoId: string | null` ao `StatusBadgeProps`
  - [x] No estado inicial de `selectedTipoId`, usar `currentTipoId ?? defaultTipoId ?? ""` (só se `defaultTipoId` estiver em `tiposAtivos`)
  - [x] No `useEffect` de sincronização de `currentTipoId`, manter fallback para `defaultTipoId` quando `currentTipoId` for nulo e tipo ainda estiver ativo

- [x] Task 7 — Passar `defaultTipoId` para `StatusBadge` em `brindes-table.tsx` (AC: 5)
  - [x] Em `packages/web/src/app/dashboard/brindes/_components/brindes-table.tsx`, ao renderizar `StatusBadge` por linha, passar `defaultTipoId={d.brinde_tipo_id ?? null}`

- [ ] Task 8 — Verificação manual (smoke test) — **PENDENTE: requer migration aplicada e dev server rodando**
  - [ ] Criar destinatário sem tipo padrão → tipo fica null no banco
  - [ ] Criar destinatário com tipo padrão → `brinde_tipo_id` persistido
  - [ ] Editar destinatário → dropdown mostra tipo atual pré-selecionado
  - [ ] Criar novo tipo via botão "+" inline → aparece no dropdown e fica selecionado
  - [ ] Abrir StatusBadge de destinatário com tipo padrão → seletor pré-selecionado com esse tipo
  - [ ] Registrar entrega trocando o tipo no StatusBadge → entrega salva com o tipo sobrescrito

## Dev Notes

### Contexto e Objetivo

A Story 29.7 adiciona a associação de um "tipo de brinde padrão" ao destinatário, reduzindo cliques ao registrar entregas. É aditiva: não modifica o fluxo de entregas existente, apenas pré-popula o seletor de tipo no `StatusBadge`.

### Dependências Obrigatórias

- **Story 29.4 (Done)**: tabela `brindes_tipos` existe com colunas `id, org_id, nome, descricao, tamanho, cor, ativo`.
- **Story 29.5 (Done)**: `GET /api/brindes/tipos` e `POST /api/brindes/tipos` disponíveis.
- **Story 29.6 (Done)**: `TiposModal` disponível em `tipos-modal.tsx` — o formulário de criação inline do `DestinatarioModal` deve **replicar** a lógica de POST (não reutilizar o modal inteiro, pois abriria sobre o modal atual). Lógica de POST: `fetch("/api/brindes/tipos", { method: "POST", body: JSON.stringify({ nome, descricao, tamanho, cor }) })`.

### Schema — Migration 040

```sql
-- supabase/migrations/040_brinde_tipo_id_destinatario.sql
ALTER TABLE brindes_destinatarios
  ADD COLUMN IF NOT EXISTS brinde_tipo_id uuid
    REFERENCES brindes_tipos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brindes_destinatarios_tipo_id
  ON brindes_destinatarios(brinde_tipo_id);
```

- `ON DELETE SET NULL`: se o tipo for deletado (improvável mas possível), o destinatário perde a referência sem cascata.
- Sem `NOT NULL` — campo é opcional.
- Nomear migration como `040_brinde_tipo_id_destinatario.sql` (próximo após `039_admin_mensagens_rpc_remote_only.sql`; migrations `036–039` com sufixo `_remote_only` não interferem com a sequência local).

> **Atenção @data-engineer**: esta migration é local (sem sufixo `_remote_only`) e deve ser aplicada via `supabase db push`.

### Estrutura de Arquivos a Modificar

```
packages/web/src/app/
├── api/brindes/
│   ├── destinatarios/
│   │   ├── route.ts              ← MODIFICAR (POST: aceitar brinde_tipo_id)
│   │   └── [id]/route.ts         ← MODIFICAR (PATCH: aceitar brinde_tipo_id)
│   └── tipos/route.ts            ← apenas leitura (sem modificação)
└── dashboard/brindes/_components/
    ├── types.ts                   ← MODIFICAR (adicionar brinde_tipo_id à interface Destinatario)
    ├── destinatario-modal.tsx     ← MODIFICAR (dropdown + botão "+" inline)
    ├── status-badge.tsx           ← MODIFICAR (prop defaultTipoId + lógica de pré-seleção)
    └── brindes-table.tsx          ← MODIFICAR (passar defaultTipoId para StatusBadge)

supabase/migrations/
└── 040_brinde_tipo_id_destinatario.sql  ← CRIAR
```

### Padrões da Codebase (observados nos arquivos existentes)

**Imports absolutos**: usar `@web/lib/api-auth` para autenticação nas rotas API.

**API Routes — padrão de PATCH existente** (`[id]/route.ts`):
```typescript
// Padrão atual — adicionar ao bloco de updates:
if (body.brinde_tipo_id !== undefined) {
  // aceita string (uuid) ou null explícito
  updates.brinde_tipo_id = typeof body.brinde_tipo_id === "string"
    ? body.brinde_tipo_id || null
    : null
}
```

**API Routes — padrão de POST existente** (`route.ts`):
```typescript
// Após os campos existentes no insert:
brinde_tipo_id: typeof body.brinde_tipo_id === "string" && body.brinde_tipo_id
  ? body.brinde_tipo_id
  : null,
```

**DestinatarioModal — padrão de estado**:
- `EMPTY` é o estado zerado. Adicionar `brinde_tipo_id: ""` nele.
- `set(field, value)` é a função genérica de atualização de campo.
- O body enviado converte `""` → `null`: `brinde_tipo_id: fields.brinde_tipo_id || null`.
- Carregar tipos ativos com `useEffect` de mount (sem dependências): `fetch("/api/brindes/tipos?ativo=true")`.

**Botão "+" inline — sub-formulário**: não abrir outro modal. Usar um `useState<boolean>` `showNewTipoForm` para mostrar/ocultar um bloco de inputs abaixo do dropdown. O sub-formulário segue a mesma estrutura do form de criação do `TiposModal` (nome obrigatório, tamanho e cor opcionais). Ao criar com sucesso: atualizar lista local de tipos, selecionar o novo `id` no `fields.brinde_tipo_id`, fechar o sub-formulário.

**StatusBadge — lógica de pré-seleção** (AC 5):
- `currentTipoId`: tipo já registrado na entrega desta data comemorativa (pode ser null se não há entrega ainda).
- `defaultTipoId`: tipo padrão do destinatário (novo prop).
- Lógica de inicialização: `currentTipoId ?? defaultTipoId ?? ""`.
- `useEffect([currentTipoId])` existente: adicionar fallback `setSelectedTipoId(currentTipoId ?? defaultTipoId ?? "")`.
- **Atenção**: só pré-selecionar `defaultTipoId` se o tipo ainda estiver na lista de `tiposAtivos` (evitar pré-selecionar tipo inativo).

**brindes-table.tsx — onde o StatusBadge é renderizado**: buscar na tabela onde `<StatusBadge` é chamado e adicionar `defaultTipoId={destinatario.brinde_tipo_id ?? null}`.

### Padrão Supabase — `.maybeSingle()` vs `.single()`

Usar `.maybeSingle()` em queries de update/select que podem retornar 0 linhas. O padrão atual já usa `.single()` no POST de destinatarios (que está correto para insert); no PATCH de destinatarios verifica `if (!data)` — manter o mesmo padrão.

### Autenticação e RLS

Mesmas políticas RLS da tabela `brindes_destinatarios` já existentes (Story 29.1) cobrem a nova coluna automaticamente — sem nova policy necessária.

### API: GET `/api/brindes/tipos?ativo=true`

Já existe. Retorna `{ data: BrindeTipo[] }`. Usar com `?ativo=true` para filtrar apenas ativos no dropdown do modal.

### Sem Alteração no `brindes_entregas`

A Story 29.7 **não** modifica `brindes_entregas`. O `brinde_tipo_id` nas entregas continua funcionando como antes — a pré-seleção no StatusBadge é apenas UI (usa o campo `selectedTipoId` local do componente, que é enviado ao POST de entregas quando o usuário confirma um status).

### Testing

**Framework**: Vitest (unit) + smoke test manual no browser.

**Localização de testes**: `packages/web/src/__tests__/` ou co-localizado (`*.test.ts` ao lado do arquivo).

**Cenários prioritários para smoke test manual**:
1. Criar destinatário sem tipo → `brinde_tipo_id` null no banco (verificar via Supabase Studio ou GET).
2. Criar destinatário com tipo selecionado → `brinde_tipo_id` preenchido.
3. Editar destinatário → modal abre com tipo correto pré-selecionado no dropdown.
4. Usar botão "+" inline → novo tipo criado, aparece no dropdown, fica selecionado.
5. StatusBadge para destinatário com tipo padrão, sem entrega → tipo padrão pré-selecionado.
6. StatusBadge para destinatário com tipo padrão, com entrega (tipo diferente) → tipo da entrega prevalece.
7. StatusBadge para destinatário com tipo padrão inativo → não pré-seleciona (tipo não está em tiposAtivos).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-15 | 1.0 | Story criada | River (@sm) |
| 2026-05-15 | 1.1 | Validação PO 10-point: 9.5/10 GO. Status Draft -> Ready | Pax (@po) |
| 2026-05-15 | 1.2 | Implementação YOLO concluída (tasks 1-7). Migration criada; aplicação no banco remoto pendente. Status Ready -> Ready for Review | Dex (@dev) |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) — Dex (@dev) em YOLO mode.

### Debug Log References

- `pnpm --filter @trifold/web type-check` → 0 erros.
- `pnpm --filter @trifold/web lint` → 0 erros (6 warnings pré-existentes em arquivos não tocados por esta story).

### Completion Notes List

- **IDS — REUSE:** padrões `requireAuth`/`requireRole` reutilizados; helper `str()` mantido idêntico nas APIs; padrão de validação de ownership por `org_id` replicado de outros endpoints; estrutura do sub-formulário inline replica o form do `TiposModal` (Dev Notes §Dependências Obrigatórias), sem reaproveitar o modal inteiro (evita modal sobre modal).
- **Validação de ownership:** ambas as APIs (POST e PATCH) validam que o `brinde_tipo_id` enviado pertence ao `org_id` do usuário antes de persistir (defense-in-depth, complementa RLS).
- **Precedência no StatusBadge (AC 5):** ordem é `currentTipoId > defaultTipoId (se em tiposAtivos) > vazio`. Tipo padrão inativo NÃO é pré-selecionado (Dev Notes §Padrão Supabase). Implementado no `useState` inicial e no `useEffect` de sincronização.
- **Migration 040:** arquivo `supabase/migrations/040_brinde_tipo_id_destinatario.sql` criado com `IF NOT EXISTS` (idempotente) e rollback plan comentado conforme README de migrations. **APLICAÇÃO PENDENTE** via MCP Supabase `execute_sql` no projeto `dsopqkqjkmhytudaaolv` — o contexto autônomo do @dev não tem acesso aos MCP tools do Supabase; o lead/parent agent (ou @data-engineer no quality gate) deve aplicar o SQL no banco remoto.
- **Sem mudanças em `brindes_entregas`:** confirmado conforme Dev Notes §Sem Alteração no `brindes_entregas`. A pré-seleção é apenas UI no `StatusBadge`.
- **Sem mudanças em RLS:** policies existentes de `brindes_destinatarios` cobrem a nova coluna automaticamente (Dev Notes §Autenticação e RLS).
- **Smoke test manual:** pendente até migration ser aplicada + dev server rodar.

### File List

**Criados:**
- `supabase/migrations/040_brinde_tipo_id_destinatario.sql`

**Modificados:**
- `packages/web/src/app/dashboard/brindes/_components/types.ts` (adiciona `brinde_tipo_id` em `Destinatario`)
- `packages/web/src/app/api/brindes/destinatarios/route.ts` (POST: aceita + valida ownership de `brinde_tipo_id`)
- `packages/web/src/app/api/brindes/destinatarios/[id]/route.ts` (PATCH: aceita + valida ownership de `brinde_tipo_id`)
- `packages/web/src/app/dashboard/brindes/_components/destinatario-modal.tsx` (dropdown "Tipo de Brinde padrão" + botão "+" inline com sub-formulário)
- `packages/web/src/app/dashboard/brindes/_components/status-badge.tsx` (prop `defaultTipoId` + lógica de precedência)
- `packages/web/src/app/dashboard/brindes/_components/brindes-table.tsx` (passa `defaultTipoId={d.brinde_tipo_id ?? null}` para `StatusBadge`)

## QA Results

_A ser preenchido pelo @qa_
