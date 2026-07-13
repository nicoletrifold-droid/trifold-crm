# Story 75-151 — "Leads hoje": clique abre TODOS os leads do dia + quebra por situação

**Status:** Ready for Review
**Epic:** Dashboard / métricas de leads
**Relacionado:** 75-57 (dia comercial nas métricas), stage-filters (fonte única de exclusão)
**Complexidade:** S (frontend puro, sem migration, ~2 arquivos)

## Contexto
O card **"Leads hoje"** do dashboard e a lista que abre ao clicar nele mostram números
**diferentes** (ex.: card = 5, lista = 2). Não é dado corrompido — é diferença de regra de
**quais etapas contam**:

| | Card "Leads hoje" | Lista ao clicar (aba "Em atendimento") |
|---|---|---|
| Período | dia comercial (vira 20:00) | dia comercial ✅ |
| `is_active = true` | sim | sim ✅ |
| `segmento = principal` | sim | sim ✅ |
| Exclui Perdido / Não Qualificado / acervo? | **NÃO** | **SIM** (`EM_ATENDIMENTO_EXCLUDED_IDS`) |

O card conta **todos** os leads criados no dia comercial. A lista abre na aba **"Em atendimento"**,
que esconde `Perdido`, `Não Qualificado`, `Corretores Antigos` e `Represamento`. Logo, os leads que
já entraram e viraram Perdido/Não Qualificado **contam no card mas somem da lista**.

Confirmado em produção (13/07): dos leads do dia comercial, parte estava em `1º Contato`
(aparecem) e parte já em `Perdido` (contam no card, somem da lista). A diferença é sempre essa.

Arquivos onde a divergência nasce:
- Card: `packages/web/src/app/dashboard/page.tsx` (query `leadsToday`, **sem** exclusão de etapas).
- Lista: `packages/web/src/app/dashboard/leads/page.tsx` (branch `criados=hoje` + `else` que aplica
  `EM_ATENDIMENTO_EXCLUDED_IDS`).
- Fonte da exclusão: `packages/web/src/lib/leads/stage-filters.ts`.

## Decisão do diretor (2026-07-13) — Opção 2
O "Leads hoje" **bruto** é uma métrica útil (quanto o anúncio trouxe no dia), então **o card
continua contando tudo**. O que confunde é a lista escondendo parte do que o card contou.

Solução: ao clicar em "Leads hoje", a tela abre mostrando **TODOS** os leads criados no dia
comercial (incluindo Perdido / Não Qualificado / acervo), de modo que o total da lista **bata com
o card**. Acima da tabela, uma linha de **quebra por situação** deixa explícito quantos já saíram
do atendimento — ex.: *"5 leads hoje · 2 em atendimento · 3 perdidos/não qualificados"*.

## Acceptance Criteria
1. **AC1** — Clicar em "Leads hoje" abre a lista mostrando **todos** os leads do dia comercial
   (`is_active=true`, `segmento=principal`), **sem** aplicar `EM_ATENDIMENTO_EXCLUDED_IDS`. O total
   exibido **bate exatamente** com o número do card.
2. **AC2** — Acima da tabela, uma linha-resumo mostra a quebra por situação, exibindo apenas os
   baldes > 0: **em atendimento**, **perdidos/não qualificados**, **acervo**
   (ex.: `5 leads hoje · 2 em atendimento · 3 perdidos/não qualificados`).
3. **AC3** — A coluna **Etapa** (já existente) deixa visível qual é a situação de cada lead na lista,
   então perdidos/não qualificados aparecem rotulados, não misturados sem distinção.
4. **AC4** — O **card não muda de valor**: continua contando todos os leads do dia comercial (a
   contagem `leadsToday` permanece como está hoje).
5. **AC5** — Comportamento restrito ao acesso via `criados=hoje`. A navegação normal de Leads
   (abas "Em atendimento" / "Perdidos", filtros) **sem regressão** — a exclusão padrão continua
   valendo fora do modo `criados=hoje`.
6. **AC6** — Mundo IMOB (`isImobWorld`) **sem regressão**: o link do card no IMOB continua indo para
   `leadsHref` como hoje (o modo dia-do-card é do mundo principal).

## Tasks
- [x] `dashboard/leads/page.tsx`: no modo `criados=hoje`, **não** aplicar a exclusão de etapas
      (mostrar todas as etapas do dia). Manter `is_active` + `segmento` + janela do dia comercial.
      → guarda `else if (!isCriadosHoje)` no bloco de exclusão.
- [x] `dashboard/leads/page.tsx`: renderizar a linha-resumo com a quebra por situação (em
      atendimento / perdidos+não qualificados / acervo) contando os leads do próprio dia comercial;
      esconder baldes zerados. → 2 count-queries escopadas ao dia + `emAtendimentoHojeCount` por subtração.
- [x] `dashboard/leads/page.tsx`: `criados` propagado na paginação (`buildPageHref`) p/ não perder o
      filtro na página 2.
- [x] Conferir que `dashboard/page.tsx` (card `leadsToday`) permanece inalterado e bate com o total.
      → card intocado; verificado que já conta sem exclusão.
- [x] Verificação ponta-a-ponta (SQL espelhando as queries da página, prod 13/07): `total_dia=11`
      (== card) = `6 em atendimento + 5 perdidos + 0 acervo`. Matemática da linha-resumo fecha.

## Dev Notes
- A janela do dia comercial já vem de `commercialDayRangeForOrg` nos dois lados — **não** recalcular,
  reusar. Ver [[project-dia-comercial-metricas]] e Story 75-57.
- Hoje o modo `criados=hoje` cai no `else` (view=atendimento) e herda a exclusão `EM_ATENDIMENTO_EXCLUDED_IDS`
  (`leads/page.tsx:80-84`). O fix é tornar `criados=hoje` um caminho que ignora essa exclusão — sem
  quebrar `view=perdidos` nem a view padrão.
- Não introduzir nova regra de fuso/horário: a única mudança de comportamento é **quais etapas** entram
  na lista quando `criados=hoje`, e a linha-resumo.
- Card intocado (AC4) para preservar a métrica bruta de captação.
- **Gotcha (contadores)**: `ativosCount` e `perdidosCount` que já existem em `leads/page.tsx`
  (linhas ~143-154) são **globais** (sem janela de dia). A linha-resumo do AC2 precisa de contagens
  **novas, escopadas ao dia comercial** — NÃO reusar `ativosCount`/`perdidosCount` para a quebra.
  Sugestão: contar os próprios `leads` do dia por balde a partir do `stage_id` (comparando com
  `PERDIDO_STAGE_IDS` / `ACERVO_STAGE_IDS`) ou 3 count-queries com a mesma janela do dia.

## Riscos
- **Regressão na navegação normal** (abas/filtros) se o bypass da exclusão vazar para fora do modo
  `criados=hoje`. Mitigação: condicionar estritamente a `params.criados === "hoje"` (AC5) + teste.
- **Divergência residual card × lista** se a linha-resumo usar contadores globais em vez dos do dia
  (ver gotcha acima). Mitigação: AC1 exige total da lista == card, com teste dedicado.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-13 | 0.1 | Story criada (opção 2: clique mostra todos do dia + quebra por situação; card inalterado) | @sm (River) |
| 2026-07-13 | 0.2 | Validação GO (8/10): + complexidade (S), + seção Riscos, + gotcha dos contadores globais. Draft → Ready. | @po (Pax) |
| 2026-07-13 | 0.3 | Implementado: bypass da exclusão em `criados=hoje` + linha-resumo (contagens do dia) + `criados` na paginação. tsc 0 / eslint 0 / vitest 883. Ready → Ready for Review. | @dev (Dex) |

## Dev Agent Record

### Agent Model Used
claude-opus-4-8[1m]

### File List
- `packages/web/src/app/dashboard/leads/page.tsx` (modificado) — `isCriadosHoje`; guarda
  `else if (!isCriadosHoje)` no bloco de exclusão de etapas; hoist `commercialDayFromIso`; 2
  count-queries de balde do dia (perdidos/acervo) no `Promise.all`; `emAtendimentoHojeCount` por
  subtração; linha-resumo condicional; import de `ACERVO_STAGE_IDS`; `criados` em `buildPageHref` +
  nas duas chamadas de paginação.

### Completion Notes
- `dashboard/page.tsx` (card) **não** foi tocado — AC4 preservado.
- Contadores globais pré-existentes (`ativosCount`/`perdidosCount`) NÃO reusados p/ a quebra (gotcha
  do @po); a quebra usa contagens novas escopadas ao dia comercial.
- Sem teste unitário novo: não há testes de página (server component) no repo; verificação foi
  ponta-a-ponta via SQL espelhando as queries. Suíte existente: 883/883 sem regressão.
- Warning eslint `isAdmin` é pré-existente (fora do escopo desta story).
