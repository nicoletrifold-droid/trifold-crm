# Validação @po — Stories 87-3 e 87-4, e arbitragem do item `W1-2c`

**Autor:** Pax (@po) · **Data:** 2026-08-07
**Escopo:** `docs/stories/87-3-reconciliacao-diaria-fala-x-banco.story.md` (item `W0-5`) ·
`docs/stories/87-4-estado-de-agenda-com-ancora-temporal.story.md` (item `W1-2b`) ·
arbitragem do corte do item **`W1-2c`**
**Contra:** Epic 87 v0.3 · `docs/architecture/2026-08-05-validacao-epic-87.md` §7 ·
`docs/architecture/2026-08-07-debate-tool-use-nicole.md` §9 · **código em `HEAD`** ·
**banco de produção `dsopqkqjkmhytudaaolv`, medido hoje (07/08)**

---

## TL;DR

| Story | Veredito | Nota |
|---|---|---|
| **87-3** — reconciliação diária fala × banco | 🔴 **NO-GO** | **6/10** — 4 correções bloqueantes |
| **87-4** — estado com âncora temporal | 🟡 **GO condicional** | **7/10** — 5 correções antes de `Ready` |
| **`W1-2c`** — arbitragem | ✅ **Divisão APROVADA**, com um refinamento e uma correção no Epic 88 | — |

As duas stories são das melhores redigidas neste projeto. **Nenhuma das duas falha por falta de
rigor.** As duas falham no mesmo ponto, e é o ponto que esta casa já errou três vezes: **os números
e as strings das AC foram herdados de documento e não remedidos contra o banco de hoje.** Eu remedi.
Sete das oito checagens numéricas divergiram — algumas por fator de 4.

O caso mais grave: a **AC3(i) da 87-3 exige que o instrumento reproduza 31% / 81%. Rodei a régua
exatamente como a story a especifica, contra 60 dias de produção: dá 7% / 30%.** Não é ruído, é
denominador diferente. Uma story cujo produto é *o número que decide o rumo do Epic 88* não pode
entrar em execução com a calibração errada — o @dev chegaria na T6, veria 7%, e a pressão seria
afrouxar a régua até dar 31%. Que é literalmente o defeito que a story existe para impedir.

---

## 0. Como eu medi (para o @dev poder repetir)

Management API contra `dsopqkqjkmhytudaaolv` (PAT em `~/.supabase/access-token`, formato JSON —
**não** o path do runbook `~/.config/supabase/pat`, que não existe nesta máquina).

Duas sondas em TypeScript, rodadas com `npx tsx` contra o código de `HEAD` e removidas depois:

1. **Sonda A:** as 1.156 mensagens `role='assistant'` de 08/06 a 07/08, passadas por
   `detectAffirmedSlot` **duas vezes** — uma com `now = messages.created_at` e outra com
   `now = new Date()`. Cruzadas com as 63 `appointments` do período pela régua de três baldes da story.
2. **Sonda B:** os `conversation_state` com resíduo de agenda, passados por `resolveVisitSlotParts`
   com `message = "Oi"` e três `now` distintos — reproduzindo a AC4 da 87-4 contra o dado de hoje.

> ⚠️ **Achado de método, e ele vale para o @dev:** o texto de `timestamptz` do Postgres
> (`2026-06-28 13:37:40.123+00`) **não é ISO-8601 válido para o `new Date()` do JS** — o offset
> `+00` sem `:00` produz **Invalid Date silenciosamente**. Ver §1.3: isso não é detalhe meu, é uma
> armadilha que a 87-3 precisa fechar por AC.

---

## 1. Story 87-3 — Reconciliação diária fala × banco

### 1.1 Checklist de 10 pontos

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Título claro e objetivo | ✅ | — |
| 2 | Descrição completa | ✅ | O bloco "por que é a primeira da fila" é exemplar |
| 3 | **AC testáveis** | 🔴 | **AC1 inconsistente (7 × 8 casos), AC1-b contradita pela medição, AC3(i) inexequível** |
| 4 | Escopo IN/OUT | 🟡 | O `OUT` "não mexer na `detectAffirmedSlot`" colide com a AC1-b |
| 5 | Dependências mapeadas | 🟡 | Tabela de fronteiras excelente; **colisão de cron não conferida** |
| 6 | Estimativa | 🟡 | **S** é otimista para régua de 3 baldes + rodada retroativa + cron + dedupe. É **M** |
| 7 | Valor de negócio | ✅ | O maior ROI dos dois epics, e está argumentado com evidência |
| 8 | Riscos documentados | 🟡 | 6 riscos bons; faltam dois medidos (viés da própria métrica; `Invalid Date`) |
| 9 | Definition of Done | ✅ | — |
| 10 | Alinhamento com o Epic | ✅ | `stories_planned` já traz `W0-5 → 87-3`; AC1 é a condição nº 2, literal |

**6/10 → NO-GO.**

---

### 1.2 A AC1 é executável de verdade? — **Parcialmente. Medido, um a um.**

Rodei `detectAffirmedSlot` ancorada em `messages.created_at` sobre os 60 dias.
**30 disparos.** Os oito casos nominais da AC1:

| Caso | Aparece? | Fala detectada (medida) | Slot resolvido (ancorado) |
|---|---|---|---|
| **Célia** | ✅ | 28/06 13:37 — *"Agendei sua visita para este sábado às 9h"* | 04/07 09:00 BRT · **0 appointments até hoje** (conferido) |
| **Helena** | ✅ (2 falas) | 24/06 00:11 e 00:15 UTC | 27/06 10:00 BRT |
| **Miriam** | ✅ (2 falas) | 07/07 14:50 e 14:51 | 08/07 10:00 e 11:00 BRT |
| **Ailton** | ✅ (**3 falas**) | 31/07 01:05, 01:17, 01:18 UTC | 03/08 12:00 · 01/08 **09:00** · 01/08 **10:00** |
| **Sandra** | ✅ | 05/08 14:55 — *"Sábado, dia 8, está anotado… vai até as 12h"* | 08/08 12:00 BRT |
| **Sueli** | ✅ | 03/08 21:53 — *"**Vou confirmar a disponibilidade** para sexta, dia 7, às 14h **e já te aviso**"* | 07/08 14:00 BRT |
| **Valnira** | ✅ (2 falas) | 04/08 00:09 e 00:10 UTC | 06/08 10:00 BRT |
| **Maria Oliveira** | ✅ (2 falas) | 06/08 10:04 e 10:05 | 08/08 11:00 BRT |
| **Silvana** (controle negativo) | 🔴 **APARECE** | 24/07 23:41 — *"Segunda-feira às 9h **o corretor te liga**"* | 27/07 09:00 BRT · sem appointment → **`sem_lastro`** |

#### 🔴 B1 — A AC1 pede oito nomes e a tabela do Context tem sete, sem a Sandra

A AC1 lista *"Célia, Helena, Miriam, Ailton, **Sandra**, Sueli, Valnira e Maria Oliveira"* — **oito** —
mas chama o conjunto de *"os sete casos"* e manda conferi-los *"um a um contra a tabela do Context"*,
onde a **Sandra não existe** (a tabela tem Célia, Helena, Miriam, Ailton, Sueli, Valnira, Maria).
A condição nº 2 do @architect, por sua vez, lista sete **com Sandra e sem Ailton**.
Três listas diferentes em três lugares. **Medição:** a Sandra **é** detectada (08/08 12:00 BRT), o
Ailton também. **A lista certa tem oito.** Falta a linha da Sandra na tabela do Context.

#### 🔴 B2 — A Silvana aparece, e o `OUT` da story proíbe o único conserto que a story previu

A AC1-b diz *"a Silvana NÃO pode aparecer"* e justifica: *"ela pediu ligação, não visita"*.
**A justificativa está certa e o mecanismo não existe.** `detectAffirmedSlot` não sabe distinguir
visita de ligação: a frase *"Segunda-feira às 9h o corretor te liga"* tem dia + hora únicos, não é
ambígua, e a função dispara. Conferido no banco: a Silvana tem `lead_tasks` `action_type='ligacao'`,
`due_at` 27/07 09:00 BRT, `completed_at` 27/07 09:39 — e **zero appointments**. Pela régua da story
ela cai em **`sem_lastro`** e gera **alerta nomeado**.

E o `OUT` fecha a única porta que a story imaginou: *"Não mexer no comportamento da
`detectAffirmedSlot`"*. Essa restrição está **certa** (mudar a régua no meio da medição invalida o
baseline) — o que falta é dizer onde o discriminador mora. Ele tem de morar em
`agenda-reconcile.ts`, como **filtro do módulo**, não na função compartilhada.

> **Correção exigida:** desenho + AC explícitos para o discriminador **visita × ligação**, aplicado
> antes da classificação, com a fixture da Silvana como teste, e com a lista de padrões escrita na
> story (*"o corretor te liga"*, *"vou te ligar"*, *"ligação"*, *"te retorno por telefone"*).
> Sem isso a AC1-b é uma promessa sem código, e o primeiro dia de operação já entrega um alerta
> falso sobre o único caso que a story prometeu não citar.

#### 🟡 B3 — A AC1-a trata o Ailton como um caso; ele são três falas, com baldes opostos

Medido: 31/07 **01:17** afirma **09:00** (divergência de 60 min do appointment das 10:00 → sai
`sem_lastro`, como a AC1-a quer) e 31/07 **01:18**, **um minuto depois**, afirma **10:00** — que
casa exatamente com o appointment (`created_by='nicole'`, criado 31/07 01:05). A mesma conversa
produz **`sem_lastro` e `com_lastro` no mesmo minuto**.

A AC4 deduplica por `message_id`, então **os dois alertam**. A story precisa declarar, por escrito,
**qual é a unidade do relatório** — fala ou lead — porque a resposta muda o número (§1.4) e muda a
qualidade do alerta. **Recomendação:** a unidade da *linha* é a fala (correto para auditoria); a
unidade do *alerta* deve ser o **lead+dia**, e uma fala posterior do mesmo turno que corrija o
horário deve suprimir o alerta da anterior. Sem isso, o time recebe "o Ailton está sem lastro" ao
lado de "o Ailton tem lastro", no mesmo push.

#### ✅ B4 — A divergência de data da Helena está resolvida. Não precisa esperar o job.

A story pede para não inventar entre **23/06** (@po) e **24/06** (@architect). **Medido: as duas
estão certas.** As mensagens são `2026-06-24 00:11` e `00:15` **UTC** = `2026-06-23 21:11` e
`21:15` **BRT**. É artefato de fuso, não divergência de fonte. Trocar o parágrafo por essa frase
economiza uma investigação e fixa a convenção: **a story reporta em BRT.**

---

### 1.3 A armadilha do `now` — o @sm está certo, e o buraco é maior do que ele viu

**Confirmado, e é grave:** dos 30 disparos, **25 mudam de valor** quando `now = new Date()` em vez
de `messages.created_at`. **83%.** Amostra medida:

```
Célia   28/06  "este sábado às 9h"          ancorado 04/07 09:00   relógio de hoje  08/08 09:00
Ailton  31/07  "sábado, 1º de agosto, 9h"   ancorado 01/08 09:00   relógio de hoje  01/08/2027
Helena  24/06  "sábado às 10h"              ancorado 27/06 10:00   relógio de hoje  08/08 10:00
Valnira 04/08  "quinta-feira às 10h"        ancorado 06/08 10:00   relógio de hoje  13/08 10:00
```

O erro tem **dois sinais**: para o passado ele colapsa tudo no "próximo sábado" (falso negativo em
massa); para datas com mês escrito ele salta para **2027** (`parseDay`, linha 104: data já passada
no ano → ano seguinte). Nos dois casos o job roda, devolve JSON, não dá erro, e o baseline sai
errado. **A AC2 não é zelo — é a diferença entre um instrumento e um gerador de números.**

**Auditei a cadeia inteira atrás de um segundo relógio. Não há.**

```
detectAffirmedSlot(now)
  └─ isAmbiguousSlotText(text)          ← sem relógio
  └─ resolveVisitSlotParts({ now })
       ├─ parseDayParts(msg, now) → parseDay(text, now)   ← ÚNICO consumidor de relógio
       ├─ parseTimeParts(msg)     → parseHour             ← sem relógio
       └─ isAmbiguousSlotText                              ← sem relógio
  └─ slotToUtc(day, time)                                  ← sem relógio
```

`grep "new Date()" packages/ai/src/flows/visit-slot.ts` → **zero ocorrências**. `parseDay` deriva
tudo de `brtParts(now)`. **Confirmo: passar `messages.created_at` fecha o furo na cadeia de parse.**

#### 🔴 B5 — Mas existe um terceiro relógio, e a AC2 não o pega: o `Invalid Date`

Eu caí nele ao escrever a sonda. `new Date("2026-06-28 13:37:40.123+00")` → **Invalid Date**
(o offset `+00` sem `:00` não é ISO-8601). E `detectAffirmedSlot` **não devolve `null` nesse caso**:
`brtParts(NaN)` propaga, e a função devolve **um objeto `Date` inválido**. Consequência na régua da
story: `afirmou !== null` é **verdadeiro**, toda distância vira `NaN`, `NaN ≤ 30min` é `false`,
**tudo cai em `sem_lastro`** → `lastro_pct = 0%`.

**E a AC1 passaria.** Os oito casos apareceriam, todos como `sem_lastro`. A AC2-(ii) (estabilidade
entre dois dias) **também** passaria — 0% é perfeitamente estável. Só a AC3(i) pegaria, e a AC3(i)
é justamente a que hoje está calibrada errada (§1.4).

> **Correção exigida:** AC nova — `classificarFala` **rejeita** `faladoEm` não-finito (lança ou
> devolve `balde: null` com contador próprio), e um `Date` inválido devolvido por
> `detectAffirmedSlot` é tratado como `null`. Teste com a string crua de `timestamptz` (`…+00`) como
> entrada, **vermelho colado**. Custa 4 linhas e é a diferença entre "o instrumento falhou" e
> "o instrumento mentiu 0%".

---

### 1.4 🔴 B6 — O vermelho exigido está certo; **o número exigido está errado**

Esta é a correção mais importante da validação.

Rodei a régua **exatamente como a story a especifica** (janela ±30 min, `status ∈
('scheduled','confirmed','completed')`, `com_lastro` = `created_by='nicole'` **e**
`created_at ≤ fala+2min`) sobre os 30 disparos de 60 dias:

```
REGRA DO DESENHO (§2 da story)
  total=30   com_lastro=2   reparo_humano=7   sem_lastro=21
  lastro_pct = 7%     lastro_frouxo_pct = 30%

VARIANTE com cancelled/no_show incluídos
  total=30   com_lastro=3   reparo_humano=14  sem_lastro=13
  lastro_pct = 10%    lastro_frouxo_pct = 57%
```

**A AC3(i) exige ≈31% e ≈81%, com tolerância de ±5 p.p. Nenhuma das duas variantes chega perto.**
São **quatro** causas, todas medidas, e todas corrigíveis:

**(a) Denominador diferente.** O 31% é `5/16` — um conjunto **curado à mão** de 16 falas. O
instrumento conta **todo disparo da `detectAffirmedSlot`: 30**. Dois denominadores, duas métricas.
A AC prende o instrumento novo a um número produzido por outra régua.

**(b) A unidade nunca foi declarada: fala ou lead?** Quase todo incidente produz **duas falas**
(Helena×2, Célia×2, Miriam×2, Valnira×2, Sandra×2, Maria×2, Wilson×2, Edicleia×2, Marlene×2,
Ailton×3). A auditoria manual contou **casos**; o instrumento conta **falas**. Só isso já move o
percentual por um fator.

**(c) O filtro de `status` contradiz a própria Dev Note 4.** O Desenho manda contar só
`scheduled/confirmed/completed`. A Dev Note 4 escreve: *"Deixar `cancelled`/`no_show` de fora
inflaria o `sem_lastro` retroativo com visitas que existiram e foram desmarcadas depois."* — que é o
argumento **contra** o que o Desenho manda. E é o argumento certo: **34 das 63 appointments do
período são `no_show` ou `cancelled`**. Excluídas, a Helena, a Miriam, a Andréia, o André e a
Valnira — que **têm** appointment no horário exato (`dv = 0 min`) — desabam para `sem_lastro`. A
contradição vale **27 pontos percentuais** no número frouxo (30% → 57%).

**(d) O par de filtros é necessário, mas NÃO é suficiente — e o erro é para baixo.**
Confirmei que o par sustenta o que promete: removendo `created_by='nicole'` **ou**
`created_at ≤ fala+2min`, Sueli (broker, criado 04/08 12:55 vs fala 03/08 21:53), Valnira (admin,
04/08 11:21) e Maria Oliveira (admin, 06/08 09:22) **viram `com_lastro`**. O vermelho da AC3-ii vai
ficar vermelho. ✅

**O que o par não pega:** o appointment criado **ANTES** da fala. Medido — 4 dos 30 disparos:

```
Marlene  02/08 19:01  "sua visita está marcada para segunda 3/08 às 16h"
                       appointment broker, criado 31/07 18:20   → classificado reparo_humano
Marlene  03/08 18:15  "sua visita está confirmada para hoje às 16h"        → reparo_humano
Edicleia 06/08 18:32  "sua visita já está marcada para amanhã, às 15h"
                       appointment broker, criado 06/08 18:13   → reparo_humano
Edicleia 06/08 18:33  "Te espero amanhã às 15h"                            → reparo_humano
```

**Nenhum humano consertou nada nesses quatro.** São **lembretes** de visitas que já existiam,
marcadas pelo corretor no fluxo normal. A régua os rotula como *"um humano leu a conversa e
consertou. NÃO é lastro"* — e **derruba o `lastro_pct`**.

Isso é pior que impreciso: é **viés na direção da decisão que a métrica alimenta.** O gate é
"≥90% → a tool não se justifica / <90% → o Epic 88 sobe". Uma régua que subconta lastro empurra o
gate para "<90%". **Uma métrica cujo viés aponta para a conclusão que ela deveria arbitrar não é
instrumento — é advogado.** O baldes precisa de um quarto estado (`lembrete`: existe appointment com
`created_at < faladoEm`, fora do numerador e **fora do denominador**), com o vermelho correspondente.

> **Correção exigida (AC3):**
> 1. **Declarar a unidade** (fala) e **declarar o denominador** do instrumento.
> 2. **Resolver a contradição do `status`** — decidir por escrito, com o número dos dois lados
>    (medido: 30% × 57% no frouxo). Recomendo **incluir** `cancelled`/`no_show`: a pergunta da
>    métrica é *"quando ela falou, existia a linha?"*, e uma visita desmarcada depois **existiu**.
> 3. **Quarto balde `lembrete`.**
> 4. **Recalibrar os alvos numéricos** com o instrumento novo, e mudar a natureza da AC: em vez de
>    *"tem de dar 31%"*, exigir **"o instrumento publica o número, e a diferença para os 31% do
>    script do @architect é explicada linha a linha na story"**. O `PM2` do Epic 88 e a §3 do Epic 87
>    passam a citar **o número do instrumento**, e o `31%` fica registrado como *baseline manual,
>    superado*.
>
> Sem (4), o @dev chega na T6, vê 7%, e a saída de menor esforço é afrouxar a régua até dar 31% —
> exatamente o mecanismo que esta story existe para tornar impossível.

---

### 1.5 🟡 B7 — A Sueli só aparece por um falso positivo que a própria story declara

Medição: a **única** fala da Sueli que a `detectAffirmedSlot` detecta é
*"**Vou confirmar a disponibilidade** para sexta, dia 7, às 14h **e já te aviso**"* — que é
**literalmente uma das seis strings interrogativas** que a Dev Note 3 da story cita como falso
positivo e que a condição nº 7 do @architect manda eliminar. A frase que a tabela do Context atribui
à Sueli (*"Te espero por lá"*) **não contém dia+hora e não dispara**.

Consequência: a AC1 exige a Sueli, e a Sueli está lá **por um defeito**. Quando a guarda de
interrogação do Epic 88 subir, a Sueli **sai do relatório** e a AC1 vira irreproduzível — junto com
Adriele (*"Posso confirmar sua visita…?"*), Célia 13:36 (*"Qual horário fica melhor pra você?"*),
Sandra (*"qual horário fica melhor pra você?"*) e Ailton 01:05 (*"Vou confirmar seu agendamento"*).

**Não é motivo para mexer na função aqui** — a story está certa em não mexer. É motivo para:
- corrigir a citação da Sueli na tabela do Context (é a frase medida, não *"Te espero por lá"*);
- **escrever na story que a AC1 tem validade datada**: ela vale contra o `HEAD` de hoje, e a guarda
  de interrogação do Epic 88 **vai** mudar o conjunto e o denominador. Quem subir aquela guarda tem
  de republicar o baseline. Isso vira linha no runbook do `W0-3`.

**Volume real de alerta, medido:** 21 `sem_lastro` em 60 dias = **0,35 alerta/dia**, dos quais
~7 são falso positivo → **~1/3 dos alertas são falsos**. A Dev Note 3 declara "~0,1 falso/dia", que
está certo como *taxa* e engana como *proporção*. O que decide se o time continua lendo é a
proporção. Ajustar o Risco 3.

---

### 1.6 🔴 B8 — O horário do cron já está ocupado

A story propõe `30 11 * * *` e justifica *"depois do `daily-report` (10:59 UTC), sem colisão"*.
**Conferi o `packages/web/vercel.json` inteiro — são 35 crons.** No minuto `11:30` já rodam:

```
30 11 * * *     /api/cron/billing-monthly-summary     ← colisão exata
*/30 * * * *    /api/cron/enrich-leads
*/30 * * * *    /api/cron/webhook-health
*/30 * * * *    /api/cron/appointment-whatsapp-reminders
*/10, */5, */3, */15 …                                 ← todos batem em :30
```

**Recomendação medida: `38 11 * * *` (08:38 BRT).** É o único minuto da faixa que não é atingido por
nenhum `*/3`, `*/5`, `*/10`, `*/15`, `*/30` nem por cron de minuto fixo.

E a pré-tarefa do @devops da AC6 continua obrigatória e está bem escrita — o registro de que o
webhook da Nicole é atendido por `prj_KMm5f2…` enquanto o `.vercel/project.json` aponta para
`prj_s3ARh1…` é real e já custou duas vezes nesta casa.

---

### 1.7 O que está certo e não deve ser tocado na revisão

- ✅ **O `NICOLE_SLOT_MISMATCH` = 0 em toda a história do `system_events`** — conferido.
- ✅ **`appointments` com `created_by='nicole'` = 6 no projeto inteiro** — conferido.
- ✅ **Célia tem 0 appointments** — conferido hoje, 40 dias depois.
- ✅ **O ciclo de import e a AC7.** `chat/pipeline.ts` importa de `"../flows"` (index) **e** de
  `"../flows/visit-slot"` direto; `visit-slot.ts` não importa nada de `chat/`. Mover
  `detectAffirmedSlot` para lá mata o ciclo e as três dependências dela
  (`isAmbiguousSlotText`, `resolveVisitSlotParts`, `slotToUtc`) já estão no arquivo. **Análise
  correta, custo zero.**
- ✅ **O filtro de `metadata.is_transition`.** Existem **104** mensagens `role='assistant'` com
  `is_transition=true` no período. **Nenhuma delas dispara a `detectAffirmedSlot`** — o filtro custa
  zero hoje e é profilaxia certa. Vale registrar o número na story para o @dev não gastar tempo
  procurando o vermelho: **ele não existe, e isso é o esperado**.
- ✅ **A régua de três baldes como conceito** e a obrigação de imprimir o número frouxo rotulado.
  É a melhor ideia das duas stories.
- ✅ **AC5 (read-only por allowlist no `fake.calls`)** — desenho correto, testável, sem espaço para
  interpretação.

### 1.8 Correções obrigatórias — 87-3

| # | Correção | Onde | Quem |
|---|---|---|---|
| **B1** | Lista única de **8 casos**; acrescentar a linha da Sandra à tabela do Context (fala 05/08 14:55, resolve 08/08 12:00 BRT) | Context + AC1 | @sm |
| **B2** | Discriminador **visita × ligação** no `agenda-reconcile.ts` (não na `detectAffirmedSlot`), com padrões escritos e a Silvana como fixture | Desenho + AC1-b | @sm |
| **B5** | AC nova: `faladoEm` não-finito e `Date` inválido tratados como falha explícita, não como `sem_lastro`; teste com `timestamptz` cru | AC nova | @sm |
| **B6** | Unidade declarada · contradição de `status` resolvida por escrito · **4º balde `lembrete`** · alvo numérico recalibrado pelo instrumento (o `31%`/`81%` passa a ser *baseline manual, superado*) | Desenho §2 + AC3 | @sm + @po (para propagar ao Epic 87 §3 e ao `PM2` do Epic 88) |
| **B8** | Cron para `38 11 * * *` | Desenho §4 | @sm |
| B3 | Unidade do **alerta** = lead+dia; fala corretiva posterior suprime a anterior (Ailton 01:17 → 01:18) | AC4 | @sm |
| B4 | Helena: 23/06 BRT = 24/06 UTC, resolvido; story reporta em BRT | Context | @sm |
| B7 | Citação real da Sueli; AC1 declarada com **validade datada** (cai quando a guarda de interrogação do Epic 88 subir) | Context + AC1 | @sm |
| — | Esforço **S → M** | Cabeçalho | @sm |

---

## 2. Story 87-4 — Estado de agenda com âncora temporal

### 2.1 Checklist de 10 pontos

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | ✅ | — |
| 2 | Descrição completa | ✅ | "três defeitos, uma raiz" é a melhor síntese do epic |
| 3 | AC testáveis | 🟡 | **AC4 manda um vermelho que hoje é verde**; AC8 inexequível (ver C2) |
| 4 | Escopo IN/OUT | ✅ | O `origem: 'lead'` apenas, e os campos reservados, estão certos |
| 5 | Dependências mapeadas | 🔴 | **6 consumidores mapeados, faltam 2 — e um deles é ESCRITOR** |
| 6 | Estimativa | 🟡 | **M** fica apertado com o 7º escritor; ainda defensável |
| 7 | Valor de negócio | ✅ | — |
| 8 | Riscos | ✅ | 7 riscos, com a mitigação certa em cada |
| 9 | DoD | ✅ | — |
| 10 | Alinhamento com o Epic | ✅ | Ordem `W1-2b` = deploy 1 confere com a condição nº 2 do @architect |

**7/10 → GO condicional.** As 5 correções abaixo são **aditivas** — nenhuma muda o desenho.

---

### 2.2 A decisão de desenho: colapsar `visit_availability` + `visit_pending_date` — **CONCORDO**

O @sm argumenta que é **subtração de caminho, não adição**, e por isso respeita a regra de corte da
Onda 1. **Concordo, e a evidência sustenta.** Verifiquei o código:

```ts
// visit-slot.ts:366    o pendingDay entra SEMPRE
let day = dayInMessage ?? pendingDay
// visit-slot.ts:376-377  a guarda existe SÓ no outro caminho
if ((!day || !time) && visitAvailability && !isAmbiguousSlotText(visitAvailability)) {
  if (!day && !periodWithoutDayInMessage) day = parseDayParts(visitAvailability, now)
```

Dois caminhos, uma guarda. Acrescentar a guarda ao segundo caminho seria a terceira vez que este
projeto aplica o mesmo remendo (75-245 → 75-268 → agora), e a 75-268 é **prova documental** de que
meio-fix reincide: ela subiu em 04/08 e o defeito que ela nomeia estava vivo em 03/08 23:57 e
continua vivo hoje. **Colapsar num campo só e fazer a guarda de período ser a única porta de entrada
do dia herdado transforma "lembrar de aplicar em dois lugares" em "não existe segundo lugar".** É
subtração. Cabe na Onda 1.

**Sobre a migração dos consumidores — verifiquei o peso 20 e o `shouldHandoff`, e a preocupação do
@sm é real e específica:**

```ts
qualification.ts:17   visit_availability: 20      // de 100 pontos possíveis
handoff.ts:87         if (qualificationScore >= 70) { …PRICE_SIMULATION_PATTERNS… → handoff }
```

20 pontos num limiar de 70. Um lead em 75 cai para 55 e **para de disparar handoff em pergunta de
preço** — sem erro, sem log, sem ninguém associar as duas coisas com a mudança de formato do estado
de agenda. **A AC6-(i) mira exatamente aí e está bem escrita.** Aprovada como está.

#### 🔴 C1 — Faltam 2 consumidores, e o pior deles é um ESCRITOR em outro pacote

`grep -rn "visit_availability|visit_pending" packages/` devolve **dois** que a tabela dos seis não tem:

| # | Não mapeado | Arquivo | Por que importa |
|---|---|---|---|
| **7** | **`enrich-leads` — o cron do Haiku ESCREVE `visit_availability`** | `packages/ai/src/flows/haiku-enrichment.ts:31` (prompt) → `packages/web/src/app/api/cron/enrich-leads/route.ts:149-152` | **É uma segunda linha de montagem da mesma fábrica** |
| 8 | `visit_availability` declarado como campo de lead, `type: "text"` | `packages/shared/src/constants/lead-fields.ts:23` | Superfície de UI/edição humana sobre o formato antigo |

O nº 7 é **bloqueante**, e a evidência é literal:

```ts
// haiku-enrichment.ts, dentro do ENRICHMENT_PROMPT
- visit_availability: string (dia/horario mencionado)

// cron/enrich-leads/route.ts:149
const mergedCollectedData = { ...currentData, ...enrichment.extracted_data }
await supabase.from("conversation_state").update({ collected_data: mergedCollectedData })
```

Ou seja: **o Haiku lê a conversa inteira — a fala do lead E a fala da Nicole — e grava
`visit_availability` como string crua direto no `collected_data`, fora do `processMessage`, a cada
30 minutos** (`*/30 * * * *` no `vercel.json`, 48 passadas por dia). Sem citação, sem `origem`, sem
âncora, sem TTL, e **sem passar pela `isAmbiguousSlotText`**.

Três consequências diretas nas AC da story:

1. **A tese da story ("fato de agenda sem citação de uma mensagem `role='user'` não pode virar
   estado") só é verdadeira depois que este caminho também for fechado.** A 87-4 desliga
   `pipeline.ts:1099` e deixa a outra esteira ligada.
2. **A AC4 pode ficar verde com a fábrica funcionando** — o harness exercita `processMessage`, não
   o cron.
3. **A AC8 é inexequível como escrita.** Ela exige que a contagem de
   `NICOLE_AGENDA_STATE_LEGADO_DESCARTADO` *"caia a zero conforme as conversas vão sendo tocadas"*.
   Com o cron reescrevendo a chave 48×/dia, o contador **oscila para sempre** em vez de decair — e
   a AC8 é justamente a que *"prova que os registros morreram sozinhos, sem novo purge"*.

> **Correção exigida:** o `enrich-leads` entra no escopo da 87-4 — e entra como **subtração**, o que
> a mantém dentro da regra de corte: **remover `visit_availability` da lista de campos do
> `ENRICHMENT_PROMPT`** e do merge em `collected_data`. Uma linha no prompt, um filtro no merge.
> Entra na T5, na tabela da AC6 como consumidor **nº 7 (escritor)**, e ganha AC própria: depois do
> deploy, nenhum `conversation_state` **tocado pelo cron** volta a ter a chave legada.

---

### 2.3 🔴 C2 — A AC4 manda reencenar quatro seeds: um é verde hoje e três não existem mais

A AC4 é a AC mais importante da story ("prova que a limpeza de 07/08 não precisa acontecer de
novo") e a única com fixture nomeada. **Rodei `resolveVisitSlotParts` com `message="Oi"` contra
os `conversation_state` reais de produção, agora.**

**Seed da Sandra, exatamente como a AC4 manda** (`va = "sábado, dia 8, de 8h às 12h"`,
`vpd = "2026-08-08"`, mensagem `"Oi"`):

```
day  = 2026-08-08      time = null      → NÃO cria appointment
```

`isAmbiguousSlotText("sábado, dia 8, de 8h às 12h")` → **`true`** (faixa "de 8h às 12h"), a guarda
da 75-245 bloqueia a hora. **O vermelho que a AC4 promete não é vermelho.** E os outros três seeds
(Célia, Adriele, Wilson) **foram purgados em 07/08** — não estão mais em `conversation_state`, então
"reencenar os três" exige o backup, e a story não diz isso.

Uma AC que manda ver vermelho onde há verde é a pior classe de AC: o executor honesto trava, e o
executor com pressa **ajusta a fixture até ficar vermelha** — inventando evidência.

**Medi os seeds que servem. Estão em produção agora:**

```
Maria Oliveira   va="Sábado, 8 de agosto, às 11h"   vpd=2026-08-08  → "Oi" resolve 08/08 11:00  ARMADO
Edicleia         va="sexta-feira às 15h"            vpd=null        → "Oi" resolve HOJE 15:00   ARMADO + dia que anda
Sueli            va="sexta-feira, 7 de agosto, às 14h"              → 07/08 14:00 → 07/08/2027  ARMADO + dia que anda
Valnira          va="quinta-feira às 10h"           vpd=2026-08-06  → 06/08 10:00               ARMADO
Andréia          va="Sábado, 18 de julho, às 9h"                    → 18/07/2027 09:00          ARMADO
Marlene          va="segunda-feira, 3 de agosto às 16h"             → 03/08/2027 16:00          ARMADO
```

> **Correção exigida:** trocar a fixture da AC4 por **Maria Oliveira** (armado, data futura, com
> `vpd`) e **Edicleia** (armado, sem `vpd`, e o dia **anda** — cobre AC1 e AC4 na mesma fixture).
> Manter a Sandra como fixture **da AC1** (o dia que anda é o defeito dela) e **declarar por escrito
> que ela NÃO arma o INSERT**, porque a 75-245 pega a faixa de horário — é informação valiosa, não
> uma falha. Para Célia/Adriele/Wilson: ou reencenar a partir do backup de 07/08, ou removê-los da
> AC4 e citá-los como histórico.

---

### 2.4 🔴 C3 — O número do resíduo envelheceu, e o bloco de abertura ficou falso

A story diz *"~22 registros restantes (majoritariamente fala da própria Nicole, **sem data
concreta**)"* e abre com *"O dado está limpo"*. A Dev Note 6 já manda remedir — **remedi, hoje**:

| Medição (produção, 07/08) | Story diz | **Medido agora** |
|---|---|---|
| `conversation_state` com resíduo de agenda | ~22 | **56** |
| … com `visit_pending_date` | "sem data concreta" | **9** |
| … **armados** (dia + hora a partir de `"Oi"`) | 0 ("o dado está limpo") | **6** |
| … cujo dia **muda** conforme a data de leitura | — | **35** |
| … com `visit_pending_hour` | — | 0 |

O desarme de 07/08 tirou os três casos que o @architect identificou (Célia, Adriele, Wilson —
conferido, sumiram). **Mas o purge não foi das 59 linhas, e a fábrica repôs.** Dos 6 armados de
agora, dois resolvem para datas **futuras e válidas** (Maria Oliveira → 08/08 11:00; Edicleia →
hoje 15:00) — os dois **têm** appointment real, então o dano seria duplicata e não fantasma, mas o
mecanismo está demonstravelmente ligado.

**Isto não enfraquece a story — é o argumento dela, com número novo.** *"Sem esta story, em duas
semanas purgamos de novo"* estava errado apenas no prazo: **em oito horas já havia 6 armados.**

> **Correção exigida:** substituir "~22 / o dado está limpo" pela tabela acima, com a data e a query.
> E acrescentar ao Risco 6 a evidência de que a reposição é de horas, não de semanas.

---

### 2.5 🟡 C4 — A numeração das "condições do @architect" mistura dois documentos

- **AC1** — *"[Condição nº 3 do @architect]"* → é a `2026-08-05-validacao-epic-87.md` §7 item 3.
- **AC2** — *"[Condição nº 5]"* → é a `2026-08-07-debate-tool-use-nicole.md` §9 item 5.
- **AC3** — *"[Condição nº 3, segunda metade]"* → é a **do debate**, item 3 (cuja primeira metade,
  `isSlotFree` fail-closed, é do **Epic 88**).

Três AC citando "condição nº N" de **dois documentos diferentes**, sem nomear qual. O @qa que for
conferir vai abrir o documento errado em pelo menos uma delas. **Correção: prefixar cada citação com
a data do documento** (`[@architect 05/08 §7.3]`, `[@architect 07/08 §9.5]`, `[@architect 07/08 §9.3
— segunda metade]`).

### 2.6 O que está certo e não deve ser tocado

- ✅ **AC7 (snapshot dos turnos-ouro)** — é a AC que transforma "nenhum caminho de decisão novo" de
  promessa em teste. Não existia no epic e é contribuição do @sm. Manter tal e qual.
- ✅ **AC6-(i)** (veredito de `shouldHandoff` fixado) — verificado no código, o risco é real.
- ✅ **A regra "`resolveVisitSlotParts` NUNCA reancora"** e o `citacao` explicitamente proibido como
  fonte de parse. É o coração e está escrito sem ambiguidade.
- ✅ **`origem` só admite `'lead'` nesta story** — é a fronteira certa com o `W1-2c` (§3).
- ✅ **Campos do `W1-2c` declarados como reservados** — 4 linhas de comentário que evitam uma segunda
  mudança de formato. Excelente decisão.
- ✅ **O `followup` cron** (`route.ts:692-710`) mapeado — confirmado, ele apaga `visit_availability`
  no reset e precisaria apagar a chave nova. Bem visto.
- ✅ **Deploy sozinho + 24h + rollback escrito antes** — não negociar.

### 2.7 Correções obrigatórias — 87-4

| # | Correção | Onde | Quem |
|---|---|---|---|
| **C1** | **7º consumidor (ESCRITOR): `enrich-leads`/Haiku.** Remover `visit_availability` do `ENRICHMENT_PROMPT` e do merge; AC própria. + 8º: `shared/constants/lead-fields.ts` | Escopo, AC6, AC8, T5 | @sm |
| **C2** | Fixtures da AC4 trocadas para **Maria Oliveira** e **Edicleia** (medidas armadas hoje); Sandra fica na AC1 com a nota de que a 75-245 bloqueia a hora dela; Célia/Adriele/Wilson via backup ou removidos | AC4 | @sm |
| **C3** | Números do resíduo remedidos: **56 / 9 com `vpd` / 6 armados / 35 com dia que anda** | Bloco de abertura + Contexto + Risco 6 | @sm |
| **C4** | Citações do @architect prefixadas com a data do documento | AC1, AC2, AC3 | @sm |
| **C5** | Achado do `detect-appointment.ts:71` aberto em `docs/backlog.md` **agora**, não como T9 | `docs/backlog.md` | @po |

---

## 3. 🔨 ARBITRAGEM — o item `W1-2c`

### 3.1 A questão

O @sm sustenta que o `W1-2c` tem duas metades de naturezas opostas — **escrita** (gravar
`ofertas_do_sistema` e `afirmado_pela_nicole`: subtração de cegueira, cabe na Onda 1) e **leitura**
(o `"Ok"` do lead resolver contra a oferta: **caminho de decisão novo**, proibido pela regra de corte
da Onda 1) — e aponta que a **condição de aceite nº 4 do @architect exige a metade de leitura**, de
modo que a condição e a regra de corte do epic **se contradizem**.

### 3.2 Decisão

> ## ✅ **A divisão está APROVADA.** Escrita na Onda 1 (`W1-2c`); leitura vira item próprio na Onda 3
> (`W3-2e`), atrás do validador. **E não há contradição a arbitrar** — há uma atribuição de onda que
> o epic nunca fez.

**Fundamento 1 — a leitura é, sem margem, um caminho de decisão novo.**
Hoje, quando o lead responde `"Ok"` a uma oferta, o parser não tem a que se referir e o sistema
**pergunta de novo** (medido: Valnira, 04/08 00:10). Com a metade de leitura, `"Ok"` passa a resolver
um slot concreto e, pelo `isVisitSchedulingMode` + `evaluateSlot`, **pode criar `appointment` sem que
o lead tenha dito dia nem hora em turno nenhum**. Isso é exatamente *"agendar sozinho"*, que é a
classe do incidente que o epic existe para fechar. A regra de corte da Onda 1 — *"nenhuma story pode
adicionar um novo caminho de decisão da Nicole"* — se aplica sem interpretação.

**Fundamento 2 — a condição nº 4 do @architect não atribui onda. O epic é que atribui.**
O texto é: *"O estado registrar oferta e afirmação com data absoluta, com teste em que o lead
responde 'Ok' a uma oferta e o slot resolve sem chamar modelo nenhum."* É uma condição de **aceite
do epic inteiro** — não diz *"na Onda 1"*. Não existe contradição entre o @architect e a regra de
corte: existe uma **atribuição de onda ausente**, que o epic fez por omissão ao classificar o
`W1-2c` como um item só. **O @sm achou uma lacuna, não um conflito** — e essa distinção importa,
porque significa que eu não estou revogando nada do @architect.

**Fundamento 3 — o rótulo de risco "Baixo" está certo no eixo do epic e incompleto.**
A coluna do roadmap é explicitamente *"risco de **regressão em produção**"*. Trinta linhas
determinísticas dificilmente quebram o que existe: **"Baixo" está correto nesse eixo.** O @sm mede
outro eixo — o risco do comportamento novo estar errado — e nesse eixo é **Alto**. Os dois estão
certos sobre o próprio eixo. **A correção não é reclassificar; é passar a declarar os dois.**
Recomendo ao @pm: coluna "Risco" vira **"Regressão / Comportamento novo"** nos itens que adicionam
caminho de decisão. Aplica-se também ao `W3-2b` e ao `W3-3`.

**Fundamento 4 — e este é o que fecha o caso, e nenhum dos dois trouxe: a metade de leitura hoje
seria alimentada por um sinal com 21% de erro.**
`afirmado_pela_nicole` sairia da `detectAffirmedSlot`, cuja precisão medida é **~79%** (@architect
§2.8). **Confirmei na minha rodada:** dos 30 disparos em 60 dias, pelo menos **cinco são oferta ou
pergunta**, não afirmação:

```
Sueli   03/08  "Vou confirmar a disponibilidade para sexta, dia 7, às 14h e já te aviso"
Adriele 29/06  "Posso confirmar sua visita para este sábado, dia 4 de julho, às 11h?"
Célia   28/06  "Nosso atendimento no sábado é até as 12h. Qual horário fica melhor pra você?"
Sandra  05/08  "Sábado, dia 8, está anotado… qual horário fica melhor pra você?"
Ailton  31/07  "Vou confirmar seu agendamento: segunda-feira, 3 de agosto às 12h"
```

Ligar a leitura hoje é deixar o `"Ok"` do lead resolver contra um horário que a Nicole **nunca
afirmou** em ~1 de cada 5 casos. E o próprio @architect já ordenou o pré-requisito: a **condição
nº 7** — *"`detectAffirmedSlot` não disparar nas seis strings interrogativas da §2.8 antes de
qualquer promoção a fail-closed"* — e essa guarda mora no **Epic 88**. **A leitura já tinha um
bloqueio, escrito pelo próprio autor da condição nº 4; ninguém tinha ligado as duas coisas.**

### 3.3 Refinamento que eu acrescento: a divisão é mais fina que "escrita × leitura"

As duas metades de escrita **não têm a mesma confiabilidade**, e isso decide o que a Onda 3 pode ler:

| Campo | Origem | Confiança | Uso permitido |
|---|---|---|---|
| **`ofertas_do_sistema`** | `authorizedSlotUtc` / `freeSlotsInPeriod` — **o sistema calculou** | **Alta** — é o mesmo valor determinístico que hoje morre no fim do turno | Onda 1 escreve; **é este que a Onda 3 lê** |
| **`afirmado_pela_nicole`** | `detectAffirmedSlot` — **parseado da prosa dela** | **~79%** | Onda 1 escreve como **observabilidade write-only**, rotulado não-confiável. **Nunca** é insumo de decisão até a guarda de interrogação (Epic 88) subir |

Isto está alinhado com a letra da condição nº 4 — *"o lead responde 'Ok' **a uma oferta**"*, e não
"a uma afirmação". **A story da Onda 3 deve dizer, com todas as letras, que resolve contra
`ofertas_do_sistema` e nunca contra `afirmado_pela_nicole`.**

### 3.4 O efeito colateral sobre o Epic 88 — o @sm acertou a direção e errou a magnitude

O @sm avisa que empurrar a leitura para a Onda 3 **atrasa o Epic 88**, porque o gatilho turn-local
depende dessa metade. **Fui ao Epic 88 conferir. Depende da metade de ESCRITA, não da de leitura:**

> `epic-88` §4.1: *"o gatilho passa a ser 'expressão temporal na mensagem do lead' **OU** 'o turno
> anterior registrou oferta'"*
> `epic-88` F-9 / §12: *"Sem ele o gatilho turn-local é cego nos turnos 'Ok'"* — o que o gatilho
> precisa saber é que **existe uma oferta viva**.

Para o `tool_choice` forçado disparar, basta `ofertas_do_sistema` estar persistido. **Quem resolve o
slot depois é a tool** — é literalmente a fronteira do Epic 88 ("o determinismo mantém a LEITURA, a
tool assume a ESCRITA"). A resolução determinística do `"Ok"` seria, no mundo do Epic 88,
**redundante com a tool**.

> ✅ **Conclusão: o Epic 88 NÃO atrasa.** O `88-7` é desbloqueado pela metade de escrita, que fica na
> Onda 1. O que espera a Onda 3 é apenas o caminho determinístico — que só faz falta se o Epic 88
> **não** subir (lastro ≥ 90%). Nesse cenário ele é exatamente o item certo para estar atrás do
> validador.

### 3.5 O que muda, e quem edita

| # | Mudança | Documento | Dono |
|---|---|---|---|
| **A1** | `W1-2c` reescrito como **só escrita**: persistir `ofertas_do_sistema` (do `authorizedSlotUtc`/`freeSlotsInPeriod`) e `afirmado_pela_nicole` (rotulado ~79%, write-only). Risco: **Baixo/Baixo**. Depende de `W1-2b` | Epic 87 §7/Onda 1 | **@pm** |
| **A2** | Item **novo `W3-2e`** na Onda 3: *"o `"Ok"` do lead resolve contra `ofertas_do_sistema`"*, atrás do `W3-1` (validador) **e** da guarda de interrogação do Epic 88 (condição nº 7). Risco: **Baixo regressão / Alto comportamento** | Epic 87 §7/Onda 3 + §9 (diagrama) | **@pm** |
| **A3** | Nota explícita: *"a condição nº 4 do @architect é atendida em duas ondas — a escrita no `W1-2c` e o teste do `"Ok"` no `W3-2e`. A condição não atribui onda; a atribuição é do epic."* | Epic 87 §7/Onda 1 | **@pm** |
| **A4** | Coluna "Risco" passa a declarar **dois eixos** (regressão / comportamento novo) nos itens que adicionam caminho de decisão (`W1-2c`→`W3-2e`, `W3-2b`, `W3-3`) | Epic 87 §7 | **@pm** |
| **A5** | 🔴 **Repontar a dependência do `88-7`**: hoje o `depends_on` do Epic 88 (linha 26), a §4.1, o **F-9** e a tabela de §12 dizem *"Epic 87 · W1-2c"*. Passa a dizer **"Epic 87 · W1-2c (metade de ESCRITA — `ofertas_do_sistema`)"**, com a frase *"o `88-7` NÃO depende do `W3-2e`"*. **Sem esta edição, mover a leitura para a Onda 3 vai ser lido como bloqueio do Epic 88 inteiro, e alguém vai "restaurar" a leitura para a Onda 1 citando urgência** | Epic 88 (frontmatter, §4.1, F-9, §12) | **@pm** |
| **A6** | Campos reservados no `AgendaState` da 87-4: manter, e acrescentar no comentário *"`ofertas_do_sistema` é escrito pelo `W1-2c` e lido pelo `W3-2e`; `afirmado_pela_nicole` é write-only até a guarda de interrogação do Epic 88"* | Story 87-4, Desenho §1 | **@sm** |

---

## 4. Escopo — os achados adjacentes ficam fora? **Sim, dois de três.**

| Achado | Fora de escopo? | Endereçado? |
|---|---|---|
| **`detect-appointment.ts:71`** — `collectedData.visit_availability === true` num campo que sempre foi string ⇒ **sempre falso** | ✅ **Sim.** Conferido no código (linha 71). "Consertar" liga um caminho de detecção que hoje está morto = caminho de decisão novo = proibido pela regra de corte da Onda 1. O @sm acertou | 🟡 **Não.** Não está em `docs/backlog.md`. A T9 da 87-4 o abre — mas T9 dentro de uma story que ainda não começou é frágil. **C5: abrir agora** |
| **fala humana gravada como `role='assistant'`** (`api/leads/[id]/send-message/route.ts:217`, `metadata.is_transition=true`) | ✅ **Sim.** A 87-3 trata como **filtro do módulo**, que é o certo — o defeito de origem tem raio muito maior. 104 mensagens no período, **nenhuma dispara a `detectAffirmedSlot`** hoje | 🔴 **Não, em lugar nenhum.** Cada consumidor futuro (`W2-3`, `W3-1`, `88-3`) vai reencontrá-lo. **Abrir item de backlog** |
| **`enrich-leads` grava `visit_availability` via Haiku** (achado meu, §2.2/C1) | 🔴 **NÃO pode ficar fora** da 87-4 — inviabiliza a AC8 e deixa metade da fábrica ligada | Entra no escopo (C1) |

**As duas stories não incham com estas correções.** A 87-3 ganha um discriminador (~20 linhas), um
balde e uma guarda de data; a 87-4 ganha uma linha removida de um prompt e um filtro num merge.
Nenhuma correção adiciona caminho de decisão — **todas são subtração ou instrumentação.**

---

## 5. Vereditos

### 🔴 Story 87-3 — **NO-GO** (6/10)

Bloqueiam: **B6** (o número que a story existe para produzir está calibrado errado — 7%/30% medidos
contra 31%/81% exigidos), **B2** (a Silvana aparece, e o `OUT` proíbe o único conserto previsto),
**B5** (o `Invalid Date` faz o job publicar 0% com a AC1 verde) e **B1** (7 × 8 casos).
Acompanham: B3, B4, B7, B8 e a estimativa S → M.

**A story é excelente e está a uma revisão de ser aprovada.** O NO-GO não é sobre redação — é sobre
não deixar entrar em execução o instrumento que decide o rumo do Epic 88 com a calibração errada.

**Status permanece `Draft`.** Reapresentar ao @po depois de B1, B2, B5, B6 e B8.

### 🟡 Story 87-4 — **GO condicional** (7/10)

Aprovada a decisão de desenho (colapsar os campos; a guarda de período como porta única). As cinco
correções são aditivas e não mudam o desenho: **C1** (7º consumidor — o escritor `enrich-leads`),
**C2** (fixtures da AC4 medidas), **C3** (56/9/6/35 no lugar de "~22 / o dado está limpo"),
**C4** (citações do @architect) e **C5** (backlog).

**Status permanece `Draft` até C1–C4 entrarem no arquivo.** Aplicadas, o @po vira para `Ready` sem
nova rodada de validação — não há mérito pendente, só edição.

### ✅ `W1-2c` — divisão **aprovada**, com refinamento (§3.3) e a edição **A5 no Epic 88** como
obrigatória. **O Epic 88 não atrasa.**

---

## 6. Ordem de execução recomendada

```
1. @pm     → A1..A5 no Epic 87 e no Epic 88          (arbitragem do W1-2c; sem código)
2. @sm     → C1..C4 na 87-4  ·  B1,B2,B5,B6,B8 na 87-3
3. @po     → C5 + o item do role='assistant' no backlog · vira 87-4 para Ready
4. @po     → revalidar a 87-3 (só os pontos corrigidos)
5. @dev    → 87-3 primeiro (é read-only e é o instrumento do baseline da 87-4, AC10)
6. @dev    → 87-4, deploy sozinho, 24h, D7 com responsável nomeado
```

> A 87-3 vai antes da 87-4 mesmo tendo NO-GO agora: a **AC10 da 87-4** mede `M1` e `M4`
> *"pela rotina da Story 87-3"*. Sem o instrumento, a validação em produção da 87-4 não tem régua.

---

**CodeRabbit Integration:** Disabled (sem chave `coderabbit_integration` em `.aios-core/core-config.yaml`)

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-07 | 1.0 | Validação das stories 87-3 (NO-GO 6/10) e 87-4 (GO condicional 7/10) e arbitragem do `W1-2c` (divisão aprovada). Todas as verificações numéricas remedidas contra o banco de produção e o código em `HEAD`: a régua da 87-3 dá **7%/30%**, não 31%/81% (4 causas: denominador, unidade, filtro de `status` contraditório, e o balde `lembrete` ausente que enviesa o gate); a **Silvana aparece** no relatório (`detectAffirmedSlot` dispara em *"o corretor te liga"*); **25 de 30** disparos mudam de valor sem a âncora; `Invalid Date` de `timestamptz` produz **0% com AC1 verde**; o cron `30 11` **colide** com `billing-monthly-summary`; a 87-4 tem **7º consumidor não mapeado — o cron `enrich-leads` que ESCREVE `visit_availability` via Haiku 48×/dia**, o que torna a AC8 inexequível; a fixture da AC4 (Sandra) é **verde** contra o `HEAD` (a 75-245 bloqueia a faixa "de 8h às 12h") e as seeds armadas de verdade hoje são **Maria Oliveira e Edicleia**; o resíduo em produção é **56 estados, 6 armados, 35 com dia que anda** — não os ~22 herdados de 07/08. | @po (Pax) |
