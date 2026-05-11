---
epic: 23
story: 23.1
title: Redefinição de Senha e Toggle de Visibilidade
status: InReview
priority: P1
created_at: 2026-05-11
created_by: River (@sm)
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: [auth_flow, email_delivery, ui_toggle, regression_login]
complexity: S
estimated_hours: 3
depends_on: []
blocks: []
---

# Story 23.1 — Redefinição de Senha e Toggle de Visibilidade

## Contexto

**Epic 23 — Auth UX: Redefinição de Senha e Melhorias de Usabilidade**

A tela de login (`/login`) é o único ponto de entrada para todos os perfis do sistema — admins,
corretores e clientes do portal. Dois problemas de usabilidade existem atualmente:

1. **Sem recuperação de senha:** usuários que esquecem a senha precisam de intervenção manual
   de um admin para ter o acesso restaurado. O Supabase possui `resetPasswordForEmail` pronto para
   uso — apenas precisa ser exposto via UI.

2. **Sem toggle de visibilidade da senha:** usuários não conseguem verificar o que digitaram,
   causando tentativas repetidas com erro de digitação.

**Infraestrutura existente:**

- `packages/web/src/app/login/page.tsx` — formulário de login atual (Server Action)
- `packages/web/src/app/login/actions.ts` — `login()` e `logout()` via `supabase.auth`
- `packages/web/src/lib/supabase/server.ts` e `client.ts` — clientes Supabase já configurados
- Supabase Auth configurado com email provider ativo

**Fluxo de reset (Supabase):**

1. Usuário clica "Esqueceu a senha?" → formulário com campo email
2. `supabase.auth.resetPasswordForEmail(email, { redirectTo })` envia email com link mágico
3. Link redireciona para `/auth/confirm?token_hash=...&type=recovery`
4. Supabase valida o token e redireciona para `/reset-senha`
5. Página `/reset-senha` exibe formulário com novo campo senha
6. `supabase.auth.updateUser({ password: newPassword })` persiste a nova senha
7. Usuário é redirecionado para `/login` com feedback de sucesso

## Story Statement

**Como** usuário do Trifold CRM (admin, corretor ou cliente),
**Quero** poder redefinir minha senha pelo email e visualizar o que estou digitando no campo senha,
**Para que** eu possa recuperar acesso sem depender de um administrador e evitar erros de digitação.

## Acceptance Criteria

- [ ] **AC1:** A tela `/login` exibe um link "Esqueceu a senha?" abaixo do botão "Entrar".
  Ao clicar, a view muda para um formulário com campo email e botão "Enviar link de recuperação"
  (sem navegar para outra URL — troca de estado local no componente).

- [ ] **AC2:** Ao submeter o formulário de recuperação com email válido,
  `supabase.auth.resetPasswordForEmail` é chamado com `redirectTo` apontando para
  `/auth/callback?next=/reset-senha`. O usuário vê mensagem: "Enviamos um link de recuperação
  para [email]. Verifique sua caixa de entrada."

- [ ] **AC3:** Ao submeter com email inválido (formato errado), o campo exibe erro de validação
  HTML5 nativo (sem request ao Supabase).

- [ ] **AC4:** Ao clicar no link do email, o usuário é redirecionado para `/reset-senha`.
  A página exibe formulário com: campo "Nova senha", campo "Confirmar senha" e botão "Redefinir senha".

- [ ] **AC5:** Ao submeter `/reset-senha` com senhas iguais e mínimo de 8 caracteres,
  `supabase.auth.updateUser({ password })` é chamado. Em caso de sucesso, usuário é redirecionado
  para `/login` com parâmetro `?reset=success`. O login exibe banner: "Senha redefinida com sucesso."

- [ ] **AC6:** Ao submeter `/reset-senha` com senhas diferentes, exibe erro inline:
  "As senhas não coincidem." Nenhuma chamada ao Supabase é feita.

- [ ] **AC7:** Ao submeter `/reset-senha` com senha menor que 8 caracteres, exibe erro inline:
  "A senha deve ter pelo menos 8 caracteres." Nenhuma chamada ao Supabase é feita.

- [ ] **AC8:** O campo senha na tela de login possui ícone de olho (👁) à direita.
  Ao clicar, alterna entre `type="password"` e `type="text"`. O ícone muda visualmente
  (olho aberto / olho fechado). O mesmo toggle existe nos dois campos de `/reset-senha`.

- [ ] **AC9:** Existe um route handler em `packages/web/src/app/auth/callback/route.ts`.
  Ao receber `?token_hash=...&type=recovery`, chama `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })`
  para estabelecer a sessão e redireciona para o parâmetro `next` (ex: `/reset-senha`).
  Se não existir, criar o route handler. A rota `/auth/callback` deve estar na lista de rotas
  públicas do middleware (`updateSession` em `src/lib/supabase/middleware.ts`).

- [ ] **AC10:** O fluxo de login padrão (sem reset) não regride — corretores, admins e clientes
  continuam sendo redirecionados corretamente para `/broker`, `/dashboard` e `/cliente/*`.

## Escopo

**IN SCOPE:**
- `packages/web/src/app/login/page.tsx` — adicionar toggle senha + link + view de recuperação
- `packages/web/src/app/login/actions.ts` — adicionar Server Action `requestPasswordReset()`
- `packages/web/src/app/reset-senha/page.tsx` — nova página (criar)
- `packages/web/src/app/reset-senha/actions.ts` — Server Action `resetPassword()` (criar)
- `packages/web/src/app/auth/callback/route.ts` — verificar/criar route handler para token recovery

**OUT OF SCOPE:**
- Customização do template de email enviado pelo Supabase (usa padrão do Supabase)
- Política de expiração do link (usa padrão do Supabase: 1h)
- Autenticação multi-fator (MFA)
- Login social (Google, etc.)
- Mudança de senha por usuário logado (settings de perfil)

## Notas Técnicas

**Toggle de senha — implementação:**

O formulário de login atual usa `useActionState` (Server Action). O toggle de senha é estado
puramente client-side. Opções:
1. Manter o `<form action={formAction}>` existente e adicionar `useState` para o toggle — requer
   que o componente continue sendo `"use client"` (já é).
2. Criar um `PasswordInput` client component separado, usado dentro do form.

**Preferir opção 1** (inline no page.tsx) para manter a simplicidade da tela de login — é um
estado simples, não justifica componente separado.

**Fluxo de recuperação — estado local vs rota nova:**

A view de "solicitar reset" deve ser estado local no `LoginPage` (não uma rota separada) para
evitar criação de URL desnecessária e manter a UX fluida. Usar `useState` para alternar entre
`"login"` e `"recovery"` views dentro do mesmo componente.

**`/reset-senha` route:**

Esta página é acessada via link de email com sessão temporária de recovery. O Supabase define
a sessão automaticamente ao processar o token via `/auth/callback`. Portanto, `createClient()`
server-side já terá a sessão disponível ao fazer `updateUser`.

**Ícone de olho:**

Usar `lucide-react` (já é dependência do projeto). Ícones: `Eye` e `EyeOff`.

**`redirectTo` para reset:**

O valor deve ser a URL completa. Em dev: `http://localhost:3000/auth/callback?next=/reset-senha`.
Em produção: `https://trifold-crm.vercel.app/auth/callback?next=/reset-senha`.
Usar `process.env.NEXT_PUBLIC_APP_URL` ou construir a partir do `origin` do request.

## Arquivos

### Modificados
- `packages/web/src/app/login/page.tsx`
- `packages/web/src/app/login/actions.ts`
- `packages/web/src/lib/supabase/middleware.ts` — adicionar `/auth/callback` e `/reset-senha` em `isPublicRoute`

### Criados
- `packages/web/src/app/reset-senha/page.tsx`
- `packages/web/src/app/reset-senha/actions.ts`
- `packages/web/src/app/auth/callback/route.ts` (se não existir)

## Tasks de Desenvolvimento

- [x] 1. Verificar se `/auth/callback/route.ts` existe e se processa `type=recovery`
- [x] 2. Criar/ajustar `/auth/callback/route.ts` com `verifyOtp({ token_hash, type: 'recovery' })` → redirect `next`
- [x] 2b. Adicionar `/auth/callback` e `/reset-senha` como rotas públicas em `src/lib/supabase/middleware.ts`
- [x] 3. Adicionar Server Action `requestPasswordReset()` em `login/actions.ts`
- [x] 4. Adicionar toggle de visibilidade de senha no `login/page.tsx` (ícone Eye/EyeOff)
- [x] 5. Adicionar view de recuperação inline no `login/page.tsx` (estado local)
- [x] 6. Criar `reset-senha/page.tsx` com formulário de nova senha + toggles de visibilidade
- [x] 7. Criar `reset-senha/actions.ts` com `resetPassword()` Server Action
- [x] 8. Verificar banner `?reset=success` na tela de login
- [x] 9. Testar fluxo completo end-to-end (login normal + reset + toggle)

## Riscos

- **R1 (BAIXO):** Template de email Supabase pode estar em inglês por padrão. Mitigação: verificar
  no dashboard Supabase e ajustar se necessário (fora do escopo desta story, mas observar).
- **R2 (BAIXO):** `NEXT_PUBLIC_APP_URL` pode não estar definida em staging. Mitigação: usar fallback
  com `headers().get('origin')` para construir a URL de redirect dinamicamente.

## Critério de Conclusão (DoD)

- [ ] Todos os ACs verificados manualmente
- [ ] Fluxo de login padrão não regredido (AC10)
- [ ] `npm run typecheck` passa sem erros
- [ ] `npm run lint` passa sem warnings
- [ ] Story status atualizado para Done pelo @devops após push

## QA Results

**Gate Decision:** PASS
**Revisado por:** @qa (Quinn) — 2026-05-11

| Check | Status |
|-------|--------|
| Code Review | ✅ PASS |
| Testes (typecheck + lint) | ✅ PASS |
| Acceptance Criteria (10/10) | ✅ PASS |
| Sem Regressões | ✅ PASS |
| Performance | ✅ PASS |
| Segurança | ✅ PASS |
| Documentação | ✅ PASS |

**Observação LOW:** `auth/callback/route.ts` — validar `next.startsWith('/')` como boa prática defensiva. Não bloqueia.

---

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-11 | @sm (River) | Story criada — Draft |
| 2026-05-11 | @po (Pax) | Validação GO (9/10) — P1 middleware corrigido, P2 verifyOtp corrigido — status → Ready |
| 2026-05-11 | @dev (Dex) | Implementação concluída — 8 arquivos, commit a9af578 — status → InReview |
| 2026-05-11 | @qa (Quinn) | Gate PASS — 7/7 checks, 10/10 ACs, 1 observação LOW — pronto para push |
