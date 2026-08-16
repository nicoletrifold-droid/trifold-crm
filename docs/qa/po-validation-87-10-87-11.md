# Validação @po — Stories 87-10 (`W1-2c` escrita) e 87-11 (`W1-6`)

**Validado por:** @po (Pax) em 2026-08-10
**Epic:** 87 v0.6 — Nicole: Confiabilidade de Contexto, Estado e Enforcement
**Escopo:** as duas últimas stories da Onda 1 + **cinco arbitragens** que o @sm roteou para cá
**Método:** leitura do código em `HEAD`, **mutação executada e revertida** (`md5` conferido), e
**medição contra produção** (`dsopqkqjkmhytudaaolv`, Management API, **somente SELECT**), 10/08.

| Story | Veredito | Status |
|---|---|---|
| **87-10** — o estado registra oferta e afirmação (`W1-2c` escrita) | **GO condicionado** — 4 emendas aplicadas por mim | `Draft` → **`Ready`** |
| **87-11** — `collected_data` sai do prompt como JSON cru (`W1-6`) | **GO condicionado** — 3 emendas aplicadas por mim | `Draft` → **`Ready`** |

> As emendas **já estão nos arquivos**. Nenhuma volta para o @sm. As duas mudanças de AC são de
> minha autoria e minha responsabilidade (regra de propriedade de seção: AC é do @po).

---

## 0. O que eu medi antes de decidir

Todas as consultas abaixo são reproduzíveis. **Quatro números do @sm não sobreviveram**, e um deles
derruba a justificativa de uma proibição que ele escreveu como normativa.

| # | O que o @sm escreveu | O que eu medi | Veredito |
|---|---|---|---|
| M1 | `NICOLE_SLOT_UNAUTHORIZED` = 2, all-time, 00:13:37 e 00:14:12 UTC | **idêntico**, e é o **único** `event_type` `NICOLE%` com contagem > 0 em todo o `system_events` | ✅ |
| M2 | 16 chaves em `collected_data`, com as contagens | **idêntico**, chave a chave | ✅ |
| M3 | 254 linhas · 236 não-vazias · máximo 2.103 · soma 29.487 · `agenda_registro` = 0 · `agenda_state` = 1 | **idêntico**; mediana **47** e não 46 (`percentile_cont` sobre as 254) | ✅ (∆ irrelevante) |
| M4 | `collected_data` do Ronaldo | **idêntico, byte a byte** | ✅ |
| M5 | `evaluateSlot`: 17:30 + 60 > 18:00 ⇒ `startUtc: null` | **confirmado no código** (`VISIT_DURATION_MIN=60`, `closeHourFor(terça)=18`, `OPEN_HOUR=8`) | ✅ |
| M6 | **AC1-(ii): remover os dois campos mantém `tsc` em 0** | ❌ **FALSO.** A remoção produz **exatamente 2 erros** | 🔴 emenda |
| M7 | `CLAUDE_RESPONSE` **não tem** `conversation_id`, logo a cauda **não é mensurável** | ❌ **FALSO.** `conversation_id` está em **505 de 505** eventos. Eu fiz o join | 🔴 emenda |
| M8 | mediana de `collected_data` = 46 chars ⇒ "invisível" | ⚠️ **denominador errado.** Por **turno**, a mediana é **132 chars**, e **51,3 %** dos turnos passam de 120 | 🔴 emenda |
| M9 | precisão do `detectAffirmedSlot`: ~79 % (@po) × 83 % (briefing) | **remedido**: 32 disparos em 60 d; **71,9 % estrito / 81,3 % frouxo**. As duas leituras publicadas usam **o mesmo denominador** (30) — a divergência é de **classificação**, não de aritmética | ✅ resolvido |

---

## 1. 🔴 A decisão que era minha: a chave irmã — **RATIFICADA**

### 1.1 Verifiquei as três premissas do @sm, uma a uma

**(a) O envelope é apagado nos ramos que produzem o sinal de confiança alta — CONFIRMADO.**

| ramo | linha | produz | faz com o envelope |
|---|---|---|---|
| remarcar p/ slot livre | `pipeline.ts:900-909` | `authorizedSlotUtc = newStartUtc` | `clearPending()` (`:902`) |
| agendar slot livre | `pipeline.ts:989-1000` | `authorizedSlotUtc = startUtc` | `writeAgendaState(cd, null)` (`:991`) |

**(b) Criar envelope quebra dois gates — CONFIRMADO, e com uma nuance que fecha a saída de emergência.**

`hasVisitAvailability = !!agendaState` (`pipeline.ts:781`) alimenta `isVisitSchedulingMode`;
`hasAgendaFact` (`agenda-state.ts:293-297`) responde por `fieldIsCollected('visit_availability')`
(`qualification.ts:50`), peso **20** de 100.

A nuance: **os dois gates leem o objeto JÁ PARSEADO**, e `parseAgendaState` exige `citacao`
não-vazia **e** `origem === 'lead'` (`:181-182`). Ou seja, existiria em tese uma "terceira opção" —
gravar dentro de `agenda_state` um objeto deliberadamente inválido, que o parser rejeitasse.
**Ela não serve**, por duas razões independentes: (i) é grotesca por construção (uma chave cujo
conteúdo é inválido de propósito é uma armadilha para o próximo leitor); (ii) **não resolve o
problema (a)** — `writeAgendaState(cd, null)` e `clearPending()` apagam a **chave inteira**, válida
ou não. **Confirmo o @sm: não existe terceira opção.**

**(c) "Ninguém lê os dois campos" — CONFIRMADO no runtime, FALSO no `tsc`.**

`grep` sobre `packages/`: os dois nomes aparecem em **4 lugares**, todos em
`agenda-state.ts` (declaração `:125-126`, cópia condicional em `parseAgendaState` `:202-203`) —
**e em `agenda-state.test.ts:48-49`**, que é o teste que a própria 87-4 escreveu para afirmar que
ninguém escreve neles.

Executei a mutação (remover os dois campos da interface e as duas linhas do `parseAgendaState`),
rodei `npx tsc --noEmit` em `packages/ai` e **restaurei o arquivo** (`md5`
`0998eaf4fc8fb3d285cac67bda6f8701`, `git status` limpo):

```
src/flows/agenda-state.test.ts(48,15): error TS2339: Property 'ofertas_do_sistema' does not exist on type 'AgendaState'.
src/flows/agenda-state.test.ts(49,15): error TS2339: Property 'afirmado_pela_nicole' does not exist on type 'AgendaState'.
```

`packages/ai/tsconfig.json` tem `include: ["src"]` e os testes moram em `src/` — **o `tsc` cobre os
testes**. Baseline no `HEAD`: **0 erros** (conferido).

Isto **não invalida a decisão** — invalida a **redação da prova**. Se a AC1-(ii) fosse ao @dev como
está, ele encontraria 2 erros onde a story promete 0 e faria uma de duas coisas ruins: concluir que
a remoção não é segura, ou apagar o teste em silêncio. **Emenda E1 aplicada** (§5.1).

### 1.2 O argumento que decide

> *"Numa chave que ninguém lê, a regra de corte vira estrutural em vez de disciplinar."*

Aceito, e é o motivo do GO. Um campo dentro de `AgendaState` está a **um `if`** de armar
`isVisitSchedulingMode` ou de conceder 20 pontos, e este epic já pagou essa conta. Uma chave irmã
que nenhum gate consulta não tem esse `if` disponível.

**Consequência que eu extraio do próprio argumento — e que muda o §4 do Desenho:** se a garantia é
"ninguém lê", então **nada pode ler**, nem para escolher o nível de um log. É o que decide a
arbitragem do bloco de dedupe (§3).

**RATIFICADO** — com E1 (a prova corrigida) e **E2** (§2, o vazamento para os dois Haiku).

---

## 2. 🔴 O que eu achei e ninguém tinha mapeado: **`agenda_registro` chega ao modelo por outros dois caminhos**

Esta é a emenda que eu considero **obrigatória**, e ela atinge as duas stories.

A 87-11 diz *"a única linha que sai"*. A 87-10 diz que `afirmado_pela_nicole` é **WRITE-ONLY** e que
a AC6 prova que *"o registro não chega ao modelo"*. **`grep` sobre quem serializa `collected_data`
para dentro de um prompt** devolve **três** sítios, não um:

| # | sítio | prompt de quê | o que recebe | quem cobre hoje |
|---|---|---|---|---|
| 1 | `pipeline.ts:1913` | **a fala da Nicole** (turno vivo) | `state.collected_data` | **87-11** ✅ |
| 2 | `lead-memory.ts:79` — `DADOS COLETADOS:\n${JSON.stringify(collectedData, null, 2)}` | **Haiku que escreve o `ai_summary`** | **`finalData`** (`pipeline.ts:1611`) | **ninguém** 🔴 |
| 3 | `haiku-enrichment.ts:90` — `Dados ja coletados: ${JSON.stringify(input.currentCollectedData)}` | **Haiku do cron `enrich-leads`** | `currentData` do banco, **sem filtro na entrada** | **ninguém** 🔴 |

*(Há um quarto, `packages/web/.../leads/[id]/summary/route.ts:105`, que produz resumo para humano.
Fora de escopo e sem risco de realimentação.)*

**Por que isto afunda a AC3-(iii) da 87-10 em produção — e não no teste.** O escritor do
`agenda_registro` entra imediatamente antes de `updateConversationState` (`:1544`), sobre
`finalData`; o **mesmo `finalData`** é passado a `atualizarResumoComLastro` em `:1611`. Logo:

```
afirmado_pela_nicole  (a fala dela, ~1 erro em 5)
   → finalData → lead-memory.ts:79 → Haiku → ai_summary
   → memory/loader.ts:195 (fallback ativo, por docstring da 87-7, "em 100 % dos turnos")
   → prompt da Nicole no turno seguinte, agora em PROSA
```

A alucinação sai do estado como campo write-only e **volta ao modelo lavada em texto corrido**.
O caminho 3 é pior em população: o cron é o último escritor de **70 %** dos estados (medição da
87-4) e a 87-4 filtrou a **saída** do Haiku (`omitAgendaKeys`) mas **nunca a entrada** — hoje ele já
recebe `agenda_state` cru com `fonte`, `origem`, `expira_em`.

**E o teste da AC3-(iii) ficaria verde mesmo assim**: `atualizarResumoComLastro` é fire-and-forget
atrás de `msgCount % 5 === 0`. Uma fixture de dois turnos não o dispara.

**A ordem de deploy não protege isto**: a 87-11 remove **só o sítio 1**.

**Emenda E2 (87-10):** nova **AC6-b** — `agenda_registro` não entra nos sítios 2 e 3, com par de
fixtures e vermelho colado. Custo: um `omit` nos dois pontos de chamada. É subtração, não é caminho
de decisão novo, e é o que torna verdadeira a palavra *write-only* que a story usa 6 vezes.
**Emenda E5 (87-11):** o §1 do Context e a AC1 passam a **declarar o inventário dos três sítios** e
a nomear quais esta story **não** toca. A story continua com um sítio só — mas para de afirmar que
é o único.

---

## 3. 🔴 Arbitragem: o bloco AC8–AC10 cabe na 87-10? — **AC9 FICA. AC8 e AC10 SAEM.**

Corte por escrito, como a DoD exige (*"cortadas por escrito pelo @po, não por omissão"*).

### 3.1 Por que a AC8 sai

Não é pelas três razões do @sm — as três são boas. É porque **a AC8 contradiz o argumento que fez
eu ratificar a chave irmã 20 minutos antes**.

O desenho declara, em caixa alta, dentro do docstring do tipo: **`NADA LÊ ESTE OBJETO PARA DECIDIR`**.
A AC8 coloca um leitor lá dentro no **dia 1**: `alerta_sem_lastro` é lido no início do turno para
decidir se o evento sai como `error` ou como `info`. O próprio @sm já teve de abrir a exceção na
régua — a AC3-(iv) diz *"não aparece em nenhuma expressão condicional **fora do escritor e do bloco
de dedupe da AC8**"*. **Uma régua com exceção escrita no dia do nascimento é uma régua disciplinar,
e a chave irmã foi comprada exatamente para não depender de disciplina.**

O segundo motivo é o denominador, e ele é do próprio @sm: **2 eventos, 1 caso, all-time**. Eu medi e
confirmo — `NICOLE_SLOT_UNAUTHORIZED` é o **único** `NICOLE%` com contagem diferente de zero em toda
a tabela. Pagar por um leitor dentro da chave write-only, um `event_type` novo, 4 fixtures
degeneradas e um controle negativo para suprimir a segunda mensagem de **um** incidente, **num canal
que não existe**, é caro no lugar errado.

O terceiro é que **existe lugar melhor, e ele já está reservado**. A `87-9` é dona do ciclo de vida
do alerta — *entregar → devolver resultado → registrar supressão → fechar*. Com a **AC9** (que eu
mantenho), o evento passa a carregar `conversation_id` **e** `said_at`, que é exatamente a chave de
supressão que a AC8 queria: **o dedupe passa a ser um `select` no `system_events` feito pelo
notificador, sem estado novo, sem leitor na chave irmã e sem `event_type` novo.** É mais barato do
que a AC8 **e** chega junto com o canal, que é a janela que o @sm queria proteger. O argumento
*"subir o canal antes da supressão é entregar 3 ou 4 mensagens na estreia"* continua válido — e
passa a ser **condição de aceite da 87-9**, não trabalho antecipado da 87-10.

**A AC10 (fail-open) sai junto**: sem dedupe, não há o que falhar aberto. A postura *"na dúvida,
alerta"* migra para a 87-9 como requisito de entrada.

**`alerta_sem_lastro` sai do `RegistroAgenda`.** O próprio comentário do campo já dizia
*"bookkeeping do dedupe. **Não é sinal de conversa**"* — se não é sinal de conversa, não mora no
estado da conversa.

### 3.2 Por que a AC9 fica

~4 linhas, zero leitores, zero decisão, e é o que **destrava** a 87-9. Sem `conversation_id` no
evento, quem triar precisa passar por `leads`; e `ofertas_do_sistema` no evento responde de graça a
primeira pergunta do triador (*"o sistema tinha oferecido alguma coisa?"* — no caso Ronaldo, **não**).
Concordo também com a nota técnica: `message_id` não existe no ponto da guarda (`saveMessages` roda
em `:1541`, a guarda em `:1134`), então o índice único da 87-6 não serve para estes dois eventos.

**Peço um acréscimo mínimo à AC9:** incluir `authorized_slot_utc: null` explícito no
`UNAUTHORIZED`. Hoje a ausência do campo é ambígua entre *"não havia"* e *"o emissor esqueceu"* — e
é a distinção que a 87-9 vai usar para decidir se fecha o alerta.

---

## 4. 🔴 O terceiro defeito do caso Ronaldo: dono confirmado **em parte**, e a prioridade **muda**

**O fato está certo e eu reconfiro:** o bloco `[SISTEMA]` daquele turno **recusou** o horário
(`pipeline.ts:1005-1007`, ramo `else` de `evaluateSlot` — *"O horário pedido não serve… peça um
horário válido"*), e a resposta foi *"Terça-feira às 17h30 está ótimo."* A aritmética fecha:
terça fecha às 18h, `17:30 + 60 = 18:30 > 18:00` ⇒ `{ startUtc: null, outsideHours: true }`.
E é isso que deixou `authorizedSlotUtc` nulo e derrubou a guarda no ramo `UNAUTHORIZED`.

**Concordo que é classe nova.** Os seis defeitos da Onda 1 são de contexto: o sistema alimentava
informação falsa e o modelo respondia fielmente. Aqui o contexto estava **correto, explícito e
imperativo** — e foi contrariado. Nenhuma story de estado, histórico ou resumo alcança isso.

### 4.1 A atribuição a `W2-3` está errada. `W3-2c` está certa mas é insuficiente.

**`W2-3` não é o dono.** O item é *"`detectSlotMismatch` deixa de ser cega (roda também sem slot
autorizado) — **em shadow mode**"*, e o epic é explícito sobre a finalidade: *"o objetivo desta onda
é obter o **denominador**"*. Mas essa detecção **já existe e já rodou**: a 75-279 instalou, em
`pipeline.ts:1151-1170`, exatamente o ramo `!authorizedSlotUtc` com `detectAffirmedSlot`, e foi ele
que produziu os dois eventos de 10/08. **O denominador que a `W2-3` iria buscar, para esta classe,
já está na mesa: 2 eventos, 1 caso, all-time.** Ampliar um detector cujo irmão já detectou é
gastar uma onda para medir o que está medido.

**`W3-2c` é o dono da regra** (*"dia/hora afirmado sem slot autorizado"*) — mas ela nasce
**atrás do `W3-1`**, que é **L**, e o `W3-1` é *"validador pós-resposta (**shadow**)"*.
**Encadeada como está, a Onda 3 também não teria impedido o Ronaldo** — teria emitido um segundo
evento, ao lado do que já foi emitido e que ninguém leu.

### 4.2 O que o caso realmente prova, e é medido nos dois sentidos no mesmo dia

| instrumento | natureza | resultado medido |
|---|---|---|
| *REGRA ABSOLUTA* no bloco `[SISTEMA]`, **no mesmo turno**, mandando pedir outro horário | guardrail em prompt | **contrariado** (Ronaldo, 10/08 00:13) |
| `stripSystemBlocks` (75-279) — sanitização **determinística de saída** | enforcement de saída | **funciona**: `NICOLE_SYSTEM_BLOCK_LEAK` = **0 all-time**, e a **única** mensagem com `[SISTEMA]` no banco em 60 dias (1 de 1.172, lead Maria) é de **2026-08-06 10:04 UTC — 3 h antes do deploy** da 75-279 (PR #368, 13:05 UTC) |

Duas evidências opostas, mesma semana, mesmo pipeline: **o que é determinístico na saída segura; o
que é instrução no prompt não segura.** Junte-se a isto o dado que o @sm levantou e eu confirmei — a
detecção existe desde 06/08, disparou, e **não produziu ação nenhuma** porque o canal está morto.

### 4.3 Recomendação de prioridade (para o @pm, dono do roadmap)

1. **Não promover `W2-3`.** Para esta classe ele é **régua saturada**: o denominador já existe.
   Mantê-lo na Onda 2 pelo que ainda cobre (o `MISMATCH` com slot autorizado — **0 eventos**), sem
   prioridade nova.
2. **Promover o que falta e não tem item: o ATO.** O epic tem detector (75-279, vivo), tem regra
   planejada (`W3-2c`) e tem validador (`W3-1`, shadow) — **e não tem nenhum item que faça a regra
   agir**. No ponto exato onde a guarda já roda, `affirmedUtc` e `authorizedSlotUtc === null` estão
   ambos na mão: o enforcement está a **um `if`** de uma detecção que já existe. Proponho ao @pm um
   item novo de Onda 2 — *"a afirmação sem slot autorizado não sai como está"* (regenerar ou cair
   numa frase que não compromete dia/hora, exatamente o padrão `SANITIZED_EMPTY_FALLBACK` que a
   75-279 já estabeleceu). **Não crio o item: autoria de epic é do @pm.**
3. **Subir a `87-9`** na fila. É ela que transforma detecção em ação humana, e hoje é o gargalo de
   **todos** os instrumentos deste epic: `NICOLE_SLOT_UNAUTHORIZED` (2), `NICOLE_LASTRO_DIARIO` (0,
   cron nunca rodou), `NICOLE_AGENDA_STATE_*` (0), `NICOLE_VISIT_MODE_ARMED` (0).

> **Registro sem eufemismo:** `NICOLE%` tem **um único** `event_type` com contagem > 0 em todo o
> `system_events`. Quatro stories em produção e o painel de observabilidade deste epic é uma linha.
> Isso não desqualifica as quatro — desqualifica **acrescentar a quinta régua antes de ligar a
> primeira**.

---

## 5. As emendas que apliquei

### 5.1 Story 87-10

| # | Emenda | Onde |
|---|---|---|
| **E1** | **AC1-(ii) reescrita.** O resultado esperado da remoção é **2 erros `TS2339` em `agenda-state.test.ts:48-49`**, colados; a resolução é apagar aquele caso de teste (o assunto dele deixa de existir), e **só então** `tsc` = 0. Os dois estados colados | AC1 |
| **E2** | **AC6-b nova.** `agenda_registro` não entra em `lead-memory.ts:79` nem em `haiku-enrichment.ts:90`, com par de fixtures e vermelho | ACs |
| **E3** | **AC8 e AC10 CORTADAS**, com justificativa; **AC9 mantida** e acrescida de `authorized_slot_utc`. `alerta_sem_lastro` sai do `RegistroAgenda` | Desenho §1 e §4, ACs, DoD, T5 |
| **E4** | **Nota de medição na AC2/§ do turno-ouro:** o `conversation_state` do Ronaldo tem `visit_proposed = **true**` e `qualification_step = 'view'` (medidos) | Dev Notes |

### 5.2 Story 87-11

| # | Emenda | Onde |
|---|---|---|
| **E5** | **§1 e AC1: inventário dos três despejos.** A story continua tocando um; para de dizer que é o único | Context §1, AC1 |
| **E6** | **§4 reescrito com a medição correta.** A proibição **fica**; a justificativa muda | Context §4, AC9 |
| **E7** | **§2 (forma exigida) corrigido:** a linha vem de `state.qualification_step` **persistido** (não de `getNextQualificationStep`), que para o Ronaldo é `view` (medido); e como ele tem `visit_proposed = true`, o bloco real **também** traz a linha *"VOCE JA PERGUNTOU…"* | Desenho §2 |

---

## 6. Arbitragem: a proibição da régua de token — **MANTIDA, com a justificativa TROCADA**

O @sm proibiu, e ele está certo na conclusão. **A base factual, porém, está errada nos dois pontos.**

**Ponto 1 — "não há `conversation_id`, logo a cauda não é mensurável".** Falso. Medi as chaves de
metadata de `CLAUDE_RESPONSE` em 30 dias: `conversation_id` está em **505 de 505** eventos. **O join
existe. Eu o fiz:**

```
n (eventos com join) ........................ 505 de 505
mediana de input_tokens ..................... 1.802      (bate com o @sm)
mediana de collected_data POR TURNO ......... 132 chars  (o @sm publicou 46)
turnos com collected_data > 120 chars ....... 259 = 51,3 %  (o @sm chamou de "cauda")
… mediana de collected_data nesses .......... 243 chars ≈ 80 tokens ≈ 4,2 % do prompt
… mediana de input_tokens nesses ............ 1.904
```

**Ponto 2 — o denominador.** Os 46 chars são a mediana **por linha de `conversation_state`**, com as
18 vazias e todas as conversas dormentes pesando igual. A pergunta desta story é *"quanto vai ao
modelo **num turno**"*, e o denominador certo é o turno: **132 chars, quase 3× mais**. E o que ele
chamou de cauda é **metade do tráfego**.

*(Ressalva declarada, e ela é do meu número: `length(collected_data)` é lido **hoje**, não no
instante do evento — o objeto cresce ao longo da conversa. É um **teto**, não estimativa pontual. A
direção, porém, não é ambígua.)*

**Por que mesmo assim eu mantenho a proibição.** Não porque a medição seja impossível — ela é fácil
e eu acabei de fazê-la —, mas porque **ela mede a coisa errada**. O objetivo do `W1-6` é que o
`[SISTEMA]` seja a autoridade única sobre dia e hora; contagem de token **não fala sobre isso**, e
publicá-la como êxito é a classe `pr(ó|o)xim[ao]`: um número que se satisfaz sozinho. A prova desta
story é o turno-ouro (AC2) e a amostragem dirigida (AC9).

**Efeito colateral bom:** a medição corrigida **fortalece** a story. O @sm a escreveu como higiene
marginal (*"invisível na mediana"*). Ela é, medida no denominador certo, uma mudança que toca
**51,3 % dos turnos**. A AC9 fica com o texto corrigido para que ninguém a leia como cosmética.

---

## 7. Arbitragem: a ordem de deploy invertida — **CONCORDO**

`87-5 A → 87-5 B → 87-11 → 87-10`, ≥24 h entre cada. A razão é sólida e eu a verifiquei no código:
`buildSystemPrompt` local (`pipeline.ts:1911-1915`) despeja o `collected_data` inteiro, então a
87-10 subindo antes entregaria `ofertas_do_sistema` como **lista de horários afirmáveis fora do
bloco que carrega a REGRA ABSOLUTA** — que é, literalmente, o mecanismo do §1 do epic com um campo
novo.

Duas observações que ficam junto da ordem:

1. **A ordem protege o sítio 1 e só ele.** Os sítios 2 e 3 (§2) não são cobertos pela 87-11 em
   ordem nenhuma — por isso a **AC6-b** é obrigatória **independentemente** da fila.
2. A AC6 da 87-10 já prevê o caso de a fila ser invertida (a story carrega a exclusão mínima por
   conta própria). Mantido.

---

## 8. Arbitragem: a precisão do `detectAffirmedSlot` — **REMEDIDA**

O @sm registrou a divergência sem escolher e a transformou em pré-requisito do `W3-2e`. Remedi.

**Método declarado, porque foi a falta dele que produziu a divergência.**
**Unidade:** o **disparo** (uma mensagem `role='assistant'` em que `detectAffirmedSlot` devolve
`Date`). **População:** todas as mensagens `role='assistant'` de produção nos últimos 60 dias.
**Execução:** a função real (`packages/ai/src/flows/visit-slot.ts:464`), com `now` = `created_at` da
própria mensagem, via `tsx`.

```
mensagens role='assistant' em 60 d ....... 1.172
disparos ................................. 32   (2,7 %)
conversas distintas ...................... 19
disparos até 07/08 (janela do @po) ....... 30   ← os DOIS números publicados usam ESTE denominador
```

**Achado que fecha a divergência: não há erro de aritmética. As duas leituras têm o mesmo
denominador (30) e classificações diferentes.** `5/30 = 83 %` (briefing) e `~6,3/30 = 79 %` (epic)
são a **mesma medição com a fronteira em lugares diferentes** — e a fronteira nunca foi escrita.

**Minha classificação, com os casos-fronteira nomeados** (32 disparos, janela cheia):

| classificação | regra | resultado |
|---|---|---|
| **estrita** — afirma um dia+hora **de visita** como coisa resolvida | 23 verdadeiros / 9 falsos | **71,9 %** |
| **frouxa** — enuncia um slot concreto, incluindo proposta e promessa | 26 / 6 | **81,3 %** |

**Os 3 casos-fronteira que produzem toda a diferença** (colados do banco):

- *"Que tal às 11h então? … **Posso confirmar** sua visita para este sábado, dia 4 de julho, às 11h?"* — proposta em forma de pergunta;
- *"**Vou confirmar a disponibilidade** para sexta, dia 7, às 14h e já te aviso"* (Sueli, 03/08) — promessa de checar;
- *"Segunda-feira às 9h **o corretor te liga**"* (Silvana, 24/07) — afirma **ligação**, não visita. O instrumento não distingue os dois objetos.

**Os 6 falsos incontroversos** são todos da mesma família: o parser lê *"nosso atendimento no sábado
é até as **12h**"* como hora afirmada. Ex.: *"Só lembrando que nosso atendimento no sábado é até as
12h. **Qual horário fica melhor pra você?**"* — pergunta pura, disparo positivo.

**Ruling normativo, e vale para todo este epic:** **nem 79 % nem 83 % devem continuar publicados
como número único.** O que vai no lugar, em `agenda-state.ts:120-121` e nas stories que o citarem:

> *precisão do `detectAffirmedSlot`, unidade = disparo, população = mensagens `role='assistant'`,
> 60 d, n = 32 disparos em 1.172 mensagens (2,7 %) e 19 conversas: **71,9 % sob classificação
> estrita, 81,3 % sob classificação frouxa**. A diferença é a fronteira "proposta/promessa conta
> como afirmação?", e ela precisa ser declarada por quem citar o número.*

**Nada na 87-10 depende disso** (o campo é write-only e a AC3-(iii) prova). **O pré-requisito do
`W3-2e` está satisfeito** por esta medição — e ela reforça o veto original: um instrumento cuja
precisão varia 10 pontos conforme a fronteira **não pode ser insumo de decisão**, e a AC6-b (§2)
passa a ser o que impede que ele vire insumo por via indireta.

---

## 9. A regressão do `handoff.ts:138` — **HOTFIX PRÓPRIO, e ele entra na frente da fila**

**Confirmada no código:**
`flows/handoff.ts:138` → `- Disponibilidade para visita: ${formatBoolean(collectedData.visit_availability)}` —
e a 87-4 apaga `visit_availability` via `stripLegacyAgendaKeys`.

**A moldura mais forte do defeito não é a que o briefing dá.** A 87-4 **migrou um leitor e esqueceu
o outro**: `packages/web/src/app/dashboard/leads/[id]/page.tsx:192-203` já trata o formato novo, com
comentário explícito (*"virou o objeto `agenda_state`"*). O painel foi migrado; **o resumo que o
corretor recebe, não**. Isso é um esquecimento pontual, não uma decisão.

**Raio de alcance medido, e ele corrige o briefing.** Não é *"todo handoff de lead já tocado"*:

```
conversation_state atualizados desde o deploy da 87-4 (08/08 18:48 UTC) ...... 9
… desses, com alguma chave legada ainda presente ............................ 0
NICOLE_AGENDA_STATE_LEGADO_DESCARTADO (all-time) ............................ 0
conversas com agenda_state (formato novo) ................................... 1  (Ronaldo)
conversas com visit_availability (formato legado, intactas) ................. 56
```

**Hoje o dano é 1 lead.** O descarte do legado **ainda não rodou nenhuma vez** — as 56 conversas com
`visit_availability` estão dormentes e o resumo delas continua correto. **Mas a partir de agora todo
fato de agenda nasce no formato novo**, e cada um deles vira um *"nao informado"* no resumo do
corretor. É um defeito de dano **crescente e silencioso**: quanto mais a 87-4 funciona, mais ele
aparece.

**Decisão: hotfix próprio (`87-12`), e ele vai para o INÍCIO da fila** — antes de `87-5 A`.

Por quê, e não emenda:

1. **Fila.** As duas stories são o 5º e o 6º deploy, com ≥24 h entre cada. Pendurar um conserto de
   uma linha numa delas atrasa a correção de um defeito **vivo** em ≥ 3 dias.
2. **Reversibilidade.** É regressão de uma story **já em produção**. Precisa poder ser revertida
   sozinha, sem arrastar `W1-2c` ou `W1-6` junto.
3. **Superfície diferente.** As duas stories mexem no que **a Nicole** vê. Esta mexe no que **o
   corretor** lê. Blast radius, gatilho de rollback e verificação são outros — o teste é o resumo,
   não o prompt.
4. **Ambas se declaram puras** (*"subtração pura"*, *"escrita apenas"*), e a disciplina de escopo
   estreito é o que fez estas seis stories passarem.

**Conserto:** trocar por `hasAgendaFact(collectedData)`, com uma ressalva de redação — o campo hoje
imprime `sim/nao/nao informado` via `formatBoolean`; com `hasAgendaFact` o valor honesto é
*"sim (o lead mencionou)"* / *"nao informado"*. **Melhor ainda**, e cabe no mesmo hotfix: quando
existir `agenda_state`, imprimir a **`citacao`** — o corretor lê *"3ª feira às 17:30 (nas palavras
do lead — não é visita marcada)"* em vez de um booleano. A `citacao` existe exatamente para isso,
por docstring da própria 87-4.

**Achado adjacente, para o backlog e NÃO para o hotfix:** `flows/detect-appointment.ts:71` faz
`collectedData.visit_availability === true` sobre um campo que **sempre foi string** — o sinal já
nascia morto, antes da 87-4. Consertá-lo **liga um sinal que nunca esteve ligado** = caminho de
decisão novo. Fica registrado, não entra.

---

## 10. Item 6 — o `stories_planned` do epic: **CONFIRMADO, com uma divergência que sobrou**

As cinco entradas repostas (`87-6`, `87-7`, `87-8`, `87-9` reservada, `87-10`, `87-11`) e os quatro
`Done` (87-3, 87-4, 87-7, 87-8) batem com os PRs #379–#382 e com o `git log`. `stories_done`
consistente. ✅

**Sobrou uma:** **`87-0` está `Ready` no mapa e no arquivo, e está mergeada em produção** —
`17e9a8dc`, 2026-08-07 19:19, PR #377. É o mesmo critério que promoveu as outras quatro.
**Não a marquei `Done` por conta própria**: `Done` é transição de @qa/@devops e eu não tenho o gate
dela na mão. Deixei a divergência **anotada no mapa** para reconciliação, porque um mapa com uma
mentira conhecida é pior que um mapa com um `⚠️`.

**Também anotei** o que já estava certo e merece ficar visível: `87-3` está `Done` **e o cron nunca
executou** (`NICOLE_LASTRO_DIARIO` = 0 all-time, reconfirmado por mim hoje). "Mergeado" e "em
funcionamento" são coisas diferentes, e este epic tem **duas** stories nessa situação.

---

## 11. Checklist de validação — as duas stories

| # | Critério | 87-10 | 87-11 |
|---|---|---|---|
| 1 | Título claro e objetivo | ✅ | ✅ |
| 2 | Descrição completa (problema explicado) | ✅ | ✅ |
| 3 | ACs testáveis | ✅ após E1/E2/E3 | ✅ após E5/E6 |
| 4 | Escopo IN/OUT definido | ✅ (o OUT é exemplar: leitura → `W3-2e`, fechamento → `87-9`) | ✅ após E5 |
| 5 | Dependências mapeadas | ✅ (fila de deploy escrita e justificada) | ✅ |
| 6 | Estimativa de complexidade | ✅ S/M | ✅ XS/S |
| 7 | Valor de negócio | ✅ | ✅ — **subiu** com a medição do §6 |
| 8 | Riscos documentados | ✅ 7 riscos, com mitigação | ✅ 6 riscos |
| 9 | Definition of Done | ✅ | ✅ |
| 10 | Alinhamento com o epic | ✅ `W1-2c` (escrita) | ✅ `W1-6` |
| — | **Regra de corte da Onda 1** | ✅ **após o corte da AC8** | ✅ com a ressalva honesta do §5 |
| — | Rollback escrito, com nome (D7) | ✅ Marcos | ✅ Marcos |
| — | Denominador declarado nas réguas | ✅ | ✅ após E6 |

**87-10: 10/10 → GO.** **87-11: 10/10 → GO.** Ambas promovidas a `Ready`.

---

## 12. Fila de deploy homologada

| ordem | story | por quê aqui |
|---|---|---|
| **0** | **`87-12`** — hotfix `handoff.ts:138` (a criar pelo @sm) | regressão viva de uma story em prod; 1 linha; independente de tudo |
| 1 | `87-5 A` | como planejado |
| 2 | `87-5 B` | como planejado |
| 3 | **`87-11`** (`W1-6`) | fecha o despejo cru **antes** de existir chave nova para despejar |
| 4 | **`87-10`** (`W1-2c` escrita) | com AC6 **e** AC6-b verdes |
| — | `87-9` (canal do alerta) | **subir na prioridade**: é o gargalo de todos os instrumentos; herda o dedupe (§3) e o fechamento |

≥24 h entre cada. Piso de inconclusividade mantido nas duas (`n < 5` ⇒ a janela estende).

---

## 13. O que fica pendente, e de quem

| item | dono | o quê |
|---|---|---|
| `87-12` | **@sm** | criar o hotfix do `handoff.ts:138` (§9), com a variante da `citacao` |
| item novo de Onda 2 — *"a afirmação sem slot autorizado não sai como está"* | **@pm** | §4.3-2. Não crio: autoria de epic é do @pm |
| `W2-3` | **@pm** | rebaixar/reescopar: para esta classe o denominador já existe (§4.3-1) |
| `87-9` | **@sm** | herda dedupe (por `system_events`, sem estado novo) + fechamento do alerta |
| `87-0` no mapa | **@qa / @devops** | reconciliar `Ready` × mergeada (PR #377) |
| `agenda-state.ts:120-121` | **@dev**, dentro da 87-10 | trocar o `~79 %` pela redação do §8 |
| `detect-appointment.ts:71` | **backlog** | sinal morto desde antes da 87-4; ligar = decisão nova |

---

**Assinado:** @po (Pax) · 2026-08-10
*As medições de produção são somente-leitura. A mutação de `agenda-state.ts` foi revertida e o
arquivo conferido por `md5` (`0998eaf4fc8fb3d285cac67bda6f8701`); `git status` limpo em
`packages/`.*
