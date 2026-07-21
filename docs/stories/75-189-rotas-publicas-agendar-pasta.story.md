# Story 75-189 — Middleware bloqueava os links públicos /agendar e /pasta (redirect p/ login)

## Metadata
- **Status:** Done
- **Epic:** 75 — CRM core (infra de rotas) / relacionado ao Epic 81 (agenda IMOB)
- **Branch:** fix/75-189-rotas-publicas-agendar-pasta
- **Tipo:** Bug — reportado pelo Marcos (print, 2026-07-21): link de agendamento
  enviado a parceiro caía na tela de login.

## Context
O link público de agendamento da imobiliária (81-4, `/agendar/[token]`) redirecionava
para `/login` em aba anônima: o `isPublicRoute` do middleware
(`lib/supabase/middleware.ts`) nunca incluiu as rotas públicas por token. Afetados:
- `/agendar/[token]` + `/agendar/cancelar/[token]` (Epic 81)
- `/pasta/[token]` + `/pasta/nova/[token]` (módulo Pastas) — TAMBÉM bloqueados
  (confirmado com curl: 307 → /login), regressão silenciosa no módulo inteiro.

As páginas já se autoprotegem: validam o token via admin client e mostram "link
inválido ou desativado" sem vazar dados — liberar o prefixo no middleware é seguro.
As APIs (`/api/agendar/*` etc.) já eram públicas (`/api/*` com auth por rota).

## Acceptance Criteria
- [x] AC1: `isPublicRoute` inclui `pathname.startsWith("/agendar/")` e
  `pathname.startsWith("/pasta/")`, com comentário do porquê.
- [x] AC2: anônimo acessa `/agendar/<token válido>` (formulário) e token inválido
  mostra o aviso amigável — sem redirect p/ login. Idem `/pasta`.
- [x] AC3: rotas autenticadas continuam protegidas (nenhum outro prefixo liberado).
- [x] AC4: type-check/lint/suíte verdes; verificação em prod pós-deploy com curl.

## File List
- `docs/stories/75-189-rotas-publicas-agendar-pasta.story.md` (this file)
- `packages/web/src/lib/supabase/middleware.ts` (2 prefixos públicos)

## Change Log
- @sm/@po: fluxo mínimo — bug reproduzido (curl 307→/login nos 2 módulos); GO.
- @dev (Dex): whitelist dos prefixos `/agendar/` e `/pasta/` no `isPublicRoute`.
- @qa (Quinn): PASS — páginas token-gated (admin client + maybeSingle + fallback
  amigável); nenhum dado sensível sem token; suíte/type-check/lint verdes.
- @devops (Gage): PR squash-merge, deploy prod automático + curl de verificação.
