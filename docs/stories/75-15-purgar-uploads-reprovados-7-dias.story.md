# Story 75-15 — Uploads reprovados: manter 7 dias e purgar (arquivo + registro)

## Metadata
- **Status:** InReview
- **Epic:** 58 — Obras/Aprovações
- **Branch:** main

## Context
Antes, rejeitar um upload removia o arquivo do Storage na hora. Decisão (híbrido): manter o **arquivo + motivo visíveis por 7 dias** (para o perfil obras entender a recusa) e depois eliminar arquivo e registro, evitando material obsoleto ocupando espaço.

## Acceptance Criteria
- [x] AC1: A rejeição NÃO remove mais o arquivo do Storage imediatamente (handler de aprovações). O registro fica com status 'rejeitado' + motivo + reviewed_at.
- [x] AC2: Cron `api/cron/purge-rejected-uploads` (Bearer CRON_SECRET) remove, após 7 dias do `reviewed_at`: o arquivo do Storage (foto/documento) E o registro.
- [x] AC3: Para `exclusao_foto` rejeitado, o cron remove apenas o REGISTRO — nunca o `storage_path` (que aponta para a foto viva).
- [x] AC4: Agendado em `vercel.json` (diário, 04:00).

## Out of Scope
- UI de "lixeira"/restauração de reprovados.

## Dependencies
- `CRON_SECRET` (já existe). `reviewed_at` em obra_upload_aprovacoes.

## Complexity
- **T-shirt:** S (mudança no reject + 1 cron + schedule).

## Risks
- Baixo/médio. Cuidado central: cron nunca apaga storage de exclusao_foto (foto viva). Coberto por AC3.

## File List
- `packages/web/src/app/api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts` (reject não remove storage)
- `packages/web/src/app/api/cron/purge-rejected-uploads/route.ts` (new)
- `packages/web/vercel.json` (cron diário)

## QA Results (@qa / Quinn)
**Veredito: PASS** (estático) — reject preserva arquivo; cron purga foto/documento (arquivo+registro) após 7d e só o registro de exclusao_foto. type-check/eslint OK. Verificar pós-deploy (e que o cron roda).

## Change Log
- @sm/@po/@dev/@qa: criada, validada, implementada, QA PASS. Pendente @devops push.
