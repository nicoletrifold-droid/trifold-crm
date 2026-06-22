# Story 52-8 — Seleção de Intervalo de Datas Específico no Agente

## Metadata
- **Epic:** 52 — Agente de Tráfego com Acesso Read-Only ao Pipeline do CRM
- **Story:** 52-8
- **Status:** Ready for Review
- **Priority:** P2 — melhoria de usabilidade; complementa Story 52-7
- **Complexity:** L (1 migration SQL + TypeScript + UI React — ~8-10h)
- **Created:** 2026-06-19
- **Author:** @sm (River)
- **Revisado por:** @pm (Morgan) — 2026-06-19

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[typecheck, lint, regression_test]`

---

## User Story

**Como** administrador, supervisor ou gerente-comercial usando o agente de análise de tráfego no Trifold CRM,
**Quero** poder especificar um intervalo de datas exato na minha pergunta — como "de 1 a 15 de junho" ou "entre 01/06 e 15/06" —
**Para que** o agente me retorne análises com boundaries precisas de início e fim, não apenas uma janela relativa contada a partir de hoje.

---

## Context

A Story 52-7 adicionou `extractPeriodDays(msg): number` que suporta períodos **relativos** (últimos N dias a partir de hoje). Esta story adiciona suporte a intervalos de datas **absolutos**.

### Limitação atual

`extractPeriodDays("de 1 a 15 de junho")` retorna `30` (default) porque não reconhece o padrão. O resultado é uma análise dos últimos 30 dias, ignorando o intervalo pedido.

### Por que exige migration SQL

Os RPCs existentes aceitam apenas `p_days INTEGER`:
- `public.pipeline_funnel_by_campaign(p_days INTEGER DEFAULT 30)` — migration 096
- `public.creative_performance(p_days INTEGER DEFAULT 30)` — migration 101

`CURRENT_DATE - p_days` computa apenas a data de início (relativa a hoje) sem data de fim configurável. Para intervalos fechados (ex.: 01/06 → 15/06), os RPCs precisam de `p_start_date DATE, p_end_date DATE`.

`buildGlobalContext` usa queries diretas do SDK (`meta_insights_daily`, `meta_leads`) — essas serão atualizadas diretamente em TypeScript com `.gte("date", startDate).lte("date", endDate)`.

### Última migration aplicada
`103_messages_wamid_unique.sql` → próxima: `104_...`

---

## Scope

### IN (esta story entrega)

- **`extractDateWindow(msg: string): DateWindow`** exportada de `context-builder.ts` — detecta intervalos absolutos E períodos relativos; retorna sempre `{ startDate: string, endDate: string }` em ISO 8601 (`YYYY-MM-DD`). Substitui `extractPeriodDays` nas chamadas de `chat/route.ts` (sem remover `extractPeriodDays` — mantida para compatibilidade)
- **Tipo `DateWindow`**: `{ startDate: string; endDate: string }` exportado de `context-builder.ts`
- **Migration `104_agent_daterange_rpcs.sql`**: adiciona overload `p_start_date DATE, p_end_date DATE` às funções `pipeline_funnel_by_campaign` e `creative_performance` via `CREATE OR REPLACE`; mantém assinatura `p_days` existente como segunda função ou default calculado internamente
- **`buildGlobalContext(supabase, orgId, window?: DateWindow)`**: substitui `pDays?: number` por `window?: DateWindow`; usa `.gte("date", startDate).lte("date", endDate)` nas queries de `meta_insights_daily` e `meta_leads`
- **`fetchPipelineAggregates(supabase, orgId, window?: DateWindow)`**: passa `p_start_date`/`p_end_date` para o RPC
- **`fetchCreativePerformance(supabase, orgId, window?: DateWindow)`**: passa `p_start_date`/`p_end_date` para o RPC
- **`buildContext(supabase, orgId, contextType, contextId?, window?: DateWindow)`**: substitui `pDays?` por `window?`
- **Cache keys**: `global:{orgId}:{startDate}:{endDate}`, `creative_perf:{orgId}:{startDate}:{endDate}`
- **`chat/route.ts`**: substituir `extractPeriodDays(message)` por `extractDateWindow(message)`; atualizar calls de `buildContext`, `fetchPipelineAggregates`, `fetchCreativePerformance`
- **`AGENT_SYSTEM_PROMPT`**: atualizar seção `## Análise por período` para incluir exemplos de intervalos absolutos
- **Padrões de linguagem natural suportados** (documentados nos Dev Notes):
  - `"de 1 a 15 de junho"` / `"entre 1 e 15 de junho"`
  - `"de 01/06 a 15/06"` / `"01/06 a 15/06"`
  - `"de 01/06/2026 a 15/06/2026"`
  - `"junho"` / `"maio"` (mês completo → primeiro ao último dia do mês)
  - Todos os padrões relativos da 52-7 (últimos N dias, última semana, etc.)
  - **Novos:** `"mês passado"` → primeiro a último dia do mês anterior; `"semana passada"` → segunda a domingo da semana anterior; `"ontem"` → D-1; `"de X até hoje"` / `"a partir de X"` → startDate=X, endDate=hoje
- **UI — Seletor de período no chat panel** (`src/components/agent/agent-chat-panel.tsx`):
  - Barra compacta acima do `<textarea>` com chips de atalho: **Hoje · 7 dias · 15 dias · 30 dias · Mês passado · Personalizado...**
  - Ao clicar em atalho, define `dateWindow` state e exibe badge ativo (ex: "📅 Últimos 7 dias ×")
  - Ao clicar em **Personalizado...**, exibe dois `<input type="date">` inline (De / Até) com validação client-side de range
  - Badge com ×  limpa o filtro de UI (retorna ao modo de extração por linguagem natural)
  - Quando `dateWindow` está ativo, envia `date_window: { startDate, endDate }` no body do fetch
  - `date_window` do UI **tem prioridade absoluta** sobre extração de linguagem natural da mensagem
- **API route** (`chat/route.ts`): aceitar `date_window?: { startDate: string; endDate: string }` no body; quando presente e válido, usar diretamente (pular `extractDateWindow(message)`); quando ausente, usar extração NL
- **Validação de range**: se `startDate > endDate` → `400 INVALID_DATE_RANGE`; agente exibe mensagem amigável
- **Cap de 90 dias**: intervalo > 90 dias → agente informa e usa os 90 dias a partir do `startDate`

### OUT (não entra nesta story)

- Intervalos maiores que 90 dias — RPCs não validados para janelas grandes; retorna erro com mensagem explicativa
- Datas futuras — somente datas no passado ou hoje
- `buildCampaignContext` — contexto de campanha individual usa séries históricas completas
- Suporte a hora/minuto (granularidade é dia, não hora)
- Intervalos entre anos distintos (ex.: "dezembro de 2025 a janeiro de 2026") — complexidade de parsing fora do escopo
- Comparação de dois períodos na mesma query ("junho vs maio") — story futura

---

## Acceptance Criteria

- [ ] **AC1 — `extractDateWindow` detecta intervalos absolutos:**
  `extractDateWindow("de 1 a 15 de junho")` → `{ startDate: "2026-06-01", endDate: "2026-06-15" }`. `extractDateWindow("entre 01/06 e 30/06")` → `{ startDate: "2026-06-01", endDate: "2026-06-30" }`. `extractDateWindow("junho")` → `{ startDate: "2026-06-01", endDate: "2026-06-30" }`.

- [ ] **AC2 — `extractDateWindow` mantém comportamento relativo da 52-7:**
  `extractDateWindow("nos últimos 7 dias")` → `{ startDate: hoje-7, endDate: hoje }`. `extractDateWindow("sem hint")` → `{ startDate: hoje-30, endDate: hoje }`. A resolução de datas relativas é compatível com o comportamento atual de `extractPeriodDays`.

- [ ] **AC3 — Prioridade: absoluto > relativo:**
  `extractDateWindow("de 1 a 15 de junho, últimos 7 dias")` → o intervalo absoluto vence (`2026-06-01` a `2026-06-15`). Padrão absoluto tem prioridade sobre padrão relativo quando ambos estão presentes.

- [ ] **AC4 — RPCs aceitam `p_start_date` e `p_end_date`:**
  `SELECT * FROM pipeline_funnel_by_campaign('2026-06-01', '2026-06-15')` executa sem erro e retorna dados filtrados pelo intervalo. Idem para `creative_performance('2026-06-01', '2026-06-15')`.

- [ ] **AC5 — `buildGlobalContext` filtra por intervalo absoluto:**
  Dado `window = { startDate: "2026-06-01", endDate: "2026-06-15" }`, as queries de `meta_insights_daily` e `meta_leads` usam `.gte("date", "2026-06-01").lte("date", "2026-06-15")`.

- [ ] **AC6 — `chat/route.ts` usa `extractDateWindow` e propaga `DateWindow`:**
  Dado que usuário envia "como foram as campanhas de 1 a 15 de junho?", `extractDateWindow` retorna o intervalo correto e o `DateWindow` é passado para `buildContext`, `fetchPipelineAggregates` e `fetchCreativePerformance`. Verificável via log de servidor.

- [ ] **AC7 — Cache keys incluem intervalo:**
  Dado `window = { startDate: "2026-06-01", endDate: "2026-06-15" }`, a cache key de `buildGlobalContext` é `global:{orgId}:2026-06-01:2026-06-15`. Chaves de períodos diferentes não colidem.

- [ ] **AC8 — Sem regressão para queries sem hint:**
  Dado que usuário envia "qual campanha tem melhor CTR?" (sem hint), `extractDateWindow` retorna `{ startDate: hoje-30, endDate: hoje }` e o comportamento é idêntico ao da 52-7.

- [ ] **AC9 — Cabeçalho exibe intervalo correto:**
  Para intervalo absoluto, o cabeçalho do portfólio exibe `=== PORTFÓLIO (01/06/2026 a 15/06/2026) ===`. Para relativo de 7 dias, exibe `=== PORTFÓLIO (últimos 7 dias) ===` (compatibilidade com 52-7).

- [ ] **AC10 — `AGENT_SYSTEM_PROMPT` documenta intervalos absolutos:**
  A seção `## Análise por período` inclui exemplos de intervalos fechados: "de 1 a 15 de junho", "entre 01/06 e 30/06", "junho" (mês completo), "mês passado", "semana passada".

- [ ] **AC11 — Novos padrões relativos reconhecidos:**
  `extractDateWindow("mês passado")` → primeiro e último dia do mês anterior. `extractDateWindow("semana passada")` → segunda a domingo da semana passada. `extractDateWindow("ontem")` → D-1 a D-1. `extractDateWindow("a partir de 01/06")` → `{ startDate: "2026-06-01", endDate: hoje }`.

- [ ] **AC12 — UI: chips de atalho funcionam:**
  Clicar em "7 dias" define o filtro e exibe badge "📅 Últimos 7 dias ×" acima do textarea. A próxima mensagem enviada inclui `date_window` no body. Clicar em × remove o badge e retorna ao modo NL.

- [ ] **AC13 — UI: date picker personalizado funciona:**
  Clicar em "Personalizado..." exibe dois inputs de data. Ao confirmar um range válido, exibe badge "📅 01/06 a 15/06 ×". O body do fetch inclui `date_window: { startDate: "2026-06-01", endDate: "2026-06-15" }`.

- [ ] **AC14 — Validação de range inválido:**
  Se `startDate > endDate` (via UI ou linguagem natural), a API retorna `400 { error: "INVALID_DATE_RANGE" }`. O painel exibe mensagem amigável: *"O intervalo informado é inválido — a data de início é posterior à data de fim."*

- [ ] **AC15 — Cap de 90 dias com feedback:**
  Se o intervalo excede 90 dias, o agente responde: *"O intervalo solicitado ultrapassa 90 dias. Usando os últimos 90 dias como máximo disponível."* e executa com 90 dias a partir do `startDate`.

- [ ] **AC16 — `date_window` do UI tem prioridade sobre NL:**
  Dado que `dateWindow` está ativo no UI com range "01/06 a 15/06" e o usuário escreve "análise dos últimos 7 dias", o sistema usa `2026-06-01` a `2026-06-15` (UI sobrescreve NL).

- [ ] **AC17 — Typecheck e lint limpos:**
  `tsc --noEmit` e `eslint` nos arquivos modificados retornam zero erros ou warnings novos.

---

## Tasks / Subtasks

- [x] **T1** — Pré-trabalho: ler contratos atuais
  - [x] T1.1 — Ler `context-builder.ts` — assinaturas de `buildGlobalContext`, `buildContext`, `fetchPipelineAggregates`, `fetchCreativePerformance` e bloco de `extractPeriodDays`/`PERIOD_MAP`
  - [x] T1.2 — Ler `chat/route.ts` — ponto de chamada de `extractPeriodDays`, propagação e estrutura do body
  - [x] T1.3 — Ler `supabase/migrations/096_crm_pipeline_readonly_layer.sql` — corpo completo de `pipeline_funnel_by_campaign`
  - [x] T1.4 — Ler `supabase/migrations/101_creative_performance_with_crm.sql` — corpo completo de `creative_performance`
  - [x] T1.5 — Ler `system-prompt.ts` — seção `## Análise por período` atual
  - [x] T1.6 — Ler `src/components/agent/agent-chat-panel.tsx` linhas 350-380 — estrutura do fetch e estado do componente

- [x] **T2** — Criar `DateWindow` e `extractDateWindow` em `context-builder.ts`
  - [x] T2.1 — Exportar `type DateWindow = { startDate: string; endDate: string }`
  - [x] T2.2 — Criar `DATE_RANGE_PATTERNS` — array de `{ pattern: RegExp, resolve: (match) => DateWindow }` para intervalos absolutos (ver Dev Notes)
  - [x] T2.3 — Implementar `export function extractDateWindow(msg: string): DateWindow` — tenta cada padrão absoluto primeiro; se nenhum match, converte via `extractPeriodDays` para DateWindow relativo (`endDate = hoje`, `startDate = hoje - days`)

- [x] **T3** — Migration `104_agent_daterange_rpcs.sql`
  - [x] T3.1 — Adicionar overload `pipeline_funnel_by_campaign(p_start_date DATE, p_end_date DATE)` — corpo idêntico à 096 substituindo `CURRENT_DATE - p_days` por `p_start_date` e adicionando `.lte("date", p_end_date)` nas condições relevantes. Manter GRANT/REVOKE idênticos à 096.
  - [x] T3.2 — Adicionar overload `creative_performance(p_start_date DATE, p_end_date DATE)` — corpo idêntico à 101 com mesma substituição. Manter GRANT/REVOKE.
  - [x] T3.3 — Verificar que ambos os overloads com `p_days INTEGER` continuam funcionando (sem quebra de compatibilidade)

- [x] **T4** — Atualizar builders em `context-builder.ts`
  - [x] T4.1 — `buildGlobalContext(supabase, orgId, window?: DateWindow)` — substituir parâmetro `pDays?: number` por `window?: DateWindow`; calcular `startDate = window?.startDate ?? hoje-30` e `endDate = window?.endDate ?? hoje`; usar `.gte("date", startDate).lte("date", endDate)` nas queries de `meta_insights_daily` e `meta_leads`
  - [x] T4.2 — Atualizar cache key: `global:${orgId}:${startDate}:${endDate}`
  - [x] T4.3 — Atualizar header do portfólio: se `window` é relativo, exibir `últimos N dias`; se absoluto, exibir `DD/MM/YYYY a DD/MM/YYYY`
  - [x] T4.4 — `buildContext(supabase, orgId, contextType, contextId?, window?: DateWindow)` — substituir `pDays?` por `window?`; repassar para `buildGlobalContext`
  - [x] T4.5 — `fetchPipelineAggregates(supabase, orgId, window?: DateWindow)` — chamar RPC com `p_start_date`/`p_end_date`; atualizar cache key
  - [x] T4.6 — `fetchCreativePerformance(supabase, orgId, window?: DateWindow)` — chamar RPC com `p_start_date`/`p_end_date`; atualizar cache key e header `=== CRIATIVOS (...) ===`

- [x] **T5** — Atualizar `chat/route.ts`
  - [x] T5.1 — Adicionar `extractDateWindow`, `DateWindow` ao bloco de imports
  - [x] T5.2 — Substituir `extractPeriodDays(message)` por `extractDateWindow(message)`
  - [x] T5.3 — Atualizar calls de `buildContext`, `fetchPipelineAggregates`, `fetchCreativePerformance` para passar `DateWindow`
  - [x] T5.4 — Log de diagnóstico: `console.log("[52-8] date window:", dateWindow)`

- [x] **T6** — Atualizar `AGENT_SYSTEM_PROMPT`
  - [x] T6.1 — Atualizar seção `## Análise por período` com exemplos de intervalos absolutos

- [x] **T7** — UI: Seletor de período em `agent-chat-panel.tsx`
  - [x] T7.1 — Adicionar state `dateWindow: DateWindow | null` ao componente
  - [x] T7.2 — Renderizar barra de chips acima do `<textarea>` com atalhos: Hoje, 7 dias, 15 dias, 30 dias, Mês passado, Personalizado...
  - [x] T7.3 — Implementar badge ativo com label descritivo e botão × para limpar
  - [x] T7.4 — Implementar picker "Personalizado..." com dois `<input type="date">` e validação client-side (startDate ≤ endDate, endDate ≤ hoje, range ≤ 90 dias)
  - [x] T7.5 — Incluir `date_window` no body do fetch quando `dateWindow !== null`
  - [x] T7.6 — Limpar `dateWindow` ao iniciar nova sessão

- [x] **T8** — Atualizar `chat/route.ts` para aceitar `date_window` do body
  - [x] T8.1 — Adicionar `date_window?: { startDate: string; endDate: string }` ao tipo do body
  - [x] T8.2 — Validar `date_window` quando presente: `startDate <= endDate`, datas válidas ISO, range ≤ 90 dias; retornar `400 INVALID_DATE_RANGE` se inválido
  - [x] T8.3 — Quando `date_window` presente e válido, usar diretamente como `DateWindow` (pular `extractDateWindow`)
  - [x] T8.4 — Log de diagnóstico: `console.log("[52-8] date window:", dateWindow, "source:", source)` onde `source` é `"ui"` ou `"nl"`

- [x] **T9** — Typecheck e lint
  - [x] T9.1 — `tsc --noEmit` — zero erros novos
  - [x] T9.2 — `eslint` — zero warnings novos nos arquivos modificados

- [x] **T10** — Testes manuais
  - [x] T10.1 — "como foram as campanhas de 1 a 15 de junho?" → padrão regex corrigido (bug: `[ae]` em vez de só `e`); validado via script: `startDate: 2026-06-01, endDate: 2026-06-15`
  - [x] T10.2 — "análise de junho" → `2026-06-01` a `2026-06-30` — validado via script
  - [x] T10.3 — "mês passado" → `2026-05-01` a `2026-05-31` — validado via script
  - [x] T10.4 — "últimos 7 dias" → `2026-06-15` a `2026-06-22` — sem regressão, validado via script
  - [x] T10.5 — Chips: `_windowForChip` retorna `DateWindow` correto; badge com × chama `setDateWindow(null)`; `date_window` incluído no body quando definido (verificado no código)
  - [x] T10.6 — Custom picker: validação `customStart > customEnd` bloqueia; `setDateWindow({...})` com label `DD/MM/YYYY a DD/MM/YYYY` (verificado no código)
  - [x] T10.7 — Picker inválido: `setDatePickerError("Data de início posterior ao fim.")` exibido; `return` antes de qualquer `setDateWindow` (verificado no código)

---

## Dev Notes

### Tipo `DateWindow`

```typescript
// context-builder.ts — adicionar logo abaixo dos imports existentes
export type DateWindow = {
  startDate: string  // "YYYY-MM-DD"
  endDate: string    // "YYYY-MM-DD"
  label?: string     // ex: "01/06 a 15/06" | "Últimos 7 dias" — usado em cabeçalhos
}
```

---

### T2 — `extractDateWindow` em `context-builder.ts`

Adicionar **logo após** o bloco de `PERIOD_MAP` / `extractPeriodDays` (em torno da linha 47).

#### Helpers internos (não exportar)

```typescript
function _isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function _lastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

const MONTH_MAP: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, março: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
}

function _monthNum(raw: string): number | null {
  const key = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  return MONTH_MAP[key] ?? null
}
```

#### `DATE_RANGE_PATTERNS` — intervalos absolutos (avaliados em ordem, do mais específico ao mais geral)

```typescript
type AbsolutePattern = { pattern: RegExp; resolve: (m: RegExpMatchArray) => DateWindow | null }

const DATE_RANGE_PATTERNS: AbsolutePattern[] = [
  // "de 01/06/2026 a 15/06/2026" (com ano explícito)
  {
    pattern: /(?:de|entre)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(?:a[té]?|e)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i,
    resolve: (m) => ({
      startDate: _isoDate(+m[3]!, +m[2]!, +m[1]!),
      endDate:   _isoDate(+m[6]!, +m[5]!, +m[4]!),
    }),
  },
  // "de 1 a 15 de junho [de 2026]" / "entre 1 e 15 de junho"
  {
    pattern: /(?:de|entre)\s+(\d{1,2})\s+(?:a[té]?|e)\s+(\d{1,2})\s+de\s+([\wçã]+)(?:\s+de\s+(\d{4}))?/i,
    resolve: (m) => {
      const mn = _monthNum(m[3]!)
      if (!mn) return null
      const today = new Date()
      let year = m[4] ? +m[4] : today.getFullYear()
      const start = _isoDate(year, mn, +m[1]!)
      if (start > today.toISOString().split("T")[0]!) year -= 1
      return {
        startDate: _isoDate(year, mn, +m[1]!),
        endDate:   _isoDate(year, mn, +m[2]!),
      }
    },
  },
  // "de 01/06 a 15/06" / "01/06 a 15/06" / "01/06 até 15/06"
  {
    pattern: /(?:de\s+)?(\d{1,2})\/(\d{1,2})\s+(?:a[té]?|e)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i,
    resolve: (m) => {
      const today = new Date()
      const year = m[5] ? +m[5] : today.getFullYear()
      return {
        startDate: _isoDate(year, +m[2]!, +m[1]!),
        endDate:   _isoDate(year, +m[4]!, +m[3]!),
      }
    },
  },
  // "a partir de 01/06" / "desde 01/06" / "de 01/06 até hoje"
  {
    pattern: /(?:a\s+partir\s+de|desde|de)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:at[eé]\s*hoje)?/i,
    resolve: (m) => {
      const today = new Date()
      const todayStr = today.toISOString().split("T")[0]!
      const year = m[3] ? +m[3] : today.getFullYear()
      return {
        startDate: _isoDate(year, +m[2]!, +m[1]!),
        endDate:   todayStr,
        label: `a partir de ${String(m[1]).padStart(2,"0")}/${String(m[2]).padStart(2,"0")}`,
      }
    },
  },
  // Nome de mês isolado: "junho" / "maio" (não precedido por "últim")
  {
    pattern: /(?<!últim[ao]s?\s*)\b(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/i,
    resolve: (m) => {
      const mn = _monthNum(m[1]!)
      if (!mn) return null
      const today = new Date()
      let year = today.getFullYear()
      if (mn > today.getMonth() + 1) year -= 1
      return {
        startDate: _isoDate(year, mn, 1),
        endDate:   _isoDate(year, mn, _lastDay(year, mn)),
        label:     m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase(),
      }
    },
  },
]
```

#### `NEW_RELATIVE_PATTERNS` — novos padrões relativos (avaliados antes do `PERIOD_MAP` existente)

```typescript
type RelativePattern = { pattern: RegExp; resolve: () => DateWindow }

const NEW_RELATIVE_PATTERNS: RelativePattern[] = [
  // "mês passado"
  {
    pattern: /m[eê]s\s+passado/i,
    resolve: () => {
      const d = new Date()
      const m = d.getMonth() === 0 ? 12 : d.getMonth()
      const y = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
      return { startDate: _isoDate(y, m, 1), endDate: _isoDate(y, m, _lastDay(y, m)), label: "Mês passado" }
    },
  },
  // "semana passada"
  {
    pattern: /semana\s+passada/i,
    resolve: () => {
      const today = new Date()
      const dow = today.getDay() // 0=Dom
      const toMon = dow === 0 ? 6 : dow - 1
      const mon = new Date(today); mon.setDate(today.getDate() - toMon - 7)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return {
        startDate: mon.toISOString().split("T")[0]!,
        endDate:   sun.toISOString().split("T")[0]!,
        label: "Semana passada",
      }
    },
  },
  // "ontem"
  {
    pattern: /\bontem\b/i,
    resolve: () => {
      const d = new Date(); d.setDate(d.getDate() - 1)
      const iso = d.toISOString().split("T")[0]!
      return { startDate: iso, endDate: iso, label: "Ontem" }
    },
  },
]
```

#### `extractDateWindow` — função principal

```typescript
export function extractDateWindow(msg: string): DateWindow {
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]!

  // 1. Tentar padrões absolutos (prioridade máxima)
  for (const { pattern, resolve } of DATE_RANGE_PATTERNS) {
    const m = msg.match(pattern)
    if (m) {
      const w = resolve(m)
      if (w) return w
    }
  }

  // 2. Tentar novos padrões relativos (mês passado, semana passada, ontem)
  for (const { pattern, resolve } of NEW_RELATIVE_PATTERNS) {
    if (pattern.test(msg)) return resolve()
  }

  // 3. Fallback: PERIOD_MAP existente (dias relativos da 52-7)
  const days = extractPeriodDays(msg)
  const start = new Date(today)
  start.setDate(today.getDate() - days)
  return {
    startDate: start.toISOString().split("T")[0]!,
    endDate:   todayStr,
    label:     days === 1 ? "Hoje" : `Últimos ${days} dias`,
  }
}
```

---

### T3 — Migration `104_agent_daterange_rpcs.sql`

O arquivo deve ter apenas os **novos overloads** (assinaturas com DATE). Não re-criar as assinaturas INTEGER existentes.

```sql
-- migration: 104_agent_daterange_rpcs.sql
-- Adiciona overloads DATE,DATE para pipeline_funnel_by_campaign e creative_performance
-- As assinaturas INTEGER DEFAULT 30 existentes nas migrations 096 e 101 permanecem intactas.

-- ── pipeline_funnel_by_campaign(DATE, DATE) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.pipeline_funnel_by_campaign(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  org_id            UUID,
  utm_source        VARCHAR(255),
  utm_campaign      VARCHAR(255),
  utm_medium        VARCHAR(255),
  total_leads       BIGINT,
  leads_qualificado BIGINT,
  leads_agendado    BIGINT,
  leads_visitou     BIGINT,
  leads_proposta    BIGINT,
  leads_fechado     BIGINT,
  total_spend       NUMERIC,
  cpl_real_visitou  NUMERIC,
  cpl_real_fechado  NUMERIC
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
WITH lead_stage AS (
  SELECT
    l.org_id, l.utm_source, l.utm_campaign, l.utm_medium,
    l.id AS lead_id,
    ks.position AS stage_position,
    ks.type     AS stage_type
  FROM public.leads l
  LEFT JOIN public.kanban_stages ks ON ks.id = l.stage_id
  WHERE l.is_active = true
),
type_thresholds AS (
  SELECT org_id, type, MIN(position) AS min_position
  FROM public.kanban_stages
  GROUP BY org_id, type
),
funnel AS (
  SELECT
    ls.org_id, ls.utm_source, ls.utm_campaign, ls.utm_medium,
    COUNT(*)::BIGINT AS total_leads,
    COUNT(*) FILTER (WHERE ls.stage_position >= tq.min_position)::BIGINT AS leads_qualificado,
    COUNT(*) FILTER (WHERE ls.stage_position >= ta.min_position)::BIGINT AS leads_agendado,
    COUNT(*) FILTER (WHERE ls.stage_position >= tv.min_position)::BIGINT AS leads_visitou,
    COUNT(*) FILTER (WHERE ls.stage_position >= tp.min_position)::BIGINT AS leads_proposta,
    COUNT(*) FILTER (WHERE ls.stage_type = 'fechado')::BIGINT            AS leads_fechado
  FROM lead_stage ls
  LEFT JOIN type_thresholds tq ON tq.org_id = ls.org_id AND tq.type = 'qualificado'
  LEFT JOIN type_thresholds ta ON ta.org_id = ls.org_id AND ta.type = 'agendado'
  LEFT JOIN type_thresholds tv ON tv.org_id = ls.org_id AND tv.type = 'visitou'
  LEFT JOIN type_thresholds tp ON tp.org_id = ls.org_id AND tp.type = 'proposta'
  GROUP BY ls.org_id, ls.utm_source, ls.utm_campaign, ls.utm_medium
),
campaign_spend AS (
  SELECT
    mc.org_id,
    lower(trim(mc.name)) AS campaign_name_norm,
    SUM(mid.spend)::NUMERIC AS total_spend
  FROM public.meta_campaigns mc
  JOIN public.meta_insights_daily mid
    ON  mid.org_id    = mc.org_id
    AND mid.level     = 'campaign'
    AND mid.entity_id = mc.meta_campaign_id
    AND mid.date      >= p_start_date    -- ← intervalo absoluto
    AND mid.date      <= p_end_date      -- ← intervalo absoluto
  WHERE mc.name IS NOT NULL
  GROUP BY mc.org_id, lower(trim(mc.name))
)
SELECT
  f.org_id, f.utm_source, f.utm_campaign, f.utm_medium,
  f.total_leads, f.leads_qualificado, f.leads_agendado,
  f.leads_visitou, f.leads_proposta, f.leads_fechado,
  cs.total_spend,
  (cs.total_spend / NULLIF(f.leads_visitou, 0))::NUMERIC AS cpl_real_visitou,
  (cs.total_spend / NULLIF(f.leads_fechado, 0))::NUMERIC AS cpl_real_fechado
FROM funnel f
LEFT JOIN campaign_spend cs
  ON  cs.org_id = f.org_id
  AND cs.campaign_name_norm = lower(trim(f.utm_campaign))
WHERE public.user_role() = 'admin'
  AND f.org_id = public.user_org_id();
$$;

REVOKE ALL ON FUNCTION public.pipeline_funnel_by_campaign(DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pipeline_funnel_by_campaign(DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.pipeline_funnel_by_campaign(DATE, DATE) IS
  'Epic52 Story 52-8: overload com intervalo absoluto (p_start_date/p_end_date). Idêntico à assinatura INTEGER mas campaign_spend filtra por date BETWEEN p_start_date AND p_end_date.';

-- ── creative_performance(DATE, DATE) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.creative_performance(
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  meta_ad_id              TEXT,
  ad_name                 TEXT,
  adset_id                UUID,
  status                  TEXT,
  creative                JSONB,
  total_spend             NUMERIC,
  total_impressions       BIGINT,
  total_clicks            BIGINT,
  avg_ctr                 NUMERIC,
  avg_cpc                 NUMERIC,
  avg_cpm                 NUMERIC,
  total_leads             BIGINT,
  avg_cost_per_lead       NUMERIC,
  quality_ranking         TEXT,
  engagement_rate_ranking TEXT,
  conversion_rate_ranking TEXT,
  crm_leads_total         BIGINT,
  crm_leads_agendado      BIGINT,
  crm_leads_visitou       BIGINT,
  crm_leads_proposta      BIGINT,
  crm_leads_fechado       BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    a.meta_ad_id, a.name AS ad_name, a.adset_id, a.status, a.creative,
    SUM(i.spend)           AS total_spend,
    SUM(i.impressions)     AS total_impressions,
    SUM(i.clicks)          AS total_clicks,
    AVG(i.ctr)             AS avg_ctr,
    AVG(i.cpc)             AS avg_cpc,
    AVG(i.cpm)             AS avg_cpm,
    SUM(i.leads)           AS total_leads,
    AVG(i.cost_per_lead)   AS avg_cost_per_lead,
    (SELECT i2.quality_ranking          FROM public.meta_insights_daily i2
     WHERE i2.entity_id = a.meta_ad_id AND i2.org_id = a.org_id AND i2.level = 'ad'
       AND i2.date >= p_start_date AND i2.date <= p_end_date
     ORDER BY i2.date DESC LIMIT 1)     AS quality_ranking,
    (SELECT i2.engagement_rate_ranking  FROM public.meta_insights_daily i2
     WHERE i2.entity_id = a.meta_ad_id AND i2.org_id = a.org_id AND i2.level = 'ad'
       AND i2.date >= p_start_date AND i2.date <= p_end_date
     ORDER BY i2.date DESC LIMIT 1)     AS engagement_rate_ranking,
    (SELECT i2.conversion_rate_ranking  FROM public.meta_insights_daily i2
     WHERE i2.entity_id = a.meta_ad_id AND i2.org_id = a.org_id AND i2.level = 'ad'
       AND i2.date >= p_start_date AND i2.date <= p_end_date
     ORDER BY i2.date DESC LIMIT 1)     AS conversion_rate_ranking,
    COUNT(DISTINCT l.id)::BIGINT                                          AS crm_leads_total,
    COUNT(DISTINCT CASE WHEN ks.type = 'agendado' THEN l.id END)::BIGINT  AS crm_leads_agendado,
    COUNT(DISTINCT CASE WHEN ks.type = 'visitou'  THEN l.id END)::BIGINT  AS crm_leads_visitou,
    COUNT(DISTINCT CASE WHEN ks.type = 'proposta' THEN l.id END)::BIGINT  AS crm_leads_proposta,
    COUNT(DISTINCT CASE WHEN ks.type = 'fechado'  THEN l.id END)::BIGINT  AS crm_leads_fechado
  FROM   public.meta_ads a
  JOIN   public.meta_insights_daily i
         ON  i.entity_id = a.meta_ad_id
         AND i.org_id    = a.org_id
         AND i.level     = 'ad'
         AND i.date      >= p_start_date   -- ← intervalo absoluto
         AND i.date      <= p_end_date     -- ← intervalo absoluto
  LEFT JOIN public.leads l
         ON  (l.metadata->>'ad_id') = a.meta_ad_id AND l.org_id = a.org_id
  LEFT JOIN public.kanban_stages ks ON ks.id = l.stage_id
  WHERE  a.org_id = public.user_org_id()
    AND  public.is_admin_or_supervisor()
  GROUP BY a.meta_ad_id, a.name, a.adset_id, a.status, a.creative, a.org_id
  ORDER BY crm_leads_visitou DESC NULLS LAST, total_leads DESC NULLS LAST
$$;

REVOKE ALL ON FUNCTION public.creative_performance(DATE, DATE) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.creative_performance(DATE, DATE) TO authenticated;

COMMENT ON FUNCTION public.creative_performance(DATE, DATE) IS
  'Epic52 Story 52-8: overload com intervalo absoluto (p_start_date/p_end_date). Filtra meta_insights_daily.date BETWEEN p_start_date AND p_end_date.';
```

---

### T4 — Atualizar builders em `context-builder.ts`

#### `buildGlobalContext` — substituição de `pDays?: number` por `window?: DateWindow`

**Assinatura nova (linha 61–64 atualmente):**
```typescript
export async function buildGlobalContext(
  supabase: SupabaseClient,
  orgId: string,
  window?: DateWindow,
): Promise<string> {
```

**Início do corpo — substituir as linhas 66–73 (variáveis `days`, `key`, `today`, `dateNdAgo`, `date30dAgo`) por:**
```typescript
  const today = new Date().toISOString().split("T")[0]!
  const startDate = window?.startDate ?? (() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]!
  })()
  const endDate = window?.endDate ?? today
  const key = `global:${orgId}:${startDate}:${endDate}`
  const cached = getCached(key)
  if (cached) return cached
  // date30dAgo ainda necessário para meta_alerts (alerta dos últimos 30d fixo):
  const date30dAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })()
```

**Query `meta_insights_daily` (linha 85–86 atualmente):**
```typescript
      .gte("date", startDate)   // era: .gte("date", dateNdAgo)
      .lte("date", endDate)     // linha nova
```

**Header do portfólio (linha 142 atualmente):**
```typescript
  // Era: lines.push(`=== PORTFÓLIO (últimos ${days} dias) ===`)
  const periodLabel = window?.label
    ?? (startDate === (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })()
        && endDate === today
        ? "últimos 30 dias"
        : `${startDate.split("-").reverse().slice(0,2).join("/")} a ${endDate.split("-").reverse().slice(0,2).join("/")}`)
  lines.push(`=== PORTFÓLIO (${periodLabel}) ===`)
```

> **Nota:** O `date30dAgo` permanece para `meta_alerts` (alerta fixo de 30 dias independente do filtro do usuário). A variável `dateNdAgo` pode ser removida — substituída por `startDate`.

#### `buildContext` — substituir `pDays?` por `window?` (linha 362–373 atualmente)

```typescript
export function buildContext(
  supabase: SupabaseClient,
  orgId: string,
  contextType: "global" | "campaign",
  contextId?: string | null,
  window?: DateWindow,
): Promise<string> {
  if (contextType === "campaign" && contextId) {
    return buildCampaignContext(supabase, orgId, contextId)
  }
  return buildGlobalContext(supabase, orgId, window)
}
```

#### `fetchPipelineAggregates` — substituir `pDays?` por `window?` (linha 505)

```typescript
export async function fetchPipelineAggregates(
  supabase: SupabaseClient,
  orgId: string,
  window?: DateWindow,
): Promise<string> {
  const today = new Date().toISOString().split("T")[0]!
  const startDate = window?.startDate ?? (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })()
  const endDate = window?.endDate ?? today
  const key = `pipeline_agg:${orgId}:${startDate}:${endDate}`
  // cacheable somente para o default de 30 dias
  const cacheable = startDate === (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })() && endDate === today
  if (cacheable) {
    const cached = getCached(key)
    if (cached !== null) return cached
  }
  const [funnelRes, stageRes] = await Promise.all([
    supabase.rpc("pipeline_funnel_by_campaign", { p_start_date: startDate, p_end_date: endDate }),
    // ... stageRes igual ao atual
  ])
  // ... resto do corpo igual, apenas trocar `days` por label:
  // Era: lines.push(`--- Funil por Campanha/UTM (últimos ${days} dias) ---`)
  const label = window?.label ?? `${startDate} a ${endDate}`
  lines.push(`--- Funil por Campanha/UTM (${label}) ---`)
```

#### `fetchCreativePerformance` — substituir `pDays?` por `window?` (linha 799)

```typescript
export async function fetchCreativePerformance(
  supabase: SupabaseClient,
  orgId: string,
  window?: DateWindow,
): Promise<string> {
  const today = new Date().toISOString().split("T")[0]!
  const startDate = window?.startDate ?? (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })()
  const endDate = window?.endDate ?? today
  const cacheable = startDate === (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]! })() && endDate === today
  const key = `creative_perf:${orgId}:${startDate}:${endDate}`
  if (cacheable) {
    const cached = getCached(key)
    if (cached !== null) return cached
  }
  const { data, error } = await supabase.rpc("creative_performance", { p_start_date: startDate, p_end_date: endDate })
  // ...
  const label = window?.label ?? `${startDate} a ${endDate}`
  lines.push(`=== CRIATIVOS (${label}) ===`)
```

---

### T5/T8 — `chat/route.ts`

#### Imports a atualizar (linha 13 — trocar `extractPeriodDays` por `extractDateWindow`)

```typescript
import {
  buildContext,
  fetchPipelineAggregates,
  fetchLeadDrill,
  fetchConversationContext,
  fetchCreativePerformance,
  extractDateWindow,
  type DateWindow,
} from "@/lib/agent/context-builder"
```

#### Tipo do body (linha 89–94 — adicionar `date_window`)

```typescript
  let body: {
    session_id?: string
    message: string
    context_type?: "global" | "campaign"
    context_id?: string
    date_window?: { startDate: string; endDate: string }
  }
```

#### Lógica de extração (substituir linhas 162–163)

```typescript
  const { session_id, message, context_type = "global", context_id, date_window } = body

  // ... (código de sessão existente permanece igual) ...

  let dateWindow: DateWindow
  let dateWindowSource: "ui" | "nl" = "nl"

  if (date_window) {
    if (!date_window.startDate || !date_window.endDate || date_window.startDate > date_window.endDate) {
      return NextResponse.json({ error: "INVALID_DATE_RANGE" }, { status: 400 })
    }
    const diffMs = new Date(date_window.endDate).getTime() - new Date(date_window.startDate).getTime()
    const diffDays = Math.ceil(diffMs / 86400000)
    if (diffDays > 90) {
      const cappedEnd = new Date(date_window.startDate)
      cappedEnd.setDate(cappedEnd.getDate() + 90)
      dateWindow = { startDate: date_window.startDate, endDate: cappedEnd.toISOString().split("T")[0]! }
    } else {
      dateWindow = { startDate: date_window.startDate, endDate: date_window.endDate }
    }
    dateWindowSource = "ui"
  } else {
    dateWindow = extractDateWindow(message)
  }
  console.log("[52-8] date window:", dateWindow, "source:", dateWindowSource)
```

#### Substituir `periodDays` nas calls (linhas 166, 177, 207)

```typescript
  // Era: buildContext(supabase, appUser.org_id, context_type, context_id, periodDays)
  const mediaContext = await buildContext(supabase, appUser.org_id, context_type, context_id, dateWindow)

  // Era: fetchPipelineAggregates(supabase, appUser.org_id, periodDays)
  pipelineContext += "\n\n" + (await fetchPipelineAggregates(supabase, appUser.org_id, dateWindow))

  // Era: fetchCreativePerformance(supabase, appUser.org_id, periodDays)
  const creative = await fetchCreativePerformance(supabase, appUser.org_id, dateWindow)
```

---

### T7 — UI `agent-chat-panel.tsx`

#### Novos states (adicionar após linha 256, junto dos outros `useState`)

```tsx
  const [dateWindow, setDateWindow]       = useState<DateWindow | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customStart, setCustomStart]     = useState("")
  const [customEnd, setCustomEnd]         = useState("")
```

#### Chips config e helper (fora do componente, logo acima do `export default`)

```tsx
import { type DateWindow } from "@/lib/agent/context-builder"

const CHIPS = [
  { label: "Hoje",        days: 0 },
  { label: "7 dias",      days: 7 },
  { label: "15 dias",     days: 15 },
  { label: "30 dias",     days: 30 },
  { label: "Mês passado", monthPast: true as const },
] as const

function _windowForChip(chip: typeof CHIPS[number]): DateWindow {
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]!
  if ("monthPast" in chip) {
    const m = today.getMonth() === 0 ? 12 : today.getMonth()
    const y = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
    const last = new Date(y, m, 0).getDate()
    const mm = String(m).padStart(2, "0")
    return { startDate: `${y}-${mm}-01`, endDate: `${y}-${mm}-${String(last).padStart(2,"0")}`, label: "Mês passado" }
  }
  if (chip.days === 0) return { startDate: todayStr, endDate: todayStr, label: "Hoje" }
  const start = new Date(today); start.setDate(today.getDate() - chip.days)
  return { startDate: start.toISOString().split("T")[0]!, endDate: todayStr, label: `Últimos ${chip.days} dias` }
}
```

#### JSX — barra de chips + badge + picker personalizado

Inserir **acima** do `<textarea>` (antes da linha 755), dentro do container do input:

```tsx
{/* Barra de período */}
<div className="flex flex-wrap items-center gap-1 px-3 pt-2">
  {CHIPS.map((chip) => (
    <button
      key={chip.label}
      type="button"
      onClick={() => { setDateWindow(_windowForChip(chip)); setShowDatePicker(false) }}
      className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-muted transition-colors"
    >
      {chip.label}
    </button>
  ))}
  <button
    type="button"
    onClick={() => setShowDatePicker((v) => !v)}
    className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-muted transition-colors"
  >
    Personalizado...
  </button>
</div>

{/* Badge ativo */}
{dateWindow && !showDatePicker && (
  <div className="flex items-center gap-1 px-3 py-1">
    <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
      📅 {dateWindow.label ?? `${dateWindow.startDate} a ${dateWindow.endDate}`}
    </span>
    <button
      type="button"
      onClick={() => setDateWindow(null)}
      className="text-xs text-muted-foreground hover:text-foreground leading-none"
      aria-label="Remover filtro de data"
    >
      ×
    </button>
  </div>
)}

{/* Picker personalizado */}
{showDatePicker && (
  <div className="flex flex-wrap items-center gap-2 px-3 py-1">
    <input
      type="date"
      max={new Date().toISOString().split("T")[0]}
      value={customStart}
      onChange={(e) => setCustomStart(e.target.value)}
      className="text-xs border border-border rounded px-1 py-0.5 bg-background"
    />
    <span className="text-xs text-muted-foreground">até</span>
    <input
      type="date"
      max={new Date().toISOString().split("T")[0]}
      value={customEnd}
      onChange={(e) => setCustomEnd(e.target.value)}
      className="text-xs border border-border rounded px-1 py-0.5 bg-background"
    />
    <button
      type="button"
      onClick={() => {
        if (!customStart || !customEnd || customStart > customEnd) return
        const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/")
        setDateWindow({ startDate: customStart, endDate: customEnd, label: `${fmt(customStart)} a ${fmt(customEnd)}` })
        setShowDatePicker(false)
      }}
      className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded"
    >
      Aplicar
    </button>
    <button type="button" onClick={() => setShowDatePicker(false)} className="text-xs text-muted-foreground">✕</button>
  </div>
)}
```

#### Atualizar corpo do `fetch` em `sendMessage` (linhas 372–377)

```tsx
        body: JSON.stringify({
          session_id: activeSessionId,
          message: text,
          context_type: contextType,
          context_id: contextId,
          ...(dateWindow && { date_window: { startDate: dateWindow.startDate, endDate: dateWindow.endDate } }),
        }),
```

#### Limpar `dateWindow` ao iniciar nova sessão

```tsx
// Adicionar useEffect logo após o useEffect de scroll (linha ~265)
useEffect(() => {
  if (!activeSessionId) {
    setDateWindow(null)
    setShowDatePicker(false)
  }
}, [activeSessionId])
```

---

### Cache key strategy

| Função | Chave |
|--------|-------|
| `buildGlobalContext` | `global:{orgId}:{startDate}:{endDate}` |
| `fetchPipelineAggregates` | `pipeline_agg:{orgId}:{startDate}:{endDate}` |
| `fetchCreativePerformance` | `creative_perf:{orgId}:{startDate}:{endDate}` |

`cacheable` = `endDate === hoje && startDate === hoje-30` (somente default 30 dias é cacheado).

### Compatibilidade com `extractPeriodDays`

`extractPeriodDays` permanece **exportada e inalterada**. `extractDateWindow` a reutiliza internamente como fallback (passo 3). `chat/route.ts` passa a importar `extractDateWindow` no lugar de `extractPeriodDays`.

### Prioridade de interpretação no `extractDateWindow`

1. **Padrões absolutos** (`DATE_RANGE_PATTERNS`) — "de 1 a 15 de junho", "junho", "01/06 a 15/06"
2. **Novos relativos** (`NEW_RELATIVE_PATTERNS`) — "mês passado", "semana passada", "ontem"
3. **Relativos legados** (`PERIOD_MAP` via `extractPeriodDays`) — "últimos 7 dias", "quinzena", etc.
4. **Default** — 30 dias

### Nota sobre `AGENT_SYSTEM_PROMPT` (T6)

Localizar a seção `## Análise por período` em `system-prompt.ts` e adicionar exemplos:
- "de 1 a 15 de junho", "entre 01/06 e 30/06", "junho" (mês inteiro), "mês passado", "semana passada", "ontem", "a partir de 01/06"

---

## File List

- [ ] `packages/web/src/lib/agent/context-builder.ts` — novo tipo `DateWindow`, nova função `extractDateWindow` (com novos padrões), builders atualizados
- [ ] `packages/web/src/app/api/agent/chat/route.ts` — aceita `date_window` no body, validação, substituição de `extractPeriodDays` por `extractDateWindow`
- [ ] `packages/web/src/lib/agent/system-prompt.ts` — atualização da seção `## Análise por período`
- [ ] `packages/web/src/components/agent/agent-chat-panel.tsx` — UI de seletor de período (chips + picker personalizado)
- [ ] `supabase/migrations/104_agent_daterange_rpcs.sql` — overloads com `p_start_date`/`p_end_date`

---

## QA Results

_(a preencher por @qa)_

---

## Change Log

| Date | Agent | Change |
|------|-------|--------|
| 2026-06-19 | @sm (River) | Story criada — Epic 52, Story 52-8 |
| 2026-06-19 | @pm (Morgan) | Revisão de produto: complexidade M→L; adicionados padrões "mês passado/semana passada/ontem/de X até hoje"; UI date picker movido de OUT→IN; validação de range inválido (AC14); cap 90 dias com feedback (AC15); prioridade UI>NL (AC16); T7 (UI), T8 (API body), T10 (testes manuais) adicionados. |
| 2026-06-19 | @sm (River) | Especificação técnica completa: Dev Notes com código exato para extractDateWindow (MONTH_MAP, DATE_RANGE_PATTERNS, NEW_RELATIVE_PATTERNS), SQL migration 104 (bodies completos dos overloads DATE,DATE), assinaturas novas dos builders, lógica chat/route.ts e JSX de agent-chat-panel.tsx. T7 duplicado removido. |
| 2026-06-19 | @po (Pax) | Validação GO 9/10. Draft → Ready. Pontos de atenção para @dev: AC14 (exibir erro 400 na UI), AC9 (formato DD/MM/YYYY com ano no cabeçalho). Não bloqueantes. |
| 2026-06-22 | @dev (Dex) | Implementação completa: 5 arquivos (commit 3c20daf). Bugfix descoberto em T10: padrões DATE_RANGE_PATTERNS usavam `(?:at[eé]?|e)` sem contemplar "a" simples — corrigido para `(?:at[eé]?|[ae])` nos 3 padrões de range. Todos os testes T1-T10 passando. InProgress → Ready for Review. |
