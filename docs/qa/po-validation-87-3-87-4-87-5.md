# Validação @po — Stories 87-3 (v0.3), 87-4 (v0.3) e 87-5 (nova)

**Autor:** Pax (@po) · **Data:** 2026-08-07
**Escopo:** revalidação da **87-3** (era 🔴 NO-GO 6/10) · revalidação da **87-4** (era 🟡 GO
condicional 7/10) · **primeira validação da 87-5**
**Contra:** Epic 87 **v0.5** · Epic 88 **v0.4** · `docs/qa/po-validation-87-3-87-4.md` (a minha de
ontem) · **código em `HEAD`** · **banco de produção `dsopqkqjkmhytudaaolv`, medido em 07/08 22h UTC**
**Precede:** `docs/qa/po-validation-87-3-87-4.md`

---

## TL;DR

| Story | Veredito | Nota | Status |
|---|---|---|---|
| **87-3** — reconciliação diária fala × banco | ✅ **GO** | **9/10** | `Draft → **Ready**` |
| **87-4** — estado com âncora temporal | ✅ **GO** | **9/10** | `Draft → **Ready**` |
| **87-5** — histórico rotulado (fala do corretor) | ✅ **GO condicional** | **8/10** | `Draft → **Ready**` |

**As três passam. As três levaram correção minha, e as três correções são do mesmo tipo:** uma regra
numérica cujo **denominador, precedência ou fonte de campo** nunca foi declarado, e cujas leituras
possíveis dão respostas **opostas**.

- **87-3:** a ordem de avaliação dos baldes não estava escrita, e as ordens possíveis dão
  **0,0 % · 8,7 % · 12,5 %** para os mesmos 60 dias. **O 0 % é alcançável, e é o modo de falha
  silencioso que os Riscos 7 e 8 da própria story existem para impedir** — chegando por uma porta
  que a AC2-b não cobre.
- **87-5:** a condição de escape *"menos de 10 % das conversas ativas"* admite quatro denominadores;
  medidos, eles dão **8,4 % · 8,9 % · 16,9 % · 20,0 %** — dois liberam a fila e dois a mantêm.
- **87-4:** o único `Depende de` declarado no roadmap que ninguém fechou nem dispensou (`W1-3a`).

Apliquei as correções por autoridade de @po sobre **AC e escopo** (`.claude/rules/story-lifecycle.md`)
em vez de devolver ao @sm: todas são determinadas por medição, nenhuma é escolha de desenho. O @sm
deve conferi-las — estão marcadas com `[@po 07/08]` nos três arquivos e detalhadas no Change Log de
cada um.

---

## 0. Como eu medi (para o @dev repetir)

Management API contra `dsopqkqjkmhytudaaolv` (PAT em `~/.supabase/access-token`, JSON). Quatro
sondas, rodadas contra o código de `HEAD` e removidas depois:

| # | Sonda | O que responde |
|---|---|---|
| **A** | as **1.156** mensagens `role='assistant'` de 60 dias por `detectAffirmedSlot` ancorada em `created_at`, cruzadas com as 63 `appointments`, **classificadas pela régua da 87-3 v0.3** nas três ordens de balde possíveis | o número que o instrumento vai publicar |
| **B** | `resolveVisitSlotParts` sobre os seeds da AC4 da 87-4 (Maria Oliveira, Edicleia, Sandra) com **quatro `now` distintos** | as fixtures são o que a story diz? envelhecem? |
| **C** | réplica isolada das **seis** formas de consumo de `history` do `pipeline.ts`, com `Message.role` **já alargado**, sob `tsc --strict` | o `type-check` é mesmo o localizador de consumidores? |
| **D** | SQL direto: volumes por papel, chaves de `metadata`, resíduo de agenda, autoria da última escrita, pressão de janela por população | os números herdados de documento continuam valendo? |

> ⚠️ **Vale de novo o achado de método de ontem:** o texto de `timestamptz` do Postgres
> (`2026-06-28 13:37:40.123+00`) **não é ISO-8601 para o `new Date()` do JS** — normalizei em todas as
> sondas. É o que a **AC2-b da 87-3** existe para fechar.

---

# 1. Story 87-3 — ✅ GO (9/10)

## 1.1 As oito correções da v0.2, conferidas com evidência — não pelo Change Log

| # | Correção | Aplicada? | **Como eu conferi** |
|---|---|---|---|
| B1 | lista única de 8 casos + Sandra no Context | ✅ | Rodei a lista: os 8 aparecem. **Mas são 16 falas, não "11 ou mais"** → corrigido (§1.3-D) |
| **B2** | discriminador visita×ligação no módulo, com precedência | ✅ **e funciona** | Apliquei os `PADROES_LIGACAO` **literais da story** aos 30 disparos: descartam **exatamente 1 — a Silvana — e nenhum outro**. A regra de precedência não derrubou nenhuma fala de visita. `OUT` ratificado, discriminador fora da `detectAffirmedSlot` ✓ |
| B3 | alerta por `lead+dia`, com a linha preservada | ✅ | Escrito. **Mas depende da precedência dos baldes** → §1.2 |
| B4 | Helena 23/06 BRT = 24/06 UTC | ✅ | — |
| B5 | AC2-b (`Invalid Date`) | ✅ | Escrita com as três vias e o vermelho da string crua |
| **B6** | unidade · denominador · `status` · balde `lembrete` · AC3 muda de natureza | ✅ **em tudo que eu pedi** | E é justamente por o `lembrete` ter entrado que apareceu o defeito novo → §1.2 |
| B7 | citação da Sueli + validade datada | ✅ | — |
| **B8** | cron `30 11` → `38 11` | ✅ **reconferido hoje** | Expandi os **35** crons do `vercel.json`: `38` não é atingido por nenhum `*/3`, `*/5`, `*/10`, `*/15`, `*/30` nem por cron de minuto fixo. `30 11` continua ocupado por `billing-monthly-summary` |
| — | esforço S → M | ✅ | — |

**Nada do que eu pedi ontem ficou pela metade.** A story melhorou de verdade.

## 1.2 🔴 O que impedia o GO — e por que ele nasceu da própria correção B6

A v0.3 descreve os quatro baldes numa tabela **sem dizer em que ordem eles são testados**. E as
regras de dois deles **se sobrepõem inteiramente**:

```
com_lastro : created_by='nicole'  E  created_at ≤ faladoEm + 2 min
lembrete   :                         created_at < faladoEm
```

Rodei a régua da story nas ordens possíveis, contra os mesmos 60 dias de produção:

```
lembrete avaliado primeiro    com_lastro=0   lembrete=8   den=21    lastro_pct =  0,0 %
janela bilateral de ±2 min    com_lastro=2   lembrete=6   den=23    lastro_pct =  8,7 %
com_lastro avaliado primeiro  com_lastro=3   lembrete=5   den=24    lastro_pct = 12,5 %
```

**A causa não é estatística, é estrutural — e eu a medi appointment a appointment.** O INSERT do
`appointment` acontece **antes** de a fala ser persistida em `messages`, nos **6** appointments
`created_by='nicole'` que existem no projeto:

```
Emerson  appt 17:47:13,507   fala 17:47:14,379   Δ = 0,87 s
Obrigado appt 12:26:48,843   fala 12:26:49,340   Δ = 0,50 s
Idalina  appt 13:35:50,942   fala 13:35:51,111   Δ = 0,17 s
JOSIETE  appt 11:44:03,940   fala 11:44:04,025   Δ = 0,09 s
Wilson   appt 18:12:22,497   fala 18:12:22,656   Δ = 0,16 s
Ailton   appt 01:05:32,367   fala 01:05:32,531   Δ = 0,16 s
```

Ou seja: **`created_at < faladoEm` é verdade para TODO candidato a `com_lastro`.** Com `lembrete`
testado primeiro, o balde `com_lastro` fica **vazio por construção** e o instrumento publica
**`lastro_pct = 0 %` para sempre**.

> **E ele publica 0 % com a AC1 verde, a AC2 verde, a AC2-b verde e a AC4 verde.** É exatamente o
> cenário do **Risco 7** — *"o instrumento não falhou, ele mentiu"* — entrando por uma porta que a
> AC2-b não guarda. E é pior que o do `Invalid Date`, porque não há nada anômalo para alguém
> estranhar: o JSON sai bem formado, com 30 disparos, 8 lembretes e um zero.

**Duas AC caíam juntas.** A **AC4-(iii)** — a supressão do alerta contraditório do Ailton — exige que
a fala das 01:18 resolva `com_lastro`. Com `lembrete` primeiro ela resolve `lembrete`, a supressão
**não dispara**, e o alerta contraditório que a AC promete impedir sai assim mesmo. **Uma raiz, duas
AC.**

### O que escrevi na story

- **Ordem normativa**, de cima para baixo: `com_lastro` → `reparo_humano` → `lembrete` → `sem_lastro`.
- **Janela do `com_lastro` passa a ser bilateral**: `JANELA_MESMO_TURNO_MIN = 15`, e os 15 minutos
  saem da medição — o maior Δ real num turno de confirmação é o do **Ailton, 12,8 min**; os outros
  cinco são < 1 s. Bilateral porque **o lado que importa é o de antes da fala**, não o de depois.
- **AC3-(i-b) nova**, com três vias: o vermelho da fixture do Wilson (0,16 s antes → `com_lastro`;
  invertendo a ordem → `lembrete` e `lastro_pct = 0`), o caso do appointment `nicole` de 3 dias antes
  (**não** é lastro), e — a parte que fecha — **a T6 publica o número nas DUAS leituras, lado a lado**.
  A ambiguidade vira número em vez de virar uma pergunta que ninguém faz.
- **Risco 10** acrescentado.

## 1.3 As outras três correções

**A — 🔴 A AC1-a não fechava como escrita.** Ela exige `divergencia_min: 60` na linha do Ailton. Mas
`divergenciaMin` é definida como *"quando há appointment perto"*, e "perto" é a janela de
**classificação** de ±30 min — dentro da qual o Ailton **não tem candidato nenhum** (o appointment
dele está a 60 min). Medido: a linha sai com **`divergencia_min = null`**. São **duas janelas** e a
story agora declara as duas: classificação **±30 min** (decide o balde, intocada) e relatório
**±24 h** (só preenche `divergencia_min`, sem efeito no balde).

**B — O `PADROES_LIGACAO` foi testado contra o dado real e passou.** Aplicado aos 30 disparos:
`descartes.ligacao = 1`, e o único descartado é a Silvana (*"Segunda-feira às 9h o corretor te liga"*).
Nenhuma fala de visita foi engolida pela lista. **A B2 não é só desenho: ela funciona.**

**C — `transicao_humana = 0`**, como eu previra ontem. O filtro é profilaxia e o contador publica o
número para o dia em que deixar de ser zero. ✓

**D — A AC1 fala em "11 falas ou mais" e são 16.** Medido, lead a lead: **Célia×2, Helena×2, Miriam×2,
Ailton×3, Sandra×2, Sueli×1, Valnira×2, Maria×2 = 16**. A lista de multiplicidade da AC esquecia
Célia×2 e Sandra×2. Corrigido.

## 1.4 O número que o instrumento vai publicar

Com a precedência normativa, contra 60 dias até 07/08:

```
unidade: fala · total_disparos: 30 · descartes: { ligacao: 1, transicao_humana: 0, data_invalida: 0 }
lembrete: 5 · denominador: 24
com_lastro: 3 · reparo_humano: 9 · sem_lastro: 12
lastro_pct: 12,5 %   ·   lastro_frouxo_pct: 50,0 %
```

Escrevi isso na story **como referência de conferência de montagem, explicitamente NÃO como alvo** —
a proibição da AC3-(i) contra perseguir número continua valendo por inteiro. Para o `PM2` do Epic 88:
o baseline manual de **31 %** continua *superado*; o número oficial passa a ser o que a T6 publicar.

## 1.5 Checklist

| # | Critério | Nota |
|---|---|---|
| 1 | Título | ✅ |
| 2 | Descrição | ✅ |
| 3 | **AC testáveis** | 🟡 → ✅ **após a precedência, a AC1-a e a contagem** |
| 4 | Escopo IN/OUT | ✅ |
| 5 | Dependências | ✅ (`W0-2` é nominal: `logEvent`, `system_events` e o harness já existem — **a story pode começar hoje**) |
| 6 | Estimativa **M** | ✅ |
| 7 | Valor | ✅ |
| 8 | Riscos | ✅ (10, com o novo) |
| 9 | DoD | ✅ |
| 10 | Alinhamento com o Epic | 🟡 o roadmap ainda diz **S** no `W0-5`; a story é **M** → @pm |

**9/10 → GO. Status `Ready`.**

---

# 2. Story 87-4 — ✅ GO (9/10)

## 2.1 C1–C4, conferidas com evidência

| # | Correção | **Como eu conferi** |
|---|---|---|
| **C1** | 7º consumidor (`enrich-leads`, ESCRITOR) + AC8-b + T5-b | ✅ **e a evidência ficou mais forte do que a que a story traz:** dos **56** estados com resíduo, **39 (70 %) têm o cron como ÚLTIMO ESCRITOR** — `conversation_state.updated_at` a menos de 1 s de `conversations.last_enriched_at`. Não foi turno de conversa que escreveu aquilo; foi o Haiku |
| **C2** | fixtures da AC4 trocadas | ✅ **rodei as três contra o `HEAD`:** Maria Oliveira **arma** e é estável (tem `vpd` absoluto); Edicleia **arma e o dia anda** (07/08 → 14/08 → 21/08 → 04/09); Sandra resolve o dia e **não** a hora (a 75-245 bloqueia a faixa). Exatamente o que a v0.3 descreve |
| **C3** | 56 / 9 / 35 / 0, com as **duas** medições de armados e o método de cada | ✅ remedido hoje: **56 estados, 9 com `vpd`, 0 com `vph`** — sem drift. E a decisão de **registrar as duas réguas em vez de escolher um número** está certa: são perguntas diferentes (*"o parser resolve?"* × *"o INSERT dispararia?"*) |
| **C4** | citações prefixadas com a data do documento | ✅ |
| **C5** | backlog | ✅ os três itens estão em `docs/backlog.md` (Célia · `detect-appointment.ts:71` · `role='assistant'` em fala humana) |

## 2.2 🔴 O achado novo: um `Depende de` do roadmap que ninguém fechou nem dispensou

O Epic 87 §7/Onda 1 diz, com todas as letras:

```
W1-2b   Depende de: W1-2a + W1-3a
```

O **`W1-2a`** (purge do estado) foi executado pelo Gabriel em 07/08 e está registrado no epic. O
**`W1-3a`** — *"remediação de dados: resumos que afirmam agendamento inexistente"* — **não tem
registro de execução em lugar nenhum**, e nem a story nem o epic o mencionam como pendente. Ele
simplesmente sumiu da conversa.

**Medi o tamanho real, e ele é pequeno:**

```
leads com ai_summary                                      224
… cujo resumo AFIRMA agendamento                            8
… desses, com appointment de verdade (resumo correto)       7
… sem appointment nenhum  →  Marilda                        1   ← o W1-3a que falta
```

**É uma linha.** A ação é barata dos dois jeitos: executar (@data-engineer, sem deploy) **ou**
registrar por escrito no epic que o `W1-3a` foi dispensado com o número medido. **O que não serve é
o silêncio** — um bloqueador declarado que ninguém fechou e ninguém dispensou é como uma story vai a
produção com uma dependência aberta que só aparece no retrospecto. Virou **T0-a**.

> Observação de método na mesma passada: os 7 resumos **legítimos** usam data **relativa**
> (*"visita agendada para amanhã (sexta-feira às 15h)"*) — é o mesmo defeito de âncora desta story,
> em prosa. **Isso é o `W1-3b`, não é para ampliar o escopo aqui.**

## 2.3 As outras duas correções

**A — As fixtures da AC4 mudam de resultado por calendário.** Medido:

```
Maria Oliveira   now=07/08 → 08/08 11:00   now=09/08 → 08/08 11:00   now=15/08 → 08/08 11:00   ESTÁVEL
Edicleia         now=07/08 → 07/08 15:00   now=09/08 → 14/08 15:00   now=15/08 → 21/08 15:00
```

A AC dizia que a Edicleia resolve **"HOJE 15:00"** — verdade **só se o teste rodar numa sexta-feira**.
O @dev que rodar numa terça vê `14/08`, acha que a fixture quebrou e mexe nela. A AC agora **fixa o
`now`**, com o par `07/08 → 07/08 15:00` e `09/08 → 14/08 15:00` — que é, aliás, o par que **prova
que o dia anda**. A fixture ficou melhor, não pior.

**B — O "48×/dia" é a cadência do cron, não a taxa de reescrita por estado.** O `enrich-leads` só
toca conversa com `is_ai_active = true` **e** `last_message_at > last_enriched_at`
(`route.ts:47-51`). Medido: **1 conversa enriquecida nas últimas 24 h**. A tese da AC8-b fica de pé
inteira — o cron **é** escritor, e é o último escritor de 70 % do resíduo. **O que muda é a curva que
a AC8 espera:** ela decai nos estados dormentes e **oscila nos ativos**. A leitura correta da AC8 é a
query da **AC8-b-(iii)** (*"nada tocado depois do deploy volta a ter a chave"*), não *"o contador
global chega a zero"*.

## 2.4 Checklist

| # | Critério | Nota |
|---|---|---|
| 1-4 | Título · Descrição · AC · Escopo | ✅ (AC4 agora com `now` fixo) |
| 5 | **Dependências** | 🟡 → ✅ **com a T0-a**; era o furo do `W1-3a` |
| 6 | Estimativa **M** | ✅ |
| 7-9 | Valor · Riscos · DoD | ✅ |
| 10 | Alinhamento com o Epic | ✅ |

**9/10 → GO. Status `Ready`.**

---

# 3. Story 87-5 — ✅ GO condicional (8/10)

**É uma story forte, e o que ela faz de melhor é o que ninguém pede:** ela argumenta contra si mesma
(a seção "a favor de fundir") antes de decidir. As cinco perguntas, respondidas com medição:

## 3.1 O rótulo resolve a restrição da API? **Sim. ✅ Aprovado — com um defeito de campo.**

Conferi o SDK: `MessageParam.role: 'user' | 'assistant'`
(`@anthropic-ai/sdk@0.52.0`, `resources/messages/messages.d.ts:296`). Não há terceiro papel, e a
conclusão do @sm está certa nos dois lados:

- **papel interno ≠ papel da API** é a única saída;
- **mapear o corretor para `user` seria estritamente pior** — a Nicole passaria a acreditar que **o
  lead** disse *"entrada de 35 mil"*. Errar de quem é a fala para o **nosso** lado é recuperável pelo
  rótulo + instrução; errar para o lado do **cliente** contamina a qualificação inteira.

### 🔴 Mas o rótulo não teria nome nenhum, e falharia em silêncio

O desenho manda tirar `{primeiro_nome}` de `metadata.broker_id` → `users.name`. Medido:

```
mensagens role='broker' (30 d)                          900
  com metadata.sent_by                                  795   (88 %)
  com metadata.signed_as   ← JÁ É O PRIMEIRO NOME       428   (48 %)
  com metadata.broker_id                                  0   ← o campo que o desenho manda usar
  conteúdo-placeholder ([Arquivo]/[Mídia]/[Áudio])      105   (12 %)

mensagens de TRANSIÇÃO (assistant + is_transition)      104
  com metadata.broker_id                                104   (100 %)
```

**`broker_id` existe em zero das 900.** Ele só é gravado no insert da transição
(`send-message/route.ts:217`). As mensagens reais do corretor usam **`sent_by`**, e quase metade
delas tem **`signed_as`, que já é o primeiro nome pronto** (`senderFirstName(appUser.name)`,
linha 272). Com a regra da v0.1, o rótulo cairia em `[CORRETOR HUMANO]` **em 100 % dos casos, sem
erro, sem log** — falha silenciosa dentro de uma story cujo tema é não errar em silêncio. E o teste
da AC1, com fixture sintética, ficaria **verde**.

Corrigido para `signed_as` → `sent_by`→`users.name` (**consulta única em lote**, não N+1: é caminho
quente de turno) → `broker_id` (só transições) → fallback.

## 3.2 O `type-check` como localizador de consumidores? **🔴 FRÁGIL. Medi: acha 1 dos 6.**

Repliquei as seis formas exatas do `HEAD` com `Message.role` já alargado e rodei `tsc --strict`.
**Saída completa — um erro:**

```
error TS2322: Type '"user" | "assistant" | "broker"' is not assignable to type '"user" | "assistant"'
  → pipeline.ts:927   role: msg.role     (a fronteira da Anthropic)
```

Os outros cinco são invisíveis, e o motivo está escrito no código de hoje:

| # | consumidor | por que não acende |
|---|---|---|
| 1 | `buildNoReintroContext` | parâmetro `Array<{ role: string }>` (linha 223) |
| 2 | **`lastAssistantMsg`** | `(m as { role?: string })` — cast explícito, linha 710 |
| 4 | `generateHandoffSummary` | `HandoffMessage.role: string` (`handoff.ts:19`) |
| 5 | identificação de imóvel | `(m as { content?: string })` — cast, linha 1157 |
| 6 | `enrich-leads` | outro pacote, consulta própria, não usa o tipo |

**E medi a variante que interessa:** mesmo **removendo o cast** da linha 710,
`.find((m) => m.role === "assistant")` **continua sem erro** — comparar um union mais largo com um
literal é TypeScript válido. **O `lastAssistantMsg` é invisível ao compilador em qualquer variante.**
E ele é o consumidor que alimenta o gate de agendamento: é o que a AC3 existe para proteger e o que o
Risco 2 chama de Alto.

> **A AC6, como estava, era inexequível** (*"a lista precisa bater com os seis"* — ela tem uma linha),
> e a mitigação do **Risco 8** era **vazia**. Pior: o modo de falha é confortável — o @dev roda,
> vê 1 erro, conserta, `type-check` verde, e conclui que mapeou os consumidores.

**Reescrevi a AC6 em quatro vias:** `grep` volta a ser o **mapa primário** (e vira AC); o
`type-check` vira **rede secundária**, apertada por **subtração** (estreitar os dois parâmetros
`role: string` para `Message["role"]` — medido: passa a acender, `TS2345` — e **remover os dois
casts**, que só existem para calar o compilador); a lista de erros vai colada **antes e depois** das
subtrações; e **o que o compilador não pega fica nomeado por escrito**, hoje `lastAssistantMsg` e
`enrich-leads`. **Saber onde a rede tem buraco vale mais que achar que não tem.**

## 3.3 A ordem — @sm × @pm. **Concordo com os dois, e eles não se contradizem.**

O @sm diz *"o `lastAssistantMsg` se resolve ordenando, não fundindo"*. O @pm diz *"fundir destrói a
leitura de M1/M2, porque as duas mexem no mesmo `history` em eixos diferentes"*. **São o mesmo
argumento visto de dois lados**: o @sm fala do **artefato** (uma AC por eixo), o @pm fala da
**medição** (uma variável por deploy). Não há arbitragem a fazer — a conclusão dos dois é idêntica e
está certa: **stories separadas, `W1-7` depois do `W1-1`.**

### 🔴 Mas a condição de escape decide isso por um percentual **sem denominador declarado**

*"Menos de 10 % das conversas ativas passam de 20 mensagens"* admite quatro leituras. Medi as quatro:

| população | convs | > 20 msgs | % | escape dispara? |
|---|---|---|---|---|
| todas com atividade | 338 | 30 | **8,9 %** | ✅ sim |
| só as que têm corretor | 286 | 24 | **8,4 %** | ✅ sim |
| só as que têm Nicole ativa | 136 | 23 | **16,9 %** | ❌ não |
| **Nicole E corretor** — *a população que a story muda* | **85** | **17** | **20,0 %** | ❌ **não, com folga** |

**Duas leituras liberam a fila, duas a mantêm, e as que a mantêm são as certas** — a janela só é
disputada onde existem os dois interlocutores; nas 253 conversas sem Nicole ativa o `limit(20)` não é
lido por ninguém. Denominador declarado na story e na T0. **Medido: 20,0 %, o dobro do limiar. O
escape não dispara e a ordem "depois do `W1-1`" fica confirmada por número, não por preferência.**

> É a **mesma classe de defeito** que eu apontei ontem na 87-3 (causa (a) do bloco de calibração).
> Uma régua percentual sem denominador declarado responde o que quiserem perguntar. **Pedi ao @pm a
> mesma declaração no Epic 87 §7/Onda 1**, senão o epic autoriza o que a story proíbe.

## 3.4 Cabe na Onda 1? **Sim.**

A regra de corte é *"nenhuma story pode adicionar um novo caminho de decisão da Nicole"*, e as duas
AC que sustentam o encaixe estão na direção certa, verificado no código:

- **AC3** restringe o `lastAssistantMsg` à Nicole → **menos** coisas ligam o gate. E **corrige** um
  defeito vivo: hoje `loadConversationHistory` nem seleciona `metadata`, então as **104** transições
  humanas são indistinguíveis e **já ligam** o gate por fala de gente.
- **AC4** faz `buildNoReintroContext` contar `assistant` **ou** `broker` → **mais** supressão de
  reapresentação. Suprimir apresentação indevida não causa dano; produzir uma causa constrangimento.

**As duas são subtração de comportamento. Cabe.**

### Uma AC estava apoiada numa premissa falsa — a AC8

`generateHandoffSummary` **nunca imprime fala da Nicole**. A única seção que cita mensagens filtra:

```ts
// handoff.ts:141
const userMessages = messages.filter((m) => m.role === "user")
```

Então *"o resumo pode atribuir ao robô o que o humano disse"* **não pode acontecer** — o resumo
descarta tudo que não é `user`. O efeito real de deixar o corretor entrar é o **`TOTAL DE MENSAGENS`**
(linha 154) inflar. **E a "correção mínima" que a AC propunha — *"o resumo passa a marcar o autor"* —
seria acrescentar conteúdo ao handoff: comportamento novo, proibido na Onda 1 pela mesma regra que a
story invoca três parágrafos antes.** AC8 reescrita como **não-regressão**.

## 3.5 A identificação de imóvel fora? **✅ Correto.**

Verificado em `pipeline.ts:1150-1158`: `contextPropertyId` só preenche quando `property_interest_id`
está vazio. Deixar a fala do corretor alimentar isso faz o sistema **passar a acreditar** em algo que
hoje não acredita — caminho de decisão novo, proibido na Onda 1. **É a mesma disciplina que manteve o
`detect-appointment.ts:71` fora da 87-4, e é bom que seja a mesma.** A AC9 testa a **não**-mudança,
que é o formato certo para uma exclusão deliberada.

## 3.6 Mais três achados

**A — A exposição está superdimensionada em ~32×, e isso quebra a AC12.**

```
conversas com fala de corretor (30 d)          286
… ainda com is_ai_active = true                  9
```

Em **277 das 286** a Nicole está desligada e nunca mais vai ler aquele histórico. O cabeçalho dizia
*"muda o que a Nicole vê em 287 conversas"*. **Isso baixa o risco de regressão** — e **cobra um preço
na AC12**: reativação acontece **7 vezes em 30 dias (0,23/dia)**, então uma janela de 24 h tem
**~21 % de chance** de produzir um caso espontâneo. *Uma AC que espera um evento que provavelmente
não acontece na janela não é validação, é torcida.* AC12-(i) passa a ser **cenário provocado com
telefone de teste**, como a AC10 da 87-4 já faz.

**B — A AC7 não fechava.** `loadConversationHistory` é **privada** de `pipeline.ts` (linha 1534),
não exportada por `chat/index.ts` nem por `packages/ai/src/index.ts` — e o `enrich-leads` vive em
`packages/web`. *"Um carregador, não dois"* exige **exportá-la de `@trifold/ai`**, que é a mesma
manobra que a AC7 da 87-3 faz com a `detectAffirmedSlot`. Entrou na T2. E deixei escrito que
`grep '\.in("role"'` devolve **16** ocorrências, das quais só **2** são histórico de conversa — as
outras 14 são filtro de `users.role` — para o @dev não sair consertando 16 lugares.

**C — Números remedidos** (a direção e a magnitude se sustentam; o T0 remede de qualquer forma):

| | story diz | **medido 07/08** |
|---|---|---|
| broker | 882 msgs / 287 convs | **900 / 286** |
| user | 867 / 181 | **873 / 182** |
| assistant | 612 / 136 | **612 / 136** |
| reativação | 9 convs / 31 respostas | **7 convs / 27 respostas** |
| placeholders `[Arquivo]`/`[Mídia]`/`[Áudio]` | — | **105 (12 % das falas do corretor)** |

Os 105 placeholders não carregam negociação e **comem o orçamento de 20**. Filtrá-los é subtração e
cabe na Onda 1 — virou decisão explícita da T0, para não ser inventada na implementação.

## 3.7 Checklist

| # | Critério | Nota |
|---|---|---|
| 1 | Título | ✅ |
| 2 | Descrição | ✅ — o bloco "três defeitos, e os dois primeiros são a mesma raiz" é exemplar |
| 3 | **AC testáveis** | 🔴 → ✅ **após AC6, AC7, AC8 e AC12**; quatro AC estavam apoiadas em premissa não medida |
| 4 | Escopo IN/OUT | ✅ — AC9 é o modelo de como escrever uma exclusão |
| 5 | Dependências | ✅ (`W1-1 em prod`; e o deploy B atrás da 87-4) |
| 6 | Estimativa **M** | 🟡 apertado com a consulta de nomes e a exportação do carregador; defensável |
| 7 | Valor | ✅ |
| 8 | Riscos | ✅ 9 riscos, com a mitigação do 8 trocada |
| 9 | DoD | ✅ |
| 10 | Alinhamento com o Epic | ✅ o `W1-7` já está no Epic 87 v0.5, §7/Onda 1, deploy 4, com `stories_planned` |

**8/10 → GO condicional, com as correções já aplicadas. Status `Ready`.**

---

# 4. Sobre a mudança de gate — o ponto que o @pm e o @sm levantaram

> *"Com o número dimensionando em vez de aprovar, um instrumento que publica 0 % falso encolhe ou
> incha a v1 errado — e v1 subdimensionada é falha silenciosa."*

**Concordo, e o meu achado principal desta rodada é a prova empírica disso.** A 87-3 v0.3 registra
esse raciocínio nos Riscos 7 e 8 e o usa para justificar a AC2-b. **Mas o 0 % chegou por outra
porta** — a precedência dos baldes — e a AC2-b **não olha para ela**. O raciocínio estava certo e a
guarda estava no lugar errado.

**A lição, e ela vale para as três stories:** *"o instrumento pode publicar um número falso"* não é um
risco que se fecha com **uma** guarda. Fecha-se **publicando a sensibilidade**. É por isso que a
AC3-(i-b) não pede só a ordem certa — pede **o número nas duas leituras**, lado a lado. Um
dimensionamento errado é mais difícil de contestar que uma reprovação errada, e a única defesa barata
contra isso é o instrumento **mostrar do que ele depende**.

---

# 5. Ordem de execução

```
1. @dev  → 87-3   (read-only, sem dependência real, e é a régua de M1/M4 das outras duas)
2. @pm   → 3 edições de epic (§6)          ·  @data-engineer → T0-a da 87-4 (uma linha)
3. @dev  → 87-4   deploy sozinho, 24 h, D7 com responsável nomeado
4. …     → W1-3b em prod → W1-1 em prod
5. @dev  → 87-5   deploy A sozinho, 24 h  ·  deploy B ≥24 h depois, com a 87-4 em prod
```

> A **87-5 é deploy 4 da Onda 1** e fica atrás de `W1-3b` e `W1-1`, **que ainda não têm story**.
> Ela está `Ready` no sentido de *validada e sem mérito pendente* — não no sentido de *desbloqueada*.
> **O @dev começa pela 87-3.**

# 6. Para o @pm — três edições de epic

| # | Edição | Onde |
|---|---|---|
| **P1** | **Condição de escape do `W1-7` precisa do denominador declarado** — *"conversas com mensagem `assistant` E `broker` nos últimos 30 dias"*. Medido: **20,0 %**, o dobro do limiar. Sem isso o epic autoriza o que a story proíbe, com o mesmo número | Epic 87, §7/Onda 1 |
| **P2** | **`W1-3a`: executar ou dispensar por escrito.** É `Depende de` declarado do `W1-2b` e não tem registro. Tamanho medido: **1 lead** (Marilda) | Epic 87, §7/Onda 1 |
| **P3** | **Esforço do `W0-5`: S → M** na tabela da Onda 0 (a story está em M desde a v0.2) | Epic 87, §7/Onda 0 |

**A5 continua pendente no Epic 88** (repontar o `depends_on` do `88-7` para *"W1-2c — metade de
ESCRITA"*), se ainda não entrou na v0.4.

---

**CodeRabbit Integration:** Disabled (sem chave `coderabbit_integration` em `.aios-core/core-config.yaml`)

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-07 | 1.0 | Revalidação da **87-3** (🔴 NO-GO 6/10 → ✅ **GO 9/10**) e da **87-4** (🟡 7/10 → ✅ **GO 9/10**), e primeira validação da **87-5** (✅ **GO condicional 8/10**). As três promovidas a `Ready`. **B1–B8 e C1–C4 conferidas com evidência de arquivo e de banco, uma a uma.** Achado principal: a régua da 87-3, com o balde `lembrete` que eu mesmo pedi, ficou **sem precedência declarada** — e as ordens possíveis dão **0,0 % · 8,7 % · 12,5 %** para os mesmos 60 dias, porque o INSERT do appointment precede a fala em **0,09–0,87 s** nos 6 casos `created_by='nicole'`, o que torna `com_lastro` **inalcançável por construção** e publica 0 % com AC1, AC2, AC2-b e AC4 **verdes**. Corrigido com ordem normativa, janela bilateral de 15 min e a **AC3-(i-b)**, que obriga a publicar o número **nas duas leituras**. Na 87-5: o `type-check` alargado acha **1 dos 6** consumidores (medido em `tsc --strict`) e o `lastAssistantMsg` é invisível em qualquer variante — AC6 reescrita; `metadata.broker_id` existe em **0 das 900** falas de corretor (o campo certo é `signed_as`/`sent_by`); a condição de escape tem **quatro denominadores possíveis** (8,4 % · 8,9 % · 16,9 % · **20,0 %**) e os dois corretos **mantêm a ordem depois do `W1-1`**; a AC8 se apoiava numa premissa falsa (`generateHandoffSummary` só imprime `role='user'`); e a exposição viva é de **9 conversas**, não 287, o que torna a AC12 inexequível por taxa-base (~21 % em 24 h). Na 87-4: **`W1-3a` é `Depende de` declarado e nunca foi executado** — tamanho medido: **1 lead**; e **39 dos 56** estados residuais têm o cron `enrich-leads` como último escritor, o que reforça a C1. | @po (Pax) |
