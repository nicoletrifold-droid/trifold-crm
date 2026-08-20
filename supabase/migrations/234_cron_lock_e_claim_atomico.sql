-- Story 75-352 — O cron de follow-up roda DUAS vezes por agendamento, e as duas
-- passam pelo cooldown porque leem antes de qualquer uma escrever.
--
-- A prova, em produção (system_events, 19/08/2026):
--   22:01:10  FOLLOWUP_EXECUTED  "98 processed, 15 messages, 22 post-visit"
--   22:01:10  FOLLOWUP_EXECUTED  "99 processed, 16 messages, 24 post-visit"
--
-- Dois recibos no MESMO segundo, com contadores diferentes: duas execuções
-- concorrentes da mesma run, intercaladas lead a lead com ~1s de diferença.
-- Efeito medido: 1.560 tentativas de follow-up para 46 leads em 7 dias na etapa
-- "Atendimento" (≈34 por lead), 58 linhas duplicadas em `follow_up_log`, e uma
-- chamada de modelo Anthropic desperdiçada por agendamento de pós-visita
-- (22 a 24 por run, metade jogada fora).
--
-- Onde eu procurei e NÃO está a segunda chamada: o manifesto de cron da Vercel
-- tem a rota uma única vez (36 definições, nenhuma duplicada), `cron.job` não tem
-- nada de follow-up, e existe um único projeto CRM no time. O gatilho é externo
-- ao que o repo mostra. Esta migration conserta o efeito sem depender de achar a
-- causa: com o claim atômico, invocação duplicada vira no-op.
--
-- Duas travas, propósitos diferentes:
--   1. `cron_locks` + `claim_cron_run`  → a RUN inteira só roda uma vez por janela
--   2. `claim_follow_up`                → o LEAD só é reivindicado uma vez, mesmo
--                                          que duas runs escapem da trava 1
--
-- Por que não índice único em (lead_id, type, dia): `follow_up_log` JÁ tem 58
-- linhas que violariam (as duplicatas que este bug gerou), e apagar histórico de
-- log para poder criar um índice é o tipo de conserto que esconde a evidência.
-- O `pg_advisory_xact_lock` por lead resolve a corrida sem tocar no que está
-- gravado — e é liberado no commit, então funciona no pooler em modo transação
-- (lock de sessão, nesse modo, vazaria na conexão do pool).
--
-- Additiva: nenhuma linha existente muda.

-- ---------------------------------------------------------------------------
-- 1. Trava de run — e, de graça, o recibo no banco de que o cron rodou
-- ---------------------------------------------------------------------------
-- Motivo do "de graça": a pergunta "esse cron rodou?" já custou caro duas vezes
-- (75-350: 29 dias sem uma conclusão e sem um erro logado; 75-351: recibo dizendo
-- "16 messages" com zero entregas). `cron_locks` responde por SQL, sem depender de
-- log de plataforma que expira.
create table if not exists public.cron_locks (
  job_name     text primary key,
  run_id       uuid        not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  last_result  jsonb       not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

comment on table public.cron_locks is
  'Story 75-352 — uma linha por cron. Serve de trava (claim_cron_run) e de recibo: started_at/finished_at/last_result dizem se a run terminou e com que números.';

alter table public.cron_locks enable row level security;
-- Sem policy de propósito: só `service_role` (que ignora RLS) escreve e lê. Nenhuma
-- tela consome esta tabela — é infraestrutura de cron, não dado de organização.

-- Reivindica a run. Devolve o `run_id` para quem ganhou, NULL para quem chegou
-- depois. `p_min_interval_seconds` é a distância mínima entre duas runs do mesmo
-- job: cobre de uma vez o caso concorrente (a segunda invocação chega enquanto a
-- primeira roda) e o caso de retry (chega 70s depois, já com a primeira acabada).
--
-- Auto-cura: não existe lease para expirar nem lock para vazar. Uma run que morra
-- no meio não trava nada além do próprio intervalo mínimo.
create or replace function public.claim_cron_run(
  p_job                  text,
  p_min_interval_seconds int
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.cron_locks as l (job_name, run_id, started_at, finished_at, last_result, updated_at)
  values (p_job, v_run_id, now(), null, '{}'::jsonb, now())
  on conflict (job_name) do update
     set run_id      = v_run_id,
         started_at  = now(),
         finished_at = null,
         last_result = '{}'::jsonb,
         updated_at  = now()
   where l.started_at < now() - make_interval(secs => p_min_interval_seconds);

  if not found then
    return null;  -- outra invocação já reivindicou esta janela
  end if;

  return v_run_id;
end;
$$;

comment on function public.claim_cron_run(text, int) is
  'Story 75-352 — devolve run_id para a primeira invocação da janela e NULL para as seguintes. Invocação duplicada (concorrente ou retry) vira no-op.';

-- Fecha a run: registra que terminou e com que números. Não é obrigatório para a
-- trava funcionar (o intervalo mínimo é medido pelo started_at), é o recibo.
create or replace function public.finish_cron_run(
  p_run_id uuid,
  p_result jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.cron_locks
     set finished_at = now(),
         last_result = coalesce(p_result, '{}'::jsonb),
         updated_at  = now()
   where run_id = p_run_id;
$$;

comment on function public.finish_cron_run(uuid, jsonb) is
  'Story 75-352 — marca a run como concluída e guarda os contadores em last_result. Recibo consultável por SQL.';

-- ---------------------------------------------------------------------------
-- 2. Claim atômico do follow-up — a linha nasce ANTES do envio
-- ---------------------------------------------------------------------------
-- Hoje a ordem é: checa cooldown → renderiza → CHAMA O WHATSAPP → grava o log.
-- Entre a checagem e a gravação cabe uma run inteira. Invertendo (grava e depois
-- envia), quem perde a corrida não envia nada: o cooldown já está de pé.
--
-- `p_blocking_types` preserva a semântica que já existe no código, sem alargar:
--   · laço principal (nicole_sent): NULL → QUALQUER tipo no período bloqueia,
--     igual ao `select` sem filtro de tipo do route.ts:120
--   · pós-visita: ARRAY['post_visit'] → só o próprio tipo bloqueia, igual ao
--     `.eq("type","post_visit")` do route.ts:404 e do visit-feedback-core.ts:122
--
-- `status` nasce 'claimed' e o chamador atualiza para 'sent'/'skipped' quando sabe
-- o desfecho. Se o processo morrer no meio, a linha fica 'claimed': o lead perde
-- UM follow-up e ninguém recebe duas mensagens. É o lado seguro para errar.
--
-- `p_status` existe por causa do `alert_broker`, que não tem desfecho de envio: ele
-- nasce 'pending' e é isso que as telas de Alertas leem (`status in ('pending','sent')`
-- em api/followup/pending). Passar 'claimed' ali sumiria com o alerta da tela.
create or replace function public.claim_follow_up(
  p_org_id          uuid,
  p_lead_id         uuid,
  p_type            text,
  p_rule_id         uuid    default null,
  p_metadata        jsonb   default '{}'::jsonb,
  p_cooldown_hours  int     default 48,
  p_blocking_types  text[]  default null,
  p_status          text    default 'claimed'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  -- Serializa por lead. Advisory lock de TRANSAÇÃO: liberado no commit desta
  -- chamada, então não vaza na conexão do pooler. Duas runs no mesmo lead entram
  -- em fila; a segunda enxerga a linha da primeira e desiste.
  perform pg_advisory_xact_lock(hashtext('follow_up_log:' || p_lead_id::text));

  if exists (
    select 1
      from public.follow_up_log
     where lead_id = p_lead_id
       and (p_blocking_types is null or type = any(p_blocking_types))
       and created_at > now() - make_interval(hours => p_cooldown_hours)
  ) then
    return null;  -- cooldown de pé (ou outra run acabou de reivindicar)
  end if;

  insert into public.follow_up_log (org_id, lead_id, rule_id, type, status, scheduled_at, metadata)
  values (p_org_id, p_lead_id, p_rule_id, p_type, p_status, now(), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.claim_follow_up(uuid, uuid, text, uuid, jsonb, int, text[], text) is
  'Story 75-352 — reivindica o follow-up de um lead ANTES do envio e devolve o id da linha, ou NULL se o cooldown já está de pé. Torna envio duplicado impossível mesmo com duas runs concorrentes.';

-- Índice que sustenta o `exists` do claim (lead + tipo + janela de tempo).
create index if not exists idx_follow_up_log_lead_type_created
  on public.follow_up_log (lead_id, type, created_at desc);

-- ROLLBACK PLAN:
--   drop index if exists public.idx_follow_up_log_lead_type_created;
--   drop function if exists public.claim_follow_up(uuid, uuid, text, uuid, jsonb, int, text[], text);
--   drop function if exists public.finish_cron_run(uuid, jsonb);
--   drop function if exists public.claim_cron_run(text, int);
--   drop table if exists public.cron_locks;
-- Nenhuma linha de `follow_up_log` é alterada por esta migration, então o rollback
-- não perde dado. O código volta a gravar `status` 'sent'/'skipped' direto — as
-- linhas 'claimed' que sobrarem seguem valendo como cooldown.
