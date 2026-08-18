# Story 75-341 — Analytics: clicar no funil abre a lista, e dois endpoints que contavam IMOB

**Status:** Done
**Tipo:** Feature (drill-down) + Bug fix (isolamento IMOB em 2 endpoints)
**Epic:** 75 — CRM Trifold
**Story ID:** 75-341
**Complexidade:** M (~5 pts — 1 rota nova, 2 componentes, 0 migrations)
**Fluxo:** @dev → @qa (mutação) → @devops · **PR #451 mergeado em 18/08**
**Migrations:** **nenhuma**.

## O pedido (Marcos, 18/08)

> *"Este Analytics é referente ao mundo house, IMOB não entra nas medições aqui. Vi no funil de
> vendas 1 lead no fechamento, mas não vi ele no pipeline — pode ser que já tenha mudado de etapa e
> aí eu que vi errado, ou está sendo contaminado pelo mundo IMOB. E o cenário ideal seria, ao clicar
> sobre o funil em cada etapa dele, abrir a listagem referente àqueles dados."*

---

## O "1 lead no Fechamento": ele viu certo, e a tela também estava certa

Investigado em produção antes de mexer em qualquer linha. O lead é a **Simone Fogliato Flores**,
`segmento='principal'` (não é IMOB), criada dentro da janela de 30 dias. Ela **passou** por
Fechamento em 27/07 e hoje está em **Represamento** — por isso não aparece na coluna Fechamento do
Pipeline.

O funil desenha a coluna **chegaram** (Story 75-323): quem passou por cada etapa, incluindo quem
avançou ou se perdeu depois. Duas leituras corretas da mesma base, que o card da 75-326 já colocou
lado a lado. O que faltava era **poder abrir o número** — e é isso que fecha a dúvida sem precisar
de ninguém investigando no banco. É o AC2.

## AC1 — Dois endpoints contavam IMOB

Auditei **todas** as queries de `leads` e `appointments` do Analytics (página, PDF, executivo,
leads-por-período, RPCs 136/213). Resultado:

| Origem | Isolamento IMOB |
|---|---|
| `dashboard/analytics/page.tsx` (17 queries) | OK — todas com `segmento='principal'` |
| `lib/analytics-report-data.ts` (PDF) | OK — inclusive visitas, via `applyRealizedVisitFilter` (`team='house'`) |
| `api/analytics/executive` · `leads-by-period` | OK |
| RPCs `get_analytics_summary_ranged` / `get_lost_reason_groups` | OK — filtro dentro do SQL |
| **`api/analytics/sources`** | ⚠️ **faltava** |
| **`api/analytics/campaigns`** | ⚠️ **faltava** |

Os dois furos são reais, mas **nenhuma tela os consome hoje** — nada em `packages/web/src` faz fetch
deles (o gráfico de origens usa `leads-by-period`). São endpoints órfãos, e é justamente o tipo de
código que volta a ser usado meses depois sem ninguém reauditar. Uma linha em cada.

**Sobre o funil: o cruzamento com `activities` não é porta de entrada para o IMOB.** A query de
`stage_change` é recortada por período (não por lista de ids, que estouraria a URL do PostgREST),
então ela traz linhas de leads IMOB — e `buildReachedSets` as descarta no cruzamento com a coorte.
Isso ganhou teste explícito nesta story, porque é o ponto onde a contaminação passaria despercebida.

## AC2 — Clicar abre a listagem

**No Funil:** cada andar é clicável e abre os leads que **chegaram** nele — a mesma leitura que o
andar desenha. A área de clique é o próprio trapézio, não um retângulo: os andares se aproximam nas
laterais e, no andar dividido (Visita Agendada | Visitou), um retângulo roubaria metade do vizinho.

**Na régua do Pipeline:** os dois números viraram clicáveis — `agora` abre quem está na etapa hoje,
`chegaram` abre quem passou por ela. Antes o card inteiro era um link para
`/dashboard/pipeline?stage=…`, que é outra coisa: o Pipeline mostra o quadro de HOJE, sem período e
sem os filtros da tela, então quem clicava em "chegaram" caía num quadro incapaz de reproduzir
aquele número. O link para o Pipeline continua, dentro do painel.

**O painel** mostra nome, telefone, corretor, data de entrada e — no modo `chegaram` — a etapa de
**hoje** quando ela é diferente da clicada. É a linha que responde a pergunta do Marcos direto na
tela: *"Simone Fogliato Flores · hoje: Represamento"*.

### A garantia que sustenta a feature

A lista e o número saem da **mesma** função. `buildReachedSets` (antes um detalhe interno de
`buildReachedCounts`) virou exportada, e a rota recalcula a coorte com o mesmo recorte, os mesmos
filtros e a **mesma janela de histórico** (`from` → agora, não `from` → `to`). Um teste percorre
todas as etapas nos dois modos e compara o total da rota com `buildPipelineRows`: se alguém mudar
uma das pontas, o teste cai. Sem isso, uma divergência ficaria invisível — ninguém confere 37 linhas
na mão. O painel ainda exibe "card marcava N" se os números discordarem em produção.

### Decisões

- **Recalcular no servidor**, não embutir os ids na página: a coorte de 30 dias tem ~380 leads e a
  de 90 passa de mil. Inflar o HTML inteiro para servir um clique que talvez não aconteça é caro do
  lado errado.
- **Capability `analytics.executivo`** — a mesma da Visão Executiva e do leads-por-período. Corretor
  não tem (seed em `capabilities.ts`), então a base não vaza para quem só deve ver a própria
  carteira. A lista expõe telefone, o que é mais do que os agregados expõem.
- **Teto de 300 linhas**, com o total real e um rodapé dizendo o que ficou de fora. Silenciar a
  truncagem faria a lista parecer completa.

## Testes

| Arquivo | O que cobre |
|---|---|
| `api/analytics/funnel-leads/route.test.ts` *(novo)* | os dois modos; a lista batendo com `buildPipelineRows` etapa por etapa; IMOB fora pelas duas portas (coorte e histórico); lead que avançou DEPOIS do fim do período (a janela do histórico vai até agora); filtro de corretor valendo (e o inverso, para o teste não passar por zerar tudo); 404/400; 403 sem capability |
| `lib/analytics/funnel-reached.test.ts` | segue verde após extrair `buildReachedSets` |
| `lib/analytics/funnel-tiers.test.ts` | segue verde após `stageId` entrar no andar |

**Validações:** 210 arquivos / 2630 testes passando · `type-check` 8/8 · `lint` 0 erros · `build` OK
(rota registrada como `ƒ /api/analytics/funnel-leads`).

## File List

- `packages/web/src/app/api/analytics/funnel-leads/route.ts` *(novo)* — recalcula a coorte e devolve a lista
- `packages/web/src/app/api/analytics/funnel-leads/route.test.ts` *(novo)*
- `packages/web/src/components/analytics/stage-leads-drawer.tsx` *(novo)* — painel compartilhado
- `packages/web/src/components/analytics/pipeline-ruler.tsx` *(novo)* — régua com números clicáveis
- `packages/web/src/components/analytics/conversion-funnel.tsx` — andares clicáveis (prop `drilldown`)
- `packages/web/src/lib/analytics/funnel-reached.ts` — `buildReachedSets` exportada
- `packages/web/src/lib/analytics/funnel-tiers.ts` — `stageId` no andar
- `packages/web/src/app/dashboard/analytics/page.tsx` — usa os componentes novos
- `packages/web/src/app/api/analytics/sources/route.ts` — AC1
- `packages/web/src/app/api/analytics/campaigns/route.ts` — AC1

## Verificar depois do deploy

- Clicar num andar do funil e conferir se o total do painel bate com o número do andar.
- Clicar em "chegaram" na etapa Fechamento e ver a Simone com "hoje: Represamento".
- Com um filtro ativo (ex.: um corretor), conferir que a lista respeita o recorte.
