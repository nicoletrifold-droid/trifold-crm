# Story 75-119 — Fix: rótulo "Corretor" em mensagens de humano (gerente/admin)

## Metadata
- **Status:** Done · **Epic:** 76 (Relacionamento) / Conversas · **Branch:** fix/75-119-label-corretor-conversas · **Complexidade:** XS (1 ponto) · **Tipo:** bug fix (cosmético)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint]

## Story
**As a** gestor/relacionamento no dashboard, **I want** que a mensagem enviada por quem não é corretor (gerente de relacionamento, admin) não apareça como "CORRETOR · Nome", **so that** o rótulo reflita quem realmente respondeu.

## Contexto (causa-raiz)
A tabela `messages` grava `role` com apenas `user`/`assistant`/`broker`/`system`. **Todo humano** que responde pelo CRM é gravado como `role="broker"` — não há valor separado para gerente-relacionamento ou admin. As telas montavam o rótulo como `Corretor · <primeiro nome>`, então Samara (Gerente de Relacionamento) e Marcos (Admin) apareciam como "CORRETOR · SAMARA" / "CORRETOR · MARCOS". O nome já era correto (resolvido via `metadata.sent_by` → `users.name`); só o prefixo "Corretor" estava chumbado. Roteamento/dados OK — bug puramente de exibição.

## Escopo
**IN:** trocar o rótulo de `msg.role === "broker"` de `Corretor · Nome` para **só o nome** (fallback "Equipe" quando `sent_by` não resolve), em:
- `dashboard/conversas/[id]/page.tsx`
- `dashboard/leads/[id]/page.tsx` (aba Conversa)

**OUT:**
- `dashboard/chat/[id]/page.tsx` (módulo Chat da Samara) usa label "Você" (perspectiva do próprio remetente) — decisão de UX diferente, fora de escopo.
- `broker/leads/[id]` (app do corretor) — lá o remetente é corretor de fato.
- Não altera schema de `messages` nem a gravação.

## Acceptance Criteria
1. **Given** uma mensagem enviada pela Samara (gerente-relacionamento) na tela de Conversas, **then** o rótulo mostra "Samara" (não "Corretor · Samara").
2. **Given** uma mensagem enviada por um admin, **then** mostra o nome do admin, sem "Corretor".
3. **Given** uma mensagem `role="broker"` sem `sent_by` resolvível, **then** mostra "Equipe".
4. **Given** mensagem de corretor de verdade, **then** mostra o nome dele (comportamento consistente, sem prefixo de cargo).
5. typecheck/lint limpos.

## Dev Notes
- Rótulo antigo: `` `Corretor${name ? " · " + name : ""}` `` → novo: `brokerNames[sent_by] ?? "Equipe"`.
- `brokerNames` (mapa sent_by → primeiro nome) já era resolvido em ambas as telas.
- Decisão de produto (usuário): "só o nome". Ver [[project-nicole-relacionamento]] (Samara = gerente-relacionamento) e [[project-transferir-conversa]].
