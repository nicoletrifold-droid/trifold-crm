# Nicole — Análise técnica de causa raiz e arquitetura anti-alucinação

> **Autor:** @analyst (Atlas) · **Data:** 2026-08-05
> **Entrada:** `DOSSIE-ALUCINACAO-NICOLE.md` (05/08/2026)
> **Método:** leitura integral do código em `HEAD` de `main` (commit `6e0a7086`) + consultas
> read-only ao banco de **produção** (`dsopqkqjkmhytudaaolv`) via Supabase Management API +
> pesquisa de estado da arte.
> **Regra que segui:** nenhuma afirmação sem evidência anexa. Onde inferi, escrevi "inferência".
> Onde não consegui verificar, está listado na seção 8.

---

## 0. Sumário executivo — o que mudou em relação ao dossiê

O dossiê está **majoritariamente correto**, mas erra na atribuição do incidente principal e
não enxerga a camada que produz a maior parte do dano. Três correções de fundo:

**1. A Nicole não alucinou o "sábado, dia 8". O sistema mentiu para ela.**
Reconstruí a cadeia completa da Sandra a partir dos dados de produção (seção 1.1). O bloco
`[SISTEMA]` injetado em 05/08 dizia literalmente *"O cliente indicou o dia (sábado, 8 de
agosto)"* — uma afirmação **falsa fabricada pelo próprio pipeline**, a partir de uma frase que
a **Nicole** havia escrito em 27/07. Ela repetiu o que o sistema afirmou como fato. Nenhum
guardrail que compare a resposta contra o estado do sistema pegaria isso, porque **o estado do
sistema era a mentira**. Isso muda a arquitetura da solução: proveniência tem que ser imposta
**na escrita de estado**, não só na saída.

**2. O prompt que roda em produção não é o do código.** Verificado no banco: os **5** slugs
sobrescrevíveis estão ativos em `agent_prompts`. O `visit-scheduling` de produção (3.756 chars,
atualizado 2026-08-04) **não tem** o gate de três etapas que existe no código, manda a Nicole
propor dia/horário proativamente com a frase *"durante a semana ou sábado de manhã?"* — que
aparece **literalmente nas três conversas incidentadas** — e ainda instrui a passar *"o endereço
do empreendimento"* como endereço do stand, contradizendo a RN7 dentro do mesmo prompt. Quem
corrigir `packages/ai/src/prompts/*.ts` está corrigindo código morto.

**3. Existe um terceiro escritor de memória que ninguém mapeou.** O cron
`/api/cron/enrich-leads` roda **a cada 30 minutos**, lê as **primeiras** 20 mensagens (o mesmo
bug do CR-1, duplicado), passa por Haiku e faz
`{ ...currentData, ...enrichment.extracted_data }` — ou seja, **sobrescreve incondicionalmente**
`conversation_state.collected_data` e `leads.ai_summary`. É ele quem transformou a frase
alucinada em `visit_availability: "sábado, dia 8, de 8h às 12h"`, um texto que **não existe em
nenhuma mensagem da conversa**.

Veredito curto: **o problema não é o modelo. É que o sistema tem quatro escritores concorrentes
de "verdade" sobre o lead, nenhum deles carrega proveniência, e o modelo recebe todos ao mesmo
tempo como se fossem fato.** Tools ajudam, mas não resolvem isso sozinhas — e eu explico onde
elas ajudam de verdade (seção 2) e onde a solução é outra.

---

## 1. Validação crítica do dossiê

### Placar

| # | Causa raiz do dossiê | Veredito | Observação |
|---|---|---|---|
| CR-1 | Histórico invertido (`ascending: true`) | **CONFIRMADO** — mas **não é a causa do incidente da Sandra** | Bug real, ampliado (4 decisões a jusante), duplicado em 2º arquivo |
| CR-2 | MemPalace: código vivo, banco morto | **CONFIRMADO** independentemente | `to_regclass` = `null` para as duas tabelas |
| CR-3 | `ai_summary` amplifica | **CONFIRMADO e agravado** | Há **dois** escritores de `ai_summary`, não um |
| CR-4 | Estado de agenda que ressuscita | **CONFIRMADO e generalizado** | Não é só agenda: são **8 campos** contaminados pela fala da Nicole |
| CR-5 | `detectSlotMismatch` cego e fail-open | **CONFIRMADO** | Zero eventos em 7 dias reconfirmado por leitura de código |
| CR-6 | Orlice: trocou o empreendimento sozinha | **PARCIALMENTE REFUTADO** | A troca foi motivada pela fala da lead; o erro foi a **mídia** seguir a troca |

Além disso, **10 causas novas** (N1–N10) que o dossiê não cobre. Duas delas (N1 e N3) são,
na minha avaliação, mais impactantes que CR-1.

---

### 1.1 CR-1 — Histórico invertido: confirmado, mas mal atribuído

**Confirmado no código.** `packages/ai/src/chat/pipeline.ts:1430-1448`:

```ts
.order("created_at", { ascending: true })
.limit(20)
```

`git log -L 1430,1448` mostra que a função **nasceu assim** no commit `7194d9b2`
(2026-03-31, "feat: add Nicole AI") e nunca foi tocada. Confirmado.

**Alcance medido em produção (05/08):** 282 conversas com mensagens `user`/`assistant`;
**32 passam de 20 mensagens (11,3%)**; máximo 45. Ou seja, no pior caso hoje a Nicole está
cega para **25 mensagens** — as 25 mais recentes.

**O dossiê subestima o raio de explosão.** `history` não vai só para o array `messages` da
Anthropic. Ele alimenta, no mesmo turno, **quatro decisões**:

| Consumidor | Linha | O que quebra quando `history` é o começo da conversa |
|---|---|---|
| `lastAssistantMsg` | `pipeline.ts:646` | É a "última fala da Nicole" de semanas atrás |
| `isVisitSchedulingMode` | `pipeline.ts:779-784` | Liga/desliga o modo agendamento por uma frase antiga |
| `nameExpected` (75-161) | `pipeline.ts:978` | Aceita palavra solta como nome por uma pergunta antiga |
| `contextPropertyId` | `pipeline.ts:1050-1055` | Resolve o empreendimento pelo texto antigo |
| `buildNoReintroContext` | `pipeline.ts:579` | (Este é imune: só checa se existe algum assistant) |

**REFUTAÇÃO PARCIAL — CR-1 não causou o incidente da Sandra.**
Contei as mensagens `user`/`assistant` da Sandra (lead `791182c2-…`) no momento em que ela
respondeu *"Sábado, dia 8, está anotado"* (05/08 14:55): eram **13**. A janela de 20 **não
truncou nada** — as mensagens de julho estavam legitimamente no contexto, com ou sem o bug de
ordenação. O dossiê afirma *"Ela leu julho como se fosse agora"*; o mecanismo real é outro
(seção 1.4 e N4). CR-1 continua sendo um bug grave que **precisa ser corrigido**, mas corrigi-lo
sozinho **não teria evitado nenhum dos quatro incidentes**. Isso importa para a priorização: é
P0 por prevenção, não por remediação.

**N4 (novo) — O histórico não tem tempo.** `loadConversationHistory` faz
`select("role, content")`. Não traz `created_at`. O array `messages` enviado ao modelo é uma
sequência sem nenhuma marca temporal: uma mensagem de 18/07 e uma de 05/08 são indistinguíveis
para o modelo. É por isso que *"Mais só posso até 400 mil"* (27/07) volta como
*"dentro do seu orçamento de R$ 400 mil"* (05/08) — não porque ela leu errado, mas porque
**não existe informação no prompt que diga que aquilo é velho**. Corrigir a ordenação sem
adicionar timestamps deixa o problema de pé.

---

### 1.2 CR-2 — MemPalace: confirmado por medição direta

Consulta independente em produção (05/08):

```
to_regclass('public.lead_facts')    → null
to_regclass('public.lead_memories') → null
leads com ai_summary: 217 / 1674 (13,0%)
```

Bate exatamente com o dossiê. **Confirmado.**

**Agravante que o dossiê não quantifica: isso custa dinheiro todo turno.**
`pipeline.ts:1395` chama `processConversationTurn` (fire-and-forget) em **toda** mensagem. Esse
caminho executa (`memory/writer.ts`):
1. uma chamada Haiku (`max_tokens: 200`) para extrair fragmentos;
2. até 3 `generateEmbedding()` (chamada externa paga);
3. 3 `INSERT` em `lead_memories` — **tabela inexistente** → erro capturado no `catch` da
   linha 138, que só faz `console.error`.

Ou seja: **1 chamada de LLM + N embeddings por turno, jogados fora, há ~4 meses**, sem nenhum
sinal. Mais o `pipeline.ts:1332-1366` que faz 3 queries em `lead_facts` por fato extraído,
todas falhando em silêncio.

---

### 1.3 CR-3 — `ai_summary`: confirmado e **pior** do que descrito

O caminho de fallback está exatamente onde o dossiê diz (`memory/loader.ts:196`):
`loadL1Snapshot` retorna `""` no erro (linha 62), o loader cai em `ai_summary`. E o `try/catch`
de `pipeline.ts:554` **nunca dispara**, porque o loader engole o erro antes.

**O que o dossiê não viu: `ai_summary` tem DOIS escritores concorrentes.**

| Escritor | Onde | Quando | Fonte | Guarda |
|---|---|---|---|---|
| `updateLeadMemory` | `pipeline.ts:1377-1392` | a cada 5 mensagens | resumo atual + msg do lead + **fala da Nicole** | nenhuma |
| cron `enrich-leads` | `api/cron/enrich-leads/route.ts:145` | **a cada 30 min** | **primeiras 20 mensagens** via Haiku | nenhuma |

Os dois escrevem na mesma coluna, sem lock e sem ordem definida. Os dois recebem a fala da
Nicole como insumo. `flows/lead-memory.ts:36` instrui literalmente
*"Incorpore informacao nova e mantenha as anteriores relevantes"* — sem nenhuma verificação
contra `appointments`. O `ai_summary` real da Sandra hoje:

> "…Sandra **agendou visita para sábado, dia 8**, mas ainda não confirmou horário específico.
> Próximo passo: confirmar horário da visita…"

**A Sandra nunca agendou nada** (verificado: nenhum appointment). Confirmado.

---

### 1.4 CR-4 — Confirmado, e o problema é **muito** maior que agenda

**Confirmado.** `conversation_state.collected_data` da Sandra, lido agora em produção:

```json
{"name":"Sandra","bedrooms":2,"has_down_payment":true,"property_interest":"vind",
 "visit_availability":"sábado, dia 8, de 8h às 12h","visit_pending_date":"2026-08-08"}
```

**GENERALIZAÇÃO (N2, novo).** O dossiê trata isso como um problema do slot de visita. Não é.
A linha `pipeline.ts:995` é:

```ts
const aiExtracted = extractCollectedData(assistantMessage, updatedData)
```

`extractCollectedData` (`flows/qualification.ts:108-305`) extrai **8 campos** e a única proteção
é preservar o `name`. Todo o resto vem da fala da Nicole e é gravado como se fosse informação
**do lead**:

| Campo | Gatilho na fala da Nicole | Efeito colateral |
|---|---|---|
| `property_interest` | menção única a "vind"/"yarden" | define o empreendimento do lead |
| `view` | a substring **`"frente"`** em qualquer lugar | `leads.preferred_view` + 10 pts de score |
| `has_down_payment` | a palavra **`"fgts"`** ou "valor de entrada" | `leads.has_down_payment` + 15 pts |
| `bedrooms` | `"2 suítes"` (frase padrão dela sobre o Vind) | `leads.preferred_bedrooms` + 10 pts |
| `garages` | `"N vagas"` | + 5 pts |
| `floor` | "andar alto"/"andar baixo" | + 10 pts |
| `source` | "instagram", "stand", "placa"… | reescreve a origem do lead |
| `visit_availability` | qualquer dia da semana não-ambíguo | **liga o modo agendamento** + 20 pts |

Isto é auto-contaminação sistêmica: **a Nicole se qualifica a si mesma.** O score infla, o lead
vira `interest_level: "hot"`, `buildFlowContext` injeta *"Lead com alta qualificacao. Priorize
agendar visita"*, e o kanban/roleta reagem a um dado que ninguém informou. Confirmei o gatilho
`bedrooms` na prática: a frase de abertura da Nicole no Vind é *"2 suítes, 67m²…"* nas três
conversas — e a Sandra tem `bedrooms: 2` em `collected_data` sem nunca ter falado de quartos.

**Cadeia causal completa do incidente da Sandra (provada, mensagem a mensagem):**

1. **27/07 15:47:51 e 15:47:53** — a Nicole responde (duas vezes, ver N9) e escreve:
   *"Que tal agendar uma visita… Você prefere durante a semana ou **no sábado de manhã**?"*
   → frase-molde do prompt de **produção** (N1).
2. Mesmo turno: `extractCollectedData(assistantMessage, …)` vê `"sábado"` na lista de
   `dayKeywords` (`qualification.ts:272`), `isAmbiguousSlotText` devolve `false` (1 só dia,
   0 horários) → **`visit_availability` = a frase da própria Nicole**.
3. **05/08 14:55** — a lead reabre com *"Tenho interesse no VIND Residence…"*.
   `hasVisitAvailability = true` → `isVisitSchedulingMode` → **modo agendamento ligado**.
4. `resolveVisitSlotParts` usa `visitAvailability` como fonte (`visit-slot.ts:362`),
   `parseDay("…sábado…", now=05/08)` → **próxima ocorrência = 08/08**.
5. Ramo `day && !time` (`pipeline.ts:841-844`) grava `visit_pending_date = "2026-08-08"` e
   injeta o bloco `[SISTEMA]`:
   > *"O cliente indicou o dia (sábado, 8 de agosto) mas não o horário. Pergunte qual horário prefere."*
6. A Nicole responde: **"Ótimo, Sandra! Sábado, dia 8, está anotado. Nosso atendimento no
   sábado vai até as 12h — qual horário fica melhor pra você?"**
7. Em até 30 min, o cron `enrich-leads` (N3) parafraseia tudo para
   `visit_availability: "sábado, dia 8, de 8h às 12h"` e para o `ai_summary`
   *"Sandra agendou visita para sábado, dia 8"*.

**Conclusão que muda o desenho da solução:** o passo 5 é uma **afirmação falsa emitida pelo
código**. A Nicole obedeceu. Chamar isso de alucinação é diagnóstico errado — e um guardrail de
saída que compare a resposta contra `authorizedSlot`/`collected_data` **teria aprovado** essa
resposta, porque o estado do sistema concordava com ela.

**Bombas armadas agora, em produção (05/08):**

```
conversation_state com visit_pending_date:            13
   …dos quais com data JÁ NO PASSADO:                  9   ← 69%
conversation_state com visit_availability:            63
```

Esses 9 estados vão ligar o modo agendamento e mandar a Nicole "anotar" um dia que já passou na
próxima mensagem que esses leads mandarem. **Isto é remediável hoje, com um UPDATE.**

**N10 (novo) — a limpeza existente é incompleta.** O cron de no-show
(`api/cron/followup/route.ts:710`) faz `delete cleaned.visit_availability` mas **não apaga**
`visit_pending_date` / `visit_pending_hour` / `visit_pending_minute`. Nada mais expira.

---

### 1.5 CR-5 — Confirmado, e a guarda está no lugar certo (isso é uma boa notícia)

`detectSlotMismatch` (`pipeline.ts:109-122`):

```ts
if (!authorizedSlotUtc || !assistantMessage) return null
```

**Confirmado:** devolve `null` exatamente quando o sistema não autorizou nada — o cenário do
agendamento fantasma. E é fail-open (`pipeline.ts:940-956`: só `emit`).

**Prova comportamental em produção** (conversa da Sueli, 03/08, lida na íntegra):

| Hora | Quem | Texto |
|---|---|---|
| 21:51 | Nicole | "Nosso atendimento é de segunda a sexta das 8h às 18h e sábado das 8h às 12h." |
| 21:52 | Sueli | "Sexta a tarde" |
| 21:52 | Nicole | **"Sexta à tarde seria após as 18h, que infelizmente é quando encerramos o atendimento."** |
| 21:52 | Sueli | "Umas 14" |
| 21:52 | Nicole | **"Sexta às 14h fica fora do nosso horário de atendimento, que vai até as 18h — mas às 14h estamos sim disponíveis!"** |
| 21:53 | Nicole | "Vou confirmar a disponibilidade para sexta, dia 7, às 14h e já te aviso." |
| 21:54 | Nicole | "Até sexta, Sueli!" |

Ela se contradiz **na mesma frase** e "confirma" uma visita que nunca chegou a `appointments`.
Note que o prompt (código *e* banco) lista corretamente 8h–18h. **Texto no prompt não é
enforcement** — isto é a prova mais limpa do dossiê inteiro.

**Detalhe de arquitetura que importa muito (N7, novo):** a guarda está em `pipeline.ts:940`,
**antes** de todos os writes (`leads`, `appointments`, `messages`, `conversation_state`). Isso
significa que **existe um ponto único onde um guardrail fail-closed pode ser inserido sem
reordenar nada**. Em contrapartida, um guardrail no webhook (depois de `processMessage`
retornar) chegaria **tarde demais**: o appointment já foi criado, a mensagem já está em
`messages` e o estado já foi persistido. Isso descarta a opção "validar na camada web".

Um adendo à conversa da Valnira que vale ouro para o desenho: no mesmo turno, com o **mesmo**
bloco `[SISTEMA]` (*"O cliente indicou o dia… NÃO afirme nenhum horário"*), ela respondeu
00:09 *"a quinta-feira às 10h está confirmada para você!"* e 00:10 *"qual horário na
quinta-feira fica melhor pra você?"* — **violou e obedeceu a mesma instrução com um minuto de
diferença**. Instrução em prompt é estatística, não determinística. Qualquer plano que dependa
de "melhorar o prompt" está apostando numa distribuição.

---

### 1.6 CR-6 — Orlice: **discordo do dossiê**

O dossiê afirma: *"Não foi a mídia que errou — foi ela decidindo empurrar outro produto."*
Li a conversa inteira em produção. A sequência real (03/08):

| Hora | Quem | Texto |
|---|---|---|
| 20:40 | Orlice | "…é uma coisa a longo prazo… Eu tô vendendo a minha casa, daí que **eu queria comprar um na planta. Quando tivesse, assim, lançando**…" |
| 20:40 | Nicole | "**Temos o Yarden Residence, que é nosso lançamento mais recente** — obras já iniciadas, previsão para 2029…" |
| 20:40 | — | `[Mídia enviada] Planta` |

A lead pediu **um lançamento**. O Yarden **é** o lançamento. A fala da Nicole é um cross-sell
contextualmente correto — provavelmente a melhor jogada comercial do diálogo. **O erro não foi
falar do Yarden; foi a mídia trocar de produto sem ninguém pedir.**
`reconcileMediaWithResponse` (`send-library-media.ts:386-451`, Story 75-270) faz exatamente
isso por design: detecta o pivô na fala e **realinha a mídia para segui-lo**. A 75-270 tornou o
sistema *coerente com* a alucinação em vez de impedi-la.

Isso tem consequência direta no guardrail (b) que você pediu ("proibido introduzir
empreendimento diferente sem o lead pedir"): implementado de forma ingênua, ele **bloquearia
esta resposta**, que estava certa. É o caso canônico de falso positivo que trava atendimento
legítimo. Meu desenho na seção 3 separa as duas coisas: **fala pivota (permitido, logado) ≠
mídia pivota (bloqueado)**.

**N5 (novo) — mas existe um mecanismo de troca de empreendimento que é puro bug.**
`flows/identify-property.ts:13-26`:

```ts
yarden: ["yarden", "83m2", …, "gleba itororo", "churrasqueira", "rooftop"]
```

Consultei o banco:

| Empreendimento | Amenidades | `balcony_bbq` |
|---|---|---|
| **Vind Residence** | …**"Churrasqueira a carvao na sacada"**… | `true` |
| **Yarden** | rooftop, mirante, fire pit… (**sem churrasqueira**) | `false` (ambas tipologias) |

A palavra `"churrasqueira"` está mapeada para o **Yarden** e pertence ao **Vind**. A própria
Nicole usa "churrasqueira" na frase de abertura do Vind em **todas** as conversas que li. Logo,
um lead que responda *"tem churrasqueira?"* faz `identifyProperty` devolver **Yarden**, o que:
- troca `conversation_state.current_property_id` para Yarden;
- faz `identifyPropertyUnique` casar **só** Yarden → `resolvePropertyInterestWrite` classifica
  como `origin: "lead_switch"` (`pipeline.ts:370-372`) e **sobrescreve
  `leads.property_interest_id`** — o único caminho que tem permissão de clobber;
- redireciona toda a mídia subsequente para o Yarden.

Não posso afirmar que foi isso na Orlice (a mensagem dela não contém "churrasqueira"), mas é um
defeito latente com **exatamente a mesma assinatura**, e é uma correção de 1 linha.

---

### 1.7 Causas novas (não estão no dossiê)

#### N1 — O prompt de produção diverge do código, e a divergência causa incidentes. **[CRÍTICO]**

`agent_prompts` em produção, todos `is_active = true`:

| slug | chars | atualizado | consumido pelo código? |
|---|---|---|---|
| `system-personality` | 2478 | 2026-06-18 | **sim** (mascara `personality.ts`) |
| `guardrails` | 9070 | 2026-07-16 | **sim** (mascara `guardrails.ts`) |
| `qualification-flow` | 2458 | 2026-07-10 | **sim** |
| `property-presentation` | 3952 | 2026-06-26 | **sim** |
| `visit-scheduling` | 3756 | **2026-08-04** | **sim** (mascara `visit-scheduling.ts`) |
| `off-hours` | 327 | 2026-06-18 | **NÃO** — botão morto |
| `handoff-summary` | 1942 | 2026-06-13 | **NÃO** — botão morto |

Só `IDIOMA`, `SEDE` e `LEMBRETE FINAL` vêm do código (`prompts/index.ts:82-102`).

Comparando o `visit-scheduling` de produção com `packages/ai/src/prompts/visit-scheduling.ts`:

| Regra | Código (`HEAD`) | **Produção** |
|---|---|---|
| Gate de 3 etapas (sondar interesse antes de pedir dia) | presente (Story 81-4) | **ausente** |
| Frase-molde | "Qual dia e horario ficam melhor…" | **"Qual o melhor dia pra voce, durante a semana ou sabado de manha?"** |
| Endereço da visita | "Todos os decorados ficam na SEDE" | **"O endereco do stand e [endereco do empreendimento]"** ← contradiz RN7 |
| "Nunca prometer retorno" (75-268) | presente | presente |
| "Verdade do horário" (75-245) | presente | presente |

**Prova de que é o prompt do banco que dirige o comportamento:** a frase
*"durante a semana ou no sábado de manhã?"* aparece **literalmente** nas conversas da Sandra
(27/07 15:47), da Orlice (03/08 20:39) e, com variação mínima, da Valnira. Ela **não existe** no
código. E foi essa frase que virou `visit_availability` da Sandra (seção 1.4, passo 2).

Consequências:
- toda story que "corrigiu o prompt" mexendo em `prompts/*.ts` desde ~junho **não chegou a
  produção** para essas 5 seções;
- o prompt de produção instrui a Nicole a fazer duas coisas erradas (propor agenda sem sondar,
  dar o endereço da obra) **e contradiz a própria seção de guardrails do mesmo prompt**;
- dois slugs editáveis no painel admin (`/dashboard/configuracoes/personalidade`) não fazem nada.

**N1b — mais botões mortos.** `loadAgentConfig` (`pipeline.ts:1454-1505`) carrega
`personality_prompt` e `guardrails` de `agent_config` e **nunca os usa** para montar o prompt.
Em produção, `agent_config.personality_prompt` tem **12.445 caracteres**. Alguém escreveu isso.
Não tem efeito nenhum.

#### N3 — `enrich-leads`: o escritor fantasma. **[CRÍTICO]**

`packages/web/src/app/api/cron/enrich-leads/route.ts`, agendado `*/30 * * * *`
(`packages/web/vercel.json`):

```ts
.order("created_at", { ascending: true }).limit(20)          // linha 68 — MESMO bug do CR-1
…
const mergedCollectedData = { ...currentData, ...enrichment.extracted_data }   // linha 149
await supabase.from("conversation_state").update({ collected_data: mergedCollectedData })…
leadPatch.ai_summary = enrichment.summary                                      // linha 105
```

Três defeitos compostos:
1. **CR-1 duplicado.** Lê as primeiras 20 mensagens. Corrigir só o pipeline deixa este de pé.
2. **Bypass do write-once.** `extractCollectedData` só grava campo vazio
   (`if (!updated.visit_availability)`). Aqui o spread coloca a saída do Haiku **por último** →
   sobrescreve qualquer campo, inclusive `visit_availability`, com texto livre gerado por LLM.
   O prompt (`haiku-enrichment.ts:31`) pede literalmente
   `visit_availability: string (dia/horario mencionado)`. **Uma saída de LLM vira insumo do
   parser determinístico de agenda.**
3. **`ai_summary` sem verificação**, competindo com `updateLeadMemory`.

Isto explica o artefato que eu não conseguia atribuir: `"sábado, dia 8, de 8h às 12h"` não é
o texto de nenhuma mensagem — é uma **paráfrase do Haiku** da fala alucinada da Nicole.

#### N6 — 26% das mensagens são invisíveis para a Nicole, e 6% são visíveis com autor errado

Distribuição real da tabela `messages` (produção):

```
user      1362
assistant 1130
broker     812   ← 26% do total
```

`loadConversationHistory` filtra `.in("role", ["user","assistant"])` → **as 812 mensagens de
corretores humanos não existem para a Nicole**. Na conversa da Sueli, o corretor Odair escreveu
*"vai ser eu que vou atender você na sexta-feira às 14:00"* — a Nicole não tem como saber.
Na da Sandra, o Odair ofereceu *"entrada de 35 mil e pagamentos…"*. Se o lead responder a isso,
a Nicole responde no vácuo.

No sentido inverso, últimos 30 dias:

```
nicole (pipeline)      486
broker_transition       74   ← role="assistant", texto gerado pelo CRM
nicole_library          33   ← role="assistant", conteúdo "[Mídia enviada] X"
```

**~18% do que a Nicole lê como "coisas que eu disse" não foi gerado por ela.**
`send-message/route.ts:214` grava a transição do corretor como `assistant`;
`send-library-media.ts:548` grava `"[Mídia enviada] Vind Residence — Planta"` como `assistant`.
Esses textos também alimentam `lastAssistantMsg` → `NICOLE_TALKED_VISIT_RE` → modo agendamento.

#### N8 — `isSlotFree` é fail-open: erro de banco vira "horário livre"

`flows/visit-slot.ts:451-473`:

```ts
const { data } = await q.limit(1).maybeSingle()
return !data
```

O `error` é **descartado**. Timeout, RLS, indisponibilidade do Postgres → `data = null` →
`free = true` → a Nicole confirma e o pipeline **cria** o appointment em cima de outro.
Mesmo padrão em `checkSlotAvailability` e `freeSlotsInPeriod`. Um incidente de infra vira
overbooking silencioso.

**N8b (performance, e é relevante para a seção 2):** `freeSlotsInPeriod` e
`checkSlotAvailability` fazem **uma query sequencial por candidato de horário** — até ~20
round-trips ao Supabase por turno. Isso é substituível por **uma** query de range. Guarde este
número: ele paga sozinho o custo de latência das tools.

#### N9 — Respostas duplicadas (race de concorrência)

Sandra, 27/07: `15:47:51` e `15:47:53`, **duas** respostas quase idênticas da Nicole para duas
mensagens do lead enviadas no mesmo segundo (`15:47:43` "Mais só posso até 400 mil" e "Sandra").
Mesmo padrão em `15:39`. Não há lock por conversa: dois webhooks concorrentes rodam
`processMessage` em paralelo, ambos leem o mesmo `conversation_state`, ambos escrevem
(último vence), e o lead recebe duas mensagens. Custo dobrado, histórico poluído, e **perda de
escrita de estado** (o `upsert` de um sobrescreve o do outro).

#### N11 — Telemetria que mente

`rag/search.ts:37-40`: erro do RPC `match_knowledge` → `console.error` + `return []`.
O pipeline (`pipeline.ts:469`) então emite **`RAG_SUCCESS` com `results_count: 0`**. Uma falha
de RAG é registrada como sucesso. `RAG_FALLBACK` só dispara se a função **lançar**, o que ela
nunca faz.

#### N12 — Configuração que contradiz o prompt

`agent_config` em produção: `business_hours = {"hours": {}, "always_on": true}`,
`temperature = 0.70`, `max_tokens = 1024`.

- `always_on: true` → o gate de off-hours (`pipeline.ts:437-454`) **nunca** dispara. Confirmado
  nos dados: a conversa da Valnira acontece **23:45–00:10**. A Nicole atende de madrugada
  dizendo que o atendimento é 8h–18h.
- Existem **três** fontes de verdade para o expediente, sem nenhuma ligação entre si:
  `agent_config.business_hours` (banco), `closeHourFor()` (`visit-slot.ts:18-22`, hard-coded
  8–18/8–12/domingo fechado) e o texto do prompt (código **e** banco). Já divergem hoje.
- `temperature: 0.70` para um agente que precisa aderir a regras é alto. Não tenho medição
  A/B para provar o ganho, mas é um dial barato de testar (seção 7).

---

## 2. Design de tool use

### 2.1 Crítica à premissa

A proposta *"ela não sabe nada, ela consulta"* está **certa na direção e incompleta no
diagnóstico**. Três correções antes do desenho:

**(a) A Nicole já consulta.** O bloco `[SISTEMA]` é, funcionalmente, uma tool call — executada
eagerly pelo código antes da geração, com o resultado injetado como texto. É um padrão legítimo
(*eager pre-fetch*) e tem **latência zero adicional**. O problema não é a pré-injeção; é que
(i) a premissa calculada estava errada (seção 1.4), (ii) o texto não tem força vinculante
(Valnira: violou e obedeceu o mesmo bloco em 1 minuto), e (iii) **não é a única "verdade" na
janela** — `ai_summary`, `collected_data` e o histórico dizem outra coisa ao mesmo tempo.

**(b) Tool use não elimina alucinação; muda a forma dela.** A literatura de 2026 é explícita:
a falha característica de agentes com tools é *entity-level* — o modelo emite identificadores
plausíveis da memória paramétrica **em vez** da saída da tool ([AgentLTL](https://arxiv.org/pdf/2607.02599)),
e os modos de falha específicos incluem `parameter fabrication`, `tool-output misinterpretation`
e `cross-turn memory corruption` ([AgentProp-Bench](https://arxiv.org/html/2604.16706v1)).
Se hoje ela ignora um bloco `[SISTEMA]` que diz "não afirme horário", nada garante que amanhã
ela não ignore um `tool_result`. **Tool sem validação de saída é a mesma aposta com mais
latência.**

**(c) O argumento real a favor de tools aqui não é grounding — é atomicidade.** Hoje a Nicole
*diz* "confirmado" numa string, e um bloco de código **separado** decide se cria o appointment
(`pipeline.ts:1132`, condicionado a `bookableSlotUtc`). Essas duas coisas divergiram nos
incidentes da Sueli e da Valnira: a fala confirmou, o banco não registrou, e o corretor
descobriu no dia seguinte. Se **agendar for uma tool**, a confirmação e a escrita passam a ser
**o mesmo evento**: ou o `tool_result` diz `status: "agendada"` (e a linha existe), ou ela não
tem o que confirmar. Essa é a razão pela qual vale a pena pagar o round-trip — não é
"consultar", é **agir**.

### 2.2 Latência e custo — com números reais

Medi em produção (`system_events`, `event_type = CLAUDE_RESPONSE`, 21 dias, n=378):

| Métrica | Valor |
|---|---|
| p50 | **2.925 ms** |
| p90 | 4.470 ms |
| p99 | 8.968 ms |
| máx | 20.100 ms |
| output tokens (média) | **75** |
| input tokens (média) | 1.836 (+ 4.883 lidos do cache) |

E o produto **já adiciona atraso de propósito** (`lib/whatsapp/typing-delay.ts:21-29`):
`800–1200 ms` de base + `min(len × 25, 3000) ms`. Para uma resposta típica (~200 chars) isso é
**+3,8 a 4,2 s**. Ou seja, o lead **hoje** espera ~**6,7–7,1 s** no p50, dos quais **~4 s são
artificiais**.

**Orçamento de um round-trip adicional de tool:**

| Componente | Estimativa | Base |
|---|---|---|
| Turno 1 (tool_use) | ~1,0–1,5 s | ~40–60 tokens de saída vs. 75 medidos em 2,9 s |
| Execução da tool (DB) | 50–150 ms | 1 query de range (hoje são **até 20 sequenciais**, N8b) |
| Turno 2 (resposta final) | ~2,9 s | igual ao de hoje |
| **Total** | **~4,0–4,5 s** | vs. 2,9 s hoje → **+1,1 a 1,6 s** |

**O delta cabe inteiro dentro do atraso artificial que já existe.** Basta subtrair o tempo real
gasto do `calculateTypingDelay` (`delay = max(0, delayDesejado − tempoJáGasto)`) e a latência
**percebida pelo lead não muda**. Isso é uma mudança de 3 linhas. Comparado ao domínio de voz —
onde o alvo é TTFT < 300 ms e p95 < 800 ms
([Prompt Bench](https://thepromptbench.com/voice-and-realtime/latency-budgets-for-realtime-voice/),
[Prodinit](https://prodinit.com/blog/production-voice-ai-agents-latency-architecture)) — o
WhatsApp assíncrono tem folga de uma ordem de grandeza. **Latência não é um argumento válido
contra tools neste canal.** (Ressalva honesta: não medi a latência Vercel→Supabase a partir de
`gru1`; ver seção 8.)

**Custo:** o bloco `tools` adiciona ~354–474 tokens de system prompt para Sonnet
([pricing de tool use](https://platform.claude.com/docs/en/docs/build-with-claude/tool-use/overview)),
mais os schemas, mais um turno extra de input. Ordem de grandeza: **+40 a 60% de custo por
turno com tool**, sobre uma base de ~1.836 input + 75 output tokens. Em ~500 respostas/mês, é
irrelevante frente ao custo de **um** lead pago queimado. Contrapeso: o volume atual já paga
1 Haiku + N embeddings por turno **para escrever em tabela inexistente** (CR-2) — matar isso
financia as tools com sobra.

**"E se ela simplesmente não chamar a tool?"** É o risco real, e tem mitigação de primeira
classe na API:
- `tool_choice: {"type": "any"}` — obriga **alguma** tool;
- `tool_choice: {"type": "tool", "name": "agendar_visita"}` — obriga **aquela** tool;
- `strict: true` no schema — garante conformidade de argumentos;
- `disable_parallel_tool_use: true` — no máximo uma por turno.

Desenho recomendado: **`tool_choice` condicional ao estado**. Em modo agendamento com dia+hora
resolvidos → `{"type":"tool","name":"agendar_visita"}` (**forçado**). Fora disso → `auto`.
Combinado com o guardrail G5 (seção 3), fechar a visita sem passar pela tool torna-se
**impossível**, não improvável.

### 2.3 Catálogo de tools

Segui a orientação da Anthropic de **consolidar** (*"More tools don't always lead to better
outcomes"*) e usar **identificadores semânticos** em vez de UUIDs — *"resolving arbitrary
alphanumeric UUIDs to more semantically meaningful language significantly improves Claude's
precision… by reducing hallucinations"*
([Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)).
Por isso todas as tools falam `"vind"`/`"yarden"` e datas ISO, **nunca** `property_id`.

**Contrato universal (inegociável):** nenhuma tool devolve vazio ambíguo. Toda resposta tem
`status` explícito, e existe sempre um `status` para "não sei" com instrução de fallback —
alinhado com *"Allow Claude to say 'I don't know'"*
([Reduce hallucinations](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations)).
Erro de infraestrutura **nunca** vira "não encontrei": vira `status: "indisponivel"` com
instrução explícita de não afirmar nada.

---

#### T1 · `agendar_visita` — **ACEITA (prioridade máxima)**

```jsonc
{
  "name": "agendar_visita",
  "description": "Registra a visita do cliente na agenda. Chame SOMENTE quando o cliente tiver dito o dia E o horário. É a ÚNICA forma de marcar uma visita: se você não chamar esta tool, NENHUMA visita existe, por mais que você escreva que está confirmada.",
  "input_schema": {
    "type": "object",
    "properties": {
      "dia":  {"type":"string","description":"Data ISO YYYY-MM-DD, já resolvida (ex.: 2026-08-07)"},
      "hora": {"type":"string","pattern":"^([01]\\d|2[0-3]):[0-5]\\d$"},
      "empreendimento": {"type":"string","enum":["vind","yarden"]},
      "citacao_do_cliente": {"type":"string","description":"Trecho LITERAL da mensagem do cliente que pediu este dia/horário. Se você não conseguir citar, NÃO chame esta tool."}
    },
    "required": ["dia","hora","citacao_do_cliente"]
  },
  "strict": true
}
```

| | |
|---|---|
| **Fonte da verdade** | `appointments` (org + `team='house'`), via `evaluateSlot` + `isSlotFree` |
| **Retorna** | `{"status":"agendada","quando":"sexta-feira, 7 de agosto às 14:00","protocolo":"…"}` · `{"status":"ocupado","alternativas":["…","…"],"instrucao":"Não confirme. Ofereça exatamente estas opções."}` · `{"status":"fora_do_expediente","expediente":"seg–sex 8h–18h, sáb 8h–12h"}` · `{"status":"no_passado"}` · `{"status":"ja_existe_visita","quando":"…","instrucao":"Use remarcar_visita."}` |
| **Quando NÃO sabe** | `{"status":"indisponivel","instrucao":"A agenda não respondeu. NÃO confirme nem negue nenhum horário. Diga que vai deixar reservado e que a equipe confirma em instantes, e siga a conversa."}` — **fail-closed**, nunca "livre" |
| **Fecha** | Sueli e Valnira (confirmação sem linha no banco), CR-5 |

O campo `citacao_do_cliente` é o mecanismo de *quote grounding* que a Anthropic recomenda
(*"ask Claude to extract word-for-word quotes first… This grounds its responses in the actual
text"*). Serve para duas coisas: reduzir chamada espúria, e permitir que o **executor da tool**
valide deterministicamente que a citação existe de fato numa mensagem `role='user'` da conversa.
**Se não existir, a tool recusa** (`status:"citacao_nao_encontrada"`) — é isto que teria matado
o "sábado, dia 8" na raiz, porque a Nicole não conseguiria citar a Sandra dizendo isso.

#### T2 · `remarcar_visita` / T3 · `cancelar_visita` — **ACEITAS**

Mesma forma. `remarcar_visita(novo_dia, nova_hora, citacao_do_cliente)`;
`cancelar_visita(citacao_do_cliente)`. Fonte: `appointments` + Google Calendar.
Retornos análogos, com `{"status":"sem_visita_ativa"}` explícito.
**Fecham:** divergência entre fala e banco em remarcação/cancelamento (hoje em
`pipeline.ts:1221-1279`, desacoplada da fala).

#### T4 · `consultar_agenda` — **ACEITA**

```jsonc
{"name":"consultar_agenda",
 "description":"Horários livres para visita. Use ANTES de oferecer qualquer horário. Nunca ofereça um horário que não tenha vindo desta tool.",
 "input_schema":{"type":"object","properties":{
   "dia":{"type":"string","description":"ISO YYYY-MM-DD, ou omita para 'próximos dias'"},
   "periodo":{"type":"string","enum":["manha","tarde","qualquer"]}},"required":[]}}
```

| | |
|---|---|
| **Fonte** | `appointments` — **uma** query de range (substitui os ~20 round-trips de `freeSlotsInPeriod`, N8b) |
| **Retorna** | `{"livres":["quinta-feira, 7 de agosto às 08:00", …],"expediente":"…"}` |
| **Quando NÃO sabe** | `{"status":"indisponivel","livres":[],"instrucao":"NÃO invente horários. Pergunte a preferência do cliente e diga que já confirma."}` |
| **Fecha** | Sueli ("sexta 14h fora do expediente"), Valnira (sábado oferecido para quem pediu dia de semana) |

#### T5 · `consultar_empreendimento` — **ACEITA, com escopo estreito**

```jsonc
{"name":"consultar_empreendimento",
 "description":"Dado oficial de um empreendimento. Use SEMPRE que for afirmar um número, medida, prazo, amenidade ou ponto de referência. Se o campo voltar como desconhecido, diga que vai confirmar com a equipe.",
 "input_schema":{"type":"object","properties":{
   "empreendimento":{"type":"string","enum":["vind","yarden"]},
   "campos":{"type":"array","items":{"type":"string","enum":[
     "tipologias","area_privativa","amenidades","entrega","endereco_obra",
     "pontos_de_referencia","estoque","faq"]}}},
  "required":["empreendimento","campos"]}}
```

| | |
|---|---|
| **Fonte** | `properties` + `typologies` + `units` + `knowledge_base` (RAG) |
| **Retorna** | `{"vind":{"area_privativa":"66,91 m²","amenidades":[…],"desconhecidos":["pontos_de_referencia"]}}` |
| **Quando NÃO sabe** | lista explícita em `desconhecidos` + `instrucao:"Para os campos em 'desconhecidos', responda que vai confirmar com a equipe. NUNCA preencha."` |
| **Fecha** | RN8/RN9 (inventar distância, ponto de referência, medida) — hoje puramente textuais |

**Nota importante:** hoje `buildPropertyDataContext` já injeta **tudo** de **todos** os
empreendimentos em texto (`pipeline.ts:1756-1843`). Isso é pré-fetch e funciona. Recomendo
**manter** o pré-fetch do empreendimento estabelecido (latência zero, ~80% dos turnos) e usar
T5 apenas para os campos raros/ausentes. Tool não substitui pré-fetch; complementa.

#### T6 · `enviar_material` — **ACEITA (com mudança de responsabilidade)**

```jsonc
{"name":"enviar_material",
 "description":"Envia fotos/planta/localização da biblioteca oficial. É a ÚNICA forma de enviar imagem. Só afirme que enviou algo se esta tool tiver retornado 'enviados'.",
 "input_schema":{"type":"object","properties":{
   "empreendimento":{"type":"string","enum":["vind","yarden"]},
   "tipos":{"type":"array","items":{"type":"string","enum":["planta","fachada","lazer","localizacao","tabela"]}}},
  "required":["empreendimento","tipos"]}}
```

| | |
|---|---|
| **Fonte** | biblioteca de assets + dedup por `conversation_id` |
| **Retorna** | `{"enviados":["Vind Residence — Planta"],"nao_enviados":[{"tipo":"fachada","motivo":"ja_enviado_antes"}]}` |
| **Quando NÃO sabe** | `{"enviados":[],"nao_enviados":[{"tipo":"…","motivo":"empreendimento_nao_definido"}],"instrucao":"NÃO diga que enviou. Pergunte de qual empreendimento."}` |
| **Fecha** | Orlice (mídia trocando de produto), RN12, Story 75-157/75-270 |

**Mudança estrutural:** hoje a mídia é resolvida **antes** da fala (`resolveSendableMedia`) e
depois **realinhada à fala** (`reconcileMediaWithResponse`). Com T6, a fala e o envio viram o
mesmo ato, e o pivô de empreendimento passa a exigir uma **decisão explícita e auditável**
(`empreendimento: "yarden"` no argumento) — que o guardrail G3 pode inspecionar. Isso resolve a
Orlice de forma limpa: a frase sobre o Yarden fica; a planta do Yarden só sai se ela **pedir**
a planta do Yarden explicitamente, e isso vira um evento.

#### T7 · `consultar_preco` — **REJEITADA (cortar)**

RN2 e RN4 proíbem a Nicole de citar qualquer valor. Uma tool que só pode devolver
"não divulgamos" é sobrecarga sem informação — e cria risco novo: a existência de uma tool
chamada `consultar_preco` **sugere** ao modelo que preço é algo que ele pode falar. Onde há
material comercial (tabela), o caminho é `enviar_material(tipos:["tabela"])`. O resto é
guardrail determinístico (G2: **zero valores monetários na saída**), que é mais forte que
qualquer tool.

#### T8 · `consultar_status_cliente` — **REJEITADA para a v1 (diferir)**

Já existe caminho funcionando: `maybeRouteInboundToRelationship`
(`packages/web/src/lib/relacionamento/route-inbound.ts`) desvia clientes existentes **antes**
do pipeline. Criar uma tool paralela duplicaria a lógica e abriria uma segunda fonte de verdade
— exatamente o padrão que causou este dossiê. Se no futuro a Nicole precisar responder a
clientes, o certo é a tool **substituir** o roteador, não coexistir.

#### T9 · `registrar_dado_do_lead` — **ADICIONADA (não estava na lista)**

```jsonc
{"name":"registrar_dado_do_lead",
 "description":"Grava algo que O CLIENTE disse sobre ele (nome, quartos, andar, orçamento, disponibilidade). Só chame para o que o CLIENTE afirmou, nunca para o que você sugeriu.",
 "input_schema":{"type":"object","properties":{
   "campo":{"type":"string","enum":["nome","quartos","andar","vista","vagas","tem_entrada","disponibilidade_visita","origem"]},
   "valor":{"type":"string"},
   "citacao_do_cliente":{"type":"string"}},
  "required":["campo","valor","citacao_do_cliente"]}}
```

**Esta é a tool que fecha o incidente da Sandra.** Ela substitui
`extractCollectedData(assistantMessage, …)` — o mecanismo que transformou a pergunta da Nicole
em "disponibilidade do lead" (N2). Com T9, gravar um dado exige (i) uma decisão explícita e
(ii) uma citação que o executor **valida contra as mensagens `role='user'`**. Se a citação não
existir, não grava. A alternativa mais barata (e que recomendo fazer **antes** das tools, como
P0) é simplesmente **deletar** a extração sobre `assistantMessage`.

**Resumo do catálogo:** 7 tools (T1–T6, T9). Aceitas 7, rejeitadas 2, adicionada 1.
Todas com contrato "não sei" explícito e fail-closed em erro de infraestrutura.

### 2.4 Arquitetura recomendada — híbrida, não "tudo tool"

```
turno do lead
  │
  ├─ [pré-fetch eager, latência 0] estado do lead + empreendimento estabelecido
  │   + visita ativa + expediente        → bloco dinâmico (como hoje, porém saneado)
  │
  ├─ chamada 1 ao modelo  (tools expostas; tool_choice condicional ao estado)
  │     ├─ sem tool_use → segue para guardrails
  │     └─ com tool_use → executa (única, ≤1 por turno) → chamada 2
  │
  ├─ [GUARDRAILS PÓS-RESPOSTA]  ← seção 3, ANTES de qualquer write
  │
  └─ commit (appointments, leads, messages, conversation_state) → envio
```

Regras de desenho:
1. **Máximo 1 round-trip de tool por turno** (`disable_parallel_tool_use: true`, e recusa da
   segunda chamada). Limita o pior caso de latência a +1,6 s.
2. **`tool_choice` dirigido por estado**, não por prompt: modo agendamento com dia+hora → tool
   forçada. Isso é enforcement, não persuasão.
3. **Pré-fetch continua**, para o que é barato e usado quase sempre. Tools são para **ações** e
   para o cauda-longa.
4. **Toda tool que escreve emite evento** com `tool_name`, argumentos, `status` e `latency_ms`.
   Sem isso não há como medir "ela chamou a tool?" (seção 6).

### 2.5 O que tools **não** resolvem (seja honesto sobre isso)

| Incidente | Tool resolve? |
|---|---|
| Sueli/Valnira — confirmar visita inexistente | **Sim** (T1, atomicidade) |
| Sueli — "sexta 14h fora do expediente" | **Sim** (T4) |
| Orlice — planta do empreendimento errado | **Sim** (T6 + G3) |
| Sandra — "Sábado, dia 8, está anotado" | **Não.** O `[SISTEMA]` afirmava isso como fato. Resolve-se em **T9 + N2 + N3** (proveniência na escrita) |
| Sandra — devolver o teto de R$ 400 mil | **Não.** É guardrail de saída (G2) |
| Markdown, tamanho, reapresentação | **Não.** Guardrail cosmético (G8) |

Ou seja: **das 6 falhas, tools fecham 3.** É por isso que a seção 3 não é opcional.

---

## 3. Output guardrails com enforcement

### 3.1 Onde a camada entra (e por que não pode ser no webhook)

`pipeline.ts:930-956` já é o ponto natural: a resposta existe, e **nenhum** write aconteceu
ainda. Os writes começam em `pipeline.ts:1028` (`leads`), `1140` (`appointments`), `1315`
(`messages`), `1318` (`conversation_state`).

**Restrição dura:** validar no webhook (após `processMessage` retornar) é tarde demais — o
appointment já existe, a mensagem já está gravada e o estado já foi persistido. A camada
**tem** que ser interna ao pipeline, entre a resposta e o commit.

```
resposta do modelo
   ↓
validate(resposta, contexto)  ──── ok ────→ commit + envio
   ↓ violação fail-closed
regenerar (1 tentativa, temp 0.2, bloco [CORREÇÃO])
   ↓
validate  ──── ok ────→ commit + envio (evento GUARDRAIL_RECOVERED)
   ↓ violação de novo
resposta canônica segura da categoria + evento GUARDRAIL_FALLBACK (error) + notifica corretor
```

### 3.2 Catálogo de guardrails

Legenda de severidade: **FC** = fail-closed (bloqueia o envio e regenera) ·
**AF** = auto-fix (corrige o texto sem regenerar) · **FO** = fail-open (só loga).

| ID | Regra | Detecção | Modo | Fecha |
|---|---|---|---|---|
| **G1** | Não afirmar dia+hora de visita não autorizado | `resolveVisitSlotParts(resposta)` devolve dia+hora único **e** (`authorizedSlot == null` **ou** difere > 30 min) | **FC** | CR-5, Sandra, Valnira |
| **G2** | **Nenhum valor monetário na saída** | regex `R\$`, `\d+\s*(mil|k)\b`, `\d{3}\.\d{3}` — exceto o telefone institucional | **FC** | **requisito (a)**, RN2, RN4 |
| **G3a** | Mídia não muda de empreendimento sem pedido | argumento de `enviar_material` ≠ empreendimento estabelecido **e** a msg do lead não cita o outro | **FC** (bloqueia só a **mídia**) | Orlice |
| **G3b** | Fala introduz outro empreendimento | resposta cita empreendimento ≠ estabelecido | **FO** + evento | **requisito (b)** — ver 3.4 |
| **G4** | Não dizer que enviou o que não sai | verbo de envio na resposta **e** `willSend == false` | **FC** | RN12, 75-157 |
| **G5** | Não confirmar visita sem linha no banco | verbo de confirmação (`anotad|agendad|confirmad|marcad|te espero|reservei`) **e** nenhum appointment ativo criado/existente neste turno | **FC** | **Sueli, Valnira** |
| **G6** | Não contradizer o expediente | resposta afirma "fora do horário" para um slot que `closeHourFor()` aceita (ou vice-versa) | **FC** | **Sueli** |
| **G7** | Não prometer retorno sobre agenda | `deixa eu confirmar|já te retorno|vou ver com a equipe` **e** modo agendamento ativo | **FC** | 75-268 (reincidiu) |
| **G8** | Markdown, emoji, tamanho, reapresentação | regex | **AF** (remove/trunca) | LEMBRETE FINAL — violado na Orlice (`**Localização:**`) |
| **G9** | Ponto de referência / número não fundamentado | *claim check* contra o que veio de T5/RAG | **FO** (v1) → FC depois de medido | RN8, RN9 |
| **G10** | Não devolver preferência que o lead não declarou | resposta afirma dado do lead ausente de `collected_data` com proveniência de citação | **FO** | N2 |

**G2 — decisão de desenho.** Você pediu "proibido devolver o teto que o lead declarou". Eu
recomendo a regra **mais ampla e mais simples**: *a Nicole não emite valor monetário, ponto*.
Razões: (i) RN2 e RN4 já proíbem, e nunca foram enforçadas; (ii) uma regra "só o número que o
lead disse" exige extrair o número da conversa e compará-lo — mais frágil e com mais falso
negativo (ela pode dizer "R$ 380 mil", que não é o teto e é igualmente destrutivo);
(iii) determinística, ~0 falso positivo, custo de µs. A exceção única é o telefone
`(44) 3222-9698` (RN10), que se resolve com uma allowlist literal.

**G5 — a checagem mais valiosa do conjunto.** É a que teria matado os dois incidentes de 03/08
no mesmo segundo em que aconteceram. Implementação: no ponto de validação, o pipeline já sabe
se `bookableSlotUtc`/`rescheduleSlotUtc` foi setado e se existe `activeAppointment`. Se a
resposta contém verbo de confirmação e nenhuma das três condições vale → bloqueia.

### 3.3 Regeneração

**Tentativa 1 → tentativa 2 (única).** Não recomendo 3+: cada tentativa custa ~2,9 s e o
histórico mostra que o modelo, quando erra a mesma regra duas vezes, erra por ambiguidade de
contexto, não por sorte.

Prompt de correção (bloco `user` adicional, não system — para não invalidar o cache):

```
[CORREÇÃO DO SISTEMA] Sua resposta anterior foi BLOQUEADA e não foi enviada ao cliente.
Motivo: {regra_violada} — {explicação em uma linha}.
Trecho problemático: "{trecho}"
O que você PODE dizer neste turno: {alternativa_permitida_derivada_do_estado}
Reescreva a resposta inteira respeitando isso. Não mencione esta correção.
```

Parâmetros: `temperature: 0.2` (a geração de correção não precisa de variedade),
`max_tokens` igual, **mesmo** system prompt (cache preservado).

**Fallback quando a regeneração também falha** — respostas canônicas por categoria, escritas à
mão, revisadas pelo Marcos:

| Categoria | Resposta de fallback |
|---|---|
| G1/G5/G6/G7 (agenda) | "Deixa eu conferir aqui certinho pra não te passar informação errada — qual dia e horário ficam melhores pra você? A gente atende de segunda a sexta das 8h às 18h e sábado das 8h às 12h." |
| G2 (valor) | "Os valores variam conforme o andar e a posição do apartamento. O corretor consegue te mostrar as opções que combinam com o que você procura — quer que eu marque uma conversa?" |
| G3a/G4 (mídia) | "Deixa eu ver aqui o que tenho disponível e já te mando. Enquanto isso, quer conhecer o decorado pessoalmente?" |

**Regra inegociável: nunca enviar silêncio.** Num canal de lead pago, não responder é pior que
responder genérico. O fallback sempre envia algo, sempre emite evento `level: "error"`, e para
G1/G5 também **notifica o corretor responsável** — o mesmo caminho já usado em
`notifyBrokerOfAppointment`.

### 3.4 Controle de falso positivo (a parte que decide se isto funciona)

Um guardrail mal calibrado trava atendimento legítimo e sai mais caro que a alucinação. Seis
mecanismos, todos obrigatórios:

1. **Shadow mode primeiro, sempre.** Toda regra nasce em **FO**, medindo
   `GUARDRAIL_WOULD_BLOCK` por ≥ 7 dias. Só vira FC com taxa medida e amostra revisada
   manualmente. É o padrão da indústria: rodar checagens baratas em 100% do tráfego e escalar
   só o que foi sinalizado ([Braintrust](https://www.braintrust.dev/articles/best-hallucination-detection-tools-2026),
   [Noveum](https://noveum.ai/en/blog/hallucination-detection-production-ai-agents)).
2. **Flag por categoria**, em coluna que o código **realmente lê** (ver N1b — não repita o erro
   de criar botão morto). `off | shadow | enforce`.
3. **Circuit breaker.** Se uma categoria bloquear > X% dos turnos numa janela (sugestão: 15% em
   1 h), ela **se rebaixa automaticamente** para shadow e emite alerta. Uma regex ruim não pode
   derrubar o atendimento. É o padrão de *graceful degradation* que o próprio AIOS já usa nos
   gates IDS.
4. **Golden set em CI.** As quatro conversas incidentadas viram fixtures. Para cada regra:
   *deve* disparar nos textos ruins reais (ex.: G6 na frase da Sueli) e **não** disparar em
   ~50 respostas boas amostradas de produção. Quebra o build se regredir.
5. **Assimetria deliberada.** FC só para categorias com dano **irreversível e caro**
   (agendamento fantasma, valor, mídia errada). Tom, tamanho e markdown vão para AF/FO — não
   vale regenerar 3 s por um asterisco.
6. **Auditoria semanal de bloqueios.** Toda resposta bloqueada é gravada íntegra (com a
   regenerada) numa tabela de revisão. Se 20% dos bloqueios forem falso positivo na revisão
   humana, a regra volta para shadow.

**Sobre o requisito (b) especificamente.** O caso Orlice prova que "não introduzir outro
empreendimento" **não pode** ser fail-closed na fala. A lead pediu um lançamento; o Yarden é o
lançamento; bloquear isso seria bloquear a venda. O desenho que recomendo:
- **G3a (FC):** a **mídia** nunca troca de empreendimento sem pedido explícito. Dano
  irreversível (planta errada no WhatsApp), zero valor comercial em errar.
- **G3b (FO + evento + revisão):** a **fala** pode pivotar, mas todo pivô vira evento
  `NICOLE_PROPERTY_PIVOT` com o trecho da mensagem do lead que o motivou. Depois de 2–4 semanas
  de dados, você decide com números se algum subconjunto merece FC (por exemplo: pivô **sem**
  nenhum sinal na mensagem do lead — aí sim é empurrada de produto).

---

## 4. Isolamento cross-lead como invariante testável

A auditoria do dossiê está correta — reverifiquei os caminhos e não encontrei vazamento. Mas o
dossiê acerta no essencial: **hoje isso é verdade por construção, e nada protege contra
regressão**. Quatro camadas, da mais barata à mais forte.

### Camada 1 — Regra estática em CI (barata, cobre 100% dos call sites)

Só existem **32** chamadas `.from("…")` em `packages/ai/src` (inventário completo):

```
appointments 8 · leads 4 · activities 4 · messages 3 · lead_facts 3 ·
conversations 2 · conversation_state 2 · lead_memories 2 · properties 1 ·
agent_prompts 1 · agent_config 1
```

Volume perfeitamente tratável. Teste (vitest + TypeScript Compiler API ou `ts-morph`) que:
- percorre a AST de `packages/ai/src/**` e `packages/web/src/{lib,app/api}/**`;
- para cada `.from("<tabela>")` numa **allowlist de tabelas por-tenant**
  (`messages`, `conversation_state`, `conversations`, `leads`, `lead_facts`, `lead_memories`,
  `activities`, `appointments`), exige na **mesma cadeia** um `.eq()` com uma coluna de escopo
  aprovada (`lead_id`, `conversation_id`, `id`) — `org_id` sozinho **não** basta;
- para cada `.rpc("<fn>")` numa allowlist, exige argumento de escopo (`match_lead_id` etc.);
- aceita a anotação de escape `// @cross-lead-safe: <motivo>` na linha anterior, que **entra no
  relatório** — escapes são visíveis, não silenciosos;
- **falha o build** em qualquer violação.

### Camada 2 — Teste comportamental sobre o prompt montado (a mais importante)

A camada 1 valida queries. **O que realmente importa é o payload que sai para a Anthropic.**

Teste de integração:
1. Semeia dois leads na mesma org, com **canários** deliberados e improváveis:
   lead B com nome `"ZZQX Canário"`, telefone `+55 44 90000-0002`, `ai_summary` contendo
   `"orçamento de R$ 777.777"`, `collected_data.visit_availability = "quarta-feira canário"`.
2. Roda `processMessageWithMetadata` para o lead **A**, com o cliente Anthropic **mockado** para
   capturar o `MessageCreateParams` inteiro.
3. Serializa `system` + `messages` + `tools` e afirma: **nenhum** canário de B aparece.
4. Repete para os cenários que mais mexem em contexto: lead com visita ativa, lead em modo
   agendamento, lead com `ai_summary`, lead com 40 mensagens, lead com dois `conversations`.

Isto testa o **limite real** e não quebra quando alguém refatora as queries.

### Camada 3 — Escopo imposto em runtime (transforma convenção em garantia)

Um wrapper `scopedClient(supabase, { leadId, conversationId, orgId })` que:
- intercepta `.from(tabela)` para tabelas por-tenant e **lança** se a cadeia for executada sem
  filtro de escopo (em dev/CI **sempre**; em produção emite `error` + bloqueia a query);
- registra, por turno, todas as tabelas lidas e os filtros aplicados, num evento
  `TURN_DATA_ACCESS` — que serve simultaneamente à seção 6 (fail-fast) e à auditoria.

É o único mecanismo que sobrevive a código novo escrito por alguém que nunca leu este documento.

### Camada 4 — Assertivas de dados (job diário)

Transformar as consultas do dossiê em asserções automáticas, com alerta:
`0` telefones com mais de um lead · `0` conversas órfãs · `0` mensagens cujo `conversation_id`
pertence a outro `lead_id` · `0` `lead_facts`/`lead_memories` sem `lead_id`.

**Recomendação de ordem:** Camada 2 → Camada 1 → Camada 4 → Camada 3. A 2 dá a garantia mais
alta pelo menor esforço; a 3 é a mais robusta, mas exige tocar em todos os call sites.

---

## 5. A questão do MemPalace

### Recomendação: **NÃO ressuscitar. Enterrar L2/L3, reconstruir L1 com proveniência.**

Um caminho só, defendido abaixo.

**Por que não reaplicar a migration 012:**

1. **Não há um único dado de que funcione.** O sistema nunca rodou. Todo o benefício alegado é
   teórico ("~70% implementado" na memória de projeto, que auditou código e não o banco).
   Ligá-lo agora não é restaurar uma capacidade perdida — é **fazer o primeiro deploy de um
   sistema de 4 meses atrás, sem testes de produção, no meio de uma crise de confiabilidade**.
2. **A camada de escrita reproduz o defeito central.** `memory/writer.ts:154-167`
   (`processConversationTurn`) recebe `assistantMessage` e manda para o Haiku classificar
   fragmentos — o **mesmo** insumo contaminado que produziu o `ai_summary` da Sandra. Ligar
   L2/L3 hoje é ligar um segundo amplificador, agora com busca semântica: uma alucinação
   gravada como fragmento voltaria em qualquer conversa futura sobre o tópico.
3. **Custo real, benefício não medido.** L2/L3 custam 1 chamada Haiku + N embeddings **por
   turno** e ~800–1500 tokens de contexto. O problema que resolveriam (lembrar o que o lead
   disse) é resolvido de graça pelo **histórico bruto**, uma vez corrigidos CR-1 e N4 — as
   conversas têm mediana muito abaixo de 20 mensagens e máximo de 45.
4. **A migration "aplicada mas inexistente" é sintoma, não causa.** Reaplicá-la sem descobrir
   *por que* os objetos sumiram é convidar a repetição. E o schema precisa mudar de qualquer
   forma (colunas de proveniência), então uma migration **nova** é mais honesta que re-executar
   a 012 — cuja versão já consta em `schema_migrations` e criaria conflito.

**O que fazer no lugar (memória em três peças, todas verificáveis):**

**Peça 1 — Fatos do lead, com proveniência (substitui L1).**
Nova migration, tabela `lead_facts` com o vocabulário fechado que já existe em
`memory-extraction.ts`, mais **quatro colunas que faltavam** e que são o ponto inteiro:

| coluna | por quê |
|---|---|
| `source_message_id` | de qual mensagem veio |
| `source_role` | **`'user'` obrigatório** — constraint `CHECK (source_role = 'user')` |
| `extractor` | `regex_v1` \| `tool_t9` \| `human` |
| `verbatim` | o trecho literal que sustenta o fato |

Um fato sem citação de mensagem do lead **não pode existir**. Isso torna a Sandra
estruturalmente impossível: a frase era da Nicole.

**Peça 2 — Briefing de sessão determinístico (substitui `ai_summary` no prompt).**
Renderizado por template a partir de: fatos ativos + appointment ativo (fonte:
`appointments`) + últimas N mensagens **com data** + tempo desde o último contato. Zero LLM,
zero possibilidade de inventar um agendamento. Exemplo:

```
CONTEXTO DO LEAD (gerado do sistema, não de resumo)
Nome: Sandra · Empreendimento: Vind · Último contato: há 9 dias (27/07)
Visita agendada: NENHUMA
Fatos declarados pelo lead: orçamento até R$ 400 mil (27/07)
ATENÇÃO: os itens acima com data antiga podem ter mudado. Não os afirme como atuais.
```

**Peça 3 — `ai_summary` continua existindo, mas sai do prompt da Nicole.**
Ele é útil para o **corretor humano** (é o que aparece no card do lead). Mantenha-o para a UI,
gerado por **um** escritor só (o cron), e **remova-o do contexto do modelo**. Se você quiser
mantê-lo no prompt, então ele precisa (i) vir rotulado como "resumo automático, não verificado",
(ii) ser proibido de conter afirmação de agenda (guardrail na geração), e (iii) ser gerado
apenas de mensagens `role='user'` + estado verificado.

**Ações imediatas (P0, independentes da decisão acima):**
- Desligar `processConversationTurn` e o bloco `lead_facts` de `pipeline.ts:1332-1366` — hoje
  gastam LLM e embeddings para gravar em tabelas que não existem.
- Corrigir a memória de projeto `project_nicole_memory_evolution.md`, que afirma "tabelas em
  produção". Está errada e vai enganar a próxima pessoa.

---

## 6. Como isto não se repete — observabilidade e fail-fast

Toda falha aqui foi **silenciosa**. Sete políticas, na ordem em que eu implementaria.

### P1 — "Vazio" e "erro" nunca podem ser a mesma coisa

Dois helpers, e uma auditoria dos 32 call sites:

```ts
mustQuery(q)  // lança em error; devolve data (pode ser [] legítimo)
tryQuery(q, { onError })  // só onde a degradação é decisão consciente e documentada
```

Reescrever com `mustQuery` (ou fail-closed explícito): `isSlotFree` (N8),
`loadConversationHistory`, `loadConversationState`, `loadAgentConfig`, `searchKnowledge` (N11),
`loadL1Snapshot`. Regra de código: **`if (error || !data) return <vazio>` é proibido** —
vira item de lint.

### P2 — `console.error` não é observabilidade

Nesta stack (Vercel serverless) ninguém lê `console.error`. Foi assim que 4 meses de MemPalace
passaram. Regra: em caminho de decisão, todo `catch` emite `PipelineEvent` tipado com
`level`, `event_type`, `lead_id` e incrementa contador. Um teste de CI que proíbe
`console.error` dentro de `catch` em `packages/ai/src`.

### P3 — Drift de schema detectado em CI **e** em produção

Um manifesto declarativo (`packages/ai/src/required-objects.json`) com as tabelas, colunas e
RPCs de que o código depende. Duas verificações:
- **CI:** roda contra o banco de dev; falha o build se faltar objeto.
- **Produção, diário:** `to_regclass` / `information_schema` para cada item + comparação com
  `supabase_migrations.schema_migrations`. Alerta **crítico** quando uma versão consta como
  aplicada e seus objetos não existem — exatamente o caso 012.

Custo: uma tarde. Teria detectado o CR-2 em 10/04/2026.

### P4 — Drift de configuração (o problema N1)

Job diário que:
- lista os slugs de `agent_prompts` e compara com os slugs que o código consome; emite
  `CONFIG_DEAD_KNOB` para `off-hours`, `handoff-summary`, `agent_config.personality_prompt`,
  `agent_config.guardrails`;
- gera um **diff código × banco** de cada prompt sobrescrito e o publica no relatório diário.
  Ninguém mais debuga o arquivo errado;
- alerta quando `agent_config.business_hours.always_on = true` e o prompt afirma um expediente
  (contradição estrutural, N12).

### P5 — Alertar no que **para** de acontecer

O sinal mais enganoso do dossiê foi *"zero eventos `NICOLE_SLOT_MISMATCH` em 7 dias"* — lido
como "está tudo bem", quando significava "a guarda está cega". Padrão a adotar: **todo guard
emite dois contadores**, `*_EVALUATED` e `*_VIOLATION`. Alerta quando `EVALUATED == 0` numa
janela em que houve tráfego. Vale para todos os guardrails da seção 3 e para as tools
("nenhuma chamada de `agendar_visita` em 24 h com 30 conversas em modo agendamento" é um
incidente).

### P6 — Reconciliação de resultado (fala × banco)

Job a cada 15 min: para toda mensagem `assistant` das últimas 2 h que case o padrão de
confirmação de visita, verificar se existe `appointment` do mesmo lead com
`scheduled_at` dentro de ±2 h da hora citada. Divergência → evento `error` + notificação ao
corretor + entrada em fila de revisão.
Sueli (03/08 21:53) e Valnira (04/08 00:10) teriam sido pegas em **≤ 15 minutos**, não no dia
seguinte pelo Marcos. É a rede de segurança que funciona mesmo quando um guardrail novo tem
buraco — e eu recomendo mantê-la **para sempre**, mesmo depois das tools.

### P7 — Conversa-canário em produção

A cada hora, um lead sintético percorre um roteiro fixo (interesse → dia → hora → remarcar →
cancelar) contra produção e afirma o estado esperado do banco a cada passo. Detecta regressão de
deploy em ≤ 1 h, sem depender de lead real.

### P8 — Lock por conversa (N9)

Um lock advisory por `conversation_id` (`pg_advisory_xact_lock(hashtext(conversation_id))`) ou
uma fila serializada por conversa no webhook, para eliminar as respostas duplicadas e a perda de
escrita de estado.

---

## 7. Priorização — (impacto × confiança) / esforço

Confiança = quão certo estou do diagnóstico (evidência direta em prod = alta).
Esforço em dias de dev.

### P0 — Fazer esta semana (impacto alto, confiança alta, esforço baixo)

| # | Ação | Evidência | Esforço | Fecha |
|---|---|---|---|---|
| 1 | **Limpar dados envenenados**: apagar `visit_pending_*` com data passada (**9 estados**) e `visit_availability` derivado de fala da Nicole (63 estados a auditar) | seção 1.4 | 2 h | leads em risco **agora** |
| 2 | **Remover `extractCollectedData(assistantMessage, …)`** (`pipeline.ts:995`) | N2 | 0,5 d + testes | a origem da Sandra, e 8 campos contaminados |
| 3 | **Alinhar o prompt de produção** com o código (ou desativar os overrides) — em especial `visit-scheduling` | N1 | 0,5 d | frase-molde de agenda + endereço do stand errado |
| 4 | **Corrigir a ordenação nos DOIS lugares** (`pipeline.ts:1440` e `enrich-leads/route.ts:68`): `ascending: false` + `.reverse()` | CR-1, N3 | 0,5 d | cegueira em 11% das conversas |
| 5 | **Timestamps no histórico** (`select("role, content, created_at")` + prefixo `[27/07 15:47]`) | N4 | 0,5 d | eco de dado velho como atual |
| 6 | **`enrich-leads` para de sobrescrever `collected_data`** (e nunca toca chaves de agenda) | N3 | 0,5 d | `visit_availability` sintético |
| 7 | **`isSlotFree` fail-closed** em erro de query | N8 | 1 h | overbooking silencioso |
| 8 | **Desligar MemPalace morto** (`processConversationTurn` + bloco `lead_facts`) | CR-2 | 1 h | custo desperdiçado por turno |
| 9 | **Corrigir `PROPERTY_KEYWORDS`**: tirar `churrasqueira` e `rooftop` do Yarden | N5 | 15 min | troca espúria de empreendimento |
| 10 | **`G5` (confirmação sem appointment) em shadow mode** | seção 3 | 1 d | mede antes de enforçar |

> Nota: o item 1 é o único que remedia um risco **em curso**. Faça primeiro.

### P1 — Próximas 2–3 semanas

| # | Ação | Esforço |
|---|---|---|
| 11 | Camada de guardrails completa (G1–G8), toda em shadow, com flag por categoria e circuit breaker | 4–5 d |
| 12 | Promover G1, G2, G4, G5, G6, G7 para fail-closed depois de 7 dias de medição | 1 d |
| 13 | Reconciliação fala × banco (P6) + alerta de guard cego (P5) | 2 d |
| 14 | Proveniência em `messages`: expor `role='broker'` ao contexto **etiquetado** e etiquetar transição/mídia como não-Nicole | 2 d |
| 15 | Drift de schema (P3) e de config (P4) | 2 d |
| 16 | Invariante cross-lead, camadas 2 e 1 (seção 4) | 2–3 d |
| 17 | Lock por conversa (P8) | 1 d |
| 18 | Fonte única de expediente (eliminar as três) | 1 d |

### P2 — 4–6 semanas

| # | Ação | Esforço |
|---|---|---|
| 19 | Tools T1–T4 (agendar/remarcar/cancelar/consultar_agenda) com `tool_choice` dirigido por estado | 5–8 d |
| 20 | Tool T6 (`enviar_material`) substituindo `reconcile*` | 3 d |
| 21 | Tool T9 (`registrar_dado_do_lead`) com validação de citação | 3 d |
| 22 | Compensação de latência no `typing-delay` | 0,5 d |
| 23 | `scopedClient` (camada 3) | 3 d |
| 24 | Conversa-canário (P7) | 2 d |

### P3 — depois

| # | Ação |
|---|---|
| 25 | Memória estruturada com proveniência (seção 5, peças 1–3) |
| 26 | Tool T5 (`consultar_empreendimento`) + G9 (claim check) com juiz LLM amostrado |
| 27 | Experimento `temperature` 0.7 → 0.4 com o golden set |

### Experimentos baratos que valem a pena isoladamente

- **`temperature: 0.70 → 0.40`** (mudança de 1 valor no banco): pode reduzir variância de
  aderência a regra. **Não tenho medição** — trate como hipótese a testar com o golden set,
  não como recomendação.
- **`max_tokens: 1024`**: respostas da Orlice foram longas com markdown; o teto não é o
  problema, o prompt de produção é. Deixe como está até medir.

---

## 8. O que eu **não** consegui verificar

Sou explícito porque a instrução foi "não pode haver erros" — estas são as bordas da análise:

1. **Não confirmei que o deploy em produção é o `HEAD` de `main`.** As stories 75-268 e 75-270
   estão em `main` (commits `e2757d91`, `442c296a`), mas não há verificação de versão em
   runtime. É possível que produção rode outra coisa. **Verificar antes de qualquer conclusão
   sobre "isso já está corrigido".**
2. **Não medi latência Vercel(`gru1`) → Supabase.** O orçamento de latência da seção 2.2 assume
   50–150 ms por query. Se a latência real for muito maior, o cálculo muda (mas o argumento do
   `typing-delay` continua valendo).
3. **Não reproduzi o pipeline localmente.** Toda a análise é leitura estática de código +
   dados de produção + reconstrução de cadeia causal. A cadeia da Sandra (seção 1.4) é
   consistente com todas as evidências, mas é **reconstrução**, não execução instrumentada.
   Um teste que a reproduza deve ser o primeiro artefato do P0.
4. **Não sei se o `visit_pending_date` da Sandra foi gravado no turno que reconstruí** — não há
   log de escrita de `collected_data`. É a única hipótese consistente com os dados, mas não é
   observação direta. (Isto por si só é um argumento para P2/P5.)
5. **Não confirmei quem editou `agent_prompts` nem se existe processo.** `visit-scheduling` foi
   alterado em 2026-08-04 17:28 UTC. Vale descobrir por quem e por quê antes de sobrescrever.
6. **Não quantifiquei o desperdício financeiro** do MemPalace morto (Haiku + embeddings por
   turno há ~4 meses). Os dados de billing existem (`/api/cron/billing-collect-anthropic`) mas
   não consegui isolar a parcela.
7. **Não medi a taxa de falso positivo de nenhum guardrail proposto.** Por isso todos nascem em
   shadow mode. Qualquer número que eu desse aqui seria invenção.
8. **Não auditei `packages/web` inteiro** para o invariante cross-lead — só `packages/ai` (32
   call sites) e os arquivos que tocam o pipeline. A camada 1 da seção 4 deve rodar sobre os
   dois.
9. **Não sei se algum consumidor depende do comportamento atual** de `extractCollectedData`
   sobre a fala da Nicole (item 2 do P0). O score de qualificação vai **cair** para muitos leads
   quando isso for removido — o que é correto, mas vai mexer em dashboards e na roleta. Avise o
   Marcos antes.
10. **A conversa da Orlice foi lida truncada** (220 chars por mensagem). Li o suficiente para o
    diagnóstico, mas não a íntegra.

---

## 9. Referências

**Primárias (código e banco deste repositório):** `packages/ai/src/chat/pipeline.ts`,
`packages/ai/src/flows/{qualification,visit-slot,identify-property,lead-memory,memory-extraction,haiku-enrichment}.ts`,
`packages/ai/src/memory/{loader,writer}.ts`, `packages/ai/src/prompts/*.ts`,
`packages/ai/src/rag/search.ts`, `packages/web/src/app/api/webhook/whatsapp/route.ts`,
`packages/web/src/app/api/cron/{enrich-leads,followup}/route.ts`,
`packages/web/src/lib/ai/send-library-media.ts`, `packages/web/src/lib/whatsapp/typing-delay.ts`,
`packages/web/vercel.json`; banco de produção `dsopqkqjkmhytudaaolv`
(tabelas `messages`, `conversation_state`, `leads`, `agent_prompts`, `agent_config`,
`properties`, `typologies`, `system_events`).

**Externas:**

- [Writing effective tools for AI agents — Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents) — consolidação de tools, identificadores semânticos, erros estruturados
- [Reduce hallucinations — Claude Docs](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) — permitir "não sei", quote grounding, verificação com retratação
- [Tool use overview — Claude Docs](https://platform.claude.com/docs/en/docs/build-with-claude/tool-use/overview) — `tool_choice` (`auto`/`any`/`tool`/`none`), `disable_parallel_tool_use`, `strict`, custo em tokens
- [AgentLTL: trace verification for tool-using agents (arXiv 2607.02599)](https://arxiv.org/pdf/2607.02599) — grounding como restrição de traço: toda entidade da resposta deve aparecer numa saída de tool
- [AgentProp-Bench (arXiv 2604.16706)](https://arxiv.org/html/2604.16706v1) — modos de falha específicos de agentes: fabricação de parâmetro, má interpretação de tool output, corrupção de memória entre turnos
- [Hallucination detection in production AI agents — Noveum](https://noveum.ai/en/blog/hallucination-detection-production-ai-agents) — abordagem em camadas, escalonamento seletivo
- [Best hallucination detection tools 2026 — Braintrust](https://www.braintrust.dev/articles/best-hallucination-detection-tools-2026) — checagens baratas em 100% do tráfego, juiz caro só no subconjunto sinalizado
- [LLM Guardrails: why most fail in production — Genta](https://genta.dev/resources/llm-guardrails-production-guide) — fail-open vs fail-closed: "o guardrail que falha aberto não é um guardrail"
- [Latency budgets for real-time voice — The Prompt Bench](https://thepromptbench.com/voice-and-realtime/latency-budgets-for-realtime-voice/) e [Production voice AI latency — Prodinit](https://prodinit.com/blog/production-voice-ai-agents-latency-architecture) — referência de orçamento de latência (p50 < 400 ms em voz) usada como contraste com o WhatsApp assíncrono

---

*— Atlas, investigando a verdade* 🔎
