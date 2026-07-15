# Story — Reativar lead perdido: opção "Devolver para a roleta"

**Status:** Done
**Epic:** Leads / Gestão do funil
**Relacionado:** [[project-roleta]], `leads-reativar-perdido.story.md` (base — modal + endpoint), `distributor.ts` (`distributeLeadToNextBroker`), `POST /api/roleta/distribute` (template de chamada)
**Complexidade:** S (incremento sobre a reativação; 2 arquivos alterados, sem migration)

## Contexto
A reativação de lead perdido (story anterior) só permitia escolher um **corretor específico**. Pedido
do diretor: no mesmo modal, adicionar uma opção **destacada** para **devolver o lead à roleta** — a
roleta distribui automaticamente, **na ordem dela**, para o próximo corretor elegível.

### Fundamentos confirmados
- `distributeLeadToNextBroker(leadId, orgId)` (`distributor.ts:40`) faz a distribuição round-robin;
  usa admin client próprio; retorna `{ status, brokerId?, brokerUserId? }`.
- A roleta **só pega** lead com `assigned_broker_id=null`, `bolsao_em=null`, fora de Perdido,
  `segmento≠imob` (guards `distributor.ts:78-111`). O distributor NÃO tira o lead de Perdido — é
  preciso mover para `novo` antes de chamar.
- Quando não há corretor livre / fora de horário / roleta inativa, o distributor **não** joga no
  bolsão nem muda etapa: loga a tentativa e devolve o status; o cron `roleta-retry` reprocessa.

## Story
**As a** admin/supervisor/gerente-comercial,
**I want** uma opção destacada "Devolver para a roleta" no modal de reativar,
**so that** o lead perdido volte ao rodízio automático em vez de eu escolher um corretor na mão.

## Acceptance Criteria
1. **AC1** — No seletor do modal de reativar, a primeira opção é **"🎲 Devolver para a roleta
   (distribuição automática)"**, visualmente destacada (aviso em cor de destaque ao selecionar), acima
   dos corretores. Motivo continua obrigatório.
2. **AC2** — Ao confirmar com a roleta: o lead sai de Perdido para `STAGE_IDS.novo`, fica **sem
   corretor** e com SLA zerado; então `distributeLeadToNextBroker` é chamado e a roleta atribui o
   próximo corretor na ordem dela (carimba `assigned_broker_id`/`distribuido_em`, notifica o corretor).
3. **AC3** — Se a roleta não distribuir na hora (`sem_corretor_disponivel`/`fora_horario`/
   `roleta_inativa`/`sem_config`), o lead **já saiu de Perdido** e fica em "Aguardando atendimento"
   aguardando o rodízio (cron `roleta-retry`); a UI avisa o gestor do status.
4. **AC4** — Registra `activity` `lead_reactivated` com `metadata.via_roleta=true` + `roleta_status` +
   audit `lead.reactivate`. IA desligada na conversa.
5. **AC5** — O modo "corretor específico" continua idêntico ao da story base (sem regressão).
6. **AC6** — Gate `requireRole(["admin","supervisor","gerente-comercial"])`; POST recusa 422 se o lead
   não está em Perdido. Sem migration.

## Tasks
- [x] Endpoint `reativar/route.ts`: sentinela `broker_id="__roleta__"` → pré-update distribuível +
      `distributeLeadToNextBroker` + activity/audit com `via_roleta`; modo corretor inalterado.
- [x] Modal `reativar-lead-button.tsx`: opção "🎲 Devolver para a roleta" + aviso destacado (emerald) +
      alerta amigável quando a roleta não distribui na hora.
- [x] Verificação: tsc 0, eslint 0, `next build` OK, `npm test` 975 pass.

## Dev Notes
- Reuso de `distributeLeadToNextBroker` (mesma chamada de `POST /api/roleta/distribute`).
- Ordem obrigatória: **primeiro** tirar de Perdido (update), **depois** chamar a roleta (senão o guard
  `perdido` do distributor retorna sem fazer nada).
- `distribuido_em=null` no pré-update (roleta carimba ao distribuir); demais campos de SLA zerados.

## Out of Scope
- Alterar a lógica da roleta/distributor, crons ou o bolsão.
- Reativação em massa.

## Riscos
- **Lead órfão** se a roleta estiver inativa → mitigado: UI avisa o status; lead fica em "Aguardando
  atendimento" e o `roleta-retry` reprocessa quando voltar.
- **Guard `perdido` do distributor** → mitigado pela ordem (update antes da chamada) + status
  `perdido`/`em_bolsao` tratados como sinal de bug no pré-update.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 0.1 | Story criada: opção "Devolver para a roleta" no modal de reativar (distribuição automática na ordem da roleta). | @sm (River) |
| 2026-07-15 | 1.0 | Validada (@po). ACs testáveis; ordem update→distribuir e tratamento de status conferidos contra `distributor.ts`. GO. | @po (Pax) |
| 2026-07-15 | 1.1 | Implementada (@dev). Sentinela `__roleta__` no endpoint + opção destacada no modal. tsc 0, eslint 0, build OK, 975 testes verdes. | @dev (Dex) |
| 2026-07-15 | 1.2 | QA gate **PASS** (@qa). Sem regressão (975 pass); modo corretor inalterado; gate por role + 422 fora de Perdido; ordem update→roleta correta. E2E delegado a preview/prod. | @qa (Quinn) |

## Dev Agent Record
### File List
- `packages/web/src/app/api/leads/[id]/reativar/route.ts` (modificado — modo roleta)
- `packages/web/src/components/leads/reativar-lead-button.tsx` (modificado — opção destacada)
- `docs/stories/leads-reativar-roleta.story.md` (novo)

## QA Results
### Review Date: 2026-07-15 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | Branch `__roleta__` faz pré-update distribuível + `distributeLeadToNextBroker`; modo corretor intacto. |
| Unit tests | PASS | 89 files / 975 tests, sem regressão. |
| Acceptance criteria | PASS | AC1-AC6 rastreados. |
| No regressions | PASS | Modo corretor específico inalterado; roleta/crons não tocados. |
| Performance | PASS | 1 update + 1 chamada de roleta (awaited); inserts fire-and-forget. |
| Security | PASS | requireRole gestores; admin client escopado por org; 422 fora de Perdido. |
| Documentation | PASS | Story + gate. |

Build: tsc 0 · eslint 0 · next build OK · npm test 975 pass.
Gate: PASS → docs/qa/gates/leads-reativar-roleta.yml
— Quinn 🛡️
