status: Done

# Story 4.2 — Etapas Configuraveis do Pipeline

## Contexto
O admin precisa poder personalizar as etapas do pipeline sem depender de desenvolvedor. Etapas default ja vem no seed (Novo, Qualificado, Agendado, Visitou, Negociando, Fechou, Perdido), mas o admin pode criar novas, reordenar, mudar cores e definir quais sao etapas finais (ganho/perdido). A tabela `kanban_stages` ja existe no schema (Story 1.2) — esta story cobre o backend (API) e a logica. A interface admin completa e coberta no Bloco 5 (Story 5.6).

## Acceptance Criteria
- [ ] AC1: API route `GET /api/pipeline/stages` retorna todas as etapas da org, ordenadas por `position`
- [ ] AC2: API route `POST /api/pipeline/stages` cria nova etapa (admin/supervisor only)
- [ ] AC3: API route `PATCH /api/pipeline/stages/[id]` atualiza etapa (nome, cor, position, is_final)
- [ ] AC4: API route `DELETE /api/pipeline/stages/[id]` faz soft delete (apenas se nao tiver leads vinculados)
- [ ] AC5: API route `PATCH /api/pipeline/stages/reorder` aceita array de `{ id, position }` e reordena todas
- [ ] AC6: Cada etapa tem: `name` (obrigatorio), `color` (hex, default #6B7280), `position` (int, auto-incrementa), `is_final` (boolean), `final_type` ('won' | 'lost' | null)
- [ ] AC7: Validacao: nao pode deletar etapa com leads (retorna 409 Conflict com mensagem)
- [ ] AC8: Validacao: pelo menos 1 etapa final de tipo 'won' e 1 de tipo 'lost' devem existir
- [ ] AC9: Seed default criado (via Story 1.6) com 7 etapas:
  | Nome | Cor | Final | Tipo |
  |------|-----|-------|------|
  | Novo | #3B82F6 | Nao | - |
  | Qualificado | #8B5CF6 | Nao | - |
  | Agendado | #F59E0B | Nao | - |
  | Visitou | #10B981 | Nao | - |
  | Negociando | #EF4444 | Nao | - |
  | Fechou | #22C55E | Sim | won |
  | Perdido | #6B7280 | Sim | lost |

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/pipeline/stages/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/pipeline/stages/[id]/route.ts` — PATCH (update), DELETE
- `packages/web/src/app/api/pipeline/stages/reorder/route.ts` — PATCH (reorder all)
- `packages/db/src/queries/stages.ts` — Queries Supabase
- `packages/shared/src/types/pipeline.ts` — Types TypeScript

### Schema (ja definido em 1.2, referencia):
```sql
-- kanban_stages
-- id, org_id, name, color, position, is_final, final_type, is_active, created_at, updated_at
```

### Referencia agente-linda:
- Adaptar CRUD de stages de `~/agente-linda/packages/web/src/app/api/pipeline/` (se existir)
- Adicionar campo `final_type` ('won'/'lost') que provavelmente nao existe no agente-linda

## Dependencias
- Depende de: 1.2 (schema com kanban_stages), 1.5 (auth com role check)
- Bloqueia: 4.1 (pipeline usa stages), 5.6 (interface admin de config)

## Estimativa
P (Pequena) — 1-2 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
