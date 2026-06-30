-- 126_sienge_webhook_dedup.sql
-- Story 75-76 — Idempotência do webhook do Sienge (notificação de novo boleto).
--
-- O Sienge re-tenta a entrega de um evento até 5× ao longo de ~10h (10→30→60→180→300 min).
-- Sem dedup, o cliente receberia o MESMO aviso de boleto várias vezes. Esta tabela + função
-- atômica garantem que cada evento (chave de negócio receivableBillId:installmentId) seja
-- processado UMA vez. Em caso de falha no processamento, a rota apaga a chave para permitir
-- que uma retry posterior re-processe.

create table if not exists sienge_webhook_dedup (
  event_key    text        primary key,
  event_type   text        not null,
  processed_at timestamptz not null default now()
);

-- Reivindica o slot de processamento para um evento. Atômico:
--  - chave inédita  → INSERT            → true  (DEVE processar)
--  - chave repetida → ON CONFLICT nada  → 0 linhas → NULL (já processado, ignora)
create or replace function claim_sienge_webhook(
  p_event_key text,
  p_event_type text
)
returns boolean
language sql
as $$
  insert into sienge_webhook_dedup (event_key, event_type)
  values (p_event_key, p_event_type)
  on conflict (event_key) do nothing
  returning true;
$$;
