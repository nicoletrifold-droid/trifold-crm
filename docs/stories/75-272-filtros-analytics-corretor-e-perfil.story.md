# Story 75-272 — Filtros do Analytics: corretor, calor e perfil do lead

**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** L (~10 pts — subida pelo @po, ver R2)

---

## Story

Como **admin/gestor no Analytics**, quero **filtrar por corretor, por calor e pelos campos de
perfil do lead**, com os filtros combinando entre si, sobrevivendo à navegação e chegando ao PDF —
para responder "como foi o mês do Joabe nos leads quentes do Vind?" sem exportar nada.

---

## Context

Decisão do Marcos (04/08): filtro por corretor, **um por vez**, seletor global na URL como o de
empreendimento, refletindo em tudo **+ link do PDF**. Nesta story ele vem acompanhado de mais
filtros, incluindo os campos de **Perfil dos Leads** (pedido do Marcos, 04/08).

### Medição em prod ANTES de desenhar (1.657 leads, 90d)

| Campo | Preenchido | Distintos | Serve de filtro? |
|---|---|---|---|
| `assigned_broker_id` | **97,6%** | 12 | ✅ sólido |
| `interest_level` (Calor) | **79,6%** | 3 | ✅ sólido |
| `finalidade` | 14,5% | 3 | 🟡 marginal |
| `cidade_bairro` | 2,3% | 16 | ⚠️ ralo |
| `estado_civil` | 1,9% | 4 | ⚠️ ralo |
| `profissao` | 1,8% | 17 | ⚠️ ralo |
| `filhos` · `faixa_etaria` · `renda_familiar` · `forma_pagamento` · `situacao_moradia` · `prazo_compra` · `orcamento` · `tem_pet` | **1,0%–1,7%** | 2–21 | ⚠️ ralo |

**O que isso muda no desenho:** os 8 campos de perfil existem em **1 a 2%** dos leads. Um filtro
"Estado civil = Casado" devolveria **31 de 1.657**, e o gráfico pareceria quebrado — o usuário
concluiria "o analytics está errado", não "esse dado quase não é preenchido".

Não é motivo para não entregar (o Marcos pediu, e o dado tende a encher: a Nicole auto-preenche o
perfil — Story 75-181). É motivo para **entregar mostrando a escassez em vez de esconder**:

- Cada opção do filtro exibe a **contagem** (`Casado (31)`), então a raridade é visível ANTES do
  clique. Mesma jogada da 75-269 com o filtro de Origem: derivar dos dados, não de lista fixa.
- Só entram no dropdown valores que **existem no período** — filtro nunca oferece resultado vazio.
- Com filtro de perfil ativo, o cabeçalho diz sobre quantos leads a tela está falando.

O card "Perfil dos Leads" (Story 75-184) **já existe** e já expõe cobertura ("X de Y leads com
perfil"). Esta story o torna **filtrável**, reusando o `aggregatePerfil` que ele já usa —
`PerfilBreakdownItem` é literalmente `{label, count}`, o formato que o dropdown precisa.

### Três coisas que a investigação encontrou e mudam o recorte

**1. Os links de filtro são strings montadas à mão, e se atropelam.** `page.tsx:414` monta
`?property_id=${p.id}${range !== "30d" ? `&range=${range}` : ""}` — qualquer outro parâmetro é
**descartado**. Com dois filtros isso já quebra: escolher empreendimento apagaria o corretor. Não
dá para somar filtros sem consertar a base primeiro.

**2. Já existe um caminho "com filtro" que agrega em JS.** `page.tsx:91` bifurca: SEM
empreendimento usa a RPC `get_analytics_summary_ranged` (org + datas, agregado no banco); COM
empreendimento cai em **queries diretas** agregadas em JS (`:115+`). Ou seja: a infraestrutura de
"filtrado" existe — o certo é **generalizá-la** para qualquer filtro, não inflar a RPC com um
parâmetro por campo. **Zero migration** (e nada de tocar a RPC que a 75-266 mexeu hoje).

**3. O PDF já ignora o filtro de empreendimento — hoje, antes desta story.** O link
(`page.tsx:380-385`) só carrega `range`/`from`/`to`, e `api/analytics/report/route.ts:21-22` só lê
esses três. Não é regressão nossa; é a convenção "relatório segue a tela"
([[feedback-relatorio-segue-tela]]) já furada para o filtro que existe. Como a decisão do Marcos
diz explicitamente "+ link do PDF", entra no escopo — e a forma barata de fazer é um **módulo de
filtros compartilhado** entre a tela e o endpoint do PDF, para todos os filtros valerem nos dois
sem código duplicado.

---

## Os itens

### Item 1 — Base: módulo único de filtros (habilita todo o resto)

`lib/analytics/filters.ts`, puro e testável:
- `parseAnalyticsFilters(sp)` — lê da URL/searchParams para um objeto tipado.
- `applyLeadFilters(query, filters)` — aplica os `.eq()` numa query de `leads`.
- `buildAnalyticsHref(filtros, overrides)` — monta URL **preservando** o que não mudou (mata o
  problema 1). Um filtro em `null` é removido da URL, não fica `&broker=`.
- `hasAnyFilter(filters)` — decide a bifurcação RPC × queries diretas do item 2.

### Item 2 — Generalizar o caminho filtrado

A condição `if (!propertyId)` (`:91`) passa a `if (!hasAnyFilter(filters))`. O bloco `else` recebe
`applyLeadFilters` em vez do `.eq("property_interest_id", …)` fixo, e o select ganha as colunas de
perfil. Todos os pontos que hoje repetem `.eq("property_interest_id", propertyId)` (são 7)
passam pelo helper.

### Item 3 — Filtro de Corretor (o decidido) e de Calor

- **Um por vez** (decisão do Marcos), seletor global na URL, ao lado do de empreendimento.
- Lista de corretores: reusar a que a tela **já tem** (`brokers`, derivada de `by_broker` da RPC,
  já filtrando `HIDDEN_BROKER_NAMES` e corretor inativo) — não montar outra.
- Calor: rótulos de `INTEREST_LEVEL_LABELS` (`lib/constants.ts`), **importados**, nunca copiados.

### Item 4 — Filtros de Perfil do Lead

`profissao` · `renda_familiar` · `filhos` · `estado_civil` · `faixa_etaria` · `situacao_moradia` ·
`tem_pet` · `cidade_bairro` · `finalidade`, cada um com opções **derivadas do período** e
**contagem no rótulo**. As 7 primeiras dimensões saem do `aggregatePerfil` que o card já calcula;
`cidade_bairro` e `finalidade` não estão nele e precisam entrar (ou ganhar agregação irmã).

### Item 5 — O PDF segue os filtros

`buildAnalyticsHref` serializa os filtros no `reportHref`; `api/analytics/report` usa
`parseAnalyticsFilters` + `applyLeadFilters`. Fecha de passagem o furo pré-existente do
empreendimento.

---

## Acceptance Criteria

- [ ] **AC1** — filtrar por corretor reflete em TODOS os números da tela (KPIs, funil, origens,
      motivos de perda, perfil). Verificação (R1 do @po — comparar com SQL declarado, NÃO com a
      lista de Leads, que tem recorte próprio): Entradas com `broker=X` ≡
      `count(*) FROM leads WHERE org_id=… AND segmento='principal' AND assigned_broker_id=X AND
      created_at IN janela`.
- [ ] **AC2 — os filtros COMBINAM e sobrevivem:** escolher empreendimento **não** apaga o corretor
      (nem vice-versa), e trocar o período preserva os dois. É o bug que existe hoje.
- [ ] **AC3** — filtro de Calor funciona com rótulos importados de `INTEREST_LEVEL_LABELS`; zero
      lista de calor duplicada.
- [ ] **AC4** — comportamento **FACETADO** (R5 do @po): as opções de cada dimensão saem do período
      **+ todos os outros filtros ativos**, excluindo apenas a própria dimensão — assim nenhuma
      opção leva a resultado vazio, e a dimensão segue trocável sem se auto-colapsar. Contagem
      sempre no rótulo.
- [ ] **AC5** — com filtro de perfil ativo, a tela diz sobre quantos leads está falando (a
      escassez fica explícita, não escondida).
- [ ] **AC6** — o PDF respeita os filtros ativos, **incluindo empreendimento** (que hoje é
      ignorado): o número do PDF bate com o da tela.
- [ ] **AC7 — sem regressão sem filtro:** nenhum filtro ativo → segue na RPC
      `get_analytics_summary_ranged`, e os números do dia batem com os de hoje (invariante: total
      da tela ≡ `new_leads` da RPC).
- [ ] **AC8** — limpar filtros volta ao estado sem parâmetro na URL (sem `&broker=` vazio).
- [ ] **AC9** — **zero migration**; a RPC não ganha parâmetro novo.
- [ ] **AC11** — (R4 do @po) filtrar por um valor de perfil devolve **exatamente** a contagem que
      o rótulo prometeu, inclusive em `profissao`, que é texto livre agrupado case-insensitive em
      `aggregatePerfil` — o filtro tem de usar o MESMO critério de agrupamento.
- [ ] **AC10** — `parseAnalyticsFilters`/`applyLeadFilters`/`buildAnalyticsHref` cobertos por teste
      unitário, incluindo o caso do AC2 (preservar ao trocar um filtro) e do AC8 (remover, não
      esvaziar).

---

## Dev Notes

- ⚠️ **SESSÃO PARALELA** do Marcos em `75-268-nicole-agendamento-hora` (locked). Trabalhar só em
  `.claude/worktrees/75-270-filtros-analytics` e não tocar agendamento da Nicole.
- 🔥 `page.tsx` é **server component** com `searchParams` — os filtros são links/`<a>`, não estado
  de cliente. `leads-chart.tsx` é client e recebe `initialPropertyId` por prop (`:455`).
- 🔑 Reusar `brokers` que a tela já monta (já exclui `HIDDEN_BROKER_NAMES` e inativos). Montar
  outra lista reintroduziria corretor demo no seletor.
- 🔑 `aggregatePerfil` já devolve `{label, count}` — é a fonte das opções do item 4. Profissão é
  **texto livre** agrupado case-insensitive lá dentro; o filtro tem de casar com o mesmo critério,
  senão a opção "Engenheiro (3)" pode devolver 1.
- ⚠️ O caminho "com filtro" agrega em JS sobre um select de `leads`. Com mais colunas (perfil), o
  select cresce — e o teto de 1000 do PostgREST vale aqui: usar `fetchAllLeads` da 75-269 (já
  existe, PR #353). **Dependência de ordem:** se o #353 não estiver mergeado, rebasear nele.
- O KPI de Perdidos com filtro usa `get_lost_reason_groups(…, p_property_id)` (`:179-183`), que
  aceita SÓ empreendimento. Com filtro de corretor, esse caminho não serve — cair no cálculo em JS
  sobre os leads já buscados (o fallback QA-002 da 75-266 já faz algo parecido).

## Fora de escopo

- Multi-seleção (o Marcos decidiu **um corretor por vez**).
- Seção de Motivos de Perda no PDF (item 3 do backlog, story própria).
- Filtro por corretor no `/broker` (o corretor já vê só o dele).
- Mexer na RPC ou em migration.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-04 | 0.1 | Story criada. Preenchimento dos campos medido em prod ANTES de desenhar: corretor 97,6% e calor 79,6% (sólidos), perfil **1–2%** — daí a decisão de entregar os filtros de perfil **com contagem no rótulo**, tornando a escassez visível em vez de produzir gráfico aparentemente quebrado. Investigação achou 3 coisas que mudaram o recorte: (1) os links de filtro se atropelam hoje (strings à mão), então a base tem de vir primeiro; (2) já existe caminho "com filtro" agregando em JS — generalizar em vez de inflar a RPC, zero migration; (3) o PDF **já ignora** o filtro de empreendimento, furo pré-existente da convenção "relatório segue a tela", que entra no escopo porque a decisão do Marcos diz "+ link do PDF". | @sm (River) |

---

## Validação @po (Pax) — 2026-08-04

**Veredito: GO condicional — 8/10.** Referências conferidas no worktree (`page.tsx:91`, `:115+`,
`:179-183`, `:380-385`, `:414`, `:455`; `report/route.ts:21-22`; `perfil.ts:30-47`) e o
preenchimento reconferido por query independente. Perdeu 2 pontos: **estimativa subdimensionada
(R2)** e um **AC que se contradiz (R5)**.

Checklist: título ✓ · descrição ✓ · AC testáveis ✓ (menos AC1 e AC4) · escopo ✓ · dependências ✓
(com ajuste em R3) · estimativa ✗ (R2) · valor ✓ · riscos ✓ · DoD ✓ · alinhamento ✓.

**Mérito:** medir o preenchimento antes de desenhar evitou entregar 8 dropdowns que fariam a tela
parecer quebrada. A escolha de mostrar a contagem no rótulo resolve o pedido do Marcos **sem**
mentir sobre o dado — é a mesma disciplina da 75-269, e agora virou padrão da casa.

### R1 (muda o AC1) — comparar com a lista de Leads é comparação errada
O AC1 diz "o total confere com a lista de Leads filtrada pelo mesmo corretor". **Os recortes são
diferentes:** o analytics separa "Entradas" (tudo do período) de "Ativos" (`is_active` +
`lost_reason IS NULL`, Story 75-179), e a aba "Em atendimento" da lista tem regra própria. Escrito
assim, o AC falha por motivo legítimo e alguém vai "consertar" o que não está quebrado.
**Reformular:** o total de Entradas com `broker=X` deve bater com
`count(*) FROM leads WHERE org + segmento='principal' + assigned_broker_id = X + janela` — e
declarar esse SQL na story, para o @qa medir a coisa certa.

### R2 (estimativa) — é L, não M
Cinco itens, e dois deles (2 e 5) mexem em arquivos com conjuntos próprios de query: `page.tsx`
tem 7 pontos repetindo o filtro de empreendimento, e `analytics-report-data.ts` tem **371 linhas
com 4 queries de `leads`**. Subir para **L (~10 pts)**. Não estou pedindo para cortar: a decisão do
Marcos incluiu o PDF explicitamente, e deixar de fora significa PDF discordando da tela — o que já
acontece hoje com empreendimento. Só não quero a estimativa mentindo.

### R3 (afrouxa a dependência) — não bloquear no #353
A story manda usar `fetchAllLeads` (75-269, PR #353 não mergeado). **Não criar dependência
dura:** o caminho filtrado é subconjunto estrito do não-filtrado, que mede 612 em 90d — não chega
perto do teto de 1000. Se o #353 já estiver na main na hora do @dev, usar; se não, seguir sem e
registrar como follow-up. Bloquear story em PR alheio é como se perde a tarde.

### R4 (vira AC) — profissão é texto livre
Está só nas Dev Notes e é o erro mais provável desta story: `aggregatePerfil` agrupa profissão
**case-insensitive** exibindo a grafia mais comum (`perfil.ts:68-71`). Se o filtro fizer
`.eq("profissao", "Engenheiro")`, a opção "Engenheiro (3)" pode devolver 1 (os outros dois são
"engenheiro" e "ENGENHEIRO"). **Promover a AC11:** filtrar por um valor de perfil devolve
exatamente a contagem que o rótulo prometeu.

### R5 (corrige contradição no AC4) — de onde saem as opções?
O AC4 promete "nenhuma opção leva a resultado vazio", mas o item 4 deriva as opções **do período**.
Com `corretor=Joabe` + as opções de estado civil vindas do período inteiro, escolher "Casado (31)"
pode dar zero se nenhum dos 31 for do Joabe. É a mesma classe do QA-003 da 75-269, e aqui o AC
tornaria isso um **defeito**, não uma observação.
**Decisão do @po — comportamento facetado:** as opções de cada dimensão saem do período **+ todos
os outros filtros ativos**, excluindo apenas a própria dimensão. É o que faz o AC4 ser verdade de
fato, e mantém a dimensão trocável sem se auto-colapsar (o problema que a 75-269 resolveu no filtro
de Origem). Custa uma passada extra na agregação; vale.

### R6 (não bloqueante) — KPI de Perdidos com filtro de corretor
A story já nota que `get_lost_reason_groups` só aceita empreendimento. Confirmo e reforço: **não**
adicionar parâmetro à RPC (AC9). Calcular em JS sobre os leads já em memória, como o fallback
QA-002 da 75-266. Se o número de Perdidos divergir entre com/sem filtro por causa disso, é bug.

**Status: Draft → Ready.** Com R1 e R5 aplicados nos ACs, R4 promovido a AC11, e estimativa L.

| 2026-08-04 | 0.2 | Validação @po: GO condicional 8/10 → Ready. R1 reescreve o AC1 (comparar com SQL declarado, não com a lista de Leads — recortes diferentes); R2 sobe a estimativa p/ L (~10 pts) sem cortar escopo (o PDF foi decisão explícita do Marcos); R3 afrouxa a dependência do #353; R4 promove "profissão é texto livre agrupado" a AC11; R5 corrige contradição do AC4 definindo comportamento FACETADO (opções saem do período + demais filtros ativos, exceto a própria dimensão); R6 confirma cálculo de Perdidos em JS, sem tocar a RPC. | @po (Pax) |

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Data:** 2026-08-04 · **Modo:** YOLO

### Decisões de implementação

1. **`FILTER_SPEC` como fonte única** (dimensão → param na URL + coluna em `leads` + se é texto
   livre). `parse`/`apply`/`buildHref` derivam dele, então filtro novo é uma linha e o tipo
   (`satisfies Record<keyof AnalyticsFilters, …>`) impede ficar meio-implementado.
2. **AC11 resolvido no spec, não na UI:** `profissao` e `cidadeBairro` são texto livre e ganharam
   `ci: true` → o filtro usa **`ilike`** (curinga escapado), não `eq`. Sem isso, "Engenheiro (3)"
   devolveria 1, porque `aggregatePerfil` agrupa case-insensitive e as outras grafias são
   "engenheiro"/"ENGENHEIRO". `facetOptions` elege a **grafia mais comum** como rótulo, igual ao
   card — assim filtro e card dizem a mesma coisa.
3. **Facetado (R5 do @po) via `except`:** as opções de cada dimensão são contadas com os outros
   filtros aplicados e a própria dimensão livre. Testado que nenhuma opção leva a resultado vazio
   e que a dimensão não se auto-colapsa.
4. **Bifurcação virou `hasAnyFilter`.** Os 7 pontos que fixavam
   `.eq("property_interest_id", propertyId)` passaram por `applyLeadFilters` — não era cosmético:
   com filtro de corretor e sem empreendimento, `propertyId` é `null` e aqueles `.eq()` quebrariam.
5. **`except: "propertyId"` no card "Leads por Empreendimento":** os outros filtros valem, o de
   empreendimento não — o card mostra TODOS os empreendimentos, e aplicá-lo zeraria os demais.
6. **[AUTO-DECISION] `<option value>` É o href.** Função não atravessa server → client, então o
   componente client não pode receber `hrefFor(valor)`. Os hrefs são montados no server (um por
   opção) e o `onChange` só empurra o que veio pronto — zero lógica de URL no cliente.
7. **Fix de tipo:** `applyLeadFilters` perdeu a constraint `T extends EqQuery<T>` porque o TS
   estourava em **TS2589** ("type instantiation excessively deep") ao casá-la contra o tipo do
   `PostgrestFilterBuilder`. Virou genérico livre + cast interno, com o contrato coberto pelo teste
   com fake.
8. **Query de facetamento sem filtro nenhum, de propósito:** `facetOptions` precisa das linhas
   cruas para poder deixar uma dimensão livre por vez. Filtrar na query colapsaria as opções.

### 🔴 AC6 (PDF) NÃO ENTREGUE — e por que eu PAREI em vez de entregar meio

Comecei a fiação e reverti. `buildAnalyticsReportData` tira **todos** os números principais
(`deriveAnalyticsMetrics`, funil, empreendimentos, corretores, origens — `:211-230`) da RPC
`get_analytics_summary_ranged`, que aceita só org + datas. Aplicar os filtros nas 4 queries diretas
e não nos números da RPC geraria um PDF **misturando filtrado com não filtrado**, divergindo da
tela sem nenhum sinal. Isso é pior que não filtrar: hoje o PDF ignora os filtros de forma
previsível; meio-filtrado ele mente.

O caminho certo é dar ao `report-data` a mesma bifurcação da tela (agregar em JS quando há filtro),
e isso é **story própria** — são 371 linhas e 4 queries, sem como validar o PDF visualmente aqui.
O link do PDF ficou **sem** os filtros e com o motivo comentado no código, para ninguém achar que
foi esquecimento.

⚠️ Contexto que atenua: **o PDF já ignorava o filtro de empreendimento antes desta story.** O furo
é pré-existente; esta story não o piorou.

### Validações

- `npm run type-check` — **8/8, 0 erros**
- `npx vitest run` — **132 arquivos / 1593 testes** (+80 novos em 2 suítes)
- `npx eslint` nos arquivos da story — **0 erros, 0 warnings**
- Zero migration (AC9). Nada de agendamento da Nicole tocado (fronteira da 75-268).

### File List

| Arquivo | Mudança |
|---|---|
| `lib/analytics/filters.ts` | **NOVO** — FILTER_SPEC + parse/apply/matches/buildHref/clear |
| `lib/analytics/filters.test.ts` | **NOVO** — 35 casos (round-trip, preservação, remoção, ilike, escape de curinga) |
| `lib/analytics/filter-options.ts` | **NOVO** — facetOptions/facetCoverage/rótulos |
| `lib/analytics/filter-options.test.ts` | **NOVO** — 45 casos (facetado, AC4, AC11, determinismo) |
| `components/analytics/analytics-filter-select.tsx` | **NOVO** — `<select>` client cujo value é o href |
| `app/dashboard/analytics/page.tsx` | filtros parseados; bifurcação por `hasAnyFilter`; 7 pontos via `applyLeadFilters`; barra de filtros; links preservam filtros; AC6 documentado como aberto |

### Pendências para @qa

- **AC1/AC2/AC3/AC5 pedem olho na tela** (é server component com links; a lógica está coberta por
  unidade, o render não).
- **AC6 aberto** — ver acima. Precisa de story própria.
- AC7 (sem regressão sem filtro): verificado por leitura — sem filtro, `hasAnyFilter` é false e o
  caminho da RPC é o de antes, intocado.

| 2026-08-04 | 0.3 | Implementação @dev: módulo único de filtros (FILTER_SPEC como fonte), opções FACETADAS com contagem no rótulo, bifurcação por `hasAnyFilter`, 7 pontos migrados p/ `applyLeadFilters`, barra de filtros na tela e links que preservam o resto (AC2). AC11 resolvido com `ilike` p/ texto livre. **AC6 (PDF) NÃO entregue e revertido de propósito** — o report-data tira tudo da RPC sem filtro, e meio-filtrado mentiria; precisa de story própria. tsc 0, vitest 132/1593 (+80), eslint 0 nos arquivos da story. Status Ready → InReview. | @dev (Dex) |

---

## QA Results

### Review Date: 2026-08-04 · Reviewed By: Quinn (Test Architect)

### Code Quality Assessment

Base bem resolvida. `FILTER_SPEC` como fonte única é a escolha que faz a diferença: adicionar
filtro é uma linha, e o teste "todas as dimensões do spec são lidas" impede filtro
meio-implementado — o tipo de bug que só aparece meses depois quando alguém usa a URL na mão.

Verifiquei os dois pontos onde esta story poderia mentir. Primeiro o **AC11**: está fechado no
lugar certo — no spec (`ci: true` → `ilike` com curinga escapado), não na UI —, e `facetOptions`
elege a grafia mais comum igual ao `aggregatePerfil`, então filtro e card dizem a mesma coisa.
Segundo o **AC2**: o teste reproduz o bug original (trocar empreendimento preservando o corretor),
que era a razão de a story existir antes de qualquer filtro novo.

Registro também a decisão de **parar no AC6** como acerto, não como falha — ver QA-001.

### Refactoring Performed

- **File**: `app/dashboard/analytics/page.tsx`
  - **Change**: a query de facetamento passou a usar o recorte de **ativos**
    (`is_active` + sem `lost_reason`), o mesmo dos cards
  - **Why**: dois defeitos num só ponto. (1) **Consistência:** com o recorte largo, "Casado (31)"
    contaria perdidos e inativos, e o card mostraria menos ao aplicar o filtro — o rótulo mentiria,
    e o rótulo é justamente o que esta story promete. (2) **Teto do PostgREST:** o recorte largo
    mede ~1.650 leads em 90d (medi em prod hoje) e seria cortado em 1000 **em silêncio**,
    subestimando contagens e podendo esconder uma opção rara.
  - **How**: o recorte de ativos mede 612 em 90d, longe do teto. Melhor que paginar: paginar
    corrigiria o corte e deixaria a inconsistência de recorte de pé.

### Compliance Check

- Coding Standards: ✓ · Project Structure: ✓ (puros em `lib/analytics/`, client isolado)
- Testing Strategy: ✓ na lógica, ✗ no render · All ACs Met: ✗ (AC6 aberto; 4 ACs de render)

### Improvements Checklist

- [x] QA-002 corrigido na revisão (recorte do facetamento alinhado aos cards)
- [x] AC11 conferido no spec + teste de que a contagem do rótulo é a devolvida
- [x] AC2 conferido com teste do bug original
- [ ] **Conferir na tela:** corretor + empreendimento + troca de período coexistindo (AC1/AC2/AC3/AC5)
- [ ] **AC6 — story própria do PDF** (QA-001)

### Security Review

Sem achados. Filtros são `.eq()`/`.ilike()` parametrizados pelo PostgREST — sem concatenação de
SQL. O curinga do LIKE é escapado, então valor de usuário não vira busca por prefixo. Gate de role
da página intocado.

### Performance Considerations

Uma query nova por render (facetamento, recorte de ativos) e, no caminho filtrado, uma contagem por
empreendimento. Barato hoje (2 empreendimentos, 612 leads); revisitar se a lista crescer.

### Gate Status

Gate: **CONCERNS** → `docs/qa/gates/75.272-filtros-analytics.yml`
(nenhum HIGH; CONCERNS por AC6 não entregue + 4 ACs de render sem cobertura)

### Recommended Status

**✗ Changes Required** — não por defeito de código, mas porque **AC6 ficou aberto por decisão
técnica** e 4 ACs precisam de olho na tela. O dono da story decide se aceita entregar os filtros da
tela agora e trata o PDF em story separada (minha recomendação) ou se espera o pacote completo.

| 2026-08-04 | 0.4 | Gate @qa: **CONCERNS, nenhum HIGH**. 1 fix na revisão (QA-002: recorte do facetamento alinhado aos cards — corrige a contagem do rótulo E sai do teto de 1000 do PostgREST, que o recorte largo já estourava com ~1.650 em 90d). QA-001 endossa a decisão de PARAR no AC6 (PDF meio-filtrado mentiria; o furo do empreendimento no PDF é pré-existente). Registrados QA-003 (até 11 seletores, instabilidade visual) e QA-004 (ACs de render sem cobertura). | @qa (Quinn) |
| 2026-08-04 | 0.5 | **RENUMERADA 75-270 → 75-272.** A sessão paralela do Marcos usou 75-270 no mesmo dia (PR #356, mídia da Nicole por empreendimento) e nenhum dos dois PRs havia mergeado, então ainda dava para desempatar — o precedente "não renumerar" da 75-211 vale para o que já saiu, não para PR aberto. Renomeados apenas o ARQUIVO da story e o gate; a branch (`feat/75-270-filtros-analytics`) e os commits ficam, porque renomear branch com PR aberto custa mais do que resolve. **O título do squash no merge deve citar 75-272.** Escolhi 272 e não 271 porque a 271 já é a branch do PDF (que fecha o AC6 desta story). | @dev (Dex) |
