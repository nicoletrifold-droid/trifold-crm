# Story 75-88 — Kanban IMOB (board estilo Trello)

**Status:** Done
**Épico:** 75 — CRM
**Depende de:** 75-87 (módulo IMOB / item de menu)

## Contexto
O módulo IMOB (Story 75-87) é para imobiliárias externas que ajudam na venda dos
empreendimentos. Esta story entrega o **board estilo Trello/Kanban** dentro do módulo,
com todas as funcionalidades operando.

## Escopo (o que foi entregue)
- **Board único por org**, visível só para **admin/supervisor** (mesmo gate da Story 75-87).
- **Colunas (listas/etapas)**: criar (botão `+`), renomear (inline), excluir (`×`, cascata nos cards). Semeia 4 etapas padrão na 1ª vez ("A contatar", "Em negociação", "Visita agendada", "Fechado").
- **Cartões**: criar inline por coluna, editar título/descrição, excluir.
- **Drag-and-drop** (@dnd-kit): mover cartão entre colunas e reordenar dentro da coluna; persiste layout completo em `/api/imob/cards/reorder`.
- **Discussão** (comentários por cartão): thread com autor + data, adicionar comentário (Enter envia) — a "parte de discussão do Trello".

## Banco — migration 129_imob_kanban.sql
- `imob_columns(id, org_id, title, position, created_at)`
- `imob_cards(id, org_id, column_id→imob_columns ON DELETE CASCADE, title, description, position, created_by, created_at, updated_at)`
- `imob_card_comments(id, org_id, card_id→imob_cards ON DELETE CASCADE, user_id, body, created_at)`
- **RLS habilitada nas 3 tabelas, SEM policies** — acesso exclusivamente via admin client por trás de API gated (`imobGuard`).

## Arquivos
- `supabase/migrations/129_imob_kanban.sql`
- `packages/web/src/lib/imob/guard.ts` — `imobGuard()` (requireAuth + role admin/supervisor → admin client)
- `packages/web/src/app/api/imob/columns/route.ts` (POST)
- `packages/web/src/app/api/imob/columns/[id]/route.ts` (PATCH, DELETE)
- `packages/web/src/app/api/imob/cards/route.ts` (POST)
- `packages/web/src/app/api/imob/cards/[id]/route.ts` (PATCH, DELETE)
- `packages/web/src/app/api/imob/cards/reorder/route.ts` (POST)
- `packages/web/src/app/api/imob/cards/[id]/comments/route.ts` (GET, POST)
- `packages/web/src/app/dashboard/imob/page.tsx` — server component (gate + load + seed)
- `packages/web/src/app/dashboard/imob/_components/imob-board.tsx` — board client (DnD, CRUD)
- `packages/web/src/app/dashboard/imob/_components/imob-card-modal.tsx` — modal detalhe + discussão

## QA
- `type-check`: 0 erros. `lint`: 0 nos arquivos IMOB.
- Migration + fluxo (coluna→card→comentário→reorder) validados em transação com rollback contra o banco de produção: 1/1/1, RLS on, 0 policies.

## Decisões
- Sem policies de RLS: igual aos outros módulos sensíveis, leitura/escrita passam só pela API gated com service role. Isola o módulo do resto do sistema (zero impacto em features existentes).
- Board único por org (não por usuário) — todos os admins/supervisores veem o mesmo quadro.
