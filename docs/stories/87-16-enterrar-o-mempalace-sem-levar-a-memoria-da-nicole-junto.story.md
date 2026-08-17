# Story 87-16 — Enterrar o MemPalace sem levar a memória da Nicole junto

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** `Ready for Review`
**Validada pelo @po (Pax) em 2026-08-16** — GO condicional, parecer em `docs/qa/po-validation-87-16.md`.
As correções numéricas do parecer (§1 do parecer: **476 ≠ 593**; AC2 com `pipeline.ts:1635`; AC5×AC6;
AC6 controle positivo; AC8-a) **já estão aplicadas abaixo** e marcadas com **`[@po 16/08]`**.
**Prioridade:** **P1 · Onda 1** (colocação atribuída pelo @po em `docs/qa/po-validation-87-15.md` §5.1)
**Item do roadmap:** **`W4-4` (parte)** — é o **`D2-(c)`**, *"enterrar o código morto"*, recomendado
em 05/08 e nunca escrito. **Recortada da `87-15`** por decisão do @po (NO-GO de 16/08, §3): a
`87-15` fica com o bloco B (substrato novo, `Draft` sem data); esta story é o bloco A **corrigido**.
**Criada por:** @sm (River) em 2026-08-16
**Executor:** @dev · validação: @qa
**Esforço:** **S → S/M** *(com a AC9)* — 6 arquivos removidos, 1 bloco colapsado em ~6 linhas,
2 docstrings atualizados, 3 arquivos de teste novos **+ 1 módulo extrator com testes, 1 script de
verificação e 1 entrada em `package.json` (AC9)**
🆕 **AC9 acrescentada pelo @sm em 2026-08-16, DEPOIS do GO condicional — e ✅ VALIDADA pelo @po no
mesmo dia (`docs/qa/po-validation-87-16-ac9.md`, 🟢 GO).** **T10–T13 destravadas.** As correções
`[@po 16/08 · AC9]` estão aplicadas: **(1)** a população varrida exclui `*.test.ts` (senão as
fixtures da T10 envenenam a T11); **(2)** a **ordem** virou AC (`T10 → T11 → T12 vermelha → T1/T2 →
T12 verde`); **(3)** a M3 ganhou nome próprio. **As AC1–AC8 não foram tocadas.** Ela
afirma que **nenhum objeto de banco consultado pelo código está ausente da produção** — a classe de
falha que manteve o MemPalace vivo por 4 meses. **Nasce vermelha sobre defeito real: 3 de 138
objetos ausentes hoje, com 7 sítios de produção.**
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

### 🆕 AC9 — nenhum objeto de banco consultado pelo código pode estar ausente da produção

> **Acrescentada pelo @sm em 2026-08-16, DEPOIS do GO condicional do @po.** É adição de escopo a
> story validada ⇒ **as AC1–AC8 não foram tocadas** e a AC9 volta ao @po. *(Ver §"Pedidos", item 12.)*

**A classe de falha, nomeada:** o MemPalace sobreviveu **quatro meses** consultando `lead_facts`,
`lead_memories` e `match_lead_memory` em produção com `to_regclass` = `null` e **a suíte verde o
tempo todo**. Esta story enterra **as três instâncias**. A AC9 enterra **a classe** — senão a
próxima nasce amanhã, e a `87-15` já vai criar substrato novo (migration `232`) por cima.

#### 🔴 A forma óbvia não funciona aqui, e isso é medido — não é opinião

Comparar *"migrations do repo × migrations registradas"* **dá falso positivo em tudo nesta casa**:

```
supabase_migrations.schema_migrations   última entrada: 20260710171933   (10/07)
migrations realmente aplicadas desde então: 217, 218, 219, 220, 222 … 230
```

Migration por **SQL cru na Management API não registra** na tabela de controle. É o mesmo defeito
do Achado 1 pelo avesso: a `012` está **registrada e não existe**; as `217…230` **existem e não
estão registradas**. **Qualquer régua ancorada nessa tabela está errada por construção.**

⇒ **A AC9 afirma o OBJETO, não a migration.** Para cada tabela/view/RPC que o código consulta,
prova-se que ela **existe em produção agora**.

#### (A) De onde sai a lista de objetos — as duas abordagens, contadas antes de escolher

**Medido por mim hoje**, população = **1.162 arquivos `.ts`/`.tsx`** em `packages/ai/src` +
`packages/web/src` + `packages/shared/src`:

| Abordagem | Objetos encontrados | Veredito |
|---|---|---|
| **Extração estática** de `.from("…")` / `.rpc("…")` | **115 relações + 23 RPCs = 138** | **escolhida** |
| **Lista declarada à mão** | as mesmas 138, mantidas por humano | **rejeitada — apodrece** |

**Por que a lista à mão foi rejeitada, com número:** objetos distintos em `origin/main` = **143**
(régua aproximada de 1 linha) contra **63** em `10d18a2a` (15/05, 90 dias atrás) — **+80 em 90
dias**, no mesmo intervalo em que os arquivos foram de **389 → 1.162** e as migrations de **54 →
252**. São ~**27 entradas novas por mês** a manter à mão. Uma lista assim fica desatualizada antes
da primeira story que a usa, e **desatualizada ela mente para o lado verde**. *(E não há atalho: não
existe `database.types.ts` gerado neste repo — conferido.)*

**Mas a extração estática só serve se o falso negativo for DECLARADO, e ele existe. Medido:**

| # | Régua | Resultado | Consequência |
|---|---|---|---|
| **1** | regex **por linha** | **19** RPCs | **perde 4 de 23 (17,4 %)** — `get_analytics_summary`, `get_system_events_summary`, `get_whatsapp_cost_summary`, `get_whatsapp_volume_summary`, todas escritas em **multilinha** (`supabase.rpc(` ⏎ `"nome"`) |
| **2** | regex **por arquivo**, sem excluir o dono da chamada | **+2 nomes falsos** | `Buffer.from("nao sou imagem")` (`marketing/arte-cta.test.ts:207`, `arte-logo.test.ts:136`) e `` Buffer.from(`${username}:${password}`) `` (`sienge/client.ts:31`) |
| **3** | regex por arquivo **+ exclusão de `Array\|Buffer\|Object\|…\.from(`** | **115 + 23 = 138** | **é esta** |

**É o erro do @po na varredura de zero-import repetido de ponta a ponta** — as duas primeiras
passadas dele deram `41/190` e `3/190` por `import` multilinha e alias. **Aqui é multilinha de
novo, e do mesmo lado.**

**Ponto cego residual — DECLARADO, não coberto:** **19** sítios `.from(` com argumento não-literal.
Classificados um a um: **14** são bucket de storage, **3** são teste/comentário, e **2** são tabela
vinda de variável em código de produção —

```
packages/web/src/lib/api-utils.ts:36        .from(tableName)   ← softDelete(), 4 chamadores literais
packages/web/src/app/dashboard/fvs/page.tsx:20  admin.from(table)  ← 3 chamadores literais
```

**Custo hoje: 0 de 138.** Os 7 nomes que passam por ali (`kanban_stages`, `leads`, `properties`,
`knowledge_base`, `fvs_locais`, `fvs_servicos`, `fvs_equipes`) **já entram na lista por outro sítio
literal** — conferido nome a nome. **O ponto cego vai escrito no cabeçalho do script.** Uma régua
que finge cobertura total é a próxima crença que alguém acredita existir.

**Fora da população, por decisão escrita:** os **10 buckets de storage** (`nicole-media`,
`obra-fotos`, `pastas`, …). São outro catálogo (`storage.buckets`) e outro mecanismo — misturá-los
faria a régua precisar de duas verdades e ela morreria na primeira divergência.

🔴 **`[@po 16/08 · AC9]` E os `*.test.ts` TAMBÉM ficam fora da população varrida — senão a T10
envenena a T11 na primeira execução.** A população de 1.162 arquivos **inclui 188 `.test.ts`**
(prova que está na própria story: o `Buffer.from("nao sou imagem")` dos falsos positivos vem de
`marketing/arte-cta.test.ts:207`). Hoje **1** nome real já entra na lista por arquivo de teste
(`agent_prompt_versions`, `agent-prompt-versions.test.ts:124`).

**A consequência é estrutural, não hipotética: a fixture da M1 é, POR CONSTRUÇÃO, um nome que o
extrator TEM de colher e que a produção TEM de não ter.** Escrevi a `referenced-objects.test.ts` do
jeito óbvio e rodei o extrator sobre ela:

```
o extrator, rodando sobre o proprio arquivo de teste, colhe:
  relacoes: [ 'tabela_fixture_a' ]
```

⇒ `db:objects:check` devolveria **`EXIT=1` para sempre**, sobre um objeto que ninguém consulta. É o
**Risco 11 realizado pela própria T10**, e a saída fácil — pôr o arquivo no ignore — é exatamente a
**auto-exceção que esta story proíbe duas vezes** (Armadilha 3, Risco 8). Terceira ocorrência da
mesma classe na mesma PR.

**Remédio, e ele é REGRA e não auto-exceção:** a **população varrida pelo script (T11) é só código
de produção** — `**/*.test.ts(x)`, `__fixtures__/` e `__mocks__/` fora. *(O extrator da T10 continua
sendo função pura sobre texto: quem define a população é o script, não o módulo. É o que mantém o
extrator testável.)*

✅ **Custo medido, e é ZERO:** população cai de **1.162 → 974** arquivos e o número de alvos
**continua 138** (`115 + 23`) — o único nome que vinha de teste, `agent_prompt_versions`, também
está em `packages/web/src/lib/agent-prompt-versions.ts:129`. **O denominador não muda; some só a
armadilha.**

#### (B) Onde roda e QUEM roda — e a resposta é dono humano, dita com todas as letras

Afirmar existência exige credencial de produção ⇒ **não é `vitest` puro**. O precedente é o
`prompts:check` (`scripts/dump-agent-prompts.ts`, exit `0`/`1`/`2`, credencial de
`packages/web/.env.local`), **e a limitação dele está registrada**: o parecer do @po da `87-1` (M7)
diz *"o script funciona e ninguém roda"*, e a resposta foi a **AC7-(ii) da `87-1`** — *"o @qa roda
`npm run prompts:check` no gate de toda story do Epic 87 que toque prompt/config"*.

⚠️ **Então digo explicitamente o que a mecânica é: a AC9 tem DONO HUMANO, não mecanismo.** O que a
sustenta não é esperança — é **track record**: `87-11`, `87-12` e `87-13` publicaram
`prompts:check` **verde no gate**, três stories seguidas. *(E o dia em que houver CI que rode
`npm test` com secret, o `db:objects:check` entra junto do `prompts:check`, no mesmo lugar — não
antes.)*

**Divisão em duas camadas, e ela não é enfeite:**

| Camada | Onde | Credencial | Quem roda |
|---|---|---|---|
| **extrator** (as 138 linhas) | módulo importável + testes em `vitest` | nenhuma | **`pnpm test`, sempre** — e a AC6 o obriga a ser importado |
| **afirmação contra produção** | `scripts/check-db-objects.ts` (fino) | `SUPABASE_ACCESS_TOKEN` (ou `~/.supabase/access-token`) + `SUPABASE_PROJECT_REF` | **@qa no gate** |

O extrator é a peça que erra (falso positivo/negativo). Deixá-lo dentro do script credenciado o
tornaria intestável — e um extrator não testado é o `loader.test.ts` outra vez, por outra porta.

**A afirmação é UMA consulta somente-leitura, e ela roda hoje:**

```sql
-- relações: existe E o service_role enxerga
to_regclass('public.'||quote_ident(nome)) is not null
has_table_privilege('service_role', oid, 'SELECT')
-- RPCs
pg_proc ⋈ pg_namespace (nspname='public', proname=nome)
has_function_privilege('service_role', oid, 'EXECUTE')
```

🔴 **`to_regclass`/`pg_class`, NUNCA `information_schema.tables`.** Medido em produção:

```
information_schema.tables (schema public) : 122 objetos — NÃO vê meta_campaign_roas
pg_class (r,v,m,p,f)                      : 123 objetos — vê (relkind='m', materialized view)
```

`meta_campaign_roas` é consultada em `packages/web/src/app/api/meta-ads/campaigns/[campaign_id]/route.ts:398`.
**Uma régua por `information_schema` nasceria com 1 falso vermelho** — e falso vermelho é como
controle vira ruído e ruído vira desligado (Risco 5 da `87-1`).

**Ponto cego #2, declarado:** a AC9 afirma **catálogo + privilégio**, não a **exposição do
PostgREST** (`db-schemas`). Um objeto que existe, tem grant e não está no schema exposto passa
verde e quebra em runtime. **Vai escrito no cabeçalho do script**, junto com o ponto cego #1.
Medido hoje: **0 de 113 relações sem `SELECT` para `service_role`, 0 de 22 RPCs sem `EXECUTE`** — o
segundo eixo custa zero falso vermelho hoje.

#### (C) Como ela falha: **ruidosamente**, e a proibição é literal

- **`exit 1`** = pelo menos um objeto não existe (ou existe sem privilégio). Imprime **cada objeto
  ausente com TODOS os seus `arquivo:linha`** — o `grep` que o humano faria a seguir já vem pronto.
- **`exit 2`** = erro de credencial/rede/consulta. **Nunca `exit 0`.**
- ⛔ **Proibido, e é o defeito que esta story inteira existe para enterrar:** tratar erro de consulta,
  resposta vazia ou lista vazia como *"nada faltando"*. `if (error) return ""` / `return []` /
  `catch {}` silencioso **reprova a AC9 na leitura do diff**, sem discussão. Lista de alvos vazia
  também é `exit 2`: extrator que não achou nada está quebrado, não é banco perfeito.
- **Sem escrita.** Só `SELECT` sobre catálogo. Um `INSERT`/`UPDATE`/DDL neste arquivo é bug — mesma
  regra do cabeçalho do `dump-agent-prompts.ts`.

#### (D) O vermelho demonstrável — a AC **não pode nascer satisfeita**

*(É a armadilha que esta casa já pagou cinco vezes: a `87-0` teve de escrever `config-surfaces.test.ts`
porque **cinco** controles do painel não faziam nada. Um controle que ninguém executa e que nasce
verde é o sexto.)*

**Medido por mim contra produção hoje, ANTES da T1/T2 — a régua da AC9 já roda e já dá vermelho:**

```
alvo: 115 relações  → inexistentes: 2   → lead_facts, lead_memories
alvo:  23 RPCs      → inexistentes: 1   → match_lead_memory
                                    ---
                                      3  de 138  (2,2 %)
sem SELECT p/ service_role: 0 de 113 · sem EXECUTE: 0 de 22
```

**Os 7 sítios de produção que a saída vermelha tem de nomear** (nenhum é teste):

```
lead_facts        → memory/loader.ts:55 · chat/pipeline.ts:1647 · :1656 · :1666
lead_memories     → memory/loader.ts:106 · memory/writer.ts:130
match_lead_memory → memory/loader.ts:154
```

⇒ **Ordem obrigatória, e ela é a AC:**

1. **ANTES** de T1/T2 (árvore com o MemPalace ainda vivo): rodar e **colar a saída vermelha bruta**,
   com `EXIT=1` e os **3** objetos + **7** sítios. *Se der verde aqui, a régua está quebrada — pare.*
2. **DEPOIS** de T1/T2: rodar e **colar a saída verde bruta**, `EXIT=0`, **135 de 135**
   (`113 relações + 22 RPCs`).

**Uma régua que só é vista verde não vale nada** — mesma exigência que a AC5 já faz do teste de
ausência. A diferença é que aqui o vermelho **não é sonda**: é o defeito real, medido em produção,
que esta story enterra.

🔴 **`[@po 16/08 · AC9]` E o ⛔ da própria story podia tornar esse vermelho IRREPRODUZÍVEL — a ordem
das tarefas passa a ser AC.** A DoD autorizava **T1–T9 já** e bloqueava **T10–T13** até este
parecer; e a T12 exige o vermelho **antes** da T1/T2. Se o @dev exercesse a autorização e fizesse
o enterro primeiro, os 3 objetos sairiam do código, o extrator deixaria de mirá-los e o
`db:objects:check` daria **verde por ausência de alvo** — a AC viraria insatisfazível na árvore, e a
única saída seria a régua que nasce satisfeita. *(Conferido hoje: `packages/` está intocado, o
vermelho ainda está disponível.)*

⇒ **Com a AC9 aprovada, a ordem de execução é parte da AC:**

```
T10 (extrator) → T11 (script) → T12 vermelha (EXIT=1) → T1/T2 (o enterro) → T12 verde (EXIT=0)
```

⇒ **Fallback escrito, para o caso de a T1/T2 já ter acontecido:** produzir o vermelho a partir de um
`git worktree` no commit anterior à T1 e **declarar na saída colada qual árvore a gerou**. Vermelho
sem árvore declarada não conta.

#### (E) Mutação isolada, com a contagem declarada ANTES

⚠️ **Isoladas de propósito.** A lição da rodada 2 da `87-12`: mutar **constante compartilhada**
acende vários sítios juntos e mascara os descobertos; mutar **guarda inteira** esconde
sub-expressões sem cobertura. **Uma mutação por propriedade, cada uma em arquivo temporário próprio,
revertida antes da seguinte.**

| # | Mutação | Esperado, **declarado antes** | Qual propriedade isola |
|---|---|---|---|
| **M1** | `.from("tabela_que_nao_existe_87_16")` numa linha só | **+1** objeto ausente, e **só ele** | o caminho básico |
| **M2** | `.rpc(` ⏎ `"rpc_que_nao_existe_87_16"` — **multilinha** | **+1** | 🔴 **separa a régua por arquivo da régua por linha.** Sem M2, um extrator por linha passa na AC9 e perde silenciosamente 4 de 23 RPCs reais |
| **M3** | `` Buffer.from("tabela_m3_87_16") `` — 🔴 **`[@po]` nome PRÓPRIO, diferente do da M1** | **+0** — **continua verde** | 🔴 **falso positivo.** Hoje o regex ingênuo colhe **2** nomes falsos, todos `Buffer.from` (3 sítios). Se M3 acende, a régua super-reporta e é desligada na segunda semana |

🔴 **`[@po 16/08 · AC9]` Por que a M3 ganhou nome próprio.** A v0.3 dava a M1 e a M3 **o mesmo
literal** (`tabela_que_nao_existe_87_16`). A isolação está escrita, mas se ela escorregar os dois
conjuntos **colapsam** e a M3 sai verde **sem provar nada** — passa por ser o mesmo nome, não pela
exclusão de dono. Rodei as duas com nomes distintos, que é como a M3 discrimina de verdade:

```
COM exclusao de dono: [ 'leads' ]                      <= M3 nao entra: +0, VERDE
SEM exclusao de dono: [ 'tabela_m3_87_16', 'leads' ]   <= M3 entraria: falso positivo
```

- **Controle positivo:** o item (D)-1 — os **3** objetos reais, com os **7** sítios.
- **Controle negativo:** os **135** que existem saem verdes, **e `meta_campaign_roas` está entre
  eles** (matview — é o falso vermelho que `information_schema` produziria).
- **Denominador declarado, e a régua junto:** **138 objetos** (115 relações + 23 RPCs) extraídos de
  **1.162 arquivos `.ts`/`.tsx`** em `packages/{ai,web,shared}/src`, regex **por arquivo** com
  exclusão de `Array|Buffer|Object|Uint8Array|Int8Array|Float32Array|Set|Map`, **10 buckets de
  storage e 19 sítios `.from(` não-literal fora da população**, os 2 de produção nomeados acima.

#### (F) O que a AC9 **não** faz

1. **Não conserta a `012`** nem a tabela de controle de migrations. Continua sendo o Achado 1.
2. **Não roda em CI** — não existe CI que rode `npm test` com secret hoje. Quando existir, entra
   junto do `prompts:check`, e aí sim vira mecanismo.
3. **Não bloqueia merge sozinha.** Bloqueia o **gate do @qa**, que é onde o `prompts:check` já vive.
4. **Não cobre storage, PostgREST `db-schemas`, nem `.from(variável)`.** Os três pontos cegos vão
   **escritos no cabeçalho do script**, com os `arquivo:linha` dos 2 sítios dinâmicos de produção.

---

## Tarefas

- [x] **T1** (@dev) — remover `memory/loader.ts`, `memory/loader.test.ts`, `memory/writer.ts`,
      `memory/writer.test.ts`, `flows/memory-extraction.ts`, `flows/memory-extraction.test.ts`.
      **Anotar o sha do commit anterior na descrição da PR** — valor de arquivo, **não** plano de
      restauração (nenhuma AC depende dele).
- [x] **T2** (@dev) — 🔴 **colapsar** `pipeline.ts:679-694` no bloco de ~6 linhas da §"Desenho",
      **com a string `MEMORIA DO LEAD (resumo):` byte a byte**. Remover imports (32, 37, 38),
      `12.5a` (**1641-1676** — `[@po 16/08]` o fim é o `}` do `catch` em `:1676`, não `:1675`;
      cortar em 1675 deixa chave órfã) e `12.5c` (1709-1711). **NÃO tocar o `12.5b`** (1678-1707).
      **`[@po 16/08]` Reescrever também o comentário de cabeçalho `pipeline.ts:1635`** — é o único
      `lead_facts` que sobrevive à remoção e ele reprova a AC2.
- [x] **T3** (@dev) — remover as fixtures `lead_facts: []` (AC2), **re-medindo o denominador** (9 ou
      10 arquivos, depende da `87-11`).
- [x] **T4** (@dev) — os testes da **AC1**: controle positivo (fixture com `ai_summary` preenchido —
      hoje são 0 de 6), controle negativo, equivalência de string, e a mutação com o número
      declarado antes. **Este é o item que o @po vai reler primeiro.**
- [x] **T5** (@dev) — teste de ausência (AC5), colado **vermelho** uma vez, **com o leitor de fonte
      num módulo importável** — senão a T6 o reprova (`[@po 16/08]`, AC5).
- [x] **T6** (@dev) — catraca de zero-import (AC6), com o scanner **em módulo importável** e o
      controle positivo colado vermelho — **a sonda tem `it(...)` que passa** (`[@po 16/08]`, AC6).
- [x] **T7** (@dev) — atualizar os 2 docstrings (AC8-b).
- [x] **T8** (@dev) — executar a mutação da AC4 em branch descartável, colar a saída, **descartar a
      branch**.
- [ ] **T9** (@qa) — publicar (a), (b) e (c) da AC7 nas 72 h seguintes ao deploy, com janelas e `n`.
- [x] 🆕 **T10** (@dev · AC9) — o **extrator** num módulo importável (sugestão:
      `packages/shared/src/db/referenced-objects.ts`), regex **por arquivo** com a lista de exclusão
      de dono, mais testes em `vitest` com fixtures dos **três** modos medidos: literal de uma linha,
      `.rpc(` **multilinha**, e `Buffer.from(` que **não** pode entrar. **Módulo importável também
      porque a catraca da AC6 está na mesma PR** — vale aqui a mesma regra que a AC5 recebeu.
- [x] 🆕 **T11** (@dev · AC9) — `scripts/check-db-objects.ts` **fino** (só credencial + 1 consulta
      somente-leitura + relatório) e `"db:objects:check"` no `package.json`, ao lado do
      `prompts:check`. Exit `0`/`1`/`2`, **nunca** `exit 0` em erro. Cabeçalho com os **três pontos
      cegos** declarados (storage, `db-schemas` do PostgREST, `.from(variável)` com os 2 sítios de
      produção nomeados). 🔴 **`[@po]` A população varrida é só código de produção** —
      `**/*.test.ts(x)`, `__fixtures__/` e `__mocks__/` fora, **por regra e não por auto-exceção**
      (senão as fixtures da T10 entram na lista de alvos e o script fica `EXIT=1` para sempre).
      **Custo medido: 1.162 → 974 arquivos, alvos continuam 138.**
- [x] 🆕 **T12** (@dev · AC9) — colar as **duas** saídas brutas na ordem: 🔴 **vermelha ANTES da
      T1/T2** (`EXIT=1`, 3 objetos, 7 sítios) e 🟢 **verde depois** (`EXIT=0`, 135 de 135). Mais as
      **três mutações isoladas** M1/M2/M3 com a contagem declarada antes de cada uma.
      🔴 **`[@po]` ORDEM DE EXECUÇÃO, e ela é AC:** `T10 → T11 → T12 vermelha → T1/T2 → T12 verde`.
      **Fazer o enterro primeiro apaga o vermelho** e a AC vira insatisfazível. Se a T1/T2 já tiver
      acontecido, gerar o vermelho num `git worktree` no commit anterior e **declarar a árvore na
      saída colada**.
- [ ] 🆕 **T13** (@qa · AC9) — rodar `npm run db:objects:check` no gate desta story e **colar a
      saída**. A partir daqui, mesmo arranjo do `prompts:check` (`87-1` AC7-ii): gate de toda story
      do Epic 87 que crie, remova ou passe a consultar objeto de banco.

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
9. 🆕 🔴 **AC9 — regex por LINHA perde 4 de 23 RPCs.** `supabase.rpc(` ⏎ `"nome"` é como quatro
   sítios reais estão escritos hoje. **Casar sobre o arquivo inteiro**, não linha a linha. É a
   mutação **M2** que separa as duas réguas.
10. 🆕 🔴 **AC9 — `information_schema.tables` não vê materialized view.** `meta_campaign_roas`
    (`relkind='m'`, consultada em `meta-ads/campaigns/[campaign_id]/route.ts:398`) sumiria e a régua
    nasceria com 1 falso vermelho. **Usar `to_regclass`/`pg_class`.** Medido: 122 × 123.
11. 🆕 🔴 **AC9 — `Buffer.from("…")` entra na lista se o dono da chamada não for excluído.** São 2
    nomes falsos hoje (3 sítios). É a mutação **M3**, e ela tem de sair **verde**.
12. 🆕 **AC9 — a ordem importa: o vermelho vem ANTES da T1/T2.** Rodar o `db:objects:check` só
    depois do enterro devolve verde e **não prova nada** — é a régua que nasce satisfeita.

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
| **10** | 🆕 🔴 **A AC9 vira o SEXTO controle sem consumidor** — o `db:objects:check` existe, ninguém roda, e daqui a quatro meses alguém descobre outro objeto fantasma | **Alta** — é a assinatura desta casa: a `87-0` teve de escrever `config-surfaces.test.ts` porque **cinco** controles do painel não faziam nada, e o `prompts:check` só passou a rodar quando ganhou dono (`87-1` AC7-ii, M7 do @po) | **Alto** — o custo é a próxima `87-16` | **(a)** A AC9 **nasce vermelha sobre defeito real** (3 de 138, 7 sítios de produção), não sobre sonda; **(b)** dono humano **nomeado** (@qa no gate), com track record de 3 stories (`87-11`/`87-12`/`87-13` publicaram `prompts:check` verde); **(c)** T13 põe o gate no ritual; **(d)** o **extrator** roda em `pnpm test` sem credencial, então metade da régua tem consumidor automático desde o dia 1 |
| **11** | 🆕 **A AC9 gera falso vermelho e é desligada** — é o Risco 5 da `87-1` (*"selo que nasce vermelho vira ruído"*) | Média | Médio | Os dois geradores conhecidos foram medidos e neutralizados **antes** de virar AC: `information_schema` × matview (**122 × 123**, armadilha 10) e `Buffer.from` (**2 nomes falsos**, mutação **M3** exige verde). Privilégio medido hoje: **0 falso vermelho** (0/113 sem `SELECT`, 0/22 sem `EXECUTE`) |
| **13** | 🆕 🔴 **`[@po 16/08 · AC9]` A T10 envenena a T11 — as fixtures do extrator entram na lista de alvos.** A fixture da **M1** é, por construção, um nome que o extrator TEM de colher e que a produção TEM de não ter | **Alta sem a correção** — os 188 `.test.ts` estão dentro dos 1.162, e **1 nome real já entra por teste hoje** (`agent_prompt_versions`) | **Médio, e é o Risco 11 realizado pela própria story:** `EXIT=1` permanente ⇒ ruído ⇒ desligada. E a saída fácil é a **auto-exceção** que a Armadilha 3 e o Risco 8 já proíbem — 3ª ocorrência da mesma classe na mesma PR | Reproduzido: o extrator sobre a própria `referenced-objects.test.ts` colhe `tabela_fixture_a`. **Remédio por REGRA, não exceção:** população varrida pelo script = só produção (`*.test.ts(x)`, `__fixtures__/`, `__mocks__/` fora). **Custo medido ZERO: 1.162 → 974 arquivos, alvos continuam 138** |
| **14** | 🆕 🔴 **`[@po 16/08 · AC9]` O ⛔ da própria story torna o vermelho irreproduzível** — a DoD liberava T1–T9 e travava T10–T13, mas a T12 exige o vermelho **antes** da T1/T2 | **Alta enquanto a AC9 estivesse travada** | **Alto** — sem vermelho, a AC9 é a régua que nasce satisfeita, que esta casa já reprovou 3× | **Ordem virou AC** (`T10 → T11 → T12 vermelha → T1/T2 → T12 verde`) + fallback por `git worktree` com a árvore declarada na saída. Conferido em 16/08: `packages/` intocado, o vermelho ainda está lá |
| **12** | 🆕 **A AC9 finge cobertura total** e alguém confia nela para um objeto que ela nunca viu | Média | Médio | **3 pontos cegos declarados no cabeçalho do próprio script** — storage (10 buckets, catálogo à parte), `db-schemas` do PostgREST, e `.from(variável)` (**19** sítios, **2** de produção nomeados com `arquivo:linha`). Custo hoje **0 de 138**, conferido nome a nome — declarado, **não** apresentado como coberto |

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

- [ ] AC1–AC9 satisfeitas, com as saídas brutas coladas (incluindo as **seis** mutações: AC1, AC4,
      AC5/AC6 e as três isoladas da AC9 — M1, M2, M3)
- [x] 🔴 A string `MEMORIA DO LEAD (resumo):` preservada byte a byte, provada por teste
- [x] Nenhum `if (error) return ""` novo introduzido
- [x] 🆕 🔴 **AC9 — as DUAS saídas do `db:objects:check` coladas, nesta ordem:** vermelha **antes**
      da T1/T2 (`EXIT=1`, `lead_facts` + `lead_memories` + `match_lead_memory`, 7 sítios) e verde
      **depois** (`EXIT=0`, **135 de 135**). Só a verde **não** satisfaz a AC
- [x] 🆕 **AC9 — o script não engole erro:** `exit 2` para credencial/rede/consulta e para lista de
      alvos vazia; **nunca `exit 0`**. Conferido na leitura do diff
- [x] Os 2 docstrings atualizados (não apagados) — ⚠️ só **1 dos 2 existe** em `origin/main`; o de `collected-data.ts` chega com a `87-11` (ver Dev Agent Record §11)
- [x] `pnpm type-check` e `pnpm lint` limpos; `vitest run` com o delta declarado e reconciliado
      (a reconciliação da AC3 passa a incluir os testes do **extrator** da T10)
- [ ] 🆕 `npm run db:objects:check` **verde** no gate do @qa (T13) — mesmo lugar do
      `npm run prompts:check`
- [x] ⛔ → ✅ **Ratificação escrita do `D2-(c)` pelo Gabriel antes do MERGE** (implementar e testar podem
      seguir antes) — **ratificado em 2026-08-16**, registrado no **Change Log v1.1** e no **Dev Agent
      Record §16**, com a cadeia de custódia declarada (chegou relatada pelo lead; não há outro
      artefato no repositório, e é por isso que o registro existe)
- [ ] `docs/stories/epics/epic-87-…` e `epic-88-…` atualizados pelo **@pm** (pedidos abaixo) — **o
      @sm não edita corpo de epic**
- [x] Story validada pelo **@po** (`*validate-story-draft`) antes da implementação — **GO condicional
      em 2026-08-16**, `docs/qa/po-validation-87-16.md`. Correções `[@po 16/08]` aplicadas no corpo
- [x] 🆕 ✅ **A AC9 foi validada pelo @po em 2026-08-16 — 🟢 GO**, parecer em
      `docs/qa/po-validation-87-16-ac9.md`. **T10–T13 destravadas.** As correções
      `[@po 16/08 · AC9]` (população sem `*.test.ts`, ordem de execução, nome próprio da M3) estão
      aplicadas no corpo
- [x] 🆕 🔴 **A ORDEM é AC:** `T10 → T11 → T12 vermelha → T1/T2 → T12 verde`. **Não começar pela
      T1/T2** — o enterro apaga o vermelho que a AC9 exige ver antes

---

## Achados (para o backlog / @pm — **NÃO** entram nesta story)

1. 🔴 **`supabase_migrations.schema_migrations` tem a `012` como aplicada e os objetos não existem.**
   Esta story não conserta. Enquanto o registro estiver lá, um `supabase db push` **pula** a `012` e
   a divergência sobrevive.
   🆕 **`[@sm 16/08 · AC9]` A parte "vale auditar se há outras" DEIXOU de ser recomendação — foi
   auditada, e o resultado corrige este achado em dois pontos.** Afirmei os **138** objetos que o
   código consulta contra o catálogo de produção: **3 ausentes, e são exatamente os três desta
   story** (`lead_facts`, `lead_memories`, `match_lead_memory`). **`meta_campaign_roas` NÃO está
   ausente** — existe como **materialized view** (`relkind='m'`) e é consultada em
   `meta-ads/campaigns/[campaign_id]/route.ts:398`. A auditoria de paridade do epic a listava como
   faltando porque `information_schema.tables` **não enxerga matview** (medido: 122 × 123). ⇒ **o
   "continua sem dono" está resolvido por inexistência do problema**, e a régua que o dizia é
   justamente a que a AC9 proíbe. **O que sobra deste achado é só a `012` mal registrada** — e o
   sentido inverso, que a AC9 também não conserta: as migrations `217…230` existem em produção e
   **não** estão registradas, porque foram aplicadas por SQL cru na Management API.
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

**🆕 Ao @pm — pedidos da AC9 (acrescentada em 16/08, depois do GO):**

10. **Gate permanente novo, irmão do `prompts:check`.** A `87-1` AC7-(ii) instituiu *"o @qa roda
    `npm run prompts:check` no gate de toda story do Epic 87 que toque prompt/config"*. A AC9 pede a
    linha gêmea: **`npm run db:objects:check` no gate de toda story que crie, remova ou passe a
    consultar objeto de banco.** Registrar no epic ao lado do outro — dois gates com o mesmo dono
    humano ficam num lugar só; espalhados, morrem.
    🔴 **`[@po 16/08 · AC9]` Mas o GATILHO tem de ser decidível pelo `git diff`, não por julgamento.**
    *"Passe a consultar objeto de banco"* é interpretação, e interpretação é como o gate escapa:
    conferi os gates do Epic 87 e o `prompts:check` aparece em **87.1, 87.11, 87.12 e 87.13** — e
    **não** em **87.14**, que é justamente uma story de permissão que lê tabela. **Redação sugerida,
    greppável:** *"roda quando o diff toca `supabase/migrations/` **ou** adiciona/altera qualquer
    `.from("…")` / `.rpc("…")`."* Decidir **se** o gate se aplica passa a ser mecânico; **rodá-lo**
    continua humano — e é essa metade que a AC9 declara honestamente que não tem mecanismo.
11. 🔴 **O `W0-2` precisa de um segundo remendo, e ele é da mesma família do item 4 acima.** Além de
    *"vira string vazia"* estar incompleto, o `W0-2` instrumenta **o sintoma em runtime**. A AC9
    ataca **a causa antes do runtime**: nenhum objeto consultado pode estar ausente. Sugestão de
    redação para o `W0-2`: *"observabilidade do erro silencioso (runtime) **+** afirmação de
    existência dos objetos (pré-deploy, `db:objects:check`) — a segunda torna a primeira um seguro,
    não a única defesa."*
    ⚠️ **E um dado para o roadmap:** a divergência entre repo e produção corre **nos dois sentidos**
    — a `012` está registrada e não existe; as `217…230` existem e não estão registradas. **Nenhuma
    régua baseada em `supabase_migrations.schema_migrations` funciona nesta casa**, e vale gravar
    isso onde as próximas stories leem.

**🆕 Ao @po — pedido da AC9:**

12. ⛔ **A AC9 é adição de escopo a story já validada e volta ao @po sozinha.** As **AC1–AC8 não
    foram tocadas** — em especial a **AC1**, que continua sendo o bloqueante achado por você
    (o `ai_summary` em **59,3 %** dos turnos). **Via rápida sugerida:** (a) a escolha entre extração
    estática e lista à mão, com as duas contadas (**138** × ~27 entradas novas/mês); (b) que o dono é
    **humano** e está dito com todas as letras, com o precedente e sua limitação registrada
    (`prompts:check`, M7 do seu parecer da `87-1`); (c) o **vermelho demonstrável** — **3 de 138**
    hoje, medido contra produção, e a exigência de que ele seja colado **antes** da T1/T2; (d) as
    três mutações isoladas M1/M2/M3, e por que **M3 tem de sair verde**.
    **Reproduza se puder:** as réguas estão todas escritas na AC9 (`to_regclass` +
    `has_table_privilege`, regex por arquivo com exclusão de dono, população de 1.162 arquivos).

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

**Agent Model Used:** Claude Opus 5 (@dev · Dex) · **Data:** 2026-08-16
**Branch:** `story/87-16-enterrar-mempalace`, cortada de `origin/main` = **`a60a1bc6`**
**Modo:** YOLO · **Sem push, sem PR, sem migration, sem DDL. Só `SELECT` sobre catálogo em produção.**

### 0. Régua da árvore — medida por mim ANTES de tocar em qualquer coisa

O briefing anunciava `188 arquivos / 2.411 passed / 6 expected fail`. Medi eu mesmo em
`origin/main` `a60a1bc6`, saída bruta:

```
 Test Files  188 passed (188)
      Tests  2416 passed | 6 expected fail (2422)
```

⇒ **O denominador desta story é `188 / 2.422`**, não `2.411`. (A story falava em `190 / 2.450`,
medido na árvore suja com `87-5 B` + `87-11` + `87-12`; `origin/main` está mais limpa.) Todos os
números abaixo são contra `188 / 2.422`.

### 1. 🔴 A ORDEM foi respeitada, e ela era a AC

```
T10 (extrator) → T11 (script) → T12 VERMELHA → T4 (testes AC1, verdes no código VELHO) → T1/T2/T3 (enterro) → T12 VERDE
```

`packages/` estava **intocado** quando o vermelho da AC9 foi produzido — nenhum `git worktree` foi
necessário. **A árvore do vermelho está declarada em cada saída colada abaixo.**

### 2. AC9 — o vermelho, ANTES do enterro (`EXIT=1`)

**Árvore:** `story/87-16-enterrar-mempalace` @ `a60a1bc6` **+ T10 + T11 apenas** — `packages/ai` e
`packages/web` intocados, MemPalace vivo. Saída bruta de `npm run db:objects:check`:

```
🔎 db:objects:check — projeto dsopqkqjkmhytudaaolv
   população: 972 arquivos de produção (packages/{ai,web,shared}/src, sem *.test.ts(x)/__fixtures__/__mocks__)
   alvos: 117 relações + 23 RPCs = 140 objetos, 1742 sítios

🔴 3 objeto(s) NÃO EXISTEM em produção:

   relação lead_facts  (4 sítio(s))
     packages/ai/src/chat/pipeline.ts:1646
     packages/ai/src/chat/pipeline.ts:1655
     packages/ai/src/chat/pipeline.ts:1666
     packages/ai/src/memory/loader.ts:54

   relação lead_memories  (2 sítio(s))
     packages/ai/src/memory/loader.ts:105
     packages/ai/src/memory/writer.ts:130

   RPC match_lead_memory  (1 sítio(s))
     packages/ai/src/memory/loader.ts:154

❌ 3 de 140 objetos reprovados. 137 de 140 OK.

⚠️  Ponto cego 3 — 2 sítio(s) com argumento não-literal (fora da população):
     packages/web/src/app/dashboard/fvs/page.tsx:20  admin.from(table)
     packages/web/src/lib/api-utils.ts:35  supabase .from(tableName)
EXIT=1
```

**3 objetos, 7 sítios, todos de produção — exatamente o previsto.** Os dois sítios dinâmicos de
produção que a AC9 mandava nomear apareceram sozinhos, pela régua, não por lista à mão.

##### `[QA-2 · rodada 2]` O ±1 dos ponteiros: a saída está certa, o **docstring** é que mentia

A §AC9-(D) previa `loader.ts:55`/`:106` e `pipeline.ts:1647`/`:1656`; a saída acima diz `:54`/`:105`
e `:1646`/`:1655`. **A divergência era do TEXTO, não do código** — e eu deixei passar na v1.0 sem
reconciliar, que é o defeito. Medido agora, rodando o extrator sobre o `loader.ts` do `a60a1bc6`:

```
relation  lead_facts         reportado=:54   "const { data: facts, error } = await supabase"
relation  lead_memories      reportado=:105  "const { data: memories, error } = await supabase"
rpc       match_lead_memory  reportado=:154  "const { data: results, error } = await supabase.rpc("match_lead_memory", {"
```

E `git show a60a1bc6:…/loader.ts` confirma o outro lado: `:54` é `await supabase` e **`:55` é
`.from("lead_facts")`**. Ou seja o campo reporta o **início do MATCH**, e o `FROM_RE` começa no
**dono** da cadeia. Sonda própria, com os dois eixos separados:

| Forma | Literal está em | Reportado | Coincidem? |
|---|---|---|---|
| `await supabase` ⏎ `.from("x")` | `:3` | **`:2`** (linha do dono) | ❌ −1 |
| `.rpc(` ⏎ `"x"` | `:6` | **`:5`** (linha do `.rpc(`) | ❌ −1 |
| `supabase.from("x")` numa linha | `:8` | **`:8`** | ✅ |

**São dois mecanismos diferentes com o mesmo sintoma**, e vale escrito: no `.from(` o recuo é até o
**dono** (o `FROM_RE` tem grupo de dono, que é o que a M3 usa para barrar `Buffer.from`); no `.rpc(`
não há grupo de dono, então o recuo é só até o `.rpc(`. Um docstring que dissesse *"linha do dono"*
seria a **próxima** meia-verdade — por isso o texto novo descreve os dois casos.

**Conserto:** `packages/shared/src/db/referenced-objects.ts` — docstring de `ObjectReference.line`
trocado de *"Linha 1-based do início do literal"* para o comportamento medido. **O comportamento
está bom e não mudou** (apontar o statement é o que o humano quer ao abrir o arquivo); mudou só o
texto que o descreve.

##### 🔴 E o conserto óbvio deste docstring REPROVOU a AC2 e a AC9 — **quarta** ocorrência da família, e desta vez a vítima fui eu

Escrevi o docstring do jeito natural, com o exemplo transcrito: `` `await supabase` ⏎
`.from("lead_facts")` ``. **Rodei o `db:objects:check` e ele ficou VERMELHO:**

```
   alvos: 116 relações + 22 RPCs = 138 objetos, 1736 sítios
🔴 1 objeto(s) NÃO EXISTEM em produção:
   relação lead_facts  (1 sítio(s))
     packages/shared/src/db/referenced-objects.ts:54
❌ 1 de 138 objetos reprovados. 137 de 138 OK.
EXIT=1
```

**O extrator é regex sobre o TEXTO do arquivo — ele não sabe o que é comentário.** E
`referenced-objects.ts` está na população de produção (não é `*.test.ts`, não é `__fixtures__/`).
Então o comentário virou alvo, e a AC2 caiu junto (`git grep` ⇒ 1, num arquivo de `packages/`).
**Um objeto que só existia em prosa deixou a régua vermelha.**

Isto é exatamente o que a v1.0 já tinha registrado como **[AUTO-DECISION]** (*"os comentários novos
não escrevem os três nomes enterrados"*) e como a **terceira** ocorrência da família *"a régua varre
a si mesma"* — e eu reincidi na rodada seguinte, num item que o gate classificou como **`low`,
opcional, «é uma linha»**. É a evidência mais barata possível de que o tamanho do conserto não prediz
o risco dele. **O gate pegou; eu não teria pegado por leitura.**

**Remédio:** os dois exemplos do docstring passaram a ser **descritos, não transcritos** — nenhuma
chamada com nome entre aspas sobrevive no comentário. E a armadilha ficou **escrita dentro do próprio
docstring**, com o número medido (`138 alvos, 1 reprovado, EXIT=1`) e a proibição explícita de
"resolver" com auto-exceção na população — que é a saída fácil que a Armadilha 3 e o Risco 8 já
proíbem duas vezes.

**Depois do remédio, as cinco réguas reconferidas e idênticas ao baseline:** `git grep` da AC2 ⇒ **0**
· `git grep` da AC8-b ⇒ **0** · `db:objects:check` 🟢 **137 de 137**, população **970**, **1735
sítios**, `EXIT=0` · `vitest` **189 · 2.403 + 6 expected fail (2.409)** · `type-check` **8/8** ·
`lint` **0 errors / 23 warnings** · `prompts:check` **EXIT=0**.

#### 🔴 Correção de denominador: são **117 + 23 = 140**, não 115 + 23 = 138 — e a diferença é um defeito da régua antiga

Reproduzi a régua do @po e ela bate ao número no ponto de partida: **125 nomes + 23 RPCs**. A
divergência está na subtração dos buckets. O parecer subtraiu **10 buckets PELO NOME**; **dois
desses nomes são bucket E tabela**, consultados por `supabase.from(...)` em produção:

```
pastas       | 14 sítios | packages/web/src/app/api/pasta/[token]/route.ts:14
lancamentos  |  6 sítios | packages/web/src/app/api/lancamentos/[id]/route.ts:15
```

Subtrair por nome apagava as duas — **duas tabelas reais saíam da régua em silêncio**, que é o modo
de falha que a AC9 existe para não repetir. Aqui a exclusão é por **DONO da chamada**
(`storage.from(...)` → fora; `supabase.from(...)` → dentro), então `125 − 8 nomes exclusivos de
bucket = 117`. **A régua ficou mais coberta, não menos.** ⇒ o verde previsto vira **137 de 137**
(`115 relações + 22 RPCs`), não 135 de 135.

**População:** `1.163` arquivos `.ts/.tsx` em `packages/{ai,web,shared}/src` (os 1.162 da story + o
módulo novo da T10) → **972 de produção**. A regra tira `*.test.ts(x)` **e** `__fixtures__/`
**e** `__mocks__/` (a story dizia 974 porque tirava só os testes). **Custo em alvos: ZERO.**

### 3. AC9 — as três mutações isoladas, cada uma em arquivo próprio, revertida antes da seguinte

Declaradas ANTES de rodar: **M1 ⇒ +1 · M2 ⇒ +1 · M3 ⇒ +0 (verde)**. Rodadas **duas vezes**: sobre a
árvore vermelha (delta sobre 3) e sobre a árvore verde pós-enterro (**0 → 1**, que isola melhor).

| # | Mutação | Arquivo temporário | Previsto | **Medido (árvore verde)** |
|---|---|---|---|---|
| **M1** | `.from("tabela_que_nao_existe_87_16")`, uma linha | `packages/ai/src/__mutacao_m1_87_16.ts` | +1 | **116 rel + 22 RPC = 138 alvos · 1 reprovado · `EXIT=1`** ✅ |
| **M2** | `.rpc(` ⏎ `"rpc_que_nao_existe_87_16"`, multilinha | `packages/ai/src/__mutacao_m2_87_16.ts` | +1 | **115 rel + 23 RPC = 138 alvos · 1 reprovado · `EXIT=1`** ✅ |
| **M3** | `Buffer.from("tabela_m3_87_16")` | `packages/ai/src/__mutacao_m3_87_16.ts` | **+0** | **115 rel + 22 RPC = 137 alvos · 137 de 137 OK · `EXIT=0`** ✅ |

Saída bruta da **M1** (árvore verde):

```
   alvos: 116 relações + 22 RPCs = 138 objetos, 1736 sítios
   relação tabela_que_nao_existe_87_16  (1 sítio(s))
     packages/ai/src/__mutacao_m1_87_16.ts:3
❌ 1 de 138 objetos reprovados. 137 de 138 OK.
EXIT=1
```

Saída bruta da **M2** (árvore verde) — note que o `+1` caiu no lado **RPC**, não no de relações:

```
   alvos: 115 relações + 23 RPCs = 138 objetos, 1736 sítios
   RPC rpc_que_nao_existe_87_16  (1 sítio(s))
     packages/ai/src/__mutacao_m2_87_16.ts:4
❌ 1 de 138 objetos reprovados. 137 de 138 OK.
EXIT=1
```

Saída bruta da **M3** (árvore verde) — **`tabela_m3_87_16` não aparece em lugar nenhum**, e a
contagem de alvos **não se move**:

```
   alvos: 115 relações + 22 RPCs = 137 objetos, 1735 sítios
🟢 OK — 137 de 137 objetos existem em produção com privilégio para service_role.
EXIT=0
```

**M1 e M3 usam literais DIFERENTES** (`tabela_que_nao_existe_87_16` × `tabela_m3_87_16`), como o @po
exigiu — com o mesmo literal os conjuntos colapsariam e a M3 sairia verde sem provar nada.

A propriedade que a **M2** isola foi medida também dentro da suíte (`referenced-objects.test.ts`,
caso *"M2 (contraprova)"*): a régua **por linha** acha **ZERO** no mesmo trecho onde a régua **por
arquivo** acha 1. É o que separa 23 RPCs de 19.

### 4. AC9 — o verde, DEPOIS do enterro (`EXIT=0`)

```
🔎 db:objects:check — projeto dsopqkqjkmhytudaaolv
   população: 970 arquivos de produção (packages/{ai,web,shared}/src, sem *.test.ts(x)/__fixtures__/__mocks__)
   alvos: 115 relações + 22 RPCs = 137 objetos, 1735 sítios

🟢 OK — 137 de 137 objetos existem em produção com privilégio para service_role.

⚠️  Ponto cego 3 — 2 sítio(s) com argumento não-literal (fora da população):
     packages/web/src/app/dashboard/fvs/page.tsx:20  admin.from(table)
     packages/web/src/lib/api-utils.ts:35  supabase .from(tableName)
EXIT=0
```

**Controle negativo conferido:** `meta_campaign_roas` está entre os 137 verdes — é
`relkind='m'` (materialized view) e a régua usa `to_regclass`/`pg_class`, **nunca**
`information_schema.tables`. Uma régua por `information_schema` nasceria com 1 falso vermelho.

**Como ele falha, conferido na leitura do diff:** `exit 2` para credencial ausente, erro de rede,
HTTP != 2xx, resposta não-JSON, **resposta vazia**, **alvo sem linha no resultado** e **lista de
alvos vazia**. **Não existe `exit 0` em caminho de erro**, e não há `if (error) return ""` /
`return []` / `catch {}` silencioso em lugar nenhum do arquivo.

### 5. 🔴 AC1 — a mutação que documenta que a suíte NÃO protegia isto: **0 → 7**

**Declarado ANTES de rodar:** a AC exige `≥ 3`; previ **7** (6 do arquivo novo + 1 do teste de
ausência da AC5, que lê o fonte). Mutação = colapsar o bloco em `const memoryContext = ""`.
Saída bruta da suíte inteira com a mutação aplicada:

```
 ❯ packages/ai/src/chat/pipeline-sem-mempalace.test.ts (4 tests | 1 failed) 21ms
     × o bloco de memória do prompt continua sendo o `ai_summary`, e só ele 7ms
 ❯ packages/ai/src/chat/pipeline-ai-summary-no-prompt.test.ts (10 tests | 6 failed) 41ms
     × (i-a) o cabeçalho vivo entra no prompt — e é `(resumo)`, não o do ramo `catch` 23ms
     × (i-b) o TEXTO do resumo entra no prompt — asserção separada, de propósito 2ms
     × (i-d) a memória mora no bloco NÃO-CACHEÁVEL — os 8 blocos estáticos não são tocados 2ms
     × o bloco inteiro sai IDÊNTICO ao que o carregador removido produzia 4ms
     × 🔴 equivalência caso a caso: o prompt COM resumo é o SEM resumo + o bloco, e nada mais 1ms
     × a marca aparece UMA vez, não duas — nem cabeçalho duplicado, nem bloco repetido 3ms

 Test Files  2 failed | 187 passed (189)
      Tests  7 failed | 2396 passed | 6 expected fail (2409)
```

**7 vermelhos, previsto 7.** Mutação revertida; `grep` de conferência do reverso rodado.

#### 5.1 A prova de equivalência mais forte que consegui: os testes da AC1 passam nas DUAS árvores

`pipeline-ai-summary-no-prompt.test.ts` foi escrito **antes** da T2 e rodado **contra o código
velho** (com o carregador vivo): **10 passed**. Depois da T2, os **mesmos 10** passam contra o
código novo. Não é argumento sobre a string — é a mesma régua medindo os dois mundos.

**E há uma segunda equivalência, que eu não planejei e é a mais barata de todas:** os dois
**turnos-ouro** da 87-5 (`pipeline-corretor-no-historico.test.ts`) comparam o `system` INTEIRO por
**SHA-256** contra hashes capturados antes desta story. Eles continuam verdes:

```
sha256 3ec9480d84f943732ccc4f2ce4e760a2db110c16de7114e207dd5e7405eb0aa3  length 30256
sha256 d634f39ecc852edb9c55c1ad8069c5a946cc82138853d159110b813153183371  length 30082
```

⇒ para lead **sem** resumo, o prompt saiu **byte a byte idêntico ao de antes da PR**. Somado à
asserção `comResumo.replace(BLOCO, "") === semResumo`, a equivalência está provada nos dois eixos.

#### 5.2 A fixture obrigatória

Antes: **0 de 6** fixtures de pipeline com `ai_summary` preenchido. Agora existe controle positivo
real (`RESUMO` não-vazio) — e o negativo ganhou dois casos que não existiam: `ai_summary: ""` e
**conversa sem `lead_id`**.

**Denominador na PR, com a régua escrita ao lado (o @po exigiu, e a definição muda o número):**
**624 de 1.052 turnos (59,3 %)**, turno = mensagem `role='user'` de lead com `ai_summary` não-vazio,
30 d; **124 de 195 leads ativos (63,6 %)**, ativo = *lead com ao menos uma mensagem `role='user'`
em 30 d* — trocando por *qualquer* mensagem dá **135 de 357 (37,8 %)**.

### 6. AC4 — a mutação que prova que o `loader.test.ts` testava uma fotocópia

Branch descartável `tmp/87-16-ac4-mutacao` (criada de `a60a1bc6`, **apagada depois** —
`Deleted branch tmp/87-16-ac4-mutacao`). Apaguei `loader.ts` mantendo `loader.test.ts` e rodei **só
esse arquivo**:

```
== loader.ts removido; rodando SO loader.test.ts ==
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

**19 verdes sem o módulo.** A §4 está certa e reproduzida — não copiada.

### 7. AC5 — o teste de ausência, visto VERMELHO no arquivo real

Mutação: reintroduzi `.from("lead_facts")` dentro do bloco 12.5 do `pipeline.ts`. Saída bruta:

```
 ❯ packages/ai/src/chat/pipeline-sem-mempalace.test.ts (4 tests | 1 failed) 14ms
     × o `pipeline.ts` não consulta nenhum dos três objetos enterrados 12ms

AssertionError: expected [ Array(1) ] to deeply equal []
- []
+ [
+   "lead_facts @ packages/ai/src/chat/pipeline.ts:1654",
+ ]
```

O vermelho **nomeia o objeto E a linha**. Mutação revertida (conferido: `grep -c` = 0).

🔴 **Duas armadilhas desta AC, e as duas mordem:**
1. **O leitor de fonte mora em módulo importável** (`@trifold/shared/src/testing/source-scan`), e o
   teste também importa o extrator da T10 — senão a catraca da AC6, **na mesma PR**, o flagraria.
2. **Os nomes proibidos são MONTADOS por `join`, não escritos.** A AC2 é uma régua de `grep` sobre
   `packages/`: um teste que asserta a ausência de uma string e a escreve inteira **reprova a régua
   que ele defende**. Foi por isso que os comentários novos do `pipeline.ts`, do extrator e dos dois
   arquivos de teste também tiveram de ser reescritos sem as três palavras.

### 8. AC6 — catraca de zero-import, com a sonda que passa

Controle positivo: `.test.ts` temporário com **um `it(...)` que PASSA** e nenhum import do projeto
(a sonda "só com `import { it }`" ficaria vermelha com ou sem catraca — vermelho engolido pela
pré-condição). Saída bruta:

```
 ❯ packages/shared/src/testing/zero-import.test.ts (11 tests | 1 failed) 43ms
     × 🔴 nenhum arquivo de teste da suíte deixa de referenciar módulo do projeto 27ms

AssertionError: 1 de 189 sem import do projeto: expected [ Array(1) ] to deeply equal []
+ [
+   "packages/ai/src/__sonda_ac6_87_16.test.ts",
+ ]

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 11 passed (12)
EXIT=1
```

O `noop` da sonda **passou** (11 + 1 = 12 testes, 1 falho) — o único vermelho é o da catraca.
**Denominador declarado: hoje `0 de 188`.** A população sai dos globs do `vitest.config.ts`
(`parseVitestInclude`), não de um `find` à mão — foi assim que as duas primeiras varreduras do @po
erraram (41/190 e 3/190), e as duas causas viraram caso de teste: `import` **multilinha** e alias
`@web/`. **O scanner mora em módulo importável e o teste o importa — nunca auto-exceção.**

### 9. AC3 — a conta, declarada ANTES e reconciliada

```
Declarado antes de rodar:
  2.422 − 54 (removidos) + 41 (novos: 16 extrator + 11 catraca + 10 AC1 + 4 AC5) = 2.409
    188 −  3 (arquivos)  +  4 (arquivos novos)                                   =   189

Medido (saída bruta):
 Test Files  189 passed (189)
      Tests  2403 passed | 6 expected fail (2409)
```

**Bate ao número nas duas dimensões.** Os 54 removidos foram contados **pelo executor** (o `grep -c
"it("` daria 55 e erraria, por causa do `it(...)` dentro do `for` de 10 padrões): `2.422 − 2.394 =
28` líquido antes dos arquivos de AC5/AC6, com `26` novos ⇒ `54` removidos, conferido.
**Nenhum teste fora do mapa dependia dos módulos removidos** — zero vermelhos na remoção.

### 10. AC2 — o denominador re-medido, e o comentário `12.5` reescrito

```
grep -rn "lead_facts\|lead_memories\|match_lead_memory" packages/ --include="*.ts" --include="*.tsx" | wc -l
0
```

**População que valeu:** `origin/main` `a60a1bc6` — **a `87-11` NÃO mergeou**, então são as **5**
fixturas `lead_facts: []` (`nicole-enabled`, `pipeline-agenda-state`, `pipeline-scheduling`,
`pipeline-corretor-no-historico`, `pipeline-historico-cauda`), não 6. Todas removidas.

O comentário de cabeçalho da seção `12.5` (o único sítio que sobrevive à remoção, achado do @po) foi
**reescrito, não apagado**: descreve o que a seção passou a ser (só o `12.5b`) e aponta o
`db:objects:check`.

### 11. AC8 — órfãos e docstrings

- **(a)** Varri `packages/ai/src/` sem `__fixtures__/` e `__mocks__/` (fora da população por decisão
  escrita do @po): **39 módulos de produção, 0 órfãos.** O único sem call site por caminho é
  `packages/ai/src/index.ts`, que é o **entry point do pacote** (`"main": "src/index.ts"`), alcançado
  por **30 arquivos de `packages/web`** via `@trifold/ai` — não é órfão, é a porta.
- **(b)** ⚠️ **São 2 docstrings na story e só 1 existe nesta árvore.** `summary-grounding.ts:9`
  **atualizado** (não apagado) — agora descreve o caminho direto no `pipeline.ts`, cita a 87-16 e o
  denominador de 59,3 %. O segundo (`prompts/collected-data.ts:50`) **não existe em
  `origin/main`**: ele chega com a **87-11**, que não mergeou. `grep -rn "memory/loader\|memory/writer"
  packages/` ⇒ **0**.

#### 🔴 11.1 `[QA-1 · rodada 2]` Dívida de merge: são **TRÊS** linhas em **DUAS** PRs — eu tinha declarado uma

O aviso da v1.0 contava **uma** PR (a 87-11 / #428) e **duas** linhas. **São duas PRs e três linhas.**
Extraí cada uma do `gh pr diff` mapeando o hunk ao arquivo e à **linha pós-merge** (`awk` sobre os
cabeçalhos `+++ b/` e `@@`, contando só as linhas adicionadas sob `packages/`) — não por leitura:

| # | PR | Arquivo:linha (pós-merge) | Texto que morde | Régua que reprova | Estava declarado? |
|---|---|---|---|---|---|
| (a) | **#428** (`87-11`) | `packages/ai/src/chat/pipeline-collected-data.test.ts:160` | `lead_facts: [],` | **AC2** (`grep` ⇒ 1) | ✅ previsto na T3/AC2 (*"9 ou 10 arquivos, depende da 87-11"*) |
| (b) | **#428** (`87-11`) | `packages/ai/src/prompts/collected-data.ts:50` | `` → `memory/loader.ts` → prompt) `` | **AC8-b** (`grep` ⇒ 1) | ✅ declarado no §11-(b) da v1.0 |
| (c) | 🔴 **#429** (`87-12 bloco A`) | `packages/ai/src/flows/handoff.ts:258` | `` (`memory/loader.ts:196-203`) `` | **AC8-b** (`grep` ⇒ 1) | ❌ **NÃO estava declarado em lugar nenhum** |

**Precisão sobre o alcance da varredura:** as demais ocorrências de `memory/loader` no diff do #429
(5 delas) estão em `docs/stories/87-12-….story.md`, **fora da população** das réguas da AC2/AC8-b,
que são `packages/`. Só a `handoff.ts:258` morde, porque é a única sob `packages/` — e ela é
**docstring de módulo de produção**, exatamente a espécie que a AC8-b existe para não deixar mentindo.

**Também sob `packages/`, mas sem dívida:** `pipeline.ts:37-38` (`import … from "../memory/loader"` /
`"../memory/writer"`) aparece no diff do #428 como **linha de contexto**, não adicionada — é o
`origin/main` que esta branch já apaga. O merge resolve sozinho; não entra na lista.

**Quem conserta: quem mergear por ÚLTIMO.** A fila é `#428 → #429 → esta` (criadas em
`2026-08-16T17:37:38Z` e `2026-08-16T18:37:52Z`; esta story ainda **sem PR**, e o merge dela estava
atrás da ratificação do `D2-(c)`). Nessa ordem, **quem rebaseia por último é esta story ⇒ o conserto
é dela.** Se a ordem virar, o conserto vai junto com quem chegar depois — o critério é a posição, não
o número da story.

**Gatilho mecânico no rebase, os dois `grep` têm de dar ZERO:**

```bash
git grep -n "lead_facts\|lead_memories\|match_lead_memory" -- packages/   # ⇒ 0
git grep -n "memory/loader\|memory/writer"                  -- packages/   # ⇒ 0
```

🔴 **Use `git grep` (arquivos versionados), não `grep -rn`.** Medido nesta árvore agora:
`grep -rn … packages/` devolve **6** e **1** — e **todas** as ocorrências são de
`packages/web/.next/server/chunks/…` (build local, gitignored). `git grep` devolve **0** e **0**.
A régua por `grep -rn` **nasce vermelha em qualquer máquina que tenha rodado `next build`**, e um
falso vermelho é como controle vira ruído — a mesma lição que a AC9 usa para recusar
`information_schema`.

**Conserto de cada linha, quando for a hora:** (a) apagar a fixture `lead_facts: []` (uma linha, sem
carona — igual às 5 que a T3 já removeu); (b) e (c) **atualizar o docstring, não apagar** — o caminho
`memory/loader.ts:196-203` deixou de existir, e o que ele descrevia (`ai_summary` → prompt) agora
mora direto no `pipeline.ts`, no bloco `memoryContext`. É o mesmo conserto que o `summary-grounding.ts:9`
já recebeu nesta PR, e o precedente está lá para copiar.

⛔ **Nada foi tocado nas branches do #428 e do #429.** Este parágrafo é **declaração**, não conserto:
o `gh pr diff` é leitura, nenhum `checkout`, nenhum commit, nenhum push em branch alheia.

### 12. Réguas de saída — todas medidas nesta árvore

| Régua | Resultado |
|---|---|
| `npx vitest run` | **189 arquivos · 2.403 passed + 6 expected fail (2.409) · EXIT=0** |
| `npm run type-check` (turbo, `ai` + `web` + `shared`) | **8 successful, 8 total · 0 erros** |
| `npm run lint` | **✖ 23 problems (0 errors, 23 warnings)** — idêntico ao baseline |
| `npm run prompts:check` | **✅ `agent_prompts == snapshot` (7 slugs)** |
| `npm run db:objects:check` | **🟢 137 de 137 · EXIT=0** |

### 13. Decisões autônomas (modo YOLO)

- **[AUTO-DECISION]** Denominador da AC9: 138 (do parecer) → **140**, e o verde 135 → **137**.
  *Razão:* a subtração de buckets **por nome** perdia `pastas` e `lancamentos`, que são tabela E
  bucket. Troquei por exclusão **por dono da chamada**. Reproduzi as duas réguas antes de decidir.
- **[AUTO-DECISION]** Excluir `storage` na lista de donos em vez de subtrair 10 nomes de bucket
  depois. *Razão:* a subtração posterior é a régua que errava; a exclusão por dono é estrutural.
- **[AUTO-DECISION]** Os comentários novos **não** escrevem os três nomes enterrados. *Razão:* a AC2
  é `grep` sobre `packages/`; documentar com o nome reprovaria a própria AC. Os nomes ficam no
  histórico do git (`a60a1bc6`) e no cabeçalho do `scripts/check-db-objects.ts`, que está fora da
  população da régua.
- **[AUTO-DECISION]** O leitor de fonte da AC5 e o scanner da AC6 no **mesmo** módulo
  (`packages/shared/src/testing/source-scan.ts`). *Razão:* mesma natureza (estático sobre o texto do
  repo), dois consumidores, e a alternativa (dois módulos) não paga o arquivo a mais.
- **[AUTO-DECISION]** `findRepoRoot` reescrito em `@trifold/shared` em vez de importado de
  `packages/ai/src/prompts/snapshot.ts`. *Razão:* `shared` **não pode** depender de `ai` (a seta é a
  contrária). 5 linhas duplicadas < ciclo de pacotes. Registrado no cabeçalho do módulo.
- **[AUTO-DECISION]** M1/M2/M3 rodadas **duas vezes** (árvore vermelha e árvore verde). *Razão:* na
  árvore verde a isolação é `0 → 1`, que é estritamente melhor que `3 → 4`.

### 14. IDS — REUSE / ADAPT / CREATE

| Artefato | Decisão | Justificativa |
|---|---|---|
| `__fixtures__/fake-supabase.ts` (75-279) | **REUSE** | é o que a §"Abordagem de teste" manda usar; aplica os filtros de verdade |
| Padrão de harness `anthropicCapturando` | **ADAPT** de `pipeline-corretor-no-historico.test.ts` | mesma captura de `system`/`blocos`, sem o que a AC1 não usa |
| `extractReferencedObjects` | **REUSE** dentro da AC5 | a régua da AC5 é a mesma da AC9, aplicada a um arquivo só |
| Credencial + exit `0/1/2` do `check-db-objects.ts` | **ADAPT** de `scripts/dump-agent-prompts.ts` | precedente declarado na própria AC9; mudou a fonte (PAT de Management API, porque `supabase-js` não alcança `pg_class`) |
| `packages/shared/src/db/referenced-objects.ts` | **CREATE** | não existe extrator de objetos de banco no repo; não há `database.types.ts` gerado (conferido) |
| `packages/shared/src/testing/source-scan.ts` | **CREATE** | não existe varredura estática de fonte; e ela **precisa** morar fora do `.test.ts` (AC5/AC6) |

### 15. O que ficou FORA, por decisão escrita

- **`12.5b` (`atualizarResumoComLastro`, 87-7) intocado** — conferido no diff.
- **Nenhuma migration, nenhum DDL, nenhuma escrita em produção.** `git revert` desfaz em um comando.
- **`.single()` de `leads` não "consertado de carona"** (armadilha 5).
- **O cabeçalho do prompt não foi "melhorado"** (armadilha 1).
- **T9 e T13 são do @qa** e continuam abertas.

### 16. ✅ `[QA-7 · rodada 2]` Ratificação do `D2-(c)` — REGISTRADA

**Estado na v1.0:** *"o merge continua atrás da ratificação escrita do `D2-(c)` pelo Gabriel"*.
Escrever, implementar e testar seguiram sob a recomendação, como a §"assimetria" autoriza.

**Estado agora: a ratificação ocorreu e está registrada — `2026-08-16`.**

O @qa está certo no princípio, e ele vale mais que o desconforto de escrever isto: **palavra de
agente não é registro.** Uma autorização que só existe numa conversa não existe para quem abrir a PR
daqui a três meses — e uma story cuja tese é *"código que finge funcionar é pior que ausência"* não
pode fechar apoiada em memória de conversa. Por isso o fato vai para o **Change Log** (v1.1), que é
artefato versionado, e não só para este parágrafo.

**Teor do que foi autorizado — `D2-(c)`, `epic-87:1106`:** *"Enterrar o código morto e ficar no
`ai_summary` saneado"*, que é a **Recomendação** escrita em `epic-87:1108` (*"(c) agora + (b) na
Onda 4"*). O Gabriel ratificou **a opção (c) agora** — ou seja, exatamente o escopo desta story:
remover os 6 arquivos do MemPalace e colapsar a injeção preservando o `ai_summary` byte a byte.
**Nada além disso foi autorizado:** o `(b)` (redesenho enxuto) segue na Onda 4, e a migration `012`
segue **não** reaplicada.

**Cadeia de custódia, dita sem eufemismo (é o que o @qa cobrou):** a ratificação chegou até mim
**relatada pelo lead**, com a frase do Gabriel *"já vamos começar a 87-16"*. **Não transcrevo nada
além disso** — não invento citação literal, e não afirmo ter visto a conversa original. O que este
registro afirma é: **em 2026-08-16 a autorização foi dada e comunicada**; o artefato é esta linha e a
v1.1 do Change Log, escritas por mim (@dev) na data. Se alguém precisar da fonte primária, ela é a
conversa do dia — não há outro artefato no repositório, e é justamente por isso que esta linha existe.

**Frase pronta para o corpo da PR** (mesma substância, sem reescrita — @devops copia daqui):

> **`D2-(c)` ratificado pelo Gabriel em 2026-08-16.** A decisão `D2` do Epic 87 (`epic-87:1100-1112`)
> oferecia três caminhos para o MemPalace — (a) reaplicar a migration `012`, (b) redesenhar enxuto,
> (c) enterrar o código morto e ficar no `ai_summary` saneado. A recomendação escrita era **"(c)
> agora + (b) na Onda 4"**, e foi **(c) agora** que o Gabriel autorizou, liberando o merge desta
> story. O `(b)` permanece na Onda 4 e a migration `012` permanece **não** reaplicada. Registro em
> `docs/stories/87-16-….story.md`, Change Log v1.1 e Dev Agent Record §16.

**Consequência:** a caixa ⛔ da DoD (*"Ratificação escrita do `D2-(c)` pelo Gabriel antes do MERGE"*)
está marcada. **Este era o único item da DoD que nenhum executável podia fechar** — e continua sendo
o único fechado por registro e não por medição, o que está dito aqui de propósito.

**O que este registro NÃO faz:** não põe o selo *"✅ FECHADA"* no `D2` do corpo do `epic-87`
(`:1100`) — **corpo de epic é do @pm**, e o pedido já está na §"Pedidos ao @pm", item 9. Enquanto o
selo não for aplicado lá, o `D2` continua lendo *"Recomendação"* e não *"decidida"*, que é uma
divergência conhecida e declarada, não um esquecimento.

**Sem push e sem PR** — @devops.

### 17. Sha de valor de arquivo (T1)

O commit em que os seis arquivos removidos ainda existem é **`a60a1bc6`** (base desta branch).
É **valor de arquivo na PR** — referência de padrões no histórico do git, **não** plano de
restauração. Nenhuma AC depende dele.

### Debug Log References

Saídas brutas capturadas em `/private/tmp/.../scratchpad/`: `ac9-vermelho.txt`, `ac9-verde.txt`,
`m1.txt`/`m2.txt`/`m3.txt` (árvore vermelha), `m1-pos.txt`/`m2-pos.txt`/`m3-verde.txt` (árvore
verde), `ac4.txt`, `ac5-vermelho.txt`, `ac6-vermelho.txt`, `ac1-mutacao.txt`, `suite-final.txt`.

### File List

**Removidos (T1) — 6 arquivos, 54 testes:**

| Arquivo | Testes |
|---|---|
| `packages/ai/src/memory/loader.ts` | — |
| `packages/ai/src/memory/loader.test.ts` | 19 |
| `packages/ai/src/memory/writer.ts` | — |
| `packages/ai/src/memory/writer.test.ts` | 11 |
| `packages/ai/src/flows/memory-extraction.ts` | — |
| `packages/ai/src/flows/memory-extraction.test.ts` | 24 |

*(o diretório `packages/ai/src/memory/` deixou de existir)*

**Criados — 6 arquivos:**

| Arquivo | O que é |
|---|---|
| `packages/shared/src/db/referenced-objects.ts` | extrator da AC9 (T10) — função pura sobre texto |
| `packages/shared/src/db/referenced-objects.test.ts` | 16 testes — M1/M2/M3 como fixturas |
| `packages/shared/src/testing/source-scan.ts` | leitor de fonte + scanner da catraca (AC5/AC6) |
| `packages/shared/src/testing/zero-import.test.ts` | 11 testes — a catraca da AC6 |
| `packages/ai/src/chat/pipeline-ai-summary-no-prompt.test.ts` | 10 testes — a AC1 inteira |
| `packages/ai/src/chat/pipeline-sem-mempalace.test.ts` | 4 testes — a AC5 |
| `scripts/check-db-objects.ts` | o script fino da AC9 (T11), exit `0/1/2` |

**Modificados — 8 arquivos:**

| Arquivo | O que mudou |
|---|---|
| `packages/ai/src/chat/pipeline.ts` | 3 imports removidos; bloco `memoryContext` colapsado (string byte a byte); `12.5a` e `12.5c` removidos; cabeçalho da `12.5` reescrito. **`12.5b` intocado** |
| `packages/ai/src/flows/summary-grounding.ts` | docstring **atualizado** (AC8-b) |
| `packages/ai/src/chat/nicole-enabled.test.ts` | fixture `lead_facts: []` removida |
| `packages/ai/src/chat/pipeline-agenda-state.test.ts` | idem |
| `packages/ai/src/chat/pipeline-scheduling.test.ts` | idem |
| `packages/ai/src/chat/pipeline-corretor-no-historico.test.ts` | idem |
| `packages/ai/src/chat/pipeline-historico-cauda.test.ts` | idem |
| `package.json` | `"db:objects:check"`, ao lado do `prompts:check` |
| `packages/shared/src/db/referenced-objects.ts` | 🆕 **rodada 2 (`QA-2`)** — docstring de `ObjectReference.line` corrigido para o comportamento **medido**. **Comentário puro: zero mudança de comportamento**, nenhuma régua se moveu |

*(`docs/stories/87-16-….story.md` — este arquivo — também foi atualizado: checkboxes, Dev Agent
Record, Status e Change Log.)*

## QA Results

**Revisor:** Quinn (@qa · Test Architect) · **Data:** 2026-08-16
**Árvore:** `story/87-16-enterrar-mempalace` @ `a60a1bc6`, sem commit
**Modo:** reprodução independente — **nada herdado do Dev Agent Record**. Onde não foi possível
verificar, está escrito que não foi.

### 🟡 Veredito: **CONCERNS** → `docs/qa/gates/87.16-enterrar-o-mempalace-sem-levar-a-memoria-da-nicole-junto.yml`

Toda AC verificável neste gate foi reproduzida por mim e bateu. O CONCERNS vem de **uma higiene de
merge com três linhas em duas PRs abertas** (uma delas não declarada) e da **AC7, que é 72 h
pós-deploy e por isso não existe ainda**. Nenhum número da story foi encontrado errado; **um foi
encontrado errado no parecer do @po, e o @dev tem razão**.

---

### 1. 🔴 AC1 — a equivalência, provada com uma régua que o @dev não usou

Não me contentei com leitura de código. **Restaurei `pipeline.ts`, `memory/loader.ts`,
`memory/writer.ts` e `memory-extraction.ts` do `a60a1bc6` na árvore atual (MemPalace VIVO) e rodei
os 10 testes novos da AC1 contra o código VELHO:**

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

A mesma régua verde nos dois mundos. **Os três casos, conferidos no fonte antigo:**

| entrada | código velho | código novo |
|---|---|---|
| com resumo | `loader.ts:198` monta `MEMORIA DO LEAD (resumo):\n${resumo}`; `pipeline.ts:685` faz `join("\n\n")` com **um** elemento (identidade) e embrulha em `\n…\n\nUse essas…\n` | **string idêntica, inclusive o `(resumo)`** |
| sem resumo | `l1Snapshot=""` e `aiSummaryFallback` falsy ⇒ `:196` não arma; L2/L3 `""` ⇒ `parts=[]` ⇒ `""` | `""` |
| sem `lead_id` | bloco não roda ⇒ `""` | guarda falsa ⇒ `""` |

**Segunda régua, eixo independente — os turnos-ouro por SHA-256 da 87-5:** rodei
`pipeline-corretor-no-historico.test.ts` **contra a árvore VELHA restaurada**: `39 passed (39)`, com
os hashes `3ec9480d84…` e `d634f39ecc…` intactos. Para lead **sem** resumo o `system` inteiro saiu
byte a byte igual ao de antes da PR. **Sim, continuam verdes** — e continuam verdes nos dois lados,
que é o que dá força à prova.

#### A mutação, remedida por mim: **0 → 7**, exatamente o previsto

```
 Test Files  2 failed | 187 passed (189)
      Tests  7 failed | 2396 passed | 6 expected fail (2409)
```

#### E cinco mutações que a story não fez — **sub-expressão a sub-expressão, uma por vez**

Não mutei constante compartilhada (mascara o descoberto) nem guarda inteira (esconde
sub-expressões). Cada uma em isolamento, revertida antes da seguinte; `sha256` do `pipeline.ts`
conferido idêntico no fim.

| # | mutação | vermelhos | leitura |
|---|---|---|---|
| **A** | `(resumo)` → `(informacoes de conversas anteriores)` | **6** | a regressão do Risco 2 tem vermelho dedicado |
| **B** | remover `conversation?.lead_id &&` da guarda | **0** | 🟡 **MUTANTE EQUIVALENTE, declarado** — ver abaixo |
| **C** | remover o `\n` **final** do bloco | **1** | |
| **D** | remover o `\n` **inicial** do bloco | **1** | |
| **E** | `\n\n` antes da instrução vira `\n` | **2** | |

**Sobre a B, e digo com todas as letras que é equivalente e NÃO uma guarda órfã:** `currentSummary`
é declarado `null` e **só** é atribuído dentro do `if (conversation?.lead_id)` de
`pipeline.ts:646-657`. A meia-guarda é logicamente inalcançável. A story declara a redundância como
legibilidade e **está certa**. Conto-a como mutante equivalente em vez de fingir que achei um
descoberto.

⇒ **Cada perturbação de UM byte da string acende ao menos um vermelho.** "Byte a byte" aqui é
propriedade medida, não figura de linguagem.

---

### 2. 🔴 A ordem era AC — confirmada pela evidência colada, não pela afirmação

Contei os arquivos de produção em `a60a1bc6` sob a **mesma regra do script**
(`packages/{ai,web,shared}/src` menos `*.test.ts(x)`, `__fixtures__/`, `__mocks__/`): **971**.

```
vermelho colado: população 972 = 971 (base, MemPalace VIVO) + 1  (referenced-objects.ts, da T10)
                 e 972 SÓ fecha se source-scan.ts (AC5/AC6) ainda NÃO existisse — e não existia
verde    colado: população 970 = 971 − 3 (loader/writer/memory-extraction) + 2 (os dois módulos)
sítios:          1742 − 1735 = 7, exatamente os 7 sítios dos 3 objetos enterrados
```

**As duas saídas são internamente consistentes SOMENTE com `packages/` intocado no momento do
vermelho.** A ordem está confirmada por aritmética da própria evidência. Não precisei acreditar.

---

### 3. 🔴 O achado do @dev que corrige o parecer do @po — **reproduzido, e ele está certo**

`docs/qa/po-validation-87-16-ac9.md:28` diz textualmente *"125 nomes − 10 buckets = 115"*.
**Subtração PELO NOME.** Medi os dois nomes em disputa:

```sql
-- produção dsopqkqjkmhytudaaolv, somente SELECT
to_regclass('public.pastas')       → pastas
to_regclass('public.lancamentos')  → lancamentos
```

E são consultadas por cliente de **banco**, não de storage:

```
packages/web/src/app/api/pasta/[token]/route.ts:14        admin.from("pastas")
packages/web/src/app/api/lancamentos/[id]/route.ts:15     admin.from("lancamentos")
```

Ambas aparecem na lista verde do `--verbose` de hoje. ⇒ **subtrair por nome apagava duas tabelas
reais em silêncio — o modo de falha exato que a AC9 existe para pegar.** A exclusão por **dono da
chamada** é estruturalmente correta e deixa a régua **mais coberta**. **`125 − 8 = 117`, e o
denominador é 140/137. O parecer do @po tem um defeito da mesma classe que a story combate.**

---

### 4. As duas desconfianças de instrumento — medidas em produção

```
information_schema.tables (public)          122
pg_class (relkind r,v,m,p,f) (public)       123
meta_campaign_roas → relkind                'm'   (materialized view)
meta_campaign_roas em information_schema      0
lead_facts / lead_memories → to_regclass    null / null
match_lead_memory → pg_proc                   0 procs
```

✅ O script usa `to_regclass`/`pg_class` e **nunca** `information_schema` — conferido na leitura do
diff. **`meta_campaign_roas` sai VERDE entre os 137**, não vira falso ausente. Uma régua por
`information_schema` nasceria com 1 falso vermelho.

**As três mutações da AC9, remedidas por mim com literais PRÓPRIOS (diferentes dos do @dev), cada
uma em arquivo próprio, revertida antes da seguinte:**

| # | mutação | previsto | medido |
|---|---|---|---|
| **M1** | `.from("tabela_qa_87_16_inexistente")` | +1 | **116 rel + 22 RPC = 138 · 1 reprovado · `EXIT=1`** ✅ |
| **M2** | `.rpc(` ⏎ `"rpc_qa_87_16_inexistente"` | +1 | **115 rel + 23 RPC = 138 · o `+1` caiu no lado RPC · `EXIT=1`** ✅ |
| **M3** | `Buffer.from("tabela_qa_m3_87_16")` | **+0** | **115 + 22 = 137 alvos INALTERADOS · `EXIT=0`** ✅ |

---

### 5. Réguas de saída — todas medidas por mim nesta árvore

| Régua | Resultado |
|---|---|
| `npx vitest run` | **189 arquivos · 2.403 passed + 6 expected fail (2.409) · EXIT=0** |
| `turbo type-check --force` (`ai`+`web`+`shared`) | **8 successful, 8 total · 0 erros** |
| `turbo lint --force` | **✖ 23 problems (0 errors, 23 warnings)** — idêntico ao baseline |
| `npm run prompts:check` | **✅ `agent_prompts == snapshot` (7 slugs)** — gate permanente da 87-1 AC7-(ii) |
| `npm run db:objects:check` (**T13**) | **🟢 137 de 137 · EXIT=0** |
| AC2 `grep` em `packages/` | **0** |
| AC8-b `grep` em `packages/` | **0** (hoje — ver QA-1) |

**As demais ACs, reproduzidas:** **AC3** — restaurei os 3 arquivos removidos e rodei:
`54 passed (54)` pelo executor. **AC4** — `loader.test.ts` sem `loader.ts`: `19 passed (19)`, e
`grep` de imports de projeto no arquivo ⇒ **0**. **AC5** — contra a árvore VELHA: **3 de 4
vermelhos**. **AC6** — controle positivo MEU: sonda com `it("noop")` que **passa** e zero imports do
projeto ⇒ a catraca acendeu (`1 de 190`, nomeando o arquivo) e o `noop` passou; sonda removida ⇒
`11 passed`. O vermelho vem da catraca, não do coletor do vitest.

**Escopo:** `12.5b` intocado (`git diff a60a1bc6 -- flows/lead-memory.ts` ⇒ **0 linhas**;
`shouldRunHaiku = (msgCount ?? 0) % 5 === 0` segue em `pipeline.ts:1660`). As 5 remoções de
`lead_facts: []` são de **uma linha cada**, sem carona; **nenhum hash-ouro foi reescrito**.
**Produção: só `SELECT` sobre catálogo. Nenhum DDL, nenhum INSERT/UPDATE, em ambiente nenhum.**
Árvore restaurada — `git status --short` idêntico ao inicial depois de **12 mutações**, `stash@{0}`
de outro agente preservado, sem commit e sem push.

---

### 6. Achados

| # | Sev | Achado |
|---|---|---|
| **QA-1** | **medium** | 🔴 **Três linhas em DUAS PRs abertas reprovam as réguas desta story, e uma não está declarada.** (a) `#428` `chat/pipeline-collected-data.test.ts:160` — `lead_facts: []` ⇒ AC2 vira 1 *(previsto na T3)*; (b) `#428` `prompts/collected-data.ts:50` — cita `memory/loader.ts` ⇒ AC8-b vira 1 *(declarado no §11)*; (c) 🔴 **`#429` `flows/handoff.ts:258` — `` (`memory/loader.ts:196-203`) ``, também reprova a AC8-b, e NÃO está declarado em lugar nenhum.** O aviso do @dev contava uma PR e são duas. **Conserta quem mergear por último** — e com a fila `#428 → #429` e o merge desta atrás do `D2-(c)`, é provável que seja esta. Gatilho mecânico no rebase: os dois `grep` ⇒ 0 |
| **QA-2** | low | `ObjectReference.line` (`shared/src/db/referenced-objects.ts:51`) está documentado como *"início do literal"* mas reporta o início da **chamada** — por isso a saída diz `loader.ts:54`/`pipeline.ts:1646` e a §AC9-(D) previa `:55`/`:1647`. Conferido contra `a60a1bc6`: o `.from(` está em `:1647`, o `await supabase` em `:1646`. O **comportamento** está bom; o **docstring** está errado, numa story cuja tese é *"docstring que mente cria a próxima crença"* |
| **QA-3** | low | Os nomes proibidos da AC5 montados por `join`: **julguei, e é solução — não disfarce.** A asserção compara a saída REAL do extrator; o motivo está no cabeçalho do arquivo (linhas 11-16); e os três literais **sobrevivem em texto plano** em `scripts/check-db-objects.ts:6-7`, fora da população da régua — `grep -rn "lead_facts" .` na raiz ainda acha um lugar canônico. **Custo residual real:** um retorno escrito com `join` em código de produção passaria pelo `grep`. A defesa nesse caso não é a AC2 nem a AC5 — é o `db:objects:check`, que afirma o **objeto**, não a string |
| **QA-4** | low | `scripts/check-db-objects.ts` **não é coberto por `npm run type-check`** (turbo roda `tsc` por pacote; o `tsconfig.json` da raiz não está ligado a script nenhum). Pré-existente — o `dump-agent-prompts.ts` tem o mesmo buraco. Backlog |
| **QA-5** | low | `shared/src/testing/source-scan.ts` é módulo em caminho de produção cujos únicos consumidores são testes — mesma espécie dos `__fixtures__/` que a AC8-a teve de excluir, em outra pasta. Inócuo hoje (o barrel `shared/src/index.ts` **não** o reexporta, então `node:fs` não entra no bundle do web — conferido). Registrar a exceção se a AC8-a for reusada em `shared`. Junto: `@trifold/shared/src/...` é import profundo **novo** no repo |
| **QA-6** | low | ⚠️ **AC7 (T9) está ABERTA e NÃO é verificável neste gate, por natureza** — pede 72 h pós-deploy, que não aconteceu. Escrevo que não é verificável em vez de dá-la por satisfeita. Fica comigo, com a régua já escrita (`metadata is null or metadata = '{}'`, baseline 476/30 d, publicar os **dois** números). **Amostra sem efeito visível é INCONCLUSIVA, não "sem efeito"** |
| **QA-7** | low | A **ratificação escrita do `D2-(c)`** não está registrada em lugar nenhum do repositório — a caixa da DoD segue aberta e o §16 do Dev Agent Record ainda a declara viva. Fui informado pelo lead de que já ocorreu; **informação de agente não é o registro.** Registrar a linha do Gabriel no Change Log ou na descrição da PR antes do merge |

---

### 7. O que NÃO consegui verificar, dito sem eufemismo

- **AC7 / T9** — 72 h pós-deploy. Não existe ainda. Não é "satisfeita"; é **aberta**.
- **AC8-a (0 órfãos entre os 39 módulos de produção de `packages/ai/src`)** — aceito sob a exceção
  escrita de `__fixtures__`/`__mocks__`, mas **não re-varri módulo a módulo**. Declaro como
  herdado, não como reproduzido.
- **A ratificação do `D2-(c)`** — não há artefato no repo para eu conferir.

**Gate: CONCERNS** → `docs/qa/gates/87.16-enterrar-o-mempalace-sem-levar-a-memoria-da-nicole-junto.yml`
**Status recomendado:** `Ready for Done` **após** (1) o `D2-(c)` registrado, (2) o **QA-1** tratado
no rebase e (3) a **T9** publicada nas 72 h pós-deploy.

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-16 | 1.1 | **Rodada 2 — os dois itens `medium` do gate CONCERNS fechados. Rodada de REGISTRO: nenhuma linha de comportamento mudou, nenhum arquivo de `packages/` foi tocado, e nenhuma régua se moveu (reconferidas ao fim, idênticas).** 🔴 **(1) `QA-7` — a ratificação do `D2-(c)` agora existe como artefato versionado, e não como memória de conversa.** O @qa está certo e o princípio vale mais que o desconforto: **palavra de agente não é registro**. **O Gabriel ratificou o `D2-(c)` em `2026-08-16`** — a opção **(c)** da decisão `D2` do Epic 87 (`epic-87:1106`: *"Enterrar o código morto e ficar no `ai_summary` saneado"*), que é a **Recomendação** escrita em `epic-87:1108` (*"(c) agora + (b) na Onda 4"*). **Autorizado exatamente o escopo desta story** — remover os 6 arquivos do MemPalace e colapsar a injeção preservando o `ai_summary` byte a byte — e **nada além**: o `(b)` (redesenho enxuto) segue na Onda 4 e a migration `012` segue **não** reaplicada. **Cadeia de custódia declarada sem eufemismo:** a ratificação chegou **relatada pelo lead**, com a frase do Gabriel *"já vamos começar a 87-16"*; **não transcrevo nada além disso** e não afirmo ter visto a conversa original. O que este registro afirma é que **em 2026-08-16 a autorização foi dada e comunicada**, e o artefato é esta linha — não há outro no repositório, que é precisamente o motivo de ela existir. A caixa ⛔ da DoD foi marcada (**o único item que nenhum executável podia fechar**, e o único fechado por registro e não por medição — dito de propósito). Frase pronta para o corpo da PR no **Dev Agent Record §16**. ⚠️ **O selo `✅ FECHADA` no `D2` do corpo do `epic-87:1100` NÃO foi aplicado — corpo de epic é do @pm** (pedido 9 já registrado); enquanto não for, o `D2` segue lendo *"Recomendação"*, divergência conhecida e declarada. 🔴 **(2) `QA-1` — eu tinha declarado UMA PR e são DUAS; UMA linha das três não estava em lugar nenhum.** Extraí as três do `gh pr diff` mapeando cada hunk ao arquivo e à **linha pós-merge** (`awk` sobre `+++ b/` e `@@`, contando só adições sob `packages/`), não por leitura: **(a) `#428` (87-11) `packages/ai/src/chat/pipeline-collected-data.test.ts:160`** — `lead_facts: [],`, reprova a **AC2**, estava previsto na T3; **(b) `#428` `packages/ai/src/prompts/collected-data.ts:50`** — ``→ `memory/loader.ts` → prompt)``, reprova a **AC8-b**, estava no §11-(b); **(c) 🔴 `#429` (87-12 bloco A) `packages/ai/src/flows/handoff.ts:258`** — ``(`memory/loader.ts:196-203`)``, reprova a **AC8-b**, **NÃO estava declarada em lugar nenhum**. **Alcance conferido:** as outras 5 ocorrências de `memory/loader` no #429 estão em `docs/stories/87-12-….story.md`, **fora da população** das réguas (que é `packages/`); só a `handoff.ts:258` morde, e ela é **docstring de módulo de produção** — a espécie exata que a AC8-b existe para não deixar mentindo. `pipeline.ts:37-38` aparece no #428 como **linha de contexto**, não adição: é o `origin/main` que esta branch já apaga, o merge resolve sozinho, não entra na lista. **Quem conserta é quem mergear por ÚLTIMO**, e pela fila (`#428` criada `2026-08-16T17:37:38Z` → `#429` `2026-08-16T18:37:52Z` → esta, ainda **sem PR**) o provável é **esta story**; o critério é a **posição na fila**, não o número da story. **Conserto de cada uma escrito no §11.1:** (a) apagar a fixture (1 linha, sem carona); (b) e (c) **atualizar o docstring, não apagar** — o precedente é o `summary-grounding.ts:9` desta mesma PR. 🔴 **E uma precisão que muda o gatilho mecânico: use `git grep`, não `grep -rn`.** Medido nesta árvore: `grep -rn` devolve **6** e **1**, e **todas** as ocorrências são de `packages/web/.next/server/chunks/…` (build local, gitignored); `git grep -- packages/` devolve **0** e **0**. A régua por `grep -rn` **nasce vermelha em qualquer máquina que tenha rodado `next build`** — falso vermelho é como controle vira ruído, a mesma lição que a AC9 usa para recusar `information_schema`. ⛔ **Nada tocado nas branches do #428/#429:** `gh pr diff` é leitura — nenhum `checkout`, nenhum commit, nenhum push em branch alheia. **Fora desta rodada, por decisão do gate e escrito para não parecer esquecimento:** **`QA-6` (AC7/T9, 72 h pós-deploy)** continua **ABERTA e não verificável agora** — o @qa escreveu isso corretamente e eu não forço; **`AC8-a`** continua **herdada, não re-varrida**, e não é minha para fechar nesta rodada; **`QA-4`/`QA-5`** seguem como backlog declarado. ✅ **`QA-2` (baixo, opcional) — feito, porque é uma linha e é a tese da própria story.** O docstring de `ObjectReference.line` (`packages/shared/src/db/referenced-objects.ts`) dizia *"Linha 1-based do início do literal"* e o campo reporta o **início do MATCH** — foi o que produziu o ±1 entre a saída vermelha (`loader.ts:54`/`:105`, `pipeline.ts:1646`/`:1655`) e a previsão da §AC9-(D) (`:55`/`:106`, `:1647`/`:1656`). **Medido com sonda própria, e são DOIS mecanismos com o mesmo sintoma:** no `.from(` o recuo vai até o **dono** da cadeia (`await supabase`, porque o `FROM_RE` tem grupo de dono — o mesmo que barra `Buffer.from` na M3); no `.rpc(` não há grupo de dono, então o recuo vai só até o `.rpc(`. Numa linha só, coincidem. Um docstring dizendo *"linha do dono"* seria a **próxima** meia-verdade, então o texto novo descreve os dois casos. **O comportamento NÃO mudou** (apontar o statement é o que o humano quer) — é comentário puro, e o ±1 está reconciliado no Dev Agent Record §2 com as três medições coladas. 🔴 **E o conserto óbvio dele reprovou a AC2 E a AC9 — quarta ocorrência da família "a régua varre a si mesma", desta vez comigo de vítima, num item `low` que o gate chamou de «uma linha».** Escrevi o exemplo transcrito (`` `.from("lead_facts")` ``) dentro do comentário; o extrator é **regex sobre o texto** e não sabe o que é comentário, e `referenced-objects.ts` está na **população de produção** ⇒ `db:objects:check` foi a `138 alvos, 1 reprovado, EXIT=1`, apontando `referenced-objects.ts:54`, e o `git grep` da AC2 foi a 1. **Um objeto que só existia em prosa deixou a régua vermelha, e o gate pegou o que eu não teria pego por leitura** — a v1.0 já tinha isso escrito como `[AUTO-DECISION]` e eu reincidi na rodada seguinte. **Remédio:** os exemplos passaram a ser **descritos, não transcritos**, e a armadilha ficou registrada **dentro do próprio docstring** com o número medido e a proibição explícita de auto-exceção na população (Armadilha 3 / Risco 8). Saída bruta das duas execuções colada no §2. **Réguas reconferidas ao fim da rodada, todas idênticas às da v1.0:** `vitest` **189 · 2.403 passed + 6 expected fail (2.409)** · `type-check` **8/8, 0 erros** · `lint` **0 errors / 23 warnings** · `prompts:check` ✅ · `db:objects:check` 🟢 **137/137, EXIT=0**. **Sem push, sem PR, sem banco, sem migration.** | @dev (Dex) |
| 2026-08-16 | 1.0 | **Implementada pelo @dev (Dex) — `Ready` → `Ready for Review`.** Branch `story/87-16-enterrar-mempalace`, cortada de `origin/main` `a60a1bc6`. **Sem push, sem PR, sem migration, sem DDL; só `SELECT` sobre catálogo em produção.** 🔴 **A ORDEM foi cumprida como AC:** `T10 → T11 → T12 vermelha → T4 (testes AC1 verdes no código VELHO) → T1/T2/T3 → T12 verde`. `packages/` estava intocado quando o vermelho saiu — **não precisou de `git worktree`**, e a árvore está declarada em cada saída colada. **Régua da árvore re-medida por mim ANTES de tocar em nada: `188 arquivos / 2.416 passed + 6 expected fail (2.422)`** — o briefing dizia 2.411 e a story 190/2.450 (árvore suja). Todos os números são contra `188 / 2.422`. 🔴 **CORREÇÃO DE DENOMINADOR DA AC9, medida nas duas réguas: são `117 relações + 23 RPCs = 140`, não 138 — e a diferença é um DEFEITO da régua antiga, não divergência de árvore.** Reproduzi o ponto de partida do @po ao número (**125 nomes + 23 RPCs**); o que diverge é a subtração dos buckets. O parecer subtraía **10 buckets PELO NOME**, e **dois desses nomes são bucket E tabela** — `pastas` (14 sítios, `api/pasta/[token]/route.ts:14`) e `lancamentos` (6 sítios, `api/lancamentos/[id]/route.ts:15`). Subtrair por nome **apagava duas tabelas reais em silêncio**, que é exatamente o modo de falha que a AC9 existe para não repetir. Aqui a exclusão é por **DONO da chamada** (`storage.from(...)` fora, `supabase.from(...)` dentro) ⇒ `125 − 8 nomes exclusivos de bucket = 117`. **O verde vira `137 de 137`, não 135 de 135.** População: 1.163 arquivos → **972 de produção** (a regra tira `*.test.ts(x)` **e** `__fixtures__/` **e** `__mocks__/`; a story dizia 974 porque tirava só os testes). **Custo em alvos: ZERO.** ✅ **AC9 vermelha, ANTES do enterro:** `EXIT=1`, **3 de 140**, os **7 sítios de produção** nomeados com `arquivo:linha`, e os **2 sítios dinâmicos** de produção apareceram pela régua, não por lista à mão. ✅ **AC9 verde, DEPOIS:** `EXIT=0`, **137 de 137**, com `meta_campaign_roas` (matview, `relkind='m'`) entre os verdes — a régua usa `to_regclass`/`pg_class`, nunca `information_schema`. ✅ **As três mutações isoladas, cada uma em arquivo próprio e revertida antes da seguinte, rodadas DUAS vezes (árvore vermelha e árvore verde):** **M1 ⇒ +1** (`0 → 1` na árvore verde), **M2 ⇒ +1 e o `+1` cai no lado RPC** (a régua por LINHA acha ZERO no mesmo trecho — medido também dentro da suíte), **M3 ⇒ +0, `EXIT=0`, alvos inalterados e o literal `tabela_m3_87_16` não aparece em lugar nenhum**. M1 e M3 com **literais diferentes**, como o @po exigiu. 🔴 **AC1 — a mutação saiu de 0 para 7 vermelhos** (declarei 7 antes de rodar; a AC exigia ≥3). **E a equivalência foi provada nos dois sentidos, com duas réguas independentes:** (a) os 10 testes da AC1 foram escritos ANTES da T2 e passam **contra o código VELHO** e contra o novo — a mesma régua medindo os dois mundos; (b) os **turnos-ouro por SHA-256** da 87-5 continuam verdes (`3ec9480d…` / `d634f39e…`), ou seja para lead **sem** resumo o prompt saiu **byte a byte idêntico ao de antes da PR**. Mais a asserção `comResumo.replace(BLOCO,"") === semResumo`, que é subtração pura por construção. ✅ **AC4 reproduzida (não copiada):** branch descartável, `loader.ts` apagado, **19 verdes** — e a branch foi apagada. ✅ **AC5 vista VERMELHA no arquivo real**, nomeando `lead_facts @ packages/ai/src/chat/pipeline.ts:1654`. ✅ **AC6 vista VERMELHA com sonda cujo `it(...)` PASSA** (`1 de 189`; 11+1 testes, 1 falho — o único vermelho é o da catraca). **Denominador da catraca hoje: `0 de 188`.** 🔴 **Terceira ocorrência da família 'a régua varre a si mesma', e ela mordeu duas vezes MAIS do que a story previa:** além do scanner da AC6 e do leitor da AC5 (os dois em módulo importável, nunca auto-exceção), **a AC2 é uma régua de `grep` sobre `packages/`** — então **o teste de ausência da AC5 e todos os comentários novos** teriam reprovado a AC2 só por escrever os nomes enterrados. Remédio: os nomes proibidos são **montados por `join`**, e os comentários do `pipeline.ts`, do extrator e dos dois arquivos de teste foram reescritos sem as três palavras. `grep` da AC2 ⇒ **0**; `grep` da AC8-b ⇒ **0**. ✅ **AC3 reconciliada, declarada antes:** `2.422 − 54 + 41 = 2.409` e `188 − 3 + 4 = 189`; medido **`189 passed (189)` / `2403 passed | 6 expected fail (2409)`**. Bate nas duas dimensões, zero vermelhos na remoção. ⚠️ **AC2 — a `87-11` NÃO mergeou**, então valeram **5** fixturas `lead_facts: []`, não 6; o comentário de cabeçalho da `12.5` (achado do @po) foi **reescrito, não apagado**. ⚠️ **AC8-b — só 1 dos 2 docstrings existe nesta árvore**: `summary-grounding.ts:9` atualizado; o de `prompts/collected-data.ts:50` **chega com a `87-11`**, e quando ela mergear vai trazer um caminho que deixou de existir e **reprovar as réguas de `grep` desta story** — aviso registrado para quem mergear por último. ✅ **AC8-a: 39 módulos de produção em `packages/ai/src`, 0 órfãos** (`index.ts` é o entry point do pacote, consumido por 30 arquivos de `packages/web` via `@trifold/ai`). **Réguas de saída:** `vitest` 189/2.409 verde · `type-check` 8/8, 0 erros · `lint` **0 errors / 23 warnings** (idêntico ao baseline) · `prompts:check` ✅ · `db:objects:check` 🟢 137/137. **`12.5b` (87-7) intocado, conferido no diff.** ⛔ **O merge continua atrás da ratificação escrita do `D2-(c)` pelo Gabriel** — a implementação não muda isso. **T9 e T13 seguem abertas, são do @qa.** | @dev (Dex) |
| 2026-08-16 | 0.4 | **Validação da AC9 (escopo acrescentado depois do GO) — VEREDITO: 🟢 GO.** Parecer em `docs/qa/po-validation-87-16-ac9.md`. **T10–T13 destravadas; AC1–AC8 confirmadas intocadas** (`diff` contra `735f40a8`: puramente aditivo, exceto 3 linhas — "Esforço", a linha `AC1–AC8` da DoD e o Achado 1). ✅ **Reproduzi a AC9 inteira e ela bate ao número:** população **1.162** arquivos; régua por arquivo + exclusão de dono ⇒ **125 nomes − 10 buckets = 115 relações + 23 RPCs = 138**; regex **por linha** dá **19** RPCs e perde **exatamente** as 4 multilinhas nomeadas (`get_analytics_summary`, `get_system_events_summary`, `get_whatsapp_cost_summary`, `get_whatsapp_volume_summary`); **M1 ⇒ +1**, **M2 ⇒ por arquivo acha, por linha acha ZERO** (a mutação separa mesmo as duas granularidades), **M3 ⇒ +0 verde com exclusão, falso positivo sem ela**. **Vermelho contra produção conferido: exatamente 3 de 138 ausentes** (`lead_facts`, `lead_memories`, `match_lead_memory`), **7 sítios**, **0 de 113 relações sem `SELECT` p/ `service_role`**. **Os dois achados de instrumento estão certos:** `information_schema` = **122** × `pg_class` = **123**, `meta_campaign_roas` é `relkind='m'` e o `information_schema` **não a vê** — e `epic-87:177` de fato a lista como *"faltando"*, ou seja **o achado antigo do épico era falso positivo de instrumento**; `schema_migrations` tem **120 linhas**, última `20260710171933`, com a `012` **registrada** e as `217…230` **aplicadas e não registradas** (251 migrations no repo, maior prefixo **230**). Apodrecimento da lista à mão reproduzido com régua própria: **60 → 135** objetos em 90 dias, arquivos **396 → 1.172**, migrations **53 → 251**. Ponto cego reproduzido: **14 storage + 2 de produção** (`api-utils.ts:35` `softDelete`, `fvs/page.tsx:20`), e **os 7 nomes que passam por eles entram na lista por sítio literal — conferido nome a nome**. Ordem vermelho→verde conferida em **três** lugares (AC9-D, DoD, Armadilha 12): **só a verde não satisfaz**. 🔴 **DOIS defeitos novos, medidos e corrigidos por mim no corpo (`[@po 16/08 · AC9]`): (a) a T10 envenena a T11.** Os **188 `.test.ts` estão dentro dos 1.162** e **1 nome real já entra por teste hoje** (`agent_prompt_versions`); a fixture da **M1 é, por construção, um nome que o extrator TEM de colher e que a produção TEM de não ter** ⇒ `EXIT=1` permanente na primeira execução. Reproduzido: o extrator sobre a própria `referenced-objects.test.ts` colhe `tabela_fixture_a`. É o **Risco 11 realizado pela própria story**, e a saída fácil é a **auto-exceção** que a Armadilha 3 e o Risco 8 já proíbem — **3ª ocorrência da mesma classe na mesma PR**. Remédio por **regra**: população varrida = só produção. **Custo medido ZERO — 1.162 → 974 arquivos e os alvos continuam 138.** **(b) O ⛔ da própria story tornava o vermelho irreproduzível:** a DoD liberava T1–T9 e travava T10–T13, mas a T12 exige o vermelho **antes** da T1/T2 — fazer o enterro primeiro apaga os 3 objetos do código e o check dá **verde por ausência de alvo**. **A ordem virou AC** (`T10 → T11 → T12 vermelha → T1/T2 → T12 verde`) com fallback por `git worktree` e árvore declarada na saída. *(Conferido: `packages/` intocado, o vermelho ainda está disponível.)* ⚠️ **Precisão:** M1 e M3 usavam **o mesmo literal** — se a isolação escorregar os conjuntos colapsam e a M3 sai verde sem provar nada; **M3 ganhou nome próprio**. **Risco 10 julgado suficiente, com aperto:** a AC9 **nasce vermelha sobre defeito real**, o que é qualitativamente diferente dos cinco controles mortos da `87-0` e do M7 do `prompts:check` — um controle já visto disparando não embarca como decoração. Track record conferido: `prompts:check` está nos gates de **87.1, 87.11, 87.12, 87.13** — e **não** no de **87.14**. Por isso o **gatilho** do gate novo passa a ser greppável (`diff` toca `supabase/migrations/` **ou** altera `.from("…")`/`.rpc("…")`), pedido 10 ao @pm. **Acrescentados:** Riscos 13 e 14, ordem de execução na T12, exclusão de população na T11, nome próprio da M3, aperto do gatilho no pedido 10. ⛔ **A ratificação do `D2-(c)` pelo Gabriel continua sendo condição de MERGE** — a AC9 não muda isso. | @po (Pax) |
| 2026-08-16 | 0.3 | 🆕 **AC9 acrescentada — adição de escopo a story já validada, por isso passa por mim e volta ao @po, não vai direto ao @dev. AC1–AC8 intocadas** (a AC1 em especial, que é o bloqueante do parecer: o `ai_summary` em 59,3 % dos turnos), e a assimetria do `D2-(c)` também fica de pé. **O que a AC9 garante:** que o código nunca mais rode contra objeto de banco que não existe — a classe de falha que manteve o MemPalace vivo 4 meses (`to_regclass` = `null`, suíte verde). 🔴 **A forma óbvia foi descartada com medição, não por gosto:** *"migrations do repo × migrations registradas"* dá falso positivo em tudo aqui — a última entrada de `supabase_migrations.schema_migrations` é `20260710171933` (10/07) e as `217…230` foram aplicadas por **SQL cru na Management API**, que não registra. **A AC9 afirma o OBJETO, não a migration.** **(1) De onde sai a lista — contei as duas antes de escolher.** Extração estática de `.from("…")`/`.rpc("…")` sobre **1.162 arquivos** `.ts/.tsx` de `packages/{ai,web,shared}/src` ⇒ **115 relações + 23 RPCs = 138 objetos**. Lista à mão **rejeitada por apodrecimento medido**: objetos distintos em `origin/main` = **143** contra **63** em `10d18a2a` (15/05) — **+80 em 90 dias**, com arquivos de **389 → 1.162** e migrations de **54 → 252**; são ~**27 entradas novas/mês** a manter à mão. Não há atalho: **não existe `database.types.ts` gerado** neste repo. 🔴 **E o falso negativo da extração é real e foi medido — é o erro do @po na varredura de zero-import outra vez, do mesmo lado:** regex **por linha** acha **19** RPCs e **perde 4 de 23 (17,4 %)** — `get_analytics_summary`, `get_system_events_summary`, `get_whatsapp_cost_summary`, `get_whatsapp_volume_summary`, todas escritas em **multilinha**. Regex por arquivo **sem excluir o dono** colhe **2 nomes falsos**, todos `Buffer.from` (3 sítios: `arte-cta.test.ts:207`, `arte-logo.test.ts:136`, `sienge/client.ts:31`). A régua da AC9 é **por arquivo + exclusão de `Array\|Buffer\|Object\|…`** ⇒ **138**. **Ponto cego declarado, não escondido:** **19** sítios `.from(` não-literal — classifiquei um a um: **14** storage, **3** teste/comentário, **2** tabela vinda de variável em produção (`lib/api-utils.ts:36` no `softDelete`, `dashboard/fvs/page.tsx:20`). **Custo hoje 0 de 138** — os 7 nomes que passam por ali já entram por outro sítio literal, conferido nome a nome. Os **10 buckets de storage** ficam **fora da população** por decisão escrita (outro catálogo). **(2) Onde roda e quem roda — e eu digo com todas as letras que é DONO HUMANO, não mecanismo.** Precisa de credencial de produção ⇒ não é `vitest` puro. Precedente: `prompts:check` (`dump-agent-prompts.ts`, exit 0/1/2), **cuja limitação está registrada** — M7 do seu parecer da `87-1`: *"o script funciona e ninguém roda"*, resolvida pela AC7-(ii) *"o @qa roda no gate"*. **O que sustenta isso não é esperança, é track record: `87-11`, `87-12` e `87-13` publicaram `prompts:check` verde no gate, três stories seguidas.** Duas camadas: o **extrator** vai para módulo importável com testes e roda em `pnpm test` **sem credencial** (metade da régua tem consumidor automático desde o dia 1, e a AC6 da mesma PR o obriga a ser importado); o **script fino** afirma contra produção com **uma consulta somente-leitura**. 🔴 **`to_regclass`/`pg_class`, NUNCA `information_schema.tables`** — medido: `information_schema` vê **122** objetos e **não vê `meta_campaign_roas`** (matview, `relkind='m'`, consultada em `meta-ads/campaigns/[campaign_id]/route.ts:398`); `pg_class` vê **123**. A régua errada nasceria com **1 falso vermelho**, e falso vermelho é como controle vira ruído. **(3) Como falha: ruidosamente.** `exit 1` nomeia cada objeto ausente **com todos os `arquivo:linha`**; `exit 2` para credencial/rede/consulta **e para lista de alvos vazia**; **nunca `exit 0`**. **`if (error) return ""` / `return []` / `catch {}` reprova a AC na leitura do diff** — é literalmente o defeito que a story enterra. 🔴 **(4) O vermelho demonstrável, que é o que separa esta AC do sexto controle morto desta casa.** *(A `87-0` teve de escrever `config-surfaces.test.ts` porque **cinco** controles do painel não faziam nada.)* **Rodei a régua da AC9 contra produção hoje, na árvore com o MemPalace ainda vivo:** `115 relações → 2 inexistentes` (`lead_facts`, `lead_memories`), `23 RPCs → 1 inexistente` (`match_lead_memory`) ⇒ **3 de 138 (2,2 %)**, com **7 sítios de produção** (`loader.ts:55/:106/:154`, `pipeline.ts:1647/:1656/:1666`, `writer.ts:130`). **A AC exige as DUAS saídas na ordem: vermelha ANTES da T1/T2 (`EXIT=1`) e verde depois (`EXIT=0`, 135 de 135).** Se ela nascer verde porque o enterro já aconteceu, é a régua que já nasce satisfeita e não prova nada. **(5) Mutação isolada com contagem declarada antes** — a lição da rodada 2 da `87-12` (constante compartilhada acende vários sítios; guarda inteira esconde sub-expressões): **M1** literal de 1 linha ⇒ **+1**; **M2** `.rpc(` **multilinha** ⇒ **+1**, e é ela que separa a régua por arquivo da régua por linha (sem M2, um extrator por linha passa e perde 4 RPCs reais em silêncio); **M3** `Buffer.from(...)` ⇒ **+0, tem de sair VERDE** (falso positivo). Controle negativo: os 135 que existem, **`meta_campaign_roas` entre eles**. Eixo de privilégio medido e sem falso vermelho: **0 de 113** relações sem `SELECT` p/ `service_role`, **0 de 22** RPCs sem `EXECUTE`. **Ponto cego #2 declarado no cabeçalho do script:** a AC9 afirma catálogo + grant, **não** a exposição do PostgREST (`db-schemas`). ✅ **Correção de fato no Achado 1, medida:** *"a view `meta_campaign_roas` continua sem dono"* **é falso** — ela existe como matview; quem não a via era a régua de auditoria (`information_schema`), que é justamente a que a AC9 proíbe. O que sobra do achado é a `012` mal registrada, **mais o sentido inverso que ninguém tinha escrito**: as `217…230` existem e **não** estão registradas. **Acrescentados:** AC9, T10–T13, armadilhas 9–12, Riscos 10/11/12, 4 linhas de DoD, pedidos 10 e 11 ao @pm (gate gêmeo do `prompts:check`; `W0-2` precisa da metade pré-deploy) e pedido 12 ao @po. ⛔ **O @dev não começa T10–T13 antes do retorno do @po; T1–T9 podem seguir.** Nenhuma linha de código escrita — só leitura de produção com `SELECT` sobre catálogo. | @sm (River) |
| 2026-08-16 | 0.2 | **Validação @po (`*validate-story-draft`) — VEREDITO: 🟢 GO condicional. `Draft` → `Ready`.** Parecer em `docs/qa/po-validation-87-16.md`. ⛔ **A condição não é de escrita nem de implementação: é o MERGE atrás da ratificação escrita do `D2-(c)` pelo Gabriel** — mantida no cabeçalho, na DoD e na §"assimetria", conferida contra `epic-87:1108` (*"Recomendação: (c) agora"*, **sem** o selo *"✅ FECHADA"* que o `D3` tem em `:1114`). **Os dois pontos que o @sm pediu para eu confirmar, confirmados executando:** **(1)** os dois ramos **não** produzem a mesma string — rodei os dois literais: vivo/proposto = **145 chars**, `catch` = **174**, `vivo === proposto` ⇒ `true`, `vivo === catch` ⇒ `false`. **A correção dele sobre a minha §1 está certa e eu a aceito**: colapsar no ramo do `catch` embarcaria diff de prompt. *(Precisão minha: a diferença é **+29** chars, não +30 — `(informacoes de conversas anteriores)` tem 37 e `(resumo)` tem 8. E há **TRÊS** cabeçalhos no código, não dois: `loader.ts:77` `(fatos ativos):` também nunca rodou.)* **(2)** a mutação da AC1 dá **ZERO** hoje — reproduzido: `0` testes com `"MEMORIA DO LEAD"`, `0` com `memoryContext`, `0 de 6` fixtures com `ai_summary` preenchido, e **apaguei a injeção e a suíte deu `190 / 2450`, tudo verde**. **Fui além e executei a subtração INTEIRA (T1+T2, incluindo `rm -rf packages/ai/src/memory`): `187 passed (187)` / `2390 passed | 6 expected fail (2396)`, ZERO vermelhos** — `190−3` e `2.450−54` ao número, o que fecha o lado subtrativo da AC3 antes de o @dev começar. 🔴 **TRÊS defeitos novos que eu medi e corrigi no corpo (marcados `[@po 16/08]`):** **(a) AC7(a) — `role='assistant'` NÃO é o número de execuções do pipeline.** São **476**, não 593: medi a partição em produção e **117 (19,7 %) vêm de outros escritores** — **83** transições escritas por **humano** (`send-message/route.ts:220`, que a própria `87-5` documenta como *"127 em 60 dias"*), **29** de mídia (`send-library-media.ts:548`), **5** de relacionamento (`route-inbound.ts:178`). O discriminador é `metadata = '{}'` (só o `saveMessages` grava sem metadata). **A story corrigia o "exatamente" da `87-15` e recolocava a mesma palavra num numerador ainda errado, inflando o custo declarado em 24,6 % em quatro lugares.** **(b) A AC6 REPROVA A AC5 na mesma PR** — escrevi a AC5 do jeito óbvio (`fs.readFileSync` do fonte, sem import) e rodei o scanner da AC6: **2 de 191 flagrados**, a sonda e o `loader.test.ts`. A story registrava a auto-reprovação do scanner e não via a irmã. Remédio estendido: o leitor de fonte da AC5 também vai para módulo importável, **nunca** auto-exceção. **(c) O controle positivo da AC6 estava engolido pela pré-condição** — um `.test.ts` só com `import { it } from "vitest"` fica vermelho **com ou sem catraca** (`Error: No test suite found in file`, saída colada na AC). A sonda passa a exigir um `it(...)` que **passa**. ⚠️ **Mais quatro precisões medidas:** **AC8(a)** nascia **reprovada** — dos 45 módulos não-teste de `packages/ai/src/`, **2 não têm call site fora de teste hoje** (`__fixtures__/fake-supabase.ts` e `__fixtures__/properties-producao.ts`), justamente o fixture que a §"Abordagem de teste" manda usar ⇒ `__fixtures__`/`__mocks__` explicitamente fora da população; **`pipeline.ts:1635`** (`// 12.5 Memory system — … lead_facts …`) **não estava na tabela "O que sai" e é o ÚNICO `lead_facts` que sobrevive à remoção** — reprovaria a régua de `grep` da AC2; **`shouldRunHaiku` está em `:1685`**, não `:1684` (3 sítios), e o **`12.5a` termina em `:1676`** (o `}` do `catch`), não `:1675` — cortar em 1675 deixa chave órfã; **o `124/195` só reproduz sob a definição *"lead com mensagem `role='user'` em 30 d"*** — trocando por *"qualquer mensagem"* dá **`135/357` (37,8 %)**, então a definição vai escrita ao lado do número. ✅ **Reproduzido e batendo ao número:** produção (`lead_facts`/`lead_memories` = `null`, `match_lead_memory` = 0, `012` registrada, `1052` user, `593` assistant, **`0` assistant de conversa sem `lead_id`**), `263/1788`, `624/1052` (**59,3 %**), `124/195` (**63,6 %**), suíte `190 / 2450`, os 3 arquivos = **54** pelo executor, AC2 `24 em 9` no `HEAD` × `25 em 10` na árvore suja, **população de `190` derivada dos globs do `vitest.config.ts` com `1` zero-import** (`loader.test.ts`), `Epic 88 §8` com **8 linhas** e o MemPalace na **6ª** como *"habilitante — latência"*, `W4-4` deps `D2, W3-1` em `epic-87:1034`, CodeRabbit sem chave em `core-config.yaml`. ✅ **Concordo com a rejeição do "volta restaurado do sha"** — a `87-15 §4` + T9 revisada já fecham, e nenhuma AC das duas stories depende do sha. ✅ **`87-15` AC3/AC4 sustentam o que eu medi** (`16/182` com o par `32e0ee55` de 03/08 × 04/08 como fixture obrigatória; `kind` **por mensagem** com `95/95`, `0/5`, denominador 100 e mutação **≥5**, com *"classificar por predicado é proibido por esta AC"* escrito). **Checklist 10 pontos: 8,5/10.** **Achado 7 novo:** `role='assistant'` é papel sobrecarregado com 7 escritores e sem discriminador de primeira classe — dá denominador ao item de modelo de dados que a `87-5` deixou no `docs/backlog.md`. | @po (Pax) |
| 2026-08-16 | 0.1 | **Criação por recorte da `87-15`**, sob o NO-GO do @po (`docs/qa/po-validation-87-15.md`, §3: *"FATIAR"*). Esta story é o **bloco A corrigido** — `P1 / Onda 1`, sem migration, `git revert`-able. **A correção que motiva o recorte (§2):** a `87-15` mapeava `lead_facts → 404 → return ""` e parava aí; **é o `""` que arma o caminho vivo** (`loader.ts:196`, `if (!l1Snapshot && aiSummaryFallback)`), e `memory/loader.ts` é o **único** caminho pelo qual o `ai_summary` chega ao prompt. Remover o bloco apagaria a memória de conversas anteriores em **624 de 1.052 turnos (59,3 %)** — denominador **por turno**, não por lead (os 14,7 % da `87-15` eram o eixo errado). Contraprova no repo: `summary-grounding.ts:9`, da `87-7` mergeada. **T2 passa a COLAPSAR em ~6 linhas, e a AC1 nova prova nos dois sentidos.** 🔴 **Correção minha sobre a correção do @po, medida:** colapsar literalmente no ramo do `catch` **muda o cabeçalho do prompt** — o `catch` produz `MEMORIA DO LEAD (informacoes de conversas anteriores):` e o ramo **vivo** produz `MEMORIA DO LEAD (resumo):` (`loader.ts:198`). O `catch` **nunca disparou em produção** (mesmo motivo da §3: `supabase-js` não lança), então a string que o mundo vê é `(resumo)`. **A AC1(iii) exige equivalência byte a byte com o ramo vivo** — +30 caracteres de prompt em 59,3 % dos turnos não cabem numa story de subtração. 🔴 **Segundo achado meu, e é o que dá dente à AC1:** a suíte **não pega nada disso hoje** — `0` testes contêm `"MEMORIA DO LEAD"`, `0` assertam `memoryContext`, e **as 6 fixtures de pipeline gravam `ai_summary: null`, ou seja 0 de 6 controles positivos**. Removendo o bloco inteiro hoje, **2.450 testes ficam verdes**. A AC1(iv) exige que a mutação passe de **0 para ≥ 3** vermelhos. **Correção da AC5(a) da `87-15`, mais precisa que a do parecer:** o `12.5b` **não** roda por turno — `pipeline.ts:1684`, `shouldRunHaiku = (msgCount % 5 === 0)`; o que sai 1× por resposta é o `12.5c` (`processConversationTurn`). Logo `count(role='assistant')` = execuções de `processConversationTurn` evitadas, **não** delta do console da Anthropic (`12.5b` + `haiku-enrichment` ficam). A estimativa de ~119/30 d remanescentes é **derivação aritmética, não medição** — AC7(c) manda medir ou declarar não-medível. **Aritmética do Epic 88 corrigida nos dois sentidos:** o `§8` tem **8 linhas** e o MemPalace é a **6ª**, *"habilitante — latência"* — **não existe "nona linha"** e não é bloqueante. O argumento de prioridade passa a ser **custo de atraso** (593 Haiku + ~1.831 embeddings + ~1.600 round-trips a cada 30 d), que acumula, em vez de dependência. **Varredura de zero-import não vira story** (@po: `1 de 190`, o próprio `loader.test.ts`) — **reproduzi por conta própria com a população derivada dos globs do `vitest.config.ts` e deu `1 de 190`**; entra como **catraca permanente** (AC6), com a armadilha registrada de que **o scanner reprova a si mesmo** se morar dentro do arquivo de teste. **`memory-extraction.ts` sai e NÃO volta "restaurado do sha"** (@po §5.4): o que volta na `87-15` é régua nova; o sha fica na PR como valor de arquivo, fora de qualquer AC. **Medições próprias desta árvore:** suíte **190 / 2.450** (saída bruta); os 3 arquivos que saem = **54** testes pelo executor (`grep -c "it("` daria 55 e erraria); AC2 com **denominador divergente declarado nas duas árvores** — **24 em 9 arquivos no `HEAD`** × **25 em 10 na árvore suja** (a diferença é a fixture da `87-11`, não commitada), e o @dev re-mede na hora. `qualification.ts:361`, `memory-extraction.ts:139`, `pipeline.ts:1298`/`:1296` conferidos; deslocamento de **+2** na árvore suja confirmado. **Sem migration** (a `231` é da `87-12`, a `232` é da `87-15`). ⛔ **Merge atrás da ratificação escrita do `D2-(c)` pelo Gabriel** — implementar e testar podem seguir sob a recomendação; a justificativa da assimetria é **custo de errar** (revert de 1 comando × tabela em produção), não conveniência. | @sm (River) |
