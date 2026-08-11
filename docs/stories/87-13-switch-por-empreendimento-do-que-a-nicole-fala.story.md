# Story 87-13 — Um switch por empreendimento decide se a Nicole pode falar dele

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
**Validada por:** @po (Pax) em 2026-08-11 — **GO (10/10 após emendas)**. Parecer:
`docs/qa/po-validation-87-13.md`. As 4 decisões pendentes estão **fechadas** (§ Decisões do @po).
**Item do roadmap:** **`W1-8`** 🆕 (Onda 1) — item **novo**, ainda não existe no epic.
⏳ **@pm precisa criá-lo na tabela da Onda 1** (o @sm não edita o corpo do epic; a entrada em
`stories_planned` foi reposta no mesmo commit em que esta story nasce, conforme a regra da §10).
**Criada por:** @sm (River) em 2026-08-10
**Formato:** **Subtração no lado da Nicole** (um filtro que remove empreendimento do contexto) **+
um controle novo no painel admin.** Os dois eixos estão separados no §7 — leia antes de classificar.
**Executor:** @dev (código, UI, migration 220) · @data-engineer (migration 221 — restauração de dado
em produção, R-B) · validação em produção: @qa + Marcos (D7)
**Esforço:** **S** (código) / **M** (teste + as duas migrations em ordem)
**Risco:** **Baixo de regressão na Nicole** (provável byte a byte — ver AC3) / **Médio no painel**
(o bloqueio ao ligar é comportamento novo, em superfície de admin — §7)
**Deploy:** **fora da fila de risco da Onda 1** (`87-12` → `87-5 A/B` → `87-11` → `87-10`), porque
**não muda um byte do que a Nicole vê**. ⚠️ Há colisão de **arquivo** (não de semântica) em
`pipeline.ts` com a `87-5` e a `87-11` — ver §8.

> ### O defeito, em uma linha
>
> ```ts
> // packages/ai/src/chat/pipeline.ts:1830-1845 — loadProperties
> .from("properties").select(…).eq("org_id", orgId).eq("is_active", true)
> ```
>
> **`is_active` é o soft delete da tabela** (`softDelete`, `api-utils.ts:29-49`, usado pelo
> `DELETE /api/properties/[id]`). Ou seja: o único critério que decide se a Nicole fala de um
> empreendimento é *"ele não foi excluído"*. **Cadastrar basta para entrar na boca dela.**

---

## Story

**Como** Gabriel, dono do que a Nicole pode dizer a um lead pago,
**Quero** um interruptor por empreendimento que decida se ela consome aquele cadastro,
**Para que** entrar na conversa dela seja uma **decisão registrada de alguém**, e não a
consequência automática de alguém ter cadastrado uma linha.

---

## Context

> **Todas as medições desta seção são minhas, contra produção (`dsopqkqjkmhytudaaolv`, Management
> API, somente `SELECT`), em 10/08/2026.** Consulta ao lado de cada número. Onde a minha medição
> diverge de um número que chegou no briefing, **os dois estão publicados com o método** — é a regra
> desta casa desde que 7 de 8 checagens numéricas divergiram na validação de 07/08.

### 1. O que disparou: um nome errado, e a investigação achou outra coisa

Em 09/08 o Marcos reportou que a Nicole disse **"Yarden Residence"** a uma lead. O cadastro diz
**"Yarden"**. A origem era o título de uma seção do prompt `property-presentation`
(`### YARDEN RESIDENCE — como posicionar`), introduzido em 06/08 por quem reescreveu o prompt. **Já
corrigido no banco** — medido agora:

```sql
select slug, is_active, length(content), (content ilike '%YARDEN RESIDENCE%') from agent_prompts;
-- 7/7 slugs ativos · tem_yarden_residence = false em TODOS
```

Isso não é o assunto desta story. **É o que a investigação encontrou no caminho que é.**

### 2. 🔴 O cadastro tem QUATRO empreendimentos, e dois nunca deveriam estar na boca dela

```sql
select p.name, p.slug, p.status, p.is_active, p.total_units,
       (select count(*) from typologies t where t.property_id=p.id)        tipologias,
       (select count(*) from units u where u.property_id=p.id)             unidades,
       (select count(*) from agent_media_assets a
          where a.property_id=p.id and a.is_active)                        midias,
       (select count(*) from leads l where l.property_interest_id=p.id)    leads
from properties p order by p.created_at;
```

| nome | slug | status | `is_active` | unidades | tipologias | mídias ativas | leads |
|---|---|---|---|---|---|---|---|
| Vind Residence | `vind-residence` | selling | `true` | 48 | 1 | 7 | 713 |
| Yarden | `yarden` | selling | `true` | 60 | 2 | 5 | 68 |
| **Japura** | `japura` | planning | **`false`** ⚠️ | — | **0** | **0** | **0** |
| **Solum** | `solun` ⚠️ | planning | **`false`** ⚠️ | — | **0** | **0** | **0** |

Criados em **2026-08-06 20:24:44 UTC**, os dois na mesma transação. O cadastro deles é literalmente
vazio: `address = "A definir"`, `neighborhood/concept/description/delivery_date/total_units` todos
`null`, `amenities/differentials/faq` todos `[]`, `commercial_rules` no default da migration.

### 3. A exposição, medida — e o dano, medido

Eles entraram no contexto de toda mensagem entre a criação e o desligamento
(**06/08 20:24 → 10/08 13:45 UTC ≈ 3 dias e 17 h**):

```sql
-- turnos com contexto montado nessa janela
select count(*) turnos, count(distinct metadata->>'conversation_id') conversas
from system_events where event_type='CLAUDE_RESPONSE'
  and created_at >= '2026-08-06 20:24:44+00' and created_at < '2026-08-10 13:45:54+00';
--  65 turnos · 15 conversas

-- ela chegou a falar deles?
select count(*) filter (where content ilike '%japur%')                             japura,
       count(*) filter (where content ilike '%solum%' or content ilike '%solun%')   solum,
       count(*)                                                                     total
from messages where role='assistant'
  and created_at >= '2026-08-06 20:24:44+00' and created_at < '2026-08-10 13:45:54+00';
--  japura 0 · solum 0 · total 83
```

E eles **nunca foram sequer reconhecidos** — `PROPERTY_IDENTIFIED`, *all-time*:

```
Vind Residence 103 · Yarden 22 · (Japura e Solum: ausentes)
```

> **A leitura honesta, e ela corta nos dois sentidos.** O dano medido é **zero**: em 65 turnos
> ela não citou nenhum dos dois uma única vez. Isso é a instrução de planejamento do §4 abaixo
> funcionando — **em 65 de 65 turnos**. Não é prova de que ela segura: `n = 65`, e o **`CR-7`**
> (Ronaldo, 10/08 00:13 UTC) é o contraexemplo da mesma semana, em que **um turno** bastou para o
> modelo ignorar uma instrução explícita e correta do bloco `[SISTEMA]`. **A exposição foi de 65
> turnos; o dano foi de zero; a distância entre as duas coisas é sorte com denominador pequeno.**

### 4. 🔴 A premissa que chegou no briefing está ERRADA, e a correção melhora a story

> **Briefing:** *"Japurá e Solum entraram no contexto da Nicole sozinhos, só por existirem no
> cadastro. **Nenhuma decisão humana autorizou isso.**"*

**Falso, e conferido antes de aceitar** — mesma disciplina que o @pm aplicou à suposta "regressão
da 87-4" em 10/08. A **Story 75-281** (commit `5ab1bb7e`, PR #371, **em `HEAD`**) é uma decisão
humana explícita, com AC numeradas e **6 testes**, e o comentário dela está no código:

```ts
// packages/ai/src/chat/pipeline.ts:2099-2103 — buildPropertyDataContext
// Story 75-281 — empreendimento em PLANEJAMENTO fica no contexto para a Nicole
// RECONHECER o nome (identify-property usa esta mesma lista, pipeline.ts:539) e
// vincular o lead. Mas nao pode ser oferecido: normalmente ainda nao tem endereco,
// planta, preco nem previsao definidos.
```

E o teste dela **nomeia os dois, literalmente**:

```ts
// packages/ai/src/chat/property-data-context.test.ts:90-92
// Story 75-281: empreendimento em planejamento (ex.: Solun e Japura, cadastrados em
// 06/08/2026 apenas para permitir vinculo de lead) precisa ser RECONHECIDO pela Nicole
// mas nunca OFERECIDO — nao tem endereco, planta, preco nem previsao definidos.
```

**O que é verdade, e é um problema melhor do que "ninguém autorizou":**

| | como está hoje | o que esta story muda |
|---|---|---|
| **granularidade** | a decisão é **por categoria** (`status === 'planning'` ⇒ entra) | passa a ser **por empreendimento** |
| **direção do default** | **cadastrar é suficiente** para entrar | **cadastrar não basta**; alguém liga |
| **natureza da guarda** | **instrução em prompt** (*"NAO ofereca… NUNCA invente"*) | **filtro na query** — ele não entra |
| **quem paga o erro** | quem esquecer de mudar o `status` | ninguém: o default é o lado seguro |

> **É a diferença que o `CR-7` acabou de provar em produção que importa.** A proteção da 75-281 é
> texto no contexto, e o `CR-7` é o caso medido em que *"o contexto estava correto e explícito, e o
> modelo o contrariou"*. A 75-281 não estava errada — ela fez o que dava para fazer sem um campo.
> **Esta story dá o campo.**

### 5. 🔴 A dívida que eu deixei: o paliativo usou o campo de SOFT DELETE

Desliguei os dois em **10/08 13:45:54 UTC** com `is_active = false`, porque estavam vazando naquele
momento. Backup em `scratchpad/BACKUP-properties-104357.json` (os 4 registros, com os `id`).

**`is_active` não é "visível para a Nicole". É o soft delete da tabela inteira:**

```ts
// packages/web/src/lib/api-utils.ts:29-49 — softDelete()
.from(tableName).update({ is_active: false })
// chamado por: DELETE /api/properties/[id]  (packages/web/src/app/api/properties/[id]/route.ts)
```

**Raio de impacto medido** (varredura de todas as ocorrências de `from("properties")` em
`packages/`, janela de 14 linhas por call site):

```
47 call sites no total
├─ 39 SELECT  com  .eq("is_active", true)   ← os dois SUMIRAM daqui
├─  5 SELECT  sem  filtro
├─  2 UPDATE  (1 com filtro, 1 sem)
└─  1 INSERT
```

Ou seja: **eu não escondi os dois da Nicole; eu os excluí do CRM.** Sumiram da lista de
Empreendimentos, do seletor de empreendimento das telas de lead, do painel do corretor, do
`enrich-leads`, da roleta, do analytics — **e do vínculo de lead, que é exatamente o motivo pelo
qual a 75-281 os deixou entrar.** O paliativo desfez o propósito do cadastro deles.

Os 5 SELECT sem filtro (onde eles **continuam** aparecendo, hoje, já "excluídos"):
`dashboard/lancamentos/page.tsx:28` · `dashboard/obras/[obra_id]/page.tsx:55` ·
`dashboard/portal-cliente/page.tsx:24` · `lib/ai/send-library-media.ts:356` ·
`lib/analytics-report-data.ts:504`.

### 6. Por que o padrão tem de ser DESLIGADO

Não é preferência de estilo. É a diferença entre dois modos de falha, e esta casa já viveu os dois:

- **default ligado** ⇒ o modo de falha é *"esqueceram de desligar"*: silencioso, sem dono, descoberto
  por acidente. É a classe da **Célia** (5 semanas até alguém notar) e a das **5 superfícies órfãs**
  que a `87-0` encontrou.
- **default desligado** ⇒ o modo de falha é *"esqueceram de ligar"*: barulhento e com dono — o
  corretor pergunta por que a Nicole não fala do lançamento, e alguém liga.

Um empreendimento cadastrado hoje entra na boca dela **naquele mesmo turno**. Com o campo novo,
cadastrar deixa de ser suficiente: entra quem alguém decidiu que entra.

### 7. Ressalva honesta aos DOIS eixos da regra de corte da Onda 1

A regra é *"nenhuma story pode adicionar um **novo caminho de decisão da Nicole**"*, e a legenda de
risco do epic tem dois eixos justamente porque o @sm e o @po já classificaram o mesmo item de formas
opostas medindo eixos diferentes. Então, separado:

| parte da story | é caminho de decisão novo **da Nicole**? | onda |
|---|---|---|
| filtro `.eq("nicole_enabled", true)` em `loadProperties` | **Não.** Um `.eq` a mais na cláusula que já existe. **Subtração pura**: remove itens de uma lista. Nenhum `if` novo no caminho da resposta | cabe na Onda 1 ✔ |
| migrations 220/221 (campo + backfill + restauração do `is_active`) | **Não.** Dado | cabe ✔ |
| toggle no painel + badge na lista | **Não.** Superfície de admin | cabe ✔ |
| **bloqueio ao ligar sem mínimos (AC6–AC8)** | **Não da Nicole — mas É comportamento novo**, em superfície de admin, e a story não vai fingir que não é | cabe, **e está desenhado como bloco separável** — ver abaixo |

> **O bloco AC6–AC8 é separável de propósito**, no mesmo padrão que a `87-10` usou para o dedupe
> (AC8–AC10). Se o @po decidir que validação de admin não entra na Onda 1, **a linha de corte já está
> desenhada** e o resto da story sobe sozinho, sem redação nova. Eu **recomendo mantê-lo** — o §9
> explica por quê.
>
> ✅ **@po, 11/08 — DECIDIDO: o bloco FICA na Onda 1.** A regra de corte do epic (§6, item 2) diz,
> literalmente, *"nenhuma story pode adicionar um novo caminho de decisão **da Nicole**"*. O bloqueio
> é validação de servidor numa rota de admin: **não roda no turno da Nicole**, não toca o corte. O
> que ele aciona é a **legenda de risco de dois eixos** (§7 do epic) — e o cabeçalho desta story já
> vem no formato `regressão / comportamento novo`. Com a demoção do `B2` a aviso (decisão 1), o único
> critério bloqueante que resta é `count(typologies) = 0`, que **nenhum empreendimento em produção
> hoje satisfaz** entre os que alguém quereria ligar — o eixo de comportamento novo cai de **Médio**
> para **Baixo**. Cortar o bloco faria o toggle subir **sem guarda nenhuma**, e a tese da story
> (*"cadastrar não basta"*) passaria a depender de quem clica.

---

## Desenho

### 1. O campo

Coluna nova em `properties`:

```sql
alter table public.properties
  add column nicole_enabled boolean not null default false;
```

**Coluna, não chave em `commercial_rules`.** Uma flag de controle escondida num JSONB é uma
superfície de configuração invisível ao `information_schema`, ao `select` do runtime e a qualquer
inventário — que é a definição do problema que a `87-0` existe para não repetir.

**Nome em inglês** (`nicole_enabled`), como toda coluna desta tabela (`is_active`, `total_units`,
`commercial_rules`). Rótulo em pt-BR só na tela.

### 2. O backfill é uma DECISÃO NOMEADA, não uma fórmula

```sql
update public.properties set nicole_enabled = true
 where id in ('00000000-0000-0000-0004-000000000001',   -- Vind Residence
              '00000000-0000-0000-0004-000000000002');  -- Yarden
```

**Por `id`, não por `where status = 'selling'`.** Uma fórmula é a mesma doença de novo: no dia em
que alguém cadastrar o próximo `selling`, ele entra na boca dela sozinho — e a story inteira existe
para acabar com isso. O backfill é a decisão do Gabriel de 10/08, escrita, com dois `id` que o
@dev pode conferir contra o backup.

**Guarda obrigatória na migration:** falhar se o `UPDATE` não afetar **exatamente 2** linhas.

> ✅ **@po, 11/08 — os dois `id` estão CONFERIDOS contra produção**, e a SQL acima está correta:
> `select id, name, slug from properties order by created_at, name` devolve
> `00000000-0000-0000-0004-000000000001 · Vind Residence` e
> `00000000-0000-0000-0004-000000000002 · Yarden`. Batem também com o
> `metadata->>'property_id'` dos 126 eventos `PROPERTY_IDENTIFIED` all-time.
>
> 🔴 **E a mesma disciplina precisa valer para a 221, onde ela NÃO está.** A migration 221 e o SQL
> do critério de rollback usam `where slug in ('japura','solun')`. Slug não é fórmula, mas é o
> identificador que o **Achado nº 1 desta própria story** propõe corrigir (`solun` → `solum`). Se
> alguém corrigir o slug, a 221 e o rollback afetam **0 linhas, em silêncio** — o mesmo modo de
> falha mudo que a story inteira existe para atacar. **Usar `id`**, medidos em 11/08:
>
> ```sql
> -- Japura
> 'fcbd2a01-7c59-48b0-8e88-f5a68f4970cd'
> -- Solum  (slug 'solun', com "n" — Achado nº 1)
> '5694ecf1-eb53-4d9e-bb82-4c06f0b19690'
> ```
>
> E a guarda de **"exatamente 2 linhas"** vale para a 221 também, não só para a 220.

### 3. O filtro — uma linha, no lugar em que os três consumidores compartilham a lista

```ts
// packages/ai/src/chat/pipeline.ts — loadProperties
    .eq("org_id", orgId)
    .eq("is_active", true)
+   .eq("nicole_enabled", true)
```

`loadProperties` alimenta **três** consumidores no mesmo turno (`pipeline.ts:537-556, 625`):
`identifyProperty` (reconhecimento), `checkYardenGate` e `buildPropertyDataContext` (o texto). O
filtro na origem mantém os três coerentes: **não existe estado em que ela reconheça um
empreendimento sobre o qual não pode falar.**

**Consequência declarada, não escondida:** desligado ⇒ ela também **não reconhece o nome**, e o
`property_interest_id` não é preenchido por ela. Isso **supera parcialmente a 75-281**. Aceito, com
o número: os dois têm **0 leads vinculados** e **0 `PROPERTY_IDENTIFIED`** *all-time*, e estão fora
do reconhecimento desde 10/08 13:45 de qualquer forma. O modo de falha resultante é a Nicole **não
saber**, que é silêncio — não é afirmação falsa. Numa Onda cuja tese é *subtrair mentira*, silêncio
é o lado certo do erro.

**`buildPropertyDataContext` fica com 0 linhas de diff.** O bloco `if (p.status === "planning")` da
75-281 continua no código e continua alcançável — para o caso legítimo de alguém **ligar
deliberadamente** um empreendimento em planejamento (pré-lançamento com interesse aberto). Os 6
testes da 75-281 chamam a função direto e **ficam verdes byte a byte**.

### 4. O que NÃO é filtrado, e por decisão escrita

| call site | decisão | por quê |
|---|---|---|
| `cron/enrich-leads/route.ts:286` — resolve `property_interest` → `property_interest_id` | **não filtrar** | é **vínculo de CRM**, não fala da Nicole. Filtrar aqui apagaria de vez o propósito da 75-281 e quebraria o cadastro de interesse de um lead que perguntou por um lançamento futuro |
| `lib/roleta/detect-property.ts:35` | **não tocar** | roleta/distribuição está em **FORA DE ESCOPO** do epic (§4), por raio de impacto próprio |
| `lib/ai/send-library-media.ts:356` | **não tocar nesta story** | é um `select("name")` por `id` já resolvido; a seleção de mídia é por `agent_media_assets.property_id`, e os desligados têm **0 mídia ativa** (medido). Filtrar aqui seria subtração sem efeito hoje e ruído no diff |
| os outros 36 SELECT com `is_active` (telas de CRM) | **não tocar** | o switch é sobre a **Nicole**, não sobre visibilidade no sistema. Foi exatamente a confusão dos dois conceitos que produziu a dívida do §5 |

### 5. A UI

- **`/dashboard/properties/[id]/edit`** — toggle *"A Nicole pode falar deste empreendimento"*, com
  a legenda *"Desligado: ela não menciona, não reconhece o nome e não envia mídia deste
  empreendimento."*
- **`/dashboard/properties`** — badge na lista (*"Nicole: ligada / desligada"*). Sem isso, o estado
  do switch só é visível abrindo empreendimento por empreendimento — e um controle que não se vê é
  um controle que ninguém confere.
- **`PATCH /api/properties/[id]`** aceita `nicole_enabled` na allowlist de campos.
- **`POST /api/properties` NÃO aceita `nicole_enabled`.** Por construção: **não dá para nascer
  ligado.** Liga-se depois, num ato separado, com o cadastro já existindo.

**Papel:** o PATCH hoje exige `IMOVEIS_EDIT_ROLES` (admin/supervisor/**obras**). **Recomendo que a
alteração deste campo específico exija `IMOVEIS_CREATE_ROLES`** (admin/supervisor) — a mesma
constante que já governa criar e excluir. Decidir o que a IA fala com um lead pago não é atribuição
do perfil de obras. **Usa constante existente, não inventa papel.** ⚠️ **Decisão de produto: @po
arbitra.** Se recusada, o campo cai em `IMOVEIS_EDIT_ROLES` e o resto da story não muda.

> ✅ **@po, 11/08 — DECIDIDO: `IMOVEIS_CREATE_ROLES`.** Recomendação aceita, **com uma correção de
> fato que a reforça.** `IMOVEIS_EDIT_ROLES` **não** é *admin/supervisor/obras*: são **quatro**
> papéis (`packages/web/src/lib/permissions-imoveis.ts:13`, conferido em 11/08):
>
> ```ts
> export const IMOVEIS_EDIT_ROLES = ["admin", "supervisor", "obras", "gerente-relacionamento"]
> export const IMOVEIS_CREATE_ROLES = ["admin", "supervisor"]
> ```
>
> Ou seja, o delta não é um papel, são **dois** — e o segundo (`gerente-relacionamento`) não estava
> nomeado em lugar nenhum da story. **Tamanho medido em produção** (`select role, count(*) filter
> (where is_active) from users group by 1`, 11/08): perdem o controle **3 pessoas ativas**
> (`obras` = 2, `gerente-relacionamento` = 1); mantêm **9** (`admin` = 5, `supervisor` = 4). É uma
> restrição pequena, nominal e reversível num commit. **O @dev deve ajustar o comentário da rota**
> (`route.ts:37` diz *"admin/supervisor/obras"*, e está errado desde a 72-1).

### 6. Mínimos para LIGAR — **recomendação: BLOQUEAR, e o bloqueio é estrutural**

> **Pergunta do briefing:** o switch deve **bloquear** o ligamento sem mínimos, ou só **avisar**?

**Recomendação: bloquear, no servidor, fail-closed, com a lista do que falta devolvida item a item.
Sem flag de override.** Quatro razões, em ordem de peso:

1. **Um aviso é uma superfície cuja eficácia depende de alguém ler.** Esta é a casa que precisou
   escrever `config-surfaces.test.ts` porque **5 controles editáveis não faziam nada e ninguém
   sabia** — inclusive um visível ao lead, no ar desde 18/06. Um aviso descartável é o mesmo
   objeto: parece proteção e o efeito é opcional.
2. **A proteção que existe hoje contra o cadastro vazio é texto em prompt** (o bloco da 75-281), e o
   `CR-7` é a prova medida, desta semana, de que texto em prompt não é enforcement.
3. **A `87-11` mediu que o modelo repete o que está no contexto** — inclusive `"name": "Tudo"` e
   fala da própria Nicole devolvida como dado coletado. Ligar um cadastro vazio é dar a ela um
   assunto sobre o qual só existe o nome.
4. **A assimetria de custo.** Errar bloqueando é barato e **autoanunciado**: o admin vê *"faltam
   tipologias"* e completa o cadastro — que é o comportamento desejado de qualquer forma. Errar
   avisando é silencioso e a conta chega num lead pago.

**Sem flag de override**, e por experiência: um override criado "para o caso excepcional" é usado
uma vez e depois sempre. Se os mínimos estiverem errados, o conserto é mudar **a constante única**,
num commit, com revisão — não contornar caso a caso.

**Os mínimos são ESTRUTURAIS (contagem), nunca de conteúdo.** Regra de desenho, e ela é o que
impede a lista de apodrecer: bloqueia-se o que está **ausente** (`count = 0`, `null`), nunca o que
está **mal preenchido** — julgar conteúdo exige heurística, e heurística de conteúdo é a classe de
régua que este epic já viu apodrecer três vezes.

| # | mínimo | classe | por quê |
|---|---|---|---|
| **B1** | `count(typologies) ≥ 1` | 🔴 **bloqueia** | sem tipologia ela não tem metragem nem número de quartos. `bedrooms` é o **2º passo** do funil (`QUALIFICATION_STEPS`) e peso do `SCORE_WEIGHTS`: ligar sem isso é ligar um empreendimento que **não pode ser qualificado**. Medido: Vind 1 · Yarden 2 · Japurá 0 · Solum 0 |
| ~~**B2**~~ | ~~`total_units` não nulo e `> 0`~~ | 🟡 **avisa** *(rebaixado pelo @po em 11/08 — ver quadro abaixo)* | sem ele, **nenhum** dos quatro ramos de estoque de `buildPropertyDataContext` emite linha — o empreendimento entra sem noção de tamanho. Medido: 48 · 60 · `null` · `null` |
| **A1** | `count(agent_media_assets ativos) ≥ 1` | 🟡 **avisa** | **não produz mentira**: a 75-157 já torna a fala honesta sobre o que vai sair, e `resolveSendableMedia` devolve `no_assets` sem inventar. Produz experiência pobre, não afirmação falsa. Medido: 7 · 5 · 0 · 0 |
| **A2** | `address` é um endereço de verdade | 🟡 **avisa** | hoje é literalmente `"A definir"` nos dois. É **verdade** ("a definir"), não mentira — e distinguir endereço real de placeholder é julgamento de conteúdo, que a regra de desenho proíbe como bloqueio |
| **A3** | `concept` e `delivery_date` não nulos | 🟡 **avisa** | mesma razão |

> ### ✅ @po, 11/08 — DECIDIDO: **bloquear SIM; `B2` NÃO é o critério que bloqueia**
>
> **Aceito o mecanismo, recuso o critério.** O bloqueio fica: servidor, `fail-closed`, sem override,
> lista `missing` item a item, só na transição `false → true`. **O `B1` (`count(typologies) ≥ 1`)
> continua bloqueando.** O `B2` passa a **aviso**, junto de `A1`–`A3`. Quatro razões, medidas:
>
> **1. O `B2` não separa nenhuma linha que existe.** Medido em produção em 11/08:
>
> | | tipologias (`B1`) | `total_units` (`B2`) | bloqueado por |
> |---|---|---|---|
> | Vind Residence | 1 | 48 | — |
> | Yarden | 2 | 60 | — |
> | Japura | **0** | `null` | **B1** (e B2) |
> | Solum | **0** | `null` | **B1** (e B2) |
>
> **Nenhuma linha falha o `B2` e passa o `B1`.** O `B2` tem **poder discriminante zero** sobre o
> cadastro real: tudo que ele barra, o `B1` já barrou. Todo o efeito dele é sobre linhas futuras.
>
> **2. E a única linha futura plausível é o falso positivo que o próprio @sm nomeou.** O caso que o
> `B2` barraria sozinho é *tipologias definidas, contagem de unidades ainda não* — que é exatamente
> o pré-lançamento legítimo do **Risco 4**. Um critério cujo único cenário vivo é o próprio risco
> que ele carrega não é proteção, é custo.
>
> **3. O `B2` falha a regra de desenho DESTA story.** A regra é: bloqueia o que **quebra**, avisa o
> que **empobrece**. Li os quatro ramos de estoque (`pipeline.ts:2128-2143`): com `total_units`
> nulo **e** `available_units = 0`, **nenhum ramo emite** — o contexto simplesmente **omite** a
> linha de estoque. Isso é **omissão, não afirmação falsa** — o critério exato que o @sm usou para
> pôr `A1` (mídia) e `A2` (endereço) em "avisa". E mais: o **4º ramo** (`else if (availU > 0)`)
> **emite** *"restam apenas N"* quando `total_units` é nulo mas há unidades cadastradas — ou seja,
> o `B2` barraria até um pré-lançamento que já produz informação de estoque útil.
> O `B1` é de outra classe e por isso fica: sem tipologia não há metragem nem `bedrooms`, e
> `bedrooms` é o **2º passo** do funil — o empreendimento entra e **não pode ser qualificado**.
> Isso é quebra funcional, não pobreza.
>
> **4. O argumento do `config-surfaces` está aceito, e é ele que mantém o `B1` bloqueando.** *"Um
> aviso descartável é o mesmo objeto que um controle sem consumidor"* é correto e eu não o estou
> diluindo — ele justifica **bloquear como mecanismo**, e o mecanismo fica inteiro. O que ele não
> faz é escolher **qual** critério bloqueia; isso é medição, e a medição diz `B1`.
>
> **Consequência no diff:** `B2` sai da constante de bloqueios e entra na de avisos. A AC6-(i) passa
> a esperar `missing: ["tipologias"]` — **um item, não dois**. A AC7 muda de "duas constantes
> bloqueantes" para uma. Nada mais da story muda.

> **Alternativa avaliada e recusada, registrada para não ser "redescoberta":** medir a emptiness
> rodando o próprio `buildPropertyDataContext` e exigir que o bloco produzido tenha mais que nome +
> status + endereço. É elegante e se automantém, **e foi recusada por dois motivos**: (a) obrigaria
> a rota em `packages/web` a replicar a forma que `loadProperties` monta (`typologies`, `units`
> agregadas), criando **deriva de shape** entre dois pacotes; (b) o corte viraria *"pelo menos N
> linhas"* — um número arbitrário vestido de regra estrutural, que é pior que dois `count` legíveis.

**Onde a checagem roda:** no servidor, no `PATCH`, **somente na transição `false → true`**.
Nunca só no cliente — validação client-only é, por definição, mais um controle sem consumidor.

⚠️ **Buraco residual, declarado e NÃO fechado aqui:** um empreendimento **já ligado** cujo cadastro
seja esvaziado depois continua ligado. Fechar isso exige *trigger* ou verificação contínua — item
próprio (§ Achados, nº 6). Não inventar guarda nova nesta story.

### 7. A prova de que o campo chega ao runtime — ele **entra** no `config-surfaces.test.ts`

Este é o requisito não-negociável do briefing, e ele tem nome próprio nesta casa:
**`agent_prompts.off-hours` e `handoff-summary` são campos editáveis que não fazem nada, e ninguém
sabia.** Toda superfície nova prova que chega ao runtime, ou é a próxima.

Entrada nova em `SUPERFICIES` (`packages/ai/src/config-surfaces.test.ts`), com **prova
comportamental** — não estática, pelas razões que o docstring do próprio arquivo já argumenta:

```ts
{
  id: "properties.nicole_enabled",
  editadoEm: "painel /dashboard/properties/[id]/edit + PATCH /api/properties/[id]",
  consumidoEm: "chat/pipeline.ts — loadProperties",
  prova: { tipo: "comportamental", executar: /* ver abaixo */ },
}
```

A prova chama o **`loadProperties` de produção** contra `createFakeSupabase` (que **aplica os
predicados de verdade** — é por isso que ele existe) com dois empreendimentos sentinela, um ligado e
um desligado, e afirma **as duas direções**:

- o ligado **aparece** na lista devolvida;
- o desligado **não aparece**.

**Isso exige exportar `loadProperties`** — 1 linha, e coerente com o arquivo, que já exporta
`buildPropertyDataContext` e `resolveOffHoursResponse` para exatamente este fim. *(Conferido pelo
@po em 11/08: `loadProperties` é `async function` sem `export`, `pipeline.ts:1830`, com chamador
único em `:537`.)*

> ⚠️ **@po, 11/08 — a story diz que isto "não altera o desenho" do `config-surfaces.test.ts`. Altera,
> e o @dev precisa saber antes.** Conferido no arquivo:
> - o tipo `Prova` é uma união de **dois** membros — `sentinela` | `leitura-estrutural`
>   (`config-surfaces.test.ts:129-140`). `comportamental` é um **terceiro membro novo**;
> - `executarProva` é um **ternário síncrono** (`:317-321`). Precisa de terceiro ramo;
> - **e precisa virar assíncrono**: `loadProperties` é `async`, e o callback do `it()` que executa a
>   prova é síncrono hoje (`:333-343`).
>
> Nada disso é bloqueio — é ~15 linhas —, mas a linha das *Fronteiras* que diz *"acrescenta entrada e
> **não altera** o desenho"* está errada e foi corrigida lá. **Duas boas notícias, também
> conferidas:** (a) a mensagem exigida pela AC5-(iv) é **literalmente o template atual**
> (`` `${superficie.id} não tem consumidor no runtime.` ``, `:344`) — alcançável sem inventar texto;
> (b) o caso *"nenhuma superfície editável ficou de fora do registro"* enumera das três fontes e
> **filtra contra** `registradas` (`:453-460`) — acrescentar um id **não** o quebra. E a AC5-(iii)
> está garantida por asserção explícita: `expect(doRegistro).toHaveLength(5)` (`:372`).

**Controle negativo obrigatório na mesma prova** (é a disciplina que salvou a AC2 da `87-8`): sem as
duas direções, um `loadProperties` que devolvesse `[]` sempre passaria na metade "não aparece".

> **O que NÃO entra nesta story, e por quê — com a evidência colada.** O teste tem um caso
> *"nenhuma superfície editável ficou de fora do registro"* que enumera de **três** fontes
> (`agent_prompts`, colunas de `agent_config`, allowlists do painel/rota). Uma **quarta** fonte —
> as colunas de `properties` que o runtime da Nicole lê — **não é adicionada aqui**, e a decisão é
> deliberada: a interseção (`allowlist do PATCH` ∩ `select de loadProperties`) tem **~17 colunas**,
> de quatro tipos (texto, número, enum, jsonb) e **três consumidores distintos**
> (`buildPropertyDataContext`, `identifyProperty`, `checkYardenGate`) — uma prova por combinação.
> E ela **já tem duas órfãs conhecidas e medidas**: `description` e `differentials` são
> **selecionadas por `loadProperties` e nunca usadas** por nada. Fazer isso pela metade produziria
> um registro que dá verde sem provar nada, que é o modo de falha que o arquivo existe para impedir.
> **É item novo para o @pm** (§ Achados, nº 7), com a evidência acima.

---

## Ordem de deploy — quatro passos, e a ordem é a story

**A ordem errada tem duas formas de quebrar, as duas medidas no código:**

- **código antes da migration** ⇒ `.eq("nicole_enabled", true)` contra coluna inexistente ⇒ o
  PostgREST devolve erro ⇒ `loadProperties` cai em `if (error || !data) return []`
  (`pipeline.ts:1847`) ⇒ **a Nicole perde o contexto de TODOS os empreendimentos, em silêncio.**
  Catastrófico e mudo.
- **restaurar `is_active` antes do código** ⇒ o filtro ainda é só `is_active` ⇒ **Japurá e Solum
  voltam ao contexto**, que é o defeito que a story conserta.

| # | passo | quem | estado da Nicole | rollback nesta etapa |
|---|---|---|---|---|
| **1** | **Migration 220** — `add column` + backfill nomeado (Vind/Yarden `true`) | @dev / @data-engineer | **inalterado** (os dois seguem `is_active=false`) | `drop column` — **e só enquanto o passo 2 não subiu** (ver nota) |
| **2** | **Deploy do código** (filtro + UI + rota + testes) | @dev → @devops | **inalterado** — provável byte a byte (AC3) | **reverter o PR, e só** |
| **3** | **Janela de observação de 24 h** | @qa + Marcos | — | idem |
| **4** | **Migration 221** — `is_active = true` nos dois, restaurando o CRM | @data-engineer (R-B, backup existente) | reverter o PR **+ desfazer a 221** | — |

> ⚠️ **@po, 11/08 — fronteira do rollback do passo 1, que faltava.** `drop column` só é rollback
> **antes** do passo 2. Com o código no ar, derrubar a coluna reproduz **exatamente** a catástrofe
> muda do Risco 1: `.eq("nicole_enabled", true)` contra coluna inexistente ⇒ erro do PostgREST ⇒
> `if (error || !data) return []` ⇒ a Nicole perde **todos** os empreendimentos, sem log. Depois do
> passo 2, o rollback é **reverter o PR primeiro, a coluna depois (ou nunca — ela é inerte)**.

> **Por que a 221 vem depois da janela, e não junto:** nas primeiras 24 h o rollback é *reverter o
> PR*, sem tocar em nenhum dado — porque os dois continuam desligados pelo paliativo, que ainda
> segura. Depois da 221, um rollback de código **os traz de volta ao contexto**, e por isso a
> instrução de desfazê-la fica escrita no critério de rollback. Um passo de ordem que custa 24 h e
> compra um rollback limpo.

**Migrations — 🔴 CORRIGIDO PELO @po EM 11/08: são a 220 e a 221, não a 218 e a 219.**
Conferido por mim em `supabase/migrations/` na `main` de 11/08 (três stories já colidiram neste
mesmo ponto, então a conferência é minha, não herdada):

```
215_meta_capi_outbox.sql
216_clientes_cpf_normalizado.sql
217_leads_qualificacao_comercial.sql      ← consumido pela 84-1
218_system_events_dedupe_nicole.sql       ← consumido pela 87-6 (PR #383, mergeado 10/08, 24932de3)
                                             ⚠️ a story dizia "o maior prefixo local é 217"; era
                                                verdade em 10/08 e deixou de ser na mesma noite
219  ← REIVINDICADO pela 87-1 (`Ready`), que o crava por escrito na linha 285 e no DoD (">= 219")
```

⇒ **220** (`add column` + backfill) e **221** (restauração do `is_active`). `git log --all` não tem
nenhum arquivo `219_`, `220_` nem `221_` em branch nenhuma — o 219 está reservado, não escrito.

> **Nota de mecanismo, para este ponto parar de doer:** o prefixo `NNN_` é convenção **só do
> repositório**. Em produção, `supabase_migrations.schema_migrations` versiona por **timestamp**
> (maior valor hoje: `20260710171933`, medido em 11/08) — não há colisão do lado do banco. A
> colisão é 100% de arquivo, e é por isso que ela reaparece toda vez que duas stories ficam em
> `Ready` ao mesmo tempo. **Regra operacional:** o @dev crava 220/221 agora; o **@devops reconfere e
> renumera na abertura do PR**, como já fez na 87-6 e na 84-1, registrando a razão no cabeçalho do
> arquivo. O **R-G** do epic ainda diz **215** e está desatualizado.

Aplicar **arquivo inteiro num único POST** pela Management API (`db push` proibido; runbook
`docs/runbooks/aplicar-209-210.md`).

---

## Acceptance Criteria

> Todo vermelho é **colado — saída bruta do reporter — com a FORMA DA MUTAÇÃO escrita ao lado do
> número.** `npx vitest run` da **RAIZ**, na **suíte inteira**, nunca `--reporter=basic`, nunca só
> no arquivo do módulo. *(Nota `P1` do gate da 87-8, `C4` do gate da 87-7.)*
>
> **E antes de declarar que um teste prova algo: remova o que ele diz provar e veja se cai.** Toda
> AC abaixo com 🔴 traz a mutação exigida; nenhuma vale sem ela.

**AC1 — 🔴 O campo existe, o default é DESLIGADO, e o backfill é de exatamente dois.**
*Verifica-se, contra produção, depois da migration 220:*
```sql
select name, slug, is_active, nicole_enabled from properties order by created_at, name;
--                                          ⬆ 🔴 o desempate por `name` é OBRIGATÓRIO — ver nota
-- Vind Residence   true   TRUE
-- Yarden           true   TRUE
-- Japura           false  FALSE
-- Solum            false  FALSE

select column_default, is_nullable from information_schema.columns
 where table_name='properties' and column_name='nicole_enabled';
-- false  ·  NO      (formato conferido contra a coluna `is_active`, que hoje devolve `true` · NO)
```
> 🔴 **@po, 11/08 — a AC1 original era não-determinística e teria produzido um vermelho falso.**
> Japura e Solum foram criados **na mesma transação** e têm `created_at` **idêntico ao
> microssegundo** (`2026-08-06 20:24:44.85984+00`, medido). `order by created_at` **não garante**
> ordem entre as duas linhas — e o próprio corpo desta story as lista em ordens opostas (§2 do
> Context põe Japura antes; a AC1 original punha Solum antes). Com `order by created_at, name` a
> saída é estável e a esperada é a de cima. *(O `is_active` das duas últimas só vira `true` no passo
> 4 — ver AC9.)*
>
> ✅ **O formato esperado da coluna está conferido contra produção:** `is_active` hoje devolve
> `column_default = 'true'` e `is_nullable = 'NO'`. E `nicole_enabled` **não existe ainda** em
> `information_schema.columns` — logo a AC1 nasce vermelha de verdade, não por acidente.

- (i) a migration **falha** se o `UPDATE` do backfill não afetar exatamente **2** linhas — colar o
  bloco de guarda;
- (ii) **vermelho:** rodar a 220 num banco de teste com um 5º empreendimento e conferir que ele
  nasce `false` **sem** aparecer no backfill.

**AC2 — 🔴 Cadastrar não liga. Provado pela API, não pela tela.**
- (i) `POST /api/properties` com `nicole_enabled: true` no corpo ⇒ o registro criado tem
  `nicole_enabled = false`. **O campo é ignorado na criação, por construção** (não está na lista de
  campos do INSERT);
- (ii) **vermelho:** acrescentar `nicole_enabled: body.nicole_enabled` ao INSERT ⇒ (i) cai. Colar.

**AC3 — 🔴 O contexto da Nicole é BYTE A BYTE o mesmo, para o cadastro real de produção.**
*Esta é a AC central de não-regressão, e ela só é possível porque o paliativo já pôs os dois fora.*
*Verifica-se:* fixture com os **4 empreendimentos reais** (colados do banco, com `nicole_enabled`
como a AC1 os deixa) ⇒ a string devolvida por `buildPropertyDataContext(loadProperties(...), null)`
é **idêntica byte a byte** à do `HEAD` (onde a fixture usa `is_active` como está hoje). Colar as
duas strings e o `diff` vazio.
- **vermelho:** trocar `nicole_enabled` de Japurá para `true` ⇒ o diff deixa de ser vazio e a string
  ganha o bloco *"Japura (Em planejamento)"* + a instrução da 75-281. Colar.

**AC4 — 🔴 O filtro atua nos TRÊS consumidores, e a prova é o turno inteiro.**
*Verifica-se* com `createFakeSupabase` (que aplica os predicados de verdade) + `fakeAnthropic`,
seedando `properties` com os 4 e rodando `processMessage`:
- (i) o `system` enviado à Anthropic **não contém** `Japura` nem `Solum`;
- (ii) mensagem do lead *"quero saber do Japurá"* ⇒ **nenhum** evento `PROPERTY_IDENTIFIED` e
  `current_property_id` permanece `null` — *é a consequência declarada do §3 do Desenho, fixada como
  intenção e não descoberta depois*;
- (iii) mensagem do lead *"quero saber do Vind"* ⇒ `PROPERTY_IDENTIFIED` com o Vind (**controle
  positivo, no mesmo teste** — sem ele, (i) e (ii) passariam num `loadProperties` que devolvesse
  `[]`);
- (iv) **vermelho:** remover a linha `.eq("nicole_enabled", true)` ⇒ (i) e (ii) caem, (iii) passa.
  Colar as três saídas.

**AC5 — 🔴 `properties.nicole_enabled` entra no `config-surfaces.test.ts`, com prova comportamental.**
- (i) entrada nova em `SUPERFICIES` com `consumidoEm: "chat/pipeline.ts — loadProperties"`;
- (ii) a prova chama o `loadProperties` **de produção** (exportado) contra `createFakeSupabase`, com
  **as duas direções** (ligado aparece / desligado não aparece);
- (iii) o caso *"o inventário de órfãs bate com o registro"* continua verde e continua em **5** — o
  campo novo **não é órfã**;
- (iv) **vermelho:** apagar a linha do filtro em `loadProperties` ⇒ a prova comportamental falha com
  a mensagem *"properties.nicole_enabled não tem consumidor no runtime"*. **Colar essa mensagem.**
  *É o vermelho que separa "registrei o campo" de "provei o campo".*

**AC6 — 🔴 [bloco separável — @po 11/08: FICA] Os mínimos bloqueiam no SERVIDOR, e a lista do que falta volta.**

> 🔴 **@po, 11/08 — esta AC, como estava, NÃO era verificável no passo em que foi colocada.** Medido
> na rota (`packages/web/src/app/api/properties/[id]/route.ts`): **tanto o `GET` (`:20`) quanto a
> cadeia do `UPDATE` do `PATCH` (`:96`) carregam `.eq("is_active", true)`.** Enquanto Japurá e Solum
> estiverem `is_active = false` — isto é, do passo 1 até o passo 4 —, um `PATCH` sobre eles devolve
> **404, não 422**: a linha nem é alcançada pela validação. Quem fosse conferir esta AC contra
> produção no gate leria o 404 como defeito da implementação. **Correção, e ela não muda o desenho,
> só o método:** a AC6 é verificada em **teste de rota, com fixture `is_active: true`** (que é o que
> a T5 já manda fazer) — **nunca** por chamada ad-hoc a produção antes do passo 4. Depois da 221, a
> conferência em produção passa a ser possível e é bem-vinda, mas é bônus, não a régua.

- (i) `PATCH /api/properties/{japura}` com `{ nicole_enabled: true }` ⇒ **HTTP 422**, corpo com
  `{ error, missing: ["tipologias"] }` — o item **nomeado**, não uma mensagem única.
  🔴 **Um item, não dois:** o `total_units` saiu dos bloqueios pela decisão 1 do @po (§6 do
  Desenho). Asserte a lista **exata**, não `toContain` — `toContain` passaria verde se o `B2`
  tivesse ficado, e é justamente essa a mudança que a AC precisa fixar;
- (ii) o mesmo `PATCH` sobre o **Vind** ⇒ **200**;
- (iii) `nicole_enabled: false` **nunca** é bloqueado — **desligar sempre pode**, em qualquer estado
  de cadastro. *É a válvula: nada que este código faça pode impedir alguém de calar a Nicole sobre
  um empreendimento;*
- (iv) a checagem roda **só** na transição `false → true`: um `PATCH { name: "X" }` sobre um
  empreendimento já ligado com cadastro incompleto ⇒ **200**;
- (v) **vermelho:** mover a validação para o cliente (removê-la da rota) ⇒ (i) devolve **200** e a
  AC cai. Colar. *É o vermelho que prova que a validação não é decorativa.*

**AC7 — [bloco separável] Os mínimos vivem numa constante única, e os números são assertados.**
`B1 (≥1 tipologia)` é a **única** constante bloqueante do módulo — e o módulo é um só, importado
pela rota **e** pelo teste. `B2 (total_units > 0)` e `A1`–`A3` estão **na mesma estrutura, marcados
como aviso** — e um aviso **nunca** bloqueia.
- (i) o teste asserta que a lista de bloqueios tem **comprimento 1**. *Um `expect(BLOQUEIOS.length)
  .toBeGreaterThan(0)` daria verde com o `B2` de volta — é o tipo de asserção frouxa que deixa uma
  decisão de produto ser desfeita por acidente num rebase;*
- (ii) **vermelho:** promover `B2` a bloqueio ⇒ um empreendimento com **tipologia cadastrada e
  `total_units` nulo** (o pré-lançamento legítimo do Risco 4) passa a receber **422** onde a
  decisão do @po manda **200 + aviso**. Colar as duas saídas. *É o vermelho que fixa a decisão 1
  como intenção, e não como omissão.*
- (iii) **vermelho:** promover `A1` a bloqueio ⇒ a AC6-(ii) cai (o Vind tem 7 mídias e passaria;
  use um empreendimento com 0 mídia e cadastro completo).

**AC8 — [bloco separável] A tela mostra o estado e o motivo.**
- badge na lista `/dashboard/properties` refletindo `nicole_enabled`.
  🔴 **@po, 11/08 — são 2 no passo 2, e 4 só depois do passo 4.** Medido: a página filtra
  `.eq("is_active", true)` (`dashboard/properties/page.tsx:15`), então enquanto Japurá e Solum
  estiverem soft-deletados **eles não aparecem nessa lista** — a AC original ("nos 4") era
  impossível de satisfazer no passo em que estava colocada. Verificar **nos 2 visíveis no passo 2**;
  a conferência "nos 4" é a **AC9-(i)**, depois da 221, e não se duplica aqui;
- na tela de edição, tentar ligar um bloqueado ⇒ a lista `missing` da AC6 é renderizada item a item,
  **não** um "erro ao salvar" genérico;
- **nenhuma AC desta story é "existe no painel"** — todas as três acima são verificadas contra a
  resposta HTTP, que é o efeito. *(Regra da §10 do epic.)*

**AC9 — 🔴 A restauração do paliativo, e ela é o fecho da dívida.**
Depois da migration 221 (passo 4):
```sql
select name, slug, is_active, nicole_enabled from properties
 where id in ('fcbd2a01-7c59-48b0-8e88-f5a68f4970cd',   -- Japura
              '5694ecf1-eb53-4d9e-bb82-4c06f0b19690');  -- Solum (slug 'solun')
-- Japura   japura   true   false
-- Solum    solun    true   false
```
*Por `id`, não por `slug`, pela razão escrita no §2 do Desenho: o slug `solun` é o Achado nº 1
desta story e pode ser corrigido a qualquer momento — uma SQL de verificação que casa por slug
devolveria **0 linhas em silêncio** e seria lida como "nada a restaurar".*
- (i) os dois **voltam** à lista `/dashboard/properties` e aos seletores de empreendimento das telas
  de lead — conferido nas telas, não só no banco;
- (ii) o contexto da Nicole **continua sem eles** — reexecutar a AC3 **depois** da 221 e colar o
  diff vazio de novo. *É a prova de que o switch, e não o soft delete, é quem está segurando;*
- (iii) o backup `scratchpad/BACKUP-properties-104357.json` é conferido contra o estado final
  (`id`, `name`, `slug` idênticos).

**AC10 — Suíte, tipos e árvore.**
- `npx vitest run` da **RAIZ**, **suíte inteira**: total antes e depois colados, com o delta
  explicado teste a teste. **Os 6 testes da 75-281 em `property-data-context.test.ts` continuam
  verdes** e `buildPropertyDataContext` tem **0 linhas de diff** — conferido no `git diff`;
- `npx tsc --noEmit` em `packages/ai` → **0**; em `packages/web` → só os pré-existentes
  (satori/sharp/pdf-lib), nenhum em arquivo tocado. *(`packages/ai` **não tem eslint**: `lint` é
  `tsc --noEmit`. Não escrever AC de lint lá.)*
- árvore restaurada byte a byte depois de cada mutação, `md5` conferido.

**AC11 — Janela de observação em produção (24 h, entre o passo 2 e o passo 4).**
- **Nenhuma AC depende de "o alerta chegou"** (Telegram morto em produção, `87-9` não subiu) **nem
  de "o cron rodou"** (`NICOLE_LASTRO_DIARIO` = **0** *all-time*). A verificação é `select`.
> 🔴 **@po, 11/08 — a janela estava medindo a coisa errada, e os dois primeiros itens são réguas
> SATURADAS.** Medido em produção em 11/08: menções a `japur`/`solum`/`solun` em `messages` com
> `role='assistant'` = **0 em 1.250 mensagens all-time**; `PROPERTY_IDENTIFIED` para os dois =
> **ausente all-time**. E o paliativo já os tirou do contexto desde 10/08 13:45. Portanto os itens
> 1 e 2 **continuam em 0 quer esta story suba, quer não** — eles não distinguem sucesso de
> nada-feito. Não são inúteis (são controle negativo), mas **não podem ser lidos como confirmação
> de que o switch funciona**. A prova do switch é a **AC3/AC4/AC5, em teste**; a janela é
> **vigilância de REGRESSÃO**, e só. Reordenada abaixo por isso.

- O que se olha, **em ordem de poder de detecção**:
  1. 🔴 **INSTRUMENTO PRINCIPAL — `PROPERTY_IDENTIFIED` do Vind Residence.** É o único sinal vivo e
     não-saturado. **Baseline medido pelo @po em 11/08:** não-zero em **14 dos últimos 15 dias**,
     mediana ≈ 3/dia, **104 all-time**. Zero de Vind numa janela com tráfego é o sintoma canônico do
     `loadProperties` vazio (Risco 1);
  2. ⚠️ **Yarden é intermitente — NÃO serve de gatilho.** Medido: 22 all-time, em rajadas (9 em
     06/08, 10 em 07/08) e **zero em 08, 09, 10 e 11/08**, com tráfego nos quatro dias. Ver a
     correção do gatilho de rollback nº 2 abaixo. Entra como **observação qualitativa** (item 4),
     nunca como número;
  3. **controle negativo (saturado, declarado como tal):** `PROPERTY_IDENTIFIED` para Japurá/Solum
     continua ausente, e
     `select count(*) from messages where role='assistant' and (content ilike '%japur%' or
     content ilike '%solum%' or content ilike '%solun%')` continua **0**. *Baseline 0/1.250
     all-time: este item só sabe dizer "piorou", nunca "funcionou".*
  4. **amostragem dirigida, não aleatória:** 5 conversas com turno novo, lendo se a Nicole passou a
     dizer *"não conheço"* sobre Vind **ou Yarden** — **é a regressão específica desta story**, e é
     onde o Yarden é observado, por leitura e não por contagem;
  5. `M1` e `M4` pela régua da `87-3` **rodada à mão** (`?dry=1`; o cron nunca executou) — sem
     aumento.
- **Piso de inconclusividade:** com `n < 5` turnos na janela, ela **estende**; escreve-se
  **inconclusivo**, nunca "sem regressão". *(Mesmo piso da 87-7, 87-8 e 87-11.)*
  **Denominador medido pelo @po em 11/08**, para o piso não ser um número solto: `CLAUDE_RESPONSE`
  por dia nos últimos 11 dias = `3 · 2 · 38 · 11 · 16 · 24 · 22 · 4 · 8 · 31 · 2` (mediana **11**,
  faixa **2–38**). **3 dos 11 dias teriam caído abaixo do piso** — a janela precisa ser conferida
  contra o tráfego real antes de ser declarada verde, e estender 24 h é o caso esperado, não a
  exceção. Registrar o `n` observado junto do veredito, sempre.

---

## Tarefas

- [x] **T0 — Remedir contra produção ANTES do código (somente `SELECT`).** Colar no Dev Agent
      Record, com a consulta ao lado de cada número: (a) os 4 empreendimentos com
      `is_active`/`status`/contagens; (b) a contagem de call sites de `from("properties")` com e sem
      `is_active`; (c) `PROPERTY_IDENTIFIED` por nome, all-time; (d) turnos e menções na janela de
      exposição. **Se algum divergir do que está escrito aqui, publicar OS DOIS com o método** — não
      sobrescrever o meu.
- [x] **T1** — `supabase/migrations/220_properties_nicole_enabled.sql`: `add column` + backfill por
      `id` + guarda de "exatamente 2 linhas". **Conferir o prefixo na hora** (o 219 está reservado
      pela 87-1; o @devops reconfere na abertura do PR). Aplicar por Management API, arquivo inteiro
      num POST.
- [x] **T2** — o filtro em `loadProperties` (**uma linha**) + exportar `loadProperties`.
- [x] **T3** — `PATCH /api/properties/[id]`: allowlist + papel **`IMOVEIS_CREATE_ROLES`** (decisão 2
      do @po — e corrigir o comentário errado de `route.ts:37`) + o bloco de mínimos (AC6/AC7) no
      módulo único, com **`B1` como único bloqueio** (decisão 1 do @po).
- [x] **T4** — UI: toggle na edição + badge na lista (AC8).
- [x] **T5** — testes: AC3 (byte a byte), AC4 (turno inteiro com fake supabase), AC5
      (`config-surfaces.test.ts`), AC6/AC7 (rota).
- [x] **T6** — as mutações da AC1-(ii), AC2-(ii), AC3, AC4-(iv), AC5-(iv), AC6-(v) e AC7, cada uma
      com a **forma escrita** e a **saída bruta colada**; árvore restaurada e `md5` conferido.
- [x] **T7** — AC10 e o plano da janela (AC11), com responsável nomeado, **antes** do merge.
- [~] **T8** — **depois** da janela: `supabase/migrations/221_properties_restaura_is_active.sql`
      (@data-engineer, R-B), **por `id` e com guarda de 2 linhas** + reexecutar a AC3 e a AC9.
- [x] **T9** — **condições 1 e 2 do gate CONCERNS (11/08)**: os dois números do registro corrigidos
      (`C1` o `md5` de `properties/[id]/route.ts`, `C2` o tamanho do golden) e o `C3` fechado com
      código — um par de casos que segura o `.eq("is_active", true)`, com a mutação **medida**
      (M2 ⇒ **1 vermelho**, de zero) e a contagem da M1 **remedida** (segue **4**). `C6` corrigido
      de graça; `C4` e `C5` **não** são desta story (backlog e pós-deploy, com dono).

---

## Dev Notes

### Mapa de código

| arquivo | linha | o quê |
|---|---|---|
| `packages/ai/src/chat/pipeline.ts` | **1830-1855** | `loadProperties` — **a linha entra aqui** |
| " | 1847 | `if (error || !data) return []` — **a falha silenciosa** que torna a ordem de deploy inegociável |
| " | 537-556 | os três consumidores da lista, no mesmo turno |
| " | 625 | `buildPropertyDataContext(properties, identifiedPropertyId)` |
| " | **2078-2180** | `buildPropertyDataContext` — **0 linhas de diff** (AC10) |
| " | 2099-2103 | o bloco `planning` da 75-281 — **fica**, e continua alcançável |
| `packages/ai/src/flows/identify-property.ts` | 62-87 | `identifyProperty` — consome a mesma lista |
| " | 74-84 | o fallback por `collected_data.property_interest` — ver Achado nº 3 |
| `packages/ai/src/config-surfaces.test.ts` | 166-249 | `SUPERFICIES` — **a entrada nova** |
| " | 255-261 | `ORFAS_CONHECIDAS` — **continua em 5** |
| `packages/ai/src/chat/__fixtures__/fake-supabase.ts` | 236 | **reusar, nunca recriar.** ⚠️ **@po 11/08:** não existe "slot `properties: []`" — a palavra `properties` **não aparece no arquivo**. O que existe é melhor: `createFakeSupabase(seed: Record<string, Row[]> = {})` é um **mapa genérico por nome de tabela**, e a tabela nasce vazia sob demanda (`rows()`). Passe `{ properties: [...] }` e funciona. Não crie fixture nova |
| `packages/ai/src/chat/property-data-context.test.ts` | 90-155 | os 6 testes da 75-281 — **verdes byte a byte** |
| `packages/web/src/app/api/properties/route.ts` | 34-118 | `POST` — **não** aceita o campo (AC2) |
| `packages/web/src/app/api/properties/[id]/route.ts` | 31-108 | `PATCH` — allowlist, papel, mínimos |
| `packages/web/src/lib/api-utils.ts` | 29-49 | `softDelete` — **a prova de que `is_active` é exclusão** |
| `packages/web/src/lib/permissions-imoveis.ts` | — | `IMOVEIS_EDIT_ROLES` × `IMOVEIS_CREATE_ROLES` |
| `packages/web/src/app/dashboard/properties/page.tsx` | 11-16 | lista — badge |
| `packages/web/src/app/dashboard/properties/[id]/edit/page.tsx` | 1-434 | edição — toggle |

### Armadilhas

1. **`loadProperties` falha para o lado MUDO.** `if (error || !data) return []` ⇒ coluna inexistente
   vira "nenhum empreendimento", **sem log e sem exceção**. É por isso que a migration 220 vem
   antes do deploy, e não porque seja o costume.
2. **`is_active` ≠ "visível para a Nicole".** É o soft delete. Não empilhar mais significado nele —
   foi empilhar significado que produziu esta story.
3. **`createFakeSupabase` aplica os predicados de verdade**, mas **ignora as colunas do `select`** —
   os *embedded resources* (`typologies(...)`, `units(status)`) **não** são materializados. Para a
   AC3/AC4, seedar as fixtures com `typologies` e `units` já no objeto do `properties`, ou assertar
   só sobre o que não depende deles. **Não escrever mock novo.**
4. **Fixtures com `id` em formato `uuid`.** Em produção `properties.id` é `uuid` (dois deles são
   `00000000-…-0004-…`, sequenciais legados). `id` sequencial em fixture já deu verde por acidente
   no gate da `87-8` (V4/V6).
5. **`packages/ai` não tem eslint** — `lint` é `tsc --noEmit`. Não escrever AC de lint lá.
6. **PAT do Supabase está em `~/.supabase/access-token` (JSON)** — **não** em
   `~/.config/supabase/pat`, que o runbook cita e não existe nesta máquina.
7. **Não "consertar" o slug `solun` nesta story.** Achado nº 1; corrigir slug mexe em
   `identifyProperty`, no fallback de `property_interest` e em qualquer dado que já o referencie.

### Fronteiras com outras stories e itens

| item | fronteira |
|---|---|
| **75-281** (em prod, PR #371) | Esta story a **supera parcialmente**, e isso está escrito: a decisão sai de *categórica por `status`* para *por empreendimento*. O código e os 6 testes dela **ficam** |
| **`W3-2b`** (Onda 3) | *"nunca introduzir outro empreendimento sem o lead pedir"* — é **enforcement na SAÍDA**, sobre o conjunto que existe. Esta story controla **o conjunto de ENTRADA**. Complementares, sem sobreposição. Depois desta, o `W3-2b` tem menos superfície a cobrir |
| **`CR-6`** (Orlice) | Não é resolvido aqui. Vind e Yarden continuam ambos ligados, e a troca entre eles continua possível — dono é o `W3-2b` |
| **`W4-2`** (Onda 4) | Tool de dados do empreendimento. Herda o switch como filtro natural |
| **`87-11`** (`Ready`) | Toca `pipeline.ts:1911-1915` (`buildSystemPrompt` **local**). Esta toca `1830-1855`. **Semanticamente disjuntas**; colisão só de merge |
| **`87-5`** (`Ready`) | Toca `loadConversationHistory` e `Message.role` em `pipeline.ts`. Mesma situação |
| **`87-2`** (`Draft`) | Campos mortos do painel. Esta story **acrescenta** uma superfície de painel — e a acrescenta **já provada**, que é o padrão que a `87-2` quer estabelecer |
| **`87-0`** (em prod) | Dona do `config-surfaces.test.ts`. Esta story **acrescenta** entrada e **não altera** o `ORFAS_CONHECIDAS` (continua 5, com asserção explícita em `:372`). ⚠️ **Mas ALTERA o desenho, ao contrário do que esta linha dizia** (@po, 11/08): a prova `comportamental` da AC5 exige um **terceiro membro** na união `Prova` (`:129-140`), um **terceiro ramo** em `executarProva` (`:317-321`) e tornar a execução **assíncrona** (`loadProperties` é `async`). ~15 linhas, no arquivo do qual a 87-0 é dona — ver §7 do Desenho |
| **`87-1`** (`Ready`) | **Reivindica a migration `219`** (linha 285 e DoD). Esta story vai para **220/221**. Sem interseção de arquivo — a 87-1 é `agent_prompts` |

---

## Achados colaterais — **registrar, NÃO corrigir aqui**

> Sete itens. Nenhum vira tarefa desta story. Os que precisam de dono são para o @po/@pm abrirem em
> `docs/backlog.md` ou como item de roadmap — o @sm registra, não abre.

**1. 🔴 O slug do Solum é `solun`, com "n".** O nome é `Solum`. Pode ser intencional (grafia da
incorporadora) ou digitação. **O que ele realmente afeta, conferido no código, e é menos do que
parece:** `propertyKeywords` (`identify-property.ts:41-51`) deriva keywords do slug **e do nome** —
então `"Solum"` casa pelo nome e `"solun"` casa pelo slug; a **identificação por texto funciona nos
dois**. Quem quebra é o **fallback por `collected_data.property_interest`** (`:78`), que compara
`property.slug === interest` **e** `property.name.toLowerCase() === interest`: se o Haiku extrair
`"solum"`, o nome salva; se extrair `"solun"`, o slug salva. **Latente, não vivo hoje** (0 leads).
**P3.**

**2. 🔴 `PROPERTY_KEYWORDS["vind"]` é código morto.** `PROPERTY_KEYWORDS`
(`identify-property.ts:13-26`) é indexado **por slug**, e **nenhum empreendimento tem slug `vind`** —
o do Vind é `vind-residence`. Logo a lista curada (`"67m2"`, `"67 m2"`, `"67m²"`, `"67 m²"`) **nunca
é consultada**, e o Vind cai em `autoKeywords`. Funciona por acidente: `autoKeywords` inclui as
palavras do nome com ≥4 chars excluindo `"residence"` ⇒ `"vind"`. **Mas as keywords de metragem
estão mortas** — um lead que diga *"aquele de 67m²"* não é identificado. **P2** (o Yarden, cujo slug
é `yarden`, usa a lista de verdade — a assimetria é invisível).

**3. 🔴 `property_interest` grava `"vind"`, o slug é `"vind-residence"` — o fallback nunca casa.**
Duas medições, as duas publicadas com o método (regra desta casa):

| fonte | número | método |
|---|---|---|
| **briefing** | 157 conversas | não declarado |
| **@sm, 10/08** | **170** | `select collected_data->>'property_interest', count(*) from conversation_state where collected_data ? 'property_interest' group by 1` ⇒ `vind 170 · yarden 8`, all-time, unidade = **linha de `conversation_state`** |

Nas **170**, `property.slug === "vind"` é falso (slug é `vind-residence`) **e**
`property.name.toLowerCase() === "vind"` também (nome é `vind residence`) ⇒ o fallback do
`identifyProperty` está morto para o Vind desde sempre. As **8** do Yarden casam (slug = `yarden`).
**Mitigação que existe:** o caminho por texto da mensagem funciona, então o defeito só aparece
quando a mensagem do turno não cita o empreendimento. **P2.** ⚠️ **Este é da mesma família do nº 1 e
do nº 2 — os três são "slug usado como identificador semântico". Vale um item só, não três.**

**4. 🔴 `packages/ai/src/prompts/property-presentation.ts:25` ainda tem `### YARDEN RESIDENCE`.**
O **banco** foi corrigido (medido: 0 ocorrências nos 7 slugs). O **fallback de bootstrap não**. Sob a
**D-87-0-a** o código é o fallback declarado — se a linha do banco cair ou for desativada, **o nome
errado volta**. E o mesmo arquivo carrega dois outros itens já proibidos por decisão: `"em torno de
80 mil reais"` (**D-87-0-f** manda percentual, nunca valor em reais) e fatos de empreendimento
(**D-87-0-b** manda que fato venha do cadastro). **Dono: o item que tira fato de prompt.** Não é
desta story.
**Anexo do mesmo achado:** o snapshot da `87-0` em `packages/ai/src/prompts/_production/` é de
**05/08 20:11** e `property-presentation.txt` tem **3.926** chars contra **4.526** no banco hoje ⇒
**o `--check` da `87-0` acusa diff**. Isso é o mecanismo funcionando (o prompt foi reescrito duas
vezes desde então), mas alguém precisa **reconciliar e re-snapshotar** — e enquanto não fizer, o
`--check` está vermelho por motivo legítimo, que é o pior lugar para um sinal ficar.

**5. `is_active` é o soft delete de `properties`, e 39 SELECT dependem dele.** Já tratado no §5 do
Context; fica aqui para quem procurar por "is_active" no futuro. Registrar em `docs/architecture/`
que **`properties.is_active` = existe no sistema** e **`properties.nicole_enabled` = a IA fala
dele** — dois conceitos, dois campos, e a confusão entre eles custou esta story.

**6. Buraco residual dos mínimos.** A checagem roda só na transição `false → true`. Um
empreendimento **já ligado** cujo cadastro seja esvaziado depois continua ligado, em silêncio.
Fecho possível **fora desta story**: uma linha na reconciliação diária do `W0-5` (que já é um cron de
leitura) publicando os empreendimentos ligados que perderam os mínimos. **P2, e barato** — mas
depende do cron da `87-3` voltar a executar, que é o bloqueio aberto da Onda 0.

**7. 🆕 Item novo para o @pm — o inventário das colunas de `properties` que o runtime da Nicole lê.**
A interseção `allowlist do PATCH` ∩ `select de loadProperties` tem **~17 colunas**, de 4 tipos e com
3 consumidores distintos, **e já tem duas órfãs conhecidas e medidas**: **`description` e
`differentials` são selecionadas por `loadProperties` e nunca usadas por nada** — editáveis no
painel, carregadas pelo runtime, descartadas. É exatamente a classe que o `config-surfaces.test.ts`
existe para inventariar, e é uma **quarta fonte de enumeração** que aquele teste ainda não tem. §7
do Desenho explica por que não entrou aqui.

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| 1 | **Deploy fora de ordem** ⇒ `loadProperties` devolve `[]` e a Nicole perde **todos** os empreendimentos, em silêncio | **Alta** | Ordem de 4 passos escrita e numerada; a migration 220 é **pré-requisito** do deploy; a falha é muda (`pipeline.ts:1847`), então a AC4-(iii) tem controle positivo obrigatório |
| 2 | Rollback **depois** da 221 traz os dois de volta ao contexto | **Média** | A 221 só sai depois da janela verde; o critério de rollback manda desfazê-la junto, e está escrito |
| 3 | Desligado ⇒ ela também não **reconhece** o nome (supera parcialmente a 75-281) | **Média** | Consequência **declarada** e fixada como intenção na AC4-(ii), não descoberta depois. Medido: 0 leads vinculados, 0 `PROPERTY_IDENTIFIED` all-time nos dois. Modo de falha = silêncio, não afirmação falsa |
| 4 | Os mínimos bloquearem um ligamento legítimo (pré-lançamento sem `total_units`) | **Média** | `B2` marcado como o discutível dos dois, com a recomendação escrita de virar aviso se o @po recusar. **Desligar nunca é bloqueado** (AC6-iii) |
| 5 | Alguém pedir uma flag de override do bloqueio | **Baixa, mas cara** | Recusada por escrito no §6, com a razão. O conserto é mudar a constante única |
| 6 | O campo virar mais um controle que não faz nada | **Média** | É o risco nomeado do briefing, e a AC5 é a resposta: entrada no `config-surfaces.test.ts` com prova **comportamental** e vermelho colado |
| 7 | Conflito de merge em `pipeline.ts` com `87-5`/`87-11` | **Baixa** | Funções distintas (1830-1855 × 1911-1915 × `loadConversationHistory`). Quem for por último rebaseia; não há dependência semântica |
| 8 | O bloqueio do painel ser lido como caminho de decisão novo e a story ser barrada na Onda 1 | **Baixa** | §7 separa os dois eixos e o bloco AC6–AC8 é **separável**, com a linha de corte já desenhada |

## Critério de rollback — escrito ANTES do deploy

**Nas primeiras 24 h (antes da migration 221):** reverter o PR. **Só isso** — nenhum dado é tocado,
porque Japurá e Solum continuam `is_active = false` e o paliativo ainda segura.
⚠️ **Não dropar a coluna** — ver a fronteira do rollback do passo 1, na tabela de deploy.

**Depois da migration 221:** reverter o PR **E** executar, **por `id`**:

```sql
update properties set is_active = false
 where id in ('fcbd2a01-7c59-48b0-8e88-f5a68f4970cd',   -- Japura
              '5694ecf1-eb53-4d9e-bb82-4c06f0b19690');  -- Solum
-- conferir: exatamente 2 linhas afetadas
```

Sem isso, o rollback **recoloca os dois no contexto da Nicole**, que é o defeito original.
*(Era `where slug in ('japura','solun')`. Trocado pelo @po em 11/08: o slug `solun` é o Achado nº 1
desta story; se alguém o corrigir, este `update` afeta **0 linhas em silêncio** e o rollback falha
sem avisar — dentro de uma story que existe justamente por causa de um efeito mudo.)*

**Gatilhos, qualquer um basta:**
1. a Nicole disser *"não conheço"* / não reconhecer **Vind ou Yarden** em uma conversa;
2. 🔴 **`PROPERTY_IDENTIFIED` do VIND cair a zero em 24 h com ≥ 10 turnos** (o sintoma do
   `loadProperties` vazio).
   **@po, 11/08 — CORRIGIDO: o gatilho original ("Vind *ou Yarden*") já está disparado hoje, sem
   deploy nenhum.** Medido: o último `PROPERTY_IDENTIFIED` do **Yarden** é de **07/08**; 08, 09, 10
   e 11/08 estão em **zero**, com tráfego nos quatro dias (4, 8, 31 e 2 turnos). Aplicado à letra, o
   gatilho mandaria reverter no primeiro dia por um baseline que **antecede a story**. O Yarden é
   bursty (22 all-time, em duas rajadas); o **Vind** é o sinal contínuo (104 all-time, não-zero em
   14 dos últimos 15 dias). O Yarden sai da contagem e fica na leitura dirigida (AC11, item 4);
3. qualquer menção a `Japura`/`Solum` em `messages` (baseline **0 em 1.250 all-time**);
4. `M1` ou `M4` subirem na régua da `87-3` rodada à mão.

**Responsável nomeado: Marcos** (D7). **Sem nome, não sai.**

---

## Definition of Done

- [~] AC1–AC11 verdes, com os vermelhos **colados** e a forma de cada mutação escrita ao lado
- [x] T0 remedido, com as consultas coladas; divergências publicadas **com os dois números**
- [x] `git diff` de `buildPropertyDataContext`, `identify-property.ts`, `qualification.ts`,
      `agenda-state.ts` e `visit-slot.ts` = **0 linhas**
- [x] Os **6 testes da 75-281** verdes, sem edição
- [x] Suíte da **raiz inteira** com delta explicado; `tsc` 0 em `packages/ai`
- [~] A ordem de 4 passos respeitada, com a data/hora de cada um registrada
- [~] Migration **220** e **221** aplicadas por Management API (arquivo inteiro num POST), com o
      retorno colado — **prefixo reconferido em `supabase/migrations/` no momento do PR**
- [ ] AC3 reexecutada **depois** da 221, com diff vazio colado
- [x] Plano da janela (AC11) escrito com responsável nomeado **antes** do merge
- [x] Os 7 achados colaterais entregues ao @po/@pm — **nenhum corrigido aqui** *(@po 11/08:
      recebidos e registrados em `docs/backlog.md`; o nº 7 vai ao @pm como item de roadmap)*
- [x] **T0 inclui remedir os números que o @po publicou em 11/08** e que já divergem dos de 10/08 —
      ver a tabela de divergências no Change Log. Publicar **os dois**, com o método, sem
      sobrescrever nenhum

---

## Decisões do @po — **FECHADAS em 2026-08-11** (eram "Pendências de decisão")

> Parecer completo, com o método de cada medição: `docs/qa/po-validation-87-13.md`.

| # | Pergunta | Recomendação do @sm | **Decisão** | Em uma linha |
|---|---|---|---|---|
| **1** | `B2` (`total_units > 0`) bloqueia ou avisa? | bloqueia | 🟡 **AVISA** — e o **`B1` continua bloqueando** | O mecanismo de bloqueio fica inteiro; o `B2` sai porque **não separa nenhuma linha que existe** (tudo que ele barra, o `B1` já barrou) e porque sua ausência produz **omissão, não mentira** — o critério que a própria story usa para classificar `A1`/`A2`. §6 do Desenho |
| **2** | Papel para alterar o campo | `IMOVEIS_CREATE_ROLES` | ✅ **`IMOVEIS_CREATE_ROLES`** | Aceita, e reforçada por uma correção: `IMOVEIS_EDIT_ROLES` tem **4** papéis, não 3 — inclui `gerente-relacionamento`, que não estava nomeado. Custo medido: 3 pessoas ativas perdem, 9 mantêm. §5 do Desenho |
| **3** | AC6–AC8 ficam na Onda 1? | fica | ✅ **FICAM** | A regra de corte do epic é sobre *"caminho de decisão **da Nicole**"*; isto é validação de servidor em rota de admin, que não roda no turno dela. Com o `B2` rebaixado, o eixo "comportamento novo" cai de Médio para Baixo. §7 do Context |
| **4** | `W1-8` na tabela da Onda 1 do epic | @pm cria | 📮 **PEDIDO REGISTRADO** | Ver abaixo |

### 4. Pedido formal ao @pm — criar o item `W1-8` na tabela da Onda 1

O @sm repôs a entrada em `stories_planned` (regra "toda story nova entra no mapa no mesmo commit"),
mas **a tabela da Onda 1, no corpo do epic, não tem a linha** — e é a tabela que governa fila de
deploy, esforço, risco e dependência. Enquanto ela não existir, esta story está no mapa e **fora do
roadmap**, que é a divergência que o próprio epic registra ter acumulado por quatro stories.

**Linha proposta, já com os valores decididos nesta validação:**

| ID | Título | Resolve | Esforço | Risco | Depende de | Executor |
|----|--------|---------|---------|-------|-----------|----------|
| **W1-8** 🆕 | **Switch por empreendimento do que a Nicole fala** — `properties.nicole_enabled`, default **DESLIGADO**; migra o paliativo `is_active=false` de Japurá/Solum para o campo certo | O default invertido: hoje **cadastrar basta** para entrar na boca dela. Fecha a dívida do paliativo de 10/08, que usou o **soft delete** da tabela | S (código) / M (teste + 2 migrations ordenadas) | **Baixo / Baixo** *(regressão / comportamento novo — o 2º eixo caiu de Médio com o rebaixamento do `B2`)* | — **Fora da fila de risco da Onda 1** (não muda um byte do que a Nicole vê) | @dev + @data-engineer |

**Dois ajustes de manutenção no mesmo commit, se o @pm concordar:**
- **`R-G`** ainda diz *"migration 215"*. O real em 11/08 é **218 aplicada, 219 reservado pela 87-1,
  220/221 desta story**. É a terceira story seguida que precisa corrigir isso no próprio corpo.
- **Achado nº 7** do @sm (inventário das ~17 colunas de `properties` que o runtime da Nicole lê,
  com **`description` e `differentials` já medidas como órfãs**) é item novo, e é a **4ª fonte de
  enumeração** que falta ao `config-surfaces.test.ts`. Registrado por mim em `docs/backlog.md`.

---

## Referências

- Epic 87 §7/Onda 1 e §10 (Notas para o @sm) — *"nenhuma AC pode ser 'existe no painel'"*
- Epic 87 §1, `CR-6` (troca de empreendimento por conta própria) e `CR-7` (o modelo contraria a
  instrução explícita do sistema no mesmo turno — 10/08, Ronaldo)
- Story 75-281 (PR #371, `5ab1bb7e`) — a decisão categórica que esta story torna por-empreendimento
- Story 75-283 — `property-status.ts` como fonte única dos rótulos; foi ela que corrigiu
  `"planning"` aparecendo cru na tela quando Solun e Japura foram criados
- `packages/ai/src/config-surfaces.test.ts:1-45` — *"nada de configuração sem consumidor"*
- `docs/qa/gates/87.8-*.yml` V4/V6, F3, P1 — armadilhas de fixture, instrumento inerte, contagem
  colada
- `scratchpad/BACKUP-properties-104357.json` — os 4 registros antes do paliativo de 10/08 13:45 UTC

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

**Agent Model Used:** claude-opus-5 (@dev / Dex) · **Data:** 2026-08-11 · **Modo:** YOLO
**Branch:** `story/87-13-switch-nicole-por-empreendimento`, criada de `origin/main` em **`f885b06a`**.
⚠️ Eu comecei no branch `story/87-1-governanca-painel-agent-prompts` (PR #391, **aberto e não
mergeado**) — troquei antes de escrever a primeira linha. Nada desta story está em cima da 87-1.

---

### T0 — Remedição contra produção (`dsopqkqjkmhytudaaolv`, Management API, só `SELECT`)

Tudo abaixo é medição minha, de **11/08/2026**, com a consulta ao lado. Onde eu divirjo do @sm ou do
@po, **publico os três números** e não sobrescrevo ninguém.

**(a) Os quatro empreendimentos**
```sql
select p.name, p.slug, p.status, p.is_active, p.total_units, p.id, p.created_at,
       (select count(*) from typologies t where t.property_id=p.id)                      tipologias,
       (select count(*) from units u where u.property_id=p.id)                           unidades,
       (select count(*) from agent_media_assets a where a.property_id=p.id and a.is_active) midias,
       (select count(*) from leads l where l.property_interest_id=p.id)                  leads
from properties p order by p.created_at, p.name;
```

| nome | slug | status | `is_active` | `total_units` | tipol. | unid. | mídias | leads | `id` |
|---|---|---|---|---|---|---|---|---|---|
| Vind Residence | `vind-residence` | selling | `true` | 48 | 1 | 48 | 7 | **722** | `00000000-…-0004-…0001` |
| Yarden | `yarden` | selling | `true` | 60 | 2 | 60 | 5 | 68 | `00000000-…-0004-…0002` |
| Japura | `japura` | planning | `false` | `null` | **0** | 0 | 0 | 0 | `fcbd2a01-7c59-48b0-8e88-f5a68f4970cd` |
| Solum | `solun` ⚠️ | planning | `false` | `null` | **0** | 0 | 0 | 0 | `5694ecf1-eb53-4d9e-bb82-4c06f0b19690` |

✅ **Os quatro `id` do @po estão corretos** — conferidos por mim, um a um. O `org_id` é único e vale
`00000000-0000-0000-0000-000000000001` nas quatro linhas.

**(b) Call sites de `from("properties")`** — varredura em `packages/**/*.{ts,tsx}`, janela de 14
linhas por call site, classificando por `.insert(` / `.update(` / resto:
```
47 total · 39 SELECT com .eq("is_active", true) · 5 SELECT sem filtro · 2 UPDATE · 1 INSERT
```
✅ **Bate exatamente** com o @sm (10/08) e o @po (11/08), e os 5 sem filtro são os mesmos cinco
arquivos listados no §5 do Context.

**(c) `PROPERTY_IDENTIFIED`, all-time**
```
Vind Residence  104  (último: 2026-08-11 01:12 UTC)
Yarden           22  (último: 2026-08-07 16:05 UTC)   ← quatro dias em zero, com tráfego
Japura / Solum   AUSENTES
```
Por dia (últimos 11), `vind · yarden · turnos`: `11/08 1·0·2` · `10/08 7·0·31` · `09/08 4·0·8` ·
`08/08 2·0·4` · `07/08 1·10·22` · `06/08 1·9·24` · `05/08 5·0·16` · `04/08 4·0·11` · `03/08 6·0·38`
· `02/08 1·0·2` · `01/08 2·0·3`.
✅ **Confirma a correção C3 do @po:** o gatilho de rollback pelo Yarden já estaria disparado hoje,
sem deploy nenhum. O instrumento vivo é o **Vind**.

**(d) Janela de exposição (06/08 20:24:44 → 10/08 13:45:54 UTC)**
```
65 turnos · 15 conversas · 83 mensagens assistant · japura 0 · solum/solun 0
all-time: 1.251 mensagens assistant · 0 menções aos dois
```
✅ Bate com o @sm (65/15/83/0) e com o @po (0 menções) — **o meu all-time é 1.251, o do @po era
1.250**: drift de uma mensagem em um dia.

**Divergências, com os três números e o método:**

| medição | @sm 10/08 | @po 11/08 | **@dev 11/08** | leitura |
|---|---|---|---|---|
| leads com `property_interest_id` = Vind | 713 | 721 | **722** | drift natural (+1 sobre o @po) |
| `PROPERTY_IDENTIFIED` do Vind, all-time | 103 | 104 | **104** | estável |
| mensagens `assistant` all-time | — | 1.250 | **1.251** | +1 |

Nenhuma muda uma decisão.

---

### A ordem de deploy — o que já rodou

| # | passo | quando | quem | estado |
|---|---|---|---|---|
| **1** | **Migration 220** (`add column` + backfill nomeado) | **2026-08-11 13:13 UTC** | @dev | ✅ **APLICADA EM PRODUÇÃO** |
| **2** | Deploy do código | — | @devops | ⏳ pendente (PR não aberto — @dev não abre PR) |
| **3** | Janela de 24 h | — | @qa + **Marcos** | ⏳ pendente |
| **4** | **Migration 221** (restaura `is_active`) | — | @data-engineer | ⏳ **arquivo pronto e validado no dev; NÃO aplicada** |

> 🔴 **@devops/@qa, leiam antes de qualquer coisa:** a **220 já está em produção** e o código **não**.
> Essa é a ordem certa e a coluna é **inerte** enquanto o código não sobe (nada a lê). Mas a
> recíproca é catastrófica: **se o PR for revertido depois do deploy, NÃO derrubem a coluna** — com
> o código no ar, `.eq("nicole_enabled", true)` contra coluna inexistente cai em
> `if (error || !data) return []` e a Nicole perde **todos** os empreendimentos, sem log.

---

### AC1 — o campo, o default e o backfill (contra **produção**, depois da 220)

```
$ ./sbq.sh dsopqkqjkmhytudaaolv  # POST único, arquivo inteiro, Management API
select name, slug, is_active, nicole_enabled from properties order by created_at, name;
```
```json
[{"name":"Vind Residence","slug":"vind-residence","is_active":true, "nicole_enabled":true},
 {"name":"Yarden",        "slug":"yarden",        "is_active":true, "nicole_enabled":true},
 {"name":"Japura",        "slug":"japura",        "is_active":false,"nicole_enabled":false},
 {"name":"Solum",         "slug":"solun",         "is_active":false,"nicole_enabled":false}]
```
```
select column_default, is_nullable from information_schema.columns
 where table_name='properties' and column_name='nicole_enabled';
→ [{"column_default":"false","is_nullable":"NO"}]
```
✅ Formato idêntico ao da coluna `is_active` (que devolve `true` · `NO`), como o @po previu. E a AC
**nasceu vermelha de verdade**: antes da 220 a consulta ao `information_schema` devolvia só a linha
do `is_active`, colada no meu T0.

**AC1-(ii) — o quinto empreendimento nasce `false` e fica fora do backfill.** Rodado no **projeto de
dev `xnxvygyfyyyzwhiuoehz`** (regra: nenhum DDL experimental em produção; o blast radius de DDL é a
tabela inteira, não a linha). Semeei os 4 reais + um `Quinto Teste 87-13`, `status = 'selling'`,
`is_active = true`, criado **depois** — o caso exato que o desenho antigo poria na boca dela sozinho:

| nome | `is_active` | `nicole_enabled` |
|---|---|---|
| Vind Residence | true | **true** |
| Yarden | true | **true** |
| Japura | false | false |
| Solum | false | false |
| **Quinto Teste 87-13** | **true** | **false** ← nasceu desligado, e o backfill não o tocou |

**AC1-(i) — 🔴 a guarda de "exatamente 2 linhas".** Mutação: troquei o `id` do Yarden por um
inexistente (`…-00000000BEEF`) e reapliquei o arquivo no dev. Saída bruta:
```
ERROR: P0001: Story 87-13 / migration 220: o backfill esperava afetar EXATAMENTE 2 linhas, afetou 1.
Confira os ids contra `select id, name, slug from properties order by created_at, name` antes de
reaplicar.
CONTEXT: PL/pgSQL function inline_code_block line 17 at RAISE
```
A transação aborta inteira — conferido: nada foi gravado.

---

### 🔴 O achado que mudou o desenho dos testes: `is_active` e `nicole_enabled` são COLINEARES hoje

A primeira versão do `nicole-enabled.test.ts` deu **7/7 verdes contra o `pipeline.ts` SEM o filtro**.
O motivo não é o teste ser frouxo — é o cadastro: o paliativo de 10/08 pôs Japura e Solum em
`is_active = false`, e o backfill da 220 os deixa em `nicole_enabled = false`. **Os dois campos
concordam em todas as quatro linhas de produção**, então qualquer fixture com o estado de hoje passa
verde com o `is_active` sozinho segurando, e o teste não sabe dizer a diferença.

**A régua que discrimina é o estado PÓS-221** (`is_active = true` + `nicole_enabled = false`), que é
exatamente quando o switch passa a ser o único responsável. Está implementada como
`cadastroPos221()` e usada em todas as provas que precisam morder — o que também **antecipa a
AC9-(ii) para teste**, meses antes de alguém poder rodá-la em produção.

Registro isto porque é o tipo de verde-por-acidente que o gate da `87-8` (V4/V6) já pagou uma vez.

---

### AC3 — contexto byte a byte

O golden (`packages/ai/src/chat/__fixtures__/contexto-nicole-head-87-13.txt`, **2.035 bytes** —
`wc -c`, remedido em 11/08 para fechar o **C2** do gate; o `1.869` publicado antes estava errado) foi
gerado pelo **`loadProperties` de produção**, com a fixture real dos 4 empreendimentos, **antes** de
a linha `.eq("nicole_enabled", true)` existir — isto é, executando o comportamento do `HEAD`. Não é
réplica escrita à mão: uma réplica provaria a réplica. A proveniência ficou no próprio teste
(`AIOS_87_13_REGRAVAR_GOLDEN=1`).

- ✅ estado de hoje ⇒ `["Vind Residence","Yarden"]`, string **idêntica** ao golden (diff vazio);
- ✅ estado **pós-221** (`is_active = true` nos quatro) ⇒ **ainda idêntica** ao golden;
- 🔴 **vermelho, forma da mutação:** `japura.nicole_enabled = true` no estado pós-221 ⇒ a igualdade
  cai e a string ganha `Japura (Em planejamento)` + `ATENCAO — EM PLANEJAMENTO` (o bloco da 75-281).
  Fixado como teste permanente, não só colado aqui.

⏳ **Falta a reexecução depois da 221 em produção (AC9-ii).** O teste já cobre a forma; a conferência
contra o dado real é do passo 4.

---

### C3 do gate — a OUTRA linha do par, que ninguém segurava

**O achado é do @qa e ele o mediu:** removendo `.eq("is_active", true)` de `loadProperties`
(mutação **M2**), a suíte inteira ficava **2.174 passed · 7 expected fail — zero vermelho**. O soft
delete não tinha um único caso que o provasse.

**Por que isso é desta story, e não dívida alheia que se empurra:** o buraco é anterior — mas é esta
story que **separa formalmente os dois conceitos** (`is_active` = existe no CRM; `nicole_enabled` = a
IA fala dele) e grava a separação no `comment on column` da 220. A partir daqui são duas linhas
vizinhas, no mesmo `.eq` encadeado, que parecem redundantes — e só uma tinha teste. Deixar metade do
par guardada é a assimetria que produz regressão silenciosa: quem simplificar `loadProperties` no
próximo refactor apaga a linha sem guarda, e **um empreendimento de fato excluído volta ao contexto
da Nicole sem um único teste reclamar**.

**O instrumento** (`nicole-enabled.test.ts`, describe `C3`): uma **quinta linha** com
`is_active: false` + `nicole_enabled: true` — o estado **exato** que o `DELETE /api/properties/[id]`
produz hoje, porque `softDelete` (`api-utils.ts:29-49`) escreve **só** o `is_active` e nenhum dos
três writers de `properties` toca o switch (é o `C4` do gate, que fica no backlog).

🔴 **Vermelho — forma da mutação (M2):** remover `.eq("is_active", true)` de `loadProperties`.
**Medido, não estimado — suíte da RAIZ, inteira:**
```
 × C3 — o soft delete continua segurando … > empreendimento EXCLUIDO com o switch LIGADO
     não entra no contexto da Nicole
AssertionError: expected [ 'Vind Residence', 'Yarden', …(1) ] to deeply equal
                         [ 'Vind Residence', 'Yarden' ]
- Expected
+ Received
  [
    "Vind Residence",
    "Yarden",
+   "Sentinela 87-13 — excluido com o switch ligado",
  ]

 Test Files  1 failed | 172 passed (173)
      Tests  1 failed | 2175 passed | 7 expected fail (2183)
```
**Cai 1** — de zero para um. É a contagem inteira: **um** caso morde, e é o que se queria.

> **A régua é de UM eixo só, e isso é desenho, não sobra.** Este describe usa `cadastro()` — o estado
> de **hoje** — e **não** o `cadastroPos221()`. Nas quatro linhas de produção a colinearidade não
> atrapalha aqui (Japura e Solum saem por **qualquer** um dos dois critérios), então a única linha
> que discrimina é a sentinela, onde os dois campos **discordam**. Consequência medida: sob a
> mutação **M1** (remover `.eq("nicole_enabled", true)`) os dois casos novos ficam **verdes**, e a
> contagem da AC4 **continua exatamente 4** — remedida agora com o par novo na suíte:
> ```
>  × AC3 > continua igual ao golden DEPOIS da 221, com os dois de volta a is_active=true
>  × AC4 > (i) o `system` enviado à Anthropic não contém Japura nem Solum
>  × AC4 > (ii) 'quero saber do Japurá' NÃO identifica nada
>  × config-surfaces > properties.nicole_enabled → chat/pipeline.ts — loadProperties
>       Tests  4 failed | 2172 passed | 7 expected fail (2183)
> ```
> Um caso que caísse nas **duas** mutações mediria "existe algum filtro", não "existe **este**
> filtro" — e não distinguiria qual das duas linhas alguém apagou.

**Controle-espelho obrigatório**, mesma disciplina do resto do arquivo: restaurar o `is_active` da
sentinela (com o switch já ligado — o cenário literal de "desfazer exclusão") **a traz de volta** ao
contexto. Sem ele, o caso de cima passaria verde contra uma sentinela que `loadProperties` nunca
devolveria, por qualquer motivo bobo (shape, `org_id`), e eu estaria medindo o nada.

**O que este par NÃO fecha, e fica escrito:** ele prova que o soft delete segura na **leitura**. Não
fecha o `C4` — `softDelete` continua deixando o switch ligado ao excluir. Isso é comportamento novo,
está **fora da regra de corte da Onda 1**, e é backlog do @po.

---

### AC4 — o turno inteiro, três consumidores

`processMessage` de ponta a ponta com `createFakeSupabase` + `fakeAnthropic`, seedado com os 4 no
estado pós-221.

- (i) o `system` enviado à Anthropic **não contém** `Japura` nem `Solum`, e **contém**
  `Vind Residence` com > 1.000 chars (controle no mesmo caso: sem ele, um `system` vazio passaria);
- (ii) *"quero saber do Japura"* ⇒ **0** `PROPERTY_IDENTIFIED` e `current_property_id` segue `null`;
- (iii) **controle positivo** *"quero saber do Vind"* ⇒ **1** `PROPERTY_IDENTIFIED`, com o `id` do Vind;
- (iv) espelho: com o Japura **ligado**, o mesmo turno passa a identificá-lo — prova que o "não
  identifica" vem do switch, e não de o `identifyProperty` não saber casar o nome.

**Duas armadilhas que custaram uma volta e ficaram documentadas no teste:**
1. `processMessage` **não grava `system_events`** — ele emite por callback
   (`emit = params.onEvent ?? (() => {})`). Ler a tabela devolveria `[]` sempre e o (ii) passaria
   verde sem provar nada.
2. O turno faz **duas** chamadas a `anthropic.messages.create`; a segunda (extração) **não tem
   `system`**. Capturar a última zerava a string e o (i) passava contra `""`.

🔴 **Vermelho — forma:** apagar a linha `.eq("nicole_enabled", true)` de `loadProperties`.
```
 × AC3 > continua igual ao golden DEPOIS da 221, com os dois de volta a is_active=true
 × AC4 > (i) o `system` enviado à Anthropic não contém Japura nem Solum
 × AC4 > (ii) 'quero saber do Japurá' NÃO identifica nada — consequência declarada do §3
 × config-surfaces > properties.nicole_enabled → chat/pipeline.ts — loadProperties
      Tests  4 failed | 17 passed | 5 expected fail (26)
```
✅ **(iii) passou**, exatamente como a AC4-(iv) manda. Árvore restaurada,
`md5(pipeline.ts) = 44b957fa1b372f645c90e8afb3cb861c` antes e depois.

---

### AC5 — `properties.nicole_enabled` no `config-surfaces.test.ts`

O @po estava certo: **altera o desenho**. Foram 3 mudanças estruturais + a entrada:
- terceiro membro `comportamental` na união `Prova`;
- terceiro ramo em `executarProva`, que **passou a ser `async`** — e isso não é detalhe: um
  `executarProva` síncrono devolveria a Promise e `expect(ok).toBe(true)` avaliaria um objeto
  truthy. **Verde automático**, que é o modo de falha que aquele arquivo inteiro existe para impedir;
- o callback do `it()` virou `async`.

A prova chama o `loadProperties` **de produção** contra `createFakeSupabase`, com duas sentinelas —
uma ligada e uma desligada, **ambas com `is_active = true`**, para que o único critério em jogo seja
o switch. **As duas direções** são afirmadas.

✅ `ORFAS_CONHECIDAS` continua em **5**, com a asserção explícita (`toHaveLength(5)`) intacta — o
campo novo **não é órfã**. E o caso *"nenhuma superfície editável ficou de fora do registro"*
continua verde: ele filtra contra `registradas`, então acrescentar um id não o quebra.

🔴 **Vermelho — forma:** a mesma mutação da AC4-(iv). Mensagem, colada literal:
```
FAIL  config-surfaces.test.ts > properties.nicole_enabled → chat/pipeline.ts — loadProperties
AssertionError: properties.nicole_enabled não tem consumidor no runtime.
      editado em: painel /dashboard/properties/[id]/edit + PATCH /api/properties/[id]
      loadProperties devolveu [Sentinela LIGADA, Sentinela DESLIGADA] —
      a DESLIGADA veio junto: o campo é editável e o runtime o ignora
```

---

### AC2 / AC6 / AC7 — o servidor (`packages/web/src/app/api/properties/nicole-enabled.test.ts`, 14 casos)

Fixtures com **`is_active: true` nos dois** (correção C2 do @po): antes do passo 4, um `PATCH` sobre
o Japura em produção devolve **404**, porque tanto o `GET` (`:20`) quanto o `UPDATE` do `PATCH`
(`:96`) carregam `.eq("is_active", true)`. A régua é o teste de rota; a conferência em produção só
passa a ser possível depois da 221.

- **AC2** — `POST` com `nicole_enabled: true` no corpo ⇒ o campo **não chega ao INSERT**.
  🔴 **vermelho:** acrescentar `nicole_enabled: body.nicole_enabled` ao INSERT ⇒
  `expected undefined, received true`. `md5` restaurado.
- **AC6-(i)** — `PATCH {nicole_enabled: true}` no Japura ⇒ **422**, com
  `missing: ["tipologias"]` — **lista EXATA**, não `toContain`. Voltam junto
  `avisos: ["total_de_unidades","midias","endereco","conceito_e_entrega"]` e `faltando` com o rótulo
  legível. O campo **não grava**.
- **AC6-(ii)** — o mesmo `PATCH` no Vind ⇒ **200**, e grava. Fixturei o Vind com
  `nicole_enabled: false` **de propósito**: assim o caso é uma **transição que passa**, e não um
  no-op que devolve 200 porque a checagem nem rodou.
- **AC6-(iii)** — desligar ⇒ **200** sempre, mesmo com o cadastro vazio. A válvula.
- **AC6-(iv)** — só na transição `false → true`: `PATCH {name}` num já-ligado incompleto ⇒ 200; e
  reenviar o valor atual ⇒ 200.
- **AC7-(i)** — `MINIMOS_BLOQUEANTES` tem comprimento **1**, e é o `B1`. `toBe(1)`, nunca `>0`.
  🔴 **vermelho (ii):** promover o `B2` a bloqueio ⇒ o pré-lançamento legítimo do Risco 4
  (tipologia cadastrada, `total_units` nulo) passa a receber **422** onde a decisão 1 do @po manda
  **200 + aviso** → `expected 422 to be 200`, e mais 3 casos caem.
  🔴 **vermelho (iii):** promover o `A1` a bloqueio ⇒ o cadastro completo com 0 mídia recebe **422**
  → `expected 422 to be 200`.
  🔴 **vermelho AC6-(v):** remover a validação da rota ("movê-la para o cliente") ⇒ a AC6-(i)
  devolve **200** onde esperava 422. `md5` restaurado nas três.

---

### Três decisões que a story não previa, e por que cada uma

1. **🔴 O papel é conferido só quando o valor MUDA — e a tela só envia o campo quando ele muda.**
   A tela de edição monta o body inteiro a cada save. Se `nicole_enabled` fosse sempre enviado, um
   usuário de `obras` ou `gerente-relacionamento` — que **pode** editar o empreendimento, mas não
   pode mexer neste campo — levaria **403 ao salvar qualquer coisa**. Seria uma regressão silenciosa
   contra as **3 pessoas ativas** que a decisão 2 do @po nomeia. Fechei dos dois lados: o cliente só
   manda o campo quando ele difere do que veio do servidor, e a rota só exige
   `IMOVEIS_CREATE_ROLES` (e só roda os mínimos) quando o valor realmente muda. Coberto por três
   casos de teste, incluindo *"reenviar o valor atual não exige o papel elevado"*.
2. **O campo entra no `updateFields` de forma idempotente**, mesmo quando não muda. Se ele só
   entrasse na mudança, um `PATCH` que enviasse **apenas** o valor atual cairia no
   `"No fields to update"` (400).
3. **`nicole_enabled` não-booleano devolve 400, em vez de ser coagido.** `"true"` (string) cairia
   em `=== true` ⇒ `false` e **DESLIGARIA** a Nicole em silêncio — mudança de estado que ninguém
   pediu, na superfície que esta story existe para tornar deliberada. Falhar alto é o único
   comportamento coerente com a tese. Coberto por um caso próprio.
4. **`A2` (endereço) tem uma lista literal de placeholders** (`"a definir"`, `"a ser definido"`,
   `"-"`, `"--"`). Isso **é** julgamento de conteúdo, que a regra de desenho proíbe — **para
   bloqueios**. Como `A2` só **avisa**, o custo de um falso positivo é uma frase a mais na tela, e
   sem isso o aviso nunca dispararia no único caso real que existe (os dois estão literalmente com
   `address = "A definir"`). A razão está escrita no módulo, ao lado da lista.

---

### Uma regressão que a suíte pegou, e que é o filtro funcionando

`packages/ai/src/chat/pipeline-historico-cauda.test.ts` (AC5 da 87-8) quebrou: a fixture
`PROPRIEDADES` traz `org_id` e `is_active` — e o comentário dela **enumera os critérios de
`loadProperties`**. Acrescentei `nicole_enabled: true` às duas linhas e atualizei o comentário para
os três critérios. É fixture, não semântica: o teste é sobre a Nicole **identificar** o
empreendimento, então ele precisa estar ligado para ela. **Zero mudança de asserção.**

---

### AC10 — suíte, tipos e árvore

**Baseline medido**, não estimado: `git stash push -u -- packages/` (só `packages/`, para o resto da
árvore não entrar na conta), suíte da raiz, depois `stash pop` com `git status` conferido
idêntico byte a byte antes e depois.

| | arquivos | testes |
|---|---|---|
| **baseline** (`packages/` em `origin/main`) | 171 | **2.152 passed · 7 expected fail (2.159)** |
| **depois** | 173 | **2.176 passed · 7 expected fail (2.183)** |
| **delta** | **+2** | **+24** |

Delta explicado teste a teste: `nicole-enabled.test.ts` (ai) **+9** · `nicole-enabled.test.ts` (web)
**+14** · `config-surfaces.test.ts` **+1** (a entrada nova gera um `it`) ·
`pipeline-historico-cauda.test.ts` **+0** (só fixture). **7 → 7 expected fail**: as 5 órfãs da 87-0
seguem intactas, e nenhuma dívida nova foi criada.

> **Remedido em 11/08, depois do gate.** Os dois casos do `C3` levam a suíte de **2.174 → 2.176**
> (`+24` no lugar de `+22`; o `nicole-enabled.test.ts` de `packages/ai` vai de 7 para 9 `it`).
> **Nenhum arquivo novo** — os casos entram no arquivo que já existia, e a contagem de arquivos
> segue **173**. Medido rodando a suíte da raiz, não estimado a partir do número anterior.

- ✅ **`npx turbo type-check lint --force` → 13/13 successful, 0 errors.** Os 24 warnings do
  `@trifold/web` são **todos pré-existentes** e **nenhum** está em arquivo que eu toquei (conferido
  por grep dos meus caminhos na saída). `packages/ai` não tem eslint — o `lint` dele é
  `tsc --noEmit`, e passou.
- ✅ **`npx turbo build --force` → 5/5 successful** (`next build` inclusive).
- ✅ **`git diff` = 0 linhas** em `identify-property.ts`, `qualification.ts`, `agenda-state.ts` e
  `visit-slot.ts`. Em `pipeline.ts` os **quatro hunks** do diff estão todos entre as linhas 1830 e
  **1867** (`C6` do gate: o último hunk é `+1865,3`, logo o intervalo fecha em 1867, não em 1866 —
  uma régua de corte com um byte de folga não é régua) — dentro de `loadProperties`.
  **`buildPropertyDataContext` (2078+) tem 0 linhas de diff**, e
  os **6 testes da 75-281** passam sem uma edição sequer.
- ✅ **Árvore restaurada e `md5` conferido depois de cada uma das 9 mutações.** Valores finais,
  **remedidos em 11/08 para fechar o `C1` do gate** (`md5 -q`, com a árvore no estado de entrega):
  `pipeline.ts` `44b957fa1b372f645c90e8afb3cb861c` · `properties/route.ts`
  `968404e7bc9a463c8ff2918ebf231a65` · `properties/[id]/route.ts`
  **`ba8ffb3ae5f6788ec101ed13716909f9`** · `nicole-minimos.ts` `d8c3b43adcc5f90fda21ee0f765c1d10`.
  > 🔴 **O `712ac34e4e2c0832e0d97d9769aece07` publicado antes estava errado, e a origem dele eu não
  > consigo provar — então não vou inventá-la.** O que está medido:
  > - o disco devolve `ba8ffb3a…` **hoje**; o @qa mediu o mesmo valor **antes** das quatro mutações
  >   dele e outra vez **depois** de restaurar. Três medições independentes, um valor só. **Não há
  >   resíduo de mutação** — o erro é de registro, não de árvore;
  > - **testei a hipótese benigna e ela caiu.** A suspeita natural era "número calculado antes da
  >   correção cosmética do comentário de `:41`". Reconstruí esse estado (troquei o comentário de 3
  >   linhas pelo de 1 linha que está no `HEAD`) e medi: **`45bad7f9113aea14d22fbaa2b08a4d22`** —
  >   **não é** o `712ac34e…`. A explicação fácil está falsificada e o estado que produziu aquele
  >   número **não é nenhum dos dois que sei reconstruir**.
  >
  > A leitura que sobra, e é a que o registro passa a carregar: **aquele `md5` nunca correspondeu a
  > um estado que eu saiba reproduzir**, e portanto a frase *"árvore restaurada byte a byte, `md5`
  > conferido"* não estava verificável para este arquivo — **justamente o que carregou o vermelho da
  > AC6-(v)**. Vale o número medido, três vezes, por duas pessoas.

---

### Migration 221 — pronta, validada, **NÃO aplicada**

O arquivo existe e foi rodado de ponta a ponta **no projeto de dev**, nas duas direções:
- caminho feliz ⇒ Japura e Solum voltam a `is_active = true` **mantendo `nicole_enabled = false`;
- **guarda de aborto que eu acrescentei** (não estava na story): se qualquer um dos dois estiver com
  `nicole_enabled = true` no momento de restaurar, ela **aborta**, porque devolver o `is_active`
  nesse estado os poria de volta no contexto da Nicole. Saída bruta:
  ```
  ERROR: P0001: Story 87-13 / migration 221: 1 dos dois empreendimentos está(ão) com
  nicole_enabled = true. Restaurar o is_active agora os devolveria ao contexto da Nicole. Abortado.
  ```
  Conferido que o aborto é **transacional**: o `UPDATE` do bloco anterior foi revertido.
- guarda de "exatamente 2 linhas", por `id` (nunca por `slug` — o `solun` é o Achado nº 1).

Banco de dev limpo depois (linhas removidas, coluna derrubada lá).

---

### AC11 — plano da janela de observação (escrito **antes** do merge)

**Responsável nomeado: Marcos (D7).** Sem nome, não sai. Início: no deploy do passo 2. Duração
mínima: 24 h.

| ordem | instrumento | como | leitura |
|---|---|---|---|
| **1** | 🔴 **`PROPERTY_IDENTIFIED` do Vind** | `select count(*) from system_events where event_type='PROPERTY_IDENTIFIED' and metadata->>'property_id'='00000000-0000-0000-0004-000000000001' and created_at > '{deploy}'` | **É o único sinal vivo.** Baseline meu, 11/08: não-zero em 14 dos últimos 15 dias, mediana ≈ 3/dia, 104 all-time. **Zero com ≥ 10 turnos ⇒ ROLLBACK** |
| **2** | Yarden | — | ⚠️ **NÃO é gatilho.** Zero desde 07/08, com tráfego em 4 dias — o gatilho original já estaria disparado sem deploy. Entra só na leitura dirigida |
| **3** | controle negativo (**saturado**) | menções a `japur`/`solum`/`solun` em `messages` `assistant` | Baseline **0 em 1.251 all-time**. Só sabe dizer *"piorou"*, **nunca** *"funcionou"* |
| **4** | amostragem dirigida | 5 conversas com turno novo, lendo se ela passou a dizer *"não conheço"* sobre **Vind ou Yarden** | é a regressão específica desta story, e é onde o Yarden é observado — por leitura, não por contagem |
| **5** | `M1` e `M4` da 87-3 | rodados **à mão** (`?dry=1`) | o cron nunca executou |

**Piso de inconclusividade:** com `n < 5` turnos, a janela **estende**; escreve-se **inconclusivo**,
nunca *"sem regressão"*. Denominador medido por mim em 11/08 (`CLAUDE_RESPONSE`/dia, 11 dias):
`3 · 2 · 38 · 11 · 16 · 24 · 22 · 4 · 8 · 31 · 2` — mediana **11**, faixa **2–38**. **3 dos 11 dias
teriam caído abaixo do piso.** Estender é o caso esperado. **Registrar o `n` observado junto do
veredito, sempre.**

---

### O que fica pendente, e de quem é

| item | dono | por quê |
|---|---|---|
| Abrir o PR e fazer o deploy (passo 2) | **@devops** | @dev não faz push nem PR |
| Reconferir o prefixo `220`/`221` na abertura do PR | **@devops** | a 87-1 (PR #391) reivindica o 219 e pode mergear antes |
| Janela de 24 h (passo 3), AC11 | **@qa + Marcos** | depende do deploy |
| Aplicar a **221** (passo 4) | **@data-engineer** | R-B, restauração de dado em produção |
| **AC9** (i/ii/iii) e a reexecução da AC3 em produção | **@qa** | só possível depois da 221 |
| Conferência visual do badge e do toggle na tela | **@qa** | `next build` passa; a leitura da tela é do gate |

⚠️ **Nada de "consertar" o slug `solun` nesta story** (Achado nº 1) — e, se alguém o corrigir antes
do passo 4, a **221 continua funcionando**, porque casa por `id`.

### Debug Log References

Nenhum bloqueio. Duas voltas, as duas registradas acima como achado: (a) o verde-por-acidente da
colinearidade `is_active`/`nicole_enabled`; (b) a captura do `system` sendo zerada pela segunda
chamada à Anthropic. Ambas viraram comentário no teste, não só correção.

### File List

**Criados (6)**

| arquivo | o quê |
|---|---|
| `supabase/migrations/220_properties_nicole_enabled.sql` | `add column nicole_enabled boolean not null default false` + backfill por `id` + guarda de 2 linhas. **✅ APLICADA EM PRODUÇÃO em 11/08 13:13 UTC** |
| `supabase/migrations/221_properties_restaura_is_active.sql` | restaura `is_active` de Japura/Solum, por `id`, com guarda de 2 linhas **e** guarda de aborto se o switch estiver ligado. **⏳ NÃO aplicada — passo 4, do @data-engineer** |
| `packages/web/src/lib/nicole-minimos.ts` | a **constante única** dos mínimos (`B1` bloqueia; `B2`, `A1`–`A3` avisam) + `avaliarMinimosNicole` (pura) + `carregarCadastroNicole` (leitura) |
| `packages/ai/src/chat/__fixtures__/properties-producao.ts` | os 4 empreendimentos **reais**, colados do banco em 11/08, na forma que o PostgREST devolve. Compartilhada por AC3 e AC4 |
| `packages/ai/src/chat/__fixtures__/contexto-nicole-head-87-13.txt` | o **golden** da AC3 (**2.035 bytes** — remedido, `C2` do gate), gerado pelo `loadProperties` de produção **antes** do filtro existir |
| `packages/ai/src/chat/nicole-enabled.test.ts` | AC3 (byte a byte, + o estado pós-221), AC4 (turno inteiro) e o par do **`C3`** (o soft delete continua segurando) — **9 casos** |
| `packages/web/src/app/api/properties/nicole-enabled.test.ts` | AC2, AC6 e AC7 — 14 casos |

**Modificados (6)**

| arquivo | o quê |
|---|---|
| `packages/ai/src/chat/pipeline.ts` | `loadProperties`: `+ .eq("nicole_enabled", true)`, `export`, e docstring. **Diff inteiro entre 1830 e 1867** (`C6` do gate: o último hunk é `+1865,3`) — `buildPropertyDataContext` com 0 linhas |
| `packages/ai/src/config-surfaces.test.ts` | 3º membro `comportamental` na união `Prova`, 3º ramo em `executarProva` (agora `async`), `it()` assíncrono, e a entrada `properties.nicole_enabled` com prova comportamental de duas direções |
| `packages/ai/src/chat/pipeline-historico-cauda.test.ts` | **só fixture**: `nicole_enabled: true` nas 2 linhas de `PROPRIEDADES` + o comentário que enumera os critérios de `loadProperties` (2 → 3). Zero mudança de asserção |
| `packages/web/src/app/api/properties/[id]/route.ts` | o bloco do switch no `PATCH` (papel `IMOVEIS_CREATE_ROLES` + mínimos, só na transição `false → true`) e a correção do comentário de `:41`, errado desde a 72-1 |
| `packages/web/src/app/api/properties/route.ts` | **nenhuma mudança de comportamento** — só o comentário que registra por que `nicole_enabled` NÃO entra no `INSERT` (AC2 é por construção) |
| `packages/web/src/app/dashboard/properties/page.tsx` | coluna e badge *"Nicole: ligada / desligada"*; `nicole_enabled` no `select`; `colSpan` 6 → 7 |
| `packages/web/src/app/dashboard/properties/[id]/edit/page.tsx` | toggle *"A Nicole pode falar deste empreendimento"* com a legenda; render da lista `faltando` item a item; e o campo só vai no body **quando muda** |

**Não tocados, por decisão escrita da story:** `cron/enrich-leads/route.ts:286` (vínculo de CRM) ·
`lib/roleta/detect-property.ts` (fora do escopo do epic) · `lib/ai/send-library-media.ts:356` ·
os outros 36 SELECT com `is_active`.

## QA Results

**Revisor:** @qa (Quinn) · **Data:** 2026-08-11 · **Rodada:** 1
**Gate:** `docs/qa/gates/87.13-switch-por-empreendimento-do-que-a-nicole-fala.yml`
**Veredito: 🟡 CONCERNS** — com 2 condições antes do merge e 3 depois do deploy.
**Método:** reproduzi tudo do zero. 4 mutações minhas, árvore restaurada e `md5` conferido; SQL
contra produção **somente `SELECT`**; toda migration rodada no projeto de **dev**
`xnxvygyfyyyzwhiuoehz`, nenhum DDL experimental em produção.

### O que eu provei, e não aceitei por relato

**1. O instrumento morde.** Removi a linha `.eq("nicole_enabled", true)` de `loadProperties` e rodei
a suíte da **raiz**:

```
 Test Files  2 failed | 171 passed (173)
      Tests  4 failed | 2170 passed | 7 expected fail (2181)
```

Os quatro, nome a nome, são os colados no Dev Agent Record. E a AC5-(iv) devolve a mensagem
**literal** exigida:

```
AssertionError: properties.nicole_enabled não tem consumidor no runtime.
```

O controle positivo da AC4-(iii) **passou** sob a mutação, exatamente como a AC manda.

**2. A saída para a colinearidade RESOLVE — não empurra.** `cadastroPos221()` põe `is_active = true`
nas quatro linhas. Nesse estado o `is_active` fica com poder discriminante **zero** (não pode
excluir ninguém) e o `nicole_enabled` é o único critério capaz de tirar Japura e Solum da lista. Não
é a variável de confusão deslocada para outro par de campos — é anulada por construção.
**Contei os que NÃO caem** e os três estão certos em não cair: o golden de não-regressão (que por
definição tem de ficar verde ao remover a linha) e os dois controles-espelho, declarados passantes
nas duas direções. Nenhum teste que a story afirma que morde deixou de morder.

**3. A proveniência do golden, sem confiar no relato.** Sob a mesma mutação, a query tem exatamente
a semântica do `HEAD` — e o caso "bate byte a byte com o golden do HEAD" ficou **verde**. Um golden
gravado depois do filtro (circular) não sobreviveria a isso.

**4. As três decisões fora da story, cada uma com vermelho próprio que eu reproduzi.**

| decisão | mutação minha | resultado |
|---|---|---|
| (a) papel/mínimos só quando o valor **muda** | `const muda = true` | 2 vermelhos — `expected 403 to be 200` e `expected 422 to be 200`. É literalmente a regressão contra os 3 usuários de `obras`/`gerente-relacionamento` |
| (b) não-booleano ⇒ **400** | guarda de tipo removida | teste cai (`expected 200 to be 400`); e com **sonda própria**: `PATCH { nicole_enabled: "true" }` ⇒ **`status=200 nicole_enabled_final=false`** — a Nicole é desligada em silêncio, com resposta de sucesso. A guarda é load-bearing |
| (c) guarda de aborto da 221 | estado envenenado no **dev** | aborta com a mensagem colada — **e `is_active` dos dois continuou `false`**. O `UPDATE` do primeiro `do $$` foi revertido: é transacional de fato. A guarda de 2 linhas da 221 também aborta e também reverte. Caminho feliz devolve a saída exata da AC9 |

**5. Produção, medida por mim.** As 4 linhas idênticas às coladas; `nicole_enabled` com
`column_default = false`, `is_nullable = NO`, `boolean`. **A 221 não foi aplicada.** A coluna é
inerte e o deploy do passo 2 é seguro.
Divergência publicada, sem sobrescrever ninguém: leads do Vind **713** (@sm) × **721** (@po) ×
**722** (@dev) × **723** (@qa, 11/08) — drift de +1, mesma leitura.

**6. Escopo, suíte e tipos.** `git diff` = 0 linhas em `identify-property.ts`, `qualification.ts`,
`agenda-state.ts`, `visit-slot.ts` (conferido nos caminhos **reais**, em `flows/`) e em
`property-data-context.test.ts`. Os 4 hunks de `pipeline.ts` caem dentro de `loadProperties`;
`buildPropertyDataContext` (`:2099`) tem 0 linhas. Os **6 testes da 75-281** estão sem edição e
passam. Suíte **2174 passed | 7 expected fail (2181)** e `turbo type-check lint --force`
**13/13, 0 errors**, com **zero** warning em arquivo tocado. Tudo bate exatamente.

**7. Um risco que fixture nenhuma enxerga, e que passa.** `carregarCadastroNicole` conta
`typologies` e `agent_media_assets` **pelo cliente do usuário**, sob RLS — se alguma policy negasse,
o `count` voltaria 0 e o `B1` bloquearia todo mundo de ligar, invisivelmente. Conferi as policies em
produção: `typologies_select` e `ama_select` liberam SELECT para qualquer usuário da org. **Passa.**

### O que não fecha

| # | sev | achado |
|---|---|---|
| **C1** | baixa | **Um dos quatro `md5` não bate.** `properties/[id]/route.ts`: declarado `712ac34e…`, medido `ba8ffb3a…` — antes das minhas mutações e igual depois de restaurar. Os outros três batem. Não há resíduo (li o arquivo inteiro e derrubei cada guarda para provar), mas para o **único arquivo que carregou o vermelho da AC6-(v)** a frase "árvore restaurada byte a byte, `md5` conferido" **não é verificável** |
| **C2** | baixa | **O tamanho do golden não bate:** declarado 1.869 bytes, medido **2.035** (bytes = chars, 21 linhas). Imaterial — a proveniência eu provei por outro caminho —, mas é o segundo número do registro que não fecha |
| **C3** | **média** | 🔴 **Nenhum teste segura o `.eq("is_active", true)` de `loadProperties`.** Rodei a mutação complementar que ninguém pediu — removi a **outra** linha do par — e a suíte ficou **2174/2174 verde, zero vermelho**. O buraco é anterior à story, mas é **esta** story que separa formalmente os dois conceitos e grava a separação no `comment on column`. A partir daqui, quem refatorar vê duas linhas parecidas e só uma tem teste — e a que não tem é a que segura o empreendimento **excluído** |
| **C4** | baixa | `softDelete` **não** desliga `nicole_enabled`. Hoje inofensivo (o `is_active` de `loadProperties` segura), mas a story acabou de criar o precedente de **restaurar** `is_active` — e precisou de uma guarda de aborto exatamente por isso. Fora da migration não há guarda nenhuma. Backlog P3 |
| **C5** | **média** | **A AC8 não tem prova nenhuma.** A story diz que as três verificações são "contra a resposta HTTP"; **duas não são** — o badge é render de server component e a lista `faltando` é estado de client component, e não há teste de render para nenhum dos dois. Por leitura o código está correto (`select` inclui o campo, ternário, `colSpan` 6→7, `<ul>` item a item, campo só vai no body quando muda) e `build` passa 5/5. **A tela eu não conferi e não é possível conferir agora** — o código não está no ar e as páginas exigem sessão. Não vou escrever que conferi o que não conferi |
| **C6** | baixa | Off-by-one: o diff de `pipeline.ts` termina em **1867**, não 1866. Cosmético, mas o intervalo é a régua de corte declarada |

### Condições

**Antes do merge** — (1) corrigir os dois números do registro (C1, C2), minutos; (2) decidir o C3:
incluir o caso que segura o `is_active` (uma fixture + um `it`, simétrico ao que já existe) ou
registrar como backlog com a razão escrita — **@dev + @po**.

**Depois do deploy** — (3) conferência visual do badge e do toggle, com print: é a única prova
possível da AC8 (**@qa**); (4) janela de 24 h com o `n` observado registrado junto do veredito, e
`n < 5` ⇒ **inconclusivo**, nunca "sem regressão" (**@qa + Marcos**); (5) 221 e reexecução da AC3 em
produção (**@data-engineer + @qa**).

### ⚠️ Avisos que este gate carrega adiante

- 🔴 **A 220 está em produção e o código não.** Ordem certa, coluna inerte. Mas **se o PR for
  revertido depois do deploy, NÃO DERRUBAR A COLUNA** — com o código no ar isso cai em
  `if (error || !data) return []` e a Nicole perde **todos** os empreendimentos, sem log.
- A **221 não foi aplicada**. Depois dela, rollback de código exige o `update … is_active = false`
  por `id` junto.
- Prefixo **220/221** a reconferir na abertura do PR — a **87-1 (PR #391) reivindica o 219** e segue
  aberta (**@devops**).
- O gatilho pelo **Yarden** continua falsificado pelo baseline. Instrumento vivo é o **Vind** (104
  `PROPERTY_IDENTIFIED` all-time, remedido hoje).

**Recomendação:** seguir para o passo 2 com as condições 1 e 2 fechadas. O código está certo, o
filtro está provado, o contexto da Nicole não muda um byte hoje, e o que falta verificar só é
verificável depois do deploy — e está com dono.

— Quinn, guardião da qualidade 🛡️

---

## Resposta do @dev ao gate CONCERNS — 2026-08-11 (rodada 1)

**Três itens fechados; três que ficam onde estão, e por escrito.**

| # | sev | o que fiz | onde |
|---|---|---|---|
| **C1** | baixa | **Corrigido.** `properties/[id]/route.ts` = **`ba8ffb3ae5f6788ec101ed13716909f9`**, remedido com `md5 -q`. E fui além do pedido: **tentei reproduzir a hipótese benigna e ela caiu** — ver abaixo | Dev Agent Record → AC10 |
| **C2** | baixa | **Corrigido.** Golden = **2.035 bytes** (`wc -c`), nos dois lugares em que o número aparecia | AC3 + File List |
| **C3** | **média** | **Fechado com código.** Um par de casos novos, mutação **medida**: M2 ⇒ **1 vermelho** (era zero) | `nicole-enabled.test.ts` |
| **C6** | baixa | Corrigido de graça: o intervalo do diff de `pipeline.ts` fecha em **1867** | AC10 + File List |
| **C4** | baixa | **Não corrigido, de propósito.** É comportamento novo (`softDelete` passar a escrever o switch), **fora da regra de corte da Onda 1**. Backlog do @po, como o gate propõe | — |
| **C5** | **média** | **Não inventei teste para fingir cobertura.** As duas verificações de tela exigem sessão e o código não está no ar; o gate registrou como não verificável e está certo. Fica com o @qa, no passo 3 | — |

### C1 — a hipótese fácil está falsificada, e isso vale mais que o número

O pedido era recalcular. Recalculei: **`ba8ffb3a…`**, igual às duas medições do @qa (antes das
mutações dele e depois de restaurar). **Três medições, um valor** — não há resíduo de mutação.

Mas o gate levantou uma hipótese benigna — *"número calculado antes da correção cosmética do
comentário de `:41`"* — e eu não ia publicá-la como causa sem medir. **Reconstruí exatamente esse
estado** (troquei o comentário de 3 linhas pelo de 1 linha do `HEAD`) e o `md5` deu
**`45bad7f9113aea14d22fbaa2b08a4d22`** — **não é** o `712ac34e…`.

Ou seja: o número declarado **não corresponde a nenhum estado que eu saiba reconstruir**. Isso não
muda o veredito — o disco está limpo e provado por três medições —, mas muda o que o registro pode
afirmar. A frase *"árvore restaurada byte a byte, `md5` conferido"* **não estava verificável** para
este arquivo, e agora está escrito que não estava, em vez de ganhar uma explicação plausível que eu
não medi.

### C3 — a decisão, e a mutação medida

**Fechei nesta story, e não é por ser barato.** O buraco é anterior — mas é **esta** story que separa
os dois conceitos e grava a separação no `comment on column` da 220. Deixar metade do par guardada é
a assimetria que produz regressão silenciosa: quem simplificar `loadProperties` apaga a linha sem
teste, e **um empreendimento de fato excluído volta ao contexto da Nicole sem nada reclamar**.

O instrumento é a quinta linha que o gate propôs — `is_active: false` + `nicole_enabled: true`, o
estado exato que o `DELETE /api/properties/[id]` produz hoje — mais o controle-espelho.

**Medido, não declarado:**

| mutação | antes (gate) | agora |
|---|---|---|
| **M2** — remover `.eq("is_active", true)` | **0 vermelhos** (2174 verde) | 🔴 **1 vermelho** · `Tests 1 failed \| 2175 passed \| 7 expected fail (2183)` |
| **M1** — remover `.eq("nicole_enabled", true)` | 4 vermelhos | **4 vermelhos**, sem alteração · `Tests 4 failed \| 2172 passed \| 7 expected fail (2183)` |

**Caiu 1 na M2, e a contagem da M1 continua 4** — isso é desenho, não sobra. O par novo usa o estado
de **hoje** (`cadastro()`), não o `cadastroPos221()`: assim a única linha que discrimina é a
sentinela, onde os dois campos **discordam**, e a régua tem **um eixo só**. Um caso que caísse nas
duas mutações mediria *"existe algum filtro"* — não diria **qual** das duas linhas alguém apagou.

### Baseline novo, remedido

**2.176 passed · 7 expected fail (2.183)** — era 2.174/7. **+2** casos, **nenhum arquivo novo** (173
arquivos, igual). `npx turbo type-check lint --force` e `npx turbo build --force` remedidos abaixo,
no Change Log. Nada em `packages/ai/src/chat/` além do arquivo de teste desta story;
`buildPropertyDataContext` e os 6 testes da 75-281 seguem com **0 linhas de diff**.

**Não fiz push nem PR** — é do @devops.

— Dex, sempre construindo 🔨

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-11 | v1.1 | **Condições 1 e 2 do gate CONCERNS fechadas — três itens, e só eles.** **`C3` (média) fechado COM CÓDIGO**, não com backlog: dois casos novos no `nicole-enabled.test.ts` (describe `C3`) com uma **quinta linha** `is_active: false` + `nicole_enabled: true` — o estado exato que o `DELETE /api/properties/[id]` produz hoje — mais o controle-espelho que a restaura. **Mutação medida, não declarada:** **M2** (remover `.eq("is_active", true)`) passa de **0 para 1 vermelho** — `Tests 1 failed | 2175 passed | 7 expected fail (2183)`, com o diff do array colado; e **M1** (remover `.eq("nicole_enabled", true)`) foi **remedida com o par novo na suíte e continua em exatamente 4** — `Tests 4 failed | 2172 passed | 7 expected fail (2183)`. Os dois casos usam `cadastro()` (estado de **hoje**) e **não** `cadastroPos221()`, de propósito: a única linha que discrimina passa a ser a sentinela, onde os dois campos **discordam**, e a régua fica de **um eixo só** — cai na M2, verde na M1. Um caso que caísse nas duas mediria "existe algum filtro", não **qual** linha alguém apagou. Razão de fechar aqui e não empurrar: o buraco é anterior, mas é **esta** story que separa os dois conceitos e grava a separação no `comment on column` da 220 — deixar metade do par sem guarda é a assimetria que devolve um empreendimento **excluído** ao contexto da Nicole sem um teste reclamar. **`C1` (baixa) corrigido, e a hipótese benigna FALSIFICADA:** `properties/[id]/route.ts` = **`ba8ffb3ae5f6788ec101ed13716909f9`** (terceira medição independente, igual às duas do @qa); o `712ac34e…` publicado estava errado, e em vez de herdar a explicação plausível eu **reconstruí** o estado *"antes da correção do comentário de `:41`"* e medi: **`45bad7f9113aea14d22fbaa2b08a4d22`** — **não é** o número declarado. Fica escrito que aquele `md5` **não corresponde a nenhum estado reconstruível**, e portanto que a frase "restaurada byte a byte" não estava verificável para o arquivo que carregou o vermelho da AC6-(v). **`C2` (baixa) corrigido:** golden = **2.035 bytes** (`wc -c`), nos dois lugares. **`C6` corrigido de graça:** o diff de `pipeline.ts` fecha em **1867**. **`C4` NÃO corrigido** — `softDelete` passar a escrever o switch é comportamento novo, fora da regra de corte da Onda 1; backlog do @po. **`C5` NÃO "coberto"** — as duas verificações de tela exigem sessão e o código não está no ar; não inventei teste para fingir cobertura, fica com o @qa no passo 3. **Baseline remedido, não estimado:** **2.174 → 2.176 passed**, `7 → 7 expected fail (2.183)`, **173 arquivos** (nenhum arquivo novo); `npx turbo type-check lint --force` **13/13, 0 errors** (24 warnings, todos pré-existentes, **zero** em arquivo tocado — conferido por grep) e `npx turbo build --force` **5/5**. `pipeline.ts` **intocado** (`md5 44b957fa…` idêntico antes e depois das duas mutações), `buildPropertyDataContext` e os 6 testes da 75-281 seguem com 0 linhas de diff. **Nenhum DDL em lugar nenhum nesta rodada** — a 221 continua **não aplicada**. **Sem push e sem PR** (@devops). | @dev (Dex) |
| 2026-08-11 | v1.0 | **Implementada. `Ready` → `Ready for Review`.** Branch `story/87-13-switch-nicole-por-empreendimento`, de `origin/main` em `f885b06a` (**não** em cima da 87-1/PR #391, que segue aberto). **T0 remedido contra produção**, com as consultas coladas: os 47 call sites (39/5/2/1) e a janela de exposição (65 turnos · 15 conversas · 0 menções) **batem exatamente** com o @sm e o @po; **três divergências publicadas com os três números** — leads do Vind 713 (@sm) × 721 (@po) × **722** (@dev), `PROPERTY_IDENTIFIED` do Vind 103 × 104 × **104**, mensagens `assistant` all-time 1.250 (@po) × **1.251**; e a medição por dia **confirma a correção C3 do @po** (Yarden em zero desde 07/08, com tráfego em 4 dias — o gatilho original estaria disparado sem deploy). **Passo 1 da ordem de deploy EXECUTADO: migration 220 aplicada em produção em 11/08 13:13 UTC**, por Management API, arquivo inteiro num POST; AC1 conferida contra produção (`column_default = false` · `is_nullable = NO`, idêntico ao formato do `is_active`) e a AC1-(ii) rodada **no projeto de dev `xnxvygyfyyyzwhiuoehz`** com um 5º empreendimento `selling` que **nasceu `false` e ficou fora do backfill** — nenhum DDL experimental em produção. **🔴 O achado que mudou o desenho dos testes:** a primeira versão do `nicole-enabled.test.ts` deu **7/7 verdes contra o `pipeline.ts` SEM o filtro**, porque `is_active` e `nicole_enabled` são **colineares** nas quatro linhas de produção (o paliativo desligou os mesmos dois que o backfill deixa desligados) — a régua que discrimina é o estado **pós-221** (`is_active = true` + `nicole_enabled = false`), implementado como `cadastroPos221()` e usado em todas as provas que precisam morder, o que **antecipa a AC9-(ii) para teste**. Duas armadilhas a mais, documentadas no próprio teste: `processMessage` **não grava `system_events`** (emite por callback — ler a tabela devolveria `[]` sempre) e o turno faz **duas** chamadas à Anthropic, a segunda **sem `system`** (capturar a última zerava a string). **7 mutações aplicadas, rodadas, lidas e revertidas com `md5` conferido**, cada uma com a forma escrita e a saída bruta colada — incluindo a da AC5-(iv), que devolve **literalmente** `properties.nicole_enabled não tem consumidor no runtime.`, e a da AC4-(iv), em que **(iii) passou** como a AC exige. **AC5 alterou mesmo o desenho do `config-surfaces.test.ts`**, como o @po avisou: 3º membro na união, 3º ramo e **assincronia** — e a assincronia não é detalhe, um `executarProva` síncrono devolveria a Promise e `expect(ok).toBe(true)` daria **verde automático**; `ORFAS_CONHECIDAS` segue em **5**. **Suíte da raiz com baseline MEDIDO** (`git stash` de `packages/`, `status` conferido idêntico depois do `pop`): **2.152 → 2.174 passed**, `7 → 7 expected fail`, **+22 testes** explicados um a um. `turbo type-check lint --force` **13/13, 0 errors** (os 24 warnings são pré-existentes e nenhum em arquivo tocado; `packages/ai` não tem eslint); `turbo build --force` **5/5**. **`git diff` = 0 linhas** em `identify-property.ts`, `qualification.ts`, `agenda-state.ts` e `visit-slot.ts`, e `buildPropertyDataContext` intocada — os **6 testes da 75-281** passam sem edição. **Três decisões que a story não previa, todas justificadas:** (1) o papel e os mínimos só são exigidos quando o valor **muda de verdade**, e a tela só envia o campo quando ele muda — sem isso, os **3 usuários de `obras`/`gerente-relacionamento`** levariam **403 ao salvar qualquer coisa**, uma regressão silenciosa contra exatamente as pessoas que a decisão 2 do @po nomeia; (2) o campo entra no `updateFields` de forma **idempotente**, senão um PATCH só com o valor atual cairia em 400; (3) o `A2` ganhou uma **lista literal** de placeholders de endereço — julgamento de conteúdo, permitido **só** porque `A2` avisa e nunca bloqueia, e sem ele o aviso jamais dispararia no único caso real (`address = "A definir"` nos dois). **Uma regressão pega pela suíte e corrigida como fixture:** `pipeline-historico-cauda.test.ts` (AC5 da 87-8) enumerava os critérios de `loadProperties` e faltava o terceiro — `nicole_enabled: true` nas 2 linhas, **zero mudança de asserção**. **Migration 221 escrita e validada de ponta a ponta no dev, mas NÃO aplicada** (é o passo 4): casa por `id`, tem guarda de 2 linhas **e** uma **guarda de aborto que eu acrescentei** — se qualquer um dos dois estiver com `nicole_enabled = true` na hora de restaurar, ela aborta, porque devolver o `is_active` nesse estado os poria de volta no contexto; conferido que o aborto é **transacional**. **Plano da janela (AC11) escrito antes do merge, com Marcos (D7) nomeado**, o Vind como único instrumento vivo, o Yarden fora da contagem, o controle negativo rotulado como **saturado** (0 em 1.251) e o piso de `n < 5` com o denominador medido (mediana 11/dia, faixa 2–38; **3 dos 11 dias cairiam abaixo**). **Pendentes, com dono:** PR e deploy (@devops, que também reconfere o prefixo 220/221), janela de 24 h (@qa + Marcos), migration 221 (@data-engineer), **AC9 e a reexecução da AC3 em produção** (@qa, só possível depois da 221) e a conferência visual do badge/toggle (@qa). ⚠️ **A 220 já está em produção e o código não — essa é a ordem certa e a coluna é inerte; mas se o PR for revertido depois do deploy, NÃO derrubar a coluna:** com o código no ar isso reproduz a catástrofe muda do Risco 1. | @dev (Dex) |
| 2026-08-11 | v0.2 | **Validada pelo @po (Pax) — GO, 10/10 após emendas. `Draft` → `Ready`.** Parecer: `docs/qa/po-validation-87-13.md`. **As 4 decisões estão fechadas:** (1) `B2` (`total_units > 0`) **rebaixado a AVISO**, `B1` continua bloqueando — o mecanismo de bloqueio (servidor, fail-closed, sem override) fica inteiro; o `B2` sai porque tem **poder discriminante zero** sobre o cadastro real (nenhuma linha falha `B2` e passa `B1`) e porque sua ausência produz **omissão, não mentira** — li os 4 ramos de estoque em `pipeline.ts:2128-2143` e com `total_units` nulo **nenhum ramo emite**, que é o critério com que a própria story classificou `A1`/`A2` como aviso; (2) papel = **`IMOVEIS_CREATE_ROLES`**, aceito, com a correção de que `IMOVEIS_EDIT_ROLES` tem **4** papéis e não 3 (inclui `gerente-relacionamento`, não nomeado em lugar nenhum) — custo medido: 3 pessoas ativas perdem, 9 mantêm; (3) **AC6–AC8 FICAM** na Onda 1 — a regra de corte é sobre caminho de decisão *da Nicole*, e isto é validação de servidor em rota de admin; (4) pedido do `W1-8` ao @pm **registrado com a linha da tabela já preenchida**. **10 correções obrigatórias aplicadas, todas medidas contra `main`/produção em 11/08:** 🔴 **migrations 218/219 → 220/221** (o 217 foi consumido pela 84-1 e o **218 pela 87-6, mergeada em 10/08 — `24932de3`**; o **219 está reivindicado pela 87-1**, `Ready`, linha 285 — `git log --all` não tem 219/220/221 em branch nenhuma; anotado que o prefixo `NNN_` é convenção só de repo, pois prod versiona por timestamp, e é por isso que a colisão reincide); 🔴 **AC6-(i) e AC8 não eram verificáveis no passo em que estavam** — `GET` (`:20`) e o `UPDATE` do `PATCH` (`:96`) carregam `.eq("is_active", true)`, então um PATCH em Japurá devolve **404, não 422**, até o passo 4, e `/dashboard/properties` mostra **2, não 4**; 🔴 **o gatilho de rollback nº 2 já está disparado hoje, sem deploy** — `PROPERTY_IDENTIFIED` do **Yarden** está em zero desde 07/08 com tráfego em 4 dias; o instrumento vivo é o **Vind** (não-zero em 14 dos últimos 15 dias); 🔴 **AC11 itens 1 e 2 são réguas saturadas** (0 menções em **1.250** mensagens `assistant` all-time; os dois ausentes de `PROPERTY_IDENTIFIED` all-time; e o paliativo já os tirou do contexto) — continuam em 0 quer a story suba ou não, e foram reordenados/rotulados como controle negativo, com o denominador de tráfego medido (mediana 11 turnos/dia, faixa 2–38; **3 dos últimos 11 dias cairiam abaixo do piso de n<5**); 🔴 **AC1 era não-determinística** — Japurá e Solum têm `created_at` idêntico ao microssegundo, e a story os lista em ordens opostas em dois lugares ⇒ `order by created_at, name`; 🔴 **migration 221 e SQL de rollback passam a casar por `id`, não por `slug`** — o slug `solun` é o Achado nº 1 da própria story e, se corrigido, o rollback afeta 0 linhas em silêncio (ids medidos e colados); **fronteira do rollback do passo 1** — `drop column` só vale antes do deploy, depois reproduz a catástrofe muda do Risco 1; **AC5 altera sim o desenho do `config-surfaces.test.ts`** (3º membro na união `Prova`, 3º ramo em `executarProva`, e execução assíncrona) — a linha das Fronteiras que negava isso foi corrigida; **Dev Notes**: o `fake-supabase` **não** tem "slot `properties: []`" (a palavra não aparece no arquivo) — o seed é um mapa genérico por tabela; **AC7** ganhou asserção de comprimento e o vermelho que fixa a decisão 1. **Confirmado por medição, e vale dizer o que passou:** os dois `id` do backfill estão **corretos**; a AC2 se sustenta por construção (o `INSERT` do `POST` tem lista explícita, sem o campo); os 6 testes da 75-281 existem; `ORFAS_CONHECIDAS` está em 5 com asserção explícita; os 47 call sites de `from("properties")` conferem; nenhum escritor de `properties` ressuscita `is_active`. **Divergências publicadas com os dois números** (@sm 10/08 × @po 11/08): leads do Vind **713 × 721**; `PROPERTY_IDENTIFIED` do Vind **103 × 104**. | @po (Pax) |
| 2026-08-10 | v0.1 | Criação. Switch `properties.nicole_enabled`, **default DESLIGADO**, filtro em `loadProperties`, migração do paliativo `is_active=false` de volta para o campo certo em 4 passos ordenados. Tudo medido contra produção em 10/08: 4 empreendimentos com contagens, **47 call sites de `from("properties")` — 39 SELECT com `is_active`**, `PROPERTY_IDENTIFIED` all-time (Vind 103 · Yarden 22 · os outros **ausentes**), exposição de **65 turnos em 15 conversas** com **0 menções**. **Premissa do briefing CORRIGIDA:** a entrada dos dois no contexto **foi** autorizada — pela Story 75-281 (PR #371, em `HEAD`), decisão categórica por `status='planning'` cuja guarda é **instrução em prompt**; o que falta é granularidade e um default seguro. **Recomendação sobre bloquear × avisar: BLOQUEAR**, no servidor, com mínimos **estruturais** (contagem, nunca conteúdo) e sem override — bloco AC6–AC8 **separável**. Campo entra no `config-surfaces.test.ts` com prova **comportamental** e vermelho exigido. 7 achados colaterais registrados, nenhum corrigido. | @sm (River) |
