# Story 78-2 — Visão Mestre: download de boleto (PDF) + extrato (PDF)

## Metadata
- **Status:** InReview
- **Epic:** 78 — Portal do Cliente: Visão Mestre / Monitoramento
- **Branch:** feat/78-2-viewer-boleto-extrato-pdf

## Context
A Story 78-1 (Visão Mestre "ver como cliente") entregou o Financeiro em leitura mostrando as parcelas, mas **sem** os botões "Ver boleto" (PDF) e "Gerar PDF" do extrato — porque no portal real esses botões usam rotas `/api/cliente/...` gated pela **sessão do próprio cliente** (auth de cliente + RLS), que quebrariam para o admin. Ficou como follow-up. Esta story adiciona os dois no viewer, resolvendo o cliente **pelo vínculo** com admin client.

## Acceptance Criteria
- [x] AC1: Na aba Financeiro do viewer, cada parcela com `hasBoleto` e status ≠ PAGO exibe "Ver boleto" que abre o PDF do boleto (redirect para a URL do Sienge via `getPaymentSlip`).
- [x] AC2: Há um botão "Gerar PDF do extrato" que baixa o PDF do extrato (mesmo `ExtratoPDF` do portal), respeitando o filtro de contrato do vínculo.
- [x] AC3: As rotas novas são gated a admin/supervisor (`requireAuth` + `requireRole`), resolvem o cliente pelo **vínculo** (`getViewerVinculo`, escopado por org) e mantêm a **prevenção de IDOR** do boleto (parcela precisa pertencer ao `sienge_customer_id` do vínculo).
- [x] AC4: Sem sessão/role → 401/403; cliente sem `sienge_customer_id` → 404 amigável. Nenhuma escrita (leitura apenas).
- [x] AC5: Nenhuma mudança nas rotas `/api/cliente/*` do portal real.

## Out of Scope
- Filtros de período (de/ate) na UI do viewer (as rotas aceitam via query, mas a tela usa o extrato completo).
- Alterar a geração de PDF (`ExtratoPDF`) — reuso direto.

## Complexity
- **T-shirt:** S (2 rotas API novas espelhando as do portal + 2 botões na página; reuso de `getViewerVinculo`/`getPaymentSlip`/`ExtratoPDF`).

## Business Value
Completa a Visão Mestre: o gestor consegue baixar o boleto e o extrato PDF de qualquer cliente para conferência/atendimento, sem precisar logar como o cliente.

## Risks
- Baixo. Rotas espelham as do portal já em produção; diferença = resolução por vínculo + gate admin. IDOR mantido no boleto.

## Definition of Done
- ACs atendidos; `tsc`+ESLint limpos; smoke de runtime (401 sem sessão); QA gate PASS; push/deploy via @devops; confirmação do usuário clicando um boleto/extrato reais.

## File List
- `docs/stories/78-2-visao-mestre-download-boleto-extrato-pdf.story.md`
- `packages/web/src/app/api/dashboard/portal-cliente/[vinculo_id]/boleto/route.ts` (novo)
- `packages/web/src/app/api/dashboard/portal-cliente/[vinculo_id]/extrato-pdf/route.ts` (novo)
- `packages/web/src/lib/portal/viewer.ts` (ViewerContext += clienteCpf)
- `packages/web/src/app/dashboard/portal-cliente/[vinculo_id]/financeiro/page.tsx` (botões)

## Dev Agent Record (@dev / Dex)
### Completion Notes
- `boleto/route.ts`: gate admin/supervisor; `getViewerVinculo` → sienge_customer_id; valida a parcela via `getFinancialStatement` (anti-IDOR); `getPaymentSlip` → `redirect(urlReport)`.
- `extrato-pdf/route.ts`: idem; `getFinancialStatement` + filtro `contractNumbers` + de/ate; `renderToBuffer(ExtratoPDF)` com nome/cpf do cliente do vínculo (adicionado `clienteCpf` ao `ViewerContext`).
- `financeiro/page.tsx`: "Gerar PDF do extrato" (quando há parcelas) + "Ver boleto" por parcela (hasBoleto && !PAGO), apontando para as rotas do viewer.
- Verificação: `tsc`+ESLint limpos; smoke runtime — ambas as rotas retornam 401 sem sessão (gate OK), sem 500/erro de compilação.

## QA Results (@qa / Quinn)
_(preencher no gate)_

## Change Log
- @sm/@po/@dev: story criada, validada (GO) e implementada. Status → InReview.
