# Story 52-1 — Bug: Imagem do Ticket Invisível

## Metadata
- **Status:** Done
- **Priority:** P0 — bloqueante para uso do suporte
- **Complexity:** XS (~5min)
- **Created:** 2026-06-09
- **Author:** @sm (River) / @po (Pax) — GO

## Root Cause
Migration 065 criou o bucket `chamados-attachments` com `public: false`.
`getPublicUrl()` gera URL no endpoint público (`/object/public/...`), mas
esse endpoint retorna 403 para buckets privados — imagem quebrada no card.

## Fix
Migration 087: `UPDATE storage.buckets SET public = true WHERE id = 'chamados-attachments'`
Sem mudança de código.

## Tasks
- [x] T1: Migration 087_chamados_bucket_public.sql
- [x] T2: Aplicar via Supabase MCP
