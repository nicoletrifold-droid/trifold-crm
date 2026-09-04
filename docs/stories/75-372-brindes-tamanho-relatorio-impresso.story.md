# Story 75-372 — Brindes: tamanho e quantidade por item no relatório impresso

**Status:** Ready for Review
**Tipo:** Melhoria (ticket de Suporte)
**Epic:** Controle de Brindes (29)
**Complexidade:** S

## Contexto

Ticket da Samara (Suporte, 03/09/2026): *"por favor, será que consegue colocar no
relatorio tipo o tamanho das camisetas e a quantidade de cada? eu fiz manual, mais seria
legal, talvez tipo filtrar por tamanho..."* — motivo declarado: "não é urgente, só um
ponto de melhoria mesmo".

O relatório em questão é o HTML de impressão "Controle de Brindes — Lista de
Destinatários" (`print-modal.tsx`), hoje com 6 colunas fixas: `#`, `Obra`, `Tipo`,
`Nome`, `Endereço`, `Assinatura / Conferência`. Não há nenhuma menção a tamanho.

**O dado já existe e está estruturado — não há migração nesta story.**

- `brindes_tipos` (mig `036_brindes_tipos.sql`) tem `nome`, `descricao`, `tamanho`, `cor`,
  `ativo`.
- Mig `165_brindes_tipos_unicidade_variacao.sql` trocou `UNIQUE(org_id, nome)` por
  `UNIQUE NULLS NOT DISTINCT (org_id, nome, tamanho, cor)` — exatamente para permitir
  "Camiseta" em P/M/G/GG. Tamanho é atributo de primeira classe do item, não do nome.
- `brindes_destinatarios.brinde_tipo_id` → FK para `brindes_tipos` (mig
  `040_brinde_tipo_id_destinatario.sql`), nullable, `ON DELETE SET NULL`.
- `brindes_entregas.brinde_tipo_id` também existe, mas está **zerado** (0 registros) —
  a fonte real do tamanho hoje é o destinatário, não a entrega.

**Restrição de desenho que a story precisa assumir e não esconder:** medição real em
produção (04/09/2026) mostra **200 destinatários, dos quais só 36 têm
`brinde_tipo_id` preenchido** (34 da obra SEDE, 1 VIND 703, 1 YARDEN) — os outros 164
são pais/mães de clientes de VIND/YARDEN, sem brinde definido. A coluna nova sai
**vazia (`—`) para ~82% da lista**, e o resumo de quantidades precisa dizer isso sem
mentir sobre o total (ver AC5). **Não há backfill nesta story** — preencher
`brinde_tipo_id` dos 164 é trabalho de cadastro do usuário, fora de escopo.

Catálogo cadastrado hoje (referência para quem for testar manualmente): `Camiseta`
P·3 M·3 G·11 GG·3 EXGG·2 / `Baby look` P·2 M·7 G·2 GG·3.

## Escopo aprovado (3 itens — não ampliar)

1. Coluna **"Brinde / Tamanho"** no relatório impresso, por destinatário.
2. **Resumo de quantidades por item+tamanho** no relatório — agregado sobre os
   registros já carregados pela chamada existente, **sem query extra**.
3. **Filtro por tamanho** — na barra de filtros e no parâmetro da API, refletido na
   linha "Filtros:" do cabeçalho e respeitando o escopo "Filtros aplicados" vs "Todos
   os registros" do `PrintModal`.

Sem migration. Sem mudança de permissão/RLS.

## Acceptance Criteria

1. **AC1** — `GET /api/brindes/destinatarios` (paginado e `export=1`) embute o
   relacionamento com `brindes_tipos` via `brinde_tipo_id`: cada registro do array
   `data` ganha `brindes_tipos: { nome: string; tamanho: string | null; cor: string |
   null } | null` (mesmo shape já usado em `brindes_entregas` — `entregas/route.ts:16`).
   Todos os campos hoje retornados continuam presentes; nenhum consumidor existente
   quebra.
2. **AC2** — Novo parâmetro de query `tamanho` filtra a listagem pelos destinatários
   cujo `brindes_tipos.tamanho` seja exatamente igual ao valor informado (comparação
   simples, mesmo texto livre cadastrado no catálogo). Destinatários sem
   `brinde_tipo_id` **não aparecem** quando esse filtro está ativo. Sem o parâmetro, o
   comportamento atual é preservado — inclusive os 164 sem brinde continuam listados.
3. **AC3** — A barra de filtros (`BrindesFilterBar`) ganha um select **"Tamanho"**,
   com opções = valores distintos e não vazios de `brindes_tipos.tamanho` do catálogo
   já carregado pela tela (a mesma lista de `tipos` que `BrindesTable` já recebe e
   mantém em estado). Trocar o valor refaz a busca da tabela e reseta a paginação para
   a página 1 — mesmo padrão dos demais filtros (`obra_nome`, `tipo`, `nome`, `cidade`,
   `estado`).
   **Ordem das opções (determinística, não alfabética):** primeiro os valores da
   sequência conhecida `P, M, G, GG, EXGG` que existirem no catálogo, nessa ordem;
   depois qualquer outro valor cadastrado, em ordem alfabética. (Alfabético puro daria
   "EXGG, G, GG, M, P" no select, que é ilegível para quem escolhe tamanho de camiseta.)
   **Consequência aceita:** como a fonte é o catálogo, o select pode oferecer um tamanho
   que hoje nenhum destinatário usa — selecionar esse tamanho traz zero registros e a
   tabela mostra "Nenhum destinatário encontrado". Isso é comportamento correto, não
   defeito (ver decisão 2 revisada pelo @po).
4. **AC4** — No HTML de impressão (`buildPrintHtml`), cada linha ganha uma **célula
   própria** (`<td class="brinde">`) — não um `<span>` inline dentro da célula do nome,
   como são hoje `cargo` e `observacao`. Conteúdo: `"{brindes_tipos.nome} ·
   {brindes_tipos.tamanho}"` quando há `brinde_tipo_id` e tamanho preenchido (omitir o
   `· tamanho` se `tamanho` for nulo); `"—"` quando `brinde_tipo_id` é nulo **ou** o
   embed `brindes_tipos` vier nulo. O `<th>` correspondente é "Brinde / Tamanho".
   **Posição:** é a 6ª coluna, imediatamente antes de `statusCell` — que continua sendo
   a última coluna nos dois modos do relatório ("Assinatura / Conferência" sem data
   selecionada, "Status" com data selecionada).
   **Largura:** CSS próprio `.brinde { width: 76px; font-size: 8.5pt; }` (faixa aceitável
   70–90px). Não introduzir largura fixa nova em `.endereco`.
   **Fonte do dado:** sempre `brindes_destinatarios.brinde_tipo_id` (o brinde *previsto*
   no cadastro), **nunca** `brindes_entregas.brinde_tipo_id` — mesmo quando há data
   comemorativa selecionada e `entregasMap` está populado. Medição de 04/09/2026:
   `brindes_entregas` tem zero registros com `brinde_tipo_id`, então hoje as duas fontes
   não divergem; a escolha fica registrada aqui e no bloco Riscos para o dia em que
   divergirem.
5. **AC5** — O **cabeçalho** do relatório (bloco `.cabecalho`, imediatamente após a
   linha "Filtros:", uma única vez no documento — não no rodapé, não repetido por página)
   mostra um resumo agregado de quantidades, calculado em cliente sobre o array `records`
   já trazido pela mesma chamada (nenhuma query adicional).
   Uma entrada por combinação `nome + tamanho` encontrada nos registros (ex.: "Camiseta M:
   3"), mais uma entrada **separada** "Sem brinde definido: N" para os que não têm
   `brinde_tipo_id`. Essa entrada nunca é contada como se fosse um tamanho, e **a soma de
   todas as entradas é exatamente `records.length`** (invariante verificável).
   **Formato:** entradas em linha corrida separadas por `" | "` (ex.: `Resumo: Camiseta G:
   4 | Camiseta M: 3 | Baby look M: 1 | Sem brinde definido: 164`), fonte 8pt, para não
   consumir várias linhas da folha A4 quando o catálogo crescer. "Sem brinde definido"
   sempre por último.
6. **AC6** — Quando o filtro de tamanho está ativo, a linha "Filtros:" do cabeçalho do
   relatório mostra "Tamanho: {valor}" (mesmo padrão de `describeFilters()` para os
   demais filtros), e o filtro respeita a escolha "Filtros aplicados" vs "Todos os
   registros" do `PrintModal` (só entra nos parâmetros da chamada quando `scope ===
   "filtered"`).
7. **AC7 — Sem regressão:** gerar o relatório no cenário real de hoje (maioria sem
   `brinde_tipo_id`) produz a coluna nova toda com "—" para esses casos e o resumo
   mostrando majoritariamente "Sem brinde definido: N", sem erro e sem quebrar o
   layout de impressão A4. As 6 colunas e os 5 filtros existentes continuam
   funcionando exatamente como antes quando o filtro de tamanho não é usado.
   **Critério objetivo de "não quebrou o A4":** na pré-visualização de impressão em A4
   retrato, nenhuma coluna sai da folha e nenhuma célula fica com texto cortado — o
   Endereço pode ganhar mais quebras de linha (é esperado, ver Riscos), mas o texto
   continua legível e a coluna de assinatura/status continua inteira na folha. A evidência
   (print da pré-visualização ou PDF) vai no Dev Agent Record.

## Tasks / Subtasks

- [x] **T1** — `api/brindes/destinatarios/route.ts`: select embutido
  `brindes_tipos(nome, tamanho, cor)`; parâmetro `tamanho` — usar `!inner` no embed
  **somente quando o parâmetro está presente** (para não excluir os sem brinde no caso
  default), com `.eq("brindes_tipos.tamanho", tamanho)`. Vale para o modo paginado e
  para `export=1`. (AC1, AC2)
- [x] **T2** — `_components/types.ts`: `Destinatario` ganha o campo `brindes_tipos`
  (mesmo shape de `Entrega.brindes_tipos`, já existente no arquivo). (AC1)
- [x] **T3** — `_components/brindes-filter-bar.tsx`: `BrindesFilters` ganha `tamanho:
  string`; novo select "Tamanho" recebendo `tamanhoOptions: string[]` via prop; `clear()`
  e o cálculo de `hasFilters` incluem o novo campo. (AC3)
- [x] **T4** — `_components/brindes-table.tsx`: `EMPTY_FILTERS` ganha `tamanho: ""`;
  `tamanhoOptions` calculado (`useMemo`) a partir de `tipos` (distinct, não-vazio,
  ordenado) e passado para `BrindesFilterBar` e `PrintModal`; `fetchDestinatarios`
  inclui `tamanho` nos `params` quando presente. (AC2, AC3)
- [x] **T5** — `_components/print-modal.tsx`: **nenhuma prop nova** — `filters` já é
  passado por `BrindesTable` e, com `tamanho` dentro de `BrindesFilters` (T3), o
  `PrintModal` recebe o valor de graça; não adicionar `tipos`/`tamanhoOptions` aqui (o
  modal não renderiza select de tamanho, e prop não usada é erro de lint).
  `describeFilters()` ganha o rótulo `Tamanho: {valor}`; `handleGenerate()` inclui
  `tamanho` nos `params` quando `scope === "filtered"`; `buildPrintHtml` ganha a célula
  `.brinde` + o `<th>` e o bloco de resumo no cabeçalho (função pura de agregação,
  testável). (AC4, AC5, AC6, AC7)
- [x] **T6** — Verificação manual fim a fim, com as 5 evidências abaixo registradas no
  Dev Agent Record (AC2, AC5, AC7):
  1. Relatório sem filtro: coluna nova majoritariamente "—" e resumo com "Sem brinde
     definido: N" — e **N + soma das outras entradas == total de registros do rodapé**.
  2. Relatório com filtro de tamanho "M": só destinatários com Camiseta M / Baby look M;
     nenhum registro sem `brinde_tipo_id` na lista.
  3. **Contraprova do `!inner` + `count`:** com `tamanho=M` na chamada paginada, o `total`
     do JSON tem de bater com a quantidade de linhas realmente retornáveis (não com os 200
     do sem-filtro). Se `total` continuar 200, o `!inner` não está sendo aplicado.
  4. **Contraprova do default:** sem o parâmetro `tamanho`, `total` volta a 200 (os 164 sem
     brinde continuam listados) — prova de que o `!inner` é condicional.
  5. Pré-visualização A4 (print/PDF) com as 7 colunas + os 5 filtros antigos ainda
     funcionando.

## Fora do escopo

- Backfill de `brinde_tipo_id` para os 164 destinatários sem brinde (é cadastro,
  trabalho do usuário — não desta story).
- Coluna/filtro de tamanho no import CSV.
- Distinguir camiseta de baby look no filtro (o pedido foi "filtrar por tamanho";
  filtrar por *item* — nome do brinde — não foi pedido).
- Qualquer alteração em `brindes_entregas`/status de entrega — a story mexe só na
  listagem de destinatários e no relatório impresso.
- `destinatario-modal.tsx` — a seleção de `brinde_tipo_id` no cadastro já existe
  (Story 29.7) e não muda.

## Riscos

- A tabela de impressão tem CSS próprio (`print-modal.tsx`) — validar que a coluna e o
  bloco de resumo extras não empurram o layout para fora da A4 (mesmo cuidado já
  registrado na Story 75-227).
- **Aperto de largura medido (não é regressão, é consequência conhecida):** a folha A4
  retrato deixa ~178mm úteis (210mm − 8mm de `@page` × 2 − 8mm de `padding` do `body` × 2),
  ≈ 673px. Hoje as larguras fixas somam 290px (`num` 24 + `obra` 120 + `tipo` 36 +
  `assinatura` 110), sobrando ~383px para `nome` (min 140px) + `endereco`. Com a coluna
  nova de 76px, `endereco` cai para ~165px e passa a quebrar em mais linhas — as linhas
  ficam mais altas e o relatório pode ganhar páginas. Aceitável; o que **não** é aceitável
  é coluna saindo da folha ou texto cortado (AC7).
- **Filtro de tamanho pode retornar zero registros** — as opções vêm do catálogo e hoje só
  36 de 200 destinatários têm brinde definido. Lista vazia com um tamanho válido
  selecionado é comportamento esperado, não bug (decisão 2, revisada pelo @po).
- **Divergência futura entrega × cadastro:** `StatusBadge` já permite escolher o
  `brinde_tipo_id` no momento da entrega, e a tabela da tela mostra esse valor
  (`entrega.brindes_tipos`). O relatório impresso, por AC4, mostra o brinde do **cadastro**.
  Hoje não divergem (`brindes_entregas` com `brinde_tipo_id` = 0 registros); no dia em que
  alguém registrar entrega com tipo diferente, tela e impressão vão mostrar valores
  diferentes para a mesma pessoa. Fora de escopo aqui — anotado para não ser confundido com
  defeito no QA.
- `tamanho` em `brindes_tipos` é texto livre, não enum — o filtro é por igualdade
  exata do que está cadastrado no catálogo (ex.: "GG" ≠ "gg"). Isso é aceitável porque
  as opções do select vêm do próprio catálogo (nunca digitação livre do usuário).

## Dev Notes

**Padrão de embed já existe no módulo** — `api/brindes/entregas/route.ts:16` já faz
`.select("destinatario_id, status, observacao_entrega, entregue_em, brinde_tipo_id,
brindes_tipos(nome, tamanho, cor)")`. Reaproveitar a mesma sintaxe em
`destinatarios/route.ts`, hoje em `select("*", { count: "exact" })`.

**Padrão de `!inner` condicional já existe no projeto** para filtrar por coluna de
relação embutida (ex.: `units/[id]/route.ts`, `typologies/[id]/route.ts`,
`api/agent/action/confirm/route.ts`). Sem `!inner`, o Supabase/PostgREST faz left join
e não filtra por coluna do embed; com `!inner`, vira inner join e permite `.eq()` na
coluna do relacionamento — mas passa a **excluir** quem tem a FK nula. Por isso o select
precisa ser condicional: usar a variante `!inner` só quando `tamanho` está presente na
query string, senão o comportamento default (mostrar também os sem brinde) quebra.

**`BrindesTable` já guarda `tipos` em estado** (`tipos, setTipos` via `fetchTipos`), que
é atualizado quando o modal "Gerenciar Tipos" fecha — computar `tamanhoOptions` a partir
desse estado (não de uma nova chamada) garante que o filtro reflita o catálogo atual
sem esperar reload de página.

**Não é necessário mexer em `destinatario-modal.tsx`, `page.tsx` ou
`api/brindes/destinatarios/[id]/route.ts`** — a seleção/gravação de `brinde_tipo_id` já
funciona (Story 29.7); esta story só lê e agrega o que já está lá.

**Sobre a agregação do resumo (AC5):** o texto do ticket já dá a régua — "sem query
extra". A contagem deve ser feita client-side em cima do array já retornado por
`fetch(/api/brindes/destinatarios?export=1...)` dentro do `PrintModal`, no mesmo lugar
onde hoje se monta `records`. Chave de agrupamento sugerida:
`` `${brindes_tipos?.nome ?? ""}${brindes_tipos?.tamanho ? " " + brindes_tipos.tamanho : ""}` ``,
com um bucket à parte para `brinde_tipo_id === null`. Ordenação alfabética simples é
suficiente — não há necessidade de ordenar por P/M/G/GG (o catálogo é pequeno e a lista
de tamanhos é texto livre, não enum ordenável com segurança).

**Módulo não tem suíte de testes automatizados hoje** (nenhum `*.test.ts` em
`app/api/brindes/` nem em `app/dashboard/brindes/`) — mesma situação da Story 75-227,
que também não criou testes novos. Se o `@dev` optar por extrair a função de agregação
do resumo (AC5) como função pura fora do componente (recomendado, dado que é lógica
testável e não depende de DOM/HTML), pode cobrir com um teste unitário simples; não é
bloqueante para o AC.

## AUTO-DECISIONS — revisadas pelo @po (04/09/2026)

- **[AUTO-DECISION 1 — ACEITA]** Coluna nova entre "Endereço" e "Assinatura /
  Conferência" (fica: `#, Obra, Tipo, Nome, Endereço, Brinde/Tamanho,
  Assinatura/Conferência`).
  *Razão do @sm:* mantém a assinatura como última âncora visual da folha.
  *Parecer do @po:* aceita. O uso é folha impressa + assinatura na mão, e o tamanho do
  brinde é justamente a informação que a pessoa precisa ler **no instante antes** de
  entregar e colher a assinatura — coluna vizinha da assinatura é o lugar certo. A
  alternativa (logo depois do Nome) afastaria a informação do ponto de ação. Fixado no AC4
  que `statusCell` continua sendo a última coluna nos dois modos, com largura explícita.

- **[AUTO-DECISION 2 — ACEITA COM RESSALVA]** Filtro só por **tamanho** (não por
  item/nome), com opções vindas do catálogo (`brindes_tipos.tamanho` distinto), não dos
  tamanhos efetivamente atribuídos.
  *Parecer do @po:* aceita, e por um motivo mais forte do que "é mais simples": a tela só
  tem em mão a **página atual** (50 de 200 registros), então derivar as opções do que está
  "em uso" daria uma lista instável que muda de página para página — ou exigiria uma query
  agregada nova, que o item 2 do escopo proíbe ("sem query extra"). Catálogo é a única
  fonte estável disponível no cliente.
  *Ressalvas incorporadas ao AC3:* (a) ordem determinística `P, M, G, GG, EXGG` e depois o
  resto em ordem alfabética — alfabético puro produz "EXGG, G, GG, M, P", ilegível para
  tamanho de camiseta; (b) fica escrito que um tamanho pode retornar zero registros e que
  isso não é defeito.
  *Correção factual:* o catálogo medido hoje tem **5** valores distintos de tamanho
  (`P, M, G, GG, EXGG`) — não 8. Os números `P·3 M·3 G·11 GG·3 EXGG·2` / `P·2 M·7 G·2 GG·3`
  são quantidades por item, não tamanhos distintos.

- **[AUTO-DECISION 3 — ACEITA COM RESSALVA]** Resumo inclui linha explícita "Sem brinde
  definido: N".
  *Parecer do @po:* aceita. Com 164 de 200 sem cadastro, um resumo que só listasse
  "Camiseta G: 4 | Camiseta M: 3" somaria 7 num relatório de 200 linhas e o usuário
  concluiria que o relatório está errado. A linha explícita transforma o buraco de cadastro
  em informação visível — e é exatamente o número que a Samara precisa para saber quantas
  pessoas ainda faltam definir.
  *Ressalvas incorporadas ao AC5:* (a) o resumo é uma linha corrida separada por `" | "` no
  cabeçalho, não uma lista vertical — com 82% em um único bucket, uma lista vertical comeria
  altura da folha sem entregar nada; (b) "Sem brinde definido" sempre por último; (c) a
  invariante "soma das entradas == `records.length`" virou item de evidência no T6.

## Dev Agent Record

**Agente:** @dev (Dex) — modo YOLO, 04/09/2026
**Agent Model Used:** Claude Opus 5 (1M context)
**Branch:** `story/75-372-brindes-tamanho-relatorio` (commit único; o hash não é citado aqui
porque qualquer emenda no arquivo o invalidaria — confira com `git log -1` na branch)

### File List

Modificados:
- `packages/web/src/app/api/brindes/destinatarios/route.ts` — select condicional + filtro `tamanho` (T1)
- `packages/web/src/app/dashboard/brindes/_components/types.ts` — `Destinatario.brindes_tipos` (T2)
- `packages/web/src/app/dashboard/brindes/_components/brindes-filter-bar.tsx` — select "Tamanho" (T3)
- `packages/web/src/app/dashboard/brindes/_components/brindes-table.tsx` — `tamanhoOptions` + param (T4)
- `packages/web/src/app/dashboard/brindes/_components/print-modal.tsx` — coluna, resumo, rótulo do filtro (T5)
- `docs/stories/75-372-brindes-tamanho-relatorio-impresso.story.md` (este arquivo)

Criados:
- `packages/web/src/app/dashboard/brindes/_components/brinde-tamanho.ts` — funções puras
  `buildTamanhoOptions` (ordem do AC3) e `buildResumoBrindes` / `formatResumoBrindes` (AC5)
- `packages/web/src/app/dashboard/brindes/_components/brinde-tamanho.test.ts` — 10 testes
- `packages/web/src/app/api/brindes/destinatarios/route.test.ts` — 2 testes (contraprovas 3 e 4 do T6,
  automatizadas)

Não tocados, conforme escopo: `destinatario-modal.tsx`, `import-modal.tsx`, `page.tsx`,
`api/brindes/destinatarios/[id]/route.ts`, `brindes/entregas/*`. Zero migration, zero mudança de
RLS/permissão (`git status` confirma).

### Decisões IDS

| Arquivo | Decisão | Justificativa |
|---|---|---|
| `destinatarios/route.ts` | ADAPT | Embed copiado de `entregas/route.ts:16`; `!inner` + `.eq` na coluna do embed seguem `cron/billing-reminders/route.ts:126,137` e `billing/subscriptions/enrich-supabase.ts:102`. |
| `types.ts` | REUSE | `brindes_tipos` usa exatamente o shape já declarado em `Entrega.brindes_tipos`, no mesmo arquivo. |
| `brindes-filter-bar.tsx` | ADAPT | Select "Tamanho" clonado do select "Estado" (mesmas classes, mesmo handler, mesmo debounce-free pattern). |
| `brindes-table.tsx` | ADAPT | `params.set` e `useMemo` no padrão dos 5 filtros existentes. |
| `print-modal.tsx` | ADAPT | Célula/`<th>`/CSS no padrão das 6 colunas existentes. |
| `brinde-tamanho.ts` | CREATE | Busca por `TAMANHO_ORDER`/`SIZE_ORDER`/`tamanhoOptions`/`EXGG` em `packages/web/src` retornou **zero** resultados — não existe helper de ordenação de tamanho nem de agregação de brindes no repo. Extraído fora do componente porque o AC5 tem invariante verificável e `print-modal.tsx` é `"use client"` (intestável sem DOM). |

### Decisões autônomas (modo YOLO)

- **[AUTO-DECISION 4]** T4 dizia "passado para `BrindesFilterBar` e `PrintModal`", mas T5 e a
  instrução de escopo proíbem prop nova no `PrintModal`. → `tamanhoOptions` vai **só** para o
  `BrindesFilterBar`; o `PrintModal` lê `filters.tamanho`, que chega de graça porque `tamanho`
  entra em `BrindesFilters`. (Razão: prop não usada é erro de lint e o modal não renderiza select.)
- **[AUTO-DECISION 5]** Bucket "Sem brinde definido" é decidido pela **ausência do embed**
  (`!brindes_tipos`), não por `brinde_tipo_id === null`. (Razão: se a FK existisse e o embed viesse
  nulo, o registro cairia fora dos dois buckets e a soma do resumo passaria a mentir sobre o total —
  a invariante do AC5 deixaria de valer. Há teste dedicado a esse caso.)
- **[AUTO-DECISION 6]** As opções do select preservam o valor do catálogo **sem `trim()`** (só
  descartam valores em branco). (Razão: o filtro compara por igualdade exata no banco; normalizar na
  tela faria a opção deixar de casar com a linha.)
- **[AUTO-DECISION 8]** A margem inferior de `.filtros` foi de 8px para 2px e os 8px passaram para
  `.resumo`, para o resumo colar na linha "Filtros:" (AC5 pede "imediatamente após") sem aumentar a
  altura total do cabeçalho. Efeito colateral aceito: num relatório com zero registros (sem resumo),
  a linha de filtros perde 6px de respiro — invisível na folha, e `.cabecalho` mantém seus 10px.
- **[AUTO-DECISION 7]** A célula nova **não** escapa HTML, igual às 6 colunas existentes
  (`d.nome`, `d.obra_nome`, `d.observacao` também são interpolados crus). (Razão: escapar só o campo
  novo criaria inconsistência sem fechar o vetor; escapar tudo é mudança de comportamento fora do
  escopo desta story. Anotado para dívida técnica.)

### Evidências do T6

**Ambiente:** este working copy **não tem** `packages/web/.env.development`/`.env.teste` (o par de
teste descrito no CLAUDE.md não existe aqui) — o único env presente é `packages/web/.env.local`,
que aponta para **produção** (`dsopqkqjkmhytudaaolv`). Logo não havia banco de teste com brindes
cadastrados para medir. As medições abaixo foram feitas em **produção, somente leitura** (apenas
`GET` no PostgREST com service role; nenhum `POST`/`PATCH`/`DELETE`, nenhuma migration).

Dado real medido em 04/09/2026 (bate com o que a story previu): **200 destinatários na org
`…0001`, 36 com `brinde_tipo_id`, 164 sem**. Catálogo em uso: Camiseta P·3 M·3 G·11 GG·3 EXGG·2 /
Baby look P·2 M·7 G·2 GG·3.

**Contraprova 3 — `tamanho=M` (o `total` tem de deixar de ser 200):**

```
GET …/brindes_destinatarios?select=*,brindes_tipos!inner(nome,tamanho,cor)
    &org_id=eq.…0001&brindes_tipos.tamanho=eq.M   [Prefer: count=exact]
→ HTTP 200   content-range: 0-9/10          ✅ total = 10 (Camiseta M·3 + Baby look M·7)
```

**Contraprova 4 — sem o parâmetro (o `total` tem de voltar a 200):**

```
GET …/brindes_destinatarios?select=*,brindes_tipos(nome,tamanho,cor)&org_id=eq.…0001
→ HTTP 206   content-range: 0-49/200        ✅ total = 200 (os 164 sem brinde continuam listados)
```

**Contraprova extra — o filtro sem `!inner` é decorativo (é o defeito que o T6 queria pegar):**

```
GET …&select=*,brindes_tipos(nome,tamanho,cor)&brindes_tipos.tamanho=eq.M   ← sem !inner
→ HTTP 206   content-range: 0-49/200        ⚠️ 200: o .eq no embed não filtra nada em left join
```

Essas três medições provam a semântica do PostgREST. Que **o route** manda exatamente essas duas
strings é provado por `route.test.ts` (2 testes), que reprovam sob 3 mutações: `!inner` sempre
(1 falha), `!inner` nunca (1 falha), `.eq` removido (1 falha).

**Evidência 1 — relatório sem filtro (invariante do AC5):** HTML gerado pelo `buildPrintHtml` real
sobre os 200 registros de produção:

```
Resumo: Baby look G: 2 | Baby look GG: 3 | Baby look M: 7 | Baby look P: 2 | Camiseta EXGG: 2 |
        Camiseta G: 11 | Camiseta GG: 3 | Camiseta M: 3 | Camiseta P: 3 | Sem brinde definido: 164
soma das entradas = 200   ==   records.length = 200   ==   rodapé "Total: 200 registros"   ✅
última entrada = "Sem brinde definido: 164"   ✅   ocorrências de class="resumo" no documento = 1 ✅
células <td class="brinde">—</td> = 164   |   células com brinde preenchido = 36   ✅
```

**Evidência 2 — relatório com filtro "M":** 10 registros, **todos** com `brinde_tipo_id`
(zero sem), resumo `Baby look M: 7 | Camiseta M: 3` (soma 10), zero células "—", e a linha do
cabeçalho saiu `Filtros: Tamanho: M` (AC6). PDF em anexo do PR / reproduzível pelo script abaixo.

**Evidência 5 — pré-visualização A4 (AC7):** o HTML real (`buildPrintHtml` importado de uma cópia
byte-idêntica do `print-modal.tsx`, diferindo **só** pela palavra `export` — 7 bytes, conferido por
diff) foi renderizado em Chromium headless com `media: print` e paginado em A4:

| Medida | Sem data (Assinatura) | Com data (Status) |
|---|---|---|
| Ordem dos `<th>` | `# / Obra / Tipo / Nome / Endereço / **Brinde / Tamanho** / Assinatura / Conferência` | `… / **Brinde / Tamanho** / Status` |
| Largura útil da folha | 672,5px (≈ os ~673px estimados na story) | 672,5px |
| Largura da tabela | 672,5px | 672,5px |
| `.brinde` | **76,0px** (exatamente o AC4) | 76,0px |
| `.endereco` | 137,2px | 160,0px |
| `.nome` | 154,5px | 161,7px |
| Células fora da folha | **0** | **0** |
| Células com texto cortado (`scrollWidth > clientWidth`) | **0** | **0** |
| Overflow horizontal do documento | **não** | **não** |
| Linhas renderizadas | 200 | 200 |

**Aperto de largura medido contra a versão de `main`** (mesmo render, mesmos 200 registros, modo
sem data): `.endereco` 194,9px → **137,2px** (−57,7px) e `.nome` 172,8px → **154,5px** (−18,3px) —
as duas reduções somam exatamente os 76px da coluna nova. É o aperto previsto nos Riscos: o Endereço
ganha mais quebras de linha, sem cortar texto (0 células com `scrollWidth > clientWidth`).

`statusCell` é a última coluna nos dois modos ✅. O PDF A4 foi inspecionado visualmente (página 1):
cabeçalho com "Resumo: …" logo abaixo da linha de filtros, 7 colunas inteiras dentro da folha,
coluna "Brinde / Tamanho" com "—" nos sem cadastro e "Baby look · M" / "Camiseta · M" nos com
cadastro, coluna de assinatura íntegra.

### Validações

```
pnpm type-check   → Tasks: 8 successful, 8 total          (exit 0)
pnpm lint         → ✖ 30 problems (0 errors, 30 warnings) (exit 0) — baseline pré-existente,
                    zero ocorrências em arquivos de brindes (grep por "brindes" na saída: exit 1)
pnpm test         → Test Files 304 passed | Tests 3996 passed | 6 expected fail (exit 0)
                    (+12 testes novos: 10 em brinde-tamanho.test.ts, 2 em route.test.ts)
```

Os 12 testes novos foram submetidos a **mutação** antes de serem declarados válidos: ordem
alfabética no lugar de P/M/G/GG/EXGG (3 falhas), bucket sem-brinde por FK em vez de embed
(4 falhas), `!inner` sempre (1), `!inner` nunca (1), `.eq` removido (1). Nenhuma mutação passou
verde. Código restaurado e re-medido depois de cada uma.

**CodeRabbit CLI:** não executado — não faz parte do gate desta máquina para esta story; o gatilho
que vale é o GitHub App no PR.

### DoD (`story-dod-checklist`)

Todos os itens aplicáveis atendidos, com duas exceções declaradas: **4.1 "verificação manual
rodando o app"** — não houve interação em navegador (ver seção abaixo); e **7.2/7.3
documentação de usuário/arquitetura** — não se aplica (nenhuma mudança de contrato público,
nenhuma variável de ambiente nova, nenhuma dependência nova; `package.json` intocado).
Convenção de estrutura confirmada: já existem **74** arquivos `*.test.ts` dentro de
`packages/web/src/app`, incluindo `route.test.ts` ao lado de `route.ts` — o teste novo segue o
padrão do repositório, não inventa um.

**Dívida técnica anotada (fora do escopo desta story):** `buildPrintHtml` interpola todos os
campos de texto sem escapar HTML (`nome`, `obra_nome`, `observacao`, `cargo` e agora `brinde`).
Não é regressão desta story — é o comportamento das 6 colunas que já existiam — e escapar só o
campo novo criaria inconsistência sem fechar o vetor. Merece story própria.

### O que NÃO foi provado (sem maquiar)

- **Clique real na UI.** Não subi `pnpm dev`: o único env deste working copy aponta para produção e
  não há credencial de sessão disponível para logar. Portanto o select "Tamanho" na barra de filtros,
  o reset de paginação e os 5 filtros antigos foram verificados por código + type-check + o padrão
  idêntico aos filtros existentes (`useEffect(() => setPage(1), [filters])` já cobre o campo novo,
  porque o objeto `filters` muda) — **não** por interação em navegador. Item 5 do T6 está coberto na
  parte de layout/colunas (render real do HTML em A4) e **descoberto** na parte de "clicar nos 5
  filtros antigos".
- **Cenário com data comemorativa e `entregasMap` populado** foi renderizado com `entregasMap` vazio
  (todos "Pendente"): em produção `brindes_entregas` não tem nenhum registro com `brinde_tipo_id`, e
  o AC4 exige justamente que a coluna ignore a entrega. A ordem das colunas nesse modo está medida.

## QA Results

_(preenchido pelo @qa após o gate)_

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 04/09/2026 | @sm (River) | Draft criado a partir do ticket da Samara (03/09/2026), escopo de 3 itens aprovado pelo Marcos. |
| 04/09/2026 | @dev (Dex) | Implementação YOLO das T1–T6. 5 arquivos alterados + 3 criados (`brinde-tamanho.ts` e 2 arquivos de teste, 12 testes). Status Ready → Ready for Review. Contraprovas do T6 medidas em produção (somente leitura): `tamanho=M` → `total` 10; sem o parâmetro → `total` 200; e o controle sem `!inner` → 200, provando que o `!inner` condicional é o que faz o filtro valer. Invariante do AC5 medida sobre os 200 registros reais (soma = 200 = `records.length`). A4 medido em Chromium headless nos dois modos: 0 células fora da folha, 0 textos cortados, `.brinde` = 76,0px, `.endereco` cai para 137,2px (aperto previsto nos Riscos). 4 decisões autônomas registradas (nº 4 a 7). Não provado: interação em navegador (sem env de teste nem sessão) — declarado na seção "O que NÃO foi provado". |
| 04/09/2026 | @po (Pax) | `*validate-story-draft`: **GO — 9/10**. Status Draft → Ready. As 3 AUTO-DECISIONS revisadas (1 aceita, 2 e 3 aceitas com ressalva). ACs endurecidos com evidência de código: AC3 (ordem determinística das opções + tamanho sem resultado não é bug), AC4 (célula própria — não `<span>` inline como cargo/observação —, posição antes do `statusCell` nos dois modos, largura 76px, fonte do dado = cadastro e nunca a entrega), AC5 (resumo fixado no cabeçalho, formato em linha corrida, invariante de soma), AC7 (critério objetivo de "não quebrou o A4"). T5 perdeu a prop ambígua (`filters` já chega ao `PrintModal`); T6 ganhou as contraprovas do `!inner` condicional. Riscos: + aperto de largura medido (~673px úteis, `endereco` cai para ~165px), + filtro com zero resultados, + divergência futura entrega × cadastro. Corrigido "8 do catálogo" → 5 tamanhos distintos. Escopo inalterado: 3 itens, sem migration, sem RLS. |
