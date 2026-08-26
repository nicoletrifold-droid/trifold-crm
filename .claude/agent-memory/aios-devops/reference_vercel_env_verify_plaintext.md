---
name: reference-vercel-env-verify-plaintext
description: Para conferir o valor real de uma env var encrypted da Vercel use GET /v1/projects/{id}/env/{envId} — o parâmetro decrypt=true no endpoint de listagem NÃO decripta
metadata:
  type: reference
---

Endpoints da Vercel REST API para env vars (token em `~/Library/Application Support/com.vercel.cli/auth.json`; `projectId`/`teamId` em `.vercel/project.json`):

- **Criar:** `POST https://api.vercel.com/v10/projects/{projectId}/env?teamId={teamId}` com `{"key","value","type":"encrypted","target":[...]}`. Resposta traz `created[].id`.
- **Listar:** `GET /v10/projects/{projectId}/env?teamId={teamId}` — devolve o blob **cifrado** em `value` (~1080 chars). `&decrypt=true` aqui **não funciona**: continua vindo o blob.
- **Conferir o valor em claro:** `GET /v1/projects/{projectId}/env/{envId}?teamId={teamId}` — devolve `value` em plaintext.

**Why:** o gotcha de env var vazia da Vercel (documentado no CLAUDE.md do `trifold-crm`) só é detectável comparando o valor real. Como o blob cifrado tem tamanho fixo independente do conteúdo, `len(value)` na listagem é prova ZERO de que a variável não está vazia — em 2026-08-19 isso quase passou como verificação válida ao criar `RESEND_API_KEY`.

**How to apply:** depois de qualquer `POST`/`PATCH` de env var, buscar o env individual pelo `id` e validar por propriedades derivadas (comprimento em claro, prefixo, hash parcial) em vez de imprimir o segredo. Só então rodar o deploy/redeploy — mudança de env var só vale no próximo deployment. Se a chamada voltar `invalidToken: true`, é token expirado, não falta de permissão: [[feedback-vercel-token-expiry-refresh]]. Ver também [[reference-vercel-env-source-of-truth]] (source of truth de prod do CRM) e [[verify-email-delivery-not-http-200]] (o caso do `RESEND_API_KEY`).
