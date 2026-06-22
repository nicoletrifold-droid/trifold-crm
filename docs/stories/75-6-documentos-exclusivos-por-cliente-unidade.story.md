# Story 75-6 — Documentos exclusivos por cliente/unidade (além dos gerais da obra)

## Metadata
- **Status:** InReview
- **Epic:** 58 — Portal do Cliente
- **Branch:** main

## Context
Hoje `obra_documentos` é só por obra (`obra_id`) e a RLS do portal mostra **todos** os docs da obra para **todos** os clientes vinculados (`cliente_obras` via `cliente_obra_ids()`). Não há como subir um documento exclusivo (ex.: contrato de compra e venda de uma unidade).

Decisões (confirmadas pelo solicitante):
- **Granularidade:** por **cliente/unidade do portal** — âncora na tabela `cliente_obras` (login do portal + `numero_unidade`), que é o que controla a visibilidade no portal.
- **UX:** seletor **"Destinatário"** no próprio form de Documentos da obra (admin), espelhando o seletor "Vincular a uma fase" do upload de fotos.

Modelo escolhido: coluna **`cliente_obra_id`** (FK opcional → `cliente_obras`) em `obra_documentos`.
- `NULL` → documento **geral** da obra (todos veem — comportamento atual).
- preenchido → **exclusivo** daquele vínculo cliente/unidade.

Vale para **todas as obras**.

## Acceptance Criteria

### Banco / RLS (@data-engineer)
- [x] AC1: Migration `104_obra_documentos_cliente_obra.sql` adiciona `cliente_obra_id uuid NULL REFERENCES cliente_obras(id) ON DELETE SET NULL` em `obra_documentos`, com índice parcial em `cliente_obra_id WHERE cliente_obra_id IS NOT NULL`.
- [x] AC2: Helper `public.cliente_obra_link_ids()` (SECURITY DEFINER, STABLE) retorna os `cliente_obras.id` do usuário logado (via `users.auth_id = auth.uid()`).
- [x] AC3: Policy SELECT do cliente em `obra_documentos` passa a ser: vê o doc se a obra está em `cliente_obra_ids()` **E** (`cliente_obra_id IS NULL` **OU** `cliente_obra_id IN cliente_obra_link_ids()`). Policy admin/supervisor (FOR ALL) inalterada.

### Upload (admin)
- [x] AC4: O form de Documentos (`doc-upload-form.tsx`) ganha um select **"Destinatário"**: opção padrão "Geral — todos da obra" (value vazio) + lista dos clientes do portal vinculados à obra, rotulados como "Nome — unidade X". Envia `cliente_obra_id` no FormData quando escolhido.
- [x] AC5: A página admin da obra carrega os vínculos de portal (`cliente_obras` + `users(name)` + `numero_unidade`) e passa a lista de destinatários para o form.
- [x] AC6: A API POST `documentos` aceita `cliente_obra_id` opcional, **valida** que ele pertence à obra (`cliente_obras.id` com `obra_id` correspondente) — se inválido, retorna 400 — e grava na inserção direta (admin/supervisor). No caminho de fila (role "obras"), guarda `cliente_obra_id` no `metadata`.
- [x] AC7: Ao **aprovar** um documento da fila (`aprovacoes/[id]`), o `cliente_obra_id` do metadata é propagado para `obra_documentos`.

### Exibição
- [x] AC8: Na lista admin de documentos, cada item indica o destinatário: selo "Geral" quando `cliente_obra_id` é null, ou "Exclusivo: Nome — unidade X" quando preenchido.
- [x] AC9: No portal, sem mudança de código necessária: a RLS garante que cada cliente vê os docs gerais + os exclusivos dele. (Verificar que docs exclusivos de outro cliente não aparecem.)

### Geral
- [x] AC10: Sem regressão: docs gerais existentes (todos com `cliente_obra_id` null) continuam visíveis para todos os clientes da obra. Migration aplicada antes/junto do deploy do código (dependência registrada para @devops).

## Out of Scope
- Fotos exclusivas por cliente (só documentos nesta story).
- Vínculo por `numero_unidade` em texto livre ou por cliente do CRM (escolhido `cliente_obras`).
- Reatribuir destinatário de um documento já enviado (editar) — pode ser evolução futura.
- Marcador visual "Seu documento" no portal (RLS já filtra; UI do portal inalterada).

## Dependencies
- Migration deve ser aplicada em produção no deploy (Supabase). Código que lê/grava `cliente_obra_id` depende da coluna existir.

## Complexity
- **T-shirt:** M (migration + RLS + helper, form, plumbing na página, API POST, propagação na aprovação, selo na lista admin).

## Business Value
Permite enviar documentos sensíveis e individuais (contratos, distratos, recibos) direto pra unidade certa, sem expor a todos os clientes da obra — caso de uso central pra incorporadora.

## Risks
- **Médio (RLS):** erro na policy pode vazar doc de um cliente para outro, ou esconder docs gerais. Mitigação: revisão cuidadosa da policy + verificação pós-deploy (testar com 2 clientes distintos).
- Dependência de ordem no deploy (migration antes do código).

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS (inclui revisão da RLS), migration aplicada e verificada via @devops, deploy via @devops.

## File List
- `docs/stories/75-6-documentos-exclusivos-por-cliente-unidade.story.md` (this file)
- `supabase/migrations/104_obra_documentos_cliente_obra.sql` (new)
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` (load destinatários)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/obra-detail-tabs.tsx` (prop + selo na lista)
- `packages/web/src/app/dashboard/obras/[obra_id]/_components/doc-upload-form.tsx` (select Destinatário)
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts` (aceita/valida cliente_obra_id)
- `packages/web/src/app/api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts` (propaga cliente_obra_id)

## Dev Notes (@dev / Dex)
- @data-engineer: migration `104_obra_documentos_cliente_obra.sql` — coluna `cliente_obra_id` (FK cliente_obras, ON DELETE SET NULL) + índice parcial + helper `cliente_obra_link_ids()` + nova policy SELECT do cliente (escopo obra E (null OU vínculo do usuário)). Para docs `null` a policy é equivalente à atual → retrocompatível.
- Página admin: query nova de `cliente_obras` (id, numero_unidade, users(name,email)); monta `docDestinatarios` ({id,label}); `cliente_obra_id` adicionado ao select de documentos; props passadas ao tabs.
- `obra-detail-tabs.tsx`: interface Documento + `cliente_obra_id`; prop `docDestinatarios`; mapa id→label; selo "Geral"/"Exclusivo: <label>" na lista; passa destinatários ao DocUploadForm.
- `doc-upload-form.tsx`: prop `destinatarios`, select "Destinatário" (Geral padrão), envia `cliente_obra_id`.
- POST `documentos`: lê `cliente_obra_id`, valida pertencer à obra (`cliente_obras` + obra_id) → 400 se inválido; insert direto grava a coluna; caminho de fila ("obras") guarda no metadata.
- `aprovacoes/[id]`: ao aprovar documento, propaga `meta.cliente_obra_id` para `obra_documentos`.
- type-check 0 erros no escopo; eslint EXIT 0.

## QA Results (@qa / Quinn)
**Veredito: PASS** (com ressalva de verificação pós-deploy) — AC1–AC10. Código: validação de vínculo↔obra (400), selo admin, propagação na aprovação, gate por canal preservado. Seletor verificado com dados reais (43 destinatários no Yarden; rótulo cai pro nome quando `numero_unidade` ausente — só 2/43 preenchidos). RLS revisada estaticamente e é retrocompatível p/ docs gerais (`cliente_obra_id` null). type-check/eslint OK.
**Pendências p/ @devops:** (1) aplicar a migration 104 ANTES/junto do deploy do código (dependência de ordem); (2) verificar RLS em produção com 2 clientes distintos (doc exclusivo de um NÃO pode aparecer para outro).

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO (riscos RLS e ordem de deploy registrados). Status Draft → Ready.
- @data-engineer (Dara): migration 104 (coluna + índice + helper + RLS).
- @dev (Dex): form/página/tabs/API/aprovação implementados. Status Ready → InReview.
- @qa (Quinn): QA gate PASS (estático + dados reais); RLS a verificar pós-deploy. Pronta para @devops *push (aplicar migration 104).
