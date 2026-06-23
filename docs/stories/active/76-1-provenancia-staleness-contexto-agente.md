# Story 76-1 — Proveniência e Staleness dos Dados Meta no Contexto do Agente

## Metadata
- **Epic:** 76 — Proveniência e Performance dos Dados Meta Ads no Agente de Tráfego
- **Story:** 76-1
- **Status:** Ready for Review
- **Priority:** P0 — MUST (sem proveniência, o agente reporta métricas sem rastreabilidade de origem ou recência)
- **Complexity:** M (5-8h)
- **Story Points:** 5
- **MoSCoW:** MUST
- **Created:** 2026-06-22
- **Author:** @sm (River)

> **CodeRabbit Integration:** Disabled — validação manual pelo @architect.

### Executor Assignment
- **Executor Principal:** @dev (Dex)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[provenance_context_check, staleness_alert_test, tenant_isolation_check]`
- **Depende de:** — (nenhuma, ponto de partida do epic)
- **Paralelizável com:** 76-2 (independentes)
- **Bloqueia:** 76-3 (precisa da proveniência exposta por esta story)

---

## User Story

**Como** gestor de tráfego usando o agente de chat do CRM,
**Quero** que o agente sempre informe quando os dados de Meta Ads foram coletados e me avise quando estiverem desatualizados ou houver falha de sync,
**Para que** eu possa confiar nas métricas reportadas e identificar rapidamente quando um cron falhou antes de tomar decisões com base em dados defasados.

---

## Context

### O Problema Atual

O contexto Meta Ads injetado no agente (`context-builder.ts:135`) exibe apenas:

```
CONTEXTO META ADS — Gerado: ${today}
```

onde `today = new Date()` (linha 71) — ou seja, **a data de montagem do contexto**, não a data em que o dado foi puxado da Meta. Dados D-1 dependem do sucesso dos crons diários; se um cron falhou há 48h, o agente reporta o dado desatualizado como se fosse recente.

A infraestrutura de proveniência **já existe no banco** mas não é lida pelo context-builder:

| Fonte | Coluna / Tabela | Significado |
|---|---|---|
| `meta_insights_daily` | `synced_at` (migration 045) | Quando o insight foi gravado no banco (por cron) |
| `meta_ad_accounts` | `last_synced_at` | Última sync de entidades da conta |
| `meta_sync_log` | `started_at`, `finished_at`, `status`, `error_message` | Registro de cada execução de cron |

O `AGENT_SYSTEM_PROMPT` (`system-prompt.ts`) não contém nenhuma instrução sobre datação de coleta, staleness ou citação de fonte — confirmado por busca (zero matches para `synced`/`coleta`/`defasado`/`fonte`/`stale`/`recência`).

### Threshold de Staleness

Default: **~36h**. Dado D-1 é puxado diariamente; se a última sync bem-sucedida tiver mais de 36h, pelo menos um ciclo diário falhou. O threshold é definido como constante em `context-builder.ts` para fácil ajuste futuro.

### Tratamento de `meta_sync_log` vazio

Primeira execução ou org nova podem não ter registros em `meta_sync_log`. Nesse caso, exibir `"recência indisponível"` — nunca inventar uma data de coleta (NFR-OBS-1).

---

## Acceptance Criteria

- [x] **AC1 (Bloco de proveniência no contexto):** O `context-builder.ts` injeta, logo após o cabeçalho Meta Ads, um bloco de proveniência contendo: (a) `MAX(synced_at)` dos registros de `meta_insights_daily` da janela de datas consultada para a org; (b) `meta_ad_accounts.last_synced_at` da org; (c) `status` e `finished_at` do registro mais recente de `meta_sync_log` para a org. O bloco substitui ou complementa o atual `Gerado: ${today}` (que passa a ser mantido apenas como data de montagem, claramente identificado como tal).

- [x] **AC2 (Recência baseada na janela consultada):** O `MAX(synced_at)` é calculado sobre os registros efetivamente lidos na janela de datas do contexto (e.g., últimos 30 dias), não sobre toda a tabela — garantindo que a recência reportada reflete o dado que o agente tem em mãos (NFR-ACC-1).

- [x] **AC3 (Meta sync log vazio → recência indisponível):** Quando `meta_sync_log` não tem registros para a org (ou a query falha), o bloco exibe `"recência indisponível"` sem propagar erro nem inventar data (NFR-OBS-1).

- [x] **AC4 (Instrução de datação no system prompt):** O `AGENT_SYSTEM_PROMPT` em `system-prompt.ts` inclui instrução explícita para o agente citar a data de coleta ao reportar métricas de Meta Ads (ex.: `"dados coletados via Meta API em {data}"`). A instrução não altera nenhuma outra regra de negócio existente no prompt.

- [x] **AC5 (Instrução de alerta de staleness):** O `AGENT_SYSTEM_PROMPT` instrui o agente a alertar o usuário de forma textual quando: (a) a última sync bem-sucedida está há mais de ~36h; ou (b) o último `meta_sync_log.status` indica erro. O alerta deve sugerir verificar o painel de integrações ou aguardar a próxima sincronização automática.

- [x] **AC6 (Isolamento multi-tenant):** Todas as queries de proveniência incluem filtro `WHERE org_id = <org_id_da_sessão>`. Nenhum dado de sync de uma org vaza para contexto de outra (NFR-TENANCY-1).

- [x] **AC7 (Custo de latência aceitável):** As queries de proveniência são executadas dentro do batch de montagem do contexto e cobertos pelo cache de 5min já existente no `context-builder.ts`. Não há round-trip extra ao banco após o cache estar quente (NFR-PERF-1).

- [x] **AC8 (Sem regressão):** O comportamento atual do agente (respostas, regras de negócio, formatação) permanece inalterado. A proveniência é informação adicional, não substituição de conteúdo existente (NFR-COMPAT-1).

- [x] **AC9 (TypeScript + ESLint):** `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story. ESLint → zero erros.

---

## Tasks / Subtasks

### @dev (Dex)

- [x] **T1 — Criar helper `buildProvenanceBlock` em `context-builder.ts` (AC1, AC2, AC3, AC6)**
  - [x] Query 1: `SELECT MAX(synced_at) FROM meta_insights_daily WHERE org_id = $orgId AND date >= $startDate AND date <= $endDate` — recência dos dados da janela
  - [x] Query 2: `SELECT last_synced_at FROM meta_ad_accounts WHERE org_id = $orgId ORDER BY updated_at DESC LIMIT 1` — última sync de entidades
  - [x] Query 3: `SELECT status, finished_at, error_message FROM meta_sync_log WHERE org_id = $orgId ORDER BY started_at DESC LIMIT 1` — último registro de cron
  - [x] Tratar resultado NULL de cada query de forma independente (NFR-OBS-1: qualquer ausência → campo específico exibe "indisponível")
  - [x] Tratar `meta_sync_log` vazio → campo `ultimoSync: "recência indisponível"` (AC3)
  - [x] Calcular `isStale: boolean` — `finished_at` mais de `STALENESS_THRESHOLD_HOURS = 36` horas atrás (ou sync com status de erro)
  - [x] Retornar objeto tipado `ProvenanceBlock { maxSyncedAt, lastAccountSync, lastSyncStatus, lastSyncFinishedAt, isStale, isError }`

- [x] **T2 — Integrar `buildProvenanceBlock` ao fluxo de montagem do contexto (AC1, AC7)**
  - [x] Executar as 3 queries de proveniência dentro do `Promise.all` existente (ou batch equivalente) para não adicionar round-trips sequenciais
  - [x] Incluir o resultado no cache de 5min já existente — o bloco de proveniência deve expirar junto com o restante do contexto
  - [x] Substituir/complementar a linha `CONTEXTO META ADS — Gerado: ${today}` (l.135) com o bloco formatado, mantendo `today` como "data de montagem" claramente rotulado

- [x] **T3 — Formatar o bloco de proveniência para o contexto texto (AC1, AC2)**
  - Formato sugerido no bloco de contexto:
    ```
    [PROVENIÊNCIA DOS DADOS META ADS]
    Dados coletados da Meta API em: {maxSyncedAt | "indisponível"}
    Última sync de contas: {lastAccountSync | "indisponível"}
    Último ciclo de sincronização: {lastSyncStatus} em {lastSyncFinishedAt | "indisponível"}
    Dados defasados (>36h): {sim | não}
    Data de montagem deste contexto: {today}
    ```

- [x] **T4 — Atualizar `AGENT_SYSTEM_PROMPT` em `system-prompt.ts` (AC4, AC5)**
  - [x] Adicionar seção de instrução de proveniência (ex.: após as regras de análise de métricas)
  - [x] Instrução de datação: agente DEVE citar a data de coleta ao reportar qualquer métrica Meta Ads
  - [x] Instrução de alerta: se `Dados defasados: sim` OU `Último ciclo: error`, o agente DEVE alertar o usuário antes de reportar os números
  - [x] NÃO alterar nenhuma regra de negócio ou persona existente no prompt

- [x] **T5 — Testes Vitest para a lógica de proveniência (AC3, AC6)**
  - [x] Criar `packages/web/src/lib/agent/__tests__/provenance.test.ts`
  - [x] Caso: `synced_at` disponível → bloco com data correta
  - [x] Caso: `synced_at` NULL (sem dados na janela) → "indisponível"
  - [x] Caso: `meta_sync_log` vazio → "recência indisponível"
  - [x] Caso: `status = 'error'` → `isError = true`
  - [x] Caso: `finished_at` com mais de 36h → `isStale = true`
  - [x] Caso: `finished_at` com menos de 36h → `isStale = false`
  - [x] Executar `pnpm --filter @trifold/web test src/lib/agent/__tests__/provenance.test.ts` → todos passam (12 testes)

- [x] **T6 — Type-check + lint (AC9)**
  - [x] `pnpm --filter @trifold/web type-check` → zero erros nos arquivos desta story
  - [x] ESLint → zero erros nos arquivos desta story

---

## Dev Notes

### Arquivos-Chave

| Arquivo | Ação | Âncoras |
|---|---|---|
| `packages/web/src/lib/agent/context-builder.ts` | MODIFICAR | L71 (`today`), L135 (`Gerado: ${today}`), L77/200 (`meta_campaigns`), L81/210/218 (`meta_insights_daily`), L88/225 (`meta_alerts`), L96/233 (`leads`), L239 (`meta_insights_placement_daily`) — cache 5min existente |
| `packages/web/src/lib/agent/system-prompt.ts` | MODIFICAR | `AGENT_SYSTEM_PROMPT` — adicionar seção de proveniência sem alterar regras existentes |
| `packages/web/src/app/api/agent/chat/route.ts` | VERIFICAR (não modificar) | Endpoint de chat — confirmar que o contexto montado chega íntegro ao Anthropic |
| `packages/web/src/lib/agent/__tests__/provenance.test.ts` | CRIAR | Novos testes Vitest |

### Schema das Tabelas de Proveniência

```sql
-- meta_insights_daily (migration 015 + 045)
SELECT MAX(synced_at)
FROM meta_insights_daily
WHERE org_id = $orgId
  AND date >= $startDate
  AND date <= $endDate;
-- Índices disponíveis: (org_id, level, date DESC), UNIQUE (org_id, level, entity_id, date)

-- meta_ad_accounts (migration 015)
SELECT last_synced_at
FROM meta_ad_accounts
WHERE org_id = $orgId
ORDER BY updated_at DESC
LIMIT 1;

-- meta_sync_log (migration 015)
SELECT status, finished_at, error_message
FROM meta_sync_log
WHERE org_id = $orgId
ORDER BY started_at DESC
LIMIT 1;
-- Sem resultado = "recência indisponível"
```

### Padrão de Supabase no Agente

O `context-builder.ts` usa o cliente Supabase já configurado na camada do agente. Seguir o padrão de queries existentes (sem mudar para `service_role` — as tabelas `meta_*` têm RLS por `org_id`). Usar `.maybeSingle()` onde aplicável (nunca `.single()` — lança erro em 0 linhas).

### Estrutura do Cache de 5min

O context-builder.ts mantém um cache in-memory de 5 minutos. As queries de proveniência DEVEM ser incluídas no mesmo `Promise.all` que busca os dados de campanha, para que o resultado inteiro seja cacheado junto e não haja round-trips extras após o primeiro aquecimento.

### Constante de Threshold

Definir `const STALENESS_THRESHOLD_HOURS = 36` no topo de `context-builder.ts` (ou em arquivo de constantes do agente) para facilitar ajuste futuro sem alterar lógica.

### Sem DDL

Esta story é **apenas TypeScript** — zero migrations SQL. Lê apenas colunas/tabelas já existentes.

### Testing

- Framework: **Vitest** (não Jest)
- Localização: `packages/web/src/lib/agent/__tests__/provenance.test.ts`
- Padrão: funções puras testadas com dados em memória — mock leve de Supabase apenas onde necessário
- Comando: `pnpm --filter @trifold/web test src/lib/agent/__tests__/provenance.test.ts`

---

## Dev Agent Record

### Agent Model Used
- Dex (Builder) — Opus 4.8 (1M), YOLO mode

### File List

**Criados:**
- `packages/web/src/lib/agent/__tests__/provenance.test.ts` — 12 testes Vitest (pura, sem mock de Supabase)

**Modificados:**
- `packages/web/src/lib/agent/context-builder.ts` — constante `STALENESS_THRESHOLD_HOURS`, tipos `ProvenanceQueryResult`/`ProvenanceBlock`, funções puras `computeProvenance` + `formatProvenanceBlock`, helper `safeProvenanceData`; 3 queries de proveniência integradas ao `Promise.all` de `buildGlobalContext`; header `CONTEXTO META ADS` agora emite o bloco `[PROVENIÊNCIA DOS DADOS META ADS]`
- `packages/web/src/lib/agent/system-prompt.ts` — nova seção "## Proveniência e recência dos dados (obrigatório)" (datação + alerta de staleness/erro), aditiva, sem alterar regras existentes

**Verificado (não modificado):**
- `packages/web/src/app/api/agent/chat/route.ts` — confirma que `contextText` (mídia) chega íntegro ao Anthropic via `system: ${AGENT_SYSTEM_PROMPT}\n\n---\n\n${contextText}`. O bloco de proveniência flui dentro de `mediaContext`.

### Completion Notes

- **Arquitetura:** lógica isolada em funções puras (`computeProvenance`, `formatProvenanceBlock`) para testabilidade sem mock de banco, seguindo o padrão de `window-status.ts`. As queries vivem em `buildGlobalContext` (efeito colateral), a lógica/formatação são puras (testáveis em memória).
- **AC2 (MAX na janela):** implementado como `order("synced_at", desc).limit(1).maybeSingle()` com os MESMOS filtros de data da janela da query de insights — equivale a `MAX(synced_at)` sobre a janela, sem RPC nova. Após a reconciliação com o `main` (ver nota de reconciliação abaixo), a janela é `startDate..endDate` do `DateWindow` (52-8), não mais `dateNdAgo..today`.
- **NFR-OBS-1 (fail-transparente):** cada query de proveniência é envolvida por `safeProvenanceData` (resolve `data` ou `null`, engole erro) — uma falha de proveniência NUNCA derruba a montagem do contexto nem inventa recência. Campo ausente → "indisponível"; `meta_sync_log` vazio → "recência indisponível".
- **AC7 (cache/latência):** as 3 queries entram no `Promise.all` existente e o bloco faz parte do `text` cacheado (TTL 5min) — zero round-trip extra após cache quente.
- **Staleness:** `isStale` deriva de `finished_at` do último ciclo (> 36h). `isError` deriva de `status === 'error'`. Os dois são independentes; o system prompt instrui alertar em qualquer um dos casos. Ciclo `running` (finished_at null) não marca stale sem evidência.
- **[DECISÃO DE ESCOPO]** A proveniência foi adicionada apenas a `buildGlobalContext` (header `CONTEXTO META ADS`, anchor l.135 das AC). `buildCampaignContext` (header `CONTEXTO CAMPANHA`) NÃO recebeu o bloco — as AC referenciam explicitamente o cabeçalho Meta Ads global. Adicionar ao contexto de campanha seria fora do escopo desta story (Article IV). **Débito técnico sugerido:** estender proveniência ao contexto de campanha em story futura, se desejado.
- **Validações:** Vitest 12/12 passam; suíte completa 565/565 (sem regressão). `type-check` e `lint` com zero erros nos arquivos da story (warning pré-existente de `today` não usado em `buildCampaignContext` — linha 376, não tocado por esta story; erros de type-check pré-existentes em `email-templates/visual-editor.tsx`, módulo `react-email-editor`, não relacionados).
- **CodeRabbit:** Disabled para esta story (validação manual pelo @architect, conforme metadata).
- **[RECONCILIAÇÃO COM main / modelo DateWindow]** A implementação original foi feita contra uma base do `main` ~299 commits desatualizada. Enquanto isso, a Story 52-8 ("period chips") refatorou `buildGlobalContext` para receber `window?: DateWindow` (`startDate`/`endDate`) e REMOVEU a variável local `dateNdAgo`. No rebase para o `main` atual, a query de proveniência P1 (MAX(synced_at)) ainda referenciava `dateNdAgo`, causando `TS2552: Cannot find name 'dateNdAgo'`. **Correção:** a P1 passou a filtrar por `startDate`/`endDate` — a MESMA janela que a query de insights de campanha usa agora —, preservando exatamente a semântica do AC2 ("MAX(synced_at) na janela consultada"): a recência reportada reflete o período que o agente está efetivamente analisando (não uma janela fixa de N dias). A função standalone `fetchProvenance(days=30)` (Story 76-3, usada pelo banner/hook) é um caminho independente que computa sua própria `dateNdAgo` a partir do param `days` e NÃO foi afetada. Revisados também `system-prompt.ts` (seção de proveniência apenas anexada após a seção de períodos da 52-8, sem sobrescrever), `agent-chat-panel.tsx` (banner integrado limpo, period-chips intactos), `sync-status-banner.tsx`, `use-provenance-status.ts` e `context-meta/route.ts` — nenhuma outra divergência semântica encontrada além do `dateNdAgo`. Testes puros de proveniência não dependem da janela da query SQL, então cobertura dos 4 cenários (fresco, >36h, erro, sync_log vazio) permanece intacta. Validações reais pós-reconciliação: `type-check` OK (só os 3 erros pré-existentes de `react-email-editor` em `visual-editor.tsx`); `lint` zero erros nos arquivos do epic; Vitest 12/12 (proveniência) e suíte raiz 557/557.

---

## Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Recência global vs. janela — `MAX(synced_at)` de toda a tabela pode diferir da janela lida | AC2: filtrar `synced_at` pelo mesmo range de datas do contexto |
| R2 | Query de proveniência falha silenciosamente → agente afirma recência falsa | AC3 + NFR-OBS-1: try/catch em cada query; fallback "indisponível"; nunca inventar |
| R3 | Round-trips extras aumentam latência do chat | AC7: incluir no Promise.all e cache existente de 5min |
| R4 | Mudança de wording no system prompt altera comportamento existente | T4: só adicionar seção nova; não editar instruções preexistentes |

---

## Out of Scope

- Re-ingestão de dados (crons, date_preset, Graph API) — concern separado
- UI visual no chat (badge/banner) — isso é a Story 76-3
- Function-calling ou troca de provedor de IA
- Auditoria de índices — isso é a Story 76-2

---

## Definition of Done

- [x] AC1–AC9 marcados como completos
- [x] T1–T6 marcados como done
- [x] Testes Vitest passando (incluindo casos de `meta_sync_log` vazio e status de erro) — 12/12
- [ ] Agente, ao ser testado manualmente, cita a data de coleta ao reportar métricas Meta — pendente (teste manual/QA)
- [ ] @architect executou quality gate com verdict PASS — pendente
- [ ] @devops fez push — pendente

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-06-22 | v1.0 | Story criada — Epic 76, MUST, proveniência + staleness no context-builder e system-prompt | @sm (River) |
| 2026-06-22 | v1.1 | Implementação completa (T1–T6, AC1–AC9). Bloco de proveniência + alerta de staleness/erro; 12 testes Vitest; suíte 565/565. Status → Ready for Review | @dev (Dex) |
| 2026-06-22 | v1.2 | Quality gate executado — verdict CONCERNS (AC1-AC9 atendidas, validações verdes em runtime; débito de escopo: buildCampaignContext sem proveniência → follow-up) | @qa (Quinn) |
| 2026-06-23 | v1.3 | Reconciliação com o `main` atual (modelo `DateWindow` da 52-8): P1 de proveniência migrada de `dateNdAgo..today` para `startDate..endDate` (mesma janela dos insights), preservando AC2. type-check/lint/Vitest verdes (557/557 na raiz) | @dev (Dex) |

---

## QA Results

### Review Date: 2026-06-22

### Reviewed By: Quinn (Test Architect & Quality Advisor)

### Resumo

Story bem executada: lógica isolada em funções puras testáveis (`computeProvenance` / `formatProvenanceBlock`), efeitos colaterais (queries) confinados a `buildGlobalContext`, e fail-transparência genuína via `safeProvenanceData`. Todas as 9 AC foram verificadas no código real (não apenas no relatório do @dev) e as validações foram re-executadas por mim em runtime.

### 7 Quality Checks (AIOS)

| # | Check | Verdict | Nota |
|---|-------|---------|------|
| 1 | Code review (padrões, legibilidade) | PASS | Funções puras bem documentadas; segue padrão `window-status.ts`; tipos explícitos `ProvenanceQueryResult`/`ProvenanceBlock` |
| 2 | Unit tests (cobertura, passando) | PASS | 12/12 cobrem dado fresco, defasado >36h, erro de sync, sync_log vazio, ciclo running. Gap menor: AC6 só por inspeção (TEST-001) |
| 3 | Acceptance criteria (AC1–AC9) | PASS | Todas atendidas — ver rastreabilidade no gate file |
| 4 | No regressions | PASS | Suíte completa 565/565 (44 arquivos) verde |
| 5 | Performance (NFR-PERF-1) | PASS | 3 queries no mesmo `Promise.all`; bloco cacheado junto (TTL 5min); zero round-trip extra |
| 6 | Security / multi-tenancy | PASS | `.eq("org_id", orgId)` nas 3 queries + cache key por org; sem `service_role`; RLS preservada; sem injeção |
| 7 | Documentation | PASS | System prompt documenta o comportamento; story completa |

### Validações executadas por mim (não confiando só no @dev)

- `vitest run provenance.test.ts` → **12/12 passed**
- `vitest run` (suíte completa) → **565/565 passed, 44 arquivos** — sem regressão (AC8)
- `tsc --noEmit` (web) → **zero erros nos arquivos da story**. Há 3 erros TS pré-existentes e não-relacionados em `email-templates/visual-editor.tsx` (módulo `react-email-editor` ausente) — confirmados fora do diff
- `eslint` nos 3 arquivos → **zero erros**. 1 warning pré-existente (`today` não usado) em `buildCampaignContext:376`, fora do diff desta story (confirmado via `git show a9c4cb0`)

### Validação de destaque — AC2 e NFR-OBS-1

- **AC2 (recência da janela, não da tabela inteira):** verifiquei que a query P1 de proveniência usa **exatamente os mesmos filtros** da query de insights principal (`level="campaign"`, `gte(dateNdAgo)`, `lte(today)`) + `order synced_at desc` + `limit 1`. Logo `MAX(synced_at)` reflete o dado efetivamente em mãos. Genuinamente atendida, não só declarada.
- **NFR-OBS-1 (fail-transparente, nunca inventa recência):** `safeProvenanceData` resolve `data ?? null` e `.catch(() => null)` — uma falha de proveniência nunca derruba a montagem do contexto. `computeProvenance` jamais fabrica data; ciclo `running` (`finished_at` null) não marca stale sem evidência. Confirmado por teste e inspeção.

### Parecer sobre o débito técnico do `buildCampaignContext` (REQ-001)

A proveniência foi adicionada **apenas** a `buildGlobalContext`. Quando o usuário pergunta sobre uma **campanha específica**, o agente usa `buildCampaignContext` (header `CONTEXTO CAMPANHA`), que **não emite** o bloco de proveniência — e portanto a instrução de alerta de staleness/erro do system prompt fica sem dado para acionar nesse caminho. É um **gap funcional real**: o valor pleno da feature (alertar sobre dado defasado) não cobre 100% das interações do agente.

**Veredito sobre o débito: ACEITÁVEL como escopado, mas deve virar follow-up rastreado.**

Justificativa:
- As AC1–AC9 ancoram explicitamente o cabeçalho Meta Ads global (`context-builder.ts:135`). Nenhuma AC exige cobertura do contexto de campanha.
- Estender a `buildCampaignContext` sem AC seria **scope creep** — o @dev acertou ao não inventar escopo (Article IV — No Invention respeitado).
- O Epic 76 continua (esta story bloqueia a 76-3); o vínculo natural para a extensão é uma story futura, não um patch silencioso.

Recomendação: abrir story de follow-up no Epic 76 para levar o bloco de proveniência ao contexto de campanha. **Não bloqueia o merge desta story.**

### Article IV (No Invention)

PASS. A implementação está estritamente dentro do escopo das AC; nenhuma feature inventada. A decisão de não estender a `buildCampaignContext` é a aplicação correta do Article IV (evita invenção de escopo) e foi documentada como débito pelo @dev.

### Gate Status

Gate: CONCERNS → docs/qa/gates/76.1-provenancia-staleness-contexto-agente.yml

**Itens rastreados (não-bloqueantes):**
- REQ-001 (medium): proveniência ausente em `buildCampaignContext` → follow-up no Epic 76
- TEST-001 (low): AC6 (org_id) validada só por inspeção → considerar teste de integração em hardening futuro

**Recomendação de status:** aprovável para prosseguir ao @devops com ciência dos itens acima. As AC estão 100% atendidas e as validações verdes — os concerns são informativos/follow-up, não correções obrigatórias.
