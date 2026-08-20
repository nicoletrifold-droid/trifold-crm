---
name: headless-render-validation
description: Como renderizar páginas .dc.html de verdade para validar deploy — Chrome --dump-dom trava; usar playwright com NODE_PATH de playwright@ (não @playwright+test@)
metadata:
  type: reference
---

Para provar que uma página `.dc.html` do `trifold-design-system` renderiza o conteúdo certo em produção (o HTML servido é só template com `{{ }}`, hidratado por `support.js`), renderize com Playwright a partir do repo raiz `trifold-crm`:

```
cd /Users/lucasprado/trifold-crm && \
NODE_PATH="node_modules/.pnpm/playwright@1.60.0/node_modules:node_modules/.pnpm/node_modules" \
node /caminho/script.js     # chromium.launch({ channel: 'chrome' }) + waitForTimeout(2500)
```

**Gotcha 1 — `--dump-dom` não serve.** `Google Chrome --headless --disable-gpu --virtual-time-budget=N --dump-dom <url>` **trava indefinidamente** contra este site (timeout de 3min estourado em 2026-08-19, 0 bytes de saída). Não insista nem aumente o timeout: vá direto pro Playwright.

**Gotcha 2 — path do NODE_PATH.** O que funciona é `node_modules/.pnpm/playwright@1.60.0/node_modules`. A variante `@playwright+test@1.60.0/...` citada em [[vercel-landing-pages-projects]] é o pacote de test runner, não o `require('playwright')`.

**Sinais úteis de extrair no `page.evaluate`:** `document.querySelector('h1').textContent`, `document.title`, `meta[name=description]` (as duas últimas são setadas client-side no `componentDidMount`) e os `href` dos links de relacionados. Isso cobre tanto o conteúdo quanto o roteamento por query param de uma vez.

**Validando scroll/âncora:** `window.scrollY` + `getBoundingClientRect().top` do alvo, com `viewport: { width: 1280, height: 800 }` explícito (sem altura de viewport não há o que rolar). Sempre rode **duas probes — com e sem o hash** — a sem-hash é o controle que prova que o `scrollY > 0` veio da âncora e não de restauração de scroll. Precisa de `waitForTimeout(~4000)` após `waitUntil: 'load'`: o scroll roda no `componentDidMount`, depois do load. Ver [[home-dc-hash-anchor-client-render]].

**Validando navegação entre páginas / view transitions:** registre listeners via `context.addInitScript` (roda antes dos scripts da página, em **todo** documento novo — sobrevive à navegação, diferente de `page.evaluate`) e persista o resultado em `sessionStorage`, que atravessa o full page reload. Grave **uma chave única por evento** (`sessionStorage.setItem('__vt::'+seq, ...)`), nunca read-modify-write de um array — o array perde registros na troca de documento. Clique no link real com `locator.click({force:true})` + `page.waitForURL(/regex/)`, nunca `goto` direto. Use `newContext` isolado por braço de teste. Ver [[view-transitions-optin-atrule]].

**`reducedMotion` NÃO é braço de controle válido** (corrigido em 2026-08-20 contra prod): com `reducedMotion: 'reduce'` o `pageswap.viewTransition` continua sendo um `[object ViewTransition]`. O Chrome cria o objeto e só suprime a animação — não pula a transição. Uma versão anterior desta memória afirmava o contrário; era errado. **Controle correto:** usar como documento de saída uma página do mesmo origin **sem** o opt-in (em prod, `Logo.dc.html`) e injetar nela um `<a href>` para o destino via `page.evaluate` (anchor no DOM não viola a CSP). Aí `pageswap.hasVT=false` — prova que o probe discrimina.

**Caveat conhecido:** no braço com transição ativa, o `pagereveal` do documento de destino não é capturado (o `addInitScript` parece perder a corrida com o reveal quando há VT cross-document). No braço de controle ele aparece. Não invalida o veredito — o sinal load-bearing é o `pageswap.viewTransition` do documento de saída.

Combine com o `diff` byte a byte do HTML servido vs local descrito em [[vercel-static-deploy-concurrency]] — o diff prova que o arquivo subiu, o render prova que o JS resolve o conteúdo certo.
