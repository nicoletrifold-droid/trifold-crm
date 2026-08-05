# Story 84-2 — UI: ficha do lead, kanban/lista, filtro e histórico da Qualificação Comercial

## Metadata
- **Status:** Ready for Review
- **Epic:** 84 — Qualificação do Lead
- **Branch:** feat/84-2-qualificacao-lead-ui
- **Tipo:** Feature (frontend + 1 rota de leitura)
- **Complexidade:** Média-alta
- **Prioridade:** P2

## Story
**As a** corretor/gestor comercial, **I want** ver e editar a Qualificação Comercial do lead na
ficha, no card do kanban e na lista, filtrar por ela, e consultar quem mudou o quê e quando,
**so that** eu use esse campo no dia a dia sem confundi-lo com a Temperatura.

## Contexto
Depende da **Story 84-1** (já implementada, PR #362, gate CONCERNS): coluna
`leads.qualificacao_comercial` (enum `bom|regular|ruim|invalido`, nullable), endpoint
`PATCH /api/leads/[id]` já aceita o campo com gate `canAccess(...,"leads.qualificacao")`, e toda
mudança grava em `audit_logs` (`action: "lead.qualificacao_comercial_updated"`,
`metadata: {old_value, new_value}`).

Requisito de negócio explícito do Epic 84: os dois campos (Temperatura e Qualificação) devem
ser **visualmente distintos** — não é suficiente reusar a mesma paleta de cores/formato de badge
da Temperatura com valores diferentes.

**Achado importante do mapeamento desta story:** `audit_logs` tem RLS que restringe `SELECT` a
usuários com `role = 'admin'` (`059_audit_logs.sql:30-41`). Um corretor ou gerente-comercial com
`leads.qualificacao` liberado **não conseguiria ler `audit_logs` pelo client comum** (RLS
bloqueia antes mesmo do código rodar). Por isso o histórico desta story precisa de uma rota nova
usando `createAdminClient()` (service role, bypassa RLS) com gate explícito em código — não dá
pra simplesmente ler a tabela do client do usuário.

## Escopo

**IN:**

1. **Constantes visuais** (`packages/web/src/lib/constants.ts`, ao lado de
   `INTEREST_LEVEL_LABELS`/`INTEREST_LEVEL_COLORS` linhas 1-11): novo
   `QUALIFICACAO_COMERCIAL_LABELS` (`bom` → "Bom", `regular` → "Regular", `ruim` → "Ruim",
   `invalido` → "Inválido") e `QUALIFICACAO_COMERCIAL_COLORS`. Paleta e **formato de badge**
   propositalmente diferentes do padrão `rounded-full` + azul/amarelo/vermelho da Temperatura —
   usar o padrão `rounded-md` + indicador (`dot`) já existente no Property Badge do kanban
   (`lead-card.tsx:40-49`, ex.: `{ bg, text, dot }`). Sugestão de paleta (ajustável pelo @dev,
   desde que sem sobreposição com azul/amarelo/vermelho): `bom` = verde/emerald, `regular` =
   slate/neutro, `ruim` = rose, `invalido` = fúcsia/roxo (sinaliza categoria à parte, não só "pior
   que ruim").

2. **Edição na ficha do lead** — replicar o padrão do select de Temperatura em **ambos** os
   formulários que já editam `interest_level`:
   - `packages/web/src/app/broker/leads/[id]/_components/lead-edit-form.tsx` (interface linha
     14, constante `INTEREST_LEVELS` linha 44, estado linha 61, label "Calor do Lead" linha 176,
     select linhas 177-182).
   - `packages/web/src/app/dashboard/leads/[id]/_components/dashboard-lead-edit-form.tsx`
     (mesmo padrão: linha 14, 45, 62, 153, 154-155).
   - Novo select "Qualificação Comercial" ao lado do de Temperatura, enviando
     `qualificacao_comercial` no `PATCH /api/leads/[id]` (mesmo padrão de envio de
     `interest_level` já existente nesses forms, linha ~86-87).

3. **Card do kanban/pipeline** (`packages/web/src/components/pipeline/lead-card.tsx`):
   - Adicionar `qualificacao_comercial: string | null` à interface `LeadCardProps["lead"]`
     (ao lado de `interest_level`, linha 20).
   - Renderizar um badge novo (formato `rounded-md` + dot, não o `rounded-full` que a Temperatura
     usaria) usando as constantes do item 1. **Hoje o card NÃO renderiza a Temperatura** (só
     `qualification_score`, linhas 90-94) — então não há um badge de `interest_level` para copiar
     1:1 aqui; use o padrão do Property Badge (linhas 40-49, 177-180) como referência de forma.
   - A query que popula o kanban usa a constante `LEADS_SELECT` (já inclui `qualification_score`
     e `interest_level`) em **ambos** `packages/web/src/app/broker/pipeline/page.tsx:15` e
     `packages/web/src/app/dashboard/pipeline/page.tsx:14` — adicionar `qualificacao_comercial`
     a essa string em ambos os arquivos.
   - **Decisão confirmada com o Lucas (2026-08-04): o badge de Qualificação Comercial é
     ADITIVO — fica lado a lado com o badge de `qualification_score` já existente (linhas
     90-94), sem substituí-lo nem remover nada.** São eixos diferentes (engajamento automático
     vs. qualidade comercial manual) e o Epic 84 existe justamente para os dois coexistirem,
     não para um substituir o outro.

4. **Drawer de detalhe do lead** (`packages/web/src/components/leads/lead-detail-drawer.tsx`):
   - Badge novo ao lado do badge de Temperatura já existente (linhas 583-589, que usa
     `INTEREST_LEVEL_LABELS`/`INTEREST_LEVEL_COLORS` importados na linha 9) — mesma lógica
     condicional (`lead.qualificacao_comercial &&`), constantes/formato do item 1.

5. **Filtro combinável com Temperatura**:
   - Novo helper `packages/web/src/lib/leads/qualificacao.ts`, espelhando **exatamente**
     `packages/web/src/lib/leads/calor.ts` (que hoje exporta `CALOR_VALUES`, `CALOR_LABELS`,
     `parseCalor`): `QUALIFICACAO_VALUES = ["bom","regular","ruim","invalido","none"]`,
     `QUALIFICACAO_LABELS`, `parseQualificacao()`.
   - `packages/web/src/components/lead-filters.tsx`: nova prop opt-in `showQualificacao`
     (mesmo padrão de `showCalor`, linha 24) + `qualificacaoParam` (default `"qualificacao"`,
     mesmo padrão de `calorParam` linha 52) + select renderizado (mesmo padrão do select de
     `showCalor`, linhas 124-129).
   - Habilitar em `packages/web/src/app/dashboard/leads/page.tsx` (mesmo lugar onde `showCalor`
     é habilitado, linha 333) e aplicar o filtro server-side (mesmo padrão de `parseCalor`,
     linhas 148-157: `eq("qualificacao_comercial", valor)` ou `is(..., null)` quando `"none"`).
   - **Fora desta story:** habilitar o filtro em `/broker/leads` — hoje `showCalor` também não
     está habilitado lá (`app/broker/leads/page.tsx:224-230`); esta story só espelha o escopo
     atual da Temperatura, não expande.

6. **Histórico de mudanças** (novo, não existe padrão de leitura de `audit_logs` fora do admin
   hoje):
   - Nova rota `GET /api/leads/[id]/qualificacao-historico`: `requireAuth()` →
     `canAccess(appUser.id, appUser.org_id, "leads.qualificacao")` (403 se `false`) →
     `createAdminClient()` (obrigatório — RLS de `audit_logs` restringe `SELECT` a
     `role = 'admin'`, `059_audit_logs.sql:30-41`, e o objetivo é liberar para qualquer role
     com `leads.qualificacao`, não só admin) → `select` em `audit_logs` com
     `entity_type = 'lead'`, `entity_id = id`, `action = 'lead.qualificacao_comercial_updated'`,
     `order by created_at desc`. Resposta: `{ historico: [{ id, user_name, created_at,
     old_value, new_value }] }`.
   - Componente de UI (no drawer ou na página do lead) que consome essa rota e lista as
     mudanças (quem, quando, de → para) — reaproveitar padrão visual de lista simples já usado
     em "Histórico de Contatos" do drawer (`lead-detail-drawer.tsx:899-968`) como referência de
     estilo, sem precisar copiar a lógica (fonte de dado é outra: `audit_logs`, não `activities`).

**OUT (fora desta story):**
- Sugestão automática não-vinculante (84-3).
- Alertas/cron (84-4).
- Relatório cruzado (84-5).
- Habilitar o filtro de Qualificação (ou de Temperatura) em `/broker/leads` — hoje nenhum dos
  dois existe lá.
- Tela de configuração dos prazos (`qualificacao_comercial_config`) — ainda não tem consumidor
  (nasce na 84-4).

## Acceptance Criteria
1. **Given** a ficha do lead (`/broker/leads/[id]` e `/dashboard/leads/[id]`), **when** o usuário
   tem `leads.qualificacao`, **then** existe um select "Qualificação Comercial" (4 valores +
   "Não definido") que salva via `PATCH /api/leads/[id]` com `qualificacao_comercial`.
2. **Given** um lead com `qualificacao_comercial` preenchido, **then** aparece um badge no card
   do kanban (`lead-card.tsx`) e no drawer de detalhe, com paleta de cor **e formato**
   diferentes do badge de Temperatura (não pode ser confundido à primeira vista). No card do
   kanban, o badge novo é **aditivo** — aparece ao lado do badge de `qualification_score` já
   existente, sem substituí-lo.
3. **Given** a tela `/dashboard/leads`, **then** existe um filtro de Qualificação Comercial
   (mesmo padrão do filtro de Temperatura já existente) combinável com ele — filtrar por
   Qualificação não desliga o filtro de Temperatura e vice-versa.
4. **Given** um lead com histórico de mudanças de `qualificacao_comercial`, **when** um usuário
   com `leads.qualificacao` (não necessariamente admin) consulta o histórico, **then** vê a
   lista de mudanças (quem, quando, valor anterior → novo) via
   `GET /api/leads/[id]/qualificacao-historico`; sem `leads.qualificacao`, recebe 403.
5. Testes cobrindo: constantes novas, `parseQualificacao` (whitelist), a rota de histórico
   (403 sem permissão / 200 com dados via admin client), e que os 2 forms enviam
   `qualificacao_comercial` corretamente. `tsc --noEmit` + `eslint` limpos.

## Tasks

- [x] **T1 (AC2)** — Adicionado `QUALIFICACAO_COMERCIAL_LABELS` em `constants.ts`; paleta/dot
  ficaram no componente `QualificacaoComercialBadge` (padrão `SourceBadge`, ver Dev Agent Record).
- [x] **T2 (AC1)** — Select "Qualificação Comercial" em `lead-edit-form.tsx` (broker) e
  `dashboard-lead-edit-form.tsx`, enviando `qualificacao_comercial` no PATCH.
- [x] **T3 (AC2)** — Badge no `lead-card.tsx` (interface + render) + adicionado
  `qualificacao_comercial` à constante `LEADS_SELECT` em `broker/pipeline/page.tsx:15` e
  `dashboard/pipeline/page.tsx:14`.
- [x] **T4 (AC2)** — Badge no `lead-detail-drawer.tsx`, ao lado do badge de Temperatura.
- [x] **T5 (AC3)** — `lib/leads/qualificacao.ts` (espelhando `calor.ts`) + prop
  `showQualificacao`/`qualificacaoParam` em `lead-filters.tsx` + habilitado e aplicado
  server-side em `dashboard/leads/page.tsx` (incluindo o hidden-input do form de busca, achado
  durante a implementação — ver Dev Agent Record).
- [x] **T6 (AC4)** — Rota `GET /api/leads/[id]/qualificacao-historico` (admin client + gate
  `canAccess`, já que `audit_logs` é RLS admin-only).
- [x] **T7 (AC4)** — Componente `QualificacaoHistorico` consumindo a rota do T6, no drawer
  (seção colapsável).
- [x] **T8 (AC5)** — Testes: `parseQualificacao` (3), rota de histórico (3, ver T9). Smoke dos
  2 forms NÃO feito — sem infra de teste de componente React no projeto (ver Dev Agent Record).
  `tsc --noEmit` + `eslint` + `vitest` + `next build` limpos.
- [x] **T9 (fix QA SEC-001)** — Rota de histórico verificava só a permissão de módulo
  (`leads.qualificacao`), não se o usuário pode ver ESTE lead — corretor conseguia ler
  histórico de leads de outros corretores via chamada direta. Adicionado SELECT do lead pelo
  client RLS-scoped do usuário (`supabase`, não `admin`) antes do admin client; 404 se a
  política `leads_select` bloquear. Novo teste TEST-002 cobrindo o cenário.

## Dev Notes

### Fontes e padrões a seguir (conferidos linha a linha antes deste draft)
- Temperatura hoje: `lead-edit-form.tsx:14,44,61,176-182` (broker) e
  `dashboard-lead-edit-form.tsx:14,45,62,153-155` (dashboard) — copiar o mesmo padrão de
  select/estado/envio.
- `lead-card.tsx`: interface `LeadCardProps.lead` linha 14-38 (`interest_level` só existe no
  tipo, linha 20 — **não é renderizado hoje**, confirmado por grep); Property Badge (padrão de
  forma a seguir) linhas 40-49 e 177-180; badge de `qualification_score` linhas 90-94.
- `lead-detail-drawer.tsx`: badge de Temperatura linhas 583-589, import das constantes linha 9;
  "Histórico de Contatos" (referência de estilo de lista, fonte de dado diferente) linhas
  899-968.
- Filtro: `lead-filters.tsx` — prop `showCalor` linha 24 (default `false`, linha 45),
  `calorParam` linha 52 default `"calor"`, select linhas 124-129. `dashboard/leads/page.tsx` —
  `showCalor` habilitado linha 333; filtro server-side com `parseCalor` linhas 148-157. Helper
  `lib/leads/calor.ts` (arquivo inteiro, ~19 linhas) é o template exato a espelhar.
- Permissão: `canAccess(userId, orgId, "leads.qualificacao")` — já implementado na Story 84-1
  (`packages/web/src/lib/permissions.ts:314-351`).
- Audit: `logAudit()` já grava (`packages/web/src/lib/audit.ts`); RLS de leitura é o achado
  crítico desta story — `audit_logs` SELECT restrito a `role = 'admin'`
  (`supabase/migrations/059_audit_logs.sql:30-41`). A rota nova do T6 **precisa** de
  `createAdminClient()` para servir roles não-admin com `leads.qualificacao`, com o gate de
  permissão feito em código ANTES de instanciar o admin client — mesmo padrão estrutural de
  `marketingGuard()` (`packages/web/src/lib/marketing/guard.ts:14-20`): gate primeiro
  (`requireRole`, não `canAccess`, nesse arquivo especificamente — **correção**: a versão em
  `main` ainda não usa `canAccess`, isso só existe na Story 75-229, que não está mergeada),
  depois `createAdminClient()`. Para esta rota, o gate deve ser `canAccess(...,"leads.qualificacao")`
  (já implementado na 84-1), não `requireRole` — só o formato "gate → admin client" é o que se
  reaproveita de `marketingGuard()`, não a chamada específica de `canAccess` dentro dele.
- Endpoint de admin já existente para referência de estilo de rota de audit (mas usa client
  RLS-scoped + gate hardcoded `role !== "admin"`, **não** o padrão a seguir aqui):
  `packages/web/src/app/api/admin/audit-logs/route.ts`.

### Sobre a distinção visual (requisito de negócio, não só estético)
O Epic 84 exige que os dois campos não sejam confundíveis. Esta story tem a vantagem de que
`lead-card.tsx` **ainda não renderiza** um badge de Temperatura — ou seja, ao desenhar o badge de
Qualificação do zero (não copiando um badge de Temperatura existente), naturalmente evita-se
reproduzir a mesma linguagem visual. No drawer, onde a Temperatura **já** aparece
(`rounded-full`), o badge de Qualificação deve usar deliberadamente outra forma
(`rounded-md` + `dot`, padrão já usado no Property Badge do kanban).

### Testing
- Unit: `parseQualificacao` (whitelist, valores fora dela → `null`), espelhando os testes que
  devem existir para `parseCalor` (conferir se existem; se não, este é o único gap de teste
  pré-existente que vale mencionar, não corrigir aqui).
- Unit: rota `GET /api/leads/[id]/qualificacao-historico` — 403 sem `leads.qualificacao`, 200
  com lista correta (mock do admin client e de `canAccess`), confirmando que usa o client admin
  (não o RLS-scoped) para não depender de `role='admin'`.
- Smoke/unit dos 2 forms: `qualificacao_comercial` sai no payload do PATCH quando o select muda.
- Não é preciso teste E2E de UI nesta story (sem infra de Playwright rodando neste ambiente,
  mesma limitação já observada na 84-1).

## File List
**Criados:**
- `packages/web/src/lib/leads/qualificacao.ts` — helper de filtro (espelha `calor.ts`).
- `packages/web/src/lib/leads/qualificacao.test.ts` — 3 testes de `parseQualificacao`.
- `packages/web/src/components/ui/qualificacao-comercial-badge.tsx` — badge compartilhado
  (padrão `SourceBadge`: `rounded-md` + dot), usado no kanban e no drawer.
- `packages/web/src/components/leads/qualificacao-historico.tsx` — lista de histórico
  (client component, busca da rota nova, some silenciosamente em 403).
- `packages/web/src/app/api/leads/[id]/qualificacao-historico/route.ts` — rota GET com admin
  client + gate `canAccess`.
- `packages/web/src/app/api/leads/[id]/qualificacao-historico/route.test.ts` — 2 testes
  (403 sem permissão, 200 com admin client).

**Modificados:**
- `packages/web/src/lib/constants.ts` — `QUALIFICACAO_COMERCIAL_LABELS`.
- `packages/web/src/app/broker/leads/[id]/_components/lead-edit-form.tsx` — select novo +
  interface `LeadEditData` + payload do PATCH.
- `packages/web/src/app/broker/leads/[id]/_components/lead-details-panel.tsx` — interface
  local `LeadEditData` (duplicada, não importada do form) também precisou do campo.
- `packages/web/src/app/broker/leads/[id]/page.tsx` — mapeamento `lead.qualificacao_comercial`
  para o `LeadDetailsPanel`.
- `packages/web/src/app/dashboard/leads/[id]/_components/dashboard-lead-edit-form.tsx` — mesmo
  padrão do form do broker.
- `packages/web/src/app/dashboard/leads/[id]/_components/edit-lead-toggle.tsx` — mapeamento do
  campo para o `DashboardLeadEditForm`.
- `packages/web/src/components/pipeline/lead-card.tsx` — interface + `QualificacaoComercialBadge`
  (aditivo, ao lado do badge de `qualification_score`).
- `packages/web/src/app/broker/pipeline/page.tsx` — `LEADS_SELECT` inclui
  `qualificacao_comercial`.
- `packages/web/src/app/dashboard/pipeline/page.tsx` — idem.
- `packages/web/src/components/leads/lead-detail-drawer.tsx` — interface `LeadQuickData` +
  mapeamento do fetch + badge + seção colapsável de histórico.
- `packages/web/src/components/lead-filters.tsx` — prop `showQualificacao`/`qualificacaoParam`.
- `packages/web/src/app/dashboard/leads/page.tsx` — tipo `LeadsSearchParams`, `buildPageHref`,
  filtro server-side, hidden-input do form de busca, `<LeadFilters showQualificacao .../>`.

## Dev Agent Record

### Agent Model Used
Claude Sonnet 5 (claude-sonnet-5) — @dev (Dex), modo YOLO, em git worktree isolado
(`.claude/worktrees/84-2-qualificacao-lead-ui`, branch a partir de `origin/main`).

### Completion Notes
- **T1-T7 implementados exatamente conforme o escopo.** Um ajuste de forma em relação ao
  planejado no draft: em vez de `QUALIFICACAO_COMERCIAL_COLORS` solto em `constants.ts`, criei
  o componente `QualificacaoComercialBadge` (`components/ui/qualificacao-comercial-badge.tsx`)
  com a paleta `{bg, text, dot}` local ao componente — descobri, ao investigar o import já
  existente de `SourceBadge` em `lead-card.tsx`, que esse é o padrão real e mais recente do
  projeto para badges reutilizáveis (label vem de `constants.ts`, estilo fica no componente).
  Mantive `QUALIFICACAO_COMERCIAL_LABELS` em `constants.ts` como planejado; só o mapa de
  cor/dot migrou para dentro do componente. Resultado: badge reaproveitado 1x no kanban e 1x
  no drawer, sem duplicar JSX.
- **Cadeia de props mais longa que o previsto no draft:** os dois forms de edição não recebem
  `lead` direto de uma query — cada um tem um componente intermediário
  (`lead-details-panel.tsx` no broker, `edit-lead-toggle.tsx` no dashboard) com sua própria
  cópia local da interface `LeadEditData`/`LeadData` (duplicada, não importada do form). Precisei
  adicionar `qualificacao_comercial` nessas 2 interfaces + no mapeamento `lead={{...}}` de cada
  página pai, além dos 2 forms em si — 4 arquivos a mais do que a File List do draft previa.
  Nenhuma decisão nova, só profundidade real da cadeia de dados.
- **Achado durante o T5:** `dashboard/leads/page.tsx` tem um `<form method="get">` com hidden
  inputs (linha ~294) que preserva os outros filtros quando o campo de busca por nome é
  submetido — sem isso, buscar por nome depois de escolher a Qualificação apagaria o filtro
  silenciosamente (mesmo bug que a Story 75-236/QA já tinha corrigido para o Calor). Adicionei
  `qualificacao` a esse objeto de hidden inputs; sem essa correção o filtro pareceria
  intermitente ("funciona até eu buscar por nome").
- **Badge do kanban é aditivo, conforme confirmado com o usuário**: fica na mesma linha de
  badges (`flex-wrap`) do Property Badge, não no chip de Score do header (que é só um número,
  formato incompatível com um badge com label) — mesmo card, nada removido.
- **Histórico (T6/T7):** rota nova usa `createAdminClient()` com filtro **obrigatório** por
  `org_id` (o admin client não tem isolamento de tenant automático — só o `entity_id`/`action`
  não bastariam para isolar orgs). Componente `QualificacaoHistorico` é um `details/summary`
  colapsável no drawer, sempre visível (mesmo com `qualificacao_comercial` atual = null, pois
  pode ter sido setada e limpa antes) — some silenciosamente em 403.
- **T8 — gap de teste assumido conscientemente:** não existe `@testing-library` nem qualquer
  arquivo `.test.tsx` neste projeto — só testes de lógica/rota (`.test.ts`). Escrever um teste
  de "o form envia o campo certo" exigiria adicionar uma dependência de teste de componente
  React, o que não foi pré-aprovado na story nem pelo usuário. Optei por não adicionar
  silenciosamente uma dependência nova — documentando o gap aqui em vez de forçar uma solução.
  Os 2 forms seguem exatamente o padrão já usado (não-testado) do campo `interest_level`
  ao lado, então o risco é o mesmo já aceito pelo projeto para esse padrão.
- **Checks executados:** `vitest run` completo (1675/1675 verdes, 139 arquivos — os 5 testes
  novos desta story confirmados individualmente rodando), `tsc --noEmit` limpo (heap
  `--max-old-space-size=8192`, mesma necessidade de ambiente já vista na 84-1), `eslint` nos 18
  arquivos tocados (0 erros; 3 warnings pré-existentes e não relacionados, confirmados fora do
  meu diff), `next build` completo com sucesso (rota nova `/api/leads/[id]/qualificacao-historico`
  aparece no build).
- Não foi possível testar visualmente no browser (sem servidor rodando neste ambiente) — a
  verificação ficou em: typecheck (garante que os componentes recebem os tipos certos), lint,
  e revisão manual do JSX contra o padrão de `SourceBadge`/badges existentes.

### Fix QA (SEC-001) — 2026-08-05
- **Problema:** `GET /api/leads/[id]/qualificacao-historico` usava `createAdminClient()`
  (bypassa RLS) checando só `canAccess(...,"leads.qualificacao")` — permissão de módulo, não
  de lead específico. Como `broker` tem `leads: true` (herança, sem seed na 84-1), qualquer
  corretor conseguia ler o histórico de leads de OUTROS corretores via chamada direta à rota,
  mesmo não conseguindo abrir a ficha desses leads (`GET /api/leads/[id]` bloqueia por RLS).
- **Fix:** antes de instanciar o admin client, faço um `SELECT` do lead pelo client RLS-scoped
  do usuário (`supabase`, retornado por `requireAuth()` — já usado no gate original, só não
  para o SELECT) — `eq("id", id).eq("org_id", appUser.org_id).single()`. Se vier vazio (RLS
  bloqueou), devolvo 404, igual ao comportamento de `GET /api/leads/[id]`. Reaproveita a
  política `leads_select` (`004_rls_policies.sql:104-112`) como fonte de verdade, sem duplicar
  a lógica de `assigned_broker_id` em código novo.
- **Teste novo (TEST-002):** `route.test.ts` ganhou um 3º cenário — lead não visível pelo
  client RLS-scoped → 404, confirmando que o admin client **não** é chamado nesse caso
  (`adminClientCalls` continua 0). Suíte completa: `vitest` 1676/1676 (+1 do teste novo),
  `tsc --noEmit` limpo, `eslint` limpo nos 2 arquivos.

### Debug Log References
Nenhum necessário — implementação direta seguindo os padrões mapeados no draft; os únicos
desvios (cadeia de props mais longa, hidden input do form de busca, componente de badge em vez
de constantes soltas) estão documentados acima, descobertos por leitura do código real durante
a implementação, não por tentativa e erro.

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml`.
> Quality validation via processo manual (@qa gate).

## PO Validation (@po Pax — 2026-08-04)

**GO (8/10).** Título/descrição claros, contexto e dependência da 84-1 (PR #362) explícitos,
escopo IN/OUT bem delimitado, ACs testáveis e mapeadas nas Tasks (T1-T8). Escopo grande
(8+ arquivos) mas coeso — todas as peças (constantes, forms, card, drawer, filtro, histórico)
são partes de uma única entrega visual/funcional; quebrar mais criaria incrementos parciais não
entregáveis sozinhos (ex.: filtro sem as constantes de cor não faz sentido isolado). Mantido
como uma story só, no mesmo padrão de stories de UI completas já existentes no projeto
(ex. 82-2).

**2 fixes aplicados durante a validação (referências técnicas incorretas ou não verificadas):**
1. **Correção de fato:** os Dev Notes citavam `marketingGuard()` como exemplo de gate via
   `canAccess()` — falso para o estado atual da `main`. `packages/web/src/lib/marketing/guard.ts:14-20`
   usa `requireRole()`, não `canAccess()` (a versão com `canAccess` só existe na Story 75-229,
   que **não está mergeada**). Corrigido para deixar claro que só o padrão estrutural
   "gate em código → `createAdminClient()`" é reaproveitado, não a chamada específica.
2. **Referência vaga substituída por exata:** o item 3 (kanban) dizia "provavelmente em
   `broker/pipeline/page.tsx` ou equivalente" para a query do kanban. Verificado: ambos
   `broker/pipeline/page.tsx:15` e `dashboard/pipeline/page.tsx:14` usam a constante
   `LEADS_SELECT` (já inclui `interest_level`/`qualification_score`) — adicionados à Tasks/File
   List como 2 arquivos a mais a tocar.

**Verificação anti-alucinação:** conferi diretamente contra o código (não apenas contra o
relato do @sm) as citações de `lead-filters.tsx` (linhas 22-52, 124-125), `broker/leads/page.tsx`
(sem `showCalor`, confirmado), `lead-detail-drawer.tsx` (linha 902 "Histórico de Contatos", ~899
citado, diferença desprezível) e `059_audit_logs.sql` (RLS admin-only, confirmado linha a linha).
Nenhuma outra alucinação encontrada.

**Condição registrada (não bloqueia):** a paleta de cores sugerida para os 4 valores é só
sugestão — @dev tem liberdade para ajustar os tons exatos, desde que preserve os dois requisitos
não-negociáveis: paleta sem sobreposição com azul/amarelo/vermelho da Temperatura, e formato de
badge diferente (`rounded-md`+dot, não `rounded-full`).

Status: Draft → Ready.

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-04 | 0.1 | Draft criado a partir do Epic 84 e da Story 84-1 (já em PR #362). Mapeamento detalhado da UI atual de Temperatura confirmou que `lead-card.tsx` não renderiza `interest_level` hoje (só tipo, sem badge) e descobriu que `audit_logs` tem RLS admin-only (`059_audit_logs.sql:30-41`) — exige rota nova com admin client para o histórico ser acessível a roles não-admin com `leads.qualificacao`. | @sm (River) |
| 2026-08-04 | 0.2 | Confirmado com o Lucas: o badge de Qualificação Comercial no kanban é aditivo (fica lado a lado com o de `qualification_score`), não substitui nenhum badge existente. AC2/T3 atualizados para deixar isso explícito. | @sm (River) |
| 2026-08-04 | 0.3 | Validação PO: GO (8/10). Corrigida referência incorreta a `marketingGuard()` (usa `requireRole`, não `canAccess`, na `main` atual — Story 75-229 ainda não mergeada). Substituída referência vaga da query do kanban por citação exata (`LEADS_SELECT` em `broker/pipeline/page.tsx:15` e `dashboard/pipeline/page.tsx:14`), adicionados à Tasks/File List. Status Draft → Ready. | @po (Pax) |
| 2026-08-05 | 0.4 | Implementação completa (T1-T8, modo YOLO, em worktree isolado a partir de `origin/main`): badge compartilhado (`QualificacaoComercialBadge`), select nos 2 forms (+ 4 arquivos intermediários de mapeamento não previstos no draft), badge aditivo no kanban/drawer, filtro + fix do hidden-input do form de busca, rota de histórico com admin client + gate. `vitest` 1675/1675, `tsc --noEmit` limpo, `eslint` limpo (18 arquivos), `next build` OK. Smoke dos forms não feito — sem infra de teste de componente React no projeto (documentado no Dev Agent Record). Status Ready → Ready for Review. | @dev (Dex) |
| 2026-08-05 | 0.5 | QA: FAIL (ver QA Results). Achado de segurança SEC-001 na rota de histórico — corretor consegue ler histórico de leads de outros corretores via chamada direta à API (admin client sem checar ownership do lead). Retorna para @dev. | @qa (Quinn) |
| 2026-08-05 | 0.6 | Fix SEC-001: rota de histórico agora confirma que o usuário pode ver o lead (SELECT via client RLS-scoped, mesma política `leads_select` do GET base) antes de usar o admin client; 404 se bloqueado. Teste novo (TEST-002) cobrindo o cenário. `vitest` 1676/1676, `tsc`/`eslint` limpos. Devolve para @qa. | @dev (Dex) |

## QA Results

### Review Date: 2026-08-05

### Reviewed By: Quinn (Test Architect) — @qa

**Veredito: FAIL — retorna para @dev.**

**7 checks:** code_review CONCERNS (ver SEC-001) · unit_tests PASS (1675/1675, confirmado de
forma independente) · acceptance_criteria PASS (AC1-AC5 satisfeitas funcionalmente) ·
regressions PASS · performance PASS · **security FAIL (SEC-001)** · documentation PASS.

**Validações executadas independentemente pelo QA:** `vitest run` completo (1675/1675, 139
arquivos) · `tsc --noEmit` limpo (`NODE_OPTIONS=--max-old-space-size=8192`) · leitura linha a
linha do diff completo (`git show HEAD`), incluindo a rota nova, os 2 badges, os 2 forms, o
filtro e o drawer · conferência cruzada da política RLS `leads_select`
(`004_rls_policies.sql:104-112`) contra a rota de histórico.

**Achado bloqueante:**

- **SEC-001 (high):** `GET /api/leads/[id]/qualificacao-historico` usa `createAdminClient()`
  (bypassa toda RLS) e só valida `canAccess(...,"leads.qualificacao")` — uma permissão de
  **módulo**, não de **lead específico**. A política `leads_select` restringe corretor a ver
  só leads com `assigned_broker_id` igual ao dele (ou `null`); admin/supervisor veem tudo.
  Como o role `broker` já tem `leads: true` (`047_roles_permissions.sql:239`) e a Story 84-1
  decidiu não seedar override para `leads.qualificacao` (herda de `leads`), **todo corretor
  tem `leads.qualificacao = true` por herança**. Consequência: um corretor autenticado pode
  chamar diretamente `GET /api/leads/{lead-de-outro-corretor}/qualificacao-historico` e receber
  200 com nomes de quem alterou e valores antigo/novo — dado que ele **não consegue ver nem
  abrindo a ficha desse lead** (`GET /api/leads/[id]` devolve 404 por RLS). A UI normal (drawer)
  não expõe esse caminho porque só chama a rota nova depois de já ter carregado o lead pela
  rota RLS-scoped — mas a API em si não se protege de uma chamada direta (curl, devtools, ou
  um bug futuro de UI). Verificado que os 2 testes da rota (`route.test.ts`) só cobrem o
  caminho de permissão de módulo (403/200), nunca o cenário de ownership do lead — por isso os
  testes passam mas o gap real não é pego.
  - **Ação sugerida:** antes de consultar `audit_logs` com o admin client, fazer um SELECT do
    lead pelo client RLS-scoped do usuário (`auth.supabase`, não o admin) — ex.:
    `.from("leads").select("id").eq("id", id).single()` — e devolver 404 se vier vazio/erro
    (mesmo comportamento do GET base), **antes** de cair para o admin client. Isso reaproveita
    a política `leads_select` já existente como fonte de verdade, sem duplicar a lógica de
    `assigned_broker_id` em código novo.

**Achado não-bloqueante:**

- **TEST-002 (medium):** depois do fix de SEC-001, adicionar um teste cobrindo "corretor sem
  relação com o lead → 404", para o gap não voltar silenciosamente.

**Destaques positivos:** distinção visual da Temperatura genuinamente cumprida (paleta
emerald/slate/rose/fuchsia + formato `rounded-md`+dot vs `rounded-full`, via componente
`QualificacaoComercialBadge` reaproveitado em 2 lugares) · badge do kanban corretamente aditivo
(confirmado no diff, ao lado do badge de `qualification_score`, nada removido) · filtro
corretamente combinável e com o fix do hidden-input do form de busca (sem isso, buscar por nome
apagaria o filtro de Qualificação silenciosamente — mesmo bug já visto na Story 75-236) · gap de
teste dos forms (sem infra de componente React) documentado com transparência em vez de
mascarado · nenhuma referência técnica inventada.

### Gate Status

Gate: FAIL → docs/qa/gates/84.2-qualificacao-lead-ui.yml
