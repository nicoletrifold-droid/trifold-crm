---
name: landing-page-webhook
description: Webhook /api/webhooks/landing-page — auth por token, comportamento sincrono pos-fix PR#473, como fazer smoke test em prod
metadata:
  type: project
---

Webhook `packages/web/src/app/api/webhooks/landing-page/route.ts` recebe leads de landing pages WordPress (WPForms/CF7/Elementor).

**Fix PR #473 (merge feb2f82d, 2026-08-20):** trocou `after()` do Next por `await` sincrono de `processLandingPageLead`. Antes o callback `after()` era descartado de forma intermitente na Vercel sem exceção — lead nunca criado, `webhook_logs.processed` ficava `false` para sempre, cliente ja tinha recebido 200. Leads perdidos silenciosamente.

**Comportamento pos-fix:** POST retorna `200 {"status":"ok"}` SOMENTE se o lead foi processado; `500 {"error":"Lead processing failed"}` se falhar (org ausente, insert falhou). `401` token invalido, `503` se secret nao configurado.

**Auth:** `?token=<secret>` na query OU header `Authorization: Bearer <secret>`. Secret = env `LANDING_PAGE_WEBHOOK_SECRET` (prod: Vercel env id `pPzzYYhgoCejUrpT`, type encrypted, 64 chars, sufixo `...215b3d`).

**Smoke test em prod (CUIDADO — cria lead real + dispara distribuicao p/ corretor):**
- `resolveOrgId` busca `whatsapp_config status=active` (org prod = `00000000-0000-0000-0000-000000000001`)
- Payload com nome/email/telefone cria lead real. Telefone 11 digitos vira `+55...`
- SEMPRE limpar depois: delete activities WHERE lead_id, delete lead, delete webhook_log — via Management API ([[supabase-prod-migration-method]])
- Verificar sucesso: `webhook_logs.processed=true` + lead existe em `leads`

**Why:** validar deploy do fix exige POST real que atravessa o caminho critico; nao ha endpoint dry-run.
**How to apply:** para revalidar o webhook, use payload identificavel ("TESTE ... pode ignorar"), confirme 200+lead+processed=true, depois limpe. Vercel+GitHub deploy e automatico no merge da main (check `Vercel – trifold-crm` no PR = build de preview).
