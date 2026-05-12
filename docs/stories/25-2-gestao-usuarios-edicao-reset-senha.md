# Story 25.2 — Gestão de Usuários: Edição de Cadastro e Redefinição de Senha

## Status: Ready for Review

## Story

**Como** administrador do Trifold CRM,
**Quero** poder editar o nome e email de usuários existentes e redefinir suas senhas diretamente na tabela de usuários,
**Para que** eu não precise desativar e recriar uma conta quando um usuário precisa atualizar seus dados ou perde o acesso.

## Contexto

A tela `/dashboard/configuracoes/usuarios` hoje lista usuários com ações de mudar role e ativar/desativar. Não há como editar nome/email nem redefinir senha de um usuário existente. O admin precisa dessas ações sem precisar acessar o painel do Supabase manualmente.

A API `PATCH /api/users/[id]/route.ts` já existe mas suporta apenas `role` e `is_active`. Precisamos expandi-la para suportar `name`, `email` e `reset_password`.

Para redefinição de senha, o admin define uma nova senha diretamente (sem envio de email de reset — o fluxo de reset por email já existe via Story 23.1 para o próprio usuário). Este é um reset administrativo imediato.

## Acceptance Criteria

### Edição de Cadastro (Nome e Email)
- [ ] AC1: Cada linha da tabela de usuários tem um botão/ícone "Editar" (lápis) visível apenas para `admin`
- [ ] AC2: Ao clicar em "Editar", abre um modal (ou drawer) com campos pré-preenchidos: Nome e Email
- [ ] AC3: O modal tem botão "Salvar" que chama `PATCH /api/users/[id]` com `{ name, email }`
- [ ] AC4: Após salvar com sucesso, a tabela atualiza sem recarregar a página (estado local ou `router.refresh()`)
- [ ] AC5: Validação no modal: nome não pode ficar em branco; email deve ter formato válido
- [ ] AC6: Erros da API são exibidos dentro do modal (ex.: email já cadastrado)
- [ ] AC7: O admin NÃO pode editar a própria conta por esta interface (mesmo comportamento atual de "Desativar")
- [ ] AC8: `PATCH /api/users/[id]` aceita `name` e `email` como campos opcionais de atualização
- [ ] AC9: Atualização de `email` no Supabase Auth (via `adminSupabase.auth.admin.updateUserById`) é feita em conjunto com a atualização em `public.users`

### Redefinição de Senha (Admin Reset)
- [ ] AC10: No mesmo modal de edição (ou em botão separado na tabela), há um botão "Redefinir Senha"
- [ ] AC11: Ao clicar em "Redefinir Senha", abre um mini-formulário (dentro do modal ou em step) com campo "Nova Senha" (mínimo 8 caracteres) e "Confirmar Senha"
- [ ] AC12: Ao confirmar, chama `PATCH /api/users/[id]` com `{ new_password: "..." }`
- [ ] AC13: A API usa `adminSupabase.auth.admin.updateUserById(authId, { password: newPassword })` para redefinir a senha sem precisar da senha atual
- [ ] AC14: Mensagem de confirmação visível após reset bem-sucedido: "Senha redefinida com sucesso"
- [ ] AC15: O admin NÃO pode redefinir a própria senha por esta interface (usar `/reset-senha` ou configurações de perfil)
- [ ] AC16: `PATCH /api/users/[id]` requer `auth_id` do usuário para chamar o Supabase Admin — o endpoint deve buscá-lo se não estiver disponível diretamente

### Segurança
- [ ] AC17: Apenas `admin` pode acessar o endpoint `PATCH /api/users/[id]` (já coberto pelo `requireRole` existente)
- [ ] AC18: Validação de `org_id`: o usuário sendo editado deve pertencer à mesma organização do admin
- [ ] AC19: `new_password` mínimo 8 caracteres validado no servidor

## Escopo

**IN:**
- Modal de edição de nome e email
- Botão de redefinição de senha no modal ou na tabela
- Expansão de `PATCH /api/users/[id]` para name, email e password
- Atualização de email no Supabase Auth (via admin client)
- Atualização de senha no Supabase Auth (via admin client)

**OUT:**
- Envio de email de notificação ao usuário (o admin comunica por fora)
- Edição de avatar/foto
- Histórico de alterações de cadastro

## Dev Notes

- Modal pode ser um componente simples em `src/components/admin/user-edit-modal.tsx` — usar `useState` para controlar visibilidade e os valores do formulário
- `RoleDropdown` e `ToggleActiveButton` já são componentes client-side em `src/components/admin/role-dropdown.tsx` — o novo `UserEditModal` pode seguir o mesmo padrão (Server Component na page renderiza client component)
- A página `usuarios/page.tsx` é um Server Component — os novos botões de edição e reset devem ser componentes `"use client"` separados, passando `userId`, `userName`, `userEmail` e `userAuthId` como props
- Para buscar o `auth_id` na API: a tabela `public.users` tem a coluna `auth_id` — o endpoint pode fazer SELECT para buscá-lo, ou a page pode passá-lo via props já que faz SELECT de users
- Atualizar o SELECT na page para incluir `auth_id` se necessário
- `PATCH /api/users/[id]` — lógica de updates:
  ```typescript
  if (body.name) updates.name = body.name.trim()
  if (body.email) updates.email = body.email.trim()
  // Supabase public.users atualizado via supabase (RLS com service role se necessário)
  // Supabase Auth atualizado via adminSupabase.auth.admin.updateUserById(authId, {...})
  ```
- Para `new_password`: NÃO salvar em `public.users` — apenas `adminSupabase.auth.admin.updateUserById(authId, { password: newPassword })`
- Ordem de operações: atualizar Auth primeiro, depois `public.users` (Auth é a fonte de verdade para credenciais)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| `auth_id` não retornado pelo SELECT atual em `usuarios/page.tsx` | Alta | Adicionar `auth_id` ao SELECT na page |
| Email duplicado no Supabase Auth causa erro obscuro | Média | Tratar erro da API Auth e retornar mensagem clara: "Email já cadastrado" |
| Modal abre e fecha sem feedback de erro visível | Baixa | Estado de erro dentro do modal com mensagem em vermelho |
| Admin reseta senha da própria conta pelo modal | Baixa | Checar `u.id !== user.id` — mesma lógica do botão Desativar |

## Tasks

- [x] 1. Atualizar SELECT em `usuarios/page.tsx` para incluir `auth_id`
- [x] 2. Criar `UserEditModal` client component em `src/components/admin/user-edit-modal.tsx`
- [x] 3. Adicionar botão "Editar" na tabela (coluna Ações) que abre o modal
- [x] 4. Expandir `PATCH /api/users/[id]/route.ts` para aceitar `name`, `email`, `new_password`
- [x] 5. Implementar atualização de Auth email via `adminSupabase.auth.admin.updateUserById`
- [x] 6. Implementar reset de senha via `adminSupabase.auth.admin.updateUserById`
- [x] 7. Validação server-side: `new_password` >= 8 chars, email formato válido
- [x] 8. Teste: lint/typecheck passaram — sem erros nos novos arquivos

## Estimativa: 3h

## Dependências

- Pode iniciar em paralelo com Story 25.1 — sem dependências entre elas

## File List

- `packages/web/src/app/dashboard/configuracoes/usuarios/page.tsx`
- `packages/web/src/app/api/users/[id]/route.ts`
- `packages/web/src/components/admin/user-edit-modal.tsx` (novo)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- `UserEditModal` não expõe `auth_id` ao cliente — a rota busca `auth_id` server-side (mais seguro)
- Ordem de operação: public.users atualizado primeiro; depois Auth via admin client
- Validação de email: regex simples no client (UX) + regex no server (segurança)
- Guard `isOwnAccount` implementado tanto no modal (renderiza null) quanto via lógica existente na page

### Change Log
- 2026-05-12: Implementação completa por @dev — todos os tasks [x]
