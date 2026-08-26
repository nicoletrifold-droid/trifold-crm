---
name: trifold-domain-vercel-txt-verification
description: trifold.eng.br é reivindicado por uma conta Vercel de terceiro — todo domínio adicionado no time trifold-s-projects exige TXT em _vercel.trifold.eng.br, e o DNS (Cloudflare) é de terceiro
metadata:
  type: project
---

O apex `trifold.eng.br` está registrado em **outra conta Vercel** (não `trifold-s-projects`, nem a conta
pessoal de `nicoletrifold@gmail.com`). Consequência: `GET /v5/domains/trifold.eng.br` retorna
`403 forbidden — You don't have access`, e **todo** hostname desse apex adicionado a um projeto nosso
volta com `verified: false` + `reason: pending_domain_verification`, exigindo um TXT em
`_vercel.trifold.eng.br` com valor `vc-domain-verify={hostname},{token}`.

O DNS fica no **Cloudflare** (`ben.ns.cloudflare.com` / `pat.ns.cloudflare.com`) e é administrado por um
**terceiro** — não temos credencial Cloudflare local. Ou seja: adicionar domínio novo desse apex é
sempre um pedido externo, nunca uma operação self-service.

Já existe um TXT histórico `vc-domain-verify=crm.trifold.eng.br,fd3379921c816408fb40` — prova de que o
terceiro sabe criar esses registros e que `crm.trifold.eng.br` passou pelo mesmo caminho. TXT aceita
múltiplos valores no mesmo nome, então o pedido é sempre **adicionar** (nunca substituir) o registro.

**Why:** em 2026-08-19 o site institucional caiu porque o terceiro aplicou o A record
(`trifold.eng.br → 76.76.21.21`) antes do domínio existir como Custom Domain na Vercel — TCP conectava
mas o TLS handshake morria (sem cert) e HTTP devolvia `X-Vercel-Error: DEPLOYMENT_NOT_FOUND`. A ordem
correta é: adicionar o Custom Domain + verificar o TXT **primeiro**, apontar o A/CNAME **depois**.

**How to apply:** ao receber pedido de domínio novo em `*.trifold.eng.br`, já assuma o TXT como
pré-requisito e mande os valores exatos pro admin de DNS junto com o pedido de A/CNAME, no mesmo
round-trip. Não gaste tempo tentando `verify` em loop: o erro `missing_txt_record` é determinístico até
o TXT propagar. Esse é o motivo pelo qual servir a landing do Vind em `trifold.eng.br/vindresidence`
foi feito por rewrite-proxy e não por subdomínio novo — ver [[vindresidence-proxy-path-resolution]].
Hostnames já resolvidos: `trifold.eng.br` (institucional) e `crm.trifold.eng.br`
([[trifold-crm-domains]]). Ver também [[vercel-static-deploy-cdn-stale]].
