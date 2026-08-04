# Story 75-274 — Filtros do Analytics: nome do corretor e cobertura do Calor

**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** XS (~2 pts)

---

## Story

Como **gestor olhando o Analytics**, quero o filtro de Corretor com **nomes** e o de Calor dizendo
**sobre quantos leads ele fala** — para escolher um recorte sem ter que decorar uuid nem desconfiar
que o contador está errado.

---

## Context

Reportado por Marcos em 04/08 (com print), sobre os filtros que a 75-272 entregou. Três achados; **um
é defeito, um é omissão de aviso e o terceiro é comportamento correto** — a medição em prod é o que
separa os três, e é ela que evita "consertar" o que já está certo.

### Achado 1 — DEFEITO: o dropdown de Corretor mostrava uuid

Com `broker_id=34260eb8…` (Thielly) na URL, a lista vinha assim:

```
✓ Thielly (50)
  08b15977-a35e-4e64-ad22-7cb57641a233 (45)
  12089ddc-5bf2-482f-9915-1b3518df43bb (44)
  …
```

**Causa-raiz.** O mapa de nomes saía de `brokers` — o array que alimenta o card "Leads por
Corretor" —, e esse array é **derivado dos leads já filtrados**: com um corretor selecionado ele tem
uma linha só. Já o dropdown é **facetado de propósito** (a própria dimensão fica livre, senão não há
como trocar de corretor), então ele lista os sete e seis não achavam nome.

A fonte do nome não pode depender do recorte que o próprio filtro está aplicando. Passa a vir de
`users`, pelos ids dos corretores ativos na roleta (mesma régua da Story 75-53).

Medido em prod (30d, ativos): os seis uuid são Valeria Costa (45), Robson Silva (44), Matheus
Barbosa Rodrigues (44), Odair Ferreira dos Santos (29), Roberto Colichio (25) e Elisabete Rodrigues
Baticiotto (23) — **as contagens do rótulo já estavam certas**, só o nome faltava.

Efeito colateral que o defeito escondia: `HIDDEN_BROKER_NAMES` ("corretor demo", "target editado")
compara por NOME, então uma opção rotulada com uuid **passava pela peneira**. Com nome resolvido, a
régua volta a valer para o dropdown.

### Achado 2 — OMISSÃO: Calor somava 29 num recorte de 50

`Frio (28) + Morno (1) = 29`, com 50 leads no recorte. Medido em prod:

| interest_level | leads |
|---|---|
| `cold` | 28 |
| **null** | **21** |
| `warm` | 1 |

Não falta lead: **21 estão sem calor**. O aviso de cobertura ("13 de 50 com o dado") existia só nas
dimensões de perfil, onde a 75-272 previu a escassez. Calor foi tratado como campo denso (79,6% na
base inteira) e ficou sem aviso — mas **dentro de um recorte a densidade muda**, e aqui caiu para
58%. Sem a linha, a soma que não fecha parece defeito de contador. O aviso passa a valer para
Corretor e Calor também, e **desaparece quando a cobertura é total**, para não virar ruído.

### Achado 3 — CORRETO, sem código: Calor com duas opções

Não há nenhum lead `hot` da Thielly nos 30d (tabela acima). O dropdown **oferece o que existe no
recorte** — se listasse "Quente (0)" ofereceria um clique que garantidamente esvazia a tela. Fica
registrado aqui em vez de virar mudança: os três valores canônicos seguem sendo
`cold`/`warm`/`hot` (`INTEREST_LEVEL_LABELS`).

### Não é defeito: "Thielly (50)" com Entradas = 51

O rótulo conta o recorte de **ATIVOS** — decisão do QA-002 da 75-272, para a contagem do rótulo ser
a que o usuário vê ao aplicar o filtro. 50 é exatamente o card "Ativos". Entradas (51) inclui
perdido/inativo.

---

## Acceptance Criteria

- [x] **AC1** — com qualquer filtro ativo, o dropdown de Corretor mostra **nome** em todas as
      opções; nenhum uuid aparece na tela.
- [x] **AC2** — as contagens do rótulo não mudam (o defeito era só de rótulo).
- [x] **AC3** — corretor oculto ("corretor demo", "target editado") não aparece no dropdown nem
      quando outro corretor está selecionado — a peneira por nome volta a valer.
- [x] **AC4** — Corretor e Calor ganham o aviso de cobertura quando alguma linha do recorte está
      sem o dado (ex.: Calor "29 de 50 com o dado").
- [x] **AC5** — o aviso **não aparece** quando toda linha do recorte tem o dado (não virar ruído em
      dimensão densa).
- [x] **AC6** — regressão coberta por teste: mapa de nomes incompleto **não** produz opção com uuid.

---

## Dev Notes

`brokerFilterOptions` nasceu em `lib/analytics/filter-options.ts` (não na página) porque é onde o
teste chega. O mapa de nomes faz dois papéis de propósito: rótulo **e** régua de quem pode aparecer
— quem monta o mapa já decidiu (na tela, corretor ativo na roleta). Assim "sem nome" e "não pode
aparecer" não podem divergir.

O conjunto de nomes ocultos entra como parâmetro, igual `aggregateFilteredLeads` já faz
(`hiddenBrokerNames`) — mesma convenção, sem constante nova.

`coverageNote()` centraliza a frase que estava inline na página, agora usada por três dimensões, e
concentra a decisão de **omitir** quando a cobertura é total.

### File List
| Arquivo | Mudança |
|---|---|
| `lib/analytics/filter-options.ts` | **NOVO** `brokerFilterOptions` + `coverageNote` |
| `lib/analytics/filter-options.test.ts` | 6 casos novos (AC1/AC3/AC4/AC5/AC6) |
| `app/dashboard/analytics/page.tsx` | nomes de `users`; avisos em Corretor/Calor |

## QA Results

Gate: **PASS** — `docs/qa/gates/75.274-filtros-analytics-nome-e-cobertura.yml`

Verificado com dado real de prod (read-only, script descartável rodando as funções REAIS): os 7
corretores com nome e as contagens idênticas às do print, e Calor com "29 de 50 com o dado".
1.735 testes verdes, type-check e lint sem erro novo.

**Fica para os olhos do Marcos (OBS-001):** o render. "Elisabete Rodrigues Baticiotto (23)" é bem
mais largo que um rótulo de perfil e a fileira de filtros é `flex-wrap` — não estoura, mas pode
ganhar uma linha. Se cortar ou ficar feio, é CSS no `AnalyticsFilterSelect`, não lógica.

## Change Log
| Data | Mudança |
|---|---|
| 2026-08-04 | Story criada a partir do report do Marcos (3 achados, 2 com código) |
