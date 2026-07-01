# Story 75-93 — Módulos IMOB / Bolsão / Fluxo na matriz de Perfil de Acesso

## Metadata
- **Status:** Done (QA PASS) — pronto para @devops (push + PR + migration 132) · **Epic:** 35 (Permissões) · **Branch:** feat/75-93-modulos-na-matriz-perfil · **Complexidade:** M-L (5 pontos)
- **executor:** @dev + @data-engineer (seed) · **quality_gate:** @qa · **quality_gate_tools:** [seed em txn rollback, verificação de acesso preservado, typecheck, lint]
- **Prioridade:** 🟠 ALTA — gestão não consegue controlar IMOB/Bolsão/Fluxo por perfil; bloqueia perfis customizados.

## Story
**As a** admin, **I want** que os módulos IMOB, Bolsão e Fluxo de Pagamento apareçam na matriz de **Perfil de Acesso** e sejam respeitados, **so that** eu controle por perfil quem vê cada um — inclusive perfis customizados novos.

## Contexto
A matriz mostra `ALL_MODULES` (20 módulos). **IMOB, Bolsão e Fluxo nunca foram registrados** ali — foram plugados no menu por checagem de **nome de role fixa** (`user.role === admin/supervisor/gerente-comercial` em `dashboard/layout.tsx`: `showImob`/`showBolsao`/`showFluxo`). Confirmado no banco: nenhum role da org tem `imob`/`bolsao` em `role_permissions`. Efeito: não dá pra ligar/desligar por perfil, e perfil custom novo (ex.: "consultoria") nunca vê esses 3.

O sistema resolve permissão por `role_permissions` (DB) com fallback `getHardcodedPermissions`. `canAccess(userId, orgId, module)` e `getUserPermissions` já existem. Constraint `UNIQUE (role_id, module)`; `role_permissions` tem `org_id` (NOT NULL).

## Escopo
**IN:**
1. **Registrar** `imob`, `bolsao`, `fluxo` em `ALL_MODULES` + `MODULE_LABELS` + `MODULE_DESCRIPTIONS` (`lib/permissions-modules.ts`).
2. **Migration 132** (seed `role_permissions`, idempotente `ON CONFLICT DO NOTHING`) espelhando o acesso ATUAL, p/ todos os roles de todas as orgs:
   - `imob`: `admin`, `supervisor` = true; demais false.
   - `bolsao`: `admin`, `supervisor`, `gerente-comercial` = true; demais false.
   - `fluxo`: `admin`, `gerente-comercial` = true; demais false.
3. **Fallback** (`getHardcodedPermissions`): `supervisor` recebe `fluxo:false` (fullMatrix marcaria true, mas supervisor não vê fluxo hoje). admin=fullMatrix (já cobre os 3). (DB seed é a fonte de verdade p/ orgs seeded; fallback só p/ orgs sem seed.)
4. **Gating pela matriz** (troca `role ===` por permissão):
   - `dashboard/layout.tsx`: `showImob=permissions["imob"]`, `showBolsao=permissions["bolsao"]`, `showFluxo=permissions["fluxo"]`.
   - `dashboard/imob/page.tsx` + `dashboard/imob/imobiliarias/page.tsx`: guard `canAccess(user.id, orgId, "imob")`.
   - `lib/imob/guard.ts` (imobGuard, usado por todas as APIs imob): trocar `requireRole([admin,supervisor])` por `canAccess(appUser.id, appUser.org_id, "imob")`.
   - `dashboard/bolsao/page.tsx`: adicionar guard `canAccess(...,"bolsao")` (hardening; hoje depende só do menu).

**OUT:**
- Não mexe no app do corretor (`/broker/*`) — a bolsão do corretor é parte de ser corretor (role broker), separado do módulo "bolsao" do dashboard.
- Não mexe na capacidade de PUXAR do bolsão (`canPullBolsaoDashboard`, Story 75-90) — é permissão fina, fica como está.
- Não muda a matriz de outros módulos.

## Acceptance Criteria
1. **Given** a matriz de Perfil de Acesso, **then** IMOB, Bolsão e Fluxo aparecem como módulos (23 no total).
2. **Given** o seed, **then** o acesso ATUAL é preservado: admin/supervisor veem IMOB; admin/supervisor/gerente-comercial veem Bolsão; admin/gerente-comercial veem Fluxo — sem ninguém perder o que já via.
3. **Given** um perfil custom (ex.: "consultoria") com IMOB marcado na matriz, **then** ele passa a ver o menu IMOB, abrir a página e usar a API (não 403).
4. **Given** um perfil com IMOB desmarcado, **then** não vê o menu nem acessa a página/API (redirect/403).
5. **Given** admin desmarca "Fluxo" de um perfil, **then** o link some pra quem tem esse perfil.
6. seed idempotente (rodar 2x não duplica); acesso preservado verificado; typecheck/lint limpos.

## Dev Notes
- `permissions["x"]` no layout já vem de `getUserPermissions` (linha ~99). Após seed + ALL_MODULES, resolve os 3 novos.
- Guards de página: `import { canAccess } from "@web/lib/permissions"` + `if (!(await canAccess(user.id, user.orgId, "imob"))) redirect("/dashboard")`.
- `imobGuard`: hoje `requireAuth` + `requireRole(["admin","supervisor"])`. Trocar o requireRole por `canAccess(appUser.id, appUser.org_id, "imob")` → 403 se false. Mantém `requireAuth`.
- Seed (migration 132):
  ```sql
  INSERT INTO role_permissions (org_id, role_id, module, can_access)
  SELECT r.org_id, r.id, m.module,
    CASE m.module
      WHEN 'imob'   THEN r.name IN ('admin','supervisor')
      WHEN 'bolsao' THEN r.name IN ('admin','supervisor','gerente-comercial')
      WHEN 'fluxo'  THEN r.name IN ('admin','gerente-comercial')
    END
  FROM roles r CROSS JOIN (VALUES ('imob'),('bolsao'),('fluxo')) AS m(module)
  ON CONFLICT (role_id, module) DO NOTHING;
  ```
- ⚠️ Raio de impacto = controle de acesso de TODOS. Testar seed em txn rollback + provar que admin/supervisor/gerente-comercial mantêm acesso. Ref. [[feedback-nao-quebrar-o-que-funciona]] e [[project-roles-permissoes]]. Alinha com a direção de [[feedback-hierarquia-perfis-comercial]] (matriz > nome fixo).

## File List
- `packages/web/src/lib/permissions-modules.ts` — +imob/bolsao/fluxo (ALL_MODULES + labels + descrições).
- `packages/web/src/lib/permissions.ts` — supervisor fallback `fluxo:false`.
- `supabase/migrations/132_seed_modules_imob_bolsao_fluxo.sql` (novo) — seed idempotente.
- `packages/web/src/app/dashboard/layout.tsx` — show* via `permissions[...]`.
- `packages/web/src/app/dashboard/imob/page.tsx` + `imob/imobiliarias/page.tsx` — guard `canAccess("imob")`.
- `packages/web/src/lib/imob/guard.ts` — imobGuard via `canAccess("imob")`.
- `packages/web/src/app/dashboard/bolsao/page.tsx` — guard `canAccess("bolsao")`.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Fecha o débito que trava perfis customizados (matriz > nome fixo). Escopo IN/OUT claro, ACs testáveis, seed preserva acesso atual (AC2 é o "não quebrar"). Reuso de `canAccess`/`getUserPermissions`. Raio de impacto alto → QA exige prova de acesso preservado + seed em rollback. Status → Approved.

## Dev Agent Record (@dev Dex — 2026-07-01)
- [x] `permissions-modules.ts`: +`imob`/`bolsao`/`fluxo` em ALL_MODULES + labels + descrições (agora 23 módulos).
- [x] `permissions.ts`: supervisor fallback `fluxo:false`.
- [x] Migration `132_seed_modules_imob_bolsao_fluxo.sql`: seed idempotente espelhando acesso atual (todas as orgs).
- [x] `dashboard/layout.tsx`: `showImob/showBolsao/showFluxo` via `permissions[...]` (não mais role fixo).
- [x] Guards de página: `imob/page.tsx` + `imob/imobiliarias/page.tsx` → `canAccess("imob")`; `dashboard/bolsao/page.tsx` → `canAccess("bolsao")` (novo guard).
- [x] `lib/imob/guard.ts` (imobGuard, todas as APIs imob): `requireRole` → `canAccess("imob")` (403 se sem acesso).
- **Checks:** `tsc` 0; `eslint` 0. Seed testado em txn rollback (idempotente 2×, acesso preservado). Migration NÃO aplicada em prod (=@devops).
- Branch `feat/75-93-modulos-na-matriz-perfil`, commit local (sem push).

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS.** ✅
- **Seed (txn rollback, prod, rodado 2×):** acesso resultante espelha EXATAMENTE o atual — admin(imob/bolsao/fluxo), supervisor(imob/bolsao), gerente-comercial(bolsao/fluxo), demais nenhum. `rows_3mods=3` por role → **idempotente** (sem duplicar). AC2 (não quebrar) ✅.
- **Rastreabilidade:** AC1 — 3 módulos em ALL_MODULES (23 total) → aparecem na matriz. AC3/AC4 — menu (layout) + página (canAccess) + API (imobGuard) agora leem a matriz → perfil custom com imob ligado vê/usa; desligado é bloqueado (redirect/403). AC5 — Fluxo via `permissions["fluxo"]` no menu. AC6 — idempotência + acesso preservado + tsc/lint 0.
- **Observações:** `/broker/*` intocado (bolsão do corretor é role broker, separado do módulo "bolsao" do dashboard — por design). Capacidade de PUXAR do bolsão (75-90) inalterada.

**Gate → PASS.** Pronto para @devops (push + PR + aplicar migration 132 + deploy).

## Change Log
- 2026-07-01 — @qa (Quinn) — Gate PASS (seed txn rollback idempotente 2x, acesso preservado 1:1; tsc/lint 0). Status → Done.
- 2026-07-01 — @dev (Dex) — Implementado: registro dos 3 módulos + seed 132 + gating pela matriz (layout/páginas/imobGuard). Sem push.
- 2026-07-01 — @po (Pax) — GO. Escopo confirmado (IMOB+Bolsão+Fluxo). Status Draft → Approved.
- 2026-07-01 — @sm — Story criada (Epic 35 / Permissões). Registrar módulos novos na matriz + gating pela matriz, preservando acesso.
