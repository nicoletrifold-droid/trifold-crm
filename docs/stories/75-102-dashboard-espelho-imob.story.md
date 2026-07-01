# Story 75-102 — Dashboard como "espelho" do mundo IMOB (perfis imob/consultoria)

## Metadata
- **Status:** Done (QA PASS) — pronto p/ @devops · **Epic:** IMOB (mundo isolado) · **Branch:** feat/75-102-dashboard-espelho-imob · **Complexidade:** S (3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **Prioridade:** 🟠 UX + coerência do mundo IMOB (pedido do diretor).

## Contexto
No épico do mundo IMOB isolado, os perfis `imob`/`consultoria` são "a outra empresa". Hoje o `/dashboard` é fixo no mundo PRINCIPAL (`segmento='principal'`) — então a Daiana (imob), ao abrir o dashboard, vê a casca do painel principal zerada (isolamento de dados funcionando, mas tela errada) e nem tem o botão "Dashboard" no menu (`dashboard` module = false p/ esses perfis). Decisão do diretor: **manter o dashboard bonito como tela inicial dos 2 perfis, mas amarrado ao funil DELES** (espelho do IMOB), e **liberar o botão Dashboard** pra eles.

## Story
**As a** perfil `imob`/`consultoria`, **I want** um dashboard que reflete o MEU funil (mundo IMOB), **so that** minha tela inicial mostre meus números reais, com a mesma UI do principal, sem ver o mundo principal.

## Escopo
**IN:**
1. **Botão "Dashboard" p/ imob+consultoria:** migration 138 seta `role_permissions.dashboard = true` p/ roles `imob` e `consultoria` (idempotente, todas as orgs). O item já aparece no menu (gate `permissions["dashboard"]`).
2. **Dashboard segment-aware** (`dashboard/page.tsx`): `const isImobWorld = role ∈ {imob, consultoria}` → `segmento = isImobWorld ? 'imob' : 'principal'`. Aplica em `leadsToday`, `activeLeads` (`.eq('segmento', segmento)`) e passa `p_segmento` p/ a RPC de contagem. Principal 100% inalterado.
3. **RPC:** migration 137 — `get_dashboard_stage_counts(p_org_id, p_segmento text default 'principal')` (default preserva chamadas antigas; backward-compatible).
4. **Links do mundo certo:** p/ imob-world, cards e etapas do Pipeline apontam p/ `/dashboard/imob/leads` e `/dashboard/imob/pipeline` (sem query params que as telas IMOB não interpretam); principal mantém `/dashboard/leads`/`/dashboard/pipeline?stage=` como hoje.
5. **Cards Empreendimentos/Unidades:** MANTIDOS visíveis p/ IMOB (decisão do diretor — mesmos empreendimentos que a imobiliária ajuda a vender). Sem alteração.

**OUT:** bloco "Visão da Equipe / Gerente Comercial" (não renderiza p/ imob, `isGerenteComercial=false`). Analytics/relatórios do IMOB (fora do épico). Sem mudança no mundo principal.

## Acceptance Criteria
1. **Given** usuário `imob`/`consultoria`, **then** vê o item "Dashboard" no menu e o dashboard mostra métricas/Pipeline do `segmento='imob'` (hoje 0, mas fiel ao funil IMOB).
2. **Given** usuário `imob`/`consultoria` no dashboard, **when** clica num card de lead ou etapa do Pipeline, **then** vai p/ `/dashboard/imob/leads` ou `/dashboard/imob/pipeline` (nunca telas do principal).
3. **Given** admin/supervisor/gerente-comercial/etc., **then** o dashboard continua idêntico (mundo principal) — nenhuma regressão.
4. **Given** a RPC `get_dashboard_stage_counts` chamada sem `p_segmento`, **then** assume `'principal'` (compatível).
5. Cards Empreendimentos/Unidades continuam visíveis p/ todos. tsc/lint limpos.

## Dev Agent Record (@dev — 2026-07-01)
- [x] `page.tsx` segment-aware: `isImobWorld` (role imob/consultoria) → `segmento`/`leadsHref`/`pipelineHref`; aplicado em `leadsToday`, `activeLeads`, RPC (`p_segmento`) e nos links dos cards + etapas do Pipeline. Principal 100% igual.
- [x] `lib/auth.ts`: união `AppUser.role` atualizada com as roles reais que faltavam (`gerente-relacionamento`, `imob`, `consultoria`) — a comparação de role agora tipa. Sem quebrar nada (tsc full 0).
- [x] migration **137** — `get_dashboard_stage_counts` com `p_segmento` (default 'principal'). ⚠️ **DROP da versão de 1 arg antes do CREATE** (senão vira sobrecarga → "function is not unique" na chamada de 1 arg = quebraria o principal). Testado em BEGIN/ROLLBACK: 1-arg (código antigo) = 520 leads OK, 2-arg imob = 0 OK.
- [x] migration **138** — `role_permissions.dashboard=true` p/ imob+consultoria (upsert idempotente). Testado: 2 roles = true.
- **Checks:** `tsc` 0 · `eslint` 0. Migrations validadas em transação (revertidas). Aplicar em prod no @devops.
- **Files:** `packages/web/src/app/dashboard/page.tsx`, `packages/web/src/lib/auth.ts`, `supabase/migrations/137_*.sql`, `supabase/migrations/138_*.sql`, story.

## QA Results (@qa — 2026-07-01)
- **PASS.**
- **AC1-2 (imob-world):** dashboard filtra `segmento='imob'` em todas as métricas de lead + RPC; links de lead/pipeline vão p/ `/dashboard/imob/*`. Botão Dashboard liberado via permissão (138).
- **AC3 (sem regressão no principal):** `isImobWorld=false` p/ admin/supervisor/gerente-comercial/obras/etc → `segmento='principal'`, hrefs e query params idênticos ao anterior. Bloco Gerente Comercial intocado.
- **AC4 (RPC compat):** o DROP+CREATE elimina a ambiguidade; chamada de 1 arg resolve p/ a nova função via default. Verificado em prod-transação (520 principal / 0 imob).
- **AC5:** cards Empreendimentos/Unidades mantidos p/ todos (propriedades não são segmentadas).
- **Risco de dado:** nenhum — só leitura filtrada + upsert de permissão idempotente. Migration de função é backward-compatible com o código antigo (janela de deploy segura).
- **Nota:** dashboard é server component sem suíte automatizada (padrão do projeto) → AC por inspeção + validação SQL em transação.

## Change Log
- 2026-07-01 — @dev/@qa — dashboard-espelho implementado (segment-aware + hrefs), união de role corrigida, migrations 137/138 validadas em transação. Done.
- 2026-07-01 — @po — GO (10/10).
- 2026-07-01 — @sm — Story criada (dashboard-espelho do mundo IMOB + botão Dashboard p/ imob/consultoria).
