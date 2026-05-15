---
name: Partial indexes em queues — Story 29.5
description: Planner usa partials em queues mesmo com volume baixo quando partial elimina Sort (vs full em outra coluna)
type: reference
---

Story 29.5 aplicou 4 partial indexes em queues (`email_sends_queue`, `follow_up_log`, `webhook_logs`) em 2026-05-14.

**Insight contraintuitivo:** Apesar do esperado (Postgres prefere Seq Scan com volume baixo), o planner JÁ escolheu todos os 4 partials desde a criação. Razão: em `follow_up_log`, o full index existente era `idx_followup_log_status (btree status)` — a query precisava `ORDER BY scheduled_at`, forçando Sort externo. O novo partial `(scheduled_at) WHERE status='pending'` já está ordenado por `scheduled_at`, eliminando o Sort.

**Resultado:** 6.889ms → 0.770ms = **9x ganho** apenas em `follow_up_log` (16 rows pending). Os outros 3 também trocaram para os partials.

**Regra geral aplicável a outras queues no projeto:**
- Quando criar partial `(col_ordenacao) WHERE col_filtro = 'valor_predominante'`, verificar se há full index em `col_filtro` que força Sort externo no ORDER BY.
- Se sim: o partial sempre será escolhido (Index Scan ordenado > Index Scan + Sort).
- Ganho não depende de volume — depende da topologia dos índices existentes.

**Padrão Management API replicado:** single-statement por POST, 4 statements ~8s wall-clock total. `text[]` no INSERT de tracking via dollar-quoted strings ($MIG1$..$MIG4$).

**Migration ghost:** `supabase/migrations/034_partial_indexes_queues_remote_only.sql`. Tracking version `034` com `name='partial_indexes_queues_remote_only'`.

**How to apply:** Em futuras stories de partial index (29.7? Epic 33?), priorizar queries que tenham ORDER BY em coluna diferente da filtrada — ganho garantido independente de volume.
