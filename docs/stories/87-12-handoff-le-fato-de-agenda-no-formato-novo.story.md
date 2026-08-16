# Story 87-12 — O resumo do corretor lê o fato de agenda no formato novo

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** `InReview (bloco A)`
*(bloco A implementado pelo @dev em 2026-08-16 — AC1–AC7 verdes com **15 mutações medidas**; AC8 é
janela de produção, pós-deploy. **Bloco B (T5–T7) segue não iniciado**, com o @data-engineer, depois
das ≥24 h.)*
*(rodada 2, @dev, 2026-08-16 — os quatro itens do gate `CONCERNS` fechados: contagem da M2 corrigida
e **todas** as outras remedidas (QA-1), Achado nº 7 recontado para **três** guardas órfãs com vermelho
próprio para a da âncora (QA-2/QA-3), **cinco** ponteiros de `pipeline.ts` corrigidos no docstring de
produção (QA-4) e a defesa do achatamento refeita sobre a população inteira. **Nenhuma linha de
comportamento mudou.**)*
*(promovida pelo @po em 2026-08-15 — GO com 6 emendas aplicadas; parecer em
`docs/qa/po-validation-87-12.md`)*
**Origem:** `docs/qa/po-validation-87-10-87-11.md` §9 e §13 (@po Pax, 10/08) — *"`87-12` | **@sm** | criar
o hotfix do `handoff.ts:138` (§9), com a variante da `citacao`"*.
**Item do roadmap:** **nenhum item `W` corresponde a esta story.** O mapa do epic a rotula como
*"hotfix da W1-2b (87-4)"* — e **esse rótulo está factualmente errado** (§1 do Context: a linha é de
31/03/2026, do commit inicial). ⏳ **Pedido ao @pm no fim do documento** — o @sm não edita o corpo do
epic.
**Criada por:** @sm (River) em 2026-08-15
**Formato:** **Subtração + troca de leitor.** Um campo do resumo deixa de ler uma chave morta e passa
a ler a chave viva. **Zero régua de conteúdo** — o critério é o tipo, não o texto (§3 do Desenho).
**Executor:** @dev (bloco A — código puro) · @data-engineer (bloco B — migration 231, dado de
produção) · validação em produção: @qa + Marcos (D7)
**Esforço:** **XS** (bloco A: 1 leitor + 1 import + testes) / **S** (bloco B: migration com 56 `id`
nomeados + backup + auditoria de score)
**Risco:** **Baixo de regressão** (bloco A não toca o caminho da resposta da Nicole) / **Médio de
efeito visível ao humano** (bloco B muda `qualification_status` de **27 leads** — número medido, e é
o mesmo que a `87-4` já publicou como consequência assumida)
**Deploy:** 🔴 **REPRIORIZADA pelo @po em 15/08 — sai da posição 0.** A fila passa a ser
`87-5 A` → `87-5 B` → `87-11` → **`87-12 bloco A`** → `87-10` → **`87-12 bloco B`**, ≥24 h entre cada.
**Emenda E6** — a posição 0 vinha do §9 do meu parecer de 10/08, e **duas das quatro pernas daquele
argumento morreram** quando o @sm provou que isto não é regressão (`blame` 31/03, reconferido por mim):
não há "defeito vivo de uma story em produção" a corrigir com pressa, e não há reversibilidade a
proteger. As duas pernas que sobrevivem (superfície diferente, escopo estreito) justificam a story ser
**separada** — nunca justificaram ser **primeira**. **Sem colisão de arquivo com nenhuma delas**
(§ Fronteiras). *Motivo de o bloco A ficar **antes** da `87-10`: ver Fronteiras — o leitor tem de
existir antes dos campos `WRITE-ONLY`, não depois.*

> ### O defeito, em uma linha
>
> ```ts
> // packages/ai/src/flows/handoff.ts:138
> lines.push(`- Disponibilidade para visita: ${formatBoolean(collectedData.visit_availability)}`)
>
> // packages/ai/src/flows/handoff.ts:160-164
> function formatBoolean(value: unknown): string {
>   if (value === true) return "sim"
>   if (value === false) return "nao"
>   return "nao informado"          // ← 100 % das vezes, desde 31/03/2026
> }
> ```
>
> `visit_availability` **nunca foi booleano em produção**: `jsonb_typeof` = `string` em **56 de 56**
> linhas. O `formatBoolean` só entende `true`/`false`. Todo o resto cai no `return` de baixo.
>
> **Prova all-time, e ela não deixa margem:** dos **14** resumos de handoff gravados em
> `leads.ai_summary`, **14 imprimem `Disponibilidade para visita: nao informado`**. `sim` = **0**.
> `nao` = **0**. O campo nunca disse outra coisa.

---

## ⚠️ Correção de registro, obrigatória: **isto NÃO é regressão da `87-4`**

O mapa do epic e o §9 do parecer do @po chamam esta story de *"hotfix da `W1-2b`"* e de *"regressão de
uma story já em produção"*. **A `87-4` não causou o defeito.** `git blame`, reconferido por mim em
15/08 contra `HEAD` `24800872`:

```
$ git log -1 --format='%h %ad %an %s' --date=short -L 138,138:packages/ai/src/flows/handoff.ts
a5e29d70 2026-03-31 Gabriel Reche feat: add AI flows, admin pages, broker detail, analytics
+  lines.push(`- Disponibilidade para visita: ${formatBoolean(collectedData.visit_availability)}`)

$ git blame -L 160,164 packages/ai/src/flows/handoff.ts
a5e29d709 (Gabriel Reche 2026-03-31 160) function formatBoolean(value: unknown): string {
```

A linha e o `formatBoolean` nasceram **juntos, no commit inicial do arquivo**, 4 meses e 4 dias antes
do deploy da `87-4` (08/08 18:48 UTC). O campo já era string quando a função foi escrita.

**O que a `87-4` fez foi outra coisa, e é o que dá urgência à story:** ela migrou o fato de agenda
para `agenda_state` e migrou **um** dos dois leitores humanos — o painel
(`packages/web/src/app/dashboard/leads/[id]/page.tsx:198-206`, com comentário explícito). O resumo do
corretor ficou para trás. Ou seja: a `87-4` não introduziu o defeito, **removeu a última chance de
ele se consertar sozinho** — a chave que o `handoff.ts` lê agora é apagada em todo turno vivo.

*(Este parágrafo existe porque eu mesmo classifiquei errado uma vez, e o @pm corrigiu com `blame`. O
registro fica certo aqui e o pedido de correção do mapa está no fim do documento.)*

---

## Story

**Como** corretor que recebe um lead das mãos da Nicole,
**Quero** ler no resumo o que o lead disse sobre quando pode visitar — nas palavras dele —,
**Para que** eu não precise abrir a conversa inteira para descobrir uma informação que o sistema
tinha na mão e jogou fora no exato instante em que me entregou o lead.

---

## Context

> **Todas as medições desta seção são minhas, contra produção (`dsopqkqjkmhytudaaolv`, Management
> API, somente `SELECT`), em 15/08/2026, contra `HEAD` `24800872`.** A consulta está ao lado de cada
> número. Onde a minha medição diverge do briefing, **as duas ficam publicadas com o método** — é a
> regra desta casa desde que 7 de 8 checagens numéricas divergiram na validação de 07/08.

### 1. O tipo do campo: 56 de 56 strings, zero booleanos

```sql
select count(*) filter (where collected_data ? 'visit_availability')                      com_va,
       count(*) filter (where jsonb_typeof(collected_data->'visit_availability')='string') va_string,
       count(*) filter (where jsonb_typeof(collected_data->'visit_availability')='boolean') va_bool,
       count(*) filter (where collected_data ? 'agenda_state')                             com_agenda_state,
       count(*)                                                                            total
from conversation_state;
--  com_va 56 · va_string 56 · va_bool 0 · com_agenda_state 2 · total 279
```

`formatBoolean` devolve `"nao informado"` para tudo que não é `true`/`false` literal. Com 0 booleanos,
o campo é uma constante.

### 2. 🔴 O dano medido é o oposto do que o briefing supõe — e a story fica MAIS forte assim

O briefing diz que valores reais *"existem no estado e são descartados no exato momento em que o
humano assume o lead"*. **Medi os 14 handoffs que de fato aconteceram, all-time**, cruzando
`leads.ai_summary` com o `conversation_state` da conversa:

```sql
select count(*) filter (where ai_summary like '%RESUMO DO LEAD (HANDOFF)%')                       handoff_fmt,
       count(*) filter (where ai_summary like '%Disponibilidade para visita: nao informado%')     nao_informado,
       count(*) filter (where ai_summary like '%Disponibilidade para visita: sim%')               sim
from leads;
--  handoff_fmt 14 · nao_informado 14 · sim 0
```

| o que o lead tinha no estado, no momento do handoff | leads (@sm) | **leads (@po, remedido)** | o que "nao informado" custou |
|---|---|---|---|
| **nada** (`visit_availability` ausente) | 6 | **5** | nada — a saída estava correta |
| **fala da própria Nicole** gravada como disponibilidade | 7 | **8** | **nada — o bug protegeu o corretor** |
| disponibilidade real do lead | 1 (Samila) | **1** (Samila, *"Amanhã e possível?"*) | uma linha, e ela é limítrofe (pergunta, não afirmação) |

> **EMENDA E2 (@po, 15/08) — divergência de uma unidade, publicada com o método.** Refiz o join
> (`leads.ai_summary` → `conversations` → `conversation_state`) e obtive **5 / 8 / 1**, não 6 / 7 / 1.
> O lead que o @sm classificou como "nada" e que na verdade tem conteúdo é o **André** (184 ch,
> *"Que bom! Acho que vale muito a pena você vir conhecer o decorado…"*, `casa_nicole = true`). As 14
> linhas fecham nos dois casos. **A direção não muda e o argumento fica mais forte:** dos casos COM
> conteúdo, é **8 de 9** (89 %) que são fala da Nicole, não 7 de 8. O `"nao informado"` foi
> acidentalmente a saída certa em **13 dos 14** handoffs.

As sete falas da Nicole, coladas do banco (`left(valor, 90)`):

```
Letícia       "Faz todo sentido, Letícia! Enquanto isso, posso ir te passando as informações do Vind pra…"
Silvio        "As opções variam conforme o andar e a posição da unidade, e o corretor consegue montar alg…"
Amelia        "Anotado! Vista interna costuma ser mais tranquila e silenciosa.\n\nQue tal vir conhecer o de…"
Lindamir      "O endereço da obra é Rua José Pereira da Costa, 547, Jardim Novo Horizonte, Maringá-PR.\n\nQ…"
Kelly Vieira  "Com certeza, andar alto tem suas vantagens — vista, privacidade e também tende a valorizar…"
Ana Maria     "Perfeito! O Vind tem 1 vaga de garagem coberta incluída, então já está alinhado com o que…"
Alvaro Natã   "Perfeito! O Vind tem 1 vaga coberta inclusa, então está certinho para você.\n\nQue tal agend…"
```

> **A leitura honesta, e ela corta nos dois sentidos.** O prejuízo **retrospectivo** desta linha é
> **1 caso limítrofe em 14**. Em 7 dos 14 o `"nao informado"` foi, por acidente, a saída certa:
> imprimir o conteúdo teria mandado ao corretor a fala da própria Nicole como se fosse a agenda do
> lead. **Um conserto ingênuo — "imprima o que está lá" — teria transformado um campo inútil num
> campo mentiroso em 7 de 8 casos com conteúdo.** É por isso que o desenho do §3 não imprime o
> legado.
>
> **E é por isso que a story sobe mesmo assim.** O argumento não é retrospectivo, é **prospectivo e
> estrutural**: a partir da `87-4`, todo fato de agenda nasce em `agenda_state` — e o `handoff.ts`
> **não lê `agenda_state` em lugar nenhum**. Hoje o campo é uma constante inútil; a partir de agora
> ele é uma constante inútil **sobre um dado que existe, é confiável e tem procedência garantida**.
> A `87-4` comprou a citação; o corretor não a recebe.
>
> **Piso de amostra declarado:** `n = 14` para a população "handoff aconteceu"; `n = 1` para a
> sub-população "disponibilidade real foi perdida". **`n < 5` ⇒ INCONCLUSIVO** — esta story **não**
> pode ser vendida pelo dano medido. Ela se justifica pelo defeito estrutural, que é determinístico
> e não depende de amostra.

### 3. O formato novo existe, está vivo, e são só dois registros — o que limita a prova

```sql
select l.name, cs.updated_at, jsonb_pretty(cs.collected_data->'agenda_state')
from conversation_state cs
  left join conversations c on c.id = cs.conversation_id
  left join leads l on l.id = c.lead_id
where cs.collected_data ? 'agenda_state' order by cs.updated_at desc;
```

| lead | `updated_at` | `citacao` | `data_absoluta` | `hora`/`minuto` | `expira_em` |
|---|---|---|---|---|---|
| **Rita** | 2026-08-15 12:31 | `"Terça"` | `2026-08-18` | `null` / `null` | 2026-08-17 (**vigente**) |
| **Ronaldo** | 2026-08-10 00:30 | `"3ª feira às 17:30"` | `null` | `17` / `30` | 2026-08-12 (**vencido**) |

Os dois são `origem: "lead"`, `fonte: "pendencia"`. **`n = 2` ⇒ abaixo do piso.** A prova desta story
**não pode** ser uma consulta de produção sobre o formato novo — tem que ser fixture sobre string
real (AC2/AC3), e a janela de observação (AC8) nasce declaradamente inconclusiva.

**Os dois são complementares e por isso viram o par-ouro:** a Rita tem dia e não tem hora; o Ronaldo
tem hora e não tem dia. Um cobre cada ramo da formatação.

> 🔴 **EMENDA E5 (@po, 15/08) — o TETO DE VALOR desta story, que ninguém declarou. Ele não a
> derruba, mas tem de estar escrito antes de alguém prometer o contrário ao Marcos.**
>
> A citação só chega ao corretor na **interseção de três condições**, e as três são estreitas:
>
> 1. **Janela de 48 h.** O `agenda_state` tem TTL de 48 h e o `pipeline.ts:738-742` **apaga o
>    vencido** antes de o `finalData` nascer. Repare na fixture da Rita, colada acima:
>    `ancorado_em 15/08 12:20` ⇒ `expira_em **17/08** 12:20`, mas `data_absoluta = **18/08**`. **O
>    estado vence ANTES do dia para o qual ele aponta.** Se o handoff dela disparar em 17/08 à tarde,
>    o corretor lê `"nao informado"` — sobre uma visita que é no dia seguinte.
> 2. **Antes de a visita ser agendada.** `writeAgendaState(cd, null)` (`pipeline.ts:991`) e
>    `clearPending()` (`:902`) **apagam a chave inteira** quando o slot é autorizado. Ou seja: no
>    momento em que a agenda vira compromisso de verdade, o campo volta a `"nao informado"` — e o
>    resumo do corretor **não tem nenhuma outra linha sobre visita**. Coerente com o desenho (visita
>    marcada mora em `appointments`), mas o corretor não fica sabendo por aqui.
> 3. **E o handoff tem de disparar nessa janela.** 14 all-time, o mais recente em 04/08.
>
> **Consequência honesta:** mesmo com esta story em produção, `"nao informado"` continuará sendo a
> saída **na maioria dos handoffs** — e continuará sendo a saída **correta** na maioria deles. O que a
> story compra não é "o campo passa a informar"; é **"o campo para de ser uma constante e passa a
> poder informar, com procedência garantida, quando houver o que informar"**. É uma tese estrutural,
> e é a única que a evidência sustenta. **Ninguém deve prometer ao Marcos que o campo vai passar a
> ter conteúdo** — a AC8 já nasce inconclusiva por desenho, e este é o motivo de fundo.
>
> *(Isto reforça o corte do §5 do Desenho: o resumo não mencionar `appointments` é um buraco **maior**
> que o desta story, e é candidato ao `W1-2d`. Registrado como Achado nº 5.)*

### 4. 🔴 O escritor já está estancado — isto é resíduo, não sangramento. **Reconferido.**

```sql
select count(*) atualizados_7d,
       count(*) filter (where collected_data ? 'visit_availability') com_va,
       count(*) filter (where collected_data ? 'agenda_state')       com_agenda_state
from conversation_state where updated_at >= now() - interval '7 days';
--  atualizados_7d 37 · com_va 0 · com_agenda_state 2
```

Confirmado: **37 estados tocados nos últimos 7 dias, ZERO com a chave legada.** E o escritor está
morto no **código**, não só no dado — `grep` por `visit_availability` em `packages/` devolve
**leitores, constantes e comentários históricos, e nenhuma atribuição**. O único escritor de fato de
agenda hoje é `buildAgendaState` (`agenda-state.ts:137`), atrás de `origem: "lead"`.

> **Divergência de medição, registrada com o método.** O briefing diz *"o mais recente contaminado é
> de **05/08**"*. Eu medi `max(updated_at)` **06/08 19:00:22 UTC** entre as 56 linhas com a chave.
> **Ressalva que é do meu próprio número:** `updated_at` é da **linha inteira**, não do campo — ele é
> um teto para "quando a chave foi escrita", não a data da escrita. A direção não é ambígua nos dois
> casos: **o escritor parou antes da `87-4` subir.**

### 5. 🔴 O que o briefing chama de "79 % de contaminação" depende da régua — e as duas réguas erram

Antes de propor qualquer critério, a disciplina desta casa manda **contar quantas linhas ele pega e
quantas ele erra**. Fiz isso com as duas réguas plausíveis, sobre as mesmas 56 linhas.

**Régua 1 — comprimento (`length > 60`), que é a do briefing:**

```sql
select count(*) filter (where length(collected_data->>'visit_availability') > 60)  maior60,
       count(*) filter (where length(collected_data->>'visit_availability') <= 60) menor_igual60,
       min(length(...)) , max(length(...)),
       percentile_cont(0.5) within group (order by length(...)) mediana
from conversation_state where jsonb_typeof(collected_data->'visit_availability')='string';
--  maior60 44 · menor_igual60 12 · min 13 · max 1981 · mediana 209,5
```

**Régua 2 — procedência estrutural** (*o valor aparece literalmente numa mensagem `role='assistant'`
da mesma conversa?*):

```sql
exists (select 1 from messages m
         where m.conversation_id = cs.conversation_id
           and m.role='assistant' and m.content like '%'||valor||'%')
--  casa com fala da Nicole ..... 45
--  casa com fala do lead ....... 3
--  não casa com nada ........... 8
```

| | pega | erra, e como |
|---|---|---|
| **Régua 1** (`> 60`) | 44 | **1 falso positivo**: o desabafo de 1.981 caracteres da **Ivone**, que é fala do LEAD. **2 falsos negativos**: `"quinta-feira às 10h"` (Valnira, 19 ch) e `"segunda-feira, 3 de agosto às 16h"` (Marlene, 33 ch) passam batido |
| **Régua 2** (procedência) | 45 | pega os dois que a Régua 1 deixa passar — e **é aí que as duas réguas se cruzam e as duas erram**, cada uma para um lado. Ver a emenda E1 abaixo |

> 🔴 **EMENDA E1 (@po, 15/08) — a tabela recebida classificava os MESMOS dois valores de duas
> maneiras incompatíveis, e eu fui ao banco.** A célula da Régua 1 os chamava de *"saudações da
> Nicole"*; a da Régua 2 os chamava de *"disponibilidade real"*. **Não podem ser as duas coisas** — se
> são fala da Nicole, a Régua 2 acerta; se são disponibilidade real, a Régua 1 acerta. Os números
> (44/12 e 45/3/8) eu **reproduzi e confirmo**; a classificação é que estava errada. O que as
> mensagens mostram:
>
> | | o que está gravado | o que o LEAD de fato disse | veredito honesto |
> |---|---|---|---|
> | **Valnira** | `"quinta-feira às 10h"` — texto de **confirmação da Nicole** (*"a quinta-feira às 10h está confirmada para você!"*) | **`"Na quinta as 10"`** — disse, sim, com outras palavras | fato **real**, string **da Nicole**. A Régua 2 apaga um fato verdadeiro |
> | **Marlene** | `"segunda-feira, 3 de agosto às 16h"` — texto de **confirmação da Nicole** (*"Sua visita está marcada para…"*) | **`"Ok!"`** — nunca enunciou dia nem hora | a Régua 2 **acerta**: não é fala dela. Mas o fato existe — e é uma **visita marcada**, que mora em `appointments` |
>
> **Nenhum dos dois casa com `role='user'`** (`casa_lead = false` nos dois; medido). Ou seja: **a
> string legada não é a fala do lead nem quando o fato é verdadeiro** — é a Nicole normalizando o que
> ele disse, ou confirmando algo que ele nunca disse.
>
> **E isto não enfraquece a conclusão do @sm: torna-a inescapável.** A procedência não é recuperável
> da string por régua nenhuma, porque **a string quase nunca é do lead** — nem nos casos em que o fato
> é real. É exatamente por isso que a `87-4` moveu a procedência para o **tipo** (`origem: "lead"` +
> `citacao` literal de `role='user'`). **Duas réguas contadas, duas reprovadas, conclusão mantida e
> reforçada.**
>
> **Conclusão normativa, e ela responde à pergunta que o briefing fez explicitamente:** distinguir
> *"disponibilidade real"* de *"fala da Nicole"* **dentro da string legada** exige, sim, régua de
> conteúdo — e nenhuma das duas candidatas sobrevive à contagem. Esta casa já viu três réguas de
> conteúdo apodrecerem e o @po recusou uma na `87-13` por poder discriminante zero. **Esta story não
> propõe nenhuma.** O §3 do Desenho mostra que ela **não precisa** de nenhuma, e o §2 do Desenho
> mostra que o bloco B também não.

### 6. Por onde o resíduo ainda machuca hoje — e por onde não machuca

Rastreei os três leitores vivos das 56 linhas:

| # | leitor | efeito hoje | esta story |
|---|---|---|---|
| 1 | `flows/handoff.ts:138` — resumo do corretor | **nenhum.** `stripLegacyAgendaKeys` roda em `pipeline.ts:760`, **antes** de o `finalData` nascer em `:1223` e de o resumo ser montado em `:1251`. A chave legada **não chega à função no caminho vivo** | bloco A |
| 2 | `dashboard/leads/[id]/page.tsx:205` — painel do lead | **LIVE.** O fallback `cd("visit_availability")` mostra a fala da Nicole como *"Disponibilidade para visita"* para 45 leads, hoje | ⛔ **fora de escopo** — outro arquivo, outra superfície. Vira Achado nº 3 |
| 3 | `flows/qualification.ts:50` → `hasAgendaFact` | **LIVE.** As 56 linhas valem **20 pontos** de score cada, e ~27 delas sustentam um `qualification_status = qualified` | bloco B |

**A `87-4` decidiu que essas 56 morreriam sozinhas** — o docstring é literal: *"elas são APAGADAS no
primeiro turno em que a conversa for tocada"*. **Medido 7 dias depois do deploy dela:**

```sql
select event_type, count(*), min(created_at), max(created_at)
from system_events where event_type like 'NICOLE%' group by 1 order by 2 desc;
--  NICOLE_HISTORY_TRUNCATED ............... 6   (14/08 → 15/08)
--  NICOLE_LASTRO_DIARIO ................... 6   (10/08 → 15/08)
--  NICOLE_SLOT_UNAUTHORIZED ............... 2   (10/08)
--  NICOLE_AFIRMACAO_SEM_LASTRO ............ 1   (10/08)
--  NICOLE_AGENDA_STATE_EXPIRADO ........... 1   (13/08)
--  NICOLE_AGENDA_STATE_LEGADO_DESCARTADO .. AUSENTE (0 all-time)
```

**Zero.** O mecanismo de auto-cura da `87-4` **não alcança esta população**: são conversas dormentes
(a mais antiga é de 13/06; a mais recente parou em 06/08). O evento que a AC8 da `87-4` usava como
prova de decaimento nunca disparou uma vez. **O bloco B é a metade da `87-4` que não aconteceu**, não
uma decisão nova.

*(De quebra: o `NICOLE_LASTRO_DIARIO = 0 all-time` do parecer do @po de 10/08 **está desatualizado** —
o cron da `87-3` executou 6 vezes desde 10/08. Anotado para o mapa.)*

---

## Desenho

### 1. Bloco A — o leitor troca de chave. Duas ramificações, ambas estruturais.

```ts
// packages/ai/src/flows/handoff.ts
import { AGENDA_STATE_KEY, parseAgendaState } from "./agenda-state"

-  lines.push(`- Disponibilidade para visita: ${formatBoolean(collectedData.visit_availability)}`)
+  lines.push(`- Disponibilidade para visita: ${formatDisponibilidade(collectedData)}`)

+ /**
+  * Story 87-12 — o corretor lê a CITAÇÃO do lead, não um booleano que nunca existiu.
+  *
+  * A regra de admissão é a MESMA do gate de qualificação e do painel: `parseAgendaState`.
+  * Não há régua de conteúdo aqui, e não pode haver — quem garante que isto é fala do lead
+  * é o TIPO (`origem: "lead"` + `citacao` literal de mensagem `role='user'`, Story 87-4),
+  * não o texto.
+  *
+  * O rótulo "nao e visita marcada" é obrigatório: visita marcada mora em `appointments`.
+  * O caso Ronaldo (10/08) é a prova — o sistema RECUSOU o 17:30 daquele turno, e a citação
+  * continua sendo o que o lead disse.
+  */
+ function formatDisponibilidade(collectedData: Record<string, unknown>): string {
+   const st = parseAgendaState(collectedData[AGENDA_STATE_KEY])
+   if (!st) return "nao informado"
+   const dia = st.data_absoluta ? ` (dia ${st.data_absoluta})` : ""
+   return `"${st.citacao}"${dia} - nas palavras do lead, nao e visita marcada`
+ }
```

Exige **exportar `parseAgendaState`** (`agenda-state.ts:178`, hoje `function` sem `export`) —
**uma palavra**. É a escolha certa contra as alternativas:

| alternativa | por que não |
|---|---|
| copiar o formato inline do painel (`page.tsx:198-206`) | o painel **não confere `origem === 'lead'`** — é um validador mais fraco. Copiá-lo cria **dois** leitores divergentes do mesmo objeto, que é a doença que a `87-0` existe para não repetir |
| usar `readAgendaState(cd, now)` (aplica TTL) | exigiria um parâmetro `now` novo em `generateHandoffSummary`, quebrando **3** chamadores, e **seria redundante**: `pipeline.ts:738-741` já **apaga** o estado vencido do `collectedData` antes de o `finalData` nascer. Um `if` de TTL aqui é caminho de decisão duplicado, não proteção |
| escrever um parser próprio | **CREATE onde ADAPT resolve.** É como nascem duas verdades sobre o mesmo campo |

**A assinatura de `generateHandoffSummary` NÃO muda.** Consequência conferida: `config-surfaces.test.ts:122`
a chama com `{ name: "Fulano" }` e fica com **0 linhas de diff**.

### 2. 🔴 O legado deixa de ser lido — e é isto que dispensa a heurística

`collectedData.visit_availability` **sai da função e não volta com fallback**. Três razões, em ordem
de peso:

1. **Ele não chega.** `stripLegacyAgendaKeys` (`pipeline.ts:760`) é incondicional e roda 491 linhas
   antes de `generateHandoffSummary` (`:1251`), dentro do mesmo `processMessageWithMetadata`
   (`:481-1642`). Conferido lendo o fluxo `collectedData → updatedData (:1202) → aiExtracted (:1222)
   → finalData (:1223) → :1251`.
2. **Se chegasse, imprimi-lo seria pior que o defeito atual** — §2 do Context: 7 dos 8 valores com
   conteúdo nos handoffs reais são fala da Nicole.
3. **Filtrá-lo exigiria a régua reprovada no §5 do Context.** Não existe critério estrutural honesto
   dentro da string legada: ela não carrega procedência, e é *exatamente por isso* que a `87-4` criou
   um objeto tipado para substituí-la.

> **Modo de falha resultante, declarado:** se a chave legada reaparecer por um caminho não previsto,
> a saída é `"nao informado"` — **silêncio**, não afirmação falsa. É o mesmo lado do erro que a
> `87-13` escolheu: *numa onda cuja tese é subtrair mentira, silêncio é o lado certo.*

### 3. A pergunta que o briefing fez, respondida com o critério na mão

> *"Se distinguir 'disponibilidade real' de 'fala da Nicole' exige heurística de conteúdo, diga isso."*

**Exige — dentro da string legada. E esta story não precisa fazer essa distinção em lugar nenhum.**

O critério estrutural existe, é honesto, e **já foi comprado e validado pela `87-4`**: o objeto
`agenda_state` só nasce de `buildAgendaState`, e o ramo inteiro que o chama está atrás de
`if (opts?.origem === "lead" && …)` (`qualification.ts:321`, escrita em `:356`); e `parseAgendaState`
**rejeita** qualquer objeto sem `citacao` não-vazia ou com `origem` diferente de `"lead"`
(`agenda-state.ts:181-182`). A procedência está **no tipo**, não no texto.

**Onde a heurística seria necessária — a string legada — a story escolhe não olhar** (§2 acima, bloco
A) **e não classificar** (§4 abaixo, bloco B). **Zero réguas novas nesta story.**

### 4. Bloco B — a limpeza do resíduo, sem classificar uma linha sequer

**A regra que executa já está escrita, e é da `87-4`:** *"esta story NÃO migra o conteúdo delas: os 56
registros residuais são exatamente a classe que não deve ser preservada."* O bloco B **não decide
nada** — ele aplica essa regra à população que o runtime da `87-4` não alcança (§6 do Context:
`NICOLE_AGENDA_STATE_LEGADO_DESCARTADO = 0` all-time).

**Apagar as 4 chaves legadas das 56 linhas nomeadas. Sem critério, sem exceção, sem triagem.** Isto é
o que torna o bloco B imune ao §5: não há régua porque não há classificação.

**O custo, medido — e ele reconcilia com um número que a `87-4` já publicou.** Reproduzi o
`calculateQualificationScore` em SQL sobre os 8 campos de peso, com e sem os 20 pontos de agenda:

```
leads que perdem os 20 pontos ................................... 56
… que caem de `qualified` (>= 70) para `in_progress` ............ 27
… que caem de `warm` (>= 40) para `cold` ........................ 10
```

> 🔴 **`27` é exatamente o número que a `87-4` escreveu em `pipeline.ts:751-757`** — *"27 leads
> `qualified` estão na faixa 70–89 e caem para `in_progress`"*. **Duas medições independentes, com 8
> dias de distância, no mesmo número.** Isso não é coincidência: é a consequência que a `87-4`
> assumiu por escrito e que só não aconteceu porque as conversas estão dormentes. O bloco B **não
> cria** esse custo — ele o **cobra**, de uma vez e com auditoria, em vez de deixá-lo espalhado por
> turnos aleatórios ao longo dos próximos meses.

**Por `id` NOMEADO, nunca por fórmula.** `where collected_data ? 'visit_availability'` na migration
recria o defeito no próximo caso: no dia em que alguém reintroduzir a chave, a migration retroativa
apagaria o registro novo em silêncio. Os **56 `id`** são congelados na revisão e colados literalmente
no arquivo. A consulta que os produz:

```sql
select string_agg(quote_literal(id::text), ', ' order by id), count(*)
from conversation_state
where collected_data ?| array['visit_availability','visit_pending_date',
                              'visit_pending_hour','visit_pending_minute'];
--  count 56   (visit_availability 56 · visit_pending_date 9 · hour 0 · minute 0)
```

*(Os 56 `id` medidos em 15/08 estão colados na Tarefa T5 — o @dev **reconfere** antes de aplicar,
porque `56` é um teto que só pode diminuir: qualquer conversa tocada entre hoje e a aplicação já terá
sido limpa pelo `pipeline.ts:760`.)*

### 5. O que esta story NÃO faz, e por decisão escrita

| item | decisão | por quê |
|---|---|---|
| `dashboard/leads/[id]/page.tsx:205` — fallback legado do painel | **não tocar** | superfície diferente (é o painel, não o resumo), arquivo diferente, e depois do bloco B o fallback fica **inerte** — não há mais nada para ele ler. Remover código morto é higiene, não hotfix. **Achado nº 3** |
| `flows/detect-appointment.ts:71` — `visit_availability === true` sobre campo que sempre foi string | **não tocar** | sinal morto desde antes da `87-4`. Consertá-lo **liga um sinal que nunca esteve ligado** = caminho de decisão novo. Já registrado pelo @po (§13) como backlog. Depois do bloco B ele fica duplamente morto |
| `formatBoolean` | **fica** | continua correto e em uso por `has_down_payment`, que é **booleano de verdade em 14 de 14 linhas** (medido). Removê-lo seria diff sem efeito |
| `packages/shared/src/constants/lead-fields.ts:23` — rótulo `visit_availability` no cadastro manual | **não tocar** | é campo editado por humano na tela de lead, com semântica própria. Fora do fluxo da Nicole |
| a realimentação `ai_summary → prompt` | **não tocar** | ver Risco 3 |

---

## Ordem de deploy — dois passos, e a ordem importa

| # | passo | quem | rollback nesta etapa |
|---|---|---|---|
| **1** | **Bloco A** — código (`handoff.ts` + `export` em `agenda-state.ts` + testes) | @dev → @devops | **reverter o PR, e só** |
| **2** | **Janela de observação de 24 h** | @qa + Marcos (D7) | idem |
| **3** | **Bloco B** — migration 231 (backup + delete das 4 chaves nas 56 linhas nomeadas + auditoria de score) | @data-engineer | **restaurar do backup** (a migration grava o `collected_data` inteiro das 56 linhas antes de tocar) |

> 🔴 **EMENDA E6 (@po, 15/08) — a story sai da posição 0 da fila.** A ordem homologada passa a ser
> `87-5 A` → `87-5 B` → `87-11` → **`87-12 bloco A`** → `87-10` → **`87-12 bloco B`**. O bloco B vai
> para o **fim da onda**: é o único passo com efeito em dado, é o único que precisa de aceite nominal
> do Marcos, e não tem interação com nenhuma das outras. Isso **preserva** a regra dos ≥24 h entre A
> e B desta story (sobram dois passos entre eles). O bloco A fica **antes da `87-10`** de propósito —
> ver Fronteiras.

**Por que o bloco B vem depois, e não junto:** nas primeiras 24 h o rollback é *reverter o PR*, sem
tocar em dado nenhum. Depois da 231, um rollback de código não desfaz a queda de score de 27 leads —
por isso a instrução de restaurar o backup fica escrita no critério de rollback. Um passo de ordem
que custa 24 h e compra um rollback limpo. **É o mesmo padrão da `87-13`** (código → janela → dado).

**Por que o bloco A não pode vir depois do B:** irrelevante para a Nicole, mas relevante para o
corretor — com o B aplicado e o A não, os 56 leads perdem os 20 pontos **e** o resumo continua
imprimindo `"nao informado"`. Custo sem benefício por 24 h.

**Migration:** o maior prefixo local em 15/08 é **230** (`230_f4_rpcs_views_unificacao.sql`) ⇒ o bloco
B usa **231**. ⚠️ Três stories já colidiram neste ponto no epic — o **@devops reconfere e renumera na
abertura do PR**, registrando a razão no cabeçalho. *(O `R-G` do epic ainda diz `215` e a nota do §10
também; ambos desatualizados — ver pedido ao @pm.)*
Aplicar **arquivo inteiro num único POST** pela Management API (`db push` proibido; runbook
`docs/runbooks/aplicar-209-210.md`).

---

## Acceptance Criteria

> Todo vermelho é **colado — saída bruta do reporter — com a FORMA DA MUTAÇÃO escrita ao lado do
> número.** `npx vitest run` da **RAIZ**, na **suíte inteira**, nunca `--reporter=basic`, nunca só no
> arquivo do módulo. *(Nota `P1` do gate da 87-8, `C4` do gate da 87-7.)*
>
> **E antes de declarar que um teste prova algo: remova o que ele diz provar e veja se cai.** Toda AC
> com 🔴 traz a mutação exigida; nenhuma vale sem ela.

### Bloco A

**AC1 — 🔴 A chave morta some do arquivo, e o `grep` é a lista de tarefas.**
```
grep -n "visit_availability" packages/ai/src/flows/handoff.ts   ⇒  0 linhas
grep -n "agenda_state\|parseAgendaState" packages/ai/src/flows/handoff.ts  ⇒  >= 1 linha
```
- (i) `parseAgendaState` passa a ser exportado de `agenda-state.ts` — **e é o mesmo símbolo** que
  `readAgendaState` e `hasAgendaFact` já usam internamente (nada é duplicado);
- (ii) `formatBoolean` **continua existindo** e continua servindo `has_down_payment`.

**AC2 — 🔴 O par-ouro: os DOIS estados reais de produção, byte a byte.**
As duas fixtures são as do §3 do Context, coladas do banco em 15/08. **Asserção sobre a linha
montada, não sobre um booleano** — o `generateHandoffSummary` é função pura de montagem de texto, e é
por isso que esta story tem prova de verdade onde três stories seguidas registraram *"não
verificável"*.

- (i) **Rita** (dia sem hora) — `citacao: "Terça"`, `data_absoluta: "2026-08-18"` ⇒ a linha contém
  `Terça` **e** `(dia 2026-08-18)` **e** `nao e visita marcada`;
- (ii) **Ronaldo** (hora sem dia) — `citacao: "3ª feira às 17:30"`, `data_absoluta: null` ⇒ a linha
  contém `3ª feira às 17:30`, **NÃO** contém `(dia `, e contém `nao e visita marcada`;
- (iii) **vermelho:** trocar `st.data_absoluta ? … : ""` por `""` fixo ⇒ **(i) cai e (ii) NÃO cai.**
  Colar as duas saídas. *(Sem este assimétrico, um bug no ramo do dia passaria escondido atrás do
  caso que não tem dia.)*

**AC3 — 🔴 CONTROLE POSITIVO E NEGATIVO NO MESMO TESTE. Nenhum dos dois vale sozinho.**

| direção | fixture | asserção |
|---|---|---|
| **positivo** — disponibilidade real **APARECE** | `agenda_state` da Rita | a linha **contém** `Terça` |
| **negativo** — fala da Nicole **NÃO aparece** | `{ visit_availability: "Ótimo! Qual o melhor dia pra você vir conhecer o decorado — durante a semana ou prefere sábado de manhã?" }` — **104 caracteres, colada do banco, lead `Kharina`** (🔴 **emenda E3**: a string é real e está em produção byte a byte, mas **não é do Luiz**. O `Luiz` que aparece entre os 14 handoffs **não tem `visit_availability` nenhum**; o `Luiz Oliveira` tem uma variante de **110** ch, com `", Luiz!"`. Citar a lead errada faria o @dev/@qa procurar a fixture onde ela não está) | a linha é **exatamente** `- Disponibilidade para visita: nao informado` |
| **anti-colinearidade** 🔴 | **os DOIS campos no mesmo objeto**: `agenda_state` da Rita **+** `visit_availability` da fala do Luiz | a linha contém `Terça` e **NÃO** contém `decorado` |

- (iv) **vermelho:** reintroduzir o fallback `?? formatBoolean(collectedData.visit_availability)` ⇒
  **a fixture anti-colinearidade e a negativa caem juntas.** Colar.

> 🔴 **Por que a terceira linha da tabela é obrigatória.** Em produção os dois campos **nunca
> coexistem** — o `pipeline.ts:760` apaga um antes de o outro ser lido. Uma fixture montada a partir
> do estado de hoje seria **colinear**: um leitor que ignorasse `agenda_state` e outro que ignorasse
> `visit_availability` passariam nos mesmos testes. Foi exatamente isso que aconteceu na `87-13` (a
> suíte deu 7/7 com a linha do filtro removida). O caso impossível é o único que separa os dois
> leitores.

**AC4 — 🔴 A fixture colinear que escondeu o defeito por 4 meses é desfeita.**
`handoff.test.ts:158-190` passa hoje `has_down_payment: true` **e** `visit_availability: true` e
afirma um único `expect(summary).toContain("sim")`. **Os dois produzem `"sim"`** — remova qualquer um
e o teste continua verde. Pior: `visit_availability: true` é um valor que **produção nunca produziu**
(56/56 strings). *Este é o motivo mecânico de o defeito ter sobrevivido desde 31/03.*

- (i) o `toContain("sim")` genérico vira `toContain("Entrada disponivel: sim")` — asserção ancorada
  no rótulo, não no valor solto;
- (ii) `visit_availability: true` **sai** da fixture (o campo não existe mais no leitor);
- (iii) **vermelho:** com a asserção antiga, remover `has_down_payment` da fixture ⇒ o teste
  **continua verde**. Colar a saída — é a demonstração da colinearidade, e ela vai no PR.

**AC5 — Não-regressão do resto do resumo.**
As outras 6 linhas de `INTERESSE:`, o bloco `MENSAGENS DO LEAD:`, o limite de 5 mensagens, o
truncamento em 200 caracteres e o `TOTAL DE MENSAGENS:` ficam **byte a byte** iguais. O teste de
`pipeline-historico-cauda.test.ts:562-600` (*"`generateHandoffSummary` não regride de formato"*, da
`87-8`) fica **verde sem edição** — se ele precisar de edição, é sinal de que o diff vazou.

> ✅ **Conferido por mim em 15/08, e é a rede de segurança mais forte desta story.** Aquele teste
> compara o resumo inteiro com `toBe(...)` sobre um literal de 23 linhas, capturado do `HEAD`, que
> inclui `"- Disponibilidade para visita: nao informado"`. A fixture é `collectedData: { name: "Ana" }`
> — **sem `agenda_state`** —, então o ramo `if (!st) return "nao informado"` a mantém idêntica. Um
> diff que vaze para qualquer outra linha do resumo **cai ali, byte a byte, sem que o @dev precise
> escrever nada.**

**AC6 — O score de qualificação NÃO muda no bloco A.**
`calculateQualificationScore` continua respondendo por `hasAgendaFact` e **nada nesta AC toca
`qualification.ts`**. Fixture com `agenda_state` válido ⇒ score idêntico antes e depois do diff.
*(É a separação que garante que o efeito de score é 100 % do bloco B, e portanto revertível pelo
backup.)*

**AC7 — Suíte, tipos e árvore.**
`npx vitest run` da raiz, suíte inteira, verde. `npx tsc --noEmit` em `packages/ai` = **0 erros**
(baseline em `HEAD` conferido = 0). Sem import circular: `handoff → agenda-state → (só tipo)
visit-slot`.

**AC8 — Janela de observação em produção, e o que ela NÃO mede.**
24 h após o deploy do bloco A:
```sql
select count(*) filter (where ai_summary like '%Disponibilidade para visita: nao informado%') nao_informado,
       count(*) filter (where ai_summary like '%nas palavras do lead%')                       com_citacao
from leads where ai_summary like '%RESUMO DO LEAD (HANDOFF)%';
--  baseline 15/08:  nao_informado 14 · com_citacao 0
```
> ⚠️ **Esta AC nasce declaradamente INCONCLUSIVA e não é critério de aceite.** Handoffs são raros:
> **14 all-time**, o mais recente em **04/08** — nenhum em 11 dias. `n = 0` esperado em 24 h ⇒
> **`n < 5` ⇒ INCONCLUSIVO, nunca "sem problema"**. A janela serve para **detectar regressão**
> (nenhum resumo malformado, nenhum `[object Object]`), não para provar a correção. **A prova é a
> AC2/AC3.**

### Bloco B

**AC9 — 🔴 Backup ANTES, e ele é o rollback.**
A migration 231, no seu primeiro comando, grava o `collected_data` **inteiro** das 56 linhas em
`conversation_state_backup_87_12 (id uuid, collected_data jsonb, backed_up_at timestamptz)`.
- (i) `select count(*) from conversation_state_backup_87_12` = número de linhas efetivamente tocadas;
- (ii) a instrução literal de restauração fica colada no cabeçalho do arquivo.

**AC10 — 🔴 O `DELETE` é por `id` nomeado, e a guarda é explícita.**
```sql
update public.conversation_state
   set collected_data = collected_data - 'visit_availability'
                                       - 'visit_pending_date'
                                       - 'visit_pending_hour'
                                       - 'visit_pending_minute'
 where id in ( /* os 56 id literais — ver T5 */ );
```
- (i) **nenhuma cláusula de forma** (`? 'visit_availability'`, `length(...) > 60`, `like`) aparece no
  `where` da migration. Só `id in (...)`;
- (ii) a migration **falha** se o `UPDATE` afetar **mais** que 56 linhas (impossível por construção —
  é a guarda contra edição descuidada da lista);
- (iii) a migration **avisa e prossegue** se afetar **menos** que 56 — é o caso legítimo de uma
  conversa ter sido tocada e limpa pelo `pipeline.ts:760` entre o congelamento da lista e a
  aplicação. O número real vai no `RAISE NOTICE`.

**AC11 — 🔴 A invariante pós-migration, e ela é de população, não de amostra.**
```sql
select count(*) from conversation_state
 where collected_data ?| array['visit_availability','visit_pending_date',
                               'visit_pending_hour','visit_pending_minute'];
--  esperado: 0    (hoje: 56)
```
- (i) **vermelho:** rodar a consulta **antes** da migration ⇒ `56`. Colar os dois números.

**AC12 — A queda de score é AUDITADA lead a lead, não descoberta no retrospecto.**
A migration grava, na mesma transação, uma linha por lead afetado em
`conversation_state_backup_87_12` (ou tabela irmã de auditoria) com `score_antes` e `score_depois`, e
emite **um** `system_events` de resumo:
```
event_type: NICOLE_AGENDA_STATE_LEGADO_DESCARTADO   ← o MESMO da 87-4, não um novo
metadata:   { origem: "migration_231", linhas: N,
              projecao_caem_de_qualified: 27,       ← 🔴 E4: PROJEÇÃO, não efeito
              projecao_caem_para_cold: 10,
              leads_reescritos: 0 }                 ← 🔴 E4: obrigatório, e é SEMPRE 0 (AC13)
```

> 🔴 **EMENDA E4 na AC12 — os nomes das chaves são normativos.** `caem_de_qualified: 27` afirma um
> efeito que a migration **não produz** (ver Risco 2): a 231 não toca `leads`, e a população é
> dormente. Um evento que diz *"27 leads caíram"* quando **zero** caíram é a classe de métrica que
> esta casa já recusou duas vezes — um número que se satisfaz sozinho. O prefixo `projecao_` e o
> `leads_reescritos: 0` explícito são o que impedem que a próxima pessoa a ler o `system_events`
> conclua que a queda aconteceu. **O `0` tem de ser emitido, não omitido:** ausência de campo é
> ambígua entre *"não houve"* e *"o emissor esqueceu"* — é a mesma correção que eu pedi na AC9 da
> `87-10`.
> **Reusa o `event_type` da `87-4` de propósito.** Quem for medir o decaimento do legado (AC8 da
> `87-4`) precisa achar os dois eventos na mesma consulta. Um `event_type` novo para o mesmo fato é a
> quinta régua num painel que ainda tem cinco linhas. **Os números esperados (27 e 10) estão medidos
> e colados aqui; se o `RAISE NOTICE` divergir, HALT e escalar** — divergência significa que o
> `calculateQualificationScore` mudou entre a medição e a aplicação.

**AC13 — O `qualification_status` dos leads NÃO é reescrito pela migration.**
A migration toca **apenas** `conversation_state.collected_data`. `leads.qualification_status` e
`leads.interest_level` são recalculados pelo `pipeline.ts:1327-1328` **no próximo turno da conversa**
— que é o comportamento que a `87-4` desenhou. Reescrever `leads` na migration seria fazer, à mão, o
que o runtime faz sozinho, e sem o resto do cálculo.
- (i) `grep -c "leads" supabase/migrations/231_*.sql` referente a `update`/`insert` ⇒ **0**.

---

## Tarefas

- [x] **T1 (bloco A)** — exportar `parseAgendaState` em `packages/ai/src/flows/agenda-state.ts:178`
      (uma palavra) e conferir que `flows/index.ts` não precisa de mudança (o consumo é interno ao
      pacote). ✅ **Conferido: `flows/index.ts` NÃO foi tocado** — o consumo é `handoff.ts` →
      `./agenda-state`, dentro do pacote. Não reexportar é o que mantém a contenção do Risco 4.
- [x] **T2 (bloco A)** — `packages/ai/src/flows/handoff.ts`: `formatDisponibilidade` + troca da linha
      138 + import. **Não** remover `formatBoolean`. ✅ *(a linha é a **153** em `origin/main`, não a
      138: a `87-5 A` — commit `6b760887`, mergeada depois do parecer do @po — acrescentou 15 linhas
      de tipo/docstring acima dela. `formatBoolean` fica, servindo `has_down_payment`.)*
- [x] **T3 (bloco A)** — `packages/ai/src/flows/handoff.test.ts`: par-ouro (AC2), trio de controles
      (AC3), desfazer a fixture colinear (AC4). Colar os 4 vermelhos exigidos. ✅ **15 mutações
      medidas** (uma delas é um vermelho que NÃO caiu, e 5 são controles que precisavam ficar
      verdes — ver Dev Agent Record). ✅ **Rodada 2:** todas as contagens da rodada 1 remedidas
      (a M2 estava errada), `it` novo para a guarda de âncora (QA-3).
- [x] **T4 (bloco A)** — `npx vitest run` da raiz + `npx tsc --noEmit` em `packages/ai`. Colar. ✅
- [ ] **T5 (bloco B, @data-engineer)** — migration `231_87_12_limpa_agenda_legado.sql`. **Reconferir
      a lista de `id` contra produção antes de aplicar** (a contagem só pode cair). Lista congelada em
      15/08 (56 `id`):

```
'05b2d24c-23ea-45d3-a413-a6cf1dcde220', '0a60c386-7acd-45ae-ac05-bec004c398a6',
'0d40271a-276d-486c-93ca-fb40fbe8821c', '0d82db62-c263-4381-9a1f-e1042fffd555',
'1d9e7a31-2a2e-4b7a-97d7-3760f0e67ac0', '29f7ab18-071e-4b95-87e9-f4904de148b8',
'32fc590c-1b8e-4263-92c9-73a8724ef23d', '3b74e141-2bb1-4308-bfe1-a990e33c9cec',
'4398c824-b7e2-435f-a7ad-5b2d6ef98ea2', '45377310-09f7-40bb-9a61-879fd0a9d85c',
'4769af5b-632a-4934-8e6b-fcea39233426', '49519236-981e-4ad8-9557-bfec045f5257',
'52079f6a-3edb-4392-8352-b58b9deee337', '525a0630-8ac7-4be2-a5c1-52a51304bd4b',
'53cf0d9e-4d74-4d3f-970a-088601d713e3', '61d66920-cba3-47d7-ab3c-21443e921a22',
'61d7a729-eca7-459f-abd1-1c7b98a024b6', '6202527a-10e4-4bf9-b4d5-b9362319fc8e',
'6237c1d4-cb8d-47c8-a189-cc7f5f03c6c2', '630f2b20-a04c-4db3-8781-3d2e5207c107',
'64bdf8c7-0339-4503-b629-1352c9c512f6', '655b4fcd-b5fc-4458-b237-4c35446cde69',
'75790bb4-e871-4859-a976-7118e2ce9ffe', '75879275-340c-4311-9fc7-15f7147bf616',
'7b6dac4c-ca43-4338-9e6f-d710f5a46d68', '7da22293-c9a7-477d-b124-f1312f430f97',
'7f44e085-ccb0-4c1a-aaae-c4976d421443', '802d5352-9af4-45e4-b7b8-fb3306552fc2',
'816e3a48-bce2-4d64-a87d-10c84d44cb55', '81c95ee1-8e75-4af4-a126-cc74a78815cb',
'8640d345-466b-4f3a-b8c4-35fd9959f713', '8844e534-1a23-4cd4-aad4-2dff6c4a071e',
'8d402672-dee2-439b-ada7-a0030cb67674', '96f4d594-0f93-4f5f-bb27-29f055013d13',
'988cde75-ded5-4e82-9f18-b8a174036139', '9c9e3c72-40af-4f36-b0c7-2186ca32ff6a',
'a87d6ce2-9879-42d5-a58b-d81d2d3e49b8', 'aa38b81f-0392-4a4a-9147-5406593983e7',
'af9c39da-6024-45e0-965f-36e754797f7c', 'b61a4a14-fafa-4df4-beeb-063e1f6d85be',
'c33a5e8a-c468-474a-bc27-7153fc8d2dde', 'c38879f9-3c2f-407e-bb6a-ae5732e0b171',
'c40bf660-cbc7-48f8-851e-2a00341d891a', 'd4919657-82b1-4e4a-a4ca-e754614a002b',
'd5783e3c-09e5-481f-b35f-40b4e5c6d02a', 'e35e9930-9e05-4f08-89f4-d3e1a7ee4aba',
'e3b88188-f0b4-495d-9b06-da187fcae320', 'e533df4c-0828-424f-a3d5-054d6f6bc7cc',
'e6da2b1e-9784-4950-b3c6-5ac6f9ec597d', 'e7b83b53-6cd9-427b-b00a-20685f83f0ed',
'ee658303-b202-4a82-a1e6-2e5c7b1ef3bb', 'ef6feca3-28b1-434a-92af-70f76d45bcb7',
'f0e20099-c8d3-4a81-ac8c-02fdc9808383', 'f25d9325-8a0d-4694-b25a-33225ed5f25c',
'fbcb7c78-6301-476c-a1e3-a4bba2c4a3ae', 'ff8250e3-86c7-45b6-bea4-a09411782375'
```

- [ ] **T6 (bloco B)** — aplicar por Management API (arquivo inteiro, um POST), colar o `RAISE NOTICE`
      e rodar a AC11 antes e depois.
- [ ] **T7** — @qa + Marcos: janela de 24 h entre os blocos (D7), com o critério de rollback na mão.

---

## Dev Notes

### Mapa de código

> 🔴 **RENUMERADO pelo @dev em 16/08, contra `origin/main` `199a7a84` — e ler o motivo importa mais
> que a tabela.** As linhas originais foram medidas pelo @sm contra `HEAD` `24800872`; a **`87-5 A`**
> (`6b760887`, #426) foi mergeada **depois** disso e deslocou `handoff.ts` em **+15** e `pipeline.ts`
> em **+61 a +84**. Eu peguei o deslocamento no arquivo que eu editava (138 → 153) e **não** nos que eu
> citava — é o mesmo defeito, do outro lado, e o @qa o pegou (Issue QA-4). **Cada linha abaixo foi
> conferida por `awk` sobre `git show origin/main:<path>`, uma a uma, não por inferência de offset.**

| arquivo:linha | papel | era |
|---|---|---|
| `packages/ai/src/flows/handoff.ts:153` | **o defeito**. `formatBoolean(collectedData.visit_availability)` | 138 |
| `packages/ai/src/flows/handoff.ts:175-179` | `formatBoolean` — fica, serve `has_down_payment` | 160-164 |
| `packages/ai/src/flows/agenda-state.ts:178-205` | `parseAgendaState` — **o validador a exportar**. `:181-183` são as **três** guardas de forma (`citacao` não-vazia · `origem === 'lead'` · âncora `string`) | ✓ |
| `packages/ai/src/flows/agenda-state.ts:91-127` | `interface AgendaState` — `citacao`, `data_absoluta`, `ancorado_em` | ✓ |
| `packages/ai/src/chat/pipeline.ts:799-803` | lê o estado e **apaga o vencido** — é o que dispensa TTL no `handoff.ts` | 738-741 |
| `packages/ai/src/chat/pipeline.ts:821` | `stripLegacyAgendaKeys` — incondicional, antes do `finalData` | 759-760 |
| `packages/ai/src/chat/pipeline.ts:1064` | `writeAgendaState(cd, null)` — apaga a chave quando o slot é autorizado | 991 |
| `packages/ai/src/chat/pipeline.ts:952` | `clearPending()` — o outro apagamento, no ramo da pendência | 902 |
| `packages/ai/src/chat/pipeline.ts:958` e `:1048` | os dois escritores que passam a mensagem do turno como `citacao` | 955 / 1047 |
| `packages/ai/src/chat/pipeline.ts:1298` | `finalData` nasce da cadeia que já passou pelo strip | 1223 |
| `packages/ai/src/chat/pipeline.ts:1326` | `generateHandoffSummary(finalData, allMessages)` — **chamador único de produção** | 1251 |
| `packages/ai/src/chat/pipeline.ts:1597` | `leadPatch.ai_summary = handoffSummary` — o resumo vira `leads.ai_summary` | 1513 |
| `packages/ai/src/flows/handoff.test.ts:159-191` | **a fixture colinear** que escondeu o defeito | 158-190 |
| `packages/ai/src/chat/pipeline-historico-cauda.test.ts:557-563` | AC6 da `87-8` — não pode precisar de edição |
| `packages/ai/src/config-surfaces.test.ts:121-122` | superfície `handoff-summary` — **0 diff** (chama com `{ name: "Fulano" }`) |
| `packages/web/src/app/dashboard/leads/[id]/page.tsx:198-206` | o leitor que a `87-4` **já** migrou — o modelo a seguir, com a ressalva de que ele não confere `origem` |
| `packages/ai/src/flows/qualification.ts:50` | `fieldIsCollected('visit_availability') → hasAgendaFact` — o peso 20 |
| `packages/ai/src/memory/loader.ts:196-203` | `ai_summary` volta ao prompt como fallback de L1 — ver Risco 3 |

### Armadilhas

1. **Não invente `now` dentro de `generateHandoffSummary`.** `new Date()` numa função pura torna o
   teste não-determinístico e mata o único argumento forte desta story (*"é testável de verdade"*).
   O TTL já foi aplicado em `pipeline.ts:741`.
2. **Não copie o formato do painel.** Ele não confere `origem`. Use `parseAgendaState`.
3. **Não mude a assinatura de `generateHandoffSummary`.** Três chamadores, um deles é o
   `config-surfaces.test.ts` — e mexer nele reabre a discussão do registro de superfícies, que não é
   assunto desta story.
4. **A saída do resumo é ASCII sem acento por convenção do arquivo** (`"nao informado"`, `"Entrada
   disponivel"`). O rótulo novo segue a convenção; **a `citacao` não** — ela é texto literal do lead e
   vai como veio.
5. **`?` vs `?|` em jsonb dentro do curl da Management API**: o `?` conflita com placeholders em
   algumas ferramentas. Use payload JSON em arquivo, não `-d` inline.
6. **A lista de 56 `id` só encolhe.** Se o `UPDATE` afetar 54, está certo — dois leads voltaram a
   conversar. Se afetar 57, alguém editou a lista: HALT.

### Fronteiras com outras stories

| story | colide? |
|---|---|
| `87-5 A/B` (`W1-7`, histórico rotulado) | **não.** Toca `pipeline.ts` e o carregamento de histórico. Esta story toca `handoff.ts` e uma palavra em `agenda-state.ts` |
| `87-11` (`W1-6`) | **não.** `buildSystemPrompt`, `pipeline.ts:1913` |
| `87-10` (`W1-2c`) | **não** — mas há **adjacência semântica**: ela passa a escrever `ofertas_do_sistema` e `afirmado_pela_nicole` **dentro do `agenda_state`**. `formatDisponibilidade` lê **só `citacao` e `data_absoluta`** e **nunca** os dois campos novos — `afirmado_pela_nicole` é **WRITE-ONLY** por decisão ratificada do @po, e o resumo do corretor **é um leitor**. ⚠️ **Isto é uma restrição normativa para o @dev, não uma observação** |
| `87-13` / `87-14` (switch de empreendimento) | **não.** `properties`, `pipeline.ts:loadProperties`, painel de imóveis |
| `87-4` (`W1-2b`, `Done`) | **é a base.** Esta story consome o objeto que ela criou e executa a limpeza que ela escreveu e não conseguiu alcançar |

---

## Riscos

| # | risco | probabilidade | mitigação |
|---|---|---|---|
| **1** | **A citação chega ao corretor e ele a lê como visita marcada.** O caso Ronaldo é a prova de que a citação pode ser um horário que o sistema **recusou** | **Média** | o rótulo `"nas palavras do lead, nao e visita marcada"` é **obrigatório na string**, e está na asserção da AC2-(i) e (ii). Visita marcada mora em `appointments` |
| **2** | **A queda de 27 `qualified` → `in_progress` (bloco B) surpreende alguém** — muda Kanban, filtros e o gatilho `score >= 70` do `shouldHandoff` | 🔴 **BAIXA / LATENTE — corrigido pelo @po (E4).** O @sm escreveu *"Alta (é certa)"*, e **é o contrário** | ver a caixa abaixo — a migration **não muda `leads`**, e a população é dormente por construção. AC12 audita; AC9 dá o backup; **avisar Marcos antes**, com a mensagem CERTA |

> 🔴 **EMENDA E4 (@po, 15/08) — os 27 leads não caem na migration. Provavelmente não caem nunca.**
>
> Reproduzi o `calculateQualificationScore` em SQL, de forma independente, e **confirmo os dois
> números**: **27** caem de `qualified` e **10** de `warm` para `cold` — *se o score for recalculado*.
> **E é esse "se" que a story recebida engoliu.** Três fatos que só fecham juntos:
>
> 1. **A AC13 proíbe a migration de tocar `leads`** — por decisão correta e escrita.
> 2. `leads.qualification_status` só é reescrito em **dois** lugares: `pipeline.ts:1327` (turno vivo)
>    e `haiku-enrichment.ts:237` (cron `enrich-leads`). **Os dois exigem conversa recente** — o cron
>    filtra por `last_message_at >= now() - ENRICHMENT_WINDOW_MINUTES`, uma janela de **minutos**.
> 3. **É exatamente o argumento do §6 desta story**: essa população é dormente, e é por isso que a
>    auto-cura da `87-4` nunca a alcançou (`NICOLE_AGENDA_STATE_LEGADO_DESCARTADO = 0` all-time —
>    reconfirmado por mim).
>
> **Não dá para ter os dois.** Se as conversas são dormentes o bastante para o runtime nunca as tocar
> (o que justifica o bloco B existir), então o runtime também **nunca recalcula o score delas** — e os
> 27 não caem. E no dia em que uma delas acordar, o `pipeline.ts:760` teria apagado as chaves de
> qualquer jeito: **a queda seria idêntica com ou sem a migration.**
>
> **Estado persistido hoje, medido por mim nos leads das 56 linhas:** 29 `qualified` (15 `hot`,
> 10 `cold`, 4 `warm`) e 27 `in_progress`. Note os **10 `qualified` + `cold`** — combinação impossível
> pela fórmula (`>= 70` ⇒ `hot`): a tabela `leads` **já está descolada** do score calculado, por
> override manual (`stripManualInterestLevel`, 75-237) ou por staleness. A 231 não piora isso; mas
> depois dela **29 leads carregam um `qualified` que nada no estado sustenta**, e quem auditar vai
> achar a divergência. Fica escrito aqui para não ser descoberta no retrospecto.
>
> **O que muda na prática:**
> - **Risco 2 cai de "Alta (é certa)" para "Baixa/latente".**
> - **AC12 tem de rotular 27 e 10 como PROJEÇÃO, não como efeito** (ver a emenda na própria AC12).
> - **O aviso ao Marcos continua obrigatório, com o texto certo:** *"27 leads podem cair de
>   `qualified` **quando e se** voltarem a conversar — não agora"*. Avisar que 27 leads vão cair hoje
>   é gritar fogo onde não há fogo, e queima o aviso para a próxima vez.
> - 🔴 **E o benefício real do bloco B tem de ser dito:** o efeito **imediato e visível a humano** não
>   é o score — é o **painel**. `page.tsx:205` mostra hoje, para **45 leads**, a fala da própria
>   Nicole no campo *"Disponibilidade para visita"*. Apagar o dado apaga essa mentira **hoje**. A
>   story trata isso como nota de rodapé (Achado nº 3) e vende o bloco B pelo score, que é o efeito
>   que **não** acontece. **A justificativa está invertida — o dado é que era para ser a nota, e o
>   painel a manchete.**
| **3** | **Realimentação: a citação volta ao prompt da Nicole.** `ai_summary` é fallback de L1 em `loader.ts:196-203` — o resumo do corretor **entra no contexto dela** | **Alta** | **aceito, e é o lado bom da mesma moeda.** O que volta é a **fala literal do lead**, rotulada — que é exatamente o "lastro" que o epic persegue. Hoje o que volta é `"nao informado"`, um **falso negativo** alimentado ao modelo. ⚠️ **Não fechar aqui**: o sítio 2 do §2 do parecer do @po (`lead-memory.ts:79`) é escopo da **AC6-b da `87-10`** |
| **4** | **`parseAgendaState` exportado vira porta para leitores indevidos** dos campos da `87-10` | **Baixa** | o docstring da `AgendaState` (`agenda-state.ts:108-126`) já carimba `WRITE-ONLY` nos dois campos; esta story adiciona a restrição explícita na tabela de Fronteiras. É contenção por escrito, não por tipo — **declarado, não escondido** |
| **5** | **A lista de 56 `id` envelhece** entre o congelamento e a aplicação | **Média** | por construção ela só encolhe (T5 / AC10-(iii)). A invariante da AC11 (`= 0`) é o que realmente fecha |
| **6** | **A janela de 24 h não observa nada** (nenhum handoff dispara) | **Alta (14 all-time, nenhum em 11 dias)** | **declarado na própria AC8**: `n < 5` ⇒ inconclusivo. A prova é a AC2/AC3, não a janela |
| **7** | **O bloco B remove os 20 pontos de ~10 leads cuja disponibilidade era real** (Valnira, Marlene, Edicleia, Sandra, Andréia, Maria Oliveira, Sueli, Lucimara, Mariangela, Lucilio) | **Média** | **aceito, e a razão é a tese da `87-4`**: são strings **sem âncora** — a classe do *"gerador perpétuo de sextas"* (a Edicleia é o caso nominal do docstring da `87-4`). Todas as datas citadas já **passaram** (a mais recente é *"8 de agosto"*; hoje é 15/08). Preservá-las exigiria migrá-las para o formato novo — **carimbar âncora em cima de string sem procedência**, que a `87-4` proibiu por escrito |

---

## Critério de rollback — escrito ANTES do deploy

**Dono:** Marcos (D7).

**Bloco A — reverter o PR se, nas 24 h:**
- (a) qualquer resumo de handoff sair malformado (`[object Object]`, linha vazia, exceção em
  `processMessageWithMetadata`); **ou**
- (b) o Marcos ler um resumo em que a linha de disponibilidade **contradiga** a conversa; **ou**
- (c) qualquer erro novo em `system_events` correlacionado ao turno de handoff.

**Não é gatilho de rollback:** nenhum handoff disparar na janela (é o cenário esperado — Risco 6).

**Bloco B — restaurar de `conversation_state_backup_87_12` se:**
- (d) o `RAISE NOTICE` divergir de `27` / `10` (AC12) — **HALT antes de commitar**; **ou**
- (e) o Marcos identificar lead cuja queda de etapa cause dano comercial concreto.

> ⚠️ **Fronteira do rollback:** reverter o PR do bloco A **não desfaz** o bloco B. Depois da 231, o
> rollback é **restaurar o backup primeiro, reverter o código depois (ou nunca — o bloco A é inerte
> sem `agenda_state`)**.

---

## Definition of Done

- [x] AC1–AC7 verdes, com **15 mutações medidas e coladas** (rodada 1: 8 · rodada 2: as mesmas
      **remedidas** + 7 novas, incluindo 4 controles de orfandade e 1 de atribuição) e a forma da
      mutação escrita ao lado de cada número.
      ⚠️ **AC3-iv não vale como escrita** — a mutação literal dela cai **zero** (M3a); foi substituída
      por duas, decompostas (M3b/M3c). ⚠️ **A M2 derruba 2, não 1** (corrigido na rodada 2 — QA-1).
      **AC8 é janela de produção** (pós-deploy, @qa) e **AC11-i é do bloco B**
- [x] `npx vitest run` da raiz, suíte inteira, verde (**188 · 2418 passed · 6 expected fail**) ·
      `npx tsc --noEmit` em `packages/ai` = **0** (e em `packages/web` = 0) · lint **0 errors / 23
      warnings**, igual ao baseline · `npm run prompts:check` **verde**
- [x] `grep -n "visit_availability" packages/ai/src/flows/handoff.ts` = **0 linhas fora de comentário**
      (2 menções restantes vivem no docstring que explica o defeito)
- [x] `pipeline-historico-cauda.test.ts:557-563` verde **sem edição** — 0 linhas de diff
- [x] `config-surfaces.test.ts` com **0 linhas de diff**
- [ ] Janela de 24 h cumprida entre os blocos, com o resultado registrado **inclusive se
      inconclusivo** (e ele será — Risco 6)
- [ ] AC9–AC13 verdes; backup existente e conferido; invariante da AC11 = 0
- [ ] Marcos **avisado antes** da 231, com o texto corrigido pela E4: *"27 leads podem cair de
      `qualified` **quando e se** voltarem a conversar — não na migration; a 231 não toca `leads`"*.
      **Avisar que caem hoje é falso** (Risco 2)
- [ ] Critério de rollback lido e aceito pelo dono (Marcos) **antes** de cada um dos dois deploys
- [ ] Achados nº 1–8 registrados no backlog, **cortados por escrito, não por omissão**
      *(nº 7 e nº 8 acrescentados pelo @dev em 16/08, ambos medidos)*
- [ ] `stories_planned` do epic reconciliado pelo @pm (pedido abaixo) — **não pelo @sm**

---

## Achados (para o backlog / @pm — NÃO entram nesta story)

1. **`detect-appointment.ts:71` — `collectedData.visit_availability === true`** sobre um campo que
   sempre foi string. Sinal **morto desde antes da `87-4`**; depois do bloco B fica duplamente morto
   (a chave deixa de existir). Já registrado pelo @po (§13). **Ligar = caminho de decisão novo.**
2. **`agent_prompts.handoff-summary` é um botão morto** — `config-surfaces.test.ts:119-120` diz
   literalmente *"NÃO recebe configuração nenhuma — a assinatura não tem por onde"*. Esta story **não
   o liga** e **não o remove**: é escopo da `87-1`/`87-2`.
3. **`dashboard/leads/[id]/page.tsx:205` — fallback legado inerte** depois do bloco B. Remoção de
   código morto + alinhar o validador inline com `parseAgendaState` (ele **não confere `origem`**).
   Candidato natural ao **`W1-2d`** (*inventário de consumidores do fato de agenda*), que já está
   reservado no mapa e ainda não foi escrito.
4. **Divergência no mapa do epic:** `stories_planned` anota `NICOLE_LASTRO_DIARIO = 0 all-time` para a
   `87-3`. **Medido em 15/08: 6 execuções, de 10/08 a 15/08.** O cron **está rodando**. Um mapa com
   uma mentira conhecida é pior que um mapa com um `⚠️`. *(Confirmo: o número desatualizado é **meu**,
   do §10 do parecer de 10/08. O @sm está certo.)*
5. 🔴 **O resumo do corretor não menciona `appointments` em lugar nenhum** (@po, E5). O handoff de um
   lead com **visita marcada** imprime `- Disponibilidade para visita: nao informado` e nada mais —
   porque `writeAgendaState(cd, null)` (`pipeline.ts:991`) limpa o estado justamente quando o slot é
   autorizado. É um buraco **maior** que o desta story e de outra natureza (falta uma linha, não está
   errada a que existe). **Não entra aqui** — entra no `W1-2d` (*inventário de consumidores do fato de
   agenda*), junto com o Achado nº 3.
6. **A tabela `leads` já está descolada do score calculado** (@po, E4): **10 leads** estão
   `qualification_status = 'qualified'` **e** `interest_level = 'cold'` ao mesmo tempo — combinação
   que a fórmula do `pipeline.ts:1327-1328` não produz (`>= 70` ⇒ `hot`). Override manual (75-237) ou
   staleness. **Anterior a esta story e não causado por ela**, mas quem for auditar a 231 vai
   esbarrar nisso e precisa saber que já estava assim.
7. 🔴 **`agenda-state.test.ts` esconde as TRÊS guardas de forma de `parseAgendaState` atrás de uma
   só fixture — e nenhuma delas tinha vermelho em `origin/main`** (@dev, 16/08; **subcontado na
   primeira redação, corrigido na rodada 2 com as medições do @qa e as minhas**).
   O mecanismo é único: o caso `["origem diferente de lead", …]` de `agenda-state.test.ts:99` entra
   por `readAgendaState` com `expira_em: "y"`; `Date.parse("y")` → `NaN` → o TTL devolve `state: null`
   **antes** de qualquer guarda de forma ser alcançada. A fixture **toca** as três linhas e **não mede
   nenhuma**. Medido, uma por uma, na suíte inteira da raiz:

   | guarda (`agenda-state.ts` em `origin/main`) | vermelhos em `main` | vermelhos com esta story |
   |---|---|---|
   | `:181` — `citacao` não-vazia | **0** (2411 passed) | **1** — `AC3 (fail-closed)` |
   | `:182` — `origem === "lead"` | **0** (2411 passed) | **1** — `AC3 (fail-closed)` |
   | `:183` — âncora (`ancorado_em`/`expira_em` `string`) | **0** (2411 passed) | **1** — `AC3 (fail-closed/ÂNCORA)`, o `it` novo desta rodada |

   As duas primeiras já vinham resgatadas pelo `AC3 (fail-closed)`. **A terceira não vinha** — mesmo
   com esta story ela seguia órfã (medi: removê-la deixava **2417 passed, zero vermelhos**; quem
   pegava era só o `tsc`, com 2× `TS2322`, e o compilador pega a **remoção**, não um enfraquecimento
   que ainda devolvesse `string`). O `it` que fecha isso está em `handoff.test.ts`, **não** em
   `agenda-state.test.ts`: consertar a fixture do `expira_em: "y"` para dar um vermelho próprio a
   cada guarda **continua fora desta story** e continua candidato ao `W1-2d`.
   **Por que esta era a mais urgente das três:** `handoff` é o **único chamador de `parseAgendaState`
   sem TTL a jusante** — todos os outros passam por `readAgendaState`, que mascara a falha em `null`.
   Sem a guarda de âncora, um estado sem âncora nenhuma **imprime para o corretor**.
8. **O bloco `MENSAGENS DO LEAD` imprime texto cru do lead e tolera quebra de linha** (@dev, 16/08;
   número **corrigido** na rodada 2 — o primeiro era de sub-amostra). Medido na população
   **inteira**: **57 das 1.877 mensagens `role='user'` têm `\n` (3,04 %)** e **17 têm linha em
   branco** — e é a linha em branco que separa blocos neste formato. É comportamento **anterior** a
   esta story e não foi tocado: a 87-12 achatou só a linha de disponibilidade, que é campo rotulado.
   Quem for fechar o `W1-2d` decide se o resumo inteiro passa a ser uma linha por item.

---

## ⏳ Pedido ao @pm — o @sm não edita o corpo do epic

Três correções em `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md`
*(registro aqui, no padrão da `87-13`, porque há outro @sm escrevendo no mesmo arquivo)*:

1. **`stories_planned` — entrada da `87-12`:** `status: 'Não criada'` → **`Draft`**.
2. **🔴 Rótulo do item, que está factualmente errado:**
   `item: 'hotfix da W1-2b (87-4): handoff.ts:138 lê visit_availability, que a 87-4 apaga'`
   ⇒ a segunda metade é verdadeira, **a primeira não**. `git blame` em 15/08: a linha é de
   **31/03/2026** (`a5e29d70`, commit inicial do arquivo), **4 meses antes** da `87-4`. Sugestão:
   `item: 'defeito próprio (31/03) exposto pela W1-2b: o resumo do corretor não foi migrado para
   agenda_state — e a 87-4 apagou a chave que ele lia'`. **A story não é hotfix de regressão; é o
   segundo leitor humano que a migração do W1-2b esqueceu.**
3. **Número de migration nas Notas para o @sm (§10) e no `R-G`:** dizem **215**. O maior prefixo local
   em 15/08 é **230**. Esta story crava **231**.

*(Também vale para o @qa/@devops: a divergência do `87-0` — `Ready` no mapa × mergeada em produção,
PR #377 — continua aberta desde 10/08.)*

---

## Referências

- `docs/qa/po-validation-87-10-87-11.md` §9 (a decisão que cria esta story), §12 (fila de deploy),
  §13 (pendências e donos) — @po Pax, 10/08
- `docs/stories/87-4-estado-de-agenda-com-ancora-temporal.story.md` — o objeto `agenda_state`, a regra
  `origem: 'lead'`, e a decisão escrita de **não migrar** as 56 linhas legadas
- `docs/stories/87-7-resumo-nao-grava-a-fala-da-nicole-como-fato.story.md` — a mesma família de
  contaminação, no resumo; esta story é o mesmo veneno num escritor diferente
- `docs/stories/87-13-switch-por-empreendimento-do-que-a-nicole-fala.story.md` — o padrão
  *código → janela → dado* e a regra do backfill por `id` nomeado
- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` §7 (Onda 1 e a regra de corte), §10
  (notas para o @sm), D7 (rollback com dono)
- `packages/ai/src/flows/agenda-state.ts` — docstring de módulo (os três defeitos que o objeto novo
  fecha) e `:108-126` (o carimbo WRITE-ONLY dos campos da `87-10`)

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`).

---

## Dev Agent Record

**Agente:** @dev (Dex) · **Data:** 2026-08-16 · **Modo:** YOLO · **Escopo entregue: BLOCO A apenas.**
**Branch:** `story/87-12-handoff-agenda-formato-novo`, criada **de `origin/main` = `199a7a84`**.
**Sem commit, sem push, sem PR** (o @devops fecha).

> ⚠️ **Não construí sobre os PRs abertos.** A sessão começou com o worktree na branch
> `feat/87-11-collected-data-fora-do-prompt` (`HEAD` `8e655ee8`, que é o commit da `87-11`, PR #428,
> **não mergeado**). Saí de lá antes de tocar em qualquer arquivo. O diff desta story é contra
> `199a7a84` e **não contém uma linha da `87-11` nem do deploy B da `87-5` (PR #427)**.

### Réguas — baseline medido por mim, não herdado

| régua | baseline em `199a7a84` | rodada 1 | **rodada 2 (entregue)** |
|---|---|---|---|
| `npx vitest run` da raiz, suíte inteira | **188 arquivos · 2411 passed · 6 expected fail** | 188 · 2417 · 6 | **188 · 2418 passed · 6 expected fail** (+7 testes) |
| `npx tsc --noEmit -p packages/ai` | 0 | 0 | **0** |
| `npx tsc --noEmit -p packages/web` | 0 | 0 | **0** |
| `npm run lint` | 0 errors / 23 warnings | 0 / 23 | **0 errors / 23 warnings** |
| `npm run prompts:check` | verde | verde | **verde** (7 slugs) |

*(`npx tsc` na raiz não foi usado como gate — ~14 mil linhas pré-existentes, conforme instruído.)*
*(O baseline de `origin/main` foi **remedido** na rodada 2 pelo mesmo harness que roda as mutações,
substituindo os 3 arquivos do diff por `git show origin/main:<path>`: **2411**, idêntico ao da
rodada 1 e ao do @qa. O `+7` da rodada 2 é `+6` da rodada 1 mais o `it` da guarda de âncora.)*

### Reconferência contra produção — SOMENTE LEITURA, 16/08

Li `dsopqkqjkmhytudaaolv` via PostgREST com a service-role key do `.env.local`, **só `SELECT`**.
Nenhum `INSERT`/`UPDATE`/DDL, em nenhum momento, em nenhum ambiente.

| o que | @sm/@po (15/08) | **eu (16/08)** |
|---|---|---|
| `visit_availability` presente / tipo | 56 · `string` 56 · `boolean` 0 | **56 · `string` 56 · `boolean` 0** ✅ |
| linhas com `agenda_state` | 2 | **2** ✅ |
| fixture negativa da AC3 (E3, lead Kharina) | 104 ch | **104 ch, byte a byte** ✅ — e a variante `", Luiz!"` existe e tem **110 ch**, exatamente como a E3 corrigiu |

**As duas fixtures do par-ouro saíram do banco, não de transcrição** — inclusive os ISO completos, que
a story não trazia:

```json
// Rita — conversation_state 52416161-10c0-4bc2-9b6d-4a15a112f1a0, updated_at 2026-08-15 12:31 UTC
{"hora":null,"fonte":"pendencia","minuto":null,"origem":"lead","citacao":"Terça","periodo":null,
 "expira_em":"2026-08-17T12:20:47.409Z","ancorado_em":"2026-08-15T12:20:47.409Z","data_absoluta":"2026-08-18"}

// Ronaldo — conversation_state e644f1eb-7e1f-43dc-9f37-1d8c14e87c25, updated_at 2026-08-10 00:30 UTC
{"hora":17,"fonte":"pendencia","minuto":30,"origem":"lead","citacao":"3ª feira às 17:30","periodo":null,
 "expira_em":"2026-08-12T00:15:45.465Z","ancorado_em":"2026-08-10T00:15:45.465Z","data_absoluta":null}
```

> **A E5 fica confirmada no dado, não no argumento:** `expira_em 17/08 12:20` × `data_absoluta 18/08`.
> O estado da Rita **vence antes do dia para o qual aponta**, e hoje (16/08) ele ainda está vigente por
> menos de 24 h. Está escrito no docstring da função e na fixture, para não ser redescoberto.

### Os vermelhos — cada um APLICADO, RODADO, LIDO e REVERTIDO

> 🔴 **TODAS as contagens abaixo foram REMEDIDAS na rodada 2, contra a árvore final** — não só a
> que o @qa cobrou. Foi o que fiz na `87-11` e continua sendo a decisão certa: uma tabela em que
> um número saiu errado não tem como provar que os outros saíram certos. **A M2 estava errada
> (publiquei `1 failed`; são `2`)**; as outras oito bateram com a rodada 1. Harness em
> `scratchpad/mut.py`: snapshot dos 5 arquivos mutáveis → aplica em Python → `npx vitest run` da
> **RAIZ** → colhe do reporter → restaura → `md5` conferido no fim (**IGUAL**, os 5 arquivos).
> Nenhuma execução por arquivo isolado; nenhum `--reporter=basic`.
>
> **Baselines desta rodada:** `origin/main` = **188 · 2411 · 6** · árvore entregue = **188 · 2418 · 6**.

| # | mutação | previsto | **medido (rodada 2)** | rodada 1 | veredito |
|---|---|---|---|---|---|
| **M4a** | *(em `origin/main`, ANTES do meu código)* remover `has_down_payment: true` da fixture de `handoff.test.ts`, asserção `toContain("sim")` intacta | verde (cegueira) | **`2411 passed` — zero vermelhos** | igual | ✅ a colinearidade da AC4 é real |
| **M4b** | *(idem)* remover `visit_availability: true` em vez do outro | verde | **`2411 passed` — zero vermelhos** | igual | ✅ **cega nas DUAS direções** — remova qualquer um dos dois e nada cai |
| **M4** | *(já com o código novo)* remover `has_down_payment: true`, agora com a asserção **ancorada** `toContain("Entrada disponivel: sim")` | 1 cai | **`1 failed` — `returns formatted summary string with all sections`** | igual | ✅ a mesma mutação que era verde em `main` agora é vermelha. É o par que prova que a AC4 consertou cegueira real |
| **M2** | AC2-iii — `st.data_absoluta ? … : ""` vira `""` fixo | Rita cai, Ronaldo **não** | 🔴 **`2 failed` — `AC2-(i) par-ouro/Rita` + `citação MULTILINHA`** | ❌ publiquei `1 failed` | ✅ **a AC sobrevive, o número não sobreviveu.** Ver a correção abaixo |
| **M3a** | AC3-iv **ao pé da letra**: `if (!st) return formatBoolean(collectedData.visit_availability)` | *(a AC prevê 2 caindo)* | 🔴 **`2418 passed` — ZERO caiu** | igual | ❌ **a mutação escrita na AC3-iv é INERTE.** `formatBoolean` é função **absorvente**: mapeia qualquer string para `"nao informado"`, que é o que o código correto imprime — o fallback é indistinguível do acerto |
| **M3b** | fallback que **imprime** o legado (o "conserto ingênuo" do §2 do Desenho): `if (!st) return String(cd.visit_availability ?? "nao informado")` | negativa cai | **`1 failed` — `AC3 — controle POSITIVO e NEGATIVO`** | igual | ✅ |
| **M3c** | legado **PRIMEIRO** (precedência invertida) | negativa **e** anti-colinearidade caem juntas | **`2 failed` — `AC3 — POSITIVO e NEGATIVO` + `AC3 (anti-colinearidade)`** | igual | ✅ é este o vermelho que a AC3-iv queria |
| **M5** | remover a guarda `:182` — `if (o.origem !== "lead") return null` | ? | **`1 failed` — `AC3 (fail-closed)`** | igual | 🔴 guarda órfã nº 2 da família — ver Achado nº 7 |
| **M5-órfã** | **controle** — a mesma remoção na árvore de `origin/main` (sem os testes desta story) | ? | **`2411 passed` — zero vermelhos** | — | ✅ **orfandade provada nos dois sentidos** |
| **M5b** | remover a **sub-expressão** `\|\| !o.citacao.trim()` da guarda `:181` (não a linha inteira) | ? | **`1 failed` — `AC3 (fail-closed)`** | — | 🆕 guarda órfã nº 1 — **achado do @qa, reproduzido por mim** |
| **M5b-órfã** | **controle** — a mesma mutação em `origin/main` | ? | **`2411 passed` — zero vermelhos** | — | 🔴 confirma: **eram ≥2, não 1** |
| **M7** | remover a guarda `:183` — `if (typeof o.ancorado_em !== "string" \|\| typeof o.expira_em !== "string") return null` | 1 cai | **`1 failed` — `AC3 (fail-closed/ÂNCORA)`** | — | 🆕 **o vermelho que a QA-3 pediu, e ele é MEDIDO, não previsto** |
| **M7-órfã** | **controle** — a mesma remoção em `origin/main` | ? | **`2411 passed` — zero vermelhos** | — | ✅ a terceira guarda também nasceu órfã |
| **M7-sem-o-`it`-novo** | **controle de atribuição** — remover a guarda `:183` **e** o `it` novo, mantendo todo o resto desta story | ? | **`2417 passed` — zero vermelhos** | — | ✅ **o vermelho da M7 vem do `it` que escrevi agora, e de nada mais.** Sem este controle, "M7 = 1 vermelho" seria compatível com um teste antigo que por acaso passasse por ali |
| **M6** | remover o achatamento da citação (voltar ao desenho literal) | 1 cai | **`1 failed` — `citação MULTILINHA`** | igual | ✅ e o par-ouro fica **verde**: as duas provas são independentes por construção, não por sorte de fixture |

#### 🔴 Correção da rodada 2 (Issue QA-1): a M2 derruba **2**, não 1

Publiquei *"`1 failed` — só `AC2-(i) par-ouro/Rita`"*. **Medido duas vezes agora, determinístico: `2
failed`.** O segundo é o `citação MULTILINHA`, e o motivo é estrutural, não acidental: aquele `it`
monta `{ ...AGENDA_RITA, citacao: … }`, **herda o `data_absoluta: "2026-08-18"`** e afirma a linha
**inteira** com `toBe`. Zerar o sufixo de dia derruba a asserção byte a byte junto.

**A substância da AC2-iii sobrevive intacta** — o que ela exige é o **assimétrico**, e o assimétrico
é `Rita cai × Ronaldo NÃO cai`. O Ronaldo (hora sem dia) continua verde, porque a mutação não muda
nada na saída dele. Mas o vermelho colado é o artefato de prova desta casa e o meu estava furado, e
esta é a **4ª rodada seguida do epic 87** com contagem publicada divergindo da medida. Por isso a
rodada 2 remediu **as nove**, não só a cobrada.

#### 🔴 Correção à AC3-iv: a mutação que a story mandou fazer não cai — e o motivo importa

A AC3-iv manda reintroduzir `?? formatBoolean(collectedData.visit_availability)` e prevê que *"a
fixture anti-colinearidade e a negativa caem juntas"*. **Medi: caem zero.** `formatBoolean` mapeia
qualquer string para `"nao informado"`, que é exatamente o que o código correto imprime — o fallback
literal é indistinguível do acerto. Se eu tivesse "colado o vermelho" sem rodar, teria publicado um
vermelho inexistente.

O que a AC-iv queria dizer só aparece quando o fallback **imprime** o legado, e aí ela se decompõe em
**duas** mutações diferentes, que medem coisas diferentes — e é por isso que **separei a
anti-colinearidade num `it` próprio** (com os três numa asserção só, M3b e M3c dariam ambos "1 teste"
e a distinção sumiria):

- fallback **depois** do `agenda_state` (M3b) ⇒ só a negativa cai;
- legado **antes** do `agenda_state` (M3c) ⇒ **as duas caem** — que é o texto da AC.

**A conclusão da AC sobrevive inteira; a forma da mutação é que estava errada.**

#### 🔴 Achado nº 7, recontado (Issues QA-2 e QA-3): são **TRÊS** guardas órfãs, não uma

Publiquei o achado com **uma** guarda (`origem !== "lead"`). **Subcontei a família por um fator de
três.** O @qa achou a segunda (`!o.citacao.trim()`); a terceira (a da âncora) o @qa também achou, e
**ela continuava órfã mesmo depois desta story**. Reproduzi as três, cada uma nos dois sentidos:

| guarda (`agenda-state.ts` em `origin/main`) | em `main` | com esta story | como eu medi |
|---|---|---|---|
| `:181` `citacao` não-vazia | **0 vermelhos** (2411) | **1** — `AC3 (fail-closed)` | M5b-órfã × M5b |
| `:182` `origem === "lead"` | **0 vermelhos** (2411) | **1** — `AC3 (fail-closed)` | M5-órfã × M5 |
| `:183` âncora `string` | **0 vermelhos** (2411) | **1** — `AC3 (fail-closed/ÂNCORA)` 🆕 | M7-órfã × M7 |

**O mecanismo é um só, e é o que faz a subcontagem ser previsível:** o caso
`["origem diferente de lead", …]` de `agenda-state.test.ts:99` entra por `readAgendaState` com
`expira_em: "y"`; `Date.parse("y")` → `NaN` → o TTL devolve `state: null` **antes** de qualquer
guarda de forma rodar. A fixture **toca** as três linhas e **não mede nenhuma** — é a mesma classe da
"guarda órfã" que já me mordeu antes: *o teste passa pela linha sem medir o limite dela*. Uma vez
entendido o mecanismo, era previsível que **todas** as guardas atrás daquele `null` fossem órfãs;
eu parei na primeira que testei em vez de percorrer a lista. **Foi uma investigação incompleta
publicada como achado completo.**

**O que fiz nesta rodada (QA-3):** dei vermelho de teste à guarda de âncora — `AC3
(fail-closed/ÂNCORA)`, em `handoff.test.ts`. Não é simetria: **`handoff` é o único chamador de
`parseAgendaState` sem TTL a jusante**, e sem essa guarda um estado sem âncora nenhuma **imprime ao
corretor** (o @qa provou; eu reproduzi). O `it` cobre os dois modos — âncora **ausente** e âncora com
**tipo errado** —, e o segundo é o que o `tsc` **não** pegaria: o compilador pega a remoção
(2× `TS2322`), não um enfraquecimento que ainda devolvesse `string`.

**O vermelho é atribuído, não presumido:** rodei o controle `M7-sem-o-it-novo` (remover a guarda **e**
o `it` novo, mantendo o resto da story) ⇒ **2417 passed, zero vermelhos**. O vermelho vem do `it` que
escrevi agora, e de nada mais.

**Continua fora desta story** consertar `agenda-state.test.ts` — a fixture do `expira_em: "y"` precisa
ser decomposta para dar um vermelho próprio a cada guarda no arquivo *dela*, e o @qa endossou o corte.
**Candidato ao `W1-2d`, com item próprio.**

#### 🔴 Rodada 3 — Issue QA-6: a guarda de âncora é uma DISJUNÇÃO, e eu contei a linha, não as metades

**O @qa está certo e o defeito é o mesmo de sempre, uma casa mais fundo.** Na rodada 2 eu dei vermelho
à *linha* da âncora e escrevi que ela estava coberta. Mas a linha é
`if (typeof o.ancorado_em !== "string" || typeof o.expira_em !== "string")` — **duas** sub-expressões
—, e as **duas** fixtures do meu `it` novo (`semAncora`, sem nenhuma das duas chaves; `ancoraNaoString`,
com as duas numéricas) faziam **A e B verdadeiros ao mesmo tempo**. Cada metade se escondia atrás da
outra: a fixture **acende** a guarda inteira e **não mede** nenhuma das duas. É a mesma classe do
`slice` que eu tinha acabado de consertar na 87-11 — lá era uma constante compartilhada acendendo três
sítios, aqui é uma disjunção acendendo dois ramos. **Reproduzi antes de consertar**, contra o
`HEAD` desta branch (fixtures antigas), enfraquecendo **uma** metade de cada vez:

```
fixtures ANTIGAS (HEAD), sonda por sub-expressão, suíte da RAIZ (188 / 2.418 / 6)

  194a  typeof o.citacao     !== "string"   →  2418 passed | ZERO vermelhos | tsc 0 errors
  194b  !o.citacao.trim()                   →  1 failed                     | tsc 0 errors
  195   o.origem !== "lead"                 →  1 failed                     | tsc 0 errors
  196a  typeof o.ancorado_em !== "string"   →  2418 passed | ZERO vermelhos | tsc 0 errors
  196b  typeof o.expira_em   !== "string"   →  2418 passed | ZERO vermelhos | tsc 0 errors
```

**Bate com a contagem do @qa ao número: 6 sub-expressões, 3 com vermelho próprio.** As seis são as
cinco acima mais a guarda de forma de `data_absoluta`; as três que já tinham vermelho são `194b`, `195`
e a metade do **regex** de `data_absoluta` (medida: enfraquecê-la dá **1 failed**). A outra metade
daquela guarda (`typeof o.data_absoluta === "string"`) é pega pelo **`tsc`** (1 erro) e fica declarada
como tal — não é vermelho de teste e eu não a conto como um.

**O conserto é de fixture, e são TRÊS linhas — zero de produção.** Cada uma isola **uma** sub-expressão,
mantendo íntegro tudo o que a outra metade exige:

| fixture nova | isola | o que ela mantém válido |
|---|---|---|
| `citacaoNaoString` (`{ ...AGENDA_RITA, citacao: 15 }`) | `194a` | `citacao` **existe** e é não-vazia — só o TIPO está errado |
| `soAncoradoInvalido` (`{ ...AGENDA_RITA, ancorado_em: <number> }`) | `196a` | `expira_em` continua **string válida** |
| `soExpiraInvalido` (`{ ...AGENDA_RITA, expira_em: <number> }`) | `196b` | `ancorado_em` continua **string válida** |

**Vermelhos medidos depois — as três sondas que davam ZERO passam a dar 1, e o `tsc` continua limpo
(é justamente o ponto: o compilador não pega enfraquecimento):**

```
fixtures NOVAS, mesmas sondas, mesma suíte

  194a  →  1 failed | 2417 passed | 6 expected fail (2424)   (era 0)
  194b  →  1 failed                                          (inalterado)
  195   →  1 failed                                          (inalterado)
  196a  →  1 failed | 2417 passed | 6 expected fail (2424)   (era 0)
  196b  →  1 failed | 2417 passed | 6 expected fail (2424)   (era 0)
```

**As três caem em asserções DIFERENTES do mesmo `it` — a discriminação é por asserção, e está medida,
não suposta.** Colei o `Received` de cada uma, e ele mostra o dano concreto:

```
196a (só `ancorado_em` frouxo)
  Received: '- Disponibilidade para visita: "Terça" (dia 2026-08-18) - nas palavras do lead, nao e visita marcada'
196b (só `expira_em` frouxo)   ← o que o @qa provou: estado SEM VALIDADE LEGÍVEL impresso ao corretor
  Received: '- Disponibilidade para visita: "Terça" (dia 2026-08-18) - nas palavras do lead, nao e visita marcada'
194a (só o tipo da citação frouxo)
  Received: '- Disponibilidade para visita: "15" (dia 2026-08-18) - nas palavras do lead, nao e visita marcada'
```

O `194a` merece uma linha: sem aquela metade, o resumo do corretor imprime **`"15"`** entre aspas
como se fosse fala do lead. O caso não é de laboratório — `collected_data` é `jsonb` livre, quem
escreve a `citacao` é a mensagem crua do turno, e a mensagem que mais vira `citacao` é justamente a
que começa com número de dia (o `"15\nAgosto \n2026\n\nSábado…"` que já está medido no docstring).

**Declarado, para ninguém contar órfão a mais nem a menos:**

- **`semAncora` NÃO isola** (fere as duas metades) e **continua no `it`**, porque é o caso **real** —
  estado gravado sem âncora nenhuma. Ele está rotulado como não-isolante no próprio arquivo.
  **Contá-lo como um terceiro vermelho de sub-expressão seria contar errado.**
- **`!raw || typeof raw !== "object" || Array.isArray(raw)` é MUTANTE EQUIVALENTE, e agora eu sei por
  quê.** Enfraquecê-la dá **0 vermelhos com `tsc` limpo** — mas não é órfã: qualquer `raw` não-objeto
  (`null`, número, string, array) chega em `o.citacao === undefined` e é barrado por **`194a`**. Ou
  seja, a equivalência **depende da metade que eu acabei de cobrir** — antes desta rodada ela era
  equivalente por acaso, agora é equivalente por construção medida.
- As três sondas usam **enfraquecimento**, não remoção, exatamente pelo motivo que o @qa nomeou: a
  remoção o `tsc` pega (`TS2322`); o enfraquecimento passa com **`tsc` 0 errors** nas três.

**Efeito nas réguas:** `0` testes novos — as três fixtures entram como asserções nos `it` que já
existem, e a suíte fica em **188 / 2.418 / 6**, idêntica ao baseline. **`0` linhas de produção:**
`agenda-state.ts` (`b0650ba4…`), `handoff.ts` (`358f0bc1…`) e `chat/pipeline.ts` (`e4f3df64…`) com
`md5` conferido antes e depois das **sete** sondas desta rodada. `agenda-state.test.ts` **não foi
tocado** — ele é o item `W1-2d` e segue fora desta story.

### 🔴 Desvio deliberado do desenho literal (§1) — a citação é achatada em uma linha

**O que mudou:** `const citacao = st.citacao.replace(/\s+/g, " ").trim()` antes da interpolação.

**O desvio estava certo; a defesa estava fraca.** Publiquei **3,5 % (35 de 1.000)** — número tirado de
uma sub-amostra de **ordem física** (o teto de 1.000 do PostgREST não é aleatório nem ordenado), e
sobre o **denominador errado**. Refiz na população **inteira** e com o denominador que importa.

**(a) O denominador certo não é "toda mensagem" — é a mensagem que vira `citacao`.** A `citacao` é a
mensagem **crua** do lead (`qualification.ts:356`, `chat/pipeline.ts:958` e `:1048` passam a mensagem
do turno), e só entra em `agenda_state` mensagem com token de dia/hora. **Régua decomposta, porque
"mensagem com token de dia/hora" é uma escolha minha e ela tem de ser contada, não afirmada:**

| população (`role='user'`, 16/08) | n | alteradas pelo achatamento | com `\n` |
|---|---|---|---|
| **inteira** (sem teto de 1.000) | **1.877** | **99 — 5,3 %** | 57 — 3,04 % |
| **token de dia/hora, régua ESTREITA** — as `dayKeywords` literais do `qualification.ts:323-337` + hora explícita | **45** | **3 — 6,7 %** | 1 |
| **token de dia/hora, régua LARGA** — dia sem exigir `-feira` + hora + período | **103** | **10 — 9,7 %** | 6 |
| *(a régua do @qa, terceira e independente)* | *110* | *9 — 8,2 %* | *6* |

**Por que duas réguas minhas e não uma:** a estreita **perde a citação real da Rita** (`"Terça"`
isolado não casa com `"terça-feira"`) — ou seja, ela erra contra um caso que está **em produção,
nesta story, como fixture**. A larga pega. As três réguas caem em **6,7 – 9,7 %**, e a conclusão é a
mesma nas três: **no denominador que de fato vira `citacao`, a taxa é MAIOR que na população inteira**
— o oposto do que o meu número sugeria. Publico o intervalo, não o número que me favorece.

**(b) O pior caso é quebra ESTRUTURAL, e eu não o tinha medido.** Com `\n\n` na citação, o resumo não
ganha "uma linha a mais": ganha uma **linha em branco DENTRO do bloco `INTERESSE:`** — e a linha em
branco é o **separador de bloco** deste formato (são os `lines.push("")` que fecham `DADOS DO
CONTATO`, `INTERESSE` e `MENSAGENS DO LEAD`). Reproduzido com a mutação M6 e uma mensagem **real** de
produção (`"15\nAgosto \n2026\n\nSábado \nDia"`), saída bruta:

```
 6| INTERESSE:
 …
12| - Entrada disponivel: nao informado
13| - Disponibilidade para visita: "15
14| Agosto
15| 2026
16|                     ← LINHA EM BRANCO = fim do bloco INTERESSE, para quem lê
17| Sábado
18| Dia" (dia 2026-08-18) - nas palavras do lead, nao e visita marcada
19|
20| TOTAL DE MENSAGENS: 0
```

O bloco `INTERESSE:` **fecha no meio** e o resto da citação vira **bloco órfão sem cabeçalho**. E isso
**se propaga**: o `ai_summary` volta ao contexto da Nicole como fallback de L1
(`memory/loader.ts:196-203`, Risco 3) — resumo com bloco quebrado vira **prompt** quebrado. Existem em
produção: **17 das 1.877** mensagens têm linha em branco, **2 delas dentro da régua larga**. É
exatamente o *"resumo malformado"* do **gatilho (a) de rollback desta própria story**.

**Honestidade sobre o alcance, mantida:** o bloco `MENSAGENS DO LEAD` já imprime texto cru do lead e
**já tolera quebras hoje**, antes desta story — não toquei nele (Achado nº 8). O achatamento **não
muda uma vírgula** do formato ratificado: conferido no **valor de produção** (não na fixture),
`"Terça"` e `"3ª feira às 17:30"` não têm sequência de 2+ espaços nem `\n`, e a M6 deixa o par-ouro
**verde** derrubando só o `it` multilinha — as duas provas são independentes por construção. O
`.trim()` é **inerte** na população de hoje: **0 de 1.877** mensagens têm espaço nas bordas.
**Ressalva registrada:** para os ~7–10 % de citações com espaço irregular, o corretor lê um texto
**normalizado** sob um rótulo que diz *"nas palavras do lead"*. É estritamente melhor que um bloco
quebrado, o dado cru fica no banco — mas fica escrito.

### 🔴 Rodada 2 — Issue QA-4: os ponteiros do docstring que vai a produção

**O @qa está certo, e o defeito é meu e é o mesmo que eu mesmo peguei do outro lado.** Eu registrei na
T2 que a linha do defeito era **153** em `origin/main` e não 138 — porque a `87-5 A` (`6b760887`,
#426) foi mergeada **depois** do parecer do @po e deslocou `handoff.ts` em +15. **Peguei o
deslocamento no arquivo que eu editava e não nos arquivos que eu citava.** `pipeline.ts` andou de
+61 a +84 no mesmo merge, e os meus ponteiros ficaram apontando para o vazio.

**Conferi cada um por `awk` sobre `git show origin/main:<path>` — um a um, nenhum por offset
inferido.** O @qa cobrou três; **eram cinco** no docstring:

| citado | real em `199a7a84` | o que há na linha citada | onde |
|---|---|---|---|
| `chat/pipeline.ts:760` | **821** | `},` — fim de outro bloco | docstring §"o legado não é lido" **e** `handoff.test.ts` (anti-colinearidade) |
| `chat/pipeline.ts:1223` | **1298** | `},` — **não cobrada pelo @qa; achei conferindo** | docstring §"o legado não é lido" |
| `chat/pipeline.ts:1251` | **1326** | uma regex (`/qual dia ser[ia]+…/`) — **idem** | docstring §"o legado não é lido" |
| `chat/pipeline.ts:991` | **1064** | comentário `// CANCELAR` | docstring §"teto de valor" |
| `chat/pipeline.ts:738-741` | **799-803** | montagem de contexto de prompt | docstring §"sem TTL aqui" **e** fixture `AGENDA_RONALDO` |

Corrigidos os cinco, **e também nos comentários do `handoff.test.ts`** — deixar o número certo no
`.ts` e o errado no `.test.ts`, lado a lado, seria consertar metade do defeito.

**Uma divergência com o @qa, declarada:** ele conferiu `chat/pipeline.ts:955` e `:1047` como
**corretas**, e elas apontam para o `const st = buildAgendaState({` que **abre** a chamada. A linha do
`citacao:` em si é **958** e **1048**. Como a frase do docstring é sobre *o que se passa como
`citacao`*, usei as exatas. Diferença de 1 e 3 linhas — não é da classe "procura no lugar errado",
mas não custa nada estar certo.

**Conferidas e mantidas por estarem CERTAS:** `qualification.ts:356` (`citacao: aiResponse`),
`qualification.ts:323-337` (as duas listas de palavras), `memory/loader.ts:196-203` (o fallback de
L1), `leads/[id]/page.tsx:199-206`, `agenda-state.ts:108-126` (o carimbo WRITE-ONLY) e
`agenda-state.ts:181-183` (as três guardas).

**Fora do meu alcance de edição — ficam como pedido:** o bloco *"O defeito, em uma linha"*, o §6 do
Context e a emenda E5 (`pipeline.ts:902` → **952**) são seções do @sm/@po; o mapa do epic aponta
errado em 4 lugares e é do @pm (Issue QA-5). **Atualizei o que é meu: o Mapa de código das Dev
Notes**, com a coluna `era` ao lado de cada linha para que a renumeração seja auditável.

### AC a AC

| AC | veredito | prova |
|---|---|---|
| **AC1** | ✅ | `grep -n "visit_availability" handoff.ts` ⇒ **0 linhas fora de comentário** (restam 2 menções, ambas dentro do docstring que explica o defeito). `agenda_state\|parseAgendaState\|AGENDA_STATE_KEY` ⇒ **5**. `parseAgendaState` exportado, **mesmo símbolo** que `readAgendaState`/`hasAgendaFact` já usam — nada duplicado. `formatBoolean` fica, servindo `has_down_payment` (`:153`) |
| **AC2** | ✅ | par-ouro byte a byte. Rita ⇒ `- Disponibilidade para visita: "Terça" (dia 2026-08-18) - nas palavras do lead, nao e visita marcada`. Ronaldo ⇒ `- Disponibilidade para visita: "3ª feira às 17:30" - nas palavras do lead, nao e visita marcada` (sem `(dia `). Vermelho assimétrico **M2 = 2 failed** (Rita + MULTILINHA; **Ronaldo NÃO cai**, que é o que a AC exige) — número **corrigido na rodada 2** |
| **AC3** | ✅ | positivo+negativo num `it`, anti-colinearidade em `it` próprio (justificado acima), `fail-closed` e — **novo na rodada 2** — `fail-closed/ÂNCORA`. Vermelhos **M3b** (1) e **M3c** (2); **M3a** reprovada como mutação e substituída. As **três** guardas de forma passam a ter vermelho próprio: **M5b**, **M5** e **M7**, com os três controles de orfandade em `origin/main` |
| **AC4** | ✅ | `toContain("sim")` → `toContain("Entrada disponivel: sim")`; `visit_availability: true` fora da fixture. Cegueira medida nas duas direções (**M4a**, **M4b**) e vermelho de confirmação (**M4**) |
| **AC5** | ✅ | `pipeline-historico-cauda.test.ts` e `config-surfaces.test.ts` com **0 linhas de diff** (`git diff --stat` vazio) e verdes. A rede byte a byte de 23 linhas passou **sem edição**, como o @po previu |
| **AC6** | ✅ | **medido, não afirmado.** Mesma fixture com `agenda_state`, rodada nas duas árvores (branch × `origin/main`, via `git stash`): `com_agenda_state=70 · sem_agenda_state=50 · com_legado=70` — **idêntico nas duas**. O delta de 20 pontos aparece, então a medição tem poder discriminante (não é um zero colinear). `qualification.ts` com 0 linhas de diff |
| **AC7** | ✅ | suíte verde (**188 · 2418 passed · 6 expected fail**), `tsc` **0** em `packages/ai` **e** em `packages/web`, lint **0 errors / 23 warnings**, `prompts:check` **verde**. Sem ciclo em runtime: `handoff → agenda-state` é o único import de valor; `agenda-state → visit-slot` e `visit-slot → agenda-state` são **os dois `import type`**, apagados na compilação |
| **AC8** | ⏳ | **é janela de produção, pós-deploy.** Baseline reconferido por mim hoje para o @qa medir contra: `nao_informado = 14 · com_citacao = 0`. Nasce inconclusiva por desenho (`n < 5`) |
| **AC9–AC13** | ⛔ | **bloco B — não iniciado.** @data-engineer, depois das ≥24 h |

### IDS — decisões

| artefato | decisão | justificativa |
|---|---|---|
| `parseAgendaState` | **REUSE** | já existia e já é a regra de admissão de `readAgendaState` e `hasAgendaFact`. Mudou **uma palavra** (`export`) — zero linha de corpo. Não foi reexportado em `flows/index.ts`: manter a porta estreita é a contenção do Risco 4 |
| `formatDisponibilidade` | **CREATE**, justificado | avaliei o formatador inline do painel (`leads/[id]/page.tsx:199-206`): **rejeitado** — ele não confere `origem`, é validador mais fraco, e mora em `packages/web` (a dependência não pode ir nessa direção). Copiá-lo criaria dois leitores divergentes do mesmo objeto. Também rejeitei `readAgendaState(cd, now)`: exigiria um `now` novo em `generateHandoffSummary`, quebraria 3 chamadores e duplicaria o TTL que `chat/pipeline.ts:738-741` já aplica |
| testes | **ADAPT** | estendi o `handoff.test.ts` existente; nenhum arquivo de teste novo |

### Armadilhas da story — todas respeitadas

1. **Nenhum `new Date()` dentro de `generateHandoffSummary`** — a função continua pura; nenhum teste depende de relógio.
2. **Não copiei o formato do painel** — ver IDS acima.
3. **A assinatura de `generateHandoffSummary` não mudou** — `config-surfaces.test.ts` com 0 diff.
4. **Convenção ASCII respeitada** no rótulo (`nao e visita marcada`); a `citacao` vai com acento, como texto literal do lead.
5. **Fronteira com a `87-10` respeitada como norma:** `formatDisponibilidade` lê **`citacao` e `data_absoluta`, e só**. `ofertas_do_sistema` e `afirmado_pela_nicole` seguem WRITE-ONLY — está escrito no docstring da função **e** no do `parseAgendaState`.

### O que esta story NÃO comprou — para ninguém prometer ao Marcos

O campo **não passa a informar**; ele passa a **poder** informar. `"nao informado"` seguirá sendo a
saída na maioria dos handoffs, e na maioria deles continuará sendo a saída **certa** — TTL de 48 h
(a fixture da Rita é a prova: vence 17/08, aponta para 18/08) e `writeAgendaState(cd, null)`
(`chat/pipeline.ts:991`) apagando a chave justamente quando a visita vira compromisso. Está no
docstring da função, onde o próximo leitor de código tropeça nele.

### File List

| arquivo | o quê |
|---|---|
| `packages/ai/src/flows/agenda-state.ts` | **M** — `parseAgendaState` passa a ser `export` (+ docstring do porquê e da contenção W1-2c). **Nenhuma linha de comportamento** |
| `packages/ai/src/flows/handoff.ts` | **M** — import de `AGENDA_STATE_KEY`/`parseAgendaState`; linha `:153` passa a chamar `formatDisponibilidade`; função nova + docstring. `formatBoolean` intacta. **Rodada 2: 5 ponteiros de `pipeline.ts` corrigidos (QA-4) e a justificativa do achatamento reescrita com os números da população inteira — só comentário, zero comportamento** |
| `packages/ai/src/flows/handoff.test.ts` | **M** — AC4 (asserção ancorada + fixture despoluída); `describe` novo da 87-12 com par-ouro, controles, anti-colinearidade, fail-closed e citação multilinha. **Rodada 2: `it` novo `AC3 (fail-closed/ÂNCORA)` (QA-3) + ponteiros corrigidos nos comentários.** **Rodada 3 (QA-6): 3 fixtures que ISOLAM uma sub-expressão cada — `citacaoNaoString`, `soAncoradoInvalido`, `soExpiraInvalido`; o `ancoraNaoString` (que acendia as duas metades juntas) foi trocado, e o `semAncora` fica declarado como não-isolante. `0` testes novos, `0` linhas de produção** |
| `docs/stories/87-12-…story.md` | **M** — Status, T1–T4, Dev Agent Record, DoD do bloco A, Achados nº 7 e nº 8, Mapa de código renumerado, Change Log |

**Nenhum outro arquivo tocado.** Sem migration, sem DDL, sem escrita em banco — em nenhum ambiente.
*(O `git status` traz outros arquivos modificados — memórias de agente, `docs/backlog.md`, epics,
`87-5.story.md`: **são anteriores à minha sessão**, estavam sujos no worktree quando cheguei, e não
encostei em nenhum.)*

### Handoff

**→ @qa (rodada 2):** os quatro itens do gate estão fechados e **medidos**, não declarados —
**QA-1** (M2 = `2 failed`, e as outras oito contagens remedidas junto), **QA-2 + QA-3** (Achado nº 7
recontado para **três** guardas, e a da âncora ganhou vermelho de teste próprio, com controle de
atribuição), **QA-4** (cinco ponteiros de `pipeline.ts` corrigidos no docstring e nos comentários do
teste — o @qa cobrou três; conferindo, eram cinco). Réguas novas: **188 · 2418 passed · 6 expected
fail**, `tsc` **0/0**, lint **0 errors / 23 warnings**, `prompts:check` **verde**.
**Fora, por decisão sua e confirmada:** `agenda-state.test.ts` (item próprio, `W1-2d`), **bloco B**
(a premissa dos 27 leads caiu; o benefício real é o painel, 45 leads) e **QA-5** (do @pm).
**→ @devops:** PR do bloco A **a partir de `199a7a84`**, sem levar #427 nem #428 junto. Depois, marco
zero da janela de 24 h. **A descrição do PR não pode dizer "o campo passa a informar"** — tem de
dizer *"o campo deixa de ser constante"*.
**→ @data-engineer:** bloco B (T5–T7) só depois da janela — e **reconferir os 56 `id`**, que hoje
ainda são 56 (remedi).

## QA Results

**Gate:** `docs/qa/gates/87.12-handoff-le-fato-de-agenda-no-formato-novo.yml`
**Revisado por:** @qa (Quinn) · 2026-08-16 · rodada 1 · **escopo: BLOCO A apenas (AC1–AC7)**
**Base:** `origin/main` `199a7a84` · **Veredito: 🟡 CONCERNS — deploy do bloco A AUTORIZADO**

> Reproduzi tudo do zero: **16 mutações minhas**, sempre `npx vitest run` da **RAIZ**, na suíte
> inteira, cada uma aplicada, rodada, lida e revertida (`md5` conferido no fim). Somente `SELECT` em
> produção; nenhum DDL, em ambiente nenhum.

### Réguas — medidas por mim, não herdadas

| régua | baseline `origin/main` | com o diff |
|---|---|---|
| `npx vitest run` (raiz) | **188 · 2411 passed · 6 expected fail** | **188 · 2417 · 6** ✅ |
| `tsc --noEmit -p packages/ai` | 0 | **0** ✅ |
| `tsc --noEmit -p packages/web` | 0 | **0** ✅ |
| `npm run lint` | 0 errors / 23 warnings | **0 / 23** ✅ |
| `npm run prompts:check` | — | **verde** ✅ (gate permanente do epic 87) |

**Contenção dos PRs abertos: ✅ CONFIRMADA.** Cruzei `gh pr view --json files` com
`git diff --name-only origin/main`: **#427** toca `haiku-enrichment.ts` + `enrich-leads/route*`;
**#428** toca `chat/pipeline.ts` + `prompts/collected-data*`. **Interseção vazia** com os 3 arquivos
deste diff. `git merge-base HEAD origin/main` = `199a7a84`.

### As três coisas trazidas pelo @dev — todas confirmam

1. **A AC3-iv não vale como escrita — ✅ confirmado.** M3a (mutação literal) ⇒ **2417 passed, ZERO
   vermelhos**. `formatBoolean` mapeia qualquer string para `"nao informado"`: o fallback é
   indistinguível do acerto. A decomposição está certa e medida — **M3b (fallback depois) ⇒ 1
   vermelho**; **M3c (legado antes) ⇒ 2 vermelhos**, que é o texto da AC. **A conclusão da AC
   sobrevive inteira; só a forma da mutação estava errada.** Separar a anti-colinearidade num `it`
   próprio é o que faz as duas contagens distinguirem os dois casos — desenho correto, não estética.
2. **A guarda `origem !== "lead"` era órfã — ✅ confirmado NOS DOIS SENTIDOS.** Com o teste desta
   story: **1 vermelho** (`AC3 (fail-closed)`). Com a árvore de `origin/main` (sem os testes desta
   story): **2411 passed, ZERO vermelhos**. `agenda-state.test.ts:99` de fato não a alcança —
   `expira_em: "y"` ⇒ `Date.parse` → `NaN` ⇒ o TTL devolve `null` primeiro. **É o décimo caso da
   família.** E ele **subcontou**: a sub-expressão `!o.citacao.trim()` é órfã pelo mesmo mecanismo
   (medi: 0 vermelhos em `main`, 1 agora) — o `AC3 (fail-closed)` dele resgata **as duas**.
   `agenda-state.test.ts` **merece item próprio, sim** — e o corte dele (fora desta story, candidato
   ao `W1-2d`) está certo: T1 é uma palavra.
3. **O achatamento é CORREÇÃO NECESSÁRIA, não mudança fora de escopo — ✅ e ele sub-argumentou o
   próprio caso.** Medi a população **inteira** (sem o teto de 1.000 do PostgREST): **1.876**
   mensagens `role='user'`, **57 com quebra (3,04 %)**, **99 alteradas pelo achatamento (5,28 %)**,
   **0 com espaço nas bordas** (o `.trim()` é inerte hoje). E no denominador que importa —
   mensagens com token de dia/hora, que é o que vira `citacao` — são **9 de 110 = 8,18 %**, mais que
   o dobro do publicado. Reproduzi o modo de falha com mensagem **real** de produção
   (`"Esse mesmo \nvamos deixar pra segunda."`): sem o achatamento a linha rotulada de `INTERESSE:`
   parte em duas. **Pior caso que ele não mediu:** com `\n\n` (e existem em produção) entra uma
   **linha em branco DENTRO do bloco** — e a linha em branco é o separador de bloco deste formato:
   é **quebra estrutural**, e ela se propaga pelo `ai_summary` de volta ao prompt (Risco 3). É
   exatamente o *"resumo malformado"* do **gatilho (a) de rollback desta própria story**.
   **O par-ouro é robusto, não sorte:** `"Terça"` e `"3ª feira às 17:30"` não têm sequência de
   espaços nem bordas (conferido no valor de produção, não na fixture), e M6 deixa o par-ouro
   **verde** derrubando só o `it` multilinha — as duas provas são independentes por construção.

### Onde eu desconfiei

- **Linha 153 × 138:** ✅ deslocamento confirmado (`6b760887`, 87-5 A, mergeada depois do parecer do
  @po). A **T2 registra corretamente**. Mas o bloco *"O defeito, em uma linha"*, o §6 do Context e o
  **Mapa de código** ainda dizem `138`/`160-164` e `pipeline.ts:760/1223/1251/1513` (reais hoje:
  **821 / 1298 / 1326 / 1597**) — e o **epic aponta errado em 4 lugares**. Ver QA-4/QA-5.
- **Superfície pública:** ✅ **INALTERADA — asserção executada, não lida.** `flows/index.ts` com 0
  diff e lista nominal sem `parseAgendaState`; rodei um teste descartável afirmando
  `not.toContain("parseAgendaState")` nos dois barris (`src/index.ts` e `flows/index.ts`) — passou.
- **AC6:** ✅ refeito nas duas árvores com fixture própria ⇒ `com=70 · sem=50 · legado=70 ·
  origemNicole=50`, **idêntico**. **Acrescentei o controle que faltava:** matando `hasAgendaFact` o
  resultado vira `50/50/50/50` — **a régua discrimina, não está saturada**. E o corpo de
  `parseAgendaState` é byte a byte igual ao de `main` (só a palavra `export` mudou), então o score
  não tem como se mover.
- **Colinearidade da AC4:** ✅ as **duas direções** em `main` — remover `has_down_payment` (M4a) **ou**
  `visit_availability` (M4b) ⇒ **2411 passed, zero vermelhos** nas duas; com a asserção ancorada (M4)
  ⇒ **1 vermelho**.
- **Mock que aceite qualquer filtro:** 🟢 **classe não aplicável, verificado.** `grep` por
  `vi.mock|vi.fn|mockResolved|mockReturn` em `handoff.test.ts` e `agenda-state.test.ts` ⇒ **nenhum**.
  São funções puras; não há por onde um mock engolir predicado.
- **A rede da AC5 é viva:** provei em vez de assumir — injetei uma linha intrusa no bloco `INTERESSE:`
  e `pipeline-historico-cauda.test.ts > conversa curta: o resumo é byte a byte o do HEAD` **ficou
  vermelho**. Os dois arquivos-rede com **0 linhas de diff**.

### O carimbo que o gate tinha de dar

🟢 **O campo NÃO passa a informar; passa a PODER informar.** Confirmado em produção hoje: a Rita tem
`expira_em 2026-08-17` apontando para `data_absoluta 2026-08-18` — **o estado vence antes do dia que
ele indica** —, e `writeAgendaState(cd, null)` (`chat/pipeline.ts:1064`) apaga a chave justamente
quando a visita vira compromisso. `"nao informado"` seguirá sendo a saída na maioria dos handoffs
**e continuará sendo a saída certa na maioria delas** (8 de 9 casos com conteúdo eram fala da
Nicole). **E está escrito onde o próximo leitor tropeça:** no docstring de `formatDisponibilidade`,
bloco `⚠️ TETO DE VALOR` — no código, não num documento que ninguém reabre. Conferido.

### AC a AC

| AC | veredito |
|---|---|
| AC1 · AC2 · AC3 · AC4 · AC5 · AC6 · AC7 | ✅ **PASS**, cada um com mutação reproduzida por mim |
| AC8 | ⏳ pós-deploy. Baseline reconferido hoje: `nao_informado 14 · com_citacao 0 · sim 0`. **Nasce inconclusiva por desenho** |
| AC9–AC13 | ⛔ **bloco B, não avaliado** |

### Issues (nenhuma bloqueante)

| # | sev | o quê |
|---|---|---|
| **QA-1** | 🟠 medium | **A contagem da M2 está errada: são 2 vermelhos, não 1.** Cai também `citação MULTILINHA` (herda `data_absoluta` do `AGENDA_RITA`). Medi duas vezes. **A substância da AC2-iii sobrevive** — Ronaldo não cai. Mas é a **4ª rodada seguida do epic 87** com contagem de vermelho furada |
| **QA-2** | 🟡 low | **Achado nº 7 subconta:** são **≥2** guardas órfãs (`citacao` não-vazia + `origem`), não uma. Corre a favor do @dev |
| **QA-3** | 🟡 low | **Uma TERCEIRA guarda segue sem vermelho de teste:** remover a guarda de âncora deixa **2417 passed, zero vermelhos**. Quem pega é o `tsc` (2× TS2322) — pega a remoção, não um enfraquecimento. Importa aqui porque **`handoff` é o único chamador de `parseAgendaState` sem TTL a jusante**: provei que sem ela um estado sem âncora **imprime ao corretor** |
| **QA-4** | 🟡 low | 🔴 **Três referências de linha ERRADAS no docstring que vai a produção:** `chat/pipeline.ts:760` (real **821**), `:991` (real **1064**), `:738-741` (real **~800**). Erram por 60–73 linhas — a 87-5 A deslocou. **Corrigir antes do PR** (só comentário). Conferidas e corretas: `:955`, `:1047`, `qualification.ts:356`, `page.tsx:199-206` |
| **QA-5** | 🟡 low | O rótulo falso *"hotfix da W1-2b"* segue em 4 lugares do epic. @pm |

### Higiene

Árvore restaurada (`md5` dos 5 arquivos idêntico ao snapshot pré-QA); 4 arquivos de teste
descartáveis criados e removidos; `git status -- packages/` = exatamente os 3 do diff. **Nenhuma
escrita em banco, nenhum commit, nenhum push.**

**→ @dev:** QA-1, QA-2 e QA-4 (edições de texto/comentário) antes de o @devops abrir o PR.
**→ @devops:** PR a partir de `199a7a84`, **sem #427 nem #428**; marco zero da janela de 24 h.

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-16 | 0.5 | **Rodada 3 — Issue QA-6 fechada. `0` linhas de produção e `0` testes novos: são TRÊS fixtures, e a suíte fica em 188 / 2.418 / 6, idêntica ao baseline.** `md5` conferido antes e depois das sete sondas — `agenda-state.ts` `b0650ba4…`, `handoff.ts` `358f0bc1…`, `chat/pipeline.ts` `e4f3df64…`; `agenda-state.test.ts` **não tocado** (item `W1-2d`). **🔴 O @qa está certo e o defeito é o mesmo de sempre, uma casa mais fundo: eu dei vermelho à LINHA da âncora e ela é uma DISJUNÇÃO** — `typeof o.ancorado_em !== "string" || typeof o.expira_em !== "string"` —, e as duas fixtures do meu `it` novo (`semAncora`, sem nenhuma das chaves; `ancoraNaoString`, com as duas numéricas) faziam **A e B verdadeiros ao mesmo tempo**. Cada metade se escondia atrás da outra: a fixture **acende** a guarda e **não mede** nenhum dos dois ramos. É a mesma classe do `truncar()` que eu acabei de consertar na 87-11 — lá uma constante compartilhada acendia três sítios, aqui uma disjunção acende dois. **Reproduzi ANTES de consertar**, contra o `HEAD` desta branch, enfraquecendo uma sub-expressão de cada vez: `194a` (tipo da `citacao`) **ZERO**, `194b` **1**, `195` **1**, `196a` (`ancorado_em`) **ZERO**, `196b` (`expira_em`) **ZERO** — e **`tsc` 0 errors nas cinco**, que é exatamente o ponto: o compilador pega a REMOÇÃO (`TS2322`), não o enfraquecimento. **Bate com a contagem do @qa ao número — 6 sub-expressões, 3 com vermelho próprio:** as seis são essas cinco mais a guarda de forma de `data_absoluta`, e as três já cobertas eram `194b`, `195` e a metade do **regex** de `data_absoluta` (medida: 1 vermelho). A outra metade daquela guarda é pega pelo **`tsc`** (1 erro) e fica **declarada** como tal, não contada como vermelho. **Conserto — três fixtures que isolam UMA sub-expressão cada, mantendo íntegro o que a outra metade exige:** `citacaoNaoString` (`citacao: 15` — existe e é não-vazia, só o TIPO está errado) · `soAncoradoInvalido` (**`expira_em` continua string válida**) · `soExpiraInvalido` (**`ancorado_em` continua string válida**). **Vermelhos medidos depois: as três sondas que davam ZERO passam a dar 1** (`1 failed | 2417 passed | 6 expected fail`), e caem em **asserções DIFERENTES do mesmo `it`** — a discriminação está medida, com o `Received` de cada uma colado no Dev Agent Record. O dano é concreto: sem `196b` o corretor recebe um estado **sem validade legível** (é o que o @qa provou, e `handoff` é o único chamador de `parseAgendaState` sem TTL a jusante para desmentir); sem `194a` o resumo imprime **`"15"`** entre aspas como se fosse fala do lead — e isso não é laboratório, `collected_data` é `jsonb` livre e a mensagem que mais vira `citacao` é justamente a que começa com número de dia. **Declarado, para ninguém contar órfão a mais nem a menos:** `semAncora` **não isola** (fere as duas metades) e **fica** no `it` porque é o caso REAL — estado gravado sem âncora nenhuma —, rotulado como não-isolante no próprio arquivo; contá-lo como terceiro vermelho seria contar errado. E **`!raw || typeof raw !== "object" || Array.isArray(raw)` é MUTANTE EQUIVALENTE, agora com o porquê medido:** enfraquecê-la dá 0 vermelhos com `tsc` limpo, mas não é órfã — qualquer `raw` não-objeto chega em `o.citacao === undefined` e é barrado por **`194a`**; ou seja, a equivalência **depende da metade que esta rodada acabou de cobrir**. **Réguas:** suíte **188 / 2.418 passed / 6 expected fail** (= baseline, nenhum `it` novo); `tsc --noEmit` **0** em `packages/ai` e **0** em `packages/web`; lint **0 errors / 23 warnings**; `git status -- packages/` = **um único arquivo**, `handoff.test.ts`. **Fora de escopo por instrução:** `agenda-state.test.ts` (`W1-2d`), o **bloco B** e a **QA-5** (do @pm) seguem intocados. Sem push, sem PR, sem banco. | @dev (Dex) |
| 2026-08-16 | 0.4 | **Rodada 2 — os quatro itens do gate CONCERNS fechados, todos medidos.** Nenhuma linha de comportamento mudou: o diff continua sendo os mesmos 3 arquivos, e o único código novo é um `it` de teste. **(1) QA-1 — a contagem da M2 estava errada e eu remedi TODAS, não só a cobrada.** A M2 (`data_absoluta ? … : ""` → `""` fixo) derruba **2 failed** — `AC2-(i) par-ouro/Rita` **e** `citação MULTILINHA`, que herda `data_absoluta` do `AGENDA_RITA` e afirma a linha inteira com `toBe`. Publiquei `1`. **A substância da AC2-iii sobrevive** (o assimétrico é Rita cai × Ronaldo NÃO cai, e o Ronaldo segue verde), mas é a 4ª rodada seguida do epic com contagem furada — então remedi as nove da rodada 1 contra a árvore final, com harness que confere `md5` no fim (**IGUAL** nos 5 arquivos mutáveis): as outras oito bateram. **(2) QA-2 + QA-3 — o Achado nº 7 subcontava por um fator de três.** São **TRÊS** guardas de forma órfãs em `parseAgendaState`, não uma, e o mecanismo é único: a fixture de `agenda-state.test.ts:99` entra por `readAgendaState` com `expira_em: "y"`, o `Date.parse` vira `NaN` e o TTL devolve `null` **antes** de qualquer guarda rodar — a fixture **toca** as três linhas e não **mede** nenhuma. Medi cada uma nos dois sentidos: `:181` `citacao` não-vazia (**0** vermelhos em `main` × **1** agora), `:182` `origem === "lead"` (**0** × **1**), `:183` âncora (**0** × **1**). A terceira **continuava órfã mesmo depois da rodada 1** — removê-la deixava 2417 passed, zero vermelhos, e quem pegava era só o `tsc`. **Dei vermelho de teste a ela**: `AC3 (fail-closed/ÂNCORA)` em `handoff.test.ts`, cobrindo âncora **ausente** e âncora com **tipo errado** (o segundo modo o `tsc` não pegaria — o compilador pega a remoção, não um enfraquecimento que ainda devolvesse `string`). Importa aqui mais que em qualquer outro consumidor porque **`handoff` é o único chamador de `parseAgendaState` sem TTL a jusante**. E o vermelho é **atribuído**: o controle `M7-sem-o-it-novo` (remover a guarda **e** o `it` novo) dá **2417 passed, zero vermelhos** — o vermelho vem do teste que escrevi agora e de nada mais. **(3) QA-4 — os ponteiros do docstring que vai a produção.** Peguei o deslocamento da `87-5 A` (#426) no arquivo que eu editava (138 → 153) e **não** nos que eu citava. O @qa cobrou três; conferindo um a um por `awk` sobre `git show origin/main:<path>`, **eram cinco**: `760`→**821**, `991`→**1064**, `738-741`→**799-803**, e mais `1223`→**1298** e `1251`→**1326**, que ninguém tinha cobrado. Corrigidos no docstring **e** nos comentários do `handoff.test.ts`. Também renumerei o **Mapa de código** das Dev Notes com uma coluna `era` ao lado, para a renumeração ser auditável, e ajustei `pipeline.ts:955`/`:1047` para **958**/**1048** (o @qa as deu por corretas — elas apontam para o `buildAgendaState({` que abre a chamada; a linha do `citacao:` é 1 e 3 abaixo. Divergência declarada). **(4) A defesa do achatamento estava fraca, e o desvio estava certo.** O 3,5 % que publiquei era de sub-amostra de ordem física e do denominador errado. População **inteira**: **1.877** mensagens `role='user'`, **99 alteradas = 5,3 %**, **0 com espaço nas bordas** (o `.trim()` é inerte hoje). E o denominador que importa é a mensagem que **vira `citacao`** — com token de dia/hora: **3/45 = 6,7 %** na régua estreita (as `dayKeywords` literais do código) e **10/103 = 9,7 %** na larga; o @qa mediu **9/110 = 8,2 %** com uma terceira. Publico o **intervalo 6,7–9,7 %** e as três réguas, não a que me favorece — e registro que a estreita **perde a citação real da Rita** (`"Terça"` isolado não casa com `"terça-feira"`), que é por isso que ela não pode ser a única. **O pior caso, que eu não tinha medido:** com `\n\n` na citação entra uma **linha em branco DENTRO do bloco `INTERESSE:`** — e a linha em branco é o **separador de bloco** deste formato. Reproduzi com a M6 e uma mensagem real de produção: o bloco fecha no meio e o resto da citação vira **bloco órfão sem cabeçalho**. Não é linha a mais, é **quebra estrutural**, e ela **se propaga** — o `ai_summary` volta ao prompt da Nicole (`memory/loader.ts:196-203`, Risco 3). Existem em produção: 17 das 1.877 têm linha em branco, 2 dentro da régua larga. **Réguas da rodada 2:** `origin/main` **188 · 2411 · 6** (remedido pelo mesmo harness) → entregue **188 · 2418 passed · 6 expected fail** (+7 `it`); `tsc --noEmit` **0** em `packages/ai` e **0** em `packages/web`; lint **0 errors / 23 warnings**; `prompts:check` **verde**. Produção lida **somente com `SELECT`**; nenhum `INSERT`/`UPDATE`/DDL, em ambiente nenhum; sem commit, sem push, sem PR. **Bloco B, `agenda-state.test.ts` e a Issue QA-5 seguem fora por decisão do gate.** | @dev (Dex) |
| 2026-08-16 | 0.3 | **Bloco A implementado. `Ready` → `InReview (bloco A)`.** Branch criada de `origin/main` (`199a7a84`) — **nada dos PRs #427/#428 entrou**. Baseline medido por mim antes de tocar em código e reproduzido exatamente: **188 arquivos · 2411 passed · 6 expected fail**; depois do diff, **2417 passed** (+6 testes), `tsc` **0** em `packages/ai` e em `packages/web`, lint **0 errors / 23 warnings**. Reconferi produção **somente com `SELECT`** em 16/08: `visit_availability` **56/56 string, 0 boolean**, `agenda_state` em **2** linhas, e a fixture negativa da E3 tem os **104 ch** exatos (a variante do Luiz tem 110). **As duas fixtures do par-ouro saíram do banco byte a byte, com os ISO completos que a story não trazia** — e elas confirmam a E5 no dado: a Rita **`expira_em 17/08` apontando para `data_absoluta 18/08`**. **Oito mutações aplicadas, rodadas, lidas e revertidas**, sempre na suíte inteira da raiz. Duas viraram notícia: **(1) a AC3-iv não vale como escrita** — a mutação literal (`?? formatBoolean(visit_availability)`) derruba **ZERO** testes, porque `formatBoolean` mapeia qualquer string para `"nao informado"` e fica indistinguível do acerto; substituí por duas mutações decompostas (fallback-depois ⇒ só a negativa cai; legado-antes ⇒ **caem as duas**, que é o texto da AC), e **separei a anti-colinearidade num `it` próprio** para que a contagem distinga os dois casos; **(2) a guarda `origem !== "lead"` de `parseAgendaState` era órfã** — o caso de `agenda-state.test.ts:99` passa por `readAgendaState` e o `expira_em: "y"` faz o TTL devolver `null` primeiro, então remover a guarda deixava tudo verde; o `AC3 (fail-closed)` desta story é o primeiro vermelho que ela tem (**Achado nº 7**, não consertado aqui). Confirmei a cegueira da AC4 **nas duas direções** em `main` (remover `has_down_payment` **ou** `visit_availability` ⇒ 2411 passed, zero vermelhos) e o par que fecha o argumento: a mesma mutação fica **vermelha** com a asserção ancorada. **AC6 medido, não afirmado**: mesma fixture rodada nas duas árvores ⇒ `70 / 50 / 70` idêntico, com delta de 20 pontos visível (poder discriminante). **Um desvio deliberado do desenho literal do §1, com o número na frente:** a `citacao` é achatada em uma linha, porque ela é a mensagem **crua** do lead (`citacao: message` nos três escritores) e **3,5 % das mensagens `role='user'` têm quebra de linha** (35 de 1.000 lidas) — uma citação multilinha parte um campo rotulado do bloco `INTERESSE:` e produz o "resumo malformado" que é o gatilho (a) de rollback **desta própria story**; vermelho dedicado (M6), e o par-ouro segue byte a byte. **Achado nº 8**: o bloco `MENSAGENS DO LEAD` já tolera quebras hoje — anterior à story, não tocado. `pipeline-historico-cauda.test.ts` e `config-surfaces.test.ts` com **0 linhas de diff** e verdes. **Bloco B (T5–T7) não iniciado**; sem migration, sem DDL, sem escrita em banco, sem commit e sem push. | @dev (Dex) |
| 2026-08-15 | 0.2 | **Validação @po (Pax) — GO, `Draft` → `Ready`, com 6 emendas aplicadas por mim** (parecer completo em `docs/qa/po-validation-87-12.md`). Reconferi contra produção e contra `HEAD` `24800872`, e **os números centrais do @sm sobrevivem todos**: 56/56 string · 14 handoffs / 14 `nao informado` / 0 `sim` · 44 × 12 (`> 60 ch`) · 45/3/8 (procedência) · 37 estados em 7 d com **0** legado · `NICOLE_AGENDA_STATE_LEGADO_DESCARTADO` = 0 all-time · último contaminado **06/08** · **27** caem de `qualified` e **10** para `cold` (reproduzi o score em SQL) · os **56 `id`** batem com produção **conjunto a conjunto** · fixtures da Rita e do Ronaldo **byte a byte** · `tsc` baseline = 0. **Executei a mutação da AC4**: removi `has_down_payment` da fixture de `handoff.test.ts:158-190` e a suíte deu **23/23 verde** — a colinearidade é real e é a razão mecânica dos 4 meses de silêncio (arquivo restaurado, `md5 f568e911e7e81e36230cc36dafea9430`). Emendas: **E1** a tabela do §5 classificava os MESMOS dois valores (Valnira/Marlene) de duas formas incompatíveis — fui às mensagens: nenhum dos dois casa com `role='user'`, e a conclusão "nenhuma régua serve" sai **reforçada**; **E2** o crosstab dos 14 handoffs é **5/8/1**, não 6/7/1 (faltou o André) — direção inalterada; **E3** a fixture negativa da AC3 é da lead **Kharina** (104 ch), não do Luiz — o Luiz dos handoffs não tem `visit_availability`; **E4** 🔴 **os 27 leads NÃO caem na migration** — a AC13 proíbe tocar `leads`, os dois escritores de `qualification_status` exigem conversa recente, e a população é dormente por construção (é o próprio §6): Risco 2 cai de *"Alta (é certa)"* para **latente**, a AC12 passa a rotular 27/10 como `projecao_*` + `leads_reescritos: 0`, e o benefício real e imediato do bloco B é o **painel** (45 leads), não o score; **E5** declarado o **teto de valor** — TTL de 48 h (a fixture da Rita **vence antes** do dia que ela aponta) + `writeAgendaState(cd, null)` limpar o estado quando a visita é agendada ⇒ `"nao informado"` seguirá sendo a saída na maioria dos handoffs; **E6** 🔴 **story sai da posição 0** — duas das quatro pernas do meu próprio §9 de 10/08 morreram quando o @sm provou que **não é regressão**. Nova fila: `87-5 A` → `87-5 B` → `87-11` → `87-12 A` → `87-10` → `87-12 B`. Achados nº 5 e nº 6 acrescentados. | @po (Pax) |
| 2026-08-15 | 0.1 | Criação. Story aberta pelo @po em 10/08 (§9 de `po-validation-87-10-87-11.md`) e nunca escrita — o epic apontava para arquivo inexistente. **Medições próprias contra produção em 15/08, `HEAD` `24800872`.** Achados que mudam a redação recebida: **(1)** o defeito **não é regressão da `87-4`** — `git blame` põe a linha em 31/03/2026, commit inicial (§ Correção de registro); **(2)** o dano retrospectivo é **1 caso limítrofe em 14 handoffs**, e em **7 de 14** o `"nao informado"` foi acidentalmente a saída certa — um conserto ingênuo teria piorado o resumo (§2 do Context); **(3)** as **duas** réguas candidatas para separar "fala da Nicole" de "disponibilidade real" foram **contadas e reprovadas** — a de comprimento erra 3, a de procedência apaga justamente os dois valores que o briefing cita como reais (§5 do Context). **A story não propõe régua nenhuma:** o legado deixa de ser lido (ele nem chega à função — `pipeline.ts:760` o apaga antes do `finalData`) e o formato novo carrega a procedência **no tipo** (`origem: 'lead'`, `87-4`); **(4)** o bloco B **não classifica linha nenhuma** — aplica a regra que a `87-4` já escreveu, à população que o runtime dela não alcança (`NICOLE_AGENDA_STATE_LEGADO_DESCARTADO` = **0 all-time**, 7 dias após o deploy). Custo medido: **27 leads** caem de `qualified` — **o mesmo número que a `87-4` publicou em `pipeline.ts:751-757`**, reproduzido independentemente; **(5)** encontrada a razão mecânica de o defeito ter sobrevivido 4 meses: a fixture de `handoff.test.ts:158-190` é **colinear** (`has_down_payment: true` **e** `visit_availability: true`, um único `toContain("sim")`) e usa um booleano que **produção nunca produziu** — AC4 a desfaz. Divergência de medição registrada com método: último contaminado **06/08** (medido) × **05/08** (briefing); 44 (`> 60 ch`) × 45 (procedência) linhas contaminadas. | @sm (River) |
