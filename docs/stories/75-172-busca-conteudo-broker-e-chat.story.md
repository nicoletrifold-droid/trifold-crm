# Story 75-172 — Busca no conteúdo: /broker/chat + /dashboard/chat (Relacionamento)

## Metadata
- **Status:** InReview
- **Epic:** — (extensão da 75-170, pedido direto do diretor 2026-07-17)
- **Branch:** feat/75-172-busca-conteudo-broker-chat

## Context
Extensão da 75-170 (Conversas do dashboard) para as outras duas telas de chat:
- **/broker/chat** (corretor): já TINHA o campo de busca (visível também no mobile —
  conferido a pedido do diretor) buscando só lead → agora busca conteúdo também.
  RPC security INVOKER: a RLS de messages limita o corretor às conversas DELE.
- **/dashboard/chat** (Relacionamento/Samara): NÃO TINHA campo de busca nenhum
  (achado do diretor: "senão não vai servir de nada") → campo adicionado + busca em
  nome do cliente/lead/telefone + conteúdo. RPC via ADMIN client (a RLS não libera a
  gerente-relacionamento — mesmo padrão do fetch da página); resultado usado SÓ para
  filtrar conversas já listadas (is_relationship + canAccess "chat").

## Acceptance Criteria
- [x] AC1: /broker/chat — termo casa lead OU conteúdo; card achado por conteúdo mostra
  trecho "💬 … (+N)"; placeholder atualizado. Campo visível no mobile (header esconde
  só o título; LeadSearch fica fora).
- [x] AC2: /dashboard/chat — campo de busca ADICIONADO (LeadSearch); casa nome do
  cliente/lead/telefone (leadMatchesSearch) OU conteúdo; trecho no preview; empty state
  com mensagem própria de busca.
- [x] AC3: Segurança: corretor só encontra conteúdo das conversas dele (RLS via invoker);
  relacionamento usa admin MAS cruza apenas com a lista já permissionada da página.
- [x] AC4: type-check/lint/suíte verdes (1069/1069).

## File List
- `docs/stories/75-172-busca-conteudo-broker-e-chat.story.md` (this file)
- `packages/web/src/app/broker/chat/page.tsx`
- `packages/web/src/app/dashboard/chat/page.tsx`

## Change Log
- @sm/@po: fluxo mínimo (espelha 75-170 já validada em prod).
- @dev (Dex): as 2 telas; achado no caminho: /dashboard/chat não tinha busca nenhuma.
- @qa (Quinn): PASS — escopos de segurança distintos por tela documentados e corretos.
