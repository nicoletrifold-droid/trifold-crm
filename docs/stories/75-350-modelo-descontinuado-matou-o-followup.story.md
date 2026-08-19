# Story 75-350 — O modelo descontinuado que matou o follow-up pós-visita (e derrubava o cron inteiro)

**Status:** InReview — gate PASS
**Tipo:** Incidente de produção (4 semanas) + a causa-raiz de um pendente antigo do backlog
**Epic:** 75 — CRM Trifold
**Complexidade:** M (~5 pts — 1 string, 1 blindagem de cron, 1 porta que mentia, 0 migrations)
**Fluxo:** @sm → @po → @dev → @qa → @devops
**Migrations:** nenhuma.

## O gatilho (Marcos, 19/08)

E-mail da Anthropic às 14:42: *"Recentemente, Trifold enviou requisições de API para
`claude-3-5-haiku-20241022`. A Anthropic descontinuou esse modelo em 19 de fevereiro de 2026, portanto
essas requisições agora estão retornando `not_found_error` (HTTP 404)."*

Pergunta dele: **o que isso impacta e como resolver.**

## Onde a string estava

Um lugar só: `packages/ai/src/flows/post-visit-followup.ts`, com o alias
**`claude-3-5-haiku-latest`** — que resolvia para o ID descontinuado. É a mensagem que a Nicole manda
ao lead **depois da visita**.

## O impacto, MEDIDO em produção

`system_events`, `source = 'api/cron/followup'`:

| Dia | Cron CONCLUIU (`FOLLOWUP_EXECUTED`) | Tentativas | Erros logados |
|---|---|---|---|
| 20/07 | 12 | 275 | 0 |
| **21/07** | **7** | 217 | 0 |
| **22/07** | **0** | 142 | **0** |
| 23/07 … 19/08 (29 dias) | **0** | 90 a 500/dia | **0** |

Julho fechou com 19 conclusões e a última foi **21/07 18:00 UTC**. Agosto: **zero**.

**O cron nunca parou de rodar** — segue disparando de 2 em 2 horas e gravando centenas de eventos por
dia. Ele para **no meio**, sempre no mesmo lugar, e nunca chega ao `logEvent(FOLLOWUP_EXECUTED)` que
vem depois do bloco de pós-visita. E como a exceção escapava antes de qualquer log de erro, **zero
eventos de erro em 29 dias**: a falha não tinha como aparecer para ninguém.

## Duas portas, as duas quebradas

### Porta 1 — o cron (`api/cron/followup/route.ts`)

`generatePostVisitMessage` era chamado **sem try/catch nenhum** dentro do laço de agendamentos. O 404
do PRIMEIRO agendamento abortava a run inteira. Quem estava depois na fila nunca foi processado.

### Porta 2 — o feedback do corretor (`visit-feedback-core.ts`)

`try { … } catch { console.error(...) }`. Fail-open **e invisível**: nada no banco, nada em
`system_events`, só uma linha no console da Vercel que ninguém abre.

**👉 Isto responde o pendente do backlog** ([[project-followup-nicole-nunca-enviou]], medido em 11/08:
*"pós-visita 17 feedbacks → 0"*). A pergunta era "achar POR QUE antes de consertar". O porquê é este
404, desde 22/07.

## O segundo defeito, que só apareceu porque o primeiro foi consertado

A porta do feedback **nunca mandou nada para o WhatsApp**. Ela gravava:

- `follow_up_log` com `status: "sent"` e `sent_at` preenchido;
- uma linha em `messages` com `role: "assistant"`;
- atividade *"Nicole enviou follow-up pos-visita"*.

E **não existe envio ali** — nem chamada à Graph API, nem trigger em `messages` que envie (conferido em
produção: só `update_conversation_last_msg` e `bump_lead_last_contact_from_message`).

Ou seja: consertar só o modelo transformaria um no-op silencioso em **mentira no CRM** — o corretor
lendo "Nicole enviou" e o lead sem receber nada. Por isso entra no mesmo PR.

E uma mentira menor, no cron: `skipped = !result.sent && result.reason === "WHATSAPP_WINDOW_CLOSED"`
→ `status: skipped ? "skipped" : "sent"`. Qualquer outra falha (erro da Graph API, credencial ausente)
era gravada como **enviada**.

## AC1 — O modelo, pela constante e sem alias

`ANTHROPIC_MODELS.haiku` (`claude-haiku-4-5-20251001`) — exatamente a substituição que a Anthropic
recomenda no e-mail.

🔥 **A lição é o ALIAS, não a data.** `-latest` é alvo móvel: muda debaixo do deploy, sem PR, sem aviso
e sem teste que acenda. Modelo se pina por ID completo, vindo da constante.

## AC2 — Falha de um lead não cala o cron dos outros

`try/catch` **por agendamento**, com evento `FOLLOWUP_POST_VISIT_ERRO` (level `error`) e um contador
`post_visit_erros` no recibo final. Sem o contador, "não havia o que enviar" e "tudo falhou" são a
mesma linha de log.

## AC3 — A porta do feedback passa a ENVIAR de verdade

`sendFollowUpMessage` saiu de dentro da rota do cron para `lib/whatsapp/send-followup-message.ts` — era
por estar trancada lá dentro que a outra porta improvisou. Agora as duas usam o mesmo remetente, com a
checagem da janela de 24h do WhatsApp.

⚠️ **Mudança de comportamento declarada:** quando o corretor preenche o feedback da visita, o lead
**passa a receber** a mensagem (dentro da janela de 24h). Antes não recebia — só ficava registrado que
recebeu. É a intenção original do recurso, não invenção desta story.

## AC4 — E o catch silencioso deixa rastro

`logEventOnce` (aguardado, não `logEvent`) com `POS_VISITA_FOLLOWUP_ERRO`. Aguardado porque é a última
escrita antes do response e, em lambda, fire-and-forget morre no `return` (lição da 87-6).

## AC5 — A decisão de "o que gravar" vira função pura, uma para as duas portas

`post-visit-record.ts`: dado o resultado do envio, o que vai em `status`, `sent_at`, se grava
`messages` e o texto da atividade. É onde a mentira morava — e onde as duas portas divergiam. Testada
sem DOM, com caso explícito para cada mentira que estava no ar.

## AC6 — Contrato: nenhum ID de modelo literal no código

Varredura de `packages/*/src`: `"claude-…"` fora de `client/anthropic.ts` **reprova**, e `-latest`
reprova em qualquer lugar. Inclui a asserção de que a varredura não passou vazia (>200 arquivos), senão
um caminho errado deixaria o contrato verde varrendo nada.

**Esta é a terceira ocorrência da mesma classe:** 82-1 centralizou as strings e consertou `/summary` +
cron; 75-349 achou `/handoff` com a MESMA string morta que a 82-1 deixou passar; agora o
`post-visit-followup`. Três não é azar — é padrão. Sete literais foram migrados para a constante.

## Dev Agent Record

- [x] AC1 · AC2 · AC3 · AC4 · AC5 · AC6
- [x] `ANTHROPIC_MODELS.sonnet46` criado para os literais de `claude-sonnet-4-6` (default da Nicole,
      agente interno do dashboard, extração do termo) — pinado de propósito, com o motivo escrito.

### Validações

`npx vitest run` **229 arquivos / 2.790 testes** ✅ · `type-check` 8/8 ✅ · `lint` 0 erros ✅ ·
`turbo run build --force` exit 0 ✅

**Mutação medida:** devolver `claude-3-5-haiku-latest` ao arquivo derruba **2 dos 3** casos do contrato
(o do ID literal e o do alias). Rodado vermelho e restaurado.

## File List

- `packages/ai/src/flows/post-visit-followup.ts` — AC1
- `packages/ai/src/client/anthropic.ts` — AC1 (`sonnet46`)
- `packages/web/src/app/api/cron/followup/route.ts` — AC2/AC3/AC5
- `packages/web/src/lib/whatsapp/send-followup-message.ts` *(novo, extraído)* — AC3
- `packages/web/src/lib/appointments/visit-feedback-core.ts` — AC3/AC4/AC5
- `packages/web/src/lib/appointments/post-visit-record.ts` + `.test.ts` *(novos)* — AC5
- `packages/ai/src/client/model-strings.contract.test.ts` *(novo)* — AC6
- `packages/web/src/app/api/agent/chat/route.ts` · `packages/web/src/lib/pastas/termo/extract.ts` ·
  `packages/ai/src/memory/writer.ts` · `packages/ai/src/flows/lead-memory.ts` ·
  `packages/ai/src/flows/classify-contact.ts` · `packages/ai/src/chat/pipeline.ts` — AC6 (literais → constante)
- `docs/qa/gates/75-350-modelo-descontinuado-followup.yml` *(novo)*

## Verificar depois do deploy

1. **Na primeira run do cron (de 2 em 2h): `FOLLOWUP_EXECUTED` volta a existir.** É o sinal de que o
   cron conclui — ausente desde 21/07.
   ```sql
   select created_at, metadata from system_events
   where event_type = 'FOLLOWUP_EXECUTED' order by created_at desc limit 5;
   ```
2. `post_visit_erros` no metadata dessa run: idealmente 0. Se vier > 0, o evento
   `FOLLOWUP_POST_VISIT_ERRO` diz de qual lead e por quê.
3. Preencher um feedback de visita de teste, com conversa dentro da janela de 24h, e conferir que o
   lead **recebe** no WhatsApp e que `follow_up_log.status = 'sent'`.
4. Repetir com conversa FORA da janela: `status = 'skipped'`, **nenhuma** linha nova em `messages`, e a
   atividade dizendo "NAO enviou (WhatsApp fora da janela de 24h)".

Relacionado: [[project-followup-nicole-nunca-enviou]] (o pendente que isto responde) · 82-1 e 75-349
(as duas primeiras ocorrências da string de modelo) · 87-6 (fire-and-forget morre no return) ·
75-193 (extração do visit-feedback-core)
