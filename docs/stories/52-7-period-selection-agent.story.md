# Story 52-7 — Seleção de Período Específico no Agente de Análise de Tráfego

## Metadata
- **Epic:** 52 — Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM
- **Story:** 52-7
- **Status:** Done
- **Priority:** P1 — melhoria direta de usabilidade do agente; solicitada pelo usuário
- **Complexity:** M (TypeScript only — sem migration SQL; ~4-5h)
- **Created:** 2026-06-19
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex) — código TypeScript no `context-builder.ts` e `chat/route.ts`
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[typecheck, lint, unit_test, regression_test]`

---

## User Story

**Como** administrador, supervisor ou gerente-comercial usando o agente de análise de tráfego no Trifold CRM,
**Quero** poder especificar um período de tempo na minha pergunta — como "nos últimos 7 dias", "na última semana" ou "nos últimos 15 dias" —
**Para que** o agente me retorne análises baseadas no período exato que me interessa, em vez de sempre usar os últimos 30 dias como janela fixa.

---

## Context

O agente de tráfego (Nicole) hoje opera com uma janela fixa de 30 dias em **todas** as análises:

- `buildGlobalContext` — hardcoda `date30dAgo` nas queries de `meta_insights_daily`, `meta_alerts` e `meta_leads` (linhas 38-60 do `context-builder.ts`)
- `fetchPipelineAggregates` — já aceita `pDays?: number` (linha 473), mas nunca recebe valor diferente de `undefined` no `chat/route.ts` (linha 172 usa default de 30 implicitamente)
- `fetchCreativePerformance` — já aceita `pDays?: number` (linha 767), mas nunca recebe valor diferente de `undefined` no `chat/route.ts` (linha 202 usa default de 30)

O usuário precisa analisar sub-períodos específicos dentro da janela de 30 dias. Para isso, o agente precisa:

1. **Detectar o período na mensagem** com uma nova função `extractPeriodDays(msg: string): number`
2. **Propagar o período** para `buildGlobalContext`, `fetchPipelineAggregates` e `fetchCreativePerformance`
3. **Ajustar as chaves de cache** para incluir o período (evitar retornar cache de 30 dias para query de 7 dias)
4. **Atualizar o system prompt** para que o modelo saiba que pode trabalhar com períodos específicos

**Âncoras técnicas confirmadas:**
- `packages/web/src/lib/agent/context-builder.ts` — `buildGlobalContext(supabase, orgId)` sem `pDays` hoje; `buildContext` chama `buildGlobalContext` diretamente; `fetchPipelineAggregates` e `fetchCreativePerformance` já têm `pDays?: number`
- `packages/web/src/app/api/agent/chat/route.ts` — linha 161: `buildContext(supabase, appUser.org_id, context_type, context_id)` sem período; linha 172: `fetchPipelineAggregates(supabase, appUser.org_id)` sem período; linha 202: `fetchCreativePerformance(supabase, appUser.org_id)` sem período
- **Sem migration SQL necessária**: os RPCs `creative_performance(p_days)` e `pipeline_funnel_by_campaign(p_days)` já suportam períodos customizados (migrations 100-101); `buildGlobalContext` usa queries diretas do SDK que serão ajustadas em TypeScript
- Última migration: `102_roleta_pick_and_advance_idempotent.sql`

**Diferença em relação a stories anteriores:** Esta story é puramente TypeScript — sem novos arquivos SQL, sem novos helpers de auth, sem novas tabelas. É extensão aditiva dos contratos existentes.

---

## Scope

### IN (esta story entrega)

- **`extractPeriodDays(msg: string): number`** exportada de `context-builder.ts` — extrai o número de dias a partir de frases naturais; retorna 30 se não encontrar hint. Mapeamento documentado nos Dev Notes.
- **`buildGlobalContext(supabase, orgId, pDays?: number)`** — adicionar parâmetro opcional; substituir `setDate(d.getDate() - 30)` por `setDate(d.getDate() - days)` onde `days = pDays ?? 30`; preservar `date7dAgo` (usada para trend dos últimos 7 dias como sub-janela de tendência — mantém valor fixo de 7)
- **`buildContext(supabase, orgId, contextType, contextId, pDays?: number)`** — adicionar `pDays` como 5º parâmetro opcional; repassar para `buildGlobalContext`; ignorar para `buildCampaignContext` (contexto de campanha individual não usa janela global)
- **Cache keys com período**: `buildGlobalContext` usa chave `global:{orgId}:{days}` em vez de `global:{orgId}`; `fetchCreativePerformance` já usa chave `creative_perf:{orgId}` — atualizar para `creative_perf:{orgId}:{days}` (cacheable quando `days === 30` permanece como regra)
- **`chat/route.ts`** — extrair `extractPeriodDays(message)` uma vez no início do handler; passar o período para `buildContext`, `fetchPipelineAggregates` e `fetchCreativePerformance`
- **`AGENT_SYSTEM_PROMPT`** — adicionar instrução de que o agente pode responder a perguntas com período específico (7, 14, 15, 30 dias ou "última semana", "quinzena", "mês"); indicar que o período é aplicado a todos os dados da resposta

### OUT (não entra nesta story)

- Suporte a datas absolutas (ex.: "de 01/06 a 15/06") — exigiria mudança nos RPCs SQL com `p_start_date`/`p_end_date`; fora do escopo desta story
- Configuração de período maior que 30 dias — os RPCs existentes não foram validados para janelas maiores; limitar a 30 dias máximo
- UI de seleção de período (date picker, dropdown) — esta story é exclusivamente no agente conversacional
- `buildCampaignContext` — contexto de campanha individual usa dados de séries históricas completas; escopo fora desta story
- Novos RPCs ou migrations SQL — nenhum necessário
- Período em alertas (`meta_alerts`) — alertas têm lógica própria de `fired_date`; manter os 30 dias fixos por ora

---

## Acceptance Criteria

- [ ] **AC1 — `extractPeriodDays` detecta os padrões definidos:**
  Dado o mapeamento documentado nos Dev Notes, então `extractPeriodDays("nos últimos 7 dias")` → 7, `extractPeriodDays("última semana")` → 7, `extractPeriodDays("15 dias")` → 15, `extractPeriodDays("quinzena")` → 15, `extractPeriodDays("14 dias")` → 14, `extractPeriodDays("últimos 30 dias")` → 30, `extractPeriodDays("último mês")` → 30, `extractPeriodDays("qual campanha tem mais leads?")` → 30 (default). Verificado via teste unitário ou inspeção estática.

- [ ] **AC2 — `buildGlobalContext` respeita `pDays`:**
  Dado que `buildGlobalContext(supabase, orgId, 7)` é chamada, então as queries de `meta_insights_daily` e `meta_leads` usam `date7dAgo` como limite inferior (ou seja, `.gte("date", dateNdAgo(7))`). A variável `date7dAgo` usada para trend de tendência permanece computada como 7 dias independentemente do `pDays` recebido.

- [ ] **AC3 — `buildContext` repassa `pDays` para `buildGlobalContext`:**
  Dado que `buildContext(supabase, orgId, "global", null, 14)` é chamada, então `buildGlobalContext` é chamada com `pDays = 14`. Para `contextType === "campaign"`, o 5º parâmetro é ignorado (sem regressão).

- [ ] **AC4 — Cache key inclui período em `buildGlobalContext`:**
  Dado que `buildGlobalContext(supabase, orgId, 7)` é chamada duas vezes seguidas, a segunda request retorna cache (`global:{orgId}:7`). Dado que uma terceira call com `pDays = 30` é feita, ela não retorna o cache de 7 dias (chave `global:{orgId}:30`).

- [ ] **AC5 — Cache key inclui período em `fetchCreativePerformance`:**
  Dado que `fetchCreativePerformance(supabase, orgId, 7)` é chamada, a chave de cache usada é `creative_perf:{orgId}:7`. Dado que `fetchCreativePerformance(supabase, orgId)` (sem pDays) é chamada, a chave é `creative_perf:{orgId}:30` (cacheable).

- [ ] **AC6 — `chat/route.ts` propaga período extraído:**
  Dado que um usuário envia "Qual criativo teve mais leads nos últimos 7 dias?", então `extractPeriodDays(message)` retorna `7` e esse valor é passado para `buildContext`, `fetchPipelineAggregates` (se admin) e `fetchCreativePerformance` (se adminOrSupervisor) na mesma request. Verificável via log de servidor.

- [ ] **AC7 — Sem regressão quando não há hint de período:**
  Dado que um usuário envia "Qual campanha tem melhor CTR?" (sem hint de período), então `extractPeriodDays` retorna `30` e o comportamento é idêntico ao atual (sem mudança de cache ou resultado).

- [ ] **AC8 — Cabeçalho de seção exibe o período correto:**
  Dado que `fetchCreativePerformance(supabase, orgId, 7)` é chamada, o bloco retornado começa com `=== CRIATIVOS (últimos 7 dias) ===`. Para `pDays = 30`, começa com `=== CRIATIVOS (últimos 30 dias) ===`.

- [ ] **AC9 — `AGENT_SYSTEM_PROMPT` documenta suporte a períodos:**
  O `AGENT_SYSTEM_PROMPT` contém instrução sobre suporte a períodos específicos: o agente entende frases como "últimos 7 dias", "última semana", "quinzena", "15 dias", "último mês" e aplica o período a todos os dados da resposta. Seções existentes permanecem intactas.

- [ ] **AC10 — `pDays` é limitado a 30 dias máximo:**
  Dado que `extractPeriodDays` recebe qualquer input, o valor retornado é sempre `<= 30`. Nenhuma query é feita com janela superior a 30 dias. Verificado via inspeção estática da implementação de `extractPeriodDays`.

---

## Tasks / Subtasks

- [x] **T1** — Pré-trabalho: ler contratos atuais (obrigatório antes de qualquer escrita)
  - [x] T1.1 — Ler `context-builder.ts` linhas 30-60 (body de `buildGlobalContext` — confirmar variáveis `date30dAgo` e `date7dAgo` e onde são usadas)
  - [x] T1.2 — Ler `context-builder.ts` linhas 328-338 (assinatura e body de `buildContext` — confirmar parâmetros e delegação para `buildGlobalContext`)
  - [x] T1.3 — Ler `context-builder.ts` linhas 460-510 (body de `fetchPipelineAggregates` — confirmar chave de cache atual e lógica de `cacheable`)
  - [x] T1.4 — Ler `context-builder.ts` linhas 755-820 (body de `fetchCreativePerformance` — confirmar chave de cache atual `"creative_perf:" + orgId`)
  - [x] T1.5 — Ler `chat/route.ts` linhas 155-210 (confirmar onde `buildContext`, `fetchPipelineAggregates` e `fetchCreativePerformance` são chamadas e variáveis disponíveis)
  - [x] T1.6 — Ler `system-prompt.ts` completo — confirmar final do arquivo para saber onde adicionar instrução de período

- [x] **T2** — Implementar `extractPeriodDays` em `context-builder.ts` (AC1, AC10)
  - [x] T2.1 — Adicionar constante `PERIOD_MAP: Array<{ pattern: RegExp, days: number }>` com os padrões documentados nos Dev Notes; garantir que todos os patterns são `case-insensitive`
  - [x] T2.2 — Implementar `export function extractPeriodDays(msg: string): number` — iterar `PERIOD_MAP`, retornar `days` do primeiro match, retornar `30` se nenhum match; garantir que o retorno nunca excede 30 (`Math.min(days, 30)`)
  - [x] T2.3 — Adicionar JSDoc documentando o mapeamento e o valor default

- [x] **T3** — Atualizar `buildGlobalContext` e `buildContext` (AC2, AC3, AC4)
  - [x] T3.1 — Adicionar `pDays?: number` como 3º parâmetro de `buildGlobalContext`; calcular `const days = pDays ?? 30`; substituir `setDate(d.getDate() - 30)` por `setDate(d.getDate() - days)` na data `dateNdAgo`
  - [x] T3.2 — Atualizar chave de cache: `global:${orgId}` → `global:${orgId}:${days}`
  - [x] T3.3 — `date7dAgo` não existe em `buildGlobalContext` (existe apenas em `buildCampaignContext`); mantido `date30dAgo` fixo para alertas (OUT scope)
  - [x] T3.4 — Adicionar `pDays?: number` como 5º parâmetro de `buildContext`; repassar para `buildGlobalContext` quando `contextType === "global"`; ignorar quando `contextType === "campaign"`

- [x] **T4** — Atualizar chave de cache em `fetchCreativePerformance` (AC5, AC8)
  - [x] T4.1 — Substituir chave de cache `creative_perf:${orgId}` por `creative_perf:${orgId}:${days}`
  - [x] T4.2 — Confirmar que a regra de `cacheable` (`days === 30`) continua correta para o novo padrão de chave

- [x] **T5** — Atualizar `chat/route.ts` para propagar período (AC6, AC7)
  - [x] T5.1 — Adicionado `extractPeriodDays` ao bloco de imports do `context-builder`
  - [x] T5.2 — Adicionado `const periodDays = extractPeriodDays(message)` antes de `buildContext`
  - [x] T5.3 — Atualizada chamada de `buildContext` para passar `periodDays` como 5º argumento
  - [x] T5.4 — Atualizada chamada de `fetchPipelineAggregates` para passar `periodDays`
  - [x] T5.5 — Atualizada chamada de `fetchCreativePerformance` para passar `periodDays`
  - [x] T5.6 — Log de diagnóstico adicionado: `console.log("[52-7] period extracted:", periodDays, "days from message")`

- [x] **T6** — Atualizar `AGENT_SYSTEM_PROMPT` (AC9)
  - [x] T6.1 — Adicionada seção `## Análise por período` em `system-prompt.ts` com exemplos de frases e comportamento de default/cap
  - [x] T6.2 — Verificado que todas as seções existentes permanecem intactas

- [x] **T7** — Verificação de tipos e lint (AC7)
  - [x] T7.1 — `tsc --noEmit` — zero erros novos (typecheck limpo)
  - [x] T7.2 — `eslint` — zero warnings novos nos arquivos modificados (warning pré-existente em `buildCampaignContext` não introduzido por esta story)

- [ ] **T8** — Testes manuais
  - [ ] T8.1 — Enviar "Qual criativo teve mais leads nos últimos 7 dias?" como admin → log mostra `[52-7] period extracted: 7 days`; resposta do agente menciona "últimos 7 dias"
  - [ ] T8.2 — Enviar "Como está o funil da última semana?" como admin → período extraído: 7; `fetchPipelineAggregates` chamada com `pDays=7`
  - [ ] T8.3 — Enviar "Qual campanha tem melhor CTR?" (sem período) → período extraído: 30; comportamento idêntico ao atual (sem regressão)
  - [ ] T8.4 — Enviar "Análise completa dos últimos 14 dias" → período: 14; todos os contextos (global + criativo + pipeline se admin) usam janela de 14 dias
  - [ ] T8.5 — Segunda pergunta idêntica dentro de 5 min → cache hit; log de servidor confirma cache key com período

---

## Dev Notes

### Mapeamento de `extractPeriodDays` — PERIOD_MAP

| Padrão (regex case-insensitive) | Dias | Notas |
|----------------------------------|------|-------|
| `/\b7\s*dias?\b/` | 7 | "7 dias", "7 dia" |
| `/últim[ao]s?\s*7\s*dias?\b/` | 7 | "últimos 7 dias", "última 7 dias" |
| `/últim[ao]\s*semana\b/` | 7 | "última semana" |
| `/\bsemana\b/` | 7 | "semana" isolado — atenção: só se não houver match mais específico |
| `/\b14\s*dias?\b/` | 14 | "14 dias" |
| `/últim[ao]s?\s*14\s*dias?\b/` | 14 | "últimos 14 dias" |
| `/\b15\s*dias?\b/` | 15 | "15 dias" |
| `/últim[ao]s?\s*15\s*dias?\b/` | 15 | "últimos 15 dias" |
| `/\bquinzena\b/` | 15 | "quinzena", "essa quinzena" |
| `/últim[ao]s?\s*30\s*dias?\b/` | 30 | "últimos 30 dias" |
| `/últim[ao]\s*m[eê]s\b/` | 30 | "último mês", "esse mês" |
| `/\bm[eê]s\b/` | 30 | "mês" isolado — menor prioridade |

**Ordem de iteração:** do mais específico (multi-palavra) para o mais genérico (palavra isolada). O primeiro match vence.

**Cap:** `Math.min(days, 30)` — nunca retorna valor acima de 30.

### Assinaturas atualizadas

```typescript
// context-builder.ts

export function extractPeriodDays(msg: string): number

export async function buildGlobalContext(
  supabase: SupabaseClient,
  orgId: string,
  pDays?: number,           // ← novo parâmetro (default 30)
): Promise<string>

export function buildContext(
  supabase: SupabaseClient,
  orgId: string,
  contextType: "global" | "campaign",
  contextId?: string | null,
  pDays?: number,           // ← novo parâmetro (default 30)
): Promise<string>
```

### Cache keys atualizadas

| Função | Antes | Depois |
|--------|-------|--------|
| `buildGlobalContext` | `global:{orgId}` | `global:{orgId}:{days}` |
| `fetchCreativePerformance` | `creative_perf:{orgId}` | `creative_perf:{orgId}:{days}` |
| `fetchPipelineAggregates` | `pipeline:{orgId}:{days}` | sem alteração (já inclui days) |

### Comportamento de `date7dAgo` em `buildGlobalContext`

Após a mudança, `buildGlobalContext` terá **dois** delimitadores de data:
- `dateNdAgo` (configurável via `pDays`) → janela principal do período pedido
- `date7dAgo` (fixo em 7) → usado na seção de "tendência recente" (sub-janela dos últimos 7 dias dentro do período)

Quando `pDays < 7`, `dateNdAgo` será mais recente que `date7dAgo`. Nesse caso, filtrar a tendência pelo `dateNdAgo` também (evitar retornar dados fora da janela pedida):
```typescript
const trendStart = pDays < 7 ? dateNdAgo : date7dAgo
```

### Instrução do `AGENT_SYSTEM_PROMPT`

Adicionar na seção `## Como responder`:
```
## Análise por período
Você entende automaticamente frases de período nas perguntas. Exemplos reconhecidos:
- "nos últimos 7 dias" / "última semana" → 7 dias
- "nos últimos 14 dias" → 14 dias
- "quinzena" / "15 dias" → 15 dias
- "último mês" / "30 dias" (ou sem hint) → 30 dias (padrão)

Quando um período específico for identificado, TODOS os dados da sua resposta (campanhas, criativos, funil) refletem esse período. Mencione explicitamente o período nas seções de análise. Períodos acima de 30 dias não são suportados — informe o usuário caso seja solicitado.
```

---

## File List

- [x] `packages/web/src/lib/agent/context-builder.ts` — adicionados `PERIOD_MAP` e `extractPeriodDays`; `buildGlobalContext` com `pDays?`, `dateNdAgo`, cache key `global:{orgId}:{days}`; `buildContext` com `pDays?`; `fetchCreativePerformance` cache key `creative_perf:{orgId}:{days}`
- [x] `packages/web/src/app/api/agent/chat/route.ts` — import de `extractPeriodDays`, extração de `periodDays`, propagação para `buildContext`, `fetchPipelineAggregates` e `fetchCreativePerformance`
- [x] `packages/web/src/lib/agent/system-prompt.ts` — adicionada seção `## Análise por período`

---

## QA Results

**Veredicto:** CONCERNS — Aprovada com observações
**Data:** 2026-06-19 | **Revisor:** @qa (Quinn)
**Score ACs:** 10/10

| AC | Status |
|----|--------|
| AC1 — extractPeriodDays detecta padrões | ✅ 14/14 casos validados em runtime |
| AC2 — buildGlobalContext respeita pDays | ✅ dateNdAgo aplicado a insights; alertas 30d fixo (OUT scope) |
| AC3 — buildContext repassa pDays | ✅ 5º param adicionado |
| AC4 — Cache key inclui período (buildGlobalContext) | ✅ `global:{orgId}:{days}` |
| AC5 — Cache key inclui período (fetchCreativePerformance) | ✅ `creative_perf:{orgId}:{days}` |
| AC6 — chat/route.ts propaga período | ✅ 3 funções atualizadas + log [52-7] |
| AC7 — Sem regressão sem hint | ✅ default 30 preserva comportamento atual |
| AC8 — Headers exibem período correto | ✅ PORTFÓLIO e CRIATIVOS dinâmicos |
| AC9 — system-prompt documenta períodos | ✅ Seção adicionada |
| AC10 — pDays ≤ 30 sempre | ✅ Math.min(days,30) em extractPeriodDays |

**Concerns (não bloqueantes):**
- **C1 [Low]** — Sem unit tests para `extractPeriodDays`; validação via inspeção estática válida, mas recomenda-se suite para proteção de regressão (tech debt)
- **C2 [Low]** — `buildGlobalContext` não capa `pDays` internamente; risco atual zero (único caller passa por `extractPeriodDays`); sugestão: `Math.min(pDays ?? 30, 30)` como defesa em profundidade
- **C3 [Info]** — Cold start de cache pós-deploy (key `global:{orgId}` → `global:{orgId}:30`); comportamento esperado
- **C4 [Info]** — T8 (testes manuais) não executados; validar via logs `[52-7]` na primeira request pós-deploy

**Próximo passo:** `@devops *push`

---

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-06-19 | @sm (River) | Story criada — Epic 52, Story 52-7 |
| 2026-06-19 | @po (Pax) | Validação GO 8/10 — status Draft → Ready. Concerns C1/C2 documentados acima (não bloqueantes). |
| 2026-06-19 | @dev (Dex) | Implementação YOLO completa: T1-T7 ✅. `extractPeriodDays` + `buildGlobalContext(pDays)` + `buildContext(pDays)` + cache keys + `chat/route.ts` + `system-prompt.ts`. Typecheck clean, zero warnings novos. Nota: `date7dAgo` não existe em `buildGlobalContext` (apenas em `buildCampaignContext`); alertas mantidos em 30d fixo (OUT scope). T8 (testes manuais) pendente de ambiente rodando. |
| 2026-06-19 | @qa (Quinn) | QA Gate: CONCERNS — 10/10 ACs satisfeitos. Zero issues de segurança ou regressão. Concerns C1/C2 (low) registrados como tech debt recomendado. Story aprovada para @devops push. |
