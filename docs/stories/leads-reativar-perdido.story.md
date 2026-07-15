# Story — Reativar lead perdido (motivo + corretor do empreendimento)

**Status:** Done
**Epic:** Leads / Gestão do funil
**Relacionado:** `mark-lost` (inverso — marca perdido), `transferir` (template de motivo+push+activity), roleta/distributor (guard Perdido por ETAPA; filtro por empreendimento via `broker_assignments`), SLA ([[project-sla-atendimento-decisoes]]), [[project-lead-perdido-ressuscitado]] (Perdido = terminal p/ AUTOMAÇÃO — reativação MANUAL é a saída prevista), [[feedback-nicole-nunca-move-etapa]]
**Complexidade:** M (1 endpoint novo GET+POST, 1 componente novo, 3 arquivos alterados; sem migration)

## Contexto
Na aba **Perdidos** de `/dashboard/leads` (`?view=perdidos`, 820 leads) não havia como retomar um
lead perdido. Necessidade do diretor: **trabalhar** esses leads e, quando o cliente retorna, **reativar**
— reatribuindo a um corretor (o mesmo ou outro) com registro do **motivo**. Liberado para
**admin/supervisor/gerente-comercial**.

### Fundamentos confirmados no código
- **"Perdido" é ETAPA**, não `lost_reason`: `PERDIDO_STAGE_IDS` (Perdido + Não Qualificado) em
  `lib/leads/stage-filters.ts`. A aba filtra `stage_id in PERDIDO_STAGE_IDS`.
- **Reativação manual é a saída prevista do Perdido:** o guard da automação
  (`distributor.ts`, `156_roleta_pick_no_perdido.sql`) é por **etapa atual** — ao sair de Perdido para
  `STAGE_IDS.novo`, o lead volta a fluir sem conflito. Nenhum caminho service-role reativa sozinho.
- **`assigned_broker_id` guarda `users.id`**; `broker_assignments.broker_id` guarda `brokers.id`
  (mapear via `brokers.user_id`). O seletor grava o `user_id`.
- **SLA** é dirigido por `distribuido_em` + gate `stage_id = novo` e `primeiro_atendimento_em IS NULL`
  (`cron/sla-alerts`). Para "tratar como lead novo" é preciso resetar esses campos.

## Story
**As a** admin/supervisor/gerente-comercial,
**I want** um botão "Reativar" em cada lead perdido que peça o **motivo** e o **corretor** (do
empreendimento do lead),
**so that** eu retome o atendimento — com o mesmo corretor ou outro — quando o cliente volta.

## Acceptance Criteria
1. **AC1** — Na aba **Perdidos**, cada linha tem botão **"Reativar"** visível só para
   admin/supervisor/gerente-comercial. Fora da aba Perdidos ou para outros perfis, não aparece.
2. **AC2** — Ao clicar, um modal pede **corretor** (obrigatório) e **motivo** (obrigatório). O seletor
   lista os corretores **vinculados ao empreendimento do lead** (`broker_assignments.property_id =
   lead.property_interest_id`), começando pelo corretor atual se estiver na lista.
3. **AC3** — **Fallback:** se o lead não tem empreendimento OU nenhum corretor vinculado está
   disponível, o seletor mostra **todos os corretores ativos** (broker + gerente-comercial), com aviso
   (mesma filosofia do fallback da roleta, 75-44).
4. **AC4** — Ao confirmar, o lead: recebe `assigned_broker_id` = corretor escolhido; volta para
   `STAGE_IDS.novo` ("Aguardando atendimento"); **reinicia o SLA como lead novo**
   (`distribuido_em=now`, `primeiro_atendimento_em=null`, `sla_alerta_*_em=null`, `bolsao_em=null`);
   `lost_reason` limpo. Sai da aba Perdidos e aparece em "Em atendimento".
5. **AC5** — Registra **activity** `lead_reactivated` (com `metadata.motivo`, corretor destino,
   `previous_lost_reason`) + **audit log** `lead.reactivate`; a timeline exibe "Lead reativado" +
   "Motivo: …". Envia **push** ao corretor destino (`/broker/leads/{id}`).
6. **AC6** — Gate no servidor: `requireRole(["admin","supervisor","gerente-comercial"])` no GET e no
   POST. POST recusa se o lead **não** está em `PERDIDO_STAGE_IDS` (422) e se o corretor destino é
   inválido (422).
7. **AC7** — IA não reassume: `conversations.is_ai_active=false` na reativação (transferência manual —
   [[feedback-nicole-nunca-move-etapa]]).
8. **AC8** — **Sem migration** (todos os campos já existem). Sem alteração no `mark-lost`/roleta/broker.

## Tasks / Subtasks
- [x] **Endpoint** `app/api/leads/[id]/reativar/route.ts` (GET elegíveis + POST reativa) — espelho do
      `transferir` + `mark-lost` (audit).
- [x] **Componente** `components/leads/reativar-lead-button.tsx` — botão por linha + modal (busca
      elegíveis no GET, default no corretor atual, motivo obrigatório).
- [x] **Tabela** `components/leads/leads-bulk-table.tsx` — props `view` + `canReactivate`; botão na
      célula de ação só na aba Perdidos p/ gestores.
- [x] **Página** `app/dashboard/leads/page.tsx` — passa `view` e `canReactivate`.
- [x] **Timeline** `app/dashboard/leads/[id]/timeline/page.tsx` — label "Lead reativado" + ícone ♻️ +
      leitura de `metadata.motivo`.
- [x] **Verificação** — tsc 0, eslint 0 (2 warnings pré-existentes), `next build` OK, `npm test` 975 pass.

## Dev Notes
- **Reuso:** `transferir` (push+activity+createAdminClient), `mark-lost` (logAudit+getRequestIp),
  seletor de corretor do empreendimento espelhando o filtro `broker_assignments` da RPC da roleta.
- **Gotcha `broker_id` vs `user_id`:** GET faz `broker_assignments(property_id) → brokers(id,in) →
  brokers.user_id`, retorna `userId` (grava em `assigned_broker_id`).
- **SLA "como lead novo":** decisão de produto — reinicia o cronômetro (corretor 10min / gestor 60min).
- **`is_active` do lead:** NÃO é tocado (o `mark-lost` também não seta `is_active=false`; o lead
  perdido continua `is_active=true`, só muda de etapa).

### Testing
- Sem teste unitário novo (padrão das telas de leads). Suíte existente verde (975).
- E2E em preview/prod: (1) botão só na aba Perdidos p/ gestor; (2) modal lista corretores do
  empreendimento (ou fallback); (3) reativar → some de Perdidos, entra em atendimento com o corretor;
  (4) push chega; (5) timeline mostra "Lead reativado" + motivo; (6) perfil corretor não vê o botão.

## Out of Scope
- Reativação em massa (bulk) — só individual por linha nesta story.
- Alterar `mark-lost`, roleta/distributor, `broker_assignments`.
- Reengajar via IA/Nicole — IA fica desligada (corretor atende).

## Riscos
- **Lead "ressuscitado" pela automação** → mitigado: guard é por etapa; ao ir p/ `novo` o lead é
  legítimo, e não chamamos o distributor (UPDATE direto).
- **Corretor sem vínculo no empreendimento** → fallback p/ todos ativos, com aviso (AC3).
- **Enxurrada de alertas SLA** ao reativar em lote → é o comportamento escolhido ("tratar como lead
  novo"); reativação é individual, mitigando volume.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 0.1 | Story criada: botão Reativar na aba Perdidos (motivo + corretor do empreendimento), lead volta p/ "Aguardando atendimento", SLA como lead novo, activity+audit+push. Gate admin/supervisor/gerente-comercial. | @sm (River) |
| 2026-07-15 | 1.0 | Validada (@po). ACs testáveis; escopo IN/OUT claro; gotchas (broker_id×user_id, guard por etapa, campos de SLA) conferidos contra o código. GO. Draft→Ready. | @po (Pax) |
| 2026-07-15 | 1.1 | Implementada (@dev). Endpoint reativar GET+POST, componente ReativarLeadButton, props view/canReactivate na tabela, timeline lead_reactivated. tsc 0, eslint 0, build OK, 975 testes verdes. Ready→Review. | @dev (Dex) |
| 2026-07-15 | 1.2 | QA gate **PASS** (@qa). 7 checks OK; sem regressão (975 pass); gate por role no servidor + guard 422 fora de Perdido; SLA reiniciado conforme decisão. E2E delegado a preview/prod. Review→Done. | @qa (Quinn) |

## Dev Agent Record
### Agent Model Used
claude-opus-4-8[1m]

### File List
- `packages/web/src/app/api/leads/[id]/reativar/route.ts` (novo)
- `packages/web/src/components/leads/reativar-lead-button.tsx` (novo)
- `packages/web/src/components/leads/leads-bulk-table.tsx` (modificado)
- `packages/web/src/app/dashboard/leads/page.tsx` (modificado)
- `packages/web/src/app/dashboard/leads/[id]/timeline/page.tsx` (modificado)
- `docs/stories/leads-reativar-perdido.story.md` (novo)

## QA Results

### Review Date: 2026-07-15
### Reviewed By: Quinn (Test Architect)

| # | Check | Veredito | Evidência |
|---|-------|----------|-----------|
| 1 | Code review | **PASS** | Endpoint espelha `transferir`/`mark-lost`; GET resolve corretores do empreendimento (broker_assignments→brokers.user_id) com fallback; POST valida Perdido + corretor. |
| 2 | Unit tests | **PASS** | Sem teste novo (padrão leads); suíte 89 files / **975 pass**, sem regressão. |
| 3 | Acceptance criteria | **PASS** | AC1-AC8 rastreados. Gate por role no GET/POST; guard 422 fora de Perdido; campos de SLA resetados; activity+audit+push; timeline `lead_reactivated`. |
| 4 | No regressions | **PASS** | Mudanças aditivas (rota/componente novos; props com default); `mark-lost`/roleta intactos; build gera `/api/leads/[id]/reativar`. |
| 5 | Performance | **PASS** | GET: 1-2 queries pequenas; POST: 1 update + inserts fire-and-forget (push/audit com `void`). |
| 6 | Security | **PASS** | `requireRole(["admin","supervisor","gerente-comercial"])`; admin client escopado por org_id; validação de corretor destino. |
| 7 | Documentation | **PASS** | Story + Dev Agent Record + este gate. |

**Build/qualidade:** tsc 0 · eslint 0 (2 warnings pré-existentes, não introduzidos) · `next build` Compiled successfully · `npm test` 975 pass.

### Gate Status
Gate: PASS → docs/qa/gates/leads-reativar-perdido.yml

— Quinn 🛡️
