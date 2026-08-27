# Story 87-17 — A oferta de horário para de colar no meio-dia, e "mais tarde" para de virar eco de uma lista morta

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** InProgress
**Progresso:** **Fatia 1 (Defeito A, `T0`-`T3`) IMPLEMENTADA** por @dev em 2026-08-27 — `AC1`-`AC4` e `AC10`
verdes, aguardando `@qa` + PR. **Fatia 2 (Defeito B, `T4`-`T8`) NÃO começou** — é o PR 2, depois da
Fatia 1 em produção.
**Item do roadmap:** **fora da matriz `W1`–`W4` original** — story corretiva aberta por evidência de
produção de 26/08/2026, mesma família dos itens de "confiabilidade de contexto".
**🎯 Decisão de fronteira do §4 ARBITRADA pelo @po em 27/08: opção (i).** Esta story **não escreve e
não lê** `ofertas_do_sistema` nem `afirmado_pela_nicole`. A `87-10` (`W1-2c`) continua **dona dos
sete sítios**, de `afirmado_pela_nicole`, das proteções de prompt (`AC6`/`AC6-b`) e da migração para
a chave irmã `agenda_registro` — **nada dela muda por causa desta story**. O **Defeito B continua no
escopo**, porque a arbitragem dissolveu a dependência em vez de bloquear o defeito: a resposta ao
"mais tarde" sai de um **recálculo feito no próprio turno**, não da memória da oferta. Parecer
completo: `docs/qa/po-validation-87-17.md`.
**Criada por:** @sm (River) em 2026-08-27 · **ACs e escopo revisados por:** @po (Pax) em 2026-08-27
(blocos marcados **`[@po 27/08]`**)
**Formato:** Correção de dois defeitos com uma raiz comum (a Nicole nega ou some com horários que
o sistema TEM), medidos na mesma conversa de produção. **Os dois são determinísticos e sem campo
novo:** o A reordena o que já se calcula; o B passa a recalcular no turno em que o lead pergunta,
em vez de deixar o modelo reafirmar a lista velha do histórico. **Nenhum campo novo, nenhuma
migration, nenhuma leitura de campo reservado.**
**Executor:** @dev · validação em produção: @qa + responsável nomeado (D7)
**Esforço:** **S** (Defeito A) + **S/M** (Defeito B) — **duas fatias, dois PRs**, na ordem A → B
**Risco:** **Baixo** (Defeito A — reordena candidatos já calculados, não muda quando/se algo é
ofertado; o custo real é latência, e a `AC4` põe teto nela) / **Baixo-Médio** (Defeito B — um `if`
novo num ramo que hoje não injeta dado nenhum, sem estado novo, com guarda de mesmo-dia na `AC6`)
**Fila de deploy do Epic 87:** **fora dela.** Esta story não toca `agenda_registro`, nem os campos
reservados, nem os três despejos crus de `collected_data` — logo **não** entra em
`#428 (87-11) → #429 (87-12) → #431 (87-16) → 87-10`. Conflito **textual** em `pipeline.ts` com
`#428`/`#431` é possível e é resolução de merge, não de ordem.

> ### O que esta story faz, em uma frase
>
> Hoje `freeSlotsInPeriod` sempre devolve os **três primeiros** horários livres de um período —
> por isso "à tarde" nunca passa de 12h/12h30/13h — e quando o lead pede "mais tarde" o pipeline
> cai num ramo que **não gera lista nenhuma**, deixando a Nicole reafirmar a lista velha como se
> fosse definitiva mesmo quando ela é factualmente falsa. Depois desta story, a oferta cobre o
> período inteiro, e "mais tarde" passa a ser respondido com uma verdade **recalculada no próprio
> turno** — "o último horário livre desse período é X, não tem nada depois dele" — em vez de o
> modelo reafirmar a lista velha como se fosse o universo. **`[@po 27/08]` Nunca uma lista nova de
> horários "ainda não oferecidos": depois do Defeito A a oferta já vai até o FIM do período, então o
> que sobra é mais CEDO, não mais tarde — oferecê-lo como "mais tarde" seria trocar uma mentira por
> outra (ver §4-bis).**

---

## Story

**Como** engenharia da Trifold, que mediu contra produção uma conversa em que a Nicole disse
*"os horários disponíveis à tarde são esses mesmo: 12h, 12h30 ou 13h"* enquanto 15h, 17h e outros
estavam livres,
**Queremos** que a oferta de horários de um período cubra o período inteiro (não só a borda de
abertura) e que um pedido de "mais tarde" produza horários novos em vez de reafirmar os mesmos três
de sempre,
**Para que** a Nicole pare de inventar indisponibilidade — a classe INVERSA do agendamento fantasma
que a 75-245/87-4 fecharam: ali o sistema inventava disponibilidade que não existia; aqui ele nega
disponibilidade que existe.

---

## Context

### 1. 🔴 A evidência — conversa da Ana, 26/08/2026, WhatsApp

**Medido contra produção** (`dsopqkqjkmhytudaaolv`, Management API, somente SELECT). Conversa
`02d3a064-0271-4e34-b64a-c6ecd57ddae0`, lead Ana (`eaaad91c-c5ce-4fe2-9a97-dbd49f5ae684`), org
`00000000-0000-0000-0000-000000000001`. Horários em UTC:

```
22:10:40  ANA     Queria ver o showroom dele / Teria como?
22:10:57  NICOLE  [endereço da sede] Qual dia e horário ficam melhor pra você? A gente atende de
                  segunda a sexta das 8h às 18h e sábado das 8h às 12h.
22:14:36  ANA     Amanhã pode ser a tarde ?
22:14:48  NICOLE  Tenho alguns horários disponíveis amanhã à tarde: 12h, 12h30 ou 13h. Qual fica
                  melhor pra você, Ana?
22:22:22  ANA     Mais tarde não tem ?
22:22:33  NICOLE  Amanhã os horários disponíveis à tarde são esses mesmo: 12h, 12h30 ou 13h.
                  Algum deles funciona pra você?                                    🔴 A MENTIRA
22:41:50  ANA     12
22:42:01  NICOLE  Anotado, Ana! Te espero amanhã, quinta-feira, às 12h aqui na sede da Trifold.
```

**Fato verificado no banco**, dia 27/08/2026, equipe `house`: existia **um único** compromisso —
16:00 BRT, `status=scheduled`, criado em 18/08 por `admin`. No instante das 22:22 UTC (19:22 BRT de
26/08), os inícios LIVRES da tarde de 27/08 eram: **12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00
e 17:00** (15:30/16:00/16:30 ficam ocupados porque a visita de 60 min das 16h colide com os três).
A frase *"os horários disponíveis à tarde são esses mesmo: 12h, 12h30 ou 13h"* é **factualmente
falsa** — 15h e 17h estavam livres e nunca chegaram a ser considerados.

**O agendamento final saiu correto** (`appointments.a479011c-9fde-4ee2-928b-15e5c713aafe`,
`scheduled_at = 2026-08-27T15:00:00+00:00` = 12h BRT, `created_by = nicole`). **O defeito é só na
OFERTA, não no INSERT** — é a razão de esta story não tocar `evaluateSlot`/`checkSlotAvailability`.

> **Por que isto é a classe INVERSA do agendamento fantasma:** a 75-245/87-4 fecharam o caso em que
> o sistema **inventa** disponibilidade que não existe. Aqui o sistema **nega**, na voz da Nicole,
> uma disponibilidade que existe. As duas são "a Nicole afirma o que o sistema não sabe" — só que
> uma inventa `true` e a outra inventa `false`.

### 2. Defeito A — a oferta de "tarde" (e de "manhã") cola sempre na borda de abertura

`packages/ai/src/flows/visit-slot.ts`, `freeSlotsInPeriod` (linha 633):

```ts
export async function freeSlotsInPeriod(
  supabase, orgId, day, period, now, excludeAppointmentId?, limit = 3
): Promise<Date[]> {
  const { fromMin, toMin } = PERIOD_BOUNDS[period]
  const lastStart = Math.min(toMin, close * 60) - VISIT_DURATION_MIN
  const free: Date[] = []
  for (let m = Math.max(fromMin, OPEN_HOUR * 60); m <= lastStart; m += SLOT_STEP_MIN) {
    if (free.length >= limit) break                    // 🔴 PARA nos 3 primeiros
    const candidate = brtToUtc(day.y, day.m, day.d, Math.floor(m / 60), m % 60)
    if (candidate.getTime() <= now.getTime()) continue
    if (await isSlotFree(supabase, orgId, candidate, excludeAppointmentId)) free.push(candidate)
  }
  return free
}
```

Com `PERIOD_BOUNDS.tarde = { fromMin: 720 (12h), toMin: 1080 (18h) }` (linha 293) e `limit = 3`, o
laço varre de 30 em 30 min **a partir das 12h** e **para** assim que encontra três horários livres.
Com agenda vazia — o caso comum — o resultado é **sempre** `[12:00, 12:30, 13:00]`. O mesmo vale
para `manha` (`PERIOD_BOUNDS.manha = { fromMin: 480 (8h), toMin: 720 (12h) }`): a oferta é sempre
`[8:00, 8:30, 9:00]`. Quem pede "à tarde" nunca vê 15h/16h/17h — e 12h nem soa como tarde para quem
pergunta. **Isto não depende de haver ou não compromisso algum: é geométrico ao algoritmo.**

> **`[@po 27/08]` — duas contagens corrigidas, e uma delas é insumo de AC.** O período tem
> `lastStart = min(toMin, close·60) − 60`, então: **`tarde` = 11 candidatos** (12:00 … 17:00, ✅ como
> a story diz) e **`manha` = 7**, não 8 (8:00 … **11:00**, não 11:30). O 8 aparece duas vezes no
> documento (aqui e no §1 do Desenho) e entra na `AC2` — corrigido nos três sítios. *(Nota de
> processo `P1` do gate da `87-8`: contagem declarada que não sobrevive à remedição é o defeito
> recorrente deste epic.)*

**No caso Ana:** o dia tinha 8 candidatos livres (12:00 … 15:00, 17:00, todos os 30 min do
intervalo 12h–17h exceto o bloco 15:30–16:30 ocupado). `freeSlotsInPeriod` devolveu exatamente os
3 primeiros — 12:00, 12:30, 13:00 — e nunca chegou a considerar 14h, 14:30, 15h ou 17h.

### 3. Defeito B — "mais tarde" cai num ramo cego, e o modelo reafirma a lista velha

`parsePeriodParts` (`visit-slot.ts`, linha ~310) devolve `null` **de propósito** para "mais tarde":

```ts
if (/\bmais\s+tarde\b/.test(t)) return null   // "mais tarde" = depois, não é o período da tarde
if (/\btarde\b|\btardinha\b/.test(t)) return "tarde"
```

Isto está certo semanticamente — "mais tarde" não é "de tarde" — mas tem uma consequência que
ninguém tratou. No turno da Ana, `"Mais tarde não tem ?"` chega ao `packages/ai/src/chat/pipeline.ts`
com: `day` **herdado** do turno anterior (via `agendaState`, `fonte: "pendencia"`, porque o dia
"amanhã" já tinha sido resolvido e persistido no turno de `"Amanhã pode ser a tarde?"`), `time =
null` (nenhuma hora explícita), `period = null` (por causa da regra acima). A cadeia de `if` do
pipeline (linhas 1101-1131):

```ts
if (day && time) { … }
else if (day && period) { … }
else if (day && !time) {                        // 🔴 é ESTE que "mais tarde" cai
  guardarAgenda({ dataAbsoluta: dayPartsToIso(day) })
  messageWithContext = sistema(
    `O cliente indicou o dia (${formatBrtDay(day)}) mas não o horário. Pergunte qual horário ` +
    `prefere (atendemos seg–sex 8h–18h, sáb 8h–12h). NÃO afirme nenhum horário.`
  )
}
```

Este ramo **não injeta lista nenhuma** — nem a antiga, nem uma nova. Ele só instrui *"pergunte o
horário"*. O modelo, sem dado fresco no bloco `[SISTEMA]`, olha o histórico da conversa (onde a
LISTA ANTERIOR de 12h/12h30/13h ainda está, na sua própria fala anterior) e a reafirma como se
fosse exaustiva — **"os horários disponíveis à tarde são esses mesmo"** — porque é a única
informação que tem. **O sistema não mentiu ativamente: ele calou, e o modelo preencheu o silêncio
com a memória de uma resposta que já estava errada (Defeito A) e agora também está velha.**

> **Isto não é falha de instrução ("NÃO afirme nenhum horário") — a instrução até foi seguida
> ("Algum deles funciona pra você?" é pergunta, não afirmação categórica de agendamento). O defeito
> é a Nicole ter descrito um subconjunto do passado como o universo do presente.** É a mesma lição
> que a 87-4 já registrou noutro contexto: guardrail em prompt não substitui o sistema entregar o
> dado certo.

### 4. ~~A dependência com a `87-10`~~ — o que o @sm propôs, **RESOLVIDO na §4-bis** (registro histórico)

Consertar o Defeito B de verdade — responder "mais tarde" com horários **genuinamente novos**, não
com a mesma lista recalculada — exige saber **quais horários específicos já foram oferecidos** no
turno anterior. `AgendaState.periodo` (já escrito hoje, `pipeline.ts` no ramo `day && period`) diz
que a Ana pediu "tarde", mas não diz **quais três** já foram mostrados. Sem esse dado, um "mais
tarde" recalculado ingenuamente devolveria — mesmo depois do conserto do Defeito A — a mesma lista
de sempre para o mesmo dia+período, porque a função é determinística.

**O campo certo já existe, reservado, e é exatamente este:** `ofertas_do_sistema?: string[]` em
`packages/ai/src/flows/agenda-state.ts` (linha 125), com o comentário *"Reservados pela Story do
item `W1-2c`. NADA escreve e NADA lê hoje"*, confiança **ALTA** porque deriva de
`authorizedSlotUtc`/`freeSlotsInPeriod` — valor que o sistema calculou, não prosa parseada. Quem é
dono desse campo é a **Story 87-10** (`W1-2c`, metade de ESCRITA), hoje **Status: Ready — não
implementada, não implantada**, com ordem de deploy rígida (`87-12 → 87-5 A → 87-5 B → 87-11 →
87-10`) e duas stories da fila (`87-11`, `87-12`) que **nem existem como arquivo**.

A `87-10` já desenhou **sete sítios** de escrita para `ofertas_do_sistema` (§2 do Desenho dela):

| # | ramo (numeração da `87-10`) | ramo (código de hoje, `pipeline.ts`) | o que entra |
|---|---|---|---|
| 1 | remarcar, horário livre | 906-909 | `newStartUtc` |
| 2 | remarcar, horário ocupado | 910-913 | `alternatives` |
| 3 | período com visita ativa | 1044 (`if (nPeriod)`) | `slots` de `freeSlotsInPeriod` |
| 4 | sem pedido de mudança, reconfirma | 941-944 | `apptWhen` |
| 5 | agendar, horário livre | 994-1000 | `startUtc` |
| 6 | agendar, horário ocupado | 1001-1004 | `alternatives` |
| **7** | **dia + período, sem visita ativa** | **1120-1127 (`day && period`)** | **`slots` de `freeSlotsInPeriod`** |

**O sítio nº 7 é exatamente o ramo do turno `"Amanhã pode ser a tarde?"` da Ana.** É o único sítio
que este defeito precisa, e é o único que esta story propõe tocar.

> ### ⚖️ Decisão de fronteira — **RATIFICADA em 27/08 como opção (i)**; o que segue é o texto original do @sm, mantido como registro
>
> **(i) 87-17 depende da 87-10; o Defeito B fica bloqueado até ela subir.** Mais simples, mais
> disciplinado quanto a não pisar em escopo alheio. **Custo:** o Defeito B — que produziu a mentira
> medida nesta story, não uma mentira hipotética — fica sem previsão, atrás de uma fila de quatro
> deploys (`87-12`, `87-5 A/B`, `87-11`) que ainda não têm arquivo.
>
> **(ii) 87-17 escreve `ofertas_do_sistema` APENAS no sítio nº 7 (o único que este defeito usa),
> com as mesmas proteções de prompt que a `87-10` desenhou para o campo inteiro.** **Esta é a
> recomendação do @sm.** Não é reabrir o formato: é implementar **um item** de uma lista de sete
> que já está aprovada em desenho (a `87-10` foi `RATIFICADA pelo @po em 10/08` quanto à existência
> e à confiança do campo — ver `docs/stories/87-10-estado-registra-oferta-e-afirmacao.story.md`
> §3/§4). A `87-10`, quando executada, continua dona: dos outros seis sítios, de
> `afirmado_pela_nicole`, do `AC7` (filtro no `enrich-leads`), do `AC9` (metadata de dedupe) e da
> migração do campo para a chave irmã `agenda_registro`.
>
> **(iii) O Defeito B deriva o teto da última fala da Nicole (parsear a prosa dela para saber o que
> foi oferecido).** **@sm REJEITA esta opção.** É exatamente o que o comentário de
> `afirmado_pela_nicole` proíbe: *"WRITE-ONLY: observabilidade apenas. NUNCA é insumo de decisão"* —
> precisão medida em 71,9% estrito / 81,3% frouxo (`87-10`, remedição do @po de 10/08). Usar a
> prosa dela como fonte de "o que já foi oferecido" reintroduziria, com um nome novo, o mesmo
> defeito de procedência que a `87-4` fechou para o lado do LEAD (fato de agenda sem citação de uma
> mensagem `role='user'` não pode virar estado) — só que agora do lado do SISTEMA.
>
> **Consequência que a opção (ii) tem e que precisa ir para o registro da `87-10`/epic (ação do
> @po, não desta story):** a prova de "risco zero" da `AC1-(ii)` da `87-10` — *"produção tem ZERO
> registros com os dois campos"* — deixa de ser verdadeira assim que esta story subir. Quando a
> `87-10` migrar o campo para `agenda_registro`, ela vai encontrar registros vivos escritos por esta
> story. **Isto não é um problema de dado a migrar**: o campo tem TTL de 48 h (o mesmo
> `TTL_AGENDA_STATE_HORAS` que rege todo `AgendaState`), e volume é baixo (pedidos de período sem
> visita ativa). O efeito prático é só: qualquer conversa tocada por esta story deixa de ter oferta
> viva depois de 48 h, mesmo sem a `87-10` ter subido — o pior caso é o fallback do `AC6` desta
> story (comportamento de hoje, sem lista). **Mas a `87-10` precisa remedir a premissa e escrever
> por cima do "ZERO" antes de reusar aquela prova.**
>
> ⚠️ **`[@po 27/08]` — este parágrafo fica no registro como o que foi PROPOSTO, e está VAZIO de
> efeito: a opção (ii) não foi ratificada. Nenhuma ação recai sobre a `87-10`. Ver a arbitragem
> abaixo.**

### 4-bis. 🎯 `[@po 27/08]` ARBITRAGEM — opção **(i)**: os campos reservados continuam sem escritor e sem leitor

**Decisão: (i).** A `87-17` **não escreve e não lê** `ofertas_do_sistema` nem
`afirmado_pela_nicole`. A `87-10` continua dona dos **sete** sítios, e **nada nela muda** — a
`AC1-(ii)` dela (o `tsc` com exatamente 2 erros em `agenda-state.test.ts:48-49`) e a premissa de
"zero registros" seguem **válidas e sem remediação**.

**E a opção (i) NÃO bloqueia o Defeito B.** O que eu rejeito é o *mecanismo*, não o conserto: a
premissa de que "responder 'mais tarde' exige saber quais horários já foram oferecidos" **é falsa**
depois do Defeito A. Os três motivos, na ordem em que pesam:

**1. 🔴 O motivo que decide sozinho: a opção (ii) faz a Nicole chamar de "mais tarde" um horário
mais CEDO.** O filtro proposto é `todos.filter(d => !jaOfertados.has(d))` — isso é *"ainda não
oferecido"*, **não** *"mais tarde do que o oferecido"*. As duas coisas coincidem **só enquanto a
oferta é um prefixo do período** — ou seja, só enquanto o Defeito A existir. Depois do Defeito A,
`espalhar` **sempre inclui o último elemento** (`xs[xs.length−1]`), então a oferta vai até o FIM do
período e o que sobra é o **meio**. Na fixture da própria story: turno 1 oferece
`[12:00, 14:00, 17:00]`; a diferença de conjuntos é `{12:30, 13:00, 13:30, 14:30, 15:00}`;
`espalhar(…, 3)` devolve **`[12:30, 13:30, 15:00]`** — e o bloco `[SISTEMA]` proposto diz
literalmente *"O cliente quer um horário MAIS TARDE que os já oferecidos. Novos horários LIVRES:
12h30, 13h30, 15h"*. **Duas das três são mais cedo que as 17h que ela acabou de oferecer.** E a
`AC5` como estava escrita — *"não inclui nenhum dos três oferecidos"* — **ficaria VERDE** com essa
saída. Uma story que existe para a Nicole parar de dizer falsidade não pode embarcar uma falsidade
nova com o teste passando.

**2. A leitura de `ofertas_do_sistema` é `W3-2e`, Onda 3, por arbitragem minha anterior — e a
`87-10` diz, no cabeçalho, "Não restaurar a leitura para cá".** A opção (ii) não só escreve: ela
**lê** o campo para decidir o que oferecer. O `W1-2c` foi dividido justamente por isso
(`epic-87:750`, `po-validation-87-3-87-4.md` §3), e a ratificação da `87-10` está apoiada numa
garantia **categórica** que eu mesmo escrevi lá: *"se a garantia é 'ninguém lê', então nada pode
ler — nem para escolher o nível de um log"*. Foi essa frase que cortou a `AC8` da `87-10`. Abrir
exceção agora, para uma superfície muito maior do que um nível de log, invalida retroativamente
aquele corte. *(A leitura desta story é de classe de risco menor que a do `W3-2e` — ela não cria
`appointment` nenhum e todo horário oferecido é reconferido por `isSlotFree`. Não é a gravidade que
decide: é a categoria.)*

**3. A `87-10` REMOVE o campo de `AgendaState` — a opção (ii) escreveria num campo marcado para
deleção.** A `AC1` da `87-10` é literalmente *"`RegistroAgenda` existe e os dois campos **SAEM** do
`AgendaState`"*, para a chave irmã `agenda_registro` (decisão que eu ratifiquei em 10/08, porque
`writeAgendaState(cd, null)` apaga o envelope inteiro). O custo da (ii), portanto, **não** é
"remedir a premissa de zero registros": é **retrabalho garantido** do escritor, do leitor e dos
testes, mais o **pisão numa trava calibrada de propósito** — a `AC1-(ii)` da `87-10` diz *"Se
aparecer um terceiro erro, ou um erro em outro arquivo, **PARE**: existe um consumidor que ninguém
mapeou"*. A (ii) faria aparecer exatamente esse terceiro erro, e a trava passaria a acusar um
consumidor **mapeado** — que é o pior estado possível para uma trava: ainda dispara, e já não quer
dizer nada.

**A opção (iii) segue rejeitada**, pelo mesmo motivo que o @sm deu, e eu subscrevo sem ressalva:
parsear a prosa da Nicole como insumo de decisão é o defeito de procedência que a `87-4` fechou.

**Duas premissas do §4 corrigidas, porque elas sustentavam o custo da opção (i):**

| o §4 diz | medido em 27/08 |
|---|---|
| *"`87-11` e `87-12` **nem existem como arquivo**"* | **Existem, com código implementado, QA feito e story versionada — em PR aberto.** `#428` (`87-11`, `feat/87-11-collected-data-fora-do-prompt`, aberto em 16/08, *"MERGE SÓ DEPOIS DO #427"*) e `#429` (`87-12 · bloco A`). O `#427` (`87-5 B`) **já está em `main`**, logo o `#428` está liberado desde 18/08 — e continua aberto há **9 dias**. A fila é `#428 → #429 → #431 (87-16) → implementar a 87-10` |
| *"o Defeito B fica sem previsão atrás de quatro deploys"* | **Verdadeiro, e é o argumento mais forte da (ii)** — a fila está parada há 9 dias e a `87-10` nem começou. **É por isso que eu não escolho "(i) = Defeito B bloqueado": eu escolho "(i) = Defeito B sem a fila", que a §4-bis abaixo mostra ser possível sem campo nenhum** |

**O que substitui o campo: o recálculo.** No turno do "mais tarde", o pipeline já tem em mão o
`day` (herdado de `agenda_state.data_absoluta`, conferido em `visit-slot.ts:424`) e o
`agenda_state.periodo` — **campo vivo da `87-4`, escrito hoje pelo sítio 7 (`pipeline.ts:1120`) e
pelo sítio 3 (`:1042`), e sem leitor nenhum até agora**. Com os dois, `freeSlotsInPeriod` é
**determinística**: rodá-la de novo reproduz a oferta do turno anterior sem precisar tê-la
guardado, e — o que importa de verdade — devolve o **último horário livre do período**, que é
exatamente o teto contra o qual "mais tarde" se mede. A resposta honesta ao "mais tarde" não precisa
de memória: precisa de uma conta feita **agora**, contra o banco de **agora**. É subtração de
cegueira sem estado novo, e cabe na regra de corte da Onda 1 sem interpretação.

### 5. O Defeito A é independente, de risco baixo, e não deve esperar a decisão do §4

O Defeito A não escreve campo nenhum, não lê `AgendaState`, e não depende de nada desta story nem
da `87-10`. É reordenação pura de candidatos que `freeSlotsInPeriod` já calcula.

> ### ✅ `[@po 27/08]` CONFIRMADO, com duas precisões — e **autorização de fatiamento**
>
> **Confirmo: o Defeito A é independente, de risco baixo e sobe sozinho.** `T1`-`T2` **não têm
> gate** e **não entram na fila de deploy do Epic 87**. **@dev está autorizado a entregar em duas
> fatias, dois PRs, na ordem A → B** — a Fatia 1 (`T1`-`T2`, `AC1`-`AC4` + `AC10`) pode ir a
> produção sem esperar uma linha da Fatia 2. Se a Fatia 2 travar por qualquer motivo, a Fatia 1
> **fica**: ela já converte a mentira medida ("à tarde são esses mesmo: 12h, 12h30, 13h", com 15h e
> 17h livres) numa oferta que **cobre o período até as 17h** — e é a própria pergunta da Ana
> ("mais tarde não tem?") que deixa de ter motivo para existir.
>
> **Precisão 1 — "risco baixo" não é "raio de impacto de um sítio".** `freeSlotsInPeriod` tem
> **dois** chamadores em produção: `pipeline.ts:1123` (sítio 7, dia+período **sem** visita ativa —
> o caso da Ana) e `pipeline.ts:1044` (dia+período **com** visita ativa, o ramo de remarcação da
> `75-245`). O Defeito A muda o que a Nicole oferece **nos dois**. Isso é desejável e é a mesma
> correção — mas tem de estar escrito, e o teste do segundo sítio
> (`pipeline-agenda-state.test.ts:376`) só asserta a **presença** do bloco, então ele segue verde
> sem provar nada sobre o conteúdo. Ver `AC10`.
>
> **Precisão 2 — o custo do Defeito A não é risco de comportamento, é latência, e ele é real.**
> `isSlotFree` (`visit-slot.ts:552-574`) é **uma query ao `appointments` por candidato**. Hoje o
> laço para nos 3 primeiros: em agenda vazia são **3** idas ao banco. A forma proposta no §1 do
> Desenho verifica **todos** os candidatos antes de amostrar: **11** em `tarde`, **7** em `manha`,
> **sequenciais, dentro do caminho da resposta ao lead**. O @sm marcou o `Promise.all` como
> *"decisão do @dev, não é AC"* — **eu discordo e transformo o teto em AC (`AC4`)**, sem ditar a
> forma: uma consulta única da janela do período resolve em **1**, e o `Promise.all` resolve em
> profundidade 1. O que não pode passar é a story trocar meio segundo de latência em todo pedido de
> período por uma correção de duas linhas.

---

## Desenho

### 1. Defeito A — parar de andar do início e passar a amostrar o período inteiro

`freeSlotsInPeriod` passa a ter duas fases: (a) coletar **todos** os candidatos livres do período
(o período é limitado — no máximo 11 candidatos em `tarde`, **7** em `manha` **`[@po 27/08: eram 8]`**,
então isto não é uma varredura sem fim) e (b) amostrar `limit` deles **espalhados**, não os primeiros.

```ts
export async function freeSlotsInPeriod(
  supabase, orgId, day, period, now, excludeAppointmentId?, limit = 3
): Promise<Date[]> {
  const { fromMin, toMin } = PERIOD_BOUNDS[period]
  const lastStart = Math.min(toMin, close * 60) - VISIT_DURATION_MIN
  const candidatos: Date[] = []
  for (let m = Math.max(fromMin, OPEN_HOUR * 60); m <= lastStart; m += SLOT_STEP_MIN) {
    const candidate = brtToUtc(day.y, day.m, day.d, Math.floor(m / 60), m % 60)
    if (candidate.getTime() <= now.getTime()) continue
    candidatos.push(candidate)
  }
  const livres: Date[] = []
  for (const c of candidatos) {
    if (await isSlotFree(supabase, orgId, c, excludeAppointmentId)) livres.push(c)
  }
  return espalhar(livres, limit)
}

/** Amostra até `k` elementos de `xs`, espalhados do início ao fim (não os `k` primeiros). */
function espalhar<T>(xs: T[], k: number): T[] {
  if (xs.length <= k) return xs
  const idx = new Set<number>()
  for (let i = 0; i < k; i++) idx.add(Math.round((i * (xs.length - 1)) / (k - 1)))
  return [...idx].sort((a, b) => a - b).map((i) => xs[i])
}
```

Com os 8 candidatos livres da Ana (`12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 17:00`) e
`k = 3`: índices `round(0) = 0`, `round(3,5) = 4`, `round(7) = 7` → **`[12:00, 14:00, 17:00]`**.
A oferta passa a cobrir o período, sem deixar de ser determinística nem de respeitar
`isSlotFree`/`VISIT_DURATION_MIN`.

> **`[@po 27/08]` Nota de custo — deixou de ser não-normativa.** A fase (b) hoje verifica
> `isSlotFree` sequencialmente e para nos 3 primeiros; a versão nova verifica **todos** os
> candidatos do período antes de amostrar — até 11 chamadas em vez de até 3, **e cada uma é uma ida
> ao `appointments`** (`visit-slot.ts:552-574`), **dentro do caminho da resposta ao lead**. A
> **forma** continua do @dev (consulta única da janela do período, ou `Promise.all`); o **teto**
> virou `AC4`. Também é do @dev decidir se `espalhar` opera sobre `Date[]` ou índices — o que a
> `AC3` fixa é o comportamento, incluindo a guarda de `k ≤ 1` (a forma acima divide por `k − 1`).

### 2. `[@po 27/08 — REDESENHADO]` Defeito B — a resposta ao "mais tarde" sai de um recálculo, não de memória

> **O desenho original desta seção (escrever `ofertas_do_sistema` no sítio 7 e ler no "mais tarde")
> foi REPROVADO na arbitragem do §4-bis, por três motivos — o decisivo é que
> `filter(!jaOfertados)` responde "mais tarde" com horários mais CEDO depois do Defeito A. O que
> segue é o desenho ratificado. `detectWantsLaterSlot` e o ponto de interceptação são do @sm e
> ficam como estavam.**

**Detecção — inalterada.** Nova função exportada em `visit-slot.ts`, reaproveitando a MESMA regex
que `parsePeriodParts` já usa para excluir "mais tarde" da detecção de período:

```ts
/** Story 87-17 — o lead quer algo DEPOIS do que já foi oferecido neste período. */
export function detectWantsLaterSlot(text: string | null | undefined): boolean {
  if (!text) return false
  return /\bmais\s+tarde\b/.test(stripAccents(text).toLowerCase())
}
```

**Interceptação, no ramo `day && !time`.** Nenhuma escrita de campo novo, nenhuma leitura de campo
reservado. Os dois insumos já estão persistidos hoje: `day` vem de `agenda_state.data_absoluta`
(herança conferida em `visit-slot.ts:424`) e o período vem de `agenda_state.periodo` — campo vivo da
`87-4`, escrito pelos sítios `:1042` e `:1120`, **sem leitor até agora**.

```ts
} else if (day && !time) {
  const periodoVivo = agendaState?.periodo ?? null
  // Guarda de mesmo-dia: se o lead deu um dia NOVO neste turno, o período vivo era de outro dia.
  const mesmoDia = !fromMessage.day
  if (detectWantsLaterSlot(message) && periodoVivo && mesmoDia) {
    // A VERDADE É RECALCULADA AGORA, contra o banco de agora.
    const todos = await freeSlotsInPeriod(supabase, orgId, day, periodoVivo, now, undefined, MAX_CANDIDATOS_PERIODO)
    guardarAgenda({ dataAbsoluta: dayPartsToIso(day), periodo: periodoVivo })  // o período SOBREVIVE
    messageWithContext = todos.length
      ? sistema(`O cliente quer um horário MAIS TARDE. Nesse período (${...}), o ÚLTIMO horário livre é ${fmt(ultimo(todos))} — e NÃO existe nenhum livre depois dele. Diga isso com honestidade, sem repetir a lista anterior como se fosse "os únicos que existem", e ofereça outro período ou outro dia (seg–sex 8h–18h, sáb 8h–12h). NÃO afirme nenhum horário que não esteja nesta frase.`)
      : sistema(`O cliente quer um horário MAIS TARDE, e nesse período NÃO há mais nenhum horário livre. NÃO invente e NÃO repita a lista anterior. Avise com simpatia e ofereça outro período ou outro dia (seg–sex 8h–18h, sáb 8h–12h).`)
  } else {
    // comportamento de hoje, inalterado
    guardarAgenda({ dataAbsoluta: dayPartsToIso(day) })
    messageWithContext = sistema(`O cliente indicou o dia … NÃO afirme nenhum horário.`)
  }
}
```

**Por que "o último livre é X e não tem nada depois" é sempre a resposta certa, e não uma
simplificação preguiçosa.** Depois do Defeito A, `espalhar` **sempre inclui `xs[xs.length−1]`**
(invariante da `AC3-(iii)`): a oferta do turno anterior **já terminava no último horário livre do
período**. Logo "existe algo mais tarde do que o que te ofereci?" tem resposta **negativa por
construção** — e ela é dita a partir de um `freeSlotsInPeriod` executado **neste** turno, não da
memória do anterior. A recomputação é legítima porque a função é determinística sobre
(dia, período, `now`, `appointments`): entre os dois turnos só `now` avança (o que apenas **remove**
candidatos passados) e a agenda pode mudar (o que a recomputação **absorve**, em vez de ignorar).
**Nenhuma frase da Nicole passa a depender de dado velho.**

**O meio do período fica de fora, de propósito.** Os horários não amostrados (`12:30`, `13:00`,
`13:30`, `14:30`, `15:00` na fixture da Ana) **não** entram nessa resposta: eles são mais **cedo**,
e apresentá-los como "mais tarde" é a falsidade nova que a `AC5-(iii)` reprova. Quem quer `12:30`
diz `12:30` e cai no ramo `day && time`, que confere e agenda — caminho que **já funciona** e que
esta story não toca. Oferecer o meio do período sob um rótulo honesto ("tem outros horários nesse
mesmo período, mais cedo: …") é **melhoria de produto sem incidente medido** → fica de fora, no
"O que esta story NÃO faz".

`MAX_CANDIDATOS_PERIODO` é o mesmo teto geométrico do período (**11**) — não é número novo, é o
`limit` de `freeSlotsInPeriod` elevado o suficiente para cobrir o período inteiro. **A `AC4` vale
para esta chamada também:** ela é a mesma função, no mesmo caminho de resposta.

**Fallback sem período vivo.** Se `agenda_state.periodo` estiver `null` (a conversa nunca pediu um
período, ou o ramo `day && !time` de um turno intermediário já apagou o período — ele hoje grava só
`dataAbsoluta`), ou se o `AgendaState` tiver expirado (`readAgendaState` já apaga objetos vencidos
pelo TTL de 48 h — `agenda-state.ts:60`), ou se o lead deu um dia novo neste turno, cai-se no
comportamento de HOJE (pergunta o horário, sem lista). **Isto nunca regride: no pior caso, "mais
tarde" volta a produzir a resposta atual, não uma pior.**

---

### 3. `[@po 27/08 — CORTADO]` A proteção de prompt sai do escopo, porque o campo novo saiu

O @sm dimensionou uma `T5` que aplicaria `omitAgendaKeys`/`omitLegacyAgendaKeys` nos **três** sítios
que despejam `collected_data` cru num prompt. O argumento dele era condicional e correto:
*"a partir do momento em que esta story escreve `ofertas_do_sistema` … o risco deixa de ser
adiável"*. **A story não escreve o campo. A premissa caiu, e a `T5` cai com ela.** Os três sítios,
com dono e estado conferidos em 27/08:

| # | sítio | linha real | dono | estado |
|---|---|---|---|---|
| 1 | `pipeline.ts` — `` `Data collected so far: ${JSON.stringify(state.collected_data)}` `` | **2090** | `87-11` (`W1-6`) | **implementado, PR `#428` aberto e liberado desde 18/08** |
| 2 | `lead-memory.ts` — `` `DADOS COLETADOS:\n${JSON.stringify(collectedData, null, 2)}` `` | **79-80** (o §3 original dizia 106) | `87-10` / `AC6-b-(i)` | não implementado |
| 3 | `haiku-enrichment.ts` — `` `Dados ja coletados: ${JSON.stringify(input.currentCollectedData)}` `` | **106** ✅ | `87-10` / `AC6-b-(ii)` | não implementado |

**Os três continuam vazando `agenda_state` inteiro hoje — eu conferi, e o vazamento é real:** o
sítio 2 recebe `finalData` (`pipeline.ts:1878`, `collectedData: finalData`) e o sítio 3 recebe
`currentCollectedData: currentData` direto do banco (`enrich-leads/route.ts:127`), nenhum dos dois
filtrado. **Mas isso já é verdade no `HEAD` e esta story não piora em um byte.**

**E há um custo que a `T5` não media.** `omitAgendaKeys` não é bisturi: ela remove **cinco** chaves
(as quatro de `LEGACY_AGENDA_KEYS` **e** `agenda_state`). Aplicá-la no sítio 2 muda a entrada do
Haiku que escreve `ai_summary` — e `ai_summary` volta ao prompt da Nicole em **59,3 % dos turnos**
(medição do gate da `87-15`/`87-16`). Isto é exatamente a lição que a `87-16` me ensinou **contra
mim**: *"embarcar diff de prompt em 59,3 % dos turnos dentro de uma story de subtração"*. Se algum
dia a `AC6-b` for antecipada, ela vem com o denominador medido (quantas conversas vivas ainda
carregam as chaves legadas), e não como efeito colateral de uma story de oferta de horário.
**`AC8` passa a ser o controle negativo disso: os três sítios saem desta story com diff ZERO.**

---

## Acceptance Criteria

> **`[@po 27/08]`** As `AC1`-`AC3` são do @sm e ficam (com a contagem da `AC2` corrigida e a `AC3`
> ampliada). A `AC4` é **nova** (teto de latência). A `AC5`-`AC7` foram **reescritas** pela
> arbitragem do §4-bis. A `AC8` deixou de ser "o campo novo não vaza" e virou **controle negativo de
> escopo**. A `AC9` perdeu o item que falava do campo. A `AC10` ganhou os **três vermelhos
> nominados**. **Nenhuma AC é `🔒 Gated`: a decisão de fronteira está tomada.**

**AC1 — 🔴 Defeito A: a oferta cobre o período inteiro, com a fixture real da Ana.**
*Verifica-se:* `freeSlotsInPeriod` chamado com o dia 27/08/2026, período `"tarde"`, e o banco
semeado com exatamente o compromisso de 16:00 BRT medido em produção (excluindo 15:30–16:30) →
resultado é **`[12:00, 14:00, 17:00]`** (BRT), nesta ordem. **Vermelho contra o `HEAD`:** o mesmo
seed produz `[12:00, 12:30, 13:00]` hoje. Colar os dois.
*(Aritmética reconferida pelo @po: 8 livres → `k = 3` → índices `round(0) = 0`, `round(3,5) = 4`,
`round(7) = 7` → `12:00`, `14:00`, `17:00`. ✅)*

**AC2 — Defeito A: `manha` tem o mesmo defeito e o mesmo conserto. `[@po 27/08 — régua apertada]`**
*Verifica-se:* dia **sem nenhum** compromisso, período `"manha"` → os candidatos são
`8:00 … 11:00`, **7** no total (`lastStart = min(720, 1080) − 60 = 660 = 11:00`), e o resultado é
**`[8:00, 9:30, 11:00]`** — **asserção de sequência completa**, não *"inclui pelo menos um ≥ 10:00"*
como estava: a régua frouxa passaria com `[8:00, 8:30, 11:00]`, que ainda cola na borda.
**Vermelho contra o `HEAD`:** `[8:00, 8:30, 9:00]`. Colar os dois.

**AC3 — Defeito A: `espalhar` é testada sozinha, nos extremos, e a invariante que sustenta a AC5
está assertada. `[@po 27/08 — ampliada]`**
- **(i)** período com exatamente 2 candidatos livres → resultado é os 2, **em ordem cronológica**,
  sem amostragem (`xs.length <= k` devolve `xs`); e com 3 livres → os 3, idem;
- **(ii)** 🔴 **`k ≤ 1` não pode produzir `NaN`.** A forma do §1 do Desenho calcula
  `round(i·(n−1)/(k−1))` — em `k = 1` isso é divisão por zero. `limit` é **parâmetro público com
  default**, então a guarda é obrigatória: `espalhar(xs, 1)` devolve **exatamente 1** elemento (o
  primeiro) e `espalhar(xs, 0)` devolve `[]`. Nenhum `undefined` no array de saída, em nenhum caso;
- **(iii)** 🔴 **invariante de cobertura:** para `xs.length > k ≥ 2`, o resultado **sempre contém
  `xs[0]` e `xs[xs.length − 1]`**, e sai **ordenado e sem repetição** (o `Set` do desenho pode
  colapsar índices — o tamanho da saída pode ser `< k` e isso é aceitável, mas nunca com buraco nos
  extremos). **É esta invariante que faz "não existe nada mais tarde" ser verdade na `AC5`** —
  assertada explicitamente, nunca inferida das fixtures de `freeSlotsInPeriod`.

**AC4 — 🔴 `[@po 27/08 — NOVA]` O número de idas ao banco por oferta não cresce.**
`isSlotFree` é **uma query ao `appointments` por candidato** (`visit-slot.ts:552-574`). Hoje o laço
para nos 3 primeiros: em agenda vazia são **3** queries; depois da fase (a)/(b) seriam **11** em
`tarde` e **7** em `manha`, **sequenciais, no caminho da resposta ao lead**.
*Verifica-se:* contador de chamadas no `fakeSupabase` da fixture da `AC1`, com **um** dos dois
resultados colados no PR:
- **(a)** total de consultas ao `appointments` por oferta **≤ 3** (forma de consulta única da janela
  do período — `1` é o esperado); **ou**
- **(b)** se o @dev preferir `Promise.all`: o fake registra a **ordem de emissão** e prova que
  **todas** as consultas foram emitidas antes de a primeira resolver (profundidade sequencial = 1).

**Não é AC de performance genérica — é um teto de round-trips medido no fake.** Sem ela a story troca
uma mentira por ~meio segundo de latência em todo pedido de período (o Epic 88 tem teto medido de
p95 em `whatsapp_async_done`, `D88-3`).

**AC5 — 🔴 `[@po 27/08 — REESCRITA]` "Mais tarde" é respondido com verdade recalculada NESTE turno,
e nenhum horário anterior é apresentado como "mais tarde".**
*Verifica-se com dois turnos consecutivos sobre a MESMA conversa (o fake persiste `collected_data`
entre eles):* turno 1 = `"Amanhã pode ser a tarde ?"` (oferta `[12:00, 14:00, 17:00]`, pela `AC1`);
turno 2 = `"Mais tarde não tem ?"` →
- **(i)** o bloco `[SISTEMA]` do turno 2 **existe e é novo**. **Vermelho contra o `HEAD`:** hoje o
  turno 2 cai no ramo genérico e o bloco só diz *"Pergunte qual horário prefere"*, sem dado nenhum —
  colar o bloco do `HEAD` e o novo, lado a lado;
- **(ii)** o bloco afirma, a partir de um `freeSlotsInPeriod` executado **no turno 2**, que o
  **último horário livre do período é 17:00** e que **não existe nenhum livre depois dele**, e
  instrui a Nicole a dizer isso e a oferecer outro período/dia;
- **(iii)** 🔴 **o bloco NÃO contém `12:30`, `13:00`, `13:30`, `14:30` nem `15:00`** — nem como
  lista, nem sob rótulo de "mais tarde". *Esta é a AC que reprova o desenho original: com
  `filter(!jaOfertados)` o bloco diria "MAIS TARDE: 12h30, 13h30, 15h" depois de a Nicole ter
  oferecido 14h e 17h, e a AC5 antiga (que só exigia "nenhum dos três repetidos") ficaria VERDE;*
- **(iv)** 🔴 **controle de procedência, e ele é o que materializa a arbitragem:**
  `grep -rn "ofertas_do_sistema\|ofertasDoSistema\|afirmado_pela_nicole" packages/ai/src packages/web/src`
  devolve **exatamente as mesmas ocorrências do `HEAD`** (a declaração reservada em
  `agenda-state.ts:108-126`, as duas linhas de `parseAgendaState` e o caso de teste
  `agenda-state.test.ts:44-50`). **Zero escrita, zero leitura nova.** Colar a saída bruta;
- **(v)** a reencenação usa a resposta **literal** de produção no `fakeAnthropic`
  (*"Amanhã os horários disponíveis à tarde são esses mesmo: 12h, 12h30 ou 13h"*) para provar que a
  fixture reencena o incidente e não uma paráfrase dele.

**AC6 — 🔴 `[@po 27/08 — REESCRITA]` A interceptação só dispara com período vivo do MESMO dia, e
nunca inventa. *Quatro fixtures no mesmo teste.***
- **(i)** `agenda_state.periodo === null` (conversa que nunca pediu período) + `"mais tarde"` → cai
  no ramo `day && !time` de hoje, sem lista, **byte a byte idêntico ao `HEAD`**;
- **(ii)** `agenda_state` **expirado** (> 48 h; `readAgendaState` devolve `state: null`) → idem (i);
- **(iii)** 🔴 **dia novo neste turno:** `"quinta mais tarde"` com `agenda_state.periodo = "tarde"`
  ancorado em **quarta** → `fromMessage.day === true` → **NÃO intercepta**, cai no ramo de hoje.
  *Sem esta guarda a Nicole afirmaria o teto de um dia sobre outro — a mesma classe de defeito que a
  `87-4` fechou com a âncora temporal;*
- **(iv)** período **exaurido no recálculo** (nenhum livre) → o bloco diz que **não há horário livre
  nesse período**, oferece outro período/dia e **não contém horário nenhum**. Não inventa, e não
  repete a lista anterior.

**AC7 — 🔴 `[@po 27/08 — NOVA, substitui a AC7 antiga]` O período vivo SOBREVIVE à interceptação.**
O ramo `day && !time` de hoje grava `guardarAgenda({ dataAbsoluta })` **sem** `periodo` — ou seja,
ele **apaga** o período. Se a interceptação fizer o mesmo, o segundo `"mais tarde"` da mesma conversa
regride para o fallback genérico.
*Verifica-se:* depois do turno 2 da `AC5`, `collected_data.agenda_state.periodo === "tarde"` e
`data_absoluta` inalterado; e um **turno 3** com `"e mais tarde não tem?"` recebe **a mesma resposta
honesta**, não o fallback. **Vermelho contra a forma ingênua** (`guardarAgenda({ dataAbsoluta })`):
colar o turno 3 regredido.

**AC8 — 🔴 `[@po 27/08 — REESCRITA como controle de escopo]` Os três despejos crus de
`collected_data` saem desta story com diff ZERO.**
*Verifica-se:* `git diff HEAD --` nos três sítios → **0 linhas** em
`packages/ai/src/chat/pipeline.ts:2087-2091`, `packages/ai/src/flows/lead-memory.ts:74-82` e
`packages/ai/src/flows/haiku-enrichment.ts:100-108`; e `grep -rn "omitAgendaKeys\|omitLegacyAgendaKeys"`
nos três arquivos → **nenhuma ocorrência nova**. **Motivo:** o sítio 1 é a `87-11` (PR `#428`, já
implementado) e os sítios 2 e 3 são a `AC6-b` da `87-10`. **Sem campo novo, o risco desta story
nesses três sítios é ZERO — e antecipar a proteção mudaria a entrada do Haiku que escreve o
`ai_summary`, que volta ao prompt da Nicole em 59,3 % dos turnos, sem denominador medido.**

**AC9 — `[@po 27/08 — reduzida]` Nada nesta story pontua, arma gate ou muda o score.**
- **(i)** `git diff HEAD -- packages/ai/src/flows/qualification.ts` = **0 linhas**;
- **(ii)** `hasAgendaFact` **intocada** — ela testa só `parseAgendaState(...)` ser truthy; conferir
  no diff;
- **(iii)** teste: mesma fixture com e **sem** `agenda_state.periodo` vivo (com e sem interceptação)
  → `qualificationScore` e `shouldHandoff` **idênticos**. *(O item que comparava com/sem
  `ofertas_do_sistema` saiu: o campo não é escrito.)*

**AC10 — 🔴 `[@po 27/08 — RECALIBRADA]` Regressão geral, com os TRÊS vermelhos pré-existentes
nominados.**
O Defeito A **muda o que a Nicole ouve** em três testes que existem hoje, e **um deles é golden byte
a byte**. A `AC10` original dizia *"a suíte de reencenação da `87-4`/`87-10` permanece verde sem
alteração de forma não justificada"* — **isso é falso como escrito**. Os três, com a saída nova
justificada por escrito:
1. `packages/ai/src/flows/visit-slot.test.ts:477` — *"manhã de sábado com 10h ocupado → oferece 8h,
   8h30 e 9h"*: livres = `8:00, 8:30, 9:00, 11:00` (4) → passa a **`[8:00, 9:00, 11:00]`**;
2. 🔴 `packages/ai/src/chat/pipeline-agenda-state.test.ts:598` — golden `AC7` *"dia+período"*, cuja
   docstring diz *"CAPTURADAS do `HEAD` … qualquer diferença aqui é achado bloqueante"*:
   `08:00 ou 08:30 ou 09:00` → passa a **`08:00 ou 09:30 ou 11:00`**;
3. `packages/ai/src/chat/pipeline-agenda-state.test.ts:640` — o mesmo golden pela via `"de manhã"`
   com pendência de dia.
**O item 2 exige uma linha explícita NO ARQUIVO DO TESTE** dizendo que a mudança é desta story e
por quê: aquele comentário autoriza tratar qualquer diff como bloqueante, e um golden recalibrado em
silêncio apaga a guarda que ele é. Os outros três casos de `freeSlotsInPeriod`
(`visit-slot.test.ts:487`, `:494` e `:500`) seguem **verdes** — conferido pelo @po no papel
(0 livres, 1 livre e 3 livres não sofrem amostragem); se algum ficar vermelho, **PARE**: a
invariante da `AC3-(iii)` não está valendo.
Mais: `npx vitest run` da RAIZ (nunca `--reporter=basic`) — total antes e depois colado, delta
explicado teste a teste; `npx tsc --noEmit` em `packages/ai` → **0**.

**AC11 — Janela de observação em produção (D7). `[@po 27/08 — item (iii) trocado]`**
24 h após cada fatia, responsável nomeado: **(i)** uma conversa real pedindo período de tarde/manhã
recebe uma oferta que cobre mais do que a borda de abertura — colar o turno; **(ii)** se a Fatia 2
subiu, uma conversa real que diga "mais tarde" depois de uma oferta de período recebe a resposta
honesta (último horário do período + convite a outro dia/período), **sem repetir a lista anterior
como se fosse o universo** — colar os dois turnos; **(iii)** `select event_type, count(*) from
system_events where event_type in ('NICOLE_SLOT_MISMATCH','NICOLE_SLOT_UNAUTHORIZED') and created_at
> {deploy}` → **0 novos** atribuíveis à oferta espalhada (a oferta não seta `authorizedSlotUtc`,
então o esperado é zero; é observabilidade, não hipótese). *(O `select` de
`ofertas_do_sistema` saiu: a story não escreve o campo, e a premissa de "zero registros" da `87-10`
continua intacta.)*

---

## Tasks

> **`[@po 27/08]` DUAS FATIAS, DOIS PRs, na ordem A → B.** A Fatia 1 não espera nada — nem a Fatia 2,
> nem a fila de deploy do Epic 87. A Fatia 2 **também** não depende da `87-10` (a arbitragem do
> §4-bis tirou a dependência), mas depende da Fatia 1 **em produção**, porque a `AC5` só é verdade
> depois que `espalhar` garante que a oferta chega ao fim do período.

### Fatia 1 — Defeito A (PR 1)

- [x] **T0 — Remedir contra produção, somente SELECT, e capturar o baseline dos vermelhos.** Colar:
      (a) a conversa da Ana inteira, confirmando os horários citados neste documento; (b) o
      compromisso de 16:00 BRT do dia 27/08/2026 (equipe `house`); (c) **`[@po 27/08]`** a saída dos
      **três testes da `AC10`** rodados no `HEAD` **antes de qualquer edição** — é o baseline contra
      o qual o delta da `AC10` se explica. *(Saiu o `select count(*)` de `ofertas_do_sistema`: a
      story não escreve o campo. Se alguém quiser o número, ele é insumo da `87-10`, não desta.)*
- [x] **T1 — Defeito A.** `freeSlotsInPeriod` passa a coletar os candidatos do período e amostrar
      espalhado (`espalhar`, §1 do Desenho), **com a guarda de `k ≤ 1`** e respeitando o teto de
      idas ao banco da `AC4`. Sem gate.
- [x] **T2 — Testes do Defeito A** (`AC1`, `AC2`, `AC3`, `AC4`) com os vermelhos colados, **mais a
      recalibração justificada dos três testes pré-existentes** da `AC10` — incluindo a linha
      obrigatória no golden `pipeline-agenda-state.test.ts:598`.
- [x] **T3 — Fecha a Fatia 1:** `npx vitest run` da RAIZ + `tsc --noEmit` em `packages/ai` (`AC10`),
      mutação do `espalhar` (troca `round` por `floor`/remove a amostragem) com a saída bruta colada
      e a árvore restaurada, e o plano da janela de 24 h (`AC11-i`) com responsável nomeado.

### Fatia 2 — Defeito B (PR 2, depois da Fatia 1 em produção)

- [ ] **T4 — Detecção.** `detectWantsLaterSlot` exportada em `visit-slot.ts`, **só** para a frase
      `"mais tarde"` (ver Armadilha 1), com teste próprio incluindo acentuação e caixa.
- [ ] **T5 — Interceptação no ramo `day && !time`.** Recálculo **neste turno** com
      `agenda_state.periodo` + `day` herdado, guarda de mesmo-dia, preservação do período e as duas
      mensagens `[SISTEMA]` (último horário livre / período exaurido). `AC5`, `AC6`, `AC7`.
      **Nenhum campo novo. Nenhuma leitura de `ofertas_do_sistema`/`afirmado_pela_nicole`.**
- [ ] **T6 — Controles negativos de escopo e procedência:** `AC5-(iv)` (o `grep` dos dois campos
      reservados, saída colada), `AC8` (diff ZERO nos três despejos crus), `AC9` (score/gate
      intocados).
- [ ] **T7 — Mutações da Fatia 2**, cada uma com a forma escrita e a saída bruta colada; árvore
      restaurada. No mínimo: (a) remover a guarda de mesmo-dia → `AC6-(iii)` fica vermelha;
      (b) trocar `guardarAgenda({ dataAbsoluta, periodo })` por `guardarAgenda({ dataAbsoluta })` →
      `AC7` fica vermelha.
- [ ] **T8 — Fecha a Fatia 2:** `AC10` de novo (suíte + tipos) e a janela de observação `AC11-(ii)`
      e `(iii)`, com responsável nomeado.

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha (hoje) | o quê |
|---|---|---|
| `packages/ai/src/flows/visit-slot.ts` | 291-296 | `PERIOD_BOUNDS` — as faixas de `manha`/`tarde` |
| ↳ | 305-317 | `parsePeriodParts` — por que "mais tarde" devolve `null` de propósito |
| ↳ | 633-655 | `freeSlotsInPeriod` — o coração do Defeito A |
| `packages/ai/src/flows/agenda-state.ts` | 108-126 | `AgendaState` — os dois campos reservados pela `87-10` |
| ↳ | 137-158 | `buildAgendaState` — **`[@po]` NÃO ganha parâmetro novo**: a decisão (i) do §4-bis mantém a assinatura de hoje |
| ↳ | 60 | `TTL_AGENDA_STATE_HORAS = 48` — TTL que também rege o campo novo |
| ↳ | 264-283 | `omitAgendaKeys`/`omitLegacyAgendaKeys` — já existem, reusar no T5 |
| `packages/ai/src/chat/pipeline.ts` | 1085-1093 | `guardarAgenda` — **`[@po]` nenhum parâmetro novo entra: a story não grava campo novo** |
| ↳ | 1101-1136 | a cadeia `if (day && time) … else if (day && period) … else if (day && !time) …` |
| ↳ | 1120-1127 | sítio 7 (`day && period`) — **`[@po]` NÃO é tocado: já grava `periodo` hoje, e é isso que a Fatia 2 lê** |
| ↳ | **1128-1131** | ramo `day && !time` — **o único ponto que a Fatia 2 edita** |
| ↳ | 1042/1044 | o **segundo** chamador de `freeSlotsInPeriod` (remarcação) — muda junto, por desenho (R1) |
| ↳ | 2087-2091 | despejo cru de `collected_data` — **`[@po]` FORA do escopo, `AC8` exige diff ZERO** (`87-11`, PR `#428`) |
| `packages/ai/src/flows/lead-memory.ts` | **74-82** (o §3 original dizia 106) | `updateLeadMemory` — **FORA do escopo** (`AC6-b-i` da `87-10`) |
| `packages/ai/src/flows/haiku-enrichment.ts` | 100-108 | prompt do cron — **FORA do escopo** (`AC6-b-ii` da `87-10`) |
| `packages/ai/src/flows/visit-slot.ts` | **552-574** | `isSlotFree` — **uma query por candidato**; é a `AC4` |
| ↳ | **389-430** | `resolveVisitSlotParts` — de onde vem o `day` herdado (`:424`) e o `fromMessage.day` da guarda de mesmo-dia |
| `packages/ai/src/flows/visit-slot.test.ts` | **465-505** | os 4 casos de `freeSlotsInPeriod`; **o `:477` fica vermelho** (`AC10`) |
| `packages/ai/src/chat/pipeline-agenda-state.test.ts` | **575-645** | golden `AC7` byte-a-byte; **`:598` e `:640` ficam vermelhos** (`AC10`) |
| `packages/ai/src/chat/pipeline-scheduling.test.ts` | — | modelo de teste fim a fim, com `fakeAnthropic` (dois turnos sobre a mesma conversa) |
| `docs/stories/87-10-estado-registra-oferta-e-afirmacao.story.md` | §2, §3, `AC1` | **`[@po]` ler para saber o que NÃO fazer:** a `AC1` dela **remove** os dois campos de `AgendaState` para a chave irmã `agenda_registro`, e a `AC1-(ii)` tem uma trava (*"se aparecer um terceiro erro, PARE"*) que esta story não pode disparar |

### Armadilhas

1. **Não expandir `detectWantsLaterSlot` além de `"mais tarde"`.** A fixture real só prova essa
   frase. Variações ("mais pra frente", "depois desses") são inferência sem evidência — deixar para
   uma story futura, com incidente medido.
2. **Não tocar `evaluateSlot`/`checkSlotAvailability`.** O INSERT desta conversa saiu correto; o
   defeito é só na oferta. Mexer ali é escopo alheio e reabre risco em código que não falhou.
3. **`espalhar` precisa ser determinística, coberta por teste próprio e defendida em `k ≤ 1`** — a
   forma do Desenho divide por `k − 1`, e `limit` é parâmetro público com default. Arredondamento de
   índice e divisão por zero são o tipo de detalhe que quebra silenciosamente numa refatoração
   futura (`AC3-ii`/`AC3-iii`).
4. **🔴 `[@po 27/08]` A decisão do §4 é (i): `ofertas_do_sistema` e `afirmado_pela_nicole` não são
   escritos NEM lidos por esta story.** Se o teste da `AC5` parecer difícil sem eles, o caminho é o
   **recálculo** (§4-bis e §2 do Desenho), nunca o campo. Qualquer diff que toque os dois campos
   reprova a `AC5-(iv)` — e pisa numa trava calibrada de propósito na `AC1-(ii)` da `87-10`.
5. **🔴 `[@po 27/08]` Não tocar os três despejos crus de `collected_data`**
   (`pipeline.ts:2090`, `lead-memory.ts:79-80`, `haiku-enrichment.ts:106`). São a `87-11` (PR
   `#428`, implementado e aberto) e a `AC6-b` da `87-10`. `AC8` é o controle. A `T5` original do @sm
   (aplicar `omitAgendaKeys` nos três) **saiu do escopo** junto com o campo novo.
6. **🔴 `[@po 27/08]` NUNCA apresentar um horário ANTERIOR como "mais tarde".** Depois do Defeito A
   a oferta já vai até o fim do período; o que sobra no meio é mais **cedo**. Oferecer o resto sob o
   rótulo "mais tarde" é trocar uma mentira por outra, e é exatamente o que a `AC5-(iii)` reprova.
7. **🔴 `[@po 27/08]` O recálculo é a fonte; a memória, nunca.** Toda frase da Nicole sobre "não tem
   nada mais tarde" tem de sair de um `freeSlotsInPeriod` executado **no turno em que ela fala**.
   Reusar a lista do turno anterior — mesmo guardada em estado — é reintroduzir a classe de defeito
   que esta story existe para fechar.
8. **`[@po 27/08]` O golden é uma guarda, não um obstáculo.** `pipeline-agenda-state.test.ts:598`
   diz por escrito que qualquer diff nele é achado bloqueante. Recalibrar sem escrever o porquê no
   próprio arquivo transforma a guarda em ruído para a próxima story (`AC10`, item 2).

---

## O que esta story NÃO faz — `[@po 27/08]`

| Fora do escopo | Dono / destino |
|---|---|
| Escrever ou ler `ofertas_do_sistema` / `afirmado_pela_nicole` (os 7 sítios, a chave irmã `agenda_registro`, o `MAX_OFERTAS`) | **`87-10`** (`W1-2c`), intacta |
| Ler a oferta para resolver o `"Ok"` do lead | **`W3-2e`**, Onda 3 |
| Filtrar `collected_data` nos três despejos crus de prompt | **`87-11`** (PR `#428`) + **`AC6-b` da `87-10`** |
| Unificar o expediente hardcoded da Nicole (`OPEN_HOUR`/`closeHourFor`) com `roleta_schedule` | story futura, já registrada |
| Oferecer o **meio** do período ("tem outros horários mais cedo nesse mesmo período: …") | melhoria de produto **sem incidente medido** → backlog |
| Tratar "mais cedo", "mais pra frente", "depois desses" e outras variações | story futura, **com incidente medido** (Armadilha 1) |
| O turno em que a Ana pediu "mais informações" e recebeu só uma pergunta de volta | fora — outro defeito, outra evidência |
| Tool use / o modelo consultando a agenda por conta própria | **Epic 88** |
| `evaluateSlot`, `checkSlotAvailability`, o INSERT do `appointment` | fora — o agendamento da Ana saiu **correto** |

---

## Riscos — `[@po 27/08]`

| # | Risco | Prob. | Mitigação (verificável) |
|---|---|---|---|
| R1 | A oferta espalhada muda o que a Nicole diz em **dois** sítios de prompt (`pipeline.ts:1123` e `:1044`), não um | **Certa** | É a mesma correção e é desejável nos dois. O teste do sítio `:1044` (`pipeline-agenda-state.test.ts:376`) só asserta a presença do bloco e segue verde **sem provar nada** — declarado na `AC10` |
| R2 | Latência: `isSlotFree` é 1 query por candidato; 3 → 11 no caminho da resposta | **Certa se ignorada** | `AC4` — teto de round-trips medido no fake |
| R3 | `espalhar` com `k ≤ 1` divide por zero | Baixa | `AC3-(ii)` |
| R4 | A interceptação de "mais tarde" dispara com período vivo de OUTRO dia | Média (herança de estado é comum) | `AC6-(iii)`, guarda `!fromMessage.day` |
| R5 | Golden byte-a-byte recalibrado em silêncio apaga a guarda que ele é | Média | `AC10` item 2 — linha obrigatória no arquivo do teste |
| R6 | Quem queria o começo da tarde (12:30/13:00) deixa de vê-los na oferta | Baixa | `espalhar` sempre inclui `xs[0]` (`AC3-iii`); quem quer hora exata a diz e cai no ramo `day && time`, que confere e agenda |
| R7 | O período vivo é apagado por um turno intermediário e o "mais tarde" volta ao fallback | Média | Aceito e declarado: o fallback é o comportamento de HOJE, nunca pior (`AC6-i`) |
| R8 | Conflito textual em `pipeline.ts` com os PRs `#428`/`#431` | Média | Resolução de merge, não de ordem — as regiões são `:1044`/`:1123` × `:2090`/imports |

---

## Definition of Done — `[@po 27/08]`

**Fatia 1:** `AC1`-`AC4` verdes com os vermelhos colados; `AC10` com os três testes recalibrados e o
golden justificado no arquivo; `tsc` = 0; mutação do `espalhar` colada; PR mergeado; `AC11-(i)`
agendada com responsável nomeado.

**Fatia 2:** `AC5`-`AC9` verdes; `AC5-(iv)` (o `grep` dos campos reservados) e `AC8` (diff ZERO nos
três despejos) colados **no corpo do PR**, não só no Dev Agent Record; as duas mutações do `T7`
coladas; `AC11-(ii)`/`(iii)` com responsável nomeado.

**Nenhum gate de fila.** Esta story não entra em `#428 → #429 → #431 → 87-10` e não precisa de
ratificação de terceiros — a única decisão pendente era a do §4 e ela está **tomada** (opção **(i)**,
27/08).

---

## Referências

- Conversa de produção `02d3a064-0271-4e34-b64a-c6ecd57ddae0` (Ana), 26-27/08/2026 — a evidência
- `docs/stories/87-10-estado-registra-oferta-e-afirmacao.story.md` §2, §3, `AC1`, `AC6-b` — o
  desenho completo de `ofertas_do_sistema`, que esta story **NÃO** toca (arbitragem do §4-bis,
  27/08). O Change Log dela (`v0.3`) registra que nada nela muda por causa desta story
- `docs/qa/po-validation-87-17.md` — o parecer do @po que arbitrou a fronteira do §4
- `docs/qa/po-validation-87-10-87-11.md` §1-§2 — a ratificação de 10/08 em que a decisão (i) se apoia
  (chave irmã `agenda_registro`, `AC1-(ii)` reescrita, "nada lê o campo")
- PRs `#428` (`87-11`) e `#429` (`87-12 · bloco A`) — a fila da Onda 1, aberta e parada; esta story
  **não** depende dela
- `docs/stories/87-4-estado-de-agenda-com-ancora-temporal.story.md` — `AgendaState`, `fonte:
  "pendencia"` vs `"mencao"`, TTL
- `packages/ai/src/flows/visit-slot.ts:291-317, 633-655` — `PERIOD_BOUNDS`, `parsePeriodParts`,
  `freeSlotsInPeriod`
- `packages/ai/src/chat/pipeline.ts:1085-1136` — a cadeia de ramos de agendamento

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

*(Fatia 1 — Defeito A. A Fatia 2 preenche a sua própria seção quando for executada.)*

### Agent Model Used

Claude Opus 5 (1M context) — @dev (Dex), modo YOLO autônomo, 2026-08-27.

### Escopo executado

**Fatia 1 (`T0`-`T3`) e SÓ ela.** Nada da Fatia 2 foi criado: `detectWantsLaterSlot` não existe,
o ramo `day && !time` não foi tocado, `pipeline.ts` tem **diff ZERO** (o segundo chamador muda de
comportamento sem mudar de código, que é exatamente o `R1`). Nenhuma leitura ou escrita de
`ofertas_do_sistema` / `afirmado_pela_nicole`.

### T0 — Remediação contra produção (somente SELECT) + baseline

Management API, projeto `dsopqkqjkmhytudaaolv`, apenas `select`.

**(a) A conversa da Ana confere byte a byte com o §1 da story.** Conversa
`02d3a064-0271-4e34-b64a-c6ecd57ddae0`, 15 mensagens; os quatro turnos que importam, crus:

```
2026-08-26 22:14:36+00  user       Amanhã pode ser a tarde ?
2026-08-26 22:14:48+00  assistant  Tenho alguns horários disponíveis amanhã à tarde: 12h, 12h30 ou 13h. Qual fica melhor pra você, Ana?
2026-08-26 22:22:22+00  user       Mais tarde não tem ?
2026-08-26 22:22:33+00  assistant  Amanhã os horários disponíveis à tarde são esses mesmo: 12h, 12h30 ou 13h. Algum deles funciona pra você?
```

**(b) O compromisso de 16:00 BRT de 27/08 confere — e a remediação achou um detalhe que a story não
tinha explicitado.** Hoje o dia 27/08 tem **dois** compromissos `house`, não um:

```
id                                    team   status     scheduled_at            brt                  created_by  created_at
63957a67-35ac-4a33-8796-f7152facbdc6  house  scheduled  2026-08-27 19:00:00+00  2026-08-27 16:00:00  admin       2026-08-18 14:46:24+00
a479011c-9fde-4ee2-928b-15e5c713aafe  house  scheduled  2026-08-27 15:00:00+00  2026-08-27 12:00:00  nicole      2026-08-26 22:42:01+00
```

O segundo é o agendamento **desta própria conversa** (`created_by = nicole`, criado às 22:42:01Z) —
ou seja, **20 minutos DEPOIS da mentira das 22:22:33Z**. No instante do defeito existia mesmo **um
único** compromisso, o de 16:00 BRT criado em 18/08 por `admin`, exatamente como a story afirma. A
fixture da `AC1` semeia **só** esse, e o teste diz por escrito por que o de 12:00 fica fora. Os 8
livres da tarde (`12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 17:00`) estão assertados no
teste *"os LIVRES da tarde são os 8 medidos em produção"*.

**(c) Baseline dos três vermelhos, rodados no `HEAD` `98772465` ANTES de qualquer edição — os três
VERDES, com os valores de borda:**

```
### 1) visit-slot.test.ts:477
 Test Files  1 passed (1)
      Tests  1 passed | 84 skipped (85)
### 2) pipeline-agenda-state.test.ts:598 (golden dia+período)
 ✓ … > AC7 — o bloco [SISTEMA] dos turnos-ouro é byte a byte o do HEAD > turno-ouro: dia+período 48ms
 Test Files  1 passed (1)
      Tests  1 passed | 32 skipped (33)
### 3) pipeline-agenda-state.test.ts:640 (G6)
 ✓ … > turno-ouro COM estado: G6 pendência de dia + período — o fluxo que a v1 desta story apagava 90ms
 Test Files  1 passed (1)
      Tests  1 passed | 32 skipped (33)
### suíte inteira da RAIZ no HEAD
 Test Files  256 passed (256)
      Tests  3137 passed | 6 expected fail (3143)
```

> ⚠️ **Achado de processo, para quem for rodar a Fatia 2:** o filtro `-t` do vitest é **regex**, não
> substring. `-t 'turno-ouro: dia+período'` casa **zero** testes (o `+` é quantificador) e a saída é
> `Tests 33 skipped (33)` — um **falso verde perfeito**, porque o exit code é 0 e nada falha. Só se
> percebe olhando `passed`. O correto é `-t 'turno-ouro: dia\+período'`. É a mesma família do falso
> verde de `grep -c` já registrado no repo: contar linhas não substitui conferir o que rodou.

### T1 — O conserto

`packages/ai/src/flows/visit-slot.ts`, duas mudanças e nada mais:

1. **`espalhar<T>(xs, k)` — nova, exportada.** Forma do §1 do Desenho, com a guarda de `k <= 1` da
   `AC3-(ii)` (`k <= 0` → `[]`; `k === 1` → `[xs[0]]`, antes de a fórmula dividir por `k - 1`).
   Exportada **só** para a `AC3` poder assertar a invariante direto, como a AC exige, em vez de
   inferi-la das fixtures — está escrito no docstring para ninguém achar que é superfície de produto.
2. **`freeSlotsInPeriod` em duas fases:** coleta os candidatos do período (o filtro de "já passou"
   continua ANTES de qualquer query) e amostra com `espalhar`. O `if (free.length >= limit) break`
   morreu.

**`AC4` — decisão de forma: `Promise.all` (opção (b) da AC), não a consulta única (opção (a)).**
Motivo: a opção (a) exigiria reimplementar localmente a regra de sobreposição de `isSlotFree`
(janela `[start-59min, start+59min)`, `team='house'`, `status in (scheduled, confirmed)`,
`excludeAppointmentId`) e passaria a existir **duas** fontes de verdade para "o slot está ocupado" —
que é a classe de defeito que este epic inteiro combate. Com `Promise.all`, `isSlotFree` segue sendo
a única fonte, o diff é de 4 linhas e a profundidade sequencial é **1**: um único round-trip de
espera, não 11 em série. O paralelismo é limitado pela geometria do período (11 em `tarde`, 7 em
`manha`), não por uma lista de tamanho aberto.

### T2 — Os testes, com os vermelhos colados

#### Os novos (8 testes), vermelhos contra o `HEAD` de `visit-slot.ts` ANTES do conserto

Rodados com **só o arquivo de teste modificado** (`git diff --stat` na saída bruta confirma):

```
 ❯ packages/ai/src/flows/visit-slot.test.ts (90 tests | 3 failed | 85 skipped)
     × AC1 — a tarde da Ana passa a ser 12h, 14h e 17h (o HEAD dava 12h, 12h30 e 13h)
     × AC2 — manhã sem compromisso nenhum passa a ser 8h, 9h30 e 11h (o HEAD dava 8h, 8h30 e 9h)
     × AC4 — as 11 consultas da tarde são todas emitidas antes de a primeira resolver (profundidade sequencial = 1)

AC1 — a oferta da tarde de 27/08 (fixture real da Ana):
  [                                    [
    "2026-08-27T15:00:00.000Z",          "2026-08-27T15:00:00.000Z",   ← 12:00 BRT
-   "2026-08-27T17:00:00.000Z",   →      "2026-08-27T15:30:00.000Z",   ← 12:30 BRT   (HEAD)
-   "2026-08-27T20:00:00.000Z",          "2026-08-27T16:00:00.000Z",   ← 13:00 BRT   (HEAD)
  ]                                    ]
  esperado (depois): 12:00, 14:00, 17:00 BRT   |   recebido (HEAD): 12:00, 12:30, 13:00 BRT

AC2 — manhã sem compromisso:
  esperado (depois): 08:00, 09:30, 11:00 BRT   |   recebido (HEAD): 08:00, 08:30, 09:00 BRT

AC4 — consultas ao `appointments` por oferta de tarde:
  AssertionError: expected 3 to be 11   (e, no HEAD, a 1ª resolvia no índice 1 do log: série pura)
```

Os dois testes de **fidelidade de fixture** (`os LIVRES da tarde são os 8 medidos em produção` e
`os candidatos da manhã são 7, não 8`) passam nas duas pontas de propósito: eles não medem a
amostragem, medem que a fixture reencena o banco de produção e que a contagem geométrica corrigida
pelo @po (`manha` = **7**, não 8; último início 11:00) é verdade no código.

Os três testes da `AC3` foram escritos depois do `T1`, porque exigem `espalhar` exportada — a
capacidade de reprovar deles está provada pelas **mutações** do `T3`, não por um vermelho de
importação (que provaria só que o import estava quebrado).

#### A recalibração dos três pré-existentes (`AC10`)

Contra o conserto, e **só** eles ficaram vermelhos — nenhum quarto teste apareceu, o que confirma a
invariante da `AC3-(iii)` nos outros três casos de `freeSlotsInPeriod` (`:487`, `:494`, `:500`):

```
     × manhã de sábado com 10h ocupado → oferece 8h, 8h30 e 9h
     × turno-ouro: dia+período
     × turno-ouro COM estado: G6 pendência de dia + período — o fluxo que a v1 desta story apagava
 Tests  3 failed | 123 passed (126)
```

Golden, cru, lado a lado (as duas strings são idênticas nos dois goldens):

```
- Expected  …Horários LIVRES nesse período: sábado, 15 de agosto às 08:00 ou sábado, 15 de agosto às 08:30 ou sábado, 15 de agosto às 09:00. …
+ Received  …Horários LIVRES nesse período: sábado, 15 de agosto às 08:00 ou sábado, 15 de agosto às 09:30 ou sábado, 15 de agosto às 11:00. …
```

1. **`visit-slot.test.ts:477`** — renomeado para *"oferece 8h, 9h e 11h (espalhado nos 4 livres)"* e
   com docstring `🔧 RECALIBRADO pela Story 87-17`: os LIVRES **não mudaram** (`8:00, 8:30, 9:00,
   11:00` — 9:30/10:00/10:30 colidem com a visita das 10h); mudou **quais 3 dos 4** ela oferece.
2. **`pipeline-agenda-state.test.ts` goldens `:598` e `:640`** — a linha obrigatória foi escrita
   **no arquivo**, dentro do bloco do golden (14 linhas, começando em `🔧 RECALIBRAÇÃO JUSTIFICADA
   — Story 87-17 (Defeito A), AC10 item 2 e 3`), e ela faz três coisas: nomeia a story, diz que a
   mudança é **desejada** e por quê (com a citação de produção que a motivou), e **reafirma a
   guarda** — *"qualquer OUTRA diferença aqui, inclusive nestas duas strings depois desta linha,
   segue sendo achado bloqueante"*. A guarda não foi apagada; foi datada.

### T3 — Fechamento

**Suíte da RAIZ (`npx vitest run`, sem `--reporter=basic`):**

```
antes (HEAD 98772465):  Test Files  256 passed (256) · Tests  3137 passed | 6 expected fail (3143)
depois:                 Test Files  256 passed (256) · Tests  3145 passed | 6 expected fail (3151)
EXIT_VITEST=0
```

**Delta = +8 testes, todos novos e todos meus, nenhum removido:** `AC1` (2: a oferta espalhada + os
8 livres da fixture), `AC2` (2: a oferta espalhada + os 7 candidatos), `AC3` (3: `i`, `ii`, `iii`),
`AC4` (1). Os `6 expected fail` são os mesmos de antes (pré-existentes, `it.fails` de outras
stories). Nenhum arquivo de teste novo; nenhum arquivo saiu.

**Tipos:** `npx tsc --noEmit` em `packages/ai` → **0 erros**, `EXIT_TSC=0`, saída vazia (0 linhas).
`npm run lint` da raiz → `EXIT_LINT=0`, `0 errors, 34 warnings` (as 34 são pré-existentes e nenhuma
está nos arquivos desta fatia — conferido por `grep` na saída). `npm run type-check` da raiz →
`EXIT_TYPECHECK=0`, 8/8 tasks.

**Mutações (três; árvore restaurada e conferida por `diff` ao fim — idêntica):**

| # | mutação | resultado |
|---|---|---|
| (a) | `Math.round(...)` → `Math.floor(...)` na fórmula do índice | 🔴 **2 vermelhos**: `AC1` e o `:477` recalibrado. (`AC2` fica verde: com `n=7, k=3` o passo é inteiro e `floor` = `round`. O caso da Ana, `n=8`, é justamente onde o `.5` decide: `floor(3,5)=3` → 13:30 em vez de 14:00.) |
| (b) | remover a amostragem (`return free.slice(0, limit)` = comportamento do `HEAD`) | 🔴 **5 vermelhos**: `AC1`, `AC2`, `:477` e os **dois goldens**. É a prova de que os goldens recalibrados voltam a reprovar se alguém desfizer o conserto |
| (c) | remover a guarda `if (k === 1) return [xs[0]!]` | 🔴 **1 vermelho**, `AC3-ii`, com a falha exata que a AC previu: `AssertionError: expected [ undefined ] to deeply equal [ 10 ]` — índice `NaN` no `map` |

Saída bruta das três em `T3-mutacao-a.txt` / `T3-mutacoes-b-c.txt`; restauração conferida com
`diff visit-slot.ts.bak visit-slot.ts` → **idêntico**.

**Controles negativos de fronteira (não são AC da Fatia 1, mas a fronteira é):**

```
git diff --stat -- packages/
 packages/ai/src/chat/pipeline-agenda-state.test.ts |  19 ++-
 packages/ai/src/flows/visit-slot.test.ts           | 153 ++++++++++++++++++++-
 packages/ai/src/flows/visit-slot.ts                |  50 ++++++-

grep "ofertas_do_sistema|ofertasDoSistema|afirmado_pela_nicole" — HEAD × worktree: as MESMAS 8
ocorrências (agenda-state.ts:114,119,125,126,202,203 + agenda-state.test.ts:48,49). Zero nova.
diff HEAD: pipeline.ts = 0 linhas · lead-memory.ts = 0 · haiku-enrichment.ts = 0 · qualification.ts = 0
grep "detectWantsLaterSlot" packages/ → nenhuma ocorrência (é da Fatia 2)
```

**`AC11-(i)` — janela de 24 h.** Plano: 24 h após o deploy da Fatia 1, rodar em produção
(somente SELECT) o par abaixo e colar o turno encontrado no gate da story.

```sql
-- conversas em que a Nicole ofereceu uma lista de período depois do deploy
select m.conversation_id, m.created_at, m.content
  from messages m
 where m.role = 'assistant'
   and m.created_at > '{timestamp_do_deploy}'
   and m.content ~ 'hor[áa]rios dispon[íi]veis'
 order by m.created_at desc limit 20;
-- + AC11-(iii): system_events em ('NICOLE_SLOT_MISMATCH','NICOLE_SLOT_UNAUTHORIZED') após o deploy → esperado 0
```

**Responsável nomeado: Marcos** (`marcos@trifold.eng.br`) — é quem tem o acesso de produção nesta
máquina; a Fatia 1 não tem responsável de plantão alternativo declarado no epic.
**`[AUTO-DECISION]** a AC pede "responsável nomeado" e a execução é autônoma → nomeei o dono do
acesso, em vez de deixar o campo vago (motivo: um responsável vago é o mesmo que nenhum, e esta AC
existe para não ser pulada).*

### Decisões autônomas (modo YOLO)

- **`[AUTO-DECISION]** forma da `AC4` → `Promise.all` (opção (b)), não a consulta única (opção (a)).
  Motivo: a (a) duplicaria a regra de sobreposição de `isSlotFree` e criaria uma segunda fonte de
  verdade sobre "ocupado" — a classe de defeito que o Epic 87 combate. A (b) mantém uma fonte, tem
  diff de 4 linhas e cumpre o teto medido (profundidade 1). Alternativa registrada para quando
  latência virar problema medido: a consulta única da janela do período, aí sim com `isSlotFree`
  refatorada para consumir a janela e continuar sendo a única fonte.*
- **`[AUTO-DECISION]** exportar `espalhar`. Motivo: a `AC3` exige assertar a invariante
  "sempre inclui o primeiro e o último" **direto na função**, "nunca inferida das fixtures". A
  exportação está justificada no docstring como superfície de teste, não de produto.*
- **`[AUTO-DECISION]** `espalhar` devolve `xs` (a própria referência) quando `xs.length <= k`, como
  o §1 do Desenho escreve. Não troquei por `xs.slice()`. Motivo: fidelidade ao desenho normativo e
  o único chamador passa um array local recém-construído. **Fica registrado para o @qa como o único
  ponto em que preferi o desenho literal a um endurecimento defensivo.***
- **`[AUTO-DECISION]** instrumentei o `fakeSupabase` existente de `visit-slot.test.ts` com um
  parâmetro `hooks` opcional (`onEmit`/`onResolve`) em vez de criar um segundo fake contador (IDS:
  ADAPT, não CREATE — busca por `queryCount|callCount|queries.push` em `packages/ai/src` não achou
  nenhum contador pré-existente). Sem `hooks`, o comportamento é idêntico ao de antes.*

### Divergências entre a story e o código real

1. **Nenhuma divergência de linha: o mapa de código da story está CERTO, linha por linha** —
   conferido contra `HEAD` `98772465`, não contra a memória: `freeSlotsInPeriod:633` ✅,
   `isSlotFree:552` ✅, `PERIOD_BOUNDS:293` (story: 291-296) ✅, sítio 7 `day && period`:1120 e a
   chamada em `:1123` ✅, ramo `day && !time`:1128 ✅, segundo chamador `:1044` ✅. *(Escrevi primeiro
   uma lista de "divergências de linha" nesta seção e ela estava ERRADA — era minha contagem, não o
   mapa. Corrigido antes de fechar, porque divergência falsa faz a próxima story desconfiar de um
   mapa bom.)* **Efeito da Fatia 1 nos números, para a Fatia 2:** `espalhar` entrou em `:642` e
   empurrou `freeSlotsInPeriod` de `633` para **`671`**; `pipeline.ts` **não se moveu** (diff zero).
2. **Os dois chamadores conferem, e o `:1044` muda de comportamento com `pipeline.ts` a ZERO
   linhas de diff** (`freeSlotsInPeriod(supabase, orgId, targetDay, nPeriod, nowA, apptId)` na
   remarcação, `:1121` no sítio 7). O `R1` está materialmente confirmado: o teste do `:1044`
   (`pipeline-agenda-state.test.ts:376`) segue **verde sem provar nada** sobre o conteúdo da lista.
3. **A remediação de produção achou 2 compromissos em 27/08, não 1** — e isso *fortalece* a
   evidência em vez de enfraquecê-la (o segundo é o agendamento desta conversa, criado 20 min
   depois da mentira). A story diz "existia **um único** compromisso", o que é verdade **no instante
   das 22:22:33Z**; o texto não explicitava que o dia hoje tem dois. Registrado na fixture.
4. **O `Set` de `espalhar` nunca colapsa índices quando `n > k`** (o passo `(n-1)/(k-1)` é `> 1`,
   logo os arredondamentos são estritamente crescentes). Ou seja: o `AC3-(iii)` autoriza saída com
   `< k` elementos, mas isso **não acontece** — a saída é sempre `min(n, k)`. O teste asserta
   `<= k`, como a AC escreve, e não endureci para `=== k` para não inventar régua que a AC não pediu.
5. **`AC10` previa 3 vermelhos e foram exatamente 3.** A previsão do @po dos valores novos bateu
   nos três (`[8:00, 9:00, 11:00]` e `08:00 ou 09:30 ou 11:00`), sem uma vírgula de diferença.

### Debug Log References

Saídas brutas (sessão de 2026-08-27, fora do repo, em
`/private/tmp/claude-501/.../scratchpad/87-17/`): `T0-baseline.txt`, `T0-db.txt`,
`T0-suite-root-HEAD.txt`, `T2-vermelhos.txt`, `T2-tres-vermelhos-preexistentes.txt`,
`T3-suite-root-depois.txt`, `T3-tsc.txt`, `T3-lint.txt`, `T3-typecheck.txt`, `T3-mutacao-a.txt`,
`T3-mutacoes-b-c.txt`, `T3-controles-negativos.txt`.

### Completion Notes

- **Fatia 1 pronta para `@qa`.** `AC1`, `AC2`, `AC3`, `AC4` e `AC10` verdes com vermelhos e
  mutações colados. `AC11-(i)` planejada com responsável nomeado.
- **`AC5`-`AC9` NÃO se aplicam à Fatia 1** e não foram tocadas — `AC8` e `AC9-(i)` estão, ainda
  assim, provadas por diff ZERO acima, de graça.
- **Nada foi commitado além dos três arquivos de código/teste e desta story.** `git push` e PR são
  do `@devops` (`REGRA ZERO`).
- **A pergunta da Ana deixa de ter motivo:** a oferta da tarde de 27/08 sai de
  `12h, 12h30, 13h` (borda de abertura) para `12h, 14h, 17h` — e 17h era um dos horários que a
  Nicole afirmou não existirem.

## QA Results

### Gate da Fatia 1 (Defeito A, `T0`-`T3`) — 2026-08-27

**Review Date:** 2026-08-27 · **Reviewed By:** Quinn (@qa, Test Architect)
**Commit revisado:** `1454d4ca` (contra `98772465`) · **Branch:** `main` (sem branch de feature)
**Gate:** `docs/qa/gates/87-17-fatia1-oferta-de-horario-espalhada.yml`

## 🟡 Gate Status: **CONCERNS** — aprovada para `@devops`, com 5 achados rastreados e **zero bloqueantes**

**Escopo deste gate:** `T0`-`T3`, `AC1`-`AC4` e `AC10`. **`AC5`-`AC9` (Fatia 2) e `AC11` (janela
pós-deploy) não foram avaliadas e não reprovam esta fatia**, por decisão de fatiamento do @po.

#### Os 7 checks

| # | Check | Nota |
|---|---|---|
| 1 | Code review | **PASS** |
| 2 | Unit tests | **PASS** |
| 3 | Acceptance criteria (`AC1`-`AC4`, `AC10`) | **PASS** |
| 4 | No regressions | **PASS** |
| 5 | Performance | **CONCERNS** (3 → 11 round-trips por oferta, medidos só no fake) |
| 6 | Security | **PASS** |
| 7 | Documentation | **PASS** |

#### Números que eu medi (nenhum aceito por relatório)

| Medição | Resultado |
|---|---|
| `npx vitest run` da raiz (worktree) | 256 arquivos · **3145 passed \| 6 expected fail** (3151) · **EXIT=0** |
| Baseline, revertendo os 3 arquivos para `98772465` | 256 arquivos · **3137 passed \| 6 expected fail** (3143) · **EXIT=0** |
| Delta | **+8**, todos em `visit-slot.test.ts` (85 → 93); `pipeline-agenda-state.test.ts` 33 → 33; nenhum removido; nenhum `it.fails` nos arquivos tocados |
| `npx tsc --noEmit` em `packages/ai` | **EXIT=0**, saída de **0 linhas** (`wc -l`, não `grep -c`) |
| `npm run lint` da raiz | **EXIT=0** · 34 problems (**0 errors**, 34 warnings) · 8/8 tasks · **0 warnings** nos arquivos desta fatia |
| Contraprova (só `visit-slot.ts` no HEAD anterior) | **9 vermelhos, EXIT=1** — `AC1` recebia `12:00, 12:30, 13:00`; `AC2` recebia `8:00, 8:30, 9:00`; `AC4` `expected 3 to be 11`; golden `08:00 ou 08:30 ou 09:00` |
| Fronteira (diff `98772465..1454d4ca`) | **0 linhas** em `pipeline.ts`, `agenda-state.ts`, `lead-memory.ts`, `haiku-enrichment.ts`, `qualification.ts` |
| Campos reservados | `diff` das saídas de `git grep` nos dois commits = **VAZIO** (as mesmas 8 ocorrências) |
| `detectWantsLaterSlot` | `git grep` → **rc=1**, inexistente: a Fatia 2 não começou |

#### Mutações — 4, minhas, árvore restaurada e conferida por sha256

| # | Mutação | Resultado |
|---|---|---|
| (a) | `Math.round` → `Math.floor` no índice | 🔴 2 vermelhos (`AC1` e o `:477`) |
| (b) | reverter `visit-slot.ts` (= remover a amostragem) | 🔴 `AC1`, `AC2`, `AC4`, `:477` **e os dois goldens** |
| (c) | remover `if (k === 1) return [xs[0]!]` | 🔴 `AC3-ii`: `expected [ undefined ] to deeply equal [ 10 ]` |
| (d) | **minha, nova:** `Promise.all` → laço `for … await`, mantendo as 11 consultas | 🔴 `AC4`: `expected false to be true` |

A **(d)** é a que importa para a `AC4`: ela prova que a asserção mede **profundidade**, não
contagem — a forma serial morre mesmo emitindo as mesmas 11 queries. A **(b)** é a que prova que
o golden recalibrado **volta a reprovar**: a guarda foi **datada, não apagada**.

Também rodei um sweep próprio (temporário, apagado depois) sobre 24–30/08 × `manha`/`tarde` ×
`limit` 1..12: **nenhum horário ofertado estoura o fechamento** (início + 60min ≤ seg–sex 18h /
sáb 12h), **sábado à tarde continua `[]`** em todos os limites, sábado de manhã tem último início
**11:00 BRT**. `EXIT=0`, e provei que o sweep reprova (mutando `- VISIT_DURATION_MIN` → `- 0`,
3 de 4 ficam vermelhos). **Working tree devolvido idêntico** — `git diff HEAD -- packages/` = 0
linhas, `sha256` de `visit-slot.ts` igual ao de `git show HEAD:`.

#### Achados (nenhum bloqueante)

| ID | Sev. | O quê | Destino |
|---|---|---|---|
| `REL-1` | medium | `freeSlotsInPeriod` sem `try/catch` nos dois chamadores; exposição a erro de rede sobe 3 → 11 queries. Rejeição vira `WEBHOOK_ASYNC_ERROR` e **o lead não recebe resposta**. Mesmo modo de falha do HEAD, ~3,7× mais provável — e **observável**, não silencioso | **registrado em `docs/backlog.md`** |
| `MNT-1` | low | `espalhar` devolve `xs` **por referência** quando `xs.length <= k` (confirmado por mim com `toBe`) — superfície pública assimétrica, não documentada, não travada por teste (`AC3-i` usa `toEqual`). Zero aliasing real hoje; o @dev seguiu o §1 do Desenho e **escalou** a decisão | próxima visita a `visit-slot.ts` / Fatia 2 |
| `TEST-1` | low | O ramo de remarcação (`pipeline.ts:1044`) mudou de comportamento com diff ZERO e só é coberto por `toContain("Horários LIVRES nesse período")` — nenhuma asserção de conteúdo. Já declarado pelo @po no `R1` | Fatia 2 |
| `PERF-1` | low | 11 requisições concorrentes ao PostgREST por oferta, nunca medidas fora do fake | janela `AC11-(i)`: p95 de `metadata->>'ms_async'` do `whatsapp_async_done`, 24 h antes × depois |
| `DOC-1` | low | `checkSlotAvailability` mantém `if (alternatives.length >= 3) break` — mesma geometria, semântica diferente e **explicitamente fora de escopo** | nenhuma ação |

#### Decisões sobre os pontos escalados

1. **`Promise.all` × `AC4`:** **CUMPRE**. A `AC4-(b)` autoriza a forma nominalmente e o §3.2 do
   parecer do @po diz que "o `Promise.all` resolve em profundidade sequencial 1". Sob erro **não há
   modo novo** (o laço com `await` do HEAD também abortava na primeira rejeição) e não há
   `unhandledRejection` (o `Promise.all` anexa handler a todas). O que muda é exposição → `REL-1`.
   Pool/rate-limit: limitado pela geometria, query indexada, sem risco material — mas pedi a medição
   real em vez de deduzir (`PERF-1`).
2. **`espalhar` devolvendo `xs`:** **ACEITÁVEL nesta fatia**, achado `MNT-1` (low). Não reprovo o
   que o desenho normativo escreve e o @dev escalou em vez de esconder.
3. **Ausência de `try/catch`:** **follow-up legítimo**, e agora **registrado em `docs/backlog.md`** —
   inclusive com o motivo pelo qual a correção "falha = não livre" **não** é obviamente certa (ela
   esconderia horário livre sob erro transitório, versão branda do defeito que esta story conserta).
4. **Golden:** guarda **datada, não apagada**. A frase original de `:576-579` está intacta; as 14
   linhas novas reafirmam que "qualquer OUTRA diferença aqui … segue sendo achado bloqueante". E a
   prova não é o comentário: é a mutação (b), que deixa os dois goldens vermelhos.
5. **Regressão de sentido:** confirmada segura por sweep próprio **com contraprova**.
6. **Filtro `-t`:** **nenhuma prova deste gate depende dele.** Reproduzi o falso verde
   (`dia+período` → `33 skipped`, **EXIT=0**; `dia\+período` → `1 passed`) e confirmei que o
   baseline `T0` do @dev usou a forma **escapada** — a evidência dele é sã.

#### Notas para o `@devops` (não são defeito desta fatia)

- O commit `1454d4ca` está em **`main` local, sem branch** — criar a branch antes do PR.
- Working tree traz artefatos **não commitados** que não são código: `.claude/agent-memory/aios-{dev,po,sm}/`
  (4 modificados + 6 novos), `docs/qa/po-validation-87-17.md` e a edição da story `87-10`.
  **Recomendação:** `po-validation-87-17.md` e o arquivo de gate **devem** entrar no PR (a story os
  referencia por caminho); memórias de agente pelo critério de sempre (`chore(memory)` próprio).
- **CodeRabbit não rodou** (config aponta para WSL, máquina é darwin) — a story já registra
  `CodeRabbit Integration: Disabled`.

**Próxima ação:** `@devops *push` (branch + PR da Fatia 1). A **Fatia 2 (`T4`-`T8`) só depois da
Fatia 1 em produção**, com `AC11-(i)` e o p95 do `PERF-1` respondidos.

## File List

**Fatia 1 (Defeito A) — 3 arquivos, todos em `packages/ai`. Nenhum arquivo criado, nenhum removido.**

| arquivo | tipo | o quê |
|---|---|---|
| `packages/ai/src/flows/visit-slot.ts` | **modificado** | `espalhar<T>()` nova e exportada (`AC3`); `freeSlotsInPeriod` em duas fases + `Promise.all` (`AC1`, `AC2`, `AC4`) |
| `packages/ai/src/flows/visit-slot.test.ts` | **modificado** | 8 testes novos (`AC1`×2, `AC2`×2, `AC3`×3, `AC4`×1); `fakeSupabase` ganhou `hooks` opcional de instrumentação; `:477` recalibrado com docstring de justificativa (`AC10` item 1) |
| `packages/ai/src/chat/pipeline-agenda-state.test.ts` | **modificado** | goldens `:598` e `:640` recalibrados + a linha obrigatória de justificativa no arquivo (`AC10` itens 2 e 3) |
| `docs/stories/87-17-…story.md` | **modificado** | `Status` → `InProgress`, `T0`-`T3` marcadas, Dev Agent Record, File List, Change Log |

**Deliberadamente NÃO tocados** (fronteira da story, conferido por `git diff HEAD` = 0 linhas):
`packages/ai/src/chat/pipeline.ts`, `packages/ai/src/flows/agenda-state.ts`,
`packages/ai/src/flows/lead-memory.ts`, `packages/ai/src/flows/haiku-enrichment.ts`,
`packages/ai/src/flows/qualification.ts`.

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-27 | 0.3 | **Fatia 1 (Defeito A, `T0`-`T3`) IMPLEMENTADA. `Ready` → `InProgress`.** `freeSlotsInPeriod` passou a conferir o período inteiro e a amostrar com `espalhar` (nova, exportada, com a guarda de `k <= 1`); a oferta da tarde de 27/08 na fixture real da Ana saiu de **`12h, 12h30, 13h`** para **`12h, 14h, 17h`**, e a manhã de `8h, 8h30, 9h` para `8h, 9h30, 11h`. **`AC4` resolvida por `Promise.all`** (opção (b) da AC: 11 consultas, profundidade sequencial **1**) e **não** pela consulta única — motivo registrado no Dev Agent Record: a (a) criaria uma segunda fonte de verdade sobre "slot ocupado", que é a classe de defeito do epic. **Os 3 vermelhos previstos pela `AC10` foram exatamente 3**, com os valores que o @po previu, e os 2 goldens levaram a linha de justificativa **dentro do arquivo**, reafirmando a guarda em vez de apagá-la. Suíte da raiz **3137 → 3145** (+8, todos novos), `6 expected fail` inalterados, `tsc` = **0**, `lint` = **0 errors**. **3 mutações** (`round`→`floor`, remover amostragem, remover a guarda de `k=1`) todas capturadas, árvore restaurada e conferida por `diff`. Fronteira honrada: `pipeline.ts` com **diff ZERO**, zero ocorrência nova de `ofertas_do_sistema`/`afirmado_pela_nicole`, `detectWantsLaterSlot` inexistente. **Fatia 2 (`T4`-`T8`) não começou.** | @dev (Dex) |
| 2026-08-27 | 0.2 | **Validação: GO. `Draft` → `Ready`. Placar 7,5/10.** Parecer: `docs/qa/po-validation-87-17.md`. **(1) Decisão de fronteira do §4 ARBITRADA: opção (i)** — a story não escreve nem lê `ofertas_do_sistema`/`afirmado_pela_nicole`; a `87-10` fica **intacta** e **nenhuma ação recai sobre ela** (a `AC1-(ii)` e a premissa de "zero registros" seguem válidas). Motivo decisivo: `filter(!jaOfertados)` da opção (ii) responderia "mais tarde" com horários mais **CEDO** (`[12:30, 13:30, 15:00]` depois de ofertar 14h e 17h), porque depois do Defeito A `espalhar` sempre inclui o último livre do período — e a `AC5` antiga ficaria **verde** com essa saída. Somam: a leitura do campo é `W3-2e`/Onda 3 por arbitragem anterior (a `87-10` diz *"não restaurar a leitura para cá"*), e a `87-10` **remove** o campo de `AgendaState`, o que faria a opção (ii) escrever num campo marcado para deleção e pisar na trava do `tsc`. **(2) Defeito B NÃO foi bloqueado** — redesenhado no §4-bis/§2 para sair de um **recálculo no próprio turno** (`agenda_state.periodo`, campo vivo da `87-4`, + `day` herdado), sem estado novo. **(3) `T5`/`AC8` de proteção de prompt CORTADAS** — a premissa era o campo novo; os três sítios continuam da `87-11` (PR `#428`) e da `AC6-b` da `87-10`, e antecipá-los mudaria a entrada do Haiku do `ai_summary` (59,3 % dos turnos) sem denominador. `AC8` virou controle negativo de escopo (diff ZERO). **(4) `AC4` NOVA** — `isSlotFree` é 1 query por candidato e a forma nova iria de 3 para 11 sequenciais no caminho da resposta; teto medido no fake. **(5) `AC5`/`AC6`/`AC7` reescritas**, com a proibição explícita de apresentar horário anterior como "mais tarde", a guarda de mesmo-dia e a sobrevivência do período. **(6) `AC10` recalibrada** — o Defeito A deixa **3 testes existentes vermelhos**, um deles golden byte-a-byte (`pipeline-agenda-state.test.ts:598`), o que a AC10 original negava. **(7) `AC2`/`AC3` apertadas** (contagem de `manha` = **7**, não 8; sequência completa; guarda de `k ≤ 1`; invariante primeiro/último). **(8) Premissa corrigida:** `87-11` e `87-12` **existem** — PRs `#428` e `#429`, implementados, com o `#427` já em `main` (o `#428` está liberado e parado há 9 dias). **(9) Seções novas:** "O que esta story NÃO faz", "Riscos" (R1-R8) e "Definition of Done". **(10) Fatiamento AUTORIZADO:** duas fatias, dois PRs, A → B; a Fatia 1 sobe sozinha e fora da fila do Epic 87. | @po (Pax) |
| 2026-08-27 | 0.1 | Story criada a partir de evidência de produção (conversa da Ana, 26-27/08/2026): dois defeitos com raiz comum (oferta de período sempre na borda; "mais tarde" sem lista nova). Defeito A entregável independente. Defeito B mapeado como sítio nº 7 da tabela de sete sítios da `87-10`, com decisão de fronteira (i/ii/iii) posta para o @po — recomendação (ii), rejeitada (iii) por reintroduzir procedência de prosa como fonte de decisão. | @sm (River) |
