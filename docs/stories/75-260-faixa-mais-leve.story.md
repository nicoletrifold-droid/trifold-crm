# Story 75-260 — A faixa fica mais leve

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Ajuste visual pedido pelo dono do produto

---

## Story

**Como** dono da marca,
**Quero** que a faixa composta ocupe menos da peça,
**Para que** o render do empreendimento — que é o que vende — tenha mais espaço.

---

## Context

A 75-256 passou título, subtítulo, CTA e logo para composição por código. A geometria
inicial foi dimensionada para caber tudo com folga, e o resultado foi registrado no gate
como decisão pendente do Marcos:

> ⚠️ *"A faixa com subtítulo + CTA ocupa 38% da altura. A peça vai ficar visivelmente
> diferente: mais faixa, menos imagem. É mudança estética e é sua chamada."*

**Chamada dada em 03/08, com a peça real na mão: "está pesada".**

Renderizei duas alternativas sobre o **render real do Kit**
(`VIND_RENDER_FACHADA_NOITE_STORY.png`), não sobre mock:

| opção | faixa (título+subtítulo+CTA) | o que muda |
|---|---|---|
| atual | **38%** | — |
| A | 34% | só o texto e a faixa do logo |
| **B (escolhida)** | **28%** | texto, faixa do logo **e** a pílula do CTA |

A B foi a escolhida. Ela chega perto dos 25% que a arte reservava antes de a faixa existir,
o que faz a mudança de cara ser pequena em relação ao que o time já conhecia.

**De onde veio o espaço, em ordem de contribuição:**

1. **Faixa do logo: 14% → 9,5%.** Era o maior pedaço e o mais vazio — o logo ocupa só 60%
   da altura dela (`LOGO_HEIGHT_IN_BAND`), então 40% era respiro sobre respiro.
2. **Pílula do CTA: 6,2% → 5%** de altura, com o respiro acima caindo de 1,8% → 1,3%. Em
   1920px a pílula tinha 119px — botão grande demais para um story.
3. **Título 8,5% → 7% e subtítulo 5% → 3,8%.** O corpo da fonte é derivado da altura da
   caixa, então isso reduz o texto proporcionalmente — sem prejuízo de leitura, porque o
   título continua com ~100px em 9:16.

---

## Acceptance Criteria

- [ ] **AC1 — faixa 9:16:** ~28% com título+subtítulo+CTA, ~23% sem CTA, ~18% só título.
- [ ] **AC2 — nada colide:** a pílula continua abaixo do subtítulo e acima da faixa do logo,
      nos 3 formatos e nas 4 combinações (o teste da 75-256 cobre isso e continua valendo).
- [ ] **AC3 — o logo ainda cabe:** `maxHeight` do logo cai de 161px para 109px em 9:16.
      Verificar que o logo do Vind (SVG, proporção larga) não fica ilegível.
- [ ] **AC4 — a fração dita ao prompt acompanha:** vem de `faixaLayout`, então muda sozinha.
      O teste de fonte única da 75-256 garante que prompt e composição não divergem.
- [ ] **AC5 — testes das stories anteriores atualizados, não silenciados:** as asserções de
      14% (`arte-logo`) e de piso 20% (`arte-faixa`) mudaram porque o desenho mudou —
      com o motivo escrito no teste.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada. Decisão do Marcos sobre o concern C1 do gate da 75-256, com as duas alternativas renderizadas sobre o render real do Kit. Opção B escolhida. | @sm (River) |
