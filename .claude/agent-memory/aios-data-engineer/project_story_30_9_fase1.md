---
name: Story 30.9 FASE 1 entregue (admin mensagens RPC)
description: 2026-05-14 — mig 039 aplicada via Management API; RPC get_admin_mensagens_paginated com GROUP BY + DISTINCT ON + LIMIT/OFFSET substitui agregação JS + .slice() em /api/admin/mensagens; FASE 2 (refator route.ts) pendente para @dev
type: project
---

Story 30.9 FASE 1 — concluída em 2026-05-14.

**Why:** `/api/admin/mensagens/route.ts` carregava TODAS as `obra_mensagens` da org em memória, agregava em Map JS, e só então `.slice()` — paginação que não pagina. Com Portal Cliente (Epic 20) gerando volume crescente, o hub admin ia travar.

**O que foi entregue:**
- `supabase/migrations/039_admin_mensagens_rpc_remote_only.sql` (novo arquivo, sufixo `_remote_only`)
- RPC `public.get_admin_mensagens_paginated(uuid, int, int, text, boolean, timestamptz, timestamptz)` aplicada via Management API (HTTP 201 x2)
- Tracking inserido em `supabase_migrations.schema_migrations` (version 039, name `admin_mensagens_rpc_remote_only`)
- 4 testes funcionais OK (basic, search, unread_only, cross-org isolation)
- EXPLAIN ANALYZE inline: Execution Time 0.446ms, HashAggregate + DISTINCT ON, Buffers shared hit=11
- Build `pnpm --filter @trifold/web` PASS

**Estratégia técnica:**
- LANGUAGE sql STABLE SECURITY INVOKER (não plpgsql) — permite inlining quando útil
- CTE `filtered_msgs` reusada por `aggregated` (GROUP BY) e `last_msg` (DISTINCT ON) — evita scan duplo
- `COUNT(*) OVER ()` para `total_count` na mesma query (sem segunda chamada)
- 7 parâmetros conforme story (não 5 do prompt) — `p_from_date`, `p_to_date` incluídos

**How to apply:** Quando @dev for executar FASE 2, ele DEVE preservar o tipo exportado `ClienteConversa` em route.ts (consumido por `inbox-sidebar.tsx` e `mensagens-inbox.tsx`). Mapeamento RPC->ClienteConversa está documentado nas linhas 209-229 da story file.
