---
name: verify-email-delivery-not-http-200
description: HTTP 200 no /api/contact nao prova envio de email — o endpoint retorna 200 falso pra honeypot e time-guard. Confirme via GET /emails last_event.
metadata:
  type: feedback
---

Nunca trate `HTTP 200 {"ok":true}` do `/api/contact` como prova de que o email saiu.

**Why:** o handler em `landing-pages/trifold-design-system/api/contact.js` retorna 200 deliberadamente
em dois caminhos que NAO enviam nada — honeypot (`body.empresa` preenchido) e guarda de tempo minimo
(`loadedAt` recente, < 2000ms). Isso é anti-bot proposital: nao dar pista de bloqueio. Logo o 200 é
ambiguo por design.

**How to apply:**
- Pra validar de ponta a ponta, consulte `GET https://api.resend.com/emails?limit=100` e ache o envio
  pelo `subject`, checando `last_event` (`delivered` = chegou no servidor de destino; `queued` = so aceito).
  A lista NAO vem ordenada de forma confiavel por `created_at` — filtre por subject em vez de pegar `data[0]`.
- No curl de teste use `loadedAt: 1` (timestamp antigo passa a guarda) e header `Origin` permitido
  (senao 403 `forbidden_origin`).
- Mesmo com `delivered`, nao afirme que chegou na caixa de entrada — spam/filtro só o usuario confirma.

**Triagem rapida dos codigos de erro desse endpoint** (evita investigar a function quando o problema é
credencial ou dominio):
- `500 server_misconfigured` → `RESEND_API_KEY` ausente ou **vazia** (gotcha de env var vazia da Vercel;
  conferir o valor real via [[reference-vercel-env-verify-plaintext]]).
- `502 email_send_failed` com log `Resend error: 401` → chave invalida.
- `502 email_send_failed` com log `Resend error: 403 validation_error` → remetente nao autorizado pra
  esse destinatario (era o caso ate 2026-08-20, quando o `FROM_EMAIL` ainda era o sandbox
  `onboarding@resend.dev` e `trifold.eng.br` nao estava verificado). **Hoje isso seria regressao**, nao
  comportamento esperado: o dominio esta `verified` e o `FROM_EMAIL` é
  `Site Trifold <contato@trifold.eng.br>`. Ver [[resend-domain-verification]].
- Os logs de runtime com o corpo do erro do Resend saem em
  `vercel logs <deployment-url> --json --scope trifold-s-projects`.

Ver tambem [[resend-domain-verification]] e o padrao irmao [[verify-next-public-env-inlining]]
(mesma licao: escolher um sinal que realmente prova a coisa).
