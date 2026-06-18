# Story 63-5 — Unificar Página vs Drawer em Componente Único de Conversa

## Metadata
- **Epic:** 63 — UX do Atendimento do Corretor — Chat Mobile-First
- **Story:** 63-5
- **Status:** Ready for Review
- **Validated:** 2026-06-18 by @po (Pax) — verdict **GO (9/10)** após revalidação dos fixes do @sm. **FIX 1 RESOLVIDO:** consumidor compartilhado `kanban-board.tsx` mapeado e coberto — confirmado no código (`import LeadDetailDrawer` L20, uso L551); agora consta no Context (tabela de consumidores), AC3, AC6(b) dashboard, Risco R4 e Smoke de 3 contextos. **FIX 2 RESOLVIDO:** conflito `onSendMessage` eliminado — contrato de `ConversationThread` bate com a interface real de `BrokerMessageInput` confirmada no código (`{ leadId: string; onSent?: (msg: OptimisticMessage) => void; disabledByWindow?: boolean }`, L19-37); `ConversationThread` encapsula o composer e gerencia `useState<OptimisticMessage[]>` internamente, sem callback externo. **FIX 3 OK:** duplicação restante declarada como estrutural (visual já resolvido pela 63-2; helpers `bubble-styles.ts` e `window-status-badge.tsx` confirmados em `_components/`). **FIX 4 OK:** decisão de escopo Opção A/B explicitada nos Dev Notes e exigida no Change Log/DoD antes de iniciar T2. CON-1 OK (sem `tel:`/`wa.me` nos arquivos-alvo, verificado). **Nota (não-bloqueante):** `page.tsx` está em alteração concorrente pela 63-6 (já em implementação) — refs de linha sofreram drift de 1-2 linhas (`LeadEditForm` L127, conversa ~L204) e o `max-h-96` (antes L209) já foi removido pela 63-6; os marcadores são localizáveis por conteúdo e a story corretamente assume 63-6 Done antes da implementação.
- **Priority:** P1 — duplicação de UI causa divergências e dobra o custo de manutenção
- **Complexity:** L (8-12h)
- **Fase:** 2 (Estrutural)
- **Created:** 2026-06-18
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[conversation_render_parity_check, regression_page_check, regression_drawer_check, regression_kanban_check]`
- **Depende de:** Story 63-2 Done (padrão canônico de bolhas definido antes de criar o componente unificado)

---

## User Story

**Como** desenvolvedor que mantém o CRM do corretor,
**Quero** que a UI de conversa exista em um único componente reutilizável,
**Para que** qualquer correção de bug ou melhoria de UX se aplique automaticamente nos dois contextos (página e drawer) sem duplicar código.

---

## Context

Hoje existem **duas implementações do chat de conversa** para o mesmo domínio:

1. `packages/web/src/app/broker/leads/[id]/page.tsx` — tela de detalhe completa (Server Component + Client)
2. `packages/web/src/components/leads/lead-detail-drawer.tsx` — drawer lateral (~975+ linhas, Client Component)

As duas renderizam o histórico de conversa do lead com lógicas paralelas (fetch, scroll, layout).
**A divergência de cores/rótulos já foi resolvida pela Story 63-2** (helper `getBubbleStyle` compartilhado, `window-status-badge.tsx` já no header de `page.tsx` L206, `disabledByWindow` já em `BrokerMessageInput`). A duplicação restante é **estrutural**: fetch de mensagens, gerenciamento de scroll, layout do container.

### Consumidores do `LeadDetailDrawer` — CONFIRMADOS NO CÓDIGO

O componente `lead-detail-drawer.tsx` é importado em **dois lugares distintos**:

| Arquivo | Contexto | Import | Uso |
|---------|----------|--------|-----|
| `packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx` | Área do corretor (broker) | L6 | L169 |
| `packages/web/src/components/pipeline/kanban-board.tsx` | Dashboard / Kanban | L20 | L551 |

**Esta é a restrição crítica da story:** qualquer refatoração do drawer deve ser validada em AMBOS os contextos. O kanban do dashboard é a superfície de maior risco — ele é usado por admin/supervisor, não só por corretores.

### Objetivo
Extrair a renderização de conversa em um único componente `ConversationThread` que:
- É consumido tanto por `page.tsx` quanto por `lead-detail-drawer.tsx`
- Em mobile (< 1024px): exibe tela cheia estilo chat, sem barra lateral
- Em desktop (≥ 1024px): pode ser inserido no layout de coluna existente

### Estratégia de migração segura
1. Criar `ConversationThread` novo baseado no padrão canônico da 63-2
2. Integrar em `page.tsx` primeiro (menor risco — tela dedicada)
3. Refatorar `lead-detail-drawer.tsx` para consumir `ConversationThread`
4. Remover duplicação
5. Validar regressão em broker (`leads-list-with-drawer.tsx`) e dashboard (`kanban-board.tsx`)

O drawer tem lógica de estado, filtros, edição do lead e conversa misturados.
A refatoração deve isolar **apenas** a parte de conversa — não tocar em lógica de edição de lead dentro do drawer (isso é escopo da Story 63-7).

---

## Acceptance Criteria

- [x] **AC1:** Existe o componente `ConversationThread` em `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` com as seguintes props:
  - `messages: Message[]` — mensagens iniciais vindas do servidor
  - `lead: Pick<Lead, 'id' | 'phone' | 'name'>` — `id` é passado ao `BrokerMessageInput` interno; `phone`/`name` para exibição
  - `lastMessageAt: Date | null` — para `WindowStatusBadge`
  - `isAiActive: boolean` — disponível para o banner da 63-8 (leitura apenas nesta story)
  - `isWhatsApp: boolean` — para `WindowStatusBadge`
  O componente encapsula o `BrokerMessageInput` existente (sem prop `onSendMessage` externo). `ConversationThread` gerencia a lista de mensagens otimistas internamente com `useState<OptimisticMessage[]>` e passa o callback `onSent` ao `BrokerMessageInput`.
- [x] **AC2:** `page.tsx` usa `ConversationThread` para renderizar a seção de conversa (seção anterior L202-fim substituída)
- [ ] **AC3:** ~~`lead-detail-drawer.tsx` usa `ConversationThread`~~ → **ADIADO (DEBT-63-5-drawer, Opção B).** Drawer NÃO tocado para evitar regressão no `kanban-board.tsx` (dashboard). Entregar em 63-5b ou na 63-7.
- [x] **AC4:** A renderização de bolhas em `ConversationThread` usa o padrão canônico da Story 63-2 (`bubble-styles.ts`) — corretor laranja direita, lead cinza esquerda, Nicole roxo esquerda
- [x] **AC5:** `ConversationThread` em mobile (< 1024px) exibe chat em tela cheia (sem sidebars); em desktop (≥ 1024px) funciona inserido no layout de coluna existente
- [x] **AC6 (a):** Sem regressão no broker: scroll do histórico (`ChatScrollArea`), envio de mensagem (`BrokerMessageInput` interno), exibição de mensagem otimista (`useState`/`mergeMessages`), erro `WHATSAPP_WINDOW_CLOSED` (`disabledByWindow` derivado internamente). **AC6 (b) ADIADO (DEBT-63-5-drawer):** smoke do dashboard/kanban não aplicável — drawer inalterado, sem risco de regressão introduzido por esta story.
- [x] **AC7:** TypeScript compila sem erros (apenas 3 erros pré-existentes em `email-templates/react-email-editor`, não relacionados); ESLint passa nos arquivos da story; testes existentes do `dispatch-broker-message` continuam passando

---

## Tasks / Subtasks

- [x] **T1 — Auditar `lead-detail-drawer.tsx`: mapear trecho de conversa e impacto no kanban**
  - Confirmado: `kanban-board.tsx` importa (`L20`) e usa (`L551`) `LeadDetailDrawer` — superfície de admin/supervisor (Risco R4). Dado o risco de regressão no kanban, **decisão: Opção B** — drawer não tocado nesta story. Auditoria linha-a-linha do trecho de conversa do drawer fica para a story de acompanhamento (`DEBT-63-5-drawer`).

- [x] **T2 — Criar `conversation-thread.tsx`**
  - Extrair lógica de renderização de mensagens de `page.tsx` (L202+)
  - Integrar `bubble-styles.ts` (Story 63-2) para classes de bolha
  - Integrar `WindowStatusBadge` (Story 63-4) para badge de janela
  - Encapsular `BrokerMessageInput` internamente — receber `lead.id` e passar como `leadId` ao `BrokerMessageInput`
  - Gerenciar `useState<OptimisticMessage[]>` internamente; passar `onSent` callback ao `BrokerMessageInput`
  - Client Component (necessário pelo state de mensagens otimistas)

- [x] **T3 — Refatorar `page.tsx` para usar `ConversationThread`**
  - Seção de conversa inline substituída por `<ConversationThread />`; props passadas com dados do Server Component; `windowClosed`/imports de chat removidos de `page.tsx`.

- [ ] **T4 — Refatorar `lead-detail-drawer.tsx` para usar `ConversationThread`** → **ADIADO (DEBT-63-5-drawer, Opção B).** Não executado nesta story para preservar o `kanban-board.tsx` (dashboard). Drawer e kanban intactos.

- [x] **T5 — Smoke de regressão (contexto entregue: broker página)**
  - Broker página (`/broker/leads/[id]`): chat renderiza via `ConversationThread`. Drawer do broker e kanban do dashboard **inalterados** (Opção B) — sem regressão introduzida. Smoke completo dos 3 contextos volta a ser obrigatório quando `DEBT-63-5-drawer` for executado.

- [x] **T6 — QA pré-commit**
  - `pnpm --filter @trifold/web type-check` → zero erros nos arquivos da story (3 erros pré-existentes, não relacionados)
  - `pnpm --filter @trifold/web lint` → zero erros nos arquivos da story
  - `npx vitest run conversation-thread-merge.test.ts` → 5/5 passou

---

## Dev Notes

### Paths-chave
```
packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx   ← CRIAR (T2)
packages/web/src/app/broker/leads/[id]/page.tsx                               ← EDITAR (T3)
packages/web/src/components/leads/lead-detail-drawer.tsx                      ← EDITAR (T4) — ~975+ linhas
```

### Contrato correto do `ConversationThread` (pós-fix arquitetural)

```typescript
// BrokerMessageInput já existente — interface real confirmada:
// props: { leadId: string; onSent?: (msg: OptimisticMessage) => void; disabledByWindow?: boolean }

// ConversationThread — contrato a implementar:
interface ConversationThreadProps {
  messages: Message[]
  lead: Pick<Lead, 'id' | 'phone' | 'name'>
  lastMessageAt: Date | null
  isAiActive: boolean
  isWhatsApp: boolean
}
// NÃO há onSendMessage externo — o envio é encapsulado pelo BrokerMessageInput interno
// ConversationThread gerencia useState<OptimisticMessage[]> e passa onSent ao BrokerMessageInput
```

### Estado pós-Fase 1 (helpers já existentes — não recriar)

| Helper | Path | Status | Usado em |
|--------|------|--------|---------|
| `getBubbleStyle` | `_components/bubble-styles.ts` | Done (63-2) | `page.tsx` L211 e drawer |
| `WindowStatusBadge` | `_components/window-status-badge.tsx` | Done (63-4) | `page.tsx` L206 |
| `getWindowStatus` | `@web/lib/broker/window-status` | Done (63-4) | `page.tsx` L10 |
| `BrokerMessageInput` | `_components/broker-message-input.tsx` | Done (51-1) | `page.tsx` |

### Refs de linha confirmadas (pós-Fase 1, em `page.tsx`)
- L202: início da seção de conversa (`{/* Conversation */}`)
- L209: `max-h-96 overflow-y-auto` (a ser removido pela 63-6, mas não nesta story)
- L206: `WindowStatusBadge` já integrado no header da seção

### Dependências de stories anteriores
- `bubble-styles.ts` criado na Story 63-2 — reusar diretamente
- `WindowStatusBadge` criado na Story 63-4 — integrar no `ConversationThread`
- `BrokerMessageInput` criado na Story 51-1 — consumir como está (com `leadId` e `onSent`)

### Gotchas
- **`lead-detail-drawer.tsx` tem dois consumidores em contextos diferentes:** o kanban-board.tsx do dashboard e o leads-list-with-drawer.tsx do broker. A interface pública de `LeadDetailDrawer` (props `leadId`, `onClose`) NÃO deve mudar — apenas a renderização interna da seção de conversa é substituída
- **Estratégia de migração incremental — DECISÃO DE ESCOPO (ver abaixo):** se a refatoração do drawer for avaliada como muito arriscada pelo @dev, é aceitável entregar o `ConversationThread` apenas em `page.tsx` (AC2) e documentar o drawer como débito técnico explícito
- **Server Component vs Client Component:** `page.tsx` é Server Component; `ConversationThread` deve ser Client Component. O fetch inicial de mensagens é passado como prop `messages` desde `page.tsx` (Server Component)
- **Divergência visual já resolvida:** bolhas, cores, e rótulos já estão alinhados pela Story 63-2. A duplicação restante é exclusivamente estrutural (fetch, scroll, layout)

### Decisão de Escopo — Opção A ou Opção B (definir antes de iniciar T2)

[AUTO-DECISION] Esta decisão deve ser confirmada pelo @dev no início da implementação e registrada no Change Log. O @po foi informado desta alternativa.

| Opção | Entrega | Risco | Débito |
|-------|---------|-------|--------|
| **Opção A (recomendada como padrão)** | `ConversationThread` em `page.tsx` + `lead-detail-drawer.tsx` | L: refatoração completa; kanban pode regredir | Nenhum débito estrutural |
| **Opção B (fallback de risco)** | `ConversationThread` apenas em `page.tsx`; drawer recebe `ConversationThread` numa story de acompanhamento | M: escopo reduzido | Débito documentado explicitamente no Change Log como `DEBT-63-5-drawer` |

Se escolher Opção B, registrar no Change Log: `DEBT-63-5-drawer: refatoração do lead-detail-drawer.tsx adiada — risco de regressão no kanban-board.tsx (dashboard). Entregar como story 63-5b ou dentro da 63-7 se a unificação completa for feita lá.`

---

## File List

### Criar
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread.tsx` — componente unificado de conversa (T2) ✅
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread-merge.ts` — helper puro de merge/dedupe de mensagens otimistas (T2) ✅
- `packages/web/src/app/broker/leads/[id]/_components/conversation-thread-merge.test.ts` — testes Vitest do helper de merge (5 casos) ✅

### Modificar
- `packages/web/src/app/broker/leads/[id]/page.tsx` — consome `ConversationThread`; bloco de conversa inline + imports de chat removidos (T3) ✅

### Adiado (DEBT-63-5-drawer — Opção B)
- `packages/web/src/components/leads/lead-detail-drawer.tsx` — NÃO modificado (refatoração adiada para evitar regressão no kanban) ⏸️

### Referência (não modificar)
- `packages/web/src/app/broker/leads/[id]/_components/bubble-styles.ts` — helper de estilos (63-2)
- `packages/web/src/app/broker/leads/[id]/_components/window-status-badge.tsx` — badge de janela (63-4)
- `packages/web/src/app/broker/leads/[id]/_components/broker-message-input.tsx` — composer (51-1)
- `packages/web/src/components/pipeline/kanban-board.tsx` — consumidor do drawer; NÃO modificar
- `packages/web/src/app/broker/leads/_components/leads-list-with-drawer.tsx` — consumidor do drawer; NÃO modificar

---

## Testing

### Framework
Vitest (padrão do projeto)

### Cenários obrigatórios
- Renderização com lista vazia de mensagens → exibir estado vazio sem erro
- Renderização com mensagens mistas (user, assistant, broker) → bolhas corretas por role

### Smoke pós-deploy — TRÊS CONTEXTOS OBRIGATÓRIOS

| Contexto | Path | Ação | Resultado esperado |
|----------|------|------|--------------------|
| Broker (página) | `/broker/leads/[id]` | Abrir tela do lead | Chat renderizado via `ConversationThread`, sem regressão |
| Broker (drawer) | `/broker/leads` → clicar lead | Drawer abre | Chat renderizado via `ConversationThread`, sem regressão |
| Dashboard (kanban) | `/dashboard/pipeline` → clicar lead | Drawer abre | Chat renderizado via `ConversationThread`, sem erro de JS |
| Envio (broker) | `/broker/leads/[id]` → enviar msg | Mensagem enviada | Mensagem otimista aparece; confirmada após POST |
| Envio (drawer) | Drawer do broker → enviar msg | Mensagem enviada | Mensagem otimista aparece; confirmada após POST |

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Drawer tem lógica de estado misturada com conversa — difícil isolar | T1: auditar antes de codificar; aceitar Opção B (só page.tsx) se risco alto |
| R2 | Props de `ConversationThread` incompletas — caller precisa de dado não exposto | Usar tipos TypeScript estritos; o compilador vai guiar |
| R3 | Regressão no drawer (ação de edição de lead para de funcionar) | Editar apenas o trecho de conversa; smoke pós-deploy verifica edição de lead |
| R4 | **Regressão no `kanban-board.tsx` (dashboard)** — o drawer é consumido lá com props distintas e contexto de admin/supervisor | Smoke obrigatório no kanban pós-refatoração (T5); se risco for alto, adotar Opção B |

---

## Out of Scope

- Mover `LeadEditForm` para sheet (→ Story 63-7)
- Composer sticky (→ Story 63-6 — implementado depois do componente unificado)
- Redesign completo do drawer (somente extração do trecho de chat)
- Qualquer mudança na interface pública de `LeadDetailDrawer` (não alterar props `leadId`/`onClose`)

---

## Definition of Done

- [ ] AC1–AC7 marcados como completos
- [ ] T1–T6 marcados como done
- [ ] Decisão Opção A / Opção B registrada no Change Log
- [ ] @qa executou quality gate com verdict ≥ PASS (incluindo smoke nos 3 contextos)
- [ ] @devops fez push

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-18 | 0.1 | Story drafted — Epic 63, Fase 2, unificação de componente de conversa | @sm (River) |
| 2026-06-18 | 0.2 | **Validação PO — verdict NO-GO (6/10). Status mantido Draft.** 2 fixes obrigatórios: (1) cobrir consumidor `kanban-board.tsx` (dashboard) do `LeadDetailDrawer` em AC3/AC6/Riscos/Smoke — drawer é compartilhado com o dashboard, não só broker; (2) resolver conflito de contrato entre `onSendMessage` (AC1) e o envio interno + state otimista do `BrokerMessageInput`. Refs de linha reconciliadas pós-Fase 1 (helpers já extraídos; `max-h-96` L209). CON-1 OK. Re-validar após fixes do @sm. | @po (Pax) |
| 2026-06-18 | 0.3 | **Correção pós-NO-GO pelo @sm.** Fix 1: `kanban-board.tsx` (L20 import, L551 uso) adicionado como consumidor explícito no Context, AC3, AC6, Smoke (3 contextos) e novo Risco R4. Fix 2: conflito `onSendMessage` resolvido — AC1 redefinido para contrato sem callback externo; `ConversationThread` encapsula `BrokerMessageInput` diretamente, gerencia `useState<OptimisticMessage[]>` e passa `onSent` ao composer. Fix 3: divergência visual documentada como já resolvida pela 63-2 — duplicação restante declarada como estrutural. Fix 4: decisão de escopo Opção A/B explicitada nos Dev Notes para que @dev confirme antes de iniciar T2. Status: Draft — aguardando revalidação do @po. | @sm (River) |
| 2026-06-18 | 1.0 | **Revalidação PO — verdict GO (9/10). Status Draft → Ready.** Ambos os fixes obrigatórios confirmados contra o código real: (1) `kanban-board.tsx` importa/usa `LeadDetailDrawer` (L20/L551) e agora está mapeado em Context/AC3/AC6/R4/Smoke; (2) interface real de `BrokerMessageInput` (`{ leadId, onSent?, disabledByWindow? }`, L19-37) bate com o contrato encapsulado proposto em AC1/Dev Notes — sem `onSendMessage` externo. Helpers `bubble-styles.ts`/`window-status-badge.tsx` confirmados. Decisão Opção A/B exigida antes de T2. CON-1 OK. Único ponto não-bloqueante: drift de 1-2 linhas em `page.tsx` por edição concorrente da 63-6 (já em implementação) — refs localizáveis por conteúdo, story assume 63-6 Done antes. Liberada para @dev (após 63-6). | @po (Pax) |
| 2026-06-18 | 1.1 | **DECISÃO DE ESCOPO: OPÇÃO B (registrada antes de iniciar T2, conforme exigido pelo @po e DoD).** O @dev (Dex) adota a **Opção B**: o componente `ConversationThread` é extraído e consumido **apenas** por `page.tsx` (AC2). O `lead-detail-drawer.tsx` **NÃO é tocado** (e por consequência `kanban-board.tsx` permanece intacto), evitando risco de regressão no kanban do dashboard (Risco R4, superfície admin/supervisor). **`DEBT-63-5-drawer`: refatoração do `lead-detail-drawer.tsx` para consumir `ConversationThread` adiada — risco de regressão no `kanban-board.tsx` (dashboard). Entregar como story 63-5b ou dentro da 63-7 se a unificação completa for feita lá.** AC adiados (não implementados, débito explícito): **AC3** (drawer consome `ConversationThread`), **AC6(b)** (smoke dashboard/kanban — não aplicável sem mudança no drawer), e **T4** (refatorar drawer). ACs entregues nesta story: AC1, AC2, AC4, AC5, AC6(a), AC7. | @dev (Dex) |
| 2026-06-18 | 1.2 | **Implementação @dev (Opção B) — Status → Ready for Review.** Criados `_components/conversation-thread.tsx` (Client Component encapsulando header + `ChatScrollArea` + bolhas via `getBubbleStyle` + `WindowStatusBadge` + `BrokerMessageInput` com `useState<OptimisticMessage[]>` interno e `onSent`) e `_components/conversation-thread-merge.ts` (helper puro de merge/dedupe otimista) + teste `conversation-thread-merge.test.ts`. `page.tsx` passa a consumir `ConversationThread`; `windowClosed` agora é computado internamente pelo componente. `lead-detail-drawer.tsx` e `kanban-board.tsx` NÃO tocados (Opção B). CON-1 OK (sem `tel:`/`wa.me`). | @dev (Dex) |
