# Story 75-351 — O insert que falhava em silêncio: `follow_up_log.metadata` nunca existiu, e o cooldown de 48h nunca funcionou

**Status:** InReview — gate PASS · **migration 233 JÁ APLICADA em produção** (mitigação imediata)
**Tipo:** Defeito silencioso de escrita + observabilidade que mentia
**Epic:** 75 — CRM Trifold
**Complexidade:** S/M (~3 pts — 1 migration additiva, 3 inserts, 2 contadores)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** **233** (`follow_up_log.metadata`) — additiva, idempotente, **aplicada em 19/08 20:05 UTC**.

## Como apareceu

Conferindo em produção o efeito da 75-350, a run das 20:02 UTC concluiu (o cron voltou a funcionar
depois de 29 dias) e eu fui olhar **quantas mensagens chegaram de fato ao lead**. A consulta reprovou
antes de responder:

```
ERROR: 42703: column "metadata" does not exist
```

`follow_up_log` **não tem** coluna `metadata` — e dois dos três inserts da tabela mandam uma.

## O defeito, em uma frase

**O `{ error }` do `.insert()` era descartado**, então os dois inserts que carregavam `metadata`
falhavam 100% das vezes, sem exceção, sem log, sem sintoma.

```sql
select type, count(*) from follow_up_log group by type;
-- alert_broker  465     ← o ÚNICO insert que não manda metadata
-- nicole_sent     0     ← sempre falhou
-- post_visit      0     ← sempre falhou
```

Zero linhas de `nicole_sent` e `post_visit` **desde que a funcionalidade subiu**.

## Por que isso é pior do que perder dado

**A janela de cooldown de 48h por lead é lida desta tabela** (`route.ts:120`, sem filtro de tipo).
Sem a linha, o lead volta a ser elegível na run seguinte — de 2 em 2 horas, indefinidamente. Ou seja:
o mesmo lead podia receber o mesmo follow-up várias vezes ao dia, e o mesmo agendamento era
reprocessado para sempre (com uma chamada de modelo por vez).

**Por que não explodiu antes:** a janela de 24h do WhatsApp barrava quase tudo. Julho e agosto somam
**0 mensagens entregues** e **4.493 puladas** — todas por `WHATSAPP_WINDOW_CLOSED`. O defeito estava
armado e esperando conversas ativas para virar spam. E as conversas ficaram ativas hoje, com a
75-347/75-348 no ar.

**Conferido na run de 20:02 (a primeira depois do conserto da 75-350):** 84 puladas, todas por janela
fechada, **zero entregas**. Ninguém recebeu nada duplicado — **não houve dano ao lead**, e por isso
esta story **não faz backfill** de linha de log.

## AC1 — A coluna (migration 233, já aplicada)

```sql
alter table public.follow_up_log
  add column if not exists metadata jsonb not null default '{}'::jsonb;
```

Aplicada **antes** do resto por ser a mitigação que não depende de deploy: o código que já está em
produção manda `metadata`, então com a coluna no lugar o insert passa a funcionar e o cooldown volta a
existir na run seguinte (22:00 UTC).

## AC2 — Nenhum dos três inserts descarta erro

- `nicole_sent`: a mensagem já foi enviada e não há como desfazer, então o insert que falha **grita**
  (`FOLLOWUP_LOG_FALHOU`, level `error`, dizendo explicitamente que o cooldown daquele lead está
  comprometido).
- `post_visit` (cron): **`throw`** — o try/catch por agendamento da 75-350 registra e o cron segue com
  os outros leads. Falhar aqui em silêncio era o que fazia o mesmo agendamento voltar a cada 2h.
- `post_visit` (porta do feedback do corretor): mesmo `throw`, capturado pelo `catch` que a 75-350
  transformou em `logEventOnce`.

## AC3 — O recibo do cron para de mentir

O recibo da run de 20:02 dizia **"16 messages"** com **zero** entregas. O `messagesSent++` ficava
depois das duas ramificações (enviou / pulou), então contava **leads processados**. Quem lesse o log
concluiria que o follow-up estava funcionando.

Agora são números separados e com nome honesto: `messages_sent` / `messages_skipped` e
`post_visit_sent` (entregues) / `post_visit_processados`.

## Dev Agent Record

- [x] AC1 — migration 233 aplicada por Management API (`add column if not exists`, idempotente).
- [x] AC2 — os três inserts verificam `{ error }`.
- [x] AC3 — contadores separados no recibo e no JSON de resposta.

### Decisões de implementação

- **Coluna em vez de tirar o `metadata` dos inserts.** O conteúdo é útil (`channel`, `reason`,
  `appointment_id`, `origem`) e o código já contava com ele; a alternativa deixaria o cooldown
  funcionando e o diagnóstico cego.
- **Migration aplicada ANTES do PR**, de propósito: era a única mitigação que não esperava deploy, e o
  código em produção já mandava o campo. Additiva e idempotente — nada do que estava gravado muda.
- **Sem backfill.** Verificado que ninguém recebeu mensagem duplicada (0 entregas na run de 20:02, 84
  puladas por janela fechada). Inventar linha de log para eventos que não aconteceram seria criar
  histórico falso — o mesmo pecado que a 75-350 corrigiu.

### Validações

`npx vitest run` 229 arquivos / **2.790 testes** ✅ · `type-check` 8/8 ✅ · `lint` 0 erros ✅

## File List

- `supabase/migrations/233_follow_up_log_metadata.sql` *(novo — APLICADA em prod)* — AC1
- `packages/web/src/app/api/cron/followup/route.ts` — AC2/AC3
- `packages/web/src/lib/appointments/visit-feedback-core.ts` — AC2
- `docs/qa/gates/75-351-insert-que-falhava-em-silencio.yml` *(novo)*

## Verificar depois do deploy

1. **A prova de que o cooldown voltou** — depois da run das 22:00 UTC:
   ```sql
   select type, status, count(*) from follow_up_log
   where created_at > '2026-08-19 21:00:00+00' group by 1,2;
   ```
   Tem de aparecer `nicole_sent` e/ou `post_visit`. Antes de hoje: zero, sempre.
2. Na run seguinte (00:00 UTC), os MESMOS leads não podem reaparecer — é o cooldown de 48h fazendo o
   trabalho pela primeira vez.
3. `messages_sent` vs `messages_skipped` no recibo: agora o primeiro número é entrega de verdade.
4. Se `FOLLOWUP_LOG_FALHOU` aparecer em `system_events`, o cooldown está comprometido de novo — é o
   alarme que não existia.

Relacionado: 75-350 (o conserto cuja verificação revelou este defeito) · [[project-followup-nicole-nunca-enviou]] ·
87-6 (falha silenciosa que só existe se ninguém mede)
