# Story 75-283 — Status de empreendimento aparecia em inglês ("planning")

**Story ID:** 75-283
**Epic:** 75 (CRM Trifold) · **Status:** Done · **Estimativa:** P (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Tipo:** bug fix simples (SDC/YOLO — story enxuta, sem fase @po separada)

---

## Story

Como **gestor abrindo Imóveis → Empreendimentos**, quero ler o status em português. Hoje Solun e
Japura aparecem com o badge **"planning"**, em inglês e em cinza, enquanto Yarden e Vind mostram
"Em venda" corretamente.

---

## Context

Achado em 07/08 pelo Marcos, na lista `/dashboard/properties`. Solun e Japura foram criados em prod
em 06/08 com status `planning` (Story 75-281) — foram os primeiros empreendimentos nesse estado, e o
defeito estava dormente desde sempre.

### Causa-raiz — 6 telas traduziam à mão, cobrindo 2 dos 5 status

Existe **fonte única** desde o começo: `lib/property-status.ts`, com `PROPERTY_STATUS_LABELS` já
contendo `planning: "Planejamento"`. Só que **nenhuma tela de listagem a usava**. Cada uma repetia:

```tsx
{p.status === "selling" ? "Em venda" : p.status === "launching" ? "Lançamento" : p.status}
//                                                                              ↑ imprime o valor CRU
```

O `: p.status` final é o defeito: `planning`, `delivered` e `sold_out` caíam nele e vazavam o valor
do enum do Postgres para a tela. Mesma duplicação nas classes do badge (verde/azul/cinza).

Locais afetados — **6 de exibição + 1 de formulário**:

| Arquivo | O que tinha |
|---|---|
| `app/dashboard/properties/page.tsx` | ternário de label + cor (**a tela do print**) |
| `app/dashboard/properties/[id]/page.tsx` | idem |
| `app/dashboard/page.tsx` | idem |
| `app/broker/properties/page.tsx` | idem |
| `app/broker/properties/[id]/page.tsx` | idem |
| `app/broker/page.tsx` | função local `statusLabel()`, mesma lógica |
| `app/dashboard/properties/[id]/edit/page.tsx` | `statusOptions` — **cópia literal** de `PROPERTY_STATUS_OPTIONS` |

É a classe de defeito de [[feedback-consultar-fonte-nao-duplicar-constante]]: a fonte existia e foi
reproduzida à mão, incompleta, em 7 lugares.

---

## Acceptance Criteria

- [x] **AC1 — nenhum status vaza em inglês.** Os 5 valores do enum (`planning`, `launching`,
      `selling`, `delivered`, `sold_out`) têm rótulo em português em toda tela que exibe status de
      empreendimento.
- [x] **AC2 — nada do que funcionava muda.** "Em venda" segue verde, "Lançamento" segue azul, os
      demais cinza — a paleta que já estava em produção foi preservada literalmente.
- [x] **AC3 — fonte única.** Label e cor saem de `lib/property-status.ts`
      (`propertyStatusLabel` / `propertyStatusBadge`); zero ternário de status remanescente no `app/`.
      O `<select>` da edição passa a consumir `PROPERTY_STATUS_OPTIONS`.
- [x] **AC4 — valor desconhecido não quebra a tela.** Status fora do enum é exibido cru (melhor que
      sumir) e ainda recebe classe de badge; `null`/vazio vira `—`.
- [x] **AC5 — teste que falharia com o bug.** `property-status.test.ts` itera o enum inteiro e
      **reprova qualquer rótulo em snake_case**, então um status novo sem tradução quebra o teste em
      vez de chegar à tela.

---

## Fora de escopo

- **Comparações de status na lógica da Nicole** (`packages/ai/src/chat/pipeline.ts:1885,1912`) — são
  regra de negócio (`planning` não é oferecido, Story 75-281), não exibição. Não tocadas.
- **Status de OBRAS** (`lib/status-badge.ts`) — outro enum, outra tela, sem o defeito.
- **`lib/lancamentos/lancamentos.ts`** — tem o rótulo "Em venda" para o enum de *lançamentos*,
  domínio diferente. Coincidência de texto, não duplicação.

---

## QA Results (@qa, 07/08)

**Verdict: PASS**

| # | Check | Resultado |
|---|---|---|
| 1 | Code review | ✅ 71 linhas removidas, 61 adicionadas — a maior parte é remoção de duplicata |
| 2 | Testes | ✅ 9 novos em `property-status.test.ts`; suíte **148 arquivos / 1812 testes** |
| 3 | ACs | ✅ AC1–AC5 |
| 4 | Sem regressão | ✅ paleta idêntica à de produção, conferida linha a linha antes de extrair |
| 5 | Performance | ✅ n/a (lookup em objeto) |
| 6 | Segurança | ✅ n/a |
| 7 | Documentação | ✅ comentário de causa-raiz no helper |

**Verificado:** `tsc --noEmit` limpo · `eslint` sem erros novos. Os 3 warnings de `no-unused-vars`
em `broker/page.tsx` (`roletaAtiva`, `isOnline`, `roletaPosition`) são **pré-existentes** —
confirmado rodando o eslint na versão da `main` antes das mudanças, mesmas 3 ocorrências.

**Observação (não bloqueia):** a busca por `"Em venda"` no `app/` volta **vazia** depois do fix —
serve como canário: se reaparecer, alguém duplicou a fonte de novo.
