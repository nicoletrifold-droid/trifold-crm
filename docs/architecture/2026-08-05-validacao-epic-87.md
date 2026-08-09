---
title: Validação arquitetural adversarial do Epic 87 — Nicole
autor: Aria (@architect)
data: 2026-08-05
tipo: Validação (não é plano, não é epic)
alvo: docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md
insumos:
  - Dossiê de incidente 05/08 (scratchpad, lido por inteiro)
  - Epic 87 v0.1 (@pm), lido por inteiro
  - docs/research/2026-08-05-nicole-anti-alucinacao/analise-tecnica.md — **NÃO EXISTE**
    (o diretório existe e está vazio; validei sem ele)
metodo: código real + banco de produção `dsopqkqjkmhytudaaolv` via Management API + execução
  das funções de guarda contra as strings reais dos incidentes
veredito_global: REPROVADO NA ORDEM PROPOSTA — aprovado no conteúdo, com um item novo bloqueante
---

# Validação adversarial — Epic 87

## 0. A resposta curta à pergunta do Gabriel

> *"O que no Epic 87 faz dele algo diferente do quarto remendo?"*

**Hoje, na forma escrita: quase nada — porque o Epic 87 herdou do dossiê um diagnóstico que
está errado no caso principal, e porque ele não sabe que os prompts que rodam em produção
não são os prompts do código.**

Reproduzi o incidente da Sandra contra o código de `main` **de agora** (pós-75-245, pós-75-268,
pós-75-270). O resultado está na seção 6.1. Resumo:

1. Em **27/07 15:47**, a própria Nicole escreveu: *"Que tal agendar uma visita… Você prefere
   durante a semana ou no **sábado** de manhã?"*
2. `extractCollectedData(assistantMessage, …)` viu a palavra "sábado" **na fala dela** e gravou
   `visit_availability` = a mensagem inteira dela. A guarda `isAmbiguousSlotText` da Story 75-245
   **não pega essa frase** — verifiquei executando a função: retorna `false`.
3. Em **05/08 14:55**, com a Sandra mandando apenas *"Tenho interesse no VIND Residence"*,
   `resolveVisitSlotParts` releu aquela string de 9 dias atrás, **reancorou "sábado" na data de
   hoje** e devolveu `2026-08-08`. O pipeline gravou `visit_pending_date = 2026-08-08` e injetou
   no prompt: `[SISTEMA: O cliente indicou o dia (sábado, 8 de agosto) mas não o horário…]`.
4. A Nicole respondeu **"Sábado, dia 8, está anotado."**

Ela não alucinou. **O sistema afirmou a ela que a cliente tinha indicado sábado dia 8, e ela
obedeceu.** É o oposto do problema que o Epic 87 se propõe a resolver com tools e enforcement
pós-resposta.

E a frase de 27/07 que envenenou o estado é, **literalmente, o exemplo escrito no prompt
`visit-scheduling` que está no banco de produção** — uma versão que não corresponde a nenhum
commit do repositório e que não contém as três etapas de sondagem que o código tem desde
`7d4246e9`.

Portanto, a resposta ao "11 minutos depois do deploy": **o deploy das 11:44 não podia ter
efeito, porque o gatilho já estava gravado em `conversation_state` desde 27/07, e porque metade
do que as stories corrigiram vive num arquivo que a produção não lê.**

O Epic 87 fica diferente do quarto remendo **se e somente se** absorver os dois fatos acima.
Do jeito que está, ele gasta o primeiro e mais observado deploy (W1-1) na causa que **não**
produziu o incidente principal, e coloca em 15º lugar (W2-4) o item que torna qualquer AC de
prompt verificável.

---

## 1. Veredito por onda

| Onda | Veredito | Motivo em uma linha |
|------|----------|---------------------|
| **Onda 0** | **APROVADO COM RESSALVA** | Conteúdo certo, escopo incompleto: falta o item que é pré-requisito de tudo (paridade de prompts) e o kill switch aponta para o projeto Vercel errado |
| **Onda 1** | **REPROVADO (na ordem)** | Ordem invertida em relação à causalidade provada; W1-1 viola a própria regra de corte da onda; falta a âncora temporal |
| **Onda 2** | **APROVADO** | É a onda mais bem desenhada do epic — com duas correções de especificação em W2-1 e W2-3 |
| **Onda 3** | **APROVADO COM RESSALVA** | A premissa do W3-1 está mal formulada; a fonte da verdade precisa ser `appointments`, nunca o bloco `[SISTEMA]` |
| **Onda 4** | **REPROVADO em W4-1** · APROVADO no resto | Tool de agenda é o lever errado para este modo de falha, e não é aditivo como o epic supõe |

---

### 1.1 Onda 0 — APROVADO COM RESSALVA

O que está certo: W0-1 (corrigir a documentação), W0-2 (instrumentar as falhas silenciosas) e
W0-3 (baseline) são exatamente o que se faz antes de mexer. W0-2 em particular está bem
escopado — os quatro pontos de `return ""` citados são os certos.

**Ressalva 1 — falta um item, e ele é bloqueante.**
`W2-4` (paridade `agent_prompts` × código) **precisa sair da Onda 2 e virar `W0-0`, blocking**.
O próprio epic diz que R-D é severidade **Alta** e que W2-4 é "pré-requisito de qualquer
guardrail novo valer alguma coisa" — e então o agenda para depois de uma onda inteira de
mudança de comportamento. É uma contradição interna. Os números da seção 6 provam que não é
teórica: **os 5 slugs sobrescrevíveis divergem do código em produção, agora**, e um deles é
causa direta do incidente da Sandra.

**Ressalva 2 — W0-4 (kill switch) vai ser gravado no projeto errado.**
`/Users/ogabrielhr/trifold-crm/.vercel/project.json` aponta para
`prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj` (`trifold-crm`). O webhook da Nicole roda em
`prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c` (freelans). Qualquer `vercel env` ou
`scripts/vercel-env-set.sh` disparado da raiz deste repositório escreve no projeto que **não**
atende a Nicole. Somando isso ao gotcha já documentado (`vercel env add` via pipe grava vazio),
a chance de o kill switch existir no painel e não funcionar no incidente é alta.
**Correção cirúrgica:** a AC do W0-4 deve incluir *verificação de efeito*, não de existência —
ler a flag por um endpoint de diagnóstico do deploy de produção e provar que ela chega ao
`processMessage`. "Existe no painel" já falhou duas vezes neste projeto.

**Ressalva 3 — M10 não é mensurável e o baseline vai provar isso.**
Medido agora em `appointments`: `created_by='nicole'` = **6 no total do projeto, 3 em 30 dias,
1 em 7 dias**. Contra `broker` = 43 e `admin` = 11. Um alvo do tipo "a taxa de visitas agendadas
pela Nicole não pode cair" tem denominador **1 por semana**: nenhuma regressão de até ~70% seria
detectável em 14 dias. Se M10 é a defesa contra "resolver alucinação matando o paciente" — e o
epic diz corretamente que ela é tão importante quanto M1 — ela precisa de um proxy com volume:
sugiro **taxa de resposta do lead ao turno seguinte** e **`HANDOFF_TRIGGERED` por conversa**
(112 turnos/7d dão base estatística; 1 appointment/semana não dá).

**Ressalva 4 — M1 com o volume atual é evidência fraca.**
`CLAUDE_RESPONSE` = 112 em 7 dias, 261 em 14 dias. "Zero em 14 dias" sobre ~250 turnos, com
incidentes historicamente na casa de poucos por semana, é compatível com uma redução de 60% e
também com uma redução de 100%. O critério precisa vir com o intervalo: ou se estende a janela,
ou se aceita que M1=0 em 14 dias é **necessário e não suficiente**.

---

### 1.2 Onda 1 — REPROVADO na ordem proposta

O conteúdo dos itens está certo. A **ordem** está invertida em relação à causalidade que
consegui provar, e há um item faltando.

**Problema A — W1-1 (histórico) não é a causa do incidente principal, e o epic o coloca como
deploy 1.**

O dossiê afirma que a Sandra recebeu *"seu orçamento de R$ 400 mil"* porque o histórico
invertido fez a Nicole ler 27/07 como presente. **Contei as mensagens no banco:** no momento da
resposta (05/08 14:55), a conversa da Sandra tinha **14 mensagens `user`/`assistant`**. O
`limit(20)` não cortou nada. Ela viu a conversa inteira, incluindo o "só posso até 400 mil".
CR-1 não teve participação nenhuma nesse incidente.

O mesmo vale para a Sueli: a conversa toda tem 22 mensagens e os dois erros ("sexta à tarde
seria após as 18h", "sexta às 14h fica fora do nosso horário… mas às 14h estamos sim
disponíveis!") aconteceram nos turnos 10–14, longe de qualquer truncamento.

CR-1 é um bug real, verificado por mim na linha 1440, e **deve** ser corrigido. Mas o alcance
medido é: **32 de 427 conversas (7,5%)** passam de 20 mensagens `user`/`assistant`. Dar a ele o
primeiro slot de deploy, com 24h de observação exclusiva, é gastar o recurso mais escasso do
epic (a janela de atenção do Marcos/Thielly) na hipótese que os dados não sustentam.

**Problema B — W1-1 viola a regra de corte da própria Onda 1.**

O epic define: *"nenhuma story da Onda 1 pode adicionar um novo caminho de decisão da Nicole"*.
W1-1 adiciona dois, silenciosamente:

```ts
// pipeline.ts:646 — o "última fala da Nicole" muda de significado com o fix
const lastAssistantMsg =
  [...history].reverse().find((m) => m.role === "assistant")?.content ?? ""
```

Hoje `history` é a **cabeça** da conversa, então `lastAssistantMsg` é uma fala antiga. Depois do
fix passa a ser a fala genuinamente anterior. Esse string alimenta **dois gates**:

- `isVisitSchedulingMode` → `NICOLE_TALKED_VISIT_RE.test(lastAssistantMessage)` (pipeline.ts:98)
- `nameExpected` → regex de "qual seu nome" (pipeline.ts:978)

Ambos foram calibrados — inclusive na 75-268, que cita explicitamente o `lastAssistantMsg` —
num mundo onde essa variável apontava para a mensagem errada. **Corrigir o histórico muda o
comportamento de duas guardas sem que nenhuma linha delas seja tocada.** Isso não aparece no
epic e é exatamente a classe de acoplamento que R-A tenta nomear sem conseguir.

**Problema C — o corretor humano. Risco real, medido, menor do que parece.**

`loadConversationHistory` filtra `.in("role", ["user","assistant"])`. Existe um terceiro papel:
**`broker`, com 812 mensagens em produção**, presente em **285 das 427 conversas (67%)**. A
Nicole nunca viu nenhuma delas — nem antes nem depois do fix.

O risco que isso cria com a cauda: numa conversa em que o corretor assumiu, a cauda-20 passa a
ser uma sequência de mensagens do lead **respondendo ao corretor**, sem as respostas dele. A
Nicole vê perguntas aparentemente não respondidas e responde a todas, por cima do humano.

**Quantifiquei antes de alarmar:** conversas com mensagem de corretor **e** `is_ai_active=true`
= **16**. Dessas, longas o bastante para a janela importar = **2**. Conversas em que o lead
falou depois do corretor com a Nicole ainda ativa = **4**. É um risco real e **contido**, porque
o handoff normalmente desliga `is_ai_active`. Não é motivo para bloquear W1-1 — é motivo para a
story declarar a decisão explicitamente, que hoje ela não declara:

> **Decisão que falta na W1-1:** ao passar a ver a cauda, a Nicole deve (a) continuar cega ao
> corretor — e então o filtro de papel precisa de um teste que fixe isso como intenção, não
> acidente; ou (b) passar a ver as falas do corretor como contexto marcado
> (`[CORRETOR]: …`), o que é uma mudança de comportamento e **não pertence à Onda 1**.
> Recomendo **(a) agora, com teste**, e (b) como item de Onda 3 com validador.

**Problema D — falta um item: âncora temporal.**

W1-2b está descrito como "estado de agenda expira e não nasce da fala da Nicole". As duas metades
são necessárias mas o epic não nomeia o defeito que as une:

> **Expressões temporais relativas são gravadas sem âncora e reavaliadas contra o `now` de
> qualquer turno futuro.**

Rodei a prova (seção 6.1): a mesma string gravada em 27/07 resolve para **08/08** se lida em
05/08, e para **15/08** se lida em 12/08. É um relógio que sempre aponta para "o próximo sábado",
para sempre. TTL mitiga; **âncora resolve**. Proposta cirúrgica: `visit_availability` deixa de
ser texto livre e passa a ser `{ raw, anchored_date, anchored_at, source: 'lead'|'system' }`.
`resolveVisitSlotParts` nunca reancora — usa `anchored_date` ou não usa nada. Isso também
elimina, de graça, a classe de bug em que o lead diz "sábado" na segunda e é atendido na quinta.

**Ordem corrigida que eu assino:**

```
W0-0 (paridade de prompts + snapshot versionado)  ← BLOQUEANTE, hoje
W1-2a (purge do estado fantasma, SQL, hoje)
W1-2b (estado: sem derivação da fala da Nicole + âncora + TTL)   ← deploy 1
W1-3a / W1-3b (resumo)                                            ← deploy 2
W1-1 (histórico, com a decisão sobre o corretor escrita)          ← deploy 3
W1-4, W1-5 em paralelo (não competem)
```

Racional: W1-2b é a causa provada do incidente vivo; é o único deploy da Onda 1 cujo efeito
podemos verificar contra um caso real e reproduzível **antes** de subir. W1-1 vai por último não
por ser menos importante, mas porque é o único cujo raio de impacto é desconhecido — e ele deve
ser o deploy que ninguém está apagando incêndio quando sobe.

---

### 1.3 Onda 2 — APROVADO (com duas correções de especificação)

É a melhor onda do epic. W2-1 é corretamente identificada como "a story mais importante e a que
menos parece urgente". Concordo integralmente com a proibição de começar Ondas 3 e 4 antes dela.

**Correção de especificação em W2-1 — a mais importante deste documento.**

O harness, como descrito, afirma sobre *efeitos colaterais*: INSERT em `appointments`, mutação de
`collected_data`, mídia, resumo. Está certo, e é insuficiente.

No incidente da Sandra, **o modelo se comportou corretamente**. Um harness que reencene o turno
e afirme sobre a resposta da Nicole teria passado, porque a resposta é fiel ao contexto que
recebeu. O defeito estava **no contexto injetado**.

> **O harness precisa afirmar sobre o `system`/`messages` que ENTRAM no modelo, não só sobre o
> que sai.** Concretamente: capturar o array passado a `anthropic.messages.create` e ter
> asserções sobre o bloco `[SISTEMA: …]` — que ele não afirme dia/hora sem lastro em
> `appointments`, que ele não derive de `collected_data` mais velho que N horas.

Sem isso, a Onda 2 constrói uma rede com o mesmo ponto cego que produziu quatro reincidências:
todo mundo assumindo que quem mentiu foi o modelo.

**Correção de especificação em W2-3.**
`detectSlotMismatch` compara contra `authorizedSlotUtc` — que é *o que o próprio pipeline
decidiu neste turno*. No caso da Sandra o pipeline decidiu errado; comparar a fala contra a
decisão errada dá "consistente". Ampliar a guarda para rodar com `authorizedSlotUtc = null`
resolve metade. A outra metade é trocar a régua:

> **A fonte da verdade da guarda é a tabela `appointments`, nunca o bloco `[SISTEMA]` nem
> `collected_data`.** "A Nicole afirmou dia+hora" × "existe appointment do lead em ±30min" —
> essa é a comparação que teria pegado Sandra, Sueli e Valnira.

**Nota sobre R-F / D5 (CI):** confirmado. `.github/` existe com 11 arquivos de agente e
**nenhum workflow**. "Invariante testado em CI" hoje é ficção. Concordo com a recomendação (a) do
epic. Acrescento que a CI mínima deve incluir **um job que faz diff de `agent_prompts` contra o
snapshot versionado** — é o único jeito de a paridade não voltar a apodrecer em 4 meses.

---

### 1.4 Onda 3 — APROVADO COM RESSALVA

A ideia de validador pós-resposta em shadow mode, regra a regra, com FP medido antes de ligar
fail-closed, está certa e é bem calibrada. W3-2b em particular tem uma leitura de produto
correta (o pivô da Orlice foi bom; o que faltou foi consentimento).

**Ressalva — a premissa do W3-1 está mal formulada.**

O epic descreve W3-1 como algo que *"dá ao sistema como distinguir 'o sistema me disse' de 'eu
completei a frase'"*. Essa distinção **já existe**: é o bloco `[SISTEMA: …]`, e a Nicole o
respeita. O modo de falha real é o terceiro, que o epic não nomeia:

> **"o sistema me disse, e o sistema estava errado".**

Um "bloco de fatos autorizados tipado" que seja alimentado por `collected_data` reproduz o bug
com tipos. A story precisa fixar a procedência:

| Fato | Fonte única admissível |
|------|------------------------|
| Dia/hora de visita | `appointments` |
| Orçamento do lead | mensagem **do lead** (`role='user'`), com citação |
| Empreendimento de interesse | mensagem do lead, ou `leads.property_interest_id` gravado a partir dela |
| Preço, endereço, metragem, entrega | `properties` / `knowledge_base` |

`collected_data` e `ai_summary` são **cache derivado**, nunca fonte. Se isso não estiver escrito
na W3-1, o validador vai validar a resposta contra a mentira.

---

### 1.5 Onda 4 — REPROVADO em W4-1 · aprovado no resto

Ver seção 5 (tool use) e seção 4 (MemPalace). W4-2 e W4-3 são razoáveis. W4-4 concordo com o
destino, discordo do prazo.

---

## 2. Análise de suficiência — CR-1 a CR-6

| CR | Item do roadmap | Resolve de fato? | Veredito |
|----|-----------------|------------------|----------|
| **CR-1** histórico invertido | W1-1 | **Resolve o bug. Não resolve nenhum dos 4 incidentes.** E expõe dois gates acoplados (`lastAssistantMsg`) | **Suficiente para o bug, mal posicionado no epic** |
| **CR-2** MemPalace morto | W0-2 + W4-4 | Instrumentar torna ruidoso. Mas o custo ativo (seção 4) não é endereçado por 4 semanas | **Insuficiente no prazo** |
| **CR-3** resumo contamina | W1-3a + W1-3b | Sim, se adotada a opção (i) do epic. O resumo da Sandra é **consequência**, não causa — ela nunca agendou e o resumo copiou a fala | **Suficiente** |
| **CR-4** estado ressuscita | W1-2a + W1-2b | Sim **se** incluir a âncora temporal. Só TTL mitiga; só "não extrair da fala dela" resolve o caso Sandra | **Suficiente com o item novo (âncora)** |
| **CR-5** guarda cega | W2-3 + W3-2c | Só se a régua virar `appointments`. Com `authorizedSlotUtc` como referência ela continua cega no caso real | **Insuficiente como escrito** |
| **CR-6** troca de empreendimento | W3-2b | Sim, e a calibragem proposta é boa | **Suficiente** |

### 2.1 A pergunta direta: o fix do histórico resolve CR-1 completamente, ou expõe algo mascarado?

**Expõe três coisas.**

1. **`lastAssistantMsg` muda de referente** (detalhado em 1.2/Problema B). Dois gates mudam de
   comportamento sem uma linha alterada. Este é o item que o @pm não viu e é o mais provável de
   gerar o "comportamento inesperado" do R-A.

2. **A janela deixa de ser o amortecedor do estado envenenado.** Hoje, num reengajamento, a
   Nicole lê o começo da conversa — onde ninguém falou de agenda. Depois do fix ela lê a cauda,
   onde está a última fala dela sobre visita. `isVisitSchedulingMode` fica **mais** propenso a
   ligar, não menos. Se W1-1 subir **antes** de W1-2b, o incidente da Sandra fica mais provável,
   não menos. É o argumento mais forte para inverter a ordem.

3. **O corretor**. Quantificado em 1.2/Problema C: 16 conversas expostas, 2 relevantes. Real,
   contido, e precisa virar decisão escrita.

### 2.2 O orçamento devolvido não é bug de contexto

*"…dentro do seu orçamento de R$ 400 mil"* é uma afirmação **correta**: a Sandra disse isso em
27/07 e estava na janela. O incômodo do Gabriel é legítimo mas é **produto/tom**, não
confiabilidade. Está bem alocado em W3-2a. Vale registrar na story para não virar caça a um bug
que não existe.

---

## 3. Riscos de ordem e acoplamento

| # | Dependência oculta | Consequência | Correção |
|---|--------------------|--------------|----------|
| **O-1** | W1-1 muda `lastAssistantMsg` → `isVisitSchedulingMode` + `nameExpected` | W1-1 é mudança de comportamento disfarçada de fix de 1 linha; viola a regra de corte da Onda 1 | Story W1-1 precisa de AC sobre os dois gates e teste que fixe o referente |
| **O-2** | W1-1 antes de W1-2b | Cauda aproxima a fala de visita → modo agendamento liga mais → **piora o sintoma da Sandra durante a janela de observação** | Inverter: W1-2b primeiro |
| **O-3** | W1-3b (resumo) depende de W1-2b em prod, mas o resumo alimenta o contexto que gera a fala que envenena o estado | Loop bidirecional: enquanto o resumo disser "agendou sábado", ele reinjeta o fato mesmo com o estado limpo | W1-2a e W1-3a (os dois purges SQL) precisam sair **juntos**, no mesmo dia. Purgar estado e deixar resumo é meio caminho |
| **O-4** | Toda AC de prompt das Ondas 1/3 assume que o prompt do código é o que roda | Falso hoje nos 5 slugs. Qualquer AC de prompt é inverificável antes da paridade | W2-4 → W0-0, bloqueante |
| **O-5** | W2-3 (shadow) mede FP contra `authorizedSlotUtc` | O denominador de M6 sai errado; FP<5% medido contra a régua errada autoriza um fail-closed calibrado errado | Régua = `appointments` antes de começar a medir |
| **O-6** | W0-4 (kill switch) via env do Vercel, com `.vercel/project.json` apontando para o projeto errado | A válvula existe e não fecha | AC de verificação de efeito em produção |
| **O-7** | W1-2a (purge) sem W1-2b em prod | O estado é reescrito no próximo turno pela mesma extração. Purgar sem cortar a fonte é enxugar gelo | W1-2a e W1-2b precisam de janela curta entre si, ou W1-2a vira rotina até o deploy |

**O-3 e O-7 são os dois que mais me preocupam operacionalmente:** ambos criam a impressão de
"resolvido" por algumas horas e reincidem sozinhos — precisamente o padrão que queimou a
credibilidade das quatro stories anteriores.

---

## 4. D2 — MemPalace: validação da recomendação do @pm

**Concordo com o destino ((c) agora, (b) depois). Discordo do prazo, porque a premissa de custo
está errada.**

O epic trata o código morto como passivo ("código que finge funcionar"). Verifiquei: **é dívida
ativa, com custo por turno em produção.**

Confirmado no banco: `lead_facts` e `lead_memories` **não existem em nenhum schema**;
`match_lead_memory` não existe; a migration `012` consta como aplicada. Isso o dossiê já dizia.
O que o dossiê e o epic não dizem é o que o código faz com isso a cada mensagem:

**Custo de leitura.** `loadMemoryContext` (`loader.ts:186`) tem um early-return quando existe
`ai_summary`. **1.457 dos 1.674 leads (87%) não têm `ai_summary`.** Para esses, o fluxo segue:
L1 falha → L2 falha → e se a mensagem tiver `?`, `como`, `onde`, `quando`, `qual` ou `quanto`,
entra em L3, que faz:

```ts
const embedding = await generateEmbedding(query)   // loader.ts:152 → OpenAI text-embedding-3-small
const { data } = await supabase.rpc("match_lead_memory", …)  // RPC que não existe
```

**Uma chamada paga de embedding à OpenAI, sincronamente, no caminho do WhatsApp, para depois
chamar uma RPC inexistente.** Em 87% dos leads, em toda mensagem em forma de pergunta — que é a
forma da maioria das mensagens de lead ("Qual valor", "Tamanho", "Tem a localização").

**Custo de escrita.** `pipeline.ts:1332-1360` percorre os fatos extraídos e para **cada** um
faz, em série e com `await`: um `UPDATE` + um `SELECT` + um `INSERT` — todos contra
`lead_facts`, tabela que não existe. Não é uma falha, são 2–3 round-trips falhos **por fato**,
sequenciais, dentro do turno.

Contexto de latência medido: a chamada do Claude tem **p50 2.950ms / p95 5.756ms**, e o
`whatsapp_async_done` observado nos turnos da Sandra ficou entre **8,3s e 12,1s**. A diferença
entre a chamada do modelo e o turno inteiro é justamente onde esse desperdício mora.

**Consequência para D2:** deixar como está por 4 semanas custa (a) chamadas pagas de embedding
sem nenhum consumidor, (b) latência no canal mais sensível a latência que temos, (c) ruído
permanente no `system_events` depois do W0-2 — que vai instrumentar falhas que sabemos que vão
falhar 100% das vezes, treinando todo mundo a ignorar o alerta.

**Correção cirúrgica que proponho:**

> **Antecipar o "enterrar" da opção (c) para a Onda 0**, como um item XS: um flag
> `NICOLE_MEMORY_V1_ENABLED=false` (default) que faz `loadMemoryContext` ir direto ao
> `ai_summary` e pula o bloco 12.5a de escrita. Sem apagar código, sem migration, reversível.
> Custo ~1h, remove chamada paga + 3 a 9 round-trips por turno, e deixa o W0-2 instrumentando
> só o que pode ensinar alguma coisa.
>
> O redesenho (b) fica na Onda 4 como o epic propõe. **Não reaplicar a `012`** — nisso a
> recomendação do @pm está integralmente correta e eu subscrevo: ligar 4 meses de código nunca
> exercitado, que grava "fatos" automaticamente, em cima de um incidente cuja causa é exatamente
> fato gravado sem procedência, seria o pior movimento disponível.

---

## 5. R2 — Tool use: viabilidade real

**Veredito: tool use é tecnicamente viável e é o lever errado para este problema. Defendo
grounding determinístico — que já existe, funciona, e está sendo alimentado com dado falso.**

### 5.1 O argumento decisivo não é latência, é modo de falha

Tool use conserta: *"o modelo afirma um fato que não está no contexto"*.
Os incidentes são: *"o contexto contém um fato falso e o modelo o repete fielmente"*.

No caso da Sandra, uma `get_availability(lead_id)` teria sido chamada com o mesmo
`collected_data` envenenado e devolveria a mesma coisa — ou, se consultasse `appointments`,
devolveria "nenhuma visita", e aí a Nicole ainda teria o bloco `[SISTEMA]` dizendo que a
cliente indicou sábado. **O ganho de W4-1 sobre o que já existe é próximo de zero, porque a
consulta determinística já acontece** (`evaluateSlot`, `checkSlotAvailability`,
`freeSlotsInPeriod` rodam hoje, antes da chamada, e o resultado vai no prompt).

A diferença entre o `[SISTEMA]` de hoje e uma tool não é "consultar em vez de saber" — é **quem
escolhe a pergunta**. Hoje o pipeline escolhe; com tool use o modelo escolhe. Trocar uma decisão
determinística por uma decisão do modelo **num sistema cujo problema é confiabilidade** é andar
para trás.

### 5.2 Onde exatamente entraria o loop, e por que não é aditivo

O ponto de inserção é `pipeline.ts:872`. Mas o custo real está nas duas fronteiras:

**A montante (linhas 636–869):** ~230 linhas que já decidem o slot, escrevem `authorizedSlotUtc`
e montam o `[SISTEMA]`. Com uma tool de agenda, essa lógica vira **uma segunda fonte de verdade
concorrente**. Ou ela sai (e aí W4-1 não é "atrás de flag", é substituição), ou coexiste (e aí
temos duas autoridades sobre o mesmo fato — a receita de um bug novo e pior).

**A jusante (linha 930):**

```ts
const firstBlock = response.content[0]
const assistantMessage =
  firstBlock && firstBlock.type === "text" ? firstBlock.text : ""
```

Com tool use, `content[0]` frequentemente é um bloco `tool_use`. `assistantMessage` vira `""`
**silenciosamente**, e as ~470 linhas seguintes que dependem dele degradam sem erro:
`detectSlotMismatch`, detecção de convite de visita, `resolveSendableMedia`,
`extractCollectedData(assistantMessage, …)`, `updateLeadMemory`, `saveMessages`, handoff. É a
mesma assinatura de falha do MemPalace — degradação muda. **Sem o harness da W2-1, isso vai a
produção e ninguém descobre por semanas.** Neste ponto o epic acerta em cheio ao proibir Onda 4
antes de W2-1.

### 5.3 Latência e caching — os números reais

Medido em `system_events`, 14 dias:

| Métrica | Valor |
|---------|-------|
| `CLAUDE_RESPONSE` p50 | **2.950 ms** |
| p95 | **5.756 ms** |
| máx | **20.100 ms** |
| Turno completo (`whatsapp_async_done`, amostra Sandra) | 8,3 – 12,1 s |
| `maxDuration` do webhook | 60 s |
| Cache hit | **172 de 261 turnos (66%)** |
| Input tokens não-cacheados por turno | ~1.900 |

Um loop de tool use adiciona **no mínimo uma chamada completa** ao modelo: p50 vai a ~5,9s e p95
a ~11,5s **só na parte do modelo**; o turno p95 vai para a casa dos 16–18s. Contra o
`maxDuration` de 60s não estoura — contra um lead no WhatsApp, 16s de silêncio é onde a pessoa
sai da conversa. O teto sugerido em D6 (p95 atual + 30% ≈ 7,5s) **seria violado pela primeira
tool**. Ou seja: D6 e W4-1, como escritos, são incompatíveis entre si. Isso precisa ser
resolvido no papel antes de virar discussão de code review — que é exatamente o que D6 tenta
evitar.

**Sobre o prompt caching, uma correção técnica ao enunciado da pergunta:** tool use **não
quebra** o caching de forma permanente. A ordem do prefixo cacheável da Anthropic é
`tools → system → messages`; o `cache_control` no bloco estático cobre tools+system. Mudar a
*definição* das tools invalida o cache **uma vez** (a cada deploy que altere o schema), e a
segunda chamada do loop **acerta** o cache. O custo de caching é pequeno e de partida. O custo
de latência é que é estrutural. Vale corrigir isso na story para o argumento não ficar apoiado
na perna errada.

### 5.4 O que eu faria no lugar de W4-1

Manter o grounding determinístico e consertar sua **entrada**, que é onde ele está quebrado:

1. **Procedência tipada** (é o W3-1, bem especificado — ver 1.4). Todo fato no bloco `[SISTEMA]`
   carrega origem: `appointments` | `mensagem do lead` | `properties`. Nada derivado de
   `collected_data` entra como afirmação; entra como hipótese ("*o cliente pode ter mencionado…*")
   ou não entra.
2. **`[SISTEMA]` nunca afirma intenção do lead sem citação.** Trocar
   `"O cliente indicou o dia (sábado, 8 de agosto)"` por
   `"O cliente escreveu, em 27/07: '<citação>'. Isso NÃO é um agendamento."` — custo zero,
   e teria evitado o incidente da Sandra inteiro.
3. **Tool só onde o determinismo não alcança** — e o único caso que encontrei é
   `freeSlotsInPeriod` para perguntas abertas ("quando vocês têm?"). É W4-2/W4-3 território, não
   W4-1.

Se ainda assim a decisão for fazer a tool de agenda, minha condição mínima: **W2-1 verde,
`assistantMessage` extraído por uma função que percorre `content` inteiro (não `content[0]`), e a
lógica de 636–869 removida no mesmo PR — não coexistindo.**

---

## 6. O ponto cego: `agent_prompts` em produção, agora

Este é o achado que mais muda o epic. Consultei o banco de produção hoje.

### 6.0 O que está gravado

7 linhas, todas `is_active = true`, todas da org `00000000-…-0001` (a única org com conversas):

| slug | tamanho DB | tamanho código | `updated_at` | situação |
|------|-----------|----------------|--------------|----------|
| `guardrails` | 9.070 | 9.069 | 2026-07-16 | **em paridade** (difere por 1 emoji e 2 palavras) |
| `visit-scheduling` | 3.756 | 5.105 | **2026-08-04 17:28** | **DIVERGE — causa direta do incidente** |
| `system-personality` | 2.478 | 5.468 | 2026-06-18 | **DIVERGE — 55% menor** |
| `property-presentation` | 3.952 | 5.063 | 2026-06-26 | **DIVERGE (banco mais novo em fatos)** |
| `qualification-flow` | 2.458 | 2.940 | 2026-07-10 | **DIVERGE** |
| `handoff-summary` | 1.942 | — | 2026-06-13 | carregado e **nunca consumido** |
| `off-hours` | 327 | — | 2026-06-18 | carregado e **nunca consumido** |

Duas observações estruturais antes do conteúdo:

- O dossiê diz "5 slugs sobrescrevíveis". São **7 linhas no banco**; `DbPromptOverrides`
  (`prompts/index.ts:41`) só tipa 5. `loadAgentConfig` (`pipeline.ts:1485`) grava **todas** as
  linhas no objeto, e `buildStaticSystemContent` usa 5. `handoff-summary` e `off-hours` são
  editáveis pelo painel, o admin acredita estar mudando o comportamento, e **não mudam nada**.
- `agent_config.personality_prompt` tem **12.445 caracteres** em produção, é carregado
  (`pipeline.ts:1494`) e **não é usado em lugar nenhum** do `buildSystemPrompt`. Terceira camada
  de configuração fantasma.

### 6.1 `visit-scheduling`: a prova causal

O texto em produção **não corresponde a nenhum commit do repositório**. É um fork editado à mão
no painel: manteve o corpo original de `7194d9b2` (31/03) e recebeu, coladas no fim, as seções
das Stories 75-245 e 75-268. O que o código tem e a produção **não** tem:

| No código (`main`) | Em produção |
|---|---|
| `COMO PROPOR — em TRES ETAPAS, nunca direto` (ETAPA 1: sondar interesse **antes** de perguntar dia/hora) | ausente |
| `A visita ao decorado na sede da Trifold…` | `A visita ao stand de vendas…` |
| Tratamento explícito de `[SISTEMA: FORA DO HORARIO]` e de "cliente deu só o dia" | ausente |
| — | `### COMO PROPOR: Ofereça opções de dia/horário` |
| — | `"Qual o melhor dia pra voce, durante a semana ou sabado de manha?"` |
| — | `"Perfeito, [nome]! Agendei sua visita para [dia] as [horario]… O endereco do stand e [endereco do empreendimento]."` |

Três consequências, em ordem de gravidade:

**(1) A frase que envenenou o estado da Sandra é o exemplo literal do prompt de produção.**
Em 27/07 a Nicole escreveu *"Qual o melhor dia pra você, durante a semana ou sábado de manhã?"* —
a variação exata do exemplo do banco. O código proíbe isso (ETAPA 1 obriga a sondar interesse
antes de pedir dia/hora). **A produção instrui a fazer.** Executei a cadeia inteira contra o
código de hoje:

```
isAmbiguousSlotText("…durante a semana ou no sábado de manhã?")  →  false   (guarda 75-245 NÃO pega)
extractCollectedData(…)  →  visit_availability = <a mensagem inteira da Nicole>
resolveVisitSlotParts(…, now = 05/08)  →  day = 2026-08-08     ← "Sábado, dia 8"
resolveVisitSlotParts(…, now = 12/08)  →  day = 2026-08-15     ← ressuscita para sempre
```

**(2) O prompt de produção manda a Nicole afirmar "Agendei sua visita" e dar o endereço da obra.**
Isso contradiz frontalmente a seção não-sobrescrevível do próprio system prompt
(`"Todos os decorados ficam na SEDE. O endereco dos empreendimentos (obras) NAO e onde o lead
visita."`). A palavra "sede" aparece **0 vezes** nos 4 overrides; "stand", 5 vezes. Estamos
mandando ao modelo duas instruções contraditórias no mesmo system prompt, todo turno.

**(3) Um guardrail de negócio está anulado agora.** `qualification-flow` no código diz
*"A Trifold NÃO vende sem entrada. A entrada mínima é 20% do valor do imóvel"* + regras de como
falar de valores aproximados. **Em produção essa regra não existe** — o override só diz
"CRITICO para Yarden (exige sinal)". A Nicole está atendendo hoje sem a regra de entrada da
Trifold.

Para ser justo com quem editou: a divergência é **bidirecional**. `property-presentation` no
banco é **mais correta** que o código em fatos de negócio (Yarden "recém lançado em 11/2025" vs.
código "pré-lançamento Jul/2026"; entrega "abril/2027" vs. "2027"; seção inteira de
"ESCASSEZ E EXCLUSIVIDADE" que o código não tem). Não é descuido de ninguém — é a ausência de um
mecanismo. Produto edita no painel, engenharia edita no repo, e **nada reconcilia**.

### 6.2 Resposta direta: "algum guardrail do código está anulado neste momento?"

**Sim, quatro:**

1. O fluxo de 3 etapas do agendamento (não pedir dia/hora antes de confirmar interesse) —
   **anulado**, e é a origem mecânica do incidente da Sandra.
2. A canonização do endereço da sede — **anulado e invertido** (o prompt de produção manda dar o
   endereço da obra).
3. A regra de entrada mínima de 20% — **anulada**.
4. As instruções de como interpretar `[SISTEMA: FORA DO HORARIO]` e "cliente deu só o dia" —
   **ausentes** em produção. A Nicole recebe o marcador `[SISTEMA]` sem instrução de como tratar
   dois dos casos. *(Este é o candidato mais provável para o "sexta às 14h fica fora do nosso
   horário — mas às 14h estamos sim disponíveis" da Sueli: uma frase autocontraditória é a
   assinatura de um marcador recebido sem regra de leitura.)*

E as três seções do `system-personality` que o código tem e a produção não (LINGUAGEM COLOQUIAL,
ABORDAGEM COM O LEAD, IMAGENS E DOCUMENTOS RECEBIDOS) — não são guardrails de segurança, mas
explicam por que ajustes de tom "não pegam".

### 6.3 A correção cirúrgica (novo item W0-0, bloqueante)

Não é "alerta de divergência" (o que o W2-4 propõe). Alerta pressupõe que uma das duas versões é
a certa, e neste caso **as duas têm razão em partes diferentes**. O que falta é dono:

1. **Snapshot versionado.** Dump de `agent_prompts` para `packages/ai/src/prompts/_production/`
   commitado. Passa a existir um diff revisável.
2. **Reconciliação humana, uma vez.** Produto + engenharia sentam com o diff e produzem a versão
   única. Custo estimado: 2–3h. É o melhor ROI do epic inteiro.
3. **Direção única depois disso.** Ou o banco é a fonte (e o código vira fallback de bootstrap,
   com o painel obrigando a registrar a mudança), ou o código é a fonte (e o painel some). Não
   defendo qual — defendo que exista **uma**.
4. **Teste de contradição**, não só de divergência: nenhuma seção pode afirmar "stand/endereço da
   obra" enquanto a seção não-sobrescrevível afirma "sede". Isso é verificável por regex e
   pega a classe inteira.
5. **`handoff-summary`, `off-hours` e `agent_config.personality_prompt`:** ou passam a ser
   consumidos, ou saem do painel. Configuração que não faz nada é pior que configuração ausente
   — foi exatamente o que sustentou 4 meses de crença errada no MemPalace.

---

## 7. Minha condição de aceite

> **Eu assino embaixo de que o Epic 87 vai funcionar SE E SOMENTE SE:**

1. **W0-0 (paridade e reconciliação de `agent_prompts`) sair antes de qualquer deploy da Onda 1**,
   com o snapshot versionado commitado, a versão única acordada, e o teste de contradição
   sede×stand verde. *Verificável:* `diff` entre o snapshot no repo e o `SELECT` em produção
   retorna vazio; `grep -i stand` nos 5 overrides retorna 0 ocorrências de endereço de obra.

2. **A ordem da Onda 1 for invertida para W1-2a+W1-3a (mesmo dia, juntos) → W1-2b → W1-3b →
   W1-1**, e a W1-1 trouxer AC explícita sobre `lastAssistantMsg` e uma decisão escrita sobre as
   mensagens de `role='broker'`. *Verificável:* existe teste que fixa o referente de
   `lastAssistantMsg` e teste que fixa o filtro de papel como intenção.

3. **W1-2b incluir âncora temporal**, não só TTL. *Verificável:* o teste
   `resolveVisitSlotParts(availability_de_27/07, now=12/08)` **não** pode retornar 15/08 — hoje
   retorna. Este é o teste que eu quero ver vermelho antes e verde depois; se ele não existir, a
   story não fecha.

4. **W2-1 afirmar sobre o contexto de entrada do modelo**, não só sobre a saída. *Verificável:*
   existe pelo menos uma asserção sobre o conteúdo do bloco `[SISTEMA: …]` passado a
   `messages.create`. Sem isso, o harness reproduz o ponto cego que causou quatro reincidências.

5. **W2-2 reencenar a Sandra com a cadeia completa de 27/07 → 05/08**, atravessando duas sessões
   e o `conversation_state` persistido. Reencenar só o turno de 05/08 passa mesmo com o bug.
   *Verificável:* o teste falha contra o `HEAD` de hoje.

6. **A régua de `detectSlotMismatch` (W2-3) e do validador (W3-1) ser `appointments`**, e a
   procedência dos fatos ser tipada com `collected_data`/`ai_summary` classificados como cache
   derivado, jamais como fonte. *Verificável:* está escrito na story, e existe teste em que
   `collected_data` mente e a guarda dispara mesmo assim.

7. **O MemPalace ser desligado por flag na Onda 0** (não na Onda 4), eliminando a chamada de
   embedding e os round-trips falhos por turno. *Verificável:* `NICOLE_MEMORY_V1_ENABLED=false`
   em produção e queda medida no delta entre `CLAUDE_RESPONSE` e `whatsapp_async_done`.

8. **M10 for substituído por um proxy com volume** (taxa de resposta do lead ao turno seguinte,
   ou `HANDOFF_TRIGGERED`/conversa). *Verificável:* o baseline W0-3 declara o n de cada métrica;
   qualquer métrica com n<10/semana é marcada como não-conclusiva no próprio runbook.

9. **W0-4 (kill switch) for validado por efeito no projeto Vercel correto**
   (`prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c`), não por existência no painel. *Verificável:* ligar a
   flag, mandar uma mensagem de teste em produção, confirmar que a Nicole não responde, desligar.

10. **D5 (CI mínima) sair em paralelo à Onda 1**, incluindo o job de diff de `agent_prompts`.
    Sem isso, os itens 1, 3, 4, 5 e 6 desta lista são promessas, não invariantes — e a tese
    central do epic ("remendo sem rede reincide") fica sem mecanismo.

**Se as condições 1, 2, 3 e 4 não forem aceitas, meu veredito é que o Epic 87 é o quinto
remendo — mais caro, mais bem documentado, e igualmente reincidente.** As outras seis são o que
separa "funcionou" de "funcionou e a gente sabe por quê".

Uma nota final que não é técnica. O Epic 87 é, de longe, o melhor documento que este problema já
recebeu: o diagnóstico do loop de contaminação está certo, a disciplina de "um fix de substrato
por deploy" está certa, a proibição de Onda 3/4 antes do harness está certa, e a leitura de que
os remendos falharam por atacar o sintoma está certa. O que faltou foi **descer mais um nível
em duas frentes**: verificar a causa contra as mensagens reais (e não contra a hipótese
plausível), e olhar o que roda em produção (e não o que está no repositório). São exatamente as
duas frentes em que este projeto já se enganou antes — o MemPalace foi auditado no código e não
no banco, e agora os prompts também.

— Aria, arquitetando o futuro 🏗️
