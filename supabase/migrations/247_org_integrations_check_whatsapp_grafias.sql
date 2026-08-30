-- 247: org_integrations — CONSTRAINT whatsapp_sem_identificador_proprio deixa de morder só a
-- grafia exata `phone_number_id` (chave de topo) e passa a casar a ESTRUTURA do identificador
-- (três palavras, nesta ordem, com até 2 caracteres não-alfanuméricos entre elas, qualquer
-- caixa) em qualquer lugar do texto serializado do jsonb — qualquer nesting, chave OU valor.
-- [Story 900-24 — fecha ARCH-001, docs/backlog.md, dona explícita desta story]
--
-- Pré-condição (rodar ANTES, read-only, nos dois ambientes): nenhuma linha 'whatsapp' hoje
-- carrega o identificador em NENHUMA grafia — se isto voltar linha, a migration abaixo FALHA
-- ao recriar o CHECK (23514), que é o comportamento correto (mesma disciplina da AC2/246).
--   SELECT id, org_id, config FROM org_integrations
--     WHERE provider = 'whatsapp'
--       AND config::text ~* 'phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id';
--
-- Medido em trifold-crm-dev em 2026-08-29 (Task 7.1): 0 linhas.

ALTER TABLE org_integrations DROP CONSTRAINT IF EXISTS whatsapp_sem_identificador_proprio;
-- IF EXISTS (correção C3): esta migration depende de `246` (900-21b) ter sido aplicada primeiro
-- — sem IF EXISTS, rodar `247` num banco sem `246` falha num DROP em vez de nomear a
-- dependência de ordem. A dependência de deploy continua sendo do @devops (Metadata da story).

ALTER TABLE org_integrations ADD CONSTRAINT whatsapp_sem_identificador_proprio
  CHECK (
    provider <> 'whatsapp'
    OR config::text !~* 'phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id'
  );

COMMENT ON CONSTRAINT whatsapp_sem_identificador_proprio ON org_integrations IS
  'Story 900-24 — fecha ARCH-001 (gate da 900-21b), reescrito pós-NO-GO (B4). Casa a ESTRUTURA
   do identificador (case-insensitive, até 2 caracteres não-alfanuméricos entre as 3 palavras,
   qualquer nesting) contra o TEXTO serializado do jsonb inteiro — sobre CHAVES e VALORES, não
   só a chave de topo em grafia exata. Troca aceita, com custo nomeado: dentro do provider
   "whatsapp" (só ele — o guard `provider <> ''whatsapp''` protege os demais), qualquer VALOR
   que contenha a sequência (ex.: uma observação de texto livre citando "phone_number_id") é
   bloqueado como falso positivo — risco medido como baixo hoje porque não há escritor de
   aplicação para `config` além do seed da 900-21b até a 900-47. Não cobre phone_number sem id
   (fora do escopo original desta invariante) nem ofuscação deliberada (fora do modelo de
   ameaça: o objetivo é impedir reintrodução acidental por um segundo desenvolvedor, não um
   adversário).';
