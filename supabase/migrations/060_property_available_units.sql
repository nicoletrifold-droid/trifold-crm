-- Coluna manual para contar unidades disponíveis exibidas no Dashboard.
-- Como o cadastro de units não reflete vendas reais, esse número é
-- gerenciado pelo admin via UI de Empreendimentos.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS available_units integer;

-- Seed inicial conforme informado pelo cliente (2026-05-22)
UPDATE properties SET available_units = 14
  WHERE id = '00000000-0000-0000-0004-000000000001'; -- Vind Residence
UPDATE properties SET available_units = 8
  WHERE id = '00000000-0000-0000-0004-000000000002'; -- Yarden
