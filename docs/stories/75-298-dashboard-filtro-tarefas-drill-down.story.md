# Story 75-298 — Dashboard do gerente: drill-down dos cards de tarefas (filtro `tasks=` em /dashboard/leads)

**Story ID:** 75-298
**Epic:** 75 (CRM Trifold) · **Status:** Done · **Estimativa:** S/M (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** fix de UX/consistência (número do card sem lista correspondente)

---

## Story

Como **gerente comercial (Joabe)**, quero **clicar no card "Tarefas Atrasadas" (e nos demais
cards de tarefas) do dashboard e ver exatamente os leads que compõem aquele número**, porque
hoje o clique cai na lista completa de leads e eu não tenho como saber quais são os atrasados.

Incidente que originou (11/08): dashboard mostrava **66 Tarefas Atrasadas**; o Marcos clicou,
pegou a lead Denise Duarte da lista e não achou tarefa nenhuma nela — porque a lista NÃO era
a dos 66 (a Denise tem zero tarefas). O contador foi auditado em prod e está CORRETO
(66 reproduzido via SQL; Roberto 53 · Thielly 11 · Ana Beatriz 1 · 1 sem dono).
O defeito é só o drill-down.

---

## Context

- **O contador**: RPC `get_broker_dashboard_counts` (última versão na mig 209) — conta **leads**
  (não tarefas) com ≥1 tarefa aberta (`lead_tasks.completed_at IS NULL`) e `due_at < hoje`
  (dia em `America/Sao_Paulo`). Base: `segmento='principal'` + `is_active` +
  `lost_reason IS NULL` + stage fora de `PERDIDO_STAGE_IDS`. Mesma régua para
  `para_hoje` (`due_at` ∈ hoje), `futuras` (`due_at` ≥ amanhã) e `sem_tarefas`
  (NOT EXISTS tarefa aberta).
- **O buraco**: os 4 cards de tarefas em `dashboard/page.tsx` (~linhas 120-123) linkam todos
  para `/dashboard/leads` **sem query param**, e `/dashboard/leads/page.tsx` **não tem filtro
  de tarefas** (`LeadsSearchParams` não conhece `tasks`).
- **O modelo pronto**: `/broker/leads/page.tsx` já implementa exatamente isto —
  `?tasks=atrasadas|para-hoje|futuras|sem-tarefas`: busca `lead_tasks` pendentes da org
  (**sem** filtrar `assigned_to` — tarefas do corretor gravam `assigned_to = NULL`,
  Story 75-42), bucketiza por `due_at` vs `todayStart`/`tomorrowStart` e filtra a lista por
  `Set` de `lead_id`, com chip de filtro ativo + botão × (labels em `TASK_LABELS`).
- **Precedente de "lista bate com card"**: Story 75-151 (`criados=hoje`) — quando o clique vem
  de um card, a lista RELAXA as exclusões de etapa para reproduzir o critério do card.
  Necessário aqui também, ver divergências abaixo.

### ⚠️ Divergências de critério (a razão de o fix não ser só "copiar do broker")

A view "ativos" de `/dashboard/leads` exclui `EM_ATENDIMENTO_EXCLUDED_IDS`
(= perdidos **+ acervo**: Corretores Antigos/Represamento). A RPC do card exclui **só**
`PERDIDO_STAGE_IDS` — o acervo CONTA (o funil mostra Represamento com 13 atrasadas, e elas
estão dentro dos 66). E a RPC ainda exige `lost_reason IS NULL`, filtro que a lista não usa
(removido de propósito no broker — escondia lead reativado com `lost_reason` residual,
ver 75-297 e [[project-corretor-contagens-perdidos]]).

**Decisão desta story:** com `tasks=` ativo, a lista espelha o critério da RPC
(exclui só `PERDIDO_STAGE_IDS`; aplica `lost_reason IS NULL`) — número bate HOJE, sem mexer
no contador. Alinhar a RPC à régua "perdido = ETAPA, nunca lost_reason" muda o número que o
gerente já conhece → **fora do escopo**, registrar como follow-up se o @po quiser.

### Decisão de desenho

1. **Novo param `tasks`** em `LeadsSearchParams` (whitelist:
   `atrasadas|para-hoje|futuras|sem-tarefas`; valor fora dela = ignorado, padrão das
   whitelists de `calor`/`qualificacao`).
2. **Filtro server-side por ids**: com `tasks` ativo, buscar `lead_tasks`
   (`org_id`, `completed_at IS NULL`, select `lead_id, due_at`), bucketizar como no broker e
   aplicar `.in("id", ids)` em `query` E `countQuery` (paginação continua funcionando);
   `sem-tarefas` = `.not("id", "in", <ids com tarefa aberta>)`. Cálculo de buckets extraído
   para helper puro compartilhado (ex.: `lib/leads/task-buckets.ts`) e REUSADO pelo
   `/broker/leads` — hoje a lógica vive inline lá ([[feedback-consultar-fonte-nao-duplicar-constante]];
   testável sem DOM, [[feedback-projeto-sem-teste-de-componente]]).
   - ⚠️ **@po 12/08 — teto de 1000 do PostgREST (must-fix).** O fetch de `lead_tasks` do
     broker (`/broker/leads/page.tsx:70-76`) NÃO pagina: o PostgREST corta em 1000 linhas
     **em silêncio** (já queimou 2x: 75-269/75-273 e 75-278). Com o corte, os buckets vêm
     incompletos e o AC2 falha sem erro. **Obrigatório** paginar reusando
     `fetchAllLeads()` de `lib/analytics/fetch-all-leads.ts` (é genérico, só o nome fala de
     leads) com `.order("id")` — `.range()` exige coluna ÚNICA para ser estável.
   - ⚠️ **URL do `.in`/`.not.in` (must-fix).** ~280 ids × 37 chars ≈ 10 KB de query string,
     acima do teto de header/URL típico (8 KB) → risco de 414/431 no `sem-tarefas`.
     Medir ANTES de escrever código (T0) e escolher a estratégia com número na mão
     ([[feedback-anotacao-backlog-e-hipotese]]).
   - Guarda de lista vazia: `.not("id","in","()")` é SQL inválido. Se o conjunto de ids for
     vazio, pular o filtro (`sem-tarefas` → sem exclusão; `atrasadas/para-hoje/futuras` →
     lista vazia sem chamar o PostgREST com `()`).
   - `due_at IS NULL`: tarefa aberta sem vencimento NÃO entra em nenhum dos 3 buckets, mas
     CONTA como "tem tarefa" (logo, sai do `sem-tarefas`). É exatamente o que a RPC faz
     (`NOT EXISTS` ignora `due_at`) e o que o broker já faz — o helper deve preservar isso e
     ter teste para o caso.
3. **Fuso** — ⚠️ **@po 12/08: a premissa original estava ERRADA, corrigida aqui.**
   NÃO existe bug de fuso a consertar. O servidor já roda em `America/Sao_Paulo` desde a
   Story 75-33 (`packages/web/src/instrumentation.ts` seta `process.env.TZ` no boot do
   runtime Node), então o `new Date()` + `setHours(0,0,0,0)` do `/broker/leads/page.tsx:40-41`
   JÁ é meia-noite de Brasília — idêntico ao
   `date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')` da RPC. A mesma premissa está
   documentada em `lib/broker/task-date-range.ts:1-8`. Não reimplementar aritmética de fuso:
   seria mexer no que funciona ([[feedback-nao-quebrar-o-que-funciona]]).
   Consequência de desenho: o helper é **puro e sem relógio** — recebe as fronteiras por
   parâmetro (`bucketByTaskDue(tasks, { todayStart, tomorrowStart })`) e quem chama passa
   `startOfDay(new Date())`, como hoje. Isso é obrigatório para o teste: o **vitest não
   executa `instrumentation.ts`**, logo não herda `TZ` — um helper que lesse o relógio
   passaria/falharia conforme a máquina.
4. **Cards linkam filtrado** (`dashboard/page.tsx`):
   Atrasadas → `/dashboard/leads?tasks=atrasadas` · Para Hoje → `?tasks=para-hoje` ·
   Futuras → `?tasks=futuras` · Total Sem Tarefas → `?tasks=sem-tarefas`.
5. **Chip de filtro ativo** na lista ("Tarefas atrasadas" + ×, como broker) e `tasks`
   preservado em `buildPageHref` (paginação não derruba o filtro).
   - ⚠️ **@po 12/08 — o `<form method="get">` da busca (must-fix).**
     `dashboard/leads/page.tsx:305-322` reescreve a query string INTEIRA no submit; os filtros
     só sobrevivem porque estão no mapa de `<input type="hidden">`. **`tasks` PRECISA entrar
     nesse mapa**, senão buscar por nome dentro do filtro apaga o filtro calado — é
     literalmente o bug do QA da 75-236, comentado na linha 307. Sem isso o AC4 não passa.
   - `LeadFilters` (`components/lead-filters.tsx:82-86`) reconstrói a URL a partir de
     `searchParams.toString()`, então preserva `tasks` sozinho ✅. "Limpar filtros"
     (linhas 195-207) apaga só os params conhecidos → NÃO limpa `tasks` (por desenho: quem
     limpa é o × do chip).
   - **Tema**: o chip do broker usa `bg-orange-500/20 text-orange-400` sem variante clara —
     `/broker` tem dívida dark-hardcoded. Em `/dashboard` o chip DEVE nascer com par
     claro/escuro (`dark:`), conforme [[feedback-theme-convention]]. Copiar o markup do broker
     verbatim é regressão visual no tema claro.
6. **Precedência entre modos** (não estava definida): `tasks` combina com `criados=hoje` e é
   IGNORADO quando `view=perdidos` (os dois critérios são opostos — a RPC exclui perdidos por
   etapa). Com `view=perdidos`, não renderizar o chip nem o filtro.
7. **Qual número tem de bater** (AC2): é o contador de resultados do filtro —
   `<p>{totalCount} leads</p>` de `dashboard/leads/page.tsx:361-371`. Os contadores das ABAS
   ("Em atendimento (N)" / "Perdidos (N)", linhas 216-222 e 290-301) são totais globais sem
   filtro e **continuam globais** — não confundir. Se der pouco custo, deixar explícito na
   linha-resumo qual filtro está ativo (ex.: "66 leads · tarefas atrasadas"), no espírito da
   quebra por situação que a 75-151 já faz ali.

---

## Acceptance Criteria

- [ ] **AC1 — link do card.** No dashboard do gerente (roles `gerente-comercial`/`sdr`), cada
  um dos 4 cards de tarefas navega para `/dashboard/leads?tasks=<valor>` correspondente.
- [ ] **AC2 — número bate.** Com `?tasks=atrasadas`, o contador de resultados do filtro
  (`totalCount`, a linha "N leads" — `dashboard/leads/page.tsx:361-371`, NÃO os contadores das
  abas) = valor do card `atrasadas` da RPC no mesmo instante. Idem para os outros 3 valores.
  Validar em PROD com leitura direta (SQL da RPC vs lista), não só em dev
  ([[feedback-nao-quebrar-o-que-funciona]]).
- [ ] **AC3 — lead certo.** Abrindo um lead da lista `tasks=atrasadas`, a tela do lead mostra
  ≥1 tarefa pendente vencida. (Caso de teste real: Cassia Panerari ∈ 66; Denise Duarte ∉.)
- [ ] **AC4 — filtros compostos e paginação.** `tasks` convive com `search`/`stage_id`/
  `broker_id`/etc. e sobrevive (a) à troca de página, (b) ao **submit do form de busca**
  (hidden input) e (c) à troca de filtro no `LeadFilters`; chip com × remove só o `tasks`.
  Com `view=perdidos`, `tasks` é ignorado e o chip não aparece.
- [ ] **AC5 — sem regressão.** Sem `tasks` na URL, a lista se comporta exatamente como hoje
  (view ativos/perdidos, `criados=hoje` intactos). `/broker/leads` continua batendo com os
  cards do corretor após a extração do helper — **zero mudança de comportamento lá**
  (o fuso já estava certo; ver Decisão de desenho #3).
- [ ] **AC6 — helper puro e completo.** Teste unitário de `task-buckets` cobrindo, com
  fronteiras injetadas (sem depender do `TZ` da máquina): (a) `due_at` ontem → `atrasadas`;
  (b) `due_at` hoje 23:00 → `para-hoje` (não `atrasadas`); (c) `due_at` amanhã 00:00 →
  `futuras`; (d) `due_at NULL` → nenhum bucket, mas conta como "tem tarefa";
  (e) lead com 2 tarefas em buckets diferentes aparece nos dois (a RPC usa
  `COUNT(DISTINCT l.id)` por bucket, os conjuntos se sobrepõem por desenho).
- [ ] **AC7 — conjunto completo de tarefas.** O fetch de `lead_tasks` pagina (sem teto de 1000)
  e o número do AC2 se mantém com o volume real de prod. Evidência: contagem de linhas
  `lead_tasks` abertas medida em prod (T0) registrada nas Dev Notes.

## Escopo

- **NÃO mexe** na RPC `get_broker_dashboard_counts` nem nos números dos cards.
- **NÃO adiciona** o filtro nos badges do Funil da Equipe (`get_broker_funnel_stats`) —
  candidato natural a follow-up (`?tasks=atrasadas&stage_id=`), fora daqui.
- **NÃO cobre** o mundo IMOB (cards de tarefas não existem lá).

## Dependencies

- Nenhuma migration. Tudo app-side (Next.js server components).
- RLS de `lead_tasks` ✅ VERIFICADA em prod (11/08): `lead_tasks_select`/`lead_tasks_manage`
  usam só `org_id = user_org_id()` — o gerente lê todas as tarefas da org com o client de
  sessão, sem precisar de admin client.

## Riscos

- 🔴 **Teto de 1000 do PostgREST (elevado a must-fix pelo @po)**: o fetch de `lead_tasks`
  precisa paginar (`fetchAllLeads` + `.order("id")`). Corte silencioso = AC2 falha sem erro
  nenhum aparecer. Já mordeu o projeto em 75-269/75-273 e 75-278.
- 🔴 **Lista de ids no PostgREST (elevado a must-fix)**: `sem-tarefas` inverte o filtro com
  `.not(... in ...)` de ~centenas de ids (~280 leads com tarefa aberta ≈ 10 KB de URL,
  ACIMA do teto usual de 8 KB). Medir em T0 antes de codar; se estourar, RPC dedicada
  (migration entra no escopo) — **nunca** paginação client-side.
- **Divergência futura RPC × lista**: os dois critérios ficam duplicados (SQL vs TS). Deixar
  comentário cruzado nos dois pontos apontando um para o outro.
- **Regressão do form de busca**: `tasks` fora do mapa de hidden inputs repete o bug do QA
  da 75-236 (filtro apagado ao buscar). Coberto por AC4.

## Tasks

- [x] **T0 (AC7, antes de codar)** — Medir em prod (leitura SQL via Management API, ver
  [[feedback-terminal-nao-navegador]]): (a) `COUNT(*)` de `lead_tasks` com
  `completed_at IS NULL` na org; (b) `COUNT(DISTINCT lead_id)` idem. Registrar nas Dev Notes
  e decidir: (a) < 1000 → ainda assim paginar (à prova de crescimento); ids em URL ≤ ~6 KB →
  segue app-side; acima → RPC dedicada + migration (avisar o @po, muda o escopo).
  → **FEITO. Decisão: segue app-side, SEM migration.** A premissa de ~8 KB era falsa; teto
  real medido ≈ 24 KB. Ver "T0 — medição em prod" nas Dev Notes.
- [x] T1 (AC6) — Helper puro `packages/web/src/lib/leads/task-buckets.ts`: recebe as tarefas e
  `{ todayStart, tomorrowStart }` (sem ler relógio nem fuso) e devolve os 4 conjuntos
  (`atrasadas`, `paraHoje`, `futuras`, `comTarefa`). Testes em `task-buckets.test.ts`.
- [x] T2 (AC1..AC5) — `/dashboard/leads/page.tsx`: param `tasks` em `LeadsSearchParams`
  (whitelist, valor inválido ignorado), fetch PAGINADO de `lead_tasks`, filtro em
  `query`+`countQuery` (com guarda de lista vazia), 3º ramo de exclusão de stage no modo
  `tasks` (só `PERDIDO_STAGE_IDS`) + `lost_reason IS NULL`, precedência com
  `view=perdidos`/`criados=hoje`, chip de filtro ativo com par claro/escuro, `tasks` no
  `buildPageHref` **e** no mapa de hidden inputs do `<form method="get">`.
- [x] T3 (AC1) — `dashboard/page.tsx:120-123`: hrefs dos 4 cards de tarefas com `?tasks=`.
  (Os cards "Novos Disponíveis"/"Já Trabalhados", linhas 118-119, ficam como estão — fora do
  escopo, ver Escopo.)
- [x] T4 (AC5) — `/broker/leads/page.tsx:95-114`: substituir a bucketização inline pelo helper.
  **Refactor puro: zero mudança de comportamento** (o fuso já estava correto).
- [x] T5 (AC2, AC7) — Validação em prod pós-deploy: card vs lista para os 4 filtros
  (leitura SQL da RPC no mesmo instante), + smoke do AC3 com um lead real.
  → **CUMPRIDO 12/08 (prints do Marcos, logado como o gerente Joabe):** card e lista batendo
  no mesmo instante em `sem-tarefas` **292/292**, `atrasadas` **49/49**, `para-hoje` **28/28**;
  chip com × e rótulo no `totalCount` corretos; abas globais conforme Decisão #7. O número
  andou de 11/08 (66) para 12/08 (49) com card e lista JUNTOS — comportamento esperado.
  `futuras` (167) não foi printado (mesmo mecanismo; equivalência SQL 167/167 já provada).

## Dev Notes

- IDs de referência do critério da RPC: exclui `'00000000-0000-0000-0001-000000000008'`
  (Perdido) e `'95327bd7-3e88-4038-aa16-250a74ab085c'` (Não Qualificado) = `PERDIDO_STAGE_IDS`
  de `lib/leads/stage-filters.ts` — importar a constante, nunca literal
  ([[feedback-consultar-fonte-nao-duplicar-constante]]).
- Auditoria de 11/08 (dados p/ smoke): 66 leads, 1 tarefa aberta vencida cada; mais antiga
  16/06; PDF entregue ao gerente em `~/Desktop/tarefas-atrasadas-2026-08-11.pdf`.

### Mapa de arquivos (conferido pelo @po em 12/08, contra o código de `main` @ d0e7256d)

| Arquivo | O que já existe | O que muda |
|---|---|---|
| `packages/web/src/app/dashboard/page.tsx` | 6 cards do gerente, linhas 118-123, TODOS `href: "/dashboard/leads"`; RPC chamada na linha 68 com `p_broker_id: null`; gate `isGerenteComercial = ["gerente-comercial","sdr"]` na linha 25 | hrefs das linhas 120-123 |
| `packages/web/src/app/dashboard/leads/page.tsx` | `LeadsSearchParams` (33-47) SEM `tasks`; `buildPageHref` (51-69); ramos de exclusão de stage (113-120); form GET com hidden inputs (305-336); `totalCount` (256, render 361-371) | param, fetch, filtro, chip, hidden input, buildPageHref |
| `packages/web/src/app/broker/leads/page.tsx` | `TASK_LABELS` (18-23); fetch de `lead_tasks` (70-76, **sem paginação**); bucketização inline (95-114); chip (251-262) | bucketização → helper |
| `packages/web/src/lib/leads/task-buckets.ts` | **não existe** | novo + teste |
| `packages/web/src/lib/leads/stage-filters.ts` | `PERDIDO_STAGE_IDS` / `ACERVO_STAGE_IDS` / `EM_ATENDIMENTO_EXCLUDED_IDS` | — (importar) |
| `packages/web/src/lib/analytics/fetch-all-leads.ts` | `fetchAllLeads()` genérico (75-269) | — (REUSAR na paginação) |
| `supabase/migrations/209_hotfix_rls_org_scope.sql:313-359` | versão vigente de `get_broker_dashboard_counts` | — (não tocar) |
| `supabase/migrations/053_lead_tasks.sql` | schema + RLS `org_id = user_org_id()` (linhas 29-33) ✅ confirma a seção Dependencies | — |

### T0 — medição em prod (@dev, 2026-08-12, ref `dsopqkqjkmhytudaaolv`, só SELECTs)

**(a) Volume de `lead_tasks` abertas** (`completed_at IS NULL`, org única):

| Métrica | Valor |
|---|---|
| `COUNT(*)` tarefas abertas | **272** |
| `COUNT(DISTINCT lead_id)` | **270** |
| dessas, `due_at IS NULL` | 24 |
| leads com tarefa aberta **dentro da base da lista** (segmento principal + ativo + `lost_reason IS NULL` + etapa fora de `PERDIDO_STAGE_IDS`) | **266** |

272 < 1000 hoje, mas o fetch **pagina de qualquer forma** via `fetchAllLeads()` + `.order("id")`
(à prova de crescimento — o corte do PostgREST é silencioso). **AC7 ✅**

**(b) Tamanho da URL do `.in`/`.not.in` — a premissa da story estava ERRADA.**

A story projetava "~280 ids ≈ 10 KB, acima do teto usual de 8 KB → risco de 414/431". O teto de
8 KB não foi medido, foi presumido ([[feedback-anotacao-backlog-e-hipotese]]). Medi o teto REAL
do gateway de prod com `GET /rest/v1/leads?id=not.in.(<n uuids falsos>)` (uuids sintéticos,
nenhum dado lido, `apikey` publishable → RLS devolve vazio):

| ids | tamanho da URL | HTTP em prod |
|---|---|---|
| 1 | 121 B | **200** |
| 266 (pior caso real) | 9.926 B (~9,7 KB) | **200** |
| 400 | 14.884 B | **200** |
| 500 | 18.584 B | **200** |
| 600 | 22.284 B (~21,8 KB) | **200** |
| 700 | 25.984 B (~25,4 KB) | 400 |
| 1000 | 37.084 B | 400 |

Teto real ≈ **24 KB / ~640 uuids**, não 8 KB. O pior caso de hoje (`sem-tarefas`, 266→270 ids)
passa com **~2,3× de folga**, comprovado com um 200 real em prod. E a falha, se algum dia
chegar lá, é **ruidosa** (400 do PostgREST, erro propagado), não silenciosa como o corte de 1000.

**Decisão: implementação app-side, SEM migration/RPC dedicada.** O gatilho de escalar para RPC
(URL estourando o limite) NÃO foi atingido — a medição derrubou a hipótese que o criava.
Registrado como follow-up: se o volume de leads com tarefa aberta passar de ~500, trocar o
`sem-tarefas` por RPC dedicada (nunca paginação client-side).

**(c) Equivalência card × lista, medida em prod ANTES do deploy (evidência de AC2).**
Comparei o retorno REAL de `get_broker_dashboard_counts(org, null)` contra o número que o
filtro novo produz (buckets vindos de todas as tarefas abertas da org, depois
interseção/exclusão com a base da lista no modo `tasks=`):

| filtro | RPC (card) | lista (`totalCount`) |
|---|---|---|
| `atrasadas` | 49 | **49** ✅ |
| `para-hoje` | 28 | **28** ✅ |
| `futuras` | 167 | **167** ✅ |
| `sem-tarefas` | 291 | **291** ✅ |

(49 ≠ os 66 de 11/08 porque tarefas foram concluídas no intervalo — o card e a lista se movem
juntos, que é o ponto.) Soma de conferência: 266 com tarefa + 291 sem = 557 = base total ✅

**(d) Dados de smoke do AC3** (conjunto `atrasadas` de hoje, 49 leads): **Cassia Panerari ∈**
o conjunto ✅ · **Denise Duarte ∉** o conjunto ✅ e tem **0** tarefas abertas — exatamente o que
a story previu a partir da auditoria de 11/08.

## Testing

- **Runner**: `vitest` na RAIZ do monorepo (`pnpm test` → `vitest run`). Não há
  `vitest.config.*`: valem os includes padrão, e os testes de `packages/web/src/lib/**` já
  rodam assim (ex.: `lib/leads/calor.test.ts`).
- **Local do teste novo**: `packages/web/src/lib/leads/task-buckets.test.ts` (ao lado do
  helper, convenção do diretório).
- **Sem DOM**: o projeto não tem jsdom — a decisão testável tem de morar no helper puro, não
  no componente ([[feedback-projeto-sem-teste-de-componente]]).
- O teste NÃO pode depender do fuso da máquina: as fronteiras entram por parâmetro
  (o vitest não roda `instrumentation.ts`).
- Gates: `pnpm test` · `pnpm type-check` (o script chama-se `type-check`, com hífen) ·
  `pnpm lint`.

## File List

**Criados (2)**

- `packages/web/src/lib/leads/task-buckets.ts` — helper puro: whitelist `TASK_FILTER_VALUES` +
  `parseTaskFilter`, rótulos `TASK_FILTER_LABELS`, `taskBucketBoundaries(now?)`,
  `bucketByTaskDue(tasks, { todayStart, tomorrowStart })` e `taskFilterLeadIds(buckets, filter)`.
- `packages/web/src/lib/leads/task-buckets.test.ts` — 17 testes (vitest), fronteiras injetadas.

**Modificados (3)**

- `packages/web/src/app/dashboard/leads/page.tsx` — param `tasks` em `LeadsSearchParams`;
  `taskFilter` (ignorado em `view=perdidos`); 3º ramo de exclusão de etapa espelhando a RPC
  (`PERDIDO_STAGE_IDS` + `lost_reason IS NULL`), com precedência sobre `criados=hoje`; fetch
  PAGINADO de `lead_tasks` via `fetchAllLeads` + `.order("id")`; filtro por ids em `query` E
  `countQuery` com guarda de conjunto vazio; `tasks` no `buildPageHref` e no mapa de hidden
  inputs do `<form method="get">`; chip do filtro ativo com par claro/escuro + × ; rótulo do
  filtro na linha-resumo do `totalCount`.
- `packages/web/src/app/dashboard/page.tsx` — helper local `tasksHref(filter: TaskFilterValue)`
  e os 4 cards de tarefas (linhas 120-123) passando a linkar `?tasks=…`.
- `packages/web/src/app/broker/leads/page.tsx` — bucketização inline (antigas linhas 95-114) e
  `TASK_LABELS` local trocados pelo helper compartilhado; `taskLabel` derivado de
  `parseTaskFilter`. Refactor puro.

**Não tocados de propósito:** RPC `get_broker_dashboard_counts` (mig 209), nenhuma migration,
`components/lead-filters.tsx` (já preserva `tasks` sozinho — verificado em
`lead-filters.tsx:80-89`, o `setParam` copia `searchParams.toString()`).

## Dev Agent Record

**Agent Model Used:** Opus 5 (1M) — `claude-opus-5[1m]`, agente `aios-dev` (Dex), modo YOLO.
**Branch:** `feat/75-298-dashboard-tarefas-drill-down` (a partir de `main` @ `d0e7256d`).
**Sem commit/push:** o lead cuida do git (regra do @devops).

### Decisões autônomas

1. **[AUTO-DECISION] Gatilho do T0 (RPC dedicada vs app-side) → app-side.**
   O gatilho da story ("ids em URL > ~6 KB → RPC + migration") nascia de uma hipótese não
   medida sobre o teto de 8 KB. Medi o teto real do gateway de prod: ≈24 KB / ~640 uuids, com
   200 confirmado no pior caso real (266 ids, 9,7 KB). Como a medição DERRUBOU a premissa,
   não voltei ao @po: uma migration aqui seria complexidade paga contra um risco inexistente
   ([[feedback-anotacao-backlog-e-hipotese]], [[feedback-nao-quebrar-o-que-funciona]]).
   Números e método completos nas Dev Notes (T0).
2. **[AUTO-DECISION] Precedência quando `tasks=` E `criados=hoje` coexistem** (a story define
   que "combinam", mas não qual régua de etapa vale): `tasks` VENCE. É o critério que precisa
   bater com um card (AC2), e não há caminho de UI que produza os dois juntos (os cards linkam
   um param cada). `criados=hoje` sozinho segue idêntico (AC5).
3. **[AUTO-DECISION] Guarda de conjunto vazio → `id IS NULL`.** Para `atrasadas/para-hoje/futuras`
   com bucket vazio, `.in("id", [])` geraria `id=in.()` (SQL inválido). Em vez de ramificar a
   página inteira, aplico `.is("id", null)`: válido, nunca casa (a PK é NOT NULL) e mantém
   `totalCount = 0` com paginação coerente. `sem-tarefas` com conjunto vazio simplesmente não
   aplica filtro.
4. **[AUTO-DECISION] `TASK_LABELS` do broker migrou para o helper.** A story só pedia a
   bucketização, mas manter os 4 rótulos duplicados nos dois arquivos violaria
   [[feedback-consultar-fonte-nao-duplicar-constante]]. Rótulos idênticos aos de antes → zero
   mudança visual no `/broker`.
5. **[AUTO-DECISION] Guarda de `due_at` inválido no helper.** A versão inline do broker
   classificava uma data não-parseável como "futura" (cai no `else`). O helper agora a ignora
   nos 3 baldes de vencimento, mantendo o lead em `comTarefa`. Único desvio deliberado do
   "byte a byte": é inalcançável com dados reais (`due_at` é `timestamptz`, sempre parseável),
   então AC5 continua valendo. Coberto por teste.
6. **[AUTO-DECISION] NÃO paginei o fetch de `lead_tasks` do `/broker/leads`** (follow-up #4 do
   @po). T4 manda ser refactor puro, e `fetchAllLeads` **lança** em erro onde hoje a página
   degrada silenciosamente — trocar isso mudaria o comportamento de erro da tela principal do
   corretor, fora do escopo. Com 272 linhas o teto de 1000 não morde. Follow-up #4 segue aberto.
7. **[AUTO-DECISION] CodeRabbit pulado.** `coderabbit_integration` está configurado para WSL
   (`wsl bash -c …`) e este ambiente é darwin — binário indisponível. Tratado como
   "not installed → seguir sem self-healing", conforme o Error Handling da própria task.

### Notas de implementação

- **IDS:** REUSE de `fetchAllLeads()` (75-269) para a paginação, de `PERDIDO_STAGE_IDS`
  (`lib/leads/stage-filters.ts`) para o critério de etapa, de `buildPageHref` para o href do ×
  do chip, e do padrão `parseCalor`/`parseQualificacao` para a whitelist. CREATE justificado
  só do `task-buckets.ts` — não existia helper de bucketização (a lógica estava inline no
  broker) e a decisão precisava sair do componente para ser testável sem DOM
  ([[feedback-projeto-sem-teste-de-componente]]).
- **Comentário cruzado** (risco "divergência futura RPC × lista" da story): o helper aponta
  para `migrations/209_hotfix_rls_org_scope.sql:313-359` e o ramo novo do
  `dashboard/leads/page.tsx` aponta para a RPC e para o `/broker/leads`.
- **Custo:** o filtro de tarefas adiciona **1 round-trip serial** (o fetch precisa terminar
  antes de a query rodar) e só quando `tasks=` está na URL. Sem `tasks`, zero query nova.
- **Tema:** chip do `/dashboard` nasceu com par claro/escuro
  (`bg-orange-100 text-orange-700` + `dark:bg-orange-500/20 dark:text-orange-400`). O chip
  dark-hardcoded do `/broker` ficou como está (dívida conhecida daquele mundo).

### Debug Log / evidências de gate

```
$ npx vitest run packages/web/src/lib/leads/task-buckets.test.ts
 Test Files  1 passed (1)
      Tests  17 passed (17)

$ npx vitest run                     # regressão completa
 Test Files  183 passed (183)
      Tests  2295 passed | 6 expected fail (2301)
   Duration  29.15s

$ npm run type-check
 Tasks:    8 successful, 8 total          # tsc --noEmit em @trifold/web ✅

$ npm run lint
 ✖ 24 problems (0 errors, 24 warnings)    # TODOS pré-existentes
   # o único aviso em arquivo desta story é `isAdmin` não usado em
   # dashboard/leads/page.tsx:98 — já estava assim na main (confirmado em
   # `git show main:…` linha 82) e não é tocado pelo diff.

$ npx turbo run build --filter=@trifold/web
 Tasks:    4 successful, 4 total          # build de produção ✅
```

### Story DoD Checklist

1. **Requirements Met** — [x] AC1 ✅ · AC2 ✅ (provado em SQL contra prod, 4/4; conferência
   visual = T5, pós-deploy) · AC3 ✅ (dados de smoke medidos; clique real = T5) · AC4 ✅
   (hidden input + `buildPageHref` + `LeadFilters` verificado + `view=perdidos` ignora) ·
   AC5 ✅ · AC6 ✅ (17 testes, fronteiras injetadas) · AC7 ✅ (paginado + medição registrada).
2. **Coding Standards** — [x] padrões da casa seguidos (whitelist como `calor`, `dark:` em
   `/dashboard`, constantes importadas da fonte, sem literal de uuid); [x] nenhum linter
   error/warning novo; [x] comentários explicando o não-óbvio (espelho da RPC, teto de 1000,
   teto de URL, guarda de lista vazia).
3. **Testing** — [x] unitários do helper (a-e do AC6 + fronteiras + dedupe + nulos +
   `due_at` inválido); [N/A] integração/E2E (projeto não tem harness de componente/E2E — a
   decisão foi extraída para função pura, que é a convenção da casa); [x] suíte inteira passa.
4. **Functionality & Verification** — [x] verificado no nível que não depende de deploy:
   equivalência dos 4 números contra a RPC REAL em prod, teto de URL testado com HTTP real,
   build de produção. [ ] conferência visual em tela = **T5, pós-deploy** (declarado, não
   assumido). [x] edge cases: bucket vazio, `comTarefa` vazio, `due_at NULL`, `due_at`
   inválido, valor de `tasks` fora da whitelist, `view=perdidos` + `tasks`.
5. **Story Administration** — [x] T0-T4 marcados, T5 explicitamente pendente com motivo;
   [x] 7 decisões autônomas documentadas; [x] File List completo; [x] Change Log atualizado.
6. **Dependencies, Build & Configuration** — [x] build ✅ · lint ✅ · **zero dependência nova**
   · zero env var nova · zero migration.
7. **Documentation** — [x] comentários no código; N/A doc de usuário (mudança de
   comportamento de link, sem nova tela).

**Riscos residuais para o @qa** — ver "QA: pontos de atenção" abaixo.

### QA: pontos de atenção

1. **`sem-tarefas` é o caminho mais pesado**: monta uma URL de ~10 KB com `.not("id","in",…)`.
   Medido OK em prod (200, folga de ~2,3×), mas é o cenário a conferir primeiro em tela.
2. **`totalCount` × contadores das ABAS**: "Em atendimento (N)" / "Perdidos (N)" seguem
   GLOBAIS e não reagem ao filtro (por desenho, Decisão #7 da story). Não confundir com o
   número que tem de bater.
3. **O número se move**: era 66 em 11/08, 49 em 12/08. Card e lista têm de ser lidos no
   MESMO instante — o card é `NOW()` no banco, a lista é `new Date()` no servidor.
4. **`criados=hoje` + `tasks=` juntos** (só via URL montada à mão): a régua de etapa do
   `tasks` vence. Decisão #2 acima.
5. **Erro no fetch de `lead_tasks` agora propaga** no `/dashboard/leads` (`fetchAllLeads`
   lança). Preferi barulho a um número mentiroso, mas é um caminho de erro novo naquela tela.
6. **`/broker/leads` é refactor puro** — merece um smoke dos 4 filtros de tarefa + do filtro
   "Data da Tarefa" (que compartilha o mesmo `pendingTasks`).

## PO Validation (@po — Pax, 2026-08-12)

**Veredito: GO** · Implementation Readiness **8/10** · Confiança **Alta**
(task `validate-next-story.md` + `po-master-checklist.md` + `change-checklist.md`, modo YOLO).

Base da verificação anti-alucinação: código real de `main` @ `d0e7256d` (ver "Mapa de
arquivos"). Todas as afirmações técnicas da story foram conferidas linha a linha; as que não
resistiram foram corrigidas ACIMA, no corpo da story, e não apenas listadas aqui.

**Must-fix (aplicados pelo @po nesta validação):**

1. **Premissa de fuso FALSA** (era Decisão de desenho #3 + AC6): a story afirmava que
   `/broker/leads` calcula os buckets em UTC e que o helper "corrigiria" isso. Falso — o
   servidor roda em `America/Sao_Paulo` desde a 75-33
   (`packages/web/src/instrumentation.ts`), como `lib/broker/task-date-range.ts:1-8` já
   documenta. Mandar o @dev "consertar" isso quebraria o que funciona e o teste do AC6
   codificaria a expectativa errada. Decisão #3 reescrita e AC6 substituído por um AC de
   helper puro (fronteiras injetadas — o vitest não herda `TZ`).
2. **Teto de 1000 do PostgREST** não estava na story: o fetch de `lead_tasks` que ela manda
   copiar do broker (`/broker/leads/page.tsx:70-76`) não pagina, e o corte é SILENCIOSO →
   AC2 falha sem erro. Virou obrigação de paginar reusando `fetchAllLeads()` (75-269),
   com `.order("id")`, + AC7 + T0 de medição.
3. **URL do `.in`/`.not.in`** estava como risco "dentro do limite prático": ~280 ids ≈ 10 KB,
   acima do teto usual de 8 KB. Elevado a must-fix, com T0 medindo antes de codar e gatilho
   explícito para cair na RPC dedicada ([[feedback-anotacao-backlog-e-hipotese]]).
4. **`<form method="get">` da busca** (`dashboard/leads/page.tsx:305-322`) reescreve a query
   string inteira — `tasks` fora do mapa de hidden inputs repete o bug do QA da 75-236
   (comentado na linha 307) e derruba o AC4. Explicitado na Decisão #5 e no T2.
5. **Precedência indefinida** entre `tasks` e `view=perdidos` / `criados=hoje` (critérios
   opostos, mesmo arquivo): definida na nova Decisão #6.
6. **Guarda de lista vazia** (`.not("id","in","()")` = SQL inválido) e **regra do
   `due_at NULL`** (não entra em bucket, mas conta como "tem tarefa" — igual à RPC): ambas
   escritas na Decisão #2 e cobertas no AC6.

**Should-fix (aplicados):**

7. **AC2 era ambíguo** — a página tem 3 números (abas 290-301, `totalCount` 361-371,
   "Exibindo X de N" 426). Fixado em `totalCount`; registrado que os contadores das ABAS
   seguem globais (nova Decisão #7).
8. **Chip com tema**: o chip do broker é dark-hardcoded (`text-orange-400` sem par claro).
   Em `/dashboard` precisa de `dark:` ([[feedback-theme-convention]]).
9. **Testing ausente** (a story pedia "testes vitest" sem local nem comando): seção Testing
   criada — runner na raiz, sem `vitest.config`, caminho do arquivo, gates
   `pnpm test`/`type-check`/`lint`.
10. **Tasks sem rastro para ACs** e sem paths completos: T0-T5 remapeados com `(AC: …)` e
    caminhos reais de `packages/web/src/...`.

**Nice-to-have (deixado como está, de propósito):**

- Cards "Novos Disponíveis"/"Já Trabalhados" (`dashboard/page.tsx:118-119`) também linkam sem
  filtro — mesma família de defeito, fora do escopo desta story. → **backlog**.
- "Limpar filtros" do `LeadFilters` (`lead-filters.tsx:195-207`) não apaga `tasks`. Aceito:
  quem limpa é o × do chip.
- O fetch de `lead_tasks` é da org inteira, sem recorte de `segmento` — ids sobrando são
  inofensivos no `.in`, mas engordam a URL do `sem-tarefas`.
- AC3 cita nomes reais (Cassia Panerari ∈ 66, Denise Duarte ∉) vindos da auditoria de 11/08 —
  não reconferido aqui (sem PAT de prod nesta sessão); é dado do @dev/@qa no T5.

**Checklists — resumo:**

- **po-master-checklist** (brownfield + UI): categorias 1.2, 5, 6, 7, 8, 9 ✅; 2 (infra) e 3
  (dependências externas) N/A — nenhuma migration, nenhum serviço novo; 4 (UI/UX) ✅ com a
  ressalva do tema (item 8). Risco de integração: **Baixo** após os must-fix — só leitura, 3
  arquivos, sem migration; rollback = reverter o PR (nenhum estado persistido muda).
- **change-checklist**: gatilho = incidente "66 atrasadas × Denise Duarte" (11/08); tipo =
  requisito nunca implementado (não é pivot nem story falha); caminho escolhido = **Option 1,
  ajuste direto** (sem rollback, sem re-escopo de MVP); impacto em Epic 75 = nenhuma story
  invalidada; único conflito de artefato encontrado = a premissa de fuso desta própria story
  (corrigido). Sprint Change Proposal formal: dispensado (mudança contida em 1 story).

**10-point checklist (story-lifecycle): 8/10**
título ✅ · descrição ✅ · ACs testáveis ✅ (AC6 reescrito) · escopo ✅ · dependências ✅ ·
estimativa ✅ (S/M → 3 pts, T0 entrou) · valor ✅ · riscos ⚠️→✅ (2 riscos críticos faltavam) ·
DoD ✅ · alinhamento ⚠️ (Epic 75 não tem arquivo de épico; coerência aferida contra a linhagem
75-42 / 75-151 / 75-236 / 75-297 — consistente).

**[AUTO-DECISION]** — decisões que a task pediria ao usuário:
- *Interativo vs YOLO* → YOLO (missão autônoma).
- *Template AIOS `story-tmpl.yaml` (Dev Agent Record, Status como seção, CodeRabbit)* →
  avaliar contra o formato de fato do repo (idêntico ao da 75-297), não contra o template
  genérico. Motivo: todo `docs/stories/` usa o formato brownfield enxuto; forçar o template
  criaria divergência sem valor. Só a seção **Testing** foi adicionada, por ser lacuna real.
- *CodeRabbit (passo 8 da task)* → `coderabbit_integration` não existe em `core-config.yaml`
  ⇒ tratado como desabilitado, passo pulado. Aviso de skip não renderizado na story: aceito
  (convenção da casa; nenhuma story do repo tem).
- *`quality_gate: @qa` fora da tabela do passo 1.1 (que só admite @architect/@dev/@pm)* →
  ACEITO. O `CLAUDE.md` do projeto define @qa como gate obrigatório
  ([[feedback-qa-gate-obrigatorio]]); a tabela genérica do framework cede à regra do projeto.
  `executor` (@dev) ≠ `quality_gate` (@qa) ✅, `quality_gate_tools` não vazio ✅ —
  só o nome do script é `type-check`, não `typecheck` (anotado na seção Testing).
- *Alinhar a RPC à régua "perdido = ETAPA, nunca `lost_reason`"* → mantido FORA do escopo,
  como a story propôs (mudaria o número que o gerente já conhece). Vai para o backlog.
- *Corrigir os must-fix eu mesmo vs devolver NO-GO ao @sm* → corrigi no arquivo. São defeitos
  de especificação, e Context/AC/Escopo são propriedade do @po na matriz de autoridade;
  devolver custaria um ciclo sem ganho.

**Follow-ups para o backlog** (não bloqueiam):
1. `?tasks=` nos badges do Funil da Equipe (`get_broker_funnel_stats`) — a story já aponta.
2. Drill-down dos cards "Novos Disponíveis" / "Já Trabalhados".
3. RPC `get_broker_dashboard_counts` × régua "perdido = ETAPA" (`lost_reason IS NULL`
   residual) — decisão de produto, muda número em tela.
4. Paginar o fetch de `lead_tasks` do `/broker/leads` (mesmo teto de 1000; resolvido de
   graça se o T2/T4 compartilharem o caminho de fetch).

## QA Results (@qa — Quinn, 2026-08-12)

**Gate: CONCERNS** → `docs/qa/gates/75.298-dashboard-filtro-tarefas-drill-down.yml`
Quality score **88** · review round 1 · branch `feat/75-298-dashboard-tarefas-drill-down` @ `6f5a642b`
(diff revisado com `git diff main...HEAD`, árvore limpa).

**Não achei defeito.** O veredito não é PASS por dois motivos, nenhum bloqueante: o **T5**
segue aberto (ninguém carregou a tela — depende de deploy) e a story cria um **caminho de erro
novo** numa tela que não tem `error.tsx` (C-1).

### Gates rodados por mim (não confiei no relato)

| Gate | Resultado |
|---|---|
| `npx vitest run …/task-buckets.test.ts` | 17 passed |
| `npx vitest run` (suíte inteira) | 183 arquivos · 2295 passed \| 6 expected fail |
| `packages/web: npx tsc --noEmit` | exit 0 — o `turbo type-check` estava **FULL TURBO** (cache), forcei |
| `packages/web: npx eslint` | **0 errors**, 24 warnings — todas pré-existentes |
| `packages/web: npx next build` | exit 0 |

⚠️ `turbo … --force` **não** serve nesta máquina: quebra antes do web, em
`@trifold/shared#build` → `TS2688 Cannot find type definition file for 'node'`
(`packages/shared/node_modules` não existe aqui). Ambiente local, pré-existente, alheio à
story — o diff só toca `packages/web`. Contornei rodando `tsc`/`eslint` direto no pacote.

Verificação do warning de lint: `isAdmin` não usado existe na `main` (`git show main:…` linha
82) e o diff não toca a linha. Nenhum aviso novo.

### AC2 e AC3 — reproduzidos por mim em PROD (só SELECTs, Management API)

Não reusei o SQL do @dev; escrevi o meu e comparei contra a RPC **real**:

| filtro | RPC `get_broker_dashboard_counts(org, NULL)` | minha réplica do filtro da lista |
|---|---|---|
| `atrasadas` | 49 | **49** ✅ |
| `para-hoje` | 28 | **28** ✅ |
| `futuras` | 167 | **167** ✅ |
| `sem-tarefas` | 291 | **291** ✅ |

Base total 557 = 266 com tarefa + 291 sem ✅ · 272 tarefas abertas · 270 `lead_id` distintos ·
24 com `due_at IS NULL` — batem com as Dev Notes.

**AC3 (smoke):** Cassia Panerari `em_atrasadas=true`, `tarefas_abertas=1` · Denise Duarte
`em_atrasadas=false`, `tarefas_abertas=0`. Confirma o diagnóstico do incidente de 11/08.

**Integridade que eu decidi conferir por conta própria:** das 272 tarefas abertas, **0** com
`org_id` nulo, **0** com `org_id` diferente do lead, **0** órfãs; `lead_tasks.org_id` é NOT NULL
e `id` é uuid PK — o que valida de uma vez o `.eq("org_id", …)` do app, a guarda
`.is("id", null)` (nunca casa) e o `.order("id")` do `.range()` (coluna ÚNICA).

### Traceabilidade dos ACs

AC1 ✅ · AC2 ✅ dados (tela = T5) · AC3 ✅ dados (clique = T5) · AC4 ✅ (hidden input 408 +
`buildPageHref` 78-83 + `lead-filters.tsx:81` conferido no arquivo + `view=perdidos` ignora) ·
AC5 ✅ (ramo novo é `else if` no meio, fetch todo dentro de `if (taskFilter)`; broker: rótulos
comparados string a string) · AC6 ✅ (5 casos exigidos presentes nominalmente + fronteiras) ·
AC7 ✅.

### Riscos que o lead pediu para olhar

1. **`sem-tarefas` / URL de ~10 KB** — sondei o gateway de prod eu mesmo (uuids sintéticos,
   apikey inválida): **401 até 1000 uuids / 37.076 B**, isto é, a requisição é recebida e
   roteada mesmo com 37 KB. O transporte não rejeita por tamanho; o 400 acima de ~640 vem de
   camada que PARSEIA → falha **ruidosa**, nunca corte silencioso. Premissa dos 8 KB: morta.
2. **Contadores das abas globais** — confirmado por desenho: `ativosCount`/`perdidosCount`
   (linhas 303-308) são queries próprias sem os filtros. Só `totalCount` reage. Correto.
3. **`criados=hoje` + `tasks=`** — o `gte("created_at", …)` continua aplicado e a régua de
   ETAPA do `tasks` vence. Inalcançável pela UI (cada card linka 1 param). Decisão aceita.
4. **Erro no fetch propaga** → ver **C-1** abaixo: é real, e o problema não é a escolha (barulho
   > número mentiroso, está certo), é a ausência de boundary.
5. **`/broker/leads` refactor puro** — confirmado linha a linha. Único desvio: `due_at`
   não-parseável não cai mais em "futuras" (inalcançável com `timestamptz`). Os 4 rótulos são
   idênticos; o chip dark-hardcoded do broker ficou como estava. O fetch de `lead_tasks` do
   broker continua condicionado ao `tasks` CRU (linha 76), como antes — nada mudou ali.

### Julgamento sobre o T0 (não escalar ao @po) — **CORRETA**

O gatilho "ids > ~6 KB → RPC dedicada" nascia de um número **presumido**, não medido — o caso
clássico de [[feedback-anotacao-backlog-e-hipotese]]. O @dev mediu o teto real com HTTP contra
prod **antes** de codar, e a medição derrubou a premissa que criava o gatilho; minha sonda
independente confirma. Escalar teria custado um ciclo e, pior, uma migration + RPC de
manutenção perpétua contra um risco inexistente ([[feedback-nao-quebrar-o-que-funciona]]).
Mediu, documentou método e números na story, e registrou o gatilho REAL (~500 leads com tarefa
aberta) como follow-up. É o oposto de pular o @po por pressa.

### Concerns (nenhum bloqueia)

| id | sev | onde | o que |
|---|---|---|---|
| **C-1** | medium | `dashboard/leads/page.tsx:249-256` | `fetchAllLeads` **lança**, e não existe `error.tsx` **em nenhum lugar** de `packages/web/src/app` (nem `global-error.tsx`) → falha transitória em modo `tasks=` troca a lista do gerente pela tela de erro genérica do Next. → follow-up `app/dashboard/error.tsx` (dívida do diretório, revelada pela story). |
| **C-2** | low | `dashboard/leads/page.tsx:236-289` | o gatilho de "cair na RPC" comenta só o `sem-tarefas`; o `.in("id", …)` de atrasadas/para-hoje/futuras tem o MESMO teto de URL. Hoje o maior é `futuras` (~167), folga real. Disparar pelo MAIOR dos dois conjuntos quando o follow-up for escrito. |
| **C-3** | low | mig `209:334-352` × `page.tsx:258-263` | a RPC junta `lead_tasks` **sem** filtrar `lt.org_id`; o app filtra. Medido: 0 divergências, `org_id` NOT NULL, 1 org em prod. Informativo — se surgir 2ª org, revisar os dois lados juntos. |
| **C-4** | low | `broker/leads/page.tsx:274` | vazio da lista ainda testa `tasks` cru → `?tasks=lixo` renderiza "Nenhum lead com undefined.". **Idêntico à main**, logo preservá-lo é o certo para o T4; é só uma linha órfã do refactor. |
| **C-5** | low | — | **T5 aberto**: conferir os 4 filtros na tela e o clique num lead de `atrasadas`, começando por `?tasks=sem-tarefas` (URL mais longa). Ler card e lista no MESMO instante — o número anda (66 em 11/08 → 49 hoje). |

### Recomendação

**Liberar para @devops (PR).** Registrar C-1 como follow-up próprio e cumprir o T5 no primeiro
acesso pós-deploy.

— Quinn, guardião da qualidade 🛡️

## Change Log

- 2026-08-11 — @sm: story criada a partir do diagnóstico do incidente "66 atrasadas × Denise
  Duarte" (contador correto, drill-down inexistente).
- 2026-08-12 — @po (Pax): validação GO 8/10. Status **Draft → Ready**. 6 must-fix + 4
  should-fix aplicados no corpo da story (destaque: a premissa de bug de fuso era FALSA —
  servidor já em BRT pela 75-33; e faltavam o teto de 1000 do PostgREST e o hidden input do
  form de busca). Estimativa S/M → 3 pts (entrou o T0 de medição em prod). 4 follow-ups
  registrados.
- 2026-08-12 — @dev (Dex): implementação em YOLO na branch
  `feat/75-298-dashboard-tarefas-drill-down`. Status **Ready → Ready for Review**.
  T0-T4 concluídos; T5 pendente de deploy. 2 arquivos criados, 3 modificados, **nenhuma
  migration**. 🔑 O T0 derrubou o must-fix #3 do @po: o teto de URL do gateway de prod é
  ≈24 KB (~640 uuids), não 8 KB — medido com HTTP real (266 ids ≈ 9,7 KB → **200**), então
  a RPC dedicada NÃO foi necessária. AC2 provado em SQL contra prod antes do deploy: RPC ×
  lista batem 4/4 (49/28/167/291). Gates: 2295 testes ✅ · type-check ✅ · lint 0 erros ✅ ·
  build de produção ✅.
- 2026-08-12 — @qa (Quinn): gate **CONCERNS não-bloqueante** (score 88, 7/7 ACs, zero defeito
  de código). Verificação independente em prod (SQL próprio) 4/4. Gate em
  `docs/qa/gates/75.298-dashboard-filtro-tarefas-drill-down.yml`. Decisão do @dev no T0
  julgada CORRETA. Follow-up principal: `app/dashboard/error.tsx` (o app não tem nenhum
  error boundary).
- 2026-08-12 — @devops (Gage): **PR #400** mesclado na main via squash (`db0a8572`); deploy
  Vercel Ready em 2min; smoke sem navegador OK (todas as rotas `?tasks=` → 307 login, zero
  5xx). Branch apagada.
- 2026-08-12 — lead: **T5 cumprido** com prints do Marcos (292/292, 49/49, 28/28, chip e
  rótulo OK). Status **Ready for Review → Done**.
