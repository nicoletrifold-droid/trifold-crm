# Validação @po — Story 87-16, **AC9 apenas**

**Validador:** @po (Pax) · **Data:** 2026-08-16
**Escopo:** **só a AC9** (acrescentada pelo @sm depois do meu GO de 8,5/10). As **AC1–AC8 não são
reabertas** — em especial a **AC1**, o bloqueante (o `ai_summary` em **59,3 %** dos turnos).
**Parecer anterior:** `docs/qa/po-validation-87-16.md`
**Base:** produção `dsopqkqjkmhytudaaolv`, Management API, **somente `SELECT`** · repo em
`/Users/ogabrielhr/trifold-crm`

---

## VEREDITO: 🟢 **GO** — a AC9 entra, **T10–T13 destravadas**

Reproduzi a AC9 inteira. **Tudo que ela declara bate ao número.** Achei **dois defeitos novos**,
os dois de **régua** e os dois **corrigidos por mim no corpo** (`[@po 16/08 · AC9]`) — nenhum deles
muda o que a AC afirma, os dois mudam **como** ela é executada. Devolver a story por isso seria
churn, e é a mesma decisão que tomei na rodada anterior.

⛔ **A ratificação do `D2-(c)` pelo Gabriel continua sendo condição de MERGE.** A AC9 não toca nisso.

---

## 1. O que eu reproduzi, e bateu

| Alegação da AC9 | O que eu medi | |
|---|---|---|
| População **1.162** arquivos `.ts/.tsx` | **1.162** | ✅ ao número |
| **115 relações + 23 RPCs = 138** | régua por arquivo + exclusão de dono ⇒ **125 nomes − 10 buckets = 115** · **23** RPCs · **138** | ✅ ao número |
| Regex **por linha** perde **4 de 23** RPCs | por linha **19**, e faltam **exatamente** `get_analytics_summary`, `get_system_events_summary`, `get_whatsapp_cost_summary`, `get_whatsapp_volume_summary` | ✅ os 4 nomeados |
| Sem exclusão de dono, `Buffer.from(` polui | colhe `nao sou imagem`, `${username}:${password}`, `<svg xmlns=` | ✅ |
| **Vermelho: 3 de 138** | `lead_facts`, `lead_memories` (`to_regclass` null) + `match_lead_memory` (0 procs) — **e mais nada** | ✅ |
| **7 sítios de produção** | `loader.ts` ×3, `pipeline.ts` ×3, `writer.ts` ×1 | ✅ |
| Privilégio sem falso vermelho | **0 de 113** relações sem `SELECT` p/ `service_role` | ✅ |
| `information_schema` **122** × `pg_class` **123** | **122 × 123**, e `meta_campaign_roas` é `relkind='m'`, invisível ao `information_schema` | ✅ |
| `schema_migrations` erra nos dois sentidos | **120 linhas**, última `20260710171933`; `012` **registrada**; `217…230` no repo, aplicadas, **não registradas**; **251** migrations, maior prefixo **230** | ✅ |
| Lista à mão apodrece | régua minha: **60 → 135** objetos em 90 d; arquivos **396 → 1.172**; migrations **53 → 251** | ✅ mesma ordem |
| Ponto cego `.from(variável)` | **14 storage + 2 de produção** (`api-utils.ts:35` `softDelete`, `fvs/page.tsx:20`) | ✅ |
| *"Custo hoje 0 de 138"* | os **7** nomes (`kanban_stages`, `leads`, `properties`, `knowledge_base`, `fvs_locais`, `fvs_servicos`, `fvs_equipes`) entram por sítio literal — **conferido nome a nome** | ✅ |

**As três mutações, rodadas:**

```
M1 relacoes (com exclusao de dono): [ 'tabela_que_nao_existe_87_16' ]      +1 ✅
M2 RPC por ARQUIVO: [ 'rpc_que_nao_existe_87_16' ]                        +1 ✅
M2 RPC por LINHA  : []                                                  <-- ZERO
M3 COM exclusao de dono: [ 'leads' ]                          +0, VERDE ✅
M3 SEM exclusao de dono: [ 'tabela_m3_87_16', 'leads' ]       falso positivo
```

**A M2 faz exatamente o que ele diz que faz:** por arquivo acha, **por linha acha zero**. É a
mutação que separa as duas granularidades, e sem ela um extrator por linha passaria na AC9 perdendo
4 RPCs reais em silêncio.

### O achado que corrige um achado antigo do épico — confirmado

`epic-87:177` diz, textualmente: *"faltam só `lead_facts`, `lead_memories` e a view
`meta_campaign_roas`"*. **A view não falta.** Ela existe como **materialized view** e é consultada
em `meta-ads/campaigns/[campaign_id]/route.ts:398` — quem não a via era a régua da auditoria
(`information_schema`), que é justamente a que a AC9 proíbe. **Um achado do épico era falso positivo
de instrumento**, e a correção está certa no corpo da story.

---

## 2. 🔴 Dois defeitos novos — medidos, corrigidos por mim no corpo

### 2.1 **A T10 envenena a T11.** As fixtures do extrator entram na lista de alvos.

Os **188 `.test.ts` estão dentro dos 1.162** — e a prova disso já estava na própria story: o
`Buffer.from("nao sou imagem")` dos falsos positivos vem de `marketing/arte-cta.test.ts:207`. Hoje
**1 nome real já entra na lista por arquivo de teste** (`agent_prompt_versions`).

**E o problema é estrutural, não hipotético: a fixture da M1 é, POR CONSTRUÇÃO, um nome que o
extrator TEM de colher e que a produção TEM de não ter.** Escrevi a `referenced-objects.test.ts` do
jeito óbvio e rodei o extrator sobre ela:

```
o extrator, rodando sobre o proprio arquivo de teste, colhe:
  relacoes: [ 'tabela_fixture_a' ]
```

⇒ `db:objects:check` daria **`EXIT=1` para sempre**, sobre objeto que ninguém consulta. **É o Risco
11 da própria story realizado pela própria T10** — falso vermelho vira ruído, ruído vira desligado.
E a saída fácil sob pressão é pôr o arquivo no ignore, que é **a auto-exceção que esta story proíbe
duas vezes** (Armadilha 3, Risco 8). **Terceira ocorrência da mesma classe, na mesma PR.**

**Remédio, e é REGRA e não exceção:** a população varrida pelo **script** é só código de produção —
`*.test.ts(x)`, `__fixtures__/` e `__mocks__/` fora. O extrator continua função pura sobre texto
(quem define população é o script), o que preserva a testabilidade.

✅ **Custo medido, e é zero:** **1.162 → 974** arquivos e os alvos **continuam 138** — o único nome
que vinha de teste também está em `agent-prompt-versions.ts:129`. **O denominador não muda; some só
a armadilha.**

### 2.2 **O ⛔ da própria story tornava o vermelho irreproduzível.**

A DoD autorizava **T1–T9 já** e travava **T10–T13** até este parecer. Mas a **T12 exige o vermelho
antes da T1/T2**. Se o @dev exercesse a autorização e fizesse o enterro primeiro, os 3 objetos
sairiam do código, o extrator deixaria de mirá-los e o check daria **verde por ausência de alvo** —
a AC viraria insatisfazível na árvore, e a única saída seria a régua que nasce satisfeita. **A
condição que eu mesmo pus na story é que criava o buraco.**

⇒ **A ordem virou AC:** `T10 → T11 → T12 vermelha → T1/T2 → T12 verde`, com fallback por
`git worktree` no commit anterior e **a árvore declarada na saída colada**. *(Conferido hoje:
`packages/` está intocado — o vermelho ainda está disponível.)*

### 2.3 ⚠️ Precisão — M1 e M3 usavam **o mesmo literal**

A isolação está escrita (*"cada uma em arquivo temporário próprio"*), mas se ela escorregar os dois
conjuntos **colapsam** e a M3 sai verde **por ser o mesmo nome**, não pela exclusão de dono. **M3
ganhou nome próprio** (`tabela_m3_87_16`). Com nomes distintos, ela discrimina de verdade — está na
saída da §1.

---

## 3. As três desconfianças do briefing — respostas diretas

### 3.1 *"Vira o sexto controle sem consumidor? As quatro mitigações bastam?"* — **Bastam, com um aperto.**

**Não é mecanismo, e a story diz isso com todas as letras** (*"a AC9 tem DONO HUMANO, não
mecanismo"*). Sob o Artigo IV, dizer é o comportamento certo — o defeito seria vender mecanismo.

Julgando as quatro:

- **(a) nasce vermelha sobre defeito real** — é a mitigação forte, e é **qualitativamente
  diferente** do precedente. Os cinco controles mortos da `87-0` e o `prompts:check` do M7 nunca
  foram **vistos disparar**. Um controle cuja saída vermelha está colada na PR, sobre 3 objetos
  reais em 7 sítios de produção, **não pode embarcar como decoração** — e com a §2.2 corrigida, não
  pode nem ser produzido fora de ordem.
- **(d) o extrator roda em `pnpm test`** — honesto, mas **é a metade que não responde a pergunta**.
  O extrator prova o regex; ele não afirma existência. Não superestimar: metade da régua tem
  consumidor automático, e é a metade que não pode quebrar em produção.
- **(b) track record** — **conferido, e é real**: `prompts:check` está nos gates de **87.1, 87.11,
  87.12 e 87.13**. Três stories seguidas, como ele diz.
- **(c) T13 + registro no epic** — certo, e o pedido 10 ao @pm põe os dois gates no mesmo lugar.

🔴 **O aperto, e ele vem de uma medição minha.** O `prompts:check` **não** aparece no gate de
**87.14** — uma story de permissão que lê tabela. O gatilho *"toda story que ... passe a consultar
objeto de banco"* é **julgamento**, e julgamento é por onde o gate escapa. **Redação nova, que é
decidível pelo `git diff`:** *"roda quando o diff toca `supabase/migrations/` **ou** adiciona/altera
qualquer `.from("…")` / `.rpc("…")`"*. Decidir **se** o gate se aplica passa a ser mecânico; **rodá-lo**
continua humano — e essa metade a story já declara honestamente. Escrito no pedido 10 ao @pm.

### 3.2 *"Só a verde satisfaz?"* — **Não. Está travado em três lugares, e agora em quatro.**

`AC9 (D)` (*"Se der verde aqui, a régua está quebrada — pare"*), **DoD** (*"Só a verde não satisfaz
a AC"*) e **Armadilha 12**. **Não é régua que nasce satisfeita.** O que faltava não era a exigência
— era a **garantia de que o vermelho ainda existiria quando alguém fosse produzi-lo**, e isso é a
§2.2. Com a ordem virando AC, são quatro.

### 3.3 *"Reproduza ao menos a M2."* — **Reproduzida, e é a mutação mais bem desenhada das três.**

Por arquivo: `[ 'rpc_que_nao_existe_87_16' ]`. Por linha: `[]`. **Separa as duas granularidades
sem ambiguidade.** E a assimetria que ele aponta está certa: o falso negativo é multilinha, **do
mesmo lado** que me pegou na varredura de zero-import (`41/190`, depois `3/190`).

---

## 4. Checklist da AC9

| # | Item | Nota |
|---|---|---|
| 1 | Afirma a coisa certa (o **objeto**, não a migration) | ✅ — e a rejeição do caminho óbvio está **medida**, não opinada |
| 2 | Denominador declarado com a régua junto | ✅ **138**, reproduzido ao número |
| 3 | Nasce **vermelha** sobre defeito real | ✅ **3 de 138**, 7 sítios · e a ordem agora é AC (§2.2) |
| 4 | Controle positivo / negativo | ✅ os 3 ausentes × os 135 presentes, `meta_campaign_roas` entre eles |
| 5 | Mutações isoladas com contagem antes | ⚠️→✅ M1/M2/M3 rodadas; **M1 e M3 compartilhavam literal** — corrigido |
| 6 | Falha ruidosamente, nunca `exit 0` | ✅ e a proibição de `if (error) return ""` é literal |
| 7 | Pontos cegos declarados, não escondidos | ✅ três, no cabeçalho do script · custo hoje **0 de 138** |
| 8 | Não colide com AC1–AC8 | ✅ `diff` contra `735f40a8` é aditivo, exceto 3 linhas (Esforço, DoD, Achado 1) |
| 9 | Tem dono e consumidor | ⚠️→✅ humano, declarado; gatilho apertado para ser greppável |
| 10 | Não se auto-reprova | ❌→✅ **se auto-reprovava** (§2.1) — corrigido por regra, custo zero |

**Placar: 8 ✅ · 2 corrigidos por mim ⇒ 8,5 / 10. GO.**

---

## 5. Encaminhamento

| Para | O quê |
|---|---|
| **@dev (Dex)** | **T10–T13 destravadas.** 🔴 **A ORDEM é AC:** `T10 → T11 → T12 vermelha → T1/T2 → T12 verde` — **não comece pelo enterro**, ele apaga o vermelho. E a população varrida pelo **script** exclui `*.test.ts` / `__fixtures__` / `__mocks__` — **por regra, nunca por auto-exceção**; custo zero (138 alvos continuam 138) |
| **@qa (Quinn)** | T13 no gate. A saída vermelha tem de trazer **os 7 sítios**, não só os 3 nomes — o `grep` seguinte já vem pronto |
| **@pm (Morgan)** | Pedido 10 **apertado**: o gatilho do gate novo é `diff` toca `supabase/migrations/` **ou** altera `.from("…")`/`.rpc("…")`. E o pedido 11 vale: `epic-87:177` lista `meta_campaign_roas` como faltando e **isso é falso** — falso positivo de `information_schema` |
| **Gabriel** | Nada de novo. **A ratificação do `D2-(c)` continua sendo o que destrava o merge** |
| **Backlog** | **Achado 8:** régua de auditoria por `information_schema.tables` **não enxerga materialized view** (122 × 123 hoje). Qualquer paridade repo × produção escrita assim erra para o lado vermelho. E `supabase_migrations.schema_migrations` erra **nos dois sentidos** — nenhuma régua ancorada nela funciona nesta casa |

---

## 6. Nota de método

**A classe de falha desta semana tem nome, e ela apareceu três vezes na mesma PR.** Armadilha 3: o
scanner da AC6 se auto-flagra. Risco 8 (meu, na rodada passada): a AC6 reprova a AC5. Agora §2.1: o
extrator da AC9 colhe as próprias fixtures. **Toda régua que varre o repositório varre a si mesma**,
e quem escreve a régua vê o alvo, não o espelho. A pergunta que passa a valer para a próxima:
*"quando esta régua rodar, ela vai se ler?"*

**E a segunda, que é contra a minha própria condição.** O ⛔ que eu ratifiquei — *"T1–T9 podem
seguir, T10–T13 esperam"* — é o que quase apagou o vermelho que a AC9 exige ver primeiro. **Um gate
de processo é uma alteração de ordem de execução**, e ordem de execução é conteúdo de AC quando
alguma AC mede um estado que o trabalho destrói. Eu pus o gate e não conferi o que ele fazia com o
grafo de dependência entre as tarefas.

— Pax, equilibrando prioridades 🎯
