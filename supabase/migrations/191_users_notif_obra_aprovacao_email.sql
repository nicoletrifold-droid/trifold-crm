-- Story 75-210 — preferência por usuário para os e-mails de aprovação de obra.
-- Alguns supervisores não querem receber os avisos (imediato, digest diário e
-- lembrete 48h) de uploads aguardando aprovação. Default true = comportamento
-- atual preservado; quem não quiser desliga sozinho em Configurações (toggle
-- self-service, sem depender de dev/admin). Espelha o padrão users.push_enabled.
alter table users
  add column if not exists notif_obra_aprovacao_email boolean not null default true;
