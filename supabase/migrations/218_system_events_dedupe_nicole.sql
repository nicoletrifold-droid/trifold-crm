-- 218_system_events_dedupe_nicole.sql
-- Story 87-6 — a unicidade dos eventos da reconciliação da Nicole passa a ser
-- garantia do BANCO, não de um `select` que precede um `insert`.
--
-- ⚠️ RENUMERADA de 217 → 218 pelo @devops em 10/08/2026, na abertura do PR:
--    `origin/main` avançou e o prefixo 217 foi consumido por
--    `217_leads_qualificacao_comercial.sql` (Story 84-1, PR #362). Nenhuma
--    colisão de conteúdo — aquela migration não toca `system_events`.
--
-- O problema:
--   Dois projetos Vercel deployam o mesmo `packages/web` e o mesmo `vercel.json`,
--   então TODO cron dispara duas vezes. Medido no banco em 08/08/2026 sobre o cron
--   `followup` (`FOLLOWUP_MESSAGE_SKIPPED`, 06–08/08): 173 de 178 pares
--   (lead_id, hora-do-cron) têm DUAS linhas = 97 %. Gap entre as duas escritas do
--   mesmo lead: mín. 2,9 s · mediana 43 s · máx. 138 s.
--
--   O dedupe da 87-3 era `select` em `system_events` → filtra em JS → `insert`.
--   Com 43 s de folga ele ganha na maioria das vezes, mas 2,9 s de mínimo mostra
--   que a cauda encosta. E o `NICOLE_LASTRO_DIARIO` não tinha nem `select`: para
--   ele a duplicata não era corrida, era certeza.
--
--   Confirmado em produção em 10/08/2026 11:38 UTC — a primeira execução real do
--   cron: 11:38:24 gravou `NICOLE_AFIRMACAO_SEM_LASTRO`; 11:38:46 gravou
--   `NICOLE_LASTRO_DIARIO` com `alertas_novos: 0`, ou seja, de uma invocação cujo
--   `select` JÁ enxergava o alerta da primeira. São duas invocações a 22 s.
--
-- ⚠️ Não existe índice único "um por dia" sobre `created_at`: `date_trunc('day', …)`
--    e `::date` sobre `timestamptz` são STABLE, não IMMUTABLE. A chave do dia tem
--    de vir do código, em `metadata.dedupe_key` — é o que o índice (B) indexa.

-- ---------------------------------------------------------------------------
-- (A) JÁ APLICADO EM PRODUÇÃO em 08/08/2026 por Management API (Gabriel), com
--     pré-check (zero colisões) e prova real de `23505` na segunda inserção.
--     Esta migration existe para VERSIONAR o que já está no ar: o DDL abaixo é
--     cópia literal de `pg_indexes` (reconferido em 10/08/2026 pelo @dev).
--     NÃO "melhorar" o nome nem o predicado — `IF NOT EXISTS` casa por NOME, e
--     qualquer divergência criaria um SEGUNDO índice redundante sobre a mesma
--     expressão, na mesma tabela.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_system_events_afirmacao_sem_lastro_message
  ON system_events ((metadata ->> 'message_id'))
  WHERE event_type = 'NICOLE_AFIRMACAO_SEM_LASTRO'
    AND metadata ? 'message_id';

-- ---------------------------------------------------------------------------
-- (B) NOVO. Protege QUALQUER evento que se declare deduplicável. Opt-in por
--     metadata: evento sem `dedupe_key` não é tocado — nenhum dos 11.985 eventos
--     existentes entra (medido em 10/08/2026: 0 linhas com `dedupe_key`).
--
--     `event_type` é COLUNA do índice (não parte da string) para que dois tipos
--     de evento nunca colidam entre si.
--
--     ⚠️ Este índice é INÓCUO até o deploy do código que emite a chave — ele
--     exige `metadata.dedupe_key`, que só o `logEventOnce` da 87-6 produz.
--     Inócuo não é errado: aplicá-lo antes é seguro.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_events_dedupe_key
  ON system_events (event_type, (metadata->>'dedupe_key'))
  WHERE metadata->>'dedupe_key' IS NOT NULL;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO (rodar depois; a contagem É a prova de que nada redundante subiu)
--
--   select indexname, indexdef from pg_indexes
--    where tablename='system_events' order by indexname;
--   -- esperado: 9 índices (7 pré-existentes + A + B). 10 = a migration divergiu
--   --           do que está no ar.
--
--   -- prova de (B), dentro de transação desfeita:
--   BEGIN;
--     INSERT INTO system_events (level,category,event_type,message,metadata)
--       VALUES ('info','ai','NICOLE_LASTRO_DIARIO','t1','{"dedupe_key":"prova-218"}');
--     INSERT INTO system_events (level,category,event_type,message,metadata)
--       VALUES ('info','ai','NICOLE_LASTRO_DIARIO','t2','{"dedupe_key":"prova-218"}');
--   ROLLBACK;
--   -- esperado: a SEGUNDA falha com 23505. ROLLBACK obrigatório.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- ROLLBACK
-- Ordem importa: reverter O CÓDIGO PRIMEIRO. Com o código novo e o índice
-- derrubado, o dedupe simplesmente deixa de existir (volta ao comportamento de
-- hoje). Com o índice de pé e o código antigo, o `logEvent` do perdedor loga
-- `LOGGER_FALLBACK` — barulho, não dano.
--
--   DROP INDEX IF EXISTS ux_system_events_dedupe_key;
--   DROP INDEX IF EXISTS uniq_system_events_afirmacao_sem_lastro_message;
--
-- Gatilhos de rollback: `23505` em evento que NÃO seja um dos dois desta story;
-- o cron passar a falhar (HTTP 500); ou `NICOLE_LASTRO_DIARIO` DEIXAR de ser
-- publicado (dedupe engolindo o que devia passar).
-- ---------------------------------------------------------------------------
