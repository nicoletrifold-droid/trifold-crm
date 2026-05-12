# Epic 25 — Gestão de Usuários e Controle de Acesso

## Objetivo

Ampliar o sistema de controle de acesso com um novo perfil restrito ao módulo de Obras, e melhorar o gerenciamento de usuários com edição de cadastro e redefinição de senha pelo admin.

## Contexto de Negócio

Hoje o CRM possui três perfis: `admin`, `supervisor` e `broker`. A equipe de acompanhamento de obras (ex.: engenheiros, mestres de obra) precisa de acesso ao módulo de Obras para gerenciar fases, fotos, documentos e clientes vinculados — sem ver leads, pipeline, imóveis, conversas ou qualquer outra área do CRM. Não existe um perfil adequado para eles.

Paralelamente, o admin não consegue editar o cadastro (nome/email) de um usuário existente nem redefinir a senha de quem perdeu o acesso — sendo forçado a desativar e recriar a conta.

## Stories

| Story | Título | Prioridade | Estimativa | Status |
|-------|--------|------------|------------|--------|
| 25.1 | Perfil "Obras": Acesso Restrito ao Módulo de Obras | P0 — Core | 4h | Draft |
| 25.2 | Gestão de Usuários: Edição de Cadastro e Redefinição de Senha | P0 — UX | 3h | Draft |

**Total estimado:** ~7h

## Critérios de Sucesso do Epic

- [ ] Usuário com role `obras` loga e vê apenas o item "Obras" na sidebar
- [ ] Usuário `obras` tem CRUD completo no módulo de Obras
- [ ] Usuário `obras` não consegue acessar nenhuma outra rota `/dashboard/*`
- [ ] Admin consegue editar nome e email de qualquer usuário
- [ ] Admin consegue redefinir a senha de qualquer usuário sem desativar a conta
- [ ] As opções de edição e reset de senha aparecem na tabela de usuários

## Dependências Técnicas

- `public.users.role` enum no Supabase precisa incluir `'obras'`
- `app_metadata.role` no Supabase Auth precisa suportar `'obras'`
- Middleware de rota deve rotear `obras` para `/dashboard/obras` após login
- API `/api/users` deve aceitar `obras` como role válido
