# Story 75-18 — gerente-comercial consegue salvar edição de corretor (telefone + ativar/desativar)

## Metadata
- **Status:** Done
- **Epic:** 75 (ajustes operacionais)
- **Branch:** main (mudança incremental, padrão do repo)
- **Complexidade:** S (1 ponto) — migration de RLS de uma policy

## Executor Assignment
- **executor:** @dev
- **quality_gate:** @qa
- **quality_gate_tools:** [sql-review, rls-scope]

## Story

**As a** gerente comercial (Fernanda, role `gerente-comercial`),
**I want** salvar as edições de corretor que ficam na tabela `users` (telefone/WhatsApp e ativar/desativar),
**so that** eu consiga gerenciar os corretores por completo sem precisar de um admin.

## Contexto

Pedido do usuário (conversa 2026-06-23). Ao editar um corretor em
`/dashboard/configuracoes/corretores/[id]`, a tela mostra "Salvo com sucesso!"
mas o telefone/WhatsApp **não** persiste e ativar/desativar **não** funciona.

**Causa raiz:** incoerência entre API e banco.
- A API (`/api/users/[id]` PATCH e `/api/brokers/[id]` PATCH) autoriza
  `['admin','gerente-comercial']` via `requireRole`.
- O RLS da tabela `brokers` foi ampliado para `gerente-comercial` na migration
  074 (`brokers_manage`), mas o RLS da tabela `users` (`users_update_admin`,
  migrations 004/062) continuou **admin-only**.
- Um `UPDATE` bloqueado por RLS afeta **0 linhas sem erro**; o backend não
  reclama e o frontend (`handleSave`) só checa a resposta do PATCH de `brokers`.
  Resultado: falha silenciosa nos campos da tabela `users`.

O que **já funciona** para gerente-comercial (sem mudança): criar corretor
(usa admin client, ignora RLS) e vincular empreendimentos (`broker_assignments`
usa `is_admin_or_supervisor()`, que inclui gerente-comercial desde a 084).

## Escopo

**IN:**
- Migration `108_users_update_gerente_comercial.sql`: recria a policy de UPDATE
  da tabela `users` permitindo `gerente-comercial`, **escopado a usuários que são
  corretores** (existe linha em `brokers` com `user_id = users.id`). Admin
  permanece com UPDATE irrestrito na org.

**OUT:**
- INSERT/SELECT em `users` (criar corretor já passa pelo admin client).
- Permitir gerente-comercial editar usuários que NÃO são corretores
  (admins, obras, supervisor) — fica fora por menor privilégio.
- Mudança de UI/API (já autorizam gerente-comercial; o gargalo era só o RLS).

## Decisão de menor privilégio
A policy limita gerente-comercial a linhas de `users` que tenham um registro de
corretor correspondente. Assim ela não edita admins/staff. Admin mantém escopo
total. (Risco residual aceito: via chamada de API crafted ela poderia alterar o
campo `role` de um corretor — a UI não expõe isso; tratado como fora de escopo.)

## Acceptance Criteria
1. gerente-comercial salva telefone/WhatsApp de um corretor e o valor persiste.
2. gerente-comercial ativa/desativa um corretor e `users.is_active` muda.
3. gerente-comercial **não** consegue dar UPDATE em um usuário que não é corretor
   (ex.: outro admin) — RLS bloqueia (0 linhas).
4. admin mantém UPDATE em qualquer usuário da própria org.
5. Isolamento por org preservado (`org_id = public.user_org_id()`).

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.18-...yml`, quality_score 95)
- **sql-review:** subquery correlacionada no padrão `broker_assign_select`; `brokers_select` permite o SELECT na mesma org; sem `WITH CHECK` (paridade com a policy original).
- **rls-scope:** gerente-comercial limitada a `users` que são corretores; admin irrestrito; isolamento por org preservado.
- **Pendência:** aplicar migration 108 em produção (passo @devops).

## File List
- `supabase/migrations/108_users_update_gerente_comercial.sql` (novo)
