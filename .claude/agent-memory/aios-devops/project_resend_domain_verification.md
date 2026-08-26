---
name: resend-domain-verification
description: Resend exige POST /domains/{id}/verify pra sair de not_started; DNS correto nao verifica sozinho. Como confirmar entrega real via last_event.
metadata:
  type: project
---

Verificacao de dominio no Resend NAO acontece automaticamente quando o DNS entra no ar. O status fica em
`not_started` indefinidamente ate alguem disparar `POST https://api.resend.com/domains/{id}/verify`.
Depois do disparo vai pra `pending` e leva ~1-2 min pra virar `verified`.

**Why:** em 2026-08-20 o DKIM/MX de `trifold.eng.br` ja estavam no ar (confirmado via `dig` no autoritativo
Cloudflare) mas o Resend reportava `not_started` em todos os 3 registros. Parecia registro faltando; era so
falta de trigger. Perdemos tempo caçando um SPF TXT "ausente" que o Resend nem exigia de fato.

**How to apply:**
- Antes de concluir que falta registro DNS, cheque o campo `status` do dominio. `not_started` = nunca
  verificado, nao é falha de DNS. Dispare o verify e faça poll.
- Resend exige apenas 3 registros pra sending: DKIM TXT (`resend._domainkey`), SPF MX (`send`) e
  SPF TXT (`send`). DMARC nao aparece na lista de required.
- O SPF TXT em `send.trifold.eng.br` continua **ausente** no DNS autoritativo e o Resend marcou
  `verified` de qualquer forma (aceitou via MX). Nao vá "consertar" isso achando que quebrou —
  mas adicionar o TXT ainda é recomendavel pra alinhamento SPF.
- A conta Resend em uso pertence a **`nicoletrifold@gmail.com`**. Dominios verificados nela:
  `trifold.com.br` (antigo, com open/click tracking) e `trifold.eng.br` (verificado 2026-08-20, sem
  tracking). Antes dessa verificacao o form do institucional usava o remetente sandbox
  `onboarding@resend.dev`, que so entrega pro dono da conta — dai o `403 validation_error` ao mandar
  pra `caio@trifold.eng.br`. Hoje o `FROM_EMAIL` de `api/contact.js` é
  `Site Trifold <contato@trifold.eng.br>`, no dominio verificado.

Ver tambem [[verify-email-delivery-not-http-200]].
