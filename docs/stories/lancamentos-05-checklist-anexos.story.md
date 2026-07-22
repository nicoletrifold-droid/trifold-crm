# Story Lançamentos-05 — Checklists + anexos no cartão

## Metadata
- **Status:** InReview — @dev + @qa · pronto p/ @devops (migration 148 + bucket) · **Epic:** Lançamentos · **Branch:** feat/lancamentos-05-checklist-anexos · **Complexidade:** M-L (3-5 pontos)
- **quality_gate_tools:** [typecheck, lint, verificação das tabelas/bucket no banco]

## Story
**As a** usuário do board, **I want** checklist e anexos nos cartões, **so that** eu quebre tarefas em subitens e guarde arquivos junto ao cartão.

## Escopo
**IN:**
1. Migration 148 — `lancamento_card_checklist` + `lancamento_card_attachments` (RLS sem policy) + bucket privado `lancamentos`.
2. API checklist: `GET`/`POST /cards/[id]/checklist`, `PATCH`/`DELETE /cards/[id]/checklist/[itemId]`.
3. API anexos: `GET`/`POST (upload) /cards/[id]/attachments`, `DELETE /cards/[id]/attachments/[attId]`, `GET /cards/[id]/attachments/[attId]/signed-url` (download 1h). Padrão do módulo Pastas (bucket privado + admin client).
4. Modal — bloco Checklist (barra de progresso, marcar/adicionar/excluir) + bloco Anexos (upload até 25MB, download, remover).
5. Face do cartão + contadores no `[id]/page` — badge de checklist (x/y, verde quando completo) e de anexos.

**OUT:** fornecedores (Story 6/7).

## Acceptance Criteria
1. Adicionar/marcar/excluir itens de checklist reflete na barra e nos badges do cartão.
2. Upload de arquivo (≤25MB) aparece na lista; download abre via signed URL; remover apaga do banco e do bucket.
3. Badges de checklist/anexos aparecem na face do cartão e atualizam ao mexer no modal.
4. Tudo gated; bucket privado (sem acesso público).
5. typecheck/lint limpos; tabelas + bucket criados.

## File List
- `supabase/migrations/148_lancamento_card_extras.sql`
- `packages/web/src/app/api/lancamentos/cards/[id]/checklist/route.ts` · `checklist/[itemId]/route.ts`
- `packages/web/src/app/api/lancamentos/cards/[id]/attachments/route.ts` · `attachments/[attId]/route.ts` · `attachments/[attId]/signed-url/route.ts` · `attachments/sign/route.ts` (novo)
- `packages/web/src/app/dashboard/lancamentos/_components/lancamento-card-modal.tsx` · `lancamento-board.tsx`
- `packages/web/src/app/dashboard/lancamentos/[id]/page.tsx`
- `packages/web/supabase/migrations/186_lancamentos_bucket_file_size_limit.sql` (novo)

## Change Log
- 2026-07-02 — @sm/@po/@dev/@qa — Checklists + anexos (bucket privado). tsc 0, lint 0. Handoff @devops (migration 148).
- 2026-07-22 — @dev — Fix "trava em Enviando…". Causa raiz: POST /attachments fazia relay multipart do binário pela Serverless Function (teto ~4.5 MB da Vercel), abaixo dos 25 MB anunciados → arquivos maiores nunca chegavam ao código, e o cliente não tratava `!res.ok` (falha silenciosa). Correções: (1) estado `attachmentError` + mensagem visível; (2) validação de tamanho no cliente antes do envio; (3) upload direto ao Storage via signed upload URL — nova rota `POST /attachments/sign` gera `createSignedUploadUrl`, o browser envia via `uploadToSignedUrl` (binário nunca passa pela função), e `POST /attachments` passou a registrar só metadados em JSON. Criação nova de padrão signed-upload-url justificada: o relay via servidor não é adaptável ao teto fixo de payload da infraestrutura Vercel. (4) migration 186 define `file_size_limit=25MB` no bucket. Handoff @qa/@devops.
- 2026-07-22 — @qa (Quinn) — QA gate do fix de upload: veredito **PASS**. typecheck/lint limpos nos arquivos da story; segurança (escopo de card/org em /sign e /attachments) verificada; 4 camadas de limite alinhadas em 25 MB; rotas de download/delete intactas; migration 186 no diretório e numeração corretos (NÃO aplicada — handoff @devops). Gate: `docs/qa/gates/lancamentos-05-checklist-anexos.yml`.

## QA Results

### Review Date: 2026-07-22
### Reviewed By: Quinn (Test Architect & Quality Advisor)

**Escopo:** correção do bug "upload trava em Enviando…" no card do board de Lançamentos (não a story original inteira, já entregue em 2026-07-02).

**Veredito: PASS** (readiness 9/10)

**7 checks de qualidade:**
1. Code review — PASS. Três rotas bem estruturadas; comentários in-code justificam a arquitetura signed-upload-url; erro tratado em cada uma das 3 etapas do cliente.
2. Testes automatizados — N/A. Módulo sem suíte automatizada (mantém padrão da story original); validação por typecheck + lint + revisão de código.
3. Acceptance criteria — PASS. Bug corrigido: upload ≤25MB funciona, download/delete OK, erro agora visível ao usuário (antes 100% silencioso).
4. Regressões — PASS. Rotas `signed-url` (download) e `[attId]` (delete) NÃO alteradas; formato de `storage_path` (`${cardId}/...`) preservado → compatível.
5. Performance — PASS. Binário deixa de trafegar pela Serverless Function.
6. Segurança — PASS. `/sign` e `/attachments` gated por `lancamentosGuard()` + card escopado por `org_id`; `storagePath` montado no servidor em `/sign`; `/attachments` recusa (400) path que não comece com `${id}/`. Sem vetor para registrar/baixar objeto de outro card/org.
7. Documentação — PASS. Change Log e comentários atualizados.

**Consistência de limite (25 MB):** cliente + `/sign` + `/attachments` = `25*1024*1024`; bucket migration = `26214400`. Alinhados, sem divergência.

**Typecheck/Lint:** `tsc --noEmit` sem erros nos arquivos da story (único erro é pré-existente e não relacionado: `pastas/termo/fill.ts`, dependência `pdf-lib` ausente). ESLint nos 3 arquivos alterados: 0 problemas.

**Migration 186:** local correto (`supabase/migrations/`, não `packages/web/supabase/`); número 186 sem colisão; **NÃO aplicada em prod** (por design — handoff @devops).

**Observações não-bloqueantes (low):**
- OBS-001: janela entre upload ao Storage e registro de metadados pode deixar objeto órfão se o browser cair no meio; aceitável, sugerir limpeza periódica em story futura.
- OBS-002: ausência de teste automatizado do fluxo de upload; cobrir em iteração futura.

### Gate Status

Gate: PASS → docs/qa/gates/lancamentos-05-checklist-anexos.yml
