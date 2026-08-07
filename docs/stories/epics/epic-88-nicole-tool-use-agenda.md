---
epic: 88
title: Nicole — Tool use na agenda (a fala e a linha no banco viram o mesmo evento)
status: Draft
created_at: 2026-08-06
updated_at: 2026-08-06
created_by: Morgan (@pm)
priority: P0 (defeito reincidente em produção, com lead pago)
pedido_original: >
  Gabriel, 06/08/2026 — "fazer essa parte de chamada de tools de maneira sênior,
  garantindo que vai funcionar quando precisar". Motivo dado: "agenda mesmo às vezes
  não está funcionando".
origem:
  - Incidentes de agenda 24/07 → 06/08 — Silvana, Sandra, Sueli, Valnira, Maria Oliveira
  - docs/architecture/2026-08-05-validacao-epic-87.md §5 (@architect REPROVOU a tool como desenhada no Epic 87 W4-1)
  - docs/research/2026-08-05-nicole-anti-alucinacao/analise-tecnica.md §2 (@analyst — 7 tools, tool_choice por estado)
  - docs/stories/75-279-nicole-grafia-hora-nao-agendou.story.md (fix de 06/08, InReview)
  - Inventário de contexto da Nicole (05/08), verificado contra código e banco de produção
substitui:
  - Epic 87 · W4-1 ("Tool de agenda") — item REPROVADO pelo @architect. Este epic é a
    resposta ao veto, com a fronteira redesenhada. W4-1 sai do Epic 87.
depends_on:
  - Epic 87 · W0-0 (paridade `agent_prompts` × código) — **BLOQUEANTE**, ver §8
  - Epic 87 · W1-2b (estado de agenda com âncora, sem derivação da fala da Nicole) — **BLOQUEANTE**, ver §8
  - Story 75-279 (InReview) — `detectAffirmedSlot`, `stripSystemBlocks`, `NICOLE_SLOT_UNAUTHORIZED`,
    `__fixtures__/fake-supabase.ts`, `pipeline-scheduling.test.ts` são a base deste epic
related:
  - packages/ai/src/chat/pipeline.ts (1.947 linhas — `processMessage`)
  - packages/ai/src/flows/visit-slot.ts (569 linhas — `evaluateSlot`, `isSlotFree`, `checkSlotAvailability`, `freeSlotsInPeriod`, `closeHourFor`)
  - packages/ai/src/chat/__fixtures__/fake-supabase.ts · pipeline-scheduling.test.ts
  - packages/web/src/lib/whatsapp/typing-delay.ts (`calculateTypingDelay` — 800–1200ms + 25ms/char, teto 3s)
  - packages/web/src/app/api/webhook/whatsapp/route.ts (transcrição de áudio vira `content` da mensagem)
stories_planned: []
stories_added: []
stories_done: []
---

# Epic 88 — Nicole: tool use na agenda

> **Numeração.** Maior epic em uso: **87** (`epic-87-nicole-confiabilidade-contexto.md`), maior
> prefixo de story em uso: **87**. Este epic assume **88**. Itens numerados `88-N` já com a
> sugestão de ID de story; decisão final é do @sm.

---

## 1. O pedido, e a evidência que o sustenta

O Gabriel pediu tool use "de maneira sênior, garantindo que vai funcionar quando precisar", e deu
o motivo: **"agenda mesmo às vezes não está funcionando"**. Ele não pediu arquitetura — pediu que
a visita exista quando a Nicole diz que existe.

**Estado verificado hoje: não existe tool use nenhum.** A chamada em `pipeline.ts:935` passa
`model`, `max_tokens`, `temperature`, `system`, `messages`. Sem `tools`, sem `tool_choice`. Zero
ocorrências de `tool_use`/`tool_result` no pacote. Tudo é texto pré-injetado no system prompt.

### Os incidentes de agenda, em 14 dias

| Data | Lead | O que aconteceu | Onde quebrou |
|---|---|---|---|
| 24/07 | Silvana | "As 9hs" não virou hora · sem `appointment` · hoje em **Perdido** | parser (`visit-slot.ts`) |
| 27/07 → 05/08 | Sandra | Estado guardou a fala da própria Nicole; 9 dias depois o sistema afirmou "sábado dia 8" e ela confirmou | estado (`collected_data`) |
| 03/08 | Sueli | "Umas 14" não virou hora · "sexta às 14h fica fora do horário — mas às 14h estamos disponíveis" · visita criada à mão no dia seguinte | parser + fala |
| 04/08 | Valnira | Confirmou "quinta às 10h" e perguntou o horário 1 minuto depois · sem `appointment` | fala × banco |
| 06/08 | Maria Oliveira | "As 11hrs" não virou hora · a Nicole **inventou** um bloco `[SISTEMA: … LIVRE]`, respondeu "LIVRE" a si mesma e confirmou · sem `appointment` | parser + fala |

**Cada correção foi no parser de linguagem natural: mais um sufixo, mais uma grafia.** A 75-268
ensinou o número pelado ("as 10"). A 75-279, hoje de manhã, ensinou `hrs`/`hs`/`hr` colados.
Amanhã aparece "onze horas", "11 e meia", "meio-dia e meia", "quinta que vem".

### O padrão, nomeado

Hoje o sistema tem **duas autoridades sobre o mesmo fato, e elas divergem**:

- **A fala** — o modelo, que entende "As 11hrs" perfeitamente e diz "te espero sábado às 11h".
- **A escrita** — um bloco de código separado (`pipeline.ts:1236`), condicionado a
  `bookableSlotUtc`, que só é setado se o **regex** entendeu.

Quando o regex não entende e o modelo entende, a Nicole promete e o banco não registra. O lead
aparece no stand para uma visita que não existe. **Isso não é um defeito de regex. É um defeito
de arquitetura: quem entende não tem a caneta, e quem tem a caneta não entende.**

A prova está no número que a 75-279 mediu: `appointments` com `created_by='nicole'` = **6 no
total do projeto**, contra ~12 confirmações de visita na conversa desde 10/06. **Cerca de 1 em
cada 3 "visitas confirmadas" pela Nicole vira linha no banco.**

---

## 2. A decisão central, defendida

> **Tool use × grounding determinístico × híbrido.**
> **Decisão: híbrido, com fronteira única e explícita — o determinismo mantém a LEITURA, a tool
> assume a ESCRITA.**

### 2.1 A arbitragem entre @architect e @analyst

O @architect reprovou a tool (validação §5.1) com este argumento:

> *"Tool use conserta 'o modelo afirma um fato que não está no contexto'. Os incidentes são 'o
> contexto contém um fato falso e o modelo o repete fielmente'."*

**Ele está certo sobre a Sandra e errado sobre os outros quatro.** A Sandra é o modo de falha
"contexto envenenado" — e para ele a tool não ajuda mesmo. Mas Maria Oliveira, Sueli, Valnira e
Silvana são o modo **inverso**: o contexto estava certo (no caso da Maria, o bloco `[SISTEMA]`
dizia literalmente *"NÃO afirme nenhum horário"*) e o modelo afirmou assim mesmo, porque **ele
entendeu o que o parser não entendeu e não tinha como registrar isso**. Quatro dos cinco
incidentes de agenda das últimas duas semanas são desta classe.

A frase que resolve a divergência não é "grounding" nem "atomicidade" — é mais estreita:

> **Hoje a compreensão superior do modelo é um passivo, porque compreensão sem autoridade de
> escrita produz mentira. A tool converte compreensão em escrita autorizada.**

O @analyst chegou perto disso ao dizer que o argumento é atomicidade (§2.1c). Atomicidade é a
consequência; a causa é a assimetria de competência entre o regex e o modelo na leitura de
linguagem natural — que é exatamente a competência que o modelo tem e o regex não vai ter nunca,
por mais sufixos que a gente adicione.

### 2.2 Por que **não** é tool use completo

Onde o @architect está inteiramente certo, e este epic obedece:

1. **Não trocar decisão determinística por decisão do modelo.** Quem decide se o horário está
   livre, se está dentro do expediente, se já existe visita — continua sendo código
   (`evaluateSlot`, `isSlotFree`, `closeHourFor`). O modelo **nunca** recebe permissão de opinar
   sobre disponibilidade. Ele só diz *o que o cliente quis dizer*.
2. **Nada de duas autoridades coexistindo.** A condição mínima que ele impôs — *"a lógica de
   636–869 removida no mesmo PR, não coexistindo"* — é aceita e virou o item 88-9. O ramo
   `day && time` que hoje seta `bookableSlotUtc` **sai** quando a tool entra.
3. **Nada antes do harness, e `content[0]` é bomba armada.** Aceito integralmente, e virou o
   primeiro item do epic (88-1), **antes de qualquer tool existir**.
4. **Grounding determinístico continua** — o pré-fetch do bloco `[SISTEMA]` não é substituído por
   uma tool de leitura. `consultar_agenda` fica **fora da v1** (§9).

### 2.3 A fronteira, em uma tabela

Uma pergunta, uma autoridade. Este é o desenho inteiro do epic:

| Pergunta | Quem responde | Determinístico? |
|---|---|---|
| Estamos falando de agendar? | pipeline — gate `isVisitSchedulingMode`, **turn-local** (§4.1) | sim |
| Que dia e hora o cliente quis dizer? | **modelo**, via argumentos da tool | não — e é o único ponto onde não é |
| O cliente realmente disse isso? | executor — casa `citacao_do_cliente` contra mensagens `role='user'` | sim |
| Esse horário é válido / está livre? | executor — `evaluateSlot` + `isSlotFree` + `closeHourFor` | sim |
| A visita existe? | **o INSERT é o próprio `tool_result`** — não há outro caminho | sim |
| O que a Nicole fala? | modelo, restrito ao `status` que o `tool_result` devolveu | não |

O parser **não morre**: ele é rebaixado de *decisor do slot* para *detector de estado*. Continua
respondendo "estamos em modo agendamento?" — uma pergunta binária grosseira, onde ele é bom.
Perde a pergunta "que horas são 11hrs?" — onde ele falhou cinco vezes.

### 2.4 O que este epic **não** resolve — e quem resolve

Sejamos honestos, porque metade dos incidentes não é desta classe:

| Incidente | Este epic fecha? |
|---|---|
| Maria Oliveira — "As 11hrs" não agendou | **Sim** — o modelo entende, a tool grava |
| Silvana — "As 9hs" não agendou | **Sim** |
| Sueli — "Umas 14" + confirmação sem linha | **Sim** — atomicidade |
| Valnira — confirmou e não gravou | **Sim** |
| Sueli — "sexta às 14h está fora do horário… mas às 14h estamos disponíveis" | **Parcial** — o `tool_result` traz o expediente como fato estruturado; a contradição na mesma frase é guardrail de saída (Epic 87 · W3) |
| **Sandra — contexto envenenado afirmando "sábado dia 8"** | **Não sozinho.** Depende do Epic 87 · W1-2b. Ver §8 — e a `citacao_do_cliente` é a ponte |

A `citacao_do_cliente` merece destaque, porque é onde este epic toca o caso Sandra: o executor
**valida deterministicamente** que o trecho citado existe numa mensagem `role='user'` daquela
conversa. A Nicole não conseguiria citar a Sandra dizendo "sábado" — ela nunca disse; a frase era
da própria Nicole. **A tool recusaria.** É o único mecanismo deste epic que ataca o modo de falha
que o @architect levantou, e por isso ele é obrigatório, não opcional.

---

## 3. Catálogo de tools da v1

Três tools, todas de **escrita**, todas chamando o mesmo executor. Nenhuma tool de leitura.

| # | Tool | Argumentos | Fonte da verdade |
|---|---|---|---|
| **T1** | `agendar_visita` | `dia` (ISO), `hora` (HH:MM), `citacao_do_cliente` | `appointments` + `closeHourFor` |
| **T2** | `remarcar_visita` | `novo_dia`, `nova_hora`, `citacao_do_cliente` | idem, com `excludeAppointmentId` |
| **T3** | `cancelar_visita` | `citacao_do_cliente` | idem |

**T2 e T3 entram na v1 junto com T1, de propósito.** Deixá-las no caminho antigo recriaria a
divergência fala × banco em remarcação — "mudei para quinta" sem mover a linha é a mesma classe
de dano, e o executor é o mesmo. Separá-las custaria uma segunda onda inteira de rollout.

**Contrato universal, inegociável** (herdado da recomendação do @analyst): nenhuma tool devolve
vazio ambíguo. Todo retorno tem `status` explícito e uma `instrucao` do que a Nicole pode dizer.
**Erro de infraestrutura nunca vira "não encontrei"** — vira `status: "indisponivel"` com
instrução de não afirmar nada. Hoje `isSlotFree` (`visit-slot.ts:465`) descarta o `error` e
devolve `!data` — timeout do Postgres vira "horário livre" e a Nicole confirma por cima de outra
visita. Isso é corrigido no item 88-4, **antes** de a tool existir.

Uma vantagem lateral que vale registrar: **a descrição de uma tool vive em código, não em
`agent_prompts`.** O painel não pode sobrescrevê-la em silêncio — que é exatamente o que
aconteceu com o `visit-scheduling`, hoje divergente em produção.

---

## 4. "Garantir que vai funcionar quando precisar"

Foi o pedido literal. Um caminho que dependa de o modelo **lembrar** de chamar a tool não atende
o pedido. Quatro mecanismos, nesta ordem.

### 4.1 Forçar — `tool_choice` dirigido por estado

Quando o gate de agendamento está aberto **e a mensagem do lead neste turno contém expressão
temporal**, a chamada vai com `tool_choice: {"type":"tool","name":"agendar_visita"}`. Não é
sugestão: a API não deixa o modelo responder texto sem chamar a tool. Fora disso, `auto`.
Sempre `disable_parallel_tool_use: true` — no máximo uma tool por turno.

> **O modo de falha que o forçamento CRIA, e que precisa estar escrito antes de alguém
> implementar:** `tool_choice` forçado herda a qualidade do gatilho. Se o gatilho abrir num turno
> em que o lead não falou de agenda (que é exatamente o bug da Sandra — o gate abriu por
> `visit_availability` derivado da fala da própria Nicole), o modelo é **obrigado** a chamar a
> tool e vai **fabricar** os argumentos, inclusive a citação, para satisfazer o campo obrigatório.
> Forçar sobre um gatilho envenenado troca "não agenda" por "agenda errado", que é pior.
>
> **Por isso o gatilho do forçamento é turn-local:** deriva da mensagem do lead **neste turno**,
> nunca de `visit_availability` ou `visit_pending_*`. E por isso o Epic 87 · W1-2b é bloqueante.
> A citação validada é a segunda barreira: fabricou, não casa, recusa.

### 4.2 Falhar — o que acontece quando a tool não responde

| Falha | Comportamento | Por quê |
|---|---|---|
| Executor excede **1.500 ms** | Devolve `tool_result` sintético `status:"indisponivel"` e segue para o turno 2 | O loop nunca fica pendurado; o teto do turno é previsível |
| Erro de banco no `isSlotFree` | `status:"indisponivel"` (**fail-closed**) — nunca "livre" | Hoje é fail-open e vira overbooking silencioso |
| Citação não casa | `status:"citacao_nao_encontrada"` + instrução de **perguntar de novo** | Barreira contra argumento fabricado |
| Já existe visita do lead | `status:"ja_existe_visita"` + instrução de usar `remarcar_visita` | Idempotência semântica |
| Chamada duplicada (webhook concorrente) | Executor deduplica por `lead_id` + `scheduled_at`; devolve o mesmo `status:"agendada"` | Existe race documentada de webhooks (duas respostas no mesmo segundo, 27/07) |
| **Turno 2 (resposta final) falha ou estoura o timeout** | O `appointment` **permanece gravado**; emite `NICOLE_TOOL_ORPHAN_APPOINTMENT` (level error) + notifica o corretor + envia a fala de reserva neutra | Ver D88-2 — é uma decisão do Gabriel, com trade-off |

A escolha do último caso é deliberada e é a inversão do dano atual: hoje falha para o lado
"o lead acredita e não existe" (ninguém sabe). Passaria a falhar para o lado "existe e o lead não
foi confirmado" — recuperável com um telefonema, e o corretor **já é notificado** hoje pelo
caminho `APPOINTMENT_CREATED`.

### 4.3 Saber — como o sistema descobre que ela foi (ou não foi) chamada

O sinal mais enganoso deste projeto foi *"zero eventos `NICOLE_SLOT_MISMATCH` em 7 dias"*, lido
como "está tudo bem" quando significava "a guarda está cega". A regra que sai disso:

**Todo mecanismo emite dois contadores: o que foi avaliado e o que disparou.**

| Evento | Quando |
|---|---|
| `NICOLE_TOOL_EXPECTED` | O gate turn-local abriu e `tool_choice` foi forçado |
| `NICOLE_TOOL_CALL` | O modelo emitiu `tool_use` — com nome, argumentos e `latency_ms` |
| `NICOLE_TOOL_RESULT` | O executor respondeu — com `status` |
| `NICOLE_TOOL_REFUSED` | `status` de recusa, com o motivo |
| `NICOLE_TOOL_ORPHAN_APPOINTMENT` | Visita gravada sem fala final entregue |

**Alerta de cegueira:** `EXPECTED > 0` e `CALL == 0` na mesma janela é **incidente**, não silêncio.
Com `tool_choice` forçado isso deve ser estruturalmente impossível — se acontecer, é bug de
implementação nossa, e é exatamente a coisa que ninguém descobre por semanas.

### 4.4 Provar — a rede que fica depois

- **Harness afirmando sobre a ENTRADA do modelo.** A correção mais importante da validação do
  @architect (§1.3): capturar o `MessageCreateParams` passado a `messages.create` e afirmar sobre
  `tools` e `tool_choice`, não só sobre a saída. O `pipeline-scheduling.test.ts` da 75-279 já
  captura o efeito colateral (INSERT real contra o `fake-supabase`); falta o lado da entrada.
- **Golden set de agenda.** Cada incidente vira fixture: "As 11hrs", "As 9hs", "Umas 14",
  "Sexta a tarde", "quinta as 10", e a cadeia 27/07→05/08 da Sandra atravessando duas sessões.
  Regra da casa, e a 75-279 já a praticou: **o teste tem de ficar vermelho antes** — um harness
  que passa pelo motivo errado é pior que nenhum.
- **`NICOLE_SLOT_UNAUTHORIZED` vira a prova.** O evento nasceu ontem (75-279, AC4) e mede
  exatamente o defeito: a Nicole afirmou dia+hora e nada foi autorizado. Depois deste epic, ele
  deve tender a zero — e ele tem volume, ao contrário de `appointments`.

---

## 5. Modos de falha que este epic cria

Um epic que só descreve o caminho feliz não atende ao pedido. Estes são os riscos **novos**,
introduzidos pela mudança — distintos dos riscos que já existem.

| # | Modo de falha novo | Sev | Mitigação |
|---|---|---|---|
| **F-1** | `content[0]` deixa de ser `text` quando há `tool_use` → `assistantMessage` vira `""` **em silêncio**, e ~470 linhas a jusante degradam sem erro (`detectSlotMismatch`, `stripSystemBlocks`, `extractCollectedData`, `saveMessages`, handoff) | **Crítica** | Item **88-1**, primeiro do epic, **antes de qualquer tool**: extração percorre `content` inteiro + evento `NICOLE_EMPTY_TEXT_RESPONSE` fail-loud + teste que injeta `tool_use` na posição 0 |
| **F-2** | Forçamento sobre gatilho envenenado → argumento e citação **fabricados** (§4.1) | **Alta** | Gate turn-local + citação validada + dependência bloqueante do Epic 87 · W1-2b |
| **F-3** | Duas autoridades convivendo: o ramo `day && time` do parser continua setando `bookableSlotUtc` enquanto a tool também grava → visita dupla ou divergente | **Alta** | Item **88-9** remove o ramo **no mesmo PR** que liga a tool. Condição do @architect, aceita |
| **F-4** | Citação com falso negativo: acento, erro de digitação, transcrição de áudio, paráfrase do modelo → recusa de agendamento **legítimo** | **Alta** | Normalização (acento/caixa/pontuação) + casamento por trecho contra **todas** as mensagens `role='user'` da conversa, não só a do turno · taxa de casamento medida em shadow **antes** de recusar valer |
| **F-5** | Latência percebida sobe e o lead sai da conversa | **Média** | Compensação no `typing-delay` (§6.3) + medição em `whatsapp_async_done`, não em `CLAUDE_RESPONSE` (D88-3) |
| **F-6** | Cache de prompt invalidado a cada mudança de schema de tool | **Baixa** | Ordem do prefixo cacheável é `tools → system → messages`: muda **uma vez** por deploy que altere o schema; a 2ª chamada do loop **acerta** o cache. Não é argumento contra |
| **F-7** | `visit-scheduling` de produção manda a Nicole dizer *"Agendei sua visita para [dia] as [horario]"* sem passar por lugar nenhum — com a tool, isso vira instrução para mentir | **Alta** | Epic 87 · W0-0 é **bloqueante**. Sem paridade, a instrução em produção contradiz a tool |
| **F-8** | Áudio sem transcrição → sem citação possível → lead que só manda áudio não consegue agendar | **Baixa** | Verificado: a transcrição **vira o `content`** da mensagem (`whatsapp/route.ts:647`), então a citação funciona. Sem transcrição, o webhook já responde pedindo texto |

---

## 6. Migração segura com a Nicole no ar

Ela atende lead pago **agora**. Nada aqui vai a produção em regime de "liga e observa".

### 6.1 Quatro ondas, e a regra de corte de cada uma

#### Onda 0 — Tornar o pipeline tool-aware **sem nenhuma tool** (zero mudança de comportamento)

> Regra de corte: nenhum item desta onda pode alterar uma única resposta da Nicole.

| ID | Item | Esforço | Risco | Executor |
|---|---|---|---|---|
| **88-1** | Extração de texto percorre `content` inteiro; resposta sem bloco de texto emite `NICOLE_EMPTY_TEXT_RESPONSE` e cai na fala de reserva. Teste injeta `tool_use` na posição 0 | S | Nenhum | @dev |
| **88-2** | Harness afirma sobre a **entrada** do modelo: captura `MessageCreateParams` e permite asserção sobre `system`, `messages`, `tools`, `tool_choice`. Estende `pipeline-scheduling.test.ts` | M | Nenhum (test-only) | @dev + @qa |
| **88-3** | Instrumentar o funil de agenda de hoje: `NICOLE_SCHEDULING_MODE_ON`, `NICOLE_SLOT_RESOLVED`, `NICOLE_SLOT_UNRESOLVED` (gate aberto + mensagem com dígito ou dia da semana + parser não resolveu), `APPOINTMENT_INSERT_ATTEMPTED`. **Baseline** | S | Nenhum (só log) | @dev |
| **88-4** | Flag tri-estado `nicole_tool_agenda = off \| shadow \| enforce` em **`agent_config`** (banco, lido por turno), não em env. Verificada **por efeito** em produção | S | Baixo | @dev + @devops |

**88-3 é a métrica do pedido do Gabriel.** `NICOLE_SLOT_UNRESOLVED` conta, com volume de turno,
quantas vezes "a agenda não está funcionando". Hoje esse número não existe.

**88-4 — por que banco e não env.** Env do Vercel só vale após `vercel redeploy`; e o webhook da
Nicole roda no projeto `prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c` (freelans), **não** no projeto apontado
por `.vercel/project.json` deste repositório. Flag em `agent_config` (já lido a cada turno) dá
rollback instantâneo, sem deploy e sem o gotcha do `vercel env add` gravando vazio. A AC é de
**efeito**, não de existência: virar a flag, mandar mensagem real, provar a mudança, voltar.

#### Onda 1 — Autoridade de escrita única, ainda sem modelo

| ID | Item | Esforço | Risco | Executor |
|---|---|---|---|---|
| **88-5** | Extrair `bookVisit()` / `rescheduleVisit()` / `cancelVisit()` — **executor único**: valida expediente, disponibilidade (`isSlotFree` **fail-closed**), idempotência, faz o INSERT e notifica. O pipeline atual passa a chamá-lo no ramo `day && time`. Comportamento idêntico, exceto fail-closed | M | Médio | @dev |
| **88-6** | Validador de citação (`quoteMatchesLeadMessage`) com normalização, **em shadow**: loga casamento/não-casamento, não recusa nada ainda | S | Nenhum | @dev |

Sequência deliberada: **a caneta única existe antes de o modelo poder alcançá-la.** Quando a tool
chegar, ela não inventa caminho de escrita — chama o mesmo executor que já está em produção e
observado. E o item 88-6 mede o falso negativo da citação (F-4) semanas antes de ele poder
recusar um agendamento de verdade.

#### Onda 2 — Shadow: a tool roda, e não escreve

| ID | Item | Esforço | Risco | Executor |
|---|---|---|---|---|
| **88-7** | Definição de T1/T2/T3 + segunda chamada em **shadow**, disparada **depois** de a resposta real ser enviada (fire-and-forget), com `tool_choice` forçado pelo gate turn-local | L | Baixo | @dev + @architect |
| **88-8** | Comparador e relatório: concordância tool × parser, taxa de citação válida, latência **real** do loop medida em produção, `EXPECTED` vs `CALL` | M | Nenhum | @qa + @data-engineer |

**Esta é a onda que responde "vai funcionar quando precisar?" com dado, não com opinião.** O
shadow custa uma chamada extra de modelo nos turnos de agendamento, **zero latência percebida**
(roda após o envio) e produz, em 7 dias, a resposta para: em quantos turnos o modelo resolveu o
slot que o parser não resolveu, e em quantos ele discordou do parser quando o parser acertou.
Cada discordância vai para revisão manual — n pequeno é aceitável para julgamento qualitativo.

**Critério de saída da Onda 2 (todos):**
1. `EXPECTED == CALL` em 100% dos turnos forçados (qualquer desvio é bug nosso).
2. Discordância tool × parser revisada uma a uma, com a tool certa em **≥ 95%** das divergências.
3. Citação válida em **≥ 95%** das chamadas cuja intenção humana foi julgada legítima (mede F-4).
4. p95 do loop completo medido, dentro do teto de D88-3.
5. Golden set 100% verde, com vermelho comprovado antes.

#### Onda 3 — Enforce, com rollout progressivo

| ID | Item | Esforço | Risco | Executor |
|---|---|---|---|---|
| **88-9** | Liga o loop; **remove no mesmo PR** o ramo do parser que setava `bookableSlotUtc`; `tool_choice` forçado; compensação no `typing-delay` | L | **Alto** | @dev + @architect |
| **88-10** | Rollout: canário (números internos) → 10% dos turnos de agendamento → 100%, com gatilhos de rollback escritos antes de cada degrau | M | Alto | @devops + @qa |
| **88-11** | `NICOLE_SLOT_UNAUTHORIZED` promovido a **fail-closed apenas na classe agenda**: regenera 1× e, persistindo, usa fala de reserva neutra (o padrão `SANITIZED_EMPTY_FALLBACK` da 75-279) | M | Alto (D88-4) | @dev + @qa |

### 6.2 Rollback — explícito e verificável

| Camada | Mecanismo | Tempo |
|---|---|---|
| Desligar a tool | `agent_config.nicole_tool_agenda = 'off'` | **segundos**, sem deploy |
| Voltar para observação | `= 'shadow'` | segundos |
| Reverter código | revert do PR do 88-9 (o ramo do parser volta junto — mesmo PR, por isso é atômico) | minutos |
| Parar a Nicole | kill switch do Epic 87 · W0-4 | segundos |

**Gatilhos de rollback automático, escritos antes do deploy:** qualquer `NICOLE_TOOL_ORPHAN_APPOINTMENT`
· `EXPECTED > 0` com `CALL == 0` · taxa de recusa por citação acima do medido em shadow + 5 p.p.
· p95 percebido acima do teto de D88-3 por 1 hora · qualquer visita duplicada.

### 6.3 Latência — a arbitragem, com número

O @architect mediu `CLAUDE_RESPONSE` p50 2.950 ms / p95 5.756 ms e concluiu que o loop viola o
teto do D6 (p95 + 30%). O @analyst respondeu que o produto já injeta 800–1.200 ms + 25 ms/char
(teto 3 s) de atraso artificial em `calculateTypingDelay`, e que o round-trip cabe nessa folga.

**Os dois medem coisas diferentes, e a métrica de produto é a do @analyst.** O que decide se o
lead sai da conversa é o tempo entre a mensagem dele e a resposta chegar — não o tempo da chamada
ao modelo. Três consequências concretas:

1. **O teto do D6 é redefinido sobre `whatsapp_async_done` (turno percebido), não sobre
   `CLAUDE_RESPONSE`.** Medir o componente errado autoriza a decisão errada nos dois sentidos.
2. **A compensação no `typing-delay` é obrigatória e vai no mesmo item (88-9):**
   `delay = max(0, delayDesejado − tempoJáGasto)`. Sem ela, o argumento do @analyst não se
   sustenta — ele depende de uma mudança que ainda não existe.
3. **O loop só ocorre em turno de agendamento**, e o turno 1 forçado produz só o bloco `tool_use`
   (dezenas de tokens), não uma resposta completa. O custo não é "dobrar todo turno".

O que ainda **não** sabemos e a Onda 2 mede: a fração de turnos que entram em modo agendamento
(sem isso, "o loop é minoria" é hipótese) e a latência real Vercel `gru1` → Supabase, que o
@analyst declarou explicitamente não ter medido.

---

## 7. Critérios de sucesso medíveis

O @architect levantou a ressalva certa: `appointments` com `created_by='nicole'` são **6 no total,
1 em 7 dias**. Qualquer métrica de contagem de agendamento tem n baixo demais para conclusão em
14 dias. A resposta são **taxas** e **proxies com volume de turno**, mais um indicador que fica
pronto antes do deploy.

| # | Métrica | Instrumento | Volume | Alvo |
|---|---|---|---|---|
| **PM1** | **Golden set de agenda** — os 6 incidentes reencenados | Suíte (88-2) | n = fixtures, disponível **antes** do deploy | 100% verde, com vermelho comprovado antes |
| **PM2** | **Lastro da confirmação** = confirmações de visita com `appointment` em ±30 min ÷ total de confirmações | Job de reconciliação fala × banco | ~12 confirmações desde 10/06 | Baseline ≈ **50%** (6 de ~12) → **≥ 95%** |
| **PM3** | **`NICOLE_SLOT_UNRESOLVED`** — gate aberto, lead falou de hora, parser não resolveu | `system_events` (88-3) | por turno — o maior denominador disponível | Baseline a medir → **queda ≥ 80%** |
| **PM4** | **`NICOLE_SLOT_UNAUTHORIZED`** — afirmou dia+hora sem autorização | `system_events` (75-279, já existe) | por turno | Baseline a medir → **tende a 0** |
| **PM5** | **Concordância tool × parser** e **taxa de citação válida** | Shadow (88-8) | turnos de agendamento / 7 dias | ≥ 95% cada |
| **PM6** | **`EXPECTED` vs `CALL`** | `system_events` | por turno forçado | **igualdade absoluta** — desvio é incidente |
| **PM7** | **Recusas por motivo** (`citacao_nao_encontrada`, `ocupado`, `fora_do_expediente`) | `NICOLE_TOOL_REFUSED` | por chamada | Estável; salto = guarda travando atendimento legítimo |
| **PM8** | **Não matar o paciente** — `appointments created_by='nicole'` por semana e visitas criadas à mão logo após conversa da Nicole | banco | **n ≈ 1/semana — declaradamente NÃO conclusiva** | Monitorada só para catástrofe: 0 em 14 dias com > 20 turnos de agendamento = incidente |

**PM8 está aqui com a ressalva explícita.** Ela não pode ser critério de aprovação — não detecta
regressão de até ~70%. Quem detecta é PM2 (taxa) e PM3 (volume de turno). Qualquer métrica com
n < 10/semana entra no runbook marcada como **não conclusiva**, seguindo a condição 8 do
@architect.

---

## 8. Dependências do Epic 87 — o que é bloqueante e por quê

| Item do Epic 87 | Bloqueia? | Por quê |
|---|---|---|
| **W0-0** — paridade `agent_prompts` × código | **SIM** | O `visit-scheduling` de produção manda dizer *"Agendei sua visita para [dia] as [horario]"* sem passar por lugar nenhum. Com a tool no ar, isso vira instrução explícita para mentir. E qualquer AC de prompt deste epic é inverificável antes da paridade |
| **W1-2b** — âncora temporal + estado não nasce da fala da Nicole | **SIM** | `tool_choice` forçado sobre gate envenenado fabrica argumento (F-2). É a diferença entre "não agenda" e "agenda errado" |
| **W2-1** — harness | **Parcial — já pago** | A 75-279 entregou `__fixtures__/fake-supabase.ts` (filtros reais) e `pipeline-scheduling.test.ts` com INSERT exercitado e vermelho comprovado. Falta o lado da **entrada** do modelo, que é o item 88-2 deste epic |
| **W3** — validador pós-resposta | **Não** | Complementar. O 88-11 promove uma regra da classe agenda; o resto do validador segue no Epic 87 |
| **W4-1** — tool de agenda | **Substituído** | Sai do Epic 87. É este epic |

---

## 9. Escopo

**IN:** T1/T2/T3 (escrita de agenda) · executor único fail-closed · validação de citação ·
`tool_choice` por estado turn-local · tornar o pipeline tool-aware · instrumentação do funil ·
shadow mode com comparador · flag em banco + rollout progressivo · compensação de latência ·
promoção de `NICOLE_SLOT_UNAUTHORIZED` a fail-closed na classe agenda.

**FORA, com motivo:**

- **`consultar_agenda` (T4).** O pré-fetch determinístico já calcula horários livres e vai no
  bloco `[SISTEMA]` com latência zero. Trocar isso por uma decisão do modelo é andar para trás —
  o @architect está certo. Reavaliar só para a cauda de perguntas abertas ("quando vocês têm?"),
  depois da v1, com dado de frequência.
- **`consultar_empreendimento` (T5) e `enviar_material` (T6).** Raio de impacto próprio, modo de
  falha diferente (mídia, não agenda). A mídia já tem correção recente (75-270). Epic próprio.
- **`registrar_dado_do_lead` (T9).** Pertence ao Epic 87 — é substituto de
  `extractCollectedData(assistantMessage, …)`, que é causa do caso Sandra. Fazer aqui seria
  duplicar decisão de outro epic.
- **`consultar_preco`.** Rejeitada. RN2/RN4 proíbem a Nicole de citar valor; uma tool com esse
  nome **sugere** ao modelo que preço é falável.
- **Reescrever `pipeline.ts` ou trocar de arquitetura.** Continua sendo `processMessage`.
- **Guardrails de saída fora da classe agenda** (orçamento, empreendimento, markdown) — Epic 87.
- **Lock por conversa / respostas duplicadas.** Real e medido (27/07, duas respostas no mesmo
  segundo), mas é defeito independente. O executor deduplica por segurança; a causa fica fora.

---

## 10. Riscos do epic

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| **R-1** | F-1 (`content[0]`) chegar a produção sem tratamento → degradação muda em 470 linhas | **Crítica** | 88-1 é o primeiro item, antes de qualquer tool |
| **R-2** | Forçar tool sobre gate envenenado (F-2) | **Alta** | Gate turn-local + citação + W1-2b bloqueante |
| **R-3** | Citação recusar agendamento legítimo (F-4) | **Alta** | 88-6 mede em shadow por semanas antes de recusar valer |
| **R-4** | Onda 3 subir com o ramo do parser ainda vivo (F-3) | **Alta** | Remoção **no mesmo PR**; teste que prova que só existe um caminho de INSERT |
| **R-5** | Rollout 100% sem passar por canário porque "o shadow estava bom" | **Média** | Degraus com gatilho escrito; 88-10 é story própria, com dono |
| **R-6** | Não existe CI (`.github/workflows` ausente) — "golden set em CI" é ficção hoje | **Média** | Epic 87 · D5. Até lá, gate manual do @qa com a suíte completa em toda story |
| **R-7** | O epic entregar tool e o número de visitas não subir, porque o gargalo é outro (o lead não quer agendar) | **Média** | PM2/PM3 medem o defeito, não o volume comercial. Declarar que este epic conserta **fidelidade**, não demanda |
| **R-8** | Custo por turno subir (+40–60% nos turnos com tool) | **Baixa** | Irrelevante frente a um lead pago queimado. E o Epic 87 desliga o MemPalace morto (1 Haiku + N embeddings por turno, jogados fora), que financia isto com sobra |

---

## 11. Decisões que dependem do Gabriel

> Nenhuma é decisão de PM. Cada uma tem recomendação e o custo de errar.

### D88-1 — A v1 é só agenda, ou já entra mídia e dados do empreendimento?

| Opção | A favor | Contra |
|---|---|---|
| **(a) Só agenda (T1–T3)** | É o defeito que você relatou; a lógica determinística já existe e está testada; a verdade é binária (livre ou não) | Mídia e dados continuam no regime atual por mais algumas semanas |
| **(b) Agenda + mídia + dados** | Uma migração só | Triplica o raio de impacto num arquivo de 1.947 linhas, num epic cujo ponto é confiabilidade |

**Recomendação: (a).** O pedido foi sobre agenda. Ampliar escopo aqui é a mesma tentação que
produziu os quatro remendos anteriores em outra direção.

### D88-2 — Quando a tool grava e a fala final falha, a visita fica ou volta atrás?

| Opção | A favor | Contra |
|---|---|---|
| **(a) Fica gravada** + evento + notifica corretor + fala de reserva | O erro vira "existe e o lead não sabe", recuperável por telefonema; o corretor já é notificado hoje | Uma visita na agenda que o lead não confirmou pode virar no-show |
| **(b) Desfaz (delete)** | Banco espelha o que o lead ouviu | Deletar em produção por timeout é destrutivo, e volta ao dano de hoje: ninguém sabe de nada |

**Recomendação: (a).** É a inversão deliberada do dano: hoje falhamos para o lado em que o lead
aparece no stand e não há visita. Passamos a falhar para o lado em que há visita e alguém liga.

### D88-3 — Qual é o teto de latência, e medido onde?

O teto do Epic 87 · D6 (p95 de `CLAUDE_RESPONSE` + 30%) seria violado pela primeira tool. Mas ele
mede o componente errado para uma decisão de produto.

**Recomendação:** teto sobre o **turno percebido** (`whatsapp_async_done`): **p95 não pode subir
mais que 10%** em relação ao baseline da Onda 0, com a compensação do `typing-delay` ativa. Se a
Onda 2 mostrar que não cabe, a tool não sobe — e aí o veto do @architect estava certo, com número.

### D88-4 — Bloquear o envio de confirmação sem lastro (fail-closed)?

A 75-279 deixou isto explicitamente fora de escopo, registrando que a decisão é do Marcos. Hoje o
sistema é fail-open em todo lugar: a confirmação alucinada chega ao cliente e a gente só fica
sabendo.

| Opção | A favor | Contra |
|---|---|---|
| **(a) Continuar só logando** | Zero risco de piorar a conversa | É o estado atual; o lead segue recebendo a promessa falsa |
| **(b) Regenerar 1× → fala de reserva neutra** | Nunca envia visita que não existe | +1 chamada; resposta mais burocrática num caso raro |

**Recomendação: (b), só na classe agenda, e só depois do shadow.** Um lead que ouve "deixa eu
conferir certinho e já te confirmo" é recuperável; um lead que vai ao stand no sábado, não.

### D88-5 — Citação obrigatória, mesmo quando custa um agendamento?

O `citacao_do_cliente` é a barreira que torna o caso Sandra estruturalmente impossível. Mas ele
recusa quando não casa — e F-4 diz que vai haver falso negativo.

| Opção | A favor | Contra |
|---|---|---|
| **(a) Obrigatória e bloqueante** | Fecha o modo de falha do @architect | Alguns agendamentos legítimos viram "me confirma o horário de novo?" |
| **(b) Obrigatória mas só logada** | Zero risco de travar atendimento | Vira mais um botão que não faz nada — o padrão que este projeto já tem cinco vezes |

**Recomendação: (a), com o número na mão.** Ela nasce em shadow no 88-6 e só passa a recusar
quando a taxa de casamento estiver medida ≥ 95%. Se não chegar lá, ajusta-se a normalização —
não se desliga a barreira.

### D88-6 — Quem valida em produção, e em que janela?

Herda o D7 do Epic 87 e é mais crítico aqui: o rollout tem três degraus, cada um com gatilho.
**Recomendação:** nomear Marcos ou Thielly com janela de 24 h por degrau e critério de rollback
escrito **antes** de cada um. Sem dono nomeado, o rollout congela no canário e o epic não fecha.

---

## 12. Sequência

```
[Epic 87 · W0-0 paridade de prompts]  ──┐  BLOQUEANTES
[Epic 87 · W1-2b âncora + estado]     ──┘
                                         │
   88-1 (content[] tool-aware) ──┐        │
   88-3 (instrumentar funil)   ──┼─▶ 88-4 (flag em agent_config, verificada por efeito)
   88-2 (harness afirma entrada)─┘        │
                                          ▼
                              88-5 (executor único, fail-closed)
                                          │
                              88-6 (citação em shadow)
                                          │
                                          ▼
                              88-7 (tools + 2ª chamada em SHADOW, pós-envio)
                                          │
                              88-8 (comparador + relatório · 7 dias)
                                          │
                             [critério de saída §6.1 · D88-3 · D88-5]
                                          ▼
                       88-9 (enforce + remove ramo do parser, mesmo PR)
                                          │
                              88-10 (canário → 10% → 100%)
                                          │
                              88-11 (fail-closed na classe agenda) [D88-4]
```

**Marcos:**
- **Fim da Onda 0** — a tool ainda não existe e o pipeline já sobrevive a ela; o defeito do
  Gabriel tem número (`NICOLE_SLOT_UNRESOLVED`).
- **Fim da Onda 1** — existe **um** caminho de escrita de visita no sistema.
- **Fim da Onda 2** — sabemos, com dado de produção, se vai funcionar quando precisar. Antes de
  qualquer lead ser afetado.
- **Fim da Onda 3** — a fala e a linha no banco são o mesmo evento.

---

## 13. Notas para o @sm

- **Uma story por item 88-N.** Se um item precisar ser partido, avisar o @po: o número da story
  deixa de casar com o ID do item e a rastreabilidade se perde.
- **88-1 é a story que menos parece urgente e mais é.** Ela não muda nenhuma resposta e é a única
  coisa entre este epic e uma degradação muda em ~470 linhas. Escrever a AC como teste que injeta
  um bloco `tool_use` na posição 0 e prova que a fala **não** some.
- **Todo teste deste epic precisa ficar vermelho antes.** É regra da casa e a 75-279 a praticou:
  o parser foi revertido e 3 de 5 casos falharam. Um harness que passa pelo motivo errado é pior
  que nenhum — já aconteceu aqui (mock com `is: () => b` engolindo o filtro).
- **Nenhuma AC deste epic pode ser "existe no painel/no env".** Tem que ser **efeito verificado em
  produção**. A flag do 88-4 já falhou nesta casa duas vezes por esse motivo.
- **Mudança de prompt precisa de AC dupla** (código **e** `agent_prompts` no banco) — e antes
  disso, o Epic 87 · W0-0.
- **Instrumentação antes de comportamento**, sempre: um item que muda comportamento sem o
  contador correspondente não fecha.
- Contexto medido para as stories está em: validação do @architect §5 e §6, análise do @analyst
  §2 e §7, e a 75-279 (parser, guardas e harness). **Reler antes de redigir** — cada afirmação
  deste epic tem linha de código ou registro de banco por trás.

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-06 | 0.1 | Epic criado a partir do pedido direto do Gabriel, do veto do @architect ao W4-1 do Epic 87 e da análise do @analyst. Decisão central: híbrido com fronteira leitura/escrita. 11 itens em 4 ondas, 8 modos de falha novos nomeados, 8 métricas com o problema de n baixo tratado, 6 decisões pendentes do stakeholder. | @pm (Morgan) |
