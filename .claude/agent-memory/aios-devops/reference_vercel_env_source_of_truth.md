---
name: reference-vercel-env-source-of-truth
description: Como pegar/validar env vars de producao do projeto trifold-crm
metadata:
  type: reference
---

Producao do trifold-crm vive no Vercel (`trifold-s-projects/trifold-crm`, projectId `prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj`).

Para baixar env de prod (no working dir do projeto):
```
vercel env pull --environment=production .env.vercel.production
```

Produz um arquivo `.env.vercel.production` na raiz. **NUNCA commitar** esse arquivo — apagar imediatamente apos uso: `rm -f .env.vercel.production`.

Quando o usuario reportar divergencia entre `.env.local` (raiz do monorepo) e `packages/web/.env.local`, **trate Vercel como source of truth para producao**. Os `.env.local` sao apenas dev-local e podem ficar dessincronizados sem afetar prod.

Vercel CLI ja esta instalado em `/Users/lucasprado/.nvm/versions/node/v22.22.2/bin/vercel` e autenticado.

**Tooling LOCAL ausente no host (macOS):** `supabase` CLI, `psql`, `pg`, `docker`. Para operacoes de DB local, depender de Supabase SQL Editor (web UI) ou pedir ao user para rodar comandos.
