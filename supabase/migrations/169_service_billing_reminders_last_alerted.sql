-- Story 78-11 — Escalonamento de lembretes de billing (D-3, D-0 e e-mail diário até o pagamento).
--
-- Adiciona a coluna de dedup POR DIA do motor de lembretes. O algoritmo da 78-8 usava
-- status='alerted' como dedup PERMANENTE (uma vez alertado, nunca mais) — incompatível com o
-- requisito de "e-mail diário enquanto vencida-e-não-paga". Esta coluna marca a última data
-- (calendário America/Sao_Paulo, "YYYY-MM-DD") em que a linha foi alertada, permitindo:
--   - 1 alerta por dia (dedup por dia, não por status);
--   - reset natural a cada novo dia calendário (o alerta volta a disparar se ainda aplicável).
--
-- Aditiva e retrocompatível (AC9): nullable, SEM DEFAULT. NULL = "nunca alertada" — linhas
-- criadas antes desta migration ficam automaticamente elegíveis para alertar no próximo
-- gatilho aplicável, sem backfill. Idempotente (IF NOT EXISTS) — segura para re-execução.
--
-- NÃO precisa de índice dedicado: o filtro por last_alerted_on é feito em memória (mesmo
-- padrão da 78-8, que já filtrava a janela de alerta em memória); o índice existente
-- idx_service_billing_reminders_status_due (status, due_date) segue cobrindo a query do cron.

ALTER TABLE service_billing_reminders
  ADD COLUMN IF NOT EXISTS last_alerted_on date;

COMMENT ON COLUMN service_billing_reminders.last_alerted_on IS
  'Última data (America/Sao_Paulo, YYYY-MM-DD) em que a linha disparou alerta. NULL = nunca alertada. Dedup POR DIA do cron de lembretes (Story 78-11). Server-only: nunca aceito cru do cliente.';
