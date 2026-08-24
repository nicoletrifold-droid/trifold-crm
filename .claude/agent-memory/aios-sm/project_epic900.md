---
name: project-epic900
description: Epic 900 (SaaS multi-tenant/isolamento) — numeração de stories, estado do deploy de produção travado por hotfix 900-15
metadata:
  type: project
---

Epic 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular. Onda 1 = Isolamento.

Stories existentes (2026-08-24): 900-1, 900-2a, 900-2b, 900-2c, 900-3, 900-11, 900-14, 900-15.
Próxima seria 900-16.

## Incidente 2026-08-24 — produção travada, resolvido por 900-15
`packages/web/src/lib/supabase/org-scoped-admin.ts` (criado pela 900-14) importava
`docs/audits/schema-snapshot.json` subindo diretórios. `.vercelignore` na raiz do repo lista
`docs`, então o arquivo nunca chegava ao build da Vercel — passava local e no CI do GitHub, falhava
só no build de produção. Três deploys seguidos em ERROR (900-11, 900-14, fix de mídia WhatsApp).
PRs #489-#491 mergeados com esse check vermelho; #492 (75-367) ficaria bloqueado do mesmo jeito.

**Por que:** Não migra as 129 rotas com `createAdminClient()` cru (isso é outra story, ainda sem
número atribuído — mencionado como pendente tanto na 900-14 quanto seria candidato natural a
900-16+). `docs/` tem 66MB — não pode virar parte do bundle da Vercel.

**Como applied (900-15):** codegen. `generate-schema-snapshot.ts` passa a emitir também
`packages/web/src/lib/supabase/org-scoped-tables.generated.ts` a partir do mesmo schema
introspectado; `org-scoped-admin.ts` importa esse módulo em vez do JSON em `docs/`.
`scripts/gate-tenancy.ts` não muda (continua lendo o JSON na raiz). Check de sincronia sem precisar
de banco: regenera o `.generated.ts` a partir do JSON já commitado e falha se divergir. Regra de
lint (`no-restricted-imports` ou regra `aios`) em `error` contra import relativo de
`packages/web/src` para `docs/`/`scripts/` na raiz.

**Padrão a preservar em qualquer story futura que toque `org-scoped-admin.ts`:** a lista de tabelas
com `org_id` (`TABELAS_COM_ORG_ID`) tem de continuar **derivada por introspecção**, nunca escrita à
mão — é o princípio central que a 900-14 estabeleceu e que a 900-15 teve o cuidado de preservar ao
resolver o bug de deploy.

## Padrões da série 900
- `docs/audits/schema-snapshot.json` = snapshot versionado do schema (gerado por
  `scripts/generate-schema-snapshot.ts`, consumido por `scripts/gate-tenancy.ts` e — até a 900-15 —
  por `org-scoped-admin.ts`). Commitado de propósito para aparecer em diff.
- `createOrgScopedAdminClient(orgId)` (900-14) é o "piso" de isolamento para as 129 rotas
  service-role; `createAdminClient()` continua existindo para uso legítimo cross-org (crons,
  webhooks).
- Regra ESLint `aios/no-unscoped-admin-client` fica em `warn` até a story que migra as 129 rotas
  promovê-la a `error` — allowlist em `docs/audits/admin-client-allowlist.json` (60 legítimos + 178
  legado, catraca só diminui).
- Estilo das stories 900: Metadata + Executor Assignment no topo, seção de "Contexto"/"O furo, medido
  em {data}" com evidência numérica, "Decisão de desenho" explicando alternativas descartadas, ACs
  em checklist com nome curto + descrição, Tasks/Subtasks referenciando ACs, Dev Notes explicando o
  "porquê" de decisões não óbvias.
