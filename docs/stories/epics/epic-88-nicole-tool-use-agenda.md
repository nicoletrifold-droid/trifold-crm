---
epic: 88
title: Nicole — Tool use na agenda (a fala e a linha no banco viram o mesmo evento)
status: Draft
created_at: 2026-08-06
updated_at: 2026-08-07
created_by: Morgan (@pm)
priority: P0 (defeito reincidente em produção, com lead pago)
pedido_original: >
  Gabriel, 06/08/2026 — "fazer essa parte de chamada de tools de maneira sênior,
  garantindo que vai funcionar quando precisar". Motivo dado: "agenda mesmo às vezes
  não está funcionando".
origem:
  - Incidentes de agenda 23/06 → 06/08, auditados no banco pelo @po (06/08) — Helena, Célia,
    Miriam, Sandra, Ailton, Sueli, Valnira, Maria Oliveira (a Silvana saiu: era ligação, e ela aconteceu)
  - docs/architecture/2026-08-05-validacao-epic-87.md §5 (@architect REPROVOU a tool como desenhada no Epic 87 W4-1)
  - docs/research/2026-08-05-nicole-anti-alucinacao/analise-tecnica.md §2 (@analyst — 7 tools, tool_choice por estado)
  - docs/stories/75-279-nicole-grafia-hora-nao-agendou.story.md (fix de 06/08, InReview)
  - Inventário de contexto da Nicole (05/08), verificado contra código e banco de produção
substitui:
  - Epic 87 · W4-1 ("Tool de agenda") — item REPROVADO pelo @architect. Este epic é a
    resposta ao veto, com a fronteira redesenhada. W4-1 sai do Epic 87.
depends_on:
  - Epic 87 · W0-0 (paridade `agent_prompts` × código) — **bloqueia o item 88-9**, não o epic (F-7 morreu em 05/08; ver §8)
  - Epic 87 · W1-2b (estado com âncora, sem derivação da fala da Nicole) — **bloqueia o item 88-9**, não o epic (ver §8)
  - Epic 87 · W1-2c — **a metade de ESCRITA** (persistir `ofertas_do_sistema` e `afirmado_pela_nicole`;
    divisão arbitrada pelo @po em 07/08, `docs/qa/po-validation-87-3-87-4.md` §3) — **bloqueia o item
    88-7**: sem ela o gatilho turn-local é cego nos turnos "Ok" (ver §4.1). **O 88-7 NÃO depende da
    metade de LEITURA** (o "Ok" resolvendo contra a oferta = item `W3-2e`, Onda 3 do Epic 87): para
    o `tool_choice` forçado disparar basta a oferta estar persistida — quem resolve o slot é a tool
  - Epic 87 · W0-5 (reconciliação diária fala × banco) — **instrumento que dimensiona a v1**: mede o
    lastro remedido, e o lastro decide **escopo e ordem**, não a existência deste epic (ver §8.1)
  - Story 75-279 (InReview) — `detectAffirmedSlot`, `stripSystemBlocks`, `NICOLE_SLOT_UNAUTHORIZED`,
    `__fixtures__/fake-supabase.ts`, `pipeline-scheduling.test.ts` são a base deste epic
sequenciamento_e_dimensionamento:
  regra: >
    Este epic ACONTECE. Não está em julgamento e não está condicionado a nenhum número.
    REVOGADO em 07/08 o critério de existência da v0.2 ("lastro >= 90% a tool não se justifica;
    < 90% o epic sobe"): ele condicionava ARQUITETURA a ESTATÍSTICA. O lastro remedido define
    QUANDO e com QUE ESCOPO — quantas tools na v1, quais primeiro, se a de agenda entra sozinha
    ou acompanhada. Lastro alto ENCOLHE a v1; não a cancela. Ver §8.1.
  ordem_preservada: >
    A ordem NÃO muda, e as razões são técnicas, não estatísticas: (1) tool sobre estado que mente
    acelera o erro; (2) tool_choice forçado sobre gatilho envenenado fabrica os argumentos
    obrigatórios, inclusive a citação (F-2); (3) isSlotFree devolve "livre" quando a query FALHA;
    (4) o 88-2 (harness que afirma sobre a entrada do modelo) é pré-requisito real.
  liberado_agora: Onda 0 (88-1 a 88-4 e 88-13) — higiene obrigatória, vale mesmo sem tool
  depois_das_correcoes: >
    Ondas 1, 2 e 3 — atrás das correções determinísticas do Epic 87 (W0-5, W1-2b, W1-2c-escrita,
    W1-6, guarda do pendingDay), não atrás de um número.
revisado_por:
  - docs/qa/po-validation-epic-88.md (@po, 06/08 — GO 8/10, 7 correções obrigatórias, aplicadas em 07/08)
  - docs/architecture/2026-08-07-debate-tool-use-nicole.md (@architect, 07/08 — veto vira critério numérico;
    a conversão em CONDIÇÃO DE EXISTÊNCIA foi revogada em 07/08 pelo Gabriel — ver §8.1)
  - docs/qa/po-validation-87-3-87-4.md (@po, 07/08 — §3.4/§3.5: divisão do W1-2c e a edição A5, aplicada;
    §1.4: o viés da régua da PM2, que é parte do porquê da revogação)
epic_irmao:
  - 87 (docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md) — v0.5 (07/08): o bloco do gate
    na Onda 4 e o diagrama §9 já refletem "dimensionamento, não existência"; o `W1-2c` está dividido
    (escrita na Onda 1, leitura no `W3-2e` da Onda 3) e o `W1-7` (fala do corretor) existe na Onda 1
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

### Os incidentes de agenda, em 8 semanas — auditados no banco, um a um

> **Esta tabela substitui a de "14 dias" da v0.1.** A janela curta escondia os casos mais graves e
> incluía um que não é desta classe. Auditoria do @po (06/08, `messages` × `appointments` com
> `created_by` **e** `created_at`), ratificada pelo @architect (07/08).

| Data | Lead | O que aconteceu | Lastro no momento da fala |
|---|---|---|---|
| 23/06 | Helena | "Te espero no sábado às 10h" | ❌ `appointment` criado por **corretor na manhã seguinte** |
| **28/06** | **Célia** | **"Agendei sua visita para este sábado às 9h"** (após `"As 9"`) — a frase-molde literal do prompt de produção da época | ❌ **zero appointments até hoje. Cinco semanas. Ninguém corrigiu à mão** |
| 07/07 | Miriam | "Te esperamos amanhã, dia 8 de julho, às 11h" | ❌ `appointment` criado por **corretor na madrugada seguinte** |
| 27/07 → 05/08 | Sandra | Estado guardou a fala da própria Nicole; 9 dias depois o sistema afirmou "sábado dia 8" e ela confirmou | ❌ **contexto envenenado** — a única desta classe |
| 30/07 | Ailton | Afirmou "sábado, às 9h" com o slot autorizado às **10h** | ❌ mismatch de 1h, e `NICOLE_SLOT_MISMATCH` **nunca disparou** |
| 03/08 | Sueli | "Umas 14" não virou hora · "sexta às 14h fica fora do horário — mas às 14h estamos disponíveis" | ❌ `appointment` criado à mão pelo **corretor Odair, 04/08 09:55** |
| 04/08 | Valnira | Confirmou "quinta às 10h" e perguntou o horário 1 minuto depois | ❌ `appointment` criado à mão (**admin**), 04/08 11:21 |
| 06/08 | Maria Oliveira | "As 11hrs" não virou hora · a Nicole **fabricou** um bloco `[SISTEMA: … LIVRE]`, respondeu "LIVRE" a si mesma e confirmou | ❌ `appointment` criado à mão (**admin**), 2h depois |

**Placar: 6 de 7** — de sete incidentes de agenda, seis são "o modelo entendeu e não tinha a
caneta"; um (Sandra) é contexto envenenado. **A `Silvana` (24/07) saiu da tabela:** ela pediu
**ligação**, não visita (*"Eu prefiro que ele me telefone"*), a Nicole entendeu e respondeu certo, e
a ligação **aconteceu** — `lead_tasks` "ligar às 9:00", concluída 27/07 09:39. Ela não é incidente
deste epic (o defeito que ela expõe está em §9, item de backlog próprio).

**Célia é o caso mais limpo e o mais grave, e é anterior aos cinco da v0.1.** Ela mostra duas coisas
de uma vez: que o defeito tem **cinco semanas** e não duas, e que **nada no sistema compara o que a
Nicole diz com o que o banco tem** — por isso a reconciliação diária (Epic 87 · W0-5) é
pré-requisito deste epic e não uma métrica dele.

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

A prova está no número, agora medido direito (@po §5.1, @architect §2.4): de **16 falas** que
afirmam visita marcada entre 10/06 e 06/08, apenas **5 tinham `appointment` do pipeline no momento
da fala**. **Lastro = 31%.** Ou seja: **duas em cada três "visitas confirmadas" pela Nicole não
existem** quando ela diz que existem — e as que aparecem depois são, em boa parte, **conserto
humano**.

---

## 2. A decisão central, defendida

> **Tool use × grounding determinístico × híbrido.**
> **Decisão: híbrido, com fronteira única e explícita — o determinismo mantém a LEITURA, a tool
> assume a ESCRITA.**

### 2.1 A arbitragem entre @architect e @analyst

O @architect reprovou a tool (validação §5.1) com este argumento:

> *"Tool use conserta 'o modelo afirma um fato que não está no contexto'. Os incidentes são 'o
> contexto contém um fato falso e o modelo o repete fielmente'."*

**Ele está certo sobre a Sandra e errado sobre os outros seis.** A Sandra é o modo de falha
"contexto envenenado" — e para ele a tool não ajuda mesmo. Célia, Helena, Miriam, Sueli, Valnira e
Maria Oliveira são o modo **inverso**: o modelo afirmou porque **entendeu o que o parser não
entendeu e não tinha como registrar isso**. **Seis dos sete** incidentes auditados em 8 semanas são
desta classe.

**E a formulação precisa ser exata, porque a versão frouxa é atacável.** Dizer "o contexto estava
certo" é impreciso: em Maria e Valnira o bloco `[SISTEMA]` dizia *"o cliente não indicou o
horário"* — o que é **falso sobre o cliente** (ela indicou) e **verdadeiro sobre o sistema** (nada
foi autorizado). A frase defensável:

> **O contexto estava correto sobre a AUTORIZAÇÃO e errado sobre a INTENÇÃO do cliente. O modelo
> estava certo sobre a intenção e não tinha como registrá-la.**

É a mesma tese, dita de um jeito que não se derruba com um contra-exemplo.

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
| Célia — "As 9" não agendou (28/06) | **Sim** — e é o caso que mais custou |
| Helena / Miriam — confirmadas, appointment só no dia seguinte, à mão | **Sim** — atomicidade |
| Sueli — "Umas 14" + confirmação sem linha | **Sim** — atomicidade |
| Valnira — confirmou e não gravou | **Sim** |
| Sueli — "sexta às 14h está fora do horário… mas às 14h estamos disponíveis" | **Parcial** — o `tool_result` traz o expediente como fato estruturado; a contradição na mesma frase é guardrail de saída (Epic 87 · W3) |
| **Sandra — contexto envenenado afirmando "sábado dia 8"** | **Não sozinho.** Depende do Epic 87 · W1-2b. Ver §8 — e a `citacao_do_cliente` é a ponte |
| Ailton — afirmou 9h com slot autorizado às 10h | **Sim para a escrita** (fala e linha viram o mesmo evento), **não para a detecção** — a guarda que deveria ter pego está no Epic 87 · W2-3 |
| ~~Silvana~~ — compromisso de **ligação**, não de visita | **Fora de escopo.** Não havia visita a agendar, e a ligação aconteceu. O defeito que ela expõe é outro e está em §9 |
| **Valnira / Idalina — o lead responde "Ok" a um horário oferecido** | **Não como escrito.** O gatilho turn-local **não dispara** sem expressão temporal no turno. Depende do Epic 87 · W1-2c (**metade de escrita**) — ver §4.1 |

A `citacao_do_cliente` merece destaque, porque é onde este epic toca o caso Sandra: o executor
**valida deterministicamente** que o trecho citado existe numa mensagem `role='user'` daquela
conversa. A Nicole não conseguiria citar a Sandra dizendo "sábado" — ela nunca disse; a frase era
da própria Nicole. **A tool recusaria.** É o único mecanismo deste epic que ataca o modo de falha
que o @architect levantou, e por isso ele é obrigatório, não opcional.

### 2.5 A contra-evidência, registrada de propósito

Um epic que só cita o que o favorece não sobrevive à execução. O @architect rodou o parser de hoje
contra **1.351 mensagens de lead em 60 dias** e não encontrou **nenhuma** expressão temporal
legítima perdida — os 76 candidatos da rede larga são "Boa tarde", "uma vaga", "55m2", CPF, spam.
Ele achou o inverso: **um falso positivo** (*"o 7° andar me agrada"* → 7h).

> **Consequência honesta:** a premissa *"o parser vai continuar perdendo grafias novas"* **não tem
> lastro no nosso corpus**. O que está medido não é o parser perdendo — é **o sistema não
> autorizando** e ninguém percebendo. Isso não derruba a tese da assimetria (Célia, Sueli, Valnira
> e Maria são reais e o `created_by='nicole'` é 31%), mas derruba o argumento fácil — e é **a razão
> de a v1 ser dimensionada pelo lastro remedido** em vez de subir com o escopo máximo por default
> (§8.1). **Não é razão para condicionar a existência da tool a um número:** o argumento a favor
> dela é o §2 (duas autoridades sobre o mesmo fato), que não depende de frequência.

Vale também o registro do @architect de que **falso positivo de parser é estritamente pior que
falso negativo**: falso negativo faz o sistema perguntar de novo; falso positivo faz o sistema
**gravar** um horário que ninguém pediu. Cada afrouxamento (75-268, 75-279) comprou recall já
quase saturado e vendeu precisão.

---

## 3. Catálogo de tools da v1

**A v1 tem UMA tool de escrita.** T2 e T3 saem para o item diferido 88-12 (correção do @po, §6).

| # | Tool | Argumentos | Fonte da verdade | v1? |
|---|---|---|---|---|
| **T1** | `agendar_visita` | `dia` (ISO), `hora` (HH:MM), `citacao_do_cliente` | `appointments` + `closeHourFor` | **sim** |
| **T2** | `remarcar_visita` | `novo_dia`, `nova_hora`, `citacao_do_cliente` | idem, com `excludeAppointmentId` | **não — 88-12** |
| **T3** | `cancelar_visita` | `citacao_do_cliente` | idem | **não — 88-12** |

**Por que T2/T3 saíram (a v0.1 dizia que entravam "de propósito").** O argumento era prevenir a
divergência fala × banco na remarcação. **A demanda foi medida e é zero:** mensagens de lead
pedindo remarcar / desmarcar / adiar / "outro dia" / "outro horário" / "não vou poder" desde 10/06 =
**0 em ~8 semanas**. Não há divergência a prevenir num caminho que o lead nunca exerce. O custo de
mantê-las é concreto: **dois caminhos de escrita a mais no PR mais arriscado do epic** (88-9, risco
Alto, arquivo de 1.947 linhas) e três schemas no prefixo cacheável.

> **O que NÃO muda:** o **executor** do 88-5 continua expondo `rescheduleVisit()` e `cancelVisit()`
> — isso é barato e é o que garante a caneta única. O que fica diferido é apenas **expor as duas ao
> modelo**, no 88-12, com a mesma flag e o mesmo rollout, depois de T1 estável. Não custa uma
> segunda onda de rollout: o rollout já estará construído.

**Contrato universal, inegociável** (herdado da recomendação do @analyst): nenhuma tool devolve
vazio ambíguo. Todo retorno tem `status` explícito e uma `instrucao` do que a Nicole pode dizer.
**Erro de infraestrutura nunca vira "não encontrei"** — vira `status: "indisponivel"` com
instrução de não afirmar nada. Hoje `isSlotFree` (`visit-slot.ts:465`) descarta o `error` e
devolve `!data` — timeout do Postgres vira "horário livre" e a Nicole confirma por cima de outra
visita.

> **Correção de ponteiro (a v0.1 dizia "item 88-4", que é a flag):** o `isSlotFree` fail-closed é
> parte do **88-5** (executor único). **E ele não deve esperar o executor:** é bug de produção
> **hoje**, XS, classificado pelo @architect como **P0 independente de qualquer decisão de tool**.
> Pode e deve sair sozinho, num PR próprio, antes de tudo — o item 88-5 apenas garante que a
> correção não se perca se isso não acontecer.

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
> nunca de `visit_availability` ou `visit_pending_*`. E por isso o Epic 87 · W1-2b é bloqueante
> **do 88-9**. A citação validada é a segunda barreira: fabricou, não casa, recusa.

> ⚠️ **O furo do gatilho turn-local, achado pelo @architect (07/08 §2.5) — e ele é sério, porque
> desliga a tool justamente onde este epic promete valor.** *"Ok"* **não tem expressão temporal.**
> Quando a Nicole oferece um horário concreto e o lead aceita sem repetir ("Ok", "Pode ser",
> "Isso") — **6 ocorrências em 60 dias, incluindo Valnira e Idalina** — o gatilho não abre, o
> `tool_choice` volta a `auto`, e voltamos a "o modelo lembra ou não", que é exatamente o que o
> Gabriel pediu para não acontecer.
>
> **Correção, e ela não é deste epic:** o gatilho passa a ser *"expressão temporal na mensagem do
> lead **ou** o turno anterior registrou oferta/afirmação no estado"*. Isso exige que a oferta seja
> **registrada** — **Epic 87 · W1-2c, a metade de ESCRITA** (`ofertas_do_sistema`), que por isso
> entra em `depends_on` como **bloqueante do 88-7** (a primeira onda em que o gatilho é exercido,
> ainda que em shadow).
>
> ✅ **A metade de LEITURA não bloqueia nada aqui, e isso precisa estar escrito** (arbitragem do @po,
> 07/08, `docs/qa/po-validation-87-3-87-4.md` §3.4). O `W1-2c` foi dividido: a **escrita** fica na
> Onda 1 do Epic 87; a **leitura** — o `"Ok"` do lead resolver deterministicamente contra a oferta —
> vira o item `W3-2e`, na Onda 3, atrás do validador **e** da guarda de interrogação (88-13)
> *(registrado no roadmap do Epic 87 desde a v0.5 — Onda 3)*. **O 88-7
> NÃO depende do `W3-2e`:** para o `tool_choice` forçado disparar basta o gatilho **saber que existe
> uma oferta viva**; quem resolve o slot depois é a tool — é literalmente a fronteira do §2.3 ("o
> determinismo mantém a LEITURA da disponibilidade, a tool assume a ESCRITA"). A resolução
> determinística do `"Ok"` é, no mundo deste epic, **redundante com a tool**; ela só faz falta no
> caminho em que a tool não existe.
>
> ⚠️ **Não "restaure" a leitura para a Onda 1 citando urgência do Epic 88.** Ela é caminho de decisão
> novo (o `"Ok"` passaria a criar `appointment` sem o lead ter dito dia nem hora em turno nenhum) e
> hoje seria alimentada por `afirmado_pela_nicole`, um sinal com **21% de erro** medido. Antecipá-la
> não desbloqueia nada deste epic — só adiciona risco.
>
> **A leitura estratégica:** o item barato do Epic 87 é pré-requisito do item caro daqui, **nos dois
> caminhos possíveis** — com tool ou sem tool. É o argumento mais forte para ele sair primeiro.

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
| **F-4** | Citação com falso negativo: acento, erro de digitação, transcrição de áudio, paráfrase do modelo → recusa de agendamento **legítimo** | **Alta** | Normalização (acento/caixa/pontuação) + casamento por trecho contra **todas** as mensagens `role='user'` da conversa, não só a do turno · casador e corpus retrospectivo no **88-6**; **taxa medida em produção no 88-8**, antes de recusar valer |
| **F-5** | Latência percebida sobe e o lead sai da conversa | **Média** | Compensação no `typing-delay` (§6.3) + medição em `whatsapp_async_done`, não em `CLAUDE_RESPONSE` (D88-3) |
| **F-6** | Cache de prompt invalidado a cada mudança de schema de tool | **Baixa** | Ordem do prefixo cacheável é `tools → system → messages`: muda **uma vez** por deploy que altere o schema; a 2ª chamada do loop **acerta** o cache. Não é argumento contra |
| ~~**F-7**~~ | ~~`visit-scheduling` de produção manda dizer "Agendei sua visita…"~~ → **MITIGADO em 05/08 20:58. Vira nota histórica** (abaixo) | ~~Alta~~ → **Baixa** | O prompt foi reconciliado em produção; o que falta é **mecanismo** (job de diff em CI). `W0-0` deixa de bloquear o epic e passa a bloquear o **88-9** |
| **F-8** | Áudio sem transcrição → sem citação possível → lead que só manda áudio não consegue agendar | **Baixa** | Verificado: a transcrição **vira o `content`** da mensagem (`whatsapp/route.ts:647`), então a citação funciona. Sem transcrição, o webhook já responde pedindo texto |
| **F-9** | O gatilho turn-local **não dispara** quando o lead aceita uma oferta sem repetir o horário ("Ok") → a tool fica em `auto` justamente nos turnos que este epic promete fechar | **Alta** | Epic 87 · **W1-2c, metade de ESCRITA** (persistir `ofertas_do_sistema`) é **bloqueante do 88-7**; gatilho passa a incluir "o turno anterior registrou oferta". **A metade de LEITURA (`W3-2e`, Onda 3) NÃO bloqueia o 88-7** — quem resolve o slot é a tool. Ver §4.1 |

> **F-7 — nota histórica, e a lição é maior que o risco.** Até 05/08 o `visit-scheduling` de
> produção — um fork editado à mão no painel, sem autor nem data — mandava a Nicole dizer
> literalmente *"Perfeito, [nome]! Agendei sua visita para [dia] as [horario]… O endereco do stand
> e [endereco do empreendimento]"*. **A prova de que o risco era real é a Célia:** em 28/06 ela
> recebeu essa frase-molde, palavra por palavra, com zero appointments.
>
> **Foi reconciliado em produção em 05/08 20:58** (verificado no banco: `"Agendei sua visita"` = 0,
> `"stand"` = **0 nos 7 slugs**, `visit-scheduling` com 5.105 chars e `is_active=true`). **Nenhum
> item deste epic tem AC de prompt** — a descrição da tool vive em código justamente para o painel
> não sobrescrevê-la. Por isso o `W0-0` **não bloqueia mais o epic**.
>
> **Onde ele volta a valer: no 88-9.** Quando a tool entrar em enforce, o prompt precisa dizer *"a
> ÚNICA forma de marcar visita é chamar a tool"* — e sob a decisão **D-87-0-a** do Gabriel esse
> texto vai para o **banco**. Sem paridade com mecanismo (job de diff em CI), um save no painel
> desfaz isso em silêncio.

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
| **88-13** | **`detectAffirmedSlot` ganha guarda de interrogação/oferta** — não dispara em "que tal / posso confirmar / fica melhor / prefere / até as / vou confirmar" nem em segmento interrogativo. As 6 strings reais viram fixtures | XS | Nenhum | @dev |

**88-3 é a métrica do pedido do Gabriel.** `NICOLE_SLOT_UNRESOLVED` conta, com volume de turno,
quantas vezes "a agenda não está funcionando". Hoje esse número não existe.

**88-13 — item novo, fora da sequência numérica de propósito (nasceu depois da revisão do @po; a
ordem correta é a da tabela, não a do número).** O @architect classificou as 28 falas em que
`detectAffirmedSlot` disparou em 60 dias: **6 não são afirmações — são perguntas ou ofertas**
(*"Qual horário no sábado fica melhor pra você?"*, *"Vou confirmar a disponibilidade para sexta,
dia 7, às 14h e já te aviso"*). **Precisão ≈ 79%, ou seja 21% de falso positivo.** Duas
consequências que quebram itens deste epic se não forem tratadas antes:

1. **PM4 ("`NICOLE_SLOT_UNAUTHORIZED` tende a 0") é inatingível como escrita** — existe um piso
   irredutível de ~20% de disparos legítimos.
2. **O 88-11 (fail-closed) nasceria travando atendimento legítimo:** uma em cada cinco vezes que
   bloqueasse, estaria bloqueando a Nicole **perguntando** o horário — e trocando a pergunta por
   *"deixa eu conferir certinho"*, que num contexto interrogativo é um não-sequitur.

Custo XS, e é pré-requisito de duas coisas que este epic promete medir. Vem do @architect §2.8.

**88-4 — por que banco e não env.** Env do Vercel só vale após `vercel redeploy`; e o webhook da
Nicole roda no projeto `prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c` (freelans), **não** no projeto apontado
por `.vercel/project.json` deste repositório. Flag em `agent_config` (já lido a cada turno) dá
rollback instantâneo, sem deploy e sem o gotcha do `vercel env add` gravando vazio. A AC é de
**efeito**, não de existência: virar a flag, mandar mensagem real, provar a mudança, voltar.

#### Onda 1 — Autoridade de escrita única, ainda sem modelo

| ID | Item | Esforço | Risco | Executor |
|---|---|---|---|---|
| **88-5** | Extrair `bookVisit()` / `rescheduleVisit()` / `cancelVisit()` — **executor único**: valida expediente, disponibilidade (`isSlotFree` **fail-closed**), idempotência **garantida por constraint** (índice UNIQUE parcial em `(lead_id, scheduled_at)` para status ativos — DDL do @data-engineer), faz o INSERT e notifica. O pipeline atual passa a chamá-lo no ramo `day && time`. Comportamento idêntico, exceto fail-closed | M | Médio | @dev + @data-engineer |
| **88-6** | **Casador de citação (`quoteMatchesLeadMessage`) + corpus retrospectivo**: normalização (acento/caixa/pontuação), testado contra as conversas reais em que o slot **foi** resolvido — para cada uma, a frase do lead que originou o horário tem de casar | S | Nenhum | @dev |

Sequência deliberada: **a caneta única existe antes de o modelo poder alcançá-la.** Quando a tool
chegar, ela não inventa caminho de escrita — chama o mesmo executor que já está em produção e
observado.

> **Correção de sequência no 88-6 (@po §6), e ela salva a intenção do item.** A v0.1 prometia que o
> 88-6 mediria *"o falso negativo da citação semanas antes de ele poder recusar"*. **Não é
> executável nesta posição:** `citacao_do_cliente` é um **argumento produzido pelo modelo**, e o
> modelo só produz argumento na Onda 2 (88-7). Em Onda 1 não há citação para casar — o item mediria
> o nada.
>
> **O que muda:** o 88-6 entrega o **casador** e o **corpus retrospectivo** (construído das
> conversas em que o slot foi resolvido), o que mede o falso negativo **sem depender do modelo** e é
> o que o epic realmente queria. **A medição em produção da taxa de casamento vai para o 88-8**,
> onde a citação existe. **F-4 e D88-5 apontam para o 88-8**, não para o 88-6.
>
> **A idempotência por constraint** (índice UNIQUE) entrou no 88-5 por decisão arquitetural do
> @architect: hoje `pipeline.ts:1220-1236` é check-then-insert **sem UNIQUE no banco**, com race de
> webhook documentada (duas respostas no mesmo segundo, 27/07). A garantia mora no banco, não no
> `if`. (Isso é diferente do "lock por conversa", que continua fora de escopo — §9.)

#### Onda 2 — Shadow: a tool roda, e não escreve

| ID | Item | Esforço | Risco | Executor |
|---|---|---|---|---|
| **88-7** | Definição de **T1** (só ela) + segunda chamada em **shadow**, disparada **depois** de a resposta real ser enviada (fire-and-forget), com `tool_choice` forçado pelo gate turn-local **já corrigido** (inclui "o turno anterior registrou oferta" — Epic 87 · W1-2c, **metade de ESCRITA**; **não** depende do `W3-2e`) | L | Baixo | @dev + @architect |
| **88-8** | Comparador e relatório: concordância tool × parser, **taxa de citação válida medida em produção** (F-4, D88-5), latência **real** do loop, `EXPECTED` vs `CALL` | M | Nenhum | @qa + @data-engineer |

**Esta é a onda que responde "vai funcionar quando precisar?" com dado, não com opinião.** O
shadow custa uma chamada extra de modelo nos turnos de agendamento, **zero latência percebida**
(roda após o envio) e produz, em 7 dias, a resposta para: em quantos turnos o modelo resolveu o
slot que o parser não resolveu, e em quantos ele discordou do parser quando o parser acertou.
Cada discordância vai para revisão manual — n pequeno é aceitável para julgamento qualitativo.

**Critério de saída da Onda 2 (todos).** Corrigido: **percentual sobre n de um dígito é teatro** —
a estes volumes, o alvo é **contagem absoluta com revisão caso a caso**, não taxa.

1. `EXPECTED == CALL` em 100% dos turnos forçados (qualquer desvio é bug nosso).
2. **Zero divergências em que a tool errou** — cada discordância tool × parser revisada uma a uma.
3. **Zero recusas de intenção legítima** por citação — cada recusa revisada uma a uma (mede F-4).
4. p95 do loop completo medido, dentro do teto de D88-3.
5. Golden set 100% verde, com vermelho comprovado antes.

> **Por que não "≥ 95%".** Falas de confirmação de visita são **~2 por semana**; em 14 dias há
> ~4 observações. Um alvo percentual sobre n=4 só pode dar 100% ou 75% — ele não distingue nada.
> **Um 4/4 limpo contra um baseline de 31% já é evidência forte (p<0,01)**, desde que dito como
> contagem e não como taxa.

#### Onda 3 — Enforce, com rollout progressivo

| ID | Item | Esforço | Risco | Executor |
|---|---|---|---|---|
| **88-9** | Liga o loop; **remove no mesmo PR** o ramo do parser que setava `bookableSlotUtc`; `tool_choice` forçado; compensação no `typing-delay` | L | **Alto** | @dev + @architect |
| **88-10** | Rollout: canário (números internos) → 10% dos turnos de agendamento → 100%, com gatilhos de rollback escritos antes de cada degrau | M | Alto | @devops + @qa |
| **88-11** | `NICOLE_SLOT_UNAUTHORIZED` promovido a **fail-closed apenas na classe agenda**: regenera 1× e, persistindo, usa fala de reserva neutra (o padrão `SANITIZED_EMPTY_FALLBACK` da 75-279). **Só depois do 88-13** — sem a guarda de interrogação, ele trava 1 em cada 5 turnos legítimos | M | Alto (D88-4) | @dev + @qa |

#### Depois da v1 — diferido

| ID | Item | Esforço | Risco | Executor |
|---|---|---|---|---|
| **88-12** | Expor **T2 `remarcar_visita`** e **T3 `cancelar_visita`** ao modelo (o executor já as tem desde o 88-5). Mesma flag, mesmo rollout | S | Médio | @dev |

**88-12 só entra com demanda medida.** Hoje ela é **zero em 8 semanas**. O gatilho para tirá-lo da
geladeira é dado, não calendário: aparecerem pedidos de remarcação/cancelamento no corpus, ou o
time reportar remarcação feita à mão com divergência fala × banco.

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
   **O baseline já existe e é declarado aqui, não na Onda 0:** `whatsapp_async_done.ms_async`,
   14 dias, **n=442 · p50 = 7.435 ms · p95 = 12.469 ms · máx = 26.037 ms**. Com o teto de +10%:
   **13.716 ms**. O round-trip estimado (+1,1 a 1,6 s) **estoura** esse teto **sem** a compensação
   do `typing-delay` — ou seja, **o D88-3 é um gate real e não uma formalidade**, e a frase de que
   "a compensação é obrigatória e vai no mesmo item" está tecnicamente certa.
   *(O Epic 87 · D6 foi formalmente revogado em favor deste teto — um teto, um dono, um documento.)*
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
| **PM2** | **Lastro da confirmação.** Numerador: falas em que existe `appointment` do lead com `scheduled_at` em ±30 min do horário afirmado **e** `created_by='nicole'` **e** `created_at ≤ fala + 2 min`. Denominador: todas as falas que afirmam visita marcada | **Epic 87 · W0-5** (job de reconciliação diária) | 16 falas em 8 semanas (~2/semana) | Baseline medido: **31% (5/16)** → **zero falas sem lastro** na janela |
| **PM3** | **`NICOLE_SLOT_UNRESOLVED`** — gate aberto, lead falou de hora, parser não resolveu | `system_events` (88-3) | por turno — o maior denominador disponível | Baseline a medir → **queda ≥ 80%** |
| **PM4** | **`NICOLE_SLOT_UNAUTHORIZED`** — afirmou dia+hora sem autorização | `system_events` (75-279) **depois do 88-13** | por turno | Baseline a medir → **tende ao piso**, não a 0 |
| **PM5** | **Concordância tool × parser** e **taxa de citação válida** | Shadow (88-8) | turnos de agendamento / 7 dias | **zero divergências em que a tool errou · zero recusas legítimas** (revisão caso a caso) |
| **PM6** | **`EXPECTED` vs `CALL`** | `system_events` | por turno forçado | **igualdade absoluta** — desvio é incidente |
| **PM7** | **Recusas por motivo** (`citacao_nao_encontrada`, `ocupado`, `fora_do_expediente`) | `NICOLE_TOOL_REFUSED` | por chamada | Estável; salto = guarda travando atendimento legítimo |
| **PM8** | **Não matar o paciente** — `appointments created_by='nicole'` por semana e visitas criadas à mão logo após conversa da Nicole, + proxies de volume (taxa de resposta do lead ao turno seguinte, `HANDOFF_TRIGGERED`/conversa) | banco + `system_events` | **n ≈ 1/semana — declaradamente NÃO conclusiva** | Monitorada só para catástrofe. **Gatilho só liga depois do 88-3**, que cria o denominador "turnos de agendamento" |

> **PM2 — o que se FAZ com o resultado dela mudou em 07/08; como se calcula, não.** A definição
> acima continua valendo palavra por palavra (é ela que impede a métrica de contar o conserto humano
> como sucesso). O que foi revogado é o uso dela como **critério de existência** deste epic — ela
> passa a **dimensionar a v1** (§8.1). Duas ressalvas de procedência, que quem for citar o número
> precisa carregar junto:
>
> 1. **O `31%` é baseline manual, e está sendo superado pelo instrumento.** A régua rodada
>    exatamente como especificada contra 60 dias de produção dá **7%** (`po-validation-87-3-87-4.md`
>    §1.4), por quatro causas medidas: denominador diferente (16 falas curadas × 30 disparos do
>    instrumento), unidade nunca declarada (fala × lead), filtro de `status` que contradiz a própria
>    Dev Note da story, e o balde `lembrete` ausente — que rotula **lembrete de visita que já
>    existia** como "conserto humano".
> 2. **O viés tem direção.** Ele **subconta** lastro, isto é, empurrava exatamente para o lado
>    *"<90% → o Epic 88 sobe"*. **Uma métrica cujo viés aponta para a conclusão que ela deveria
>    arbitrar não é instrumento — é advogado** (@po). Enquanto a recalibração da Story 87-3 (B6) não
>    entrar, **nenhum número desta métrica autoriza nem veta decisão de arquitetura** — ele informa
>    escopo e ordem.

**PM8 está aqui com a ressalva explícita.** Ela não pode ser critério de aprovação — não detecta
regressão de até ~70%. Quem detecta é PM2 (contagem com definição honesta) e PM3 (volume de turno).
Qualquer métrica com n < 10/semana entra no runbook marcada como **não conclusiva**, seguindo a
condição 8 do @architect. **PM8 é a régua única de "não matar o paciente" nos dois epics** — a M10
do Epic 87 era a mesma métrica com outro nome e virou ponteiro para cá.

### 7.1 As três correções que a v0.1 tinha errado, e por que importam

**(a) PM2 contava o conserto humano como sucesso.** Como estava escrita ("existe `appointment` em
±30 min", sem autor nem janela), a linha de base saía em **81%** e **Sueli, Valnira e Maria
Oliveira — os incidentes que motivaram o epic — contariam como sucesso**, porque um humano criou a
visita horas depois. Com o alvo em "≥95%", o epic estaria a três casos de ser aprovado **sem
escrever uma linha de código**. Pior: a métrica **melhora sozinha quando o time trabalha mais**.

**(b) O baseline não era 50%.** O "6 de ~12" misturava populações: o **6** eram `appointments
created_by='nicole'` no total do projeto; o **~12**, leads **sem** appointment de um filtro largo —
numerador de sucessos sobre denominador de falhas. O §1 do próprio epic já dizia "1 em cada 3" e
contradizia o §7. **Medido direito: 31% (5/16).**

**(c) PM4 nunca teve oportunidade de disparar.** `NICOLE_SLOT_UNAUTHORIZED` tem **0 eventos** — mas
a 75-279 foi mergeada às **10:05** de 06/08 e a conversa da Maria foi às **07:04**. Zero aqui não
significa nada: é a armadilha do §4.3 deste epic ("EXPECTED > 0 e CALL == 0") aplicada à métrica que
ele elege como prova. **AC obrigatória do 88-3: provar que o evento dispara** — reencenar em
produção ou aceitar a primeira ocorrência real como validação do instrumento. E o alvo é "tende ao
piso", não "tende a 0", porque o 88-13 mostrou que ~20% dos disparos são perguntas legítimas.

---

## 8. Dependências do Epic 87 — o que é bloqueante e por quê

| Item do Epic 87 | Bloqueia o quê? | Por quê |
|---|---|---|
| **W0-0** — paridade `agent_prompts` × código | **o item 88-9** (não o epic) | F-7 **morreu** em 05/08 20:58: o prompt foi reconciliado, `"Agendei sua visita"` = 0, `"stand"` = 0 nos 7 slugs. **Nenhum item deste epic tem AC de prompt** — a descrição da tool vive em código. Volta a valer no enforce, quando o prompt precisa dizer "a única forma de marcar visita é chamar a tool" — e, sob **D-87-0-a**, esse texto vai para o **banco** |
| **W1-2b** — âncora + estado não nasce da fala da Nicole | **o item 88-9** (não o epic) | `tool_choice` forçado sobre gate envenenado fabrica argumento (F-2) — **mas o gatilho é uma conjunção turn-local**: aplicado ao caso Sandra (*"Tenho interesse no VIND Residence"*, sem expressão temporal), **o forçamento não dispararia**. Some-se a citação validada (ela não consegue citar a Sandra dizendo "sábado" — a Sandra nunca disse) e são duas barreiras independentes. Além disso **nada é forçado contra um lead real antes da Onda 3**: a Onda 2 roda em shadow, depois do envio |
| **W1-2c** — estado registra oferta e afirmação do sistema — **metade de ESCRITA apenas** | **o item 88-7** | Sem ela o gatilho turn-local é **cego nos turnos "Ok"** (F-9, §4.1) — a tool não dispararia em Valnira/Idalina/Sueli-aceite, que são casos que este epic promete fechar. **A metade de LEITURA (`W3-2e`, Onda 3 do Epic 87) não bloqueia nada aqui:** o gatilho só precisa saber que **existe oferta viva**; quem resolve o slot é a tool (@po, 07/08 §3.4) |
| **W0-5** — reconciliação diária fala × banco | **instrumento de dimensionamento** (não é gate de existência) | É o instrumento que mede o lastro remedido — o número que define **escopo e ordem** da v1 (§8.1). Sem ele, PM2 é métrica sem instrumento. **Ele não decide se este epic existe** |
| **W2-1** — harness | **Parcial — já pago** | A 75-279 entregou `__fixtures__/fake-supabase.ts` (filtros reais) e `pipeline-scheduling.test.ts` com INSERT exercitado e vermelho comprovado. Falta o lado da **entrada** do modelo = item **88-2**, e o `fakeAnthropic` já é função: o @architect estimou a mudança em **~5 linhas (XS, não M)** |
| **MemPalace desligado por flag** (Epic 87 · D2/W0-2) | **habilitante — latência** | O p95 percebido **já é 12,5 s**, e parte disso é MemPalace morto (1 Haiku + N embeddings + 3 a 9 round-trips falhos por turno). É a diferença entre caber e não caber no teto do D88-3: **o orçamento para a 2ª chamada é financiado, não gratuito** |
| **W3** — validador pós-resposta | **Não** | Complementar. O 88-11 promove uma regra da classe agenda; o resto do validador segue no Epic 87 |
| **W4-1** — tool de agenda | **Substituído** | Saiu do Epic 87 em 07/08 (v0.2). É este epic |

### 8.1 O lastro remedido — critério de **sequenciamento e dimensionamento**, não de existência

> **Correção de 07/08, do Gabriel, e ela está aceita.** Até a v0.2 este bloco dizia: *"lastro ≥ 90%
> → a tool de escrita não se justifica e o epic fecha reduzido; < 90% → o epic sobe como está
> escrito"*. **Isso condicionava ARQUITETURA a ESTATÍSTICA, e está REVOGADO.** Palavras dele:
> *"tool use é arquitetura de agente, deveria ser feito de maneira sênior independente de outro
> resultado, pois é uma forma de boas práticas para o agente de fato funcionar certo."*

**A formulação que vale:**

> **Este epic acontece. Não está em julgamento.** O lastro remedido define **quando** e com **que
> escopo**: quantas tools na v1, quais primeiro, se a de agenda entra sozinha ou acompanhada. Se o
> lastro subir muito com as correções de fundação, o escopo da v1 **encolhe** — não desaparece.

#### Por que a existência não podia estar condicionada a um número

**(1) O argumento a favor da tool nunca foi estatístico.** Está no §2, e é de desenho: **hoje a fala
confirma a visita e um código separado decide se grava.** Duas autoridades sobre o mesmo fato.
**Isso continua errado com lastro de 95%** — um sistema em que *"eu disse que agendei"* e *"existe
agendamento"* são decisões independentes vai divergir de novo, só que com **menos frequência**. E
menos frequente é **mais difícil de detectar**, não menos grave: é a armadilha do §4.3 (*"zero
eventos = está tudo bem"*), que este epic passa 400 linhas denunciando, aplicada ao próprio critério
de aprovação dele. A Célia ficou **cinco semanas** invisível porque era rara.

**(2) O número que arbitraria o gate está enviesado, e o viés aponta para um dos lados.** O @po
rodou a régua da PM2 **exatamente como especificada** contra 60 dias de produção
(`docs/qa/po-validation-87-3-87-4.md` §1.4): dá **7%**, não 31% — quatro causas medidas (denominador,
unidade fala × lead, filtro de `status` contraditório, balde `lembrete` ausente). O erro é **para
baixo**, ou seja, empurrava para *"<90% → o epic sobe"*. **Decidir arquitetura com um número não
calibrado é o pior dos dois mundos: ou se constrói pelo motivo falso, ou se deixa de construir pelo
motivo falso.** A recalibração é a correção **B6** da Story 87-3 e precede qualquer citação do
número.

> ⚠️ **A reformulação NÃO tornou a métrica menos importante — mudou a natureza do dano, não a
> gravidade.** Com o gate antigo, um instrumento que publicasse 0% falso (o `Invalid Date` do risco 7
> da 87-3) **aprovava a v1 errado**. Com o critério novo, o mesmo 0% falso passa a **encolher ou
> inchar a v1 errado**: dimensiona escopo, ordem e degraus de rollout a partir de um número que não
> corresponde ao mundo. **É o mesmo instrumento mentindo, com consequência diferente e igualmente
> cara** — e agora ele mente sobre *quanto construir* em vez de sobre *se construir*, que é uma
> pergunta feita com mais frequência. **A B6 fica mais crítica, não menos**, e os riscos 7 e 8 da
> Story 87-3 continuam válidos com o enunciado atualizado.

#### O que o lastro remedido decide — e o que ele não decide

| Decide (sequenciamento e dimensionamento) | **Não** decide |
|---|---|
| **Escopo da v1:** quantas tools de escrita entram na primeira leva e quanto fica diferido (o **88-12 continua preso a demanda medida**, não a lastro) | Se a tool de escrita existe |
| **Ordem dentro das ondas:** o que entra na primeira leva de enforce | Se a fronteira leitura/escrita do §2 está certa |
| **Tamanho de cada degrau do rollout (88-10)** e a largura da janela de observação | Se as duas autoridades sobre o mesmo fato devem virar uma |
| **Quanto tempo o shadow (88-8) roda** antes do enforce | A prioridade P0 do `isSlotFree` fail-closed |
| Quanto do gap residual continua sendo atacado por correção determinística | — |

**Regra de leitura, para não recriar o gate por acidente:** *"lastro alto"* é argumento para **v1
menor e rollout mais lento**, nunca para *"não fazer"*. *"Lastro baixo"* é argumento para **v1 no
escopo escrito**, nunca para pular degrau de rollout. **Quem assina o dimensionamento é o @architect;
a existência não está na mesa.**

#### O que NÃO muda: a ordem

O gate estava errado no **tipo** de decisão, não na **sequência**. As correções determinísticas do
Epic 87 continuam vindo antes das Ondas 1–3 deste epic, e por quatro razões técnicas — nenhuma
estatística:

1. **Tool sobre estado que mente acelera o erro.** Hoje o estado grava a fala da própria Nicole como
   se fosse do lead (caso Sandra); a tool gravaria isso **com autoridade de escrita**. (`W1-2b`)
2. **`tool_choice` forçado sobre gatilho envenenado faz o modelo FABRICAR os argumentos
   obrigatórios**, inclusive a `citacao_do_cliente` — troca *"não agenda"* por *"agenda errado"*,
   que é pior. Está escrito como **F-2** e no §4.1.
3. **`isSlotFree` devolve "livre" quando a query FALHA** (`visit-slot.ts:465` descarta o `error`).
   Uma tool confiando nisso agenda sobre horário ocupado **com mais confiança**. É P0 e pode sair
   sozinho, hoje.
4. **O 88-2 (harness que afirma sobre a ENTRADA do modelo) é pré-requisito real** — não é
   formalidade de processo. Sem ele não há como provar que `tools`/`tool_choice` foram enviados.

**A Onda 0 segue liberada agora (88-1, 88-2, 88-3, 88-4, 88-13).** São higiene obrigatória e valem
mesmo que tool nenhuma exista — três deles o @architect classifica explicitamente assim. E o 88-2 é
pré-requisito de qualquer coisa das ondas seguintes (regra de corte da Onda 2 do Epic 87).

> **Nota sobre o veto.** O @architect vetou o W4-1 como desenhado no Epic 87 e, em 07/08, converteu o
> veto em critério numérico (`2026-08-07-debate-tool-use-nicole.md` §6). **A fronteira redesenhada do
> §2 permanece a resposta ao veto e não está sendo revogada** — o que se revoga é apenas a conversão
> do veto em **condição de existência medida por lastro**. As condições técnicas de aceite dele
> (harness antes, uma autoridade de escrita só, remoção do ramo do parser no mesmo PR, gatilho
> turn-local, guarda de interrogação) continuam **todas** vigentes e distribuídas pelos itens.

---

## 9. Escopo

**IN:** **T1** (escrita de agenda) · executor único fail-closed **com idempotência por constraint** ·
guarda de interrogação no `detectAffirmedSlot` · validação de citação ·
`tool_choice` por estado turn-local · tornar o pipeline tool-aware · instrumentação do funil ·
shadow mode com comparador · flag em banco + rollout progressivo · compensação de latência ·
promoção de `NICOLE_SLOT_UNAUTHORIZED` a fail-closed na classe agenda.

**FORA, com motivo:**

- **`T2 remarcar_visita` e `T3 cancelar_visita`.** Diferidas para o **88-12**: demanda medida = **0
  mensagens em 8 semanas**. O executor continua expondo as funções desde o 88-5.
- **`consultar_agenda` (T4).** O pré-fetch determinístico já calcula horários livres e vai no
  bloco `[SISTEMA]` com latência zero. Trocar isso por uma decisão do modelo é andar para trás —
  o @architect está certo. Reavaliar só para a cauda de perguntas abertas ("quando vocês têm?"),
  depois da v1, com dado de frequência.

  > ⚠️ **Este corte não é um atestado de saúde do pré-fetch, e isso precisa estar escrito.** Em
  > 03/08 23:57 a Valnira pediu **"Semana de manhã"** e o pré-fetch ofereceu **três sábados**
  > (8/8 às 08:00, 08:30 e 09:00). Não veio do modelo: veio de `resolveVisitSlotParts` /
  > `freeSlotsInPeriod`. Causa em `visit-slot.ts:363-381` — a guarda de período da 75-268 foi
  > aplicada ao caminho `visitAvailability` e **não** ao `pendingDay`; **a 75-268 corrigiu metade do
  > bug que ela mesma nomeia**. É defeito **determinístico, do lado que este epic preserva
  > intocado** — e **a tool não o alcança**, porque leria a mesma função errada. Dono: **Epic 87 ·
  > W1-2b**. Sem este registro, alguém lê "o pré-fetch já calcula com latência zero" como "está
  > certo" — a mesma armadilha do "zero eventos = está tudo bem".
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
  segundo), mas é defeito independente. O executor deduplica **e o índice UNIQUE parcial entra no
  88-5** (a garantia mora no banco); a **causa** — a race do webhook — fica fora.
- **Compromisso de ligação da Nicole.** Ela promete *"o corretor te liga segunda às 9h"* e **nada é
  gravado** (`lead_tasks` só tem `source: 'manual'`). Mesma classe de dano (fala sem lastro),
  caminho diferente — é o defeito que o caso Silvana expõe. **Item de backlog próprio**
  (`docs/backlog.md`), não deste epic.

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

## 11. Decisões que dependem do Gabriel — **de 6, sobram 2**

> A v0.1 listou seis. A auditoria do @po mostrou que quatro **já estavam decididas** ou se decidem
> por dado — e decisão pendente que não é pendente **trava a redação de story à toa**.

| # | Decisão | Estado | Encaminhamento |
|---|---|---|---|
| **D88-1** | v1 só agenda? | ✅ **Fechada como (a)** | O Gabriel decidiu em 05/08 (**D-87-0-b**): dados de empreendimento vêm da injeção determinística (`buildPropertyDataContext`), que **já roda a cada turno**. T5 é redundante por decisão do próprio stakeholder |
| **D88-2** | Visita órfã fica ou volta atrás? | ✅ **Default (a) aplicado** | A opção (b) é destrutiva e ninguém a defenderia; o corretor **já** é notificado por `APPOINTMENT_CREATED`. Fica gravada. Marcos pode reverter — não bloqueia nada |
| **D88-3** | Teto de latência, medido onde? | ✅ **Decisão arquitetural, não do Gabriel** | A pergunta é técnica e **já tem número**: p95 `whatsapp_async_done` = **12.469 ms** (n=442). Ratificada no 88-3 e **substitui o Epic 87 · D6**. O que **é** do Gabriel é a consequência — "se não couber, a tool não sobe" —, e isso é regra do epic |
| **D88-4** | Fail-closed na classe agenda? | 🟡 **REAL — do Gabriel/Marcos** | Mas só morde no **88-11**, o último item, e **depois do 88-13**. Decidir até a Onda 3; não bloqueia a redação de nenhuma story |
| **D88-5** | Citação obrigatória mesmo custando um agendamento? | ✅ **Auto-resolvida** | O mecanismo já está no epic: nasce em shadow, só passa a recusar com a taxa medida (**88-8**). **O dado decide, não o stakeholder.** Dobrada no critério de saída da Onda 2 |
| **D88-6** | Quem valida em produção? | ✅ **Duplicata — removida** | É o **`Epic 87 · D7`**. Herda de lá; o que este epic acrescenta é o requisito de **janela de 24 h por degrau de rollout** (88-10). Dois donos para a mesma decisão = zero donos |

**Sobram `D88-4` e o `D7` herdado — e nenhuma das duas bloqueia o @sm hoje.** O texto abaixo fica
como registro do raciocínio de cada uma.

### D88-1 — A v1 é só agenda, ou já entra mídia e dados do empreendimento? — ✅ fechada (a)

| Opção | A favor | Contra |
|---|---|---|
| **(a) Só agenda (T1–T3)** | É o defeito que você relatou; a lógica determinística já existe e está testada; a verdade é binária (livre ou não) | Mídia e dados continuam no regime atual por mais algumas semanas |
| **(b) Agenda + mídia + dados** | Uma migração só | Triplica o raio de impacto num arquivo de 1.947 linhas, num epic cujo ponto é confiabilidade |

**Recomendação: (a).** O pedido foi sobre agenda. Ampliar escopo aqui é a mesma tentação que
produziu os quatro remendos anteriores em outra direção.

### D88-2 — Quando a tool grava e a fala final falha, a visita fica ou volta atrás? — ✅ default (a) aplicado

| Opção | A favor | Contra |
|---|---|---|
| **(a) Fica gravada** + evento + notifica corretor + fala de reserva | O erro vira "existe e o lead não sabe", recuperável por telefonema; o corretor já é notificado hoje | Uma visita na agenda que o lead não confirmou pode virar no-show |
| **(b) Desfaz (delete)** | Banco espelha o que o lead ouviu | Deletar em produção por timeout é destrutivo, e volta ao dano de hoje: ninguém sabe de nada |

**Recomendação: (a).** É a inversão deliberada do dano: hoje falhamos para o lado em que o lead
aparece no stand e não há visita. Passamos a falhar para o lado em que há visita e alguém liga.

### D88-3 — Qual é o teto de latência, e medido onde? — ✅ decisão arquitetural, com número

O teto do Epic 87 · D6 (p95 de `CLAUDE_RESPONSE` + 30%) seria violado pela primeira tool. Mas ele
mede o componente errado para uma decisão de produto.

**Recomendação:** teto sobre o **turno percebido** (`whatsapp_async_done`): **p95 não pode subir
mais que 10%** em relação ao baseline da Onda 0, com a compensação do `typing-delay` ativa. Se a
Onda 2 mostrar que não cabe, a tool não sobe — e aí o veto do @architect estava certo, com número.

### D88-4 — Bloquear o envio de confirmação sem lastro (fail-closed)? — 🟡 PENDENTE (decidir até a Onda 3)

A 75-279 deixou isto explicitamente fora de escopo, registrando que a decisão é do Marcos. Hoje o
sistema é fail-open em todo lugar: a confirmação alucinada chega ao cliente e a gente só fica
sabendo.

| Opção | A favor | Contra |
|---|---|---|
| **(a) Continuar só logando** | Zero risco de piorar a conversa | É o estado atual; o lead segue recebendo a promessa falsa |
| **(b) Regenerar 1× → fala de reserva neutra** | Nunca envia visita que não existe | +1 chamada; resposta mais burocrática num caso raro |

**Recomendação: (b), só na classe agenda, e só depois do shadow.** Um lead que ouve "deixa eu
conferir certinho e já te confirmo" é recuperável; um lead que vai ao stand no sábado, não.

### D88-5 — Citação obrigatória, mesmo quando custa um agendamento? — ✅ auto-resolvida pelo dado (88-8)

O `citacao_do_cliente` é a barreira que torna o caso Sandra estruturalmente impossível. Mas ele
recusa quando não casa — e F-4 diz que vai haver falso negativo.

| Opção | A favor | Contra |
|---|---|---|
| **(a) Obrigatória e bloqueante** | Fecha o modo de falha do @architect | Alguns agendamentos legítimos viram "me confirma o horário de novo?" |
| **(b) Obrigatória mas só logada** | Zero risco de travar atendimento | Vira mais um botão que não faz nada — o padrão que este projeto já tem cinco vezes |

**Recomendação: (a), com o número na mão.** Ela nasce em shadow no 88-6 e só passa a recusar
quando a taxa de casamento estiver medida ≥ 95%. Se não chegar lá, ajusta-se a normalização —
não se desliga a barreira.

### D88-6 — ⛔ REMOVIDA (duplicata do `Epic 87 · D7`)

**Não é decisão deste epic — é o `Epic 87 · D7`, e mora lá.** O que este epic acrescenta, como
**requisito** e não como decisão: o rollout tem três degraus, e cada um precisa de **janela de 24 h**
e critério de rollback escrito **antes**. Sem dono nomeado, o rollout congela no canário e o epic
não fecha.

---

## 12. Sequência

```
ONDA 0 — LIBERADA AGORA (higiene; vale mesmo que tool nenhuma exista)

   88-1 (content[] tool-aware) ──┐
   88-3 (instrumentar funil)   ──┼─▶ 88-4 (flag em agent_config, verificada por efeito)
   88-2 (harness afirma entrada)─┤
   88-13 (guarda de interrogação)┘
   + isSlotFree fail-closed (P0, pode sair sozinho já)
                    │
                    ▼
   ══════════════════════════════════════════════════════════════
    CORREÇÕES DETERMINÍSTICAS DO EPIC 87 (ordem, não permissão)
    W0-5 · W1-2b · W1-2c(escrita) · W1-6 · guarda do pendingDay
                              │
    e então REMEDIR O LASTRO pelo W0-5 — o número DIMENSIONA:
       lastro alto  → v1 ENCOLHE (menos tools, rollout mais lento)
       lastro baixo → v1 no escopo escrito
    ⚠️ NÃO é gate de existência. O epic acontece. (§8.1)
   ══════════════════════════════════════════════════════════════
                    │
                    ▼
   88-5 (executor único, fail-closed, UNIQUE parcial)
                    │
   88-6 (casador de citação + corpus retrospectivo)
                    │
                    ▼
   88-7 (T1 + 2ª chamada em SHADOW, pós-envio)   ◀── requer Epic 87 · W1-2c
                    │                                 metade de ESCRITA (ofertas_do_sistema);
                    │                                 senão o gatilho é cego no "Ok".
                    │                                 NÃO requer o W3-2e (metade de LEITURA)
   88-8 (comparador + citação medida em produção · 7 dias)
                    │
        [critério de saída §6.1 (contagens) · D88-3 · D88-5]
                    ▼
   88-9 (enforce + remove ramo do parser, mesmo PR)  ◀── requer Epic 87 · W0-0 e W1-2b
                    │
   88-10 (canário → 10% → 100%, 24h por degrau — D7 do Epic 87)
                    │
   88-11 (fail-closed na classe agenda) [D88-4]  ◀── requer 88-13
                    │
   ─ ─ ─ ─ ─ ─ ─ ─ ─┴─ ─ ─ ─ ─  diferido, só com demanda medida
   88-12 (expõe T2/T3 ao modelo)
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

- **`stories_planned` como tabela item→story, no frontmatter, desde a primeira story.** Uma story
  por item 88-N é a intenção, **mas não conte com a numeração**: a identidade item↔story quebrou no
  Epic 87 em 24 horas, e este epic já tem um item fora de ordem (**88-13**, criado depois da revisão
  do @po, mas que pertence à **Onda 0**). A ordem correta é a das tabelas de §6.1, não a do número.
- **88-1 é a story que menos parece urgente e mais é.** Ela não muda nenhuma resposta e é a única
  coisa entre este epic e uma degradação muda em ~470 linhas. Escrever a AC como teste que injeta
  um bloco `tool_use` na posição 0 e prova que a fala **não** some.
- **Todo teste deste epic precisa ficar vermelho antes.** É regra da casa e a 75-279 a praticou:
  o parser foi revertido e 3 de 5 casos falharam. Um harness que passa pelo motivo errado é pior
  que nenhum — já aconteceu aqui (mock com `is: () => b` engolindo o filtro).
- **Nenhuma AC deste epic pode ser "existe no painel/no env".** Tem que ser **efeito verificado em
  produção**. A flag do 88-4 já falhou nesta casa duas vezes por esse motivo.
- **AC de prompt se verifica NO BANCO — "AC dupla" está revogada.** Sob a decisão **D-87-0-a** do
  Gabriel (05/08), `agent_prompts` **é** a fonte da verdade e o código é fallback de bootstrap
  declarado. Manter "código **e** banco" faz o @dev editar dois lugares e acreditar que os dois
  valem — a doença que a 87-0 curou. (Este epic quase não tem AC de prompt: só o 88-9.)
- **Atualize a evidência do 88-1: pós-75-279, `content[0]` não vira mais `""`** — vira
  `SANITIZED_EMPTY_FALLBACK` (`pipeline.ts:993-1003`). A falha ficou **mais** traiçoeira, não menos:
  em vez de uma mensagem vazia que a Graph API recusa (e alguém percebe), o lead recebe uma fala de
  reserva plausível e as ~470 linhas a jusante processam a **fala de reserva** como se fosse a
  resposta. AC dupla: o texto sobrevive **e** o `NICOLE_EMPTY_TEXT_RESPONSE` dispara.
- **O golden set do 88-2 tem seis casos, não cinco:** `"As 11hrs"` (Maria), `"Umas 14"` (Sueli),
  `"Na quinta as 10"` (Valnira), **`"As 9"` (Célia, 28/06 — o mais limpo e o mais antigo)**,
  `"Sexta a tarde"` (Sueli) e a cadeia 27/07→05/08 da Sandra atravessando duas sessões. O
  `"As 9hs"` da Silvana é caso válido **do parser**, mas como teste de **ligação** — não misture as
  duas coisas na mesma fixture.
- **Antes do 88-10, o @devops confirma qual projeto Vercel serve `/api/webhook/whatsapp`.** Rollout
  progressivo no projeto errado é rollout que não acontece.
- **Instrumentação antes de comportamento**, sempre: um item que muda comportamento sem o
  contador correspondente não fecha.
- Contexto medido para as stories está em: validação do @architect §5 e §6, análise do @analyst
  §2 e §7, e a 75-279 (parser, guardas e harness). **Reler antes de redigir** — cada afirmação
  deste epic tem linha de código ou registro de banco por trás.

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-07 | 0.4 | **Duas notas de fechamento, ambas consequência da v0.3.** **(1) §8.1 — a reformulação NÃO tornou a PM2 menos importante; mudou a natureza do dano, não a gravidade.** Com o gate antigo, um instrumento publicando 0% falso (o `Invalid Date` do risco 7 da Story 87-3) **aprovava a v1 errado**; com o critério novo, o mesmo 0% falso **encolhe ou incha a v1 errado** — dimensiona escopo, ordem e degraus de rollout a partir de um número que não corresponde ao mundo. É o mesmo instrumento mentindo, sobre *quanto construir* em vez de *se construir* — pergunta feita com mais frequência. **A recalibração B6 fica mais crítica, não menos.** **(2) Ponteiro fechado:** o `W3-2e` citado aqui **passou a existir** no roadmap do Epic 87 (v0.5, Onda 3), junto com a divisão do `W1-2c` em escrita/leitura — as edições `A1`–`A4` do @po foram aplicadas lá. A ressalva de "item ainda não registrado" no §4.1 deixa de valer. | @pm (Morgan) |
| 2026-08-07 | 0.3 | **O gate com o Epic 87 deixa de ser condição de existência e vira critério de sequenciamento e dimensionamento — correção do Gabriel, aceita.** O texto anterior (*"lastro ≥90% a tool não se justifica; <90% o epic sobe"*) **condicionava arquitetura a estatística** e está revogado no frontmatter (`gate_de_entrada` → `sequenciamento_e_dimensionamento`), na §8.1 (reescrita), na §8 (linhas do `W0-5` e do `W1-2c`), na §2.5, na PM2 e no diagrama da §12. **Dois fundamentos, nenhum estatístico:** (1) o argumento a favor da tool sempre foi o §2 — hoje **a fala confirma a visita e um código separado decide se grava**, duas autoridades sobre o mesmo fato, o que **continua errado com lastro de 95%**; menos frequente é **mais difícil de detectar**, não menos grave (a Célia ficou 5 semanas invisível *porque* era rara); (2) **a métrica que arbitraria o gate está enviesada e o viés tem direção** — o @po rodou a régua da PM2 como especificada contra 60 dias e obteve **7%, não 31%** (denominador, unidade fala × lead, filtro de `status` contraditório, balde `lembrete` ausente), erro **para baixo**, exatamente na direção de *"<90% → o epic sobe"*. **O que NÃO mudou: a ordem.** As correções determinísticas do Epic 87 continuam antes das Ondas 1–3, pelas quatro razões técnicas já documentadas (estado que mente + autoridade de escrita; `tool_choice` forçado sobre gatilho envenenado **fabrica** argumento e citação — F-2; `isSlotFree` fail-open devolve "livre" quando a query falha; e o **88-2** é pré-requisito real). Onda 0 segue liberada. **Aplicada também a edição `A5` do @po** (`po-validation-87-3-87-4.md` §3.5): o **88-7 depende da metade de ESCRITA do `W1-2c`** (`ofertas_do_sistema`), **não** da de leitura — repontado no frontmatter, §2.4, §4.1, F-9, tabela da Onda 2 e §12, com o aviso explícito de **não "restaurar" a leitura para a Onda 1 citando urgência deste epic** (ela é caminho de decisão novo e seria alimentada por um sinal com 21% de erro). Escopo, ondas, itens e stories **inalterados**. | @pm (Morgan) |
| 2026-08-07 | 0.2 | **As 7 correções obrigatórias do @po aplicadas (`docs/qa/po-validation-epic-88.md` §10), mais o veto do @architect convertido em gate numérico.** **C1** — tabela de incidentes trocada por 8 semanas auditadas: **Silvana sai** (era ligação, e a ligação aconteceu), entram **Célia (28/06, cinco semanas sem appointment), Helena e Miriam**, mais o mismatch do Ailton; **placar 6 de 7**, medido. **C2** — a tese passa a ser *"o contexto estava correto sobre a AUTORIZAÇÃO e errado sobre a INTENÇÃO"*, formulação que não se derruba com contra-exemplo; §2.5 nova registra a contra-evidência (o parser não perde nada em 60 dias de corpus) porque um epic que só cita o que o favorece não sobrevive à execução. **C3** — **F-7 vira nota histórica** (prompt reconciliado em prod 05/08 20:58) e `W0-0` passa a bloquear **só o 88-9**; AC de prompt se verifica **no banco** (D-87-0-a), "AC dupla" revogada. **C4** — `W1-2b` rebaixado a bloqueante do 88-9 (o gatilho é conjunção turn-local e nada é forçado contra lead real antes da Onda 3); **MemPalace entra como dependência habilitante de latência**. **C5** — **PM2 reescrita**: exige `created_by='nicole'` **e** `created_at ≤ fala + 2 min`, **baseline 31% (5/16)**, alvo em contagem absoluta — como estava, contava o **conserto humano como sucesso** e os três incidentes apareceriam como aprovação; alvos percentuais sobre n<10 viram contagem; **PM4** ganha AC de "provar que dispara" e alvo "tende ao piso"; **D88-3** grava `p95 = 12.469 ms (n=442)`. **C6** — **T2/T3 saem da v1** (demanda medida: **0 em 8 semanas**) para o **88-12**; **88-6** passa a entregar casador + corpus retrospectivo e a medição em produção vai para o **88-8** (a citação só nasce na Onda 2 — o item não podia medir o que prometia). **C7** — **6 decisões viram 2** (sobram D88-4 e o D7 herdado), o que destrava a redação hoje. **Itens órfãos do Tier 1 do @architect adotados aqui:** `isSlotFree` fail-closed (ponteiro corrigido de 88-4 para 88-5, e marcado como P0 que pode sair sozinho), **UNIQUE parcial em `appointments`** dentro do 88-5 (a garantia mora no banco, não no `if`) e o item novo **88-13** (guarda de interrogação no `detectAffirmedSlot` — 21% de falso positivo hoje, que faria PM4 e 88-11 nascerem quebrados). **F-9 novo:** o gatilho turn-local **não dispara nos turnos "Ok"** — depende do Epic 87 · W1-2c, agora bloqueante do 88-7. | @pm (Morgan) |
| 2026-08-06 | 0.1 | Epic criado a partir do pedido direto do Gabriel, do veto do @architect ao W4-1 do Epic 87 e da análise do @analyst. Decisão central: híbrido com fronteira leitura/escrita. 11 itens em 4 ondas, 8 modos de falha novos nomeados, 8 métricas com o problema de n baixo tratado, 6 decisões pendentes do stakeholder. | @pm (Morgan) |
