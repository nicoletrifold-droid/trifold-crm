# Parecer PO — Story 87-20 (trava de loop bot-a-bot)

- **Story:** `docs/stories/87-20-loop-bot-a-bot-trava-de-repeticao-e-contagem.story.md`
- **Autor do draft:** @sm (River) · **Validador:** @po (Pax) · **Data:** 2026-08-30
- **Veredicto:** **NO-GO estreito** — 4 correções obrigatórias, todas de texto de AC/Task.
  Nenhuma remedição necessária. Estimativa de conserto: ~2h. Prazo (24h após a contenção) alcançável.
- **Nota de prontidão:** 7.5/10 · **Confiança:** Alta

> A régua de 10 pontos daria GO (7.5 ≥ 7). Ela não pontua "o instrumento não enxerga a si
> mesmo", que é onde estão os 4 achados. Implementada como está, a trava contém — e depois
> emudece, ou deixa um evento de agenda para trás. Por isso NO-GO.

---

## 1. O que eu reproduzi contra produção (só leitura, agregados e hashes)

Rodei tudo pela Management API (`dsopqkqjkmhytudaaolv`), sem ler conteúdo de mensagem.

### 1.1 O incidente — confere byte a byte

```
role       n    primeira   ultima     is_transition     (deslocamentos, em s, desde a 1ª msg)
assistant  11   T+11s      T+307s     0
user       11   T+0s       T+299s     0
```

**22 mensagens, 11 da Nicole, 0 transições.** A correção do @sm (22/11, não 21/10) está certa.

Assinatura por `md5(content)` — idêntica à tabela da Context. Os textos aparecem pelo **rótulo de
classe** `H{n}` da fixture (`packages/ai/src/flows/__fixtures__/loop-87-20.ts`), nunca pelo valor do
hash: o repositório é público e o texto correspondente não está versionado.

| texto (rótulo) | len | vezes | deslocamentos |
|---|---|---|---|
| `H16` | 9 | **3** | T+224s · T+252s · **T+307s** |
| `H8` | 18 | **2** | T+105s · T+278s |
| outros 6 | 25–146 | 1 cada | — |

### 1.2 O controle negativo — confere, e é mais forte do que a story diz

O controle negativo: pico de **11 mensagens** da Nicole numa janela de 5 min a partir da 1ª
(T+0s → T+235s), **11 conteúdos distintos, 0 `is_transition` dentro da janela**. Confirmado.

Fui além, porque se o "controle negativo" fosse um segundo bot o desenho inteiro inverteria
de sentido. Ele não é:

| | mensagens | intervalo médio | **desvio** | min–max | lado `user` |
|---|---|---|---|---|---|
| o incidente | 21 | 14,6s | **6,0s** | 8–27s | 11 msgs |
| o controle negativo | 19 | 12,3s | **12,9s** | 3–47s | 9 msgs, **14 chars de média**, todas distintas |

Cadência irregular e mensagens de 14 caracteres do outro lado: é gente digitando "sim", "ok",
"quanto?". O incidente tem desvio de 6s num intervalo apertado — forma de máquina. **O controle
negativo é real e é ele que sustenta o desenho de dois sinais.** Aprovado.

### 1.3 O sinal discriminante — reproduzido sob régua MAIS dura que a do @sm

O @sm mediu sobre `md5(content)`. **A regra do AC1 compara `trim()`.** São réguas diferentes:
`trim()` colapsa variantes de espaço e só pode produzir MAIS colisões. Rodei com `btrim()`,
excluindo `is_transition`, e estiquei a janela muito além do que a story testou:

```
população: 205 conversas · 552 mensagens assistant (14 dias)

janela      5min  10min  30min  60min  180min  1440min
conversas      1      1      1      1       1        1
pares          4      4      4      4       4        4
```

**Uma conversa, 4 pares, em toda janela até 24 horas** — 288× o intervalo do incidente. O sinal
sobrevive a `trim()` e a variação de janela. É o achado mais sólido da story.

### 1.4 A régua do Sinal B estava errada — e a conclusão sobreviveu

A story calibra **15 por 10 minutos** citando "o máximo histórico é 11". Esse 11 é o máximo por
**5 minutos**. Comparação de réguas diferentes. Medi a certa:

```
janela   pico  p50  p90  p95  p99   >=12   >=15
5min       11    1    5    6   10      0      0
10min      11    1    5    7   10      0      0
```

O pico em 10 min também é **11**. A margem de 36% existe de verdade. (p99 hoje é 10, a story diz
9 — deriva de 1 dia na janela; população 205/552, não 203.) **Justificativa desalinhada,
conclusão correta.** Corrigir o texto, não o número.

### 1.5 Infra: 12 alegações conferidas, 11 verdadeiras

87-19 mergeada em `51d21d1e` ✓ · migration 218 com `ux_system_events_dedupe_key` ✓ · última
migration 248 ✓ · 37 crons, `nicole-health` presente ✓ e rodando `*/10 * * * *` com janela de
15 min (latência de detecção ≤ ~10 min — genuinamente boa) ✓ · `RELATIONSHIP_HANDOFF_REASON` ✓ ·
`detectSlotMismatch`:122 ✓ · `saveMessages`:2234 ✓ · `processMessageWithMetadata`:537 ✓ ·
`.slice(0,500)` do `NICOLE_SLOT_MISMATCH` ✓ · comentário anti-rajada 75-359 em :1130 ✓.

**`shouldReactivateAi`/`resolveTakeoverAnchor` são agnósticos a `handoff_reason`** — puramente
temporais sobre `max(handoff_at, última msg broker)`. O prazo de ~24h após a contenção é real.

A 12ª é falsa — ver S5.

### 1.6 Uma suspeita minha que eu medi antes de escrever

Achei que AC2 ("não chamar `saveMessages`") descartaria a mensagem de ENTRADA do lead, porque a
assinatura é `saveMessages(supabase, conversationId, message, assistantMessage)`. **Não descarta:**
o parâmetro é `_userMessage`, não usado — "user message is already saved by the webhook handler"
(`pipeline.ts:2237-2240`). **AC2 está seguro.** Registro porque quase virou um achado inventado.

---

## 2. Correções OBRIGATÓRIAS (bloqueiam o GO)

### B1 — AC4 é intestável onde a story o coloca, e não é afirmado onde ele roda

**O vigésimo instrumento cego, e é da classe que o @dev pediu para eu procurar.**

T1.2 fixa a assinatura: `recentes: { content: string; created_at: string }[]` — **sem `metadata`**.
Logo a função pura não pode decidir nada sobre `is_transition`. O filtro mora no chamador: T2.1,
"filtrando `metadata.is_transition !== true` **em memória**".

Mas o Testing manda o AC4 para `loop-breaker.test.ts` — o arquivo da função **pura**. Não dá para
passar uma linha `is_transition=true` a uma função cujo tipo de entrada não tem o campo. O teste
degenera em "um array menor não dispara", que passa com ou sem o defeito.

E o filtro que roda de verdade lê `metadata` do resultado de um `select` do Supabase. **Se esse
`select` não projetar `metadata`, `m.metadata?.is_transition !== true` é `true` para toda linha,
o filtro vira no-op — e o AC4 continua verde.** A chamada existe; o argumento foi neutralizado.

Não é hipotético neste repositório: o Dev Agent Record da 900-23 registra "o carrasco do `select`
do `nicole-health` **nasceu cego** — o fake ignorava a lista de colunas e devolvia `org_id` da
fixture".

**Correção:** mover a exclusão para DENTRO da função sob teste — `recentes: { content: string;
created_at: string; isTransition: boolean }[]` (ou `metadata`) — e acrescentar ao AC4 uma asserção
sobre a **projeção**: o teste de integração afirma que a consulta de T2.1 nomeia `metadata`. Sem
as duas metades, o AC4 não pode reprovar pelo defeito que existe para impedir.

### B2 — "antes de `saveMessages`" é uma janela de 540 linhas que agenda visita no Google Calendar

T2.4 diz: Sinal A "DEPOIS de gerar `assistantMessage`, antes de `saveMessages`", apontando para
~1291. `saveMessages` está em **1829**. Entre os dois, `pipeline.ts` faz:

```
1629  await createCalendarEvent({...})          ← evento real no Google Calendar
1680  emit(APPOINTMENT_CREATED)                 ← dispara push ao corretor no webhook
1703  await deleteCalendarEvent(...)
1704  await createCalendarEvent({...})
1738  await deleteCalendarEvent(...)
1776  type: "handoff"                           ← registro de handoff
1824  await supabase.from("leads").update(...)  ← patch do lead
```

Um bloqueio colocado em qualquer ponto depois de ~1600 deixa **uma visita marcada na agenda e um
corretor notificado por uma mensagem que o lead nunca recebeu**. "Antes de `saveMessages`" soa
seguro e não é.

**Correção:** T2.4 fixa o ponto exato (o `return` antecipado em ~1291, junto de `detectSlotMismatch`),
e o AC2 deixa de dizer "não envia nem grava" para dizer **"nenhum efeito colateral do turno
sobrevive"** — sem `appointments`, sem evento de calendário, sem `APPOINTMENT_CREATED`, sem patch
de `leads`. Com asserção, não com comentário.

### B3 — a única coisa que avisa um humano é escrita fire-and-forget na ponta mais curta da lambda

AC8 manda usar "o `emit()`/`onEvent` já existente". No webhook, `onEvent` chama `logEvent(...)`
sem `await` (`route.ts:1217`). E `logEvent` é `export function logEvent(params): void`, cujo
docstring diz, no próprio arquivo (`packages/web/src/lib/logger.ts:50-55`):

> "Numa lambda serverless, o processo congela no `return` do handler e a promise pendente morre
> com ele. **Isso já custou um evento em produção** (o recibo `NICOLE_LASTRO_DIARIO` da run de
> 10/08 11:38 UTC — inexistente no banco...). **Se o evento é a ÚLTIMA escrita antes do response,
> use `logEventOnce` (aguardado).**"

No caminho bloqueado o envio é pulado — então `NICOLE_LOOP_DETECTADO` **é** a última escrita antes
do response. E o AC9 não tem outra entrada: sem esse evento, não há alerta.

Um evento perdido produz exatamente o estado que o dono do produto teme: **contido, silencioso, e
indistinguível de "funcionou e o admin não olhou o WhatsApp"**. Nenhuma AC desta story consegue
observar a própria perda.

**Correção:** no ponto do bloqueio, `await logEventOnce({...})` em vez do `logEvent` do canal
`emit`. Custa um insert num caminho que já vai retornar, e traz de brinde o `dedupe_key` que o
AC9 quer.

### B4 — o alerta não consegue dizer QUAL conversa

`TEMPLATE_ALERTA = "alerta_sistema_admin"` é um template aprovado de **3 parâmetros fixos**. Não é
opinião: `nicole-health/route.ts:223` documenta e a 900-23 mediu — **um 4º devolve 400 e o alerta
para de sair**. Os três slots são `motivo` / `momento` / `ocorrências`.

Ou seja: o admin recebe "loop detectado, N ocorrências" **sem conversa e sem lead**. E o dedup do
AC9 é por conversa — dois loops simultâneos viram duas mensagens idênticas de WhatsApp.

Do lado do CRM não há resgate: `handoff_reason` é **escrito** em 6 rotas de API e **lido em zero
`.tsx`**. A conversa contida fica visualmente idêntica a uma pausada à mão. `is_ai_active` até
aparece na UI (8 arquivos, incl. `ai-status-banner.tsx`), mas sem o motivo.

Trocamos loop infinito por conversa contida que ninguém acha. **É metade do defeito que a story
existe para matar.**

**Correção:** o AC9 precisa de uma perna de "onde olhar" — dobrar o identificador dentro do
parâmetro {{1}} (cabe: é texto livre), **ou** expor `handoff_reason` na lista de conversas.
Escolher uma, e afirmar em teste.

---

## 3. Correções recomendadas (não bloqueiam)

- **S1 — "limite de 2" foi reinterpretado, e "encerramento" nunca foi definido.**
  `grep -in "encerr\|closing\|despedida"` na story: **zero linhas**. O dono pediu "limita a 2
  mensagens de encerramento". O AC1 entrega "2 envios de conteúdo *idêntico*", e o parêntese —
  *"(o pedido original é 'no máximo 2', não 'nunca repetir')"* — apresenta a reinterpretação como
  citação do pedido. Declarar que a regra estrutural **substitui** o pedido literal (e por quê),
  ou definir "encerramento". Não as duas coisas em silêncio.

- **S2 — o que a trava teria feito com ESTE incidente não está escrito.** Medido: o bloqueio mais
  cedo possível é o 3º `H16`, em **T+307s** — a **11ª e última** mensagem da Nicole,
  4m56s depois da 1ª, 47s antes de o humano intervir. A trava transforma um loop ilimitado num
  loop de **10 mensagens**. É valor real (sem humano, aquilo não parava), mas o AC6 ("dispara
  exatamente no ponto esperado") lê como se pegasse cedo. Escrever o número.

- **S3 — o denominador honesto é 54, não 205.** O Sinal A só pode disparar onde há ≥3 mensagens
  da Nicole: **54 das 205** conversas (só 5 têm ≥11). "Zero falso positivo em 202 outras conversas"
  superestima a evidência em ~4×. O achado continua forte — dentro dessas 54 ninguém chega nem ao
  **segundo** envio idêntico — mas com o denominador certo.

- **S4 — a reativação de 24h gera uma oscilação permanente que a story não declara.** A janela do
  Sinal A é 30 min. Depois de reativar em 24h, toda repetição anterior está fora da janela: o
  contador **zera**, a Nicole manda o mesmo texto mais 2 vezes e bloqueia de novo — indefinidamente,
  um alerta por ciclo. O AC13 ("o Sinal A a recontém na 3ª tentativa") é verdade e lê como
  fechamento. Ou declarar a oscilação como regime aceito, ou o guard de ~3 linhas no ponto de
  reativação do webhook (`route.ts:1082-1090`): não reativar quando
  `handoff_reason === LOOP_BOT_HANDOFF_REASON`. **Isso não modifica a 63-13/63-15** —
  `shouldReactivateAi` é agnóstico ao motivo; quem decide é o chamador. O OUT da story continua
  respeitado.

- **S5 — alegação falsa de export.** AC9 e T3.1 dizem que `sendWhatsAppTemplate` e `logWhatsappSend`
  estão "todos já exportados de `packages/web/src/lib/alerts/admin-whatsapp.ts`". Não estão: vêm de
  `@web/lib/whatsapp/send-template` e `@web/lib/whatsapp/log-send` (o `admin-whatsapp.ts` os
  importa, linhas 4-5). Os outros 4 nomes da lista conferem.

- **S6 — `alertarLoopBot` é uma cópia de `alertarAdminWhatsApp`.** Mesmo `Promise.allSettled`,
  mesmo `logWhatsappSend` por destinatário, mesmo try/catch — diferindo só na string {{1}}. Mais
  barato e mais seguro: alargar `alertarAdminWhatsApp` para receber `motivo: string`, e o chamador
  da 87-19 passa `MOTIVO_POR_TIPO[tipo]`. Isso **preserva** a AUTO-DECISION (que está correta:
  reusar transporte sim, classificador não) e evita reprovar a garantia do AC10 numa cópia — cópia
  é onde instrumento cego mora.

- **S7 — T2.5 é omissa sobre as outras escritas.** Diz "não chamar `saveMessages`" e cala sobre
  `updateConversationState` (:1832) e `updateConversationTimestamp`. Nomear as três.

- **S8 — falta mutante do Sinal B.** A lista de mutação cobre `LOOP_REPEAT_MAX_SENDS`,
  `is_transition` e o kill-switch. Não cobre `LOOP_COUNT_MAX`/`LOOP_COUNT_WINDOW_MIN` — e o Sinal B
  é a resposta inteira ao R5 (o bot que varia o texto).

- **S9 — decisão escrita sobre o incidente.** Recomendação do PO: **manter pausada**, sem despausar.
  Se reativar sozinha depois das 24h da contenção, com o fix em produção, o Sinal A a recontém —
  e isso vira a validação em produção do item 3 do Testing. Registrar como decisão, não como
  pendência.

- **S10 — "string vazia" é sentinela in-band.** Um bloqueio indistinguível de uma geração que veio
  vazia. `processMessageWithMetadata` já devolve `ProcessMessageResult`: carregar um `bloqueado:
  true` explícito. É o mesmo conserto do B3 — o webhook, ao ver a flag, faz o `logEventOnce`
  aguardado.

---

## 4. Julgamentos que o @sm pediu

| Pergunta | Veredicto |
|---|---|
| A trava estrutural extrapola o pedido? | **Não. É proporcional** — o controle negativo prova, com dado, que a contagem pura cortaria um lead real. O problema não é o acréscimo; é que o pedido literal ("2 de encerramento") sumiu sem ser respondido (S1). |
| AUTO-DECISION: não estender `TipoErroIA` | **Correta.** `classificarErroIA` casa assinatura textual de erro de API; um loop é sucesso técnico com defeito de comportamento. Forçá-lo lá quebraria o AC4 da 87-19. Reusar transporte, não classificador — mas então reuse o transporte de verdade (S6), não copie. |
| AUTO-DECISION: fail-closed sem shadow mode | **Correta.** É a opção (d) do D4 do próprio Epic 87 ("handoff quando a mesma violação se repetir na mesma conversa"), aplicada ao caso exato que ela descreve. E o kill-switch do AC11 é a válvula certa. |
| O Sinal A pega a próxima variante? | **Não, e a story admite (R5).** A resposta é o Sinal B — que hoje é o sinal com menos teste e sem mutante (S8). Se o R5 for o cenário provável, é o Sinal B que precisa de rigor, não o A. |
| A trava precisa sobreviver à reativação de 24h? | **R4 está sub-dimensionado.** Não como risco de prazo (isso está certo), mas porque o regime pós-reativação é uma oscilação permanente que ninguém encerra (S4) — e existe conserto de 3 linhas que não viola o OUT. |
| A detecção acende? | **Meio.** O cron a cada 10 min com janela de 15 é bom. Mas o gatilho é fire-and-forget (B3) e o alerta não tem endereço (B4). Contenção durável, notificação não. |

---

## 5. Condição de GO

Corrigidos **B1, B2, B3, B4** — todos texto de AC/Task, nenhuma remedição — a story vira GO sem
nova rodada de dados. **As seções Context e as medições estão aprovadas como estão**; a Context é
a mais bem lastreada que auditei neste épico, e sobreviveu a uma régua mais dura que a original.

Status permanece **Draft**.

— Pax, equilibrando prioridades 🎯

---
---

# 2ª rodada — 2026-08-30 · Veredicto: **GO** (9/10) · Status `Draft` → **`Ready`**

Os 4 bloqueantes da 1ª rodada foram resolvidos. **Achei 4 defeitos novos dentro das próprias
correções** e, como AC/Scope são autoridade do @po e o pavio de 24h é real, **apliquei as correções
em vez de devolver**. A story vai ao @dev sem outra rodada de texto.

## 6.1 Os 4 bloqueantes — verificados

| | Alegado | Verificado |
|---|---|---|
| **B1** | `isTransition` no tipo + teste de projeção | ✅ T1.2 tem o campo no tipo; AC4 tem as duas metades. **Mas a inovação não foi aplicada à consulta que esta revisão criou** — ver N1 |
| **B2** | Bloqueio movido para ~1291 | ✅ E fui além: enumerei as escritas entre `:537` e `:1291` — **não existe nenhuma**, exceto `saveMessages`/`updateConversationTimestamp` (`:561-562`) no ramo de fora-de-horário, que tem `return` próprio em `:564` e nunca alcança 1291. "Nenhum efeito colateral sobrevive" é alcançável de verdade |
| **B3** | Trocar `processMessage` → `processMessageWithMetadata` | ✅ **Aprovado, risco baixo.** `processMessage` é wrapper de 2 linhas (`:530-534`) sobre a mesma função; produção tem exatamente **2** callers (WhatsApp `:1198`, Telegram `:514`) e o wrapper continua existindo para o Telegram e para 2 arquivos de teste. O escopo do Telegram fora é defensável |
| **B4** | Link no `{{1}}` | ✅ Cabe, 3 params preservados. Corrigi `APP_URL` → `NEXT_PUBLIC_APP_URL` (a env nua não existe; produziria `undefined/dashboard/…`) |

## 6.2 N1 — o vigésimo primeiro instrumento cego: **o AC14 era um no-op**

A consulta do bloco de reativação é, hoje, `route.ts:1066`:

```ts
.from("conversations").select("handoff_at").eq("id", conversation!.id).maybeSingle()
```

**`handoff_reason` não é projetado.** O AC14/T5.1 mandava ler `convRow?.handoff_reason` — que seria
`undefined` para sempre. A reativação nunca seria pulada, e a oscilação permanente que a AC existe
para matar voltaria inteira. Com o teste **verde**, se o fake devolver o campo independentemente da
lista de colunas — o "carrasco cego" da 900-23.

**É a mesma classe do B1, na correção do B1.** A story inventou o teste de projeção para o AC4 e
não o aplicou à única consulta nova que ela mesma introduziu. Corrigido: T5.1 ganhou a projeção,
T5.2 ganhou a segunda metade, e a lista de mutação ganhou o mutante correspondente.

## 6.3 N2 — o limiar do Sinal B estava falsificado

A calibração 15/10min vinha de **14 dias** (pico 11). Estendi para **90 dias / 1.940 mensagens**:

| | 14 dias | 90 dias |
|---|---|---|
| pico por 10 min | 11 | **19** |
| conversas acima de 12 | 0 | **14** |
| conversas ≥15 (que o Sinal B cortaria) | 0 | **1** |

É o lead de maior volume medido: 21 mensagens da Nicole, **todas distintas**, 162 chars de
média; lado `user` com 19 mensagens de 20 chars; **e 2 mensagens `role='broker'`** — um lead que o
corretor de fato assumiu. **É exatamente o erro que o controle negativo existe para
impedir, um nível acima.** Limiar subido para **25** (32% acima do máximo de 90 dias).

Lição: janela de calibração curta produz margem imaginária. A "margem de 36%" era artefato.

## 6.4 N3 — AC7 e AC3 se contradiziam no mesmo fixture

Com os três sinais ligados, o fixture do incidente **não** bloqueia por Sinal A na 11ª mensagem: ele
bloqueia por **Sinal C na 6ª**. O AC7 afirmava o contrário e ficaria vermelho — ou o dev desligaria
o Sinal C para fazê-lo passar. Reescrevi o AC7 com a tabela mensagem-a-mensagem medida e com **duas
asserções separadas** (três sinais ligados → bloqueia na 6ª; Sinal C desligado → Sinal A bloqueia na
11ª), porque as duas propriedades importam e não cabem no mesmo teste.

## 6.5 N4 — o R6 era factualmente falso, e os rótulos de confiança estavam invertidos

O R6 dizia: *"não há como rodar a régua de quantas conversas colidiriam sem ler conteúdo"*. **Um
regex dentro de `count(*) filter (...)` não devolve conteúdo nenhum** — é a mesma técnica já usada
para o Sinal A (`md5`/`btrim`). Medi, read-only, 90 dias:

| medida | 14 dias | 90 dias |
|---|---|---|
| casam `PADROES_DE_ENCERRAMENTO` | 23 de 552 (4,2%) | 41 de 1.940 |
| pico de encerramentos em 30 min | **8** | **8** |
| **conversas que o Sinal C bloquearia** | **1 — o incidente** | **1 — o incidente** |
| conversas no limite (exatamente 2) | 2 | 4 |

**Zero falso positivo em 90 dias.** E no incidente real o Sinal C bloqueia na **6ª mensagem
(T+165s)** contra a 11ª do Sinal A — **5 mensagens enviadas em vez de 10**, 2m22s antes.

**8 das 11 mensagens da Nicole no incidente são despedidas.** O pedido literal do dono do produto
("limita a 2 mensagens de encerramento") era um **diagnóstico preciso do mecanismo**, não uma
aproximação leiga. A trava estrutural que eu validei na 1ª rodada é a metade mais fraca.

**Os rótulos estavam exatamente invertidos:**

| sinal | rótulo da v1.1 | medido em 90 dias |
|---|---|---|
| **C** | "semântico, frágil, não mensurável" | **0 FP; contém o incidente mais cedo** |
| **A** | "estrutural e medido" | 0 FP; contém na 11ª |
| **B** | "estrutural e medido, margem 36%" | **1 FP real** |

## 6.6 As perguntas do coordenador

1. **A fragilidade do Sinal C está contida?** **Sim, e melhor do que a de qualquer outro sinal.** 0
   FP em 90 dias. A margem é fina — as 4 vizinhas param em 2, a 1 do limiar — então é o número a
   vigiar depois do deploy. O custo do erro é handoff para humano: recuperável, não mensagem perdida.
   Substituí a calibração manual de 20-30 conversas (T1.7) por uma **régua de regressão versionada**:
   toda linha nova em `PADROES_DE_ENCERRAMENTO` exige a medição rodada de novo.
2. **Os 3 sinais se somam em falso positivo?** **Não.** União em 90 dias: exatamente **2** conversas
   — o incidente (por A e C, independentemente) e o lead de maior volume (**só por B, sozinho**, com o limiar
   errado). As classes são disjuntas na população real, e a única colisão veio de um sinal isolado.
   Com o limiar de 25, **a união bloqueia 1 conversa em 90 dias: o incidente**.
3. **AC14 não viola o OUT e tem carrasco?** Não viola — `shouldReactivateAi`/`resolveTakeoverAnchor`
   continuam intocadas e agnósticas ao motivo; a condição entra no chamador. O carrasco **não
   existia** (N1) e agora existe, em duas metades.
4. **O 21º instrumento cego:** N1. A resposta à pergunta "o que os três sinais não conseguem
   observar de si mesmos" é: **eles não observam a consulta que os alimenta**. Duas vezes seguidas o
   defeito foi a projeção do `.select()`, não a lógica. Vale como regra permanente para esta família
   de stories.

## 6.7 O que continua em aberto (não bloqueia)

- **AC5 é uma lista incompleta** (8 de ~15 escritas na janela). Faltavam os quatro
  `activities.insert` (`:1654`, `:1672`, `:1722`, `:1744`), o avanço de estágio (`:1663`/`:1719`) e
  os `emit(APPOINTMENT_RESCHEDULED)`/`(APPOINTMENT_CANCELLED)` — que também disparam push ao
  corretor. Marquei como **ilustrativa** e fixei o `return` antecipado como requisito **normativo**,
  já que ele cobre as ~15 por construção. Se o @dev implementar "flag e pula depois", passa nas 8 e
  vaza 7.
- **O Telegram** (`route.ts:514`) fica sem alerta no bloqueio. Aceito, documentado no OUT.
- **A margem de 1 mensagem do Sinal C** é o item nº 1 da vigilância pós-deploy.

## 6.8 Nota

Estas edições são de AC/Scope/Riscos, autoridade exclusiva do @po (`story-lifecycle.md`). Não toquei
Tasks de implementação além do necessário para tornar as ACs executáveis, nem Dev Agent Record.

**Status: `Ready`.** Segue para `@dev *develop`.

— Pax, equilibrando prioridades 🎯
