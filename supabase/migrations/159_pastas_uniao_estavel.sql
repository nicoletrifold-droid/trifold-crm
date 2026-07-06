-- 159_pastas_uniao_estavel.sql
-- Story 75-124 — Estado civil "União estável" no wizard da pasta. União estável tem
-- validade e exige comprovante próprio (escritura/contrato), distinto do casamento.
-- Aditiva (default false) → pastas existentes seguem válidas.

alter table pastas
  add column if not exists uniao_estavel boolean not null default false;
