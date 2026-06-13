# Story 53-1 — Nicole: Pipeline de Prompts com Fallback do Banco

## Metadata
- **Epic:** 53 — Nicole Prompts Configuráveis via Admin
- **Story:** 53-1
- **Status:** Done (QA PASS — aguardando push via @devops)
- **Priority:** P0 — sem isso, nenhuma edição no painel admin tem efeito real nas respostas
- **Complexity:** M (4-6h)
- **Created:** 2026-06-13
- **Author:** @sm (River)

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[vitest, typecheck, lint, pipeline.test.ts, prompts/index.test.ts]`
- **Autossuficiente:** sim — pure refactor TypeScript, sem migration, sem UI
- **Depende de:** nenhuma (pode iniciar imediatamente)

---

## User Story

**Como** sistema de pipeline da Nicole,
**Quero** carregar os prompts e mensagens configuráveis do banco de dados (tabelas `agent_prompts` e `agent_config`) ao construir o system prompt e ao enviar mensagens de off-hours,
**Para que** qualquer edição feita pelo admin no painel tenha efeito real nas respostas da Nicole, sem necessidade de redeploy.

---

## Context

### Problema atual (confirmado na auditoria)

O pipeline da Nicole usa prompts 100% hard-coded:

**Em `packages/ai/src/prompts/index.ts`:**
- `buildStaticSystemContent()` monta o bloco estático com imports diretos de arquivos `.ts`
  (`PERSONALITY_PROMPT`, `GUARDRAILS_PROMPT`, `QUALIFICATION_PROMPT`,
  `PROPERTY_PRESENTATION_PROMPT`, `VISIT_SCHEDULING_PROMPT`)
- `buildSystemPrompt(propertyContext?, options?)` — sem parâmetro para overrides do banco

**Em `packages/ai/src/chat/pipeline.ts`:**
- Linha 31: `import { buildSystemPrompt as buildPromptFromCode } from "../prompts"`
- Linha 909-941: `loadAgentConfig()` carrega a tabela `agent_config` mas **não seleciona**
  `greeting_message` nem `out_of_hours_message`; a interface `AgentConfig` (linha 108-115)
  também não inclui esses campos
- Linha 990-991: função **privada** `buildSystemPrompt(_config, ragContext, state, emit)` —
  o parâmetro `_config` tem o underscore prefixo = **completamente ignorado**; chama
  `buildPromptFromCode(ragContext, options)` sem passar overrides
- Linha 226-228: mensagem de off-hours é **string hard-coded inline**
  (`"Oi! Obrigada pelo contato. No momento estou fora do horario de atendimento. Vou guardar sua mensagem e retorno assim que possivel. Ate breve!"`)
  — ignora `agentConfig.out_of_hours_message` mesmo que esteja preenchido no banco
- A tabela `agent_prompts` **não é consultada em nenhum ponto do pipeline**

### Decisões de produto já tomadas (não reabrir)
1. **Estratégia banco-com-fallback**: se o campo no banco está preenchido (não null, não string vazia), usa o banco. Se vazio, usa o hard-coded do código `.ts` como default seguro.
2. **Guardrails de segurança nunca somem**: o fallback garantido pelo código impede que um admin esquecendo de preencher quebre o comportamento da Nicole.
3. **`handoff-summary` fora de escopo nesta story**: `HANDOFF_SUMMARY_PROMPT` é exportado mas `generateHandoffSummary()` em `flows/handoff.ts` gera o resumo em código puro — sem usar o prompt como template. Integrar o slug `handoff-summary` ao runtime é uma story separada.
4. **`greeting_message`** deve ser adicionado ao `AgentConfig` e selecionado no query, mas seu ponto de uso (ex: mensagem de boas-vindas no primeiro contato) está fora de escopo desta story — apenas torná-lo disponível.

### Impacto no prompt caching (Story 21.3)

`buildSystemPrompt()` já retorna `TextBlockParam[]` com `cache_control: { type: "ephemeral" }` no bloco estático. Com overrides do banco:
- O conteúdo do bloco muda quando o admin edita um prompt
- O Anthropic invalida o cache automaticamente (keyed pelo texto real)
- Nova cache entry é criada na próxima chamada após a edição
- TTL padrão: 5min (ephemeral) — a cache velha expira por si só
- **Não há ação adicional necessária**: o cache_control permanece como está

---

## Acceptance Criteria

1. O tipo `DbPromptOverrides` é exportado de `packages/ai/src/prompts/index.ts` e mapeia cada slug de `agent_prompts` para `string | null | undefined` (os 5 slugs que entram em `buildStaticSystemContent`: `system-personality`, `guardrails`, `qualification-flow`, `property-presentation`, `visit-scheduling`)

2. `buildStaticSystemContent(overrides?: DbPromptOverrides)` usa `overrides?.[slug] || STATIC_CONSTANT` para cada seção — quando o override é uma string não-vazia, usa o banco; quando é null/undefined/empty, usa a constante do arquivo `.ts`

3. A assinatura pública `buildSystemPrompt(propertyContext?, options?, overrides?: DbPromptOverrides)` recebe os overrides e os passa para `buildStaticSystemContent` — a assinatura é **backward-compatible**: chamadas sem o terceiro parâmetro continuam funcionando identicamente

4. `buildSystemPromptText(propertyContext?)` **não recebe** overrides — ela é usada para seed/display (código sempre usa hard-coded), sem alteração de assinatura

5. A interface `AgentConfig` em `pipeline.ts` inclui os campos: `greeting_message?: string | null`, `out_of_hours_message?: string | null`, `prompt_overrides?: DbPromptOverrides`

6. `loadAgentConfig()` em `pipeline.ts` seleciona `greeting_message, out_of_hours_message` da tabela `agent_config` além dos campos atuais; também realiza `SELECT slug, content FROM agent_prompts WHERE org_id = $orgId AND is_active = true` (segunda query na mesma função) e monta o `prompt_overrides` como `Record<slug, content>` — somente slugs com `content` não-vazio são incluídos

7. A função privada `buildSystemPrompt` em `pipeline.ts` passa `_config.prompt_overrides` para `buildPromptFromCode` como terceiro argumento (renomeia `_config` para `config` já que não é mais ignorado)

8. A mensagem de off-hours em `pipeline.ts` (linha ~226-228) usa `agentConfig.out_of_hours_message` quando esse campo é não-vazio, com fallback para `OFF_HOURS_PROMPT` importado de `../prompts/off-hours` (mais rico que a string hard-coded atual)

9. Todos os testes existentes em `packages/ai/src/prompts/index.test.ts` **passam sem modificação** (zero regression)

10. Novos testes em `packages/ai/src/prompts/index.test.ts` cobrem:
    - `buildSystemPrompt` com override não-vazio para `system-personality` retorna o texto do override no bloco estático, não o `PERSONALITY_PROMPT` original
    - `buildSystemPrompt` com override `null` ou `""` para `system-personality` usa `PERSONALITY_PROMPT` (fallback)
    - `buildSystemPrompt` com overrides parciais (apenas alguns slugs) aplica override onde existe e fallback onde não existe

11. Novo teste em `packages/ai/src/chat/pipeline.test.ts` cobre o comportamento de off-hours com `out_of_hours_message` preenchido no `agentConfig`

---

## Tasks / Subtasks

- [x] **Task 1 — Tipos e interface pública em `packages/ai/src/prompts/index.ts`** (AC: 1, 2, 3, 4)
  - [x] Definir e exportar `DbPromptOverrides` type (5 slugs: `system-personality`, `guardrails`, `qualification-flow`, `property-presentation`, `visit-scheduling`)
  - [x] Refatorar `buildStaticSystemContent(overrides?: DbPromptOverrides)` — adicionar parâmetro opcional; substituir cada import estático por `overrides?.[slug] || STATIC_CONSTANT`
  - [x] Atualizar assinatura de `buildSystemPrompt(propertyContext?, options?, overrides?: DbPromptOverrides)` — adicionar terceiro parâmetro; passar para `buildStaticSystemContent`
  - [x] Confirmar que `buildSystemPromptText` NÃO recebe overrides (sem alteração de assinatura)

- [x] **Task 2 — Interface e query em `packages/ai/src/chat/pipeline.ts`** (AC: 5, 6)
  - [x] Adicionar `greeting_message`, `out_of_hours_message`, `prompt_overrides` à interface `AgentConfig` (linha 108)
  - [x] Atualizar `loadAgentConfig()` — adicionar `greeting_message, out_of_hours_message` ao `.select()` da tabela `agent_config`
  - [x] Adicionar segunda query dentro de `loadAgentConfig()`: `supabase.from("agent_prompts").select("slug, content").eq("org_id", orgId).eq("is_active", true)` — retorna array, portanto NÃO usar `.single()`/`.maybeSingle()`
  - [x] Mapear resultado de `agent_prompts` para `prompt_overrides`: filtrar somente slugs com `content` não-vazio, retornar `Record<slug, content>`
  - [x] No fallback (`if (error || !data)`) do `agent_config`, incluir defaults para os novos campos (`greeting_message: null, out_of_hours_message: null, prompt_overrides: {}`)

- [x] **Task 3 — Renomear `_config` e passar overrides na função privada** (AC: 7)
  - [x] Função privada `buildSystemPrompt(_config, ragContext, state, emit)` na linha 990: renomear `_config` para `config`
  - [x] Passar `config.prompt_overrides` como terceiro argumento para `buildPromptFromCode`

- [x] **Task 4 — Corrigir mensagem de off-hours** (AC: 8)
  - [x] Adicionar `OFF_HOURS_PROMPT` ao import existente de `"../prompts"` no topo de `pipeline.ts` (já re-exportado em `prompts/index.ts` linha 7) — ex: `import { buildSystemPrompt as buildPromptFromCode, OFF_HOURS_PROMPT } from "../prompts"`
  - [x] Substituir o bloco hard-coded na linha ~226-228 por: `const offHoursResponse = agentConfig.out_of_hours_message?.trim() || OFF_HOURS_PROMPT` (extraído no helper puro `resolveOffHoursResponse` para testabilidade — mesma lógica)
  - [x] Preservar o resto do bloco (`saveMessages`, `updateConversationTimestamp`, return) inalterado

- [x] **Task 5 — Testes novos e verificação de regressão** (AC: 9, 10, 11)
  - [x] Rodar testes — confirmar que os testes existentes de `index.test.ts` passam (zero regressão)
  - [x] Adicionar em `packages/ai/src/prompts/index.test.ts`: bloco `describe("buildSystemPrompt — DB overrides (Story 53-1)")` com os novos casos de teste (AC 10)
  - [x] Adicionar teste de off-hours em `packages/ai/src/chat/pipeline.test.ts` (AC 11)
  - [x] Rodar `pnpm vitest run packages/ai/src` novamente — todos os testes passam (252/252)
  - [x] Rodar `pnpm --filter @trifold/ai type-check` — zero erros de tipo
  - [x] Rodar `pnpm --filter @trifold/ai lint` (= `tsc --noEmit`) — zero erros

---

## Dev Notes

### Arquivos-alvo

| Arquivo | Ação | Risco |
|---------|------|-------|
| `packages/ai/src/prompts/index.ts` | Modificar (tipos + assinaturas) | Médio — quebra testes se assinatura mudar incorretamente |
| `packages/ai/src/chat/pipeline.ts` | Modificar (interface + loadAgentConfig + buildSystemPrompt privado + off-hours) | Alto — mexe no runtime de produção |
| `packages/ai/src/prompts/index.test.ts` | Adicionar testes | Baixo |
| `packages/ai/src/chat/pipeline.test.ts` | Adicionar teste | Baixo |

### Estrutura atual de `buildStaticSystemContent()` (index.ts:57-83)

```typescript
function buildStaticSystemContent(): string {
  const sections = [
    `IDIOMA: ...`,                    // fixo — NÃO é override (regra de linguagem, não editável)
    `ENDERECO DA SEDE...`,            // fixo — NÃO é override (endereço físico)
    PERSONALITY_PROMPT,               // → slug: "system-personality"
    GUARDRAILS_PROMPT,                // → slug: "guardrails"
    QUALIFICATION_PROMPT,             // → slug: "qualification-flow"
    PROPERTY_PRESENTATION_PROMPT,     // → slug: "property-presentation"
    VISIT_SCHEDULING_PROMPT,          // → slug: "visit-scheduling"
    `LEMBRETE FINAL — REGRAS ABSOLUTAS:...`, // fixo — NÃO é override (segurança)
  ]
  return sections.join("\n\n---\n\n")
}
```

**Regra de ouro:** IDIOMA, ENDEREÇO DA SEDE e LEMBRETE FINAL são seções de segurança fixas. NUNCA substituí-las por overrides do banco. Somente as 5 constantes de prompt (PERSONALITY, GUARDRAILS, QUALIFICATION, PROPERTY_PRESENTATION, VISIT_SCHEDULING) têm override.

### Assinatura refatorada alvo

```typescript
// Tipo exportado de packages/ai/src/prompts/index.ts
export type DbPromptOverrides = {
  'system-personality'?: string | null
  'guardrails'?: string | null
  'qualification-flow'?: string | null
  'property-presentation'?: string | null
  'visit-scheduling'?: string | null
}

// buildStaticSystemContent — interno, não exportado
function buildStaticSystemContent(overrides?: DbPromptOverrides): string {
  const sections = [
    `IDIOMA: ...`,  // fixo
    `ENDERECO DA SEDE...`,  // fixo
    overrides?.['system-personality'] || PERSONALITY_PROMPT,
    overrides?.['guardrails'] || GUARDRAILS_PROMPT,
    overrides?.['qualification-flow'] || QUALIFICATION_PROMPT,
    overrides?.['property-presentation'] || PROPERTY_PRESENTATION_PROMPT,
    overrides?.['visit-scheduling'] || VISIT_SCHEDULING_PROMPT,
    `LEMBRETE FINAL...`,  // fixo
  ]
  return sections.join("\n\n---\n\n")
}

// buildSystemPrompt — público, exportado, backward-compatible
export function buildSystemPrompt(
  propertyContext?: string,
  options?: { onWarning?: (...) => void },
  overrides?: DbPromptOverrides  // NOVO parâmetro — opcional
): Anthropic.Messages.TextBlockParam[] {
  const staticContent = buildStaticSystemContent(overrides)
  // ... resto do corpo inalterado
}
```

### Interface AgentConfig alvo (pipeline.ts:108)

```typescript
interface AgentConfig {
  personality_prompt: string | null   // já existe
  guardrails: string[]               // já existe
  model_primary: string              // já existe
  temperature: number                // já existe
  max_tokens: number                 // já existe
  business_hours?: Record<string, { start: string; end: string }>  // já existe
  // NOVOS:
  greeting_message?: string | null   // selecionado do banco, disponível mas sem ponto de uso nesta story
  out_of_hours_message?: string | null  // usado no bloco de off-hours (linha ~226)
  prompt_overrides?: DbPromptOverrides  // de agent_prompts
}
```

### Query de `loadAgentConfig()` alvo (pipeline.ts:909)

```typescript
// Query 1: agent_config (campos expandidos)
const { data, error } = await supabase
  .from("agent_config")
  .select("personality_prompt, guardrails, model_primary, temperature, max_tokens, business_hours, greeting_message, out_of_hours_message")
  .eq("org_id", orgId)
  .eq("is_active", true)
  .single()

// Query 2: agent_prompts (overrides por slug)
const { data: promptRows } = await supabase
  .from("agent_prompts")
  .select("slug, content")
  .eq("org_id", orgId)
  .eq("is_active", true)

const prompt_overrides: DbPromptOverrides = {}
for (const row of promptRows ?? []) {
  if (row.content?.trim()) {
    prompt_overrides[row.slug as keyof DbPromptOverrides] = row.content
  }
}
```

**CRÍTICO:** Usar `.maybeSingle()` em lugar de `.single()` quando uma query pode retornar 0 rows. A query de `agent_prompts` retorna array (sem `.maybeSingle()`). A query de `agent_config` usa `.single()` pois já é o padrão atual e a org deve ter exatamente 1 registro ativo.

### Bloco de off-hours alvo (pipeline.ts:~221-238)

```typescript
// ANTES (hard-coded):
const offHoursResponse =
  "Oi! Obrigada pelo contato. No momento estou fora do horario de atendimento. " +
  "Vou guardar sua mensagem e retorno assim que possivel. Ate breve!"

// DEPOIS (banco com fallback):
const offHoursResponse =
  agentConfig.out_of_hours_message?.trim() ||
  OFF_HOURS_PROMPT  // importado de "../prompts/off-hours"
```

### `buildSystemPromptText` — inalterado

`buildSystemPromptText(propertyContext?: string)` chama `buildSystemPrompt()` sem overrides. Permanece assim. É usada por `scripts/seed-prompts.ts` para persistir o conteúdo do código como estado inicial — essa função deve SEMPRE refletir os defaults do código, nunca os valores do banco.

### Importações TypeScript necessárias em `pipeline.ts`

```typescript
// Adicionar import:
import type { DbPromptOverrides } from "../prompts"
import { buildSystemPrompt as buildPromptFromCode, OFF_HOURS_PROMPT } from "../prompts"
// OFF_HOURS_PROMPT precisa ser exportado de packages/ai/src/prompts/index.ts
// (atualmente é re-exportado como: export { OFF_HOURS_PROMPT } from "./off-hours" — já está lá na linha 7)
```

Verificar no topo de `packages/ai/src/prompts/index.ts`:
- Linha 7: `export { OFF_HOURS_PROMPT } from "./off-hours"` — já existe, nada a fazer

### Pipeline em produção (sem staging)

**Este projeto tem apenas 1 Supabase (produção).** Após o merge, o pipeline passa a usar os prompts do banco imediatamente para todas as conversas. A estratégia de fallback garante que:
- Organizações sem registros em `agent_prompts` continuam usando o hard-coded (nenhuma mudança perceptível)
- Apenas quando o admin editar um prompt via UI (Story 53.3) o comportamento mudará

### Prompt caching — nenhuma ação necessária

A `cache_control: { type: "ephemeral" }` já está no bloco estático. Quando o conteúdo muda (admin edita um prompt), o Anthropic cria um novo cache entry automaticamente. Não há lógica de invalidação manual necessária. A Story 21.3 documentou isso corretamente.

### Teste de off-hours em `pipeline.test.ts`

O pipeline.test.ts atual testa o `processMessageWithMetadata`. Para o teste de off-hours, mockar `loadAgentConfig` retornando `{ out_of_hours_message: "Mensagem customizada" }` e verificar que o response é a string customizada (não a hard-coded nem o `OFF_HOURS_PROMPT`).

---

## Testing

**Framework:** Vitest (não Jest)
**Localização de testes:** `packages/ai/src/prompts/index.test.ts` e `packages/ai/src/chat/pipeline.test.ts`

**Comandos:**
```bash
pnpm --filter @trifold/ai test           # rodar testes da unit
pnpm --filter @trifold/ai typecheck      # checar tipos
pnpm lint                                 # linting
```

**Cenários obrigatórios novos:**

| Cenário | Arquivo | O que validar |
|---------|---------|---------------|
| Override não-vazio em `system-personality` | index.test.ts | Bloco estático contém o texto do override, não o `PERSONALITY_PROMPT` original |
| Override `null` em `system-personality` | index.test.ts | Bloco estático contém o `PERSONALITY_PROMPT` (fallback correto) |
| Override `""` (string vazia) em `guardrails` | index.test.ts | Bloco estático contém o `GUARDRAILS_PROMPT` (empty string = fallback) |
| Off-hours com `out_of_hours_message` preenchido | pipeline.test.ts | Response é o valor do banco, não o hard-coded |
| Off-hours com `out_of_hours_message` null | pipeline.test.ts | Response é `OFF_HOURS_PROMPT` (não a string inline antiga) |
| Regressão: `buildSystemPrompt()` sem overrides | index.test.ts | Todos os 9 testes existentes continuam passando |

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não está configurado em `core-config.yaml`.
> Validação de qualidade via processo de revisão manual com @architect.

---

## File List

**Arquivos a modificar:**
- `packages/ai/src/prompts/index.ts` — adicionar `DbPromptOverrides` type, refatorar `buildStaticSystemContent` e `buildSystemPrompt`
- `packages/ai/src/chat/pipeline.ts` — estender `AgentConfig` interface, `loadAgentConfig`, função privada `buildSystemPrompt`, bloco off-hours

**Arquivos a modificar (testes):**
- `packages/ai/src/prompts/index.test.ts` — adicionar describe block com novos casos
- `packages/ai/src/chat/pipeline.test.ts` — adicionar teste de off-hours

**Arquivos a NÃO modificar:**
- `scripts/seed-prompts.ts` — sem alteração
- `supabase/migrations/*` — sem migration (tabelas já existem)
- Qualquer arquivo de UI

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M context) — @dev (Dex)

### Completion Notes
- **AC1-4 (index.ts):** `DbPromptOverrides` type exportado (5 slugs editáveis). `buildStaticSystemContent(overrides?)` aplica `overrides?.[slug] || CONSTANT` nas 5 seções editáveis; IDIOMA, ENDEREÇO DA SEDE e LEMBRETE FINAL permanecem literais fixos (não-sobrescrevíveis). `buildSystemPrompt(propertyContext?, options?, overrides?)` é backward-compatible (3º param opcional). `buildSystemPromptText` inalterado.
- **AC5-7 (pipeline.ts):** `AgentConfig` estendido com `greeting_message`, `out_of_hours_message`, `prompt_overrides`. `loadAgentConfig()` expandiu o `.select()` do `agent_config` e adicionou 2ª query (array) em `agent_prompts`, montando `prompt_overrides` apenas com slugs de conteúdo não-vazio (filtro `content?.trim()`); fallback (`error || !data`) inclui defaults dos novos campos. Função privada `buildSystemPrompt`: `_config` → `config`, passa `config.prompt_overrides` como 3º arg para `buildPromptFromCode`.
- **AC8 (off-hours):** lógica extraída no helper puro exportado `resolveOffHoursResponse(agentConfig)` = `out_of_hours_message?.trim() || OFF_HOURS_PROMPT`. Decisão de implementação: extrair para helper (vs. inline literal sugerido na story) torna o comportamento testável sem mockar todo o `processMessageWithMetadata` (supabase/anthropic) e segue a convenção do projeto de manter lógica testada em helpers puros. Funcionalmente idêntico ao AC8.
- **Mudança de comportamento intencional (AC8):** a mensagem de off-hours muda da string inline curta antiga para o `OFF_HOURS_PROMPT` (mais rico) mesmo sem edição no banco — exatamente o que o AC8 pede. Demais comportamentos têm fallback que garante zero mudança até o admin editar o banco (overrides `{}` → constantes; `out_of_hours_message` null → `OFF_HOURS_PROMPT`).
- **AC9-11 (testes):** 9 testes existentes de `index.test.ts` passam sem modificação. Adicionados 6 testes de DB overrides em `index.test.ts` (override não-vazio, fallback null, fallback string vazia, overrides parciais, seções de segurança não-sobrescrevíveis, backward-compat) e 5 testes de `resolveOffHoursResponse` em `pipeline.test.ts` (banco preenchido, null, undefined, whitespace, trim).

### Validation Results
- `pnpm vitest run packages/ai/src`: **252/252 testes passam** (14 arquivos). Os 2 arquivos-alvo: **43/43**.
- `pnpm --filter @trifold/ai type-check` (`tsc --noEmit`): **0 erros**.
- `pnpm --filter @trifold/ai lint` (`tsc --noEmit`): **0 erros**.
- `pnpm type-check` (monorepo): `@trifold/ai` limpo. Falhas pré-existentes em `@trifold/web` (`react-email-editor` não instalado + `campaign-visual-editor` ausente em UI de email-templates/campaigns) são baseline, fora do escopo desta story e não relacionadas às mudanças.
- CodeRabbit: desabilitado no projeto (`coderabbit_integration.enabled` não configurado) — revisão de qualidade via @architect (quality gate).

### File List
- `packages/ai/src/prompts/index.ts` — modificado (tipo `DbPromptOverrides`, `buildStaticSystemContent`, `buildSystemPrompt`)
- `packages/ai/src/chat/pipeline.ts` — modificado (`AgentConfig`, `loadAgentConfig`, helper `resolveOffHoursResponse`, bloco off-hours, função privada `buildSystemPrompt`)
- `packages/ai/src/prompts/index.test.ts` — modificado (6 novos testes de DB overrides)
- `packages/ai/src/chat/pipeline.test.ts` — modificado (5 novos testes de off-hours)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-13 | 1.0 | Draft inicial criado com contexto da auditoria | @sm (River) |
| 2026-06-13 | 1.1 | Validação PO (GO 9/10). Cleanup Task 2 (query array), Task 4 (import OFF_HOURS_PROMPT de "../prompts"), AC9 (todos os testes). Status Draft → Ready | @po (Pax) |
| 2026-06-13 | 1.2 | Implementação completa (Tasks 1-5). banco-com-fallback em `buildStaticSystemContent`/`buildSystemPrompt`; `loadAgentConfig` lê `agent_prompts`; off-hours via `resolveOffHoursResponse`. 11 testes novos, 252/252 passam, typecheck/lint limpos. Status Ready → Ready for Review | @dev (Dex) |
| 2026-06-13 | 1.3 | Quality gate @qa: PASS. 11/11 AC rastreados, 252/252 testes (verificado independentemente), typecheck 0 erros. Piso de segurança imutável confirmado. Status Ready for Review → Done | @qa (Quinn) |

---

## QA Results

### Review Date: 2026-06-13

### Reviewed By: Quinn (Test Architect / Guardian)

### Verificação Independente (não confiei só no relatório do @dev)
- `pnpm vitest run packages/ai/src` → **252/252 passam** (14 arquivos) ✅
- `pnpm --filter @trifold/ai type-check` (`tsc --noEmit`) → **0 erros** (exit 0) ✅

### Requirements Traceability (AC por AC)

| AC | Onde está | Status |
|----|-----------|--------|
| AC1 — `DbPromptOverrides` exportado (5 slugs) | `index.ts:41-47` | ✅ |
| AC2 — `buildStaticSystemContent(overrides?)` com `overrides?.[slug] \|\| CONST` | `index.ts:84-88` | ✅ |
| AC3 — `buildSystemPrompt(.., .., overrides?)` backward-compatible | `index.ts:128-133` + teste backward-compat | ✅ |
| AC4 — `buildSystemPromptText` sem overrides (inalterado) | `index.ts:176-179` | ✅ |
| AC5 — `AgentConfig` + 3 campos novos | `pipeline.ts:117-119` | ✅ |
| AC6 — `loadAgentConfig` seleciona campos novos + 2ª query (array, só não-vazios) | `pipeline.ts:931-968` | ✅ |
| AC7 — privada `buildSystemPrompt`: `_config`→`config`, passa `prompt_overrides` 3º arg | `pipeline.ts:1031,1053` | ✅ |
| AC8 — off-hours usa `out_of_hours_message?.trim() \|\| OFF_HOURS_PROMPT` | `resolveOffHoursResponse` + uso `pipeline.ts:246` | ✅ |
| AC9 — testes existentes passam sem modificação | bloco Story 21.3 intacto, 252/252 | ✅ |
| AC10 — novos testes index.test.ts (override/null/empty/parcial) | `index.test.ts:120-193` (6 testes) | ✅ |
| AC11 — teste off-hours pipeline.test.ts | `pipeline.test.ts:92-112` (5 testes) | ✅ |

**11/11 AC implementados e verificados contra o código real.**

### Security (foco da review) — PASS
- O tipo `DbPromptOverrides` expõe **apenas os 5 slugs editáveis**. IDIOMA, ENDEREÇO DA SEDE e LEMBRETE FINAL são literais hard-coded em `buildStaticSystemContent` e **não são indexados por chave de override**.
- **Slug malicioso não burla guardrails:** um row em `agent_prompts` com `slug="lembrete-final"`/`"idioma"`/qualquer arbitrário é armazenado em `prompt_overrides`, mas `buildStaticSystemContent` só **lê** as 5 chaves conhecidas → o conteúdo malicioso **nunca é renderizado** nas seções de segurança. Verificado por leitura de código (não há lookup dinâmico das chaves fixas).
- **Defesa em profundidade:** mesmo que um admin substitua `system-personality`/`guardrails`, o LEMBRETE FINAL (regras absolutas) é reafirmado **por último** no prompt (last-instruction-wins).
- Read path **org-scoped**: `.eq("org_id", orgId).eq("is_active", true)` — sem vazamento cross-org.
- A autorização de **escrita** em `agent_prompts` é escopo da Story 53-2 (read path desta story é seguro).

### Reliability / Produção — PASS
- **Banco vazio / org sem `agent_prompts`:** `promptRows ?? []` → loop vazio → `prompt_overrides = {}` → todas as constantes hard-coded. **Comportamento idêntico ao legado.**
- **Falha na 2ª query (`agent_prompts`):** `const { data: promptRows }` (sem desestruturar erro) → `promptRows` null → `{}` → fallback hard-coded. **Degradação graciosa confirmada** — não derruba o pipeline.
- **Falha no `agent_config`:** retorno antecipado com defaults (incl. `prompt_overrides: {}`) — inalterado.
- **Única mudança intencional (AC8):** off-hours passa a usar `OFF_HOURS_PROMPT` (mais rico) quando o banco está vazio, em vez da string inline antiga.

### Test Architecture — PASS
- Edge cases cobertos: `null` (personality), `""` (guardrails), whitespace `"   "` (off-hours), overrides parciais, backward-compat, seções de segurança não-sobrescrevíveis.
- Helper puro `resolveOffHoursResponse` exportado para teste sem mockar todo o pipeline — boa decisão de testabilidade (desvio documentado do AC8 inline, funcionalmente idêntico).

### Observações não-bloqueantes (low / informational)
- **REL-001 (low):** `OFF_HOURS_PROMPT` contém emojis (😊 📅 💛), contrariando a regra "ZERO emojis" do LEMBRETE FINAL. É intencional pelo AC8 (mensagem canned, não output do LLM), porém é mudança **visível** em produção — a auto-resposta de off-hours agora tem emojis. Confirmar com produto que é desejado.
- **SEC-001 (low):** conteúdo de override não tem sanitização nem limite de tamanho. Mitigado pelo LEMBRETE FINAL; authz + validação de tamanho devem ser tratadas no write-side (Story 53-2).
- **TEST-001 (low):** edge case de slug inexistente / override gigante sem teste unitário (analisados como seguros). Teste opcional.
- **PERF-001 (low):** 2ª query sequencial à do `agent_config`; poderiam ser paralelizadas (micro-otimização opcional).

### Gate Status

Gate: PASS → docs/qa/gates/53.1-nicole-pipeline-prompts-fallback.yml

### Recommended Status

✅ **Done** — pronto para `@devops *push`. Nenhuma das observações é bloqueante; SEC-001 e REL-001 devem ser acompanhadas (53-2 e validação de produto, respectivamente).
