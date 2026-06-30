# Story 75-83 — Contador de leads no menu Bolsão

## Metadata
- **Status:** Done · **Epic:** 64 · **Branch:** feat/75-83-bolsao-contador-menu · **Complexidade:** XS (1 ponto)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, contagem real em prod]

## Story
**As a** admin/supervisor/gerente-comercial e corretor, **I want** ver no menu "Bolsão" um contador com a
quantidade de leads no pool, **so that** eu saiba quantos leads estão disponíveis; o número cai conforme os
corretores puxam.

## Contexto
O menu "Bolsão" já existe nos 2 layouts (Story 75-73) e está disponível para admin/supervisor/gerente-comercial
(dashboard, gate hardcoded) e corretor (broker nav) — **confirmado**. Falta o **badge de contagem** (como Agenda/
Obras/Chat já têm). O pool = leads com `bolsao_em` not null (Story 75-80).

## Escopo
**IN:**
- **Dashboard** (`dashboard/layout.tsx`): quando `showBolsao`, contar leads (`org`, `is_active`, `bolsao_em` not null)
  e anexar `badge: bolsaoCount` ao `bolsaoItem` (mesmo padrão do `agendaCount`/Obras).
- **Broker** (`broker/layout.tsx`): contar igual e anexar `badge` ao item `/broker/bolsao`.
- Badge 0 → não aparece (comportamento padrão dos demais badges).

**OUT:**
- Não muda gating (já correto). Não implementa realtime dedicado no badge — atualiza no carregamento/navegação
  (e ao puxar um lead a página do bolsão dá `router.refresh`, re-renderizando o layout → badge cai).

## Acceptance Criteria
1. **Given** N leads no bolsão, **then** o menu "Bolsão" (dashboard e broker) mostra o badge com N.
2. **Given** um corretor puxa um lead, **then** ao re-renderizar (refresh/navegação) o badge cai (N-1).
3. **Given** 0 leads no bolsão, **then** nenhum badge aparece.
4. **Given** corretor (RLS), **then** a contagem funciona (policy `leads_select_bolsao` libera o pool). Admin/gestor veem via is_admin_or_supervisor.
5. typecheck/lint limpos.

## Dev Notes
- Query: `from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("is_active", true).not("bolsao_em", "is", null)`.
- Dashboard: badge anexado em `bolsaoItem` (linha ~192). Broker: no `.map` dos navItems (linha ~87).

## File List
- `packages/web/src/app/dashboard/layout.tsx`
- `packages/web/src/app/broker/layout.tsx`

## QA Results
- **Verdict: PASS.** Badge `bolsaoCount` anexado ao item Bolsão no dashboard (gate showBolsao) e no broker nav,
  via `count:"exact"` (leads `bolsao_em` not null). Renderer `sidebar-nav.tsx` mostra só com `badge > 0` (0 não
  aparece, AC3) e cap "99+". Gating confirmado: admin/supervisor/gerente-comercial (dashboard) + corretor (broker).
- Real: contagem do pool em prod = 0 agora (bolsão recém-ligado), query sem erro. type-check 0, lint 0.

## Change Log
- 2026-06-30 — @sm/@po — Story criada e validada (GO). Contador no menu do bolsão; gating já confirmado.
