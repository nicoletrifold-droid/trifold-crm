# Story 75-175 — Notificação de novo documento: por CLIENTE, não pela obra inteira

## Metadata
- **Status:** Done
- **Epic:** — (bug de produção achado pelo Marcos, 2026-07-17)
- **Branch:** fix/75-175-notif-doc-por-cliente

## Context
Achado do diretor: a Samara subiu 39 documentos EXCLUSIVOS de unidade (cada um com
`obra_documentos.cliente_obra_id`) para 11 clientes do Vind — mas o WhatsApp "Novo documento
disponível" **caiu para 30 clientes** (a obra inteira). 19 pessoas foram avisadas de documento
que não é delas.

Diagnóstico:
- **Sem vazamento** (verificado): a RLS `obra_documentos_select_cliente` já escopa por
  `cliente_obra_id` — cada cliente só VÊ os próprios docs no portal. Era só ruído de notificação.
- **Causa:** `notifyClientes(obraId, "novo_documento", ...)` faz fan-out por OBRA, ignorando o
  `cliente_obra_id` do documento. Quando o doc virou "por unidade", a notificação não acompanhou.
- **Coalescing** agravava: a janela por (obra, grupo) fazia 1 aviso da obra suprimir os demais —
  então um lote de 39 docs para 11 clientes virou um disparo único para todos.

## Regra (confirmada pelo diretor)
- Documento de UNIDADE (`cliente_obra_id` != null) → notifica **só o dono da unidade**.
- Documento GERAL da obra (`cliente_obra_id` null) → notifica **todos**, como hoje.
- Foto / progresso / mensagem → inalterados (sempre da obra).

## Acceptance Criteria
- [x] AC1: `notifyClientes` aceita `opts.clienteObraId`; quando presente, destinatários = só o
  dono daquele `cliente_obras.id` (query `.eq("id", clienteObraId)`); nulo = fan-out original.
- [x] AC2: Coalescing por cliente quando targetado — chave `novo_documento:<clienteObraId>` →
  um lote com docs de N unidades gera 1 aviso POR unidade (antes: 1 aviso da obra suprimia todos).
- [x] AC3: Upload direto (`documentos/route.ts`) e aprovação de upload (`aprovacoes/[id]`) passam
  o `cliente_obra_id` do doc; foto na aprovação passa null (obra-wide).
- [x] AC4: Distrato + prefs por canal continuam respeitados; degradação segura mantida.
- [x] AC5: Testes (chave por cliente vs obra) + type-check/lint/suíte verdes (1066/1066).

## Out of Scope
- Reenvio retroativo para os 19 avisados hoje (não dá pra "desnotificar"; só passa a valer daqui).
- Mudar RLS/portal (já corretos).

## File List
- `docs/stories/75-175-notif-documento-por-cliente.story.md` (this file)
- `packages/web/src/lib/notificacoes.ts` (+ `.test.ts`)
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts`
- `packages/web/src/app/api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts`

## Change Log
- @dev (Dex): targeting por cliente_obra_id + coalescing por cliente + 2 callers de documento.
- @qa (Quinn): PASS — confirmado que clienteObraId da rota == cliente_obras.id (destinatário e
  RLS coerentes); fotos permanecem obra-wide; sem vazamento (RLS já escopava).
- @devops (Gage): CI verde, squash-merge PR #235, deploy prod automático. Status InReview → Done.
