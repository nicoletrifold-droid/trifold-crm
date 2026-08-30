# Validação PO — Story 900-23 (`forEachActiveOrg` + crons corrigidos)

- **Story:** `docs/stories/900-23-foreachactiveorg-e-crons-corrigidos.story.md`
- **Validador:** @po (Pax) · **Data:** 2026-08-29
- **HEAD medido:** `e8ea5433` · branch `story/900-21b-allowlist-org-integrations`
- **Veredicto:** 🔴 **NO-GO** — 10 correções obrigatórias
- **Score:** 6,0 / 10

---

## Sumário

O desenho está certo em quase tudo que importa: a partição dos 40 crons fecha **exatamente**
(12 plataforma + 19 itera-orgs + 9 alvos-onda-2 = 40 diretórios em `api/cron/`), a decisão de não
migrar os 19 é a decisão certa e está bem argumentada, a armadilha do `DAILY_REPORT_RECIPIENTS`
foi vista antes de existir, e a ordem de deploy do `meta-capi-dispatch` já nasce como AC e não
como nota.

O que reprova é o mesmo padrão das três fatias anteriores, agora em cinco lugares: **régua sem
carrasco** — e, desta vez, mais duas classes novas: **três números medidos que não batem com HEAD**,
e **uma correção que cria o vazamento que a própria story ensina a evitar** (o mesmo defeito do
`daily-report`, na segunda rota migrada, negado explicitamente pela AC2).

Tudo abaixo foi medido rodando, não lendo.

---

## Decisão 1 — o PR #526 e as referências `900-20`

**Decisão: corrigir AQUI (AC8.1), como o @sm propôs. Não reabrir o #526.** Três razões, em ordem
de peso:

1. **A Task 8 desta story reescreve exatamente essas entradas de qualquer forma** — elas mudam de
   seção (`alvos-onda-2` → `itera-orgs`/`plataforma`). Corrigir no #526 garante conflito de merge
   nas mesmas linhas, em troca de nada.
2. **O #526 já carrega `admin-client-allowlist.json`, `allowlist-lint.ts`,
   `admin-client-allowlist.test.ts` e o épico** (medido: `gh pr view 526 --json files`). Reabrir
   significa re-rodar o gate de uma PR com migration para trocar 6 strings de prosa.
3. **Corrigir lá apaga o registro.** O valor aqui não é o número certo — é a *classe*: um palpite
   hedgeado em Dev Notes (*"provavelmente 900-20"*) atravessou para um artefato de governança
   commitado sem checagem de colisão. Essa classe só sobrevive se a correção for visível, com
   dono e data. É o mesmo critério que o épico usou para a dívida da `900-16`: registrar a
   divergência, não apagá-la.

**Condições da decisão** (entram como correção obrigatória):
- O número é **6**, não 9 (ver C1).
- A `900-21b` ganha **uma linha de Change Log** reconhecendo que o artefato subiu com referência
  errada e apontando a `900-23` como a correção — senão o registro existe só na story que
  conserta, e quem lê a `900-21b` no futuro não fica sabendo.
- A 8.1 sai em **commit próprio**, antes das mudanças de seção da Task 8, para o diff mostrar a
  troca de número separada da re-triagem.

**Não exigi catraca automática, e o motivo é medido:** nenhum grep sobre este JSON pegaria esse
erro. Os dois números são válidos e reservados pelo épico; o que estava errado era a *posse
semântica*, que grep não enxerga. E a regra óbvia ("número citado tem que ter arquivo de story")
reprovaria em falso `900-21`, `900-24` e `900-42a` — medido: são referências legítimas para
frente, sem arquivo. Catraca falsa é pior que nenhuma.

---

## Decisão 2 — a ordem de deploy do `meta-capi-dispatch`

**A story trata como AC, e isso está certo** — AC5.2 é bloqueante, e as Tasks 5.0/9.1/9.3/9.4
amarram a sequência. Mantenho como AC, não como nota. **Mas ainda não é verificável**, e sem as
três peças abaixo continua sendo um desejo redigido em imperativo:

1. **O seed não tem recibo.** `UPDATE org_integrations SET config = jsonb_set(...) WHERE org_id =
   … AND provider = 'meta_capi'` que não encontra a linha afeta **0 linhas e não diz nada**. A
   migration `246` faz backfill de `meta_capi` com `{"dataset_id": null}` para toda org existente
   (`supabase/migrations/246_...sql:245-251`), então a linha *deve* existir — mas "deve" não é
   prova. Exigir `RETURNING org_id, config->>'dataset_id'` com a linha colada, mais um `SELECT`
   de leitura depois.
2. **O fail-safe é mudo** (ver C9). `skipped`/`capi_nao_configurado` só existe dentro de uma
   coluna da outbox. Ordem invertida ⇒ a Trifold para de enviar CAPI **sem 500, sem alerta, sem
   log**, empilhando linhas que ninguém olha. Um mecanismo de segurança que não tem voz é
   indistinguível de "não havia nada pendente".
3. **Falta o plano B nomeado.** Se 9.1/9.3 não puderem ser feitos no dia, o código da AC5 **não
   sobe** — deploy dividido. Isso precisa estar escrito, senão a ordem depende de alguém lembrar.

---

## Correções obrigatórias

### C1 — Três números medidos não batem com HEAD (BLOQUEANTE)

| Story afirma | Medido em `e8ea5433` | Onde |
|---|---|---|
| `alvos-onda-2 cita 900-20: 9` (saída colada) | **6** | rodei o snippet da própria story |
| `nicole-health/route.test.ts`, **27 casos** | **17** | `npx vitest run …/nicole-health/route.test.ts` → `Tests 17 passed (17)` |
| "os **15/16** crons cross-org de plataforma" | **12** implementações de cron (16 é a contagem de *entradas* da seção, que inclui 3 libs e 1 teste) | contagem programática do JSON |

O primeiro é o mais grave porque é a **saída colada de um comando** na seção "Numeração" —
reproduzi o comando e ele imprime `6`. As 3 entradas `.test.ts` (`daily-report`,
`nicole-agenda-reconcile`, `meta-capi-dispatch`) **não citam** `900-20` nos motivos delas. O @dev
que for executar a 8.1 vai procurar 9 e achar 6, e o caminho fácil é concluir que alguém já
mexeu.

Corrigir os três e re-colar as saídas reproduzíveis contra HEAD.

### C2 — O carrasco da AC8.7 já nasce verde (BLOQUEANTE)

A régua escrita é:

```
git grep -c '"900-20"' docs/audits/admin-client-allowlist.json → 0
```

Rodada **hoje, antes de qualquer correção**: exit 1, zero saída. Ela já está satisfeita. As
ocorrências aparecem como `(900-20)` dentro da prosa do `motivo`, **nunca** como token entre
aspas. A régua mede uma forma que nunca existiu.

Trocar por `grep -c '900-20' docs/audits/admin-client-allowlist.json`, com **controle positivo
obrigatório**: colar `6` ANTES e `0` DEPOIS. Sem o "antes", o "depois" não prova nada.

### C3 — `MINIMOS["alvos-onda-2"] = 12` reprova o estado final desta story (BLOQUEANTE)

`scripts/lib/allowlist-lint.ts:43-48` define mínimos por seção. `alvos-onda-2` tem mínimo **12**.
A AC8.6 termina a seção com **3** (os órfãos). A Regra 0 dispara e
`pnpm test scripts/admin-client-allowlist.test.ts` fica **vermelho** — que é justamente o carrasco
que a AC8 declara como prova de sucesso.

E a AC8.7 diz textualmente: *"As 4 regras de `validarAllowlist` (`scripts/lib/allowlist-lint.ts`,
já existente, **não muda**)"*. Falso: `MINIMOS` vive nesse arquivo e **tem** que mudar.

Exigir: `alvos-onda-2` → 3, com comentário nomeando que este é o estado terminal até a decisão dos
órfãos na Onda 3; e `plataforma`/`itera-orgs` **subidos para o novo piso medido** — mínimo que
fica para trás da realidade para de pegar encolhimento (uma seção caindo de 28 para 24 passaria
batida).

### C4 — A migração mata uma AC da story 87-6, em silêncio (BLOQUEANTE)

`nicole-agenda-reconcile/route.ts:200-212`: o `catch` do handler emite `NICOLE_LASTRO_FALHA`
**antes** do 500, com o comentário *"Sem esta linha, uma falha de execução devolve 500 e NÃO deixa
rastro… Foi essa ambiguidade que custou quatro dias de diagnóstico"*. O teste
`route.test.ts:302-309` (`🔴 87-6`) é o carrasco dela.

A Propriedade 1 do `forEachActiveOrg` é *"nunca relança"* — ou seja, o helper **come** exatamente
essa exceção. Um @dev que mova o corpo para dentro do callback e apague o `try/catch` local
(porque "o helper agora trata") faz o `NICOLE_LASTRO_FALHA` desaparecer e ser substituído pelo
`CRON_ORG_FALHOU` genérico. A garantia de 87-6 morre sem ninguém ver. **A AC2 não menciona
`NICOLE_LASTRO_FALHA` uma única vez.**

Exigir na AC2: o callback **mantém** `try/catch` próprio que emite `NICOLE_LASTRO_FALHA` com
`org_id: org.id` e **relança** para o helper contabilizar a falha; o teste 87-6 continua verde em
substância (evento emitido + 500 no caso de org única falhando), com a mudança de forma do corpo
declarada (ver R3).

### C5 — A correção cria o vazamento que a própria story ensina a evitar (BLOQUEANTE)

A AC2 afirma, sobre `nicole-agenda-reconcile`: *"este cron **não** tem o problema de 'env global
vazando para outra org' (o único canal de aviso, `sendTelegramAdminAlert`, já é um canal de
administração único, sem lista por org configurável na tela)"*.

Medido — é o oposto. `packages/web/src/lib/telegram.ts:1-8`:

```ts
const token  = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID
```

Um chat só, global, por env. E o corpo do alerta (`route.ts:170-180`) carrega
`Lead: *${a.lead_nome}*`, o trecho **citado** da conversa e o deep link
`${APP_URL}/dashboard/leads/${a.lead_id}`.

Sob `forEachActiveOrg`, o nome do lead da org B, a frase que a Nicole disse para ele e o link
direto para o cadastro dele vão para o Telegram da Trifold. **"Não tem lista por org configurável"
não é o argumento de que não vaza — é a razão pela qual vaza**: como não há destino por org, tudo
cai no destino único, que é o da Trifold. É a mesma armadilha do `DAILY_REPORT_RECIPIENTS`, vista
na primeira rota e negada na segunda.

Exigir tratamento simétrico ao do `daily-report`: alerta de Telegram só para
`TRIFOLD_ORG_ID`/`DAILY_REPORT_ORG_ID`; as demais orgs registram em `system_events` e não
despacham. Carrasco: fixture com 2 orgs, org B com alertas ⇒ **zero** chamadas a
`sendTelegramAdminAlert` contendo dado da org B.

### C6 — Propriedade 5 não tem carrasco na rota (BLOQUEANTE)

A AC1 prova `statusHttpParaResumo` como função pura (3 casos, sem I/O — ótimo). **Nada prova que
qualquer rota a chama.** A verificação da AC2 cobre destinatários, `orgId` por org e o grep — não
toca em `res.status`.

E não precisa da Vercel: os testes existentes já fazem exatamente isso
(`daily-report/route.test.ts:82` e `:111` afirmam `res.status`). Exigir, nas duas rotas migradas:
- 2 orgs, 1 falha ⇒ `res.status === 200` e o corpo identifica qual org falhou;
- 2 orgs, ambas falham ⇒ `res.status === 500`;
- **0 orgs ativas ⇒ 200 e zero invocações do callback.**

### C7 — Propriedade 2 prova a chamada da fábrica, não o `db` entregue (BLOQUEANTE)

Esta é a propriedade que faz a peça pagar por si, e o carrasco escrito é *"espiar
`createOrgScopedAdminClient` e afirmar que é chamado uma vez por org, com `org.id` exato"*.

Com `vi.mock`, uma mutação que **chama** `createOrgScopedAdminClient(org.id)`, descarta o
resultado e entrega `createAdminClient()` cru ao callback **passa nesse teste**. A propriedade
verificada é "a fábrica foi invocada", não "o callback recebeu o client escopado".

Exigir identidade: o mock devolve uma sentinela por org (`{ __org: id }`) e o teste afirma
`db === sentinela(org.id)` em **cada** invocação do callback. É uma linha a mais e fecha o buraco.

### C8 — O único ponto onde o helper lança não tem carrasco (BLOQUEANTE)

A AC1 diz que erro na listagem de `organizations` **lança**, e manda *"documentar isso
explicitamente no JSDoc"*. JSDoc não é carrasco.

E o modo de falha aqui é o pior possível: se a implementação engolir o erro e devolver lista
vazia, cai em `total === 0` → **200** pela Propriedade 5. Banco fora do ar vira "nada para fazer",
com HTTP verde, em **todos** os crons que usam o helper, para sempre.

Exigir: listagem devolvendo `error` ⇒
`await expect(forEachActiveOrg(fn, opts)).rejects.toThrow(...)`, e **zero** invocações do callback.

### C9 — `capi_nao_configurado` não tem estado audível (BLOQUEANTE)

A AC5 item 5 resolve bem a semântica (`skipped`, não `sent` que mentiria nem `failed` que gastaria
as 3 tentativas). Mas o único registro é `meta_capi_outbox.last_error`. Combinado com a
dependência de ordem de deploy, isso é literalmente o defeito que a Onda 2 existe para eliminar:
comportamento errado, resposta 200, ninguém sabe.

Exigir:
- `logEvent({ level: "error", event_type: "CAPI_ORG_SEM_DATASET", org_id: orgId, … })`, uma vez
  por org por execução, quando o dataset não resolve;
- Task 9 ganha checagem **pós-deploy**: após a primeira execução do cron,
  `SELECT count(*) FROM meta_capi_outbox WHERE status='skipped' AND last_error='capi_nao_configurado'`
  → **0**, colado no Dev Agent Record;
- o seed da 9.3 com `RETURNING` e a linha colada (rowcount = 1), mais leitura de volta.

### C10 — A AC7 afirma um contador que não existe em 3 dos 6 arquivos (BLOQUEANTE)

A AC7 diz: *"Contador de falhas somado ao objeto de retorno de cada rota (`summary`/`results`, já
existentes em **todos os 6** arquivos)"*. Medido:

| Arquivo | Retorno hoje | Tem contador de falha? |
|---|---|---|
| `email-queue` | `{ processed, failed }` | **sim** |
| `roleta-retry` | `{ processed, ...results }` — 8 contadores (`distributed`, `skipped`, `aguardando`…) | **não**, nenhum de erro |
| `email-automations` | `{ …, skipped }` | **não** |
| `obras-approval-reminder` | `{ processed, notified_orgs }` | **não**, nenhum |
| `bolsao-rebalance` | `{ ok: true, summary: [] }` — array por org | **não é contador** |
| `sla-alerts` | `{ ok: true, summary: [] }` — array por org | **não é contador** |

Isso não é preciosismo de contagem. O carrasco da AC7 é *"o segundo item processado com sucesso e
o primeiro contabilizado como falha"* — mas sem campo nomeado por arquivo, a implementação natural
é `catch { console.error(...); continue }`, e aí a rota devolve **200 com corpo limpo** enquanto
engole erro. Trocamos "aborta tudo, ruidosamente" por "erra em silêncio", que é pior.

Exigir: nomear, arquivo a arquivo, o campo que carrega a falha (existente ou novo, incluindo a
forma nos dois que devolvem array), e o carrasco afirmando **sobre o corpo da resposta**
(`falhas >= 1` + identificação de qual item/org falhou), não só sobre "o 2º rodou".

---

## Recomendações (não bloqueiam)

**R1 — O diagnóstico da AC6 está errado, e a verdade é pior.** `followup/route.ts:167-171` usa
`.eq("status","active").maybeSingle()`. Com **duas** linhas ativas, `maybeSingle()` não devolve "a
primeira" — devolve **erro** (PGRST116). E o código faz `const { data: waCfg } = await …`,
**descartando `error`**. Ou seja: no dia em que a segunda org tiver `whatsapp_config` ativa, o
follow-up por template morre para **todas** as orgs, sem log (nem o
`FOLLOWUP_TEMPLATES_INDISPONIVEIS`, que só dispara mais adiante). Corrigir a prosa, garantir que o
fake honre `maybeSingle()` com >1 linha, e medir em produção hoje
(`SELECT count(*) FROM whatsapp_config WHERE status='active'`) — se já for >1, isso está quebrado
agora.

**R2 — A lista de leituras de produção da AC9 tem 3 itens e precisa de 5.** Os itens 3
(`meta-ads-intelligence`) e 5 (`followup`) afirmam *"com 1 org ativa…"* sem nenhuma leitura que
sustente a premissa. Acrescentar `SELECT count(DISTINCT org_id) FROM meta_ad_accounts WHERE
status='active'` e a contagem de `whatsapp_config` da R1.

**R3 — "resultado idêntico" é falso para o corpo da resposta, e há prova.** Três asserções
pré-existentes quebram: `daily-report/route.test.ts:103-104` (`json.skipped` no topo),
`nicole-agenda-reconcile/route.test.ts:176` (`body.dry === true`) e `:308`
(`expect(await res.json()).toEqual({ error: "timeout lendo messages" })`, igualdade exata). Isso
colide com a AC9 (*"0 regressão em suíte pré-existente"*). Reescrever a AC9 como **efeito
observável idêntico** (mensagem enviada, evento gravado, status HTTP), nomeando as três asserções
que mudam de forma e por quê — senão o @dev "conserta os testes" e ninguém percebe qual garantia
se moveu.

**R4 — `?dry=1`** é ferramenta de operador (produz o baseline antes do push, AC4-ii da 87-3) e
muda de forma sob o resumo. Nomear na AC2.

**R5 — `dedupe_key` não conhece org.** O índice é
`(event_type, metadata->>'dedupe_key')`, sem `org_id`
(`supabase/migrations/218_system_events_dedupe_nicole.sql:57-59`). Todo evento por-org sob o
helper **precisa** embutir `org.id` na chave, ou a org B é suprimida como duplicata da org A. O
`nicole-agenda-reconcile` já embute (teste `:260`) — estender esse teste para 2 orgs e afirmar
**2 chaves distintas**; e registrar a regra no JSDoc do helper.

**R6 — Propriedade 3: "lança síncrono" não existe** numa função `async` — ela rejeita. O teste tem
que ser `await expect(...).rejects.toThrow(/concurrency/)`, e a validação tem que rodar **antes**
de processar qualquer org (nada de trabalho parcial).

**R7 — `meta-ads-intelligence`: são 9 usos, não ~10.** Medido: 7 `.eq("org_id", orgId)` (`:255`,
`:274`, `:289`, `:298`, `:307`, `:323`, `:331`) + 2 escritas (`meta_sync_log:236`,
`meta_alerts:490`). O décimo match é `orgId: c.org_id` (`:428`), que é outra coisa — deriva a org
da própria campanha. O carrasco cobre o `meta_sync_log` mas **não** o `org_id` dos alertas:
acrescentar "2 orgs com alertas ⇒ linhas em `meta_alerts` com o `org_id` de cada uma".

**R8 — `meta_ad_accounts` não filtra org ativa.** O agrupamento por `org_id` sincroniza e alerta
org com `is_active = false`. Num épico de cobrança, org suspensa consumindo Graph API é custo.
Declarar como dívida nomeada, mesmo sem corrigir aqui.

**R9 — o lote do CAPI é global e FIFO** (`BATCH_SIZE = 50`, `*/3 * * * *`): uma org com backlog
monopoliza a fila. Volume atual (~22 leads/mês) torna isso teórico — registrar como dívida, não
corrigir agora.

**R10 — o épico precisa de duas correções, e são da minha alçada:**
- `§900-23` AC *"37 crons migrados"* → a partição medida: **40** rotas em `api/cron/` = 2 migram +
  1 reclassifica + 3 bespoke + 19 isolamento + 12 plataforma + 3 órfãos. Deixar "37 migrados" no
  épico faz esta story nascer parecendo incompleta para sempre.
- `epic-900:845` diz **`Dep: 900-20`** para a 900-23. Falso: esta story depende da `900-21b`, não
  do resolver de stage. Mantido como está, o grafo do épico diz que a 900-23 está bloqueada por
  uma story que não existe — e a `900-24` depende da 900-23.

**R11 — o carrasco do rename mede o rótulo, não o defeito.** `grep -n "DEFAULT_ORG_ID" → 0` é
satisfeito por qualquer renomeação. Medido hoje: o literal
`00000000-0000-0000-0000-000000000001` aparece em **7 linhas / 7 arquivos**, sendo **3 de
implementação** (`daily-report/route.ts`, `nicole-agenda-reconcile/route.ts`,
`nicole-health/route.ts`). Depois desta story sobram **2** (`TRIFOLD_ORG_ID`,
`PLATFORM_ALERT_ORG_ID`). Somar ao grep de nome um grep do **literal**, com a contagem exata
esperada por arquivo — e registrar no épico, porque a `§900-20` promete *"grep de verificação:
zero UUID de org em `packages/web/src`"* e vai herdar esses dois.

---

## Julgamentos pedidos

**"Não migrar os 19" — correto, e a medição confere.** Os 19 derivam a org da linha que processam;
trocar por "para cada org, procure pendências" é N queries vazias. Confirmei também os números da
AC7: `email-automations`, `email-queue`, `obras-approval-reminder` e `roleta-retry` têm **zero**
`try {`/`catch` no arquivo inteiro; `bolsao-rebalance` tem `try` só em `:336`/`:367` (envio de
WhatsApp, dentro de `for (const r of recipients)` na `:333`) e `sla-alerts` só em `:24` (idem).
Os 6 loops de org citados (`:61`/`:116`, `:53`, `:52`, `:74`, `:70`, `:110`) conferem linha a
linha. A partição inteira fecha em 40 sem sobra nem falta — é o sinal mais forte de que a
re-triagem da `900-21b` está viva.

**`nicole-health` mantendo 2 dos 5 — coerente, não meio-caminho.** Os cinco usos são três coisas
diferentes e a story separa as três corretamente: leitura (nunca teve filtro — o defeito era não
trazer `org_id`), atribuição do evento (era errada, sai) e **canal de entrega** (é o WhatsApp que
envia, tem que ser o da Trifold). Renomear para `PLATFORM_ALERT_ORG_ID` faz o nome parar de
mentir. Verificado que a remoção do `org_id` dos `logEventOnce` **não quebra o dedupe**: o índice
único é `(event_type, metadata->>'dedupe_key')`, sem `org_id`.

**`daily-report` — a AC prova o escopo, com uma ressalva.** A condição `org.id === TRIFOLD_ORG_ID`
e o fixture de 2 orgs acendem de verdade. Falta amarrar `res.status` (C6) e o campo de falha
(C10).

**`meta-capi-dispatch` — os dois filtros estão certos e bem justificados.** `.eq("org_id", orgId)`
**e** `.in("id", …)`, com o raciocínio correto nos dois sentidos. A semântica `skipped` também
está certa. Falta a voz (C9).

**Célula de vivacidade — sem o problema da fatia anterior.** A célula da AC9 mexe em **fixture de
teste**, não no banco: não há `UPDATE`, não há trigger de `updated_at`, não há resíduo. É o
formato certo. A única escrita real da story é o seed da 9.3, que é one-way e deve ser feito com
`RETURNING` (C9), não com plantar-e-reverter.

---

## Checklist 10 pontos

| # | Item | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | 1,0 | — |
| 2 | Descrição completa | 1,0 | Contexto e "por que 3 não usam o helper" exemplares |
| 3 | AC testáveis | 0,0 | C2 (régua verde de nascença), C6, C7, C8, C10 |
| 4 | Escopo IN/OUT | 1,0 | Melhor seção da story |
| 5 | Dependências mapeadas | 0,5 | Ordem de deploy sem recibo; `Dep: 900-20` do épico não reconciliado |
| 6 | Complexidade | 1,0 | G, coerente |
| 7 | Valor de negócio | 1,0 | — |
| 8 | Riscos documentados | 0,0 | C5: o risco existe e a story afirma que não existe |
| 9 | Definition of Done | 1,0 | Tasks com "colar saída" |
| 10 | Alinhamento com épico | 0,5 | C1 (3 números) + épico não corrigido (R10) |
| | **Total** | **6,0 / 10** | **NO-GO** |

**Status permanece `Draft`.** Devolver ao @sm. Re-valido quando C1–C10 estiverem aplicadas — com
as saídas de comando coladas e reproduzíveis contra HEAD.

— Pax, equilibrando prioridades 🎯

---

# Revalidação — 2026-08-29 (rodada 2)

- **Veredicto:** 🟢 **GO** · **Score:** 8,5 / 10 · Status da story → **Ready for Dev**
- **HEAD medido:** `e8ea5433` — todos os carrascos abaixo foram **rodados**, não relidos.

## C1-C10: conferidos um a um

| # | Estado | Como conferi |
|---|---|---|
| C1 | ✅ | `grep -c '900-20'` → **6**; `npx vitest run …/nicole-health/route.test.ts` → `Tests 17 passed (17)`; `plataforma` = 12 crons + 3 libs + 1 teste = 16 entradas. A partição fecha em **40** |
| C2 | ✅ | Régua trocada para `grep -c '900-20'` (sem aspas) com controle positivo 6→0 na Task 8.1 |
| C3 | ✅ **melhor do que pedi** | A AC separa a *lógica* das 4 regras (não muda) dos *dados* de `MINIMOS` (mudam). A Task 8.8 exige o **vermelho antes** de corrigir `MINIMOS` e o verde depois — controle positivo sobre a própria catraca |
| C4 | ✅ | `try/catch` interno emite `NICOLE_LASTRO_FALHA` com `org_id: org.id` e **relança**. As duas garantias convivem: o helper conta a falha (Propriedade 1) e, com 1 org, `sucesso===0 && total===1` ⇒ **500** por `statusHttpParaResumo` — o status que o teste `🔴 87-6` afirma. A mutação (apagar o catch interno) fica vermelha por zero eventos |
| C5 | ✅ | Afirmação falsa reescrita, correção simétrica ao `daily-report`, e o carrasco **acende nos dois sentidos**: zero despacho com dado da org B **e** despacho preservado para a Trifold — uma mutação que só desligasse o Telegram não passaria. O `telegramMock` já existe (`route.test.ts:181`) |
| C6 | ✅ | 3 cenários de `res.status` na rota (1 falha→200 com a org identificada, todas falham→500, 0 orgs→200 + zero callbacks) |
| C7 | ✅ | Identidade por sentinela dentro do callback (`db === sentinela(org.id)`), não contagem de chamadas da fábrica |
| C8 | ✅ | `rejects.toThrow()` + `fn` nunca chamada, **e** a mutação nomeada (tratar `error` como lista vazia) tem que ficar vermelha |
| C9 | ✅ | `logEvent CAPI_ORG_SEM_DATASET` por org/execução + Task 9.5 pós-deploy (`capi_nao_configurado` = 0) |
| C10 | ✅ **melhor do que pedi** | Campo nomeado arquivo a arquivo, **mais** a mutação decisiva: reverter *só* o campo (mantendo o `try/catch`) também tem que ficar vermelho — é o que impede "isolar em silêncio" |

**Decisão 1** executada com as 3 condições (6 e não 9 · Task 8.0a na `900-21b` · 8.1 em commit próprio).
**Decisão 2** executada com as 3 peças (`RETURNING` + leitura · Task 9.5 pós-deploy · plano B de deploy dividido na 9.4).

## O par que eu queria ver completo (C8)

O ponto fino: "lançou" e "lista veio vazia" **são caminhos distinguíveis** na story final.
Erro de listagem ⇒ a promessa **rejeita** (AC1/C8). Zero orgs ativas ⇒ a promessa **resolve**,
`total: 0`, `res.status === 200`, zero callbacks (AC2/C6). Uma implementação que engula o erro em
`data ?? []` cai do primeiro caso para o segundo — e o `rejects.toThrow()` fica vermelho. É
exatamente a discriminação que faltava.

## AC10 — acrescentada por mim (autoridade de AC é do @po)

`trifoldOrgId()` é a decisão **certa** como mecanismo: uma declaração vence duas duplicadas. Como
estava escrito, porém, era **a porta de entrada para o próximo UUID**, por quatro razões — e as
quatro viraram AC10 + Task 10:

1. **Casa errada** — `lib/reports/`, importado por um cron que não é relatório, e fora do
   diretório (`lib/tenancy/`) onde o gate, o §900-20 e qualquer revisor de multi-tenancy procuram.
   Exceção guardada onde ninguém audita não é exceção, é esconderijo.
2. **Não se declara exceção** — o JSDoc proposto descreve a função. Precisa declarar *o que é*
   (marcador de qual org é a Trifold, só para escopar canais globais), *por que existe* (os dois
   canais têm destino único por env) e **quem a mata** (`org_integrations.provider='telegram'`, já
   criado pela migration `246`, + aposentadoria de `DAILY_REPORT_RECIPIENTS`). Sem o sucessor
   nomeado, ela vira permanente por omissão.
3. **Medida uma vez, não travada** — a R11 pede os greps colados no Dev Agent Record. Isso mede
   hoje. A catraca custa ~15 linhas e o repositório já tem a forma exata
   (`scripts/admin-client-allowlist.test.ts` varre `src` e compara com um conjunto declarado).
   Medido: **7 ocorrências / 7 arquivos** hoje, 3 de implementação; depois da story, 2 de
   implementação, nomeados. Um terceiro reprova.
4. **Achado novo desta rodada (10.4):** `trifoldOrgId()` lendo `DAILY_REPORT_ORG_ID` **recria a
   dependência cruzada que a própria AC2 comemora ter fechado** — e mais larga. Hoje o env de um
   cron era fallback de org de outro; na v2, apontar o relatório diário para outra org passaria a
   redirecionar **para onde vai o Telegram do cron da agenda**, em silêncio. Mesma classe da C5,
   um nível acima. Correção: literal puro no módulo, e o `daily-report` compõe
   `process.env.DAILY_REPORT_ORG_ID ?? trifoldOrgId()` localmente.

**Veredicto sobre a pergunta do coordenador:** é override legítimo **como mecanismo**, dívida nova
**como estava embalado**. Com a AC10 aplicada, vira exceção nomeada, no lugar certo, com sucessor
e com catraca — que é a diferença entre uma exceção e uma porta.

## R10 — aplicada por mim no épico

`docs/stories/epics/epic-900-saas-multi-tenant.md`, §900-23:
- título e AC deixam de dizer **"37 crons migrados"** → partição medida que fecha em **40**
  (2 migram · 1 reclassifica · 3 bespoke · 19 isolamento · 12 plataforma · 3 órfãos), com a nota
  de que migrar os 19 seria **regressão de eficiência**, não dívida;
- `lib/tenancy/guard.ts` → `lib/tenancy/for-each-org.ts` (o `guard.ts` nunca existiu);
- ressalva de que o grep do **nome** é satisfeito por rename: os **2** literais que sobrevivem por
  desenho estão nomeados, e o §900-20 herda essa dívida — senão o "zero UUID de org em
  `packages/web/src`" daquela story nasce como régua impossível;
- `**Dep:** 900-20` → **`900-21b`** (a dependência real é `org_integrations`/migration `246`;
  mantido como estava, o grafo dizia que esta story estava bloqueada por uma que não existe).

## Ressalva não bloqueante

O mock de sentinela da C7 precisa devolver o **mesmo objeto** por org entre chamadas
(`Map` de sentinelas), senão `toBe` compara instâncias diferentes. Erra alto — nunca passa em
falso — por isso não bloqueia.

## Checklist 10 pontos (rodada 2)

| # | Item | Nota |
|---|---|---|
| 1 | Título claro | 1,0 |
| 2 | Descrição completa | 1,0 |
| 3 | AC testáveis | 1,0 — todos os carrascos rodados e discriminantes |
| 4 | Escopo IN/OUT | 1,0 |
| 5 | Dependências mapeadas | 1,0 — ordem de deploy com recibo, plano B e épico reconciliado |
| 6 | Complexidade | 1,0 |
| 7 | Valor de negócio | 1,0 |
| 8 | Riscos documentados | 0,5 — C5 corrigida, mas a AC10.4 mostra que a mesma classe reapareceu um nível acima |
| 9 | Definition of Done | 1,0 |
| 10 | Alinhamento com épico | 1,0 |
| | **Total** | **8,5 / 10 — GO** |

Segue para o **@dev**. As 4 condições da AC10 já estão escritas na story — não dependem de memória
de ninguém.

— Pax, equilibrando prioridades 🎯
