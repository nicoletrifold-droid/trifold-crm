# Parecer de validação — Story 87-13

**Story:** `docs/stories/87-13-switch-por-empreendimento-do-que-a-nicole-fala.story.md`
**Validador:** @po (Pax) · **Data:** 2026-08-11
**Veredito:** 🟢 **GO — 10/10 após emendas** · `Draft` → **`Ready`**
**Base:** `main` em `309f94e2` (6 commits novos desde a criação da story)
**Método:** todas as medições são minhas, contra produção (`dsopqkqjkmhytudaaolv`, Management API,
somente `SELECT`) e contra a `main` de 11/08. Consulta ou caminho ao lado de cada número.

---

## Sumário

A story é boa. É a mais bem instrumentada que li deste epic: o defeito está em uma linha, a
correção também, os três consumidores da lista compartilham a origem, e o @sm fez a coisa que
importa — **checou a premissa do briefing e a derrubou** (a inclusão de Japurá/Solum foi decisão
explícita da 75-281, não esquecimento). O desenho de "cadastrar não basta" está certo, o default
desligado está certo, e a ordem de deploy de 4 passos é o miolo e está medida.

**Não é por isso que ela precisava de validação.** Rodei as ACs contra produção em vez de lê-las, e
**quatro delas não faziam o que dizem fazer**: uma é não-determinística, duas devolvem 404 no passo
em que foram colocadas, e a janela de observação mede duas coisas que ficam em zero **quer a story
suba, quer não**. Mais: **um gatilho de rollback já está disparado hoje, sem deploy nenhum.** E a
numeração das migrations envelheceu na mesma noite em que a story nasceu.

Nada disso é defeito de concepção — é o que acontece quando um artefato bom passa 24 h parado num
repositório que anda. Todas as 10 correções estão aplicadas no corpo da story.

---

## 1. As 4 decisões

### Decisão 1 — `B2` (`total_units > 0`): **AVISA**. O `B1` continua bloqueando.

**Aceito o mecanismo, recuso o critério.** O bloqueio fica inteiro: servidor, `fail-closed`, sem
override, lista `missing` item a item, só na transição `false → true`. O que sai é o `B2`.

O @sm pediu atenção neste item e a recomendação dele era **bloquear**. O argumento que ele usou é
local, é forte, e eu o aceito: *esta é a casa que precisou escrever `config-surfaces.test.ts`
porque 5 controles editáveis não faziam nada e ninguém sabia; um aviso descartável é o mesmo
objeto.* Correto. **Só que esse argumento justifica bloquear como mecanismo — ele não escolhe qual
critério bloqueia.** Isso é medição.

**(a) O `B2` não separa nenhuma linha que existe.** Medido em 11/08:

| | tipologias (`B1`) | `total_units` (`B2`) | quem barra |
|---|---|---|---|
| Vind Residence | 1 | 48 | — |
| Yarden | 2 | 60 | — |
| Japura | **0** | `null` | **B1** (e B2) |
| Solum | **0** | `null` | **B1** (e B2) |

Nenhuma linha falha o `B2` e passa o `B1`. **Poder discriminante zero** sobre o cadastro real: tudo
que ele barra, o `B1` já barrou. Todo o efeito do `B2` é sobre linhas futuras.

**(b) E a única linha futura plausível é o falso positivo que o próprio @sm nomeou.** O caso que só
o `B2` barraria é *tipologias definidas, contagem de unidades ainda não* — que é literalmente o
pré-lançamento legítimo do **Risco 4** da story. Um critério cujo único cenário vivo é o risco que
ele carrega não é proteção; é custo.

**(c) O `B2` falha a regra de desenho da própria story.** A regra é: **bloqueia o que quebra, avisa
o que empobrece.** Li os quatro ramos de estoque (`packages/ai/src/chat/pipeline.ts:2128-2143`):

```ts
const totalU = p.total_units ?? 0
…
if (totalU > 0 && availU === 0 && !isPreLaunch)      { … }   // ramo 1
else if (totalU > 0 && !isPreLaunch && pctSold >= T) { … }   // ramo 2
else if (totalU > 0)                                 { … }   // ramo 3
else if (availU > 0)                                 { … }   // ramo 4
```

Com `total_units` nulo **e** `available_units = 0`, **nenhum ramo emite** — o contexto simplesmente
**omite** a linha de estoque. Isso é **omissão, não afirmação falsa**: é o critério exato que o @sm
usou para pôr `A1` (mídia) e `A2` (endereço `"A definir"`) em "avisa". Coerência interna manda o
`B2` para o mesmo lugar. E tem mais: o **ramo 4** *emite* `"restam apenas N"` quando `total_units`
é nulo mas há unidades cadastradas — o `B2` barraria até um pré-lançamento que já produz
informação de estoque útil.

O `B1` é de outra classe e por isso fica: sem tipologia não há metragem nem `bedrooms`, e
`bedrooms` é o **2º passo** do funil. O empreendimento entraria e **não poderia ser qualificado** —
quebra funcional, não pobreza.

**Consequência no diff:** `B2` sai da constante de bloqueios e entra na de avisos. AC6-(i) passa a
esperar `missing: ["tipologias"]` (**um item, não dois**, e com asserção de lista exata, não
`toContain`). AC7 ganha asserção de comprimento **1** e um vermelho novo: promover `B2` a bloqueio
⇒ o pré-lançamento legítimo recebe 422 onde deve receber 200 + aviso.

### Decisão 2 — **`IMOVEIS_CREATE_ROLES`**. Aceita, e a medição a reforça.

A recomendação está certa: decidir o que a IA fala com um lead pago não é atribuição do perfil de
obras, e usa constante existente em vez de inventar papel.

**Correção de fato que a story tinha errada.** Ela diz que `IMOVEIS_EDIT_ROLES` é
*admin/supervisor/obras*. São **quatro** (`packages/web/src/lib/permissions-imoveis.ts:13`):

```ts
export const IMOVEIS_EDIT_ROLES = ["admin", "supervisor", "obras", "gerente-relacionamento"]
export const IMOVEIS_CREATE_ROLES = ["admin", "supervisor"]
```

O delta não é um papel, são **dois** — e `gerente-relacionamento` não estava nomeado em lugar
nenhum da story. **Tamanho medido em produção:** perdem o controle **3 pessoas ativas** (`obras` 2,
`gerente-relacionamento` 1); mantêm **9** (`admin` 5, `supervisor` 4). Restrição pequena, nominal e
reversível num commit. O comentário de `route.ts:37` (*"admin/supervisor/obras"*) também está
errado desde a 72-1 e entra no diff.

### Decisão 3 — **AC6–AC8 ficam na Onda 1.**

O contra-argumento que me foi passado é que bloquear é caminho de decisão novo e a regra de corte
proíbe isso na fase inicial. **Fui ao texto do epic.** Linha 400-401:

> **Regra de corte da Onda 1:** nenhuma story pode adicionar um **novo caminho de decisão** da
> Nicole.

A regra é **escopada à Nicole**. O bloqueio é validação de servidor numa rota de admin: não roda no
turno dela, não toca contexto, não toca prompt. Não atravessa o corte. O que ele aciona é a
**legenda de risco de dois eixos** (§7 do epic) — que é uma exigência de **rotulagem**, não uma
proibição, e o cabeçalho da story já vem em `regressão / comportamento novo`.

Com o `B2` rebaixado, o eixo "comportamento novo" **cai de Médio para Baixo**: o único critério
bloqueante restante é `count(typologies) = 0`, que nenhum empreendimento que alguém queira ligar
satisfaz hoje.

E o argumento decisivo é o inverso do que a pergunta sugere: **cortar o bloco faria o toggle subir
sem guarda nenhuma**, e a tese da story (*"cadastrar não basta; alguém liga"*) passaria a depender
de quem clica — que é precisamente a classe de proteção que esta story existe para substituir.

### Decisão 4 — `W1-8`: pedido registrado ao @pm.

O @sm repôs a entrada em `stories_planned`; a **tabela da Onda 1, no corpo do epic, não tem a
linha** — e é a tabela que governa fila de deploy, esforço, risco e dependência. A linha proposta
está escrita na story (§ Decisões do @po), já com esforço e o risco de dois eixos preenchidos.
Junto vão dois ajustes de manutenção: o **`R-G`** ainda diz "migration 215" (é a terceira story
seguida a corrigir isso), e o **Achado nº 7** precisa de item próprio.

---

## 2. As 10 correções obrigatórias — todas medidas, todas aplicadas

### C1 🔴 Migrations **218/219 → 223/224**

Conferi eu mesmo, como pedido. `supabase/migrations/` na `main` de 11/08:

```
217_leads_qualificacao_comercial.sql    ← consumido pela 84-1
218_system_events_dedupe_nicole.sql     ← consumido pela 87-6 (PR #383, mergeado 10/08, 24932de3)
219                                     ← REIVINDICADO pela 87-1 (`Ready`), linha 285 e DoD (">= 219")
```

A story dizia *"o maior prefixo local é 217"*. Era verdade quando ela foi escrita e deixou de ser
**na mesma noite**. ⇒ **223** e **224**. `git log --all` não tem nenhum arquivo `219_`, `223_` nem
`224_` em branch alguma — o 219 está reservado, não escrito.

**Nota de mecanismo, para isto parar de doer.** O prefixo `NNN_` é convenção **só do repositório**:
em produção, `supabase_migrations.schema_migrations` versiona por **timestamp** (maior valor hoje:
`20260710171933`). Não há colisão do lado do banco — ela é 100% de arquivo, e é por isso que
reaparece toda vez que duas stories ficam em `Ready` ao mesmo tempo. Regra operacional escrita na
story: o @dev crava 223/224 agora, o **@devops reconfere e renumera na abertura do PR**, como já fez
na 87-6 e na 84-1.

### C2 🔴 AC6-(i) e AC8 não eram verificáveis no passo em que estavam

Medido em `packages/web/src/app/api/properties/[id]/route.ts`: **tanto o `GET` (`:20`) quanto a
cadeia do `UPDATE` do `PATCH` (`:96`) carregam `.eq("is_active", true)`.** Enquanto Japurá e Solum
estiverem `is_active = false` — ou seja, do passo 1 ao passo 4 —, um `PATCH` sobre eles devolve
**404, não 422**: a linha nem chega à validação. Quem fosse conferir a AC6 contra produção no gate
leria o 404 como defeito da implementação.

Mesma coisa na AC8: `/dashboard/properties` filtra `.eq("is_active", true)`
(`page.tsx:15`), então o badge "nos 4" é **impossível** no passo 2 — são **2**. A conferência dos 4
já existe e é a **AC9-(i)**, depois da 224.

Correções: AC6 é verificada em **teste de rota com fixture `is_active: true`** (que é o que a T5 já
manda), nunca por chamada ad-hoc a produção antes do passo 4; AC8 verifica os 2 visíveis e delega
os 4 à AC9.

### C3 🔴 O gatilho de rollback nº 2 **já está disparado hoje, sem deploy nenhum**

O gatilho diz: *"`PROPERTY_IDENTIFIED` cair a zero para Vind **ou Yarden** em 24 h com tráfego"*.
Medido, `PROPERTY_IDENTIFIED` por dia:

| dia | Vind | Yarden | turnos no dia |
|---|---|---|---|
| 11/08 | 1 | **0** | 2 |
| 10/08 | 7 | **0** | 31 |
| 09/08 | 4 | **0** | 8 |
| 08/08 | 2 | **0** | 4 |
| 07/08 | 1 | 10 | 22 |
| 06/08 | 1 | 9 | 24 |

O último `PROPERTY_IDENTIFIED` do **Yarden** é de **07/08**. Quatro dias em zero, com tráfego nos
quatro. **Aplicado à letra, o gatilho mandaria reverter no primeiro dia por um baseline que
antecede a story.**

O Yarden é bursty (22 all-time, em duas rajadas). O **Vind** é o sinal contínuo: **104 all-time**,
não-zero em **14 dos últimos 15 dias**, mediana ≈ 3/dia. Gatilho corrigido para
**`PROPERTY_IDENTIFIED` do Vind = 0 em 24 h com ≥ 10 turnos**; o Yarden sai da contagem e vira
leitura dirigida.

### C4 🔴 A janela (AC11) media duas réguas **saturadas**

Medido: menções a `japur`/`solum`/`solun` em `messages` com `role='assistant'` = **0 em 1.250
mensagens all-time**. `PROPERTY_IDENTIFIED` para os dois: **ausente all-time**. E o paliativo já os
tirou do contexto desde 10/08 13:45.

Portanto os itens 1 e 2 da AC11 **continuam em 0 quer a story suba, quer não** — eles não
distinguem sucesso de nada-feito. Não são inúteis (são controle negativo: sabem dizer "piorou"),
mas **não podem ser lidos como confirmação de que o switch funciona**. A prova do switch é
AC3/AC4/AC5, em teste; **a janela é vigilância de regressão, e só.** Reordenada e rotulada.

E o piso de inconclusividade ganhou denominador, porque um piso sem denominador é decorativo.
`CLAUDE_RESPONSE` por dia, últimos 11 dias: `3 · 2 · 38 · 11 · 16 · 24 · 22 · 4 · 8 · 31 · 2` —
mediana **11**, faixa **2–38**. **3 dos 11 dias teriam caído abaixo do piso de `n < 5`.** Estender
24 h é o caso esperado, não a exceção; registrar o `n` observado junto do veredito, sempre.

### C5 🔴 AC1 era não-determinística

Japurá e Solum foram criados na mesma transação e têm `created_at` **idêntico ao microssegundo**:
`2026-08-06 20:24:44.85984+00`. `order by created_at` **não garante** ordem entre as duas linhas — e
a própria story as lista em ordens opostas (o §2 do Context põe Japura antes; a AC1 punha Solum
antes). Um gate honesto acusaria vermelho por ordenação. ⇒ `order by created_at, name`.

*Conferido também, e passa:* `is_active` hoje devolve `column_default = 'true'` e
`is_nullable = 'NO'` — o formato esperado da AC1 está certo. E `nicole_enabled` **não existe** em
`information_schema.columns`, logo a AC nasce vermelha de verdade.

### C6 🔴 Migration 224 e SQL de rollback passam a casar por **`id`**

A story exige backfill "por `id` nomeado, nunca fórmula" na 223 — e usa `where slug in
('japura','solun')` na 224 e no rollback. Slug não é fórmula, mas é o identificador que o **Achado
nº 1 da própria story propõe corrigir** (`solun` → `solum`). Se alguém corrigir o slug, a 224 e o
rollback afetam **0 linhas, em silêncio** — o mesmo modo de falha mudo que a story inteira existe
para atacar. ids medidos e colados na story:
Japura `fcbd2a01-7c59-48b0-8e88-f5a68f4970cd` · Solum `5694ecf1-eb53-4d9e-bb82-4c06f0b19690`.
E a guarda de "exatamente 2 linhas" passa a valer para a 224 também.

### C7 Fronteira do rollback do passo 1

`drop column` só é rollback **antes** do passo 2. Com o código no ar, derrubar a coluna reproduz
**exatamente** a catástrofe muda do Risco 1: erro do PostgREST ⇒ `if (error || !data) return []`
(`pipeline.ts:1847`) ⇒ a Nicole perde **todos** os empreendimentos, sem log. A tabela de 4 passos
dizia "`drop column`" sem essa fronteira. Uma linha, e ela é a diferença entre um rollback e um
incidente.

### C8 AC5 **altera** o desenho do `config-surfaces.test.ts` — a story dizia que não

Conferido no arquivo: o tipo `Prova` é união de **dois** membros (`:129-140`) e `executarProva` é um
**ternário síncrono** (`:317-321`). Uma prova `comportamental` exige terceiro membro, terceiro ramo
e **assincronia** (`loadProperties` é `async`; o callback do `it()` é síncrono hoje). São ~15
linhas, no arquivo do qual a 87-0 é dona. Não é bloqueio — mas a linha das *Fronteiras* que dizia
*"acrescenta entrada e não altera o desenho"* estava errada e foi corrigida.

*Duas boas notícias, também conferidas:* a mensagem exigida pela AC5-(iv) é **literalmente o
template atual** (`` `${superficie.id} não tem consumidor no runtime.` ``, `:344`); e o caso
*"nenhuma superfície editável ficou de fora do registro"* enumera das três fontes e **filtra contra**
`registradas` (`:453-460`) — acrescentar um id não o quebra. AC5-(iii) está garantida por asserção
explícita: `expect(doRegistro).toHaveLength(5)` (`:372`).

### C9 Dev Notes: o `fake-supabase` **não** tem "slot `properties: []`"

A palavra `properties` **não aparece no arquivo**. O que existe é melhor:
`createFakeSupabase(seed: Record<string, Row[]> = {})` (`:236`) é um mapa genérico por nome de
tabela, e a tabela nasce vazia sob demanda (`rows()`). Passar `{ properties: [...] }` funciona — mas
a frase "já tem slot" manda o @dev procurar algo que não existe.

### C10 AC7 ganhou asserção de comprimento e o vermelho da decisão 1

`expect(BLOQUEIOS.length).toBe(1)`, não `toBeGreaterThan(0)` — senão a decisão de produto pode ser
desfeita por acidente num rebase, sem nada ficar vermelho.

---

## 3. O que eu conferi e **passou** — e isso importa tanto quanto o resto

| Afirmação da story | Verificação | Resultado |
|---|---|---|
| Backfill: Vind `…0004-…0001`, Yarden `…0004-…0002` | `select id,name,slug from properties` | ✅ **corretos**, e batem com o `metadata->>'property_id'` dos 126 eventos `PROPERTY_IDENTIFIED` |
| AC2: `POST /api/properties` ignora `nicole_enabled` **por construção** | `route.ts:63-84` | ✅ o `INSERT` tem lista explícita de campos; o campo não tem por onde entrar |
| 6 testes da 75-281 em `property-data-context.test.ts` | contagem no `describe` da 75-281 | ✅ **6** (`:108,114,122,128,137,145`) |
| `ORFAS_CONHECIDAS` continua em 5 | `config-surfaces.test.ts:255-261` e `:372` | ✅ 5, com asserção explícita |
| 47 call sites de `from("properties")` | varredura na `main` | ✅ **47**; e os 5 SELECT sem filtro listados estão corretos (os outros 2 "sem" da minha varredura grosseira são o `INSERT` e o `UPDATE` de `available_units`, já contabilizados pelo @sm) |
| `is_active` é o soft delete | `api-utils.ts:29-49` ← `DELETE /api/properties/[id]` | ✅ |
| 3 consumidores compartilham `loadProperties` | `pipeline.ts:537` (única chamada), `:539`, `:552`, `:625` | ✅ chamada única, três consumidores |
| `loadProperties` não é exportado | `pipeline.ts:1830` | ✅ `async function` sem `export` — a 1 linha da AC5 é real |
| `if (error \|\| !data) return []` | `pipeline.ts:1845-1847` | ✅ a falha muda existe e justifica a ordem |
| Nenhum escritor ressuscita `is_active` | 3 writers: `POST` (insert `true`, linha nova), `PATCH` (`.eq("is_active",true)`), `imoveis-sync:180` (só `available_units`) | ✅ o paliativo não é desfeito por webhook |
| `createFakeSupabase` aplica predicados de verdade | `fake-supabase.ts:10-11, 40-41, 86` | ✅ |
| Harness de `processMessage` e2e existe | `pipeline-agenda-state/scheduling/historico-cauda.test.ts` | ✅ AC4 é factível |
| `nicole_enabled` não colide com nome existente | grep em `packages/*/src` e `supabase/` | ✅ zero ocorrências |
| A regra de corte da Onda 1 é sobre a Nicole | epic-87, linha 400-401 | ✅ leitura do @sm está correta |

---

## 4. Divergências numéricas — os dois números, com o método

Regra desta casa: onde eu divirjo, publico os dois e não sobrescrevo o do @sm.

| Medição | @sm (10/08) | @po (11/08) | Leitura |
|---|---|---|---|
| leads com `property_interest_id` = Vind | 713 | **721** | drift natural de 1 dia (+8) |
| `PROPERTY_IDENTIFIED` do Vind, all-time | 103 | **104** | +1 |
| menções a Japurá/Solum em `messages` `assistant` | 0 em 83 (janela de exposição) | **0 em 1.250** (all-time) | denominadores diferentes, mesma conclusão — e o meu é o que mostra a **saturação** |

Nenhuma delas muda uma decisão. Estão aqui porque a T0 manda remedir, e o @dev precisa saber contra
o que comparar.

---

## 5. Checklist de 10 pontos

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Título claro e objetivo | ✅ | |
| 2 | Descrição completa | ✅ | O "defeito em uma linha" e o §5 (a dívida do paliativo) são exemplares |
| 3 | AC testáveis | ✅ *(após C2, C5, C10)* | 4 ACs tinham defeito de verificabilidade; corrigidas |
| 4 | Escopo IN/OUT | ✅ | A tabela "o que NÃO é filtrado, e por decisão escrita" é o melhor pedaço da story |
| 5 | Dependências mapeadas | ✅ *(após C1)* | Fronteiras com 87-0/1/2/5/10/11 e 75-281 corretas; a numeração de migration estava errada |
| 6 | Estimativa | ✅ | S/M |
| 7 | Valor de negócio | ✅ | Inverte o default numa superfície que fala com lead pago |
| 8 | Riscos documentados | ✅ *(após C3, C7)* | 8 riscos; um gatilho estava falsificado pelo baseline |
| 9 | Definition of Done | ✅ | |
| 10 | Alinhamento com o epic | ✅ | Regra de corte lida corretamente, contra o texto |

**10/10 com as emendas aplicadas.** Sem elas, três eram bloqueantes: **C1** (colisão certa de
arquivo no PR), **C3** (rollback disparado no primeiro dia por baseline pré-existente) e **C2** (AC
que devolve 404 onde o gate espera 422 — o tipo de vermelho falso que consome uma iteração inteira).

---

## 6. O que preservei sem tocar

Porque estava certo e medido, e vale dizer explicitamente para ninguém "otimizar" depois:

- **A ordem `223 → deploy → janela 24 h → 224`**, com as duas formas de quebrar escritas. É o miolo.
- **A AC3 byte a byte**, e a razão de ela ser possível: o paliativo já pôs os dois fora, então o
  contexto tem de ser idêntico antes e depois. **E a reexecução depois da 224** — que é o que prova
  que quem segura é o switch, e não o soft delete.
- **O backfill por `id` nomeado, nunca `where status='selling'`.** Fórmula recria o defeito no
  próximo cadastro. Estendi a mesma regra para a 224 e para o rollback (C6).
- **A consequência declarada** de que desligado ⇒ ela também não reconhece o nome, fixada como
  intenção na AC4-(ii) e não descoberta depois.
- **A recusa da flag de override**, com a razão escrita.
- **`buildPropertyDataContext` com 0 linhas de diff** e o bloco `planning` da 75-281 preservado.

---

## 7. Encaminhamentos

**Para o @pm:**
1. Criar o item **`W1-8`** na tabela da Onda 1 do epic 87 — linha proposta pronta na story.
2. Corrigir o **`R-G`** (diz "migration 215"; o real é 218 aplicada · 219 reservado · 223/224 desta
   story).
3. Abrir item de roadmap para o **Achado nº 7** (inventário das ~17 colunas de `properties` lidas
   pelo runtime; `description` e `differentials` já medidas como órfãs — 4ª fonte de enumeração do
   `config-surfaces.test.ts`).

**Para o @dev:** decisões 1 e 2 estão fechadas e refletidas na T3. Atenção a C1 (prefixo), C8
(o `config-surfaces` muda de desenho — ~15 linhas e assincronia) e C9 (o `fake-supabase` não tem o
slot que a story promete).

**Para o @devops:** reconferir o prefixo das migrations na abertura do PR e registrar a razão no
cabeçalho do arquivo, como na 87-6.

**Registrados em `docs/backlog.md`** (5 itens, dos 7 achados — os nº 1, 2 e 3 viraram um só, como o
@sm recomendou): slug como identificador semântico (P2) · inventário das colunas de `properties`
(P2, ao @pm) · doc `is_active` × `nicole_enabled` (P3) · buraco residual dos mínimos (P2,
bloqueado pelo cron da 87-3) · `property-presentation.ts` com `YARDEN RESIDENCE` e valor em reais
(P1, com o anexo do `--check` vermelho por motivo legítimo).

---

**Veredito: 🟢 GO.** Story promovida a **`Ready`**.

— Pax, equilibrando prioridades 🎯
