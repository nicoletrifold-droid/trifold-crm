# Story 63-14 — Botão "Devolver para a Nicole" — Reativação Manual da IA

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-14
- **Status:** Ready for Review
- **Priority:** P1 — o corretor precisa de um caminho explícito para devolver o atendimento à Nicole sem precisar esperar 24h
- **Complexity:** M (3-5h)
- **Fase:** 5 (Controle de Handoff IA↔Corretor)
- **Created:** 2026-06-21
- **Author:** @sm (River)
- **Validated:** 2026-06-21 by @po (Pax) — verdict GO (9/10). Permissão confirmada. Dependência 63-13→63-14 verificada (botão precisa de is_ai_active=false como alvo). Refs de código confirmados.

> **DECISÃO DE PRODUTO RESOLVIDA (@po, 2026-06-21):** ✅ Permissão do botão "Devolver para Nicole": **corretor DONO do lead** (`lead.assigned_broker_id === appUser.id`) **OU admin/supervisor/gerente-comercial** (`["admin","supervisor","gerente-comercial"].includes(appUser.role)`). Mais amplo que `handoff/route.ts` (só admin/supervisor) por ser ação reversível de baixo risco — alinhado ao padrão de `send-message/route.ts` (L81-91, confirmado em código). Story liberada para @dev (após 63-13 Done).

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[permission_gate_check, resume_ai_endpoint_check, banner_state_check, a11y_check]`
- **Depende de:** Story 63-13 Done (is_ai_active=false gerado pelo handoff automático — sem 63-13 o botão não tem alvo real); Story 63-8 Done (AiStatusBanner existente para receber o botão); Story 63-5 Done (ConversationThread existente)
- **Pode ir em paralelo com:** nada na Fase 5 — sequencial após 63-13

---

## User Story

**Como** corretor que assumiu o atendimento de um lead,
**Quero** poder devolver o atendimento à Nicole com um clique,
**Para que** ela retome as respostas automáticas e eu possa focar em outros leads sem precisar esperar 24h.

---

## Context

### Antes desta Story

Com a Story 63-13, quando o corretor envia uma mensagem, `conversations.is_ai_active` vai para `false` e a Nicole para de responder. A Nicole só reassume automaticamente quando o corretor fica **24h sem responder** e o lead envia uma nova mensagem.

O problema: o corretor pode querer devolver à Nicole **antes** das 24h — por exemplo, se respondeu pontualmente uma dúvida mas não quer continuar o atendimento completo. Hoje, a única forma é esperar 24h ou pedir ao admin para fazer o handoff reverso manualmente no banco.

### Solução

Um botão "Devolver para Nicole" no **Estado B** do `AiStatusBanner` (o banner verde "Você está no atendimento") que chama um novo endpoint `POST /api/leads/[id]/resume-ai`. Ao confirmar, `is_ai_active` volta para `true` e a Nicole reassume na próxima mensagem do lead.

### Design Visual do Botão

O botão fica dentro do `AiStatusBanner` Estado B (banner verde), à direita do texto "Você está no atendimento":

```
[ ✓ Você está no atendimento ] [ ↩ Devolver para Nicole ]
```

- Ícone: `RotateCcw` (lucide-react) — indica "reverter"
- Label: "Devolver para Nicole" (ou "Devolver Nicole" em telas pequenas)
- Alvo mínimo: 44×44px (NFR-2)
- Loading state: ícone spinner (`Loader2` lucide-react, animate-spin) enquanto a requisição está pendente
- Cor: `text-green-700 hover:text-green-900 dark:text-green-300` (harmônico com o banner verde, sem orange-500 — laranja é reservado para ações principais)
- Sem modal de confirmação — ação reversível (corretor pode enviar nova mensagem para reassumir via 63-13)

### Endpoint: `POST /api/leads/[id]/resume-ai`

Novo endpoint, similar ao `handoff/route.ts` mas inverso:
- Permissão: `isAdmin` (admin/supervisor/gerente-comercial) OU `lead.assigned_broker_id === appUser.id`
- Busca conversa ativa do lead
- UPDATE `conversations SET is_ai_active=true WHERE id=conversation.id`
- Idempotente: se `is_ai_active` já era `true`, retorna 200 sem UPDATE desnecessário
- Loga em `activities` com `type='ai_resumed'`
- NÃO altera `handoff_at` / `handoff_reason` (preservar audit trail do handoff original)

### Atualização do Estado B (`AiStatusBanner`)

O banner Estado B atual tem apenas o texto "Você está no atendimento" sem ação. Com 63-14, ganha o botão. A prop `onResumeAi?: () => Promise<void>` é adicionada para que o `ConversationThread` passe o callback.

O `ConversationThread` gerencia:
1. Estado local `localIsAiActive` (inicializado de `isAiActive` prop)
2. Callback `handleResumeAi` que chama o endpoint e atualiza `localIsAiActive=true`
3. Repassa `onResumeAi={handleResumeAi}` ao `AiStatusBanner`
4. `deriveBrokerActive(serverPlusRealtime, localIsAiActive)` usa `localIsAiActive` → banner transiciona para Estado A imediatamente sem reload completo
5. `router.refresh()` é chamado em background para sincronizar com o servidor

[AUTO-DECISION] Sem confirmação (modal/confirm) antes do clique. Justificativa: a ação é reversível (o corretor envia uma mensagem para reassumir via 63-13), a UX com confirmação adiciona fricção desnecessária para uma ação de baixo risco, e o loading state já fornece feedback visual adequado.

---

## Acceptance Criteria

- [x] **AC1 (Endpoint `resume-ai`):** `POST /api/leads/[id]/resume-ai` criado. Permissão: `isAdmin = ["admin", "supervisor", "gerente-comercial"].includes(appUser.role)` OU `lead.assigned_broker_id === appUser.id`. Sem permissão: 403. Lead não encontrado/inativo: 404. Sucesso: UPDATE `conversations SET is_ai_active=true WHERE lead_id=id AND status='active'`. Idempotente: se já `true`, retorna 200 sem UPDATE. Response: `{ success: true, conversationId: string, isAiActive: true }`.
- [x] **AC2 (Activity log):** Em sucesso (ou idempotente), logar em `activities`: `type='ai_resumed'`, `description='Nicole reativada manualmente'`, `metadata.triggered_by=appUser.id`, `metadata.triggered_by_role=appUser.role`, `metadata.conversation_id`. Usar o mesmo padrão de `handoff/route.ts` (~L170-183).
- [x] **AC3 (Botão no Estado B):** O `AiStatusBanner` — Estado B ("Você está no atendimento") — exibe botão "Devolver para Nicole" com ícone `RotateCcw` (lucide-react), alvo ≥44×44px. Visível SOMENTE quando `brokerActive=true`. Sem botão no Estado A (Nicole atendendo). O botão só é renderizado se a prop `onResumeAi` for definida (prop opcional — permite usar o banner em contextos sem handoff reverso sem quebrar).
- [x] **AC4 (Loading state):** Ao clicar, o botão mostra `Loader2` (animate-spin) e fica desabilitado (`disabled`) enquanto a requisição está pendente. Em sucesso: ocultar loading. Em erro: restaurar botão com estado original (não lançar exceção — usar try/catch + console.error).
- [x] **AC5 (Transição de banner sem reload):** Após `resume-ai` retornar 200, `localIsAiActive` é setado para `true` no `ConversationThread`. `deriveBrokerActive(serverPlusRealtime, true)` recalcula — se não há msg `role='broker'` recente em `serverPlusRealtime`, `brokerActive=false` → banner transiciona para Estado A ("Nicole está atendendo automaticamente") imediatamente. Adicionalmente, `router.refresh()` é chamado para sincronizar o servidor.
- [x] **AC6 (Sem confirmação):** Nenhum modal de confirmação ou `window.confirm()` antes do clique — ação direta (justificativa: reversível). O loading state fornece feedback de processamento.
- [x] **AC7 (Permissão verificada no servidor):** O endpoint valida permissão no servidor (não confiar no cliente). Se o frontend esconder o botão para não-autorizados, o endpoint ainda rejeita chamadas não autorizadas com 403.
- [x] **AC8 (a11y):** Botão com `aria-label="Devolver atendimento para a Nicole"` quando estado de loading, `aria-disabled={loading}`. Loading spinner com `aria-hidden="true"`. Alvo de toque ≥44×44px (NFR-2 do épico).
- [x] **AC9 (CON-3 nova respeitada):** Este endpoint é explicitamente AUTORIZADO pela CON-3 reescrita (um dos 3 mecanismos permitidos para alterar `is_ai_active`). O endpoint NÃO altera nenhum outro estado além de `conversations.is_ai_active`. CON-1 respeitado (sem tel:/wa.me).
- [x] **AC10 (TypeScript + ESLint):** `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story. ESLint → zero erros.

---

## Tasks / Subtasks

- [x] **T1 — Criar `packages/web/src/app/api/leads/[id]/resume-ai/route.ts`**
  - `export async function POST(request, { params })`
  - `requireAuth()` → `{ supabase, appUser }`
  - Buscar lead: `.select("id, assigned_broker_id").eq("id", id).eq("org_id", appUser.org_id).eq("is_active", true).single()`; 404 se não encontrado
  - Verificar permissão: `isAdmin = ["admin","supervisor","gerente-comercial"].includes(appUser.role)`; se `!isAdmin && lead.assigned_broker_id !== appUser.id` → 403
  - Buscar conversa ativa: `.from("conversations").select("id, is_ai_active").eq("lead_id", id).eq("status","active").maybeSingle()`; 404 se nenhuma conversa
  - UPDATE se necessário: `if (!conversation.is_ai_active) { await supabase.from("conversations").update({ is_ai_active: true }).eq("id", conversation.id) }`
  - Activity log: `await supabase.from("activities").insert({ org_id: appUser.org_id, lead_id: id, user_id: appUser.id, type: "ai_resumed", description: "Nicole reativada manualmente", metadata: { triggered_by: appUser.id, triggered_by_role: appUser.role, conversation_id: conversation.id } })`
  - Response: `NextResponse.json({ success: true, conversationId: conversation.id, isAiActive: true })`

- [x] **T2 — Modificar `ai-status-banner.tsx` — prop `onResumeAi` + botão Estado B**
  - Adicionar prop `onResumeAi?: () => Promise<void>` à interface `AiStatusBannerProps`
  - Adicionar state local `const [loading, setLoading] = useState(false)` SOMENTE no componente (ou usar `useTransition` se disponível)
  - No Estado B: adicionar `<button>` com `RotateCcw` / `Loader2` e lógica de loading (chamada `onResumeAi` wrappada em try/catch com setLoading)
  - O botão só renderiza quando `onResumeAi !== undefined`
  - Preservar a11y: `aria-label`, `aria-disabled`, `aria-hidden` no spinner

- [x] **T3 — Modificar `conversation-thread.tsx` — localIsAiActive + callback**
  - Adicionar `const [localIsAiActive, setLocalIsAiActive] = useState(isAiActive)` (inicializa do prop)
  - Adicionar `useEffect(() => { setLocalIsAiActive(isAiActive) }, [isAiActive])` para sincronizar quando prop muda (e.g., após `router.refresh()`)
  - Criar callback `handleResumeAi`: `async () => { await fetch('/api/leads/${lead.id}/resume-ai', { method: 'POST' }); setLocalIsAiActive(true); router.refresh() }` — com try/catch interno
  - Alterar `const brokerActive = deriveBrokerActive(serverPlusRealtime, isAiActive)` para usar `localIsAiActive`
  - Passar `onResumeAi={handleResumeAi}` ao `AiStatusBanner`
  - Importar `useRouter` de `next/navigation` (já client component — `"use client"` já presente em L1)

- [x] **T4 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story
  - ESLint → zero erros nos arquivos desta story
  - `npx vitest run` → suíte completa verde (zero regressão)

---

## Dev Notes

### Paths-chave

```
packages/web/src/app/api/leads/[id]/resume-ai/route.ts           ← CRIAR (T1)
packages/web/src/app/broker/leads/[id]/_components/
  ai-status-banner.tsx                                            ← EDITAR (T2)
  conversation-thread.tsx                                         ← EDITAR (T3)
```

### Endpoint `resume-ai` — Referências de padrão

```typescript
// Espelhar a estrutura de handoff/route.ts, com permissão INVERSA (broker owner também):

import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@web/lib/api-auth"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, appUser } = auth

  // DIFERENÇA DO handoff/route.ts: broker owner também pode reativar (não só admin/supervisor)
  const { data: lead } = await supabase
    .from("leads")
    .select("id, assigned_broker_id")
    .eq("id", id)
    .eq("org_id", appUser.org_id)
    .eq("is_active", true)
    .single()

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

  const isAdmin = ["admin", "supervisor", "gerente-comercial"].includes(appUser.role)
  if (!isAdmin && lead.assigned_broker_id !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, is_ai_active")
    .eq("lead_id", id)
    .eq("status", "active")
    .maybeSingle()

  if (!conversation) {
    return NextResponse.json({ error: "No active conversation found" }, { status: 404 })
  }

  // Idempotente: só faz UPDATE se necessário
  if (!conversation.is_ai_active) {
    const { error: convError } = await supabase
      .from("conversations")
      .update({ is_ai_active: true })
      .eq("id", conversation.id)
    if (convError) {
      return NextResponse.json({ error: convError.message }, { status: 500 })
    }
  }

  // Activity log (AC2) — idempotente: sempre loga (intenção do usuário, mesmo se já estava true)
  await supabase.from("activities").insert({
    org_id: appUser.org_id,
    lead_id: id,
    user_id: appUser.id,
    type: "ai_resumed",
    description: "Nicole reativada manualmente",
    metadata: {
      triggered_by: appUser.id,
      triggered_by_role: appUser.role,
      conversation_id: conversation.id,
    },
  })

  return NextResponse.json({ success: true, conversationId: conversation.id, isAiActive: true })
}
```

### `AiStatusBanner` — Props interface atual

```typescript
// ai-status-banner.tsx (estado pós-63-8/63-13):
interface AiStatusBannerProps {
  brokerActive: boolean
  // ADICIONAR em 63-14:
  onResumeAi?: () => Promise<void>
}
```

Estado B — estrutura proposta do botão:

```tsx
// Dentro do Estado B (brokerActive=true), ao lado do texto:
const [loading, setLoading] = useState(false)

async function handleClick() {
  if (!onResumeAi || loading) return
  setLoading(true)
  try {
    await onResumeAi()
  } catch (err) {
    console.error("[AiStatusBanner] resume-ai failed:", err)
  } finally {
    setLoading(false)
  }
}

// No JSX do Estado B:
<div role="status" aria-live="polite" className="flex items-center justify-between gap-2 ...">
  <div className="flex items-center gap-2">
    <UserCheck className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
    <span className="text-sm font-medium text-green-800 dark:text-green-200">
      Você está no atendimento
    </span>
  </div>
  {onResumeAi && (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-label={loading ? "Devolvendo atendimento para a Nicole..." : "Devolver atendimento para a Nicole"}
      aria-disabled={loading}
      className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded px-3 py-2 text-sm
                 text-green-700 hover:bg-green-100 hover:text-green-900
                 disabled:cursor-not-allowed disabled:opacity-50
                 dark:text-green-300 dark:hover:bg-green-900/30"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
      )}
      <span>Devolver para Nicole</span>
    </button>
  )}
</div>
```

**NOTA:** O `AiStatusBanner` passa a ser um Client Component se usar `useState`. Adicionar `"use client"` no topo se ainda não presente.

### `ConversationThread` — integração do callback

```typescript
// conversation-thread.tsx — ADICIONAR:
import { useRouter } from "next/navigation"

// Dentro do componente:
const router = useRouter()
const [localIsAiActive, setLocalIsAiActive] = useState(isAiActive)

// Sync quando prop muda (pós-refresh do servidor):
useEffect(() => {
  setLocalIsAiActive(isAiActive)
}, [isAiActive])

// Callback para o botão:
const handleResumeAi = async () => {
  const res = await fetch(`/api/leads/${lead.id}/resume-ai`, { method: "POST" })
  if (!res.ok) throw new Error(`resume-ai failed: ${res.status}`)
  setLocalIsAiActive(true)
  router.refresh()
}

// Usar localIsAiActive no cálculo do banner:
const brokerActive = deriveBrokerActive(serverPlusRealtime, localIsAiActive) // era: isAiActive
```

**ÂNCORA SEMÂNTICA:** Em `conversation-thread.tsx`, procurar `const brokerActive = deriveBrokerActive(serverPlusRealtime, isAiActive)` (~L151) e substituir `isAiActive` por `localIsAiActive`.

### Permissão do endpoint — alinhamento com padrões existentes

```typescript
// send-message/route.ts L81 — padrão de permissão:
const isAdmin = ["admin", "supervisor", "gerente-comercial"].includes(appUser.role)
if (!isAdmin) {
  if (lead.assigned_broker_id !== appUser.id) → 403
}

// handoff/route.ts L15 — mais restritivo (só admin/supervisor):
const forbidden = requireRole(appUser, ["admin", "supervisor"])

// resume-ai: USAR o padrão de send-message (inclui gerente-comercial + broker owner)
// — mais amplo que handoff porque é ação de baixo risco (reversível pelo corretor via 63-13)
```

### Diagrama de estados `is_ai_active` pós-Fase 5

```
Estado inicial: is_ai_active=true (Nicole atende)
        ↓
[63-13] Corretor envia msg
        ↓
is_ai_active=false (Nicole pausa)
        ↓
Lead responde:
  ├─ Broker ativo (<24h) → Nicole permanece pausa
  └─ Broker inativo (>24h) → [63-13 webhook] is_ai_active=true (Nicole reassume)
        ↓
[63-14] Corretor clica "Devolver para Nicole"
        ↓
is_ai_active=true (Nicole reassume imediatamente)
```

### Verificar se `useRouter` já importado

`conversation-thread.tsx` é `"use client"` (L1 confirmado). Verificar se `useRouter` de `next/navigation` já está importado. Se não, adicionar.

---

## File List

### Criar
- `packages/web/src/app/api/leads/[id]/resume-ai/route.ts` — endpoint POST (T1, AC1-AC2)

### Modificar
- `packages/web/src/app/broker/leads/[id]/_components/ai-status-banner.tsx` — prop `onResumeAi`; botão Estado B com loading; adicionar `"use client"` se necessário; imports `Loader2`, `RotateCcw`, `useState` (T2, AC3-AC4, AC6, AC8)
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` — `localIsAiActive` state; `useEffect` sync; `handleResumeAi` callback; `onResumeAi` passado ao banner; `brokerActive` usa `localIsAiActive`; importar `useRouter` (T3, AC5)

### Referência (não modificar)
- `packages/web/src/app/api/leads/[id]/handoff/route.ts` — padrão de activity log + pattern de update is_ai_active (L53-64, L170-183)
- `packages/web/src/app/api/leads/[id]/send-message/route.ts` — padrão de permissão (L81-91)
- `packages/web/src/lib/broker/broker-takeover-status.ts` — `deriveBrokerActive` (inalterado; `localIsAiActive` passado no lugar de `isAiActive`)
- `packages/web/src/app/broker/leads/[id]/_components/window-status-badge.tsx` — referência de padrão de badge no header

---

## Testing

### Smoke manual pós-deploy

| Cenário | Setup | Ação | Resultado esperado |
|---------|-------|------|--------------------|
| Corretor dono devolve | `is_ai_active=false`; corretor logado = assigned_broker_id | Clica "Devolver para Nicole" | Botão loading → Estado A no banner; `is_ai_active=true` no DB |
| Admin devolve | `is_ai_active=false`; logado como admin | Clica "Devolver para Nicole" | Mesmos resultados; activity log com `triggered_by_role='admin'` |
| Corretor não-dono tenta | `is_ai_active=false`; outro corretor logado | POST manual a `/api/leads/[id]/resume-ai` | 403 Forbidden |
| Idempotente | `is_ai_active=true` já | Clica "Devolver para Nicole" | 200; sem UPDATE desnecessário; banner Estado A (já estava) |
| Nicole reassume e leads responde | Pós-resume-ai com is_ai_active=true | Lead envia mensagem | Nicole responde (gate L612 isAiActive=true) |
| Corretor envia nova msg após devolver | Pós-resume-ai | Corretor envia msg | 63-13 seta is_ai_active=false novamente → ciclo correto |
| Loading state | Conexão lenta | Clicar "Devolver" | Botão mostra spinner, desabilitado durante request |

### Regressão obrigatória

- Banner Estado A (63-8) continua sem botão (onResumeAi=undefined → nenhum botão renderizado)
- `WindowStatusBadge` continua funcionando (inalterado)
- `BrokerMessageInput` continua funcional (inalterado)
- Suíte Vitest completa verde

---

## Riscos

| ID | Risco | Prob | Impacto | Mitigação |
|----|-------|------|---------|-----------|
| R1 | Corretor clica "Devolver" e logo após envia msg → 63-13 seta is_ai_active=false novamente | Média | Baixo | Comportamento CORRETO — corretor decidiu enviar, reassume. O ciclo funciona. |
| R2 | Banner transiciona Estado B→A mas Nicole ainda não respondeu (lead não enviou msg ainda) | Baixa | Baixo | Correto — is_ai_active=true, quando lead enviar Nicole responderá. O estado do banner é correto. |
| R3 | `localIsAiActive` dessincroniza se dois tabs do CRM abertos | Baixa | Baixo | `router.refresh()` re-sincroniza. Realtime (63-11) também propagaria via `role='assistant'` insert. |
| R4 | RISCO ALTO — bug no endpoint seta is_ai_active=true em conversa errada | Muito Baixa | Alto | Endpoint usa `eq("lead_id", id)` + `eq("org_id", appUser.org_id)` RLS + `.maybeSingle()` (não single). QA deve verificar isolamento de org. |
| R5 | `AiStatusBanner` vira client component pela adição de useState | Baixa | Baixo | Já era client ou está em client tree (ConversationThread é "use client"). Adicionar "use client" se necessário. |

---

## Out of Scope

- Notificação ao lead de que a Nicole voltou ao atendimento
- Histórico de reativações na UI (activities table captura; sem tela de histórico aqui)
- Botão "Assumir atendimento" explícito na UI (desnecessário — 63-13 faz isso implicitamente via envio de mensagem)
- Reativação em massa (múltiplos leads de uma vez)
- Permissão para reativar leads de outros corretores sem ser admin (consciente — isolamento de ownership)
- Mudança em `handoff/route.ts` (handoff manual admin/supervisor — permanece inalterado)
- Alteração do comportamento do cron de follow-up

---

## Definition of Done

- [x] AC1-AC10 marcados como completos
- [ ] Smoke: botão visível no Estado B; clique → loading → Estado A
- [ ] Smoke: `is_ai_active=true` confirmado no Supabase após clique
- [ ] Smoke: Nicole responde quando lead envia mensagem pós-resume
- [ ] Smoke: 403 para corretor não-dono
- [x] Regressão: Vitest completa verde (469 testes); banner 63-8 sem botão quando `onResumeAi` undefined (renderização condicional `{onResumeAi && ...}`)
- [ ] @qa executou quality gate com verdict ≥ PASS
- [ ] @devops fez push

---

## Dev Agent Record

*(Preenchido pelo @dev durante implementação)*

### Agent Model Used
claude-opus-4-8 (1M) — @dev (Dex), modo YOLO autônomo.

### Completion Notes

**T1 — Endpoint `POST /api/leads/[id]/resume-ai`:**
- Criado espelhando `handoff/route.ts` (sem o resumo AI — desnecessário no inverso). CREATE justificado (IDS): nenhum endpoint de reativação existia.
- **Permissão (AC1/AC7):** `isAdmin = ["admin","supervisor","gerente-comercial"]` OU `lead.assigned_broker_id === appUser.id` → 403 caso contrário. Validada no SERVIDOR (não confia no cliente).
- **Isolamento de org (R4):** lead filtrado por `.eq("org_id", appUser.org_id)` + `.eq("is_active", true)`; conversa via `.maybeSingle()` (não `.single()`). UPDATE por-conversa `.eq("id", conversation.id)`.
- **Idempotente (AC1):** UPDATE só quando `!conversation.is_ai_active`. Activity log `type='ai_resumed'` sempre gravado (intenção do usuário) com `triggered_by`/`triggered_by_role`/`conversation_id` (AC2).
- **NÃO altera** `handoff_at`/`handoff_reason` (preserva audit trail). Response `{ success, conversationId, isAiActive: true }`.

**T2 — `ai-status-banner.tsx`:**
- Adicionado `"use client"` (passou a usar `useState`), prop opcional `onResumeAi?: () => Promise<void>`, imports `Loader2`/`RotateCcw`.
- Botão "Devolver para Nicole" no Estado B, à direita do texto (layout `justify-between`). Só renderiza quando `onResumeAi !== undefined` → Estado A e contextos sem handoff reverso permanecem read-only (AC3, backward compatible com 63-8).
- **Loading (AC4):** `Loader2 animate-spin` + `disabled` durante a request; `handleResumeClick` em try/catch → em erro restaura o botão (não lança), `console.error`.
- **a11y (AC8):** `aria-label` dinâmico, `aria-disabled={loading}`, spinner `aria-hidden`, alvo `min-h-[44px] min-w-[44px]`. Sem modal/confirm (AC6). Cor verde harmônica (sem orange).

**T3 — `conversation-thread.tsx`:**
- `useRouter` importado; `localIsAiActive` state inicializado de `isAiActive`; `useEffect` sincroniza quando o prop muda (pós-`router.refresh()`).
- `handleResumeAi`: `POST /resume-ai` → em 200, `setLocalIsAiActive(true)` + `router.refresh()`. Lança em `!res.ok` para o banner capturar.
- `deriveBrokerActive(serverPlusRealtime, localIsAiActive)` agora usa o valor LOCAL → **transição instantânea** Estado B → A sem aguardar o servidor (AC5). `onResumeAi={handleResumeAi}` passado ao banner.

**ACs não 100% atendidos:** smoke manual pós-deploy (botão clicável, 403 corretor não-dono, persistência no Supabase) → escopo @qa/@devops (Supabase de produção único). Toda a lógica de código (AC1-AC10) está completa e validada.

**Validações:** `npx vitest run` → 469 testes verdes, zero regressão. Type-check `@trifold/web` → zero erros nos arquivos da story (único erro pré-existente: `visual-editor.tsx`/`react-email-editor`, fora do escopo). ESLint nos 3 arquivos → zero erros.

**Confirmações:** NENHUM push. NENHUM `tel:`/`wa.me`/click-to-call (CON-1). Escopo POR-CONVERSA (`.eq("id", conversation.id)`), não global. NENHUMA migration (`is_ai_active` já existe; `activities.type` sem CHECK).

### File List (Modificados/Criados)
- **CRIAR** `packages/web/src/app/api/leads/[id]/resume-ai/route.ts` — endpoint POST resume-ai (T1, AC1-AC2, AC7, AC9)
- `packages/web/src/app/broker/leads/[id]/_components/ai-status-banner.tsx` — `"use client"`, prop `onResumeAi`, botão Estado B com loading + a11y (T2, AC3-AC4, AC6, AC8)
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` — `useRouter`, `localIsAiActive` + sync, `handleResumeAi`, `deriveBrokerActive` usa local, `onResumeAi` ao banner (T3, AC5)

---

## QA Results

*(Preenchido pelo @qa)*

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-21 | 0.1 | Story drafted — Epic 63, Fase 5. Botão "Devolver para Nicole" no banner Estado B + endpoint POST /api/leads/[id]/resume-ai. Depende de 63-13. Permissão pendente @po. | @sm (River) |
| 2026-06-21 | 0.2 | **Validada @po — verdict GO (9/10), Status Draft→Ready.** Permissão confirmada (corretor dono OU admin/supervisor/gerente-comercial; padrão send-message L81-91). Refs de código confirmados: conversation-thread L151 `deriveBrokerActive(serverPlusRealtime, isAiActive)` (âncora exata), AiStatusBanner Estado B (L26-39), useRouter NÃO importado ainda (T3 correto em adicioná-lo), activities.type sem CHECK (type='ai_resumed' válido). Dependência sequencial 63-13 Done confirmada (sem handoff o botão não tem alvo). Endpoint resume-ai por-lead/conversa com isolamento de org. Sem fixes bloqueantes. | @po (Pax) |
| 2026-06-21 | 0.3 | **Implementada @dev — Status Ready→Ready for Review.** T1-T4 completos. Endpoint `resume-ai` criado (permissão dono OU admin/supervisor/gerente-comercial, idempotente, activity log `ai_resumed`, isolamento de org); banner Estado B ganha botão "Devolver para Nicole" (loading/a11y/≥44px, só renderiza com `onResumeAi`); thread com `localIsAiActive` + `handleResumeAi` para transição instantânea do banner via `deriveBrokerActive(local)`. Validações: vitest 469 verdes, type-check zero erros nos arquivos da story, ESLint limpo. Pendente @qa/@devops: smoke pós-deploy. | @dev (Dex) |
