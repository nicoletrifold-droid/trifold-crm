# Story 75-47 — Analytics: corrigir "Tempo Médio de Atendimento" (distribuição → atendimento)

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor, **I want** que o card "Tempo Médio de Atendimento" do analytics meça da
distribuição até o atendimento real, **so that** o ranking dos corretores seja justo e
consistente com o relatório diário (75-46).

## Contexto
Card em `dashboard/analytics/page.tsx` calculava `1º broker_note − created_at` (entrada do lead
→ 1ª nota no "+ Novo Histórico"). Dois problemas: (1) partia da ENTRADA (inflava com a espera da
roleta) — o subtítulo até dizia "da distribuição" mas o código usava `created_at`; (2) o "fim" era
a 1ª nota, não a saída de "Aguardando atendimento". Decisão (project-sla-atendimento-decisoes, G):
alinhar a `distribuição → primeiro_atendimento_em` (trigger 75-45), igual ao relatório (75-46).
O card já é ordenado por tempo asc → serve de painel (#2) E ranking de velocidade (#3).

## Escopo
**IN:** em `analytics/page.tsx`: (a) selecionar leads ATENDIDOS no período
(`primeiro_atendimento_em` em [since,until)); (b) tempo = `primeiro_atendimento_em −
lead_distribution_log.created_at` (distribuição mais recente antes do atendimento); (c) atualizar
subtítulo; (d) limiar de cor alinhado à meta de SLA = 60 min (≤60 verde, ≤120 laranja, >120
vermelho); (e) texto de vazio.
**OUT:** SLA config, alerta/escalonamento, indicador na lista (stories seguintes do pacote).

## Acceptance Criteria
1. Card mede distribuição → atendimento; lead sem distribuição registrada fica de fora.
2. Atribuição ao `assigned_broker_id`; respeita `HIDDEN_BROKER_NAMES` e `activeBrokerIds`.
3. Ordenado por tempo asc (mais rápido primeiro) = ranking de velocidade.
4. Cor verde até 60 min (meta SLA). Subtítulo e vazio atualizados.
5. typecheck/lint limpos. (Caveat aceito: só mede desde 24/06/2026.)

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.47-analytics-tempo-atendimento-distribuicao.yml`)
- Mesma lógica validada na 75-46. type-check/lint limpos.

## File List
- `packages/web/src/app/dashboard/analytics/page.tsx`

## Change Log
- 2026-06-24 — @sm/@dev/@qa — Card corrigido p/ distribuição→atendimento (#2+#3 do pacote SLA).
