# Story 75-277 — Sai o card "Conversão" (era 100% etapa Fechamento, media 0%)

**Epic:** 75 (CRM Trifold) · **Status:** Done (aguardando push) · **Estimativa:** XS (~1 pt)

**CodeRabbit Integration:** Disabled (`coderabbit_integration` ausente do `core-config.yaml`).

---

## Story

Como **gestor lendo o Analytics**, quero o card "Conversão" fora da tela — ele mostra `0%` /
`0 de 133` desde sempre, porque depende só da etapa Fechamento, que ninguém usa. Card que nunca
tem número é ruído: ocupa a mesma atenção que os que informam.

---

## Context

Pedido do Marcos em 05/08, na sequência da 75-276: *"tira o fechado! pode remover o fechados"*.
Surgiu quando o gate da 75-276 registrou que a noção de "fechou" **não** saía da tela — sobrevivia
neste card de topo, com régua própria (`page.tsx:352`, regex `/fechamento|ganho|fechado/i`).

Medido em prod (05/08): **zero** leads na etapa Fechamento em 7d e em 30d. Logo `conversao = 0`
sempre, e o delta vs. período anterior também. É o mesmo espaço morto que a 75-276 tirou da faixa
verde do Aproveitamento — só que aqui não entra métrica nova no lugar.

### Escopo decidido pelo Marcos

- ✅ **Sai:** o card "Conversão" do grid de topo, e todo o código que só existia para ele.
- ❌ **NÃO mexer:** o **Funil de Conversão** ("não precisa mexer no funil de conversão neste
  momento"). Ele lista todas as etapas em laço e a Fechamento pertence à lista, mesmo zerada.
- ❌ **Sem métrica nova no lugar.** Um "Conversão para visita" ali é possível (reaproveitaria o
  dado da 75-276), mas exigiria busca própria de `appointments` na página — a rota `executive` não
  serve esta tela. Fica como opção futura, não foi pedido.
- Etapa Fechamento no Kanban: intocada. Esta story é só de tela.

---

## Acceptance Criteria

- [x] **AC1** — o card "Conversão" não aparece mais no grid de topo da `/dashboard/analytics`.
- [x] **AC2** — o grid passa de 4 para **3 colunas** (Entradas · Ativos · Perdidos), sem buraco:
      `grid-cols-1 sm:grid-cols-3` (era `grid-cols-2 sm:grid-cols-4`).
- [x] **AC3** — nenhum código órfão fica para trás: saem `fechamento`, `conversao`,
      `prevFechamento`, `prevConversao` e o `fechadoStageIds` local da página.
- [x] **AC4** — com filtro de empreendimento ativo, o `Promise.all` do período anterior deixa de
      fazer a contagem de fechados: **3 queries viram 2**.
- [x] **AC5** — o **Funil de Conversão** segue idêntico, com a etapa Fechamento na lista.
- [x] **AC6** — Entradas, Ativos e Perdidos seguem com os mesmos números e os mesmos deltas.

---

## Dev Notes

Sete cortes num arquivo só (`app/dashboard/analytics/page.tsx`). O `toCount` **fica** no import:
depois de remover a linha 348 ele ainda tem 8 usos.

O card era o único consumidor de `prevFechamento`, que por sua vez era o único motivo da terceira
query no `Promise.all` do ramo com filtro de empreendimento — daí o AC4 sair de graça.

Comentário no código explica por que a etapa Fechamento continua no Funil logo abaixo, para que a
próxima pessoa não "termine o serviço" achando que foi esquecimento.

### File List
| Arquivo | Mudança |
|---|---|
| `app/dashboard/analytics/page.tsx` | sai o card + 6 trechos de código órfão; grid 4→3 colunas |

## QA Results

Gate: **PASS** — `docs/qa/gates/75.277-remove-card-conversao-morto.yml`

Type-check do `web` limpo (é ele que prova o AC3: variável órfã em `.tsx` não usada quebraria o
build ou o lint), 1.738 testes verdes, lint 0 erros (18 warnings, todos pré-existentes em arquivos
não tocados). Nenhuma referência a `conversao`/`prevFechamento`/`fechadoStageIds` restou no arquivo
— conferido por grep, só sobraram as duas menções em comentário e o título do Funil.

Sem teste automatizado novo: a mudança é remoção de JSX e de código morto, sem lógica a cobrir. O
que restou para os olhos do Marcos é o **render dos 3 cards** — em telas largas eles ficam mais
largos que antes.

## Change Log
| Data | Mudança |
|---|---|
| 2026-08-05 | Story criada e implementada a pedido do Marcos, na sequência da 75-276. Funil de Conversão explicitamente fora de escopo por decisão dele |
