# Story 75-370 — Extrato: "total pago" passa a usar o Recto líquido (juros e desconto entram)

**Story ID:** 75-370
**Epic:** 75 (CRM Trifold) · **Status:** Ready for Review · **Estimativa:** S (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Dependências:** continuação da Story `75-369` (allowlist de tipos de baixa, PR #520). Toca
  `lib/integrations/sienge/{installments,client,types}.ts` e as três telas que consomem
  `FormattedInstallment` (portal-viewer, extrato do cliente, PDF).

---

## Story

Como **cliente que abre o extrato no portal**, quero que o "total pago" seja o dinheiro que
realmente entrou — incluindo os juros que eu paguei por atraso e descontando o abatimento que
recebi — para bater com a coluna "Recto líquido" do extrato oficial do Sienge.

---

## Context

A conciliação da Story `75-369` com os extratos oficiais do Vind e do Yarden (28/08/2026) fechou
89 de 89 títulos no saldo devedor, mas deixou **R$ 721,78** de diferença no total pago. A causa foi
isolada: o portal soma `receiptValue` (o valor nominal da baixa) e o Sienge soma o **Recto
líquido** — valor + acréscimo − desconto. Nos 89 títulos: R$ 4.706,22 de acréscimo e R$ 1.608,34 de
desconto, afetando 31 títulos.

A questão foi devolvida ao financeiro em formato de decisão e voltou respondida.

### Decisão do financeiro (Robson, 31/08/2026, WhatsApp)

> Pergunta: "o juro que o cliente pagou por atraso é dinheiro que ele pagou e deve aparecer no
> total? E o desconto concedido deve sair da conta?"
>
> **"Sim, entram no total pago"** — opção "Usar o Recto líquido".

A segunda questão da mesma rodada (Adiantamento × Abatimento) foi respondida com **"Manter, contar
no abatimento"**, ou seja, ratifica o que já está em produção — **não faz parte desta story**.

### Prova de que `netReceiptValue` é o Recto líquido (31/08/2026)

O risco da mudança não era a decisão, era o campo: a API do Sienge tem `netReceiptValue`, mas
também `administrativeFee` e `insuranceAmount`. Se o líquido já descontasse taxa e seguro, trocar
o campo faria o portal ficar **abaixo** do oficial em vez de bater.

Medido contra a API de produção com `scripts/sienge-recto-liquido-check.ts` (só GET), nos clientes
do Vind e do Yarden — **1.299 baixas em dinheiro, 116 títulos, 72 clientes**:

| Verificação | Resultado |
|---|---|
| `netReceiptValue == receiptValue + interestValue + additionalValue − discountValue` | **1.299 de 1.299** — zero divergências |
| Baixas sem `netReceiptValue` | **0** |
| Baixas com `administrativeFee` ou `insuranceAmount` > 0 | **0** |
| Total pago por `receiptValue` (hoje) | R$ 18.368.165,72 |
| Total pago por `netReceiptValue` | R$ 18.370.903,18 |
| Diferença que a mudança produz | **+ R$ 2.737,46** |

Conclusão: `netReceiptValue` **é** o Recto líquido, não desconta taxa administrativa nem seguro
nesta base, e vem preenchido em 100% das baixas em dinheiro. O fallback para `receiptValue` existe
por segurança, não por necessidade rotineira.

> A base de hoje (116 títulos) é maior que a da conciliação (89 títulos, porque só entraram os que
> apareciam nos dois extratos), então o total não é comparável ao oficial de R$ 14.522.414,77 — o
> que é comparável é a diferença que a mudança produz. Fechar o número ao centavo contra os 89
> títulos depende dos extratos de 28/08.

### Informe de rendimentos

`computeInformeFromStatements` soma o mesmo campo agregado, então acompanha a mudança
automaticamente. **Sem efeito em produção:** o recurso está desativado
(`INFORME_RENDIMENTOS_ENABLED = false`, `lib/portal/features.ts:16`) desde o PR #508. Não há
decisão pendente do financeiro aqui e nada a isolar — criar um segundo campo agregado só para
preservar o critério antigo de uma tela desligada seria complexidade sem valor.

---

## Acceptance Criteria

1. **AC1** — O valor pago de uma baixa em dinheiro passa a ser o **Recto líquido**: usa
   `netReceiptValue` quando presente e cai para `receiptValue` quando ausente/nulo. Regra em um
   único lugar (`installments.ts`), sem `??` espalhado pelas telas.
2. **AC2** — O agregado `receiptValue` de `FormattedInstallment` (o "total pago" da parcela) passa
   a somar o Recto líquido de cada baixa em dinheiro.
3. **AC3** — Parcela paga **com juros de atraso** mostra pago **maior** que o valor da parcela, e o
   status continua `PAGO` (quem decide o status é o `currentBalance`, não o valor pago).
4. **AC4** — Parcela paga **com desconto** mostra pago **menor** que o valor da parcela e continua
   `PAGO` quando o `currentBalance` está zerado.
5. **AC5** — As três telas exibem o mesmo critério em **todos** os lugares onde aparece valor
   pago: o total pago do extrato, o **valor em destaque da parcela quitada** (hoje
   `inst.receiptValue ?? inst.originalValue` — é o número grande do cartão), o "Pago até agora" da
   parcela parcial e cada linha da lista de pagamentos. Portal e extrato oficial não podem
   divergir, e a tela não pode divergir de si mesma.
6. **AC6** — Baixas que **não** são pagamento (`nonCashReceipts`) continuam fora de qualquer soma,
   sem mudança nenhuma — a allowlist da `75-369` permanece intacta.
7. **AC7** — O saldo devedor (`getOpenBalance`) não muda em nenhum cenário.
8. **AC8** — Testes cobrindo: juros, desconto, juros + desconto, `netReceiptValue` ausente
   (fallback), `netReceiptValue` presente em baixa não-caixa (deve continuar ignorada) e várias
   baixas na mesma parcela somando líquidos.

---

## Tasks / Subtasks

- [x] **T1** — `installments.ts`: helper puro `getCashReceiptValue(receipt)` com a regra do Recto
      líquido e o fallback documentado (AC1)
- [x] **T2** — `client.ts`: agregado `receiptValue` passa a somar `getCashReceiptValue` (AC2)
- [x] **T3** — Três telas (`portal-viewer`, `extrato-client`, `extrato-pdf`): linha de baixa usa o
      helper, para não divergir do total (AC5)
- [x] **T4** — `types.ts`: comentários de `netReceiptValue`/`discountValue`/`interestValue` e do
      agregado `receiptValue` explicando que o critério é o Recto líquido, com a data da decisão
- [x] **T5** — Testes em `client.test.ts` (AC3, AC4, AC8) + regressão completa (vitest, typecheck,
      lint) e teste de mutação provando que os novos testes reprovam o comportamento antigo
- [x] **T6** — Versionar `scripts/sienge-recto-liquido-check.ts` (paga o débito do script ad-hoc
      da conciliação de 28/08, que não ficou no repo)

---

## Dev Notes

**Onde exatamente muda.** O agregado é montado em `client.ts`, dentro de `getFinancialStatement`:

```ts
receiptValue: receipts.length > 0
  ? receipts.reduce((sum, r) => sum + r.receiptValue, 0)
  : undefined,
```

Todos os consumidores leem esse agregado. **Não há cache nem coluna persistida** — nenhum
consumidor guarda "total pago" no banco, todos chamam `getFinancialStatement` direto no Sienge.
O deploy corrige o histórico sozinho, sem backfill.

**Por que o helper vive em `installments.ts` e não em `client.ts`.** `installments.ts` é puro de
propósito (sem `process.env`, sem rede) porque roda também em Client Components — é de lá que o
`extrato-client.tsx` importa. `client.ts` carrega credenciais e não pode ser importado no browser.

**Os dois campos de acréscimo.** O extrato oficial apresenta "acréscimo" como uma coluna só, mas a
API tem `interestValue` (juros) e `additionalValue` (valor adicional). A medição confirmou que o
`netReceiptValue` já é a conta fechada dos dois — então o helper usa `netReceiptValue` direto, e
não recalcula a fórmula. Recalcular seria reimplementar a conta do ERP com risco de divergir.

**Efeito visível ao cliente.** Parcela com atraso passa a exibir pago acima do valor da parcela.
É o que o extrato oficial mostra e é o objetivo da mudança, mas é visível — o financeiro já
decidiu com esse efeito descrito no documento de decisão.

---

## Dev Agent Record

### Agent Model Used
claude-opus-5[1m] (@dev / Dex) — modo YOLO

### Debug Log References
- `npx vitest run packages/web/src/lib/integrations/sienge/client.test.ts` → 49 testes, exit 0
  (39 pré-existentes + 10 novos)
- `npx vitest run` (suíte completa) → 287 arquivos, 3.703 passed + 6 expected fail, **exit 0**
- `npx tsc --noEmit -p packages/web/tsconfig.json` → **exit 0**
- `npm run lint` (packages/web) → **exit 0**, 0 errors, 30 warnings — todas pré-existentes e em
  arquivos do dashboard não tocados por esta story
- **Teste de mutação:** revertendo `getCashReceiptValue` para `return receipt.receiptValue` (o
  comportamento antigo), **7 dos 10 testes novos falham**. Os 3 que continuam passando são
  exatamente os do fallback e do nominal, que valem nos dois comportamentos — ou seja, os testes
  são capazes de reprovar a regressão.
- Após o fix do C1: `vitest run` → 287 arquivos, 3.704 passed + 6 expected fail, **exit 0**;
  typecheck **exit 0**; lint **exit 0**; mutação do fix (voltar ao nominal no mensal) reprova 1 teste.
- `tsc -p tsconfig.json` (raiz) acusa `Cannot find module '@supabase/supabase-js'` no script novo.
  Não é regressão: **17 scripts** existentes acusam o mesmo, porque a dependência vive em
  `packages/web/node_modules` e o tsconfig raiz não a resolve. O gate real do repo é
  `packages/web/tsconfig.json`, que não inclui `scripts/`.

### Completion Notes List
- **A regra ficou num único lugar** (`getCashReceiptValue` em `installments.ts`, AC1). O helper usa
  `netReceiptValue` direto em vez de recalcular `valor + juros + adicional − desconto`: a medição
  provou que o campo já é essa conta fechada, e refazê-la seria reimplementar a aritmética do ERP
  com risco de divergir dela.
- **O valor em destaque da parcela e os totais não precisaram de mudança** para atender a AC5: as
  três telas já leem o agregado `inst.receiptValue`, que passou a ser líquido em `client.ts`. O que
  precisou de edição foi a **lista de pagamentos** de cada parcela, que lia `r.receiptValue` cru —
  sem isso a tela mostraria total líquido e linhas nominais, divergindo de si mesma.
- **Fallback é defensivo, não rotineiro.** Na base medida (1.299 baixas), `netReceiptValue` veio
  preenchido em 100% dos casos. O teste `netReceiptValue: 0` existe porque `??` (e não `||`) é o
  operador certo: desconto integral resulta em líquido zero, e `||` cairia no nominal.
- **Allowlist da 75-369 intacta** (AC6): baixa não-caixa com `netReceiptValue` preenchido continua
  ignorada — coberto por teste com `Distrato` de R$ 1.200 líquido.
- **Saldo devedor não muda** (AC7): `getOpenBalance` não olha valor pago; asserção presente em 4
  dos testes novos, incluindo o caso PARCIAL.
- **Informe de rendimentos** acompanha o agregado automaticamente e está desativado em produção
  (`INFORME_RENDIMENTOS_ENABLED = false`) — nenhum efeito visível, nada a isolar.
- **CodeRabbit CLI não executado.** O binário existe nesta máquina, mas o gatilho de review deste
  repo é o GitHub App, que roda no PR (`.claude/rules/coderabbit-integration.md`). Não reportado
  como executado.
- **Achado C1 do gate, corrigido.** O breakdown mensal de `computeInformeFromStatements` somava
  `receipt.receiptValue` cru enquanto o `accumulatedPaid` já lia o agregado líquido — a mesma
  função com dois critérios, e a soma dos meses deixaria de fechar com o acumulado sempre que
  houvesse juros ou desconto. Corrigido para o helper (2 linhas) e coberto por teste que compara
  soma dos meses × acumulado; mutação revertendo ao nominal **reprova esse teste**. Sem efeito em
  produção (informe desativado), mas era dívida latente sem razão de existir.
- **Pendência conhecida, não bloqueante:** fechar o total ao centavo contra os 89 títulos de
  28/08/2026 depende dos extratos oficiais, que o Marcos vai reenviar. A correção em si está
  provada pela identidade aritmética em 1.299/1.299 baixas.

### File List
| Arquivo | Mudança |
|---|---|
| `docs/stories/75-370-extrato-total-pago-recto-liquido.story.md` | novo |
| `docs/qa/gates/75-370-extrato-total-pago-recto-liquido.yml` | novo — gate CONCERNS → PASS |
| `scripts/sienge-recto-liquido-check.ts` | novo — mede a identidade e os dois critérios contra a API |
| `packages/web/src/lib/integrations/sienge/installments.ts` | `getCashReceiptValue` |
| `packages/web/src/lib/integrations/sienge/client.ts` | agregado `receiptValue` pelo líquido + reexport + fix C1 no informe |
| `packages/web/src/lib/integrations/sienge/types.ts` | comentários dos campos de baixa e do agregado |
| `packages/web/src/lib/integrations/sienge/client.test.ts` | +11 testes (10 da story + 1 do C1) |
| `packages/web/src/app/portal-viewer/[vinculo_id]/financeiro/page.tsx` | linha de baixa pelo líquido |
| `packages/web/src/app/cliente/[obra_id]/financeiro/extrato/_components/extrato-client.tsx` | linha de baixa pelo líquido |
| `packages/web/src/lib/pdf/extrato-pdf.tsx` | linha de baixa pelo líquido |

---

## Change Log
| Data | Autor | Mudança |
|---|---|---|
| 2026-08-31 | @sm | Story criada a partir da decisão do financeiro (WhatsApp 31/08) e da medição de `netReceiptValue` contra a API de produção |
| 2026-08-31 | @po | Validação 10 pontos: GO (9/10). AC5 ampliada para incluir o valor em destaque da parcela quitada — é o número mais visível da tela e ficaria fora da redação anterior. Status Draft → Ready |
| 2026-08-31 | @dev | T1–T6 implementadas; 49 testes no arquivo (10 novos), suíte completa, typecheck e lint verdes; mutação reprova 7/10 → Ready for Review |
| 2026-08-31 | @qa | Gate CONCERNS (8/10): 1 achado MEDIUM não bloqueante — informe misturava critério nominal e líquido na mesma função |
| 2026-08-31 | @dev | C1 corrigido (mensal do informe pelo mesmo helper) + teste de coerência; regressão completa verde |
| 2026-08-31 | @qa | Re-review: C1 resolvido e coberto por teste com mutação → gate **PASS** |
