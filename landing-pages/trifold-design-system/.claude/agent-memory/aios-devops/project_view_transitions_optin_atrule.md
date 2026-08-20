---
name: view-transitions-optin-atrule
description: Opt-in de View Transitions cross-document é a at-rule CSS @view-transition{navigation:auto} — o <meta name="view-transition"> é sintaxe do protótipo antigo e é inerte (provado por A/B em Chrome 151)
metadata:
  type: project
---

Para transição suave entre as páginas `.dc.html` do `trifold-design-system` (que são documentos HTML separados, não SPA), o opt-in válido é a at-rule CSS:

```css
@view-transition { navigation: auto; }
```

O `<meta name="view-transition" content="same-origin">` **não faz nada** em navegador atual — é a sintaxe do protótipo experimental do Chrome, descartada antes do ship estável (Chrome 126+). Esteve em prod e foi comprovadamente inerte; **substituído pela at-rule em prod em 2026-08-20** nas 7 páginas (`<style>@view-transition{navigation:auto}</style>` na linha 6 do `<head>` real), com transição confirmada funcionando em produção.

**Why:** A/B controlado em Chrome 151 (Playwright), duas vezes:
1. Local, duas páginas mínimas por braço: meta tag → `pageswap.viewTransition = false`; at-rule → `= true`.
2. Contra produção (`https://trifold.eng.br`, clique real Home → Empreendimentos): tratamento (Home, com at-rule) → `pageswap.viewTransition = [object ViewTransition]`; controle (`Logo.dc.html`, único doc do site sem o opt-in) → `false`.

**Escopo do opt-in é por par de documentos:** no controle, o destino (`Empreendimentos.dc.html`) *tem* a at-rule e ainda assim não houve transição, porque o documento de **saída** não tinha. Ou seja, ao adicionar uma página nova ao site é obrigatório colocar a at-rule nela, senão ela quebra a transição em toda navegação que sai dela. `Logo.dc.html` está nesse estado hoje (sem opt-in) — é intencional apenas por ser página utilitária, mas serve como controle de teste.

Ou seja: os eventos `pageswap`/`pagereveal` **sempre disparam** em navegação same-origin, independente de opt-in. Só o campo `event.viewTransition` distingue transição ativa de nada. Contar "o evento disparou" dá falso positivo.

**How to apply:** ao validar/implementar transição de página aqui, procure a at-rule, não a meta tag. Prefira colocá-la num `<style>` no `<head>` real das `.dc.html` (render-blocking, descoberta antes do primeiro paint) — no teste, at-rule dentro de `<style>` no `<body>` (onde vive o CSS do bloco `<helmet data-dc-atomics>`) também acendeu o `pageswap`, mas head é o caminho seguro. O CSS de tuning `::view-transition-old(root)/::view-transition-new(root)` pode continuar no bloco do `<helmet>` — pseudo-elementos são resolvidos na hora da transição. Técnica de probe em [[headless-render-validation]].
