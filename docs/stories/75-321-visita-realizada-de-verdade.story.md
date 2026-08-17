# Story 75-321 — "Visita realizada" volta a significar que a visita aconteceu

**Story ID:** 75-321 · **Status:** Done · **Estimativa:** S (~3 pts)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · Origem: auditoria do Analytics pedida pelo Marcos (17/08)

## O relato e o diagnóstico

Marcos comparou o card "Visitas" (3 realizadas de 6) com o Funil (Visita Agendada 4,
Visitou 1) e pediu conferência de alinhamento. Os números da tela estavam **certos** —
reproduzi as duas queries em prod e bateram. O que estava errado era o dado por trás.

Duas causas, ambas confirmadas em produção em 17/08/2026:

1. **O cron carimbava visita que não aconteceu.** `processNoShowDetection` (75-177) tinha
   dois caminhos para `completed`: lead já em etapa pós-visita (prova real) **e** "houve
   atividade humana do corretor depois do horário" (não é prova de nada). Prova: agendamento
   `5d809dc1-fcdb-4786-a440-0e382c5033dd` estava `completed`, sem feedback nenhum, e a
   última nota do corretor no lead era *"Cliente desmarcou"*.
   Escala medida: **7 das 26 visitas `completed` desde julho (27%) não têm feedback algum.**

2. **Faltava a opção "não compareceu" no formulário.** O corretor com visita furada só tinha
   o caminho de "visita realizada". Prova: lead do agendamento `732b3a72` recebeu feedback
   com o texto *"cli não compareceu, tentando remarcar"* em 15/08 13:11 → o sistema moveu
   para Visitou → **50 segundos depois** o corretor arrastou o card de volta para Atendimento.
   Resultado: o agendamento conta como realizada no card Visitas e o lead não conta em
   Visitou no Funil. Os dois cards discordando por falta de uma opção no formulário.

## O que mudou

- **Migration 230** — `appointment_status` ganha `closed`: agendamento encerrado SEM
  confirmação de presença. Não é realizada, não é no-show, não é cancelamento; fica fora
  dos três baldes do Analytics de propósito.
- **`no-show-decision.ts`** — o guard 2 (atividade do corretor após o horário) passa a
  devolver `close` em vez de `complete`. O guard 1 (etapa pós-visita) segue `complete`:
  ali a etapa é a prova. Encerra igual — a dor da 75-177 era o agendamento eterno e o lead
  revertido, e nenhum dos dois volta.
- **`applyNoShowFeedback`** (visit-feedback-core) — porta nova: `no_show` no agendamento,
  relato do corretor na linha do tempo, lead volta p/ a etapa de No-Show **só se estiver em
  Visita Agendada** (não regride lead que avançou), e a Nicole pós-visita **não** dispara.
  Não grava em `visit_feedback` — aquela tabela é o relato de uma visita que aconteceu; o
  "pendente de feedback" some sozinho porque o status sai de (scheduled, confirmed, completed).
- **`POST /api/appointments/[id]/feedback`** aceita `outcome: "visited" | "no_show"`
  (ausente = `visited`, compatível com os clientes antigos). `interest_after` só é exigido
  quando houve visita.
- **Formulário** — pergunta "O cliente compareceu?" antes de tudo; respondendo "Não", some
  o nível de interesse e o checkbox de proposta, o texto vira "O que aconteceu?" e o botão
  vira "Registrar ausência". A porta retroativa (visita sem agendamento) não mostra o
  seletor: lá não havia agendamento para furar.
- **`buildVisits`** — o `else` que varria status desconhecido para "agendadas" virou
  classificação explícita; `closed` entra em `totals.encerradas` e fica fora das 4 séries.
- **PDF** (`analytics-report-data.ts`) — `closed` entra na lista de exclusão para o status
  novo não nascer contado como realizada. A unificação da regra com a tela é a **75-322**.
- Rótulo "Encerrado sem registro" nos dois calendários e nos 3 mapas de status de timeline.

## Evidências

Gates: `tsc` 0 · `eslint` 0 erros / 23 warnings (baseline da 75-319, nenhum novo) · vitest
221 passed (16 arquivos), +2 casos novos: `close` no guard 2 e `closed` fora das séries do
`buildVisits`.

Consulta que originou a story (prod, janela 09→16/08): 6 agendamentos house — 3 `completed`,
1 `no_show`, 2 `cancelled`; dos 3 `completed`, um sem feedback (cliente desmarcou) e um cujo
lead foi devolvido à mão para Atendimento.

## Follow-up

Os **7 agendamentos `completed` sem feedback** já gravados continuam contados como realizadas
no histórico. Corrigir o passado é decisão do Marcos (pendente) — o código novo só impede
que aconteça de novo.
