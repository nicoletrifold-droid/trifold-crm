-- Story 75-170 — busca full-text no CONTEÚDO das conversas (estilo WhatsApp).
--
-- Índice GIN de tsvector em português + unaccent (reusa o wrapper IMMUTABLE
-- public.f_unaccent da mig 174) sobre messages.content, e RPC que devolve as
-- conversas cujo conteúdo casa com o termo, com o trecho da mensagem mais
-- recente que casou (pro card mostrar, estilo WhatsApp).
--
-- SECURITY INVOKER: roda sob a RLS do chamador (messages_select já restringe
-- por org + admin/supervisor OU corretor responsável) — cada perfil só encontra
-- o que já pode ler.

CREATE INDEX IF NOT EXISTS idx_messages_content_fts
  ON public.messages
  USING gin (to_tsvector('portuguese', public.f_unaccent(coalesce(content, ''))));

create or replace function public.search_conversation_messages(
  p_org uuid,
  p_term text,
  p_limit int default 100
)
returns table(conversation_id uuid, snippet text, match_count bigint)
language sql
stable
security invoker
as $$
  with q as (
    select websearch_to_tsquery('portuguese', public.f_unaccent(p_term)) as tsq
  )
  select
    m.conversation_id,
    -- trecho = a mensagem MAIS RECENTE que casou (o card trunca na exibição)
    (array_agg(m.content order by m.created_at desc))[1] as snippet,
    count(*) as match_count
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  cross join q
  where c.org_id = p_org
    and q.tsq is not null
    and to_tsvector('portuguese', public.f_unaccent(coalesce(m.content, ''))) @@ q.tsq
  group by m.conversation_id
  order by max(m.created_at) desc
  limit p_limit
$$;

comment on function public.search_conversation_messages(uuid, text, int) is
  'Story 75-170: conversas cujo CONTEÚDO de mensagens casa com o termo (FTS português + unaccent), com trecho da última mensagem que casou. Security invoker (RLS de messages vale).';
