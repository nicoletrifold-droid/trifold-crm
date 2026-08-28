# Story 75-369 — Extrato: só Recebimento e Abatimento de Adiantamento contam como pagamento

**Story ID:** 75-369
**Epic:** 75 (CRM Trifold) · **Status:** Ready for Review · **Estimativa:** S (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Dependências:** continuação direta da correção de Reparcelamento (PR #508, commit `10c377f3`).
  Toca `lib/integrations/sienge/installments.ts` e as três telas que consomem
  `FormattedInstallment` (portal-viewer, extrato do cliente, PDF).

---

## Story

Como **cliente que abre o extrato no portal**, quero que o "total pago" bata com o extrato
oficial do Sienge — hoje o portal soma baixas que não são dinheiro que eu paguei (substituição
de título, cancelamento, distrato, bonificação, repactuação), inflando o valor.

---

## Context

O PR #508 corrigiu **um** tipo de baixa: `Reparcelamento`. A varredura da base completa
(1.482 clientes, 1.112 com extrato, 26/08/2026) encontrou **mais 9 tipos** de baixa que o portal
ainda conta como pagamento, somando **R$ 159.292.242,28**.

Documento enviado ao financeiro: `sienge-tipos-de-baixa-conferencia-financeiro.pdf`.

### Decisão do financeiro (Robson, 28/08/2026, WhatsApp)

> "Desses tipos de baixa, o que faz sentido reconhecer como baixa de parcela dos contratos são:
> **Recebimento** e **Abatimento de Adiantamento**."

A decisão **diverge** da recomendação do documento em um ponto, e a leitura dele é a correta para
o que o portal exibe (baixa de parcela de contrato):

| Tipo | Documento sugeria | Decisão do financeiro |
|---|---|---|
| Adiantamento | ENTRA (dinheiro entrou em conta de banco/caixa) | **NÃO ENTRA** — é crédito, não quita parcela |
| Abatimento de Adiantamento | NÃO ENTRA (evitar dobra) | **ENTRA** — é o momento em que o crédito quita a parcela |

Contar os dois dobraria o valor. Contando só o Abatimento, o dinheiro do adiantamento aparece
uma única vez, e no momento em que vira quitação de parcela.

### Panorama da base (todos os tipos encontrados)

| Tipo de baixa | Baixas | Clientes | Valor total | Conta como pagamento? |
|---|---:|---:|---:|---|
| Recebimento | 51.556 | 1.087 | R$ 548.790.777,41 | **SIM** |
| Abatimento de Adiantamento | 599 | 27 | R$ 3.595.609,69 | **SIM** |
| Reparcelamento | 5.691 | 362 | R$ 96.868.622,99 | não (já corrigido no #508) |
| Substituição | 934 | 69 | R$ 85.677.658,65 | não |
| Cancelamento | 335 | 118 | R$ 25.723.036,52 | não |
| Adiantamento | 732 | 44 | R$ 23.760.071,54 | não |
| Distrato | 664 | 41 | R$ 19.171.693,74 | não |
| Outros | 43 | 23 | R$ 899.319,96 | não |
| Bonificação | 5 | 5 | R$ 316.725,49 | não |
| Repactuação | 1.601 | 153 | R$ 148.116,82 | não |
| Outros com Resíduo | 256 | 86 | R$ 9,87 | não |

Impacto: o "total pago" exibido no portal cai **R$ 155.696.632,59** (os 9 tipos que saem, menos
o Abatimento que entra). O **saldo devedor não muda** em nenhum cenário.

### Causa-raiz — a regra é uma blacklist com default permissivo

`packages/web/src/lib/integrations/sienge/installments.ts:22`:

```ts
export const NON_CASH_RECEIPT_TYPES = ["reparcelamento"]
// ...
export function isCashReceipt(receipt: SiengeReceipt): boolean {
  const type = receipt.receiptType
  if (!type) return true
  return !NON_CASH_RECEIPT_TYPES.includes(normalize(type))
}
```

Qualquer tipo fora da lista conta como pagamento. Foi assim que 9 tipos passaram despercebidos.

### Efeito colateral que precisa ser tratado junto

Parcela cuja única baixa deixa de ser "dinheiro" e tem `currentBalance <= 0` cai hoje no status
`RENEGOCIADA`, que a UI rotula **"Renegociada"**. Com a nova regra isso passa a valer também para
distrato, cancelamento, substituição e adiantamento — chamar um distrato de "renegociada" é
informação errada na tela do cliente. O rótulo precisa refletir o tipo real da baixa.

---

## Acceptance Criteria

1. **AC1** — Só `Recebimento` e `Abatimento de Adiantamento` entram em `receipts` (e portanto em
   `receiptValue`, no total pago e no informe de rendimentos). Comparação insensível a
   acento/caixa, como hoje.
2. **AC2** — Os outros 9 tipos conhecidos vão para `nonCashReceipts` e não somam em lugar nenhum.
3. **AC3** — Tipo **desconhecido** (novo no Sienge) **não** conta como pagamento — inverte o
   default permissivo que causou este bug. `collectUnknownReceiptTypes()` continua apontando o
   tipo novo para auditoria.
4. **AC4** — `receiptType` ausente/nulo continua contando como pagamento (comportamento
   histórico da API; não há tipo para julgar).
5. **AC5** — O saldo devedor (`getOpenBalance`) não muda para nenhum tipo: parcela baixada sem
   dinheiro continua valendo 0.
6. **AC6** — A UI (portal-viewer, extrato do cliente e PDF) rotula a parcela pelo tipo real da
   baixa: Renegociada, Substituída, Cancelada, Distratada, Adiantamento, Bonificada, Repactuada
   e "Baixada" como fallback.
7. **AC7** — Testes cobrindo cada um dos 11 tipos + tipo desconhecido + tipo ausente.

---

## Tasks / Subtasks

- [x] **T1** — `installments.ts`: trocar blacklist por allowlist (`CASH_RECEIPT_TYPES`), listar
      os 9 tipos não-caixa conhecidos, inverter o default de desconhecido (AC1, AC2, AC3, AC4)
- [x] **T2** — `installments.ts`: helper de rótulo da baixa não-caixa (AC6)
- [x] **T3** — Aplicar o rótulo nas três telas: portal-viewer, extrato-client, extrato-pdf (AC6)
- [x] **T4** — Atualizar comentários de `types.ts` (o campo não fala mais só de reparcelamento)
- [x] **T5** — Testes em `client.test.ts` (AC7) + regressão completa (vitest, typecheck, lint)

---

## Dev Agent Record

### Agent Model Used
claude-opus-5[1m] (@dev / Dex)

### Debug Log References
- `npx vitest run` → 260 arquivos, 3.248 testes, exit 0
- `npx tsc --noEmit -p packages/web/tsconfig.json` → exit 0
- `npm run lint` (packages/web) → exit 0, 0 errors (38 warnings pré-existentes, nenhum nos
  arquivos tocados)
- Teste de mutação (validar que os testes reprovam de verdade): restaurando o comportamento
  anterior em `isCashReceipt` (blacklist só com `reparcelamento`, default permissivo),
  **18 dos 39 testes falham**. Com a allowlist correta, 39/39 passam.

### Completion Notes List
- A regra virou **allowlist** (`CASH_RECEIPT_TYPES`): só `recebimento` e
  `abatimento de adiantamento`. A blacklist antiga com default permissivo foi o que deixou
  9 tipos passarem despercebidos — invertê-la é a correção de raiz, não só a lista.
- **Tipo desconhecido agora não conta** (AC3). É a única mudança de política além da lista:
  se o Sienge criar um tipo novo, o portal deixa de exibir a mais e o tipo aparece em
  `collectUnknownReceiptTypes()` para o financeiro classificar. O risco simétrico existe —
  se o tipo novo for pagamento real, o portal exibe a menos até alguém classificá-lo.
- **Efeito colateral tratado:** milhares de parcelas passam de "Pago" para o status interno
  `RENEGOCIADA`. O rótulo na tela deixou de ser fixo ("Renegociada") e passa a vir do tipo
  real da baixa (`getNonCashLabel`) — chamar um distrato de "renegociada" seria informação
  errada para o cliente. A nota explicativa das três telas também foi generalizada.
- **Informe de rendimentos (IRPF):** a lógica acompanha automaticamente
  (`computeInformeFromStatements` soma `inst.receipts`), mas o recurso está desativado em
  produção desde o PR #508 (`INFORME_RENDIMENTOS_ENABLED = false`) — sem impacto imediato.
- **Saldo devedor não muda** em nenhum cenário — coberto por teste em cada um dos 9 tipos.
- CodeRabbit CLI não executado localmente; o review automatizado deste repo é o GitHub App,
  que roda no PR.
- **Pendente de conciliação:** o financeiro vai enviar o extrato do Sienge de cada contrato
  para conferir contra a tela. Só depois disso a regra está validada com dados reais.

### File List
| Arquivo | Mudança |
|---|---|
| `docs/stories/75-369-extrato-tipos-de-baixa-pagamento.story.md` | novo |
| `packages/web/src/lib/integrations/sienge/installments.ts` | allowlist + `getNonCashLabel` |
| `packages/web/src/lib/integrations/sienge/types.ts` | comentários dos campos de baixa |
| `packages/web/src/lib/integrations/sienge/client.ts` | reexports + comentários |
| `packages/web/src/lib/integrations/sienge/client.test.ts` | +18 testes |
| `packages/web/src/app/portal-viewer/[vinculo_id]/financeiro/page.tsx` | rótulo e nota |
| `packages/web/src/app/cliente/[obra_id]/financeiro/extrato/_components/extrato-client.tsx` | rótulo e nota |
| `packages/web/src/lib/pdf/extrato-pdf.tsx` | rótulo e nota |

### Change Log
| Data | Autor | Mudança |
|---|---|---|
| 2026-08-28 | @dev | Story criada a partir da decisão do financeiro (WhatsApp 28/08) |
| 2026-08-28 | @dev | T1–T5 implementadas; testes, typecheck e lint verdes → Ready for Review |

---

## QA Results

**Reviewer:** @qa (Quinn) · **Data:** 2026-08-28 · **Gate:** `docs/qa/gates/75-369-extrato-tipos-de-baixa-pagamento.yml`

### Verdict: CONCERNS (não bloqueia merge) · Readiness 8/10

| Check | Resultado |
|---|---|
| Code review | PASS — a regra vive numa fonte única (`installments.ts`); os consumidores herdam |
| Testes | PASS — 260 arquivos / 3.248 testes; 39 no arquivo tocado (18 novos) |
| Mutação | PASS — restaurado o comportamento antigo, 18 dos 39 falham. Os testes reprovam de verdade |
| ACs | PASS — AC1 a AC7 rastreados no gate, cada um com o teste que o cobre |
| Regressões | PASS — varredura dos consumidores abaixo |
| Typecheck / Lint | PASS — exit 0 nos dois; nenhum warning novo |
| Segurança | n/a — sem input externo novo, sem query, sem credencial |

### Varredura de regressão

- `api/cron/boleto-scan` filtra por `hasBoleto` (`generatedBillet && currentBalance > 0`), que não
  olha `receipts`. Intacto.
- `cliente/financeiro/boleto` filtra `hasBoleto && status !== "PAGO"`. Parcela baixada sem pagamento
  tem `currentBalance <= 0`, logo `hasBoleto` é `false` — não vira boleto fantasma.
- `computeInformeFromStatements` soma `inst.receipts` e exclui `RENEGOCIADA` do saldo restante:
  acompanha a nova regra sem mudança.
- Nenhum cache ou persistência de "total pago" — todos os consumidores chamam
  `getFinancialStatement` direto no Sienge. Não há dado velho para invalidar após o deploy.

### Concerns

- **C1 (MEDIUM) — a regra ainda não foi conferida contra dados reais.** Está provada em teste
  unitário; a lista dos 9 tipos veio de uma varredura ad-hoc que não ficou versionada como script. A
  conciliação combinada com o financeiro (extrato do Sienge por contrato × tela) é o que fecha isso.
  É o motivo de não ser PASS limpo.
- **C2 (MEDIUM) — o default restritivo pode esconder um pagamento de tipo novo.** Trade-off aceito e
  documentado; registrado como débito em `docs/backlog.md` (alerta via `collectUnknownReceiptTypes`).
- **C3 (LOW) — mudança visível para o cliente.** Milhares de parcelas deixam de exibir "Pago" e
  passam a exibir "Distratada", "Cancelada" ou "Adiantamento". É o efeito pretendido, mas o
  financeiro precisa saber antes do deploy para não ser pego por ligação de cliente.

### Nota sobre o rótulo

O `getNonCashLabel` foi a decisão certa e não era escopo óbvio: sem ele a tela chamaria um distrato
de "Renegociada" — trocaria um número errado por uma palavra errada.
