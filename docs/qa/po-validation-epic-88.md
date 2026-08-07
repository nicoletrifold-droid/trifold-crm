---
validator: Pax (@po)
artefato: Epic 88 — Nicole: tool use na agenda
arquivo: docs/stories/epics/epic-88-nicole-tool-use-agenda.md
tipo: Revisão de coerência de epic, backlog e prontidão para execução (NÃO é validação de story)
epic: 88
epic_irmao: 87 (docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md)
validation_date: 2026-08-06
insumos:
  - docs/architecture/2026-08-05-validacao-epic-87.md (§5 — veto do @architect ao W4-1)
  - docs/research/2026-08-05-nicole-anti-alucinacao/analise-tecnica.md (§2 — tools do @analyst)
  - docs/stories/87-0-paridade-reconciliacao-agent-prompts.story.md (Ready, parcialmente executada em prod)
  - docs/stories/75-279-nicole-grafia-hora-nao-agendou.story.md (InReview, mergeada hoje 10:05)
metodo: >
  Auditoria dos 5 incidentes mensagem a mensagem no banco de produção `dsopqkqjkmhytudaaolv`
  (Management API, 06/08), + leitura do código em `main` (fc7bc011), + releitura dos 7 slugs de
  `agent_prompts` em produção. Nenhum número deste documento foi reconstruído do epic.
verdict: GO com ressalvas — 7 correções obrigatórias no epic ANTES de o @sm redigir
score: 8 / 10
decisao_central: SUSTENTA-SE (com a aritmética corrigida — e a evidência corrigida é mais forte)
risk: HIGH (muda o caminho de escrita da agenda, com lead pago no ar)
---

# Revisão de Epic — Epic 88 (Nicole: tool use na agenda)

## TL;DR

**GO, 8/10 — com 7 correções obrigatórias no documento antes de virar story.**

O epic é bem construído: nomeia o defeito de arquitetura corretamente ("quem entende não tem a
caneta"), aceita as três condições duras do @architect sem manha, e a Onda 0 é a coisa certa a
fazer antes de qualquer tool existir. **A decisão central se sustenta.**

O que ele erra é o mesmo que o @sm errou na 87-0 e o que eu já registrei como padrão desta casa:
**os números foram herdados de documentos anteriores e não foram remedidos contra a produção de
hoje.** Fui ao banco conferir cada um. Cinco afirmações estruturais não sobrevivem:

| # | O epic afirma | O banco/código diz (06/08) |
|---|---|---|
| 1 | "Quatro dos cinco incidentes são desta classe" | **Três de quatro.** A Silvana **não é incidente de agenda** — ela pediu **ligação**, não visita, e a ligação **aconteceu** (`lead_tasks` "ligar às 9:00", concluída 27/07 09:39) |
| 2 | F-7: o `visit-scheduling` de produção manda dizer *"Agendei sua visita para [dia] as [horario]"* | **Morto.** O slug foi reconciliado em **05/08 20:58**: 5.105 chars, `is_active=true`, `Agendei sua visita` = 0 hits, `endereço do empreendimento` = 0, frase-molde = 0. "stand" = **0 nos 7 slugs** |
| 3 | PM2: baseline de lastro ≈ **50%** (6 de ~12) | **31%** (5 de 16 falas com lastro no momento da fala). O próprio §1 do epic diz "1 em cada 3" — a contradição está dentro do documento |
| 4 | PM2 como definida ("appointment em ±30 min") | Com essa definição a linha de base sai **81%**, porque conta a visita que um **humano criou depois** para consertar. Sueli, Valnira e Maria — os incidentes — contariam como **sucesso** |
| 5 | T2/T3 (remarcar/cancelar) precisam entrar na v1 "de propósito" | **Zero** mensagens de lead pedindo remarcar/desmarcar/adiar/trocar dia em ~8 semanas. Não há divergência a prevenir num caminho que nunca é exercido |

E dois furos de sequência que o @sm vai bater de frente:

- **88-6 não pode medir o que promete.** O validador de citação está na Onda 1, mas `citacao_do_cliente` **só existe como argumento da tool**, que nasce na Onda 2. Em Onda 1 ele valida o quê, contra o quê?
- **O Epic 87 nunca foi editado.** `W0-0` não existe no arquivo do Epic 87 — existe na validação do @architect e no nome de uma story. O Epic 88 declara bloqueio contra um item que o documento de destino não contém, e o Epic 87 ainda diz, no próprio texto, que *"nenhuma story das Ondas 3 e 4 começa antes de W2-1 estar verde"* — o que **proíbe o Epic 88 inteiro** por escrito.

**A boa notícia, e ela é grande:** quando se tira a Silvana e se olha o histórico completo de
produção em vez dos 14 dias, aparecem **três casos novos** da mesma classe (Célia 28/06, Helena
23/06, Miriam 07/07). O placar real é **6 de 7**, não 4 de 5. **A tese do @pm é mais forte do que
o próprio epic conseguiu defender.**

---

## 1. A arbitragem se sustenta? — auditoria dos incidentes, um a um

Reconstruí as cinco conversas no banco de produção, mensagem a mensagem, e cruzei com
`appointments` (incluindo `created_by` **e** `created_at`, que é o que separa "a Nicole gravou" de
"um humano consertou depois").

| Incidente | O que realmente aconteceu | Classe | @architect ou @pm? |
|---|---|---|---|
| **Sandra** 27/07→05/08 | `visit_availability` nasceu da fala da própria Nicole; o `[SISTEMA]` afirmou "sábado dia 8" como fato do cliente | **Contexto envenenado** | **@architect** |
| **Sueli** 03/08 21:52 | Expediente correto no prompt e na própria fala dela 1 minuto antes; ela disse *"Sexta às 14h fica fora do nosso horário… mas às 14h estamos sim disponíveis!"* e depois *"Te espero por lá"*. `appointment` criado **à mão pelo corretor Odair em 04/08 09:55** | Modelo entendeu, não tinha caneta | **@pm** |
| **Valnira** 04/08 00:09 | `"Na quinta as 10"` — o parser não resolveu (pré-75-268); o `[SISTEMA]` mandava **não** afirmar horário; ela afirmou, e 1 minuto depois perguntou o horário. `appointment` criado **à mão (admin) em 04/08 11:21** | Modelo entendeu, não tinha caneta | **@pm** |
| **Maria Oliveira** 06/08 10:04 | `"As 11hrs"` — parser não resolveu; ela **fabricou** um bloco `[SISTEMA: … LIVRE]`, respondeu "LIVRE" a si mesma e confirmou. `appointment` criado **à mão (admin) 2h depois**, pelo Marcos | Modelo entendeu, não tinha caneta | **@pm** |
| **Silvana** 24/07 23:41 | ⚠️ **Não é incidente de agenda.** Ela disse *"Eu prefiro que ele me telefone"*. `"As 9hs"` era hora de **ligação**. A Nicole **entendeu e respondeu certo** ("Segunda-feira às 9h o corretor te liga"), e a ligação **aconteceu**: `lead_tasks` "ligar às 9:00", due 27/07 09:00, **concluída 27/07 09:39** | Fora de escopo do Epic 88 | **nenhum dos dois** |

### Veredito da arbitragem

**A decisão se sustenta — a contagem não.** Dos **quatro** incidentes que são de agenda, **três**
são "o contexto estava certo (ou conservadoramente certo) e o modelo afirmou assim mesmo porque
entendeu o que o parser não entendeu". Um (Sandra) é a classe do @architect. **3 de 4 é maioria
suficiente para a tese.**

Duas precisões que o epic precisa absorver, porque a frase atual é atacável:

1. **"o contexto estava certo" é impreciso.** Em Maria e Valnira o `[SISTEMA]` dizia *"o cliente
   não indicou o horário"* — o que é **falso** sobre o cliente (ela indicou) e **verdadeiro** sobre
   o que o sistema autorizou. A formulação defensável é: *o contexto estava correto sobre a
   AUTORIZAÇÃO e errado sobre a INTENÇÃO do cliente; o modelo estava certo sobre a intenção e não
   tinha como registrá-la.* É exatamente a tese do epic — só que dita de um jeito que o @architect
   não consegue derrubar.

2. **Silvana sai da tabela de incidentes e não pode ficar em §2.4 como "Sim, este epic fecha".**
   A `agendar_visita` não resolveria a Silvana: não havia visita a agendar. O defeito real dela é
   **outro e continua aberto**: a Nicole assume compromisso de **ligação** e nada é gravado —
   `lead_tasks` só tem `source: 'manual'`, criado por humano. Isso é um item de backlog novo, não
   um item deste epic (ver §8).

### A evidência que o epic deixou na mesa — e que fortalece a decisão

Varri **todas** as falas de confirmação de visita desde 10/06, não só as 2 semanas:

| Data | Lead | Fala | Lastro no momento da fala |
|---|---|---|---|
| 23/06 | Helena | "Te espero no sábado às 10h" | ❌ — `appointment` criado por **corretor na manhã seguinte** |
| 28/06 | **Célia** | **"Agendei sua visita para este sábado às 9h"** (após `"As 9"`) | ❌ — **zero appointments até hoje** |
| 07/07 | Miriam | "Te esperamos amanhã, dia 8 de julho, às 11h" | ❌ — `appointment` criado por **corretor na madrugada seguinte** |
| 30/07 | Ailton | "sábado 1º de agosto, **às 9h**" | ❌ — o slot autorizado era **10h** (mismatch de 1h, e `NICOLE_SLOT_MISMATCH` **nunca disparou**) |

**Célia é o caso mais limpo de todos** e é anterior aos cinco: `"As 9"` (número pelado, pré-75-268),
a Nicole disse *"Agendei sua visita"* — a frase-molde literal do prompt de produção da época — e
**nunca existiu appointment**. Ninguém corrigiu à mão. Esse lead se perdeu em silêncio há 40 dias.

Com esses quatro, o placar da classe "o modelo entendeu e não tinha a caneta" vai a **6 de 7**
(Sandra é a única exceção). **Recomendo trocar a tabela de "14 dias" por esta, de 8 semanas.** Ela
custa uma consulta e transforma "quatro dos cinco" (contestável) em "seis dos sete" (medido).

---

## 2. O Epic 87 vai ficar coerente? — não, e o problema é maior que o W4-1

**Confirmado: o Epic 87 precisa ser editado, e não só para tirar o W4-1.** O arquivo
`epic-87-nicole-confiabilidade-contexto.md` está **exatamente como nasceu em 05/08** (`updated_at:
2026-08-05`, Change Log só com a v0.1) — ou seja, **não absorveu nem a validação do @architect nem
as decisões que o Gabriel tomou no mesmo dia**. Consequências concretas:

| # | Estado atual do Epic 87 | Por que quebra o Epic 88 |
|---|---|---|
| **E-1** | **Não existe `W0-0` no documento.** A paridade ainda é o `W2-4`, na Onda 2 | O `depends_on` do Epic 88 aponta para um item inexistente. Quem ler só os dois epics não encontra o bloqueio |
| **E-2** | Onda 2, texto literal: *"Nenhuma story das Ondas 3 e 4 começa antes de W2-1 estar verde"* | O Epic 88 **é** a Onda 4 do 87. Pela letra do 87, o Epic 88 inteiro está proibido de começar. O 88 resolve isso por conta própria ("W2-1 — parcial, já pago"), mas o documento que impõe o gate não foi alterado |
| **E-3** | `W4-1` continua na Onda 4, e `W4-2`/`W4-3` declaram **"Depende de: W4-1"** | Tirar o W4-1 sem repontar os dois deixa duas stories futuras órfãs |
| **E-4** | O diagrama de sequência (§9) termina em `W4-1 → W4-2/W4-3` | Fica com uma seta para o nada |
| **E-5** | `D3` ("tool use completo ou grounding incremental?") ainda está aberta | Já foi respondida — é o que o Epic 88 inteiro decide. Decisão aberta em dois lugares = a que ninguém executa |
| **E-6** | `D6` fixa o teto de latência em `CLAUDE_RESPONSE + 30%`; o `D88-3` fixa em `whatsapp_async_done + 10%` | **Dois tetos contraditórios para a mesma decisão**, em dois documentos ativos. Vira discussão de code review — exatamente o que o D6 existia para evitar |
| **E-7** | `M10` (Epic 87) e `PM8` (Epic 88) são a **mesma métrica**, com nomes diferentes, ambas declaradas não-conclusivas | Duas réguas para o mesmo "não matar o paciente" |
| **E-8** | A ordem da Onda 1 continua a original (W1-1 primeiro), que o @architect **reprovou** | O Epic 88 declara `W1-2b` bloqueante, mas o `W1-2b` está agendado **depois** do `W1-1` no epic. A dependência do 88 aponta para um item cuja posição é a que o @architect vetou |
| **E-9** | `stories_planned: []`, `stories_added: []` — vazios, com **3 stories já escritas** (87-0/87-1/87-2) | Não há mapa item→story. E o mapeamento já divergiu: `87-1` **não** é o `W0-1`, é a governança do painel |

### Edições obrigatórias no Epic 87 (lista fechada, para o @sm executar de uma vez)

1. **Criar `W0-0`** na Onda 0, marcado BLOQUEANTE, com ponteiro para a story 87-0 — e **remover
   `W2-4`** da Onda 2 (ou deixá-lo como "movido para W0-0").
2. **Remover `W4-1`** da Onda 4, com a linha: *"Substituído pelo Epic 88 (veto do @architect, §5.1).
   Ver `epic-88-nicole-tool-use-agenda.md`."*
3. **Repontar `W4-2` e `W4-3`**: `Depende de: Epic 88 · Onda 3 concluída` (não mais W4-1).
4. **Reescrever o gate da Onda 2** para: *"Nenhuma story das Ondas 3 e 4 — nem do Epic 88 — começa
   antes do harness. O harness de entrada do modelo é o item 88-2; o de efeito colateral foi
   entregue pela 75-279."* Sem isso o gate proíbe o 88 por escrito.
5. **Fechar `D3`** com "decidida — ver Epic 88 §2".
6. **`D6` passa a apontar para `D88-3`**: um teto, um dono, um documento. (Recomendo que o dono seja
   o Epic 88, porque é lá que a decisão tem número — ver §5 deste relatório.)
7. **`M10` vira ponteiro para `PM8`** (ou o inverso). Uma régua.
8. **Aplicar a ordem da Onda 1 que o @architect assinou** (W0-0 → W1-2a+W1-3a → W1-2b → W1-3b →
   W1-1), senão o "W1-2b bloqueante" do Epic 88 herda uma posição vetada.
9. **Preencher `stories_planned`** com o mapa item→story (`W0-0 → 87-0`, `— → 87-1`, `— → 87-2`),
   porque a identidade numérica já quebrou no primeiro dia.

E o mesmo vale, por simetria, para o Epic 88: **`stories_planned` como tabela item→story**, não
como convenção de numeração. A nota §13 ("uma story por item 88-N… se partir, avisar o @po") é
frágil — o Epic 87 quebrou essa regra em 24 horas.

---

## 3. As dependências bloqueantes são reais ou defensivas?

### F-7 / `W0-0` — **morreu ontem. Verificado no banco, hoje.**

O `visit-scheduling` de produção foi reescrito em **05/08 20:58** e reativado. Estado agora:

```
slug                   is_active  chars  updated_at            "Agendei sua visita"  "endereço do empreendimento"  frase-molde
visit-scheduling       true       5105   2026-08-05 20:58 UTC  não                   não                           não
guardrails             true       9069   2026-08-05 23:28 UTC  não                   (só a REGRA que PROÍBE)       não
system-personality     true       2478   2026-08-05 23:28 UTC  não                   não                           não
property-presentation  true       4536   2026-08-06 13:46 UTC  não                   não                           não
```

`"stand"` = **0 ocorrências nos 7 slugs** (era 4 em 3 slugs). O `guardrails` agora diz literalmente
*"NUNCA diga que o decorado fica no endereco do empreendimento"*. O `property-presentation` foi
reconciliado **hoje às 13:46** e abre com *"REGRA DE OURO DESTA SECAO: status, endereco, previsao
de entrega, metragem, tipologias… vem SEMPRE do bloco DADOS ATUALIZADOS"* — a decisão D-87-0-b do
Gabriel, aplicada.

> **F-7 tinha razão de existir — e a prova é a Célia.** Em 28/06 a Nicole escreveu *"Agendei sua
> visita para este sábado às 9h"*, que é a frase-molde literal daquele prompt, com zero
> appointments. O risco era real; **a mitigação já aconteceu**. O que não pode acontecer é o @sm
> escrever uma story bloqueada por um defeito que morreu.

**Veredito: F-7 sai da tabela §5 (vira nota histórica) e `W0-0` deixa de ser BLOQUEANTE do Epic 88.**
Justificativas:

- Nenhum item do Epic 88 tem AC de prompt. O próprio epic diz, em §3, que a descrição da tool **vive
  em código** justamente para o painel não sobrescrever.
- Os 4 slugs que ainda divergem do código não instruem nada sobre confirmar visita (verificado:
  `agendei` = false em todos; `confirmad` só em `guardrails` e no `visit-scheduling` já reconciliado).
- A 87-0 já está com AC6/AC7 satisfeitas em produção, mesmo com a story em `Ready`.

**Onde o `W0-0` volta a valer:** na **Onda 3**. Quando a tool entrar em enforce, o prompt precisa
dizer *"a ÚNICA forma de marcar visita é chamar a tool"* — e sob a decisão **D-87-0-a (o painel é
a fonte da verdade)**, esse texto tem de ir para o **banco**, não para `packages/ai/src/prompts/`.
Ou seja: a dependência é **`W0-0` antes do 88-9**, não antes do 88-1.

> ⚠️ **Correção derivada, e o @sm precisa dela:** a nota §13 do Epic 88 diz *"Mudança de prompt
> precisa de AC dupla (código **e** `agent_prompts`)"*. Isso é a orientação do Epic 87 **de antes**
> da decisão do Gabriel. Sob D-87-0-a, o banco **é** a fonte e o código é fallback de bootstrap
> declarado. A regra correta hoje é: **a AC de prompt se verifica no banco; o código só entra como
> fallback e não pode contradizê-lo.** Manter "AC dupla" faz o @dev editar dois lugares e achar que
> os dois valem — que é a doença que a 87-0 curou.

### `W1-2b` — **defensivo. Recomendo rebaixar para "antes da Onda 3".**

O argumento do epic (F-2) é: `tool_choice` forçado sobre gate envenenado fabrica argumento. Mas o
próprio epic define o gatilho como uma **conjunção**:

> gate de agendamento aberto **E** a mensagem do lead **neste turno** contém expressão temporal

Apliquei isso ao caso Sandra: a mensagem dela em 05/08 era *"Tenho interesse no VIND Residence"* —
**sem expressão temporal**. O forçamento **não dispararia**. O estado envenenado abre o gate
(primeira condição), mas a segunda condição é turn-local por construção e o neutraliza. Somada à
citação validada (a Nicole não consegue citar a Sandra dizendo "sábado" — ela nunca disse), são
duas barreiras independentes contra o modo de falha.

Além disso, **nas Ondas 0, 1 e 2 nada é forçado contra um lead real**: a Onda 2 roda em shadow,
depois do envio da resposta. O `tool_choice` forçado só toca um lead de verdade no **88-9**.

**Veredito: `W1-2b` bloqueia o 88-9, não o epic.** Manter como bloqueante do epic inteiro custa
~2 semanas de calendário para prevenir um risco que só existe na última onda — e que já tem duas
mitigações estruturais.

### Uma dependência que o epic **não** declara e deveria (habilitante, não bloqueante)

Medi o turno percebido em produção: `whatsapp_async_done.ms_async`, 14 dias, **n=442**,
**p50 = 7.435 ms, p95 = 12.469 ms, máx = 26.037 ms**.

O p95 percebido **já é 12,5 s**. Parte disso é o MemPalace morto (1 Haiku + N embeddings + 3 a 9
round-trips falhos por turno, medido pelo @architect §4). A condição 7 dele — desligar o MemPalace
por flag na Onda 0 do Epic 87 — **libera a folga de latência que este epic vai gastar**. Não é
bloqueante, mas é a diferença entre caber e não caber no teto do D88-3. Registrar em §8 como
dependência habilitante.

---

## 4. `consultar_agenda` fora da v1 — **concordo, com uma ressalva medida**

O corte está certo. O pré-fetch determinístico calcula os horários livres com latência zero e
trocar isso por uma decisão do modelo é regressão — o @architect tem razão e o @analyst não
apresentou caso que justifique o inverso.

**Mas o epic não pode declarar que o lado da leitura está são.** Na conversa da Valnira, 03/08 23:57:

| Quem | Mensagem |
|---|---|
| Valnira | **"Semana de manhã"** |
| Nicole | "Tenho horários disponíveis na semana de manhã. Qual desses funciona melhor pra você? - **Sábado, 8 de agosto às 08:00** - **Sábado, 8 de agosto às 08:30** - **Sábado, 8 de agosto às 09:00**" |

O lead pediu **dia de semana** e o pré-fetch devolveu **três sábados**. Isso não veio do modelo —
veio de `freeSlotsInPeriod`. É defeito **determinístico**, do lado que este epic decide preservar
intocado.

**Correção:** manter `consultar_agenda` fora da v1 (a tool não conserta isso — a tool leria a mesma
função errada), **e** registrar em §9 que o corte não é um atestado de saúde do pré-fetch:
`freeSlotsInPeriod` ignorando "semana × fim de semana" é defeito conhecido, com evidência (Valnira,
03/08 23:57), **item de backlog próprio**. Sem esse registro, alguém vai ler "o pré-fetch já calcula
com latência zero" como "está certo" — e é a mesma armadilha do "zero eventos = está tudo bem".

---

## 5. As métricas aprovam ou reprovam de verdade? — **PM2 está errada de duas formas**

### 5.1 O baseline não é 50%. É 31%. E o epic se contradiz sozinho.

§1 diz *"Cerca de 1 em cada 3"*. §7/PM2 diz *"Baseline ≈ 50% (6 de ~12)"*. **Os dois não podem
estar certos.** A conta do "6 de ~12" mistura populações: o **6** é `appointments created_by =
'nicole'` no total do projeto (inclui a Josiete, que não é fala de confirmação de dia+hora), e o
**~12** é a contagem de leads **sem** appointment do filtro largo da 75-279 — ou seja, um
**numerador de sucessos** sobre um **denominador de falhas**. Se os dois fossem da mesma população,
a conta seria 6/(6+12) = 33%.

Medi diretamente. Universo: toda fala `assistant` de 10/06 a 06/08 que **afirma uma visita marcada**
(excluí "Anotado!" sobre preferência e o compromisso de ligação da Silvana). **16 falas, 11 leads.**

| Definição | Resultado |
|---|---|
| **Correta** — existe `appointment` em ±30 min do horário afirmado, criado **antes ou no mesmo turno** da fala | **5 / 16 = 31%** (por lead: 3,5 / 11 ≈ 32%) |
| **Como PM2 está escrita** — existe `appointment` em ±30 min, sem restrição de autor nem de momento | **13 / 16 = 81%** |

### 5.2 O defeito mais grave: PM2, como escrita, conta o conserto humano como sucesso

Sueli, Valnira e Maria Oliveira — **os três incidentes** — têm `appointment` no horário certo. Todos
foram criados **por um humano, horas depois**, depois que alguém leu a conversa:

```
Sueli    broker  slot 07/08 14:00  criado 04/08 09:55   (fala foi 03/08 21:53)
Valnira  admin   slot 06/08 10:00  criado 04/08 11:21   (fala foi 03/08 21:09)
Maria    admin   slot 08/08 11:00  criado 06/08 09:22   (fala foi 06/08 07:04)
```

**Pela redação atual da PM2, os três contam como "com lastro".** A métrica desenhada para provar que
o epic funcionou marcaria como sucesso exatamente os casos que motivaram o epic — e a linha de base
sairia em 81%, deixando "≥95%" a três casos de distância, alcançável sem escrever uma linha de
código.

**Correção obrigatória da PM2:**

> **PM2 — Lastro da confirmação.** Numerador: falas em que existe `appointment` do lead com
> `scheduled_at` em ±30 min do horário afirmado **e** `created_at ≤ fala + 2 min` (o INSERT é o
> mesmo evento da fala, não a limpeza posterior). Denominador: todas as falas que afirmam visita
> marcada. **Baseline medido: 31% (5/16, 10/06→06/08).** Alvo: **zero falas sem lastro** na janela.

### 5.3 O problema de n é pior do que o epic admite — e a saída não é percentual

O epic trata PM2 como a resposta ao n baixo da PM8. **Não é.** Medi a frequência:

- Falas de confirmação de visita: **16 em 8 semanas ≈ 2/semana**.
- Turnos totais (`CLAUDE_RESPONSE`): **119 em 7 dias, 255 em 14 dias**.
- `appointments created_by='nicole'`: **6 em 8 semanas** (último em **31/07** — 6 dias sem nenhum).

Ou seja: em 14 dias a PM2 tem **~4 observações**. Um alvo de "≥ 95%" sobre n=4 só pode dar 100% ou
75% — **percentual sobre n de um dígito é teatro**. O mesmo vale para os critérios de saída da
Onda 2 (§6.1, itens 2 e 3: "≥ 95% das divergências", "≥ 95% das chamadas").

**Correção: a estes n, alvo é contagem absoluta, não taxa.**

| Métrica | Como está | Como deve ficar |
|---|---|---|
| PM2 | "≥ 95%" | **"zero falas sem lastro"** em 14 dias (n≈4). Um 4/4 limpo contra baseline de 31% já é p<0,01 — é evidência, se dita assim |
| §6.1 item 2 | "tool certa em ≥ 95% das divergências" | **"zero divergências em que a tool errou"**, revisadas uma a uma |
| §6.1 item 3 | "citação válida em ≥ 95%" | **"zero recusas de intenção legítima"**, revisadas uma a uma |
| PM8 | já declarada não-conclusiva ✔ | manter — **mas o gatilho "0 em 14 dias com >20 turnos de agendamento" é indefinível hoje**: o denominador "turnos de agendamento" só passa a existir com o 88-3. Declarar que PM8 só liga depois da Onda 0 |

### 5.4 O que aprova de verdade

**Uma métrica está pronta e ninguém notou: a PM1 (golden set) é a única que decide antes do deploy,
e o epic já a tem certa.** Junto com ela:

- **PM3 (`NICOLE_SLOT_UNRESOLVED`)** é a métrica do pedido do Gabriel e a única com denominador
  grande (255 turnos/14 d). Manter como está — é o melhor item do §7.
- **PM4 (`NICOLE_SLOT_UNAUTHORIZED`)**: ⚠️ **conferido em produção — 0 eventos, e isso não significa
  nada.** A 75-279 foi mergeada hoje **às 10:05**; a conversa da Maria foi às **07:04**. O evento
  nunca teve oportunidade de disparar. **Antes de PM4 virar critério, é obrigatório provar que ele
  dispara** — reencenar em produção ou aceitar a primeira ocorrência real como validação do
  instrumento. É literalmente a armadilha do §4.3 do próprio epic ("EXPECTED > 0 e CALL == 0"),
  aplicada à métrica que ele elege como prova. Registrar como AC do 88-3.

### 5.5 D88-3 tem número, hoje — e ele já é um gate

O epic diz que o baseline do turno percebido sai na Onda 0. **Ele já existe:** `whatsapp_async_done`,
n=442 em 14 dias, **p95 = 12.469 ms**. Com o teto proposto (+10%) → **13.716 ms**. O round-trip
estimado pelo @analyst (+1,1 a 1,6 s) **estoura** esse teto sem a compensação do `typing-delay`
(que hoje adiciona 800–1200 ms + 25 ms/char, teto 3 s — conferido em
`packages/web/src/lib/whatsapp/typing-delay.ts`).

Isso é uma **boa** notícia: significa que o D88-3 é um gate real e não uma formalidade, e que a
frase do §6.3 ("a compensação é obrigatória e vai no mesmo item") está tecnicamente certa.
**Correção: gravar `p95 = 12.469 ms (n=442, 14 d)` como baseline declarado no 88-3**, para o teto
ser um número desde o dia 1 e não uma promessa da Onda 0.

---

## 6. O escopo cabe? — 11 itens, e dois deveriam sair

### Cortar da v1: **T2 `remarcar_visita` e T3 `cancelar_visita`**

O epic defende que elas entram junto "de propósito", porque deixá-las no caminho antigo recriaria a
divergência fala × banco em remarcação. **Medi a demanda:**

```
mensagens role='user' desde 10/06 pedindo remarcar / desmarcar / adiar /
"outro dia" / "outro horário" / "mudar" / "não vou poder"   →   0
```

**Zero, em ~8 semanas.** Não há divergência a prevenir num caminho que nunca é exercido pelo lead.
E o custo de mantê-las é concreto: **três schemas de tool no prefixo cacheável** e **dois caminhos
de escrita** a mais no PR mais arriscado do epic (88-9, risco Alto), num arquivo de 1.947 linhas.

**Recomendação:** o **executor** do 88-5 continua expondo `rescheduleVisit()` e `cancelVisit()` —
isso é barato e é o que garante a caneta única. **As tools T2/T3 saem da v1** e viram um item de
seguimento (88-12) que só liga a exposição ao modelo, com a mesma flag e o mesmo rollout, depois do
enforce de T1 estar estável. Se o argumento for "custaria uma segunda onda inteira de rollout": não
custa, porque o rollout já estará construído — é ligar duas entradas num catálogo que já existe.

### O furo de sequência do 88-6 — **precisa ser corrigido, não movido**

O 88-6 está na Onda 1 e promete *"medir o falso negativo da citação (F-4) semanas antes de ele poder
recusar um agendamento de verdade"*. **Não é executável nessa posição:** `citacao_do_cliente` é um
**argumento produzido pelo modelo**, e o modelo só produz argumento na Onda 2 (88-7). Em Onda 1 não
há citação para casar.

**Correção (e ela salva a intenção, que é boa):**

- **88-6 (Onda 1) entrega o casador + o corpus retrospectivo.** `quoteMatchesLeadMessage` com
  normalização, testada contra um corpus construído das conversas reais em que o slot **foi**
  resolvido: para cada uma, a frase do lead que originou o horário tem de casar. Isso mede o falso
  negativo **sem depender do modelo** e é o que o epic realmente queria.
- **A medição em produção da taxa de casamento vai para o 88-8** (Onda 2), onde a citação existe.
- **F-4 e D88-5 passam a apontar para o 88-8**, não para o 88-6.

### O resto do escopo: mantenho

- **88-1 é o item certo no lugar certo.** Uma nuance que o @sm precisa saber: depois da 75-279 o
  `content[0]` **não** produz mais string vazia — produz `SANITIZED_EMPTY_FALLBACK`
  (`pipeline.ts:1003`). A assinatura da falha mudou e ficou **mais traiçoeira**: em vez de uma
  mensagem vazia (que a Graph API recusa e alguém percebe), o lead recebe uma fala de reserva
  plausível e as ~470 linhas a jusante processam a fala de reserva como se fosse a resposta. A AC
  do 88-1 tem de afirmar sobre **os dois**: o texto sobrevive **e** o `NICOLE_EMPTY_TEXT_RESPONSE`
  dispara.
- **88-4 (flag em `agent_config`, não em env)** — decisão correta e bem fundamentada. A memória de
  projeto corrobora a divergência de projetos Vercel (o webhook da Nicole atendido pelo
  `prj_KMm5f2`/freelans, enquanto `.vercel/project.json` deste repo aponta para `prj_s3ARh1`, hoje
  conferido). A AC "verificada por efeito" é o hedge certo. Recomendo uma pré-tarefa do @devops:
  **confirmar qual projeto serve `/api/webhook/whatsapp` hoje**, antes do 88-10.
- **88-9 removendo o ramo do parser no mesmo PR** — condição do @architect, aceita, e é o único
  jeito de o rollback ser atômico. Não negociar.

### v1 mínimo defensável

```
Onda 0: 88-1 · 88-2 · 88-3 · 88-4          (nenhuma resposta muda)
Onda 1: 88-5 (executor único, fail-closed) · 88-6 (casador + corpus)
Onda 2: 88-7 (T1 apenas, shadow) · 88-8 (comparador + citação medida)
Onda 3: 88-9 (enforce T1 + remove ramo) · 88-10 (rollout) · 88-11 (fail-closed, atrás de D88-4)
Depois: 88-12 (T2/T3)
```

Dez itens em v1, um diferido. O epic não incha — ele **quase** não incha, e o único excesso real é
T2/T3.

---

## 7. As decisões pendentes são mesmo do Gabriel? — **de 6, sobram 2**

| # | Decisão | Veredito | Encaminhamento |
|---|---|---|---|
| **D88-1** | v1 só agenda, ou já entra mídia/dados? | **Já decidida** | O Gabriel decidiu em 05/08 (D-87-0-b): *"informações dos empreendimentos precisa vir da tool empreendimentos, onde temos várias informações cadastradas"* — e a 87-0 esclareceu que isso significa a **injeção determinística** (`buildPropertyDataContext`), que **já roda a cada turno**. Logo T5 é redundante por decisão do próprio stakeholder. **Fechar como (a), citando D-87-0-b.** |
| **D88-2** | Visita órfã fica gravada ou volta atrás? | **Fechável com default** | A opção (b) é destrutiva e ninguém a defenderia; o corretor **já** é notificado por `APPOINTMENT_CREATED` (3 eventos, confirmado). Registrar **(a) como default aplicado**, com a nota de que o Marcos pode reverter. Não bloqueia nada |
| **D88-3** | Teto de latência, medido onde? | **Não é do Gabriel — é do @architect** | A pergunta é técnica ("qual componente mede o que o lead sente") e **já tem número**: p95 `whatsapp_async_done` = 12.469 ms. Fechar como decisão arquitetural ratificada no 88-3, e **substituir o D6 do Epic 87** (ver E-6). O que **é** do Gabriel é a consequência: "se não couber, a tool não sobe" — isso é regra do epic, não decisão pendente |
| **D88-4** | Fail-closed na classe agenda? | ✅ **Real, e é do Gabriel/Marcos** | **Mas só morde no 88-11, o último item.** Marcar "decidir até a Onda 3" — não bloqueia a redação de nenhuma story |
| **D88-5** | Citação obrigatória mesmo custando um agendamento? | **Auto-resolvida** | O próprio epic já define o mecanismo: nasce em shadow, só passa a recusar com a taxa medida. **O dado decide, não o stakeholder.** Dobrar dentro do critério de saída da Onda 2 (§6.1) e remover da lista |
| **D88-6** | Quem valida em produção, em que janela? | ✅ **Real — mas é o D7 do Epic 87** | **Duplicata.** Uma decisão, um lugar. Substituir por: *"herda `Epic 87 · D7`; o rollout de 88-10 acrescenta o requisito de janela de 24 h por degrau"*. Dois donos para a mesma decisão = zero donos |

**Resultado: 6 → 2 pendências reais (D88-4 e o D7 herdado), e nenhuma das duas bloqueia o @sm hoje.**
Isso destrava a redação imediatamente.

---

## 8. Itens de backlog que saem desta revisão

Registrar em `docs/backlog.md` — **nenhum entra no Epic 88**:

1. **🔴 Compromisso de ligação da Nicole não vira artefato.** A Nicole promete "o corretor te liga
   segunda às 9h" e **nada é gravado**. `lead_tasks` só tem `source: 'manual'` — na Silvana, um
   humano leu a conversa e criou a tarefa. Mesma classe de dano da agenda (fala sem lastro), caminho
   diferente. Evidência: Silvana 24/07 23:41 → `lead_tasks` criada à mão 25/07 09:54.
2. **🟡 `freeSlotsInPeriod` ignora "semana × fim de semana".** Lead pede "semana de manhã", o
   pré-fetch oferece três sábados. Evidência: Valnira, 03/08 23:57. Defeito determinístico, do lado
   que o Epic 88 preserva.
3. **🟡 `detectSlotMismatch` falhou com slot autorizado, não só sem.** Ailton, 30/07 22:17: slot
   autorizado 10:00, a Nicole afirmou 9h, `NICOLE_SLOT_MISMATCH` = **0 eventos em toda a história do
   `system_events`**. A guarda não é só cega quando `authorizedSlotUtc` é null — ela não disparou num
   caso em que não era. Isso é insumo direto do `W2-3` do Epic 87.
4. **🟢 Célia (28/06) nunca foi remediada.** Lead acredita ter visitado/agendado; zero appointments;
   40 dias. Decisão comercial, não técnica.

---

## 9. Checklist de prontidão de epic

| # | Critério | Status | Nota |
|---|---|---|---|
| 1 | Problema declarado com evidência | **PASS** | Pedido literal do Gabriel + incidentes + linha de código. O melhor documento que este tema já recebeu, junto com o 87 |
| 2 | Decisão central defendida contra a objeção mais forte | **PASS** | A arbitragem @architect × @analyst é honesta e a fronteira leitura/escrita é a formulação certa |
| 3 | Evidência **verificada contra produção de hoje** | **CONCERN** | Silvana, F-7 e o baseline da PM2 vieram herdados. É o mesmo padrão da 87-0 |
| 4 | Escopo IN/OUT com motivo | **PASS** | §9 faz trabalho de verdade. Único excesso: T2/T3 |
| 5 | Dependências mapeadas e reais | **CONCERN** | Duas bloqueantes, uma morta (F-7/W0-0) e uma defensiva (W1-2b). Falta a habilitante (MemPalace/latência) |
| 6 | Coerência com o epic irmão | **FAIL** | O Epic 87 não foi editado; seu texto proíbe o Epic 88 por escrito. 9 edições listadas em §2 |
| 7 | Métricas aprovam ou reprovam de verdade | **CONCERN** | PM1/PM3 sim. PM2 conta o conserto humano como sucesso e tem baseline errado. Alvos percentuais sobre n de um dígito |
| 8 | Riscos novos nomeados | **PASS** | 8 modos de falha, com F-1 corretamente elevado a primeiro item. Raro e correto |
| 9 | Rollback explícito e verificável | **PASS** | Flag em banco + revert atômico do 88-9 + gatilhos escritos antes. Melhor que qualquer epic anterior deste projeto |
| 10 | Sequência executável | **CONCERN** | 88-6 não pode medir o que promete na posição em que está |

**Score: 8 / 10** · **Veredito: GO com ressalvas.**

---

## 10. Correções obrigatórias antes de o @sm redigir

> São 7. Nenhuma redesenha o epic — todas corrigem afirmação ou sequência. Estimo **1 h** de edição.

| # | Onde | O quê |
|---|---|---|
| **C1** | §1 (tabela de incidentes) e §2.4 | **Remover a Silvana** dos incidentes de agenda (era ligação, e a ligação aconteceu — `lead_tasks` concluída 27/07 09:39) e **trocar a tabela de 14 dias pela de 8 semanas**, com Célia, Helena, Miriam e o mismatch do Ailton. O placar vira **6 de 7**, medido |
| **C2** | §2.1 | Reescrever "o contexto estava certo" como **"o contexto estava correto sobre a AUTORIZAÇÃO e errado sobre a INTENÇÃO do cliente"**. A frase atual é atacável; a corrigida não é |
| **C3** | §5 (F-7) e §8 (`depends_on`) | **F-7 vira nota histórica** (medido morto: `visit-scheduling` reconciliado 05/08 20:58, "stand" = 0 nos 7 slugs). **`W0-0` deixa de bloquear o epic e passa a bloquear o 88-9.** Corrigir a §13: sob D-87-0-a a AC de prompt se verifica **no banco**, não "AC dupla" |
| **C4** | §8 (`W1-2b`) | Rebaixar de "bloqueante do epic" para **"bloqueante do 88-9"**, com o racional escrito: o gatilho é conjunção turn-local e nada é forçado contra lead real antes da Onda 3. Acrescentar o **MemPalace como dependência habilitante** (latência) |
| **C5** | §7 (PM2) e §6.1 (critérios de saída) | **PM2:** exigir `created_by='nicole'` **e** `created_at ≤ fala + 2 min`; **baseline 31% (5/16)**, não 50%. **Alvos percentuais sobre n<10 viram contagem absoluta** (PM2, §6.1 itens 2 e 3). **PM4:** AC no 88-3 provando que `NICOLE_SLOT_UNAUTHORIZED` dispara antes de ser critério. **D88-3:** gravar `p95 = 12.469 ms (n=442)` como baseline declarado |
| **C6** | §3, §6.1 (Onda 1 e 2) | **T2/T3 saem da v1** → item 88-12 (o executor do 88-5 continua expondo as funções). **88-6 entrega casador + corpus retrospectivo**; a medição em produção da citação vai para o 88-8; F-4 e D88-5 repontam para o 88-8 |
| **C7** | §11 | **6 decisões → 2.** D88-1 fechada por D-87-0-b · D88-2 default (a) aplicado · D88-3 vira decisão do @architect com número · D88-5 dobrada no critério de saída da Onda 2 · D88-6 vira ponteiro para `Epic 87 · D7`. Sobram **D88-4** (decidir até a Onda 3) e o **D7 herdado** |

**Além disso, e é pré-requisito de backlog, não do epic:** as **9 edições no Epic 87** listadas em
§2. Sem elas há dois documentos ativos com tetos de latência contraditórios, uma métrica com dois
nomes, uma decisão (D3) aberta e já respondida, e um gate que proíbe por escrito o epic que
acabamos de aprovar.

---

## 11. Notas para o @sm

- **88-1 é a story que menos parece urgente e mais é** — o epic já diz isso e está certo. Mas
  atualize a evidência: pós-75-279, `content[0]` não vira `""`, vira `SANITIZED_EMPTY_FALLBACK`
  (`pipeline.ts:993-1003`). A falha ficou **mais** silenciosa, não menos. AC dupla: o texto
  sobrevive **e** o evento dispara.
- **Todo teste deste epic fica vermelho antes.** Regra da casa e a 75-279 a praticou (reverteu o
  parser, 3 de 5 casos falharam). Um harness que passa pelo motivo errado é pior que nenhum.
- **Nenhuma AC pode ser "existe no painel/no env".** Efeito verificado em produção. A flag do 88-4
  já falhou nesta casa duas vezes por isso.
- **Antes do 88-10, o @devops confirma qual projeto Vercel serve `/api/webhook/whatsapp`.** Hoje o
  `.vercel/project.json` deste repo aponta para `prj_s3ARh1` (trifold) e há registro de que o
  webhook da Nicole é atendido pelo `prj_KMm5f2` (freelans). Rollout progressivo no projeto errado é
  rollout que não acontece.
- **O golden set do 88-2 tem seis casos, não cinco:** `"As 11hrs"` (Maria), `"Umas 14"` (Sueli),
  `"Na quinta as 10"` (Valnira), `"As 9"` (**Célia**, 28/06 — o caso mais limpo e o mais antigo),
  `"Sexta a tarde"` (Sueli) e a cadeia 27/07→05/08 da Sandra atravessando duas sessões. `"As 9hs"`
  da Silvana continua sendo um caso válido **do parser**, mas como teste de **ligação**, não de
  visita — não misture os dois na mesma fixture.
- **`stories_planned` como tabela item→story**, no frontmatter, desde a primeira story. A
  identidade numérica item↔story quebrou no Epic 87 em 24 horas; não conte com ela aqui.
- **Contexto medido para as stories:** este documento (§1 e §5 têm as consultas), a validação do
  @architect §5–§6, a análise do @analyst §2 e §7, e a 75-279. **Reler antes de redigir** — e, como
  esta revisão mostra, **remedir o que for número.**

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-06 | 1.0 | Revisão de coerência do Epic 88. **GO com ressalvas, 8/10.** A decisão central (híbrido, fronteira leitura/escrita) **se sustenta** — 3 dos 4 incidentes reais de agenda são da classe do @pm, e o histórico completo eleva o placar a 6 de 7. Sete correções obrigatórias: Silvana não é incidente de agenda (auditada em `lead_tasks`), F-7 morreu em 05/08 (`agent_prompts` reconciliado, verificado no banco), PM2 tem baseline errado (31%, não 50%) e conta o conserto humano como sucesso, T2/T3 sem demanda medida (0 em 8 semanas), 88-6 não pode medir na posição em que está, `W0-0`/`W1-2b` rebaixados de bloqueantes do epic para bloqueantes do 88-9, e 6 decisões pendentes reduzidas a 2. Mais 9 edições obrigatórias no Epic 87, cujo texto atual proíbe o Epic 88 por escrito. | @po (Pax) |
