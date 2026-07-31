# Story 75-247 — A visita acompanha o dono do lead

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
- **AC7** — **Transferência de lead move a visita** (decisão do Marcos,
  31/07/2026): dado um lead com visita futura, quando o lead é transferido para
  outro corretor, então a visita passa a ser do novo dono **mesmo já tendo
  corretor** — "as notificações e todo histórico vai para o novo". O corretor
  ANTIGO é avisado que a visita saiu da agenda dele.
- **AC8** — Nenhuma das duas funções toca visita `team='imob'`: visita de
  imobiliária nasce com `broker_id` nulo **de propósito** (dono = `imobiliaria_id`
  + `metadata.corretor_parceiro`). Carimbar corretor da casa nela invadiria o
  mundo IMOB (Epic 81).
- **AC9** — Zero regressão: suíte completa verde, `tsc` limpo, lint 0 erros,
  build OK.

## Escopo

**IN:**
- `packages/web/src/lib/appointments/claim-orphan-visits.ts` (novo) —
  `claimOrphanVisitsForBroker` (adota órfã), `transferHouseVisitsToBroker`
  (move com o lead) + `formatVisitWhen`.
- `packages/web/src/lib/broker/notify-appointment.ts` — variantes `inherited` e
  `moved_out`.
- Chamadas em `roleta/distributor.ts` (2 caminhos),
  `api/bolsao/[id]/pegar`, `api/leads/[id]/assign`, `api/leads/[id]` (PATCH),
  `api/leads/[id]/transferir`.
- `claim-orphan-visits.test.ts` (12 testes).

**OUT (decidido, não é esquecimento):**
- Visita `team='imob'`: fica como está (dono é a imobiliária). Ver AC8.
- Backfill retroativo — as 9 órfãs são todas passadas; não há o que corrigir.
- Os 5 casos `created_by=admin`: `/api/appointments` já faz
  `broker_id: body.broker_id || appUser.id`, ou seja, o caminho atual não produz
  órfã. São resquício de código antigo.
- Corrigir a visita do próprio Ailton: feito à mão em prod na 75-245.

## Dependências

Nenhuma migração. Independente da 75-245 (arquivos diferentes: `web` × `ai`),
pode ir para prod antes ou depois.

## Bug encontrado na própria story (antes do merge)

A primeira versão do claim **não filtrava por `team`**. Como visita IMOB é criada
com `broker_id: null` por design (`api/agendar/[token]`), qualquer lead IMOB que
ganhasse dono teria a visita da imobiliária carimbada com um corretor da casa.
Achado ao investigar a decisão de transferência; corrigido com `.eq("team",
"house")` nas duas funções + teste dedicado (AC8).

## Riscos

- **Chamada a mais em caminho quente:** o `PATCH` de lead só chama quando
  `assigned_broker_id` veio na requisição — arrastar card no kanban não paga o
  custo. Nos outros caminhos é 1 update filtrado por lead.
- **Notificação duplicada:** se a Nicole tivesse criado a visita já com corretor,
  ele recebe o aviso de "Visita Agendada" no ato; o `inherited` só existe para o
  caso em que ninguém foi avisado. Como o claim é no-op quando há corretor, os
  dois avisos não coexistem.

## QA Gate — PASS

- 12 testes novos, cobrindo AC1–AC4, AC6, AC7 e AC8 com um query-builder fake
  **thenable** que aplica os filtros de verdade (o claim faz
  `update().eq()…select()` e a transferência faz `select().eq()…` — ordem
  inversa; o efeito só vale quando a promise resolve). Prova que passada,
  cancelada, de-outro-lead e **IMOB** não são tocadas; que o claim não rouba
  visita com dono; e que a transferência move mesmo com dono, avisando os dois
  lados na ordem certa (`inherited` para quem recebe, `moved_out` para quem
  perde).
- Suíte completa: **1351 testes, 123 arquivos, verde**. `tsc` limpo em `web`.
  `npm run lint` 0 erros (18 warnings pré-existentes). `npm run build` OK.
- Efeito colateral verificado: `distributor.test.ts` continua verde — com mock
  que não conhece `appointments`, o helper cai no `catch` e devolve 0 sem
  derrubar a distribuição, exatamente o comportamento best-effort do AC6.

## Pendências antes de Done

- Deploy (@devops).
- Validar no próximo lead que a Nicole agendar fora do horário comercial: o
  corretor da roleta deve receber **dois** avisos (novo lead + visita marcada) e
  a visita deve aparecer na agenda **com o nome dele**.
- Validar uma transferência real de lead com visita marcada: a visita troca de
  nome na Agenda, o novo corretor é avisado e o antigo recebe "Visita saiu da sua
  agenda".
