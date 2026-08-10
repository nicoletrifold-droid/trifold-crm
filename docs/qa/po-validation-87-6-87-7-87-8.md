# Validação @po — Stories 87-6, 87-7 e 87-8 (Epic 87 v0.6)

**Validador:** @po (Pax) · **Data:** 2026-08-08
**Escopo:** validação de draft das três stories novas da leva + **correção de canal** que afeta a
`87-3` (já em produção, PR #379) + duas pendências abertas minhas.
**Método:** leitura integral das três stories; verificação de **cada afirmação de código contra o
`HEAD`**; remedição de **todos os números** contra produção (`dsopqkqjkmhytudaaolv`, Management API,
**somente SELECT**); verificação do estado real do banco e do Vercel.

---

## Veredito

| Story | Item | Veredito | Status |
|---|---|---|---|
| **87-6** — dedupe atômico do lastro | hotfix `W0-5` | **GO com emendas obrigatórias** | Draft → **Ready** |
| **87-7** — o resumo não grava a fala dela como fato | `W1-3b`, deploy 2 | **GO com emendas obrigatórias** | Draft → **Ready** |
| **87-8** — o histórico passa a ser a cauda | `W1-1`, deploy 3 | **GO com emendas** | Draft → **Ready** |

As emendas já estão **aplicadas nos arquivos das stories** (AC e escopo são do @po). Nenhuma delas
reabre desenho: todas ou corrigem uma régua que não podia ficar vermelha, ou nomeiam um acoplamento
que ninguém tinha escrito.

**Pendências minhas — as duas fechadas nesta rodada:**
- ✅ **`D4` da `87-4`** — AC3 ratificada e qualificada por escrito (`87-4`, Change Log v0.4).
- ✅ **Desenho §3 da `87-7`** — ratificado **manter** a fala da Nicole como contexto rotulado, com
  condição de reabertura escrita.

---

## 🔴 1. Correção de canal — decisão

> **"Não usamos Telegram e sim WhatsApp."** — Gabriel, 08/08

### Onde essa correção mora: **story própria (`87-9`)** + **uma costura mínima na `87-6`**

**Não é emenda na `87-6`. Não é requisito das três.** A razão é a mesma que o @sm usou para separar
a `87-6`, aplicada na direção contrária: **não se pendura numa story com prazo de horas um item que
depende de aprovação externa.**

**A dependência que ninguém tinha nomeado:** não existe envio de WhatsApp de **texto livre** iniciado
por nós. Os **12** templates em uso são **todos pré-aprovados pela Meta** (medido em
`whatsapp_send_log`). Um alerta novo exige **template novo aprovado** — latência não determinística,
e pode ser reprovado — mais a decisão de destinatário (o Gabriel **não tem `phone` em `users`;**
Marcos, Alexandre e Joabe têm; o `sla-alerts` usa a env `SLA_ESCALATION_PHONES`). **Isso não fecha
até amanhã às 11:38 UTC.**

### O que entra na `87-6` (custo ~zero, e é o que evita reabrir a rota duas vezes)

A `87-6` é a **última story a tocar `route.ts:145,148`** antes da `87-9`. A **AC3** foi reescrita para
assertar sobre uma costura local — `notificarAdmins(msgs: string[]): Promise<number>` — e **não**
sobre `sendTelegramAdminAlert`. Assim a `87-9` troca **um corpo de função** sem reabrir a rota.

### O que muda nas `87-7` e `87-8`: **nada, e isso está certo**

A regra normativa que o @sm escreveu — ***nenhuma AC pode depender de "o alerta chegou"*** — é
**correta e permanece**. As ACs delas se apoiam em `select` sobre `system_events`, que é
verificável. Nenhuma das duas envia alerta. Transformar o canal em requisito delas seria escopo
extra em duas stories que não têm o problema. Só a referência cruzada foi atualizada (aponta para a
`87-9`, não para "backlog").

### Quatro medições que mudam o item de backlog

| # | medição | consequência |
|---|---|---|
| 1 | `TELEGRAM_BOT_TOKEN` **existe** no projeto Vercel `freelans-dev/trifold-crm` (33 envs). O que falta é **`TELEGRAM_ADMIN_CHAT_ID`** — e `telegram.ts:5` exige **os dois** | "Configurar o Telegram" nunca foi uma variável; eram duas. O canal está abandonado, não mal configurado |
| 2 | O projeto avisa por WhatsApp **todo dia**: `novo_lead_corretor` 333 envios (último **hoje 12:15**), `aviso_bolsao_gestor` 56 (hoje 11:35), `alerta_sla_gestor` 32, `atualizacao_obra_cliente` 688 | O canal vivo é o WhatsApp, e o padrão de referência é `bolsao-rebalance/route.ts:248` |
| 3 | 🔴 **Já existe superfície humana para o evento:** `/dashboard/sistema` lê `system_events` com filtro de `level`/`category`, e o alerta é `level: warn, category: ai` | **O que falta não é o registro, é o empurrão.** Ninguém abre um painel para saber que a Nicole mentiu ontem |
| 4 | `sendPushToUser` (`lib/server/push-service.ts`) tem **36 assinaturas ativas** e é usado pelo digest do bolsão | Existe caminho **sem dependência externa** para servir de ponte até o template sair |

### O requisito da `87-9` que é mais importante que o canal

> 🔴 **O notificador tem de devolver resultado e registrar a supressão em `system_events`.**

`sendTelegramAdminAlert` devolve `void` e some em silêncio. **Trocar Telegram por WhatsApp sem isso
só muda o lugar onde o silêncio acontece** — template reprovado, token vencido ou telefone errado
voltam a ser `void`. É a mesma classe de falha do `loader.ts:62` (`return ""`).

**Os outros 4 dependentes** (`meta-sync-entities`, `meta-sync-health`, `webhook-health`,
`admin/email-stats`) entram na `87-9` ou saem dela **por escrito** — não por esquecimento. A
divergência de contagem (@devops: 6 crons · @sm: 4 crons + 1 rota, por `grep`) fica registrada para
o @devops arbitrar; ela não bloqueia nada.

---

## 2. Story 87-6 — o prazo **não** fechou. Fechou a metade que quase não importava.

### 2.1 ✅ O que está mesmo no ar (conferido em `pg_indexes`, produção, 08/08)

```
uniq_system_events_afirmacao_sem_lastro_message
  ON system_events (((metadata ->> 'message_id')))
  WHERE event_type = 'NICOLE_AFIRMACAO_SEM_LASTRO' AND metadata ? 'message_id'
```

A prova do Gabriel (pré-check zero colisões, dupla inserção, `23505` na segunda, sondas removidas)
**é sólida e a AC1-a foi reescrita para preservá-la** — ela não se repete.

### 2.2 🔴 A migration do repo **não** batia com o aplicado

| | story (v0.1) | aplicado em produção |
|---|---|---|
| nome | `ux_system_events_afirmacao_sem_lastro` | `uniq_system_events_afirmacao_sem_lastro_message` |
| predicado | `metadata->>'message_id' IS NOT NULL` | `metadata ? 'message_id'` |

**`CREATE UNIQUE INDEX IF NOT EXISTS` casa por NOME, não por definição.** O DDL original criaria um
**segundo índice redundante** sobre a mesma expressão, na mesma tabela. Migration reescrita como
**cópia literal do aplicado**, e a AC1-a ganhou uma prova nova: **contar os índices de `pg_indexes`
depois de rodar o arquivo**. Se aparecer um índice a mais que o esperado, a migration divergiu.

*(A diferença de predicado é semanticamente inócua — `metadata ? 'message_id'` inclui
`{"message_id": null}`, cujo valor indexado seria `NULL`, e o btree admite múltiplos `NULL`. Não é
razão para trocar o que está no ar.)*

### 2.3 🔴 O achado que inverte a urgência

**O `NICOLE_LASTRO_DIARIO` é emitido incondicionalmente** (`route.ts:107-130` — não há nem `select`
antes dele), e o índice (B) exige `metadata.dedupe_key`, **que o código de hoje não emite**.
E não existe índice único "um por dia": `date_trunc('day', created_at)` e `created_at::date` sobre
`timestamptz` são **STABLE**, não `IMMUTABLE`.

> **O índice que entrou protege o evento que provavelmente NÃO vai disparar.** O gate mediu **0,13
> alerta/dia** e `system_events` tem **0** eventos `NICOLE_%` (conferido — o cron nunca rodou; a AC6
> da 87-3 segue `PENDING`).
>
> **O evento que será certamente escrito amanhã — o número que dimensiona a v1 do Epic 88 — segue
> sem proteção nenhuma, e é impossível protegê-lo sem deploy.**

É exatamente o dano que a própria story descreveu como o mais grave (*"duas publicações
contraditórias da mesma métrica, no dia 1"*).

**Emenda: AC9 nova.** O @devops **escolhe e escreve** uma das três saídas antes de 09/08 11:38 UTC:
1. código no ar a tempo (AC5 + AC1-b);
2. cron desligado no projeto Vercel não-canônico;
3. plano B (deixar rodar + limpar por SQL + runbook: **o número de 09/08 é não-conclusivo**).

**Qualquer uma serve. Nenhuma delas é "não fazer nada".**

E a consulta do dia 09/08 vira a **primeira medição direta da corrida**, num evento sem guarda
nenhuma: 1 linha = ok · 2 linhas = a corrida é real (e, se os `lastro_pct` divergirem, colar os
dois) · **0 linhas = o cron não rodou**, achado maior que o dedupe.

### 2.4 Nota de método — não corroborei a premissa da corrida pelo banco

`system_events` não tem **nenhum** evento com `source like 'cron/%'` em 15 dias. E os crons com
efeito externo observável **não mostram envio duplicado** em 30 dias (`aviso_bolsao_gestor` sai a
cada 30 min, sem par em <90 s; `alerta_sla_gestor`, idem). **Mas os dois têm guarda própria de
estado**, então a ausência de duplicata não prova ausência de corrida. **A evidência do @devops é
dos logs da Vercel e continua valendo.** Registrado na story para que a AC9 resolva a dúvida com
dado direto em vez de mais argumento.

### 2.5 Escopo e urgência — reajustados

- **Urgência rebaixada** para as ACs de código (fluxo normal, gate normal).
- **Urgência mantida, e transferida**, para a **AC9** — é o único item que ainda tem prazo em horas,
  e o dono é o @devops.
- AC1 dividida em **AC1-a** (versionar o aplicado) e **AC1-b** (aplicar o índice B, com a nota
  explícita de que ele é **inócuo até o deploy da AC5** — inócuo não é errado).

---

## 3. Story 87-7 — 🔴 o dado **não** está limpo. A régua é que está cega.

### 3.1 ✅ O achado que muda o desenho: confirmado, no `HEAD`

```ts
// packages/ai/src/flows/visit-slot.ts:472-473
const said = resolveVisitSlotParts({ message: assistantMessage, now })
if (!said.day || !said.time) return null
```

**`detectAffirmedSlot` exige dia E hora**, e *"Sandra agendou visita para sábado, dia 8"* não tem
hora. Reusá-la crua **produziria um guarda cego no caso-mãe**. A `AC1`, com vermelho obrigatório
contra ela, é o desenho certo — e a restrição de **não tocar** em `visit-slot.ts` (AC7) protege o
baseline de lastro da 87-3.

Confirmados também os dois escritores: `pipeline.ts:1567-1581` (a cada 5 mensagens, fire-and-forget,
recebe `assistantMessage`) e `enrich-leads/route.ts:176-177` (`// AC8: Always update ai_summary`,
**incondicional**, a cada 30 min).

### 3.2 🔴 A correção que muda a story: **existe um caso vivo, não corrigido**

Rodei uma régua mais larga sobre os mesmos **226** resumos e **li os candidatos um a um** — porque
contagem de regex sem triagem é como se publica número errado com AC verde:

| lead | resumo | appointments | triagem |
|---|---|---|---|
| *(sem nome)*, 02/07 | *"possui uma **audiência agendada** na justiça"* | 0 | ❌ falso positivo |
| **Orlice**, 05/08 | *"Lead **ainda não confirmou** visita"* | 0 | ❌ falso positivo (negação) |
| 🔴 **Lucimara**, 04/08 | ***"Marcou visita ao decorado para o dia 8 (sábado)**, mas precisa confirmar o horário de trabalho antes de finalizar o agendamento"* | **0** | ✅ **CASO REAL E VIVO** |

**08/08/2026 é sábado.** O resumo da Lucimara afirma, **hoje**, uma visita que nunca existiu — mesma
frase da Sandra, mesmo empreendimento, e **ninguém a viu**. O número honesto da `M5` é **1**, não 0.

**Três consequências, e nenhuma é cosmética:**

1. **A `M5` não está satisfeita.** Duas instâncias em 226 resumos não são "o dado está limpo": são
   uma taxa.
2. 🔴 **A `AC10-(ii)` era uma métrica que se absolve sozinha.** Ela mandava *"repetir a consulta do
   Context §2"* — a que lê **0 hoje com a Lucimara viva na tabela**. Uma régua que já está verde
   antes do conserto continua verde depois **independentemente de o guarda funcionar**.
   **Régua reescrita literalmente na AC**, com **baseline obrigatório VERMELHO na T0**, denominador
   declarado (só os resumos **reescritos** na janela) e piso de inconclusividade (**n < 5** ⇒ a
   janela estende, não se declara sucesso sobre 2 resumos).
3. **A Lucimara vira segunda fixture literal da `AC1`, e é mais dura que a Sandra:** tem dia sem
   hora *e* uma ressalva no próprio texto. O guarda **não pode se absolver pela ressalva** — o
   resumo **abre afirmando**, e é a abertura que volta ao contexto por `loader.ts:195`.

**Nova T8:** corrigir a Lucimara à mão **antes** do deploy (padrão `W1-3a`, com backup — **R-B**),
preservando a linha original no Dev Agent Record, porque ela é a fixture.

### 3.3 A classe de erro nova — a métrica proposta ao @pm **não é suficiente**

Confirmado em produção: dos resumos que afirmam visita, **12 de 12 não têm appointment futuro e
todos usam data relativa** — André → visita em **05/08**, Helena → **16/07**, Edicleia diz
*"amanhã"* e a visita foi **07/08**, Wilson → **27/07**, Marlene → **03/08**.

A `T7-(b)` propunha isso ao @pm como métrica nova. **Proposta a outro agente não trava nada**, e
enquanto ela não existir a `AC10` continuava apoiada na `M5` — que pergunta *"existe appointment?"*
e responde **sim** para os 12. **É uma métrica que não consegue ficar vermelha nesta classe de
erro.** Escrever a AC contra um instrumento que já se sabe cego é o defeito que esta família de
stories existe para não repetir.

**Emenda: `AC11` nova** — a classe é **medida nesta story** (teste puro do `renderFatoDeAgenda` com
appointment no passado + a coluna `relativo` da régua da AC10, com baseline 12/12 na T0). A proposta
ao @pm continua, **como registro, não como a garantia**.

### 3.4 ✅ Ratificação — **manter** a fala da Nicole como contexto rotulado

Ratificado, e a razão que decide **não era a que estava escrita**:

1. O *"próximo passo"* é o que o corretor lê no card — a perda é certa, o ganho seria hipotético.
2. Quem garante é a **camada 3**, não o rótulo. Se o rótulo bastasse, a **RN8** já teria bastado.
3. 🔴 **A remoção não seria nem simétrica.** Só o escritor **A** recebe `assistantMessage` como
   campo (`lead-memory.ts:14`). O **B** — o dominante, 92,5% da população — recebe **a conversa
   inteira** via `haiku-enrichment.ts:82`. **Remover no A deixaria o B contaminando o mesmo campo,
   com o time acreditando que a fonte foi cortada.** É a assimetria que a `87-4` já pagou uma vez.

**Condição escrita:** se, na janela de 24 h, a maioria dos bloqueios do escritor A tiver a frase
contaminante rastreável à fala dela (a `AC8` já registra `citacao_curta`), **a remoção volta à
mesa** como follow-up. Ratificação é decisão com data, não para sempre.

### 3.5 Ressalva à regra de corte

A story afirmava "zero" mudança no que a Nicole vê. **Não é zero:** o bloco `FATO DE AGENDA` entra
no prompt do resumo, e o resumo volta ao contexto dela a cada turno por `loader.ts:195` (fallback do
`ai_summary`, ativo em 100% dos turnos enquanto L1/L2/L3 estiverem vazios — `CR-2`).

**Cabe na Onda 1 mesmo assim, e por argumento melhor:** nenhum `if` novo, nenhum gate novo, nenhuma
condição nova sobre a resposta — e a direção é **redutora** (o bloco **substitui** prosa derivada
por dado do banco com data absoluta). Escrever "zero" seria a mesma imprecisão que fez a `M5`
parecer satisfeita. A `AC10-(iv)` (`M1`/`M4` sem aumento, pelo cron da 87-3) é o que checa isso, e
**não é opcional**.

---

## 4. Story 87-8 — a medição mais limpa deste epic, com um denominador escorregado

### 4.1 ✅ A segunda esteira: confirmada, literal

```ts
// packages/web/src/app/api/cron/enrich-leads/route.ts:62-69
      // AC3: Load last 20 messages          ← o comentário diz "last"
        .order("created_at", { ascending: true })   // ← o código pega as PRIMEIRAS
        .limit(20)
```

Idêntico a `pipeline.ts:1630`. **É a terceira story seguida em que o `enrich-leads` é a esteira
esquecida** (87-4: último escritor de 70% dos estados; 87-7: toca 92,5% dos resumos).

### 4.2 O tratamento como "deploy B" é **adequado** — com uma emenda

A separação está certa: o deploy A muda o que ela **diz**, o B muda o que o CRM **acredita** e
**escreve** em `leads`. Manter B nesta story (em vez de story própria) também está certo — é a mesma
linha, o mesmo defeito, o mesmo teste.

🔴 **O que nenhuma das duas stories nomeia:** depois do deploy B, o `enrich-leads` gera o
`ai_summary` a partir de **outro texto** (a cauda), e **o guarda que a 87-7 acabou de instalar roda
sobre esse resumo**. Cauda recente tem mais probabilidade de conter fala de agendamento da Nicole
do que o começo da conversa. **O deploy B pode reabrir o defeito do resumo por um ângulo novo.**

**Emenda:** a janela de 24 h do deploy B repete **a régua da `AC10-(ii)` da 87-7**, não só a amostra
de 5 leads. Subir o `NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO` **não** é gatilho de rollback (o guarda
está trabalhando); **resumo novo com `appts = 0` é**. A ordem A → B continua certa; muda o que se
olha em B.

**E um item de fila:** `cron/enrich-leads/route.ts` é tocado por **três** stories
(87-7 · 87-8-B · 87-5-B). A ordem escrita — **87-7 → 87-8-A → 87-8-B → 87-5-A → 87-5-B**, ≥24 h
entre cada — é a única coisa que permite ler qual mudou o quê. Foi para o DoD.

### 4.3 Remedição — os números batem, exceto um denominador

| medida | story | @po | veredito |
|---|---|---|---|
| conversas com mensagem (30 d) | 335 | **335** | ✅ |
| >20 msgs, qualquer papel | 31 (9,3%) | **31** | ✅ |
| com Nicole ativa | 136 | **136** | ✅ |
| 🔴 denominador da story | 17 = **12,5%** | **17 = 12,5%** | ✅ |
| respostas com janela cheia (30 d) | **47** | **47** | ✅ |
| respostas com janela cheia (90 d) | **90** | **90** | ✅ |
| maior conversa | 40 / 45 | **40 / 45** | ✅ |
| conversas afetadas (30 d) | 19 | **15** | 🔴 |
| conversas afetadas (90 d) | 34 | **28** | 🔴 |

**A contagem de RESPOSTAS está certa** — é a unidade declarada e é a que importa. O que escorregou
foi a de **conversas**: 19 e 34 são a **população** com >20 mensagens `user+assistant`, não o
subconjunto com resposta cega. **Não muda decisão nenhuma** — muda o que fica escrito, e este epic
já aprendeu que é aí que o erro seguinte nasce. Corrigido na T0.

### 4.4 O escape da `87-5` — três leituras, e a conclusão sobrevive às três

| leitura | conta | % de 86 | escape (limiar 10%) |
|---|---|---|---|
| @po, 07/08 | 17 de 85 | 20,0% | não dispara |
| @sm, 08/08 — qualquer papel | **18 de 86** | **20,9%** | não dispara |
| 🔴 @po, 08/08 — só `user+assistant` | **11 de 86** | **12,8%** | não dispara |

**O escape não dispara em nenhuma leitura; a ordem `W1-1` → `W1-7` está confirmada pela terceira
vez.** Mas o `18` conta **todos os papéis**, enquanto o **§1 da própria story** declara o
denominador como `user+assistant`. Em 30 dias há **901** mensagens `broker` contra **619** de
`assistant`: a escolha de régua **não é detalhe**. As duas passam a ser declaradas na T0.

### 4.5 🔴 O `grep` da AC8-(iii) não podia dar 0

Como escrito, `grep -rn 'ascending: true' packages/web/src/app/api/cron/enrich-leads
packages/ai/src/chat/pipeline.ts` devolve **3** ocorrências no `HEAD`, e uma é **legítima**:
`pipeline.ts:787`, o `activeAppointment` ordenado por `scheduled_at`. **Um `grep` que precisa de
interpretação humana para ser lido como verde é um `grep` que vai ser declarado verde sem ser
lido.**

Régua corrigida na AC: `… | grep 'created_at'`, com baseline **2** no `HEAD`
(`enrich-leads:68` e `pipeline:1630`) — **o vermelho e a lista de tarefas passam a ser o mesmo
comando.**

---

## 4-bis. Re-gate da `87-7` — `D1` fechado: a `AC10-(ii)` v2 (09/08)

**O `D1` estava certo e era meu.** As réguas boas existiam no Dev Agent Record e no gate, mas a
**AC no corpo da story continuava a antiga** — e quem valida lê a AC. Corrigido.

**Medi as quatro candidatas de forma independente contra produção (09/08, `n = 231` resumos,
`11` afirmam visita):**

| régua | nos 11 | na população | direção | veredito |
|---|---|---|---|---|
| ~~`pr(ó|o)xim[ao]`~~ | 11/11 | **183/231** (170 = *"Próximo passo"*) | — | ❌ **PROIBIDA** — saturada; marcava a Marlene, que **já usa data absoluta** |
| 🔴 **`data_absoluta_com_ano`** | **0/11** | **0/231** | **subir** | ✅ **PRINCIPAL** (N2 aceito) |
| `data_absoluta` | **6/11** | 7/231 | subir | ✅ apoio |
| `relativo_estrito` | **2/11** | 7/231 | **cair** | ✅ apoio |

**Confirmei os números do @dev e do @qa um a um** (183/231 · 170 "Próximo passo" · 2/11 · 6/11 ·
0/11). **O N2 está certo e adotei:** `data_absoluta_com_ano` é a única que **não pode ser satisfeita
pelo estilo que já existe** — 0 em 231, nada no projeto a produz hoje —, e é exatamente o formato
que o bloco `FATO DE AGENDA` ensina. `data_absoluta` genérica já está com **6/11 do caminho andado**
e sobe por acaso.

🔴 **Divergência que precisa ficar registrada, e ela tem armadilha:** o re-gate cita
`data_absoluta_com_ano` em **19/231**. Eu meço **0/231** com régua de **formato de data**
(`dd/mm/aaaa` ou *"8 de agosto de 2026"*) e **40/231** com régua de **menção a ano** (`~ '20[0-9]{2}'`)
— e **39 desses 40 são ANO DE ENTREGA DA OBRA** (*"entrega prevista para primeiro semestre de
2027"*). O `19` está entre as duas, logo o padrão que o produziu **captura ano de entrega
parcialmente**. **Implementada frouxa, a régua principal vira o `próximo passo` de novo, uma ordem
de grandeza menor.** A AC carrega a **expressão literal**, e a T0 compara caractere a caractere se
divergir.

**Duas mudanças a mais na AC, que caem do mesmo raciocínio:**
- **`appts = 0` mudou de papel.** Depois da **T8** ele é **0 por construção** — deixou de ser
  métrica de sucesso e virou **guarda de não-regressão**: linha nova com `appts = 0` e
  `updated_at > deploy` é **rollback imediato**, não "ponto a observar".
- **A janela é de `n`, não de tempo:** `AC10-(ii)` só conclusiva com **`n ≥ 5`**.

*Escopo não reaberto: nenhuma linha de código, nenhum desenho, nenhuma AC nova.*

---

## 4-ter. Re-gate da `87-8` — `AC9-(ii)` v2 (09/08)

**Mesmo defeito da `AC10-(ii)`, outra story.** Confirmei por SQL as duas metades inertes:

| proxy | medição minha | veredito |
|---|---|---|
| `appointments` `created_by='nicole'` | **3 em 30 d**, 6 all-time, **último 31/07** | 24 h rendem **0** |
| blocos `[SISTEMA]` | `system_events ~* '(sistema\|visit\|mode\|agenda)'` → **0 all-time** | **não existe instrumento** |

🔴 **A previsão do @architect está falsificada:** 18 → **14** (30 d, +3/−7) e 11 → **10** (31–90 d).
**Ver a cauda faz o modo ligar MENOS.** Direção de risco: **~0,1 turno/dia**.

**Adotei as duas saídas, com papéis separados — nenhuma serve sozinha:**
- **retrospectiva = ANTES**, e produz **previsão falsificável** (~14/30 d). Limitações do @qa
  escritas na AC (regex sem `\b`, só a perna `lastAssistantMessage`) — é aproximação, não a função;
- **contador `NICOLE_VISIT_MODE_ARMED` = DEPOIS**, pelo `emit` que já existe (`pipeline.ts:474`),
  medindo **com a função de verdade**. **Metadata com `janela_cheia`** é obrigatória — sem ela o
  "depois" não é comparável com o "antes", medido só sobre respostas cegas.

**Regra de corte: concordo que o contador não a fere**, com a condição escrita — ele **lê** o
booleano já decidido, não computa nada; **a prova é a AC10** (turnos-ouro byte a byte).

🔴 **Consequência de processo:** a 0,1 turno/dia, **24 h rendem zero, e zero não distingue "não
aconteceu" de "não mede"**. A `AC9-(ii)` **deixa de fechar a janela do deploy A** — conclusiva só
com **`n ≥ 5`** (piso da 87-7), ordem de **semanas**. Declarar "sem aumento" com `n = 0` é
**proibido**; escreve-se **inconclusivo**.

**Mais quatro ajustes que caem do mesmo achado:** gatilho de rollback reescrito (**lead pedindo
visita e não recebendo horário — um caso basta**); **AC9-(iii) passa a ser amostragem dirigida** às
7 + 3 do churn; **Risco 2 rebaixado** de Alta para Média com a premissa marcada; **§3 razão 2 do
@architect marcada como falsificada, com a ordem MANTIDA** pelas razões 1 e 3.

**Baseline do dano superseded pela régua C do @dev (`F2`)** — reproduzi: **51 cegas em 17 conversas**
(30 d) e **39** (31–90 d). A minha de 08/08 (47/15) reiniciava o `row_number()` dentro da janela.
Correção sobre o publicado: **+18,6%**, não +53%. A decisão de fazer a story não muda.

> **Nota que vale para o epic inteiro:** a **AC2 sobreviveu à inversão da previsão porque exige o
> PAR de fixtures.** Uma AC escrita só para a direção prevista teria virado lixo no dia em que a
> medição chegou. É o argumento mais forte a favor da disciplina de "as duas fixtures no mesmo
> teste" que este epic vem aplicando.

*Escopo não reaberto: nenhuma linha de código, nenhuma AC nova.*

---

## 5. Regra de corte da Onda 1 — as três passam

| story | adiciona caminho de decisão? | leitura |
|---|---|---|
| **87-6** | **Não** — e nem é da Onda 1 (hotfix do `W0-5`). Migration + filtro de escrita em `system_events` | ✅ |
| **87-7** | **Não** — filtro de **escrita** sobre artefato derivado; nenhum `if` novo na resposta. **Com a ressalva** de que ela muda *indiretamente* o que a Nicole vê (§3.5) | ✅ com ressalva escrita |
| **87-8** | **Não** — o **referente** de dois gates muda, os gates não. A recusa da **AC2** em mexer em `isVisitSchedulingMode`, **medindo em vez de consertar**, é a leitura certa da regra | ✅ |

---

## 6. Checklist de 10 pontos

| # | Critério | 87-6 | 87-7 | 87-8 |
|---|---|:--:|:--:|:--:|
| 1 | Título claro e objetivo | ✅ | ✅ | ✅ |
| 2 | Descrição completa | ✅ | ✅ | ✅ |
| 3 | ACs testáveis | ✅¹ | ✅² | ✅³ |
| 4 | Escopo IN/OUT definido | ✅ | ✅ | ✅ |
| 5 | Dependências mapeadas | ✅ | ✅ | ✅⁴ |
| 6 | Estimativa | ✅ S | ✅ M | ✅ XS/M |
| 7 | Valor de negócio | ✅ | ✅ | ✅ |
| 8 | Riscos documentados | ✅ | ✅ | ✅ |
| 9 | Definition of Done | ✅ | ✅ | ✅ |
| 10 | Alinhamento com o Epic | ✅ | ✅ | ✅ |
| | **Score** | **10/10** | **10/10** | **10/10** |

¹ após dividir AC1 e criar a AC9 · ² após reescrever a régua da AC10-(ii) e criar a AC11 ·
³ após corrigir o `grep` da AC8-(iii) · ⁴ após acrescentar o acoplamento com a 87-7 no deploy B.

**Os três scores são pós-emenda.** Pré-emenda seriam 7, 6 e 8 — as três teriam passado o corte de
7 apenas a 87-6 e a 87-8; a **87-7** teria sido **NO-GO** pela régua que não podia ficar vermelha.

---

## 7. Fila de deploys consolidada

| ordem | o quê | intervalo | dono |
|---|---|---|---|
| **agora** | 🔴 `87-6` **AC9** — decisão escrita sobre o número diário de 09/08 | **antes de 09/08 11:38 UTC** | @devops |
| 1 | `87-6` código (migration `217` + `logEventOnce` + costura `notificarAdmins`) | fluxo normal | @dev + @data-engineer |
| 2 | `87-4` (PR #380, gate PASS) | depende do #379 ✅ | @devops |
| 3 | `87-7` (`W1-3b`) — **sozinho** | 24 h | @dev |
| 4 | `87-8` **deploy A** (`pipeline.ts`) | 24 h | @dev |
| 5 | `87-8` **deploy B** (`enrich-leads`) + régua da 87-7 repetida | ≥24 h depois | @dev |
| 6 | `87-5` **A** e **B** (`W1-7`) | 24 h cada | @dev |
| — | `87-9` — canal do alerta (WhatsApp + notificador que devolve resultado) | P0, paralelo | @sm → @dev |

✅ **`D7` RESOLVIDO em 09/08 — o Gabriel nomeou o MARCOS.** Condição aberta desde a rodada 1 da
`87-4`, fechada. Vale para as três stories desta leva.

⚠️ **Mas a janela da `87-7` não é de relógio.** Com ~3,9 enriquecimentos/dia, 24 h entregam
`n ≈ 1` resumo reescrito. A `AC10-(ii)` só é conclusiva com **`n ≥ 5`** — está escrito na AC.
*(Dimensionamento e operação da janela são item do @devops; o piso é meu.)*

---

## 8. Para o @pm — o que precisa entrar no epic

1. `W0-5` ganhou hotfix (`87-6`); o **`R-G`** diz migration `215` e o real é **216 ⇒ 217**.
2. `CR-1` cita apenas `pipeline.ts` — precisa citar **as duas esteiras** (`enrich-leads:62-69`).
3. `W1-3a`: o epic registra **1** linha, a execução foram **3**, e há uma **4ª** (Lucimara)
   encontrada **depois** — o que muda a leitura de "o dado está limpo".
4. **`M5` é cega** para a classe *"visita verdadeira que expirou e virou falsa"* — **12 de 12** dos
   resumos que afirmam visita estão nessa condição hoje. Métrica nova necessária; enquanto não
   existir, a **AC11 da 87-7** é o que segura.
5. **`87-9`** (canal do alerta) precisa de lugar no roadmap. **Provisionar o Telegram seria a
   correção errada** — entregaria o alerta onde ninguém olha.

---

*— Pax, equilibrando prioridades 🎯*
