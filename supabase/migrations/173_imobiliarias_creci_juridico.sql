-- Story: CRECI jurídico (CRECI da imobiliária) no cadastro de imobiliárias.
-- Campo de texto livre, opcional. Preenchido no formulário compartilhado
-- (tela interna do IMOB e fluxo "+ Cadastrar nova imobiliária" ao gerar link nas Pastas).
ALTER TABLE imobiliarias
  ADD COLUMN IF NOT EXISTS creci_juridico text;

COMMENT ON COLUMN imobiliarias.creci_juridico IS 'CRECI jurídico (registro CRECI da imobiliária/pessoa jurídica).';
