# Story 75-54 — Inativar corretor desativa a conta + usuário desativado não acessa o sistema

## Metadata
- **Status:** Done · **Epic:** 75 · **Branch:** main · **Complexidade:** M (3 pontos) · **Tipo:** segurança/acesso
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor, **I want** que inativar um corretor também desative a conta dele, e que qualquer
usuário desativado não consiga mais acessar o sistema, **so that** ex-corretores/usuários percam o acesso.

## Contexto
Pedido do usuário: (1) ao inativar o corretor (deixar indisponível na roleta), a conta tem que ser
desativada (`users.is_active=false`); (2) **regra geral**: usuário desativado (qualquer perfil) não
acessa nada. Hoje `getServerUser`/`requireAuth`/middleware NÃO checavam `is_active` → usuário
desativado continuava acessando.

## Escopo
**IN:**
- Toggle de disponibilidade (`corretores/_actions.ts`): ao alternar `brokers.is_available`, sincroniza
  `users.is_active` do corretor (inativar→false, reativar→true).
- **Middleware** (`lib/supabase/middleware.ts`): usuário autenticado com `is_active=false` → signOut +
  redirect (/cliente p/ portal, /login p/ demais) com `?inativo=1`. Guard anti-loop na própria página
  de login. `/api/*` fora (coberto pelo requireAuth). Bloqueia só `=== false` (null/undefined = ativo).
- **API** (`lib/api-auth.ts requireAuth`): `is_active=false` → 403 "Conta desativada".
**OUT:** UI de mensagem "conta desativada" na tela de login (param `?inativo=1` já enviado — follow-up);
backfill dos corretores já indisponíveis (decisão do usuário — ver Riscos).

## Acceptance Criteria
1. Inativar corretor no toggle → `brokers.is_available=false` E `users.is_active=false`; reativar → ambos true.
2. Usuário com `is_active=false` é deslogado e bloqueado em qualquer página (dashboard/broker/portal).
3. API retorna 403 para usuário desativado.
4. Usuário com `is_active` null/true acessa normal (sem regressão). typecheck/lint limpos.

## Riscos
- Middleware faz 1 query `users.is_active` por request autenticado (não-/api). Custo aceitável p/ a escala.
- **Backfill:** Ana, Vitor, Samara estão indisponíveis mas com conta ativa (estado antigo). Pela nova
  regra deveriam ser desativados — NÃO feito automaticamente (bloquearia login). Decisão do usuário.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.54-inativar-corretor-desativa-conta.yml`)
- Enforça is_active em middleware (páginas) + requireAuth (API) + toggle sincroniza. type-check/lint limpos.

## File List
- `packages/web/src/app/dashboard/configuracoes/corretores/_actions.ts`
- `packages/web/src/lib/supabase/middleware.ts`
- `packages/web/src/lib/api-auth.ts`

## Change Log
- 2026-06-24 — @sm/@dev/@qa — Inativar corretor desativa conta; usuário desativado bloqueado no sistema (middleware + API).
