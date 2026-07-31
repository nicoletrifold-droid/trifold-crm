# Story 75-247 — Visita órfã ganha dono junto com o lead

**Status:** InReview
**Tipo:** Fix de comportamento (distribuição + notificação)
**Epic:** Agendamento da Nicole
**Complexidade:** S

## Contexto

Descoberto na investigação da [75-245](75-245-nicole-agendamento-fantasma.story.md)
(lead Ailton Gouvea, 30/07/2026): a Nicole atende 24h e **agenda visita antes da
roleta distribuir o lead**. Nesse caso o appointment nasce com `broker_id = NULL`
— o pipeline copia o dono do lead, que ainda não existe — e o próprio código já
avisa disso emitindo `APPOINTMENT_NO_BROKER`. Quando a roleta finalmente dá um
dono ao lead, o `broker_id` da visita **continuava nulo para sempre**: o corretor
recebia "novo lead" e não tinha como saber que aquele lead já tinha visita
marcada. A visita aparecia na agenda sem corretor, e nenhuma notificação de
visita chegava a ninguém.

Levantamento em prod (31/07): **9 visitas** já nasceram sem corretor —
4 criadas pela Nicole (06/06 a 26/07) e 5 por admin em código antigo. Todas com
o lead **já tendo dono** no momento da consulta, o que confirma que o dono chega
depois e a visita fica atrás. Nenhuma delas é futura (todas `no_show`/
`completed`) → **não há backfill a fazer**, só parar de produzir novas.

## Critérios de aceite

- **AC1** — Dado um lead sem dono com visita FUTURA e `broker_id` nulo, quando a
  roleta distribui o lead, então a visita passa a ter aquele corretor.
- **AC2** — Dado o mesmo cenário, quando a visita é carimbada, então o corretor é
  **notificado** com o horário da visita ("Lead novo COM visita marcada") e uma
  activity `appointment_updated` registra a origem (roleta, bolsão, manual…).
- **AC3** — Dado que a visita **já tem** corretor, quando qualquer caminho de
  atribuição roda, então nada muda e ninguém é notificado (no-op idempotente —
  é o que permite chamar o helper de qualquer lugar sem efeito colateral).
- **AC4** — Dado visita **passada**, **cancelada** ou **de outro lead**, quando o
  claim roda, então ela não é tocada.
- **AC5** — Cobertura dos caminhos que dão dono a um lead: roleta (fluxo da RPC
  **e** fluxo de atendimento contínuo por telefone), bolsão (`pegar`), atribuição
  manual (`assign`), edição do lead (`PATCH`) e transferência.
- **AC6** — Falha de banco ou de notificação **não derruba** a distribuição
  (best-effort, mesma política de `notify-appointment.ts`).
- **AC7** — Zero regressão: suíte completa verde, `tsc` limpo, lint 0 erros,
  build OK.

## Escopo

**IN:**
- `packages/web/src/lib/appointments/claim-orphan-visits.ts` (novo) —
  `claimOrphanVisitsForBroker` + `formatVisitWhen`.
- `packages/web/src/lib/broker/notify-appointment.ts` — variante `inherited`.
- Chamadas em `roleta/distributor.ts` (2 caminhos),
  `api/bolsao/[id]/pegar`, `api/leads/[id]/assign`, `api/leads/[id]` (PATCH),
  `api/leads/[id]/transferir`.
- `claim-orphan-visits.test.ts` (7 testes).

**OUT (decidido, não é esquecimento):**
- **Mover visita que JÁ tem corretor quando o lead é transferido.** O filtro
  `broker_id IS NULL` deliberadamente não faz isso: mudar a agenda de outra
  pessoa por causa de uma transferência é decisão de produto (o corretor antigo
  perde um compromisso já reservado). Precisa da palavra do Marcos.
- Backfill retroativo — as 9 órfãs são todas passadas; não há o que corrigir.
- Os 5 casos `created_by=admin`: `/api/appointments` já faz
  `broker_id: body.broker_id || appUser.id`, ou seja, o caminho atual não produz
  órfã. São resquício de código antigo.
- Corrigir a visita do próprio Ailton: feito à mão em prod na 75-245.

## Dependências

Nenhuma migração. Independente da 75-245 (arquivos diferentes: `web` × `ai`),
pode ir para prod antes ou depois.

## Riscos

- **Chamada a mais em caminho quente:** o `PATCH` de lead só chama quando
  `assigned_broker_id` veio na requisição — arrastar card no kanban não paga o
  custo. Nos outros caminhos é 1 update filtrado por lead.
- **Notificação duplicada:** se a Nicole tivesse criado a visita já com corretor,
  ele recebe o aviso de "Visita Agendada" no ato; o `inherited` só existe para o
  caso em que ninguém foi avisado. Como o claim é no-op quando há corretor, os
  dois avisos não coexistem.

## QA Gate — PASS

- 7 testes novos no helper, cobrindo AC1–AC4 e AC6 com o query-builder fake
  aplicando os filtros de verdade (prova que passada/cancelada/de-outro-lead e
  visita-com-dono não são tocadas).
- Suíte completa: **1346 testes, 123 arquivos, verde**. `tsc` limpo em `web`.
  `npm run lint` 0 erros (18 warnings pré-existentes). `npm run build` OK.
- Efeito colateral verificado: `distributor.test.ts` continua verde — com mock
  que não conhece `appointments`, o helper cai no `catch` e devolve 0 sem
  derrubar a distribuição, exatamente o comportamento best-effort do AC6.

## Pendências antes de Done

- Deploy (@devops).
- Validar no próximo lead que a Nicole agendar fora do horário comercial: o
  corretor da roleta deve receber **dois** avisos (novo lead + visita marcada) e
  a visita deve aparecer na agenda **com o nome dele**.
