# Story 75-257 — O "Visualizar" mostra a arte como ela é

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Bug de produto

---

## Story

**Como** quem aprova post na fila da Lídia,
**Quero** que o "Visualizar" mostre exatamente o arquivo que vai ser publicado,
**Para que** eu aprove o que vai sair — e não uma simulação que sobrepõe texto que o Instagram nunca vai renderizar.

---

## Context — o preview mostra algo que não vai existir

`post-preview-modal.tsx:140-142`, entregue pela 75-254:

```tsx
{mostraArte && preview.tipo === "story" && tela?.texto && (
  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
    <p className="whitespace-pre-wrap text-xs leading-snug text-white">{tela.texto}</p>
  </div>
)}
```

Quando a tela tem arte, o texto da tela é desenhado **por cima** da imagem, na faixa inferior.

**A intenção era correta e está documentada** em `post-preview.ts:138-140`: *"No story o texto é DA TELA (não há legenda embaixo)"* — e por isso `legenda` é `null` para story. Isso fazia sentido **antes** de a arte compor a própria faixa inferior.

**O que mudou:** desde a 75-246/248 (logo e CTA compostos) e agora a 75-256 (título composto), a faixa inferior da arte **já contém o texto**. O overlay do modal cai exatamente sobre ela.

Medido nos prints de 03/08:

| tela | o que o overlay cobriu |
|---|---|
| Tela 1 | "Entrega contratual: abril de 2027" + o logo VIND |
| Tela 2 | o logo VIND, sobre o título já coberto pela pílula (bug da 75-256) |

**O agravante que decide a correção:** o arquivo real do storage está **limpo** — o Marcos abriu a URL direto e a arte está correta. O que vai para o Instagram é aquele arquivo. O `texto` da tela é o **briefing que gerou a arte**, não uma camada que o Instagram renderiza. Ou seja: o botão chamado "veja como a postagem vai ficar" está mostrando o que ela **não** vai ser.

---

## Scope

### IN

- Com arte presente, o texto da tela **nunca** é sobreposto à imagem.
- O texto continua visível, **abaixo** do quadro, rotulado como referência (é o briefing da tela, útil para quem aprova conferir se a arte cumpriu o pedido).
- Sem arte, o comportamento de hoje é preservado integralmente (texto centralizado no quadro + selo "Sem arte gerada para esta tela" — AC3 da 75-254).

### OUT

- Mudar `post-preview.ts` / `buildPostPreview` — a decisão de `legenda: null` para story continua certa; o que muda é só a **renderização**.
- Título composto na arte — é `75-256`.

---

## Acceptance Criteria

- [ ] **AC1 — zero sobreposição com arte:** quando `mostraArte` é verdadeiro, nenhum elemento de texto é renderizado com `position: absolute` sobre o `<img>`. Verificado por teste de componente.
- [ ] **AC2 — o texto não desaparece:** com arte, o texto da tela aparece **abaixo** da moldura, com rótulo que diz o que é (não "Legenda" — no story não existe legenda; algo como "Texto desta tela").
- [ ] **AC3 — sem arte, nada muda:** o caminho sem arte segue idêntico, selo de aviso incluído.
- [ ] **AC4 — a moldura mostra a arte inteira:** `object-cover` recorta a peça; para conferir aprovação a arte tem de aparecer **completa**. Trocar para `object-contain` com fundo neutro.
- [ ] **AC5 — vale para os 4 tipos:** story, carrossel, feed e reel — nenhum sobrepõe texto à arte.

---

## Dev Notes

- AC4 não estava no bug relatado, mas é do mesmo defeito: `object-cover` em arte 9:16 dentro de moldura 9:16 é inócuo — **até** a proporção divergir (arte 4:5 num quadro de story, que acontece quando o formato do post muda depois da geração). Aí recorta e esconde justamente a faixa inferior.
- Reuso: o bloco de legenda já existente (`:171-178`) tem o padrão visual de "texto abaixo do quadro com rótulo". Adaptar, não criar outro.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada a partir dos prints de 03/08. Causa: overlay da 75-254 colide com a faixa inferior composta desde a 75-246/248. Achado adicional: `object-cover` pode recortar a faixa inferior (AC4). | @sm (River) |
