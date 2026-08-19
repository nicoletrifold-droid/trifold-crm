-- Story 75-351 — `follow_up_log.metadata` nunca existiu, e dois inserts dependiam dela.
--
-- Achado em 19/08/2026, conferindo o efeito da 75-350 em produção:
--   select type, count(*) from follow_up_log group by type;
--   → alert_broker 465 · nicole_sent 0 · post_visit 0
--
-- `alert_broker` é o ÚNICO insert que não manda `metadata`. Os outros dois mandam,
-- a coluna não existe, o PostgREST devolve erro — e o código descarta o `{ error }`
-- do `.insert()`. Falha 100% silenciosa desde que a funcionalidade subiu.
--
-- O estrago não é o dado perdido, é o COOLDOWN: a janela de 48h por lead é lida
-- desta tabela. Sem a linha, todo lead é elegível de novo a cada run de 2h — ou
-- seja, o mesmo lead podia receber o mesmo follow-up várias vezes ao dia. Não
-- aconteceu em julho/agosto só porque a janela de 24h do WhatsApp estava fechada
-- para praticamente todos (0 enviadas em 2 meses, 4.493 puladas).
--
-- Additiva e idempotente: não altera nada do que já está gravado.
alter table public.follow_up_log
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.follow_up_log.metadata is
  'Contexto do envio (channel, reason, appointment_id, origem). Story 75-351: a coluna faltava e os inserts de nicole_sent/post_visit falhavam em silêncio, matando o cooldown de 48h.';
