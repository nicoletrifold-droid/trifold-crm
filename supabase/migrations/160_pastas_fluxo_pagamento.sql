-- 160_pastas_fluxo_pagamento.sql
-- Story 75-126 — Preferência de "Fluxo de pagamento" no wizard da pasta
-- (seção do Termo de Intenção). Opcional; não afeta o checklist de documentos.
-- CHECK aceita null (nullable) → pastas existentes seguem válidas.

alter table pastas
  add column if not exists fluxo_pagamento text
    check (fluxo_pagamento in ('fluxo_30_70','fluxo_100_obra','plano_safra','plano_investidor'));
