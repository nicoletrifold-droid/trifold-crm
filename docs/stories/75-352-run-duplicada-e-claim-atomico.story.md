# Story 75-352 — O cron roda duas vezes por agendamento, e as duas passam pelo cooldown

**Status:** InReview — gate PASS · **migration 234 NÃO aplicada** (ver "Ordem de deploy")
**Tipo:** Corrida de concorrência + desperdício de envio e de chamada de modelo
**Epic:** 75 — CRM Trifold
**Complexidade:** M (~5 pts — 1 migration com 3 funções, 2 helpers novos, 4 pontos de chamada)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** **234** (`cron_locks` + `claim_cron_run` / `finish_cron_run` / `claim_follow_up`) — additiva.
**Depende de:** PR #462 (Story 75-351). Esta branch nasce dele e mexe nas mesmas linhas.

## Como apareceu

Conferindo com o Marcos a timeline de um lead, a tela mostrava a MESMA atividade repetida de duas em
duas horas — e, em cada horário, duas vezes: 11:00 e 11:01, 09:00 e 09:00, 19:00 e 19:01.

A repetição de 2h era a 75-351 (cooldown que nunca gravava). O par no mesmo minuto era outra coisa:

```
19/08 22:01:10  FOLLOWUP_EXECUTED  "98 processed, 15 messages, 22 post-visit (0 erros)"
19/08 22:01:10  FOLLOWUP_EXECUTED  "99 processed, 16 messages, 24 post-visit (0 erros)"
```

**Dois recibos no mesmo segundo, com contadores diferentes.** Duas execuções concorrentes da mesma
run, intercaladas lead a lead com ~1s de diferença.

## O tamanho, medido em produção

| Medida | Valor |
|---|---|
| Tentativas de follow-up em 7 dias, etapa "Atendimento" | **1.560** para **46 leads** (≈34 por lead) |
| Linhas duplicadas em `follow_up_log` (mesmo lead, tipo e dia) | **58** (`post_visit` 22 · `alert_broker` 21 · `nicole_sent` 15) — todas em pares |
| Chamadas Anthropic desperdiçadas por run | metade das 22 a 24 do pós-visita |
| Entregas ao lead nesse período | **0** (janela de 24h do WhatsApp fechada — assunto da 75-353) |

O único motivo pelo qual isso não virou mensagem repetida no WhatsApp de ninguém é a janela de 24h
estar fechada para praticamente todos. É o mesmo "armado e esperando" da 75-351.

## Por que as duas passam

```ts
const { data: inCooldown } = await supabase.from("follow_up_log")...  // ① lê
...
const result = await sendFollowUpMessage(...)                          // ② ENVIA
await supabase.from("follow_up_log").insert({...})                     // ③ grava
```

Entre ① e ③ cabe uma run inteira — e cabia de fato. Duas invocações leem o cooldown antes de qualquer
uma escrever, e as duas seguem. Nenhum ajuste de intervalo conserta isso: é ordem de operações.

## Onde a segunda chamada NÃO está

Procurado antes de escrever qualquer código, porque a tentação é culpar o agendamento:

- **Manifesto de cron da Vercel** (`GET /v9/projects/{id}`): 36 definições, `/api/cron/followup`
  aparece **uma** vez (`0 */2 * * *`). Nenhuma duplicada.
- **`cron.job` do Postgres**: 6 jobs, nenhum chama o follow-up.
- **Projetos na conta Vercel**: 2, e o outro é o `trifold-design-system`.
- **`/api/alertas/nicole-trigger`** (a única outra porta no repo): faz `POST` numa rota que só exporta
  `GET` → 405. Nunca funcionou, então não é o gatilho (é bug próprio, fica para a 75-355).

**Conclusão honesta: o gatilho é externo ao que o repo mostra.** A hipótese mais forte é retry por
timeout — a run levou ~70s (22:00:0x → 22:01:10) e o arquivo faz ~800 queries sequenciais (já mapeado
como P0-5 em `docs/audits/performance-database-audit.md`). Esta story conserta o EFEITO sem depender
de confirmar a causa; encurtar a run é a 75-356.

## AC1 — A run só roda uma vez por janela (`cron_locks` + `claim_cron_run`)

`claim_cron_run('followup', 5400)` devolve `run_id` para a primeira invocação e **NULL** para as
seguintes; quem recebe NULL responde `{ skipped_reason: "already_running" }` e não processa nada.

Um parâmetro só — intervalo mínimo entre runs — cobre os dois formatos do problema: a invocação
concorrente (chega durante) e o retry (chega depois de terminar). 90 min para um cron de 2h deixa
folga de atraso sem abrir espaço para a duplicata.

Sem lease para expirar e sem lock de sessão para vazar no pooler: uma run que morra no meio não trava
nada além do próprio intervalo.

**A trava fica DEPOIS da checagem de horário comercial** — run fora de janela não faz nada e não pode
consumir o intervalo da run válida.

## AC2 — O lead só é reivindicado uma vez (`claim_follow_up`)

A ordem virou: **grava e depois envia**. `claim_follow_up` faz `pg_advisory_xact_lock` por lead, checa
a janela e insere a linha (`status='claimed'`) na mesma transação. Quem perde a corrida recebe NULL e
**não envia nada**.

Advisory lock de **transação**, não de sessão: é liberado no commit, então funciona no pooler em modo
transação (o de sessão vazaria na conexão do pool).

`p_blocking_types` preserva a semântica que já existia, sem alargar nada:

| Chamada | Tipos que bloqueiam | Espelha |
|---|---|---|
| laço principal (`nicole_sent`) | qualquer (`null`) | `route.ts:120`, sem filtro de tipo |
| `alert_broker` | qualquer (`null`) | idem — é o mesmo pré-filtro |
| pós-visita (cron) | só `post_visit` | `.eq("type","post_visit")` do `route.ts:404` |
| pós-visita (feedback do corretor) | só `post_visit` | `visit-feedback-core.ts:122` |

O `cooldownSet` em lote continua existindo como **pré-filtro barato** (evita ~800 RPCs por run). Quem
decide passou a ser o claim.

## AC3 — O pós-visita reivindica antes de pagar o modelo

No cron e na porta do feedback, o claim entra **antes** do `generatePostVisitMessage`. A ordem antiga
fazia a run duplicada redigir a mensagem dos 22 a 24 agendamentos para jogar metade fora.

## AC4 — `alert_broker` entra no claim, e a guarda anti-spam volta a medir o que pensa medir

`notifyBrokerOfStalledLead` decide olhando **quantas linhas** de `alert_broker` existem (`> 1` =
alerta anterior aberto → não notifica). Com duas runs inserindo concorrentemente, essa contagem era
uma corrida: o corretor podia levar notificação dupla, ou nenhuma. Com o claim existe exatamente uma
linha.

A linha de `alert_broker` nasce `'pending'`, não `'claimed'` — é o status que as telas de Alertas leem
(`api/followup/pending` filtra `status in ('pending','sent')`). Nascer `'claimed'` faria o alerta
desaparecer da tela.

## AC5 — Duplicata evitada é número no recibo, e o recibo vai para o banco

`duplicatas_evitadas` entra no `FOLLOWUP_EXECUTED` e no JSON de resposta. **Zero é o estado saudável**;
qualquer número acima disso é a prova de que a segunda invocação continua chegando e de que o claim
está segurando.

O recibo inteiro também vai para `cron_locks.last_result` por uma escrita **aguardada**. O `logEvent`
é fire-and-forget e pode morrer no congelamento da lambda (foi o que aconteceu na 87-6): a linha de
`cron_locks` é a prova que sobra de que a run terminou, e com que números. Responde por SQL a pergunta
que já custou 29 dias (75-350) — "esse cron rodou?".

## Dev Agent Record

- [x] AC1 — `cron_locks` + `claim_cron_run`/`finish_cron_run`; guarda no início da rota.
- [x] AC2 — `claim_follow_up` com advisory lock de transação; 4 pontos de chamada convertidos.
- [x] AC3 — claim antes do `generatePostVisitMessage` nas duas portas.
- [x] AC4 — `alert_broker` reivindicado com `status='pending'`.
- [x] AC5 — `duplicatas_evitadas` no recibo + `finish_cron_run` aguardado.

### Decisões de implementação

- **Advisory lock em vez de índice único.** `(lead_id, type, dia)` era o índice óbvio, mas
  `follow_up_log` **já tem 58 linhas que o violariam** — as duplicatas que este bug gerou. Criar o
  índice exigiria apagar histórico de log, ou seja, destruir a evidência do incidente para poder
  consertá-lo. O lock por lead resolve a corrida sem tocar em uma linha do que está gravado.
- **Assimetria de fail-safe, de propósito:**
  - trava de RUN → **fail-open**. Se o RPC falhar, a run segue gritando `CRON_LOCK_INDISPONIVEL`.
    Fechar aqui transformaria erro de infraestrutura em "nenhum lead recebe follow-up", e quem impede
    envio duplicado de verdade é o claim por lead.
  - claim por LEAD → **fail-closed**. Perder um follow-up é recuperável na run seguinte; mandar a
    mesma mensagem duas vezes para o mesmo lead, não.
- **O `throw` da 75-351 saiu dos dois pontos de pós-visita.** Ele existia porque o insert ERA o
  cooldown — falhar em silêncio reprocessava o agendamento a cada 2h. Agora o cooldown é a linha
  reivindicada, que já está no banco antes do envio: derrubar o processamento do lead por causa de uma
  falha ao gravar o *desfecho* seria custo sem benefício. Continua ruidoso via
  `FOLLOWUP_CLAIM_SEM_DESFECHO`.
- **Linha presa em `'claimed'` é sinal, não sujeira.** Significa run morta no meio: o lead perdeu UM
  follow-up e ninguém recebeu duas mensagens. É o lado seguro para errar, e é consultável.
- **Não mexi nos 3 warnings de import morto** do `route.ts` (`isWithinWhatsAppWindow`,
  `sendWhatsAppMessage`, `TELEGRAM_BOT_TOKEN`, sobras da 75-350). São anteriores a esta story; limpar
  aqui misturaria diff de incidente com diff de faxina.

### Validações

`npx vitest run` 231 arquivos / **2.806 testes** ✅ (16 novos) · `type-check` 8/8 ✅ ·
`eslint` 0 erros (3 warnings pré-existentes) ✅

**Migration validada em produção dentro de transação REVERTIDA** (`BEGIN … ROLLBACK`), com corrida de
verdade:

| Asserção | Resultado |
|---|---|
| 1ª chamada de `claim_cron_run` ganha | ✅ |
| 2ª chamada (mesma janela) devolve NULL | ✅ |
| 1º `claim_follow_up` do lead ganha | ✅ |
| 2º `claim_follow_up` do mesmo lead devolve NULL | ✅ |
| `status` da linha nasce `claimed` | ✅ |
| Pós-visita NÃO é bloqueado por `nicole_sent` (semântica preservada) | ✅ |
| Depois do ROLLBACK: tabela, funções e linhas de teste inexistentes | ✅ |

## File List

- `supabase/migrations/234_cron_lock_e_claim_atomico.sql` *(novo — **não aplicada**)* — AC1/AC2
- `packages/web/src/lib/cron/claim-run.ts` *(novo)* — AC1/AC5
- `packages/web/src/lib/cron/claim-run.test.ts` *(novo)* — 8 testes
- `packages/web/src/lib/followup/claim.ts` *(novo)* — AC2/AC4
- `packages/web/src/lib/followup/claim.test.ts` *(novo)* — 8 testes
- `packages/web/src/app/api/cron/followup/route.ts` — AC1..AC5
- `packages/web/src/lib/appointments/visit-feedback-core.ts` — AC2/AC3
- `docs/qa/gates/75-352-run-duplicada-e-claim-atomico.yml` *(novo)*

## Ordem de deploy (não é detalhe)

**A migration 234 precisa estar aplicada ANTES do código subir.** O claim por lead é fail-closed: sem
o RPC, o follow-up para de enviar (gritando `FOLLOWUP_CLAIM_FALHOU` em cada lead). A migration é
additiva e idempotente — aplicá-la antes não muda o comportamento do código que está em produção hoje,
porque nada ainda a chama.

Sequência: **aplicar 234 → mergear #462 (75-351) → mergear este PR**.

## Verificar depois do deploy

1. **A trava pegou** — depois da primeira run:
   ```sql
   select job_name, started_at, finished_at, last_result from cron_locks where job_name = 'followup';
   ```
   `finished_at` preenchido = a run terminou. É a primeira vez que isso é consultável.

2. **A duplicata continua chegando?** — é o que decide se a 75-356 (encurtar a run) é urgente:
   ```sql
   select count(*) from system_events
    where event_type = 'FOLLOWUP_RUN_DUPLICADA' and created_at > now() - interval '1 day';
   ```
   Se aparecer 1 por agendamento, o segundo gatilho persiste e a trava está absorvendo. Se aparecer 0,
   o gatilho era outro — e aí a hipótese de retry por timeout cai.

3. **Nenhum par novo** — a consulta que revelou o problema não pode crescer:
   ```sql
   select lead_id, type, created_at::date, count(*) from follow_up_log
    where created_at > now() - interval '1 day' group by 1,2,3 having count(*) > 1;
   ```
   Zero linhas.

4. **Nada preso em `claimed`** por mais de uma run:
   ```sql
   select count(*) from follow_up_log where status = 'claimed' and created_at < now() - interval '3 hours';
   ```
   Diferente de zero = run morrendo no meio, e aí o próximo passo é achar onde.
