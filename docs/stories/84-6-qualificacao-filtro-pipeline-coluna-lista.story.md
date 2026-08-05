# Story 84-6 — Qualificação Comercial: filtro no Pipeline + coluna na lista de Leads

## Metadata
- **Status:** Ready for Review
- **Epic:** 84 — Qualificação do Lead
- **Branch:** feat/84-6-qualificacao-filtro-pipeline-coluna-lista
- **Tipo:** Feature (frontend)
- **Complexidade:** Baixa-média
- **Prioridade:** P2

## Story
**As a** gestor comercial, **I want** filtrar por Qualificação Comercial também no board do
Pipeline e ver a Qualificação de cada lead como coluna na lista de Leads, **so that** eu consiga
enxergar e recortar os leads por qualidade nas duas telas onde trabalho, não só no filtro da
lista.

## Contexto
Complemento da **Story 84-2** (UI da Qualificação, já em QA PASS). Durante o teste local
(Lucas, 2026-08-05) ficou claro que a 84-2 entregou:
- filtro de Qualificação **apenas** em `/dashboard/leads` (dropdown "Qualificação: Todas");
- badge no **card do kanban** e no **drawer** do lead.

Faltam duas superfícies que o comercial pediu:
1. **Filtro de Qualificação no board do Pipeline** (`/dashboard/pipeline`) — hoje inexistente.
2. **Coluna "Qualificação" na tabela da lista de Leads** — hoje a lista tem coluna "Calor" e
   "Score", mas o valor da Qualificação de cada lead não aparece como coluna (só existe o filtro).

Tudo que a base precisa já existe (Story 84-1/84-2): coluna `leads.qualificacao_comercial`,
helper `lib/leads/qualificacao.ts` (`QUALIFICACAO_VALUES`/`QUALIFICACAO_LABELS`/`parseQualificacao`)
e o componente `QualificacaoComercialBadge`. Esta story só **consome** esses artefatos em duas
telas novas — nenhum schema ou lib nova.

## Escopo

**IN:**

1. **Coluna "Qualificação" na lista de Leads:**
   - Query: adicionar `qualificacao_comercial` ao `select()` da lista em
     `packages/web/src/app/dashboard/leads/page.tsx:95` (hoje seleciona
     `qualification_score, interest_level` mas **não** `qualificacao_comercial` — só o filtro usa).
   - Tabela `packages/web/src/components/leads/leads-bulk-table.tsx`:
     - Adicionar `qualificacao_comercial?: string | null` ao type `Lead` (linha 22-36, ao lado de
       `interest_level`).
     - Adicionar `<th className="px-6 py-3">Qualificação</th>` no cabeçalho (ao lado de "Calor",
       linha 130) e a célula correspondente na linha, renderizando o badge quando houver valor
       (reusar `QualificacaoComercialBadge` de `@web/components/ui/qualificacao-comercial-badge`,
       ou o mesmo padrão de badge inline do "Calor" — `CALOR_BADGE`, linhas 16-20/233-241 — mas
       com a paleta da Qualificação, mantendo a distinção visual do Epic 84). "Não definido"
       (null) não vira badge, igual ao Calor (não poluir a coluna).

2. **Filtro "Qualificação" no board do Pipeline:**
   - `packages/web/src/app/dashboard/pipeline/page.tsx` — a barra de filtros é um
     `<form method="get">` próprio (não o componente `LeadFilters`), com `<select name="...">`
     server-side (Score linhas 307-321, Etapa 327-338, Sem contato 341-356). Adicionar um
     `<select name="qualificacao">` no mesmo padrão (opções de `QUALIFICACAO_VALUES` +
     "Todas"; "none" = "Não definido").
   - Aplicar o filtro **na query por etapa** (server-side, padrão do `calor` na lista, **não**
     JS-side como o Score): ler `parseQualificacao(filters.qualificacao)` e, no bloco da query
     (linhas 106-150), adicionar `.eq("qualificacao_comercial", v)` ou `.is("qualificacao_comercial", null)`
     quando `"none"`.
   - Incluir `qualificacao` na condição do botão **"Limpar"** (linha 368).
   - **Load-more (confirmado necessário):** o board pagina via `/api/pipeline/leads`. O
     `kanban-board.tsx:403-412` propaga `property_id/broker_id/campaign_id/score/sem_contato`
     para essa rota — **falta `qualificacao`**. Sem isso, "carregar mais" numa coluna filtrada
     traria leads sem o filtro. Precisa: (a) `kanban-board.tsx` — incluir `qualificacao` nos
     params do load-more + na prop `activeFilters`; (b) `src/app/api/pipeline/leads/route.ts` —
     ler o param `qualificacao`, aplicar `.eq/.is` (padrão do `calor`, server-side) **e**
     adicionar `qualificacao_comercial` ao `LEADS_SELECT` (linha 10) para que os cards
     carregados sob demanda também renderizem o badge.

**OUT (fora desta story):**
- `/broker/pipeline` e `/broker/leads` — espelham o escopo da 84-2 (que manteve o filtro de
  Calor/Qualificação só no `/dashboard`); não expandir para o mundo broker aqui.
- Qualquer mudança em schema, no helper `qualificacao.ts` ou no `QualificacaoComercialBadge`
  (já existem e não mudam).
- Edição/definição da Qualificação (já entregue na 84-2).

## Acceptance Criteria
1. **Given** a lista de Leads (`/dashboard/leads`), **then** existe uma coluna "Qualificação"
   mostrando o badge da Qualificação Comercial de cada lead (Bom/Regular/Ruim/Inválido);
   leads sem valor mostram vazio/traço (sem badge), igual ao comportamento da coluna "Calor".
2. **Given** um lead com `qualificacao_comercial` definido, **then** o valor aparece tanto no
   filtro (já existente) quanto na nova coluna, de forma consistente.
3. **Given** o board do Pipeline (`/dashboard/pipeline`), **then** existe um filtro
   "Qualificação" na barra de filtros; selecionar um valor recorta os cards por
   `qualificacao_comercial` (inclusive "Não definido" → leads sem valor), e "Limpar" reseta.
4. **Given** o filtro de Qualificação do Pipeline combinado com os outros (Etapa, Score,
   Corretor, etc.), **then** eles funcionam juntos sem um desligar o outro.
5. Testes/validações: `parseQualificacao` já coberto (84-2); adicionar teste do filtro
   server-side do pipeline se houver padrão testável, ou cobrir via type-check. `tsc --noEmit`
   + `eslint` limpos; `next build` OK.

## Tasks
- [x] **T1 (AC1, AC2)** — `dashboard/leads/page.tsx`: adicionado `qualificacao_comercial` ao
  `select()` da lista + ao map que monta os props da tabela.
- [x] **T2 (AC1, AC2)** — `leads-bulk-table.tsx`: type `Lead` + `<th>Qualificação</th>` (ao lado
  de Calor) + célula reusando `QualificacaoComercialBadge`; null → traço.
- [x] **T3 (AC3, AC4)** — `dashboard/pipeline/page.tsx`: `<select name="qualificacao">` no form +
  `parseQualificacao` + `.eq/.is` na query por etapa (server-side) + `qualificacao` no "Limpar".
- [x] **T4 (AC3)** — load-more: `kanban-board.tsx` propaga `qualificacao` nos params + no type/
  prop `PipelineFilters`/`activeFilters`; `api/pipeline/leads/route.ts` lê o param, aplica
  `.eq/.is`, e inclui `qualificacao_comercial` no `LEADS_SELECT` (p/ o badge dos cards paginados).
- [x] **T5 (AC5)** — `vitest` 1676/1676, `tsc --noEmit` limpo, `eslint` 0 erros (3 warnings
  pré-existentes), `next build` OK. Sem teste unitário novo dedicado — ver Dev Agent Record.

## Dev Notes
- **Reuso (IDS: REUSE):** `lib/leads/qualificacao.ts` e `QualificacaoComercialBadge` já existem
  (84-2). Não recriar. O badge da lista pode reusar `QualificacaoComercialBadge` OU seguir o
  padrão inline `CALOR_BADGE` da própria tabela (linhas 16-20) — decisão do @dev, desde que a
  paleta seja a da Qualificação (distinta do Calor, requisito do Epic 84).
- **Pipeline usa form GET próprio**, não `LeadFilters` — por isso o filtro aqui é um `<select
  name>` no form, diferente da prop `showQualificacao` que a 84-2 usou na lista.
- **Filtro server-side, não JS-side:** o Score no pipeline é filtrado em JS (`passesScoreFilter`),
  mas a Qualificação deve ir na query (`.eq`/`.is`), como o `calor` faz na lista — mais correto
  para a contagem por etapa (`count: "exact"`).
- **Gotcha de ambiente (dev):** o banco de dev estava atrasado em migrations durante o teste da
  84-2 (faltavam colunas `segmento`, `primeiro_atendimento_em`, `last_contact_at`, perfil, além
  de `qualificacao_comercial`). Ao testar a 84-6, garantir que o banco alvo tem a coluna
  `qualificacao_comercial` (migration 215) aplicada.

## File List
**Modificados (todos):**
- `packages/web/src/app/dashboard/leads/page.tsx` — `qualificacao_comercial` no `select()` da
  lista + no map que monta os props da `LeadsBulkTable`.
- `packages/web/src/components/leads/leads-bulk-table.tsx` — import `QualificacaoComercialBadge`,
  campo no type `Lead`, `<th>Qualificação</th>`, célula com badge (null → traço).
- `packages/web/src/app/dashboard/pipeline/page.tsx` — import do helper, filtro server-side na
  query por etapa, `<select name="qualificacao">` no form, `qualificacao` no "Limpar" e no
  `activeFilters` passado ao board.
- `packages/web/src/components/pipeline/kanban-board.tsx` — campo `qualificacao` no type
  `PipelineFilters` + propagado nos params do load-more.
- `packages/web/src/app/api/pipeline/leads/route.ts` — import do helper, param `qualificacao`,
  filtro `.eq/.is`, e `qualificacao_comercial` no `LEADS_SELECT`.

## Dev Agent Record

### Agent Model Used
Claude Opus 4.8 (1M) — @dev (Dex), modo YOLO, em git worktree isolado
(`.claude/worktrees/84-6-qualificacao-filtro-pipeline`), **branchado de `feat/84-2`** (não de
`main`) para ter o `qualificacao.ts` e o `QualificacaoComercialBadge` da 84-2.

### Completion Notes
- **T1-T5 implementados conforme a story (com a T4 afiada pelo @po).** Reuso integral de
  `qualificacao.ts` (`parseQualificacao`/`QUALIFICACAO_VALUES`/`QUALIFICACAO_LABELS`) e do
  `QualificacaoComercialBadge` — nenhum artefato novo criado (IDS: REUSE).
- **Lista:** a coluna "Qualificação" entra entre "Calor" e "Score", reusando o badge (paleta
  distinta do Calor, requisito do Epic 84). `null` → traço, igual ao Calor (não polui).
- **Pipeline filtro server-side:** apliquei `.eq/.is` na query por etapa (não JS-side como o
  Score), como o PO pediu — a contagem por etapa (`count: "exact"`) fica correta com o filtro.
- **Load-more (T4) — o ponto que o PO elevou:** cobri as 3 pontas — (a) `kanban-board.tsx`
  propaga `qualificacao` nos params E no type `PipelineFilters`; (b) `page.tsx` passa
  `qualificacao` no `activeFilters`; (c) `api/pipeline/leads/route.ts` lê o param, filtra, E
  inclui `qualificacao_comercial` no `LEADS_SELECT` — sem isso os cards paginados viriam sem o
  badge. Verifiquei que a rota já tinha os outros filtros (score é JS-side lá, mantive assim).
- **Sem teste unitário novo dedicado:** não há teste existente para `dashboard/pipeline/page.tsx`
  nem para `api/pipeline/leads/route.ts` (só o `passesScoreFilter` é lógica testável e não foi
  tocado). `parseQualificacao` já tem cobertura (84-2). A correção do filtro é `.eq/.is` direto
  na query (padrão idêntico ao `calor`, sem lógica nova testável isoladamente). Cobri por
  `tsc`/`eslint`/`build` + verificação manual da lógica de filtro contra o banco de dev (bom →
  só o lead com valor; none → só os sem valor). Mesmo nível de cobertura do filtro de Calor
  (75-236), que também não tem teste de rota.
- **Verificação no banco de dev:** filtro `qualificacao=bom` e `=none` retornam os recortes
  corretos. Deixei o lead fictício com `qualificacao_comercial='bom'` para o smoke visual local.
- **Checks:** `vitest` 1676/1676, `tsc --noEmit` limpo (heap 8GB), `eslint` 0 erros nos 5
  arquivos (3 warnings pré-existentes, confirmados fora do diff via `git diff feat/84-2`),
  `next build` OK (rotas `/dashboard/pipeline`, `/dashboard/leads`, `/api/pipeline/leads`
  compiladas).

### Debug Log References
Nenhum — implementação direta, referências da story batiam com o código (worktree partiu do
branch da 84-2, então `qualificacao.ts`/badge já presentes).

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via processo manual (@qa gate).

## PO Validation (@po Pax — 2026-08-05)

**GO (9/10).** Escopo claro e coeso (2 superfícies de uma mesma feature), ACs testáveis e
mapeadas em tasks, dependência correta da 84-2 (reusa `qualificacao.ts` + `QualificacaoComercialBadge`,
sem schema/lib nova — IDS REUSE), escopo IN/OUT bem delimitado (`/dashboard` só, `/broker` fora,
espelhando a 84-2).

**Verificação anti-alucinação (conferi contra o código real, não só o relato do @sm):**
- Coluna "Calor" na tabela (`leads-bulk-table.tsx:130`) e `CALOR_BADGE` (16-20/235-236) ✅
- Select da lista sem `qualificacao_comercial` (`dashboard/leads/page.tsx:95`) ✅
- Selects do form do pipeline (`name="score"/"stage"/"sem_contato"`, linhas 312/328/346) e
  condição do "Limpar" (368) ✅

**Fix aplicado na validação (achado real, elevou a nota de escopo):** a T4 estava vaga
("conferir load-more se aplicável"). Verifiquei e é **necessária e maior**: o load-more
(`kanban-board.tsx:403-412`) propaga os outros filtros para `/api/pipeline/leads` mas não teria
`qualificacao`, e o `LEADS_SELECT` dessa rota (`route.ts:10`) nem traz `qualificacao_comercial`
— então "carregar mais" numa coluna filtrada traria leads sem filtro e sem badge. Detalhei a T4
(2 arquivos: `kanban-board.tsx` + `api/pipeline/leads/route.ts`) e os adicionei à File List, pra
o @dev não entregar um filtro que "vaza" na paginação.

**Condição registrada (não bloqueia):** a distinção visual do badge (paleta da Qualificação ≠
Calor) é requisito do Epic 84 — a story já aponta isso; o @dev deve reusar
`QualificacaoComercialBadge` (que já cumpre) em vez de recriar um badge inline com cor errada.

Status: Draft → Ready.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-05 | 0.1 | Draft criado a partir de pedido do Lucas durante o teste local da 84-2: faltam o filtro de Qualificação no board do Pipeline e a coluna de Qualificação na tabela da lista de Leads (a 84-2 entregou só o filtro na lista + badge no card/drawer). Escopo `/dashboard` apenas, espelhando a 84-2. Referências de linha conferidas contra o código. | @sm (River) |
| 2026-08-05 | 0.2 | Validação PO: GO (9/10). Afiada a T4 (load-more) — verificado que `kanban-board.tsx` + `/api/pipeline/leads/route.ts` precisam propagar `qualificacao` e incluir a coluna no `LEADS_SELECT`, senão a paginação vaza o filtro. 2 arquivos adicionados à File List. Referências conferidas contra o código real. Status Draft → Ready. | @po (Pax) |
| 2026-08-05 | 0.3 | Implementação completa (T1-T5, modo YOLO, worktree branchado de feat/84-2): coluna Qualificação na lista (reuso do badge), filtro server-side no board + load-more (kanban-board + api/pipeline/leads, incl. coluna no LEADS_SELECT). `vitest` 1676/1676, `tsc` limpo, `eslint` 0 erros, `next build` OK. Filtro verificado contra o banco de dev (bom/none). Status Ready → Ready for Review. | @dev (Dex) |
