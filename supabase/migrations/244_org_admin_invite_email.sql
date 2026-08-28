-- 244: `organizations.admin_invite_email` — o e-mail do admin convidado sobrevive ao efeito externo
-- Story 900-22b (Epic 900, Onda 2) — fecha a AC de 900-21 "convite do admin + retry".
--
-- O QUE ISTO RESOLVE
-- ------------------
-- `provision_org()` (migration 240) cria a org numa transação e, por desenho declarado no
-- cabeçalho daquela migration, NÃO cria o usuário admin: convite por e-mail é efeito externo e
-- não pode derrubar a criação da org se a rede/rate limit do Supabase Auth falhar.
--
-- Mas se o convite falha e o e-mail digitado pelo operador não fica em lugar nenhum, a org nasce
-- órfã e ninguém sabe para quem reenviar. Esta coluna é esse lugar: a rota grava o e-mail logo
-- após `provision_org()` retornar e ANTES de tentar criar a conta no Auth. O painel `/platform`
-- lê a coluna para mostrar "convite pendente" com botão de reenviar.
--
-- CICLO DE VIDA DO VALOR
-- ----------------------
--   • preenchido   — logo após provisionar, antes do convite (AC-A2)
--   • NULL         — quando o convite conclui com sucesso (conta Auth criada + e-mail enviado)
--   • NULL         — quando o admin já estava ativo e o e-mail informado foi ignorado (AC-A3.2b)
-- Ou seja: valor presente == "há convite pendente para este endereço".
--
-- SEGURANÇA
-- ---------
-- Nenhuma policy nova é necessária. `004_rls_policies.sql:72` (`org_select_own`) já restringe
-- SELECT em `organizations` à própria org do usuário logado — um usuário de outra empresa já não
-- lia essa linha antes desta coluna existir e continua não lendo. O painel `/platform` lê com
-- service-role (bypassa RLS por desenho); a proteção ali é a lista fechada
-- `PLATFORM_READABLE_TABLES` da própria Story 900-22b, não a RLS.
--
-- ADITIVA E IDEMPOTENTE: `ADD COLUMN IF NOT EXISTS`, nullable, sem default, sem backfill.
-- Nenhuma linha existente muda; nenhum código anterior a esta story enxerga a coluna.
--
-- ROLLBACK (NFR-8)
-- ----------------
--   ALTER TABLE public.organizations DROP COLUMN IF EXISTS admin_invite_email;
-- Seguro: a coluna é nullable, não tem índice, constraint, trigger ou FK apontando para ela, e
-- nenhuma função SQL a referencia (`provision_org` continua com a assinatura de 2 argumentos —
-- decisão registrada na Story 900-22b). O único custo do rollback é perder os e-mails de convites
-- que ainda estivessem pendentes no momento do DROP.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS admin_invite_email text;

COMMENT ON COLUMN public.organizations.admin_invite_email IS
  'Story 900-22b: e-mail do admin com convite PENDENTE. Gravado antes de tentar criar a conta no '
  'Supabase Auth e limpado (NULL) quando o convite conclui ou quando o admin já estava ativo. '
  'Valor presente == convite pendente.';
