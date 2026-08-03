# Story 75-258 — "Refazer arte" respeita a tela, e não a tela 1

**Epic:** 75 (CRM Trifold) · **Status:** Draft
**Criada por:** @sm (River) em 2026-08-03
**Formato:** Bug — encontrado durante a validação em produção da 75-256

---

## Story

**Como** quem refaz a arte de uma tela específica do story,
**Quero** que o Refazer use as referências **daquela** tela e preserve o registro das outras,
**Para que** refazer a tela 2 não traga o render da tela 1 nem apague o histórico do que a tela 1 usou.

---

## Context — os dois defeitos foram observados no mesmo clique

Ao validar a 75-256 em produção (post `ca3d031e`, story do Vind com 2 telas), o Marcos clicou
em **Refazer arte (tela 2)**. O título e o CTA voltaram corretamente — o que a 75-256 prometia.
Mas dois outros comportamentos apareceram.

### Defeito 1 — o Refazer da tela 2 usa as referências da tela 1

`app/api/marketing-posts/[id]/arte/route.ts:67`:

```ts
const arquivosKit = Array.isArray(post.arte_arquivos)
  ? (post.arte_arquivos as unknown[]).filter((f): f is string => typeof f === "string")
  : []
```

`post.arte_arquivos` é a coluna de **topo**, que por contrato da 75-255 espelha a **tela 1**
(`montarPatchDeArtes`: *"`arte_url` espelha a arte de MENOR ordem"*). Então refazer a tela 2
manda ao motor os arquivos da tela 1.

**Evidência empírica, no banco, depois do clique:**

```
ordem 2: arquivosUsados=['VIND_RENDER_PISCINA.png', 'VIND_RENDER_FACHADA_NOITE_STORY.png']
```

A tela 2 era **só a piscina**. O `FACHADA_NOITE_STORY` entrou porque veio da tela 1 — e a arte
refeita saiu com a fachada dentro da cena da piscina, visivelmente diferente da original.

**A inconsistência é local e evidente:** a `descricao` da mesma story JÁ é por tela
(`telaAtual?.descricao ?? …`, linha 61). Só os arquivos não são.

### Defeito 2 — refazer uma tela zera o `arquivosUsados` das outras

Linha 98, no bloco que preserva as demais telas:

```ts
arquivosUsados: [] as string[],
```

**Evidência empírica:** antes do Refazer, a tela 1 tinha seus arquivos registrados. Depois de
refazer a **tela 2**, a tela 1 ficou com `arquivosUsados=[]`.

O comentário acima desse bloco diz *"as OUTRAS telas são preservadas"* — e elas são, no que
importa para a peça (URL, descrição, CTA, e agora título/subtítulo). O `arquivosUsados` foi o
único campo que ficou de fora, e some em silêncio. É perda de dado de auditoria: é o registro
de qual arquivo do Kit gerou aquela arte.

> **Nota de honestidade:** a 75-256 passou por esse mesmo bloco para acrescentar
> `titulo`/`subtitulo` e **manteve o `[]`**, seguindo o padrão existente em vez de questioná-lo.
> O defeito é anterior (75-255), mas houve uma chance de pegá-lo e ela passou.

---

## Scope

### IN

- `arquivosKit` do Refazer passa a vir da **tela pedida**, com fallback para a coluna de topo
  (posts anteriores à migração 208 não têm `artes`).
- `arquivosUsados` das telas não refeitas é **preservado**.
- Teste que fixa os dois comportamentos.

### OUT

- Mudar o contrato de `arte_arquivos`/`arte_url` espelharem a tela 1 — é da 75-255 e está certo.
- Persistir `arquivosUsados` na geração inicial — já funciona.

---

## Acceptance Criteria

- [ ] **AC1 — referências por tela:** refazer a tela N usa `artes[N].arquivosUsados` como
      `arquivosKit`. Só cai em `post.arte_arquivos` quando a tela não tem lista própria
      (post legado, sem `artes`).
- [ ] **AC2 — nada é zerado:** depois de refazer a tela N, as demais telas mantêm
      `arquivosUsados` idêntico ao de antes. Teste com 2 telas, ambas com arquivos.
- [ ] **AC3 — a tela refeita registra o que de fato usou:** `arquivosUsados` da tela N passa a
      ser o que o motor devolveu naquela geração (já é hoje) — e agora reflete as referências
      certas, por consequência da AC1.
- [ ] **AC4 — post legado não quebra:** post com `arte_url` e sem `artes` continua refazendo,
      caindo no fallback de topo e sem exigir campo novo.
- [ ] **AC5 — sem regressão da 75-256:** título, subtítulo e CTA continuam voltando no Refazer
      (é o que impede a peça de sair muda).

---

## Dev Notes

- O `ArteGerada` já tem `arquivosUsados: string[]`; o tipo lido da linha do banco em
  `artesAtuais` **não declarava** o campo — daí o `[]` ter passado despercebido. Declarar.
- Um post pode ter tela sem arquivos (`[]` legítimo, quando o Kit não tinha referência
  utilizável). Distinguir "vazio de verdade" de "não existe": `?? fallback` em vez de
  `|| fallback`, senão o vazio legítimo puxa a lista da tela 1 de novo.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-03 | 0.1 | Story criada a partir da validação em produção da 75-256. Dois defeitos observados no mesmo clique, ambos com evidência no banco (post `ca3d031e`). | @sm (River) |
