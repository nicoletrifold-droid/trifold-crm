# Story 87-11 — O `collected_data` deixa de ir ao prompt como JSON cru

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
**Item do roadmap:** **`W1-6`** (Onda 1) — o item que o @architect criou em 07/08 (§2.5) e que
**derruba uma premissa dos dois epics** enquanto existir
**Criada por:** @sm (River) em 2026-08-10
**Formato:** **Subtração pura.** Remove uma fonte de informação mal formada. Não adiciona caminho de
decisão nenhum.
**Executor:** @dev · validação em produção: @qa + Marcos (D7, fechado em 09/08)
**Esforço:** **XS** (código) / **S** (teste)
**Risco:** **Baixo de regressão** / **Nenhum de comportamento novo** — com a ressalva escrita do §5
**Deploy:** **penúltimo da fila homologada pelo @po** — `87-12` (hotfix do `handoff.ts`) →
`87-5 A` → `87-5 B` → **`87-11`** → `87-10`, ≥24 h entre cada. **Antes da `87-10`**, que tem número
maior e desce depois de propósito (ver §6)

> ### O defeito, em uma linha
>
> ```ts
> // packages/ai/src/chat/pipeline.ts:1911-1915 — buildSystemPrompt
> if (state.collected_data && Object.keys(state.collected_data).length > 0) {
>   convoLines.push(`Data collected so far: ${JSON.stringify(state.collected_data)}`)
> }
> ```
>
> O estado inteiro da conversa vai ao modelo **serializado cru, sem instrução nenhuma** — nomes de
> chave interna, timestamps de máquina, resíduo de agenda e falas inteiras da própria Nicole.

> ### ⚠️ Correção do @po (10/08): **este é UM dos três despejos, não o único**
> *(parecer: `docs/qa/po-validation-87-10-87-11.md` §2. **O escopo desta story não muda** — ela
> continua tocando um sítio. O que muda é a story parar de afirmar que é o único, porque a `87-10`
> vai escrever uma chave nova e as outras duas rotas continuam abertas.)*
>
> | # | sítio | prompt de quê | quem fecha |
> |---|---|---|---|
> | **1** | `pipeline.ts:1913` | **a fala da Nicole** (turno vivo) | **esta story** ✅ |
> | 2 | `lead-memory.ts:79` — `DADOS COLETADOS:\n${JSON.stringify(collectedData, null, 2)}` | Haiku que escreve o `ai_summary`, que volta ao prompt por `memory/loader.ts:195` | **`87-10` AC6-b** |
> | 3 | `haiku-enrichment.ts:90` — `Dados ja coletados: ${JSON.stringify(currentCollectedData)}` | Haiku do cron `enrich-leads` (último escritor de **70 %** dos estados) | **`87-10` AC6-b** |
>
> O sítio 1 é o certo para esta story: é o único que colide com a *REGRA ABSOLUTA* do bloco
> `[SISTEMA]`, que é a premissa que o `W3-1` e o Epic 88 vão herdar. Os sítios 2 e 3 alimentam
> modelos auxiliares, e o dano deles é de **realimentação** — matéria da `87-10`, que é quem cria a
> chave nova. **Nenhum dos dois entra aqui.**

---

## Story

**Como** engenharia da Trifold, que está construindo um validador (`W3-1`) e um contrato de tool
(Epic 88) sobre a premissa de que o bloco `[SISTEMA]` é a **fonte única de fatos autorizados**,
**Queremos** que o estado da conversa entre no prompt **classificado e rotulado, ou não entre**,
**Para que** essa premissa deixe de ser ficção — hoje o mesmo fato falso chega ao modelo **duas
vezes**, uma com as regras de leitura do `[SISTEMA]` e outra solta em JSON.

---

## Context

### 1. 🔴 O que essa linha despeja HOJE, em produção — medido, não estimado

**Medições minhas contra produção (`dsopqkqjkmhytudaaolv`, Management API, somente SELECT, 10/08).**

**Inventário completo das chaves de `collected_data`** (`jsonb_object_keys` sobre
`conversation_state`, `n` = linhas que têm a chave):

```
property_interest 176 · bedrooms 164 · name 163 · floor 72 · visit_availability 56 · source 53
view 38 · garages 30 · has_down_payment 12 · visit_pending_date 9 · cidade_bairro 8 · profissao 6
agenda_state 1 · filhos 1 · estado_civil 1 · situacao_moradia 1
```

**São 16 chaves distintas, e só 9 são campos de qualificação.** As outras 7 são: as **quatro chaves
legadas de agenda** que a `87-4` declarou como a classe que não deve ser preservada (`visit_availability`
56 + `visit_pending_date` 9), o **objeto** `agenda_state`, e extras de perfil produzidos pelo Haiku do
cron (`cidade_bairro`, `profissao`, `filhos`, `estado_civil`, `situacao_moradia`).

**Tamanho:**

```
linhas de conversation_state ......... 254
… com collected_data não-vazio ....... 236
mediana de length(collected_data::text) . 46 chars
média ................................. 116 chars
máximo ................................ 2.103 chars
soma de todos ......................... 29.487 chars
visit_availability com > 120 chars ...... 38  de 56
```

**Os 2.103 chars são uma fala inteira**, colada aqui truncada do banco:

```json
{"name": "Tudo", "bedrooms": 2, "property_interest": "vind",
 "visit_availability": "Olá, o meu nome é Ivone, eu moro aqui no Jardim Oasis, e eu estou
  precisando, estou precisando muito, a casa que eu moro é minha, e eu já coloquei ela à venda, …"}
```

E há três variantes piores, em que o `visit_availability` guarda **a fala da própria Nicole** — 545,
541 e 480 chars de discurso de vendas dela, devolvidos ao modelo como *"dados coletados"*. Note
também `"name": "Tudo"` e, noutro registro, `"name": "Quantos"`: **o modelo está sendo informado de
que o lead se chama "Tudo".**

### 2. 🔴 E piorou depois da `87-4` — o registro vivo é o do lead do incidente de ontem

Há **exatamente um** `agenda_state` em produção. É o do **Ronaldo**, o lead da primeira detecção real
da guarda (10/08 00:13 UTC). Este é o `collected_data` dele, **colado do banco, íntegro**:

```json
{"name": "Ronaldo", "floor": "alto", "bedrooms": 2, "profissao": "corretor de imóveis",
 "agenda_state": {"hora": 17, "fonte": "pendencia", "minuto": 30, "origem": "lead",
                  "citacao": "3ª feira às 17:30", "periodo": null,
                  "expira_em": "2026-08-12T00:15:45.465Z",
                  "ancorado_em": "2026-08-10T00:15:45.465Z", "data_absoluta": null},
 "property_interest": "vind"}
```

*(356 chars, `updated_at 2026-08-10 00:30:17`.)*

**Hoje, a cada turno dele, o modelo recebe literalmente `"expira_em"`, `"ancorado_em"`,
`"fonte": "pendencia"`, `"origem": "lead"`.** Nomes de maquinário interno, sem uma linha explicando o
que são — e junto, `"hora": 17, "minuto": 30` com `"data_absoluta": null`, que é **exatamente o
17h30 que o bloco `[SISTEMA]` daquele turno tinha RECUSADO** (`evaluateSlot`: `17:30 + 60 > 18:00`) e
que ela confirmou assim mesmo.

> **A leitura que isso muda:** o `W1-6` não é só higiene de contexto. **A `87-4` melhorou o estado e
> piorou o despejo**: onde antes ia uma string, agora vai um objeto com nove chaves de máquina. O
> item ficou **mais** urgente depois da onda, não menos — e é a terceira vez neste epic que uma
> correção boa aumenta a superfície de um defeito adjacente que ninguém estava olhando.

### 3. A premissa que isso derruba

O `W3-1` (Onda 3) vai construir *"bloco de fatos autorizados tipado + validador pós-resposta"*, e o
Epic 88 desenha a tool de agenda sobre a mesma ideia: **o `[SISTEMA]` é a autoridade única sobre
dia e hora**. Enquanto a linha 1913 existir, o mesmo dado chega **duas vezes** — uma dentro do
`[SISTEMA]`, com a *REGRA ABSOLUTA* colada (`pipeline.ts:799-800`), e outra solta, sem regra
nenhuma. **Um validador que confere a resposta contra o `[SISTEMA]` estará conferindo contra metade
da entrada.**

### 4. 🔴 A régua que NÃO serve — **proibição MANTIDA pelo @po, justificativa TROCADA**

A régua óbvia seria *"economizamos X% de contexto"*. O @sm a proibiu, e a proibição fica. **Mas a
base factual dele estava errada nos dois pontos, e o @po remediu em 10/08.**

**Ponto 1 — "a metadata de `CLAUDE_RESPONSE` não tem `conversation_id`, logo a cauda não é
mensurável": FALSO.** `conversation_id` está em **505 de 505** eventos. O join existe, e foi feito:

```
n (eventos, 30 d, com join) ................. 505 de 505
mediana de input_tokens ..................... 1.802     (a medição do @sm bate: n=505, p90 2.400, máx 4.853)
mediana de collected_data POR TURNO ......... 132 chars (o @sm publicou 46)
turnos com collected_data > 120 chars ....... 259 = 51,3 %  (o @sm chamou de "cauda")
… mediana de collected_data nesses .......... 243 chars ≈ 80 tokens ≈ 4,2 % do prompt
… mediana de input_tokens nesses ............ 1.904
```

**Ponto 2 — o denominador.** Os 46 chars são a mediana **por linha de `conversation_state`**, com as
18 vazias e todas as conversas dormentes pesando igual. A pergunta desta story é *"quanto vai ao
modelo **num turno**"*, e no denominador certo são **132 chars, quase 3×** — e o que se chamou de
cauda é **metade do tráfego**.

*(Ressalva declarada, e ela é do número do @po: `length(collected_data)` é lido **hoje**, não no
instante do evento; o objeto cresce ao longo da conversa. É um **teto**, não estimativa pontual. A
direção, porém, não é ambígua.)*

> **Fica escrito, e é normativo para esta story:** *nenhum número de "% de contexto economizado" é
> publicado.* **Não porque a medição seja impossível — ela é fácil e já foi feita — mas porque ela
> mede a coisa errada.** O objetivo do `W1-6` é que o `[SISTEMA]` seja a autoridade única sobre dia
> e hora; contagem de token não fala sobre isso, e publicá-la como êxito é a classe
> `pr(ó|o)xim[ao]` da 87-7: um número que se satisfaz sozinho. **A prova desta story é o turno-ouro
> (AC2) e a amostragem dirigida (AC9), não o token.**

> **Efeito colateral bom, e ele muda como esta story deve ser lida:** o @sm a escreveu como higiene
> marginal (*"invisível na mediana"*). Medida no denominador certo, ela toca **51,3 % dos turnos**.
> Não é cosmética.

### 5. Ressalva honesta à regra de corte da Onda 1

**Esta story muda o que a Nicole vê.** Não é "zero" — escrever "zero" seria repetir a imprecisão que
o @po corrigiu na `87-7` §3.5. O que se afirma, e é o que a regra de corte pede:

- **nenhum `if` novo** no caminho da resposta, nenhum gate novo, nenhuma condição nova;
- a direção é **redutora**: sai maquinário e resíduo, entra o mesmo dado rotulado;
- **o cálculo não muda** — `qualification.ts` fica com **0 linhas de diff** (AC5).

### 6. Por que esta story tem número maior que a `87-10` e sobe antes

A `87-10` (`W1-2c`) escreve duas chaves novas em `collected_data`:
`ofertas_do_sistema` (uma lista de horários) e `afirmado_pela_nicole` (a afirmação dela, com ~1 erro
em 5). **Se ela subir primeiro, essas duas chaves vão ao modelo em JSON cru** — uma lista de horários
afirmáveis fora do `[SISTEMA]`, e a alucinação do turno anterior devolvida como dado coletado. A
numeração segue a ordem dos itens na tabela da Onda 1 do epic (`W1-2c` antes de `W1-6`); **a ordem de
deploy segue o risco.** As duas coisas ficam escritas para que ninguém "corrija" a fila.

---

## Desenho

### 1. Um renderizador puro, com regra de admissão explícita

Novo módulo `packages/ai/src/prompts/collected-data.ts`, função pura
`renderDadosColetados(collectedData: Record<string, unknown>): string[]` — devolve as linhas do
bloco, `[]` quando não há nada a dizer. **Nunca muta o objeto recebido** (AC5-iii).

**Regra de admissão, em ordem:**

| classe | o que acontece | por quê |
|---|---|---|
| as **4 `LEGACY_AGENDA_KEYS`** (`visit_availability`, `visit_pending_date/hour/minute`) | **nunca renderizadas** | a `87-4` já as declarou como a classe que não deve ser preservada; são 65 ocorrências e **38 delas com mais de 120 chars de prosa** |
| `agenda_state` | **linha dedicada, que CITA em vez de afirmar** | é o uso que a própria `87-4` escreveu no docstring do módulo: *"a `citacao` existe para o bloco poder citar em vez de afirmar"* |
| `visit_explicitly_confirmed` | **não renderizada aqui** | já tem duas linhas dedicadas logo abaixo (`pipeline.ts:1918-1922`); renderizar de novo é o despejo duplo em miniatura |
| os **9 campos de qualificação** | rótulo pt-BR fixo | são o contrato do `SCORE_WEIGHTS` |
| **outras chaves escalares** (string/number/boolean) | `- chave: valor`, valor truncado em **120 chars** com `…` | `profissao`, `cidade_bairro` etc. têm valor real na conversa; uma allow-list fechada os mataria em silêncio |
| **objetos e arrays desconhecidos** | **nunca renderizados** | é a regra estrutural que impede o próximo `agenda_state` de vazar maquinário sem ninguém reabrir esta story |
| — | **máximo de 12 linhas** | teto declarado |

### 2. A forma exigida do bloco

Com o `collected_data` **real do Ronaldo** (§2), o bloco passa a ser:

```
=== CONVERSATION CONTEXT ===
Current qualification step: view
Dados já coletados nesta conversa (podem ter vindo da fala do lead OU de inferência da própria conversa — NÃO são fatos verificados no sistema):
- Nome: Ronaldo
- Empreendimento de interesse: vind
- Quartos: 2
- Andar: alto
- Profissão: corretor de imóveis
- O lead mencionou disponibilidade, nas palavras dele: "3ª feira às 17:30". Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário.
=== END CONVERSATION CONTEXT ===
```

> **Isto é a FORMA exigida, e o @dev deve tratá-la como rascunho verificável, não como gabarito
> sagrado.** A AC2 pede o snapshot **byte a byte do que o código realmente produz**, colado no Dev
> Agent Record, com **toda** diferença em relação a este rascunho justificada por escrito. Duas em
> particular: (a) `Current qualification step` — **correção do @po:** a linha **não** sai de
> `getNextQualificationStep`; ela imprime `state.qualification_step`, o valor **persistido**
> (`pipeline.ts:1907-1909`). Para o Ronaldo os dois coincidem em `view` (medido nos dois caminhos:
> o banco grava `view` e `getNextQualificationStep` devolve `view`, score 65) — mas a fixture tem de
> **setar `state.qualification_step`**, não derivá-lo; (b) a data de ancoragem **não** entra na linha
> de citação, de propósito: `data_absoluta` do Ronaldo é `null` e escrever data ali seria inventar.
>
> **(c) 🔴 Terceira diferença, medida pelo @po e ausente do rascunho:** o `conversation_state` do
> Ronaldo tem **`visit_proposed = true`** (`conversation_id c3eb7ee1-a1ac-4b33-8b5f-2ff34c051b9e`).
> O bloco real, portanto, traz **também** a linha *"VOCE JA PERGUNTOU AO CLIENTE SOBRE A VISITA…"*
> logo antes do `=== END CONVERSATION CONTEXT ===`. **Isso é o estado verdadeiro, não regressão** —
> e é justamente o que a AC7 (não-regressão do resto do bloco) tem de preservar byte a byte. Não
> "consertar" a fixture para removê-la.

### 3. O que NÃO muda

`=== CONVERSATION CONTEXT ===`, `Current qualification step:`, as duas linhas de
`visit_explicitly_confirmed`, a `mediaLine` da 75-157 e o `=== END CONVERSATION CONTEXT ===`
continuam **byte a byte** como estão. A única linha que sai é a 1911-1915.

---

## Acceptance Criteria

> Todo vermelho é **colado — saída bruta do reporter — com a FORMA DA MUTAÇÃO escrita ao lado do
> número.** `npx vitest run` da **RAIZ**, nunca `--reporter=basic`, nunca só no arquivo do módulo.
> *(Nota `P1` do gate da 87-8 e `C4` do gate da 87-7.)*

**AC1 — 🔴 A linha do JSON cru some, e o `grep` é a lista de tarefas.**
- `grep -rn 'JSON.stringify(state.collected_data)' packages/ai/src packages/web/src` → **0**
  (**baseline no `HEAD`: 1**, em `pipeline.ts:1913`);
- `grep -rn 'Data collected so far' packages/ai/src packages/web/src` → **0** (**baseline: 1**).
> A régua é literal e não precisa de interpretação humana — é a correção que o @po fez no `grep` da
> AC8-(iii) da 87-8, onde *"um `grep` que precisa de interpretação para ser lido como verde é um
> `grep` que vai ser declarado verde sem ser lido"*.

- **(iii) 🔴 Inventário declarado, acrescentado pelo @po.** O `grep` largo — quem serializa
  `collected_data` **para dentro de um prompt** — tem **baseline 3** e **fica em 2** depois desta
  story. Colar a lista, com o dono de cada linha:

  ```
  packages/ai/src/chat/pipeline.ts:1913          ← ESTA story remove
  packages/ai/src/flows/lead-memory.ts:79        ← 87-10, AC6-b  (permanece após esta story)
  packages/ai/src/flows/haiku-enrichment.ts:90   ← 87-10, AC6-b  (permanece após esta story)
  ```

  *Se o `grep` devolver uma **quarta** linha em `packages/ai`, **PARE** e escale: apareceu um despejo
  que ninguém mapeou.* **Esta AC não pede que os sítios 2 e 3 sejam consertados aqui** — pede que
  eles sejam **contados e nomeados**, para que ninguém leia "0 ocorrências" como "o `collected_data`
  não vai mais a modelo nenhum". Foi exatamente essa leitura que a redação original da story
  autorizava.

**AC2 — 🔴 Turno-ouro: o estado REAL do Ronaldo, byte a byte.**
*Verifica-se:* snapshot inline (não arquivo externo) do bloco produzido a partir do `collected_data`
do §2 do Context, **colado literal na fixture**. Além do byte a byte:
- (i) o prompt **não contém** nenhuma das strings `expira_em`, `ancorado_em`, `"fonte"`, `"origem"`,
  `data_absoluta`, `agenda_state`;
- (ii) o prompt **contém** `3ª feira às 17:30` (a citação **entra** — é a peça honesta do estado) e
  contém `Quartos: 2`;
- (iii) **vermelho:** contra o `HEAD`, (i) falha em todas as seis strings. Colar a saída.

**AC3 — 🔴 Par de fixtures com controle negativo, no MESMO teste.**
- (i) **NEGATIVO** — estado com o `visit_availability` de **2.103 chars** (o da Ivone, colado do
  banco): **nenhum fragmento dele** aparece no prompt, em nenhuma forma (assertar sobre um trecho
  interno da string, não sobre o começo);
- (ii) **POSITIVO** — o mesmo estado com `profissao: "corretor de imóveis"`: **aparece**;
- **vermelho:** contra o `HEAD`, (i) falha e (ii) passa.
> As duas direções no mesmo teste é a disciplina que salvou a AC2 da 87-8 quando a previsão do
> @architect foi falsificada por medição. Uma AC escrita só na direção prevista vira lixo no dia em
> que a medição chega.

**AC4 — Objeto e array desconhecidos nunca são renderizados.**
*Verifica-se:* fixture com uma chave desconhecida cujo valor é `{ segredo: "x" }` e outra cujo valor
é `["a","b"]` → nenhuma das duas aparece; e o `agenda_state` do mesmo estado **aparece**, só como a
linha de citação. **Vermelho:** trocar a guarda de tipo por `String(valor)` → a asserção cai e o
prompt passa a conter `[object Object]`.

**AC5 — 🔴 O cálculo do score não muda.** *(Exigência explícita: o mesmo campo alimenta o peso 20 de
`qualification.ts:17`, que decide `shouldHandoff`.)*
- (i) `git diff HEAD -- packages/ai/src/flows/qualification.ts packages/ai/src/flows/agenda-state.ts`
  = **0 linhas**;
- (ii) `SCORE_WEIGHTS`, `QUALIFICATION_STEPS`, `fieldIsCollected` e `hasAgendaFact` **intocados** —
  conferido no diff;
- (iii) **o renderizador é PURO:** `expect(collectedData).toEqual(structuredClone(original))` depois
  da chamada. *É o vetor real de regressão: um renderizador que apagasse uma chave mudaria o objeto
  persistido e, com ele, o score;*
- (iv) `processMessage` sobre a fixture-ouro devolve **o mesmo `qualificationScore`** que devolve no
  `HEAD` — número colado nos dois lados;
- (v) **vermelho obrigatório:** fazer o renderizador `delete collectedData.bedrooms` → (iii) **e**
  (iv) caem. Colar. *Sem esse vermelho, (iii) passaria mesmo num renderizador que não fosse puro.*

**AC6 — Truncamento e teto, com os números fixados no teste.**
Valor escalar acima de **120** chars entra truncado com `…`; o bloco tem no máximo **12** linhas de
dado. Os dois números aparecem como constantes nomeadas e são assertados. **Vermelho:** subir o
limite para 10.000 → a asserção do (i) da AC3 cai (a fala da Ivone volta a entrar, truncada).

**AC7 — Não-regressão do resto do bloco.**
*Verifica-se:* fixture **sem** `collected_data` e fixture com `visit_proposed` +
`visit_explicitly_confirmed` → o bloco produzido é **byte a byte igual ao do `HEAD`**. Colar as duas
strings. *É o que garante que a subtração é cirúrgica.*

**AC8 — Suíte, tipos e árvore.**
- `npx vitest run` da **RAIZ**: total antes e depois colados, com o delta explicado teste a teste;
- `npx tsc --noEmit` em `packages/ai` → **0**; em `packages/web` → só os pré-existentes
  (satori/sharp/pdf-lib), **nenhum em arquivo tocado**. *(`packages/ai` não tem eslint: `lint` é
  `tsc --noEmit`.)*
- árvore restaurada byte a byte depois das mutações, `md5` conferido.

**AC9 — Janela de observação em produção — e o que ela NÃO mede.**
- 🔴 **Proibido publicar régua de token** (§4 do Context). **Não porque ela seja imensurável** — o
  @po fez o join (`conversation_id` está em 505/505 eventos de `CLAUDE_RESPONSE`) — **mas porque ela
  mede a coisa errada**: contagem de token não diz nada sobre o `[SISTEMA]` ser a autoridade única,
  que é o objetivo desta story. Se alguém quiser medi-la mesmo assim, entra rotulada **não
  conclusiva**, com `n`, **unidade (turno, não conversa)** e denominador declarados.
- **Nenhuma AC depende de "o alerta chegou"** (canal morto, `87-9` não subiu) **nem de "o cron
  rodou"** (`NICOLE_LASTRO_DIARIO` = **0 all-time**). A verificação é `select`.
- **O que se olha, por SQL, 24 h depois do deploy:**
  1. **`M1` e `M4` pela régua da 87-3 rodada À MÃO** (o endpoint aceita `?dry=1`; o cron nunca
     executou) — sem aumento;
  2. `NICOLE_SLOT_UNAUTHORIZED` — **baseline 2 all-time**, os dois em 10/08 00:13–00:14 UTC;
  3. **amostragem dirigida, não aleatória:** 5 conversas cujo `conversation_state.collected_data`
     passa de 120 chars — são elas que mudam de verdade —, lendo a resposta da Nicole antes e
     depois. Consulta para escolhê-las:
     `select conversation_id, length(collected_data::text) from conversation_state order by 2 desc limit 20`.
     > **Nota do @po:** medido por **turno** (join de `CLAUDE_RESPONSE` com `conversation_state`),
     > **51,3 %** dos turnos passam de 120 chars — a amostra dirigida não é um recorte de cauda, é
     > metade do tráfego. Isso torna a amostragem **mais** informativa, não menos, e sustenta a
     > exigência de `n ≥ 5` abaixo.
- **Piso de inconclusividade:** com `n < 5` turnos nessas conversas, a janela **estende**; escreve-se
  **inconclusivo**, nunca "sem regressão". *(Mesmo piso da 87-7 e da 87-8.)*
- **Gatilho de rollback:** **um** caso de a Nicole reperguntar um dado que já estava no
  `collected_data` (nome, empreendimento, quartos) basta. É a regressão específica desta story, e é
  barata de detectar na amostragem dirigida.

---

## Tarefas

- [x] **T0 — Remedir contra produção ANTES do código (somente SELECT).** Colar no Dev Agent Record,
      com a consulta ao lado de cada número: (a) o inventário das 16 chaves; (b) mediana/média/máximo
      e a soma; (c) o `collected_data` do Ronaldo **íntegro**; (d) `n`, mediana e p90 de
      `input_tokens` em 30 d. **Se algum divergir do que está escrito aqui, publicar OS DOIS com o
      método** — não sobrescrever o meu.
- [x] **T1** — `packages/ai/src/prompts/collected-data.ts` com `renderDadosColetados`, as constantes
      nomeadas (120, 12) e os rótulos pt-BR dos 9 campos.
- [x] **T2** — substituir `pipeline.ts:1911-1915` pela chamada. **Uma linha sai, uma entra.**
- [x] **T3** — testes: `collected-data.test.ts` (AC2–AC4, AC6) + asserção sobre o `system` enviado ao
      `fakeAnthropic` no teste de pipeline (AC2, AC5-iv, AC7).
- [x] **T4** — mutações da AC2-(iii), AC3, AC4, AC5-(v) e AC6, cada uma com a **forma escrita** e a
      **saída bruta colada**; árvore restaurada e `md5` conferido.
- [x] **T5** — AC8 e o plano da janela da AC9, com responsável nomeado.

---

## Dev Notes

### Mapa de código

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/chat/pipeline.ts` | 1902-1935 | o bloco `CONVERSATION CONTEXT` inteiro |
| " | **1911-1915** | **a linha que sai** |
| " | 1916-1928 | `visit_proposed` / `visit_explicitly_confirmed` — **não tocar** (AC7) |
| " | 799-800 | o `sistema()` com a *REGRA ABSOLUTA* — a autoridade que esta story protege |
| `packages/ai/src/flows/agenda-state.ts` | 33-49 | `AGENDA_STATE_KEY`, `LEGACY_AGENDA_KEYS` — importar, não redeclarar |
| " | 22-26 | o docstring que autoriza o uso da `citacao` para citar em vez de afirmar |
| `packages/ai/src/flows/qualification.ts` | 15-24, 50 | `SCORE_WEIGHTS` e `fieldIsCollected` — **0 linhas de diff** |
| `packages/ai/src/prompts/index.ts` | 128 | `buildSystemPrompt` do módulo de prompts — **é outro**; o daqui é o local de `pipeline.ts:1876` |

### Armadilhas

1. **São dois `buildSystemPrompt`.** O de `prompts/index.ts` monta os blocos estáticos cacheáveis; o
   que esta story toca é a função **local** de `pipeline.ts:1876`, que monta o bloco 2 (dinâmico, sem
   cache). Mexer no primeiro invalidaria o cache de prompt da 21.3.
2. **O bloco é dinâmico, então não há efeito de cache a medir** — o que reforça o §4: a régua de
   token não tem onde aparecer.
3. **`createFakeSupabase` aplica os predicados de verdade** e a **lista** de `.order()`. Não escrever
   mock novo. Fixtures com `id` em formato **uuid** — com `id` sequencial alinhado ao relógio o teste
   fica verde por acidente (gate da 87-8, V4/V6); em produção `messages.id` é `uuid` e as duas ordens
   concordam em **0 de 20**.
4. **Não transformar a linha de citação num fato.** *"O lead mencionou disponibilidade, nas palavras
   dele"* + a ressalva explícita é o texto; escrever *"disponibilidade: terça 17h30"* recriaria o
   defeito num invólucro mais convincente.

### Fronteiras com outras stories

| story | fronteira |
|---|---|
| **87-4** (em prod) | Dona de `AgendaState` e `LEGACY_AGENDA_KEYS`. Esta story **importa** e **não altera** |
| **87-10** (`W1-2c`) | **Sobe depois desta.** A AC6 dela exige que as chaves novas não vazem — é esta story que garante |
| **87-7** (em prod) | O `ai_summary` continua entrando por `loader.ts:195`; **não é escopo aqui** |
| **W3-1** (Onda 3) | Consumidora direta: é a premissa do bloco de fatos autorizados que esta story torna verdadeira |
| **Epic 88** | Mesma premissa, mesmo benefício |
| **`handoff.ts:138`** | **Fora de escopo.** Vira a **`87-12`** (hotfix próprio, **primeiro** da fila) por decisão do @po em 10/08 — ver `docs/qa/po-validation-87-10-87-11.md` §9 |
| **`87-10` AC6-b** | Os sítios 2 e 3 do inventário da AC1-(iii) são dela, não desta story |

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| 1 | Remover contexto faz a Nicole **reperguntar** algo que já sabia | **Média** | Os 9 campos continuam, agora rotulados. Gatilho de rollback específico na AC9 (um caso basta) e amostragem **dirigida** às conversas que mudam |
| 2 | A linha de citação da agenda ser lida como confirmação de visita | **Média** | A frase carrega a negação explícita, e o `[SISTEMA]` continua com a *REGRA ABSOLUTA*. AC2-(ii) fixa o texto |
| 3 | Um extra útil deixar de aparecer por ser objeto/array | **Baixa** | Medido: **nenhum** dos 5 extras de produção é objeto — os únicos objetos são `agenda_state` (tratado) e nada mais. AC4 fixa a regra para o futuro |
| 4 | Truncar em 120 chars cortar informação legítima | **Baixa** | A mediana de todo o `collected_data` é 46 chars; o que passa de 120 é, medido, resíduo de agenda e prosa |
| 5 | **Muda o que a Nicole vê** — a ressalva do §5 | **Média** | Direção redutora, nenhum `if` novo, AC5 fixa o score, AC7 fixa o resto do bloco byte a byte |
| 6 | Alguém publicar "economizamos X% de contexto" | **Baixa, mas cara** | Proibido por escrito no §4 e na AC9, com a medição que o torna inerte colada ao lado |

## Critério de rollback — escrito ANTES do deploy

Reverter o PR (não há migration; é uma linha de prompt) se, em 24 h:
1. **um** lead for reperguntado sobre dado que já estava no `collected_data`;
2. `M1` ou `M4` subirem na régua da 87-3 rodada à mão;
3. `NICOLE_SLOT_UNAUTHORIZED` subir acima do baseline de **2 all-time** sem novo incidente relatado.

**Responsável nomeado: Marcos** (D7, fechado em 09/08). **Sem nome, não sai.**

---

## Definition of Done

- [x] AC1–AC8 verdes, com os vermelhos **colados** e a forma de cada mutação escrita ao lado
      *(**9** mutações medidas — M0–M7 + a sonda F do @qa —, todas nas **duas populações**; a M3
      prevista pela AC6 foi **falsificada** e a régua foi corrigida — ver Dev Agent Record)*
- [x] T0 remedido, com as consultas coladas *(os dois conjuntos publicados lado a lado; `agenda_state`
      passou de 1 para 2 registros)*
- [x] `git diff` de `qualification.ts`, `agenda-state.ts`, `visit-slot.ts` e `agenda-reconcile.ts` =
      **0 linhas**
- [x] Snapshot do turno-ouro colado no Dev Agent Record, com toda diferença em relação ao rascunho
      do §2 justificada *(4 diferenças, 1 delas minha e justificada por escrito)*
- [x] Suíte da raiz com delta explicado; `tsc` 0 em `packages/ai`
      *(188→190 arquivos · 2.416→**2.444** passed · 6 expected fail; `tsc` 0 em `ai` e em `web`;
      lint 0 errors / 23 warnings = baseline)*
- [x] **C1 do gate R1 — guarda órfã fechada:** a sonda F passou de **0 para 2** vermelhos na suíte da
      raiz, com o vermelho colado e a decomposição de por que caem 2 e não 3 nem 2.444. **Antes da
      87-10**, como o gate pede
- [x] **C2 do gate R1 — contagem republicada com denominador:** M0 `4/6`, M1 `12/14`, M6 `8/10`
      (P1 = 2 arquivos da story / P2 = suíte da raiz), remedidas por mim e não copiadas do gate; a
      bateria **inteira** foi remedida porque os 3 testes novos mudam M3 (3→6) e M7 (5→8)
- [ ] Fila de deploy respeitada: `87-12` → `87-5 A` → `87-5 B` → **`87-11`** → `87-10`, ≥24 h entre
      cada — **@devops.** Situação em 16/08: `87-5 A` em produção desde `2026-08-15T17:25:45Z`;
      **o deploy B da 87-5 ainda NÃO subiu** e é elegível a partir de `2026-08-16T17:25:45Z`.
      **Esta story entra DEPOIS dele**
- [x] Plano da janela (AC9) escrito com responsável nomeado **antes** do merge — **Marcos (D7)**.
      🔴 **Com duas premissas da AC9 derrubadas por medição:** o cron da 87-3 **está rodando**
      (`NICOLE_LASTRO_DIARIO` = 6, não 0) e **`M1`/`M4` estão com `denominador: 0`** — o item 1 da
      AC9 é **inerte** e não pode ser publicado como evidência

---

## Referências

- Epic 87 §7/Onda 1, item `W1-6` (@architect, 07/08 §2.5) — *"enquanto essa linha existir, tratar o
  `[SISTEMA]` como fonte única de fatos autorizados é ficção"*
- `docs/qa/po-validation-87-6-87-7-87-8.md` §3.5 (a ressalva honesta à regra de corte) e §4.5 (o
  `grep` que precisa de interpretação)
- `docs/qa/gates/87.7-*.yml` C2/N2 — régua nova só entra com a contagem de quantos casam por acidente
- `docs/qa/gates/87.8-*.yml` V4/V6, F3, P1 — armadilhas de fixture, instrumento inerte, contagem colada
- `packages/ai/src/flows/agenda-state.ts:22-26` — a `citacao` existe para citar, não para parsear

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

**Implementada por @dev (Dex), modo YOLO, em 2026-08-16, sobre `origin/main` em `199a7a84`.**
Sem migration, sem DDL, sem push. As três leituras de produção são **somente SELECT**.

> ⚠️ **Higiene de árvore, declarada:** os três arquivos do **deploy B da 87-5**
> (`packages/web/src/app/api/cron/enrich-leads/route.ts`, `packages/ai/src/flows/haiku-enrichment.ts`,
> `packages/web/src/app/api/cron/enrich-leads/route.test.ts`) estavam não-commitados na árvore e
> **não foram tocados**. `md5` conferido antes do `pull` e depois de todo o trabalho, idênticos:
> `572219f7df32552b8188d8e040ff2bce` · `471a495084c24dda13b5335acf4b36f2` · `fc25e0552b8f0f0c4269541b4bc6ac50`.
> O `git pull` exigiu resolver **um** conflito, em `docs/stories/87-5-*.story.md` (duas entradas
> distintas de Change Log carimbadas `1.3` — @devops e @po). **As duas foram preservadas**; a colisão
> de número de versão é do arquivo da 87-5 e fica anotada para o dono dela.

---

### T0 — Remedição contra produção (16/08, `dsopqkqjkmhytudaaolv`, Management API, somente SELECT)

**Nenhum número do @sm/@po foi sobrescrito. Os dois conjuntos vão lado a lado**, como a T0 exige. As
divergências são de **6 dias de tráfego**, não de método: as consultas são as mesmas.

**(a) Inventário das chaves** — `select k, count(*) from conversation_state, lateral jsonb_object_keys(collected_data) k group by k order by 2 desc`

| chave | @sm 10/08 | @dev 16/08 | | chave | @sm 10/08 | @dev 16/08 |
|---|---|---|---|---|---|---|
| `property_interest` | 176 | **193** | | `cidade_bairro` | 8 | **10** |
| `name` | 163 | **181** | | `visit_pending_date` | 9 | **9** |
| `bedrooms` | 164 | **180** | | `profissao` | 6 | **8** |
| `floor` | 72 | **74** | | `agenda_state` | 1 | **2** |
| `visit_availability` | 56 | **56** | | `situacao_moradia` | 1 | **2** |
| `source` | 53 | **53** | | `estado_civil` | 1 | **1** |
| `view` | 38 | **40** | | `filhos` | 1 | **1** |
| `garages` | 30 | **31** | | `has_down_payment` | 12 | **14** |

**São as MESMAS 16 chaves, chave a chave. Nenhuma nova.** A regra estrutural da AC4 (objeto/array
nunca renderizado) continua sendo a única guarda contra a 17ª.

🔴 **Uma divergência que MUDA a leitura do §2:** `agenda_state` passou de **1** para **2**. O
segundo é a lead **Rita** (`d3f8dae6-…`, `updated_at 2026-08-15 12:31:36`), e ela é o caso
**complementar** ao do Ronaldo: `citacao: "Terça"`, `hora: null`, `minuto: null`,
`data_absoluta: "2026-08-18"`. Ou seja — os dois registros vivos de produção cobrem as duas metades
do formato (um com hora e sem data, outro com data e sem hora), e **em nenhum dos dois a data de
ancoragem pode ser impressa como fato**. A decisão do §2 (a citação cita, não afirma) sobrevive à
remedição com uma amostra 2× maior.

**(b) Tamanhos** — `select count(*), percentile_cont(0.5) …, avg, max, sum from conversation_state`

```
                          @sm 10/08   @dev 16/08
linhas ..................    254         283
… com collected_data ....    236         259
mediana .................     46 (47 @po)   46
média ...................    116         110
máximo ..................  2.103       2.103   ← o registro da Ivone, INTACTO
soma ....................  29.487      31.121
visit_availability > 120       38          38   ← idêntico
```

**(c) `collected_data` do Ronaldo — IDÊNTICO, byte a byte**, 356 chars, `updated_at 2026-08-10
00:30:17`, `conversation_id c3eb7ee1-a1ac-4b33-8b5f-2ff34c051b9e`. Confirmados também os dois campos
que o @po acrescentou (E7): `qualification_step = 'view'` e **`visit_proposed = true`**.

**(d) `input_tokens`** — `CLAUDE_RESPONSE`, 30 d

```
              @sm/@po 10/08   @dev 16/08
n ..............   505           477
com conversation_id 505/505     477/477   ← o join do @po continua existindo
mediana ........ 1.802         1.876
p90 ............ 2.400         2.506
máximo ......... 4.853         4.853
```

**Nenhuma régua de token é publicada** (§4 do Context / AC9). Os números acima entram como T0, não
como resultado — e a proibição fica pela razão do @po: eles medem a coisa errada.

---

### AC1 — 🔴 A régua de `grep` da story está ERRADA como escrita, e eu a corrigi por medição

**Cheguei ao `grep` da AC1 com o código pronto e ele deu `5` e `9`, não `0`. Todas as ocorrências
novas eram COMENTÁRIO MEU** documentando a linha removida.

Isto é a armadilha que a própria AC1 cita (*"um `grep` que precisa de interpretação para ser lido
como verde é um `grep` que vai ser declarado verde sem ser lido"*) — só que aplicada contra ela
mesma. E há um problema **estrutural**, não de disciplina: **um teste que asserta a AUSÊNCIA de uma
string precisa conter a string.** `pipeline-collected-data.test.ts` tem `"Data collected so far"`
quatro vezes, e as quatro são load-bearing (é o `HEAD` capturado e o filtro que produz a régua da
AC7). A régua da AC1, escrita sobre `packages/ai/src packages/web/src` sem recorte, **é inatingível
com testes honestos**.

**O que eu fiz:** (1) reescrevi todos os comentários meus para não repetirem a string literal;
(2) **declarei a população**, que é o que este epic cobra em toda régua.

**POPULAÇÃO A — código de produção (`packages/{ai,web}/src`, EXCLUINDO `*.test.ts`). É esta a régua
literal, e ela é 0 sem interpretação nenhuma:**

```
$ grep -rn -F 'JSON.stringify(state.collected_data)' packages/ai/src packages/web/src | grep -v '\.test\.ts' | wc -l
0          (baseline no HEAD: 1, em pipeline.ts:1907)
$ grep -rn -F 'Data collected so far' packages/ai/src packages/web/src | grep -v '\.test\.ts' | wc -l
0          (baseline no HEAD: 1)
```

**POPULAÇÃO B — crua, tudo, inclusive testes. Publicada com cada linha NOMEADA**, porque é a única
forma de a régua não precisar de fé:

```
JSON.stringify(state.collected_data) ......... 0   (zero, mesmo cru)
Data collected so far ........................ 5, TODAS em teste:
  pipeline-collected-data.test.ts:237   ← item da lista MAQUINARIO (asserção de ausência)
  pipeline-collected-data.test.ts:307   ← o bloco do HEAD capturado, literal (AC7-b)
  pipeline-collected-data.test.ts:317   ← o filtro `semJsonCru()` que produz a régua da AC7
  pipeline-collected-data.test.ts:342   ← "a régua não nasce satisfeita": o HEAD TINHA a linha
  pipeline-corretor-no-historico.test.ts:1066 ← a aritmética do +119 na recaptura dos hashes
```

**AC1-(iii) — inventário declarado. Baseline 3 em `packages/ai`, fica 2.** Consulta:
`grep -rnE 'JSON\.stringify\([^)]*[Cc]ollected[Dd]ata|JSON\.stringify\([^)]*collected_data' packages/ai/src packages/web/src | grep -v '\.test\.ts'`

```
packages/ai/src/chat/pipeline.ts:1907          ← ESTA story REMOVEU        ✅ (era o sítio 1)
packages/ai/src/flows/lead-memory.ts:79        ← 87-10 AC6-b  — PERMANECE ABERTO
packages/ai/src/flows/haiku-enrichment.ts:105  ← 87-10 AC6-b  — PERMANECE ABERTO
─────────────────────────────────────────────────────────────────────────────────
packages/web/.../leads/[id]/summary/route.ts:105  ← o QUARTO, declarado pelo @po:
                                                     resumo para HUMANO, fora de escopo,
                                                     sem realimentação
```

**`packages/ai` tem exatamente 2, não 4 — nenhum despejo novo apareceu. Não houve o que escalar.**
*(Nota: `haiku-enrichment.ts` está em `:105` e não em `:90` porque o deploy B da 87-5, não commitado,
desloca o arquivo. O sítio é o mesmo.)*

---

### AC2 — Turno-ouro: o bloco byte a byte, colado do que o código PRODUZ

**Do módulo puro** (`renderDadosColetados`, 7 linhas):

```
Dados já coletados nesta conversa (podem ter vindo da fala do lead OU de inferência da própria conversa — NÃO são fatos verificados no sistema):
- Nome: Ronaldo
- Empreendimento de interesse: vind
- Quartos: 2
- Andar: alto
- profissao: corretor de imóveis
- O lead mencionou disponibilidade, nas palavras dele: "3ª feira às 17:30". Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário.
```

**Do `system` real, através de `processMessage`** (é este o snapshot da AC2, e é o que está no teste):

```
=== CONVERSATION CONTEXT ===
Current qualification step: view
Dados já coletados nesta conversa (podem ter vindo da fala do lead OU de inferência da própria conversa — NÃO são fatos verificados no sistema):
- Nome: Ronaldo
- Empreendimento de interesse: vind
- Quartos: 2
- Andar: alto
- profissao: corretor de imóveis
- O lead mencionou disponibilidade, nas palavras dele: "3ª feira às 17:30". Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário.
VOCE JA PERGUNTOU AO CLIENTE SOBRE A VISITA. Aguarde a resposta. NAO pergunte novamente sobre interesse em visitar — voce ja perguntou. Se o cliente der um dia especifico com confirmacao positiva, anote e confirme o agendamento.
=== END CONVERSATION CONTEXT ===
```

**Diferenças em relação ao rascunho do §2 — TODAS justificadas:**

| # | diferença | justificativa |
|---|---|---|
| 1 | `- profissao:` e não `- Profissão:` | **Minha, e é a única não prevista.** A regra normativa é a do §1 do Desenho (*"outras chaves escalares → `- chave: valor`"*). Capitalizar exigiria um **segundo mapa de rótulos** para as chaves não-canônicas — que é a *"allow-list fechada"* que o próprio §1 proíbe por *"matá-los em silêncio"*, só que com a morte adiada para a próxima chave nova. O nome da chave já é pt-BR legível nos cinco extras reais (`profissao`, `cidade_bairro`, `filhos`, `estado_civil`, `situacao_moradia`) |
| 2 | a data de ancoragem não entra na citação | já previsto no §2. `data_absoluta` é `null` no Ronaldo — e a remedição encontrou o caso espelhado (Rita: data presente, hora `null`), o que **reforça** a decisão |
| 3 | a linha *"VOCE JA PERGUNTOU…"* está presente | já previsto pelo @po (E7): `visit_proposed = true` é o estado verdadeiro. **Não "consertei" a fixture** |
| 4 | `Current qualification step` vem do valor persistido | @po (E7). A fixture **seta** `qualification_step: 'view'`, não deriva. E o helper de teste usa `=== undefined` e não `??` — descobri por vermelho que `null ?? "view"` fazia o cenário (c) da AC7 medir o default do helper em vez do código |

**AC2-(iii) — o vermelho contra o `HEAD`, colado.** Forma da mutação: `git checkout -- packages/ai/src/chat/pipeline.ts` (volta o despejo cru). A asserção é **uma só, sobre a lista do que vazou** — seis `not.toContain` em sequência parariam na primeira e mostrariam UMA string:

```
AssertionError: expected [ 'expira_em', 'ancorado_em', …(5) ] to deeply equal []

- Expected
+ Received

- Array  []
+ Array [
+   "expira_em",
+   "ancorado_em",
+   "\"fonte\"",
+   "\"origem\"",
+   "data_absoluta",
+   "agenda_state",
+   "Data collected so far",
+ ]
```

E o bloco que o `HEAD` produz, capturado no mesmo run:

```
=== CONVERSATION CONTEXT ===
Current qualification step: view
Data collected so far: {"name":"Ronaldo","floor":"alto","bedrooms":2,"profissao":"corretor de imóveis","agenda_state":{"hora":17,"fonte":"pendencia","minuto":30,"origem":"lead","citacao":"3ª feira às 17:30","periodo":null,"expira_em":"2026-08-12T00:15:45.465Z","ancorado_em":"2026-08-10T00:15:45.465Z","data_absoluta":null},"property_interest":"vind"}
VOCE JA PERGUNTOU AO CLIENTE SOBRE A VISITA. …
=== END CONVERSATION CONTEXT ===
```

---

### T4 — Bateria de mutações: **medida, não declarada**

Protocolo em todas: **aplicar · rodar · ler · reverter · `md5`**. Rodada **três vezes** — durante o
desenvolvimento, contra os arquivos finais, e **inteira de novo em 16/08 para fechar a C2 do gate R1**,
com as **duas populações declaradas lado a lado**. `md5` de referência:
`collected-data.ts = dd55a5e2d9bfae89ce16b7d4dd0ad0d4`.

> 🔴 **C2 do gate — a contagem que eu publiquei era de população estreita, e o @qa está certo.**
> Os números `4 / 12 / 8` de M0, M1 e M6 são a contagem nos **dois arquivos da story**; na **suíte da
> raiz**, que é o que a AC8 pede, são **6 / 14 / 10**. É **subestimação, não inflação** — mas é
> exatamente a classe de defeito que eu mesmo consertei na régua de `grep` da AC1 (*uma régua cujo
> denominador não está escrito*), reaparecida na régua vizinha. **Republicado com as duas populações,
> remedido por mim mutação a mutação, e não copiado do gate.**
>
> **As duas populações:**
> **P1** = os dois arquivos da story (`prompts/collected-data.test.ts` + `chat/pipeline-collected-data.test.ts`) —
> **28 testes** de verde de referência (eram 25 antes da régua da C1).
> **P2** = `npx vitest run` da **RAIZ** — **190 arquivos · 2.444 passed · 6 expected fail**.

| # | forma da mutação | **P1** (28) | **P2** (2.444) | o que isso prova |
|---|---|---|---|---|
| **M0** | `git show HEAD:pipeline.ts` — o despejo cru volta | **4** | **6** | a subtração é o que produz o bloco novo. Cai a AC2 inteira **e** a AC7-(b) |
| **M1** | `valorEscalar()`: o `return null` final vira `return String(valor)` | **12** | **14** | a guarda ESTRUTURAL contra objeto/array. O prompt passa a conter `- Vista: undefined` e o objeto desconhecido |
| **M2** | `renderDadosColetados()` ganha `delete collectedData.bedrooms` | **10** | **10** | **o vetor real de regressão.** Caem a AC5-(iii) *e* a AC5-(iv) |
| **M3** | `VALOR_MAX_CHARS: 120 → 10000` | **6** | **6** | o truncamento — **5 comportamentais + 1 de constante** *(era 3 antes da régua da C1)* |
| **M4** | `MAX_LINHAS_DADOS: 12 → 500` | **2** | **2** | o teto de linhas (1 comportamental + 1 de constante) |
| **M5** | `NAO_RENDERIZAVEIS` perde o spread `...LEGACY_AGENDA_KEYS` | **3** | **3** | o filtro de legado. É ele — e não o truncamento — que mata a fala da Ivone |
| **M6** | o retorno deixa de prefixar `CABECALHO_DADOS_COLETADOS` | **8** | **10** | o cabeçalho de instrução é a substância da story, não enfeite |
| **M7** | a linha de agenda perde a negação e vira `- Disponibilidade: <citacao>` | **8** | **8** | *"não transformar a citação num fato"* (Armadilha 4) tem régua própria *(era 5)* |
| **F** | 🔴 **sonda do @qa:** `truncar(state.citacao)` → `state.citacao` | **2** | **2** | o truncamento da **citação** — **era `0 / 0`**, é a guarda órfã do achado A1. Ver a C1 abaixo |

**Onde as duas populações DIVERGEM, e por quê — a divergência não é aleatória, é nominal:** só M0, M1
e M6 divergem, e os `+2` são **sempre os mesmos dois testes**, os turnos-ouro da AC10 da **87-5**
(`pipeline-corretor-no-historico.test.ts`), que eu nomeio um a um:

```
× 87-5 AC10 > turno-ouro (a) 4 mensagens, com fala da Nicole → bloco de não-reintro presente
× 87-5 AC10 > turno-ouro (b) primeira mensagem, só o lead   → SEM bloco de não-reintro
```

M2/M3/M4/M5/M7/F **não** os derrubam porque as fixtures da 87-5 usam `collectedData: { name: "Ana" }` —
que não tem `bedrooms` (M2), não passa de 120 chars (M3), não chega a 12 linhas (M4), não é chave
legada (M5) e **não tem `agenda_state`** (M7 e F). Ou seja: os três que divergem são exatamente os
três que mexem na **forma do bloco inteiro**, que é o que aquelas fixtures medem por `sha256`.

**Saída bruta de M2** (a que a AC5-(v) exige), no teste do `qualificationScore`:

```
AssertionError: expected 55 to be 65 // Object.is equality
- Expected
+ Received
- 65
+ 55
```

**55 = 65 − 10, que é exatamente o peso de `bedrooms` no `SCORE_WEIGHTS`.** Sem este vermelho, a
AC5-(iii) passaria num renderizador impuro cujo efeito colateral não aparecesse na comparação do
objeto.

**Saída bruta de M1** (a que a AC4 exige):

```
AssertionError: expected 'Dados já coletados nesta conversa (po…' not to contain 'chave_nova_objeto'
+ Dados já coletados nesta conversa (…):
+ - Nome: Ronaldo
+ - Empreendimento de interesse: vind
+ - Quartos: 2
+ - Andar: alto
+ - Vista: undefined
+ - Vagas: undefined
+ - Tem entrada disponível: undefined
+ - Como conheceu: undefined
```

#### 🔴 M3 — a mutação prevista pela AC6 foi **FALSIFICADA por medição**

A AC6 previa: *"subir o limite para 10.000 → a asserção do (i) da AC3 cai (a fala da Ivone volta a
entrar, truncada)"*. **Medido: NÃO cai.** Com `VALOR_MAX_CHARS = 10000` a AC3-(i) continuou verde.

**Por quê:** a fala da Ivone mora em `visit_availability`, que é `LEGACY_AGENDA_KEYS`. Ela some pelo
**FILTRO**, não pelo truncamento. São **duas guardas independentes** e a story conflou as duas —
exatamente a classe de erro que a memória do epic chama de *"campos colineares dão verde falso"*, só
que aqui o colinear é a **causa** e não o campo.

**Consequência prática, e ela deixa a story MAIS forte, não mais fraca:** eu acrescentei uma régua
que exercita o truncamento onde ele é a **única** guarda — prosa longa numa chave **não-legada**, que
é cenário real (os extras são escritos em texto livre pelo Haiku do cron, último escritor de 70 % dos
estados). Usei a **mesma prosa de produção** da Ivone posta em `cidade_bairro`. Com ela:

- **M3 passa a derrubar 3 testes** (era 2), e um deles é comportamental sobre dado real;
- **M5 ganha vermelho dedicado e disjunto** (3 testes) para o filtro de legado.

Cada guarda tem agora o seu próprio vermelho. **Antes desta medição, subir o teto para 10.000 teria
passado por um QA que só conferisse a AC6 como escrita.**

*(Declarado sem eufemismo: dos 3 testes que M3 derruba, **1 é a asserção das constantes**
(`expect(VALOR_MAX_CHARS).toBe(120)`) — que é declaração, não comportamento. A AC6 pede que os dois
números sejam assertados, e eles são; mas quem contar 3 como "3 vermelhos comportamentais" estará
contando errado. São **2**. Mesma ressalva vale para M4: dos 2, **1** é comportamental.)*

> **Atualização de 16/08 (C1):** com a régua da citação, **M3 passou de 3 para 6**, dos quais **5 são
> comportamentais** e 1 continua sendo a asserção de constante. Os 3 novos são os testes da C1 — eles
> sentem o teto porque a expectativa deles é escrita **em função de `VALOR_MAX_CHARS`**, não com 120
> hard-coded. Isso é bom para M3 e **não** serve como vermelho da guarda órfã: o vermelho dela é a
> **sonda F**, que é a única mutação que isola o `truncar()` da citação. Ver a C1 abaixo.

---

### 🔴 C1 do gate R1 — a guarda ÓRFÃ do truncamento da citação agora tem vermelho: **0 → 2**

**O achado A1 do @qa é meu defeito e ele está certo.** Nenhuma das minhas 25 asserções media o
**comprimento** da citação: a maior fixture era `"3ª feira às 17:30"` (17 chars). Remover o
`truncar()` da linha de agenda deixava **2.441 testes verdes**. A guarda funcionava e não tinha régua.

**Por que ela é load-bearing — são DUAS réguas, e elas não são a mesma.** Conferi as duas linhas:

```
escrita  agenda-state.ts:149   citacao: input.citacao.trim().slice(0, CITACAO_MAX)   → 280
leitura  agenda-state.ts:190   citacao: o.citacao,                                   → SEM relimite
```

**280 > 120.** Uma citação de 121–280 chars é valor **legítimo, produzido pelo escritor oficial**, e
o `truncar()` daqui é o único ponto que a impede de entrar inteira no prompt. E a leitura não
relimita — logo o que chegar por outro caminho não tem teto nenhum.

**As duas fixtures cobrem as duas procedências que o A1 nomeia**, e nenhuma é sintética:

- **(a) o máximo que o escritor legítimo produz.** Passei a **fala real da Ivone** pelo escritor real,
  `buildAgendaState({ citacao: FALA_DA_IVONE, … })` — que é literalmente o que o `processMessage`
  grava quando o lead fala longo. Sai com **280 chars**. Preferi isso a `"x".repeat(279)`: a fixture
  passa a ser o **estado futuro real**, não uma string de laboratório. A asserção da desigualdade é
  `expect(citacao.length).toBeGreaterThan(VALOR_MAX_CHARS)` e **não** `toBe(280)` — o que é
  load-bearing é a **relação** entre as duas réguas, não o número da escrita;
- **(b) gravada por outro caminho** (`jsonb` cru, 500 chars, sem passar por `buildAgendaState`) —
  é a metade do A1 sobre *"qualquer registro gravado por outro caminho, ou por um escritor futuro"*.
  Aqui `CITACAO_MAX` **não está no caminho**: o único teto do sistema inteiro é o `truncar()` desta
  story.

**Vermelho MEDIDO, na suíte da RAIZ.** Forma da mutação (a sonda F do @qa, literal):
`` `- … dele: "${truncar(state.citacao)}". ` `` → `` `- … dele: "${state.citacao}". ` ``

```
 Test Files  1 failed | 189 passed (190)
      Tests  2 failed | 2442 passed | 6 expected fail (2450)

 FAIL  packages/ai/src/prompts/collected-data.test.ts > AC6 (C1) … > 🔴 (a) citação no MÁXIMO que o escritor legítimo produz (280) entra com 120 + `…`
AssertionError: expected '- O lead mencionou disponibilidade, n…' not to contain 'Portal das Torres'
Received: "- O lead mencionou disponibilidade, nas palavras dele: "Olá, o meu nome é Ivone, … e tem um
 terreno também no Portal das Torres que eu coloquei à venda, porque eu moro sozinha e eu preciso de
 segurança, ". Isso NÃO é visita marcada — só o bloco [SISTEMA] confirma dia e horário."

 FAIL  packages/ai/src/prompts/collected-data.test.ts > AC6 (C1) … > 🔴 (b) citação gravada por OUTRO caminho (jsonb cru, 500 chars) também é truncada
AssertionError: expected '- O lead mencionou disponibilidade, n…' not to contain 'Deus queira que eu não precise'
Received: "- O lead mencionou disponibilidade, nas palavras dele: "Olá, o meu nome é Ivone, … se eu
 precisar, Deus queira que eu não precise, que até h". Isso NÃO é visita marcada — …"
```

**`Received` é o dano, não só a falha:** 280 e 500 chars de fala livre do lead entrando no prompt
como citação. É a mesma classe de despejo que esta story existe para remover, num invólucro menor.

#### **Caem 2. Por que não caem os outros — decomposto, não afirmado**

**A pergunta do lead é a certa, e a resposta tem duas partes.**

**(1) Por que não caem os 2.442 restantes.** Porque **nenhuma outra fixture da suíte inteira tem
citação acima de 120 chars** — e isso não é omissão, é o retrato de produção: os **dois** únicos
`agenda_state` vivos têm citação de **17** (`"3ª feira às 17:30"`, Ronaldo) e **5** chars
(`"Terça"`, Rita). Sob a sonda F esses estados renderizam **byte a byte igual**, porque
`truncar()` é identidade abaixo do teto. Um teste que caísse aí estaria medindo outra coisa. É
também a razão pela qual **não há exposição em produção hoje**: falta a régua, não o código.

**(2) Por que caem 2 e não 3 — o terceiro teste é declarado VERDE de propósito.** Escrevi três, e o
`(c)` é **controle de fronteira** (citação de exatamente 120 chars **não** é truncada). Declarei
antes de medir que ele **não** conta como vermelho da guarda órfã, e a medição confirmou:
sob F ele fica **verde**, porque abaixo do teto o `truncar()` não faz nada. Ele não é enfeite — é o
que impede o conserto grosseiro (um `slice` incondicional, que poria `…` nas duas citações vivas de
produção e transformaria `"Terça"` em fala cortada). **Contar 3 aqui seria contar errado. São 2.**

**(3) Quantos casam por ACIDENTE — publicado ao lado do número.** Os três testes novos **também**
caem em **M3** (teto 120→10.000) e em **M7** (a citação vira afirmação), porque assertam a linha
**inteira** e escrevem a expectativa em função de `VALOR_MAX_CHARS`. Isso é cobertura legítima e
**não** é o vermelho da guarda órfã: a sonda **F** é a única mutação da bateria que isola o
`truncar()` da citação de todo o resto, e é por ela que a C1 se mede. Nas outras seis mutações
(M0, M1, M2, M4, M5, M6) os três ficam **verdes** — medido, não suposto.

**Efeito nas réguas:** `+3` testes (25 → **28** nos dois arquivos da story; 2.441 → **2.444** na
raiz), **0 linhas** de diff em `collected-data.ts` — a C1 é **só teste**. `agenda-state.ts` continua
com **0 linhas** de diff: o teste **importa** `buildAgendaState`, não o altera.

---

### 🔴 C5 do gate R2 — o TERCEIRO sítio de `truncar()`: **0 → 1** vermelho

**O achado A6 procede inteiro e o método que o escondeu era meu.** No R1 eu isolei **um** dos três
sítios de `truncar()` (a citação, sonda F), publiquei aquela guarda órfã e parei. A mutação que eu
usava para o truncamento em geral — **M3, que mexe em `VALOR_MAX_CHARS`** — muta a **constante
compartilhada**: ela acende os três sítios ao mesmo tempo e, por isso, **não distingue** um sítio
coberto de um sítio descoberto. É o mesmo defeito de método que o @qa nomeou como campos colineares,
em outra roupa: uma mutação que toca N caminhos de uma vez dá **um** número e não N.

Reisolei sítio a sítio (a tabela é a do @qa, reconferida por mim):

| sítio em `collected-data.ts` | sonda | vermelhos |
|---|---|---|
| `:160` citação | F (`truncar(state.citacao)` → `state.citacao`) | 2 — fechado pela C1 |
| `:184` **rotulados** | **I** (`truncar(valor)` → `valor` no laço de `ROTULOS_QUALIFICACAO`) | **0 → 1** |
| `:196` extras | J (idem, no laço dos extras) | 2 — `profissao` e `cidade_bairro` |

**NÃO é mutante equivalente, e a prova é por execução, não por leitura.** Com a SONDA I aplicada:

```
SONDA I — remover truncar() do sítio :184 (só ele; VALOR_MAX_CHARS intocada)

 Test Files  1 failed | 189 passed (190)
      Tests  1 failed | 2439 passed | 6 expected fail (2446)

 FAIL  packages/ai/src/prompts/collected-data.test.ts
       > AC6 (C5) … > 🔴 prosa de produção em `name` (campo rotulado) entra com 120 + `…`

guarda presente  → linha "- Nome:" = 129 chars  · reticência: sim · "Portal das Torres": não
SONDA I aplicada → linha "- Nome:" = 1989 chars · reticência: não · "Portal das Torres": SIM
```

Os dois números batem com os do @qa **ao caractere**, e não por acaso: a fixture é a **mesma fala da
Ivone** (`FALA_DA_IVONE`, **1.981** chars — `"- Nome: "` são 8, logo `1.981 + 8 = 1.989`;
`8 + 120 + 1 = 129`). Eu não escolhi o número, eu medi qual fixture o produz.

**Por que a fixture é `name` e não uma string sintética.** O mecanismo já foi observado: quem escreve
os oito campos rotulados é o **modelo** (Haiku do cron `enrich-leads`, último escritor de 70 % dos
estados), a partir de texto livre. O registro real da Ivone — **a fixture desta própria story** — tem
`name: "Tudo"`: a fala inteira caiu em `visit_availability` e um pedaço dela virou "nome". Pôr a fala
inteira em `name` não é hipótese de laboratório, é a **versão pior do erro que já aconteceu**.
**Sem exposição hoje**, e declarado: o maior rotulado vivo é `name`, com **49** chars; zero acima
de 120.

**A fixture ISOLA um sítio só** — é a correção de método, não só de cobertura. O objeto é
`{ name: FALA_DA_IVONE }` e nada mais: **sem `agenda_state`** (não toca `:160`) e **sem extra longo**
(não toca `:196`). Logo o vermelho deste teste aponta para **um** sítio, e um `truncar()` reposto em
qualquer um dos outros dois **não** o apaga.

**Declarado, para ninguém contar órfão onde não há:** eu **não** escrevi o controle de fronteira
deste sítio (valor de exatamente 120 chars não ganhar `…`). Ele já é medido pelo **turno-ouro da
AC2**, cujo `toEqual` byte a byte exige `- Nome: Ronaldo` — um `slice` incondicional em `:184` já
nasce vermelho lá. Um segundo controle seria régua duplicada, não vermelho novo. Pela mesma
disciplina, mantenho registrados como **mutantes equivalentes** os dois que o @qa isolou (SONDA N,
`Number.isFinite` — `jsonb` não representa `NaN`; e SONDA O, `AGENDA_STATE_KEY` sozinho — a guarda
estrutural o absorve).

**A7 aceita e corrigida na fonte:** `2.103` é o comprimento do **JSON serializado**, não o da fala
(**1.981**). O número viajou errado desde o parecer do @po; ele fica no docstring de `VALOR_MAX_CHARS`
porque lá a frase é sobre o **registro**, mas o teste novo asserta `1.981` explicitamente, o que
impede o número errado de voltar por cópia.

**Efeito nas réguas:** `+1` teste (28 → **29** nos dois arquivos da story; 2.439 → **2.440** passed na
raiz), **0 linhas** de diff em `collected-data.ts` — a C5 é **só teste**, `md5` `dd55a5e2…` conferido
antes e depois da sonda.

---

### Autocrítica: duas perdas silenciosas possíveis, MEDIDAS antes de eu declarar a story pronta

A story diz *"a direção é redutora"*, e redutor significa que **alguma coisa deixa de chegar ao
modelo**. Fui procurar o que, em vez de confiar na tabela de admissão.

**(1) `visit_explicitly_confirmed` deixa de aparecer quando `visit_proposed` é `false`.** No `HEAD`
ela ia dentro do JSON cru **sempre**; agora ela só existe nas duas linhas dedicadas do `pipeline.ts`,
que estão **dentro** do `if (state.visit_proposed)`. Se houvesse registro com a chave e sem o
`visit_proposed`, a story apagaria um fato de visita confirmada. **Medido:**

```sql
select count(*) filter (where collected_data ? 'visit_explicitly_confirmed')              as tem,
       count(*) filter (where collected_data ? 'visit_explicitly_confirmed'
                          and visit_proposed is not true)                                  as sem_proposed,
       count(*) filter (where visit_proposed is true)                                      as proposed_true
from conversation_state;
```
```
tem = 0 · sem_proposed = 0 · proposed_true = 8
```

**A chave não existe em NENHUM registro de produção.** A exclusão é gratuita — e, de quebra, fica
registrado que o ramo `if (collected?.visit_explicitly_confirmed)` de `pipeline.ts` **nunca dispara
hoje**: os 8 registros com `visit_proposed` caem todos no `else`.

**(2) A guarda estrutural (objeto/array nunca renderizado) pode matar informação real.** É o Risco 3
da story, que dizia *"nenhum dos 5 extras é objeto"*. Medi mais largo — **todas** as 853 entradas de
`collected_data` de produção, por tipo:

```sql
select jsonb_typeof(v), count(*), string_agg(distinct k, ', ')
from conversation_state cs, lateral jsonb_each(cs.collected_data) as e(k,v) group by 1;
```
```
string ... 628  (12 chaves)   number ... 211  (bedrooms, garages)
boolean ...  14  (has_down_payment)
object ...    2  (agenda_state, e SÓ ele)        array ...  0
```

**851 de 853 valores são escalares e passam. Os 2 objetos são `agenda_state`, que tem linha
dedicada. Não existe um único array em produção. A guarda não perde nada hoje** — e continua sendo o
que impede o próximo objeto de chaves de máquina de vazar sem ninguém reabrir esta story.

---

### AC5 — o cálculo do score não muda

- **(i)** `git diff HEAD -- packages/ai/src/flows/qualification.ts packages/ai/src/flows/agenda-state.ts`
  → **vazio, 0 linhas**. Idem para `visit-slot.ts` e `agenda-reconcile.ts` (exigência da DoD).
- **(ii)** `SCORE_WEIGHTS`, `QUALIFICATION_STEPS`, `fieldIsCollected` e `hasAgendaFact` **intocados** —
  os arquivos inteiros têm 0 linhas de diff, então não há o que conferir linha a linha.
- **(iii)** pureza: `expect(estado).toEqual(structuredClone(original))` depois da chamada, em duas
  fixtures (a do Ronaldo e a da Ivone, esta última confirmando que as chaves legadas são
  **filtradas, não apagadas** — quem apaga é `stripLegacyAgendaKeys`, depois, com evento).
- **(iv)** `processMessage` sobre a fixture-ouro devolve **65** nos dois lados. Controle positivo no
  mesmo bloco: sem o `agenda_state` o score é **45** — a diferença é o peso 20, exatamente. Uma
  asserção de score que não distinguisse nada seria régua saturada.
- **(v)** vermelho de M2 colado acima: caem (iii) **e** (iv).

---

### AC7 — não-regressão, e uma correção de redação que a medição impôs

A AC7 pede *"o bloco produzido é byte a byte igual ao do `HEAD`"* para uma fixture que **tem**
`collected_data`. Medido, isso é autocontraditório: a linha do JSON cru é justamente a que a story
remove, e ela estava lá no `HEAD`. **A régua implementada é `HEAD menos, e só menos, a linha do JSON
cru`** — que é o que a story promete de verdade, e é mais forte, porque fixa que o delta é **UMA
linha**:

- **(a)** estado **sem** `collected_data` → igualdade **TOTAL**, e este teste **passa verde contra o
  `HEAD`** de propósito. É o cenário que prova que a story não mexeu no bloco, só na linha.
- **(b)** `visit_proposed` + `visit_explicitly_confirmed` → `semJsonCru(HEAD)`, com duas asserções
  que impedem a régua de nascer satisfeita: o `HEAD` **contém** a linha, e o resultado tem **5**
  linhas. `HEAD` capturado por `git checkout` de `pipeline.ts`, com `md5` restaurado.
- **(c)** controle positivo: `qualification_step` nulo continua suprimindo a própria linha — é o que
  prova que a régua (a) mede a **linha do passo** e não a existência do bloco.

**As duas linhas de `visit_explicitly_confirmed`, a `mediaLine` da 75-157 e os dois marcadores estão
byte a byte como estavam.**

---

### 🔴 Efeito colateral encontrado e tratado: os dois hashes-ouro da 87-5

A suíte cheia acusou **2 falhas** que não eram minhas ACs: os turnos-ouro SHA-256 da **AC10 da
87-5** (`pipeline-corretor-no-historico.test.ts`). Elas usam `collectedData: { name: "Ana" }`, logo
**sentem esta story legitimamente**. Recapturei os dois hashes **com a aritmética escrita ao lado**,
que é o que distingue "atualizei o snapshot" de "sei por que ele mudou":

```
antes: `Data collected so far: {"name":"Ana"}`                    37 chars
agora: cabeçalho (144) + "\n" + `- Nome: Ana` (11)               156 chars
delta:                                                          +119 chars

cenário (a): 30.256 → 30.375   (+119)   sha 3ec9480d… → 9855159b…
cenário (b): 30.082 → 30.201   (+119)   sha d634f39e… → 9a1414a4…
```

**Os DOIS cresceram exatamente +119.** Que o delta seja idêntico nos dois é a prova de que só a linha
certa mudou: o `dynamicSuffix` dos dois cenários é diferente, o `collected_data` é o mesmo. A AC10 da
87-5 continua íntegra (`ROTULO_CORRETOR_PREFIXO` segue ausente nas duas).

---

### 🔴 Defeito meu, encontrado pela suíte e registrado como gotcha

Um comentário meu em `collected-data.ts` continha `packages/*/src`. O `*/` **fechou o bloco de
comentário** e quebrou o arquivo: `tsc` deu 40+ erros de sintaxe e a suíte caiu para **13 arquivos /
28 testes falhando**. Consertado (`packages/{ai,web}/src`), zero impacto no que sobe. Fica escrito
porque o modo de falha é silencioso na leitura e ruidoso só no compilador.

---

### AC8 — Suíte, tipos e árvore

```
                        ANTES (199a7a84 + árvore)      R1        DEPOIS DA C1
arquivos de teste .....         188                    190           190     (+2)
passed ................       2.416                  2.441         2.444    (+28)
expected fail .........           6                      6             6     (=)
total .................       2.422                  2.447         2.450
```

**Delta explicado teste a teste: +28, todos meus, nenhum de terceiros.**
`packages/ai/src/prompts/collected-data.test.ts` = **20** (AC2 ×5, AC3 ×2, AC4 ×2, AC5-iii ×2,
AC6 ×6, **C1 ×3**). `packages/ai/src/chat/pipeline-collected-data.test.ts` = **8** (AC2 ×3,
AC5-iv ×2, AC7 ×3).
**Zero testes removidos; zero alterados além dos dois hashes da 87-5, com a aritmética acima.**

```
cd packages/ai  && npx tsc --noEmit   →  0
cd packages/web && npx tsc --noEmit   →  0
npx turbo lint --force                →  0 errors / 23 warnings   (= baseline)
```

*(A régua de `tsc --noEmit` na RAIZ (~14 mil linhas) é **baseline** e não é gate — não a rodei como
critério.)* **Árvore restaurada e `md5` conferido em 9 de 9 mutações** desta rodada (M0–M7 + a sonda
F). Os três arquivos do **deploy B da 87-5** seguem com o `md5` declarado, conferido **depois** das
nove: `572219f7…` · `471a495084…` · `fc25e0552…`. `git diff HEAD` = **0 linhas** em
`qualification.ts`, `agenda-state.ts`, `visit-slot.ts`, `agenda-reconcile.ts` e `lead-memory.ts`.

---

### AC9 — Plano da janela, e 🔴 DUAS premissas da story que a medição derrubou

**Responsável nomeado: Marcos** (D7, fechado em 09/08). **Sem nome, não sai.** Janela: 24 h a partir
do deploy, com **piso de inconclusividade: `n < 5` ⇒ INCONCLUSIVO, jamais "sem regressão"**.

**Régua de token: NÃO publicada.** A proibição fica pela razão do @po — ela mede a coisa errada.

🔴 **Premissa derrubada nº 1: `NICOLE_LASTRO_DIARIO` NÃO é mais 0 all-time.** A story (e o §4.3 do
parecer do @po) afirmam *"o cron nunca executou"* e *"`NICOLE%` tem um único `event_type` com
contagem > 0"*. **Medido hoje: são CINCO, e o cron roda diariamente.**

```
NICOLE_HISTORY_TRUNCATED ......  6   14/08 13:20 → 15/08 12:28
NICOLE_LASTRO_DIARIO ..........  6   10/08 11:38 → 15/08 11:38   ← a story diz 0 all-time
NICOLE_SLOT_UNAUTHORIZED ......  2   10/08 00:13 → 10/08 00:14   ← baseline CONFIRMADO
NICOLE_AFIRMACAO_SEM_LASTRO ...  1   10/08 11:38
NICOLE_AGENDA_STATE_EXPIRADO ..  1   13/08 18:31
```

**Consequência boa:** `M1`/`M4` **não precisam ser rodados à mão** — saem do próprio evento diário.
A instrução da AC9 (*"o endpoint aceita `?dry=1`; o cron nunca executou"*) está superada.

🔴 **Premissa derrubada nº 2, e esta é a que importa: `M1`/`M4` estão numa régua SATURADA.** Os três
últimos eventos diários trazem **`denominador: 0`** (janela de 1 dia). Ler *"`M1` e `M4` sem aumento"*
sobre denominador zero é **verde por construção** — a mesma classe da "janela de 24 h sem poder
estatístico". **Fica escrito: o item 1 da AC9 é INERTE como está, e não pode ser publicado como
evidência.** O que o substitui, e é o que eu recomendo ao @qa:

1. **`NICOLE_SLOT_UNAUTHORIZED` acima de 2** — baseline sólido, único evento com semântica direta
   sobre o objetivo desta story. *Continua valendo.*
2. **Amostragem dirigida, com a população remedida:** hoje são **67** conversas com
   `length(collected_data::text) > 120` (a story dizia que era cauda; por **turno** o @po mediu
   **51,3 %** — metade do tráfego). Consulta:
   `select conversation_id, length(collected_data::text) from conversation_state order by 2 desc limit 20`.
   Ler a resposta da Nicole **antes e depois**, `n ≥ 5` turnos.
3. **Gatilho de rollback, inalterado e barato:** **um** caso de a Nicole **reperguntar** dado que já
   estava no `collected_data` (nome, empreendimento, quartos) basta. É a regressão específica desta
   story e é o que a amostragem dirigida detecta.
4. **Os dois registros de `agenda_state` vivos** (Ronaldo e Rita) são observação privilegiada: são as
   únicas conversas em que a linha de citação aparece hoje. Ler as duas.

**Se `M1`/`M4` forem publicados mesmo assim, entram rotulados NÃO CONCLUSIVOS, com `denominador: 0`
declarado ao lado.**

---

### O que eu deliberadamente NÃO fiz

| item | por quê |
|---|---|
| `lead-memory.ts:79` e `haiku-enrichment.ts:105` | são a **87-10, AC6-b**. Contados e nomeados na AC1-(iii), não consertados |
| `packages/web/.../summary/route.ts:105` | o quarto sítio, declarado fora de escopo pelo @po: resumo para humano, sem realimentação |
| tocar os três arquivos do deploy B da 87-5 | instrução explícita. `md5` conferido antes e depois |
| corrigir `"name": "Tudo"` / `"name": "Quantos"` em produção | a story muda a **forma** do que vai ao prompt, não julga o conteúdo. Consertar seria escrita em produção, fora de escopo |
| um segundo mapa de rótulos para os extras | é a allow-list fechada que o §1 do Desenho proíbe |
| publicar régua de token | proibido pelo §4 e pela AC9 |

### Arquivos

**Criados (2 + 1):**
- `packages/ai/src/prompts/collected-data.ts` — o renderizador puro *(inalterado na C1 **e na C5**:
  `md5` `dd55a5e2d9bfae89ce16b7d4dd0ad0d4`, o mesmo do R1 e do R2 — as duas condições são só teste)*
- `packages/ai/src/prompts/collected-data.test.ts` — **21** testes *(17 no R1 + 3 da C1: a régua da
  citação longa, em duas procedências, mais o controle de fronteira; + 1 da **C5**: a régua do sítio
  `:184`, com fixture isolada em `name`)*
- `packages/ai/src/chat/pipeline-collected-data.test.ts` — 8 testes

**Modificados (2):**
- `packages/ai/src/chat/pipeline.ts` — a subtração + o `now` do turno no `buildSystemPrompt`
- `packages/ai/src/chat/pipeline-corretor-no-historico.test.ts` — recaptura dos 2 hashes da 87-5,
  com a aritmética do +119 escrita no docstring

**Decisão IDS:** `handoff.ts:139-153` tem uma lista de rótulos para `collected_data`, e foi
**REJEITADA como base**: é o resumo do **corretor** (ASCII, imprime `"nao informado"` para campo
ausente — no prompt isso seria uma afirmação falsa nova), e é o arquivo que a **87-12** vai mexer.
**REUSADOS sem alteração:** `AGENDA_STATE_KEY`, `LEGACY_AGENDA_KEYS` e `readAgendaState` de
`flows/agenda-state.ts` (importar, não redeclarar — Dev Notes). **CRIADO:** o renderizador, por não
existir nada que classifique `collected_data` para o prompt da Nicole.

**[AUTO-DECISION]** *A assinatura tem 2 parâmetros e não 1 (`renderDadosColetados(collectedData, now)`)*
→ **passar o `now` do turno.** Motivo, medido no código: `buildSystemPrompt` roda em `pipeline.ts:732`
e a leitura do `agenda_state` com TTL só acontece em `:799` — **no instante em que o prompt é montado,
um `agenda_state` VENCIDO ainda está no objeto**. Sem `now`, ou eu duplicaria a validação de
`parseAgendaState` (que é privada, e `agenda-state.ts` tem de ficar com 0 linhas de diff), ou o prompt
citaria um fato que o próprio turno vai descartar 70 linhas adiante. É o mesmo motivo pelo qual as
quatro chaves legadas precisam ser filtradas aqui.

## QA Results

**Gate: `docs/qa/gates/87.11-collected-data-sai-do-prompt-como-json-cru.yml` · Veredito: CONCERNS ·
@qa (Quinn), R1, 16/08.** Reproduzido do zero, na suíte da RAIZ, com backup por cópia e `md5`
conferido no início e no fim. **8 mutações da story + 8 sondas minhas.**

### Higiene de árvore — conferida primeiro
Os três arquivos do **deploy B da 87-5** estão com `md5` **idêntico ao declarado**, e continuam
idênticos **depois** de eu rodar 16 mutações por cima da árvore:
`572219f7…` · `471a495084…` · `fc25e0552…`. `git status` no fim tem o mesmo conjunto do início.

### As três derrubadas do @dev — as três confirmadas
1. **Régua de `grep` da AC1 — decomposição HONESTA.** População de produção (`packages/{ai,web}/src`
   sem `*.test.ts`) = **0 e 0**, literal. População crua = **0 e 5**, e li as cinco linhas uma a uma:
   as cinco são asserções ou o `HEAD` capturado, e as cinco são load-bearing. **Nenhuma ocorrência
   real escondida.** O argumento estrutural dele é geral e está certo: um teste que asserta a
   ausência de uma string precisa conter a string.
2. **🔴 A mutação prevista pela AC6 é FALSA — reproduzi.** Com `VALOR_MAX_CHARS = 10.000` a AC3-(i)
   **continua verde**. Medi M3 e M5 separadas e os conjuntos de vermelhos são **disjuntos — nenhum
   teste em comum**: quem mata a fala da Ivone é o **filtro** de `LEGACY_AGENDA_KEYS` (M5), não o
   truncamento (M3). A régua que ele acrescentou — prosa de produção numa chave **não-legada** — é a
   única que fica vermelha quando o teto sobe. **Sem ela, subir o teto para 10.000 teria passado por
   mim**, porque eu conferi a AC6 como escrita e ela fica verde.
3. **As duas premissas da AC9 caíram — confirmadas contra produção.** São **cinco** `event_type`
   `NICOLE%` com contagem > 0, e `NICOLE_LASTRO_DIARIO` está em **7** (subiu 6 → 7 com o cron de
   hoje). E os três últimos relatórios trazem **`denominador: 0`**, inclusive nos dois dias com
   `total_disparos: 2`. **Assino: o item 1 da AC9 é INERTE e não pode ser publicado como evidência.**
   *O que sobra sustenta a janela?* Sim, mas apoiada na **amostragem dirigida** (67 conversas com
   `collected_data > 120 chars`), não no evento: `NICOLE_SLOT_UNAUTHORIZED` tem baseline sólido
   (**2** all-time, confirmado) mas é raro, e 24 h de silêncio nele não distinguem "não regrediu" de
   "não mediu". Isso precisa estar escrito para o Marcos — a AC9 lista as três réguas como se
   pesassem igual.

### Mutações — medidas na suíte da RAIZ (baseline 190 arquivos / 2.441 passed / 6 expected fail)
M2 = **10** ✓ · M3 = **3** ✓ (2 comportamentais, a ressalva dele confere) · M4 = **2** ✓ (1
comportamental) · M5 = **3** ✓ · M7 = **5** ✓.
**M0 = 6, M1 = 14, M6 = 10** — os declarados (4/12/8) são a contagem nos **dois arquivos da story**;
os +2 sistemáticos são os hashes-ouro da 87-5. **Subestimação, não inflação.**
**"M0 = 4 é pouco?" Não.** Dos 8 testes de pipeline, **6** têm `collected_data` não-vazio e podem
sentir a subtração; caem **4**. Os 2 que não caem são os de `qualificationScore` — e eles **têm** de
não cair, é a AC5 inteira. **Todo teste que poderia detectar a subtração detecta.**

### Sondas minhas
- **Mock permissivo: NÃO HÁ.** Troquei o `conversation_id` do `conversation_state` por outro uuid:
  **7 de 8 testes caem.** O `createFakeSupabase` aplica o `.eq()` de verdade.
- **Hashes-ouro da 87-5: NÃO são gravação circular.** Provei nos dois sentidos — `pipeline.ts` +
  teste ambos no `HEAD` → 39 passed (os hashes antigos valem); hashes novos + `pipeline.ts` no `HEAD`
  → 2 vermelhos (a recaptura não nasce satisfeita). E refiz a aritmética sozinho: cabeçalho **144** +
  `\n` + `- Nome: Ana` **11** = 156; linha antiga = **37**; **156 − 37 = +119**, e os dois `length`
  assertados movem exatamente +119 com `dynamicSuffix` diferente. O `git diff` do arquivo toca só
  docstring, 2 `sha256` e 2 `length`.

### 🔴 Achado A1 — guarda ÓRFÃ (o que motiva o CONCERNS)
Removi o `truncar()` da **citação** do `agenda_state` (`collected-data.ts:160`) e a suíte inteira
ficou **verde: zero vermelhos em 2.441 testes**. A guarda funciona (medi: 279 chars → 120 + `…`), e
**`CITACAO_MAX = 280` limita na ESCRITA, mas `parseAgendaState` NÃO relimita na leitura**
(`agenda-state.ts:190` faz `citacao: o.citacao`, sem `slice`) — e 280 > 120. É a **única linha do
bloco novo cujo comprimento nenhuma fixture mede**, e é a que carrega texto livre do lead, que é a
classe de dano que esta story existe para remover. Todas as outras guardas do módulo têm vermelho
dedicado. **Sem exposição em produção hoje** (as duas citações vivas são curtas) — falta a régua, não
o código.

### Achado A2 e réguas
**A2:** M0/M1/M6 publicados sem o denominador declarado — mesma classe do `grep` da AC1 que ele
mesmo consertou, reaparecida na régua vizinha. **Réguas conferidas:** suíte **190 / 2.441 / 6**;
`tsc --noEmit` **0** em `ai` e **0** em `web`; lint **0 errors / 23 warnings**; `git diff` **0
linhas** nos quatro protegidos (+ `lead-memory.ts`); AC1-(iii) com **2** em `packages/ai`, nenhuma
quarta. **T0 conferida integralmente contra produção — não achei um único número divergente**
(16 chaves, 283/259/46/110/2.103/67, tipos 628/211/14/2/0, o registro do Ronaldo byte a byte,
`visit_explicitly_confirmed` = 0).

### Condições
| # | dono | o quê | bloqueia merge |
|---|---|---|---|
| C1 | @dev | fixture com `citacao` ~279 chars; critério: a sonda F passar a dar ≥ 1 vermelho. **Antes da 87-10** | não |
| C2 | @dev | republicar M0/M1/M6 com as duas populações declaradas | não |
| C3 | @qa + Marcos | janela **sem** o item 1 da AC9; piso `n < 5` ⇒ INCONCLUSIVO | não |
| C4 | @devops | fila: nada sobe antes do **deploy B da 87-5** (elegível `2026-08-16T17:25:45Z`) | **sim** |

**Nota de fila:** a janela da 87-5 A fecha hoje 17:25 UTC com **0 turnos na população-alvo** —
**inconclusiva, não aprovada**. Empilhar o deploy B e, 24 h depois, esta story sobre uma janela que
não produziu evidência é decisão de produto, não de QA — mas é decisão, e precisa do rótulo certo.

---

## 🔁 Round 2 — re-gate FOCADO do PR #428 · **CONCERNS mantido** · @qa (Quinn), 16/08

Gate completo: `docs/qa/gates/87.11-collected-data-sai-do-prompt-como-json-cru.yml` → `round_2`.
Árvore: `git worktree` isolado em **`8e655ee8`** (1 commit sobre `199a7a84`). **Nem o #427 nem o
#429 entraram** — provado pelo `md5` dos três arquivos do deploy B, que é o de `origin/main`.
Escopo: **só o que mudou depois do R1**. Não reabri as três derrubadas, nem a C3, nem a C4.

### Régua recalibrada — a diferença de 5 testes é PROVA, não furo
`origin/main` = **188 / 2.411 / 6** (medido, bate). Este PR = **190 / 2.439 / 6**, e não 2.444.
`2.411 + 28 = 2.439`, com `28 = 25 (R1) + 3 (C1)`. Os 5 que faltam são o **deploy B da 87-5**, que o
R1 mediu por estar não-commitado na árvore daquele dia e que hoje é o **#427**. Os três arquivos dele
no #428 têm `md5` igual ao de `main` e **diferente** do que o R1 registrou — ou seja, a divergência
de 5 é a evidência de que o #427 **não** vazou para cá.

### C1 — ✅ FECHADA, e bem
**SONDA F reaplicada: 0 → 2 vermelhos** (`(a)` 280 chars pelo escritor real, `(b)` 500 chars por
`jsonb` cru). **O terceiro fica VERDE sob F, como ele declarou — contar 3 seria contar errado.**
E ele **não é inerte**: minha **SONDA M** (`>` → `>=` em `truncar`) o derruba, que é exatamente o
conserto grosseiro que o docstring diz que ele existe para impedir.
**A fixture é honesta:** `FALA_DA_IVONE` tem **1.981 chars** e o `SELECT` de hoje devolve `1981` como
máximo de `visit_availability` — bate. Passa pelo escritor real (`buildAgendaState`). As negativas
discriminam: `"Portal das Torres"` no índice 187 e `"preciso de segurança"` no 258 — dentro dos 280
gravados, fora dos 120 renderizados.
**Resiste a mexerem no `CITACAO_MAX`, provado nos dois sentidos:** `280 → 100` (a direção que tornaria
a fixture vácua) dá **3 vermelhos** — a régua **grita** em vez de virar verde por construção;
`280 → 500` dá **1**, e nos testes da 87-4, não nos da C1 — **sem falso alarme**. `toBeGreaterThan`
foi a escolha certa: ela fixa a **relação** entre as réguas, e `toBe(280)` teria dado ruído nas duas.

### C2 — ✅ FECHADA, além do cobrado
Não amostrei: **remedi a bateria inteira** na suíte da raiz. **9 de 9 números batem** —
M0 `4/6` ✓ · M1 `12/14` ✓ · M2 `10` ✓ · M3 `6` ✓ · M4 `2` ✓ · M5 `3` ✓ · M6 `8/10` ✓ · M7 `8` ✓ ·
F `2` ✓. Li as **listas de nomes** de M0/M1/M6, não só os totais: os `+2` são sempre os dois
turnos-ouro da 87-5. E ele de fato remediou **M3 (3→6) e M7 (5→8)**, que ninguém cobrou.

### Produção intocada — confirmado por quatro caminhos
`md5` de `collected-data.ts` = `dd55a5e2…` ✓. Mas `md5` só prova que bate com o declarado, então:
**(a)** as quatro âncoras de linha do meu próprio R1 (`collected-data.ts:160`, `agenda-state.ts:190`,
`pipeline.ts:734` e `:801`) batem na linha exata; **(b)** M2/M4/M5 dão os mesmos números do R1 e são
justamente as mutações que os testes novos não tocam; **(c)** a lista de M0 é a mesma do R1;
**(d)** `git diff` = **0 linhas** nos quatro protegidos + `lead-memory.ts`.
`tsc` **0/0**, lint **0 errors / 23 warnings**, `prompts:check` **✅**.

### 🔴 A6 — o achado novo, e a dívida é MINHA
`truncar()` tem **três** sítios de chamada, e **M3 muta a constante compartilhada** — o curto-circuito
acende os três juntos e esconde que cada um pode estar sozinho. No R1 eu isolei **um** (a citação),
publiquei a guarda órfã e **parei ali**. Isolei os três agora:

| sítio | sonda | vermelhos |
|---|---|---|
| `:160` citação | F | **2** (era 0 — fechado pela C1) |
| `:184` **ROTULADOS** | **I** | 🔴 **ZERO em 2.445** |
| `:196` extras | J | 2 (`profissao`, `cidade_bairro`) — coberto |

**Não é mutante equivalente** — medido por execução direta sobre a mesma fixture:

```
guarda presente  → linha "- Nome:" = 129 chars  · reticência: sim · "Portal das Torres": não
SONDA I aplicada → linha "- Nome:" = 1989 chars · reticência: não · "Portal das Torres": SIM
```

1.989 chars de prosa livre entram inteiros no prompt e **nenhum dos 2.445 testes pisca**.
**Sem exposição em produção hoje:** `SELECT` de 16/08 — dos 8 rotulados o maior é `name` com **49**
chars; zero acima de 120. Mas é alcançável pelo mecanismo já observado: quem escreve esses campos é o
modelo, e a fixture **da própria story** tem `name: "Tudo"`.
**A A6 existia idêntica no R1 e eu não a vi.** O @dev cumpriu a C1 como escrita e entregou mais do que
o critério pedia. Não há nada a cobrar dele aqui além de fechá-la.

**A7** (informativo): `2.103` é o comprimento do **JSON serializado**, não da fala (`1.981`) — o
número viaja errado desde o parecer do @po, passou pelo meu R1 e está no docstring. Nit.
**A8** (informativo): SONDA N (`Number.isFinite`) e SONDA O (`AGENDA_STATE_KEY` sozinho) dão 0
vermelhos e são **mutantes equivalentes** — `jsonb` não representa `NaN`, e a guarda estrutural
absorve o `agenda_state`. Registrados para ninguém contá-los como órfãos e inflar o achado.

### Condições após o R2
| # | dono | status |
|---|---|---|
| C1 | @dev | ✅ **FECHADA** |
| C2 | @dev | ✅ **FECHADA** |
| C3 | @qa + Marcos | aberta, inalterada |
| C4 | @devops | 🔴 **ABERTA E BLOQUEANTE** — #427 segue `OPEN`, `mergedAt: null`. Nada sobe antes |
| C5 | @dev | **NOVA** — fechar a A6; critério: **SONDA I passar a dar ≥ 1 vermelho**. Antes da 87-10 |

**Veredito: CONCERNS mantido.** Não por defeito de código, não por regressão e não por nada que o
@dev tenha deixado de fazer — as duas condições cobradas estão fechadas melhor do que o cobrado.
Fica CONCERNS porque a invariante central da story ainda tem **uma guarda sem vermelho**, e subir a
PASS com um órfão vivo seria exatamente o que este epic cobrou nas quatro rodadas anteriores.
A C5 custa cinco linhas.

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-10 | v0.1 | Criação. Subtração pura do despejo de `collected_data` em JSON cru. Inventário das 16 chaves, tamanhos e o `collected_data` do Ronaldo medidos contra produção em 10/08. Régua de token declarada **proibida** com a medição que a torna inerte (n=505, mediana 1.802 tokens × 46 chars). Ordem de deploy invertida em relação à numeração, com justificativa escrita. | @sm (River) |
| 2026-08-16 | **1.0** | **Implementada por @dev (Dex, YOLO) sobre `origin/main` em `199a7a84`. `Ready → Ready for Review`.** Subtração entregue: `pipeline.ts` deixa de despejar `collected_data` em JSON cru e passa a chamar `renderDadosColetados` (`packages/ai/src/prompts/collected-data.ts`), módulo puro com regra de admissão explícita. **T0 remedida contra produção (16/08) e publicada LADO A LADO com a do @sm/@po, sem sobrescrever:** as **mesmas 16 chaves** (nenhuma nova), 283 linhas / 259 não-vazias, mediana 46, máximo 2.103 (Ivone, intacto), `input_tokens` n=477 mediana 1.876. **`agenda_state` passou de 1 para 2 registros** — o segundo (Rita, 15/08) é o caso COMPLEMENTAR do Ronaldo (`data_absoluta` presente, `hora` null), e os dois juntos **reforçam** a decisão do §2 de a citação citar e não afirmar. **🔴 A régua de `grep` da AC1 está ERRADA como escrita e foi corrigida por medição:** ela deu **5 e 9**, não 0, e todas as ocorrências novas eram COMENTÁRIO MEU — mas há um problema estrutural além da disciplina: **um teste que asserta a AUSÊNCIA de uma string precisa conter a string**. Reescrevi meus comentários e **declarei a população**: sobre `packages/{ai,web}/src` **excluindo `*.test.ts`** a régua é **0 e 0**, literal, sem interpretação; a população crua é **0 e 5**, com **cada linha nomeada** (as cinco são asserções). **AC1-(iii): baseline 3 em `packages/ai`, fica 2** — `lead-memory.ts:79` e `haiku-enrichment.ts:105` PERMANECEM ABERTOS (87-10 AC6-b), mais o quarto em `packages/web` já declarado fora de escopo. **Nenhuma quarta linha nova em `packages/ai`: não houve o que escalar.** **8 mutações medidas** (aplicar·rodar·ler·reverter·`md5`, rodadas DUAS vezes, a segunda contra os arquivos finais): M0 (a subtração revertida) derruba **4**, M1 (`String(valor)`) **12**, M2 (`delete collectedData.bedrooms`) **10** — com o score caindo de **65 para 55**, exatamente o peso de `bedrooms` —, M3 (teto 120→10.000) **3**, M4 (teto 12→500) **2**, M5 (filtro de legado removido) **3**, M6 (cabeçalho removido) **8**, M7 (a citação vira afirmação) **5**. **🔴 A mutação prevista pela AC6 foi FALSIFICADA:** subir o teto para 10.000 **NÃO** derruba a AC3-(i) — a fala da Ivone some pelo FILTRO de `LEGACY_AGENDA_KEYS`, não pelo truncamento; são duas guardas independentes que a story conflou. Acrescentei régua com a MESMA prosa de produção numa chave **não-legada** (cenário real: os extras são texto livre do Haiku do cron), e agora cada guarda tem vermelho **dedicado e disjunto**. Declarado sem eufemismo: de M3 só **2** dos 3 vermelhos são comportamentais (1 é asserção de constante); idem M4. **AC7 reescrita na implementação por ser autocontraditória como estava** (*"byte a byte igual ao HEAD"* numa fixture que TEM `collected_data`): a régua implementada é **`HEAD` menos, e só menos, a linha do JSON cru**, com duas asserções que impedem a régua de nascer satisfeita. O cenário sem `collected_data` é igualdade TOTAL e passa verde contra o `HEAD` de propósito. **Efeito colateral tratado com aritmética, não com "atualizei o snapshot":** os 2 hashes-ouro da AC10 da 87-5 mudaram porque as fixtures têm `collectedData: {name:"Ana"}` — os DOIS cresceram **exatamente +119 chars** (37→156), e o delta idêntico em cenários com `dynamicSuffix` diferente é a prova de que só a linha certa mudou. **Defeito meu registrado:** um comentário com `packages/*/src` fechou o bloco de comentário (`*/`) e quebrou o arquivo — 13 arquivos / 28 testes caindo até o conserto. **🔴 DUAS premissas da AC9 derrubadas por medição:** `NICOLE_LASTRO_DIARIO` **NÃO é 0 all-time** (são 6, o cron roda diariamente desde 10/08, e `NICOLE%` tem CINCO event_types com contagem > 0, não um); e **`M1`/`M4` estão com `denominador: 0` nos três últimos dias** — o item 1 da AC9 é **INERTE** e não pode ser publicado como evidência. O que fica de pé: `NICOLE_SLOT_UNAUTHORIZED` (baseline **2** confirmado) + amostragem dirigida (**67** conversas > 120 chars) + o gatilho de repergunta. **Réguas:** suíte 188→**190** arquivos e 2.416→**2.441** passed (6 expected fail, iguais), **+25 testes, todos meus**; `tsc --noEmit` **0** em `packages/ai` e **0** em `packages/web`; lint **0 errors / 23 warnings** (baseline). `git diff` = **0 linhas** em `qualification.ts`, `agenda-state.ts`, `visit-slot.ts` e `agenda-reconcile.ts`. Os três arquivos do **deploy B da 87-5 não foram tocados** (`md5` conferido antes e depois). Sem migration, sem DDL, sem push. | @dev (Dex) |
| 2026-08-16 | **1.1** | **C1 e C2 do gate R1 (CONCERNS) fechadas por @dev (Dex). Só teste e Dev Agent Record — `collected-data.ts` e `pipeline.ts` têm `md5` IDÊNTICO ao do R1 (`dd55a5e2…` · `e4eb99a8…`): nenhuma linha de produção mudou.** **🔴 C1 — a guarda ÓRFÃ do truncamento da citação passou de `0` para `2` vermelhos na suíte da RAIZ.** O achado A1 do @qa é defeito meu e procede: nenhuma das 25 asserções media o COMPRIMENTO da citação (a maior fixture tinha 17 chars), e remover o `truncar()` da linha de agenda deixava 2.441 testes verdes. A guarda é load-bearing porque são **duas réguas diferentes**: a escrita limita em **280** (`agenda-state.ts:149`) e a leitura **não relimita** (`:190` faz `citacao: o.citacao`) — **280 > 120**. As duas fixtures novas cobrem as duas procedências que o A1 nomeia, e **nenhuma é sintética**: **(a)** a fala REAL da Ivone passada pelo escritor REAL `buildAgendaState` — que é o que o `processMessage` grava quando o lead fala longo — sai com 280 chars (preferido a `"x".repeat(279)`: a fixture é o **estado futuro real**, não string de laboratório); **(b)** citação gravada por OUTRO caminho (`jsonb` cru, 500 chars), onde `CITACAO_MAX` não está no caminho e o `truncar()` desta story é o **único teto do sistema**. A desigualdade é assertada como `toBeGreaterThan(VALOR_MAX_CHARS)` e não `toBe(280)`: o load-bearing é a RELAÇÃO entre as réguas, não o número da escrita. **Vermelho colado, com o `Received` mostrando o dano** (280 e 500 chars de fala livre entrando no prompt). **Decomposto, como o lead pediu: caem 2, e por quê.** (1) Os 2.442 restantes não caem porque **nenhuma outra fixture da suíte tem citação acima de 120 chars** — e isso é o retrato de produção, não omissão: os dois `agenda_state` vivos têm **17** (Ronaldo) e **5** chars (Rita), e abaixo do teto `truncar()` é identidade. É também por isso que **não há exposição em produção hoje**. (2) Caem **2 e não 3** porque o terceiro teste é **controle de fronteira** (citação de exatamente 120 não é truncada), **declarado verde sob F ANTES de medir** e confirmado verde — ele existe para impedir o conserto grosseiro (um `slice` incondicional cortaria `"Terça"`). **Contar 3 seria contar errado.** (3) **Quantos casam por acidente, publicado ao lado do número:** os três novos **também** caem em M3 e M7 (assertam a linha inteira e escrevem a expectativa em função de `VALOR_MAX_CHARS`); nas outras seis mutações ficam verdes — **medido, não suposto**. A sonda F é a única que isola o `truncar()` da citação, e é por ela que a C1 se mede. **🔴 C2 — a contagem foi republicada com as DUAS populações declaradas, remedida por mim mutação a mutação e não copiada do gate:** **P1** = os dois arquivos da story (**28** testes de verde de referência) · **P2** = `npx vitest run` da RAIZ (**190 arquivos / 2.444 passed / 6 expected fail**). **M0 = 4 / 6 · M1 = 12 / 14 · M6 = 8 / 10** — o @qa está certo, e é **subestimação, não inflação**, da mesma classe do `grep` da AC1 que eu mesmo consertei na régua vizinha. **A divergência é nominal, não aleatória:** os `+2` são **sempre os mesmos dois testes**, os turnos-ouro da AC10 da 87-5, nomeados um a um; e M2/M3/M4/M5/M7/F **não** os derrubam porque a fixture deles é `{ name: "Ana" }` — sem `bedrooms`, abaixo de 120 chars, não legada e **sem `agenda_state`**. **Remedi a bateria INTEIRA e não só as três** porque os 3 testes novos mudam outros números: **M3 passou de 3 para 6** (5 comportamentais + 1 de constante) e **M7 de 5 para 8** — publicar M0/M1/M6 corrigidos deixando M3/M7 desatualizados seria o mesmo defeito com outro nome. **Réguas:** suíte 190 arquivos / **2.444** passed / 6 expected fail (+3 da C1, todos meus); `tsc --noEmit` **0** em `ai` e **0** em `web`; lint **0 errors / 23 warnings** (= baseline); `git diff HEAD` = **0 linhas** em `qualification.ts`, `agenda-state.ts` (o teste **importa** `buildAgendaState`, não o altera), `visit-slot.ts`, `agenda-reconcile.ts` e `lead-memory.ts`. **Árvore restaurada e `md5` conferido em 9 de 9 mutações**; os três arquivos do **deploy B da 87-5 seguem intocados** (`572219f7…` · `471a495084…` · `fc25e0552…`, conferidos depois das nove). **Fora de escopo, por instrução explícita:** a **C3** é do @qa + Marcos; a **C4** é do @devops e é **bloqueante** — nada desta story sobe antes do deploy B da 87-5 (elegível `2026-08-16T17:25:45Z`), então **não abri PR nem pedi PR**; os sítios 2 (`lead-memory.ts:79`) e 3 (`haiku-enrichment.ts:105`) continuam **abertos** e são da **87-10**. Sem push, sem PR, sem banco. | @dev (Dex) |
| 2026-08-16 | **1.2** | **C5 do gate R2 fechada por @dev (Dex). Só teste e Dev Agent Record — `collected-data.ts` mantém o `md5` `dd55a5e2d9bfae89ce16b7d4dd0ad0d4` do R1 e do R2, conferido antes e depois da sonda: nenhuma linha de produção mudou nesta rodada.** **🔴 O achado A6 procede inteiro, e o método que o escondeu era meu.** `truncar()` tem **três** sítios de chamada e a mutação que eu usava para o truncamento — **M3, que mexe em `VALOR_MAX_CHARS`** — muta a **constante compartilhada**: acende os três de uma vez e por isso não distingue sítio coberto de sítio descoberto (o mesmo defeito de método dos campos colineares, em outra roupa). Reisolei sítio a sítio: `:160` citação **2** (fechado pela C1) · `:184` **rotulados ZERO** · `:196` extras **2**. **Vermelho MEDIDO, não declarado — SONDA I (remover o `truncar()` só do laço de `ROTULOS_QUALIFICACAO`, `VALOR_MAX_CHARS` intocada): `0 → 1`**, com a saída bruta colada no Dev Agent Record (`Test Files 1 failed | 189 passed (190)` · `Tests 1 failed | 2439 passed | 6 expected fail (2446)`). **Não é mutante equivalente, provado por execução:** com a guarda a linha `- Nome:` sai com **129** chars e reticência; sem ela, **1.989**, sem reticência, e `"Portal das Torres"` vaza. Os dois números batem com os do @qa **ao caractere** porque a fixture é a mesma fala real da Ivone — `FALA_DA_IVONE` tem **1.981** chars, `"- Nome: "` tem 8 (`1.981 + 8 = 1.989`; `8 + 120 + 1 = 129`). **A fixture é `name` porque o mecanismo já foi observado, não porque é conveniente:** quem escreve os oito rotulados é o modelo (Haiku do cron `enrich-leads`, último escritor de 70 % dos estados) a partir de texto livre, e o registro real da Ivone — a fixture **da própria story** — tem `name: "Tudo"`. Pôr a fala inteira em `name` é a versão pior de um erro que já aconteceu. **Sem exposição em produção hoje**, declarado: o maior rotulado vivo é `name` com **49** chars, zero acima de 120 — faltava a régua, não o código. **A fixture ISOLA um sítio só**, que é a correção de método: o objeto é `{ name: FALA_DA_IVONE }` e nada mais — **sem `agenda_state`** (não toca `:160`) e **sem extra longo** (não toca `:196`); logo o vermelho aponta para **um** sítio e um `truncar()` reposto em qualquer outro não o apaga. **Declarado para ninguém contar órfão onde não há:** o controle de fronteira deste sítio **não** foi escrito porque já existe — o turno-ouro da AC2 asserta `- Nome: Ronaldo` por `toEqual` byte a byte, e um `slice` incondicional em `:184` já nasce vermelho lá; um segundo controle seria régua duplicada, não vermelho novo. Mantidos como **mutantes equivalentes** os dois do @qa (SONDA N, `Number.isFinite` — `jsonb` não representa `NaN`; SONDA O, `AGENDA_STATE_KEY` sozinho — a guarda estrutural o absorve). **A7 aceita:** `2.103` é o comprimento do JSON serializado e não o da fala (**1.981**); o teste novo asserta `1.981` explicitamente, o que impede o número errado de voltar por cópia. **Réguas medidas depois:** suíte **190 arquivos / 2.440 passed / 6 expected fail (2.446 total)** — é `2.439 + 1`, sobre a régua **recalibrada pelo próprio @qa no R2** (`190 / 2.439 / 6`); os `2.444` que circulavam são o número do R1, que incluía os 5 testes do deploy B da 87-5 hoje no #427 e que **não** estão nesta árvore. `tsc --noEmit` **0** em `packages/ai` e **0** em `packages/web`; lint **0 errors / 23 warnings** (= baseline); `git status` mostra **um único arquivo modificado em `packages/`**, o `collected-data.test.ts`. **Fora de escopo por instrução:** C3 (@qa + Marcos) e C4 (@devops, bloqueante) seguem abertas e intocadas; os sítios 2 e 3 do despejo (`lead-memory.ts:79`, `haiku-enrichment.ts:105`) continuam da **87-10**. Sem push, sem PR, sem banco. | @dev (Dex) |
| 2026-08-10 | v0.2 | **Validação: GO condicionado. `Draft` → `Ready`.** Parecer: `docs/qa/po-validation-87-10-87-11.md`. Escopo **inalterado** (um sítio); três correções de fato. **(1) O inventário das 16 chaves, os tamanhos e o `collected_data` do Ronaldo foram reconferidos contra produção e batem byte a byte** (mediana 47 e não 46 — `percentile_cont` sobre as 254 linhas; irrelevante). **(2) Este é UM de TRÊS despejos de `collected_data` em prompt** — `lead-memory.ts:79` (→ `ai_summary` → `loader.ts:195` → prompt) e `haiku-enrichment.ts:90` continuam abertos e são da `87-10` (AC6-b). A **AC1 ganha o item (iii)**: inventário declarado, baseline 3, fica 2, com dono por linha. **(3) A proibição da régua de token FICA, com a justificativa TROCADA:** `CLAUDE_RESPONSE` **tem** `conversation_id` (505/505) — o join existe e foi feito; e o denominador estava errado: por **turno** a mediana de `collected_data` é **132 chars** (não 46) e **51,3 %** dos turnos passam de 120 chars. A régua é proibida por medir a coisa errada, não por ser imensurável — e a story deixa de ser higiene marginal: toca metade do tráfego. **(4) §2 corrigido:** `Current qualification step` imprime `state.qualification_step` **persistido** (= `view` para o Ronaldo, medido) e não `getNextQualificationStep`; e o Ronaldo tem **`visit_proposed = true`**, então o bloco real traz também a linha *"VOCE JA PERGUNTOU…"*. **(5)** `handoff.ts:138` roteado para a **`87-12`** (hotfix, primeiro da fila). | @po (Pax) |
