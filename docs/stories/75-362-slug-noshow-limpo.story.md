# Story 75-362 — o slug da No-Show deixa de ser `no-show-real`

**Status:** InReview — testes/lint/type-check verdes · **com migration (237, DEPOIS do merge)**
**Tipo:** Limpeza da dívida deixada de propósito pela 75-358
**Epic:** 75 — CRM Trifold
**Complexidade:** XS (~1 pt — 1 sinônimo removido, 1 UPDATE, seed corrigido, 3 testes)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## De onde veio

A mig 236 (75-358) criou a etapa No-Show (`…0011`) com o slug provisório **`no-show-real`**,
porque o slug natural `no-show` estava ocupado: `funnel-tiers.ts` o mantinha como **sinônimo de
ATENDIMENTO** — herança da 75-323, de quando a etapa `…0009` (renomeada na UI para "Atendimento")
ainda carregava o slug antigo. Decisão do Marcos em 20/08: limpar, desde que **sem risco em lugar
nenhum**.

## A avaliação de risco (feita ANTES de tocar em código)

Varredura de **todos** os consumidores de slug de `kanban_stages`:

| consumidor | compara com literal? | afetado? |
|---|---|---|
| `funnel-tiers.ts:83` | `["atendimento", "no-show"]` | **é o alvo** |
| analytics de campanhas (2 arquivos) | `novo`, `new`, `nao_qualificado`, `fechou` | não |
| `dashboard/metrics` | `qualificado` | não |
| URL `?stage=` do pipeline | não — repassa o que leu do banco | não (etapa criada hoje, 0 leads, sem bookmark possível) |
| `funnel-reached`, joins de lead, followup cron, PDF | não — só repassam | não |

E o dado decisivo: **o sinônimo já está morto em produção desde a mig 236** — a `…0009` tem slug
`atendimento` e o `pick()` casa pelo primeiro alvo da lista. Removê-lo não muda nenhum
comportamento hoje; só elimina a mina para o futuro.

## AC1 — O sinônimo sai do funil

`pickFunnelTiers`: `["atendimento", "no-show"]` → `["atendimento"]`. O comentário da 75-323 foi
atualizado para não descrever mais um estado do banco que deixou de existir.

**Teste de regressão novo**, com a No-Show ANTES no array (simulando ordem de posição adversa):
o andar de Atendimento **não** captura a coluna No-Show. É exatamente a classe de bug que obrigou
o slug feio — agora travada por teste em vez de por nome feio.

## AC2 — Migration 237: `no-show-real` → `no-show`

Um UPDATE com guardas: exige o slug atual `no-show-real` E que nenhum outro registro da org já use
`no-show` (o `UNIQUE (org_id, slug)` pegaria de qualquer jeito; o guard troca o erro por no-op
explícito). Rodar duas vezes = no-op.

## ⚠️ AC3 — Ordem de deploy INVERTIDA em relação à 236

**Merge primeiro, migration DEPOIS.** Com o código antigo no ar (sinônimo ainda presente), o rename
faria o andar de Atendimento poder casar com a coluna No-Show dependendo só da ordem das posições no
board — funcionaria hoje por Atendimento (4) vir antes de No-Show (7), que é sorte, não desenho.
Removido o sinônimo do código em produção, o rename fica indiferente para o funil.

(A 236 foi o contrário — migration antes do merge — porque lá o código novo escrevia um UUID que
precisava existir no banco. Cada uma tem a sua ordem, e o motivo está escrito nas duas.)

## AC4 — O seed para de mentir

`supabase/seed.sql` ainda criava a `…0009` como `'No-Show','no-show','no_show'` — a realidade de
antes de 08/06. Num banco pós-migração, o `ON CONFLICT (org_id, slug)` desse INSERT casaria com a
`…0011` (a nova dona do slug `no-show`) e **sobrescreveria a etapa errada**. Agora o seed cria a
`…0009` como Atendimento/`atendimento` e a `…0011` como No-Show/`no-show`, com as posições
seguintes re-encadeadas (dev tem drift conhecido; o seed é a referência dele).

## Fora de escopo (decisão do Marcos, 20/08)

O furo do **"condições de pagamento"** na régua de pedido de preço (75-361) **fica como está** —
o padrão é compartilhado com o gatilho de `score >= 70` e alargá-lo é outra decisão. O teste
`FURO CONHECIDO` continua fixando o comportamento.

## Dev Agent Record

**Branch:** `75-362-slug-noshow-limpo` (worktree `~/tmp_claude/wt-75-362`)

| arquivo | o quê |
|---|---|
| `packages/web/src/lib/analytics/funnel-tiers.ts` | sinônimo `no-show` removido do andar de Atendimento |
| `packages/web/src/lib/analytics/funnel-tiers.test.ts` | fixture pós-236 + teste de regressão da captura errada |
| `packages/web/src/lib/analytics/funnel-reached.test.ts` | fixture e asserção pós-236 (`by("atendimento")`) |
| `supabase/migrations/237_slug_noshow_limpo.sql` | novo — rename com guardas, roda DEPOIS do merge |
| `supabase/seed.sql` | `…0009` = Atendimento, `…0011` = No-Show, posições re-encadeadas |

**Validações:** `vitest run` 2877 passando (+1) · `turbo type-check` 8/8 · `turbo lint` 0 erros.

**Passos do deploy:** 1) merge; 2) `POST /database/query` com a mig 237; 3) conferir que o board
mostra No-Show igual (o `name` não muda — só o slug interno).
