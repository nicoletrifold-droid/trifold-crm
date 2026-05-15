---
name: Epic 30 — Analytics RPC pattern (validated)
description: Pattern de RPC JSONB com 6 CTEs validado em Story 30.1 — referência para futuras stories que consolidam multi-query analytics em 1 RTT
type: project
---

# Epic 30 Story 30.1 — Analytics RPC Pattern

**Status:** PASS (Architect gate 2026-05-14)

## Pattern validado

RPC mestre `get_analytics_summary(p_org_id uuid, p_since timestamptz)` retorna `jsonb` com 6 CTEs isoladas (funnel, by_property, by_broker, source_agg, lost_agg, totals).

**Why:** Eliminou ~9.500 UUIDs trafegados por hit em `/dashboard/analytics`. Payload 190KB → <5KB. EXPLAIN 3.803ms (13x abaixo do alvo 50ms).

**How to apply (futuras stories de consolidação multi-query):**

1. **Multi-tenancy ANTI-IDOR:** filtro `org_id = p_org_id` em TODAS as CTEs (não confiar só em RLS — defense in depth). `p_org_id` SEMPRE vem de auth server-side, nunca user input.
2. **SECURITY INVOKER + LANGUAGE sql STABLE** (não DEFINER, não VOLATILE).
3. **COALESCE defensivo:** `(SELECT jsonb_agg(...) FROM cte), '[]'::jsonb` e `(SELECT jsonb_object_agg(...)), '{}'::jsonb` — shape estável mesmo com 0 rows.
4. **Cast enums para text:** `source::text` em `GROUP BY` e `jsonb_object_agg` (Postgres não aceita enum em jsonb).
5. **Spike obrigatório antes de escrever RPC:** validar nomes de FKs reais (Story usava `assigned_to`; schema tem `assigned_broker_id`).
6. **Helper client-side `toCount()`:** bigints chegam como string em jsonb — cast safe com `Number.isFinite` check.
7. **Mapping preserva contrato HTTP:** se `/api/X` historicamente droppa campos (ex: `stage_id`), manter dropp no mapping para backward compat.

## AUTO-DECISIONS pós-RPC defensáveis

- **Não criar RPC nova** se over-fetch estrutural (arrays de UUIDs) já foi eliminado por select escalar + filtro precoce. Classificação JS pós-filtro é aceitável.
- **Não consumir campo da RPC mestre** se sub-rota tem filtros adicionais (ex: `from`/`to` arbitrários) que a RPC não cobre — separação intencional.

## Trade-offs documentados

- `lost_agg` sem filtro de período (semântica cumulativa) — alinhar com PM caso versão futura precise recorte por período.
- Type aliases duplicados entre Server Component e API route — refactor opcional, baixa prioridade.
