---
name: landing-irma-e-referencia-nao-molde
description: "\"Replique a estrutura da landing irmã\" quer dizer ADAPT, nunca copiar trecho — 4 pontos medidos em que copiar o Vind Residence quebra a landing do Yarden"
metadata:
  type: feedback
---

Quando uma story pedir "a mesma estrutura de seções da landing do Vind Residence",
tratar `landing-pages/vind-residence/index.html` como **referência de estrutura e
comportamento**, e reescrever a marcação na convenção da landing de destino. Nunca
colar trecho.

**Why:** o Vind Residence tem defeitos em produção que a landing de destino não pode
herdar, e a landing do Yarden tem um teste que **reprova** três deles. Na 86-13 quatro
pontos foram medidos, não deduzidos:

1. **Galeria como `<img src="…webp">` avulso** → os 9 `.jpg` do par ficam sem
   referência em atributo HTML.
2. **Fundo de seção por `background-image` no CSS** → o par `jpg+webp` do fundo fica
   sem referência em atributo.
3. **`trifold-fachada` servida só em `.webp`** → o `.jpg` copiado fica sem referência.
   Nos três casos `landing-pages/yarden/tracking-browser.test.ts` reprova: o extrator
   dele lê **somente** `(?:src|srcset|href|content)="…"`, e trata arquivo em `assets/`
   sem referência como sobra de clone. `background-image` é invisível para ele.
4. **`.g-wide{grid-column:span 2}` num grid mobile de 2 colunas**, com a 1ª figura
   `.g-tall` → o auto-placement não encaixa a 2ª foto ao lado da 1ª e deixa uma
   **célula vazia** (medida: 170×310) no canto superior direito. O Vind carrega esse
   buraco em produção. Este ponto **nenhuma AC previa** — só apareceu porque a
   geometria de cada célula foi medida com Playwright.

**How to apply:**
- Todo par `jpg+webp` novo vai por `<picture>` com `<source srcset="x.webp">` **e**
  `<img src="x.jpg">` — as duas URLs em atributo. Fundo de seção também: `<picture>`
  posicionado com `object-fit:cover` numa caixa absoluta, não `background-image`.
- A única exceção legítima para `background-image` é reaproveitar arquivo **já
  referenciado** por atributo em outro ponto da página (foi como a banda CTA da 86-13
  usou `galeria-05.jpg`). Aí não há arquivo novo, logo não há órfão.
- Antes de afirmar que o teste guarda os assets novos, **rodar a mutação**: criar um
  `assets/galeria-10.jpg` sem referência e trocar um `srcset` por um nome inexistente.
  Os dois têm de reprovar. Ver [[carrasco-declarado-e-afirmacao]].
- Layout responsivo de grid: medir `getBoundingClientRect()` de cada célula, não olhar
  o screenshot. O buraco do item 4 cai justamente fora do recorte da viewport.

Contexto do runtime dessas pastas em [[landing-pages-runtime]]; a exigência de escopo
mínimo dessa família de stories em [[concern-de-gate-como-followup]].
