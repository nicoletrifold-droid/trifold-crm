# Story 87-5 — A Nicole passa a enxergar o corretor: histórico com rótulo de papel

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
· ⚠️ **DEPLOY A EM PRODUÇÃO desde `2026-08-15T17:25:45Z` (PR #426, `6b760887`). NÃO é `Done`:** a AC12
não foi executada, o deploy B não subiu, e a janela de 24 h corre **com instrumentação incompleta**
(A3/A4 abertos). Ver **§ Registro de deploy (@devops)** no fim do arquivo.
**Item do roadmap:** **`W1-7`** (Onda 1, **deploy 4**) — ✅ **já criado pelo @pm no Epic 87 v0.5**,
§7/Onda 1, com `stories_planned: W1-7 → 87-5`. *(A v0.1 desta story dizia "ainda não existe";
conferido pelo @po em 07/08 — existe.)*
**Criada por:** @sm (River) em 2026-08-07, a partir da decisão do Gabriel com dado medido pelo @po
**Formato:** Correção de substrato de **leitura**. **Devolve contexto que já está no banco;
não ensina nada novo.**
**Executor:** @dev · validação em produção: @qa + responsável nomeado (D7)
**Esforço:** **M** (o código é pequeno; **seis consumidores** de `history` mudam de referente, e é
aí que mora o trabalho)
**Risco de regressão em produção:** **Médio/Baixo** — ver a caixa abaixo: a população **histórica**
é de 287 conversas, mas a **viva** é de **9**

> ### 🎯 [@po 07/08] A exposição real, medida — e ela é 32× menor do que o cabeçalho dizia
>
> ```
> conversas com fala de corretor (30 d)          286
> …dessas, ainda com is_ai_active = true            9    ← onde a Nicole VOLTA a ler o histórico
> ```
>
> Em **277 das 286** a Nicole está desligada e **nunca mais vai ler aquele histórico** — a menos que
> a conversa seja reativada. **Isso corta o risco de regressão** (o "Médio" do cabeçalho estava
> superdimensionado) **e cobra um preço na AC12**: o cenário de reativação acontece **7 vezes em 30
> dias = 0,23/dia**, então uma janela de observação de **24 h tem ~21 % de chance de produzir um
> caso**. Uma AC que espera um evento que provavelmente não acontece na janela não é validação — é
> torcida. Ver **AC12**.

> ## O buraco, medido
>
> **A fala do corretor É gravada.** `messages.role = 'broker'` existe desde a migration 001
> (`001_base_schema.sql:175`). É o **maior volume dos três**:
>
> | papel | mensagens (30 dias) | conversas |
> |---|---|---|
> | **`broker`** | **882** | **287** |
> | `user` | 867 | 181 |
> | `assistant` | 612 | 136 |
>
> **E dois leitores a descartam**, com o mesmo `.in("role", ["user","assistant"])`:
>
> ```ts
> // packages/ai/src/chat/pipeline.ts:1543  — loadConversationHistory
> .select("role, content").in("role", ["user", "assistant"])
> // packages/web/src/app/api/cron/enrich-leads/route.ts:66
> .select("role, content").in("role", ["user", "assistant"])
> ```
>
> **O corretor fala mais que a Nicole, no dobro de conversas, e nem ela nem o extrator de dados
> enxergam uma linha disso.**
>
> **Dano medido:** **9 conversas** tiveram o corretor falando e a Nicole voltando a responder
> depois — **31 respostas dela**, cegas para a negociação já em curso. É o cenário de **reativação**,
> o mais caro que existe: lead em negociação avançada e ela retomando sem saber o que foi combinado.

---

## Story

**Como** engenharia da Trifold, que descobriu que o interlocutor de maior volume da conversa é
invisível para a Nicole e para o extrator de dados,
**Queremos** que o histórico carregue **também** a fala do corretor humano, **identificada como
tal**,
**Para que** ela pare de retomar uma negociação avançada como se nada tivesse acontecido — e para
que ela nunca repita, como se fosse dela, um valor que só o corretor podia dizer.

---

## Context — três defeitos, e os dois primeiros são a mesma raiz

### Defeito 1 — o corretor é invisível (o buraco de leitura)

Já medido no bloco de abertura. `loadConversationHistory` (`pipeline.ts:1534-1553`) filtra
`role IN ('user','assistant')`. As 882 mensagens do corretor não entram no `history`, e portanto não
entram em **nenhum** dos seis consumidores mapeados abaixo.

### Defeito 2 — a fala humana de transição já entra, e ela lê como se fosse DELA

```ts
// packages/web/src/app/api/leads/[id]/send-message/route.ts:210-222
await db.from("messages").insert({
  role: "assistant",                      // ← linha 214: fala do CORRETOR, humana
  content: transitionText,
  metadata: { is_transition: true, broker_id: appUser.id, ... },
})
```

A fala de transição do handoff — **escrita por humano** — é gravada como `role: "assistant"`.
E `loadConversationHistory` **seleciona só `role, content`**: o `metadata.is_transition` **não
chega**. Resultado: **a Nicole já lê algumas falas humanas achando que são dela** — 104 mensagens
no período de 60 dias medido pelo @po.

> **É a mesma raiz do Defeito 1: o carregador de histórico não sabe quem falou.**
> Um devolve papel demais (o `assistant` cobre dois autores), o outro devolve papel de menos (o
> `broker` é jogado fora). **O rótulo resolve os dois de uma vez, e por isso eles vêm juntos.**
> O defeito **de origem** (fala humana gravada como `role='assistant'`) é decisão de modelo de dados,
> tem raio muito maior, e está aberto em `docs/backlog.md` desde 07/08. Esta story **contorna** com
> normalização na leitura — e o item de backlog continua valendo.

### Defeito 3 — o corretor pode dizer o que a Nicole não pode

**Este é o motivo pelo qual o rótulo é obrigatório e não é preciosismo.**

A Nicole tem guardrails que o corretor **não** tem. Ele pode falar valor fechado, desconto, condição
de pagamento. **Medido:** o **Odair** falou *"entrada de 35 mil"* na conversa da Sandra.

Sem rótulo, ela lê isso como contexto indistinto — e a mensagem chega à API da Anthropic **com
`role: "assistant"`**, ou seja, **como turno anterior dela mesma**. O modelo pode repetir o número,
violando a **RN4** ("não enviar tabelas de preço exatas") com um valor que *"estava na conversa"* e
que ela nunca teria produzido sozinha.

> **A instrução tem de ser explícita:** ela usa a fala do corretor como contexto **do que já foi
> tratado**, e **nunca repete valor, desconto ou condição dita por ele**. Ver **AC5**.

---

## Recomendação de escopo — **story própria, NÃO fundir no `W1-1`**

> O @architect escreveu que o `W1-1` precisa de *"uma decisão escrita sobre as mensagens de
> `role='broker'`"*. **Esta story É essa decisão** — e a decisão escrita é: *elas entram, rotuladas,
> num item próprio, depois do `W1-1`.*

**A favor de fundir (o argumento é real):** evita abrir o mesmo arquivo duas vezes e trata
`lastAssistantMsg` de uma vez só.

**Por que eu recomendo separar mesmo assim — quatro razões, em ordem de peso:**

**1. O arquivo é o mesmo; a mudança não é.** O `W1-1` mexe no `.order()`/`.limit()` de
`loadConversationHistory` — **uma linha**, alcance medido de **7,3% dos turnos**. Esta story mexe no
`.in("role", …)` e no `.select()` **da mesma função** — e mais o mapeamento da linha 925, o
`buildNoReintroContext`, o `lastAssistantMsg`, o `generateHandoffSummary` e um cron em **outro
pacote**. A interseção é uma função de 18 linhas. A diferença são cinco consumidores e um cron.
**Fundido, o `W1-1` deixa de ser o XS que o epic promete e o deploy 3 vira o maior da Onda 1.**

**2. Fundir ATRASA a que dói mais.** O `W1-1` depende de `W0-3` **e** de `W1-3b em produção`, e é
explicitamente o **deploy 3** da onda. O dano desta story — 31 respostas cegas em negociação
avançada — não tem razão nenhuma para esperar o `W1-3b`. Fundir carrega a story do corretor para
trás de uma fila inteira que não é dela.

**3. Um fix de substrato por deploy — a regra do próprio epic (§6, item 4).** Se as duas subirem
juntas e a **M1**/**M2** mexer, ninguém sabe se foi a cauda ou o corretor. As duas mudam o mesmo
`history`, em eixos diferentes (**quantas** mensagens × **quais papéis**). É o cenário exato que a
regra existe para impedir.

**4. O `lastAssistantMsg` é tratado uma vez só — e não é fundindo.** Concordo com a metade do
argumento: ele **não pode** ser tratado duas vezes. Mas a conclusão certa é **ordenar**, não fundir:
o `W1-1` já carrega a AC que o @architect exigiu sobre o referente dele (mudança de **janela**);
esta story carrega a AC sobre o **papel** (AC3). Cada deploy, uma variável, e o `lastAssistantMsg`
com um teste em cada eixo.

### Ordem recomendada: **depois do `W1-1` — deploy 4 da Onda 1**

E aqui o argumento é técnico, não de processo:

> Com o histórico ainda em **cabeça-20** (o `HEAD` de hoje), acrescentar ~3 mensagens de corretor por
> conversa **come o orçamento de 20** e empurra para fora justamente as mensagens mais recentes que
> já eram poucas. Com o `W1-1` em produção, o histórico é **cauda-20** — e *"as últimas 20 falas de
> quem quer que seja"* é exatamente a janela coerente quando existem **três** interlocutores.
> **Esta story fica estritamente melhor depois do `W1-1`, e o `W1-1` fica estritamente mais simples
> antes dela.**

**Condição de escape, medível (para o time não ficar refém da fila):** se a **T0** mostrar que menos
de **10%** das conversas **da população definida abaixo** passam de 20 mensagens, o efeito da janela é
desprezível e esta story **pode** subir antes do `W1-1` — desde que ainda sozinha, e desde que o
`W1-1` receba a AC de que o referente do `lastAssistantMsg` **já** está blindado por esta. Decisão a
registrar por escrito no Dev Agent Record, com o número.

> ### 🔴 [@po 07/08] O DENOMINADOR desta regra não estava declarado — e as leituras caem dos dois
> lados do limiar
>
> *"Conversas ativas"* admite quatro leituras. O @po mediu as quatro contra 30 dias de produção:
>
> | população | convs | acima de 20 msgs | % | escape dispara? |
> |---|---|---|---|---|
> | todas as conversas com atividade | 338 | 30 | **8,9 %** | ✅ sim |
> | só as que têm corretor | 286 | 24 | **8,4 %** | ✅ sim |
> | só as que têm Nicole ativa | 136 | 23 | **16,9 %** | ❌ não |
> | **as que têm Nicole E corretor** — *a população que esta story muda* | **85** | **17** | **20,0 %** | ❌ **não, com folga** |
>
> **Duas leituras liberam a fila e duas a mantêm, e as que a mantêm são as certas.** A janela só é
> disputada onde existem **os dois** interlocutores; nas 253 conversas sem Nicole ativa o `limit(20)`
> não é lido por ninguém. **Denominador declarado, e ele é AC da T0: conversas com mensagem
> `assistant` E mensagem `broker` nos últimos 30 dias.** Medido hoje: **20,0 % — o dobro do limiar.**
> **A condição de escape NÃO dispara, e a ordem "depois do `W1-1`" fica confirmada por número.**
> *(Isto é a mesma classe de defeito que o @po apontou na Story 87-3, causa (a) do bloco de
> calibração: uma régua percentual sem denominador declarado é uma régua que responde o que quiserem
> perguntar. Média de falas do corretor nessas 85 conversas: **4,2**.)*
> 📌 **Ação para o @pm:** a mesma condição de escape está no **Epic 87, §7/Onda 1**, com o mesmo
> denominador implícito. Precisa da mesma declaração, senão o epic autoriza o que a story proíbe.

### Cabe na Onda 1? **Sim — com uma condição, e ela é a espinha da story**

A regra de corte da Onda 1 é *"nenhuma story pode adicionar um novo caminho de decisão da Nicole"*.

**O rótulo em si é subtração:** devolve contexto que já existe no banco e **remove** a ambiguidade de
autoria que hoje existe. Mas **dois dos seis consumidores viram mudança de decisão se ficarem
intocados** — `lastAssistantMsg` (que alimenta o gate de agendamento) e `buildNoReintroContext`.
**A story só é Onda 1 porque fixa esses dois na direção RESTRITIVA** (menos coisas contam como fala
da Nicole), nunca permissiva. Ver AC3 e AC4.

> ### ✅ Ação do @pm — **FEITA** (Epic 87 v0.5, conferido pelo @po em 07/08)
> O `W1-7` **entrou** na tabela da Onda 1 (§7) como *"Histórico passa a incluir a fala do CORRETOR,
> rotulada por papel — **deploy 4**"*, com `Depende de: W1-1 em prod`, Esforço **M**, Risco
> **Médio / Baixo**, Executor **@dev**, e `stories_planned: W1-7 → 87-5`. A nota do `W1-1` já aponta
> para cá, e a recomendação anterior do @architect (*"continuar cega ao corretor"*) está registrada
> como **superada**.
> **Resta UMA edição (P1 do @po):** a **condição de escape** do `W1-7` no epic precisa do
> **denominador declarado** — *"conversas com mensagem `assistant` E `broker` nos últimos 30 dias"*
> —, senão o epic autoriza, com o mesmo número, o que esta story proíbe. Ver a caixa da condição de
> escape acima.
>
> <details><summary>Texto original da v0.1 (o pedido, já atendido)</summary>
>
> O `W1-7` **não existe** no Epic 87. Precisa entrar na tabela da Onda 1 (§7) como
> *"Histórico passa a incluir a fala do corretor, rotulada — **deploy 4**"*, resolvendo **CR-1**
> (parcialmente) e o defeito de leitura do `role='broker'`, com `Depende de: W1-1 em prod`,
> Esforço **M**, Risco **Médio/Baixo** (regressão / comportamento novo), Executor **@dev** — e o
> `stories_planned` recebendo `W1-7 → 87-5`. **A nota do @architect sobre o `W1-1`** (*"precisa de
> uma decisão escrita sobre as mensagens de `role='broker'`"*) passa a apontar para cá.
> </details>

---

## Desenho

### 1. A restrição dura que decide o desenho inteiro

```ts
// packages/ai/src/chat/pipeline.ts:924-931 — o histórico vai DIRETO para a API
const messages: Anthropic.MessageParam[] = [
  ...history.map((msg): Anthropic.MessageParam => ({ role: msg.role, content: msg.content })),
  { role: "user", content: userContent },
]
```

**`Anthropic.MessageParam.role` só aceita `"user" | "assistant"`.** Não existe terceiro papel na API.

> ### A decisão: **papel interno ≠ papel da API. Duas representações, uma fronteira.**
>
> | camada | representação | por quê |
> |---|---|---|
> | **interna** (`Message`) | `role: "user" \| "assistant" \| "broker"` | os seis consumidores **precisam** distinguir; e o `type-check` vira o instrumento que encontra todos eles |
> | **fronteira da API** (linha 925) | `role: "assistant"`, `content` **prefixado com rótulo textual** | é a única forma que a API aceita, e mantém o corretor do **nosso** lado da conversa |

**Por que `assistant` e não `user` na fronteira:** mapear a fala do corretor para `user` faria a
Nicole acreditar que **o lead** disse *"entrada de 35 mil"* — que é estritamente pior que ela achar
que foi ela. O rótulo textual + a instrução (AC5) são o que impede a imitação.

> **Alargar o tipo `Message` (`pipeline.ts:241-244`) é o coração da entrega**, e não é burocracia:
> `npm run type-check` passa a **falhar em todo lugar que assume dois papéis**. É o mapa de
> consumidores se desenhando sozinho, em vez de depender de `grep`. Ver **AC6**.

### 2. O carregador — um lugar, três papéis, e a normalização do Defeito 2

```
loadConversationHistory(supabase, conversationId, limit = 20)

  .select("role, content, metadata")                    // ← metadata passa a vir
  .in("role", ["user", "assistant", "broker"])          // ← o corretor entra

  normalização (na leitura, antes de devolver):
    role === "assistant" && metadata?.is_transition === true   →   role: "broker"
```

**A normalização fecha o Defeito 2 sem tocar em `send-message/route.ts`.** A gravação continua como
está (o conserto de origem é o item de backlog, de raio maior); o **leitor** deixa de ser enganado.

> **Uma função, uma regra.** Se o `enrich-leads` reimplementar o filtro, o próximo defeito volta
> pela metade — que é a lição documentada da 75-268 (guarda aplicada a um caminho e não ao outro).
> Ver **T2** e **AC7**.

### 3. O rótulo textual — formato fechado, para não ser inventado na implementação

```
[CORRETOR HUMANO — {primeiro_nome}]: {content}
```

- `{primeiro_nome}` sai — **nesta ordem** — de:
  1. **`metadata.signed_as`** (já é o primeiro nome, gravado por `send-message/route.ts:272`
     via `senderFirstName(appUser.name)`) — **sem consulta nenhuma**;
  2. `metadata.sent_by` → `users.name` (exige uma consulta a mais, ver a caixa);
  3. `metadata.broker_id` → `users.name` — **só nas mensagens de transição normalizadas**;
  4. fallback `[CORRETOR HUMANO]`. **Nunca** falhar a conversa por causa do nome.

> ### 🔴 [@po 07/08] A v0.1 mandava ler `metadata.broker_id`, e ele existe em ZERO das 900
>
> ```
> mensagens role='broker' (30 d)                          900
>   com metadata.sent_by                                  795   (88 %)
>   com metadata.signed_as   ← já é o PRIMEIRO NOME        428   (48 %)
>   com metadata.broker_id                                  0   ← o campo que a v0.1 mandava usar
>   sem metadata nenhum                                     0
>   conteúdo-placeholder ([Arquivo]/[Mídia]/[Áudio])      105   (12 %)
>
> mensagens de TRANSIÇÃO (role='assistant', is_transition) 104
>   com metadata.broker_id                                104   (100 %)  ← é o ÚNICO lugar onde ele existe
> ```
>
> `broker_id` só é gravado no insert da transição (`send-message/route.ts:217`). As mensagens reais do
> corretor — as 900 que esta story existe para trazer — usam **`sent_by`** e, quase metade delas,
> **`signed_as`, que já é o primeiro nome pronto**. Com a regra da v0.1, **o nome sairia vazio nas 900
> e o rótulo cairia em `[CORRETOR HUMANO]` em 100 % dos casos, em silêncio** — falha silenciosa dentro
> de uma story cujo tema é não errar em silêncio.
>
> ⚠️ **E há um custo de consulta que o desenho não orçava:** `loadConversationHistory` lê **só**
> `messages`. Resolver `sent_by → users.name` exige uma **segunda consulta** (um `in` sobre os
> `sent_by` distintos do lote — não um por mensagem). **Decisão desta story, para o executor não
> inventar:** usar `signed_as` quando houver, `sent_by → users.name` numa **única** consulta em lote
> quando não houver, e `[CORRETOR HUMANO]` sem nome no resto. **Um `N+1` aqui é regressão de latência
> no caminho quente do turno.**
>
> 📌 **Decisão pendente, barata, a registrar na T0:** as **105** mensagens-placeholder
> (`[Arquivo] contrato.pdf`, `[Mídia] …`, `[Áudio]`) não carregam informação de negociação e **comem
> o orçamento de 20**. Filtrá-las é **subtração** e cabe na Onda 1. Decidir por escrito — incluir ou
> filtrar — e não deixar para o implementador.
- O rótulo é montado **na fronteira da API** (linha 925), **não** persistido em `messages`.
- **O rótulo nunca sai na resposta ao lead.** Ver AC5-(iii).

### 4. Os seis consumidores de `history` — o que acontece com cada um

Levantados no código de `HEAD` (`grep -n "history" packages/ai/src/chat/pipeline.ts`):

| # | consumidor | linha | com o corretor entrando | decisão |
|---|---|---|---|---|
| 1 | **`buildNoReintroContext`** | 642 → 222-225 (`history.some(role === "assistant")`) | hoje conta Nicole **+ as 104 transições humanas**. Com a normalização, as transições saem de `assistant` | **passa a contar `assistant` OU `broker`** — "o nosso lado já falou com este lead". **AC4** |
| 2 | **`lastAssistantMsg`** | 709-711 (`.reverse().find(role === "assistant")`) | alimenta `isVisitSchedulingMode` (846) **e** `nameExpected` (1082-1086) | **fica RESTRITO à Nicole** — `broker` nunca é `lastAssistantMsg`. Isso **corrige** as 104 transições que hoje ligam o gate por fala humana. **AC3** |
| 3 | **payload da Anthropic** | 924-931 | precisa do mapeamento da fronteira | rótulo textual + `role: "assistant"`. **AC1, AC5** |
| 4 | **`generateHandoffSummary`** | 1122-1129 | o resumo passa a ver a fala do corretor | **entra** — o resumo é **para** o corretor. Mas **não pode atribuir a fala dele à Nicole**. **AC8** |
| 5 | **identificação de imóvel por contexto** | 1150-1158 (`[message, ...history.map(content)].join`) | preenche `property_interest_id` **quando vazio** | 🛑 **FICA COMO ESTÁ (`user` + `assistant` apenas).** Deixar a fala do corretor preencher `property_interest_id` é **caminho de decisão novo** — proibido na Onda 1. **AC9**, com o `TODO` nomeado para uma onda posterior |
| 6 | **`enrich-leads` (cron, outro pacote)** | `route.ts:66` | o extrator Haiku passa a ver a negociação real | **entra — mas em DEPLOY PRÓPRIO**, ver §5 |

### 5. Dois deploys, uma story — e a razão de não serem duas stories

| | deploy | o quê | por que separado |
|---|---|---|---|
| **A** | 1º | `loadConversationHistory` + os consumidores 1-5 (a **leitura da Nicole**) | é o dano medido: 31 respostas cegas |
| **B** | 2º, ≥24 h depois | `enrich-leads` adota o **mesmo carregador** (consumidor 6) | muda o que o sistema **acredita** sobre o lead, e escreve em `collected_data`/`leads` |

**Por que B é deploy separado e não escopo à parte:** ele muda o que o extrator vê, e o extrator
escreve campos que **alimentam gates** — o *"entrada de 35 mil"* do Odair pode virar
`has_down_payment: true` sem o lead ter dito nada. Isso não é leitura: é crença. Merece 24 h de
observação sozinho.

**Por que B fica NESTA story e não vira uma terceira:** ele consome **o mesmo artefato** (o
carregador rotulado). Numa story separada, ou o artefato é duplicado, ou a story vira "adotar o
carregador da 87-5" — que é uma linha e um deploy, não uma story.

> ⚠️ **O deploy B depende da Story 87-4 em produção.** A 87-4 muda exatamente o merge do
> `enrich-leads` (`route.ts:150`, filtro das chaves de agenda, AC8-b). Subir os dois no mesmo trecho
> em janelas cruzadas é pedir para não saber qual mexeu no quê.

---

## Acceptance Criteria

> Toda AC diz **como se verifica**, e toda AC de regressão exige o **vermelho colado**.

**AC1 — A fala do corretor chega à Nicole, rotulada.**
`loadConversationHistory` devolve as mensagens `role='broker'`, e a fronteira da API as envia como
`role: "assistant"` com o `content` prefixado por `[CORRETOR HUMANO — {nome}]: `.
*Verifica-se:* teste com `createFakeSupabase` (harness da 75-279 — **usar, não recriar**) semeando
uma conversa `user → assistant → broker → user`, e afirmando que o array `messages` enviado ao
`fakeAnthropic` contém **4** entradas e que a terceira começa com `[CORRETOR HUMANO`.
**Vermelho contra o `HEAD`:** hoje o array tem **3** entradas e a do corretor não existe. Colar os
dois.

**AC2 — A transição humana deixa de ser lida como fala da Nicole.**
Mensagem com `role='assistant'` **e** `metadata.is_transition === true` é normalizada para
`role: "broker"` na leitura.
*Verifica-se:* (i) teste com essa fixture exata afirmando `history[i].role === "broker"`;
(ii) **vermelho contra o `HEAD`**: hoje ela volta como `"assistant"` — e, pior, o `metadata` nem é
selecionado (`select("role, content")`), então **não há como distinguir**. Colar os dois.
> **A gravação em `send-message/route.ts:214` NÃO é tocada.** O conserto de origem é decisão de
> modelo de dados, está em `docs/backlog.md` desde 07/08, e tem raio muito maior que esta story.

**AC3 — 🔴 O gate de agendamento NÃO liga por fala humana.**
`lastAssistantMsg` (`pipeline.ts:709-711`) passa a encontrar **apenas** a última fala da **Nicole** —
`broker` (inclusive transição normalizada) **nunca** é `lastAssistantMsg`.
*Verifica-se, três vias obrigatórias:*
- (i) teste em que a **última** mensagem do histórico é do corretor contendo *"que tal sábado às
  10h?"* e a anterior da Nicole é um texto neutro: `isVisitSchedulingMode` recebe o texto **da
  Nicole**, e o modo agendamento **não** liga por causa da fala do corretor;
- (ii) o mesmo para `nameExpected` (`pipeline.ts:1082-1086`): pergunta de nome **feita pelo
  corretor** não faz a extração aceitar resposta curta em minúsculas como nome;
- (iii) **o vermelho:** mapeando `broker` para `"assistant"` também no tipo interno, os dois testes
  acima falham. É o que prova que a distinção existe onde importa.
> **Esta AC é a razão de a story caber na Onda 1.** A direção é **restritiva** — menos coisas contam
> como fala da Nicole do que hoje. Se em algum ponto a fala do corretor **ligar** um gate que hoje
> está desligado, isso é caminho de decisão novo e **a story está errada ali**.

**AC4 — `buildNoReintroContext` conta "o nosso lado já falou", com a decisão escrita.**
Passa a devolver a instrução de não-reapresentação quando existe mensagem `assistant` **ou**
`broker` no histórico.
*Verifica-se:* (i) teste com histórico **só de corretor** + lead: a instrução **aparece**;
(ii) teste de não-regressão: histórico com fala da Nicole continua produzindo a mesma string,
**byte a byte**.
> **Decisão registrada por escrito, com a direção justificada:** um lead que trocou 20 mensagens com
> o corretor **não pode** ouvir *"Sou a Nicole, da Trifold Engenharia"* como se fosse primeiro
> contato. **Suprimir uma apresentação indevida nunca causa dano; produzir uma causa constrangimento
> e sinaliza ao lead que ninguém ali sabe o que está acontecendo.** A direção da mudança é a
> conservadora.

**AC5 — 🔴 A Nicole nunca repete valor dito pelo corretor. [RN4]**
O `dynamicSuffix` do system prompt ganha instrução explícita, **acionada apenas quando há fala de
corretor no histórico**:
> *"Mensagens marcadas com `[CORRETOR HUMANO]` foram escritas por um corretor da equipe, NÃO por
> você. Use-as apenas para saber o que já foi tratado com o cliente. NUNCA repita, confirme nem
> reformule valor, preço, desconto, entrada ou condição de pagamento que apareça numa mensagem
> `[CORRETOR HUMANO]` — se o cliente perguntar sobre isso, diga que o corretor responsável confirma
> os detalhes."*

*Verifica-se, três vias:*
- (i) **a fixture do Odair, literal:** histórico com `[CORRETOR HUMANO — Odair]: … entrada de 35
  mil …` e o lead perguntando *"qual era mesmo o valor da entrada?"*. A resposta da Nicole **não
  contém `35`** nem variação por extenso. **Rodar contra o `HEAD` com o corretor incluído SEM a
  instrução: ela repete.** Colar o vermelho — *é o vermelho mais importante desta story*;
- (ii) a instrução **não** entra no bloco estático cacheável (é por-conversa) — vai no
  `dynamicSuffix`, junto com os demais contextos;
- (iii) **o rótulo nunca vaza:** a resposta da Nicole não contém a string `[CORRETOR HUMANO`
  em nenhuma das fixtures. Se vazar, é falha bloqueante — o lead não pode ver marcação interna.

**AC6 — 🔴 O tipo AJUDA a encontrar consumidores; ele NÃO é o mapa. [reescrita pelo @po, medida]**

> ### O @po rodou o alargamento antes de aprovar a AC. Ele acha **1 dos 6**, não 6.
>
> Réplica isolada das seis formas exatas do `HEAD`, com `Message.role` já alargado, sob
> `tsc --strict`. **Saída completa: um erro.**
>
> ```
> error TS2322: Type '"user" | "assistant" | "broker"' is not assignable to type '"user" | "assistant"'
>   → pipeline.ts:927  role: msg.role   (a fronteira da Anthropic)   ← o ÚNICO
> ```
>
> Os outros cinco são **invisíveis ao `type-check`**, e a razão está escrita no código de hoje:
>
> | # | consumidor | por que NÃO acende |
> |---|---|---|
> | 1 | `buildNoReintroContext` | o parâmetro é `Array<{ role: string }>` (linha 223) — `string` aceita qualquer papel |
> | 2 | **`lastAssistantMsg`** | `(m as { role?: string })` — **cast explícito** na linha 710 |
> | 4 | `generateHandoffSummary` | `HandoffMessage.role: string` (`handoff.ts:19`) |
> | 5 | identificação de imóvel | `(m as { content?: string })` — cast na linha 1157 |
> | 6 | `enrich-leads` | outro pacote, consulta própria, **não usa o tipo `Message`** |
>
> **E o pior deles não acende de jeito nenhum.** O @po mediu a variante: **mesmo removendo o cast da
> linha 710**, `.find((m) => m.role === "assistant")` **continua sem erro** — comparar um union mais
> largo com um literal é TypeScript válido. **O `lastAssistantMsg` — o consumidor que alimenta o gate
> de agendamento, o que a AC3 existe para proteger — é invisível ao `type-check` em qualquer
> variante.** Uma AC que diz *"a lista de erros é o mapa e precisa bater com os seis"* é, como estava,
> **inexequível**; e a mitigação do Risco 8 (*"o `type-check` é o localizador"*) era **vazia**.

`Message.role` (`pipeline.ts:241-244`) passa a ser `"user" | "assistant" | "broker"`.

*Verifica-se, quatro vias:*
- (i) **o mapa primário é o `grep`, e ele é AC:** `grep -n "history" packages/ai/src/chat/pipeline.ts`
  + `grep -rn "loadConversationHistory\|HandoffMessage" packages/` — a lista resultante vai colada e
  conferida contra os **seis** do Desenho §4. **Um sétimo é achado e vai para a story.**
- (ii) **o `type-check` vira uma rede SECUNDÁRIA, e ela é apertada de propósito** — duas subtrações,
  as duas medidas como eficazes pelo @po:
  - **estreitar** `buildNoReintroContext(history: Array<{ role: Message["role"] }>)` e
    `HandoffMessage.role: Message["role"]` (medido: passa a acender, `TS2345`);
  - **remover os dois casts** das linhas 710 e 1157 (`as { role?: string }`, `as { content?: string }`),
    que hoje só existem para calar o compilador. **Isso é subtração** — não fere a regra de corte.
- (iii) colar no Dev Agent Record a lista de erros **antes** e **depois** dessas duas subtrações, com
  a contagem de cada uma. *(Referência do @po: **1 erro** antes; as duas subtrações acendem os
  consumidores 1 e 4.)*
- (iv) **os que o compilador NÃO pega ficam nomeados por escrito** na story, com o motivo — hoje:
  `lastAssistantMsg` (comparação, não atribuição) e `enrich-leads` (outro pacote). **Esses dois só
  têm teste como rede**, e são exatamente AC3 e AC7. Escrever isso é a diferença entre saber onde a
  rede tem buraco e achar que não tem buraco.

**AC7 — Um carregador, não dois.**
O `enrich-leads` (deploy B) usa **a mesma** função de carregamento, com a mesma normalização.
*Verifica-se:* `grep -rn '\.in("role"' packages/ai/src packages/web/src` devolve **uma** ocorrência de
lista de papéis para histórico de conversa. Se devolver duas, a regra está aplicada pela metade — que
é exatamente a lição documentada da 75-268.
> 🔧 **[@po] Passo que a story não nomeava e sem o qual esta AC não fecha:**
> `loadConversationHistory` é **função privada** de `pipeline.ts` (linha 1534) — **não é exportada**
> por `chat/index.ts` nem por `packages/ai/src/index.ts`. O `enrich-leads` vive em
> `packages/web`. Para o deploy B usar *a mesma* função, ela precisa ser **exportada** de
> `@trifold/ai` (mesma manobra que a **AC7 da Story 87-3** faz com a `detectAffirmedSlot`).
> **Entra na T2**, junto com a mudança do carregador — não no fim, na T9. E vale conferir o ciclo de
> import na mesma passada, que é o motivo pelo qual a 87-3 precisou mover a função de arquivo.
> *(Hoje `grep '\.in("role"' packages/ai/src packages/web/src` devolve **2** ocorrências de histórico
> de conversa: `pipeline.ts:1543` e `enrich-leads/route.ts:66`. As demais 14 ocorrências são filtros
> de `users.role` e não contam — dizer isso aqui evita que o @dev tente "consertar" 16 lugares.)*

**AC8 — [reescrita pelo @po] O resumo de handoff é NÃO-REGRESSÃO, não conserto.**

> ### A premissa da v0.1 estava errada, e o @po conferiu o código
>
> `generateHandoffSummary` (`handoff.ts:115-157`) **nunca imprime fala da Nicole.** A única seção que
> cita mensagens é `MENSAGENS DO LEAD`, e ela filtra:
>
> ```ts
> // handoff.ts:141
> const userMessages = messages.filter((m) => m.role === "user")
> ```
>
> Ou seja: *"o resumo pode atribuir ao robô o que o humano disse"* **não pode acontecer** — o resumo
> descarta tudo que não é `user`. **O efeito real de deixar o corretor entrar é outro e é menor:**
> `TOTAL DE MENSAGENS` (linha 154) passa a contar as falas dele.
> **E a "correção mínima" que a v0.1 propunha — *"o resumo passa a marcar o autor"* — seria
> ACRESCENTAR conteúdo ao resumo do handoff, ou seja, comportamento novo na Onda 1.** Fora de escopo
> por definição.

*Verifica-se:*
- (i) **não-regressão:** teste em que o corretor disse *"entrada de 35 mil"* e a Nicole não — a seção
  `MENSAGENS DO LEAD` do resumo sai **idêntica** à do `HEAD`, e a frase do corretor **não** aparece
  nela (ele não é `user`, e mapeá-lo para `user` é o que o Desenho §1 proíbe);
- (ii) `TOTAL DE MENSAGENS` passa a incluir a fala do corretor — **é a única diferença aceita**, e ela
  vai declarada no Dev Agent Record com o antes e o depois de uma fixture;
- (iii) **rotular o autor dentro do resumo fica FORA desta story.** Se o time quiser, é item de onda
  posterior — anotar em `docs/backlog.md`, não implementar aqui.

**AC9 — Nenhum caminho de decisão novo, e os que ficaram de fora estão nomeados.**
A identificação de imóvel por contexto (`pipeline.ts:1150-1158`) **continua** montando a string só
com `message` + `user`/`assistant`.
*Verifica-se:* (i) teste em que o **corretor** menciona um empreendimento e o lead nunca:
`contextPropertyId` continua **`null`** — igual ao `HEAD`; (ii) comentário no código nomeando o item
como candidato de onda posterior.
> **Por que não agora:** deixar a fala do corretor preencher `property_interest_id` faz o sistema
> **passar a acreditar** em algo que hoje não acredita. É caminho de decisão novo, e a regra de corte
> da Onda 1 o proíbe — **mesmo sendo provavelmente a coisa certa a fazer.** É a mesma disciplina que
> manteve o `detect-appointment.ts:71` fora da 87-4.

**AC10 — Turno-ouro: nada muda quando não há corretor na conversa.**
Para uma conversa **sem nenhuma** mensagem `broker` e **sem** transição, o `messageWithContext`, o
`dynamicSuffix` e o array `messages` são **idênticos** aos do `HEAD`.
*Verifica-se:* teste de snapshot em 3 turnos (primeira mensagem · meio de qualificação · pedido de
visita), comparando com a saída do `HEAD`. **Qualquer diferença de texto é achado bloqueante:** são
136 conversas com Nicole e 287 com corretor — a maioria dos turnos dela **não** tem corretor
nenhum, e essa maioria não pode sentir a story.

**AC11 — Sem regressão.**
*Verifica-se:* `npx vitest run` verde — incluindo `pipeline.test.ts`, `pipeline-scheduling.test.ts`,
`pipeline-broker-guard.test.ts` e `visit-slot.test.ts` — e `npm run type-check` sem erro novo.
Teste existente que mudar de forma precisa de **justificativa escrita por teste**.
> **Não há AC de lint para `packages/ai`:** o pacote não tem eslint configurado (o config vive em
> `packages/web`). Para os arquivos de `packages/web` desta story, `npm run lint` sem erro novo.

**AC12 — Validação em produção, com dono e janela (D7), em DOIS tempos.**
- **Deploy A**, 24 h, responsável nomeado (Marcos ou Thielly): (i) **um caso de reativação
  EXERCITADO, não esperado** — ver a caixa; (ii) **zero** ocorrências de valor do corretor repetido
  por ela (busca textual nas respostas do período); (iii) `M1` e `M4` medidos **pela rotina da Story
  87-3**, sem aumento.
  > 🔴 **[@po 07/08] Esperar o caso acontecer em 24 h é torcida, não validação.** Medido: o cenário
  > de reativação ocorre **7 vezes em 30 dias (0,23/dia)**, e só **9** das 286 conversas com corretor
  > ainda têm `is_ai_active = true`. **A chance de a janela de 24 h produzir um caso espontâneo é de
  > ~21 %.** A AC12-(i) passa a ser: **provocar** o cenário com telefone de teste — conversa com fala
  > de corretor, IA reativada, lead volta a escrever — e colar o turno com horário, **exatamente como
  > a AC10 da Story 87-4 faz**. O acompanhamento das 9 conversas vivas continua, como observação
  > complementar; ele não é o que fecha a AC.
- **Deploy B**, +24 h: (iv) amostra de 5 leads enriquecidos após o deploy, conferindo que nenhum
  campo foi preenchido a partir de fala do corretor **sem** o lead ter confirmado — em especial
  `has_down_payment`, que é o caso do *"entrada de 35 mil"*.

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/chat/pipeline.ts` | **1534-1553** | `loadConversationHistory` — o coração desta story |
| ↳ | 1541 | `.select("role, content")` — o `metadata` que falta |
| ↳ | 1542 | `.in("role", ["user", "assistant"])` — o filtro que apaga o corretor |
| `packages/ai/src/chat/pipeline.ts` | 241-244 | `interface Message` — o tipo a alargar (AC6) |
| `packages/ai/src/chat/pipeline.ts` | 222-225 | `buildNoReintroContext` (AC4) |
| `packages/ai/src/chat/pipeline.ts` | 642 | onde ela é chamada |
| `packages/ai/src/chat/pipeline.ts` | **709-711** | `lastAssistantMsg` — o acoplamento crítico (AC3) |
| ↳ | 846 | consumido por `isVisitSchedulingMode` |
| ↳ | 1082-1086 | consumido por `nameExpected` |
| `packages/ai/src/chat/pipeline.ts` | **924-931** | a fronteira da API — onde o rótulo é montado |
| `packages/ai/src/chat/pipeline.ts` | 1122-1129 | `generateHandoffSummary` (AC8) |
| `packages/ai/src/chat/pipeline.ts` | 1150-1158 | identificação de imóvel — **NÃO mexer** (AC9) |
| `packages/ai/src/chat/__fixtures__/fake-supabase.ts` | 1-223 | harness da 75-279 — **usar, não recriar** |
| `packages/ai/src/chat/pipeline-scheduling.test.ts` | 1-170 | modelo de teste fim a fim com `fakeAnthropic` |
| `packages/web/src/app/api/cron/enrich-leads/route.ts` | **66** | o segundo filtro (deploy B) |
| `packages/web/src/app/api/leads/[id]/send-message/route.ts` | 210-222 | a gravação da transição — **NÃO tocar** |
| `supabase/migrations/001_base_schema.sql` | 172-181 | `messages.role` é `varchar(20)` **sem CHECK**; o comentário já lista `'broker'` |

### Armadilhas

1. **`Anthropic.MessageParam` não aceita um terceiro papel.** Papel interno ≠ papel da API
   (Desenho §1). Quem tentar `role: "broker"` no payload recebe erro de tipo — e é bom que receba.
2. **Sem migration.** `messages.role` é `varchar(20)` **sem CHECK** e `'broker'` já é gravado em
   produção (882 em 30 dias). **Nada de DDL nesta story.**
3. **Não mexer no `send-message/route.ts`.** A gravação da transição como `role='assistant'` é
   defeito de origem, com raio muito maior (histórico, extração e instrumentação), e está em
   `docs/backlog.md`. Esta story **normaliza na leitura**; o item de backlog continua aberto.
4. **Não subir junto com o `W1-1`.** As duas mudam o mesmo `history` em eixos diferentes (janela ×
   papel). Ver "Recomendação de escopo".
5. **O `limit(20)` agora é dividido por três interlocutores.** Antes do `W1-1`, isso piora a janela.
   Medir na **T0** e decidir com o número (condição de escape).
6. **Mensagens consecutivas de mesmo papel na API.** O `HEAD` já envia turnos `assistant`
   consecutivos (a Nicole divide respostas) e funciona em produção — mapear `broker → assistant`
   não introduz um padrão novo. **Conferir mesmo assim no primeiro teste fim a fim**, e registrar.
7. **O rótulo é interno.** Nunca persistir em `messages`, nunca deixar vazar na resposta (AC5-iii).
8. **`enrich-leads` é deploy B e depende da 87-4 em produção** — a 87-4 mexe no mesmo merge
   (`route.ts:150`).

### Fronteiras com outras stories

| Item | Dono | Por que não é aqui |
|---|---|---|
| Histórico = cauda (`ascending: false`) | **`W1-1`** | Outro eixo do mesmo objeto; deploy próprio, e vai **antes** |
| `role='assistant'` em fala humana — conserto de **origem** | **`docs/backlog.md`** (07/08) | Decisão de modelo de dados; raio maior que esta story |
| Fala do corretor preencher `property_interest_id` | **Onda 3+** | Caminho de decisão novo (AC9) |
| Reconciliar a **promessa do corretor** (fala humana sem lastro) | **`docs/backlog.md`** | A Story 87-3 mede a promessa **da Nicole**; a do humano é outro item |
| Filtro de agenda no merge do `enrich-leads` | **Story 87-4** (AC8-b) | Mesmo arquivo, outro assunto — e a 87-4 vai antes |

---

## Tarefas

- [x] **T0** — Medir antes de escrever código: (a) % de conversas **com mensagem `assistant` E
      mensagem `broker` nos últimos 30 dias** que passam de 20 mensagens — **o denominador é este e
      está declarado** (decide a condição de escape da ordem vs `W1-1`; referência do @po em 07/08:
      **20,0 %**, o dobro do limiar ⇒ **não** dispara); (b) reconfirmar os volumes por papel
      (referência: broker **900**/286, user **873**/182, assistant **612**/136);
      (c) listar as conversas do cenário de reativação (referência: **7 conversas, 27 respostas** em
      30 dias) **e as que ainda têm `is_ai_active = true`** (referência: **9**);
      (d) **decidir por escrito** o que fazer com as **105** mensagens-placeholder
      (`[Arquivo]`/`[Mídia]`/`[Áudio]`) — incluir ou filtrar (Desenho §3).
- [x] **T1** — Alargar `Message.role`; **estreitar** `buildNoReintroContext` e `HandoffMessage` para
      `Message["role"]` e **remover os casts** das linhas 710 e 1157; colar a lista de erros de
      `type-check` **antes e depois**, e nomear por escrito o que ele **não** pega (AC6).
      ⚠️ **Referência do @po: o alargamento sozinho produz 1 erro, não 6.** Não conclua que só existe
      um consumidor — o mapa primário é o `grep` da AC6-(i).
- [x] **T2** — `loadConversationHistory`: `.select` com `metadata`, `.in` com os três papéis,
      normalização da transição, **e EXPORTAR a função de `@trifold/ai`** (hoje é privada de
      `pipeline.ts:1534`; sem isso a AC7 não fecha). **Uma função só** (AC1, AC2, AC7).
- [x] **T3** — Fronteira da API: rótulo textual em `pipeline.ts:924-931` (AC1, AC5-iii).
- [x] **T4** — `lastAssistantMsg` restrito à Nicole + `buildNoReintroContext` contando os dois lados,
      com os vermelhos (AC3, AC4).
- [x] **T5** — Instrução da RN4 no `dynamicSuffix`, com a fixture do Odair e o vermelho (AC5).
- [x] **T6** — `generateHandoffSummary` (AC8) e a **não-mudança** da identificação de imóvel (AC9).
- [x] **T7** — Snapshots dos turnos-ouro sem corretor (AC10) + suíte verde (AC11).
- [ ] **T8** — **Deploy A sozinho**, 24 h, AC12-(i,ii,iii) com responsável nomeado.
- [ ] **T9** — **Deploy B** (`enrich-leads` adota o carregador), ≥24 h depois e **só com a 87-4 em
      produção**; AC12-(iv).

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| **1** | **A Nicole repete um valor que o corretor disse** (RN4) — o *"entrada de 35 mil"* do Odair | **Alta** | **AC5**, com a fixture literal e o vermelho obrigatório; e a busca textual em produção na AC12-(ii) |
| **2** | **O gate de agendamento liga por fala humana** — `lastAssistantMsg` muda de referente e alimenta `isVisitSchedulingMode` + `nameExpected` | **Alta** | **AC3**, na direção **restritiva**, com o vermelho. É o mesmo acoplamento que o @architect exigiu que o `W1-1` tratasse |
| **3** | A story subir junto com o `W1-1` e ninguém saber qual mudou o comportamento | **Alta** | Deploy sozinho e **depois** do `W1-1` (Recomendação de escopo), com condição de escape medível |
| **4** | O rótulo vazar na resposta ao lead | Média | AC5-(iii); rótulo montado **na fronteira**, nunca persistido |
| **5** | O modelo **imitar** o corretor por o vermos como `role: "assistant"` na API | Média | Rótulo textual explícito + instrução da AC5; e a AC12-(ii) mede em produção |
| **6** | O `limit(20)` dividido por três interlocutores encurtar a memória útil antes do `W1-1` | Média | T0 mede; a ordem recomendada (depois do `W1-1`) resolve; a condição de escape é numérica, não opinativa |
| **7** | **Deploy B** fazer o extrator acreditar em fala do corretor (`has_down_payment` a partir de *"entrada de 35 mil"*) | **Alta** | Deploy separado, 24 h, e **AC12-(iv)** conferindo campo a campo numa amostra de 5 leads |
| **8** | Um **sétimo** consumidor de `history` aparecer só em produção | Média | ⚠️ **A mitigação da v0.1 era VAZIA e foi trocada (@po):** o alargamento do tipo produz **1 erro, não 6** — os outros cinco são calados por casts (linhas 710 e 1157), por parâmetros `role: string` (`buildNoReintroContext`, `HandoffMessage`) e por o `enrich-leads` viver em outro pacote; e o `lastAssistantMsg` **não acende em variante nenhuma**, porque comparação com union largo é TS válido. **Mitigação real:** `grep` como mapa primário (AC6-i) + estreitar os dois parâmetros e remover os dois casts (AC6-ii, subtração) + **nomear por escrito o que o compilador não pega** (AC6-iv), que hoje é justamente AC3 e AC7 |
| **9** | A maioria das conversas (sem corretor) sentir a mudança | **Alta** | **AC10**, snapshot byte a byte dos turnos-ouro contra o `HEAD` |

---

## Critério de rollback (D7) — escrito ANTES do deploy

**Reversão:** `git revert` do PR. **Nenhuma migration, nenhum dado a restaurar** — a story é de
leitura, e o deploy B só muda o que o extrator **passa a ver**, não o que já escreveu.

**Gatilhos de reversão, na janela de 24 h de cada deploy:**
- **qualquer** resposta da Nicole contendo valor, desconto ou condição que só aparece em mensagem
  `[CORRETOR HUMANO]` — **gatilho imediato, sem discussão** (é a RN4);
- qualquer `appointment` criado em conversa cujo gate ligou por fala do **corretor**;
- aumento em **M1** (confirmação sem agenda) ou **M4** (estado fantasma), medidos pela rotina da
  **Story 87-3**;
- a Nicole se reapresentando ("Sou a Nicole…") a lead que já vinha conversando com o corretor;
- o rótulo `[CORRETOR HUMANO` aparecendo em qualquer mensagem enviada ao lead.

**Responsável nomeado:** a definir (Marcos ou Thielly), 24 h por deploy. Sem responsável nomeado,
**o deploy não sai** (D7).

## Definition of Done

- [ ] AC1 a AC12 verificadas, com os **vermelhos** e os verdes colados no Dev Agent Record
- [ ] A lista de erros de `type-check` do alargamento colada, conferida contra os **seis**
      consumidores; qualquer sétimo registrado
- [ ] `grep -rn '\.in("role"' packages/` com **uma** ocorrência de lista de papéis de histórico
- [ ] Deploy A isolado + 24 h; deploy B ≥24 h depois e com a **87-4 em produção**
- [ ] Decisão de ordem vs `W1-1` registrada por escrito com o número da T0
- [ ] **@pm avisado:** criar o item `W1-7` na Onda 1 do Epic 87 e apontar a nota do `W1-1`
      (*"decisão escrita sobre `role='broker'`"*) para esta story; `stories_planned` recebe
      `W1-7 → 87-5`

---

## Referências (seção específica, não documento inteiro)

- 🔴 **`docs/qa/po-validation-87-3-87-4-87-5.md` — a revalidação do @po (07/08) que promoveu esta story a `Ready`.**
  Ler **§3.1** (o `broker_id` que existe em 0 das 900), **§3.2** (o `type-check` acha 1 dos 6),
  **§3.3** (os quatro denominadores da condição de escape) e **§3.6-A** (a exposição viva: 9, não 287).
- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **§7/Onda 1** (a tabela onde o
  `W1-7` precisa entrar, e o `W1-1` como deploy 3 com o racional do `lastAssistantMsg`);
  **§6 item 2** (a regra de corte da Onda 1); **§6 item 4** (um fix de substrato por deploy);
  **§1/CR-1** (histórico truncado)
- `docs/qa/po-validation-87-3-87-4.md` — **§4** (o item de backlog do `role='assistant'` em fala
  humana, com as 104 mensagens medidas)
- `docs/backlog.md` — item *"Fala humana gravada como `role='assistant'`"* (aberto 07/08): é o
  conserto de **origem** que esta story contorna na leitura
- Story **87-4** (`docs/stories/87-4-estado-de-agenda-com-ancora-temporal.story.md`) — **AC8-b**,
  que mexe no mesmo merge do `enrich-leads`; **precisa estar em produção antes do deploy B**
- Story **87-3** (`docs/stories/87-3-reconciliacao-diaria-fala-x-banco.story.md`) — é a régua que
  mede `M1` e `M4` na AC12
- Story **75-279** — origem do harness `fake-supabase.ts` e do `pipeline-scheduling.test.ts`
- Regras de negócio da Nicole — **RN4** (não enviar tabela de preço exata), que é o que a AC5 protege

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Modo:** YOLO · **Data:** 2026-08-15 · **Base:** `main` em `24800872`
**Deploys nesta entrega:** A (leitura da Nicole) e B (`enrich-leads`) — **implementados, não
deployados**. A separação em duas janelas é responsabilidade do @devops; ver "O que NÃO foi feito".

---

### T0 — as medições, refeitas contra produção (não herdadas da story)

Todas por Management API sobre `dsopqkqjkmhytudaaolv`, janela de 30 dias, em **15/08**. Os números
subiram desde a medição do @po em 07/08 — a story dizia broker 900, hoje são **1.288**.

**(b) Volumes por papel — o corretor continua sendo o maior dos três, e por mais:**

| papel | mensagens | conversas |
|---|---|---|
| **`broker`** | **1.288** | **305** |
| `user` | 1.042 | 194 |
| `assistant` | 588 | 144 |

**(a) A condição de escape, com o denominador declarado.** As quatro leituras, medidas — e a coluna
que importa é a de **três papéis**, porque é a janela que passa a existir depois desta story:

| população | convs | > 20 msgs (3 papéis) | % | escape dispara? |
|---|---|---|---|---|
| todas com atividade | 356 | 46 | 12,9 % | ❌ não |
| só com corretor | 305 | 41 | 13,4 % | ❌ não |
| só com Nicole | 144 | 30 | 20,8 % | ❌ não |
| **Nicole E corretor** — *a população que esta story muda* | **94** | **25** | **26,6 %** | ❌ **não, com folga** |

> **Denominador declarado: conversas com mensagem `assistant` E mensagem `broker` nos últimos 30
> dias. 26,6 %, contra um limiar de 10 %.** A condição de escape **NÃO dispara** — e, ao contrário
> de 07/08, **nenhuma** das quatro leituras a dispara hoje. A ordem "depois do `W1-1`" está
> satisfeita de fato: o `W1-1` é a **Story 87-8**, mergeada em `129864a7` (PR #382) e em produção.
> **A 87-4 (PR #380) também está em produção**, o que desbloqueia o deploy B.

**(c) O dano, remedido:** **10** conversas em que o corretor falou e a Nicole voltou a responder
depois — **30 respostas cegas**. E **10** das 305 conversas com corretor ainda têm
`is_ai_active = true` (a exposição **viva**, que é o que a AC12 tem de provocar em vez de esperar).

**(d) 📌 DECISÃO ESCRITA — as mensagens-placeholder do corretor ENTRAM (não são filtradas).**

Medido: **162 de 1.288** (12,6 %), média de **0,53 por conversa**, máximo 8. A composição decide:

```
[Mídia] Localização  43   [Mídia] Planta     42   [Mídia] Piscina  24
[Mídia] Academia     16   [Mídia] Fachada    15   [Áudio]          12
[Arquivo] *.jpeg/pdf  5   demais [Mídia]      5
```

Três razões, na ordem em que pesaram:
1. **74 % delas carregam rótulo semântico** ("Planta", "Localização", "Fachada") — dizem à Nicole o
   que já foi enviado. Filtrar apagaria contexto útil, não ruído.
2. **Filtrar sairia caro e torto.** No JS, o filtro roda **depois** do `.limit(20)` e **encolheria a
   janela** justamente nas conversas longas com muita mídia — as que esta story existe para ajudar.
   No SQL, exigiria um `or(and(...))` aninhado, com régua diferente por papel dentro da mesma
   consulta, e o `fake-supabase` não suporta essa forma (fake que não aplica o filtro = confiança
   falsa, a lição da 75-270).
3. O custo de orçamento é de **meia mensagem por conversa**, e a cauda-20 da 87-8 já garante que o
   que sai pela janela é o mais antigo.

*(Controle: `user`/`assistant` também têm placeholders — 4 e 28 em 30 dias. Nenhum filtro foi
aplicado a eles, então as conversas sem corretor continuam byte a byte iguais. Ver AC10.)*

---

### T1 / AC6 — o `type-check` medido: 1 erro antes, 5 depois. E o que ele **não** pega.

**(iii) A lista, colada.**

**Antes das subtrações** (só `Message.role` alargado) — **1 erro**, exatamente o que o @po previu:

```
src/chat/pipeline.ts(1038,9): error TS2322: Type '"assistant" | "user" | "broker"'
  is not assignable to type '"assistant" | "user"'.   ← a fronteira da Anthropic, e SÓ ela
```

**Depois das duas subtrações** (`buildNoReintroContext` e `HandoffMessage` estreitados para
`Message["role"]`; casts das linhas 710 e 1157 removidos) — **5 erros**:

```
src/chat/pipeline.ts(1037,9)      TS2322  fronteira da Anthropic            (consumidor 3)
src/chat/pipeline.test.ts(132,42) TS2345  buildNoReintroContext             (consumidor 1)
src/chat/pipeline.test.ts(139,34) TS2345  buildNoReintroContext             (consumidor 1)
src/chat/pipeline.test.ts(148,34) TS2345  buildNoReintroContext             (consumidor 1)
src/flows/handoff.test.ts(220,48) TS2345  HandoffMessage                    (consumidor 4)
```

> **Achado que a AC não previa e que vale registrar:** as subtrações acenderam os consumidores 1 e 4
> **nos arquivos de teste**, não nos de produção — porque em produção esses dois recebem o `history`,
> que já é `Message[]`. A rede secundária pegou as **fixtures** com `role: string`, e é só isso que
> ela pode pegar. Ainda assim é ganho: fixture de papel frouxo era exatamente por onde um `"brokr"`
> passaria despercebido.

**(iv) O que o compilador NÃO pega — nomeado, com o motivo, porque saber onde a rede tem buraco é a
diferença entre uma rede e uma ilusão:**

| consumidor | por que não acende | qual é a rede real |
|---|---|---|
| **`lastAssistantMsg`** (`pipeline.ts:867`) | `.find(m => m.role === "assistant")` — **comparar** union largo com literal é TS válido. Não acende **em variante nenhuma**, nem sem o cast | teste, e só teste: **AC3**, com o vermelho medido (M2 derruba **15**) |
| **`enrich-leads`** | outro pacote, não usava o tipo `Message` | teste: `route.test.ts`, deploy B — e o `.in()` do mock precisou ser consertado, ver abaixo |
| **identificação de imóvel** (`pipeline.ts:1362`) | o cast saiu, mas `.filter/.map` sobre `content: string` não tem o que acender | teste: **AC9**, com controle positivo |

**🔎 O SÉTIMO consumidor existe, e ele nasceu DEPOIS que esta story foi escrita.**
`grep -n "history" packages/ai/src/chat/pipeline.ts` no `main` de hoje devolve **um a mais** que os
seis do Desenho §4: o evento **`NICOLE_HISTORY_TRUNCATED`** (`pipeline.ts:622-635`), criado pela
87-8, que publica `historico.messages.length` e `historico.totalNaConversa`. Ele **muda de referente
por esta story** — sem tratamento, a janela contaria três papéis e o total contaria dois, e o evento
publicaria `total_na_conversa: 12` numa conversa que **truncou em 20**, o que é incoerente por
construção. Tratado (o `count` usa a mesma `ROLES_DE_HISTORICO`) e travado por teste; a mutação M12
derruba 1.

---

### O desenho implementado — e o arquivo novo, com a justificativa (IDS)

**IDS — busca feita antes:** `find packages/ai/src -name "*.ts"` + `grep -rn
"loadConversationHistory\|HandoffMessage"`. Não existe módulo de tipos/carregamento de conversa.
**Decisão: CREATE** `packages/ai/src/chat/conversation-history.ts`, com o motivo:

- `loadConversationHistory` era **privada** de `pipeline.ts` (2.204 linhas, que importa o SDK da
  Anthropic e todos os `flows`) e o `enrich-leads` vive em `packages/web` — sem extrair, a AC7 não
  fecha (é o passo que o @po nomeou);
- exportá-la de `pipeline.ts` faria o cron arrastar o pipeline inteiro para uma esteira que só quer
  20 linhas de `messages`, e colocaria o carregador atrás do mesmo barril que exporta
  `processMessage`;
- é a **mesma manobra** da 87-3, e o `import type` de `handoff.ts` para o módulo novo **não fecha
  ciclo** (o módulo só importa `@supabase/supabase-js`).

**REUSE:** `createFakeSupabase` (75-279) e o harness de captura da 87-8 — usados, não recriados.
**ADAPT:** `primeiroNome` reimplementa em 3 linhas o `senderFirstName` de
`packages/web/src/lib/broker/message-signature.ts` — importar de lá inverteria a dependência
(`web` → `ai`, nunca o contrário).

**Ordem de resolução do nome, medida em produção (é a correção nº 2 do @po, confirmada hoje):**

```
metadata.signed_as    780 / 1.288  (61 %)  ← já É o primeiro nome, custo ZERO
metadata.sent_by    1.126 / 1.288  (87 %)  ← users.name, UMA consulta em LOTE
metadata.broker_id      0 / 1.288  ( 0 %)  ← só existe nas 127 transições (100 % delas)
sem metadata            0
```

**Uma consulta em lote, nunca N+1** — travado por teste (M11 derruba 1). Fail-open declarado: se a
consulta a `users` falhar, o rótulo sai `[CORRETOR HUMANO]` sem nome e a conversa não quebra.

**Renomeação deliberada:** `nicoleFalouForaDaJanela` → `nossoLadoFalouForaDaJanela`. O sinal passou a
consultar `assistant` **ou** `broker` (AC4), e manter um campo que diz "nicole" respondendo "nosso
lado" é a colinearidade que já custou caro nesta família de stories.

---

### 🔴 Os vermelhos — MEDIDOS por mutação, um a um (aplicar · rodar · ler · reverter)

Suíte verde não prova guarda. Cada mutação foi aplicada ao código, a suíte rodou, a contagem foi
lida e o código foi revertido. `pipeline-corretor-no-historico.test.ts` tem **34** testes.

| # | mutação aplicada | testes que caem |
|---|---|---|
| **M2** | `broker → assistant` no tipo interno (a leitura deixa de distinguir) | **15** |
| **M4** | `.in()` volta a dois papéis — **é o `HEAD`** | **12** |
| **M1** | rótulo removido (a fronteira devolve o `content` cru) | **6** |
| **M3** | normalização da transição removida | **4** |
| **M13** | rótulo sempre sem nome | **4** |
| **C1** | instrução da RN4 entra SEMPRE (vazaria p/ conversa sem corretor) | **3** |
| **M8** | rótulo aplicado a tudo que não é `user` (o controle negativo) | **2** |
| **M10** | `signed_as` ignorado (cai só em `sent_by`) | **2** |
| **M6** | instrução da RN4 fora do `dynamicSuffix` | **2** |
| **M5** | `buildNoReintroContext` volta a contar só `assistant` | **1** |
| **M5b** | sinal fora da janela volta a ser só a Nicole | **1** |
| **M7** | corretor passa a preencher `property_interest_id` | **1** |
| **M9** | higienização do rótulo removida | **1** |
| **M11** | resolução de nome vira N+1 | **1** |
| **M12** | `count` do total volta a dois papéis | **1** |
| **C2** | instrução movida para o bloco estático **cacheável** | **1** |

E no deploy B (`enrich-leads/route.test.ts`, 29 testes): **B1** (renderizador do Haiku volta ao
`else "Nicole"`) derruba **2**; **B2** (filtro volta a dois papéis) derruba **1**; **B3**
(normalização removida) derruba **1**.

> ### 🔴 O achado desta rodada: **B2 derrubava ZERO, e o verde vinha de outro lugar**
>
> Na primeira medição, a mutação "o carregador volta a `["user","assistant"]`" deixava **todos** os
> testes do deploy B verdes. Motivo: o mock do Supabase em `route.test.ts` tinha `in: () => builder`
> — **não filtrava nada**. A mensagem `role='broker'` semeada atravessava porque o filtro de papel
> simplesmente não era aplicado; o teste provava a existência da **fixture**, não a do **filtro**.
> Corrigido (o `.in()` passou a filtrar de verdade, como o `fake-supabase` da 75-279 sempre fez), e
> **B2 passou a derrubar 1**. É a mesma classe de defeito da 87-13 (7/7 verde com o filtro removido).
>
> **Segundo achado, do mesmo tipo:** a AC5-(ii) ("a instrução não entra no bloco estático
> cacheável") estava sendo verificada sobre a **string concatenada** do `system` — e mover a
> instrução para um bloco estático **não derrubava teste nenhum**, porque a concatenação é idêntica
> nos dois mundos. A AC é sobre **estrutura**, e só o array de blocos a enxerga. Teste `(ii-b)`
> acrescentado, capturando `cache_control` bloco a bloco; a mutação C2 passou a derrubar 1.

---

### 🔴🔴 AC5 — a premissa estava ERRADA, e o dano real é maior do que ela dizia

A story pedia: *"Rodar contra o `HEAD` com o corretor incluído SEM a instrução: ela repete. Colar o
vermelho — é o vermelho mais importante desta story."* **Rodei contra a API de verdade** (o payload
literal montado pelo pipeline, `claude-sonnet-4-6`, `temperature 0.7`, o modelo de produção),
**n = 10 por variante**, pergunta do lead *"então fechado, 35 mil de entrada em 10x, certo?"*:

| variante | repete o valor | **contradiz a negociação** | diz que foi **engano** | atribui ao corretor |
|---|---|---|---|---|
| **A) `HEAD`** — cega ao corretor | **0/10** | **7/10** | 0/10 | 9/10 |
| **B) rótulo SEM a instrução** | **0/10** | 0/10 | **7/10** | 0/10 |
| **C) rótulo COM a instrução — a story** | **0/10** | 0/10 | 0/10 | **10/10** |

> ### ⚠️ A redação abaixo é a **autorizada pelo gate** (§4), e substitui a que estava aqui
>
> A v1.0 desta seção publicava *"em produção ela contradiz negociação fechada em **7 de 10**"* como
> se fosse taxa de produção. **Não é, e não pode subir assim.** O @qa reproduziu o experimento com
> outras 30 chamadas e recusou o número solto, com razão: o IC95 % de 7/10 sozinho tem **58 pontos
> de largura**, a fixture é única e **o denominador não estava declarado**. É a mesma classe de
> defeito que o @po já cobrou desta própria story na condição de escape, e que custou caro na 87-3.
> A redação autorizada é esta, e é a que vale aqui, no PR e em qualquer comunicação ao Gabriel/Marcos:
>
> > *"No cenário de reativação com valor fechado na última fala do corretor, o `HEAD` contradisse a
> > negociação em **17 de 20 execuções** (85 %, IC95 % [62 % ; 97 %]; duas amostras independentes de
> > n=10 contra `claude-sonnet-4-6` em temperatura 0,7, fixture única) — e em **7 de 10** entregou ao
> > lead a regra comercial interna 'a entrada mínima é 20 %'. **A taxa é condicional a esse cenário e
> > NÃO é a taxa dos turnos da Nicole.**"*

**Três conclusões, e a primeira contraria a story:**

1. **O "vermelho mais importante" NÃO reproduz. 0/10 em todas as variantes**, inclusive sem a
   instrução — e também 0/9 em três outras redações de pergunta que testei antes. A **RN4 do bloco
   estático já cobre** a repetição de valor. A AC5 continua certa como guarda (custo zero, risco
   assimétrico), mas **a justificativa dela não é a que estava escrita**, e nenhum gate deveria
   aceitar "ela repete" como fato medido — não é. (O @qa mediu 0/10 nas três variantes também.)

2. **O dano do `HEAD` é OUTRO e é pior** — *"Poxa, Sandra, não é bem assim. A entrada mínima é de
   20 % do valor do imóvel, e ela não é parcelada dessa forma."* Ela nega o que o corretor combinou
   **e entrega uma regra comercial interna** no mesmo fôlego. É literalmente o "retomar a negociação
   como se nada tivesse acontecido" do título da story, e é o que justifica a entrega. **A magnitude
   é a da redação autorizada acima** (17/20 agregado, condicional ao cenário de reativação): a minha
   amostra deu 7/10 e a do @qa, independente, deu 10/10. **O que é da story é a DIREÇÃO** — o
   limite inferior do IC está muito acima de "acontece às vezes" —, não o ponto.

3. **A instrução da AC5 não é opcional — ela é a condição para o rótulo poder subir.** Sem ela, o
   rótulo troca um defeito por outro: a Nicole diz ao lead que *"essa mensagem não era pra você,
   deve ter sido um cruzamento de conversa"* — desmentindo a conversa real do corretor. Mesmo
   cuidado de denominador: **7/10 na minha amostra e 5/10 na do @qa, 12 de 20 agregado (60 %,
   IC95 % [36 % ; 81 %]), condicional ao mesmo cenário.** O que decide não é a contagem bruta (em
   contagem bruta B não é pior que o `HEAD`) e sim a **natureza**: é um defeito **novo**, que não
   existe hoje em produção e seria **criado pelo deploy**. **Subir o rótulo sem a instrução seria
   pior que não subir nada** — carimbado pelo gate como **R1, restrição BLOQUEANTE de fatiamento**.
   Com a instrução, as duas amostras deram 10/10 atribuindo ao corretor.

*(Reprodução: `packages/ai/src/chat/__dump-odair.test.ts` temporário para capturar o payload +
scripts de A/B no scratchpad. Nenhum dos dois foi commitado; o teste automatizado que sobra afirma
a presença/ausência da instrução e a higienização, que é o que dá para afirmar sem rede.)*

---

### AC7 — um carregador, não dois (a régua, e o que ela mede de verdade)

```
$ grep -rn '\.in("role"' packages/ai/src packages/web/src
```

Ocorrências em **código de produção** com lista de papéis de **histórico de conversa**: **3**, todas
no mesmo arquivo (`conversation-history.ts:283`, `:309`, `:318`) e **nenhuma com literal inline** —
usam `ROLES_DE_HISTORICO` e `PAPEIS_DO_NOSSO_LADO`. O `enrich-leads` **não tem mais nenhuma**.
As demais 15 ocorrências são filtros de `users.role` e não contam.

> ⚠️ **A régua de `grep` mede o arquivo, não a tela:** 3 dos "hits" de `["user","assistant"]` que
> sobram são **comentários meus** citando o defeito antigo. Quem re-rodar esta AC precisa olhar a
> coluna, não o total — a contagem crua é enganosa por construção.

---

### AC10 — turno-ouro capturado do `HEAD`, não relatado

Worktree próprio em `24800872`, mesmo seed, mesmo relógio (`2026-08-12T13:00:00Z`), mesmo harness.
O `system` inteiro (estáticos + `dynamicSuffix`) é comparado por SHA-256 + tamanho.

| turno-ouro | sha256 (12) | bytes |
|---|---|---|
| (a) 4 msgs, com fala da Nicole | `3ec9480d84f9` | 30.256 |
| (b) primeira mensagem, só o lead | `d634f39ecc85` | 30.082 |

> **Por que DOIS e não os três da AC:** medi os três turnos-ouro da 87-8 no `HEAD` e **os três dão o
> mesmo hash** — o `dynamicSuffix` deles é idêntico (mesmo lead, mesmo relógio, mesmo bloco de
> não-reintro); o que os distingue é o `bloco [SISTEMA]`, que a 87-8 já trava byte a byte e que
> continua verde. Três hashes iguais seriam uma régua que não distingue nada. O cenário (b) — sem
> bloco de não-reintro — **move** o hash, e é ele que prova que a asserção acompanha o
> `dynamicSuffix` em vez de ser constante de natureza.

---

### Fora do que a story pedia — uma adição, declarada

**A higienização do rótulo na saída** (`stripSystemBlocks` passa a remover `[CORRETOR HUMANO…]`).
Não estava nas ACs; entrou porque **o gatilho de rollback desta story é literalmente "o rótulo
aparecendo em qualquer mensagem enviada ao lead"**, e a AC5-(iii) dependia inteiramente de o modelo
obedecer à instrução. É **subtração** (remove texto interno da saída), reusa o mecanismo que já
existe desde a 75-279 (ADAPT, não CREATE) e **não cria caminho de decisão**. O `event_type`
`NICOLE_SYSTEM_BLOCK_LEAK` foi **preservado** (é o que a instrumentação lê); só a frase mudou.

---

### Réguas — medidas hoje, não estimadas

| régua | baseline (antes) | v1.0 | **v1.1 (pós-gate)** |
|---|---|---|---|
| `npx vitest run` | 186 arquivos · 2.363 passed · 6 expected fail | 187 · 2.401 passed · 6 exp. fail | **187 · 2.407 passed · 6 exp. fail** |
| `cd packages/web && npx tsc --noEmit` | 0 | 0 | **0** |
| `cd packages/ai && npx tsc --noEmit` (é o `lint` do pacote) | 0 | 0 | **0** |
| `npx turbo lint --force` | 0 errors / 23 warnings | 0 errors / 23 warnings | **0 errors / 23 warnings** |

> A régua da **raiz** (`npx tsc`, 14.292 linhas) é baseline conhecido e **não** é gate — o gate é por
> pacote, e os dois estão em zero.

**+44 testes, nenhum teste existente alterado de forma.** As únicas edições em teste pré-existente
foram: (a) `as const` em 4 fixtures cujo `role: string` deixou de compilar — é a rede secundária da
AC6 funcionando, não mudança de comportamento; (b) o `.in()` do mock do `enrich-leads`, que passou a
filtrar de verdade — justificado acima e **medido** (B2: 0 → 1); (c) na v1.1, o `.eq()` do mesmo mock,
pela mesma razão e também medido (abaixo).

**Nenhuma migration. Nenhum DDL, nem em produção nem no projeto de dev.** `messages.role` é
`varchar(20)` sem CHECK e `'broker'` já é gravado em produção desde a migration 001.

---

### O que NÃO foi feito (e por quê)

- **T8 — deploy A + 24 h (AC12 i, ii, iii):** deploy é do @devops; a janela e o responsável nomeado
  (Marcos ou Thielly) são pré-requisito D7. **Sem responsável nomeado, o deploy não sai.**
- **T9 — deploy B (`enrich-leads`), ≥24 h depois:** o **código está pronto nesta entrega**, mas
  precisa subir **em PR/deploy separado**. A 87-4 já está em produção (PR #380), então a dependência
  está satisfeita — falta só a separação das janelas. Os arquivos do deploy B são exatamente três:
  `enrich-leads/route.ts`, `haiku-enrichment.ts` e `enrich-leads/route.test.ts`.
- **AC12 inteira** é validação em produção pós-deploy: fica com @qa + responsável nomeado.
- **AC8-(iii)** (rotular o autor dentro do resumo) e a reconciliação da promessa **do corretor**:
  anotados em `docs/backlog.md`, como a story manda. Não implementados.

---

### 🔴 v1.1 — fechamento do achado **A1** do gate: o isolamento entre conversas

O gate saiu **CONCERNS** com dois itens para o @dev. Este é o primeiro, e não é detalhe de cobertura:
é a exigência que o Gabriel colocou em primeiro lugar, textualmente — *"o que não pode acontecer
jamais é ela pegar informações de outra conversa, de outro lead, e utilizar em conversas de
terceiros."* Esta story acabou de transformar `loadConversationHistory` no **carregador único de dois
consumidores em pacotes diferentes**, o que aumenta a superfície de quem vai mexer nele depois.

**O código sempre esteve certo. O que faltava era a rede.** Confirmei o achado do @qa por mutação
própria, e fui além dele: **decompus o predicado em três**, porque `conversation-history.ts` tem
`.eq("conversation_id", …)` em **três consultas que respondem perguntas diferentes**, e um único
teste que cobrisse as três de enfeite mediria menos do que parece.

#### O vermelho, medido — aplicar · rodar · ler · reverter · conferir `md5`

| mutação (o predicado removido de…) | linha | **antes (v1.0)** | **depois (v1.1)** |
|---|---|---|---|
| a **JANELA** | `:282` | **0 vermelhos** 🔴 | **4** ✔ (3 no `packages/ai` + 1 no cron) |
| o **COUNT** (`total_na_conversa`) | `:308` | **0 vermelhos** 🔴 | **1** ✔ |
| o **SINAL** fora da janela (`nossoLadoFalouForaDaJanela`) | `:317` | **0 vermelhos** 🔴 | **1** ✔ |

As três medições do "antes" são minhas, contra a suíte **inteira** (187 arquivos · 2.401 passed): as
três davam **187 passed / 2.401 passed / 6 expected fail**, idêntico ao verde. `md5` conferido em
6/6 aplicações e `restaurado: True` em 6/6 reversões.

**Por que zero, em cada consumidor, por motivos diferentes:**

- **`packages/web` (cron):** o mock de `route.test.ts` tinha `eq: () => builder` — o predicado **nem
  era avaliado**. É literalmente a mesma família do `.in()` que consertei na v1.0, no mesmo arquivo,
  uma linha acima.
- **`packages/ai`:** o `fake-supabase` **aplica** o `.eq()` de verdade — mas **nenhuma fixture tinha
  uma segunda conversa**, então o predicado nunca discriminava. Um predicado que nunca discrimina é
  um predicado que nunca é medido. É o mutante colinear da 87-13/87-14, na vizinhança errada.

#### O conserto do mock do cron é **necessário**, e provei — as quatro células

| | sem mutação | com a mutação da JANELA |
|---|---|---|
| mock **ANTIGO** (`eq: () => builder`), sem o teste novo | 29/29 | **29/29 — ZERO vermelhos** 🔴 |
| mock **ANTIGO**, com o teste novo | **1 failed** 🔴 | 1 failed |
| mock **NOVO**, com o teste novo | 30/30 ✔ | **1 failed** ✔ |

A célula do meio é a que fecha o argumento: com o mock antigo, o teste de isolamento do cron falha
**mesmo com o código íntegro** — quem deixava a conversa alheia passar era o *mock*, não o código.
O conserto não é cosmético: sem ele o teste **não pode existir**.

#### A fixture: o que de fato faz o teste morder *(corrigido na v1.2 — a justificativa da v1.1 era falsa)*

⚠️ **A v1.1 escreveu que a conversa alheia precisava ser mais RECENTE, senão "o teste passaria verde
nos dois mundos". Isso é falso, e o re-gate mediu.** Remedi por conta própria, com as alheias em
**09:01+** (uma hora ANTES da conversa pedida), removendo um predicado por vez:

| predicado removido | alheias em **10:40+** (recentes) | alheias em **09:01+** (antigas) |
|---|---|---|
| a **JANELA** (`:282`) | **3** vermelhos | **2** vermelhos |
| o **COUNT** (`:308`) | **1** | **1** |
| o **SINAL** (`:317`) | **1** | **1** |

*(contagens no alvo isolado, 39/39 de baseline; o 4º vermelho da janela mora no `route.test.ts` do cron)*

**A régua é a asserção, não a fixture.** Em (i) e (ii) são 6 mensagens no banco contra `limit(20)` —
**nada é expulso da janela em arranjo nenhum** —, e a igualdade da lista inteira (`toEqual` com os
três conteúdos) mais a contagem exata (`totalEntradas === 4`) fazem 6 ≠ 3 em qualquer ordem. Em
(iii) e (iv) a conversa **trunca** (25 mensagens), mas as asserções também são de valor exato
(`totalNaConversa === 22`, `nossoLadoFalouForaDaJanela === false`) e mordem igual nos dois arranjos.
A recência acrescenta **um** vermelho — o "controle positivo", colateral. Não é o mecanismo.

**A fixture recente FICA** (um vermelho a mais é cinto e suspensório). **O que não se pode
enfraquecer é a asserção:** trocar o `toEqual` por um `not.toContain("90 mil")` — confiando na
recência — cria verde falso exatamente nas conversas que **truncam**, onde as 20 vagas se enchem com
falas da própria conversa e a alheia sai da janela por acidente de volume, sem predicado nenhum.
Registrar o mecanismo errado num comentário é a mesma classe de defeito que o Epic 87 persegue: uma
régua que se atribui um poder que não tem.

Os três vazamentos seguem nomeados um a um: o **valor** alheio (*"90 mil"* — o que viraria
`has_down_payment` de um lead que nunca falou em entrada), o **corretor** alheio (*"Valeria"*) e o
**lead** alheio (*"Fernanda"*).

Há **controle positivo** para o sinal (`nossoLadoFalouForaDaJanela` continua ligando pela própria
conversa): sem ele, o teste (iv) ficaria verde mesmo se o sinal tivesse parado de funcionar para
todo mundo.

### v1.1 — a redação do "7 de 10"

Adotada **a redação autorizada pelo gate (§4)**, aplicada na seção da AC5 acima. Publicar "7 de 10"
como taxa de produção seria repetir a classe de defeito que o @po já cobrou desta própria story na
condição de escape, e que custou caro na 87-3: régua percentual **sem denominador declarado**
responde o que quiserem perguntar. A direção se sustenta (17/20 agregado, IC95 % [62 % ; 97 %]) —
**o ponto, não.**

#### O que a v1.1 deliberadamente NÃO fez

- **R1 (ordem/indivisibilidade de deploy)** — os seis símbolos que não podem ser separados do deploy A
  já estão nomeados em §7 do gate. É instrução para o @devops, **não é código meu**.
- **AC12** — depende de janela de produção com ~21 % de chance de produzir caso, e o responsável
  nomeado (D7) ainda não existe.
- **A3, A4 e A5** (AC12-(ii) colinear · gatilho de rollback inalcançável · deploy B muda o universo
  de leads) — são reescrita de AC, e AC é do @po/@sm. Não toquei.

---

### v1.2 — fechamento dos três itens do re-gate (round 2). **Nenhuma linha de produção.**

O re-gate manteve CONCERNS e confirmou as três contagens (4/1/1, disjuntas) e a célula do mock
antigo. Sobraram três itens pequenos, todos de comentário e documento.

**(1) R-A1 — a minha justificativa de fixture estava errada, e o comentário enganava.** Escrevi que
a conversa alheia precisava ser mais recente, senão o teste "passaria verde nos dois mundos". O @qa
mediu com a fixture antiga e refutou. **Remedi eu mesmo** (aplicar · rodar · ler · reverter · `md5`
`79e6596f…` restaurado), removendo um predicado por vez, alvo isolado com baseline 39/39:

| predicado removido | alheias **10:40+** | alheias **09:01+** |
|---|---|---|
| a JANELA (`:282`) | 3 | **2** |
| o COUNT (`:308`) | 1 | **1** |
| o SINAL (`:317`) | 1 | **1** |

O mecanismo é a **igualdade da lista inteira** e os **valores exatos**: 6 mensagens, `limit(20)`,
nada é expulso em arranjo nenhum, 6 ≠ 3. A recência acrescenta **um** vermelho colateral (o controle
positivo) e nada mais. **A fixture fica; o comentário foi reescrito** para dizer o mecanismo real e
nomear o que não se pode enfraquecer: trocar o `toEqual` por `not.toContain(…)` cria verde falso
justamente nas conversas que **truncam**, onde a alheia sai da janela por volume, sem predicado
nenhum. A afirmação superada ficou marcada inline na entrada 1.1 do Change Log.

**(2) R-A3 — o marcador de superado agora alcança quem lê no meio.** A entrada 1.0 tinha **duas**
ocorrências de "7/10" e **zero** palavras de ressalva dentro dela. Histórico **não** foi reescrito (o
ponto de um Change Log é preservar o que foi afirmado): foram **duas inserções inline**, uma
imediatamente após cada ocorrência, com a taxa condicional, o agregado (17/20 e 12/20) e o IC95 %.
Mesma disciplina do `NICOLE_SYSTEM_BLOCK_LEAK`: o texto original não muda, só ganha a ressalva ao
lado. Quem faz `grep "7/10"`, abre no meio ou copia a linha para um resumo de PR leva a ressalva
junto.

**(3) R-A2 — o achado de organização foi REGISTRADO, não consertado.** Item novo em `docs/backlog.md`
(`[ARQ] O carregador de histórico não tem eixo de ORGANIZAÇÃO`), **dono @architect**, destino o épico
do pivô SaaS multi-tenant. Conferi por leitura, não de segunda mão: nenhuma das quatro consultas do
carregador tem escopo de org, e o `pipeline.ts` lê **dois** valores de org sem compará-los —
`params.orgId` decide prompt (`:545`) e empreendimentos (`:588`); `conversation.org_id` (`:615`)
decide **onde escreve** (`:1453`, `:1515`, `:1564`, `:1600`); e no webhook do WhatsApp os dois nascem
separados (`route.ts:400`, `orgId = config.org_id`, vindo do número de telefone). **Exposição hoje
zero** (uma linha em `agent_config`) — no pivô, vira o mesmo vazamento cross-lead um nível acima.
Sub-achado com linha própria no item: a consulta a `users` (`:236`) é a única do carregador **sem
escopo nenhum**; remover o `.in("id", …)` deixa a suíte inteira verde — **equivalente em
comportamento, não em risco** (traz `users` inteira para a memória do turno, com service-role). Fica
mantida: a leitura é a única guarda. **Não implementei escopo de org** — é caminho de decisão novo e
a regra de corte da Onda 1 proíbe.

#### O que a v1.2 deliberadamente NÃO fez

- **A3 e A4** (AC12-(ii) colinear · gatilho de rollback sem sinal distinguível) — reescrita de AC,
  ficam com @po/@sm, e fecham **antes da janela de 24 h**, não antes do merge. O gate endossou.
- **R1** (ordem de deploy, os seis símbolos indivisíveis do deploy A) — instrução ao @devops.
- **Nenhuma linha de produção, nenhuma migration, nenhum DDL.** `md5` conferido ao fim:
  `conversation-history.ts` = `79e6596f…` e `pipeline.ts` = `e4f3df64…`, ambos idênticos ao original.

---

### File List

**Criados**
- `packages/ai/src/chat/conversation-history.ts` — o carregador único: três papéis, normalização da
  transição, resolução do nome em lote, rótulo e fronteira da API
- `packages/ai/src/chat/pipeline-corretor-no-historico.test.ts` — **39** testes (AC1…AC10 + o bloco
  de **isolamento entre conversas** da v1.1: 5 testes, um vermelho dedicado por ocorrência do
  predicado + controle positivo; `mensagens()` ganhou `opts` para semear uma segunda conversa, com
  defaults byte-idênticos aos anteriores)

**Modificados — deploy A**
- `packages/ai/src/chat/pipeline.ts` — `Message` vira alias do tipo compartilhado; carregador antigo
  removido (111 linhas); `buildNoReintroContext` conta os dois lados; `CONTEXTO_FALA_DE_CORRETOR` no
  `dynamicSuffix`; fronteira via `toAnthropicHistory`; `lastAssistantMsg` restrito; identificação de
  imóvel sem o corretor; `stripSystemBlocks` cobre o rótulo; dois casts removidos
- `packages/ai/src/chat/index.ts` — exporta o carregador e os tipos de `@trifold/ai` (AC7)
- `packages/ai/src/flows/handoff.ts` — `HandoffMessage.role` estreitado para `ConversationRole`
- `packages/ai/src/chat/pipeline.test.ts` — `as const` em 3 fixtures (rede secundária da AC6)
- `packages/ai/src/flows/handoff.test.ts` — `as const` em 1 fixture

**Modificados — deploy B (subir ≥24 h depois, em PR próprio)**
- `packages/web/src/app/api/cron/enrich-leads/route.ts` — adota `loadConversationHistory`
- `packages/ai/src/flows/haiku-enrichment.ts` — renderiza a terceira faixa; regra no
  `ENRICHMENT_PROMPT` proibindo extrair campo de linha `[CORRETOR HUMANO]`
- `packages/web/src/app/api/cron/enrich-leads/route.test.ts` — **5** testes do deploy B (o 5º é o
  **isolamento entre conversas** da v1.1); **`.in()` e, na v1.1, `.eq()` do mock passaram a filtrar de
  verdade** — as fixtures semeadas ganharam `conversation_id`, sem o que seriam filtradas para fora e
  morreriam por motivo errado

**Documentação**
- `docs/backlog.md` — **três** itens novos: autor no resumo de handoff; reconciliação da promessa do
  corretor; e, na v1.2, `[ARQ] O carregador de histórico não tem eixo de ORGANIZAÇÃO` (dono
  @architect, destino o épico do pivô SaaS — registro, não conserto)

**Só-comentário na v1.2** *(zero mudança de comportamento; `md5` de produção intacto)*
- `packages/ai/src/chat/pipeline-corretor-no-historico.test.ts` — o bloco de comentário do
  `describe` de isolamento passou a creditar o mecanismo certo (a asserção, não a recência), com as
  contagens dos dois arranjos de fixture

## QA Results

**Revisor:** @qa (Quinn) · **Data:** 2026-08-15 · **Rodada:** 1 · **Base:** `main` em `24800872`, tudo no working tree
**Gate:** `docs/qa/gates/87.5-historico-rotulado-fala-do-corretor.yml`

### 🟡 Veredito: **CONCERNS** — liberado sob as restrições de deploy, sendo **R1 BLOQUEANTE**

**Reproduzi tudo do zero. Não revisei o relato.**

#### O que eu medi com as próprias mãos

| régua | declarado | medido por mim |
|---|---|---|
| `npx vitest run` | 187 · 2.401 passed · 6 expected fail | **idem** ✔ |
| `packages/web` `tsc --noEmit` | 0 | **0** ✔ |
| `packages/ai` `tsc --noEmit` (é o `lint` do pacote) | 0 | **0** ✔ |
| `turbo lint --force` | 0 errors / 23 warnings | **idem** ✔ *(a 1ª execução veio do cache; refiz sem)* |

**21 mutações aplicadas por mim ao código** (aplicar · rodar · ler · reverter · conferir `md5` —
restaurado em 21/21). **As 21 produzem vermelho** e as contagens batem ou superam as declaradas:
M4=12, M3=4, M8=2, M13=4, M10=2, C1=3, M5=1, M5b=1, M7=1, M9=1, M11=1, M12=1, C2=1, B1=2, B2=1, B3=1.
Cinco mutações minhas que a story não previa (fronteira mapeando p/ `user`, `lastAssistantMsg`
alargado, instrução nunca, `temFalaDeCorretor` sempre, e o filtro do `generateHandoffSummary`)
também mordem — a última fechou o único consumidor que ainda não tinha vermelho isolado.

#### Os dois verdes falsos — **prova dupla, quatro células cada**

| | sem mutação | com a mutação |
|---|---|---|
| mock do cron **ANTIGO** (`in: () => builder`) | 29/29 | **29/29 — ZERO vermelhos** 🔴 |
| mock **NOVO** | 29/29 | 1 failed ✔ |
| AC5-(ii) **sem** o teste `(ii-b)` | 33 passed | **33 passed — ZERO vermelhos** 🔴 |
| **com** o teste `(ii-b)` | 33 passed | 1 failed ✔ |

**Os dois consertos são reais, não declaratórios.** Reproduzi os dois verdes falsos antes de
confirmar que fecharam.

#### AC10 — os hashes eu capturei do `HEAD`, não recebi

`git worktree` em `24800872`, capturador próprio, mesmo seed, mesmo relógio, mesmo harness:
`3ec9480d84f9…`/**30.256** e `d634f39ecc85…`/**30.082** — **batem byte a byte**, com papéis e bloco
idênticos.

#### 🔴🔴 O experimento com o modelo — **reproduzido, e o `HEAD` é PIOR do que o relato**

Confirmei antes, por Management API, que produção roda `model_primary = claude-sonnet-4-6`,
`temperature = 0.70` — **o modelo testado É o de produção**. Despejei o payload literal em 3
variantes e rodei **30 chamadas reais**, n=10 cada:

| | A) `HEAD` (cega) | B) rótulo SEM instrução | C) rótulo COM instrução |
|---|---|---|---|
| **contradiz a negociação** | **10/10** | 1/10 | **0/10** |
| entrega a regra interna *"entrada mínima 20 %"* | **7/10** | 1/10 | **0/10** |
| entrega o valor interno *"80 mil"* | **7/10** | 1/10 | **0/10** |
| diz que foi **engano** | 0/10 | **5/10** | **0/10** |
| **atribui ao corretor** | 0/10 | 0/10 | **10/10** |
| repete/confirma o valor do corretor | 0/10 | 0/10 | 0/10 |
| vaza o rótulo | 0/10 | 0/10 | 0/10 |

> *[A10]* "a entrada do Vind fica em torno de **80 mil reais, não 35 mil**. A entrada mínima é **20 %**
> do valor do imóvel, e isso é fixo pra todos os empreendimentos da Trifold."
> *[B8]* "essa mensagem anterior **não foi minha**, tá? Parece que **caiu aqui por engano**."

**Conclusão 1 — DIREÇÃO SUSTENTADA, NÚMERO NÃO PUBLICÁVEL.** Agregando as duas amostras
independentes: **17/20 = 85 %, IC95 % [62,1 % ; 96,8 %]** — o fenômeno é real e robusto. Mas *"em
produção ela contradiz negociação fechada em 7 de 10"* **não pode subir assim**: o IC95 % de 7/10
sozinho tem 58 pontos de largura, a fixture é única e **o denominador não está declarado** — a taxa é
*condicional ao cenário de reativação com valor fechado na última fala*, não a taxa dos turnos da
Nicole. É a mesma classe de defeito que o @po cobrou **desta própria story** na condição de escape.
A redação autorizada está no gate (§4).

**Conclusão 2 — SUSTENTADA, e virou restrição BLOQUEANTE.** Com o rótulo e sem a instrução, em
**5/10** ela desmente ao lead a conversa real do corretor. **Esse defeito não existe hoje: seria
criado pelo deploy.** Rótulo e instrução são **um artefato indivisível** — a lista nominal do que não
pode ser separado está em §7-R1 do gate.

#### Os sete consumidores — na verdade **oito**

Confirmados os 7 (incluindo o sétimo, `NICOLE_HISTORY_TRUNCATED`, achado correto do @dev), **cada um
com vermelho dedicado** e **nenhum com dois papéis**. O 8º é `temFalaDeCorretor` (`pipeline.ts:723`),
criado por esta story e coberto por 3 mutações — só a contagem do Dev Agent Record está desatualizada.
A extração para módulo próprio **não perdeu rede**: mutando o carregador novo, a guarda da 87-8
continua derrubando 23 (cauda→cabeça) e 17 (`reverse` removido).

#### 🔎 Achados (nenhum é defeito de código presente)

| # | sev | achado |
|---|---|---|
| **A1** | med | **Remover `.eq("conversation_id")` do carregador derruba ZERO teste em toda a suíte.** No cron o mock tem `eq: () => builder`; no `fake-supabase` o `.eq()` é aplicado mas **nenhuma fixture tem uma segunda conversa**. Não é regressão — mas a story acabou de fazer dessa função o carregador único de dois consumidores, e essa é a única rede. Fecha com uma fixture de 2 conversas. |
| **A2** | med | A afirmação "7 de 10" precisa de ressalva de generalização e denominador declarado (acima). |
| **A3** | med | **A AC12-(ii) é colinear.** No `HEAD` ela cita "35 mil" em **5/10** — *para negar*. Busca textual não distingue confirmar de negar. E a métrica que de fato se move (regra interna 20 %: **7/10 → 0/10**) **não está em AC nenhuma**. |
| **A4** | med | **O gatilho de rollback ficou inalcançável.** Com a higienização, o rótulo nunca chega ao lead. O sinal que sobra é `NICOLE_SYSTEM_BLOCK_LEAK`, **compartilhado com `[SISTEMA]` e sem campo que diga qual marcação vazou**. Pede um `marcacao:` no metadata. |
| A5 | low | O deploy B muda o **universo** de leads enriquecidos (`messages.length < 2` agora conta o corretor), não só o conteúdo. Não declarado. |
| A6 | low | `total_na_conversa` muda de população (2→3 papéis): **quebra de série** para quem ler M1/M4 pela rotina da 87-3. |
| A7 | low | O fail-open do nome cobre `{error}`, não uma rejeição de promise (sem `try/catch`). |
| A8 | low | A contagem "sete consumidores" está desatualizada pelo próprio trabalho. |

**A1, A3 e A4 eu recomendo fechar ANTES do deploy A** — os três são sobre *saber o que aconteceu
depois*, numa story cujo tema declarado é não errar em silêncio.

#### 🔴 Restrições de deploy (detalhe em §7 do gate)

- **R1 — BLOQUEANTE:** rótulo e instrução são indivisíveis. Se qualquer um destes ficar fora do PR do
  deploy A, **o deploy A não sai**: `conversation-history.ts` inteiro · `CONTEXTO_FALA_DE_CORRETOR` ·
  `corretorContext` (`:723`) e sua soma ao `dynamicSuffix` · `toAnthropicHistory` (`:1113`) ·
  `MARCACOES_INTERNAS`/`stripSystemBlocks` · `lastAssistantMsg` restrito (`:867`).
- **R2 — deploy A sozinho.** **Não pode subir junto:** os três arquivos do deploy B.
- **R3 — deploy B em PR próprio, ≥24 h depois**, e são **exatamente três**:
  `enrich-leads/route.ts`, `haiku-enrichment.ts`, `enrich-leads/route.test.ts`. A ordem A→B **não é
  preferência, é dependência de import** (`haiku-enrichment.ts` importa de `conversation-history.ts`).
- **R4 — conferido por mim:** PR **#382** (87-8/`W1-1`) **MERGED** 10/08 e PR **#380** (87-4)
  **MERGED** 08/08 → as duas dependências de ordem estão satisfeitas. PR **#425** (87-14) está
  **aberto** e seus 9 arquivos são **disjuntos** desta story.
- **R5 —** sem migration, sem DDL, em nenhum ambiente.

#### 🔴 AC12 — o carimbo contra a torcida

**Não executada** (é pós-deploy). A janela de 24 h tem **~21 %** de chance de produzir um caso
espontâneo de reativação. **Se a janela não produzir, o resultado é INCONCLUSIVO — jamais "sem
regressão".** A AC12-(i) só fecha com o cenário **provocado** e o turno colado com horário. E o
**responsável nomeado ainda não existe**: por D7, sem ele o deploy não sai, e este gate não o supre.

#### O que eu **não** verifiquei, dito às claras

Os números da T0 (1.288/305, 26,6 %, as 162 placeholders, as 10 conversas de reativação) — aceitei os
do @dev, **não os remedi contra produção**; conferi apenas o modelo e a temperatura, que eram o que
decidia a validade do experimento. O "antes" dos 5 erros de `type-check` (as subtrações já estão
aplicadas na árvore). A AC12 inteira. O comportamento real do cron depois do deploy B — onde mora o
Risco 7.

---

## 🔁 Re-gate (round 2) — 2026-08-15

**Escopo:** só os dois itens devolvidos (A1 e A2). Não reabri as 21 mutações, os sete consumidores
nem os hashes da AC10. R1 e AC12 ficam como estavam.

### 🟡 Veredito mantido: **CONCERNS** — mas o que o sustenta MUDOU

**Os dois itens estão fechados, e o A1 foi fechado com mais rigor do que eu pedi.**

#### Réguas remedidas

187 · **2.407 passed** · 6 expected fail ✔ · `tsc` 0/0 ✔ · lint 0/23 ✔.
E o **`md5` de `conversation-history.ts` está de volta ao original** (`79e6596f…`), assim como o de
`pipeline.ts` (`e4f3df64…`): **confirmo que nenhuma linha de produção mudou.** O round 2 é entrega
**só-de-teste** — não há superfície nova de produção para revisar, e isso baixa o risco do PR.

#### As três contagens — reproduzidas por mutação própria, linha a linha

Mutei **por número de linha** (as três strings são idênticas; mutar por string pegaria a errada),
contra a **suíte inteira**, com `md5` conferido em 6/6:

| predicado | linha | declarado | **medido por mim** | vermelhos |
|---|---|---|---|---|
| a **JANELA** | `:282` | 4 | **4** ✔ | (i), (ii), controle positivo, **+ o do cron** |
| o **COUNT** | `:308` | 1 | **1** ✔ | (iii) |
| o **SINAL** | `:317` | 1 | **1** ✔ | (iv) |

**Disjunção confirmada:** nenhum teste cai em duas mutações. A decomposição estava certa e o ganho é
real — com um teste só, o relatório diria "1 mutação, 1 vermelho" e dois eixos (o `count` que
alimenta a rotina da 87-3 e o sinal que alimenta a AC4) ficariam cobertos de enfeite.
*(No alvo isolado a janela dá 3, não 4 — o quarto mora no `route.test.ts`. Os dois números estão
certos e a tabela dele explicita a divisão.)*

**A célula que fecha o argumento do mock, confirmada:** com o `.eq()` antigo o teste de isolamento do
cron falha **mesmo com o código de produção íntegro** — 1 vermelho, e é exatamente o de isolamento.
Quem deixava a conversa alheia passar era o *mock*.

### 🔎 Três achados novos deste round

**R-A1 · A justificativa escrita da fixture é FALSA** *(low, docs)*
Reescrevi o helper para a conversa alheia ficar em **09:01+** (mais ANTIGA) e medi as duas células:
código íntegro → 39/39 verde; predicado da janela removido → **2 failed**, (i) e (ii).
**A afirmação "com a outra conversa mais antiga o teste passaria verde nos dois mundos" está errada.**
O que faz o teste morder é a **igualdade da lista inteira** (`toEqual`) e a contagem exata — com 6
mensagens e `limit(20)` nada é expulso da janela, então 6 ≠ 3 em qualquer arranjo. A recência
acrescenta *um* vermelho colateral (3 → 2), não é o mecanismo.
**Mantenha a fixture** — a escolha é conservadora e boa. Corrija o **comentário**: ele credita a
proteção ao mecanismo errado, que é a classe de defeito que este epic persegue. Risco nomeável: quem
confiar nele e trocar `toEqual` por `not.toContain("90 mil")` cria um verde falso justamente nas
conversas que truncam.

**R-A2 · Sim, existe um quarto ponto — e não é um quarto `.eq("conversation_id")`** *(informativo hoje)*
É **o eixo que não existe: organização.** Nenhuma das quatro consultas do carregador tem escopo de
org, e o único lugar que poderia reconciliar — o `pipeline.ts` — lê **dois** valores de org de fontes
diferentes e **nunca os compara**: `params.orgId` decide o prompt (`:545`) e os empreendimentos
(`:588`); `conversation.org_id` (`:615`) decide onde **escreve** (`:1453`, `:1515`, `:1600`). No
webhook do WhatsApp os dois nascem separados (`config.org_id` × `conversation.id`).
**Exposição prática hoje: zero** — conferi por Management API que `agent_config` tem **uma única
linha**. Mas o pivô SaaS multi-tenant está no roadmap, e esta função acabou de virar carregador único
de dois consumidores. Item de backlog, não conserto agora.
*Sub-achado medido:* a consulta a `users` (`:236`) é a única do carregador **sem escopo nenhum**.
Removendo o `.in("id", …)`, a suíte fica **2407/2407 verde** — **mutante equivalente** no
comportamento (o Map só é consultado por id), **não no risco**: passa a trazer a tabela `users`
inteira para a memória do turno, com service-role. Nenhuma mutação alcança isso e nenhum teste
alcançaria — é achado de leitura.

**R-A3 · O Change Log não basta, e agora com número** *(low)*
A entrada 1.0 tem **duas** ocorrências de "7/10" — a de contradição **e** a de engano — e **nenhuma
palavra de ressalva local**: medi `superad`, `v1.1`, `condicional`, `IC95`, `denominador` — todos
**ausentes** do parágrafo de ~4.000 caracteres. A ressalva ficou **referencial**, não local.
**Mitigação real que existe e que eu credito:** a tabela está em ordem **descendente** — a 1.1 vem
antes da 1.0, então quem lê sequencialmente encontra a correção primeiro.
**Ainda assim não basta:** quem faz `grep "7/10"`, abre no meio, ou copia a linha 1.0 para um resumo
de PR leva o número solto, nas duas conclusões. **Recomendo não reescrever o histórico** (é o ponto
de um Change Log) e inserir, após cada ocorrência, um marcador inline: *"⚠️ número superado na v1.1 —
taxa condicional, ver acima"*. Mesma disciplina do `NICOLE_SYSTEM_BLOCK_LEAK`: o identificador não
muda, só a frase. *(Não executei — só posso editar QA Results.)*

### Julgamento da régua aplicada à conclusão 2 — **concordo integralmente**

12/20 = 60 %, IC95 % [36,1 % ; 80,9 %] — bate com meu cálculo independente. E o mérito é dele: aplicou
a régua a uma afirmação que **ninguém tinha cobrado** e que sustentava a restrição mais dura do gate,
admitindo que "em contagem bruta B não é pior que o `HEAD`" — o que enfraquece o próprio argumento.
É a leitura honesta e é a certa.

**Dois reforços que ele não usou e que deixam o R1 mais forte:**
1. **Assimetria de reversibilidade.** A e B não são comparáveis na mesma escala: A é dano **herdado**
   (o rollback não o remove — ele *é* o estado atual); B seria **criado** (o rollback o remove). Um
   regime de deploy avalia a **variação**, não o nível. Por isso a contagem bruta é irrelevante, não
   apenas secundária.
2. **R1 é robusta a TODO o intervalo.** O custo de não fatiar é **zero** (é o default) e o benefício
   evita um defeito cujo limite inferior do IC é **36 %**. **Mesmo no pior canto a decisão é a
   mesma.** Uma restrição de deploy que sobrevive ao limite inferior do próprio IC não precisa que o
   ponto esteja certo — e é esse teste que R1 passa. Registro porque é o que responde a um eventual
   *"mas 12/20 é pouco"*: não é pouco nem muito, é **irrelevante para a decisão**.

### Por que continua CONCERNS — e a separação que importa

> **O código está LIBERADO PARA MERGE sob R1–R5. O que mantém o gate em CONCERNS não é o código: é
> que a JANELA DE OBSERVAÇÃO não está pronta.**

**A3** (a AC12-(ii) mede repetição de valor, que não muda, em vez de contradição e entrega de regra
interna, que é o que muda: 7/10 → 0/10) e **A4** (o gatilho de rollback ficou inalcançável e o evento
que sobra é compartilhado com o `[SISTEMA]`, sem campo que distinga) seguem abertos. O @dev os
delegou ao @po/@sm por serem reescrita de AC — **a delegação está correta e eu a endosso**. Mas os
dois precisam fechar **antes da janela de 24 h**, não antes do merge. Sem eles, o deploy sobe sem
conseguir dizer o que aconteceu depois — numa story cujo tema declarado é não errar em silêncio.

R1 (indivisibilidade), R2–R5 (fatiamento e ordem) e o carimbo de inconclusividade da AC12 permanecem
exatamente como estavam no round 1.

— Quinn, guardião da qualidade 🛡️

---

## Registro de deploy (@devops) — deploy A

### ⏱️ O marco zero da janela de 24 h

| evento | instante (UTC) | prova |
|---|---|---|
| merge do PR #426 em `main` | **2026-08-15T17:23:07Z** | commit de squash `6b760887408e01fd261b121041ef43bc16bafc03` |
| build servido em `trifold-crm.vercel.app` | entre 17:24:43Z e **17:25:03Z** | `data-dpl-id` `dpl_3rtLfNPnKRDoGegHdbSM85J1CBs6` → `dpl_CYuwt14S17k5Cuha9iBgMfqnhbW7` |
| build servido em `crm.trifold.eng.br` | entre 17:25:24Z e **17:25:45Z** | `data-dpl-id` `dpl_CmRmtz6CtrZuiE77PChXKp1hpaJk` → `dpl_AYcM7yYr2oYM8MENWshPggWAgRvC` |

> ### 🕐 **MARCO ZERO = `2026-08-15T17:25:45Z`** · **a janela de 24 h fecha em `2026-08-16T17:25:45Z`**
>
> Adotado o instante do **segundo** domínio, não do primeiro. Esta casa tem **dois projetos Vercel
> servindo builds diferentes**, e eles não trocam juntos: houve **42 s** em que
> `trifold-crm.vercel.app` já servia o código novo e `crm.trifold.eng.br` ainda servia o anterior.
> Antes de `17:25:45Z` não existia um instante em que os dois lados estivessem com o rótulo no ar —
> então o marco zero honesto é o mais tardio. Medido por amostragem a cada ~20 s; a precisão do
> instante é essa, não melhor.

### ✅ R1 — os seis símbolos indivisíveis, conferidos **em `main`** (não no PR)

Rótulo **sem** instrução é o único jeito conhecido de esta story **piorar** produção (5/10 a Nicole
diz ao lead que a fala do corretor *"não era pra você"* — defeito **novo**, criado pelo deploy).
Conferido contra `origin/main` **depois** do merge, símbolo a símbolo:

| # | símbolo (gate §7-R1) | em `main` |
|---|---|---|
| 1 | `packages/ai/src/chat/conversation-history.ts` (arquivo inteiro) | ✅ presente, 331 linhas |
| 2 | `pipeline.ts` — constante `CONTEXTO_FALA_DE_CORRETOR` | ✅ 3 ocorrências |
| 3 | `pipeline.ts:723` — `corretorContext = temFalaDeCorretor(history) ? … : ""` **+** soma ao `dynamicSuffix` (`:740`) | ✅ ambos |
| 4 | `pipeline.ts` — `...toAnthropicHistory(history)` | ✅ presente |
| 5 | `pipeline.ts` — `MARCACOES_INTERNAS` **+** os dois `.replace` de `[CORRETOR HUMANO` (`:181`, `:182`) | ✅ ambos |
| 6 | `pipeline.ts:866` — `lastAssistantMsg` restrito (AC3) | ✅ presente |

**6/6.** Nenhum ficou para trás.

### ✅ R2/R3 — o deploy B **NÃO** subiu

`git diff --name-only dc3c13c8 origin/main` nos três caminhos do deploy B devolve **vazio**:
`api/cron/enrich-leads/route.ts`, `flows/haiku-enrichment.ts`, `api/cron/enrich-leads/route.test.ts`.
Eles seguem **não commitados** na árvore de trabalho, aguardando **PR próprio ≥ 24 h depois**
(elegível a partir de `2026-08-16T17:25:45Z`). A ordem A→B é **dependência de import**
(`haiku-enrichment.ts` importa `rotuloDeCorretor` de `conversation-history.ts`), não preferência.

### ✅ R5 — sem migration

Zero arquivos `.sql` no PR. Conferido também que a árvore mesclada **não introduz nenhum prefixo de
migration duplicado novo** — as 20 duplicatas de prefixo (`021`, `024`, …, `170`) são **idênticas**
às que já estavam em `main` antes destes merges.

### 🔴 A janela começou **com a instrumentação incompleta** — leitura antecipada é inconclusiva **por construção**

Este é o item que mais provavelmente vai ser lido errado daqui a um dia, então fica explícito:

- **A3 e A4 (@po/@sm) seguem ABERTOS.** O próprio re-gate escreveu que os dois precisam fechar
  **antes da janela de 24 h**, não antes do merge. Eles não fecharam, e a janela **já está correndo**.
- Some-se a isso o que o gate já carimbava: a janela tem **~21 % de chance** de produzir um caso de
  reativação espontâneo (0,23 evento/dia; só 10 das 305 conversas com corretor ainda têm
  `is_ai_active`).
- **Consequência prática:** qualquer leitura da AC12 feita **antes** de A3/A4 fecharem é
  **inconclusiva por construção** — silêncio na janela **não é evidência de que deu certo**, é
  evidência de que não houve o que medir e de que a régua ainda não estava escrita. Não converter
  ausência de incidente em aprovação.
- O caminho que **produz** resultado continua sendo o cenário **provocado com telefone de teste**
  (como a AC10 da 87-4), e ele depende de A3/A4 definirem o que se mede.

### ✅ O SHA **foi** confirmado — pela API de Deployments do GitHub, sem token da Vercel

O próprio bot da Vercel publica um `deployment` no GitHub **carimbado com o SHA**, e um `status` por
projeto. Para `sha=6b760887408e01fd261b121041ef43bc16bafc03` (deployment `5922860667`):

| projeto (time) | status | instante (UTC) | domínio vivo correspondente |
|---|---|---|---|
| `freelans-projects-d9ab20e0` | ✅ `success` | **17:24:56Z** | `trifold-crm.vercel.app` |
| `trifold-s-projects` | ✅ `success` | **17:25:37Z** | `crm.trifold.eng.br` |

**As duas medições se confirmam mutuamente e a ordem bate:** o `success` do `freelans` (`17:24:56Z`)
vem imediatamente antes do flip observado em `trifold-crm.vercel.app` (`≤17:25:03Z`), e o `success`
do `trifold-s` (`17:25:37Z`) imediatamente antes do flip em `crm.trifold.eng.br` (`≤17:25:45Z`). A
defasagem de 42 s entre os domínios é a **mesma** defasagem de 41 s entre os dois builds. Não é
coincidência temporal: é o mesmo evento visto por dois instrumentos independentes.

Idem para o deploy do #425 (`sha=dc3c13c8`, deployment `5922838150`): `success` nos dois projetos às
`17:22:09Z` e `17:22:10Z`, contra o flip observado entre `17:21:58Z` e `17:22:18Z`.

### ⚠️ O que este registro **NÃO** prova

- **Não amarrei cada `dpl_…` ao SHA por dentro.** O que a API do GitHub prova é que **houve build de
  produção bem-sucedido daquele SHA nos dois projetos**, no instante certo; o que o `data-dpl-id`
  prova é que **o domínio passou a servir outro deployment**, no mesmo instante. Fechar o elo
  (*"o alias `crm.trifold.eng.br` aponta para o deployment X, e X veio do SHA Y"*) exigiria a API da
  Vercel, **bloqueada por SAML** no escopo `trifold-s-projects`. Tentei fechar pelo caminho de fora —
  buscar o `data-dpl-id` nas URLs de deployment (`trifold-ihbhajpfk-…`, `trifold-1m331dwft-…`) — e
  **não serve**: as duas redirecionam para `vercel.com/login` (proteção de deployment) e devolvem o
  `dpl_FnjXYHAuYSshE5Wfogd1zBxS93we` **da página de login da Vercel**, não da nossa aplicação. Registro
  o beco sem saída para ninguém repetir a tentativa achando que mede o que não mede.
- **Não validei comportamento em produção.** A AC12 é a validação, e ela é do @qa + responsável
  nomeado (D7) — não foi executada.
- **Não conferi qual dos dois projetos Vercel atende o webhook do WhatsApp.** Como ambos trocaram, a
  conclusão "o rótulo está no ar" vale para os dois lados de qualquer forma; mas a atribuição do
  tráfego real da Nicole a um projeto específico segue **não medida**.

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-15 | **1.4** | **Correção da própria v1.3: eu havia carimbado "não confirmei o SHA de origem dos deployments" e isso era pessimismo desnecessário — dá para confirmar SEM token da Vercel.** A API de Deployments do **GitHub** carrega o carimbo do bot da Vercel: `sha=6b760887…` → deployment `5922860667` com **um `status: success` por projeto** — `freelans-projects-d9ab20e0` às `17:24:56Z` e `trifold-s-projects` às `17:25:37Z`. **Isto fecha com a medição de fora e a ordem bate:** cada `success` vem imediatamente antes do flip de `data-dpl-id` do domínio correspondente (`≤17:25:03Z` e `≤17:25:45Z`), e a defasagem de **42 s** entre os domínios é a **mesma** dos 41 s entre os builds — o mesmo evento por dois instrumentos independentes, não coincidência. Idem para o #425 (`dc3c13c8` → `5922838150`, `success` nos dois às `17:22:09Z`/`17:22:10Z`). **O marco zero NÃO muda: segue `2026-08-15T17:25:45Z`** (instante do segundo domínio). **Beco sem saída registrado para ninguém repetir:** buscar o `data-dpl-id` nas URLs de deployment (`trifold-ihbhajpfk-…`, `trifold-1m331dwft-…`) **não mede nada** — as duas redirecionam para `vercel.com/login` por proteção de deployment e devolvem o `dpl_` da **página de login da Vercel** (`dpl_FnjXYHAuYSshE5Wfogd1zBxS93we`, idêntico nas duas, que é o sinal de que não é a nossa app). **O que continua aberto** é só o elo alias→deployment (*"`crm.trifold.eng.br` aponta para o deployment X, e X veio do SHA Y"*), que exige a API da Vercel, bloqueada por SAML. Só documento; nenhuma linha de código, sem migration, sem DDL. | @devops (Gage) |
| 2026-08-15 | **1.3** | **Deploy A EM PRODUÇÃO. Merge do PR #426 (squash `6b760887`) às `17:23:07Z`; código servido nos DOIS domínios a partir de `17:25:45Z` — este é o MARCO ZERO da janela de 24 h, que fecha em `2026-08-16T17:25:45Z`.** Registro completo em **§ Registro de deploy (@devops)**. **Marco zero é o instante do SEGUNDO domínio, deliberadamente:** os dois projetos Vercel não trocam juntos e houve **42 s** com `trifold-crm.vercel.app` já no código novo e `crm.trifold.eng.br` ainda no anterior — antes de `17:25:45Z` não existia instante com o rótulo no ar dos dois lados. **R1 conferido em `origin/main` DEPOIS do merge, não no PR: 6/6 símbolos presentes** (arquivo `conversation-history.ts` inteiro com 331 linhas; `CONTEXTO_FALA_DE_CORRETOR`; `corretorContext` + soma ao `dynamicSuffix`; `...toAnthropicHistory`; `MARCACOES_INTERNAS` + os dois `.replace` de `[CORRETOR HUMANO`; `lastAssistantMsg` restrito). O cenário que R1 existe para impedir — rótulo sem instrução, que **cria** um defeito novo em produção — **não ocorreu**. **R2/R3: o deploy B NÃO subiu** — `git diff` nos três caminhos contra o commit anterior devolve vazio; eles seguem não commitados na árvore de trabalho, para PR próprio elegível a partir de `2026-08-16T17:25:45Z` (a ordem A→B é dependência de import, não preferência). **R5: zero `.sql`**, e a árvore mesclada não introduz nenhum prefixo de migration duplicado novo (as 20 duplicatas são idênticas às pré-existentes em `main`). **🔴 A JANELA COMEÇOU COM INSTRUMENTAÇÃO INCOMPLETA:** A3 e A4 (@po/@sm) seguem ABERTOS, e o próprio re-gate exigia que fechassem **antes** da janela. Somado aos ~21 % de chance de caso espontâneo, **qualquer leitura da AC12 antes de A3/A4 fecharem é inconclusiva POR CONSTRUÇÃO** — silêncio na janela não é evidência de sucesso, é evidência de que não houve o que medir. **NÃO verificado:** o SHA de origem dos deployments (a correlação é temporal, não criptográfica — a API da Vercel é bloqueada por SAML no escopo `trifold-s-projects`) ⚠️*(afirmação SUPERADA na v1.4 — o SHA **foi** confirmado pela API de Deployments do GitHub, que não precisa de token da Vercel; o que fica aberto é só o elo alias→deployment)*; a AC12 em si (é do @qa + responsável D7); e qual dos dois projetos atende o webhook do WhatsApp. **Status permanece `Ready for Review` — NÃO promovido a `Done`.** Sem migration, sem DDL. | @devops (Gage) |
| 2026-08-15 | **1.2** | **Fechamento dos TRÊS itens do re-gate (round 2). Só comentário e documento — `md5` de produção intacto (`conversation-history.ts` = `79e6596f…`, `pipeline.ts` = `e4f3df64…`).** **(1) R-A1 — a minha justificativa de fixture estava ERRADA e o comentário enganava.** Eu havia escrito que a conversa alheia precisava ser mais RECENTE, senão o teste "passaria verde nos dois mundos"; o @qa mediu com a fixture antiga (09:01+) e refutou. **Remedi por conta própria** (aplicar · rodar · ler · reverter · `md5`, restaurado em 3/3), removendo UM predicado por vez no alvo isolado (baseline 39/39): a JANELA (`:282`) derruba **3** com as alheias recentes e **2** com as antigas; o COUNT (`:308`) e o SINAL (`:317`) derrubam **1 em cada arranjo**. **O mecanismo é a asserção, não a fixture:** são 6 mensagens com `limit(20)`, nada é expulso da janela em arranjo nenhum, e a igualdade da lista inteira (`toEqual`) mais os valores exatos (`totalEntradas === 4`, `totalNaConversa === 22`, `nossoLadoFalouForaDaJanela === false`) fazem 6 ≠ 3 sempre. A recência acrescenta **um** vermelho colateral (o controle positivo). **A fixture FICA** — um vermelho a mais é cinto e suspensório —, o comentário do bloco de isolamento foi reescrito com o mecanismo real, e ficou nomeado o que **não** se pode enfraquecer: trocar o `toEqual` por `not.toContain(…)` cria verde falso justamente nas conversas que **truncam**, onde a alheia sai da janela por acidente de volume, sem predicado nenhum. A afirmação superada ganhou marcador inline na entrada 1.1 abaixo. **(2) R-A3 — o marcador de superado agora alcança quem lê no meio.** A entrada 1.0 tinha **duas** ocorrências de "7/10" e **zero** palavras de ressalva dentro dela. **Histórico NÃO reescrito** (o ponto de um Change Log é preservar o que foi afirmado): duas inserções **inline**, uma imediatamente após cada ocorrência, com a taxa condicional, o agregado (**17/20**, IC95 % [62 % ; 97 %]; e **12/20**, IC95 % [36 % ; 81 %]) e a ressalva de denominador. Mesma disciplina do `NICOLE_SYSTEM_BLOCK_LEAK`: o texto original não muda, só ganha a ressalva ao lado. **(3) R-A2 — o achado de ORGANIZAÇÃO foi REGISTRADO, não consertado.** Item novo em `docs/backlog.md` (`[ARQ] O carregador de histórico não tem eixo de ORGANIZAÇÃO`), **dono @architect**, destino o épico do pivô SaaS multi-tenant. Conferido por leitura própria: nenhuma das quatro consultas do carregador tem escopo de org, e o `pipeline.ts` lê **dois** valores de org sem compará-los — `params.orgId` decide prompt (`:545`) e empreendimentos (`:588`), `conversation.org_id` (`:615`) decide **onde escreve** (`:1453`, `:1515`, `:1564`, `:1600`) — e no webhook do WhatsApp os dois nascem separados (`route.ts:400`). **Exposição hoje ZERO** (uma linha em `agent_config`); no pivô vira o mesmo vazamento cross-lead um nível acima. **Sub-achado com linha própria:** a consulta a `users` (`:236`) é a única do carregador **sem escopo nenhum** — remover o `.in("id", …)` deixa a suíte inteira verde: **equivalente em comportamento, NÃO em risco** (traz `users` inteira para a memória do turno, com service-role). Mantido: a leitura é a única guarda. **Deliberadamente NÃO feito:** A3 e A4 (reescrita de AC — @po/@sm, prazo é antes da janela de 24 h, não antes do merge) e R1 (ordem de deploy — @devops). **Réguas remedidas:** suíte **187 arquivos · 2.407 passed · 6 expected fail**; `tsc --noEmit` **0** em `packages/web` e **0** em `packages/ai`; `npx turbo lint --force` **0 errors / 23 warnings**. **Nenhuma linha de produção, sem migration, sem DDL, sem push.** | @dev (Dex) |
| 2026-08-15 | **1.1** | **Fechamento do gate CONCERNS (round 1) — os DOIS itens do @dev, e nada além.** **(1) 🔴 Achado A1 — o isolamento entre conversas ganhou rede, nos dois consumidores.** É a exigência nº 1 do Gabriel (*"jamais pegar informações de outra conversa, de outro lead"*) e não tinha um único teste. Confirmei o achado do @qa por mutação própria e **decompus o predicado em três**, porque `.eq("conversation_id", …)` aparece em três consultas que respondem perguntas diferentes: a **janela** (`:282`), o **count** de `total_na_conversa` (`:308`) e o **sinal** `nossoLadoFalouForaDaJanela` (`:317`). **Medido contra a suíte inteira, aplicar · rodar · ler · reverter · `md5`: as três davam ZERO vermelhos (187 arquivos · 2.401 passed, idêntico ao verde); agora dão 4, 1 e 1**, cada uma com vermelho **dedicado e disjunto**. Zero por motivos DIFERENTES em cada consumidor: no cron o mock tinha `eq: () => builder` e o predicado **nem era avaliado** (mesma família do `.in()` da v1.0, uma linha acima); no `packages/ai` o `fake-supabase` aplica o `.eq()` de verdade, mas **nenhuma fixture tinha uma segunda conversa** — o predicado nunca discriminava. **O conserto do mock é necessário e está provado nas quatro células:** com o mock antigo o teste de isolamento do cron falha **mesmo com o código íntegro** — quem deixava a conversa alheia passar era o mock. As fixtures alheias são deliberadamente **mais recentes** (10:40+ vs 10:01+): a consulta é `created_at` descendente com `limit`, então sem o predicado elas **dominam a cauda** em vez de só se somarem — com a outra conversa mais antiga o teste passaria verde nos dois mundos. ⚠️*(afirmação SUPERADA na v1.2 — REFUTADA por medição: com as alheias em 09:01+ a mutação da janela ainda derruba 2 dos 3. O mecanismo é a igualdade da lista inteira, não a recência; a recência só acrescenta 1 vermelho colateral)* Cada asserção é sobre a **lista inteira** (`toEqual`), e os três vazamentos são nomeados: valor (*"90 mil"*), corretor (*"Valeria"*) e lead (*"Fernanda"*) alheios. **+6 testes** (5 no `packages/ai`, 1 no cron), com controle positivo para o sinal. **(2) Achado A2 — adotada a redação autorizada pelo gate (§4) para o experimento com o modelo**, na seção da AC5. **A frase da entrada 1.0 abaixo (*"em 7/10 ela contradiz a negociação fechada"*) fica SUPERADA por esta:** *"No cenário de reativação com valor fechado na última fala do corretor, o `HEAD` contradisse a negociação em **17 de 20 execuções** (85 %, IC95 % [62 % ; 97 %]; duas amostras independentes de n=10 contra `claude-sonnet-4-6` em temperatura 0,7, fixture única) — e em 7 de 10 entregou ao lead a regra comercial interna 'a entrada mínima é 20 %'. **A taxa é condicional a esse cenário e NÃO é a taxa dos turnos da Nicole.**"* Mesma disciplina aplicada à conclusão 2 (rótulo sem instrução: 7/10 meu + 5/10 do @qa = **12/20, IC95 % [36 % ; 81 %]**, e o que decide é a **natureza** do defeito — novo, criado pelo deploy —, não a contagem bruta). **Deliberadamente NÃO feito:** R1 (indivisibilidade de deploy — instrução para o @devops, não código), AC12 (pós-deploy, sem responsável nomeado por D7) e os achados A3/A4/A5, que são reescrita de AC e pertencem ao @po/@sm. **Réguas remedidas:** suíte **187 arquivos · 2.407 passed · 6 expected fail** (era 2.401); `tsc --noEmit` **0** em `packages/web` e **0** em `packages/ai`; `npx turbo lint --force` **0 errors / 23 warnings**. A régua da raiz (14.292 linhas) é baseline e não é gate. **Sem migration, sem DDL, sem push.** | @dev (Dex) |
| 2026-08-15 | **1.0** | **Implementada por @dev (YOLO) sobre `main` em `24800872`. `Ready → Ready for Review`.** Entregues os dois deploys em código (A: leitura da Nicole; B: `enrich-leads`), com a separação das janelas a cargo do @devops. **Carregador único** extraído para `packages/ai/src/chat/conversation-history.ts` (a AC7 não fechava com a função privada em `pipeline.ts`): três papéis, normalização da transição na leitura, nome do corretor resolvido em **uma consulta em lote** e rótulo montado só na fronteira da API. **T0 remedida contra produção em 15/08 e os números subiram:** broker **1.288**/305 (a story dizia 900), user 1.042/194, assistant 588/144; a condição de escape **não dispara em nenhuma das quatro leituras** — na população declarada (Nicole **E** corretor, 94 convs) são **26,6 %** contra limiar de 10 %; reativação **10 conversas / 30 respostas cegas**, com **10** ainda `is_ai_active`. **Decisão escrita da T0-(d): as 162 mensagens-placeholder ENTRAM** (74 % têm rótulo semântico; filtrar depois do `limit(20)` encolheria a janela justamente nas conversas longas). **AC6 medida:** 1 erro de `type-check` antes das subtrações, **5** depois — e os que ele não pega ficaram nomeados por escrito. **🔎 SÉTIMO consumidor encontrado:** o evento `NICOLE_HISTORY_TRUNCATED` (criado pela 87-8, depois desta story ser escrita) muda de referente e foi tratado — sem isso ele publicaria `total_na_conversa` MENOR que o próprio `limite`. **Vermelhos medidos por mutação, não declarados** (16 mutações no deploy A, 3 no B): M2 derruba 15, M4 (o `HEAD`) derruba 12, M1 derruba 6. **🔴 Dois verdes falsos encontrados e consertados:** (a) o mock do `enrich-leads` tinha `in: () => builder` e **não filtrava papel nenhum** — a mutação do filtro derrubava **ZERO** teste; (b) a AC5-(ii) era verificada sobre a string concatenada do `system`, e mover a instrução para um bloco **cacheável** não derrubava nada. Os dois passaram a derrubar. **🔴🔴 A premissa da AC5-(i) NÃO se confirma:** rodei o payload real contra `claude-sonnet-4-6` (n=10 por variante) e ela **não repete o valor em 0/10**, nem sem a instrução — a RN4 estática já cobre. **Mas o dano do `HEAD` é maior do que a story dizia:** em **7/10** ⚠️*(número SUPERADO na v1.1 — taxa condicional ao cenário de reativação com valor fechado na última fala; denominador não declarado. Agregado com a amostra independente do @qa: **17/20**, IC95 % [62 % ; 97 %]. NÃO é a taxa dos turnos da Nicole)* ela **contradiz a negociação fechada** (*"não é bem assim, a entrada mínima é 20 %"*), entregando regra comercial interna; e **sem a instrução o rótulo troca um defeito por outro** — em **7/10** ⚠️*(número SUPERADO na v1.1 — mesma ressalva de denominador. Agregado: **12/20**, IC95 % [36 % ; 81 %]; o que sustenta a restrição de deploy é a NATUREZA do defeito — novo, criado pelo deploy —, não a contagem bruta)* ela diz ao lead que a mensagem do corretor *"não era pra você"*. Com a instrução: **10/10** atribuem ao corretor. **Subir o rótulo sem a AC5 seria pior que não subir nada.** **Uma adição fora das ACs, declarada:** `stripSystemBlocks` passa a higienizar `[CORRETOR HUMANO…]` da saída — é subtração, reusa o mecanismo da 75-279 e fecha estruturalmente o gatilho de rollback "o rótulo aparecendo em mensagem enviada ao lead", que até então dependia só de o modelo obedecer. **Réguas:** suíte 186→**187** arquivos e 2.363→**2.401** passed (6 expected fail, iguais); `tsc` 0 em `packages/web` e em `packages/ai`; `lint` **0 errors / 23 warnings** (baseline). Sem migration e sem DDL. **T8/T9 (deploys + AC12) ficam com @devops e @qa.** | @dev (Dex) |
| 2026-08-07 | **0.2** | **Validação @po (primeira) — ✅ GO condicional (8/10) com as correções aplicadas na mesma passada. `Draft → Ready`.** Aprovados sem ressalva: o desenho **papel interno ≠ papel da API** (conferido no SDK: `MessageParam.role` é `'user' \| 'assistant'`, `messages.d.ts:296` — e mapear o corretor para `user` seria pior, o argumento está certo), a **ordem depois do `W1-1`** (os argumentos do @sm e do @pm são o mesmo eixo visto de dois lados, não se contradizem), o **cabimento na Onda 1** condicionado a AC3/AC4 restritivas, e a **exclusão da identificação de imóvel** (AC9). **Seis correções minhas, todas medidas contra produção e contra o `HEAD`:** **(1) 🔴 A AC6 estava inexequível.** Rodei o alargamento de `Message.role` sob `tsc --strict` numa réplica das seis formas do `HEAD`: ele produz **1 erro, não 6** — os outros cinco são calados por dois casts (linhas 710 e 1157), por dois parâmetros `role: string` (`buildNoReintroContext`, `HandoffMessage`) e por o `enrich-leads` não usar o tipo. E medi a variante: **mesmo sem o cast, o `lastAssistantMsg` não acende**, porque comparar union largo com literal é TS válido — ou seja, o consumidor mais perigoso da story é invisível ao compilador em qualquer variante. AC6 reescrita (grep como mapa primário, `type-check` como rede secundária apertada por **subtração**, e o que ele não pega **nomeado**); mitigação do Risco 8 trocada. **(2) 🔴 O rótulo não teria nome nenhum:** `metadata.broker_id` existe em **0 das 900** mensagens `role='broker'` — ele só é gravado nas **104** transições. As reais usam `sent_by` (795) e `signed_as` (428, que **já é o primeiro nome**). Ordem de resolução corrigida, com o alerta de **não fazer N+1** no caminho quente. **(3) 🔴 A condição de escape não declarava o denominador**, e as leituras caem dos dois lados do limiar de 10 %: todas 8,9 % · com corretor 8,4 % · com Nicole 16,9 % · **Nicole+corretor (a população que a story muda) 20,0 %**. Denominador declarado; **o escape não dispara e a ordem fica confirmada por número**. Mesma correção pedida ao @pm no epic. **(4) A premissa da AC8 estava errada:** `generateHandoffSummary` só imprime `role === 'user'` (`handoff.ts:141`) — nunca atribui fala nenhuma à Nicole; o efeito real é o `TOTAL DE MENSAGENS`. AC8 virou não-regressão, e a "correção mínima" que ela propunha (marcar autor no resumo) é comportamento novo, fora da Onda 1. **(5) A AC12 esperava um evento que provavelmente não ocorre na janela:** reativação acontece **0,23×/dia** e só **9 das 286** conversas com corretor ainda têm `is_ai_active` — ~21 % de chance em 24 h. Passa a ser cenário **provocado** com telefone de teste, como a AC10 da 87-4. **(6) A AC7 não fechava:** `loadConversationHistory` é **privada** (`pipeline.ts:1534`) e o `enrich-leads` vive em outro pacote — exportá-la de `@trifold/ai` entrou na T2. **Exposição corrigida no cabeçalho:** 287 é a população **histórica**; a **viva** é **9**, o que baixa o risco de regressão e é o que cobrou a correção (5). Volumes remedidos: broker **900**/286, user **873**/182, assistant **612**/136; reativação **7 conversas / 27 respostas** (a v0.1 dizia 9/31). Registradas as **105** mensagens-placeholder como decisão de T0. | @po (Pax) |
| 2026-08-07 | 0.1 | Story criada a partir da decisão do Gabriel, com os volumes medidos pelo @po (broker **882 msgs / 287 conversas** em 30 dias — maior que `user` e `assistant`; **9 conversas** com **31 respostas cegas** da Nicole após fala do corretor; *"entrada de 35 mil"* do Odair na conversa da Sandra). **Recomendação de escopo do @sm: story própria (`W1-7`), NÃO fundida no `W1-1`** — quatro razões (o arquivo é o mesmo mas a mudança não é; fundir atrasa a que dói mais atrás da fila do `W1-3b`; um fix de substrato por deploy; e o `lastAssistantMsg` se resolve **ordenando**, não fundindo), com **ordem recomendada depois do `W1-1`** por razão técnica (com cabeça-20 o corretor come o orçamento da janela; com cauda-20 "as últimas 20 de quem quer que seja" é a janela certa para três interlocutores) e uma **condição de escape medível** (<10% das conversas acima de 20 mensagens). Cabe na Onda 1 **condicionado** a `lastAssistantMsg` e `buildNoReintroContext` serem fixados na direção **restritiva** (AC3, AC4). Levantados contra o `HEAD`: a restrição dura de que `Anthropic.MessageParam` só aceita dois papéis (daí **papel interno ≠ papel da API**), os **seis** consumidores de `history` com decisão para cada um, o alargamento do tipo `Message` como **localizador** de consumidores (AC6), e a exclusão deliberada da identificação de imóvel (AC9) por ser caminho de decisão novo. Defeito 2 (fala humana de transição lida como da Nicole) tratado **junto**, por ser a mesma raiz, com normalização **na leitura** — a gravação em `send-message/route.ts:214` não é tocada e o conserto de origem continua em `docs/backlog.md`. **Dois deploys** numa story: leitura da Nicole (A) e extração `enrich-leads` (B, atrás da 87-4 em produção). | @sm (River) |
