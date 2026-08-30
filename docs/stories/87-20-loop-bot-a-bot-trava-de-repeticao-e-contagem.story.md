# Story 87-20 — Trava de loop bot-a-bot: repetição, contagem e modo de encerramento

## Metadata
- **Epic:** 87 — Nicole: Confiabilidade de Contexto, Estado e Enforcement
- **Story:** 87-20
- **Status:** Ready for Review
- **Priority:** P0 — incidente real em produção (2026-08-30), contido manualmente. Sem esta story, o mesmo bug se repete na próxima vez que outro sistema automático conversar com o número da Nicole.
- **Complexity:** L (3 sinais independentes + reposicionamento crítico do ponto de bloqueio dentro de `processMessage` + novo campo em `ProcessMessageResult` + troca do call-site do webhook + ampliação de `alertarAdminWhatsApp` + guarda na reativação de 24h; **sem migration**; ~12-16h)
- **Created:** 2026-08-30
- **Author:** @sm (River)
- **Revisão pós-@po:** 2026-08-30 — NO-GO estreito 7,5/10 (`docs/qa/po-validation-87-20.md`), 4 correções bloqueantes (B1-B4) + 1 mudança de escopo por decisão do dono do produto (S1) + 5 correções recomendadas incorporadas (S2, S3, S4, S5, S6, S9, S10). Nenhuma remedição de dado foi necessária — todas as medições da v1.0 foram confirmadas ou reforçadas.

> **Nota de numeração:** `docs/stories/87-*` vai até `87-19` (mergeada, PR #519, commit `51d21d1e`). `87-20` está livre.

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- **Quality Gate Tools:** `[mutation_testing, false_positive_review, cron_pattern_review, effect_isolation_review]`

---

## User Story

**Como** administrador da plataforma Trifold,
**Quero** que a Nicole pare sozinha de conversar em loop com outro sistema automático — sem depender de alguém notar e pausar a conversa à mão — e que o número de mensagens de encerramento fique limitado como eu pedi,
**Para que** um incidente como o de hoje (22 mensagens trocadas em 5 minutos com um número que não é um lead) nunca mais dependa de intervenção manual, e a conversa nunca se despeça mais de duas vezes.

---

## Context — o incidente, remedido contra o banco duas vezes (@sm e @po, independentemente)

> **Nota de higiene (o repositório é público):** nenhuma conversa é identificada nesta story.
> Elas aparecem como **o incidente** e **o controle negativo**, e toda cadência é registrada como
> **deslocamento relativo** (`T+0s`, `T+34s`, …) a partir da 1ª mensagem daquela conversa — os
> intervalos são preservados segundo a segundo, que é tudo de que os testes precisam.

A conversa do incidente foi contida manualmente pelo dono do produto (`is_ai_active=false`,
`handoff_at` verificado no banco de produção, projeto `dsopqkqjkmhytudaaolv`).

**Número correto (medido duas vezes, byte a byte):** o relato inicial dizia "21 mensagens, 10 da
Nicole". A contagem real, na janela de 5 min (`T+0s`→`T+307s`), é **22 mensagens — 11 da Nicole
(`role='assistant'`) e 11 do outro lado (`role='user'`)**, com **0** linhas `metadata.is_transition=true`
— nenhuma é fala do corretor gravada com o papel errado.

A assinatura por `md5(content)` — os textos aparecem pelo **rótulo de classe** `H{n}` da fixture
(`packages/ai/src/flows/__fixtures__/loop-87-20.ts`), nunca pelo valor do hash:

| texto (rótulo) | 1ª vez | 2ª vez | 3ª vez |
|---|---|---|---|
| `H16` (9 chars) | T+224s | T+252s | **T+307s — a 11ª e ÚLTIMA mensagem real do incidente** |
| `H8` (18 chars) | T+105s | T+278s | — |

**O que a trava desta story teria feito com ESTE incidente, com o número exato:** o bloqueio mais
cedo possível é a tentativa de reenviar `H16` pela 3ª vez — que é a **11ª mensagem**, a
**última** que de fato saiu, 47s antes de o humano intervir. **Não é captura precoce — é o primeiro
ponto estruturalmente possível de bloquear, e ele reduz um loop sem fim para um loop de 10
mensagens enviadas.** É valor real (sem a trava, aquilo não parava sozinho) e o número correto é
esse, não "pegou cedo".

### A pergunta que decidiu o desenho: pura contagem bastava?

**Não — e há prova, não suposição.** Rodando a mesma régua ("quantas mensagens da Nicole em 5 min,
numa mesma conversa") contra **205 conversas com atividade da Nicole em 14 dias**, o **máximo
histórico é 11** — e **duas conversas** chegam lá, não uma:

| conversa | Nicole em 5 min | conteúdo repetido? |
|---|---|---|
| o incidente | **11** | **sim — 4 pares, 2 conteúdos** |
| o controle negativo (lead real) | **11** | **não — 11 conteúdos distintos** |

Um limite de contagem puro em 11 (ou em qualquer valor ≤ 11) **teria bloqueado as duas**.

**O controle negativo é mais forte do que a medição original mostrou — o @po foi além e confirmou
com uma régua própria:** cadência do incidente **6,0s de desvio-padrão** (intervalos 8–27s, forma de
máquina); cadência do controle **12,9s de desvio-padrão** (intervalos 3–47s, irregular). O lado
`user` do controle tem 9 mensagens de **14 caracteres de média**, todas distintas — "é gente
digitando 'sim', 'ok', 'quanto?'". **É um lead real, não um segundo bot**, e é ele que sustenta a
necessidade de dois sinais em vez de um limite de contagem só.

**A régua de repetição, reproduzida sob critério MAIS duro que o original** (`btrim()` em vez de
`md5(content)` — `trim()` só pode produzir MAIS colisões, nunca menos — e janelas esticadas até 24h,
288× o intervalo do incidente): **1 única conversa com repetição em toda janela testada — a
o incidente, com exatamente 4 pares.** É o achado mais sólido da story.

**Denominador honesto (achado do @po):** o Sinal A só pode disparar onde a conversa tem **≥ 3**
mensagens da Nicole — condição necessária para um 3º envio existir. Isso restringe a população a
**54 das 205 conversas** (só 5 delas chegam a 11). Dizer "zero falso positivo em 202/205 outras
conversas" superestima a evidência em ~4×. **O achado continua forte com o denominador certo:**
dentro dessas 54, nenhuma chega sequer ao **2º** envio idêntico — quanto mais ao 3º.

**Distribuição de referência (Nicole por janela, 205 conversas/14 dias, medida também em 10 min):**

| janela | pico | p50 | p90 | p95 | p99 |
|---|---|---|---|---|---|
| 5 min | 11 | 1 | 5 | 6 | 10 |
| 10 min | **11** | 1 | 5 | 7 | 10 |

O limiar do Sinal B foi calibrado citando "o máximo histórico é 11" — número certo para 14 dias,
mas medido na janela de 5 min, não na de 10 min usada pelo próprio sinal. Medido na janela certa,
em 14 dias, o pico **também é 11**.

**⚠️ Mas 14 dias era pouco (2ª rodada do @po).** Estendendo a MESMA régua para **90 dias / 1.940
mensagens**, o pico por 10 min é **19**, e **14 conversas passam de 12**. Com o limiar de 15 da
v1.1, **o lead de maior volume medido** seria bloqueado: 21 mensagens da Nicole todas
distintas (162 chars de média), lado `user` com 19 mensagens de 20 chars, **e 2 mensagens
`role='broker'`** — um lead que o corretor de fato assumiu. **Era o mesmo erro que o controle
negativo existe para impedir, um nível acima.** O limiar subiu para **25** (32% acima do
máximo real de 90 dias). Lição registrada: janela de calibração curta produz margem imaginária.

**O que NÃO existe hoje:** nenhum `event_type` de `system_events` cobre isto (`NICOLE_AFIRMACAO_SEM_LASTRO`,
`NICOLE_AGENDA_STATE_EXPIRADO`, `NICOLE_AGENDA_STATE_LEGADO_DESCARTADO`, `NICOLE_HISTORY_TRUNCATED`,
`NICOLE_LASTRO_DIARIO`, `NICOLE_RESUMO_SEM_LASTRO_BLOQUEADO`, `NICOLE_SLOT_MISMATCH`,
`NICOLE_SLOT_UNAUTHORIZED` — nenhum de volume ou repetição).

### O relógio que ninguém pediu, mas existe: reativação automática em ~24h

`conversations.is_ai_active=false` **não é permanente**. Desde a Story 63-13/63-15
(`packages/web/src/lib/broker/broker-takeover-status.ts`), toda mensagem inbound recalcula
`shouldReactivateAi` sobre a âncora `max(handoff_at, última mensagem role='broker')`; passadas 24h,
a Nicole reassume sozinha. Verificado: a mensagem `role='broker'` mais recente desta conversa é de
**~49h antes da contenção**, mais de 24h antes do `handoff_at` — não move a âncora. A âncora é o
`handoff_at` da contenção manual. **Confirmado pelo @po:**
`shouldReactivateAi`/`resolveTakeoverAnchor` são puramente temporais e **agnósticos a
`handoff_reason`** — o prazo de **24h após a contenção** é real e o mecanismo, sozinho, reativaria
a conversa.

**Achado do @po que muda o desenho (ver AC14):** sem intervenção, mesmo com a trava desta story em
produção, reativar em 24h **zera o contador do Sinal A** (janela de 30 min) — se o outro bot voltar
a falar, a Nicole responde de novo, repete 2 vezes, bloqueia nas 3, e o ciclo **se repete
indefinidamente, um alerta a cada ~poucos minutos, para sempre**. Isso não é "a trava falhou" — é
"a trava funciona a cada ciclo e ninguém decidiu parar o ciclo". A correção está no AC14: quem
decide reativar (o webhook, não a 63-13/63-15) ganha uma condição a mais.

---

## Scope

### IN (esta story entrega)

1. **Sinal A — repetição exata de conteúdo.** Bloqueia a 3ª tentativa de enviar um texto (`trim()`)
   já enviado 2 vezes nesta conversa nos últimos 30 min. Zero falso positivo medido (ver Context).
2. **Sinal B — contagem estrutural (backstop, independe de conteúdo).** Bloqueia quando a Nicole já
   enviou ≥ **25** mensagens nesta conversa em 10 min, mesmo sem repetição — cobre a variante de bot
   que varia o texto. (Limiar corrigido de 15 para 25 na 2ª rodada do @po: 15 tinha falso positivo
   medido em 90 dias — ver AC2 e R2.)
3. **Sinal C — modo de encerramento (NOVO, decisão do dono do produto após revisão do @po).**
   Responde ao pedido original literal ("limita a 2 mensagens de encerramento"), que os Sinais A/B
   não cobrem sozinhos: uma conversa pode se despedir repetidamente com texto **diferente** a cada
   vez, sem nunca repetir conteúdo e sem nunca chegar perto do limiar de contagem. Definição explícita e
   limites em AC3 — **é semântico e frágil por natureza; a fragilidade é documentada, não
   escondida** (ver "Por que Sinal C é frágil e por que ainda vale", nos Dev Notes).
4. **Contenção síncrona, reusando o mecanismo que já existe.** Ao disparar qualquer sinal: a
   mensagem não é enviada, **nenhum efeito colateral do turno sobrevive** (AC5), e `conversations`
   recebe `is_ai_active=false` / `handoff_at=now()` / `handoff_reason=LOOP_BOT_HANDOFF_REASON` —
   escrita **aguardada**, dentro de `processMessage`.
5. **O evento que avisa o humano é escrito de forma que sobrevive à lambda** (AC9) — não pelo canal
   fire-and-forget que hoje registra os outros eventos de `pipeline.ts`.
6. **Alerta ao admin que diz QUAL conversa** (AC10) — reusando (ampliando, não copiando) a
   infraestrutura da Story 87-19.
7. **A conversa não reativa sozinha em 24h** (AC14) — guarda de 3 linhas no chamador da 63-13/63-15,
   sem tocar a lógica dela.
8. **Kill-switch** (`NICOLE_LOOP_BREAKER_OFF`) para desligar os três sinais sem deploy.

### OUT (não entra nesta story)

- **Identificar ou bloquear "o outro bot" por número/telefone.** A trava é sobre o comportamento da
  Nicole, não sobre a origem da mensagem.
- **A `W3-1` (validador pós-resposta tipado) do roadmap do Epic 87, Onda 3** — infraestrutura geral
  de enforcement, ainda não construída. Esta story é um circuit-breaker específico e autocontido.
- **Reescrever `shouldReactivateAi`/`resolveTakeoverAnchor` (63-13/63-15).** AC14 adiciona uma
  condição no CHAMADOR (webhook); as duas funções continuam agnósticas a `handoff_reason`, como o
  @po confirmou que já são.
- **Novo template do WhatsApp Meta.** Reusa `alerta_sistema_admin` (já submetido pela 87-19), com a
  assinatura de `alertarAdminWhatsApp` ampliada (ver AUTO-DECISION), não um template novo.
- **Extrair `metadata->>'is_transition'` para coluna própria** — dívida já catalogada em
  `docs/backlog.md` (Story 87-5), fora do raio desta story.
- **Consertar o canal do Telegram (`packages/web/src/app/api/telegram/webhook/route.ts:514`).** Esse
  webhook também chama `processMessage` (a variante que devolve só `string`) e por isso NÃO recebe o
  novo campo `bloqueadoPorLoop` nem o alerta síncrono desta story — no bloqueio, ele simplesmente
  recebe uma resposta vazia, sem log garantido nem alerta. Aceito conscientemente: o Telegram é o
  canal de staging/teste do projeto, não produção (ver memória do projeto); documentado aqui para
  não ser um gap descoberto por acidente depois.
- **Consertar o campo `ProcessMessageResult.handoff` (já existente, já morto — nenhum caller o lê
  hoje).** É um achado colateral desta investigação, não desta story: reusá-lo para o sinal de
  bloqueio colidiria com o significado real dele (handoff de qualificação de lead), então esta story
  cria um campo próprio (`bloqueadoPorLoop`) em vez de sobrecarregar um campo com semântica
  diferente. Consertar o `handoff` morto é item de backlog separado.

---

## Acceptance Criteria

- [ ] **AC1 — Sinal A dispara na 3ª tentativa de conteúdo idêntico:** Dado que a Nicole já enviou o
  mesmo texto (`trim()` igual) **2 vezes** nesta conversa nos últimos **30 minutos**, e está prestes
  a enviar esse MESMO texto pela 3ª vez: o envio é bloqueado. A 1ª e a 2ª vez do mesmo texto **não**
  são bloqueadas.

- [ ] **AC2 — Sinal B (contagem, backstop) dispara sem depender de repetição:** Dado que a Nicole já
  enviou **≥ 25 mensagens** nesta conversa nos últimos **10 minutos**, mesmo que nenhum conteúdo se
  repita: o próximo envio é bloqueado.
  **Limiar corrigido de 15 para 25 na 2ª rodada do @po — o valor 15 estava falsificado.** A
  calibração original ("pico histórico = 11, margem de 36%") vinha de uma janela de **14 dias**.
  Medido em **90 dias / 1.940 mensagens**, o pico real por 10 min é **19**, e **14 conversas passam
  de 12**. Com limiar 15, o lead real de maior volume seria **bloqueado**: 21
  mensagens da Nicole todas distintas (162 chars de média), lado `user` com 19 mensagens de 20 chars
  — e **2 mensagens `role='broker'`**, ou seja, um lead que o corretor de fato assumiu. É exatamente
  o erro que o controle negativo existe para impedir, um nível acima. **25 fica 32% acima
  do máximo real de 90 dias.** O Sinal B é backstop de disparada, não discriminador fino — o custo de
  um limiar alto demais é o Sinal A/C pegarem antes; o de um limiar baixo demais é cortar lead quente.

- [ ] **AC3 — Sinal C (modo de encerramento) — NOVO, decisão do dono do produto:**
  **Definição operacional** (constante nomeada e exportada `PADROES_DE_ENCERRAMENTO: RegExp[]`,
  extensível, não exaustiva): uma mensagem da Nicole é classificada como "de encerramento" quando o
  texto normalizado (trim + minúsculas) casa com pelo menos um destes padrões —
  `tchau`, `até mais|até logo|até breve|até a próxima`, `qualquer coisa (é )?só chamar`,
  `fico à disposição`, `foi um prazer (te )?atender`, `um abraço`, `nos falamos`.
  Dentro da MESMA janela de 30 min do Sinal A, ao tentar enviar a **3ª** mensagem classificada como
  encerramento nesta conversa (mesmo que o texto varie a cada vez): o envio é bloqueado. A 1ª e a 2ª
  não são bloqueadas — cumpre literalmente o pedido original ("no máximo 2 mensagens de
  encerramento"). **A fragilidade deste sinal foi MEDIDA na 2ª rodada do @po, e ele é o mais forte dos três**
  (ver "Sinal C medido", nos Dev Notes): 0 falso positivo em 90 dias, e no incidente real ele
  bloqueia na **6ª** mensagem, contra a 11ª do Sinal A.

- [ ] **AC4 — Nenhum dos três sinais conta fala humana como fala da Nicole, e a garantia é
  testável onde ela roda:** o campo que discrimina `metadata.is_transition` (Story 87-5) faz parte
  do TIPO de entrada das três funções puras — não é filtrado só no chamador. Um teste de integração
  separado (não da função pura) afirma que a consulta de T2.1 projeta a coluna `metadata` no
  `.select()` — sem essa segunda metade, um `select` que não traz `metadata` faz o filtro virar
  no-op silenciosamente e nenhum teste da função pura seria capaz de detectar (achado B1 do @po,
  mesma classe do "carrasco cego" da Story 900-23).

- [ ] **AC5 — Ao disparar qualquer sinal (A, B ou C), NENHUM efeito colateral do turno sobrevive:**
  sem `saveMessages` (mensagem não entra no histórico), sem criação/atualização de
  `appointments`, sem evento no Google Calendar (`createCalendarEvent`/`deleteCalendarEvent`), sem
  `emit(APPOINTMENT_CREATED)` (que hoje dispara push ao corretor), sem registro de handoff por
  agendamento, sem patch em `leads`, sem `updateConversationState`, sem `updateConversationTimestamp`.
  **A lista acima é ILUSTRATIVA, não exaustiva — o @po enumerou a janela e ela tem ~15 escritas, não
  8.** Faltavam nomeadas: os quatro `supabase.from("activities").insert(...)` de `:1654`, `:1672`,
  `:1722` e `:1744` (linha do tempo do lead), o avanço de estágio para "Visita Agendada"
  (`:1663`/`:1719`) e os `emit(APPOINTMENT_RESCHEDULED)` (`:1723`) / `emit(APPOINTMENT_CANCELLED)`
  (`:1745`) — que, como o `APPOINTMENT_CREATED`, disparam push ao corretor pelo `onEvent` do webhook.
  **O requisito normativo é o MECANISMO, não a lista:** um `return` antecipado em ~1291 cobre as ~15
  por construção; uma implementação de "marca a flag e pula depois" passaria nas 8 asserções e
  vazaria as outras 7. **Confirmado pelo @po que o mecanismo basta:** entre o início de
  `processMessageWithMetadata` (:537) e o ponto de bloqueio (~1291) **não existe nenhuma escrita** —
  as únicas (`saveMessages`/`updateConversationTimestamp`, :561-562) estão no ramo de fora-de-horário,
  que tem `return` próprio em :564 e nunca alcança 1291. "Nenhum efeito colateral sobrevive" é
  alcançável de verdade.
  **O bloqueio acontece no `return` antecipado logo após gerar e sanear `assistantMessage`** — no
  mesmo ponto onde `detectSlotMismatch` já roda hoje (`pipeline.ts`, próximo à linha 1291) — e NÃO
  em qualquer ponto depois de ~1600, onde o calendário e a agenda já foram tocados. Testado com
  asserção (spies/mocks nas 7 escritas listadas), não com comentário.

- [ ] **AC6 — Contenção reusa o mecanismo existente, escrita síncrona e aguardada:** `UPDATE
  conversations SET is_ai_active=false, handoff_at=now(), handoff_reason=LOOP_BOT_HANDOFF_REASON
  WHERE id=conversation_id` — os mesmos três campos já usados pelo handoff manual
  (`leads/[id]/handoff/route.ts`) e pelo handoff por resposta do corretor (`send-message/route.ts`).
  A escrita acontece com `await`, dentro de `processMessage`, no mesmo padrão das outras escritas
  diretas que a função já faz (`appointments`, `activities`, `lead_facts`) — não fire-and-forget.
  `LOOP_BOT_HANDOFF_REASON = "loop_bot_detectado"` é constante exportada.

- [ ] **AC7 — Réplica do incidente real, com os TRÊS sinais ligados (reescrito na 2ª rodada do @po
  — a versão anterior contradizia o AC3 no mesmo fixture):** fixture com as 22 mensagens do
  incidente. Medido no banco, mensagem a mensagem (`enc` = casa `PADROES_DE_ENCERRAMENTO`):

  | # | deslocamento | len | texto (rótulo) | encerramento? | acum. |
  |---|---|---|---|---|---|
  | 1 | T+11s | 146 | `H2` | não | 0 |
  | 2 | T+49s | 113 | `H4` | não | 0 |
  | 3 | T+76s | 36 | `H6` | **sim** | 1 |
  | 4 | T+105s | 18 | `H8` | **sim** | 2 |
  | 5 | T+133s | 30 | `H10` | não | 2 |
  | **6** | **T+165s** | 31 | `H12` | **sim** | **3 ← Sinal C BLOQUEIA aqui** |
  | 7 | T+195s | 25 | `H14` | sim | 4 |
  | 8 | T+224s | 9 | `H16` | sim | 5 |
  | 9 | T+252s | 9 | `H16` | sim | 6 |
  | 10 | T+278s | 18 | `H8` | sim | 7 |
  | 11 | T+307s | 9 | `H16` | sim | 8 ← seria o ponto do Sinal A |

  **8 das 11 mensagens da Nicole são despedidas.** O diagnóstico literal do dono do produto
  ("limita a 2 mensagens de encerramento") descreve o mecanismo real do incidente com precisão.

  O teste afirma, com os três sinais ativos: **o bloqueio ocorre na 6ª mensagem, em T+165s, pelo
  Sinal C — 5 mensagens enviadas, não 10, e 2m22s antes do ponto do Sinal A.** Afirma também, como
  asserção separada e com o Sinal C desligado, que o **Sinal A sozinho** bloquearia na 11ª (10
  enviadas) — as duas propriedades importam e não podem ser medidas no mesmo teste.

- [ ] **AC8 — Controle negativo real, com o denominador correto:** fixture com as mensagens reais do
  controle negativo (11 da Nicole em 5 min, 0 repetições) — nenhum sinal dispara. O teste/documentação
  registra que o Sinal A só é elegível para disparar em conversas com ≥ 3 mensagens da Nicole (54 das
  205 medidas) — não alegar "zero falso positivo em 205 conversas" quando só 54 podiam, em tese,
  produzir um positivo.

- [ ] **AC9 — Evento em `system_events` sobrevive à lambda:** `processMessageWithMetadata` devolve um
  campo novo e próprio — `bloqueadoPorLoop?: { tipo: "conteudo_repetido" | "contagem_excessiva" |
  "encerramento"; ocorrencias: number; conversationId: string; leadId: string | null }` — em vez de
  sobrecarregar o campo `handoff` já existente (que tem semântica DIFERENTE: qualificação de lead
  para corretor, não bloqueio por loop — reusá-lo colidiria com o único consumidor real dele). O
  webhook (`route.ts`), ao ler `bloqueadoPorLoop` no retorno de `processMessageWithMetadata`, executa
  `await logEventOnce({ event_type: "NICOLE_LOOP_DETECTADO", level:"error", category:"ai", ... })`
  **antes** de decidir o que fazer com a resposta — não pelo canal `emit()`/`onEvent` → `logEvent`
  (fire-and-forget), que é exatamente o padrão que o próprio `logger.ts:50-55` (Story 87-6) alerta
  para não usar quando o evento é a última escrita antes do response. `pipeline.ts` **não** chama
  `emit()` para este evento — uma única escrita, aguardada, evita duplicidade.

- [ ] **AC10 — Alerta ao admin identifica a conversa:** branch novo no cron `nicole-health` (Story
  87-19) varre `NICOLE_LOOP_DETECTADO` recentes e chama `alertarAdminWhatsApp` (assinatura ampliada,
  ver AUTO-DECISION) com `motivo` = `"loop bot-a-bot detectado — {NEXT_PUBLIC_APP_URL}/dashboard/conversas/{conversationId}"`
  — o link cabe dentro do parâmetro livre `{{1}}` do template `alerta_sistema_admin` (3 parâmetros
  fixos, preservados; um 4º devolve 400 e o alerta para de sair, medido na 900-23). **A env é
  `NEXT_PUBLIC_APP_URL`, com o fallback convencional do repo `?? "https://crm.trifold.eng.br"`
  (8 usos em `packages/web/src/lib`) — `APP_URL` puro não existe e produziria `undefined/dashboard/…`** e resolve "onde olhar" sem
  expor `handoff_reason` em nenhuma tela nova. Dedup horário por `conversation_id` via
  `logEventOnce({ dedupe_key: "nicole-loop-alerta:{conversation_id}:{hora}" })` — dois loops
  simultâneos em conversas diferentes viram dois alertas DISTINGUÍVEIS (cada um com seu link), não
  duas mensagens idênticas.

- [ ] **AC11 — Falha do alerta nunca compromete a contenção:** a contenção (AC5/AC6) e o evento
  (AC9) já aconteceram, síncronos e aguardados, dentro de `processMessage`, **antes** e
  **independente** do cron do AC10. Falha do canal de WhatsApp produz `{ skipped: ... }` ou log
  isolado — nunca lança, nunca impede o próximo turno.

- [ ] **AC12 — Kill-switch:** com `NICOLE_LOOP_BREAKER_OFF=1`, os três sinais são pulados inteiramente.

- [ ] **AC13 — Sem migration:** `is_ai_active`, `handoff_at`, `handoff_reason` (migration 001) e
  `ux_system_events_dedupe_key` (migration 218) já existem. Última migration do repo: `248`.

- [ ] **AC14 — A conversa contida por loop NÃO reativa sozinha em 24h (achado do @po, corrige a
  v1.0):** o ponto de reativação automática no webhook (`route.ts`, próximo à linha 1082-1090, onde
  `shouldReactivateAi(anchor)` decide `UPDATE conversations SET is_ai_active=true, handoff_at=null,
  handoff_reason=null`) ganha uma condição a mais, **só nesse chamador**.
  **⚠️ Correção obrigatória achada na 2ª rodada do @po — sem ela esta AC é um no-op:** a consulta
  daquele bloco hoje é `.select("handoff_at")` (`route.ts:1066`) e **não projeta `handoff_reason`**.
  Ler `convRow?.handoff_reason` devolveria `undefined` para sempre, a reativação nunca seria pulada,
  e a oscilação permanente que esta AC existe para matar voltaria inteira — com o teste verde, se o
  fake devolver o campo independentemente da lista de colunas (o "carrasco cego" da 900-23). **T5.1
  DEVE trocar a projeção para `.select("handoff_at, handoff_reason")` e o teste DEVE afirmar a
  projeção**, exatamente como a 2ª metade do AC4 faz para a consulta de T2.1 — é a mesma classe de
  defeito, na consulta que esta própria revisão introduziu.
  Feito isso: se `handoff_reason === LOOP_BOT_HANDOFF_REASON`, a reativação automática é pulada — a conversa só
  volta por ação humana explícita (`resume-ai`). `shouldReactivateAi`/`resolveTakeoverAnchor`
  (63-13/63-15) permanecem intocadas e continuam agnósticas a `handoff_reason`, exatamente como o
  @po confirmou que já são — o OUT desta story continua respeitado. Sem esta AC, a v1.0 geraria uma
  oscilação permanente (reativa em 24h → contador do Sinal A zera → repete 2x → bloqueia → reativa em
  24h de novo, para sempre).

- [ ] **AC15 — Backstop pode disparar antes de chamar o modelo:** quando o Sinal B já está armado
  (contagem conhecida antes da geração), a chamada à Anthropic é pulada e o bloqueio (mesmo caminho
  de AC5/AC6/AC9) acontece imediatamente. Nice-to-have de custo/latência.

- [ ] **AC16 — Decisão registrada sobre o incidente (recomendação do @po):** a conversa permanece
  pausada — sem despausar, sem SQL adicional. Se ela reativar sozinha antes do deploy (24h após a
  contenção) e o outro bot voltar a falar, o Sinal A a recontém em até 3 mensagens; se reativar
  DEPOIS do deploy, o AC14 impede que ela reative de novo, ponto. Qualquer um dos dois cenários **é**
  a validação em produção — não uma pendência separada.

---

## Riscos & Mitigação

| # | Risco | Impacto | Mitigação |
|---|---|---|---|
| **R1** | Sinal A falso-positivo numa resposta curta que Nicole legitimamente repete, em conversas distintas de um mesmo lead | Handoff indevido, raro | Escopo é por conversa, nunca entre conversas. Dentro de uma conversa, 0 colisões nas 54 conversas elegíveis (≥3 msgs), mesmo em janela de até 24h |
| **R2** ⚠️ **materializado e corrigido** | Sinal B corta uma conversa humana genuinamente rápida e longa | Handoff de um lead quente | **Não era hipotético: com o limiar de 15 da v1.1, o lead real de maior volume seria bloqueado (19 msgs em 10 min, todas distintas, corretor engajado depois).** Limiar subido para **25**, 32% acima do máximo real de **90 dias** (19) — não dos 14 dias (11) que a v1.1 usou. Sinais A e C pegam o loop de verdade bem antes de 25 |
| **R3** | `alerta_sistema_admin` (87-19) pode não estar `APPROVED` — nenhum `whatsapp_send_log` com esse template existe em produção até hoje | Alerta ao admin não sai | AC11: a contenção não depende do alerta. Merge é seguro do mesmo jeito que a 87-19 mergeou com o template pendente |
| **R4** | ~~Reativação automática do incidente em ~24h antes do deploy~~ — **mitigado pelo AC14, não apenas documentado** | Sem AC14, o loop reabriria por até algumas trocas a cada 24h, indefinidamente | AC14: conversas com `handoff_reason=LOOP_BOT_HANDOFF_REASON` não reativam sozinhas. O prazo de deploy continua real (ver AC16), mas deixou de ser o único mecanismo de proteção |
| **R5** | Um bot que varia texto E nunca usa linguagem de encerramento escapa dos Sinais A e C | Só o Sinal B contém, e agora mais tarde (25 em vez de 15) | Aceito e explicitado: subir o limiar de B para eliminar o falso positivo do R2 **custa latência de contenção** neste cenário — de ≤15 para ≤25 mensagens. É a troca certa: o cenário do R2 (cortar lead quente) foi **observado em produção**; o do R5 nunca foi. Sinais A e C cobrem os dois padrões de bot já vistos |
| **R6** ✅ **medido e refutado na 2ª rodada do @po** | ~~Sinal C tem taxa de falso positivo **não medida** — não há como rodar a régua sem ler conteúdo~~ | — | **A premissa estava errada: um predicado regex que devolve só CONTAGENS não lê conteúdo nenhum** — é a mesma técnica já usada para o Sinal A (`md5`/`btrim`). Medido em **90 dias / 1.940 mensagens**: 41 mensagens casam os padrões, em 13 conversas; pico de encerramentos numa janela de 30 min = **8**, e **a única conversa que o Sinal C bloquearia é o próprio incidente**. **Zero falso positivo em 90 dias.** As 4 conversas mais próximas param em **2** (o limite exato do pedido do dono do produto), então a margem é de 1 mensagem — estreita, e é o número certo para vigiar em produção, não um motivo para não shipar |
| **R7** ⚠️ **NOVO** | O canal Telegram (`telegram/webhook/route.ts:514`) chama a variante `processMessage` (string), não recebe `bloqueadoPorLoop` nem o alerta síncrono | Um loop no Telegram (staging) seria contido (resposta vazia) mas sem log garantido nem alerta | Aceito — Telegram é staging/teste, não produção. Documentado no OUT para não ser descoberto por acidente |

---

## Tasks / Subtasks

- [x] **T1** — Funções puras em `packages/ai/src/flows/loop-breaker.ts` (AC1, AC2, AC3, AC4)
  - [x] T1.1 — Constantes: `LOOP_REPEAT_WINDOW_MIN = 30`, `LOOP_REPEAT_MAX_SENDS = 2`,
    `LOOP_COUNT_WINDOW_MIN = 10`, `LOOP_COUNT_MAX = 25` (corrigido de 15 — ver AC2), `LOOP_CLOSING_WINDOW_MIN = 30`,
    `LOOP_CLOSING_MAX_SENDS = 2`, `PADROES_DE_ENCERRAMENTO: RegExp[]`,
    `LOOP_BOT_HANDOFF_REASON = "loop_bot_detectado"` — todas exportadas
  - [x] T1.2 — Tipo de entrada COM o discriminador dentro: `type MensagemRecente = { content: string; created_at: string; isTransition: boolean }` — `isTransition` faz parte do tipo, não é filtrado só no chamador (corrige B1)
  - [x] T1.3 — `detectarLoopDeConteudo(input: { candidato: string; recentes: MensagemRecente[]; now: Date }): { bloquear: boolean; ocorrenciasAnteriores: number }` — pura, ignora `recentes` com `isTransition:true`, compara `trim()`
  - [x] T1.4 — `detectarLoopPorContagem(input: { recentes: MensagemRecente[]; now: Date }): boolean` — pura, ignora `isTransition:true`
  - [x] T1.5 — `ehMensagemDeEncerramento(texto: string): boolean` + `detectarLoopDeEncerramento(input: { candidato: string; recentes: MensagemRecente[]; now: Date }): { bloquear: boolean; ocorrenciasAnteriores: number }` — mesma mecânica de T1.3, critério de classificação diferente (`PADROES_DE_ENCERRAMENTO`, não igualdade de conteúdo)
  - [x] T1.6 — `loop-breaker.test.ts`: casos sintéticos de AC1-AC4 (incluindo um caso `isTransition:true` que NÃO dispara nenhum dos três, expresso na própria função pura) + os dois fixtures reais (T4)
  - [x] T1.7 — **Régua de regressão do Sinal C, não mais calibração manual** (R6 já foi medido pelo @po — ver Dev Notes "Sinal C medido"): o dev NÃO precisa reler 20-30 conversas à mão. O que precisa existir é a repetibilidade: um script/consulta versionado (`docs/qa/` ou comentário no teste) com o predicado exato de `PADROES_DE_ENCERRAMENTO` traduzido para SQL, que devolve **só contagens**, para reexecutar a medição de falso positivo depois de qualquer alteração na lista. Toda linha nova em `PADROES_DE_ENCERRAMENTO` precisa da medição rodada de novo antes do merge — é a lista que carrega o risco, não o mecanismo. Registrar no Dev Agent Record os números (conversas bloqueadas / no limite), nunca conteúdo

- [x] **T2** — Integração em `processMessage`/`processMessageWithMetadata` (AC5, AC6, AC9, AC15)
  - [x] T2.1 — Carregar mensagens `role='assistant'` da conversa dos últimos 30 min, **projetando explicitamente `metadata`** no `.select()` — consulta dedicada, independente da janela geral de `conversation-history.ts` (que é por CONTAGEM, não por TEMPO, e está sob mudança ativa na Onda 1 deste epic). Mapear para `MensagemRecente` computando `isTransition = metadata?.is_transition === true` no próprio carregador (não deixar como responsabilidade do chamador da função pura — é o que o AC4 exige)
  - [x] T2.2 — `NICOLE_LOOP_BREAKER_OFF` no topo — se ligado, pular T2.3-T2.6 inteiramente (AC12)
  - [x] T2.3 — Sinal B ANTES de chamar a Anthropic, usando a contagem já carregada (AC15); se disparar, pular geração e ir direto a T2.5
  - [x] T2.4 — Sinais A e C DEPOIS de gerar e sanear `assistantMessage`, **no `return` antecipado próximo à linha 1291** (mesmo ponto onde `detectSlotMismatch`/`NICOLE_SYSTEM_BLOCK_LEAK` já rodam) — **NUNCA** depois da linha ~1600, onde já rodaram `createCalendarEvent` (:1629, :1704), `emit(APPOINTMENT_CREATED)` (:1680), `deleteCalendarEvent` (:1703, :1738), registro de handoff (:1776) e patch de `leads` (:1824). Este é o ponto que a v1.0 errou (B2) — a "janela de 540 linhas" citada pelo @po
  - [x] T2.5 — Ao disparar qualquer um: `await supabase.from("conversations").update({ is_ai_active:false, handoff_at:new Date().toISOString(), handoff_reason:LOOP_BOT_HANDOFF_REASON }).eq("id", conversationId)` (AC6) — direto, aguardado, mesmo padrão das outras escritas diretas da função (`appointments`, `activities`, `lead_facts`). **NÃO** chamar `emit()` para este evento (evita duplicidade com T2.6). Retornar imediatamente `{ response: "", bloqueadoPorLoop: { tipo, ocorrencias, conversationId, leadId }, qualificationScore: 0 }` — pulando `saveMessages`, `updateConversationState`, `updateConversationTimestamp` e tudo mais no corpo da função (AC5)
  - [x] T2.6 — **Webhook (`packages/web/src/app/api/webhook/whatsapp/route.ts:~1198`): trocar a chamada de `processMessage(...)` para `processMessageWithMetadata(...)`** — hoje só o WhatsApp e o Telegram usam a variante string-only; esta troca é exclusiva do webhook do WhatsApp (ver OUT sobre o Telegram). Destructure `{ response, bloqueadoPorLoop }`. Se `bloqueadoPorLoop`: `await logEventOnce({ level:"error", category:"ai", event_type:"NICOLE_LOOP_DETECTADO", message: ..., metadata: { ...bloqueadoPorLoop }, org_id: orgId })` (AC9) e **pular inteiramente** o bloco de typing-delay/envio/mídia (linha ~1300-1332, que hoje não tem guard nenhum de resposta vazia — confirmar antes de assumir). Senão, seguir o fluxo atual com `response` normalmente

- [x] **T3** — Alerta (AC10, AC11) — **ampliar, não copiar** (corrige S6 e S5 da v1.0)
  - [x] T3.1 — Em `packages/web/src/lib/alerts/admin-whatsapp.ts`: trocar o parâmetro `tipo: TipoErroIA` de `alertarAdminWhatsApp` por `motivo: string` — o corpo passa a usar `motivo` diretamente em vez de `MOTIVO_POR_TIPO[tipo]` internamente. **Correção factual da v1.0:** `sendWhatsAppTemplate` vem de `@web/lib/whatsapp/send-template` e `logWhatsappSend` de `@web/lib/whatsapp/log-send` — `admin-whatsapp.ts` os IMPORTA, não os reexporta (S5)
  - [x] T3.2 — Atualizar o ÚNICO caller existente (`nicole-health/route.ts`, branch de erro de API de IA da 87-19) para passar `motivo: MOTIVO_POR_TIPO[tipo]` explicitamente — comportamento idêntico ao de hoje, só a resolução do texto sobe um nível
  - [x] T3.3 — Branch NOVO, independente, no mesmo cron `nicole-health`: consulta `system_events` por `event_type='NICOLE_LOOP_DETECTADO'` na janela do cron, para cada ocorrência chama `alertarAdminWhatsApp` com `motivo: "loop bot-a-bot detectado — ${process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"}/dashboard/conversas/${conversationId}"`, dedup via `logEventOnce({ dedupe_key: "nicole-loop-alerta:{conversation_id}:{hora}" })` (AC10)
  - [x] T3.4 — Nenhuma entrada nova em `vercel.json` (37 crons hoje, sem mudança)

- [x] **T4** — Fixtures reais (AC7, AC8)
  - [x] T4.1 — Fixture do incidente: 22 registros (11 `user` + 11 `assistant`), timestamps e hashes desta Context — conteúdo reconstituído preservando os 2 pares de repetição byte-idêntica; teste afirma bloqueio na 11ª mensagem (não antes) e "10 enviadas" como resultado
  - [x] T4.2 — Fixture do controle negativo: 11 registros `assistant` reais (comprimentos/ordem temporal reais, conteúdo distinto); teste afirma zero disparos

- [x] **T5** — Reativação (AC14)
  - [x] T5.1 — `packages/web/src/app/api/webhook/whatsapp/route.ts`: **(a)** trocar a projeção da linha **1066** de `.select("handoff_at")` para `.select("handoff_at, handoff_reason")` — sem isso todo o resto desta task é no-op silencioso; **(b)** antes de `UPDATE conversations SET is_ai_active:true, handoff_at:null, handoff_reason:null` (~linha 1082-1090), checar `if (convRow?.handoff_reason === LOOP_BOT_HANDOFF_REASON) { /* não reativa */ }` — importar a constante de `loop-breaker.ts`. **Não tocar** `shouldReactivateAi`/`resolveTakeoverAnchor`
  - [x] T5.2 — Teste em DUAS metades (a 2ª é a que a v1.1 não tinha): **(a)** `handoff_reason="broker_reply"` reativa normalmente após 24h (sem regressão) e `handoff_reason="loop_bot_detectado"` NÃO reativa mesmo após 24h+; **(b)** teste de projeção — a consulta de reativação nomeia `handoff_reason` no `.select()`, reprovando se alguém remover a coluna da lista

- [x] **T6** — Testes e validação (ver Testing)

---

## Dev Notes

### Arquivos de referência obrigatórios (ler antes de implementar)
- `packages/ai/src/chat/pipeline.ts` — `ProcessMessageResult` (linha ~491, já tem `handoff?: {trigger, reason?, summary?}` — **não reusar, ver AUTO-DECISION abaixo**); `processMessage` (linha ~530, wrapper que devolve só `.response`) vs `processMessageWithMetadata` (linha ~537, devolve o objeto inteiro — **é esta que o webhook do WhatsApp precisa passar a chamar**, T2.6); `detectSlotMismatch` (linha ~122, padrão de função pura a seguir para o SHAPE, não o comportamento — esta trava é fail-CLOSED de propósito); o `return` final com `handoff:` populado de verdade (linha ~1919-1929, a partir de `handoffResult.trigger`) — confirma que o campo é vivo e tem dono, só não é lido por ninguém no lado do webhook (achado colateral, fora de escopo).
- `packages/ai/src/chat/conversation-history.ts` — `is_transition`, `ROLES_DE_HISTORICO`, `PAPEIS_DO_NOSSO_LADO` (Story 87-5). Não reusar o loader geral (por CONTAGEM, sob mudança ativa nesta mesma Onda 1) — a trava precisa da própria consulta, por TEMPO.
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — chamada a `processMessage` (linha ~1198, **trocar para `processMessageWithMetadata`**); bloco de typing-delay/envio (linha ~1300-1332, sem guard de resposta vazia hoje); bloco de reativação de 24h (linha ~1082-1090, onde entra o guard do AC14); comentário "Story 75-359 — JANELA ANTI-RAJADA" (linha ~1128, mecanismo relacionado mas distinto — não confundir).
- `packages/web/src/app/api/telegram/webhook/route.ts:514` — também chama `processMessage` (string). Fora de escopo (ver OUT), mas @dev precisa saber que existe para não "consertar sozinho" fora do combinado.
- `packages/web/src/app/api/leads/[id]/resume-ai/route.ts` e `.../handoff/route.ts` — contrato exato de `is_ai_active`/`handoff_at`/`handoff_reason` que o AC6 reproduz.
- `packages/web/src/lib/broker/broker-takeover-status.ts` — `BROKER_WINDOW_MS`, `shouldReactivateAi`, `resolveTakeoverAnchor` (63-13/63-15). **Não modificar** — o AC14 muda o CHAMADOR, não estas funções.
- `packages/web/src/lib/logger.ts` — `logEvent` (fire-and-forget, `void`) vs `logEventOnce` (aguardado, devolve `{inserted}`). O docstring de `logEvent` (linhas ~50-55) é a evidência citada pelo B3 do @po.
- `packages/web/src/lib/alerts/admin-whatsapp.ts` e `packages/web/src/app/api/cron/nicole-health/route.ts` (Story 87-19, mergeada `51d21d1e`) — `destinatariosConfigurados`, `carregarConfigWhatsApp`, `TEMPLATE_ALERTA`, `formatarMomento` são exportados de `admin-whatsapp.ts` e reutilizáveis diretamente. `sendWhatsAppTemplate`/`logWhatsappSend` **não são** — vêm de `@web/lib/whatsapp/send-template` e `@web/lib/whatsapp/log-send` respectivamente (correção S5 da v1.0).
- `packages/web/vercel.json` — 37 crons hoje; esta story não adiciona nenhum.
- `supabase/migrations/218_system_events_dedupe_nicole.sql` — índice reusado, sem migration nova. Última migration: `248`.

### Por que três sinais, e por que cada um está numa "geração" diferente de confiabilidade (AUTO-DECISION)
[AUTO-DECISION] Repetição de conteúdo (A) + contagem (B) + modo de encerramento (C), em vez de um
único mecanismo → **reason:** medido contra 205 conversas reais/14 dias, um limite de contagem puro
em qualquer valor ≤ 11 colide com uma conversa real (o controle negativo); a repetição de conteúdo teve 0
falso positivo mesmo em janela de 24h, dentro das 54 conversas elegíveis. **[CORRIGIDO na 2ª rodada do @po — os rótulos de confiança estavam invertidos.]** A v1.1 dizia
"A e B são estruturais e medidos; C é semântico e não mensurável". Medido em 90 dias, é o oposto
no ponto que importa: **C tem 0 falso positivo e é o sinal que contém o incidente mais cedo (6ª
mensagem, contra a 11ª de A); B tinha 1 falso positivo real com o limiar de 15** (o lead de maior volume), que
por isso subiu para 25. A ordem de confiança medida é **C ≈ A > B**. Cada sinal cobre uma classe
distinta e nenhum sozinho cobre as três: A pega o bot que repete literal; C pega o bot que se
despede com texto variado (**8 das 11 mensagens do incidente eram despedidas** — o pedido literal do
dono do produto era um diagnóstico preciso, não uma aproximação); B é o backstop bruto para o bot
que não faz nem uma coisa nem outra.

### Sinal C medido (2ª rodada do @po) — o que substituiu o "não dá para medir"

A v1.1 afirmava que a taxa de falso positivo do Sinal C não podia ser medida sem ler conteúdo. **Não
é verdade:** `content ~* '(padrão|padrão|…)'` dentro de um `count(*) filter (...)` devolve só
números. Medido contra produção, read-only, sem nenhum conteúdo retornado:

| medida | 14 dias | 90 dias |
|---|---|---|
| mensagens `assistant` (sem `is_transition`) | 552 | 1.940 |
| casam `PADROES_DE_ENCERRAMENTO` | 23 (4,2%) | 41 |
| conversas com ≥1 encerramento | 13 | 13 |
| **pico de encerramentos em 30 min** | **8** | **8** |
| **conversas que o Sinal C bloquearia (≥3)** | **1 — o próprio incidente** | **1 — o próprio incidente** |
| conversas no limite (exatamente 2) | 2 | 4 |

**Zero falso positivo em 90 dias.** A margem é de 1 mensagem (as vizinhas param em 2), então é o
número a vigiar depois do deploy — mas a decisão de shipar bloqueando está lastreada, não apostada.

**União dos três sinais em 90 dias:** exatamente **duas** conversas seriam bloqueadas — o incidente
(por A e por C, independentemente) e o lead de maior volume (só por B, com o limiar antigo de 15, que
era o falso positivo agora corrigido). **Os sinais não se somam em falso positivo:** as classes que
cada um pega são disjuntas na população real, e a única colisão medida veio de um sinal só, sozinho,
com o limiar errado. Com o limiar de 25, a união bloqueia **1** conversa em 90 dias: o incidente.

### Por que Sinal C é frágil, e por que ainda vale (a pergunta que o coordenador pediu para responder)
Casamento por palavra-chave é frágil: não cobre paráfrases, gírias, erros de digitação da própria
Nicole, nem sobrevive a uma mudança de tom no prompt do sistema que reescreva a despedida de um jeito
que a lista não reconheça — silenciosamente. **Ainda vale** porque: (1) é exatamente o que foi
pedido, e a alternativa (esperar o validador semântico geral da Onda 3, que não existe) deixaria o
pedido original sem resposta por tempo indeterminado; (2) o dano de um falso positivo é um handoff
para humano — recuperável, não uma mensagem perdida ou uma alucinação; (3) a lista é uma constante
nomeada, versionada e extensível — ajustar é uma linha, não um redesenho; (4) T1.7 exige uma
checagem de sanidade manual antes do merge, que shadow mode nenhum substituiria com o mesmo custo.
Foi cogitado subir o Sinal C em modo sombra (só loga, não bloqueia) até calibrar com dado real — o
padrão que o resto do Epic 87 usa para regras semânticas (W2-3/W3-1). **Não foi essa a decisão**: o
dono do produto, ciente da fragilidade, optou por bloqueio direto porque é o que ele pediu
originalmente. Registrado aqui para quem ler depois entender que a alternativa mais cautelosa foi
considerada e descartada por decisão explícita, não por omissão.

### Por que `bloqueadoPorLoop` é um campo novo, e não o `handoff` que já existe (AUTO-DECISION)
[AUTO-DECISION] Campo próprio no retorno de `processMessageWithMetadata`, não reuso de
`ProcessMessageResult.handoff` → **reason:** `handoff` já é populado de verdade
(`pipeline.ts:1919-1929`, a partir de `handoffResult.trigger`) para um propósito diferente —
qualificação de lead pronta para corretor. Hoje nenhum caller o lê (achado colateral, não desta
story), mas ele TEM semântica própria e um dono real no código. Reusá-lo para "bloqueei o envio por
loop" criaria uma colisão: o dia em que alguém ligar a leitura de `handoff` para o propósito
original, qualquer turno com Sinal A/B/C disparado seria lido como "lead qualificado", errado. Um
campo novo (`bloqueadoPorLoop`) custa uma linha de tipo e elimina a colisão.

### Por que ampliar `alertarAdminWhatsApp` em vez de copiar (AUTO-DECISION, corrige S6 da v1.0)
[AUTO-DECISION] Ampliar a assinatura existente (`tipo: TipoErroIA` → `motivo: string`) → **reason:**
a v1.0 desta story propunha um módulo novo (`loop-bot.ts`) espelhando `alertarAdminWhatsApp` quase
linha a linha — mesmo `Promise.allSettled`, mesmo `logWhatsappSend`, mesmo try/catch, diferindo só
na string do parâmetro. Cópia é onde instrumento cego mora: um bug corrigido num lado não se propaga
para o outro. Ampliar preserva a AUTO-DECISION original (transporte sim, classificador não — o
`TipoErroIA` continua vivendo só em `erro-ia.ts`) e faz o único caller existente (87-19) e o novo
(esta story) compartilharem exatamente o mesmo código testado.

### Ordem de checagem: contagem antes do modelo, conteúdo e encerramento depois
Sinal B só depende de mensagens já persistidas — roda ANTES de chamar a Anthropic (AC15), cortando
custo numa conversa que já vai ser cortada. Sinais A e C dependem do texto candidato — rodam depois
de gerar e sanear `assistantMessage`, no mesmo ponto onde `detectSlotMismatch` já roda hoje, e
**antes** de qualquer bloco que crie efeito colateral (calendário, agenda, `leads`).

---

## Testing

### Unitários (obrigatórios)
- `packages/ai/src/flows/loop-breaker.test.ts` — AC1 (bloqueia na 3ª, não na 1ª/2ª), AC2 (contagem
  ≥15/10min dispara; 14 não dispara), AC3 (mensagem de encerramento com texto DIFERENTE a cada vez
  ainda bloqueia na 3ª; mensagem que não casa nenhum padrão nunca dispara o Sinal C), AC4 (fixture
  com `isTransition:true` — dentro do PRÓPRIO tipo da função — não conta em nenhum dos três sinais),
  AC7 (fixture real do incidente: dispara exatamente na tentativa de reenviar `H16` pela 3ª vez
  = 11ª mensagem; resultado declarado "10 enviadas"), AC8 (fixture real do controle negativo: zero disparos).
- `packages/web/src/lib/logger-projecao.test.ts` ou teste de integração equivalente — AC4, segunda
  metade: a consulta de T2.1 projeta `metadata` no `.select()` (não um teste da função pura — um
  teste que falharia se alguém remover `metadata` da lista de colunas selecionadas).
- `packages/ai/src/chat/pipeline.test.ts` (ou arquivo dedicado) — T2.5: ao disparar, nenhuma das 7
  escritas listadas no AC5 acontece (spies/mocks); `conversations` recebe os 3 campos do AC6, com
  `await` confirmado (não apenas chamado); retorno tem `bloqueadoPorLoop` preenchido e `response: ""`.
- `packages/web/src/app/api/webhook/whatsapp/route.test.ts` — T2.6: `bloqueadoPorLoop` presente →
  `logEventOnce` é aguardado (não `logEvent`) e o bloco de envio/typing-delay/mídia NÃO roda;
  ausente → fluxo atual preservado, `response` tratada como string normalmente.
- `packages/web/src/lib/alerts/admin-whatsapp.test.ts` (arquivo existente, ampliado) — assinatura
  nova com `motivo: string`; caller da 87-19 continua passando o texto certo via
  `MOTIVO_POR_TIPO[tipo]`; env vazia não envia e não lança; 1 destinatário falhando não impede os
  demais.
- `packages/web/src/app/api/cron/nicole-health/route.test.ts` — branch novo: evento
  `NICOLE_LOOP_DETECTADO` dispara alerta com link da conversa no `{{1}}`; `logEventOnce` com
  `inserted:false` não reenvia na mesma hora; branch de erro de API de IA (87-19) continua
  funcionando sem regressão.
- `packages/web/src/lib/broker/broker-takeover-status.test.ts` ou teste de rota — AC14/T5.2:
  `handoff_reason="loop_bot_detectado"` não reativa após 24h+; `handoff_reason="broker_reply"`
  reativa normalmente (controle negativo — prova que a mudança é restrita ao caso novo).

### Mutação (disciplina obrigatória do projeto)
- Mutante `LOOP_REPEAT_MAX_SENDS: 2 → 99` → AC1/AC7 vermelhos.
- Mutante `LOOP_COUNT_MAX`/`LOOP_COUNT_WINDOW_MIN` neutralizados (condição sempre falsa) → AC2
  vermelho (cobre o S8 da v1.0 — a lista de mutação anterior não cobria o Sinal B).
- Mutante `LOOP_COUNT_MAX: 25 → 15` (o valor falsificado da v1.1) → precisa existir um caso que
  fique vermelho: fixture com 19 mensagens distintas em 10 min (o perfil do lead de maior volume) **não**
  pode ser bloqueada. Sem esse teste, nada impede o limiar de voltar a 15 num refator.
- Mutante que remove `handoff_reason` da projeção do `.select()` de T5.1 → o teste de projeção do
  T5.2(b) vermelho. **Este é o mutante que a v1.1 não conseguia expressar** — e sem ele o AC14
  inteiro é um no-op verde.
- Mutante que remove `PADROES_DE_ENCERRAMENTO` do teste (lista vazia) → AC3 vermelho.
- Mutante que remove o filtro de `isTransition` do TIPO (não só do chamador) → AC4 vermelho.
- Mutante que remove `metadata` da projeção do `.select()` de T2.1 → o teste de projeção (segunda
  metade do AC4) vermelho — este é o mutante que a v1.0 não conseguia nem expressar.
- Mutante que troca `await logEventOnce` por `logEvent` (não aguardado) no ponto de bloqueio →
  precisa existir um teste capaz de reprovar (ex.: mock que resolve a promise depois do assert).
- Mutante `NICOLE_LOOP_BREAKER_OFF` ignorado → AC12 vermelho.
- Mutante que remove o guard de AC14 (reativa mesmo com `loop_bot_detectado`) → T5.2 vermelho.
- Documentar os resultados no Dev Agent Record.

### Validação (disciplina obrigatória do projeto)
- ✅ Verificar por **exit code**, nunca por `grep -c`.
- ✅ `timeout` não existe no macOS por padrão.
- ✅ Todo teste novo precisa ser capaz de reprovar — ver vermelho antes de implementar.
- ✅ `npm run lint` e `npm run typecheck` limpos antes do gate.

### Validação em produção (após deploy, antes de fechar a story)
1. Confirmar `NICOLE_LOOP_BREAKER_OFF` ausente/`0` em produção.
2. `GET /api/cron/nicole-health?dry=1` — conferir o branch novo no summary sem disparar envio.
3. **A conversa do incidente É a validação em produção (AC16):** conferir se segue `is_ai_active=false`
   (nenhuma ação necessária) OU, se reativou, confirmar que o AC14 a mantém contida na próxima
   tentativa de reativação — não apenas que o Sinal A a recontém.

---

## CodeRabbit Integration

Review automático roda pelo GitHub App no PR (`.coderabbit.yaml`, `base_branches: [main]`). Achado
do bot não bloqueia merge por si só e não precisa ser reportado ao usuário, salvo defeito vital
verificado no código.

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-30 | 1.0 | Story criada a partir do incidente real (Nicole em loop com outro bot, contido manualmente). Números remedidos contra o banco (22/11, não 21/10). Desenho de dois sinais (repetição + contagem) calibrado com 203 conversas/14 dias e um controle negativo real. | @sm (River) |
| 2026-08-30 | 1.8 | **Correção da QA-87-20-6 + 2 acertos de registro + a 3ª linha da tabela de irmãos (@dev), escopo mínimo — nenhuma AC, nenhum limiar e nenhum veredito mudaram; gate segue `CONCERNS` não bloqueante, liberado.** **O conserto (único item de código):** o grito `NICOLE_LOOP_CONTENCAO_FALHOU` que a v1.7 acrescentou **não tinha destinatário** — reproduzi a medição do @qa: `coletarLoops` filtra por `NICOLE_LOOP_DETECTADO` e não casa o grito; o branch de erro do mesmo cron passa toda `message` por `classificarErroIA`, que casa 8 assinaturas de API de IA e devolve `null` para a frase dele (`if (!tipo) continue`, descartado); e o `{{1}}` que chega ao admin era **CONSTANTE**. O admin recebia a **mesma frase** quer a Nicole tivesse sido contida, quer a contenção tivesse falhado — a verdade existia só no `metadata` do recibo, e `system_events` não tem tela. Mesma família do defeito que a story ataca. Correção onde o texto nasce e em mais lugar nenhum: `LoopAgregado.contencaoConfirmada`, alimentado por `meta.contencao === "aplicada"` — **o mesmo predicado do escritor, na mesma polaridade**, com **ausência não confirmando** (tratar ausência como sucesso reintroduziria no LEITOR o defeito que o campo obrigatório matou no ESCRITOR) — agregação **fail-closed** por conversa, e o `motivo` com dois braços: o contido **byte-a-byte o de antes**, o não confirmado dizendo `a CONTENÇÃO FALHOU: a Nicole segue ATIVA — pause a conversa à mão em {link}`. **Sem `event_type` novo, sem severidade nova, sem branch novo e sem 4º parâmetro no template aprovado.** **Carrasco escrito ANTES:** vermelho inicial 🔴 **3 / 3.808**, e **4 mutantes, 4 vermelhos**, todos com `tsc --noEmit` rc=0 antes da contagem — M-CR6a (o obrigatório: `motivo` volta a ser constante) 🔴 3, **M-CR6b controle negativo** (`motivo` sempre grita) 🔴 2, matando inclusive um teste **pré-existente**, M-CR6c (ausência vira sucesso) 🔴 1 e M-CR6d (agregação fail-open) 🔴 1 — os três últimos com kill sets **disjuntos**. **Falso-verde meu, declarado:** a 1ª fixture do caso "sem `contencao`" passava `undefined`, e parâmetro com default recebe o default quando o argumento é `undefined` — a fixture gerava `"aplicada"` e o teste media a fixture; virou o rótulo `"ausente"`. **Dois acertos de REGISTRO na v1.7** (apontados pelo @qa, sem risco de dado): "R1 = 4 valores distintos" contradizia a seção 10 do mesmo commit — o certo é **5**; e "0 linhas adicionadas com token de 8 hex" era **falso** (são 3, todas autorreferência ao commit-tip, a classe benigna que o próprio registro declara duas linhas acima). Ambas reescritas para contar **valores distintos NÃO TRIADOS**, não ocorrências brutas — a formulação que torna a régua imune a si mesma. **3ª linha da tabela de irmãos** (QA-87-20-5, opcional, aceita): a LEITURA de `coletarLoops` (`if (error || !data) return []`) falha **ABERTA** e é **código NOVO desta story**, não dívida herdada como as outras duas — declarada, não consertada, com o raio medido (1 ciclo de 10 min; a janela de 15 min sobrepõe, e a contenção não depende do cron — AC11). Registrado também que meu predicado de varredura foi "escritas" enquanto a classe que eu mesmo nomeei inclui **leituras**. **Declarado e não ampliado:** o `message` do recibo `NICOLE_LOOP_ALERTA` ainda diz "contido" no caso que falhou — mesma classe, custa um ternário, devolvido ao coordenador em vez de consertado em silêncio. **Suíte 289 arq · 3.802 · 6 xfail** rc=0 (+3 sobre 3.799; xfail inalterado), `lint --force` rc=0, `type-check --force` rc=0, `packages/web build` rc=0. **Higiene reexecutada: 0 valores distintos não triados.** Sem push, sem PR, sem merge, produção não tocada, a conversa contida **não despausada**. | @dev (Dex) |
| 2026-08-30 | 1.7 | **Correção dos 2 achados do CodeRabbit no PR #535 (@dev), escopo mínimo — nenhuma AC, nenhum limiar e nenhum veredito mudaram; gate segue `CONCERNS` não bloqueante.** **Achado 1 (não cosmético):** `conterLoop` (`pipeline.ts`) **ignorava o `error`** do `UPDATE` de contenção — o PostgREST não rejeita, devolve `{ data: null, error }` — e devolvia `bloqueadoPorLoop` de qualquer jeito. Era o pior estado possível escondido dentro da própria correção: recibo gravado e admin avisado de que a Nicole tinha sido pausada, com `is_ai_active` ainda `true`, `handoff_reason` vazio, o guard do AC14 sem o que casar e a próxima mensagem do bot reiniciando o loop — **o mecanismo relatando um estado que não verificou ter alcançado**, que é literalmente o defeito que esta story existe para eliminar. Correção: `contencao` virou campo **obrigatório e discriminante** (`"aplicada" | "falhou"`, com `erro` = a mensagem do banco) **dentro** de `bloqueadoPorLoop` — obrigatório porque booleano opcional teria default, e o default seria "deu certo"; dentro porque é `bloqueadoPorLoop` que faz o webhook pular o envio, e o envio tem de ser pulado nos dois casos. O webhook passou a **gritar**: `NICOLE_LOOP_CONTENCAO_FALHOU`, nível `error`, com o motivo do banco e `await logEventOnce`, porque nesse caminho um humano precisa ir pausar à mão; o recibo canônico continua saindo (é ele que o cron varre para o AC10) mas deixou de afirmar "Nicole pausada" quando ela não foi. **Sem `try/catch` que só loga e segue — isso reproduz o defeito com mais linhas.** Carrasco escrito ANTES (`failOn` injetando `error` só no `update:conversations`): vermelho medido `2 failed | 21 passed (23)` antes da correção. **4 mutantes, 4 vermelhos**, um deles controle negativo (o grito sem guarda, `if (true)`) — todos 🔴 1/3.805 com `tsc` rc=0. **Achado 2:** o filtro do kill-switch comparava `s.cols` com o **literal** do `.select()`; reordenar colunas fazia `toHaveLength(0)` passar **vazio** — cego para o defeito que ele mira. Adotada a forma resistente da linha 409 do próprio arquivo (`split(",")`+`trim`), extraída em `colunasDe()` e compartilhada pelos dois pontos, comparando por **conjunto** (o histórico da 87-8 também projeta `metadata` e um filtro por pertinência daria falso-vermelho), mais um **controle de vivacidade** que exige o mesmo filtro achar a consulta com a trava ligada. **Prova em 2 × 2 medido:** filtro antigo + mutação que reintroduz a consulta **e reordena o `.select()`** = 🟢 3.798 rc=0 (**cego**); filtro novo, mesma mutação = 🔴 1/3.805; ambos 🔴 contra a mutação ingênua — o filtro antigo é cego **só** ao refator de projeção, e declarar mais que isso seria mais forte que a medição. **Varredura da classe, declarada e não consertada:** o `UPDATE` de reativação de 24h (pré-existente na `main`, 63-13/63-15) e o `.delete()` de compensação do cron (irmão idêntico do da 87-19, já na `main`) ignoram o `error` pela mesma razão — consertar um e não o gêmeo na mesma função seria pior que declarar os dois. **Suíte 289 arq · 3.799 · 6 xfail rc=0** (+9 testes sobre o baseline de 3.790; xfail inalterado), `lint --force` rc=0 (0 erros, 30 warnings pré-existentes), `type-check --force` rc=0, `packages/web build` rc=0. **Higiene reexecutada:** R1 = **5** valores distintos e **0 valores não triados** — os 4 já triados **mais o commit-tip desta branch**, que é commit público e aparece porque este próprio registro o cita; R2 = 0; R3 = 29 (idêntico); e **0 linhas adicionadas** com data-hora, telefone, e-mail ou token de 8 hex **não triado**. *(Duas imprecisões desta linha corrigidas na v1.8, ambas apontadas pelo @qa e ambas de REGISTRO, sem risco de dado: a v1.7 dizia "R1 = 4" e contradizia a seção 10 do mesmo commit, que diz 5; e "0 linhas com token de 8 hex" era falso — são 3, todas autorreferência ao commit-tip. A régua agora conta **valores distintos não triados**, não ocorrências brutas, que é o que a torna imune a si mesma.)* Sem push, sem PR, sem merge, produção não tocada, a conversa contida **não despausada**. | @dev (Dex) |
| 2026-08-30 | 1.5 | **Expurgo de identificadores de cliente (@dev), redação MECÂNICA — nenhuma AC, nenhum comportamento e nenhum veredito mudou; gate segue `CONCERNS` não bloqueante, liberado.** O repositório é público e a árvore carregava 7 conversas reais em 10 arquivos (~79 ocorrências de prefixo de 8 hex + 1 UUID completo em 5 arquivos, inclusive numa URL de `/dashboard/conversas/` e em nomes de `it()`/`describe()`, que viram saída de CI). Substitutos canônicos: `CONV_INCIDENTE`/`CONV_CONTROLE` com **UUID sintético** no código, "o incidente"/"o controle negativo"/"o lead de maior volume" na prosa, **deslocamentos relativos** (`T+0s` … `T+307s`) no lugar dos 34 `created_at` da fixture e das tabelas mensagem-a-mensagem, e "24h após a contenção" no lugar da janela de reativação datada. **Todos os agregados sobreviveram inteiros** — 1 em 90 dias, 472 de 473, picos 3/19/8, limiar 25 com 32% de margem, 8 de 11 despedidas, 6ª contra 11ª, 2m22s (que segue medindo o intervalo real, `T+165s`→`T+307s` = 142 s). **Varredura final da File List inteira com resultado ZERO** (comando registrado na seção 9 do Dev Agent Record), e `git grep` na `origin/main` confirma 0 arquivos para 6 dos 7 prefixos — o sétimo já existia na `main` (story 87-10), **dívida pré-existente fora de escopo, não piorada e não repetida**. **Remedido depois do expurgo:** suíte **289 arq · 3.790 · 6 xfail** rc=0 (idêntica ao baseline), `lint --force` rc=0, `type-check --force` rc=0, e **4 mutantes reexecutados com `tsc --noEmit` rc=0 antes de cada vermelho** — M8 🔴 2, M14 🔴 2/30, M22 🔴 8/24, `await`→`void logEventOnce` 🔴 1/31; os 3 arquivos de produção mutados restaurados e conferidos por hash. **Correção factual ao gate:** a forma ingênua do M14 **não compila** (TS2339 — o `.select()` narrowa o tipo da linha); o vermelho só vale com asserção de tipo, como o gate já fizera no M18. Gate e parecer do @po editados **apenas** para redação de identificador. Nada commitado, nenhum push, produção não tocada, a conversa do incidente **não despausada**. | @dev (Dex) |
| 2026-08-30 | 1.6 | **Expurgo — 3ª rodada (@dev), redação MECÂNICA; nenhuma AC, nenhum comportamento e nenhum veredito mudou; gate segue `CONCERNS` não bloqueante, liberado.** A varredura independente do @devops achou o que a minha não pegou, porque usou **método diferente**: em vez de casar contra a lista dos 7 prefixos conhecidos, **enumerou todo token de 8 hex** dos 20 caminhos da File List e triou os 32 distintos um a um. Adotei a régua dele no lugar da minha — a antiga dependia de `~/.87-20-prefixos`, arquivo **fora do repo que não existe na máquina de quem revisa**, e por isso saía verde por vacuidade. **Dois achados. (1) A base `T0` do deslocamento relativo estava publicada em 2 linhas da story** — `handoff_at + 24h` ao minuto, e a **própria tabela do expurgo** instanciando o `created_at` removido — o que reverteria todo `T+n` para hora de parede; viraram "≈24h após a contenção" (a frase precisa de **um ciclo**, não da hora) e a **classe** do dado, sem instanciar. **(2) Os 28 `left(md5(content),8)`** (53 ocorrências: 34 na fixture, 16 na story, 3 no parecer) viraram **rótulos de classe `H1`…`H28`, preservando as classes de igualdade**. O argumento da 2ª rodada para mantê-los caiu na medição: o **único** consumidor em toda a árvore é `loop-breaker.test.ts:386` (`expect(a.content === b.content).toBe(a.hash === b.hash)`), auto-consistência pura que rótulos sustentam **idêntica** — os valores eram atestado de proveniência, não carga de AC. Pior: recomputando o `md5` dos 8 textos reconstituídos, **7 divergem** (fingerprint de 32 bits de conteúdo **ausente do repositório**, oráculo de confirmação) e **1 bate**, provando que o cabeçalho da fixture era **impreciso** ao dizer que tudo era reconstituído — corrigido também. **Régua nova R3** (nenhuma data-hora absoluta com precisão de minuto nos 20 arquivos): 29 linhas, todas triadas — 13 sintéticas declaradas, 15 pré-existentes em `origin/main` arrastadas em hunk (provado por `git diff`, que só mostra as 3 sintéticas adicionadas) e 1 `updated:` de gate, metadado presente em 137 dos 250 gates. **Remedido:** suíte **289 arq · 3.790 · 6 xfail** rc=0 (idêntica ao baseline), `lint --force` rc=0, `type-check --force` rc=0, controle negativo 🟢 55/55, e **dois mutantes de classe de igualdade nos DOIS sentidos** — dividir (`H15`→`H15X`) 🔴 1/54 e fundir (`H14`→`H16`) 🔴 1/54, ambos com `tsc --noEmit` rc=0 antes do vermelho; fixture restaurada e conferida byte a byte. **Declarado: a 1ª tentativa de mutação foi um vermelho FALSO** — ponteiro de linha envelhecido pelo cabeçalho reescrito, a `sed` não casou e a suíte saiu 🟢 55/55; só contei depois de imprimir a linha mutada. **Fora de escopo, não consertado e não repetido:** os 5 telefones e o oitavo prefixo, **pré-existentes na `origin/main`**. Nada commitado, nada `git add`-ado, nenhum push, produção não tocada, a conversa do incidente **não despausada**. | @dev (Dex) |
| 2026-08-30 | 1.4 | **Correção pós-gate da concern QA-87-20-1 (@dev), única mudança pedida pelo gate `CONCERNS` — não bloqueante, já liberado.** Escopo mínimo: **só `route.test.ts`**; o `await logEventOnce` de produção está certo e **não foi tocado**. O carrasco media **relógio**, não ordem — o `entregar()` drenava ~60 ms e o duplo resolve em 5 ms, então a promise órfã de um `void logEventOnce` completava por acidente e a suíte ficava **32/32 verde**. Agora o mock de `next/server.after` **guarda** a promise do callback (`afterPromises.push(Promise.resolve().then(() => fn()))`), `drenarAfter()` espera os callbacks **terminarem** (`allSettled` em laço — a rota agenda 4 `after()` e um pode agendar outro) e o teste do recibo assere **imediatamente**. **Critério do gate atendido, remedido: as DUAS mutações vermelhas** — `→ logEvent` 🔴 2/30 e `→ void logEventOnce` 🔴 **1/31** (era 🟢 32/32), ambas com `tsc --noEmit` rc=0. `flushAsync()` deixado como está: nenhuma mutação prova que aquele ponto é cego. **Correção factual do @qa incorporada:** dos 9 testes novos do webhook, **6** executam o pipeline (os 3 do AC14 não, de propósito), e **2 pré-existentes** passaram a executar de carona — 7 de 32 com o conserto, **0 de 32** sem ele. Suíte inteira **289 arquivos · 3.790 passando · 6 expected-fail** rc=0 (idêntica ao baseline do gate); `lint --force` rc=0 (0 erros, 30 warnings pré-existentes); `type-check --force` rc=0. Nada commitado, nenhum push, produção não tocada, a conversa do incidente **não despausada**. | @dev (Dex) |
| 2026-08-30 | 1.3 | **Implementada por @dev (Dex), modo YOLO — `Ready` → `Ready for Review`.** Branch `story/87-20-loop-bot-a-bot`, criada de `origin/main` (`aa584dfb`). **Régua do @po reproduzida de forma independente e confirmada:** escrevi `PADROES_DE_ENCERRAMENTO` primeiro e traduzi para SQL depois — 41 encerramentos em 90 dias, pico 8 em 30 min, **1 conversa bloqueada pelo Sinal C (o incidente), 4 no limite, pico de contagem 19, 1 falso positivo com o limiar 15 e 0 com 25**; a classificação mensagem-a-mensagem do incidente (`enc` em 3,4,6,7,8,9,10,11 — **8 de 11**) bate byte a byte com a tabela do AC7, e é a coluna medida que ancora a fixture (a régua não é derivada da fonte). **No incidente real, com os três sinais: bloqueio na 6ª mensagem (T+165s) pelo Sinal C — 5 enviadas, não 10; com o Sinal C desligado, o Sinal A na 11ª; o Sinal B sozinho nunca.** **22 mutantes, 22 mortos**, incluindo os 10 exigidos — entre eles os dois de projeção (`metadata` em T2.1 e `handoff_reason` em T5.1, o N1). **Três instrumentos cegos consertados no caminho, nenhum previsto pela story:** os fakes de `pipeline` e de webhook ignoravam a lista de colunas do `.select()` (sem isso os dois mutantes de projeção ficariam VERDES); e — o mais grave — **a suíte do webhook nunca alcançava o pipeline da Nicole**, porque o mock não expunha `processMessageWithMetadata` e `identifyClientByContact` estourava em tabela não declarada, com o `catch (asyncErr)` da rota engolindo os dois em `WEBHOOK_ASYNC_ERROR` — verde com o caminho da IA morto, e **já era assim antes desta story**. **Achado que corrige o AC16:** o `handoff_reason` do incidente é texto livre da pausa manual, NÃO a constante `loop_bot_detectado` — então na primeira reativação (24h após a contenção) o guard do AC14 não a reconhece; ela reativa uma vez, o Sinal C a recontém gravando o motivo canônico, e só a partir daí o AC14 vale. **Um ciclo a mais do que o AC16 promete, não infinitos** — a oscilação permanente segue morta. A conversa NÃO foi despausada e nenhum SQL foi escrito em produção. Suíte: 289 arquivos, 3.790 testes passando; `lint` 0 erros; `type-check` limpo. Sem migration (AC13), sem cron novo (T3.4), `broker-takeover-status.ts` intocado. | @dev (Dex) |
| 2026-08-30 | 1.2 | **2ª rodada do @po — GO, `Draft`→`Ready`.** Parecer: `docs/qa/po-validation-87-20.md`. Os 4 bloqueantes da 1ª rodada foram **verificados como resolvidos** (B1 tipo+projeção; B2 ponto de bloqueio em ~1291, e o @po confirmou que **não há nenhuma escrita entre :537 e :1291** fora do ramo off-hours, então "nenhum efeito colateral sobrevive" é alcançável; B3 swap aprovado — `processMessage` é wrapper de 2 linhas, só 2 callers de produção; B4 link cabe nos 3 params). **4 defeitos NOVOS achados e corrigidos pelo @po nesta rodada, nas próprias correções da v1.1:** **(N1, o 21º instrumento cego)** o AC14 era **no-op** — a consulta de reativação é `.select("handoff_at")` (`route.ts:1066`) e não projeta `handoff_reason`; a story inventou o teste de projeção para o AC4 e **não o aplicou à consulta que ela mesma introduziu**; T5.1 ganhou a projeção e T5.2 ganhou a 2ª metade. **(N2)** o limiar do Sinal B estava **falsificado**: 15/10min vinha de 14 dias (pico 11); em **90 dias o pico real é 19** e o lead real de maior volume (21 msgs distintas, corretor engajado) seria cortado — limiar subido para **25**. **(N3)** AC7 e AC3 se **contradiziam no mesmo fixture**: com os 3 sinais ligados o incidente bloqueia por C na **6ª** mensagem, não por A na 11ª — AC7 reescrito com a tabela mensagem-a-mensagem medida. **(N4)** R6 era **factualmente falso** ("não há como medir sem ler conteúdo") — um regex dentro de `count(*) filter` não devolve conteúdo; medido em 90 dias: **0 falso positivo do Sinal C**, e ele contém o incidente em **5 mensagens enviadas contra 10 do Sinal A**. **Os rótulos de confiança estavam invertidos:** o sinal marcado "frágil e não mensurável" é o mais forte; o marcado "estrutural e medido" era o único com falso positivo. AC5 marcado como lista ILUSTRATIVA (a janela tem ~15 escritas, não 8; o requisito normativo é o `return` antecipado). `APP_URL`→`NEXT_PUBLIC_APP_URL` com o fallback do repo. **União dos 3 sinais em 90 dias com os limiares corrigidos: 1 conversa bloqueada — o incidente.** | @po (Pax) |
| 2026-08-30 | 1.1 | **Revisão pós-@po (NO-GO estreito 7,5/10, `docs/qa/po-validation-87-20.md`), 4 correções bloqueantes + 1 mudança de escopo por decisão do dono do produto + 5 recomendadas incorporadas.** **Mudança de escopo (decisão do dono do produto):** Sinal C (modo de encerramento) adicionado — resposta literal ao pedido original, semântico e frágil por natureza, fragilidade documentada nos Dev Notes, calibração manual antes do merge (T1.7). **B1:** `isTransition` movido para dentro do tipo das funções puras (não só filtrado no chamador) + novo teste de integração que afirma a projeção de `metadata` no `.select()` — sem isso o AC4 não conseguia expressar nem detectar o próprio defeito que existe para impedir (precedente citado pelo @po: Story 900-23, "o carrasco do `select` nasceu cego"). **B2 (o mais grave):** ponto de bloqueio corrigido de "antes de `saveMessages`" (linha 1829, 540 linhas depois de `createCalendarEvent`/`APPOINTMENT_CREATED`/patch de `leads`) para o `return` antecipado em ~1291, junto de `detectSlotMismatch` — a v1.0 deixaria agenda marcada no Google Calendar e corretor notificado por uma mensagem nunca recebida pelo lead. AC5 reescrito como lista explícita de 7 efeitos colaterais que não podem sobreviver. **B3:** evento `NICOLE_LOOP_DETECTADO` deixa de depender do canal fire-and-forget `emit()`/`onEvent`→`logEvent` (que o próprio `logger.ts` alerta contra usar quando o evento é a última escrita antes do response) — novo campo `bloqueadoPorLoop` no retorno de `processMessageWithMetadata` (não reuso do campo `handoff` já existente, que tem semântica diferente — qualificação de lead), lido pelo webhook para disparar `await logEventOnce`. Exige trocar o call-site do webhook de `processMessage` para `processMessageWithMetadata` (Telegram, que usa a mesma variante string-only, fica fora de escopo por ser canal de staging — documentado no OUT). **B4:** alerta ganha "onde olhar" — `motivo` passa a carregar um link direto para `/dashboard/conversas/{id}` dentro do único parâmetro livre do template aprovado (3 params fixos; um 4º quebra o envio, medido na 900-23). **S2:** Context/AC7 corrigidos — a trava pega a 11ª e ÚLTIMA mensagem real (T+307s, 47s antes da intervenção humana), reduzindo o loop de 11 para 10 mensagens enviadas, não "cedo". **S3:** denominador do controle negativo corrigido de 205→54 conversas elegíveis (só as com ≥3 msgs da Nicole podem, em tese, produzir um positivo do Sinal A). **S4:** novo AC14 — guarda de 3 linhas no chamador da reativação de 24h (webhook, não a 63-13/63-15) impede oscilação permanente (reativa→zera contador→repete→bloqueia→reativa, para sempre) que a v1.0 não cobria. **S5:** corrigida alegação factual errada sobre exports de `admin-whatsapp.ts`. **S6:** `alertarAdminWhatsApp` ampliado (`tipo`→`motivo: string`) em vez de copiado num módulo novo. **S9:** AC16 formaliza a decisão de manter a conversa do incidente pausada como a própria validação em produção. Todas as medições da v1.0 foram reproduzidas de forma independente pelo @po (inclusive sob régua mais dura — `btrim()`, janelas até 24h) e confirmadas ou reforçadas; nenhuma remedição de dado foi necessária. | @sm (River) |

---

## Dev Agent Record

**Agent Model Used:** Claude Opus 5 (1M) · @dev (Dex) · modo YOLO · 2026-08-30
**Branch:** `story/87-20-loop-bot-a-bot`, criada de `origin/main` (`aa584dfb`)

---

### 1. O que foi medido contra produção antes de escrever uma linha

Só leitura, agregados e metadados, pela Management API (`dsopqkqjkmhytudaaolv`). Nenhum
`content`, telefone ou nome saiu do banco — `length()`, `md5()`, `created_at` e um predicado
regex dentro de `count(*) filter (…)`.

**A régua do @po foi reproduzida de forma independente e bate.** Escrevi
`PADROES_DE_ENCERRAMENTO` primeiro, traduzi para SQL depois, e comparei com a tabela do AC7:

| medida (90 dias) | @po (2ª rodada) | esta reexecução |
|---|---|---|
| mensagens que casam encerramento | 41 | **41** |
| pico de encerramentos em 30 min | 8 | **8** |
| conversas que o Sinal C bloquearia | 1 (o incidente) | **1 (o incidente)** |
| conversas no limite (exatamente 2) | 4 | **4** |
| pico de contagem em 10 min | 19 | **19** |
| conversas cortadas pelo Sinal B com limiar **15** | 1 (o lead de maior volume) | **1 (o lead de maior volume)** |
| conversas cortadas pelo Sinal B com limiar **25** | 0 | **0** |
| conversas cortadas pelo Sinal A | 1 (o incidente) | **1 (o incidente)** |
| **união dos três, limiares vigentes** | 1 | **1 — o incidente** |

Classificação mensagem a mensagem do incidente, direto do banco: `enc` verdadeiro em
**3, 4, 6, 7, 8, 9, 10, 11** — idêntica à tabela do AC7. **8 das 11.** É a âncora do teste
"`PADROES_DE_ENCERRAMENTO` reproduz a classificação medida no banco": a coluna `enc` da
fixture veio da consulta, não do código, então a régua não é derivada da fonte.

**Duas divergências de denominador, ambas não-bloqueantes:** o @po registrou 1.940 mensagens
`assistant` em 90 dias e 13 conversas com ≥1 encerramento; medi **1.768** e **28**. O
denominador desliza (janela relativa a `now()`) e o "13" aparece idêntico nas colunas de 14 e
90 dias do parecer — provável repetição do valor de 14 dias. **Nenhum número de bloqueio
diverge**, que é o que decide o desenho.

A régua ficou versionada e reexecutável em **`docs/qa/87-20-regua-sinais-loop.sql`** (T1.7),
com os números medidos no cabeçalho. `bloqueadas_sinal_b_15` ficou na consulta de propósito:
é o carrasco histórico do limiar.

---

### 2. Em que mensagem cada sinal dispara no incidente real

Reprodução mensagem a mensagem da fixture do incidente (teste `reproduzir()`):

| sinais ligados | bloqueia na | enviadas | por |
|---|---|---|---|
| **A + B + C (produção)** | **6ª — T+165s** | **5** | **Sinal C** |
| A + B (Sinal C desligado) | 11ª — T+307s | 10 | Sinal A |
| B sozinho | nunca | 11 | — |

**2m22s de diferença** entre o ponto do C e o do A, afirmado no teste em segundos (142).
O Sinal B nunca teria contido este incidente: 11 mensagens em 10 min, contra o limiar de 25.

Controle negativo (11 mensagens da Nicole em 5 min, todas distintas): **nenhum dos
três dispara**.

---

### 3. Vermelho → verde, com números

| suíte | testes |
|---|---|
| `packages/ai/src/flows/loop-breaker.test.ts` | **55** |
| `packages/ai/src/chat/pipeline-loop-breaker.test.ts` | **19** |
| `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` | 32 (**+9** desta story) |
| `packages/web/src/app/api/cron/nicole-health/route.test.ts` | 32 (**+12** desta story) |
| `packages/web/src/lib/alerts/admin-whatsapp.test.ts` | 15 (**+2** desta story) |
| **suíte inteira** | **289 arquivos · 3.790 passando · 6 expected-fail** |

`pnpm lint`: 0 erros, 30 warnings (todos pré-existentes, nenhum em arquivo desta story).
`pnpm type-check`: limpo nos 8 pacotes.

**Vermelhos reais vistos durante a implementação** (não mutação — falhas de verdade):

1. `escritas(fake)` acusou `rpc:match_knowledge` — o RAG roda antes do ponto de bloqueio. É
   leitura; passou a ser excluída **pelo nome**, não pelo prefixo `rpc:`, para uma RPC nova
   que escreva não entrar escondida na lista.
2. A asserção "o `collected_data` continua com `agenda_state`" falhou: o pipeline manipula o
   objeto **em memória** e o fake compartilha a referência da fixture. Trocada por asserção
   sobre a CHAMADA (`update:conversation_state` nunca acontece) — "o objeto mudou" não
   distingue escrita de mutação local.
3. Os três primeiros testes do webhook falharam porque **o pipeline nunca era alcançado** —
   ver a seção 5 (achado colateral).

---

### 4. Mutação — 22 mutantes, 22 mortos

Todos aplicados no código de PRODUÇÃO, revertidos ao final. Os 10 exigidos pela story estão
cobertos (M1, M2/M4, M3, M14, M5, M6, M8, M16, M11, M15); os outros 12 são acréscimos.

| # | mutante | veredito |
|---|---|---|
| M1 | `LOOP_REPEAT_MAX_SENDS: 2 → 99` | 🔴 13 testes |
| M2 | Sinal B neutralizado (condição sempre falsa) | 🔴 3 |
| M3 | `LOOP_COUNT_MAX: 25 → 15` (o valor falsificado) | 🔴 2 |
| M4 | `LOOP_COUNT_WINDOW_MIN: 10 → 0` | 🔴 4 |
| M5 | `PADROES_DE_ENCERRAMENTO` = lista vazia | 🔴 6 |
| M6 | filtro de `isTransition` removido da FUNÇÃO PURA | 🔴 4 |
| M7 | normalização para minúsculas removida | 🔴 17 |
| M8 | **`metadata` fora da projeção do carregador (T2.1)** | 🔴 2 |
| M9 | `.eq("role","assistant")` removido do carregador | 🔴 1 |
| M10 | bloqueio deixa de ser `return` antecipado ("flag e segue") | 🔴 7 |
| M11 | kill-switch ignorado | 🔴 2 |
| M12 | Sinal B roda depois do modelo (AC15 perdido) | 🔴 1 |
| M13 | contenção não grava `handoff_reason` | 🔴 1 |
| M14 | **`handoff_reason` fora da projeção da reativação (o N1)** | 🔴 2 |
| M15 | guard do AC14 removido | 🔴 1 |
| M16 | `await logEventOnce` → `logEvent` (fire-and-forget) | 🔴 2 |
| M17 | `return` do caminho bloqueado removido (envia string vazia) | 🔴 1 |
| M18 | call-site volta para o wrapper `processMessage` | 🔴 4 |
| M19 | `.eq("event_type")` removido do coletor de loops | 🔴 1 |
| M20 | `dedupe_key` sem a conversa | 🔴 2 |
| M21 | link da conversa sai do `motivo` | 🔴 3 |
| M22 | branch de loop não roda quando não há erro de IA | 🔴 8 |

**M18 foi refeito.** A primeira versão derrubou os 32 testes do arquivo — sinal clássico de
erro de compilação, não de vermelho. Refeito em três partes (import + call-site + declaração
tipada de `bloqueadoPorLoop`), **confirmado `tsc --noEmit` com rc=0 ANTES de rodar a suíte**,
e o vermelho ficou nos 4 testes certos. Vermelho só vale depois de excluir o erro de
compilação; os outros 21 tiveram falhas PARCIAIS, o que prova que o arquivo executou.

---

### 5. Três instrumentos cegos encontrados e consertados no caminho

Nenhum estava na story. Os três eram do tipo "o teste passa porque não mede".

**(a) O fake de `pipeline` ignorava o `.select()`.** `fake-supabase.ts` aceitava a lista de
colunas e devolvia a linha inteira. Sem projeção real, o mutante M8 (tirar `metadata` do
`select`) ficaria VERDE e a exclusão da fala do corretor viraria no-op silencioso — o defeito
exato que o AC4 existe para impedir. O fake passou a projetar de verdade (`parseProjecao` +
`projetar`) e a registrar o argumento literal em `fake.selects`. **As duas metades:** o
narrowing é o que tem dente; a asserção literal é a que diz QUAL consulta perdeu a coluna.
Rodei os 46 arquivos de teste do `packages/ai` depois da mudança: nenhuma regressão.

**(b) O mesmo defeito no fake do webhook** — e ali ele era o carrasco do AC14 inteiro. Mesmo
conserto (`selectsPorTabela` + projeção real).

**(c) 🔴 O mais grave: a suíte do webhook NUNCA alcançava o pipeline da Nicole.** Duas causas
somadas:

  - o mock de `@trifold/ai` só expunha `processMessage`; depois da troca de call-site,
    `processMessageWithMetadata` era `undefined`, a chamada estourava `is not a function` e o
    `catch (asyncErr)` da rota convertia isso num `WEBHOOK_ASYNC_ERROR` — **suíte verde, com o
    caminho da IA morto**;
  - antes disso, `identifyClientByContact` (76-2) consultava tabelas que o `freshDb` nunca
    declarou; `db[table]` vinha `undefined` e `applyFilters` estourava no `.slice()`, também
    engolido pelo mesmo `catch`. **Isso já era verdade ANTES desta story** — nenhum dos 31
    testes do arquivo tocava o pipeline, e nada denunciava.

  Consertos: mock com `processMessageWithMetadata` sobrescrevível por teste, tabela ausente
  vira lista vazia, e `NICOLE_ANTI_RAJADA_MS=0` / `calculateTypingDelay → 0` para a suíte
  atravessar os dois `setTimeout` do caminho real.

  **Correção de número (medida pelo @qa, instrumentando o mock para registrar o nome do teste a
  cada chamada):** eu escrevi "os 9 testes novos são os primeiros deste arquivo a executar o
  pipeline". O certo é **7 de 32**: dos **9 testes novos, 6 executam** o pipeline — os 3 do AC14
  **não executam de propósito**, porque a conversa está pausada e o guard barra antes — e **2
  pré-existentes** (75-222 e 75-289) passaram a executar **de carona**. Com o conserto revertido:
  **0 de 32**, com 29 ainda verdes. Ou seja, o arquivo era **100% cego** ao caminho da IA.

Também: `enviosDeMensagem()` não pode filtrar só pela URL — o indicador de "digitando…"
(75-156) usa o MESMO endpoint `/messages`, com `type: "typing_indicator"`. Um teste que
contasse URLs veria o typing como envio e "não enviou nada" nunca poderia ficar verde.

---

### 6. Decisões autônomas

**[AUTO-DECISION] `LOOP_BOT_HANDOFF_REASON` entra em `route.ts` por caminho PROFUNDO**
(`@trifold/ai/src/flows/loop-breaker`), não pelo barrel → **reason:** o barrel arrasta o SDK
da Anthropic e todos os flows; é exatamente por isso que o pipeline é carregado por
`await import()` dentro do caminho assíncrono. O guard do AC14 roda no caminho SÍNCRONO, a
cada mensagem inbound. `loop-breaker.ts` é puro e sem dependências. O precedente existe no
repo (`@trifold/ai/src/chat/__fixtures__/fake-supabase`, `@trifold/ai/src/prompts/snapshot`).
A constante também foi exportada pelo barrel, para quem puder pagar.

**[AUTO-DECISION] AC5 medido pelo MECANISMO, não pela lista** → **reason:** a asserção
principal é `escritas(fake) === ["update:conversations"]` — a ÚNICA operação não-leitura do
turno bloqueado. Uma lista de 8 nomes passaria com "flag e pula depois" e vazaria as outras 7
escritas da janela (o M10 prova: com o `return` virando chamada solta, 7 testes ficam
vermelhos). As asserções nomeadas do AC5 ficaram ao lado, como documentação legível.

**[AUTO-DECISION] O par bloqueado × não-bloqueado usa o cenário de AGENDAMENTO da 75-279**
→ **reason:** "nenhuma escrita aconteceu" não prova nada se o cenário não escreveria nada de
qualquer jeito. Com o kill-switch ligado, o MESMO turno cria `appointments`, chama o Google
Calendar, emite `APPOINTMENT_CREATED` (push ao corretor), insere `activities` e avança o lead
para "Visita Agendada". Com a trava armada, nada disso acontece.

**[AUTO-DECISION] `contarEnviosNaJanela` exportada** → **reason:** T1.4 fixa
`detectarLoopPorContagem(): boolean`, mas o `metadata` do evento precisa do NÚMERO. Recontar
no `pipeline.ts` criaria uma segunda definição de "janela" que diverge desta no primeiro
refator. O predicado de contagem passou a ser um só, usado pelos dois.

**[AUTO-DECISION] O conteúdo das fixtures é RECONSTITUÍDO; os números são medidos** →
**reason:** a regra de investigação proíbe extrair conteúdo de produção. Os testes afirmam,
linha a linha: o `length(content)` exato, a estrutura de repetição (`md5` igual ⇔ texto igual)
e a classificação de encerramento medida no banco. O lado `user` é opaco (só o comprimento é
preservado) porque nenhum sinal desta story olha para ele — depender dele seria medir a coisa
errada. Declarado no cabeçalho do arquivo de fixtures.

**[AUTO-DECISION] O fake do cron passou a honrar `.eq()`** → **reason:** a rota tem DUAS
consultas a `system_events` (a de `level='error'` da 87-19 e a de `event_type` desta story).
Um fake cego aos filtros deixaria passar verde a remoção de qualquer um deles — a chamada
existe, o argumento foi neutralizado. Com o conserto, o M19 morre.

---

### 7. ⚠️ O que NÃO consegui provar, e um achado que muda o AC16

**🔴 ACHADO — o `handoff_reason` do incidente NÃO casa com `LOOP_BOT_HANDOFF_REASON`.**
Medido em produção, read-only:

```
is_ai_active   false
handoff_at     T_contencao   (1,55 h antes da medição)
handoff_reason texto livre da pausa manual — 85 caracteres, NÃO a constante
```

O motivo é texto livre da contenção manual; a constante é `"loop_bot_detectado"`. **O AC16
diz "se reativar DEPOIS do deploy, o AC14 impede que ela reative de novo, ponto" — e isso
não se sustenta na primeira reativação.** O comportamento real, com o fix em produção:

1. **≈24h após a contenção** (um ciclo de reativação) a conversa reativa — o guard não reconhece
   o motivo manual;
2. se o outro bot voltar a falar, a Nicole responde, e o **Sinal C** a contém na 3ª despedida
   (5 mensagens no incidente original; aqui, menos, porque a janela começa do zero);
3. a contenção grava o motivo CANÔNICO — e **a partir daí o AC14 vale e ela não reativa mais**.

Ou seja: **um ciclo a mais do que o AC16 promete, e não infinitos.** A oscilação permanente
continua morta. Não corrigi o registro no banco: seria escrita em produção, e o AC16 é
explícito ("sem despausar, sem SQL adicional"). **Fica como decisão do @po/@devops** se vale
um `UPDATE` de uma linha antes do deploy para ganhar esse ciclo.

**Não provado, e por quê:**

- **O Telegram** (`telegram/webhook/route.ts:514`) continua chamando o wrapper `processMessage`
  e portanto não recebe `bloqueadoPorLoop`: no bloqueio ele recebe string vazia, sem recibo e
  sem alerta. É o OUT declarado da story (canal de staging), não uma omissão nova.
- **A atomicidade real do dedup** é do índice `ux_system_events_dedupe_key` (migration 218).
  Nos testes ela é simulada por um `Set`. Ler estes verdes como "concorrência coberta" seria
  erro — a mesma ressalva que a 87-19 já registra.
- **O template `alerta_sistema_admin` continua sem nenhum `whatsapp_send_log` em produção**
  (R3). Não dá para provar daqui que ele está `APPROVED`; a contenção não depende disso
  (AC11), e a compensação de entrega falha (desfaz o marcador de dedup) está testada.
- **A margem de 1 mensagem do Sinal C** (as 4 conversas vizinhas param em 2) é medição de
  hoje, não garantia. É o item nº 1 da vigilância pós-deploy, e a régua para revisitá-lo está
  versionada.
- **Nota de fato:** a story diz "última migration: 248". Em `origin/main` a última é **247**.
  Não afeta o AC13 (nenhuma migration foi criada).

---

### 8. Correção pós-gate — QA-87-20-1 (o carrasco do recibo media o RELÓGIO, não a ordem)

Gate `CONCERNS` **não bloqueante**, já liberado. Esta é a única mudança que ele pediu, e ela é de
**instrumento**: o `await logEventOnce` do recibo em `route.ts:1348` está certo e **não foi
tocado** — o que estava errado era o teste que deveria protegê-lo.

**O defeito, medido pelo @qa e reproduzido aqui:** trocar `logEventOnce` por `logEvent` matava 2
testes 🔴, mas **tirar só o `await`** (`void logEventOnce(...)`, mantendo a função) deixava a suíte
do webhook **32/32 VERDE**. Causa: o `entregar()` drenava por **tempo** (`6 × setTimeout(10ms)` =
~60 ms) e o duplo de `logEventOnce` resolve em 5 ms — a promise **órfã** completava por acidente
dentro da folga, e a asserção lia um array já preenchido. O carrasco provava "canal certo", não
"aguardado". O guard de `geracaoDoTeste` protegia o teste **seguinte** da contaminação; não
protegia **este** teste da própria folga.

**O conserto (só em `route.test.ts`) — trocar folga por ordem:**

1. o mock de `next/server.after` **guarda** a promise do callback em vez de descartá-la:
   `afterPromises.push(Promise.resolve().then(() => fn()))`, no lugar de `void ...`;
2. `drenarAfter()` espera os callbacks **terminarem** (`Promise.allSettled`, em laço, porque a rota
   agenda **4** `after()` independentes e um callback pode agendar outro; `allSettled` preserva a
   semântica fire-and-forget para rejeições);
3. `entregar()` chama `await drenarAfter()` no lugar do laço de 60 ms, e o teste do recibo assere
   **imediatamente** depois.

Com o `await` no lugar, a escrita acontece **dentro** do callback e o array já tem o recibo quando
o `drenarAfter()` retorna. Com `void`, o callback resolve **antes** da escrita e a asserção
imediata vê o array vazio — vermelho determinístico, sem depender de nenhum relógio.

**As duas mutações exigidas pelo gate, remedidas nesta árvore (`tsc --noEmit` rc=0 nas duas, então
o vermelho é de comportamento, não de compilação):**

| mutação em `route.ts:1348` | antes | agora |
|---|---|---|
| `await logEventOnce` → `await logEvent` | 🔴 2 falhando / 30 passando | 🔴 **2 falhando / 30 passando** |
| `await logEventOnce` → `void logEventOnce` | 🟢 **32/32 — cego** | 🔴 **1 falhando / 31 passando** |

`route.ts` restaurado por cópia do backup e conferido por `shasum` (`f2fc9c8f…`, idêntico ao de
antes das mutações). Sem mutação, o arquivo volta a **32/32**, agora em **0,5 s** em vez dos ~2 s
que os `setTimeout` custavam.

**O que NÃO mexi, e por quê.** `flushAsync()` (2 macrotasks) continua como estava: os testes que a
usam não afirmam sobre "completou antes de responder", e o único que afirma — o
`WEBHOOK_ORG_UNRESOLVED` da 900-24 — já assere **sem nenhum flush**, medindo o caminho síncrono.
Não há mutação que prove esse ponto cego, e refatorar por gosto é como se introduz regressão.

---

### 9. Expurgo de identificadores de cliente (redação mecânica, pós-gate)

> **Três rodadas.** A 1ª saiu do inventário do @devops (UUID + 7 prefixos de conversa). A 2ª varreu
> a File List inteira. A **3ª** — esta — trocou a régua **por lista** (casar contra os 7 prefixos
> conhecidos) pela régua **por enumeração** do @devops: enumerar TODO token de 8 hex dos 20
> caminhos e triar um a um. Método diferente, prova maior — e foi ele que achou o que as duas
> primeiras não pegaram: os **28 `left(md5(content),8)`** e a **base T0 publicada em 2 linhas**.
> Tudo abaixo já está no estado pós-3ª rodada; onde a 2ª rodada dizia outra coisa, está corrigido
> em vez de acrescentado, porque **o registro que documenta a remoção é onde o dado sobrevive**.

**Nenhuma AC, nenhum comportamento e nenhum veredito mudou.** O @devops parou antes do commit
porque a árvore carregava dados de conversa real espalhados por 8 arquivos — e o repositório é
**público**. Esta passada é redação de identificador, mais a remedição que uma fixture mexida
exige. O gate segue **CONCERNS não bloqueante, liberado**.

**O que saiu, e o que entrou no lugar:**

| classe | antes | agora |
|---|---|---|
| UUID completo da conversa contida | em 5 arquivos (fixture, 2 testes, story, gate) | **UUID sintético** `00000000-0000-4000-8000-00000000000{1,2}` |
| 7 prefixos de 8 hex (7 conversas) | ~79 ocorrências em 10 arquivos | **rótulos**: `CONV_INCIDENTE` / `CONV_CONTROLE` no código, "o incidente" / "o controle negativo" / "o lead de maior volume" na prosa |
| 34 `created_at` absolutos na fixture | `created_at` em ISO com precisão de segundo, um por mensagem | **deslocamento relativo** `t` em segundos (`T+0s` … `T+307s`) sobre uma base sintética (`T0_SINTETICO`), com `created_at` derivado por `emT(t)` |
| tabelas mensagem-a-mensagem (story, gate, parecer) | horários absolutos | **`T+{n}s`** |
| `handoff_at` e a janela de reativação | data-hora absoluta | **"24h após a contenção"** |
| UUID literal no `UPDATE` recomendado (gate e QA Results) | literal versionado | `'<id da conversa contida>'` + nota de que o @devops o obtém do painel |
| **(3ª rodada)** 28 `left(md5(content),8)` — 53 ocorrências | valor do hash na fixture (34), na story (16) e no parecer (3) | **rótulos de classe** `H1`…`H28`, atribuídos na ordem de primeira aparição, **preservando as classes de igualdade** (mesmo hash ⇒ mesmo rótulo; hashes diferentes ⇒ rótulos diferentes) |
| **(3ª rodada)** a base `T0` do deslocamento relativo | publicada em 2 linhas da story: `handoff_at + 24h` ao minuto, e a **própria tabela deste expurgo** instanciando o `created_at` removido | "≈24h após a contenção" (a frase precisa de **um ciclo**, nunca da hora) e a **classe** do dado (`created_at` absoluto em ISO), sem instanciar |

**O que NÃO se perdeu — é o ponto todo.** Todos os agregados continuam no texto, e nenhum aponta
para qual conversa: "1 conversa em 90 dias", "472 de 473 passariam intactas", picos **3/19/8**,
limiar **25** com margem de **32%**, "8 de 11 mensagens eram despedidas", "bloqueia na 6ª contra a
11ª", "**2m22s**". A asserção dos 2m22s continua medindo o intervalo real (`T+165s` → `T+307s`,
142 s) — deslocamento relativo preserva intervalo; a data absoluta não era usada por nada.

**Réguas de varredura — as três reexecutáveis pelo @qa, e nenhuma depende de arquivo fora do
repositório.** Rodam sobre a File List inteira (não só os `.md`): os **20 caminhos** que vão ao
commit.

⚠️ **A régua da 2ª rodada foi APOSENTADA, e o motivo é a lição desta rodada.** Ela casava contra
`grep -f ~/.87-20-prefixos` — uma lista dos 7 prefixos guardada fora do repo. Isso resolvia o
problema de não versionar o segredo, mas criava dois piores: (a) era **irreprodutível** — o arquivo
não existe na máquina de quem revisa, e a régua saía verde por vacuidade; (b) media **só o que já
se sabia procurar**. A régua abaixo **enumera** todo token de 8 hex e **tria um a um**: autocontida,
reproduzível por qualquer um, e é ela que acha o que ninguém listou.

```bash
# alvos: a File List inteira, NUL-separated (não só os .md). Caminhos não são segredo.
alvos() {
  sed -e '/^#/d' -e '/^[[:space:]]*$/d' <<'EOF' \
    | while IFS= read -r f; do [ -f "$f" ] && printf '%s\0' "$f"; done
packages/ai/src/flows/loop-breaker.ts
packages/ai/src/flows/loop-breaker.test.ts
packages/ai/src/flows/__fixtures__/loop-87-20.ts
packages/ai/src/flows/index.ts
packages/ai/src/chat/pipeline.ts
packages/ai/src/chat/pipeline-loop-breaker.test.ts
packages/ai/src/chat/__fixtures__/fake-supabase.ts
packages/web/src/app/api/webhook/whatsapp/route.ts
packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts
packages/web/src/app/api/cron/nicole-health/route.ts
packages/web/src/app/api/cron/nicole-health/route.test.ts
packages/web/src/lib/alerts/admin-whatsapp.ts
packages/web/src/lib/alerts/admin-whatsapp.test.ts
docs/qa/87-20-regua-sinais-loop.sql
docs/stories/87-20-loop-bot-a-bot-trava-de-repeticao-e-contagem.story.md
docs/qa/gates/87.20-loop-bot-a-bot-trava-de-repeticao-e-contagem.yml
docs/qa/po-validation-87-20.md
.claude/agent-memory/aios-qa/project_87_20_gate_concerns.md
.claude/agent-memory/aios-dev/project_trifold_handoff_reason_texto_livre.md
.claude/agent-memory/aios-po/feedback_janela_curta_produz_margem_imaginaria.md
EOF
}

# R1 — ENUMERA todo token de 8 hex e conta por valor distinto. Tria-se a saída, não se casa lista.
alvos | xargs -0 grep -InEo '\b[0-9a-f]{8}\b' | sed 's/.*://' | sort | uniq -c | sort -rn

# R2 — qualquer UUID completo fora da família sintética. Autocontida. Esperado: 0 linhas.
alvos | xargs -0 grep -InEo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
  | grep -v '00000000-'

# R3 (NOVA — é a que teria pego a base T0) — data-hora absoluta com precisão de MINUTO.
alvos | xargs -0 grep -InE '[0-9]{4}-[0-9]{2}-[0-9]{2}([T ][0-9]{2}:[0-9]{2}|.{0,12}[0-9]{2}:[0-9]{2})'
```

**R1 — medido: 74 ocorrências / 32 valores distintos ANTES, 28 / 4 DEPOIS.** Os 4 que sobram são
benignos e cada um foi triado, não presumido:

| valor | ocorrências | o que é | prova |
|---|---|---|---|
| `00000000` | 11 | prefixo da família de UUID **sintética** desta story | `CONV_INCIDENTE_ID` / `CONV_CONTROLE_ID` na fixture |
| `aa584dfb` | 10 | commit da `origin/main` de onde a branch saiu | `git cat-file -t aa584dfb` → `commit` |
| `51d21d1e` | 5 | commit da Story 87-19 (PR #519), já na `main` | `git log --oneline -1 51d21d1e` |
| `f2fc9c8f` | 2 | prefixo do `shasum` de `route.ts` — **arquivo versionado**, não conteúdo de cliente | recomputável do próprio repo |

⚠️ **A régua varre a própria story, então estas contagens INCLUEM as ocorrências desta tabela de
triagem** (a 3ª rodada tem 28 ocorrências onde a varredura anterior ao registro tinha 21). Não é
ruído: é o mesmo mecanismo que fez o dado sobreviver nas duas primeiras rodadas — **o registro que
documenta a remoção é onde o dado sobrevive**. Por isso os 4 valores acima são citáveis (commit
público, arquivo versionado, família sintética) e os 28 `md5` não eram. O número a conferir é o de
**valores distintos: 4**; o de ocorrências sobe a cada linha de documentação que os cite.

Os 28 que saíram eram `left(md5(content),8)` de mensagem de produção. **Recomputando o `md5` dos 8
textos reconstituídos da fixture: 7 divergem** — isto é, fingerprintavam conteúdo que **não está
no repositório**, um oráculo de confirmação de 32 bits para quem adivinhasse o texto — **e 1 bate**
(o de 9 caracteres), o que provou que o cabeçalho da fixture estava **impreciso** ao dizer que todo
o conteúdo era reconstituído. O cabeçalho foi corrigido junto.

**R2 = 0 linhas** (medido). Confirmado também que **não estou reintroduzindo nada**: `git grep` na
`origin/main` dos 7 prefixos de conversa devolve **0 arquivos para 6 deles**. O sétimo **já existe
na `main`** — `docs/stories/87-10-estado-registra-oferta-e-afirmacao.story.md:704`, com o UUID
completo — e é **dívida pré-existente, fora do escopo**: não foi consertada, e também **não foi
piorada** (não a repeti em lugar nenhum, nem aqui). Mesma coisa para os telefones e o oitavo
prefixo apontados pelo @devops — mas **medidos, não aceitos de palavra**: uma régua de forma de
telefone sobre os 20 alvos devolve **15 tokens distintos, e os 15 existem em `origin/main`**
(`git grep` por token, sem citá-los aqui). Nenhum foi introduzido por esta story. **Uma ressalva
honesta:** um deles aparece em `pipeline-loop-breaker.test.ts`, arquivo **criado** por esta story —
é valor de fixture reaproveitado de um teste que já existia, então "pré-existente" está certo mas
"não repetido" **não** está: há uma ocorrência nova de um número antigo. Fica **declarado** e fora
de escopo por decisão do coordenador, não por eu não ter visto.

**R3 — medido: 29 linhas, todas triadas.** 13 são a família sintética declarada (`2020-01-01`) e o
sentinela de época (`1970-01-01`); **15 são linhas pré-existentes em `origin/main`** arrastadas em
hunk (o incidente de crédito de IA da Story 87-19, em `admin-whatsapp.test.ts` e
`nicole-health/route.test.ts`) — provado por `git diff origin/main`, que não mostra **nenhuma**
linha com data adicionada ou removida por esta story exceto as 3 sintéticas `T_BLOQUEIO` /
`T_MAIS_1MIN` / `T_MAIS_2MIN`; **1 é o `updated:` do gate**, metadado de processo presente em
**137 dos 250 gates** do repositório, que registra quando o @qa escreveu o parecer e não tem
relação com o relógio da conversa. **Zero data-hora de conversa.**

**Remedição pós-expurgo (fixture mexida é fixture nova) — remedido na 3ª rodada:**

| prova | resultado |
|---|---|
| Suíte inteira | **289 arquivos · 3.790 passando · 6 expected-fail** · rc=0 — idêntica ao baseline do gate |
| `lint --force` | **rc=0** (0 erros, 30 warnings pré-existentes) |
| `type-check --force` | **rc=0** |
| **Controle negativo** — `loop-breaker.test.ts` sem mutação | 🟢 **55 / 55** |
| **M-A (3ª rodada)** — DIVIDE uma classe: 1 dos 4 `H15` vira `H15X`, conteúdo continua igual | `tsc` rc=0 → 🔴 **1 / 54** |
| **M-B (3ª rodada)** — FUNDE duas classes: `H14` vira `H16`, conteúdos diferentes | `tsc` rc=0 → 🔴 **1 / 54** |
| M8 — `metadata` fora da projeção (`pipeline.ts`) | `tsc` rc=0 → 🔴 **2** (2ª rodada) |
| M14 — `handoff_reason` fora da projeção (`route.ts`) | `tsc` rc=0 → 🔴 **2 / 30** (2ª rodada) |
| M22 — branch de loop só roda com erro de IA | `tsc` rc=0 → 🔴 **8 / 24** (2ª rodada) |
| `await logEventOnce` → `void logEventOnce` | `tsc` rc=0 → 🔴 **1 / 31** (2ª rodada) |

**Por que M-A e M-B, e não uma só.** Uma mutação num sentido só é colinear: quebrar a classe
*dividindo* prova que rótulo igual ⇒ texto igual, mas não o inverso. `H14 → H16` (fusão) fecha o
outro sentido. As duas matam **o mesmo e único** teste — `loop-breaker.test.ts:386`,
`expect(a.content === b.content).toBe(a.hash === b.hash)` — que é a prova de que o rótulo sustenta
a asserção **idêntica** ao hash que ele substituiu.

⚠️ **A primeira tentativa de M-A foi um vermelho FALSO — declarado para o @qa.** Apontei a `sed`
para o número de linha antigo; o cabeçalho da fixture havia crescido na mesma passada, a linha 115
já era outra, a substituição **não casou** e a suíte saiu 🟢 **55/55**. Verde de mutação que não
aconteceu não é cobertura, é ponteiro de linha envelhecido. Só contei o vermelho depois de imprimir
a linha mutada e conferir que ela mudou de fato — os dois `sed -n '{n}p'` estão no comando.

**Os mutantes da 2ª rodada NÃO foram remedidos, e a justificativa é medida, não presumida:** eles
tocam `pipeline.ts` / `route.ts`, que esta rodada não alterou, e a mudança na fixture é
**exclusivamente o valor do literal do campo `hash`**, cujo único leitor em toda a árvore é a linha
386 — `grep -rIn --include='*.ts' -E '\.hash\b' packages/ai packages/web/src` devolve **1 linha**.
Nenhum outro teste pode mudar de cor por causa dela, e a suíte inteira acima confirma (mesmos
3.790).

Os 3 arquivos de produção mutados na 2ª rodada foram restaurados e conferidos por hash **byte a
byte** contra o backup (com controle negativo da própria régua de hash, para ela não aprovar por
vacuidade). A fixture mutada na 3ª rodada idem: `shasum` idêntico e `diff` vazio depois de cada uma
das duas mutações.

**⚠️ Correção factual ao gate, do próprio expurgo (não bloqueante, para o @qa auditar):** o gate
registra `M14 | tsc: ok (string)`. **A forma ingênua do M14 NÃO compila** —
`error TS2339: Property 'handoff_reason' does not exist on type '{ handoff_at: any; }'`: a lista
de colunas do `.select()` do Supabase **narrowa o tipo da linha**, então tirar a coluna quebra a
leitura em `route.ts:1107`. O vermelho só vale com a asserção de tipo no leitor (mesma disciplina
que o gate aplicou ao M18). Com ela, `tsc` rc=0 e os **2 vermelhos** se confirmam — o número do
gate está certo, a linha "ok (string)" era suposição, não medição.

**Editei `docs/qa/gates/87.20-….yml` e `docs/qa/po-validation-87-20.md`** — autorizado, e
**apenas para redação de identificador**: nenhuma palavra de veredito, nenhum número agregado e
nenhuma AC mudaram. As mudanças nesses dois arquivos são substituição de identificador por rótulo
e de data-hora absoluta por deslocamento relativo. O YAML do gate segue parseável (`yaml.safe_load`
rc=0). Na **3ª rodada o gate NÃO foi tocado** — a enumeração do R1 mostra que ele não carrega
nenhum `md5` de conteúdo (só o commit `aa584dfb`, 3×); no parecer do @po foram **3 valores** e uma
linha de prosa, e no corpo da story, **16 valores** mais dois cabeçalhos de tabela (`hash` →
`texto (rótulo)`) e a frase que apresentava a assinatura. Também na 3ª rodada, o nome do `it()` de
`loop-breaker.test.ts:383` deixou de prometer "igualdade de `md5`" — o arquivo não tem mais `md5`
nenhum, e nome de teste vira **saída de CI**.

**Fora do inventário do @devops, mesma classe, também expurgado** (declarado para auditoria):
- `packages/ai/src/chat/pipeline-loop-breaker.test.ts` — 8 literais de data que **repetiam segundo
  a segundo** o instante real da transição do controle negativo; rebaseados para `2020-01-01`
  preservando todos os deltas (a janela de 30 min e o caso "fora da janela" seguem valendo).
- `packages/web/src/app/api/cron/nicole-health/route.test.ts` — os `created_at` dos eventos eram o
  instante exato da 6ª mensagem do incidente; viraram `T_BLOQUEIO`/`T_MAIS_1MIN`/`T_MAIS_2MIN`
  sintéticos (o fake ignora o `gte` da janela de propósito, então só ordem e distinção importam).
- 3 arquivos de memória de agente que carregavam prefixo: `aios-qa/project_87_20_gate_concerns.md`,
  `aios-dev/project_trifold_handoff_reason_texto_livre.md`,
  `aios-po/feedback_janela_curta_produz_margem_imaginaria.md`.

**O argumento da 2ª rodada para MANTER os hashes não se sustentou, e a decisão foi revertida.**
Eu havia escrito que trocá-los "quebraria a âncora de igualdade de hash ⇔ igualdade de texto, que é
evidência de AC". O @devops mediu o consumidor e o argumento caiu: o **único** lugar que lê o campo
é `packages/ai/src/flows/loop-breaker.test.ts:386` —

```ts
expect(a.content === b.content).toBe(a.hash === b.hash)
```

— **auto-consistência pura**. A asserção não olha o valor, só se dois campos são iguais entre si.
Rótulos `H1`…`H28` a sustentam **idêntica**, desde que as classes de igualdade sejam preservadas —
que é exatamente o que foi feito (dois campos com o mesmo hash ficaram com o mesmo rótulo; dois
com hash diferente, com rótulos diferentes). Os valores reais eram **atestado de proveniência, não
carga de AC** — e proveniência se atesta com a régua SQL versionada, não com o fingerprint dentro
do repositório público.

E o custo de mantê-los era **maior do que eu tinha medido**: 7 dos 8 `md5` recomputados divergem,
ou seja, fingerprintavam texto que não está versionado. Os 8 rótulos do lado `user`
(`H1`,`H3`,`H5`,`H7`,`H9`,`H11`,`H13`,`H15`) marcam só a classe de igualdade: o `content`
correspondente é preenchimento (`"·".repeat(n)` / `"•".repeat(n)`), não há texto real associado e
**nenhuma correspondência foi inventada** — está declarado no cabeçalho da fixture.

**O erro de método por trás disso, registrado para não repetir:** a régua da 2ª rodada casava
contra a lista dos 7 prefixos conhecidos. Uma régua por **lista** só encontra o que já se sabe
procurar; a régua por **enumeração** (enumerar a classe inteira e triar item a item) encontra o que
ninguém listou. Foi a diferença entre 7 achados e 35.

**Três coisas que declaro em vez de esconder, para o @qa auditar:**

1. **A asserção da linha 386 cobre só `CONV_INCIDENTE`.** Ela varre o produto cartesiano daquela
   lista; `CONV_CONTROLE` e `TRANSICAO_REAL_CONTROLE` (rótulos `H17`…`H28`) **não têm carrasco** —
   um rótulo errado ali sairia verde. Isso já era verdade com os hashes, não é regressão desta
   rodada, e **não estendi a asserção** porque expurgo não é hora de acrescentar teste. A bijeção
   de `H17`…`H28` é verificável por construção: os 11 `content` do controle são
   `"a".repeat(340)`…`"k".repeat(10)`, todos distintos, e receberam 11 rótulos distintos. **Fica
   como observação para o @qa decidir**, não como pendência silenciosa.

2. **Editei a story fora do Dev Agent Record.** Além do registro, mexi no corpo — a tabela de
   assinatura da Context (2 valores + a frase que a apresenta + o cabeçalho), a tabela do AC7 (11
   valores + o cabeçalho `hash` → `texto (rótulo)`) e a linha de Testing do AC7 (1 valor). São
   **substituições de valor por rótulo e renomeação de cabeçalho**; nenhuma AC, nenhum número
   agregado e nenhuma afirmação mudaram. Está declarado porque o @dev normalmente não toca essas
   seções.

3. **A contagem do inventário do @devops era 13 na story; a enumeração achou 16.** Não corrigi
   "para bater" — a régua enumerativa é a autoridade, e os 3 a mais estavam na linha de Testing e
   na própria seção 9. É o argumento a favor do método: quem conta por lista conta o que listou.

A conversa **não foi despausada**, nada foi escrito em produção, nada foi commitado, nada foi
`git add`-ado e nenhum `push` foi feito.

---

### 10. Correção pós-PR — os 2 achados do CodeRabbit (PR #535)

Escopo: **só os dois achados.** Nenhuma AC mudou, nenhum limiar mudou, nenhum sinal mudou de
comportamento no caminho feliz. Commits novos por cima de `5ee0bf2b`, sem push. A conversa do
incidente **não foi despausada** e nada foi escrito em produção.

#### Achado 1 (`pipeline.ts`) — a contenção podia falhar e reportar sucesso

`conterLoop` **ignorava o `error`** do `UPDATE` em `conversations`. O PostgREST não rejeita nesse
caso: devolve `{ data: null, error }`. Se aquela escrita falhasse, a função devolvia
`bloqueadoPorLoop` do mesmo jeito — e o resultado era **o pior estado possível, escondido dentro da
própria correção**: o webhook gravava `NICOLE_LOOP_DETECTADO` dizendo que a Nicole tinha sido
pausada, o admin era avisado disso, mas `is_ai_active` continuava `true` e `handoff_reason` vazio;
o guard do AC14 não teria o que casar e a próxima mensagem do bot reiniciaria o loop. É a mesma
família dos instrumentos cegos desta onda — **o mecanismo relata um estado que ele não verificou
ter alcançado** — e é literalmente o modo de falha que esta story existe para eliminar.

**O que decidi, e por quê.** Se a escrita falha, o turno **não** está contido; dizer
`bloqueadoPorLoop` sem qualificação é mentir para o chamador. Três escolhas, cada uma com o motivo:

1. **`contencao` é campo OBRIGATÓRIO e discriminante** (`"aplicada" | "falhou"`), dentro de
   `bloqueadoPorLoop`. Obrigatório porque booleano opcional tem *default*, e o default seria "deu
   certo" — a mesma mentira com uma linha de tipo a mais. Efeito colateral desejado: as duas
   asserções `toEqual` que já existiam (AC9 e AC15) **quebraram** e tiveram de afirmar a verdade
   nova. A mudança não é silenciosamente retrocompatível de propósito.
2. **Dentro de `bloqueadoPorLoop`, e não num campo irmão.** É `bloqueadoPorLoop` que faz o webhook
   PULAR o envio, e o envio tem de ser pulado nos dois casos — um turno em loop cuja contenção
   falhou é o último que deveria ganhar voz. Campo separado abriria a porta para um chamador tratar
   só um dos dois e mandar a fala (e `response` é `""`: a Graph API recusa `text.body` vazio).
3. **O grito é um `event_type` PRÓPRIO** — `NICOLE_LOOP_CONTENCAO_FALHOU`, nível `error`, com a
   mensagem do banco em `metadata.erro`, `await logEventOnce` pelo mesmo motivo do recibo (última
   escrita antes do response). O recibo canônico `NICOLE_LOOP_DETECTADO` **continua saindo nos dois
   casos** — é ele que o cron `nicole-health` varre para alertar o admin com o link da conversa
   (AC10), e uma contenção que falhou é *mais* urgente, não menos — mas o texto dele deixou de
   afirmar "Nicole pausada" quando ela não foi.

**O que NÃO fiz, e por quê:** nada de `try/catch` que só loga e segue. Engolir o erro reproduz o
defeito com mais linhas — é o padrão de [[catch-generico-esconde-caminho-morto]].

**O carrasco veio antes.** `pipeline-loop-breaker.test.ts`, `describe("CR-87-20-2 …")`: o `failOn`
do fake injeta `error` **só** no `update:conversations` (as leituras do turno seguem normais) e o
teste falha se o chamador for informado de contenção bem-sucedida. Vermelho medido **antes** da
correção — `2 failed | 21 passed (23)` no arquivo, as duas sendo justamente as asserções sobre o
que o chamador ouve. Junto vão o **controle positivo** (o mesmo turno com o `UPDATE` normal diz
`"aplicada"`, senão `"falhou"` poderia ser constante) e a asserção que dói: **`conversations`
continua sem pausa** — é isso que torna a mentira cara.

**Mutação — 4 formas, 4 vermelhos, suíte INTEIRA, `tsc --noEmit` rc=0 antes de cada contagem:**

| # | forma da mutação | `tsc` | vermelhos | teste que caiu |
|---|---|---|---|---|
| M-CR1a | `conterLoop` volta a **ignorar** o `error` (reporta `"aplicada"` sempre) | rc=0 | 🔴 **1 / 3.805** | `o retorno diz \`contencao: "falhou"\` e carrega o motivo do banco` |
| M-CR1c | o webhook **perde o grito** (bloco `if (!contida)` removido) | rc=0 | 🔴 **1 / 3.805** | `grava NICOLE_LOOP_CONTENCAO_FALHOU, aguardado, em nível de erro …` |
| M-CR1d | o recibo canônico volta a dizer **sempre** "Nicole pausada" | rc=0 | 🔴 **1 / 3.805** | `o recibo canônico continua saindo, mas NÃO diz mais que a Nicole foi pausada` |
| M-CR1e | **controle negativo** — o grito perde a guarda e sai sempre (`if (true)`) | rc=0 | 🔴 **1 / 3.805** | `controle — contenção APLICADA não emite o grito, e o recibo diz \`pausada\`` |

M-CR1e existe porque um grito incondicional passaria em M-CR1c: sem ele, o par contido × não-contido
seria decorativo.

#### Achado 2 (`pipeline-loop-breaker.test.ts`) — filtro por string exata cegava o carrasco

O filtro do kill-switch comparava `s.cols` com o **literal** do `.select()`. Mudar a ordem das
colunas ou um espaço — refator inócuo — fazia o filtro não casar nada, `toHaveLength(0)` passava
**vazio**, e o carrasco ficava cego justamente para o defeito que ele mira (a consulta rodando com
o kill-switch ligado). Mesma classe do `grep -f` com arquivo ausente: **verde por vacuidade**.

**A forma resistente veio da linha 409 do próprio arquivo** (`cols.split(",").map(trim)` +
pertinência), agora extraída em `colunasDe()` e usada nos **dois** pontos — não inventei uma
terceira forma. Duas ressalvas que a cópia literal não cobria e que precisaram de decisão:

- **Comparar por CONJUNTO, não por `includes("metadata")`.** O turno faz outra leitura de
  `messages` que também projeta `metadata`: o histórico da 87-8 (`role, content, created_at,
  metadata`). Um filtro que só procurasse a coluna casaria o histórico e daria **falso-vermelho**
  com o kill-switch ligado. `consultasDaTrava()` casa o conjunto exato `{content, created_at,
  metadata}`.
- **Controle de vivacidade, novo teste.** `toHaveLength(0)` sozinho continua podendo passar por
  vacuidade se o predicado estiver errado. O teste irmão roda o **mesmo** filtro com a trava
  LIGADA e exige `toHaveLength(1)`. Se o predicado deixar de casar por qualquer motivo, ele cai —
  e o `toHaveLength(0)` não pode mais mentir sozinho. É o mesmo idioma que o AC14 já usava em
  `route.test.ts` (`expect(daReativacao.length).toBeGreaterThan(0)` antes de iterar).

**A prova é o par de mundos, medido — 2 × 2 sobre a suíte inteira, `tsc` rc=0 em todas as células:**

| | **M-KS-plain**<br>reintroduz a consulta sob kill-switch ligado | **M-KS-reorder**<br>reintroduz **e** reordena o `.select()` para `created_at, metadata, content` |
|---|---|---|
| **filtro ANTIGO** (`s.cols === "content, created_at, metadata"`) | 🔴 1 / 3.804 | 🟢 **3.798 · rc=0 — CEGO** |
| **filtro NOVO** (conjunto de colunas) | 🔴 1 / 3.805 | 🔴 **1 / 3.805** |

Controle do mundo antigo (filtro antigo, **sem** mutação de código): 🟢 3.798 · rc=0 — o mundo
antigo é autoconsistente, o verde da célula cega não vem de suíte quebrada.

⚠️ **Os denominadores diferem de propósito e a diferença é exatamente 1:** o mundo antigo não tem o
teste de vivacidade (3.804 = 3.798 + 6 xfail; o novo, 3.805 = 3.799 + 6). Não é ruído de medição.

⚠️ **A célula que importa é a de baixo à direita ser 🔴 e a de cima à direita ser 🟢.** Note que o
filtro antigo **não** era uniformemente cego: contra a mutação ingênua (mesma string) ele reprova.
Ele é cego **só** ao refator de projeção — que é precisamente o cenário em que um humano mexe no
`.select()` e acha que a suíte o está protegendo. Reportar "o filtro antigo é cego" sem essa
qualificação seria mais forte do que a medição sustenta.

#### Varredura da classe — os irmãos, medidos e DECLARADOS (não consertados)

"Achei a classe e parei no primeiro" é um defeito próprio. Varri as escritas cujo `error` não é
lido no raio desta story.

**A terceira linha da tabela entrou na v1.8, e o motivo importa:** o predicado da minha varredura
foi *"ESCRITAS cujo `error` não é lido"*, mas a CLASSE que eu mesmo nomeei — *"o mecanismo relata
um estado que não verificou ter alcançado"* — é mais larga e **inclui leituras**. O @qa achou o
ponto que meu predicado não alcançava (QA-87-20-5). É a lição de varrer pela classe, não pelo
predicado que a nomeou.

| ponto | quem introduziu | decisão |
|---|---|---|
| `route.ts` — `UPDATE` de **reativação** de 24h (`is_ai_active: true, handoff_at: null, …`) | **pré-existente na `origin/main`** (63-13/63-15); a 87-20 só acrescentou `&& !contidaPorLoop` à condição | **não consertado.** Mesma classe (falha ⇒ `isAiActive = true` em memória contra um banco que segue pausado), fora do achado e fora do escopo. |
| `nicole-health/route.ts` — `.delete()` de compensação do dedup | a 87-20 acrescentou o **segundo**; o primeiro (87-19) já estava na `main` com a mesma forma | **não consertado.** Consertar um e não o irmão idêntico, na mesma função, seria pior que declarar os dois. |
| `nicole-health/route.ts:95-102` — a **LEITURA** de `coletarLoops`: `if (error || !data) return []` | **código NOVO desta story** (`ced550b1`) — ao contrário dos dois de cima, **não é dívida herdada**; a divergência de convenção dentro da mesma função foi introduzida aqui | **não consertado** (QA-87-20-5, `low`, não bloqueante). Mesma classe, na direção da **detecção**: falha de leitura vira "zero conversas em loop" e a rota devolve `ok: true` — o ciclo some em silêncio. O irmão **10 linhas acima**, pré-existente na `main`, falha **FECHADA** (`500`). **Raio: 1 ciclo** — o cron roda a cada 10 min com janela de 15 min (sobreposição), então o ciclo seguinte recupera o alerta; e a CONTENÇÃO não depende deste cron (AC11), só a latência do aviso. Declarado, com dono, não pendente em silêncio. |

Medido, não presumido: `git show origin/main:…` confirma o `UPDATE` de reativação na `main` e
**1** `.delete()` no cron da `main` contra **2** no `HEAD`. Ambos ficam **declarados** para o @qa
decidir, não pendentes em silêncio.

Varredura do outro achado, mesma disciplina: `grep` por `\.cols` em todos os `*.test.ts` do repo
devolve **3** pontos — o corrigido aqui, a linha 409 (já resistente, agora compartilhando o
helper) e `route.test.ts:1631` do webhook, que **já** usa a forma resistente **e** já tem guarda de
vivacidade. Nenhum quarto ponto.

#### Réguas

| prova | resultado |
|---|---|
| Suíte inteira, antes (tip `5ee0bf2b`) | **289 arquivos · 3.790 passando · 6 expected-fail** · rc=0 |
| Suíte inteira, depois | **289 arquivos · 3.799 passando · 6 expected-fail** · rc=0 |
| Δ | **+9 testes**, 5 em `pipeline-loop-breaker.test.ts` e 4 em `webhook/__tests__/route.test.ts`. **`xfail` inalterado em 6** — nenhum teste virou `it.fails` e nenhum saiu. |
| `lint --force` | **rc=0** (0 erros, 30 warnings pré-existentes — mesma contagem do registro anterior) |
| `type-check --force` | **rc=0** |
| `packages/web` `pnpm build` | **rc=0** (o aviso `Ecmascript file had an error` é de `packages/shared/src/meta/capi-hashing.ts`, pré-existente e fora desta story) |
| Higiene R1 (8 hex) | **30 ocorrências / 5 valores distintos** — os 4 já triados **mais `5ee0bf2b`**, o commit-tip da branch, citado 2× por este próprio registro. Provável por `git cat-file -t 5ee0bf2b` → `commit`: mesma classe benigna de `aa584dfb`/`51d21d1e` (commit público do repo), não conteúdo de cliente. **Medido depois de escrever a seção, não antes** — a régua varre a própria story, e foi assim que o dado sobreviveu às duas primeiras rodadas de expurgo. Antes desta seção existir a medida era 28 / 4. |
| Higiene R2 (UUID fora da família sintética) | **0 linhas** |
| Higiene R3 (data-hora com precisão de minuto) | **29 linhas** — idêntico ao registro anterior, nenhuma linha nova |
| Higiene — o que esta passada **adicionou** | `git diff` filtrado por data-hora, telefone e e-mail: **0 linhas**. Token de 8 hex: **3 linhas, 0 valores não triados** — as três citam o commit-tip desta branch, público, já triado na linha acima. **A régua conta valores distintos NÃO TRIADOS, não ocorrências brutas:** contar ocorrências faz o registro que documenta a ausência ser exatamente o lugar onde o valor aparece — a régua mordendo o próprio rabo pela quarta vez nesta story. |

**Disciplina de mutação:** backup gravado **uma vez** por arquivo (lição da 87-5), a linha mutada
**impressa** antes de contar (lição do ponteiro de linha envelhecido da 3ª rodada de expurgo),
`tsc --noEmit` rc=0 exigido **antes** de cada vermelho, e os 3 arquivos restaurados e conferidos
com `cmp` byte a byte contra o backup ao final — os três deram idênticos, e a suíte voltou a
3.799 · rc=0.


### 11. Correção pós-delta — QA-87-20-6 (o grito não tinha destinatário)

O @qa mediu, na 2ª passada, que o evento que eu acrescentei em `574441ea` para chamar um humano
**não chegava a ninguém**. Segui a medição dele e a reproduzi antes de tocar em qualquer linha:

- **Consumidor 1 (branch de loop):** `coletarLoops` filtra `.eq("event_type", "NICOLE_LOOP_DETECTADO")`.
  O grito tem `event_type` próprio — **não casa**.
- **Consumidor 2 (branch de erro):** varre `level='error'` e passa cada `message` por
  `classificarErroIA`, que casa **8** assinaturas de erro de API de IA
  (`credit balance is too low`, `purchase credits`, `insufficient_quota`, `authentication_error`,
  `invalid x-api-key`, `permission_error`, `rate_limit_error`, `overloaded_error`) e devolve `null`
  para a frase do grito → `if (!tipo) continue`. **Descartado.**
- **E o texto que chegava ao admin era CONSTANTE.** O `{{1}}` saía
  `loop bot-a-bot detectado — {link}` nos DOIS casos.

Ou seja: o admin recebia **exatamente o mesmo aviso** quer a Nicole tivesse sido contida, quer a
contenção tivesse falhado. A verdade existia só no `metadata` do recibo, e `system_events`
**não tem tela** (QA-87-20-2). É a mesma família do defeito que a story inteira ataca — **o
mecanismo relata um estado que ninguém consegue distinguir do outro** — e é precisamente no estado
"falhou" que um humano precisa ir pausar à mão, que foi o que aconteceu no incidente real.

#### O conserto, e por que ele é onde é

O texto que chega a uma pessoa nasce em **uma** linha do repositório (`nicole-health/route.ts`, o
`motivo` do `{{1}}`). Não há outro lugar: o webhook grava eventos, o cron os traduz em frase.
Então o conserto é lá, e é **só** a frase e o dado que a decide:

1. `LoopAgregado` ganhou `contencaoConfirmada: boolean`, alimentado por
   `meta.contencao === "aplicada"` — **o mesmo predicado do escritor, na mesma polaridade**
   (`webhook/whatsapp/route.ts:1352`). Ausência **não** confirma: o campo é obrigatório desde
   `574441ea`, então um evento sem ele é pré-deploy (zero em produção) ou corrompido, e em nenhum
   dos dois há base para afirmar pausa. Tratar ausência como sucesso reintroduziria **no leitor** o
   defeito que o campo obrigatório eliminou **no escritor**.
2. Agregação **fail-closed**: a pausa é da CONVERSA, não do turno, então um único bloqueio não
   confirmado na janela já pede conferência humana (`&&`, não `||`).
3. O `motivo` passou a ter dois braços. O braço confirmado é **byte-a-byte o de antes** — o caminho
   que funciona não muda. O braço não confirmado nomeia o estado e pede a ação:
   `…e a CONTENÇÃO FALHOU: a Nicole segue ATIVA — pause a conversa à mão em {link}`. Uma linha só,
   sem `\n`: parâmetro de template da Meta não aceita quebra.

**O que eu NÃO fiz, de propósito:** nenhum `event_type` novo, nenhuma severidade nova, nenhum
branch novo, nenhum 4º parâmetro no template aprovado (o 4º faz a Meta devolver 400 — medido na
900-23), e o filtro do `coletarLoops` continua sendo `NICOLE_LOOP_DETECTADO`, que é o que preserva
o alerta no caminho de falha (a decisão da "pergunta 1" do delta, confirmada pelo @qa).

#### Carrasco ANTES, e os 4 mutantes

O par que dá o dente: **o mesmo mundo, mudando só a contenção** — mesma conversa, mesmo instante,
mesmo tipo — e o texto enviado ao admin tem de **diferir**. Sem o par, "o texto contém a palavra X"
passaria com um texto constante que sempre pede ação humana, que é o defeito espelhado.

| # | forma | `tsc` | vermelhos | teste que caiu |
|---|---|---|---|---|
| **vermelho inicial** (antes do conserto) | os 3 testes novos contra o `motivo` constante | rc=0 | 🔴 **3 / 3.808** | os 3 do `describe` QA-87-20-6 |
| M-CR6a | **o mutante obrigatório** — `motivo` volta a ser constante (o texto de hoje) | rc=0 | 🔴 3 / 3.808 | os 3 do `describe` QA-87-20-6 |
| M-CR6b | **controle negativo** — `motivo` sempre pede ação humana | rc=0 | 🔴 2 / 3.808 | `alerta com o LINK da conversa dentro do {{1}}` (pré-existente) + `contenção que FALHOU: o texto DIFERE…` |
| M-CR6c | ausência de `contencao` vira sucesso (`=== "aplicada"` → `!== "falhou"`) | rc=0 | 🔴 1 / 3.808 | ``evento SEM `contencao` no metadata não é lido como sucesso`` |
| M-CR6d | agregação fail-**open** (`&&` → `\|\|`) | rc=0 | 🔴 1 / 3.808 | `janela MISTA na mesma conversa…` |

**Kill sets:** M-CR6b, M-CR6c e M-CR6d morrem por testes **distintos** entre si, e M-CR6b morre
por um teste **pré-existente** — é ele que torna o par contido × não-contido real e não enfeite:
sem o controle negativo, um texto constante que sempre gritasse passaria em M-CR6a.

**Um falso-verde meu, declarado.** A 1ª forma da fixture do caso "evento sem `contencao`" usava
`undefined` no 4º argumento — e **parâmetro com default recebe o default quando o argumento é
`undefined`**, então a fixture gerava uma linha `"aplicada"` e o teste media a fixture, não a rota.
Só percebi porque ele continuou vermelho DEPOIS do conserto. Virou o rótulo explícito `"ausente"`,
com o motivo escrito no docstring da fixture.

**A fixture ficou fiel ao escritor:** `eventoDeLoop` passou a gravar `contencao` (e o par de
`message` correspondente), porque é isso que o webhook grava em todo `NICOLE_LOOP_DETECTADO` desde
`574441ea`. Uma fixture sem o campo seria um duplo que não reproduz o escritor — e o consumidor
novo estaria medindo o buraco da fixture. Os **32** testes pré-existentes do arquivo seguem verdes
e o texto do caso contido segue **byte-a-byte** o de antes.

#### Escopo que eu decidi NÃO ampliar — e que devolvo ao coordenador

O `message` do recibo `NICOLE_LOOP_ALERTA` (`nicole-health/route.ts`) diz
`Loop bot-a-bot contido — N bloqueio(s) na janela` também quando a contenção falhou. É a mesma
classe, custa um ternário, e eu **não** o fiz: a instrução foi escopo mínimo, e esse texto não
chega a nenhuma pessoa (`system_events` não tem tela — QA-87-20-2), ao contrário do `{{1}}`.
**Declarado aqui para o coordenador decidir, não consertado em silêncio.**

#### Réguas desta passada

| prova | resultado |
|---|---|
| Suíte inteira, antes | **289 arquivos · 3.799 passando · 6 expected-fail** · rc=0 |
| Suíte inteira, depois | **289 arquivos · 3.802 passando · 6 expected-fail** (3.808) · rc=0 |
| Δ | **+3 testes**, todos em `cron/nicole-health/route.test.ts`. **`xfail` inalterado em 6.** |
| `lint --force` | **rc=0** |
| `type-check --force` | **rc=0** (exigido rc=0 **antes** de contar cada um dos 4 vermelhos) |
| `packages/web` `build` | **rc=0** |
| Árvore após as mutações | `route.ts` restaurado do backup e conferido por `cmp` + `shasum` — idêntico |
| Higiene R1 (8 hex) | **69 ocorrências / 8 valores distintos · 0 NÃO TRIADOS.** Os 5 já registrados **mais 3 SHAs de commit desta própria branch**, que entraram porque este registro e o parecer do @qa os citam. Triados um a um, não presumidos: `git cat-file -t` devolve `commit` para **6** dos 8; o 7º é prefixo de `shasum` de arquivo versionado (recomputável do repo); o 8º é a família de UUID sintética. **Nenhum conteúdo de cliente.** |
| Higiene R2 (UUID fora da família sintética) | **0 linhas** |
| Higiene R3 (data-hora com precisão de minuto) | **29 linhas** — idêntico ao registro anterior, nenhuma linha nova |
| Higiene — o que esta passada **adicionou** | Data-hora, telefone e e-mail: **0**. Token de 8 hex: **0 valores não triados** (só SHAs de commit deste repo, citados pelo próprio registro). **A régua conta valores distintos não triados, não ocorrências brutas** — é essa formulação que a torna imune a si mesma. |

### Debug Log References

- Régua reexecutável: `docs/qa/87-20-regua-sinais-loop.sql` (só contagens, read-only)
- Consultas ad-hoc de medição: Management API, projeto `dsopqkqjkmhytudaaolv`, sem escrita

### File List

**Criados**
- `packages/ai/src/flows/loop-breaker.ts`
- `packages/ai/src/flows/loop-breaker.test.ts`
- `packages/ai/src/flows/__fixtures__/loop-87-20.ts`
- `packages/ai/src/chat/pipeline-loop-breaker.test.ts`
- `docs/qa/87-20-regua-sinais-loop.sql`

**Modificados**
- `packages/ai/src/flows/index.ts` — barrel exporta a trava
- `packages/ai/src/chat/pipeline.ts` — `TipoDeLoop`, `ProcessMessageResult.bloqueadoPorLoop`, `carregarMensagensRecentesDaNicole`, kill-switch, `conterLoop`, Sinal B pré-modelo, Sinais A/C no `return` antecipado; **CR-87-20-2:** `ResultadoDaContencao` (`contencao` obrigatório e discriminante) e o `error` do `UPDATE` da contenção LIDO
- `packages/ai/src/chat/__fixtures__/fake-supabase.ts` — projeção real do `.select()` + registro dos selects
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — call-site → `processMessageWithMetadata`, `await logEventOnce(NICOLE_LOOP_DETECTADO)` + `return`, projeção `handoff_at, handoff_reason`, guard do AC14; **CR-87-20-2:** texto do recibo condicionado a `contencao` + `await logEventOnce(NICOLE_LOOP_CONTENCAO_FALHOU)` no caminho em que a contenção falha
- `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` — mock com metadata, projeção no fake, tabela ausente ⇒ vazia, 9 testes novos; **QA-87-20-1:** mock de `after()` retém a promise + `drenarAfter()` substitui a drenagem por tempo no `entregar()`; **CR-87-20-2:** `describe("contenção FALHOU")` com 4 testes (grito aguardado, recibo que não mente, controle negativo, envio suprimido)
- `packages/web/src/lib/alerts/admin-whatsapp.ts` — `tipo: TipoErroIA` → `motivo: string`
- `packages/web/src/lib/alerts/admin-whatsapp.test.ts` — assinatura nova + 2 testes do `{{1}}`
- `packages/web/src/app/api/cron/nicole-health/route.ts` — `MOTIVO_POR_TIPO[tipo]` no caller, `coletarLoops`, branch de alerta com link, dedup por conversa, compensação; **QA-87-20-6:** `LoopAgregado.contencaoConfirmada` (mesmo predicado do escritor, agregação fail-closed) e o `{{1}}` com dois braços — o do caso contido byte-a-byte igual ao de antes
- `packages/web/src/app/api/cron/nicole-health/route.test.ts` — fake honra `.eq()`, 12 testes novos; **QA-87-20-6:** fixture `eventoDeLoop` fiel ao escritor (grava `contencao`) + `describe` com 3 testes (o par contido × não-contido, a janela mista, o evento sem o campo)
- `docs/stories/87-20-loop-bot-a-bot-trava-de-repeticao-e-contagem.story.md` — este registro
- `packages/ai/src/flows/loop-breaker.ts` — expurgo: comentários de produção sem identificador nem data-hora de conversa
- `packages/ai/src/chat/pipeline-loop-breaker.test.ts` — expurgo: datas rebaseadas, deltas preservados; **CR-87-20-1/2:** filtro do kill-switch por CONJUNTO de colunas (`colunasDe`/`consultasDaTrava`) + controle de vivacidade, e o `describe` da contenção que falha (4 testes)
- `docs/qa/gates/87.20-loop-bot-a-bot-trava-de-repeticao-e-contagem.yml` — **só redação de identificador** (veredito, números e ACs intactos); **não tocado na 3ª rodada** (não carrega `md5` de conteúdo)
- `docs/qa/po-validation-87-20.md` — **só redação de identificador** (parecer intacto); **3ª rodada:** 3 valores de `md5` → rótulos `H{n}` + cabeçalho da tabela
- `packages/ai/src/flows/__fixtures__/loop-87-20.ts` — **3ª rodada:** os 34 `left(md5(content),8)` → rótulos de classe `H1`…`H28` (classes de igualdade preservadas); cabeçalho corrigido (a exceção do texto *verbatim*) e docstring do campo `hash` reescrita
- `packages/ai/src/flows/loop-breaker.test.ts` — **3ª rodada:** só o nome do `it()` da linha 383 (não promete mais "igualdade de `md5`"); a asserção da linha 386 está **intacta**
- `docs/qa/87-20-regua-sinais-loop.sql` — expurgo de 1 identificador em comentário
- `.claude/agent-memory/aios-qa/project_87_20_gate_concerns.md`, `.claude/agent-memory/aios-dev/project_trifold_handoff_reason_texto_livre.md`, `.claude/agent-memory/aios-po/feedback_janela_curta_produz_margem_imaginaria.md` — expurgo de prefixo

**Não tocados (confirmado)**
- `packages/web/src/lib/broker/broker-takeover-status.ts` — `shouldReactivateAi`/`resolveTakeoverAnchor` intactas (AC14 mudou o CHAMADOR)
- `packages/web/vercel.json` — 37 crons, sem entrada nova (T3.4)
- `supabase/migrations/` — nenhuma migration (AC13)
- `packages/web/src/app/api/telegram/webhook/route.ts` — fora de escopo (OUT)

---

## QA Results

**Gate:** `docs/qa/gates/87.20-loop-bot-a-bot-trava-de-repeticao-e-contagem.yml`
**Revisor:** Quinn (Test Architect) · 2026-08-30 · árvore de trabalho sobre `aa584dfb` (nada commitado)

### Veredito: **CONCERNS — NÃO bloqueia o deploy**

Os 16 ACs estão implementados e **não achei defeito vivo no código de produção**. As 4 concerns
são de instrumento e de vigilância; nenhuma justifica segurar um deploy cuja janela é
**24h após a contenção**.

### O que reproduzi de forma independente (não reli — remedi)

| prova | resultado |
|---|---|
| Régua `docs/qa/87-20-regua-sinais-loop.sql` contra produção | **todos os números de bloqueio idênticos**: A=1, B@25=**0**, B@15=1, C=1; picos 3/19/8 |
| Classificação mensagem a mensagem do incidente, direto do banco | 11 comprimentos e o padrão `enc` `[F,F,T,T,F,T,T,T,T,T,T]` batem **byte a byte** com a fixture |
| o lead de maior volume no limiar vigente | pico 19 → **NÃO é cortado** com 25 (seria com 15) |
| Mutantes M8 / M14 / M18 / M22 | 🔴 2 / 🔴 2 / 🔴 4 / 🔴 8 — **M18 com `tsc --noEmit` rc=0 confirmado antes do vermelho** |
| Probe meu (recibo em snake_case, não previsto) | 🔴 1 — o contrato webhook↔cron tem carrasco nas duas pontas |
| Suíte / lint / type-check / **build** | 289 arq · 3.790 · 6 xfail · rc=0 / rc=0 (0 erros) / rc=0 / **`next build` rc=0** |

O `next build` é prova nova: é ele, e não o `tsc`, que garante que
`@trifold/ai/src/flows/loop-breaker` resolve no bundle da Vercel.

### Os 7 pontos pedidos

1. **O `return` cobre as ~15 escritas — PASS.** Ele está em `pipeline.ts:1435`, depois do saneamento
   de `assistantMessage` e antes de `detectSlotMismatch`; o Sinal B sai ainda mais cedo, em `:766`.
   Varri `:612`→`:1434` inteiro: **nenhuma escrita sobrevivente** — as duas de `:636-637` são do ramo
   de fora-de-horário (com `return` próprio) e todo o resto da janela é leitura. O que dá dente ao
   teste é a asserção de MECANISMO (`escritas(fake) === ["update:conversations"]`) **com controle
   positivo**: o mesmo turno, com kill-switch, cria `appointments`, chama o Calendar, emite
   `APPOINTMENT_CREATED` e avança o estágio.
2. **Projeção do AC14 — PASS.** M14 mata **duas** metades por caminhos diferentes: a comportamental
   ("a conversa reativou") e a literal ("qual consulta perdeu a coluna"). O fake projeta de verdade,
   então a primeira não é carrasco cego.
3. **Mutantes — PASS.** Amostra confirmada acima. Reproduzi inclusive o cuidado do M18: a versão
   ingênua **não compila** (TS2339/TS2698); refeita com asserção de tipo, `tsc` rc=0, e só então os
   4 vermelhos valem — com 28 testes ainda passando, que é o que prova que o arquivo executou.
4. **A suíte do webhook alcançava o pipeline? — PASS, com correção de número.** Instrumentei o mock
   para registrar o nome do teste a cada chamada. **Com o conserto: 7 de 32 testes alcançam. Com o
   conserto revertido: 0 de 32** (e 29 continuam verdes). Ou seja: **100% do arquivo era cego** —
   23 testes pré-existentes verdes sem nunca tocar o caminho da IA, dois deles (75-222, 75-289)
   afirmando sobre o caminho assíncrono. Correção ao Dev Agent Record: dos 9 testes novos, **6**
   executam o pipeline (os 3 do AC14 não executam de propósito — a conversa está pausada), e **2
   pré-existentes** passaram a executar de carona.
5. **Falsos positivos — PASS.** União dos três em 90 dias = **1 conversa**, o incidente. As 4
   vizinhas do Sinal C param em 2, as 3 do Sinal A param em 2, e o lead de maior volume para em 19.
6. **A Trifold continua funcionando — PASS, com número.** 473 conversas e 1.768 mensagens da Nicole
   em 90 dias; **472 passariam intactas**. Nenhuma conversa humana dispara nada.
7. **`await logEventOnce` — CONCERNS.** O código está certo. O carrasco não. Medido: trocar por
   `logEvent` mata 2 testes ✔; **tirar só o `await` (mantendo `logEventOnce`) deixa a suíte
   32/32 VERDE** — o `entregar()` drena 60 ms e o mock resolve em 5 ms, então a promise órfã
   completa dentro do mesmo teste. Ver QA-87-20-1.

### As 4 concerns (nenhuma bloqueante)

| id | severidade | resumo |
|---|---|---|
| **QA-87-20-1** | medium | O carrasco do recibo prova o CANAL, não o `await`. Conserto exato no gate. |
| **QA-87-20-2** | medium | `alerta_sistema_admin` tem **0 envios** e `NICOLE_HEALTH_ALERTA` **0 eventos** em produção — a primeira contenção será o primeiro teste real do canal da 87-19. E `handoff_reason` não é lido por nenhuma tela. |
| **QA-87-20-3** | low | Os sinais contam `role='assistant'`, coluna com ≥5 escritores fora do pipeline; **2 dos 41** encerramentos de 90 dias vêm de um deles. Nenhuma das 4 vizinhas dependeu disso — mas a margem do Sinal C é 1. |
| **QA-87-20-4** | low | AC16 (ver abaixo). |

### A divergência de denominadores: **aceitável — e agora explicada, não tolerada**

Medi as duas hipóteses:

- **1.940 × 1.768 é FILTRO, não erro.** 90 dias **com** `is_transition` = **1.945**; **sem** = **1.768**;
  são **177** mensagens de transição. O @po contou a coluna inteira, o @dev aplicou a exclusão da
  87-5. Para esta story o certo é o do @dev — os três sinais não contam fala de corretor. Efeito
  cosmético: a razão "41 de 1.940" do parecer mistura numerador filtrado com denominador não
  filtrado (o correto é 41/1.768).
- **13 × 28 é artefato de cópia, confirmado.** Conversas com ≥1 encerramento: **13 em 14 dias**,
  **28 em 90 dias**. O "13" repetido na coluna de 90d é o valor de 14d.

**Por que basta:** nenhum dos dois entra em limiar, fixture ou asserção. O que entraria — picos e
`bloqueadas_*` — reproduz idêntico nas **três** execuções independentes (@po, @dev, eu).

### O furo do AC16: **CONCERNS, e a recomendação é SIM ao `UPDATE`**

Confirmei no banco (read-only): o `handoff_reason` do incidente tem **85 caracteres de texto
livre** e **não** é a constante; `handoff_at` = o instante da contenção manual;
**0 mensagens depois da pausa**. O @dev está certo: **um ciclo a mais, não infinitos**.

Um detalhe que muda a leitura do prazo: a reativação **não é um relógio** — ela roda no
processamento da **próxima mensagem de entrada** depois da janela de 24h. Com o bot calado, nada
acontece.

- **Prioridade 1 — deploy dentro da janela de 24h após a contenção.** É o único controle que muda a ordem de
  grandeza: com o fix, pior caso ≈ 5 mensagens (Sinal C na 3ª despedida); sem o fix, loop sem trava.
- **Prioridade 2 — sim, recomendo o `UPDATE` de uma linha**, decisão do dono do produto e execução
  do @devops. **Eu não executei nada.**
  `UPDATE conversations SET handoff_reason = 'loop_bot_detectado' WHERE id = '<id da conversa contida>';`
  (o identificador não é versionado — o @devops o obtém do painel no momento da execução)
  Risco funcional zero (o campo não é lido por nenhuma tela; só pelo guard novo). Custo: sobrescreve
  a nota da pausa manual — cujo texto já está transcrito no Context desta story. Ganho: o AC16 passa
  a valer do primeiro ciclo.
- **Não despausar** a conversa do incidente.

### Pendências para o @devops antes do deploy

1. Conferir que `NICOLE_LOOP_BREAKER_OFF` está ausente/`0` em produção — **não consegui checar
   daqui** (o token local da Vercel devolve `forbidden` no projeto de produção).
2. Conferir o status do template `alerta_sistema_admin` no WhatsApp Manager (QA-87-20-2).

### Higiene

Produção só em leitura, agregados e metadados, via Management API — nenhum `content`, telefone ou
nome; nenhum service-role. Nenhuma escrita em produção. Mutações aplicadas em disco com backup e
restauro conferidos por sha1 nos 6 arquivos tocados. Nenhum arquivo temporário na árvore do repo.
Nenhum commit, push ou PR.

