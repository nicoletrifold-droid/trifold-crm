# Story 87-7 — O resumo deixa de gravar a fala da Nicole como fato

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
**Item do roadmap:** **`W1-3b`** (Onda 1, **deploy 2**) — a metade de **código** do `CR-3`; a de
**dado** foi o `W1-3a`, executada à mão em 07–08/08
**Criada por:** @sm (River) em 2026-08-08
**Formato:** Correção de substrato de **escrita**. **Remove uma fonte de mentira; não ensina nada
novo à Nicole** — ela não fala nem uma palavra diferente por causa desta story.
**Executor:** @dev · validação em produção: @qa + responsável nomeado (D7)
**Esforço:** **M** (o guarda é pequeno; **são dois escritores**, e é aí que mora o trabalho)
**Risco:** **Médio de regressão** (o resumo é lido a cada turno como fallback de L1/L2/L3) ·
**Baixo de comportamento novo** (nada passa a ser decidido; um artefato derivado passa a ser filtrado)

> ### 🎯 A causa direta do caso Sandra
>
> ```
> leads.ai_summary (Sandra, produção, 05/08):
>   "Sandra agendou visita para sábado, dia 8"      ← ela NUNCA agendou nada
> ```
>
> ```ts
> // packages/ai/src/chat/pipeline.ts:1567-1581 — a cada 5 mensagens
> updateLeadMemory({ anthropic, currentSummary, userMessage,
>                    assistantMessage,          // ← a fala da PRÓPRIA Nicole
>                    collectedData })
> // packages/ai/src/flows/lead-memory.ts:35
> //   "- Incorpore informacao nova e mantenha as anteriores relevantes"
> //   ↑ zero regra sobre compromisso. Zero verificação contra `appointments`.
> ```
>
> **O loop de contaminação, fechado:** ela afirma → o resumo grava como fato → o resumo volta no
> contexto do turno seguinte → ela repete, agora com mais confiança.
>
> **A `87-4` resolveu a procedência do ESTADO. Esta resolve a do RESUMO.** Mesma doença, artefato
> diferente — e o resumo é o **caminho ativo**, porque L1/L2/L3 do MemPalace estão vazios há ~4 meses
> (`CR-2`): `loader.ts:195` cai no `ai_summary` como fallback em 100% dos turnos.

---

## Story

**Como** engenharia da Trifold, que corrigiu à mão três resumos contaminados em produção e sabe que
a fábrica que os produziu continua ligada,
**Queremos** que o `ai_summary` deixe de derivar fato de agenda da prosa — da Nicole ou de qualquer
outro — e passe a derivá-lo **exclusivamente de `appointments`**, com data absoluta e com o resumo
**barrado na escrita** quando afirmar visita que o banco não tem,
**Para que** a próxima Sandra não abra a conversa ouvindo a confirmação de uma visita que nunca
existiu — e para que o dano não volte em duas semanas com o time acreditando que foi resolvido em
agosto.

---

## Context

### 1. O dado está limpo. A fábrica não.

O Gabriel corrigiu **três resumos à mão em produção** em 07–08/08 — **Marilda, Adriele e Sandra** —
removendo a afirmação e preservando o perfil. (O gate da 87-3 registra a correção; o Epic 87
registra o `W1-3a` como **1 lead**, medido em 07/08 22h UTC. **Divergência de contagem a registrar
com o @pm:** o epic diz 1, a execução foram 3. Não muda nenhuma decisão — muda o que fica escrito.)

**Conferido por mim contra produção em 08/08 (Management API, somente SELECT):**

```
leads com ai_summary                                          226
… cujo resumo AFIRMA visita marcada                            11
… desses, SEM nenhum appointment            →  0    ← o dado está limpo ✅
```

**Zero resumos afirmando agendamento sem lastro.** A `M5` do epic está satisfeita hoje.
**E é exatamente por isso que esta story existe agora:** o defeito está invisível, a fábrica está
ligada, e a próxima passada do Haiku reabre o buraco sem que ninguém veja.

> ## 🔴 CORREÇÃO DO @po (08/08, 16h) — **o dado NÃO está limpo. A régua é que está cega.**
>
> Rodei uma régua mais larga (`agendou|agendada|agendado|marcou|marcada|confirmou visita|visita
> confirmada|possui visita`) sobre os mesmos 226 resumos, com `left join appointments`, e depois
> **li os três candidatos um a um** — porque contagem de regex sem triagem é como se publica número
> errado com AC verde:
>
> | lead | resumo | appointments | veredicto da triagem |
> |---|---|---|---|
> | *(sem nome)*, 02/07 | *"possui uma **audiência agendada** na justiça contra a empresa"* | 0 | ❌ falso positivo — não é visita |
> | **Orlice**, 05/08 | *"Lead **ainda não confirmou** visita"* | 0 | ❌ falso positivo — é **negação** |
> | 🔴 **Lucimara**, 04/08 | ***"Marcou visita ao decorado para o dia 8 (sábado)**, mas precisa confirmar o horário de trabalho antes de finalizar o agendamento"* | **0** | ✅ **CASO REAL, VIVO, NÃO CORRIGIDO** |
>
> **`select count(*) from appointments where lead_id = <Lucimara>` → 0.** E **08/08/2026 é sábado** —
> o "dia 8 (sábado)" que o resumo dela afirma **é hoje**.
>
> ### Três consequências, e nenhuma é cosmética
>
> **1. A `M5` NÃO está satisfeita.** O número honesto de hoje é **1**, não 0. A Sandra foi corrigida
> à mão; a Lucimara é a **mesma frase, do mesmo dia, do mesmo empreendimento** — e ninguém a viu.
> Duas instâncias em 226 resumos não são "o dado está limpo", são **uma taxa**.
>
> **2. 🔴 A régua do Context §2 é a mesma que a `AC10-(ii)` manda repetir depois do deploy.** Ela lê
> **0 hoje com a Lucimara viva na tabela**. Uma métrica que já está verde antes do conserto vai
> continuar verde depois dele **independentemente de o guarda funcionar**. Isso é a `AC10` se
> absolvendo sozinha, e é o defeito que esta família de stories existe para não repetir.
> **A régua passa a ser declarada literalmente e a ter baseline VERMELHO — ver AC10 revisada.**
>
> **3. A Lucimara é a segunda fixture obrigatória da `AC1`, e é mais dura que a Sandra.** Ela tem
> **dia sem hora** (igual à Sandra ⇒ `detectAffirmedSlot` continua cega) **e** uma ressalva no
> próprio texto (*"mas precisa confirmar o horário … antes de finalizar o agendamento"*). O guarda
> tem de dizer **`sem_lastro`** mesmo assim: o resumo **abre afirmando** um agendamento que não
> existe, e é a abertura que volta ao contexto no turno seguinte por `loader.ts:195`.
>
> **4. @pm:** o `W1-3a` não foram 1 nem 3 linhas — há uma **4ª** candidata a correção manual
> (Lucimara), encontrada **depois** da passada do Gabriel. Isso reforça o ponto da story: a fábrica
> está ligada e produzindo enquanto o dado é corrigido à mão.

### 2. 🔴 O achado desta story: 11 de 11 estão errados de outra forma — e ninguém tinha olhado

Mesma consulta, um campo a mais:

```
dos 11 resumos que afirmam visita marcada:
  com appointment                                  11 / 11   (100%)
  com a visita JÁ NO PASSADO                       11 / 11   (100%)   ← 🔴
  com data RELATIVA no texto                       11 / 11   (100%)   ← 🔴
```

Amostras literais (produção, 08/08):

| lead | o que o resumo diz **hoje** | quando a visita realmente foi |
|---|---|---|
| **André** | *"já possui visita agendada **para o dia seguinte** (quarta-feira) às 10h30"* | **05/08** — três dias atrás |
| **Edicleia** | *"já possui visita agendada **para amanhã** (sexta-feira às 15h)"* | **07/08** — ontem |
| **Marlene** | *"agendou uma visita … para segunda-feira, **3 de agosto** às 16h"* | 03/08 — cinco dias atrás |
| **Wilson** | *"confirmou visita para **segunda-feira 27** às 8h"* | 27/07 — doze dias atrás |

> **É o mesmo defeito de âncora do `W1-2b`, em prosa.** O epic já tinha nomeado isso — *"os 7
> resumos legítimos usam data relativa … é o mesmo defeito de âncora, em prosa, e o conserto dele é
> o `W1-3b`"* — mas com **7 de 8**. Hoje é **11 de 11**, e todas as visitas já passaram.
>
> **O que muda com o número novo:** a contaminação não é só *"ela afirma o que não existe"*. É
> também **um fato verdadeiro que expira e vira falso**, e continua entrando no contexto **em tempo
> presente** a cada turno. O `ai_summary` do André diz, agora, que ele tem visita amanhã. A `M5` do
> epic não pega isso, porque a `M5` só pergunta se existe `appointment`.
>
> **Consequência de escopo, e ela é limitante de propósito:** esta story conserta a **fábrica** — o
> resumo passa a nascer com data absoluta e sem afirmação sem lastro. Os **11 registros já
> gravados** são **dado**, não fábrica, e **ficam FORA** (ver *Fronteiras*).

### 3. São DOIS escritores, e o segundo é a maioria da população

A `87-4` provou o preço de esquecer o cron: **39 dos 56** estados residuais tinham o
`enrich-leads` como **último escritor** — 70% do problema teria sobrevivido a um conserto só no
`processMessage`. **Aqui a assimetria é ainda maior.**

| # | escritor | onde | frequência | o que ele vê |
|---|---|---|---|---|
| **A** | `updateLeadMemory` | `pipeline.ts:1567-1581` (fire-and-forget) | **a cada 5 mensagens** (`msgCount % 5 === 0`) | `userMessage` + **`assistantMessage`** + `collectedData` |
| **B** | `enrichLeadFromConversation` | `cron/enrich-leads/route.ts:177` → `leadPatch.ai_summary = enrichment.summary` | **a cada 30 min, em TODA passada, sem condição** | **a conversa inteira**, fala da Nicole incluída (`haiku-enrichment.ts:82`) |

**Medido por mim em 08/08:**

```
conversas                                                  454
… já enriquecidas pelo cron alguma vez                     209
… enriquecidas nos últimos 7 dias                           23
leads com ai_summary                                       226
… cujo lead tem conversa já enriquecida pelo cron          209   (92,5%)
```

> **Leitura honesta do número, com o método declarado:** 92,5% **não** significa que o cron escreveu
> o texto que está lá agora — não há como atribuir autoria no schema atual (nem `updated_at` por
> campo, nem log de escrita). O que ele significa é que **o cron é escritor vivo em 92,5% da
> população, e escreve `ai_summary` incondicionalmente a cada passada**, enquanto o A escreve a cada
> 5 mensagens. **Estruturalmente, B é o escritor dominante.** A atribuição real é a **T0-(b)**.
>
> **A regra que sai daqui e vale para a story inteira:** um `W1-3b` que conserte só o
> `updateLeadMemory` é um `W1-3b` declarado pronto com o defeito vivo em quase toda a população —
> literalmente o erro que a `87-4` cometeu na v1 e teve de corrigir com `AC8-b`/`T5-b`.

### 4. Por que regra de prompt sozinha não serve (e por que ainda assim há regra de prompt)

O epic é explícito: *"regra de prompt aqui é exatamente o que já falhou"* (**§7/`W1-3`**), e a
**RN8** (*"NÃO invente informações"*) existe desde sempre e não impediu **nenhum** dos incidentes.
Mas remover a fala da Nicole do insumo **sem** dar ao modelo a verdade do banco produz resumo pior
— sem *"próximo passo"*, que é o que o corretor lê.

**Desenho: três camadas, e só a terceira é garantia.**

| camada | o quê | vale sozinha? |
|---|---|---|
| 1 | **A verdade vem do banco**, renderizada deterministicamente com **data absoluta** | não — o modelo pode ignorar |
| 2 | **Regra de prompt** proibindo derivar compromisso da conversa | não — foi o que falhou 4 vezes |
| 3 | 🔴 **Guarda de escrita**: resumo que afirma visita sem lastro **não é gravado** | **sim** — é código, não texto |

---

## Cabe na Onda 1? **Sim — e a pergunta merece resposta escrita**

> **Regra de corte da Onda 1 (§6 item 2):** *nenhuma story pode adicionar um novo caminho de decisão
> da Nicole.*

| o que a story faz | é caminho de decisão novo? |
|---|---|
| Injeta no prompt do resumo uma linha vinda de `appointments` | **Não** — o dado já existe, e substitui a prosa que estava ocupando o lugar |
| Proíbe, em prompt, derivar compromisso da conversa | **Não** — subtração |
| **Barra a gravação** de um resumo sem lastro | **Não** — é filtro de **escrita** sobre um **artefato derivado**. A Nicole não responde uma palavra diferente por causa disso; o que muda é **o que o sistema guarda sobre o lead** |
| Retry / regeneração do resumo | **Ficou FORA de propósito** — ver Risco 3 |

> ### ⚖️ Ressalva do @po à linha 1 da tabela — **não é "zero", é "não é caminho de decisão"**
>
> O bloco `FATO DE AGENDA` entra no prompt do **resumo**, e o resumo volta ao contexto da Nicole a
> cada turno por `loader.ts:195` (fallback do `ai_summary`, ativo em 100% dos turnos enquanto
> L1/L2/L3 estiverem vazios — `CR-2`). **Portanto a story SIM muda, indiretamente, o que ela vê.**
> O que ela **não** faz é criar ramo novo de decisão: nenhum `if` novo, nenhum gate novo, nenhuma
> condição nova sobre a resposta.
>
> **Cabe na Onda 1 — mas por este argumento, não pelo "zero".** Escrever "zero" aqui seria a mesma
> imprecisão que fez a `M5` parecer satisfeita. E a direção da mudança é **redutora**: o bloco
> **substitui** prosa derivada por dado do banco com data absoluta. A `AC10-(iv)` (`M1`/`M4` sem
> aumento, medidas pelo cron da 87-3) é o que checa isso, e é por isso que ela não é opcional.

**O paralelo exato já foi aceito neste epic:** o `W1-2b` (87-4) barra a **escrita** do estado quando
a procedência é a fala da Nicole, e é Onda 1. Este item é a mesma operação sobre o outro artefato.

⚠️ **Onde a story estaria errada:** se o guarda passasse a alterar **a resposta ao lead** (regenerar,
degradar, silenciar). Isso é **`W3-3`** (fail-closed, Onda 3), depende de FP < 5% e de `D4`.
**Aqui o guarda só decide se GRAVA, nunca o que ela FALA.**

---

## Desenho

### 1. Um módulo, dois consumidores — e ele NÃO toca no `detectAffirmedSlot`

```
packages/ai/src/flows/summary-grounding.ts        (novo, puro, testável)

  analisarAfirmacaoDeVisita(texto, now)  →  { afirma, dia, hora, citacao }
  classificarResumo({ analise, appointmentsDoLead })
        →  "com_lastro" | "sem_lastro" | "indeterminado"
  renderFatoDeAgenda(appointments, now)  →  string determinística p/ o prompt
```

> ### 🔴 A restrição dura, e ela é herdada da 87-3
>
> **`detectAffirmedSlot` e `visit-slot.ts` NÃO podem ser tocados.** A 87-3 fixou isso por escrito
> (*"Mora AQUI, no módulo, **nunca** dentro da `detectAffirmedSlot`: mexer na função compartilhada
> invalidaria o baseline e invadiria o escopo do Epic 88"* — `agenda-reconcile.ts:99-113`), e o gate
> dela mediu **diff da função = ZERO** como critério de aceite. Qualquer regra específica de resumo
> mora no módulo novo.
>
> **E há uma razão mecânica, não só de governança:** a `detectAffirmedSlot` **não dispara na frase
> da Sandra**. Ela exige **dia E hora** (`visit-slot.ts:472`: `if (!said.day || !said.time) return
> null`), e *"Sandra agendou visita para sábado, dia 8"* **não tem hora**. Reusar a função como está
> produziria um guarda cego **justamente no caso que originou a story**.
> **Isso é a AC1 e ela exige o vermelho.**

**O que se reusa da 87-3, e é bastante:**

| reuso | de onde | por quê |
|---|---|---|
| `resolveVisitSlotParts` | `visit-slot.ts` | **chamada, não modificada** — é o parser de dia/hora do projeto |
| `JANELA_CLASSIFICACAO_MIN` (30 min) | `agenda-reconcile.ts:58` | a mesma janela do lastro. **Não inventar outra** |
| `parseTimestamptz` | `agenda-reconcile.ts:164` | `new Date("2026-06-28 13:37:40+00")` é `Invalid Date` — a armadilha nº 2 da 87-3, e ela vale aqui igual |
| `formatarBrt` / `diaBrt` | `agenda-reconcile.ts:200-208` | convenção única de data BRT no projeto |
| `createFakeSupabase` | `chat/__fixtures__/fake-supabase.ts` | o @qa provou (R8) que ele **empilha predicados de verdade** — usar, não recriar |

### 2. Os três veredictos — e só um bloqueia

| veredicto | quando | efeito |
|---|---|---|
| `com_lastro` | afirma visita **e** existe `appointment` do lead casando: dia+hora → **±30 min**; só dia → **mesmo dia BRT** | **grava** |
| 🔴 `sem_lastro` | afirma visita com dia identificável **e não existe** appointment correspondente | **NÃO grava.** Mantém o resumo anterior + emite evento |
| `indeterminado` | afirma visita mas **nenhum dia** é parseável (*"visita agendada"*, sem data) | **grava**, e emite evento de contagem |

> **Por que `indeterminado` grava (fail-open deliberado, e declarado):** bloquear o que não se
> consegue julgar congelaria resumos legítimos por ambiguidade de prosa. A doutrina de baldes é a
> mesma da 87-3 — **o que não se sabe classificar não vira alarme**, vira número. Se a contagem de
> `indeterminado` for alta na janela de 24 h, isso é insumo para uma onda posterior, **não** para
> apertar a regra durante a observação.

### 3. O fato de agenda passa a vir do banco, com data absoluta

```
FATO DE AGENDA (fonte: tabela `appointments` — a ÚNICA fonte autorizada):
  VISITA CONFIRMADA para sábado, 15 de agosto de 2026 às 10:00.
——— ou ———
  NÃO HÁ VISITA FUTURA AGENDADA. A última visita registrada foi em 05/08/2026.
——— ou ———
  NÃO HÁ VISITA AGENDADA para este lead.
```

**Regras de prompt que acompanham** (camada 2 — necessária, não suficiente):
- *"NUNCA escreva que existe visita marcada a partir da conversa. A única fonte é o bloco FATO DE
  AGENDA."*
- *"Ao citar a visita, use a **data absoluta** do bloco. NUNCA 'amanhã', 'no dia seguinte', 'este
  sábado'."* ← é o defeito medido em **11 de 11**
- *"Visita que já aconteceu se escreve no passado."*

**No escritor A**, `assistantMessage` continua entrando — **rotulado e desqualificado como fonte de
fato**:
```
CONTEXTO (fala da Nicole — NÃO é fato; nunca derive daqui compromisso, preço ou promessa): "…"
```
> **Por que não remover a fala dela de vez (a opção (i) do epic):** o resumo perderia o *"próximo
> passo"*, que é o que o corretor lê no card do lead — e o `handoff` monta em cima disso. **A
> subtração que interessa é a de autoridade, não a de contexto**, e quem garante isso é a camada 3,
> não o rótulo. Decisão a ratificar pelo @po; a alternativa (remover) é uma linha e continua na mesa.

> ### ✅ RATIFICADO PELO @po (08/08) — **manter a fala da Nicole como contexto rotulado**
>
> **Três razões, e a terceira é a que decide:**
> 1. **O "próximo passo" é o que o corretor lê.** Remover produz resumo pior num campo que tem
>    consumidor humano diário. A perda é certa; o ganho seria hipotético.
> 2. **Quem garante é a camada 3, não o rótulo.** Se o rótulo bastasse, a **RN8** (*"NÃO invente"*)
>    já teria bastado — e ela falhou em 100% dos incidentes. O rótulo é higiene; o guarda é a lei.
> 3. 🔴 **A remoção não seria nem simétrica, e isso mata o argumento.** Só o escritor **A** recebe
>    `assistantMessage` como campo separado (`lead-memory.ts:14`). O escritor **B** — que é o
>    dominante, 92,5% da população — recebe **a conversa inteira** via `haiku-enrichment.ts:82`,
>    com a fala da Nicole dentro do texto corrido. **Remover no A deixaria o B contaminando o mesmo
>    campo**, com o time acreditando que a fonte foi cortada. É exatamente a assimetria que a
>    `87-4` já pagou uma vez.
>
> **Condição da ratificação (não é carta branca):** a `AC8` já registra `citacao_curta`. Se, na
> janela de 24 h, a maioria dos bloqueios do escritor **A** tiver a frase contaminante rastreável à
> fala da Nicole, **a remoção volta à mesa** — como follow-up, com o número na mão. Ratificação é
> decisão com data, não para sempre.

### 4. Os dois escritores, um deploy só

| escritor | onde entra o guarda |
|---|---|
| **A** `updateLeadMemory` | o `.then()` de `pipeline.ts:1571-1581` **só grava** se `classificarResumo !== "sem_lastro"` |
| **B** `enrich-leads` | antes de `leadPatch.ai_summary = enrichment.summary` (`route.ts:177`); se `sem_lastro`, **a chave não entra no patch** — o resto do `leadPatch` (perfil, score) segue normalmente |

> **Um deploy, e a razão é que o artefato é um só.** Separar em dois deploys deixaria, na janela
> entre eles, um escritor limpo e o outro contaminando **o mesmo campo** — observação impossível de
> ler. É o mesmo argumento que fez a `87-4` cobrir pipeline e cron na mesma entrega (`AC8-b`).
> **O que continua valendo é um fix de SUBSTRATO por deploy:** esta story é um substrato (o resumo),
> sai sozinha, e a `87-8` (`W1-1`) só depois dela em produção.

### 5. As `appointments` do lead — de onde saem, nos dois lados

- **A (pipeline):** o `activeAppointment` de `pipeline.ts:781-788` **não serve** — filtra
  `gte("scheduled_at", now)` e traz **1**. O guarda precisa também do passado recente (é como se
  detecta o resumo vencido). **Uma consulta própria**, na janela `now ± 60 dias`, `limit` explícito,
  dentro do bloco fire-and-forget que já existe (**fora** do caminho de resposta ao lead — zero
  latência para o WhatsApp).
- **B (cron):** uma consulta por conversa processada (máx. 20 por rodada, `MAX_CONVERSATIONS_PER_RUN`).
  **Não fazer N+1 por mensagem.**

---

## Acceptance Criteria

> Toda AC diz **como se verifica**, e todo teste de regressão exige o **vermelho colado** — com a
> contagem de vermelhos **conferida**. *(Três vezes nesta semana apareceu teste que passava verde
> sob mutação — inclusive um que o próprio @dev tinha alertado e depois cometeu: gate da 87-4,
> nota `N2`, mutação `M4` declarada com 1 vermelho e medida com **0**.)*

**AC1 — 🔴 O guarda dispara nas DUAS frases literais de produção: Sandra e Lucimara.**
- (i) `analisarAfirmacaoDeVisita("Sandra agendou visita para sábado, dia 8", now)` devolve
  `afirma: true` com `dia` preenchido e `hora: null`, e `classificarResumo` devolve **`sem_lastro`**
  quando o lead não tem `appointment` naquele dia.
- (ii) 🔴 **[@po] A frase da Lucimara, literal, e ela é mais dura:**
  `"Marcou visita ao decorado para o dia 8 (sábado), mas precisa confirmar o horário de trabalho
  antes de finalizar o agendamento"` → **`sem_lastro`** (o lead tem **0** appointments em produção).
  **O guarda não pode ser absolvido pela ressalva do próprio texto:** o resumo **abre afirmando**, e
  é a abertura que volta ao contexto no turno seguinte (`loader.ts:195`).
- (iii) *Verifica-se:* teste com as duas strings literais, palavra por palavra, **no mesmo arquivo**.
**Vermelho obrigatório e ele é o coração da story:** substituindo o detector do módulo por
`detectAffirmedSlot`, **os dois** testes ficam **vermelhos** — a função exige dia **E** hora
(`visit-slot.ts:472-473`, conferido pelo @po no `HEAD`) e nenhuma das duas frases tem hora.
**Colar os quatro resultados (2 casos × antes/depois) e a contagem de vermelhos.**

**AC2 — 🔴 O resumo sem lastro NÃO é gravado, nos DOIS escritores.**
- (i) **Escritor A:** teste com `createFakeSupabase` + `fakeAnthropic` devolvendo um resumo
  contaminado → `leads.ai_summary` na tabela do fake continua **byte a byte** o anterior, e o evento
  `NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO` é emitido via `onEvent`.
- (ii) **Escritor B:** o mesmo para o handler do `enrich-leads` → `ai_summary` **ausente** do
  `leadPatch`, e **os demais campos do patch presentes** (o bloqueio é cirúrgico: perfil e score não
  são colaterais).
- (iii) **Vermelho obrigatório, um por escritor:** removendo a guarda de cada lado, cada teste fica
  vermelho. **Contar e colar os dois números separadamente.** Um guarda só num dos lados é o defeito
  que a `87-4` já cometeu uma vez.

**AC3 — O resumo COM lastro continua sendo gravado.**
*Verifica-se:* mesma fixture, com `appointment` do lead a **±10 min** do afirmado → grava
normalmente, **nenhum** evento de bloqueio.
> **Sem esta AC o guarda "funciona" retornando `sem_lastro` para tudo** — e nenhum resumo do projeto
> seria atualizado nunca mais, em silêncio.

**AC4 — 🔴 O resumo vencido é barrado: a fixture dos 11.**
Fixture literal de produção — *"já possui visita agendada para amanhã (sexta-feira às 15h)"* — com
`now` **três semanas depois** do único `appointment` do lead:
- veredicto **`sem_lastro`** (o "amanhã" resolve para amanhã; o appointment é de três semanas atrás
  e não casa em dia nenhum);
- e a variante com o appointment **realmente amanhã às 15h** → **`com_lastro`**.
**As duas fixtures no mesmo teste**, porque é o par que discrimina — uma sozinha passa verde sob
mutação.

**AC5 — A verdade do fato de agenda vem de `appointments`, com data absoluta.**
*Verifica-se:* (i) `renderFatoDeAgenda` é função pura, com teste dos três casos (visita futura /
sem futura mas com passada / nenhuma); (ii) o prompt do escritor A e o `ENRICHMENT_PROMPT` do B
**contêm** o bloco e a proibição de data relativa — teste de `toContain` sobre a string montada,
como a `87-4` fez na `AC8-b`; (iii) **vermelho:** removendo o bloco, o teste do prompt cai.

**AC6 — Os dois escritores usam o MESMO módulo.**
*Verifica-se:* `grep -rn "classificarResumo\|analisarAfirmacaoDeVisita" packages/` → as ocorrências
são **o módulo, os testes e exatamente dois consumidores**. Nenhuma regra de agenda reimplementada
em `lead-memory.ts` nem em `haiku-enrichment.ts`.
> É a lição escrita da 75-268, que aplicou a guarda a um caminho e não ao outro — e a da `87-4`,
> que precisou de `AC8-b` para o cron.

**AC7 — `detectAffirmedSlot` e `visit-slot.ts` intocados.**
*Verifica-se:* `git diff HEAD -- packages/ai/src/flows/visit-slot.ts` → **vazio**. E a suíte da 87-3
(`agenda-reconcile.test.ts`) **verde sem uma linha alterada** — se ela precisou mudar, o baseline de
lastro mudou junto, e isso invalidaria o número que dimensiona o Epic 88.

**AC8 — Observabilidade: o bloqueio é contável.**
`NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO` (via `onEvent` no A, `logEvent` no B) com
`{ lead_id, conversation_id, origem: "pipeline"|"cron_enrich_leads", veredicto, citacao_curta,
dia_afirmado, appointment_id_proximo, divergencia_min }`.
- **`citacao_curta` = no máximo 120 caracteres**, sem telefone e sem e-mail (regra de PII do `W0-2`).
- `origem` existe pelo mesmo motivo que o `origem_do_descarte` da `87-4`: **é como se sabe qual
  esteira bloqueou**, e sem ele a contagem da janela de 24 h não se desempata.
- Contagem de `indeterminado` também emitida, com `veredicto: "indeterminado"` — mesmo `event_type`,
  **uma query só**.

**AC9 — Suíte, tipos e lint.**
`npx vitest run` **da raiz** (⚠️ **nunca** `--reporter=basic` — removido no vitest 4, falha com exit
0), com a contagem **antes e depois** colada (referência do gate da 87-4: `1864 passed | 7 expected
fail`). `npx tsc --noEmit` em `packages/ai` (**é o `lint` dele — não tem eslint**) e em
`packages/web` (os erros de `sharp`/`satori`/`pdf-lib`/`react-email-editor` são pré-existentes:
declarar, não consertar).

**AC10 — Produção, janela de 24 h, com responsável nomeado (D7).**
- (i) `select count(*), metadata->>'origem' from system_events where
  event_type='NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO' group by 2;` → **as duas esteiras aparecem** se
  ambas bloquearam; um número muito alto numa delas é sinal de guarda mal calibrado, **não** de
  sucesso;
- (ii) 🔴 **[@po — RÉGUA REESCRITA v2, 09/08, fecha o `D1` do re-gate] TRÊS réguas nomeadas, com
  direções OPOSTAS declaradas, e a principal não pode ser satisfeita pelo estilo que já existe.**

  **Contexto da segunda reescrita:** a v1 desta AC usava `relativo = ai_summary ~* '…|pr(ó|o)xim[ao]'`.
  O @qa decompôs e eu remedi: o pedaço `pr(ó|o)xim[ao]` casa **183 de 231** resumos, dos quais
  **170 são literalmente "Próximo passo"** — a frase que o próprio prompt do resumo manda escrever
  (`lead-memory.ts:34`, *"Foque em: … proximo passo"*). **Satura em 11/11 antes e depois, com o
  guarda ligado ou desligado**, e marcava como defeituosa a **Marlene**, cujo resumo já usa data
  absoluta. **Era a mesma doença da `M5`, um nível acima: uma régua que não se move.**

  **A consulta, literal — copiar e colar, não parafrasear:**
  ```sql
  with l as (
    select id, name, ai_summary, updated_at from leads
     where ai_summary is not null and length(trim(ai_summary)) > 0
       and ai_summary ~* '(agendou|agendada|agendado|marcou|marcada|confirmou visita|visita confirmada|possui visita)'
       and ai_summary !~* '(ainda n(ã|a)o confirmou|audi(ê|e)ncia)'
  ), a as (
    select lead_id, count(*) n, count(*) filter (where scheduled_at > now()) fut
      from appointments group by 1
  )
  select l.name, coalesce(a.n,0) appts, coalesce(a.fut,0) futuros, l.updated_at,
    -- 🔴 RÉGUA PRINCIPAL (N2 do re-gate): data absoluta COM ANO. É o formato que a camada 1
    --    desta story ensina o modelo a emitir, e nenhum resumo do projeto o produz hoje.
    (l.ai_summary ~* '([0-9]{1,2}/[0-9]{1,2}/20[0-9]{2}|[0-9]{1,2} de (janeiro|fevereiro|mar(ç|c)o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de 20[0-9]{2})') as data_absoluta_com_ano,
    -- régua de apoio: data absoluta sem exigir ano
    (l.ai_summary ~* '([0-9]{1,2}/[0-9]{1,2}|[0-9]{1,2} de (janeiro|fevereiro|mar(ç|c)o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))') as data_absoluta,
    -- régua de apoio, direção OPOSTA: relativo ESTRITO (sem "próximo passo")
    (l.ai_summary ~* '(amanh(ã|a)|hoje|ontem|dia seguinte|essa semana|esta semana|semana que vem|pr(ó|o)xim[ao] (semana|s(á|a)bado|domingo|segunda|ter(ç|c)a|quarta|quinta|sexta|dia))') as relativo_estrito
    from l left join a on a.lead_id = l.id order by coalesce(a.n,0), l.updated_at;
  ```

  **Baseline OBRIGATÓRIO, medido por mim contra produção em 09/08 (`n = 231` resumos, `11` casam a
  régua de afirmação) — e é o que a T0 tem de reproduzir antes do código:**

  | régua | nos 11 | na população (231) | direção esperada depois do deploy |
  |---|---|---|---|
  | 🔴 **`data_absoluta_com_ano`** (principal) | **0 / 11** | **0 / 231** | **SUBIR** — é a entrega da camada 1 |
  | `data_absoluta` (apoio) | **6 / 11** | 7 / 231 | **SUBIR** |
  | `relativo_estrito` (apoio) | **2 / 11** | 7 / 231 | **CAIR** |
  | ~~`pr(ó|o)xim[ao]`~~ ❌ **PROIBIDA** | ~~11 / 11~~ | ~~183 / 231~~ | — **saturada, não usar** |

  > 🔴 **A armadilha da régua principal, e ela precisa estar escrita ou vai ser reimplementada
  > errado.** `data_absoluta_com_ano` é **formato de data**, **não** "o texto menciona um ano".
  > Medido por mim em 09/08: `ai_summary ~ '20[0-9]{2}'` casa **40 de 231**, e **39 desses 40 são
  > ANO DE ENTREGA DA OBRA** (*"entrega prevista para primeiro semestre de 2027"*) — que não tem
  > nada a ver com visita. **Implementada frouxa, a régua principal vira o `próximo passo` de novo,
  > uma ordem de grandeza menor.** Usar a expressão literal acima, sem "simplificar".
  >
  > **Divergência de leitura, registrada com o método (é a régua desta casa):** o re-gate cita
  > `data_absoluta_com_ano` em **19/231**. Eu meço **0/231** com a régua de **formato de data** e
  > **40/231** com a régua de **menção a ano**. O `19` está entre as duas ⇒ o padrão que o produziu
  > **captura ano de entrega parcialmente**. **Vale a minha, porque está escrita literalmente na
  > AC** — se a T0 medir diferente de 0, é a expressão que mudou, e aí se compara caractere a
  > caractere antes de mexer em código.
  >
  > **Por que ela é a principal e não a `data_absoluta` genérica:** `data_absoluta` já está em
  > **6/11** — mais da metade do caminho andado pelo estilo que o modelo já tem. Ela sobe fácil e
  > por acaso. **`data_absoluta_com_ano` está em 0/231: nada no projeto a produz hoje**, e é
  > exatamente o que o bloco `FATO DE AGENDA` (Desenho §3) manda escrever. **Ela só fica verde se a
  > camada 1 funcionar** — que é a definição de régua honesta.

  - **Denominador declarado:** resumos que casam a régua de afirmação **e** foram **reescritos
    depois do deploy** (`leads.updated_at > deploy`). **Resumo não reescrito não conta a favor nem
    contra** — a story conserta a fábrica, não o estoque.
  - **A janela não é de tempo, é de `n`.** Com ~3,9 enriquecimentos/dia, 24 h entregam `n ≈ 1`.
    **A AC10-(ii) só é conclusiva com `n ≥ 5`**; abaixo disso a janela se estende. *(Dimensionamento
    e operação da janela são item do @devops — aqui fica só o piso, que é meu.)*
  - **`appts = 0` continua na consulta, mas MUDOU DE PAPEL:** depois da **T8** ele é **0 por
    construção**, então **não é métrica de sucesso** — é **guarda de não-regressão**. Qualquer
    linha nova com `appts = 0` **e** `updated_at > deploy` é **gatilho de rollback imediato**, não
    "um ponto a observar".
- (iii) amostragem manual de **5 resumos reescritos** depois do deploy, conferidos contra
  `appointments` lead a lead — a régua automática não substitui ler cinco;
- (iv) **`M1` e `M4` sem aumento**, medidas pelo cron da **87-3** (`?dry=1`), que é o instrumento.
> ⚠️ **Nenhuma AC aqui depende de alerta do Telegram** — ele está **morto em produção**
> (`telegram.ts:5` suprime em silêncio; o token existe num dos projetos mas o
> `TELEGRAM_ADMIN_CHAT_ID` **não**, e a função exige os dois). A prova é `select` em
> `system_events`. Ver a caixa da Story **87-6** e a **87-9**, que corrige o canal.

**AC11 — 🔴 [@po, nova] A classe de erro nova é MEDIDA nesta story, não proposta a outro agente.**
A `T7-(b)` propunha ao @pm uma métrica para *"resumo que afirma visita com data relativa ou já
vencida"*. **Proposta a outro agente não trava nada.** Enquanto a métrica não existir no epic, a
régua desta story é a que segura o defeito — e o defeito é **12 de 12** em produção (medido pelo
@po em 08/08: **nenhum** dos resumos que afirmam visita tem appointment **futuro**, e **todos**
usam data relativa; André → visita em 05/08, Helena → 16/07, Edicleia diz *"amanhã"* e a visita foi
07/08, Wilson → 27/07).
*Verifica-se, e são três coisas separadas:*
- (i) **teste puro:** `renderFatoDeAgenda` com um `appointment` **no passado** produz o bloco
  *"NÃO HÁ VISITA FUTURA AGENDADA. A última visita registrada foi em DD/MM/AAAA."* — **nunca** um
  fato em tempo presente. **Vermelho:** com a versão que não distingue passado de futuro, cai;
- (ii) **régua em produção:** as **três colunas** da AC10-(ii) — `data_absoluta_com_ano` (principal,
  **0/11** hoje, deve **subir**), `data_absoluta` (**6/11**, deve subir) e `relativo_estrito`
  (**2/11**, deve **cair**) —, com o baseline colado na T0 e remedidas **entre os reescritos**
  quando `n ≥ 5`. ⚠️ **A régua `pr(ó|o)xim[ao]` é proibida aqui pelo mesmo motivo que na AC10:
  satura em 11/11 e 183/231, e 170 desses são a frase "Próximo passo" que o próprio prompt manda
  escrever;**
- (iii) **a proposta ao @pm continua** (T7-b) — mas como **registro**, não como a garantia.
> **Por que isto vira AC:** a `M5` do epic pergunta *"existe `appointment`?"* e responde **sim** para
> todos os 12. É uma métrica que **não consegue ficar vermelha** nesta classe de erro. Deixar o
> conserto dependendo dela é escrever a AC contra um instrumento que já se sabe cego.

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/flows/lead-memory.ts` | 10-54 | `updateLeadMemory` — escritor **A**. O prompt inteiro tem 7 regras e **nenhuma** sobre compromisso |
| `packages/ai/src/chat/pipeline.ts` | 1558-1565 | `msgCount % 5 === 0` — o gatilho do A |
| ” | 1567-1581 | a chamada + o `.then()` que grava `ai_summary` |
| ” | 781-788 | `activeAppointment` — **só futuro, `limit(1)`**: não serve ao guarda |
| `packages/web/src/app/api/cron/enrich-leads/route.ts` | 176-177 | `leadPatch.ai_summary = enrichment.summary` — escritor **B**, incondicional |
| `packages/ai/src/flows/haiku-enrichment.ts` | 30-63 | `ENRICHMENT_PROMPT` — já foi editado pela `87-4` (`AC8-b`): **ler o comentário dela antes de mexer** |
| `packages/ai/src/flows/agenda-reconcile.ts` | 58, 164, 200-208 | janela de 30 min, `parseTimestamptz`, `formatarBrt`/`diaBrt` — **reusar** |
| `packages/ai/src/flows/visit-slot.ts` | 464-474 | `detectAffirmedSlot` — **NÃO TOCAR** (AC7) |
| `packages/ai/src/memory/loader.ts` | 195 | onde o `ai_summary` volta ao contexto — é o que fecha o loop |

### Armadilhas

1. **A frase da Sandra não tem hora.** Reusar `detectAffirmedSlot` cru = guarda cego no caso-mãe (AC1).
2. **`Invalid Date` silencioso** — `new Date("2026-06-28 13:37:40+00")` é inválido. Usar
   `parseTimestamptz`. Foi a armadilha nº 2 da 87-3 e ela publica número errado com AC verde.
3. **Âncora.** O `now` do guarda é **o instante da escrita**, e isso é correto aqui (o resumo está
   sendo escrito agora) — **mas nunca reancorar** um resumo antigo ao ler. O guarda roda **só na
   escrita**.
4. **Fire-and-forget do A.** O `.then()` de `pipeline.ts:1571` não é aguardado; um `throw` dentro do
   guarda vira `unhandledRejection` silencioso. **Envolver em `try/catch` e, no erro, GRAVAR como
   hoje** (fail-open no erro do guarda — bloquear por bug do guarda seria pior que o defeito).
5. **`packages/ai` não tem eslint** — o `lint` dele é `tsc --noEmit`.
6. **Rodar vitest da raiz. Nunca `--reporter=basic`.**
7. **Não mexer em `visit-slot.ts`** — invalida o baseline da 87-3 (AC7).

### Fronteiras com outras stories

| Item | Dono | Por que não é aqui |
|---|---|---|
| Reescrever/limpar os **11 resumos vencidos** já gravados | **proposta ao @pm** (mesma família do `W1-3a`) | É **dado**, não fábrica. Esta story impede novos; os velhos são um `UPDATE` revisado por humano, com backup (**R-B**) |
| Regenerar a resposta ao lead / degradar / silenciar | **`W3-3`** (Onda 3) | Fail-closed sobre a **resposta** exige FP < 5% e `D4` |
| Bloco de fatos autorizados tipado | **`W3-1`** | Aqui só o **fato de agenda**, e só no prompt do resumo |
| `collected_data` como JSON cru no system prompt | **`W1-6`** | Outro lugar onde o fato falso chega ao modelo |
| Histórico = cauda | **`W1-1` / Story 87-8** | **Deploy 3**, depois desta |
| Fala do corretor no histórico | **`W1-7` / Story 87-5** | Deploy 4 |
| Reviver o MemPalace (L1/L2/L3) | **`W4-4`**, atrás de **D2** | Enquanto estiverem vazios, o `ai_summary` é o caminho ativo — e é o que esta story protege |

---

## Tarefas

- [x] **T0** — Medir **antes** de escrever código, e colar as consultas: (a) 🔴 **rodar a régua
      literal da AC10-(ii)** (a do @sm no Context §2 lê 0 e não serve de baseline) — referência do
      @po, 08/08: **226** com resumo · **12** casam a régua · **1 com `appts = 0`** (Lucimara, caso
      real e vivo) · **12/12** sem appointment futuro e com texto relativo.
      🔴 **[@po 09/08] Baseline SUPERSEDIDO pela AC10-(ii) v2** — a coluna `relativo` da v1 satura
      (183/231, dos quais 170 são "Próximo passo"). **O baseline que vale para a validação em
      produção é o de 09/08, na tabela da AC10-(ii):** `n = 231` · **11** afirmam ·
      `data_absoluta_com_ano` **0/11 e 0/231** · `data_absoluta` **6/11** · `relativo_estrito`
      **2/11** · `appts = 0` em **0** (Lucimara já corrigida na T8). **A T0 não precisa ser
      refeita** — o que muda é qual número a AC10 compara; (b) **tentar atribuir
      autoria** do texto atual entre A e B — se não for possível com o schema atual, **escrever que
      não é**, em vez de estimar; (c) rodar `detectAffirmedSlot` sobre os **11** textos e publicar em
      quantos ela dispara (previsão minha: poucos, por falta de hora — se der alto, o desenho do
      módulo muda e a AC1 precisa ser revista **antes** do código).
- [x] **T1** — Módulo `summary-grounding.ts` puro + testes, com os vermelhos da AC1 e da AC4.
- [x] **T2** — Escritor **A**: consulta de `appointments` (±60 d), bloco `FATO DE AGENDA`, rótulo do
      `assistantMessage`, guarda no `.then()`, evento (AC2-i, AC5, AC8).
- [x] **T3** — Escritor **B**: mesma guarda antes do `leadPatch.ai_summary`, mesmo evento com
      `origem: "cron_enrich_leads"`, regra no `ENRICHMENT_PROMPT` (AC2-ii, AC5, AC8).
- [x] **T4** — AC3, AC6, AC7 (o `git diff` vazio de `visit-slot.ts` e a suíte da 87-3 intacta).
- [x] **T5** — Suíte + `tsc` nos dois pacotes, contagem antes/depois (AC9).
- [ ] **T6** — **Deploy sozinho** + 24 h, AC10 com responsável nomeado (D7).
- [x] **T7** — Reportar ao **@pm**: (a) o `W1-3a` foram **3** linhas, não 1 — e há uma **4ª**
      candidata encontrada depois (Lucimara), o que muda a leitura de "o dado está limpo";
      (b) proposta de métrica nova (*"resumo que afirma visita com data relativa ou já vencida"*) —
      a `M5` não a cobre e **não consegue ficar vermelha** nesta classe (AC11); (c) decisão sobre os
      **12** registros já gravados.
- [x] **T8** — 🔴 **[@po] Corrigir a Lucimara à mão ANTES do deploy**, no mesmo padrão do `W1-3a`
      (remover a afirmação, preservar o perfil, com backup — **R-B**). **Duas razões:** o resumo dela
      afirma uma visita para **hoje** que não existe, e é lido a cada turno; e deixá-la na tabela
      contamina o "depois" da AC10 com uma linha de "antes". **Registrar a linha original no Dev
      Agent Record** — ela é a fixture da AC1-(ii) e não pode se perder na correção.

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| **1** | **Guarda bloqueia demais e o resumo congela** — o lead fica com o texto antigo indefinidamente | **Alta** | AC3 (o caminho bom testado) + AC8 (contagem por esteira) + AC10-(i) na janela de 24 h. **O congelado nunca é pior que hoje**: hoje o texto errado já está lá e continua sendo lido |
| **2** | **Guarda bloqueia de menos** — prosa de terceira pessoa não dispara o detector | **Alta** | **AC1** com a frase literal da Sandra e o vermelho contra `detectAffirmedSlot`; **T0-(c)** mede antes de escrever código |
| **3** | Retry/regeneração ser acrescentado "de brinde" | Média | **Fora de escopo, escrito:** é chamada de modelo a mais em caminho fire-and-forget, e é comportamento novo. Se a contagem de bloqueio for alta, é insumo para outra onda |
| **4** | Consertar só o escritor A e declarar pronto | **Alta** | **AC2-(iii)**: dois vermelhos, um por escritor, contados separadamente. É o erro que a `87-4` cometeu e teve de corrigir |
| **5** | Mexer em `visit-slot.ts` e invalidar o baseline de lastro da 87-3 | **Alta** | **AC7**: `git diff` vazio + suíte da 87-3 sem uma linha alterada |
| **6** | Latência no turno do WhatsApp por causa da consulta de `appointments` | Baixa | O escritor A já é **fire-and-forget**, fora do caminho da resposta; o B é cron |
| **7** | Erro dentro do guarda derrubar a escrita do resumo | Média | Armadilha 4: `try/catch` com **fail-open no erro do guarda** (grava como hoje) e evento de erro |
| **8** | O `qualification_score` mudar de tabela por efeito colateral | Baixa | O bloqueio é **só** da chave `ai_summary` no patch (AC2-ii afirma os demais campos presentes) |

---

## Critério de rollback (D7) — escrito ANTES do deploy

**Reversão:** `git revert` do PR. **Nenhuma migration.** **Nenhum dado a restaurar** — a story
**impede** escrita, nunca apaga: todo `ai_summary` existente permanece exatamente como está.

**Gatilhos de reversão, na janela de 24 h:**
- **qualquer** resumo novo afirmando visita sem `appointment` correspondente (é a tese da story);
- volume de `NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO` desproporcional — a régua e o limiar são
  **declarados na T0** com base no volume medido de escrita de resumo, **não** improvisados no dia;
- aumento em **M1** ou **M4**, medidos pelo cron da **87-3**;
- qualquer erro novo no cron `enrich-leads` (ele escreve `leads` e `conversation_state`: um `throw`
  ali tem raio maior que esta story).

**Responsável nomeado:** ✅ **MARCOS** — nomeado pelo Gabriel em 09/08. **`D7` RESOLVIDO nesta
story.** ⚠️ A janela dele **não é de 24 h, é de `n ≥ 5` resumos reescritos** (AC10-(ii)): com ~3,9
enriquecimentos/dia, 24 h entregam `n ≈ 1` e a janela terminaria sem dado. *(texto anterior: a
definir, Marcos ou Thielly, 24 h — condição aberta desde a rodada 1 da `87-4`.)*

## Definition of Done

- [x] AC1 a AC11 verificadas, com os **vermelhos** e os verdes colados no Dev Agent Record, e as
      contagens de vermelho **conferidas uma a uma** (nota de processo `D5` da 87-4)
- [x] 🔴 **Lucimara corrigida à mão (T8)**, com a linha original preservada no Dev Agent Record
- [ ] 🔴 **[@po 09/08 — substitui o item anterior] A validação em produção usa a AC10-(ii) v2:**
      **`data_absoluta_com_ano` como régua PRINCIPAL** (0/11 e **0/231** hoje ⇒ só fica verde se a
      camada 1 funcionar), com `data_absoluta` (6/11, sobe) e `relativo_estrito` (2/11, cai) de
      apoio. **`pr(ó|o)xim[ao]` é proibida** — satura em 11/11 e 183/231, e marcava a Marlene (que
      já usa data absoluta) como defeituosa. **`appts = 0` deixa de ser métrica de sucesso** (é 0
      por construção depois da T8) e passa a ser **guarda de não-regressão com rollback imediato**
- [ ] **AC10-(ii) só declarada conclusiva com `n ≥ 5` resumos reescritos** — 24 h entregam `n ≈ 1`
- [x] `git diff HEAD -- packages/ai/src/flows/visit-slot.ts` **vazio**
- [x] Uma única implementação da regra de agenda do resumo (AC6, por `grep`)
- [ ] Deploy **isolado**, com responsável nomeado ✅ **Marcos** (D7 resolvido, 09/08), e janela por
      **`n ≥ 5`** resumos reescritos — **não** por 24 h de relógio
- [x] **@pm avisado:** `W1-3a` = 3 linhas (não 1); proposta de métrica para o resumo **vencido**;
      decisão sobre os 11 registros gravados
- [x] **@po:** ✅ **RATIFICADO em 08/08 — manter** a fala da Nicole como contexto rotulado
      (Desenho §3), com a condição escrita lá: se a maioria dos bloqueios do escritor A na janela de
      24 h tiver a frase contaminante rastreável à fala dela, a remoção volta à mesa como follow-up

---

## Referências (seção específica, não documento inteiro)

- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **§1/`CR-3`** (o `ai_summary`
  como amplificador, com a frase da Sandra), **§7/Onda 1** (`W1-3b` = deploy 2; `W1-3a` e os 7
  resumos com data relativa cujo conserto *"é o `W1-3b`"*), **§6 item 2** (regra de corte),
  **§3/`M5`** (a métrica que esta story mantém em zero — e que **não** cobre o resumo vencido)
- `docs/qa/gates/87.4-estado-de-agenda-com-ancora-temporal.yml` — **`N2`/`M4`** (a mutação declarada
  com 1 vermelho e medida com **0** — a razão de a contagem de vermelhos ser AC aqui), **`C2`**
  (consertar no lado que escreve, não no caminho de exceção), **`D5`** (nota de processo)
- `docs/stories/87-4-estado-de-agenda-com-ancora-temporal.story.md` — **`AC8-b`** e **`T5-b`**: o
  precedente de cobrir o cron **na mesma story**, e o comentário já escrito no `ENRICHMENT_PROMPT`
- `docs/stories/87-3-reconciliacao-diaria-fala-x-banco.story.md` + `packages/ai/src/flows/agenda-reconcile.ts`
  — a doutrina de **baldes**, a **janela de 30 min**, `parseTimestamptz`, e a regra de **não tocar**
  na `detectAffirmedSlot`
- `docs/stories/87-6-dedupe-atomico-lastro-diario.story.md` — a caixa do **Telegram morto**, que é
  por que a AC10 se apoia em `select` e não em alerta
- Story **75-279** — origem do `createFakeSupabase` (o @qa provou na R8 que ele aplica predicados de
  verdade)

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Modelo:** claude-opus-5 · **Data:** 2026-08-08
**Branch:** `story/87-7-resumo-sem-lastro`

> ⚠️ **Divergência de base a registrar (@devops):** a story manda sair de `main`, mas o **PR #380
> (87-4) ainda estava ABERTO** no momento da implementação (`origin/main` = `76d0e45d`, a 87-3).
> Esta story edita `haiku-enrichment.ts` e `cron/enrich-leads/route.ts` — **os mesmos dois arquivos
> que a 87-4 alterou**. Sair de `main` produziria conflito garantido no merge. A branch saiu do
> **HEAD da `story/87-4`** (stacked). **O PR desta story só pode ser aberto depois do #380.**

### T0 — as medições ANTES do código (read-only, Management API, `dsopqkqjkmhytudaaolv`)

**(a) 🔴 A régua literal da `AC10-(ii)`, rodada em 08/08 18:42 UTC — BASELINE VERMELHO, confirmado:**

```
linhas que casam a régua ......... 12   (referência do @po: 12 ✅)
… com `appts = 0` ................  1   (Lucimara)      ← 🔴 O VERMELHO EXIGIDO PELA DoD
… com `futuros = 0` .............. 12 / 12  (100 %)
… com `relativo = true` .......... 12 / 12  (100 %)
```

| lead | appts | futuros | relativo | `leads.updated_at` |
|---|---|---|---|---|
| **Lucimara** | **0** | 0 | ✅ | 2026-08-04 16:40 |
| Juca | 1 | 0 | ✅ | 2026-07-24 11:54 |
| Wilson | 1 | 0 | ✅ | 2026-07-27 11:50 |
| Miriam | 1 | 0 | ✅ | 2026-07-31 14:30 |
| André | 1 | 0 | ✅ | 2026-08-07 14:00 |
| Maria Oliveira | 1 | 0 | ✅ | 2026-08-07 14:18 |
| Sueli | 1 | 0 | ✅ | 2026-08-07 18:28 |
| Edicleia | 1 | 0 | ✅ | 2026-08-07 18:54 |
| Andréia | 1 | 0 | ✅ | 2026-08-07 19:21 |
| Marlene | 1 | 0 | ✅ | 2026-08-08 13:37 |
| Valnira | 1 | 0 | ✅ | 2026-08-08 13:37 |
| Helena | 3 | 0 | ✅ | 2026-07-30 15:27 |

O baseline do @po bate linha a linha. A `M5` **não** está satisfeita, e a `AC11` está vermelha em
**12 de 12**.

**(b) 🔴 A atribuição de autoria entre A e B é IMPOSSÍVEL com o schema atual — e está escrito, não
estimado.** `leads` não tem `ai_summary_updated_at` nem `ai_summary_source`: as únicas colunas de
tempo são `updated_at`, **de linha inteira**. Testei o proxy "escreveu por último quem tem
`leads.updated_at` colado em `conversations.last_enriched_at`":

```
leads com ai_summary ......................... 226
… sem cron nenhum ............................  17
… |updated_at − last_enriched_at| ≤  5 s .....  18
… |updated_at − last_enriched_at| ≤ 60 s .....  20
… divergentes (> 60 s) ....................... 189
```

**O proxy não tem poder discriminante:** os 189 "divergentes" não provam que o pipeline escreveu —
qualquer `update` em qualquer coluna de `leads` (roleta, corretor, meta-sync, o próprio cron
gravando `qualification_score`) move o `updated_at`. **Conclusão: não é possível atribuir. Registrar
isso, não estimar.** O que continua verdadeiro é o número estrutural do @sm: o cron é escritor vivo
em 92,5 % da população e escreve `ai_summary` **incondicionalmente** a cada 30 min.

**(c) 🔴 `detectAffirmedSlot` sobre os 12 textos: dispara em 9 de 12 — e a previsão do @sm ("poucos")
estava errada no número e CERTA na consequência.**

Rodada com âncora = `leads.updated_at` de cada linha (o instante de escrita):

| não dispara (3) | dispara (9) |
|---|---|
| **Lucimara** (`appts = 0`), Sueli, Helena | Juca, Wilson, Miriam, André, Maria Oliveira, Edicleia, Andréia, Marlene, Valnira |

> **O desenho do módulo NÃO muda, e a `AC1` fica em pé — por um motivo mais forte que a contagem:**
> a `detectAffirmedSlot` **não dispara em nenhuma das linhas com `appts = 0`**. Ela é cega em
> **100 % dos casos que o guarda existe para pegar** (Lucimara hoje; Sandra em 05/08). Que ela
> dispare em 9 resumos *que têm appointment* é irrelevante para o guarda — nessas o que decide é a
> comparação com o banco, não o detector. Os outros dois `NULL` (Sueli, Helena) são por
> `isAmbiguousSlotText` sobre o parágrafo inteiro (2+ horários), que é o outro modo de cegueira que
> a análise por frase deste módulo resolve.

### Vermelhos — cada mutação aplicada, rodada e CONTADA (nota `D5` da 87-4)

*Cada linha abaixo foi executada de verdade: mutação aplicada no arquivo, `vitest` rodado, número
lido da saída, mutação revertida e suíte reverificada verde.*

| # | Mutação | Vermelhos | Quais |
|---|---|---|---|
| **M-AC1** | detector do módulo trocado pela semântica da `detectAffirmedSlot` (exige dia **E** hora) | **5** | AC1-(i) Sandra · AC1-(ii) Lucimara · AC1-(ii-b) resumo inteiro · "as mesmas frases passam a com_lastro" · AC3 "cancelled conta" |
| **M-A** | guarda do **escritor A** removido (grava sempre, como o `HEAD`) | **1** | AC2-(i) "`ai_summary` continua BYTE A BYTE o anterior" |
| **M-B** | guarda do **escritor B** removido (`leadPatch.ai_summary` incondicional) | **2** | AC2-(ii) "`ai_summary` AUSENTE do patch" · "o bloqueio é CIRÚRGICO" |
| **M-AC4** | classificador rebaixado à regra da `M5` (`existe appointment?` e só) | **2** | AC4 "appointment três semanas atrás → sem_lastro" · AC3 "60 min NÃO tem lastro" |
| **M-AC5** | bloco `FATO DE AGENDA` removido dos **dois** prompts | **2** | AC5 escritor A · AC5 escritor B |
| **M-AC11** | `renderFatoDeAgenda` sem distinguir passado de futuro | **3** | AC11-(i) · "futura cancelada" · AC5 do escritor A |

> **`AC2-(iii)` — os dois números, separados, como a AC pede: A = 1, B = 2.** O vermelho do A é
> **um só de propósito** e é o que importa: a asserção `ai_summary` **byte a byte** igual ao
> anterior. Os outros testes do A continuam verdes sob `M-A` porque o **evento** é emitido de
> qualquer jeito — o que é o comportamento correto (o evento conta a classificação, não a gravação).
> Não inflei a contagem criando asserção redundante: o erro da 87-4 foi declarar 1 e medir 0, não
> declarar 1.

### AC a AC

| AC | Onde se verifica | Estado |
|---|---|---|
| **AC1** | `summary-grounding.test.ts` — as **duas strings literais no mesmo arquivo**, mais o resumo COMPLETO da Lucimara. Vermelho `M-AC1` = **5** | ✅ |
| **AC2-(i)** | `lead-memory.test.ts` — `createFakeSupabase` + `fakeAnthropic`, `leads.ai_summary` byte a byte + evento por `onEvent`. Vermelho `M-A` = **1** | ✅ |
| **AC2-(ii)** | `enrich-leads/route.test.ts` — `ai_summary` ausente do `leadPatch`, `preferred_bedrooms`/`profissao`/`name`/`qualification_score`/`interest_level` **presentes**. Vermelho `M-B` = **2** | ✅ |
| **AC3** | Testado nos **três** níveis: puro (±10 min), escritor A e escritor B. Mais o par que discrimina (±60 min → `sem_lastro`) | ✅ |
| **AC4** | Fixture literal da Edicleia, com o **par no mesmo bloco**: appointment 3 semanas atrás → `sem_lastro`; realmente amanhã 15h → `com_lastro`. Vermelho `M-AC4` = **2** | ✅ |
| **AC5** | `renderFatoDeAgenda` puro nos 3 casos + `toContain` sobre o prompt montado **dos dois** escritores. Vermelho `M-AC5` = **2** | ✅ |
| **AC6** | `grep -rn "classificarResumo\|analisarAfirmacaoDeVisita" packages/` → módulo + testes + `flows/index.ts` + **exatamente dois consumidores** (`lead-memory.ts`, `enrich-leads/route.ts`). **Nada reimplementado** em `haiku-enrichment.ts` | ✅ |
| **AC7** | `git diff HEAD -- packages/ai/src/flows/visit-slot.ts` → **VAZIO**. `agenda-reconcile.ts` e `agenda-reconcile.test.ts` → **VAZIOS**. A suíte da 87-3 verde sem uma linha alterada | ✅ |
| **AC8** | `NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO` nos dois lados, com `origem` (`pipeline` \| `cron_enrich_leads`), `veredicto`, `citacao_curta` (≤ **120**, sem telefone/e-mail), `dia_afirmado`, `appointment_id_proximo`, `divergencia_min`. `indeterminado` usa o **mesmo `event_type`** (uma query só) com `level: info` | ✅ |
| **AC9** | Suíte e tipos abaixo | ✅ |
| **AC10** | Baseline da T0 **medido e vermelho**. (i)/(ii)/(iii)/(iv) dependem do deploy — **T6, não é minha** | ⏳ |
| **AC11** | (i) teste puro com appointment no passado, vermelho `M-AC11` = **3**; (ii) coluna `relativo` com baseline **12/12** colado na T0; (iii) o registro ao @pm está na T7 | ✅ (i)(ii)(iii) · (ii) reabre na janela |

### AC9 — suíte, tipos e lint

```
ANTES (worktree limpo em HEAD):  Test Files 5 failed | 152 passed (157)   Tests 1864 passed | 7 expected fail (1871)
DEPOIS:                          Test Files 5 failed | 153 passed (158)   Tests 1899 passed | 7 expected fail (1906)
```

**+35 testes, 0 falha nova.** O `1864 | 7` bate exatamente com a referência do gate da 87-4.
Os **5 arquivos vermelhos são os mesmos antes e depois**, e são erro de *collect* por dependência
nativa ausente, não teste quebrado: `marketing/arte-cta`, `arte-faixa`, `arte-gen`, `arte-logo`
(`sharp`/`satori`) e `pastas/termo/fill` (`pdf-lib`).

```
packages/ai   →  npx tsc --noEmit  →  ZERO erros   (é o `lint` dele — não tem eslint)
packages/web  →  npx tsc --noEmit  →  16 erros, TODOS pré-existentes e declarados:
                 .next/types/validator.ts (3) · react-email-editor (3) · sharp/satori (7) · pdf-lib (1)
                 erros em arquivos tocados por esta story: ZERO
```

⚠️ Rodado da **raiz**, sem `--reporter=basic`.

### 🔴 T8 — Lucimara corrigida à mão (a exceção de escrita, declarada)

Executada em **2026-08-08 18:58:58 UTC**, com `update … where id = … AND md5(ai_summary) = '<hash lido>'`
— trava otimista: se a linha tivesse mudado entre a leitura e a escrita, o update não teria pegado
nada. Retornou 1 linha.

**A LINHA ORIGINAL, preservada (é a fixture da `AC1-(ii)`):**

> Lucimara demonstra interesse no empreendimento Vind Residence, especificamente em unidades de 2
> suítes com vista para a rua (frente). Não tem preferência por andar (aceitou qualquer nível) e
> informou que não precisa de vagas de garagem. **Marcou visita ao decorado para o dia 8 (sábado),
> mas precisa confirmar o horário de trabalho antes de finalizar o agendamento.** Lead mostrou
> interesse genuíno e disponibilidade para conhecer o imóvel em breve. Próximo passo: aguardar
> confirmação de horário de Lucimara para finalizar agendamento da visita.

- `lead_id`: `da999818-b076-4f4e-9d2d-e972123caec4` · `updated_at` original: `2026-08-04 16:40:16.992+00`
- `md5` original: `b722dca51e56257634d8041844e2bdf1` → novo: `180c22aeb60b7a86e4d79fb9ce30710d`
- **Backup + SQL de restauração** gravados fora do repo (não versionar PII):
  `T8-backup-lucimara.json` e `T8-restore-lucimara.sql` (scratchpad da sessão). O texto original
  também está **acima, literal** — é a fonte de verdade para restaurar.
- **Sem risco de o cron desfazer:** a conversa dela é `is_ai_active = false`, `last_message_at`
  31/07. O `enrich-leads` filtra `is_ai_active = true` + janela de 30 min — não a alcança.

**Texto novo (perfil preservado, afirmação removida):**

> Lucimara demonstra interesse no empreendimento Vind Residence, especificamente em unidades de 2
> suítes com vista para a rua (frente). Não tem preferência por andar (aceitou qualquer nível) e
> informou que não precisa de vagas de garagem. Demonstrou disponibilidade para conhecer o decorado,
> mas precisa checar o horário de trabalho antes de fechar uma data. Próximo passo: retomar o
> contato para definir dia e horário da visita.

Conferido antes de escrever: o texto novo **não casa a régua da `AC10-(ii)`** e o próprio módulo o
classifica como `sem_afirmacao`.

### 🔴 O que a T8 faz com a `AC10-(ii)`, e o @qa precisa ler isto antes de medir

Régua rodada **de novo, depois da T8** (ainda **antes** do deploy):

```
linhas ........... 11   ·   appts = 0 ....... 0   ·   futuros = 0 ..... 11/11   ·   relativo ..... 11/11
```

> **A metade `appts = 0` da régua voltou a ficar VERDE antes do conserto — por construção, porque a
> própria story mandou corrigir a Lucimara (T8).** Isso não invalida a AC, mas muda qual coluna
> carrega a prova: **na janela de 24 h, quem discrimina é a coluna `relativo`** (a `AC11-(ii)`), que
> está em **100 % (11/11)** e pode cair. `appts = 0` continua sendo **gatilho de rollback** — um
> resumo novo com `appts = 0` reprova o deploy —, mas **ler "appts = 0 → 0" como sucesso seria
> exatamente a métrica que se absolve sozinha** que o @po consertou. **Denominador continua sendo só
> os resumos reescritos na janela; `< 5` ⇒ inconclusivo.**

### T7 — para o @pm (o registro; a garantia é a AC11)

1. **`W1-3a` foram 3 linhas, não 1** (Marilda, Adriele, Sandra) — e agora são **4**: a **Lucimara**
   foi corrigida por mim na T8, encontrada **depois** da passada do Gabriel. O epic registra **1**.
2. **A `M5` é cega para a classe "visita verdadeira que expirou e virou falsa".** Medido hoje:
   **12 de 12** dos resumos que afirmam visita **não têm appointment futuro** e **todos** usam data
   relativa. A `M5` pergunta "existe appointment?" e responde **sim** para os 12 — é uma métrica que
   **não consegue ficar vermelha** aqui. Métrica nova necessária. Enquanto não existir, a **AC11**
   desta story é o que segura.
3. **Decisão pendente sobre os 11 registros já gravados** (era 12; a Lucimara saiu na T8). São
   **dado**, não fábrica: esta story impede novos, e os velhos pedem `UPDATE` revisado por humano
   com backup (**R-B**). Nenhum deles é urgente pelo critério de "afirma visita inexistente" — todos
   têm appointment; o defeito deles é o **tempo verbal**.
4. **A atribuição de autoria A × B é impossível no schema atual** (T0-b). Se o epic quiser essa
   leitura, ela exige coluna nova (`ai_summary_updated_at`/`ai_summary_source`) — é migration, é
   outra story.

### Decisões autônomas

| # | Questão | Decisão | Por quê |
|---|---|---|---|
| 1 | Base da branch, com o #380 ainda aberto | Sair do **HEAD da `story/87-4`** (stacked), não de `main` | Esta story edita os **mesmos dois arquivos** que a 87-4 (`haiku-enrichment.ts`, `enrich-leads/route.ts`). Sair de `main` = conflito garantido. **O PR só depois do #380** |
| 2 | Um 4º veredicto (`sem_afirmacao`) além dos três do Desenho §2 | **Criado**, e documentado no módulo | Chamar de `com_lastro` um resumo que **não fala de agenda** seria mentir no evento e inflar a contagem. Os três veredictos da story continuam sendo os que decidem a escrita; **nenhum bloqueia além do `sem_lastro`** |
| 3 | A negação desqualifica a frase inteira? | **Não — só quando vem ANTES do verbo** | É o que separa a Orlice (*"ainda não confirmou visita"* → não é afirmação) da Lucimara (*"Marcou visita … mas precisa confirmar"* → **é**). A `AC1-(ii)` exige literalmente que a ressalva posterior **não** absolva |
| 4 | Onde mora a consulta de `appointments` | **Uma só**, no módulo (`carregarAppointmentsDoLead`), chamada pelos dois | Duas consultas divergiriam, e é o defeito que a `AC6` existe para impedir |
| 5 | Testar o escritor A pelo `processMessage` ou por função extraída? | **Função extraída** (`atualizarResumoComLastro`), chamada pelo `.then()` do pipeline | O bloco é fire-and-forget: testar pelo `processMessage` exigiria `setTimeout` para "esperar" a promise — teste com relógio, que é como se declara verde o que não rodou. A AC2-(i) é atendida **literalmente** (`createFakeSupabase` + `fakeAnthropic` + `ai_summary` byte a byte + `onEvent`) |
| 6 | Cancelar/expirar: `cancelled` conta como lastro? | **Conta** para o lastro; **não** aparece como "VISITA CONFIRMADA" no bloco do prompt | Lastro é a doutrina da 87-3 (*"uma visita desmarcada depois EXISTIU"*). Anunciar visita cancelada como confirmada no prompt seria criar um fato falso novo |
| 7 | Curto-circuitar quando o Haiku devolve o **mesmo** resumo | **Não** — mantida a condição do `HEAD` (`if (novoResumo)`) | Pareceria economia, mas faria o guarda nunca avaliar o caso "o modelo repetiu o resumo contaminado", e o evento da AC8 **subcontaria em silêncio** |

### Riscos que continuam de pé (para o @qa e para a janela de 24 h)

1. 🔴 **O volume de bloqueio pode ser ALTO no dia 1, e isso não é bug.** Dos 12 resumos de hoje,
   quase todos afirmam visita com data relativa vencida — se qualquer um deles for reescrito, o
   guarda barra. **`AC10-(i)` mede; o limiar de rollback é volume desproporcional, não volume alto.**
   O congelado nunca é pior que hoje: hoje o texto errado já está lá e já é lido a cada turno.
2. **Fail-open em três lugares, de propósito:** consulta de `appointments` falha → grava como hoje;
   erro dentro do guarda → grava como hoje + evento de erro; `indeterminado` → grava + conta.
3. **A story muda, indiretamente, o que a Nicole vê** (bloco `FATO DE AGENDA` → resumo →
   `loader.ts`). É a ressalva escrita do @po. **`AC10-(iv)` (`M1`/`M4` pelo cron da 87-3) não é
   opcional.**
4. **Nenhuma AC depende de alerta** — a prova é `select` em `system_events`. Canal é `87-9`.

### 🔴 Rodada 2 — resposta ao gate FAIL (09/08)

#### F1 (HIGH) — CORRIGIDO. Era o único que quebrava lead com visita real.

**Reproduzido antes de consertar**, exatamente como o gate descreveu, inclusive o "trava para sempre":

```
Marlene (literal prod)          now=08/08  dia={2027,7,3} → sem_lastro  diaAfirmado=2027-08-03  div=525600
bloco da camada 1, NO DIA       now=15/08  dia={2026,7,15} → com_lastro  div=0
bloco da camada 1, DIA SEGUINTE now=16/08  dia={2027,7,15} → sem_lastro  div=525600   ← trava
```

A causa é `parseDayParts` (`visit-slot.ts`, intocável pela `AC7`): ela foi escrita para um **lead
pedindo** visita, assume que toda data está no futuro, **rola a vencida para frente e ignora o ano
escrito no texto**. Aqui o texto é um resumo que quase sempre fala de visita **que já aconteceu**.

**Conserto, em duas metades, ambas em `summary-grounding.ts`:**

1. **Ano escrito manda** (`anoEscrito`, duas formas conservadoras: `"… de 2026"` e `"03/08/2026"`).
   Se a frase traz o ano, ele substitui o palpite e **não abre back-off nenhum**.
2. **Sem ano escrito, o dia é ambíguo pelo tamanho exato do rolo** (`candidatosDeDia`). Cada
   candidato corresponde a **um ramo da `parseDay`**, não a um chute: `−1 ano` (ramo `"N de <mês>"`),
   `−1 mês` (ramo `"dia N"`), `−7 dias` (ramo do dia da semana).

E `diaAfirmado`/`divergenciaMin` passaram a descrever **o mesmo candidato** — publicar
`dia_afirmado: 2027-08-03` ao lado de `divergencia_min: 60` seria um par que se contradiz na
própria linha, e foi assim que o `F1` se escondeu do evento.

**Depois do conserto, contra os 11 resumos REAIS com as `appointments` REAIS:**

| | gate (antes) | agora |
|---|---|---|
| `com_lastro` | 2 | **6** |
| `sem_lastro` | 7 | **3** |
| `indeterminado` | 2 | **2** |

**Os 3 `sem_lastro` restantes, lidos um a um** (número sem triagem foi como o F1 se escondeu):

| lead | resumo afirma | appointment real | veredicto |
|---|---|---|---|
| **Juca** | sábado às **11h30** | 11/07 **10:00**, `no_show` | ✅ bloqueio certo — outro sábado E outra hora |
| **Miriam** | 8 de julho às **10h** | 08/07 **11:00**, `no_show` | ✅ bloqueio certo — 60 min > janela de 30 (a classe do Ailton, 87-3) |
| **Edicleia** | *"para **amanhã** (sexta às 15h)"* | **07/08** 15:00 — o **próprio dia** em que o resumo foi escrito | ✅ bloqueio certo — é a classe da `AC11` |

Nenhum é `F1`-residual. **Vermelho novo `M-F1` = 4** (reverter o conserto derruba 4 testes; antes
nenhuma fixture o alcançava, porque **todas afirmavam dia ≥ `now`**).

#### F2 (HIGH) — a coluna `relativo` que EU propus é inerte. Retirada.

**Decomposto e conferido por mim contra os 231 resumos, não copiado do gate:**

```
resumos ....................................... 231
… casam `pr(ó|o)xim[ao]` ...................... 183   ← 79 %
… … dos quais literalmente "Próximo passo" .... 170
`relativo` (minha régua) sobre os 11 .......... 11/11 (100 %)   ← inerte: satura antes e depois
```

Ela marcava como defeituosa a **Marlene**, cujo resumo **já usa data absoluta** (*"3 de agosto"*) —
o mesmo caso do `F1`. **Réguas do @qa adotadas, medidas por mim e batendo:**

```
relativo_estrito ..... 2/11    (deve CAIR)
data_absoluta ........ 6/11    (deve SUBIR)
```

```sql
-- relativo_estrito
ai_summary ~* '(amanh(ã|a)|dia seguinte|hoje|esta semana|est[ae] (s(á|a)bado|domingo|segunda|ter(ç|c)a|quarta|quinta|sexta)|pr(ó|o)xim[ao] (semana|s(á|a)bado|domingo|segunda|ter(ç|c)a|quarta|quinta|sexta))'
-- data_absoluta
ai_summary ~* '([0-9]{1,2} de (janeiro|fevereiro|mar(ç|c)o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)|[0-9]{1,2}/[0-9]{1,2})'
```

Nenhuma das duas satura, e as duas se movem em direção declarada. **É a `AC10-(ii)` e a
`AC11-(ii)` de agora em diante.**

> **O padrão que eu preciso parar de repetir:** duas propostas seguidas de métrica que não
> discrimina (`appts = 0`, depois `relativo`). Nos dois casos escrevi a régua e **não a decompus
> contra o corpus antes de publicar**. Régua nova agora só entra com a contagem de **quantos
> casam por acidente** ao lado.

#### F3 (MEDIUM) — CORRIGIDO. As duas camadas do escritor dominante estavam despinadas.

O teste que existia assertava sobre o **argumento** `fatoDeAgenda`, com
`enrichLeadFromConversation` **dublado** — mutar `${blocoAgenda}` ou `${REGRAS_FATO_DE_AGENDA}` dava
**0 vermelhos**. A `AC5-(ii)` nomeia a **string montada**. Teste novo em
`haiku-enrichment.test.ts` chama a função **de verdade** (só o cliente Anthropic é dublado).
**`M-F3a` = 1 e `M-F3b` = 1**, onde antes eram 0.

#### M-NEG — a regra estava aprovada, a justificativa estava ERRADA. Corrigida.

O gate mediu `M-NEG` = 0 e estava certo: **a frase da Lucimara não tem token de negação nenhum.**
O que a separava da Orlice era o *"não"* da Orlice, **não a posição dele**. Escrevi o par que de
fato prova a regra — *"Marcou visita … **mas não confirmou** o horário ainda"*, com a negação
**depois** do verbo, que uma regra de frase inteira absolveria. **`M-NEG` = 1.**

#### Contagens REFEITAS — agora contra a suíte INTEIRA (o erro era rodar só o arquivo do módulo)

| Mutação | rodada 1 (errada) | gate | **rodada 2, suíte inteira** |
|---|---|---|---|
| `M-AC1` detector → `detectAffirmedSlot` | 5 | 11 | **14** |
| `M-F1` conserto do F1 revertido | — | 0 | **4** |
| `M-AC4` classificador → regra cega da `M5` | 2 | — | **5** |
| `M-AC11` `renderFatoDeAgenda` sem passado/futuro | 3 | 4 | **5** |
| `M-AC5` bloco não passado pelos 2 chamadores | 2 | — | **2** |
| `M-F3a` `${blocoAgenda}` fora do prompt montado | — | **0** | **1** |
| `M-F3b` `REGRAS` fora do `ENRICHMENT_PROMPT` | — | **0** | **1** |
| `M-NEG` negação vale na frase inteira | — | **0** | **1** |
| `M-A` guarda do escritor **A** | 1 | 1 ✅ | **1** |
| `M-B` guarda do escritor **B** | 2 | — | **2** |

**Suíte:** `1864` (HEAD) → **`1910 passed | 7 expected fail`**. `tsc` de `packages/ai` zero; zero
erros nos arquivos da story em `packages/web`. **`AC7`: `git diff` de `visit-slot.ts` e de
`agenda-reconcile*` continua com 0 linhas.**

#### Premissa corrigida pelo coordenador

O `enrich-leads` **está vivo** (`max(last_enriched_at)` de hoje, 27 conversas em 7 dias) — ele não
emite `system_events`, por isso parecia parado. **Isso torna o `F1` dano ativo, não hipotético:**
o escritor dominante reescreve a cada 30 min e bloquearia todo lead com visita real. Quem nunca
rodou é o cron da 87-3 (`NICOLE_%` = 0 all-time), o que mantém a `AC6` da 87-3 `PENDING` e é
pré-requisito da `AC10-(iv)` desta story.

### File List

**Criados**
- `packages/ai/src/flows/summary-grounding.ts`
- `packages/ai/src/flows/summary-grounding.test.ts`

**Modificados**
- `packages/ai/src/flows/lead-memory.ts` — prompt com `FATO DE AGENDA` + rótulo da fala da Nicole; `atualizarResumoComLastro` (escritor A com guarda + evento)
- `packages/ai/src/flows/lead-memory.test.ts` — AC2-(i), AC3, AC5, fail-open
- `packages/ai/src/flows/haiku-enrichment.ts` — `fatoDeAgenda` no input + `REGRAS_FATO_DE_AGENDA` no `ENRICHMENT_PROMPT`
- `packages/ai/src/flows/index.ts` — exports do módulo novo (o cron consome via `@trifold/ai`)
- `packages/ai/src/chat/pipeline.ts` — o `.then()` que gravava `ai_summary` passou para `atualizarResumoComLastro`
- `packages/web/src/app/api/cron/enrich-leads/route.ts` — escritor B: consulta única de `appointments`, bloco no prompt, guarda antes do `leadPatch.ai_summary`, evento com `origem`
- `packages/web/src/app/api/cron/enrich-leads/route.test.ts` — AC2-(ii), AC3, AC5 (+ `lte` no builder do fake)
- `packages/ai/src/flows/haiku-enrichment.test.ts` — **rodada 2 / F3:** `AC5-(ii)` sobre o prompt MONTADO, com `enrichLeadFromConversation` de verdade

**NÃO tocados (AC7, conferido por `git diff` vazio)**
- `packages/ai/src/flows/visit-slot.ts` · `packages/ai/src/flows/agenda-reconcile.ts` · `packages/ai/src/flows/agenda-reconcile.test.ts`

**Produção (T8, exceção declarada)**
- `leads.ai_summary` do lead `da999818-…` (Lucimara) — 1 linha, com trava de hash e original preservado acima

## QA Results

## RODADA 2 — **CONCERNS** (código aprovado; deploy bloqueado em D1/D2, que não são do @dev)

**Revisor:** @qa (Quinn) · **Data:** 2026-08-09 · **Gate:** `docs/qa/gates/87.7-resumo-nao-grava-a-fala-da-nicole-como-fato.yml`
**Suíte:** `1864` (HEAD) → **`1910 passed | 7 expected fail`** · `tsc` de `packages/ai` **zero** ·
`packages/web` só os 16 pré-existentes · **AC7: `git diff` de `visit-slot.ts` + `agenda-reconcile*` = 0 linhas**
Rodei **17 mutações da raiz** e restaurei a árvore (recontada em 1910 no fim).

### 1. O conserto do F1 é recuperação, não afrouxamento — três provas

| mutação | vermelhos | |
|---|---|---|
| `M-F1` conserto revertido | **4** | bate com o declarado ✅ |
| `M-F1a` só a ano-autoridade removida | 1 | a metade tem defesa própria |
| `M-F1b` só o back-off removido | 3 | a outra metade também |
| 🔴 `M-F1c` **back-off alargado para ±60 dias** | **2** | **o afrouxamento É pego** |
| `M-DIVERG` `dia_afirmado` volta ao literal | 2 | o par contraditório tem defesa |

**A prova que responde à pergunta "afrouxar é o caminho fácil de fazer o número subir":** a fixture
da **AC4** (*appointment três semanas atrás → `sem_lastro`*) é a borda — 21 dias não é `−7d`, não é
`−1 mês`, não é `−1 ano` —, e ela **fica vermelha** quando o back-off vira "casa quase sempre".
A régua que separa recuperação de afrouxamento existe e está no vermelho.

**E as quatro recuperações têm `divergencia_min = 0`** — não "casou dentro da janela": casou no
minuto. Rodei o módulo contra os 11 resumos reais com as `appointments` reais:

```
DISTRIBUIÇÃO   com_lastro 6 · sem_lastro 3 · indeterminado 2      (rodada 1: 2 · 7 · 2)

Helena   −1 ano   "sábado, 27 de junho, às 10h" ↔ 27/06/2026 10:00 BRT   div 0
Marlene  −1 ano   "segunda, 3 de agosto às 16h" ↔ 03/08/2026 16:00 BRT   div 0
André    −7 dias  "dia seguinte (quarta) 10h30" ↔ 05/08/2026 10:30 BRT   div 0
Valnira  −7 dias  "quinta-feira às 10h"         ↔ 06/08/2026 10:00 BRT   div 0
```

Conferi a triagem dos 3 restantes um a um e ela está certa: Juca (outro sábado **e** outra hora,
div 10170), Miriam (div 60 > janela de 30), Edicleia (div 1440, classe da AC11). Nenhum é
`F1`-residual. E o par do evento ficou coerente: Miriam agora publica `2026-07-08` + `60 min`.

### 2. F2 — as réguas novas, remedidas por mim contra produção

```
resumos ......................................... 231
… casam `pr(ó|o)xim[ao]` ........................ 183  (79 %)
… … literalmente "Próximo passo" ................ 170        ← a decomposição dele bate

relativo_estrito ..... 2/11   (população 5/231)   deve CAIR
data_absoluta ........ 6/11   (população 7/231)   deve SUBIR
appts = 0 ............ 0/11   → gatilho de rollback, nunca prova de sucesso
```

Nenhuma satura em nenhuma direção, e as direções são opostas e declaradas. A regra de método que
ele escreveu — *"régua nova só entra com a contagem de quantos casam por acidente ao lado"* — é a
correção do padrão, não do sintoma.

### 3. F3, M-NEG e as contagens

`M-F3a` = **1** e `M-F3b` = **1** (eram **0**): o teste novo chama `enrichLeadFromConversation`
**de verdade**, com só o cliente Anthropic dublado, e asserta sobre a string montada — que é o que
a AC5-(ii) nomeia. `M-NEG` = **1**, com o par certo (*"Marcou visita … **mas não confirmou** o
horário ainda"*, negação **depois** do verbo).

**Contagens:** 9 de 10 batem exatamente (`M-F1` 4 · `M-AC4` 5 · `M-AC11` 5 · `M-A` 1 · `M-B` 2 ·
`M-F3a`/`M-F3b`/`M-NEG` 1 · `M-AC5` 1+1). **A exceção é `M-AC1`:** ele declarou **14**; medi **13**
(exigir hora só no ramo que já achou dia) e **15** (replicar a `detectAffirmedSlot` inteira). Não
muda conclusão — discrimina com folga em qualquer forma —, mas **a forma da mutação precisa estar
escrita junto do número**, senão a contagem deixa de ser reproduzível.

### 4. Achados novos

| # | Sev | O quê |
|---|---|---|
| **N1** | MEDIUM | **O back-off abre uma janela estreita de falso `com_lastro`.** Medi: uma 2ª visita FALSA no **mesmo dia-da-semana e mesma hora** de uma visita real anterior passa a `com_lastro` (ramo `−7d`); idem "dia N" do mês anterior (`−1 mês`). Mudar a hora ou o dia já bloqueia; o caso-mãe (lead sem appointment) é imune. **Exposição: 16 leads** com IA ativa e visita passada. É inerente (a `parseDayParts` apaga "sábado passado" × "próximo sábado" e a AC7 proíbe tocá-la) e o trade é claramente favorável — o defeito da rodada 1 congelava **todo** lead com visita real. **Registrar como risco residual; follow-up: usar tempo verbal/preposição para preferir o candidato futuro** |
| **N2** | LOW | **Há uma terceira coluna melhor, e ela está no chão:** `data_absoluta_com_ano` (`de 20\d\d` ou `DD/MM/AAAA`) é **0/11** hoje (19/231 na população). É exatamente o que a camada 1 emite e a camada 2 manda copiar, e **não pode ser satisfeita pelo estilo que já existe**. Sugestão ao @po |
| **N3** | LOW | `M-PIPE` continua **0** — a ligação `onEvent: emit` segue sem defesa. Aceito na rodada 1; linha reconferida no diff |

### 5. Condições de deploy — nenhuma é do @dev

1. 🔴 **D1 (@po, bloqueante)** — **a `AC10-(ii)` no corpo da story ainda é a régua inerte.** A régua
   nova está no Dev Agent Record e no gate, mas a AC é do @po e não foi atualizada. **Quem executar
   a T6 lendo a AC vai medir com o instrumento que já provamos que não se move** — exatamente o
   defeito que esta família existe para não repetir. Considerar também a `data_absoluta_com_ano` (N2).
2. 🔴 **D2 (@devops, bloqueante)** — janela por `n`, não por horas: ~3,9 conversas enriquecidas/dia
   e 6 dos 11 régua-positivos reescritos em 7 dias ⇒ 24 h entrega `n ≈ 1`. Observar até `n ≥ 5`.
3. **D3 (@devops)** — a AC10-(iv) exige chamada manual (`?dry=1`): `NICOLE_%` em `system_events`
   segue **0 all-time**.
4. **D4 (@devops, bloqueante)** — `D7` aberto: sem responsável nomeado, o deploy não sai.

> **Código aprovado para merge.** As três condições HIGH fecharam com prova medida, e o @dev
> corrigiu o padrão além do sintoma nas duas vezes em que eu apontei uma régua que não discriminava.
> O que segura o CONCERNS é a AC que ainda não acompanhou o código — e essa não é dele.

*— Quinn, guardião da qualidade 🛡️*

---

## RODADA 1 — FAIL *(superada pela rodada 2; registro preservado)*

**Revisor:** @qa (Quinn) · **Data:** 2026-08-09 · **Rodada:** 1 · **Veredicto: 🔴 FAIL**
**Gate:** `docs/qa/gates/87.7-resumo-nao-grava-a-fala-da-nicole-como-fato.yml`

### O que está certo, e conferi rodando, não lendo

- **Suíte:** medi os dois lados. `HEAD` sem a story = **1864 passed | 7 expected fail**; com a story
  = **1899 | 7**. +35, mesmos 5 arquivos de collect quebrado (`sharp`/`satori`/`pdf-lib`). Da raiz.
- **`tsc`:** `packages/ai` **zero**; `packages/web` 16, todos pré-existentes, **zero** em arquivo tocado.
- **AC1 ✅** — as duas frases literais; `detectAffirmedSlot` devolve `null` nas duas e no resumo
  inteiro da Lucimara; o detector novo pega as duas. A cegueira dela cobre 100 % dos casos com
  `appts = 0`, como o @dev argumentou.
- **AC2 ✅ — e o "1" do escritor A é o vermelho CERTO.** Apliquei `M-A` eu mesmo: cai **exatamente 1**,
  a asserção *byte a byte* — e ela cai porque o `createFakeSupabase` aplica os predicados e a
  asserção lê a linha da tabela **depois** do update. Não é teste que não discrimina. `M-B` = **2**,
  como declarado. `M-AC4` = **2**, como declarado.
- **AC6 ✅** (módulo + testes + barrel + dois consumidores) · **AC7 ✅** (`visit-slot.ts` e
  `agenda-reconcile` com diff **vazio**).
- **T8 ✅ — foi só isso.** Conferi no banco: md5 do resumo da Lucimara = `180c22aeb6…30710d`
  (o novo declarado), `updated_at = 2026-08-08 18:58:58`, texto batendo palavra por palavra,
  `count(appointments)` ainda **0**. Uma linha, trava por hash, original preservado.

### 🔴 F1 (HIGH) — o guarda bloqueia resumo CORRETO, e piora com esta story

Rodei o módulo contra os **11 resumos reais** de produção, com as `appointments` reais e a âncora
real de escrita: `sem_lastro` **7** · `indeterminado` **2** · `com_lastro` **2**. O guarda
discrimina de verdade (Maria Oliveira e Sueli saíram `com_lastro`, `divergência = 0`). Mas **2 dos
7 bloqueios são falsos positivos**:

```
Marlene | "agendou uma visita para segunda-feira, 3 de agosto às 16h"
        | appointment REAL 2026-08-03 16:00 BRT — bate no minuto
        | veredicto sem_lastro · dia_afirmado 2027-08-03 · divergencia_min 525600
```

`parseDayParts` rola a data vencida para o **ano seguinte** — **e ignora o ano escrito no texto**
("3 de agosto **de 2026**" → `2027-08-03`). O formato `DD/MM/AAAA`, que é o outro que o
`renderFatoDeAgenda` emite, não é parseado (vira `indeterminado`).

**Por que isso é bloqueante e não ruído:** o texto abaixo é o que a **camada 1 desta story** ensina
o modelo a escrever, com ano por extenso, e o appointment existe e casa:

```
"Ana já possui visita agendada para sábado, 15 de agosto de 2026 às 10:00."   appt = 15/08 10:00 BRT
  now = 10/08 → 2026-08-15 · div 0      · com_lastro  ✅
  now = 15/08 → 2026-08-15 · div 0      · com_lastro  ✅
  now = 16/08 → 2027-08-15 · div 525600 · sem_lastro  🔴  (para sempre)
```

O escritor B reescreve a cada 30 min. **A partir do dia seguinte à visita, todo lead que teve visita
de verdade passa a ter a reescrita bloqueada** — e fica congelado no tempo presente vencido, que é
exatamente a classe de erro que a **AC11** existe para matar (12/12 do @po). O guarda preserva o
defeito que veio matar, nos leads que se comportaram certo. Nenhuma fixture da suíte alcança isso:
**todas** afirmam dia ≥ `now`.

### 🔴 F2 (HIGH) — a AC10-(ii) não valida nada: as duas colunas estão inertes

Rodei a régua literal hoje (09/08 18:21 UTC): **11 linhas · `appts = 0` → 0 · `relativo` → 11/11**.
Bate com o pós-T8 do @dev. **Decompus a coluna `relativo`:**

```
casam por "Próxim[ao]"  (de "Próximo passo:")  ....... 11 / 11
casam por data relativa DE VERDADE ................... 2 / 11   (André, Edicleia)
na população inteira: 182 de 230 resumos têm "próxim[ao]"; só 3 têm "amanhã|dia seguinte|este sábado"
```

O @dev viu metade — `appts = 0` nasce verde por construção (a T8) — e propôs a coluna `relativo`
como discriminante da janela. **Ela não pode discriminar:** é boilerplate do Haiku, está em 100 %
antes do conserto e continuará em 100 % depois, com o guarda ligado ou desligado. É a mesma classe
de defeito que o @po consertou na v0.2, **espelhada**: em vez de uma métrica que não consegue ficar
vermelha, uma que não consegue ficar verde. E ela mente na direção errada — a **Marlene**, cujo
resumo **já usa data absoluta**, aparece como `relativo = true`.

**Baselines que medi e que servem** (sobre as mesmas 11): `relativo_estrito` **2/11 (18 %)** ·
`data_absoluta` **6/11 (55 %)**. Régua e regexes no gate.

### Os outros achados (detalhe e recomendação no gate)

| # | Sev | O quê |
|---|---|---|
| **F3** | MEDIUM | **AC5 do escritor B não é testada como a AC manda.** Tirar `${blocoAgenda}` do prompt montado do Haiku → **0 vermelhos**. Tirar `${REGRAS_FATO_DE_AGENDA}` do `ENRICHMENT_PROMPT` → **0 vermelhos**. O "2º vermelho" declarado vem de mutar `route.ts`, linha diferente da que a AC nomeia. Camadas 1 e 2 do escritor **dominante** (92,5 %) estão despinadas |
| **F4** | MEDIUM | **Contagem declarada ≠ medida em 2 de 6:** `M-AC1` declarado **5**, medido **11** (raiz); `M-AC11` declarado **3**, medido **4**. Direção segura (discriminam mais), mas a story fez da contagem conferida uma AC — e o método variou entre mutações |
| **F5** | MEDIUM | **A regra posicional da negação não é exercida:** `M-NEG` = **0 vermelhos**. E a justificativa está errada — a frase da Lucimara **não tem token de negação nenhum**; o que a separa da Orlice é o "não" da Orlice. A regra está certa; a prova não existe |
| **F6** | MEDIUM | **A janela de 24 h não alcança `n ≥ 5`:** ~3,9 conversas enriquecidas/dia; 6 dos 11 régua-positivos reescritos em **7 dias**. A AC10-(ii) se declararia inconclusiva pela própria regra |
| **F7** | LOW | `onEvent: emit` do `pipeline.ts` não é exercido (`M-PIPE` = 0 vermelhos) — consequência aceita da Decisão nº 5; diff de uma linha, conferido |
| **F8** | LOW | **Zero eventos na janela é ambíguo** — não há batimento positivo que separe "nada a bloquear" de "o guarda não rodou" |

### Os julgamentos que o gate pedia

| Questão | Veredicto |
|---|---|
| Análise **por frase** | ✅ **Aprovado** — e é defendida por teste (`M-FRASE` = 1 vermelho, o resumo inteiro da Lucimara) |
| Negação **só antes do verbo** | ⚠️ **Regra aprovada, prova e justificativa reprovadas** (F5) |
| 4º veredicto `sem_afirmacao` | ✅ **Concordo** — não muda escrita, mantém o evento honesto, e é necessário: **182 de 230** resumos nem falam de agenda |
| Regra de corte da Onda 1 | ✅ **Cabe**, e a ressalva é a leitura certa. Com o F1 vivo, o resumo **congelado** é o que ela lê todo turno — mais um motivo para o F1 ser bloqueante |
| Escrita em produção (T8) | ✅ **Conforme — foi só isso** |

### 🔴 Correção de premissa (para o @devops)

**O `enrich-leads` está VIVO.** `max(conversations.last_enriched_at)` = **hoje 15:30 UTC**, 4 nas
últimas 24 h, 26 em 7 dias; e há `billing_collector_failed` / `subscription_enrich_vercel_failed`
de hoje. A esteira do escritor B **é observável** — o problema da janela é de **volume** (F6), não
de cron morto. **O que de fato nunca rodou é o cron da 87-3:** `system_events` com
`event_type like 'NICOLE_%'` → **0 all-time**. Isso torna a **AC10-(iv)** dependente de chamada
manual (`?dry=1`), e isso precisa estar escrito no plano de deploy. A causa é infraestrutura e
**não é desta story**.

### Condições para a rodada 2

1. **C1 (F1, obrigatória)** — corrigir o rollover **dentro do módulo** (AC7 continua: não tocar
   `visit-slot.ts`): honrar ano de 4 dígitos e `DD/MM/AAAA`, e não aceitar rollover longo sem ano.
   Fixtures novas com o vermelho colado (data absoluta **já passada** + appointment que bate →
   `com_lastro`) e a distribuição contra os 11 resumos reais recolada.
2. **C2 (F2, obrigatória — é do @po)** — régua da AC10-(ii) com `relativo_estrito` e
   `data_absoluta`, `appts = 0` rebaixado a gatilho de rollback, janela dimensionada por `n ≥ 5`.
3. **C3 (F3, obrigatória)** — teste sobre o prompt **montado** do escritor B, com os dois vermelhos
   que hoje são zero.
4. **C4 (F4)** — recontar as seis mutações **da raiz**.
5. **C5 (F5)** — fixture com negação **depois** do verbo + corrigir a justificativa da Decisão nº 3.
6. **C6 (F8, opcional)** — batimento positivo do guarda.

> **Não deployar antes de C1 e C2.** Com o F1 vivo, o deploy congela os resumos dos leads que
> tiveram visita de verdade; com o F2 vivo, a janela de observação não distinguiria isso de sucesso.
> A garantia central da story está de pé e bem construída — o que falta é o guarda parar de errar
> onde o próprio conserto o leva, e a régua voltar a poder se mover.

*— Quinn, guardião da qualidade 🛡️*

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-09 | 0.4 | **@dev — resposta ao gate FAIL. Os três achados corrigidos.** 🔴 **`F1` (o único que quebrava lead com visita real): reproduzido antes de consertar**, inclusive o "trava para sempre no dia seguinte" (`div=525600`). Causa: `parseDayParts` foi escrita para um **lead pedindo** visita — assume futuro, **rola a data vencida para frente e ignora o ano escrito**; aqui o texto é um resumo que fala de visita **já ocorrida**. Conserto em duas metades, ambas fora da `visit-slot.ts` (AC7 preservada, `git diff` = 0 linhas): **(1) ano escrito manda** e não abre back-off; **(2) sem ano, um candidato por RAMO de rolo da `parseDay`** (`−1 ano`, `−1 mês`, `−7 dias`) — cada um justificado por um ramo, não por chute. `diaAfirmado` e `divergenciaMin` passaram a descrever **o mesmo candidato**: publicar `2027-08-03` ao lado de `div: 60` era o par contraditório que escondia o defeito do próprio evento. **Contra os 11 resumos reais com as `appointments` reais: `com_lastro` 2 → 6, `sem_lastro` 7 → 3** — 4 leads com visita REAL recuperados —, e **os 3 restantes lidos um a um** (Juca: outro sábado e 11h30 vs 10h; Miriam: 10h vs 11h, a classe do Ailton; Edicleia: "amanhã" para uma visita que foi no próprio dia). **`M-F1` = 4**, onde nenhuma fixture alcançava — todas afirmavam dia ≥ `now`. 🔴 **`F2`: a coluna `relativo` que eu propus é INERTE, e eu decompus o regex por mim mesmo contra os 231 resumos: `pr(ó|o)xim[ao]` casa 183, dos quais 170 são literalmente "Próximo passo"** — ela satura em 11/11 antes e depois, e marcava como defeituosa a Marlene, cujo resumo **já usa data absoluta**. **Retirada.** Adotadas e remedidas as réguas do @qa: **`relativo_estrito` 2/11 (deve cair) e `data_absoluta` 6/11 (deve subir)**, nenhuma saturada, as duas com direção declarada. **O padrão a parar de repetir: duas propostas seguidas de métrica que não discrimina (`appts = 0`, depois `relativo`) — nos dois casos publiquei a régua sem decompor contra o corpus.** **`F3`: o teste do prompt do cron assertava o ARGUMENTO com a função dublada** — `M-F3a`/`M-F3b` davam **0**. Teste novo em `haiku-enrichment.test.ts` chama `enrichLeadFromConversation` **de verdade**: **1 e 1**. **`M-NEG` = 0 estava certo e a minha justificativa estava errada** — a frase da Lucimara **não tem negação nenhuma**; o que a separa da Orlice é o "não" da Orlice, não a posição. Escrito o par que de fato prova a regra (negação DEPOIS do verbo): **`M-NEG` = 1**. **Todas as contagens refeitas contra a suíte INTEIRA** (o erro era rodar só o arquivo do módulo): `M-AC1` **14** (declarei 5), `M-AC11` **5** (declarei 3), `M-AC4` **5**, `M-AC5` **2**, `M-A` **1** ✅, `M-B` **2**. Suíte **1864 → 1910 passed | 7 expected fail**. **Premissa corrigida:** o `enrich-leads` está VIVO (não emite `system_events`, por isso parecia parado) — o que torna o `F1` **dano ativo**, não hipotético. | @dev (Dex) |
| 2026-08-08 | 0.3 | **@dev — implementado. Ready → Ready for Review.** Módulo novo `summary-grounding.ts` (puro) + guarda de escrita nos **dois** escritores num deploy só. **T0 rodada antes do código e o baseline da `AC10-(ii)` saiu VERMELHO como a DoD exige: 12 linhas, 1 com `appts = 0` (Lucimara), 12/12 com `futuros = 0` e `relativo = true`** — bate linha a linha com o @po. **T0-(b): a atribuição de autoria A × B é IMPOSSÍVEL no schema atual** (só existe `leads.updated_at`, de linha inteira; o proxy contra `last_enriched_at` atribui 18/226 e 189 "divergentes" que não provam nada) — **escrito, não estimado**. **T0-(c): `detectAffirmedSlot` dispara em 9 de 12, não em "poucos" — e o desenho não muda, por um motivo mais forte: ela NÃO dispara em nenhuma linha com `appts = 0`**, ou seja, é cega em 100 % dos casos que o guarda existe para pegar. Vermelhos **aplicados, rodados e contados um a um** (nota `D5`): `M-AC1` = **5**, **`M-A` (escritor A) = 1**, **`M-B` (escritor B) = 2**, `M-AC4` = **2**, `M-AC5` = **2**, `M-AC11` = **3**. Suíte **1864 → 1899 passed** (+35), `7 expected fail` nos dois, mesmos 5 arquivos vermelhos pré-existentes (`sharp`/`satori`/`pdf-lib`). `tsc` de `packages/ai` **zero**; `packages/web` só os pré-existentes declarados. **AC7 conferido: `git diff` de `visit-slot.ts` VAZIO**, e `agenda-reconcile` intocado. **T8 executada** — Lucimara corrigida com trava de hash, original preservado literal no Dev Agent Record; a conversa dela é `is_ai_active = false`, então o cron não desfaz. 🔴 **Achado que o @qa precisa ler antes de medir: depois da T8 a metade `appts = 0` da régua da `AC10-(ii)` voltou a ficar VERDE antes do conserto (por construção — a própria story mandou corrigir). Na janela de 24 h quem discrimina é a coluna `relativo`, hoje em 11/11; `appts = 0` continua sendo gatilho de rollback, mas não é prova de sucesso.** 🔴 **Divergência de base:** o PR #380 (87-4) ainda estava ABERTO; esta story edita os mesmos dois arquivos, então a branch saiu do HEAD da `story/87-4` (stacked) — **o PR só pode ser aberto depois do #380**. | @dev (Dex) |
| 2026-08-09 | 0.3 | **@po — `AC10-(ii)` v2, fechando o `D1` do re-gate (CONCERNS). Só a AC; nenhum escopo reaberto.** O `D1` estava certo e era meu: as réguas boas já existiam no Dev Agent Record e no gate, mas **a AC no corpo da story continuava a antiga** — e quem executa a validação lê a AC. **Remedi as quatro candidatas de forma independente contra produção (09/08, `n = 231`, `11` afirmam visita) e confirmo os números do @dev e do @qa um a um:** `pr(ó|o)xim[ao]` casa **183/231**, dos quais **170 são literalmente "Próximo passo"** — a frase que o próprio prompt manda escrever (`lead-memory.ts:34`) — satura em **11/11** e marcava a **Marlene** como defeituosa, sendo que o resumo dela **já usa data absoluta**; `relativo_estrito` **2/11** (7/231); `data_absoluta` **6/11** (7/231); `data_absoluta_com_ano` **0/11 e 0/231**. **`pr(ó|o)xim[ao]` proibida na AC, por escrito.** 🔴 **N2 aceito: `data_absoluta_com_ano` vira a régua PRINCIPAL** — é a única que **não pode ser satisfeita pelo estilo que já existe** (0 em 231 resumos; nada no projeto a produz hoje) e é exatamente o formato que o bloco `FATO DE AGENDA` da camada 1 ensina; a `data_absoluta` genérica já tem **6/11 do caminho andado** e sobe por acaso. **Divergência registrada com o método:** o re-gate cita `data_absoluta_com_ano` em **19/231**; eu meço **0/231** com régua de **formato de data** e **40/231** com régua de **menção a ano** — e **39 desses 40 são ano de ENTREGA DA OBRA** (*"entrega prevista para primeiro semestre de 2027"*). O 19 está entre as duas, ou seja, o padrão que o produziu captura ano de entrega parcialmente; **implementada frouxa, a régua principal vira o `próximo passo` de novo, uma ordem de grandeza menor.** A AC passa a carregar a **expressão literal**, com a armadilha escrita ao lado. Mais duas correções do mesmo raciocínio: **`appts = 0` mudou de papel** — depois da T8 é **0 por construção**, então deixa de ser métrica de sucesso e vira **guarda de não-regressão com rollback imediato**; e **a janela é de `n`, não de relógio** — `AC10-(ii)` só conclusiva com **`n ≥ 5`** resumos reescritos, porque ~3,9 enriquecimentos/dia entregam `n ≈ 1` em 24 h. **`D7` RESOLVIDO: o Gabriel nomeou o MARCOS** (condição aberta desde a rodada 1 da `87-4`). Itens restantes do re-gate são do @devops. | @po (Pax) |
| 2026-08-08 | 0.2 | **@po — GO com emendas. Draft → Ready.** 🔴 **O achado que muda a story: o dado NÃO está limpo.** Rodei uma régua mais larga sobre os mesmos 226 resumos e **li os candidatos um a um**: dos 3 com `appointments = 0`, dois são falsos positivos (*"audiência agendada na justiça"* e *"ainda não confirmou visita"*) e **um é real** — **Lucimara**, `ai_summary` de 04/08: *"Marcou visita ao decorado para o dia 8 (sábado), mas precisa confirmar o horário…"*, com **zero appointments**, e **08/08/2026 é sábado** — o resumo afirma, hoje, uma visita que nunca existiu. É a **mesma frase da Sandra**, no mesmo empreendimento, **não corrigida**. Consequências: (1) a **`M5` não está satisfeita** — o número honesto é 1, não 0; (2) 🔴 **a `AC10-(ii)` era uma métrica que se absolve sozinha** — mandava repetir a régua do Context §2, que lê **0 hoje com a Lucimara viva**, ou seja, já estava verde antes do conserto e continuaria verde com o guarda desligado. **Régua reescrita literalmente na AC, com baseline obrigatório VERMELHO na T0, denominador declarado (só resumos reescritos na janela) e piso de inconclusividade (n < 5).** (3) A Lucimara vira **segunda fixture literal da AC1**, e é mais dura que a Sandra porque o próprio texto traz ressalva — o guarda não pode se absolver por ela, já que é a **abertura** do resumo que volta ao contexto por `loader.ts:195`. Criada a **AC11**: a classe de erro nova (*visita vencida em tempo presente*) é **medida nesta story**, não proposta ao @pm — a `M5` pergunta *"existe appointment?"* e responde **sim** para os 12, então é uma métrica que **não consegue ficar vermelha** aqui; deixar o conserto dependendo dela é escrever AC contra instrumento cego. Confirmei em produção o achado central do @sm (`visit-slot.ts:472-473`: `if (!said.day || !said.time) return null` — `detectAffirmedSlot` é cega no caso-mãe) e os dois escritores (`pipeline.ts:1567-1581` a cada 5 msgs; `enrich-leads/route.ts:177` incondicional). Confirmei 226 resumos, **12/12 sem appointment futuro e com data relativa** (André 05/08, Helena 16/07, Edicleia *"amanhã"* com visita em 07/08, Wilson 27/07). **Ratificado o Desenho §3 — manter a fala da Nicole como contexto rotulado** —, e a razão que decide não era a que estava escrita: **a remoção não seria simétrica**, porque só o escritor A recebe `assistantMessage` como campo; o B (92,5% da população) recebe a conversa inteira via `haiku-enrichment.ts:82`. Ratificação com data e condição de reabertura. Ressalva à regra de corte: a story **muda indiretamente o que a Nicole vê** (o bloco `FATO DE AGENDA` volta pelo `ai_summary`), mas **não cria caminho de decisão** — cabe na Onda 1 por esse argumento, não pelo "zero". Nova **T8**: corrigir a Lucimara à mão antes do deploy, preservando a linha original como fixture. | @po (Pax) |
| 2026-08-08 | 0.1 | Story criada para o item **`W1-3b`** (deploy 2 da Onda 1), a partir do `CR-3` do Epic 87 e do caso Sandra (*"Sandra agendou visita para sábado, dia 8"* gravado como fato em `leads.ai_summary`). **Medições minhas contra produção (read-only, 08/08), com o método declarado:** **226** leads com resumo; **11** afirmam visita marcada; **0** sem `appointment` — **o dado está limpo** (as 3 correções manuais do Gabriel em 07–08/08 seguraram, e a `M5` está satisfeita); e o **achado novo**: **11 de 11** têm a visita **já no passado** e **texto relativo** (*"para amanhã"*, *"no dia seguinte"*, *"segunda-feira 27"*), ou seja, hoje o resumo do André afirma, em tempo presente, uma visita que aconteceu há três dias. O epic previa 7 de 8; hoje é 11 de 11 — a `M5` não cobre essa classe e a story propõe a métrica ao @pm. **Dois escritores mapeados no código, e o cron é o dominante:** `updateLeadMemory` (a cada 5 mensagens) e `enrich-leads` (**a cada 30 min, incondicional**, `route.ts:177`), com **209 de 226** leads com resumo (92,5%) em conversa que o cron já enriqueceu — a mesma assimetria que fez a `87-4` precisar da `AC8-b`, e a razão de a story cobrir os dois num deploy só. **Desenho em três camadas, e só a terceira é garantia:** verdade do banco com data absoluta → regra de prompt → **guarda de escrita** (resumo sem lastro **não é gravado**, resumo anterior preservado, evento emitido). **Restrição dura herdada da 87-3: `detectAffirmedSlot` e `visit-slot.ts` NÃO podem ser tocados** — e há razão mecânica além da governança: a função exige **dia E hora** (`visit-slot.ts:472`) e a frase da Sandra **não tem hora**, então reusá-la crua produziria um guarda cego justamente no caso-mãe. É a **AC1**, com vermelho obrigatório. Três veredictos (`com_lastro`/`sem_lastro`/`indeterminado`), com o `indeterminado` **gravando de propósito** (fail-open declarado, doutrina de baldes da 87-3). **Cabimento na Onda 1 argumentado por escrito:** o guarda decide **se grava**, nunca **o que ela fala** — o paralelo exato do `W1-2b`, que barra a escrita do estado e é Onda 1; regenerar/degradar resposta é `W3-3`. Registrado que **nenhuma AC pode depender do Telegram** (morto em produção). Divergência a levar ao @pm: o `W1-3a` executado foram **3** resumos (Marilda, Adriele, Sandra), e o epic registra **1**. | @sm (River) |
