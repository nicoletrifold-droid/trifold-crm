---
name: csp-frame-src-google-maps
description: A CSP do vercel.json do trifold-design-system precisa de frame-src https://www.google.com — sem ela o iframe do Google Maps em "Sobre Nós" morre silenciosamente
metadata:
  type: project
---

A `Content-Security-Policy` em `vercel.json` do `trifold-design-system` tem que manter `frame-src https://www.google.com` explícito.

**Why:** um deploy de hardening (anterior a 2026-08-20) adicionou a CSP sem `frame-src`, então o iframe do Google Maps da seção "Como chegar" caiu no `default-src 'self'` e foi bloqueado — mapa em branco no mobile e no desktop, sem nenhum sinal visível a não ser o console. Corrigido e deployado em 2026-08-20 (deployment `dpl_Gp9AEu2VBdBHcqNJapfLcML9mEEH`).

**How to apply:** antes de apertar qualquer diretiva da CSP desse projeto, varra os `.dc.html` por embeds de terceiros (`iframe`, `unpkg.com` no `script-src`) e adicione a diretiva correspondente. Notas de comportamento: o `src` do embed é `https://www.google.com/maps?q=...&output=embed`, que dá **301 para `/maps/embed`** — mesma origem, então uma entrada de `frame-src` cobre as duas. `frame-ancestors 'none'` + `X-Frame-Options: DENY` continuam válidos: controlam quem enquadra *este* site, não quem *este* site enquadra. Para validar, render headless com Playwright ([[headless-render-validation]]) filtrando o console por `/Refused to frame|Content Security Policy/` e tirando `locator.screenshot()` do próprio iframe — `curl -I` só prova o header, não o carregamento.

**Estado em 2026-08-26:** o `vercel.json` está versionado no git (PR #501, ampliado no #505) e tem 4 blocos de CSP — a site-wide `/((?!vindresidence).*)` e as 3 escopadas de `/vindresidence*` ([[vindresidence-proxy-path-resolution]]). Todas as quatro carregam `frame-src` com `https://www.google.com`; as do Vind somam `https://www.youtube.com`. Ao editar, alterar **todas** as que precisam — cada bloco é independente e um esquecido só falha na rota dele.
