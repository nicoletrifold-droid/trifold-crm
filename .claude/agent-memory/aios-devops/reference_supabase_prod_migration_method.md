---
name: supabase-prod-migration-method
description: Como aplicar migration/SQL direto no Supabase de producao sem CLI interativo (Management API + PAT)
metadata:
  type: reference
---

Metodo estabelecido para aplicar migration/SQL direto em producao (projeto Supabase prod ref `dsopqkqjkmhytudaaolv`) sem CLI interativo:

```
POST https://api.supabase.com/v1/projects/dsopqkqjkmhytudaaolv/database/query
Authorization: Bearer <PAT>
Content-Type: application/json
{"query": "SQL AQUI"}
```

- PAT (Supabase Management API) fica na auto-memory do usuario em `project_migrations.md` / `project_supabase_envs.md` (sufixo `...54b14f`, verificado funcional 2026-07-22). Se o PAT falhar (401), pedir ao usuario — nao adivinhar nem usar credencial de outro lugar.
- Resposta `[]` = sucesso para UPDATE/DDL sem retorno. Sempre confirmar com um SELECT pos-execucao.
- Novas chaves `sb_publishable_`/`sb_secret_` NAO funcionam em curl REST direto — so o PAT `sbp_...` funciona para a Management API.

**Why:** projeto nao usa `supabase db push` (CLI) para prod; migrations em `supabase/migrations/` sao aplicadas manualmente via Management API pelo @devops. Ver [[project-migrations]] na auto-memory do usuario.

**How to apply:** ao receber handoff de migration com "aplicar em prod", ler o .sql, rodar o SELECT de estado antes (valida PAT + projeto certo), aplicar, e reconfirmar com SELECT. Ex. aplicado: migration 186 (`storage.buckets.file_size_limit` null → 26214400 no bucket `lancamentos`, Story Lancamentos-05, 2026-07-22).
