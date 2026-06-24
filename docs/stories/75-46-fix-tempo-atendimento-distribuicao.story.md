# Story 75-46 — Fix: tempo de atendimento do relatório = distribuição → atendimento

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** S (1-2 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** diretor (Alexandre), **I want** que o "tempo médio de atendimento" do relatório diário
meça **da distribuição (quando o corretor recebe) até o atendimento**, **so that** o número seja
justo com o corretor e não conte a espera da roleta.

## Contexto
A Story 75-45 entregou o relatório usando `primeiro_atendimento_em − created_at` (ENTRADA do lead
→ atendimento). Isso é injusto: inclui o tempo que o lead esperou a roleta distribuir (ex.: lead
que entrou 3h da manhã e foi atendido às 8h05 conta ~5h, mesmo o corretor pegando em 5 min).
Decisão do usuário (2026-06-24): medir **distribuição → atendimento**.
- Início = `lead_distribution_log.created_at` (status='distributed') — quando o corretor recebeu.
- Fim = `primeiro_atendimento_em` (trigger da 75-45 já carimba a saída de "Aguardando atendimento").

## Escopo
**IN:** em `lib/reports/daily-leads-report.ts`, trocar o cálculo de `durations`: para cada lead
atendido na janela (`primeiro_atendimento_em >= since`), pegar a distribuição **mais recente antes**
do atendimento (`lead_distribution_log.created_at <= primeiro_atendimento_em`, status='distributed')
e calcular `primeiro_atendimento_em − distribuição`. Lead sem distribuição registrada (ex.: atribuição
manual) fica de fora da média.

**OUT:**
- Trocar o relógio nos OUTROS lugares / card de analytics / alertas (pacote SLA, decisões C-H — story futura).
- Mudar o trigger ou o template.

## Acceptance Criteria
1. `durations` passa a ser `primeiro_atendimento_em − lead_distribution_log.created_at` (distribuição
   correspondente = a mais recente antes do atendimento), não mais `− created_at`.
2. Lead atendido sem registro de distribuição não entra na média (não quebra, não conta 0).
3. Formatadores (`formatTempo`/`formatDuration`) inalterados; testes existentes seguem verdes.
4. typecheck/lint/vitest limpos.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.46-fix-tempo-atendimento-distribuicao.yml`)
- 14 testes (formatadores) verdes; type-check/lint limpos. Cálculo agora distribuição→atendimento.

## File List
- `packages/web/src/lib/reports/daily-leads-report.ts`

## Change Log
- 2026-06-24 — @sm — Story criada. Correção do ponto de partida do tempo de atendimento (decisões A/B
  de [[project-sla-atendimento-decisoes]]).
