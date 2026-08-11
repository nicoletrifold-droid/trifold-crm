# Story 75-292 — O nome do lead sumiu do header do drawer (`S..`)

**Story ID:** 75-292
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** P (~1 pt)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** bug fix (regressão introduzida pela 75-290)

---

## Story

Como **gestor abrindo um lead no pipeline**, quero **ler o nome do lead** no header do drawer —
depois da 75-290 ele virou `S..` (era "Sueli").

---

## Context

Regressão vista pelo Marcos no print de 11/08, logo após a 75-290 subir. O drawer é
`max-w-md` (**448px**) e o header é uma linha só:

```
[ nome + ✏️ ]  [ Feedback ] [ Editar Lead ] [ Ver completo ] [ ✕ ]
```

O bloco do nome é `min-w-0 flex-1` (`lead-detail-drawer.tsx:525`) e o bloco dos botões usa a
largura natural. Em flexbox, **quem tem `flex-1` cede primeiro**: os 4 controles ficam inteiros e
o nome é espremido até o `truncate` deixar duas letras.

A 75-290 já tinha tentado defender esse header com rótulo curto ("Feedback") e `flex-wrap` — não
bastou: o wrap **nunca dispara**, porque o container dos botões nunca é forçado a quebrar
enquanto houver um vizinho `flex-1` disposto a encolher até zero.

### Decisão de desenho — dar um piso ao nome e deixar os botões quebrarem

O nome ganha um **piso de largura**; o bloco de ações fica `shrink-0` e mantém `flex-wrap`, então
em largura apertada os botões descem para uma segunda linha em vez de comer o nome. Cabeçalho um
pouco mais alto num caso raro é melhor que lead sem identificação.

**Alternativa considerada e descartada:** botão de feedback só com ícone no drawer. Resolveria a
largura, mas o Marcos pediu explicitamente um botão *visível* ao lado de "Editar Lead" — trocar
por ícone desfaz o que a 75-290 entregou.

### Ajuste do Marcos (11/08, depois de ver o piso não bastar)

O piso de largura **sozinho não resolveu** — ele viu em prod que o nome continuava `S..`. A
sugestão dele resolve pela raiz: **tirar o botão "Editar Lead"** e deixar só o lápis, "pois a
função é a mesma". Conferido no código: os dois apontam para o MESMO `?edit=1`
(`lead-detail-drawer.tsx:539` = lápis, `:570` = botão) — era ~90px de header gastos para repetir
uma porta que já existia. É esse espaço que faltava para o nome.

---

## Acceptance Criteria

- [x] **AC1 — o nome aparece.** Em 448px (largura real do drawer), com os 4 controles no header,
      um nome curto/médio ("Sueli", "Maria Oliveira") aparece **legível**, não como `S..`.
- [x] **AC2 — nome muito longo continua truncando** com `…` (nada de estourar o painel ou
      empurrar os botões para fora da tela).
- [x] **AC3 — os 4 controles continuam acessíveis**, quebrando para uma segunda linha quando não
      couberem — nunca cortados nem sobrepostos.
- [x] **AC4 — nada mais muda.** Nenhuma alteração de comportamento do botão de feedback (75-290),
      dos links "Editar Lead"/"Ver completo", do lápis ou do fechar.
- [x] **AC5 — tema.** Claro e escuro seguem idênticos (só largura muda).

---

## Tasks

- [x] `lead-detail-drawer.tsx` header: piso `min-w-[7rem]` no bloco do nome
- [x] **Remover o botão "Editar Lead"** (pedido do Marcos) — mesma rota do lápis; o lápis ganhou
      `aria-label` por virar a ÚNICA porta de edição do drawer
- [x] **Desvio da task original:** o bloco de ações NÃO levou `shrink-0` — com `shrink-0` ele não
      quebraria linha e voltaria a espremer o nome. Ele continua encolhível **com** `flex-wrap`;
      quem ganhou `shrink-0` foi o ✕, que saiu do grupo para não descer sozinho
- [x] lint + typecheck + suíte
- [ ] Smoke pós-deploy: abrir o drawer da Sueli e ler o nome inteiro

## Dev Notes

1. 🔥 **A lição é a mesma da [[feedback-tailwind-ordem-utilitarios]]**, por outro ângulo:
   `flex-wrap` no container dos botões é inútil enquanto o vizinho `flex-1` puder encolher —
   quem decide quem cede é o par `flex-1` × `shrink-0`, não o `wrap`.
2. Não há teste automatizado possível aqui (o projeto não tem jsdom —
   [[feedback-projeto-sem-teste-de-componente]]): a validação é visual, e por isso a AC1 fixa a
   largura real (448px) em vez de dizer "não deve estourar".

## File List

- `packages/web/src/components/leads/lead-detail-drawer.tsx` (piso no nome · ✕ fora do grupo · `gap-2` no header)
- `docs/stories/75-292-header-drawer-nome-espremido.story.md`

## QA Results (@qa)

**Gate: CONCERNS** — a correção é de layout e **só o olho valida**; sem jsdom não há teste possível.

| Check | Resultado |
|---|---|
| Suíte / typecheck / build | 2152 verdes · typecheck limpo · `next build` OK |
| Lint | baseline (0 erros / 24 avisos) |
| AC1/AC2/AC3 | no código: piso de 112px no nome, `truncate` preservado, ações quebram linha, ✕ fixo |
| AC4/AC5 | nenhum comportamento alterado; só classes de largura |

**Pendência herdada para o smoke:** abrir o drawer da Sueli em 448px e ler "Sueli" inteiro; conferir
um nome bem longo (deve truncar com `…`) e que o ✕ não desceu de linha.

### Reabertura no gate (11/08) — o piso não bastava

O Marcos conferiu em prod e o nome seguia `S..`. **Duas causas, e eu só tinha visto uma:**

1. A correção do piso **ainda não estava em prod** (vive no PR #390, não mergeado) — o print era
   do código antigo. Ou seja: o piso não foi testado nem reprovado, só não estava lá.
2. Mesmo com o piso, `7rem` (112px) dá "Sueli" mas aperta qualquer nome médio. O gasto real era
   o botão redundante: **~90px para repetir o `?edit=1` do lápis.** Removido.

Agora o header tem nome + lápis + Feedback + Ver completo + ✕ — sobra ~3× mais espaço para o nome
do que antes. Segue sendo validação **visual** (sem jsdom, sem teste possível).

## Change Log

- 2026-08-11 — @sm: criada a partir do print do Marcos; regressão da 75-290 no mesmo dia.
