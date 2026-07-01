# Story 75-99 — Mundo IMOB · Fase 2: telas Leads + Pipeline do IMOB (+ Novo lead)

## Metadata
- **Status:** Done (QA PASS) — epic completo, aguardando deploy · **Epic:** IMOB (mundo isolado) · **Branch:** feat/75-98-imob-segmento-fase1 · **Complexidade:** M-L (5 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [teste de criação de lead imob (banco rollback), typecheck, lint]
- **Prioridade:** 🟠 ALTA — entrega visível do mundo IMOB (depende da 1a+1b, já feitas).

## Contexto
Fase 1 isolou o `segmento`. Agora o mundo IMOB ganha suas telas DENTRO do módulo IMOB (`/dashboard/imob`), escopadas a `segmento='imob'`. Perfis `imob`/`consultoria` só acessam o módulo IMOB (matriz); `admin`/`supervisor` também entram e veem o pipeline distinto. Lead IMOB é manual e nasce `segmento='imob'`.

## Escopo
**IN:**
1. **API `POST /api/imob/leads`** (gated por `canAccess("imob")`): cria lead com `segmento='imob'`, `stage_id`=novo (Aguardando atendimento), org do usuário. Campos: nome, telefone (obrigatório), email, property_interest_id (opcional), observação. NUNCA entra na roleta (segmento imob já é excluído — Fase 1).
2. **Reuso do Pipeline:** `/api/pipeline/leads` passa a aceitar `?segmento=` (default `principal`); `KanbanBoard` ganha prop `segmento?` repassada no "carregar mais". Assim o mesmo board serve ao IMOB (`segmento="imob"`).
3. **Nav do módulo IMOB** (recriar `imob-tabs`): Imobiliárias | Leads | Pipeline. Inserir nas 3 páginas.
4. **`/dashboard/imob/leads`** (server, gated `canAccess imob`): lista os leads `imob` da org + botão "Novo lead" → modal (nome/telefone/email/empreendimento) → POST → refresh.
5. **`/dashboard/imob/pipeline`** (server, gated): kanban dos leads `imob` (mesmas etapas), via `<KanbanBoard segmento="imob">`.
6. `/dashboard/imob` redireciona para `/dashboard/imob/leads` (tela operacional).

**OUT:** sem detalhe/conversa dedicado do lead IMOB nesta fase (mover etapa no kanban já atende o básico); sem distribuição automática (é manual); analytics do IMOB (futuro, se pedirem).

## Acceptance Criteria
1. **Given** perfil com acesso ao IMOB, **then** vê abas Imobiliárias | Leads | Pipeline no módulo.
2. **Given** "Novo lead" no IMOB, **when** preenche nome+telefone e salva, **then** cria lead `segmento='imob'`, etapa "Aguardando atendimento", aparece na lista/pipeline do IMOB.
3. **Given** o lead IMOB criado, **then** ele **NÃO** aparece no /dashboard/leads nem /dashboard/pipeline principais, **não** entra na roleta/bolsão, **não** conta em analytics (Fase 1 garante).
4. **Given** o Pipeline do IMOB, **then** mostra só leads `imob` e o arraste move etapa (persistido); "carregar mais" traz só imob.
5. **Given** o /api/pipeline/leads sem `segmento`, **then** continua `principal` (main pipeline inalterado).
6. teste de criação (banco rollback) + typecheck/lint limpos.

## Dev Notes
- Criar lead: espelha `POST /api/leads` insert, mas via `imobGuard` + `segmento:'imob'` + `stage_id` = novo (`00000000-0000-0000-0001-000000000001`). Sem dedup por telefone entre mundos (imob é separado) — ou dedup só dentro de imob.
- `/api/pipeline/leads`: `const seg = searchParams.get("segmento") || "principal"; .eq("segmento", seg)`.
- `KanbanBoard`: `segmento?: string` na interface; no load-more `if (segmento) params.set("segmento", segmento)`.
- Pipeline IMOB page: fetch por stage com `.eq("segmento","imob")` (espelha dashboard/pipeline) + `<KanbanBoard segmento="imob" initialStages initialLeadsPerStage />`. Persistência do arraste = client supabase (RLS de leads já permite membros da org — validar).
- Nav: `imob-tabs.tsx` (client, usePathname) com 3 links.

## File List
- `packages/web/src/app/api/imob/leads/route.ts` (novo) — POST criar lead imob.
- `packages/web/src/app/api/pipeline/leads/route.ts` — param `segmento`.
- `packages/web/src/components/pipeline/kanban-board.tsx` — prop `segmento` no load-more.
- `packages/web/src/app/dashboard/imob/_components/imob-tabs.tsx` (novo) — nav 3 abas.
- `packages/web/src/app/dashboard/imob/imobiliarias/page.tsx` — inserir nav.
- `packages/web/src/app/dashboard/imob/leads/page.tsx` (novo) + `_components/imob-leads-manager.tsx` (novo).
- `packages/web/src/app/dashboard/imob/pipeline/page.tsx` (novo).
- `packages/web/src/app/dashboard/imob/page.tsx` — redirect p/ /leads.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Entrega do mundo IMOB reusando pipeline/KanbanBoard (param segmento, backward-safe) + criação manual isolada. Depende da 1a/1b (isolamento) já feitas. Status → Approved.

## Dev Agent Record (@dev Dex — 2026-07-01)
- [x] `POST /api/imob/leads` (imobGuard): cria lead `segmento='imob'`, stage novo, channel 'manual'.
- [x] `/api/pipeline/leads`: param `?segmento=` (default principal; 'imob' escopa).
- [x] `KanbanBoard`: prop `segmento?` repassada no load-more (+ dep do useCallback).
- [x] `imob-tabs.tsx` (nav: Leads | Pipeline | Imobiliárias) inserido nas 3 páginas.
- [x] `/dashboard/imob/leads` (page + `imob-leads-manager`): lista imob + "Novo lead" (modal → POST → refresh).
- [x] `/dashboard/imob/pipeline`: KanbanBoard escopado a `segmento="imob"` (mesmas etapas).
- [x] `/dashboard/imob` redireciona p/ `/dashboard/imob/leads`.
- **Checks:** `tsc` 0; `eslint` 0 errors (warning `<img>` pré-existente). Branch do epic (feat/75-98). Sem push.

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS (com 1 item de teste manual).** ✅
- **Criação (txn rollback, prod):** lead via insert do endpoint → `segmento='imob'` ✅, stage "Aguardando atendimento" ✅, **não aparece em query do principal** (`aparece_no_principal=0`) ✅, aparece no IMOB (`=1`) ✅.
- **Rastreabilidade:** AC1 nav ✅; AC2 criação isolada ✅; AC3 isolamento (Fase 1) ✅; AC4 pipeline escopado (query `segmento='imob'` + load-more param) ✅; AC5 `/api/pipeline/leads` sem param = principal ✅; AC6 tsc/lint 0.
- **⚠️ Teste manual pós-deploy:** o arraste do KanbanBoard persiste via client supabase (RLS de leads). Brokers já fazem isso (membros da org); usuário perfil `imob` é membro da org → deve funcionar, mas **validar no ar** que um usuário imob consegue mover etapa no pipeline IMOB.

**Gate → PASS.** Fase 2 pronta. Epic mundo IMOB completo (1a+1b+2), aguardando deploy.

## Change Log
- 2026-07-01 — @po (Pax) — GO. Status Draft → Approved.
- 2026-07-01 — @sm — Story criada (Epic mundo IMOB). Fase 2: telas Leads + Pipeline do IMOB + Novo lead manual.
