# Story 87-8 — O histórico passa a ser a cauda da conversa

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
**Item do roadmap:** **`W1-1`** (Onda 1, **deploy 3**) — o `CR-1`, e o **último** dos três deploys
originais. Destrava a **`87-5`** (`W1-7`, já `Ready`), que é o deploy 4
**Criada por:** @sm (River) em 2026-08-08
**Formato:** Correção de substrato de **leitura**. **Devolve o presente da conversa; não ensina nada
novo.** Uma linha de código e uma semana de argumento.
**Executor:** @dev · validação em produção: @qa + responsável nomeado (D7)
**Esforço:** **XS** (código) / **M** (teste + observação) — a proporção é a tese da story
**Risco:** **Médio de regressão** (**R-A** do epic: muda o que ela vê nas conversas de maior valor) ·
**Baixo de comportamento novo** (nenhum caminho de decisão é criado; o **referente** de dois gates muda)

> ### O defeito, em uma linha, vivo desde o commit inicial da Nicole
>
> ```ts
> // packages/ai/src/chat/pipeline.ts:1620-1637 — loadConversationHistory
> .order("created_at", { ascending: true })      // ← as 20 PRIMEIRAS
> .limit(limit)                                   //   (limit = 20)
> ```
>
> Em conversa longa a Nicole enxerga **o começo do relacionamento** e é **cega para o presente**.
> Introduzido em `7194d9b2` (31/03/2026): **nunca funcionou**.
>
> *A Sandra disse "só posso até 400 mil" em 27/07; a Nicole devolveu isso em 05/08 porque, para ela,
> 27/07 **é** o presente.*

---

## Story

**Como** engenharia da Trifold, que descobriu que a Nicole responde ao passado da conversa em todo
lead que reengaja,
**Queremos** que o histórico carregado seja a **cauda** — as 20 mensagens mais recentes, em ordem
cronológica —, **nas duas esteiras que leem histórico**,
**Para que** ela pare de responder com precisão a um contexto vencido, e para que a `87-5` (a fala
do corretor) possa entrar numa janela que faça sentido com três interlocutores.

---

## Context

### 1. O dano, medido — e é maior do que "5,9% das conversas"

**Medições minhas contra produção (`dsopqkqjkmhytudaaolv`, Management API, somente SELECT, 08/08).
Unidade e denominador declarados em cada linha — é a regra que este epic passou a seguir depois de
errar nela duas vezes.**

```
POPULAÇÃO (30 dias)                                                    unidade: conversa
  conversas com mensagem                                          335
  … com mais de 20 mensagens (qualquer papel)                      31   (9,3%)
  … com a Nicole ativa (≥1 msg role='assistant')                  136
  🔴 … dessas, com mais de 20 mensagens user+assistant             17   (12,5%)   ← O DENOMINADOR DESTA STORY

DANO (30 dias)                                                          unidade: resposta
  🔴 respostas da Nicole geradas com a janela JÁ CHEIA              47   em 19 conversas
  maior conversa (user+assistant)                                   40   mensagens

DANO (90 dias)
  respostas da Nicole com a janela já cheia                         90   em 34 conversas
  maior conversa                                                    45   mensagens
```

> ### ✅🔴 REMEDIÇÃO DO @po (08/08) — **os números batem; UM denominador escorregou**
>
> Rodei todas as consultas de novo contra produção. **Batem, uma a uma:** 335 conversas · 31 com
> >20 mensagens de qualquer papel (9,3%) · 136 com Nicole ativa · **17 = 12,5%** no denominador da
> story · **47** respostas com janela cheia em 30 d · **90** em 90 d · maior conversa **40** (30 d) e
> **45** (90 d). É a medição mais limpa que este epic produziu até agora.
>
> **A exceção, e ela é do tipo que este epic já errou duas vezes:**
>
> | | story diz | @po mede | o que o número da story realmente é |
> |---|---|---|---|
> | 30 d | 47 respostas em **19** conversas | 47 respostas em **15** conversas | 19 = conversas com >20 msgs `user+assistant` (a **população**) |
> | 90 d | 90 respostas em **34** conversas | 90 respostas em **28** conversas | 34 = idem, em 90 d |
>
> **A contagem de RESPOSTAS está certa** (é a unidade que a story declarou e é a que importa). O que
> escorregou foi a contagem de **conversas afetadas**: a story publicou a população no lugar do
> subconjunto atingido. **Não muda decisão nenhuma** — muda o que fica escrito, e este epic já
> aprendeu que é aí que o erro seguinte nasce. **Corrigido na T0.**
>
> **Método meu, para reprodução:** `row_number() over (partition by conversation_id order by
> created_at, id)` sobre `role in ('user','assistant')`; conta-se `role='assistant' and rn > 20`, e
> as conversas afetadas são `count(distinct conversation_id)` **desse filtro** — não da população.

> **O denominador desta story, declarado:** *conversas com pelo menos uma mensagem
> `role='assistant'` e mais de 20 mensagens `role in ('user','assistant')` nos últimos 30 dias.*
> A razão é mecânica: **`loadConversationHistory` só conta esses dois papéis hoje** — em conversa
> sem Nicole ativa o `limit(20)` não é lido por ninguém.
>
> **Método do "dano":** `row_number()` por conversa sobre `user+assistant` ordenado por
> `created_at`; toda mensagem `assistant` em posição **> 20** é uma resposta gerada com a janela já
> saturada — ou seja, **montada sem as mensagens mais recentes**. Numa conversa de 40, ela respondeu
> sem ver **as últimas 20**.
>
> **47 respostas em 30 dias.** Para comparação, o `W1-7` (Story 87-5) foi aprovado com **31**
> respostas cegas medidas. A mesma ordem de grandeza, e os mesmos leads: os que reengajam.

### 2. 🔴 São DUAS esteiras com o MESMO defeito — e a segunda não está no epic

```ts
// packages/web/src/app/api/cron/enrich-leads/route.ts:62-69
// AC3: Load last 20 messages          ← o comentário diz "last"
  .order("created_at", { ascending: true })   // ← o código pega as PRIMEIRAS
  .limit(20)
```

**O cron `enrich-leads` tem a linha idêntica**, com um comentário que afirma o contrário do que o
código faz. Ele roda a cada 30 min, chama o Haiku sobre essas 20 mensagens e escreve
`ai_summary`, `collected_data`, `qualification_score`, `interest_level` e campos de perfil em
`leads`.

> **Consequência que o `CR-1` do epic não descreve:** em conversa longa, **o que o sistema acredita
> sobre o lead** também é extraído do começo da conversa. Não é só a Nicole que responde ao passado
> — **o CRM inteiro acredita no passado.**
>
> **É o terceiro item seguido desta onda em que o `enrich-leads` é a esteira esquecida:** a `87-4`
> descobriu que ele era o **último escritor de 70%** dos estados residuais e precisou da `AC8-b`; a
> `87-7` mediu que ele toca **92,5%** da população de resumos. **Ignorá-lo aqui repetiria o mesmo
> erro pela terceira vez, com o mesmo formato.**
>
> 📌 **@pm:** o `CR-1` do epic cita apenas `pipeline.ts`. Precisa citar as duas esteiras.

### 3. Por que este é o deploy 3, e não o 1 — a ordem que o @architect assinou

A ordem original (`W1-1` primeiro) foi **REPROVADA** e está revogada (epic §7/Onda 1). Três razões,
todas dele:

1. A conversa da Sandra tinha **14 mensagens** no momento do incidente — o `limit(20)` **não cortou
   nada**. O `CR-1` não participou dos incidentes relatados.
2. 🔴 **Corrigir o histórico muda o referente de `lastAssistantMsg`, que alimenta
   `isVisitSchedulingMode` e `nameExpected` — e ver a cauda deixa o modo agendamento MAIS propenso a
   ligar**, não menos.
3. Subir isso antes do `W1-2b` **pioraria o sintoma da Sandra durante a própria janela de
   observação**.

**Hoje as duas dependências estão fechadas:** `W1-2b` (87-4) com gate **PASS** e PR em draft, e
`W1-3b` (87-7) é o deploy 2. Esta story é a 3ª da fila e **destrava a `87-5`**, que já está `Ready`.

### 4. A condição de escape da `87-5` continua não disparando — remedida hoje

| população (30 d) | convs | > 20 msgs | % | @po (07/08) | @sm (08/08) |
|---|---|---|---|---|---|
| **Nicole E corretor** — a população que a `87-5` muda | 86 | 18 | **20,9%** | 20,0% (85/17) | 20,9% (86/18) |

**As duas medições concordam, e o limiar de escape é 10%.** O escape **não** dispara: a ordem
`W1-7` **depois** do `W1-1` está confirmada por número, de novo. *(A diferença de uma conversa é a
janela deslizando um dia — registrado com o método, como manda a casa.)*

> ### ⚖️ Terceira leitura do @po (08/08) — **o "18" depende de qual papel se conta, e a story não disse**
>
> População medida por mim: **86** conversas com Nicole **e** corretor em 30 d. ✅ bate.
> O `18`, porém, sai de `count(*) > 20` sobre **TODOS os papéis**. Sobre `user+assistant` — que é o
> que `loadConversationHistory` realmente lê hoje, e é o denominador declarado no **§1 desta mesma
> story** — o número é **11**.
>
> | leitura | conta | % de 86 | escape (limiar 10%) |
> |---|---|---|---|
> | qualquer papel (`user+assistant+broker`) | 18 | **20,9%** | não dispara |
> | `user+assistant` (a régua do §1) | 11 | **12,8%** | não dispara |
>
> **A conclusão é robusta: o escape não dispara nas duas leituras, e a ordem `W1-1` → `W1-7` está
> confirmada.** Mas 20,9% e 12,8% são o **mesmo dado com duas réguas**, e a story usa uma régua no
> §1 e outra no §4 sem dizer que trocou. Em 30 dias há **901** mensagens `broker` contra **619**
> `assistant` — o papel do corretor é a maior parte do tráfego, então a escolha de régua **não é
> detalhe**. **Declarar as duas na T0-(c), com a régua nomeada em cada uma.**

---

## Desenho

### 1. A correção — e ela é mesmo uma linha

```ts
// loadConversationHistory (pipeline.ts:1620) e cron/enrich-leads (route.ts:62)
  .order("created_at", { ascending: false })
  .order("id", { ascending: false })     // desempate determinístico (ver Armadilha 1)
  .limit(limit)
// …e, antes de devolver:
  return (data as Message[]).reverse()   // a saída continua CRONOLÓGICA
```

**A saída da função não muda de formato nem de ordem.** Todos os consumidores continuam recebendo
um array cronológico crescente; o que muda é **qual pedaço da conversa** ele contém.

### 2. Os cinco consumidores de `history` — o que acontece com cada um

Levantados no código de `HEAD` (`grep -n "history" packages/ai/src/chat/pipeline.ts`):

| # | consumidor | linha | com a cauda | decisão |
|---|---|---|---|---|
| 1 | **`buildNoReintroContext`** | 627 → 207-214 (`history.some(role==='assistant')`) | **pode passar a NÃO encontrar** fala da Nicole, se a cauda for só do lead → ela **se reapresentaria** | 🔴 **Tratado, na direção restritiva** — ver §3. **AC4** |
| 2 | **`lastAssistantMsg`** | 756-758 | passa a ser a **última fala real** dela. Alimenta `isVisitSchedulingMode` (912) e `nameExpected` (1157) | **Muda de referente, de propósito.** É a AC exigida pelo @architect. **AC2, AC3** |
| 3 | **payload da Anthropic** | 999-1006 | 20 turnos recentes em vez de 20 antigos | é a entrega. **AC1** |
| 4 | **`generateHandoffSummary`** | 1209-1215 | o corretor recebe o resumo do **presente** da conversa | melhora. **Não-regressão de formato: AC6** |
| 5 | **identificação de imóvel por contexto** | 1240-1247 (`[message, ...history.map(content)].join`) | o contexto de imóvel passa a vir do trecho recente | **muda o que o sistema acredita** → **AC5**, com teste, e listado no Risco 4 |

*(O 6º leitor — o cron `enrich-leads` — é o **deploy B**, §4.)*

### 3. O consumidor 1 é o único que precisa de código a mais, e a razão é boa

**O buraco:** conversa longa em que a cauda-20 é toda do lead. `history.some(role==='assistant')`
dá `false`, e a Nicole **volta a se apresentar** — regressão direta da Story **59-1**.

**Medido por mim em 08/08 (todo o histórico, sem recorte de data):**

```
conversas com > 20 mensagens user+assistant                          34
… cujas ÚLTIMAS 20 não têm nenhuma mensagem da Nicole,
   mas cuja conversa tem                                              0    ← hoje: nenhum caso
```

**Zero hoje. Estrutural amanhã.** A correção é barata e vem de graça junto com a **AC7**:

```
quando o carregador truncou (rows.length === limit):
    uma consulta `count(head:true)` de `role='assistant'` na conversa
      → alimenta `buildNoReintroContext`   (a Nicole JÁ falou, mesmo fora da janela)
      → alimenta o evento NICOLE_HISTORY_TRUNCATED com o `total`
```

- **Direção restritiva, sempre:** o sinal só pode **suprimir** uma reapresentação, nunca provocar
  uma. *(Suprimir apresentação indevida não causa dano; produzir uma causa constrangimento — é a
  mesma decisão que a `87-5` registrou na AC4 dela.)*
- **Custo:** uma consulta `count` **apenas** nas conversas truncadas — **12,5%** da população com
  Nicole ativa. Nas outras 87,5% não há consulta nenhuma a mais.
- **Uma consulta, duas ACs.** Sem ela, a `M3` do epic não tem como publicar o total.

### 4. Dois deploys, uma story — o mesmo padrão que o @po já validou na `87-5`

| | deploy | o quê | por que separado |
|---|---|---|---|
| **A** | 1º (**deploy 3 da Onda 1**) | `loadConversationHistory` + consumidores 1-5 — **a leitura da Nicole** | é o dano medido: 47 respostas |
| **B** | 2º, **≥24 h depois** | `enrich-leads` passa a ler a cauda — **o consumidor 6** | muda o que o sistema **acredita** e **escreve** em `leads`/`collected_data`. Merece observação sozinho |

> **Por que B fica NESTA story:** é a **mesma variável** (a janela) na outra esteira — a mesma linha,
> o mesmo defeito, o mesmo teste. Numa story separada viraria *"trocar `true` por `false` no cron"*.
>
> ⚠️ **Ordem com a `87-5`:** a `87-5` também tem um deploy B que toca **a mesma linha** do
> `enrich-leads` (o papel `broker`). **Um deploy por variável:** primeiro a **janela** (aqui),
> depois o **papel** (lá). A `87-5` inteira vem depois desta story em produção.

---

## Acceptance Criteria

> Toda AC diz **como se verifica**, e todo teste de regressão exige o **vermelho colado**, com a
> contagem de vermelhos **conferida**. *(Nota de processo `D5` do gate da 87-4: três contagens
> declaradas não sobreviveram à remedição na mesma story.)*

**AC1 — 🔴 O histórico é a cauda, em ordem cronológica.**
Semeando **25** mensagens numeradas (`m1`…`m25`) com `createFakeSupabase`, o array enviado ao
`fakeAnthropic` contém `m6`…`m25`, **nessa ordem**.
**Vermelho contra o `HEAD`:** hoje contém `m1`…`m20`. **Colar os dois** — o esperado e o obtido.
*Complemento obrigatório:* asserção de que o **primeiro** elemento é `m6` e o **último** é `m25`
(um teste que só conta 20 elementos passa verde nos dois mundos).

**AC2 — 🔴 `lastAssistantMsg` muda de referente, e o gate de agendamento é medido nas duas direções.**
*(Exigência explícita do @architect.)*
*Verifica-se, com uma conversa de 25 mensagens em que a fala da Nicole sobre visita está na
**posição 3** e a cauda-20 tem outra fala dela, neutra:*
- (i) `lastAssistantMsg` passa a ser a **neutra** (era a de visita);
- (ii) e o **caso simétrico**, que é o que o @architect mediu: fala de visita **na posição 24** →
  hoje `isVisitSchedulingMode` **não liga** por ela (está fora da janela) e depois **liga**.
  **As duas fixtures no mesmo teste** — só o par discrimina.
- (iii) **vermelho:** contra o `HEAD`, (ii) falha.
> **Esta AC não "conserta" a mudança — ela a torna VISÍVEL e testada.** Ligar mais o modo
> agendamento é **consequência aceita** desta story: o modo existe para que ela responda com a
> agenda real na mão. Acrescentar condição nova ao gate seria **caminho de decisão novo** e está
> **proibido pela regra de corte da Onda 1**. O que se faz é **medir** (AC9-ii).

**AC3 — `nameExpected` acompanha o mesmo referente, sem surpresa.**
*Verifica-se:* conversa longa em que a pergunta de nome está no **começo** → hoje uma resposta curta
em minúsculas é aceita como nome; depois, **não** (a pergunta saiu da janela). E o inverso: pergunta
de nome **na cauda** → passa a ser aceita.
> A direção é a **certa**: hoje ela aceita "maicon" como nome porque perguntou o nome **há 20
> mensagens**. Isso é falso positivo, não recurso.

**AC4 — 🔴 A Nicole NÃO se reapresenta por causa da janela.**
*Verifica-se:* (i) conversa de 30 mensagens cuja **cauda-20 é toda do lead** e cuja fala da Nicole
está na posição 2 → o bloco de não-reapresentação **continua sendo emitido**;
(ii) **vermelho:** usando só `history.some(role==='assistant')`, o teste falha;
(iii) **não-regressão**: conversa curta (< 20) produz a **mesma string, byte a byte**, e **nenhuma
consulta a mais** (asserção sobre `fakeSupabase.calls`).

**AC5 — A identificação de imóvel por contexto muda de insumo, e isso está testado.**
*Verifica-se:* conversa cujo **começo** menciona um empreendimento e cuja **cauda** menciona outro,
com `leads.property_interest_id` **vazio** → o valor gravado passa a ser o da **cauda**.
> **Não é caminho de decisão novo:** `resolvePropertyInterestWrite` não muda uma linha — só preenche
> quando está vazio e só troca com afirmação explícita do lead (75-158). **O que muda é o insumo**, e
> o recente é o certo. **Mas muda uma crença gravada, então é AC e é Risco 4.**

**AC6 — `generateHandoffSummary` não regride de formato.**
*Verifica-se:* conversa curta → resumo **byte a byte** igual ao do `HEAD`. Conversa longa → muda o
conteúdo (é o objetivo) e o `TOTAL DE MENSAGENS` continua coerente com o array recebido.

**AC7 — `NICOLE_HISTORY_TRUNCATED`, e ele reporta a CAUDA (é a `M3` do epic).**
Emitido via `onEvent` **quando** `rows.length === limit`, com
`{ conversation_id, lead_id, limite, total_na_conversa, mais_antiga_carregada, mais_recente_carregada, ordem: "cauda" }`.
- **Sem conteúdo de mensagem. Sem PII.** Só identificadores e timestamps (regra do `W0-2`).
- *Verifica-se:* (i) conversa de 25 → evento com `total_na_conversa: 25` e `mais_recente_carregada`
  = o `created_at` de `m25`; (ii) conversa de 15 → **nenhum** evento; (iii) **vermelho:** com o
  código do `HEAD`, `mais_recente_carregada` seria o de `m20`.
> É o que faz a **`M3`** (*"0 ocorrências de cauda errada"*) deixar de ser uma promessa e virar uma
> consulta.

**AC8 — 🔴 Deploy B: o `enrich-leads` lê a cauda, e o comentário mentiroso morre.**
*Verifica-se:* (i) teste do handler do cron com 25 mensagens → o texto entregue ao Haiku contém
`m6`…`m25`; (ii) **vermelho** contra o `HEAD`; (iii) o `grep` de não-regressão — **corrigido pelo
@po**; (iv) o comentário `// AC3: Load last 20 messages` passa a ser verdade.

> 🔴 **[@po] O `grep` da AC8-(iii), como estava escrito, NÃO PODE dar 0 e faria a AC falhar por
> engano.** Rodei no `HEAD`: `ascending: true` aparece **3 vezes** nesses dois alvos, e uma delas é
> **legítima e não é histórico** — `pipeline.ts:787`, o `activeAppointment` ordenado por
> `scheduled_at`. Um `grep` que precisa de interpretação humana para ser lido como verde é um
> `grep` que vai ser declarado verde sem ser lido. **Régua substituída, e ela é literal:**
> ```bash
> grep -rn 'ascending: true' packages/web/src/app/api/cron/enrich-leads packages/ai/src/chat/pipeline.ts \
>   | grep 'created_at'
> ```
> **Esperado: 0 ocorrências.** Baseline no `HEAD` (medido pelo @po em 08/08): **2** —
> `enrich-leads/route.ts:68` e `pipeline.ts:1630`. **São exatamente as duas linhas desta story: o
> vermelho e a lista de tarefas são o mesmo comando.**

> **Este AC sobe ≥24 h depois do deploy A** e sozinho — ele muda o que o CRM **acredita**.

> ### 🔴 [@po] O deploy B mexe no insumo do guarda que a 87-7 acabou de instalar
>
> Nenhuma das duas stories nomeia isto: depois do deploy B, o `enrich-leads` gera o `ai_summary` a
> partir de **outro texto** (a cauda, não a cabeça). O guarda da **87-7** roda sobre esse resumo.
> Ou seja, **o deploy B pode reabrir o defeito do resumo por um ângulo novo** — cauda recente tem
> mais probabilidade de conter fala de agendamento da Nicole do que o começo da conversa.
>
> **Consequência, e é uma AC:** a janela de 24 h do **deploy B** repete a **régua da `AC10-(ii)` da
> 87-7** (a literal, com baseline), não só a amostra de 5 leads. Se `NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO`
> **subir** depois do deploy B, isso **não** é gatilho de rollback por si (o guarda está fazendo o
> trabalho dele) — mas resumo novo com `appts = 0` **é**.
>
> **A ordem A → B continua certa.** O que muda é o que se olha em B.

**AC9 — Produção: 24 h por deploy, com responsável nomeado (D7).**
- (i) **`NICOLE_HISTORY_TRUNCATED`** presente e sempre com `ordem: "cauda"`; `mais_recente_carregada`
  a menos de um turno da última mensagem da conversa — **é a M3**;
- (ii) 🔴 **contagem de `appointments` criados por `created_by='nicole'`** e de blocos `[SISTEMA]` de
  agendamento **antes × depois**: o @architect previu **aumento**. Aumento **não** é gatilho de
  rollback por si só; **aumento com `M1` subindo é** (visita afirmada sem lastro) — a régua é o cron
  da **87-3**, com `?dry=1`;
- (iii) **amostragem manual de 10 conversas longas**, antes/depois (exigência do **R-A** do epic);
- (iv) `M1` e `M4` sem aumento;
- (v) deploy B: amostra de **5 leads** longos com os campos escritos pelo cron conferidos um a um —
  perfil, `qualification_score`, `interest_level`.
> ⚠️ **Nenhuma AC depende de alerta do Telegram** — está morto em produção (`telegram.ts:5`, token
> ausente nos dois projetos). A prova é `select` em `system_events`. Ver a caixa da Story **87-6**.

**AC10 — As conversas curtas não sentem nada.**
*Verifica-se:* **turnos-ouro** — 3 conversas de menos de 20 mensagens, capturadas do `HEAD` (worktree
próprio, mesmo `now`, mesmo harness) e comparadas **byte a byte** na branch: bloco `[SISTEMA]`,
resposta e efeitos em `appointments`/`collected_data`.
> **87,5% da população está aqui.** É a AC que impede a story de trocar um defeito raro por um
> defeito geral. *(O @qa fez exatamente isso na 87-4, G1–G7, e achou o que o relato não dizia.)*

**AC11 — Suíte, tipos e lint.**
`npx vitest run` **da raiz** (⚠️ **nunca** `--reporter=basic` — removido no vitest 4, falha com exit
0), contagem antes/depois colada (referência do gate da 87-4: `1864 passed | 7 expected fail`).
`npx tsc --noEmit` em `packages/ai` (**é o `lint` dele — não tem eslint**) e em `packages/web`
(erros de `sharp`/`satori`/`pdf-lib` são pré-existentes: declarar, não consertar).

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/chat/pipeline.ts` | 1620-1637 | `loadConversationHistory` — **a linha** |
| ” | 505 | a única chamada dela |
| ” | 627 | `buildNoReintroContext(history)` — consumidor 1 |
| ” | 756-758 | `lastAssistantMsg` — consumidor 2 |
| ” | 912-917 | `isVisitSchedulingMode({ …, lastAssistantMessage })` |
| ” | 1157-1162 | `nameExpected` |
| ” | 999-1006 | payload da Anthropic — consumidor 3 |
| ” | 1209-1215 | `generateHandoffSummary` — consumidor 4 |
| ” | 1240-1247 | identificação de imóvel por contexto — consumidor 5 |
| ” | 90-101 | `isVisitSchedulingMode` — **não tocar** (regra de corte) |
| `packages/web/src/app/api/cron/enrich-leads/route.ts` | 62-69 | a **segunda** esteira — deploy B |

### Armadilhas

1. **Empate de `created_at`.** Duas mensagens no mesmo milissegundo com `limit(20)` na ponta podem
   entrar/sair de forma não determinística e produzir teste intermitente. **Segundo `.order("id")`**
   como desempate — determinístico, mesmo que a ordem por UUID seja arbitrária.
2. **`.reverse()` muta o array.** `data` vem do driver; reverter no lugar é aceitável aqui, mas
   **devolver a cópia** deixa o teste honesto.
3. **`fakeSupabase` ordena por `String(...).localeCompare`** (`fake-supabase.ts:169-175`) — usar
   `created_at` em **ISO** nas fixtures (ordenação lexicográfica = cronológica). Com `Date` ou
   epoch numérico o teste ordena errado **e passa verde**.
4. **Não tocar em `isVisitSchedulingMode` nem em `NICOLE_TALKED_VISIT_RE`.** Ligar mais é
   consequência aceita (AC2); mexer no gate é caminho de decisão novo e derruba a story da Onda 1.
5. **A consulta de `count` da AC4/AC7 só roda quando truncou.** Um `count` por turno em 100% das
   conversas é regressão de latência no caminho quente.
6. **`packages/ai` não tem eslint** — o `lint` dele é `tsc --noEmit`.
7. **Rodar vitest da raiz. Nunca `--reporter=basic`.**

### Fronteiras com outras stories

| Item | Dono | Por que não é aqui |
|---|---|---|
| Fala do corretor (`role='broker'`) entrar no histórico | **`W1-7` / Story 87-5** (`Ready`) | **Outro eixo do mesmo objeto**: aqui muda a **janela**, lá muda o **papel**. Um deploy por variável |
| `metadata.is_transition` normalizado para `broker` | **Story 87-5** (AC2) | Idem — e é lá que `select("role, content")` ganha `metadata` |
| Aumentar o `limit` de 20 | **fora dos dois** | Mexe em custo/latência por turno (**D6**, parte de custo). A cauda-20 é a correção; o tamanho da janela é outra conversa |
| Ampliar `detectSlotMismatch` | **`W2-3`** | Onda 2, e em shadow mode |
| `collected_data` como JSON cru no prompt | **`W1-6`** | Outra fonte, XS, independente |
| Resumo que grava a fala dela como fato | **`W1-3b` / Story 87-7** | **Deploy 2 — vem ANTES desta** |

---

## Tarefas

- [ ] **T0** — Remedir e colar, **antes do código**: (a) o denominador desta story (referência do
      @po, 08/08: **17 de 136 = 12,5%** ✅ confirmado); (b) o dano — **47** respostas em 30 d e
      **90** em 90 d ✅ confirmados, 🔴 **mas em 15 e 28 conversas, não 19 e 34** (a story publicou a
      população no lugar do subconjunto atingido — corrigir o texto do §1); (c) a população da
      `87-5` — **86** ✅, com **as duas leituras nomeadas**: **18 = 20,9%** contando qualquer papel e
      **11 = 12,8%** contando só `user+assistant`; **o escape não dispara em nenhuma das duas**;
      (d) o caso da AC4 (referência: **0** conversas hoje); (e) o baseline do `grep` da AC8-(iii)
      (referência: **2** ocorrências, `enrich-leads:68` e `pipeline:1630`).
      **Se algum número divergir, publicar as duas leituras com o método** — é a régua desta casa
      desde a 87-3.
- [ ] **T1** — `loadConversationHistory`: `ascending: false` + desempate + `.reverse()`, com o
      vermelho da AC1.
- [ ] **T2** — Consumidor 1: consulta `count` condicional + `buildNoReintroContext` (AC4), com o
      vermelho e a asserção de **nenhuma consulta a mais** em conversa curta.
- [ ] **T3** — `lastAssistantMsg`: o par de fixtures da AC2 e a AC3, com os vermelhos.
- [ ] **T4** — `NICOLE_HISTORY_TRUNCATED` (AC7), reusando o `total` da T2.
- [ ] **T5** — Consumidores 4 e 5 (AC5, AC6).
- [ ] **T6** — Turnos-ouro capturados **do `HEAD`** (worktree próprio, não relato) — AC10.
- [ ] **T7** — Suíte + `tsc` nos dois pacotes (AC11).
- [ ] **T8** — **Deploy A sozinho**, 24 h, AC9-(i…iv), responsável nomeado.
- [ ] **T9** — **Deploy B** (cron `enrich-leads`), ≥24 h depois, AC8 e AC9-(v) — **e a régua da
      `AC10-(ii)` da 87-7 repetida**, pela razão escrita na caixa da AC8.
- [ ] **T10** — Avisar o **@pm**: o `CR-1` do epic cita só o `pipeline.ts`; a **segunda esteira**
      (`enrich-leads/route.ts:62-69`, com comentário que afirma o contrário do código) precisa entrar
      no texto do `W1-1`.

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| **1** | **R-A do epic** — muda o que ela vê justamente nas conversas de maior valor, e os prompts foram calibrados num mundo de cabeça-20 | **Alta** | Deploy **isolado**, 24 h, **amostragem manual de 10 conversas** antes/depois (AC9-iii), `M1`/`M4` pela régua da 87-3, e **AC10** protegendo os 87,5% de conversas curtas |
| **2** | **O modo agendamento ligar mais** (previsto pelo @architect) | **Alta** | **AC2** mede as duas direções com vermelho; **AC9-ii** mede em produção. **Gatilho de rollback é o aumento com `M1` subindo**, não o aumento sozinho — senão a story reverte por fazer o que promete |
| **3** | **A Nicole se reapresentar** a lead antigo (regressão da 59-1) | **Média** | **AC4**, na direção restritiva; medido **0** casos hoje, tratado como estrutural |
| **4** | **`property_interest_id` mudar de valor** por causa do novo insumo | **Média** | **AC5** com teste; `resolvePropertyInterestWrite` **intocada** (só preenche vazio / troca com afirmação explícita — 75-158); amostra de 5 leads no deploy B |
| **5** | Consertar só o `pipeline.ts` e declarar pronto — **a esteira esquecida pela 3ª vez** | **Alta** | **AC8** + o `grep` da AC8-(iii). É o erro que a `87-4` e a `87-7` já pagaram |
| **6** | Teste intermitente por empate de `created_at` | Média | Armadilha 1 (desempate por `id`) e Armadilha 3 (ISO nas fixtures) |
| **7** | Latência: uma consulta a mais por turno | Baixa | Só quando **truncou** — 12,5% da população com Nicole ativa; e a AC4-(iii) afirma **zero** consultas a mais no caso comum |
| **8** | Subir junto com a `87-5` e ninguém saber qual mudou o comportamento | **Alta** | Ordem escrita: **A → B → 87-5-A → 87-5-B**, 24 h entre cada. Um deploy por variável |
| **9** | Deploy B mudar `qualification_score` em lote e o comercial descobrir sozinho | **Média** | **AC9-(v)** com amostra conferida campo a campo; é a mesma lição do `D2` do gate da 87-4 (*"a queda chega lead a lead"*) — avisar antes |

---

## Critério de rollback (D7) — escrito ANTES do deploy

**Reversão:** `git revert` do PR. **Nenhuma migration. Nenhum dado a restaurar** — a story é de
**leitura**. O que o deploy B já tiver escrito em `leads` permanece (e é o motivo de ele ser
separado e amostrado).

**Gatilhos, na janela de 24 h de cada deploy:**
- qualquer `appointment` criado sem o lead ter dito dia **e** hora — **imediato**;
- aumento de **`M1`** (afirmação sem lastro) medido pelo cron da **87-3** — o modo agendamento
  ligando mais **e** errando mais;
- a Nicole se reapresentando a lead que já conversava com ela;
- resposta que ignora informação dada pelo lead **na cauda** (seria a story fazendo o contrário do
  que promete);
- deploy B: qualquer campo de perfil regredindo em lead longo na amostra de 5.

**Responsável nomeado:** a definir (Marcos ou Thielly), **24 h por deploy**. **Sem responsável
nomeado, o deploy não sai** (D7).

## Definition of Done

- [ ] AC1 a AC11 verificadas, com os **vermelhos** e os verdes colados no Dev Agent Record, e as
      contagens de vermelho **conferidas uma a uma**
- [ ] `grep -rn 'ascending: true' … | grep 'created_at'` (a régua literal da AC8-iii, corrigida pelo
      @po) → **0** ocorrências. Baseline no `HEAD`: **2**
- [ ] 🔴 **O arquivo `cron/enrich-leads/route.ts` é tocado por TRÊS stories da fila** (87-7 guarda do
      resumo · 87-8-B janela · 87-5-B papel). A ordem escrita — **87-7 → 87-8-A → 87-8-B → 87-5-A →
      87-5-B**, ≥24 h entre cada — é a única coisa que permite ler qual mudou o quê. **Quem for
      fazer o merge confere a ordem antes, não depois**
- [ ] Turnos-ouro capturados **do `HEAD`** e comparados byte a byte (AC10)
- [ ] Deploy A isolado + 24 h; deploy B ≥24 h depois + 24 h; **a `87-5` só depois dos dois**
- [ ] **@pm avisado:** o `CR-1` do epic precisa citar a segunda esteira (`enrich-leads`)
- [ ] **@po avisado:** a `87-5` está destravada; a condição de escape foi remedida (**20,9%**) e
      **não** dispara

---

## Referências (seção específica, não documento inteiro)

- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **§1/`CR-1`** (o defeito e o
  commit de origem), **§7/Onda 1** (o `W1-1` como **deploy 3**, o racional do `lastAssistantMsg` e a
  ordem que o @architect assinou), **§3/`M3`** (o `NICOLE_HISTORY_TRUNCATED` que a AC7 entrega),
  **§5/`R-A`** (o risco desta story, com a exigência das 10 conversas), **§6 item 2** (regra de corte)
- `docs/stories/87-5-historico-rotulado-fala-do-corretor.story.md` — a story que esta destrava:
  **§4** (o mapa de consumidores no eixo do **papel**), a **condição de escape** e o padrão de
  **dois deploys numa story**
- `docs/qa/gates/87.4-estado-de-agenda-com-ancora-temporal.yml` — **`N3`** (turnos-ouro capturados
  do `HEAD`, não por relato), **`N2`/`M4`** (mutação declarada ≠ medida), **`D2`** (a mudança que
  chega lead a lead e precisa ser avisada ao comercial)
- `docs/stories/87-7-resumo-nao-grava-a-fala-da-nicole-como-fato.story.md` — **deploy 2**, precede
  esta; e a medição do `enrich-leads` como escritor de 92,5% dos resumos
- `docs/stories/87-6-dedupe-atomico-lastro-diario.story.md` — a caixa do **Telegram morto**
- Story **75-279** — `createFakeSupabase` (o @qa provou que ele aplica predicados de verdade) e
  `pipeline-scheduling.test.ts`
- Story **59-1** — a não-reapresentação, que a AC4 protege

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Data:** 2026-08-09 · **Branch:** `story/87-8-historico-cauda`
(worktree isolado, criado de `origin/main` em `4da198e4`)

### T0 — Remedição contra produção ANTES do código (somente SELECT, 09/08)

🔴 **Divergência de método achada, e ela muda o tamanho do dano. São TRÊS leituras,
não duas** *(a terceira entrou depois do gate — a minha v0.3 publicava a B, que
supercontava)*:

| # | régua | respostas | conversas |
|---|---|---|---|
| **A** | `row_number()` só sobre mensagens **dentro** da janela de 30 d (a do @po) | **43** | 14 |
| **B** | `row_number()` sobre a conversa inteira de quem esteve ativo em 30 d | **66** | 17 |
| ✅ **C** | `row_number()` sobre a **conversa inteira**, mas contando só a resposta **cuja data cai na janela** | **51** | **17** |

**A régua certa é a C, e é ela que vale.** O `limit(20)` enxerga a **conversa
inteira** (`loadConversationHistory` não filtra por data), então a posição tem de
ser contada na conversa toda — o que derruba a **A**, que subconta. Mas a **B**
supercontava na outra ponta: ela inclui respostas cegas **anteriores** à janela,
em conversas que só têm atividade dentro dela. **A correção sobre o número
publicado (47) é `+18,6 %`, não `+53 %`.**

Complementos das réguas A e B, para referência: conversas `user+assistant`
183 / 190 · população >20 msgs 18 / 21 · com Nicole ativa 138 / 149 · maior
conversa 40 / 45. **A leitura A reconcilia com o @po** (ele mediu 17/136/47/15/40
em 08/08; a janela deslizou um dia).

Confirmados, um a um, **sem divergência**:

| medida | story / @po | @dev (09/08) |
|---|---|---|
| respostas com janela cheia, 90 d | 90 | ✅ **90** |
| conversas afetadas, 90 d | 28 (corrigido pelo @po) | ✅ **28** |
| maior conversa, 90 d | 45 | ✅ **45** |
| **(d)** caso da AC4 hoje | 0 | ✅ **0** |
| **(e)** baseline do `grep` da AC8-(iii) | 2 | ✅ **2** (`enrich-leads:68`, `pipeline:1630`); sem o `\| grep created_at` são **3**, e a 3ª é `pipeline.ts:787` (`scheduled_at`), legítima — a correção do @po estava certa |

**(c) População da `87-5`** — **88** conversas com Nicole **e** corretor (era 86 em
08/08; janela deslizou). **As duas leituras, nomeadas:**

| régua | conta | % de 88 | escape (limiar 10 %) |
|---|---|---|---|
| qualquer papel (`user+assistant+broker`) | 18 | **20,5 %** | **não dispara** |
| só `user+assistant` (a régua do §1) | 11 | **12,5 %** | **não dispara** |

Tráfego em 30 d: **887** mensagens `broker` contra **603** `assistant` — a escolha
de régua não é detalhe, e a conclusão sobrevive às duas. **Ordem `W1-1` → `W1-7`
confirmada pela quarta vez.**

### Os vermelhos — saída BRUTA do reporter, colada

> **Nota de processo, aceita do gate:** é a 4ª rodada seguida deste epic em que
> uma contagem declarada não sobrevive à remedição — e nas 4 o que quebrou foi a
> **transcrição**, não a medição (o meu `1 failed | 17 passed (20)` da v0.3 é
> aritmeticamente impossível: era a saída de uma execução de **18** testes,
> rotulada como 20). **A partir daqui cola-se a saída do reporter, não se
> transcreve.** Fecha a classe inteira.

Rodados com o arquivo de teste **final** contra o `pipeline.ts`/`route.ts` do
`HEAD` (revertidos no próprio worktree, testes intactos).

**Vermelho 1 — deploy A, `packages/ai/src/chat/pipeline-historico-cauda.test.ts`:**

```
     × com 25 mensagens, a Anthropic recebe m6…m25 (não m1…m20) 49ms
     × empate de created_at: o desempate por id preserva a ORDEM do grupo empatado 4ms
     × (i) fala de visita no COMEÇO deixa de armar o modo agendamento 3ms
     × (ii) fala de visita na CAUDA passa a armar o modo agendamento 2ms
     × pergunta de nome no COMEÇO deixa de aceitar 'maicon' como nome 2ms
     × pergunta de nome na CAUDA passa a aceitar 'maicon' como nome 2ms
     × (iii) conversa curta: mesma string e NENHUMA consulta a mais que a longa-1 2ms
     × (iii-c) a consulta extra some quando a cauda já tem fala da Nicole 2ms
     × (i) conversa de 25 → evento com total 25 e a mais recente = m25 1ms
     × (i-b) o evento não carrega conteúdo de mensagem nem PII (regra do W0-2) 1ms
     × começo cita Vind, cauda cita Origem, property_interest_id vazio → grava Origem 2ms
     × conversa longa: o corretor passa a receber o PRESENTE, e o total segue coerente 3ms
 Test Files  1 failed (1)
      Tests  12 failed | 8 passed (20)
```

Os **8 verdes contra o `HEAD` são de propósito** — são as não-regressões:
AC1 conversa curta · AC4-(i) · AC4-(iii-b) · **AC6 conversa curta byte a byte** ·
AC7-(ii) 15 msgs sem evento · **AC10 os 3 turnos-ouro**.

**Vermelho 2 — o da AC4-(ii), que o `HEAD` NÃO produz.** Com a cauda já aplicada
e `buildNoReintroContext(history)` **sem** o 2º sinal:

```
     × (i) cauda-20 toda do lead, fala dela na posição 2 → bloco continua emitido 8ms
 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
```

É a prova de que a guarda não é decorativa: **sem ela, e só com a cauda, a Nicole
se reapresenta.** Uma falha, exatamente a prevista, e nenhuma outra.

**Vermelho 3 — deploy B, `enrich-leads/route.test.ts`:**

```
     × 🔴 (i)(ii) com 25 mensagens, o texto entregue ao Haiku contém m6…m25 508ms
     × empate de created_at: o desempate por id preserva a ORDEM do grupo empatado 4ms
 Test Files  1 failed (1)
      Tests  2 failed | 16 passed (18)
```

A "conversa curta (15)" passa nos dois mundos — é a não-regressão.

**🔴 Vermelho 4 — o desempate por `id`, que a v0.3 NÃO tinha como provar (F1 do
gate).** O teste antigo comparava dois runs entre si — e isso **não pode ficar
vermelho**: a leitura é determinística nos dois mundos e o sort do fake é estável,
então dois runs idênticos sempre concordam. O que o desempate carrega é a
**ORDEM**: a consulta é DESCENDENTE e o array é revertido, logo sem
`.order("id", {ascending:false})` o grupo empatado volta **invertido**.
Removendo o desempate das **duas** esteiras:

```
- "Nicole: m10"        ← esperado
- "Lead: m11"
   "Nicole: m12"
+ "Nicole: m12"        ← obtido
+ "Lead: m11"
+ "Nicole: m10"

 Test Files  2 failed (2)
      Tests  2 failed | 36 passed (38)
```

*(…m9, **m12, m11, m10**, m13… — a inversão, nas duas esteiras.)* Asserção nova:
a sequência inteira `m3…m22`, que discrimina. Verde com o desempate: **38/38**.

### Verdes, suíte e tipos (AC11)

| | baseline `origin/main` | branch |
|---|---|---|
| `npx vitest run` da **raiz** | `1864 passed \| 7 expected fail (1871)` | `1887 passed \| 7 expected fail (1894)` |
| arquivos que falham por import | 5 (`sharp`/`satori`/`pdf-lib`) | **os mesmos 5** |
| `tsc --noEmit` em `packages/web` | **13** erros | **13** erros |
| `tsc --noEmit` em `packages/ai` (é o `lint` dele) | 0 | **0** |

**Delta de +23 testes = 20 (deploy A) + 3 (deploy B).** O baseline bate
**exatamente** com a referência da AC11 (`1864 passed | 7 expected fail`). Os 5
arquivos e os 13 erros de tipo são pré-existentes e idênticos nos dois lados —
declarados, não consertados.

**`grep` da AC8-(iii), a régua literal do @po:**

```
$ grep -rn 'ascending: true' packages/web/src/app/api/cron/enrich-leads \
    packages/ai/src/chat/pipeline.ts | grep 'created_at'
count=0        # baseline no HEAD: 2 ✅
```

### 🔴 Resolução do conflito 87-7 × 87-8 — e a armadilha que ela desenterrou

O conflito **não estava em `pipeline.ts` nem em `enrich-leads/route.ts`** (os dois
auto-mergeiam; as regiões estão mesmo a >20 linhas). Está em
**`enrich-leads/route.test.ts`**, em **2 hunks**, e só nasce **depois** do primeiro
merge — cada branch está limpa contra `main`, por isso os dois PRs apareciam
verdes. Achado por `git merge-tree` (merge de ensaio, base `4da198e4`), não por
conferência textual — a conferência textual falhou **três vezes**, inclusive a
minha.

**Causa:** as duas stories mexem no **mesmo dublê** e no **mesmo `beforeEach`**.

| hunk | 87-7 | 87-8 | resolução |
|---|---|---|---|
| dublê de `enrichLeadFromConversation` | stuba e captura `input.fatoDeAgenda` | chama a função **real**, dubla só a rede | **base 87-8** (é estritamente mais rica) **+** a captura da 87-7 por cima **+** `summary` sai de `summaryDoHaiku` |
| reset do `beforeEach` | 3 resets | 2 resets | **união dos 5** |

**Semântica, não textual** — nada de `-X ours`/`-X theirs`. **Nenhum teste
perdido:** 21 (87-7) ∪ 18 (87-8) = **24**, e o arquivo mergeado tem **25** (o 25º
é a remediação abaixo). Conferido por comparação de nomes de `it(...)` entre as
três versões: **0 perdidos**.

**Matriz de mutação pós-merge — com a FORMA escrita junto do número** *(nota do
@devops no #381: número sem a forma da mutação não reproduz)*:

| # | forma da mutação | vermelhos | prova |
|---|---|---|---|
| **M1** | `route.ts`: `ascending:false`→`true` **e** `[...].reverse()`→`[...]` | `2 failed \| 22 passed (24)` | a janela do deploy B |
| **M2** | `route.ts`: remove a linha `.order("id", { ascending: false })` | `1 failed \| 23 passed (24)` | o desempate |
| **M3** | teste: `order:()=>builder` e `limit:()=>builder` (o mock do `HEAD`) | `3 failed \| 21 passed (24)` | o mock honrar `order`/`limit` |
| **M4** | teste: `promptDoHaiku = input.fatoDeAgenda ?? ""` → `= ""` | `1 failed \| 23 passed (24)` | **a prova da 87-7 sobrevive** |
| **M5** | teste: `summary: summaryDoHaiku` → `summary: "resumo"` | `5 failed \| 19 passed (24)` | 🔴 **a escolha (b) é load-bearing** |

> **O M5 é o achado da resolução.** Se eu tivesse mantido o `"resumo"` fixo do meu
> lado — que é o que uma resolução **textual** produziria —, **cinco** testes do
> guarda da 87-7 continuariam existindo e **passariam sem provar nada**: eles não
> teriam como injetar o resumo que afirma visita, que é a fixture inteira da AC1
> dela. Verde silencioso, na story cujo defeito era exatamente esse.

**🔴 E a remediação que o merge desenterrou (armadilha 1).** Rodei a mutação do
fake — `this.orders` → `this.orders.slice(-1)`, o "último `order` vence" do
`HEAD` — e deu **20 passed**: **verde**. Ou seja, a minha correção do
`createFakeSupabase` estava **certa mas não provada**. A razão é a minha própria
fixture: `id` zero-padded (`msg-01`…`msg-25`) é **perfeitamente correlacionado**
com `created_at`, então ordenar por `id` acerta por acidente — é exatamente o que
o @qa descreveu ("a AC1 fica verde sem que a ordenação por `created_at` jamais
tenha sido exercitada"). **Em produção `messages.id` é UUID: descorrelacionado.**

Teste novo nas **duas** esteiras, com `id` em ordem **inversa** ao `created_at`:

```
########## M6 — fake volta a 'último order vence' ##########
     × 🔴 a janela sai de created_at, NÃO de id — com id descorrelacionado (…)   [pipeline]
     × 🔴 a janela sai de created_at, NÃO de id — com id descorrelacionado (…)   [cron]
      Tests  2 failed | 44 passed (46)
```

Antes da remediação essa mesma mutação dava `20 passed` — **0 vermelhos**. Agora
a armadilha 1 está mesmo morta, e é a única fixture que distingue *"ordenou por
`created_at`"* de *"ordenou por `id`"*.

**Suíte, no estado mergeado:**

```
 Test Files  5 failed | 154 passed (159)
      Tests  1935 passed | 7 expected fail (1942)
```

Os 5 arquivos que falham são os pré-existentes (`sharp`/`satori`/`pdf-lib`), os
mesmos do baseline. `tsc`: **0** em `packages/ai`, **13** (pré-existentes) em
`packages/web`. `grep` da AC8-(iii): **0**.

> ⚠️ **A soma não fecha, e o motivo é de medição, não de código.** Medi a 87-7
> sozinha num worktree ad-hoc e ela deu `1905 passed`, mas com **6** arquivos
> falhando ao carregar em vez dos 5 pré-existentes — um arquivo a mais não
> resolveu dependência naquele worktree, o que **subconta** a branch. Não publico
> delta a partir dele. O que vale é: **merge verde, 0 testes perdidos, 6
> mutações com vermelho medido.**

### Decisões de implementação (IDS)

| # | decisão | por quê |
|---|---|---|
| 1 | **REUSAR** `createFakeSupabase` e o harness de turno da `pipeline-agenda-state.test.ts` | Story 75-279 — usar, não recriar |
| 2 | **ADAPTAR** `createFakeSupabase`: `order` vira **lista** e `select` aceita `{count, head}` | O fake guardava **só o último** `order` — o desempate por `id` **apagaria** a ordenação por `created_at` e o teste da cauda passaria **verde por acidente**, ordenando por `id` (`m1 < m10 < m2`). Sem `count/head` a AC7 não teria como ser medida |
| 3 | **ADAPTAR** o mock do cron para honrar `.order()`/`.limit()` de verdade | Um mock que os ignora não distingue cabeça de cauda e daria verde nos dois mundos. Semeadura opcional (`null` = comportamento antigo) para não tocar em nenhum teste que já existia |
| 4 | **CRIAR** `HistoricoCarregado` (a função devolve objeto, não array) | AC7 precisa de `created_at` das pontas e do total; o `history` array continua o mesmo para os 5 consumidores |
| 5 | **NÃO** mexer em `isVisitSchedulingMode` nem em `NICOLE_TALKED_VISIT_RE` | Regra de corte da Onda 1. A AC2 **mede**, não conserta |

### 🔴 Divergências entre o que a story previu e o que eu encontrei

1. **O §3 e a AC7 pedem coisas diferentes da MESMA consulta.** O §3 diz *"uma
   consulta `count` de `role='assistant'`"*; a AC7 exige
   `total_na_conversa: 25` para uma conversa de 25 mensagens `user+assistant`.
   Contando só `assistant` esse número seria **12**. **Não dá para ser as duas
   com uma consulta só.** Implementado assim, e é **mais barato** que o previsto:
   - **1 consulta** (`count` de `user+assistant`) → `total_na_conversa`. Só quando
     truncou: **12,5 %** da população, como a story orçou;
   - **1 segunda consulta** (`count` de `assistant`) **só quando a cauda inteira é
     do lead** → hoje **0 conversas**. É o caso da AC4 e não existe em produção.
   - Nas conversas curtas: **zero** consultas a mais (AC4-iii, com teste).
2. 🔴 **A AC9-(ii) é estatisticamente inerte numa janela de 24 h.**
   `appointments` com `created_by='nicole'` são **3 em 30 dias**, e o **último foi
   em 31/07** — 9 dias atrás. Taxa base ≈ **0,1/dia**: em 24 h o resultado mais
   provável é `antes = 0, depois = 0`, que não discrimina nada. E a outra metade
   da AC9-(ii) — *"contagem de blocos `[SISTEMA]` de agendamento"* — **não tem
   contador nenhum hoje**: `system_events` não registra que o modo agendamento
   ligou. **É uma métrica que não consegue ficar vermelha**, exatamente a classe
   de defeito que o @po encontrou na `AC10-(ii)` da 87-7. **Não adicionei o
   contador por conta própria** (seria escopo fora de AC, e AC é do @po) —
   **escalado**. A `AC2`, com o par de fixtures, é hoje a única guarda real do
   Risco 2.
3. **A AC7/`M3` É verificável — conferido, não presumido.** O `onEvent` do
   pipeline está ligado ao `logEvent` com `source: "ai/pipeline"`
   (`webhook/whatsapp/route.ts:859`) e **está vivo**: 124 `CLAUDE_RESPONSE` em
   7 dias, o último hoje 18:28. Nenhuma dependência do canal de alerta morto —
   a prova é `select` em `system_events`, como a story exige.
   ⚠️ **Mas o volume esperado é baixo:** ~1,5 resposta cega/dia ⇒ a janela de 24 h
   deve render **n ≈ 1-3** eventos. Vale o mesmo piso de inconclusividade que a
   87-7 adotou (`n < 5` ⇒ estende a janela, não declara sucesso).
4. **O cron `enrich-leads` está VIVO** (contra o que se supôs): último
   `last_enriched_at` **hoje 18:30**, **5** conversas em 24 h e **27** em 7 dias.
   A AC8/AC9-(v) do deploy B **é verificável** — só que por
   `conversations.last_enriched_at` e pelos campos de `leads`, **não** por
   `system_events` (este cron não emite evento próprio).
5. ✅ **A previsão do @architect NÃO se sustenta — medido pelo @qa no gate.**
   Comparando cabeça-20 × cauda-20 em cada resposta cega dos últimos 30 dias, o
   modo agendamento **arma hoje 18 × arma depois 14**: passa a ligar **menos**, não
   mais. 3 passam a ligar, 7 deixam de ligar — o que existe é **churn**, valendo
   ~0,1 turno/dia. A **AC2 continua certa e continua valendo** (ela mede as duas
   direções, e o par de fixtures é o que discrimina); o que cai é a premissa do
   Risco 2 e do §3-item-2 da story. **Registrado para o @po/@pm, sem ação aqui.**
6. **O MESMO defeito vive fora do escopo desta story**, no agente do CRM:
   `packages/web/src/lib/agent/context-builder.ts:1169` (`limit(50)`) e
   `packages/web/src/app/api/agent/chat/route.ts:154` (`limit(20)`). Não é desta
   story e **não foi tocado** — fica registrado para virar item de backlog.
7. **`system_events` tem 0 eventos `NICOLE_*`** — a família inteira nunca foi
   escrita. Consistente com o @po. Não é bloqueio para esta story (o `emit` do
   pipeline funciona; os eventos `NICOLE_*` que existem hoje são todos
   condicionais e raros), mas confirma que **`NICOLE_HISTORY_TRUNCATED` será o
   primeiro** — e por isso a AC7 tem teste de ausência de PII.

### Pendências que NÃO são de código (não executadas por mim)

- **T8/T9 · AC9 · D7** — deploy A sozinho + 24 h, deploy B ≥24 h depois, com
  **responsável nomeado**. Sem responsável, o deploy não sai. **@devops/@po.**
- **T10** — avisar o **@pm**: o `CR-1` do epic cita só `pipeline.ts`; falta a
  segunda esteira (`enrich-leads/route.ts:62-69`).
- **Ordem de merge** — `enrich-leads/route.ts` é tocado por **três** stories.
  Esta branch saiu de `origin/main`, **não** da branch da 87-7: os dois conjuntos
  de mudanças estão em **regiões diferentes dos mesmos dois arquivos** (87-7 em
  `pipeline.ts:1565-1585` e `enrich-leads:27,89-110,173-250`; 87-8 em
  `pipeline.ts:201-225,504-587,627,1620+` e `enrich-leads:62-69`). **Nenhuma linha
  em comum**, mas a ordem **87-7 → 87-8-A → 87-8-B → 87-5-A → 87-5-B** se confere
  **antes** do merge, não depois.

### File List

| arquivo | o quê |
|---|---|
| `packages/ai/src/chat/pipeline.ts` | **M** — `loadConversationHistory` passa a ler a cauda (+ desempate por `id`, `.reverse()` da cópia, `created_at` no `select`); `buildNoReintroContext` ganha o 2º sinal; evento `NICOLE_HISTORY_TRUNCATED` |
| `packages/ai/src/chat/__fixtures__/fake-supabase.ts` | **M** — `order` encadeado (lista) e `select(cols, {count, head})` |
| `packages/ai/src/chat/pipeline-historico-cauda.test.ts` | **A** — 20 testes (AC1-AC7, AC10) |
| `packages/web/src/app/api/cron/enrich-leads/route.ts` | **M** — deploy B: a segunda esteira lê a cauda; o comentário mentiroso vira verdade |
| `packages/web/src/app/api/cron/enrich-leads/route.test.ts` | **M** — mock passa a honrar `order`/`limit`; dublê chama o `enrichLeadFromConversation` real; 3 testes novos (AC8) |
| `docs/stories/87-8-historico-passa-a-ser-a-cauda-da-conversa.story.md` | **M** — Dev Agent Record |

## QA Results

**@qa (Quinn) · 2026-08-09 · rodada 1 · veredito: 🟡 CONCERNS**
Gate: `docs/qa/gates/87.8-historico-passa-a-ser-a-cauda-da-conversa.yml`

**O código está certo, e a evidência é a mais forte que este epic produziu.** O que trava o PASS é o
**instrumento** do risco de maior severidade, e ele é do @po.

### O que reproduzi, e não aceitei por relato

| verificação | declarado | medido | |
|---|---|---|---|
| Vermelho 1 — `pipeline.ts` do `HEAD` | 12/20 | **12 failed \| 8 passed (20)** | ✅ lista bate nome a nome |
| Vermelho 2 — cauda **sem** a guarda da AC4 | "1 \| 17 (20)" | **1 failed \| 19 passed (20)** | ✅ na substância |
| Vermelho 3 — `enrich-leads` do `HEAD` | 2/18 | **2 failed \| 16 passed (18)** | ✅ |
| Suíte da raiz | 1887 | **1887 \| 7 expected fail** | ✅ 1887 − 23 = 1864 |
| `tsc` `ai` / `web` | 0 / 13 | **0 / 13** pré-existentes | ✅ nenhum nos arquivos tocados |
| `grep` da AC8-(iii) | 0 (baseline 2) | **0** | ✅ |

**O vermelho nº 2 é real e é o que mais importa.** Sem a guarda, e só com a cauda, cai **exatamente
um** teste — a AC4-(i) — e nenhum outro. O `HEAD` não produz esse vermelho: o problema **nasce** com
a correção. A guarda não é decorativa.

**As duas armadilhas de harness eram reais, e as duas correções são load-bearing.** Com o
`fake-supabase` do `HEAD` a AC1 fica **verde sem que a ordenação por `created_at` jamais tenha sido
exercitada** (o fake guardava só o último `.order()`, que é o `id`; com id zero-padded a ordem
coincide e o `created_at` vira decoração). Com o mock do cron ignorando `order`, os **três** testes
novos da AC8 caem. Regra de corte da Onda 1 respeitada: `isVisitSchedulingMode` e
`NICOLE_TALKED_VISIT_RE` intocados, e o `|| jaFalouForaDaJanela` é monotônico.

### Três achados meus — nenhum é defeito de código

**F1 (média) — o desempate por `id` não tem teste que discrimine, nas DUAS esteiras.** Removi
`.order("id", { ascending: false })` de `pipeline.ts` **e** de `enrich-leads/route.ts`: **38 passed
(38)**. O teste chamado *"empate … é desempatado por id"* não consegue falhar pelo motivo que nomeia
— o `sort` do fake é estável, e dois runs idênticos sempre concordam. **E o desempate É
load-bearing**, por outro motivo: sem ele o grupo empatado volta **invertido**
(`…m9, m12, m11, m10, m13…`). Acrescentei uma linha ao teste (`toEqual` da sequência completa) e ele
fica vermelho sem o desempate e verde com ele. Uma linha em cada esteira.

**F2 (média, texto) — a régua da T0: nem 43 nem 66. São 51.** O @dev está certo em que 43 subconta
(`loadConversationHistory` não filtra por data). Mas 66 **superconta**: inclui respostas anteriores à
janela, em conversas que só têm atividade dentro dela. A leitura honesta é `row_number()` sobre a
conversa inteira com a resposta **dentro** da janela → **51 respostas em 17 conversas** (30 d).
A correção sobre o publicado é **+18,6 %**, não +53 %. Em 90 d o número da story sobrevive: **90 em 28**.

**F3 (alta para a janela de observação) — a AC9-(ii) não consegue ficar vermelha em 24 h, nas duas
metades.** Conferi contra produção: `appointments` com `created_by='nicole'` = **3 em 30 d**, último
em **31/07**; e **não existe contador** de bloco `[SISTEMA]` (listei todo `event_type` do
`pipeline.ts` e todo `event_type` gravado em `system_events` em 7 dias). Mesma classe da
`AC10-(ii)` da 87-7.
**Mas medi retrospectivamente o que a AC queria medir**, comparando o `lastAssistantMsg` da
cabeça-20 com o da cauda-20 em cada resposta cega:

| janela | respostas cegas | gate arma HOJE | arma DEPOIS | **passa a ligar** | deixa de ligar |
|---|---|---|---|---|---|
| 30 d | 51 | 18 | 14 | **3** | 7 |
| 31-90 d | 39 | 11 | 10 | 3 | 4 |

Ou seja: **a previsão do @architect não se sustenta na população** — ver a cauda faz o modo
agendamento armar **menos**, não mais. O que existe é churn, e a direção de risco vale **0,1
turno/dia**: 24 h renderiam zero, e zero não distingue "não aconteceu" de "não mede".

Também registrados no gate: **F4** (`truncou` dispara em conversa de exatamente 20 → filtrar
`total_na_conversa > limite` na `M3`), **F5** (o mesmo defeito vive fora do escopo, no agente do CRM:
`agent/context-builder.ts:1169` e `api/agent/chat/route.ts:154`) e **F6** (fora de expediente o
evento não sai — hoje inócuo, porque prod roda `always_on: true`).

### Condições para PASS

1. **[@dev, ~10 min]** Fechar o F1 — asserção de sequência completa no teste de empate, nas duas
   esteiras, com o vermelho colado.
2. **[@po]** Reescrever a AC9-(ii): ou a régua retrospectiva do F3 (baseline já medido) ou autorizar
   um contador `NICOLE_VISIT_MODE_ARMED` via `emit` (observabilidade, não caminho de decisão). Nas
   duas, declarar o piso `n < 5 ⇒ estende a janela`.
3. **[@dev, ~2 min]** Corrigir a T0 com o F2 — publicar as três leituras e nomear a certa (**51 em 17**).

**Deploy A pode sair com 1 e 3 fechados e 2 nomeado** — sozinho, 24 h, responsável nomeado (D7).
**Deploy B sem alteração:** ≥24 h depois, com a amostra de 5 leads e a régua da `AC10-(ii)` da 87-7.
**Ordem de merge:** conferi as regiões da 87-7 × 87-8 nos dois arquivos compartilhados — **nenhuma
linha em comum**; o relato do @dev procede.

*Árvore restaurada byte a byte depois das 6 mutações (md5 conferido nos 5 arquivos). 7 consultas de
produção, todas somente SELECT.*

— Quinn, guardião da qualidade 🛡️

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-09 | 0.5 | **@dev — conflito 87-7 × 87-8 resolvido (semanticamente), e a resolução desenterrou uma armadilha que estava viva.** O conflito não era em `pipeline.ts` nem em `enrich-leads/route.ts` — os dois auto-mergeiam — e sim em **`enrich-leads/route.test.ts`, 2 hunks**, porque as duas stories mexem no **mesmo dublê** e no **mesmo `beforeEach`**; ele só nasce **depois** do primeiro merge, e por isso os dois PRs apareciam verdes contra `main`. Resolvido com **base 87-8** (chama o `enrichLeadFromConversation` real, dubla só a rede) **+** a captura de `fatoDeAgenda` da 87-7 por cima **+** `summary` saindo de `summaryDoHaiku`; resets em **união**. **0 testes perdidos** (21 ∪ 18 = 24, mergeado = 25 com o teste novo), conferido por comparação de nomes de `it(...)`. **6 mutações rodadas com a FORMA colada junto do número** (nota do @devops no #381): M1 janela `2 failed`, M2 desempate `1 failed`, M3 mock ignorando `order/limit` `3 failed`, M4 captura do `fatoDeAgenda` `1 failed`, M5 `summary` fixo **`5 failed`**. 🔴 **O M5 é o achado:** uma resolução **textual** (`-X ours`) teria mantido o `"resumo"` fixo e deixado **cinco** testes do guarda da 87-7 passando **sem provar nada** — eles não teriam como injetar a fixture da AC1 dela. 🔴 **E a remediação:** a mutação do `createFakeSupabase` (`orders` → `orders.slice(-1)`, o "último order vence" do `HEAD`) dava **20 passed — verde**. A minha correção estava **certa mas não provada**, porque a minha fixture usa `id` zero-padded, perfeitamente correlacionado com `created_at`; em produção `id` é **UUID**. Teste novo nas duas esteiras com `id` **inverso** ao `created_at` — a mesma mutação passa a dar **`2 failed | 44 passed (46)`**. Suíte mergeada: **`1935 passed \| 7 expected fail (1942)`**, 5 arquivos pré-existentes falhando, `tsc` 0/13, `grep` 0. Merge **local, não empurrado**. | @dev (Dex) |
| 2026-08-09 | 0.4 | **@dev — CONCERNS do gate endereçado (F1 + F2). Código inalterado; o que muda é o que PROVA o código.** 🔴 **F1 — o desempate por `id` não tinha teste que discriminasse, nas duas esteiras.** O @qa removeu `.order("id", …)` de `pipeline.ts` **e** de `enrich-leads/route.ts` e mediu **38/38 verdes**: o teste antigo comparava dois runs entre si, e isso nunca poderia ficar vermelho — a leitura é determinística nos dois mundos e o sort do fake é estável. **Mas o desempate É load-bearing, por ORDEM:** a consulta é descendente e o array é revertido, então sem ele o grupo empatado volta **invertido** (`…m9, m12, m11, m10, m13…`). Asserção trocada pela sequência inteira `m3…m22` nas duas esteiras — **vermelho 4 colado: `2 failed \| 36 passed (38)`**, verde depois: **38/38**. 🔴 **F2 — nem 43 nem 66: são 51.** A minha v0.3 acertou ao derrubar a régua A (43 subconta, porque o `limit` vê a conversa inteira e não a janela), mas publicou a **B**, que **supercontava** — ela inclui respostas cegas **anteriores** à janela em conversas ativas só dentro dela. A régua honesta (`row_number()` na conversa inteira, resposta **datada dentro** da janela) dá **51 respostas em 17 conversas**; a correção sobre o publicado (47) é **+18,6 %**, não +53 %. **As três leituras publicadas na T0, com a certa nomeada.** **Nota de processo adotada:** é a 4ª rodada seguida em que uma contagem declarada não sobrevive à remedição, e nas 4 quebrou a **transcrição**, não a medição — o meu `1 failed \| 17 passed (20)` era aritmeticamente impossível (a saída real, recolhida, é **`1 failed \| 19 passed (20)`**; o 17 vinha de uma execução de 18 testes rotulada como 20). **Todos os vermelhos passam a ser saída BRUTA do reporter, colada.** ✅ **AC9-(ii) NÃO tocada** — inerte nas duas metades, e reescrever AC é do @po (já escalado). Registrados sem ação: **a previsão do @architect não se sustenta** (medição retrospectiva do @qa: modo agendamento arma **18 → 14**, liga MENOS; 3 entram, 7 saem; churn de ~0,1 turno/dia — a AC2 segue válida, cai a premissa do Risco 2) e **o mesmo defeito fora do escopo** (`lib/agent/context-builder.ts:1169` `limit(50)` e `api/agent/chat/route.ts:154` `limit(20)`). Suíte da raiz e tipos inalterados: `1887 passed \| 7 expected fail (1894)`, 13 erros pré-existentes em `packages/web`, 0 em `packages/ai`, `grep` da AC8-(iii) = **0**. | @dev (Dex) |
| 2026-08-09 | 0.3 | **@dev — implementado. Ready → Ready for Review.** Deploy A (`loadConversationHistory` + os 5 consumidores + `NICOLE_HISTORY_TRUNCATED`) e deploy B (`enrich-leads`) prontos, em branch saída de `origin/main` (`4da198e4`). **Três vermelhos medidos e conferidos, não declarados:** 12 de 20 contra o `HEAD` (deploy A) · **1 de 20** contra a cauda **sem** a guarda da AC4 — a prova de que sem ela a Nicole se reapresenta · 2 de 18 contra o `HEAD` (deploy B). Suíte da raiz `1864 → 1887 passed | 7 expected fail`, delta **+23 = 20 + 3**; baseline bate **exatamente** com a referência da AC11. `tsc`: 13 erros pré-existentes em `packages/web` nos **dois** lados, 0 em `packages/ai`. `grep` da AC8-(iii): **0** (baseline 2 ✅). **T0 remedida com divergência de método publicada:** a régua "30 dias" da story é ambígua e o dano é **43 respostas** contando só mensagens dentro da janela (reconcilia com o @po) mas **66** contando a conversa inteira de quem esteve ativo — e **a segunda é a mecanicamente correta**, porque `loadConversationHistory` não filtra por data. 90 d (**90** em **28**), maior conversa (**45**), caso da AC4 (**0**) e baseline do `grep` (**2**) confirmados um a um. Escape da `87-5` remedido nas duas réguas (**20,5 %** e **12,5 %**): **não dispara**. 🔴 **Duas divergências escaladas:** (1) o §3 pede `count` de `role='assistant'` e a AC7 pede `total_na_conversa: 25` — **não dá para ser as duas com uma consulta só**; implementado com 1 consulta em 12,5 % das conversas (o total) + uma 2ª **só no caso de 0 %** da AC4, e **zero** consultas a mais nas conversas curtas; (2) 🔴 **a AC9-(ii) não consegue ficar vermelha em 24 h** — `created_by='nicole'` são **3 appointments em 30 dias** e o último foi em **31/07**, e *"blocos `[SISTEMA]` de agendamento"* **não tem contador nenhum** em `system_events`. Contador não adicionado por conta própria (AC é do @po). Conferido em compensação que a **AC7/`M3` É verificável**: o `emit` do pipeline chega ao `logEvent` e está vivo (124 `CLAUDE_RESPONSE` em 7 d), e que o **cron `enrich-leads` está VIVO** (último enrich hoje 18:30; 27 conversas em 7 d) — a AC8 do deploy B é observável por `last_enriched_at`, não por `system_events`. | @dev (Dex) |
| 2026-08-08 | 0.2 | **@po — GO com emendas. Draft → Ready.** Remedi tudo contra produção: **335** conversas · **31** com >20 msgs de qualquer papel (9,3%) · **136** com Nicole ativa · **17 = 12,5%** no denominador · **47** respostas com janela cheia em 30 d · **90** em 90 d · maior conversa **40** e **45**. **Bate uma a uma — é a medição mais limpa deste epic.** ✅ **Confirmado também o achado que muda o escopo:** `enrich-leads/route.ts:62-69` tem literalmente `// AC3: Load last 20 messages` acima de `.order("created_at", { ascending: true }).limit(20)` — o comentário afirma o contrário do código, e é a **terceira story seguida** em que essa esteira é a esquecida. **O tratamento como deploy B é adequado, com uma emenda:** nenhuma das duas stories nomeia que o deploy B **muda o insumo do guarda que a 87-7 acaba de instalar** (o resumo passa a nascer da cauda, e cauda recente tem mais fala de agendamento que o começo) — a janela de 24 h do B passa a repetir a régua da `AC10-(ii)` da 87-7. 🔴 **Três correções de régua/denominador,** todas do tipo que este epic já errou: (1) o dano é de **47 respostas em 15 conversas** (30 d) e **90 em 28** (90 d) — a story publicou **19** e **34**, que são a *população* com >20 mensagens, não o subconjunto atingido; a unidade "resposta" está certa, a unidade "conversa" não; (2) o **18 de 86 = 20,9%** da `87-5` conta **qualquer papel**, enquanto o §1 da própria story declara o denominador como `user+assistant` — nessa régua são **11 = 12,8%**. **O escape não dispara nas duas leituras e a ordem `W1-1` → `W1-7` está confirmada**, mas as duas passam a ser declaradas, porque `broker` é **901** mensagens contra **619** de `assistant` em 30 d: a escolha de régua não é detalhe; (3) 🔴 **o `grep` da AC8-(iii) não podia dar 0** — `ascending: true` aparece **3 vezes** nesses alvos no `HEAD`, e uma é legítima (`pipeline.ts:787`, `activeAppointment` por `scheduled_at`). Régua corrigida para `| grep 'created_at'`, com baseline **2** (`enrich-leads:68`, `pipeline:1630`) — o vermelho e a lista de tarefas passam a ser o mesmo comando. Acrescentado ao DoD que **`cron/enrich-leads/route.ts` é tocado por TRÊS stories da fila** (87-7, 87-8-B, 87-5-B) e que a ordem se confere antes do merge. Regra de corte da Onda 1: ✅ nenhum caminho de decisão novo — a recusa da **AC2** em mexer em `isVisitSchedulingMode`, medindo em vez de consertar, é a leitura certa. | @po (Pax) |
| 2026-08-08 | 0.1 | Story criada para o item **`W1-1`** (deploy 3 da Onda 1), o `CR-1` do Epic 87 — `loadConversationHistory` pega as **20 primeiras** mensagens desde `7194d9b2` (31/03/2026): nunca funcionou. **Medições minhas contra produção (read-only, 08/08), com unidade e denominador declarados:** o denominador desta story é *conversa com Nicole ativa e >20 mensagens `user+assistant` em 30 dias* → **17 de 136 = 12,5%**; e o **dano** é **47 respostas da Nicole geradas com a janela já cheia**, em 19 conversas (90 dias: **90** respostas em 34 conversas; maior conversa: 45 mensagens) — mesma ordem de grandeza das 31 respostas cegas que aprovaram o `W1-7`. **Achado novo, e ele muda o escopo: são DUAS esteiras.** O cron `enrich-leads` (`route.ts:62-69`) tem a **linha idêntica**, com o comentário `// AC3: Load last 20 messages` afirmando o contrário do que o código faz — ou seja, `ai_summary`, `collected_data`, `qualification_score` e os campos de perfil também são extraídos do **começo** da conversa. É a **terceira vez seguida** nesta onda que o `enrich-leads` é a esteira esquecida (`87-4`: último escritor de 70% dos estados; `87-7`: toca 92,5% dos resumos) — daí o **deploy B**, no padrão de dois deploys que o @po já validou na `87-5`. **A exigência do @architect virou AC com PAR de fixtures (AC2):** `lastAssistantMsg` muda de referente e alimenta `isVisitSchedulingMode` e `nameExpected`; ver a cauda deixa o modo agendamento **mais** propenso a ligar, e isso é **consequência aceita** — mexer no gate seria caminho de decisão novo, proibido na Onda 1; o que se faz é medir (AC9-ii), com gatilho de rollback sendo *aumento **com** `M1` subindo*, não o aumento sozinho. **Risco que ninguém tinha nomeado e que eu medi:** com a cauda, `buildNoReintroContext` pode não achar fala da Nicole e ela **se reapresentaria** (regressão da 59-1) — hoje são **0** conversas nessa condição, mas é estrutural, e a correção (uma consulta `count` só quando truncou, na direção **restritiva**) sai de graça junto com o evento `NICOLE_HISTORY_TRUNCATED` da **`M3`** — uma consulta, duas ACs, e **nenhuma** consulta a mais em 87,5% das conversas. Condição de escape da `87-5` **remedida**: **18 de 86 = 20,9%** (contra 20,0% do @po em 07/08) — as duas leituras concordam, o escape **não** dispara, e a ordem `W1-7` depois do `W1-1` fica confirmada por número pela segunda vez. | @sm (River) |
