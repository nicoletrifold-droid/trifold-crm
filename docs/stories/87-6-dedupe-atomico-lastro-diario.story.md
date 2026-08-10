# Story 87-6 — O dedupe do lastro passa a ser garantia do banco, não um `if`

**Epic:** 87 (Nicole — Confiabilidade de Contexto, Estado e Enforcement) · **Status:** Ready for Review
**Item do roadmap:** **hotfix do `W0-5`** (Onda 0 — observabilidade). **Não é item da Onda 1** e
**não entra na fila de deploys dela** (ver *Arbitragem de escopo*).
**Criada por:** @sm (River) em 2026-08-08, a partir do achado **REL-001** do gate da 87-3 e da
medição do @devops sobre os dois projetos Vercel
**Formato:** Correção de infraestrutura de dados. **Zero linha no caminho de decisão da Nicole.**
**Executor:** @data-engineer (migration) + @dev (código) + @devops (aplicação e prova em prod)
**Esforço:** **S** (uma migration de 2 índices + ~40 linhas de código)
**Risco de regressão em produção:** **Baixo** — a story só mexe em `system_events` e numa rota de
cron read-only. Nada que a Nicole fala, lê ou grava é tocado.

---

> ## ⏰ ESTA STORY TEM PRAZO: **09/08/2026, 11:38 UTC**
>
> ```
> packages/web/vercel.json:180-181
>   { "path": "/api/cron/nicole-agenda-reconcile", "schedule": "38 11 * * *" }
> ```
>
> É a **primeira execução real** do cron da 87-3 em produção. Conferido por mim contra o banco de
> produção (`dsopqkqjkmhytudaaolv`, Management API, **somente SELECT**, 08/08):
>
> ```
> select event_type, count(*) from system_events
>  where event_type in ('NICOLE_AFIRMACAO_SEM_LASTRO','NICOLE_LASTRO_DIARIO', …)
>  group by 1;
> →  []      (zero linhas — o cron NUNCA emitiu; a AC6 da 87-3 segue PENDING)
> ```
>
> **O que acontece amanhã sem esta story:** os dois projetos Vercel disparam o mesmo cron, os dois
> leem o `select` de dedupe vazio, e os dois inserem. **O primeiro número de lastro do projeto — o
> que dimensiona a v1 do Epic 88 — nasce publicado duas vezes**, possivelmente com valores
> diferentes (as duas rodadas calculam `desde = now − 1 dia` com ~1 s de diferença).
>
> ### 🟢🔴 REVISÃO DO @po (08/08, 16h) — **metade do prazo fechou; a outra metade é a que importava**
>
> O Gabriel aplicou o índice do **alerta** em produção hoje, por Management API, com pré-check (zero
> colisões) e prova real (duas inserções do mesmo `message_id`, a segunda barrada com `23505`,
> sondas removidas). **Conferido por mim, `pg_indexes`, produção, 08/08:**
>
> ```
> uniq_system_events_afirmacao_sem_lastro_message
>   ON system_events (((metadata ->> 'message_id')))
>   WHERE event_type = 'NICOLE_AFIRMACAO_SEM_LASTRO' AND metadata ? 'message_id'
> ```
>
> ⚠️ **O nome e o predicado NÃO são os que esta story escreveu** (`ux_system_events_afirmacao_sem_lastro`,
> `metadata->>'message_id' IS NOT NULL`). Um `CREATE UNIQUE INDEX IF NOT EXISTS ux_…` casa por
> **nome**, não por definição — subiria um **segundo índice redundante** sobre a mesma expressão.
> A migration versionada tem de reproduzir **exatamente** o que está aplicado (AC1-a).
>
> | metade | estado em 08/08 16h |
> |---|---|
> | Índice do **alerta** (`NICOLE_AFIRMACAO_SEM_LASTRO`) | ✅ **aplicado em produção** — falta só versionar no repo |
> | Índice do **`dedupe_key`** | ❌ não aplicado |
> | 🔴 **O número diário (`NICOLE_LASTRO_DIARIO`)** | ❌ **desprotegido, e nenhum índice sozinho resolve** |
>
> ### 🔴 O que ficou de pé, e é o oposto do que a story supunha
>
> A rota emite `NICOLE_LASTRO_DIARIO` **incondicionalmente** — não há nem `select` antes dele
> (`route.ts:107-130`). E o índice (B) exige `metadata.dedupe_key`, que **o código de hoje não
> emite**: aplicá-lo agora indexaria **zero linha**. Ou seja:
>
> > **O índice que entrou protege o evento que provavelmente NÃO vai disparar** (o gate mediu
> > **0,13 alerta/dia**, e `system_events` tem **0** eventos `NICOLE_%` até agora). **O evento que
> > vai certamente ser escrito amanhã — o número que dimensiona a v1 do Epic 88 — continua sem
> > proteção nenhuma, e é impossível protegê-lo sem deploy.**
>
> `date_trunc('day', created_at)` e `created_at::date` são **STABLE**, não `IMMUTABLE`: não existe
> índice único de "um por dia" sobre a coluna. A chave tem de vir do `metadata`, e o `metadata` vem
> do código. **Não há atalho.**
>
> ### O prazo de 09/08 11:38 UTC continua vivo — só mudou de dono (AC9)
>
> Três saídas, e a escolha é do @devops **antes** de 09/08 11:38 UTC:
> 1. **Subir o código a tempo** (AC5 emite `dedupe_key` + AC1-b aplica o índice B). Cabe, se a T2/T3
>    saírem hoje — mas **não é obrigatório** e não vale atropelar o gate por isso.
> 2. **Desligar o cron no projeto Vercel não-canônico** até o código subir. É reversível e é a única
>    saída que não depende de escrever código correndo.
> 3. **Plano B — deixar rodar e limpar por SQL**, registrando no runbook que **o dia 09/08 tem duas
>    publicações do lastro e que o número vale como não-conclusivo**. O dado é recomputável a
>    qualquer momento por `?dry=1&days=1` — é a única razão pela qual o plano B é tolerável.
>
> **Qualquer uma serve. Nenhuma delas é "não fazer nada".** É a AC9.

---

## Story

**Como** engenharia da Trifold, que acabou de colocar em produção o único instrumento que compara a
fala da Nicole com o banco,
**Queremos** que a unicidade do alerta e do número diário seja **garantida pelo banco**, e não por
um `select` que precede um `insert`,
**Para que** o primeiro número de lastro do projeto — o que dimensiona a v1 do Epic 88 — não nasça
duplicado, e para que o instrumento que existe para detectar mentira não comece a vida contando
errado.

---

## Context

### O defeito, na letra do gate

> **`REL-001` (gate `87.3-reconciliacao-diaria-fala-x-banco.yml`, severity low):**
> *"O dedupe não é atômico: a rota faz `select` em `system_events` e depois insere via `logEvent`
> (fire-and-forget). Se dois projetos Vercel deployarem o mesmo `vercel.json`, os dois crons
> disparam no MESMO minuto (38 11) e podem ambos ler vazio e ambos escrever. A mitigação do Risco 4
> cobre re-execução SEQUENCIAL, não CONCORRENTE."*

```ts
// packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts:68-102
const { data } = await admin.from("system_events").select("metadata")…   // ← lê
const novos = rel.alertas.filter((a) => !jaEmitidos.has(a.message_id))
for (const a of novos) { logEvent({ … }) }                               // ← escreve
```

Entre o `select` e o `insert` não há nada. A janela é a duração da consulta.

### Por que a corrida **não** é a cauda — e este é o dado que muda a severidade

O gate classificou como `low` porque tratou a concorrência como hipótese (*"se dois projetos
deployarem o mesmo `vercel.json`"*). **O @devops mediu, e não é hipótese:** os **dois** projetos
Vercel deployam o mesmo `vercel.json` e disparam **todos** os crons — **15 dias consecutivos, 2×
em 100% deles**, e em **28/07 o intervalo entre os dois disparos foi de 1 segundo**.

> *"A corrida é o caso médio, não a cauda."* — @devops

Um dedupe `select`-depois-`insert` com 1 segundo de folga entre os concorrentes não é dedupe: é
uma aposta que ganha na maioria das vezes. E "na maioria das vezes" é exatamente o que não serve
para o artefato desta família de stories.

### O que se perde, concretamente

| evento | o que a duplicata faz |
|---|---|
| `NICOLE_LASTRO_DIARIO` | **Publica o número duas vezes.** E os dois `logEvent` saem de rodadas com `desde`/`ate` distantes ~1 s: se uma mensagem cair no meio, os dois números **divergem**. Duas publicações contraditórias da mesma métrica, no dia 1 |
| `NICOLE_AFIRMACAO_SEM_LASTRO` | Alerta em dobro por caso, e a série de eventos (que é como a M1 do epic é contada) passa a superestimar |

> **Numa família de stories cuja tese é *"um instrumento que mente é pior que um que falha"*, o
> instrumento nascer contando em dobro não é `low`.** O gate está certo sobre o impacto de negócio
> (Telegram morto, ninguém acorda) e subdimensiona o impacto sobre **o lastro** — que é a razão de
> o `W0-5` existir e o insumo do `PM2` do Epic 88.

---

## Arbitragem de escopo — **story própria, e pequena**

> A pergunta que o Gabriel colocou: cabe como story própria ou como correção dentro da `87-7`
> (`W1-3b`) ou da `87-8` (`W1-1`)? **Decisão: story própria, e a razão principal é o relógio.**

| # | Razão | Peso |
|---|---|---|
| 1 | **Prazo em horas contra uma fila com janelas de 24 h.** A `87-7` é o **deploy 2** da Onda 1 e a `87-8` é o **deploy 3**; entre eles há observação obrigatória. Pendurar um item com prazo de **amanhã** nessa fila é entregá-lo **dias** depois do prazo | **Decisivo** |
| 2 | **Artefatos disjuntos.** Aqui: `supabase/migrations/217_*`, `lib/logger.ts`, `cron/nicole-agenda-reconcile/route.ts`. Nas outras duas: `flows/lead-memory.ts`, `chat/pipeline.ts`, `cron/enrich-leads`. **Zero interseção de arquivos** | Alto |
| 3 | **Um fix de substrato por deploy (§6 item 4 do epic).** Misturar uma migration numa janela de observação de comportamento da Nicole é exatamente como se perde a resposta para *"qual dos dois mudou isso?"* | Alto |
| 4 | **Não reabrir a `87-4`.** O PR dela está em draft com gate **PASS** obtido em **3 rodadas**. Acrescentar migration + índice ali invalida um gate caro por uma razão que não é dela | Alto |
| 5 | **Não é da Onda 1.** É hotfix do `W0-5` (Onda 0, observabilidade). **A regra de corte da Onda 1 não a alcança** — e, de todo modo, esta story não adiciona caminho de decisão nenhum | Médio |

**O preço de ser story própria é uma story a mais no epic. O preço de não ser é o prazo perdido.**

---

## Desenho

### 1. A garantia muda de camada: o `if` sai, o índice entra

```
HOJE          select(system_events) → filtra em JS → insert (fire-and-forget) → Telegram
                    ↑ dois processos leem o mesmo vazio

ENTREGA       insert com UNIQUE no banco  →  ganhou?  → sim: Telegram
                                                      → não (23505): silêncio, já foi alertado
```

**O `insert` vira a reivindicação (*claim*).** Quem consegue gravar a linha é quem alerta. Não há
janela entre ler e escrever porque **não se lê**.

### 2. A migration — `217`, dois índices

> **Numeração conferida em 08/08:** o maior prefixo local é **`216_clientes_cpf_normalizado.sql`**
> (o epic, em **R-G**, ainda diz 215 — desatualizou). `git log --all` não tem nenhum `217_`.
> **Próximo livre: `217`.**

> 🔴 **CORRIGIDO PELO @po (08/08):** o índice (A) **já está em produção** com **outro nome e outro
> predicado**. A migration versionada tem de ser **cópia literal do aplicado** — senão o `IF NOT
> EXISTS` (que casa por nome) cria um **segundo índice redundante** sobre a mesma expressão.

```sql
-- 217_system_events_dedupe_nicole.sql

-- (A) JÁ APLICADO EM PRODUÇÃO em 08/08 por Management API (Gabriel), com pré-check e prova
--     `23505`. Esta migration existe para VERSIONAR o que já está no ar — o DDL abaixo é cópia
--     literal de `pg_indexes` (conferido pelo @po em 08/08). Não "melhorar" o nome nem o predicado.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_system_events_afirmacao_sem_lastro_message
  ON system_events ((metadata ->> 'message_id'))
  WHERE event_type = 'NICOLE_AFIRMACAO_SEM_LASTRO'
    AND metadata ? 'message_id';

-- (B) NÃO aplicado. Protege QUALQUER evento que se declare deduplicável. Opt-in por metadata:
--     evento sem `dedupe_key` não é tocado — nenhum dos 11.677 eventos existentes entra.
--     ⚠️ Este índice só passa a ter efeito DEPOIS do deploy da AC5 (é o código que emite a chave).
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_events_dedupe_key
  ON system_events (event_type, (metadata->>'dedupe_key'))
  WHERE metadata->>'dedupe_key' IS NOT NULL;
```

> **Diferença semântica entre os dois predicados, para o registro:** `metadata ? 'message_id'`
> (aplicado) inclui a linha com `{"message_id": null}`; `metadata->>'message_id' IS NOT NULL`
> (proposto) a excluiria. Na prática empatam — o valor indexado seria `NULL` e o btree admite
> múltiplos `NULL`. **Não é razão para trocar o que está no ar.**

> **Por que (B) é genérico e (A) é específico, e não os dois iguais.** (A) precisa valer **sem
> deploy**, então tem de casar com o `metadata` que já existe hoje. (B) é a forma que o projeto
> passa a ter para dizer *"este evento é único"* sem uma migration nova a cada vez — e é o que
> serve o `NICOLE_LASTRO_DIARIO`, cujo `metadata.janela` **não serve de chave**
> (`{desde, ate, dias}` com instantes que mudam a cada execução — `agenda-reconcile.ts:379`).
>
> **Custo de criar os índices, medido por mim em 08/08 (read-only):**
> `system_events` = **11.677 linhas / 16 MB**; `metadata->>'message_id'` presente em **0** linhas;
> `metadata->>'dedupe_key'` em **0**. `CREATE UNIQUE INDEX` simples (sem `CONCURRENTLY`) é
> instantâneo nesse tamanho e **não pode falhar por duplicata pré-existente** — não há nenhuma.
> **Reconferir na hora de aplicar** (AC1-i): o número é de hoje, não é uma lei da natureza.

### 3. O código — `logEventOnce`, e ele é ADAPTAÇÃO, não função nova paralela

```ts
// packages/web/src/lib/logger.ts — ao lado do logEvent, reusando o mesmo payload
export async function logEventOnce(
  params: LogEventParams & { dedupe_key?: string }
): Promise<{ inserted: boolean }>
```

- **Aguardado** (`await`), ao contrário do `logEvent`. Isso mata de lambuja o **REL-002** do gate
  (*"`logEvent` é a última instrução antes do `return` e nada mantém a lambda viva"*) para estes
  dois eventos: agora a inserção acontece **dentro** da request.
- Violação de unicidade (**`23505`**) **não é erro**: devolve `{ inserted: false }`. Qualquer outro
  erro continua indo para o `console.error` do `LOGGER_FALLBACK`, como hoje.
- O `console.log`/`warn`/`error` de sempre continua acontecendo — **os logs do Vercel não mudam**.

> **Por que não `.upsert(..., { ignoreDuplicates: true })`:** o `on_conflict` do PostgREST recebe
> **nomes de coluna**, e os nossos índices são sobre **expressão** (`metadata->>'…'`). Não há como
> apontá-los. Tratar o `23505` funciona com índice de expressão, com índice parcial, e não depende
> de o PostgREST inferir nada. **É a solução mais simples que o banco realmente suporta.**

### 4. A rota — o `select` de dedupe **sai**

```ts
// nicole-agenda-reconcile/route.ts
for (const a of rel.alertas) {
  const { inserted } = await logEventOnce({ …, metadata: { …, message_id: a.message_id } })
  if (inserted) fila_de_telegram.push(a)          // ← alerta só de quem reivindicou
}
await logEventOnce({ event_type: "NICOLE_LASTRO_DIARIO", dedupe_key: `lastro:${orgId}:${diaBrt(ate)}:${dias}d`, … })
```

**Três subtrações num golpe:**

| some | por quê |
|---|---|
| o `select` de dedupe (~20 linhas) | a garantia mudou de camada; e com ele morre o **REL-003** do gate (*"o select não tem `.limit()` nem filtro por `message_id`, depende do teto de 1000 do PostgREST"*) |
| o `Set` `jaEmitidos` e o `filter` | idem |
| o risco do **REL-002** nestes dois eventos | a escrita passa a ser aguardada |

- `diaBrt` **já existe e já é exportado** do módulo da 87-3 (`agenda-reconcile.ts:206`). **Usar,
  não recriar** — a convenção de dia BRT do relatório é a mesma.
- `alertas_deduplicados` no JSON de resposta passa a ser `rel.alertas.length − reivindicados`.
- **`?dry=1` continua sem escrever nada.** O short-circuit já precede tudo (`route.ts:61`) e o @qa
  provou o vermelho dele (R9). **Não mover essa linha.**

---

## Acceptance Criteria

> Toda AC diz **como se verifica**. Todo teste de regressão exige o **vermelho colado** — sob
> mutação, e com a contagem de vermelhos conferida (é a nota de processo `D5` da 87-4: contar
> vermelho é barato e é o que sobra escrito).

**AC1-a — ✅ (metade já feita) O índice do ALERTA está aplicado, e o repo passa a ter a versão dele.**
- (i) **Feito em 08/08 pelo Gabriel**, por Management API, com pré-check (zero colisões) e prova
  real: duas inserções do mesmo `message_id`, a segunda barrada com **`23505`**, sondas removidas.
  **Colar o log dessa execução no Dev Agent Record** — é a evidência da AC, e ela não se repete.
- (ii) 🔴 **O que falta é o repo:** criar `217_system_events_dedupe_nicole.sql` com o DDL **idêntico
  ao aplicado** (nome `uniq_system_events_afirmacao_sem_lastro_message`, predicado
  `metadata ? 'message_id'`).
- (iii) **Prova de que o arquivo casa com o banco, e ela é a AC:** rodar o arquivo inteiro num POST
  contra produção e conferir que `pg_indexes` continua com **exatamente 8 índices** em
  `system_events` (7 pré-existentes + o do alerta) — ou **9** depois da AC1-b. **Se aparecer um
  índice a mais do que o esperado, a migration divergiu do que está no ar e a AC falhou.**
  ```sql
  select indexname, indexdef from pg_indexes where tablename='system_events' order by indexname;
  ```
- (iv) `supabase db push` é **proibido** neste projeto (**R-G**; runbook `docs/runbooks/aplicar-209-210.md`).

**AC1-b — 🔴 O índice do `dedupe_key` é aplicado, e a prova é no banco.**
- (i) Pré-check: `select count(*) from system_events where metadata ? 'dedupe_key';` → **esperado 0**
  (referência minha, 08/08: 0 sobre 11.677 linhas).
- (ii) **A prova, e ela não é em vitest** — `createFakeSupabase` não implementa índice único, então
  nenhum teste TypeScript prova esta AC. Rodar contra o banco real, **dentro de uma transação
  desfeita**:
  ```sql
  BEGIN;
    INSERT INTO system_events (level,category,event_type,message,metadata)
      VALUES ('info','ai','NICOLE_LASTRO_DIARIO','t1','{"dedupe_key":"prova-217"}');
    INSERT INTO system_events (level,category,event_type,message,metadata)
      VALUES ('info','ai','NICOLE_LASTRO_DIARIO','t2','{"dedupe_key":"prova-217"}');
  ROLLBACK;
  ```
  **Esperado: a segunda linha falha com `23505`.** Colar a mensagem. **`ROLLBACK` obrigatório.**
- (iii) **O vermelho:** a mesma transação, **antes** do índice, insere as duas sem erro. Colar as duas.
- (iv) ⚠️ **Declarar por escrito que este índice não protege nada até o deploy da AC5** — ele exige
  `metadata.dedupe_key`, que só o código novo emite. Aplicá-lo antes é inócuo, não é errado.

**AC2 — `logEventOnce` devolve `{ inserted: false }` no `23505` e `true` quando gravou.**
*Verifica-se:* teste unitário com o client do Supabase mockado devolvendo `{ error: { code: "23505" } }`
e, no outro caso, `{ data: [{id}], error: null }`.
**Vermelho obrigatório:** removendo o tratamento do `23505` (deixando cair no ramo de erro genérico),
o teste do caso duplicado fica vermelho. Colar contagem e mensagem.
> Qualquer erro **que não seja** `23505` continua sendo erro: teste com `{ code: "42P01" }` afirma
> `inserted: false` **e** o `console.error` do `LOGGER_FALLBACK`. Um `catch` que engole tudo
> transformaria "o banco caiu" em "já estava lá" — que é a classe de falha silenciosa que esta
> família de stories existe para não repetir.

**AC3 — 🔴 O alerta só sai para quem reivindicou — e sai por uma COSTURA, não por `sendTelegramAdminAlert`.**
*Verifica-se:* teste da rota com **dois alertas**, o primeiro devolvendo `inserted: true` e o
segundo `inserted: false` → o notificador é chamado **exatamente uma vez**, com o texto do primeiro.
**Vermelho obrigatório:** trocando o gate para `if (true)`, o teste falha com 2 chamadas.

> 🔴 **Emenda do @po (correção de canal, 08/08).** Esta story é a última a tocar as linhas 145 e 148
> antes da **87-9**. Ela **não pode recimentar o Telegram** ali. O que muda é mínimo e é só isto:
> a rota passa a chamar **uma função local `notificarAdmins(msgs: string[]): Promise<number>`**, e
> essa função hoje encapsula a chamada de hoje. **A AC3 asserta sobre `notificarAdmins`, não sobre
> `sendTelegramAdminAlert`.**
>
> **Por que isso e não a troca de canal aqui:** trocar para WhatsApp exige **template aprovado pela
> Meta** (não existe envio de texto livre iniciado por nós — os 12 templates em uso são todos
> pré-aprovados), mais a decisão de destinatário. É dependência externa, com latência e chance de
> reprovação: **não cabe numa story com prazo de horas.** Vai para a **87-9**, e com a costura
> pronta a 87-9 troca **um corpo de função** sem reabrir esta rota.
>
> **O que esta story NÃO faz e a 87-9 faz:** fazer o notificador **devolver quantos avisos
> realmente saíram** e **registrar a supressão em `system_events`**. Enquanto isso não existir,
> `notificarAdmins` pode devolver `0` e ninguém saber — que é exatamente o defeito de hoje.
> **A AC8 desta story continua sem depender de alerta nenhum**, e é por isso que ela é válida.

**AC4 — A rodada duas vezes seguidas produz UMA linha por caso.**
*Verifica-se:* teste com `createFakeSupabase` chamando o handler **duas vezes** com a mesma janela.
⚠️ **Honestidade sobre o que este teste prova:** o fake **não** implementa unicidade, então ele
prova o **contrato** (a rota não alerta quando `inserted` é falso), **não** a atomicidade. A
atomicidade é a **AC1-(iii)**, no banco. **A story não pode declarar "concorrência coberta" com
base neste teste** — foi assim que se chegou a três testes verdes sob mutação nesta semana.

**AC5 — O número diário é único por dia, por org e por janela.**
`NICOLE_LASTRO_DIARIO` passa a carregar `dedupe_key = lastro:{org_id}:{dia_brt}:{dias}d`.
*Verifica-se:* (i) teste afirmando o formato exato da chave, com `diaBrt` importado de
`@trifold/ai` (**não** reimplementado); (ii) duas execuções da janela padrão no mesmo dia → uma
publicação; (iii) uma execução `?days=60` no mesmo dia **ainda publica** (chave diferente) — a
rodada retroativa **não pode** ser engolida pela diária.

**AC6 — Nada mais da rota mudou.**
*Verifica-se:* (i) `?dry=1` continua retornando antes de qualquer escrita e de qualquer Telegram —
manter o teste do R9 do gate anterior **verde e no lugar**; (ii) `git diff --stat` mostra
**apenas** `logger.ts`, `nicole-agenda-reconcile/route.ts`, os testes dos dois e a migration;
(iii) `packages/ai` **não é tocado** — o módulo `agenda-reconcile.ts` continua byte a byte igual
(o número publicado não pode mudar por causa desta story).

**AC7 — Suíte e tipos.**
`npx vitest run` **da raiz** (⚠️ **nunca** `--reporter=basic` — removido no vitest 4, falha com exit
0) e `npx tsc --noEmit` nos dois pacotes. Os 5 arquivos que falham por dependência ausente
(`sharp`, `satori`, `pdf-lib`) são pré-existentes e não executam teste — declarar, não "consertar".
`packages/ai` **não tem eslint** (o `lint` dele é `tsc --noEmit`); `packages/web` tem.

**AC8 — Prova em produção, depois do deploy.**
- (i) `select count(*), count(distinct metadata->>'message_id') from system_events where
  event_type='NICOLE_AFIRMACAO_SEM_LASTRO';` → os dois números **iguais**;
- (ii) `select metadata->>'dedupe_key', count(*) from system_events where
  event_type='NICOLE_LASTRO_DIARIO' group by 1;` → **nenhum count > 1**;
- (iii) **fecha junto a AC6 da 87-3**, que está `PENDING` desde o gate: a linha
  `NICOLE_LASTRO_DIARIO` existir depois da primeira execução real do agendador **é** a prova por
  efeito que faltava. **Quem executa é o @devops**, e ele **nomeia o projeto Vercel** que deploya
  `packages/web` (ação requerida do gate da 87-3, ainda aberta).

**AC9 — 🔴 [@po, nova] A publicação de 09/08 do número diário tem uma decisão TOMADA, não um torcer.**
O `NICOLE_LASTRO_DIARIO` é emitido **incondicionalmente** (`route.ts:107-130`) e **nenhum índice
sozinho o protege**. Antes de **09/08 11:38 UTC**, o @devops escolhe **uma** das três saídas da
caixa de prazo e **escreve qual escolheu**, com o nome dele, no Dev Agent Record:
1. código no ar a tempo (AC5 + AC1-b);  2. cron desligado no projeto Vercel não-canônico;
3. plano B (deixar rodar + limpar por SQL + runbook dizendo que **o número de 09/08 é não-conclusivo**).

*Verifica-se, no dia 09/08 depois das 11:38 UTC:*
```sql
select id, created_at, metadata->>'dedupe_key' as k, metadata->'janela' as janela, metadata->>'lastro_pct' as pct
  from system_events where event_type='NICOLE_LASTRO_DIARIO' order by created_at;
```
- **1 linha** → saída 1 ou 2 funcionou;
- **2 linhas** → saída 3: **limpar mantendo a de menor `id`** e registrar no runbook. Se os dois
  `lastro_pct` **divergirem**, colar os dois valores — é a evidência de que a corrida é real, e ela
  vale mais para o @devops do que a discussão sobre quantos projetos disparam;
- **0 linhas** → 🔴 **o cron não rodou**. Isso é achado maior que o dedupe: a AC6 da 87-3 continua
  aberta e o instrumento inteiro não existe. Abrir como bloqueio, não como observação.

> **Nota de método do @po:** eu **não consegui corroborar pelo banco** a medição do @devops de que
> os dois projetos disparam todos os crons. `system_events` não tem **nenhum** evento com
> `source like 'cron/%'` em 15 dias, e os crons com efeito externo observável (`aviso_bolsao_gestor`,
> `alerta_sla_gestor`) **não mostram envio duplicado** em 30 dias — mas os dois têm guarda própria
> de estado, então a ausência de duplicata não prova ausência de corrida. **A evidência do @devops é
> dos logs da Vercel e continua valendo.** O que esta AC faz é transformar 09/08 na **primeira
> medição direta** da questão, num evento que não tem guarda nenhuma. Se der 2 linhas, acabou a
> dúvida.

---

## ⚠️ O alerta do Telegram está MORTO em produção — e isso afeta as três stories desta leva

```ts
// packages/web/src/lib/telegram.ts:5
if (!token || !chatId) {
  console.warn("[TELEGRAM] Admin not configured — alert suppressed:", message)
  return                                        // ← suprime em silêncio, devolve void
}
```

`TELEGRAM_BOT_TOKEN` **não está configurado em nenhum dos dois projetos Vercel**. A função devolve
`void` — quem chama **não tem como saber** que nada foi enviado. É a mesma classe de falha
silenciosa que o `loader.ts:62` (`return ""`) representa para a memória: o sistema segue em frente
achando que avisou.

**Consequência normativa, e vale para as três stories desta leva:**

> **Nenhuma AC pode depender de "o alerta chegou". Isso é inverificável hoje.**
> O que é verificável é a **linha em `system_events`** — e é por isso que a AC8 desta story, e todas
> as ACs de observação das stories `87-7` e `87-8`, se apoiam em `select` sobre `system_events`, não
> em notificação.

**Quantos crons dependem disso — duas leituras, e o método de cada uma** (a régua desta casa: quando
duas medições divergem, registram-se as duas):

| leitura | número | método |
|---|---|---|
| @devops | **6 crons** | contagem dele, no levantamento de 08/08 |
| @sm (esta story) | **4 crons + 1 rota admin** | `grep -rn "sendTelegramAdminAlert" packages/web/src`, excluindo o módulo e os testes: `cron/meta-sync-entities`, `cron/meta-sync-health`, `cron/webhook-health`, `cron/nicole-agenda-reconcile`, `admin/email-stats` |

A diferença provavelmente é de outros caminhos de notificação contados pelo @devops. **Não resolver
aqui**: o item é do @devops e a divergência fica registrada para ele arbitrar.

### 🔴 Correção do @po (08/08) — **provisionar o Telegram seria a correção ERRADA**

> **Decisão do Gabriel, 08/08: *"Não usamos Telegram e sim WhatsApp."***

**Três medições minhas que mudam o item de backlog:**

| # | medição | método |
|---|---|---|
| 1 | `TELEGRAM_BOT_TOKEN` **existe** no projeto Vercel `freelans-dev/trifold-crm` (33 envs). O que **falta** é `TELEGRAM_ADMIN_CHAT_ID` | `GET /v9/projects/{id}/env` |
| 2 | O projeto avisa por **WhatsApp com template aprovado**, e funciona todo dia: `novo_lead_corretor` (333 envios, último **hoje** 12:15), `aviso_bolsao_gestor` (56, hoje 11:35), `alerta_sla_gestor` (32), `atualizacao_obra_cliente` (688) | `whatsapp_send_log` |
| 3 | **Já existe superfície humana para o evento:** `/dashboard/sistema` lê `system_events` com filtro de `level`/`category`, e o alerta é `level: warn, category: ai` | `packages/web/src/app/dashboard/sistema/page.tsx` |

**O que isso significa, na ordem certa:**
1. `telegram.ts:5` exige token **E** chat id. Mesmo no projeto que tem o token, o alerta é suprimido.
   **"Configurar o Telegram" nunca foi uma variável — eram duas, e o canal está abandonado.**
2. O que falta **não é o registro, é o empurrão**. A linha em `system_events` já chega a um painel.
   Ninguém abre um painel para saber que a Nicole mentiu ontem.
3. **A troca por WhatsApp tem uma dependência externa que precisa estar escrita:** não existe envio
   de texto livre iniciado por nós. Os **12** templates em uso são **todos pré-aprovados pela Meta**.
   Um alerta novo exige **template novo aprovado** (latência não determinística, e pode ser
   reprovado) + decisão de destinatário (o Gabriel **não tem `phone` em `users`**; Marcos, Alexandre
   e Joabe têm; o `sla-alerts` usa a env `SLA_ESCALATION_PHONES`). **Isso não fecha até amanhã.**
4. **Existe um caminho sem dependência externa e ele já está em produção:** `sendPushToUser`
   (`lib/server/push-service.ts`), **36 assinaturas ativas**, usado pelo digest do bolsão. Serve de
   ponte enquanto o template não sai.

**Item promovido a story própria — `87-9` (@sm), P0, fora desta leva:**
- trocar o canal do `notificarAdmins` (a costura que a **AC3** desta story cria) por **WhatsApp com
  template aprovado**, com `logWhatsappSend`, no padrão do `bolsao-rebalance/route.ts:248`
  (template + botão para o painel), e **`sendPushToUser` como ponte** até o template sair;
- 🔴 **o notificador devolve resultado e registra a supressão em `system_events`.** Sem isso, trocar
  Telegram por WhatsApp só troca o canal onde o silêncio acontece: template reprovado, token
  vencido ou telefone errado voltam a ser `void`;
- **os outros 4 dependentes** (`meta-sync-entities`, `meta-sync-health`, `webhook-health`,
  `admin/email-stats`) entram na mesma story ou saem dela por escrito — não por esquecimento;
- ⚠️ `vercel env add` via pipe **grava vazio em silêncio**; usar `scripts/vercel-env-set.sh`.

---

## Dev Notes

### Mapa de código — ler antes de mexer

| arquivo | linha | o quê |
|---|---|---|
| `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts` | 61 | short-circuit do `?dry=1` — **precede tudo, não mover** |
| ” | 65-82 | o `select` de dedupe — **sai** |
| ” | 84-102 | loop de `logEvent` dos alertas → vira `logEventOnce` + fila |
| ” | 107-130 | `NICOLE_LASTRO_DIARIO` → ganha `dedupe_key` |
| ” | 136-151 | envio ao Telegram → passa a iterar a **fila de reivindicados** |
| `packages/web/src/lib/logger.ts` | 21-59 | `logEvent` — **não mudar a assinatura nem o comportamento**; `logEventOnce` é adição |
| `packages/ai/src/flows/agenda-reconcile.ts` | 206 | `diaBrt` — **exportado, usar** |
| `supabase/migrations/` | — | maior prefixo local **216** (08/08) ⇒ criar **217** |

### Armadilhas

1. **`23505` pode vir com `code` ou dentro de `message`.** O PostgREST devolve
   `{ code: "23505", message: 'duplicate key value violates unique constraint "…"' }`. Casar por
   **`code`**, e ter fallback para `message.includes("duplicate key")` **não** substitui isso.
2. **`logEvent` continua existindo e continua fire-and-forget.** Esta story **não** migra os outros
   ~200 pontos de chamada. Trocar todos seria mudança de latência no caminho quente.
3. **`org_id` pode ser `null` em `system_events`.** Por isso o `dedupe_key` carrega o `orgId`
   **dentro da string**, e não como coluna do índice: `NULL` em coluna de índice único é distinto de
   `NULL`, e o dedupe evaporaria em silêncio.
4. **Não mudar `packages/ai`.** O número publicado tem de continuar exatamente o mesmo — a
   reconciliação linha a linha do gate da 87-3 (30 disparos, 12,5 %) é o lastro que sobra.
5. **Rodar vitest da raiz.** Nunca `--reporter=basic`.

### Fronteiras com outras stories

| Item | Dono | Por quê não é aqui |
|---|---|---|
| Recalibrar a régua de lastro (31 % × 12,5 % × 7 %) | correção **B6** da 87-3 | Esta story protege a **unicidade** do número, não o número |
| `NICOLE_LASTRO_DIARIO` chegar a um humano | backlog do Telegram | Sem token não há alerta; a linha no banco é o que vale |
| `DEFAULT_ORG_ID` hardcoded (`MNT-001`) | backlog multi-tenant | O gate já registrou como "não desta story" |
| Corrigir o `DOC-001` do Dev Agent Record da 87-3 (a frase do Ailton) | **@dev, na 87-3** | Ação requerida daquele gate, ainda aberta |
| `logEvent` em geral virar aguardado | — | Fora de escopo. Latência no caminho quente |

---

## Tarefas

- [x] **T0** — Reconferir, **antes de escrever a migration**: (a) maior prefixo em
      `supabase/migrations/` e em `git log --all` (referência do @po, 08/08: **216**, e **nenhum**
      `217` no repo); (b) 🔴 **copiar de `pg_indexes` o DDL exato do índice já aplicado** — nome
      `uniq_system_events_afirmacao_sem_lastro_message`, predicado `metadata ? 'message_id'`;
      (c) `select count(*) from system_events where metadata ? 'dedupe_key'` (referência: 0 sobre
      11.677 linhas / 16 MB).
- [x] **T1-(a)** — 🔴 **Migration `217`** versionando o índice (A) **idêntico ao aplicado** (AC1-a-ii).
- [ ] **T1-(b,c)** — 🔴 **NÃO EXECUTADO PELO @dev — é escrita no banco.** Aplicar o índice (B) por
      Management API com a prova `BEGIN…ROLLBACK` e o vermelho (AC1-b), e conferir a contagem de
      `pg_indexes` (AC1-a-iii). Executor: @data-engineer / @devops. Comandos prontos no rodapé da
      migration. **Bloqueia o deploy do código** (ver Ordem de aplicação no Dev Agent Record).
- [x] **T1-b** — 🔴 **@devops, antes de 09/08 11:38 UTC:** escolher e **escrever** a saída da **AC9**
      para a publicação do número diário. Escrita pelo Gage abaixo (saída 3).
- [x] **T2** — `logEventOnce` em `logger.ts` + testes (AC2), com o vermelho colado.
- [x] **T3** — Rota: remover o `select` de dedupe, reivindicar antes de alertar, `dedupe_key` no
      diário (AC3, AC4, AC5, AC6), com os vermelhos.
- [x] **T4** — Suíte + `tsc` nos dois pacotes (AC7).
- [ ] **T5** — @devops: deploy, AC8-(i,ii,iii) **e** o nome do projeto Vercel que deploya
      `packages/web` (pendência do gate da 87-3). *(Projeto já nomeado pelo Gage abaixo.)*

---

## Riscos

| # | Risco | Sev | Mitigação |
|---|---|---|---|
| **1** | **O prazo não ser cumprido** e o primeiro número sair duplicado | **Alta** | A metade que fecha o prazo é **só a migration**, e ela **não precisa de deploy**. Plano B escrito na caixa de prazo |
| **2** | Duplicata pré-existente impedir a criação do índice | Baixa | AC1-(i) confere **antes**; medido hoje: 0. Se aparecer, a limpeza precede a migration |
| **3** | `logEventOnce` engolir erro real como se fosse duplicata | **Média** | AC2 exige o teste do `42P01` afirmando que **não** vira `inserted: false` silencioso — casar por `code === "23505"`, não por texto |
| **4** | Aguardar o insert aumentar a latência do cron | Baixa | É cron, não caminho quente. E o volume medido pelo gate é **0,13 alerta/dia** |
| **5** | A rodada retroativa (`?days=60`) ser engolida pelo dedupe diário | Média | AC5-(iii): a chave inclui `dias` |
| **6** | Alguém ler a AC4 como "concorrência coberta por teste" | **Média** | A própria AC4 declara o que **não** prova. A atomicidade é AC1-(iii), no banco |
| **7** | O índice (B) colidir com outro evento que venha a usar `dedupe_key` | Baixa | A chave inclui `event_type` como **coluna** do índice; e hoje 0 eventos usam o campo |

---

## Critério de rollback (D7) — escrito ANTES do deploy

**Reversão do código:** `git revert` do PR. **Reversão do banco:** `DROP INDEX` dos dois índices
(escrito no rodapé da migration, como o projeto já faz em `031`/`032`).

**Ordem de reversão importa:** reverter **o código primeiro**. Com o código novo e o índice
derrubado, o dedupe simplesmente deixa de existir (volta ao comportamento de hoje). Com o índice de
pé e o código antigo, o `logEvent` do perdedor passa a logar `LOGGER_FALLBACK` — barulho, não dano.

**Gatilhos:**
- qualquer erro `23505` aparecendo em evento que **não** seja um dos dois desta story;
- o cron passar a falhar (HTTP 500) — hoje ele não falha;
- `NICOLE_LASTRO_DIARIO` **deixar** de ser publicado (dedupe engolindo o que devia passar).

**Responsável nomeado:** @devops, na execução do cron de 09/08 11:38 UTC. **Sem nome, a migration
sobe assim mesmo** — ela é a proteção, não o risco. É o código que espera responsável (D7).

## Definition of Done

- [ ] AC1-a, AC1-b e AC2 a AC9 verificadas, com os **vermelhos** e os verdes colados no Dev Agent Record
- [ ] Migration `217` no repo **idêntica ao que está aplicado**, e `pg_indexes` com a contagem
      esperada (AC1-a-iii) — **nenhum índice redundante criado**
- [ ] 🔴 **AC9 decidida e escrita ANTES de 09/08 11:38 UTC**, com o nome do @devops
- [ ] `select` de dedupe removido da rota; `grep -n "jaEmitidos" packages/web/src` → **0 ocorrências**
- [ ] A rota chama `notificarAdmins`, e **`grep -n "sendTelegramAdminAlert"
      packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts` → no máximo 1 ocorrência**,
      dentro dessa função (AC3)
- [ ] AC6 da **Story 87-3** fechada por efeito, com o projeto Vercel **nomeado** (@devops)
- [ ] **REL-001, REL-002 e REL-003** do gate da 87-3 registrados como fechados por esta story
- [ ] 🔴 **Story 87-9 aberta** (@sm) — o canal do alerta. Substitui o item de backlog do Telegram:
      o achado do @po é que **provisionar o Telegram seria a correção errada**, porque entregaria o
      alerta onde ninguém olha
- [ ] **@pm avisado:** registrar no Epic 87 que o `W0-5` ganhou um hotfix (story 87-6) e que o
      prefixo de migration do **R-G** está desatualizado (diz 215; o real é 216 ⇒ 217)

---

## Referências (seção específica, não documento inteiro)

- `docs/qa/gates/87.3-reconciliacao-diaria-fala-x-banco.yml` — **`REL-001`** (o achado que origina
  esta story), **`REL-002`** (fire-and-forget como última instrução), **`REL-003`** (o select sem
  `.limit()`), e `acoes_requeridas_antes_de_Done` (a AC6 pendente e o projeto Vercel a nomear)
- `docs/stories/87-3-reconciliacao-diaria-fala-x-banco.story.md` — **Risco 4** (o dedupe como
  desenhado) e a AC4-(i)
- `packages/web/vercel.json:180-181` — o horário do cron
- `packages/ai/src/flows/agenda-reconcile.ts:206` (`diaBrt`) e `:377-403` (o formato de `janela`,
  que é a razão de o `dedupe_key` existir)
- `docs/runbooks/aplicar-209-210.md` — como aplicar migration por Management API (**R-G**: `db push`
  é proibido)
- `docs/stories/epics/epic-87-nicole-confiabilidade-contexto.md` — **§7/Onda 0** (`W0-5`), **R-G**
  (numeração de migration), **§6 item 4** (um fix por deploy)
- `.claude/CLAUDE.md` — gotcha do `vercel env add` (o item de backlog do Telegram depende dele)

---

**CodeRabbit Integration**: Disabled (sem chave `coderabbit_integration` em
`.aios-core/core-config.yaml`)

---

## Dev Agent Record

*(a preencher pelo @dev)*

### 🔴 AC9 — DECISÃO ESCRITA, com nome: **saída 3 (deixar rodar e medir)** — @devops (Gage), 08/08/2026 18:5x UTC

**Escolho a saída 3.** Não é "não fazer nada": é deixar o cron de 09/08 11:38 UTC rodar nos dois
projetos, **com regra de leitura pré-registrada** e com a saída 2 preparada e **deliberadamente não
executada**. Abaixo o porquê de cada uma.

#### Por que NÃO a saída 1 (código a tempo)

A `87-6` está `Ready`, **não implementada**. Subir código + migration `217` em menos de 17 h
significaria: @dev implementa, @qa faz gate, @devops deploya — **o terceiro deploy de produção do
dia**, correndo, para proteger uma linha `level: info`. A própria story já escreveu que *"não é
obrigatório e não vale atropelar o gate por isso"*. Concordo, e o meu voto não muda isso.

#### Por que NÃO a saída 2 (desligar o cron no projeto não-canônico) — **este é o ponto**

A saída 2 é a única que fecha sem deploy, e por isso era a candidata natural. **Recusei por três
razões, e a primeira é decisiva:**

1. **Ela troca uma falha benigna conhecida pela falha que o próprio @po nomeou como MAIOR.**
   Desligar cron na Vercel **não é por cron**: é chave de projeto — desliga os **~21** crons daquele
   projeto de uma vez. E eu **não tenho como observar o outro lado**: meu token da CLI é da conta
   `freelans-dev`; o time de produção (`team_XCf2jBxUmCXao0prWVy0VmOZ`, projeto
   `prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj`, que serve `crm.trifold.eng.br`) responde **403**. Eu não
   consigo ler o estado do agendador dele antes, nem confirmar depois que o desligamento fez o que
   eu quis. **Mexer no único instrumento de medição, sem observabilidade, na véspera da primeira
   medição dele, arrisca exatamente o `0 linhas`** — que a AC9 classifica como *"achado maior que o
   dedupe… abrir como bloqueio, não como observação"*. Trocar duplicata por risco de zero é o lado
   errado da troca.
2. **A duplicata não corrompe o número, só o portador dele.** `NICOLE_LASTRO_DIARIO` é `level:
   info`, não escreve em tabela de negócio, e o caminho de alerta é outro — e está morto:
   `/api/health` dos **dois** hosts vivos respondeu hoje, depois do deploy,
   `"Not configured: TELEGRAM_BOT_TOKEN"` (medido agora, não recuperado de memória). As duas
   execuções leem a **mesma** janela de 24 h no **mesmo** banco ⇒ os dois `lastro_pct` devem ser
   iguais. Se divergirem, **a divergência é a medida**, não o dano.
3. **A saída 2 destruiria a evidência que a AC9 existe para colher.** O @po registrou que **não
   conseguiu corroborar pelo banco** que os dois projetos disparam (`system_events` sem nenhum
   `source like 'cron/%'` em 15 dias). Este evento é o **primeiro sem guarda nenhuma**. Desligar um
   dos lados é gastar o experimento para evitar o resultado que o experimento serve para medir.

#### Correção minha, que muda o desenho da `87-6` (e reforça a AC5)

Eu disse que o índice único `uniq_system_events_afirmacao_sem_lastro_message` *"está no ar e
funciona"*. **Funciona pela metade, e a metade que falta é do lado que tem efeito externo:** o
índice torna a **linha** única, mas **não deduplica o alerta**, porque o laço do Telegram itera
`novos` — derivado do `select`, `route.ts:82` — e **não** do resultado do `insert`. Numa corrida, os
dois lados calculam o mesmo `novos` e **os dois alertam**, com o banco recusando só a segunda linha
(23505, engolido em silêncio pelo `logEvent`, que é fire-and-forget com `catch` interno —
`logger.ts:32-57`). Hoje isso é invisível **só porque o Telegram está morto**. É exatamente o
padrão de **reivindicação** (`insert` primeiro, alerta só de quem gravou) que a `87-6` desenhou:
**esta é a confirmação de que ele é necessário, e não só elegante.**

#### O que fica combinado para 09/08 (regra de leitura, pré-registrada ANTES do fato)

- **Consulta:** a da AC9, sem alteração (read-only).
- **`2 linhas` (esperado):** o número **vale**; a **contagem de linhas é que é não-conclusiva**.
  Autoritativa = a de **menor `id`**. Colar os dois `lastro_pct`: **iguais** ⇒ a corrida é real e
  inofensiva neste evento; **diferentes** ⇒ colar os dois valores, é a evidência direta que faltava.
- **`1 linha`:** derruba minha medição dos dois projetos para **este** agendamento — registrar como
  divergência, não como vitória.
- **`0 linhas`:** 🔴 **bloqueio**, conforme a AC9. A AC6 da `87-3` continua aberta e o instrumento
  não existe. Ambos os projetos estão `Ready` em produção agora e a rota responde **401** (existe,
  gate de auth de pé) nos **dois** hosts — então `0 linhas` significaria **agendador**, não build.
- **Limpeza da linha excedente:** é **write** em produção ⇒ **fora da minha alçada nesta janela**,
  fica como item da `87-6` com autorização explícita. Não é urgente: linha `info`, e o dado é
  **recomputável** a qualquer momento por `?dry=1&days=1`, que é read-only de verdade.

**Projeto Vercel nomeado (AC8-iii / ação aberta do gate da `87-3`): `packages/web` é deployado por
DOIS projetos, e o canônico — o que serve `crm.trifold.eng.br` — é
`prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj`, time `trifold-s-projects` (conta `nicoletrifold-droid`).** O
outro é `prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c`, time `freelans-projects-d9ab20e0`, que serve
`trifold-crm.vercel.app` e **também** deploya produção com `rootDirectory=packages/web` — é por isso
que todo cron dispara duas vezes.

#### ✅ A "Nota de método do @po" está FECHADA — a corrida **é** corroborável pelo banco

O @po registrou que não conseguiu corroborar a dupla execução porque *"`system_events` não tem
**nenhum** evento com `source like 'cron/%'` em 15 dias"*. **A premissa da consulta é que estava
errada, não o dado:** os crons existentes gravam `source = 'api/cron/…'`, **com o prefixo `api/`** —
o `like 'cron/%'` não casa com nenhum deles. (A `87-3` grava `source: "cron/nicole-agenda-reconcile"`
**sem** o prefixo, o que é uma inconsistência de convenção que vale registrar à parte.)

Refeita a medição com o prefixo certo, sobre `FOLLOWUP_MESSAGE_SKIPPED` (cron `followup`,
`0 */2 * * *`), read-only, 06/08–08/08:

> **173 de 178** pares `(lead_id, hora-do-cron)` têm **DUAS** linhas = **97 %**.
> Gap entre as duas escritas do **mesmo lead**: **min 2,9 s · mediana 43 s · máx 138 s**.

Mesmo lead, mesma hora agendada, duas linhas, todo ciclo. **Isso é a dupla execução vista de dentro
do banco**, sem depender de log da Vercel — e é a evidência que faltava para a premissa desta story.

**Correção honesta de um número meu:** eu disse *"intervalo de 1 segundo"*. Aquele 1 s é do
`billing-collect-resend` (28/07) e **não** é a folga típica: aqui a mediana é **43 s**. A folga
depende de quanto cada invocação leva até chegar na escrita. Consequência para a `87-6`: o
`select`-antes-do-`insert` do **alerta** provavelmente ganha a corrida na maioria das vezes — o que
**não** enfraquece a story, porque (a) 2,9 s de mínimo já mostra que a cauda encosta, e (b) o
`NICOLE_LASTRO_DIARIO` **não tem `select` nenhum**, então para ele a duplicata não é corrida: é
**certeza**. Ou seja, **`2 linhas` amanhã é o resultado ESPERADO, e `1 linha` é que seria a
anomalia** a investigar.

— **Gage (@devops)**

---

## 💻 Implementação — @dev (Dex), 10/08/2026

**Agent Model Used:** claude-opus-5

### 🔴 A story mudou de natureza. O dedupe deixou de ser o problema principal.

A janela de **10/08 11:38 UTC rodou** — a primeira execução real do cron. Ela deixou dois eventos
internamente contraditórios. Medido por mim contra produção (`dsopqkqjkmhytudaaolv`, Management API,
**somente SELECT**, 10/08):

```
id                                    created_at                      event_type                    alertas_novos
6b379ac3-f39f-4a30-966a-ba31c031eedf  2026-08-10 11:38:24.894956+00   NICOLE_AFIRMACAO_SEM_LASTRO   —
b19dc5cf-cdac-450a-adca-78a5d7b2124e  2026-08-10 11:38:46.800005+00   NICOLE_LASTRO_DIARIO          0
```

**A leitura, e ela é aritmética, não interpretação:**

1. São **duas invocações a 22 s** — os dois projetos Vercel. Uma única invocação emitiria os dois
   eventos com milissegundos de diferença, não 22 s.
2. O recibo que existe diz `alertas_novos: 0`. Ele veio da invocação cujo `select` de dedupe **já
   enxergava** o alerta gravado 22 s antes — portanto é o recibo da **segunda**.
3. Quem gravou o alerta às 11:38:24 tinha `novos = [Ronaldo]`. O recibo dela diria
   `alertas_novos: 1`. **Esse recibo não existe no banco.**
4. O `NICOLE_LASTRO_DIARIO` é emitido **incondicionalmente** (`route.ts:107-130` no HEAD anterior —
   não há `select` antes dele). Ele **não foi pulado. Foi perdido.**

**A causa:** `logEvent` (`logger.ts:21-60`) é fire-and-forget — sem `await`, sem `waitUntil` — e o
recibo é a **última escrita antes do `NextResponse.json`**. A lambda congela no `return` e a promise
pendente morre com o processo.

> #### Consequência que derruba quatro dias de diagnóstico
>
> Em **09/08 não havia caso de alerta**, então o recibo teria sido a **única** escrita daquela run —
> a mais exposta à perda, porque nenhuma escrita anterior manteve o processo vivo até ela.
> **O vazio de 09/08 deixou de ser evidência de que o cron não disparou.** O agendador estava
> comprovadamente vivo naquele dia (`api/cron/followup` gravou 22 min depois da janela silenciosa).
> A leitura pré-registrada da **AC9** — *"`0 linhas` ⇒ o cron não rodou, bloqueio"* — estava certa
> como regra e **errada como inferência**, porque o instrumento de leitura era o próprio evento que
> se perde.

**Ordem de prioridade invertida em relação ao que a story escreveu:**

| # | o quê | papel |
|---|---|---|
| 1 | **o `await`** | é o que **fecha o furo**. Sem ele, não há dedupe a proteger — não há linha |
| 2 | **o `dedupe_key`** | é o que **impede o conserto de piorar**. Com a escrita garantida e duas invocações/dia, sairiam **dois números por dia** |
| 3 | o índice (B) | continua necessário, e continua inócuo até o deploy do código |

### 🔴 O achado maior: não é um defeito da Nicole, é um padrão da casa — e ele é medível

O `logEvent` fire-and-forget é usado em **44 chamadas** dentro de `app/api/**/route.ts`. Levantei
quantas estão na mesma posição do recibo perdido — **nenhum `await` entre a chamada e o `return`**:

```
total de chamadas logEvent em app/api/**/route.ts: 44
expostas (nenhum `await` entre a chamada e o `return`): 12

  packages/web/src/app/api/cron/campaign-poll/route.ts:556        -> return na linha 573
  packages/web/src/app/api/cron/followup/route.ts:590             -> return na linha 599
  packages/web/src/app/api/cron/supremo-history-sync/route.ts:166 -> return na linha 176
  packages/web/src/app/api/telegram/webhook/route.ts:639          -> return na linha 647
  packages/web/src/app/api/webhook/resend/route.ts:79             -> return na linha 86
  packages/web/src/app/api/webhook/resend/route.ts:136            -> return na linha 144
  packages/web/src/app/api/webhook/resend/route.ts:220            -> return na linha 228
  packages/web/src/app/api/webhook/whatsapp/route.ts:181          -> return na linha 198
  packages/web/src/app/api/webhook/whatsapp/route.ts:230          -> return na linha 243
  packages/web/src/app/api/webhook/whatsapp/route.ts:266          -> return na linha 274
  packages/web/src/app/api/webhook/whatsapp/route.ts:498          -> return na linha 506
  packages/web/src/app/api/webhook/whatsapp/route.ts:1029         -> return na linha 1046
```

**`FOLLOWUP_EXECUTED` (`followup/route.ts:590`) é o caso-gêmeo perfeito** — recibo de resumo,
fire-and-forget, imediatamente antes do response, num cron que roda a cada 2 h e cujos eventos
**por lead** (`FOLLOWUP_MESSAGE_SKIPPED`, escritos ANTES de outros `await`) chegam **5.412 vezes**.
Se a hipótese está certa, o recibo deve estar faltando. Medido (read-only, 10/08):

```
event_type                  linhas (all-time)
FOLLOWUP_MESSAGE_SKIPPED    5412
FOLLOWUP_EXECUTED            127     ← primeiro 2026-07-11 12:00 · ÚLTIMO 2026-07-21 18:00
SUPREMO_HISTORY_SYNC           0     ← recibo único do cron. NUNCA gravou, all-time
NICOLE_LASTRO_DIARIO           1

dia         recibos FOLLOWUP_EXECUTED   horas com execução comprovada
2026-08-10        0                       1
2026-08-09        0                       6
2026-08-08        0                       6
…                 0                       6      (idem, todos os dias até 2026-07-22)
```

> **O `FOLLOWUP_EXECUTED` gravou 127 vezes entre 11/07 e 21/07 e parou completamente em 22/07 —
> enquanto o cron continuou rodando 6 horas por dia, todo dia, por 20 dias.** O recibo era uma
> moeda que às vezes caía do lado certo; em 22/07 passou a perder sempre.
>
> Isto **confirma o mecanismo de forma independente da Nicole**, com 20 dias de série e um controle
> interno (os eventos por lead do mesmo cron, na mesma request, que chegam 100 % das vezes porque
> têm `await` depois deles). E o `SUPREMO_HISTORY_SYNC` **nunca gravou uma linha em toda a história
> do banco** — o cron parece mudo e não é: o recibo dele é a única escrita e nunca sobrevive.

**Nada disso foi corrigido nesta story** — está fora do escopo dela e eu não toco arquivo fora do
escopo. Fica registrado como achado para o @pm/@sm abrirem: **os outros 11 pontos expostos, e em
especial os dois recibos de cron comprovadamente perdidos (`FOLLOWUP_EXECUTED`,
`SUPREMO_HISTORY_SYNC`), precisam de story própria.** O `logEventOnce` desta story já é a ferramenta.
*(Observação honesta: `RESEND_NO_ENTRY_ID` está na lista dos 12 e tem **1.508** linhas — a exposição
não é perda garantida, é corrida. Depende de o insert fechar antes de o runtime congelar. Por isso
o número de perdidos não é 12; é "12 expostos, 2 comprovadamente perdendo, 1 comprovadamente
ganhando, 9 não medidos".)*

### O que mudou, arquivo a arquivo

**1. `packages/web/src/lib/logger.ts` — `logEventOnce`, aguardado e deduplicável**

`logEvent` **não mudou de assinatura nem de comportamento** (Armadilha 2 — os ~200 outros pontos de
chamada não foram migrados; seria mudança de latência no caminho quente). O que fiz foi extrair
`logToConsole` e `buildRow` para que os dois caminhos não divirjam, e acrescentar `logEventOnce`:

- **`await`** — a inserção acontece dentro da request;
- **`dedupe_key`** vai para `metadata.dedupe_key` (é o que o índice B indexa);
- **`23505` ⇒ `{ inserted: false }` em silêncio** — é o dedupe funcionando;
- **qualquer outro erro ⇒ `{ inserted: false }` MAS com `LOGGER_FALLBACK`** — sem isso "o banco
  caiu" viraria "já estava lá" (Risco 3);
- casa por **`code`**, não por texto (Armadilha 1). Um erro *sem* `code` cuja mensagem contém
  `duplicate key` é tratado como **erro**, não como dedupe — e há teste para isso;
- não lança. Pior caso é `{ inserted: false }` com o erro no console.

**2. `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts`**

- o `select` de dedupe **saiu** (`jaEmitidos`, o `Set`, o `filter`) — morre junto o **REL-003**
  (select sem `.limit()`, dependente do teto de 1000 do PostgREST);
- **reivindicação**: `logEventOnce` por alerta, e só quem devolveu `inserted: true` entra em
  `reivindicados` — que é o que alimenta o aviso *e* o `alertas_novos` do recibo. Isto fecha a
  correção que o próprio @devops escreveu acima: o índice tornava a **linha** única mas os dois
  lados **alertavam**, porque o laço iterava `novos` (derivado do `select`), não o resultado do
  `insert`;
- o recibo é **`await logEventOnce`** com
  `dedupe_key = lastro:{orgId}:{diaBrt(ate)}:{dias}d` — **REL-002 fechado para estes eventos**;
- 🔴 **o `catch` mudo ganhou voz:** emite **`NICOLE_LASTRO_FALHA`** (`level: error`, com a mensagem
  e a janela) **antes** do `return` 500. Sem isso, falha de execução é indistinguível de silêncio do
  agendador — que é exatamente a ambiguidade que custou os quatro dias;
- **`notificarAdmins(msgs: string[]): Promise<number>`** — a costura da AC3, função **local**
  (não exportada: `route.ts` do Next valida os exports do módulo). `sendTelegramAdminAlert` aparece
  **1 vez** no arquivo, dentro dela. O número devolvido sai no JSON como `avisos_despachados`, e
  está **nomeado como despachados, não entregues**, de propósito: o canal devolve `void` e suprime
  em silêncio. Fazer o notificador devolver o que realmente saiu é da **87-9**;
- **correção de convenção:** `source` passa de `cron/nicole-agenda-reconcile` para
  **`api/cron/nicole-agenda-reconcile`**. Em produção hoje: **5.790** linhas `api/cron/followup`
  contra **2** `cron/nicole-agenda-reconcile` — a rota era a única fora da convenção, e foi essa
  divergência que fez o `like 'cron/%'` do @po devolver vazio;
- **`?dry=1` não foi tocado.** O short-circuit continua precedendo tudo, e o teste dele continua
  no lugar (mutação **M9** abaixo prova que continua vivo).

**3. `packages/ai/src/flows/index.ts` — `diaBrt` exportado (1 linha + comentário)**

⚠️ **Desvio consciente da AC6-(ii)**, declarado: a AC5 exige `diaBrt` **importado de `@trifold/ai`,
não reimplementado**, e ele **não estava no barril** (`flows/index.ts`) — só exportado do módulo.
Sem esta linha, ou eu reimplementaria a convenção de dia BRT no `packages/web` (proibido pela AC5,
e é como se criam duas definições de "dia" que divergem 3 h por dia), ou faria deep-import
(`@trifold/ai/src/flows/…`), forma que **não existe em nenhum lugar do `packages/web`).
**A AC6-(iii) continua satisfeita ao pé da letra: `agenda-reconcile.ts` está byte a byte igual**, e
nenhum comportamento do `packages/ai` mudou — é só um re-export.

### 🔴 Os vermelhos — 9 mutações, cada uma na SUÍTE INTEIRA

Régua: aplicar a mutação → `npx vitest run` **da raiz** (nunca `--reporter=basic`) → ler o reporter →
reverter. Os **5 arquivos** que falham por dependência ausente (`sharp`, `satori`, `pdf-lib`) são
pré-existentes, não executam teste, e estão excluídos das listas de vermelhos abaixo.

**Baseline medido nos dois lados** (não declarado — medido, com `git show HEAD:` restaurando os
arquivos e removendo o `logger.test.ts` novo):

```
BASELINE NO HEAD (sem a 87-6):
 Test Files  5 failed | 154 passed (159)
      Tests  1935 passed | 7 expected fail (1942)

DEPOIS (com a 87-6):
 Test Files  5 failed | 155 passed (160)
      Tests  1954 passed | 7 expected fail (1961)
```

**+19 testes, 0 regressões, os mesmos 5 arquivos vermelhos pré-existentes.**

| # | forma da mutação (o que foi trocado, literalmente) | vermelhos | testes que caíram |
|---|---|---|---|
| **M1** | `await logEventOnce({ level: "info", …` → **`void logEventOnce({ level: "info", …`** (o recibo deixa de ser aguardado) | **6** | `o RECIBO é aguardado…` · `emite o evento por caso, o recibo com o número…` · `AC3 — o aviso só sai para quem REIVINDICOU` · `AC5 — dedupe_key = lastro:{org}:{dia_brt}:{dias}d` · `AC5 — o dia da chave é BRT, não UTC` · `AC5-(iii) — a rodada retroativa não é engolida` |
| **M2** | `if (error.code === PG_UNIQUE_VIOLATION) return { inserted: false }` → **linha removida** | **1** | `AC2 — 23505 ⇒ inserted:false e SILÊNCIO` |
| **M3** | as 3 linhas do tratamento de erro → **`return { inserted: false }`** (catch que engole tudo) | **2** | `AC2/Risco 3 — 42P01 ⇒ inserted:false MAS com LOGGER_FALLBACK` · `AC2 — erro sem code não é tratado como dedupe` |
| **M4** | `if (inserted) reivindicados.push(a)` → **`if (inserted \|\| true)`** | **2** | `AC3 — o aviso só sai para quem REIVINDICOU` · `AC4-(i) — a segunda rodada não duplica` |
| **M5** | `` `lastro:${orgId}:${diaBrt(ate)}:${dias}d` `` → **`` `lastro:${orgId}:${diaBrt(ate)}` ``** | **3** | as três da AC5 |
| **M6** | `await logEventOnce({ level:"error", … NICOLE_LASTRO_FALHA` → **`void ({ …`** (o objeto vira literal morto) | **1** | `falha de execução emite NICOLE_LASTRO_FALHA ANTES do 500` |
| **M7** | `SOURCE = "api/cron/nicole-agenda-reconcile"` → **`"cron/nicole-agenda-reconcile"`** | **2** | `o source segue a convenção api/cron/…` · `NICOLE_LASTRO_FALHA ANTES do 500` |
| **M8** | `diaBrt(ate)` → **`ate.toISOString().slice(0, 10)`** (dia em UTC) | **1** | `AC5 — o dia da chave é BRT, não UTC` |
| **M9** | `if (dry) {` → **`if (false) {`** (o short-circuit do `?dry=1` morre) | **1** | `AC4-(ii) da 87-3 — ?dry=1 NÃO emite evento nem alerta` |

**Saída bruta do reporter, M1** (a mutação que corresponde ao conserto principal):

```
### M1-sem-await-no-recibo
 Test Files  6 failed | 154 passed (160)
      Tests  6 failed | 1948 passed | 7 expected fail (1961)
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
  route.test.ts > cron nicole-agenda-reconcile > emite o evento por caso, o recibo com o número, e o alerta nomeado
  route.test.ts > cron nicole-agenda-reconcile > 🔴 87-6 — o RECIBO é aguardado: a resposta não sai antes da escrita completar
  route.test.ts > cron nicole-agenda-reconcile > 🔴 87-6/AC3 — o aviso só sai para quem REIVINDICOU
  route.test.ts > cron nicole-agenda-reconcile > 🔴 87-6/AC5 — o dia da chave é BRT, não UTC (e as duas discordam às 23h)
  route.test.ts > cron nicole-agenda-reconcile > 🔴 87-6/AC5 — o recibo carrega `dedupe_key = lastro:{org}:{dia_brt}:{dias}d`
  route.test.ts > cron nicole-agenda-reconcile > 🔴 87-6/AC5-(iii) — a rodada retroativa `?days=60` NÃO é engolida pela diária
```

#### 🔴 A primeira rodada da M1 deu **3** vermelhos, não 6 — e o defeito era do meu próprio fake

Na primeira medição da M1, o teste dedicado (`o RECIBO é aguardado`) ficou **verde sob a mutação**.
Ler o número em vez de aceitá-lo foi o que salvou a régua: **a escrita órfã que o `void` deixa
pendente completava DEPOIS do fim do teste e caía no array do teste SEGUINTE**, que então passava
por herança. Três testes estavam verdes por acidente.

Correção: o fake ganhou um contador de **geração**, incrementado no `beforeEach`; escrita que
completa fora da geração em que nasceu é descartada como órfã. Depois disso a M1 foi de **3 → 6**
vermelhos. É exatamente a classe "fake que guarda demais / complacente" que as stories 87-7 e 87-8
já pagaram — e desta vez ela apareceu no lado do teste, não do código.

#### Honestidade sobre o alcance de cada régua

- **A AC4 continua não provando atomicidade.** O fake da rota reproduz os dois índices como um `Set`
  de chaves; isso prova o **contrato** (a rota não alerta quando `inserted` é falso), **não** a
  corrida. A atomicidade é a **AC1-b-(ii/iii)**, no banco, e **não foi executada** (ver abaixo).
- **O teste genérico do `dedupe_key` não distingue BRT de UTC** — as duas convenções concordam em
  21 das 24 horas, e a suíte roda de dia. Foi por isso que acrescentei a fixture com relógio
  congelado em `2026-08-11T02:00:00Z` (= `2026-08-10 23:00` BRT): é ela, e só ela, que fica vermelha
  na **M8**.
- **A AC5-(ii)** (duas rodadas ⇒ um recibo) **não** fica vermelha na M1, e isso está correto: ela
  mede o dedupe, não o `await`. Não conto ela como prova do `await`.

### O que NÃO foi executado, e por quê

🔴 **AC1-b (aplicar o índice B) e AC1-a-(iii) (contar `pg_indexes` depois de rodar o arquivo) NÃO
foram executadas.** A minha janela nesta story é **somente leitura do banco** — e a prova da AC1-b,
mesmo dentro de `BEGIN…ROLLBACK`, é `INSERT`. Fica para o @data-engineer/@devops, com os comandos
literais já no rodapé da migration `217`.

**Pré-checks read-only que eu fiz, e que a AC1 exige antes de aplicar** (produção, 10/08):

```
-- (a) pg_indexes: 8 índices em system_events (7 pré-existentes + o do ALERTA).
--     O índice (B) NÃO está aplicado. Depois da migration devem ser 9. 10 = divergiu.
uniq_system_events_afirmacao_sem_lastro_message
  ON public.system_events USING btree (((metadata ->> 'message_id'::text)))
  WHERE (((event_type)::text = 'NICOLE_AFIRMACAO_SEM_LASTRO'::text) AND (metadata ? 'message_id'::text))
      ← copiado LITERALMENTE para a migration 217 (AC1-a-ii). Nome e predicado batem.

-- (b) colisão pré-existente que impediria criar o índice (B):
select count(*) total, count(*) filter (where metadata ? 'dedupe_key') com_dedupe from system_events;
→ total = 11985 · com_dedupe = 0        (referência do @po em 08/08: 11.677 / 0 — cresceu, segue 0)
```

> ⚠️ **Ordem de aplicação (importa, e é o inverso do rollback):** o índice **(B) primeiro**, o código
> **depois**. Com o código no ar e o índice ausente, o `dedupe_key` é gravado mas não deduplica —
> e como o `await` já estará funcionando, sairiam **dois recibos por dia** com a mesma chave, sem
> nada para barrar o segundo. É o cenário que esta story existe para evitar, criado pela ordem
> errada de deploy.

### AC8 / AC9 — o que muda na leitura de 09/08 e 10/08

- **AC9, releitura obrigatória.** A regra pré-registrada pelo @devops dizia *"`0 linhas` ⇒ o cron não
  rodou ⇒ bloqueio"*. Em 10/08 saiu **1 linha**, que a regra classificaria como *"derruba minha
  medição dos dois projetos"*. **As duas leituras estão erradas pela mesma razão:** o instrumento é
  o evento que se perde. **1 linha com `alertas_novos: 0` ao lado de um alerta gravado 22 s antes é
  a assinatura de DUAS invocações, uma das quais perdeu o recibo.** A medição do @devops sobre os
  dois projetos **não** foi derrubada — foi confirmada por outro caminho.
- **Não limpei nada, não invoquei o endpoint fora de `?dry`.** Publicar um segundo número para hoje
  seria produzir com a mão o defeito que a story mede.
- **O primeiro lastro automático saiu `0% (0/2)`**, `sem_lastro` 2, as duas falas do **mesmo lead**
  (Ronaldo). **`n = 2` não é taxa.** Nada aqui depende desse número, e o Epic 88 não pode dimensionar
  a v1 com ele.
- **AC8 continua com o @devops**, depois do deploy.

### File List

| arquivo | o quê |
|---|---|
| `supabase/migrations/218_system_events_dedupe_nicole.sql` | **novo** — índice (A) versionado literal + índice (B) `ux_system_events_dedupe_key`, com verificação e rollback no rodapé. ⚠️ **Renumerada de 217 → 218 pelo @devops na abertura do PR** (o 217 foi consumido por `217_leads_qualificacao_comercial.sql`, Story 84-1, em `origin/main`) |
| `packages/web/src/lib/logger.ts` | `logEventOnce` (aguardado + `dedupe_key` + `23505`); `logToConsole`/`buildRow` extraídos; `logEvent` intacto |
| `packages/web/src/lib/logger.test.ts` | **novo** — 9 testes (AC2 + o `await` + a não-regressão do `logEvent`) |
| `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts` | `select` de dedupe removido; reivindicação; recibo aguardado com `dedupe_key`; `NICOLE_LASTRO_FALHA` no `catch`; `notificarAdmins`; `source` na convenção |
| `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.test.ts` | 5 → **15** testes; fake com geração anti-órfã e com os dois índices reproduzidos |
| `packages/ai/src/flows/index.ts` | +1 export: `diaBrt` (desvio da AC6-(ii) declarado acima) |

### Validações (AC7)

```
npx vitest run  (raiz)      → Test Files 5 failed | 155 passed (160)
                              Tests 1954 passed | 7 expected fail (1961)
                              (os 5 = sharp/satori/pdf-lib, pré-existentes, não executam teste)
npx tsc --noEmit (ai)       → 0 erros
npx tsc --noEmit (web)      → 0 erros nos arquivos desta story
                              (pré-existentes intocados: react-email-editor, portal-viewer layout,
                               sharp/satori/pdf-lib)
npx eslint (arquivos desta story) → 0 errors, 3 warnings
                              (todos `_param` não usado, convenção já presente no arquivo original)
packages/ai não tem eslint  → o `lint` dele é `tsc --noEmit`
```

**DoD conferido:**

```
grep -rn "jaEmitidos" packages/web/src   → 0 ocorrências  ✅

grep -n "sendTelegramAdminAlert" packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts
   3:import { sendTelegramAdminAlert } from "@web/lib/telegram"
  48: * `sendTelegramAdminAlert` devolve `void` e suprime em silêncio quando falta
  56:    await sendTelegramAdminAlert(msg)
```

⚠️ **Correção de uma afirmação minha:** eu tinha escrito "1 ocorrência" e o `grep` devolve **3**.
A régua literal do DoD (*"no máximo 1 ocorrência"*) **não passa como escrita** — e o problema é da
régua, não do código: ela conta o `import`, que é inevitável enquanto a função viver neste arquivo.
**O que a régua queria medir passa: há exatamente 1 CHAMADA (linha 56), e ela está dentro de
`notificarAdmins`.** As outras duas são o `import` (linha 3) e uma menção em comentário (linha 48,
justamente explicando que o canal devolve `void`). Deixo registrado em vez de apagar o comentário
para o `grep` fechar — ajustar o código para satisfazer a régua é o caminho pelo qual réguas param
de medir. **Sugestão para o @qa/@sm:** a régua correta é
`grep -c "await sendTelegramAdminAlert" …/route.ts → 1`.

### Para o @qa e o @sm — o que sai daqui como item novo

1. 🔴 **Story nova (@sm):** os **11 outros pontos** de `logEvent` fire-and-forget imediatamente antes
   de um `return`, com prioridade para os **dois recibos de cron comprovadamente perdidos** —
   `FOLLOWUP_EXECUTED` (parou em 22/07, 20 dias de perda contínua) e `SUPREMO_HISTORY_SYNC`
   (**0 linhas all-time**). A ferramenta já existe: `logEventOnce`.
2. **REL-001, REL-002 e REL-003** do gate da 87-3: fechados por esta story **para os eventos dela**.
   O REL-002 **não** está fechado no projeto — só nestes três eventos.
3. **A AC6 da 87-3 está fechada por efeito** (a linha `NICOLE_LASTRO_DIARIO` existe), mas com a
   ressalva de que a série é incompleta até o deploy: os recibos anteriores ao `await` podem faltar.
4. **Não commitei nem abri PR** — é do @devops.

— **Dex (@dev)**, sempre construindo 🔨

## QA Results

### Gate — @qa (Quinn), 10/08/2026 · rodada 1 · **CONCERNS**

**Arquivo:** `docs/qa/gates/87.6-dedupe-atomico-lastro-diario.yml`

**Método:** suíte inteira da raiz (`npx vitest run`, nunca `--reporter=basic`) rodada **11 vezes** —
baseline + 9 mutações + 1 contraprova de harness. Banco de produção (`dsopqkqjkmhytudaaolv`,
Management API) **somente SELECT**: nenhuma escrita, nenhuma invocação do endpoint fora de `?dry`.
Nada aceito por relato.

#### 🔴 O item que a story mandou eu conferir com mais rigor — a autocrítica do @dev

**Verdadeira, e provei nos dois sentidos.**

| medição | vermelhos | leitura |
|---|---|---|
| **M1** (`void` no recibo), fake como entregue | **6** | confere com o declarado, nome a nome |
| **M1 + a guarda de geração REMOVIDA** | **3** | confere com a primeira rodada do @dev |
| guarda removida, **sem** mutação | **0** (1954/1954) | a guarda não sustenta verde nenhum |

Os três que passavam **por herança** são exatamente: `o RECIBO é aguardado` (**o teste dedicado ao
conserto**), `AC5 dedupe_key` e `AC5 BRT`. O relato está certo até em qual teste era o envergonhado.
E a segunda medição fecha o risco simétrico: uma guarda que produzisse vermelhos por si mesma seria
instrumento novo, não correção — ela só apaga verdes falsos.

**As outras 8 mutações reproduzem todas**, na contagem e na lista: M2=1 · M3=2 · M4=2 · M5=3 · M6=1 ·
M7=2 · M8=1 · M9=1. Baseline conferido: **1954 passed | 7 expected fail**, mesmos 5 arquivos
pré-existentes (`sharp`/`satori`/`pdf-lib`). `route.test.ts` 5 → 15, `logger.test.ts` +9 = **+19**.

**A fixture das 23h discrimina** (ponto 4): a M8 (`diaBrt` → `toISOString().slice(0,10)`) derruba
**1** teste, e é só a fixture com relógio em `2026-08-11T02:00:00Z`. O teste genérico do `dedupe_key`
fica **verde** sob a mutação — sem a fixture, a AC5-(i) seria uma AC que não consegue ficar vermelha
pela razão que nomeia.

#### Os índices em produção × a migration (pontos 2 e 3)

`pg_indexes`, lido por mim hoje: **9 índices** em `system_events` — exatamente o número que o rodapé
da 217 declara como esperado. Os dois batem **caractere a caractere** com a migration: nome, colunas,
expressão e predicado (`metadata ? 'message_id'` em A; `(event_type, metadata->>'dedupe_key')` com
`IS NOT NULL` em B). Os dois `CREATE UNIQUE INDEX IF NOT EXISTS` casam por **nome** e os nomes já
existem ⇒ rodar o arquivo é **no-op demonstrável**, e nenhum índice redundante subiu (AC1-a-iii).
**O código não cita nome de índice em lugar nenhum** — reage a `error.code === '23505'`, venha de
qual índice vier. **Ordem respeitada: (B) no ar antes do código.** Pré-check remedido: 12.055 linhas,
**0** com `dedupe_key`.

#### O que confirmei por conta própria

- **A inferência que mudou a natureza da story se sustenta**, e o argumento decisivo não é o
  intervalo de 22 s: é a aritmética. A invocação que gravou o alerta calculou `novos=[Ronaldo]` antes
  de qualquer escrita ⇒ o recibo dela diria `1`. O que existe diz `0`. O recibo é incondicional e não
  há I/O aguardado entre os dois pontos. **Perdido, não pulado.**
- **A corroboração independente da Nicole bate no banco:** `FOLLOWUP_EXECUTED` 127 linhas, última
  **21/07**; `FOLLOWUP_MESSAGE_SKIPPED` 5.412, última **hoje 12:01** (mesmo cron, mesma request);
  `SUPREMO_HISTORY_SYNC` **0 all-time**; `RESEND_NO_ENTRY_ID` 1.519 — a ressalva de que exposição é
  corrida, não perda garantida, confere. Amostra dos 12 expostos conferida linha a linha (ponto 6).
- **Escopo (ponto 5):** `git diff --exit-code packages/ai/src/flows/agenda-reconcile.ts` → **exit 0,
  byte a byte igual**. O baseline de 12,5 % da 87-3 está intocado. `logEvent` conferido contra
  `git show HEAD:` — `logToConsole`/`buildRow` são extração literal, comportamento idêntico.
- `tsc` 0 erros nos arquivos da story nos dois pacotes (28 linhas pré-existentes, nenhuma daqui);
  eslint 0 errors / 3 warnings (`_param` em teste); `grep jaEmitidos` → 0.

#### Achados

| id | sev | o quê |
|---|---|---|
| **EVID-001** | medium | A prova no banco da AC1-b **não está transcrita** — e o vermelho de (iii) é **irreproduzível** com o índice de pé. Que a unicidade seja imposta eu garanto (o índice existe com o DDL certo, isso é determinístico); o que se perde é auditabilidade |
| **REL-004** | medium | `{ inserted: false }` confunde "já existia" com "a escrita falhou". Erro no recibo ⇒ HTTP **200**, sem recibo e **sem** `NICOLE_LASTRO_FALHA` (o `catch` só cobre exceção de `reconciliarAgenda`). **Não é regressão — é resíduo**, e muito menor. Mas a manchete é "o recibo passa a ser confiável", e *muito mais confiável* ≠ *garantido* |
| **DOC-002** | low | Régua do DoD (ponto 7): **o @dev está certo e ratifico**. Há 1 chamada real, dentro de `notificarAdmins`; as outras 2 são import e comentário. Apagar prosa para um `grep` fechar é como réguas param de medir. A régua errou; o código não. `grep -c "await sendTelegramAdminAlert"` → 1 |
| **SCOPE-001** | low | `+1 export` de `diaBrt` no barril: **aceito**. As alternativas eram reimplementar a convenção de dia BRT (proibido pela AC5) ou um deep-import que não existe no projeto |

#### Veredito

**CONCERNS — liberado para deploy.** Nada pede o @dev de volta: não há defeito de código, os nove
vermelhos são reais e a autocrítica que os sustenta foi verificada nos dois sentidos. O CONCERNS é
por **registro faltando** (EVID-001), por uma **AC pós-deploy** que só o @devops fecha (AC8) e por um
**resíduo nomeado** (REL-004). O índice (B) já está no ar — o código pode subir.

Ações requeridas antes de `Done` (detalhadas no gate): transcrever a evidência da AC1-b; fechar a
AC8; escrever o desfecho da AC9 (a regra pré-registrada foi falsificada — e a medição dos dois
projetos foi **confirmada** por outro caminho, não derrubada); corrigir a régua do DoD; abrir a story
dos 11 pontos expostos.

— Quinn, guardião da qualidade 🛡️

---

## 🚀 Registro do @devops (Gage) — abertura do PR, 10/08/2026

### 1. 🔴 A migration foi RENUMERADA: `217` → `218`

`origin/main` andou entre o gate e o PR. Medido por mim no `fetch` de agora:

```
origin/main  59560009  feat: Qualificação Comercial — filtro no Pipeline + coluna na lista [Story 84-6] (#378)
             3bbdb789  feat: UI da Qualificação Comercial [Story 84-2] (#366)
             37b7ad65  feat: Qualificação Comercial do lead — schema, permissões e auditoria [Story 84-1] (#362)
             129864a7  ← HEAD local antes do fetch (Story 87-8)

git ls-tree origin/main supabase/migrations/ | tail
  216_clientes_cpf_normalizado.sql
  217_leads_qualificacao_comercial.sql   ← 🔴 o 217 foi CONSUMIDO pela 84-1
```

Renomeado para **`218_system_events_dedupe_nicole.sql`**, com a razão escrita no cabeçalho do
arquivo. Atualizadas junto as três outras referências ao número: `logger.ts` (comentário do
`logEventOnce`), `route.test.ts` (comentário do fake) e a chave-sonda do rodapé (`prova-217` →
`prova-218`). **Nenhuma colisão de conteúdo** — a `217_leads_qualificacao_comercial.sql` mexe em
`leads`, não em `system_events`, e os dois índices desta story continuam sendo os mesmos dois nomes
que o @qa leu em `pg_indexes`. **O `IF NOT EXISTS` casa por NOME, e os nomes não mudaram: rodar a
`218` continua sendo no-op demonstrável em produção.** O prefixo do arquivo nunca foi parte da
garantia.

**Também não houve rebase de código:** os arquivos das três stories de `origin/main` são disjuntos
dos desta (`git diff --name-only 129864a7 origin/main` não lista `logger.ts`, nem
`nicole-agenda-reconcile/*`, nem `flows/index.ts`). A branch saiu direto de `origin/main`, sem
conflito.

### 2. 🔴 EVID-001 — a evidência da AC1-b, com o que existe e o que não existe

**(a) Pré-check — LIMPO.** `select count(*) from system_events where metadata ? 'dedupe_key'` → **0**.
Medido duas vezes: pelo @sm em 08/08 (0 sobre 11.677 linhas) e reconferido pelo @qa em 10/08
(**0 sobre 12.055 linhas**). Nenhuma duplicata pré-existente podia impedir a criação do índice, e
nenhuma impediu.

**(b) O `23505` — observado nos dois sentidos, transcrição literal NÃO capturada.**
O índice (B) foi aplicado em produção em **10/08/2026, ANTES do código**, por Management API. Foi
provado nos dois sentidos na hora da aplicação: **duas linhas com a mesma `dedupe_key` no mesmo dia
⇒ a segunda barrada com `23505`; a chave do dia seguinte ⇒ passa** (é o que garante que o dedupe é
"um por dia", e não "um para sempre"). **A mensagem literal do Postgres não foi copiada para lugar
nenhum, e eu não vou reconstruí-la de memória** — texto de erro inventado é pior que ausência de
registro, porque parece prova.

**(c) O VERMELHO da AC1-b-(iii) — 🔴 não foi registrado e NÃO é recuperável.**
Escrevo isto como a ação requerida manda escrever: as duas inserções passando **antes** do índice
não foram transcritas, e com o índice de pé em produção **não há como reproduzi-las**. A única forma
seria derrubar o índice em produção, o que não se faz por causa de um registro. **Fica como falta
assumida, não como silêncio.**

**O que sobra de garantia, e é o que importa para o deploy:** o índice existe, e o @qa conferiu em
`pg_indexes` que nome, colunas, expressão e predicado batem **caractere a caractere** com a
migration — **9 índices em `system_events`, nem 8 nem 10**. Um índice único **impõe** unicidade; isso
é determinístico e não depende de experimento. O que se perdeu foi a **auditabilidade** do momento da
aplicação, não a garantia.

### 3. O5 — o desfecho da AC9, escrito por quem registrou a regra

Eu pré-registrei, em 08/08: *"**`1 linha`** derruba minha medição dos dois projetos para este
agendamento — registrar como divergência, não como vitória."*

**Saiu 1 linha. E a inferência correta é a OPOSTA da que eu pré-registrei.**

A regra assumia que o recibo era um instrumento de leitura confiável — que "1 linha" só podia
significar "1 invocação". Não é o que aconteceu: houve **duas** invocações (11:38:24 gravou o alerta,
11:38:46 gravou o recibo com `alertas_novos: 0`, ou seja de quem já enxergava o alerta anterior), e
a primeira **perdeu o recibo dela**. O contador contava com um instrumento que se perde. **A medição
dos dois projetos não foi derrubada: foi CONFIRMADA por outro caminho** — e por dois, na verdade
(a aritmética do `alertas_novos` nesta rota, e os 97% de pares duplicados do `followup` no banco).

**Uma regra pré-registrada que o fato falsifica é o método funcionando.** Fica escrito aqui para que
o próximo a ler a AC9 não leia a regra antiga e conclua o contrário.

**Consequência que passa dos limites desta story:** o vazio de 09/08 **deixou de ser prova** de que o
cron não disparou. Eu mesmo escrevi o contrário no PR **#379** (a 87-3), onde a ausência de
`NICOLE_LASTRO_DIARIO` foi lida como agendador parado. **Aquela leitura está errada e esta story é a
retratação.** O agendador estava vivo naquele dia; o que faltava era a escrita sobreviver ao
`return`.

### 4. Portas que ficam abertas depois do merge (não são deste PR)

| item | dono | o quê |
|---|---|---|
| **AC8** | @devops | pós-deploy: (i) `count(*) = count(distinct metadata->>'message_id')` em `NICOLE_AFIRMACAO_SEM_LASTRO`; (ii) nenhum `dedupe_key` com `count > 1` em `NICOLE_LASTRO_DIARIO`; (iii) AC6 da 87-3 fechada por efeito |
| **REL-004 + os 11 pontos expostos** | @sm | story própria. Prioridade: `FOLLOWUP_EXECUTED` (parado desde 21/07) e `SUPREMO_HISTORY_SYNC` (**0 linhas all-time**) |
| **DOC-002** | @po | régua do DoD → `grep -c "await sendTelegramAdminAlert" …/route.ts` → 1 |
| **Epic 87 / R-G** | @pm | o `W0-5` ganhou hotfix; e o `R-G` diz migration 215 quando o real, hoje, é **217 ⇒ 218** |

**Projeto Vercel canônico (AC8-iii):** `prj_s3ARh1fpDnzbx9ua4MYJf9iqdRhj`, time `trifold-s-projects`
(conta `nicoletrifold-droid`), que serve `crm.trifold.eng.br`. O outro,
`prj_KMm5f2yaVgKbc05GuysnF9Zhgv5c` (`freelans-projects-d9ab20e0`, `trifold-crm.vercel.app`), deploya
o mesmo `packages/web` com o mesmo `vercel.json` — é por isso que todo cron dispara duas vezes.

— **Gage (@devops)**, deployando com confiança 🚀

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-10 | 1.2 | **@devops — PR aberto (não mergeado).** 🔴 **Migration renumerada `217` → `218`:** `origin/main` andou entre o gate e o PR e o prefixo 217 foi consumido por `217_leads_qualificacao_comercial.sql` (Story 84-1, PR #362). Atualizadas as 3 outras referências ao número (`logger.ts`, `route.test.ts`, a chave-sonda do rodapé). **Nada mais mudou:** os nomes dos índices são os mesmos que o @qa leu em `pg_indexes`, e o `IF NOT EXISTS` casa por NOME — rodar a `218` continua sendo no-op demonstrável. Branch criada direto de `origin/main`, **sem rebase de código e sem conflito** (as três stories que entraram são de `leads`/UI, disjuntas destes arquivos). **Gates re-medidos na base nova:** suíte da raiz **1965 passed | 7 expected fail**, e a aritmética fecha contra a baseline limpa de `origin/main` medida por mim em worktree (**1946** + os 19 desta story = 1965); `tsc` **0 erros** em `packages/ai` e **28 linhas pré-existentes** em `packages/web`, nenhuma nos arquivos da story; eslint **0 errors / 3 warnings** (`_param` em teste); `packages/ai` **não tem eslint** (o `lint` dele é `tsc --noEmit`). `next build` local **não conclui** — 7 erros, todos `Module not found` de 5 pacotes declarados no `package.json` mas ausentes do `node_modules` local (`sharp`, `satori`, `pdf-lib`, `react-email-editor`, `opus-recorder`); **zero** erro cita arquivo desta story, e o sinal canônico é o build de preview do Vercel. **EVID-001 respondido** com o que existe (pré-check 0 sobre 12.055 linhas) e com o que **não** existe (a transcrição literal do `23505` não foi capturada; **o vermelho da AC1-b-(iii) não foi registrado e não é recuperável** — declarado, não silenciado). **O5 escrito:** a regra pré-registrada da AC9 (*"1 linha derruba minha medição dos dois projetos"*) **foi falsificada pelo fato** — houve duas invocações e a primeira perdeu o recibo; a medição foi **confirmada** por outro caminho, não derrubada. **Retratação registrada: o que eu escrevi no PR #379 — o vazio de 09/08 como prova de agendador parado — está errado.** | @devops (Gage) |
| 2026-08-10 | 1.1 | **@qa — gate CONCERNS, liberado para deploy.** `docs/qa/gates/87.6-dedupe-atomico-lastro-diario.yml`. Suíte inteira rodada 11 vezes (baseline + 9 mutações + 1 contraprova de harness), banco de produção somente SELECT, nada aceito por relato. As 9 mutações reproduzem na contagem **e** na lista de nomes. A autocrítica do @dev sobre o próprio fake é **verdadeira e load-bearing**, verificada nos dois sentidos: M1 com o fake corrigido = **6** vermelhos, M1 com a guarda de geração removida = **3** (e os três que sobrevivem por herança incluem **o teste que prova o `await`**), guarda removida **sem** mutação = **0** (1954/1954, a guarda não sustenta verde nenhum). Índices conferidos em `pg_indexes`: **9**, batendo caractere a caractere com a migration ⇒ rodar o arquivo é no-op demonstrável; ordem índice-antes-de-código respeitada. CONCERNS por **EVID-001** (a prova no banco da AC1-b não está transcrita e o vermelho é irreproduzível — perde-se auditabilidade, não garantia), **AC8** (pós-deploy) e **REL-004** (`inserted: false` confunde "já existia" com "a escrita falhou"; erro no recibo ainda devolve 200 sem `NICOLE_LASTRO_FALHA` — resíduo, não regressão). `DOC-002`: a régua do DoD mede a coisa errada e o @dev está certo em registrar em vez de apagar prosa para o `grep` fechar. `SCOPE-001`: o `+1 export` de `diaBrt` é aceito. | @qa (Quinn) |
| 2026-08-10 | 1.0 | **@dev — implementado. Ready → Ready for Review.** 🔴 **A story mudou de natureza durante a implementação, e o achado é maior que ela.** A janela de 10/08 11:38 UTC **rodou** e deixou dois eventos contraditórios: `NICOLE_AFIRMACAO_SEM_LASTRO` às 11:38:24 e `NICOLE_LASTRO_DIARIO` às 11:38:46 com `alertas_novos: 0` — duas invocações a 22 s, a segunda já enxergando o alerta da primeira. Logo **a primeira também emitiu recibo, e esse recibo não existe no banco**. O `NICOLE_LASTRO_DIARIO` é incondicional: não foi pulado, **foi perdido**, porque o `logEvent` é fire-and-forget e o recibo é a última escrita antes do `NextResponse.json`. **Consequência: o vazio de 09/08 deixou de ser evidência de que o cron não disparou** — naquele dia não havia alerta, então o recibo teria sido a única escrita, a mais exposta à perda; e o agendador estava comprovadamente vivo (`api/cron/followup` gravou 22 min depois). Prioridade invertida: **o `await` é o que fecha o furo; o `dedupe_key` é o que impede o conserto de piorar** (com a escrita garantida e dois projetos invocando, sairiam dois números por dia). 🔴 **Achado que extrapola a story, medido:** das **44** chamadas de `logEvent` em `app/api/**/route.ts`, **12** estão na mesma posição (nenhum `await` entre a chamada e o `return`) — e o caso-gêmeo `FOLLOWUP_EXECUTED` **gravou 127 vezes entre 11/07 e 21/07 e parou completamente em 22/07**, enquanto o cron seguiu rodando 6 h/dia por 20 dias e seus eventos por-lead chegaram 5.412 vezes; `SUPREMO_HISTORY_SYNC` tem **0 linhas all-time**. Fica como story nova (não corrigido aqui — fora de escopo). Entregue: `logEventOnce` (aguardado, `dedupe_key`, `23505` silencioso mas 42P01 no `LOGGER_FALLBACK`, casando por `code` e não por texto); `select` de dedupe removido da rota (mata REL-003) com **reivindicação** no lugar — o que fecha a correção do @devops de que o índice tornava a linha única mas os dois lados alertavam; recibo aguardado com `dedupe_key = lastro:{org}:{dia_brt}:{dias}d` (mata REL-002 nestes eventos); **`NICOLE_LASTRO_FALHA` no `catch` mudo**, para que falha de execução deixe de ser indistinguível de silêncio do agendador; costura `notificarAdmins`; e `source` alinhado a `api/cron/…` (a divergência era a única do projeto, e é o que fazia o `like 'cron/%'` do @po vir vazio). **9 mutações, cada uma na suíte inteira, todas vermelhas** — incluindo `void` no recibo (6 vermelhos), remoção do `23505` (1), catch que engole tudo (2), gate de reivindicação (2), chave sem `dias` (3), dia em UTC no lugar de BRT (1) e `?dry=1` (1). 🔴 **A primeira rodada da M1 deu 3 e não 6: o defeito era do meu fake** — a escrita órfã completava depois do teste e caía no array do seguinte, deixando três testes verdes por herança; corrigido com contador de geração. Baseline medido nos dois lados: **1935 → 1954 testes, +19, 0 regressões**, mesmos 5 arquivos pré-existentes vermelhos (sharp/satori/pdf-lib). **NÃO executado (fora da minha janela, que é read-only no banco): AC1-b e AC1-a-(iii)** — comandos prontos no rodapé da migration; ⚠️ **o índice (B) tem de subir ANTES do código**, senão o `await` funcionando sem índice publica dois recibos por dia. Desvio declarado da AC6-(ii): +1 export (`diaBrt`) em `packages/ai/src/flows/index.ts`, porque a AC5 proíbe reimplementar e o símbolo não estava no barril; `agenda-reconcile.ts` segue byte a byte igual (AC6-iii ✅). | @dev (Dex) |
| 2026-08-08 | 0.2 | **@po — GO com emendas. Draft → Ready.** Medi contra produção e **metade da premissa caiu**: o índice do **alerta** está mesmo aplicado (`uniq_system_events_afirmacao_sem_lastro_message`, predicado `metadata ? 'message_id'`), mas com **nome e predicado diferentes** dos que a story escreveu — e `CREATE UNIQUE INDEX IF NOT EXISTS` casa por **nome**, então o DDL original criaria um **segundo índice redundante**. Migration `217` reescrita como cópia literal do aplicado (AC1-a) e o índice (B) separado em **AC1-b**. 🔴 **O achado que inverte a urgência:** `NICOLE_LASTRO_DIARIO` é emitido **incondicionalmente** (`route.ts:107-130`, sem nem `select` antes) e o índice (B) exige `metadata.dedupe_key`, **que o código de hoje não emite** — e não existe índice único "um por dia" porque `date_trunc`/`::date` sobre `timestamptz` são **STABLE**, não `IMMUTABLE`. Ou seja: **o índice que entrou protege o evento que provavelmente não vai disparar (0,13 alerta/dia, e `system_events` tem 0 eventos `NICOLE_%`), e o evento que será certamente escrito amanhã — o número que dimensiona a v1 do Epic 88 — segue desprotegido e é impossível protegê-lo sem deploy.** Criada a **AC9**: o @devops escolhe e **escreve** uma das três saídas antes de 09/08 11:38 UTC (código a tempo / cron desligado no projeto não-canônico / plano B com limpeza por SQL), e a consulta do dia 09/08 vira a **primeira medição direta** da corrida — inclusive o caso `0 linhas`, que seria achado maior que o dedupe. Registrado que **não corroborei pelo banco** a medição de que os dois projetos disparam: `system_events` não tem nenhum evento `source like 'cron/%'` em 15 dias e os crons de efeito externo não mostram envio duplicado em 30 dias — mas ambos têm guarda própria, então a evidência dos logs do @devops continua valendo. **Correção de canal:** decisão do Gabriel (*"não usamos Telegram e sim WhatsApp"*) tratada como **story própria 87-9**, não como emenda aqui — a troca depende de **template aprovado pela Meta** (os 12 templates em uso são todos pré-aprovados; não há texto livre iniciado por nós) e de decisão de destinatário, o que não fecha em horas. O que entra aqui é só a **costura**: a AC3 passa a assertar sobre `notificarAdmins`, não sobre `sendTelegramAdminAlert`, para que a 87-9 troque um corpo de função sem reabrir esta rota. Medições novas: `TELEGRAM_BOT_TOKEN` **existe** no projeto `freelans-dev/trifold-crm` — falta o `TELEGRAM_ADMIN_CHAT_ID`, e `telegram.ts:5` exige os dois; o WhatsApp com template funciona **todo dia** (`novo_lead_corretor` último envio hoje 12:15); **já existe superfície humana** para o evento (`/dashboard/sistema` lê `system_events` por level/category) — o que falta é o empurrão, não o registro; e `sendPushToUser` (36 assinaturas ativas) é ponte sem dependência externa. | @po (Pax) |
| 2026-08-08 | 0.1 | Story criada a partir do **REL-001** do gate da 87-3 e da medição do @devops (dois projetos Vercel disparam todos os crons — 15 dias consecutivos, 2× em 100%, intervalo de **1 s** em 28/07: *"a corrida é o caso médio, não a cauda"*). **Arbitragem do @sm: story própria, não correção embutida** — cinco razões, sendo decisiva o prazo de horas contra uma fila com janelas de 24 h (a `87-7` é deploy 2, a `87-8` é deploy 3), mais a disjunção total de arquivos e a recusa de reabrir o gate PASS de 3 rodadas da 87-4. **Desenho: a garantia muda de camada** — `UNIQUE` no banco + padrão de reivindicação (`insert` primeiro, alerta só de quem gravou), com o `select`-depois-`insert` **removido** (mata REL-003 junto) e a escrita **aguardada** (mata REL-002 nestes dois eventos). **Achado que fecha o prazo:** o índice sobre `metadata->>'message_id'` casa com o `metadata` que o código de **hoje** já emite ⇒ **a migration sozinha, aplicada por Management API sem deploy, torna a duplicata impossível amanhã**; o código é a metade que silencia o barulho e o alerta em dobro. Medições minhas contra produção (read-only, 08/08): **0** eventos dos tipos da 87-3 (o cron nunca rodou — AC6 daquele gate segue PENDING), `system_events` com **11.677 linhas / 16 MB**, **0** linhas com `message_id` e **0** com `dedupe_key` ⇒ criação de índice sem risco de duplicata pré-existente. Numeração de migration reconferida: maior prefixo local é **216** (o **R-G** do epic diz 215 e desatualizou) ⇒ **217**. Registrado o **Telegram morto em produção** (`telegram.ts:5` suprime em silêncio, token ausente nos dois projetos) como regra normativa para as três stories desta leva: **nenhuma AC pode depender de "o alerta chegou"** — a prova é a linha em `system_events`. Divergência de contagem de dependentes registrada com método (@devops: 6 crons; @sm: 4 crons + 1 rota admin por `grep`). | @sm (River) |
