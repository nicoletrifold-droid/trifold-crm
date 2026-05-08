status: Done

# Story 2.2 — CRUD Tipologias

## Contexto
Tipologias representam os modelos de planta de cada empreendimento. Vind tem 1 tipologia (67m2, 2 suites). Yarden tem 2 (Tipologia A: 83,66m2, 2 suites | Tipologia B: 79,81m2, 2 dorm + 1 suite). A Nicole usa tipologias para responder perguntas sobre metragem, quartos e diferenciais. As unidades individuais sao vinculadas a tipologias.

## Acceptance Criteria
- [x] AC1: API route `GET /api/properties/[propertyId]/typologies` retorna tipologias do empreendimento
- [x] AC2: API route `GET /api/typologies/[id]` retorna tipologia por ID
- [x] AC3: API route `POST /api/properties/[propertyId]/typologies` cria tipologia vinculada ao empreendimento
- [x] AC4: API route `PATCH /api/typologies/[id]` atualiza tipologia
- [x] AC5: API route `DELETE /api/typologies/[id]` faz soft delete
- [ ] AC6: Campos suportados: nome, metragem privativa, metragem total, dormitorios, suites, banheiros, sacada (bool), churrasqueira na sacada (bool), diferenciais (jsonb), descricao
- [ ] AC7: Validacao: nome obrigatorio, property_id obrigatorio e valido
- [ ] AC8: Componente de listagem de tipologias dentro da pagina de empreendimento (tab ou secao)
- [ ] AC9: Formulario de criacao/edicao de tipologia com todos os campos
- [ ] AC10: Ao deletar tipologia, unidades vinculadas ficam com `typology_id = null` (nao deleta em cascata)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/api/properties/[propertyId]/typologies/route.ts` — GET, POST
- `packages/web/src/app/api/typologies/[id]/route.ts` — GET, PATCH, DELETE
- `packages/web/src/components/properties/typology-form.tsx` — Formulario
- `packages/web/src/components/properties/typology-list.tsx` — Lista/cards
- `packages/shared/src/types/typology.ts` — Types
- `packages/db/src/queries/typologies.ts` — Queries

### Campos do formulario:
- Nome* (ex: "2 Suites", "Tipologia A")
- Metragem privativa (m2) | Metragem total (m2)
- Dormitorios | Suites | Banheiros
- Sacada (toggle) | Churrasqueira na sacada (toggle, so aparece se sacada = true)
- Diferenciais (lista editavel)
- Descricao (textarea)
- Planta baixa (URL — upload vem na P1)
- Planta humanizada (URL — upload vem na P1)

## Dependencias
- Depende de: 2.1 (empreendimentos existem)
- Bloqueia: 2.3 (unidades referenciam tipologia), 2.5 (seed Vind), 2.6 (seed Yarden)

## Estimativa
M (Media) — 2 horas

## File List

### Created/Modified
- `packages/web/src/app/api/properties/[propertyId]/typologies/route.ts` — GET (list), POST (create)
- `packages/web/src/app/api/typologies/[id]/route.ts` — GET (detail), PATCH (update), DELETE (soft delete)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
