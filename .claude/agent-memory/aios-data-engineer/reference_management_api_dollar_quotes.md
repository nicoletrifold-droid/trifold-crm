---
name: Supabase Management API — quoting de dollar-quotes ($$...$$) requer curl HEREDOC
description: SQL com dollar-quotes (ex.: `SELECT cron.schedule(..., $$ DELETE ... $$)`) via Management API falha com 403 cf-ray 1010 quando enviado via Python urllib f-strings ou shell expansion; pattern definitivo é curl --data-binary @file.json com JSON gerado por heredoc 'EOF' literal.
type: reference
---

Quando aplicar SQL com dollar-quotes (`$$...$$`) via Supabase Management API (`POST /v1/projects/{ref}/database/query`):

**O que NÃO funciona:**
- Python `urllib.request` com payload montado via `json.dumps({'query': '...$$...$$...'})` dentro de shell f-string — o shell ou Python expandem `$$` para PID ou variáveis vazias → JSON corrompido → 403 cf-ray 1010 do Cloudflare WAF
- `curl -d "$(...)"` ou `curl -d '...$$...'` — shell expansion mesmo com aspas simples se houver substituição variável próxima

**O que FUNCIONA (pattern definitivo):**
```bash
cat > /tmp/payload.json <<'EOF'
{"query": "SELECT cron.schedule('cleanup-system-events', '0 3 * * *', $$ DELETE FROM system_events WHERE created_at < now() - interval '30 days' $$);"}
EOF

curl -s -X POST "$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/payload.json
```

Chaves do pattern:
1. **HEREDOC com `'EOF'` (single-quoted)** — zero expansão de variáveis ou `$$` pelo shell
2. **`--data-binary @file`** — envia o conteúdo do arquivo literalmente, sem reprocessamento
3. **JSON inline com aspas simples internas** funciona porque o JSON parser do servidor lida bem com aspas simples dentro de strings JSON (que são delimitadas por aspas duplas)

**Confirmação:** retornos esperados:
- `cron.schedule` retorna `[{"schedule":N}]` (N = jobid)
- `CREATE EXTENSION` retorna `[]` (DDL sem result set)
- HTTP 201 indica sucesso (não 200)

**Aplicado em:** Story 29.7 (2026-05-14) — 5 cron schedules + test-job-29-7. Pattern também usado por extensão em `INSERT ... ARRAY[$MIG_1$...$MIG_1$, ...]` para tracking de migrations (já documentado em `reference_supabase_management_api_tx.md`).
