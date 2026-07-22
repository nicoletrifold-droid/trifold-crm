# Story 75-205 — "Ver completo" jogava a Elisabete pro Início (role ausente no JWT)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core / sequência da 75-199
- **Branch:** fix/75-205-drawer-role-token
- **Tipo:** Bug — Marcos (vídeo da Elisabete, 2026-07-22): corretora clica
  "Ver completo" no drawer do Meu Pipeline e cai na tela de Início. Só ela
  relatou.

## Causa raiz
O drawer decidia o destino de "Ver completo"/"Editar Lead" lendo
`app_metadata.role` do JWT. **10 contas de prod estavam com o metadata ausente/
divergente de `users.role`** (Elisabete, Matheus Barbosa, Thielly/sdr, Daiana,
Samara, Robson Campo/supervisor, +4) — os endpoints de criação de usuário NUNCA
gravaram `app_metadata` (só o fluxo de cliente do portal grava). Antes da
75-199 o default era `/broker/leads` → corretor com metadata vazio funcionava
POR ACASO; a inversão (`role !== "broker"` → dashboard) mandou a Elisabete p/
`/dashboard/leads/[id]` → layout expulsa → Início. Vídeo confirmado frame a
frame (Meu Pipeline → drawer David Lucas → Ver completo → Início).
Efeito colateral descoberto: o botão "Transferir Corretor" (75-204) também lia
o JWT — a Thielly não o veria.

## Fix (3 camadas)
- [x] AC1 (raiz do sintoma): destino do drawer derivado da **URL atual**
  (`usePathname().startsWith("/broker")`), não do role — determinístico,
  independe de token. Efeito de `auth.getUser()` removido.
- [x] AC2: `TransferBrokerSection` ganha fallback igual ao do middleware
  (JWT vazio → lê `public.users` por `auth_id`).
- [x] AC3 (dados): backfill em PROD — `raw_app_meta_data.role` sincronizado com
  `users.role` p/ os 10 divergentes; verificação pós: 0 restantes. (Data-fix em
  auth.users; sem migration — não é schema versionado. JWT atualiza no próximo
  refresh/login.)
- [x] AC4 (origem): os 6 `auth.admin.createUser` de staff (brokers ×3, users,
  users/[id] recria, reset-password recria) passam a gravar
  `app_metadata: { role }` — conta nova não nasce mais divergente. Cliente do
  portal já gravava.
- [x] AC5: type-check/lint/suíte verdes (1146/1146).

## File List
- `docs/stories/75-205-drawer-role-token.story.md` (this file)
- `packages/web/src/components/leads/lead-detail-drawer.tsx`
- `packages/web/src/app/api/brokers/route.ts`
- `packages/web/src/app/api/users/route.ts`
- `packages/web/src/app/api/users/[id]/route.ts`
- `packages/web/src/app/api/users/[id]/reset-password/route.ts`

## Change Log
- @sm/@po 2026-07-22: bug com vídeo; causa confirmada em prod (query
  users×auth.users). GO.
- @dev (Dex)/@qa (Quinn) 2026-07-22: PASS — 1146/1146; pathname cobre os dois
  mundos (drawer é usado em /broker/* e /dashboard/*); backfill verificado.
- @devops (Gage) 2026-07-22: backfill aplicado em prod; PR + merge + deploy.
