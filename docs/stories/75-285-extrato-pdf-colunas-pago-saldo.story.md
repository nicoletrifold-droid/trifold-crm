# Story 75-285 — PDF do extrato: coluna "Saldo/Pago" vira duas colunas "Pago" e "Saldo"

**Story ID:** 75-285
**Epic:** 75 (CRM Trifold) · **Status:** InReview (PR aberto) · **Estimativa:** S (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint]
- **Dependências:** 75-284 (mergeada, #375). Toca só `lib/pdf/extrato-pdf.tsx`.

---

## Story

Como **cliente lendo o PDF do extrato**, quero ver claramente quanto **paguei** e quanto ainda
**devo** em cada parcela — a coluna "Saldo/Pago" mudava de significado conforme o status (pago
na quitada, saldo devedor na aberta), o que exige leitura dupla.

## Context

Pedido do Marcos em 07/08, após validar a 75-284 em prod. "Valor Parcela" foi descartado: a
célula não contém o valor da parcela (que é a coluna "Valor Original") e "Parcela" colide com a
1ª coluna. Decisão: **duas colunas**, como o extrato do Sienge ("Valor baixa" × "Saldo atual").

## Acceptance Criteria

1. Tabela do PDF passa a ter colunas **Pago** e **Saldo** no lugar de "Saldo/Pago".
2. Parcela quitada: Pago = somatório das baixas; Saldo = R$ 0,00.
3. Parcela parcial: Pago = somatório das baixas; Saldo = saldo devedor (`currentBalance`).
4. Parcela sem baixa: Pago = "—"; Saldo = `currentBalance > 0 ? currentBalance : originalValue`.
5. Sub-linhas de baixa alinham o valor sob a coluna Pago; o resumo "pago X · saldo Y" da última
   baixa sai (redundante com as novas colunas).
6. Larguras fecham 100% sem quebra de linha; totais do rodapé inalterados.

## Tasks

- [x] `extrato-pdf.tsx`: colunas + larguras + sub-linhas.
- [x] Render real do PDF com parcela quitada/parcial/aberta (verificação visual).
- [x] `vitest run`, `lint`, `type-check` verdes.

## File List

- `packages/web/src/lib/pdf/extrato-pdf.tsx`
