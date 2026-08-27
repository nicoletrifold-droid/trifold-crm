# Validação @po — Story 87-18 (*"erro de consulta para de virar horário livre em silêncio"*)

**Validador:** @po (Pax) · **Data:** 2026-08-27 · **Story:** `docs/stories/87-18-erro-de-consulta-vira-horario-livre-em-silencio.story.md` (`Draft`, 646 linhas na entrada)
**Base de conferência:** 🔴 **`HEAD` = `cdf4411e`, branch `fix/87-17-fatia1-oferta-de-horario-espalhada`** — **NÃO `main`** (`main` = `origin/main` = `98772465`). Árvore com 1 arquivo modificado (`.claude/agent-memory/aios-sm/`) e a story nova, não commitada.
**O que eu executei:** `git`, `grep`, leitura de código, e **um `tsc --noEmit --strict` de 12 linhas em scratchpad, com contraprova** (§1 abaixo). **Nenhum build, nenhum teste do projeto, produção não reapurada.**
**Pareceres relacionados:** `docs/qa/po-validation-87-17.md` (o meu de hoje, que governa o contexto) · `docs/qa/gates/87-17-fatia1-oferta-de-horario-espalhada.yml` (gate `CONCERNS` do @qa, origem do `REL-1`)

---

## VEREDITO: 🟢 **GO** — `Draft` → **`Ready`**

**Placar do checklist: 8,0 / 10** (6 ✅ × 1,0 + 4 ⚠️ × 0,5). **Nenhum bloqueante.** O diagnóstico do
@sm está **inteiro certo** — conferi linha a linha o `error` descartado, os dois chamadores, os
quatro sítios de `pipeline.ts` e as duas mensagens existentes — e a fronteira com o `REL-1` está bem
desenhada, com a `AC7` falsificável. O @sm também fez a coisa certa ao **escalar** as três decisões
em vez de tomá-las.

O que eu achei de errado está quase todo do lado da **rede de segurança**, e um dos achados é grave o
bastante para mudar a leitura de risco da story:

> ### 🔴 A proteção em que a story se apoia para o tri-estado **não existe**. O `tsc` dá EXIT=0 na forma errada — e o modo de falha dela é **pior que o defeito original**: `"occupied"` viraria `"free"` para **todo** horário ocupado.

Não devolvi a story ao @sm. ACs e escopo são meus por autoridade, a evidência é boa, e o conserto
das lacunas cabe em ACs novas. **Corrigi no corpo**, em blocos marcados **`[@po 27/08]`**, e movi
para `Ready`. **Uma fatia, um PR — o `#517`, que passa a carregar as duas stories.**

---

## 1. 🔴 O achado que muda a régua: **o `tsc` não protege o tri-estado, e o `eslint` também não**

A story afirma, no §6, que um union type de string *"não passa despercebido num
`if (await isSlotFree(...))` (**deixa de compilar** — o TypeScript obriga a comparação explícita), o
que é uma proteção, não um acidente"*. A `Testing` repete (*"o TypeScript pega sozinho em qualquer
chamador esquecido"*) e o `R1` usa isso como **mitigação principal**, classificando a probabilidade
como *"Baixa (o union type obriga comparação explícita)"*.

**Medi. É falso nas três vezes.** Compilei as **duas formas exatas que os dois chamadores usam
hoje**:

```ts
type SlotCheck = "free" | "occupied" | "unknown"
async function isSlotFree(): Promise<SlotCheck> { return "occupied" }
if (await isSlotFree()) alternatives.push(1)        // checkSlotAvailability:586 e :621
return cands.filter((_, i) => livre[i])             // freeSlotsInPeriod (branch 87-17)
```

| medição | resultado |
|---|---|
| `tsc --noEmit --strict` no arquivo acima | **EXIT=0**, saída de **0 linhas** (contadas por `grep -c .`) |
| contraprova — mesmo comando num `const x: number = "s"` | **EXIT=2**, `TS2322` |
| `grep -rn "strict-boolean-expressions"` (fora de `node_modules`) | **nada** — o `eslint` não tem a rede |

*(Capturei o exit code por variável, não por pipe: `out=$(tsc …); rc=$?`. A primeira tentativa
mediu o exit do `head` e teria me dado um falso verde — é a classe de erro que já está anotada no
repo ao lado do `grep -c` e do `timeout` do macOS.)*

**Por que não pega:** truthiness de union de strings sem constituinte falsy não é erro em
TypeScript, e o predicado de `Array.prototype.filter` é tipado como `=> unknown` — string passa.

**E o modo de falha não é o que a story imagina.** A story teme que o `"unknown"` escape. O risco
real é que **`"occupied"` é truthy**: se um dos dois chamadores ficar na forma booleana, **todo
horário ocupado passa a ser oferecido e confirmado como livre**. Uma story que existe para fechar o
agendamento fantasma criaria a **versão universal** dele, com `tsc` e `lint` verdes.

### 1.1 A rede real existe, é forte, e é outra — dois testes **pré-existentes**

| teste | o que acontece com a forma booleana |
|---|---|
| `visit-slot.test.ts:325` — *"compromisso HOUSE no mesmo horário bloqueia"*, asserta `free === false` | `"occupied"` truthy → `free === true` → **vermelho** (`expected true to be false`) |
| o caso do sábado de manhã com 10h ocupado (`~:502`/`:597`, recalibrado pela `87-17` para `[8:00, 9:00, 11:00]`) | os 7 candidatos entram como livres em vez de 4 → `espalhar` devolve `[8:00, 9:30, 11:00]` → **vermelho** |

Conferi a aritmética do segundo no papel: sábado manhã tem 7 candidatos (`8:00`…`11:00`); com `10:00`
ocupado, a janela de sobreposição mata `9:30`/`10:00`/`10:30` → 4 livres → `espalhar(4,3)` = índices
`0/2/3` = `[8:00, 9:00, 11:00]`. Com o predicado truthy, 7 livres → índices `0/3/6` =
`[8:00, 9:30, 11:00]`. O teste distingue os dois.

**Consequências, aplicadas na story:**

1. **`AC10` nova** — obriga **duas mutações** no `T6`, uma por chamador, com o vermelho colado. Sem
   elas, ninguém neste PR sabe se a rede existe.
2. **`R1` reescrito** — probabilidade sobe de "Baixa" para **Média** (a probabilidade é a de um
   humano esquecer, *sem nenhuma ferramenta avisando*), e a mitigação deixa de citar o `tsc`.
3. **§6 e `Testing` corrigidos**, com a medição e a contraprova colados.
4. **`DECISÃO 3`** (abaixo) passa a ter fundamento de segurança, não de estilo.

---

## 2. 🎯 DECISÃO 1 — **as duas no MESMO PR (`#517`)**, `87-18` commitada em cima da `87-17`

**Decidido: opção (a).**

**Racional em uma linha:** *qualquer ordem que não seja "mesmo PR" força UMA remedição do `#517` e,
além dela, uma reescrita das ACs desta story contra uma geometria de código que o próprio `#517`
apaga na mesma semana.*

O ponto que decide não é preferência — é que **a opção (b) é incoerente com o desenho desta story**:

| fato medido em 27/08 | consequência |
|---|---|
| **`main` (`98772465`) tem `freeSlotsInPeriod` com `if (free.length >= limit) break` e `return free`** — sem `Promise.all`, sem `espalhar`, devolvendo `Date[]` | a `AC4` (*"um dos 8 candidatos vem `unknown`"*) é **inalcançável** em `main`: lá a função consulta 3 candidatos e para. A `AC5` (*"os 8 vêm `unknown`"*) idem |
| a árvore em que a story foi escrita **é a branch** | **todo o mapa de código do §Dev Notes (`552-574`, `671-698`, `693-695`) só existe na branch.** O @sm não declarou isso, e sem a declaração um @dev que fizesse `git checkout main` acharia que o mapa está podre |
| na (b), o `#517` rebasearia em cima de um `freeSlotsInPeriod` que passou a devolver `{ slots, houveIncerteza }` | **o `#517` é remedido de qualquer jeito.** O argumento *"ele já está verde, medido três vezes"* **não sobrevive a nenhuma ordem que não seja a (a)** |

Ou seja: o contrapeso que o Marcos me pediu para pesar (*"o `#517` já foi medido três vezes; segurá-lo
mantém em produção a oferta colada no meio-dia que a Ana ouviu"*) **aponta para a (a)**, não contra
ela. A (a) é a ordem que paga a remedição **uma** vez e que entrega a decisão dele ("nenhuma das duas
em produção sozinha") de graça — porque um PR é um deploy.

**O que a (a) obriga** (escrito no §0 da story): o gate da `87-17` Fatia 1 continua válido para as
ACs dele (a fronteira dele foi medida no diff `98772465..1454d4ca`, e os commits desta story vêm
depois); o @qa emite um **segundo** gate no mesmo PR; o baseline da suíte desta story é **a branch**
(`3145 | 6`), não o `main` (`3137 | 6`); e o @devops renomeia o PR para nomear as duas stories.

**Válvula de escape, se a implementação estourar — e só nesse caso:** cortar **na linha do `emit`**.
Fatia A (`AC1`-`AC5`, `AC7`-`AC10`) entra no `#517`; Fatia B (`AC6`, o evento) vira PR próprio e
**não é gate de deploy**. O que trava o `#517` é *"nunca afirmar o que não se sabe"*; observabilidade
é desejável, não é o bloqueio. **Nenhum outro corte é autorizado** — sem `AC2`/`AC5` a story não
existe.

---

## 3. 🔴 DECISÃO 2 — os dois sítios de `packages/web` viram **`87-19`, P1**. E sim: **o raio deles é MAIOR** que o do `isSlotFree`

O @sm pediu que eu decidisse e avisou que a prioridade poderia se inverter. **Inverte em gravidade,
não em ordem.** E o fato que decide **não estava no §3 dele**.

### 3.1 Três correções de fato

| # | o §3 afirma | medido em 27/08 |
|---|---|---|
| 1 | *"`ocupadosDaEquipe` alimenta **as duas** rotas públicas"* | **Não.** `/api/agendar/[token]` **não importa** `ocupadosDaEquipe`: tem cópia privada, `imobBusyBetween` (`route.ts:46-57`). Os consumidores reais são `/api/formulario/[token]/agenda:155` e — via `gradeDaEquipe` (`team-slots.ts:53-73`) — `/api/formulario/[token]/agenda:67` e `/api/appointments/slots:37`. São **2 helpers, 4 consumidores** |
| 2 | *"faz a grade do dia inteira parecer aberta"* | **Verdade** — `gradeDaEquipe` passa o resultado como `busy` para `imobSlotsForDay`; `busy = []` abre a grade do GET |
| 3 | *(ausente)* | 🔴 **Os DOIS `POST` usam esses helpers como ÚLTIMO PORTÃO antes do `.insert()`** |

O item 3, com os números:

```
agendar/[token]/route.ts:145   busy = await imobBusyBetween(...)
                        :150   taken = busy.some(overlaps)
                        :155   if (taken) return 409
                        :208   .from("appointments").insert({...})     ← grava

formulario/[token]/agenda/route.ts:155  ocupados = await ocupadosDaEquipe(...)
                                 :162  tomado = ocupados.some(overlaps)
                                 :166  if (tomado) return 409
                                 :192  .from("appointments").insert({...})  ← grava
```

**`data ?? []` sob erro → lista vazia → `taken/tomado === false` → o portão abre inteiro e a linha é
GRAVADA.**

### 3.2 Por que o raio é maior — quatro razões, na ordem em que pesam

1. **Uma consulta que falha apaga o dia inteiro, não um candidato.** `isSlotFree` é uma query **por
   candidato**: um `error` contamina **aquele** horário. `ocupadosDaEquipe`/`imobBusyBetween` são
   **uma query pela janela toda**: um `error` faz **todos** os compromissos do dia desaparecerem de
   uma vez.
2. **O erro cai exatamente no portão de escrita**, e não há segunda conferência depois dele.
3. **Não há ninguém no meio.** Links **públicos por token**, sem sessão: nenhuma Nicole, nenhum
   corretor, nenhum SDR para estranhar. No caminho da Nicole o bloco `[SISTEMA]` ainda passa por um
   modelo e por uma conversa com uma pessoa; aqui a resposta é um `200` e uma linha nova.
4. **Consequência física:** duas pessoas no Decorado no mesmo horário, com confirmação enviada às
   duas.

*(Registro a favor da `87-18`, por honestidade: o defeito dela também chega ao `INSERT` — conferi a
cadeia `free === true` → `bookableSlotUtc`/`authorizedSlotUtc` (`pipeline.ts:1113-1114`) → `:1563` →
`.insert()` (`:1571`). E ela concede de brinde o `authorizedSlotUtc`, que é a autorização que o
enforcement do epic usa para distinguir "a Nicole podia afirmar isso" de `NICOLE_SLOT_UNAUTHORIZED`.
Escrevi isso no §1 da story: é agendamento fantasma **com carimbo de legítimo**. Mesmo assim, o raio
por consulta falha é de UM horário, e há humano no meio.)*

### 3.3 Por que então **não** entra na `87-18`

**Porque o remédio é o OPOSTO.** Aqui: `unknown` → **omitir o candidato e seguir** (a oferta é
amostra por natureza, §5). Lá: uma lista de ocupados parcial é **indistinguível** de uma lista
completa, então o único remédio honesto é **falhar FECHADO** — propagar o erro e **recusar a
gravação** (`503` "não consegui confirmar agora"), nunca gravar sob incerteza.

Juntar duas invariantes opostas no mesmo PR é **exatamente o erro que a `AC7` desta story existe
para impedir** do lado do `REL-1`. Não vou cometê-lo pela porta do escopo depois de ratificar a
`AC7` como controle de fronteira.

Somam-se: outro pacote, outro harness (`team-slots.test.ts` já existe, com `fakeClient` próprio),
outra semântica de saída (código HTTP, não prosa `[SISTEMA]`) e outro perfil de probabilidade — os
dois helpers usam o **admin client** (`createAdminClient`, service-role), então o gatilho "RLS
surpresa" **não se aplica** lá; sobram `timeout`, cache de schema e `5xx`.

### 3.4 Sequenciamento — o único ponto em que a `87-18` ganha

A `87-18` está **acoplada a um deploy que já está na fila**; a `87-19` não está acoplada a nada.
Logo: **`87-18` (+ `#517`) sai agora; `87-19` é a próxima coisa depois deste deploy, ANTES da Fatia 2
da `87-17`** — que é melhoria de produto sobre um defeito já consertado. Registrada em
`docs/backlog.md` como **P1**, com a evidência acima, para `@sm *draft`. **Não é gate do `#517`.**

---

## 4. DECISÃO 3 — a forma do `emit` **vira AC**: parâmetro novo no fim. Nada de objeto de opções

O @sm deixou para o @dev, com a régua do `Promise.all` da `87-17`. **A régua não se aplica**: lá a
forma era estilo, aqui ela mexe no para-quedas.

- **Os dois testes que seguram esta story são exatamente os que a refatoração reescreveria.** Como o
  §1 mostra, `tsc` e `eslint` não pegam a forma booleana; a única rede é `visit-slot.test.ts:325` e o
  caso do sábado de manhã. Um objeto de opções obriga a reescrever a **lista de argumentos** das 14
  chamadas de teste, **no mesmo PR** em que duas delas são a rede. É o `R6` mirando no próprio
  para-quedas.
- **Custo medido da forma posicional: exatamente 4 `undefined`** em código de produção — `:1015` (0),
  `:1107` (1), `:1044` (1), `:1123` (2). Quatro `undefined` é barato pelo direito de não tocar a
  lista de argumentos de 14 testes.
- **Travado como `AC10-(iii)`:** nenhum parâmetro existente muda de posição, nome ou default; `emit`
  entra **só no fim** (posicional ou como objeto contendo **apenas** o parâmetro novo). Se um diff de
  teste desta story tocar a lista de **argumentos** de uma chamada pré-existente, é violação.
- **`AC10-(iv)`, de brinde e por causa disto:** `erro` significava **duas coisas diferentes** nas duas
  funções — *"o horário pedido é incerto"* em `checkSlotAvailability`, *"algum candidato foi incerto"*
  em `freeSlotsInPeriod`. Um nome, duas semânticas, nas duas metades do mesmo conserto: é a
  `Armadilha 2` esperando a próxima refatoração. Passam a ser **`erroNoPedido`** e
  **`houveIncerteza`**.

---

## 5. ✅ A fronteira com o `REL-1` está bem desenhada — e a `AC7` é falsificável

Era o ponto que o Marcos pediu para eu confirmar com olhar crítico. **Confirmo, com uma correção.**

A distinção dos dois caminhos está **certa**, e conferi contra as duas fontes independentes:
`docs/backlog.md:9-34` e o `PA-3`/`REL-1` do gate do @qa. Caminho A (o `fetch` **lança**) sobe até
`catch (asyncErr)` do webhook (`route.ts:1328`), vira `WEBHOOK_ASYNC_ERROR`, **o lead não recebe
resposta** — ruim, mas **observável**. Caminho B (o PostgREST **responde** `{ data: null, error }`)
é engolido e vira "livre" — **silencioso**. Os remédios são opostos, e a story trata só o B.

**A `AC7` é falsificável:** a asserção comportamental (`await expect(freeSlotsInPeriod(...))
.rejects.toThrow()`) reprova qualquer `try/catch` novo, e reprova pelo comportamento, não por
inspeção. Apertei duas coisas: (i) o controle de `grep` era secundário **e tinha a forma errada** —
`\s` não é portável no `grep` do macOS; virou `grep -nE "try[[:space:]]*\{"`, comparado contra a
contagem do `HEAD`; (ii) fica escrito que a asserção comportamental é a prova e o `grep` é o
acessório.

**A correção:** a story diz que *"o `REL-1` continua integralmente em aberto, com a mesma decisão
pendente (a e b de lá)"*. **A fronteira continua, a decisão não.** Depois desta story, a opção **(a)**
do `REL-1` (*"`Promise.allSettled` + rejeição = não livre"*) **contradiz a invariante central desta
story**: uma rejeição de rede é a MESMA ignorância que um `error` do PostgREST, e chamá-la de
"ocupado" reintroduziria pela porta do caminho A a mentira fechada no caminho B. **O `REL-1` não é
absorvido — é estreitado**, e a sobrevivente (b) fica quase de graça (a mensagem honesta e o evento
já existirão; falta mapear a rejeição para `"unknown"`). Registrei ao lado do item no
`docs/backlog.md`, sem desfazer o registro original — que é condição do gate da `87-17`.

---

## 6. 🔴 A `AC5` é o coração, e ela aguenta — mas **a mentira entrou por outra porta**

A pergunta do Marcos era a certa: *"alguma AC ficaria verde num conserto que troca silêncio por
mentira?"*. Rodei as versões erradas no papel, como fiz na `87-17`:

| versão errada do conserto | onde reprova |
|---|---|
| `unknown` → `"free"` (o `HEAD`) | `AC1` 🔴 |
| `unknown` → `"occupied"` | `AC1` 🔴, `AC2` 🔴 (`erroNoPedido` viria `false` e a frase seria "já existe uma visita"), `AC5` 🔴 (a frase seria "não há horário livre") |
| lista vazia por erro tratada como "não há horário" | `AC5` 🔴 — é o próprio ponto dela |

**A `AC5` está de pé, e as três ACs juntas formam a armadilha certa.** Mas encontrei **uma versão
errada que ficava verde** — e ela não é a "mentira", é a **opção (b) que o §5 rejeitou por escrito**,
entrando pela camada que nenhuma AC cobria:

> ### A `AC4` assertava só o **valor de retorno** da função. Uma implementação com `houveIncerteza ? mensagemNova : …` passaria `AC4`, `AC5` **e** `AC8` — e jogaria no lixo uma oferta boa e inteira a cada soluço de **um** candidato entre onze.

O §5 gastou três argumentos para decidir *"omitir e seguir, não abortar"*. A decisão estava certa e
**não tinha controle na camada em que o lead a sente**: a mensagem. Se 1 de 8 candidatos falha e 7
são confirmados livres, a Nicole tem de dizer *"Horários LIVRES nesse período: 12h, 14h, 17h"* — não
*"não consegui confirmar"*. **`AC4-(ii)` nova** fixa isso nos dois sítios (`:1044` e `:1123`), e o
Desenho §3 ganhou a nota de que **a ordem dos testes na expressão é normativa**: `slots.length`
primeiro, `houveIncerteza` depois.

*(É a mesma régua que usei na `87-17`: não "o teste está bem escrito?", mas "**o que este teste deixa
passar?**". Ali a `AC5` autorizava chamar `12h30` de "mais tarde" que `17h`; aqui a `AC4` autorizava
descartar uma oferta boa por causa de um candidato.)*

### 6.1 Reflexo disso na `AC6`

Com o **curto-circuito** (§7), o segundo controle da `AC6` (*"primário + 1 alternativa `unknown` →
`candidatos_com_erro === 2`"*) ficou **inalcançável**. Troquei por um controle melhor: horário pedido
**ocupado de verdade** + 2 alternativas `"unknown"` → **uma** emissão, `candidatos_com_erro === 2`,
**`erroNoPedido === false`** e a mensagem existente de "já existe uma visita". É o gêmeo da
`AC4-(ii)` do lado do `checkSlotAvailability`: prova que incerteza **nas alternativas** não contamina
a afirmação sobre o horário **pedido**.

---

## 7. 🔴 O custo escondido que a story não viu: **~37 consultas sequenciais no caminho do erro**

Mesma classe do achado `§3.2` da minha validação da `87-17` (lá era 3 → 11 round-trips), e mais
grave, porque acontece **justamente quando o banco está ruim**.

No desenho original, `primary === "unknown"` **não** retorna: cai no laço de alternativas. E o laço
só para em `alternatives.length >= 3`. Num outage — que é exatamente o cenário em que o primário
falha — **nenhum** candidato vira alternativa, então o laço varre a lista **inteira**:

| trecho | candidatos |
|---|---|
| resto do dia pedido (`visit-slot.ts:601`) | até ~18 |
| **dia seguinte COMPLETO** (`:614` — o laço vai de `OPEN_HOUR` até o fechamento, **não** só a manhã, apesar do comentário do `:605` dizer "Próximo dia" e o docstring dizer "manhã do próximo dia útil") | até ~19 |
| **total** | **até ~37 consultas, SEQUENCIAIS** (`for … await`, não `Promise.all`) |

37 round-trips em série contra um PostgREST que acabou de devolver erro, dentro do caminho da
resposta ao lead. A story trocaria uma mentira silenciosa por um **estouro do orçamento assíncrono do
webhook** — e as alternativas nem são usadas pela mensagem que ela mesma especifica.

**Conserto, aplicado no Desenho §2 e travado na `AC2-(ii)`:** curto-circuito — primário `"unknown"`
→ `emit` + `return { free: false, alternatives: [], erroNoPedido: true }`. **1 consulta**, medida com
o `hooks.onEmit` do `fakeSupabase` que a `87-17` já construiu. Novo risco `R8`.

---

## 8. ⚠️ A `AC9` ("zero recalibração de golden") **se sustenta** — com dois números corrigidos

O Marcos pediu para eu desconfiar disso, dado o histórico da `87-17` (três goldens vermelhos que o
@sm tinha subestimado). **Aqui a afirmação é verdadeira, e a razão é boa:** nenhuma fixture existente
injeta `error` no `appointments`, então todo teste de hoje exercita só `"free"`/`"occupied"`, cujo
comportamento não muda. Confirmei os dois lados:

- **Nenhum `vi.mock` de `visit-slot`** em todo o repo (`grep` → nada). Se houvesse um mock devolvendo
  array, a troca de forma o quebraria.
- **Nenhum importador de `checkSlotAvailability`/`freeSlotsInPeriod` fora de `packages/ai`** — só
  `pipeline.ts:37` e o próprio teste. `packages/web` não os usa. O `tsc` cobre esses (mudança de
  forma de **retorno** de função **exportada** ele pega; o que ele não pega são os dois chamadores
  internos de `isSlotFree`, §1).
- Os testes de `pipeline-agenda-state.test.ts` (`~376`, `~598`, `~640`) passam por `:1044`/`:1123` via
  `processMessage` com `appointments` sem erro → mesma saída. **Nenhum golden recalibrado.**

**Dois números corrigidos:**

1. **"~15 chamadas de teste" são 14**, conferidas por `grep`: 5 de `checkSlotAvailability` (`:319`,
   `:325`, `:336`, `:344`, `:355`) + 9 de `freeSlotsInPeriod` (`:502`, `:511`, `:518`, `:524`, `:597`,
   `:608`, `:622`, `:631`, `:645`). As 3 de `espalhar` **não** mudam. Escrevi na `AC9` que **um número
   diferente de 14 significa que a base não é `cdf4411e` — PARE e reconfira a branch.**
2. **O baseline é a branch, não o `main`:** `256 arquivos · 3145 passed | 6 expected fail (3151) ·
   EXIT=0` (do gate do @qa). Usar o do `main` (`3137 | 6`) daria um delta de `+8` falso, que já é da
   `87-17`.

---

## 9. A dívida de interface que esta story **cria** para a Fatia 2 da `87-17` — `R7`, nova

Achado meu, e é do tipo que se perde entre duas stories que tocam a mesma função.

A Fatia 2 da `87-17` (o *"mais tarde"*) se apoia numa invariante que **eu** ratifiquei: *"o `espalhar`
sempre inclui `xs[xs.length − 1]`, logo a oferta termina no último horário livre do período, logo
'não existe nada mais tarde do que o que te ofereci' é verdade por construção"*.

**Depois desta story, isso deixa de ser verdade em um caso:** se o último candidato do período for
omitido por `"unknown"`, o teto passa a ser o penúltimo horário **verificável**, e a Nicole diria
*"não tem nada mais tarde que 15h"* sobre umas 17h que **só não foram checadas**. É a mesma classe de
falsidade que a Fatia 2 existe para fechar, criada pela Fatia deste conserto.

**Não é trabalho desta story** — a Fatia 2 não começou (`git grep detectWantsLaterSlot` → rc=1, medido
pelo @qa). Fica como `R7` + `Armadilha 11`: **a Fatia 2 tem de consultar `houveIncerteza` antes de
afirmar qualquer teto.**

---

## 10. Checklist de 10 pontos

| # | Item | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | ✅ | Diz o defeito, o mecanismo e a qualidade que importa ("em silêncio") |
| 2 | Descrição completa | ✅ | O §1 é código colado e **o mecanismo está inteiro certo** — conferi o `error` descartado, os dois chamadores, os quatro sítios e as duas mensagens existentes, todos byte a byte. Acrescentei o que a story subestimava: a cadeia não para na oferta, chega ao `.insert()` (`:1563`) e concede `authorizedSlotUtc` |
| 3 | ACs testáveis | ⚠️ | Padrão alto, e a armadilha `AC1`+`AC2`+`AC5` reprova as duas versões erradas óbvias. Mas **a `AC4` deixava passar a opção (b) pela camada da mensagem**, o segundo controle da `AC6` ficou inalcançável com o curto-circuito, a `AC7` tinha `grep` não portável, a `AC9` apontava para o baseline errado, e **não havia AC alguma para o modo de falha de maior consequência da story** (§1). Duas ACs novas, quatro reescritas |
| 4 | Escopo definido | ✅ | Quadro "NÃO faz" com sete linhas, fronteiras limpas com `REL-1`, `87-10`, Fatia 2 e Epic 88, e o @sm **escalou** os dois sítios de `packages/web` em vez de os puxar por reflexo. O corte estava certo; só a evidência que o sustentava precisou de correção |
| 5 | Dependências mapeadas | ⚠️ | Quatro furos: **a base é a branch, não o `main`** (e todo o mapa de código só existe lá); `/api/agendar/[token]` **não** usa `ocupadosDaEquipe`; o portão pré-`INSERT` dos dois `POST` não foi visto; e o estreitamento do `REL-1` foi lido como "decisão intacta" |
| 6 | Estimativa | ✅ | `S/M` coerente. "~15 chamadas" são 14 — corrigido, e a contagem virou trava de base |
| 7 | Valor de negócio | ⚠️ | O defeito é **verificado no código, não medido em produção** — e não pode ser: ele é silencioso por construção, é justamente essa a tese. A story não diz isso com essas palavras, e devia, porque é o que sustenta priorizar prevenção aqui. **É também o argumento que torna a `AC6` (o evento) não-opcional:** ela é o que converte a próxima ocorrência em algo contável. O que mede é a **exposição**, e essa é real: o `#517` a multiplica por ~3,7× (3 → 11 consultas por oferta) |
| 8 | Riscos documentados | ⚠️ | Tabela `R1`-`R6` existia — mas o **`R1` estava mitigado por uma afirmação falsa** (§1), e faltavam a latência do caminho de erro (`R8`, ~37 consultas sequenciais) e a precondição criada para a Fatia 2 da `87-17` (`R7`). `R1` reescrito, dois riscos novos |
| 9 | Definition of Done | ✅ | Existia e é boa (mutação, `tsc`, totais de suíte, `lint`). Acrescentei as duas mutações da `AC10`, o baseline da branch e o fechamento do PR com dois gates |
| 10 | Alinhamento com o epic | ✅ | Subtração de cegueira, zero campo novo, zero leitura/escrita de `ofertas_do_sistema`/`afirmado_pela_nicole`, zero caminho de decisão novo para o modelo. Cabe na regra de corte da Onda 1 sem interpretação, e o evento reusa o cano de `NICOLE_SLOT_MISMATCH` sem cruzar a fronteira `ai`/`web` |

**Placar: 6 ✅ × 1,0 + 4 ⚠️ × 0,5 = 8,0 / 10.** Acima do corte, sem bloqueante. **GO.**

*(Nota de calibração: o placar mede a story **como recebida**. Depois dos meus blocos `[@po 27/08]`
eu a leria em 9,5. O 8,0 fica registrado porque a régua é do draft, não do meu trabalho sobre ele.)*

---

## 11. Encaminhamento

| Para | O quê |
|---|---|
| **@dev (Dex)** | **Uma fatia, um PR: o `#517`.** Commits em cima de `cdf4411e`, na branch `fix/87-17-fatia1-oferta-de-horario-espalhada`. `T0`→`T6` na ordem. 🔴 **Ler antes da primeira linha:** o §6 (o `tsc` **não** te protege), a `AC10` (as duas mutações são obrigatórias para fechar), a `AC2-(ii)` (curto-circuito do primário), a `AC4-(ii)` (`slots.length` é testado **antes** de `houveIncerteza`) e a `DECISÃO 3` (nenhum parâmetro existente muda de posição/nome; `emit` só no fim). **Se você contar um número de chamadas de teste diferente de 14, pare: sua base não é `cdf4411e`.** |
| **@qa (Quinn)** | **Segundo gate no mesmo PR** (o da `87-17` Fatia 1 continua válido para as ACs dele). Três pontos que não são "os testes passam": **(a)** a `AC10` — sem as duas mutações ninguém sabe se a rede do tri-estado existe, e o modo de falha que ela cobre é pior que o defeito consertado; **(b)** a `AC4-(ii)` e a `AC6-(ii)` — são as únicas que distinguem "omitir e seguir" de "abortar por um candidato"; **(c)** a `AC2-(ii)` — contagem de consultas no caminho do erro, medida, não deduzida. Baseline da suíte: **`3145 \| 6` da branch**, não `3137 \| 6` do `main`. Sua `TEST-1` (golden do ramo `:1044`) é parcialmente atendida pela `AC8`, que pede teste dedicado por sítio — mas só no caminho de erro |
| **@devops (Gage)** | O `#517` passa a carregar **duas** stories: renomear título/corpo. **Deploy único, e é ele que satisfaz a decisão do Marcos** ("nenhuma das duas em produção sozinha"). A story segue **fora** da fila `#428 → #429 → #431 → 87-10`. Conflito textual com a Fatia 2 da `87-17` (não iniciada) é resolução de merge, não de ordem |
| **@sm (River)** | **`*draft` da `87-19`** (backlog, P1) — os dois helpers de lista em `packages/web`. Remédio é **falhar FECHADO** (`503`, recusar a gravação), o **oposto** do desta story: não copie o desenho da `87-18` para lá. Evidência pronta na DECISÃO 2 do §3 da `87-18` e na entrada do `docs/backlog.md`. **Ordem: depois deste deploy, ANTES da Fatia 2 da `87-17`** |
| **@pm (Morgan)** | O aviso da minha validação da `87-17` **continua de pé e piorou de contexto**: o `#428` (`87-11`) está liberado desde 18/08 e parado há 9 dias, e com ele a fila inteira da Onda 1. Agora há **duas** stories corretivas de agendamento fantasma (`87-18`, `87-19`) nascidas de leitura de código na revisão de um PR que também está parado. Não é coincidência: **fila parada é o ambiente em que esses defeitos ficam vivos.** A fila precisa de dono ou de uma decisão de desistir dela |
| **Backlog** | **(a)** `87-19`, **P1**, registrada com evidência (§3). **(b)** Atualização do `REL-1`: a opção (a) dele morre com esta story; a (b) fica quase de graça — registrado ao lado do item, sem desfazer o original. **(c)** *(novo, sem prioridade)* o docstring de `checkSlotAvailability` (`:576-578`) diz *"se acabar, manhã do próximo dia útil"* mas o laço de `:614` cobre o **dia inteiro** — comentário errado num laço que agora tem teto de latência declarado. Uma linha, na próxima visita ao arquivo |

---

## 12. Nota de método

**Duas coisas que valem para as próximas validações deste epic.**

A primeira é sobre **acreditar em ferramenta**. A story dizia, com naturalidade, que *"o TypeScript
pega sozinho"* — e essa frase é o tipo de coisa que passa numa revisão porque **soa** verdadeira: um
union type de três strings *parece* incompatível com um `if`. Custou dez linhas de scratchpad e uma
contraprova descobrir que o `tsc` dá EXIT=0 e que o modo de falha real (`"occupied"` truthy) é **pior
do que o defeito que a story conserta**. A régua: *quando uma story delega a segurança a uma
ferramenta, rode a ferramenta.* Uma mitigação não medida é uma mitigação inventada — e, no caminho,
minha própria primeira medição foi um falso verde (`| head; echo $?` mede o `head`), o que é a prova
de que a régua vale para quem a aplica também.

A segunda é sobre **camadas**. Tanto na `87-17` quanto aqui, o defeito que a validação pegou não
estava na decisão — estava na **camada em que a decisão não tinha controle**. Lá, a `AC5` assertava a
lista e deixava passar o rótulo. Aqui, a `AC4` assertava o retorno da função e deixava passar a
mensagem, que é a única coisa que o lead ouve. **Uma AC que para na fronteira do módulo não protege
a frase que sai na conversa.** Vale perguntar, em toda AC de conserto: *entre esta asserção e o
ouvido da pessoa, quantas linhas de código ninguém está olhando?*

— Pax, equilibrando prioridades 🎯
