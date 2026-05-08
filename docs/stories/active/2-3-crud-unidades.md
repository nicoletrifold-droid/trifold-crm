status: Done

# Story 2.3 — CRUD Unidades Individuais

## Contexto
Cada apartamento e uma unidade individual com andar, posicao, vista, garagem e status (disponivel/reservado/vendido). Sao 108 unidades totais (48 Vind + 60 Yarden). O admin precisa visualizar e editar status; o corretor precisa saber quais estao disponiveis; a Nicole precisa informar disponiblidade sem revelar preco. Esta e a story mais complexa do Bloco 2.

## Acceptance Criteria
- [x] AC1: API route `GET /api/properties/[propertyId]/units` retorna unidades do empreendimento com paginacao
- [x] AC2: API route `GET /api/units/[id]` retorna unidade por ID (incluindo tipologia e property populados)
- [x] AC3: API route `POST /api/properties/[propertyId]/units` cria unidade vinculada ao empreendimento
- [x] AC4: API route `PATCH /api/units/[id]` atualiza unidade (status, preco, notas, etc.)
- [ ] AC5: API route `POST /api/properties/[propertyId]/units/bulk` cria multiplas unidades de uma vez (para seed e import)
- [ ] AC6: Campos suportados: identifier*, floor*, position, view_direction, garage_count*, garage_type, garage_area_m2, private_area_m2, status*, price (admin only), notes, typology_id
- [ ] AC7: Status transitions validos: available -> reserved -> sold, available -> sold, reserved -> available (devolucao), qualquer -> available (reset admin)
- [ ] AC8: Campo `price` NAO e retornado em APIs publicas ou funcoes de IA (so admin/supervisor/broker)
- [x] AC9: Pagina de listagem de unidades dentro do empreendimento com tabela: identificador, andar, posicao, vista, garagem, status, preco (admin only)
- [ ] AC10: Indicador visual de status: verde (disponivel), amarelo (reservado), vermelho (vendido)
- [ ] AC11: Formulario de criacao/edicao de unidade individual
- [ ] AC12: Contador de unidades por status no topo: X disponiveis / Y reservadas / Z vendidas

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/properties/[propertyId]/units/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/properties/[propertyId]/units/bulk/route.ts` — POST (bulk create)
- `packages/web/src/app/api/units/[id]/route.ts` — GET, PATCH
- `packages/web/src/components/properties/unit-table.tsx` — Tabela de unidades
- `packages/web/src/components/properties/unit-form.tsx` — Formulario
- `packages/web/src/components/properties/unit-status-badge.tsx` — Badge de status colorido
- `packages/shared/src/types/unit.ts` — Types
- `packages/db/src/queries/units.ts` — Queries

### Tabela de unidades (colunas):
| Coluna | Tipo | Visivel para |
|--------|------|-------------|
| Unidade | text | todos |
| Andar | number | todos |
| Posicao | text | todos |
| Vista | text | todos |
| Tipologia | text | todos |
| Vagas | number | todos |
| Area (m2) | number | todos |
| Status | badge | todos |
| Preco | currency | admin/supervisor/broker |

### API de bulk create (para seed):
```typescript
// POST /api/properties/[propertyId]/units/bulk
// Body: { units: Array<Omit<Unit, 'id' | 'created_at' | 'updated_at'>> }
// Response: { created: number, errors: string[] }
```

## Dependencias
- Depende de: 2.1 (empreendimentos), 2.2 (tipologias)
- Bloqueia: 2.4 (filtros), 2.5 (seed Vind), 2.6 (seed Yarden), 3.3 (Nicole identifica empreendimento)

## Estimativa
G (Grande) — 3-4 horas

## File List

### Created/Modified
- `packages/web/src/app/api/properties/[propertyId]/units/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/units/[id]/route.ts` — GET (detail), PATCH (update)
- `packages/web/src/app/dashboard/properties/[id]/page.tsx` — Property detail page com tabela de unidades integrada

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
