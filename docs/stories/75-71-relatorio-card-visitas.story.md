# Story 75-71 — Relatório semanal: card "Visitas (7d)" no lugar de "Fechamentos"

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** feature/75-71-relatorio-card-visitou · **Complexidade:** S (2-3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]
- **Nota de processo:** ajuste de métrica escopado direto como @dev→@qa→@devops; iterado e aprovado visualmente pelo usuário (PDF real de prod renderizado a cada passo). Segue 75-69 ([[project-relatorio-semanal-redesign]]).

## Story
**As a** diretoria, **I want** que o 2º card do relatório semanal mostre **visitas** em vez de "Fechamentos"
(que em janela de 7 dias é quase sempre 0), **so that** o card traga um número acionável — quantas visitas
aconteceram na semana — com a contagem da etapa "Visitou" como apoio.

## Contexto
No relatório redesenhado (75-69) o 2º card era "Fechamentos" (= estágio Fechamento), que numa janela de 7 dias
fica ~0. Decisão do usuário (2026-06-29): trocar por visitas, com **dois conceitos**:
1. **Visitas (7d)** — evento real: agendamentos realizados na semana.
2. **Na etapa Visitou** — foto do estágio atual.

Investigação confirmou que **mudança de etapa NÃO é logada** (0 `stage_change` em activities/audit_logs em 30 dias —
provável RLS no insert do kanban), então "visitas" não pode vir de movimentação de etapa. A fonte correta é a
tabela **`appointments`** (scheduled_at na janela, status ≠ cancelado/no-show). ⚠️ Bug do stage-change fica
registrado como pendência separada.

## Escopo
**IN:**
- `analytics-report-data.ts`: trocar `fechamentos` por `visitou` (stage "Visitou" do funil ranged) **e** adicionar
  `visitasRealizadas` = COUNT de `appointments` com `scheduled_at ∈ [aggSince, aggUntil)` e `status NOT IN
  (cancelled, no_show)`, escopado por `org_id`.
- `analytics-report-pdf.tsx`: 2º card vira **"Visitas (7d)"** com `visitasRealizadas` como número principal e
  sub-linha **"{visitou} na etapa Visitou"**. Novos campos no type; estilos `cardSub`/`cardSubStrong`.
- `cron/analytics-report/route.ts`: e-mail reflete "Visitas realizadas (7d): X (Y na etapa Visitou)".

**OUT:**
- Não corrigir o bug do log de stage_change (story separada).
- Não mexer no conceito de período (segue 7d / 75-69) nem nos demais cards.

## Acceptance Criteria
1. **Given** o relatório, **then** o 2º card mostra "Visitas (7d)" = nº de agendamentos com data no período e
   status ≠ cancelado/no-show; a sub-linha mostra "{N} na etapa Visitou".
2. **Given** o funil, **then** "Na etapa Visitou" bate com a linha "Visitou" do funil (mesma fonte).
3. **Given** período sem visitas realizadas, **then** o card mostra 0 (correto), sem contar no-show/cancelado.
4. typecheck/lint limpos; render real do PDF sem exceção; nenhum resíduo de `fechamentos` no código.

## Dev Notes
- `appointments`: colunas `org_id, scheduled_at, status` (status visto em prod: cancelled, no_show). Filtro
  `.not("status", "in", "(cancelled,no_show)")`.
- `visitou` = `stages.find(/visitou/i)?.count` (funil `get_analytics_summary_ranged`).

## File List
- `packages/web/src/lib/analytics-report-data.ts` — `visitou` + `visitasRealizadas` (query appointments).
- `packages/web/src/lib/pdf/analytics-report-pdf.tsx` — card "Visitas (7d)" + sub-linha + type/estilos.
- `packages/web/src/app/api/cron/analytics-report/route.ts` — linha do e-mail.

## QA Results
- **Verdict:** PASS — typecheck 0, lint 0, render real do PDF (Trifold prod, 22–29 jun) sem exceção.
- Dados reais: Visitas (7d)=0 (sem visitas realizadas; só no-show no período → corretamente excluído), Na etapa Visitou=1 (bate com o funil). Zero resíduo de `fechamentos`.

## Change Log
- 2026-06-29 — @dev — Card "Fechamentos" → "Visitas (7d)" (agendamentos realizados) com sub-linha "N na etapa
  Visitou". Fonte: appointments (≠ cancelado/no-show), pois stage_change não é logado. tsc/lint 0; render real OK;
  aprovado pelo usuário. Pendência separada: bug do log de stage_change. Ver [[project-relatorio-semanal-redesign]].
