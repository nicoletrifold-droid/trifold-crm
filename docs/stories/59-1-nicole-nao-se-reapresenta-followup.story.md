# Story 59-1 — Nicole não se reapresenta em follow-ups

## Metadata
- **Status:** Done
- **Epic:** 59 — Nicole: Comportamento de Apresentação em Follow-ups
- **Branch:** feature/59-1-nicole-no-reintro-followup

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck, unit tests]

## Story

**As a** lead que já interagiu com a Nicole,
**I want** não receber uma nova apresentação toda vez que a Nicole ou o sistema faz follow-up,
**so that** a experiência seja contínua e coerente, sem parecer que são pessoas/bots diferentes me contatando.

## Escopo

**IN (esta story):**
- Instrução de não-reapresentação no `dynamicSuffix` do pipeline Nicole
- Variável `{corretor}` no motor de substituição do cron de follow-up
- Helper `resolveBrokerName` no cron

**OUT (fora desta story):**
- Atualizar os templates existentes no banco (`follow_up_rules.message_template`) — responsabilidade operacional do time
- Mudanças no bloco estático/cacheável do prompt da Nicole
- Qualquer lógica de "transição de corretor" (opção 3 descartada)

## Acceptance Criteria

1. Quando a Nicole responde a um lead que **já possui mensagens anteriores** na conversa, ela NÃO se apresenta novamente ("Sou a Nicole, da Trifold...").
2. Quando o cron de follow-up envia uma mensagem via `follow_up_rules.message_template`, o template NÃO deve conter o nome da Nicole ou do corretor hardcoded.
3. A variável `{corretor}` é adicionada ao motor de substituição do cron de follow-up (`route.ts`), substituída pelo nome do corretor atribuído ao lead (`leads.assigned_broker_id → users.name`). Se não houver corretor atribuído, `{corretor}` é substituído por string vazia ou removido.
4. O pipeline da Nicole (`pipeline.ts`) injeta instrução no contexto dinâmico (`dynamicSuffix`) quando há histórico de mensagens: "IMPORTANTE: Você JÁ se apresentou a este lead. NÃO diga 'Sou a Nicole' ou qualquer variação de apresentação. Continue a conversa naturalmente."
5. A instrução de "não reapresentar" NÃO está no bloco estático cacheável — deve ir no `dynamicSuffix` para não invalidar o cache por conversa.
6. Testes unitários cobrem: (a) cron substitui `{corretor}` corretamente; (b) cron deixa string vazia quando sem corretor; (c) a instrução de não-reapresentação está presente no `dynamicSuffix` quando há histórico.

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| `noReintroContext` no bloco estático invalida cache do prompt | Baixa | AC5 exige explicitamente que fique no `dynamicSuffix` |
| `resolveBrokerName` lenta por query extra no cron | Baixa | Query simples por PK; adicionar ao batch existente se necessário |
| Template de follow-up existente sem `{corretor}` — variável não usada | Nenhuma | Substituição retorna string sem alteração se variável ausente |

## 🤖 CodeRabbit Integration

**Primary Type:** API / AI Pipeline
**Secondary Type:** Cron
**Complexity:** Low

**Primary Agents:**
- @dev: implementação e pre-commit review

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): rodar antes de marcar story como completa
- [ ] Pre-PR (@devops): rodar antes de criar PR

**Self-Healing:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Severity Filter: CRITICAL, HIGH

**Focus Areas:**
- Não invalidar o cache do prompt estático da Nicole (AC5)
- Lógica de detecção de histórico não pode lançar exceção (deve ser best-effort)

## Tasks / Subtasks

- [ ] **Task 1 — Cron: adicionar variável `{corretor}`** (AC: 2, 3)
  - [ ] 1.1 No `follow_up_rules` cron (`/api/cron/followup/route.ts`), após buscar o lead, resolver o nome do corretor via `assigned_broker_id`:
    ```ts
    // Buscar nome do corretor atribuído
    const brokerName = await resolveBrokerName(supabase, lead.assigned_broker_id)
    ```
  - [ ] 1.2 Criar helper `resolveBrokerName(supabase, brokerId)` que faz `.from("users").select("name").eq("id", brokerId)` e retorna `string` (ou `""` se não encontrado)
  - [ ] 1.3 Adicionar `.replace(/\{corretor\}/g, brokerName)` à cadeia de substituição do template (após `{empreendimento}`)
  - [ ] 1.4 Certificar que a função `resolveBrokerName` nunca lança (try/catch com fallback `""`)

- [ ] **Task 2 — Pipeline Nicole: instrução de não-reapresentação** (AC: 1, 4, 5)
  - [ ] 2.1 Em `processMessageWithMetadata` (`pipeline.ts`), verificar se `history` (histórico carregado no Step 3) já possui ao menos uma mensagem com `role === "assistant"`
  - [ ] 2.2 Montar variável `noReintroContext`:
    ```ts
    const noReintroContext = history.some(m => m.role === "assistant")
      ? "\nIMPORTANTE: Voce JA se apresentou a este lead. NAO diga 'Sou a Nicole' ou qualquer variacao de apresentacao. Continue a conversa naturalmente.\n"
      : ""
    ```
  - [ ] 2.3 Incluir `noReintroContext` no `dynamicSuffix` (junto com `dateTimeContext`, `leadContext`, etc.) — NÃO no bloco estático

- [ ] **Task 3 — Testes** (AC: 6)
  - [ ] 3.1 Teste unitário em `packages/web/src/app/api/cron/followup/route.test.ts` (criar se não existir):
    - `resolveBrokerName` retorna o nome quando `assigned_broker_id` existe
    - `resolveBrokerName` retorna `""` quando `assigned_broker_id` é null
    - Template com `{corretor}` é substituído corretamente
  - [ ] 3.2 Teste unitário em `packages/ai/src/chat/pipeline.test.ts`:
    - `dynamicSuffix` contém a instrução de não-reapresentação quando há histórico com mensagens `assistant`
    - `dynamicSuffix` NÃO contém a instrução quando não há histórico

- [ ] **Task 4 — Verificação manual** (AC: 1, 2)
  - [ ] 4.1 No CRM, abrir lead Gabriel (b4346490-179c-47e9-bee5-00ee7f22eae4) e verificar que a próxima resposta da Nicole não contém apresentação

## Dev Notes

### Arquivos relevantes

| Arquivo | Papel |
|---------|-------|
| `packages/web/src/app/api/cron/followup/route.ts` | Cron de follow-up — adicionar `{corretor}` (linha ~262) |
| `packages/ai/src/chat/pipeline.ts` | Pipeline Nicole — adicionar `noReintroContext` ao `dynamicSuffix` (linha ~383) |
| `packages/ai/src/prompts/personality.ts` | Prompt de personalidade — NÃO modificar |

### Contexto técnico

**Cron de follow-up** — trecho atual de substituição (linha ~262 em `route.ts`):
```ts
const message = (rule.message_template || "")
  .replace(/\{nome\}/g, lead.name || "")
  .replace(/\{empreendimento\}/g, propertyName)
  // ADICIONAR → .replace(/\{corretor\}/g, brokerName)
```

O lead tem `assigned_broker_id` que é um `user_id` (FK para `auth.users`/`public.users`). A tabela relevante é `users` com campo `name`.

**Pipeline Nicole** — o `dynamicSuffix` é montado em `processMessageWithMetadata` (linha ~383):
```ts
const dynamicSuffix =
  dateTimeContext +
  propertyDataContext +
  leadContext +
  memoryContext +
  noShowContext +
  buildFlowContext(...) +
  yardenGateContext
  // ADICIONAR → + noReintroContext
```

O `history` já está carregado no Step 3 do pipeline (linha ~254): `const history = await loadConversationHistory(supabase, conversationId)`. Cada item tem `{ role: "user" | "assistant", content: string }`.

**Regra de cache:** O bloco estático (`staticBlocks`) é cacheado com `cache_control: ephemeral`. O `dynamicSuffix` nunca é cacheado. Manter a instrução de não-reapresentação SEMPRE no `dynamicSuffix`.

### Testes existentes

- `packages/ai/src/chat/pipeline.test.ts` — testes do pipeline
- `packages/ai/src/prompts/index.test.ts` — testes de prompt

Padrão de teste do projeto: Vitest. Mocks via `vi.fn()`.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-17 | 1.0 | Story criada | River (@sm) |
| 2026-06-17 | 1.1 | Seção de Escopo e Riscos adicionadas; Status → Ready | Pax (@po) |

## Dev Agent Record

**Agent Model:** claude-sonnet-4-6

**File List:**
- `packages/ai/src/chat/pipeline.ts` — adicionada `buildNoReintroContext()` exportada; `noReintroContext` no `dynamicSuffix`
- `packages/ai/src/chat/pipeline.test.ts` — 4 testes novos para `buildNoReintroContext`
- `packages/web/src/app/api/cron/followup/route.ts` — `resolveBrokerName()` exportada; `{corretor}` na cadeia de substituição do template
- `packages/web/src/app/api/cron/followup/resolve-broker-name.test.ts` — 5 testes novos (criado)

**Completion Notes:**
- 34/34 testes passando (30 existentes + 4 pipeline + 5 broker = ✅ — corrigido: 29 existentes + 4 + 5 = 34)
- Typecheck limpo em `@trifold/ai`; erros pré-existentes em `@web` (`react-email-editor`) não relacionados
- `resolveBrokerName` e `buildNoReintroContext` são funções puras/isoladas — nunca lançam exceção
