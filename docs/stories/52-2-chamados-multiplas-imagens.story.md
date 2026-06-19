# Story 52-2 — Chamados: Múltiplas Imagens por Ticket

## Metadata
- **Status:** Done
- **Priority:** P1
- **Complexity:** S (~1h)
- **Created:** 2026-06-09

## Tasks
- [x] T1: Migration 088 — adiciona `image_urls text[]` à tabela chamados
- [x] T2: API POST — aceita até 5 arquivos (campo `images[]`), popula `image_urls`
- [x] T3: Form — seleção múltipla com preview de thumbnails
- [x] T4: Card — exibe grid de até 3 thumbs
- [x] T5: Typecheck + lint clean

## QA Results

**Veredicto:** PASS
**Data:** 2026-06-19
**Revisor:** @qa (Quinn)

**Checks executados:**
- [x] Code review — upload com rollback, validação MIME/tamanho no servidor, UUID nos paths
- [x] Acceptance criteria — T1-T5 completos, migration 088 aplicada em produção
- [x] Regressões — `image_url` legado mantido (retrocompatível); `image_urls` aditivo
- [x] Segurança — auth via `requireAuth()`, org_id isolado, MIME whitelist server-side
- [x] Memory leaks — `URL.revokeObjectURL` chamado em removeImage e no submit
- [x] UX — drop zone oculta ao atingir limite; lightbox com navegação por setas e contador
- [x] Typecheck/lint — clean (T5 confirmado)

**Nota:** Código implementado e deployed em produção em 2026-06-09 (commit ec6ca4b). Quality gate executado retroativamente para fechar o ciclo administrativo da story.

## File List
- `packages/web/src/app/api/admin/chamados/route.ts` — modificado
- `packages/web/src/app/dashboard/chamados/_components/chamado-form.tsx` — modificado
- `packages/web/src/app/dashboard/chamados/_components/chamado-card.tsx` — modificado
- `supabase/migrations/087_chamados_bucket_public.sql` — criado
- `supabase/migrations/088_chamados_image_urls.sql` — criado

## Change Log
- 2026-06-09 | @dev | Implementação completa — commit ec6ca4b (Stories 52-1/2/3)
- 2026-06-19 | @qa (Quinn) | Quality Gate PASS — story marcada Done
