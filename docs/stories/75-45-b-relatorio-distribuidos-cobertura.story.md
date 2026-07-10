# Story 75-45-b — Corrige a linha "Distribuídos" do relatório diário (13 de 9)

## Metadata
- **Status:** Done
- **Epic:** 75 — Relatórios / SLA
- **Branch:** story-75-45b-relatorio-distribuidos

## Context
O diretor Alexandre recebe o relatório diário e notou que "Distribuídos" quase sempre é MAIOR que "Leads recebidos" (ex.: "Distribuídos: 13 de 9"). Investigação (2026-07-10):

- **"Leads recebidos"** = leads **criados** (`leads.created_at`) na janela do dia comercial.
- **"Distribuídos"** = linhas em `lead_distribution_log` (`status='distributed'`) na janela = **eventos de distribuição**, não leads únicos.

Dois motivos somados fazem eventos > recebidos, quase sempre (confirmado nos últimos 7 dias — eventos 12–15 vs leads únicos 7–13):
1. **Redistribuição**: lead não atendido → bolsão/roleta-retry → novo evento (mesmo lead, às vezes outro corretor).
2. **Carryover**: leads criados em dias anteriores distribuídos na janela atual.

O comentário do código (`ex.: "15 de 20"`) revela a **intenção original**: "X *dos* Y recebidos foram distribuídos" (cobertura). Mas a implementação contava eventos contra recebidos — denominadores diferentes → estourava. Não é bug de distribuição; é o número do relatório medindo a coisa errada.

**Decisão (Marcos, 2026-07-10):** trocar por cobertura real + transparência da redistribuição.

## Acceptance Criteria
- [x] AC1: a linha passa a medir cobertura real: `{cobertura} de {recebidos} recebidos`, onde cobertura = quantos DOS leads recebidos na janela foram distribuídos ao menos uma vez. Nunca mais "X de Y" com X > Y.
- [x] AC2: quando há eventos além da cobertura (redistribuição e/ou carryover), acrescenta `· {totalEventos} envios no total ({N} redistribuições)`. Redistribuições = totalEventos − leads únicos distribuídos.
- [x] AC3: caso 1:1 (sem redistribuição nem carryover) → só a cobertura ("5 de 5 recebidos").
- [x] AC4: uma linha só, sem quebra/tab/4+ espaços (regra de parâmetro de template Meta) — cabe no {{5}} existente, SEM mudar o template HSM.
- [x] AC5: pluralização correta (recebido/s, envio/s, redistribuição/ões); zero recebidos não quebra.

## Out of Scope
- Mudar o template HSM `relatorio_diario_leads` (mantido; só o valor do {{5}} muda).
- Mudar a métrica por-corretor "distribuídos→atenderam" (segue por evento; fora de escopo desta dúvida).

## Dependencies
- `lead_distribution_log`, `leads`, `previousCommercialDayRangeForOrg`. Cron `daily-report` (07:59 BRT).

## Complexity
- **T-shirt:** XS (1 helper puro novo + wiring + testes; sem migration, sem template).

## Business Value
O diretor passa a ler um número que faz sentido: quantos dos leads do dia foram distribuídos (cobertura/SLA) e, à parte, o volume de redistribuição — em vez do confuso "13 de 9".

## Risks
- Baixo. Só muda a string do {{5}}; nenhuma mudança de distribuição, template ou schema.

## Definition of Done
- AC1–AC5; testes 872/872; `tsc`+ESLint limpos; deploy via @devops (vale no relatório de amanhã, cron 07:59).

## File List
- `docs/stories/75-45-b-relatorio-distribuidos-cobertura.story.md` (this file)
- `packages/web/src/lib/reports/daily-leads-report.ts` (`formatDistribuidos` + cálculo de cobertura/leads únicos)
- `packages/web/src/lib/reports/daily-leads-report.test.ts` (+6 testes)

## QA Results (@qa / Quinn)
- **Gate: PASS.** 872/872 testes (6 novos de `formatDistribuidos` cobrindo o caso 13→"8 de 9", 1:1, carryover, singular, zero), `tsc` 0 erros, ESLint limpo. Causa raiz confirmada com dado real de prod (7 dias). Sem mudança de template/schema.
