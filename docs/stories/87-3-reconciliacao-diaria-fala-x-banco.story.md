# Story 87-3 — Reconciliação diária fala × banco: a Nicole afirmou uma visita que o banco não tem

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
**Item do roadmap:** **W0-5** (Onda 0) — 🔴 criado pelo @pm na v0.3 do epic (07/08), a partir do
debate do @architect (`2026-08-07-debate-tool-use-nicole.md` §2.3, §4-(a) e §7.3 item 0.2)
**Criada por:** @sm (River) em 2026-08-07
**Formato:** Observabilidade + instrumento de medição. **Não muda uma palavra do que a Nicole fala.**
**Executores:** @dev (módulo + cron + testes) · @devops (registro do cron e prova de execução em prod) ·
@data-engineer (só se a consulta retroativa de 60 dias precisar de índice)
**Esforço:** **M** (era S na v0.1 — o @po apontou que régua de **quatro** baldes + discriminador
visita×ligação + rodada retroativa + cron + dedupe não cabem em S) ·
**Risco de regressão em produção:** **Nenhum** (só leitura + alerta)

> ## Por que esta story é a primeira da fila
>
> Em **28/06** a lead **Célia** escreveu `"As 9"`. A Nicole respondeu *"Perfeito! Agendei sua visita
> para este sábado às 9h."* **Zero `appointments` até hoje** — 40 dias. Ninguém corrigiu à mão,
> ninguém percebeu. O caso só apareceu porque o @po leu conversa por conversa numa auditoria manual
> de 8 semanas, em 06/08.
>
> **A falha de parser durou 5 semanas e custou uma cliente. A falha de detecção durou as mesmas
> 5 semanas e custou todas as outras.** Enquanto nada compara a fala com a linha no banco, todo
> defeito novo — de parser, de gate, de estado, de expediente — tem tempo de descoberta medido em
> semanas e um descobridor humano por acidente.
>
> **Nenhum outro item dos Epics 87 e 88 detecta a Célia.** Custo desta story: uma consulta e um cron.

> ## ⚠️ Esta story é o INSTRUMENTO que DIMENSIONA o Epic 88
>
> **O gate de existência foi REVOGADO** (Epic 87 v0.4 · Epic 88 v0.3, 07/08). Ele dizia
> *"lastro ≥ 90% → a tool de escrita não se justifica"*. **Não é mais isso.** Decisão do Gabriel:
> *"tool use é arquitetura de agente, deveria ser feito de maneira sênior independente de outro
> resultado"*. **O Epic 88 acontece.**
>
> O que o número decide agora é **sequenciamento e dimensionamento** (a chave do frontmatter virou
> `sequenciamento_e_dimensionamento`): **quando** o Epic 88 sobe, **com que escopo**, e **quantas
> tools entram na v1**. O `PM2` do Epic 88 continua sendo esta métrica — e **hoje ela não tem
> instrumento**. Ela existe apenas em scripts ad-hoc do @architect e do @po.
>
> Consequência direta e não negociável de escopo: **esta story precisa entregar o número, não só o
> alarme.** Um cron que dispara alerta e não publica a taxa deixa o Epic 88 sem como ser
> dimensionado. Ver **AC3**.
>
> ⚠️ **E a revogação do gate AUMENTA a exigência sobre a calibração, não diminui.** Enquanto o
> número era um interruptor, um instrumento errado aprovava ou reprovava o epic inteiro — falha
> ruidosa, com chance de alguém contestar. **Agora ele dimensiona:** um número falsamente baixo
> **encolhe a v1 errado**, e uma v1 subdimensionada é uma falha *silenciosa* — ninguém reclama do
> escopo que nunca foi escrito. Ver Riscos 7, 8 e 9.

---

## Story

**Como** engenharia e produto da Trifold, que descobrimos por acidente — 40 dias depois — que a
Nicole confirmou uma visita que nunca existiu,
**Queremos** uma rotina diária que compare o que a Nicole **afirmou** na conversa com o que existe
em `appointments`, alerte com nome e produza a taxa de lastro,
**Para que** o tempo de descoberta de qualquer defeito de agenda caia de **semanas** para **um dia**,
e para que a decisão entre "consertar o determinístico" e "construir a tool" seja tomada contra um
número medido e não contra uma convicção.

---

## Context — o que foi medido (não inferido)

### O que existe hoje

| Sinal | Estado medido | Fonte |
|---|---|---|
| `NICOLE_SLOT_MISMATCH` | **0 eventos em toda a história do `system_events`** | @po, 06/08 |
| Evento entre "o gate de agendamento abriu" e `APPOINTMENT_CREATED` | **não existe nenhum** | @architect, §1 ponto 8 |
| Comparação entre a fala da Nicole e a tabela `appointments` | **não existe em lugar nenhum do sistema** | @architect, §2.3 |
| `appointments` com `created_by='nicole'` | **6 no total do projeto**, último em 31/07 | @po, §5.3 |

**Zero aqui não é sucesso — é cegueira.** A `detectSlotMismatch` (`pipeline.ts:109-120`) retorna
`null` quando `authorizedSlotUtc` é `null`, ou seja, é cega exatamente no cenário do agendamento
fantasma; e o caso **Ailton** (30/07 22:17) prova que ela **também** não disparou num caso em que
`authorizedSlotUtc` **não** era null (slot autorizado 10:00, a Nicole afirmou 9h).

### Os OITO casos que a rotina precisa listar

Auditados no banco de produção `dsopqkqjkmhytudaaolv` pelo @po (06/08), ratificados pelo
@architect (07/08) e **remedidos disparo a disparo pelo @po em 07/08**
(`docs/qa/po-validation-87-3-87-4.md` §1.2). **Este conjunto é AC, não sugestão** — condição de
aceite nº 2 do @architect (`2026-08-07-debate-tool-use-nicole.md` §9): *"o job, rodado sobre 60 dias
retroativos, lista Célia, Helena, Miriam, Sandra, Sueli, Valnira e Maria Oliveira. Se não listar,
ele não serve."* O Ailton entra por ser o caso de mismatch com slot autorizado (§1 do Context).

> ⚠️ **A v0.1 desta story tinha três listas diferentes em três lugares** — a AC1 nomeava oito e
> chamava de "os sete casos"; a tabela abaixo tinha sete **sem a Sandra**; a condição nº 2 do
> @architect tem sete **com Sandra e sem Ailton**. **Medido: a lista certa tem oito.** Sandra e
> Ailton são detectados pela `detectAffirmedSlot`. A tabela abaixo é a lista canônica.

| # | Lead | Fala (data/hora **medida**) | O que ela afirmou | Slot resolvido (ancorado) | O que o banco tem |
|---|---|---|---|---|---|
| 1 | **Célia** | 28/06 13:37 | *"Agendei sua visita para este sábado às 9h"* | 04/07 09:00 BRT | **nada, até hoje** (reconferido 07/08) |
| 2 | **Helena** | 23/06 21:11 e 21:15 BRT (2 falas) | *"Te espero no sábado às 10h"* | 27/06 10:00 BRT | `appointment` criado por **corretor** na manhã seguinte |
| 3 | **Miriam** | 07/07 14:50 e 14:51 (2 falas) | *"Te esperamos amanhã, dia 8 de julho, às 11h"* | 08/07 10:00 e 11:00 BRT | `appointment` criado por **corretor** na madrugada seguinte |
| 4 | **Ailton** | 31/07 01:05, 01:17 e 01:18 UTC (**3 falas**) | *"sábado 1º de agosto, **às 9h**"* | 03/08 12:00 · 01/08 **09:00** · 01/08 **10:00** | slot autorizado era **10h** — mismatch de 1h na fala das 01:17 |
| 5 | **Sandra** | 05/08 14:55 | *"Sábado, dia 8, está anotado… vai até as 12h"* | 08/08 12:00 BRT | a conferir na rodada |
| 6 | **Sueli** | 03/08 21:53 | *"**Vou confirmar a disponibilidade** para sexta, dia 7, às 14h **e já te aviso**"* | 07/08 14:00 BRT | `broker` criou em 04/08 (12:55 UTC) |
| 7 | **Valnira** | 04/08 00:09 e 00:10 UTC (2 falas) | *"a quinta-feira às 10h está confirmada"* | 06/08 10:00 BRT | `admin` criou em 04/08 11:21 |
| 8 | **Maria Oliveira** | 06/08 10:04 e 10:05 (2 falas) | sábado às 11h | 08/08 11:00 BRT | `admin` criou 06/08 09:22 |

> **A divergência da data da Helena está RESOLVIDA — não gaste tempo com ela.** As mensagens são
> `2026-06-24 00:11` e `00:15` **UTC** = `2026-06-23 21:11` e `21:15` **BRT**. O @po registrava
> 23/06 (BRT) e o @architect 24/06 (UTC): **as duas fontes estavam certas**. Convenção fixada por
> esta story: **o relatório reporta em BRT**, e a saída do job traz o UTC ao lado quando houver
> ambiguidade de dia.

> **A citação da Sueli na v0.1 estava errada.** A frase *"Te espero por lá"* **não contém dia+hora e
> não dispara** a `detectAffirmedSlot`. A única fala dela que dispara é a interrogativa/promissória
> acima — que é **literalmente uma das seis strings** que a Dev Note 3 desta story cita como falso
> positivo e que a condição nº 7 do @architect manda eliminar no Epic 88.

> ### 📅 A AC1 tem VALIDADE DATADA — leia antes de reproduzir a lista
>
> Esta lista de oito vale contra o **`HEAD` de 07/08/2026**. Cinco dos oito casos (Sueli, e também
> Adriele, Célia 13:36, Sandra e Ailton 01:05 entre os disparos não-AC) só aparecem porque a
> `detectAffirmedSlot` tem ~79% de precisão e dispara em pergunta/oferta.
> **Quando a guarda de interrogação do Epic 88 (condição nº 7 do @architect) subir, o conjunto E o
> denominador mudam, e a Sueli sai do relatório.** Quem subir aquela guarda **tem de republicar o
> baseline** — isso vira linha no runbook do `W0-3` (ver T7). A AC1 não é irreproduzível: ela é
> datada, e a data está escrita.

### O que a definição da métrica muda — e por que ela é metade da story

**O custo atual do defeito não é (só) visita perdida — é trabalho manual de reparo, invisível,
feito por quem descobre o furo lendo a conversa.**

```
Sueli    broker  slot 07/08 14:00  criado 04/08 12:55   (fala foi 03/08 21:53)
Valnira  admin   slot 06/08 10:00  criado 04/08 11:21   (fala foi 04/08 00:09 UTC)
Maria    admin   slot 08/08 11:00  criado 06/08 09:22   (fala foi 06/08 10:04)
```

**Os três incidentes têm `appointment` no horário certo.** Todos criados por um humano, horas
depois, por alguém que leu a conversa e consertou. **Numa definição frouxa, os três casos que
motivaram os dois epics contariam como sucesso.** Por isso a rotina não pode ter dois estados
(com/sem lastro). Ela precisa de **quatro** — e dois deles são invisíveis hoje. Ver **AC3**.

> ### 🔴 O baseline de 31% / 81% NÃO é o número deste instrumento. Não persiga aquele número.
>
> A v0.1 desta story exigia, por AC, que o instrumento reproduzisse **31%** de lastro estrito e
> **81%** de lastro frouxo, com tolerância de ±5 p.p. **O @po rodou a régua exatamente como esta
> story a especificava, contra 60 dias de produção, em 07/08:**
>
> ```
> RÉGUA DA v0.1 (janela ±30min, status ∈ scheduled/confirmed/completed,
>                com_lastro = created_by='nicole' E created_at ≤ fala+2min)
>   total=30   com_lastro=2   reparo_humano=7   sem_lastro=21
>   lastro_pct = 7%      lastro_frouxo_pct = 30%
>
> VARIANTE com cancelled/no_show incluídos
>   total=30   com_lastro=3   reparo_humano=14  sem_lastro=13
>   lastro_pct = 10%     lastro_frouxo_pct = 57%
> ```
>
> **Nenhuma das duas chega perto de 31%/81%.** Não é ruído — são quatro causas estruturais, todas
> medidas:
>
> | # | Causa | Efeito |
> |---|---|---|
> | **(a)** | **Denominador diferente.** O `31%` é `5/16` — um conjunto **curado à mão** de 16 falas. O instrumento conta **todo disparo da `detectAffirmedSlot`: 30** | Duas métricas diferentes com o mesmo nome |
> | **(b)** | **A unidade nunca foi declarada.** Quase todo incidente gera **duas** falas (Helena×2, Célia×2, Miriam×2, Valnira×2, Sandra×2, Maria×2, Wilson×2, Edicleia×2, Marlene×2, Ailton×3). A auditoria manual contou **casos**; o instrumento conta **falas** | Move o percentual por um fator |
> | **(c)** | **O filtro de `status` da v0.1 contradizia a própria Dev Note 4.** **34 das 63** appointments do período são `no_show`/`cancelled`. Excluí-las derruba Helena, Miriam, Andréia, André e Valnira — que **têm** appointment no horário exato (`dv = 0 min`) — para `sem_lastro` | **27 p.p. sozinho** (30% → 57% no frouxo) |
> | **(d)** | **Faltava o balde `lembrete`.** O par (`created_by` + janela de 2 min) **não pega** o appointment criado **ANTES** da fala. Medido: 4 dos 30 disparos (Marlene ×2, Edicleia ×2) são **lembretes** de visitas que o corretor já tinha marcado, e a régua os rotula *"um humano consertou"* | **Viés na direção da decisão que a métrica alimenta** |
>
> A causa **(d)** é a mais séria e não é só imprecisão. O número **dimensiona o Epic 88** — quando
> sobe, com que escopo, quantas tools na v1. Uma régua que **subconta** lastro faz o determinístico
> parecer pior do que é, e **infla** o escopo que a tool precisa cobrir.
> **Uma métrica cujo viés aponta para a conclusão que ela deveria arbitrar não é instrumento — é
> advogado.** Isso valia quando o número era interruptor e continua valendo agora que ele é régua de
> tamanho: **um dimensionamento errado é mais difícil de contestar que uma reprovação errada.**
>
> **O `31%`/`81%` fica registrado nesta story como `baseline manual, superado`.** O número oficial
> passa a ser o que **este instrumento** publicar, e a AC3 exige que a diferença para o baseline
> manual seja **explicada linha a linha**, não arredondada. Ver **AC3**.
>
> ✅ **O que a medição do @po CONFIRMOU e não muda:** o par de filtros (`created_by='nicole'` **e**
> `created_at ≤ fala+2min`) sustenta o que promete — removendo qualquer um dos dois, **Sueli,
> Valnira e Maria Oliveira viram `com_lastro`**. O vermelho obrigatório da AC3-(iii) **vai** ficar
> vermelho.

---

## Escopo

### IN

1. Módulo puro de reconciliação em `packages/ai/src/flows/agenda-reconcile.ts`, exercitável pelo
   harness `__fixtures__/fake-supabase.ts` (Story 75-279) — **usar, não recriar**.
2. Cron diário `GET /api/cron/nicole-agenda-reconcile` (thin wrapper: auth + chamada + alerta).
3. Modo retroativo (`?days=60`) e modo seco (`?dry=1`), para produzir o baseline e fechar a AC1.
4. Evento por caso (`NICOLE_AFIRMACAO_SEM_LASTRO`) + evento diário de resumo
   (`NICOLE_LASTRO_DIARIO`) com os três baldes.
5. Alerta nomeado por Telegram admin, reusando `sendTelegramAdminAlert` (já existe e já é usado
   por `webhook-health`).
6. Mover `detectAffirmedSlot` de `chat/pipeline.ts` para `flows/visit-slot.ts` **com re-export**,
   para o módulo poder reusá-la sem criar ciclo `flows → chat → flows` (ver Dev Notes).
7. **Discriminador visita × ligação, dentro do `agenda-reconcile.ts`** — filtro do módulo, aplicado
   **antes** da classificação. É o que faz a AC1-b existir em código e não só em promessa
   (ver Desenho §5).

### OUT — decidido, não esquecido

- **Não mexer no comportamento da `detectAffirmedSlot`.** A guarda de interrogação (a função tem
  ~79% de precisão: 5 dos 30 disparos em 60 dias são pergunta ou oferta — medição do @po, 07/08) é
  **item do Epic 88**. Mexer nela aqui é invadir escopo alheio e mudar a régua no meio da medição.
  > **Este `OUT` está mantido de propósito, e o @po o ratificou.** Ele **não** conflita com a AC1-b:
  > o discriminador visita×ligação mora no **módulo** (`agenda-reconcile.ts`), não na função
  > compartilhada. `detectAffirmedSlot` continua disparando na Silvana — o módulo é que a
  > **descarta** antes de classificar. Ver Desenho §5.
- **Não bloquear, não corrigir, não escrever nada em tabela de negócio.** Esta rotina é read-only.
  Enforcement é Onda 3 (W3-2c). Ver **AC5**.
- **Não criar tabela nem migration.** `system_events` já existe e já é o canal de medição declarado
  pelo epic. Nenhuma migration prevista nesta story.
- **Não contatar lead.** A remediação comercial da Célia e dos demais é **D8, lado cliente**, aberta
  e registrada em `docs/backlog.md`. O job produz a lista; a decisão é do Gabriel.
- **Não reconciliar compromisso de LIGAÇÃO.** A Nicole promete "o corretor te liga segunda às 9h" e
  nada é gravado (`lead_tasks` só tem `source: 'manual'`) — mesma classe de dano, caminho diferente.
  Está em `docs/backlog.md` como item próprio. Misturar visita e ligação na mesma rotina foi
  exatamente o erro que fez a **Silvana** entrar como incidente de agenda quando não era.
  > **Reconciliar ligação está OUT; DESCARTAR ligação está IN** (Desenho §5, item 7 do `IN`). São
  > coisas diferentes: a rotina não vai atrás de `lead_tasks`, ela só se recusa a tratar promessa de
  > ligação como promessa de visita. Sem esse descarte, a Silvana **entra** no relatório — foi o
  > furo medido pelo @po na v0.1.

---

## Desenho

### 1. O módulo (puro onde dá, testável inteiro)

```
packages/ai/src/flows/agenda-reconcile.ts

  classificarFala(input: {
    falaId: string
    conteudo: string
    faladoEm: Date              // ← created_at da mensagem, NUNCA new Date()
    appointmentsDoLead: Array<{ id, scheduled_at, created_at, created_by, status }>
  }): {
    afirmou: Date | null        // detectAffirmedSlot ancorada em faladoEm
    balde: "com_lastro" | "reparo_humano" | "lembrete" | "sem_lastro" | null
    appointmentId: string | null
    divergenciaMin: number | null   // |afirmado - agendado| quando há appointment perto
    descarte: "ligacao" | "transicao_humana" | "data_invalida" | null
  }

  reconciliarAgenda(supabase, { desde: Date, ate: Date, orgId }): Promise<RelatorioLastro>
```

### 2. A régua — unidade, denominador e os QUATRO baldes

#### 2.0 A unidade, declarada por escrito (o @po apontou que ela nunca esteve)

| Objeto | Unidade | Por quê |
|---|---|---|
| **linha do relatório** e **denominador** | **a fala** (`message_id`) | É o que a `detectAffirmedSlot` produz; é auditável um a um; não depende de agrupamento arbitrário |
| **alerta** (Telegram + `system_event`) | **lead + dia** | Senão o time recebe *"o Ailton está sem lastro"* ao lado de *"o Ailton tem lastro"* no mesmo push. Ver **AC4** |

> **Consequência que precisa estar escrita:** o denominador do instrumento é **todo disparo da
> `detectAffirmedSlot` na janela** — 30 em 60 dias, não 16. Quase todo incidente gera **duas** falas.
> Este número **não é comparável** ao `5/16 = 31%` da auditoria manual, e a AC3 proíbe forçá-lo a ser.

#### 2.1 O filtro de `status` — contradição resolvida por escrito

A v0.1 mandava contar só `scheduled/confirmed/completed` no Desenho, e a Dev Note 4 argumentava
exatamente o contrário. **Decisão, com o número dos dois lados:**

```
excluindo cancelled/no_show   →  lastro 7%   ·  frouxo 30%
incluindo cancelled/no_show   →  lastro 10%  ·  frouxo 57%      ← ESCOLHIDO
```

> **DECISÃO: `cancelled` e `no_show` CONTAM.** A pergunta que a métrica faz é *"quando ela falou,
> existia a linha no banco?"* — e uma visita desmarcada depois **existiu**. **34 das 63**
> appointments do período são `no_show`/`cancelled`; excluí-las derrubaria Helena, Miriam, Andréia,
> André e Valnira (que têm appointment no horário **exato**) para `sem_lastro`, inflando o alarme
> com casos que funcionaram. O campo `status` **vai no relatório**, por linha, para quem quiser
> recortar depois. Recomendação do @po (`po-validation-87-3-87-4.md` §1.4-c), adotada.

#### 2.2 Os quatro baldes

Para cada fala em que `afirmou !== null` **e que sobreviveu aos descartes (§5)**, procurar
`appointments` **daquele lead** com `|scheduled_at − afirmou| ≤ 30 min`, **qualquer `status`**:

**A ordem de avaliação é NORMATIVA e é a de cima para baixo.** Ver o bloco 🔴 logo abaixo da tabela:
sem essa ordem escrita, a mesma régua publica **0,0%, 8,7% ou 12,5%** sobre os mesmos 60 dias.

| # | Balde | Regra | Significa | Entra no denominador? |
|---|---|---|---|---|
| 1º | **`com_lastro`** | existe appointment com `created_by = 'nicole'` **e** `\|created_at − faladoEm\| ≤ 15 min` (**janela BILATERAL**, constante nomeada `JANELA_MESMO_TURNO_MIN = 15`) | O INSERT é o **mesmo turno** da fala. É o sistema funcionando. | ✅ (numerador) |
| 2º | **`reparo_humano`** | existe appointment com `created_by ∈ ('broker','admin')` **e** `faladoEm < created_at` | Um humano leu a conversa **depois** e consertou. **NÃO é lastro.** | ✅ |
| 3º | **`lembrete`** 🆕 | existe appointment com **`created_at < faladoEm`** que **não** caiu em `com_lastro` | A visita **já existia** quando ela falou. Ela está **lembrando**, não agendando. **Ninguém consertou nada.** | ❌ **fora do numerador E fora do denominador** |
| 4º | **`sem_lastro`** | não existe appointment nenhum na janela | O lead acredita ter visita e não tem. **Alerta.** | ✅ |

> ### 🔴 Correção do @po (07/08, medida) — sem precedência declarada, `com_lastro` é INALCANÇÁVEL
>
> A v0.3 descrevia os quatro baldes **sem dizer em que ordem eles são testados**, e as regras de
> `com_lastro` (`created_at ≤ faladoEm + 2 min`) e de `lembrete` (`created_at < faladoEm`) **se
> sobrepõem inteiramente**. O @po rodou a régua desta story contra os 60 dias de produção nas duas
> ordens possíveis:
>
> ```
> lembrete avaliado primeiro   →  com_lastro=0   lembrete=8   denominador=21   lastro_pct = 0,0 %
> janela bilateral de ±2 min   →  com_lastro=2   lembrete=6   denominador=23   lastro_pct = 8,7 %
> com_lastro avaliado primeiro →  com_lastro=3   lembrete=5   denominador=24   lastro_pct = 12,5 %
> ```
>
> **A causa é estrutural e foi medida appointment a appointment:** o INSERT do `appointment` acontece
> ANTES de a fala ser persistida em `messages`, **nos 6 appointments `created_by='nicole'` do
> projeto**, com defasagem de **0,09 s a 0,87 s**:
>
> ```
> Emerson  appt 17:47:13,507   fala 17:47:14,379   Δ = 0,87 s
> Idalina  appt 13:35:50,942   fala 13:35:51,111   Δ = 0,17 s
> JOSIETE  appt 11:44:03,940   fala 11:44:04,025   Δ = 0,09 s
> Wilson   appt 18:12:22,497   fala 18:12:22,656   Δ = 0,16 s
> Ailton   appt 01:05:32,367   fala 01:05:32,531   Δ = 0,16 s  (e a fala corretiva 12,8 min depois)
> ```
>
> Ou seja: **`created_at < faladoEm` é VERDADE para todo candidato a `com_lastro`.** Com `lembrete`
> testado primeiro, o balde `com_lastro` fica **vazio por construção** e o instrumento publica
> **`lastro_pct = 0 %` para sempre** — que é exatamente o modo de falha silencioso dos Riscos 7 e 8,
> chegando por uma porta que a **AC2-b não cobre**.
>
> **A janela do `com_lastro` é BILATERAL (`±15 min`) e não `+2 min`**, pelo mesmo motivo: o lado que
> importa é o de **antes** da fala, não o de depois. Os 15 min saem da medição (o maior Δ real num
> turno de confirmação é o do Ailton, **12,8 min**; os outros cinco são < 1 s) e existem para não
> deixar um appointment que a Nicole criou **dias antes** entrar como lastro do lembrete de hoje —
> esse cai em `lembrete`, como deve.
>
> ⚠️ **A AC4-(iii) depende desta mesma precedência.** Com `lembrete` primeiro, a fala corretiva do
> Ailton (01:18 → 10:00) sai como `lembrete` e **não** como `com_lastro`, a supressão *"a fala
> posterior que resolve `com_lastro` suprime o alerta da anterior"* **não dispara**, e o alerta
> contraditório que a AC4 existe para impedir acontece assim mesmo. **Uma raiz, duas AC.**

> ### 🆕 Por que o balde `lembrete` existe — e por que ele é a correção mais importante da v0.2
>
> Medido pelo @po, 4 dos 30 disparos:
>
> ```
> Marlene  02/08 19:01  "sua visita está marcada para segunda 3/08 às 16h"
>                        appointment broker, criado 31/07 18:20   ← DOIS DIAS ANTES da fala
> Marlene  03/08 18:15  "sua visita está confirmada para hoje às 16h"
> Edicleia 06/08 18:32  "sua visita já está marcada para amanhã, às 15h"
>                        appointment broker, criado 06/08 18:13   ← 19 MINUTOS ANTES da fala
> Edicleia 06/08 18:33  "Te espero amanhã às 15h"
> ```
>
> **Nenhum humano consertou nada nesses quatro.** São lembretes de visitas marcadas pelo corretor no
> fluxo normal — o sistema **funcionando**. A régua da v0.1 os rotulava *"um humano leu a conversa e
> consertou. NÃO é lastro"* e **derrubava o `lastro_pct`**. Isso é viés na direção da decisão que a
> métrica alimenta. Discriminante: **`created_at` do appointment × `faladoEm`.**

**`lastro_pct = com_lastro / (com_lastro + reparo_humano + sem_lastro)`** — `lembrete` fora dos dois
lados. **`lastro_frouxo_pct = (com_lastro + reparo_humano) / mesmo denominador`**, obrigatoriamente
impresso **rotulado como não-lastro**, e `lembrete` publicado como contador próprio ao lado.

### 3. A âncora — a armadilha que invalidaria a rodada retroativa inteira

`detectAffirmedSlot` recebe `now` e resolve expressões relativas contra ele. Rodar a reconciliação
de 60 dias com `now = new Date()` faz *"este sábado às 9h"* da Célia (28/06) resolver para **o
próximo sábado a partir de hoje** — e nenhum appointment de 2026-06 casaria, mas por acidente: a
data comparada estaria errada. Em falas mais recentes o erro se inverte e produz falso negativo.

> **`now` é sempre `messages.created_at` da própria fala.** É o mesmo defeito de âncora que a
> Story 87-4 corrige no estado — só que aqui ele é gratuito de evitar e caro de errar. Ver **AC2**.

**Magnitude medida pelo @po (07/08): dos 30 disparos, 25 mudam de valor** quando `now = new Date()`
em vez de `messages.created_at`. **83%.** E o erro tem **dois sinais**:

```
Célia   28/06  "este sábado às 9h"          ancorado 04/07 09:00   relógio de hoje  08/08 09:00
Ailton  31/07  "sábado, 1º de agosto, 9h"   ancorado 01/08 09:00   relógio de hoje  01/08/2027  ←
Helena  24/06  "sábado às 10h"              ancorado 27/06 10:00   relógio de hoje  08/08 10:00
Valnira 04/08  "quinta-feira às 10h"        ancorado 06/08 10:00   relógio de hoje  13/08 10:00
```

Para o passado, colapsa tudo no "próximo sábado" (falso negativo em massa). Para data com mês
escrito, salta para **2027** (`visit-slot.ts`, `parseDay`: data já passada no ano → ano seguinte).
Nos dois casos **o job roda, devolve JSON, não dá erro, e o baseline sai errado.**

**Auditoria de cadeia (feita pelo @po, e ela fecha):** `parseDay` é o **único** consumidor de relógio
em `visit-slot.ts` — `grep "new Date()" packages/ai/src/flows/visit-slot.ts` devolve **zero
ocorrências**. Passar `messages.created_at` fecha o furo **na cadeia de parse**.

### 3-b. 🔴 O TERCEIRO relógio: `Invalid Date` de `timestamptz` publica 0% com a AC1 verde

Este furo **não** é coberto pela AC2 e foi encontrado pelo @po ao escrever a própria sonda.

```js
new Date("2026-06-28 13:37:40.123+00")   // ← formato que o Postgres devolve para timestamptz
// →  Invalid Date       (o offset "+00" sem ":00" não é ISO-8601)
```

E `detectAffirmedSlot` **não devolve `null` nesse caso**: `brtParts(NaN)` propaga e a função devolve
**um objeto `Date` inválido**. Rodando a régua desta story em cima disso:

```
afirmou !== null            →  true      (é um Date, só que inválido)
|scheduled_at − afirmou|    →  NaN
NaN ≤ 30 min                →  false     →  TUDO cai em sem_lastro
lastro_pct                  →  0%
```

> **E a AC1 passaria.** Os oito casos apareceriam — todos como `sem_lastro`. A **AC2-(ii)**
> (estabilidade entre dois dias) **também** passaria: 0% é perfeitamente estável. O job publicaria
> **0% de lastro** — e o Epic 88 seria **dimensionado** contra um determinístico falsamente descrito
> como inútil, por causa de um bug de parsing de string. **A diferença entre "o instrumento falhou"
> e "o instrumento mentiu" custa 4 linhas.** Ver **AC2-b**.

### 4. O cron

| item | valor |
|---|---|
| rota | `GET /api/cron/nicole-agenda-reconcile` |
| agenda | **`38 11 * * *` (08:38 BRT)** — ver a nota de colisão abaixo |
| auth | `Authorization: Bearer ${CRON_SECRET}` — mesmo padrão de `webhook-health` e `sla-alerts` |
| janela padrão | últimas 24h |
| parâmetros | `?days=N` (retroativo) · `?dry=1` (calcula e devolve JSON, **não** emite evento nem alerta) |
| registro | `packages/web/vercel.json` → bloco `crons` |

> 🔴 **`30 11 * * *` (o horário da v0.1) COLIDE.** O @po conferiu os **35 crons** do
> `packages/web/vercel.json`. No minuto `11:30` já rodam:
>
> ```
> 30 11 * * *     /api/cron/billing-monthly-summary     ← colisão EXATA (vercel.json:159-162)
> */30 * * * *    /api/cron/enrich-leads
> */30 * * * *    /api/cron/webhook-health
> */30 * * * *    /api/cron/appointment-whatsapp-reminders
> */10, */5, */3, */15 …                                 ← todos batem em :30
> ```
>
> **`38 11 * * *` é o único minuto da faixa que não é atingido por nenhum `*/3`, `*/5`, `*/10`,
> `*/15`, `*/30` nem por cron de minuto fixo** (conferido: `grep '38 ' packages/web/vercel.json`
> devolve vazio). A justificativa da v0.1 (*"depois do `daily-report`, sem colisão"*) estava certa
> sobre o `daily-report` (`59 10 * * *`) e não conferiu o resto da lista.

### 5. 🆕 O discriminador visita × ligação — onde a AC1-b vira código

**O problema, medido:** a `detectAffirmedSlot` **não sabe** distinguir visita de ligação. A frase da
**Silvana** (24/07 23:41) — *"Segunda-feira às 9h **o corretor te liga**"* — tem dia + hora únicos,
não é ambígua, **a função dispara**, resolve `27/07 09:00 BRT`, e ela tem **zero appointments**
(tem `lead_tasks` com `action_type='ligacao'`, `due_at` 27/07 09:00, `completed_at` 27/07 09:39).
**Pela régua da v0.1 ela cai em `sem_lastro` e gera alerta nomeado — no primeiro dia de operação,
sobre o único caso que a AC1-b promete excluir.**

**Onde mora:** em `agenda-reconcile.ts`, como **filtro do módulo**, aplicado **antes** da
classificação. **Nunca** dentro da `detectAffirmedSlot` — mudar a função compartilhada invalida o
baseline e invade o escopo do Epic 88 (ver `OUT`).

```
classificarFala:
  1. afirmou = detectAffirmedSlot(conteudo, faladoEm)     ← intocada
  2. se faladoEm não é finito  → descarte: "data_invalida" (AC2-b)
  3. se PADROES_LIGACAO casa   → descarte: "ligacao"       ← a Silvana sai AQUI
  4. se metadata.is_transition → descarte: "transicao_humana"
  5. só então: classificar nos quatro baldes
```

**`PADROES_LIGACAO` — a lista escrita na story, não inventada na implementação:**

| padrão (case-insensitive, sem acento) | origem |
|---|---|
| `o corretor te liga` / `o corretor vai te ligar` | fala real da Silvana, 24/07 23:41 |
| `vou te ligar` / `te ligo` | variação de primeira pessoa |
| `ligação` / `ligacao` / `te ligamos` | substantivo |
| `te retorno por telefone` / `entro em contato por telefone` | variação formal |

**Regra de precedência, e ela importa:** se a fala contém padrão de ligação **e** palavra de visita
(*"visita"*, *"te espero"*, *"no stand"*, *"apartamento decorado"*), **a fala NÃO é descartada** —
vale como visita e é classificada normalmente. O descarte só vale quando a ligação é o **único**
compromisso da frase. Sem essa precedência, um *"te ligo para confirmar a visita de sábado às 10h"*
sumiria do relatório.

**Os descartes são CONTADOS e publicados** (`descartes: { ligacao, transicao_humana, data_invalida }`)
— um filtro que apaga em silêncio é a mesma cegueira que esta story existe para acabar.

---

## Acceptance Criteria

> Toda AC diz **como se verifica**. A AC1 é literalmente a condição de aceite nº 2 do @architect.

**AC1 — [@architect 07/08 §9, condição nº 2] A rodada retroativa de 60 dias lista os OITO casos.**
`GET /api/cron/nicole-agenda-reconcile?days=60&dry=1`, contra produção, devolve pelo menos uma linha
para cada um de **Célia, Helena, Miriam, Ailton, Sandra, Sueli, Valnira e Maria Oliveira** — **oito
leads e exatamente 16 falas**, contadas pelo @po contra os 60 dias de produção em 07/08:
**Célia×2, Helena×2, Miriam×2, Ailton×3, Sandra×2, Sueli×1, Valnira×2, Maria Oliveira×2**.
*(A v0.3 dizia "11 falas ou mais" e a lista de multiplicidade dela esquecia Célia×2 e Sandra×2 —
corrigido pelo @po com a rodada medida.)* Cada linha traz: nome do lead, `lead_id`, `message_id`, data/hora da
fala **em BRT**, trecho da fala, horário afirmado, balde, `status` do appointment e `appointment_id`
quando houver.
*Verifica-se:* a saída JSON vai **colada no Dev Agent Record**, e os oito leads são conferidos um a
um contra a tabela de **oito linhas** do Context (que já traz Sandra e Ailton). **Se algum não
aparecer, a story não fecha** — não é para relaxar a régua até que apareça; é para descobrir por que
não apareceu.
> 📅 **Esta AC tem validade datada (ver o bloco no Context).** Ela vale contra o `HEAD` de 07/08.
> A guarda de interrogação do Epic 88 **vai** mudar o conjunto — a Sueli sai. Isso não é falha desta
> story: é linha do runbook do `W0-3` (T7).

- **AC1-a — o Ailton não pode ser engolido.** Ele **tem** appointment (10:00) e a Nicole afirmou
  **9h**. Com a janela de ±30 min estrita, 60 min de diferença cai **fora** da janela → ele sai como
  `sem_lastro`, com `divergenciaMin = 60` registrado. *Verifica-se:* teste unitário com essa
  fixture; e a linha do Ailton na saída da AC1 traz `divergencia_min: 60`. Uma janela frouxa
  (±60 min, "existe appointment por perto") reproduz a cegueira da `detectSlotMismatch` com mais
  código — é exatamente o que **não** pode acontecer.
  > 🔴 **Correção do @po (medida): como escrita, esta AC não fecha.** A `divergenciaMin` do Desenho §1
  > é *"quando há appointment perto"*, e "perto" é a janela de **classificação** de ±30 min — dentro
  > da qual o Ailton **não tem candidato nenhum** (o appointment dele está a 60 min). O @po rodou:
  > a linha do Ailton sai com `divergencia_min = null`, não `60`. **São DUAS janelas e a story precisa
  > declarar as duas:**
  > - **janela de CLASSIFICAÇÃO = ±30 min** — decide o balde. **Não muda.**
  > - **janela de RELATÓRIO = ±24 h, do mesmo lead** — só para preencher `divergencia_min` e
  >   `appointment_id_proximo` na linha, **sem nenhum efeito sobre o balde**.
  >
  > *Verifica-se também:* teste que fixa que um appointment a 60 min **continua** produzindo
  > `balde: "sem_lastro"` com `divergencia_min: 60` — se mexer no balde, a AC1-a virou a janela
  > frouxa que ela mesma proíbe.
- **AC1-b — a Silvana NÃO pode aparecer, e o mecanismo que a exclui é TESTADO.** Ela pediu
  **ligação**, não visita, e a ligação aconteceu (`lead_tasks` `action_type='ligacao'`, `due_at`
  27/07 09:00 BRT, `completed_at` 27/07 09:39). **Ela tem zero appointments** — sem o discriminador
  ela cai em `sem_lastro` e gera alerta nomeado.
  *Verifica-se, três vias obrigatórias:*
  - (i) **teste unitário com a fixture literal da Silvana** (*"Segunda-feira às 9h o corretor te
    liga"*, `faladoEm = 2026-07-24 23:41 BRT`, `appointmentsDoLead = []`): `descarte === "ligacao"`,
    `balde === null`;
  - (ii) **o vermelho colado:** removendo `PADROES_LIGACAO` do módulo, esse mesmo teste passa a
    devolver `balde: "sem_lastro"`. Sem esse vermelho a AC1-b não prova nada;
  - (iii) **teste de precedência:** *"te ligo para confirmar a visita de sábado às 10h"* **NÃO** é
    descartada (contém compromisso de visita) e é classificada normalmente;
  - (iv) a saída da AC1 não contém a Silvana, e o contador `descartes.ligacao` da mesma saída é
    **≥ 1**.
  > **O discriminador mora em `agenda-reconcile.ts` (Desenho §5), NUNCA na `detectAffirmedSlot`.**
  > O `OUT` da story continua valendo integralmente — o @po ratificou que ele está certo.

**AC2 — A âncora é o instante da fala, e isso é testado.**
`classificarFala` resolve a expressão temporal contra `faladoEm`, nunca contra o relógio da rodada.
*Verifica-se, duas vias obrigatórias:*
- (i) **Teste unitário:** a mesma fala (*"Agendei sua visita para este sábado às 9h"*) com
  `faladoEm = 2026-06-28` resolve para o sábado seguinte a **28/06**, e com `faladoEm = 2026-08-07`
  resolve para o sábado seguinte a **07/08**. Um teste que passe `now = new Date()` fica
  **vermelho**; colar o vermelho no Dev Agent Record.
- (ii) **Estabilidade:** rodar `?days=60&dry=1` em dois dias diferentes produz **o mesmo horário
  afirmado** para as mesmas falas. Dois outputs, com data, colados na story.
> ⚠️ **A AC2 sozinha NÃO fecha o furo do relógio.** Ela cobre a cadeia de parse (`parseDay` é o
> único consumidor de `now` em `visit-slot.ts` — auditado). O terceiro relógio é a **AC2-b**, e sem
> ela as duas vias acima passam com o job publicando 0%.

**AC2-b — 🆕 `Invalid Date` é falha explícita, nunca `sem_lastro`.**
`new Date("2026-06-28 13:37:40.123+00")` — o texto que o Postgres devolve para `timestamptz` — é
**Invalid Date silencioso** em JS, e `detectAffirmedSlot` propaga isso devolvendo **um `Date`
inválido**, não `null`. Ver Desenho §3-b.
*Verifica-se, três vias obrigatórias:*
- (i) `classificarFala` **rejeita** `faladoEm` não-finito (`Number.isFinite(faladoEm.getTime())`
  falso) devolvendo `balde: null` + `descarte: "data_invalida"`, com **contador próprio**
  (`descartes.data_invalida`) publicado no relatório. Não lança silenciosamente e não classifica;
- (ii) um `Date` inválido devolvido por `detectAffirmedSlot` é tratado como `null` — `afirmou`
  **nunca** carrega `NaN` adiante;
- (iii) **teste com a string CRUA do `timestamptz`** (`"2026-06-28 13:37:40.123+00"`) como entrada,
  e **o vermelho colado**: contra uma implementação sem a guarda, o teste produz
  `balde: "sem_lastro"` e `lastro_pct: 0` com a AC1 verde. Esse é o cenário que a AC2-b existe para
  tornar impossível.
> **Por que isto é AC e não Dev Note:** com este bug, a AC1 passa (os oito casos aparecem, todos
> como `sem_lastro`), a AC2-(ii) passa (0% é perfeitamente estável) e o `PM2` do Epic 88 recebe
> **0%** como se fosse medição. **Só a AC3 pegaria — e a AC3 da v0.1 estava calibrada errada.**

**AC3 — O relatório entrega o NÚMERO, com os quatro baldes, a unidade declarada e a diferença para
o baseline manual explicada linha a linha.**

A resposta do endpoint e o evento `NICOLE_LASTRO_DIARIO` contêm, **com estes nomes**:

```jsonc
{
  "unidade": "fala",                    // ← declarado no payload, não só na doc
  "janela": { "desde": "...", "ate": "...", "dias": 60 },
  "total_disparos": 30,                 // TODO disparo da detectAffirmedSlot na janela
  "descartes": { "ligacao": 1, "transicao_humana": 0, "data_invalida": 0 },
  "lembrete": 4,                        // FORA do numerador E do denominador
  "denominador": 25,                    // total_disparos − descartes − lembrete
  "com_lastro": 3,
  "reparo_humano": 9,
  "sem_lastro": 13,
  "lastro_pct": 12.0,
  "lastro_frouxo_pct": 48.0,
  "lastro_frouxo_rotulo": "NÃO é lastro — inclui conserto humano posterior"
}
```
*(os valores acima são ILUSTRATIVOS do formato. O número real é o que a rodada produzir — ver (i).)*
> 📐 **Referência de conferência, não alvo (@po, 60 dias até 07/08):** com a precedência normativa do
> Desenho §2.2, a régua desta story dá `total_disparos: 30 · descartes.ligacao: 1 ·
> com_lastro: 3 · reparo_humano: 9 · lembrete: 5 · sem_lastro: 12 · denominador: 24 ·
> lastro_pct: 12,5 % · lastro_frouxo_pct: 50 %`. **Isto é para o @dev saber se o instrumento está
> montado certo — não é o número a perseguir.** Se a rodada dele der diferente, o achado é a
> explicação; a proibição da AC3-(i) continua valendo integralmente.

*Verifica-se:*

- **(i) 🔴 O alvo numérico NÃO é 31%/81%. A AC mudou de natureza.** A v0.1 exigia que o instrumento
  reproduzisse `≈31%` / `≈81%` com ±5 p.p. **O @po rodou a régua da v0.1 contra 60 dias de produção
  e obteve 7% / 30%** — e a variante com `cancelled/no_show` dá 10% / 57%. Nenhuma chega perto.
  Não é ruído: são quatro causas estruturais (denominador curado × instrumentado, unidade nunca
  declarada, filtro de `status` contraditório valendo 27 p.p., e o balde `lembrete` ausente).
  Ver o bloco vermelho no Context.
  > **O que a AC exige agora:** o instrumento **publica o seu número**, e o Dev Agent Record traz
  > **a reconciliação linha a linha** com o baseline manual de `5/16 = 31%`, respondendo a quatro
  > perguntas com número:
  > 1. quantos disparos o instrumento viu (`total_disparos`) × as 16 falas curadas à mão;
  > 2. quantas falas por lead (a lista de multiplicidade: Helena×2, Ailton×3, …);
  > 3. quantas linhas mudam de balde por conta da decisão de incluir `cancelled`/`no_show`;
  > 4. quantas linhas foram para `lembrete` e teriam ido para `reparo_humano` na régua da v0.1.
  >
  > **O `31%`/`81%` fica registrado como `baseline manual, superado`.** O `PM2` do Epic 88 e a §3 do
  > Epic 87 passam a citar **o número do instrumento** — propagação a cargo do @po/@pm.
  >
  > 🚫 **Proibido explicitamente:** afrouxar a janela, o filtro de autor ou a janela de 2 min para
  > o número "bater" com 31%. **Esse é literalmente o defeito que esta story existe para impedir** —
  > e é a saída de menor esforço para quem chegar na T6 e vir um número diferente do esperado.
  > Se o número divergir do previsto, o achado é a explicação, não o ajuste.

- **(i-b) 🆕 [@po 07/08] A PRECEDÊNCIA dos baldes é testada, e a sensibilidade dela é publicada.**
  A ordem de avaliação do Desenho §2.2 (`com_lastro` → `reparo_humano` → `lembrete` → `sem_lastro`,
  com a janela **bilateral** de `JANELA_MESMO_TURNO_MIN = 15`) é **AC, não detalhe de implementação.**
  *Verifica-se, três vias obrigatórias:*
  - (a) **teste unitário com a fixture literal do Wilson** (appointment `created_by='nicole'`,
    `created_at` **0,16 s ANTES** da fala, `dv = 0`): o balde é **`com_lastro`**. **O vermelho:**
    avaliando `lembrete` antes, o mesmo caso vira `lembrete`, sai do denominador e o `lastro_pct`
    cai a **0**. Colar os dois — *é o vermelho mais importante desta story, porque o modo de falha
    dele é publicar 0 % com TODAS as outras AC verdes, inclusive a AC2-b;*
  - (b) teste que fixa que um appointment `created_by='nicole'` criado **3 dias antes** da fala
    **não** é `com_lastro` (é `lembrete`) — a janela é bilateral e curta, não "qualquer coisa criada
    antes";
  - (c) **a rodada da T6 publica o número nas DUAS leituras**, lado a lado, no Dev Agent Record:
    `lastro_pct` com a precedência normativa **e** com `lembrete` primeiro. **A diferença entre os
    dois é o tamanho da armadilha**, e ela fica registrada como número em vez de virar uma pergunta
    que ninguém faz. *(Medição do @po em 07/08, para o @dev conferir se bate: **12,5 % × 0,0 %**,
    sobre `total_disparos = 30`, `descartes.ligacao = 1`.)*

- **(ii) O denominador e a unidade estão no payload, e batem.** Teste que afirma
  `denominador === total_disparos − (soma dos descartes) − lembrete`, e que `unidade === "fala"`.
  Se `lembrete` entrar no denominador, o teste fica vermelho.

- **(iii) Vermelho obrigatório do par de filtros.** Teste unitário com fixture em que o appointment
  foi criado por `admin` **3 h depois** da fala: o balde tem de ser `reparo_humano`. **E o vermelho:**
  removendo o filtro `created_by='nicole'` **ou** o `created_at ≤ fala + 2 min`, esse teste **passa
  a falhar** (classificaria como `com_lastro`). Os dois vermelhos vão colados.
  > ✅ **O @po já confirmou que este vermelho vai ficar vermelho:** removendo qualquer um dos dois
  > filtros, **Sueli, Valnira e Maria Oliveira viram `com_lastro`** no dado real.
  > *Sem esse par, o teste não prova nada — é a lição do mock com `is: () => b`, que engolia o filtro
  > sem aplicar.*

- **(iv) 🆕 Vermelho obrigatório do balde `lembrete`.** Teste com a fixture literal da **Edicleia**
  (fala 06/08 18:32 *"sua visita já está marcada para amanhã, às 15h"*; appointment `broker` criado
  06/08 **18:13**, 19 minutos **antes** da fala): o balde tem de ser `lembrete`, e a linha **não
  entra no denominador**. **O vermelho:** removendo o balde, o mesmo caso vira `reparo_humano`,
  entra no denominador e **derruba o `lastro_pct`**. Colar os dois, com o `lastro_pct` dos dois lados
  — é a prova de que o viés foi removido, e o número da diferença é o tamanho do viés.

- **(v) O `status` do appointment aparece por linha.** `cancelled` e `no_show` **contam** (decisão
  do Desenho §2.1), e o campo `status` vai em cada linha do relatório para quem quiser recortar
  depois sem reescrever a régua.

**AC4 — O alerta tem nome, dono, unidade `lead+dia` e não se contradiz.**
Cada caso `sem_lastro` da janela diária gera um `system_event`
`NICOLE_AFIRMACAO_SEM_LASTRO` (`level: warn`, `category: ai`) com
`{ lead_id, lead_name, conversation_id, message_id, falado_em, afirmado_para, trecho }` e um alerta
Telegram admin que **nomeia o lead, a data e o horário afirmado** e traz o link
`${APP_URL}/dashboard/leads/{lead_id}` (mesmo padrão do `sla-alerts`).

> ### 🆕 A unidade do ALERTA é `lead + dia`, não a fala (Desenho §2.0)
>
> **Medido no Ailton (31/07):** 01:17 afirma **09:00** (60 min do appointment das 10:00 → sai
> `sem_lastro`, como a AC1-a quer) e 01:18, **um minuto depois**, afirma **10:00** — que casa
> exatamente com o appointment (`created_by='nicole'`, criado 31/07 01:05 → `com_lastro`).
> **A mesma conversa produz `sem_lastro` e `com_lastro` no mesmo minuto.** A v0.1 deduplicava por
> `message_id`, então **os dois alertavam**: o time receberia *"o Ailton está sem lastro"* ao lado de
> *"o Ailton tem lastro"* no mesmo push, e pararia de ler no terceiro dia.

*Verifica-se:*
- (i) rodar a rota duas vezes no mesmo dia produz **um** evento e **um** alerta por caso — a segunda
  rodada não duplica (dedupe por `message_id` consultando `system_events`). Prova com os dois
  `select count(*)` colados;
- (ii) `?dry=1` **não** emite evento nem alerta (conferir por `count(*)` inalterado);
- (iii) **🆕 supressão por correção no mesmo turno:** teste com a fixture literal do **Ailton**
  (duas falas, 31/07 01:17 → 09:00 `sem_lastro` e 01:18 → 10:00 `com_lastro`, mesmo lead, mesmo dia
  afirmado). **Resultado exigido: ZERO alertas para o Ailton** — a fala posterior do mesmo
  `lead + dia_afirmado` que resolve `com_lastro` **suprime** o alerta da anterior. **O vermelho
  colado:** sem a supressão, o mesmo caso gera 1 alerta contraditório;
- (iv) **as duas linhas continuam no relatório.** A supressão vale para o **alerta**, nunca para o
  **relatório** — a linha `sem_lastro` das 01:17 permanece no JSON e no denominador, com
  `alerta_suprimido: true` e o `message_id` da fala que a corrigiu. *Suprimir a linha destruiria a
  auditoria e maquiaria o `lastro_pct` para cima — que é o erro simétrico ao que a AC3 combate.*
> ⚠️ **[@po 07/08] A (iii) só funciona com a precedência da AC3-(i-b).** A fala corretiva do Ailton
> (01:18 → 10:00) só cai em `com_lastro` porque `com_lastro` é avaliado **antes** de `lembrete` — o
> appointment dele foi criado **12,8 min antes** dessa fala, então a regra de `lembrete` também
> casaria. Com a ordem invertida a supressão **não dispara** e o alerta contraditório sai assim
> mesmo. Quem mexer na ordem dos baldes quebra esta AC junto; o teste da AC3-(i-b)(a) é o que avisa.

**AC5 — Read-only, provado, não prometido.**
A rotina não escreve em `appointments`, `leads`, `conversations`, `conversation_state` nem
`messages`.
*Verifica-se:* teste com o harness `createFakeSupabase` em que, após `reconciliarAgenda`, o array
`fake.calls` **não contém nenhum** `insert:` ou `update:` dessas cinco tabelas (asserção por
allowlist: só `select:` é permitido). O único write autorizado é `system_events`, que é feito pelo
cron (camada web), não pelo módulo.

**AC6 — O cron roda de verdade, no projeto certo.**
*Verifica-se por efeito em produção, não por existência no `vercel.json`:* existe pelo menos uma
linha em `system_events` com `event_type = 'NICOLE_LASTRO_DIARIO'` cujo `created_at` corresponde a
uma **invocação real do agendador** (não a uma chamada manual), com o horário colado na story.
> ⚠️ **Pré-tarefa do @devops, e ela já falhou duas vezes nesta casa:** confirmar **qual projeto
> Vercel** deploya `packages/web` e serve os crons hoje. Há registro de que o webhook da Nicole é
> atendido por `prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c` (freelans) enquanto o `.vercel/project.json`
> deste repo aponta para `prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj`. **Se os dois projetos deployarem o
> mesmo `vercel.json`, o cron roda duas vezes por dia** — o dedupe da AC4 segura o alerta, mas o
> fato precisa estar escrito na story, com o projeto nomeado.

**AC7 — `detectAffirmedSlot` muda de casa sem mudar de comportamento.**
A função vai para `flows/visit-slot.ts` (onde já moram todas as suas dependências:
`isAmbiguousSlotText`, `resolveVisitSlotParts`, `slotToUtc`) e continua **re-exportada** de
`chat/pipeline.ts`. Passa a ser exportada por `@trifold/ai` (via `flows/index.ts`).
*Verifica-se:* (i) `npx vitest run` verde, com `pipeline.test.ts`, `pipeline-scheduling.test.ts` e
`pipeline-broker-guard.test.ts` **sem uma linha alterada**; (ii) o diff da função é
**zero** — só o arquivo muda; (iii) `npm run type-check` sem erro novo.

**AC8 — Sem regressão e sem AC impossível.**
*Verifica-se:* `npx vitest run` verde e `npm run type-check` sem erro novo.
> **Não há AC de lint para `packages/ai`:** o pacote não tem eslint configurado (o config vive em
> `packages/web`). Para os arquivos de `packages/web` desta story, `npm run lint` sem erro novo.

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/chat/pipeline.ts` | 136-146 | `detectAffirmedSlot` — a função que a rotina reusa (vai mudar de casa, AC7) |
| `packages/ai/src/chat/pipeline.ts` | 109-120 | `detectSlotMismatch` — **não é esta**; é a guarda cega, e ela é do W2-3 |
| `packages/ai/src/flows/visit-slot.ts` | 251-284 | `isAmbiguousSlotText` + `countTimeMentions` — o filtro de oferta/expediente que a `detectAffirmedSlot` já aplica |
| `packages/ai/src/chat/__fixtures__/fake-supabase.ts` | 1-223 | o harness da 75-279, com filtros de verdade (`eq`, `in`, `gt`, `lt`, `is`, `or`) — **usar, não recriar** |
| `packages/web/src/lib/logger.ts` | 21-59 | `logEvent` — fire-and-forget para `system_events` |
| `packages/web/src/app/api/cron/webhook-health/route.ts` | 1-70 | padrão de cron: `CRON_SECRET` + `sendTelegramAdminAlert` |
| `packages/web/src/app/api/cron/sla-alerts/route.ts` | 61, 258 | `APP_URL` e o deep link `/dashboard/leads/{id}` |
| `packages/web/vercel.json` | bloco `crons` | onde o agendamento entra |
| `supabase/migrations/006_appointments.sql` | 8-22 | schema real: `created_by` é enum `appointment_creator ('nicole','broker','admin')`, `status` é enum |

### Ciclo de import — o motivo do AC7

`chat/pipeline.ts` importa de `"../flows"` (o **index**, linha 18-31). Se
`flows/agenda-reconcile.ts` importasse `detectAffirmedSlot` de `"../chat/pipeline"` e fosse
re-exportado por `flows/index.ts`, teríamos `pipeline → flows/index → agenda-reconcile → pipeline`.
Mover a função para `visit-slot.ts` mata o ciclo na raiz e não custa nada: as três dependências dela
(`isAmbiguousSlotText`, `resolveVisitSlotParts`, `slotToUtc`) **já estão nesse arquivo**.

### Armadilhas medidas

1. **`role='assistant'` nem sempre é a Nicole.** `send-message/route.ts:210-222` grava a fala de
   **transição do handoff** (escrita por humano, disparada pelo corretor) como `role: "assistant"`
   (linha **214**) com `metadata.is_transition = true`. **Excluir** essas mensagens — senão a rotina
   acusa a Nicole por promessa de gente.
   > **O @po mediu o custo do filtro: ele é ZERO hoje, e isso é o esperado.** Existem **104**
   > mensagens `role='assistant'` com `is_transition=true` no período de 60 dias, e **nenhuma delas
   > dispara a `detectAffirmedSlot`**. Não gaste tempo procurando o vermelho deste filtro: ele não
   > existe. O filtro é **profilaxia**, e o contador `descartes.transicao_humana` (AC3) publica o
   > número para o dia em que deixar de ser zero.
   > **O defeito de origem** (fala humana gravada como `role='assistant'`) **não** é desta story —
   > o raio dele é muito maior. Está aberto em `docs/backlog.md` desde 07/08.
2. **Mensagens `role='broker'` não entram** (812 em produção, 67% das conversas). Elas são fala do
   corretor; reconciliar a promessa do humano é outro item, e está no backlog.
3. **A precisão da `detectAffirmedSlot` é ~79% — e a PROPORÇÃO de alerta falso importa mais que a
   taxa.** Medição do @po sobre 60 dias: **5 dos 30 disparos** são pergunta ou oferta
   (Sueli 03/08, Adriele 29/06, Célia 28/06 13:36, Sandra 05/08, Ailton 31/07 01:05).
   **Volume real de alerta: 21 `sem_lastro` em 60 dias = 0,35 alerta/dia.**
   > ⚠️ **A v0.1 declarava "~0,1 falso/dia" — o número está certo como *taxa* e engana como
   > *proporção*.** Dos ~21 alertas do período, **~7 são falso positivo: cerca de 1 em cada 3.**
   > **O que decide se o time continua lendo o alerta é a proporção, não a taxa.** Declarado aqui,
   > e refletido no Risco 3. A guarda de interrogação (Epic 88) é o conserto — **não** "compensar"
   > isso aqui com heurística nova.
4. **`status`: `cancelled` e `no_show` CONTAM.** A v0.1 tinha uma contradição — o Desenho mandava
   excluí-los e esta Dev Note argumentava o contrário. **Resolvido no Desenho §2.1, com o número dos
   dois lados (30% × 57% no frouxo); o argumento desta Dev Note venceu.** 34 das 63 appointments do
   período são `no_show`/`cancelled`; excluí-las derrubaria para `sem_lastro` cinco leads que têm
   appointment no horário **exato**. O `status` vai no relatório por linha.
5. **Fuso:** BRT é fixo em UTC-3 (Brasil sem horário de verão desde 2019). O `visit-slot.ts` já
   trata isso (`BRT_OFFSET_HOURS`); não reimplementar conversão.
6. **Consulta retroativa:** 60 dias ≈ 2.500 mensagens `user`/`assistant`. Se a rodada de 60 dias
   estourar o `maxDuration` da rota, **paginar por janela de dias** — não baixar a janela padrão
   nem o critério. Se precisar de índice, é chamada para o @data-engineer (hoje já existe
   `idx_messages_created_at`).
7. **Acesso a produção:** Supabase Management API com PAT (projeto `dsopqkqjkmhytudaaolv`).
   > **Correção de runbook, medida pelo @po:** o PAT está em **`~/.supabase/access-token`**, em
   > formato **JSON** — **não** no path `~/.config/supabase/pat` que o runbook cita e que **não
   > existe nesta máquina**. `supabase db push` é **proibido** neste projeto (R-G do epic).
8. **🆕 `new Date()` sobre o texto cru de `timestamptz` é `Invalid Date`.** `"…+00"` (offset sem
   `:00`) **não é ISO-8601 válido** para o JS. Normalize antes de construir o `Date` — e a AC2-b
   exige a guarda mesmo assim, porque o modo de falha é silencioso e publica 0%. Ver Desenho §3-b.
9. **🆕 Multiplicidade de falas por lead.** Quase todo incidente produz **duas** falas
   (Helena×2, Célia×2, Miriam×2, Valnira×2, Sandra×2, Maria×2, Wilson×2, Edicleia×2, Marlene×2,
   **Ailton×3**). A unidade do relatório é a **fala**; a do alerta é **lead+dia** (Desenho §2.0).
   Não "consolidar" falas no relatório para o número parecer com a auditoria manual — é a causa (b)
   da divergência do baseline, e ela é para ser **explicada**, não eliminada.

### Fronteiras com outras stories — para não invadir nem duplicar

| Item | Dono | Por que não é aqui |
|---|---|---|
| Guarda de interrogação na `detectAffirmedSlot` | **Epic 88** | Mudar a régua no meio da medição invalida o baseline |
| `detectSlotMismatch` deixar de ser cega (shadow) | **W2-3** (Onda 2) | Aquilo é guarda em tempo de turno; isto é reconciliação a posteriori |
| Bloquear a fala sem lastro | **W3-2c** (Onda 3) | Enforcement só depois do FP medido (M6) |
| Funil das 7 portas instrumentado | **Epic 88 · 88-3** | Mede por que não agendou; esta story mede que não agendou |
| Contato com a Célia e com os demais da lista | **D8, lado cliente** | Decisão comercial do Gabriel; está em `docs/backlog.md` |

---

## Tarefas

- [x] **T1** — Mover `detectAffirmedSlot` para `flows/visit-slot.ts`, re-exportar de `pipeline.ts`,
      exportar em `flows/index.ts`. Suíte existente verde sem alteração (AC7).
- [x] **T2** — `flows/agenda-reconcile.ts`: `classificarFala` (pura) + `reconciliarAgenda`, com os
      **quatro** baldes **na ordem normativa do Desenho §2.2** (`com_lastro` primeiro, janela
      **bilateral** `JANELA_MESMO_TURNO_MIN = 15`) e o denominador de `lembrete` fora dos dois lados
      (AC3, AC3-i-b). **As DUAS janelas separadas:** classificação ±30 min · relatório ±24 h só para
      `divergencia_min` (AC1-a).
- [x] **T2-b** — 🆕 Discriminador **visita × ligação** (`PADROES_LIGACAO` + regra de precedência) e
      os três descartes contados (`ligacao`, `transicao_humana`, `data_invalida`) — Desenho §5,
      AC1-b, AC2-b.
- [x] **T3** — Testes com `createFakeSupabase`: os quatro baldes, o Ailton, a Silvana, a Edicleia,
      a âncora, o `timestamptz` cru, o read-only — cada um com o **vermelho** correspondente colado
      (AC1-b-ii, AC2-i, AC2-b-iii, AC3-iii, AC3-iv).
- [x] **T4** — Rota `GET /api/cron/nicole-agenda-reconcile` (auth, `?days`, `?dry`), eventos e
      alerta com dedupe por `message_id` **e supressão por `lead+dia`** (AC4-iii).
- [x] **T5** — Registrar o cron em `packages/web/vercel.json` com **`38 11 * * *`** (o `30 11` colide
      com `billing-monthly-summary`, vercel.json:159-162) + pré-tarefa do @devops (AC6).
- [x] **T6** — Rodada retroativa de 60 dias em produção; saída colada; **reconciliação linha a linha
      com o baseline manual de 31%** (AC3-i). **Não perseguir o 31%** — publicar o número do
      instrumento e explicar a diferença.
- [x] **T7** — Registrar o número no runbook de baseline do **W0-3** (é dele que a M1 e o `PM2` do
      Epic 88 passam a sair), **incluindo a linha de validade datada**: *"quando a guarda de
      interrogação do Epic 88 (condição nº 7) subir, o conjunto e o denominador mudam — republicar o
      baseline antes de usar o número para dimensionar o Epic 88"*.

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| **1** | Rodar a retroativa com `now` do relógio e produzir um baseline errado que ninguém confere | **Alta** | AC2, com o vermelho obrigatório |
| **2** | Afrouxar a janela (±60 min, "tem appointment por perto") para o Ailton aparecer, e recriar a cegueira | **Alta** | AC1-a fixa ±30 min e exige `divergencia_min` explícito |
| **3** | Fadiga de alerta: **~1 em cada 3 alertas é falso** (7 de ~21 em 60 dias). A taxa é baixa (0,35/dia) mas **é a proporção que faz o time parar de ler** | **Alta** (era Média na v0.1, com a taxa no lugar da proporção) | Declarado na Dev Note 3 com o número dos dois jeitos; a guarda de interrogação (Epic 88) é o conserto — **não** heurística nova aqui. E o alerta nomeia lead/data/link, que é o que faz valer a pena abrir mesmo com 1/3 de falso |
| **7** | 🆕 **`Invalid Date` de `timestamptz` publica 0% com a AC1 e a AC2 verdes.** Com o gate de existência revogado, o dano **mudou de natureza e não de gravidade**: um 0% falso não reprova mais o Epic 88 — ele **dimensiona a v1 contra um determinístico falsamente descrito como inútil**, inflando o escopo da tool e a superfície de risco do primeiro deploy de escrita | **Alta** | **AC2-b**, com o teste da string crua e o vermelho colado. Custa 4 linhas |
| **8** | 🆕 **Viés do instrumento na direção da decisão que ele alimenta.** Sem o balde `lembrete`, lembretes legítimos viram "conserto humano" e o `lastro_pct` cai. **Agora que o número dimensiona em vez de aprovar, isso ficou MAIS crítico, não menos:** um lastro subcontado **encolhe a v1 errado** — e v1 subdimensionada é falha **silenciosa** (ninguém reclama do escopo que nunca foi escrito), enquanto uma reprovação errada ao menos gerava discussão | **Alta** | Balde `lembrete` fora do numerador **e** do denominador (Desenho §2.2) + o vermelho da **AC3-iv**, que publica o tamanho do viés como número |
| **10** | 🆕 **[@po] A ordem de avaliação dos baldes ser tratada como detalhe de implementação.** `com_lastro` e `lembrete` se sobrepõem: o INSERT do appointment precede a fala em **0,09–0,87 s** nos 6 casos `created_by='nicole'` do projeto, então `created_at < faladoEm` vale para **todo** candidato a lastro. Com `lembrete` primeiro, `com_lastro` fica vazio **por construção** e o instrumento publica **0 %** com a AC1, a AC2, a AC2-b e a AC4 verdes — e o Epic 88 é dimensionado contra um determinístico descrito como inútil por causa de uma linha de `if` | **Alta** | Ordem **normativa** no Desenho §2.2 + janela **bilateral** de 15 min + **AC3-(i-b)** com o vermelho do Wilson e a publicação do número **nas duas leituras** (medido: 12,5 % × 0,0 %) |
| **9** | 🆕 **O @dev chega na T6, vê um número longe de 31%, e afrouxa a régua até bater** | **Alta** | AC3-i mudou de natureza: o alvo **não é** 31%. A exigência é publicar o número do instrumento **e reconciliar linha a linha** com o baseline manual. Proibição escrita e nomeada |
| **4** | Cron duplicado em dois projetos Vercel → alerta em dobro | Média | Dedupe por `message_id` (AC4-i) + pré-tarefa do @devops (AC6) |
| **5** | A rotina virar "mais um alerta que ninguém lê" | **Alta** | O alerta nomeia lead, data e link; e o resumo diário publica o número, que é o que o `PM2` do Epic 88 consome para dimensionar |
| **6** | Rodada de 60 dias estourar timeout e alguém baixar a janela para fechar a story | Média | Dev Note 6: paginar, nunca reduzir o critério |

---

## Critério de rollback (D7)

Story de leitura: o rollback é **remover a entrada do cron em `packages/web/vercel.json`** e
redeploy. Nenhuma escrita a desfazer, nenhum comportamento da Nicole a reverter.
**Gatilho:** mais de 5 alertas por dia com classificação errada na revisão manual dos 3 primeiros
dias, ou qualquer escrita detectada fora de `system_events`.
**Responsável pela validação em produção:** a nomear (Marcos ou Thielly), janela de 24 h após o
primeiro dia de rodada real, revisando caso a caso a lista do dia.

## Definition of Done

- [ ] AC1, AC1-a, AC1-b, AC2, **AC2-b**, AC3, AC4, AC5, AC6, AC7 e AC8 verificadas, com as saídas e
      **os vermelhos** colados no Dev Agent Record
- [ ] Baseline de lastro **do instrumento** publicado (o número que sair, **não** 31%) e registrado
      no runbook do W0-3, com a **reconciliação linha a linha** contra o baseline manual (AC3-i)
- [ ] Linha de **validade datada** escrita no runbook do W0-3 (a guarda de interrogação do Epic 88
      muda o conjunto e obriga a republicar o baseline)
- [ ] Os **8** leads conferidos um a um contra a tabela do Context; **a Silvana ausente**, com
      `descartes.ligacao ≥ 1` na saída
- [ ] Cron registrado em **`38 11 * * *`** e provado por efeito em produção, com o projeto Vercel
      nomeado
- [ ] `stories_planned` do Epic 87 contém `W0-5 → 87-3`
- [ ] @po/@pm avisados para propagar o número novo à **§3 do Epic 87** e ao **`PM2` do Epic 88**
      (o `31%` passa a constar como *baseline manual, superado*)

---

## Referências (seção específica, não documento inteiro)

- 🔴 **`docs/qa/po-validation-87-3-87-4-87-5.md` — a revalidação do @po (07/08) que promoveu esta story a `Ready`.**
  Ler **§1.2** (a precedência dos baldes: 0,0 % × 8,7 % × 12,5 %), **§1.3-A** (as duas janelas da
  AC1-a) e **§1.4** (o número previsto do instrumento).
- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **§7/Onda 0, item W0-5**
  (enunciado e o "é entrega, não régua"); **§3** (métricas M1–M5 e a nota de baseline de lastro);
  **§7/Onda 4** — ⚠️ ler na **v0.4**: o gate de existência ≥90%/<90% foi **REVOGADO**; o lastro
  virou critério de **sequenciamento e dimensionamento** do Epic 88 (chave do frontmatter:
  `sequenciamento_e_dimensionamento`)
- `docs/architecture/2026-08-07-debate-tool-use-nicole.md` — **§2.3** (o caso Célia e o
  reenquadramento); **§2.4** (o lastro: 31% × 54% × 81%, e por que a definição importa);
  **§2.8** (a precisão de 79% da `detectAffirmedSlot`); **§4-(a)**; **§7.3 item 0.2**;
  **§9 condições 2 e 6**
- 🔴 **`docs/qa/po-validation-87-3-87-4.md` — a validação que produziu esta v0.2. Ler §0 (método),
  §1.2 (os oito casos disparo a disparo), §1.3 (o `Invalid Date`), §1.4 (as quatro causas da
  divergência do baseline), §1.5 (a proporção de falso positivo) e §1.6 (a colisão de cron).**
  **Todos os números desta story vêm de lá, medidos contra o banco em 07/08.**
- `docs/qa/po-validation-epic-88.md` — **§1** (auditoria dos incidentes, um a um, e a saída da
  Silvana); **§5.1 e §5.2** (o baseline manual de 31% — **superado**, ver AC3-i); **§8** (itens de
  backlog derivados)
- `docs/architecture/2026-08-05-validacao-epic-87.md` — **§1.3** (a régua da guarda tem de ser
  `appointments`, nunca `[SISTEMA]` nem `collected_data`)
- Story **75-279** (`docs/stories/75-279-nicole-grafia-hora-nao-agendou.story.md`) — origem do
  harness `fake-supabase.ts` e da `detectAffirmedSlot`
- `docs/backlog.md` — itens "Célia (28/06) nunca foi remediada" e "compromisso de ligação não vira
  artefato"

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Modelo:** claude-opus-5 · **Data:** 2026-08-07
**Branch:** `story/87-3-reconciliacao-fala-banco` (de `origin/main` @ `17e9a8dc`, já com os PRs #367 e #377)
**Modo:** YOLO · **Escritas em produção: NENHUMA** — a rodada da T6 usou só `SELECT` via Management API.

---

### 1. O que foi construído

| Arquivo | O quê |
|---|---|
| `packages/ai/src/flows/agenda-reconcile.ts` | **novo** — `classificarFala` (pura), `reconciliarAgenda`, os quatro baldes na ordem normativa, as duas janelas, o discriminador visita×ligação, `parseTimestamptz` |
| `packages/ai/src/flows/agenda-reconcile.test.ts` | **novo** — 28 testes |
| `packages/ai/src/flows/visit-slot.ts` | `detectAffirmedSlot` mudou de casa (AC7), **diff da função = zero** |
| `packages/ai/src/chat/pipeline.ts` | passa a importar e **re-exportar** `detectAffirmedSlot` |
| `packages/ai/src/flows/index.ts` | exporta a função e o módulo em `@trifold/ai` |
| `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts` | **novo** — wrapper fino: auth, `?days`, `?dry`, eventos, alerta, dedupe |
| `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.test.ts` | **novo** — 5 testes (auth, `dry`, dedupe, alerta nomeado, `days`) |
| `packages/web/vercel.json` | cron `38 11 * * *` |
| `docs/qa/baseline-lastro-w0-3.md` | **novo** — runbook do baseline (T7), com a linha de validade datada |

**IDS — decisões de reúso**, nesta ordem: `createFakeSupabase` (75-279) **REUSE**, não recriado;
`detectAffirmedSlot` **REUSE** (movida, não reescrita — o `OUT` da story está de pé, ela continua
disparando na Silvana); `sendTelegramAdminAlert` e `logEvent` **REUSE**; o padrão de auth de cron e o
deep link `${APP_URL}/dashboard/leads/{id}` **ADAPT** de `webhook-health`/`sla-alerts`. **CREATE** só
onde não havia nada: o módulo de reconciliação e a rota. Nenhuma migration.

---

### 2. AC1 — a rodada retroativa de 60 dias, contra produção

`dsopqkqjkmhytudaaolv` · janela `2026-06-08T23:13:21Z → 2026-08-07T23:13:21Z` ·
**1.157 mensagens `role='assistant'` lidas** (o @po mediu 1.156 — a diferença é 1 fala que entrou na
janela entre as duas medições).

```jsonc
{
  "unidade": "fala",
  "janela": { "desde": "2026-06-08T23:13:21.415Z", "ate": "2026-08-07T23:13:21.415Z", "dias": 60 },
  "total_disparos": 30,
  "descartes": { "ligacao": 1, "transicao_humana": 0, "data_invalida": 0 },
  "lembrete": 5,
  "denominador": 24,
  "com_lastro": 3,
  "reparo_humano": 9,
  "sem_lastro": 12,
  "lastro_pct": 12.5,
  "lastro_frouxo_pct": 50,
  "lastro_frouxo_rotulo": "NÃO é lastro — inclui conserto humano posterior",
  "sensibilidade": {
    "ordem_normativa":    { "com_lastro": 3, "lembrete": 5, "denominador": 24, "lastro_pct": 12.5 },
    "lembrete_primeiro":  { "com_lastro": 0, "lembrete": 8, "denominador": 21, "lastro_pct": 0 }
  },
  "mensagens_lidas": 1157
}
```

> **Bate com a previsão do @po (`po-validation-87-3-87-4-87-5.md` §1.4) em TODOS os campos**, e a
> sensibilidade reproduz os dois extremos que ele mediu: **12,5 % × 0,0 %**. Isso não é o alvo — é a
> confirmação de que o instrumento está montado como a story especifica. **Nada foi afrouxado para
> bater**: a janela de classificação continua em ±30 min, o par de filtros do `com_lastro` continua
> sendo uma conjunção, e o discriminador de ligação continua fora da `detectAffirmedSlot`.

#### As 30 linhas (relatório completo, em BRT)

| # | fala (BRT) | lead | balde / descarte | afirmou p/ (BRT) | dv | status | alerta |
|---|---|---|---|---|---|---|---|
| 1 | 2026-06-16 10:44 | Idalina | `sem_lastro` | 2026-06-20 09:00 | — | — | **ALERTA** |
| 2 | 2026-06-18 12:05 | Alvaro Natã | `sem_lastro` | 2026-06-20 10:00 | — | — | **ALERTA** |
| 3 | 2026-06-23 21:11 | Helena | `reparo_humano` | 2026-06-27 10:00 | 0 | no_show | — |
| 4 | 2026-06-23 21:15 | Helena | `reparo_humano` | 2026-06-27 10:00 | 0 | no_show | — |
| 5 | 2026-06-28 10:36 | Célia | `sem_lastro` | 2026-07-04 12:00 | — | — | **ALERTA** |
| 6 | 2026-06-28 10:37 | Célia | `sem_lastro` | 2026-07-04 09:00 | — | — | **ALERTA** |
| 7 | 2026-06-29 18:06 | Adriele | `sem_lastro` | 2026-07-04 12:00 | — | — | **ALERTA** |
| 8 | 2026-06-29 18:07 | Adriele | `sem_lastro` | 2026-07-04 11:00 | — | — | **ALERTA** |
| 9 | 2026-07-07 11:50 | Miriam | `sem_lastro` | 2026-07-08 10:00 | 60 | — | **ALERTA** |
| 10 | 2026-07-07 11:51 | Miriam | `reparo_humano` | 2026-07-08 11:00 | 0 | no_show | — |
| 11 | 2026-07-09 13:22 | Juca | `sem_lastro` | 2026-07-11 11:30 | 90 | — | **ALERTA** |
| 12 | 2026-07-15 16:13 | Andréia | `reparo_humano` | 2026-07-18 09:00 | 0 | cancelled | — |
| 13 | 2026-07-24 20:41 | Silvana | `*descarte: ligacao*` | 2026-07-27 09:00 | — | — | — |
| 14 | 2026-07-26 15:12 | Wilson | `com_lastro` | 2026-07-27 08:00 | 0 | completed | — |
| 15 | 2026-07-26 15:13 | Wilson | `com_lastro` | 2026-07-27 08:00 | 0 | completed | — |
| 16 | 2026-07-30 22:05 | Ailton Gouvea | `sem_lastro` | 2026-08-03 12:00 | — | — | **ALERTA** |
| 17 | 2026-07-30 22:17 | Ailton Gouvea | `sem_lastro` | 2026-08-01 09:00 | 60 | — | suprimido |
| 18 | 2026-07-30 22:18 | Ailton Gouvea | `com_lastro` | 2026-08-01 10:00 | 0 | no_show | — |
| 19 | 2026-08-02 16:01 | Marlene | `lembrete` | 2026-08-03 16:00 | 0 | completed | — |
| 20 | 2026-08-03 15:15 | Marlene | `lembrete` | 2026-08-03 16:00 | 0 | completed | — |
| 21 | 2026-08-03 18:53 | Sueli | `reparo_humano` | 2026-08-07 14:00 | 0 | completed | — |
| 22 | 2026-08-03 21:09 | Valnira | `reparo_humano` | 2026-08-06 10:00 | 0 | cancelled | — |
| 23 | 2026-08-03 21:10 | Valnira | `reparo_humano` | 2026-08-06 10:00 | 0 | cancelled | — |
| 24 | 2026-08-04 10:37 | André | `lembrete` | 2026-08-05 10:30 | 0 | no_show | — |
| 25 | 2026-08-05 11:55 | Sandra | `sem_lastro` | 2026-08-08 12:00 | — | — | **ALERTA** |
| 26 | 2026-08-05 11:55 | Sandra | `sem_lastro` | 2026-08-08 12:00 | — | — | **ALERTA** |
| 27 | 2026-08-06 07:04 | Maria Oliveira | `reparo_humano` | 2026-08-08 11:00 | 0 | scheduled | — |
| 28 | 2026-08-06 07:05 | Maria Oliveira | `reparo_humano` | 2026-08-08 11:00 | 0 | scheduled | — |
| 29 | 2026-08-06 15:32 | Edicleia | `lembrete` | 2026-08-07 15:00 | 0 | completed | — |
| 30 | 2026-08-06 15:33 | Edicleia | `lembrete` | 2026-08-07 15:00 | 0 | completed | — |

> **Coluna `alerta`:** marca as linhas `sem_lastro` não suprimidas. Elas são **11**, mas os alertas
> são **8** — a unidade do alerta é `lead + dia`, e Célia, Adriele e Sandra têm duas falas cada no
> mesmo dia afirmado.

#### Os OITO leads da AC1 — conferidos um a um contra a tabela do Context

| Lead | falas | baldes | ✓ |
|---|---|---|---|
| **Célia** | 2 | `sem_lastro`, `sem_lastro` | ✅ zero appointments, até hoje |
| **Helena** | 2 | `reparo_humano` ×2 | ✅ corretor criou depois (`no_show`) |
| **Miriam** | 2 | `sem_lastro`, `reparo_humano` | ✅ a 1ª afirma 10h e o appointment é 11h → `dv = 60` |
| **Ailton** | 3 | `sem_lastro`, `sem_lastro`, `com_lastro` | ✅ ver AC1-a e AC4-iii |
| **Sandra** | 2 | `sem_lastro` ×2 | ✅ |
| **Sueli** | 1 | `reparo_humano` | ✅ `broker` criou em 04/08 |
| **Valnira** | 2 | `reparo_humano` ×2 | ✅ `admin` criou em 04/08 |
| **Maria Oliveira** | 2 | `reparo_humano` ×2 | ✅ `admin` criou em 06/08 |

**8 leads · 16 falas — exatamente o que a AC1 exige.**
**A Silvana NÃO aparece em balde nenhum e NÃO gera alerta**; ela consta só como
`descarte: "ligacao"`, e `descartes.ligacao = 1`.

#### AC1-a — o Ailton não foi engolido

Linha 17: `sem_lastro` · `divergencia_min: 60` · `appointment_id_proximo` preenchido. Ele **tem**
appointment (01/08 10:00) e ela afirmou 9h. **O balde não mudou por causa da janela de relatório** —
que é precisamente o que a AC exige e o que a janela frouxa de ±60 min teria destruído.

---

### 3. AC2 — a âncora, medida contra produção

**AC2-(i) — o vermelho da âncora, quantificado sobre os 30 disparos reais:**

```
disparos ancorados em messages.created_at: 30
MUDAM de valor com now = new Date():       25   (83 %)

  Idalina       ancorado 2026-06-20T12:00:00Z   relógio 2027-06-20T12:00:00Z   ← salta de ANO
  Alvaro Natã   ancorado 2026-06-20T13:00:00Z   relógio 2027-06-20T13:00:00Z   ← salta de ANO
  Helena        ancorado 2026-06-27T13:00:00Z   relógio 2027-06-27T13:00:00Z
  Helena        ancorado 2026-06-27T13:00:00Z   relógio 2026-08-08T13:00:00Z   ← colapsa no "próximo sábado"
  Célia         ancorado 2026-07-04T15:00:00Z   relógio 2026-08-08T15:00:00Z
  Célia         ancorado 2026-07-04T12:00:00Z   relógio 2026-08-08T12:00:00Z
```

**25 de 30 — os 83 % que o @po previu, confirmados**, e com os dois sinais do erro (colapso no
próximo sábado e salto para 2027).

**AC2-(ii) — estabilidade.** Rodei a MESMA janela duas vezes com o **relógio do processo** deslocado
30 dias (substituição de `globalThis.Date`), que é um teste mais forte do que rodar em dois dias
diferentes:

```
rodada 1, relógio do processo: 2026-08-07T23:15:27Z
rodada 2, relógio do processo: 2026-09-06T23:15:27Z   (+30 dias)
rodada 1: disparos=30 lastro=12.5% sem_lastro=12
rodada 2: disparos=30 lastro=12.5% sem_lastro=12
falas com horário afirmado DIFERENTE entre as duas rodadas: 0
```

---

### 4. Os VERMELHOS — cada guarda, provada por remoção

Cada linha abaixo é uma mutação aplicada ao módulo, com a suíte rodada em cima. Todas foram
revertidas.

| # | Mutação | Testes que ficam vermelhos |
|---|---|---|
| **R1** | âncora vira `new Date()` | **18 de 28** |
| **R2** | guarda de `Invalid Date` removida | 1 (`data_invalida`) |
| **R3** | precedência invertida (`lembrete` primeiro) | **7** |
| **R4** | `PADROES_LIGACAO` removido | 4 |
| **R5** | balde `lembrete` removido (régua da v0.1) | 3 |
| **R6** | filtro de autor (`created_by='nicole'`) removido | 1 |
| **R7** | janela de mesmo turno removida | 1 |

#### R3 — AC3-(i-b)(a), o vermelho mais importante da story

```
FAIL  agenda-reconcile.test.ts > AC3-(i-b) — precedência dos baldes
      > com_lastro é alcançável: o INSERT 0,16 s ANTES da fala é o MESMO turno
AssertionError: expected 'lembrete' to be 'com_lastro' // Object.is equality

Expected: "com_lastro"
Received: "lembrete"

 ❯ agenda-reconcile.test.ts:164:21
    163|     const r = classificarFala(WILSON)
    164|     expect(r.balde).toBe("com_lastro")
```

**E o efeito na rodada de 60 dias de produção, lado a lado:**

```
precedência NORMATIVA      disparos=30  lembrete=5  den=24  com_lastro=3  lastro=12,5 %  alertas=8
lembrete avaliado 1º       disparos=30  lembrete=8  den=21  com_lastro=0  lastro= 0,0 %  alertas=9
```

**`com_lastro` fica vazio por construção e o instrumento publica 0 % — com a AC1, a AC2, a AC2-b e a
AC4 verdes.** O alerta sobe de 8 para 9 na mesma mutação: é a supressão do Ailton (AC4-iii) caindo
junto, exatamente como o @po advertiu. **Uma raiz, duas AC.**

#### R2 — AC2-b, `Invalid Date`

```
FAIL  > AC2-b — timestamptz cru e Invalid Date
      > faladoEm não-finito vira descarte data_invalida — nunca sem_lastro
AssertionError: expected null to be 'data_invalida'
```

Sonda direta, com **as duas** guardas removidas (é preciso remover as duas para reproduzir o cenário
exato da story — só a primeira faz a fala sumir em silêncio, o que já é o outro modo de cegueira):

```
faladoEm finito? false
SEM as duas guardas → {"disparou":true,"afirmou":"Invalid Date","balde":"sem_lastro","descarte":null}
COM as guardas      → {"disparou":true,"afirmou":"null","balde":null,"descarte":"data_invalida"}
```

#### R4 — AC1-b, a Silvana

```
FAIL  > AC1-b — discriminador visita × ligação
      > a fala da Silvana é descartada como ligação e não classifica
AssertionError: expected null to be 'ligacao'
```

E na rodada de produção, sem o discriminador: `descartes.ligacao: 0`, **a Silvana entra como
`sem_lastro`** e os alertas sobem de **8 para 9** — alerta nomeado, no primeiro dia de operação,
sobre o único caso que a AC1-b promete excluir.

#### R5 — AC3-(iv), o balde `lembrete`, com o `lastro_pct` dos dois lados

```
COM o balde `lembrete`   lembrete=5  reparo_humano= 9  den=24  lastro=12,5 %  frouxo=50,0 %
SEM o balde `lembrete`   lembrete=0  reparo_humano=14  den=29  lastro=10,3 %  frouxo=58,6 %
```

**O tamanho do viés é 2,2 p.p. de lastro subcontado**, e ele aponta na direção de inflar o escopo da
tool do Epic 88 — que é a falha silenciosa do Risco 8.

#### R6 e R7 — o par de filtros do `com_lastro`

```
R6 (sem o filtro de autor)   FAIL > broker no mesmo turno é reparo, não lastro
R7 (sem a janela de turno)   FAIL > appointment da Nicole criado 3 dias antes é lembrete, não lastro
```

> ⚠️ **Divergência com a AC3-(iii) como escrita — ver §7, item 2.** A AC pede que *a mesma fixture*
> (admin criando 3 h depois) fique vermelha removendo **qualquer um** dos dois filtros. Isso é
> impossível: a fixture não satisfaz nenhum dos dois, então nenhuma remoção isolada a flipa.
> Implementei **uma fixture por filtro** (R6 e R7) mais a fixture literal da AC contra a régua ingênua
> — três vermelhos em vez de dois, e cada um isola de fato o filtro que nomeia.

---

### 5. AC3 — reconciliação linha a linha com o baseline manual de `5/16 = 31 %`

| # | Pergunta da AC3-(i) | Resposta medida |
|---|---|---|
| 1 | disparos do instrumento × as 16 falas curadas | **30 disparos, em 18 leads** — a auditoria manual olhou 16 falas escolhidas |
| 2 | falas por lead | Ailton ×3; Adriele, Célia, Edicleia, Helena, Maria Oliveira, Marlene, Miriam, Sandra, Valnira, Wilson ×2; Alvaro Natã, André, Andréia, Idalina, Juca, Silvana, Sueli ×1 |
| 3 | linhas que mudam de balde por incluir `cancelled`/`no_show` | **8 linhas**, e o lastro cai **12,5 % → 8,0 %** (frouxo **50 % → 20 %**). Vão para `sem_lastro`: Helena ×2, Miriam, Andréia, Valnira ×2, André — **e o Ailton, que é `com_lastro`** |
| 4 | linhas que foram para `lembrete` e iriam para `reparo_humano` na v0.1 | **5** (Marlene ×2, Edicleia ×2, André) — ver o vermelho R5 |

**O `31 %`/`81 %` fica registrado como `baseline manual, superado`.** O número oficial é
**`lastro_pct = 12,5 %` · `lastro_frouxo_pct = 50,0 %`**, publicado em
`docs/qa/baseline-lastro-w0-3.md` com a **linha de validade datada** (T7).

---

### 6. AC4, AC5, AC7, AC8

- **AC4-(i) dedupe / (ii) `dry`** — provados por teste de rota (`route.test.ts`): a segunda rodada
  devolve `alertas_novos: 0` e `alertas_deduplicados: 1`, sem Telegram e sem
  `NICOLE_AFIRMACAO_SEM_LASTRO`; `?dry=1` não chama `logEvent` nem o Telegram nenhuma vez. **Os dois
  `select count(*)` contra produção ficam para o @devops depois do deploy** — eu não escrevo em prod.
- **AC4-(iii)/(iv)** — a supressão é por **`lead + dia_afirmado`**, e é isso que ela entrega:
  - **No cenário da AC4-(iii) — o par 22:17/22:18 — são ZERO alertas.** A fala das 22:17
    (`sem_lastro`, afirmou 01/08 09:00) sai do alerta porque a das 22:18 (`com_lastro`, afirmou
    01/08 10:00) resolve o **mesmo dia afirmado**, um minuto depois. É o alerta contraditório que a
    AC existe para impedir.
  - **Na rodada real de 60 dias, o Ailton gera 1 alerta**, e ele é da **terceira** fala — a das
    **22:05**, que afirma **03/08 12:00**. Nenhuma fala posterior resolve `com_lastro` para o dia
    03/08, então não há o que suprimir: a supressão é por `lead + dia_afirmado`, não por `lead`.
    O comportamento está correto — é a linha 16 da tabela da §2, e ela está contada entre os 8
    alertas na §7-4. *(Correção de relato: uma versão anterior deste parágrafo dizia "ZERO alertas
    para o Ailton na rodada real". Era falso. Numa story cuja tese é a diferença entre o instrumento
    falhar e o instrumento mentir, relato errado não é cosmético — @qa, gate CONCERNS.)*
  - **(iv)** — a linha das 22:17 **permanece** no relatório com `alerta_suprimido: true` e
    `suprimido_por_message_id` apontando para a fala das 22:18, e **continua no denominador**.
    Suprimir a linha maquiaria o `lastro_pct` para cima.
- **AC5** — allowlist. Na rodada de 60 dias contra o dado real: `chamadas não-select: NENHUMA`. No
  teste, `fake.calls.filter(c => !c.startsWith("select:"))` é `[]`.
- **AC7** — `diff` da função movida = **zero** (`git show HEAD:…/pipeline.ts | sed -n '/^export function detectAffirmedSlot/,/^}/p'`
  contra o arquivo novo: sem diferença). `pipeline.test.ts`, `pipeline-scheduling.test.ts` e
  `pipeline-broker-guard.test.ts` **sem uma linha alterada**, verdes.
- **AC8** — `npx vitest run` da raiz: **1.781 testes passando**, 5 arquivos falhando por dependência
  **ausente no ambiente** (`sharp`, `satori`, `pdf-lib`) — **confirmado pré-existente**: com a árvore
  limpa (`git stash -u -- packages/`) os mesmos 5 falham igual. `tsc --noEmit` em `packages/ai`
  **limpo**; em `packages/web`, **nenhum erro novo** (só os pré-existentes das mesmas libs ausentes).
  `eslint` limpo nos arquivos de `packages/web` desta story. `packages/ai` não tem eslint (AC8).

**Pendente do @devops (AC6):** provar o cron por **efeito em produção** (uma linha
`NICOLE_LASTRO_DIARIO` cujo `created_at` seja de invocação real do agendador) e **nomear qual
projeto Vercel** deploya `packages/web` — há registro de que o webhook da Nicole é atendido por
`prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c` enquanto o `.vercel/project.json` aponta para
`prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj`. **Se os dois deployarem o mesmo `vercel.json`, o cron roda duas
vezes por dia** — o dedupe segura o alerta, mas o fato precisa ficar escrito.

**Colisão de cron reconferida por script** (expandindo os 36 crons do `vercel.json`):
`11:38` → **nenhuma colisão**; `11:30` → **10 crons**, incluindo o `billing-monthly-summary`.

---

### 7. Divergências entre o que a story prevê e o que eu encontrei

1. 🔴 **A premissa do `Invalid Date` está meio certa, e o jeito errado.** A story afirma que
   `new Date("2026-06-28 13:37:40.123+00")` é `Invalid Date`. **No Node 25 (V8), essa string é
   VÁLIDA** — o parser legado aceita a forma com espaço. A que é inválida é a forma **com `T`**:
   `new Date("2026-06-28T13:37:40.123+00")` → `Invalid Date`, porque o `T` manda o parser pelo
   caminho ISO estrito, onde `+00` não é offset legal. **O furo é real e o risco é MAIOR do que a
   story descreve, não menor:** ele depende da grafia exata e da engine, então passa numa máquina e
   quebra noutra. A guarda cobre os dois casos, `parseTimestamptz` normaliza as três grafias
   (`+00` com espaço, `+00` com `T`, `+00:00`), e o teste fixa a medição por escrito.
   Consequência prática: na rodada real `descartes.data_invalida = 0` — o cenário não se materializa
   com o caminho de fetch atual, e a guarda é profilaxia (como o `transicao_humana`).
2. 🟡 **A AC3-(iii) não fecha com uma fixture só** — ver §4. Resolvido com três vermelhos em vez de
   dois, sem mexer na régua.
3. 🟡 **A tabela do Context mistura UTC e BRT.** Ela registra a Célia em *"28/06 13:37"*, que é
   **UTC**; em BRT (a convenção que a própria story fixa para o relatório) é **10:37**. Vale também
   para o Ailton (*"31/07 01:05/01:17/01:18 UTC"* = **30/07 22:05/22:17/22:18 BRT**). O relatório sai
   todo em BRT, como manda a story; **as duas leituras batem**, é só a tabela do Context que está em
   fuso misto.
4. 🟡 **O volume de alerta previsto está superestimado.** A Dev Note 3 fala em *"21 `sem_lastro` em
   60 dias = 0,35 alerta/dia"*. Com a régua final: **12 `sem_lastro`, 11 não suprimidos, 8 alertas
   após o `lead+dia`** → **0,13 alerta/dia**. A *proporção* de falso positivo continua sendo o que
   importa (Risco 3) e não mudou: dos 8 alertas, **4 vêm de fala que é pergunta/oferta**
   (Célia 10:36, Adriele 18:06, Sandra 11:55, Ailton 22:05) — **1 em 2**, pior que o "1 em 3"
   declarado, porque o `lead+dia` **agrupa mais os verdadeiros** (que têm 2 falas) do que os falsos.
   **Isso reforça a condição nº 7 do @architect (guarda de interrogação, Epic 88); não é para
   compensar aqui com heurística nova.**
5. 🟢 **`ORDEM_NORMATIVA` virou uma constante de verdade.** Na primeira versão eu passava
   `"normativa"` literal dentro de `reconciliarAgenda`, e a constante ficava decorativa: flipá-la não
   mudava o número publicado. Troquei para a constante, e o vermelho R3 passou a mover o baseline de
   produção (12,5 % → 0,0 %) **além** de quebrar 7 testes. Uma constante que descreve um invariante
   sem ser lida por ele é uma armadilha do mesmo tipo que a story combate.
6. 🟢 **Fora do escopo, achado na rodada:** dois leads que a auditoria manual não pegou aparecem como
   `sem_lastro` desde junho — **Idalina (16/06, afirmou 20/06 09:00)** e **Alvaro Natã (18/06,
   afirmou 20/06 10:00)**, ambos sem appointment nenhum. Mesmo padrão da Célia, 7 semanas atrás.
   **Não contatei ninguém** (é D8, lado cliente, decisão do Gabriel) — fica registrado aqui e a
   rotina os lista.

---

### 8. File List

**Novos**
- `packages/ai/src/flows/agenda-reconcile.ts`
- `packages/ai/src/flows/agenda-reconcile.test.ts`
- `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts`
- `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.test.ts`
- `docs/qa/baseline-lastro-w0-3.md`

**Modificados**
- `packages/ai/src/chat/pipeline.ts` (import + re-export da `detectAffirmedSlot`)
- `packages/ai/src/flows/visit-slot.ts` (recebe a `detectAffirmedSlot`, diff zero)
- `packages/ai/src/flows/index.ts` (exporta a função e o módulo)
- `packages/web/vercel.json` (cron `38 11 * * *`)
- `docs/stories/87-3-reconciliacao-diaria-fala-x-banco.story.md` (Tasks, Status, Dev Agent Record, Change Log)

**Nenhuma migration. Nenhuma escrita em produção.**

## QA Results

**Revisor:** Quinn (Guardian, Test Architect) · **Data:** 2026-08-08 · **Modelo:** claude-opus-5
**Branch:** `story/87-3-reconciliacao-fala-banco` (de `main` @ `17e9a8dc`), não commitado
**Método:** verificação independente — rodei tudo eu mesmo, da raiz do monorepo. Nenhum número abaixo
foi copiado do Dev Agent Record; onde eles coincidem, coincidem porque eu reproduzi.

### Gate: **CONCERNS** → `docs/qa/gates/87.3-reconciliacao-diaria-fala-x-banco.yml`

O instrumento faz o que promete e o baseline reproduz campo a campo. Duas ressalvas: **uma afirmação
factualmente errada no Dev Agent Record** (DOC-001) e a **AC6 que só fecha por efeito em produção**.

---

### 1. Os três modos de falha — cada guarda revertida, cada vermelho conferido

Reverti guarda por guarda e rodei a suíte em cima. Todas as mutações foram desfeitas (md5 do arquivo
final idêntico ao backup).

| # | Mutação | Vermelhos (meus) | @dev reportou |
|---|---|---|---|
| **R1** | âncora vira `new Date()` | **18 de 28** | 18/28 ✅ |
| **R2** | guarda de `Invalid Date` removida | 1 · **2** com as duas guardas | 1 ✅ |
| **R3** | `ORDEM_NORMATIVA` flipada | **7** | 7 ✅ |
| **R4** | `PADROES_LIGACAO` esvaziado | **4** | 4 ✅ |
| **R5** | balde `lembrete` removido | **4** | 3 — a cobertura real é **maior** |
| **R6** | filtro `created_by='nicole'` removido | 1 | 1 ✅ |
| **R7** | janela de mesmo turno removida | 1 | 1 ✅ |
| **R8** 🆕 | `.eq("role","assistant")` removido | 1 | — |
| **R9** 🆕 | short-circuit do `?dry` removido | 1 | — |
| **R10** 🆕 | supressão `lead+dia` removida | 2 | — |

**R8 existe por causa da lição do mock `is: () => b`.** Li o `createFakeSupabase` e ele empilha
predicados de verdade (`eq`, `in`, `gte`, `lte`, `gt`); removendo o filtro de `role` o teste **fica
vermelho**, o que prova que o harness discrimina e a `role='broker'` é excluída de fato, não por
acaso.

**Precedência dos baldes:** confirmei a sobreposição estrutural. Com `lembrete` primeiro, `com_lastro`
é inalcançável — e isso aparece tanto nos 7 testes quanto no número (abaixo).

### 2. `ORDEM_NORMATIVA` — a autocrítica do @dev: a correção **pegou**

A pergunta não era "quebra teste?", era "**move o número publicado?**". Flipei a constante e rodei
`reconciliarAgenda` de ponta a ponta:

```
ORDEM_NORMATIVA="normativa"           com_lastro 1 · lembrete 1 · den 3 · lastro_pct 33,3 % · alertas 1
ORDEM_NORMATIVA="lembrete_primeiro"   com_lastro 0 · lembrete 2 · den 2 · lastro_pct  0,0 % · alertas 2
```

**A constante é lida pelo caminho que publica o número** (`reconciliarAgenda` passa
`ordemBaldes: ORDEM_NORMATIVA`, e `classificarFala` cai em `input.ordemBaldes ?? ORDEM_NORMATIVA`).
**Não é da classe do `is: () => b`.** Efeito colateral útil: com a constante flipada, o bloco
`sensibilidade` publica as duas leituras **iguais** — que é exatamente o detector escrito como
conferência nº 5 do runbook (`docs/qa/baseline-lastro-w0-3.md`).

### 3. `Invalid Date` — a correção de premissa do @dev está **certa** (Node v25.6.1)

```
"2026-06-28 13:37:40.123+00"     (espaço)  →  VÁLIDA  → 2026-06-28T13:37:40.123Z
"2026-06-28T13:37:40.123+00"     (com T)   →  INVALID DATE
"2026-06-28T13:37:40.123+00:00"            →  VÁLIDA
```

A story afirmava o contrário. O @dev corrigiu, e cobriu as **três** grafias: `parseTimestamptz`
normaliza `+00` com espaço, `+00` com `T` e `+00:00`, e o teste fixa a medição por escrito — o que
importa, porque o furo depende de engine e passa numa máquina e quebra noutra.

### 4. A rodada de 60 dias — **eu rodei a minha**

Contra `dsopqkqjkmhytudaaolv`, service role, **somente `SELECT`**, em 2026-08-08:

```jsonc
{ "total_disparos": 30, "descartes": { "ligacao": 1, "transicao_humana": 0, "data_invalida": 0 },
  "lembrete": 5, "denominador": 24, "com_lastro": 3, "reparo_humano": 9, "sem_lastro": 12,
  "lastro_pct": 12.5, "lastro_frouxo_pct": 50, "alertas": 8, "mensagens_lidas": 1170,
  "sensibilidade": { "ordem_normativa": { "lastro_pct": 12.5 }, "lembrete_primeiro": { "lastro_pct": 0 } } }
```

**Bate com o @dev em todos os campos**, e as 30 linhas conferem **uma a uma** com a tabela do Dev
Agent Record. (`mensagens_lidas` 1170 vs 1157 — a janela deslizou ~2 h entre as duas rodadas.)

- **Os 8 nomes aparecem, com a multiplicidade exata da AC1:** Célia ×2, Helena ×2, Miriam ×2,
  **Ailton ×3**, Sandra ×2, Sueli ×1, Valnira ×2, Maria Oliveira ×2 = **16 falas**.
- **A Silvana não aparece em balde nenhum**: 1 linha, `balde: null`, `descarte: "ligacao"`,
  `descartes.ligacao = 1`, **zero alertas** para ela.
- **O Ailton — o controle mais importante — não foi engolido.** A fala das 22:17 afirma 09:00, o
  appointment dele é 10:00: sai `sem_lastro` com `divergencia_min: 60` e `appointment_id_proximo`
  preenchido. **A janela de classificação não foi afrouxada** — o `divergencia_min` vem da janela de
  RELATÓRIO (±24 h), sem efeito nenhum sobre o balde. É a diferença entre medir o erro e disfarçá-lo.

### 5. Read-only — provado, não aceito

- Módulo: as únicas chamadas são `select:messages`, `select:conversations`, `select:leads`,
  `select:appointments`. Não há `insert/update/upsert/delete/rpc` no arquivo.
- **`?dry=1` é read-only de verdade:** o `return` do dry precede o `select` de dedupe, os dois
  `logEvent` e os envios de Telegram. **E é testado** — removendo o short-circuit (R9), o teste fica
  vermelho. Não é o `dry` decorativo do cron do bolsão.
- Minha própria rodada contra produção não escreveu nada.

### 6. `detectAffirmedSlot` — mudou de casa com diff **zero**, e o re-export segura

- Extraí o corpo da função de `HEAD:packages/ai/src/chat/pipeline.ts` e do novo
  `flows/visit-slot.ts`: **`diff` vazio**.
- Consumidores: `pipeline.ts:116` e `pipeline.ts:1028` (caminho vivo, `now: new Date()` — correto
  para turno em tempo real, **intocado**); `pipeline.test.ts` continua importando de `"./pipeline"` e
  passa pelo re-export.
- `git status packages/ai/src/chat/` mostra **apenas** `pipeline.ts` modificado — `pipeline.test.ts`,
  `pipeline-scheduling.test.ts` e `pipeline-broker-guard.test.ts` **sem uma linha alterada**, verdes.

### 7. Os dados que mudaram embaixo do teste — **sem impacto**

Os 3 resumos corrigidos em produção (Marilda, Adriele, Sandra) não tocam nada aqui: o módulo lê
`messages.content`, **nunca resumos**; todas as fixtures são literais no arquivo de teste; e a minha
rodada de hoje reproduz as 30 linhas do @dev, **incluindo Adriele ×2 e Sandra ×2** nos mesmos baldes.
A Marilda não dispara em janela nenhuma.

### 8. Escopo e suítes

- **Caminho de decisão da Nicole: intocado.** `pipeline.ts` muda só a linha de import e troca o corpo
  da função por um re-export. Sem migration. Sem refatoração além do necessário.
- **Cron `38 11`:** expandi os 36 crons do `vercel.json` — **zero colisões em 11:38**; 10 em 11:30.
- `npx vitest run` da raiz: **1.781 passando**, 7 expected-fail, 5 arquivos falhando por dependência
  **ausente do `node_modules`** (`sharp`, `satori`, `pdf-lib` — confirmei que não estão instaladas).
  Pré-existente e sem relação.
- `tsc --noEmit` em `packages/ai` **limpo**; em `packages/web`, só os erros pré-existentes de módulo
  ausente. `eslint` na rota: **0 erros**, 2 warnings.

---

### 🔴 DOC-001 (medium) — a única coisa que encontrei que não é verdade

O Dev Agent Record §6 afirma: *"**ZERO alertas para o Ailton na rodada real**"*.
**Na minha rodada há 1 alerta para ele** — a fala de **30/07 22:05 BRT**, que afirma **03/08 12:00** e
não tem fala corretiva **naquele dia afirmado**.

**O código está certo.** A unidade da supressão é `lead + dia_afirmado`, e `03/08 ≠ 01/08`; a fixture
literal da AC4-(iii) é o par 22:17/22:18, e **esse par produz zero alertas** — verificado, e o R10
prova que a supressão é o que faz isso acontecer. O problema é só o relato: **a própria story se
contradiz** — a linha 16 da tabela dela marca **ALERTA** para o Ailton 22:05, e o §7-4 conta
"Ailton 22:05" entre os 8 alertas e entre os 4 falsos positivos.

Numa story cuja tese é *"a diferença entre o instrumento falhar e o instrumento mentir"*, uma
afirmação falsa no registro dele não é cosmética. **Corrigir a frase do §6 antes de marcar `Done`.**

### Ressalvas menores (não bloqueiam)

- **REL-001 (low):** o dedupe **não é atômico** — `select` em `system_events` e depois `logEvent`. Se
  dois projetos Vercel deployarem o mesmo `vercel.json`, os dois crons disparam **no mesmo minuto** e
  podem ambos ler vazio e ambos escrever. O Risco 4 cobre re-execução **sequencial**, não
  **concorrente**. Quem fecha isso é a pré-tarefa da AC6, não o código — e isso precisa estar escrito
  para ninguém confiar no dedupe como rede.
- **REL-002 (low):** `logEvent` é fire-and-forget e, no dia **sem** alerta (o caso comum), o insert de
  `NICOLE_LASTRO_DIARIO` é a última instrução antes do `return` — nada segura a lambda viva. É a
  classe do incidente da Story 75-139 (`void sendEmail` não chegava). **Atenuante medido:** o
  `FOLLOWUP_EXECUTED` de `api/cron/followup` tem exatamente a mesma forma e **está em produção**
  (21/07) — o padrão funciona neste deploy. A prova por efeito da AC6 resolve; se a linha não
  aparecer, o conserto é `after()` (já usado em `webhook/whatsapp`), não investigação.
- **REL-003 (low):** o `select` de dedupe não tem `.limit()` nem filtro por `message_id` — depende do
  teto default de 1000 do PostgREST. Hoje inofensivo (0,13 alerta/dia); degrada em silêncio se o
  volume mudar.
- **MNT-001 (low):** `DEFAULT_ORG_ID` hardcoded (consistente com `daily-report`, mas o projeto está
  pivotando para multi-tenant).
- **TEST-001 (low):** 2 warnings de eslint (`_supabase`, `_opts`) em `route.test.ts`.

### Status por AC

| AC | Veredito |
|---|---|
| AC1 · AC1-a · AC1-b | **PASS** — conferidos na minha própria rodada |
| AC2 · AC2-b | **PASS** — R1 = 18/28; premissa corrigida e verificada no Node 25.6.1 |
| AC3 (i, i-b, ii, iii, iv, v) | **PASS** — número publicado, sensibilidade nas duas leituras, reconciliação linha a linha |
| AC4 | **CONCERNS** — comportamento correto; o **relato** do Ailton está errado (DOC-001) |
| AC5 | **PASS** — allowlist + `?dry` testado + minha rodada sem escrita |
| AC6 | **PENDENTE** — só fecha por efeito em produção (@devops) |
| AC7 · AC8 | **PASS** — diff zero, suítes verdes, sem erro novo de tipo ou lint |

### Ações requeridas antes de `Done`

1. **[@dev]** Corrigir DOC-001 — a frase do Ailton no Dev Agent Record §6.
2. **[@devops]** AC6: provar `NICOLE_LASTRO_DIARIO` por **invocação real do agendador** e **nomear** o
   projeto Vercel que deploya `packages/web`.
3. **[@devops]** Os dois `select count(*)` do dedupe em produção (AC4-i) + registrar REL-001.
4. **[@po/@pm]** Propagar **12,5 %** à §3 do Epic 87 e ao `PM2` do Epic 88; o `31 %` passa a
   *baseline manual, superado*.

**Gate: CONCERNS** → `docs/qa/gates/87.3-reconciliacao-diaria-fala-x-banco.yml`

— Quinn, guardião da qualidade 🛡️

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-07 | **1.1** | **Correção de RELATO exigida pelo gate CONCERNS do @qa — nenhuma linha de código alterada.** O Dev Agent Record §6 afirmava *"ZERO alertas para o Ailton na rodada real"*. **É falso: há 1.** O código está certo e validado — a unidade da supressão é `lead + dia_afirmado`, e o par 22:17/22:18 da AC4-(iii) produz mesmo zero alertas. O alerta que existe é o da **terceira** fala, a das **22:05**, que afirma **03/08 12:00** e não tem fala corretiva naquele dia afirmado; não há o que suprimir. O erro estava só no parágrafo do §6, que generalizava o cenário da AC para a rodada inteira — e contradizia a própria tabela da §2 (linha 16, marcada `ALERTA`) e o §7-4 (que conta "Ailton 22:05" entre os 8 alertas e entre os 4 falsos positivos). §6 reescrito separando os dois cenários. **Numa story cuja tese é a diferença entre o instrumento falhar e o instrumento mentir, relato falso não é cosmético** (@qa). Menores registrados pelo @qa e deliberadamente NÃO tratados nesta passada: dedupe não atômico entre dois projetos Vercel disparando no mesmo minuto, `logEvent` fire-and-forget no dia sem alerta, dedupe sem `.limit()`, `DEFAULT_ORG_ID` hardcoded. | @dev (Dex) |
| 2026-08-07 | **1.0** | **Implementada pelo @dev (Dex). `Ready → Ready for Review`.** T1–T7 fechadas. Módulo `flows/agenda-reconcile.ts` + cron `GET /api/cron/nicole-agenda-reconcile` (`38 11`, sem colisão — reconferido por expansão dos 36 crons) + 33 testes (28 no módulo, 5 na rota). **Rodada retroativa de 60 dias contra produção, só leitura: `total_disparos 30 · descartes.ligacao 1 · lembrete 5 · denominador 24 · com_lastro 3 · reparo_humano 9 · sem_lastro 12 · lastro_pct 12,5 % · lastro_frouxo_pct 50,0 %` — bate com a previsão do @po em TODOS os campos.** Os 8 leads da AC1 aparecem, em 16 falas; a Silvana não aparece em balde nenhum e não gera alerta. **Sensibilidade publicada nas duas leituras: 12,5 % × 0,0 %.** Sete vermelhos colados, um por guarda (âncora → 18/28 vermelhos; precedência → 7 e o baseline vai a 0 %; `Invalid Date`; `PADROES_LIGACAO`; balde `lembrete` → 12,5 % vs 10,3 %; filtro de autor; janela de mesmo turno). Baseline registrado em `docs/qa/baseline-lastro-w0-3.md` com a linha de validade datada. **Quatro divergências reportadas (§7 do Dev Agent Record):** a premissa do `Invalid Date` é dependente de grafia e de engine (no Node 25 a string do psql é VÁLIDA; a inválida é a forma com `T`) — o risco é maior, não menor; a AC3-(iii) não fecha com uma fixture só (resolvido com três vermelhos, sem afrouxar a régua); a tabela do Context mistura UTC e BRT; e o volume de alerta é **0,13/dia**, não 0,35 — mas a proporção de falso positivo é **1 em 2**, pior que o 1 em 3 declarado, porque o `lead+dia` agrupa mais os verdadeiros. **Pendente do @devops:** AC6 (prova de execução real do agendador + nomear o projeto Vercel) e os dois `select count(*)` do dedupe em produção. | @dev (Dex) |
| 2026-08-07 | **0.4** | **Revalidação @po — ✅ GO (9/10). `Draft → Ready`.** As oito correções da v0.2 (B1–B8) foram conferidas **uma a uma com evidência de arquivo e de banco**, não pelo Change Log: o discriminador visita×ligação rodado contra os 60 dias descarta **exatamente 1 fala (a Silvana) e nenhuma outra**, com a regra de precedência funcionando; o cron **`38 11`** é o único minuto livre entre os **35** do `vercel.json` (reconferido hoje); a AC2-b, a unidade, o denominador, a decisão de `status` e o balde `lembrete` estão escritos. **Quatro correções minhas, todas medidas, aplicadas por autoridade de @po sobre AC e escopo:** **(1) 🔴 PRECEDÊNCIA DOS BALDES — a correção que impedia o GO.** `com_lastro` (`created_at ≤ fala+2min`) e `lembrete` (`created_at < fala`) se sobrepõem inteiramente, e a v0.3 não dizia qual vem primeiro. Rodei a régua nas duas ordens contra 60 dias: **0,0 % × 8,7 % × 12,5 %** para o mesmo dado. A causa é estrutural — o INSERT do appointment precede a fala em **0,09 a 0,87 s** nos **6** appointments `created_by='nicole'` do projeto —, então com `lembrete` primeiro o `com_lastro` é **inalcançável por construção** e o instrumento publica **0 % para sempre**, com AC1, AC2, AC2-b e AC4 **verdes**. É o modo de falha dos Riscos 7/8 chegando por uma porta que a AC2-b não cobre. Ordem agora é normativa, a janela do `com_lastro` virou **bilateral (`JANELA_MESMO_TURNO_MIN = 15`, justificada pelo maior Δ real medido: 12,8 min do Ailton)`**, e a **AC3-(i-b)** exige o vermelho do Wilson e a publicação do número **nas duas leituras** — a ambiguidade vira número em vez de sumir. Risco 10 acrescentado. **(2) AC4-(iii) dependia da mesma raiz:** com `lembrete` primeiro, a fala corretiva do Ailton não é `com_lastro` e a supressão não dispara — o alerta contraditório sai assim mesmo. Registrado na AC4. **(3) AC1-a não fechava como escrita:** o Ailton **não tem** appointment dentro da janela de classificação de ±30 min, então `divergencia_min` sai **`null`**, não `60` (medido). Declaradas **duas janelas**: classificação ±30 min (decide o balde, não muda) e **relatório ±24 h** (só preenche `divergencia_min`, sem efeito no balde). **(4) AC1: são 8 leads e 16 falas** (Célia×2, Helena×2, Miriam×2, Ailton×3, Sandra×2, Sueli×1, Valnira×2, Maria×2) — a v0.3 dizia *"11 ou mais"* e a lista de multiplicidade esquecia Célia×2 e Sandra×2. Acrescentada a referência de conferência do formato (12,5 %/50 %), explicitamente **como conferência e não como alvo**. | @po (Pax) |
| 2026-08-07 | **0.3** | **Gate de existência REVOGADO — 9 citações ajustadas** (Epic 87 v0.4 · Epic 88 v0.3). O lastro deixa de ser interruptor (*"≥90% → a tool não se justifica"*) e vira critério de **sequenciamento e dimensionamento** do Epic 88 — quando sobe, com que escopo, quantas tools na v1 (frontmatter: `sequenciamento_e_dimensionamento`). Decisão do Gabriel: *"tool use é arquitetura de agente, deveria ser feito de maneira sênior independente de outro resultado"*. **O Epic 88 acontece.** Ajustados: o bloco de abertura "INSTRUMENTO do gate" → "INSTRUMENTO que DIMENSIONA o Epic 88", a causa (d) do bloco de calibração, o Desenho §3-b, a nota de fecho da AC2-b, os Riscos 5, 7 e 8, a T7 e a referência à §7/Onda 4 do epic. **Riscos 7 e 8 reescritos com o ponto do @pm, que FORTALECE a exigência de calibração:** com o número dimensionando em vez de aprovar, um instrumento que publica 0% falso **encolhe a v1 errado** em vez de reprová-la errado — o dano **muda de natureza, não de gravidade**, e piora num aspecto: v1 subdimensionada é falha **silenciosa** (ninguém reclama do escopo que nunca foi escrito), enquanto reprovação errada ao menos gerava discussão. **A recalibração B6 fica mais crítica, não menos.** Nenhuma AC validada pelo @po foi alterada; nenhum escopo reaberto. | @sm (River) |
| 2026-08-07 | **0.2** | **Revisão contra a validação @po `docs/qa/po-validation-87-3-87-4.md` (NO-GO 6/10) — todas as 8 correções aplicadas.** **B1:** lista única de **oito** casos, com a Sandra acrescentada à tabela do Context (05/08 14:55 → 08/08 12:00 BRT) e a contagem "sete" removida. **B2:** discriminador **visita × ligação** desenhado no `agenda-reconcile.ts` (Desenho §5), com `PADROES_LIGACAO` escritos, regra de precedência e a Silvana como fixture com vermelho obrigatório — o `OUT` "não mexer na `detectAffirmedSlot`" **fica**, ratificado. **B5:** **AC2-b** nova — `Invalid Date` do texto cru de `timestamptz` (`…+00`) é falha explícita com contador próprio, nunca `sem_lastro`; sem ela o job publica **0%** com AC1 e AC2 verdes. **B6:** unidade declarada (relatório = fala, alerta = lead+dia), denominador declarado, contradição do `status` resolvida por escrito (**`cancelled`/`no_show` contam** — vale 27 p.p.), **4º balde `lembrete`** fora do numerador **e** do denominador (Marlene ×2 e Edicleia ×2 medidos), e o alvo numérico da AC3 mudou de natureza: **o `31%`/`81%` passa a `baseline manual, superado`** e o instrumento publica o próprio número com reconciliação linha a linha. **B8:** cron `30 11` → **`38 11`** (colidia com `billing-monthly-summary`). **B3:** supressão de alerta por `lead+dia` (Ailton 01:17 × 01:18), com a linha preservada no relatório. **B4:** divergência da data da Helena **resolvida** — `24/06 00:11 UTC` = `23/06 21:11 BRT`, as duas fontes estavam certas; convenção BRT fixada. **B7:** citação real da Sueli corrigida (a frase que dispara é a interrogativa, não *"Te espero por lá"*), AC1 declarada com **validade datada**, e a proporção de falso positivo (**~1 em 3**, não "0,1/dia") no Risco 3. Esforço **S → M**. Riscos 7, 8 e 9 acrescentados. | @sm (River) |
| 2026-08-07 | 0.1 | Story criada a partir do `W0-5` do Epic 87 v0.3, do debate do @architect de 07/08 (§2.3, §2.4, §4, §7.3, §9-2 e §9-6) e da auditoria do @po de 06/08 (§1, §5.1, §5.2). Escopo fechado em: instrumento de medição **e** alerta — não só alerta. Régua de três baldes com a definição estrita cravada, e a definição frouxa obrigada a aparecer rotulada. AC1 é a condição nº 2 do @architect, literal. Acrescentados pelo @sm, contra o código de hoje: a armadilha da âncora na rodada retroativa (AC2), o `metadata.is_transition` que grava fala humana como `role='assistant'`, o ciclo de import que obriga a mover a `detectAffirmedSlot` (AC7), a duplicação de cron entre dois projetos Vercel (AC6) e o vermelho obrigatório do teste de classificação (AC3-ii). | @sm (River) |
