# Story 87-5 — A Nicole passa a enxergar o corretor: histórico com rótulo de papel

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready
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

- [ ] **T0** — Medir antes de escrever código: (a) % de conversas **com mensagem `assistant` E
      mensagem `broker` nos últimos 30 dias** que passam de 20 mensagens — **o denominador é este e
      está declarado** (decide a condição de escape da ordem vs `W1-1`; referência do @po em 07/08:
      **20,0 %**, o dobro do limiar ⇒ **não** dispara); (b) reconfirmar os volumes por papel
      (referência: broker **900**/286, user **873**/182, assistant **612**/136);
      (c) listar as conversas do cenário de reativação (referência: **7 conversas, 27 respostas** em
      30 dias) **e as que ainda têm `is_ai_active = true`** (referência: **9**);
      (d) **decidir por escrito** o que fazer com as **105** mensagens-placeholder
      (`[Arquivo]`/`[Mídia]`/`[Áudio]`) — incluir ou filtrar (Desenho §3).
- [ ] **T1** — Alargar `Message.role`; **estreitar** `buildNoReintroContext` e `HandoffMessage` para
      `Message["role"]` e **remover os casts** das linhas 710 e 1157; colar a lista de erros de
      `type-check` **antes e depois**, e nomear por escrito o que ele **não** pega (AC6).
      ⚠️ **Referência do @po: o alargamento sozinho produz 1 erro, não 6.** Não conclua que só existe
      um consumidor — o mapa primário é o `grep` da AC6-(i).
- [ ] **T2** — `loadConversationHistory`: `.select` com `metadata`, `.in` com os três papéis,
      normalização da transição, **e EXPORTAR a função de `@trifold/ai`** (hoje é privada de
      `pipeline.ts:1534`; sem isso a AC7 não fecha). **Uma função só** (AC1, AC2, AC7).
- [ ] **T3** — Fronteira da API: rótulo textual em `pipeline.ts:924-931` (AC1, AC5-iii).
- [ ] **T4** — `lastAssistantMsg` restrito à Nicole + `buildNoReintroContext` contando os dois lados,
      com os vermelhos (AC3, AC4).
- [ ] **T5** — Instrução da RN4 no `dynamicSuffix`, com a fixture do Odair e o vermelho (AC5).
- [ ] **T6** — `generateHandoffSummary` (AC8) e a **não-mudança** da identificação de imóvel (AC9).
- [ ] **T7** — Snapshots dos turnos-ouro sem corretor (AC10) + suíte verde (AC11).
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

*(a preencher pelo @dev)*

## QA Results

*(a preencher pelo @qa)*

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-07 | **0.2** | **Validação @po (primeira) — ✅ GO condicional (8/10) com as correções aplicadas na mesma passada. `Draft → Ready`.** Aprovados sem ressalva: o desenho **papel interno ≠ papel da API** (conferido no SDK: `MessageParam.role` é `'user' \| 'assistant'`, `messages.d.ts:296` — e mapear o corretor para `user` seria pior, o argumento está certo), a **ordem depois do `W1-1`** (os argumentos do @sm e do @pm são o mesmo eixo visto de dois lados, não se contradizem), o **cabimento na Onda 1** condicionado a AC3/AC4 restritivas, e a **exclusão da identificação de imóvel** (AC9). **Seis correções minhas, todas medidas contra produção e contra o `HEAD`:** **(1) 🔴 A AC6 estava inexequível.** Rodei o alargamento de `Message.role` sob `tsc --strict` numa réplica das seis formas do `HEAD`: ele produz **1 erro, não 6** — os outros cinco são calados por dois casts (linhas 710 e 1157), por dois parâmetros `role: string` (`buildNoReintroContext`, `HandoffMessage`) e por o `enrich-leads` não usar o tipo. E medi a variante: **mesmo sem o cast, o `lastAssistantMsg` não acende**, porque comparar union largo com literal é TS válido — ou seja, o consumidor mais perigoso da story é invisível ao compilador em qualquer variante. AC6 reescrita (grep como mapa primário, `type-check` como rede secundária apertada por **subtração**, e o que ele não pega **nomeado**); mitigação do Risco 8 trocada. **(2) 🔴 O rótulo não teria nome nenhum:** `metadata.broker_id` existe em **0 das 900** mensagens `role='broker'` — ele só é gravado nas **104** transições. As reais usam `sent_by` (795) e `signed_as` (428, que **já é o primeiro nome**). Ordem de resolução corrigida, com o alerta de **não fazer N+1** no caminho quente. **(3) 🔴 A condição de escape não declarava o denominador**, e as leituras caem dos dois lados do limiar de 10 %: todas 8,9 % · com corretor 8,4 % · com Nicole 16,9 % · **Nicole+corretor (a população que a story muda) 20,0 %**. Denominador declarado; **o escape não dispara e a ordem fica confirmada por número**. Mesma correção pedida ao @pm no epic. **(4) A premissa da AC8 estava errada:** `generateHandoffSummary` só imprime `role === 'user'` (`handoff.ts:141`) — nunca atribui fala nenhuma à Nicole; o efeito real é o `TOTAL DE MENSAGENS`. AC8 virou não-regressão, e a "correção mínima" que ela propunha (marcar autor no resumo) é comportamento novo, fora da Onda 1. **(5) A AC12 esperava um evento que provavelmente não ocorre na janela:** reativação acontece **0,23×/dia** e só **9 das 286** conversas com corretor ainda têm `is_ai_active` — ~21 % de chance em 24 h. Passa a ser cenário **provocado** com telefone de teste, como a AC10 da 87-4. **(6) A AC7 não fechava:** `loadConversationHistory` é **privada** (`pipeline.ts:1534`) e o `enrich-leads` vive em outro pacote — exportá-la de `@trifold/ai` entrou na T2. **Exposição corrigida no cabeçalho:** 287 é a população **histórica**; a **viva** é **9**, o que baixa o risco de regressão e é o que cobrou a correção (5). Volumes remedidos: broker **900**/286, user **873**/182, assistant **612**/136; reativação **7 conversas / 27 respostas** (a v0.1 dizia 9/31). Registradas as **105** mensagens-placeholder como decisão de T0. | @po (Pax) |
| 2026-08-07 | 0.1 | Story criada a partir da decisão do Gabriel, com os volumes medidos pelo @po (broker **882 msgs / 287 conversas** em 30 dias — maior que `user` e `assistant`; **9 conversas** com **31 respostas cegas** da Nicole após fala do corretor; *"entrada de 35 mil"* do Odair na conversa da Sandra). **Recomendação de escopo do @sm: story própria (`W1-7`), NÃO fundida no `W1-1`** — quatro razões (o arquivo é o mesmo mas a mudança não é; fundir atrasa a que dói mais atrás da fila do `W1-3b`; um fix de substrato por deploy; e o `lastAssistantMsg` se resolve **ordenando**, não fundindo), com **ordem recomendada depois do `W1-1`** por razão técnica (com cabeça-20 o corretor come o orçamento da janela; com cauda-20 "as últimas 20 de quem quer que seja" é a janela certa para três interlocutores) e uma **condição de escape medível** (<10% das conversas acima de 20 mensagens). Cabe na Onda 1 **condicionado** a `lastAssistantMsg` e `buildNoReintroContext` serem fixados na direção **restritiva** (AC3, AC4). Levantados contra o `HEAD`: a restrição dura de que `Anthropic.MessageParam` só aceita dois papéis (daí **papel interno ≠ papel da API**), os **seis** consumidores de `history` com decisão para cada um, o alargamento do tipo `Message` como **localizador** de consumidores (AC6), e a exclusão deliberada da identificação de imóvel (AC9) por ser caminho de decisão novo. Defeito 2 (fala humana de transição lida como da Nicole) tratado **junto**, por ser a mesma raiz, com normalização **na leitura** — a gravação em `send-message/route.ts:214` não é tocada e o conserto de origem continua em `docs/backlog.md`. **Dois deploys** numa story: leitura da Nicole (A) e extração `enrich-leads` (B, atrás da 87-4 em produção). | @sm (River) |
