# Story (BUG) — Lead reativado sumia do pipeline e ficava read-only (lost_reason residual)

**Status:** Done
**Tipo:** Bug fix (produção)
**Epic:** Leads / Gestão do funil
**Relacionado:** `leads-reativar-perdido.story.md`, `leads-reativar-roleta.story.md`, [[project-corretor-contagens-perdidos]] (convenção "perdido = ETAPA, nunca lost_reason"), Story 75-153
**Complexidade:** S (6 arquivos, mudanças de query/gate; sem migration)

## Sintomas (relato do diretor)
Lead **Maria Inês** foi reativado (movido de Perdido → Aguardando atendimento) e enviado à Valeria. Porém:
1. Valeria **visualiza mas não consegue editar** — o lead fica "como se estivesse perdido, não ativo".
2. O lead **não aparece no pipeline de ninguém** (kanban vazio ao buscá-lo).

## Causa-raiz (confirmada em dados + código)
Consulta em produção: o lead está em `stage_id` **"Atendimento"** (etapa **ativa**), atribuído à Valeria,
`is_active=true` — MAS com `lost_reason="invalido"` **residual**. As activities mostram que a reativação
foi por **mudança de etapa manual** (Perdido → Aguardando), caminho que **não limpa `lost_reason`**.

Apesar da convenção **"perdido = ETAPA, nunca lost_reason"**, várias superfícies ainda tratavam
`lost_reason != null` como "perdido", escondendo/travando o lead reativado:
- `dashboard/pipeline/page.tsx:111` — `.is("lost_reason", null)` escondia o lead do kanban. → **Bug 2**.
- `components/leads/lead-detail-drawer.tsx:308` — `isPerdido = ... || !!lead.lost_reason` deixava o
  lead **read-only** mesmo em etapa ativa. → **Bug 1**.
- `broker/leads/page.tsx:58` e `broker/page.tsx:137` — `.is("lost_reason", null)` escondia o lead da
  lista/home do corretor.

Nota: as etapas Perdido/Não Qualificado são `is_active=false` → **não são colunas do kanban** nem
aparecem nas listas por etapa; logo filtrar por ETAPA basta e o filtro por `lost_reason` era supérfluo
e nocivo.

## Correção
**Superfícies passam a gate por ETAPA, não por `lost_reason`** (honra a convenção):
1. `pipeline/page.tsx` — remove `.is("lost_reason", null)` (colunas já são só etapas ativas).
2. `lead-detail-drawer.tsx` — `isPerdido` só por ETAPA (`PERDIDO_STAGE_IDS`).
3. `broker/leads/page.tsx` — remove `.is("lost_reason", null)` (exclusão por ETAPA já existia — 75-153).
4. `broker/page.tsx` — remove `.is("lost_reason", null)` (já escopado à etapa "Aguardando", ativa).

**Higiene de dado — limpa `lost_reason` ao SAIR de Perdido** (evita dado sujo futuro):
5. `api/leads/[id]/stage/route.ts` — ao mudar de etapa vindo de `PERDIDO_STAGE_IDS`, seta
   `lost_reason=null` (etapa destino é sempre ativa/validada).
6. `api/leads/bulk/route.ts` — ao atribuir corretor (que já volta p/ "Aguardando"), seta
   `lost_reason=null` (o caminho "finalizar como perdido" continua prevalecendo depois).

**Hotfix de dado (produção):** o único lead afetado (Maria Inês, `3612d0a9…`) teve `lost_reason`
limpo (`"invalido"` → `null`) — alívio imediato antes do deploy. Query de varredura confirmou **1**
lead nesse estado.

## Acceptance Criteria
1. **AC1** — Lead em etapa ativa com `lost_reason` residual **aparece no pipeline** na coluna da sua etapa.
2. **AC2** — Esse lead é **editável** (drawer não o trata como perdido); o gate `isPerdido` é só por ETAPA.
3. **AC3** — O corretor vê o lead na sua lista/home (filtro por ETAPA, não por `lost_reason`).
4. **AC4** — Sair de Perdido (mudança de etapa ou atribuição em massa de corretor) **limpa** `lost_reason`.
5. **AC5** — Leads efetivamente em etapa Perdido/Não Qualificado **continuam** fora do pipeline e das
   listas ativas (sem regressão) e o drawer os trata como perdido.
6. **AC6** — Sem migration. Analytics (que conta "perdidos" por `lost_reason`) fora de escopo — ver Nota.

## Nota (fora de escopo)
Analytics (`analytics/*`, `analytics-report-data.ts`) ainda conta "perdidos" por `lost_reason`. Como a
reativação agora limpa `lost_reason`, o dado fica coerente daqui pra frente. Um alinhamento de analytics
para contar "perdido" por ETAPA pode ser uma story futura, se desejado.

## Verificação
- `tsc` 0, `eslint` 0 (warnings pré-existentes), `next build` OK, `npm test` **975 pass**.
- Hotfix de dado aplicado e confirmado (Maria Inês `lost_reason=null`).

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 1.0 | Bug fix: superfícies (pipeline, drawer, listas do corretor) passam a gate por ETAPA e não por lost_reason; limpa lost_reason ao sair de Perdido (stage + bulk); hotfix de dado 1 lead. tsc/eslint/build OK, 975 testes. Done. | @dev+@qa |

## Dev Agent Record
### File List
- `packages/web/src/app/dashboard/pipeline/page.tsx`
- `packages/web/src/components/leads/lead-detail-drawer.tsx`
- `packages/web/src/app/broker/leads/page.tsx`
- `packages/web/src/app/broker/page.tsx`
- `packages/web/src/app/api/leads/[id]/stage/route.ts`
- `packages/web/src/app/api/leads/bulk/route.ts`
- `docs/stories/leads-perdido-por-etapa-nao-lost-reason.story.md` (novo)

## QA Results
### Review Date: 2026-07-15 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | 4 superfícies agora gate por ETAPA; 2 write-paths limpam lost_reason ao sair de Perdido; hotfix de 1 lead. |
| Unit tests | PASS | 89 files / 975 tests, sem regressão. |
| Acceptance criteria | PASS | AC1-AC6. |
| No regressions | PASS | Perdido/Não Qualificado são is_active=false → nunca eram colunas/listas ativas; remover filtro lost_reason não os revela. Path "finalizar como perdido" no bulk continua prevalecendo. |
| Performance | PASS | Só remoção/ajuste de filtros; nenhuma query nova. |
| Security | PASS | stage/route mantém requireRole admin/supervisor; sem mudança de escopo. |
| Documentation | PASS | Story + gate. |

Build: tsc 0 · eslint 0 · next build OK · npm test 975 pass.
Gate: PASS → docs/qa/gates/leads-perdido-por-etapa-nao-lost-reason.yml
— Quinn 🛡️
