-- 240: Story 75-368 — ligar e desligar o follow-up da Nicole POR LEAD.
--
-- Hoje o follow-up é decidido só por ETAPA (`follow_up_rules`, migration 008). Quem
-- opera não tem como dizer "neste lead aqui a Nicole não fala, eu atendo". O efeito
-- é a IA entrando por cima do corretor no meio de uma negociação.
--
-- Por que coluna NOVA e não reaproveitar `leads.marketing_optout_at` (migration 235):
--   · a 235 registra um pedido DO LEAD ("parar promoções", botão nativo da Meta);
--     esta aqui registra uma decisão DA EQUIPE. Misturar as duas apaga a diferença
--     no dia a dia de quem opera;
--   · o opt-out só bloqueia template de MARKETING e deixa conversa dentro da janela
--     de 24h passar, por desenho. Este desliga o follow-up inteiro, dentro e fora.
--
-- Por que NÃO reaproveitar `conversations.is_ai_active` (Epic 63): ele mora em
-- `conversations`, e lead que nunca conversou não tem linha lá — justamente o caso
-- que o Marcos pediu (lead novo de Meta Ads que ele vai ligar antes de qualquer
-- mensagem). São controles complementares, não concorrentes.
--
-- Aditiva: a coluna nasce NULL, NULL significa LIGADO, e nenhum lead existente muda
-- de comportamento. Sem backfill.

alter table public.leads
  add column if not exists nicole_followup_off_at timestamptz;

comment on column public.leads.nicole_followup_off_at is
  'Story 75-368 — quando a EQUIPE desligou o follow-up automático da Nicole para este lead. NULL = ligado (padrão). Silencia o envio do cron (follow_up_log type=nicole_sent) e PRESERVA o alerta ao corretor (type=alert_broker). Não confundir com marketing_optout_at (pedido do próprio lead, só marketing) nem com conversations.is_ai_active (Epic 63, IA da conversa ao vivo).';

-- Índice parcial, no mesmo formato do idx_leads_marketing_optout da 235: a coluna é
-- nula na esmagadora maioria das linhas e a pergunta é sempre "este lead está off?".
create index if not exists idx_leads_nicole_followup_off
  on public.leads (id)
  where nicole_followup_off_at is not null;

-- ROLLBACK PLAN:
--   drop index if exists public.idx_leads_nicole_followup_off;
--   alter table public.leads drop column if exists nicole_followup_off_at;
-- Sem perda de dado operacional: a coluna nasce nula e só passa a valer para leads
-- que alguém desligar explicitamente na tela.
