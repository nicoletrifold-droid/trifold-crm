-- 165: Tipos de brinde — unicidade por (nome + tamanho + cor), não só por nome.
--
-- Motivo (2026-07-09): "Camiseta" é um ITEM; tamanho e cor são atributos. A constraint
-- antiga UNIQUE(org_id, nome) tratava o nome como identidade única e bloqueava cadastrar
-- a mesma camiseta em tamanhos diferentes (M, G, P) — obrigando a poluir o nome
-- ("Camiseta - M"). Agora o mesmo nome pode repetir desde que tamanho/cor difiram; só
-- duplicata REAL (mesmo nome+tamanho+cor) é barrada.
--
-- NULLS NOT DISTINCT (PostgreSQL 15+) trata NULLs como iguais, evitando dois registros
-- idênticos quando tamanho/cor são nulos (ex.: "Caneca" sem tamanho não pode duplicar).

ALTER TABLE public.brindes_tipos
  DROP CONSTRAINT IF EXISTS brindes_tipos_org_id_nome_key;

ALTER TABLE public.brindes_tipos
  ADD CONSTRAINT brindes_tipos_org_nome_tamanho_cor_key
  UNIQUE NULLS NOT DISTINCT (org_id, nome, tamanho, cor);
