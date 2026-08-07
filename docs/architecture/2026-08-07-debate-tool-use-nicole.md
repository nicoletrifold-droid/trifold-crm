---
title: Debate arquitetural — o conselho de tool use × a Nicole que existe
autor: Aria (@architect)
data: 2026-08-07
versao: 0.2 (revisa a v0.1 de 06/08 com a auditoria do @po e 3 achados novos)
tipo: Debate/validação (não é epic, não é plano de execução)
provocacao: Recomendação de arquitetura de tools trazida pelo Gabriel de outro agente de IA
alvo:
  - docs/stories/epics/epic-88-nicole-tool-use-agenda.md (v0.1, @pm)
  - docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md (incoerente — ver §8)
  - docs/architecture/2026-08-05-validacao-epic-87.md §5 (meu veto ao W4-1)
  - docs/research/2026-08-05-nicole-anti-alucinacao/analise-tecnica.md §2 (@analyst)
metodo: >
  Código de `main` de hoje (pós-75-279) + banco de produção `dsopqkqjkmhytudaaolv`
  via Management API + execução das funções reais do pipeline contra o corpus real
  de 60 dias (2.493 mensagens, 282 conversas, 59 estados vivos) + auditoria de
  incidentes do @po.
veredito_global: >
  O conselho é bom e quase todo inaplicável a nós. O Epic 88 tem o diagnóstico certo
  da assimetria e o instrumento caro demais para o que está medido. Meu veto passa de
  REPROVADO para ADIADO COM CRITÉRIO NUMÉRICO DE ENTRADA. Há três minas vivas em
  produção agora, e o Epic 87 está incoerente ao ponto de proibir o Epic 88 por escrito.
---

# Debate — tool use na Nicole

## 0. A resposta curta

O outro agente descreve, com precisão, a arquitetura correta para um assistente que
**decide sozinho quando agir**. A Nicole não é isso. Ela já tem máquina de estados, já
tem nove detectores de intenção rodando antes do modelo, já tem o backend como dono
exclusivo das regras de negócio, e o modelo **não tem sequer o mecanismo técnico** de
executar nada — não existe uma única linha `tools:` no pacote. Ele está prescrevendo o
remédio para uma doença que nós não temos.

E a razão pela qual ela falha mesmo assim não está na lista dele, não está no Epic 88, e
não é "o LLM decidiu errado". Eu medi. São quatro coisas:

1. **O parser deixou de ser o gargalo, mas a gente nunca soube quando ele parou de ser.**
   Em 1.351 mensagens de lead em 60 dias, o parser de hoje não perde nenhuma expressão
   temporal legítima (§2.2). O que sustentava a sensação contrária é o item 2.
2. **Nada no sistema compara o que a Nicole diz com o que o banco tem.** A Célia foi
   confirmada em 28/06 e ficou **cinco semanas** sem `appointment` sem que ninguém
   percebesse. Não é um defeito de agendamento — é a **ausência de reconciliação**, e ela
   custa dias de descoberta em vez de minutos (§2.3).
3. **O estado da conversa lê o interlocutor errado, nos dois sentidos.** Grava a fala da
   *Nicole* onde deveria gravar a do lead (caso Sandra) e **não grava nada** quando é o
   sistema que oferece ou afirma um horário (casos Valnira, Idalina, Sueli) (§2.5).
4. **Há 46 estados vivos carregando uma data que anda sozinha, e três deles criam um
   `appointment` fantasma na próxima mensagem que o lead mandar** — qualquer mensagem,
   inclusive "Oi" (§2.7).

O item 4 é mais urgente que este debate inteiro.

### 0.1 O que mudou nesta revisão — e onde eu estava errado

Registro explícito, porque isso é mais útil que coerência:

| Achado novo (@po / verificação de hoje) | Efeito na minha conclusão de 06/08 |
|---|---|
| **Placar 6/7, não 4/5.** Silvana **não** era incidente (pediu ligação, foi atendida). Entram Célia, Helena, Miriam | **Muda o argumento, não a conclusão.** A Célia é de 28/06: o defeito tem **5 semanas**, não 2. Isso desloca o problema de "o parser erra" para "nada detecta o erro" — e reforça o item mais barato do meu plano |
| **Lastro real ≈ 31%**, não ~50% | **Corrijo meu número.** Eu medi 54% contra *qualquer* appointment; ~31% é contra o que o **pipeline** escreveu. A diferença é **reparo humano**. O 31% é a métrica certa (§2.4) |
| **`freeSlotsInPeriod` devolveu três sábados** para quem pediu "semana de manhã" | **Isto joga contra mim e eu aceito.** Eu argumentei que a camada determinística funciona. Ela também erra — e o erro está exatamente no lado que o Epic 88 preserva. Reproduzi e achei a causa: a guarda da 75-268 está **pela metade** (§2.6) |
| **F-7 morreu**: `visit-scheduling` reconciliado em produção em 05/08 20:58 | **Minha condição 8 foi cumprida** — uma vez. Sem o job de diff, ela volta a apodrecer. Reclassifico de bloqueante para "cumprida sem mecanismo" (§9) |
| **Epic 87 nunca foi editado** após minha validação | **Novo bloqueio, e é de governança, não de arquitetura.** O Epic 88 depende de um `W0-0` que **não existe no arquivo**, e a regra de corte da Onda 2 do Epic 87 **proíbe o Epic 88 inteiro** (§8) |

O que **não** mudou: o parser não é o gargalo; structured output e tool use são o mesmo
mecanismo; o instrumento do Epic 88 é desproporcional ao que está medido; e as três minas
vivas continuam armadas.

---

## 1. O conselho, item a item

Sem diplomacia, como pedido. Três colunas: **acerta**, **descreve problema que não
temos**, **erra o diagnóstico**.

| # | Recomendação | Veredito | Evidência no nosso código |
|---|---|---|---|
| 1 | State machine + intent detection antes do LLM | **Já temos** | `conversation_state` (tabela), `isVisitSchedulingMode`, `detectAppointmentIntent`, `detectCancelIntent`, `detectRescheduleIntent`, `detectSlotMismatch`, `detectAffirmedSlot`, `identifyProperty`, `parsePeriodParts`. O fluxo dele é literalmente `pipeline.ts:738-920` |
| 2 | Structured output em vez de tool use; quem chama a tool é o backend | **Distinção sem diferença** — ver §3 | Hoje o backend é o único que escreve; o modelo já *"não executa ações"*. O prompt dele já existe na prática |
| 3 | Tools pequenas, responsabilidade única | **Correto e vazio** | Não temos tool nenhuma. Se e quando tivermos, o Epic 88 já propõe 3 e não 1 — está certo |
| 4 | Nunca deixar o modelo inventar parâmetros; se falta a hora, pergunte | **Já fazemos — e é *isto* que produz a mentira** | `bookableSlotUtc` só existe com dia E hora. No caso Maria Oliveira o bloco dizia literalmente *"NÃO afirme nenhum horário"* — porque o backend achou que faltava a hora que a cliente já tinha dado |
| 5 | Backend controla as regras de negócio | **Já temos — e ele também erra** (§2.6) | `evaluateSlot`, `closeHourFor`, `isSlotFree`, `freeSlotsInPeriod`. Medição a favor: `NICOLE_SLOT_MISMATCH` = **0 em 30 dias**. Medição contra: "semana de manhã" → três sábados |
| 6 | Idempotência | **Acerta, e é pior do que ele supõe** | `pipeline.ts:1220-1236` é check-then-insert **sem UNIQUE no banco**. Race de webhook documentada (duas respostas no mesmo segundo, 27/07) |
| 7 | Erros tipados, nunca vazio ambíguo | **Acerta, e é bug de produção hoje** | `visit-slot.ts:484-486`: `const { data } = await q...; return !data`. O `error` é descartado — **timeout do Postgres vira "horário livre"** |
| 8 | Logs encadeados intenção→tool→parâmetros→resultado | **Acerta, e é o item de maior ROI da lista dele** | Hoje o funil de agenda é invisível: não existe um único evento entre "o gate abriu" e `APPOINTMENT_CREATED`. É o que deixou a Célia 5 semanas invisível |
| 9 | Separar conhecimento (RAG) de ação (agenda) | **Já separado** | RAG/`buildPropertyDataContext` × `appointments`. Ganho zero |
| 10 | Agentes especializados (recepcionista → agenda → financeiro) | **Ruído, e perigoso** | Nosso problema é ter fronteiras demais entre componentes que discordam. Multiplicar fronteiras é a direção oposta |

### 1.1 Onde ele erra o diagnóstico — as cinco causas prováveis dele

Ele lista, em ordem: (1) o LLM decidindo quando chamar a tool, (2) descrições/schemas
fracos, (3) contexto grande demais, (4) contratos frouxos, (5) ausência de máquina de
estados.

**As causas 1, 2 e 4 são estruturalmente impossíveis no nosso sistema**, porque não há
tool, não há schema e não há contrato de tool. A causa 5 é falsa por inspeção. A causa 3
é a única testável, e eu a testei — dá negativo (§5).

Isso não é um detalhe. Significa que **a lista inteira de causas prováveis dele tem
probabilidade zero aqui**. Ele respondeu à pergunta "por que agentes com tools falham",
que é uma boa pergunta, e não à nossa, que é "por que um sistema sem tools, com máquina
de estados e backend determinístico, promete visita e não grava — por cinco semanas, sem
ninguém notar".

### 1.2 Os dois pontos em que ele está mais certo do que os dois epics

**(a) O corolário que ele não escreve e nós violamos.** Se o backend controla o fluxo, o
estado precisa registrar **o que o backend fez**, não só o que ele leu. Nosso
`conversation_state` registra exclusivamente o que o parser extraiu da fala do **lead**.
Quando o sistema *oferece* horários (`freeSlotsInPeriod`, `alternatives`) ou *autoriza* um
slot (`authorizedSlotUtc`), nada é persistido. Consequência medida em §2.5: quando o lead
responde **"Ok"**, não há nada a que o "Ok" se refira.

**(b) O ponto 8 (logs encadeados) é maior do que ele imagina.** Ele o coloca como
diagnóstico. Na nossa realidade ele é **o conserto**: o custo do defeito não é a visita
perdida, é as cinco semanas até alguém descobrir. Ver §2.3.

---

## 2. Por que ela falha, então — o mecanismo, medido

### 2.1 Metodologia

Tudo abaixo é medição, não hipótese.

- **Corpus:** `messages` de produção, 60 dias — 2.493 mensagens `user`/`assistant`,
  1.351 do lead, 282 conversas.
- **Execução real:** `resolveVisitSlotParts`, `parseTimeParts`, `parseDayParts`,
  `parsePeriodParts`, `isAmbiguousSlotText`, `evaluateSlot`, `freeSlotsInPeriod` e
  `detectAffirmedSlot` importadas de `packages/ai/src/` e rodadas contra cada mensagem,
  com o `now` do próprio turno.
- **Telemetria:** `system_events`, 30 dias.
- **Estado vivo:** os 59 `conversation_state` com resíduo de agenda, hoje.
- **Auditoria de incidentes:** @po, contra o banco.

**Limitação que preciso declarar:** eu rodo o parser de **hoje** contra o corpus do
**passado**. Isso mede a cobertura atual, não a robustez futura — e é exatamente por isso
que o caso Célia (§2.3) importa tanto.

### 2.2 O parser deixou de ser o gargalo

Rede larga sobre **todas** as 1.351 mensagens do lead: qualquer coisa que um humano leria
como horário (`\d{1,2}h`, `\d{1,2}:\d{2}`, "meio-dia", números por extenso,
"manhã/tarde/noite/cedo", "as 9", "umas 14"). Resultado: **76 candidatos** em que o parser
não resolve nada.

Inspecionei os 76, um a um. **Zero são expressões temporais legítimas.** São:
"Boa tarde" (×27), "uma vaga"/"uma noção"/"uma simulação" (o artigo "uma" pegando na
rede), "55m2", "37anos", "490 mil", um CPF, um CNPJ e três mensagens de spam comercial.

Os oito casos que só resolvem com `bareNumberAllowed: true` são exatamente os do folclore
das stories: `"Na quinta as 10"`, `"As 10"`, `"Amanhã às 10"`, `"As 11 melhor ...
Desculpa"`, `"As 9"`, `"Umas 14"`, `"Pode ser às 10?"`. Todos resolvem hoje.

**A contrapartida, que é o risco real e ninguém mediu:** desses oito, **um é falso
positivo** — `"o 7° andar me agrada"` → 7h. O `NOT_HOUR_UNIT_RE` tem `andar` na lista,
mas o `°` entre o número e a palavra quebra o casamento.

Isso é o inverso do que as quatro últimas stories assumiram. Cada afrouxamento do parser
(75-268 número pelado, 75-279 sufixos colados) comprou recall que já estava quase saturado
e vendeu precisão. **Falso positivo de parser é estritamente pior que falso negativo:**
falso negativo faz o sistema perguntar de novo; falso positivo faz o sistema autorizar e
**gravar** um horário que ninguém pediu.

> **Correção que o Epic 88 precisa absorver:** o argumento "o modelo entende o que o regex
> não entende" é verdadeiro em geral e **não tem lastro no nosso corpus**. Se a tool entra
> por esse motivo, ela entra sem evidência. Se entrar por outro motivo — e há um, §3 — que
> seja escrito o motivo certo.

### 2.3 O caso Célia reenquadra o problema inteiro

Em **28/06** a Célia escreveu `"As 9"`. A Nicole respondeu *"Perfeito! Agendei sua visita
para este sábado às 9h"*. **Zero `appointments` até hoje.** Cinco semanas.

Na época o parser não lia `"As 9"` — o número pelado só passou a valer com a 75-268, em
agosto. Então a Célia **foi**, sim, uma falha de parser. Mas a lição não é essa:

> **A falha de parser durou 5 semanas e custou uma cliente. A falha de detecção durou as
> mesmas 5 semanas e custou todas as outras.** Enquanto ninguém compara a fala com a linha
> no banco, cada defeito novo — de parser, de gate, de estado, de expediente — tem um
> tempo de descoberta medido em semanas e um descobridor humano por acidente.

Isto reordena a prioridade de forma que nenhum dos dois epics fez: **a reconciliação
fala × banco é o item mais barato e de maior valor de todos, e ela funciona igual com ou
sem tool.** É o P6 do @analyst, é o PM2 do Epic 88 — e nos dois documentos ela aparece
como *métrica*, quando deveria aparecer como *entrega*, primeiro na fila.

Um job diário que roda `detectAffirmedSlot` sobre as falas da Nicole das últimas 24h e
alerta quando não há `appointment` a ±30 min teria pego: Célia (28/06), Helena (24/06),
Miriam (07/07), Silvana, Sandra, Sueli, Valnira e Maria Oliveira — **cada um no dia
seguinte**. Custo: uma consulta e um cron. É o mesmo mecanismo que eu já uso nos scripts
desta análise.

### 2.4 O lastro: 31%, e por que eu media 54%

Reconciliando meu número com o do @po, porque a diferença é a parte interessante.

Das **28 falas** em que a Nicole afirmou um dia+hora único em 60 dias:

| Recorte | n | taxa |
|---|---|---|
| Com **qualquer** `appointment` do lead a ±30 min | 15 | **54%** |
| … dos quais criados por `admin` ou `broker` **depois** (reparo humano) | 13 | — |
| Com `appointment` criado pelo **pipeline** (`created_by='nicole'`) no horário certo | **2** | **~7%** |
| Auditoria do @po sobre a janela de incidentes | — | **~31%** |

Os três números medem coisas diferentes e todos são verdadeiros. O de 54% conta o sistema
**mais** o time consertando à mão. O de ~7% é o pior recorte (só o horário exato, só o
pipeline). O ~31% do @po é o recorte operacionalmente honesto.

> **Adoto 31% como baseline** e registro a consequência de produto: **o custo atual do
> defeito não é (só) visita perdida — é trabalho manual de reparo, invisível, feito por
> quem descobre o furo lendo a conversa.** Valnira → reparada por `admin`. Sueli →
> `broker`, no dia seguinte. Maria Oliveira → `admin`, ontem de manhã. Célia → nunca.
>
> Qualquer métrica que conte "existe appointment" como sucesso **conta o reparo humano
> como se fosse o sistema funcionando**. O PM2 do Epic 88 precisa filtrar por
> `created_by='nicole'` **e** por proximidade temporal com a fala, senão ele melhora
> sozinho quando o time trabalha mais.

### 2.5 O gargalo estrutural: sete portas conjuntivas, e um estado surdo

Para uma visita virar linha no banco, **sete condições precisam ser verdadeiras ao mesmo
tempo**:

```
1. conversation.lead_id existe
2. NÃO existe appointment futuro ativo do lead      (senão vai para o ramo de remarcação,
                                                     que nunca seta bookableSlotUtc)
3. isVisitSchedulingMode(...) == true               (4 gatilhos heurísticos)
4. resolveVisitSlotParts devolve day E time         (mensagem + pendências + availability)
5. evaluateSlot devolve startUtc                    (futuro + expediente + 60min cabendo)
6. checkSlotAvailability diz free
7. no momento da escrita: !existingAppt && org_id
```

Sete ANDs, cada um individualmente razoável. **O produto de sete portas com ~85-95% de
confiabilidade cada cai na faixa dos 30-60%** — que é a faixa medida. É por isso que
quatro stories seguidas "consertaram" e o número não se mexeu: 75-162 mexeu na porta 4,
75-245 nas portas 4 e 5, 75-268 nas portas 3 e 4, 75-279 na porta 4. **Ninguém tocou nas
portas 2, 6 e 7**, e ninguém tocou no defeito abaixo.

**O estado não grava NADA do que o sistema ofereceu ou afirmou.** Quando o pipeline
oferece horários livres (`pipeline.ts:829`, `891`, `902`) ele escreve `visit_pending_date`
— **o dia, nunca as horas oferecidas**. `authorizedSlotUtc` é variável local e **morre no
fim do turno**. A afirmação da Nicole não entra em lugar nenhum.

Consequência: **o aceite não tem a que se referir.** Medi a classe — Nicole ofereceu
horário concreto, o lead aceitou sem repetir ("Ok", "Pode ser", "Isso"): **6 ocorrências
em 60 dias**, e o resultado é grotesco:

```
[04/08 00:10] Valnira
  NICOLE : "Valnira, a quinta-feira às 10h está confirmada para você! Anota o endereço…"
  LEAD   : "Ok"                       → parser: dia=-  hora=-   (o estado não tem nada)
  NICOLE : "Ótimo! Só para confirmar — qual horário na quinta-feira fica melhor pra você?"

[16/06 13:44] Idalina
  NICOLE : "Agendado para sábado, 20 de junho, às 9h na nossa sede…"
  LEAD   : "Ok"                       → parser: dia=-  hora=-
  NICOLE : "Fica agendado para sábado, dia 20 de junho… Qual o melhor horário para você?"
```

E o espelho disso é o caso Sandra: o **único** canal pelo qual a fala da Nicole entra no
estado é `extractCollectedData(assistantMessage, updatedData)` (`pipeline.ts:1099`) — que
grava a fala **dela** como se fosse disponibilidade **do lead**, sem tipo, sem âncora, sem
procedência.

> Os dois buracos são o mesmo defeito com sinais opostos: **a máquina de estados lê o
> interlocutor errado numa direção e é surda na outra.** Ela transcreve a Nicole onde
> deveria transcrever o lead, e ignora a Nicole onde deveria registrá-la.

**Agravante que nenhum documento viu:** o `collected_data` inteiro é despejado como JSON
cru no system prompt —

```ts
convoLines.push(`Data collected so far: ${JSON.stringify(state.collected_data)}`)
```

— então o `visit_availability` envenenado chega ao modelo **duas vezes**: no bloco
`[SISTEMA]` (com instruções) e como JSON solto (sem instrução nenhuma). Qualquer desenho
que trate o `[SISTEMA]` como "fonte única de fatos autorizados" — Epic 87 · W3-1 e Epic 88
inclusive — é ficção enquanto essa linha existir.

**Consequência direta para o Epic 88, e é a contradição interna mais séria dele:** o §4.1
define, corretamente, que o `tool_choice` forçado só dispara com **gatilho turn-local** —
"expressão temporal na mensagem do lead **neste turno**". Mas "Ok" não tem expressão
temporal. **O mecanismo de segurança do Epic 88 desliga a tool exatamente nos turnos
(Valnira, Idalina, Sueli) que ele promete fechar.** No modo `auto` volta-se a "o modelo
lembra ou não" — que é justamente o que o Gabriel pediu para não acontecer.

O mesmo caso, pelo caminho barato: gravar oferta e afirmação no estado, com data absoluta.
Trinta linhas, zero chamadas de modelo, zero latência, determinístico.

### 2.6 O defeito que joga contra mim: "semana de manhã" → três sábados

O @po encontrou; eu reproduzi e achei a causa. **Este achado enfraquece meu argumento de
que a camada determinística é a parte confiável, e eu prefiro registrá-lo do que
contorná-lo.**

Rodando o código de `main`:

```
"Semana de manhã"      → parsePeriodParts = "manha"
   dia vindo de visit_availability ("sábado às 10h")  → dia = —      ← a guarda ATUA
   dia vindo de visit_pending_date (2026-08-08 = sáb) → dia = 8/8    ← a guarda NÃO atua
```

A causa está em `resolveVisitSlotParts` (`visit-slot.ts:363-381`):

```ts
let day = dayInMessage ?? pendingDay                       // ← pendingDay entra SEMPRE
…
const periodWithoutDayInMessage = !dayInMessage && !!parsePeriodParts(message)
if ((!day || !time) && visitAvailability && !isAmbiguousSlotText(visitAvailability)) {
  if (!day && !periodWithoutDayInMessage) day = parseDayParts(visitAvailability, now)
  //          ^^^^^^^^^^^^^^^^^^^^^^^^^ a guarda existe SÓ aqui
}
```

**A 75-268 corrigiu metade do próprio bug que ela nomeia.** O comentário dela diz, com
todas as letras: *"a Valnira pediu dia de semana e ouviu sábado"*. A guarda foi aplicada
ao caminho `visitAvailability` e **não** ao caminho `pendingDay` — e o `pendingDay` é
justamente o campo que o pipeline escreve sozinho, sem guarda de ambiguidade nenhuma
(§2.7: 9 estados vivos o têm).

Três coisas saem daqui:

1. **É a mesma raiz de tudo o mais neste documento:** estado velho sobrevivendo a um turno
   que o contradiz. Não é um bug novo — é a terceira manifestação de `agenda_state` sem
   âncora, sem TTL e sem procedência.
2. **Mora do lado que o Epic 88 preserva.** O epic escreve que "quem decide disponibilidade
   continua sendo código" e trata isso como o lado seguro. Este defeito diz que o lado
   seguro também erra, e que a tool não o alcança — `freeSlotsInPeriod` seguiria devolvendo
   sábados para quem pediu semana, com ou sem tool.
3. **Baixa minha confiança, não minha conclusão.** Se as duas camadas erram, o critério de
   escolha deixa de ser "qual é confiável" e passa a ser **"qual erro eu consigo ver e
   corrigir mais rápido"** — e aí a reconciliação (§2.3) e o funil instrumentado ganham
   ainda mais peso frente a qualquer instrumento novo.

### 2.7 As três minas vivas — a parte urgente

Consultei os 59 `conversation_state` com resíduo de agenda (`visit_availability`,
`visit_pending_date` ou `visit_pending_hour`) e rodei o código de `main` contra eles.

| Medição (produção) | n |
|---|---|
| Estados vivos com resíduo de agenda | **59** |
| … protegidos por `isAmbiguousSlotText` (a guarda da 75-245) | **4** |
| … que resolvem um **dia concreto** | **48** |
| … cujo dia **muda conforme a data em que forem lidos** (sem âncora) | **46** |
| … com `visit_pending_date`/`hour` — campo **sem guarda de ambiguidade nenhuma** | **9** |
| … que resolvem **dia + hora** e disparam o INSERT na próxima mensagem | **3** |

A guarda da 75-245 cobre **4 de 59**, e não cobre `visit_pending_date`, que alimenta
`resolveVisitSlotParts` por um caminho que não passa por `isAmbiguousSlotText` uma vez
sequer — o mesmo caminho da §2.6.

O conteúdo real dos campos é o retrato do defeito:

```
Nilson      va = "…Que tal agendar uma visita? Qual o melhor dia pra você, durante a
                  semana ou sábado de manhã?"                    ← fala da Nicole
Maicon      va = "Não posso ir no stand. você consegue me passar o preço agora"
                                                                 ← uma RECUSA, gravada
                                                                   como disponibilidade
Bianca      va = "Bom dia! Tudo bem? Sou a Nicole, da Trifold Engenharia. Como posso te
                  ajudar hoje?"                                  ← a saudação dela, e o
                                                                   "hoje" resolve para a
                                                                   data de hoje
Sandra      va = "sábado, dia 8, de 8h às 12h"  +  vpd = "2026-08-08"
                                                                 ← o estado que causou o
                                                                   incidente de 05/08
                                                                   ainda está lá
```

E o resultado executado — código de `main`:

```
Célia    msg="Oi"                  → dia=8/8  hora=9h   evaluateSlot OK
                                                        ⇒ bookableSlotUtc SETADO ⇒ INSERT
Adriele  msg="Bom dia"             → dia=8/8  hora=11h  evaluateSlot OK
                                                        ⇒ bookableSlotUtc SETADO ⇒ INSERT
Wilson   msg="Ainda estou pensando"→ dia=10/8 hora=8h   evaluateSlot OK
                                                        ⇒ bookableSlotUtc SETADO ⇒ INSERT
```

> **Célia, Adriele e Wilson têm um `appointment` fantasma armado.** Qualquer mensagem cria
> uma visita no banco, notifica o corretor, move o lead para "Visita Agendada" no kanban e
> faz a Nicole confirmar um horário que nenhum dos três pediu. Os textos de origem são
> falas da **própria Nicole**, de 11 a 39 dias atrás.
>
> A ironia amarga: a Célia é a mesma cliente de 28/06 que ficou 5 semanas sem visita. O
> sistema agora está pronto para criar, sem que ela peça, a visita que ele não criou
> quando ela pediu.

**Ação imediata, antes de qualquer discussão de tool:** purgar `visit_availability`,
`visit_pending_date`, `visit_pending_hour` e `visit_pending_minute` de todo
`conversation_state` com `updated_at` anterior a 48h, e revisar à mão os 3 armados. É um
`UPDATE` com `jsonb - 'chave'`. O DDL/SQL é do @data-engineer; a decisão arquitetural é
minha: **purgar agora e por rotina até a âncora existir**, porque sem cortar a fonte
(`extractCollectedData` sobre a fala dela) o estado se reenvenena no turno seguinte.

### 2.8 A guarda nova (75-279) tem 21% de falso positivo

`detectAffirmedSlot`, que nasceu anteontem e que o Epic 88 promove a **fail-closed** no
item 88-11, disparou em **28 falas reais** nos últimos 60 dias. Classifiquei uma a uma.
**Seis não são afirmações — são perguntas ou ofertas:**

```
"Só lembrando que nosso atendimento no sábado é até as 12h. Qual horário fica melhor
 pra você?"                                                   → detectou sábado 12h
"Qual horário no sábado fica melhor pra você — mais cedo ou mais para o meio-dia?"
                                                              → detectou sábado 12h
"Que tal às 11h então? … Posso confirmar sua visita para este sábado, dia 4, às 11h?"
                                                              → detectou sábado 11h
"…conseguimos confirmar a visita pra segunda-feira às 8h?"    → detectou segunda 8h
"Vou confirmar a disponibilidade para sexta, dia 7, às 14h e já te aviso."
                                                              → detectou sexta 14h
"Qual horário fica melhor, de manhã cedo ou mais perto das 12h?"  → detectou 12h
```

`isAmbiguousSlotText` não pega nenhuma: há **um** dia da semana e **um** horário em cada.
Precisão ≈ **79%**.

1. **PM4 do Epic 88 ("`NICOLE_SLOT_UNAUTHORIZED` tende a 0") é inatingível como escrito.**
   Existe um piso irredutível de ~20% de disparos que são perguntas legítimas.
2. **O item 88-11 (fail-closed) travaria turnos legítimos.** Uma em cada cinco vezes que
   bloquear, estará bloqueando a Nicole *perguntando* o horário — e trocando por "deixa eu
   conferir certinho", que numa pergunta é um não-sequitur. É o risco R-7 do próprio epic,
   sem a conexão com este mecanismo.

Correção barata: `detectAffirmedSlot` devolve `null` quando o horário aparece em segmento
interrogativo, ou quando a frase casa `que tal|posso confirmar|fica melhor|prefere|até
as|vai até|vou confirmar`. As seis strings viram fixtures.

---

## 3. "Structured output" × "tool use" — há diferença real?

**Não. Na API da Anthropic, são o mesmo mecanismo.** Isto precisa ficar escrito porque a
recomendação dele apresenta os dois como escolhas arquiteturais distintas, e a premissa
falsa contamina a comparação de custo e latência.

`tool_choice: {"type":"tool","name":"X"}` **é** structured output — é a forma documentada
de obtê-lo. Não existe um "modo JSON" separado, mais barato ou mais rápido. O
`input_schema` é o schema de validação; `disable_parallel_tool_use: true` garante saída
única. Quando ele diz *"o LLM devolve `{intent, date, time, missing, confidence}` e quem
chama a tool é o backend"*, está descrevendo **um `tool_use` block forçado que o backend
consome sem devolver `tool_result`** — que, aliás, é o que o Epic 88 propõe, porque em tool
use o executor **também** é o backend. A frase "quem chama a tool é o backend" é verdadeira
nos dois desenhos.

**O eixo real não é "structured output × tool use". É: uma chamada de modelo ou duas.**

| Desenho | Chamadas | O que o modelo produz | Custo p50 medido |
|---|---|---|---|
| **(A) Loop de tool** (Epic 88) | 2 Sonnet | turno 1: `tool_use` (dezenas de tokens); turno 2: a fala | **+2.900 ms** |
| **(B) Extração e fala na mesma resposta** | 1 Sonnet | `{dia, hora, citacao, resposta_ao_cliente}` | +0 ms |
| **(C) Extrator dedicado antes da chamada principal** | 1 Haiku + 1 Sonnet | Haiku: só `{dia, hora, periodo, citacao}`; Sonnet: inalterado | **+400–900 ms** |

**(B) é a armadilha.** Parece o melhor dos mundos e não é: o modelo precisa escrever a
resposta **antes** de saber se o horário está livre. Ou você aceita que ele afirme sem
lastro (o bug de hoje, com JSON), ou o obriga a produzir respostas condicionais por
`status` — frágil e inflado. Descarto.

**(C) é a opção que ninguém colocou na mesa, e eu acho que é a certa para nós.**

> Um extrator dedicado (Haiku), chamado **antes** da chamada principal, com `tool_choice`
> forçado, cuja única saída é a interpretação temporal — e cujo resultado alimenta o
> **mesmo** `[SISTEMA]` e o **mesmo** `bookableSlotUtc` que já existem.

| Critério | (A) loop de tool | (C) extrator antes |
|---|---|---|
| Onde toca no `pipeline.ts` | ponto de chamada + as ~470 linhas a jusante + o ramo de escrita | **uma função**: `resolveVisitSlotParts` ganha um fallback |
| `content[0]` deixa de ser `text` (F-1, Crítica no Epic 88) | risco real, mitigado por uma story inteira (88-1) | **não acontece**: a chamada principal continua sem `tools` |
| Duas autoridades de escrita convivendo (F-3) | exige remover o ramo do parser no mesmo PR (88-9) | **não existe**: o parser vira fallback, mesma autoridade |
| Latência p50 adicional | **+2.900 ms** | **+400–900 ms** |
| Rollback | revert de PR grande, ou flag em `agent_config` | `if (flag)` numa função pura |
| Procedência (caso Sandra) | `citacao_do_cliente` validada a posteriori — F-4 (falso negativo) e a decisão D88-5 penduradas nela | **estrutural**: o extrator recebe **só** mensagens `role='user'`. Ela não pode "ver" a própria fala porque a fala não está no input |
| Atomicidade fala↔banco | **ganha** | não ganha |

A última linha é a única a favor de (A), e é preciso ser honesto sobre o tamanho dela.
Atomicidade resolve *"a Nicole disse uma coisa e o banco registrou outra"*. Medição:
`NICOLE_SLOT_MISMATCH` = **0 disparos em 30 dias**, com a guarda demonstrando sensibilidade
real (detecta afirmação em 28 falas). **Quando o sistema autoriza um slot, ela obedece.** A
divergência fala×banco não vem de desobediência do modelo — vem de o sistema **não
autorizar nada**. Atomicidade compra seguro contra um sinistro que não ocorre; subir a taxa
de autorização ataca os 100% do dano.

E a procedência estrutural de (C) é arquiteturalmente mais forte que a citação validada de
(A): validar citação a posteriori é barreira **detectiva** com falso negativo garantido
(F-4, e a decisão D88-5 existe só por causa disso); não mostrar a fala da Nicole ao
extrator é barreira **preventiva** sem falso negativo. Em segurança essa preferência é
doutrina; aqui ela ainda vem de graça.

**Se, mesmo assim, a decisão for o loop de tool:** minhas condições da §5.4 da validação do
Epic 87 continuam de pé e o Epic 88 já as absorveu bem (88-1 primeiro, `content` percorrido
inteiro, ramo do parser removido no mesmo PR). Acrescento uma terceira, vinda da §2.5: **o
gatilho turn-local precisa incluir "o turno anterior registrou oferta ou afirmação no
estado"** — senão a tool não dispara nos casos Valnira/Idalina/Sueli. O que exige, antes, o
registro da oferta. **Ou seja: o item barato é pré-requisito do item caro nos dois
caminhos.**

---

## 4. Os pontos 3, 6, 7, 8 e 9 dele — o que entra e o que é ruído

| Ponto | Entra? | Onde, e com que correção |
|---|---|---|
| **3 — tools pequenas** | **Entra, já está certo** | Epic 88 já propõe T1/T2/T3 separadas. Acrescento a orientação inversa, que importa mais aqui: **menos tools é melhor**. O catálogo de 7 do @analyst é grande demais; os 3 do @pm estão certos; e por (C) são **zero** |
| **6 — idempotência** | **Entra, e é maior do que ele descreve** | Não é lógica de aplicação, é **constraint**. Hoje é check-then-insert sem UNIQUE, com race de webhook documentada. Precisa de índice único parcial sobre `(lead_id, scheduled_at)` para status ativos. **DDL é do @data-engineer**; a decisão arquitetural é que a garantia mora no banco, não no `if` |
| **7 — erros tipados** | **Entra como P0, independente de tudo** | `isSlotFree` descarta o `error` e devolve `!data`. Erro de rede = "livre" = confirmação por cima de outra visita. É bug de produção **hoje**, não requisito de tool. Não deve esperar epic nenhum |
| **8 — logs encadeados** | **Entra, e é o de maior ROI da lista dele** — ver §2.3 | Com a correção que o Epic 88 já acertou em §4.3 e que precisa virar regra da casa: **todo gate emite o par avaliado/disparado**. A lição do "zero `NICOLE_SLOT_MISMATCH`" é que um contador sozinho não distingue "está tudo bem" de "a guarda está cega" |
| **9 — separar conhecimento de ação** | **Ruído** | Já separado. Zero ganho |

Acrescento dois que não estão na lista dele e que os números pedem:

> **(a) Reconciliação diária fala × banco** (§2.3). É o que transforma 5 semanas de
> invisibilidade em 1 dia. Primeiro da fila, independente de qualquer decisão de tool.
>
> **(b) Instrumentar o funil das sete portas** (§2.5) — um evento por porta, com avaliado e
> passou. É o item 88-3 do Epic 88 e, na minha leitura, o de maior valor de todo o epic,
> inclusive porque é ele que decide se os itens caros são necessários.

---

## 5. "Contexto grande demais" — mede? Não. E o rastro certo é outro.

Medido em `system_events`, 30 dias, n=488:

| Métrica | Valor |
|---|---|
| Input tokens **não** cacheados / turno | **1.773** |
| Input tokens lidos do cache / turno | **4.726** |
| **Total de contexto por turno** | **~6.500 tokens** |
| Output tokens / turno | **76** |
| `CLAUDE_RESPONSE` p50 / p95 | **2.920 ms / 5.408 ms** |
| Turno percebido (`whatsapp_async_done`) p95 | **12.469 ms** (n=442) |

**6.500 tokens não é contexto grande.** É ~3% da janela do Sonnet. Nenhum fenômeno de
degradação por contexto longo é plausível nessa escala. **A causa nº 3 dele é falso
rastro** — com número, não com opinião.

O RAG **está** duplicado (`buildSystemPrompt` empurra `ragContext` de novo no bloco
dinâmico, com um comentário admitindo que é para não regredir a AC 7 da Story 21.3). É
desperdício e polui, mas cabe nos 6.500 tokens: é economia, não é causa.

**O rastro verdadeiro está ao lado, e é o oposto do que ele diz:**

```ts
// pipeline.ts:1534-1545
.order("created_at", { ascending: true })
.limit(limit)   // limit = 20
```

Isso pega a **cabeça** da conversa, não a cauda. Medido no corpus: **32 das 282 conversas
(11,3%) passam de 20 mensagens**, e **82 dos 1.129 turnos da Nicole (7,3%) são gerados com
o histórico já truncado** — o modelo não vê a troca imediatamente anterior.

> Não é contexto grande demais. É **contexto pequeno, na ponta errada**, em 7,3% dos turnos.

É o único achado que enfraquece "o modelo entende melhor que o parser": em 7,3% dos turnos
ele entende com a informação errada. É o Epic 87 · W1-1, e minha ordenação continua
valendo — vai **depois** da âncora de estado, porque ver a cauda aproxima a fala de visita
e deixa `isVisitSchedulingMode` **mais** propenso a ligar.

**Nota que muda a arbitragem D88-3:** o turno percebido é ~12,5 s no p95 e a chamada do
modelo é 5,4 s. **Há vários segundos por turno que não são o modelo** — MemPalace morto
(embedding pago + round-trips para tabelas inexistentes) e os laços sequenciais de
`isSlotFree` (`freeSlotsInPeriod` faz até ~20 consultas em série; `checkSlotAvailability`
outro tanto). O orçamento para uma segunda chamada existe, mas **não é gratuito — é
financiado**. Quem quiser gastar 2,9 s num loop de tool precisa primeiro recuperar esses
segundos. Com (C), o custo é 400–900 ms e a conta fecha sem obra.

---

## 6. Meu veto muda?

**Muda de "REPROVADO" para "ADIADO, com critério numérico de entrada".** E o que muda não é
o que o Gabriel supôs.

**O que a 75-279 mudou de fato (mais do que eu esperava):**
`__fixtures__/fake-supabase.ts` (223 linhas, filtros reais) e `pipeline-scheduling.test.ts`
exercitam `processMessage` de ponta a ponta, com o INSERT em `appointments` de verdade e
vermelho comprovado antes. E o `fakeAnthropic` já é uma função — capturar o
`MessageCreateParams` de entrada e afirmar sobre `system`/`messages`/`tools`/`tool_choice`
é uma mudança de ~5 linhas. **O item 88-2 é XS, não M.** A condição 4 da minha validação do
Epic 87 está a cinco linhas de ser cumprida. Isso derruba materialmente o risco de F-1
chegar a produção mudo — que era a espinha do meu veto técnico.

**O que não mudou, e por isso o veto não vira aprovação:**

1. **A premissa empírica do epic não tem lastro** (§2.2). "O parser vai continuar perdendo
   grafias" não se sustenta contra 60 dias de corpus.
2. **Dois dos incidentes que ele atribui ao parser são de outra classe** (Valnira,
   Sueli-aceite) e **o mecanismo de segurança do próprio epic desliga a tool neles** (§2.5).
3. **A tool não alcança o defeito da §2.6** ("semana de manhã" → três sábados), que mora do
   lado que o epic preserva.
4. **O instrumento continua desproporcional.** 11 itens, 4 ondas, 8 modos de falha novos —
   contra um caminho de 30 linhas (registrar a oferta), um cron de reconciliação e um
   extrator Haiku que fecham as mesmas classes com um décimo do raio.
5. **Três dos 11 itens já são obrigatórios e independentes** (88-1 `content[]`, 88-3 funil,
   88-4 flag em banco). Não são "preparo para a tool" — são higiene que deve sair mesmo que
   a tool nunca exista.

**A forma nova do veto — um critério, não uma opinião:**

> Executar o **Tier 1** (§7.3, tudo determinístico) e o **Tier 2** (extrator Haiku em
> shadow). Depois, **remedir o lastro** com a definição da §2.4 (`created_by='nicole'` a
> ±30 min da fala; baseline **31%**), pelo funil instrumentado.
>
> - **Lastro ≥ 90%** → a tool de escrita não se justifica. O Epic 88 vira o conjunto
>   88-1/88-3/88-4 (já entregues) e fecha.
> - **Lastro < 90%** → o Epic 88 sobe **como está escrito**, com o gap residual medido e
>   atribuído porta a porta, e eu assino. Nesse ponto a discussão deixa de ser sobre
>   arquitetura e passa a ser sobre um número que a gente não conseguiu mover.

Não é obstrução: é o único desenho em que a resposta a *"vai funcionar quando precisar?"* é
um dado e não uma convicção — que é exatamente o que o Epic 88 pede na Onda 2 dele, uma
onda antes e por um décimo do custo.

---

## 7. O panorama

### 7.1 O fluxo hoje

```
WhatsApp
   │
   ├─ webhook  ── transcrição de áudio vira content ─────────────────────────────┐
   │                                                                             │
   ├─ loadConversationHistory(limit 20, ascending)  ← CABEÇA da conversa ✗ 7,3%  │
   ├─ loadConversationState ── collected_data (14 chaves, sem tipo, sem âncora)   │
   ├─ loadAgentConfig ── agent_prompts (BANCO)  ✓ reconciliado 05/08, sem CI      │
   ├─ RAG + property data  (duplicado no prompt)                                  │
   │                                                                             │
   ├─ ►► MODO AGENDAMENTO — bloco determinístico  (pipeline.ts:738-920)          │
   │      gate: visit_proposed │ visit_availability │ pending │ regex na fala dela│
   │      resolveVisitSlotParts(msg + pendências + visit_availability) ⚠ veneno   │
   │         └─ pendingDay entra SEM guarda  ✗ "semana de manhã" → sábado         │
   │      evaluateSlot · checkSlotAvailability · freeSlotsInPeriod (~20 queries)  │
   │      → escreve `bookableSlotUtc` (LOCAL, morre no fim do turno)              │
   │      → NÃO registra o que ofereceu nem o que autorizou  ✗ o "Ok" evapora     │
   │                                                                             │
   ├─ system = 8 blocos cacheados + dinâmico + JSON CRU do collected_data ⚠       │
   ├─ anthropic.messages.create   (sem tools)  p50 2,9 s                          │
   ├─ content[0] as text → stripSystemBlocks → detectAffirmedSlot (79% precisão)  │
   ├─ extractCollectedData(assistantMessage)  ⚠⚠ grava a fala DELA no estado      │
   └─ if (bookableSlotUtc && !existingAppt) → INSERT appointments  ← 7ª porta     │
                                                                                  │
   turno percebido p95: 12,5 s  ◄──────────────────────────────────────────────────┘

   ✗ NADA compara a fala com a linha no banco  → Célia ficou 5 semanas invisível
```

### 7.2 O fluxo alvo

```
WhatsApp
   │
   ├─ loadConversationHistory(CAUDA de 20)                            [T1 · 87·W1-1]
   ├─ loadConversationState
   │    └─ agenda_state TIPADO, substituindo collected_data.visit_*   [T1 · 87·W1-2b]
   │         { origem: 'lead'|'sistema'|'nicole',
   │           citacao, data_absoluta, ancorado_em, expira_em,
   │           ofertas_do_sistema: [ISO…],      ← NOVO (§2.5)
   │           afirmado_pela_nicole: ISO|null } ← NOVO (§2.5)
   │
   ├─ ►► INTERPRETAÇÃO TEMPORAL — uma pergunta, uma autoridade
   │      1) parser determinístico (cobre ~100% do corpus medido)
   │         └─ pendingDay passa a respeitar a MESMA guarda de período  [T1 · §2.6]
   │      2) fallback: EXTRATOR (Haiku, tool_choice forçado)          [T2]
   │            input: SOMENTE mensagens role='user' + ofertas do sistema
   │            output: { dia_iso, hora, periodo, citacao, confianca }
   │            ⇒ procedência estrutural: não pode ver a fala da Nicole
   │      3) aceite de oferta ("Ok") resolve contra ofertas_do_sistema — sem modelo
   │
   ├─ ►► REGRAS DE NEGÓCIO — determinísticas, com os dois furos fechados
   │      evaluateSlot · isSlotFree (FAIL-CLOSED)                     [T1 · ponto 7]
   │      uma query de range em vez de ~20 sequenciais                [T1 · latência]
   │
   ├─ ►► ESCRITA — executor único, idempotente por CONSTRAINT         [T1 · ponto 6]
   │      bookVisit / rescheduleVisit / cancelVisit
   │      UNIQUE parcial (lead_id, scheduled_at) → @data-engineer
   │      grava afirmado_pela_nicole no estado ANTES de responder
   │
   ├─ system = blocos cacheados + dinâmico
   │      collected_data entra CLASSIFICADO por procedência, nunca como JSON cru
   │      [SISTEMA] nunca afirma intenção do lead sem citação literal  [87·W3-1]
   │
   ├─ anthropic.messages.create   (sem tools — ou com, se o lastro exigir) [T3]
   ├─ extração de texto percorre content INTEIRO                      [88-1, obrigatório]
   └─ guardas: detectAffirmedSlot com guarda de interrogação          [T1 · §2.8]
        régua = tabela `appointments`, jamais collected_data / [SISTEMA]

   ►► RECONCILIAÇÃO DIÁRIA fala × banco  ← O ITEM QUE FALTAVA        [T1 · §2.3]
      cron: afirmações de dia+hora nas últimas 24h sem appointment a ±30 min
            → alerta nomeado. Tempo de descoberta: 5 semanas ⇒ 1 dia

   FUNIL INSTRUMENTADO — um evento por porta, com avaliado E passou   [T1 · 88-3]
   PORTA_1_LEAD · PORTA_2_SEM_VISITA · PORTA_3_GATE · PORTA_4_SLOT ·
   PORTA_5_EXPEDIENTE · PORTA_6_LIVRE · PORTA_7_INSERT
```

### 7.3 O que falta, e a ordem

**Já existe e funciona** — não mexer: regras de negócio determinísticas; o modelo sem
autoridade de execução; o bloco `[SISTEMA]` como canal de fato autorizado (obedecido: 0
`MISMATCH` em 30 dias); o parser (cobre ~100% do corpus real); `stripSystemBlocks` e
`SANITIZED_EMPTY_FALLBACK`; o harness `fake-supabase` + `pipeline-scheduling.test.ts`;
os prompts reconciliados em 05/08.

| # | Item | Classe | Fecha | Custo |
|---|---|---|---|---|
| **0.1** | **Purgar os 59 estados; revisar à mão os 3 armados** | operação | as minas vivas (§2.7) | horas |
| **0.2** | **Reconciliação diária fala × banco, com alerta nomeado** | observabilidade | as 5 semanas da Célia (§2.3) | S |
| **T1.1** | `isSlotFree` fail-closed | bug de prod | overbooking silencioso | XS |
| **T1.2** | `pendingDay` respeita a guarda de período | bug de prod | "semana de manhã" → sábado (§2.6) | XS |
| **T1.3** | `detectAffirmedSlot` com guarda de interrogação | precisão | PM4 e 88-11 nascerem quebrados | XS |
| **T1.4** | Registrar **oferta** e **afirmação** no estado, com data absoluta | estrutural | Valnira, Idalina, Sueli-aceite (§2.5) | S |
| **T1.5** | Matar `extractCollectedData(assistantMessage)` nos campos de agenda | estrutural | Sandra, e as 46 datas que andam | S |
| **T1.6** | `agenda_state` tipado: procedência + âncora + TTL | estrutural | reincidência de T1.2/T1.5 | M |
| **T1.7** | Funil das 7 portas instrumentado (= 88-3) | observabilidade | "às vezes não funciona" vira número | S |
| **T1.8** | UNIQUE parcial em `appointments` (@data-engineer) | integridade | race de webhook | S |
| **T1.9** | `content` percorrido inteiro (= 88-1) | higiene | F-1, mesmo sem tool | XS |
| **T1.10** | `collected_data` sai do system prompt como JSON cru | estrutural | o fato falso entrando por dois canais (§2.5) | XS |
| **T2.1** | Extrator Haiku em **shadow**, comparado com o parser | IA | a assimetria de competência, com dado | M |
| **T2.2** | Histórico = cauda (= 87·W1-1), **depois** do T1.6 | contexto | os 7,3% de turnos cegos | XS |
| — | **REMEDIR O LASTRO** (baseline 31%) | decisão | decide o T3 | — |
| **T3** | Epic 88 como está | IA | atomicidade | L |

**Regra de corte única:** nada do T2 sobe antes do T1.5 e do T1.6, porque um extrator melhor
alimentando um estado envenenado apenas produz mentiras mais convincentes. É a mesma razão
pela qual o Epic 88 põe o 87·W1-2b como bloqueante — e nisso o @pm está inteiramente certo.

---

## 8. O Epic 87 está incoerente, e isso bloqueia o Epic 88 por escrito

Achado de governança, não de arquitetura, e precisa ser resolvido no papel antes de o @sm
redigir uma única story.

O Epic 87 **nunca foi editado** depois da minha validação de 05/08. Consequências:

| # | Incoerência | Efeito |
|---|---|---|
| **G-1** | O Epic 88 declara `depends_on: Epic 87 · W0-0` como **BLOQUEANTE** — e **`W0-0` não existe** no arquivo do Epic 87. O que existe é `W2-4`, na Onda 2 | O Epic 88 depende de um item inexistente. Rastreabilidade quebrada na primeira linha |
| **G-2** | O Epic 88 diz `substitui: Epic 87 · W4-1` — e o **W4-1 continua lá**, ativo | Dois epics reivindicam a mesma entrega. Quem executar o 87 na ordem escrita constrói a tool que o 88 redesenhou |
| **G-3** | A regra de corte da Onda 2 do Epic 87 diz, por escrito, que **nada das Ondas 3 e 4 começa antes do W2-1** — e o W4-1 (tool) é Onda 4 | **O Epic 87, como está no arquivo, proíbe o Epic 88 inteiro.** Se alguém aplicar a regra literalmente, o 88 não pode nem começar |
| **G-4** | Tetos de latência contraditórios: 87·D6 mede `CLAUDE_RESPONSE` + 30%; 88·D88-3 mede `whatsapp_async_done` + 10% | Duas ACs incompatíveis sobre a mesma decisão. A do 88 está certa (mede o que o lead sente); a do 87 precisa ser revogada explicitamente |
| **G-5** | F-7 do Epic 88 (prompt de produção mandando dizer "Agendei sua visita") **morreu em 05/08 20:58** | O epic carrega um risco Alto que não existe mais. Bom — mas mostra que o documento não está sendo mantido |

**Recomendação:** antes de qualquer story, o @pm faz **uma** edição no Epic 87 que (a) cria
o `W0-0` de fato ou renomeia o W2-4, (b) remove o W4-1 com nota de que migrou para o 88,
(c) revoga o D6 em favor do D88-3, e (d) registra o F-7 como fechado. É meia hora de
trabalho e é a diferença entre dois epics coerentes e dois epics que se contradizem no
primeiro dia de execução.

Registro também, sem rodeios, que este é o **terceiro** caso do mesmo padrão neste projeto:
o MemPalace foi auditado no código e não no banco; os prompts foram auditados no repo e não
em produção; e agora os epics estão sendo executados a partir da memória da discussão e não
do arquivo. **Documento que não é editado depois da revisão vira a mesma classe de
configuração fantasma que a gente passou dois epics tentando eliminar.**

---

## 9. Minha condição de aceite

Assino embaixo do caminho **se e somente se**:

1. **Os 3 estados armados forem desarmados hoje** e o purge das 59 linhas rodar antes de
   qualquer deploy. *Verificável:* zero `conversation_state` com `updated_at` > 48h e
   `visit_availability`/`visit_pending_*` preenchidos.
2. **A reconciliação diária fala × banco existir antes de qualquer mudança de
   comportamento.** *Verificável:* o job, rodado sobre 60 dias retroativos, lista Célia,
   Helena, Miriam, Sandra, Sueli, Valnira e Maria Oliveira. Se não listar, ele não serve.
3. **`isSlotFree` for fail-closed** e **`pendingDay` respeitar a guarda de período** antes
   de qualquer trabalho de tool. *Verificáveis:* teste em que a query devolve `error` e a
   função retorna "ocupado"; teste em que `"Semana de manhã"` com `visit_pending_date` num
   sábado **não** devolve sábados.
4. **O estado registrar oferta e afirmação com data absoluta**, com teste em que o lead
   responde **"Ok"** a uma oferta e o slot resolve sem chamar modelo nenhum. *Verificável:*
   o teste fica vermelho contra o `HEAD` de hoje — reencena Valnira.
5. **`extractCollectedData(assistantMessage, …)` deixar de escrever campos de agenda**, com
   teste em que a fala da Nicole contém "sábado" e o estado **não muda**. *Verificável:*
   reencena Nilson, cujo estado é a frase dela, hoje, em produção.
6. **O funil das 7 portas instrumentado e com baseline publicado** antes de qualquer
   mudança de comportamento. *Verificável:* o lastro de **31%** reproduzido pelo instrumento
   novo, não pelos meus scripts.
7. **`detectAffirmedSlot` não disparar nas seis strings interrogativas da §2.8** antes de
   qualquer promoção a fail-closed.
8. **A decisão sobre a tool sair de um lastro remedido**, com o critério da §6 escrito antes
   de medir — não depois.
9. **O Epic 87 ser editado** (§8, G-1 a G-5) antes de o @sm redigir a primeira story do
   Epic 88.
10. **A paridade de prompts ganhar mecanismo, não só reconciliação.** Ela foi feita em
    05/08 20:58 e vale hoje; sem o job de diff `agent_prompts` × snapshot versionado, ela
    apodrece de novo em semanas. *Verificável:* o job existe e falha quando alguém edita o
    painel.

---

## 10. Nota final, não técnica

O outro agente escreveu um bom documento. O problema dele não é qualidade — é que ele
descreve o sistema pelo **nome da tecnologia** ("um agente com tools") e não pela evidência
("um pipeline sem tools, com 9 detectores e 7 portas conjuntivas, cujo estado transcreve o
interlocutor errado e cuja fala ninguém confere contra o banco"). Toda vez que este projeto
se enganou — o MemPalace auditado no código e não no banco, os prompts auditados no repo e
não em produção, o parser acusado sem corpus, os epics executados de memória — o mecanismo
foi o mesmo: **raciocinar sobre o sistema descrito em vez de medir o sistema que roda.**

O Epic 88 é o melhor documento que o problema da agenda já recebeu: *"quem entende não tem
a caneta, e quem tem a caneta não entende"* é a formulação certa da assimetria. Meu
desacordo é sobre qual metade sai mais barato consertar. Ele propõe **dar a caneta a quem
entende**. Eu proponho **dar entendimento a quem já tem a caneta** — porque a caneta está
cercada de sete portas, 470 linhas a jusante e um estado que mente, e trocar a mão que a
segura não conserta nada disso.

E há uma frase que resume por que a reconciliação vem antes de tudo: **em 28/06 a Nicole
disse à Célia "Agendei sua visita", e o sistema levou cinco semanas para descobrir que não
tinha agendado. Hoje ele está pronto para agendar, sozinho, uma visita que ela não pediu.**
Nenhuma tool conserta um sistema que não se olha no espelho.

— Aria, arquitetando o futuro 🏗️
