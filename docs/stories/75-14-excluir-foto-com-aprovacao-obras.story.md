# Story 75-14 — Exclusão de foto pelo perfil obras com aprovação do supervisor

## Metadata
- **Status:** Done
- **Epic:** 58 — Obras/Aprovações
- **Branch:** main

## Context
Hoje só admin/supervisor veem o botão de excluir foto (exclusão direta). O perfil **obras** precisa poder excluir, mas com **aprovação**: ao clicar em excluir, descreve o **motivo** → vira um pedido na fila de aprovação → o **supervisor aprova** (foto é removida) ou rejeita (foto fica). Admin/supervisor continuam excluindo direto.

Decisão: **reusar** `obra_upload_aprovacoes` com novo `tipo` `exclusao_foto` (migration 106), reaproveitando a aba Aprovações e o fluxo aprovar/rejeitar.

## Acceptance Criteria
- [x] AC1: Migration 106 libera `tipo='exclusao_foto'` no CHECK de `obra_upload_aprovacoes`.
- [x] AC2: `POST /api/admin/obras/[obra_id]/fotos/[foto_id]/solicitar-exclusao` (role obras): exige `motivo`, valida foto na obra/org, evita pedido duplicado pendente, cria registro (tipo exclusao_foto, storage_path da foto, storage_bucket obra-fotos, metadata {foto_id, caption, motivo}).
- [x] AC3: UI grade de fotos: obras vê botão de excluir (lixeira) → modal de motivo → POST. Admin/supervisor mantêm exclusão direta (FotoDeleteButton).
- [x] AC4: Aba Aprovações exibe pedidos `exclusao_foto` (preview da foto, selo "Pedido de exclusão", motivo, aprovar/rejeitar).
- [x] AC5: Aprovar exclusao_foto → apaga `obra_fotos` (metadata.foto_id) + arquivo do storage. Rejeitar → foto permanece intocada (handler NÃO remove storage na rejeição). notifyClientes/e-mail de "upload" não disparam para exclusao_foto.

## Out of Scope
- Exibir o próprio pedido pendente na lista "Aguardando aprovação" do obras (a aba Aprovações do supervisor já mostra).

## Dependencies
- Migration 106 aplicada em prod (via SQL Editor, como 104/105).

## Complexity
- **T-shirt:** M/L (migration + endpoint + handler de aprovação + UI aba + UI grade).

## Risks
- **Médio/alto:** lógica de storage na rejeição (não pode apagar foto viva). Mitigado: rejeição não remove storage de tipo nenhum (ver 75-15); aprovar exclusao_foto remove só a foto-alvo. Verificar pós-deploy com os 2 fluxos.

## File List
- `supabase/migrations/106_aprovacoes_exclusao_foto.sql` (new)
- `packages/web/src/app/api/admin/obras/[obra_id]/fotos/[foto_id]/solicitar-exclusao/route.ts` (new)
- `packages/web/src/app/api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts` (handler exclusao_foto + reject sem storage)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/foto-exclusao-request-modal.tsx` (new)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/aprovacoes-tab.tsx` (render exclusao_foto)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` (botão obras + modal)
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` (tipo cast)

## QA Results (@qa / Quinn)
**Veredito: PASS** (estático) — fluxo modelado reusando a fila; rejeição não toca storage (foto viva preservada); aprovar exclui a foto-alvo. type-check/eslint OK. **Verificar pós-deploy:** obras pede exclusão → supervisor aprova (some) / rejeita (fica).

## Change Log
- @sm/@po/@dev/@qa: criada, validada, implementada, QA PASS. Pendente migration 106 + @devops push.
- @devops (Gage): migration 106 aplicada (75-14) + push em produção (commit 7ed20c0). Status → Done.