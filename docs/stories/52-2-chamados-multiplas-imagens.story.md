# Story 52-2 — Chamados: Múltiplas Imagens por Ticket

## Metadata
- **Status:** InProgress
- **Priority:** P1
- **Complexity:** S (~1h)
- **Created:** 2026-06-09

## Tasks
- [x] T1: Migration 088 — adiciona `image_urls text[]` à tabela chamados
- [x] T2: API POST — aceita até 5 arquivos (campo `images[]`), popula `image_urls`
- [x] T3: Form — seleção múltipla com preview de thumbnails
- [x] T4: Card — exibe grid de até 3 thumbs
- [x] T5: Typecheck + lint clean
