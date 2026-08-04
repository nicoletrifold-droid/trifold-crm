# Story 75-269 — Higiene do Analytics: o filtro de Origem esconde 41% dos leads

**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** S (~3 pts)

---

## Story

Como **admin/gestor olhando o Analytics**, quero que o filtro de Origem do gráfico "Leads por
Período" ofereça **as origens que os meus leads realmente têm**, e que o gráfico não passe a
subcontar em silêncio quando a base crescer — para que eu decida campanha com número inteiro, não
com um recorte que a tela não me conta que fez.

---

## Context — e uma premissa do backlog que se provou FALSA

Esta story nasceu de três itens anotados durante a 75-266 ("higiene do analytics"). Ao medir cada
um em produção antes de escrever, **um deles estava errado e a prioridade se inverteu**:

> ❌ **A anotação dizia:** *"leads-by-period SEM paginação subconta janelas >1000 — período
> anterior teve 1.182/30d, o gráfico JÁ MENTE em 90d!"*

**Não mente.** Medido em prod (04/08) com os filtros **exatos** do endpoint
(`segmento='principal'` + `is_active=true` + `lost_reason IS NULL`, `leads-by-period/route.ts:96-106`):

| Janela | Leads no recorte do gráfico | Passa de 1000? |
|---|---|---|
| 7d | 111 | não |
| 30d | 264 | não |
| 90d | **612** | **não** |
| Tudo | 612 | não |

De onde vinham os 1.182/1.650: de um recorte **diferente**, sem `is_active` e sem
`lost_reason IS NULL` (só `segmento`), que dá **1.650 em 90d**. Esse é o recorte do
`/api/analytics/executive` — que **por isso já é paginado** (`executive/route.ts:26-29`, comentário
explícito: *"PostgREST corta em 1000 linhas → paginamos com .range()"*). Os dois endpoints contam
coisas diferentes; a anotação misturou os dois.

**Contraprova de que o gráfico está certo hoje:** o `Total` que ele exibe (612 em 90d) é
**idêntico** ao KPI `new_leads` da `get_analytics_summary_ranged` (612). O gráfico é consistente
com o resto do analytics — não há bug semântico.

### O que a medição mostrou de verdade — o item ATIVO é outro

O dropdown de Origem do gráfico (`leads-chart.tsx:37-41`) tem **5 opções hardcoded**. As origens
que os leads do próprio gráfico realmente têm, medidas em prod:

| Origem nos dados | Leads | Selecionável hoje? |
|---|---|---|
| `meta_ads` | 285 | ✅ |
| **`other`** | **188** | ❌ |
| `whatsapp_click_to_ad` | 57 | ✅ |
| **`broker_sponsored`** | **55** | ❌ |
| `walk_in` | 10 | ✅ |
| **`website`** | **8** | ❌ |
| `whatsapp_organic` | 5 | ✅ |
| **`referral`** | **3** | ❌ |
| `(null)` | 1 | — |

**254 de 612 leads (41,5%) estão em origens que ninguém consegue filtrar.** `other` sozinho é 31%
da base — e pela convenção de cadastro manual (`SOURCE_OPTIONS`, `constants.ts:91`) `other` é
"Carteira Própria / Ação Externa", ou seja, um canal de verdade, não lixo.

Pior: existe **fonte canônica** para esses rótulos — `SOURCE_LABELS_SHORT` (`constants.ts:32`), cujo
próprio comentário diz *"o rótulo bate em TODAS as telas (analytics, badges de lead, PDF) porque
todas leem este mapa"*. O dropdown é uma **cópia de 4 entradas** dele, com um rótulo que já
divergiu (`walk_in` = "Manual" no mapa, "Manual" na cópia — ainda igual, por sorte). É o erro que
já custou caro duas vezes neste repo: reproduzir valor em vez de importar a fonte.

---

## Os três itens

### Item 1 — O filtro de Origem passa a oferecer o que existe (o ativo, mede 41,5%)

- O dropdown deixa de ter lista literal e passa a **derivar das origens presentes no período**,
  rotulando por `SOURCE_LABELS_SHORT` (importar a fonte — **nunca** reproduzir o mapa).
- A API já devolve `byProperty` por período; ela **não** devolve as origens presentes. Precisa
  expor isso (ex.: `sources: Record<string, number>` no `summary`), senão o cliente não tem como
  saber o que oferecer sem um fetch próprio.
- Origem sem rótulo no mapa → cai no `?? k` (padrão já usado em `analytics-report-data.ts:127`),
  nunca desaparece da lista.
- `(null)` (1 lead): decidir entre omitir ou oferecer como "Sem origem". **Preferência do @sm:**
  omitir — 1 lead não justifica opção nova; registrar como nota se aparecer em volume.

### Item 2 — Paginar o `leads-by-period` ANTES de ele mentir (preventivo, com reuso)

612 de 1000 é **61% do teto**, e o corte do PostgREST é **silencioso**: quando passar, o gráfico
simplesmente mostra menos e ninguém percebe. Não é bug hoje; é bug marcado para acontecer.

- **REUSE > CREATE:** o padrão já existe em `executive/route.ts:55-77` (`fetchLeads` com
  `PAGE = 1000`, laço `.range(offset, offset + PAGE - 1)`, `break` quando `rows.length < PAGE`).
  Ele é function-scoped (fecha sobre `supabase`, `appUser.org_id`, `propertyId`), então **não é
  importável como está**.
- Extrair para helper compartilhado (ex.: `lib/analytics/fetch-all-leads.ts`) recebendo o client,
  as colunas e os filtros; os **dois** endpoints passam a consumir. Mesma jogada da 75-267 com o
  `OpeningTemplateMenu`: extrair, não copiar.
- ⚠️ Os dois recortes são **legitimamente diferentes** (o executive não filtra `is_active`/
  `lost_reason`; o leads-by-period sim, e não filtra `org_id`, confiando na RLS). O helper tem de
  aceitar os filtros como parâmetro — **unificar os recortes NÃO é escopo desta story** e mudaria
  número em tela.

### Item 3 — `lost_reason` livre sem grupo para de entrar pelo PATCH (preventivo, contrato)

`PATCH /api/leads/[id]` valida `lost_reason_grupo` contra whitelist (`route.ts:113-115`), mas
**aceita `lost_reason` sozinho**, sem exigir grupo. Quem escrever assim cria motivo não
classificado, desfazendo a estruturação da 75-264 um lead por vez.

**Incidência ATIVA medida: zero.** Em prod há 986 leads com motivo sem grupo, mas são **legado**
(anteriores à 75-264 de hoje de manhã) — os 10 com grupo são todos de hoje, o modal está
funcionando. O único candidato a "novo sem grupo" que apareceu na varredura é falso positivo:
lead criado 12/07, texto "nao responde" antigo, e o que mudou hoje foi `last_contact_at` (alguém
falou com ele) — `updated_at` sobe em qualquer update.

- Regra: se `lost_reason` vier preenchido **e** o lead não tiver grupo, exigir `lost_reason_grupo`
  no mesmo PATCH → 400. Limpar (`lost_reason: null`) segue livre.
- Rota é usada por muitos caminhos; a guarda precisa vir com teste por caminho, não confiança.

---

## Acceptance Criteria

- [ ] **AC1** — o dropdown de Origem do "Leads por Período" oferece **todas** as origens presentes
      no período, rotuladas por `SOURCE_LABELS_SHORT`; com os dados de prod de hoje, `other`,
      `broker_sponsored`, `website` e `referral` passam a ser selecionáveis (os 254 leads /41,5%
      hoje inalcançáveis).
- [ ] **AC2** — nenhuma lista de origens duplicada: o componente **importa** a fonte; origem fora
      do mapa aparece com a própria chave, nunca desaparece.
- [ ] **AC3** — selecionar uma origem antes inalcançável filtra o gráfico corretamente (barras +
      `Total` + `Média/dia` coerentes com a origem escolhida).
- [ ] **AC4** — `leads-by-period` devolve o conjunto COMPLETO da janela, sem o teto de 1000: com um
      recorte que passe de 1000 (medir com `is_active`/`lost_reason` afrouxados em ambiente de
      teste, ou seed), o total não trava em 1000.
- [ ] **AC5** — o laço de paginação vive em **um** helper consumido pelos dois endpoints; o
      `executive` mantém comportamento **idêntico** (mesmo recorte, mesmos números).
- [ ] **AC6** — `PATCH /api/leads/[id]` com `lost_reason` preenchido e sem grupo (nem no payload,
      nem já no lead) responde **400**; com grupo válido, grava; `lost_reason: null` limpa sem
      exigir grupo.
- [ ] **AC7 — sem regressão de número em tela:** com os dados de prod atuais, `Total` do gráfico
      em 90d continua **612** e segue igual ao `new_leads` da RPC. Se esse número mudar, a story
      quebrou algo.
- [ ] **AC8** — zero migration. Nada de banco nesta story.

---

## Dev Notes

- ⚠️ **SESSÃO PARALELA ATIVA** (worktree `75-268-nicole-agendamento-hora`, branch
  `feat/75-268-nicole-agendamento-hora-pelada`, do próprio Marcos). Esta story trabalha em
  `.claude/worktrees/75-269-higiene-analytics` e **não pode** tocar arquivos de agendamento da
  Nicole. Ver [[feedback-duas-sessoes-mesmo-worktree]].
- 🔑 `SOURCE_LABELS_SHORT` (`constants.ts:32`) é a fonte para **rótulo de origem em analytics**.
  `SOURCE_OPTIONS` (`constants.ts:91`) é para **cadastro manual** — recorte diferente e menor, NÃO
  serve de fonte para o filtro. Confundir os dois reintroduziria o bug com outra cara.
- 🔥 O arquivo `lib/constants.ts` foi mexido hoje pela 75-266 (`LOST_REASON_ALL_GROUP_LABELS`) e
  já está na main — sem colisão, mas conferir `git log -1` do arquivo antes de editar.
- O `leads-chart.tsx` monta os params do fetch em `:141`; o `summary` novo precisa entrar no
  contrato de resposta sem quebrar o `PeriodEntry` existente.
- `analytics-report-data.ts` também lê origens (`:127`, `:241`) — se o PDF passar a divergir do
  gráfico, é regressão da convenção "relatório segue a tela" ([[feedback-relatorio-segue-tela]]).

## Medido e deliberadamente FORA de escopo

- **57 leads em etapa Perdido SEM `lost_reason`** → não entram no KPI de Perdidos (que conta por
  presença de texto). Isso é a **cobertura já declarada** pela 75-264 (5,5% sem motivo, 92%
  classificado) — comportamento conhecido e documentado, não bug novo.
- **1 lead com `lost_reason` FORA de etapa Perdido** → é o follow-up **REL-003** (arrastar para
  fora de Perdido no Kanban não limpa o motivo). 1 caso em 996; segue sem story própria.
- Filtro por corretor no analytics e seção de Motivos de Perda no PDF — próximos itens do backlog
  decidido em 04/08, cada um com sua story.
- Unificar os recortes de `executive` × `leads-by-period` (mudaria números em tela).

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-04 | 0.1 | Story criada. **As 3 premissas do backlog foram medidas em prod antes de escrever e a prioridade se inverteu:** o item da paginação NÃO é bug ativo (612/1000 no recorte real do endpoint; os 1.182/1.650 da anotação eram de outro recorte, o do executive — que já é paginado), e o item do dropdown de Origem é que tem impacto hoje (254 de 612 leads = 41,5% em origens não selecionáveis). O item do PATCH tem incidência ativa ZERO (os 986 sem grupo são legado; o único candidato era falso positivo de `updated_at`). Numeração: story renumerada 267→268→269 por sessões paralelas. | @sm (River) |

---

## Validação @po (Pax) — 2026-08-04

**Veredito: GO condicional — 9/10.** Todas as referências de código foram conferidas no worktree
(`leads-by-period/route.ts:96-106`, `executive/route.ts:26-29` e `:55-77`, `leads-chart.tsx:37-41`
e `:141`, `constants.ts:32` e `:91`, `leads/[id]/route.ts:113-115`) e os números de prod foram
reconferidos por query independente. Ponto que custou 1: **AC4 não é testável do jeito que está
escrito** (ver R1).

Checklist: título ✓ · descrição ✓ · AC testáveis ✓ (menos o AC4) · escopo IN/OUT ✓ (a seção
"Medido e deliberadamente FORA de escopo" é exemplar) · dependências ✓ · estimativa ✓ ·
valor de negócio ✓ · riscos ✓ · Definition of Done ✓ · alinhamento com o Epic 75 ✓.

**Mérito que quero registrar:** o @sm mediu as três premissas antes de escrever e **derrubou a
que estava errada**, invertendo a prioridade. Se a story tivesse sido escrita a partir da anotação,
o esforço iria para paginar um endpoint que não está quebrado, enquanto 41,5% dos leads seguiriam
sem filtro. É o comportamento certo: anotação de backlog é hipótese, não fato.

### R1 (bloqueante para o AC4) — o AC pede um teste impossível hoje
"Medir com filtros afrouxados ou seed" não define nada e o dev DB tem drift grande (não serve).
**Reescrever o AC4 para o que dá para provar:** teste unitário do helper de paginação com um fake
client que devolve 1000 + 1000 + 137 (três páginas) e assertar 2.137 linhas e 3 chamadas, mais o
caso de borda de múltiplo exato de 1000 (1000 + 0 → 2 chamadas, sem laço infinito). Isso testa a
lógica que importa sem depender de volume real.

### R2 (muda o AC6) — o desenho certo é REMOVER, não validar
Varredura do @po: **nenhum caller legítimo faz PATCH de `lost_reason` em `/api/leads/[id]`**. As
escritas reais passam por `/api/leads/[id]/mark-lost` (`route.ts:54-55`, manda motivo **e** grupo)
e `/api/leads/bulk` (`leads-bulk-table.tsx:88-91`, manda `lost_reason_grupo` sempre e o texto só
como observação opcional); `stage/route.ts:71` e `bulk/route.ts:52,64` apenas **limpam**
(`= null`). Ou seja, `lost_reason` no `allowedFields` do PATCH é **capacidade vestigial**.
**Preferir tirar `lost_reason` da whitelist** a adicionar 400 condicional: fecha a porta em vez de
vigiá-la, e é menos código.
⚠️ Condição: o @dev tem de confirmar zero callers **incluindo caminhos de automação** (agente
Nicole, crons, scripts) antes de remover. Se achar algum, cai para o 400 condicional do AC6
original. Manter `lost_reason_grupo` na whitelist (não avaliei os callers dele; fora de escopo).

### R3 (não bloqueante) — o `(null)` do dropdown
Concordo com omitir 1 lead sem origem. Mas o `summary.sources` da API **deve** contar o `(null)`
numa chave própria (ex.: `"__sem_origem__"`) em vez de descartar, senão a soma das origens não
fecha com o `Total` e alguém vai caçar esse 1 de diferença depois.

### R4 (não bloqueante) — proteger o AC7 com número, não com intenção
O AC7 diz "continua 612". Esse número **muda com o tempo** (base cresce). Reformular como
invariante: *"`Total` do gráfico ≡ `new_leads` da RPC para a mesma janela"* — é a propriedade que
importa e não expira. O 612 fica como a medição do dia, no corpo da story.

**Status: Draft → Ready.**

| 2026-08-04 | 0.2 | Validação @po: GO condicional 9/10 → Status Ready. R1 reescreve o AC4 (teste do helper com fake client de 3 páginas, em vez de "seed"); R2 muda o AC6 — varredura mostrou ZERO callers legítimos de `lost_reason` no PATCH, então o desenho certo é REMOVER da whitelist, com fallback para o 400 se o @dev achar caller de automação; R3 pede chave própria para `(null)` na soma; R4 troca o "612" do AC7 pelo invariante `Total ≡ new_leads`. | @po (Pax) |

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Data:** 2026-08-04 · **Modo:** YOLO

### Decisões de implementação

1. **R2 do @po CONFIRMADO e aplicado — `lost_reason` REMOVIDO da whitelist**
   (`leads/[id]/route.ts`). Varredura em `packages/` + `scripts/` (excluindo `.next/`) por
   escritores de `lost_reason`: `mark-lost/route.ts:54-55` grava motivo **E** grupo;
   `leads-bulk-table.tsx:88-91` manda `lost_reason_grupo` sempre (texto só como observação) e vai
   para `/api/leads/bulk`, não para o PATCH; `stage/route.ts:71`, `bulk/route.ts:52,64` e
   `reativar/route.ts:151` apenas **limpam** (`= null`). **Zero callers de automação** (nada em
   `api/cron/`). Porta fechada em vez de vigiada — menos código que o 400 condicional do AC6.
2. **R1 do @po aplicado — o AC4 virou teste de unidade** (`fetch-all-leads.test.ts`): fake client
   que devolve 1000+1000+137, assertando 2.137 linhas e 3 `.range()` com os offsets exatos. Mais
   o caso que o @po pediu explicitamente: múltiplo EXATO do teto (2000) pede 3 páginas — a 3ª
   vem vazia e encerra, provando que não há laço infinito. Também: 612 (o caso de prod hoje) faz
   1 chamada só, `data: null` não explode, e erro na 2ª página aborta em vez de entregar meia
   janela.
3. **Helper recebe CONSTRUTOR de query, não filtros** (`fetchAllLeads(buildQuery)`). Foi a forma
   de atender o alerta da story de que os dois recortes são legitimamente diferentes: cada rota
   monta o próprio `select`/filtros e o helper só cuida da paginação. Também resolve um detalhe
   do PostgREST: um builder não se reusa depois de executado, então precisa ser refeito por
   página — daí ser função. Tipado por `RangeableQuery<T>` (só `.range()`) em vez de
   `PostgrestFilterBuilder`, o que é o que torna o teste com fake possível.
4. **[AUTO-DECISION] O filtro de Origem saiu da query e passou para JS.** A story não dizia como.
   Sem isso não há como saber as origens da janela (a query filtrada só devolve a origem
   escolhida) e o dropdown colapsaria para 1 opção ao selecionar. Não é novidade no arquivo: o
   filtro de **empreendimento já era aplicado em JS** (`:137`), com a janela inteira já em
   memória — segui o padrão do próprio endpoint. Comportamento preservado: o `continue` do
   filtro de origem fica **antes** do `byProperty`, como o filtro no banco fazia.
5. **`sources` conta a janela INTEIRA, ignorando os filtros ativos.** Se contasse o conjunto
   filtrado, escolher uma origem apagaria as outras do dropdown e não haveria caminho de volta.
6. **R3 do @po aplicado:** lead sem `source` entra em `SEM_ORIGEM_KEY` (`__sem_origem__`) — a soma
   das origens fecha com o total da janela — mas **não** é oferecido como opção.
7. **R4 do @po aplicado:** o AC7 agora é o invariante `Total ≡ new_leads`, não o número 612 (que
   envelhece). Verificação de raciocínio: com nenhuma origem selecionada o `count` é idêntico ao
   de antes, então o `Total` não muda — o 612 medido hoje continua valendo.
8. **Guarda no `<select>`:** se a origem selecionada não estiver nas opções (primeiro paint, erro
   de fetch, ou resposta de deploy antigo sem `sources`), ela é acrescentada — senão o `<select>`
   renderizaria em branco e pareceria que o filtro se perdeu. `Summary.sources` é opcional pelo
   mesmo motivo.
9. **`PAGE` no `executive` preservado** apontando para `LEADS_PAGE_SIZE`: ele ainda serve ao
   `.limit(PAGE)` de `appointments` (:91). ⚠️ Aquele `.limit(1000)` é **teto, não paginação** —
   registrado para o @qa como observação, fora do escopo desta story.

### Validações

- `npm run type-check` — **8/8 tasks, 0 erros**.
- `npx vitest run` — **132 arquivos / 1561 testes verdes** (+19 novos em 2 suítes).
- `npm run lint` — **0 erros**; 18 warnings, todos pré-existentes na main.
- Zero migration (AC8). Nenhum arquivo de agendamento da Nicole tocado (fronteira da sessão
  paralela 75-268 respeitada).

### File List

| Arquivo | Mudança |
|---|---|
| `packages/web/src/lib/analytics/fetch-all-leads.ts` | **NOVO** — laço de paginação do PostgREST, extraído do executive |
| `packages/web/src/lib/analytics/fetch-all-leads.test.ts` | **NOVO** — 9 casos (3 páginas, múltiplo exato, 612, vazio, null, erro na 1ª e na 2ª página, pageSize, 1 build por página) |
| `packages/web/src/lib/analytics/sources-presentes.ts` | **NOVO** — `opcoesDeOrigem` + `labelDaOrigem` + `SEM_ORIGEM_KEY`, lendo `SOURCE_LABELS_SHORT` |
| `packages/web/src/lib/analytics/sources-presentes.test.ts` | **NOVO** — 10 casos, com a distribuição real de prod de 04/08 |
| `packages/web/src/app/api/analytics/leads-by-period/route.ts` | paginação + `summary.sources` + filtro de origem em JS |
| `packages/web/src/app/api/analytics/executive/route.ts` | consome o helper; `PAGE` → `LEADS_PAGE_SIZE`; recorte intocado |
| `packages/web/src/components/analytics/leads-chart.tsx` | lista literal de origens REMOVIDA → `sourceOptions` derivado |
| `packages/web/src/app/api/leads/[id]/route.ts` | `lost_reason` fora da whitelist do PATCH (R2) |

### Pendências para @qa / runtime

- AC1/AC3 pedem **olho na tela**: o dropdown listando as 8 origens e o gráfico filtrando por
  `other`/`broker_sponsored` corretamente. Coberto por unidade na lógica, não no render.
- AC5 (executive idêntico) foi verificado por leitura do diff — o recorte não mudou —, mas a
  Visão Executiva merece uma conferida visual pós-deploy.

| 2026-08-04 | 0.3 | Implementação @dev: helper de paginação extraído (`fetch-all-leads.ts`) e consumido pelos DOIS endpoints; `summary.sources` novo; dropdown de Origem derivado dos dados via `SOURCE_LABELS_SHORT` (lista literal removida); `lost_reason` fora da whitelist do PATCH (R2 do @po, zero callers confirmado). R1/R3/R4 do @po aplicados. tsc 0 erros, lint 0 erros novos, vitest 132/1561 (+19). Status Ready → InReview. | @dev (Dex) |

---

## QA Results

### Review Date: 2026-08-04 · Reviewed By: Quinn (Test Architect)

### Code Quality Assessment

Boa entrega, e o mérito maior é anterior ao código: **as três premissas foram medidas antes de
serem implementadas, e a errada foi descartada em voz alta**. Reconferi por query independente e
confirmo — 612 leads em 90d no recorte real do endpoint, 61% do teto. Se ninguém tivesse medido,
o trabalho iria para paginar um endpoint que não está quebrado enquanto 41,5% dos leads seguiam
sem filtro. Anotação de backlog é hipótese; esta story tratou como hipótese.

Duas coisas que verifiquei especificamente porque são onde uma extração dessas quebra em silêncio:
(1) a **ordem** do `continue` do filtro de origem — ficou antes do `byProperty`, reproduzindo o
que o filtro no banco fazia, então o tooltip de empreendimento continua respeitando a origem
selecionada; (2) o **diff do executive** — só o laço saiu, `select`/`org_id`/`segmento`/janela/
`.order()`/filtro de empreendimento idênticos, e o `PAGE` foi preservado porque ainda serve ao
`.limit()` de appointments. `RangeableQuery` (só `.range()`) no lugar do tipo do PostgREST foi a
escolha que tornou o helper testável com fake — é o que separa "testado" de "confia em mim".

### Refactoring Performed

- **File**: `packages/web/src/app/api/leads/[id]/route.ts`
  - **Change**: rejeição explícita `if ("lost_reason" in body)` → 400 apontando o `mark-lost`
  - **Why**: tirar o campo da whitelist **não bastava**. `buildUpdatePayload`
    (`api-utils.ts:10-17`) itera a lista permitida e descarta o resto **em silêncio**: um
    `PATCH {lost_reason, interest_level}` responderia 200 tendo perdido o motivo. A porta estava
    fechada, mas quem batia não recebia resposta.
  - **How**: agora o campo é ingravável **e** audível. Contrato explícito em vez de descarte mudo.

### Compliance Check

- Coding Standards: ✓ · Project Structure: ✓ (helpers puros em `lib/analytics/`)
- Testing Strategy: ✓ na lógica, ✗ no render (ver gaps) · All ACs Met: ✗ AC1/AC3 pendentes de tela

### Improvements Checklist

- [x] QA-001 corrigido na revisão (400 explícito no PATCH)
- [x] Premissa da paginação reconferida por query independente
- [x] Ordem do filtro de origem × `byProperty` verificada (preserva comportamento)
- [x] Diff do executive conferido — recorte intocado
- [ ] **AC1/AC3 — abrir a tela**: dropdown com as 8 origens; filtrar por `other` (188 leads)
- [ ] Conferir que a Visão Executiva não mudou número nenhum (AC5)
- [ ] QA-002: tornar a whitelist testável (trava a ausência de `lost_reason`)
- [ ] OBS-001: appointments no executive usa `.limit(1000)` — teto, não paginação. Story própria.

### Security Review

Sem achados. `requireRole` intocado; o item 3 **fecha** superfície de escrita. `sources` é
contagem agregada da mesma janela que o usuário já via — nenhum dado novo exposto.

### Performance Considerations

O leads-by-period pode fazer N requisições em vez de 1, mas só acima de 1000 (hoje: 1 página).
`sources` é um contador dentro do laço que já existia. O select ganhou 1 coluna.

### Gate Status

Gate: **CONCERNS** → `docs/qa/gates/75.269-higiene-analytics.yml`
(nenhum HIGH; CONCERNS por AC de render sem cobertura + a guarda do QA-001 sem teste)

### Recommended Status

**✗ Changes Required — só validação de tela.** O código está aprovado. Falta olhar o dropdown e
o filtro funcionando, e confirmar que a Visão Executiva não mudou número. Quem decide o status
final é o dono da story.

| 2026-08-04 | 0.4 | Gate @qa: **CONCERNS, nenhum HIGH**. 1 fix aplicado na revisão (QA-001: remover da whitelist não bastava — `buildUpdatePayload` descarta campo não permitido em SILÊNCIO, então `PATCH` com `lost_reason` + outro campo dava 200 perdendo o motivo; agora 400 explícito). Premissa da paginação reconferida por query independente (612/1000, 61% do teto). Registrados: QA-002 (guarda sem teste, rota sem harness), QA-003 (`sources` ignora filtro de empreendimento — decisão de UX), QA-004 (`?source=lixo` agora dá gráfico vazio em vez de 500), OBS-001 (appointments no executive usa `.limit(1000)` = teto, não paginação — story própria). | @qa (Quinn) |
