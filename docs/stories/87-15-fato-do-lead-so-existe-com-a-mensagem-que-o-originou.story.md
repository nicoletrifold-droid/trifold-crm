# Story 87-15 — Um fato do lead só existe com a mensagem que o originou

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** `Draft`
**Prioridade:** **P3 · Onda 4 — SEM DATA.** Colocação atribuída pelo @po em
`docs/qa/po-validation-87-15.md` §5.1.
**Item do roadmap:** **`W4-4`** (Onda 4 — *"Decisão e execução sobre a memória: reviver `012` ×
redesenhar enxuto × enterrar"*), sob a decisão **`D2`** do Gabriel. Esta story é o **`D2-(b)`** —
*"redesenhar enxuto"* —, **ainda NÃO ratificado**.
**Criada por:** @sm (River) em 2026-08-16 · **Recortada em 2026-08-16** (v0.3)
**Executor:** @data-engineer (migration) + @dev (escritor e régua) · validação: @qa
**Esforço:** **L** — migration + escritor + contrato fail-loud + a régua com os erros contados
**Risco:** **Baixo de regressão · NENHUM comportamento novo enquanto for write-only** — e **Alto no
dia em que alguém ligar a leitura**, que é outra story, e a fronteira está escrita.
**Migration:** **232** — ver §"Numeração", com duas armadilhas registradas.
**Natureza:** **substrato novo, WRITE-ONLY.** Grava; nada lê para decidir. **A LEITURA não está
aqui** — ver §"O que esta story NÃO faz".

> ## ⛔ Esta story está PARADA, e por três motivos escritos
>
> | # | Bloqueio | Quem destrava |
> |---|---|---|
> | 1 | **`D2-(b)` não foi ratificada.** O epic registra apenas a *recomendação* (*"(c) agora + (b) na Onda 4"*). **Não implementar sob recomendação — foi assim que o MemPalace nasceu** | **Gabriel**, por escrito |
> | 2 | **Dois defeitos de desenho medidos** pelo @po em 16/08 — o índice único (§D1) e o `kind` sem classificador (§D2). Os dois **reproduzem, um nível acima, o defeito que esta story existe para fechar** | **@sm/@data-engineer**, já endereçados nas **AC3** e **AC4** desta versão |
> | 3 | **O harness (`W2-1` / `88-2`) não existe** — a AC7 depende dele para a asserção sobre a entrada do modelo | **Epic 88** |
>
> **Sem data. Não entra em fila nenhuma.** O custo de esperar é **zero**: nada aqui está pagando
> por turno. *(O que estava pagando saiu para a `87-16`.)*

---

## 📌 O que MUDOU nesta versão: o bloco A saiu

A v0.1 desta story tinha **duas metades com naturezas opostas**: o **bloco A** (enterrar o MemPalace
morto — subtração pura, custo corrente) e o **bloco B** (este substrato — construção, sem pressa).

O @po deu **NO-GO** e mandou **fatiar** (`docs/qa/po-validation-87-15.md` §3). **O bloco A virou a
Story `87-16`**, `P1 / Onda 1`, corrigido — ele estava, como escrito, **apagando o `ai_summary` do
prompt em 59,3 % dos turnos**, porque `memory/loader.ts` é o único caminho pelo qual o resumo chega
ao prompt e o `return ""` da tabela morta é justamente o **gatilho** dessa injeção.

**Por que fatiar foi certo, e a razão não é a que a v0.1 escreveu:**

- A story inteira ficava refém do `D2-(b)`, que **não tem data**, enquanto o bloco A pagava
  **593 chamadas Haiku + ~1.831 embeddings + ~1.600 round-trips descartados a cada 30 dias**.
- **O epic não se opõe.** A §*"W4-4 por último, e de propósito"* (`epic-87:1075`) justifica o
  adiamento por **causalidade de alucinação** (*"O MemPalace morto não é causa de alucinação"*) —
  verdadeiro, e **é outro eixo**. O caso do bloco A é **custo e latência**. É literalmente o que a §7
  do epic (`:434`) avisa: *"um item lido como 'Baixo' no eixo errado atravessa a regra de corte da
  onda sem…"*. **Fatiar é ler cada metade no eixo dela.**
- Fatiar também livrou o enterro de uma **dependência transitiva falsa**: o `W4-4` declara deps
  `D2, W3-1` (`epic-87:1034`), e o `W3-1` (validador pós-resposta) não tem relação nenhuma com
  enterrar código morto. **A dep `W3-1` continua valendo para ESTA story.**

⇒ **Tudo o que era bloco A saiu deste documento.** As ACs foram renumeradas
(`AC7–AC15` da v0.1 ⇒ `AC1–AC11` aqui), e **duas ACs novas entraram** (AC3 e AC4), fechando os dois
defeitos medidos pelo @po.

---

## ⚠️ Correção de registro: esta story **não** é pré-requisito do Epic 88

A v0.1 dizia que o bloco A fechava *"a nona linha"* do `Epic 88 · §8`. **Duas coisas erradas, e as
duas foram corrigidas pelo @po e reconferidas por mim contra `HEAD`:**

O `Epic 88 · §8` (*"Dependências do Epic 87 — o que é bloqueante e por quê"*) tem **exatamente 8
linhas**: `W0-0`, `W1-2b`, `W1-2c`, `W0-5`, `W2-1`, **MemPalace**, `W3`, `W4-1`.

- 🔴 **Não existe nona linha.** O MemPalace **é a 6ª das 8**, e é a única sem story. Essa linha é a
  **`87-16`**, não esta.
- 🔴 **E ela não é bloqueante:** a coluna *"Bloqueia o quê?"* responde **"habilitante — latência"**.
- ✅ **Este substrato não aparece na tabela.** Nem como bloqueante, nem como habilitante.

**O que é verdade:** este substrato é pré-requisito do **`W4-2`** (*tool de dados do
empreendimento*) e de qualquer tool futura que precise saber **o que o lead já disse**. **A v1 do
Epic 88 tem uma tool só (`agendar_visita`) e ela lê `appointments`** — não fatos do lead.

⇒ **Esta story não fura fila nenhuma, e a casa já tem uma fila de um-fix-por-deploy funcionando.**

---

## Story

**Como** engenharia da Trifold, que passou quatro meses acreditando que a Nicole tinha memória
porque o código dizia que tinha,
**Queremos** criar o substrato mínimo em que **um fato do lead só nasce com a mensagem que o
originou, o papel de quem a disse, e a data já resolvida no instante da captura**,
**Para que** a próxima camada de memória — e a próxima tool de escrita — seja construída sobre um
estado que **não pode mentir por construção**, em vez de sobre um estado que mente e um validador
que tenta adivinhar depois.

---

## Context

### 1. O que existe hoje no lugar da memória — e o que nenhuma dessas coisas guarda

| Camada viva | Onde | Guarda a mensagem de origem? |
|---|---|---|
| Histórico (cauda de 20, `87-8`; rotulado por papel, `87-5`) | `messages` | é a própria mensagem — mas **nada deriva fato dela** |
| `ai_summary` — texto livre gerado por Haiku | `leads.ai_summary` — **263 de 1.788 leads (14,7 %)**, presente em **624 de 1.052 turnos (59,3 %)** | **não.** Foi o CR-3: a fala da Nicole entrava como fato |
| `collected_data` — pares chave/valor | `conversation_state` | **não**, exceto uma chave (abaixo) |
| **`agenda_state`** — o objeto da `87-4` | `conversation_state.collected_data.agenda_state` | **SIM — e é o único.** |

**A `87-4` já construiu, para um predicado, exatamente o que esta story pede para todos.** Copiado
de `packages/ai/src/flows/agenda-state.ts:91-121`:

```ts
export interface AgendaState {
  /** Trecho LITERAL da mensagem role='user' que originou o fato. Sem citação, não há estado. */
  citacao: string
  /** Quem falou. Só 'lead' produz disponibilidade. */
  origem: "lead"
  /** De onde veio dentro da conversa: resposta a pergunta nossa, ou texto solto. */
  fonte: "pendencia" | "mencao"
  /** Dia resolvido NO MOMENTO DA ESCRITA (YYYY-MM-DD) … */
  data_absoluta: string | null
  /** O instante contra o qual a resolução foi feita. É A ÂNCORA. */
  ancorado_em: string
  expira_em: string
}
```

E o docstring do mesmo arquivo (`:62-88`) **já contém o caso do `"Oi"`**, com o nome do lead e a data:

> *"`mencao` — o dia/hora colhido de texto solto, sem termos perguntado nada. Era o
> `visit_availability`. O `HEAD` o excluía do ramo da visita já marcada de propósito — **sem essa
> exclusão, um `"Oi"` REMARCA a visita de quem está em negociação avançada**."*

**Isto é decisivo para *"não colapsar semânticas"*:** a distinção entre *o que nós perguntamos*
(`pendencia`) e *o que o cliente mencionou* (`mencao`) **não é proposta desta story — é um desenho
que já foi aprovado, colapsado, e reprovado por um gate que reproduziu o cenário.** Esta story não a
reinventa: **ADAPTA**, no sentido do IDS (`REUSE > ADAPT > CREATE`).

### 2. 🔴 O que a `87-4` ainda **não** resolve — e é a única invenção real desta story

`AgendaState.citacao` é uma **cópia de texto** (`CITACAO_MAX = 280`), não uma **referência**. Uma
cópia não permite voltar à mensagem, e — pior — **é falsificável pelo próprio sistema**: a Nicole
ecoa o horário do lead de volta na resposta dela, então uma régua de procedência por *substring
contra o histórico* casa com a fala **dela** tanto quanto com a do lead. Esse é o achado da `87-12`
§5, onde **as duas** réguas candidatas foram contadas e **as duas** reprovadas (a de comprimento
erra 3; a de procedência **apaga justamente os dois valores que eram reais**).

**A correção que esta story traz sobre a `87-4`, em uma linha:**

```
citacao: string                     →   source_message_id uuid NOT NULL REFERENCES messages(id)
(cópia, falsificável por eco)            (referência, e uma FK não se ecoa)
```

O texto continua guardado (auditoria humana), mas **quem decide se aquilo é estado é a FK e o
`CHECK` do papel** — não uma comparação de strings.

#### 2-bis. A segunda coisa que a `87-4` deixou aberta — e o achado é maior do que parecia

Os três sítios de escrita do `agenda_state` em código de produção:

| Sítio | `fonte` | Como a proveniência é garantida |
|---|---|---|
| `pipeline.ts:963` | `"pendencia"` | literal no call site |
| `pipeline.ts:1053` | `"pendencia"` | literal no call site |
| `qualification.ts:361` | `"mencao"` | **guarda `if (opts?.origem === "lead")`** na linha 321 |

*(Divergência de medição registrada com método: minha primeira contagem, com `grep` restrito a
`pipeline.ts`, deu **zero** sítios escrevendo `"mencao"` em produção; a segunda, correta, deu **um**.
O @po reconferiu e corrigiu a linha: `:361`, não `:355`. As duas contagens ficam.)*

🔴 **E o achado real, medido pelo @po, é maior do que *"convenção frágil"*:**

```
pipeline.ts:1278  extractCollectedData(message,          collectedData, { nameExpected, origem: "lead",      now })
pipeline.ts:1298  extractCollectedData(assistantMessage, updatedData,   { origem: "assistant" })
```

A segunda linha alimenta a função com **a resposta inteira da Nicole**, e é **deliberada e
documentada** (`pipeline.ts:1295-1297`: *"daqui saem nome/imóvel/quartos como sempre, mas NUNCA mais
disponibilidade de visita"*).

| ramo | guarda | comportamento se `origem` faltar |
|---|---|---|
| agenda (`qualification.ts:321`) | `if (opts?.origem === "lead")` | **fail-CLOSED** ✅ (a `87-4` fechou) |
| nome, email, quartos, vaga, andar, vista (`:158-260`) | **nenhuma** | **fail-OPEN** 🔴 — roda sobre a fala da Nicole **hoje, por desenho** |

**O achado não é *"o nome do parâmetro convida ao erro"* — é *"metade do `extractCollectedData`
nunca teve guarda de origem"*.** Vai para o backlog com essa redação, vizinho da `87-11`, **fora
desta story** (é superfície de `collected_data`, não de `lead_fato`).

**E é exatamente o que `source_message_id` + `source_message_role` eliminam neste substrato: não há
como passar a mensagem errada quando o que se passa é o `id` da linha em `messages`.**

**Terceira observação, do mesmo sítio:** em `pipeline.ts:960` a citação de um turno anterior é
**reaproveitada** enquanto o `ancorado_em` é **reancorado no turno atual**. Ou seja: citação e âncora
podem vir de turnos **diferentes**, e hoje não há como saber disso lendo o estado. Com
`source_message_id` + `source_message_created_at` + `anchored_on`, a divergência fica **legível** em
vez de invisível. **Não é bug de nenhuma das duas stories** — é o limite do formato de cópia.

### 3. A régua que já existe, medida contra 30 dias — **pega 174, erra pelo menos 132**

`extractFactsFromMessage` (`flows/memory-extraction.ts`) era o único produtor cuja proveniência é
estruturalmente sã: `pipeline.ts:1642` o alimentava **só com `message`** (a fala do lead), nunca com
`assistantMessage`. Rodado **de verdade** (via `tsx`, módulo real) contra as **1.052 mensagens
`role='user'` dos últimos 30 dias**, e **reproduzido ao número pelo @po**:

```
1.052 mensagens  →  174 com ≥1 fato (16,5 %)  →  182 fatos
```

| predicado | n | **erros nomeados** |
|---|---|---|
| `interested_in` | **100** | 🔴 **95 vêm do texto-padrão do lead form** (*"Tenho interesse no VIND Residence e gostaria de mais informações."*) — o lead **clicou**, não **disse**. **95 de 182 fatos (52,2 %) do substrato inteiro seriam autotexto** |
| `available_day` | **31** | 🔴 **31 de 31 são tokens relativos, zero data absoluta**: `sábado` ×7, `hoje` ×5, `quinta` ×5, `amanhã` ×2, `semana que vem` ×2, `próximo sábado` ×1 … **é o gerador perpétuo de sábados do CR-4, no substrato** |
| `objection` | 13 | `price` extraído de *"Acima do 5"* (fala sobre **andar**) e de *"Achei que esse prédio era o da rua assai"*; `timing` extraído de *"Ainda não"* (resposta de 2 palavras a pergunta desconhecida) |
| `name` | 12 | 🔴 **5 de 12 (41,7 %) capturam > 20 caracteres**, engolindo a frase inteira — e **3 desses 5 não são leads**: *"Keller e agora estou responsável pelo atendimento da região"* (fornecedor), *"Lucas e vi que estão contratando pra vaga de servente de obras"* (candidato a emprego), *"Juliana Garcia e sou moradora da Rua Carlos Meneghetti"* (54 ch) |
| `available_time` | 7 | 🔴 **`"3ª feira às 17:30"` → `"17h"`**. `memory-extraction.ts:139` monta o objeto como `` `${timeMatch[1]}h` `` e o `:30` **é descartado em silêncio**. **É o turno do Ronaldo** (10/08, `CR-7`), e 17h00 **cabe** no expediente enquanto 17h30 **não** — o erro de captura inverteria o veredito do `evaluateSlot` |
| `prefers_bedrooms` | 7 | *"Morar. Só tem 2 quartos?"* e *"São todos com 2 suítes"* viram **preferência** — são **pergunta** e **eco**. É a mesma classe que o `88-13` fecha para slots |
| `budget` | 4 | `"490 mil"`, `"400 mil"`, `"350."`, `"260.000"` — **quatro formatos, nenhuma normalização** |
| `marital_status` / `prefers_garage` / `prefers_floor` / `down_payment` | 4/2/1/1 | `marital_status: "noivo"` de *"Meu **noivo** está viajando"* — é o estado civil **de outra pessoa** |

**E o controle negativo, que é o número mais importante da tabela.** O mesmo extrator contra as
**593 mensagens `role='assistant'`** — ou seja, o que ele produziria se algum dia alguém o apontasse
para a fala da Nicole:

```
593 mensagens da Nicole  →  329 com ≥1 fato (55,5 %)  →  559 fatos
                                                          ▲
                            3,07 × o volume do caminho do lead (182)
```

E a amplificação é **concentrada exatamente nos predicados de agenda** (medição do @po):

```
available_day    31 →  83   (2,7×)   ["sábado" ×30]
available_time    7 →  44   (6,3×)
prefers_bedrooms  7 → 105  (15,0×)
name              — →  56   (55 deles literalmente "Nicole")
```

**A fala da Nicole é 3 vezes mais "extraível" que a do lead**, porque ela fala em frases completas e
repete os dados de volta. É a medida exata do padrão *output vira input*: **qualquer afrouxamento
futuro que deixe o extrator ver a resposta triplica o substrato com material que o lead nunca
disse.** Por isso a **AC9** existe, e por isso ela é uma AC de **constraint de banco**, não de
revisão de código.

> **Como ler esta seção:** ela **não** é argumento contra o extrator. É o **denominador declarado**
> que a régua tem de trazer para virar AC — *"pega N / erra M, com os M nomeados"*. Um critério que
> chegasse já satisfeito não mediria nada.

### 4. 🔴 O extrator antigo **não volta restaurado do git** — decisão revista

A v0.1 planejava *"`memory-extraction.ts` sai no bloco A e volta no bloco B, restaurado do sha"*.
**O @po rejeitou, e ele está certo.**

A §3 acima **reprova quase todos os predicados** do módulo, e a **AC10** exige remedição **um a um**
antes de adotar qualquer um. **As duas coisas não se sustentam juntas:** se cada predicado precisa
ser remedido e a maioria precisa ser reescrita, **o que volta não é este módulo — é uma régua nova
que reaproveita, no máximo, alguns `PATTERNS`.**

⇒ **`memory-extraction.ts` fica no histórico do git como REFERÊNCIA DE PADRÕES, não como base de
restauração.** O sha do commit anterior à remoção fica anotado na PR da **`87-16`** por **valor de
arquivo**, e **nenhuma AC de nenhuma das duas stories depende dele** (sha dentro de AC apodrece em
rebase). Ganho: some o delete-e-restaura, e a AC10 deixa de contradizer a T-de-restauração.

---

## Desenho — o substrato. Tabela nova, nome novo, proveniência na constraint

### 1. Nome novo — e não é preferência estética

**Tabela `lead_fato` (não `lead_facts`).** A `012` está **registrada como aplicada** em
`supabase_migrations.schema_migrations`, e os objetos **nunca existiram** (`to_regclass` = `null`,
`match_lead_memory` = 0 procs — medido em produção, reconferido pelo @po). Reusar o nome antigo
significa que qualquer `supabase db push` futuro **pula** a `012` e mantém a divergência viva, e que
a próxima pessoa que ler o nome vai encontrar dois desenhos incompatíveis com o mesmo identificador.
**A `012` não é consertada por esta story** — vai como achado (**AC11**).

### 2. As quatro exigências viram **constraint**, não convenção

```sql
create table public.lead_fato (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null,                      -- de leads.org_id (multi-tenant)
  lead_id                   uuid not null references public.leads(id) on delete cascade,

  -- ── (1) PROVENIÊNCIA TIPADA ────────────────────────────────────────────────
  source_message_id         uuid not null references public.messages(id) on delete restrict,
  source_message_role       text not null check (source_message_role = 'user'),   -- ⬅ a regra
  source_message_created_at timestamptz not null,
  source_quote              text not null check (length(source_quote) between 1 and 280),

  -- ── (2) ÂNCORA TEMPORAL ────────────────────────────────────────────────────
  captured_at               timestamptz not null default now(),  -- o instante da captura
  anchored_on               timestamptz not null,                -- o "agora" da resolução
  resolved_date             date,                                -- data ABSOLUTA, resolvida na captura
  resolved_hour             smallint,
  resolved_minute           smallint,
  expires_at                timestamptz,                         -- TTL, no padrão 87-4 (48 h)

  -- ── (3) SEMÂNTICAS NÃO COLAPSADAS ──────────────────────────────────────────
  kind                      text not null check (kind in (
                              'lead_declarou',      -- texto solto do lead      (= 'mencao'  da 87-4)
                              'lead_respondeu',     -- resposta a pergunta nossa (= 'pendencia' da 87-4)
                              'formulario',         -- veio do lead form, o lead NÃO disse
                              'sistema_perguntou'   -- o que NÓS perguntamos. Registro, nunca estado
                            )),

  predicate                 text not null,
  object                    text not null,
  valid_from                timestamptz not null default now(),
  valid_to                  timestamptz,
  superseded_by             uuid references public.lead_fato(id),

  -- (2b) fato temporal SEM data absoluta é proibido — é o CR-4 barrado no tipo
  constraint fato_temporal_exige_data_absoluta check (
    predicate not in ('available_day','available_time') or resolved_date is not null
  )
);

-- (3b) SÓ o que o lead declarou é ESTADO. O resto é registro.
create view public.lead_fato_estado as
  select * from public.lead_fato
   where kind in ('lead_declarou','lead_respondeu')
     and valid_to is null
     and (expires_at is null or expires_at > now());
```

**O índice único NÃO está acima de propósito — ele é o defeito D1, e a AC3 é dona dele.**

**O que cada peça compra, contra o que já aconteceu nesta casa:**

| Peça | Impede | Incidente que a origina |
|---|---|---|
| `source_message_id` **FK `NOT NULL`** | fato sem mensagem de origem; e **eco**: uma FK não se falsifica por substring | `87-12` §5 — as duas réguas por texto reprovadas |
| `source_message_role = 'user'` **`CHECK`** | a fala da Nicole virar fato do lead | CR-3 (Sandra) · exposição medida **3,07×** (§3) |
| `anchored_on` + `resolved_date` | frase relativa reancorar no relógio a cada leitura | CR-4 · `87-4` · **31/31 dias relativos** (§3) |
| `kind` com 4 valores + a **view** | `"Oi"` remarcar visita de lead em negociação | `agenda-state.ts:62-88`, com nome e data |
| `formulario` como `kind` próprio | **95 autotextos** entrarem como fala do lead | §3, `interested_in` |

### 3. 🔴 Defeito de desenho **D1** — o índice único rejeitaria **16 de 182 fatos (8,8 %)**

*(Medido pelo @po contra os 182 fatos reais de 30 dias. Entra como correção obrigatória.)*

A v0.1 propunha:

```sql
create unique index lead_fato_ativo_unico
  on public.lead_fato (lead_id, predicate, object) where valid_to is null;
```

**`resolved_date` não está na chave** — e a AC2 torna `resolved_date` obrigatório justamente porque
*"sábado"* não significa nada sem ela. **A identidade do fato ignora exatamente o campo que dá
sentido ao fato.** Rodada contra os 182 fatos reais:

```
chaves distintas: 166  |  chaves com >1 ocorrência (= INSERT que bateria 23505): 15
fatos que NÃO entrariam por colisão: 16 de 182  (8,8 %)

  available_day='quinta'  x2  lead 32e0ee55  datas: 2026-08-03, 2026-08-04   ← DUAS quintas diferentes
  available_day='sexta'   x2  lead bccc4aa6  datas: 2026-08-03
  interested_in='vind'    x3  lead 791182c2  datas: 2026-07-18, 27-07, 05-08
  objection='price'       x2  lead e7b82ead  ·  prefers_bedrooms='3' x2  lead 6e4cb02b
```

**O caso `32e0ee55` é o veredito: duas quintas-feiras de semanas diferentes, dois `resolved_date`
diferentes, um único slot no índice.** E o `expires_at` **não salva** — ele filtra a **view**, mas o
índice parcial filtra por `valid_to is null`. Um fato expirado **sai do estado e continua ocupando a
vaga**.

⇒ Resultado: o substrato guardaria **uma** *"sábado"* para sempre, com a data absoluta da primeira
vez. **É o gerador perpétuo de sábados do CR-4 entrando pela porta que o desenho deixou aberta** —
ou seja, o defeito que esta story existe para fechar, reproduzido um nível acima.

**Duas saídas, e a AC3 exige que o @data-engineer escolha UMA e prove:**

| # | Saída | Custo |
|---|---|---|
| **(a)** | `resolved_date` (e `resolved_hour`/`resolved_minute`) entram na chave do índice único | os 16 passam; duas quintas coexistem como dois fatos, que é o correto |
| **(b)** | O escritor **fecha o fato anterior** (`valid_to = now()`, `superseded_by = novo.id`) em vez de colidir | historiza; exige transação ou `ON CONFLICT DO UPDATE`, e a corrida volta a ser problema |

**Recomendação do @sm: (a) para os predicados temporais e (b) para os não-temporais** — mas a
decisão é do @data-engineer, **com os 16 de 182 rodados contra a chave escolhida e a saída colada**.

### 4. 🔴 Defeito de desenho **D2** — o `kind` não tem classificador, e é ele que a view usa como enforcement

*(Medido pelo @po. Entra como correção obrigatória.)*

O `CHECK` do `kind` valida **o domínio** (um de quatro valores). **Nada valida a escolha.** E a view
`lead_fato_estado` — o enforcement inteiro da §"semânticas não colapsadas" — **filtra por `kind`**.

Ou seja: `source_message_role` está no tipo e na FK; **`kind` está na convenção do escritor.** É
exatamente a *"proveniência por convenção de call site"* que a §2-bis denuncia, **reproduzida uma
camada acima, no campo que decide o que é estado**.

E a v0.1 materializava o defeito: *"`interested_in` entra com `kind='formulario'`"* — **por
predicado**. Medido:

```
mensagens autotexto que geram fato: 95     predicados produzidos POR autotexto: {"interested_in": 95}
interested_in de autotexto: 95   |   interested_in NÃO-autotexto: 5
```

**Boa notícia:** o autotexto do lead form produz **exclusivamente** `interested_in` (95 de 95) —
nenhum outro predicado se contamina. **Má notícia: os 5 restantes são declarações reais** e virariam
`formulario` por engano:

```
vind    <= "Gostaria de saber mais sobre o vind"
yarden  <= "E o yarden?"
vind    <= "Acho q o vind faria mais sentido agora…"
vind    <= "Me interessei pelo Vind e pelo Calefi Home Club. Mas estou vendo outr…"
```

⇒ **A regra correta é por MENSAGEM (o texto é o autotexto do formulário?), não por PREDICADO.** O
discriminador existe, é trivial, **casa 95/95 e 0/5** — e a v0.1 não o escrevia em lugar nenhum. Sem
ele, `kind` é um campo que qualquer escritor preenche como quiser, e a view herda o arbítrio. **A
AC4 é dona disso.**

### 5. 🔴 Não existe coluna `confidence`. **É deliberado.**

A `012` tinha `confidence numeric`, e o `loader.ts:59` ordenava por ela. **`confidence` é o mecanismo
pelo qual uma régua ruim entra como "fato 0.7" em vez de não entrar.** Ela é o oposto de
proveniência: transforma *"este fato não tem lastro"* em *"este fato tem lastro fraco"*, e a segunda
frase sempre acaba lida como a primeira por quem consome. **Ou o fato tem `source_message_id` de uma
mensagem `role='user'` e vira estado, ou não vira.** Sem meio-termo numérico.

*(Se o @architect ou o @data-engineer quiserem `confidence` de volta, o ônus é declarar **quem lê e
com que limiar** — sem isso é um número que só serve para justificar guardar lixo.)*

### 6. O contrato de leitura e escrita — **fail-loud por construção**

Herda o **contrato universal do `Epic 88 · §3`** (*"nenhuma tool devolve vazio ambíguo… erro de
infraestrutura nunca vira 'não encontrei'"*), aplicado ao substrato:

```ts
type LeituraFatos =
  | { status: "ok";            fatos: LeadFato[] }
  | { status: "vazio";         fatos: [] }          // não havia fato    → SEM evento
  | { status: "indisponivel";  fatos: [] }          // a leitura FALHOU  → COM evento
```

- **`vazio` × `indisponivel` é a story inteira.** `if (error || !facts) return ""` colapsava os dois
  e foi o mecanismo que escondeu o MemPalace por quatro meses.
- `indisponivel` emite **`NICOLE_FATO_LEITURA_FALHOU`** em `system_events` e o chamador **não injeta
  bloco de memória nenhum**. Cair no `ai_summary` é permitido — **em silêncio, não**: quando cair,
  emite **`NICOLE_FATO_FALLBACK_RESUMO`**.
- Toda escrita confere `error` **explicitamente** — **`supabase-js` não lança**, então `try/catch` em
  volta de `.insert()` é decorativo (foi o que fez os três `catch` do MemPalace nunca dispararem em
  4 meses) — e emite **`NICOLE_FATO_ESCRITA_FALHOU`**.
- Nomes no padrão em uso (`NICOLE_AGENDA_STATE_EXPIRADO`, `NICOLE_SLOT_UNAUTHORIZED`, …).

### 7. Onde o escritor é chamado — cinco requisitos, não uma linha

A **`87-16`** remove o `12.5a`/`12.5c` de `pipeline.ts`. Esta story **não** os recoloca no mesmo
ponto. Requisitos do novo call site, nesta ordem:

1. **Depois** de a mensagem do lead estar **persistida em `messages`** — sem a linha gravada não
   existe `source_message_id`, e o fato **não pode nascer**. *(É a diferença que torna a regra
   executável: o `12.5a` gravava a partir da variável `message`, que não tem `id`.)*
2. **Fora do caminho da resposta** (`after()` do `next/server`, padrão da casa desde a `21.1`), para
   não somar latência a um p95 que já é **12.469 ms (n = 442)**.
3. **Uma escrita por mensagem do lead**, idempotente **por constraint** — nunca "ler antes de
   escrever", que foi o `REL-001` do gate da `87-3`. **A chave é a que a AC3 fixar**, não a da v0.1.
4. **`org_id` derivado de `leads.org_id`** — `messages` **não tem `org_id`** (conferido); o caminho é
   `messages → conversations → leads`.
5. **Escrita órfã é proibida por AC:** se `source_message_id` não resolver para uma linha real, o
   escritor **não grava** e emite `NICOLE_FATO_ORIGEM_INVALIDA`.

**@dev e @architect decidem o ponto exato**; a story fixa os cinco requisitos, não a linha.

---

## O que esta story **NÃO** faz — por decisão escrita

1. **Não lê o substrato para decidir nada.** `lead_fato` nasce **WRITE-ONLY**, no mesmo padrão do
   `afirmado_pela_nicole` da `87-10`. Nenhum byte dele entra no system prompt, no `collected_data`,
   no handoff ou em qualquer gate. **A leitura é o bloco C**, é caminho de decisão novo, e nasce
   Onda 3+ por definição.
2. **Não enterra o MemPalace.** Isso é a **`87-16`**.
3. **Não faz busca semântica, embeddings, grafo temporal nem "memória progressiva".** *"O substrato
   antes da camada"* — foi exatamente a inversão que produziu o MemPalace.
4. **Não migra o `ai_summary`** para o formato novo. O `ai_summary` continua sendo a memória viva
   (`87-7` o protegeu; a `87-16` preserva a injeção). Backfill retroativo é impossível por
   construção: os fatos antigos **não têm mensagem de origem**, e inventar uma seria a própria doença.
5. **Não reaplica nem conserta a migration `012`.** Vai como achado (AC11).
6. **Não toca `agenda_state`.** A agenda continua com o dono dela (`87-4`/`87-10`/`87-12`).
   Convergir os dois formatos é trabalho posterior, e **só depois** de o `lead_fato` ter provado que
   funciona.
7. **Não conserta o fail-open do `extractCollectedData`** (§2-bis). Backlog, vizinho da `87-11`.

---

## Numeração da migration — conferida hoje, com duas armadilhas

- **Maior prefixo em `origin/main` e em todas as branches: `230`** (`230_f4_rpcs_views_unificacao.sql`).
  Conferido **por arquivo** (`git ls-tree origin/main`), não por `max(version)`.
- **`231` está reservado** pela `87-12` (`Draft`, não commitada) — `87-12` §T5, linhas 15 e 496.
- **`git log --all --diff-filter=A -- "supabase/migrations/23[12]*"` ⇒ vazio.**
- ⇒ **Esta story crava `232`.** O `@data-engineer` **reconfere no momento de criar**.
- 🔴 **Armadilha 1 — os buracos `207` e `221` NÃO devem ser preenchidos.** Existem e estão vagos;
  reusá-los aplica a migration fora de ordem.
- 🔴 **Armadilha 2 — há duas convenções de versão convivendo.** `max(version)` em
  `supabase_migrations.schema_migrations` é **`20260710171933`** (timestamp), não `230`. E há **20
  prefixos numéricos duplicados** na história do repositório (`021, 024, 025, 027, 028, 029, 031,
  032, 033, 034, 036, 044, 048, 063, 066, 075, 102, 104, 164, 170`). **Conferir por arquivo, nunca
  por `max()`.**

---

## Acceptance Criteria

> **Regra que vale para todas as ACs, e não é decorativa.** Uma AC só conta como satisfeita com:
> **(i) mutação com contagem esperada declarada ANTES**; **(ii) controle positivo**; **(iii)
> controle negativo**; **(iv) denominador declarado** em qualquer percentual ou régua. **Saída bruta
> do executor colada, nunca transcrita.**

**AC1 — a proveniência é `NOT NULL` + FK + `CHECK`, provada por mutação NO BANCO.**
Colar a saída bruta de três `INSERT` contra o banco de dev:

| # | `INSERT` | Esperado |
|---|---|---|
| **positivo** | linha completa, `source_message_id` de uma `messages` real com `role='user'` | **sucesso** |
| **negativo 1** | sem `source_message_id` | erro **`23502`** (`not_null_violation`) |
| **negativo 2** | `source_message_role = 'assistant'` | erro **`23514`** (`check_violation`) |

**AC2 — âncora temporal: predicado temporal sem data absoluta é rejeitado pelo banco.**
`INSERT` com `predicate='available_day'`, `object='sábado'`, `resolved_date = null` ⇒ **`23514`**.
**Controle positivo:** o mesmo fato com `resolved_date` resolvido **na captura** contra
`anchored_on` ⇒ sucesso. **A resolução reusa o resolvedor da `87-4`** (`agenda-state.ts` +
`visit-slot.ts`) — **não** escrever um segundo. **Denominador:** os **31 `available_day` de 30
dias**, dos quais **31 são relativos** — a AC exige que os 31 tenham `resolved_date` preenchida ou
sejam rejeitados; **nenhum passa "cru"**.
⚠️ **Sub-item medido pelo @po:** `fato_temporal_exige_data_absoluta` exige `resolved_date` para
`available_time`, mas **não** exige `resolved_hour`. Dos **7 `available_time`** medidos, **~5 vêm de
mensagens sem dia** e serão rejeitados (correto, fail-closed) — **por isso o controle positivo da
AC2 precisa de uma fixture com dia E hora na MESMA mensagem**, senão o positivo nunca é exercitado.

**AC3 — 🔴 NOVA. A chave do índice único não perde a resolução temporal. Denominador vermelho: 16 de 182.**
*(Fecha o defeito **D1** — §Desenho 3.)*
- O @data-engineer escolhe **(a)** (`resolved_date`/`resolved_hour`/`resolved_minute` na chave) ou
  **(b)** (escritor fecha o fato anterior com `valid_to`/`superseded_by`), **e escreve por que**.
- **Prova obrigatória:** rodar a chave escolhida contra os **182 fatos reais de 30 dias** e colar a
  saída. **Meta: 0 colisões falsas.** Hoje a chave da v0.1 dá **15 chaves colidindo / 16 fatos
  perdidos (8,8 %)**.
- **Controle positivo que quebra a colinearidade — obrigatório:** o par do lead `32e0ee55`,
  `available_day='quinta'` em **2026-08-03** e em **2026-08-04**. **Duas quintas de semanas
  diferentes têm de coexistir como dois fatos.** Se a fixture não separar os dois, ela não mede a
  chave — mede o predicado.
- **Controle negativo:** duplicata verdadeira (mesmo lead, mesmo predicado, mesmo objeto, **mesma**
  `resolved_date`) ⇒ **`23505`**.
- **`expires_at` não entra na conversa:** ele filtra a **view**, o índice parcial filtra por
  `valid_to is null`. **Declarar por escrito na PR** que fato expirado não ocupa vaga — ou, se
  ocupar, que isso é deliberado e por quê.

**AC4 — 🔴 NOVA. O `kind` tem regra de classificação escrita, e ela é POR MENSAGEM.**
*(Fecha o defeito **D2** — §Desenho 4.)*
- A regra vive em **código, testada**, não em convenção de call site. **Classificar por PREDICADO é
  proibido por esta AC** (era o que a v0.1 fazia).
- **Controle positivo:** as **95** mensagens de autotexto de lead form ⇒ **95/95 `formulario`**.
- **Controle negativo:** as **5** declarações reais de `interested_in` ⇒ **0/5 `formulario`**
  (viram `lead_declarou` ou `lead_respondeu`). As cinco estão nomeadas na §Desenho 4 e **entram como
  fixture literal** — incluindo *"E o yarden?"*, que é a mais curta e a que mais parece autotexto.
- **Denominador declarado:** **100 `interested_in` em 30 dias = 95 autotexto + 5 reais.**
- **Mutação:** trocar a regra por *"predicado `interested_in` ⇒ `formulario`"* ⇒ **declarar quantos
  testes ficam vermelhos e colar.** Esperado: **≥ 5** (um por declaração real). **Se for zero, a AC
  não mede nada.**
- **Separação `lead_declarou` × `lead_respondeu`** (= `mencao` × `pendencia` da `87-4`): **reusar a
  noção de pendência que a `87-4` já tem** (`isPendencia`, `agenda-state.ts`), **não** escrever uma
  segunda.

**AC5 — as semânticas não colapsam, e a view é o enforcement.**
`select count(*) from lead_fato_estado` **antes**; inserir 1 linha `kind='sistema_perguntou'` e 1
linha `kind='formulario'` com o **mesmo** `predicate`/`object` de uma linha `lead_declarou`
existente; **a contagem da view não muda** (a da tabela sobe 2). Colar as três contagens. **É a
prova, em SQL, de que um `"Oi"` não pode chegar onde uma disponibilidade chega.**

**AC6 — a fixture do `"Oi"` é obrigatória, e vem com o par que a separa.**
- **negativo:** mensagem `"Oi"` de um lead **com oferta viva no estado** ⇒ **0 fatos gravados**.
- **positivo:** `"pode ser sábado às 9"`, mesmo lead, mesma sessão ⇒ **1 fato**, com
  `kind='lead_respondeu'` (houve pergunta nossa) e `resolved_date` absoluta.
- **o par que quebra a colinearidade:** `"São todos com 2 suítes"` (medido em produção, §3) ⇒ **0
  fatos** — é eco/pergunta, não preferência. Hoje o extrator grava `prefers_bedrooms=2`.

**AC7 — 🔴 `vazio` × `indisponivel` são distinguíveis. Mutação obrigatória.**
- **negativo (a leitura falha):** apontar a leitura para tabela inexistente ⇒ `status:"indisponivel"`
  **+ `NICOLE_FATO_LEITURA_FALHOU` emitido + nenhum bloco de memória na entrada do modelo**
  *(a asserção sobre a **entrada** do modelo depende do harness `88-2`; sem ele, asserção sobre o
  retorno da função + o evento, e o débito fica registrado aqui)*.
- **positivo (não havia fato):** lead sem nenhuma linha ⇒ `status:"vazio"`, **sem** evento.
- **mutação:** substituir a discriminação por `return ""` (o comportamento do MemPalace) ⇒ declarar
  **quantos testes ficam vermelhos** e colar a saída. **Se for zero, a AC não mede nada e tem de ser
  reescrita.**

**AC8 — 🔴 a escrita confere `error`. Mutação obrigatória.**
`supabase-js` **não lança**. O escritor confere `error` explicitamente e emite
`NICOLE_FATO_ESCRITA_FALHOU`. **Mutação:** remover o `if (error)` ⇒ declarar quantos testes ficam
vermelhos e colar. **Controle negativo adicional:** apontar o `insert` para tabela inexistente e
provar que o evento dispara — porque é **exatamente** o cenário dos últimos 4 meses.

**AC9 — o extrator não vê a fala da Nicole, e isso é garantido pelo banco.**
O `CHECK` do `source_message_role` (AC1) já barra. **Adicionalmente:** teste que chama o escritor
passando uma mensagem `role='assistant'` e prova que **nada é gravado** e que o evento
`NICOLE_FATO_ORIGEM_INVALIDA` dispara. **Contexto medido a citar na PR:** o extrator, apontado para
as 593 falas da Nicole, produziria **559 fatos — 3,07× o caminho legítimo**, concentrados em
`prefers_bedrooms` (15,0×), `available_time` (6,3×) e `available_day` (2,7×).

**AC10 — a régua entra com os erros contados. Nenhum predicado entra "de graça".**
Para **cada** predicado adotado na v1, a PR traz a linha `pega N / erra M`, medida contra as
**1.052 mensagens `role='user'` de 30 dias**, com os **M nomeados**. Os mínimos já medidos (§3) e que
o @dev deve **reproduzir, não copiar**:

| predicado | pega | erra | decisão sugerida |
|---|---|---|---|
| `interested_in` | 100 | **95 são autotexto de lead form** | entra com `kind='formulario'` **pela regra da AC4 (por mensagem)** — os 5 reais **não** viram `formulario` |
| `available_day` | 31 | **31 relativos** | só entra com `resolved_date` (AC2) e chave da AC3 |
| `name` | 12 | **5 sobre-capturam; 3 não são leads** | **não entra na v1** até a régua ser reescrita |
| `available_time` | 7 | **1 perde os minutos** (`17:30 → 17h`, `memory-extraction.ts:139`) | corrigir na régua nova **ou não entra** |
| `prefers_bedrooms` | 7 | eco e pergunta viram preferência | precisa da guarda de interrogação (irmã do `88-13`) |
| `objection` / `budget` / `marital_status` / demais | 13/4/4/… | ver §3 | **@dev decide e conta**; sem contagem, não entra |

> **Um critério que já nasça satisfeito não mede.** Se um predicado sair da medição com `erra = 0`,
> a suspeita padrão é que a amostra não o exercitou — **declarar quantas linhas o exercitaram** antes
> de adotá-lo.
>
> ⚠️ **A régua é NOVA** (§4). `memory-extraction.ts` é referência de padrões no histórico do git,
> **não base de restauração**, e **nenhuma AC depende do sha**.

**AC11 — a `012` não é tocada, e o motivo fica escrito.** A PR não altera
`supabase_migrations.schema_migrations` nem reaplica a `012`. A divergência *"registrada mas não
aplicada"* vai para o backlog como achado nomeado.

---

## Tarefas

> ⛔ **Nenhuma delas começa antes de `D2-(b)` ser ratificada pelo Gabriel e do harness existir.**

- [ ] **T1** (@data-engineer) — 🔴 **decidir e provar a chave do índice único (AC3)** contra os 182
      fatos reais, **antes** de escrever a migration. É o item que muda o DDL.
- [ ] **T2** (@dev) — 🔴 **escrever a regra de classificação do `kind` (AC4)**, por mensagem, com os
      controles 95/95 e 0/5. É o item que muda o contrato do escritor.
- [ ] **T3** (@data-engineer) — migration **232** (reconferir por arquivo), DDL da §"Desenho", o
      índice da T1 e a view. **RLS por `org_id` no padrão vigente** — referência concreta:
      `supabase/migrations/228_f4_furos_e_decisoes.sql`, `229_f4_god_gate_fatiado.sql` e
      `230_f4_rpcs_views_unificacao.sql` (as três mais recentes com `CREATE POLICY`; o refactor F3/F4
      trocou `*_ROLES` por **capabilities**, então **não** copiar padrão anterior à 225).
      **`lead_fato_estado` é view** — views não aceitam `CREATE POLICY`; o escopo vem da tabela-base
      ou de `WHERE` com `user_org_id()`, como na `52-1`.
- [ ] **T4** (@data-engineer) — executar e colar as saídas brutas das AC1, AC2, AC3 e AC5 contra dev.
- [ ] **T5** (@dev) — **régua nova**, predicado a predicado, sob a AC10. Devolve candidatos com
      `source_message_id` obrigatório, **sem `confidence`**.
- [ ] **T6** (@dev) — escritor com o contrato fail-loud (AC7/AC8/AC9) + os 4 eventos.
- [ ] **T7** (@dev) — reusar o resolvedor temporal da `87-4` e a noção de pendência (`isPendencia`);
      **não** escrever um segundo de nenhum dos dois (AC2, AC4).
- [ ] **T8** (@dev + @qa) — a medição da AC10, reproduzida (não copiada), com os erros nomeados.
- [ ] **T9** (@qa) — as quatro mutações (AC3, AC4, AC7, AC8) com contagem esperada declarada
      **antes**.

---

## Dev Notes

### Mapa de código

*(Linhas contra `HEAD` `199a7a84`, árvore limpa. ⚠️ A árvore de trabalho de hoje está suja com
`87-5 B` + `87-11` e desloca `pipeline.ts` em **+2**. Conferir por conteúdo. E **estes números
mudam depois que a `87-16` mergear** — ela remove ~40 linhas de `pipeline.ts`.)*

| Arquivo | Linha | O que é |
|---|---|---|
| `packages/ai/src/flows/agenda-state.ts` | 62-88 | o docstring do `"Oi"` (**leitura obrigatória**) |
| | 91-121 | `AgendaState` — o desenho que esta story generaliza |
| | 137-160 | `buildAgendaState` — o resolvedor temporal a **reusar** (AC2) |
| | — | `isPendencia` — a noção de pergunta-nossa a **reusar** (AC4) |
| `packages/ai/src/flows/qualification.ts` | 129 | `extractCollectedData(…, aiResponse, …)` |
| | 321 | `if (opts?.origem === "lead")` — a **única** guarda de origem, fail-closed |
| | 158-260 | nome/email/quartos/vaga/andar/vista — **sem guarda, fail-open** (achado 2) |
| | 361 | `fonte: "mencao"` — o terceiro sítio de escrita do `agenda_state` |
| `packages/ai/src/chat/pipeline.ts` | 1276 / 1278 | call site `origem: "lead"` (`HEAD` / árvore suja) |
| | 1296 / 1298 | call site `origem: "assistant"` — **a resposta inteira da Nicole** |
| `packages/ai/src/flows/memory-extraction.ts` | 17-47 | os `PATTERNS` — **referência**, removido pela `87-16` |
| | 139 | `` `${timeMatch[1]}h` `` — **onde o `:30` do Ronaldo morre** |
| `packages/ai/src/rag/embeddings.ts` | 18-25 | `generateEmbedding` — **cai em hash silencioso sem `OPENAI_API_KEY`**; a variante `Strict` (36) lança. **O escritor desta story não usa embedding nenhum** |
| `supabase/migrations/228…230_*` | — | os três padrões vigentes de `CREATE POLICY` (pós-refactor F3/F4) |

### Abordagem de teste — explícita, porque metade das ACs é de teste

| Camada | Ferramenta | O que prova | Onde |
|---|---|---|---|
| **Unidade** | `vitest run` (**não** Jest) | régua nova, classificador de `kind` (AC4), contrato `ok`/`vazio`/`indisponivel` | `packages/ai/src/**/*.test.ts` |
| **Integração de pipeline** | `__fixtures__/fake-supabase.ts` (da `75-279` — **filtros reais**, não `is: () => b`) | que o escritor grava (ou não grava) o que a AC diz | `packages/ai/src/chat/*.test.ts` |
| **Entrada do modelo** | harness **`88-2`** — **ainda não existe** | AC7 (nenhum bloco de memória no prompt quando a leitura falha) | débito declarado na AC7 |
| **Banco** | `INSERT` real contra o projeto de dev, **saída bruta colada** | AC1, AC2, AC3, AC5 — as constraints, não a intenção delas | migration 232 |
| **Corpus retrospectivo** | `tsx` + módulo real contra 30 dias de `messages` | AC3 (16/182), AC4 (95/95 e 0/5), AC10 (`pega N / erra M`) | @dev + @qa |

**Mock que não filtra não conta.** Já aconteceu nesta casa: mocks com `in:` / `eq:` que aceitavam
qualquer coisa deixaram uma suíte inteira verde sobre um filtro inexistente.

**Uma asserção por `toContain`.** Duas asserções no mesmo `toContain` já esconderam um defeito aqui.

### Armadilhas

1. **`supabase-js` não lança.** `try/catch` em torno de `.insert()` é decorativo. Conferir `error`.
   *(Três `catch` do MemPalace nunca dispararam em 4 meses por causa disso.)*
2. **`.single()` × `.maybeSingle()`** — regra da casa desde a `21.1`; esta story usa `maybeSingle`.
3. **Não criar índice `ivfflat`/pgvector.** Sem embeddings na v1.
4. **`messages` não tem `org_id`** — conferido. O `org_id` do fato vem de `leads.org_id`, via
   `messages → conversations → leads`.
5. **`properties.is_active` é soft delete** nesta casa; irrelevante aqui, mas registrado porque já
   confundiu duas stories deste epic.
6. **Numeração de migration:** conferir **por arquivo** contra `origin/main`, nunca por
   `max(version)` (§"Numeração").
7. **Teste de componente React é impossível neste repo** (sem `testing-library`; o `vitest` só
   coleta `.test.ts`). Não há UI nesta story — registrado para não virar AC por engano.
8. 🔴 **A régua de procedência por substring apaga a própria evidência** — a Nicole ecoa o horário do
   lead de volta (`87-12` §5). **É por isso que a proveniência é FK, e não texto.**

### Fronteiras com outras stories

| Story | Fronteira |
|---|---|
| **87-16** (`Draft`, `P1/Onda 1`) | 🔴 **O bloco A saiu para lá.** Ela remove `memory/loader.ts`, `memory/writer.ts`, `flows/memory-extraction.ts` e o `12.5a`/`12.5c`, **preservando a injeção do `ai_summary`**. **Não há dependência de ordem entre as duas** — esta story não precisa que aquela mergeie; só herda o mapa de código deslocado |
| **87-4** (`Done`) | **Dona do `agenda_state`.** Esta story **ADAPTA** o desenho dela e **reusa** `buildAgendaState` e `isPendencia`; **não** migra, **não** substitui, **não** toca o objeto |
| **87-7** (`Done`) | Dona do `ai_summary` com guarda de lastro. Não tocada |
| **87-10** (`Ready`) | O padrão **WRITE-ONLY** vem dela. Mesma disciplina, substrato diferente |
| **87-11** (`Draft`) | Vizinha do achado 2 (fail-open do `extractCollectedData`). **O achado não entra aqui** |
| **87-12** (`Draft`) | 🔴 **Reserva a migration `231`.** Esta usa **`232`**. Sem colisão de arquivo. E a §5 dela é a razão de esta story usar FK e não substring |
| **88-6** | 🔴 **Casador de citação (`quoteMatchesLeadMessage`).** Quando ele nascer, **o substrato já terá `source_message_id`** — ele deve validar **contra a FK**, não por substring. Se as duas coisas nascerem separadas, teremos duas noções de *"citação válida"* no mesmo sistema, e a `87-12` §5 já mostrou que a versão por texto perde |
| **88-13** | Guarda de interrogação. A **AC6** é a **irmã** dela para predicados não-agenda. Reusar a mesma lista de gatilhos (*"que tal / posso confirmar / fica melhor / prefere"*), não escrever uma segunda |
| **W4-2** (Onda 4) | É o consumidor natural do substrato, e **é dele que esta story é pré-requisito** — não da v1 do Epic 88. **Não** deve inventar a própria proveniência |
| **Bloco C** (não existe) | A **leitura**. Caminho de decisão novo, Onda 3+ por definição |

---

## Riscos

| # | Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| **1** | 🔴 **O índice único colapsa duas ocorrências temporais distintas** e o substrato guarda *"sábado"* para sempre com a primeira data | **Alta com a chave da v0.1** | **Alto** — é o CR-4 recriado dentro da correção do CR-4 | **AC3**, com **16 de 182 (8,8 %)** como denominador vermelho e o par `32e0ee55` (03/08 × 04/08) como fixture obrigatória |
| **2** | 🔴 **O `kind` é preenchido por convenção do escritor** e a view herda o arbítrio | **Alta sem a AC4** | **Alto** — o `kind` é o enforcement inteiro do estado | **AC4**: regra **por mensagem**, com **95/95** e **0/5**, e mutação esperando ≥5 vermelhos |
| **3** | O substrato nasce e ninguém lê ⇒ vira o próximo código morto | **Média** | **Alto** | É o risco honesto desta story. Mitigação: `expires_at` + contagem de linhas gravadas por semana publicada + **a story do bloco C nasce no mesmo commit desta, ainda que como `Draft` vazia** |
| **4** | Alguém "melhora" a régua para ler a resposta da Nicole | Baixa | **Alto** | `CHECK (source_message_role = 'user')` — **barrado no banco**, não em revisão de código (AC9). Exposição medida: **3,07×** |
| **5** | A régua entra sem os erros contados, *"porque a suíte está verde"* | **Alta** | **Alto** | AC10 exige `pega N / erra M` com os M nomeados e denominador de 1.052. **Suíte verde não é evidência** — nesta casa já houve **2.441 testes verdes com a guarda removida**, e nesta semana a `87-16` mediu **0 testes** protegendo o `ai_summary` no prompt |
| **6** | Colisão de migration com a `87-12` ou com branch não commitada | Média | Médio | §"Numeração": `232`, reconferência obrigatória na T3, regra *"por arquivo, não por `max()`"*. ⚠️ **Três stories já colidiram neste epic** |
| **7** | `D2-(b)` é reprovada e esta story nunca acontece | Média | **Baixo** | Por desenho: **nada aqui está pagando por turno**, e o que pagava saiu para a `87-16`. Se for reprovada, nada apodrece no repositório — que é o desfecho limpo do `D2-(c)` |
| **8** | O harness `88-2` não sai e a AC7 fica sem a asserção sobre a entrada do modelo | Média | Médio | Débito declarado **dentro** da AC7: sem harness, asserção sobre o retorno da função + o evento, e o débito fica escrito |

---

## Critério de rollback — escrito ANTES do deploy (`D7`)

**Gatilhos:** **(a)** `NICOLE_FATO_ESCRITA_FALHOU` > 5 % dos turnos em 24 h; **(b)** qualquer
resposta da Nicole demonstravelmente alterada (**não deveria existir — é write-only**, e se
acontecer significa que alguém ligou a leitura sem story); **(c)** latência p95 acima do teto do
`D88-3` (**12.469 ms, n = 442**).

**Ação:** revert do código; **a tabela FICA** (é write-only, ninguém lê, e derrubá-la perde a
evidência do que foi gravado).

**Dono da decisão:** @qa, com o Gabriel informado — mesmo arranjo do `D7`.

> ⚠️ **É esta irreversibilidade que justifica a assimetria com a `87-16`.** Lá o rollback é
> `git revert`, um comando, sem migration e sem dado. Aqui há tabela, view, índice e escritor em
> produção. **Por isso a `87-16` pode ser escrita e implementada sob a recomendação e esta não pode.**

---

## Definition of Done

- [ ] ⛔ **`D2-(b)` ratificada por escrito pelo Gabriel** — **não recomendação**
- [ ] ⛔ Harness (`W2-1` / `88-2`) existindo, ou o débito da AC7 formalmente aceito pelo @qa
- [ ] AC1–AC11 satisfeitas, com as **quatro mutações** (AC3, AC4, AC7, AC8) e as saídas de banco
      coladas
- [ ] AC3 e AC4 resolvidas **antes** de a migration ser escrita — as duas mudam o DDL/contrato
- [ ] Nenhum `if (error) return ""` novo introduzido
- [ ] Nenhum uso de `confidence` reintroduzido sem declarar **quem lê e com que limiar**
- [ ] `pnpm type-check` e `pnpm lint` limpos; `vitest run` com o delta declarado
- [ ] A story do **bloco C** (leitura) criada como `Draft`, ainda que vazia, no mesmo commit
      (mitigação do Risco 3)
- [ ] `docs/stories/epics/epic-87-…` atualizado pelo **@pm** (pedidos abaixo) — **o @sm não edita o
      corpo do epic**
- [ ] Story revalidada pelo **@po** (`*validate-story-draft`) **antes** de qualquer implementação

---

## Achados (para o backlog / @pm — **NÃO** entram nesta story)

1. 🔴 **`supabase_migrations.schema_migrations` tem a `012` como aplicada e os objetos não existem.**
   Esta story contorna (nome novo); **ninguém consertou o registro**. Enquanto ele estiver lá, um
   `supabase db push` pula a `012` e a divergência sobrevive. **Vale auditar se há outras** — a
   auditoria de paridade do epic diz que faltavam `lead_facts`, `lead_memories` e a view
   `meta_campaign_roas`, e **`meta_campaign_roas` continua sem dono**.
2. 🔴 **`extractCollectedData` é fail-open em metade dos predicados** (§2-bis). `pipeline.ts:1298`
   passa **a resposta inteira da Nicole** com `origem: "assistant"`, **por desenho documentado**, e
   **só o ramo de agenda tem guarda** (`qualification.ts:321`). **Nome, email, quartos, vaga, andar e
   vista (`:158-260`) rodam sobre a fala da Nicole hoje, sem guarda nenhuma.** A redação certa é
   *"metade da função nunca teve guarda de origem"*, **não** *"o nome do parâmetro convida ao erro"*.
   Superfície de `collected_data`, vizinho da `87-11`.
3. **`generateEmbedding` cai em vetor-hash silencioso sem `OPENAI_API_KEY`** (`embeddings.ts:18-25`).
   A variante `Strict` existe e lança, mas **só o caminho de gravação da `knowledge_base` a usa**.
   Todo consumidor de **busca** pode estar comparando hash com embedding real sem saber.
4. **`memory-extraction.ts:139` descarta os minutos** (`"17:30" → "17h"`). O módulo sai na `87-16`;
   **o achado é para quem escrever a régua nova aqui** — 17h00 **cabe** no expediente e 17h30
   **não**, então o erro inverteria o veredito do `evaluateSlot`. É o turno do Ronaldo, por outra
   porta.
5. **`messages` não tem `org_id`.** Todo join de proveniência passa por `conversations`. Registrar
   para o Epic 86 (multi-tenant), porque é um `JOIN` a mais em caminho quente.
6. **Divergência de medição registrada com método**, no padrão da casa: a primeira contagem de sítios
   que escrevem `fonte: "mencao"` deu **zero em produção** (`grep` restrito a `pipeline.ts`); a
   segunda, correta, deu **um** (`qualification.ts:361`, sob a guarda de `:321`). O @po corrigiu a
   linha de `:355` para `:361`. **As três medições ficam registradas na §2-bis com o método de cada
   uma.**

---

## ⏳ Pedidos ao @pm e ao @po — o @sm não edita o corpo do epic

**Ao @pm** (`docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md`):

1. **`stories_planned` — entrada corrigida** (a v0.1 pedia uma entrada para os dois blocos juntos;
   agora são duas):
   ```yaml
   - item: 'W4-4 (parte) — D2-(b) "redesenhar enxuto". Substrato lead_fato, WRITE-ONLY.
       A LEITURA (bloco C) NÃO está nesta story. Bloqueada por D2-(b) + harness W2-1'
     story: docs/stories/87-15-fato-do-lead-so-existe-com-a-mensagem-que-o-originou.story.md
     status: Draft
     prioridade: P3 / Onda 4 — SEM DATA
   ```
   *(A entrada da `87-16`, que é a outra metade do `W4-4`, está pedida na story dela.)*
2. **A dep `W3-1` do `W4-4` continua valendo para ESTA story** — o que sai da herança é só a
   `87-16` (enterro). Registrar a diferença ao apontar as duas.
3. 🔴 **`Epic 88 · §8` não lista este substrato.** A tabela tem **8 linhas** e a 6ª (MemPalace,
   *"habilitante — latência"*) é a **`87-16`**. **Esta story é pré-requisito do `W4-2`, não da v1 do
   Epic 88.** *(A v0.1 falava em "nona linha"; não existe.)*
4. ⚠️ **`§10 · Notas para o @sm` diz que o maior prefixo de migration é `215`.** Hoje é **`230`**,
   `231` está reservado pela `87-12` e esta crava `232`. **Sugestão que não apodrece:** trocar o
   número por *"conferir por arquivo em `supabase/migrations/` contra `origin/main`, nunca por
   `max(version)`"*.
5. ⚠️ **`W0-2`** descreve o defeito como *"vira string vazia"*. Incompleto por dois motivos, os dois
   detalhados na `87-16` §2 e §3.

**Ao @po:**

6. ⛔ **`D2-(b)` continua aberta, e sem pressa.** **Não implementar sob recomendação** — foi assim
   que o MemPalace nasceu. O custo de esperar aqui é **zero**.
7. **As duas correções de desenho pedidas em 16/08 estão aplicadas como AC próprias:** **AC3**
   (índice único, denominador **16 de 182**, com o par `32e0ee55` de 03/08 × 04/08 como fixture) e
   **AC4** (classificador de `kind` **por mensagem**, com **95/95** e **0/5**, mutação esperando ≥5
   vermelhos). A **T9 revisada** e a **§4** fecham o *"volta restaurado do sha"*.
8. **Pendência antiga que continua aberta e não é minha:** a divergência do `87-0` (`Ready` no mapa ×
   mergeada em produção, PR #377), aberta desde 10/08.

---

## Referências

- `docs/qa/po-validation-87-15.md` — **o parecer que recortou esta story**: §3 (fatiar), §4.1 (o
  índice único, `16/182`), §4.2 (o `kind` sem classificador, `95/95` e `0/5`), §5.1 (aritmética do
  Epic 88), §5.3 (o fail-open do `extractCollectedData`), §5.4 (o extrator não volta do sha)
- `docs/stories/87-16-enterrar-o-mempalace-sem-levar-a-memoria-da-nicole-junto.story.md` — **o bloco
  A**, `P1 / Onda 1`. Remove o MemPalace morto preservando a injeção do `ai_summary`
- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **CR-2** (MemPalace código
  vivo/banco morto), **D2** (§8, as três opções), **W4-4** (Onda 4 e a §*"W4-4 por último, e de
  propósito"*, `:1075`), §7 (regra de corte da Onda 1 e o aviso do eixo errado, `:434`), **D7**
- `docs/stories/epics/epic-88-nicole-tool-use-agenda.md` — **§3** (contrato universal das tools:
  *"erro de infraestrutura nunca vira 'não encontrei'"*), **§8** (as 8 linhas — este substrato **não**
  está nelas), **§8.1** (arquitetura não se condiciona a estatística), **88-6**, **88-13**
- `docs/stories/87-4-estado-de-agenda-com-ancora-temporal.story.md` — o `AgendaState`, a `citacao`, a
  âncora, e a distinção `pendencia` × `mencao` que este substrato generaliza
- `docs/stories/87-10-estado-registra-oferta-e-afirmacao.story.md` — o padrão **WRITE-ONLY**
- `docs/stories/87-12-handoff-le-fato-de-agenda-no-formato-novo.story.md` §5 — **as duas réguas de
  procedência por texto, contadas e reprovadas**. É a razão de esta story usar FK e não substring
- `packages/ai/src/flows/agenda-state.ts:62-88` — o docstring do `"Oi"` que remarca a visita
- `~/.claude/skills/agente-atendimento-confiavel/SKILL.md` — ordem de correção (instrumento →
  proveniência → contexto → guardas → tool use), os 4 padrões de falha, as 3 regras de teste
  inegociáveis

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
| 2026-08-16 | 0.3 | **RECORTE aplicado, sob o NO-GO do @po (`docs/qa/po-validation-87-15.md` §3: "FATIAR").** O **bloco A saiu inteiro** para a nova Story **`87-16`** (`P1 / Onda 1`, sem migration) — ele estava, como escrito, **apagando o `ai_summary` do prompt em 59,3 % dos turnos**, porque `memory/loader.ts` é o único caminho pelo qual o resumo chega ao prompt e o `return ""` da tabela morta é o **gatilho** dessa injeção (`loader.ts:196`). **Esta story fica com o bloco B puro: `Draft`, P3, Onda 4, SEM DATA.** ACs renumeradas (`AC7–AC15` ⇒ `AC1–AC11`). **Duas ACs NOVAS, fechando os dois defeitos de desenho que o @po mediu:** 🔴 **AC3 — o índice único `(lead_id, predicate, object)` omite `resolved_date`**, o campo que a AC2 torna obrigatório: rodado contra os 182 fatos reais, **rejeitaria 16 de 182 (8,8 %)**, incluindo `available_day='quinta'` do lead `32e0ee55` em **03/08 E 04/08** — duas quintas de semanas diferentes, dois `resolved_date`, **uma vaga só**. E `expires_at` **filtra a view, não o índice**, então fato expirado sai do estado e **continua ocupando a vaga**: é o **gerador perpétuo de sábados do CR-4 entrando pela outra porta**, ou seja, o defeito que a story existe para fechar reproduzido um nível acima. A AC3 exige escolher entre chave ampliada **(a)** ou fechamento por `valid_to`/`superseded_by` **(b)**, provar contra os 182 e trazer o par `32e0ee55` como **fixture que quebra a colinearidade**. 🔴 **AC4 — o `kind` não tinha classificador nem AC**: o `CHECK` valida o **domínio**, não a **escolha**, e é o `kind` que a view `lead_fato_estado` usa como **enforcement inteiro** — proveniência por convenção de call site reproduzida uma camada acima. A v0.1 classificava **por predicado**; medido, o autotexto de lead form produz **95/95 só `interested_in`**, mas os **5 `interested_in` restantes são declarações reais** (*"E o yarden?"*, *"Gostaria de saber mais sobre o vind"*) e virariam `formulario`. **A regra tem de ser POR MENSAGEM**; a AC4 traz controle positivo 95/95, negativo 0/5, denominador 100, e mutação esperando **≥5 vermelhos**. Sub-item da AC2 registrado: `fato_temporal_exige_data_absoluta` não exige `resolved_hour`, e ~5 dos 7 `available_time` vêm de mensagens sem dia — **o controle positivo precisa de fixture com dia E hora na mesma mensagem**, senão nunca é exercitado. **`memory-extraction.ts` NÃO volta "restaurado do sha"** (@po §5.4, aceito): a §3 reprova quase todos os predicados e a AC10 exige remedição um a um — **o que volta é régua NOVA**; o sha fica na PR da `87-16` como **valor de arquivo**, e **nenhuma AC depende dele**. **Aritmética do Epic 88 corrigida:** o `§8` tem **8 linhas**, o MemPalace é a **6ª** e é *"habilitante — latência"*; **não existe "nona linha"** e **este substrato não aparece na tabela** — é pré-requisito do **`W4-2`**, não da v1. **Achado maior registrado nas duas stories:** `pipeline.ts:1298` passa **a resposta inteira da Nicole** com `origem: "assistant"`, **por desenho documentado**, e **só o ramo de agenda tem guarda** (`qualification.ts:321`) — **nome, email, quartos, vaga, andar e vista (`:158-260`) são fail-open hoje**. A redação certa é *"metade do `extractCollectedData` nunca teve guarda de origem"*. Vai ao backlog, vizinho da `87-11`, **fora das duas stories**. **Precisões conferidas por mim:** `qualification.ts:361` (não `:355`), `memory-extraction.ts:139` (não `:138`), `pipeline.ts:1298` na árvore suja / `:1296` no `HEAD` (deslocamento **+2** confirmado). **Migration `232` reconferida por arquivo contra `origin/main`** (maior prefixo real: **230**; `231` reservada pela `87-12`; `git log --all --diff-filter=A` para `23[12]*` vazio). **Assimetria de bloqueio, mantida explícita:** o `D2-(c)` (`87-16`) **também é recomendação**, e mesmo assim aquela story pode ser escrita e implementada — **o merge é que fica atrás de uma linha do Gabriel**. Aqui, o `D2-(b)` bloqueia **até a escrita da migration**, e a justificativa é **custo de errar**: lá o rollback é `git revert` de um comando, sem migration e sem dado; aqui há tabela, view, índice e escritor em produção. | @sm (River) |
| 2026-08-16 | 0.2 | **Validação @po (`*validate-story-draft`) — VEREDITO: 🔴 NO-GO condicional. Status permanece `Draft`.** Parecer completo em `docs/qa/po-validation-87-15.md`. **Reproduziu 11 das 13 medições do @sm ao número** (produção `SELECT`: `lead_facts`/`lead_memories` = null, rpc = 0, `012` registrada, 1.052/593/1.297; suíte 190 arquivos / 2.450 testes; 19+11+24 = 54; régua 174/182 com 95 autotexto, 31/31 relativos, `"17:30"→"17h"`; controle negativo 329/559 = 3,07×; migration 232 livre contra `origin/main`; `NICOLE_LASTRO_DIARIO` = 7, 1/dia, sem lacuna). **Executou a mutação da AC3 da v0.1:** apagou `loader.ts` e os 19 testes ficaram verdes. 🔴 **O BLOQUEANTE:** o **Risco 1 estava factualmente invertido** — `loader.ts:196` faz do `return ""` da tabela morta o **gatilho** da injeção do `ai_summary`, e a T1+T2 removeriam a memória de conversas anteriores em **624 de 1.052 turnos (59,3 %)**; a story declarou o denominador no eixo errado (14,7 % de *leads*, quando a injeção é por *turno*). Contraprova no repositório: `summary-grounding.ts:9`, da **87-7 mergeada**. Em cascata: **AC5(a)** contradizia AC5(c), e o `12.5b` viraria escritor sem leitor. **COLOCAÇÃO: FATIAR** — bloco A corrigido → `87-16` (`P1/Onda 1`); bloco B permanece aqui, `Draft` sem data. **VARREDURA de zero-import executada, não adiada: `n = 1 de 190`** (o próprio `loader.test.ts`) — **nenhuma story**, e no lugar dela uma **catraca permanente** na `87-16`. *(Registro de método do @po: as duas primeiras passadas deram 41/190 e 3/190 — `import` multilinha e o alias `@web/`.)* 🔴 **Bloco B — dois defeitos de desenho medidos:** índice único sem `resolved_date` (**16/182**) e `kind` sem classificador (**95/95** e **0/5**). **Checklist 10 pontos: 6,5/10.** | @po (Pax) |
| 2026-08-16 | 0.1 | Criação. **Medições próprias contra produção (`dsopqkqjkmhytudaaolv`, Management API, somente `SELECT`) e contra `HEAD` `199a7a84`.** Confirmado: `to_regclass('lead_facts')` e `('lead_memories')` = **null**, `match_lead_memory` = **0 procs**, e a `012` **registrada como aplicada** em `schema_migrations`. Achados principais: **(1)** a proveniência que bloqueia o Epic 88 é a de **agenda** (`87-4`/`87-10`), não a de fato do lead; **(2) a falha não é só silenciosa, é inauditável** — `supabase-js` **não lança**, então os **três** `catch` do caminho nunca dispararam em 4 meses; **(3)** `loader.test.ts` tem **19 testes e ZERO imports do módulo**; **(4) custo medido em 30 dias:** 593 chamadas Haiku, ≤1.831 embeddings, ~1.600 round-trips descartados; **(5) a régua existente rodada de verdade** contra as 1.052 mensagens `role='user'`: pega **174 (16,5 %) / 182 fatos** e erra — **95 dos 182 (52,2 %) são autotexto do lead form**, **31 de 31 `available_day` são relativos**, **5 de 12 `name` sobre-capturam e 3 não são leads**, `"3ª feira às 17:30"` vira `"17h"`; **controle negativo:** o mesmo extrator contra as 593 falas da Nicole produz **559 fatos — 3,07×**; **(6)** o desenho **não é invenção** — a `87-4` já construiu proveniência tipada + âncora + semânticas separadas para um predicado, e a única invenção real é trocar `citacao: string` por **`source_message_id` FK `NOT NULL`**, porque a `87-12` §5 contou e reprovou **as duas** réguas por texto; **(7)** migration: maior prefixo **230**, `231` reservada pela `87-12`, esta crava **232**, com as armadilhas dos buracos `207`/`221` e das 20 duplicatas de prefixo; **(8) divergência de medição registrada com método** (sítios de `fonte: "mencao"`: primeira contagem zero, segunda um); **(9) correção de status ao epic:** o `W0-5` **voltou a medir** — 7 execuções diárias desde 10/08. **Colocação NÃO forçada para a Onda 1.** | @sm (River) |
