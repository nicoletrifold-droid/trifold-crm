status: Done

# Story 2.6 — Seed Yarden (60 Unidades)

## Contexto
O Yarden e o empreendimento de lancamento da Trifold (julho/2026), alto padrao com rooftop exclusivo. Tem 2 tipologias e regra de negocio critica: exige entrada. O seed do Yarden e mais complexo que o Vind por ter 2 tipologias, opcao de 1 ou 2 vagas, e mais amenities (rooftop com fitness, sport bar, coworking, mirante).

## Acceptance Criteria
- [x] AC1: Empreendimento "Yarden" criado com todos os dados conhecidos
- [x] AC2: 2 tipologias criadas:
  - Tipologia A: "2 Suites" — 83,66m2, 2 suites, 2 banheiros
  - Tipologia B: "2 Dorm + 1 Suite" — 79,81m2, 2 dormitorios + 1 suite, 2 banheiros
- [x] AC3: 60 unidades criadas: 15 pavimentos tipo x 4 unidades/andar
- [x] AC4: Distribuicao de tipologias alternada por posicao no andar (ex: posicoes 1 e 3 = Tipo A, posicoes 2 e 4 = Tipo B — ou dados reais se disponiveis)
- [x] AC5: Unidades nomeadas: andar + posicao (101-104 ate 1501-1504)
- [x] AC6: Garagem: mix de 1 vaga (11,25m2) e 2 vagas (22,50m2) — distribuicao estimada (ex: andar 1-8 = 1 vaga, 9-15 = 2 vagas) ou dados reais
- [x] AC7: Todas as unidades com status `available` (lancamento)
- [x] AC8: Amenities completas cadastradas: rooftop (fitness, sport bar, coworking, mirante), terreo (piscina, salao de festas, espaco gourmet, pet place, playground, miniquadra)
- [x] AC9: Endereco: Rua Carlos Meneghetti, 168, Gleba Itororo, Maringa-PR
- [x] AC10: Data de entrega: 2029-06-30 (1o semestre 2029)
- [x] AC11: Regras comerciais: `requires_down_payment: true` (regra critica — lead sem entrada nao qualifica)
- [x] AC12: Conceito/proposta de valor cadastrada refletindo alto padrao + rooftop exclusivo
- [x] AC13: Seed executavel e idempotente

## Detalhes Tecnicos

### Arquivo a criar:
- `supabase/seeds/seed-yarden.sql`

### Dados do empreendimento:
```sql
INSERT INTO properties (
  org_id, name, slug, status, address, neighborhood, city, state,
  concept, description, total_units, total_floors, units_per_floor,
  type_floors, basement_floors, leisure_floors,
  delivery_date, commercial_rules, amenities, is_active
) VALUES (
  'ORG_UUID',
  'Yarden Residence',
  'yarden-residence',
  'launching',
  'Rua Carlos Meneghetti, 168',
  'Gleba Itororo',
  'Maringa', 'PR',
  'Residencial de alto padrao com rooftop exclusivo: fitness, sport bar, coworking e mirante com vista panoramica. 60 unidades com 2 opcoes de planta.',
  'O Yarden redefine o conceito de morar bem em Maringa. Com 2 pavimentos de lazer completos, rooftop exclusivo e localizacao privilegiada na Gleba Itororo, oferece qualidade de vida incomparavel.',
  60, 19, 4, -- total_units, total_floors (15 tipo + 2 subsolo + 2 lazer), units_per_floor
  15, 2, 2, -- type_floors, basement_floors, leisure_floors
  '2029-06-30',
  '{"requires_down_payment": true, "mcmv_eligible": false}',
  '["Rooftop com fitness", "Sport bar no rooftop", "Coworking no rooftop", "Mirante panoramico", "Piscina", "Salao de festas", "Espaco gourmet", "Pet place", "Playground", "Miniquadra"]',
  true
);
```

### Tipologias:
```sql
-- Tipologia A
INSERT INTO typologies (property_id, name, private_area_m2, bedrooms, suites, bathrooms, has_balcony, balcony_bbq, description) VALUES
  ('YARDEN_UUID', 'Tipologia A - 2 Suites', 83.66, 2, 2, 2, true, false,
   'Apartamento de 83,66m2 com 2 suites, ideal para casais que buscam conforto e privacidade.');

-- Tipologia B
INSERT INTO typologies (property_id, name, private_area_m2, bedrooms, suites, bathrooms, has_balcony, balcony_bbq, description) VALUES
  ('YARDEN_UUID', 'Tipologia B - 2 Dorm + 1 Suite', 79.81, 3, 1, 2, true, false,
   'Apartamento de 79,81m2 com 2 dormitorios + 1 suite, perfeito para familias que precisam de um quarto extra.');
```

### Unidades:
```sql
DO $$
DECLARE
  floor_num INT;
  unit_num INT;
  tipo_id UUID;
  garages INT;
  garage_m2 DECIMAL;
  positions TEXT[] := ARRAY['frente-esquerda', 'frente-direita', 'fundos-esquerda', 'fundos-direita'];
  views TEXT[] := ARRAY['rua', 'rua', 'interna', 'interna'];
BEGIN
  FOR floor_num IN 1..15 LOOP
    FOR unit_num IN 1..4 LOOP
      -- Tipologia: posicoes 1,3 = Tipo A; posicoes 2,4 = Tipo B
      IF unit_num IN (1, 3) THEN
        tipo_id := 'TIPOLOGIA_A_UUID';
      ELSE
        tipo_id := 'TIPOLOGIA_B_UUID';
      END IF;

      -- Garagem: andares altos (10-15) = 2 vagas, demais = 1 vaga
      IF floor_num >= 10 THEN
        garages := 2; garage_m2 := 22.50;
      ELSE
        garages := 1; garage_m2 := 11.25;
      END IF;

      INSERT INTO units (
        property_id, typology_id, identifier, floor,
        position, view_direction, garage_count, garage_type,
        garage_area_m2, private_area_m2, status
      ) VALUES (
        'YARDEN_UUID', tipo_id,
        floor_num * 100 + unit_num,
        floor_num,
        positions[unit_num], views[unit_num],
        garages, 'coberta', garage_m2,
        CASE WHEN unit_num IN (1,3) THEN 83.66 ELSE 79.81 END,
        'available'
      );
    END LOOP;
  END LOOP;
END $$;
```

## Dependencias
- Depende de: 2.1, 2.2, 2.3, 1.6 (seed base)
- Bloqueia: 3.3 (Nicole identifica Yarden), 3.2 (RAG com dados Yarden), 3.5 (regra de entrada)

## Estimativa
M (Media) — 1-2 horas

## File List

### Created/Modified
- `supabase/seeds/seed-yarden.sql` — Seed do empreendimento Yarden: 2 tipologias e 60 unidades

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
