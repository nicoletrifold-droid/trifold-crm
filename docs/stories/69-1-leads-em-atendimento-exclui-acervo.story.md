# Story 69-1 — Lista "Em atendimento" exclui acervo (Corretores Antigos + Represamento)

## Metadata
- **Status:** Ready
- **Epic:** 68 — Dashboard: Coerência de Contadores
- **Branch:** feature/69-1-leads-em-atendimento-exclui-acervo
- **Complexidade:** S (1-2 pontos)

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [typecheck]

## Story

**As a** admin/gestor,
**I want** que a lista "Em atendimento" não mostre leads de acervo (Corretores Antigos, Represamento),
**so that** ela bata com o card "Leads ativos" do dashboard (que já exclui esses stages).

## Contexto

Inconsistência entre card e lista:
- Card "Leads ativos" (dashboard) exclui slugs `represamento` e `corretores-antigo`.
- Lista "Em atendimento" (`leads/page.tsx`, view ativos) exclui só `PERDIDO_STAGE_IDS`
  = [Perdido `…008`, Não Qualificado `95327bd7`]. **Não** exclui Corretores Antigos
  nem Represamento → eles aparecem em "Em atendimento" (ex.: Flavio).

Os leads de "Corretores Antigos" (62075f72) e "Represamento" (`…010`) são acervo/legado,
não fluxo de atendimento. Decisão do usuário: NÃO devem aparecer em "Em atendimento".

Observação: NÃO incluí-los em `PERDIDO_STAGE_IDS`, senão entrariam na aba "Perdidos"
(eles não são perdidos). Usar um conjunto separado de acervo só para a exclusão da view ativos.

Correção adicional: o comentário em `PERDIDO_STAGE_IDS` rotula `…008` como "Represamento";
o correto é "Perdido".

**Arquivo alvo:** `packages/web/src/app/dashboard/leads/page.tsx`

## Escopo

**IN:**
- Novo `ACERVO_STAGE_IDS = [Corretores Antigos 62075f72, Represamento …010]`.
- View "ativos" passa a excluir `PERDIDO_STAGE_IDS ∪ ACERVO_STAGE_IDS`.
- Aba "Perdidos" e contagem de perdidos permanecem só com `PERDIDO_STAGE_IDS`.
- Corrigir comentário do UUID `…008` (Perdido, não Represamento).

**OUT:**
- Pipeline kanban (mostra todos os stages — acervo continua visível lá).
- Card do dashboard (já correto).
- Filtro manual por etapa (se o usuário escolher "Corretores Antigos" no dropdown, ainda funciona via `stage_id`).

## Acceptance Criteria

1. Na view "ativos", leads em "Corretores Antigos" e "Represamento" NÃO aparecem (nem na contagem).
2. A aba "Perdidos" continua mostrando apenas Perdido + Não Qualificado (count inalterado).
3. Acervo é excluído da view "ativos" do mesmo modo que "Perdido" já é hoje (para vê-los, usar o Pipeline kanban, que mostra todos os stages).
4. Comentário do UUID `…008` corrigido para "Perdido".
5. Typecheck sem erros.

## Tasks / Subtasks

- [x] **Task 1 — Conjunto de acervo + exclusão na view ativos** (AC: 1, 2)
  - [x] 1.1 Definir `ACERVO_STAGE_IDS`
  - [x] 1.2 View ativos exclui `PERDIDO_STAGE_IDS ∪ ACERVO_STAGE_IDS`; perdidos inalterado
  - [x] 1.3 Corrigir comentário `…008` → Perdido
- [x] **Task 2 — Typecheck** (AC: 5)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-18 | 1.0 | Story criada e validada GO — Status → Ready | River (@sm) / Pax (@po) |
