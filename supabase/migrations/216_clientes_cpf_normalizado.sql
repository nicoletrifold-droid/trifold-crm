-- 216_clientes_cpf_normalizado.sql
-- Story 75-282 — CPF de `clientes` passa a ser armazenado SOMENTE COM DÍGITOS.
--
-- O problema:
--   `clientes.cpf` tinha os dois formatos convivendo (medido em 07/08/2026 em produção:
--   58 linhas só-dígitos, 19 com máscara, 13 nulas), porque as rotas de cadastro gravavam
--   o valor cru do formulário — e o input tem máscara.
--
--   O sync do Sienge (`lib/integrations/sienge/sync.ts`) casa cliente por
--   `.eq("cpf", <cpf sanitizado da API>)`. Para as 19 linhas mascaradas o casamento NUNCA
--   acontecia: o cliente aparecia como "Sienge não vinculado" na aba Clientes da obra e —
--   quando o fallback por e-mail também não resolvia — o sync CRIAVA um cliente novo. O
--   MAKTUB HOLDING acumulou 5 linhas assim (17/07, 22/07 x2, 07/08).
--
-- O que esta migration faz:
--   1. Backfill: remove a máscara das linhas existentes.
--   2. Trigger BEFORE INSERT/UPDATE: a invariante passa a ser do BANCO, não de quem escreve.
--      O CRM tem mais de um caminho de escrita para `clientes` (rotas admin, sync Sienge,
--      scripts) — garantir só na aplicação deixaria a porta aberta.
--   3. Índice único parcial (org_id, cpf): impede que o mesmo CPF entre duas vezes na org.
--
-- Pré-condição verificada em produção antes de escrever esta migration:
--   `select regexp_replace(cpf,'[^0-9]','','g'), count(*) ... group by 1 having count(*)>1`
--   → ZERO linhas. Nenhum CPF duplicado por dígitos, então o backfill não colide e o índice
--   único é aplicável sem limpeza prévia.
--
-- Idempotente: pode rodar mais de uma vez (o backfill é no-op na 2ª vez; trigger e índice
-- usam DROP IF EXISTS / IF NOT EXISTS).

-- ── 1. Backfill ───────────────────────────────────────────────────────────────────────
-- Só toca as linhas que realmente têm caractere não-numérico. Se a limpeza resultar em
-- string vazia (CPF que era só pontuação), grava NULL — a coluna é nullable.
update clientes
set cpf = nullif(regexp_replace(cpf, '[^0-9]', '', 'g'), '')
where cpf is not null
  and cpf ~ '[^0-9]';

-- ── 2. Trigger de normalização ────────────────────────────────────────────────────────
create or replace function normalize_clientes_cpf()
returns trigger
language plpgsql
as $$
begin
  if new.cpf is not null then
    new.cpf := nullif(regexp_replace(new.cpf, '[^0-9]', '', 'g'), '');
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_clientes_cpf_trg on clientes;

create trigger normalize_clientes_cpf_trg
  before insert or update of cpf on clientes
  for each row
  execute function normalize_clientes_cpf();

-- ── 3. Unicidade por org ──────────────────────────────────────────────────────────────
-- Parcial: linhas com CPF nulo continuam permitidas (13 hoje) e não colidem entre si.
create unique index if not exists clientes_org_cpf_uniq
  on clientes (org_id, cpf)
  where cpf is not null;
