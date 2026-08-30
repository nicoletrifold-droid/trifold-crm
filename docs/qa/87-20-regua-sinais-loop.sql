-- Story 87-20 — RÉGUA DE REGRESSÃO DOS TRÊS SINAIS DA TRAVA DE LOOP BOT-A-BOT
--
-- Para que serve: reexecutar, contra produção, a medição de falso positivo dos três
-- sinais. **Obrigatória antes do merge sempre que `PADROES_DE_ENCERRAMENTO` mudar** —
-- é a LISTA que carrega o risco do Sinal C, não o mecanismo. Uma linha nova pode
-- transformar 0 falso positivo em N sem que teste nenhum perceba: os testes medem a
-- lista contra si mesma; só esta consulta a mede contra a população real.
--
-- ⚠️ DEVOLVE SÓ NÚMEROS. Nenhum `content`, telefone ou nome sai daqui. O predicado
-- regex vive DENTRO de `count(*)`/`filter`, exatamente como o `md5`/`btrim` do Sinal A.
-- Foi a premissa errada do R6 original ("não há como medir sem ler conteúdo") — um
-- regex dentro de um agregado não devolve conteúdo nenhum.
--
-- Como rodar (read-only, Management API — ver `.claude/CLAUDE.md`):
--   TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.supabase/access-token')))['access_token'])")
--   curl -s -X POST "https://api.supabase.com/v1/projects/dsopqkqjkmhytudaaolv/database/query" \
--     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
--     -d "$(python3 -c "import json;print(json.dumps({'query': open('docs/qa/87-20-regua-sinais-loop.sql').read()}))")"
--
-- ⚠️ O predicado abaixo tem de ser o MESMO de `PADROES_DE_ENCERRAMENTO`
-- (`packages/ai/src/flows/loop-breaker.ts`). Divergência entre os dois faz esta régua
-- medir uma trava que não existe. A ancoragem cruzada está em
-- `loop-breaker.test.ts` → "reproduz a classificação medida no banco, mensagem a
-- mensagem": a coluna `enc` da fixture veio DESTA consulta.
--
-- ── Resultado medido em 2026-08-30 (90 dias, projeto dsopqkqjkmhytudaaolv) ──────────
--   msgs_assistant                1764      conversas                        472
--   msgs_encerramento               41      conversas_com_encerramento        28
--   pico_enc_30min                   8      bloqueadas_sinal_c                 1  ← o incidente
--   no_limite_sinal_c                4                                            (margem de 1)
--   pico_contagem_10min             19      bloqueadas_sinal_b_25              0
--                                           bloqueadas_sinal_b_15              1  ← o FP do limiar antigo
--   pico_repeticao_30min             3      bloqueadas_sinal_a                 1  ← o incidente
--   no_limite_sinal_a                3
--
--   Os denominadores (`msgs_assistant`, `conversas`) DESLIZAM: a janela é relativa a
--   `now()`. Duas execuções com 10 min de diferença deram 1764/472 e 1768/473. O que
--   não pode mudar sem investigação são as linhas `bloqueadas_*` e `pico_*`.
--
--   União dos três com os limiares vigentes: 1 conversa em 90 dias — o incidente.
--   `bloqueadas_sinal_b_15` fica na consulta de PROPÓSITO: é o carrasco histórico do
--   limiar. Se algum dia ele voltar a 0, foi porque a população mudou — não porque o
--   15 era seguro.

with fonte as (
  select conversation_id, created_at, btrim(content) as t
  from messages
  where role = 'assistant'
    and created_at >= now() - interval '90 days'
    -- Story 87-5: transição de handoff é escrita por HUMANO com role='assistant'.
    and coalesce((metadata->>'is_transition')::boolean, false) = false
),
enc as (
  select conversation_id, created_at
  from fonte
  where t ~* '(tchau|até mais|até logo|até breve|até a próxima|qualquer coisa (é )?só chamar|fico à disposição|foi um prazer (te )?atender|um abraço|nos falamos)'
),
-- Sinal C: encerramentos acumulados numa janela deslizante de 30 min.
pico_c as (
  select conversation_id, max(acum) as pico
  from (
    select conversation_id,
           count(*) over (partition by conversation_id order by created_at
                          range between interval '30 minutes' preceding and current row) as acum
    from enc
  ) x group by 1
),
-- Sinal B: mensagens da Nicole numa janela deslizante de 10 min.
pico_b as (
  select conversation_id, max(acum) as pico
  from (
    select conversation_id,
           count(*) over (partition by conversation_id order by created_at
                          range between interval '10 minutes' preceding and current row) as acum
    from fonte
  ) x group by 1
),
-- Sinal A: envios do MESMO texto (btrim) numa janela deslizante de 30 min.
-- `btrim` e não `md5`: é a régua do código (`trim()`), e só pode produzir MAIS
-- colisões que o hash — a mais dura das duas.
pico_a as (
  select conversation_id, max(acum) as pico
  from (
    select conversation_id,
           count(*) over (partition by conversation_id, t order by created_at
                          range between interval '30 minutes' preceding and current row) as acum
    from fonte
  ) x group by 1
)
select
  (select count(*) from fonte)                            as msgs_assistant,
  (select count(distinct conversation_id) from fonte)     as conversas,
  (select count(*) from enc)                              as msgs_encerramento,
  (select count(*) from pico_c)                           as conversas_com_encerramento,
  (select coalesce(max(pico), 0) from pico_c)             as pico_enc_30min,
  (select count(*) from pico_c where pico >= 3)           as bloqueadas_sinal_c,
  (select count(*) from pico_c where pico = 2)            as no_limite_sinal_c,
  (select coalesce(max(pico), 0) from pico_b)             as pico_contagem_10min,
  (select count(*) from pico_b where pico >= 25)          as bloqueadas_sinal_b_25,
  (select count(*) from pico_b where pico >= 15)          as bloqueadas_sinal_b_15,
  (select coalesce(max(pico), 0) from pico_a)             as pico_repeticao_30min,
  (select count(*) from pico_a where pico >= 3)           as bloqueadas_sinal_a,
  (select count(*) from pico_a where pico = 2)            as no_limite_sinal_a;
