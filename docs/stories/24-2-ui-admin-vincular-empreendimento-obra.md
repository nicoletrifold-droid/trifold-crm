# Story 24.2 — Admin UI: Vincular Empreendimento ↔ Obra

## Status: Done

## Story

**Como** administrador,
**Quero** poder vincular/desvincular uma obra a um empreendimento diretamente nas telas de empreendimento e de obra,
**Para que** eu tenha visibilidade cruzada entre os dois sistemas e possa gerenciar o vínculo sem precisar do banco de dados.

## Contexto

Depende da Story 24.1 (coluna `property_id` em `obras`).

Duas UIs recebem a seção de vínculo:
1. **Tela do empreendimento** (`/dashboard/properties/[id]`) — mostra a obra vinculada e permite vincular/desvincular
2. **Tela da obra** (`/dashboard/obras/[id]`) — mostra o empreendimento vinculado (somente leitura, link)

## Acceptance Criteria

### API
- [ ] AC1: `GET /api/admin/properties/[id]/obra` retorna `{ obra: { id, name, status, progress_pct } | null }`
- [ ] AC2: `POST /api/admin/properties/[id]/obra` body `{ obra_id }` → vincula obra existente (atualiza `obras.property_id`)
- [ ] AC3: `DELETE /api/admin/properties/[id]/obra` → seta `obras.property_id = NULL`
- [ ] AC4: Todos os endpoints exigem autenticação com role `admin` ou `supervisor`
- [ ] AC5: Validação: se a obra selecionada já está vinculada a outro empreendimento, retorna erro 409

### UI — Tela do Empreendimento
- [ ] AC6: Nova seção "Obra Vinculada" na tela `/dashboard/properties/[id]`
- [ ] AC7: Se não há obra vinculada: exibe botão "Vincular Obra" que abre dropdown com todas as obras disponíveis (sem property_id)
- [ ] AC8: Se há obra vinculada: exibe card com nome, status, progresso % e link para `/dashboard/obras/[obra_id]`
- [ ] AC9: Card da obra vinculada tem botão "Desvincular" com confirmação
- [ ] AC10: Após vincular/desvincular, UI atualiza sem reload de página

### UI — Tela da Obra
- [ ] AC11: Nova seção "Empreendimento" na tela `/dashboard/obras/[id]` (somente leitura)
- [ ] AC12: Se obra tem property_id: exibe nome do empreendimento e link para `/dashboard/properties/[property_id]`
- [ ] AC13: Se obra não tem property_id: seção oculta ou exibe "Nenhum empreendimento vinculado"

## Escopo

**IN:**
- 3 API routes novas (`GET`, `POST`, `DELETE` em `/api/admin/properties/[id]/obra`)
- Seção "Obra Vinculada" na tela do empreendimento (componente novo)
- Seção "Empreendimento" na tela da obra (somente leitura)

**OUT:**
- Criar nova obra a partir desta tela (é Story 24.4)
- Vincular múltiplas obras ao mesmo empreendimento
- Histórico de vínculos

## Dev Notes

- Pasta da tela do empreendimento: `packages/web/src/app/dashboard/properties/[id]/`
- Pasta da tela da obra: `packages/web/src/app/dashboard/obras/[id]/`
- Seguir padrão de `clientes-tab.tsx` (Epic 20) para o componente de vínculo
- API pattern: seguir `packages/web/src/app/api/admin/obras/[obra_id]/clientes/route.ts`
- Para o dropdown de obras disponíveis: reutilizar `GET /api/admin/obras` com filtro `?sem_propriedade=true`
- Usar `requireAuth` + verificação de role conforme padrão do projeto

## Tasks

- [x] 1. Criar `packages/web/src/app/api/admin/properties/[id]/obra/route.ts` (GET, POST, DELETE)
- [x] 2. Criar componente `obra-vinculada-section.tsx` para a tela do empreendimento
- [x] 3. Adicionar parâmetro `?sem_propriedade=true` na rota `GET /api/admin/obras` para filtrar obras disponíveis
- [x] 4. Integrar `obra-vinculada-section.tsx` na tela `/dashboard/properties/[id]`
- [x] 5. Adicionar seção "Empreendimento" (leitura) na tela `/dashboard/obras/[id]`
- [x] 6. Validação: typecheck PASS, lint PASS nos arquivos da story; constraint 409 implementada na API (obra.property_id !== id → 409)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Dois admins vinculando a mesma obra simultaneamente (race condition) | Baixa | Constraint UNIQUE em `obras.property_id` + erro 409 já previsto no AC5 |
| `GET /api/admin/obras` retorna muitas obras sem paginação no dropdown | Média | Filtro `?sem_propriedade=true` reduz o conjunto; paginação deferida para backlog |
| Tela de properties/[id] sem padrão estabelecido para novas seções | Baixa | Dev Notes referencia `clientes-tab.tsx` como padrão — seguir mesmo modelo |
| Desvincular obra que tem clientes ativos no portal | Baixa | Fora do escopo desta story; `property_id = NULL` não afeta `cliente_obras` |

## Estimativa: 5h

## Dependências

- Story 24.1 (coluna property_id em obras) — MUST be Done

## Change Log

| Data | Agente | Mudança |
|------|--------|---------|
| 2026-05-11 | @pm (Morgan) | Story criada |
| 2026-05-11 | @po (Pax) | Validação GO — score 9/10 — seção Riscos adicionada — Status: Draft → Ready |
| 2026-05-11 | @dev (Dex) | Implementação completa YOLO — API GET/POST/DELETE, componente ObraVinculadaSection, filtro sem_propriedade, seção Empreendimento na obra — Status: Ready → Done |
