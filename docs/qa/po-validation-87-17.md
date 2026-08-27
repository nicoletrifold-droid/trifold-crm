# Validação @po — Story 87-17 (*"a oferta de horário para de colar no meio-dia, e 'mais tarde' para de virar eco de uma lista morta"*)

**Validador:** @po (Pax) · **Data:** 2026-08-27 · **Story:** `docs/stories/87-17-oferta-de-horario-espalhada-e-mais-tarde-sem-eco.story.md` (`Draft`, 564 linhas na entrada)
**Base de conferência:** `HEAD` = `main` = `98772465`, árvore limpa · **produção NÃO reapurada** (a evidência da conversa da Ana veio apurada e o @sm colou os números; eu conferi a **aritmética** deles contra o código, não o banco) · **nenhum build, nenhum teste executado nesta rodada** — o parecer é de leitura de código, `grep` e API do GitHub
**Parecer relacionado:** `docs/qa/po-validation-87-10-87-11.md` (é a minha própria ratificação de 10/08 que a decisão de fronteira desta story punha em jogo)

---

## VEREDITO: 🟢 **GO** — `Draft` → **`Ready`**

**Placar do checklist: 7,5 / 10.** Nenhum defeito bloqueante **na evidência**: eu conferi o
diagnóstico dos dois defeitos linha a linha e ele está **inteiro certo**, inclusive a aritmética da
fixture (8 livres → `[12:00, 14:00, 17:00]`, ✅). O que eu achei de errado está todo do lado do
**conserto proposto para o Defeito B** — e é grave o suficiente para justificar a arbitragem inteira:

> ### 🔴 A opção recomendada pelo @sm faria a Nicole chamar de **"mais tarde"** um horário **mais cedo** — e a `AC5` dela ficaria **VERDE**.

Não devolvi a story ao @sm. ACs e escopo são meus por autoridade, a evidência é boa e o mecanismo do
conserto certo cabe em duas seções — **corrigi no corpo da story**, em blocos marcados
**`[@po 27/08]`**, e movi para `Ready`. **Duas fatias, dois PRs, na ordem A → B, fora da fila de
deploy do Epic 87.**

---

## 1. 🎯 A ARBITRAGEM — decisão **(i)**

**Decidido: opção (i).** A `87-17` **não escreve e não lê** `ofertas_do_sistema` nem
`afirmado_pela_nicole`. A `87-10` continua dona dos **sete** sítios, de `afirmado_pela_nicole`, das
proteções de prompt (`AC6`/`AC6-b`) e da migração para `agenda_registro`.

**Racional em uma linha:** *o campo reservado não é necessário — a resposta honesta ao "mais tarde"
sai de um recálculo feito no próprio turno — e o desenho que o usava produzia uma falsidade nova.*

**E (i) NÃO significa "Defeito B bloqueado".** O @sm formulou a opção (i) como *"o Defeito B fica
sem previsão atrás de quatro deploys"*, e nessa forma ela seria inaceitável: o defeito é medido, não
hipotético. **O que eu rejeito é o mecanismo, não o conserto.** A premissa de que *"responder 'mais
tarde' exige saber quais horários já foram oferecidos"* **é falsa depois do Defeito A** — e o
Defeito A está na mesma story. Detalhe abaixo.

### 1.1 🔴 O motivo que decide sozinho: `!jaOfertados` é "ainda não oferecido", não "mais tarde"

O desenho proposto (§2 do Desenho original) era:

```ts
const novos = espalhar(todos.filter((d) => !jaOfertados.has(d.toISOString())), 3)
messageWithContext = sistema(`O cliente quer um horário MAIS TARDE que os já oferecidos. Novos horários LIVRES: ${listSlots(novos)}. …`)
```

`filter(!jaOfertados)` é **diferença de conjuntos**, e ela só coincide com *"depois de"* enquanto a
oferta é um **prefixo** do período — isto é, **só enquanto o Defeito A existir**. O Defeito A é
consertado na **mesma story**, e o `espalhar` do §1 do Desenho **sempre inclui `xs[xs.length − 1]`**
(índice `round((k−1)·(n−1)/(k−1)) = n−1`). Logo a oferta passa a terminar **no último horário livre
do período**, e o que sobra é o **meio**.

Na fixture literal da story:

| | valor |
|---|---|
| livres da tarde de 27/08 (medidos em produção) | `12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 17:00` |
| oferta do turno 1, **depois** do Defeito A (`AC1`) | **`12:00, 14:00, 17:00`** |
| diferença de conjuntos | `12:30, 13:00, 13:30, 14:30, 15:00` |
| `espalhar(diferença, 3)` | **`12:30, 13:30, 15:00`** |
| bloco `[SISTEMA]` que a Nicole receberia | *"O cliente quer um horário **MAIS TARDE** que os já oferecidos. Novos horários LIVRES: **12h30, 13h30, 15h**"* |

**Duas das três são mais cedo do que as 17h que ela acabou de oferecer.** E a `AC5` como estava
escrita — *"contém uma lista de horários que **não inclui nenhum** dos três oferecidos no turno 1"* —
**ficaria verde com essa saída**. Uma story cujo propósito declarado é *"a Nicole para de afirmar o
que o sistema não sabe"* não pode embarcar uma afirmação falsa nova com o teste passando.

*(Isto não é um erro de descuido do @sm: é o custo de os dois defeitos estarem na mesma story. O
Defeito B foi desenhado contra o mundo em que o Defeito A ainda existe. É exatamente a interação que
uma validação tem de pegar.)*

### 1.2 A leitura do campo é `W3-2e` / Onda 3 — por arbitragem **minha**, e a `87-10` a proíbe por escrito

A opção (ii) não apenas escreve o campo: ela **lê** para decidir o que oferecer. E:

- `epic-87:750` — *"**W3-2e** … (1) É **caminho de decisão novo** … a regra de corte da Onda 1 se
  aplica sem interpretação"*;
- `87-10`, cabeçalho, linhas 3-6 — *"A metade de leitura … é o **`W3-2e`, Onda 3**, por arbitragem do
  @po (`po-validation-87-3-87-4.md` §3). **Não restaurar a leitura para cá.**"*;
- `87-10` §3, e a frase é minha: *"se a garantia é 'ninguém lê', então **nada pode ler** — nem para
  escolher o nível de um log"*. **Foi essa frase que cortou a `AC8` da `87-10`.**

Abrir exceção agora, para uma superfície muito maior do que o nível de um log, invalidaria
retroativamente aquele corte. A leitura desta story seria, é verdade, de **classe de risco menor**
que a do `W3-2e` — ela não cria `appointment` nenhum e todo horário oferecido é reconferido por
`isSlotFree`. **Mas não é a gravidade que decide; é a categoria.** Uma garantia categórica com uma
exceção deixa de ser garantia e passa a ser preferência.

### 1.3 A `87-10` **remove** o campo de `AgendaState` — a (ii) escreveria num campo marcado para deleção

Este é o custo que o §4 da story **não** viu. A `AC1` da `87-10` é literalmente:

> **AC1 — `RegistroAgenda` existe e os dois campos SAEM do `AgendaState`.**

Os campos vão para a chave irmã `agenda_registro` — decisão que **eu ratifiquei em 10/08**, porque
`writeAgendaState(cd, null)` apaga o envelope inteiro. Portanto o custo real da opção (ii) **não** é
*"remedir a premissa de zero registros"*, como o §4 dizia:

1. **retrabalho garantido** do escritor, do leitor e dos testes da `87-17` quando a `87-10` subir;
2. e — pior — a `AC1-(ii)` da `87-10` diz, em maiúsculas: *"Se aparecer um terceiro erro, ou um erro
   em outro arquivo, **PARE**: existe um consumidor que ninguém mapeou e a premissa de risco zero
   caiu."* A opção (ii) faria aparecer **exatamente** esse terceiro erro (o escritor e o leitor em
   `pipeline.ts`), e a trava passaria a acusar um consumidor **mapeado**. É o pior estado possível
   para uma trava: continua disparando e já não quer dizer nada.

*(Verificado hoje: `agenda_registro`/`RegistroAgenda` não existem no código; os dois campos seguem
declarados dentro de `AgendaState`, `agenda-state.ts:108-126`, com um único leitor em todo o repo —
o caso de teste `agenda-state.test.ts:44-50`, que existe para afirmar que ninguém escreve neles.)*

### 1.4 A opção (iii) segue rejeitada

Subscrevo o @sm sem ressalva: parsear a prosa da Nicole como insumo de decisão é o defeito de
procedência que a `87-4` fechou para o lado do lead, e `afirmado_pela_nicole` é write-only com
precisão medida de **71,9 % / 81,3 %**. Nada a acrescentar.

### 1.5 O que substitui o campo: **o recálculo**

O turno do "mais tarde" já tem tudo em mão, **hoje, sem campo novo**:

| insumo | de onde vem | conferido |
|---|---|---|
| `day` | `agenda_state.data_absoluta`, herdado | `visit-slot.ts:424` (`inheritedDay`) |
| período | `agenda_state.periodo` — **campo vivo da `87-4`**, escrito pelos sítios `:1042` e `:1120` | `agenda-state.ts:102`, `pipeline.ts:1120`; **`grep` confirma: nenhum leitor até agora** |
| o turno chega ao ramo certo | `hasVisitAvailability = !!agendaState` → `isVisitSchedulingMode` = `true` (`pipeline.ts:109`) | ✅ o turno 2 entra no bloco de agendamento e cai em `day && !time` |

E `freeSlotsInPeriod` é **determinística** sobre (dia, período, `now`, `appointments`): rodá-la de
novo no turno 2 reproduz a oferta do turno 1 sem tê-la guardado — e devolve o **último horário livre
do período**, que é o teto contra o qual "mais tarde" se mede. Entre os dois turnos só `now` avança
(o que apenas **remove** candidatos passados) e a agenda pode mudar (o que a recomputação
**absorve**, em vez de ignorar).

**Consequência bonita:** depois do Defeito A, *"existe algo mais tarde do que o que te ofereci?"* tem
resposta **negativa por construção** — e ela é dita a partir de uma conta feita **agora**, contra o
banco de **agora**. A resposta honesta não precisa de memória; precisa de aritmética fresca. É
subtração de cegueira **sem estado novo**, e cabe na regra de corte da Onda 1 (`epic-87:295`) sem
precisar de interpretação.

**O meio do período fica fora, de propósito.** Oferecer `12:30`/`13:00`/`15:00` sob rótulo honesto
("tem outros, mais cedo, nesse mesmo período") é **melhoria de produto sem incidente medido** → foi
para o "O que esta story NÃO faz". Quem quer `12:30` diz `12:30` e cai no ramo `day && time`, que
confere e agenda — caminho que já funciona e que esta story não toca.

---

## 2. O que a decisão implica para a `87-10` — **nada**, e eu registrei isso lá

O @sm me avisou que a opção (ii) invalidaria a prova de *"zero registros"* da `AC1-(ii)` da `87-10` e
pediu que eu registrasse a ação. **Como eu não ratifiquei a (ii), a ação não existe.** Mas "não
existe" é uma informação que precisa estar escrita, senão alguém a relitiga em três semanas —
**executei o registro**, append-only no Change Log da `87-10` (`v0.3`, 27/08):

| consequência | estado |
|---|---|
| `AC1-(ii)` (o `tsc` com **exatamente 2** erros em `agenda-state.test.ts:48-49`) | **válida ao número, sem remediação** |
| a trava *"se aparecer um terceiro erro, PARE"* | **continua significando o que significava** |
| premissa *"produção tem ZERO registros com os dois campos"* | **não precisa de remedição** |
| garantia categórica *"nada lê o campo, nem para escolher o nível de um log"* (base do corte da `AC8`) | **intacta** |
| a leitura | **integralmente no `W3-2e`, Onda 3**, como o cabeçalho da `87-10` manda |

**Nenhum arquivo da `87-10` mudou além dessa linha de Change Log.** Ela é `Ready` com fila de deploy
homologada; mexer no corpo dela seria churn.

---

## 3. ✅ O Defeito A é independente, risco baixo, sobe sozinho — **confirmado**, com duas precisões

**Autorização de fatiamento concedida e escrita na story:** `T0`-`T3` (Fatia 1) podem ir a produção
sem uma linha da Fatia 2, e **fora da fila `#428 → #429 → #431 → 87-10`** (esta story não toca
`agenda_registro`, nem os campos reservados, nem os três despejos crus). Se a Fatia 2 travar, a
Fatia 1 **fica** — e ela já converte a mentira medida numa oferta que cobre a tarde até as 17h,
tirando o motivo de a pergunta da Ana existir.

Mas "risco baixo" não é "raio de impacto de um sítio", e o @sm subestimou dois pontos:

### 3.1 `freeSlotsInPeriod` tem **dois** chamadores, não um

```
packages/ai/src/chat/pipeline.ts:1044   → dia+período COM visita ativa (remarcação, 75-245)
packages/ai/src/chat/pipeline.ts:1123   → dia+período SEM visita ativa (sítio 7, o caso da Ana)
```

O Defeito A muda o que a Nicole oferece **nos dois**. É desejável e é a mesma correção — mas tem de
estar escrito, porque o teste do sítio `:1044` (`pipeline-agenda-state.test.ts:376`) só asserta
`toContain("Horários LIVRES nesse período")`: ele segue **verde sem provar nada** sobre o conteúdo.
Declarado como `R1` na tabela de riscos que eu acrescentei.

### 3.2 🔴 O custo do Defeito A não é comportamento — é **latência**, e é real

`isSlotFree` (`visit-slot.ts:552-574`) é **uma query ao `appointments` por candidato**:

```ts
const { data } = await q.limit(1).maybeSingle()   // 1 round-trip, por candidato
```

Hoje o laço para nos 3 primeiros → em agenda vazia são **3** idas ao banco. A forma proposta verifica
**todos** os candidatos antes de amostrar → **11** em `tarde`, **7** em `manha`, **sequenciais,
dentro do caminho da resposta ao lead**. O @sm marcou o `Promise.all` como *"decisão do @dev, não é
AC"*. **Eu discordo e transformei o teto em AC — sem ditar a forma** (`AC4`): uma consulta única da
janela do período resolve em **1** round-trip (**melhor que hoje**), e o `Promise.all` resolve em
profundidade sequencial 1. O que não pode passar é a story trocar uma mentira por ~meio segundo de
latência em todo pedido de período — o Epic 88 tem teto medido de p95 em `whatsapp_async_done`
(`D88-3`).

---

## 4. 🔴 O achado que ninguém tinha visto: o Defeito A deixa **três testes existentes vermelhos**, e um é golden byte a byte

A `AC10` original dizia: *"Suíte de reencenação da `87-4`/`87-10` (`pipeline-scheduling.test.ts`,
`pipeline-agenda-state.test.ts`) permanece verde sem alteração de forma não justificada."`
**Isso é falso como escrito.** Conferido no papel, com o seed de cada teste:

| # | teste | hoje | depois do Defeito A |
|---|---|---|---|
| 1 | `visit-slot.test.ts:477` — *"manhã de sábado com 10h ocupado → oferece 8h, 8h30 e 9h"* | `[8:00, 8:30, 9:00]` | livres = `8:00, 8:30, 9:00, 11:00` (4) → **`[8:00, 9:00, 11:00]`** 🔴 |
| 2 | `pipeline-agenda-state.test.ts:598` — golden `AC7` *"dia+período"* | `08:00 ou 08:30 ou 09:00` | **`08:00 ou 09:30 ou 11:00`** 🔴 |
| 3 | `pipeline-agenda-state.test.ts:640` — o mesmo golden pela via `"de manhã"` com pendência | idem | idem 🔴 |
| — | `visit-slot.test.ts:487` (0 livres), `:494` (1 livre), `:500` (3 livres) | — | **verdes** ✅ (`xs.length <= k` não amostra) |

**O item 2 é o que importa.** A docstring dele, `pipeline-agenda-state.test.ts:576-578`:

> *"As três strings abaixo foram **CAPTURADAS do `HEAD`** … **Qualquer diferença aqui é achado
> bloqueante**: significaria que a story mudou o que a Nicole ouve quando o estado estava certo."*

Ou seja: o Defeito A **muda o que a Nicole ouve** num turno-ouro, e isso é legítimo — é o objetivo da
story. Mas um golden recalibrado **em silêncio** apaga a guarda que ele é. A `AC10` reescrita nomina
os três vermelhos, exige o baseline do `HEAD` capturado no `T0` **antes de qualquer edição**, e
obriga **uma linha no próprio arquivo do teste** dizendo que a mudança é desta story e por quê.

---

## 5. Correções menores, todas aplicadas no corpo da story

| # | alegação da story | medido em 27/08 | onde corrigi |
|---|---|---|---|
| 1 | *"`manha`: candidatos `8:00`…`11:00`, **8** no total"* (e *"8 em `manha`"* no §1 do Desenho) | **7** — `lastStart = min(720, 1080) − 60 = 660 = 11:00` | §2 do Context, §1 do Desenho, `AC2` |
| 2 | `AC2` pedia *"inclui pelo menos um horário ≥ 10:00"* | régua frouxa: `[8:00, 8:30, 11:00]` passaria e ainda cola na borda | `AC2` passa a exigir **sequência completa** `[8:00, 9:30, 11:00]` |
| 3 | `espalhar` sem guarda de `k ≤ 1` | `round(i·(n−1)/(k−1))` → **divisão por zero** em `k = 1`, e `limit` é parâmetro público com default | `AC3-(ii)` |
| 4 | a invariante "primeiro e último sempre entram" era implícita | é **ela** que faz a `AC5` ser verdade — não pode ficar inferida das fixtures | `AC3-(iii)`, assertada |
| 5 | *"`lead-memory.ts:106` — `DADOS COLETADOS`"* | é **`79-80`**. *(A `87-10` §4-bis já tinha o número certo: `lead-memory.ts:79`.)* | §3 do Desenho, Mapa de código |
| 6 | *"`87-11` e `87-12` **nem existem como arquivo**"* | **existem, implementados, com QA feito e story versionada — em PR aberto:** `#428` (`87-11`) e `#429` (`87-12 · bloco A`). O `#427` (`87-5 B`) **já está em `main`**, logo o `#428` está liberado desde 18/08 e **continua aberto há 9 dias** | §4-bis (tabela de premissas) |
| 7 | ausência de "O que esta story NÃO faz", de tabela de riscos e de DoD | os irmãos deste epic têm as três | três seções novas |
| 8 | `T5` (aplicar `omitAgendaKeys` nos três despejos crus) | ver §6 abaixo — **cortada** | §3 do Desenho, `AC8` reescrita como controle de escopo |

**Confirmado ✅ (não mexi):** `freeSlotsInPeriod` em `visit-slot.ts:633-655` com o `break` em `:650`;
`PERIOD_BOUNDS` em `:293-296`; `parsePeriodParts` em `:304` devolvendo `null` para "mais tarde" de
propósito; `tarde` = **11** candidatos; a cadeia de `if` em `pipeline.ts:1101-1136` com o ramo
`day && !time` em `:1128-1131`; `TTL_AGENDA_STATE_HORAS = 48` (`agenda-state.ts:60`);
`haiku-enrichment.ts:106`; o `CodeRabbit: Disabled` (não há chave `coderabbit` em
`.aios-core/core-config.yaml`); **e a aritmética da `AC1`** — 8 livres, `k = 3`, índices `0/4/7` →
`[12:00, 14:00, 17:00]`.

---

## 6. Por que eu cortei a `T5` (proteção de prompt) — e por que isso **não** deixa risco novo

O argumento do @sm era **condicional e correto**: *"a partir do momento em que esta story escreve
`ofertas_do_sistema` — uma LISTA de horários que a Nicole pode ler e afirmar — o risco deixa de ser
adiável"*. **A story não escreve o campo. A premissa caiu, e a `T5` cai com ela.**

Os três sítios continuam vazando `agenda_state` inteiro hoje, e eu confirmei que o vazamento é real
(não é teórico):

| # | sítio | o que recebe | filtrado? |
|---|---|---|---|
| 1 | `pipeline.ts:2090` | `state.collected_data` | ❌ — é a `87-11`, **PR `#428`** |
| 2 | `lead-memory.ts:79-80` | `finalData` (`pipeline.ts:1878`, `collectedData: finalData`) | ❌ — `AC6-b-(i)` da `87-10` |
| 3 | `haiku-enrichment.ts:106` | `currentCollectedData: currentData`, direto do banco (`enrich-leads/route.ts:127`) | ❌ — `AC6-b-(ii)` da `87-10` |

**Mas isso já é verdade no `HEAD`, e esta story não piora em um byte.** E a `T5` tinha um custo que
ela não media: **`omitAgendaKeys` não é bisturi** — ela remove **cinco** chaves (as quatro de
`LEGACY_AGENDA_KEYS` **e** `agenda_state`). Aplicá-la no sítio 2 muda a entrada do Haiku que escreve
`ai_summary`, e `ai_summary` volta ao prompt da Nicole em **59,3 % dos turnos** (medição do gate da
`87-15`/`87-16`).

É literalmente a lição que a `87-16` me ensinou **contra mim**: eu propus *"colapsar no ramo do
`catch`"* e teria embarcado +29 caracteres de prompt em 59,3 % dos turnos dentro de uma story
declarada como *"subtração pura"*. **Não vou fazer a mesma coisa na direção oposta, dentro de uma
story de oferta de horário.** Se a `AC6-b` for antecipada algum dia, ela vem com o denominador
medido — quantas conversas vivas ainda carregam as chaves legadas — e não como efeito colateral.

`AC8` virou o controle negativo disso: **os três sítios saem desta story com diff ZERO.**

---

## 7. Checklist de 10 pontos

| # | Item | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | ✅ | Diz os dois defeitos e o efeito de cada um |
| 2 | Descrição completa | ✅ | A §1 é evidência de produção colada, com o `appointment` final e a distinção OFERTA × INSERT. **Conferi o mecanismo dos dois defeitos linha a linha e ele está inteiro certo** — inclusive `isVisitSchedulingMode` deixando o turno 2 entrar no bloco de agendamento |
| 3 | ACs testáveis | ⚠️ | Padrão alto (vermelho colado em quase todas), mas **a `AC5` ficaria verde com uma resposta falsa**, a `AC10` afirmava o contrário do que a suíte vai fazer, a `AC2` tinha régua frouxa e contagem errada, e faltava teto de latência. Cinco ACs reescritas, uma nova, duas apertadas |
| 4 | Escopo definido | ⚠️ | As Armadilhas 1/2 são boas, mas **não havia seção "O que esta story NÃO faz"** (os irmãos têm) e a `T5` puxava para dentro dois sítios de outra story. Seção criada, `T5` cortada |
| 5 | Dependências mapeadas | ⚠️ | O @sm fez a coisa certa ao **escalar** a decisão em vez de tomá-la — mas os dois fatos que a decidem não estavam no §4: a `87-10` **remove** o campo de `AgendaState`, e a **leitura** dele é `W3-2e` por arbitragem anterior. Mais a premissa *"87-11/87-12 não existem"*, que é falsa (PRs `#428`/`#429`). Corrigido na §4-bis |
| 6 | Estimativa | ✅ | `S` + `S/M` coerente com o que sobrou depois do corte da `T5` |
| 7 | Valor de negócio | ✅ | A frase falsa está colada do banco, com os 8 horários livres do dia ao lado. Não é inferência |
| 8 | Riscos documentados | ⚠️ | Havia só a linha `Risco:` do cabeçalho. **Faltavam quatro riscos reais** (dois chamadores, latência 3→11, `k ≤ 1`, golden byte-a-byte). Tabela `R1`-`R8` criada |
| 9 | Definition of Done | ⚠️ | Não existia; `AC11` cobria só a janela de observação. DoD por fatia criada |
| 10 | Alinhamento com o epic | ⚠️ | Como estava, a opção recomendada **restaurava para a Onda 1 uma leitura que o epic mandou para a Onda 3** (`epic-87:750`) e furava a garantia categórica em que a `87-10` se apoia. **Depois da arbitragem, alinhado**: recálculo determinístico, zero caminho de decisão novo para o modelo |

**Placar: 4 ✅ · 6 ⚠️ ⇒ 7,5 / 10.** Acima do corte, sem bloqueante. **GO.**

*(Nota de calibração: o placar mede a story **como recebida**. Depois dos meus blocos `[@po 27/08]`
eu a leria em 9. O 7,5 fica registrado porque a régua é do draft, não do meu trabalho sobre ele.)*

---

## 8. Encaminhamento

| Para | O quê |
|---|---|
| **@dev (Dex)** | **Duas fatias, dois PRs, A → B.** **Fatia 1** (`T0`-`T3`): `espalhar` + guarda de `k ≤ 1` + teto de round-trips da `AC4` + os **três** testes existentes recalibrados, com a linha justificando o golden `pipeline-agenda-state.test.ts:598`. **Fatia 2** (`T4`-`T8`, só depois da Fatia 1 em produção): `detectWantsLaterSlot`, interceptação no ramo `day && !time` com **recálculo neste turno**, guarda de mesmo-dia e preservação do `periodo`. 🔴 **Ler as Armadilhas 4, 6 e 7 antes de escrever a primeira linha da Fatia 2:** nada de `ofertas_do_sistema`, nada de horário anterior rotulado como "mais tarde", nada de resposta derivada de memória |
| **@qa (Quinn)** | O gate desta story tem **dois** pontos que não são "os testes passam": (a) a `AC4` (teto de round-trips) — sem ela a story é uma regressão de latência disfarçada; (b) a `AC5-(iii)` — é a única que distingue o conserto certo do conserto que passa. E conferir que o golden `:598` foi recalibrado **com** justificativa no arquivo |
| **@devops (Gage)** | Esta story **não entra na fila** `#428 → #429 → #431 → 87-10`. Conflito **textual** em `pipeline.ts` com `#428`/`#431` é possível (regiões `:1044`/`:1123` × `:2090`/imports) e é resolução de merge, não de ordem |
| **@pm (Morgan)** | 🔴 **O problema de governança que esta story expôs e que não é dela:** o `#428` (`87-11`) está **liberado para merge desde 18/08 e parado há 9 dias**, e com ele a fila inteira da Onda 1 (`#429`, `#431`, e a `87-10`, que nem começou). Foi essa fila parada o argumento mais forte a favor de furar a fronteira da `87-10` — e desta vez deu para resolver sem furar. **Da próxima não vai dar.** A fila precisa de dono ou de uma decisão de desistir dela |
| **Backlog** | **(a)** Oferecer o **meio** do período sob rótulo honesto (*"tem outros, mais cedo, nesse mesmo período"*) — melhoria de produto, sem incidente medido. **(b)** Variações de "mais tarde" (*"mais pra frente"*, *"depois desses"*, *"mais cedo"*) — abrir só com incidente medido. **(c)** `agenda_state.periodo` estava **escrito por dois sítios e lido por ninguém** desde a `87-4`; esta story lhe dá o primeiro leitor. Vale um item de higiene: campo de estado sem leitor é candidato natural a apagar ou a documentar como reservado — hoje não há como distinguir os dois casos por leitura de código |

---

## 9. Nota de método

**A régua que pegou este defeito não foi "o teste está bem escrito?" — foi "o que este teste deixa
passar?".** A `AC5` do draft era rigorosa em forma: fixture literal de produção, dois turnos, estado
persistido entre eles, vermelho contra o `HEAD` colado. E ainda assim autorizava a Nicole a chamar
`12h30` de "mais tarde" do que `17h`. O que a denunciou foi **rodar a fixture da própria story no
papel, com o Defeito A já aplicado** — o mundo em que o conserto do Defeito B ia viver, e não o
mundo em que ele foi desenhado.

**A segunda coisa é sobre fronteiras.** Eu cheguei nesta validação achando que ia escolher entre
"bloquear o defeito medido" e "furar a fronteira de outra story". As duas opções eram ruins, e o @sm
escalou honestamente as duas. **A saída não estava na lista porque a lista herdava uma premissa
falsa** — a de que "responder 'mais tarde' exige memória da oferta". Quando um dilema de fronteira
parece exigir escolher qual princípio quebrar, vale um turno a mais perguntando **de qual premissa o
dilema depende**. Aqui a premissa custava um campo novo, um retrabalho garantido e uma trava
calibrada. Ela custava tudo isso para comprar uma exatidão que **uma função determinística já dá de
graça**.

— Pax, equilibrando prioridades 🎯
