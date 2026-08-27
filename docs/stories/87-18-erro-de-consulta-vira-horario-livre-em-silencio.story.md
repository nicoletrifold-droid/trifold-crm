# Story 87-18 — Erro na consulta da agenda para de virar "horário livre" em silêncio

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review (@qa)
**Item do roadmap:** fora da matriz `W1`–`W4` original — story corretiva aberta por leitura de
código na revisão do PR `#517` (Story 87-17), mesma família dos itens de "confiabilidade de
contexto" e classe irmã da própria `87-17` (lá a Nicole negava horário que existia; aqui o sistema
pode **afirmar livre** um horário que na verdade não sabe se está livre).
**⚠️ Decisão do Marcos (27/08/2026): o PR `#517` (87-17) ESPERA esta correção.** Os dois sobem na
ordem que o @po definir — nenhum dos dois está liberado para produção isoladamente até essa ordem
ser fixada. Ver §0.
**✅ Validada por @po (Pax) em 2026-08-27** — parecer em `docs/qa/po-validation-87-18.md`, placar
**8,0/10**, `Draft` → `Ready`. Três decisões arbitradas (ordem de deploy, escopo dos dois sítios de
`packages/web`, forma do `emit`) e seis correções aplicadas no corpo, em blocos marcados
**`[@po 27/08]`**. 🔴 **Base de implementação: a branch `fix/87-17-fatia1-oferta-de-horario-espalhada`
(`cdf4411e`), NÃO `main`** — ver §0.
**Criada por:** @sm (River) em 2026-08-27, por leitura de código — **NÃO por achado de bot** (a
fonte é a leitura de código de 27/08; achado de CodeRabbit não é insumo desta story).
**Formato:** Correção de um `error` de consulta descartado que hoje é interpretado como "slot
livre". Sem campo novo, sem migration, sem escrita em `AgendaState`/`ofertas_do_sistema` — mesma
disciplina de corte da Onda 1 que a `87-17` já seguiu.
**Executor:** @dev · **Quality gate:** @qa
**Esforço:** S/M — um função pura de baixo nível ganha um terceiro estado, dois chamadores diretos
mudam de forma de retorno, quatro sítios em `pipeline.ts` ganham uma frase honesta nova, e ~15
chamadas de teste existentes migram de assinatura (mecânico, não é lógica nova).
**Risco:** Baixo — é estritamente mais defensivo que o `HEAD` (nunca oferece/confirma um horário que
não pôde ser confirmado); o risco real é mecânico (atualizar as chamadas de teste existentes sem
perder cobertura), não comportamental.
**Fila de deploy do Epic 87:** fora dela. Esta story não toca `agenda_registro`, os campos
reservados de `AgendaState`, nem os três despejos crus de `collected_data` — mesma fronteira que a
`87-17` já demarcou. Conflito **textual** em `pipeline.ts`/`visit-slot.ts` com a Fatia 2 da `87-17`
(ainda não implementada) é possível, porque as duas tocam a mesma cadeia de `if` de agendamento e a
mesma função `freeSlotsInPeriod` — é resolução de merge, não de ordem (ver R5).

> ### O que esta story faz, em uma frase
>
> Hoje `isSlotFree` (`packages/ai/src/flows/visit-slot.ts:552-574`) descarta o `error` de
> `await q.limit(1).maybeSingle()` e devolve `!data` — então **qualquer erro de consulta** ao
> `appointments` (RLS surpresa, coluna renomeada, timeout do PostgREST, cache de schema
> desatualizado) produz `data === null` e a função devolve **`true`, "livre"**, sem log, sem
> evento, sem rastro. Depois desta story, `isSlotFree` distingue três estados — `"free"`,
> `"occupied"`, `"unknown"` — e um `"unknown"` nunca vira uma afirmação de disponibilidade: o
> candidato é omitido da oferta (não vira "livre" nem "ocupado"), e quando a incerteza alcança o
> horário que o cliente PEDIU ou zera a oferta de um período inteiro, a Nicole passa a dizer a
> verdade — "não consegui confirmar agora" — em vez de inventar um `true` ou um `false`.

---

## §0 — Ordem com a 87-17

**Decisão do Marcos, registrada aqui porque muda a ordem de deploy: o PR `#517` (Fatia 1 da
`87-17`, hoje aguardando merge) ESPERA esta story.** As duas mexem na mesma função
(`freeSlotsInPeriod`) e a `87-18` muda o tipo de retorno dela — subir a `87-17` primeiro criaria um
merge maior (a `87-18` teria que adaptar um código já mesclado) sem ganho nenhum, já que nenhuma das
duas depende logicamente da outra (a `87-17` reordena candidatos já calculados; a `87-18` corrige o
que significa "candidato calculado" quando a consulta individual falha). **A ordem exata (A18 → 17
ou as duas no mesmo PR) é decisão do @po, não desta story** — o que fica registrado aqui é que
**nenhuma das duas é liberada para produção sozinha** até essa decisão existir.

### `[@po 27/08]` DECISÃO 1 — as duas no MESMO PR (`#517`), a `87-18` commitada EM CIMA da `87-17`

**Decidido: opção (a).** Os commits desta story entram na branch
`fix/87-17-fatia1-oferta-de-horario-espalhada`, em cima de `cdf4411e`, e o `#517` passa a carregar as
DUAS stories, num deploy único. Não é preferência de forma — **a opção (b) é incoerente com o desenho
desta story**, e os três fatos abaixo foram medidos hoje:

| fato medido em 27/08 | consequência |
|---|---|
| `main` (`98772465`) tem `freeSlotsInPeriod` com `if (free.length >= limit) break` e `return free` — **sem `Promise.all`, sem `espalhar`, devolvendo `Date[]`** | a `AC4` desta story (*"um dos 8 candidatos vem `unknown`"*) é **inalcançável** em `main`: lá a função consulta 3 candidatos e para. A `AC5` (*"os 8 vêm `unknown`"*) idem |
| a árvore em que esta story foi escrita **é a branch**, não `main` | **todo o mapa de código do §Dev Notes (`552-574`, `671-698`, `693-695`) só existe na branch**; em `main` os números e a forma são outros |
| na opção (b) o `#517` rebasearia em cima de um `freeSlotsInPeriod` que passou a devolver `{ slots, erro }` | o `#517` seria **remedido de qualquer jeito**. O argumento *"ele já está verde, medido três vezes"* **não sobrevive a nenhuma ordem que não seja a (a)** |

**Racional em uma linha:** *qualquer ordem que não seja "mesmo PR" força UMA remedição do `#517` e,
além dela, uma reescrita das ACs desta story contra uma geometria de código que o próprio `#517`
apaga na mesma semana; a (a) paga a remedição uma vez e entrega a decisão do Marcos ("nenhuma das
duas em produção sozinha") de graça, porque um PR é um deploy.*

**O que a (a) obriga:**

1. O gate @qa da `87-17` Fatia 1 (`CONCERNS`, `1454d4ca`) **continua válido para as ACs dele** — a
   fronteira dele foi medida no diff `98772465..1454d4ca`, e os commits desta story vêm DEPOIS.
2. O @qa emite um **segundo gate**, desta story, no mesmo PR. A suíte é remedida inteira, e o
   baseline desta story é **a branch** — `256 arquivos · 3145 passed | 6 expected fail (3151) ·
   EXIT=0`, do gate da `87-17` — **não** o `main` (`3137 | 6`). Ver `AC9`.
3. Título e corpo do `#517` passam a nomear as duas stories (trabalho do @devops).
4. A Fatia 2 da `87-17` segue como estava: **só depois desta Fatia 1 em produção.**

**Válvula de escape, se a implementação estourar — e só nesse caso:** cortar **na linha do `emit`**.
**Fatia A** (`AC1`-`AC5`, `AC7`-`AC10`: tri-estado, `erro` no retorno, as quatro mensagens) entra no
`#517`; **Fatia B** (`AC6`, o evento `NICOLE_SLOT_QUERY_ERROR`) vira PR próprio e **não é gate de
deploy**. O que trava o `#517` é *"nunca afirmar o que não se sabe"* — observabilidade é desejável,
não é o bloqueio. **Não cortar por nenhuma outra linha:** sem `AC2`/`AC5` a story não existe.

---

## Story

**Como** engenharia da Trifold, que leu `isSlotFree` ao revisar o PR `#517` e constatou que o
retorno de `await q.limit(1).maybeSingle()` descarta o campo `error` do destructuring,
**Queremos** que um erro de consulta ao `appointments` deixe de ser interpretado como "o slot está
livre", e passe a produzir uma resposta honesta de incerteza, com evento observável,
**Para que** a Nicole nunca ofereça nem confirme, em silêncio, um horário que o sistema não
conseguiu verificar — a mesma classe de defeito que a `87-17` fechou para o lado de "negar
disponibilidade que existe", agora fechada para o lado de "afirmar disponibilidade que não se
sabe se existe".

---

## Context

### 1. 🔴 O defeito, verificado no código — não é hipótese

`packages/ai/src/flows/visit-slot.ts`, função `isSlotFree`, linha 552-574:

```ts
async function isSlotFree(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date,
  excludeAppointmentId?: string | null
): Promise<boolean> {
  const windowStart = new Date(startUtc.getTime() - (VISIT_DURATION_MIN - 1) * 60_000).toISOString()
  const windowEnd = new Date(startUtc.getTime() + (VISIT_DURATION_MIN - 1) * 60_000).toISOString()

  let q = supabase
    .from("appointments")
    .select("id")
    .eq("org_id", orgId)
    .eq("team", "house")
    .in("status", ["scheduled", "confirmed"])
    .gt("scheduled_at", windowStart)
    .lt("scheduled_at", windowEnd)
  if (excludeAppointmentId) q = q.neq("id", excludeAppointmentId)

  const { data } = await q.limit(1).maybeSingle()   // 🔴 `error` descartado

  return !data
}
```

O supabase-js/PostgREST **não rejeita** (não lança) em erro de consulta — devolve
`{ data: null, error }`. O destructuring `const { data } = ...` descarta `error` e a função devolve
`!data`. Logo, **qualquer** erro de consulta (RLS negando por engano, coluna renomeada, timeout do
PostgREST, cache de schema stale) produz o mesmo resultado que "não existe compromisso
sobrepondo" produziria: `data === null` → `!data === true` → **"o slot está livre"**. A Nicole
oferece e agenda um horário que pode estar ocupado, **sem nenhum evento em `system_events`, sem log,
sem rastro** — é a classe do agendamento fantasma (75-245/87-4), na direção oposta da que a `87-17`
acabou de fechar.

> **`[@po 27/08]` — o defeito não para na oferta: ele chega ao `INSERT`, e passa pelo enforcement.**
> Conferi a cadeia inteira no sítio `:1107`: `free === true` → `bookableSlotUtc = startUtc` **e**
> `authorizedSlotUtc = startUtc` (`pipeline.ts:1113-1114`) → `if (bookableSlotUtc && !existingAppt …)`
> (`:1563`) → `.from("appointments").insert({… status: "scheduled", created_by: "nicole" …})`
> (`:1571-1587`). No sítio `:1015` é o mesmo com `rescheduleSlotUtc`/`apptToReschedule`. Ou seja: um
> `error` de consulta não produz só uma frase falsa — ele **cria a linha em `appointments`** por cima
> de um horário possivelmente ocupado, **e** concede a autorização (`authorizedSlotUtc`) que o
> enforcement do epic usa para distinguir "a Nicole podia afirmar isso" de `NICOLE_SLOT_UNAUTHORIZED`.
> É agendamento fantasma com carimbo de legítimo. Isto **eleva** o valor da story; não muda uma AC.

`isSlotFree` tem exatamente **dois** chamadores, os dois no mesmo arquivo — `checkSlotAvailability`
(linhas 586 e 621) e `freeSlotsInPeriod` (linhas 693-695, dentro do `Promise.all` introduzido pela
`87-17`). Nenhum dos dois trata `error`; o sintoma se propaga sem alteração até os quatro sítios de
`pipeline.ts` que os chamam (linhas 1015, 1044, 1107, 1123 — ver §4).

### 2. Dois caminhos de falha, remédios OPOSTOS — e só um deles é desta story

| caminho | o que acontece hoje | observável? | remédio |
|---|---|---|---|
| **A — o `fetch` LANÇA** (rede caiu, DNS falhou, o processo derruba a promise) | a rejeição sobe por `isSlotFree` → `Promise.all` (em `freeSlotsInPeriod`) ou direto (em `checkSlotAvailability`) → chega ao `catch (asyncErr)` do webhook (`packages/web/src/app/api/webhook/whatsapp/route.ts:~1328`) → vira `WEBHOOK_ASYNC_ERROR` → **o lead não recebe resposta nenhuma** | **Sim** — há evento (`WEBHOOK_ASYNC_ERROR`), embora genérico | **Fora desta story.** É o `REL-1` já registrado em `docs/backlog.md` (origem: gate @qa da `87-17` Fatia 1). Tratar "falha = ocupado" aqui esconderia um horário livre atrás de um erro transitório — uma versão branda do próprio defeito que a `87-17` fechou. A decisão (`Promise.allSettled` vs `try/catch` honesto) é do `REL-1`, não desta story |
| **B — o PostgREST RESPONDE com `{ data: null, error }`** (RLS, schema cache, permissão, coluna) | `isSlotFree` devolve `true` ("livre") **sem lançar nada** | **NÃO. Silencioso.** Zero evento, zero log | **É esta story.** Erro de consulta não é "livre" — vira um terceiro estado (`"unknown"`), nunca uma afirmação, e emite um evento novo |

**O que esta story absorve do `REL-1` e o que deixa lá:** absorve **nada** do mecanismo do `REL-1`
— não muda `Promise.all` para `Promise.allSettled`, não adiciona `try/catch` em torno da chamada a
`isSlotFree`, e não altera o que acontece quando o `fetch` **lança**. O `REL-1` continua
integralmente em aberto no backlog, com a mesma decisão pendente (a e b de lá). A `AC7` desta story
é o controle que prova essa fronteira: uma rejeição de rede segue subindo exatamente como sobe hoje.

> **`[@po 27/08]` — a fronteira está certa; a frase *"a decisão do `REL-1` fica intacta"* não está.**
> Conferi o `REL-1` em `docs/backlog.md` (linhas 9-34) e ele descreve o caminho A exatamente como o
> §2 descreve — a fronteira vale e a `AC7` é o controle certo. O que esta story muda é o **espaço de
> opções** do `REL-1`: a opção **(a)** de lá (*"`Promise.allSettled` + tratar rejeição como **não
> livre**"*) passa a **contradizer a invariante central desta story** — `"unknown"` nunca é
> afirmação, nem "livre" nem "ocupado". Uma rejeição de rede é a MESMA ignorância que um `error` do
> PostgREST; mapeá-la para "ocupado" reintroduziria pela porta do caminho A a mentira que esta story
> fecha no caminho B. **O `REL-1` não é absorvido — ele é estreitado**, e a sobrevivente (a opção b)
> fica quase de graça depois desta story: a mensagem honesta e o evento já existirão, falta mapear a
> rejeição para `"unknown"`. Registrado ao lado do item no `docs/backlog.md`.

### 3. Auditoria do padrão — outros lugares que descartam `error` e decidem com `data == null`

Levantamento pedido pelo @sm, em `packages/ai/src` e `packages/web/src`, do padrão
`const { data } = await ...` (ou equivalente) seguido de decisão sobre `data`/`data ?? []`/`!data`
sem olhar `error`:

**`packages/ai/src` — só DOIS sítios no padrão, e só um decide agenda:**

| sítio | decide agenda/disponibilidade? | nesta story? |
|---|---|---|
| `flows/visit-slot.ts:571` (`isSlotFree`) | **Sim** — é o próprio defeito | **Sim** |
| `chat/conversation-history.ts:236` (`select("id, name").in("id", ids)`, resolve nomes de usuário para o histórico) | Não — nomes de exibição, sem efeito em agendamento; pior caso é um nome vazio na fala | Não |

**`packages/web/src` — 47 ocorrências do padrão** (a maioria em páginas de listagem
`dashboard/*`/`portal-viewer/*`, onde o pior caso é uma tela vazia, não uma decisão de negócio).
Dessas, **duas decidem disponibilidade de agenda** e têm a MESMA forma do defeito, numa variação
mais perigosa (é uma consulta de LISTA, não de linha única):

```ts
// packages/web/src/lib/appointments/team-slots.ts:36 — ocupadosDaEquipe
const { data } = await supabase.from("appointments").select("scheduled_at, duration_minutes")...
return (data ?? []) as ImobBusySlot[]     // 🔴 erro de consulta → lista de ocupados VAZIA
```

```ts
// packages/web/src/app/api/agendar/[token]/route.ts:48 — imobBusyBetween
const { data } = await admin.from("appointments").select("scheduled_at, duration_minutes")...
return (data ?? []) as ImobBusySlot[]     // 🔴 mesmo padrão, implementação paralela
```

~~`ocupadosDaEquipe` alimenta **as duas** rotas públicas de auto-agendamento~~ **`[@po 27/08]`:
errado, corrigido na tabela da Decisão 2 abaixo — `/api/agendar/[token]` tem cópia privada
(`imobBusyBetween`), e `ocupadosDaEquipe` chega às rotas públicas por `gradeDaEquipe`.** O efeito
descrito está certo: um erro de consulta nesse ponto não faz UM horário parecer livre por engano —
faz a **grade do dia inteira** parecer aberta, porque "ocupados" vira `[]`, **e abre o portão de
conflito que roda imediatamente antes do `.insert()` nos dois `POST`**. É a mesma classe de defeito, superfície
maior, sistema diferente (agendamento self-service, não a Nicole/WhatsApp), forma de consulta
diferente (lista, não `.maybeSingle()`), e call-sites que esta story não toca em nenhuma linha.

**Corte de escopo proposto:** esta story conserta **só** `isSlotFree` (Nicole/WhatsApp) — é onde a
evidência mora, é o caminho que motivou a `87-17`, e é o único sítio de `packages/ai`. **Não
conserto os dois sítios de `team-slots.ts`/`agendar/[token]` por reflexo**: são outro pacote, outra
forma de consulta, outros call-sites (páginas de auto-agendamento com UI própria), e misturar os
dois nesta story dobraria o raio de teste sem necessidade — a evidência de produção que abriu esta
story é da Nicole. **Ficam registrados aqui como achado, para o @po decidir se abre story própria**
— ver "O que esta story NÃO faz".

### `[@po 27/08]` DECISÃO 2 — story própria, `87-19`, **P1**, e o raio DELA é MAIOR que o do `isSlotFree`

**Decidido: story própria (`87-19`), prioridade P1, fora desta story e fora do deploy do `#517`.**
O corte do @sm está mantido — mas por motivos mais fortes do que os que ele deu, e com a gravidade
**invertida**. Três correções de fato, medidas hoje, que o §3 não tinha:

| # | o que o §3 afirma | o que eu medi em 27/08 |
|---|---|---|
| 1 | *"`ocupadosDaEquipe` alimenta **as duas** rotas públicas"* | **Não.** `/api/agendar/[token]` **não importa** `ocupadosDaEquipe`: tem a sua **própria** cópia privada, `imobBusyBetween` (`route.ts:46-57`). Os consumidores de `ocupadosDaEquipe` são `/api/formulario/[token]/agenda:155` (POST) e — indiretamente — `gradeDaEquipe` (`team-slots.ts:53-73`), que é quem monta a grade e é chamada por `/api/formulario/[token]/agenda:67` (GET) e `/api/appointments/slots:37`. São **2 helpers, 4 consumidores** |
| 2 | *"faz a **grade do dia inteira** parecer aberta"* | **Verdade, e é só metade.** `gradeDaEquipe` chama `ocupadosDaEquipe` e passa o resultado como `busy` para `imobSlotsForDay` — `busy = []` abre a grade inteira do GET, sim |
| 3 | — (o §3 não menciona) | 🔴 **Os DOIS `POST` usam esses helpers como ÚLTIMO PORTÃO antes do `.insert()`.** `agendar/[token]/route.ts:145-160`: `busy = await imobBusyBetween(...)` → `taken = busy.some(overlaps)` → `if (taken) return 409` → senão `.insert()` em `:209`. `formulario/[token]/agenda/route.ts:155-171`: `ocupados = await ocupadosDaEquipe(...)` → `tomado` → `409` → senão `.insert()` em `:193`. **Erro de consulta → lista vazia → `taken/tomado === false` → o portão de conflito abre inteiro e a linha é GRAVADA** |

**Por que o raio é maior que o do `isSlotFree` — e eu digo isso com clareza, como o @po foi pedido a
fazer:**

1. **Uma consulta que falha apaga o dia inteiro, não um candidato.** `isSlotFree` é uma query **por
   candidato**: um `error` contamina **aquele** horário. `ocupadosDaEquipe`/`imobBusyBetween` são
   **uma query pela janela toda**: um único `error` faz **todos** os compromissos do dia
   desaparecerem de uma vez.
2. **O erro cai exatamente no portão de escrita.** Nos dois `POST` o helper é a *recheca de corrida*
   — a última coisa entre o clique do cliente e o `INSERT`. Não há segunda conferência depois dele.
3. **Não há ninguém no meio.** São links **públicos por token**, sem sessão: nenhuma Nicole, nenhum
   corretor, nenhum SDR para estranhar o resultado. No caminho da Nicole, o texto `[SISTEMA]` ainda
   passa por um modelo e por uma conversa com uma pessoa — aqui a resposta é um `200` e uma linha
   nova em `appointments`.
4. **Consequência física:** duas pessoas no Decorado no mesmo horário, com confirmação enviada às
   duas.

**Por que então NÃO entra nesta story** — e isto é o que separa gravidade de sequenciamento:

- **O remédio é o OPOSTO.** Aqui, `unknown` → **omitir o candidato e seguir** (§5). Lá, a lista de
  ocupados não é amostra de nada: uma lista parcial é indistinguível de uma lista completa, então o
  único remédio honesto é **falhar fechado** — propagar o erro e **recusar a gravação** (`503`
  "não consegui confirmar agora, tente de novo"), nunca gravar sob incerteza. Juntar os dois no
  mesmo PR seria embarcar **duas invariantes opostas** numa story cuja tese é *"a fronteira entre
  remédios opostos é o que a `AC7` existe para provar"*. Seria repetir, com o `REL-1` do lado de
  fora, o erro que a `AC7` impede do lado de dentro.
- Outro pacote, outro harness (`team-slots.test.ts` já existe, com `fakeClient` próprio), outra
  semântica de saída (código HTTP, não prosa `[SISTEMA]`), e — ao contrário do `isSlotFree` — os
  dois helpers usam o **admin client** (`createAdminClient`, service-role): o gatilho "RLS surpresa"
  não se aplica lá, sobram `timeout`/`schema cache`/`5xx` do PostgREST. Perfil de probabilidade
  diferente, portanto régua de teste diferente.

**Sequenciamento, que é o único ponto em que a `87-18` ganha da `87-19`:** a `87-18` está **acoplada
a um deploy que já está na fila** (o `#517`), e a `87-19` não está acoplada a nada. Logo:
`87-18` (+ `#517`) sai agora; **`87-19` é a próxima coisa depois deste deploy, ANTES da Fatia 2 da
`87-17`** (que é melhoria de produto sobre um defeito já consertado). Registrada no
`docs/backlog.md` como **P1**, com a evidência acima, para `@sm *draft`.

### 4. Onde emitir o evento — o padrão já existe, e resolve a restrição de arquitetura sem plumbing novo

`packages/ai` **não pode** importar `packages/web/src/lib/logger.ts` (quem escreve em
`system_events`): `packages/ai/package.json` só declara `@anthropic-ai/sdk`, `@supabase/supabase-js`
e `@trifold/shared` como dependências — não `@trifold/web`, e a relação de workspace é a inversa
(`web` depende de `ai`, nunca o contrário). Isto **não é uma restrição nova que esta story precisa
resolver do zero**: o próprio `pipeline.ts` já tem o padrão certo, em produção, para exatamente este
problema.

`ProcessMessageParams.onEvent` (`pipeline.ts:395`) é um callback opcional
`(event: PipelineEvent) => void` — `PipelineEvent` (linha 362) é o shape
`{ level, category, event_type, message, metadata? }`, puro TypeScript, sem import de `@web`.
`processMessage` faz `const emit = params.onEvent ?? (() => {})` (linha 541) e usa esse `emit` em
todo o arquivo — inclusive já passado como parâmetro para `buildSystemPrompt` (linha 771:
`buildSystemPrompt(agentConfig, ragContext, state, emit, params.mediaContext)`) e usado direto para
os eventos `NICOLE_SLOT_MISMATCH`/`NICOLE_SLOT_UNAUTHORIZED` (linhas 1275/1295). Quem implementa o
callback é a camada web: `packages/web/src/app/api/webhook/whatsapp/route.ts:1129`,
`onEvent: (event) => { logEvent({ ...event, source: "ai/pipeline", org_id: orgId, metadata: {...} }) }`
— `logEvent` é fire-and-forget (`packages/web/src/lib/logger.ts`), a mesma escrita em
`system_events` de todos os outros eventos de Nicole.

**A solução, portanto, é reusar exatamente este padrão, uma camada mais funda:** `emit` já está no
escopo de `pipeline.ts` nos quatro sítios que chamam `checkSlotAvailability`/`freeSlotsInPeriod`
(linhas 1015, 1044, 1107, 1123 — está declarado na linha 541, antes de todos eles). Basta que
`checkSlotAvailability`/`freeSlotsInPeriod` aceitem um parâmetro de callback com o MESMO shape
estrutural de `PipelineEvent` (duck typing — sem importar o tipo de `chat/pipeline.ts` dentro de
`flows/visit-slot.ts`, o que criaria uma dependência na direção errada) e chamem-no internamente
quando um candidato vier `"unknown"`. `pipeline.ts` passa o `emit` que já tem, sem adaptador, sem
import novo, sem cruzar o limite `ai`/`web`. Nenhuma plumbing nova — é o MESMO cano que já leva
`NICOLE_SLOT_MISMATCH` para o banco.

`event_type` novo: **`NICOLE_SLOT_QUERY_ERROR`**, `category: "ai"` — mesmo padrão de nomenclatura de
`NICOLE_SLOT_MISMATCH`/`NICOLE_SLOT_UNAUTHORIZED`/`NICOLE_SYSTEM_BLOCK_LEAK`.

### 5. O que acontece com a oferta quando um candidato dá erro — recomendação

`freeSlotsInPeriod` varre até 11 candidatos (tarde) / 7 (manhã) em `Promise.all`
(`87-17`, Fatia 1). Se um deles vier `"unknown"`, a oferta deve **omitir aquele candidato e
seguir** (opção a), não abortar a oferta inteira (opção b). Três motivos:

1. **Abortar é o que já está errado hoje, e é exatamente o `REL-1`.** Hoje, se o `fetch` de UM
   candidato entre 11 REJEITA, `Promise.all` rejeita o lote inteiro e o lead não recebe resposta
   nenhuma. Esta story não resolve essa rejeição (§2, caminho A), mas também não pode criar uma
   SEGUNDA forma de "um candidato derruba os outros dez" para o caminho que ELA resolve (caminho
   B) — seria regredir a mesma lição pela porta dos fundos.
2. **Omitir é seguro por construção: nunca produz uma afirmação falsa.** Um candidato omitido
   simplesmente não aparece na lista — não é dito "livre" (seria a mentira que este story existe
   para fechar) nem "ocupado" (seria uma afirmação nova, sem base). É o mesmo raciocínio que a
   `87-17` já usa para os horários fora do expediente: eles também não entram na lista, sem que
   isso seja tratado como evento.
3. **A oferta já é parcial por natureza (é uma amostra, `espalhar`), então uma unidade a menos não
   muda a categoria da resposta** — a menos que **TODOS** os candidatos falhem, caso em que a
   lista fica vazia por um motivo diferente de "não há horário livre" (ver `AC5`) e a Nicole
   precisa dizer a coisa certa, não a mesma frase de sempre.

**Corolário que a `AC5` fixa:** "lista vazia" deixa de ser um único significado. Hoje
`slots.length === 0` só quer dizer "não há horário livre nesse período" — depois desta story, pode
também querer dizer "não consegui checar nenhum candidato". As duas frases da Nicole (Desenho §2)
não podem colapsar nesse ponto, ou a story reintroduz, num lugar novo, o mesmo silêncio que
motivou a `87-17`.

### 6. A assinatura de `isSlotFree` — booleano não expressa "não sei"

`isSlotFree` devolve `Promise<boolean>` hoje. Um booleano só tem dois estados; a pergunta real tem
três respostas possíveis ("livre", "ocupado", "não consegui verificar") e o código precisa de um
terceiro valor que **nenhum** dos dois chamadores possa confundir com os outros dois por acidente
(um `null`/`undefined` seria filtrado por `!!` ou `??` na primeira refatoração descuidada e viraria
"falsy" = tratado como "ocupado" ou "livre" dependendo do operador — os dois errados). Um union
type de string (`"free" | "occupied" | "unknown"`) é auto-descritivo e ~~não passa despercebido num
`if (await isSlotFree(...))` (deixa de compilar — o TypeScript obriga a comparação explícita)~~.

> ### 🔴 `[@po 27/08]` — ESSA PROTEÇÃO NÃO EXISTE. **O `tsc` não pega, o `eslint` não pega, e o modo
> de falha é o pior possível.**
>
> Medido hoje, com contraprova: compilei um arquivo com o tri-estado e as **duas formas que os dois
> chamadores usam HOJE** —
>
> ```ts
> if (await isSlotFree()) alternatives.push(1)          // checkSlotAvailability:586 e :621
> return cands.filter((_, i) => livre[i])               // freeSlotsInPeriod (branch 87-17)
> ```
>
> `tsc --noEmit --strict` → **EXIT=0, saída de ZERO linhas** (contado por `grep -c .`, não por olho).
> Contraprova de que a invocação é capaz de reprovar: o mesmo comando num `const x: number = "s"` dá
> **EXIT=2** com `TS2322`. Ou seja: o verde é real, não é falso verde de invocação.
>
> **Por que não pega:** truthiness de union de strings sem constituinte falsy não é erro em
> TypeScript, e o predicado de `Array.prototype.filter` é tipado como `=> unknown` — string passa.
> `grep -rn "strict-boolean-expressions"` no repo (fora de `node_modules`) → **nada**: o `eslint`
> também não tem essa rede.
>
> **E o modo de falha não é "o `unknown` escapa": é `"occupied"` virar `"free"`.** As três strings
> são truthy. Se qualquer um dos dois chamadores ficar na forma booleana, **todo horário OCUPADO
> passa a ser oferecido e confirmado como livre** — uma story que existe para fechar o agendamento
> fantasma criaria a versão universal dele, com o `tsc` e o `lint` verdes.
>
> **A rede real, que EXISTE e é forte, é outra:** dois testes pré-existentes reprovam essa forma.
> (i) `visit-slot.test.ts:325` (*"compromisso HOUSE no mesmo horário bloqueia"* → `free === false`):
> com a forma booleana, `"occupied"` truthy → `free === true` → **vermelho**. (ii) o caso do sábado
> de manhã com 10h ocupado (`~:502`/`:597`, recalibrado pela `87-17` para `[8:00, 9:00, 11:00]`):
> com a forma booleana os 7 candidatos entram como livres → `espalhar` devolve
> `[8:00, 9:30, 11:00]` → **vermelho**. **É por isso que a `AC10` (nova) exige a mutação que prova
> essa rede, e é por isso que a DECISÃO 3 congela a forma dos parâmetros: os dois testes que seguram
> esta story são exatamente os que uma troca de assinatura mais ampla iria reescrever.**

---

## Desenho

### 1. `isSlotFree` — terceiro estado, corpo inalterado fora do retorno

```ts
type SlotCheck = "free" | "occupied" | "unknown"

async function isSlotFree(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date,
  excludeAppointmentId?: string | null
): Promise<SlotCheck> {
  // ...janela, filtros e `q` idênticos ao HEAD...
  const { data, error } = await q.limit(1).maybeSingle()
  if (error) return "unknown"
  return data ? "occupied" : "free"
}
```

Zero mudança na consulta em si — só no que o retorno SIGNIFICA. `AC1` prova a virada: mesma
fixture de erro que hoje produz `true` ("livre") passa a produzir `"unknown"`.

### 2. `checkSlotAvailability` e `freeSlotsInPeriod` — retorno ganha `erroNoPedido`/`houveIncerteza`, e um `emit` opcional

```ts
export type EmitSlotQueryError = (event: {
  level: "error" | "warn" | "info"
  category: string
  event_type: string
  message: string
  metadata?: Record<string, unknown>
}) => void   // shape estrutural igual a PipelineEvent — sem importar de chat/pipeline.ts

export async function checkSlotAvailability(
  supabase: SupabaseClient,
  orgId: string,
  startUtc: Date,
  excludeAppointmentId?: string | null,
  emit?: EmitSlotQueryError
): Promise<{ free: boolean; alternatives: Date[]; erroNoPedido: boolean }> {
  const primary = await isSlotFree(supabase, orgId, startUtc, excludeAppointmentId)
  if (primary === "free") return { free: true, alternatives: [], erroNoPedido: false }

  // 🔴 `[@po 27/08]` CURTO-CIRCUITO OBRIGATÓRIO (AC2-ii): se o horário PEDIDO veio
  // `unknown`, a resposta já está decidida ("não consegui confirmar") e as
  // alternativas NÃO são usadas por ela. Varrer os candidatos aqui gastaria até
  // ~37 round-trips SEQUENCIAIS contra um banco que acabou de falhar. Sai antes.
  if (primary === "unknown") {
    emit?.({ /* NICOLE_SLOT_QUERY_ERROR, candidatos_com_erro: 1, primario_com_erro: true */ })
    return { free: false, alternatives: [], erroNoPedido: true }
  }

  const alternatives: Date[] = []
  let candidatosComErro = 0
  for (const c of candidates) {
    if (alternatives.length >= 3) break
    const status = await isSlotFree(supabase, orgId, c, excludeAppointmentId)
    if (status === "free") alternatives.push(c)
    else if (status === "unknown") candidatosComErro++
  }

  if (candidatosComErro > 0) {
    emit?.({
      level: "error",
      category: "ai",
      event_type: "NICOLE_SLOT_QUERY_ERROR",
      message: `Consulta de disponibilidade falhou em ${candidatosComErro} candidato(s) ao checar ${startUtc.toISOString()}`,
      metadata: { requested_at: startUtc.toISOString(), candidatos_com_erro: candidatosComErro, primario_com_erro: primary === "unknown" },
    })
  }

  // `erroNoPedido` é FALSE aqui: o horário pedido foi confirmado OCUPADO. A
  // incerteza ficou só nas alternativas → a mensagem existente ("já existe uma
  // visita") continua verdadeira, com a lista possivelmente mais curta (AC6-ii).
  return { free: false, alternatives, erroNoPedido: false }
}

export async function freeSlotsInPeriod(
  supabase: SupabaseClient,
  orgId: string,
  day: DayParts,
  period: DayPeriod,
  now: Date,
  excludeAppointmentId?: string | null,
  limit = 3,
  emit?: EmitSlotQueryError
): Promise<{ slots: Date[]; houveIncerteza: boolean }> {
  // ...coleta de candidatos idêntica ao HEAD (87-17)...
  const resultados = await Promise.all(candidates.map((c) => isSlotFree(supabase, orgId, c, excludeAppointmentId)))
  const free = candidates.filter((_, i) => resultados[i] === "free")
  const comErro = resultados.filter((r) => r === "unknown").length

  if (comErro > 0) {
    emit?.({
      level: "error",
      category: "ai",
      event_type: "NICOLE_SLOT_QUERY_ERROR",
      message: `Consulta de disponibilidade falhou em ${comErro}/${candidates.length} candidato(s) do período`,
      metadata: { dia: dayPartsToIso(day), periodo: period, candidatos_totais: candidates.length, candidatos_com_erro: comErro },
    })
  }

  return { slots: espalhar(free, limit), houveIncerteza: comErro > 0 }
}
```

**Por que o evento é agregado (uma emissão por chamada), não um por candidato.** Um período de
tarde tem até 11 candidatos; se a causa do erro for sistêmica (RLS quebrado, coluna renomeada), os
11 vêm `"unknown"` na mesma chamada, e emitir 11 linhas quase idênticas em `system_events` por um
único turno de conversa é ruído, não observabilidade — o volume certo para "algo está quebrado na
consulta de agenda" é medido em CHAMADAS afetadas, não em candidatos. `AC6` fixa isso: no máximo UM
evento por chamada de `checkSlotAvailability`/`freeSlotsInPeriod`, com a contagem agregada na
`metadata`.

**Por que a forma do parâmetro é posicional, mantendo a ordem existente, com `emit` por último —
e o custo que isso tem.** Os quatro sítios de `pipeline.ts` chamam essas funções com aridade
variável hoje (`checkSlotAvailability(supabase, orgId, startUtc)` sem `excludeAppointmentId` num
sítio, com ele no outro; `freeSlotsInPeriod` sem `excludeAppointmentId`/`limit` em ambos os sítios
atuais). Adicionar `emit` como último parâmetro posicional exige `undefined` explícito nos
parâmetros do meio que o sítio não usa (ex.: `freeSlotsInPeriod(supabase, orgId, day, period, now,
undefined, undefined, emit)`), o que é visualmente ruim mas mecânico e sem ambiguidade.

### `[@po 27/08]` DECISÃO 3 — a forma vira `AC`: `emit` entra como parâmetro NOVO no FIM. Nada de refatorar para objeto de opções.

**Decidido, e é `AC` (`AC10-iii`), não preferência do @dev** — ao contrário do `Promise.all` da
`87-17`, aqui a forma tem consequência de segurança, não de estilo:

- **Os dois testes que seguram esta story são exatamente os que a refatoração reescreveria.** Como o
  §6 mostra (medido), `tsc` e `eslint` **não** pegam a forma booleana residual do tri-estado; a única
  rede é `visit-slot.test.ts:325` e o caso do sábado de manhã. Um objeto de opções obriga a reescrever
  a **lista de argumentos** de todas as ~14 chamadas de teste, no MESMO PR em que essas duas chamadas
  são a rede. É o `R6` mirando no próprio para-quedas.
- **Custo real da forma posicional:** exatamente **4 `undefined`** em código de produção — `:1107`
  (1), `:1044` (1), `:1123` (2), `:1015` (0). Quatro `undefined` é o preço de manter intocada a lista
  de argumentos de 14 testes. Aceito, e é barato.
- **O que fica travado:** nenhum parâmetro existente muda de posição, de nome ou de default; `emit`
  entra **só no fim** (como 5º de `checkSlotAvailability` e 8º de `freeSlotsInPeriod`), como
  posicional ou como objeto de opções contendo **apenas** o parâmetro novo (`{ emit }`) — as duas
  formas atendem. **A migração `T4` das ~14 chamadas existentes muda SOMENTE a desestruturação do
  retorno.** Se um diff de teste desta story tocar a lista de ARGUMENTOS de uma chamada
  pré-existente, é violação.
- **`[@po 27/08]` Renomeados, e isto também é `AC` (`AC10-iv`):** `erro` significava DUAS coisas
  diferentes nas duas funções — em `checkSlotAvailability` era *"o horário pedido é incerto"*, em
  `freeSlotsInPeriod` era *"algum candidato foi incerto"*. Um nome, duas semânticas, nas duas metades
  do mesmo conserto: é a `Armadilha 2` esperando a próxima refatoração. Passam a ser
  **`erroNoPedido`** e **`houveIncerteza`**, com uma linha de docstring em cada dizendo o que NÃO
  significam.

### 3. `pipeline.ts` — quatro sítios, duas frases novas, nenhuma frase antiga muda de texto

**Sítios de `checkSlotAvailability` (linhas 1015 e 1107) — a frase nova entra ANTES da bifurcação
livre/ocupado, não troca nenhuma das duas:**

```ts
const { free, alternatives, erroNoPedido } = await checkSlotAvailability(supabase, orgId, newStartUtc, apptId, emit)
const whenStr = formatBrtDateTime(newStartUtc)
if (erroNoPedido) {
  messageWithContext = sistema(`Não consegui confirmar agora se ${whenStr} está livre ou ocupado — a consulta da agenda falhou. NÃO diga que está livre nem que está ocupado. Avise com simpatia que não conseguiu checar nesse instante e peça para o cliente tentar de novo em alguns minutos, ou ofereça chamar um corretor humano.`)
} else if (free) {
  // ...mensagem existente, INALTERADA...
} else {
  // ...mensagem existente ("já existe uma visita nesse horário"), INALTERADA — só é
  // alcançada quando erroNoPedido === false, ou seja, quando o horário pedido foi
  // CONFIRMADO ocupado. Incerteza só nas ALTERNATIVAS não muda esta frase (AC6-ii).
}
```

**Sítios de `freeSlotsInPeriod` (linhas 1044 e 1123) — a lista vazia se bifurca em dois motivos:**

```ts
const { slots, houveIncerteza } = await freeSlotsInPeriod(supabase, orgId, targetDay, nPeriod, nowA, apptId, undefined, emit)
messageWithContext = slots.length
  ? sistema(`... mensagem existente ("Horários LIVRES nesse período: ...") — INALTERADA, e é a que vale MESMO com houveIncerteza === true (AC4-ii) ...`)
  : houveIncerteza
    ? sistema(`Não consegui confirmar a agenda desse período agora — a consulta falhou. NÃO diga que não há horário livre. Avise com simpatia que não conseguiu checar nesse instante e ofereça tentar de novo em breve, ou outro período/dia.`)
    : sistema(`... mensagem existente ("não há horário livre nesse período") — INALTERADA, só alcançada quando houveIncerteza === false ...`)
```

**🔴 `[@po 27/08]` A ORDEM DOS TESTES NA EXPRESSÃO É NORMATIVA: `slots.length` PRIMEIRO,
`houveIncerteza` DEPOIS.** É o que garante que uma incerteza PARCIAL (1 candidato entre 8 falhou, 7
confirmados livres) continue produzindo a **oferta normal** com os 3 horários espalhados — e não a
frase "não consegui confirmar". A inversão (`houveIncerteza ? novo : …`) passaria `AC4`, `AC5` e
`AC8` como estavam escritas, e ainda assim jogaria no lixo uma oferta boa a cada soluço de UM
candidato — que é a opção **(b)** que o §5 rejeitou por escrito, entrando pela camada da mensagem
depois de ser rejeitada na camada da função. **A `AC4-(ii)`, nova, é o controle disso.**

**Nenhuma das quatro mensagens pré-existentes muda uma vírgula.** As duas novas só disparam quando
`erroNoPedido`/`houveIncerteza` são `true` — e, pela `AC1`/`AC4`, isso só acontece quando pelo menos
uma consulta ao `appointments` devolveu `error` de verdade. Nenhum teste e2e hoje injeta esse erro (§ Dev Notes),
então **nenhum teste existente deveria mudar de saída** por causa desta story — ao contrário da
`87-17`, que recalibrou três goldens, esta story não deveria recalibrar nenhum (`AC9`).

---

## Acceptance Criteria

**AC1 — `isSlotFree` distingue os três estados, e um erro de consulta NUNCA vira `"free"`.**
*Verifica-se:* fixture do `appointments` configurada para devolver `{ data: null, error: {
message: "..." } }` (simulando RLS negado / coluna renomeada / timeout do PostgREST) →
`isSlotFree` devolve `"unknown"`. **Vermelho contra o `HEAD`:** hoje a mesma fixture produz `true`
("livre"), porque `!data` (`!null`) é `true` independente de `error`. Colar os dois. Casos de
controle: fixture sem erro e sem linha → `"free"`; fixture sem erro e com linha → `"occupied"`.

**AC2 — O horário PEDIDO com erro de consulta nunca é afirmado livre nem ocupado.**
*Verifica-se:* **(i)** `checkSlotAvailability` com o candidato PRIMÁRIO (`startUtc`) vindo
`"unknown"` → devolve `{ free: false, erroNoPedido: true }`. O bloco `[SISTEMA]` que `pipeline.ts`
produz nos sítios `:1015`/`:1107` para esse caso é o texto NOVO ("não consegui confirmar"), não o
texto de "já existe uma visita nesse horário" (que seria uma afirmação categórica sem base) nem o de
"esse horário está LIVRE" (a mentira que o defeito original produzia). Testar os dois sítios
(remarcar e agendar). Cobrir também que **`bookableSlotUtc`/`rescheduleSlotUtc` NÃO são setados**
nesse caminho — é o que impede o `INSERT` do `:1563` (ver o bloco `[@po]` do §1).
**(ii) 🔴 `[@po 27/08]` CURTO-CIRCUITO, e é medição, não estilo:** com o primário `"unknown"`, a
função devolve **`alternatives: []`** e o fake registra **exatamente 1 consulta** ao `appointments`
naquela chamada. **Vermelho contra a forma sem curto-circuito:** sem ele, e com todos os candidatos
vindo `"unknown"` (o cenário de outage, que é justamente quando o primário falha), o laço de
alternativas nunca atinge `alternatives.length >= 3` e varre a lista INTEIRA — resto do dia pedido
(até 18 candidatos) **mais o dia seguinte completo** (`visit-slot.ts:614`, o laço vai de
`OPEN_HOUR` até o fechamento do dia seguinte INTEIRO, não só a manhã, apesar do comentário do `:605`) = **até ~37 consultas
SEQUENCIAIS** (`for … await`, não `Promise.all`) contra um banco que acabou de falhar, no caminho da
resposta ao lead. A story trocaria uma mentira silenciosa por um estouro do orçamento assíncrono do
webhook — é a mesma régua de latência que a `AC4` da `87-17` fixou (`D88-3`). O teste conta as
consultas com o `hooks.onEmit` do `fakeSupabase` que a `87-17` já construiu.

**AC3 — Candidatos de ALTERNATIVA com erro são omitidos, e a busca continua para os próximos —
nunca aborta.**
*Verifica-se:* dentre os candidatos de 30 em 30 min que `checkSlotAvailability` varre atrás de
alternativas, um vem `"unknown"` no meio da lista → ele NÃO aparece em `alternatives`, e os
candidatos SEGUINTES continuam sendo checados normalmente (a busca não para no primeiro erro).
Controle negativo: se a implementação abortar a busca inteira no primeiro `"unknown"`, o teste
falha porque `alternatives` fica menor do que deveria dado o resto dos candidatos genuinamente
livres depois do que falhou. **`[@po 27/08]`: esta AC e a `AC2-(ii)` não se contradizem — o
curto-circuito é do candidato PRIMÁRIO (o horário que o cliente pediu, cuja resposta já está
decidida), e o "não aborta" é dos candidatos de ALTERNATIVA (que ainda podem virar oferta). Nesta AC
o primário chega como `"occupied"` de verdade, não `"unknown"`.**

**AC4 — Candidato de PERÍODO com erro é omitido da amostra, sem abortar o período inteiro.**
*Verifica-se com a fixture real da Ana (8 candidatos livres da tarde de 27/08, `87-17` `AC1`):* um
dos 8 candidatos (não o primeiro, não o último) vem `"unknown"` na consulta → `freeSlotsInPeriod`
devolve `{ slots: espalhar(os 7 restantes, 3), houveIncerteza: true }`, cobrindo os candidatos que
PUDERAM ser confirmados livres — nunca inclui o `"unknown"` como livre, e nunca devolve `slots: []`
só porque um candidato entre vários falhou.
**(ii) 🔴 `[@po 27/08]` O CONTROLE QUE FALTAVA — na camada da MENSAGEM, não na do retorno.** Com a
mesma fixture (1 dos 8 `"unknown"`, 7 livres), o bloco `[SISTEMA]` produzido em `:1044` **e** em
`:1123` é a mensagem EXISTENTE — *"Horários LIVRES nesse período: …"* com os 3 horários espalhados —
e **NÃO** o texto novo de "não consegui confirmar". *Por que esta AC existe:* a `AC4` como estava
assertava só o **valor de retorno** da função. Uma implementação que fizesse
`houveIncerteza ? mensagemNova : …` passaria `AC4`, `AC5` e `AC8` inteiras e ainda assim descartaria
uma oferta boa a cada soluço de **um** candidato entre onze — ou seja, embarcaria pela camada da
mensagem exatamente a opção **(b)** que o §5 rejeitou com três argumentos. Sem esta AC, o conserto
errado fica **verde**.

**AC5 — 🔴 Quando TODOS os candidatos de um período falham, a Nicole diz a coisa certa — não
"não há horário livre".**
*Verifica-se:* fixture em que os 8 candidatos da tarde de 27/08 vêm `"unknown"` (outage total de
`appointments`) → `freeSlotsInPeriod` devolve `{ slots: [], houveIncerteza: true }`, e o bloco `[SISTEMA]`
produzido em `pipeline.ts` (sítios `:1044`/`:1123`) é o texto NOVO ("não consegui confirmar a
agenda desse período agora"), **não** o texto existente "não há horário livre nesse período" — que
seria uma afirmação factualmente falsa (o sistema não sabe se há ou não). Este é o AC que
materializa o §5-corolário: `slots.length === 0` deixou de ter um único significado.

**AC6 — Um evento observável é emitido, agregado, no máximo um por chamada.**
*Verifica-se:* fixture com 3 dos 11 candidatos de um período vindo `"unknown"` → exatamente UMA
chamada ao `emit` injetado, `event_type: "NICOLE_SLOT_QUERY_ERROR"`, `category: "ai"`,
`metadata.candidatos_com_erro === 3`. **(ii) `[@po 27/08]` — o controle do `checkSlotAvailability` foi trocado, porque o antigo ficou
inalcançável com o curto-circuito da `AC2-(ii)`.** Passa a ser: horário pedido **OCUPADO de
verdade** (linha presente, sem `error`) **+ 2 candidatos de alternativa** vindo `"unknown"` →
**uma** chamada ao `emit` com `metadata.candidatos_com_erro === 2`, **`erroNoPedido === false`**, e o
bloco `[SISTEMA]` é a mensagem EXISTENTE de "já existe uma visita nesse horário" com a lista de
alternativas possivelmente mais curta. É o gêmeo da `AC4-(ii)` do lado do `checkSlotAvailability`:
prova que incerteza **nas alternativas** não contamina a afirmação sobre o horário **pedido** — que
foi, esse sim, verificado. **(iii)** Com o primário `"unknown"`: **uma** chamada,
`candidatos_com_erro === 1`, `primario_com_erro === true`. **Controle negativo:** nenhuma chamada ao
`emit` quando não houve incerteza alguma (todos os candidatos resolveram `"free"`/`"occupied"`).

**AC7 — 🔴 Controle de fronteira com o `REL-1`: uma rejeição de rede continua subindo exatamente
como hoje.**
*Verifica-se:* fixture em que a chamada ao `appointments` **REJEITA** (lança, não devolve `{data,
error}`) — nem `checkSlotAvailability` nem `freeSlotsInPeriod` engolem essa rejeição num
`try/catch` novo; ela sobe do mesmo jeito que sobe no `HEAD` (via `Promise.all` ou direto). **`[@po 27/08]`:** a asserção comportamental é a prova — `await expect(freeSlotsInPeriod(...))
.rejects.toThrow()` e o mesmo para `checkSlotAvailability`, que reprovam qualquer `try/catch` novo. O
controle de `grep` é **secundário e a forma estava errada**: `\s` não é portável no `grep` do macOS
(BSD) — usar `grep -nE "try[[:space:]]*\{" packages/ai/src/flows/visit-slot.ts` e comparar a
contagem com a do `HEAD`, nunca `grep -c` como prova de verde (a lição de `exit code` do repo).
**Isto prova que esta story não absorve o `REL-1`** — ele continua em
aberto no backlog, com a decisão dele intacta.

**AC8 — Os quatro sítios de `pipeline.ts` propagam `emit` e as duas mensagens novas aparecem nos
dois pares de sítios (mesma lição da `87-17` R1: mudar a função muda os dois chamadores dela).**
*Verifica-se:* `:1015` (remarcar) e `:1107` (agendar) — ambos usam `checkSlotAvailability` e ambos
precisam do texto novo de `erroNoPedido`. `:1044` (período com visita ativa) e `:1123` (período sem
visita ativa, sítio 7 da `87-10`) — ambos usam `freeSlotsInPeriod` e ambos precisam do texto novo de
`houveIncerteza`, **com a ordem normativa `slots.length` → `houveIncerteza` (`AC4-ii`)**. Teste dedicado por sítio (4 no total), não só um representativo — o `:1044` já tem
histórico de teste que só confere presença de bloco, não conteúdo (`87-17` §5), então esta story
não repete esse ponto cego.

**AC9 — Nenhum teste e2e pré-existente muda de VALOR esperado (ao contrário da `87-17`, nada é
recalibrado).**
*Verifica-se:* `npx vitest run` da RAIZ, antes e depois, com o total de testes colado — a
ÚNICA diferença esperada é a CONTAGEM (testes novos desta story + as **14** chamadas de
`visit-slot.test.ts` que migram a desestruturação do retorno, ver Tasks), e **zero** teste
pré-existente muda de valor esperado. Razão: nenhuma fixture hoje injeta `error` no `appointments`,
então todo teste e2e/golden que existe HOJE continua exercitando só os caminhos
`"free"`/`"occupied"`, que não mudam de comportamento. `npx tsc --noEmit` em `packages/ai` → 0.

**🔴 `[@po 27/08]` O BASELINE É A BRANCH, NÃO O `main`** (Decisão 1): `256 arquivos · 3145 passed |
6 expected fail (3151) · EXIT=0`, número medido pelo @qa no gate da `87-17` Fatia 1. Usar o do `main`
(`3137 | 6`) daria um delta de `+8` falso, que já é da `87-17`. E **a contagem de "14" é minha,
conferida por `grep`**: 5 chamadas de `checkSlotAvailability` (`:319`, `:325`, `:336`, `:344`, `:355`)
+ 9 de `freeSlotsInPeriod` (`:502`, `:511`, `:518`, `:524`, `:597`, `:608`, `:622`, `:631`, `:645`).
As 3 chamadas de `espalhar` (`:537`-`:557`) **não** mudam. Se o @dev encontrar um número diferente de
14, é sinal de que a base não é `cdf4411e` — **PARE e reconfira a branch antes de continuar.**

**AC10 — 🔴 `[@po 27/08]` A rede que segura o tri-estado é NOMEADA, provada e travada — porque o
`tsc` e o `eslint` NÃO a fornecem.**
*Contexto (medido, ver §6):* `if (await isSlotFree(...))` e `filter((_, i) => livre[i])` compilam com
`tsc --strict` em **EXIT=0, zero linhas**, e não existe `strict-boolean-expressions` no repo. Se um
dos dois chamadores ficar na forma booleana, **`"occupied"` (truthy) passa a ser oferecido e
confirmado como LIVRE** — o agendamento fantasma universal, com tudo verde.
*Verifica-se:*
- **(i) Mutação obrigatória, no `T6`, com a saída vermelha colada:** deixar `checkSlotAvailability`
  na forma `if (await isSlotFree(...))` (só ela; o resto do conserto no lugar) → o teste
  pré-existente `visit-slot.test.ts:325` ("compromisso HOUSE no mesmo horário bloqueia") fica
  **vermelho** (`expected true to be false`). Árvore restaurada e conferida.
- **(ii) Segunda mutação:** deixar `freeSlotsInPeriod` com `filter((_, i) => livre[i])` (predicado
  truthy) → o caso do sábado de manhã com 10h ocupado fica **vermelho**, com `[8:00, 9:30, 11:00]`
  recebido no lugar de `[8:00, 9:00, 11:00]` (os 7 candidatos entram como livres em vez de 4).
- **(iii)** Forma dos parâmetros conforme a **DECISÃO 3**: nenhum parâmetro existente muda de
  posição, nome ou default; `emit` entra apenas no fim. **Nenhum diff de teste desta story toca a
  lista de ARGUMENTOS de uma chamada pré-existente** — só a desestruturação do retorno. Conferível no
  diff do PR.
- **(iv)** Os dois campos novos se chamam **`erroNoPedido`** (`checkSlotAvailability`) e
  **`houveIncerteza`** (`freeSlotsInPeriod`), cada um com uma linha de docstring dizendo o que **não**
  significa. Nenhum dos dois se chama `erro`.

*Por que isto é `AC` e não recomendação:* se as duas mutações não forem feitas, ninguém neste PR
sabe se a rede existe — e o modo de falha silencioso que ela cobre é **pior** do que o defeito que a
story conserta.

---

## Tasks

- [x] **T0 — Estender os fakes de teste para injetar erro de consulta.** Dois fixtures precisam da
      capacidade nova: (a) o `fakeSupabase` local de `visit-slot.test.ts` (linha ~280, hoje só
      devolve `{ data: current[0] ?? null }` em `maybeSingle()`) ganha um modo de forçar
      `{ data: null, error: {...} }` para candidatos específicos (por índice ou por predicado sobre
      `scheduled_at`); (b) o `FakeResult`/query-builder compartilhado
      (`packages/ai/src/chat/__fixtures__/fake-supabase.ts`, usado pelos testes de `pipeline.ts`)
      ganha o mesmo tipo de injeção para a tabela `appointments`, reaproveitando o padrão que já
      existe ali para forçar erro em `.single()` sem linha (`shape()`, linha ~216). **Sem isso,
      nenhuma AC desta story é testável.**
- [x] **T1 — `isSlotFree` ganha o terceiro estado** (`AC1`). Corpo da consulta inalterado; só o
      `return` muda, de `!data` para o `if (error) return "unknown"` + `data ? "occupied" :
      "free"`.
- [x] **T2 — `checkSlotAvailability` e `freeSlotsInPeriod` ganham `erroNoPedido`/`houveIncerteza` no
      retorno e `emit` opcional** (`AC2`-`AC6`), na forma do Desenho §2 — **`emit` no FIM, nenhum
      parâmetro existente muda de posição/nome/default (DECISÃO 3, `AC10-iii`)**, e com o
      **curto-circuito** do primário `"unknown"` (`AC2-ii`).
- [x] **T3 — Os quatro sítios de `pipeline.ts` (`:1015`, `:1044`, `:1107`, `:1123`) passam `emit` e
      ganham as duas mensagens novas**, sem alterar o texto das mensagens existentes (`AC8`,
      Desenho §3).
- [x] **T4 — Migrar as 14 chamadas de teste existentes** (`visit-slot.test.ts`, listadas na `AC9`)
      para o novo formato de retorno (`{ free, alternatives, erroNoPedido }` / `{ slots,
      houveIncerteza }` em vez de booleano/array direto). Isto é mecânico — **muda SÓ a
      desestruturação do retorno**; nenhuma asserção de VALOR e **nenhuma lista de ARGUMENTOS**
      muda (`AC9`, `AC10-iii`). Duas dessas chamadas (`:325` e o caso do sábado de manhã) são a
      **única rede** contra a armadilha do §6 — tratá-las com cuidado especial.
- [x] **T5 — Testes novos** (`AC1`-`AC7`), incluindo o controle negativo do `REL-1` (`AC7`) e o
      controle de agregação do evento (`AC6`).
- [x] **T6 — Fecha a story:** `npx vitest run` da RAIZ (total antes/depois colado com o baseline **da
      branch**, delta explicado), `npx tsc --noEmit` em `packages/ai` → 0, `npm run lint` → 0 erros
      nos arquivos tocados, e **TRÊS mutações**, cada uma com a saída vermelha colada e a árvore
      restaurada: **(a)** reverter `if (error) return "unknown"` para `!data`; **(b)** `[@po]`
      `checkSlotAvailability` na forma `if (await isSlotFree(...))` → `:325` vermelho (`AC10-i`);
      **(c)** `[@po]` `freeSlotsInPeriod` com `filter((_, i) => livre[i])` → sábado de manhã vermelho
      (`AC10-ii`). Sem (b) e (c) a story não fecha.

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha (hoje) | o quê |
|---|---|---|
| `packages/ai/src/flows/visit-slot.ts` | **552-574** | `isSlotFree` — o coração do defeito; só o `return` muda |
| ↳ | 571 | `const { data } = await q.limit(1).maybeSingle()` — o `error` descartado |
| ↳ | 580-625 | `checkSlotAvailability` — dois usos de `isSlotFree` (linha 586 primário, 621 dentro do loop de alternativas) |
| ↳ | 671-698 | `freeSlotsInPeriod` — um uso de `isSlotFree` dentro do `Promise.all` (linhas 693-695, `87-17`) |
| ↳ | 642-649 | `espalhar` — reaproveitada sem mudança; opera sobre a lista JÁ filtrada para `"free"` |
| `packages/ai/src/chat/pipeline.ts` | 362-368 | `PipelineEvent` — o shape estrutural que `EmitSlotQueryError` espelha, sem import |
| ↳ | 395 | `onEvent?: (event: PipelineEvent) => void` em `ProcessMessageParams` |
| ↳ | 541 | `const emit = params.onEvent ?? (() => {})` — já em escopo nos 4 sítios abaixo |
| ↳ | 771 | `buildSystemPrompt(agentConfig, ragContext, state, emit, ...)` — o precedente de passar `emit` como parâmetro posicional para dentro de outro módulo |
| ↳ | 1275, 1295 | `emit({ event_type: "NICOLE_SLOT_MISMATCH"/"NICOLE_SLOT_UNAUTHORIZED", ... })` — o padrão de nomenclatura a seguir |
| ↳ | **1015** | sítio 1 — `checkSlotAvailability` no ramo REMARCAR (visita já marcada) |
| ↳ | **1044** | sítio 2 — `freeSlotsInPeriod` no ramo período + visita ativa |
| ↳ | **1107** | sítio 3 — `checkSlotAvailability` no ramo AGENDAR (sem visita ativa) |
| ↳ | **1123** | sítio 4 — `freeSlotsInPeriod` no ramo dia+período sem visita ativa (sítio 7 da `87-10`) |
| `packages/web/src/app/api/webhook/whatsapp/route.ts` | **1129-1143** | `onEvent: (event) => { logEvent({...}) }` — quem implementa o callback; NADA aqui muda nesta story |
| `packages/web/src/lib/logger.ts` | 55-73 | `logEvent` — fire-and-forget, escreve em `system_events`; é o destino final do evento novo, sem mudança de código |
| `packages/ai/src/flows/visit-slot.test.ts` | 306-359 | `describe("checkSlotAvailability por equipe")` — 5 `it`s que desestruturam `{ free }`/`{ free, alternatives }` diretamente; migram na `T4` |
| ↳ | 280-304 | `fakeSupabase` local — precisa do modo de injeção de erro (`T0`) |
| ↳ | 482-531 | `describe("freeSlotsInPeriod (Story 75-245 AC5)")` — 4 `it`s com `const slots = await freeSlotsInPeriod(...)` direto (sem destructuring de objeto); migram na `T4` |
| ↳ | 576-653 | `describe("freeSlotsInPeriod — oferta espalhada (Story 87-17 AC1/AC2/AC4)")` — 6 `it`s, mesma migração |
| `packages/ai/src/chat/__fixtures__/fake-supabase.ts` | 130-230 | o `FakeResult`/`QueryBuilder` compartilhado dos testes de `pipeline.ts` — precisa do mesmo modo de injeção de erro para `appointments` (`T0`) |
| `packages/ai/src/chat/pipeline-agenda-state.test.ts` | ~376, ~598, ~640 | testes que exercitam os sítios `:1044`/`:1123` via `processMessage` — não deveriam mudar de valor (`AC9`), mas valem conferência dado o histórico de ponto cego (`87-17` R1) |
| `packages/ai/src/chat/pipeline-scheduling.test.ts` | 127-190 | testes fim a fim dos sítios `:1015`/`:1107` (via `fakeAnthropic`) — idem |
| `docs/backlog.md` | linha 9-34 | item `[Nicole] freeSlotsInPeriod sem tratamento de erro` (`REL-1`) — ler antes: é o caminho A (`fetch` lança), que esta story NÃO toca |
| `packages/web/src/lib/appointments/team-slots.ts` | 30-42 | `ocupadosDaEquipe` — MESMA classe de defeito (`data ?? []`), OUTRO sistema (auto-agendamento); fora do escopo, achado documentado no §3 |
| `packages/web/src/app/api/agendar/[token]/route.ts` | 44-56 | `imobBusyBetween` — idem, implementação paralela |

### Testing

- Framework: Vitest (mesmo do resto do repo). Rodar da RAIZ (`npx vitest run`), nunca com
  `--reporter=basic` nem filtro `-t` com caracteres especiais sem escapar (a lição da `87-17`: `-t`
  é regex, `+`/`(`/`)` sem escape casam ZERO testes e dão falso verde por exit code 0 com tudo
  "skipped").
- Os testes novos desta story vivem em `visit-slot.test.ts` (unidade, as três funções) e podem
  ganhar um teste fim a fim em `pipeline-scheduling.test.ts` ou `pipeline-agenda-state.test.ts`
  para provar que o `emit` chega ao `onEvent` do `processMessage` (não só que a função interna o
  chama) — decisão do @dev sobre qual arquivo, não é `AC` separado (a cobertura já está coberta por
  `AC6`+`AC8`).
- `tsc --noEmit` em `packages/ai` precisa fechar em 0 — mas **`[@po 27/08]`: NÃO conte com o `tsc`
  como rede.** Ele pega chamador esquecido de função **exportada** cuja forma de RETORNO mudou
  (`checkSlotAvailability`/`freeSlotsInPeriod` → objeto), e isso é real. Ele **não** pega os dois
  chamadores internos de `isSlotFree`, porque `if (str)` e `filter(() => str)` compilam limpos (§6,
  medido). A rede ali são dois testes existentes + a `AC10`.

### Armadilhas

1. **Não confundir "unknown" com "occupied".** Um candidato `"unknown"` nunca deve aparecer em
   `alternatives`/`slots` (isso seria a mentira nova — "ocupado" sem base) nem ser contado como
   "verificado e livre" (a mentira original). Ele é OMITIDO, e só isso.
2. **`slots.length === 0` não é mais um evento único** (`AC5`). Qualquer refatoração futura que
   volte a tratar "lista vazia" como "não há horário livre" sem checar `houveIncerteza` reabre este
   defeito num lugar novo.
3. **Não envolver a chamada a `isSlotFree` num `try/catch` novo.** Isso pisaria no escopo do
   `REL-1` (caminho A, rejeição de rede) sem a decisão dele estar tomada — ver `AC7` e §2.
4. **O evento é agregado por CHAMADA, não por candidato** (`AC6`). Um período com 11 candidatos
   todos `"unknown"` deve produzir UMA linha em `system_events`, não onze.
5. **Os quatro sítios de `pipeline.ts`, não dois.** `checkSlotAvailability` e `freeSlotsInPeriod`
   têm dois chamadores cada, e a `87-17` já registrou (seu R1) que é fácil esquecer o segundo
   sítio de uma dupla porque o primeiro é o que aparece na evidência de produção.
6. **`espalhar` opera sobre a lista JÁ FILTRADA para `"free"`** — ela não muda, não precisa saber
   de `"unknown"`/`"occupied"`, e não deve ganhar um parâmetro novo. O filtro acontece ANTES dela,
   em `freeSlotsInPeriod`.
7. **Conflito de merge com a Fatia 2 da `87-17` (ainda não implementada) é esperado, não é bug.**
   As duas tocam a cadeia de `if` de `pipeline.ts` e a assinatura de `freeSlotsInPeriod` — ver R5.
8. 🔴 **`[@po 27/08]` O `tsc` NÃO protege o tri-estado.** `if (str)` e `filter(() => str)` compilam
   limpos e `"occupied"` é truthy — a forma booleana esquecida em UM dos dois chamadores transforma
   todo horário ocupado em "livre". Ver §6 (medido) e `AC10`.
9. 🔴 **`[@po 27/08]` `slots.length` é testado ANTES de `houveIncerteza`, sempre.** Inverter a ordem
   faz uma incerteza de 1 candidato entre 11 descartar uma oferta boa e inteira. Ver `AC4-(ii)`.
10. **`[@po 27/08]` O curto-circuito do primário `"unknown"` não é otimização, é teto de latência.**
   Sem ele, o laço de alternativas varre até ~37 candidatos SEQUENCIAIS num outage. Ver `AC2-(ii)`.
11. **`[@po 27/08]` A Fatia 2 da `87-17` passa a ter uma precondição nova por causa desta story.**
   A resposta a "mais tarde" dela se apoia em *"o último horário livre do período é o teto"*. Depois
   desta story, um candidato omitido por `"unknown"` **no fim do período** faz esse teto virar
   mentira ("não tem nada mais tarde que 15h" quando as 17h só não foram checadas). A Fatia 2 tem de
   consultar `houveIncerteza` antes de afirmar um teto. Ver `R7`.

---

## O que esta story NÃO faz

| Fora do escopo | Motivo / destino |
|---|---|
| Rejeição de rede (`fetch` lançando) em `isSlotFree`/`checkSlotAvailability`/`freeSlotsInPeriod` | **`REL-1`** (`docs/backlog.md`), decisão pendente entre `Promise.allSettled` e `try/catch` honesto — remédio OPOSTO ao desta story, ver §2 |
| `ocupadosDaEquipe` (`team-slots.ts:36`) e `imobBusyBetween` (`agendar/[token]/route.ts:48`) — mesma classe de defeito (`data ?? []` em erro de consulta de lista) | **`[@po 27/08]` DECIDIDO: story própria `87-19`, P1, registrada em `docs/backlog.md` para `@sm *draft`.** Raio de alcance **maior** que o do `isSlotFree` (uma consulta apaga o dia inteiro; o helper é o último portão antes do `.insert()` nos dois `POST` públicos; sem humano no meio) — mas o remédio é **oposto** (falhar FECHADO, recusar a gravação), e juntar invariantes opostas no mesmo PR é o erro que a `AC7` existe para impedir. Fora deste deploy; **próxima da fila, antes da Fatia 2 da `87-17`.** Ver DECISÃO 2 no §3 |
| Escrever ou ler `ofertas_do_sistema`/`afirmado_pela_nicole` | `87-10` (`W1-2c`), intacta — esta story não cria nem lê estado novo |
| A Fatia 2 da `87-17` (`detectWantsLaterSlot`, "mais tarde") | Outra story, outro PR — ver §0 sobre ordem/conflito textual |
| Enriquecer a mensagem de "erro no horário pedido" com as alternativas que POR ACASO foram confirmadas livres durante a mesma checagem | Melhoria de produto sem incidente medido — a resposta honesta mínima ("não consegui confirmar") já resolve o defeito; oferecer alternativas ali é decisão de copy, não de correção |
| Tool use / o modelo consultando a agenda por conta própria | Epic 88 |
| Mudar a janela de sobreposição, `VISIT_DURATION_MIN`, `PERIOD_BOUNDS` ou qualquer regra de horário comercial | Fora — o defeito é só na interpretação do `error`, não na regra de negócio |

---

## Riscos

| # | Risco | Prob. | Mitigação (verificável) |
|---|---|---|---|
| R1 | 🔴 **`[@po 27/08]` REESCRITO — a mitigação original era FALSA.** `"occupied"` é confundido com `"free"` porque um dos dois chamadores ficou na forma booleana (`if (await isSlotFree(...))` / `filter(() => livre[i])`): **todo horário ocupado passa a ser oferecido e agendado como livre** | **Média** (não "baixa"): `tsc --strict` dá EXIT=0 e zero linhas nas duas formas (medido, §6) e o repo não tem `strict-boolean-expressions`. A probabilidade é a de um humano esquecer, sem nenhuma ferramenta avisando | **NÃO é o `tsc`.** São dois testes pré-existentes (`visit-slot.test.ts:325` e o sábado de manhã) + a **`AC10`**, que obriga as duas mutações que provam que eles reprovam. Consequência de errar: pior que o defeito original |
| R2 | Evento em excesso (um por candidato em vez de agregado) polui `system_events` | Média se não declarado | `AC6` — teto de uma emissão por chamada |
| R3 | `slots.length === 0` continua tratado como um único significado numa refatoração futura | Média | `AC5` + Armadilha 2, explícitas no código (comentário) |
| R4 | Esta story absorve, sem querer, o mecanismo do `REL-1` (ex.: um `try/catch` "de brinde" em volta de `isSlotFree`) | Baixa, mas o custo de errar é alto (decisão que não é desta story) | `AC7` — controle negativo explícito |
| R5 | Conflito de merge com a Fatia 2 da `87-17` (ainda não implementada), que também mexe em `freeSlotsInPeriod`/na cadeia de `if` de `pipeline.ts` | Média (duas stories tocando a mesma região em paralelo) | Resolução de merge, não de ordem — mesma régua da R8 da `87-17`; a mudança de assinatura desta story precisa estar visível para quem implementar a Fatia 2 depois |
| R7 | 🔴 **`[@po 27/08]`** A Fatia 2 da `87-17` ("mais tarde") herda uma precondição nova: o teto *"o último horário livre do período"* deixa de ser confiável quando o último candidato foi omitido por `"unknown"` → a Nicole diria "não tem nada mais tarde" sobre um horário que só não foi checado | Média — a Fatia 2 ainda não começou (`git grep detectWantsLaterSlot` → rc=1), então dá tempo de escrever a precondição antes | Registrado aqui e na `Armadilha 11`. A Fatia 2 tem de consultar `houveIncerteza` antes de afirmar qualquer teto. **Não é trabalho desta story** — é uma dívida de INTERFACE que esta story cria e declara |
| R8 | 🔴 **`[@po 27/08]`** Latência no caminho de erro: sem curto-circuito, o primário `"unknown"` faz o laço de alternativas varrer até ~37 candidatos **sequenciais** contra um banco que acabou de falhar, no caminho da resposta ao lead | Alta se não declarado (o cenário de outage é justamente onde o primário falha) | **`AC2-(ii)`** — `alternatives: []` e exatamente 1 consulta, medida com o `hooks.onEmit` do fake |
| R6 | As 14 chamadas de teste migradas perdem cobertura (ex.: alguém troca `const slots = await freeSlotsInPeriod(...)` por `const { slots } = await ...` mas esquece de capturar `houveIncerteza` onde importa) | Baixa — mas **duas dessas 14 são a única rede do `R1`** | `AC9` exige o total colado antes/depois **e a contagem de 14 conferida**; `AC10-iii` proíbe tocar a lista de argumentos; `T4` revisado item a item no PR |

---

## Definition of Done

`AC1`-**`AC10`** verdes, com os vermelhos/controles negativos colados no corpo do PR (não só no Dev
Agent Record); `tsc --noEmit` em `packages/ai` → 0; `npx vitest run` da RAIZ com total antes/depois
colado e delta explicado contra o baseline **da branch** (`3145 | 6`, `AC9`); **as TRÊS mutações do
`T6`** coladas com a árvore restaurada — inclusive as duas da `AC10`, sem as quais a story não fecha;
os dois sítios de `packages/web` citados no PR como **`87-19`, já decidida e registrada no backlog**
(não mais como "achado para o @po decidir").

**`[@po 27/08]` Fechamento do PR `#517`:** o PR passa a carregar as **duas** stories (DECISÃO 1). O
@qa emite **dois** gates — o da `87-17` Fatia 1 já existe (`CONCERNS`, `1454d4ca`) e continua válido
para as ACs dele; o desta story é novo. **Nenhum gate de fila do Epic 87.**

---

## Referências

- `packages/ai/src/flows/visit-slot.ts:552-698` — `isSlotFree`, `checkSlotAvailability`,
  `freeSlotsInPeriod`, `espalhar`
- `packages/ai/src/chat/pipeline.ts:362-395, 541, 771, 1015, 1044, 1107, 1123, 1275-1300` — o tipo
  `PipelineEvent`, o `emit` em escopo, o precedente de `buildSystemPrompt`, os quatro sítios e o
  padrão `NICOLE_SLOT_MISMATCH`/`NICOLE_SLOT_UNAUTHORIZED`
- `packages/web/src/app/api/webhook/whatsapp/route.ts:1129-1143` — onde `onEvent` vira `logEvent`
- `docs/backlog.md` (item `[Nicole] freeSlotsInPeriod sem tratamento de erro`) — `REL-1`, o
  caminho A que esta story deixa em aberto
- `docs/stories/87-17-oferta-de-horario-espalhada-e-mais-tarde-sem-eco.story.md` — a story irmã
  (direção oposta do defeito); `AC3`/`espalhar`, R1/R8 (dois chamadores, conflito textual)
- `docs/qa/gates/87-17-fatia1-oferta-de-horario-espalhada.yml` — origem do achado `REL-1`
- `packages/web/src/lib/appointments/team-slots.ts:22-42`,
  `packages/web/src/app/api/agendar/[token]/route.ts:44-56` — o achado de auditoria (§3), fora de
  escopo

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

**Agent Model Used:** Claude Opus 5 (1M context) — @dev (Dex), modo YOLO
**Base de implementação:** branch `fix/87-17-fatia1-oferta-de-horario-espalhada`, commits em cima de
`cdf4411e` (DECISÃO 1 do @po). Nada partiu de `main`.

### T0 — Baseline da BRANCH (não do `main`)

**Trava de sanidade do @po — a contagem de 14 confere, e a base é `cdf4411e`:**

```
$ grep -c "checkSlotAvailability(" packages/ai/src/flows/visit-slot.test.ts   →  5   (:319 :325 :336 :344 :355)
$ grep -c "freeSlotsInPeriod("     packages/ai/src/flows/visit-slot.test.ts   →  9   (:502 :511 :518 :524 :597 :608 :622 :631 :645)
                                                                       total →  14  ✅
```

**Suíte, ANTES (raiz):**

```
 Test Files  256 passed (256)
      Tests  3145 passed | 6 expected fail (3151)
EXIT=0
```

Idêntico ao baseline do gate da `87-17` Fatia 1. ✅

### T6 — Fechamento

**Suíte, DEPOIS (raiz):**

```
 Test Files  257 passed (257)
      Tests  3177 passed | 6 expected fail (3183)
EXIT=0
```

**Delta explicado (`AC9`):** `+1` arquivo (`pipeline-slot-query-error.test.ts`), `+32` testes —
`18` novos em `visit-slot.test.ts` (4 da `AC1` + 6 das `AC2`/`AC3`/`AC6` + 6 das `AC4`/`AC5`/`AC6` +
2 da `AC7`) e `14` no arquivo novo (`AC2-i`, `AC4-ii`, `AC5`, `AC6`, `AC8` × 4 sítios). Os `6 expected
fail` são os mesmos. **ZERO teste pré-existente mudou de valor esperado — nenhum golden recalibrado**,
ao contrário da `87-17`. `3145 + 32 = 3177`. ✅

**Typecheck:**

```
$ cd packages/ai && npx tsc --noEmit ; echo $?
0
```

**Lint:**

```
$ npm run lint  →  EXIT=0 ("8 successful, 8 total")
$ npm run lint 2>&1 | grep -iE "packages/ai/src/(flows/visit-slot|chat/pipeline|chat/__fixtures__)"  →  rc=1 (nenhum achado nos arquivos tocados)
```

As `34 problems (0 errors, 34 warnings)` de `@trifold/web` são pré-existentes e em arquivos que esta
story não toca.

### As TRÊS mutações obrigatórias do `T6` — saída bruta, árvore restaurada

#### (a) Reverter `if (error) return "unknown"` para `!data` (o `HEAD`) — 20 vermelhos

```
 Test Files  2 failed (2)
      Tests  20 failed | 105 passed (125)

 FAIL  visit-slot.test.ts > Story 87-18 AC4/AC5/AC6 > 🔴 AC5 — TODOS os candidatos incertos: slots vazio COM houveIncerteza true
AssertionError: expected [ '2026-08-27T15:00:00.000Z', …(2) ] to deeply equal []
- Expected      + Received
- []            + [ 2026-08-27T15:00:00.000Z, 2026-08-27T17:30:00.000Z, 2026-08-27T20:00:00.000Z ]
```

Com o `error` descartado, o outage total volta a produzir uma OFERTA de três horários — a mentira
original, agora medida.

#### (b) `AC10-i` — `checkSlotAvailability` na forma booleana `if (await isSlotFree(...))`

**O `tsc` NÃO protege, confirmado nesta árvore com contraprova:**

```
$ cd packages/ai && npx tsc --noEmit | grep -c .   →  0 linhas, EXIT=0
```

*Contraprova de que a invocação é capaz de reprovar:* na mesma sessão, antes da `T4`, o MESMO comando
apontou `TS2339`/`TS2345`/`TS7006` nos chamadores de `pipeline.ts` e de `visit-slot.test.ts` com
EXIT≠0. O verde acima é real, não é falso verde de invocação.

**A rede que EXISTE — o teste pré-existente fica vermelho:**

```
 FAIL  visit-slot.test.ts > checkSlotAvailability por equipe (Story 81-1) > compromisso HOUSE no mesmo horário bloqueia (comportamento original preservado)
AssertionError: expected true to be false // Object.is equality
- Expected      + Received
- false         + true
 ❯ packages/ai/src/flows/visit-slot.test.ts:363:18

 Test Files  1 failed (1)
      Tests  8 failed | 103 passed (111)
```

(O teste é o de `:325` na numeração do @po; virou `:363` porque a `T0` inseriu a injeção de erro no
`fakeSupabase`, acima dele. É o mesmo `it`.)

#### (c) `AC10-ii` — `freeSlotsInPeriod` com `filter((_, i) => resultados[i])` (predicado truthy)

```
$ cd packages/ai && npx tsc --noEmit | grep -c .   →  0 linhas, EXIT=0

 FAIL  visit-slot.test.ts > freeSlotsInPeriod (Story 75-245 AC5) > manhã de sábado com 10h ocupado → oferece 8h, 9h e 11h (espalhado nos 4 livres)
AssertionError: expected [ '2026-08-01T11:00:00.000Z', …(2) ] to deeply equal [ '2026-08-01T11:00:00.000Z', …(2) ]
  [
    "2026-08-01T11:00:00.000Z",
-   "2026-08-01T12:00:00.000Z",     ← 9:00 BRT esperado
+   "2026-08-01T12:30:00.000Z",     ← 9:30 BRT recebido
    "2026-08-01T14:00:00.000Z",
  ]

 Test Files  1 failed (1)
      Tests  7 failed | 104 passed (111)
```

Exatamente o previsto pelo @po: os 7 candidatos entram como livres em vez de 4, e `espalhar` devolve
`[8:00, 9:30, 11:00]`.

**Árvore restaurada e conferida byte a byte depois de cada mutação:**

```
$ diff scratchpad/vs.clean packages/ai/src/flows/visit-slot.ts && echo IDENTICO   →  IDENTICO
$ npx vitest run  →  257 files · 3177 passed | 6 expected fail · EXIT=0
```

### Falsificabilidade das ACs que o `tsc` e as mutações obrigatórias não cobrem

Nenhum teste novo desta story entrou no verde sem antes ser provado capaz de reprovar:

| AC | mutação de verificação | vermelho medido |
|---|---|---|
| `AC2-ii` (curto-circuito) | remover o `return` do ramo `primary === "unknown"` | `expected 26 to be 1` — **26 consultas SEQUENCIAIS** na fixture de segunda-feira 14h (resto do dia + o dia seguinte inteiro). A estimativa do @po era "até ~37"; o teto real depende do dia da fixture, e a ordem de grandeza está confirmada |
| `AC4-ii` (ordem normativa) | inverter para `houveIncerteza ? novo : slots.length ? …` | os DOIS testes `AC4-ii` (sítios `:1044` e `:1123`) vermelhos — a oferta boa de 6 candidatos confirmados era descartada por 1 incerto |
| `AC5` (lista vazia com dois significados) | remover o ramo `houveIncerteza` dos dois sítios de período | os DOIS testes `AC5` vermelhos — voltava a dizer "não há horário livre nesse período" num outage |

### `AC7` — controle de fronteira com o `REL-1`

A prova primária é comportamental, como o @po pediu: `await expect(freeSlotsInPeriod(...)).rejects
.toThrow("fetch failed")` e o mesmo para `checkSlotAvailability`. Os dois passam, o que só é possível
se a rejeição continuar subindo — qualquer `try/catch` novo os reprovaria.

Controle secundário, com o `grep` portável do @po (BSD/macOS):

```
$ git show cdf4411e:packages/ai/src/flows/visit-slot.ts | grep -nE "try[[:space:]]*\{"  →  rc=1 (zero)
$ grep -nE "try[[:space:]]*\{" packages/ai/src/flows/visit-slot.ts                      →  rc=1 (zero)
```

Zero `try` antes, zero depois. O `REL-1` segue integralmente em aberto — esta story o **estreita**
(a opção `a` de lá passa a contradizer a invariante desta), não o absorve.

### `AC10-iii` — nenhuma lista de ARGUMENTOS de chamada pré-existente foi tocada

```
$ git diff -U0 packages/ai/src/flows/visit-slot.test.ts | grep -E "^[-+].*(freeSlotsInPeriod|checkSlotAvailability)\("
```

As 8 linhas `-` têm cada uma a sua linha `+` correspondente com a **lista de argumentos idêntica** —
só o lado esquerdo (a desestruturação) mudou. Todas as outras linhas `+` são de testes novos.

**Os 4 `undefined` de produção previstos pela DECISÃO 3 conferem exatamente:** `:1015` → 0,
`:1044` → 1, `:1107` → 1, `:1123` → 2.

### Decisões autônomas (modo YOLO)

1. `[AUTO-DECISION]` **`isSlotFree` passou a ser exportada** → decidido exportar (reason: a `AC1`
   manda assertar os TRÊS estados de `isSlotFree`, e ela era privada; inferi-los pelas fixtures dos
   dois chamadores confundiria a AC do tri-estado com a AC do curto-circuito. É o **mesmo precedente
   já registrado no arquivo** para `espalhar` — *"exportada só para a `AC3` poder assertar a
   invariante direto"*. Não muda nenhum parâmetro nem nenhuma assinatura existente, logo não colide
   com a DECISÃO 3).
2. `[AUTO-DECISION]` **Onde vivem os testes de pipeline** (a story deixou explícito que é escolha do
   @dev) → **arquivo novo `pipeline-slot-query-error.test.ts`** (reason: as `AC2-i`/`AC4-ii`/`AC5`/
   `AC8` precisam de `failOn` no harness, e `pipeline-agenda-state.test.ts` é o arquivo dos **goldens
   byte a byte** da `87-4`/`87-17`. Reescrever o `turno()` dele para aceitar injeção de erro mexeria
   no harness de 7 goldens no mesmo PR em que a `AC9` promete zero recalibração. O arquivo novo
   **reusa** `createFakeSupabase` — não recria fake, conforme a regra da 75-279).
3. `[AUTO-DECISION]` **Forma da injeção no fake compartilhado** → `createFakeSupabase(seed, { failOn })`
   com predicado sobre `{ table, mode, maybeSingle, single, filters }`, mais o helper exportado
   `candidatoDeIsSlotFree()` (reason: `pipeline.ts` faz **três** `select` diferentes em
   `appointments` no mesmo turno — o histórico do `:683`, a visita ativa do `:930` e uma por
   candidato do `isSlotFree`. Falhar todos mudaria o RAMO exercitado em vez de exercitar o ramo sob
   incerteza, e o teste ficaria verde por acidente. A assinatura do `isSlotFree` é única: é a única
   que usa `gt` **e** `lt` sobre `scheduled_at`).
4. `[AUTO-DECISION]` **`primario_com_erro` no evento das alternativas** → literal `false` em vez de
   `primary === "unknown"` como no bloco ilustrativo do Desenho §2 (reason: com o curto-circuito da
   `AC2-ii`, `primary` naquele ponto é provadamente `"occupied"`; a comparação seria código morto que
   sugere um caso que não existe).
5. `[AUTO-DECISION]` **Texto das duas mensagens novas** → **verbatim** do Desenho §3, sem uma vírgula
   a mais (reason: Artigo IV, No Invention. Cogitei acrescentar *"a visita atual segue mantida"* na
   frase do sítio `:1015`, que é o padrão das outras frases daquele ramo — **não acrescentei**: copy
   não medida é invenção, e a `AC8` só exige que a frase nova apareça nos dois sítios. Fica
   registrado aqui como sugestão de copy para o @po, não como dívida).

### Divergências entre a story e o código real

Todas de forma, nenhuma de comportamento. Nenhuma exigiu decisão de escopo.

1. 🟡 **A contagem de "14 chamadas" está certa; a de "14 migrações" não.** As **5** chamadas de
   `checkSlotAvailability` **não precisaram de diff nenhum**: o retorno delas GANHOU um campo
   (`erroNoPedido`), não mudou de forma, então `const { free, alternatives } = …` continua válido e
   compilando. Só as **9** de `freeSlotsInPeriod` mudaram de tipo (`Date[]` → objeto), e dessas **8**
   têm atribuição (a de `:645` é um `await` solto, sem desestruturação). **Diffs reais: 8.** A trava
   de sanidade do @po (contar 14 CHAMADAS antes de editar) foi cumprida e confirmou a base
   `cdf4411e`.
2. 🟡 **O `tsc` pega 8 das 9 chamadas de `freeSlotsInPeriod`, não 9.** A de `:511`/`:512` (*"tarde de
   sábado é vazio"*) passa batido porque a asserção é `expect(slots).toEqual([])` e o `toEqual` aceita
   qualquer coisa — o objeto `{ slots: [], houveIncerteza: false }` **não** é igual a `[]`, então o
   teste reprovaria em execução, mas o `tsc` fica quieto. Reforça, num sítio novo, exatamente a lição
   do §6: **o `tsc` é uma rede com buracos, e não é ele que segura esta story.**
3. 🟡 **`freeSlotsInPeriod` tem um `return` precoce que a story não mencionou:** `if (close === null)
   return []` (dia fechado). Virou `return { slots: [], houveIncerteza: false }` — e ganhou teste
   próprio (*"lista vazia por REGRA de expediente não é incerteza"*, com `0` consultas medidas),
   porque é o único caminho em que `slots: []` é uma afirmação legítima sem nenhuma consulta feita.
4. 🟡 **`~37 consultas sequenciais` da `AC2-ii`/`R8` medido em `26`** na fixture de segunda-feira 14h
   (resto do dia pedido + o dia seguinte inteiro). O teto depende do dia da fixture; a ordem de
   grandeza e o risco estão confirmados, e o curto-circuito derruba para **1**.
5. 🟢 **Nenhum teste pré-existente ficou vermelho em nenhum momento** (fora das mutações
   deliberadas). A `AC9` fechou sem uma única recalibração de golden, incluindo os 7 goldens byte a
   byte de `pipeline-agenda-state.test.ts`.

### Fora de escopo, respeitado

`packages/web/src/lib/appointments/team-slots.ts`, `api/agendar/[token]/route.ts` e
`api/formulario/[token]/agenda/route.ts` **não foram tocados** (`87-19`, P1, remédio oposto —
falhar fechado). A Fatia 2 da `87-17` (`detectWantsLaterSlot`) não foi iniciada.
`ofertas_do_sistema`/`afirmado_pela_nicole` não foram lidos nem escritos. CodeRabbit CLI **não** foi
executado (decisão do Marcos, 27/08). Nenhum `git push`, nenhum toque no PR `#517`.

### Herança declarada para a Fatia 2 da `87-17` (`R7` / `Armadilha 11`)

`freeSlotsInPeriod` agora devolve `{ slots, houveIncerteza }`. O teto *"o último horário livre do
período"* em que a Fatia 2 se apoia **deixa de ser confiável** quando `houveIncerteza === true`: um
candidato omitido no fim do período faria a Nicole dizer *"não tem nada mais tarde que 15h"* sobre um
17h que só não foi checado. A precondição está escrita no docstring de `houveIncerteza`, no próprio
arquivo, para quem implementar a Fatia 2 depois.

### File List

**Modificados:**

- `packages/ai/src/flows/visit-slot.ts` — `SlotCheck` + `EmitSlotQueryError` novos; `isSlotFree`
  tri-estado e exportada; `checkSlotAvailability` com `erroNoPedido` + `emit` + curto-circuito;
  `freeSlotsInPeriod` com `houveIncerteza` + `emit` + filtro explícito por `"free"`
- `packages/ai/src/chat/pipeline.ts` — os 4 sítios (`:1015`, `:1044`, `:1107`, `:1123`) propagam
  `emit` e ganham as 2 frases novas; ordem normativa `slots.length` → `houveIncerteza`
- `packages/ai/src/chat/__fixtures__/fake-supabase.ts` — `T0b`: `failOn`, `FakeQueryProbe`,
  `FakeFailOn`, `candidatoDeIsSlotFree()`, registro dos filtros encadeados
- `packages/ai/src/flows/visit-slot.test.ts` — `T0a`: injeção de erro + `contadorDeConsultas` no
  `fakeSupabase` local; `T4`: 8 desestruturações migradas; `T5`: 18 testes novos (`AC1`-`AC7`)
- `docs/stories/87-18-erro-de-consulta-vira-horario-livre-em-silencio.story.md` — este registro

**Criados:**

- `packages/ai/src/chat/pipeline-slot-query-error.test.ts` — 14 testes de pipeline
  (`AC2-i`, `AC4-ii`, `AC5`, `AC6`, `AC8` nos 4 sítios), com controle sem-erro em cada sítio

### Handoff

Story **Ready for Review**. O @qa emite o **segundo** gate do PR `#517` (o da `87-17` Fatia 1,
`CONCERNS` em `1454d4ca`, continua válido para as ACs dele). Push, título e corpo do `#517` são do
@devops — nada foi enviado.

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-27 | v0.3 | **Implementada por @dev (Dex), modo YOLO, em cima de `cdf4411e` na branch da `87-17` (DECISÃO 1).** `Ready` → `Ready for Review`. `T0`-`T6` fechadas: `isSlotFree` tri-estado (e exportada, como `espalhar`), `erroNoPedido`/`houveIncerteza` + `emit` no fim, curto-circuito do primário, ordem normativa `slots.length` → `houveIncerteza` nos dois sítios de período. Suíte `3145 | 6` → `3177 | 6` (`+32` testes, `+1` arquivo), `tsc` 0, `lint` EXIT=0 sem achado nos arquivos tocados, **zero golden recalibrado**. As TRÊS mutações do `T6` coladas com a saída bruta e a árvore restaurada byte a byte — inclusive as duas da `AC10`, que confirmaram o diagnóstico do @po: `tsc --noEmit` dá **0 linhas / EXIT=0** nas duas formas booleanas, e a rede são os dois testes pré-existentes. `AC2-ii`, `AC4-ii` e `AC5` também tiveram a falsificabilidade medida por mutação. Cinco divergências de FORMA registradas (a maior: das 14 chamadas de teste, só **9** mudaram de tipo e só **8** precisaram de diff — as 5 de `checkSlotAvailability` GANHARAM um campo, não mudaram de forma) | @dev (Dex) |
| 2026-08-27 | v0.2 | **`[@po]` Validação (`8,0/10`, GO) — `Draft` → `Ready`.** Três decisões arbitradas: **(1)** as duas stories no MESMO PR `#517`, commits desta em cima de `cdf4411e` (o desenho desta story não existe em `main`); **(2)** os dois sítios de `packages/web` viram **`87-19`, P1** — raio de alcance MAIOR que o do `isSlotFree`, remédio OPOSTO (falhar fechado), fora deste deploy; **(3)** forma do `emit` travada como `AC10-iii` (novo parâmetro no fim; nada de objeto de opções), porque a refatoração reescreveria justamente os dois testes que são a única rede do tri-estado. Seis correções: §6/R1/Testing (o `tsc` **não** pega a forma booleana — medido, EXIT=0 com contraprova, e `"occupied"` truthy é pior que o defeito original) → `AC10` nova; curto-circuito do primário `"unknown"` (~37 consultas sequenciais no outage) → `AC2-ii`; controle da mensagem na incerteza PARCIAL → `AC4-ii`; controle da `AC6` trocado (o antigo ficou inalcançável); baseline da suíte corrigido para a branch (`AC9`); `erro` renomeado para `erroNoPedido`/`houveIncerteza` (um nome, duas semânticas); `AC7` com `grep` portável; `R7`/`R8` novos (precondição criada para a Fatia 2 da `87-17`; latência do caminho de erro); §1 com a cadeia até o `INSERT` e o `authorizedSlotUtc`; §2 com o estreitamento do `REL-1`; §3 com a auditoria corrigida | @po (Pax) |
| 2026-08-27 | v0.1 | Draft inicial — defeito verificado por leitura de código na revisão do PR `#517`; auditoria do padrão em `packages/ai`/`packages/web`; desenho de `isSlotFree` tri-estado + `erro` agregado + `emit` reaproveitando o padrão de `PipelineEvent`; fronteira explícita com o `REL-1` | @sm (River) |

---

## QA Results

**Gate:** 🟡 **CONCERNS** — aprovada, **nenhum bloqueante**, 4 follow-ups (1 medium, 3 low).
**Revisor:** Quinn (@qa) · **Data:** 2026-08-27 · **Arquivo do gate:**
`docs/qa/gates/87-18-erro-de-consulta-vira-horario-livre-em-silencio.yml`
**Escopo:** `cdf4411e..HEAD` (`77566360` + `17b6e5f0`). Este é o **SEGUNDO** gate do PR `#517`; o da
`87-17` Fatia 1 (`docs/qa/gates/87-17-fatia1-oferta-de-horario-espalhada.yml`, `CONCERNS`)
**continua válido e não foi refeito**. CodeRabbit **não** executado (decisão do Marcos, 27/08).

### Veredito

O conserto é o certo e é mínimo. `error` deixa de ser descartado, `"unknown"` nunca vira afirmação,
e o caminho que levava ao `INSERT` (`bookableSlotUtc` + `authorizedSlotUtc`) fica provadamente
cortado — medido no nível do `processMessage`, não só no retorno da função. **PR `#517` liberado
para o @devops com as duas stories.**

### Números que EU medi (nenhum aceito por relatório)

| medição | resultado |
|---|---|
| `npx vitest run` da raiz | **257 arquivos · 3177 passed \| 6 expected fail (3183) · EXIT=0** (duas execuções) |
| baseline da branch (`cdf4411e`) | 256 · 3145 \| 6 — número que eu medi no gate da `87-17`; delta **+1 arquivo / +32 testes** fechado por `diff` (+32 `it(`, **0** testes removidos, **0** `it.fails`/`skip` novos) |
| `tsc --noEmit` em `packages/ai` | EXIT=0, **0 linhas** (`wc -l`), com **contraprova** (`TS2322` ao injetar erro de tipo) |
| `npm run lint` | EXIT=0 — a 1ª execução veio **`8 cached, FULL TURBO` e foi descartada**; remedido com `npx turbo run lint --force` (0 cached, 40,3s), **0 achados** nos arquivos tocados |
| `AC9` — zero golden recalibrado | **CONFIRMADO**: nenhuma linha `-` do diff de `packages/ai` é uma linha `expect(`; 8 pares `-`/`+` com lista de **argumentos idêntica**; os 7 goldens de `pipeline-agenda-state.test.ts` intocados |

### Mutações que eu rodei (4) — árvore restaurada e conferida por `sha256` após cada uma

| mutação | resultado medido |
|---|---|
| `AC10-i` — `if (primary)` | `tsc` EXIT=0 (o compilador **não** é a rede) e **8 failed \| 103 passed**, com o teste pré-existente *"compromisso HOUSE no mesmo horário bloqueia"* em `expected true to be false` — **verbatim** |
| `AC10-ii` — `filter((_, i) => resultados[i])` | `tsc` EXIT=0 e **7 failed \| 104 passed**, sábado de manhã acusando **`12:30Z`** onde esperava **`12:00Z`** — **verbatim** |
| `AC2-ii` — sem o `return` do ramo `unknown` | **`expected 26 to be 1`** — as 26 consultas sequenciais estão medidas por mim; o curto-circuito derruba para **1** |
| `AC4-ii` — ordem invertida nos 2 sítios | **2 failed \| 12 passed**, e os dois vermelhos são exatamente os dois testes `AC4-ii`, um por sítio |

**Prova extra, minha, que não estava no plano:** sweep de propriedades (arquivo temporário, apagado)
— semana 24–30/08 × `manha`/`tarde` × `limit` 1..12 com injeção de erro 1-em-N: **nenhum** horário
com erro é ofertado em nenhuma combinação, nenhum início estoura o fechamento, sábado à tarde **e
domingo** (o ramo `close === null`) saem vazios com `houveIncerteza false` e **0 consultas**, e
`isSlotFree` em 200 amostras nunca devolve `"free"` sob `error`. 5/5 verde, **com contraprova** (o
filtro truthy reprova a invariante central).

### Os 7 checks

| # | check | nota |
|---|---|---|
| 1 | Requirements — `AC1`–`AC10` implementados | ✅ PASS |
| 2 | Code Quality | ✅ PASS |
| 3 | Testing | ✅ PASS |
| 4 | Documentation | 🟡 CONCERNS (`DOC-1`, `TEST-1` — imprecisões de registro, zero código) |
| 5 | Performance | ✅ PASS (melhora medida: 26 → 1 no caminho de erro) |
| 6 | Security | ✅ PASS (o `INSERT` sob incerteza deixa de acontecer; zero PII no evento; a mensagem do `error` do PostgREST não vaza para o lead) |
| 7 | Observabilidade / efeitos de 2ª ordem | 🟡 CONCERNS (`OBS-1`) |

### Achados

**Bloqueantes: nenhum.**

- 🟡 **`OBS-1` (medium)** — a frase nova cita o horário pedido e o guard *fail-open* do `:1316`
  emite **`NICOLE_SLOT_UNAUTHORIZED`** por cima do `NICOLE_SLOT_QUERY_ERROR` correto. **Medido, não
  deduzido:** em 3 respostas plausíveis da Nicole sob incerteza, **2** resolvem dia+hora em
  `detectAffirmedSlot` (que não exige verbo de afirmação), e `authorizedSlotUtc` é nulo nesse ramo
  por desenho. Sem dano: só loga, nada é gravado, e o evento certo sai no mesmo turno. A classe
  **pré-existe** (o ramo "ocupado" sem alternativas tem a mesma forma) — esta story a alarga.
  **Destino:** `docs/backlog.md`, decisão de @po.
- 🔵 **`COPY-1` (low)** — a frase de incerteza do `:1015` não avisa que a visita atual segue
  mantida, e todos os outros ramos daquele sítio avisam. **O @dev fez certo em não inventar copy**
  (Artigo IV) e registrou a sugestão: o literal é **compartilhado** com o `:1107`, onde não existe
  visita ativa e a oração seria **falsa**. Não é um append — é escolha de copy, do @po.
- 🔵 **`TEST-1` (low)** — o ramo `close === null` (domingo) não tem teste na suíte. O teste citado
  pela divergência nº 3 exercita **sábado à tarde** (zero candidatos, `return` final), não o `return`
  precoce. Eu medi o domingo no meu sweep e o `tsc` protege a **forma** do retorno.
- 🔵 **`DOC-1` (low)** — `slots: []` é afirmação legítima em **quatro** caminhos, não um. A
  invariante correta, e que o código garante, é `houveIncerteza === false` ⟺ lista vazia é
  afirmação legítima.

### Os pontos julgados (detalhe completo no gate)

1. **Divergência nº 2 (`tsc` × `:511`/`:512`)** — **não** é buraco de cobertura e o teste **não**
   virou tautologia. Provado por experimento: desmigrei a linha, o `tsc` ficou **silencioso** e o
   teste ficou **vermelho**. O buraco é do compilador; a rede é a suíte.
2. **Curto-circuito** — 26 medido por mim, 1 com o curto-circuito. **Nenhuma** perda nova: no `HEAD`
   esse caminho já não oferecia alternativa (afirmava "LIVRE" e gravava).
3. **Ordem normativa `slots.length` → `houveIncerteza`** — respeitada nos dois sítios e **travada
   por teste** (a inversão reprova exatamente os dois `AC4-ii`).
4. **`AC5`** — as 4 frases lidas no código; **nenhuma** afirma disponibilidade ou indisponibilidade
   a partir de incerteza, e os 4 sítios têm teste de **conteúdo** com asserção negativa nas frases
   antigas **e** controle sem-erro por sítio. Nenhuma AC fica verde sobre uma falsidade.
5. **`emit` posicional** — nenhum parâmetro existente mudou de posição, nome ou default
   (`limit = 3` preservado); evento **agregado**, teto de 1 por chamada **estrutural** (os dois
   `emit` de `checkSlotAvailability` são mutuamente exclusivos pelo curto-circuito).
6. **`return` precoce** — comportamento correto; cobertura imprecisa (`TEST-1`/`DOC-1`).
7. **Regressão de sentido** — confirmada ausente por três vias: os testes da `87-17` seguem
   mordendo (aparecem nos vermelhos da mutação `c`), a razão estrutural (o laço de candidatos e
   `espalhar` não foram tocados) e o meu sweep.

### Condições (nenhuma bloqueante)

1. **PR `#517` liberado para o @devops com as DUAS stories.** Um PR = um deploy (DECISÃO 1).
2. **`OBS-1` já registrado** por mim em `docs/backlog.md` (P2, aditivo, sem tocar a edição
   concorrente do @po/@sm). Não desfazer esse registro ao resolver conflito de merge.
3. As condições do gate da `87-17` Fatia 1 seguem de pé (em especial o `PERF-1`; esta story
   **alivia** o caminho de erro, não responde o caminho feliz).
4. Este gate e `docs/qa/po-validation-87-18.md` devem entrar no PR — a story os referencia por
   caminho.

— Quinn, guardião da qualidade 🛡️
