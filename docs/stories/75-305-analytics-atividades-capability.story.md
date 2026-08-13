# Story 75-305 — Perfis de Acesso 2.0 · F3-4: Analytics & Atividades via capabilities

**Story ID:** 75-305
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** XS (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, smoke em dev]
- **Tipo:** migração de gate (F3-4, template 75-302/303/304)

## Story

Como **admin**, quero **Analytics e Atividades decididos pela matriz** (`analytics.geral`,
`analytics.executivo`, `atividades.ver`), substituindo 7 checagens hardcoded (6 rotas + 1 página
com constante `ALLOWED_ROLES` local).

**Zero mudança de comportamento** — seeds = listas antigas: geral [A,S]; executivo [A,S,GC,SDR];
atividades [A,S,GC]. Congelado em teste.

## 🔴 Decisão de desenho registrada: `dashboard.ver_equipe` NÃO migra

O inventário havia catalogado os blocos "Leads/Funil da Equipe" do dashboard (só GC/SDR) como
capability. **Descoberta ao migrar:** o bypass de admin do modelo (`can()` = sempre true p/
admin) tornaria admin/supervisor elegíveis — e eles hoje NÃO veem esses blocos (têm dashboard
próprio). Isso não é autorização: é **composição de UX por role** — admin PODE ver, só não é a
tela dele. Reclassificada: segue como role-check no código, descrição do registro anotada,
teste garante que ela nunca aparece na matriz sem decisão explícita. Reavaliar na F5.
(Regra nova do template F3: capability cujo seed EXCLUI admin de propósito = suspeita de UX,
não de autorização — parar e reclassificar.)

## Acceptance Criteria

- [x] **AC1** — 6 rotas de analytics via `requireCapability`; página de atividades via `can()`;
      constante local removida; grep `requireRole` em `api/analytics` = 0.
- [x] **AC2** — Espelho estrito (3 seeds = listas antigas; teste congela).
- [x] **AC3** — 3 capabilities enforced na matriz/exceções; `dashboard.ver_equipe`
      explicitamente NÃO (teste garante).
- [x] **AC4** — Gates verdes + smoke em dev (APIs 200 p/ admin — executive conferido com
      params válidos; atividades abre; admin segue SEM blocos de equipe; 3 ações na matriz).
- [x] **AC5** — Limites: RLS/views de analytics (v_lead_drill etc., admin-only por
      `user_role()`) intocadas — F4.

## Change Log

- 2026-08-13 · @sm (River) · Draft (template F3).
- 2026-08-13 · @po (Pax) · **GO (9/10)** — a reclassificação de ver_equipe exigida como seção
  própria da story (decisão de taxonomia, não nota de rodapé). → Ready.

## File List

| arquivo | ação |
|---|---|
| 6 rotas `api/analytics/**` | `requireRole` → `requireCapability` (geral ×4, executivo ×2) |
| `dashboard/atividades/page.tsx` | `ALLOWED_ROLES` local REMOVIDA → `can("atividades.ver")` |
| `lib/capabilities.ts` | 3 caps enforced; `dashboard.ver_equipe` anotada como UX-por-role |
| `lib/capabilities.test.ts` | espelhos + teste de que ver_equipe segue não-enforced |

## Dev Agent Record

**Fable 5 · @dev (Dex) · YOLO · 13/08/2026** · Branch `feat/75-305-analytics-atividades-capability`.

- Diff seed×gate: 3×3 idênticos (congelados). O 4º candidato (ver_equipe) REPROVOU no diff —
  o bypass de admin mudaria comportamento — e virou a regra nova do template.
- Smoke (read-only): APIs geral/executive 200 p/ admin (executive: 1º teste deu 400 por FALTA
  DE PARAMS — validação da rota, não gate; re-testado com from/to válidos → 200) · atividades
  abre · admin sem blocos de equipe (prova da reclassificação) · 3 ações na matriz ·
  "Blocos de equipe" ausente da matriz.
- Gates: suíte **2336 passed** · tsc 0 · eslint base 24 · build 0.

## QA Results

### 2026-08-13 · Quinn (@qa) · Round 1 — **PASS · quality score 96**

A story mais valiosa pelo que NÃO migrou: a regra "seed sem admin = suspeita de UX" evita uma
classe inteira de regressão nas próximas (ex.: bolsao.puxar_dashboard [GC],
roleta.atender_todo_empreendimento [SDR] — mesmos candidatos a reclassificação na F3 deles).
Smoke com o falso-positivo do 400 investigado até a causa (param, não gate) — padrão certo.
