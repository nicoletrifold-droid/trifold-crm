-- 245: `trifold_migrations_aplicadas` — o registro de "qual migration foi aplicada onde"
-- Story 900-3c (Epic 900, Onda 1 — Fatia B do split da 900-3b).
--
-- POR QUE ESTA TABELA EXISTE, SE JÁ EXISTE `supabase_migrations.schema_migrations`
-- ------------------------------------------------------------------------------
-- Porque a nativa não serve neste repositório, por três razões medidas:
--
--   1. **Ela está congelada.** Em produção, `supabase_migrations.schema_migrations` parou na
--      `168` (registrado em `docs/runbooks/aplicar-242-243-live-coach.md`: *"o `push`
--      consideraria 169..243 pendentes"*). Todas as migrations de 169 em diante foram
--      aplicadas à mão, por SQL Editor ou Management API, sem deixar rastro nela.
--   2. **A chave dela é o prefixo numérico, e o prefixo não é único aqui.** São 22 prefixos
--      duplicados hoje (`021, 024, 025, 027, 028, 029, 031, 032, 033, 034, 036, 044, 048,
--      063, 066, 075, 102, 104, 164, 170, 230, 240`) — e mais variantes com sufixo de letra
--      (`024b_`, `028a_`, `028b_`). Chave por prefixo não distingue
--      `021_phone_normalization_part2.sql` de `025_phone_normalization_part2.sql`.
--   3. **O reset do banco de teste a apaga** (`delete from supabase_migrations.schema_migrations;`
--      em `scripts/reset-tenancy-testdb.ts`) e não a reinsere.
--
-- AS DUAS DECISÕES DE MODELAGEM, E O QUE CADA UMA FECHA
-- ----------------------------------------------------
-- • **Chave por ARQUIVO, não por prefixo.** `arquivo text PRIMARY KEY` é o nome completo do
--   `.sql` (`245_registro_de_migrations.sql`). Resolve os 22 prefixos duplicados sem
--   ambiguidade: as duas `phone_normalization_part2` são duas linhas distintas.
-- • **`sha256` do conteúdo.** `supabase/migrations/README.md` já documenta o caso de
--   migration renumerada e reeditada DEPOIS de aplicada. Sem o hash, o registro diz "aplicada"
--   e mente: o arquivo que está no disco hoje não é o SQL que rodou. Com o hash, esse caso
--   ganha um nome — `ALTERADA-APÓS-APLICAR` — e `pnpm db:apply` recusa em bloco.
--
-- O CAMPO `via` É UMA DECLARAÇÃO DE PROVENIÊNCIA, NÃO UMA PROVA
-- -------------------------------------------------------------
-- Valores usados pelo ferramental desta story — são QUATRO, e a diferença entre eles é
-- declaração × observação:
--   • `backfill-onda-1`        — inserido em massa no dia da aplicação desta migration, uma
--     linha por arquivo já existente. É uma **declaração** de que aquele SQL já rodou em algum
--     momento do passado, não prova de que rodou exatamente com esse conteúdo. O nome diz isso.
--   • `apply`                  — gravado por `pnpm db:apply`, logo após o arquivo aplicar com
--     sucesso. Observação direta.
--   • `reset`                  — gravado por `pnpm reset:testdb --confirmar` ao final da
--     reconstrução, para os arquivos que o reset VIU aplicar. Observação direta.
--   • `reset-falha-conhecida`  — gravado pelo mesmo reset para as entradas de
--     `FALHAS_CONHECIDAS` que falharam, como previsto. Elas **não** aplicaram: registrá-las como
--     `reset` seria mentira, e deixá-las fora do ledger as faria aparecer como `PENDENTE` logo
--     depois de um reset bem-sucedido, com o `db:apply` tentando reaplicá-las para sempre num
--     arquivo que se sabe que não aplica num banco do zero (duplicata de prefixo cujo efeito já
--     veio da migration original, ou backfill de dado real que não existe aqui). O campo `via`
--     existe para carregar essa diferença em vez de escondê-la.
--
-- SEGURANÇA — RLS LIGADA, ZERO POLICY (deny por padrão)
-- -----------------------------------------------------
-- Mesmo padrão da tabela de auditoria da Story 900-16: com RLS habilitada e nenhuma policy,
-- `anon` e `authenticated` não leem nem escrevem nada. `service_role` bypassa RLS por padrão
-- do Postgres/Supabase, e é por ele que o ferramental de operação (`db:status`, `db:apply`,
-- `reset:testdb`, todos via Management API) escreve. Não há caminho de aplicação que precise
-- desta tabela: ela é infraestrutura de operação, não dado de produto.
--
-- SEM `org_id` — E ISSO É DELIBERADO
-- ----------------------------------
-- Esta tabela descreve o SCHEMA do banco, que é único e compartilhado por todos os tenants.
-- Não há recorte por organização a fazer: a migration `199` está aplicada para todo mundo ou
-- para ninguém. O gate de tenancy (`scripts/gate-tenancy.ts`) precisa saber disso — a entrada
-- correspondente na allowlist é a mesma classe de `schema_snapshot`: tabela de plataforma.
--
-- ADITIVA E IDEMPOTENTE: `CREATE TABLE IF NOT EXISTS`. Não altera nenhuma tabela existente,
-- não faz backfill de dado de produto, não cria FK. Aplicá-la duas vezes é no-op.
--
-- ROLLBACK (NFR-8)
-- ----------------
--   DROP TABLE IF EXISTS public.trifold_migrations_aplicadas;
-- Seguro: nada no código da aplicação (`packages/web`) lê ou escreve nesta tabela — só os
-- scripts de operação. O custo do rollback é perder o registro e voltar ao estado de hoje,
-- em que "o que foi aplicado onde" não existe em lugar nenhum.

CREATE TABLE IF NOT EXISTS public.trifold_migrations_aplicadas (
  arquivo     text        PRIMARY KEY,
  sha256      text        NOT NULL,
  aplicada_em timestamptz NOT NULL DEFAULT now(),
  via         text        NOT NULL
);

ALTER TABLE public.trifold_migrations_aplicadas ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy, de propósito. Ver "SEGURANÇA" no cabeçalho: deny por padrão para `anon` e
-- `authenticated`; `service_role` bypassa RLS e é o único caminho de escrita.

COMMENT ON TABLE public.trifold_migrations_aplicadas IS
  'Story 900-3c: registro de qual arquivo de migration foi aplicado neste banco. Substitui '
  'supabase_migrations.schema_migrations, que está congelada na 168 em produção, é chaveada '
  'por prefixo (não-único: 22 duplicados) e é apagada pelo reset do banco de teste. '
  'Lida/escrita apenas por scripts de operação via service-role.';

COMMENT ON COLUMN public.trifold_migrations_aplicadas.arquivo IS
  'Nome completo do arquivo em supabase/migrations/, com extensão. Chave por ARQUIVO e não por '
  'prefixo numérico porque o prefixo não é único neste repositório.';

COMMENT ON COLUMN public.trifold_migrations_aplicadas.sha256 IS
  'SHA-256 hex do conteúdo do arquivo no momento do registro. Divergência entre este valor e o '
  'arquivo em disco é o estado ALTERADA-APÓS-APLICAR, que bloqueia pnpm db:apply.';

COMMENT ON COLUMN public.trifold_migrations_aplicadas.via IS
  'Proveniência do registro, quatro valores: backfill-onda-1 (declaração retroativa, NÃO é prova '
  'de que aquele SQL exato rodou); apply (pnpm db:apply observou o sucesso); reset (pnpm '
  'reset:testdb reconstruiu o banco do zero e VIU o arquivo aplicar); reset-falha-conhecida (o '
  'reset rodou, o arquivo está em FALHAS_CONHECIDAS e falhou como previsto — NÃO aplicou, e o '
  'registro existe só para ele não aparecer como PENDENTE e o db:apply não tentar reaplicá-lo '
  'para sempre).';
