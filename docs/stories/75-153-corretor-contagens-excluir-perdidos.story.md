# Story 75-153 — Corretor: contagens e lista NÃO contam Perdido / Não Qualificado

**Status:** Review
**Epic:** Dashboard / métricas de leads (mundo do corretor)
**Relacionado:** 75-151 (stage-filters como fonte única), 75-118 (Perdido = terminal p/ automação), 136 (RPCs segmento principal)
**Complexidade:** S (1 migration CREATE OR REPLACE + 1 query TSX; sem UI nova, sem tabela nova)

## Contexto
O dashboard do corretor (`/broker`) e a lista **"Meus Leads"** (`/broker/leads`) estão contando
leads na etapa **Perdido** e **Não Qualificado** como se fossem trabalho ativo. Em produção o
diretor viu o card **"Total Leads Sem Tarefas" = 12** e, ao abrir, os 12 eram leads na etapa
**"Perdido"**. Lead perdido é **terminal** — não deve entrar em nenhuma contagem/lista de trabalho
do corretor.

### Causa-raiz — duas definições conflitantes de "perdido"
Há duas regras diferentes de "o que é perdido" no código:

| Mundo | Como decide que o lead é "perdido" | Onde |
|---|---|---|
| **Corretor** | `lost_reason IS NULL` (só o motivo textual) | RPC `get_broker_dashboard_counts` (mig 136) + query da lista (`broker/leads/page.tsx:57`) |
| **Admin / supervisor** | **ETAPA** via `EM_ATENDIMENTO_EXCLUDED_IDS` (fonte única) | `lib/leads/stage-filters.ts` usado em `dashboard/page.tsx` |

O problema: um lead pode estar **na etapa "Perdido"/"Não Qualificado" com `lost_reason` NULL**.
Arrastar o card no kanban só muda a **etapa** (não grava `lost_reason`); e a etapa
**"Não Qualificado" nunca grava `lost_reason`**. Nesses casos o filtro do corretor
(`lost_reason IS NULL`) **deixa passar** o lead → ele vaza para as contagens e para a lista.

**Evidência em produção:**
- Etapa **Perdido**: 771 com motivo (`lost_reason` preenchido) + **28 sem motivo** (vazam hoje).
- Etapa **Não Qualificado**: **14 sem motivo** (vazam hoje).

### Fonte única de verdade (já existe)
`packages/web/src/lib/leads/stage-filters.ts`:
- `PERDIDO_STAGE_IDS` = `["00000000-0000-0000-0001-000000000008" /* Perdido */, "95327bd7-3e88-4038-aa16-250a74ab085c" /* Não Qualificado */]`
- `ACERVO_STAGE_IDS` = `["62075f72-1629-4d8b-a019-0fcb35e3d302" /* Corretores Antigos */, "00000000-0000-0000-0001-000000000010" /* Represamento */]`
- `EM_ATENDIMENTO_EXCLUDED_IDS = [...PERDIDO_STAGE_IDS, ...ACERVO_STAGE_IDS]`

## Decisão do diretor — CRÍTICO (escopo)
**SÓ PERDIDOS** nesta story = `PERDIDO_STAGE_IDS` (**Perdido + Não Qualificado**).
O **acervo** (`ACERVO_STAGE_IDS`: Corretores Antigos, Represamento) **NÃO é tocado** aqui —
é decisão separada e fica **OUT OF SCOPE** (ver seção). O critério de verdade do "perdido"
passa a ser a **ETAPA**, alinhando o mundo do corretor à regra do admin (para perdidos).

## Story
**As a** diretor/gestor comercial que acompanha o trabalho dos corretores,
**I want** que as contagens e a lista de leads do corretor **não incluam** leads em Perdido / Não
Qualificado,
**so that** os cards ("Sem Tarefas", "Ativos", "Trabalhados") e a lista reflitam apenas trabalho
real e batam com a regra de perdidos que o admin já usa.

## Acceptance Criteria
1. **AC1** — O card **"Total Leads Sem Tarefas"** (`counts.sem_tarefas`) **não conta** leads em
   `PERDIDO_STAGE_IDS` (Perdido / Não Qualificado), **inclusive quando `lost_reason` é NULL**.
2. **AC2** — O badge **"Meus Leads Ativos"** (`counts.total`) e o card **"Leads Já Trabalhados"**
   (`counts.trabalhados`) também **não contam** `PERDIDO_STAGE_IDS`.
3. **AC3** — A lista **"Meus Leads"** (`/broker/leads`), inclusive com o filtro
   `?tasks=sem-tarefas`, **não exibe** leads em `PERDIDO_STAGE_IDS` — nem os que estão com
   `lost_reason` NULL.
4. **AC4** — As contagens do corretor passam a bater com a **regra de perdidos do admin**: um lead
   na etapa Perdido/Não Qualificado é invisível para o corretor independentemente de ter `lost_reason`.
5. **AC5** — **Acervo inalterado** (`ACERVO_STAGE_IDS`): leads em Corretores Antigos / Represamento
   **continuam** sendo contados/listados exatamente como hoje no mundo do corretor (OUT OF SCOPE).
6. **AC6** — **Sem regressão** nos demais cards do RPC: `novos` (etapa "Aguardando atendimento"),
   `atrasadas`, `para_hoje`, `futuras` continuam corretos para leads **não-perdidos** (só somem os
   que estiverem em Perdido/Não Qualificado, que é o comportamento desejado).
7. **AC7** — A migration é um **CREATE OR REPLACE** de `public.get_broker_dashboard_counts` que
   preserva **todos** os filtros atuais (`segmento='principal'`, `is_active=true`, `org`, `broker`,
   `lost_reason IS NULL`) e apenas **adiciona** a exclusão de etapa em **cada** uma das 6 contagens.
8. **AC8** — Na lista TSX a exclusão usa a constante `PERDIDO_STAGE_IDS` importada de
   `stage-filters.ts` (**sem UUID hardcoded no `.tsx`**); na SQL os UUIDs são literais (função não
   importa TS).

## Tasks / Subtasks
- [x] **Task 1 — Migration 170 (RPC)** (AC: 1, 2, 6, 7)
  - [x] Criar `supabase/migrations/170_broker_counts_excluir_perdidos.sql` (170 = próxima livre; maior atual = 169).
  - [x] `CREATE OR REPLACE FUNCTION public.get_broker_dashboard_counts(p_org_id uuid, p_broker_id uuid)`
        **idêntica** à versão da mig 136 (mesma assinatura, `SECURITY DEFINER`, mesmas 6 contagens,
        mesmos `v_aguardando_stage_id` / janela `America/Sao_Paulo`).
  - [x] Em **cada** um dos 6 `SELECT ... INTO` (`v_total`, `v_novos`, `v_sem_tarefas`, `v_atrasadas`,
        `v_para_hoje`, `v_futuras`) adicionar:
        `AND l.stage_id NOT IN ('00000000-0000-0000-0001-000000000008','95327bd7-3e88-4038-aa16-250a74ab085c')`
        (não remover nenhum filtro existente — `segmento`, `is_active`, `lost_reason IS NULL`, `org`, `broker` permanecem).
  - [x] Cabeçalho SQL comentado citando Story 75-153 + a razão (perdido por ETAPA, `lost_reason` pode ser NULL).
- [x] **Task 2 — Lista "Meus Leads"** (AC: 3, 4, 8)
  - [x] Em `packages/web/src/app/broker/leads/page.tsx`, na query de `leads` (linhas ~43-58),
        **manter** `.eq("assigned_broker_id", user.id).eq("is_active", true).is("lost_reason", null)`
        e **adicionar** a exclusão por etapa:
        `.not("stage_id", "in", \`(${PERDIDO_STAGE_IDS.join(",")})\`)`
        (mesmo padrão PostgREST usado em `dashboard/page.tsx`).
  - [x] `import { PERDIDO_STAGE_IDS } from "@web/lib/leads/stage-filters"` (sem hardcode no TSX).
  - [x] Confirmar que o filtro `?tasks=sem-tarefas` (aplicado em memória sobre `leads` já buscados)
        herda a exclusão automaticamente — como a exclusão é no nível da query, perdidos nunca entram.
- [x] **Task 3 — Verificação (sem regressão)** (AC: 1-6)
  - [ ] Aplicar a migration 170 em prod via Management API (PAT em `packages/web/.env.local`). **→ DEFERIDO p/ @devops** (limite de sessão: não aplicar DDL em prod agora; roda no passo de deploy após aprovação).
  - [x] SQL de conferência espelhando o RPC: contar `sem_tarefas` para um corretor com leads perdidos
        **antes** (regra `lost_reason IS NULL`) e **depois** (regra + `stage NOT IN PERDIDO`) e confirmar
        que a diferença = nº de leads dele em Perdido/Não Qualificado com `lost_reason` NULL.
  - [x] Conferir que **acervo** (Corretores Antigos / Represamento) continua contando igual (AC5).
  - [x] `npm run type-check` + `npm run lint` + `npm test` (vitest) sem regressão.

## Dev Notes
- **Reuso obrigatório:** no TS, importar `PERDIDO_STAGE_IDS` de
  `packages/web/src/lib/leads/stage-filters.ts` — **não** hardcodar UUIDs no `.tsx`. Na SQL, os UUIDs
  são literais (a função Postgres não enxerga o TS): usar exatamente
  `'00000000-0000-0000-0001-000000000008'` (Perdido) e `'95327bd7-3e88-4038-aa16-250a74ab085c'`
  (Não Qualificado). Manter os dois lados sincronizados; qualquer novo stage de "perdido" no futuro
  entra em **ambos**.
- **Padrão PostgREST da exclusão** (igual ao card do admin em `dashboard/page.tsx`):
  `.not("stage_id", "in", \`(${PERDIDO_STAGE_IDS.join(",")})\`)`.
- **RPC — fonte das contagens do corretor:** `get_broker_dashboard_counts` (mig 136) retorna
  `jsonb_build_object('total', ..., 'novos', ..., 'trabalhados', v_total - v_novos, 'sem_tarefas',
  ..., 'atrasadas', ..., 'para_hoje', ..., 'futuras', ...)`. Consumida em
  `packages/web/src/app/broker/page.tsx:116` (`supabase.rpc("get_broker_dashboard_counts", { p_org_id, p_broker_id })`).
  `trabalhados` é derivado (`v_total - v_novos`) → basta corrigir `v_total`/`v_novos`.
  `novos` = etapa "Aguardando atendimento" (`00000000-0000-0000-0001-000000000001`), que nunca é
  perdida — mas manter a exclusão em `v_novos` também é inócuo e uniforme.
- **`lost_reason IS NULL` fica** (não remover): a mudança é **aditiva** (etapa). Isso mantém paridade
  com a mig 136 e não altera leads que já eram perdidos por motivo. O bug é só o vazamento por ETAPA
  com `lost_reason` NULL.
- **IMOB:** `get_broker_dashboard_counts` fixa `segmento='principal'` e o `/broker` é mundo principal
  (corretor não opera IMOB). Nada a fazer para IMOB.
- **Regra do projeto (memória `feedback-nao-quebrar-o-que-funciona`):** mapear raio de impacto e testar
  o caminho REAL. Raio: os 6 números do RPC + a query única da lista. Nada mais lê essas contagens.
- **Aplicar migration em prod sem CLI:** Supabase Management API com PAT (`packages/web/.env.local`),
  conforme convenção do projeto (`project-migrations`).

### Testing
- **Sem testes de página/RPC no repo** (server components + SQL): verificação é **E2E via SQL**
  espelhando as queries em prod (mesmo padrão da Story 75-151, que também não teve teste unitário novo).
- Suíte existente (vitest) deve permanecer verde; `typecheck` e `lint` sem novos erros.
- Cenário-chave a validar: corretor com lead na etapa **Perdido com `lost_reason` NULL** e lead na
  etapa **Não Qualificado** → antes contavam em `sem_tarefas`/`total`/lista, depois **somem**; leads em
  **acervo** e leads não-perdidos permanecem inalterados.

## Out of Scope (decisão separada)
- **Acervo** (`ACERVO_STAGE_IDS`: Corretores Antigos, Represamento) — **não** é excluído das contagens
  do corretor nesta story (AC5). Se o diretor decidir excluir acervo depois, é outra story (a
  constante `ACERVO_STAGE_IDS` já existe para reuso).
- Card/lista do **admin/supervisor** (`dashboard/*`) — já usa `EM_ATENDIMENTO_EXCLUDED_IDS`; **não** muda.
- `get_broker_funnel_stats` (funil/pipeline do corretor) — mostra o funil por etapa e **inclui** a
  etapa Perdido de propósito; fora do escopo (não é "contagem de trabalho").

## Riscos
- **Regressão nas 6 contagens** se a exclusão for esquecida em algum dos `SELECT ... INTO`.
  Mitigação: aplicar em **todos** os 6 blocos; AC7 exige CREATE OR REPLACE idêntico + só a adição.
- **Divergência TS × SQL** se a lista usar UUID diferente da constante. Mitigação: TSX importa
  `PERDIDO_STAGE_IDS`; SQL usa os mesmos 2 literais (AC8).
- **Acervo sumir por engano** se alguém usar `EM_ATENDIMENTO_EXCLUDED_IDS` em vez de
  `PERDIDO_STAGE_IDS`. Mitigação: AC5 + Task 3 conferem acervo inalterado; usar estritamente
  `PERDIDO_STAGE_IDS`.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-14 | 0.1 | Story criada (corretor: excluir Perdido/Não Qualificado por ETAPA das contagens e da lista; acervo out of scope; mig 170 CREATE OR REPLACE + query TSX). | @sm (River) |
| 2026-07-14 | 0.2 | Validação PO (10-point checklist): GO, score 9/10. Fidelidade técnica confirmada — mig 170 livre (maior atual = 169), UUIDs batem com stage-filters.ts, RPC mig 136 (6 counts, filtros, v_total-v_novos) confere, referências de arquivo/linha existem (broker/leads/page.tsx:57, broker/page.tsx:116, dashboard/page.tsx:55), get_broker_funnel_stats corretamente OUT OF SCOPE. Sem invenção (Article IV OK). Status Draft → Ready. | @po (Pax) |
| 2026-07-14 | 0.3 | Implementação @dev: mig 170 (CREATE OR REPLACE `get_broker_dashboard_counts` + exclusão `PERDIDO_STAGE_IDS` nos 6 counts) + query da lista `broker/leads/page.tsx` (`.not("stage_id","in",...)` + import `PERDIDO_STAGE_IDS`). type-check OK, lint sem novos erros, vitest 914/914. Simulação SQL read-only em prod (Robson Silva): sem_tarefas 12→0, total 101→89, acervo 7→7 inalterado. Migration NÃO aplicada em prod (deferida p/ @devops). Status Ready → Review. | @dev (Dex) |

## Dev Agent Record
### Agent Model Used
Claude Opus 4.8 (1M context) — @dev (Dex)

### Debug Log References
Verificação SQL read-only em prod (`dsopqkqjkmhytudaaolv`), simulação espelhando o RPC
`get_broker_dashboard_counts` para o corretor **Robson Silva**
(`broker_id=25b550d5-41fd-44c4-bb17-cd0e3cca849c`, org `00000000-0000-0000-0000-000000000001`):

| Métrica | ANTES (`lost_reason IS NULL`) | DEPOIS (+ `stage NOT IN PERDIDO`) | Δ |
|---|---|---|---|
| `sem_tarefas` | **12** | **0** | −12 |
| `total` | **101** | **89** | −12 |
| Perdidos (etapa) sem tarefa dele | 12 | — | = Δ sem_tarefas ✔ |
| **Acervo** (Corretores Antigos/Represamento) | **7** | **7** | 0 (inalterado, AC5) ✔ |

Os 12 que somem de `sem_tarefas` = exatamente os leads dele em Perdido/Não Qualificado com
`lost_reason` NULL (bate com o "Total Leads Sem Tarefas = 12" que o diretor viu em prod). Acervo
inalterado (7 → 7), confirmando que a exclusão usa `PERDIDO_STAGE_IDS`, não `EM_ATENDIMENTO_EXCLUDED_IDS`.

### Completion Notes
- **Task 1 (Migration 170):** `CREATE OR REPLACE` de `get_broker_dashboard_counts` idêntico à mig 136,
  apenas adicionando `AND l.stage_id NOT IN ('...008','95327bd7...')` nos **6** `SELECT ... INTO`
  (`v_total`, `v_novos`, `v_sem_tarefas`, `v_atrasadas`, `v_para_hoje`, `v_futuras`). Nenhum filtro
  removido (segmento/is_active/lost_reason/org/broker mantidos). `trabalhados` = `v_total - v_novos`
  (derivado, corrige-se sozinho). Acervo fora de escopo — só os 2 UUIDs de PERDIDO.
- **Task 2 (Lista "Meus Leads"):** adicionado `.not("stage_id", "in", \`(${PERDIDO_STAGE_IDS.join(",")})\`)`
  na query, mantendo `.is("lost_reason", null)` (aditivo). Import de `PERDIDO_STAGE_IDS` de
  `@web/lib/leads/stage-filters` (sem UUID hardcoded no TSX). Filtro `?tasks=sem-tarefas` (em memória)
  herda a exclusão pois ela é feita no nível da query — perdidos nunca entram no array `leads`.
- **Task 3 (Verificação):** `type-check` OK (0 erros); `lint` — 12 erros pré-existentes em arquivos
  NÃO tocados (`weather-widget.tsx`, `informe-pdf.tsx`, `distributor.test.ts`), 0 no código alterado;
  `vitest run` → **914 passed / 84 files**, sem regressão. Simulação SQL comprovada (ver Debug Log).
- **Migration NÃO aplicada em prod** nesta sessão (limite de sessão @dev). Aplicação de DDL em prod
  fica para o passo @devops após aprovação do usuário.

### File List
- `supabase/migrations/170_broker_counts_excluir_perdidos.sql` (novo)
- `packages/web/src/app/broker/leads/page.tsx` (modificado — import + `.not("stage_id","in",...)`)

## QA Results

### Review Date: 2026-07-14
### Reviewed By: Quinn (Test Architect & Quality Advisor)

**Veredito: PASS** (readiness 10/10)

Revisão adversarial da branch `fix/75-153-corretor-excluir-perdidos`. Mudança mínima, aditiva e
totalmente rastreável aos 8 AC. Nenhum defeito, regressão ou desvio de escopo encontrado.

| Check | Resultado | Nota |
|---|---|---|
| 1. Code review | PASS | mig 170 = CREATE OR REPLACE idêntico à 136 + 1 linha aditiva por bloco; TSX reusa `PERDIDO_STAGE_IDS` (sem hardcode), mesmo padrão PostgREST do admin |
| 2. Unit tests | PASS | vitest **914/914 (84 files)**, sem regressão; sem teste novo (server components + SQL), coerente c/ 75-151 |
| 3. Acceptance criteria | PASS | AC1-AC8 cobertos (trace no gate) |
| 4. No regressions | PASS | filtros existentes (segmento/is_active/lost_reason/org/broker) preservados; acervo intocado |
| 5. Performance | PASS | +1 predicado `NOT IN` de 2 UUIDs por count; sem novos joins |
| 6. Security | PASS | `SECURITY DEFINER` + assinatura + retorno jsonb idênticos; sem SQL dinâmica |
| 7. Documentation | PASS | cabeçalho SQL + comentário TSX citam a story; Dev Agent Record completo |

**Verificações-foco (adversariais):**
- **6 dos 6 `SELECT ... INTO`** receberam a exclusão — `grep -c` = exatamente **6** ocorrências de
  `NOT IN ('...008','95327bd7...')` (nem mais nem menos). Corpo confirmado **idêntico linha-a-linha** à
  mig 136, só a adição.
- Mig 170 define **só** `get_broker_dashboard_counts`; as outras 3 funções da 136
  (`get_dashboard_stage_counts`, `get_broker_funnel_stats`, `get_analytics_summary_ranged`) **não
  foram tocadas**.
- **Paridade SQL×TS:** UUIDs literais da SQL == `PERDIDO_STAGE_IDS` de `stage-filters.ts`. **Acervo
  ausente** da 170 (usa `PERDIDO_STAGE_IDS`, não `EM_ATENDIMENTO_EXCLUDED_IDS`) → AC5 garantido.
- **Lista** usa `.not("stage_id","in",(${PERDIDO_STAGE_IDS.join(",")}))` no nível da query → `?tasks=sem-tarefas`
  (em memória) herda a exclusão; padrão idêntico ao admin em `dashboard/page.tsx:55`.
- **Diff vs main:** apenas story + `broker/leads/page.tsx` (+5 linhas) + mig 170 (nova). Nada fora de escopo.
- **type-check:** 0 erros. **Lint:** 12 erros PRÉ-EXISTENTES em arquivos NÃO tocados
  (`weather-widget.tsx`, `informe-pdf.tsx`, `distributor.test.ts`) — fora de escopo, desconsiderados.

**Observação (não bloqueante):** semântica `NOT IN` + `stage_id` NULL excluiria o lead — porém é
exatamente o predicado que o admin já usa, e a simulação em prod (Δ total = 12 = só os perdidos)
confirma que nenhum lead de `stage_id` NULL é derrubado. `stage_id` é sempre preenchido no fluxo.

### Gate Status

Gate: PASS → docs/qa/gates/75.153-corretor-contagens-excluir-perdidos.yml

**Pendências para @devops (`*push`):** (1) aplicar migration 170 em prod (Management API); (2) push.
Status → **Done** após deploy + migração aplicadas (transição de @devops, conforme `story-lifecycle.md`).
Code TSX e mig 170 devem ir **juntos** no deploy.
