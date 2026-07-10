# Story — Botão Excluir em Tipos de Brinde e Datas Comemorativas

## Metadata
- **Status:** Done
- **Epic:** Brindes
- **Branch:** story-brindes-excluir-tipos-datas

## Context
Pedido (Marcos, 2026-07-10): habilitar botão **Excluir** no módulo Brindes — no modal de **Tipos de Brinde** e no outro local que usa a mesma ideia-fonte (modal de **Datas Comemorativas**). Hoje ambos só têm "Desativar/Ativar". Como Brindes não é crítico, exclusão liberada para **qualquer perfil com acesso ao módulo** (`canAccess("brindes")`).

Achados na investigação:
- **Tipos:** o endpoint `DELETE /api/brindes/tipos/[id]` **já existia** (gateado `canAccess("brindes")`, com guarda 409 se o tipo estiver em uso em entregas). Faltava só o botão na UI.
- **Datas:** `datas/[id]` só tinha PATCH — precisou criar o DELETE. FK `brindes_entregas.data_comemorativa_id → datas_comemorativas` exige a mesma guarda de "em uso".
- **Destinatários:** já tinham excluir (ícone lixeira na tabela) — fora de escopo.

## Acceptance Criteria
- [x] AC1: modal Tipos de Brinde tem botão Excluir (lixeira) por item, com confirmação; chama `DELETE /api/brindes/tipos/[id]`.
- [x] AC2: modal Datas Comemorativas tem botão Excluir por item, com confirmação; chama `DELETE /api/brindes/datas/[id]` (novo).
- [x] AC3: exclusão liberada para qualquer perfil com `canAccess("brindes")` (mesma regra das demais escritas do módulo).
- [x] AC4: guarda de integridade: item em uso por entregas → 409 com mensagem "Desative ao invés de deletar", exibida na UI (não quebra).
- [x] AC5: sucesso remove o item da lista + `router.refresh()`; erros de rede/HTTP mostrados sem quebrar o modal.

## Out of Scope
- Destinatários (já têm exclusão). Soft-delete/histórico de auditoria de exclusões.

## Complexity
- **T-shirt:** S (1 endpoint novo + 2 botões de UI; reusa DELETE de tipos existente).

## Business Value
Gestão de Brindes fica completa — dá para remover tipos/datas criados por engano sem depender de admin/DB. Baixo risco (módulo não crítico), com guarda de integridade referencial.

## Risks
- Baixo. Hard delete, mas bloqueado por 409 quando há entregas vinculadas; escopo por org (`eq org_id`); gate por `canAccess("brindes")`.

## File List
- `docs/stories/brindes-excluir-tipos-datas.story.md` (this file)
- `packages/web/src/app/api/brindes/datas/[id]/route.ts` (novo handler DELETE)
- `packages/web/src/app/dashboard/brindes/_components/tipos-modal.tsx` (botão Excluir + erro)
- `packages/web/src/app/dashboard/brindes/_components/datas-modal.tsx` (botão Excluir + erro)

## QA Results (@qa / Quinn)
- **Gate: PASS.** `tsc` 0 erros, ESLint limpo nos arquivos tocados, suíte 876/876 (sem regressão). DELETE de tipos já validado em prod (existente); DELETE de datas espelha o mesmo padrão com guarda 409 (FK confirmada no banco). Gate por `canAccess("brindes")` em ambos.
- **Validação manual sugerida:** excluir um tipo/data não usados → some da lista; tentar excluir um em uso → mensagem de 409 aparece.
