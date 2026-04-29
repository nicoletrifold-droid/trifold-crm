# Story 18.1 — Memory Writer: Popular `lead_memories` com Fragmentos Semânticos

## Status
Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["code-review", "test-validation"]

## Story
**As a** Nicole (AI agent),
**I want** salvar fragmentos semânticos de memória após cada turno de conversa em `lead_memories`,
**so that** o loader L2 (topic memories) e L3 (semantic search) passem a retornar resultados reais, permitindo que eu personalize o atendimento de leads que retornam com contexto rico cross-sessão.

## Contexto

**Epic 18 — Nicole Memory Writer (MemPalace-Inspired)**

O sistema de memória da Nicole possui duas camadas funcionais:
1. **`lead_facts`** — fatos estruturados via regex (escrita ativa desde `pipeline.ts` step 12.5a) ✅
2. **`lead_memories`** — fragmentos semânticos com pgvector (tabela existe, schema OK, mas sempre vazia) ❌

O `memory/loader.ts` já faz leitura L2/L3 de `lead_memories`, mas retorna string vazia sempre porque a tabela não tem dados. Esta story implementa o **writer** que preenche a tabela.

**Arquivos existentes relevantes:**
- `packages/ai/src/memory/loader.ts` — leitura L1/L2/L3 (referência de interface)
- `packages/ai/src/flows/memory-extraction.ts` — regex extraction para `lead_facts` (padrão a seguir)
- `packages/ai/src/chat/pipeline.ts` — ponto de integração (step 12.5c a adicionar)
- `packages/ai/src/rag/embeddings.ts` — `generateEmbedding()` existente (reusar)
- `supabase/migrations/012_lead_memory_system.sql` — schema de `lead_memories` (referência)

**Schema `lead_memories` (já existe no banco):**
```sql
CREATE TABLE lead_memories (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  room text NOT NULL,       -- tópico: visit_scheduling|negotiation|property_vind|property_yarden|qualification|general
  hall text NOT NULL,       -- tipo: preferences|objections|events|facts
  content text NOT NULL,   -- fragmento semântico, 1-2 frases
  importance float NOT NULL DEFAULT 0.5,  -- 0.0-1.0
  embedding vector(1536),  -- gerado via generateEmbedding()
  source_message_id uuid,
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Dependências:**
- Migration `012_lead_memory_system.sql` aplicada ✅
- `generateEmbedding()` de `packages/ai/src/rag/embeddings.ts` ✅
- Anthropic Haiku para classificação semântica ✅

## Acceptance Criteria

1. [x] AC1: `packages/ai/src/memory/writer.ts` existe e exporta: `extractMemoryFragments`, `saveMemoryFragments`, `processConversationTurn`
2. [x] AC2: `extractMemoryFragments(anthropic, userMsg, assistantMsg, room)` chama Haiku com prompt compacto e retorna `MemoryFragment[]` (máx 3 por turno). Se Haiku retornar JSON inválido, retorna `[]` sem throw.
3. [x] AC3: `saveMemoryFragments(supabase, leadId, fragments[])` gera embedding via `generateEmbedding(content)` e insere em `lead_memories`. Fragmentos com `importance < 0.3` são descartados antes do insert.
4. [x] AC4: `processConversationTurn(supabase, anthropic, leadId, userMsg, assistantMsg)` detecta o room via keywords (reusar lógica de `detectRoom` de `loader.ts`) → chama `extractMemoryFragments` → chama `saveMemoryFragments`. Qualquer erro é capturado internamente — nunca propaga.
5. [x] AC5: `pipeline.ts` integra `processConversationTurn` no step 12.5c como fire-and-forget: `.catch(err => console.error("Memory writer failed (non-blocking):", err))`. Só executa dentro do guard `if (conversation?.lead_id && !handoffResult.trigger)`.
6. [x] AC6: `packages/ai/src/memory/writer.test.ts` cobre os 4 casos: happy path, Haiku JSON inválido → `[]`, fragmento `importance < 0.3` → não inserido, `processConversationTurn` com erro de embedding → resolve sem throw.
7. [x] AC7: `pnpm run type-check` passa sem erros
8. [x] AC8: `pnpm run lint` passa sem erros

## Estimativa
**Complexidade:** S (Small) — 2-4h. Zero migrations. Código isolado, pattern já existe no projeto.

## Riscos
- **Latência:** Haiku call por mensagem pode adicionar ~200ms — mitigado por ser async fire-and-forget (não bloqueia a resposta)
- **Custo:** 1 chamada Haiku por turno ≈ $0.00015. Para 1k mensagens/dia ≈ $0.15/dia — aceitável
- **Duplicação de memórias:** Sem deduplicação explícita — aceito por ora. Memórias similares convivem sem problema já que o loader usa LIMIT e similarity threshold
- **`detectRoom` privado em `loader.ts`:** É necessário exportar a função ou duplicar a lógica. Recomendado: exportar de `loader.ts`.

## Fora do Escopo (OUT)

- Deduplicação semântica de memórias antes do insert (complexidade alta, story futura)
- Expiração automática de memórias (`valid_to` em `lead_memories`) — futuro
- Interface de admin para visualizar memórias — futuro
- Migração de histórico existente (conversas antigas → `lead_memories`) — story separada

## Tasks / Subtasks

- [x] Task 1: Criar `packages/ai/src/memory/writer.ts` (AC1, AC2, AC3, AC4)
  - [x] 1.1: Definir interface `MemoryFragment { room: string; hall: string; content: string; importance: number }`
  - [x] 1.2: Definir halls válidos: `'preferences' | 'objections' | 'events' | 'facts'`
  - [x] 1.3: Definir rooms válidos (copiar da lógica de `detectRoom` em `loader.ts`): `visit_scheduling | negotiation | property_vind | property_yarden | qualification | general`
  - [x] 1.4: Exportar `detectRoom` de `loader.ts` (mudar de função privada para export)
  - [x] 1.5: Implementar `extractMemoryFragments(anthropic, userMsg, assistantMsg, room)` com prompt Haiku compacto e parse defensivo de JSON
  - [x] 1.6: Implementar `saveMemoryFragments(supabase, leadId, fragments[])` — filter importance ≥ 0.3, generateEmbedding, INSERT lead_memories
  - [x] 1.7: Implementar `processConversationTurn(supabase, anthropic, leadId, userMsg, assistantMsg)` — detectRoom → extractMemoryFragments → saveMemoryFragments, try/catch total

- [x] Task 2: Integrar em `packages/ai/src/chat/pipeline.ts` (AC5)
  - [x] 2.1: Adicionar import `processConversationTurn` de `'../memory/writer'`
  - [x] 2.2: Após step 12.5b, dentro do guard `if (conversation?.lead_id && !handoffResult.trigger)`, adicionado step 12.5c

- [x] Task 3: Criar `packages/ai/src/memory/writer.test.ts` (AC6)
  - [x] 3.1: Test happy path — `extractMemoryFragments` com mock Haiku retornando JSON válido → retorna `MemoryFragment[]` correto
  - [x] 3.2: Test Haiku retorna string não-JSON → retorna `[]` sem throw
  - [x] 3.3: Test fragmento com `importance = 0.2` → `saveMemoryFragments` não faz insert (expect supabase.insert not called)
  - [x] 3.4: Test `processConversationTurn` com `generateEmbedding` throwing → function resolve sem throw (silencioso)
  - [x] 3.5 (SF2 @po): Test `processConversationTurn` com mensagem genérica → detectRoom null → fallback 'general' sem crash

- [x] Task 4: Validação (AC7, AC8)
  - [x] 4.1: `pnpm run type-check` — 0 erros
  - [x] 4.2: `pnpm run lint` — 0 erros, 2 warnings pré-existentes

## Dev Notes

### Prompt Haiku para extração de memórias

O prompt deve ser compacto (≤ 300 tokens de input) para controlar custo:

```
Você é um agente de extração de memória para Nicole, assistente de vendas imobiliárias.

Dado o turno de conversa abaixo, extraia até 3 fragmentos memoráveis.
Retorne APENAS JSON válido (array). Se não houver nada memorável, retorne [].

Rooms: visit_scheduling|negotiation|property_vind|property_yarden|qualification|general
Halls: preferences|objections|events|facts
  - preferences: o que o lead quer ou prefere
  - objections: resistências, preocupações com preço ou timing
  - events: coisas que aconteceram (visita agendada, pediu handoff)
  - facts: contexto de vida não capturado por regex (motivação, situação familiar)

Formato: [{"room":"...","hall":"...","content":"frase concisa","importance":0.0-1.0}]
Importance: 0.8+ = muito relevante | 0.5-0.8 = relevante | <0.3 = descartar

Room detectado do contexto: {room}
Lead: "{userMsg}"
Nicole: "{assistantMsg}"
```

### Lógica de `detectRoom` — exportar de `loader.ts`

Adicionar `export` na função `detectRoom` em `loader.ts`:
```typescript
// packages/ai/src/memory/loader.ts (linha ~126)
export function detectRoom(message: string): string | null { ... }
```

Em `writer.ts`, importar:
```typescript
import { detectRoom } from './loader'
```

Se detectRoom retornar `null` → usar `'general'` como room fallback.

### Pattern de `saveMemoryFragments` — referência de `generateEmbedding`

```typescript
// packages/ai/src/rag/embeddings.ts — função a reusar
import { generateEmbedding } from '../rag/embeddings'

// Dentro de saveMemoryFragments:
const embedding = await generateEmbedding(fragment.content)
await supabase.from('lead_memories').insert({
  lead_id: leadId,
  room: fragment.room,
  hall: fragment.hall,
  content: fragment.content,
  importance: fragment.importance,
  embedding,
})
```

### Padrão fire-and-forget (step 12.5b como referência)

O step 12.5b em `pipeline.ts` (linha ~663) usa o mesmo padrão:
```typescript
updateLeadMemory({...}).then(async (newSummary) => {
  if (newSummary) { ... }
}).catch((err) => console.error("Lead memory update failed:", err))
```

O step 12.5c deve seguir o mesmo padrão.

### Localização dos arquivos

| Arquivo | Ação | Referência |
|---------|------|------------|
| `packages/ai/src/memory/writer.ts` | CRIAR | Novo — padrão de `memory-extraction.ts` |
| `packages/ai/src/memory/writer.test.ts` | CRIAR | Padrão de `memory/loader.test.ts` |
| `packages/ai/src/memory/loader.ts` | MODIFICAR | Exportar `detectRoom` (~linha 126) |
| `packages/ai/src/chat/pipeline.ts` | MODIFICAR | Adicionar step 12.5c (~linha 675) |

[Source: packages/ai/src/memory/loader.ts, packages/ai/src/chat/pipeline.ts, packages/ai/src/rag/embeddings.ts]

### Testing Strategy

Usar Vitest com mocks de Supabase e Anthropic (padrão do projeto em `loader.test.ts`):
```typescript
import { describe, it, expect, vi } from 'vitest'
```

[Source: docs/framework/tech-stack.md — Vitest]

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Configuração não detectada em `core-config.yaml`.
> Quality validation seguirá revisão manual pelo @qa.

## QA Results

_A ser preenchido pelo @qa após implementação._

## File List

| Arquivo | Ação |
|---------|------|
| `packages/ai/src/memory/writer.ts` | CRIADO |
| `packages/ai/src/memory/writer.test.ts` | CRIADO |
| `packages/ai/src/memory/loader.ts` | MODIFICADO — `detectRoom` exportada (linha 126) |
| `packages/ai/src/chat/pipeline.ts` | MODIFICADO — import + step 12.5c adicionados |

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-04-29 | 1.0 | Story criada — Memory Writer para popular `lead_memories` | @sm (River) |
| 2026-04-29 | 1.1 | Validação @po: GO (9/10, Alta confiança) — Draft → Ready. SF1: marcar 1.4 como pré-req de 1.5/1.7. SF2: adicionar test case null→general. SF3: incluir mock Anthropic no test. | @po (Pax) |
| 2026-04-29 | 1.2 | Implementação completa — writer.ts + writer.test.ts + loader.ts export + pipeline.ts step 12.5c. type-check 0 erros, lint 0 erros, 215/215 testes passando (11 novos). | @dev (Dex) |
| 2026-04-29 | 1.3 | Push para remote — commit baf4c12, branch main. Story Done. | @devops (Gage) |
