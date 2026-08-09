# Story 75-284 — Extrato: baixa parcial vira "Pago" e some a dívida do cliente

**Story ID:** 75-284
**Epic:** 75 (CRM Trifold) · **Status:** InReview (PR aberto) · **Estimativa:** M (~5 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Dependências:** nenhuma. Toca `lib/integrations/sienge/client.ts`/`types.ts` e as telas/PDF
  que consomem `FormattedInstallment`; não depende de story em andamento.

---

## Story

Como **cliente que abre o extrato no portal**, quero ver a verdade sobre o que devo — hoje uma
parcela com **baixa parcial** aparece como **"Pago"** e o "Total em aberto" mostra **R$ 0,00**,
mesmo com centenas de milhares de reais em aberto no Sienge.

E como **cliente que paga em várias baixas**, quero ver **cada baixa com sua data e valor**, como
no extrato do Sienge — hoje o extrato mostra só o acumulado e uma única data.

---

## Context

Achado em 07/08 pelo Marcos, comparando o extrato impresso do Sienge (Extrato Cliente Histórico,
título 10663, CT.VIND-704, cliente Sandro Rogério Alarcão) com o PDF do CRM ("Extrato de Cliente",
gerado 29/07/2026):

| Fonte | Parcela 33 "Entrega das chaves" (R$ 397.600,00, venc. 28/02/2027) | Total em aberto |
|---|---|---|
| Sienge | **em aberto**, saldo atual **R$ 434.518,33** (com correção), com baixas parciais em jun–jul/2026 | R$ 434.518,33 |
| CRM | **"Pago"**, R$ 24.424,38, "Dt. Pagamento 16/06/2026" | **R$ 0,00** |

O cliente que olha o extrato do CRM conclui que não deve nada.

### Causa-raiz 1 — status "PAGO" por existência de baixa, não por saldo

`packages/web/src/lib/integrations/sienge/client.ts:126`:

```ts
if (inst.receipts.length > 0) {
  status = "PAGO"
}
```

Qualquer parcela com **uma** baixa (mesmo parcial) vira PAGO. O `currentBalance` retornado pelo
Sienge (saldo devedor da parcela, com correção) é ignorado na decisão. Todos os consumidores
(extrato do portal, portal-viewer, PDF, informe) somam "em aberto" filtrando `status !== "PAGO"`,
então a parcela parcial some do total devido.

### Causa-raiz 2 — só a primeira data de baixa é exposta, valor só acumulado

`client.ts:146-149`: `receiptDate: inst.receipts[0]?.receiptDate` (primeira baixa) e
`receiptValue` = somatório. A lista `receipts` (data + valor de cada baixa) é descartada, então
nenhuma tela consegue mostrar as baixas por dia. Efeito colateral: o informe de rendimentos
calculado (`computeInformeFromStatements`) atribui **todo** o valor pago ao mês da **primeira**
baixa.

## Acceptance Criteria

1. Parcela com baixas parciais (`receipts.length > 0` e `currentBalance > 0`) tem novo status
   `PARCIAL` — nunca `PAGO`. `PAGO` exige `currentBalance <= 0`.
2. Parcelas sem baixa mantêm comportamento atual (`BOLETO_GERADO` / `EM_ABERTO`).
3. `FormattedInstallment` expõe `receipts` (todas as baixas, data + valor); `receiptDate` passa a
   ser a **última** baixa; `receiptValue` continua sendo o somatório.
4. Extrato do cliente (`/cliente/[obra]/financeiro/extrato`), portal-viewer e PDF do extrato:
   - badge "Parcialmente pago"/"Parcial" para status `PARCIAL`;
   - parcela parcial exibe o **saldo devedor** como valor principal e o valor já pago em separado;
   - parcelas com 2+ baixas listam cada baixa (data — valor);
   - "Total pago" = soma de todas as baixas (inclusive parciais); "Total em aberto" inclui o
     saldo das parciais. No caso de referência: pago 207.154,19 / aberto 434.518,33.
5. Informe de rendimentos calculado distribui as baixas nos meses **reais** de cada baixa;
   `remainingBalance` inclui o saldo das parcelas parciais.
6. Tela de boletos: parcela parcial com boleto continua listada (cliente ainda deve) com badge
   correto.
7. Testes unitários cobrindo o mapeamento de status (pago total, parcial, boleto, aberto) e o
   informe com baixas em meses diferentes.

## Tasks

- [x] `types.ts`: `InstallmentStatus` += `"PARCIAL"`; `FormattedInstallment.receipts`.
- [x] `client.ts` `getFinancialStatement`: status por `currentBalance`; expor `receipts`;
      `receiptDate` = última baixa.
- [x] `client.ts` `computeInformeFromStatements`: iterar `receipts` por baixa.
- [x] `extrato-client.tsx`, `portal-viewer/[vinculo_id]/financeiro/page.tsx`,
      `financeiro/boleto/page.tsx`: badge PARCIAL + saldo/pago + lista de baixas.
- [x] `extrato-pdf.tsx`: badge Parcial, sub-linhas de baixas, totais corrigidos.
- [x] Testes `client.test.ts` (status + informe).
- [x] `vitest run`, `lint`, `type-check` verdes.

## Raio de impacto (verificado)

Consumidores de `getFinancialStatement`/`status`: extrato (tela+PDF, cliente e viewer), boletos
(tela+rotas), informe (PDF), cron `boleto-scan` (usa só `hasBoleto` — já correto para parcial,
`generatedBillet && currentBalance > 0`), webhook `sienge` (não usa `status`). Componentes não
atualizados que caírem no `default` do badge mostram "Em aberto" — fallback seguro, nunca "Pago".

## File List

- `packages/web/src/lib/integrations/sienge/types.ts`
- `packages/web/src/lib/integrations/sienge/client.ts`
- `packages/web/src/lib/integrations/sienge/client.test.ts` (novo)
- `packages/web/src/app/cliente/[obra_id]/financeiro/extrato/_components/extrato-client.tsx`
- `packages/web/src/app/cliente/[obra_id]/financeiro/boleto/page.tsx`
- `packages/web/src/app/portal-viewer/[vinculo_id]/financeiro/page.tsx`
- `packages/web/src/lib/pdf/extrato-pdf.tsx`
