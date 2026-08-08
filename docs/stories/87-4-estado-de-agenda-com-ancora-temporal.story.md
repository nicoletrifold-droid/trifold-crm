# Story 87-4 — O estado de agenda para de mentir: âncora temporal, procedência e TTL

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready
**Item do roadmap:** **W1-2b** (Onda 1, **deploy 1**) — ordem assinada pelo @architect na validação
de 05/08 (§1.2, condição nº 2); a ordem original, com o `W1-1` primeiro, está **revogada**
**Criada por:** @sm (River) em 2026-08-07
**Formato:** Correção de substrato. **Remove mentira; não ensina nada novo.**
**Executor:** @dev · validação em produção: @qa + responsável nomeado (D7)
**Esforço:** M · **Risco de regressão em produção:** **Médio** (muda o que a Nicole vê em toda
conversa com resíduo de agenda)

> ## ⚠️ O incidente agudo foi fechado em 07/08. A fábrica continua ligada.
>
> Gabriel desarmou em 07/08 os **3 estados armados** (Célia, Adriele, Wilson) que criariam um
> `appointment` fantasma na próxima mensagem que o lead mandasse — **inclusive "Oi"** — com backup
> das 59 conversas antes e preservando quem tem visita real. **Os três sumiram, conferido.**
>
> ### 🔴 Mas o dado NÃO está limpo. O @po remediu 8 horas depois do purge:
>
> | Medição (produção `dsopqkqjkmhytudaaolv`, **07/08**) | A v0.1 dizia | **Medido pelo @po** |
> |---|---|---|
> | `conversation_state` com resíduo de agenda | ~22 | **56** |
> | … com `visit_pending_date` | *"sem data concreta"* | **9** |
> | … cujo dia **muda** conforme a data em que for lido | — | **35** |
> | … com `visit_pending_hour` | — | **0** |
> | … **armados** (resolvem dia + hora a partir de `"Oi"`) | 0 — *"o dado está limpo"* | **1 a 6** ⚠️ ver a nota de método abaixo |
>
> **O purge não foi das 59 linhas, e a fábrica repôs.** *"Sem esta story, em duas semanas purgamos
> de novo"* — a v0.1 errou só no prazo: **em oito horas já havia estado armado de novo.**
> Foi o @architect quem escreveu, sobre o purge: *"purgar sem cortar a fonte é enxugar gelo"* (O-7).
> O desarme de 07/08 **aumenta**, não diminui, a urgência deste item.
>
> **O código que produziu esses estados não foi tocado.** `extractCollectedData(assistantMessage, …)`
> (`pipeline.ts:1099`) continua gravando a fala da própria Nicole como disponibilidade do lead;
> `resolveVisitSlotParts` continua reancorando expressões relativas contra o relógio de cada turno;
> **e o cron `enrich-leads` continua reescrevendo `visit_availability` via Haiku 48×/dia** (C1 —
> o 7º consumidor, que a v0.1 não tinha mapeado).

> ### ⚖️ Nota de método — duas medições do mesmo resíduo, e o critério muda o resultado
>
> **Registre as duas. Quem executar precisa saber que o número depende do critério.**
>
> | Quem | Método | Armados |
> |---|---|---|
> | **@po** (`po-validation-87-3-87-4.md` §2.4) | `resolveVisitSlotParts` sobre os `conversation_state` com resíduo, `message = "Oi"` e **três `now` distintos** | **6** |
> | **@sm** (medição independente, 07/08) | `resolveVisitSlotParts` + **`evaluateSlot`** sobre os **56** estados, `message = "Oi"`, um `now` | **1** — **Maria Oliveira**, que **tem** visita real correspondente (legítimo) |
>
> **A divergência é de critério, não de fato.** As hipóteses para a diferença, todas verificáveis na
> execução: o @po provavelmente incluiu casos **fora do horário comercial** (que o `evaluateSlot`
> rejeita, mas o `resolveVisitSlotParts` resolve) e/ou **outras mensagens de entrada** além de `"Oi"`.
>
> **O que fazer com isso (é tarefa da T0, não decisão do implementador):** rodar **as duas réguas**,
> declarar qual mede o quê (`resolveVisitSlotParts` = *"o parser resolve um dia+hora?"* ·
> `+ evaluateSlot` = *"o INSERT realmente dispararia?"*) e publicar os dois números. **Não escolha um
> número.** A régua mais frouxa é a que a AC4 tem de vencer, porque um estado que resolve dia+hora
> mas hoje é barrado pelo `evaluateSlot` continua sendo uma mina — basta o gate mudar.

> ## 🔒 Regra de corte da Onda 1 — e como esta story a honra
>
> *"Nenhuma story pode adicionar um novo caminho de decisão da Nicole. Se um fix precisa de
> comportamento novo, ele é Onda 3 ou 4, por definição."*
>
> Esta story **apaga três fontes de informação falsa** e não acrescenta nenhuma. Quando o estado é
> legítimo, o bloco `[SISTEMA]` produzido é **byte a byte o mesmo** de hoje — e isso é AC (**AC7**),
> não promessa.

---

## Story

**Como** engenharia da Trifold, que em 07/08 desarmou à mão três visitas fantasmas prestes a serem
criadas por leads que só disseram "Oi",
**Queremos** que o estado de agenda carregue **de quem veio**, **contra que instante foi resolvido**
e **quando morre**,
**Para que** a fala da Nicole nunca mais vire disponibilidade do lead, para que uma frase de 27/07
pare de apontar para sempre para "o próximo sábado", e para que a próxima limpeza de dados seja
desnecessária em vez de inevitável.

---

## Context — três defeitos, uma raiz

A raiz é uma só: **`conversation_state.collected_data` guarda fato de agenda como texto solto, sem
procedência, sem âncora e sem validade.** Os três sintomas abaixo são a mesma coisa vista de
ângulos diferentes.

### Defeito 1 — a data anda sozinha (caso Sandra)

`resolveVisitSlotParts` (`visit-slot.ts:355-382`) recebe `visitAvailability` como **string crua** e
chama `parseDayParts(visitAvailability, now)` — reancorando a expressão relativa contra o `now`
**de cada leitura**. Execução do @architect contra o código real:

```
"…durante a semana ou no sábado de manhã?"   (gravado em 27/07)
resolveVisitSlotParts(…, now = 05/08)  →  day = 2026-08-08     ← "Sábado, dia 8, está anotado"
resolveVisitSlotParts(…, now = 12/08)  →  day = 2026-08-15     ← ressuscita para sempre
resolveVisitSlotParts(…, now = 19/08)  →  day = 2026-08-22
```

É um relógio que aponta para sempre para "o próximo sábado". **TTL mitiga; âncora resolve.**

Escala medida em 07/08 sobre os `conversation_state` vivos:

| Medição (produção) | n |
|---|---|
| Estados com resíduo de agenda | **59** |
| … protegidos por `isAmbiguousSlotText` (a guarda da 75-245) | **4** |
| … que resolvem um dia concreto | **48** |
| … **cujo dia muda conforme a data em que forem lidos** | **46** |
| … com `visit_pending_date`/`hour` — campo **sem guarda de ambiguidade nenhuma** | **9** |
| … que resolvem dia + hora e disparavam o INSERT na próxima mensagem | **3** (desarmados 07/08) |

> A guarda da 75-245 cobre **4 de 59**. Ela protege o `visit_availability` e **não** protege o
> `visit_pending_date` já derivado dele numa sessão anterior — que é justamente o campo que o
> pipeline escreve sozinho.

> **Esta tabela é a foto PRÉ-purge (manhã de 07/08).** A foto **pós-purge**, medida pelo @po no
> mesmo dia, está no bloco de abertura: **56 estados, 9 com `visit_pending_date`, 35 com dia que
> anda.** As duas são verdadeiras e medem instantes diferentes — o purge tirou 3 armados e a fábrica
> repôs. **Remedir na execução (T0):** os dois números envelhecem por hora, não por semana.

### Defeito 2 — a guarda do `pendingDay`: a 75-268 corrigiu metade do bug que ela mesma nomeia

Evidência: **Valnira, 03/08 23:57.** Ela escreveu *"Semana de manhã"*; o pré-fetch ofereceu **três
sábados**.

```ts
// visit-slot.ts — resolveVisitSlotParts
366: let day = dayInMessage ?? pendingDay                       // ← pendingDay entra SEMPRE
372: const periodWithoutDayInMessage = !dayInMessage && !!parsePeriodParts(message)
376: if ((!day || !time) && visitAvailability && !isAmbiguousSlotText(visitAvailability)) {
377:   if (!day && !periodWithoutDayInMessage) day = parseDayParts(visitAvailability, now)
     //          ^^^^^^^^^^^^^^^^^^^^^^^^^ a guarda existe SÓ aqui
```

O comentário da própria 75-268 diz, com todas as letras: *"a Valnira pediu dia de semana e ouviu
sábado"*. A guarda foi aplicada ao caminho `visitAvailability` e **não** ao caminho `pendingDay`.

> **Isto é prova, não anedota: meio-fix reincide.** E reincide **em quatro dias** — a 75-268 subiu
> em 04/08 e o defeito que ela nomeia estava vivo em 03/08 23:57 e continua vivo hoje. O conserto
> aqui **não é acrescentar a mesma guarda num segundo lugar** — é fazer com que exista **um** lugar
> só. Ver "Desenho", item 3.

### Defeito 3 — procedência: a máquina de estados transcreve o interlocutor errado

```ts
// pipeline.ts:1087  — a mensagem do LEAD  (correto)
const updatedData = extractCollectedData(message, collectedData, { nameExpected })
// pipeline.ts:1099  — a fala da NICOLE    (é daqui que sai o veneno)
const aiExtracted = extractCollectedData(assistantMessage, updatedData)
```

`extractCollectedData` (`qualification.ts:268-302`) grava
`updated.visit_availability = aiResponse.trim()` sempre que o texto contém um dia da semana ou uma
palavra de intenção de visita — **e roda sobre a fala da Nicole**. Conteúdo real dos campos em
produção, medido em 07/08:

```
Nilson   va = "…Que tal agendar uma visita? Qual o melhor dia pra você, durante a
               semana ou sábado de manhã?"          ← fala da NICOLE
Maicon   va = "Não posso ir no stand. você consegue me passar o preço agora"
                                                     ← uma RECUSA, gravada como disponibilidade
Bianca   va = "Bom dia! Tudo bem? Sou a Nicole, da Trifold Engenharia. Como posso te
               ajudar hoje?"                         ← a saudação dela, e o "hoje" resolve
                                                       para a data de hoje, todo dia
Sandra   va = "sábado, dia 8, de 8h às 12h" + vpd = "2026-08-08"
```

**10 de 13 registros inspecionados eram lixo.** A regra que fecha a classe inteira:

> **Fato de agenda sem citação de uma mensagem `role='user'` não pode virar estado.**

### 🔴 Defeito 4 — a SEGUNDA linha de montagem: o cron `enrich-leads` escreve `visit_availability`

**Achado do @po (`po-validation-87-3-87-4.md` §2.2/C1). A v0.1 não o tinha, e ele é bloqueante.**

`grep -rn "visit_availability|visit_pending" packages/` devolve **dois** consumidores que a tabela
dos seis (AC6) não listava — e o pior deles **não lê: escreve.**

```ts
// packages/ai/src/flows/haiku-enrichment.ts:31   — dentro do ENRICHMENT_PROMPT
- visit_availability: string (dia/horario mencionado)

// packages/web/src/app/api/cron/enrich-leads/route.ts:150-153
const mergedCollectedData = { ...currentData, ...enrichment.extracted_data }
await supabase.from("conversation_state")
  .update({ collected_data: mergedCollectedData })
  .eq("conversation_id", conv.id)
```

O Haiku lê a conversa inteira — **a fala do lead E a fala da Nicole** — e grava `visit_availability`
como **string crua direto no `collected_data`, fora do `processMessage`, a cada 30 minutos**
(`*/30 * * * *` no `vercel.json`, **48 passadas por dia**). Sem citação, sem `origem`, sem âncora,
sem TTL, e **sem passar pela `isAmbiguousSlotText`**.

> **É a mesma fábrica, numa segunda esteira.** A 87-4, como estava escrita na v0.1, desligaria
> `pipeline.ts:1099` e deixaria esta ligada — e a **AC8 seria inexequível**: o contador de
> `NICOLE_AGENDA_STATE_LEGADO_DESCARTADO` **oscilaria para sempre** em vez de decair, porque a chave
> legada é reposta 48×/dia. A AC8 é justamente a que prova *"os registros morreram sozinhos, sem
> novo purge"*.

**Este defeito entra no escopo — e entra como SUBTRAÇÃO**, o que mantém a story dentro da regra de
corte da Onda 1: **uma linha removida do prompt** e **um filtro no merge**. Nenhum caminho de decisão
novo. Ver Escopo, AC6 (consumidor nº 7) e **AC8-b**.

---

## Desenho

### 1. Um objeto tipado, no lugar de quatro chaves soltas

Hoje o mesmo assunto mora em **quatro** chaves de `collected_data`, com dois formatos e nenhuma
procedência: `visit_availability` (string crua), `visit_pending_date` (ISO), `visit_pending_hour`,
`visit_pending_minute`. As duas primeiras são **duas representações da mesma coisa** — "o que o lead
nos disse sobre a visita" — e é essa duplicidade que faz a guarda precisar existir em dois lugares
(Defeito 2).

Proposta (é a estrutura do @architect, `2026-08-07-debate…` §7.2), em
`packages/ai/src/flows/agenda-state.ts`:

```ts
export interface AgendaState {
  /** Trecho LITERAL da mensagem role='user' que originou o fato. Sem citação, não há estado. */
  citacao: string
  /** Quem falou. Só 'lead' produz disponibilidade. */
  origem: "lead"
  /** Dia resolvido NO MOMENTO DA ESCRITA (YYYY-MM-DD), ou null quando o lead só deu hora/período. */
  data_absoluta: string | null
  hora: number | null
  minuto: number | null
  periodo: "manha" | "tarde" | null
  /** O instante contra o qual a resolução foi feita. É A ÂNCORA. */
  ancorado_em: string   // ISO
  /** ancorado_em + TTL. Depois disso não entra no contexto e é apagado. */
  expira_em: string     // ISO

  // ─── Reservados pela Story do item W1-2c. NADA escreve e NADA lê hoje. ───────
  // Declarados aqui de propósito, para que o W1-2c seja "passar a escrever dois
  // campos" e não uma SEGUNDA mudança de formato no mesmo objeto.
  //
  // ATENÇÃO — os dois NÃO têm a mesma confiabilidade (refinamento do @po, 07/08):
  //
  //   ofertas_do_sistema  ← deriva de authorizedSlotUtc / freeSlotsInPeriod, ou seja,
  //                         de um valor que o SISTEMA calculou. Confiança ALTA.
  //                         É ESTE que a Onda 3 (item W3-2e) vai LER para resolver
  //                         o "Ok" do lead.
  //
  //   afirmado_pela_nicole ← sai da detectAffirmedSlot, parseada da PROSA dela.
  //                         Precisão medida: ~79% (5 de 30 disparos em 60 dias são
  //                         pergunta ou oferta, não afirmação — @po §3.2).
  //                         WRITE-ONLY: observabilidade apenas. NUNCA é insumo de
  //                         decisão enquanto a guarda de interrogação do Epic 88
  //                         (condição nº 7 do @architect) não subir.
  ofertas_do_sistema?: string[]      // ISO[] — horários que o SISTEMA ofereceu
  afirmado_pela_nicole?: string | null // ISO — o que ELA afirmou no turno (NÃO CONFIÁVEL)
}
```

**Regra número um, e ela é o coração da story:**

> **`resolveVisitSlotParts` NUNCA reancora.** Ela usa `data_absoluta` ou não usa nada. A string
> `citacao` existe para auditoria e para o bloco `[SISTEMA]` poder citar em vez de afirmar — nunca
> como fonte de parse.

### 2. Escrita com procedência

- `extractCollectedData(assistantMessage, …)` **deixa de escrever qualquer campo de agenda.** O
  caminho mais simples e o recomendado: a função ganha uma opção explícita
  (`{ origem: "lead" | "assistant" }`) e o bloco de `visit_availability` só roda com `origem: "lead"`.
  Os demais campos que ela extrai da fala da Nicole (nome, imóvel, quartos…) **continuam como estão**
  — mexer neles é fora de escopo e adiciona risco sem resolver este defeito.
- Quando o lead dá dia e/ou hora e/ou período, o pipeline escreve **um** `agenda_state`, com a
  citação da mensagem dele e a data já resolvida. Os pontos que hoje escrevem
  `cd.visit_pending_date` / `visit_pending_hour` (`pipeline.ts:825, 833, 898, 906, 910-911`) passam
  a escrever no mesmo objeto.
- A guarda `isAmbiguousSlotText` (75-245) **continua valendo na escrita**: texto de expediente ou
  lista de opções não vira `agenda_state`.

### 3. A guarda de período passa a existir uma vez só

Com `pendingDay` e `visitAvailability` colapsados em `agenda_state.data_absoluta`, a condição
`periodWithoutDayInMessage` deixa de ser um `if` aplicado a um dos dois caminhos e passa a ser a
**única** porta de entrada do dia herdado:

```
lead disse período NESTE turno e não disse dia  ⇒  o dia herdado NÃO entra. Pergunte o dia.
```

Um lugar, uma guarda, sem como aplicar pela metade. **Este é o conserto do Defeito 2 — e ele é
subtração de caminho, não adição.**

### 4. TTL

`TTL_AGENDA_STATE_HORAS = 48`, constante nomeada e comentada, alinhada ao critério que o
@architect usou no purge de 07/08 (`updated_at` anterior a 48 h). Estado expirado **é apagado na
escrita**, não só ignorado na leitura — senão volta a valer se o TTL mudar um dia.

### 5. Legado — e a segunda esteira que precisa ser desligada junto

As quatro chaves antigas **deixam de ser escritas e deixam de ser lidas como fonte de dia/hora**, e
são **removidas** do `collected_data` no primeiro turno da conversa. Não há migração de dado: os
**56 registros** residuais (medidos pelo @po em 07/08, **pós-purge** — 9 com `visit_pending_date`,
**35 com dia que anda**, e entre 1 e 6 armados conforme a régua) são exatamente a classe que não
deve ser preservada. **Migrar esse resíduo seria carimbar âncora em mentira.**

> ⚠️ **Apagar não basta enquanto houver quem reponha.** O cron `enrich-leads` reescreve
> `visit_availability` **48×/dia** (Defeito 4). Por isso o desligamento dele é **pré-condição** do
> decaimento que a AC8 mede — não um extra:
>
> | onde | mudança | natureza |
> |---|---|---|
> | `packages/ai/src/flows/haiku-enrichment.ts:31` | **remover** a linha `- visit_availability: string (dia/horario mencionado)` do `ENRICHMENT_PROMPT` | subtração |
> | `packages/web/src/app/api/cron/enrich-leads/route.ts:150` | **filtrar** as quatro chaves de agenda do `mergedCollectedData` (defesa em profundidade: o Haiku pode devolver a chave por hábito de contexto mesmo sem ela no prompt) | subtração |
>
> **Os dois, não um.** Remover só do prompt deixa o merge aberto para um modelo que alucine a chave;
> filtrar só no merge deixa o prompt pedindo um dado que será jogado fora (custo de token e ruído
> de extração). O filtro do merge é o que torna a **AC8-b** verificável.
>
> **O que NÃO muda:** todos os outros campos que o `enrich-leads` extrai e escreve (`bedrooms`,
> `profissao`, `renda_familiar`, `filhos`, …) **continuam exatamente como estão**. O escopo é a
> chave de agenda, e só ela.

---

## Acceptance Criteria

> Toda AC diz **como se verifica**, e toda AC de regressão exige o **vermelho colado**.
>
> ### 📚 Convenção de citação — as "condições do @architect" vêm de DOIS documentos
>
> A v0.1 citava *"condição nº N do @architect"* em três AC sem dizer **qual documento**, e os
> números colidem entre eles. **Toda citação agora traz a data do documento no prefixo:**
>
> | prefixo | documento |
> |---|---|
> | `[@architect 05/08 §7.N]` | `docs/architecture/2026-08-05-validacao-epic-87.md`, §7 item N |
> | `[@architect 07/08 §9.N]` | `docs/architecture/2026-08-07-debate-tool-use-nicole.md`, §9 item N |

**AC1 — [@architect 05/08 §7.3] A âncora existe, e o teste que hoje é vermelho fica verde.**
`resolveVisitSlotParts(availability_de_27/07, now = 12/08)` **não pode** devolver 15/08.
*Verifica-se:* existe teste que, com a string real do estado da Sandra
(*"…durante a semana ou no sábado de manhã?"*, ancorada em 2026-07-27) e `now = 2026-08-12`,
afirma que o dia resolvido **não é 2026-08-15** — é `null` (a fala é da Nicole, não vira estado) ou
a data ancorada. **Rodar contra o `HEAD` de hoje: falha, devolvendo 15/08.** O vermelho e o verde
vão colados no Dev Agent Record. *"Este é o teste que eu quero ver vermelho antes e verde depois;
se ele não existir, a story não fecha."* — @architect, `2026-08-05-validacao-epic-87.md` §7 item 3.
> **A Sandra continua sendo a fixture DESTA AC** (o dia que anda é o defeito dela). Mas atenção ao
> que o @po mediu: o seed dela **não arma o INSERT** — `isAmbiguousSlotText("sábado, dia 8, de 8h às
> 12h")` é **`true`** (faixa de horário) e a guarda da **75-245** bloqueia a hora. Isso é
> **informação valiosa, não falha**: prova que a 75-245 funciona onde alcança. Por isso a fixture da
> **AC4** (que precisa de um seed **armado**) foi trocada — ver C2 na AC4.

**AC2 — [@architect 07/08 §9.5] A fala da Nicole não vira estado.**
*Verifica-se:* teste que reencena o **Nilson** — cujo `visit_availability` em produção é,
literalmente, a frase dela — passando essa string como `assistantMessage` por um turno completo:
o `agenda_state` **não muda** e nenhuma chave de agenda é criada. **Vermelho contra o `HEAD`**
(hoje `extractCollectedData` grava a frase inteira). Cobrir também o **Maicon** (uma recusa:
*"Não posso ir no stand…"*) e a **Bianca** (a saudação, cujo "hoje" resolve para a data de leitura).

**AC3 — [@architect 07/08 §9.3 — segunda metade] `"Semana de manhã"` não devolve sábado.**
> *(A primeira metade daquela condição — `isSlotFree` fail-closed — é do **Epic 88**, não desta
> story. A numeração `3` desta AC é do documento de **07/08**, não do de 05/08 citado na AC1.)*
Com `agenda_state.data_absoluta` num sábado e a mensagem do lead sendo *"Semana de manhã"*, o dia
herdado **não** entra e o sistema **pergunta o dia**.
*Verifica-se:* teste na fixture exata da Valnira (03/08 23:57). **Vermelho contra o `HEAD`** — hoje
o `pendingDay` entra sem passar pela guarda e o pré-fetch oferece três sábados. Colar os dois.
E um segundo teste que fixa o **não-regresso da 75-268**: quando o lead **dá** o dia, o estado
continua completando a hora (esse caminho não pode morrer junto).

**AC4 — A fábrica desligada, provada de ponta a ponta no harness — com fixtures MEDIDAS HOJE.**

> ### 🔴 A fixture da v0.1 estava errada: ela mandava ver vermelho onde há verde
>
> A v0.1 usava o seed da **Sandra** (`va = "sábado, dia 8, de 8h às 12h"`, `vpd = "2026-08-08"`).
> **O @po rodou `resolveVisitSlotParts` com `message = "Oi"` contra esse seed exato:**
>
> ```
> day = 2026-08-08     time = null     → NÃO cria appointment
> ```
>
> `isAmbiguousSlotText("sábado, dia 8, de 8h às 12h")` é **`true`** (faixa "de 8h às 12h") e a guarda
> da **75-245** bloqueia a hora. E os outros três seeds da v0.1 (Célia, Adriele, Wilson) **foram
> purgados em 07/08** — não estão mais em `conversation_state`, então "reencenar os três" exigiria o
> backup, e a v0.1 não dizia isso.
>
> **Uma AC que manda ver vermelho onde há verde é a pior classe de AC:** o executor honesto trava, e
> o executor com pressa **ajusta a fixture até ficar vermelha** — inventando evidência.

*Verifica-se:* usando `createFakeSupabase` + `processMessage` (o harness da Story 75-279 —
**usar, não recriar**), com **os dois seeds abaixo, medidos em produção pelo @po em 07/08 e armados
de verdade**, e o lead mandando apenas **`"Oi"`**:

| fixture | `visit_availability` | `visit_pending_date` | `"Oi"` resolve para | por que esta |
|---|---|---|---|---|
| **Maria Oliveira** | `"Sábado, 8 de agosto, às 11h"` | `2026-08-08` | **08/08 11:00** | armado, data futura, **com** `vpd` |
| **Edicleia** | `"sexta-feira às 15h"` | `null` | **a próxima sexta ≥ `now`, às 15:00** | armado, **sem** `vpd`, e **o dia ANDA** — cobre AC1 e AC4 na mesma fixture |

> ### ⏱️ [@po 07/08] O teste PRECISA fixar o `now`, senão ele muda de resultado por calendário
>
> O @po rodou `resolveVisitSlotParts` com os dois seeds e quatro `now` diferentes:
>
> ```
> Maria Oliveira   now=07/08 → 08/08 11:00   now=09/08 → 08/08 11:00   now=15/08 → 08/08 11:00   (ESTÁVEL: tem vpd absoluto)
> Edicleia         now=07/08 → 07/08 15:00   now=09/08 → 14/08 15:00   now=15/08 → 21/08 15:00   now=01/09 → 04/09 15:00
> Sandra (AC1)     now=qualquer → 08/08, SEM HORA                       (a 75-245 bloqueia a faixa — NÃO arma)
> ```
>
> **A Edicleia anda uma semana por semana** — é o defeito, e é por isso que ela é a fixture certa.
> Mas a AC não pode esperar *"HOJE 15:00"*: isso só é verdade se o teste rodar numa **sexta-feira**.
> **O teste fixa `now = 2026-08-07T12:00:00Z` e espera `2026-08-07 15:00 BRT`**, e um segundo caso com
> `now = 2026-08-09T12:00:00Z` esperando `2026-08-14 15:00 BRT` — **é o par que prova que o dia anda**.
> Sem `now` fixo, o @dev que rodar numa terça vê `14/08`, acha que a fixture quebrou e mexe nela.

- (i) `fake.table("appointments")` continua **vazia**;
- (ii) o bloco `[SISTEMA]` injetado **não** afirma dia nem horário;
- (iii) o `collected_data` gravado sai **sem** as quatro chaves legadas.

**Vermelho contra o `HEAD`, obrigatório e colado:** com esses dois seeds, hoje o mesmo `"Oi"` resolve
dia **e** hora. É o mecanismo que o @architect mediu nos três estados armados de 07/08 (Célia com
`"Oi"`, Adriele com `"Bom dia"`, Wilson com `"Ainda estou pensando"`) — **aqueles três são
HISTÓRICO**, citados como origem do caso e **não** reencenáveis sem o backup de 07/08. Não gaste
tempo tentando: use Maria Oliveira e Edicleia.

> **Nota honesta que precisa estar na story:** os dois seeds acima **têm** `appointment` real
> correspondente. O dano deles seria **duplicata**, não fantasma. **Isso não enfraquece a AC** — o
> que a AC prova é que o mecanismo está ligado e dispara sem o lead pedir nada; a existência de
> visita real é coincidência do dia da medição, não proteção. *(Ver a nota de método no bloco de
> abertura: entre 1 e 6 estados armados conforme a régua.)*

*Esta é a AC que prova que a limpeza de 07/08 não precisa acontecer de novo.*

**AC5 — TTL, com a fronteira testada e o apagamento na escrita.**
`TTL_AGENDA_STATE_HORAS = 48`, constante única e comentada.
*Verifica-se:* teste de fronteira (47 h 59 vale; 48 h 01 não vale) **e** teste que prova que, ao
expirar, o objeto é **removido** do `collected_data` persistido — não apenas ignorado na leitura.

**AC6 — Os consumidores do formato antigo continuam funcionando. São OITO, e o 7º ESCREVE.**
A mudança de formato tem **oito** consumidores conhecidos, todos verificados no código
(1–6 pelo @sm; **7 e 8 encontrados pelo @po** em 07/08, `po-validation-87-3-87-4.md` §2.2):

| # | consumidor | arquivo:linha | tipo | o que precisa acontecer |
|---|---|---|---|---|
| 1 | gate do modo agendamento | `pipeline.ts:705-706` (`typeof … === "string"`) | leitor | passa a olhar o `agenda_state` |
| 2 | pendência como sinal de gate | `pipeline.ts:714-716` | leitor | idem |
| 3 | score de qualificação (peso **20**) | `qualification.ts:17,41-46` | leitor | o peso continua sendo somado quando há disponibilidade legítima |
| 4 | próxima etapa de qualificação | `qualification.ts:29,55-66` | leitor | não pode travar em `visit_availability` para sempre |
| 5 | resumo de handoff | `handoff.ts:138` | leitor | continua imprimindo a disponibilidade |
| 6 | tela do lead no CRM | `dashboard/leads/[id]/page.tsx:387` | leitor | continua mostrando algo legível ao humano |
| **7** | 🔴 **cron `enrich-leads` / Haiku** | `haiku-enrichment.ts:31` (prompt) → `cron/enrich-leads/route.ts:150-153` (merge) | **ESCRITOR, 48×/dia, fora do `processMessage`** | **remover a chave do prompt E filtrá-la no merge** — ver Desenho §5 e **AC8-b** |
| 8 | campo de lead na UI | `packages/shared/src/constants/lead-fields.ts:23` (`type: "text"`) | superfície de edição humana | conferir que a edição manual sobre o formato antigo não reintroduz a chave em `collected_data` (é campo de `leads`, não de `conversation_state` — conferir e **declarar por escrito** o que se decidiu) |

*Verifica-se:* (i) teste que fixa que uma disponibilidade **legítima** (dada pelo lead) mantém o
score e o `shouldHandoff` com o **mesmo veredito** de hoje — regressão de score muda gatilho de
handoff, e ninguém iria associar as duas coisas; (ii) a tela do lead não mostra `[object Object]`
(conferido em dev, com print no Dev Agent Record); (iii) o consumidor **nº 7** tem AC própria
(**AC8-b**), porque ele não é regressão a evitar — é fonte a desligar.

> ### 🔴 Por que o nº 7 é bloqueante e não pode ficar fora de escopo (@po, §2.2/C1)
>
> Três consequências diretas nas AC desta story, se ele ficar de fora:
> 1. **A tese da story** (*"fato de agenda sem citação de uma mensagem `role='user'` não pode virar
>    estado"*) **só é verdadeira depois que este caminho também for fechado.** A story desligaria
>    `pipeline.ts:1099` e deixaria a outra esteira ligada.
> 2. **A AC4 pode ficar verde com a fábrica funcionando** — o harness exercita `processMessage`, e o
>    cron não passa por ali.
> 3. **A AC8 fica inexequível.** Ela exige que `LEGADO_DESCARTADO` *"caia a zero"*. Com a chave sendo
>    reposta 48×/dia, o contador **oscila para sempre**.
>
> **Custo: uma linha removida de um prompt e um filtro num merge. É subtração** — não fere a regra de
> corte da Onda 1.
> **Atenção ao caso escondido:** `detect-appointment.ts:71` compara
> `collectedData.visit_availability === true` — comparação com **booleano** num campo que sempre
> foi string, ou seja, **sempre falsa**. **Não "consertar" isso aqui:** "consertar" **liga** um
> caminho de detecção que hoje está morto = caminho de decisão novo = proibido pela regra de corte da
> Onda 1. O @po ratificou que está corretamente fora de escopo.
> ✅ **Já registrado em `docs/backlog.md` (07/08), fora da story** — a T9 da v0.1 foi encerrada,
> porque item de backlog dentro de uma story que ainda não começou é frágil. **Ao migrar o formato,
> deixe a comparação morta como está** (ou preserve a mesma semântica de "sempre falso"): trocá-la
> por uma verdadeira muda comportamento.
> **E o `followup` cron** (`cron/followup/route.ts:692-710`) apaga `visit_availability` no reset de
> estado — precisa apagar a chave nova também, senão o reset deixa de resetar.

**AC7 — Nenhum caminho de decisão novo, e isso é testado, não afirmado.**
Para um turno legítimo — lead diz *"sábado às 10h"* nesta mensagem, sem estado anterior — o
`messageWithContext` produzido é **idêntico** ao do `HEAD`.
*Verifica-se:* teste de snapshot do bloco `[SISTEMA]` para 3 turnos-ouro (dia+hora completos ·
só o dia · dia+período), comparando com a saída do `HEAD`. Qualquer diferença de texto é achado
bloqueante: significa que a story mudou o que a Nicole ouve quando o estado estava certo.

**AC8 — A queda da mentira é medida, não presumida.**
Eventos novos em `system_events`: `NICOLE_AGENDA_STATE_LEGADO_DESCARTADO` (chave antiga encontrada
e apagada) e `NICOLE_AGENDA_STATE_EXPIRADO`.
*Verifica-se:* após o deploy, os dois eventos aparecem em produção e a contagem de
`LEGADO_DESCARTADO` **cai monotonicamente em direção a zero** conforme as conversas com resíduo vão
sendo tocadas — é o número que prova que os **56** registros medidos em 07/08 morreram sozinhos, sem
novo purge. A curva vai colada na story, com a contagem de partida remedida na T0.
> ⚠️ **Esta AC só é exequível com a AC8-b cumprida.** Enquanto o `enrich-leads` repuser a chave, o
> contador **oscila em vez de decair** — e a AC8 é justamente a que prova que a fonte morreu.
> Achado do @po (§2.2/C1).
> #### 📏 [@po 07/08] Precisão do "48×/dia" — a tese fica de pé, a curva esperada muda
> O cron **roda** 48×/dia, mas só enriquece conversa com `is_ai_active = true` **e**
> `last_message_at > last_enriched_at` (`route.ts:47-51`). Medido em produção: **1 conversa
> enriquecida nas últimas 24 h**. Ou seja, **a chave não é reposta 48× por estado** — ela é reposta
> **uma vez por lote de mensagens novas**, nas conversas **ativas**.
> **A evidência que sustenta a AC8-b é outra, e é mais forte:** dos **56** estados com resíduo,
> **39 (70 %) têm o cron como ÚLTIMO ESCRITOR** — `conversation_state.updated_at` a menos de 1 s de
> `conversations.last_enriched_at`. Não foi turno de conversa que escreveu aquilo: foi o Haiku.
> **Consequência para o *como se verifica* desta AC:** a curva **não** cai monotonicamente em bloco —
> ela decai nos estados **dormentes** e **oscila** exatamente nos **ativos**, que são os que importam.
> A leitura correta da AC8 é: *nenhum estado tocado DEPOIS do deploy volta a ter chave legada*
> (que é literalmente a query da **AC8-b-(iii)**), e não *"o contador global chega a zero"*.

**AC8-b — 🆕 A SEGUNDA esteira desligada, provada no cron e não só no pipeline.**
O cron `enrich-leads` para de escrever `visit_availability` em `collected_data`, pelas **duas**
vias (Desenho §5): a chave sai do `ENRICHMENT_PROMPT` (`haiku-enrichment.ts:31`) **e** é filtrada no
merge (`cron/enrich-leads/route.ts:150`).
*Verifica-se:*
- (i) **teste do filtro do merge com o vermelho colado:** dado um `enrichment.extracted_data`
  contendo `visit_availability` (simulando um Haiku que devolve a chave por hábito de contexto),
  o `collected_data` persistido sai **sem** ela. Removendo o filtro, o teste fica **vermelho** —
  é o que prova que a defesa em profundidade existe e não é comentário;
- (ii) **os demais campos não regridem:** o mesmo teste afirma que `bedrooms`, `profissao`,
  `renda_familiar` e `filhos` do `extracted_data` **continuam** sendo mergeados. O escopo é a chave
  de agenda e só ela;
- (iii) **prova em produção:** 24 h após o deploy, **nenhum** `conversation_state` cujo
  `conversations.last_enriched_at` seja **posterior** ao deploy tem `visit_availability` no
  `collected_data`. Query colada no Dev Agent Record. *É esta consulta que distingue "a chave sumiu
  porque a conversa morreu" de "a chave sumiu porque o cron parou de escrever".*

**AC9 — Sem regressão.**
*Verifica-se:* `npx vitest run` verde — incluindo `visit-slot.test.ts` (que tem casos das Stories
75-162, 75-245, 75-268 e 75-279), `pipeline.test.ts`, `pipeline-scheduling.test.ts` e
`pipeline-broker-guard.test.ts` — e `npm run type-check` sem erro novo. Testes existentes que
mudarem de forma precisam de **justificativa escrita por teste**: um teste da 75-245/75-268 que
some é uma guarda que some.
> **Não há AC de lint para `packages/ai`:** o pacote não tem eslint configurado (o config vive em
> `packages/web`).

**AC10 — Validação em produção com dono e janela (D7).**
*Verifica-se:* 24 h após o deploy, com responsável nomeado (Marcos ou Thielly): (i) uma conversa
real em que o lead pede visita e o agendamento acontece fim a fim; (ii) `M4` (estado fantasma) e
`M1` (confirmação sem agenda) medidos pela rotina da **Story 87-3** na janela; (iii) nenhum
`appointment` criado por conversa em que o lead não pediu nada. Resultado com horário e telefone de
teste colado na story.

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/flows/visit-slot.ts` | 355-382 | `resolveVisitSlotParts` — o coração desta story |
| ↳ | 366 | `let day = dayInMessage ?? pendingDay` — o `pendingDay` entrando **sem guarda** |
| ↳ | 372 | `periodWithoutDayInMessage` — a guarda da 75-268 |
| ↳ | 376-380 | o `if` onde ela é aplicada **só** ao `visitAvailability` |
| `packages/ai/src/flows/visit-slot.ts` | 251-284 | `isAmbiguousSlotText` — continua valendo na escrita |
| `packages/ai/src/flows/qualification.ts` | 268-302 | onde `visit_availability` é escrito a partir de **qualquer** texto |
| `packages/ai/src/flows/qualification.ts` | 17, 29 | peso 20 e passo de qualificação |
| `packages/ai/src/chat/pipeline.ts` | 1087 / **1099** | extração da fala do **lead** / da **Nicole** ← a fonte do veneno |
| `packages/ai/src/chat/pipeline.ts` | 705-706, 714-716 | `hasVisitAvailability` e `hasPendingSlot` — os gates |
| `packages/ai/src/chat/pipeline.ts` | 842-847 | `isVisitSchedulingMode` — o gate composto |
| `packages/ai/src/chat/pipeline.ts` | 854-870 | leitura de `pendingDay`/`pendingTime`/`visitAvailability` |
| `packages/ai/src/chat/pipeline.ts` | 825, 833, 878-880, 898, 906, 910-911 | **todos** os pontos que escrevem/apagam pendência |
| `packages/ai/src/chat/pipeline.ts` | 1422-1427 | `updateConversationState` — onde `collected_data` é persistido |
| `packages/ai/src/chat/pipeline.ts` | 47-63 | `hasConfirmedDay` — espera **string**; conferir consumidores |
| `packages/ai/src/chat/__fixtures__/fake-supabase.ts` | 1-223 | o harness da 75-279 — **usar, não recriar** |
| `packages/ai/src/chat/pipeline-scheduling.test.ts` | 1-170 | o modelo de teste fim a fim, com `fakeAnthropic` |
| `packages/web/src/app/api/cron/followup/route.ts` | 692-710 | reset de estado que apaga `visit_availability` |

### Armadilhas

1. **Não misturar com o W1-1 (histórico = cauda).** Ele é o **deploy 3** e vai por último de
   propósito: ver a cauda deixa `isVisitSchedulingMode` **mais** propenso a ligar (via
   `lastAssistantMsg`, `pipeline.ts:709-711`), e subir isso antes desta story **piora** o sintoma da
   Sandra durante a própria janela de observação (O-2 do @architect). Não antecipar.
2. **Não mexer no `collected_data` despejado como JSON cru no system prompt**
   (`pipeline.ts:1693-1695`, `Data collected so far: …`). É o **W1-6**, story própria, e depende
   desta. Enquanto essa linha existir, o fato falso chega ao modelo **duas vezes** — mas juntar os
   dois num deploy só quebra a disciplina de um fix de substrato por deploy.
3. **A guarda `isAmbiguousSlotText` (75-245) não sai.** Ela continua sendo o filtro de escrita. Esta
   story cobre o que ela **não** cobre: o valor já derivado numa sessão anterior.
4. **`origem` só admite `'lead'` nesta story.** Escrever `origem: 'sistema'` ou `'nicole'` é o item
   **W1-2c** — ver "Fronteira" abaixo. Deixar o tipo pronto é barato; escrever nele aqui é escopo
   alheio.
5. **Sem migration.** `collected_data` é `jsonb`; o formato novo convive com o antigo sem DDL.
   Se, ainda assim, alguma coisa exigir migration, conferir o maior prefixo local **no momento de
   criar** (hoje **215**) e aplicar por Management API — `supabase db push` é **proibido** neste
   projeto (R-G do epic).
6. **O resíduo é de 56 registros, não ~22 — e o número envelhece em HORAS.** A v0.1 dizia
   *"~22 registros restantes… o dado está limpo"*. O @po remediu **8 horas depois do purge**:
   **56 estados**, **9** com `visit_pending_date`, **35 com dia que anda**, **0** com
   `visit_pending_hour`, e entre **1 e 6 armados** conforme a régua (ver a nota de método no bloco de
   abertura). **Remedir de novo na T0** e colar as duas réguas. A lição desta casa é que número
   herdado de documento envelhece — e aqui ele envelhece por hora, não por semana.
7. **🆕 O `enrich-leads` roda a cada 30 min e não passa pelo `processMessage`.** Qualquer teste que
   exercite só o pipeline **não** vê essa esteira. A prova do desligamento é a query da **AC8-b-iii**
   (filtrando por `conversations.last_enriched_at > deploy`), não o harness.
8. **🆕 O `evaluateSlot` mascara parte do resíduo.** Um estado pode resolver dia+hora no
   `resolveVisitSlotParts` e **não** disparar o INSERT porque o `evaluateSlot` barra (fora do horário
   comercial, slot ocupado…). **Isso não é proteção** — é um gate que pode mudar. Ao medir, rode as
   **duas** réguas e publique as duas (nota de método no bloco de abertura).

### Fronteira com o item W1-2c — ✅ ARBITRADO PELO @po EM 07/08: divisão APROVADA

O epic separa `W1-2b` (o estado para de transcrever a **Nicole** onde deveria transcrever o **lead**)
de `W1-2c` (o estado passa a registrar o que o **sistema ofereceu** e o que a **Nicole afirmou**), e
os descreve corretamente como *"o mesmo defeito com o sinal invertido"*. Ao redigir a v0.1, o @sm
encontrou que o `W1-2c` são duas metades com naturezas diferentes:

| metade | o que faz | natureza | **destino (arbitrado)** |
|---|---|---|---|
| **escrita** — gravar `ofertas_do_sistema` e `afirmado_pela_nicole` | escreve dois campos que **ninguém lê** | **subtração de cegueira.** Zero mudança no que a Nicole fala | ✅ **`W1-2c`, Onda 1** |
| **leitura** — o `"Ok"` do lead resolver contra `ofertas_do_sistema` | o sistema passa a **decidir** um slot a partir de um aceite implícito | **caminho de decisão novo** | ✅ **item novo `W3-2e`, Onda 3**, atrás do validador `W3-1` |

> ## ✅ Decisão do @po (`po-validation-87-3-87-4.md` §3.2): **divisão aprovada.**

**E a premissa da v0.1 estava errada num ponto — registrado aqui porque a correção importa:**

> 🔧 **NÃO havia contradição a arbitrar.** A v0.1 desta story afirmava que *"o `W1-2c`, como está
> escrito hoje, contradiz a regra de corte da Onda 1"*, porque a **condição nº 4 do @architect**
> exige a metade de leitura. **O @po desmontou a premissa: a condição nº 4 nunca atribuiu onda.**
> O texto é *"o estado registrar oferta e afirmação com data absoluta, com teste em que o lead
> responde 'Ok' a uma oferta e o slot resolve sem chamar modelo nenhum"* — é condição de aceite **do
> epic inteiro**, não da Onda 1. A atribuição de onda é do **epic**, que a fez por omissão ao tratar
> o `W1-2c` como um item só. **O que o @sm achou foi uma lacuna, não um conflito** — e a distinção
> importa: nada do @architect está sendo revogado.

**Fundamento adicional do @po, que nenhum dos dois tinha trazido:** ligar a metade de leitura **hoje**
seria alimentá-la com um sinal de **~79% de precisão**. `afirmado_pela_nicole` sai da
`detectAffirmedSlot`, e **5 dos 30 disparos em 60 dias são oferta ou pergunta**, não afirmação
(Sueli 03/08, Adriele 29/06, Célia 28/06, Sandra 05/08, Ailton 31/07). Seria o `"Ok"` do lead
resolvendo contra um horário que a Nicole **nunca afirmou** em ~1 de cada 5 casos. E o próprio
@architect já havia escrito o pré-requisito — a **condição nº 7**, a guarda de interrogação, que mora
no **Epic 88**. *A leitura já tinha um bloqueio, escrito pelo autor da condição nº 4; ninguém tinha
ligado as duas coisas.*

#### 🔬 Refinamento do @po que esta story incorpora (§3.3) — as duas metades de escrita não têm a mesma confiança

| campo | origem | confiança | uso permitido |
|---|---|---|---|
| **`ofertas_do_sistema`** | `authorizedSlotUtc` / `freeSlotsInPeriod` — **o sistema calculou** | **Alta** — é o mesmo valor determinístico que hoje morre no fim do turno | `W1-2c` escreve; **é este que o `W3-2e` LÊ** |
| **`afirmado_pela_nicole`** | `detectAffirmedSlot` — **parseado da prosa dela** | **~79%** | `W1-2c` escreve como **observabilidade write-only**, rotulado não-confiável. **NUNCA** é insumo de decisão até a guarda de interrogação (Epic 88, condição nº 7) subir |

Isto está alinhado com a **letra** da condição nº 4: *"o lead responde 'Ok' **a uma oferta**"* — e não
"a uma afirmação". **Já incorporado ao comentário do `AgendaState` (Desenho §1), que é o artefato que
o executor do `W1-2c` vai ler.** A story do `W3-2e` deve dizer, com todas as letras, que resolve
contra `ofertas_do_sistema` e **nunca** contra `afirmado_pela_nicole`.

#### 🔧 Correção da minha própria nota: **o Epic 88 NÃO atrasa** — acertei a direção, errei a magnitude

A v0.1 avisava que empurrar a leitura para a Onda 3 *"atrasa o Epic 88, porque o gatilho turn-local
dele depende dessa metade"*. **O @po foi ao Epic 88 conferir. Ele depende da metade de ESCRITA:**

> `epic-88` §4.1: *"o gatilho passa a ser 'expressão temporal na mensagem do lead' **OU** 'o turno
> anterior registrou oferta'"*
> `epic-88` F-9 / §12: *"Sem ele o gatilho turn-local é cego nos turnos 'Ok'"*

O que o gatilho precisa saber é que **existe uma oferta viva** — basta `ofertas_do_sistema` estar
persistido, e isso fica na **Onda 1**. **Quem resolve o slot depois é a tool**, que é literalmente a
fronteira do Epic 88 (*"o determinismo mantém a LEITURA, a tool assume a ESCRITA"*). A resolução
determinística do `"Ok"` seria, no mundo do Epic 88, **redundante com a tool**.

> ⚠️ **Atualização de 07/08 (Epic 87 v0.4 · Epic 88 v0.3):** o argumento acima foi escrito quando
> ainda existia um **gate de existência** (*"lastro ≥ 90% → a tool não se justifica"*). **Esse gate
> foi revogado** — o Epic 88 acontece, e o lastro passou a definir **quando, com que escopo e
> quantas tools na v1** (`sequenciamento_e_dimensionamento`). **A conclusão não muda, e fica até
> mais forte:** o `W3-2e` não é seguro contra o Epic 88 não subir; ele é o **caminho determinístico
> para os turnos que a v1 da tool não cobrir**. Enquanto o escopo da v1 não estiver dimensionado, o
> lugar dele continua sendo a Onda 3, atrás do validador `W3-1` — agora por uma razão a mais: **não
> se decide o que o determinístico precisa cobrir antes de saber o que a tool vai cobrir.**

> ### 📌 AÇÃO PENDENTE PARA O @pm — o Epic 88 precisa de uma edição, e ela NÃO é desta story
>
> **Não editei o Epic 88** (não é artefato do @sm, e a mudança é de escopo de epic). **Registro a
> necessidade, que é a correção `A5` do @po:**
>
> Hoje o `depends_on` do Epic 88 (**frontmatter, linha 26**), a **§4.1**, o **F-9** e a tabela da
> **§12** dizem *"Epic 87 · W1-2c"*. Precisam passar a dizer
> **"Epic 87 · W1-2c (metade de ESCRITA — `ofertas_do_sistema`)"**, com a frase explícita
> **"o `88-7` NÃO depende do `W3-2e`"**.
>
> **Por que é obrigatório e não cosmético:** sem essa edição, mover a leitura para a Onda 3 vai ser
> lido como bloqueio do Epic 88 inteiro — e alguém vai "restaurar" a leitura para a Onda 1 citando
> urgência, reintroduzindo exatamente o caminho de decisão que a arbitragem acabou de barrar.
>
> **Demais edições de epic a cargo do @pm (`A1`–`A4` do @po):** reescrever o `W1-2c` como só escrita;
> criar o `W3-2e`; a nota de que a condição nº 4 é atendida em duas ondas; e a coluna "Risco" passar
> a declarar **dois eixos** (regressão / comportamento novo) nos itens que adicionam caminho de
> decisão — porque o "Baixo" do roadmap está **certo** no eixo de regressão e **incompleto** no eixo
> de comportamento novo. Aplica-se também ao `W3-2b` e ao `W3-3`.

**Mitigação do custo de separar, já embutida nesta story:** o `AgendaState` **declara** os dois
campos do `W1-2c` desde já (reservados, sem leitor e sem escritor, **agora com a nota de confiança
de cada um**). Assim o executor do `W1-2c` **não reabre o formato** — ele passa a escrever em campos
que já existem, com a regra de uso ao lado.

---

## Tarefas

- [ ] **T0-a** — 🔴 🆕 **[@po] Fechar o `W1-3a`, que é `Depende de` DECLARADO deste item e nunca foi
      executado.** O Epic 87 §7/Onda 1 diz, com todas as letras: `W1-2b` **Depende de: W1-2a + W1-3a**.
      O `W1-2a` (purge do estado) foi executado pelo Gabriel em 07/08 e está registrado; o **`W1-3a`
      (purge dos RESUMOS que afirmam agendamento inexistente) não tem registro de execução em lugar
      nenhum**, e nem esta story nem o epic o mencionam como pendente.
      **O @po mediu o tamanho real, e ele é pequeno:** `leads.ai_summary` afirma agendamento em
      **8 leads**; **7 têm `appointment` de verdade** (o resumo está certo) e **1 não tem — a
      Marilda, com 0 appointments**. Ou seja: **uma linha.**
      **Ação:** ou executar (uma linha, @data-engineer, sem deploy) ou registrar por escrito no epic
      que o `W1-3a` foi **dispensado** com o número medido. **As duas servem; ficar em silêncio não** —
      um `Depende de` do roadmap que ninguém fechou e ninguém dispensou é como a story vai a produção
      com um bloqueador aberto que só aparece no retrospecto.
      > Observação de método, para a mesma passada: os resumos legítimos usam **data relativa**
      > (*"visita agendada para amanhã (sexta-feira às 15h)"*, *"no dia seguiente (quarta) às 10h30"*)
      > — é o mesmo defeito de âncora desta story, em prosa. **O conserto disso é o `W1-3b`, não este
      > item.** Não ampliar o escopo aqui.
- [ ] **T0** — 🆕 **Remedir o resíduo antes de começar** (ele envelhece em horas): contagem de
      `conversation_state` com resíduo, com `visit_pending_date`, com dia que anda, e **armados pelas
      DUAS réguas** (`resolveVisitSlotParts` sozinho × `+ evaluateSlot`). Os dois números colados,
      com o método de cada um. Baseline da AC8.
- [ ] **T1** — `flows/agenda-state.ts`: tipo `AgendaState`, `TTL_AGENDA_STATE_HORAS`, helpers de
      leitura/escrita/expiração. Puro e testado isolado. **Os campos reservados do `W1-2c` entram com
      a nota de confiança de cada um** (`ofertas_do_sistema` alta / `afirmado_pela_nicole` ~79%,
      write-only) — Desenho §1.
- [ ] **T2** — `resolveVisitSlotParts` passa a receber `AgendaState` e **nunca reancora**; a guarda
      de período vira a única porta do dia herdado (AC1, AC3).
- [ ] **T3** — `extractCollectedData` deixa de escrever agenda a partir da fala da Nicole (AC2).
- [ ] **T4** — Pontos de escrita do pipeline migrados para o objeto único; legado apagado na
      escrita (AC4, AC5).
- [ ] **T5** — Consumidores **1 a 6**: gates, score, passo, handoff, tela do lead, cron de followup
      (AC6). Conferir e **declarar por escrito** o caso do consumidor **8**
      (`shared/constants/lead-fields.ts:23`).
- [ ] **T5-b** — 🆕 **Consumidor nº 7, o ESCRITOR:** remover `visit_availability` do
      `ENRICHMENT_PROMPT` (`haiku-enrichment.ts:31`) **e** filtrar as chaves de agenda do
      `mergedCollectedData` (`cron/enrich-leads/route.ts:150`). Os demais campos do enriquecimento
      **intocados** (AC8-b).
- [ ] **T6** — Suíte: os vermelhos das AC1/AC2/AC3/AC4/AC8-b colados; snapshots dos turnos-ouro
      (AC7). **Fixtures da AC4 = Maria Oliveira e Edicleia** (as medidas armadas), **não** Sandra.
- [ ] **T7** — Eventos de observabilidade (AC8).
- [ ] **T8** — Deploy **sozinho**, 24 h de observação, validação da AC10 e da **AC8-b-(iii)** com
      responsável nomeado.
- [ ] ~~**T9** — Abrir em `docs/backlog.md` o achado do `detect-appointment.ts:71`~~
      ✅ **FEITO em 07/08, fora da story** (@sm, a pedido do @po/C5). Um item de backlog dentro de
      uma story que ainda não começou é frágil — o achado já está registrado em `docs/backlog.md`,
      junto com o do `role='assistant'` em fala humana. **A story não precisa mais abrir nada.**

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| **1** | Mudança de formato quebra consumidor silencioso que ninguém mapeou | **Alta** | AC6 enumera os 6 conhecidos; `type-check` pega os tipados; `grep` por `visit_availability`/`visit_pending` em **todo** o repo antes de fechar |
| **2** | Score de qualificação cai e muda o gatilho de handoff sem ninguém associar as duas coisas | **Alta** | AC6-(i) fixa o veredito de `shouldHandoff` para disponibilidade legítima |
| **3** | Apagar o legado apaga negociação legítima em andamento (R-B) | Média | O legado só some quando a conversa é tocada; quem tem visita real tem `appointments`, que esta story não toca. Backup das 59 conversas já existe (07/08) |
| **4** | Estado deixar de ligar o modo agendamento em caso legítimo → a Nicole regride para "não entende visita" | **Alta** | AC7 (snapshot dos turnos-ouro) + AC10-(i) com conversa real ponta a ponta |
| **5** | TTL de 48 h cortar lead que responde na segunda o que pediu na sexta | Média | Fronteira testada (AC5); 48 h é o critério que o @architect já usou no purge. Se a validação mostrar corte indevido, ajustar a constante — **não** remover o TTL |
| **6** | O purge de 07/08 dar a sensação de "resolvido" e esta story ser despriorizada | **Alta** | O bloco de abertura desta story existe para isso — e agora com a evidência medida: **a reposição é de HORAS, não de semanas.** O @po remediu **8 h depois do purge** e achou **56 estados** (não ~22), **35 com dia que anda** e estado **armado de novo**. A AC8 mede o `LEGADO_DESCARTADO` caindo, que é a prova de que a fonte morreu |
| **8** | 🆕 **A story desligar `pipeline.ts:1099` e deixar a SEGUNDA esteira ligada** — o cron `enrich-leads` repõe `visit_availability` 48×/dia, a AC4 fica verde com a fábrica funcionando e a AC8 oscila para sempre em vez de decair | **Alta** | Consumidor **nº 7** no escopo (AC6) + **AC8-b** com as duas vias (prompt **e** merge) e a prova em produção por `last_enriched_at > deploy` |
| **9** | 🆕 **Executor com pressa "ajustar a fixture até ficar vermelha"** — a fixture da AC4 na v0.1 (Sandra) é **verde** contra o `HEAD`, porque a 75-245 bloqueia a faixa "de 8h às 12h" | **Alta** | Fixtures trocadas por **Maria Oliveira** e **Edicleia**, medidas armadas em 07/08, com o comportamento esperado escrito. A Sandra fica na AC1, com a nota de que **não** arma o INSERT — e isso é informação, não falha |
| **7** | Subir junto com o W1-1 (cauda) e não saber qual mudou o comportamento | **Alta** | Deploy sozinho, 24 h entre fixes — regra do epic, item 4 da §6 |

---

## Critério de rollback (D7) — escrito ANTES do deploy, como o epic exige

**Reversão:** `git revert` do PR. Nenhuma migration, nenhum dado a restaurar; conversas tocadas
depois do deploy terão perdido as chaves legadas, e isso é **desejado** — o comportamento pré-deploy
volta com o estado limpo, que é estritamente melhor que o estado envenenado.

**Gatilhos de reversão, na janela de 24 h:**
- qualquer `appointment` criado em conversa em que o lead **não** pediu visita;
- aumento em **M1** (confirmação sem agenda) ou **M4** (estado fantasma), medidos pela rotina da
  **Story 87-3**;
- queda na taxa de resposta do lead ao turno seguinte, ou aumento de `HANDOFF_TRIGGERED` por
  conversa (o proxy de volume que o @architect exigiu — a `PM8` do Epic 88);
- qualquer conversa em que a Nicole deixe de entender um pedido de visita legítimo.

**Responsável nomeado:** a definir (Marcos ou Thielly), janela de 24 h a partir do deploy.
Sem responsável nomeado, **o deploy não sai** — a story fica `InReview` para sempre e o epic não
fecha (D7).

## Definition of Done

- [ ] AC1 a AC10 **e a AC8-b** verificadas, com os **vermelhos** e os verdes colados no Dev Agent
      Record
- [ ] `grep -rn "visit_availability\|visit_pending" packages/` não retorna nenhum **leitor** de
      dia/hora fora do módulo de compatibilidade **nem nenhum ESCRITOR** (o `enrich-leads` é o que a
      v0.1 não tinha visto)
- [ ] Resíduo remedido na T0 pelas **duas** réguas, com o método de cada uma escrito
- [ ] Deploy isolado, 24 h de observação, critério de rollback exercido ou dispensado por escrito
- [ ] ✅ Achado do `detect-appointment.ts:71` registrado em `docs/backlog.md` — **já feito em 07/08**
- [ ] `stories_planned` do Epic 87 contém `W1-2b → 87-4`
- [ ] **@pm avisado da edição `A5` no Epic 88** (repontar o `depends_on` do `88-7` para *"W1-2c —
      metade de ESCRITA"*), sem a qual a arbitragem do `W1-2c` será lida como bloqueio do Epic 88

---

## Referências (seção específica, não documento inteiro)

- 🔴 **`docs/qa/po-validation-87-3-87-4-87-5.md` — a revalidação do @po (07/08) que promoveu esta story a `Ready`.**
  Ler **§2.2** (o `W1-3a` nunca executado — 1 lead), **§2.3-A** (as fixtures da AC4 e o `now` fixo) e
  **§2.3-B** (o que o "48×/dia" realmente significa para a curva da AC8).
- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **§1/CR-4** (o estado que
  ressuscita entre sessões); **§7/Onda 1, item W1-2b** (âncora, TTL, procedência, e o defeito do
  `pendingDay`); **§6 item 2** (a regra de corte da Onda 1); **§5/R-B, R-H, R-I**
- `docs/architecture/2026-08-05-validacao-epic-87.md` — **§1.2 Problema D** (a âncora temporal, com
  a execução que prova o 08/08 → 15/08); **§3/O-2 e O-7**; **§6.1** (a cadeia
  `isAmbiguousSlotText → extractCollectedData → resolveVisitSlotParts`); **§7 condições 2, 3 e 5**
- `docs/architecture/2026-08-07-debate-tool-use-nicole.md` — **§2.5** (o estado lê o interlocutor
  errado nas duas direções, e o `collected_data` como JSON cru); **§2.6** (a guarda pela metade da
  75-268, com o código citado); **§2.7** (os 59 estados, os 46 com data que anda, os 3 armados);
  **§7.2** (a estrutura-alvo do `agenda_state`); **§9 condições 3, 4 e 5**
- 🔴 **`docs/qa/po-validation-87-3-87-4.md` — a validação que produziu esta v0.2. Ler §2.2 (o 7º
  consumidor, o cron `enrich-leads`), §2.3 (as fixtures da AC4 medidas contra o `HEAD`), §2.4 (os
  56 estados) e §3 inteira (a arbitragem do `W1-2c`, o refinamento das duas confianças e a edição
  `A5` no Epic 88).**
- `docs/qa/po-validation-epic-88.md` — **§1** (a Sandra como única da classe "contexto envenenado");
  **§4** (a Valnira e os três sábados)
- Stories **75-245** (`isAmbiguousSlotText`), **75-268** (a guarda de período aplicada pela metade)
  e **75-279** (o harness `fake-supabase.ts` + `pipeline-scheduling.test.ts`)

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
| 2026-08-07 | **0.4** | **Revalidação @po — ✅ GO (9/10). `Draft → Ready`.** C1–C4 conferidas **com evidência de arquivo e de banco**, não pelo Change Log, e as quatro estão aplicadas. **C1 confirmada e REFORÇADA:** dos **56** estados com resíduo, **39 (70 %) têm o cron `enrich-leads` como ÚLTIMO ESCRITOR** (`conversation_state.updated_at` a < 1 s de `conversations.last_enriched_at`) — evidência direta, e mais forte do que a que a story trazia, de que a segunda esteira é quem repõe. **C2 confirmada rodando as três fixtures contra o `HEAD`:** Maria Oliveira **arma** e é estável (tem `vpd` absoluto), Edicleia **arma e o dia anda** (07/08 → 14/08 → 21/08 → 04/09), Sandra resolve o dia e **não** a hora (a 75-245 bloqueia a faixa) — exatamente como a v0.3 descreve. **C3 confirmada hoje:** 56 estados / 9 com `vpd` / 0 com `vph`, sem drift. **C4** aplicada. **Três correções minhas, medidas:** **(1) 🔴 `W1-3a` é `Depende de` DECLARADO deste item no Epic 87 e não tem registro de execução** — o `W1-2a` foi executado em 07/08 e ficou registrado, o `W1-3a` (purge dos resumos que afirmam agendamento inexistente) não. Medi o tamanho: **8 leads com `ai_summary` afirmando agendamento, 7 com `appointment` real, 1 sem (Marilda)** — é **uma linha**. Nova **T0-a**: executar ou dispensar por escrito no epic; silêncio não serve. **(2)** As fixtures da AC4 **mudam de resultado por calendário** — a Edicleia resolve *"hoje 15:00"* só se o teste rodar numa sexta. AC4 passa a **fixar `now`** (`2026-08-07T12:00:00Z` → 07/08 15:00 **e** `2026-08-09T12:00:00Z` → 14/08 15:00, o par que prova que o dia anda). **(3)** O *"48×/dia"* é a cadência do cron, não a taxa de reescrita por estado: ele só toca conversa com `is_ai_active` e `last_message_at > last_enriched_at` (**1 conversa enriquecida nas últimas 24 h**, medido). A tese da AC8-b fica de pé; o que muda é a **curva esperada da AC8** — decai nos estados dormentes e **oscila nos ativos**, então a leitura correta é a query da AC8-b-(iii) (*"nada tocado depois do deploy volta a ter a chave"*), não *"o contador global chega a zero"*. | @po (Pax) |
| 2026-08-07 | **0.3** | **Gate de existência REVOGADO — citação ajustada** (Epic 87 v0.4 · Epic 88 v0.3). O único ponto desta story que dependia do gate era o fecho do argumento do `W1-2c` (*"o `W3-2e` só faz falta se o Epic 88 não subir, lastro ≥ 90%"*). Com o gate revogado, o Epic 88 **acontece**, e o lastro passa a definir **quando, com que escopo e quantas tools na v1**. **A conclusão da arbitragem não muda e fica mais forte:** o `W3-2e` não é seguro contra o Epic 88 não subir — é o **caminho determinístico para os turnos que a v1 da tool não cobrir** — e o lugar dele continua sendo a Onda 3 por uma razão a mais: **não se decide o que o determinístico precisa cobrir antes de saber o que a tool vai cobrir.** Nenhuma AC alterada; nenhum escopo reaberto. | @sm (River) |
| 2026-08-07 | **0.2** | **Revisão contra a validação @po `docs/qa/po-validation-87-3-87-4.md` (GO condicional 7/10) — C1 a C4 aplicadas, mais os refinamentos da arbitragem do `W1-2c`.** **C1:** **7º consumidor mapeado, e ele é ESCRITOR** — o cron `enrich-leads` manda o Haiku extrair `visit_availability` e faz merge direto no `collected_data`, **48×/dia, fora do `processMessage`** (`haiku-enrichment.ts:31` → `enrich-leads/route.ts:150`). Sem desligá-lo a **AC8 é inexequível** (o contador oscila em vez de decair). Entra como **subtração** (uma linha do prompt + um filtro no merge), com **AC8-b** própria e T5-b; 8º consumidor (`shared/constants/lead-fields.ts:23`) registrado. **C2:** fixtures da **AC4 trocadas** — o seed da Sandra **não arma o INSERT** (a 75-245 bloqueia `"de 8h às 12h"` por ambiguidade: a AC mandava ver vermelho onde há verde), e Célia/Adriele/Wilson foram purgados; entram **Maria Oliveira** e **Edicleia**, medidas armadas em 07/08. A Sandra fica na **AC1**, com a nota de que a 75-245 a bloqueia — informação, não falha. **C3:** resíduo remedido — **56 estados / 9 com `vpd` / 35 com dia que anda**, no lugar de *"~22 e o dado está limpo"*; e a reposição é de **horas**, não de semanas (Risco 6). **Registradas as DUAS medições de "armados"** com o método de cada uma (@po: 6, via `resolveVisitSlotParts` com 3 `now`; @sm: 1, via `+ evaluateSlot` sobre os 56 com `"Oi"`) — a divergência é de critério, e quem executar precisa saber disso (T0 roda as duas). **C4:** citações do @architect prefixadas com a data do documento (`[@architect 05/08 §7.3]`, `[@architect 07/08 §9.5]`, `[@architect 07/08 §9.3]`). **`W1-2c`:** divisão **aprovada** pelo @po; **corrigida a premissa da v0.1** — a condição nº 4 do @architect **nunca atribuiu onda**, então não havia contradição a arbitrar, e sim uma lacuna do epic; **corrigida a minha própria nota sobre o Epic 88 — ele NÃO atrasa**, porque o `88-7` depende da metade de **ESCRITA** (`ofertas_do_sistema`), que fica na Onda 1. Incorporado o refinamento das **duas confianças** (`ofertas_do_sistema` alta e legível pela Onda 3 × `afirmado_pela_nicole` ~79%, **write-only**) direto no comentário do `AgendaState`. **Registrada a necessidade da edição `A5` no Epic 88** (repontar o `depends_on` do `88-7`) — **o Epic 88 NÃO foi editado por esta story**; é ação do @pm. Riscos 8 e 9 acrescentados; T0 e T5-b criadas; T9 encerrada (o backlog já foi aberto fora da story). | @sm (River) |
| 2026-08-07 | 0.1 | Story criada a partir do `W1-2b` do Epic 87 v0.3, da validação do @architect de 05/08 (§1.2 Problema D, §7 condições 3 e 5, O-2 e O-7) e do debate de 07/08 (§2.5, §2.6, §2.7, §7.2, §9 itens 3, 4 e 5). Três defeitos numa raiz: âncora, guarda do `pendingDay` e procedência na escrita. Acrescentados pelo @sm, contra o código de hoje: o mapa dos **seis** consumidores do formato antigo (incluindo o peso 20 do score, que muda gatilho de handoff, e a tela do lead), o achado do `detect-appointment.ts:71` (`=== true` num campo string — **não** consertar aqui, é caminho de decisão), o reset do cron de followup, a AC7 (snapshot dos turnos-ouro, que transforma "nenhum caminho de decisão novo" de promessa em teste) e a leitura de que o `W1-2c` tem duas metades de naturezas diferentes — com a metade de leitura violando a regra de corte da Onda 1. Campos do `W1-2c` **declarados** no tipo, sem leitor nem escritor, para que aquela story não reabra o formato. | @sm (River) |
