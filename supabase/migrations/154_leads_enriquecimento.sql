-- 154_leads_enriquecimento.sql
-- Story 75-112 — Enriquecimento do perfil do lead: observação livre + finalidade,
-- orçamento, prazo de compra e forma de pagamento. Editáveis por quem já edita o lead
-- (admin/supervisor/gerente-comercial ou o corretor dono). Todos nullable.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS observacao      text,
  ADD COLUMN IF NOT EXISTS finalidade      text,
  ADD COLUMN IF NOT EXISTS orcamento       text,
  ADD COLUMN IF NOT EXISTS prazo_compra    text,
  ADD COLUMN IF NOT EXISTS forma_pagamento text;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_finalidade_check;
ALTER TABLE leads ADD CONSTRAINT leads_finalidade_check
  CHECK (finalidade IS NULL OR finalidade IN ('moradia', 'investimento', 'ambos'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_prazo_compra_check;
ALTER TABLE leads ADD CONSTRAINT leads_prazo_compra_check
  CHECK (prazo_compra IS NULL OR prazo_compra IN ('imediato', 'ate_3m', '3_6m', 'mais_6m'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_forma_pagamento_check;
ALTER TABLE leads ADD CONSTRAINT leads_forma_pagamento_check
  CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('financiamento', 'a_vista', 'fgts', 'consorcio'));
