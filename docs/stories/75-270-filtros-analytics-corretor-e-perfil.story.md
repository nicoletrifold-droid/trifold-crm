# Story 75-270 — Filtros do Analytics: corretor, calor e perfil do lead

**Epic:** 75 (CRM Trifold) · **Status:** Ready · **Estimativa:** L (~10 pts — subida pelo @po, ver R2)

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
