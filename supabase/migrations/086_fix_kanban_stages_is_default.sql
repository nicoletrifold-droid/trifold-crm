-- 086_fix_kanban_stages_is_default
-- Todos os stages tinham is_default=true, causando indeterminismo
-- ao criar leads via webhook (maybeSingle() retornava stage aleatório).
-- Apenas "Aguardando atendimento" (slug=novo) deve ser o default.
UPDATE kanban_stages SET is_default = false;
UPDATE kanban_stages SET is_default = true WHERE slug = 'novo';
