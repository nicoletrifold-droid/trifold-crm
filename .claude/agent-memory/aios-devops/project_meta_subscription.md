---
name: project-meta-subscription
description: Estado da subscription Meta para webhooks Meta Ads e WhatsApp em producao
metadata:
  type: project
---

Subscription Meta esta configurada corretamente em producao (validado 2026-06-08 via Graph API v21.0):

- App-level subscriptions:
  - `whatsapp_business_account` -> `https://trifold-crm.vercel.app/api/webhook/whatsapp` (field `messages` v25.0) — ativo
  - `page` -> `https://crm.trifold.eng.br/api/webhooks/meta-ads` — ativo
- Page subscribed_apps: app `1249990980457973` ("Acoes Trifold") inscrito em `[leadgen]`
- Verify token de producao tem sufixo `...a387d2f`, igual ao `.env.local` raiz. `packages/web/.env.local` tem token DIVERGENTE (`...e285040`) — apenas dev-local, nao afeta prod.
- Endpoint `/api/webhooks/meta-ads` responde 200 ao challenge com token correto, 403 com token errado — handler funcional.

**Why:** Quando webhook_logs aparece vazio em prod, a primeira hipotese e configuracao Meta. Esta memoria pula esse passo — a config esta OK.

**How to apply:** Se for diagnosticar de novo "webhook Meta nao chega", NAO refazer o diagnostico de subscription. Olhar primeiro: (a) coluna `leads.metadata` existe? (ver [[project-leads-metadata-migration-074]]) (b) handler tem early-return antes do INSERT em webhook_logs? (c) ha leads-teste reais sendo gerados via Lead Form?

Producao usa dominio `crm.trifold.eng.br` para o meta-ads webhook (NAO `trifold-crm.vercel.app`) — confirmar antes de testar URLs.
