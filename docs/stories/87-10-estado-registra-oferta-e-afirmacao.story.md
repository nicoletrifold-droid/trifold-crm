# Story 87-10 — O estado passa a registrar o que o sistema OFERECEU e o que a Nicole AFIRMOU

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready
**Item do roadmap:** **`W1-2c`** (Onda 1) — **a metade de ESCRITA**. A metade de leitura (o `"Ok"` do
lead resolvendo contra a oferta) é o **`W3-2e`, Onda 3**, por arbitragem do @po
(`po-validation-87-3-87-4.md` §3). **Não restaurar a leitura para cá.**
**Criada por:** @sm (River) em 2026-08-10
**Formato:** Correção de substrato de **escrita**. O sistema para de jogar fora o que já calculou.
**Nada passa a decidir nada nesta story.**
**Executor:** @dev · validação em produção: @qa + Marcos (D7, fechado em 09/08)
**Esforço:** **S** (código) / **M** (teste) — a proporção é a mesma da 87-8, e é deliberada
**Risco:** **Baixo de regressão** / **Baixo de comportamento novo**
**Deploy:** **último da fila homologada pelo @po** — `87-12` (hotfix do `handoff.ts`) → `87-5 A` →
`87-5 B` → `87-11` → **`87-10`**, ≥24 h entre cada. **Obrigatoriamente depois da `87-11` em
produção** (ver AC6 e o §5 do Context; a `87-11` tem número maior e sobe antes, de propósito).
⚠️ **A ordem protege o sítio 1 e só ele — a `AC6-b` é obrigatória em qualquer ordem.**

> ### O que esta story faz, em uma frase
>
> Hoje `authorizedSlotUtc` é uma **variável local** que morre no fim do turno, e a fala de
> confirmação da Nicole não é registrada em lugar nenhum. Depois desta story, o que o **sistema
> ofereceu** e o que a **Nicole afirmou** ficam gravados no estado da conversa, com data absoluta,
> âncora e validade — **sem que nada passe a lê-los para decidir**.

---

## Story

**Como** engenharia da Trifold, que descobriu que a máquina de estados é **surda** exatamente onde
deveria registrar a própria oferta,
**Queremos** persistir, por conversa, os horários que o sistema colocou no bloco `[SISTEMA]` e o
horário que a Nicole afirmou na prosa — com data absoluta, âncora temporal e TTL,
**Para que** (a) o `W3-2e` tenha contra o que resolver o `"Ok"` do lead sem chamar modelo nenhum,
(b) o gatilho turn-local do Epic 88 (`88-7`) saiba que **existe oferta viva**, e (c) o alerta
duplicado que a produção acabou de produzir tenha como se reconhecer.

---

## Context

### 1. 🔴 A primeira detecção real da guarda em produção — 10/08/2026, 00:13 UTC (21:13 BRT)

**Medido por mim contra produção hoje (`dsopqkqjkmhytudaaolv`, Management API, somente SELECT).**
Esta é a **primeira e única** ocorrência de `NICOLE_SLOT_UNAUTHORIZED` em toda a história de
`system_events` — a guarda que a 75-279 instalou e que o epic descrevia como *"zero eventos, e zero
não é sucesso: é cegueira"* **acabou de deixar de ser zero**.

```
event_type                     n   primeiro                          ultimo
NICOLE_SLOT_UNAUTHORIZED       2   2026-08-10 00:13:37.448725+00     2026-08-10 00:14:12.642472+00
NICOLE_SLOT_MISMATCH           0   —                                 —
NICOLE_AGENDA_STATE_*          0   —                                 —
NICOLE_LASTRO_DIARIO           0   —                                 —   (o cron da 87-3 nunca rodou)
```

*(Consulta: `select event_type, count(*), min(created_at), max(created_at) from system_events where
event_type in (…) group by 1`. As duas linhas de `NICOLE_SLOT_UNAUTHORIZED` são o **único** retorno.)*

**A conversa inteira, colada do banco** (lead `c35e0e89-6387-4cc6-8833-72ee75a805a7`, Ronaldo —
corretor procurando parceria; horários em UTC):

```
00:12:26  LEAD    Sim
00:12:30  NICOLE  Que ótimo, Ronaldo! A gente atende de segunda a sexta das 8h às 18h e sábado
                  das 8h às 12h. Qual dia e horário ficam melhor pra você?
00:13:32  LEAD    3ª feira às 17:30
00:13:37  NICOLE  Perfeito, Ronaldo! Terça-feira às 17h30 está ótimo.
                  Só me confirma: seria a terça do dia 11 de agosto?          🔴 evento 1
00:14:07  LEAD    Sou corretor de imóveis, vc faz parceria?
00:14:12  NICOLE  Para esse tipo de assunto, o contato direto é pelo nosso telefone e WhatsApp:
                  (44) 3222-9698. Por lá você fala com a equipe certa!
                  Sobre a sua visita, Ronaldo — você mencionou terça às 17h30. Seria terça dia
                  11 de agosto?                                                🔴 evento 2
00:14:58  LEAD    Cancela o horário, vou entrar em contato com o setor de parceria
00:15:01  NICOLE  Tudo bem, Ronaldo! Cancelado por aqui. …
00:15:16  LEAD    Ok
00:15:47  NICOLE  Até mais, Ronaldo! Quando quiser retomar, estarei por aqui.
```

Os dois eventos têm `said_at = 2026-08-11T20:30:00.000Z` e `lead_id` idêntico. **A distância entre
eles é de 35 segundos, não de um minuto** — a leitura de "21:13 e 21:14" no briefing vem do minuto
do relógio BRT, e as duas leituras ficam registradas: `00:13:37.448725` e `00:14:12.642472` UTC.

> ### 🔴 A detecção expôs um TERCEIRO defeito, e ele não é desta story — mas precisa ficar escrito
>
> **O bloco `[SISTEMA]` daquele turno tinha RECUSADO o horário, e ela confirmou assim mesmo.**
> `evaluateSlot` (`visit-slot.ts:515`) exige que a visita de 60 min caiba inteira no expediente:
> `17:30 + 60 > 18:00` ⇒ `{ startUtc: null, outsideHours: true }`. O caminho `day && time` de
> `pipeline.ts:1005-1007` injetou então, literalmente:
>
> > *"O horário pedido não serve (já passou ou está fora do atendimento). Informe com gentileza que
> > atendemos de segunda a sexta das 8h às 18h e sábado das 8h às 12h, e peça um horário válido."*
>
> E a resposta foi *"Terça-feira às 17h30 está ótimo."* **É a prova mais limpa que este epic já
> produziu de que guardrail em prompt não é enforcement** — e é também a razão mecânica de
> `authorizedSlotUtc` ter ficado `null` (o que fez a guarda cair no ramo `UNAUTHORIZED`).
> **Isso é `W2-3` / `W3-2c`, não é esta story.** Registrado aqui porque o caso é novo, é de hoje, e
> some se ninguém escrever.

### 2. O que morre no fim do turno, hoje

| o que o sistema calcula | onde vive | tempo de vida |
|---|---|---|
| `authorizedSlotUtc` — o slot que o sistema autorizou | `let` local, `pipeline.ts:724` | **o turno** |
| `freeSlotsInPeriod(...)` — a lista de horários livres oferecida | `const slots`, linhas 932 e 1011 | **o turno** |
| `alternatives` de `checkSlotAvailability` — o "esse está ocupado, tenho estes" | linhas 911 e 1002 | **o turno** |
| a afirmação da Nicole (`detectAffirmedSlot`) | argumento do `emit`, linha 1156 | **o turno** |

Nenhum dos quatro sobrevive ao `updateConversationState` da linha 1544. **O sistema calcula a
verdade e a joga fora**; no turno seguinte o `"Ok"` do lead não tem a que se referir. É a consequência
medida em 60 dias que o epic registra em 6 ocorrências (Valnira, Idalina, Sueli-aceite) — o lead
aceita, o parser não vê dia nem hora, e a Nicole **pergunta de novo**.

### 3. A tabela de confiança do @po — é ela que decide o que a Onda 3 pode ler

| campo | origem | confiança | uso permitido |
|---|---|---|---|
| **`ofertas_do_sistema`** | `authorizedSlotUtc` / `freeSlotsInPeriod` / `alternatives` — **o sistema calculou** | **Alta** — é o mesmo valor determinístico que hoje morre no fim do turno | Escrito aqui; **é este, e só este, que o `W3-2e` lê** |
| **`afirmado_pela_nicole`** | `detectAffirmedSlot` — parseada da **prosa dela** | **71,9 % estrito / 81,3 % frouxo** (remedido pelo @po, 10/08 — ver caixa abaixo) | **WRITE-ONLY.** Observabilidade rotulada não-confiável. **Nunca** é insumo de decisão até a guarda de interrogação do Epic 88 (`88-13`) subir. **AC6-b** é o que impede que ele vire insumo por via indireta |

> ✅ **REMEDIDO pelo @po em 10/08 — e não havia erro de aritmética: havia fronteira não declarada.**
>
> **Método:** unidade = **disparo** (uma mensagem `role='assistant'` em que `detectAffirmedSlot`
> devolve `Date`); população = **todas** as mensagens `role='assistant'` de produção em 60 dias;
> execução = a função real (`visit-slot.ts:464`) com `now` = `created_at` da própria mensagem.
>
> ```
> mensagens role='assistant' em 60 d ....... 1.172
> disparos ................................. 32   (2,7 %)   em 19 conversas
> disparos até 07/08 ....................... 30   ← denominador dos DOIS números publicados
> ```
>
> **`~79 %` e `83 %` são a MESMA medição (30 disparos) com a fronteira em lugares diferentes** — e a
> fronteira nunca foi escrita. Sob classificação **estrita** (afirma dia+hora **de visita** como
> coisa resolvida): **23/32 = 71,9 %**. Sob **frouxa** (enuncia um slot concreto, incluindo proposta
> e promessa): **26/32 = 81,3 %**. Os três casos-fronteira que produzem toda a diferença:
> *"Posso confirmar sua visita para este sábado às 11h?"* (proposta), *"Vou confirmar a
> disponibilidade para sexta, dia 7, às 14h"* (promessa) e *"Segunda-feira às 9h **o corretor te
> liga**"* (Silvana — afirma **ligação**, não visita; o instrumento não distingue os objetos).
>
> **Redação normativa que substitui o `~79 %` em `agenda-state.ts:120-121` (tarefa do @dev, T1):**
> *precisão do `detectAffirmedSlot` — unidade: disparo; população: mensagens `role='assistant'`,
> 60 d; n = 32 em 1.172 (2,7 %), 19 conversas. **71,9 % estrito / 81,3 % frouxo.** Quem citar o
> número declara a fronteira.*
>
> **Nenhuma decisão desta story dependia disso** (o campo é write-only, e a AC3-(iii) + a AC6-b
> provam que ninguém o lê). **O pré-requisito do `W3-2e` está satisfeito** — e a medição reforça o
> veto: um instrumento cuja precisão varia 10 pontos conforme a fronteira não pode ser insumo de
> decisão.

### 4. 🔴 O achado que muda o desenho: os dois campos reservados **não podem hospedar esta escrita**

A `87-4` deixou `ofertas_do_sistema?: string[]` e `afirmado_pela_nicole?: string | null` declarados
dentro de `AgendaState` (`agenda-state.ts:108-126`), com o comentário *"para que o W1-2c seja 'passar
a escrever dois campos' e não uma SEGUNDA mudança de formato"*. **A intenção é boa e a hospedagem não
funciona.** Duas razões, as duas verificadas no código de hoje:

**(a) O envelope é APAGADO exatamente nos ramos que produzem o sinal de confiança alta.**

| ramo | o que produz | o que faz com o `agenda_state` |
|---|---|---|
| `pipeline.ts:900-909` — remarcar para slot livre | `authorizedSlotUtc = newStartUtc` | `clearPending()` na linha 902 → **envelope null** |
| `pipeline.ts:989-1000` — agendar slot livre | `authorizedSlotUtc = startUtc` | `writeAgendaState(cd, null)` na linha 991 → **envelope null** |
| `pipeline.ts:910-913` / `1001-1004` — slot ocupado, oferece alternativas | `alternatives` | envelope já limpo pelos dois de cima |

Ou seja: **escrever "só quando o envelope existir" perderia todo `authorizedSlotUtc`** — o único
campo que o `W3-2e` tem permissão de ler. **No caso Ronaldo de hoje** o envelope também não estava
lá no instante da afirmação (o ramo `day && time` limpou), então a afirmação também se perderia.

**(b) Criar um envelope quando não existe QUEBRA DOIS GATES — é caminho de decisão novo.**

```
hasVisitAvailability = !!agendaState        → pipeline.ts:781 → isVisitSchedulingMode(...)
hasAgendaFact(collectedData)                → qualification.ts:50 → peso 20 → score → shouldHandoff
```

Um envelope criado só para hospedar o registro **arma o modo agendamento** e **dá 20 pontos de
score** a uma conversa que não tem fato de agenda nenhum. A regra de corte da Onda 1 proíbe, sem
interpretação.

> **DECISÃO DE DESENHO (@sm, para o @po ratificar ou vetar — é o único ponto desta story que precisa
> de arbitragem):** os dois campos **saem** de `AgendaState` e passam a morar numa **chave irmã** de
> `collected_data`, `agenda_registro`, com os **mesmos nomes e os mesmos tipos** do contrato do @po.
>
> **Por que isto NÃO é "reabrir o formato":** os dois campos são `optional`, **nada escreve e nada
> lê** — `parseAgendaState` (`agenda-state.ts:202-203`) apenas os copia quando presentes, e a
> produção tem **zero** registros com eles (`agenda_state` existe em **1** de 254 linhas de
> `conversation_state`, e é o do Ronaldo, sem os dois campos). Removê-los de `AgendaState` é uma
> edição de risco zero, e a AC1 exige a prova disso.
>
> **Por que a chave irmã é mais segura que o envelope:** ela é lida por **ninguém** — nem por
> `hasAgendaFact`, nem por `isVisitSchedulingMode`, nem por `resolveVisitSlotParts`. Um campo dentro
> de `AgendaState` estaria a um `if` de distância de armar um gate por acidente. **Este desenho torna
> a regra de corte estrutural, em vez de disciplinar.**

> ### ✅ RATIFICADO pelo @po em 10/08 — com duas correções medidas
> *(parecer completo: `docs/qa/po-validation-87-10-87-11.md` §1 e §2)*
>
> **A chave irmã está aprovada.** Verifiquei as três premissas no código de hoje: o envelope é
> mesmo apagado em `:902` e `:991`; os dois gates (`hasVisitAvailability = !!agendaState` em `:781`
> e `hasAgendaFact` → peso 20 em `qualification.ts:50`) quebram mesmo se um envelope for criado; e
> **não existe terceira opção** — a saída aparente (gravar dentro de `agenda_state` um objeto que
> `parseAgendaState` rejeite, por faltar `citacao`/`origem`) **não resolve o problema (a)**, porque
> `writeAgendaState(cd, null)` apaga a **chave inteira**, válida ou não.
>
> **Correção 1 — a prova do "risco zero" está errada, e eu a executei.** Removi os dois campos da
> interface e as duas linhas do `parseAgendaState`, rodei `npx tsc --noEmit` em `packages/ai` e
> restaurei o arquivo. O resultado **não é 0**:
>
> ```
> src/flows/agenda-state.test.ts(48,15): error TS2339: Property 'ofertas_do_sistema' does not exist on type 'AgendaState'.
> src/flows/agenda-state.test.ts(49,15): error TS2339: Property 'afirmado_pela_nicole' does not exist on type 'AgendaState'.
> ```
>
> `packages/ai/tsconfig.json` tem `include: ["src"]` e os testes moram em `src/` — **o `tsc` cobre
> os testes**. Existe **um** leitor dos dois campos, e é o teste que a própria 87-4 escreveu para
> afirmar que ninguém escreve neles. A conclusão ("risco zero") continua de pé; **a régua muda** —
> ver **AC1-(ii) reescrita**.
>
> **Correção 2 — a chave irmã só é "lida por ninguém" se ela também não for ao modelo pelos DOIS
> caminhos de Haiku que ninguém mapeou.** Ver o novo **§4-bis** logo abaixo e a **AC6-b**.
>
> **Consequência que eu extraio do próprio argumento do @sm:** se a garantia é *"ninguém lê"*, então
> **nada pode ler** — nem para escolher o nível de um log. É o que decide o corte da AC8 (§4 do
> Desenho).

### 4-bis. 🔴 Achado do @po: `agenda_registro` chega ao modelo por outros DOIS caminhos

`grep` sobre quem serializa `collected_data` para dentro de um prompt devolve **três** sítios, não
um. A `87-11` fecha **o primeiro e só ele**:

| # | sítio | prompt de quê | o que recebe | quem cobre |
|---|---|---|---|---|
| 1 | `pipeline.ts:1913` | a fala da Nicole (turno vivo) | `state.collected_data` | **87-11** ✅ |
| 2 | `lead-memory.ts:79` — `DADOS COLETADOS:\n${JSON.stringify(collectedData, null, 2)}` | Haiku que escreve o `ai_summary` | **`finalData`** (`pipeline.ts:1611`) | **AC6-b** 🔴 |
| 3 | `haiku-enrichment.ts:90` — `Dados ja coletados: ${JSON.stringify(input.currentCollectedData)}` | Haiku do cron `enrich-leads` | `currentData` do banco, **sem filtro na entrada** | **AC6-b** 🔴 |

O escritor desta story entra sobre `finalData`, e **o mesmo `finalData`** vai para
`atualizarResumoComLastro` na linha 1611. O caminho completo:

```
afirmado_pela_nicole (a fala dela, ~1 erro em 5)
  → finalData → lead-memory.ts:79 → Haiku → ai_summary
  → memory/loader.ts:195 (fallback ativo "em 100 % dos turnos", por docstring da 87-7)
  → prompt da Nicole no turno seguinte, agora em PROSA
```

A alucinação sai do estado como campo write-only e **volta ao modelo lavada em texto corrido**. O
sítio 3 é pior em população (o cron é o último escritor de **70 %** dos estados, medição da 87-4) e
a 87-4 filtrou a **saída** do Haiku (`omitAgendaKeys`) mas **nunca a entrada** — ele já recebe
`agenda_state` cru com `fonte`, `origem` e `expira_em`.

**E o teste da AC3-(iii) ficaria verde assim mesmo:** `atualizarResumoComLastro` é fire-and-forget
atrás de `msgCount % 5 === 0`; uma fixture de dois turnos não o dispara. **A ordem de deploy não
protege isto.** Daí a AC6-b ser obrigatória independentemente da fila.

### 5. Por que a `87-11` sobe ANTES, mesmo tendo número maior

`buildSystemPrompt` (`pipeline.ts:1911-1915`) despeja `JSON.stringify(state.collected_data)` inteiro
no prompt. **Se esta story subir primeiro**, a Nicole passa a receber, em JSON cru e sem instrução
nenhuma:

- `ofertas_do_sistema: ["2026-08-11T13:00:00.000Z", …]` — uma lista de horários **que ela pode
  simplesmente afirmar**, fora do bloco `[SISTEMA]` e sem a regra absoluta que o acompanha;
- `afirmado_pela_nicole: "…"` — **a alucinação dela do turno anterior, devolvida como dado
  coletado**, com ~1 em 5 de erro.

Isso não é risco teórico: é exatamente o loop da §1 do epic, com um campo novo. **A `87-11` (`W1-6`)
remove a linha do despejo e é a pré-condição de deploy desta story.** A AC6 fixa a consequência.

---

## Desenho

### 1. Um módulo, um tipo, um escritor

Em `packages/ai/src/flows/agenda-state.ts` (mesmo arquivo — é o dono do assunto):

```ts
export const AGENDA_REGISTRO_KEY = "agenda_registro"

/**
 * Story 87-10 (item W1-2c) — o que o SISTEMA ofereceu e o que a NICOLE afirmou.
 * NÃO é AgendaState: aquele é o fato dito pelo LEAD, com citação obrigatória e
 * origem 'lead'. Este é o registro do outro lado da mesa.
 *
 * NADA LÊ ESTE OBJETO PARA DECIDIR. O leitor autorizado é o W3-2e (Onda 3), e
 * só de `ofertas_do_sistema`.
 */
export interface RegistroAgenda {
  /** ISO-8601 UTC de cada horário que ESTE turno colocou num bloco [SISTEMA]
   *  como dia+hora concretos. Confiança ALTA (o sistema calculou). Ordenado,
   *  sem repetição, no máximo MAX_OFERTAS. */
  ofertas_do_sistema: string[]
  /** ISO-8601 UTC lido da PROSA dela por `detectAffirmedSlot`. Precisão remedida
   *  pelo @po em 10/08: 71,9% (classificação estrita) / 81,3% (frouxa), n = 32
   *  disparos em 1.172 mensagens de 60 d. WRITE-ONLY — ver AC3-(iii). */
  afirmado_pela_nicole: string | null
  // ⛔ `alerta_sem_lastro` REMOVIDO pelo @po em 10/08, junto com o corte da AC8.
  //    Era bookkeeping de dedupe de alerta — e o comentário original já dizia
  //    "não é sinal de conversa". Se não é sinal de conversa, não mora no estado
  //    da conversa; e um leitor dentro desta chave destruiria a única propriedade
  //    que fez a chave irmã ser aprovada. O dedupe é da `87-9`, por `system_events`.
  /** O instante do turno que produziu este registro. É A ÂNCORA. */
  ancorado_em: string
  /** ancorado_em + TTL_AGENDA_STATE_HORAS. Depois disso é APAGADO na escrita. */
  expira_em: string
}

export const MAX_OFERTAS = 6
```

**TTL:** reusa `TTL_AGENDA_STATE_HORAS` (48 h). Não é número novo — é o que a `87-4` já exerceu
contra o dado real.

**Sem evento de expiração.** A `87-4` emite `NICOLE_AGENDA_STATE_EXPIRADO` porque precisava de um
contador de produção para provar o decaimento dos 56 resíduos legados (a AC8 dela). Aqui não há
legado para decair: a chave nasce hoje. A expiração é provada por teste (AC4), e **um `event_type` a
mais num canal que ninguém lê é ruído, não observabilidade.**

### 2. Onde a coleta acontece — os SETE sítios, e a regra que os define

Ao lado de `authorizedSlotUtc` (`pipeline.ts:724`) nasce `const ofertasDoTurno: Date[] = []`.

> **A regra, e ela é greppável:** *todo `Date` que este turno colocou dentro de um bloco `[SISTEMA]`
> como **dia+hora concretos** entra em `ofertasDoTurno`.* Nem mais, nem menos.

| # | linha | ramo | o que entra |
|---|---|---|---|
| 1 | 906-909 | remarcar, horário livre | `newStartUtc` (autorizado) |
| 2 | 910-913 | remarcar, horário ocupado | `alternatives` |
| 3 | 930-936 | período com visita ativa | `slots` de `freeSlotsInPeriod` |
| 4 | 941-944 | sem pedido de mudança, reconfirma | `apptWhen` (autorizado) |
| 5 | 994-1000 | agendar, horário livre | `startUtc` (autorizado) |
| 6 | 1001-1004 | agendar, horário ocupado | `alternatives` |
| 7 | 1008-1015 | dia + período, sem visita ativa | `slots` de `freeSlotsInPeriod` |

Os ramos que **não** citam horário concreto (fora de expediente, só período sem dia, "peça um horário
válido") **não entram** — é o caso Ronaldo, e é por isso que `ofertas_do_sistema` dele fica `[]`.

### 3. Onde a escrita acontece

**Um ponto só**, imediatamente antes de `updateConversationState` (`pipeline.ts:1544`), sobre
`finalData`. É o único lugar onde as três coisas coexistem: as ofertas do turno, a
`assistantMessage` e o objeto que vai ser persistido.

```
ofertasDoTurno vazio  E  detectAffirmedSlot(assistantMessage) === null  E  não há registro anterior
   → NÃO grava a chave (AC2-iii)
senão
   → grava RegistroAgenda ancorado em `new Date()`
```

Registro anterior **vencido** é apagado, não mesclado. Registro anterior **vivo** tem
`ofertas_do_sistema` **substituídas** (não acumuladas — oferta de turno passado não é oferta viva).

### 4. O bloco do dedupe (AC8–AC10) — ⛔ **CORTADO pelo @po em 10/08. A AC9 fica.**

> **Decisão do @po (parecer §3).** A DoD exigia corte **por escrito**; aqui está.
>
> **AC8 (dedupe) e AC10 (fail-open do dedupe): CORTADAS.** Não pelas três razões do @sm — as três
> são boas —, mas porque **a AC8 contradiz o argumento que fez a chave irmã ser ratificada**. O
> docstring do tipo diz, em caixa alta, `NADA LÊ ESTE OBJETO PARA DECIDIR`; a AC8 põe um leitor lá
> dentro no dia 1 (`alerta_sem_lastro`, para escolher entre `error` e `info`). O próprio @sm já teve
> de abrir a exceção na régua da AC3-(iv) — *"fora do escritor **e do bloco de dedupe da AC8**"*.
> **Uma régua com exceção escrita no dia do nascimento é disciplinar, e a chave irmã foi comprada
> justamente para não depender de disciplina.**
>
> Somam-se: o denominador é **2 eventos / 1 caso / all-time** (reconfirmado pelo @po — é o **único**
> `event_type` `NICOLE%` com contagem > 0 em todo o `system_events`); e **existe lugar melhor, já
> reservado**. Com a **AC9** mantida, o evento passa a carregar `conversation_id` **e** `said_at` —
> que é exatamente a chave de supressão que a AC8 queria. **O dedupe vira um `select` em
> `system_events` feito pelo notificador da `87-9`: sem estado novo, sem leitor na chave irmã, sem
> `event_type` novo.** É mais barato que a AC8 **e** chega junto com o canal, que é a janela que o
> @sm queria proteger. O argumento *"não estrear o canal entregando 3 ou 4 mensagens por incidente"*
> continua válido e vira **condição de aceite da `87-9`**.
>
> **AC9: MANTIDA**, com um acréscimo (ver a AC).
> **`alerta_sem_lastro` sai do `RegistroAgenda`** (§1 do Desenho).
> **T5 deixa de ser o bloco do dedupe** e passa a ser só a AC9.

> **O que NÃO cabe aqui, e a justificativa: "o cancelamento não fecha o alerta".**
> **Fica FORA, e o dono é a `87-9`, com apoio da `87-3`.** Três razões, em ordem de peso:
>
> 1. **Fechar exige um caminho de DECISÃO novo no turno.** No caso Ronaldo **não havia
>    `appointment`** — `apptToCancel` é `null` e `detectCancelIntent` só é chamada dentro de
>    `if (activeAppointment)` (`pipeline.ts:836`). Fechar o alerta exigiria chamar o detector **fora**
>    daquele bloco e decidir que aquele cancelamento se refere àquela afirmação. Isso é inferência
>    nova sobre a intenção do lead, com 35 segundos de retrospecto. **A regra de corte da Onda 1
>    proíbe** — e nem seria a versão boa: quem tem retrospecto de verdade é a reconciliação **diária**
>    da `87-3`, que às 11:38 UTC do dia seguinte sabe se existe `appointment` ou não.
> 2. **Fechar um alerta pressupõe um LEITOR de alerta, e ele não existe.** O @po mediu:
>    `TELEGRAM_ADMIN_CHAT_ID` nunca foi provisionado, o canal está abandonado, e a única superfície é
>    o painel `/dashboard/sistema`, *"que ninguém abre para saber que a Nicole mentiu ontem"*. O
>    ciclo de vida do alerta (entregar → devolver resultado → registrar supressão → **fechar**) é
>    literalmente a carta da `87-9`, incluindo o requisito que o @po marcou como *mais importante que
>    o canal*: **o notificador tem de devolver resultado**.
> 3. **A parte barata e sem decisão desta ideia CABE, e está na AC9:** enriquecer a metadata dos dois
>    eventos de guarda com `conversation_id` e com as ofertas do turno. Sem isso, quem for fechar o
>    alerta na `87-9` não consegue nem correlacionar o evento com a conversa sem passar por
>    `leads` — hoje a metadata tem só `lead_id`, `said_at` e `assistant_message`.
>
> *(Nota técnica para quem escrever a `87-9`: **`message_id` não está disponível no ponto da guarda.**
> `saveMessages` roda na linha 1541 e a guarda na 1134 — a mensagem ainda não existe no banco. O
> índice único que a `87-6` propõe é chaveado em `metadata->>'message_id'`, então ele **não serve**
> para estes dois eventos sem reordenar o pipeline. `conversation_id` está disponível e é o que a
> AC9 pede.)*

---

## Acceptance Criteria

> Toda AC diz **como se verifica**. Todo teste de regressão exige o **vermelho colado — a saída
> bruta do reporter, não transcrita — com a FORMA DA MUTAÇÃO escrita ao lado do número.**
> *(Nota de processo `P1` do gate da 87-8: três stories seguidas com contagem declarada que não
> sobreviveu à remedição, e a causa nomeada foi transcrever em vez de colar. A mutação roda com
> `npx vitest run` da RAIZ, nunca com `--reporter=basic` e nunca só no arquivo do módulo.)*

**AC1 — `RegistroAgenda` existe e os dois campos SAEM do `AgendaState`.**
*Verifica-se:*
- (i) `grep -rn 'ofertas_do_sistema\|afirmado_pela_nicole' packages/ai/src packages/web/src` — nenhuma
  ocorrência dentro da `interface AgendaState` nem de `parseAgendaState`;
- (ii) 🔴 **A prova da remoção — reescrita pelo @po em 10/08, porque a original é falsa e ele a
  executou.** O baseline no `HEAD` é `tsc --noEmit` = **0**. Depois de remover os dois campos da
  interface e as duas linhas do `parseAgendaState`, o resultado **não é 0 — são exatamente estes
  dois erros, e nenhum outro**:

  ```
  src/flows/agenda-state.test.ts(48,15): error TS2339: Property 'ofertas_do_sistema' does not exist on type 'AgendaState'.
  src/flows/agenda-state.test.ts(49,15): error TS2339: Property 'afirmado_pela_nicole' does not exist on type 'AgendaState'.
  ```

  *(`packages/ai/tsconfig.json` tem `include: ["src"]` e os testes moram em `src/`: **o `tsc` cobre
  os testes**.)* **Verifica-se em três passos, com as três saídas coladas:**
  1. `tsc` no `HEAD` = **0**;
  2. `tsc` depois da remoção = **exatamente os 2 erros acima**. *Se aparecer um terceiro erro, ou um
     erro em outro arquivo, **PARE**: existe um consumidor que ninguém mapeou e a premissa de risco
     zero caiu;*
  3. apagar o caso de teste `"os campos reservados do W1-2c NÃO são escritos por esta story"`
     (`agenda-state.test.ts:44-50`) — o assunto dele deixa de existir, e o que ele protegia passa a
     ser protegido pela AC5 — e `tsc` = **0** de novo. Registrar a remoção do teste no delta da AC11.

  **A conclusão "risco zero" continua valendo**, e agora com o número certo: existe **um** leitor dos
  dois campos, e é o teste que a própria 87-4 escreveu para afirmar que ninguém escreve neles;
- (iii) `MAX_OFERTAS`, `AGENDA_REGISTRO_KEY`, `RegistroAgenda`, `readRegistroAgenda` e
  `writeRegistroAgenda` exportados pelo barrel `@trifold/ai` (o cron `enrich-leads` importa de lá —
  AC7).

**AC2 — 🔴 `ofertas_do_sistema` registra o que o sistema ofereceu, e o par de fixtures tem controle
negativo.** *Os três casos no MESMO teste — só o conjunto discrimina.*
- **(i) POSITIVO — lista.** Lead pede *"sexta de manhã"* com dia conhecido; `freeSlotsInPeriod`
  semeado com 3 horários livres → depois do turno,
  `conversation_state.collected_data.agenda_registro.ofertas_do_sistema` tem **exatamente esses 3
  ISO-8601 UTC, em ordem crescente**. Asserção de **sequência completa**, não de tamanho.
- **(ii) 🔴 POSITIVO — o caso que o envelope perderia.** Lead pede *"sexta às 10h"*, horário livre →
  `authorizedSlotUtc` é setado **e** `agenda_state` é apagado no mesmo turno. Assertar as duas coisas
  juntas: `ofertas_do_sistema` tem **1** elemento **e** `collected_data.agenda_state` está
  **ausente**. *É esta fixture que prova o desenho do §4 do Context; sem ela a story vira opinião.*
- **(iii) CONTROLE NEGATIVO.** Turno sem agenda nenhuma (*"me manda a planta"*) → a chave
  `agenda_registro` **não existe** em `collected_data`. Registro vazio nunca é escrito.
- **Vermelho:** contra o `HEAD`, (i) e (ii) falham (a chave não existe) e (iii) passa. Colar a saída
  bruta com a contagem, e escrever a mutação: *"`git stash` do escritor, testes intactos"*.

**AC3 — 🔴 `afirmado_pela_nicole` é gravado, é fiel, e não é lido por ninguém.**
- **(i) POSITIVO, fixture literal de produção (10/08).** `assistantMessage` =
  `"Perfeito, Ronaldo! Terça-feira às 17h30 está ótimo.\n\nSó me confirma: seria a terça do dia 11 de agosto?"`,
  com `now` fixado em `2026-08-10T00:13:37Z` → `afirmado_pela_nicole === "2026-08-11T20:30:00.000Z"`.
  **O valor esperado não é derivado: é o `said_at` que a produção gravou naquele evento.**
- **(ii) CONTROLE NEGATIVO — a classe dos ~21%.** `assistantMessage` que apenas **oferece**
  (*"Tenho 8h ou 11h na terça, qual você prefere?"*) → `afirmado_pela_nicole === null`.
- **(iii) 🔴 WRITE-ONLY, provado por mutação invertida.** Duas execuções de `processMessage` sobre a
  mesma fixture, uma com `agenda_registro.afirmado_pela_nicole` semeado com um ISO **arbitrário e
  contraditório** e outra sem a chave: `response`, `qualificationScore`, `handoff`, o array
  `messages` enviado ao `fakeAnthropic` e a tabela `appointments` final são **idênticos**.
  *Aqui o resultado esperado da mutação é **zero vermelhos** — e é essa a prova. Escrever isso no
  registro, para que ninguém leia "0 falhas" como teste inerte.*
- (iv) `grep` prova que `afirmado_pela_nicole` não aparece em nenhuma expressão condicional fora do
  escritor e do bloco de dedupe da AC8.

**AC4 — O registro tem âncora e validade, e não ressuscita.**
*Verifica-se, teste puro sobre `readRegistroAgenda`:* registro ancorado **49 h** atrás → devolvido
como ausente **e apagado do objeto**; **47 h** → preservado; `expira_em` **exato** → ainda vale
(mesma fronteira da `87-4`, `isAgendaStateExpired`). `ancorado_em` e `expira_em` do registro escrito
distam exatamente `TTL_AGENDA_STATE_HORAS`.

**AC5 — 🔴 O registro NÃO pontua, NÃO arma gate e NÃO muda o score.** *(É a regra de corte da Onda 1,
e é a AC que o @po pediu explicitamente na 87-4.)*
- (i) `git diff HEAD -- packages/ai/src/flows/qualification.ts` = **0 linhas**;
- (ii) `hasAgendaFact` e `isVisitSchedulingMode` **intocadas** — conferido no diff;
- (iii) teste: mesma fixture, uma execução com `agenda_registro` presente e outra sem →
  `qualificationScore`, `qualification_step` persistido e `handoff` **idênticos**;
- (iv) **vermelho obrigatório:** fazer `hasAgendaFact` também olhar `AGENDA_REGISTRO_KEY` → (iii)
  **tem** de falhar. Colar. *Sem esse vermelho, (iii) passaria mesmo se o campo pontuasse.*

**AC6 — 🔴 O registro não chega ao modelo.** *(Dependência dura da `87-11`.)*
*Verifica-se:* no turno da fixture AC2-(ii), o `system` enviado ao `fakeAnthropic` **não contém**
nenhuma das strings `agenda_registro`, `ofertas_do_sistema`, `afirmado_pela_nicole`,
`alerta_sem_lastro`, `ancorado_em`, `expira_em`.
> **Esta AC falha por construção enquanto a `87-11` não estiver em produção** — é a razão de a
> `87-11` ser pré-requisito de **deploy**, não de desenvolvimento. Se por qualquer motivo a ordem for
> invertida, esta story **precisa** carregar a exclusão mínima (uma linha) por conta própria, e a
> AC6 é a régua nos dois cenários.

**AC6-b — 🔴 O registro não chega aos OUTROS DOIS prompts.** *(AC nova, @po 10/08 — ver §4-bis do
Context. **Não** é coberta pela `87-11` nem pela ordem de deploy: a `87-11` remove o sítio 1 e só
ele. Sem esta AC, a palavra **write-only** que esta story usa seis vezes é falsa em produção.)*

- **(i) `lead-memory.ts:79`** — o `DADOS COLETADOS` do Haiku que escreve o `ai_summary` recebe
  `finalData` (`pipeline.ts:1611`). `agenda_registro` **não pode** aparecer nesse prompt. Fixture:
  estado com `agenda_registro` semeado (inclusive `afirmado_pela_nicole` com um ISO qualquer) →
  o prompt enviado ao Haiku **não contém** `agenda_registro`, `ofertas_do_sistema`,
  `afirmado_pela_nicole`, `ancorado_em` nem `expira_em`.
- **(ii) `haiku-enrichment.ts:90`** — o `Dados ja coletados` do cron `enrich-leads` recebe o
  `collected_data` **do banco, hoje sem filtro nenhum na entrada**. Mesma asserção, no teste do cron.
- **(iii) CONTROLE POSITIVO, nos dois:** as chaves de qualificação (`name`, `bedrooms`,
  `property_interest`) **continuam** nos dois prompts. *Sem isto, um `omit` largo demais passaria.*
- **(iv) Vermelho:** sem a alteração, (i) e (ii) falham e (iii) passa. Colar as duas saídas.
- **Forma sugerida (não normativa):** um único helper ao lado de `omitAgendaKeys` — é subtração, na
  mesma família do que a 87-4 já fez com a **saída** do Haiku. **Nenhum `if` novo, nenhum gate.**

> **Por que esta AC não é paranoia, e por que o teste da AC3-(iii) não a substitui:**
> `atualizarResumoComLastro` é fire-and-forget atrás de `msgCount % 5 === 0` — uma fixture de dois
> turnos não o dispara, e a AC3-(iii) ficaria verde com o vazamento vivo. O caminho completo é
> `afirmado_pela_nicole → finalData → Haiku → ai_summary → memory/loader.ts:195 → prompt da Nicole`:
> a afirmação de ~1-em-5-erro volta ao modelo **em prosa**, que é o defeito-mãe deste epic.

**AC7 — A segunda esteira nem repõe nem apaga o registro.** *(É a terceira story seguida em que o
`enrich-leads` é a esteira esquecida — 87-4, 87-7, 87-8. Não vai ser a quarta.)*
- (i) `omitAgendaKeys` (aplicada à saída do Haiku, `route.ts:152`) passa a remover
  `agenda_registro` — defesa em profundidade: o Haiku lê a conversa inteira e pode devolver a chave
  por hábito, e ele **não tem** como conhecer oferta do sistema;
- (ii) `omitLegacyAgendaKeys` (aplicada ao que já está gravado, `route.ts:164`) **preserva**
  `agenda_registro`, exatamente como preserva `agenda_state` hoje;
- (iii) **par de fixtures no mesmo teste**, em `enrich-leads/route.test.ts`: Haiku devolve a chave →
  ela **some** do merge; estado já tinha a chave → ela **sobrevive** ao merge;
- (iv) **vermelho:** sem a alteração de (i), a primeira metade falha. Colar.

---

### Bloco do dedupe — ⛔ AC8 e AC10 CORTADAS pelo @po (10/08) · AC9 MANTIDA

> **Corte por escrito, como a DoD exige.** Justificativa completa no §4 do Desenho e em
> `docs/qa/po-validation-87-10-87-11.md` §3. Resumo: a AC8 põe um leitor dentro da chave que só foi
> aprovada por não ter leitor; o denominador é 1 caso all-time; e a AC9 (mantida) entrega ao
> notificador da `87-9` a chave de supressão (`conversation_id` + `said_at`), o que torna o dedupe
> um `select` em `system_events` — sem estado novo, sem `event_type` novo e chegando junto com o
> canal. **A AC10 sai junto** (sem dedupe não há o que falhar aberto); a postura *"na dúvida,
> alerta"* migra para a `87-9` como requisito de entrada.
>
> **O @dev não implementa AC8 nem AC10.** O texto das duas fica abaixo, riscado como histórico, para
> que quem escrever a `87-9` herde a regra pronta em vez de reinventá-la.

**~~AC8~~ — ⛔ CORTADA (herança da `87-9`): o alerta repetido é suprimido por (conversa + horário afirmado), e a supressão é contável.**
*Regra, escrita para não admitir interpretação:* no ramo `!authorizedSlotUtc` da guarda
(`pipeline.ts:1151-1170`), quando `detectAffirmedSlot` devolve um `Date`:

```
registro lido no INÍCIO do turno tem alerta_sem_lastro.said_at === affirmedUtc.toISOString()
  E o registro não está vencido
     → emite NICOLE_SLOT_UNAUTHORIZED_REPETIDO, level "info",
       metadata { …a mesma de sempre, primeiro_em }   e  NÃO emite o level "error"
senão
     → emite NICOLE_SLOT_UNAUTHORIZED como hoje  e  grava alerta_sem_lastro = { said_at, primeiro_em: agora }
```

*Verifica-se, com **dois** `processMessage` consecutivos sobre a mesma conversa (o fake persiste o
estado entre eles — é o que a `pipeline-scheduling.test.ts` já faz):*
- (i) turno 1 → **um** evento `error` `NICOLE_SLOT_UNAUTHORIZED`; `alerta_sem_lastro` gravado;
- (ii) turno 2, **mesma** afirmação → **zero** eventos `error` e **um** `info`
  `NICOLE_SLOT_UNAUTHORIZED_REPETIDO`, com `primeiro_em` igual ao instante do turno 1;
- (iii) **CONTROLE NEGATIVO** — turno 2 afirmando um horário **diferente** → **um** `error` de novo.
  *Sem (iii), a supressão poderia estar engolindo tudo e o teste ficaria verde.*
- **Vermelho:** contra o `HEAD`, (ii) produz **dois** `error` e zero `info`. Colar.

> **Denominador declarado, e ele é minúsculo:** `NICOLE_SLOT_UNAUTHORIZED` tem **2 ocorrências em
> toda a história de `system_events`**, as duas em 10/08, com 35 s de distância — ou seja, **1 caso**.
> **Esta régua não pode ser validada em produção**, e a AC não pede que seja: o vermelho é o teste
> unitário. Qualquer afirmação futura do tipo *"o dedupe reduziu N% dos alertas"* precisa remedir com
> unidade e denominador declarados.

**AC9 — ✅ MANTIDA. A metadata dos dois eventos de guarda ganha o que falta para correlacionar.**
`NICOLE_SLOT_UNAUTHORIZED` e `NICOLE_SLOT_MISMATCH` passam a carregar `conversation_id` e
`ofertas_do_sistema` (a lista do turno, possivelmente vazia), além do que já carregam.
*(`NICOLE_SLOT_UNAUTHORIZED_REPETIDO` **não existe mais** — saiu com o corte da AC8.)*
**Acréscimo do @po:** o `UNAUTHORIZED` carrega também `authorized_slot_utc: null` **explícito** —
hoje a ausência do campo é ambígua entre *"não havia slot autorizado"* e *"o emissor esqueceu"*, e é
essa distinção que a `87-9` vai usar para decidir se fecha o alerta.
*Verifica-se por asserção sobre o `emit`, em teste próprio* (a AC8, que hospedava essa asserção, foi
cortada): um turno que dispara o `UNAUTHORIZED` — a fixture literal do Ronaldo serve, e é ela que
prova o caso `ofertas_do_sistema: []`.
> Hoje a metadata tem `lead_id`, `said_at` e `assistant_message`. Sem `conversation_id`, quem for
> triar precisa passar por `leads` para achar a conversa — e a `87-9` precisa disso para fechar o
> alerta. `ofertas_do_sistema` no evento responde, sem consulta nenhuma, a pergunta que o triador faz
> primeiro: *"o sistema tinha oferecido alguma coisa?"* — no caso Ronaldo, a resposta é **não**, e é
> uma informação que hoje não existe em lugar nenhum.

**~~AC10~~ — ⛔ CORTADA (herança da `87-9`): fail-open, sem exceção.** Registro ausente, com forma
inválida, com `alerta_sem_lastro` malformado ou vencido → **emite o `error`**. *Verifica-se com 4
fixtures degeneradas, uma por caso.*
> A postura é a mesma da 87-7: **na dúvida, alerta**. Trocar alerta duplicado por silêncio seria a
> classe de falha do `loader.ts:62` (`return ""`), que é a origem de metade deste epic.

---

**AC11 — Suíte, tipos e árvore.**
- `npx vitest run` da **RAIZ** (nunca `--reporter=basic`): total de testes **antes** e **depois**
  colados, com o delta explicado teste a teste;
- `npx tsc --noEmit` em `packages/ai` → **0**; em `packages/web` → só os pré-existentes
  (satori/sharp/pdf-lib), **nenhum em arquivo tocado**. *(`packages/ai` não tem eslint: `lint` é
  `tsc --noEmit`.)*
- árvore **restaurada byte a byte** depois de cada mutação, com `md5` conferido nos arquivos tocados.

**AC12 — Janela de observação em produção.**
- **Nenhuma AC depende de "o alerta chegou"** (o canal está morto; a `87-9` não subiu) **nem de "o
  cron rodou"** (`NICOLE_LASTRO_DIARIO` = 0 all-time). A verificação é `select` em `system_events` e
  em `conversation_state`.
- **O que se olha, por SQL, 24 h depois do deploy:**
  1. `select count(*) from conversation_state where collected_data ? 'agenda_registro'` — **baseline
     0** (medido hoje). Se continuar 0 com turnos de agendamento tendo acontecido, o escritor não
     está rodando;
  2. `agenda_registro` com `ofertas_do_sistema <> '[]'` — quantos, e **colar dois exemplos inteiros**;
  3. `NICOLE_SLOT_UNAUTHORIZED` — **baseline 2 all-time** (o `_REPETIDO` deixou de existir com o
     corte da AC8), e a **metadata dos novos eventos traz `conversation_id` e `ofertas_do_sistema`**
     (AC9) — colar um evento inteiro se houver;
  4. **M1 / M4 pela consulta da 87-3 rodada À MÃO** (o cron nunca executou; o endpoint aceita
     `?dry=1`, mas a régua vale como `select`).
- **Piso de inconclusividade:** com `n < 5` conversas com registro escrito, a janela **estende**; não
  se declara sucesso. *(Mesmo piso da 87-7 e da 87-8. Com ~1 detecção de guarda em toda a história,
  declarar sucesso em 24 h seria declarar sobre `n = 0`.)*
- **Gatilho de rollback:** (a) lead pedindo visita e **não recebendo horário** — **um caso basta**;
  (b) `M1`/`M4` subindo; (c) `qualification_score` médio deslocando (a AC5 diz que não pode).

---

## Tarefas

- [ ] **T0 — Remedir contra produção ANTES de escrever código (somente SELECT).** Colar no Dev Agent
      Record, com a consulta ao lado de cada número: (a) as 2 linhas de `NICOLE_SLOT_UNAUTHORIZED`
      com `created_at` completo; (b) a conversa do Ronaldo; (c)
      `select count(*) from conversation_state where collected_data ? 'agenda_registro'` (esperado:
      **0**); (d) o `collected_data` do Ronaldo inteiro. **Se algum número divergir do §1 desta
      story, publicar OS DOIS com o método** — não sobrescrever o meu.
- [ ] **T1** — `RegistroAgenda` + `MAX_OFERTAS` + `readRegistroAgenda`/`writeRegistroAgenda` em
      `agenda-state.ts`; remover os dois campos reservados de `AgendaState` e de `parseAgendaState`;
      exportar no barrel. **Rodar `tsc` ANTES de qualquer outra edição** (AC1-ii).
- [ ] **T2** — `ofertasDoTurno` + os 7 `push` da tabela do §2 do Desenho.
- [ ] **T3** — o escritor único antes de `updateConversationState` (§3 do Desenho).
- [ ] **T4** — AC7 no `enrich-leads` (`omitAgendaKeys` / `omitLegacyAgendaKeys`) + os dois testes.
- [ ] **T4-b** — 🔴 **AC6-b:** o registro fora dos dois prompts de Haiku (`lead-memory.ts:79` e
      `haiku-enrichment.ts:90`), com os controles positivos. *(AC nova do @po; não confundir com a
      T4, que é o MERGE do cron — esta é o PROMPT.)*
- [ ] **T5** — ~~bloco do dedupe (AC8–AC10)~~ → **apenas a AC9** (metadata + `authorized_slot_utc`).
      AC8 e AC10 cortadas pelo @po. **Commit separado** mesmo assim: a AC9 é a única parte cujo
      destinatário é outra story.
- [ ] **T6** — testes: `pipeline-agenda-registro.test.ts` (AC2–AC6, AC6-b, AC9) +
      `agenda-state.test.ts` (AC4) + `enrich-leads/route.test.ts` (AC7). Fixtures com `id` em
      **formato uuid** — ver Armadilhas.
- [ ] **T7** — mutações, cada uma com a **forma escrita** e a **saída bruta colada**; árvore
      restaurada e `md5` conferido.
- [ ] **T8** — AC11 (suíte da raiz, tipos) e o plano de janela da AC12, com o responsável nomeado.

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/flows/agenda-state.ts` | 108-126 | os dois campos reservados, que **saem** daqui |
| " | 178-205 | `parseAgendaState` — remover as duas linhas de cópia condicional |
| " | 264-284 | `omitAgendaKeys` / `omitLegacyAgendaKeys` (AC7) |
| " | 293-297 | `hasAgendaFact` — **não tocar** (AC5) |
| `packages/ai/src/chat/pipeline.ts` | 724 | `authorizedSlotUtc`; `ofertasDoTurno` nasce ao lado |
| " | 738-750 | leitura do estado no início do turno — o registro é lido aqui também |
| " | 900-1029 | os 7 sítios de coleta |
| " | 1134-1171 | a guarda (AC9) |
| " | **1611** | `atualizarResumoComLastro({ …, collectedData: finalData })` — **sítio 2 da AC6-b** |
| `packages/ai/src/flows/lead-memory.ts` | **79** | `DADOS COLETADOS: JSON.stringify(collectedData)` — **AC6-b (i)** |
| `packages/ai/src/flows/haiku-enrichment.ts` | **90** | `Dados ja coletados: JSON.stringify(currentCollectedData)` — **AC6-b (ii)** |
| `packages/ai/src/memory/loader.ts` | 195 | o fallback do `ai_summary` — o retorno do caminho da AC6-b ao prompt |
| " | 1541 | `saveMessages` — **depois** da guarda: por isso não há `message_id` |
| " | 1544 | `updateConversationState` — o escritor entra imediatamente antes |
| `packages/ai/src/flows/qualification.ts` | 15-24, 50 | peso 20 e `fieldIsCollected` — **0 linhas de diff** |
| `packages/web/src/app/api/cron/enrich-leads/route.ts` | 152, 164 | o merge da segunda esteira |

### Armadilhas

1. 🔴 **Fixture com `id` sequencial dá verde por acidente.** O gate da 87-8 provou: com `id`
   zero-padded (`msg-01`…`msg-25`) a ordem por `id` **coincide** com a ordem por `created_at`, e o
   teste fica verde sem nunca exercitar a ordenação. **Em produção `messages.id` é `uuid`**
   (conferido em `information_schema` hoje) e as duas ordens concordam em **0 de 20**. Usar ids em
   formato uuid nas fixtures.
2. **`createFakeSupabase` empilha os predicados de verdade** — `eq`, `in`, `gt`, `lt`, `is`, `or` e
   a **lista** de `.order()`. O @qa provou por mutação. Não escrever mock novo.
3. **O estado é lido no início do turno e escrito no fim.** O dedupe da AC8 compara contra o registro
   do turno **anterior**; escrever antes da guarda inverteria o sinal e a supressão comeria o
   primeiro alerta.
4. **`ofertas_do_sistema` é SUBSTITUÍDA, não acumulada.** Oferta de turno passado não é oferta viva;
   acumular transformaria o campo num histórico e o `W3-2e` resolveria o `"Ok"` contra um horário de
   três dias atrás.
5. **Não emitir evento de expiração do registro.** Justificado no §1 do Desenho.
6. 🔴 **O estado do Ronaldo em produção tem `visit_proposed = true` e `qualification_step = 'view'`**
   (medidos pelo @po em 10/08, `conversation_id c3eb7ee1-a1ac-4b33-8b5f-2ff34c051b9e`). Se a fixture
   literal dele for usada em qualquer asserção sobre o `system` (AC6), o bloco `CONVERSATION CONTEXT`
   real traz **também** a linha *"VOCE JA PERGUNTOU AO CLIENTE SOBRE A VISITA…"*. Não é regressão —
   é o estado verdadeiro. Não "consertar" a fixture para tirá-la.

### Fronteiras com outras stories

| story | fronteira |
|---|---|
| **87-4** (em prod) | Dona do `AgendaState`. Esta story **remove dois campos optional que ninguém lê** e não toca em mais nada dela. `hasAgendaFact`, `isPendencia`, TTL e `stripLegacyAgendaKeys` intocados |
| **87-11** (`W1-6`) | **Pré-requisito de deploy.** AC6 |
| **87-9** (canal do alerta) | Dona do ciclo de vida do alerta, incluindo **fechar**. A AC9 entrega a metadata que ela precisa |
| **87-3** (em prod, cron nunca rodou) | `visit-slot.ts` e `agenda-reconcile.ts` **não são tocados** — o baseline de lastro não pode se mexer |
| **W3-2e** (Onda 3) | Único leitor autorizado, e só de `ofertas_do_sistema` |
| **Epic 88 · 88-7** | Depende só desta metade de escrita — *"basta o gatilho saber que existe oferta viva"* |
| **W2-3 / W3-2c** | Donos do terceiro defeito do §1 (ela confirma o que o `[SISTEMA]` recusou) |

### 🔴 Achado fora de escopo — **RESOLVIDO pelo @po em 10/08: vai para a `87-12`**

`flows/handoff.ts:138` monta o resumo que o **corretor lê** com
`formatBoolean(collectedData.visit_availability)`. A `87-4` **apaga** `visit_availability` no primeiro
turno tocado (`stripLegacyAgendaKeys`) e não substituiu esta leitura.

> **Decisão do @po: hotfix próprio (`87-12`, a criar pelo @sm), e ele entra ANTES da `87-5 A` na
> fila.** Não é emenda em nenhuma das duas stories: (a) estas são o 5º e o 6º deploy com ≥24 h entre
> cada, e pendurar aqui atrasa um defeito vivo em ≥3 dias; (b) é regressão de story **já em
> produção** e precisa ser revertível sozinha; (c) a superfície é **o corretor**, não a Nicole —
> outro blast radius, outro gatilho de rollback.
>
> **Raio de alcance medido (corrige o "todo handoff de lead já tocado"):** 9 `conversation_state`
> atualizados desde o deploy da 87-4, **0** com chave legada; `NICOLE_AGENDA_STATE_LEGADO_DESCARTADO`
> = **0 all-time**; 56 conversas com o formato legado **intactas e dormentes**; **1** com o formato
> novo (Ronaldo). **Hoje o dano é 1 lead — e 100 % dos que vierem.** É defeito de dano crescente:
> quanto mais a 87-4 funciona, mais ele aparece.
>
> **Moldura que o @po acrescenta:** a 87-4 **migrou um leitor e esqueceu o outro** —
> `dashboard/leads/[id]/page.tsx:192-203` já trata o formato novo, com comentário explícito. O painel
> foi migrado; o resumo do corretor, não.
>
> **Conserto:** `hasAgendaFact(collectedData)`; **melhor ainda**, quando houver `agenda_state`,
> imprimir a **`citacao`** (*"3ª feira às 17:30 — nas palavras do lead, não é visita marcada"*). A
> `citacao` existe exatamente para isso, por docstring da 87-4.
>
> **Não entra no hotfix:** `flows/detect-appointment.ts:71` (`visit_availability === true` sobre um
> campo que sempre foi string — sinal morto desde **antes** da 87-4; ligá-lo é caminho de decisão
> novo). Fica no backlog.

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| 1 | Chave nova em `collected_data` chega ao modelo como JSON cru e vira lista de horários afirmáveis | **Alta se a ordem inverter** | `87-11` como pré-requisito de deploy + **AC6** |
| 2 | `afirmado_pela_nicole` (≈1 erro em 5) vira insumo de decisão por acidente na Onda 3 | **Média** | AC3-(iii) prova write-only hoje; o comentário do tipo é normativo; `W3-2e` lê só `ofertas_do_sistema` |
| 3 | Remover os dois campos de `AgendaState` quebra algum consumidor | **Baixa** | AC1-(ii): `tsc` em 0. Produção tem **1** `agenda_state` e ele não tem os campos |
| 4 | O registro engorda `collected_data` a cada turno | **Baixa** | `MAX_OFERTAS = 6`, TTL de 48 h, substituição em vez de acúmulo. Hoje a mediana de `collected_data` é **46 chars** e o total do banco **29.487 chars** em 254 linhas |
| 5 | O dedupe suprime um alerta legítimo | **Média** | Fail-open (AC10), controle negativo (AC8-iii), `_REPETIDO` contável — **a supressão nunca é silêncio** |
| 6 | A precisão do `detectAffirmedSlot` está publicada em dois valores divergentes | **Baixa** | Registrado no §3 com as duas leituras e o método; nenhuma decisão desta story depende dele |
| 7 | A escrita roda no caminho quente do turno | **Baixa** | Zero I/O novo: só mutação de objeto em memória, dentro do upsert que já existe |

## Critério de rollback — escrito ANTES do deploy

Reverter o PR (o escritor é aditivo; nenhuma migration) se, em 24 h:
1. **um** lead pedir visita e não receber horário;
2. `M1` ou `M4` subirem na consulta da 87-3 rodada à mão;
3. `qualification_score` médio de conversas ativas deslocar (a AC5 diz que não pode);
4. `NICOLE_SLOT_UNAUTHORIZED` **desaparecer** num período com afirmação sem slot autorizado —
   silêncio é pior que duplicata. *(Com a AC8 cortada não há supressão nenhuma no código desta
   story; este gatilho vira detecção de regressão acidental na AC9, que mexe na metadata do mesmo
   `emit`.)*

**Responsável nomeado: Marcos** (D7, fechado em 09/08). **Sem nome, não sai.**

---

## Definition of Done

- [ ] AC1–AC7, **AC6-b**, **AC9** e AC11 verdes, com os vermelhos **colados** e a forma de cada
      mutação escrita ao lado
- [x] AC8–AC10 verdes **ou** cortadas por escrito pelo @po (não por omissão) → **AC8 e AC10
      CORTADAS por escrito** (@po, 10/08, §4 do Desenho). **AC9 mantida** e ampliada
- [ ] T0 remedido, com as consultas coladas ao lado de cada número
- [ ] `git diff` de `qualification.ts`, `visit-slot.ts` e `agenda-reconcile.ts` = **0 linhas**
- [ ] Suíte da raiz com delta explicado; `tsc` 0 em `packages/ai`
- [ ] Fila de deploy respeitada: `87-12` → `87-5 A` → `87-5 B` → **`87-11`** → **`87-10`**, ≥24 h
      entre cada
- [ ] Plano da janela (AC12) escrito com responsável nomeado **antes** do merge

---

## Referências

- Epic 87 §7/Onda 1 (`W1-2c`) e o bloco *"O `W1-2c` foi DIVIDIDO em 07/08"* — a arbitragem escrita
- `docs/qa/po-validation-87-3-87-4.md` §3 — a divisão escrita × leitura e a tabela de confiança
- `docs/qa/po-validation-87-6-87-7-87-8.md` §1 — canal morto, `87-9`, e o requisito do notificador
- `docs/qa/gates/87.8-*.yml` — armadilhas de fixture (V4, V6), nota de processo `P1`
- `docs/qa/gates/87.7-*.yml` — régua com contagem de acidente ao lado, par de fixtures
- `packages/ai/src/flows/agenda-state.ts:108-126` — a reserva que esta story resolve

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

*(a preencher pelo @dev)*

## QA Results

*(a preencher pelo @qa)*

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-10 | v0.1 | Criação. Escrita apenas (`W1-2c`); leitura permanece no `W3-2e`. Decisão de desenho: os dois campos saem do `AgendaState` para a chave irmã `agenda_registro`, com a prova medida de que o envelope é apagado nos ramos que produzem `authorizedSlotUtc` e de que criar envelope quebraria dois gates. Dedupe do alerta INCLUÍDO como bloco separável (AC8–AC10) com justificativa; fechamento do alerta EXCLUÍDO e roteado para a `87-9` + `87-3`, com justificativa. Todas as medições contra produção em 10/08. | @sm (River) |
| 2026-08-10 | v0.2 | **Validação: GO condicionado. `Draft` → `Ready`.** Parecer: `docs/qa/po-validation-87-10-87-11.md`. **(1) Chave irmã RATIFICADA** — as três premissas reconferidas no código, incluindo a inexistência de terceira opção (um `agenda_state` inválido de propósito não sobrevive ao `writeAgendaState(cd, null)`). **(2) AC1-(ii) REESCRITA:** a prova original é falsa e eu a executei — a remoção produz **exatamente 2 erros `TS2339` em `agenda-state.test.ts:48-49`** (o `tsc` cobre `src/`, e os testes moram lá); a AC passa a exigir as três saídas coladas e a remoção do caso de teste. **(3) AC6-b NOVA** — `agenda_registro` chega ao modelo por **outros dois caminhos** que ninguém mapeou (`lead-memory.ts:79` → `ai_summary` → `loader.ts:195` → prompt; e `haiku-enrichment.ts:90`, o cron que é último escritor de 70 % dos estados). A `87-11` fecha só o sítio 1; sem a AC6-b a palavra *write-only* é falsa em produção. **(4) AC8 e AC10 CORTADAS por escrito** — a AC8 põe um leitor na chave que só foi aprovada por não ter leitor, sobre denominador de 1 caso all-time; o dedupe vai para a `87-9` como `select` em `system_events`, viabilizado pela AC9. `alerta_sem_lastro` sai do `RegistroAgenda`. **(5) AC9 MANTIDA** + `authorized_slot_utc: null` explícito. **(6)** Precisão do `detectAffirmedSlot` **remedida**: 71,9 % estrito / 81,3 % frouxo, n = 32 disparos em 1.172 mensagens (60 d); as duas leituras publicadas usavam o mesmo denominador (30) — a divergência era de **classificação**. **(7)** O achado do `handoff.ts:138` vira **`87-12`**, hotfix próprio no **início** da fila. **(8)** Terceiro defeito do caso Ronaldo: `W3-2c` confirmado como dono da **regra**, `W2-3` **não** é o dono (a detecção já existe e já rodou); falta ao epic o item que faz a regra **agir** — proposto ao @pm. | @po (Pax) |
