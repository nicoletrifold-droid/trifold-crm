-- Story 75-353 — O follow-up passa a poder ENTREGAR: template HSM fora da janela.
--
-- O diagnóstico que motiva esta migration (medido em produção, 20/08/2026):
-- **0 entregas em 20 dias e ~4.700 tentativas puladas**, todas por
-- `WHATSAPP_WINDOW_CLOSED`. O follow-up manda texto livre, e a Meta só aceita
-- texto livre nas 24h seguintes à última mensagem DO LEAD. Como follow-up existe
-- justamente para lead que ficou calado, o desenho se contradiz: a condição que
-- dispara o follow-up é a mesma que proíbe a entrega.
--
-- A saída é template aprovado, que entrega dentro e fora da janela. Decisão do
-- Marcos em 20/08: **sim, automatizar** a reabertura de janela de lead frio com os
-- templates `abertura_*` (MARKETING) que já existem aprovados e já entregam 128
-- mensagens/semana pelo botão manual "Iniciar atendimento".
--
-- Marketing automático sem freio é spam, e spam derruba a nota de qualidade da
-- WABA (que é o ativo de entrega da empresa inteira). Por isso a migration traz,
-- no mesmo passo, as duas travas que faltavam:
--   · `hsm_min_days` — intervalo mínimo entre dois templates para o MESMO lead
--   · `leads.marketing_optout_at` — quem pediu para parar, para de receber
--
-- Additiva: nenhuma linha existente muda de comportamento. Regra sem
-- `hsm_template` continua exatamente como hoje (pula fora da janela).

-- ---------------------------------------------------------------------------
-- 1. Qual template cada regra usa fora da janela
-- ---------------------------------------------------------------------------
-- NULL = comportamento de hoje (não envia nada fora da janela). É opt-in por
-- etapa, escolhido na tela Pipeline → Config — não por SQL, porque quem decide o
-- que o lead lê é quem opera a tela.
alter table public.follow_up_rules
  add column if not exists hsm_template text;

comment on column public.follow_up_rules.hsm_template is
  'Story 75-353 — template HSM aprovado usado quando a janela de 24h está fechada. NULL = não envia fora da janela (comportamento anterior). Só nomes que o código sabe preencher (OPENING_TEMPLATE_PARAMS).';

-- ---------------------------------------------------------------------------
-- 2. Cap de frequência por lead
-- ---------------------------------------------------------------------------
-- 7 dias por padrão: o cooldown de 48h do follow-up é curto demais para
-- MARKETING. Sem isso, um lead frio receberia template a cada 2 dias
-- indefinidamente — que é a definição operacional de spam.
alter table public.follow_up_rules
  add column if not exists hsm_min_days integer not null default 7;

comment on column public.follow_up_rules.hsm_min_days is
  'Story 75-353 — intervalo mínimo, em dias, entre dois templates de follow-up para o MESMO lead. Independe do cooldown de 48h, que é curto demais para marketing.';

-- ---------------------------------------------------------------------------
-- 3. Opt-out do lead
-- ---------------------------------------------------------------------------
-- Não existia NENHUMA coluna de opt-out em `leads` — conferido antes de escrever.
-- Templates de marketing carregam o botão nativo "Parar promoções" da Meta, e a
-- resposta dele chega pelo webhook como mensagem de texto comum: sem um lugar
-- para gravar, o pedido do lead se perdia e ele continuaria recebendo.
--
-- Só bloqueia MARKETING. Conversa dentro da janela (serviço) segue normal — o
-- lead pediu para não receber promoção, não para ser ignorado quando escreve.
alter table public.leads
  add column if not exists marketing_optout_at timestamptz;

comment on column public.leads.marketing_optout_at is
  'Story 75-353 — quando o lead pediu para parar de receber template de MARKETING (botão "Parar promoções" da Meta ou texto equivalente). NULL = nunca pediu. Não afeta conversa dentro da janela de 24h.';

-- Índice parcial: a consulta é sempre "este lead está em opt-out?" e a coluna é
-- nula na esmagadora maioria das linhas.
create index if not exists idx_leads_marketing_optout
  on public.leads (id)
  where marketing_optout_at is not null;

-- ROLLBACK PLAN:
--   drop index if exists public.idx_leads_marketing_optout;
--   alter table public.leads drop column if exists marketing_optout_at;
--   alter table public.follow_up_rules drop column if exists hsm_min_days;
--   alter table public.follow_up_rules drop column if exists hsm_template;
-- Sem perda de dado operacional: as três colunas nascem nulas/default e só
-- passam a valer para regras que alguém configurar na tela.
