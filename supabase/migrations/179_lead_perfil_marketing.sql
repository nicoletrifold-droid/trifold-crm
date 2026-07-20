-- 179_lead_perfil_marketing.sql
-- Story 75-181 — Perfil do lead p/ insights de marketing: profissão, renda familiar,
-- filhos, estado civil, faixa etária, situação de moradia, cidade/bairro e pet.
-- Padrão da 154 (75-112): todos nullable (nenhum campo obrigatório), CHECKs nos selects.
-- `profissao` e `cidade_bairro` são texto livre (profissão aceita "Outra" digitada).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS profissao         text,
  ADD COLUMN IF NOT EXISTS renda_familiar    text,
  ADD COLUMN IF NOT EXISTS filhos            text,
  ADD COLUMN IF NOT EXISTS estado_civil      text,
  ADD COLUMN IF NOT EXISTS faixa_etaria      text,
  ADD COLUMN IF NOT EXISTS situacao_moradia  text,
  ADD COLUMN IF NOT EXISTS cidade_bairro     text,
  ADD COLUMN IF NOT EXISTS tem_pet           text;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_renda_familiar_check;
ALTER TABLE leads ADD CONSTRAINT leads_renda_familiar_check
  CHECK (renda_familiar IS NULL OR renda_familiar IN
    ('ate_2850', '2850_4700', '4700_8000', '8000_12000', '12000_20000', 'acima_20000'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_filhos_check;
ALTER TABLE leads ADD CONSTRAINT leads_filhos_check
  CHECK (filhos IS NULL OR filhos IN ('nenhum', '1', '2', '3_mais'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_estado_civil_check;
ALTER TABLE leads ADD CONSTRAINT leads_estado_civil_check
  CHECK (estado_civil IS NULL OR estado_civil IN ('solteiro', 'casado_uniao', 'divorciado', 'viuvo'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_faixa_etaria_check;
ALTER TABLE leads ADD CONSTRAINT leads_faixa_etaria_check
  CHECK (faixa_etaria IS NULL OR faixa_etaria IN ('18_24', '25_34', '35_44', '45_54', '55_64', '65_mais'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_situacao_moradia_check;
ALTER TABLE leads ADD CONSTRAINT leads_situacao_moradia_check
  CHECK (situacao_moradia IS NULL OR situacao_moradia IN ('aluguel', 'propria', 'com_familia'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_tem_pet_check;
ALTER TABLE leads ADD CONSTRAINT leads_tem_pet_check
  CHECK (tem_pet IS NULL OR tem_pet IN ('sim', 'nao'));
