---
name: lcp-self-hosting-third-party
description: Iniciativa de LCP no trifold-design-system — auto-hospedar origens de terceiro (React/ReactDOM, depois Google Fonts) para sair do caminho crítico
metadata:
  type: project
---

O trifold-design-system está removendo origens de terceiro do caminho crítico de renderização para melhorar o LCP no Lighthouse/PageSpeed (mobile, 4G lenta). Já foram auto-hospedados: (1) React/ReactDOM e (2) as fontes Google — 3 `.woff2` em `assets/fonts/` + `assets/fonts/fonts.css` com os `@font-face` (`font-display: swap` preservado), substituindo os `preconnect` + `css2?...` do Google em todas as páginas `.dc.html` com `<head>` próprio (`Logo.dc.html` é só componente, não tem head). A principal ganha um `<link rel="preload" as="font" ... crossorigin>`.

**Why:** cada origem de terceiro no caminho crítico custa DNS+TLS+RTT antes do texto pintar; em 4G simulada isso domina o LCP.

**How to apply:** ao mexer no `<head>` dessas páginas, não reintroduzir `fonts.googleapis.com`/`fonts.gstatic.com` nem CDNs de JS — manter tudo local sob `assets/`. Deploy pela pasta com `vercel deploy --prod --yes`; validar pelo alias `https://trifold-design-system.vercel.app` (ver [[vercel-static-deploy-cdn-stale]]).
