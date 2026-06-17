# Story 63-1 — Conversa: exibir nome do corretor nas mensagens

## Metadata
- **Status:** Done
- **Epic:** 63 — Conversa: Identificação de Remetente
- **Branch:** feature/63-1-conversa-nome-corretor-mensagem

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, visual]

## Story

**As a** gestor ou admin monitorando conversas,
**I want** ver o nome do corretor que enviou cada mensagem,
**so that** eu saiba exatamente quem está falando com o lead sem precisar adivinhar.

## Contexto

Na tela de conversa do lead (`/dashboard/leads/[id]?tab=conversa`) e na tela de conversas
(`/dashboard/conversas/[id]`), mensagens enviadas por corretores exibem apenas o label
genérico **"CORRETOR"** — sem identificar quem enviou.

Quando múltiplos corretores ou colaboradores interagem com o mesmo lead, é impossível
monitorar quem disse o quê.

O campo `metadata.sent_by` (UUID do usuário) já existe em todas as mensagens com
`role = 'broker'` — salvo pelo endpoint `/api/leads/[id]/send-message`. Basta expor
esse dado no componente visual.

**Arquivos alvo:**
- `packages/web/src/app/dashboard/leads/[id]/page.tsx` (~linha 289 query + ~linha 341 label)
- `packages/web/src/app/dashboard/conversas/[id]/page.tsx`

## Escopo

**IN (esta story):**
- Incluir `metadata` no select de mensagens nas duas telas
- Coletar UUIDs únicos de `metadata.sent_by` das mensagens `role='broker'`
- Buscar nomes na tabela `users` (select `id, name`)
- Substituir label "Corretor" por "Corretor · {nome}" (ex: "Corretor · Odair")
- Fallback: se `sent_by` ausente ou usuário não encontrado, manter "Corretor"

**OUT (fora desta story):**
- Mensagens `role='assistant'` (IA) — label "IA" permanece
- Histórico de mensagens antigas sem `sent_by` no metadata — fallback "Corretor"
- Redesign do componente de mensagem
- Mensagens no portal do cliente

## Acceptance Criteria

1. Na tela `/dashboard/leads/[id]?tab=conversa`, mensagens de broker exibem
   **"Corretor · {primeiro nome}"** no lugar de "Corretor".
2. Na tela `/dashboard/conversas/[id]`, idem.
3. Se `metadata.sent_by` não existir na mensagem, exibe "Corretor" (sem quebrar).
4. Dois corretores diferentes na mesma conversa exibem nomes diferentes.
5. A busca de nomes é feita em uma única query (não N+1).
6. Typecheck passa sem erros.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Metadata não tipado → cast necessário | Alta | `(msg.metadata as { sent_by?: string })?.sent_by` |
| Query de users retorna vazio | Baixa | Fallback "Corretor" já cobre |
| Performance: mensagens longas com muitos brokers | Baixa | Query única com `.in("id", uniqueIds)` |

## Tasks / Subtasks

- [x] **Task 1 — `leads/[id]/page.tsx`** (AC: 1, 3, 4, 5)
  - [x] 1.1 `metadata` adicionado ao select de mensagens
  - [x] 1.2 Coleta de `sent_by` únicos após query de conversas
  - [x] 1.3 Query única `.in("id", brokerUserIds)` para nomes
  - [x] 1.4 Map `brokerNames: Record<string, string>` criado
  - [x] 1.5 Label render: `"Corretor · {nome}"` com fallback

- [x] **Task 2 — `conversas/[id]/page.tsx`** (AC: 2, 3)
  - [x] 2.1 Mesmo padrão — `displayLabel` dinâmico por mensagem

- [x] **Task 3 — Typecheck** (AC: 6)
  - [x] 3.1 `pnpm tsc --noEmit` — zero erros

## Dev Notes

### Padrão de implementação

```typescript
// 1. Incluir metadata no select
const { data: messages } = await supabase
  .from("messages")
  .select("id, role, content, created_at, metadata")
  // ...

// 2. Coletar IDs únicos de broker
const brokerIds = [...new Set(
  messages
    .filter(m => m.role === "broker" && (m.metadata as any)?.sent_by)
    .map(m => (m.metadata as any).sent_by as string)
)]

// 3. Buscar nomes (query única)
const brokerNames: Record<string, string> = {}
if (brokerIds.length > 0) {
  const { data: users } = await supabase
    .from("users")
    .select("id, name")
    .in("id", brokerIds)
  users?.forEach(u => {
    brokerNames[u.id] = (u.name as string).split(" ")[0] // primeiro nome
  })
}

// 4. No render
const senderLabel = msg.role === "broker"
  ? `Corretor${brokerNames[(msg.metadata as any)?.sent_by] ? " · " + brokerNames[(msg.metadata as any)?.sent_by] : ""}`
  : msg.role === "assistant" ? "IA" : "Lead"
```

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-17 | 1.0 | Story criada | River (@sm) |
| 2026-06-17 | 1.1 | Validação 10/10 GO — Status → Ready | Pax (@po) |
| 2026-06-17 | 1.2 | Implementação concluída — typecheck 0 erros — Status → InReview | Dex (@dev) |
| 2026-06-17 | 1.3 | QA Gate PASS 7/7 — Status → Done | Quinn (@qa) |
