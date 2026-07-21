# Story 75-194 — Flood de e-mails de pendência de aprovação → modelo híbrido

## Metadata
- **Status:** Done (QA PASS)
- **Epic:** 75 — CRM core (notificações de obras)
- **Branch:** fix/75-194-aprovacoes-notificacao-hibrida
- **Tipo:** Bug UX/flood — reportado pelo Marcos (print Outlook do Robson Campo,
  2026-07-21): cada upload de doc/foto em fila de aprovação disparava 1 e-mail
  POR admin/supervisor; lote da Samara = dezenas de e-mails idênticos.

## Decisão (Marcos — AskUserQuestion 2026-07-21)
**Híbrido**: janela de silêncio (tempo real sem flood) + digest diário (backlog).

## Acceptance Criteria
- [x] AC1: JANELA DE SILÊNCIO 4h — 1º upload pendente da obra avisa na hora; os
  seguintes na janela não geram e-mail (checagem: outra pendência da obra criada
  na janela, excluindo a recém-criada). Lote de 15 docs = 1 e-mail.
- [x] AC2: helper consolidado em lib/obras/aprovacao-notifications.ts (o bloco
  estava DUPLICADO nas rotas de documentos e fotos); e-mail explica a janela.
- [x] AC3: DIGEST DIÁRIO — cron aprovacoes-digest (0 11 * * * = 08:00 BRT) envia
  UM e-mail por aprovador ativo listando obras com pendências (contagens por
  tipo + mais antiga + link); zero pendências = zero e-mails.
- [x] AC4: agrupamento puro testado (groupPendencias/renderDigestHtml — 4 testes).
- [x] AC5: tsc/eslint limpos, suíte 1121/1121, next build OK.

## File List
- `packages/web/src/lib/obras/aprovacao-notifications.ts` (novo — janela + digest puro)
- `packages/web/src/lib/obras/aprovacao-notifications.test.ts` (novo)
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts` (usa helper)
- `packages/web/src/app/api/admin/obras/[obra_id]/fotos/route.ts` (usa helper)
- `packages/web/src/app/api/cron/aprovacoes-digest/route.ts` (novo)
- `packages/web/vercel.json` (cron)

## Change Log
- @sm/@po: GO (decisão de produto colhida via pergunta com opções).
- @dev (Dex): janela sem migration (deriva da própria obra_upload_aprovacoes) + cron digest.
- @qa (Quinn): PASS — janela exclui a própria pendência (sem falso-silêncio no 1º), digest só p/ ativos com e-mail, fail paths não quebram upload (.catch preservado).
- @devops (Gage): PR + merge + deploy (cron entra no próximo deploy do vercel.json).
