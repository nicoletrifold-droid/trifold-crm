---
name: home-dc-hash-anchor-client-render
description: Links de âncora entre páginas do trifold-design-system falham silenciosamente porque o conteúdo é renderizado client-side — o scroll precisa ser refeito no componentDidMount
metadata:
  type: project
---

Nas páginas `.dc.html` do `trifold-design-system`, âncora nativa (`Home.dc.html#contato` vindo de outra página) **não funciona**: o browser tenta rolar antes do React renderizar o conteúdo, o elemento ainda não existe no DOM e a rolagem falha **sem erro nenhum** — o usuário fica no topo. Correção aplicada em `Home.dc.html` (deploy 2026-08-20): `scrollIntoView()` explícito dentro do `componentDidMount()`, guardado por `window.location.hash === '#contato'`.

**Why:** o HTML servido é só template com `{{ }}`, hidratado por `support.js`; o `componentDidMount` é o primeiro ponto em que o DOM real existe. O bug reportado era o botão "CONTATO" na nav de B2B/Blog não levando ao formulário.

**How to apply:** qualquer link de âncora **cross-page** novo nessas páginas precisa do mesmo tratamento na página de destino — não confie no comportamento nativo do browser. Se aparecer outro alvo de âncora além de `#contato`, generalize a checagem em vez de duplicar o `if`. Valide sempre por render headless com probe com/sem hash: [[headless-render-validation]].
