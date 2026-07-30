# Story 75-236 — Leads: filtro por Calor do Lead (temperatura)

**Status:** InReview
**Tipo:** Feature (pequena)
**Epic:** Leads / gestão comercial
**Complexidade:** S

## Contexto
Pedido do Marcos (30/07): classificar o lead por percepção do corretor (frio /
morno / quente) e poder **filtrar** por isso.

Levantamento antes de codar: o **campo já existe** — `leads.interest_level`
(enum `cold|warm|hot`, nullable), rotulado "Calor do Lead", editável pelo
corretor em `/broker/leads/[id]` e no modal de histórico rápido, e por
admin/supervisor em `/dashboard/leads/[id]`. O que **não** existia era filtro:
nenhuma tela do app filtrava por `interest_level`.

Distribuição em prod (30/07, leads ativos do segmento principal):
**1104 frios · 281 sem definir · 71 mornos · 43 quentes**.

Escopo definido pelo Marcos: **somente o filtro na tela `/dashboard/leads`** (nada
no `/broker`, nenhuma coluna nova na tabela).

## Entrega
- `LeadFilters` ganhou o dropdown **Calor** (opt-in `showCalor`, para não mudar
  Conversas e as outras telas que usam o componente): Todos · 🔥 Quente · Morno ·
  Frio · **Não definido**. Entra no "Limpar" e no estado de "tem filtro ativo".
- `/dashboard/leads` aplica o filtro na listagem **e na contagem** (o "N leads"
  bate com o filtro), vale nas duas abas (Em atendimento / Perdidos) e no modo
  "Leads hoje".
- Valor fora da whitelist é ignorado (`parseCalor`) — nada vai cru ao filtro;
  `none` vira `interest_level IS NULL`.
- Refactor pequeno de risco: `buildPageHref` passou de 11 argumentos posicionais
  para receber o objeto de params — filtro novo passa a entrar sem risco de
  trocar a ordem dos argumentos (era o próximo bug esperando acontecer).

## Arquivos
- `packages/web/src/lib/leads/calor.ts` (+ `calor.test.ts`)
- `packages/web/src/components/lead-filters.tsx`
- `packages/web/src/app/dashboard/leads/page.tsx`

## QA Results
Quinn: **CONCERNS** (6 low, nada bloqueante — 3 delas pré-existentes). Ele provou
o caminho real no PostgREST de prod: `busca "maria"` = 45 leads e, filtrando,
29 cold + 13 none + 1 hot + 2 warm = **45** → busca (`.or()` da 75-167) e calor
combinam como AND e `none` cobre exatamente o complemento. Também conferiu o
`buildPageHref` campo a campo (nenhum filtro se perde, inclusive `view=perdidos`
e `criados=hoje`), que as contagens das ABAS não são contaminadas pelo filtro, e
que as outras 3 telas que usam `LeadFilters` (Conversas, /broker/chat,
/broker/leads) não mudaram (dropdown é opt-in).

Resolvidos neste ciclo:
- *(low, tests)* `parseCalor` estava inline num Server Component → extraído para
  `lib/leads/calor.ts` com teste (whitelist, caixa errada, `hot,warm`, vazio).
  Componente e página passaram a ler a MESMA whitelist.
- *(low, code)* cast desnecessário no `buildPageHref`.
- *(low, ux)* `?calor=xyz` forjado deixava o select em branco → normaliza para
  "Todos".
- *(low, ux, PRÉ-EXISTENTE)* o `<form method="get">` da busca reescreve a query
  string inteira: escolher um filtro e DEPOIS buscar por nome apagava o filtro
  calado (valia p/ Etapa, Empreendimento, Corretor, Origem, período…). Corrigido
  com hidden inputs dos filtros ativos — vale para todos, não só o calor.

Ficou de fora (registrado como follow-up):
- *(low, PRÉ-EXISTENTE)* no modo "Leads hoje" a linha-resumo (perdidos/acervo)
  não aplica os filtros, então com filtro ativo os baldes podem somar mais que o
  total. Vale igual para os 6 filtros da tela; merece story própria que conserte
  todos de uma vez, não um remendo só para o calor.

## Validação
- Caminho REAL conferido contra o PostgREST de produção (GET read-only com
  service role, os mesmos filtros que a página monta):
  `interest_level=eq.hot` → 43 · `eq.warm` → 71 · `eq.cold` → 1104 ·
  `is.null` → 281. Confere com o `GROUP BY` no banco.
- Suíte 1281/1281 (3 testes novos do `parseCalor`) · `tsc --noEmit` limpo · eslint sem novos avisos · `next build` OK.
- Sem migração: usa coluna e enum existentes.

## Fora de escopo (registrado)
- Coluna/badge de calor na tabela de Leads — o filtro funciona, mas a
  temperatura de cada lead só aparece ao abrir o lead. Marcos pediu "somente o
  filtro"; se quiser ver na lista, é uma linha de badge.
- Filtro equivalente em `/broker/leads` e no Pipeline.
