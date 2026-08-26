---
name: feedback-vercel-token-expiry-refresh
description: Vercel REST API retornando forbidden/invalidToken = token do auth.json expirou; rodar `vercel whoami` renova antes de reagir
metadata:
  type: feedback
---

Se uma chamada a `api.vercel.com` com o token de `~/Library/Application Support/com.vercel.cli/auth.json` retornar `{"error":{"code":"forbidden","message":"Not authorized","invalidToken":true}}`, **NAO conclua que falta permissao ou que o recurso nao existe**. Provavelmente o token expirou.

Diagnostico e fix:
1. `expiresAt` no auth.json esta em **segundos** (nao ms) — `datetime.fromtimestamp(expiresAt)` direto. Se dividir por 1000 vai dar 1970 e enganar.
2. Rodar `vercel whoami` (PATH: `/Users/lucasprado/.nvm/versions/node/v22.22.2/bin`) — a CLI usa o `refreshToken` e reescreve o auth.json com token novo.
3. Reler o token do arquivo e repetir a chamada.

**Why:** o token da CLI tem validade curta (observado expirando em ~horas, 2026-08-20 01:27). O CLAUDE.md manda usar a REST API em vez de `vercel env add` (que grava valor vazio), entao esse caminho e usado com frequencia e vai bater nesse erro periodicamente. O `invalidToken: true` no payload e o sinal definitivo.

**How to apply:** sempre que a REST API da Vercel der forbidden, refresque via `vercel whoami` e tente de novo ANTES de investigar permissoes, teamId ou existencia do recurso. Ver [[reference-vercel-env-source-of-truth]].
