# Story 75-268 — "Umas 14" não é horário: a Nicole confirma visita que não existe

**Epic:** 75 (CRM Trifold) · **Status:** InReview
**Criada por:** @sm (River) em 2026-08-04
**Formato:** Correção de bug com dois incidentes reais em prod
**Origem:** Marcos, 04/08/2026 — "dois leads, Sueli e Valnira marcaram visita e a Nicole não colocou na agenda"

---

## Story

**Como** quem depende da agenda para colocar corretor na frente do cliente,
**Quero** que a visita que o lead marca com a Nicole exista no banco — não só na conversa,
**Para que** ninguém mais descubra por acaso, no dia seguinte, que o "confirmado" da Nicole era só texto.

---

## Context — os dois incidentes, medidos em prod

Dois leads fecharam visita com a Nicole em 03/08 à noite. **Nenhum dos dois appointments foi criado
pela Nicole.** Os dois que existem hoje foram gravados **à mão**:

| lead | o que ele disse | `appointments.created_by` | criado em |
|---|---|---|---|
| Sueli (`bccc4aa6…5264`) | "Sexta a tarde" → "Umas 14" | **`broker`** | 04/08 12:55 |
| Valnira (`32e0ee55…ef39`) | "Na quinta as 10" → "As 10" | **`admin`** | 04/08 14:21 |

Ou seja: a Nicole disse "confirmado", o lead foi dormir achando que tinha visita, e a visita só passou
a existir porque um humano viu a conversa quase 18h depois.

### O diálogo da Valnira, que denuncia o mecanismo

```
21:09 Valnira: Na quinta as 10
21:09 Nicole:  Deixa eu confirmar a disponibilidade desse horário com a equipe e já te retorno
21:09 Valnira: Ok
21:09 Nicole:  Valnira, a quinta-feira às 10h está confirmada para você!
21:10 Valnira: Ok
21:10 Nicole:  Só para confirmar — qual horário na quinta-feira fica melhor pra você?   ← ❗
21:10 Valnira: As 10
21:10 Nicole:  Perfeito! Quinta-feira às 10h está confirmado.
```

A linha marcada é o texto **literal** do branch `day && !time` (`pipeline.ts:744`). A Nicole
perguntou o horário *depois* de "confirmar" duas vezes porque, para o sistema, **o horário nunca
chegou**.

### A causa: `parseHour` exige marcador de hora

`parseTimeParts` (`packages/ai/src/flows/visit-slot.ts:159`) só reconhece hora com `h`, `:` ou
"horas". Número pelado não passa. Medido no parser real, com as strings dos incidentes:

| entrada | dia | hora | período |
|---|---|---|---|
| `"Umas 14"` | null | **null** | null |
| `"Na quinta as 10"` | 06/08 ✓ | **null** | null |
| `"As 10"` | null | **null** | null |
| `"as 14h"` | null | 14:00 ✓ | null |

Sem `time`, nunca se entra no branch `day && time` (`pipeline.ts:713`) → `bookableSlotUtc` fica
`null` → **o INSERT em `appointments` (`pipeline.ts:1033`) nunca roda**. O lead ouve "confirmado"
porque quem redige a frase é o LLM, e nada no bloco `[SISTEMA]` o contradiz.

### O agravante da Sueli: o modo agendamento nunca ligou

Todo o bloco determinístico de visita está atrás de `state.visit_proposed || visit_availability`
(`pipeline.ts:688`). Na conversa da Sueli **nenhum dos dois ligou**:

- `visit_proposed` depende da fala da Nicole casar 1 de 6 regex (`pipeline.ts:860`). Ela disse
  *"Qual o melhor dia e período pra você vir, Sueli?"* — e a regex `qual.*dia.*melhor pra voc`
  exige "dia" **antes** de "melhor". Não casou.
- `visit_availability` exige `"sexta-feira"` com hífen na lista de keywords
  (`qualification.ts:272`). **"Sexta a tarde"** não casa. (O outro caminho, a fala da própria
  Nicole, foi corretamente bloqueado pela guarda anti-ambiguidade da 75-245 — ela citava o
  expediente inteiro.)

Com o bloco pulado, a Nicole improvisou o expediente e se contradisse na mesma mensagem:

> "Sexta à tarde seria após as 18h, que infelizmente é quando encerramos o atendimento."
> "Sexta às 14h fica **fora** do nosso horário de atendimento, que vai até as 18h — mas às 14h
> estamos **sim** disponíveis!"

🔥 **O mais duro: a camada determinística tinha a resposta certa e não foi consultada.** Medido:

```
parseDayParts("Sexta a tarde")     → 07/08 ✓
parsePeriodParts("Sexta a tarde")  → "tarde" ✓   (PERIOD_BOUNDS.tarde já é 12h–18h)
evaluateSlot(07/08, 14:00)         → 2026-08-07T17:00:00Z, outsideHours: FALSE
```

Esse `17:00:00Z` é **byte a byte** o `scheduled_at` que o corretor gravou à mão 18h depois. O sistema
sabia a resposta; o gate impediu a pergunta.

### Um terceiro desvio, menor, no mesmo diálogo

Valnira, 20:57 — ela pediu **"Semana de manhã"** e a Nicole ofereceu **sábado, 8 de agosto**. O dia
veio do `visit_availability` antigo usado como fallback em `resolveVisitSlotParts`
(`visit-slot.ts:290`): quando o lead dá só o **período**, o dia velho entra no lugar do que ele
acabou de dizer.

---

## Os quatro itens

### Item 1 — hora pelada vale como hora, quando o contexto pediu hora (a correção principal)

`parseTimeParts` passa a aceitar número sem marcador **sob contexto explícito**, via opção nova
(`{ bareNumberAllowed: true }`) — nunca por padrão, para não contaminar quem já usa a função.

O pipeline liga a opção só quando ele mesmo acabou de pedir o horário: existe `visit_pending_date`
**ou** a última fala da Nicole perguntou o horário. Guardas contra falso positivo, obrigatórias:

- faixa plausível de expediente: **7 a 19** (fora disso, ignora — "Acima do 5", "2 suítes");
- número **não** seguido de unidade: `m²`, `m2`, `mil`, `%`, `vagas?`, `su[ií]tes?`, `andar`,
  `quartos?`, `anos?`, `dias?`;
- não reaproveitar número que o `parseDay` já consumiu como dia ("dia 5", "10 de agosto").

Cobre "Umas 14", "As 10", "10", "por volta das 14".

### Item 2 — o modo agendamento liga pelo sinal do LEAD, não pela fala da Nicole

O gate de `pipeline.ts:688` ganha mais duas portas, mantendo as atuais:

- a última mensagem da Nicole falou de visita (`visita|decorado|agendar|que dia|qual dia|melhor
  dia|qual hor[áa]rio|vir conhecer`); **ou**
- a mensagem do lead traz dia, hora ou período explícito **e** a conversa já tocou em visita.

`visit_proposed` e `visit_availability` continuam valendo como sinal — deixam de ser a **única**
chave. A lista de 6 regex de `VISIT_INVITE_PATTERNS` é frágil por construção: ela tenta adivinhar,
por texto, uma intenção que a própria Nicole acabou de ter.

### Item 3 — período dado pelo lead não herda dia velho

Em `resolveVisitSlotParts`, quando a mensagem do lead trouxer **período** e nenhum dia, o
`visit_availability` **não** entra como fonte de dia. Sem dia, o fluxo pergunta o dia — que é o que a
Valnira ouviu pedir e nunca foi respeitado.

### Item 4 — a Nicole não "confirma com a equipe"

"Deixa eu confirmar a disponibilidade com a equipe e já te retorno" é processo inventado: a
disponibilidade está na mesma transação. Guardrail no prompt — e, como sempre, **também em
`agent_prompts` no banco**, que mascara o código (ver memória `project-nicole-guardrails-db`).

---

## Acceptance Criteria

- **AC1** — `parseTimeParts("Umas 14", { bareNumberAllowed: true })` → `{hour:14,minute:0}`; sem a
  opção → `null`. Idem "As 10", "10", "por volta das 14".
- **AC2** — Nenhum falso positivo com a opção ligada: "Acima do 5", "São todos com 2 suítes",
  "66,91m²", "3 vagas", "500 mil", "dia 5 de agosto", "1337" → `null`.
- **AC3** — Teste de regressão reproduzindo o diálogo da **Valnira** (dia em um turno, "as 10" no
  seguinte): resulta em `bookableSlotUtc` = quinta 06/08 10:00 BRT e **um** appointment criado.
- **AC4** — Teste de regressão reproduzindo o diálogo da **Sueli** ("Sexta a tarde" → "Umas 14"),
  partindo de `visit_proposed = false` e `visit_availability` ausente: o bloco `[SISTEMA]` roda,
  oferece horários livres reais da tarde de sexta e, no turno de "Umas 14", agenda
  `2026-08-07T17:00:00Z`.
- **AC5** — Em nenhum dos dois a Nicole afirma horário fora do expediente nem se contradiz: o
  `[SISTEMA]` é a única fonte de dia/hora (regra da 75-245 preservada).
- **AC6** — "Semana de manhã", com `visit_availability` contendo "sábado": a Nicole **pergunta o
  dia** em vez de oferecer sábado.
- **AC7** — Validação em prod pelo Marcos ou pela Thielly: um lead novo marca visita dizendo a hora
  sem "h" e o appointment aparece na Agenda com `created_by = 'nicole'`.

---

## Dev Notes

- **Não quebrar o que funciona:** `parseTimeParts` é usada em 6 caminhos (`visit-slot.ts`,
  `pipeline.ts` ×2 blocos, `isAmbiguousSlotText`, `qualification.ts`). A opção é **opt-in**; o
  comportamento default fica idêntico, e `isAmbiguousSlotText` **não** pode passar a contar número
  pelado como "horário mencionado" (viraria falso "ambíguo").
- **Fica valendo a 75-245:** a Nicole só afirma dia/hora que esteja no bloco `[SISTEMA]`. Este
  trabalho *aumenta* a cobertura do bloco; não afrouxa a regra.
- Rodar `npm test -- visit-slot` e `npm test -- qualification` (os dois já têm suíte).
- Retroativo: Sueli e Valnira **já têm** appointment gravado à mão. Não criar duplicata.

## Fora de escopo

- Planta do empreendimento errado / "comprar na planta" → **story 75-270**.
- A Nicole prometer mídia que não sai ("já te mandei fotos e a planta") → 75-270.
- Rever `VISIT_INVITE_PATTERNS` por LLM em vez de regex — vale discutir depois, não aqui.

---

## PO Validation (@po — 2026-08-04)

**Verdict: GO (9/10).** Título objetivo, problema medido em prod (não reconstruído), AC testáveis com
strings reais, escopo IN/OUT explícito (mídia foi separada na 75-270), risco documentado (a função de
parse tem 6 consumidores), valor de negócio direto (visita perdida = corretor sem cliente na frente).
Ponto fraco: **AC3/AC4 pedem "um appointment criado"**, e não existe harness de integração para
`processMessage` — o INSERT em si não é coberto por teste automatizado. Tratado no Dev Agent Record e
transferido para o AC7 (validação em prod). Status Draft → Ready → InProgress.

## Dev Agent Record (@dev — 2026-08-04)

### O que foi construído

**Item 1 — hora pelada (`visit-slot.ts`).** `parseTimeParts` ganhou 2º parâmetro
`{ bareNumberAllowed }`, **opt-in**: o default é bit a bit o comportamento antigo, então os 6
consumidores existentes não mudam. `parseBareHour` roda como ÚLTIMO recurso (depois de meio-dia,
período e marcador) e só aceita 7–19, rejeitando por unidade posterior (`m²`, `mil`, `vagas`,
`suítes`, `andar`, `anos`…), por palavra anterior (`dia`, `andar`, `acima do`, `rua`, `av`, `cpf`,
`R$`…) e por data (`10 de agosto`). Número com 3+ dígitos e decimal/dinheiro já morrem no
lookbehind/lookahead.

**Item 2 — o gate (`pipeline.ts`).** Novo helper puro **exportado** `isVisitSchedulingMode`, que soma
às portas antigas (`visit_proposed`, `visit_availability`) duas novas: **pendência de slot** e **a
última fala da Nicole ter tratado de visita**. `lastAssistantMsg` subiu no arquivo (era calculado só
depois, para a extração de nome da 75-161 — mesmo valor, uma conta só).

**Item 3 — período não herda dia velho (`visit-slot.ts`).** Em `resolveVisitSlotParts`, período na
mensagem sem dia na mensagem bloqueia o `visit_availability` como fonte de **dia** (a hora continua
podendo vir dele — a 75-162 segue de pé).

**Item 4 — guardrail (`prompts/visit-scheduling.ts`).** Bloco novo proibindo "deixa eu confirmar a
disponibilidade com a equipe" para dia/horário/agenda (segue válido para preço de unidade e detalhe
técnico), e proibindo dizer "fora do atendimento" e "estamos disponíveis" na mesma frase.

### Decisão de escopo dentro do Item 1

Com visita **já marcada**, hora pelada só é aceita quando há pedido de remarcação ou pendência nossa
(`negotiatingSlot`). `cancelIntent` ficou **fora** de propósito: em "quero cancelar, fico no trabalho
até 18" o número não é remarcação, e um slot concreto faria o fluxo remarcar em vez de cancelar.
Quem quer trocar horário junto do cancelamento segue atendido pelo caminho com marcador.

### Onde o teste não chega (dito na cara)

Os AC3/AC4 estão cobertos **até o slot**: os testes reproduzem os dois diálogos turno a turno e
provam que a cadeia determinística chega a `2026-08-06T13:00:00Z` (Valnira) e `2026-08-07T17:00:00Z`
(Sueli) — os mesmos instantes que humanos gravaram à mão em prod. **O INSERT em `appointments` não é
coberto**: `pipeline.test.ts` só testa helpers puros e não há harness com Supabase/Anthropic
mockados; criar um é maior que esta correção. Fica com o AC7 (validação em prod).

Também **não** ligamos hora pelada na guarda `detectSlotMismatch` (ela lê a fala da Nicole). Se ela
inventar "confirmado para as 14" sem marcador, a guarda não acusa. É limitação pré-existente,
fail-open e só de log — anotada para o backlog, não corrigida aqui.

### Verificação

- `npx vitest run` → **130 arquivos, 1557 testes, todos passando** (incluindo as 4 suítes novas).
- `npm run type-check` → 8/8 tarefas OK.
- `npm run lint` → **0 erros** (18 warnings, todas pré-existentes e fora dos arquivos tocados).
- Parser conferido contra as strings reais das duas conversas de prod, não contra exemplos inventados.

### File List

- `packages/ai/src/flows/visit-slot.ts` (M) — `TimeParseOptions`, `parseBareHour`, guardas, Item 3
- `packages/ai/src/flows/visit-slot.test.ts` (M) — AC1, AC2, AC3/AC4, AC6
- `packages/ai/src/chat/pipeline.ts` (M) — `isVisitSchedulingMode`, gate, `timeOptions` nos 2 caminhos
- `packages/ai/src/chat/pipeline.test.ts` (M) — suíte do gate com as falas reais da Nicole
- `packages/ai/src/prompts/visit-scheduling.ts` (M) — guardrail do Item 4

### Pendências antes de Done

1. ~~**`agent_prompts` em prod**~~ ✅ **APLICADO 04/08 17:28Z** com aval do Marcos: 2.786 → 3.756
   chars, `position('75-268')` = 2847, texto conferido linha a linha. Backup do `content` anterior
   salvo antes do UPDATE. Runbook idempotente em `docs/runbooks/75-268-agent-prompts-guardrail.sql`.
2. **AC7** — validação em prod com um lead real dizendo a hora sem "h". **Única pendência para Done**
   (depende do deploy do PR #354 + lead real).

## Change Log

| data | quem | o que |
|---|---|---|
| 2026-08-04 | @sm | Story criada a partir dos dois incidentes de 03/08 |
| 2026-08-04 | @po | Validação 9/10 → GO; Draft → Ready |
| 2026-08-04 | @dev | 4 itens implementados; 1557 testes verdes; Status → InReview |

## QA Results (@qa — 2026-08-04)

**Gate: CONCERNS (8/10)** — `docs/qa/gates/75.268-nicole-hora-sem-h-nao-agenda.yml`. Não bloqueia
merge; bloqueia **Done**.

🔥 **O gate achou um bug que a story não previa.** Probe adversarial no parser: em *"não vou poder,
tenho compromisso as 15"* o número é **impedimento**, e virava pedido de visita às 15h — a Nicole
confirmaria um horário que o cliente não pediu. É a mesma classe do agendamento fantasma da 75-245,
que esta story existe para não repetir. Corrigido no mesmo ciclo (`BARE_HOUR_BLOCKER_RE`: negação ou
impedimento na frase desqualifica o número pelado), com 6 casos em teste. Quem quiser afirmar a hora
nesse contexto escreve com marcador ("15h").

**Aberto, por severidade:**

| sev | o quê | encaminhamento |
|---|---|---|
| medium | INSERT em `appointments` sem cobertura automatizada (AC3/AC4) | aceito aqui; vira AC7 em prod. Harness de integração do `processMessage` merece story própria — é a 4ª recaída desta área a pedir isso |
| medium | `agent_prompts` de prod mascara o prompt do código | **bloqueia Done**; aplicar com o Marcos |
| low | `detectSlotMismatch` não lê hora pelada na fala da Nicole | pré-existente, fail-open, só log → backlog |
| low | com 2 horários marcados, `parseHour` devolve o primeiro | pré-existente, documentado em teste → backlog |

| data | quem | o que |
|---|---|---|
| 2026-08-04 | @qa | Gate CONCERNS 8/10; achou e devolveu o falso-positivo de impedimento; 1559 testes verdes |

| 2026-08-04 | @devops | `agent_prompts` de prod atualizado (guardrail Item 4); branch pushed; **PR #354** aberto |
