---
name: epic-87-qa-patterns
description: Epic 87 (Nicole — confiabilidade de contexto/estado) QA: oferta de horário custa 1 query POR candidato, erro de rede engolido em WEBHOOK_ASYNC_ERROR deixa o lead sem resposta, campos reservados a conferir por diff de grep, e o guard fail-open do :1316 vira falso positivo em todo ramo que NÃO autoriza horário
metadata:
  type: project
---

Fatos de domínio do Epic 87 que não se derivam de ler um arquivo só, medidos no gate da
**87-17 Fatia 1** (commit `1454d4ca`, PASS-com-CONCERNS em 27/08/2026).

## A oferta de horário da Nicole custa 1 query POR candidato

`isSlotFree` (`packages/ai/src/flows/visit-slot.ts`) é **uma ida ao `appointments` por horário
candidato**. `freeSlotsInPeriod` varre o período inteiro: **11 candidatos em `tarde`, 7 em `manha`**
(o teto é geométrico: `lastStart = min(toMin, close*60) - 60`, passo de 30min). Depois da 87-17 as
consultas vão em `Promise.all` → 11 concorrentes, profundidade sequencial 1.

**Why:** qualquer story que mexa na oferta de período está mexendo em latência no caminho da
resposta ao lead, e o Epic 88 tem teto medido de p95 (`D88-3`).

**How to apply:** ao revisar mudança em `freeSlotsInPeriod`/`isSlotFree`/`checkSlotAvailability`,
exigir teto de round-trips medido no fake — e mutar a FORMA, não a contagem (ver
[[mutacao-prova-teste-real]]). O p95 real se mede por
`metadata->>'ms_async'` do evento `whatsapp_async_done` (o webhook já registra, em
`packages/web/src/app/api/webhook/whatsapp/route.ts`).

## Erro na cadeia da agenda = lead sem resposta, com evento

Nenhum dos dois chamadores de `freeSlotsInPeriod` (`packages/ai/src/chat/pipeline.ts`, ramos
"dia+período" e remarcação) tem `try/catch`. Uma rejeição sobe até o `catch (asyncErr)` do webhook
do WhatsApp, vira `WEBHOOK_ASYNC_ERROR` em `system_events` e **o lead não recebe resposta nenhuma**.

**Why:** é o modo de falha de sempre, não uma regressão da 87-17 — mas a exposição por oferta subiu
de 3 para 11 queries (~3,7×). Registrado em `docs/backlog.md` como P2.

**How to apply:** a correção "falha de `isSlotFree` = trate como não livre" **não é obviamente
certa**: sob erro transitório ela esconde horário livre, que é uma versão branda do defeito que o
Epic 87 combate ("negar disponibilidade que existe"). Se alguém propuser isso como one-liner,
exigir a decisão explícita entre "não responder" e "responder com lista possivelmente incompleta",
mais evento próprio em `system_events`.

## Campos reservados sem escritor: `ofertas_do_sistema` / `afirmado_pela_nicole`

Declarados em `packages/ai/src/flows/agenda-state.ts` e **sem nenhum escritor ou leitor de
produção** — são da `87-10` (Onda 1) e a leitura é `W3-2e` (Onda 3). Em 27/08/2026 eram exatamente
**8 ocorrências** em `packages/ai/src` + `packages/web/src`, todas em `agenda-state.ts` e no teste
dele.

**Why:** várias stories do epic passam perto e a arbitragem recorrente é "não antecipar o campo".

**How to apply:** a prova de "zero escrita/leitura nova" é `diff` das saídas de `git grep` nos DOIS
commits, não a contagem de ocorrências (contagem igual com arquivos diferentes passaria). Comando
que funcionou: `git grep -n -E "ofertas_do_sistema|ofertasDoSistema|afirmado_pela_nicole" <sha> --
packages/ai/src packages/web/src` nos dois shas, `sed` para tirar o prefixo do sha, `diff`.

## Goldens byte-a-byte de `pipeline-agenda-state.test.ts`

O bloco `AC7 — o bloco [SISTEMA] dos turnos-ouro é byte a byte o do HEAD` tem docstring dizendo
"qualquer diferença aqui é achado bloqueante". Duas das strings são de PERÍODO e mudam legitimamente
quando a oferta muda.

**How to apply:** recalibração aceitável = a frase original **fica**, a justificativa é
**apendada, datada e nomeada** (story + motivo + aritmética), e a guarda é reafirmada para o resto.
E a prova de que o golden ainda morde não é o comentário: é reverter o conserto de produção e ver
os dois goldens vermelhos. Cuidado com a assimetria de cobertura: o golden "G6" cobre o sítio
"dia+período" (fixture com `appointments: []`); o ramo de **remarcação** (que passa
`excludeAppointmentId`) só tem `toContain("Horários LIVRES nesse período")` — sem asserção de
conteúdo.

## `checkSlotAvailability` ainda usa "os 3 primeiros"

A 87-17 consertou `freeSlotsInPeriod`, mas `checkSlotAvailability` mantém
`if (alternatives.length >= 3) break`. Ali a semântica é diferente ("as 3 alternativas mais
próximas DEPOIS do horário pedido") e está explicitamente fora de escopo — não confundir com o
defeito consertado.

## O tri-estado do slot (87-18): `isSlotFree` devolve `"free" | "occupied" | "unknown"`

Desde a **87-18** (`77566360`, gate `CONCERNS` em 27/08/2026, mesmo PR `#517` da 87-17 Fatia 1),
`isSlotFree` não é mais booleana, `checkSlotAvailability` devolve `erroNoPedido` e
`freeSlotsInPeriod` devolve `{ slots, houveIncerteza }`. Três invariantes que são **normativas** e
que qualquer refatoração futura pode quebrar sem o `tsc` reclamar:

1. **As três strings são truthy.** `if (await isSlotFree(...))` e `filter((_, i) => resultados[i])`
   compilam com `tsc --strict` em **EXIT=0** e o repo não tem `strict-boolean-expressions`. Medido
   três vezes (por @po, por @dev e por mim). A rede são **dois testes pré-existentes**:
   *"compromisso HOUSE no mesmo horário bloqueia"* (8 vermelhos) e *"manhã de sábado com 10h
   ocupado"* (7 vermelhos, com `12:30Z` no lugar de `12:00Z`).
2. **A ordem é normativa: `slots.length` PRIMEIRO, `houveIncerteza` DEPOIS**, nos dois sítios de
   período (`pipeline.ts` ramos "período com visita ativa" e "período sem visita ativa"). Inverter
   descarta uma oferta boa por causa de UM candidato incerto entre 7–11 — e reprova exatamente os
   dois testes `AC4-ii`, um por sítio.
3. **`slots: []` deixou de ter um significado único.** `houveIncerteza === false` ⟺ a lista vazia é
   afirmação legítima. São **quatro** caminhos legítimos (`close === null`/domingo; zero candidatos
   por fechamento, ex. sábado à tarde; zero candidatos porque todos já passaram; todos `occupied`),
   não um.

**Why:** o modo de falha da forma booleana é **pior que o defeito original** — `"occupied"` truthy
faz TODO horário ocupado ser ofertado E gravado como livre, com tudo verde.

**How to apply:** ao revisar qualquer toque em `visit-slot.ts`, rodar as duas mutações do item 1 e
conferir que os dois testes pré-existentes reprovam. Curto-circuito do primário `"unknown"`:
**1 consulta** onde sem ele são **26 sequenciais** (medido; a story estimava ~37 — o teto depende do
dia da fixture).

## 🔴 O guard fail-open do `pipeline.ts` (`NICOLE_SLOT_UNAUTHORIZED`) é falso positivo em todo ramo que não autoriza horário

`detectAffirmedSlot` **não exige verbo de afirmação** — ele só faz parse de dia+hora não ambíguos na
resposta da Nicole (`isAmbiguousSlotText` só cala quando há múltiplas opções). Se
`authorizedSlotUtc` for nulo e a frase do `[SISTEMA]` citar um horário, o modelo repete o horário e
o guard emite `NICOLE_SLOT_UNAUTHORIZED` — *"Nicole afirmou X sem o sistema ter autorizado horário
algum"* — descrevendo algo mais grave do que aconteceu.

**Medido no gate da 87-18:** 2 de 3 respostas plausíveis da Nicole sob incerteza resolvem para um
`Date` em `detectAffirmedSlot`. A classe **pré-existe** no ramo "ocupado sem alternativas".

**Why:** o Epic 87 é sobre confiar nos instrumentos. Um evento que mente na direção alarmista manda
o investigador pelo caminho errado — é o espelho do falso verde que o epic combate.

**How to apply:** toda story que criar um ramo novo em `pipeline.ts` que **não** seta
`authorizedSlotUtc` **e** cita um horário na frase do `[SISTEMA]` está criando uma fonte de
`NICOLE_SLOT_UNAUTHORIZED` espúrio. Verificar com um teste de 10 linhas chamando
`detectAffirmedSlot` com respostas plausíveis — é barato e decisivo. O guard é fail-open (só emite,
nunca bloqueia), então nunca é bloqueante; é dívida de observabilidade.

## Injeção de erro nos fakes: `{ data: null, error }` SEM rejeitar

O defeito da 87-18 não é exceção, é retorno normal do PostgREST mal interpretado. Os dois fakes
(`visit-slot.test.ts` local e `chat/__fixtures__/fake-supabase.ts`) ganharam injeção **seletiva** —
`failOn` por predicado sobre `{ table, mode, maybeSingle, filters }`, mais
`candidatoDeIsSlotFree()`.

**Why:** `pipeline.ts` faz **três** `select` diferentes em `appointments` no mesmo turno (histórico,
visita ativa, um por candidato do `isSlotFree`). Falhar todos muda o **ramo exercitado** em vez de
exercitar o ramo sob incerteza — e o teste fica verde por acidente.

**How to apply:** a assinatura do `isSlotFree` é única em `appointments`: é a única que usa `gt`
**e** `lt` sobre `scheduled_at` (a visita ativa usa `gte`, o histórico não filtra data). Ao revisar
uma injeção nova, conferir por `grep` que ela não faz over-match — é o que separa "exercitou o ramo"
de "mudou de ramo".


Relacionado: [[reverificacao-focada]], [[mutacao-prova-teste-real]]
