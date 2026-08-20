---
name: resend-contact-form-sandbox
description: Form de contato do trifold-design-system usa Resend em sandbox; conta pertence a nicoletrifold@gmail.com e trifold.eng.br NÃO está verificado, então envio para caio@trifold.eng.br falha com 403
metadata:
  type: project
---

O endpoint `api/contact.js` do projeto Vercel `trifold-design-system` envia via Resend usando o remetente sandbox `onboarding@resend.dev`. A conta Resend em uso pertence a **`nicoletrifold@gmail.com`** e o domínio **`trifold.eng.br` não está verificado**. Consequência: qualquer envio para `caio@trifold.eng.br` (destinatário configurado no código) retorna `403 validation_error` do Resend, que a function traduz em HTTP `502 {"error":"email_send_failed"}`.

**Why:** limitação do modo sandbox do Resend — com `onboarding@resend.dev` só entrega para o e-mail dono da conta. Confirmado em 2026-08-19 no primeiro teste end-to-end em produção; a mensagem do Resend nomeia explicitamente `nicoletrifold@gmail.com` como o único destinatário permitido.

**How to apply:** o `502` nesse endpoint é **esperado** até que alguém verifique `trifold.eng.br` em resend.com/domains e troque `FROM_EMAIL` para um endereço desse domínio — não investigar como bug da function nem da env var. Para distinguir causas rapidamente: `500 server_misconfigured` = `RESEND_API_KEY` ausente/vazia; `502` com log `Resend error: 401` = chave inválida; `502` com `Resend error: 403 validation_error` = esta limitação de sandbox. Os logs de runtime saem em `vercel logs <deployment-url> --json --scope trifold-s-projects` e contêm o corpo do erro do Resend.

**Nota de arquitetura:** com `api/contact.js` o `trifold-design-system` deixou de ser 100% estático — passou a ter Serverless Function Node (zero-config, detectada pela pasta `api/`, sem alterar `vercel.json`). Ver [[vercel-static-deploy-cdn-stale]] para o protocolo de validação pós-deploy e [[reference-vercel-env-verify-plaintext]] para conferir env vars.
