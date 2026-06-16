# Story 58-2 — Filtro por Unidade no Extrato Financeiro

## Metadata
- **Status:** Done
- **Epic:** 58 — Portal do Cliente — Multi-Unidade
- **Branch:** main

## Context
Clientes com múltiplas unidades no mesmo empreendimento (ex: Holding Medeiros com 3 unidades no Yarden) visualizam o extrato com todas as parcelas misturadas, sem forma de saber qual parcela pertence a qual unidade. Cada unidade tem um `documentId` distinto vindo do Sienge (ex: YAR-602, YAR-1302, YAR-502). O cliente precisa poder filtrar o extrato por unidade para entender sua situação financeira de cada imóvel separadamente.

## Acceptance Criteria

- [x] **AC1 — Detecção automática:** se o extrato tiver parcelas com 2+ `documentId` únicos, exibir o seletor de unidade. Com 1 `documentId` único, não exibir nada.
- [x] **AC2 — Seletor de unidade:** dropdown ou tabs acima do filtro de período com opção "Todas as unidades" + uma opção por `documentId` único (ex: "YAR-602", "YAR-1302")
- [x] **AC3 — Filtro client-side:** o seletor funciona sobre os dados já carregados — sem nova requisição ao Sienge
- [x] **AC4 — Resumo atualizado:** os cards "Pago" e "Em aberto" refletem apenas as parcelas da unidade selecionada
- [x] **AC5 — PDF com filtro:** o link "Gerar PDF" preserva o filtro de unidade selecionado via query string (`?unidade=YAR-602`)
- [x] **AC6 — URL persistente:** filtro de unidade via `?unidade=` em `searchParams`, igual ao filtro de período já existente (`?de=&ate=`)
- [x] **AC7 — Mobile first:** seletor funciona bem em telas pequenas (dropdown nativo `<select>` ou tabs com scroll horizontal)
- [x] **AC8 — Tema dark:** sem `dark:` condicional, portal é sempre dark

## Out of Scope
- Renomear `documentId` para número de unidade amigável (depende de cadastro no Sienge)
- Filtro por unidade no boleto (página separada)
- Filtro por unidade no Informe de Rendimentos

## File List
- `docs/stories/58-2-portal-extrato-filtro-unidade.story.md` (this file)
- `packages/web/src/app/cliente/[obra_id]/financeiro/extrato/page.tsx` (updated — ler `unidade` de searchParams, passar para componente)
- `packages/web/src/app/cliente/[obra_id]/financeiro/extrato/_components/extrato-client.tsx` (new — client component com seletor de unidade + lógica de filtro)

## Dev Notes
- Os dados vêm de `getFinancialStatement(siengeCustomerId)` — são `FormattedInstallment[]`
- `FormattedInstallment.documentId` é o identificador do contrato/unidade (ex: "YAR-602")
- A page atual é um server component puro; para o seletor interativo, extrair a parte da listagem para um client component `ExtratoClient` que recebe `installments: FormattedInstallment[]` e `unidadeInicial?: string`
- O filtro de período (`de`, `ate`) e o filtro de unidade (`unidade`) devem coexistir — aplicados em sequência
- Para o PDF: a API em `/api/cliente/obras/[obra_id]/financeiro/extrato/pdf` já recebe `de` e `ate` via query string; adicionar `unidade` ao mesmo padrão
