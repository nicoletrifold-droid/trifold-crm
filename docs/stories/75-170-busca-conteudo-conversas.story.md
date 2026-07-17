# Story 75-170 — Conversas: busca no CONTEÚDO das mensagens (estilo WhatsApp)

## Metadata
- **Status:** Done
- **Epic:** — (story avulsa, pedido direto do diretor 2026-07-17)
- **Branch:** feat/75-170-busca-conteudo-conversas

## Context
A busca de /dashboard/conversas só cobria nome/telefone do lead (75-168). O diretor quer o
comportamento do WhatsApp: digitar "seguro de obra" e a lista afunilar para as conversas em
que isso foi DITO, sem abrir uma a uma. Volume atual: 1.771 mensagens (~1MB) — FTS Postgres
resolve com folga e escala.

## Acceptance Criteria
- [x] AC1: Migration 177 (numeração checada; DEV precisou da 174 antes — aplicada): índice GIN
  `to_tsvector('portuguese', f_unaccent(content))` + RPC `search_conversation_messages`
  (security INVOKER — RLS de messages vale por perfil), devolvendo conversa + trecho da última
  mensagem que casou + contagem. `websearch_to_tsquery` (multi-palavra, stopwords fora).
- [x] AC2: Página Conversas: termo casa lead (75-168) OU conteúdo (novo) — lista afunila.
- [x] AC3: Card da conversa achada por conteúdo mostra o TRECHO da mensagem que casou
  ("💬 …" + "(+N)" quando há mais matches) no lugar do preview padrão — estilo WhatsApp.
- [x] AC4: Placeholder da busca comunica o novo alcance (prop opcional no LeadSearch —
  demais telas mantêm o texto padrão).
- [x] AC5: Smoke test REAL em prod: "sacada churrasqueira" → 4 conversas com trecho correto.
- [x] AC6: type-check/lint/suíte verdes (1061/1061).

## Out of Scope
- Mesma busca em /broker/chat (corretor) — follow-up se o diretor quiser (RPC já respeita a
  RLS do corretor: só acharia as conversas dele).
- Highlight visual do termo dentro do trecho.
- Transcrições de áudio JÁ entram (viram texto em messages.content — Story de áudio inbound).

## Dev Notes
- FTS português casa RADICAL da palavra ("seguro" acha "seguros"); prefixo parcial ("segur")
  não casa — comportamento padrão de FTS, aceito.
- DEV estava sem a mig 174 (f_unaccent) — aplicada lá antes da 177 (catch-up parcial do drift).

## Change Log
- @sm/@po: fluxo mínimo (pedido direto, escopo claro).
- @dev (Dex): mig 177 dev+prod + RPC + integração na página + placeholder. Smoke real em prod.
- @qa (Quinn): PASS — invoker preserva RLS por perfil; fallback: termo sem match não quebra
  a busca por lead; suíte 1061/1061.
- @devops (Gage): CI verde, squash-merge PR #229, deploy prod automático. Status InReview → Done.
