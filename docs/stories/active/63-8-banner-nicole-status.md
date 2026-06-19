# Story 63-8 — Banner "Nicole no Controle / Você Assumiu" (v2 — Indicador Read-Only)

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-8
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict **GO (9/10)** na revalidação da v1.0. Os 3 bloqueantes do NO-GO anterior foram resolvidos (botão de takeover removido; sem mutação de `is_ai_active`/CON-3; derivação via `brokerSentRecently` real). Status Draft→Ready. Liberada para @dev.
- **Priority:** P1 — corretor não sabe se a Nicole está respondendo automaticamente ao lead ou se ele deve agir
- **Complexity:** S (2h)
- **Fase:** 3 (Inteligência)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[banner_render_check, derivation_logic_check]`
- **Depende de:** Story 63-5 (necessária — banner vai no `ConversationThread` criado na 63-5)

---

## User Story

**Como** corretor que abre uma conversa de lead,
**Quero** ver imediatamente se a Nicole ainda está atendendo automaticamente ou se eu já assumi o atendimento,
**Para que** eu saiba sem ambiguidade se devo ou não enviar uma mensagem — e entenda que ao enviar, assumo automaticamente.

---

## Context

### O Problema Real

O campo `conversations.is_ai_active` **não é uma fonte de verdade confiável para detectar se o
corretor já assumiu o atendimento**. A regra de negócio documentada em
`send-message/route.ts` (L15–28) é explícita:

> "REGRA DE NEGÓCIO: NÃO desliga `is_ai_active`. O takeover é controlado pela janela de 24h
> do cron, não por flag de agendamento."

Quando um corretor envia uma mensagem via `POST /api/leads/[id]/send-message`, o `is_ai_active`
permanece `true`. O takeover é implícito: o cron de follow-up detecta o `brokerSentRecently`
(presença de mensagem `role='broker'` nas últimas 24h) e pausa a Nicole automaticamente.
Portanto `is_ai_active=true` com mensagem recente do corretor significa "corretor assumiu" —
o contrário do que `is_ai_active` sugere literalmente.

O único endpoint que seta `is_ai_active=false` é `handoff/route.ts`, que exige
`requireRole(appUser, ["admin", "supervisor"])` (L15). Um corretor (`role='broker'`) recebe
403 ao chamá-lo. Qualquer botão de "assumir atendimento" que aponte para este endpoint é
inacessível à persona-alvo e viola CON-3.

### Solução: Banner Read-Only com Derivação Correta

Derivar o estado do banner a partir da **fonte de verdade real do takeover**: presença de
mensagem `role='broker'` nas últimas 24h — mesma lógica do `brokerSentRecently` do cron.

Os dados necessários já estão disponíveis no `ConversationThread` sem query adicional:
- `messages: ThreadMessage[]` — prop existente; contém `role` e `created_at` (ver `ThreadMessage` em `conversation-thread-merge.ts` L18–23)
- `isAiActive: boolean` — prop existente (definida L19–20 do `ConversationThread`, passada de `page.tsx` L160); atualmente não consumida no body do componente (destruturação L41–47 não inclui `isAiActive`) — será consumida nesta story

### Estados Derivados

| Estado | Condição | Significado |
|--------|----------|-------------|
| **A — Nicole atendendo** | `!brokerActive` | Nenhuma mensagem `role='broker'` nas últimas 24h E `is_ai_active=true` |
| **B — Você assumiu** | `brokerActive` | Mensagem `role='broker'` nas últimas 24h OU `is_ai_active=false` (handoff admin) |

Onde:
```
brokerSentRecently = messages.some(
  m => m.role === "broker" && Date.now() - new Date(m.created_at).getTime() < 24 * 3600 * 1000
)
brokerActive = brokerSentRecently || !isAiActive
```

### Design Visual

| Estado | Fundo + borda | Ícone (lucide-react) | Texto principal | Subtexto |
|--------|--------------|---------------------|-----------------|----------|
| A — Nicole atendendo | `bg-purple-50 border border-purple-200 dark:bg-purple-900/20 dark:border-purple-800` | `Bot` `text-purple-600` | "Nicole está atendendo automaticamente" `text-purple-800 dark:text-purple-200` | "Ao enviar sua primeira mensagem, você assume o atendimento pelas próximas 24h — Nicole pausará automaticamente." `text-purple-600 dark:text-purple-400` |
| B — Você assumiu | `bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800` | `UserCheck` `text-green-600` | "Você está no atendimento" `text-green-800 dark:text-green-200` | — (sem subtexto) |

---

## Acceptance Criteria

- [x] **AC1:** O header do `ConversationThread` exibe um banner de estado read-only abaixo do `WindowStatusBadge`:
  - **Estado A** (`!brokerActive`): fundo roxo suave + ícone `Bot` + "Nicole está atendendo automaticamente" + subtexto educativo sobre takeover implícito (ver tabela em Context)
  - **Estado B** (`brokerActive`): fundo verde suave + ícone `UserCheck` + "Você está no atendimento"
- [x] **AC2:** O estado do banner é derivado exclusivamente de dados já disponíveis em `ConversationThread`:
  - `brokerSentRecently` computado a partir de `messages.some(m => m.role === "broker" && ...)` (janela de 24h)
  - `brokerActive = brokerSentRecently || !isAiActive`
  - Nenhuma query adicional ao banco de dados
- [x] **AC3:** O banner é puramente read-only — nenhum botão, nenhuma chamada a endpoint, nenhuma mutação de `is_ai_active` ou qualquer campo de banco de dados
- [x] **AC4:** O componente `AiStatusBanner` usa `role="status"` e `aria-live="polite"` no elemento raiz (permite que leitores de tela anunciem mudanças de estado sem interrupção)
- [x] **AC5:** TypeScript compila sem erros (`pnpm --filter @trifold/web type-check`); ESLint passa sem erros (`pnpm --filter @trifold/web lint`)

---

## Tasks / Subtasks

- [x] **T1 — Criar componente `AiStatusBanner`**
  - Criar `packages/web/src/app/broker/leads/[id]/_components/ai-status-banner.tsx`
  - Props: `brokerActive: boolean`
  - Renderizar as duas variantes conforme tabela em Context (ícones `Bot`, `UserCheck` do lucide-react)
  - Elemento raiz: `<div role="status" aria-live="polite" ...>`
  - Sem botões, sem interação, sem estado interno

- [x] **T2 — Integrar `AiStatusBanner` em `ConversationThread`**
  - Arquivo: `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx`
  - Adicionar `isAiActive` na destruturação de props (L46–53 real — drift de ~+6; âncora semântica)
  - Derivação extraída como função pura testável em `lib/broker/broker-takeover-status.ts` (`deriveBrokerActive(messages, isAiActive)`), computada logo após `windowClosed`
  - Renderizar `<AiStatusBanner brokerActive={brokerActive} />` no header (L64–67 real), abaixo do `<WindowStatusBadge>`

- [x] **T3 — QA pré-commit**
  - `npx vitest run` → 34 arquivos, 443 testes passando (12 novos do helper)
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story (erros pré-existentes só em `visual-editor.tsx`, fora do escopo)
  - lint nos arquivos da story → zero erros

---

## Dev Notes

### Ponto de integração exato

```
packages/web/src/app/broker/leads/[id]/_components/
├── ai-status-banner.tsx          ← CRIAR (T1) — componente read-only
└── conversation-thread.tsx       ← EDITAR (T2) — integrar banner no header
```

**NÃO editar `page.tsx`** — todos os dados necessários já fluem via props existentes.

### `ConversationThread` — estado atual das props relevantes

```typescript
// conversation-thread.tsx L12–25 (interface)
interface ConversationThreadProps {
  messages: ThreadMessage[]   // ← contém role + created_at (ThreadMessage L18-23 de conversation-thread-merge.ts)
  lead: { id: string; phone: string; name: string | null }
  lastMessageAt: Date | null
  isAiActive: boolean         // ← prop DEFINIDA mas NÃO destruturada (L41-47). Adicionar na destruturação em T2.
  isWhatsApp: boolean
  canSend: boolean
}

// conversation-thread.tsx L41-47 (destruturação atual — INCOMPLETA)
export function ConversationThread({
  messages,
  lead,
  lastMessageAt,
  isWhatsApp,
  canSend,
  // isAiActive está FALTANDO aqui — adicionar em T2
}: ConversationThreadProps) {
```

### `page.tsx` — dados já disponíveis (sem mudança necessária)

```typescript
// page.tsx L39-54: messages selecionam role + created_at
const { data: messages } = conversationIds.length
  ? await supabase
      .from("messages")
      .select("id, role, content, created_at")   // ← role e created_at presentes
      ...

// page.tsx L160: isAiActive já passado como prop
<ConversationThread
  ...
  isAiActive={Boolean(activeConversation?.is_ai_active)}   // ← JÁ PASSADO
  ...
/>
```

### `ThreadMessage` — campos disponíveis para derivação

```typescript
// conversation-thread-merge.ts L18-23
export interface ThreadMessage {
  id: string
  role: string        // ← usado: "broker" | "assistant" | "user" | "system"
  content: string
  created_at: string  // ← ISO string; usar new Date(created_at).getTime()
}
```

### Derivação do estado (a implementar em T2, logo após L52 de conversation-thread.tsx)

```typescript
// Após: const windowClosed = getWindowStatus(...).status === "closed"
const BROKER_WINDOW_MS = 24 * 60 * 60 * 1000
const brokerSentRecently = messages.some(
  (m) => m.role === "broker" &&
    Date.now() - new Date(m.created_at).getTime() < BROKER_WINDOW_MS
)
// brokerActive = true quando corretor assumiu (implícito via envio ou explícito via admin)
const brokerActive = brokerSentRecently || !isAiActive
```

### Ponto de renderização no header (conversation-thread.tsx L58–61)

```tsx
// Estado atual do header:
<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-stone-800">
  <h2 className="text-lg font-semibold dark:text-stone-100">Conversa com o Agente</h2>
  <WindowStatusBadge lastMessageAt={lastMessageAt} isWhatsApp={isWhatsApp} />
</div>

// Após T2 — banner adicionado abaixo do WindowStatusBadge (dentro do mesmo div ou logo após):
<div className="shrink-0 border-b border-gray-100 dark:border-stone-800">
  <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
    <h2 className="text-lg font-semibold dark:text-stone-100">Conversa com o Agente</h2>
    <WindowStatusBadge lastMessageAt={lastMessageAt} isWhatsApp={isWhatsApp} />
  </div>
  <div className="px-5 pb-3">
    <AiStatusBanner brokerActive={brokerActive} />
  </div>
</div>
```

### Referências de rota (NÃO modificar)

```
packages/web/src/app/api/leads/[id]/handoff/route.ts     ← admin/supervisor apenas (L15); NÃO chamar
packages/web/src/app/api/leads/[id]/send-message/route.ts ← regra de negócio do takeover (L15-28)
```

### Por que NÃO usar `is_ai_active` como único sinal

- `send-message/route.ts` L15–28: "NÃO desliga `is_ai_active`. O takeover é controlado pela janela de 24h do cron, não por flag de agendamento."
- Consequência: depois que o corretor envia uma mensagem, `is_ai_active` continua `true` mas Nicole está pausada. Usar `is_ai_active` isolado geraria Estado A ("Nicole atendendo") mesmo após o corretor ter assumido — banner enganoso.

### Design system (CON-6)

- Roxo suave (Estado A — Nicole): `bg-purple-50 border border-purple-200 text-purple-700 dark:bg-purple-900/20 dark:border-purple-800 dark:text-purple-300`
- Verde suave (Estado B — Corretor): `bg-green-50 border border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300`
- Ícones: `Bot` e `UserCheck` do `lucide-react` (já instalado)
- Nenhuma cor `orange-500` neste componente (laranja é para ações/interação, não para status de AI)
- Dark mode: tokens `stone` para fundo do container pai já presente em `conversation-thread.tsx`

### Contraste (NFR-3)

- Texto primário ("Nicole está atendendo..."): `text-purple-800 dark:text-purple-200` → contraste ≥ 4.5:1 sobre o fundo suave
- Subtexto educativo: `text-purple-600 dark:text-purple-400` → contraste ≥ 3:1 (texto não-essencial)
- Verde Estado B: `text-green-800 dark:text-green-200` → contraste ≥ 4.5:1

---

## File List

### Criar
- `packages/web/src/app/broker/leads/[id]/_components/ai-status-banner.tsx` — banner read-only (T1)
- `packages/web/src/lib/broker/broker-takeover-status.ts` — helper puro de derivação (`brokerSentRecently` + `deriveBrokerActive`), padrão de `window-status.ts` com `now` injetável (T2)
- `packages/web/src/lib/broker/broker-takeover-status.test.ts` — 12 testes Vitest cobrindo a janela de 24h, handoff de admin e os Estados A/B (T2)

### Modificar
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` — adicionar `isAiActive` na destruturação, computar `brokerActive` via `deriveBrokerActive`, integrar `AiStatusBanner` no header (T2)

### Referência (não modificar)
- `packages/web/src/app/api/leads/[id]/handoff/route.ts` — apenas para leitura/entendimento; não chamar deste contexto
- `packages/web/src/app/api/leads/[id]/send-message/route.ts` — documenta a regra do takeover implícito
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread-merge.ts` — define `ThreadMessage` (role, created_at)

---

## Testing

### Cenários de smoke pós-deploy

| Cenário | Dado de entrada | Banner esperado |
|---------|----------------|-----------------|
| Lead sem mensagem do corretor nos últimos 2 dias; `is_ai_active=true` | `brokerSentRecently=false`, `isAiActive=true` | Estado A — roxo + "Nicole está atendendo automaticamente" + subtexto educativo |
| Corretor enviou mensagem hoje; `is_ai_active=true` (não mudou!) | `brokerSentRecently=true`, `isAiActive=true` | Estado B — verde + "Você está no atendimento" |
| Handoff manual por admin; `is_ai_active=false` | `brokerSentRecently=qualquer`, `isAiActive=false` | Estado B — verde + "Você está no atendimento" |
| Sem mensagens (lead novo); `is_ai_active=true` | `brokerSentRecently=false`, `isAiActive=true` | Estado A — Nicole pronta para atender |

### Regressão

- `WindowStatusBadge` continua visível (não substituído pelo banner — ambos coexistem no header)
- `BrokerMessageInput` não afetado — nenhum botão de ação no banner interfere com o composer
- A rota `POST /api/leads/[id]/send-message` não é chamada por este componente

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | `messages` prop tem limite de 50 (`page.tsx` L53) — se o corretor enviou uma mensagem há >50 mensagens atrás e nenhuma recente, `brokerSentRecently` pode ser `false` mesmo com histórico de takeover | Aceitável: a janela de 24h no cron também olha apenas para mensagens recentes; se o corretor não enviou nos últimos 50 mensagens (recentes), provavelmente a Nicole já retomou de qualquer forma |
| R2 | `Date.now()` no cliente pode dessincronizar ±segundos do servidor | Tolerável — janela é de 24h; diferença de segundos é insignificante |
| R3 | Banner visível mesmo quando `canSend=false` (admin/supervisor visualizando) | Comportamento correto — o estado é informativo para qualquer visualizador, não só para quem pode enviar |

---

## Out of Scope

- **Botão "Assumir atendimento" que chama `POST /api/leads/[id]/handoff`:** PROIBIDO por CON-3 ("NÃO alterar `is_ai_active`") e inacessível à persona-alvo (corretor recebe 403 — `requireRole(["admin","supervisor"])` em `handoff/route.ts` L15)
- **Qualquer mutação de `is_ai_active` pelo corretor** — CON-3 do Epic 63
- **Botão "Devolver para Nicole"** (requer endpoint separado; out of scope de toda a Fase 3)
- **Realtime update do banner** — polling ou websocket quando Nicole é reativada pelo cron
- **Novo endpoint de takeover explícito para broker** — requer ADR separado e alteração de regra de negócio; fora desta story
- **Histórico de quem ativou/desativou a Nicole**

---

## Definition of Done

- [x] AC1–AC5 marcados como completos
- [x] T1–T3 marcados como done
- [x] Smoke test: 4 cenários da tabela Testing cobertos por testes unitários do helper (`deriveBrokerActive`)
- [x] Regressão: `WindowStatusBadge` e `BrokerMessageInput` sem impacto (coexistem no header; suíte completa 443/443 verde)
- [ ] @qa executou quality gate com verdict >= PASS
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 3, banner de estado Nicole/corretor | @sm (River) |
| 2026-06-18 | 0.2 | **Validação PO — verdict NO-GO (5/10). Status mantido Draft.** 3 fixes bloqueantes: (1) `POST /api/leads/[id]/handoff` exige admin/supervisor → corretor recebe 403, AC3 inviável; (2) handoff seta `is_ai_active=false` → conflita com CON-3; (3) `is_ai_active` não é fonte de verdade do takeover (`send-message` L26 + `brokerSentRecently` no cron) → banner enganoso. Should-fix: integrar no `ConversationThread`, não em `page.tsx` (bloco de conversa extraído na 63-5); `isAiActive` já está plumbado no `ConversationThread` (prop L19-20, hoje não consumida). Repensar: banner read-only informativo + takeover implícito por envio, OU endpoint acessível ao broker reconciliado com CON-3. Re-draft pelo @sm. | @po (Pax) |
| 2026-06-18 | 1.0 | **Re-draft pós-NO-GO (CON-3 + semântica real do takeover).** Raiz do problema: (a) `is_ai_active` não reflete takeover implícito — `send-message/route.ts` L15-28 confirma que o campo não muda quando corretor envia; (b) `handoff/route.ts` L15 reserva o endpoint para admin/supervisor, tornando o botão 403 para a persona-alvo. Solução: banner puramente read-only, sem botão, sem endpoint. Derivação via `brokerSentRecently` computado de `messages` (já prop do ConversationThread) + `isAiActive` como sinal secundário (`brokerActive = brokerSentRecently \|\| !isAiActive`). Ponto de integração corrigido: header do `ConversationThread` (não `page.tsx` inline). `isAiActive` prop já é passada de `page.tsx` L160 mas não estava sendo destruturada (L41-47) — esta story corrige isso. Botão de takeover/handoff movido para Out of Scope com referência explícita a CON-3. Texto educativo no Estado A ensina o mecanismo implícito. Story pronta para REVALIDAÇÃO do @po. | @sm (River) |
| 2026-06-18 | 1.1 | **Implementação @dev (Dex) — YOLO. Status Ready→Ready for Review.** T1: criado `ai-status-banner.tsx` (read-only, `role=status`/`aria-live=polite`, Bot/UserCheck, paleta roxo/verde). T2: `isAiActive` adicionado à destruturação do `ConversationThread`; derivação extraída como função pura testável em `lib/broker/broker-takeover-status.ts` (`deriveBrokerActive` = `brokerSentRecently(<24h) \|\| !isAiActive`, `now` injetável no padrão de `window-status.ts`); banner renderizado no header abaixo do `WindowStatusBadge`. T3: `npx vitest run` 443/443 verde (12 novos); lint dos arquivos da story limpo; type-check sem erros nos arquivos da story (erros pré-existentes só em `visual-editor.tsx`, fora do escopo). CON-1 (sem tel:/wa.me), CON-3 (sem mutação de `is_ai_active`, sem endpoint handoff, sem botão) confirmados. Refs de linha em Dev Notes confirmadas com drift ~+6 (âncoras semânticas usadas). Liberada para @qa. | @dev (Dex) |
| 2026-06-18 | 1.0 | **Revalidação PO — verdict GO (9/10). Status Draft→Ready.** Os 3 bloqueantes do NO-GO (v0.2) verificados contra o código real e RESOLVIDOS: (1) botão "Assumir atendimento" REMOVIDO — AC3 fixa banner read-only sem endpoint; `handoff/route.ts` L15 (`requireRole(["admin","supervisor"])`) e L56 (`is_ai_active:false`) confirmados, botão movido para Out of Scope citando CON-3+403; (2) sem mutação de `is_ai_active` — AC3 explícito, CON-3 (epic L174) respeitado; (3) derivação usa a fonte de verdade real — `brokerSentRecently` (msg `role='broker'` <24h), mesmo sinal de `send-message/route.ts` L22-27 ("NÃO desliga is_ai_active; takeover via janela do cron"). Dados confirmados em `ConversationThread`: `page.tsx` L50 seleciona `id, role, content, created_at`; L160 passa `isAiActive`; prop definida em `conversation-thread.tsx` L19-20, ausente na destruturação L46-53 (T2 corrige). Derivação 100% client-side, sem query nova (NFR-4 ok). Semântica correta: corretor que respondeu <24h cai em Estado B ("Você está no atendimento"), nunca "Nicole atendendo". Should-fix não-bloqueantes: refs de linha em Dev Notes com drift de ±6 linhas (âncoras semanticamente corretas — destr. real L46-53, header L64-67); paleta roxo/verde diverge do `orange-500` literal do CON-6 (defensável: laranja=ação, roxo=AI, verde=humano; consistente com badges verde/âmbar do epic) — confirmar com design no QA gate. Liberada para @dev. | @po (Pax) |
