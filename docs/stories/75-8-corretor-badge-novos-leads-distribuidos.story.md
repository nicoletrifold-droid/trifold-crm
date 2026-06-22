# Story 75-8 — Corretor: "pontinho laranja" de novos leads distribuídos (badge no menu)

## Metadata
- **Status:** InReview
- **Epic:** 51/63 — Corretor / Roleta
- **Branch:** main

## Context
Quando um lead é distribuído ao corretor (roleta), o sistema **já** dispara push/e-mail/WhatsApp via `notifyBroker()` (`lib/roleta/distributor.ts:242`), e as flags da org estão ligadas. O que **falta** é o indicador **persistente** ("pontinho laranja") de que há novos leads — hoje só existe um toast de 8s (`new-lead-notification.tsx`), nada que fique.

Diagnóstico em produção (org Trifold): push só chega em quem inscreveu (1/10 corretores) e WhatsApp não envia (0/10 têm telefone) — esses são gargalos de **dado/adoção**, não de código (push) e dependem de **template Meta** (WhatsApp → backlog). Esta story entrega só a parte de **código viável**: o badge persistente.

Decisão: padrão **`seen_at`** (igual a alertas/obras no dashboard). Fonte do "novo": `lead_distribution_log` (RLS `org_id = user_org_id()` permite o corretor ler; tem `broker_id` = `brokers.id` e `created_at`). WhatsApp e adoção de push ficam fora.

## Acceptance Criteria
- [x] AC1: Migration `105_users_leads_notifications_seen_at.sql` adiciona `leads_notifications_seen_at timestamptz NULL` em `users` (espelha 083).
- [x] AC2: No layout do corretor (`app/broker/layout.tsx`), o item "Meus Leads" exibe um badge com a contagem de distribuições novas: `lead_distribution_log` com `org_id` da org, `broker_id` = `brokers.id` do usuário logado, `status = 'distributed'` e `created_at > leads_notifications_seen_at` (quando seen_at é null, conta tudo). Se a contagem for 0, sem badge.
- [x] AC3: Server action `markLeadsSeen()` (em `app/broker/leads/actions.ts`) atualiza `users.leads_notifications_seen_at = now()` do usuário logado (role broker).
- [x] AC4: Um componente client invisível (`LeadsSeenMarker`) montado na página `/broker/leads` chama `markLeadsSeen()` ao montar — zera o badge ao abrir "Meus Leads" (mesma mecânica do `AlertasSeenMarker`).
- [x] AC5: Sem regressão no toast existente, no push da distribuição nem na roleta. Mudança restrita ao layout do corretor + nova action/marker + migration.

## Out of Scope
- WhatsApp ao corretor (depende de telefone dos corretores + template Meta → backlog).
- Aumentar adoção de push (corretores precisam permitir notificação/instalar PWA) — operacional.
- Notificar/registrar na atribuição **manual** (`leads/[id]/assign`) — o badge cobre a distribuição da roleta (caminho principal); manual fica para evolução.
- Atualização do badge em tempo real sem navegação (v1 é server-rendered; atualiza ao navegar/refresh, + toast já dá o aviso imediato).

## Dependencies
- Migration 105 aplicada em produção (igual à 104, via SQL Editor) antes/junto do deploy do código.

## Complexity
- **T-shirt:** S (migration de 1 coluna + contagem no layout + action + marker).

## Business Value
O corretor passa a ver de forma persistente que recebeu novos leads (no menu, PWA e web), sem depender do toast efêmero — aumenta a chance de atendimento rápido.

## Risks
- Baixo. Badge é leitura; `seen_at` null conta histórico (badge alto no 1º acesso, zera ao abrir Leads). Dependência de ordem no deploy (migration antes do código).

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, migration 105 aplicada via @devops, deploy via @devops.

## File List
- `docs/stories/75-8-corretor-badge-novos-leads-distribuidos.story.md` (this file)
- `supabase/migrations/105_users_leads_notifications_seen_at.sql` (new)
- `packages/web/src/app/broker/layout.tsx` (badge em "Meus Leads")
- `packages/web/src/app/broker/leads/actions.ts` (new — markLeadsSeen)
- `packages/web/src/app/broker/leads/_components/leads-seen-marker.tsx` (new)
- `packages/web/src/app/broker/leads/page.tsx` (montar o marker)

## Dev Notes (@dev / Dex)
- Migration 105: `leads_notifications_seen_at` em users + seed `UPDATE ... SET = now() WHERE role='broker'` (evita badge histórico gigante no 1º acesso).
- `broker/layout.tsx`: resolve `brokers.id` do usuário; lê `leads_notifications_seen_at`; conta `lead_distribution_log` (org, broker_id, status='distributed', created_at > seen_at) → badge no item "Meus Leads".
- `broker/leads/actions.ts`: `markLeadsSeen()` (admin client atualiza seen_at; revalida /broker layout).
- `broker/leads/_components/leads-seen-marker.tsx`: client, chama markLeadsSeen no mount (espelha AlertasSeenMarker).
- `broker/leads/page.tsx`: monta `<LeadsSeenMarker />`.
- type-check 0 erros no escopo; meus arquivos passam no eslint. (eslint aponta 1 erro PRÉ-EXISTENTE em page.tsx:91 — `Date.now()` no cálculo de `daysAgo`, não tocado por esta story.)

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC5. Badge validado com dados reais (6 corretores teriam contagem; ex.: Robson 124 histórico, mas o seed zera todos no deploy → contam só leads novos). markLeadsSeen zera ao abrir Meus Leads. Push da distribuição e toast inalterados. type-check limpo; único erro de eslint é pré-existente (page.tsx:91), fora de escopo.
**Pendência p/ @devops:** aplicar migration 105 (igual à 104, via SQL Editor) antes/junto do deploy do código.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready.
- @data-engineer (Dara): migration 105 (coluna seen_at + seed dos corretores).
- @dev (Dex): badge + action + marker. Status Ready → InReview.
- @qa (Quinn): QA gate PASS (validado em prod). Pronta para @devops *push (aplicar migration 105).
