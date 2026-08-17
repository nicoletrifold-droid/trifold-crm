# Story 75-325 — "Visitas da semana" sai da agenda, não de uma coluna quase sempre nula

**Story ID:** 75-325 · **Status:** InReview · **Estimativa:** XS (~1 pt)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · Origem: auditoria do Analytics (17/08), item 6

## O relato e o diagnóstico

`/api/dashboard/metrics` devolvia `scheduled_visits_week` a partir de
`leads.visit_scheduled_at` cruzado com a etapa atual "Visita Agendada". As duas condições
estavam erradas:

1. **A coluna é quase sempre nula.** Medido em prod (17/08/2026): **12 leads** têm
   `visit_scheduled_at` preenchido contra **59 leads com agendamento** — ou seja, 52 leads
   têm visita marcada e a coluna vazia. Ela só é escrita por alguns caminhos; a agenda
   (`appointments`) é que é a fonte da verdade.
2. **Exigir a etapa atual descartava quem já visitou.** Quem avançou saía da conta, o
   mesmo defeito de fundo da 75-323.

Resultado da conta inteira: **0**, com 8 leads na etapa "Visita Agendada" e 4 compromissos
futuros no badge da Agenda.

De quebra, a semana era calculada em UTC. Entre 21h e a meia-noite de domingo, UTC e
Brasília discordam sobre em que semana estamos — e é exatamente o horário em que o dia
comercial vira (75-57).

### Correção do que eu havia reportado

Na auditoria eu descrevi isto como "um card do Dashboard mostrando 0". **Não é um card**:
nenhuma tela consome `/api/dashboard/metrics` hoje — a busca por consumidores no repo não
achou nenhum. O número errado existia e estava sendo servido pela API, mas não aparecia
para ninguém. A correção continua valendo (endpoint público que responde errado é dívida
esperando quem o consuma), mas a gravidade é menor do que a que eu passei.

## O que mudou

- `scheduled_visits_week` passa a contar `appointments` da equipe `house` (constante
  compartilhada com o Analytics — 75-322) com `scheduled_at` dentro da semana e status
  diferente de `cancelled`. Inclui as que já aconteceram: a pergunta é sobre a semana,
  não sobre o futuro.
- Semana ancorada em Brasília (segunda 00:00 BRT), com fim explícito — antes só havia
  `>= weekStart`, então "esta semana" incluía qualquer visita futura.
- Some a resolução da etapa `visita-agendada`, que existia só para esta conta.

## Evidências

Gates: `tsc` 0 · `eslint` 0 erros / 23 warnings (baseline) · `build` 5/5.

Conferência contra o banco: a query nova devolve **3** para a semana corrente (iniciada em
17/08 00:00 BRT); a antiga devolvia **0**.
