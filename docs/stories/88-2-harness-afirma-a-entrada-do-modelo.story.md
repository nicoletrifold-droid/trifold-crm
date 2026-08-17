# Story 88-2 — O harness prova o que a Nicole RECEBEU, não só o que ela respondeu

**Epic:** 88 (Nicole — Tool use na agenda) · **Status:** `Ready for Review`
*(promovida de `Draft` pelo @po em 2026-08-16 — GO com 8 emendas aplicadas nas ACs, ver
`docs/qa/po-validation-88-2.md`)*
**Item do roadmap:** **`88-2`, Onda 0** (`epic-88-nicole-tool-use-agenda.md` §6.1) — *"Harness afirma
sobre a **entrada** do modelo: captura `MessageCreateParams` e permite asserção sobre `system`,
`messages`, `tools`, `tool_choice`"*. É o item que o §8.1 do epic chama de **pré-requisito real**
das Ondas 1–3: *"sem ele não há como provar que `tools`/`tool_choice` foram enviados"*.
**Criada por:** @sm (River) em 2026-08-16, a partir do briefing do @pm (correções A, B e C).
**Formato:** **Consolidação + nomeação de defeito por asserção sobre a ENTRADA.** Uma fábrica de
fake no lugar de cinco heurísticas caseiras; uma fixture que afirma o texto que o modelo recebeu.
**Executor:** @dev · validação: @qa
**Esforço:** **M** (1 módulo novo + 1 teste de contrato + 1 fixture de aceitação + 4 migrações
mecânicas)
**Risco:** **NENHUM de comportamento.** Test-only. Se o @dev precisar tocar
`packages/ai/src/chat/pipeline.ts` — inclusive para exportar algo —, **parou algo errado**: eu
reproduzi o turno do José de ponta a ponta com **zero** linha de produção alterada (§3).
**Migration:** nenhuma.
**Deploy:** **PR próprio, fora da fila de deploy.** Não é comportamento, não consome janela de 24 h.
**Dependências bloqueantes: NENHUMA.** Não depende do #428, do #429, da `87-10`, da `87-15/87-16`
nem de qualquer correção do Epic 87 — é o único item do `§8` do epic simultaneamente **desbloqueado,
de risco zero de comportamento e pré-requisito duro** (a `87-15` lista a ausência dele como um dos
três motivos de estar parada). Há **colisão de arquivo** com o #428 e com a `87-16`, resolvida por
escrito nas Fronteiras (§8).
**Ambiente:** nenhuma variável nova em produção. A única variável desta story é de teste local —
`AIOS_88_2_SEM_MARCADORES=1`, que troca `it.fails` por `it` (§7.3).

> **CodeRabbit Integration**: Disabled *(não há `coderabbit_integration` em
> `.aios-core/core-config.yaml`)*

> ### O que esta story entrega, em uma frase
>
> Hoje a casa consegue perguntar *"o que a Nicole respondeu?"* com precisão e *"o que a Nicole
> recebeu?"* por acidente — cinco vezes, de cinco jeitos diferentes, sem nenhum rótulo dizendo qual
> das 2 a 3 chamadas ao modelo está sendo afirmada. Esta story troca as cinco por **uma**, com
> rótulo, e usa a primeira asserção honesta sobre a entrada para **nomear um defeito de produção
> que nenhum teste de saída conseguiria nomear**.

---

## ⚠️ Três correções de registro, medidas por mim, antes de qualquer AC

> **Regra da casa desde 07/08 (7 de 8 checagens numéricas divergiram na validação do @po): onde a
> minha medição diverge do briefing, as DUAS ficam publicadas com o método.** Todas as medições
> abaixo são minhas, em 16/08/2026, contra `origin/main` `a60a1bc6`, com o comando ao lado.

### C-1 — *"Hoje nenhum teste da casa consegue afirmar o texto do bloco `[SISTEMA]`"* — **falso como escrito**

`pipeline-agenda-state.test.ts` afirma exatamente isso, **8 vezes**, e uma delas é a irmã gêmea do
caso do José:

```ts
// packages/ai/src/chat/pipeline-agenda-state.test.ts:299
expect(t.bloco).toContain("Visita JÁ confirmada para sexta-feira, 14 de agosto às 10:00")
```

```bash
$ grep -c 't.bloco).toContain' packages/ai/src/chat/pipeline-agenda-state.test.ts   # 8
$ grep -c '\.bloco'            packages/ai/src/chat/pipeline-agenda-state.test.ts   # 25
```

**O que é verdade e é o que importa:** a *capacidade* existe em **3 dos 5** arquivos, cada um com uma
implementação própria, **nenhuma protegida por rótulo**; a *fixture do José* não existe em lugar
nenhum; e **`tools`/`tool_choice` não são capturados por nenhum dos cinco** — que é a parte da
capacidade de que as Ondas 1–3 dependem. A correção **não enfraquece a story**: ela move o argumento
de *"não dá para afirmar"* (falso) para *"dá para afirmar de cinco jeitos, nenhum deles diz qual
chamada está sendo afirmada"* (verdadeiro, e é pior).

### C-2 — A causa do turno do José **não é** o `detectRescheduleIntent`. Medido, com controle.

O briefing diz: *"A causa proximal é de LEITURA: `detectRescheduleIntent` é regex de 11
palavras-chave (`visit-slot.ts:337`) e não casa a frase. Sem intenção detectada, o pipeline injeta
'Visita JÁ confirmada…'"*.

**A primeira metade é verdadeira; a segunda não se sustenta — e eu provei rodando o turno inteiro
com a palavra-chave ENXERTADA:**

| Mensagem do lead (mesmo estado: visita ativa 17/08 10:00 BRT) | Bloco `[SISTEMA]` que o modelo recebeu |
|---|---|
| `surgiu um compromisso amanhã justamente às 10h, dá pra ser a partir das 14h?` | 🔴 **`Visita JÁ confirmada … às 10:00. Se o cliente NÃO pediu para mudar nem cancelar, apenas confirme`** |
| **`podemos remarcar?` + a mesma frase** *(palavra-chave enxertada — `rescheduleIntent = true`)* | 🔴 **idêntico. `Visita JÁ confirmada … às 10:00`** |
| `dá pra ser a partir das 14h?` *(sem a hora do conflito, sem palavra-chave)* | ✅ `O cliente quer REMARCAR a visita de … 10:00 para … 14:00. O novo horário está LIVRE` |
| `tenho um compromisso às 10h amanhã, consegue às 14h?` | 🔴 `Visita JÁ confirmada … às 10:00` |

**A causa vinculante é outra, e é mais estreita:** `parseHour` (`visit-slot.ts:197`) devolve a
**PRIMEIRA** hora da frase (`t.match(...)`). O José nomeia a hora **da qual está fugindo** ("às
10h") antes da hora que **pede** ("das 14h"). O parser devolve `10:00`; `nDay` cai no dia da visita;
`newStartUtc` resolve **para o mesmo instante do `appointment`**; `differs = false`
(`pipeline.ts:950`); e a cadeia inteira de `else if` escorrega até o último `else`
(`pipeline.ts:1014-1017`), cuja premissa é *"o cliente não pediu para mudar"*.

```
$ npx tsx <script>            # reprodução completa em §3
reschedule: false   cancel: false
day:  { y: 2026, m: 7, d: 17 }
time: { hour: 10, minute: 0 }        ← a hora do CONFLITO, não a do pedido
evaluateSlot: 2026-08-17T13:00:00.000Z   ← exatamente o scheduled_at da visita existente
```

**Por que a correção importa para esta story, e não é preciosismo:** uma fixture escrita sobre a
causa errada vira **régua colinear** — passaria a verde no dia em que alguém acrescentasse
`"a partir de"` ao `RESCHEDULE_RE`, sem que o defeito tivesse sido tocado. A AC5 fixa a asserção
sobre o **texto do bloco**, e a tabela acima vira **controle** dentro da própria fixture: as quatro
variantes, com o veredito de cada uma. *(Duas notas de procedência: são **12** alternâncias no
`RESCHEDULE_RE`, não 11 — e a 12ª, `\bmudar o (?:dia|hor[aá]rio)\b`, é **inalcançável**, porque a 3ª,
`\bmuda\w*\b`, já casa "mudar". Não muda nada aqui; muda para quem for mexer no regex.)*

### C-3 — *"Estende o `pipeline-scheduling.test.ts`"* (§6.1 do epic) — **o arquivo eleito é o que não captura nada**

```bash
$ grep -n 'create: async' packages/ai/src/chat/pipeline-scheduling.test.ts
39:      create: async () => ({          # ← zero argumentos. Nada entra.
```

O @pm já corrigiu o rumo (correção A); o registro fica aqui porque **o texto do epic continua
dizendo o contrário** e alguém vai lê-lo depois de mim. Pedido de correção ao @pm no §12.

---

## Story

**Como** quem vai ligar tool use na agenda da Nicole com um lead pago do outro lado,
**Quero** um único jeito de afirmar **o que foi entregue ao modelo** — `system`, `messages`,
`tools`, `tool_choice` —, com rótulo dizendo qual das chamadas do turno está sendo afirmada,
**Para que** as Ondas 1–3 possam provar que a tool foi enviada, em vez de acreditar; e para que a
primeira coisa que esse instrumento faça seja **nomear um defeito real de produção pela entrada**,
que é onde ele mora.

---

## Context

### 1. Cinco fábricas de fake, cinco heurísticas, zero rótulo

```bash
$ grep -rl 'as unknown as Anthropic' packages/ai/src/chat/*.test.ts | wc -l      # 5
$ grep -rl 'processMessage' packages/ai/src/chat/*.test.ts | wc -l               # 5  (os MESMOS 5)
```

**Todo teste que roda um turno tem a sua própria fábrica. Nenhum reaproveita a do vizinho — 5 de 5.**

| Arquivo | Captura | Como decide **qual** chamada guardar | O que NUNCA captura |
|---|---|---|---|
| `pipeline-scheduling.test.ts:36` | **nada** (`create: async () => …`) | — | tudo |
| `nicole-enabled.test.ts:257` | só `system` (achatado com `join("\n\n")`) | *"a primeira que trouxer `system`"* (`captura.systemEnviado === ""`) | `messages`, `tools`, `tool_choice` |
| `pipeline-agenda-state.test.ts:47` | só o bloco da última mensagem | **nenhuma guarda** — a última chamada sobrescreve | `system`, `tools`, `tool_choice` |
| `pipeline-historico-cauda.test.ts:88` | `historico`, `bloco`, `system` | flag `capturou` — *"só a primeira"* | `tools`, `tool_choice`, papéis |
| `pipeline-corretor-no-historico.test.ts:127` | + `papeis`, `totalEntradas`, `blocos` c/ marca de cache | flag `capturou` — *"só a primeira"* | `tools`, `tool_choice` |

**O caso do `pipeline-agenda-state.test.ts` merece o parágrafo, porque ele está certo por acidente.**
Ele sobrescreve a captura a cada chamada; o que o salva é a **segunda chamada estourar**: o
`updateLeadMemory` e o `extractMemoryFragments` mandam `content` como **string**
(`lead-memory.ts:94`, `writer.ts:69`), e a linha `blocks.filter(...)` do mock chama `.filter` numa
string ⇒ `TypeError` ⇒ a `Promise` rejeita ⇒ o `.catch(...)` do fire-and-forget do `pipeline.ts:1706`
/`:1711` engole. **A proteção dele é um erro engolido por outro arquivo.** No dia em que a chamada
auxiliar mandar blocos em vez de string, 25 asserções passam a medir o prompt do Haiku.

### 2. O falso verde já está documentado — no repositório, hoje

```ts
// packages/ai/src/chat/nicole-enabled.test.ts:251-255
/**
 * ⚠️ O turno faz DUAS chamadas a `anthropic.messages.create`: a da resposta (com
 * `system`) e a da extração estruturada (sem `system`). Capturar a última zeraria
 * o `system` e as asserções de (i) passariam verdes contra uma string vazia — o
 * falso verde clássico. Guarda-se a PRIMEIRA que trouxer `system`.
 */
```

A casa **conhece** o modo de falha, **descreve** o modo de falha e o resolve **cinco vezes, em cinco
lugares, com quatro mecanismos diferentes** (guarda por `=== ""`, flag `capturou`, `TypeError`
engolido, e "não capturar nada"). É a definição de instrumento que precisa virar um só.

*(Duas imprecisões do comentário, que a AC2 conserta: as chamadas são **2 a 3**, não duas; e a
segunda não é "extração estruturada" — é o `processConversationTurn` do MemPalace, `writer.ts:69`.)*

### 3. O turno do José, reproduzido — com ZERO linha de produção alterada

Rodei `processMessage` contra `createFakeSupabase` com um `appointment` ativo em
`2026-08-17T13:00:00Z` (17/08 10:00 BRT) e a mensagem do José. **Saída bruta, sem edição:**

```
TOTAL NO RETORNO: 2
--- chamada 0: system=true  model=claude-sonnet-4-6            tools=undefined tool_choice=undefined
[SISTEMA: Visita JÁ confirmada para segunda-feira, 17 de agosto às 10:00. Se o cliente NÃO pediu
para mudar nem cancelar, apenas confirme com simpatia: "Sua visita tá marcada pra segunda-feira,
17 de agosto às 10:00, te espero lá!" REGRA ABSOLUTA: só afirme dia/horário de visita que esteja
NESTE bloco. Nunca invente, arredonde nem complete um horário — se o que o cliente pediu não está
aqui, PERGUNTE em vez de confirmar.]

surgiu um compromisso amanhã justamente às 10h, dá pra ser a partir das 14h?
--- chamada 1: system=false model=claude-haiku-4-5-20251001    tools=undefined tool_choice=undefined
Você é um agente de extração de memória para Nicole, assistente de vendas imobiliárias. […]
appointments depois: [{ … "scheduled_at":"2026-08-17T13:00:00.000Z" … }]   ← intacto
```

**É o incidente inteiro, em duas linhas de asserção possível:** o sistema mandou reconfirmar 10h
**porque acreditava que ninguém tinha pedido para mudar** — e o lead tinha acabado de pedir, com
hora e tudo. *(A reconstituição de produção: 12/08 11:34 a corretora confirma 09h por mensagem ·
11:45 o `appointment` nasce às 10:00, já divergente da fala · 16/08 14:16 o José pede 14h ·
14:20:18.320 `NICOLE_SLOT_MISMATCH` dispara · 14:20:18.419 a mensagem **sai assim mesmo**, 99 ms
depois · 15:27:46 um humano cancela e recria — 67 min de reparo.)*

**O inverso exato do caso Ronaldo** (`Epic 87 · CR-7`): lá a instrução estava certa e o modelo
desobedeceu; **aqui o modelo estava certo sobre o mundo e a instrução estava cega.** Nenhuma
asserção sobre a *saída* nomeia esse defeito — o modelo respondeu **obedecendo** ao que recebeu.

### 4. Quantas chamadas por turno — **medido, e a resposta depende de QUANDO você olha**

| Cenário | No instante em que `processMessage` resolve | Depois de 300 ms |
|---|---|---|
| `msgCount % 5 ≠ 0` (o comum) | **2** — `[0]` resposta (`system`, sonnet) · `[1]` writer (haiku, sem `system`) | 2 |
| `msgCount % 5 == 0` (`pipeline.ts:1685`) | **2** | **3** — entra o `12.5b` (haiku, sem `system`) |

O `12.5b` (`atualizarResumoComLastro`) **chega tarde**: ele tem um `await carregarAppointmentsDoLead`
antes da chamada (`lead-memory.ts:161`), então a invocação cai fora do tick em que o turno termina.
O `12.5c` (writer) chega **dentro** do turno, porque não tem `await` antes do `create`.

> 🔴 **Consequência dura, e é uma AC:** *"guarde a ÚLTIMA chamada"* não é só uma heurística errada de
> ordem — **é uma heurística que depende do relógio**. E qualquer asserção sobre o **total** de
> chamadas é flaky por construção. **Nenhuma AC desta story afirma total** (§7, M7-proibida).

> ⚠️ **Aviso datado (16/08, 22h): a árvore de trabalho já está mudando debaixo desta medição.** Há
> uma implementação da `87-16` **não commitada** na working tree deste repo (terceiros): `memory/
> writer.ts`, `memory/loader.ts` e `flows/memory-extraction.*` **deletados**, e o `12.5c`
> (`processConversationTurn`) **já removido** do `pipeline.ts`. Naquela árvore o turno faz **1**
> chamada no retorno, não 2. **Os números do §4 valem para `origin/main a60a1bc6`, que é a base
> desta story** — e é exatamente por isso que **nenhuma AC depende deles**. O @dev **remede na
> árvore do dia** e publica os dois valores (DoD).

### 5. O que muda debaixo desta story enquanto ela é escrita

| Em voo | Toca o quê | Efeito aqui |
|---|---|---|
| **#428** (`87-11`, janela 18/08) | `pipeline-corretor-no-historico.test.ts` + **cria `pipeline-collected-data.test.ts` com a 6ª fábrica ad-hoc** (`anthropicCapturando`, `create: async`) | A divergência **está crescendo agora**. Esses 2 arquivos **não são migrados** nesta PR (§8) |
| **#429** (`87-12`, janela 19/08) | `flows/handoff.*` | nenhum |
| **`87-16`** (`Ready` — e **já em implementação não commitada na working tree em 16/08 22h**) | remove `memory/writer.ts` e o `12.5c` (`pipeline.ts:1709-1711`) **e edita as 5 fixtures** (tira `lead_facts: []`) | Depois dela o turno faz **1 a 2** chamadas, não 2 a 3. **Por isso nada aqui pode depender de existir chamada auxiliar** — e por isso o @dev remede antes de começar |
| **`87-10`** (`Ready`) | `flows/agenda-state.ts`, `pipeline.ts:724` | nenhum arquivo em comum |

### 6. Linha de base, para o delta ser explicável

```bash
$ npx vitest run packages/ai/src/chat      # 8 arquivos · 202 testes · 202 verdes · 423 ms
$ cd packages/ai && npx tsc --noEmit       # 0 erros  (tsconfig include: ["src"] — cobre os testes)
$ find packages -path '*/node_modules' -prune -o -name '*.test.ts' -print | wc -l   # 188
```

Asserções que hoje leem a entrada, por arquivo *(grep meu, grosseiro de propósito — o @dev re-mede
com o executor)*:

| Arquivo | `it(` | `expect` sobre a entrada |
|---|---|---|
| `pipeline-corretor-no-historico.test.ts` | 38 | 29 |
| `pipeline-agenda-state.test.ts` | 28 | 23 |
| `pipeline-historico-cauda.test.ts` | 19 | 18 |
| `nicole-enabled.test.ts` | 9 | 5 |
| `pipeline-scheduling.test.ts` | 6 | **0** |

---

## Desenho

### 7.1 O harness — um módulo, uma regra de rótulo, uma falha barulhenta

`packages/ai/src/chat/__fixtures__/anthropic-harness.ts` — **não é `.test.ts` de propósito** (§9,
armadilha 1).

```ts
export interface ChamadaCapturada {
  indice: number
  /** "resposta" ⇔ `params.system !== undefined`. Regra única, declarada aqui e em lugar nenhum mais. */
  rotulo: "resposta" | "auxiliar"
  /** O `MessageCreateParams` CRU, como chegou. Nada é normalizado fora dos acessores. */
  params: Record<string, unknown>
  system: string                                   // blocos concatenados ("" se ausente)
  blocosDoSystem: Array<{ text: string; cacheavel: boolean }>
  messages: Array<{ role: string; content: unknown }>
  historico: string[]                              // conteúdos de todas menos a última
  papeis: string[]
  bloco: string                                    // texto da ÚLTIMA mensagem — inclui o [SISTEMA]
  tools: unknown | undefined
  toolChoice: unknown | undefined
  model: string | undefined
  maxTokens: number | undefined
}

export interface CapturaAnthropic {
  /** TODAS, em ordem de invocação. Nunca sobrescrito, nunca filtrado. */
  chamadas: ChamadaCapturada[]
  /** As rotuladas "resposta", em ordem. Na Onda 3 o loop de tool terá DUAS. */
  doTurno(): ChamadaCapturada[]
  /** Açúcar para o caso de hoje. ESTOURA se `doTurno().length !== 1`, nomeando quantas achou. */
  resposta(): ChamadaCapturada
  auxiliares(): ChamadaCapturada[]
}

export function criarAnthropicFake(opts?: {
  /** string vira `[{ type:"text", text }]`. Blocos crus habilitam a 88-1 (tool_use na posição 0). */
  resposta?: string | Array<Record<string, unknown>>
  /** Respostas por chamada de turno, para o loop de tool das Ondas 2–3. */
  respostas?: Array<string | Array<Record<string, unknown>>>
  usage?: Partial<Record<"input_tokens" | "output_tokens" | "cache_creation_input_tokens" | "cache_read_input_tokens", number>>
}): { anthropic: Anthropic; captura: CapturaAnthropic }
```

**As três decisões que fazem o instrumento valer, e o porquê de cada uma:**

1. **Rótulo por `system`, não por ordem.** É o único eixo estável hoje: as duas auxiliares são
   ambas `claude-haiku-4-5-20251001` e só se distinguem por `max_tokens` (200 no writer, 600 no
   resumo) — um eixo que a `87-16` apaga. Sub-rotular auxiliar é **fora de escopo, com motivo**.
2. **`resposta()` falha alto.** *"Pega a primeira que serve"* é exatamente o que produziu o falso
   verde do §2. Zero ou duas candidatas ⇒ `throw` com a contagem e a instrução de usar
   `doTurno()[i]`. **Silêncio aqui é o defeito que a story existe para matar.**
3. **`params` cru guardado inteiro.** Todo acessor futuro (`tools`, `tool_choice`, `betas`,
   `disable_parallel_tool_use`) sai daí sem tocar o harness.

### 7.2 A catraca — e a resposta escrita para *"o que a régua faz consigo mesma?"*

A régua é uma **função pura** exportada pelo harness:

```ts
export function arquivosComFabricaAdHoc(
  fontes: Array<{ path: string; source: string }>
): string[]        // detecção POR ARQUIVO: /as\s+unknown\s+as\s+Anthropic/  (tolerante a multilinha)
```

> 🔴 **A armadilha da `87-16`, que apareceu três vezes na mesma PR: a régua que varre o repositório
> varre a si mesma.** Aqui ela é neutralizada por construção, em três camadas — e eu escrevo o que
> cada objeto faz consigo mesmo, porque foi pedido por escrito:
>
> | Objeto | O que a régua faz com ele |
> |---|---|
> | `anthropic-harness.ts` (contém o cast — é ele que constrói o fake) | **Fora da população**: a população é `chat/**/*.test.ts`; ele não é `.test.ts`. Exclusão **estrutural**, não lista |
> | `anthropic-harness.test.ts` (o teste do próprio harness) | **Dentro** da população, e tem de sair **verde** — ele usa a fábrica, não o cast. Se um dia precisar do cast, entra na lista de exceções e a igualdade exata torna isso **visível** |
> | As fixtures de mutação da própria régua | **Nunca tocam o disco.** São `string`s passadas para `arquivosComFabricaAdHoc` — a função é pura justamente para isso |
> | Os outros **183** `.test.ts` do repo | **Fora da população.** Ver ponto cego abaixo |
>
> **População declarada:** `packages/ai/src/chat/**/*.test.ts` — **8 arquivos hoje**. **Ponto cego
> declarado, não escondido:** os **5** `packages/ai/src/flows/*.test.ts` que também constroem fake
> de `Anthropic` (`classify-contact`, `behavior-analysis`, `marketing-post-request`,
> `marketing-suggestions`, `message-review`) ficam **fora de propósito** — são mocks de *um flow*,
> não de um *turno*; varrê-los daria **5 vermelhos legítimos** e é assim que régua vira ruído. Um
> teste de turno criado fora de `chat/` escapa: aceito e escrito.

**A lista de exceções é comparada por IGUALDADE DE CONJUNTO, não por "está contida".** Assim ela
acende nos dois sentidos: alguém cria a 7ª fábrica ⇒ vermelho; alguém migra uma exceção e esquece de
tirá-la da lista ⇒ vermelho. Régua que só cresce é régua que nasce satisfeita.

### 7.3 A fixture do José — como ela fica vermelha, já que descreve um defeito **vivo**

**Sejamos exatos, porque a frase fácil aqui seria mentira:** uma fixture que descreve o
comportamento de hoje **nasce verde**. Ela não pode "ficar vermelha antes" contra o defeito — o
defeito está no ar. Chamar isso de vermelho comprovado seria o teatro que esta casa cobra dos
outros.

**O vermelho é real e vem de dois lugares, ambos já ratificados aqui dentro:**

**(a) O marcador de dívida — idioma da casa, usado na `87-0` e na `87-1`:**

```ts
// mesmo padrão de packages/ai/src/config-surfaces.test.ts:56 e prompts/contradiction.test.ts:68
const casoDeDivida = process.env.AIOS_88_2_SEM_MARCADORES === "1" ? it : it.fails
```

- `it(...)` **de caracterização** — afirma o que o bloco **diz hoje** (reconfirma 10:00). Verde.
- `casoDeDivida(...)` — afirma o que o bloco **deveria** dizer (registrar o pedido de 14h). Verde
  hoje **porque falha**; e **passa a FALHAR no dia em que alguém consertar** — obrigando quem
  consertar a ver esta story. Dívida que se apaga sozinha do inventário, não `skip` que apodrece.
- **O vermelho é demonstrável agora, num comando:**
  `AIOS_88_2_SEM_MARCADORES=1 npx vitest run packages/ai/src/chat/pipeline-entrada-do-modelo.test.ts`

**(b) As mutações do §7.4**, que é onde o instrumento em si é medido.

**Os quatro casos da fixture são a tabela do C-2**, e existem para quebrar a colinearidade entre
*"o regex de remarcação não casou"* e *"o parser pegou a hora errada"* — que é a diferença entre uma
régua que mede e uma que concorda:

| # | Mensagem | Asserção sobre `resposta().bloco` |
|---|---|---|
| 1 | `surgiu um compromisso amanhã justamente às 10h, dá pra ser a partir das 14h?` | contém `Visita JÁ confirmada … às 10:00` · **não** contém `REMARCAR` · **não** contém `14:00` |
| 2 | **controle que derruba a causa errada:** `podemos remarcar?` + a mesma frase | **idêntico ao 1** — a palavra-chave não muda nada |
| 3 | **controle positivo:** `dá pra ser a partir das 14h?` | contém `REMARCAR … para … 14:00` |
| 4 | **controle de grafia:** `… as 10, da pra ser a partir das 14h?` | contém `REMARCAR … 14:00` — sem o marcador `h`, o `10` não vira hora e o defeito **some** |

*(O caso 4 não é enfeite: ele mostra que o dano depende de o lead escrever `10h` em vez de `10`, e é
o tipo de coisa que só uma asserção sobre a entrada consegue dizer.)*

### 7.4 Mutações — com denominador declarado ANTES de rodar

| # | Mutação | Vermelho esperado | Por que ela existe |
|---|---|---|---|
| **M1a** | `bloco` passa a devolver `""` no harness | `pipeline-agenda-state` ✅ · `pipeline-historico-cauda` ✅ · a fixture do José ✅ · **`nicole-enabled` e `pipeline-scheduling` NÃO** (medido pelo @po: 0 asserções sobre `bloco`) | Prova que a migração não esvaziou nenhum arquivo — o modo de falha nº 1 de uma consolidação |
| **M1b** 🆕 | `system` passa a devolver `""` | **`nicole-enabled` ≥ 1** (5 asserções reais em `:342-346`/`:379`) · `pipeline-historico-cauda` ≥ 1 | Emenda **E1** do @po: sem ela o `nicole-enabled` não tem como ficar vermelho e a AC6-iii se autorreprova |
| **M1c** 🆕 | `historico` passa a devolver `[]` | `pipeline-historico-cauda` ≥ 1 | Idem — cobre o acessor que só aquele arquivo exercita |
| **M2** | a asserção do José aponta para `auxiliares()[0]` em vez de `resposta()` | **1** (a fixture do José) | É o falso verde do §2, convertido em controle: o rótulo **discrimina** |
| **M3** | duas chamadas com `system` (in-memory) e `resposta()` devolve a primeira em vez de estourar | **1** (contrato do harness) | Fail-loud. É o que separa este harness dos cinco de hoje |
| **M4** | no teste de contrato, a chamada **auxiliar chega primeiro** e o rótulo é decidido por ordem | **1** | Quebra a colinearidade `primeira == resposta`, que é **verdadeira em produção hoje** (§4) e por isso nunca foi testada |
| **M5** | régua: (a) fonte sintética com fábrica ad-hoc ⇒ **+1**; (b) mesma fonte com o cast **quebrado em duas linhas** ⇒ **+1**; (c) fonte usando `criarAnthropicFake` ⇒ **+0** | 3 casos | (b) é a lição da `87-16`: régua por linha perdeu 4 de 23 RPCs em multilinha |
| **M6** | acessores `tools`/`toolChoice` passam a devolver `undefined` fixo | **≥ 2** (contrato do harness) | Em produção eles são `undefined` **hoje** — sem este controle a AC3 nasce satisfeita e não mede nada |

**Mutações PROIBIDAS, com motivo — as três que esta casa já pagou para aprender:**

- ❌ **Mutar o `sistema()` (`pipeline.ts:872`) ou qualquer constante compartilhada.** Acende dezenas
  de sítios de uma vez e mascara o descoberto (achado da `87-11`: três sítios de `truncar()`, um sem
  cobertura). Além disso é código de produção — proibido duas vezes.
- ❌ **Mutar a guarda inteira** (o `else if` do `pipeline.ts:973-1018` como bloco). Esconde
  sub-expressões sem vermelho próprio (achado da `87-12`: `if (A || B)`, 6 sub-expressões, 3 sem
  rede). Se for preciso isolar, isola-se **uma** sub-expressão por vez.
- ❌ **Afirmar o total de chamadas** (`chamadas.length === 3`). É flaky por construção (§4) e a
  `87-16` muda o número.

---

## Escopo

**IN**
1. `__fixtures__/anthropic-harness.ts` — fábrica única, captura de **todas** as chamadas em ordem,
   rótulo por `system`, acessores (`system`, `blocosDoSystem`, `messages`, `historico`, `papeis`,
   `bloco`, `tools`, `toolChoice`, `model`, `maxTokens`), resposta configurável por **blocos**.
2. `__fixtures__/anthropic-harness.test.ts` — contrato do harness + as mutações M3/M4/M5/M6.
3. `pipeline-entrada-do-modelo.test.ts` — a fixture do José (4 casos) + o marcador de dívida.
4. Migração de **4** arquivos para o harness, **sem mudar uma única asserção de texto**.
5. A catraca (função pura + varredura de disco + lista de exceções por igualdade exata).

**FORA, com motivo**
- ❌ **Qualquer linha de `packages/ai/src/**` que não seja teste ou fixture.** Escopo negativo
  obrigatório do briefing. Nenhuma resposta da Nicole muda.
- ❌ **`pipeline-corretor-no-historico.test.ts` e `pipeline-collected-data.test.ts`** — ambos vivem
  no **#428**, aberto. Migrá-los é fabricar conflito num PR que já tem janela marcada (§8).
- ❌ **Os 5 fakes de `flows/*.test.ts`** — objeto diferente (um flow, não um turno). §7.2.
- ❌ **Um `rodarTurno` compartilhado.** Cada arquivo semeia um mundo diferente; unificar o **seed**
  junto com o **fake** é o caminho mais curto para uma fixture compartilhada mutável — armadilha que
  o `pipeline-agenda-state.test.ts:146` já documenta ("função, não constante: o `processMessage`
  MUTA o `collected_data`"). **O harness fake o cliente; ele não semeia banco.**
- ❌ **O golden set de 6 casos de agenda** (`PM1` do epic §7). Ver o pedido nº 2 ao @po (§12): ele
  é **cobertura**, não **capacidade**, 2 dos 6 já existem, e ele dobra o tamanho desta PR.
- ❌ Emitir evento, contador ou qualquer coisa que apareça em produção. Isso é o **88-3**.

---

## Acceptance Criteria

**AC1 — Existe UMA fábrica, e ela captura TODAS as chamadas, em ordem, sem sobrescrever.**
Dado um turno que faz 2 chamadas, quando o teste lê `captura.chamadas`, então há 2 entradas com
`indice` 0 e 1, na ordem de invocação, cada uma com o `MessageCreateParams` **cru** preservado.
Nenhuma entrada é descartada, filtrada ou substituída.

> 🔴 **Emenda do @po (E4) — AC1 é exercida no teste de CONTRATO, nunca sobre um turno real.**
> Como escrita, a AC1 pede uma contagem (`chamadas.length === 2`) — exatamente o que a
> **M7-proibida** do §7.4 proíbe, e com razão: eu medi 2 no retorno e **3 após 400 ms** quando
> `msgCount % 5 == 0` (saída no parecer). A AC1 se exerce chamando `anthropic.messages.create`
> **diretamente**, N vezes, dentro do `anthropic-harness.test.ts` — determinístico, sem
> fire-and-forget. **Sobre turno real só valem `doTurno()`, `resposta()` e `auxiliares()`; jamais
> `chamadas.length`.** Sem esta frase, as duas regras se contradizem e o @dev escolhe a errada.

**AC2 — O rótulo é declarado, e a ambiguidade FALHA ALTO.**
(i) `rotulo === "resposta"` ⇔ `params.system !== undefined`, e a regra vive em **um** lugar.
(ii) `resposta()` devolve a única chamada de turno; com **0** ou **≥2** candidatas ele **estoura**,
com mensagem que diz quantas achou e manda usar `doTurno()[i]`.
(iii) `doTurno()` devolve as chamadas de turno em ordem — é o que a Onda 3 usará quando o loop de
tool fizer duas.
(iv) O rótulo **não** depende de ordem de chegada: com a auxiliar chegando primeiro, a de `system`
continua sendo `"resposta"` (**M4**).

**AC3 — `tools` e `tool_choice` são LIDOS dos params, e isso é provado.**
Dado um `create` com `tools: [{ name: "agendar_visita", … }]` e
`tool_choice: { type: "tool", name: "agendar_visita" }`, quando o teste lê a chamada capturada,
então os dois voltam **idênticos ao que entrou**. Um controle no mesmo caso prova que hoje, num turno
real, os dois são `undefined` — **e o controle sozinho não vale como prova** (**M6**).

**AC4 — A resposta do fake aceita BLOCOS arbitrários, na ordem dada.**
`resposta: [{ type: "tool_use", … }, { type: "text", text: "…" }]` chega ao `pipeline.ts` nessa
ordem. É o que habilita a **88-1** a injetar `tool_use` na posição 0 sem escrever mais um mock.
Um caso do contrato prova a ordem preservada.

**AC5 — A fixture do José afirma o texto do bloco `[SISTEMA]`, com os 3 controles.**

> 🔴 **Emenda do @po (E3) — a mensagem do caso 1 é a STRING LITERAL DE PRODUÇÃO, não a paráfrase.**
> Eu a colhi do banco (`messages`, `role='user'`, 2026-08-16 14:16:03.242939+00, lead **José**) e
> rodei o turno com ela:
>
> ```
> Bom dia! Me surgiu um compromisso no trabalho para amanhã justamente ás 10h da pra  ser em algum horário a partir das 14h?
> ```
>
> *(dois espaços entre `pra` e `ser`, `ás` com crase invertida — copiar tal e qual)*. Veredito
> medido: `parseTimeParts = {hour:10}` · bloco = `Visita JÁ confirmada … às 10:00` ·
> `scheduled_at` intacto. É o idioma da casa (`88-13`: *"as 6 strings reais viram fixtures"*): a
> paráfrase do §7.3 dá o mesmo resultado **hoje**, e no dia em que não der ninguém saberá se o que
> mudou foi o produto ou a paráfrase. Denominador que justifica o cuidado: **1.683** mensagens de
> lead em 60 dias, **14** com expressão horária, **1** com duas horas na mesma frase — **é esta**.

(i) Caso 1 (José, verde/caracterização): `resposta().bloco` **contém**
`"Visita JÁ confirmada para segunda-feira, 17 de agosto às 10:00"` e **não contém** `"REMARCAR"` nem
`"14:00"`. *(A data é derivada do relógio fixado na fixture — `vi.useFakeTimers`, padrão do
`pipeline-agenda-state.test.ts:133`. Nada de `new Date()` solto.)*
(ii) Caso 2 (`podemos remarcar?` enxertado): **mesmo veredito do caso 1** — prova que a
palavra-chave não é a causa (C-2).
(iii) Caso 3 (`dá pra ser a partir das 14h?`): contém `"REMARCAR"` e `"14:00"` — controle positivo,
o pipeline **sabe** fazer certo.
(iv) Caso 4 (`as 10` sem `h`): contém `"REMARCAR"` e `"14:00"`.
(v) O `casoDeDivida` com a asserção correta (o bloco registra o pedido de 14h) está marcado com
`it.fails` e **fica vermelho de verdade** sob `AIOS_88_2_SEM_MARCADORES=1` — comando na Dev Note,
saída colada.

> 🔴 **Emenda do @po (E7) — `it.fails` é verde para QUALQUER `throw`, inclusive erro de setup.
> Medido:**
>
> ```
> ✓ A: falha por ASSERÇÃO (o vermelho honesto)                    → expected fail
> ✓ B: falha por ERRO DE SETUP (TypeError), asserção nem executa  → expected fail
> Tests  2 expected fail (2)
> ```
>
> As duas passam **igual**. Isto morde exatamente aqui: o `casoDeDivida` roda um `processMessage`
> inteiro sobre seeds que a **`87-16` está editando agora**. Um seed que mude de forma ⇒ `TypeError`
> ⇒ o marcador fica verde **para sempre**, e a evidência do (v) é um `paste` de uma vez só, nunca
> reconferido.
>
> **O remédio já está na story e custa zero — só faltava estar dito:** o **caso 1
> (caracterização, `it` normal)** roda **o mesmo turno, pelo mesmo helper** e afirma o bloco. Se o
> turno quebrar, **ele** fica vermelho. **A caracterização é a guarda de vivacidade do marcador de
> dívida**, e é por isso que ela NÃO pode ser removida por parecer "redundante" (fecha o R-6 pelo
> outro lado). **AC:** caso 1 e `casoDeDivida` compartilham o helper de turno, e isso está escrito
> no cabeçalho do arquivo.

(vi) O `appointment` semeado permanece **intacto** ao fim do turno — **nos casos 1 e 2 apenas**.

> 🔴 **Emenda do @po (E2) — como escrito, o (vi) reprovaria os casos 3 e 4. Medido:** nos controles
> positivos o pipeline **remarca de verdade** — `scheduled_at` sai de `2026-08-17T13:00:00.000Z` e
> vai para **`2026-08-17T17:00:00.000Z`** (14:00 BRT), com `appointments` continuando em **1** linha.
> Isso é bem melhor que "o bloco contém REMARCAR": é o **efeito**, não a instrução. **AC:**
> casos 1 e 2 ⇒ `scheduled_at` **inalterado**; casos 3 e 4 ⇒ `scheduled_at == 2026-08-17T17:00:00.000Z`
> e `appointments` com **1** linha (não duas). O par intacto × movido é o que prova que a fixture
> reproduz o incidente e não outra coisa.

**AC6 — Os 4 arquivos migrados não mudam uma asserção, e M1 acende TODOS.**
(i) `pipeline-scheduling.test.ts`, `nicole-enabled.test.ts`, `pipeline-agenda-state.test.ts` e
`pipeline-historico-cauda.test.ts` passam a usar `criarAnthropicFake`; **as fábricas locais somem**.
(ii) O texto das asserções existentes **não muda** — muda de onde o valor vem. `git diff` mostra
substituição de origem, não de expectativa.
(iii) Sob **M1**, **cada um dos arquivos migrados** tem ao menos um teste vermelho. Um arquivo
migrado que fique verde sob M1 **reprova a AC** — foi esvaziado pela migração.

> 🔴 **Emenda do @po (E1) — como escrita, a AC6-iii é INSATISFAZÍVEL, e ela reprova a AC6 irmã.**
> A M1 muta **um** acessor (`bloco → ""`). Eu medi o que cada arquivo migrado de fato lê:
>
> | Arquivo migrado | asserções sobre `bloco` | asserções sobre `system` | Vermelho sob M1 (`bloco`)? |
> |---|---|---|---|
> | `pipeline-agenda-state.test.ts` | **32 menções / 8 `toContain`** | 1 | ✅ sim |
> | `pipeline-historico-cauda.test.ts` | **21** | 13 | ✅ sim |
> | `nicole-enabled.test.ts` | **0** (as 3 menções são comentário — linhas 12, 14, 138) | **5 asserções reais** (`:342-346`, `:379`) | 🔴 **NÃO — fica verde** |
> | `pipeline-scheduling.test.ts` | **0** (a única menção é o nome de um `it`, `:163`) | 0 | 🔴 **NÃO — fica verde** |
>
> Ou seja: dois dos quatro arquivos migrados **não têm como** ficar vermelhos sob M1, e a AC6-iii
> os reprovaria por um defeito que não é deles. É a mesma classe da 87-16 (*"AC que reprova a AC
> irmã"*) — e o remédio é estender a mutação, nunca ignorá-la.
>
> **AC6-iii passa a ser, literalmente:** *para **cada** arquivo migrado existe **ao menos um
> acessor do harness** cuja neutralização (`→ ""` / `→ []` / `→ undefined`) deixa **ao menos um
> teste daquele arquivo** vermelho.* A M1 vira **família**:
> **M1a** `bloco → ""` · **M1b** `system → ""` · **M1c** `historico → []`.
> Entrega: a tabela **arquivo → acessor → nº de vermelhos**, com o esperado declarado **antes**.
> Arquivo migrado que fique verde sob **todos** os acessores reprova — aí sim foi esvaziado.

(iv) O `pipeline-scheduling.test.ts` (que hoje afirma **0** sobre a entrada) ganha **pelo menos uma**
asserção sobre a entrada, senão a migração dele é decorativa. **Emenda (E1-b): essa asserção tem de
ser de um acessor coberto pela família M1**, e o @dev declara qual — senão a AC6-iv é satisfeita por
uma asserção que nenhuma mutação alcança, que é a régua nascendo satisfeita (armadilha 2).

**AC7 — A catraca existe, é pura, e sabe o que faz consigo mesma.**

> 🔴 **Emenda do @po (E5) — as três camadas do §7.2 NÃO fecham. Falta a quarta, e é a que a
> `87-16` já pagou.** Eu rodei a régua proposta contra a população real e contra o arquivo que a
> story promete verde:
>
> ```
> populacao chat/**/*.test.ts (origin/main a60a1bc6) = 8   fabricas ad-hoc = 5   ← o §1 confere
> SIMULACAO anthropic-harness.test.ts com a fixture M5a como LITERAL  -> bate nele mesmo? true
> SIMULACAO M5b (cast quebrado em duas linhas, como literal)          -> bate?           true
> REMEDIO (montado por join, idioma da 87-16)                         -> bate?           false
> ```
>
> A camada 3 do §7.2 (*"as fixtures de mutação nunca tocam o disco"*) protege o **input** da régua
> — e não o **arquivo que carrega o literal**. O `anthropic-harness.test.ts` **está** na população,
> **é** lido do disco pela varredura da AC7-ii, e vai conter `as unknown as Anthropic` **como
> dado** (M5a) e **quebrado em duas linhas** (M5b). Resultado: a igualdade de conjunto acende
> contra o próprio teste do harness — e o "conserto" natural é pôr o arquivo na lista de exceções,
> que é a **auto-exceção** que esta casa proibiu por escrito.
>
> **O remédio já é lei aqui e está a 30 linhas de distância** — `pipeline-sem-mempalace.test.ts`
> (87-16) o documenta no cabeçalho: *"POR QUE OS NOMES PROIBIDOS SÃO MONTADOS, E NÃO ESCRITOS …
> O remédio é o import, nunca uma auto-exceção na lista de ignore."*
>
> **AC7-vi (nova):** nenhuma fixture de mutação escreve o cast por extenso — ele é **montado**
> (`["as unknown as", "Anthropic"].join(" ")`, e a variante multilinha por `join("\n  ")`). E há um
> caso **explícito** provando o fecho: a varredura de disco da AC7-ii, rodada sobre a população
> real, **não** devolve `anthropic-harness.test.ts` — com o arquivo já contendo as fixtures. Sem
> esse caso, a camada 4 é intenção, não contrato.

(i) `arquivosComFabricaAdHoc(fontes)` é pura e detecta **por arquivo**, tolerando o cast em
multilinha (**M5b**).
(ii) Um teste varre o disco na população `packages/ai/src/chat/**/*.test.ts` e compara o resultado
com `EXCECOES_DECLARADAS` por **igualdade de conjunto**.
(iii) `EXCECOES_DECLARADAS` é medida **no momento da implementação** e carrega, ao lado de cada
entrada, o **motivo** e a **condição de saída**. Estado esperado hoje: os 2 arquivos do #428 (ou
conjunto **vazio**, se o #428 já tiver mergeado e o @dev migrar os dois na mesma PR).

> 🔴 **Emenda do @po (E6) — a 6ª fábrica não está só no #428. Ela já nasceu, na `87-16`, e está no
> gate agora.** Medido na working tree de 16/08 22h:
>
> ```
> populacao chat/**/*.test.ts = 10   (era 8 em origin/main)
> HIT packages/ai/src/chat/pipeline-ai-summary-no-prompt.test.ts   ← 87-16 (AC1), `as unknown as Anthropic` na linha 118
>     packages/ai/src/chat/pipeline-sem-mempalace.test.ts          ← 87-16, sem fábrica (não roda turno)
> ```
>
> E o #428 confirmado por `gh pr view 428`: cria `pipeline-collected-data.test.ts` e edita
> `pipeline-corretor-no-historico.test.ts` — o §5 e o §8 estão certos sobre ele. O que faltava é o
> terceiro. **Estado esperado no dia do merge: 3 entradas** (`pipeline-corretor-no-historico`,
> `pipeline-collected-data`, `pipeline-ai-summary-no-prompt`), menos as que o @dev migrar na hora.
>
> **E a condição de saída precisa de um PAGADOR, não só de uma frase.** "Sai quando o #428
> mergear" não é dono. **AC:** toda entrada que sobrar no merge vira **um item de backlog nomeado**
> (`88-2b — migrar as fábricas residuais`), referenciado na própria constante. Exceção com dono e
> data é contenção; exceção com condição de saída sem dono é a porta aberta que o §7.2 diz estar
> fechando.
(iv) Os controles positivo e negativo da régua são **strings em memória** — nenhuma fixture de
mutação toca o disco (armadilha 1).
(v) O cabeçalho do arquivo declara a população, o ponto cego (`flows/*`, testes de turno fora de
`chat/`) e a razão de cada um.

**AC8 — Zero produção, suíte verde, delta explicado.**
(i) `git diff --stat $(git merge-base origin/main HEAD)..HEAD -- packages/` só mostra `*.test.ts` e
`__fixtures__/*`. **Nenhuma linha** de `pipeline.ts`, `visit-slot.ts`, `lead-memory.ts` ou
`writer.ts` — nem export novo.

> **Emenda do @po (E8-a):** o comando original era `git diff origin/main -- packages/` (duas
> pontas). Com a `87-16` e o #428 mergeando **no meio** desta story, esse diff passa a mostrar o
> que **o main ganhou e o branch não tem** — e a AC vira ou falso vermelho ou, pior, um vermelho
> "explicado". A base de comparação é o **merge-base**. *(Escopo negativo confirmado por mim: eu
> reproduzi o turno do José de ponta a ponta importando `processMessageWithMetadata` e
> `createFakeSupabase`, ambos **já exportados** — zero linha de produção, zero export novo. O §3 do
> @sm procede.)*

(ii) `npx vitest run packages/ai/src/chat` verde, com o delta de contagem explicado
(**baseline reconferido pelo @po em worktree limpo de `a60a1bc6`: 8 arquivos / 202 testes / 458 ms**).
(iii) `npx vitest run` (raiz) verde, com delta explicado. **Baseline medido pelo @po (E8-b), que a
story não declarava: 188 arquivos · `2416 passed | 6 expected fail (2422)`.** Os **6** são os
marcadores de dívida da `87-0`/`87-1` — o `casoDeDivida` desta story faz **7**, e é assim que o
delta se explica. *(Um `expected fail` a menos que o previsto é sinal de que um marcador foi
apagado, não de suíte mais limpa.)*
(iv) `cd packages/ai && npx tsc --noEmit` = **0** (reconferido pelo @po no worktree limpo: exit 0).

---

## Tarefas

- [x] **T1** — `__fixtures__/anthropic-harness.ts`: `criarAnthropicFake` + `CapturaAnthropic` +
      rótulo + `resposta()` fail-loud + acessores (AC1, AC2, AC3, AC4).
- [x] **T2** — `arquivosComFabricaAdHoc` (pura) no mesmo módulo (AC7-i).
- [x] **T3** — `__fixtures__/anthropic-harness.test.ts`: contrato + **M3, M4, M5, M6** com as
      contagens declaradas antes de rodar.
- [x] **T4** — `pipeline-entrada-do-modelo.test.ts`: os 4 casos do José + `casoDeDivida` +
      controle do `appointment` intacto (AC5). **Colar a saída de
      `AIOS_88_2_SEM_MARCADORES=1 …` na Dev Note.**
- [x] **T5** — migrar `pipeline-scheduling.test.ts` (+ a asserção de entrada que falta — AC6-iv).
- [x] **T6** — migrar `nicole-enabled.test.ts` (atenção: ele achata `system` com `join("\n\n")`; o
      harness usa `join("")` como os outros dois — **conferir se alguma asserção depende do
      separador** antes de trocar; se depender, o harness expõe `blocosDoSystem` e a asserção
      escolhe).
- [x] **T7** — migrar `pipeline-agenda-state.test.ts` (é o que hoje sobrevive por `TypeError`
      engolido: **medir antes e depois** — as 25 leituras de `.bloco` continuam com o mesmo valor).
- [x] **T8** — migrar `pipeline-historico-cauda.test.ts`.
- [x] **T9** — a catraca sobre disco + `EXCECOES_DECLARADAS` medida na hora (AC7-ii/iii).
- [x] **T10** — **família M1 (M1a `bloco` · M1b `system` · M1c `historico`)** sobre a suíte inteira,
      com a tabela **arquivo → acessor → nº de vermelhos**, esperado declarado antes (AC6-iii,
      emenda E1). O `pipeline-scheduling` só fecha com a asserção nova da AC6-iv, e o @dev declara
      **qual acessor** ela exercita.
- [x] **T11** — evidências do AC8 (diff restrito, suíte, `tsc`).

> **T5–T8 são independentes entre si e independentes do núcleo (T1–T4, T9).** Se qualquer uma
> colidir com a fila (#428/#429/`87-16` mergeando antes), ela **sai da PR** e o arquivo entra em
> `EXCECOES_DECLARADAS` com o motivo — a story **não trava por isso**. O que **não** pode acontecer
> é a lista deixar de refletir a realidade no momento do merge: a igualdade de conjunto do AC7-ii
> existe exatamente para tornar isso impossível de esquecer.

---

## Armadilhas

1. 🔴 **A régua varre a si mesma** — foi assim três vezes na mesma PR da `87-16`. Neutralizada por
   três camadas em §7.2: o harness não é `.test.ts` (estrutural), as mutações são strings em
   memória (nunca disco), e o teste do próprio harness fica **dentro** da população e limpo.
2. 🔴 **Régua que nasce satisfeita.** `tools`/`tool_choice` são `undefined` em 100% dos turnos hoje:
   afirmar `undefined` é afirmar nada. O que mede é **M6** (o acessor precisa devolver o que
   entrou).
3. 🔴 **Colinearidade `primeira == resposta`.** Verdadeira em produção hoje (§4) — logo um harness
   que rotule por ordem passaria em tudo. Só **M4**, com a auxiliar chegando primeiro, separa os
   dois eixos.
4. 🔴 **Fire-and-forget muda a contagem conforme o relógio** (§4). Nenhuma asserção sobre total.
5. 🔴 **A `87-16` remove o `12.5c`.** Depois dela pode não haver chamada auxiliar nenhuma. Nada
   aqui pode exigir que exista (`auxiliares()` pode ser `[]` e isso é válido).
6. 🔴 **A migração pode esvaziar um arquivo em silêncio** — é o modo de falha nº 1 de consolidação.
   Só **M1 por arquivo** pega.
7. 🔴 **A fixture do José descreve um defeito VIVO** — ela nasce verde e não pode ser vendida como
   "vermelho comprovado". O vermelho é o `AIOS_88_2_SEM_MARCADORES=1` e as mutações. Está escrito
   assim de propósito, em §7.3.
8. 🔴 **`nicole-enabled` achata `system` com `\n\n`; os outros com `""`.** Trocar o separador sem
   conferir muda o valor de uma asserção de `toContain` que atravesse fronteira de bloco. T6.
9. 🔴 **A 6ª fábrica está nascendo agora**, no #428. A catraca precisa refletir o mundo do dia do
   merge, não o de hoje.

---

## Fronteiras

| Arquivo | Quem mais mexe | Decisão |
|---|---|---|
| `chat/__fixtures__/anthropic-harness.ts` (novo) | ninguém | criado aqui |
| `chat/__fixtures__/anthropic-harness.test.ts` (novo) | ninguém | criado aqui |
| `chat/pipeline-entrada-do-modelo.test.ts` (novo) | ninguém | criado aqui |
| `chat/pipeline-scheduling.test.ts` | `87-16` (tira `lead_facts: []` do seed) | **migra** — regiões distintas (seed × fábrica) |
| `chat/nicole-enabled.test.ts` | `87-16` (idem) | **migra** |
| `chat/pipeline-agenda-state.test.ts` | `87-16` (idem) · `87-10` (não toca o arquivo) | **migra** |
| `chat/pipeline-historico-cauda.test.ts` | `87-16` (idem) | **migra** |
| `chat/pipeline-corretor-no-historico.test.ts` | **#428 (aberto)** · `87-16` | ⛔ **não toca** — exceção declarada |
| `chat/pipeline-collected-data.test.ts` | **#428 (aberto, é quem o cria)** | ⛔ **não toca** — exceção declarada |
| `chat/pipeline.ts` e qualquer produção | #428, `87-10`, `87-16` | ⛔ **zero linhas** |

**Ordem em relação à fila:** esta PR **não** depende do #427/#428/#429 nem da `87-16`, e **não**
consome janela de deploy. Se ela merge **antes** do #428, o #428 sobe com a 6ª fábrica e a catraca
já a lista como exceção. Se merge **depois**, o @dev migra os dois arquivos junto e
`EXCECOES_DECLARADAS` nasce **vazia** — que é o desfecho melhor.

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| R-1 | A migração esvazia um arquivo e a suíte fica verde por não medir mais nada | **Alta** | **M1 por arquivo** (AC6-iii): arquivo migrado verde sob M1 reprova |
| R-2 | Conflito com #428/`87-16` | Média | Fronteiras escritas; T5–T8 são descartáveis individualmente |
| R-3 | O harness vira "canivete" e absorve seed de banco | Média | Escopo negativo explícito: **fake do cliente, não do mundo** |
| R-4 | `resposta()` fail-loud quebrar um arquivo migrado que hoje passa por acidente | Média | **É o resultado desejado.** Se acontecer, o @dev documenta qual asserção media a chamada errada — é o achado, não o acidente |
| R-5 | A fixture do José virar `it.skip` no primeiro atrito | Média | `it.fails` com env var: **não existe caminho para apodrecer em silêncio** |
| R-6 | Alguém ler a caracterização como "comportamento aprovado" | Média | O `casoDeDivida` ao lado, no mesmo `describe`, diz o contrário em código |
| R-7 | Não existe CI (`.github/workflows` ausente) — catraca só vale se alguém rodar | Média | `Epic 87 · D5`. Até lá, gate manual do @qa com a suíte inteira, como nas `87-11/12/13` |

---

## Definition of Done

- [x] AC1–AC8 verdes, cada uma com evidência colada (comando + saída).
- [x] **M1–M6 rodadas, com a contagem esperada DECLARADA ANTES** e a medida ao lado; divergência
      explicada, não ajustada depois. *(M4 divergiu: 4 declarados × 6 medidos — explicado, não ajustado.)*
- [x] `AIOS_88_2_SEM_MARCADORES=1 npx vitest run packages/ai/src/chat/pipeline-entrada-do-modelo.test.ts`
      com a saída **vermelha** colada.
- [x] `git diff --stat $(git merge-base origin/main HEAD)..HEAD -- packages/` sem uma linha de produção (emenda E8-a).
- [x] `npx vitest run` (raiz) verde, delta explicado · `cd packages/ai && npx tsc --noEmit` = 0.
- [x] `EXCECOES_DECLARADAS` refletindo o estado real do repo, com motivo, **dono** e condição
      de saída por entrada — e conferida por instrumento independente (`git grep --untracked`).
- [x] Dev Notes com: as chamadas por turno **remedidas** na árvore do dia, e a tabela
      arquivo → acessor → nº de vermelhos.

---

## Respostas do @po (2026-08-16) — arbitragens

**R1 — `PM1` (golden set de 6 casos): fica FORA desta story. Pedido nº 2 DEFERIDO.**
Confirmei os três motivos do @sm com medição: `"As 11hrs"` existe
(`pipeline-scheduling.test.ts:126-173`, 75-279) e a cadeia da Sandra existe
(`pipeline-agenda-state.test.ts:142-148`) — **2 de 6 já pagos**. E o argumento de fundo é o que
decide: **88-2 entrega CAPACIDADE, `PM1` é COBERTURA.** Misturar as duas faz a régua nova nascer
junto com a população que ela mede, e a PR dobra sem que nada novo passe a ser afirmável. **`PM1`
vai para um item próprio da Onda 0, e o dono é o @pm** (o epic §7 o pendura em *"Suíte (88-2)"* —
esse ponteiro precisa passar a apontar para o item novo, senão o `PM1` fica órfão achando que já
foi entregue). Ele é barato **depois** desta story, porque usa o harness.

**R2 — o `it.fails` é honesto AQUI, e continua sendo por causa do caso 1.** Julgado como pedido:
a alternativa (`skip`) apodrece, e `it.fails` **se apaga sozinho** quando alguém conserta. O que
faltava era a guarda de vivacidade — está na emenda **E7**. Ressalva de inventário que vai para o
@pm: a casa já carrega **6** marcadores abertos (medidos na raiz), nenhum fechado; este é o
**7º**. Sete é o teto que eu aceito sem um item de faxina no backlog.

**R3 — a exceção de 2 (na verdade 3) arquivos é CONTENÇÃO, com a emenda E6, e seria porta aberta
sem ela.** A igualdade de conjunto acende nos dois sentidos e isso é bom desenho. O buraco não era
o mecanismo, era a **contabilidade** (faltava a fábrica que a `87-16` acabou de criar) e a
**titularidade** (condição de saída sem pagador). Com `88-2b` nomeado, fecha.

---

## Pedidos ao @po / @pm

1. **Ao @pm — corrigir o §6.1 do epic:** a linha do `88-2` diz *"Estende
   `pipeline-scheduling.test.ts`"*, e esse é justamente o arquivo que **não captura nada**
   (C-3). O @sm não edita o corpo do epic.
2. **Ao @po — arbitrar o `PM1` (golden set de 6 casos).** O epic (§7) o pendura em *"Suíte
   (88-2)"*; esta story o deixa **fora**, com três motivos: (a) o briefing do @pm define a fixture
   de aceitação como **o turno do José**, que é *capacidade*, não *cobertura*; (b) **2 dos 6 já
   existem** (`"As 11hrs"` em `pipeline-scheduling.test.ts` pela 75-279; a cadeia da Sandra em
   `pipeline-agenda-state.test.ts` AC1); (c) os 4 restantes dobram a PR. **Se o @po quiser dentro,
   é bloco B, +M de esforço, e eu redijo.**
3. **Ao @pm — registrar a C-2 onde ela morde.** *"O modelo entende o que o regex não entende"*
   ganhou aqui o **segundo** contra-exemplo medido (o primeiro foi o Ronaldo, §2.5 do epic): no
   turno do José o parser **entendeu** dia e hora — só que a hora **errada**, a do conflito. É
   material para o §2.5, e reforça a tese central do §2 pelo mesmo caminho do Ronaldo: o defeito é
   de **autoridade e de leitura da intenção**, não de compreensão.
4. **Ao @pm/@architect — o caso do José é candidato a AC do `88-5`.** Com a tool, esse turno vira
   `agendar_visita(17/08, 14:00)`; **mas o `tool_choice` forçado do §4.1 dispararia sobre um turno
   em que o determinismo resolveu `10:00`** — que é o **F-10** com uma segunda origem (não é o
   veredito "recusado", é o veredito **certo sobre o slot errado**). Vale uma linha no F-10.

---

## Dev Notes

**Reprodução do turno do José, para o @dev não começar do zero** (é o script que gerou o §3;
`processMessage`, `createFakeSupabase`, nenhuma alteração de produção):

- estado: `conversation_state.visit_proposed: true`, `collected_data: { name: "José" }`
- `appointments`: `[{ id:"appt-1", lead_id, org_id, team:"house", status:"scheduled",
  scheduled_at:"2026-08-17T13:00:00.000Z", google_event_id:null, broker_id:"broker-1" }]`
- relógio fixado em 16/08 (⇒ `"amanhã"` = 17/08); usar `vi.useFakeTimers({ toFake: ["Date"] })` +
  `vi.setSystemTime(...)`, com `afterEach(() => vi.useRealTimers())` — padrão do
  `pipeline-agenda-state.test.ts:133-137`
- `messages` semeadas: **1** (com 4, o `msgCount % 5 == 0` liga o `12.5b` e aparece a 3ª chamada,
  **depois** do retorno — §4)

**Ponteiros conferidos hoje contra `a60a1bc6`:** `pipeline.ts:872` (`sistema()`) · `:950`
(`differs`) · `:1014-1017` (o `else` que reconfirma) · `:1118` (a chamada do turno) · `:1685`
(`msgCount % 5`) · `:1695`/`:1710` (as duas fire-and-forget) · `visit-slot.ts:197` (`parseHour`) ·
`:337` (`RESCHEDULE_RE`) · `lead-memory.ts:94` e `writer.ts:69` (as auxiliares, ambas
`claude-haiku-4-5-20251001`, ambas sem `system`) · `config-surfaces.test.ts:56` e
`prompts/contradiction.test.ts:68` (o idioma do `it.fails`) · `prompts/snapshot.ts:104`
(`findRepoRoot`, para a varredura de disco — **reusar, não reescrever**).

**REUSE > CREATE:** se a `87-16` tiver mergeado antes, ela traz a catraca de zero-import com a
população derivada dos globs do `vitest.config.ts` (AC6 dela). **Reusar o helper de população** em
vez de duplicar a leitura de glob.

---

## Dev Agent Record

**Agente:** Dex (@dev) · **Data:** 2026-08-17 · **Modelo:** claude-opus-5
**Branch:** `story/88-2-harness-entrada-do-modelo`, cortada de `origin/main` `a60a1bc6`
**Onde:** worktree isolado (`git worktree add`), `node_modules` por symlink. A árvore principal
estava na branch da `87-16` com um `stash` de terceiros — nada dela foi tocado, nenhum `pop`.
**Sem push, sem PR, sem banco, nenhum DDL.**

### 0. Baselines remedidos por mim, no worktree limpo de `a60a1bc6`

| Medida | @po (16/08) | Eu (17/08) | |
|---|---|---|---|
| `packages/ai/src/chat` | 8 arq / 202 testes | **8 arq / 202 testes** | confere |
| raiz `npx vitest run` | 188 arq · 2416 passed \| 6 expected fail | **188 arq · 2416 passed \| 6 expected fail** | confere |
| `packages/ai` `tsc --noEmit` | 0 | **0** | confere |
| lint | 0 errors / 23 warnings | **0 errors / 23 warnings** | confere |

### 1. Chamadas por turno — **remedidas na árvore do dia** (DoD)

Base desta branch é `a60a1bc6`, então a `87-16` **não** está aqui e o `12.5c` ainda existe.
Medido com o próprio harness, seed variando só o nº de mensagens:

```
msgs=1  no retorno: 2  (resposta,auxiliar)   apos 400ms: 2
        resposta:claude-sonnet-4-6 | auxiliar:claude-haiku-4-5-20251001
msgs=4  no retorno: 2  (resposta,auxiliar)   apos 400ms: 3     ← msgCount % 5 == 0
        resposta:claude-sonnet-4-6 | auxiliar:claude-haiku-4-5-20251001 | auxiliar:claude-haiku-4-5-20251001
```

Os números do @sm/@po batem: **2 no retorno, 3 depois de ~300–400 ms**. Confirmado também o eixo
que justifica rotular por `system` e não por `max_tokens`: as **duas** auxiliares são
`claude-haiku-4-5-20251001`. **Nenhuma AC depende destes números** — depois da `87-16`,
`auxiliares()` pode ser `[]`, e há caso de contrato provando que isso é válido.

### 2. Família M1 — **esperado declarado ANTES de rodar**, medido ao lado (AC6-iii / emenda E1)

Esperado, publicado antes da execução (contagem de **testes** vermelhos, não de asserções):

| Arquivo migrado | M1a `bloco→""` | M1b `system→""` | M1c `historico→[]` |
|---|---|---|---|
| `pipeline-agenda-state` | ≥1 | 0 | 0 |
| `pipeline-historico-cauda` | ≥1 | ≥1 | ≥1 |
| `nicole-enabled` | **0** (0 asserções sobre `bloco`) | ≥1 | 0 |
| `pipeline-scheduling` | ≥1 *(só por causa da AC6-iv)* | 0 | ≥1 *(idem)* |

Medido:

| Arquivo | M1a | M1b | M1c | M1d `papeis→[]` | Fica vermelho? |
|---|---|---|---|---|---|
| `pipeline-agenda-state.test.ts` | **15** | 0 | 0 | 0 | ✅ por `bloco` |
| `pipeline-historico-cauda.test.ts` | **4** | **2** | **9** | 0 | ✅ pelos três |
| `nicole-enabled.test.ts` | **0** | **2** | 0 | 0 | ✅ por `system` |
| `pipeline-scheduling.test.ts` | **2** | 0 | **1** | 0 | ✅ por `bloco` e `historico` |
| `pipeline-entrada-do-modelo.test.ts` (novo) | **4** | **1** | 0 | 0 | ✅ |
| `anthropic-harness.test.ts` (contrato) | **4** | **1** | **1** | **1** | ✅ |
| **total da suíte** | **29** | **6** | **11** | **1** | |

**AC6-iii satisfeita para os 4 arquivos migrados**, e a emenda E1 fica provada nos dois sentidos:
`nicole-enabled` de fato dá **0** sob M1a — a AC original o reprovaria por um defeito que não é
dele —, e é o M1b que o acende. O `pipeline-scheduling`, que tinha **0** asserções sobre a entrada,
só fecha por causa da AC6-iv: **acessores declarados = `bloco` (M1a) e `historico` (M1c)**, ambos
da família (emenda E1-b).

### 3. As demais mutações — esperado × medido

| # | Mutação (sítio isolado) | Esperado | Medido | |
|---|---|---|---|---|
| **M2** | a fixture do José lê `auxiliares()[0]` no lugar de `resposta()` | ≥1, só nela | **5**, todos em `pipeline-entrada-do-modelo` | ✅ o rótulo discrimina |
| **M3** | `resposta()` devolve a primeira em vez de estourar | 2 (contrato) | **2** | ✅ |
| **M4** | rótulo decidido por ORDEM (`indice === 0`) | 4 (contrato) | **6** | ⚠️ divergiu — ver abaixo |
| **M5** | régua perde o `\s+` (padrão vira literal com espaço único) | 2 | **2** (M5b + o caso de mistura) | ✅ |
| **M6a** | `lerTools → undefined` fixo | 1 | **1** | ✅ |
| **M6b** | `lerToolChoice → undefined` fixo | 1 | **1** | ✅ |
| **ME** | `Math.min(i, n-1)` → `respostas[i] ?? respostas[n-1]` | **0 (equivalente)** | **0** | ✅ previsto |

**A divergência da M4, explicada e não ajustada.** Declarei 4 (AC2-ii, AC2-iii, AC2-iv e o caso de
duas chamadas idênticas) e medi **6**: entraram também o AC2-ii-b (com zero chamadas de turno, a
regra por ordem promove o índice 0 a "resposta" e `resposta()` deixa de estourar) e o caso de
`respostas` das Ondas 2–3 (a auxiliar do meio passa a consumir a lista). Os dois vermelhos são
legítimos e vão na direção honesta — a mutação é mais ampla do que eu previ, não mais estreita.

**Mutante equivalente declarado (ME), com o porquê medido.** Troquei o clamp `Math.min(i, n-1)` por
`respostas[i] ?? respostas[n-1]`: **0 vermelhos**, e não por falta de teste — as duas expressões
concordam para **todo** índice ≥ 0 num array denso e não vazio, e a guarda `length > 0` já está
acima. Equivalência por álgebra, não por ausência de cobertura.

**M6a e M6b nasceram de um ajuste que o gate deve saber.** Na primeira escrita `tools` e
`tool_choice` estavam no MESMO caso, e as duas mutações acendiam o **mesmo** teste — uma guarda
escondida atrás da outra. Separei em dois casos antes de medir; daí cada uma ter vermelho próprio.

**Mutações PROIBIDAS — não rodadas, e por quê:** nenhuma constante compartilhada
(`sistema()`, `pipeline.ts:872`) e nenhuma guarda inteira (`pipeline.ts:973-1018`) foi tocada:
a primeira é código de produção e acende dezenas de sítios de uma vez; a segunda esconde
sub-expressões sem vermelho próprio. **Nenhuma asserção sobre total de chamadas** existe fora do
teste de contrato, onde as chamadas são diretas e determinísticas (emenda E4).

### 4. O vermelho real do marcador de dívida (AC5-v)

```
$ AIOS_88_2_SEM_MARCADORES=1 npx vitest run packages/ai/src/chat/pipeline-entrada-do-modelo.test.ts

 ❯ packages/ai/src/chat/pipeline-entrada-do-modelo.test.ts (8 tests | 1 failed) 30ms
     × (v) DÍVIDA (88-14) — o bloco deveria registrar o pedido de 14h, e não registra 3ms

AssertionError: expected '[SISTEMA: Visita JÁ confirmada para s…' to contain '14:00'

- Expected
+ Received

- 14:00
+ [SISTEMA: Visita JÁ confirmada para segunda-feira, 17 de agosto às 10:00. Se o cliente NÃO pediu
+ para mudar nem cancelar, apenas confirme com simpatia: "Sua visita tá marcada pra segunda-feira,
+ 17 de agosto às 10:00, te espero lá!" REGRA ABSOLUTA: só afirme dia/horário de visita que esteja
+ NESTE bloco. Nunca invente, arredonde nem complete um horário — se o que o cliente pediu não está
+ aqui, PERGUNTE em vez de confirmar.]
+
+ Bom dia! Me surgiu um compromisso no trabalho para amanhã justamente ás 10h da pra  ser em algum
+ horário a partir das 14h?

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

É **falha de asserção**, não erro de setup — a distinção que a emenda E7 cobra, e a razão de o
caso 1 (caracterização) rodar o **mesmo** turno pelo **mesmo** helper: se o setup quebrar, é ele
que fica vermelho, e o marcador não pode ficar verde por acidente.

### 5. Os 4 casos do José — reprodução independente da tabela do @po

Os controles 3 e 4 aqui são **derivados do literal por uma substituição só** (mais forte que
frases novas: uma variável muda por vez). Medido, e bate com o @po em todas as colunas:

| # | Variação sobre o literal | Bloco `[SISTEMA]` | `scheduled_at` depois |
|---|---|---|---|
| 1 | literal de produção, byte a byte | 🔴 `Visita JÁ confirmada … às 10:00` | `13:00Z` **intacto** |
| 2 | `+ "podemos remarcar?"` | 🔴 **instrução idêntica ao 1** | `13:00Z` **intacto** |
| 3 | `− " justamente ás 10h"` | ✅ `REMARCAR … 14:00` | **`17:00Z`**, 1 linha |
| 4 | `"ás 10h" → "as 10"` | ✅ `REMARCAR … 14:00` | **`17:00Z`**, 1 linha |

A causa é `parseHour` devolver a **primeira** hora da frase (a do conflito), não o
`detectRescheduleIntent`. **Nada de produção foi tocado** — o conserto é o `88-14`.

### 6. A catraca, conferida por DOIS instrumentos independentes

```
$ npx vitest run packages/ai/src/chat/__fixtures__/anthropic-harness.test.ts -t "igualdade"
   Tests  4 passed | 20 skipped (24)

$ git grep --untracked -lE 'as[[:space:]]+unknown[[:space:]]+as[[:space:]]+Anthropic' \
    -- 'packages/ai/src/chat/*.test.ts' 'packages/ai/src/chat/**/*.test.ts'
packages/ai/src/chat/pipeline-corretor-no-historico.test.ts
```

A varredura do teste e o `git grep --untracked` devolvem **o mesmo conjunto de 1 arquivo**, igual a
`EXCECOES_DECLARADAS`. *(A flag `--untracked` importa: sem ela os arquivos novos, ainda fora do
índice, devolveriam 0 pelo motivo errado.)*

**Antes das migrações a catraca nasceu VERMELHA** — 5 arquivos encontrados × 1 declarado —, que é o
vermelho honesto da consolidação:

```
AssertionError: expected [ …(5) ] to deeply equal [ Array(1) ]
+   "packages/ai/src/chat/nicole-enabled.test.ts"
+   "packages/ai/src/chat/pipeline-agenda-state.test.ts"
    "packages/ai/src/chat/pipeline-corretor-no-historico.test.ts"
+   "packages/ai/src/chat/pipeline-historico-cauda.test.ts"
+   "packages/ai/src/chat/pipeline-scheduling.test.ts"
```

**A quarta camada (emenda E5) está fechada por contrato, não por intenção.** Nenhuma linha do
`anthropic-harness.test.ts` — código **ou comentário** — transcreve o que a régua procura: as
fixtures montam o padrão por `join`, e há caso explícito provando que a varredura de disco **não**
devolve o próprio arquivo, com um controle de vivacidade ao lado (a fixture montada realmente casa
a régua, senão o caso seria verde por a fixture ter deixado de ser um exemplo válido).

### 7. AC7-iii — o estado de `EXCECOES_DECLARADAS`, medido na hora

**1 entrada**, não 3: nesta base (`a60a1bc6`) nem o `pipeline-collected-data.test.ts` (#428) nem o
`pipeline-ai-summary-no-prompt.test.ts` (`87-16`) existem, e eu migrei os outros 4. A constante
documenta, no corpo, que **as duas chegam com a fila e a igualdade de conjunto vai acender no
merge** — e que isso é o desenho funcionando, não um defeito a silenciar com uma linha a mais.
Cada entrada carrega motivo, **dono (`88-2b`)** e condição de saída, e há caso de contrato que
reprova entrada sem dono ou apontando para arquivo inexistente.

### 8. Emenda E8-b — o delta da suíte, explicado

| | Antes (`a60a1bc6`) | Depois | Delta |
|---|---|---|---|
| `packages/ai/src/chat` | 8 arq · 202 | **10 arq · 237 passed \| 1 expected fail** | +2 arq · +36 |
| raiz | 188 arq · 2416 passed \| **6** expected fail | **190 arq · 2451 passed \| 7 expected fail** | +2 arq · +35 passed · **+1 expected fail** |

Os +36 de `chat`: **24** do contrato do harness (+1 do split M6a/M6b = 25), **8** da fixture do
José (7 passed + 1 expected fail) e **3** da AC6-iv no `pipeline-scheduling`. O 7º `expected fail`
é o `casoDeDivida` — os 6 anteriores são os marcadores da `87-0`/`87-1`. *(Um `expected fail` a
menos que o previsto seria sinal de marcador apagado, não de suíte mais limpa.)*

### 9. AC8 — escopo negativo, conferido contra o **merge-base** (emenda E8-a)

```
$ git diff --stat $(git merge-base origin/main HEAD)..HEAD -- packages/
 .../chat/__fixtures__/anthropic-harness.test.ts    | 447 +++++++++++++++++++++
 .../ai/src/chat/__fixtures__/anthropic-harness.ts  | 338 ++++++++++++++++
 packages/ai/src/chat/nicole-enabled.test.ts        |  55 +--
 packages/ai/src/chat/pipeline-agenda-state.test.ts |  30 +-
 .../ai/src/chat/pipeline-entrada-do-modelo.test.ts | 332 +++++++++++++++
 .../ai/src/chat/pipeline-historico-cauda.test.ts   |  60 +--
 packages/ai/src/chat/pipeline-scheduling.test.ts   |  87 +++-
 7 files changed, 1222 insertions(+), 127 deletions(-)
```

Só `*.test.ts` e `__fixtures__/*`. **Nenhuma linha** de `pipeline.ts`, `visit-slot.ts`,
`lead-memory.ts` ou `writer.ts` — nem export novo. Nenhuma resposta da Nicole muda.

`tsc --noEmit` = **0** em `ai`, `web` e `shared`. Lint = **0 errors / 23 warnings** (idêntico ao
baseline; nenhuma das 23 é de arquivo desta story).

### 10. Decisões autônomas (modo YOLO) e IDS

| Questão | Decisão | Motivo |
|---|---|---|
| `packages/shared/src/testing/source-scan.ts` para a população (REUSE sugerido pelo @po) | **CREATE local** | O módulo não existe em `a60a1bc6` — ele vem com a `87-16`, que não está nesta base. A varredura mora no teste, em ~12 linhas |
| Raiz do repo para a varredura | **REUSE** `findRepoRoot` (`prompts/snapshot.ts:104`) | Já é o idioma da casa (`config-surfaces.test.ts`); evita `__dirname` × `import.meta.url` |
| Semear o banco no harness | **NÃO** | Escopo negativo da story: o harness faz o fake do cliente, não do mundo |
| `papeisComAtual` / `totalEntradas` (que o `pipeline-corretor-no-historico` usa) | **fora** | Deriváveis de `messages`, que fica cru. Acessor sem consumidor é régua que nasce satisfeita |
| Controles 3 e 4 do José | **derivados do literal por 1 substituição** | Frase nova mudaria várias variáveis de uma vez; a substituição isola o eixo |
| `EXCECOES_DECLARADAS` com 3 entradas "antecipadas" | **NÃO — só a real (1)** | Declarar arquivo inexistente faria a régua nascer satisfeita e o caso de igualdade seria vácuo |

### 11. Para o @qa / @devops — o que vai acender no merge

1. **A catraca vai ficar vermelha se o #428 ou a `87-16` mergearem antes desta PR.** É o desenho:
   as duas trazem fábricas ad-hoc novas. Ou se migra o arquivo, ou se acrescenta a entrada com
   motivo e dono. **Não silenciar sem olhar.**
2. **Depois da `87-16`**, `auxiliares()` pode virar `[]`. Nada aqui exige que exista chamada
   auxiliar; há caso de contrato cobrindo. O único ponto que hoje lê auxiliares é o controle M2 da
   fixture do José, e ele itera sobre a lista (vazia ⇒ o `for` não roda; o resto do caso continua
   afirmando o `system` da resposta).
3. **`resposta()` é fail-loud de propósito.** Se algum arquivo migrado quebrar por isso no futuro,
   o achado é a asserção que estava medindo a chamada errada — não o harness.

---

### File List

**Criados**
- `packages/ai/src/chat/__fixtures__/anthropic-harness.ts` — a fábrica única, o rótulo, os
  acessores, `resposta()` fail-loud, a régua pura e `EXCECOES_DECLARADAS`
- `packages/ai/src/chat/__fixtures__/anthropic-harness.test.ts` — contrato (AC1–AC4) + a catraca
  sobre disco (AC7) + as mutações M3/M4/M5/M6
- `packages/ai/src/chat/pipeline-entrada-do-modelo.test.ts` — a fixture do José (4 casos), o
  `casoDeDivida` do `88-14` e o controle M2

**Migrados para o harness (nenhuma asserção de texto alterada)**
- `packages/ai/src/chat/pipeline-scheduling.test.ts` — + 3 casos sobre a entrada (AC6-iv)
- `packages/ai/src/chat/nicole-enabled.test.ts`
- `packages/ai/src/chat/pipeline-agenda-state.test.ts`
- `packages/ai/src/chat/pipeline-historico-cauda.test.ts`

**Atualizados**
- `docs/stories/88-2-harness-afirma-a-entrada-do-modelo.story.md` (Dev Agent Record, File List,
  checkboxes, Status)

**Produção: nenhum arquivo.** Zero linhas em `packages/ai/src/**` que não sejam teste ou fixture.

---

## QA Results

*(a preencher pelo @qa)*

---

## Validação do @sm — `story-draft-checklist` (2026-08-16)

| Categoria | Status | Observação |
|---|---|---|
| 1. Clareza de objetivo e contexto | **PASS** | Objetivo, valor, encaixe no `§6.1`/`§8.1` do epic e dependências (nenhuma bloqueante) declarados no cabeçalho e no §5 |
| 2. Guia de implementação técnica | **PASS** | API do harness escrita em TypeScript; 3 arquivos novos e 4 migrações nomeados; 14 ponteiros `arquivo:linha` conferidos hoje; variável de ambiente listada |
| 3. Eficácia das referências | **PASS** | Todas apontam para seção/linha (`epic-88 §6.1`, `§8.1`, `pipeline.ts:1014-1017`, `visit-slot.ts:197`, `config-surfaces.test.ts:56`), com a relevância dita ao lado |
| 4. Autocontenção | **PASS** | A saída bruta do turno do José está colada (§3); as heurísticas dos 5 mocks estão tabeladas; o incidente está reconstituído com horários |
| 5. Guia de teste | **PASS** | Vitest; 4 casos de aceitação com controles; **6 mutações com contagem esperada declarada antes** e 3 mutações **proibidas** com motivo; DoD exige as saídas coladas |
| 6. CodeRabbit | **N/A** | `coderabbit_integration` ausente do `core-config.yaml` ⇒ Disabled, aviso presente no cabeçalho |

**Veredito do @sm: READY para `@po *validate-story-draft`.** Clareza 9/10.
**O ponto que eu mesmo levaria ao @po primeiro:** a AC5 é uma **caracterização** — ela nasce verde
porque o defeito está vivo. Está escrito assim, em §7.3, com o vermelho demonstrável por env var e
pelas mutações. Se o @po preferir que a story **não** contenha caracterização de defeito, o corte é
limpo: caem AC5-(i)/(ii) e sobra o instrumento — mas some junto a única coisa que prova que o
instrumento serve para alguma coisa.

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-17 | 1.0 | **Implementada pelo @dev (Dex) — `Ready` → `Ready for Review`.** Branch `story/88-2-harness-entrada-do-modelo` cortada de `origin/main` `a60a1bc6`, em **worktree isolado** (a árvore principal estava na `87-16` com `stash` de terceiros; nada tocado). **T1–T11 fechadas.** 3 arquivos novos + 4 migrações, **zero linha de produção** (diff contra o merge-base, emenda E8-a). **Baselines reconferidos e batendo com o @po**: `chat` 8/202 · raiz 188 arq · 2416 passed | 6 expected fail · `tsc` 0 · lint 0 errors/23 warnings. **Depois**: `chat` **10 arq / 237 passed | 1 expected fail** · raiz **190 arq / 2451 passed | 7 expected fail** — delta = 24+1 contrato, 8 José, 3 AC6-iv, e o 7º marcador. **Família M1 com esperado declarado ANTES** (AC6-iii / E1): M1a `bloco` 29 vermelhos · M1b `system` 6 · M1c `historico` 11 · M1d `papeis` 1. Os 4 migrados ficam vermelhos: agenda-state por `bloco` (15), historico-cauda pelos três (4/2/9), **nicole-enabled por `system` (2) e ZERO sob M1a — a emenda E1 confirmada nos dois sentidos**, scheduling por `bloco` (2) e `historico` (1), que só existem por causa da AC6-iv (acessores declarados). **M2** = 5 vermelhos, só na fixture do José (o rótulo discrimina) · **M3** 2 · **M4** 4 declarados × **6 medidos** (divergência explicada, não ajustada: entraram o AC2-ii-b e o caso de `respostas`) · **M5** 2 · **M6a** 1 e **M6b** 1 (separei os dois acessores em casos próprios — juntos, uma guarda se escondia atrás da outra) · **ME equivalente previsto e medido em 0**, por álgebra do clamp. **Vermelho do marcador colado** e é falha de **asserção**, não de setup (E7). **Os 4 casos do José reproduzem a tabela do @po em todas as colunas**, com os controles 3 e 4 derivados do literal por **uma substituição só**; causa confirmada no `parseHour`, **`88-14` não tocado**. **Catraca conferida por dois instrumentos independentes** (varredura do teste × `git grep --untracked`), mesmo conjunto de 1 arquivo; ela **nasceu vermelha** antes das migrações (5×1). **AC7-vi fechada por contrato**: nenhuma linha do teste do harness — código ou comentário — transcreve o padrão; tudo montado por `join`, com caso explícito e controle de vivacidade. `EXCECOES_DECLARADAS` = **1 entrada real** (não 3 antecipadas, que fariam a régua nascer satisfeita), com motivo, **dono `88-2b`** e condição de saída; documentado que ela **vai acender no merge** do #428/`87-16` e que isso é o desenho. | @dev (Dex) |
| 2026-08-16 | 0.2 | **Validação do @po — GO (8,5/10), `Draft` → `Ready`, com 8 emendas nas ACs** (parecer completo em `docs/qa/po-validation-88-2.md`; todas as medições em worktree isolado de `a60a1bc6` + produção somente-SELECT). **C-2 do @sm RATIFICADA por reprodução independente:** a frase do José com `podemos remarcar?` **enxertada** produz bloco **idêntico** — a causa é `parseHour` devolvendo a hora do conflito (`{hour:10}`), não o `detectRescheduleIntent`; controles 3 e 4 dão `REMARCAR … 14:00` e **movem o `scheduled_at` para `17:00Z`**. **C-1 também ratificada** (8 `t.bloco).toContain` / 25 `.bloco`, linha 299 conferida) — a afirmação que eu havia repassado como fato era falsa. **Emendas:** **E1** a AC6-iii era insatisfazível (`nicole-enabled` tem **0** asserções sobre `bloco` e `pipeline-scheduling` **0** sobre a entrada ⇒ ficariam verdes sob M1 e a AC reprovaria a AC irmã) — M1 vira **família M1a/M1b/M1c** por acessor; **E2** o controle "appointment intacto" só vale nos casos 1–2, os casos 3–4 **remarcam de verdade** (`13:00Z → 17:00Z`) e isso vira controle de **efeito**; **E3** a fixture passa a usar a **string literal de produção** (banco, 16/08 14:16:03Z), não a paráfrase — denominador: 1.683 msgs de lead/60 d, **14** com hora, **1** com duas horas, e é esta; **E4** a AC1 pedia contagem de chamadas, que a própria M7-proibida veta ⇒ AC1 se exerce só no teste de contrato; **E5** 🔴 **as três camadas da auto-régua NÃO fechavam** — o `anthropic-harness.test.ts` está na população e conteria o cast **como literal** (M5a/M5b), auto-flagrando-se (simulado: `true`; com o `join` da `87-16`: `false`) ⇒ camada 4 obrigatória; **E6** a 6ª fábrica **já nasceu na `87-16`** (`pipeline-ai-summary-no-prompt.test.ts:118`), não só no #428 ⇒ exceções esperadas passam a **3**, cada uma com **dono** (`88-2b`), não só condição de saída; **E7** `it.fails` é verde para **erro de setup** igual a falha de asserção (medido: `2 expected fail`) ⇒ o caso 1 é declarado **guarda de vivacidade** do marcador; **E8** diff contra **merge-base** (não contra a ponta de `origin/main`, que vai andar com a `87-16`/#428) + baseline da raiz declarado (**188 arquivos · 2416 passed · 6 expected fail**, este vira o 7º). **Baselines reconferidos:** `chat` 8/202 verde · raiz verde · `tsc` 0. **Arbitragens:** `PM1` fica **fora** (pedido nº 2 deferido, com dono no @pm); `it.fails` **aceito**; exceções = **contenção** com E6. | @po (Pax) |
| 2026-08-16 | 0.1 | Criação, a partir do briefing do @pm (correções A/B/C) e de medição própria contra `a60a1bc6`. **Três correções de registro publicadas com o método (§C-1/C-2/C-3):** (1) *"nenhum teste consegue afirmar o bloco `[SISTEMA]`"* é **falso** — `pipeline-agenda-state.test.ts` afirma 8 vezes, inclusive `"Visita JÁ confirmada … às 10:00"`; o que não existe é a fixture do José, o rótulo e a captura de `tools`/`tool_choice`; (2) 🔴 **a causa do turno do José NÃO é o `detectRescheduleIntent`** — rodei o turno com a palavra-chave **enxertada** (`podemos remarcar?`) e o bloco saiu **idêntico**; a causa vinculante é `parseHour` (`visit-slot.ts:197`) devolver a **PRIMEIRA** hora da frase (a do conflito, `10h`), o que faz `newStartUtc` cair **em cima** do `appointment` existente, `differs = false` (`pipeline.ts:950`) e a cadeia escorregar até o `else` do `:1014`; controle positivo medido: a **mesma frase sem a hora do conflito** produz `REMARCAR … 14:00`; (3) o arquivo que o epic elege para estender é o único dos cinco que **não captura nada**. **Medições próprias:** 5 fábricas ad-hoc em `chat/` = **5 de 5** dos testes que rodam turno, com 4 mecanismos diferentes de "qual chamada guardar" — um deles (`pipeline-agenda-state`) protegido **por um `TypeError` engolido pelo `.catch` do fire-and-forget**; **2 a 3 chamadas por turno, e a 3ª chega DEPOIS do retorno** (medido: 2 no retorno, 3 após 300 ms quando `msgCount % 5 == 0`) ⇒ nenhuma asserção pode afirmar total; baseline `chat` = **8 arquivos / 202 testes / 423 ms**, `tsc` = 0, **188** `.test.ts` no repo. **O #428 está criando a 6ª fábrica agora** (`pipeline-collected-data.test.ts`) — a divergência cresce enquanto a story é escrita. **Vermelho resolvido pelo idioma da casa** (`it.fails` + `AIOS_88_2_SEM_MARCADORES=1`, padrão da `87-0`/`87-1`), com a admissão escrita de que uma fixture que descreve defeito vivo **nasce verde** e vender isso como "vermelho antes" seria teatro. **Auto-régua respondida por escrito em 3 camadas** (harness fora da população por não ser `.test.ts`; mutações da régua em memória, nunca no disco; teste do harness dentro da população e limpo) e **exceções por igualdade de conjunto**, que acende nos dois sentidos. 4 migrações, todas descartáveis individualmente por causa da fila. | @sm (River) |
