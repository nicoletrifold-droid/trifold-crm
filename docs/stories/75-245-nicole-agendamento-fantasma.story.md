# Story 75-245 — Nicole: fim do agendamento fantasma e do horário inventado

**Status:** Done
**Tipo:** Fix de comportamento (parser + fluxo + prompt)
**Epic:** Agendamento da Nicole
**Complexidade:** M

## Contexto

Incidente real em produção, lead **Ailton Gouvea** (`81f90ea4-5544-42a7-b7da-37a8eb834d58`),
conversa de 30/07/2026 22:00–22:18 BRT. Levantado pelo Marcos em 31/07.

O que o cliente viu no WhatsApp:

| hora | quem | mensagem |
|---|---|---|
| 22:04 | Nicole | "Qual o melhor dia pra você vir? **Atendemos de segunda a sexta das 8h às 18h e sábado das 8h ao meio-dia.**" |
| 22:05 | lead | "CPF 174.677.569.68" |
| 22:05 | Nicole | "Vou confirmar seu agendamento: **segunda-feira, 3 de agosto às 12h**." |
| 22:06 | lead | "Ok...tem como ver no Sábado" |
| 22:06 | Nicole | "Claro! Prefere sábado dia 1º de agosto? Qual horário fica melhor?" |
| 22:17 | lead | "Pode ser de manhã..." |
| 22:17 | Nicole | "Agendado para sábado, 1º de agosto, **às 9h**." |
| 22:18 | lead | "10,00 hora" |
| 22:18 | Nicole | "Anotado! Sábado, 1º de agosto **às 10h**." |

O que o banco tinha: **um** appointment, `segunda 03/08 12:00`, `created_by=nicole`,
`broker_id=NULL`. Nenhum registro de sábado. Nenhum `APPOINTMENT_RESCHEDULED`.
O cliente combinou um horário que não existia em lugar nenhum, e a agenda
mostrava um horário que o cliente nunca aceitou.

### Causa raiz — cadeia completa (reproduzida)

1. `extractCollectedData` roda também sobre a resposta da **própria Nicole**
   (`pipeline.ts:788`) e `qualification.ts:292` grava a **mensagem inteira** em
   `visit_availability` sempre que ela cita um dia. A frase de *horário de
   atendimento* virou "disponibilidade do cliente".
2. No turno seguinte, o fallback da 75-162 (`resolveVisitSlotParts`) leu esse
   campo. `parseDay` pegou o **"segunda"** de *"segunda a sexta"*; `parseHour`
   pegou o **"meio-dia"** de *"sábado das 8h ao meio-dia"* (testado primeiro).
   Verificado com o parser real: essa frase resolve para
   `2026-08-03T15:00:00Z` — exatamente o appointment gravado. O lead nunca
   disse dia nem hora: a mensagem dele era o CPF.
3. Com visita ativa, todo turno passa a cair no bloco `activeAppointment`
   (`pipeline.ts:556`), onde remarcar exige **palavra-chave** (`RESCHEDULE_RE`)
   ou dia+hora completos na mesma mensagem. *"Ok...tem como ver no Sábado"* não
   tem palavra-chave → nem guarda o dia pendente. O pedido real do sábado nunca
   virou remarcação.
4. *"Pode ser de manhã"* — período sem número não é entendido por `parseHour`.
   O código não resolveu nada e o modelo **preencheu a lacuna sozinho**: "9h".
5. *"10,00 hora"* — o regex casa o `"00 hora"` e devolve **00:00**, fora do
   expediente → descartado.
6. Nos três últimos turnos o bloco `[SISTEMA]` dizia literalmente *"Visita JÁ
   confirmada para segunda-feira, 3 de agosto às 12:00 — apenas confirme"*, e a
   Nicole anunciou 9h e 10h de sábado. **Nada no código nem no prompt proíbe ela
   de afirmar um horário que o sistema não confirmou** — e o prompt do banco
   (`agent_prompts.visit-scheduling`) manda justamente "confirme [dia] as
   [horario]" sem amarrar na verdade do sistema.

Efeito colateral: sábado 01/08 10h **já estava ocupado** por visita house da
Valéria Costa. A Nicole prometeu um horário indisponível sem nunca consultar a
agenda para ele — a única checagem que rodou foi para o slot fantasma.

Correção do caso concreto do Ailton foi feita à mão em prod (appointment movido
para sáb 01/08 10:00, `metadata.reason` + activity de auditoria) — **não** faz
parte desta story.

## Critérios de aceite

- **AC1** — Dado um `visit_availability` que é frase de horário de atendimento
  ou lista de opções (2+ dias da semana, 2+ horários, faixa "das 8h às 18h",
  "atendemos"), quando o pipeline tenta resolver o slot, então **nenhum slot
  é derivado** desse texto e nenhum appointment é criado.
- **AC2** — Dado o texto *"Atendemos de segunda a sexta das 8h às 18h e sábado
  das 8h ao meio-dia"*, quando `extractCollectedData` processa, então
  `visit_availability` **não** é gravado (não é disponibilidade do cliente).
- **AC3** — Dado *"Sábado, 18 de julho, às 9h"* (slot único, caso da 75-162),
  quando resolvido, então continua virando slot agendável — **sem regressão**.
- **AC4** — Dado *"10,00 hora"* / *"10.00 hora"* / *"10h00"*, quando parseado,
  então o horário é **10:00** (hoje: 00:00).
- **AC5** — Dado *"pode ser de manhã"* com o dia conhecido, quando o pipeline
  monta o contexto, então a Nicole recebe **horários livres reais** daquele
  período (consulta na agenda) para oferecer — e nunca um horário inventado.
  Período sem dia → guarda o período e pergunta o dia.
- **AC6** — Dado que existe visita ativa e o lead indica outro dia **sem
  palavra-chave** de remarcação (*"tem como ver no sábado"*), quando o pipeline
  processa, então o dia é guardado como pendente e a Nicole pergunta o horário
  (hoje: cai em "apenas reconfirme o existente").
- **AC7** — Dado que o lead pede um horário ocupado, quando o slot é checado,
  então a Nicole **não confirma** e oferece alternativas livres — comportamento
  já existente, agora alcançável pelo caminho da remarcação sem palavra-chave.
- **AC8** — Dado que a resposta da Nicole afirma um dia+horário concreto
  diferente do slot autorizado pelo sistema no turno, quando a resposta é
  processada, então é emitido `NICOLE_SLOT_MISMATCH` (level `error`, com
  `said_at` e `authorized_at`). **Fail-open:** a mensagem segue para o cliente,
  a guarda só observa.
- **AC9** — Regra de verdade do horário no prompt: os blocos `[SISTEMA]` de
  visita e o prompt `visit-scheduling` do **banco** (que mascara o código)
  proíbem afirmar dia/horário que não esteja no bloco.
- **AC10** — Zero regressão: suíte completa verde, `tsc` limpo, build OK.

## Escopo

**IN:**
- `packages/ai/src/flows/visit-slot.ts` — `isAmbiguousSlotText`,
  `parsePeriodParts`, `freeSlotsInPeriod`, `slotToUtc`, fix do parse de hora,
  guarda no `resolveVisitSlotParts`.
- `packages/ai/src/flows/qualification.ts` — não gravar blurb de horário de
  atendimento como `visit_availability`.
- `packages/ai/src/chat/pipeline.ts` — branches de período e de dia-sem-hora
  (com e sem visita ativa), regra de verdade nos blocos `[SISTEMA]`, guarda
  `NICOLE_SLOT_MISMATCH`.
- `agent_prompts.visit-scheduling` em prod e dev (fora do build, aplicado via
  Management API — registrar no relatório).
- Testes: `visit-slot.test.ts`, `qualification.test.ts`, `pipeline.test.ts`.

**OUT (decidido, não é esquecimento):**
- **Carimbar `broker_id` nos appointments futuros quando a roleta distribui o
  lead.** O appointment do Ailton nasceu sem corretor (roleta ainda não havia
  rodado) e ninguém foi notificado — o `APPOINTMENT_NO_BROKER` já loga isso.
  Mexe no distributor, raio de impacto próprio: **story separada**.
- Slot por corretor em vez de por equipe. Hoje `isSlotFree` bloqueia o horário
  para toda a equipe house; mudar isso é decisão de produto, não deste fix.
- `pipeline.ts:746` lê `response.content[0]` — quebra se o modelo da Nicole
  ganhar thinking ([[feedback-sonnet5-thinking-block]]). Latente, não é a causa
  deste incidente: story separada.
- Reescrever/corrigir a mensagem da Nicole quando a guarda AC8 dispara. Mutar o
  texto dela é pior que observar; primeiro medir.

## Dependências

75-162 (fallback de `visit_availability` — é o que esta story blinda, sem
desfazer), 75-163 (remarcar/cancelar), 73-1 (agendar no horário pedido),
75-196 (avanço para Visita Agendada). Nenhuma migração de banco.

## Riscos

- **Regressão na 75-162:** o `visit_availability` continua sendo fonte válida
  quando é slot único. AC3 fixa isso em teste.
- **Falso positivo da guarda AC8:** quando a Nicole oferece opções ("8h ou
  11h"), o texto é ambíguo e a guarda não roda. Só dispara em afirmação de
  dia+hora único.
- **Prompt do banco:** se a regra entrar só no código, não pega
  ([[project-nicole-guardrails-db]]). AC9 exige os dois.

## Dev Notes

Duas camadas independentes matam o agendamento fantasma — cada uma sozinha já
resolveria, e é de propósito:

1. `qualification.ts` não **grava** frase de expediente/lista de opções como
   `visit_availability` (a fonte suja).
2. `resolveVisitSlotParts` não **agenda** a partir de texto ambíguo (o consumo
   suja). Preserva a 75-162, que só precisa de slot único.

`isAmbiguousSlotText` = 2+ dias da semana, 2+ horários, faixa "das 8h às 18h",
"atendemos" ou "horário de atendimento".

Extra necessário para o AC8 valer: `parseDay` passou a entender **data com mês
escrito** ("1º de agosto", "10 de agosto"), antes da regra de dia da semana. Sem
isso, "segunda-feira, 10 de agosto" era lido como a próxima segunda e a guarda
anti-alucinação acusaria falso positivo em toda visita marcada com mais de uma
semana de antecedência — guarda que grita errado é guarda que ninguém lê.
Também blindado: saudação ("boa tarde") não é pedido de período.

Prompt do banco: aplicado em **prod** (`visit-scheduling`, 2027 → 2786 chars,
idempotente pelo marcador `### VERDADE DO HORARIO`). No **dev** a tabela
`agent_prompts` está **vazia** — nada a aplicar; lá vale o prompt do código, que
recebeu a mesma regra (`packages/ai/src/prompts/visit-scheduling.ts`).

## File List

- `packages/ai/src/flows/visit-slot.ts` — `isAmbiguousSlotText`,
  `countTimeMentions`, `parsePeriodParts`, `PERIOD_BOUNDS`, `freeSlotsInPeriod`,
  `slotToUtc`, `normalizeMinuteSeparator`, data com mês, guarda no
  `resolveVisitSlotParts`
- `packages/ai/src/flows/qualification.ts` — guarda no `visit_availability`
- `packages/ai/src/chat/pipeline.ts` — helper `sistema()` (regra de verdade em
  todo bloco), branches de período e de dia-sem-hora (com e sem visita ativa),
  `detectSlotMismatch` + evento `NICOLE_SLOT_MISMATCH`, `authorizedSlotUtc`
- `packages/ai/src/prompts/visit-scheduling.ts` — regra de verdade do horário
- `packages/ai/src/flows/visit-slot.test.ts` — +33 testes
- `packages/ai/src/flows/qualification.test.ts` — +3 testes (AC2)
- `packages/ai/src/chat/pipeline.test.ts` — +6 testes (AC8)

## QA Gate — PASS

- Suíte completa: **1373 testes, 122 arquivos, verde**. `tsc` limpo em `ai` e
  `web`. `npm run lint` 0 erros (18 warnings pré-existentes, nenhum nos arquivos
  desta story). `npm run build` OK.
- **Reencenação do incidente** com as funções reais e a agenda real (visita
  house de sáb 01/08 10h presente):

| turno | mensagem | antes | agora |
|---|---|---|---|
| 22:04 (Nicole) | frase de expediente | grava `visit_availability` | **não grava** |
| 22:05 | "CPF 174.677.569.68" | **agenda seg 03/08 12h** | nada agendado |
| 22:06 | "Ok...tem como ver no Sábado" | "apenas reconfirme" | guarda o dia, pergunta o horário |
| 22:17 | "Pode ser de manhã..." | inventou "9h" | oferece 8h, 8h30, 9h (livres de verdade) |
| 22:18 | "10,00 hora" | "Anotado! 10h" (nada gravado) | 10h **OCUPADO** → não confirma, oferece 11h / seg 8h / seg 8h30 |

- Resultado final da reencenação: **nenhum** appointment criado sem o cliente
  confirmar um horário livre.

## Deploy — 31/07/2026 ✅

Merge PR #323 → commit `8f4b91c0` → produção `READY` (Vercel, 10:19). Domínio
`crm.trifold.eng.br` respondendo 200. Prompt `visit-scheduling` do banco já
carregava a REGRA DE VERDADE desde 09:35 (aplicado antes do merge, é dado e não
código). Zero `NICOLE_SLOT_MISMATCH` e zero evento `error`/`warn` nos 20 min
seguintes ao deploy.

Fica em observação (não é pendência de código): o **primeiro** lead que pedir
"de manhã" ou um horário ocupado é o teste de campo. `NICOLE_SLOT_MISMATCH` deve
continuar em zero — se aparecer, a Nicole está inventando horário apesar do
prompt, e o aperto é no modelo, não no parser.
