-- Story 75-66 — Coalescing anti-flood das notificações do portal do cliente.
--
-- Problema: cada foto enviada chama notifyClientes(obra, 'nova_foto') uma vez → lote de N fotos = N
-- mensagens idênticas ao cliente. Solução: só o 1º evento (obra, evento) dentro de uma janela dispara
-- envio; os demais são suprimidos (o cliente vê todas as fotos no portal mesmo assim).
--
-- claim_obra_notif() é a guarda ATÔMICA: retorna true só para quem "ganhou o slot".

create table if not exists obra_notif_dedup (
  obra_id      uuid        not null,
  evento       text        not null,
  last_sent_at timestamptz not null default now(),
  primary key (obra_id, evento)
);

-- Reivindica o slot de envio para (obra, evento). Retorna true se DEVE enviar:
--  - sem linha ainda           → INSERT            → true
--  - última dentro da janela   → conflito + WHERE falso → 0 linhas → NULL (coalescido, não envia)
--  - última fora da janela     → UPDATE            → true
create or replace function claim_obra_notif(
  p_obra_id uuid,
  p_evento text,
  p_window_seconds int
)
returns boolean
language sql
as $$
  insert into obra_notif_dedup (obra_id, evento, last_sent_at)
  values (p_obra_id, p_evento, now())
  on conflict (obra_id, evento) do update
    set last_sent_at = now()
    where obra_notif_dedup.last_sent_at < now() - make_interval(secs => p_window_seconds)
  returning true;
$$;
