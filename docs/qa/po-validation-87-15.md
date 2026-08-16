# Validação @po — Story 87-15 (*"o fato do lead só existe com a mensagem que o originou"*)

**Validador:** @po (Pax) · **Data:** 2026-08-16 · **Story:** `docs/stories/87-15-fato-do-lead-so-existe-com-a-mensagem-que-o-originou.story.md` (`Draft`, 984 linhas)
**Base de conferência:** `origin/main` = `HEAD` = `199a7a84` (0 ahead / 0 behind) · produção `dsopqkqjkmhytudaaolv`, Management API, **somente `SELECT`** · suíte rodada nesta árvore

---

## VEREDITO: 🔴 **NO-GO** — condicional, com 1 defeito bloqueante nomeado e 4 correções

**A story permanece `Draft`.** Não é um NO-GO de qualidade: é a story mais medida deste epic, e **11 de 13 medições do @sm reproduziram ao número** quando eu as rodei de novo. O NO-GO vem de **uma** alegação — e é justamente a que autorizava embarcar o bloco A hoje.

> **Risco 1 da story:** *"O bloco A remove o `memoryContext` e a Nicole fica 'mais rasa' — Prob. **Nenhuma**. Ele retorna `""` em **100 %** dos turnos hoje. Remover string vazia não muda resposta. **Prova disponível sem deploy**."*
>
> **A prova estava disponível sem deploy. Eu a rodei. Ela dá o contrário.**

---

## 1. 🔴 BLOQUEANTE — o bloco A apaga o `ai_summary` do prompt da Nicole em **59,3 % dos turnos**

### O mecanismo, linha a linha

A tabela §2 da story mapeia a **Leitura L1** como `pipeline.ts:682 → loader.ts:54-62 → select em lead_facts → 404 → return ""` e **para aí**. Nunca segue o que o chamador faz com esse `""`.

```
loader.ts:62    if (error || !facts || facts.length === 0) return ""      ← a tabela morta
loader.ts:196   if (!l1Snapshot && aiSummaryFallback) {                   ← e é o "" que ARMA isto
loader.ts:198       l1Snapshot: `MEMORIA DO LEAD (resumo):\n${aiSummaryFallback}`
pipeline.ts:657 currentSummary = leadData?.ai_summary ?? null
pipeline.ts:684 loadMemoryContext(supabase, lead_id, message, currentSummary)
pipeline.ts:686 const parts = [l1Snapshot, l2, l3].filter(Boolean)        ← parts.length = 1
pipeline.ts:687 memoryContext = `\n${parts.join(...)}\n\nUse essas informacoes…`
pipeline.ts:739 dynamicSuffix = … + memoryContext + …                    ← entra no system prompt
```

**`memory/loader.ts` é o ÚNICO caminho pelo qual o `ai_summary` chega ao prompt da Nicole.** Conferido: `grep -rn "ai_summary" packages/ --include="*.ts"` devolve 50 sítios — todos os demais são **UI, handoff, followup, relatórios e crons**. Nenhum outro injeta no prompt do `processMessage`.

A T2 manda *"remover o bloco `memoryContext` (680-694)"* e a T1 manda remover `loader.ts`. **Juntas, elas removem a memória de conversas anteriores da Nicole.**

### O denominador — e ele foi declarado no eixo errado

A §5 da story cita **"263 de 1.788 leads (14,7 %)"** e trata como população pequena. Mas a injeção acontece **por turno**, não por lead. Medido hoje, 30 dias, produção:

```
leads com ai_summary não-vazio            263 de 1.788   (14,7 %)   ← o número da story
turnos role='user' de lead COM resumo     624 de 1.052   (59,3 %)   ← o número que importa
leads ATIVOS (30d) com resumo             124 de   195   (63,6 %)
```

O viés é estrutural e previsível: **quem tem resumo é exatamente quem já conversou e voltou.** 14,7 % dos leads são 59,3 % dos turnos.

### A contraprova mora no próprio repositório, escrita por uma story já mergeada

`packages/ai/src/flows/summary-grounding.ts:9` — **Story 87-7, em produção**:

> `* (memory/loader.ts, fallback do ai_summary, **ativo em 100 % dos turnos**`

Duas frases sobre o mesmo arquivo, ambas dizendo *"100 % dos turnos"*, **com o sinal trocado**. A da `87-7` está certa; o Risco 1 da `87-15` está errado. A armadilha é elegante e vale registrar: **é a tabela morta que ARMA o caminho vivo** — sem o `404` que devolve `""`, o `if` da 196 não dispara. Quem mapeia só o ramo morto não vê o ramo vivo, porque o ramo vivo é a consequência do morto.

### Três consequências em cascata

| # | O que quebra | Onde |
|---|---|---|
| 1 | **Risco 1** diz Prob. `Nenhuma`; o correto é **Alta, com 59,3 % dos turnos e efeito visível ao cliente** | Riscos §1 |
| 2 | **AC5(a)** diz que `count(messages role='assistant')` é *"**exatamente** o número de chamadas Haiku que deixaram de acontecer"*. Falso: o `12.5b` (`atualizarResumoComLastro`) **fica** e também chama Haiku por turno. A própria AC5(c) já admite atribuição parcial — as duas se contradizem | AC5 |
| 3 | O `12.5b` vira **escritor sem leitor**: segue pagando Haiku por turno para gravar um `ai_summary` que **nada injeta**. A story cria, com as próprias mãos, a figura que existe para remover — *"código morto que finge funcionar"* | Desenho, bloco A |

### A correção é pequena, e o código dela já está escrito

O ramo `catch` em `pipeline.ts:690-692` **já contém** o substituto exato:

```ts
memoryContext = currentSummary
  ? `\nMEMORIA DO LEAD (informacoes de conversas anteriores):\n${currentSummary}\n\nUse essas informacoes para personalizar o atendimento. Chame pelo nome, referencie o que ja conversaram.\n`
  : ""
```

**T2 deixa de ser "remover 680-694" e passa a ser "colapsar 680-694 nesse único ramo"** — ~6 linhas, sem `loader.ts`, sem `lead_facts`, sem os 3 round-trips, sem os embeddings. O bloco A volta a ser subtração pura de verdade.

**E ganha uma AC nova, que não existe hoje e é a que separa as duas hipóteses:**

> **AC-nova — o `ai_summary` continua entrando no prompt, e isso é provado nos dois sentidos.**
> **(i) controle positivo:** lead **com** `ai_summary` ⇒ o `dynamicSuffix` contém `MEMORIA DO LEAD`. **(ii) controle negativo:** lead **sem** `ai_summary` ⇒ o bloco **não** aparece (e não aparece string vazia com cabeçalho). **(iii) mutação:** remover a injeção ⇒ declarar **antes** quantos testes ficam vermelhos e colar a saída. **Se for zero, a AC não mede nada.** Denominador para a PR: **624 de 1.052 turnos (59,3 %)** e **124 de 195 leads ativos**.

---

## 2. O que eu reproduzi do @sm — e bateu ao número

Rodei tudo de novo. **Saída bruta, não transcrita.**

### 2.1 Produção (Management API, `SELECT`)

```
lf     | lm     | rpc | mig012 | u30  | a30 | b30
-------+--------+-----+--------+------+-----+------
null   | null   | 0   | 1      | 1052 | 593 | 1297
```
✅ `lead_facts` e `lead_memories` **não existem**; `match_lead_memory` = **0 procs**; a `012` **está registrada como aplicada**; os três volumes de 30 dias batem exatamente.

### 2.2 A suíte

```
 Test Files  190 passed (190)
      Tests  2444 passed | 6 expected fail (2450)
```
✅ Baseline **190 / 2.450** exata. E os três arquivos que saem, contados pelo executor:
```
loader.test.ts           : Tests  19 passed (19)
writer.test.ts           : Tests  11 passed (11)
memory-extraction.test.ts: Tests  24 passed (24)   →  3 files / 54 passed
```
✅ **54**, não 55. A AC2 (`2.450 → 2.396`) está aritmeticamente correta.

### 2.3 A mutação da AC3 — **eu executei, não li**

Apaguei `packages/ai/src/memory/loader.ts` e rodei o teste dele (arquivo restaurado em seguida; `git status` limpo):

```
=== loader.ts DELETADO — rodando loader.test.ts ===
 Test Files  1 passed (1)
      Tests  19 passed (19)
```
✅ **Confirmado.** O módulo pode sumir inteiro e os 19 testes ficam verdes. A §4 da story está certa.

### 2.4 A régua de extração — rodada de novo, módulo real, 1.052 mensagens

| | @sm | meu re-run | |
|---|---|---|---|
| `1.052 → com ≥1 fato → fatos` | 174 (16,5 %) → 182 | **174 (16,5 %) → 182** | ✅ |
| `interested_in` | 100, **95 autotexto** | **100, 95** (regex ampla) | ✅ |
| `available_day` | 31, **31/31 relativos** | **31, 31 relativos / 0 absolutos** | ✅ |
| `name` | 12, **5 > 20 ch** | **12, 5** | ✅ |
| `available_time` | 7, `"3ª feira às 17:30" → "17h"` | **7**, e o `17h` sai colado na saída | ✅ |
| `budget` | `490 mil / 400 mil / 350. / 260.000` | **idêntico** | ✅ |
| `objection` 13 · `prefers_bedrooms` 7 · `marital 4/garage 2/floor 1/down_payment 1` | — | **idêntico** | ✅ |
| **controle negativo** (593 falas da Nicole) | 329 (55,5 %) → **559**, **3,07×** | **329 (55,5 %) → 559** | ✅ |

✅ **Nenhuma divergência.** E o controle negativo é **pior** do que o agregado revela — a amplificação é concentrada exatamente nos predicados de agenda:

```
available_day   31 → 83   (2,7×)   ["sábado" ×30]
available_time   7 → 44   (6,3×)
prefers_bedrooms 7 → 105  (15,0×)
name             — → 56   (55 deles literalmente "Nicole")
```

### 2.5 O resto

- ✅ **`fonte: "mencao"`** — `qualification.ts:361` escreve, sob a guarda `opts?.origem === "lead"` da linha 321. A auto-correção do @sm está certa. *(Precisão: a story diz `:355`; a linha é `:361`.)*
- ✅ **`memory-extraction.ts` descarta os minutos** — `` `${timeMatch[1]}h` ``. *(Story diz `:138`; é `:139`.)*
- ✅ **Migration 232 livre.** `git ls-tree origin/main` ⇒ maior prefixo **230**. `git log --all --diff-filter=A -- "supabase/migrations/23[12]*"` ⇒ **vazio**. `87-12` reserva a `231` (linhas 15 e 496). Conferido **por arquivo contra `origin/main`**, não por `max(version)`.
- ✅ **AC1** — `grep` devolve **25 ocorrências em 10 arquivos** (4 de produção + **6 fixtures**). O denominador da AC1 está exato.
- ✅ **`NICOLE_LASTRO_DIARIO`** — ver §6.

---

## 3. 📍 COLOCAÇÃO — decisão do @po

**Decisão: FATIAR. Mas o bloco A não entra hoje — entra assim que o defeito §1 for corrigido.**

| Peça | Onde | Status | Bloqueio |
|---|---|---|---|
| **Bloco A corrigido** → nova story **`87-16`** | **Onda 1**, fila de um-fix-por-deploy | `Draft` → `Ready` após o recorte | correção §1 + ratificação de `D2-(c)` (§3.2) |
| **Bloco B** = permanece na **`87-15`** | **Onda 4**, `W4-4` | **`Draft`, sem data** | `D2-(b)` não ratificada + 2 defeitos de desenho (§4) |
| **Bloco C** (leitura) | não existe | — | não é esta story ✅ |

### 3.1 Por que fatiar, e não esperar inteiro

O @sm mediu o custo dos dois lados e a conta é dele. Eu só acrescento o que decide:

- **A story inteira refém do `D2-(b)`** significa que a subtração fica parada esperando uma decisão **sem data**, enquanto o custo corre: **593 chamadas Haiku + ≤1.831 embeddings + ~1.600 round-trips falhos a cada 30 dias**, num p95 de **12.469 ms (n=442)** que o `D88-3` usa como teto.
- **O custo de fatiar** é um documento a mais e uma referência cruzada. Barato.
- **E o epic não se opõe.** A §"W4-4 por último, e de propósito" (`epic-87:1075`) justifica o adiamento por **causalidade de alucinação** (*"O MemPalace morto não é causa de alucinação"*) — verdadeiro, e **é outro eixo**. O caso do bloco A é **custo e latência** (`Epic 88 · §8`). É literalmente o que a §7 do epic (`:434`) avisa: *"um item lido como 'Baixo' no eixo errado atravessa a regra de corte da onda sem…"*. Fatiar é ler cada metade no eixo dela.
- **Fatiar também livra o bloco A de uma dependência que não é dele:** o `W4-4` declara deps **`D2, W3-1`** (`epic-87:1034`). O `W3-1` é o validador pós-resposta — não tem relação nenhuma com enterrar código morto. Enquanto o enterro morar dentro do `W4-4`, ele herda um bloqueio transitivo falso.

### 3.2 A assimetria que eu NÃO vou esconder

O `D2` inteiro mora na §8, *"Decisões que dependem do Gabriel"*. **O `D2-(c)` também é recomendação, não ratificação** — e o epic mostra como é uma decisão fechada de verdade: o `D3` traz *"✅ **FECHADA (06/08)**"*. O `D2` não tem esse selo.

Então aplico a regra do @sm (*"não implementar sob recomendação — foi assim que o MemPalace nasceu"*) **aos dois blocos**, com a assimetria justificada pelo **custo de errar**, não pela conveniência:

| | ratificação | custo de errar |
|---|---|---|
| **(c) enterrar** | recomendação diz textualmente *"**(c) agora**"* + vira dependência declarada no `Epic 88 · §8` | `git revert`, um comando. Sem migration, sem dado, sem estado |
| **(b) redesenhar** | recomendação diz *"na Onda 4"*, sem "agora" | tabela + view + índice + escritor em produção. O **Risco 4 da própria story** (`Média` × `Alto`): *"nasce e ninguém lê ⇒ vira o próximo código morto"* |

**Portanto:** a `87-16` pode ser **escrita, implementada e testada** sob a recomendação; o **merge** fica atrás de uma linha do Gabriel ratificando o `D2-(c)`. É um sim/não de trinta segundos, e ele põe a assinatura onde está a irreversibilidade — não onde está o trabalho.

---

## 4. 🔴 O bloco B tem dois defeitos de desenho — medidos, não suspeitados

Não bloqueiam nada hoje (o bloco B está parado), mas **entram como correção obrigatória antes de qualquer implementação**, porque os dois reproduzem, um nível acima, o defeito que a story existe para fechar.

### 4.1 O índice único **rejeita 16 de 182 fatos (8,8 %)** — e pela razão errada

```sql
create unique index lead_fato_ativo_unico
  on public.lead_fato (lead_id, predicate, object) where valid_to is null;
```

**`resolved_date` não está na chave.** A AC8 torna `resolved_date` obrigatório justamente porque *"sábado"* não significa nada sem ela — e aí a identidade do fato ignora exatamente esse campo. Rodei a chave proposta contra os 182 fatos reais:

```
chaves distintas: 166  |  chaves com >1 ocorrência (= INSERT que bateria 23505): 15
fatos que NÃO entrariam por colisão: 16 de 182  (8,8 %)

  available_day='quinta'  x2  lead 32e0ee55  datas: 2026-08-03, 2026-08-04   ← DUAS quintas diferentes
  available_day='sexta'   x2  lead bccc4aa6  datas: 2026-08-03
  interested_in='vind'    x3  lead 791182c2  datas: 2026-07-18, 27-07, 05-08
  objection='price'       x2  lead e7b82ead  ·  prefers_bedrooms='3' x2  lead 6e4cb02b
```

O caso `32e0ee55` é o veredito: **duas quintas-feiras de semanas diferentes, dois `resolved_date` diferentes, um único slot no índice.** E o `expires_at` não salva — ele filtra a **view**, mas o índice parcial filtra por `valid_to is null`. Um fato expirado sai do estado **e continua ocupando a vaga**. Resultado: o substrato guardaria **uma** *"sábado"* para sempre, com a data absoluta da primeira vez. **É o gerador perpétuo de sábados do CR-4 entrando pela porta que a story deixou aberta.**

### 4.2 O `kind` não tem classificador, e é ele que a view usa como enforcement

O `CHECK` do `kind` valida **o domínio** (um de quatro valores). **Nada valida a escolha.** E a view `lead_fato_estado` — o enforcement inteiro da §"semânticas não colapsadas" — filtra por `kind`.

Ou seja: `source_message_role` está no tipo e na FK; **`kind` está na convenção do escritor.** É exatamente a *"proveniência por convenção de call site"* que a §6-bis denuncia, reproduzida uma camada acima, no campo que decide o que é estado.

E a AC14 já materializa o defeito: *"`interested_in` entra com `kind='formulario'`"* — **por predicado**. Medi:

```
mensagens autotexto que geram fato: 95     predicados produzidos POR autotexto: {"interested_in": 95}
interested_in de autotexto: 95   |   interested_in NÃO-autotexto: 5
```

Boa notícia: o autotexto do lead form produz **exclusivamente** `interested_in` (95 de 95) — nenhum outro predicado se contamina. Má notícia: **os 5 restantes são declarações reais** e virariam `formulario` por engano:

```
vind    <= "Gostaria de saber mais sobre o vind"
yarden  <= "E o yarden?"
vind    <= "Acho q o vind faria mais sentido agora…"
vind    <= "Me interessei pelo Vind e pelo Calefi Home Club. Mas estou vendo outr…"
```

**A regra correta é por MENSAGEM (o texto é o autotexto do formulário?), não por PREDICADO.** O discriminador existe, é trivial, casa 95/95 e 0/5 — e a story não o escreve em lugar nenhum. Sem ele, `kind` é um campo que qualquer escritor preenche como quiser, e a view herda o arbítrio.

**Correções exigidas antes de implementar o bloco B:**
1. `resolved_date` (e `resolved_hour`/`resolved_minute`) entram na chave do índice único — **ou** o escritor fecha o fato anterior (`valid_to`/`superseded_by`) em vez de colidir. AC própria, com os **16 de 182** como denominador vermelho.
2. `kind` ganha **regra de classificação escrita + AC com controle positivo e negativo** (95 autotextos ⇒ `formulario`; os 5 reais ⇒ `lead_declarou`). Enquanto não tiver, o `CHECK` do `kind` é decorativo e a view não enforça nada.
3. Menor: `fato_temporal_exige_data_absoluta` exige `resolved_date` para `available_time`, mas **não** exige `resolved_hour`. Dos 7 `available_time` medidos, ~5 vêm de mensagens **sem dia** — serão rejeitados (correto, fail-closed), mas o controle positivo da AC8 precisa de uma fixture com dia e hora na **mesma** mensagem.

---

## 5. As quatro perguntas do briefing — respostas diretas

### 5.1 *"Confirme que eu errei sobre o Epic 88 ser bloqueado por esta story"*

**O @sm está certo no mérito. Sua justificativa de prioridade cai. Mas a aritmética dele também está errada, e eu corrijo os dois.**

O `Epic 88 · §8` (`:749-758`) tem **exatamente 8 linhas**: `W0-0`, `W1-2b`, `W1-2c`, `W0-5`, `W2-1`, **MemPalace**, `W3`, `W4-1`.

- ✅ **Nenhuma delas é memória de fato do lead.** O bloco B **não aparece** na tabela. A afirmação *"pré-requisito do Epic 88"* é **falsa para o bloco B**.
- ✅ A proveniência que de fato aparece é a de **agenda** — `W1-2b` = `87-4` (`Done`) e `W1-2c` = `87-10` (`Ready`). Ambas já escritas.
- 🔴 **Mas não existe "nona linha".** O MemPalace **é** uma das oito (a 6ª). A story diz *"lista oito entradas, nenhuma é memória de fato do lead"* e depois *"o que esta story fecha é a nona linha"* — **as duas frases se contradizem**. Corrigir para: *"é a 6ª das 8, e a única sem story"*.
- 🔴 **E ela não está declarada como bloqueante.** A coluna se chama *"Bloqueia o quê?"* e a resposta do MemPalace é **"habilitante — latência"**. As outras dizem *"o item 88-9"*, *"o item 88-7"*. **O bloco A não destrava o Epic 88 — ele o financia.**

**O que isso faz com a prioridade:** troca um argumento de **dependência** por um de **custo de atraso**, e o segundo é mais forte. Dependência espera o dependente; custo de atraso **acumula**. A cada 30 dias parados: 593 Haiku + ~1.800 embeddings + ~1.600 round-trips descartados, mais orçamento de latência que o `D88-3` vai precisar.

**Prioridade que eu atribuo:** `87-16` (bloco A) = **P1, Onda 1**, na primeira vaga da fila após a correção §1. `87-15` (bloco B) = **P3, Onda 4, sem data**.

### 5.2 *"`loader.test.ts` pede varredura própria? Você disse que no terceiro caso vira story"*

**Sim, a varredura era devida — e eu a rodei agora, em vez de abrir story para ela. Ela devolve `n = 1`. Nenhuma story.**

Varri os **190** arquivos `*.test.ts` procurando os que não importam **nenhum** módulo do projeto (`./`, `@web/`, `vi.mock`, `import()` dinâmico, `require`):

```
ZERO-IMPORT: packages/ai/src/memory/loader.test.ts (~20 it/test)
TOTAL genuinamente sem import de módulo do projeto: 1 de 190
```

**`loader.test.ts` é o único caso do repositório — 1 em 190 (0,53 %) — e o bloco A já o está apagando.** Abrir story para varrer uma população de 1 que já tem dono seria teatro.

> **Confissão de método, porque ela é o próprio assunto.** Minhas duas primeiras passadas deram **41 de 190 (21,6 %)** e depois **3 de 190**. As duas estavam erradas: a primeira não casava `import` multilinha, a segunda não conhecia o alias `@web/`. **Se eu tivesse aberto a story na primeira passada, teria aberto sobre 21,6 % inventados.** É exatamente a armadilha da semana — *"denominador declarado"* — aplicada a mim. O número só assentou quando li o `paths` do `tsconfig`.

**O que fica no lugar da varredura, e é mais barato que ela:** uma **catraca permanente** dentro da `87-16`, ao lado da AC4 (que já é um teste de ausência, mesmo arquivo, mesma PR):

> **AC-nova — nenhum `*.test.ts` sem import de módulo do projeto.** Teste que varre `packages/**/*.test.ts` e falha se algum arquivo não referenciar `./`, `../`, `@web/` ou `@trifold/`. **Controle positivo obrigatório:** criar um `.test.ts` temporário só com `import { it } from "vitest"` e **colar a saída vermelha**. Denominador declarado: **hoje 1 de 190; depois da remoção do `loader.test.ts`, 0 de 189.**

Uma varredura mede uma vez. A catraca mede para sempre, custa XS e cabe na PR que já está aberta.

### 5.3 *"`fonte: 'mencao'` — verifique"*

✅ **Verificado, e é pior do que a story escreve — mas por um motivo diferente do que ela supõe.**

A story teme *"um call site novo que esqueça `opts.origem`"*. O problema não é hipotético: **os dois call sites de produção existem e ambos passam `origem`** —

```
pipeline.ts:1278  extractCollectedData(message,          collectedData, { nameExpected, origem: "lead",      now })
pipeline.ts:1298  extractCollectedData(assistantMessage, updatedData,   { origem: "assistant" })
```

A segunda linha alimenta a função com **a resposta inteira da Nicole**, e é **deliberada e documentada** (`pipeline.ts:1295-1297`: *"daqui saem nome/imóvel/quartos como sempre, mas NUNCA mais disponibilidade de visita"*).

**O achado preciso, então, não é "convenção frágil" — é assimetria de fail-safe:**

| ramo | guarda | comportamento se `origem` faltar |
|---|---|---|
| agenda (`qualification.ts:321`) | `if (opts?.origem === "lead")` | **fail-CLOSED** ✅ (a `87-4` fechou) |
| nome, email, quartos, vaga, andar, vista (`:158-260`) | **nenhuma** | **fail-OPEN** 🔴 — roda sobre a fala da Nicole hoje, por desenho |

Renomear o parâmetro (Achado 6 do @sm) é cosmético. **O achado real é que metade da função nunca teve guarda de origem.** Sobe para o backlog com essa redação, vizinho da `87-11`, **fora desta story** — é superfície de `collected_data`, não de `lead_fato`.

### 5.4 *"`memory-extraction.ts` sai no A e volta no B — limpeza honesta ou churn?"*

**Sair no A: correto, mantenho.** Módulo exportado, 24 testes verdes, zero call sites — é literalmente a figura que sustentou 4 meses de crença errada.

**Voltar no B "restaurado do git pelo sha": rejeito. Isso é churn, e pior, é uma promessa falsa.**

A própria §7 da story mede o módulo e reprova quase tudo: **95 de 182 fatos são autotexto** (52,2 %), **31 de 31 dias são relativos**, `"17:30"` vira `"17h"`, `"São todos com 2 suítes"` vira preferência. E a **AC14 exige `pega N / erra M` por predicado antes de adotar qualquer um.** As duas coisas não se sustentam juntas: se cada predicado precisa ser remedido e a maioria precisa ser reescrita, **o que volta não é este módulo — é uma régua nova que reaproveita, no máximo, alguns `PATTERNS`.**

**Correção:** trocar a T9 e o sha na AC por:

> **T9 (revisada)** — o bloco B escreve régua nova, predicado a predicado, sob a AC14. `memory-extraction.ts` fica no histórico do git como **referência de padrões**, não como base de restauração. **O sha do commit anterior à remoção fica anotado na PR do bloco A por valor de arquivo — não como plano de restauração.**

Ganho: some o delete-e-restaura, some um sha dentro de uma AC (que apodrece em rebase), e a AC14 deixa de contradizer a T9.

---

## 6. 🟢 Para o @pm — confirmado, com evidência mais forte que a do @sm

**O `W0-5` voltou a medir.** O @sm trouxe a contagem; eu trouxe a **distribuição por dia**, que é o que prova regularidade:

```
dia          n
2026-08-10   1
2026-08-11   1
2026-08-12   1
2026-08-13   1
2026-08-14   1
2026-08-15   1
2026-08-16   1     ← 11:38 UTC de hoje
```

**Sete dias consecutivos, exatamente uma execução por dia, zero falhas, zero lacunas.** Não é "7 eventos" — é um cron **diário e estável**.

O epic ainda registra o contrário em **cinco** lugares: `:56` (`stories_planned`), `:448` (`W0-5`), `:518`, `:1230` (diagrama), `:1326`. Encaminhamentos:

1. 🟢 **Derrubar o bloco ⛔ da Onda 0.** *"a story está `Done` e o ITEM não está"* está **vencido** desde 10/08. O marco *"existe um 'antes'"* é verdadeiro.
2. 🟢 **A recalibração `B6` deixou de estar bloqueada.**
3. ⚠️ **Registrar QUAL hipótese caiu.** O @devops derrubou sete com prova e sobrou *"acesso ao painel da Vercel — Gabriel"*. Se aconteceu, registrar; se deixou de ser necessário, registrar o porquê. **Um roadmap que exibe um instrumento como quebrado depois de ele voltar custa o mesmo que o inverso** — foi a crítica que o próprio epic fez ao `W0-5` em 10/08.
4. ⚠️ **`§10 · Notas para o @sm` diz que o maior prefixo de migration é `215`.** Hoje é **230**. É a **segunda story seguida** a corrigir isso. Trocar o número por *"conferir por arquivo em `supabase/migrations/` contra `origin/main`, nunca por `max(version)`"* — instrução que não apodrece.
5. ⚠️ **`Epic 88 · §8`, linha MemPalace** — apontar para a `87-16` (bloco A), com a redação corrigida: **6ª de 8, "habilitante — latência", não bloqueante**.
6. ⚠️ **`W0-2`** descreve o defeito como *"vira string vazia"*. Incompleto (§3 do @sm, confirmada): os três `catch` nunca dispararam porque `supabase-js` não lança. **E agora incompleto por um segundo motivo, que é o §1 deste parecer: a string vazia não é o fim do caminho — é o gatilho do `ai_summary`.**
7. ⚠️ **`W4-4` declara deps `D2, W3-1`.** O enterro não depende do `W3-1`. Ao apontar a `87-16`, cortar essa herança.
8. ⚠️ **Pendência antiga aberta desde 10/08** (herdada, não é do @sm): `87-0` consta `Ready` no mapa e está **mergeada em produção** (PR #377).

---

## 7. Checklist de 10 pontos

| # | Item | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | ✅ | |
| 2 | Descrição completa | ✅ | Excepcional. Contexto medido, não narrado |
| 3 | ACs testáveis | ⚠️ | 15 ACs com mutação/controles/denominador — padrão alto. **AC5(a) se contradiz com AC5(c)**; **falta a AC do `ai_summary`** (§1) |
| 4 | Escopo definido | ✅ | §"O que esta story NÃO faz" é modelar |
| 5 | Dependências mapeadas | ⚠️ | `D2-(b)`, harness, `87-12`/231 ✅. **Erra a contagem do `Epic 88 · §8`** e **não vê que `memory/loader.ts` é o único leitor do `ai_summary`** |
| 6 | Estimativa | ✅ | S / L, coerente |
| 7 | Valor de negócio | ✅ | Custo medido em 30 dias |
| 8 | Riscos documentados | 🔴 | 8 riscos, bem escritos — **o Risco 1 está factualmente invertido**, e é o que autorizava embarcar |
| 9 | Definition of Done | ✅ | |
| 10 | Alinhamento com o epic | ⚠️ | `W4-4`/`D2` ✅. Herda a dep falsa `W3-1`; regra de corte da Onda 1 **não é atendida pelo bloco A como escrito** (§1) |

**Placar: 5 ✅ · 4 ⚠️ · 1 🔴 ⇒ 6,5 / 10.** Abaixo do corte de 7, **e** com um bloqueante em item de risco. **NO-GO.**

---

## 8. Caminho para o GO — cinco itens, todos pequenos

**Para `87-16` (bloco A) chegar a `Ready`:**

1. 🔴 **Corrigir a T2:** colapsar `pipeline.ts:680-694` no ramo `ai_summary` que já existe no `catch` (`:690-692`), em vez de remover o bloco. **Sem isso a story tira a memória da Nicole em 59,3 % dos turnos.**
2. 🔴 **Reescrever o Risco 1** — de `Prob. Nenhuma` para `Alta`, com **624/1.052 turnos** e **124/195 leads ativos** declarados, e a contraprova de `summary-grounding.ts:9` citada.
3. 🔴 **Adicionar a AC do `ai_summary`** (§1), com controle positivo, negativo e mutação com contagem declarada **antes**.
4. ⚠️ **Corrigir a AC5(a)** — não é *"exatamente"* o número de Haiku evitadas; o `12.5b` fica e também chama Haiku. Alinhar com a AC5(c), que já está certa.
5. ⚠️ **Adicionar a catraca de zero-import** (§5.2), com controle positivo colado vermelho e denominador `1 de 190 → 0 de 189`.

**Higiene junto (barato, mesma PR):** corrigir `qualification.ts:355 → :361`, `memory-extraction.ts:138 → :139`, a *"nona linha"* → *"6ª de 8, habilitante"*; e **atualizar** (não apagar) os docstrings de `summary-grounding.ts:9` e `collected-data.ts:50`, que apontam para o `memory/loader.ts` removido — dois comentários que, deixados como estão, viram a próxima *"crença que alguém acreditou existir"*.

**Para a `87-15` (bloco B) sair do `Draft`, além do acima:**

6. 🔴 Ratificação escrita do **`D2-(b)`** pelo Gabriel — não recomendação.
7. 🔴 Corrigir a chave do índice único (§4.1), com **16/182** como denominador vermelho.
8. 🔴 Escrever a **regra de classificação do `kind`** e a AC dela (§4.2), com **95/95** e **0/5**.
9. ⚠️ Substituir T9 e o sha de restauração pela redação da §5.4.

---

## 9. Encaminhamento

| Para | O quê |
|---|---|
| **@sm (River)** | Aplicar os itens 1–5 e recortar o **bloco A** em **`87-16`**. A `87-15` fica com o bloco B e a migration **232**. **Não** editar corpo de epic |
| **@po (eu)** | Re-validar a `87-16` em via rápida — **os itens 1–5 são as únicas conferências novas**; todo o resto deste parecer já está verificado e vale |
| **@pm (Morgan)** | §6, itens 1–8. Os três primeiros são boa notícia com evidência |
| **Gabriel** | Uma linha ratificando o **`D2-(c)`** (destrava o merge da `87-16`). O **`D2-(b)`** continua aberto, sem pressa |
| **Backlog** | Achados 1–7 do @sm ✅, com o **6 reescrito** por §5.3 (*"metade do `extractCollectedData` nunca teve guarda de origem"*, não *"o nome do parâmetro convida"*) |

---

## 10. Nota de método

O @sm mediu contra produção, rodou o extrator de verdade, contou testes com o executor em vez de `grep`, registrou uma divergência própria com o método das duas contagens, e **se recusou a decidir a colocação sozinho**. Onze de treze medições reproduziram ao número. Isso é o padrão que eu quero.

O defeito que bloqueia não veio de falta de rigor — veio de uma **fronteira de rastreamento**: a §2 mapeou o caminho morto até o `return ""` e parou. **É o `""` que arma o caminho vivo.** A lição é do formato *"grepe os escritores, não só os leitores"*, invertida: **quando remover um leitor morto, siga o que o chamador faz com o vazio dele.** Um `return ""` não é o fim do caminho — é um valor que alguém, mais acima, testa com `if`.

E a segunda lição é minha, não dele: eu quase abri uma story de varredura sobre **21,6 %** que na verdade eram **0,53 %**. **Rodar a régua não basta se o denominador está errado — e o denominador esteve errado duas vezes antes de assentar.**

— Pax, equilibrando prioridades 🎯
