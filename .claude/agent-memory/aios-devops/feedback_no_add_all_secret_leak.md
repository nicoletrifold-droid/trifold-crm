---
name: no-add-all-secret-leak
description: Nunca git add -A cego; sempre escanear arquivos por segredos antes de stage/commit/push
metadata:
  type: feedback
---

NUNCA stagear com `git add -A` sem antes inspecionar cada arquivo. SEMPRE escanear arquivos novos/modificados por segredos reais antes de commit e push, especialmente scripts utilitários (`packages/web/scripts/*.mjs`).

**Why:** Em 2026-06-17, um pedido de "git add -A, não filtre nada" quase publicou uma Supabase service_role key hardcoded em `packages/web/scripts/fix-campaign-lead-names.mjs:13` (`const SERVICE_KEY = "sb_secret_..."`). O GitHub Push Protection bloqueou o push (GH013). A maioria dos scripts irmãos lê `process.env.SUPABASE_SERVICE_ROLE_KEY`, mas este tinha a chave embutida. Um scan parcial inicial (só primeiras linhas do grep) não pegou — só o scan completo revelou.

**How to apply:**
- Antes de qualquer commit, rodar grep nos arquivos a enviar: padrões `sb_secret_`, `eyJ` (JWT), `sbp_`, `sk_live_`, `service_role`, `Bearer <token>`. Filtrar matches que são `process.env.X` (esses são OK).
- Se achar segredo real: corrigir o arquivo (trocar por `process.env`), e garantir que o segredo NÃO entra em nenhum commit a enviar (`git log -S"<trecho>" origin/main..HEAD` deve vir vazio).
- NUNCA usar a URL de "unblock-secret" do GitHub Push Protection — isso publica o segredo.
- Service_role keys que vazaram devem ser rotacionadas no Supabase mesmo que removidas do commit (avisar o usuário).
- Relaciona com [[feedback-quality-gate-signals]] e [[reference-vercel-env-source-of-truth]].
