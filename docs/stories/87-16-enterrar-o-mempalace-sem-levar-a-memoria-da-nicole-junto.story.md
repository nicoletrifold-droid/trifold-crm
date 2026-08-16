# Story 87-16 — Enterrar o MemPalace sem levar a memória da Nicole junto

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** `Ready`
**Validada pelo @po (Pax) em 2026-08-16** — GO condicional, parecer em `docs/qa/po-validation-87-16.md`.
As correções numéricas do parecer (§1 do parecer: **476 ≠ 593**; AC2 com `pipeline.ts:1635`; AC5×AC6;
AC6 controle positivo; AC8-a) **já estão aplicadas abaixo** e marcadas com **`[@po 16/08]`**.
**Prioridade:** **P1 · Onda 1** (colocação atribuída pelo @po em `docs/qa/po-validation-87-15.md` §5.1)
**Item do roadmap:** **`W4-4` (parte)** — é o **`D2-(c)`**, *"enterrar o código morto"*, recomendado
em 05/08 e nunca escrito. **Recortada da `87-15`** por decisão do @po (NO-GO de 16/08, §3): a
`87-15` fica com o bloco B (substrato novo, `Draft` sem data); esta story é o bloco A **corrigido**.
**Criada por:** @sm (River) em 2026-08-16
**Executor:** @dev · validação: @qa
**Esforço:** **S** — 6 arquivos removidos, 1 bloco colapsado em ~6 linhas, 2 docstrings atualizados,
3 arquivos de teste novos
**Risco:** **Baixo de regressão · NENHUM comportamento novo** — *desde que a §2 seja respeitada.*
Como estava escrita na `87-15`, esta subtração **apagava o `ai_summary` do prompt em 59,3 % dos
turnos**. Ver §2, que é a razão de esta story existir separada.
**Migration:** **nenhuma.** Código puro. `git revert` desfaz em um comando.
**Deploy:** fila de um-fix-por-deploy da Onda 1. ⛔ **O merge fica atrás de uma linha do Gabriel
ratificando o `D2-(c)`** — ver §"A assimetria, declarada" . Escrever, implementar e testar **podem**
seguir sob a recomendação.

> ### O que esta story faz, em uma frase
>
> Remove o sistema de memória **que nunca existiu no banco** e que cobra Haiku, embeddings e
> round-trips a cada turno — **preservando byte a byte** a única coisa viva que passava por ele: a
> injeção do `ai_summary` no prompt da Nicole.

---

## Story

**Como** engenharia da Trifold, que passou quatro meses pagando por um sistema de memória cujas
tabelas nunca foram criadas,
**Queremos** remover esse sistema **sem remover junto o `ai_summary`**, que hoje chega ao prompt
**através** dele,
**Para que** o orçamento de latência e custo do Epic 88 seja financiado, e para que ninguém mais
leia um módulo exportado e testado e conclua que a Nicole tem memória estruturada.

---

## Context

### 1. O que está morto — medido contra produção

Projeto `dsopqkqjkmhytudaaolv`, Management API, **somente `SELECT`**. Medido pelo @sm em 16/08 e
**reproduzido ao número pelo @po** no mesmo dia:

```
lead_facts | lead_memories | match_lead_memory | migration 012
-----------+---------------+-------------------+---------------
null       | null          | 0 procs           | REGISTRADA como aplicada
```

**As duas tabelas e a RPC nunca existiram.** E a migration que as criaria está registrada como
aplicada em `supabase_migrations.schema_migrations` — a crença errada não estava num comentário,
estava na tabela de controle do próprio Postgres. *(Consertar esse registro **não** é desta story:
vai como achado.)*

**O custo, em 30 dias** (`messages`, produção, 2026-07-17 → 2026-08-16):

| Caminho | Arquivo:linha (`HEAD` `199a7a84`) | O que acontece | Volume / 30 d |
|---|---|---|---|
| **Escrita Haiku** | `pipeline.ts:1710` → `writer.ts` | **1 chamada Haiku + N `generateEmbedding` + N `insert`** | **476** 🔴 *(ver correção abaixo)* |
| **Escrita regex** | `pipeline.ts:1641-1676` | `update` + `select` + `insert` em `lead_facts` — 3 round-trips por fato | **182 fatos** |
| **Leitura L1** | `pipeline.ts:682` → `loader.ts:54-62` | `select` em `lead_facts` → `PGRST205` → `return ""` | **1.052** (= `role='user'`) |
| **Leitura L3** | `loader.ts:151-161` | **`generateEmbedding` (OpenAI, pago)** → `rpc` inexistente → `return ""` | **52** |

#### 🔴 **`[@po 16/08]` `role='assistant'` NÃO é o número de execuções do pipeline — são 476, não 593**

A v0.1 usava `count(messages role='assistant')` = **593** como se fosse o número de turnos do
pipeline. **Não é: `role='assistant'` tem sete escritores, e só um deles é o pipeline.** O
`saveMessages` (`pipeline.ts:2030`) grava **sem `metadata`**; todos os outros escrevem chaves.
Medido em produção, mesma janela de 30 dias:

```
role='assistant', 30 d                                                593
  metadata vazio  → saveMessages (pipeline)                           476   80,3 %
  is_transition   → HUMANO, send-message/route.ts:220 (é a 87-5)       83   14,0 %
  is_media        → send-library-media.ts:548                          29    4,9 %
  relationship_handoff → route-inbound.ts:178                           5    0,8 %
  followup_cron / post_visit_followup                                   0
                                                                     ----
  NÃO-pipeline                                                        117   19,7 %
```

A própria `87-5` já documentava um deles (`conversation-history.ts:15`: *"humano — com
`role: "assistant"`. São **127** mensagens em 60 dias"*). **593 superestima em 24,6 %.**
*(Conferido também: `assistant` de conversa **sem** `lead_id` = **0** em 30 d, então a guarda
`if (conversation?.lead_id)` não é o vazamento — os outros escritores são.)*

**⇒ Numerador correto e a régua que o produz:**
```sql
where role='assistant' and (metadata is null or metadata = '{}'::jsonb)
```

**≈ 476 chamadas Haiku + ≤ 1.831 embeddings + ~1.600 round-trips ao PostgREST descartados, a cada
30 dias.** O `Epic 88 · §8` chama isso de *"a diferença entre caber e não caber no teto do
`D88-3`"* (p95 hoje: **12.469 ms, n = 442**). **A direção do argumento não muda; o número, sim —
e ele aparece em quatro lugares desta story, todos corrigidos.**

---

### 2. 🔴 A correção que motiva esta story existir separada — leia antes de escrever qualquer linha

A `87-15` mapeou a leitura L1 como `pipeline.ts:682 → loader.ts:54-62 → 404 → return ""` **e parou
aí**. Nunca seguiu o que o chamador faz com esse `""`. **É o `""` que ARMA o caminho vivo.**

#### O mecanismo, linha a linha (conferido nesta árvore, `HEAD` `199a7a84`)

```
loader.ts:62     if (error || !facts || facts.length === 0) return ""     ← a tabela morta
loader.ts:193    const l1Snapshot = await loadL1Snapshot(...)             ← recebe ""
loader.ts:196    if (!l1Snapshot && aiSummaryFallback) {                  ← e é o "" que ARMA isto
loader.ts:198        l1Snapshot: `MEMORIA DO LEAD (resumo):\n${aiSummaryFallback}`
pipeline.ts:657  currentSummary = leadData?.ai_summary ?? null
pipeline.ts:682  loadMemoryContext(supabase, lead_id, message, currentSummary)
pipeline.ts:683  const parts = [l1Snapshot, l2, l3].filter(Boolean)       ← parts.length === 1
pipeline.ts:685  memoryContext = `\n${parts.join("\n\n")}\n\nUse essas informacoes…\n`
pipeline.ts:737  dynamicSuffix = … + memoryContext + …                    ← entra no system prompt
```

**`memory/loader.ts` é o ÚNICO caminho pelo qual o `ai_summary` chega ao prompt da Nicole.**
Conferido: `grep -rn "ai_summary" packages/ --include="*.ts"` devolve ~50 sítios, e **todos os
demais são UI, handoff, followup, cron e relatório**. Nenhum outro injeta no `processMessage`.

#### O denominador certo é **por turno**, não por lead

A `87-15` citou *"263 de 1.788 leads (14,7 %)"* e tratou como população pequena. **A injeção
acontece por turno.** Medido em produção, 30 dias:

```
leads com ai_summary não-vazio            263 de 1.788   14,7 %   ← o eixo errado
turnos role='user' de lead COM resumo     624 de 1.052   59,3 %   ← o eixo que importa
leads ATIVOS (30 d) com resumo            124 de   195   63,6 %
```

O viés é estrutural: **quem tem resumo é exatamente quem já conversou e voltou.**

#### A contraprova já estava no repositório, escrita por uma story mergeada

`packages/ai/src/flows/summary-grounding.ts:9` — **Story 87-7, em produção**:

> `* (memory/loader.ts, fallback do ai_summary, ativo em 100 % dos turnos`

Duas frases sobre o mesmo arquivo, com o sinal trocado. A da `87-7` está certa.

#### 🔴 O detalhe que o parecer do @po não fixa, e que decide se isto é subtração pura

O @po propõe *"colapsar `680-694` no ramo que o `catch` de `690-692` já implementa"*. **O
diagnóstico e o lugar estão certos. A string, não** — os dois ramos produzem cabeçalhos
**diferentes**, e o que roda em produção é o do ramo vivo, não o do `catch`:

| ramo | cabeçalho produzido | dispara em produção? |
|---|---|---|
| **vivo** (`loader.ts:198` + `pipeline.ts:685`) | `MEMORIA DO LEAD (resumo):` | **sim, 624 turnos / 30 d** |
| `catch` (`pipeline.ts:691-692`) | `MEMORIA DO LEAD (informacoes de conversas anteriores):` | **não, nunca** — mesmo motivo da §3 |
| `L1` cheio (`loader.ts:77`) | `MEMORIA DO LEAD (fatos ativos):` | **não, nunca** — `lead_facts` não existe |

**`[@po 16/08]` São TRÊS cabeçalhos no código de hoje, não dois** (a Armadilha 1 dizia dois), e
**dois deles nunca rodaram**. A diferença entre o vivo e o do `catch` é de **+29 caracteres**, não
+30 — `(informacoes de conversas anteriores)` tem **37** e `(resumo)` tem **8**. *(Rodado: a string
viva tem 145 chars e a do `catch` 174, com um resumo de 11 chars.)* Numa story cuja AC1(iii) é
equivalência **byte a byte**, o número que descreve a diferença também tem de fechar.

Colapsar literalmente no ramo do `catch` embarca **+29 caracteres de diferença de prompt em 59,3 %
dos turnos**, dentro de uma story cujo título é *"subtração"*. **A AC1 exige a string do ramo vivo,
byte a byte.** Se alguém quiser o cabeçalho melhor, é decisão de prompt e tem dono — não entra de
carona num enterro.

#### 🔴 E a suíte não pega nada disso hoje — medido, não suposto

```
testes que contêm a string "MEMORIA DO LEAD"          : 0
testes que assertam sobre `memoryContext`             : 0
fixtures de pipeline com `ai_summary` preenchido      : 0 de 6   (todas gravam `ai_summary: null`)
```

**Consequência: hoje o bloco `memoryContext` inteiro pode ser deletado e os 2.450 testes ficam
verdes.** A suíte tem só o **controle negativo** (`ai_summary: null`) e **zero** controle positivo.
É a armadilha da semana repetida — *"2.441 testes verdes com a guarda removida"* — e é exatamente o
número que a **AC1** existe para mover. **Uma AC que já nasça satisfeita não mede nada.**

---

### 3. A falha não é só silenciosa — é **inauditável**, e por um motivo mecânico

O `W0-2` do epic descreve o defeito como *"vira string vazia"*. Verdadeiro e **incompleto**. Nos
três `catch` do caminho, o `console.error` **nunca disparou uma vez**:

**`supabase-js` não lança em erro de PostgREST.** `.insert()` / `.select()` resolvem com
`{ data: null, error }`; só `.throwOnError()` lança. Como nenhum dos três call sites confere `error`
e nenhum usa `.throwOnError()`, o `catch` é decorativo:

| Call site | `catch` escrito | Já disparou? | Por quê |
|---|---|---|---|
| `pipeline.ts:1674` `"Regex extraction failed"` | sim | **não** | `.insert()` não lança |
| `writer.ts:136` `"[MEMORY_WRITER] Failed to save fragment"` | sim | **não** | idem |
| `pipeline.ts:688` fallback do `loadMemoryContext` | sim | **não** | `loadL1Snapshot` retorna `""`, não lança |

**É por isso que a §2 diz que o ramo `catch` nunca rodou em produção** — e por isso o cabeçalho que
o mundo real vê é o `(resumo)`.

---

### 4. O teste que deveria ter pego isto testa uma **fotocópia**

`packages/ai/src/memory/loader.test.ts` — **19 testes** (contados pelo executor: um `it(...)` mora
dentro de um `for` de 10 padrões, então `grep -c "it("` dá 20 e erra). O arquivo inteiro tem **uma**
linha de import:

```ts
import { describe, it, expect } from "vitest"   // ← e mais nada. Nenhum import de "./loader".
```

`detectRoom`, `estimateTokens` e `categorize` estão **reimplementados dentro do arquivo de teste**.
O @po **executou** a mutação: apagou `loader.ts` e os 19 testes ficaram **verdes**.

**A varredura foi feita e não vira story.** O @po varreu os 190 arquivos `*.test.ts` atrás de outros
casos e deu **1 de 190 (0,53 %)** — o próprio `loader.test.ts`, que esta story já apaga.
**Reproduzi a varredura eu mesmo, com a população derivada dos globs do `vitest.config.ts`:**

```
arquivos *.test.ts varridos (mesma população do vitest.config): 190
ZERO-IMPORT de módulo do projeto: 1
  → packages/ai/src/memory/loader.test.ts
```

No lugar da varredura, a **AC6** instala uma **catraca permanente** — XS, na mesma PR.

> *(Registro de método, do @po, e vale guardar: as duas primeiras passadas dele deram **41 de 190**
> e **3 de 190**, erradas por `import` multilinha e pelo alias `@web/`. Abrir story na primeira
> teria sido abrir sobre **21,6 % inventados**. O número só assentou quando a régua passou a derivar
> a população do `tsconfig`/`vitest.config` em vez de adivinhá-la.)*

**Baseline da suíte, medida por mim hoje nesta árvore de trabalho** (suja com `87-5 B`, `87-11` e
`87-12`), saída bruta:

```
 Test Files  190 passed (190)
      Tests  2444 passed | 6 expected fail (2450)
   Duration  5.11s
```

**2.450 / 190 é o denominador desta story.**

---

### 5. O que **fica**, e a correção aritmética que vem junto

**Fica o `12.5b` (`atualizarResumoComLastro`)** — é a `87-7`, é o `ai_summary` **com** guarda de
lastro, e continua sendo a memória em produção. Esta story **não o toca**.

🔴 **A `87-15` afirmava que `count(messages role='assistant')` é *"exatamente"* o número de chamadas
Haiku que deixam de acontecer. É falso, e o @po está certo ao apontar — mas a razão é mais precisa
do que "o `12.5b` também chama Haiku por turno". Conferido no código:**

```ts
// pipeline.ts:1678-1685 (HEAD) — 12.5b NÃO roda por turno   [@po 16/08: :1685, não :1684]
const { count: msgCount } = await supabase.from("messages")
  .select("id", { count: "exact", head: true }).eq("conversation_id", conversationId)
const shouldRunHaiku = (msgCount ?? 0) % 5 === 0            // ← HEAD :1685
if (shouldRunHaiku) { atualizarResumoComLastro({ … }) }   // ← e esta SEMPRE chama Haiku quando roda
```

| Consumidor de Haiku | Sai nesta story? | Frequência (verificada no código) |
|---|---|---|
| `processConversationTurn` (`12.5c`) | **SIM** | **1× por resposta do pipeline** ⇒ **476** / 30 d |
| `atualizarResumoComLastro` (`12.5b`) | **não** | gate `msgCount % 5 === 0` (`:1685`) — **não é por turno** |
| `haiku-enrichment` (cron `enrich-leads`) | **não** | fora do pipeline |

🔴 **`[@po 16/08]` Redação correta — e o "exatamente" continuava colado no numerador errado.** O
gate `% 5` está certo e a distinção `12.5b` × `12.5c` está certa. **Mas `count(messages
role='assistant')` NÃO é o número de execuções de `processConversationTurn`:** ele inclui **117
mensagens de sete escritores que não são o pipeline** (§1). O numerador é o `assistant` **sem
metadata**:

> `select count(*) from messages where role='assistant' and (metadata is null or metadata =
> '{}'::jsonb)` na janela **é o número de execuções de `processConversationTurn` evitadas** —
> baseline **476 / 30 d**. E **não** é o delta do total no console da Anthropic, porque `12.5b` e
> `haiku-enrichment` continuam.

⚠️ **Ordem de grandeza do que sobra do `12.5b`: ~1 em 5 execuções do pipeline ⇒ ≈ 95 sobre a base
de 476 em 30 dias. Isto é DERIVAÇÃO ARITMÉTICA a partir do gate no código, NÃO medição** — o
`msgCount` conta todas as mensagens da conversa (inclusive `role='broker'`, 1.297 / 30 d), então a
taxa real depende da mistura. **A AC7 pede que o @qa meça ou declare que não é medível — não que
copie este número.**

---

### 6. Correção de registro sobre o Epic 88 — a `87-15` errou a aritmética, e o briefing também

O `Epic 88 · §8` (*"Dependências do Epic 87 — o que é bloqueante e por quê"*) tem **exatamente 8
linhas**, e eu as contei uma a uma contra `HEAD`:

```
1. W0-0    2. W1-2b    3. W1-2c    4. W0-5    5. W2-1    6. MemPalace    7. W3    8. W4-1
```

- 🔴 **Não existe "nona linha".** O MemPalace **é** a **6ª das 8**, e é a **única sem story**. A
  `87-15` dizia *"lista oito entradas, nenhuma é memória de fato do lead"* e depois *"o que esta
  story fecha é a nona linha"* — **as duas frases se contradizem**. Fica: **6ª de 8, a única órfã**.
- 🔴 **E ela não está declarada como bloqueante.** A coluna se chama *"Bloqueia o quê?"* e a resposta
  do MemPalace é textualmente **"habilitante — latência"**. As outras dizem *"o item 88-9"*, *"o item
  88-7"*. **Esta story não destrava o Epic 88 — ela o financia.**

**O que isso faz com a prioridade: troca um argumento de dependência por um de custo de atraso — e o
segundo é mais forte, porque acumula.** Dependência espera o dependente e não piora enquanto espera.
Custo de atraso soma **476 Haiku + ~1.831 embeddings + ~1.600 round-trips descartados a cada 30
dias** (`[@po 16/08]`: 476, não 593 — §1), mais orçamento de latência que o `D88-3` vai precisar. É a diferença entre *"está na fila"*
e *"a fila está cobrando"*.

*(O substrato novo — bloco B, `87-15` — **não aparece** na tabela do `Epic 88 · §8`. Ele é
pré-requisito do `W4-2`, não da v1. Registrado lá.)*

---

## Onde esta story pertence, e a assimetria — declarada, não escondida

### A regra de corte da Onda 1 é atendida

`Epic 87 · §7`, item 2: *"nenhuma story pode adicionar um **novo caminho de decisão** da Nicole."*

| | Adiciona caminho de decisão? | Cabe na Onda 1? |
|---|---|---|
| Remover L1/L2/L3 + writer + extrator | **Não** — os três retornam `""` em 100 % dos turnos | **sim** |
| Colapsar no `ai_summary` com a string byte a byte | **Não** — é o mesmo prompt que sai hoje | **sim** |

**Fatiar também livra o enterro de uma dependência que não é dele:** o `W4-4` declara deps
**`D2, W3-1`** (`epic-87:1034`). O `W3-1` é o validador pós-resposta e **não tem relação nenhuma**
com enterrar código morto. Enquanto o enterro morasse dentro do `W4-4`, herdava um bloqueio
transitivo falso.

### A assimetria, declarada

O `D2` inteiro mora na §8 do epic, *"Decisões que dependem do Gabriel"*, e **o `D2-(c)` também é
recomendação, não ratificação** — o epic mostra como é uma decisão fechada de verdade: o `D3` traz
*"✅ FECHADA (06/08)"*. O `D2` não tem esse selo.

Aplica-se então a mesma regra aos dois blocos (*"não implementar sob recomendação — foi assim que o
MemPalace nasceu"*), com a assimetria justificada pelo **custo de errar**, não pela conveniência:

| | o que a recomendação diz | custo de errar |
|---|---|---|
| **(c) enterrar — esta story** | *"**(c) agora**"* + vira dependência declarada no `Epic 88 · §8` | **`git revert`, um comando.** Sem migration, sem dado, sem estado |
| **(b) redesenhar — `87-15`** | *"na Onda 4"*, sem *"agora"* | tabela + view + índice + escritor **em produção** |

⛔ **Portanto: esta story pode ser escrita, implementada e testada sob a recomendação. O MERGE fica
atrás de uma linha do Gabriel ratificando o `D2-(c)`.** É um sim/não de trinta segundos, e põe a
assinatura onde está a irreversibilidade — não onde está o trabalho.

---

## Desenho

### O que sai inteiro

| Arquivo / trecho | Linhas (`HEAD` `199a7a84`) | Por que sai |
|---|---|---|
| `packages/ai/src/memory/loader.ts` | arquivo (226 ln) | L2/L3 são **camada semântica antes do substrato** — o erro do MemPalace |
| `packages/ai/src/memory/loader.test.ts` | arquivo (**19** testes) | testa uma **fotocópia**; não protege nada (§4) |
| `packages/ai/src/memory/writer.ts` | arquivo | 🔴 lê `assistantMsg` (`writer.ts:157`) — é o CR-3 dentro do substrato |
| `packages/ai/src/memory/writer.test.ts` | arquivo (**11** testes) | acompanha o módulo (importa `./writer` de verdade — **cai por mérito**) |
| `packages/ai/src/flows/memory-extraction.ts` + `.test.ts` | arquivo (**24** testes) | módulo exportado, testado e **chamado por ninguém** depois desta PR |
| `pipeline.ts` — imports | 32, 37, 38 | `memory-extraction`, `memory/loader`, `memory/writer` |
| `pipeline.ts` — `12.5a` regex → `lead_facts` | 1641-1675 | escrita em tabela inexistente |
| `pipeline.ts` — `12.5c` `processConversationTurn` | 1709-1711 | a chamada Haiku + embeddings por turno |
| 5 a 6 fixtures `lead_facts: []` | ver AC2 | mocks de uma tabela que não existe |

**NÃO sai:** o `12.5b` (`atualizarResumoComLastro`, `pipeline.ts:1678-1707`) — é a `87-7`.

#### Sobre `memory-extraction.ts`: sai, e **não volta "restaurado do sha"**

A `87-15` planejava *"sai no A, volta no B restaurado do git pelo sha"*. **O @po rejeitou, e ele
está certo** — a §7 da `87-15` mede o módulo e reprova quase todos os predicados (95 de 182 fatos
são autotexto de lead form; 31 de 31 dias são relativos; `"17:30"` vira `"17h"`; *"São todos com 2
suítes"* vira preferência), e a AC14 de lá exige remedir **um a um** antes de adotar qualquer um.
**As duas coisas não se sustentam juntas: o que volta na `87-15` é uma régua NOVA que reaproveita, no
máximo, alguns `PATTERNS`.**

⇒ **O sha do commit anterior à remoção fica anotado na PR desta story como VALOR DE ARQUIVO —
referência de padrões no histórico do git, não plano de restauração.** Nenhuma AC de nenhuma das duas
stories depende dele (sha dentro de AC apodrece em rebase).

### O que colapsa — e é a linha mais importante desta story

**Hoje** (`pipeline.ts:679-694`, `HEAD`):

```ts
let memoryContext = ""
if (conversation?.lead_id) {
  try {
    const memCtx = await loadMemoryContext(supabase, conversation.lead_id, message, currentSummary)
    const parts = [memCtx.l1Snapshot, memCtx.l2TopicMemories, memCtx.l3DeepSearch].filter(Boolean)
    if (parts.length > 0) {
      memoryContext = `\n${parts.join("\n\n")}\n\nUse essas informacoes para personalizar o atendimento. Chame pelo nome, referencie o que ja conversaram.\n`
    }
  } catch {
    memoryContext = currentSummary
      ? `\nMEMORIA DO LEAD (informacoes de conversas anteriores):\n${currentSummary}\n\nUse essas…\n`
      : ""
  }
}
```

**Depois** (~6 linhas, **string do ramo vivo, byte a byte**):

```ts
// Memória do lead = `ai_summary`. O MemPalace (L1/L2/L3) foi enterrado na Story
// 87-16: `lead_facts`/`lead_memories` nunca existiram em produção e o ÚNICO
// efeito vivo do loader era este fallback (`loader.ts:196-198`), presente em
// 624 de 1.052 turnos (59,3 %) nos 30 dias anteriores ao deploy.
// A string abaixo é IDÊNTICA à que `loader.ts:198` + `pipeline.ts:685`
// produziam — inclusive o "(resumo)". Não é lugar de melhorar o cabeçalho.
let memoryContext = ""
if (conversation?.lead_id && currentSummary) {
  memoryContext = `\nMEMORIA DO LEAD (resumo):\n${currentSummary}\n\nUse essas informacoes para personalizar o atendimento. Chame pelo nome, referencie o que ja conversaram.\n`
}
```

**Equivalência conferida termo a termo** (é o que a AC1 tem de provar, não presumir):

| entrada | hoje | depois |
|---|---|---|
| `lead_id` + `ai_summary` não-vazio | `"\nMEMORIA DO LEAD (resumo):\n" + s + "\n\nUse essas…\n"` | **idêntico** |
| `lead_id` + `ai_summary` `null` / `""` | L1/L2/L3 todos `""` ⇒ `parts = []` ⇒ `memoryContext = ""` | `""` |
| sem `lead_id` | bloco não roda ⇒ `""` | `""` |

*(`currentSummary` só é atribuído dentro do `if (conversation?.lead_id)` de `:651-657`, então a
guarda dupla é redundante de propósito — legibilidade, não lógica.)*

**Sem cache invalidado:** `memoryContext` entra no `dynamicSuffix` (`pipeline.ts:737`), que é o bloco
**sem** `cache_control`. Os 8 blocos estáticos cacheáveis da `21.3` não são tocados.

### Os dois docstrings que precisam ser ATUALIZADOS, não apagados

`grep -rn "memory/loader\|memory/writer\|\.\./memory" packages/ --include="*.ts"` fora de
`packages/ai/src/memory/` devolve **4 sítios** — 2 imports (saem) e **2 comentários**:

| Sítio | O que diz hoje | O que fazer |
|---|---|---|
| `summary-grounding.ts:9` | *"(`memory/loader.ts`, fallback do `ai_summary`, ativo em 100 % dos turnos…)"* | **atualizar** para apontar o novo caminho direto em `pipeline.ts`, citando a `87-16` |
| `collected-data.ts:50` | *"`lead-memory.ts:79` (→ `ai_summary` → `memory/loader.ts` → prompt)"* | **atualizar** a cadeia; o destino continua o prompt, o intermediário deixa de existir |

**Deixá-los como estão cria a próxima *"crença que alguém acreditou existir"*** — e a ironia seria
completa, porque um deles é a contraprova que salvou esta story.

---

## O que esta story **NÃO** faz — por decisão escrita

1. **Não cria tabela, view, índice, migration ou coluna.** Zero SQL. É o que torna o rollback um
   `git revert`.
2. **Não muda o texto do prompt.** A string do `memoryContext` é preservada byte a byte (§2).
3. **Não toca o `12.5b`** (`atualizarResumoComLastro`, `87-7`) nem o `agenda_state` (`87-4`).
4. **Não reaplica nem conserta a migration `012`.** Vai como achado.
5. **Não cria o substrato novo** (`lead_fato`) — isso é a `87-15`, `Draft` sem data.
6. **Não conserta a régua de extração.** O extrator sai; quem escrever régua nova é a `87-15`,
   sob a AC14 de lá.

---

## Acceptance Criteria

> **Regra que vale para todas as ACs, e não é decorativa.** Uma AC só conta como satisfeita com:
> **(i) mutação com contagem esperada declarada ANTES**; **(ii) controle positivo**; **(iii)
> controle negativo**; **(iv) denominador declarado**. **Saída bruta do executor colada, nunca
> transcrita.** Baseline medida hoje: **190 arquivos / 2.450 testes**.

### 🔴 AC1 — o `ai_summary` continua entrando no prompt, e isso é provado nos dois sentidos

**É a AC que separa esta story da versão que foi reprovada. Sem ela, a subtração apaga a memória de
conversas anteriores em 59,3 % dos turnos.**

- **(i) controle positivo:** lead com `ai_summary` não-vazio ⇒ o `dynamicSuffix` enviado ao modelo
  **contém** `MEMORIA DO LEAD (resumo):` **seguido do texto do resumo**. Duas asserções separadas —
  **uma por `toContain`** (duas no mesmo já esconderam defeito nesta casa).
- **(ii) controle negativo:** lead com `ai_summary` `null` ⇒ o bloco **não aparece**, e **não
  aparece cabeçalho com corpo vazio**. Asserção sobre a ausência da string `MEMORIA DO LEAD`.
- **(iii) equivalência de string, byte a byte:** teste que compara a saída com o literal esperado
  **incluindo `(resumo)`** — não `(informacoes de conversas anteriores)`, que é o ramo `catch` que
  nunca rodou em produção (§2, §3).
- **(iv) mutação, com o número declarado ANTES:** remover a injeção ⇒ **quantos testes ficam
  vermelhos?** ⚠️ **Hoje a resposta medida é ZERO** — `0` testes contêm `"MEMORIA DO LEAD"`, `0`
  assertam sobre `memoryContext`, e **as 6 fixtures de pipeline gravam `ai_summary: null`, ou seja
  0 de 6 controles positivos**. **A AC exige que esse número passe de 0 para ≥ 3, e a PR cola a
  saída vermelha da mutação.** Se continuar 0, a AC não mede nada e está reprovada.
- **Denominador para a PR:** **624 de 1.052 turnos (59,3 %)** e **124 de 195 leads ativos (63,6 %)**
  nos 30 dias anteriores ao deploy.
  🔴 **`[@po 16/08]` A definição de "lead ativo" tem de vir junto, porque ela muda o número.**
  Reproduzi os dois: **`124 / 195` (63,6 %)** vale para *lead com ao menos uma mensagem
  `role='user'` em 30 d*; trocando por *qualquer mensagem* (inclui `broker`), dá **`135 / 357`
  (37,8 %)**. **Escrever a definição ao lado do número na PR** — denominador sem régua é o defeito
  que esta story existe para não repetir.
- **Fixture obrigatória:** pelo menos uma fixture de pipeline passa a ter `ai_summary` **preenchido**
  (hoje são 6 de 6 com `null`) — sem isso não existe controle positivo possível.

### AC2 — os caminhos mortos somem do código, e o denominador é declarado nas duas árvores

`grep -rn "lead_facts\|lead_memories\|match_lead_memory" packages/ --include="*.ts" --include="*.tsx"`
⇒ **0**.

**Denominadores medidos hoje, e eles divergem — as duas contagens ficam registradas com o método:**

```
contra HEAD 199a7a84 (árvore limpa)      : 24 ocorrências em  9 arquivos
nesta árvore de trabalho (suja)          : 25 ocorrências em 10 arquivos
diferença: packages/ai/src/chat/pipeline-collected-data.test.ts (fixture da 87-11, ainda não commitada)
```

🔴 **`[@po 16/08]` Falta um sítio na tabela "O que sai", e é o único que sobrevive à remoção
inteira.** Executei a subtração completa (T1 + T2) numa cópia e rodei o `grep` da AC2: **restou
exatamente uma ocorrência em código de produção** —

```
packages/ai/src/chat/pipeline.ts:1635
  // 12.5 Memory system — regex extraction + lead_facts + Haiku batch (MemPalace-inspired)
```

É o **comentário de cabeçalho da seção 12.5**, que não é `12.5a` nem `12.5c` e por isso não está em
nenhuma linha da tabela. **A AC2 é uma régua de `grep`: sem reescrever esse comentário, ela dá 1 e
não 0.** Reescrever (não apagar) para descrever o que a seção 12.5 passa a ser: só o `12.5b`.

⇒ **O @dev RE-MEDE no momento de implementar** e declara qual das duas populações vale, porque
depende de a `87-11` ter mergeado antes. As fixtures `lead_facts: []` (`nicole-enabled`,
`pipeline-agenda-state`, `pipeline-scheduling`, `pipeline-corretor-no-historico`,
`pipeline-historico-cauda` **+ `pipeline-collected-data` se existir**) **saem junto** — são mocks de
uma tabela que não existe, e deixá-las mantém a crença errada em seis arquivos.

### AC3 — a suíte muda pelo número previsto, e a conta é reconciliada nas duas direções

**Saem 54 testes**, contados **pelo executor**, saída bruta colada por mim hoje:

```
packages/ai/src/memory/loader.test.ts / writer.test.ts / flows/memory-extraction.test.ts
 Test Files  3 passed (3)
      Tests  54 passed (54)
```

⚠️ **`grep -c "it("` daria 55 e erraria** — um `it(...)` de `loader.test.ts` mora dentro de um `for`
de 10 padrões. **Contar com o executor, sempre.**

**Entram** os testes novos das AC1, AC5 e AC6. **A AC exige a conta escrita antes de rodar:**

```
2.450 − 54 (removidos) + N (novos, declarados ANTES) = <número previsto>
  190 −  3 (arquivos)  + M (arquivos novos)          = <número previsto>
```

**Se o real divergir do previsto, a AC falha** e o @dev explica antes de seguir — divergência aqui
significa que algum teste fora do mapa dependia destes módulos. Nenhum dos 54 está entre os
`6 expected fail`: os três arquivos passam 100 % hoje.

✅ **`[@po 16/08]` A metade "removidos" da conta já está verificada — eu executei a subtração
inteira** (imports 32/37/38, colapso do `memoryContext` com a string viva, `12.5a`, `12.5c`, e
`rm -rf packages/ai/src/memory` + `memory-extraction.{ts,test.ts}`) e rodei a suíte. Saída bruta:

```
 Test Files  187 passed (187)
      Tests  2390 passed | 6 expected fail (2396)
```

**`190 − 3 = 187` e `2.450 − 54 = 2.396`, ao número, e ZERO vermelhos.** Duas consequências:
**(a)** o `N`/`M` do @dev é a única incógnita da reconciliação — o lado subtrativo está fechado;
**(b)** **a subtração inteira desta story é invisível para a suíte de hoje**, não só a injeção do
`ai_summary`. É a AC1(iv) generalizada, e reforça que a AC1 é a única coisa que separa esta story
de uma regressão silenciosa.

### AC4 — a mutação que documenta que a suíte NÃO protegia isto

Em branch descartável: deletar `loader.ts` mantendo `loader.test.ts` e rodar **só esse arquivo**.
**Resultado esperado: 19 verdes** — porque o teste não importa o módulo. Colar a saída bruta.
*(O @po já executou e confirmou; o @dev reproduz, não copia.)* **Se algum dos 19 ficar vermelho sem
o módulo, a §4 está errada e a story precisa ser corrigida antes de prosseguir.**

### AC5 — fica um teste que prova a AUSÊNCIA, e ele nasce vermelho uma vez

Novo teste (sugestão: `packages/ai/src/chat/pipeline-sem-mempalace.test.ts`) que falha se
`pipeline.ts` voltar a referenciar `lead_facts` / `lead_memories` / `match_lead_memory` / `../memory`.
**Controle positivo obrigatório:** reintroduzir a string num arquivo temporário e **colar a saída
vermelha**. Um teste de ausência que nunca foi visto vermelho não vale nada.

🔴 **`[@po 16/08]` A AC6 REPROVA A AC5 — e a story só registrou a armadilha para o scanner da AC6.**
A implementação natural desta AC5 lê o **fonte** como texto (`fs.readFileSync(".../pipeline.ts")`) e
**não importa módulo nenhum do projeto** — `"./pipeline.ts"` dentro de um `readFileSync` não é
`from`/`import()`/`require()`/`vi.mock()`, que é exatamente o que a catraca da AC6 procura. Escrevi
esse arquivo e rodei o scanner da AC6 contra a árvore:

```
populacao: 191
ZERO-IMPORT (catraca AC6 flagraria): 2
  -> packages/ai/src/chat/__po_probe_ac5.test.ts     ← a AC5 escrita do jeito óbvio
  -> packages/ai/src/memory/loader.test.ts
```

**As duas ACs estão na mesma PR e a AC6 derruba a AC5.** ⇒ **O helper de leitura de fonte da AC5
mora num módulo real e o teste o importa** — mesmíssimo remédio da AC6, e **pela mesma razão: nunca
por auto-exceção na lista de ignore.**

### AC6 — catraca permanente: nenhum `*.test.ts` sem import de módulo do projeto

*(Entra no lugar da varredura que o @po executou e fechou com `n = 1`. Uma varredura mede uma vez; a
catraca mede para sempre, custa XS e cabe na mesma PR da AC5.)*

Teste que varre os `*.test.ts` e falha se algum não referenciar `./`, `../`, `@web/` ou `@trifold/`
(cobrindo `import … from`, `import()` dinâmico, `require(...)` e `vi.mock(...)`).

- **População derivada dos globs do `vitest.config.ts`** (`packages/{ai,shared,web}/src/**/*.test.ts`),
  **não** de um `find` escrito à mão — foi assim que as duas primeiras passadas do @po erraram.
  Conferido por mim: essa população dá exatamente **190**, o mesmo número de arquivos da suíte.
- **Denominador declarado:** **hoje 1 de 190** (o `loader.test.ts`); **depois desta PR, 0 de 189**.
- **Controle positivo obrigatório:** criar um `.test.ts` temporário sem import de módulo do projeto
  e **colar a saída vermelha**.
  🔴 **`[@po 16/08]` Mas NÃO como estava escrito.** *"um `.test.ts` só com `import { it } from
  "vitest"`"* fica vermelho **com ou sem a catraca** — o vitest recusa arquivo sem teste. Rodei:
  ```
   ❯ packages/ai/src/__po_probe_tmp.test.ts (0 test)
   FAIL  Error: No test suite found in file .../__po_probe_tmp.test.ts
   Test Files  1 failed (1)   |   Tests  no tests
  ```
  Isso é **controle positivo engolido pela pré-condição**: o vermelho não vem do que se quer medir.
  ⇒ **A sonda tem de conter um `it(...)` trivial que PASSA** (`it("noop", () => expect(1).toBe(1))`)
  e **nenhum** import de módulo do projeto. Assim o único vermelho possível é o da catraca, e a
  saída colada prova a catraca — não o coletor do vitest.
- 🔴 **Armadilha: a catraca reprova a si mesma.** Se o scanner morar inteiro dentro do próprio
  arquivo de teste, ele não importa módulo nenhum do projeto e **se auto-flagra**. **Resolver
  colocando o scanner num módulo real e importando-o** — nunca por auto-exceção na lista de ignore,
  que é a semente do próximo `loader.test.ts`. **`[@po 16/08]` Confirmado que o remédio funciona —
  e que ele vale também para a AC5, que a story não cobria (ver AC5).**

### AC7 — efeito medido em produção, com janela, `n` e atribuição honesta

Nas **72 h** após o deploy, o @qa publica:

- **(a)** 🔴 **`[@po 16/08]` — a régua da v0.1 estava com o numerador errado e foi trocada.**
  ```sql
  select count(*) from messages
   where role='assistant'
     and (metadata is null or metadata = '{}'::jsonb)   -- ← só o saveMessages do pipeline
     and created_at between <deploy> and <deploy+72h>
  ```
  ⇒ **é o número de execuções de `processConversationTurn` evitadas** (1 por resposta do pipeline).
  Baseline: **476 / 30 dias**. **`role='assistant'` puro dá 593 e superestima em 24,6 %**, porque
  inclui 83 transições escritas por **humano** (`send-message/route.ts:220`), 29 de mídia
  (`send-library-media.ts:548`) e 5 de relacionamento (`route-inbound.ts:178`) — partição medida
  na §1.
  **O @qa publica os DOIS números** (593 bruto e 476 filtrado) na janela, com o filtro escrito, para
  que a próxima story não herde o numerador errado.
  🔴 **Não escrever *"chamadas Haiku evitadas"* sem qualificar** — ver (c).
- **(b)** p95 de `whatsapp_async_done` **antes** (7 dias pré-deploy) e **depois** (72 h), **com o `n`
  de cada leitura**. Baseline conhecido: **12.469 ms, n = 442** (`D88-3`).
- **(c)** 🔴 **Atribuição declarada como parcial, por escrito, com os consumidores que ficam
  nomeados:** `atualizarResumoComLastro` (gate `msgCount % 5 === 0`, `pipeline.ts:1684` — **não é
  por turno**) e `haiku-enrichment` (cron `enrich-leads`) continuam chamando Haiku; o RAG continua
  chamando OpenAI. **A queda no console da Anthropic NÃO é atribuível só a esta story.** Publicar
  ordem de grandeza, nunca economia exata — número exato aqui seria invenção (Artigo IV).
  *(A estimativa de ~95 chamadas/30 d remanescentes do `12.5b` na §5 é **derivação aritmética**, não
  medição. O @qa mede ou declara que não é medível — não copia.)*
- **Amostra sem efeito visível é INCONCLUSIVA, não é "sem efeito".**

### AC8 — nenhum módulo fica órfão, e nenhum docstring fica mentindo

- **(a)** Após a remoção, todo **módulo de produção** em `packages/ai/src/` tem ao menos um call site
  fora de teste, **ou** está removido. Lista na PR. *(O diretório `packages/ai/src/memory/` deixa de
  existir.)*
  🔴 **`[@po 16/08]` "todo arquivo" fazia a AC nascer REPROVADA, por dois arquivos que não são
  desta story.** Varri os **45** módulos não-teste de `packages/ai/src/` hoje: **2 não têm call site
  fora de teste** —
  ```
  packages/ai/src/chat/__fixtures__/fake-supabase.ts
  packages/ai/src/chat/__fixtures__/properties-producao.ts
  ```
  São helpers **de teste por desenho** (o `fake-supabase.ts` é o da `75-279` que a própria
  §"Abordagem de teste" manda usar). ⇒ **`__fixtures__/` e `__mocks__/` ficam explicitamente fora da
  população da AC8-a.** Sem essa exceção escrita, o @dev ou remove fixture que a AC1 precisa, ou
  marca a AC como satisfeita mentindo. **Denominador declarado: 43 módulos de produção, 0 órfãos
  esperados depois da PR.**
- **(b)** Os **2 docstrings** de `summary-grounding.ts:9` e `collected-data.ts:50` são
  **ATUALIZADOS** (não apagados) para descrever o caminho novo, citando a `87-16`. `grep -rn
  "memory/loader\|memory/writer" packages/ --include="*.ts"` ⇒ **0**, e os dois comentários
  continuam existindo com o texto corrigido.

---

## Tarefas

- [ ] **T1** (@dev) — remover `memory/loader.ts`, `memory/loader.test.ts`, `memory/writer.ts`,
      `memory/writer.test.ts`, `flows/memory-extraction.ts`, `flows/memory-extraction.test.ts`.
      **Anotar o sha do commit anterior na descrição da PR** — valor de arquivo, **não** plano de
      restauração (nenhuma AC depende dele).
- [ ] **T2** (@dev) — 🔴 **colapsar** `pipeline.ts:679-694` no bloco de ~6 linhas da §"Desenho",
      **com a string `MEMORIA DO LEAD (resumo):` byte a byte**. Remover imports (32, 37, 38),
      `12.5a` (**1641-1676** — `[@po 16/08]` o fim é o `}` do `catch` em `:1676`, não `:1675`;
      cortar em 1675 deixa chave órfã) e `12.5c` (1709-1711). **NÃO tocar o `12.5b`** (1678-1707).
      **`[@po 16/08]` Reescrever também o comentário de cabeçalho `pipeline.ts:1635`** — é o único
      `lead_facts` que sobrevive à remoção e ele reprova a AC2.
- [ ] **T3** (@dev) — remover as fixtures `lead_facts: []` (AC2), **re-medindo o denominador** (9 ou
      10 arquivos, depende da `87-11`).
- [ ] **T4** (@dev) — os testes da **AC1**: controle positivo (fixture com `ai_summary` preenchido —
      hoje são 0 de 6), controle negativo, equivalência de string, e a mutação com o número
      declarado antes. **Este é o item que o @po vai reler primeiro.**
- [ ] **T5** (@dev) — teste de ausência (AC5), colado **vermelho** uma vez, **com o leitor de fonte
      num módulo importável** — senão a T6 o reprova (`[@po 16/08]`, AC5).
- [ ] **T6** (@dev) — catraca de zero-import (AC6), com o scanner **em módulo importável** e o
      controle positivo colado vermelho — **a sonda tem `it(...)` que passa** (`[@po 16/08]`, AC6).
- [ ] **T7** (@dev) — atualizar os 2 docstrings (AC8-b).
- [ ] **T8** (@dev) — executar a mutação da AC4 em branch descartável, colar a saída, **descartar a
      branch**.
- [ ] **T9** (@qa) — publicar (a), (b) e (c) da AC7 nas 72 h seguintes ao deploy, com janelas e `n`.

---

## Dev Notes

### Mapa de código

*(Linhas contra `HEAD` `199a7a84`, **árvore limpa**. ⚠️ A árvore de trabalho de hoje está suja com
`87-5 B` + `87-11` e **desloca `pipeline.ts` em +2** — conferido: `extractCollectedData` está em
`:1276` no `HEAD` e `:1278` na árvore. **Conferir antes de editar por número de linha.**)*

| Arquivo | Linha (`HEAD`) | O que é |
|---|---|---|
| `packages/ai/src/chat/pipeline.ts` | 32, 37, 38 | imports de `memory-extraction`, `memory/loader`, `memory/writer` |
| | 651-657 | onde `currentSummary` é carregado (`leads.ai_summary`, `.single()`) |
| | **679-694** | 🔴 o bloco `memoryContext` — **o que colapsa** |
| | 737 | `dynamicSuffix` — bloco **sem** `cache_control` |
| | **1635** | 🔴 `// 12.5 Memory system — … lead_facts …` — cabeçalho da seção, **REESCREVER** (`[@po]`) |
| | **1641-1676** | `12.5a` regex → `lead_facts` (**sai**) — o `}` do `catch` está em `:1676` (`[@po]`) |
| | 1678-1707 | `12.5b` `atualizarResumoComLastro` (**87-7 — NÃO TOCAR**) |
| | **1685** | `const shouldRunHaiku = (msgCount ?? 0) % 5 === 0` — o gate que corrige a AC7(c) (`[@po]`: `:1685`, não `:1684`) |
| | 1709-1711 | `12.5c` `processConversationTurn` (**sai**) |
| `packages/ai/src/memory/loader.ts` | 62, 114, 161 | os três `if (error || …) return ""` |
| | **196-198** | 🔴 **o `if (!l1Snapshot && aiSummaryFallback)` — o caminho vivo inteiro** |
| `packages/ai/src/memory/writer.ts` | 127-131 | `generateEmbedding` **antes** do `insert` que falha |
| | 157 | `processConversationTurn(…, userMsg, assistantMsg)` — a fala da Nicole entrando |
| `packages/ai/src/flows/summary-grounding.ts` | 9 | 🔴 docstring a **atualizar** (é a contraprova da §2) |
| `packages/ai/src/prompts/collected-data.ts` | 50 | docstring a **atualizar** |
| `packages/ai/src/flows/lead-memory.ts` | 132 | `atualizarResumoComLastro` — **fica** |
| `vitest.config.ts` | 12-16 | os globs que definem a população dos 190 arquivos (AC6) |

### Abordagem de teste

| Camada | Ferramenta | O que prova |
|---|---|---|
| **Unidade / integração de pipeline** | `vitest run` (**não** Jest) + `__fixtures__/fake-supabase.ts` (da `75-279` — **filtros reais**) | AC1 (positivo, negativo, equivalência de string, mutação), AC5 |
| **Estático** | scanner em módulo importável | AC6 (catraca zero-import) |
| **Mutação em branch descartável** | `vitest run <arquivo>` | AC4 |
| **Produção** | Management API, somente `SELECT` + `system_events` | AC7, 72 h pós-deploy (@qa) |
| **Entrada do modelo** | harness **`88-2`** — **não existe** | não é necessário aqui: a AC1 assere sobre o `dynamicSuffix` montado, que é observável sem harness |

### Armadilhas

1. 🔴 **O cabeçalho do prompt tem duas versões no código de hoje e só uma roda.** `(resumo)` é a
   viva; `(informacoes de conversas anteriores)` é o ramo `catch`, que **nunca disparou** (§3).
   **Preservar `(resumo)`.**
2. 🔴 **`supabase-js` não lança.** `try/catch` em torno de `.insert()`/`.select()` é decorativo.
   É por isso que o `catch` do `memoryContext` some junto: ele nunca teve função.
3. 🔴 **A catraca da AC6 reprova a si mesma** se o scanner morar dentro do arquivo de teste.
4. **Números de linha de `pipeline.ts` deslocam +2 nesta árvore de trabalho.** Conferir por conteúdo.
5. **`.single()` × `.maybeSingle()`** — regra da casa desde a `21.1`. O `select` de `leads` em
   `:653` usa `.single()` e **não é escopo desta story**; não "consertar de carona".
6. **Mock que não filtra não conta.** Se o teste usa mock de Supabase, tem de usar o
   `fake-supabase.ts` que aplica os filtros de verdade.
7. **Uma asserção por `toContain`.** Duas no mesmo já esconderam defeito aqui.
8. **Contar teste com o executor, nunca com `grep -c "it("`** — o erro de 55 × 54 (§AC3).

### Fronteiras com outras stories

| Story | Fronteira |
|---|---|
| **87-15** (`Draft`, sem data) | **Dona do substrato novo (`lead_fato`, migration 232).** Esta story **não** cria substrato. A régua nova de extração é de lá, sob a AC14 de lá |
| **87-7** (`Done`) | Dona do `12.5b` e do `ai_summary`. Esta story **preserva** a injeção e **não toca** a gravação |
| **87-4** (`Done`) | Dona do `agenda_state`. Não tocado |
| **87-5 / 87-8** | Donas do histórico. Esta remove um **consumidor** do contexto, não o histórico |
| **87-11** (`Draft`, não commitada) | 🔴 Adiciona a 6ª fixture `lead_facts: []`. **Muda o denominador da AC2** conforme a ordem de merge |
| **87-12** (`Draft`) | Reserva a migration **231**. Esta story **não tem migration** — sem colisão |
| **Epic 88 · §8** | Esta é a story da **6ª de 8 linhas**, *"habilitante — latência"*. **Financia, não destrava** |

---

## Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| **1** | 🔴 **A remoção leva junto o `ai_summary` e a Nicole perde a memória de conversas anteriores** *(era `Prob. Nenhuma` na `87-15`; **estava factualmente invertido**)* | **Alta se a §2 não for respeitada** | **Alto, visível ao cliente** | O `loader.ts:196` faz do `return ""` da tabela morta o **gatilho** da injeção. **624 de 1.052 turnos (59,3 %)**, **124 de 195 leads ativos (63,6 %)**. Contraprova no repo: `summary-grounding.ts:9` (`87-7` mergeada). **Mitigação: T2 colapsa em vez de remover + AC1 com positivo, negativo, equivalência de string e mutação** |
| **2** | O cabeçalho do prompt muda de `(resumo)` para `(informacoes de conversas anteriores)` por seguir o `catch` ao pé da letra | **Média** | Baixo, mas é diff de prompt em 59,3 % dos turnos numa story de subtração | AC1(iii): equivalência **byte a byte**, com o literal esperado no teste |
| **3** | A suíte fica verde e ninguém percebe o Risco 1 | **Alta hoje** | **Alto** | **Medido: 0 testes contêm `"MEMORIA DO LEAD"`, 0 assertam `memoryContext`, 0 de 6 fixtures têm `ai_summary` preenchido.** AC1(iv) exige que a mutação passe de **0** para **≥ 3** vermelhos. **`[@po 16/08]`: rodei a subtração INTEIRA (T1+T2) e a suíte deu `187 / 2396`, zero vermelhos** — não é só a injeção que é invisível, é a story toda |
| **8** | 🔴 **`[@po 16/08]` A AC6 reprova a AC5 na mesma PR** e o @dev "resolve" pondo a AC5 no ignore da catraca | **Alta sem a correção** | Médio — nasce o próximo `loader.test.ts` dentro da PR que o enterra | AC5 corrigida: o leitor de fonte vai para módulo importável, **nunca** auto-exceção. Reproduzido: scanner acusa **2 de 191** com a AC5 escrita do jeito óbvio |
| **9** | 🔴 **`[@po 16/08]` O @qa publica 593 como "chamadas evitadas"** e o número entra no orçamento do `D88-3` inflado em 24,6 % | **Alta sem a correção** | Médio | AC7(a) reescrita com o filtro `metadata = '{}'` e baseline **476**; partição dos 117 não-pipeline medida na §1, com os três escritores nomeados |
| **4** | Algum teste fora do mapa depende dos módulos removidos | Baixa | Médio | AC3 declara a conta (`−54 + N`) **antes** de rodar. Divergência bloqueia |
| **5** | A queda de latência não aparece na medição | **Média** | Baixo | AC7(c) declara atribuição parcial com os consumidores nomeados. **Amostra sem efeito é inconclusiva, não "sem efeito"** |
| **6** | `D2-(c)` nunca é ratificado e a PR fica parada | Média | Baixo | O trabalho não é perdido: `git revert`-able, sem migration. E o custo de atraso está quantificado (§6) para sustentar a cobrança |
| **7** | Alguém "melhora" o cabeçalho, o `.single()` ou a régua de carona na PR | Média | Médio | §"O que esta story NÃO faz", itens 2 e 6; armadilha 5 |

---

## Critério de rollback — escrito ANTES do deploy (`D7`)

**Gatilho:** qualquer variação de comportamento da Nicole nas 24 h seguintes que não seja explicável
por outra story da fila — **em especial, qualquer relato de que ela "esqueceu" conversa anterior**,
que é a assinatura exata do Risco 1.
**Ação:** `git revert` da PR. **Não há migration, não há dado, não há estado.** Reversível em um
comando — e essa é a razão de ela poder ir primeiro.
**Dono da decisão:** @qa, com o Gabriel informado (mesmo arranjo do `D7`).

---

## Definition of Done

- [ ] AC1–AC8 satisfeitas, com as saídas brutas coladas (incluindo as três mutações: AC1, AC4, AC5/AC6)
- [ ] 🔴 A string `MEMORIA DO LEAD (resumo):` preservada byte a byte, provada por teste
- [ ] Nenhum `if (error) return ""` novo introduzido
- [ ] Os 2 docstrings atualizados (não apagados)
- [ ] `pnpm type-check` e `pnpm lint` limpos; `vitest run` com o delta declarado e reconciliado
- [ ] ⛔ **Ratificação escrita do `D2-(c)` pelo Gabriel antes do MERGE** (implementar e testar podem
      seguir antes)
- [ ] `docs/stories/epics/epic-87-…` e `epic-88-…` atualizados pelo **@pm** (pedidos abaixo) — **o
      @sm não edita corpo de epic**
- [x] Story validada pelo **@po** (`*validate-story-draft`) antes da implementação — **GO condicional
      em 2026-08-16**, `docs/qa/po-validation-87-16.md`. Correções `[@po 16/08]` aplicadas no corpo

---

## Achados (para o backlog / @pm — **NÃO** entram nesta story)

1. 🔴 **`supabase_migrations.schema_migrations` tem a `012` como aplicada e os objetos não existem.**
   Esta story não conserta. Enquanto o registro estiver lá, um `supabase db push` **pula** a `012` e
   a divergência sobrevive. **Vale auditar se há outras** — a auditoria de paridade do epic aponta
   que faltavam `lead_facts`, `lead_memories` e a view `meta_campaign_roas`, e **esta última continua
   sem dono**.
2. 🔴 **`extractCollectedData` é fail-open em metade dos predicados.** `pipeline.ts:1298` (árvore
   suja; `:1296` no `HEAD`) passa **a resposta inteira da Nicole** com `origem: "assistant"`, **por
   desenho documentado**. Só o ramo de agenda tem guarda (`qualification.ts:321`,
   `if (opts?.origem === "lead")`, fechado pela `87-4`); **nome, email, quartos, vaga, andar e vista
   (`:158-260`) não têm guarda nenhuma e rodam sobre a fala da Nicole hoje**. O achado **não** é
   *"o nome do parâmetro convida ao erro"* — é *"metade da função nunca teve guarda de origem"*.
   Superfície de `collected_data`, vizinho da `87-11`, **fora desta story e da `87-15`**.
3. **`generateEmbedding` cai em vetor-hash silencioso sem `OPENAI_API_KEY`** (`embeddings.ts:18-25`).
   A variante `Strict` lança, mas só o caminho de gravação da `knowledge_base` a usa. Todo consumidor
   de **busca** pode estar comparando hash com embedding real sem saber.
4. **`loader.test.ts` é o exemplar mais puro de *"teste que testa uma fotocópia"*** desta casa: 19
   testes, zero imports do módulo, 3 funções reimplementadas dentro do arquivo. Vale como caso na
   skill `agente-atendimento-confiavel` (`references/regras-de-teste.md`) — **junto com o fato de
   que a varredura por essa classe deu `1 de 190`, ou seja, é raro e já tem dono.**
5. **`memory-extraction.ts:139` descarta os minutos** (`` `${timeMatch[1]}h` ``: `"3ª feira às
   17:30"` → `"17h"`). O módulo sai nesta story; **o achado é para quem escrever a régua nova na
   `87-15`** — 17h00 **cabe** no expediente e 17h30 **não**, então o erro de captura inverteria o
   veredito do `evaluateSlot`. É o turno do Ronaldo (10/08, `CR-7`), por outra porta.
6. **`messages` não tem `org_id`** — todo join de proveniência passa por `conversations`. Registrar
   para o Epic 86 (multi-tenant): é um `JOIN` a mais em caminho quente.
7. 🔴 **`[@po 16/08]` `role='assistant'` é um papel sobrecarregado com SETE escritores, e não há
   discriminador de primeira classe.** Só se separa o pipeline do resto por **ausência de
   `metadata`** — uma convenção, não um contrato. Hoje: 476 pipeline, 83 humano
   (`is_transition`), 29 mídia, 5 relacionamento, em 30 d. A `87-5` já normaliza o caso do corretor
   **na leitura** e registra no `docs/backlog.md` que *"o conserto de origem é decisão de modelo de
   dados"*. **Este achado dá denominador àquele item**: qualquer métrica futura sobre "turnos da
   Nicole" que use `role='assistant'` cru erra por ~20 %. Vizinho do Epic 86 (achado 6), fora desta
   story.

---

## ⏳ Pedidos ao @pm e ao @po — o @sm não edita o corpo do epic

**Ao @pm** (`epic-87-nicole-confiabilidade-contexto.md` e `epic-88-nicole-tool-use-agenda.md`):

1. **`stories_planned` — nova entrada** (regra *"toda story nova entra no mapa no mesmo commit em
   que nasce"*):
   ```yaml
   - item: 'W4-4 (parte) — D2-(c) "enterrar o código morto". Recortada da 87-15 por
       decisão do @po (16/08). NÃO herda a dep W3-1 do W4-4. Merge atrás da
       ratificação do D2-(c) pelo Gabriel'
     story: docs/stories/87-16-enterrar-o-mempalace-sem-levar-a-memoria-da-nicole-junto.story.md
     status: Draft
     prioridade: P1 / Onda 1
   ```
2. 🔴 **`W4-4` declara deps `D2, W3-1`.** O enterro **não** depende do `W3-1` (validador
   pós-resposta). Ao apontar esta story, **cortar essa herança**; a dep `W3-1` continua valendo para
   o bloco B (`87-15`).
3. 🔴 **`Epic 88 · §8`, linha "MemPalace desligado por flag"** — apontar para a `87-16`, com a
   redação corrigida: **é a 6ª de 8 linhas, a única sem story, e está declarada como "habilitante —
   latência", NÃO como bloqueante.** *(A `87-15` v0.1 falava em "nona linha"; não existe.)*
4. 🔴 **O `W0-2` descreve o defeito como *"vira string vazia"*.** Está incompleto **por dois
   motivos**: (a) os três `catch` nunca dispararam porque `supabase-js` não lança (§3); (b) **a
   string vazia não é o fim do caminho — é o gatilho do `ai_summary`** (§2). Isso muda o que o `W0-2`
   precisa instrumentar.
5. ⚠️ **`§10 · Notas para o @sm` diz que o maior prefixo de migration é `215`.** Conferido hoje
   contra `origin/main`: é **`230`**. É a segunda story seguida a corrigir isso. **Sugestão que não
   apodrece:** trocar o número por *"conferir por arquivo em `supabase/migrations/` contra
   `origin/main`, nunca por `max(version)`"*.
6. ⚠️ **Pendência antiga, aberta desde 10/08 e herdada:** `87-0` consta `Ready` no mapa e está
   **mergeada em produção** (PR #377).
7. 🟢 **Boa notícia com evidência, e ela derruba um bloqueio:** o `W0-5` **voltou a medir**. O @sm
   trouxe a contagem e o @po trouxe a distribuição por dia — **7 dias consecutivos, exatamente 1
   execução por dia, zero falhas, zero lacunas** (10/08 a 16/08, `NICOLE_LASTRO_DIARIO`). Não são
   "7 eventos": é um cron **diário e estável**. O epic ainda registra o contrário em **cinco** lugares
   (`:56`, `:448`, `:518`, `:1230`, `:1326`). Consequências: **(a)** o bloco ⛔ da Onda 0 está
   **vencido**; **(b)** a recalibração **B6** deixou de estar bloqueada; **(c)** registrar **qual**
   hipótese caiu (*"acesso ao painel da Vercel — Gabriel"* aconteceu, ou deixou de ser necessário).
   **Um roadmap que exibe um instrumento como quebrado depois de ele voltar custa o mesmo que o
   inverso** — foi a crítica que o próprio epic fez ao `W0-5` em 10/08, agora com o sinal trocado.

**Ao @po:**

8. **A AC1 é a única conferência realmente nova desta story** — o resto do parecer de 16/08 já está
   verificado e vale. Sugestão de via rápida: reler a AC1 (positivo, negativo, equivalência de
   string, mutação de 0 → ≥3) e a correção da AC7(c) (gate `% 5`, §5).
9. ⛔ **A ratificação do `D2-(c)` pelo Gabriel continua sendo condição de MERGE**, não de escrita.
   Registrado no cabeçalho, na DoD e na §"assimetria".

---

## Referências

- `docs/qa/po-validation-87-15.md` — **o parecer que origina este recorte**: §1 (o bloqueante), §3
  (colocação e assimetria), §5.1 (aritmética do Epic 88), §5.2 (varredura `n=1` → catraca), §5.4
  (`memory-extraction.ts` não volta do sha), §8 (caminho para o GO, itens 1–5)
- `docs/stories/87-15-fato-do-lead-so-existe-com-a-mensagem-que-o-originou.story.md` — **o bloco B**,
  `Draft` sem data. Ali moram o substrato, a régua nova e a migration `232`
- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **CR-2** (MemPalace código
  vivo/banco morto), **D2** (§8, as três opções), **W0-2**, **W4-4**, §7 (regra de corte da Onda 1),
  **D7** (rollback com dono)
- `docs/stories/epics/epic-88-nicole-tool-use-agenda.md` **§8** — a tabela de 8 linhas; a **6ª** é
  esta story, *"habilitante — latência"*
- `packages/ai/src/flows/summary-grounding.ts:9` — **a contraprova**, escrita pela `87-7` mergeada
- `packages/ai/src/memory/loader.ts:196-198` — **o `if` que é a story inteira**
- `~/.claude/skills/agente-atendimento-confiavel/SKILL.md` — ordem de correção, os 4 padrões de
  falha, as 3 regras de teste inegociáveis

**CodeRabbit Integration:** **Disabled** (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml` — conferido em 2026-08-16).

---

## Dev Agent Record

*(a preencher pelo @dev)*

## QA Results

*(a preencher pelo @qa)*

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-16 | 0.2 | **Validação @po (`*validate-story-draft`) — VEREDITO: 🟢 GO condicional. `Draft` → `Ready`.** Parecer em `docs/qa/po-validation-87-16.md`. ⛔ **A condição não é de escrita nem de implementação: é o MERGE atrás da ratificação escrita do `D2-(c)` pelo Gabriel** — mantida no cabeçalho, na DoD e na §"assimetria", conferida contra `epic-87:1108` (*"Recomendação: (c) agora"*, **sem** o selo *"✅ FECHADA"* que o `D3` tem em `:1114`). **Os dois pontos que o @sm pediu para eu confirmar, confirmados executando:** **(1)** os dois ramos **não** produzem a mesma string — rodei os dois literais: vivo/proposto = **145 chars**, `catch` = **174**, `vivo === proposto` ⇒ `true`, `vivo === catch` ⇒ `false`. **A correção dele sobre a minha §1 está certa e eu a aceito**: colapsar no ramo do `catch` embarcaria diff de prompt. *(Precisão minha: a diferença é **+29** chars, não +30 — `(informacoes de conversas anteriores)` tem 37 e `(resumo)` tem 8. E há **TRÊS** cabeçalhos no código, não dois: `loader.ts:77` `(fatos ativos):` também nunca rodou.)* **(2)** a mutação da AC1 dá **ZERO** hoje — reproduzido: `0` testes com `"MEMORIA DO LEAD"`, `0` com `memoryContext`, `0 de 6` fixtures com `ai_summary` preenchido, e **apaguei a injeção e a suíte deu `190 / 2450`, tudo verde**. **Fui além e executei a subtração INTEIRA (T1+T2, incluindo `rm -rf packages/ai/src/memory`): `187 passed (187)` / `2390 passed | 6 expected fail (2396)`, ZERO vermelhos** — `190−3` e `2.450−54` ao número, o que fecha o lado subtrativo da AC3 antes de o @dev começar. 🔴 **TRÊS defeitos novos que eu medi e corrigi no corpo (marcados `[@po 16/08]`):** **(a) AC7(a) — `role='assistant'` NÃO é o número de execuções do pipeline.** São **476**, não 593: medi a partição em produção e **117 (19,7 %) vêm de outros escritores** — **83** transições escritas por **humano** (`send-message/route.ts:220`, que a própria `87-5` documenta como *"127 em 60 dias"*), **29** de mídia (`send-library-media.ts:548`), **5** de relacionamento (`route-inbound.ts:178`). O discriminador é `metadata = '{}'` (só o `saveMessages` grava sem metadata). **A story corrigia o "exatamente" da `87-15` e recolocava a mesma palavra num numerador ainda errado, inflando o custo declarado em 24,6 % em quatro lugares.** **(b) A AC6 REPROVA A AC5 na mesma PR** — escrevi a AC5 do jeito óbvio (`fs.readFileSync` do fonte, sem import) e rodei o scanner da AC6: **2 de 191 flagrados**, a sonda e o `loader.test.ts`. A story registrava a auto-reprovação do scanner e não via a irmã. Remédio estendido: o leitor de fonte da AC5 também vai para módulo importável, **nunca** auto-exceção. **(c) O controle positivo da AC6 estava engolido pela pré-condição** — um `.test.ts` só com `import { it } from "vitest"` fica vermelho **com ou sem catraca** (`Error: No test suite found in file`, saída colada na AC). A sonda passa a exigir um `it(...)` que **passa**. ⚠️ **Mais quatro precisões medidas:** **AC8(a)** nascia **reprovada** — dos 45 módulos não-teste de `packages/ai/src/`, **2 não têm call site fora de teste hoje** (`__fixtures__/fake-supabase.ts` e `__fixtures__/properties-producao.ts`), justamente o fixture que a §"Abordagem de teste" manda usar ⇒ `__fixtures__`/`__mocks__` explicitamente fora da população; **`pipeline.ts:1635`** (`// 12.5 Memory system — … lead_facts …`) **não estava na tabela "O que sai" e é o ÚNICO `lead_facts` que sobrevive à remoção** — reprovaria a régua de `grep` da AC2; **`shouldRunHaiku` está em `:1685`**, não `:1684` (3 sítios), e o **`12.5a` termina em `:1676`** (o `}` do `catch`), não `:1675` — cortar em 1675 deixa chave órfã; **o `124/195` só reproduz sob a definição *"lead com mensagem `role='user'` em 30 d"*** — trocando por *"qualquer mensagem"* dá **`135/357` (37,8 %)**, então a definição vai escrita ao lado do número. ✅ **Reproduzido e batendo ao número:** produção (`lead_facts`/`lead_memories` = `null`, `match_lead_memory` = 0, `012` registrada, `1052` user, `593` assistant, **`0` assistant de conversa sem `lead_id`**), `263/1788`, `624/1052` (**59,3 %**), `124/195` (**63,6 %**), suíte `190 / 2450`, os 3 arquivos = **54** pelo executor, AC2 `24 em 9` no `HEAD` × `25 em 10` na árvore suja, **população de `190` derivada dos globs do `vitest.config.ts` com `1` zero-import** (`loader.test.ts`), `Epic 88 §8` com **8 linhas** e o MemPalace na **6ª** como *"habilitante — latência"*, `W4-4` deps `D2, W3-1` em `epic-87:1034`, CodeRabbit sem chave em `core-config.yaml`. ✅ **Concordo com a rejeição do "volta restaurado do sha"** — a `87-15 §4` + T9 revisada já fecham, e nenhuma AC das duas stories depende do sha. ✅ **`87-15` AC3/AC4 sustentam o que eu medi** (`16/182` com o par `32e0ee55` de 03/08 × 04/08 como fixture obrigatória; `kind` **por mensagem** com `95/95`, `0/5`, denominador 100 e mutação **≥5**, com *"classificar por predicado é proibido por esta AC"* escrito). **Checklist 10 pontos: 8,5/10.** **Achado 7 novo:** `role='assistant'` é papel sobrecarregado com 7 escritores e sem discriminador de primeira classe — dá denominador ao item de modelo de dados que a `87-5` deixou no `docs/backlog.md`. | @po (Pax) |
| 2026-08-16 | 0.1 | **Criação por recorte da `87-15`**, sob o NO-GO do @po (`docs/qa/po-validation-87-15.md`, §3: *"FATIAR"*). Esta story é o **bloco A corrigido** — `P1 / Onda 1`, sem migration, `git revert`-able. **A correção que motiva o recorte (§2):** a `87-15` mapeava `lead_facts → 404 → return ""` e parava aí; **é o `""` que arma o caminho vivo** (`loader.ts:196`, `if (!l1Snapshot && aiSummaryFallback)`), e `memory/loader.ts` é o **único** caminho pelo qual o `ai_summary` chega ao prompt. Remover o bloco apagaria a memória de conversas anteriores em **624 de 1.052 turnos (59,3 %)** — denominador **por turno**, não por lead (os 14,7 % da `87-15` eram o eixo errado). Contraprova no repo: `summary-grounding.ts:9`, da `87-7` mergeada. **T2 passa a COLAPSAR em ~6 linhas, e a AC1 nova prova nos dois sentidos.** 🔴 **Correção minha sobre a correção do @po, medida:** colapsar literalmente no ramo do `catch` **muda o cabeçalho do prompt** — o `catch` produz `MEMORIA DO LEAD (informacoes de conversas anteriores):` e o ramo **vivo** produz `MEMORIA DO LEAD (resumo):` (`loader.ts:198`). O `catch` **nunca disparou em produção** (mesmo motivo da §3: `supabase-js` não lança), então a string que o mundo vê é `(resumo)`. **A AC1(iii) exige equivalência byte a byte com o ramo vivo** — +30 caracteres de prompt em 59,3 % dos turnos não cabem numa story de subtração. 🔴 **Segundo achado meu, e é o que dá dente à AC1:** a suíte **não pega nada disso hoje** — `0` testes contêm `"MEMORIA DO LEAD"`, `0` assertam `memoryContext`, e **as 6 fixtures de pipeline gravam `ai_summary: null`, ou seja 0 de 6 controles positivos**. Removendo o bloco inteiro hoje, **2.450 testes ficam verdes**. A AC1(iv) exige que a mutação passe de **0 para ≥ 3** vermelhos. **Correção da AC5(a) da `87-15`, mais precisa que a do parecer:** o `12.5b` **não** roda por turno — `pipeline.ts:1684`, `shouldRunHaiku = (msgCount % 5 === 0)`; o que sai 1× por resposta é o `12.5c` (`processConversationTurn`). Logo `count(role='assistant')` = execuções de `processConversationTurn` evitadas, **não** delta do console da Anthropic (`12.5b` + `haiku-enrichment` ficam). A estimativa de ~119/30 d remanescentes é **derivação aritmética, não medição** — AC7(c) manda medir ou declarar não-medível. **Aritmética do Epic 88 corrigida nos dois sentidos:** o `§8` tem **8 linhas** e o MemPalace é a **6ª**, *"habilitante — latência"* — **não existe "nona linha"** e não é bloqueante. O argumento de prioridade passa a ser **custo de atraso** (593 Haiku + ~1.831 embeddings + ~1.600 round-trips a cada 30 d), que acumula, em vez de dependência. **Varredura de zero-import não vira story** (@po: `1 de 190`, o próprio `loader.test.ts`) — **reproduzi por conta própria com a população derivada dos globs do `vitest.config.ts` e deu `1 de 190`**; entra como **catraca permanente** (AC6), com a armadilha registrada de que **o scanner reprova a si mesmo** se morar dentro do arquivo de teste. **`memory-extraction.ts` sai e NÃO volta "restaurado do sha"** (@po §5.4): o que volta na `87-15` é régua nova; o sha fica na PR como valor de arquivo, fora de qualquer AC. **Medições próprias desta árvore:** suíte **190 / 2.450** (saída bruta); os 3 arquivos que saem = **54** testes pelo executor (`grep -c "it("` daria 55 e erraria); AC2 com **denominador divergente declarado nas duas árvores** — **24 em 9 arquivos no `HEAD`** × **25 em 10 na árvore suja** (a diferença é a fixture da `87-11`, não commitada), e o @dev re-mede na hora. `qualification.ts:361`, `memory-extraction.ts:139`, `pipeline.ts:1298`/`:1296` conferidos; deslocamento de **+2** na árvore suja confirmado. **Sem migration** (a `231` é da `87-12`, a `232` é da `87-15`). ⛔ **Merge atrás da ratificação escrita do `D2-(c)` pelo Gabriel** — implementar e testar podem seguir sob a recomendação; a justificativa da assimetria é **custo de errar** (revert de 1 comando × tabela em produção), não conveniência. | @sm (River) |
