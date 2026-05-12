# Migrations — Convenção do projeto Trifold

Reconciliado em 2026-05-12 pela Story 29.1 (Epic 29 — Database Performance Blitz). Pré-requisito bloqueante para Stories 29.2-29.7.

## Convenção de Numeração

- **3 dígitos zero-padded sequenciais** (`031_*`, `032_*`, ...). Próxima disponível após reconciliação: `031`.
- **Sufixos descritivos curtos**: `031_fk_indexes_critical.sql`, NÃO `031_indexes.sql`.
- **Em caso de conflito de número** (PRs paralelas que pegam o mesmo prefixo): usar sufixo letra `a`, `b`, `c`. Ex: `031a_*`, `031b_*`. Já aceito no padrão pelo CLI Supabase (ordena por string completa).
- **NÃO usar 4 dígitos** (`0031_*`) — quebra ordenação alfabética com migrations existentes.

## Padrão de Aplicação

| Cenário | Procedimento |
|---------|--------------|
| Migration normal (transação OK) | Criar `NNN_nome.sql` → `supabase db push` → commit + PR |
| Mudança via Studio (excepcional) | Criar `NNN_nome.sql` ANTES → aplicar via Studio → commit + INSERT manual no tracking se necessário |
| `CREATE INDEX CONCURRENTLY` | Aplicar via Studio SQL Editor + criar `NNN_nome_remote_only.sql` (ghost) com SQL real e header de documentação |
| Recuperar SQL aplicado via Studio | Query: `SELECT array_to_string(statements, ';') FROM supabase_migrations.schema_migrations WHERE version='NNN'` |

### Regras invioláveis

1. **SEMPRE commitar migration ANTES de aplicar em remote** — gera rastreabilidade.
2. **NUNCA aplicar SQL via Studio sem migration local commitada** — gera drift que pode quebrar `supabase db push` futuro.
3. **NUNCA renomear migration já aplicada em remote** — CLI casa por `version` + `name`; rename quebra tracking.
4. **TODA migration que cria índice/coluna/extensão deve ter rollback SQL comentado no fim** do arquivo (`-- ROLLBACK PLAN: ...`).
5. **Migrations destrutivas (DROP TABLE/COLUMN)** exigem aprovação explícita do @architect via story.

## CREATE INDEX CONCURRENTLY (padrão Epic 29)

`supabase db push` envolve cada migration em transação (`BEGIN ... COMMIT`). `CREATE INDEX CONCURRENTLY` **não roda em transação** — daria erro `25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`.

**Solução**: aplicar via Studio SQL Editor (fora de transação) + criar ghost migration:

```sql
-- 031_fk_indexes_critical_remote_only.sql
-- Applied via Supabase Studio (CONCURRENTLY requires non-transactional context).
-- Tracking registrado manualmente em supabase_migrations.schema_migrations.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xxx ON tbl (col);

-- ROLLBACK PLAN:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_xxx;
```

Após aplicar:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('031', 'fk_indexes_critical', ARRAY['CREATE INDEX CONCURRENTLY ...'])
ON CONFLICT (version) DO NOTHING;
```

## Histórico de Drift (Story 29.1)

Reconciliação de tracking executada em 2026-05-12. Drift histórico documentado para referência:

| Local file | Remote version | Remote name | Notas |
|------------|---------------|-------------|-------|
| `021_phone_normalization_part1.sql` | `024` | `phone_normalization_part1` | Aplicado via Studio antes de commit local — CLI gravou no slot livre 024 |
| `021_phone_normalization_part2.sql` | `025` | `phone_normalization_part2` | Idem |
| `024_phone_normalization_part1_remote_only.sql` | `024` | (mesma row) | Stub local com SQL real (paridade com remote) |
| `025_phone_normalization_part2_remote_only.sql` | `025` | (mesma row) | Idem |
| `024b_mensagens_sender_display_name.sql` | `024b` | `mensagens_sender_display_name` | Story 24.1 — registrado manualmente em 29.1 |
| `028a_fix_v_mensagens_admin_grant.sql` | `028a` | `fix_v_mensagens_admin_grant` | Registrado manualmente em 29.1 |
| `028b_meta_campaign_actions.sql` | `028b` | `meta_campaign_actions` | Story 25.1 — registrado manualmente em 29.1 |
| `029a_cliente_id_obra_mensagens.sql` | `029a` | `cliente_id_obra_mensagens` | Story 24.4 — registrado manualmente em 29.1 |
| `029b_privacy_acceptance.sql` | `029b` | `privacy_acceptance` | Registrado manualmente em 29.1 |
| `030_role_obras.sql` | `030` | `role_obras` | Story 25.1 — `ALTER TYPE user_role ADD VALUE 'obras'` registrado manualmente em 29.1 |

## Validação de paridade

```bash
# CLI (se disponível)
supabase migration list --linked

# Management API (sem Docker)
TOKEN=$(python3 -c "import json; print(json.load(open('/Users/ogabrielhr/.supabase/access-token'))['access_token'])")
curl -s -X POST "https://api.supabase.com/v1/projects/dsopqkqjkmhytudaaolv/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"}'
```

Resultado esperado pós-29.1: **33 migrations** registradas, todas com `name NOT NULL`, sem gaps inesperados.

## Próximas migrations do Epic 29

A partir de `031_*` numericamente. Stories que adicionam migrations:

- 29.2 → `031_fk_indexes_critical_remote_only.sql` (CONCURRENTLY)
- 29.3 → `032_composite_indexes_hot_remote_only.sql` (CONCURRENTLY)
- 29.4 → `033_phone_normalization_unique.sql`
- 29.5 → `034_view_dashboard_*.sql`
- 29.6 → `035_meta_campaign_roas_materialized.sql`
- 29.7 → `036_pg_cron_*.sql`
