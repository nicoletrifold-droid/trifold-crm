# Story 75-45-c — Relatório diário: linha por-corretor conta leads únicos

## Metadata
- **Status:** Done
- **Epic:** 75 — Relatórios / SLA
- **Branch:** story-75-45c-relatorio-corretor-unicos

## Context
Follow-up da 75-45-b. A linha "Por corretor (distribuídos → atenderam)" contava por EVENTO de `lead_distribution_log`: se um lead era redistribuído ao mesmo corretor, contava 2; se ia para outro corretor, aparecia nos dois. Inflava quem recebeu redistribuição. Decisão (Marcos, 2026-07-10): contar LEADS ÚNICOS por corretor.

## Acceptance Criteria
- [x] AC1: por corretor, `distribuídos` = leads DISTINTOS que ele recebeu na janela (redistribuição do mesmo lead ao mesmo corretor conta 1).
- [x] AC2: um lead distribuído a 2 corretores conta 1 para cada (cada um de fato o recebeu).
- [x] AC3: `atenderam` = dos leads distintos do corretor, quantos já saíram de "novo" (stage atual != novoId).
- [x] AC4: sem regressão no restante do relatório; funções puras testadas.

## Out of Scope
- Atribuir "atenderam" ao corretor que de fato atendeu (hoje é heurística por stage atual do lead — mesma da 75-45; não há atendimento por-corretor no schema).
- Linha "Distribuídos" do topo (já tratada na 75-45-b).

## Complexity
- **T-shirt:** XS (extração de `aggregateBrokerRows` + testes).

## Business Value
A carga por corretor passa a refletir leads reais atendidos, não eventos inflados por redistribuição — leitura mais justa para o diretor.

## Risks
- Baixo. Só muda a contagem por-corretor; nenhuma mudança de distribuição/template/schema.

## File List
- `docs/stories/75-45-c-relatorio-corretor-leads-unicos.story.md` (this file)
- `packages/web/src/lib/reports/daily-leads-report.ts` (`aggregateBrokerRows` puro + wiring)
- `packages/web/src/lib/reports/daily-leads-report.test.ts` (+4 testes)

## QA Results (@qa / Quinn)
- **Gate: PASS.** 876/876 testes (4 novos de `aggregateBrokerRows`: dedup mesmo corretor, split entre corretores, atenderam por lead distinto, vazio), `tsc` 0, ESLint limpo. Sem template/schema.
