---
name: verify-next-public-env-inlining
description: Como validar em prod que uma env NEXT_PUBLIC_* foi realmente inlinada — curl no HTML NAO serve para scripts afterInteractive
metadata:
  type: feedback
---

Para confirmar que uma `NEXT_PUBLIC_*` entrou em efeito no Vercel, grepar o HTML SSR
NAO e suficiente. Grepar o **client chunk** JS do deployment novo.

**Why:** `NEXT_PUBLIC_*` e inlinada em build time, entao so vale apos rebuild
(`vercel redeploy` faz rebuild e pega a env; mudar a env sozinha nao muda nada).
E no App Router, `next/script` com `strategy="afterInteractive"` NAO aparece no HTML
SSR — o script inline e injetado na hidratacao. Em 2026-08-19 o Pixel Meta do
`/formulario/[token]` (Story 86-9) parecia ausente porque `curl | grep 'fbq('` e
`grep connect.facebook.net` davam 0 no HTML — mas estava tudo certo.

**How to apply:**
1. HTML SSR: procure o que renderiza server-side (no caso do Pixel, a tag
   `<noscript><img src="https://www.facebook.com/tr?id=...">`).
2. Extraia os `src="/_next/static/chunks/*.js"` do HTML, baixe e grepe o codigo.
   O padrao inlinado aparece como `let t="<valor>".trim()||"<fallback>"` — o
   primeiro literal e a env inlinada. Se estiver `void 0`/`undefined`, a env NAO
   entrou no build.
3. O chunk carrega `?dpl=dpl_...` — confira que casa com o deployment novo, senao
   voce esta olhando build antigo.

Relacionado: [[quality-gate-signals]], [[vercel-static-deploy-concurrency]]
