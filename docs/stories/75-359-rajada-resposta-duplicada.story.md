# Story 75-359 — "ele repetiu": rajada do lead abria um pipeline por webhook

**Status:** InReview — testes/lint/type-check verdes · sem migration
**Tipo:** Corrida de concorrência em produção (idempotência cobria a mensagem repetida, não a rajada)
**Epic:** 75 — CRM Trifold
**Complexidade:** S (~2 pts — 1 módulo puro + guarda no webhook + 11 testes)
**Fluxo:** @sm → @po → @dev → @qa → @devops

## O sintoma relatado

Marcos, 20/08, olhando a conversa do lead Amauri: *"ele repetiu 'temos 2 no momento'"*.

```
11:02:04.210  lead:  Qual é esse empreendimento
11:02:04.991  lead:  ?                            ← 0,79s depois
11:02:09.842  IA:    Temos dois no momento! O **Vind Residence**, com previsão para…
11:02:10.871  IA:    Temos dois no momento! O **Vind Residence**, com 2 suites…
```

Duas respostas para a mesma pergunta, com 1,03s entre elas, cada uma escrita como se a outra
não existisse.

## O que estava acontecendo

O webhook tem idempotência por **`wamid`** — a Meta reentregando a MESMA mensagem é descartada, em
dois níveis (consulta antes e `23505` no INSERT). Mas mensagens **diferentes** chegando juntas são
dois POSTs legítimos, e cada um abre o seu `after()`, que abre o seu `processMessage`. Nenhum sabe
do irmão. Não há lock, debounce nem agregação no caminho de inbound.

Não é um caso isolado. Medido em produção (30 dias, `lag(role) over (partition by conversation_id)`):
**34 respostas colada-em-resposta (<5s), 1 a 5 por dia.** O dia 20/08 teve 4 — o pico — porque o
cron destravado (75-350…357) acordou 41 leads de uma vez.

Outros dois casos do mesmo dia, além do Amauri:

| conversa | rajada do lead | o que saiu |
|---|---|---|
| Melquiades | "Faz tempo" / "Já comprei" / "Obrigado" em 5s | **3 respostas em 3,1s** — uma delas oferecendo visita a quem acabou de dizer que já comprou |
| Jonatan | "Moro em Maringá" / "Faz uns 4anos" em 5,3s | 2 respostas, 07:48:00 e 07:48:04 |

## AC1 — Quem responde é a execução da mensagem MAIS NOVA

Novo módulo puro `packages/web/src/lib/whatsapp/anti-rajada.ts`. No `after()`, antes de chamar a
Nicole: espera a janela, consulta se já existe mensagem `role='user'` da conversa com
`created_at` maior que a minha e, se existe, **cala**. A execução da mensagem mais nova responde —
e responde melhor, porque o INSERT do inbound é síncrono e a rajada inteira já está no histórico
que ela carrega.

A referência de tempo é o `created_at` **devolvido pelo banco** no INSERT (`.select("created_at")`),
não o relógio da lambda: duas invocações concorrentes não compartilham relógio.

## AC2 — A guarda fica antes de GERAR, não antes de enviar

🔥 Esta é a decisão que não podia sair errada. `processMessage` grava a mensagem da assistente ele
mesmo (`pipeline.ts` → `saveMessages`). Uma guarda no ponto de envio descartaria a resposta **depois**
de gravada, deixando no histórico do CRM uma fala da Nicole que o lead nunca recebeu — que é
exatamente o defeito da 2ª porta do follow-up pós-visita (75-350: "gravava 'sent' sem chamar o
WhatsApp"). Por isso a guarda custa uma espera antes de gerar, e não um descarte depois.

Efeito colateral bem-vindo: a execução abortada não chama o modelo. Em rajada de 3 mensagens, 1
chamada em vez de 3.

## AC3 — Janela configurável, e nunca desligada por acidente

Padrão **6s** (cobre as três rajadas medidas: 0,79s / 2,4s / 5,3s), teto de 20s para caber no
`maxDuration = 60` da rota. `NICOLE_ANTI_RAJADA_MS=0` desliga a guarda sem deploy de código.

Valor inválido ou ilegível cai no **padrão**, nunca em 0. Não é preciosismo: `vercel env add` por
pipe já gravou valor vazio duas vezes neste projeto (chave VAPID na 75-40, `PORTAL_NOTIF_PAUSED` na
75-66). Uma env corrompida não pode desligar a guarda em silêncio.

## AC4 — Mídia e áudio ficam fora da guarda

Rajada é fenômeno de texto. Já a mensagem de mídia tem a transcrição/upload acontecendo **neste**
caminho assíncrono: abortar ali perderia o conteúdo do áudio, não uma duplicata. `asyncMediaBlock`
ou `isVoiceMessage` → a guarda não roda.

## AC5 — O que a Nicole cala fica registrado

`logEvent` com `event_type: "rajada_resposta_suprimida"` (wamid, conversa, lead, janela). Guarda
silenciosa é indistinguível de bug: sem o evento, "a Nicole não respondeu" viraria caça ao fantasma.

## Custo aceito

A primeira resposta passa a sair ~6s mais tarde. O "digitando…" é disparado **antes** da janela, então
o lead vê a Nicole digitando durante a espera — e ela responde a rajada inteira de uma vez, do jeito
que uma pessoa responderia.

## Fora de escopo

- **75-358** (PR #472) — o `no_show` que era a etapa "Atendimento".
- **75-360** — `leads.name` sobrescrito por texto qualquer ("Já Comprei", "Oii", "Morar").
- A repetição da pergunta "morar ou investimento?" 4× na mesma conversa do Amauri é outro defeito
  (ela não percebe que já perguntou) e **não** é tratado aqui.

## Dev Agent Record

**Branch:** `75-359-rajada-resposta-duplicada` (worktree `~/tmp_claude/wt-75-359`)

**File List**

| arquivo | o quê |
|---|---|
| `packages/web/src/lib/whatsapp/anti-rajada.ts` | novo — `deveAbortarPorMensagemMaisNova()` + `janelaAntiRajadaMs()` |
| `packages/web/src/lib/whatsapp/anti-rajada.test.ts` | novo — 11 casos, incluindo os 3 de produção |
| `packages/web/src/app/api/webhook/whatsapp/route.ts` | INSERT devolve `created_at`; guarda antes do `processMessage` |

**Validações**

- `vitest run` — **2846 testes passando** (+11), 6 expected-fail pré-existentes
- `turbo type-check` — 8/8 · `turbo lint` — **0 erros** (29 warnings pré-existentes)
- Sem migration. Sem env obrigatória: `NICOLE_ANTI_RAJADA_MS` é opcional (ausente = 6s).

**Como conferir em produção depois do deploy**

```sql
-- deve parar de aparecer linha nova aqui
with seq as (
  select conversation_id, role, created_at,
         lag(role) over (partition by conversation_id order by created_at) as prev_role,
         lag(created_at) over (partition by conversation_id order by created_at) as prev_ts
  from messages where created_at >= now() - interval '7 days'
)
select date(created_at at time zone 'America/Sao_Paulo') as dia, count(*)
from seq
where role='assistant' and prev_role='assistant' and created_at - prev_ts < interval '5 seconds'
group by 1 order by 1;
```

E o contrapeso, para não trocar duplicata por silêncio: `logs` com
`event_type = 'rajada_resposta_suprimida'` deve ter **uma** linha por mensagem calada — nunca mais
do que o número de mensagens da rajada menos um.
