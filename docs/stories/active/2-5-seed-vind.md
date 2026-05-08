status: Done

# Story 2.5 — Seed Vind (48 Unidades)

## Contexto
O Vind e o empreendimento em comercializacao da Trifold. 48 unidades, tipologia unica. O seed precisa criar o empreendimento, a tipologia e todas as 48 unidades com dados reais (ou estimados, conforme decisao do PO). Esses dados alimentam a Nicole e permitem demo funcional na sexta.

## Acceptance Criteria
- [x] AC1: Empreendimento "Vind" criado com todos os dados conhecidos
- [x] AC2: 1 tipologia criada: "2 Suites" (67m2, 2 suites, sacada ampla, churrasqueira a carvao, 1 vaga coberta)
- [x] AC3: 48 unidades criadas: 12 pavimentos tipo x 4 unidades/andar
- [x] AC4: Unidades nomeadas seguindo padrao: andar + posicao (ex: 101, 102, 103, 104, 201, 202... ate 1204)
- [x] AC5: Posicoes alternadas por unidade no andar: frente-esquerda, frente-direita, fundos-esquerda, fundos-direita
- [x] AC6: Vista estimada por posicao: frente = "rua", fundos = "interna" (ou dados reais se disponiveis)
- [x] AC7: Todas as unidades com status `available` (ou dados reais de vendidas/reservadas se disponiveis)
- [x] AC8: Garagem: 1 vaga coberta padrao para todas
- [x] AC9: Precos NAO preenchidos (admin insere depois — conforme decisao PO)
- [x] AC10: Amenities do Vind cadastradas (dados conhecidos do brief)
- [x] AC11: Endereco: Rua Jose Pereira da Costa, 547, Maringa-PR
- [x] AC12: Data de entrega: 2027-06-30 (1o semestre 2027)
- [x] AC13: Seed executavel via script ou migration separada
- [x] AC14: Regras comerciais: `requires_down_payment: false` (Vind nao exige entrada obrigatoria como Yarden)

## Detalhes Tecnicos

### Arquivo a criar:
- `supabase/seeds/seed-vind.sql` (ou dentro de `supabase/seed.sql`)

### Dados do empreendimento:
```sql
INSERT INTO properties (
  org_id, name, slug, status, address, city, state,
  concept, total_units, total_floors, units_per_floor,
  type_floors, basement_floors, leisure_floors,
  delivery_date, commercial_rules, amenities, is_active
) VALUES (
  'ORG_UUID',
  'Vind Residence',
  'vind-residence',
  'selling',
  'Rua Jose Pereira da Costa, 547',
  'Maringa', 'PR',
  'Residencial de alto padrao com 48 unidades, sacada ampla com churrasqueira a carvao e localizacao privilegiada.',
  48, 15, 4, -- total_units, total_floors (12 tipo + 2 subsolo + 1 terreo), units_per_floor
  12, 2, 1, -- type_floors, basement_floors, leisure_floors
  '2027-06-30',
  '{"requires_down_payment": false, "mcmv_eligible": false}',
  '["Churrasqueira a carvao na sacada", "Sacada ampla"]',
  true
);
```

### Tipologia:
```sql
INSERT INTO typologies (
  property_id, name, private_area_m2, bedrooms, suites, bathrooms,
  has_balcony, balcony_bbq, description
) VALUES (
  'VIND_UUID',
  '2 Suites',
  67.00,
  2, 2, 2,
  true, true,
  'Apartamento de 67m2 com 2 suites, sacada ampla com churrasqueira a carvao e 1 vaga de garagem coberta.'
);
```

### Unidades (geracao por loop):
```sql
-- Gerar 48 unidades: andares 1-12, posicoes 01-04
DO $$
DECLARE
  floor_num INT;
  unit_num INT;
  positions TEXT[] := ARRAY['frente-esquerda', 'frente-direita', 'fundos-esquerda', 'fundos-direita'];
  views TEXT[] := ARRAY['rua', 'rua', 'interna', 'interna'];
BEGIN
  FOR floor_num IN 1..12 LOOP
    FOR unit_num IN 1..4 LOOP
      INSERT INTO units (
        property_id, typology_id, identifier, floor,
        position, view_direction, garage_count, garage_type,
        private_area_m2, status
      ) VALUES (
        'VIND_UUID', 'VIND_TIPOLOGIA_UUID',
        floor_num * 100 + unit_num,
        floor_num,
        positions[unit_num],
        views[unit_num],
        1, 'coberta',
        67.00,
        'available'
      );
    END LOOP;
  END LOOP;
END $$;
```

## Dependencias
- Depende de: 2.1 (CRUD empreendimentos), 2.2 (CRUD tipologias), 2.3 (CRUD unidades), 1.6 (seed base com org_id)
- Bloqueia: 3.3 (Nicole identifica Vind), 3.2 (RAG com dados do Vind)

## Estimativa
P (Pequena) — 1 hora

## File List

### Created/Modified
- `supabase/seeds/seed-vind.sql` — Seed do empreendimento Vind: 1 tipologia e 48 unidades

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
