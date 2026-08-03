# Story 75-263 — O card mostra TODAS as telas, não só a primeira

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Bug de produto pedido pelo Marcos

---

## Story

**Como** quem aprova post na fila da Lídia,
**Quero** ver a miniatura de **cada** tela/card do post, cada uma abrindo em nova aba,
**Para que** eu decida com a peça inteira na frente — hoje a tela 2 existe, tem botão para refazer, e não aparece em lugar nenhum.

---

## Context

O card da fila renderizava **uma** imagem:

```tsx
{post.arte_url && <ArtePreview key={post.arte_url} url={post.arte_url} />}
```

`arte_url` é, por contrato da 75-255, a arte de **menor ordem** (`montarPatchDeArtes`:
*"`arte_url` espelha a arte de MENOR ordem"*). Num story de 2 telas, a tela 2 fica invisível.

**O card já sabia que havia duas.** Os botões **"Refazer arte (tela 1)"** e **"(tela 2)"** estão
lado a lado na mesma peça de interface — ele enumera as artes para gerar botão e desenha só a
primeira imagem. É inconsistência interna, não falta de dado.

O caminho que sobrava era o preview modal (75-254), que navega tela por tela. Serve para conferir,
mas não para **comparar** — e comparar é o que o Marcos faz ao aprovar: as duas telas contam uma
narrativa e precisam funcionar juntas.

---

## Scope

### IN

- Uma miniatura por arte, em linha que quebra (`flex-wrap`), ordenadas por `ordem`.
- Cada miniatura abre a arte em nova aba — comportamento que já existia, preservado.
- Rótulo por miniatura quando há 2+: **"Tela N"** para story, **"Card N"** para carrossel.
- Vale para qualquer quantidade: carrossel com 4 cards mostra 4.
- Post legado/manual (sem `artes`, só `arte_url`) segue idêntico.

### OUT

- Mudar o contrato de `arte_url` espelhar a tela 1 — é da 75-255 e está certo.
- Mexer no preview modal — ele resolve outro problema (ver a peça como vai ficar).
- Lightbox interno em vez de nova aba — o Marcos pediu explicitamente para manter.

---

## Acceptance Criteria

- [ ] **AC1 — todas aparecem:** post com N artes mostra N miniaturas, ordenadas por `ordem`.
- [ ] **AC2 — cada uma abre a sua:** clicar na miniatura da tela 2 abre a URL **da tela 2** em
      nova aba (`target="_blank" rel="noopener noreferrer"`).
- [ ] **AC3 — rótulo só quando serve:** com 2+ artes cada miniatura é rotulada; com 1 arte, sem
      rótulo (um "Tela 1" solto num post estático não informa nada).
- [ ] **AC4 — vocabulário certo por formato:** story → "Tela", carrossel → "Card", estático/reel →
      sem rótulo. **Vindo de `nomeDaUnidade()` em `post-preview.ts`**, não de uma segunda cópia.
- [ ] **AC5 — legado intacto:** post sem `artes` e com `arte_url` renderiza como antes.
- [ ] **AC6 — imagem quebrada não quebra o card:** o fallback "Ver arte ↗" da 75-240 continua
      valendo **por miniatura** — uma URL morta não derruba as outras.
- [ ] **AC7 — nasce nas 4 listas:** a mudança é no `PostCard`, então aparece em Sugestões,
      Aprovados, Publicados e Rejeitados de uma vez (mesma propriedade da 75-254).

---

## Dev Notes

- **`nomeDaUnidade()` foi extraída nesta story.** O vocabulário "Tela/Card" existia inline em
  `post-preview.ts` (`const nome = tipo === "story" ? "Tela" : "Card"`), e a primeira versão do
  card **duplicou** essa regra. Duas cópias divergiriam no dia em que um formato novo entrar —
  então o helper virou a fonte única e o parser passou a usá-lo também.
- `object-contain` e `max-h-72` mantidos: a arte 9:16 fica alta e estreita, e duas delas lado a
  lado cabem no card sem estourar.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada a pedido do Marcos, ao notar que a tela 2 não abria. Diagnóstico: o card enumerava artes para os botões de refazer e renderizava só `arte_url`. | @sm (River) |
