# Epic 23 — Auth UX: Redefinição de Senha e Melhorias de Usabilidade

## Objetivo

Melhorar a experiência de autenticação para todos os perfis de usuário (admin, broker, cliente),
adicionando funcionalidades essenciais que atualmente estão ausentes: recuperação de senha via email
e visibilidade da senha digitada.

## Contexto

A tela de login (`/login`) é o ponto de entrada de todos os usuários do CRM — admins, corretores e
clientes do portal. Atualmente o formulário não possui:
- Link "Esqueceu a senha?" → usuários bloqueados precisam de intervenção manual
- Toggle de visualização da senha → erros de digitação difíceis de diagnosticar

O Supabase já possui suporte nativo a `resetPasswordForEmail` e `updateUser` para reset via token.
A infra de email está operacional (Resend, configurado no Epic 18).

## Stories

| Story | Título | Status |
|-------|--------|--------|
| 23.1 | Redefinição de senha + toggle de visualização | Draft |

## Dependências

- Epic 1 (auth e roles) — setup de auth Supabase
- Epic 18 (email infra) — Resend configurado e operacional
