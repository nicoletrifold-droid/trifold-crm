# Validação @po — Story 87-12 (o resumo do corretor lê o fato de agenda no formato novo)

**Validado por:** @po (Pax) em 2026-08-15
**Epic:** 87 — Nicole: Confiabilidade de Contexto, Estado e Enforcement
**Story:** `docs/stories/87-12-handoff-le-fato-de-agenda-no-formato-novo.story.md` (`Draft` → **`Ready`**)
**Origem:** §9 e §13 do meu parecer de 10/08 (`po-validation-87-10-87-11.md`)
**Método:** medição própria contra produção (`dsopqkqjkmhytudaaolv`, Management API, **somente
`SELECT`**), leitura do código em `HEAD` `24800872`, **mutação de teste executada e revertida**
(`md5` conferido), e reprodução independente do score em SQL.

| Veredito | Prioridade na fila | Status |
|---|---|---|
| **GO** — 10/10, com **6 emendas** aplicadas por mim | 🔴 **REBAIXADA** — sai da posição 0 | `Draft` → **`Ready`** |

> As emendas **já estão no arquivo da story**. Nada volta para o @sm. As mudanças de AC, escopo e
> risco são de minha autoria e responsabilidade (AC é do @po).
> **Não toquei em `epic-87-*.md`** — há outra validação minha rodando em paralelo (87-14) e os
> pedidos ao @pm ficam no fim da story.

---

## 0. As duas perguntas que me foram feitas, respondidas de saída

**1. A story se sustenta pelo defeito estrutural, com dano retrospectivo ~nulo e escrita estancada?**
**Sim — e o @sm derrubou o meu enquadramento com folga suficiente.** Mas ela se sustenta por **menos**
do que ele escreveu, e eu tive de declarar o teto (E5).

**2. Ela fica na frente da fila?** **Não. Eu estava errado, e o erro é meu, de 10/08.**
Detalhe em §6.

---

## 1. O que eu medi antes de decidir

**Todos os números centrais do @sm sobrevivem.** É o oposto da validação de 07/08, em que 7 de 8
checagens divergiram — e merece registro, porque a disciplina de medir antes de escrever aparece no
resultado.

| # | O que o @sm escreveu | O que eu medi | Veredito |
|---|---|---|---|
| M1 | `visit_availability`: 56 com a chave, **56 string**, 0 boolean; `agenda_state` = 2; total 279 | **idêntico** | ✅ |
| M2 | 14 handoffs · 14 `nao informado` · 0 `sim` | **idêntico** (e `nao` = 0 também) | ✅ |
| M3 | Régua 1 (`> 60`): 44 pega / 12 não; min 13, max 1.981, mediana 209,5 | **idêntico, inclusive a mediana** | ✅ |
| M4 | Régua 2 (procedência): 45 Nicole / 3 lead / 8 nada | **idêntico** (e `casa_ambos` = 0 — as classes são disjuntas) | ✅ |
| M5 | 7 dias: 37 estados tocados, **0** com legado, 2 com `agenda_state` | **idêntico** | ✅ |
| M6 | `NICOLE_AGENDA_STATE_LEGADO_DESCARTADO` = **0 all-time** | **confirmado — o `event_type` não existe na tabela** | ✅ |
| M7 | Último contaminado **06/08 19:00:22** (briefing dizia 05/08) | **idêntico.** O @sm está certo, o briefing não | ✅ |
| M8 | `NICOLE_LASTRO_DIARIO` = 6, de 10/08 a 15/08 (corrigindo o **meu** "0 all-time") | **confirmado. O número desatualizado era meu** | ✅ |
| M9 | Bloco B: **27** caem de `qualified`, **10** de `warm` para `cold` | **reproduzi o `calculateQualificationScore` em SQL: 27 e 10, exatos** | ✅ |
| M10 | Os **56 `id`** congelados na T5 | **batem com produção conjunto a conjunto** — 0 a mais, 0 a menos | ✅ |
| M11 | Fixtures Rita e Ronaldo | **byte a byte**, incluindo `expira_em` e `ancorado_em` | ✅ |
| M12 | `blame`: linha 138 e `formatBoolean` de **31/03/2026**, `a5e29d70`, commit inicial | **confirmado nos dois** | ✅ |
| M13 | `tsc --noEmit` em `packages/ai` = 0 no baseline | **confirmado, exit 0** | ✅ |
| M14 | Migration **231** (maior local = 230) | **confirmado, e também em `origin/main`** | ✅ |
| M15 | Crosstab dos 14 handoffs: 6 nada / 7 Nicole / 1 real | ❌ **5 / 8 / 1** — faltou o André | 🔴 **E2** |
| M16 | Fixture negativa da AC3 é "do lead Luiz" | ❌ a string de 104 ch é da **Kharina**; o Luiz dos handoffs **não tem a chave** | 🔴 **E3** |
| M17 | Risco 2: a queda de 27 leads é *"Alta (é certa)"* | ❌ **é latente. A migration não toca `leads` e a população é dormente** | 🔴 **E4** |
| M18 | §5: Valnira/Marlene são *"saudações da Nicole"* (Régua 1) **e** *"disponibilidade real"* (Régua 2) | ❌ **as duas células se contradizem**; fui às mensagens | 🔴 **E1** |

---

## 2. A saída sem régua — **CONFIRMADA, e é o que sustenta a story**

Esta era a peça que eu mandei conferir *"você mesmo; se ele estiver errado, a story inteira muda"*.
**Ele está certo, e reconferi a cadeia inteira nas linhas exatas:**

| linha | fato |
|---|---|
| `pipeline.ts:760` | `stripLegacyAgendaKeys(collectedData)` — **incondicional**, e **muta o objeto** (`delete collectedData[key]`, conferido na implementação) |
| `pipeline.ts:1202` | `updatedData` nasce de `extractCollectedData(message, collectedData, …)` — do objeto **já limpo** |
| `pipeline.ts:1222-1223` | `aiExtracted` → `finalData` |
| `pipeline.ts:1251` | `generateHandoffSummary(finalData, allMessages)` — e é o **único** chamador de produção (os outros 2 são testes) |
| `pipeline.ts:1513` | `leadPatch.ai_summary = handoffSummary` |

**E o escritor está morto no código, não só no dado:** `grep` por `visit_availability` em `packages/`
devolve leitores, pesos, constantes, comentários e testes — **nenhuma atribuição**. O único escritor
de fato de agenda é `buildAgendaState`, atrás de `origem: "lead"` (`qualification.ts:321` → `:355`).

**Consequência que fecha a questão da régua:** o que chega à função é `agenda_state`, cuja procedência
está **no tipo** — `parseAgendaState` rejeita objeto sem `citacao` não-vazia ou com `origem ≠ 'lead'`
(`agenda-state.ts:181-182`, confirmado). A story **não precisa** de heurística de conteúdo, e por isso
não propõe nenhuma. **É a decisão certa.**

---

## 3. 🔴 As duas réguas: os números do @sm estão certos, a classificação não (E1)

Ele mandou eu contar. Contei — e a contagem dele bate. **Mas a tabela classifica os MESMOS dois
valores de duas maneiras incompatíveis:** a célula da Régua 1 chama Valnira e Marlene de *"saudações
da Nicole"* (falsos negativos); a da Régua 2 chama **os mesmos dois** de *"disponibilidade real"*
(falsos positivos). Não podem ser as duas coisas. Fui às mensagens:

| | o que está gravado em `visit_availability` | o que o **lead** disse | quem acerta |
|---|---|---|---|
| **Valnira** | `"quinta-feira às 10h"` — texto de **confirmação da Nicole** (*"a quinta-feira às 10h está confirmada para você!"*) | **`"Na quinta as 10"`** — disse, com outras palavras | a Régua 2 **erra**: apaga um fato verdadeiro |
| **Marlene** | `"segunda-feira, 3 de agosto às 16h"` — **confirmação da Nicole** (*"Sua visita está marcada para…"*) | **`"Ok!"`** — nunca enunciou dia nem hora | a Régua 2 **acerta**. Não é falso positivo |

**Nenhum dos dois casa com `role='user'`** (`casa_lead = false` nos dois, medido). E aí está o achado
que vale mais que a correção:

> **A string legada quase nunca é a fala do lead — nem quando o fato é verdadeiro.** Ela é a Nicole
> normalizando o que ele disse (Valnira) ou confirmando algo que ele nunca disse (Marlene). Não há
> régua recuperando procedência de um texto que não tem procedência.

**A conclusão normativa do @sm fica de pé e sai mais forte.** Ele acertou pelo motivo quase certo, e
o motivo certo é melhor. Reescrevi a tabela na story (E1).

---

## 4. 🔴 O teste colinear: **executei a mutação. Verde.** (o achado que me foi pedido julgar)

Não aceitei a leitura — rodei.

```
Mutação: remover `has_down_payment: true` da fixture de handoff.test.ts:158-190,
         mantendo `expect(summary).toContain("sim")`.

$ npx vitest run packages/ai/src/flows/handoff.test.ts
   Test Files  1 passed (1)
        Tests  23 passed (23)
```

**23/23 verde com o campo que a asserção diz provar removido.** A asserção `toContain("sim")` (com o
comentário `// has_down_payment=true` ao lado) é satisfeita pela **outra** chave: `visit_availability:
true` produz `- Disponibilidade para visita: sim`. Os dois campos produzem a mesma palavra e o teste
pede a palavra solta. *(Arquivo restaurado; `md5 f568e911e7e81e36230cc36dafea9430`; `git status` limpo
em `packages/`.)*

**Agrava:** `visit_availability: true` é um valor que **produção nunca produziu** (56/56 strings). O
teste guardava um contrato que não existe, com uma asserção que não discrimina. **É a explicação
mecânica dos 4 meses de silêncio, e ela está provada, não conjecturada.**

### A correção do teste basta, ou pede varredura própria?

**Basta para esta story — e a varredura é item próprio, não escopo daqui.** Razão:

- A AC4 corrige o caso concreto (asserção ancorada no rótulo, `toContain("Entrada disponivel: sim")`).
- A AC3 instala o **antídoto estrutural**: a fixture de anti-colinearidade com os dois campos no mesmo
  objeto — um caso que produção **nunca** gera (o `:760` apaga um antes de o outro ser lido) e que é o
  **único** que separa os dois leitores. Isso é desenho de teste correto, não remendo.
- Uma varredura por "asserção de valor solto que casa com mais de um campo" é uma régua nova sobre a
  suíte inteira, e **esta casa acabou de recusar três réguas**. Ela precisa de denominador próprio
  (quantos testes pega, quantos erra) antes de existir.

**Encaminhamento:** registrado como **item de backlog para o @pm** (§8), com o nome certo —
*"inventário de asserções colineares na suíte da Nicole"* —, e com a observação de que este é o
**segundo** caso da família (o primeiro foi a `87-13`, cuja suíte deu 7/7 com a linha do filtro
removida). **Dois casos não são régua, mas são padrão.** No terceiro, vira story.

---

## 5. 🔴 O bloco B: a limpeza fica, a justificativa estava invertida (E4)

Este é o ponto onde eu discordo mais do @sm — e não é sobre fazer ou não fazer.

**O que confirmei a favor dele:**
- Os **56 `id`** batem com produção conjunto a conjunto (verifiquei por diferença de conjuntos, não
  por contagem). **Backfill por `id` nomeado, exemplar.**
- **27 e 10 são os números certos** — reproduzi o score em SQL de forma independente.
- A auto-cura **realmente não alcança** esta população: `pipeline.ts:760` só roda em turno vivo, e o
  cron `enrich-leads` filtra por `last_message_at >= now() - ENRICHMENT_WINDOW_MINUTES` (janela de
  **minutos**). Conversas dormentes desde 13/06–06/08 nunca entram. `LEGADO_DESCARTADO = 0` all-time
  é consistente com isso. **O bloco B é o único mecanismo que vai limpar essas 56.**

**O que derrubei:**

> **Os 27 leads não caem na migration. E, pelo próprio argumento da story, provavelmente não caem
> nunca.**
>
> 1. A **AC13 proíbe** a migration de tocar `leads` — decisão certa e escrita.
> 2. `leads.qualification_status` só é reescrito em `pipeline.ts:1327` (turno vivo) e
>    `haiku-enrichment.ts:237` (cron). **Ambos exigem conversa recente.**
> 3. E o §6 da própria story argumenta que **essa população é dormente** — é o que justifica o bloco B
>    existir.
>
> **Não dá para ter os dois.** Se são dormentes o bastante para o runtime nunca as tocar, o runtime
> nunca recalcula o score delas. E no dia em que uma acordar, o `:760` teria apagado as chaves de
> qualquer jeito — **a queda seria idêntica com ou sem a migration**.

Medi o estado persistido hoje nos leads das 56 linhas: **29 `qualified`** (15 `hot`, **10 `cold`**,
4 `warm`) e 27 `in_progress`. Os **10 `qualified` + `cold`** são impossíveis pela fórmula (`>= 70` ⇒
`hot`) — **a tabela `leads` já está descolada do score**, por override manual (75-237) ou staleness.
Anterior a esta story; mas depois da 231, **29 leads carregam um `qualified` que nada no estado
sustenta**, e quem auditar vai esbarrar nisso. Está escrito na story agora (Achado nº 6).

**As três consequências, aplicadas:**
1. **Risco 2** cai de *"Alta (é certa)"* para **latente**.
2. **AC12** passa a emitir `projecao_caem_de_qualified` / `projecao_caem_para_cold` e um
   **`leads_reescritos: 0` explícito**. Um evento que diz *"27 caíram"* quando **zero** caíram é a
   classe de métrica que esta casa já recusou duas vezes. *(O `0` tem de ser emitido, não omitido — é
   a mesma correção que pedi na AC9 da `87-10`.)*
3. **O aviso ao Marcos muda de texto**, e isso importa mais do que parece: *"27 podem cair **quando e
   se** voltarem a conversar"*, não *"27 vão cair"*. **Gritar fogo onde não há fogo queima o aviso
   para a próxima vez** — e a próxima vez, neste epic, vai ter fogo de verdade.

**E o benefício real do bloco B tem de ser dito:** o efeito imediato e visível a humano **não é o
score** — é o **painel**. `page.tsx:205` mostra hoje, para **45 leads**, a fala da própria Nicole no
campo *"Disponibilidade para visita"*. Apagar o dado apaga essa mentira **hoje**. A story vende o
bloco B pelo efeito que não acontece e trata o que acontece como Achado nº 3. **A justificativa estava
invertida.** Corrigido — o bloco **fica**, porque apagar 56 registros que a `87-4` já declarou por
escrito como *"a classe que não deve ser preservada"* é executar decisão ratificada, não decidir de
novo.

---

## 6. 🔴 A prioridade na fila: **eu estava errado em 10/08**

Foi-me pedido explicitamente para não validar a pressa de quem encaminhou. A pressa era **minha**.

Meu §9 de 10/08 pôs a `87-12` na posição 0 com quatro pernas. **Duas morreram** quando o @sm provou —
e eu reconferi — que a linha é de **31/03/2026**, commit inicial, 4 meses antes da `87-4`:

| perna do meu §9 | estado hoje |
|---|---|
| 1. *"pendurar num deles atrasa a correção de um defeito **vivo** em ≥3 dias"* | 🔴 **morta.** O defeito tem 4 meses e meio e o dano retrospectivo é **1 caso limítrofe em 14**. Três dias é ruído |
| 2. *"é **regressão** de uma story já em produção; precisa ser revertida sozinha"* | 🔴 **morta.** Não é regressão. `blame` `a5e29d70`, 31/03 |
| 3. *"superfície diferente — o corretor, não a Nicole"* | ✅ viva — **e justifica ser story separada, não ser primeira** |
| 4. *"disciplina de escopo estreito"* | ✅ viva — **idem** |

**As duas pernas que sobraram sustentam separação, nunca precedência.** E há um custo em mantê-la na
frente: cada posição da fila consome uma **janela de observação de 24 h**, e esta story tem, por
desenho declarado, **nada a observar** (AC8 nasce inconclusiva, `n = 0` esperado). Gastar a frente da
fila com a mudança que **não pode ser observada**, na frente da `87-11` — que pela minha própria
medição de 10/08 toca **51,3 % dos turnos** — é usar mal o recurso mais escasso da onda.

**Fila homologada, corrigida (E6):**

| ordem | passo | por quê aqui |
|---|---|---|
| 1 | `87-5 A` | como planejado |
| 2 | `87-5 B` | como planejado |
| 3 | `87-11` (`W1-6`) | fecha o despejo cru antes de existir chave nova para despejar |
| **4** | **`87-12` bloco A** | XS, isolada, com a rede de segurança mais forte da onda. **Antes da `87-10`** de propósito — ver abaixo |
| 5 | `87-10` (`W1-2c`) | com AC6 **e** AC6-b verdes |
| **6** | **`87-12` bloco B** | único passo com efeito em dado; precisa de aceite nominal do Marcos; zero interação com as outras |

**Por que o bloco A tem de vir antes da `87-10`, e este é o único argumento de ordem que sobrevive:**
a `87-10` passa a escrever `ofertas_do_sistema` e `afirmado_pela_nicole` **dentro** do `agenda_state`,
e `parseAgendaState` **copia os dois para o objeto devolvido**. Se o leitor for escrito **depois**, o
@dev estará adicionando um consumidor a um objeto que já contém campo marcado `WRITE-ONLY` — com
chance real de imprimir a fala da Nicole no resumo do corretor, que é **exatamente o veneno que este
epic existe para tirar**. Escrito antes, a restrição já está no código e na tabela de Fronteiras.
**A restrição da Fronteira é normativa e eu a ratifico.**

**A separação A/B da story é preservada:** sobram dois passos entre eles, bem mais que as 24 h
exigidas.

---

## 7. 🔴 O teto de valor, que ninguém tinha declarado (E5)

A story não pode ser vendida pelo dano medido — ela diz isso, e está certa. Mas ela também **não
declarava o quanto o conserto entrega**, e isso eu tive de escrever antes que alguém prometesse ao
Marcos que o campo "vai passar a informar". A citação só chega ao corretor na interseção de três
condições estreitas:

1. **Janela de 48 h.** O `agenda_state` tem TTL de 48 h e o `pipeline.ts:738-742` apaga o vencido
   antes do `finalData`. **Olhe a fixture da Rita, colada da produção:** `ancorado_em 15/08 12:20` ⇒
   `expira_em **17/08** 12:20`, com `data_absoluta = **18/08**`. **O estado vence antes do dia para o
   qual ele aponta.** Handoff em 17/08 à tarde ⇒ `"nao informado"` sobre uma visita que é amanhã.
2. **Antes de a visita ser agendada.** `writeAgendaState(cd, null)` (`:991`) e `clearPending()`
   (`:902`) apagam a chave quando o slot é autorizado. **No instante em que a agenda vira compromisso
   de verdade, o campo volta a `"nao informado"`** — e o resumo **não tem nenhuma outra linha sobre
   visita** (não menciona `appointments`; conferi a função inteira).
3. **E o handoff tem de disparar nessa janela** — 14 all-time, o mais recente em 04/08.

**Leitura honesta:** mesmo com a story em produção, `"nao informado"` seguirá sendo a saída na maioria
dos handoffs — e seguirá sendo a saída **correta** na maioria deles. O que se compra não é *"o campo
informa"*; é *"o campo deixa de ser constante e passa a **poder** informar, com procedência garantida,
quando houver o que informar"*. **É tese estrutural, é a única que a evidência sustenta, e com ela eu
concordo.** O que não se pode é prometer outra coisa.

*(Daí saiu o **Achado nº 5**: o resumo não mencionar `appointments` é buraco **maior** que o desta
story e de outra natureza — falta uma linha, não está errada a que existe. Vai para o `W1-2d`.)*

---

## 8. Checklist de validação (10 pontos)

| # | Critério | Veredito |
|---|---|---|
| 1 | Título claro e objetivo | ✅ |
| 2 | Descrição completa | ✅ **exemplar** — o §2, que enfraquece o próprio pedido do briefing e publica o número contrário, é o padrão que eu quero ver repetido |
| 3 | ACs testáveis | ✅ após E3/E4. AC2/AC3 são **executáveis de verdade**, com fixtures que conferi byte a byte contra produção. Os 4 vermelhos são mutações reais, não "rodar de novo" |
| 4 | Escopo IN/OUT | ✅ **exemplar** — §5 do Desenho lista **cinco** não-decisões por escrito |
| 5 | Dependências mapeadas | ✅ Fronteiras conferida; a restrição normativa sobre a `87-10` está certa e ratificada |
| 6 | Estimativa | ✅ XS (bloco A) / S (bloco B). Concordo com XS: 1 leitor, 1 `export`, testes |
| 7 | Valor de negócio | ✅ após **E5** — era o ponto fraco: valor prospectivo afirmado e nunca limitado |
| 8 | Riscos documentados | ✅ após **E4** — 7 riscos, bom trabalho, mas o Risco 2 tinha a probabilidade invertida |
| 9 | Definition of Done | ✅ forte |
| 10 | Alinhamento com o epic | ✅ **e corrige o epic**: o rótulo *"hotfix da W1-2b"* é factualmente falso e o pedido ao @pm está certo |
| — | Régua saturada / conte pega e erra | ✅ **fez, e é o melhor da story** — duas réguas contadas, duas reprovadas |
| — | Controle positivo obrigatório | ✅ AC3 tem positivo, negativo **e** anti-colinearidade |
| — | Piso `n < 5` ⇒ inconclusivo | ✅ **declarado três vezes** e a AC8 está fora do critério de aceite. **Confirmo que está fora mesmo** — a DoD só exige registrar o resultado *"inclusive se inconclusivo"* |
| — | Backfill por `id` nomeado | ✅ **56 `id`, conjunto a conjunto** |
| — | Rollback escrito, com dono | ✅ Marcos (D7), com a fronteira A/B explícita |

**10/10 → GO.** Promovida a `Ready`.

---

## 9. As emendas aplicadas por mim

| # | Emenda | Onde |
|---|---|---|
| **E1** | §5 do Context: a tabela classificava os mesmos dois valores de duas formas incompatíveis. Reescrita com as mensagens do banco; conclusão **mantida e reforçada** | Context §5 |
| **E2** | §2 do Context: crosstab **5/8/1**, não 6/7/1 (faltou o André). Direção inalterada, argumento mais forte | Context §2 |
| **E3** | AC3: a fixture negativa é da lead **Kharina** (104 ch), não do Luiz | AC3 |
| **E4** | 🔴 Risco 2 (**latente**, não "certa") + AC12 (`projecao_*` + `leads_reescritos: 0`) + DoD (texto do aviso ao Marcos) + o benefício real do bloco B (o painel, 45 leads) | Riscos, AC12, DoD |
| **E5** | 🔴 Teto de valor declarado: TTL de 48 h, limpeza ao agendar, raridade do handoff | Context §3 |
| **E6** | 🔴 **Story sai da posição 0.** Nova fila, com o motivo de o bloco A ficar antes da `87-10` | Cabeçalho, Ordem de deploy |
| — | Achados **nº 5** (resumo não menciona `appointments`) e **nº 6** (`leads` já descolada do score) | Achados |

---

## 10. O que fica pendente, e de quem

| item | dono | o quê |
|---|---|---|
| **Fila de deploy** | **@devops** | ordem corrigida (§6). A `87-12 A` é o **4º** passo, a `87-12 B` o **6º** |
| **Rótulo da `87-12` no mapa do epic** | **@pm** | *"hotfix da W1-2b"* é falso (`blame` 31/03). Texto sugerido no fim da story. **Não editei o epic** — validação paralela em curso |
| **`stories_planned` da `87-12`** | **@pm** | `'Não criada'` → **`Ready`** (não `Draft` — promovi hoje) |
| **`215` → `231`** nas Notas §10 e no `R-G` | **@pm** | maior prefixo local **e** em `origin/main` é 230 |
| **`NICOLE_LASTRO_DIARIO`** | **@pm** | o mapa diz 0 all-time; são **6** (10/08→15/08). **O número errado era meu**, do §10 de 10/08 |
| **Inventário de asserções colineares na suíte da Nicole** | **backlog / @pm** | §4. **Segundo caso da família** (o 1º foi a `87-13`). Dois não são régua, mas são padrão — no terceiro, vira story |
| **`W1-2d`** — inventário de consumidores do fato de agenda | **@pm** | herda os Achados **nº 3** (painel inerte + validador sem `origem`) e **nº 5** (resumo não menciona `appointments`) |
| **`87-0` no mapa** | **@qa / @devops** | `Ready` × mergeada (PR #377) — **aberta desde 10/08** |
| **`detect-appointment.ts:71`** | **backlog** | sinal morto desde antes da `87-4`; ligar = decisão nova. Mantido fora |

---

**Assinado:** @po (Pax) · 2026-08-15
*Medições de produção somente-leitura. A única mutação foi em `handoff.test.ts` (AC4), revertida e
conferida por `md5` (`f568e911e7e81e36230cc36dafea9430`); `git status` limpo em `packages/`.
Nenhum arquivo de epic foi tocado.*
