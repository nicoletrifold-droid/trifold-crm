# Parecer @po — Story 900-21b (Allowlist re-triada + esqueleto `org_integrations`/`whatsapp_config`)

**Validador:** @po (Pax)
**Data:** 2026-08-29
**Story:** `docs/stories/900-21b-allowlist-retriada-e-org-integrations.story.md` (Draft, 6 ACs, 3 Tasks, 698 linhas)
**Plano de referência:** `~/.claude/plans/vamos-por-partes-entao-crystalline-dongarra.md` — Onda 2, Passos 1 e 3
**Branch no momento da validação:** `story/900-15-migrar-rotas-pii`

---

## Veredito: **NO-GO** — 8 correções obrigatórias

O conteúdo desta story é bom e a medição do @sm é, na maior parte, exata: conferi **as 19 linhas de
loop de `itera-orgs` uma por uma** e as 19 batem; conferi todos os achados de `alvos-onda-2` e todos
batem; conferi os pré-requisitos de schema da migration e todos existem. Não é um problema de
conteúdo.

O que reprova é o mesmo padrão das duas stories anteriores desta onda: **a régua nasce sem carrasco,
e desta vez ela nasce com o furo que existe para pegar.** Achei três defeitos rodando, não lendo:

1. A reestruturação da allowlist **desliga a regra ESLint para ~51 arquivos**, em silêncio. Provei
   por mutação.
2. A varredura de completude **perdeu um arquivo** — `platform/orgs/route.ts`, criado pelo PR #498,
   o mesmo PR que a story analisa. São 2 arquivos à deriva, não 1.
3. A régua nova **não detecta nenhum dos dois casos** — nem o que o @sm achou à mão, nem o que ele
   perdeu. Um `grep` também não serve; testei e ele dá 2 falsos positivos.

Mais a premissa falsa da `245`, que esconde uma dependência dura em PR não mergeado.

---

## 1. As correções bloqueantes

### B1 — A reestruturação de `legitimos` desliga a regra ESLint para ~51 arquivos, em silêncio

`packages/web/eslint-rules/no-unscoped-admin-client.mjs:31`:

```js
const PERMITIDOS = new Set([...Object.keys(allowlist.legitimos ?? {}), ...(allowlist.legado ?? [])])
```

A regra lê **`legitimos` e `legado`, e mais nada**. A AC1 move 51 das 62 entradas de `legitimos`
para `plataforma`/`itera-orgs`/`alvos-onda-2` — chaves que a regra não conhece. `PERMITIDOS` cai de
240 para 189.

**Medido por mutação (aplicada e revertida):** movi `analytics-report/route.ts` de `legitimos` para
`itera-orgs`, exatamente como a AC1 manda.

```
# antes: npx eslint src/app/api/cron/analytics-report/route.ts  →  (silêncio)
# depois:
   5:10  warning  createAdminClient() usa service-role e BYPASSA RLS...  aios/no-unscoped-admin-client
  42:20  warning  createAdminClient() usa service-role e BYPASSA RLS...  aios/no-unscoped-admin-client
✖ 2 problems (0 errors, 2 warnings)
```

Arquivo restaurado byte a byte (`git diff` vazio) e o silêncio voltou.

A severidade é `warn` (`eslint.config.mjs:26`, deliberado desde a `900-14`), então **nada quebra** —
51 arquivos perdem governança sem que uma única linha de CI fique vermelha. É o mesmo mecanismo que
manteve os 2 warnings do `nicole-health` invisíveis por 5 dias, aplicado a 51 arquivos de uma vez,
pela mão da story que existe para consertar esse tipo de cegueira.

Consequência direta: **a própria verificação da AC1 é impossível como está escrita.** Ela diz
`pnpm eslint .../nicole-health/route.ts` sai 0 warnings *"(a entrada nova em `alvos-onda-2` silencia
a regra)"*. `alvos-onda-2` não silencia nada — a regra não lê essa chave.

**Correção obrigatória:** acrescentar Task e AC para atualizar `no-unscoped-admin-client.mjs` a unir
as 5 seções (`plataforma ∪ itera-orgs ∪ alvos-onda-2 ∪ legitimos ∪ legado`), e uma asserção no teste
de que `PERMITIDOS.size` pós-reescrita é **igual ao total de entradas do arquivo** (242, ver B4).
Isso remove a frase *"Zero código de aplicação"* do Scope IN item 1 — a regra ESLint tem de ser
tocada, e é melhor descobrir isso aqui do que no meio da Task 1.4.

---

### B2 — A régua não tem célula de vivacidade para o defeito que ela existe para pegar

As três regras de `validarAllowlist` (caminho duplicado / `:linha` na forma / prazo vencido) mais o
controle positivo são um bom começo, e concordo com a decisão de verificar **forma** e não conteúdo:
um `grep` por `for (const org` mediria o arquivo, não o comportamento. Isso está certo.

Mas nenhuma das três regras detecta **um arquivo novo com `createAdminClient()` que não está na
allowlist** — que é literalmente o defeito que esta story acabou de achar à mão duas vezes
(`nicole-health`) e perder uma vez (`platform/orgs`, ver B3). O controle positivo ("arquivo real →
`[]`") não ajuda: o arquivo real está `[]` hoje e continuaria `[]` com 51 arquivos fora de
governança.

Pior, há vacuidade estrutural: se uma chave de seção vier grafada diferente (`iteraOrgs` em vez de
`itera-orgs`), a regra 2 itera zero entradas, devolve zero violações, e o controle positivo passa
verde. É o mesmo "verde por vacuidade" da `900-3c`.

**Testei o carrasco por varredura de sistema de arquivos e ele não serve** — 195 arquivos casam
`createAdminClient(`, 4 ficam fora da allowlist, e **2 desses 4 são falso positivo**
(`src/lib/tenancy/platform-query-scan.ts` e seu teste — são o scanner *daquela string*, o ESLint por
AST corretamente não os acusa). Confirma a lição: AC de `grep` mede o arquivo.

**Correção obrigatória — o carrasco tem de ser o próprio ESLint.** Acrescentar:

- **Regra 0 (vivacidade):** as 4 chaves de seção existem e nenhuma é vazia; contagens mínimas
  esperadas (`plataforma ≥ 16`, `itera-orgs ≥ 24`, `alvos-onda-2 ≥ 12`, `legitimos ≥ 12`).
- **AC de catraca:** `eslint` sobre `packages/web/src` sai com **0** ocorrências de
  `aios/no-unscoped-admin-client`. Isto é alcançável hoje e é a régua que teria pego os dois casos.

**Baseline que medi, para o @dev comparar:** hoje, `npx eslint src` acusa exatamente **2 arquivos**
— `src/app/api/cron/nicole-health/route.ts` (2 warnings) e `src/app/api/platform/orgs/route.ts`
(2 warnings). Depois desta story, tem de ser **0**. Se sair diferente de 0, a reestruturação
regrediu (B1).

---

### B3 — A varredura de completude perdeu um arquivo: `src/app/api/platform/orgs/route.ts`

Respondendo diretamente à pergunta "sobrou algum cron single-tenant?": **nos crons, não** — varri
`DEFAULT_ORG_ID`, UUID hard-coded, `process.env.*ORG_ID`, `[0]!.org_id` e leitura de
`whatsapp_config` sem escopo em todos os 40 diretórios, e não sobrou nada além dos 12 que a story já
classificou. `bolsao-rebalance` e `sla-alerts`, que eu suspeitava, escopam corretamente por
`org_id` (`:328` e `:135`) e estão certos em `itera-orgs`.

**Mas fora dos crons sobrou um.** `src/app/api/platform/orgs/route.ts`:

- usa `createAdminClient()` (`:75`) e chama `db.rpc("provision_org", ...)` (`:76`);
- **não está na allowlist** (`grep` → 0);
- acusa **2 warnings** da regra hoje;
- foi criado em `544f3d73`, 2026-08-24 — **depois** do `congeladoEm: 2026-08-23** — pelo **PR #498
  (Stories 900-21 e 900-22)**, que é exatamente o PR que esta story dissecou para justificar a
  numeração `900-21b`.

A story leu o #498 para a migration `240` e não leu o #498 para a rota que ele adicionou. E é a rota
que chama a função que esta story modifica.

**Correção obrigatória:** entra na chave `legitimos` residual (não em `plataforma`) — é a mesma
família de `lib/tenancy/admin-invite.ts` e `lib/tenancy/platform-query.ts`, o caminho cross-org
sancionado do painel `/platform`. Motivo sugerido, espelhando o do `admin-invite.ts`:
`"Rota do painel /platform que provisiona empresa cliente (Story 900-21/PR #498): chama provision_org() com service-role; a autorização acontece na rota, não no SQL (platform/orgs/route.ts:75-76)"`.
`legitimos` residual passa de 11 para **12**.

---

### B4 — A aritmética de conferência da AC1 está errada em dois lugares e mesmo assim fecha no número certo

A AC1 afirma: `15 + 19 + 5 + 12 + 11 + 178 = 240 (62+178 originais) + 1 = 241`.

Contei o arquivo. Dois defeitos:

1. **`plataforma` são 16 entradas, não 15.** A story escreve *"9 crons `billing-*`"* — mas
   `billing-monthly-summary` ocupa **duas** chaves (`route.ts` e `route.test.ts`), como a própria
   AC1 reconhece entre parênteses. São 10 entradas de billing + `keep-alive` + `webhook-health` +
   `purge-rejected-uploads` + 3 definições = **16**.
2. **O `+1` do `nicole-health` conta duas vezes.** Ele já está dentro dos 12 de `alvos-onda-2`. A
   soma `15+19+5+12+11 = 62` já o inclui; somar `+1` depois é double-count.

Os dois erros se cancelam e a AC aterrissa em 241, que *pareceria* certo se não faltasse o
`platform/orgs` (B3). Uma régua de conferência que erra duas vezes e fecha é pior que uma que erra
uma vez e abre — é exatamente o tipo de identidade que sobrevive à revisão.

**Aritmética correta, para substituir a da AC1:**

| Seção | Qtd |
|---|---|
| `plataforma` | 16 |
| `itera-orgs` (19 implementações + 5 testes-irmãos) | 24 |
| `alvos-onda-2` (9 rotas + 3 testes-irmãos, incl. `nicole-health` novo) | 12 |
| `legitimos` residual (9 webhooks + `admin-invite` + `platform-query` + `platform/orgs` novo) | 12 |
| **Subtotal (era `legitimos`)** | **64** = 62 originais + 2 achados |
| `legado` (intocado) | 178 |
| **TOTAL** | **242** |

E a régua tem de ser executável, não prosa: o teste da AC1 assere `242` (ou o total lido do arquivo)
contra `PERMITIDOS.size` da regra ESLint (B1).

---

### B5 — A AC6 é intenção, não critério verificável, exatamente onde carrega a restrição inegociável

Os 5 itens numerados da AC6 estão bem construídos — cada um nomeia o mecanismo e a prova, e conferi
os dois controles que dão para conferir agora:

- **AC6.2:** `git grep org_integrations -- packages/` → **0 ocorrências**. Confere.
- **AC6.5:** a allowlist é consumida por `no-unscoped-admin-client.mjs` e por **mais nada** no
  repositório executável (varri o repo inteiro: os outros consumidores são `docs/` e memórias de
  agente). Confere — reclassificar não muda runtime.
- Acrescento uma medição que reforça a AC6.1: **não existe hoje nenhum `insert`/`update`/`upsert` em
  `whatsapp_config` em `packages/web/src`** — só leituras. Então o `23505` novo não pode atingir
  nenhum caminho existente. A AC pode afirmar isso com prova, em vez de argumentar.

**O problema é o bloco "Verificação (mutação que reprova)".** Ele diz: *"rodar uma suíte de smoke —
qualquer rota que leia `whatsapp_config`/`organizations` — antes e depois; diff de resposta tem que
ser vazio."*

Isso não é uma mutação e não é executável. Não há lista de rotas, não há comando, e — o que decide —
**não há nada que prove que o procedimento de comparação consegue enxergar uma diferença.** Um "diff
vazio" entre duas capturas que nunca aconteceram é verde igual a um "diff vazio" real. É a mesma
forma de vacuidade da `900-3c`, agora sentada em cima da única restrição que o dono do produto
chamou de inegociável.

**Correção obrigatória, duas partes:**

1. **Enumerar.** A lista é finita e eu a contei: são **31 call sites** com
   `.maybeSingle()`/`.single()` em `whatsapp_config` em `packages/web/src`. A AC deve nomear o
   subconjunto que vai ser exercitado (ou declarar que o instrumento é `pnpm test` + N consultas SQL
   nomeadas), não dizer "qualquer rota".
2. **Célula de vivacidade.** Antes de declarar "diff vazio", rodar o procedimento contra uma
   diferença **plantada**: dar `UPDATE whatsapp_config SET waba_id = waba_id || '-x'` numa linha do
   `trifold-crm-dev`, confirmar que a comparação fica **vermelha**, reverter, e só então rodar o
   antes/depois de verdade. Sem isso, o AC6 não distingue "não mudou nada" de "não mediu nada".

---

### B6 — Providers: **6**, não 5. Decisão tomada.

O @sm semeou 5 e registrou a divergência em vez de escolher sozinho — isso foi certo. Decido **6**,
mantendo `meta_ads` e `meta_capi` como providers separados:

```
'whatsapp', 'meta_ads', 'meta_capi', 'sienge', 'telegram', 'google'
```

Argumentos, em ordem de peso:

1. **`status` é por linha, e os dois estados são independentes.** Uma org pode ter o CAPI
   funcionando e o Ads quebrado (ou o inverso — o plano diz que o *token* do CAPI continua global na
   Onda 2 enquanto o Ads depende de `meta_ad_accounts` por org). Com uma linha `meta` única, o campo
   `status` não tem casa para o estado real e vira ilegível — o defeito de "tipo de 2 casas para 3
   estados" que já custou caro neste epic.
2. **A assimetria de reversibilidade aponta para separar.** Juntar depois é um `DELETE`. Separar
   depois é `ALTER` + migração de dados numa tabela que **já roteia o webhook do Meta** — que é
   exatamente o argumento que a própria story usa para deixar `secret_ref` declarado e nulo. Começa
   pelo lado barato.
3. **São credenciais de sistemas diferentes.** Ads API (page/ad account) × dataset do Conversions
   API. Uma empresa pode ter CAPI sem Ads.
4. **É o único jeito de a aritmética do dono do produto fechar.** "7 → 6" só é auto-consistente se
   `meta_ads` e `meta_capi` forem linhas distintas (7 − `resend` = 6). Escolher 5 contraria o número
   que ele deu explicitamente. O "Meta precisa do pixel tbm" lê como afirmação de **escopo** (o
   pixel/dataset tem de ser configurável) e não de **cardinalidade de linha** — o pixel é
   configurável nos dois desenhos.

**Consequências que o @dev tem de aplicar junto:**
- `CHECK (provider IN ('whatsapp','meta_ads','meta_capi','sienge','telegram','google'))`.
- `dataset_id` **sai** do `config` de `meta_ads` e vai para `meta_capi`:
  `meta_ads → '{"page_id": null}'`, `meta_capi → '{"dataset_id": null}'`.
- O índice `org_integrations_meta_page_ativo` continua `WHERE provider = 'meta_ads'` — inalterado.
- AC4/AC5: seed e backfill passam a **6** linhas; as verificações que dizem `= 5` passam a `= 6`.

---

### B7 — Dependência dura em PR não mergeado, não declarada

`pnpm db:apply` e `pnpm db:status` **não existem em `origin/main`** — medido com
`git show origin/main:package.json`. Existem só em `story/900-3c-registro-migrations` / PR #525, que
está **OPEN**. As Tasks 2.4 e 2.6 dependem dos dois, e a Dev Notes cita o job de CI da `900-3c` como
rede de segurança — que também não existe em `main`.

A Metadata não tem campo de dependência. **Correção obrigatória:** declarar
`Depends on: PR #525 (Story 900-3c) mergeado` na Metadata, e dizer o que fazer se não estiver
(promoção manual via Management API, com a evidência colada do mesmo jeito).

---

### B8 — Premissa falsa sobre a migration `245`

A Dev Notes e a Task 2.1 afirmam que `245_registro_de_migrations.sql` *"já está em `origin/main`"*.
**Não está.** Medido:

- `origin/main` está em `77f225d1`; a maior migration lá é a **`244`**.
- A `245` aparece só em `refs/heads/story/900-3c-registro-migrations` e no remoto correspondente.
- PR #525: `state: OPEN`, `mergedAt: null`.

**A escolha da `246` continua correta** — a varredura do @sm percorre todas as refs e enxerga a `245`
na branch do PR aberto, que é o comportamento certo. Mas a justificativa está errada, e é uma
premissa falsa que leva à conclusão certa: sobrevive à revisão e depois é citada como fato. Pior,
ela **esconde o B7** — se a `245` estivesse mesmo em `main`, o `db:apply` estaria disponível.

**Correção obrigatória:** trocar por *"`246` livre em todas as refs; a `245` está na branch do PR
#525 (aberto), não em `main` — a varredura por refs é justamente o que evita colidir com ela"*.

---

## 2. Correções recomendadas (não bloqueantes)

### C1 — A AC2 superestima o alcance do índice `whatsapp_config_org_ativo`

A AC2 diz que a UNIQUE parcial *"torna estruturalmente seguros os 27 call sites que já filtram por
`org_id` e usam `.maybeSingle()`"*. O **27 está exatamente certo** — contei 31 call sites com
`.maybeSingle()`/`.single()`, dos quais 27 filtram por `org_id`. Boa medição.

Mas o índice é parcial `WHERE status = 'active'`, e **só 18 dos 27 também filtram
`.eq("status","active")`.** Os outros **9** filtram só por `org_id`:

```
app/api/cron/bolsao-rebalance/route.ts      lib/notificacoes.ts (×4)
app/api/cron/sla-alerts/route.ts            lib/reports/send-daily-report.ts
lib/appointments/notify-imob-visit.ts       lib/alerts/admin-whatsapp.ts
```

Para esses 9, uma org com 1 linha `active` + 1 linha `inactive` continua devolvendo 2 linhas →
`.maybeSingle()` → `null` → o mesmo silêncio de antes. E é um cenário que esta onda torna **mais**
provável, não menos: a AC4 passa a semear linhas `inactive`.

**Correção:** escopar a afirmação a **18** e nomear os 9 como exposição residual, com o encaminhamento
(ou eles ganham `.eq("status","active")`, ou o índice vira incondicional — decisão de outra story).
Uma AC que declara resolvido o que resolveu 2/3 fecha o defeito no papel.

### C2 — A decisão do roteamento do WhatsApp está certa, mas ainda é só comentário

Julguei o `[AUTO-DECISÃO]` e ele está **certo**. Li o plano: a seção "Decisões travadas" diz
textualmente *"Resolução do WhatsApp | por `whatsapp_config.phone_number_id`, não por
`org_integrations` | Evita duas fontes de verdade..."*, e o Passo 4 reforça (*"o `select` já traz o
`access_token` da mesma linha ⇒ token por org sai de brinde"*). O texto do Passo 3, que pede os dois
índices, é o lado mais fraco da contradição. Decisão mais específica e reafirmada por último
prevalece — concordo.

E a razão **está escrita onde a `900-47` vai encontrar**: no comentário do próprio SQL da migration,
além da AC3 e da Dev Notes. Isso satisfaz o pedido.

**O que falta é o carrasco.** A tabela ainda semeia uma linha `provider='whatsapp'` com `config
jsonb` livre. Nada impede uma story futura de escrever `phone_number_id` ali e recriar as duas fontes
de verdade — só que agora sem índice para tornar a divergência visível. Recomendo tornar a decisão
executável:

```sql
CONSTRAINT whatsapp_sem_identificador_proprio
  CHECK (provider <> 'whatsapp' OR NOT (config ? 'phone_number_id'))
```

Uma decisão travada que só existe em comentário é uma convenção. Com o `CHECK`, reabrir a decisão
exige uma migration — que é precisamente o custo que a story quis impor.

### C3 — Divergência com o épico não registrada

O épico atribui os *"índices UNIQUE de roteamento reverso"* à `900-47` — duas vezes (linha 559 na
matriz de ownership, linha 816 na descrição da `900-21`). Esta story cria um deles agora, e está
certa em fazê-lo (o plano aprovado é explícito: *"Os índices vêm agora, não na Onda 7: roteamento
reverso sem índice UNIQUE é roteamento por convenção"*).

Mas o épico continuará dizendo o contrário para o próximo leitor. O épico já tem o mecanismo pronto
para isso — a linha 561, *"`provision_org()` — nota de rastreabilidade"*, criada pela `900-22b`
exatamente para este caso. **Acrescentar uma nota irmã** para `org_integrations`, registrando que o
índice de `meta_ads` saiu na `900-21b` e que o de `whatsapp` **não vai existir** (decisão travada).

### C4 — `900-21b` não existe no épico

`grep 900-21b` no épico → 0. Registro de contexto de story em épico é responsabilidade minha e está
pendente: a story precisa aparecer na matriz de ownership de `org_integrations` (linha 559) e no
corpo da `900-21` (linha 816), como continuação da fatia que a `240` deixou aberta.

### C5 — `nicole-health` está em `alvos-onda-2`, mas sua correção não é a dos outros dois

A story o classifica como *"travado"*, ao lado de `daily-report` e `nicole-agenda-reconcile`. O plano
diz outra coisa no Passo 2: *"**`nicole-health` — reclassificação, não migração.** Ele avisa o admin
da Trifold que a API de IA parou; é vigia de **plataforma**. ... Migrar para iteração criaria N
alertas para o mesmo incidente — o oposto do que o comentário do arquivo diz que ele existe para
evitar."*

`alvos-onda-2` é o artefato de handoff que a próxima story vai ler. Se a entrada só disser "travado",
quem pegar a `900-20` vai envolvê-lo num `forEachActiveOrg` e criar N alertas. **Carregar a ressalva
para dentro do motivo da entrada.**

### C6 — Escopar a AC6.1 ao caminho de leitura

A AC6 afirma *"todo caminho existente dá exatamente a mesma resposta"*. Verdade para leitura, e
confirmei que hoje não há escritor de `whatsapp_config` na aplicação. Mas o `23505` **é** uma mudança
no caminho de escrita — intencional e desejada. Nomear em vez de deixar a afirmação absoluta; a story
de onboarding/painel vai escrever nessa tabela.

---

## 3. O que conferi e passa — dito explicitamente

Isto não é preenchimento: é a parte da story que não precisa ser mexida, e o @dev deve saber disso
para não retrabalhar.

| Afirmação da story | Como conferi | Resultado |
|---|---|---|
| 48 das 62 entradas de `legitimos` com a string copiada; `legado` = 178; `congeladoEm 2026-08-23` | contagem programática do JSON | **exato** |
| As 19 linhas de loop de `itera-orgs` | `sed -n Lp` nos 19 arquivos, uma a uma | **19/19 exatas** |
| `daily-report:16,33` · `nicole-agenda-reconcile:30,76` · `meta-ads-intelligence:231` · `meta-capi-dispatch:101-103` sem `.eq("org_id")` · `followup` lookup em `:167-171` antes do loop em `:192` · `supremo*` com `SUPREMO_ORG_ID` | leitura direta das linhas | **todos exatos** (o `followup` é ainda pior que o descrito: filtra só por `status='active'`, sem org nenhuma) |
| `nicole-health`: fora da allowlist, `DEFAULT_ORG_ID:31` usado em `117,126,157,166`, 2 warnings, criado em `51d21d1e` 2026-08-28 | grep + eslint + `git log` | **exato** |
| 37 crons agendados, 40 diretórios, 3 órfãos = `calendly-sync`, `supremo-history-sync`, `supremo-sync` | `vercel.json` × `readdir` | **exato** |
| Pré-requisitos de schema: `public.is_admin()` (047:28), `public.user_org_id()` (004:10), `update_updated_at()`, `whatsapp_config(org_id NOT NULL, phone_number_id, status default 'inactive')` | grep nas migrations | **todos existem** |
| `provision_org(p_name text, p_slug text)` com 4 blocos numerados; ponto de inserção entre o bloco 4 e o `RETURN` | leitura da `240_provision_org.sql` | **exato** |
| `org_integrations` tem 0 consumidores em `packages/` (controle da AC6.2) | `git grep` | **0** |
| Allowlist não é consumida em runtime (AC6.5) | varredura do repo | **só o ESLint** |
| `vitest.config.ts` inclui `scripts/**/*.test.ts` | leitura do config | **inclui** (linha 19) |
| **Pré-condições da AC2 rodadas nos DOIS ambientes antes de aplicar** | Task 2.2 | **sim, mandado corretamente** — teste **e** produção, read-only, com as duas saídas coladas antes de escrever a migration |
| **Vault registrado** | Context §1 + Dev Notes | **sim** — `supabase_vault v0.3.1` + `pgcrypto v1.3` nos dois projetos, com a ligação explícita ao ADR-005 e a atualização do ADR corretamente deferida ao @architect |
| **`secret_ref` declarado e nulo nesta fatia** | AC3 | **sim**, com a justificativa certa (evitar `ALTER` em tabela que já roteia webhook) |
| Justificativa de numeração `900-21b` (não `900-16`, não número solto) | backlog:305 + épico:559/816/561 | **sólida** — o item `900-16` existe e está corretamente preservado |
| Reforço de `platform_audit_log` no backlog | `docs/backlog.md:328-337` | **feito**, append-only, sem reabrir o mérito |

---

## 4. Checklist de 10 pontos

| # | Critério | Status | Nota |
|---|---|---|---|
| 1 | Template / estrutura | ✅ | Todas as seções presentes. Seção "Numeração" é excepcionalmente boa e resolve um risco real. |
| 2 | Executor assignment | ✅ | `@data-engineer` (migration) + `@dev` (allowlist/teste), com precedente citado. Quality gate `@architect` ≠ executores. |
| 3 | Caminhos / árvore | 🟡 | 19/19 linhas de loop conferidas, pré-requisitos de schema conferidos. **Mas** falta `platform/orgs/route.ts` (B3) e a regra ESLint não é citada como arquivo a tocar (B1). |
| 4 | Cobertura AC ↔ Task | 🟡 | 6 ACs ↔ 3 Tasks. A Task 2 carrega 4 ACs (aceitável — é uma migration só, regra R9). Falta task para a regra ESLint (B1). |
| 5 | Testabilidade / poder discriminante | ❌ | **Reprova.** A régua da AC1 não pega o defeito que a story acabou de achar à mão (B2), não tem célula de vivacidade, e a reestruturação apaga a governança sem acender nada (B1). A AC6 não tem mutação que reprove (B5). |
| 6 | Testing standards | ✅ | Vitest puro para AC1 (config confere), execução real contra `trifold-crm-dev` para AC2-AC5 — mesmo padrão de `900-3b`/`900-3c`, com evidência colada. Honesta ao dizer que não há suíte para DDL. |
| 7 | Segurança | ✅ | RLS ligada com policy de escrita (R1), `org_id NOT NULL` (R3), `is_admin()` justificado contra `user_role()='admin'`, `secret_ref` nulo, nenhum valor de segredo. `gate:tenancy` na Task 2.5. |
| 8 | Sequência de tasks | 🟡 | Ordem interna correta (2.1→2.2→2.3→2.4→2.5→2.6, com a pré-condição antes de escrever). **Mas** a dependência externa do PR #525 não é declarada (B7). |
| 9 | Anti-alucinação | ❌ | **Reprova por uma premissa.** A vasta maioria das afirmações confere (tabela §3). Mas a `245` **não** está em `origin/main` (B8), e a aritmética de conferência da AC1 está errada em dois lugares que se cancelam (B4). |
| 10 | Prontidão para o @dev | ❌ | Não. A verificação da AC1 é literalmente impossível como escrita (B1), a contagem de providers estava em aberto (resolvida aqui, B6), e a de entradas está errada (B4). |

**Placar: 4 ✅ · 3 🟡 · 3 ❌ → NO-GO** (o gate exige ≥7 e nenhum ❌ em testabilidade).

---

## 5. Resumo executivo das correções obrigatórias

| # | Correção | Onde |
|---|---|---|
| **B1** | Atualizar `no-unscoped-admin-client.mjs` para unir as 5 seções + asserção de `PERMITIDOS.size`. Remover "Zero código de aplicação" | Scope IN, AC1, Task 1 |
| **B2** | Regra 0 de vivacidade (seções existem, não-vazias, contagens mínimas) + AC de catraca: `eslint packages/web/src` → 0 warnings da regra. Baseline hoje = 2 arquivos | AC1 |
| **B3** | Acrescentar `src/app/api/platform/orgs/route.ts` a `legitimos` residual (11 → 12), motivo espelhando `admin-invite.ts` | AC1 |
| **B4** | Aritmética correta: 16 + 24 + 12 + 12 = 64 (62 + 2 achados); + 178 = **242**. Executável no teste, não em prosa | AC1 |
| **B5** | AC6: enumerar o que é comparado + célula de vivacidade (plantar um `UPDATE`, provar vermelho, reverter) | AC6 |
| **B6** | **6 providers**, com `meta_capi` separado; `dataset_id` migra para `meta_capi`; seed/backfill/verificações de 5 → 6 | AC3, AC4, AC5 |
| **B7** | Declarar `Depends on: PR #525` na Metadata + plano B se não mergear | Metadata, Task 2 |
| **B8** | Corrigir a justificativa da `246`: a `245` está na branch do PR #525 (aberto), não em `main` | Dev Notes, Task 2.1 |

**Recomendadas:** C1 (escopar a AC2 a 18 call sites, nomear os 9) · C2 (`CHECK` que trava o WhatsApp
fora de `org_integrations`) · C3 (nota de rastreabilidade no épico) · C4 (registrar `900-21b` no
épico) · C5 (ressalva do `nicole-health` dentro do motivo) · C6 (escopar a AC6.1 à leitura).

**Handoff:** volta para `@sm` (River). Depois das 8 correções, revalido — as B1/B2/B5 têm de vir com
a saída de execução, não com a redação.

---

*— Pax, equilibrando prioridades 🎯*

---
---

# Revalidação — v2 da story (2026-08-29)

**Validador:** @po (Pax) · **Story:** 982 linhas, 6 ACs / 3 Tasks
**Método:** as 5 perguntas do coordenador foram respondidas **rodando**, não lendo. Reconstruí o JSON
reestruturado e a regra unida no repo real, rodei o ESLint sobre `src` inteiro, e restaurei tudo
(`git status` limpo em `docs/audits/` e `packages/web/eslint-rules/`).

## Veredito: **GO** — com 3 correções obrigatórias na implementação (escopo @dev, não @sm)

As 8 bloqueantes estão resolvidas, e a mais estrutural delas eu **provei por execução**. As 3
correções abaixo não pedem novo ciclo do @sm: todas são no *procedimento de verificação*, que é o
@dev quem escreve. Cada uma vem com a receita que eu já rodei.

---

## 1. B1 — a união das 5 chaves: **provada, restaura tudo, não abre buraco novo**

Reconstruí o JSON exatamente como a AC1 especifica (16 / 24 / 12 / 12) e apliquei o patch da regra
tal como escrito na AC1. Resultados medidos:

```
contagens: {"plataforma":16,"itera-orgs":24,"alvos-onda-2":12,"legitimos":12}
união das 4 seções: 64 | legado: 178 | TOTAL: 242
perdidos (estavam em legitimos e sumiram): []
novos: [ cron/nicole-health/route.ts , platform/orgs/route.ts ]

PERMITIDOS.size = 242

$ cd packages/web && npx eslint src   →   ARQUIVOS: 0 | WARNINGS: 0
```

- **Restaura a isenção dos 51:** o mesmo `analytics-report/route.ts` que acendia 2 warnings na v1
  fica silencioso. Zero arquivos acusados em `src` inteiro.
- **Não perde ninguém:** a diferença entre as chaves originais de `legitimos` e a união das 4 seções
  novas é **vazia**. Nenhuma entrada evapora na reestruturação.
- **B4 confirmada por construção:** 16 + 24 + 12 + 12 = 64 = 62 originais + 2 achados; + 178 = **242**,
  idêntico ao `PERMITIDOS.size`.

**"Alguém em `alvos-onda-2` deveria acender e não vai?"** Não, e é por desenho: os 12 alvos são
crons **quebrados** que ganham isenção com prazo. O carrasco deles não é o ESLint, é o
`alvosExpiramEm` + Regra 3 — uma bomba-relógio que fica vermelha em 2026-10-01. Isso está certo.
Mas ver a ressalva R3 abaixo.

---

## 2. As 3 correções obrigatórias

### R1 — A catraca do ESLint **não tem dentes**: `eslint` sai com código 0 quando só há warnings

Medido, com os 4 warnings presentes:

```
$ npx eslint src                     → exit=0     ← CI passaria verde
$ npx eslint src --max-warnings 0    → exit=1
```

A AC diz *"`cd packages/web && npx eslint src` ... tem que sair com 0 ocorrências"*. Como a
severidade da regra é `warn` (deliberado desde a `900-14`), **esse comando nunca falha**. É uma
conferência a olho pelo @dev na Task 1, não uma catraca — e o CI roda `pnpm lint`, que ficaria verde
com os 51 arquivos fora de governança. O defeito que a B1 descreve pode voltar sem nada acender.

**`--max-warnings 0` não serve:** medi 35 warnings em `src`, dos quais só 4 são desta regra
(24 `no-unused-vars`, 4 `no-img-element`, 2 sem regra, 1 `no-unused-expressions`).

**Receita, rodada por mim da raiz do repo — exit 1 correto, ~15s:**

```js
const { execFileSync } = require("child_process")
const out = execFileSync("npx", ["eslint", "src", "--format=json"],
  { cwd: "packages/web", maxBuffer: 64 * 1024 * 1024, encoding: "utf8" })
const hits = JSON.parse(out).flatMap(f =>
  f.messages.filter(m => m.ruleId === "aios/no-unscoped-admin-client")
            .map(m => f.filePath.split("/packages/web/")[1] + ":" + m.line))
// assert hits.length === 0
```

Saída no estado atual — **reproduz o baseline da AC1 byte a byte**, o que confirma a B2:

```
ocorrências: 4
  - src/app/api/cron/nicole-health/route.ts:2
  - src/app/api/cron/nicole-health/route.ts:69
  - src/app/api/platform/orgs/route.ts:21
  - src/app/api/platform/orgs/route.ts:75
exit=1
```

Tem de virar asserção dentro de `scripts/admin-client-allowlist.test.ts` (que roda em `pnpm test`, e
**esse** sai não-zero), não um comando cuja saída alguém lê.

### R2 — A asserção-ponte `PERMITIDOS.size === 242` **não é implementável como está escrita**

Duas medições:

```
$ import('./packages/web/eslint-rules/no-unscoped-admin-client.mjs')   (da raiz)
  → ENOENT: '/Users/docs/audits/admin-client-allowlist.json'

$ new ESLint({ cwd: <abs>/packages/web }).lintFiles(['src'])           (da raiz)
  → ENOENT: '/Users/docs/audits/admin-client-allowlist.json'
```

A regra resolve o JSON com `join(process.cwd(), "..", "..", ...)` **no carregamento do módulo**, e o
`cwd` da API do ESLint **não muda `process.cwd()`**. Somado a isso, `PERMITIDOS` é `const` de módulo
— **não é exportado**. Como o Vitest roda da raiz (`vitest.config.ts` inclui `scripts/**/*.test.ts`),
o teste não consegue ler `PERMITIDOS` de jeito nenhum.

**Escolher uma das duas:**
- **(a) preferida** — já que a regra está aberta pela B1: trocar `process.cwd()` por resolução
  relativa a `import.meta.url` e exportar a união (`export const PERMITIDOS`). Conserta a causa raiz
  (a regra hoje só carrega se o cwd for `packages/web`) e torna a asserção literal.
- **(b) mínima** — o teste recalcula a união a partir do JSON e assere `=== 242`, e a ponte com a
  regra fica sendo o R1 (subprocesso), que é o carrasco de verdade. Se escolher (b), **dizer na AC
  que o subprocesso é a ponte** — senão fica parecendo que o `PERMITIDOS.size` foi verificado.

### R3 — A célula de vivacidade da AC6 **corrompe a evidência que a própria AC6.3 precisa**

A célula está certa em intenção e é a maior melhoria desta revisão. Mas o mecanismo tem um efeito
colateral medido:

```
supabase/migrations/003_whatsapp_config.sql:20
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON whatsapp_config ... EXECUTE FUNCTION update_updated_at();
supabase/migrations/001_base_schema.sql:282
  NEW.updated_at = now();
```

A célula dá **dois** `UPDATE` na linha da Trifold (plantar + reverter). Cada um dispara o trigger.
Resultado: `updated_at` fica permanentemente diferente da captura "antes" — e então

- a **consulta 1** da AC6 (`SELECT *`, que inclui `updated_at`) mostra um diff espúrio no
  antes/depois real da migration; e
- a **prova do item 3** da AC6 é literalmente *"comparar `updated_at` da linha de `whatsapp_config`
  da Trifold, antes e depois da migration, é idêntico"* — que passa a falhar por causa do próprio
  teste de vivacidade.

O @dev vai ver vermelho que não é da migration, e o desfecho natural é normalizar o `updated_at`
para fora da comparação — apagando exatamente o sinal que a AC existe para capturar.

**Correção — transação com `ROLLBACK`, que desfaz inclusive o trigger:**

```sql
BEGIN;
  UPDATE whatsapp_config SET waba_id = coalesce(waba_id, '') || '-x'
    WHERE org_id = (SELECT id FROM organizations WHERE slug = 'trifold' LIMIT 1);
  -- rodar a consulta 1 aqui: TEM que vir diferente da captura "antes"
ROLLBACK;   -- desfaz o valor E o updated_at; nenhum resíduo
```

Dois defeitos menores que isso também resolve: `waba_id` pode ser **NULL** (`NULL || '-x'` = `NULL`
→ a célula não acende, e a AC manda concluir "o procedimento está cego" — diagnóstico errado; o
`coalesce` fecha); e `replace(waba_id, '-x', '')` não é inverso seguro se o valor original já contiver
`-x`.

---

## 3. Ressalvas registradas, não bloqueantes

- **Regra 3 ainda escapa por ausência de campo.** Está redigida como *"todo `alvosExpiramEm` precisa
  ser data >= hoje"* — iterando sobre o campo, não sobre as entradas. Uma entrada de `alvos-onda-2`
  **sem** o campo nunca vence, e a Regra 0 (`>= 12`) aceita uma 13ª assim. Redigir como *"toda
  entrada de `alvos-onda-2` **tem** `alvosExpiramEm` **e** ele é >= hoje"*.
- **Plano B da B7 cita arquivo que também não está em `main`.** A Metadata diz "Management API
  (mesmo transporte de `reset-tenancy-testdb.ts`/`scripts/lib/management-api.ts`, disponível desde a
  `900-3`)". Medido: `scripts/lib/management-api.ts` **só existe no PR #525** — o mesmo que a
  dependência tenta contornar. **Mas o plano B continua executável:** `origin/main` tem o transporte
  inline em `scripts/reset-tenancy-testdb.ts:252` (`runSql` → `POST api.supabase.com/v1/projects/{ref}/database/query`)
  e exporta `splitStatements` (`:268`). O custo real é **uma linha de `export`** no `runSql`, ou
  copiar ~15 linhas. Corrigir a citação — é a segunda vez nesta story que um "disponível desde X"
  aponta para algo que não está em `main` (a primeira foi a B8).
- **Context §2 ficou desatualizado pela B6.** A linha 128-131 ainda lista 5 providers sem `meta_capi`
  e ainda diz que `dataset_id` vai no `config` do `meta_ads` — contradiz AC3/AC4/AC5, que o moveram
  para `meta_capi`. Quem ler o Context antes das ACs semeia a forma errada.
- **`CHECK` do WhatsApp — semântica conferida e correta.** `provider <> 'whatsapp' OR NOT (config ?
  'phone_number_id')`: para linhas `whatsapp`, exige a chave **ausente**; para os outros 5 providers
  o predicado é verdadeiro por vacuidade. `config` é `NOT NULL DEFAULT '{}'`, então não há brecha por
  `NULL`. Há precedente do operador `?` em migrations do projeto (`043`, `218`), e o transporte é SQL
  cru por HTTP, sem placeholder. Cobre só a chave de topo — suficiente. **É isto que transforma a
  decisão travada em invariante.**

---

## 4. O que verifiquei e passa

| Item | Como medi | Resultado |
|---|---|---|
| **B1** união das 5 chaves | reconstruí JSON + patch da regra, rodei `eslint src`, restaurei | **0 arquivos / 0 warnings**; 0 perdidos; `PERMITIDOS.size` 242 |
| **B2** baseline | subprocesso `eslint --format=json` | **4 warnings / 2 arquivos**, linhas 2, 69, 21, 75 — idêntico ao colado na AC1 |
| **B3** `platform/orgs` | entra em `legitimos` residual (12), linhas 21/75, commit `544f3d73` | confere |
| **B4** aritmética | contagem programática | 16+24+12+12 = 64 = 62+2; +178 = **242** |
| **B5** AC6 | 5 consultas nomeadas + célula de vivacidade | estrutura correta; **ver R3** |
| **B6** 6 providers | `CHECK IN` (6), seed AC4 (6 linhas), backfill `CROSS JOIN` (6), verificação `count(*) = 6`, `dataset_id` em `meta_capi` | propagado; **exceto Context §2** |
| **B7** dependência | `Depends on: PR #525` + plano B | declarado; **ver ressalva** |
| **B8** premissa da `245` | `git show origin/main:package.json`, `git ls-tree origin/main` | corrigida |
| **C1** | AC2 escopada a **18 de 27**, 9 nomeados com `arquivo:linha` | confere com a minha medição |
| **C2** | `CHECK whatsapp_sem_identificador_proprio` | semântica correta |
| **C5** | ressalva "reclassificação, não migração" dentro do motivo | aplicada |
| **C6** | AC6.1 escopada à leitura | aplicada |

## 5. C3/C4 — executadas por mim (são da minha autoridade; o @sm declinou corretamente)

`docs/stories/epics/epic-900-saas-multi-tenant.md`:
- **C3** — linha nova *"`org_integrations` — nota de rastreabilidade"* na matriz de ownership (§560),
  no mesmo molde da nota de `provision_org()` criada pela `900-22b`. Registra as **duas** divergências:
  o índice de roteamento reverso de `meta_ads` foi **antecipado da `900-47`** (o plano aprovado é
  explícito), e o índice de `whatsapp` **nunca vai existir** (decisão travada + o `CHECK` que a torna
  invariante). A linha 559 passa a apontar para ela.
- **C4** — `900-21b` registrada no corpo da `§900-21` (§817), dizendo que a AC foi entregue por ela e
  que **`role_default_permissions` continua a única parte da `900-21` em aberto**.

---

## 6. Checklist — v2

| # | Critério | v1 | v2 | Nota |
|---|---|---|---|---|
| 1 | Template / estrutura | ✅ | ✅ | |
| 2 | Executor assignment | ✅ | ✅ | |
| 3 | Caminhos / árvore | 🟡 | ✅ | `platform/orgs` entrou; regra ESLint agora em escopo |
| 4 | Cobertura AC ↔ Task | 🟡 | ✅ | Task 1 cobre JSON + lint + regra ESLint |
| 5 | Testabilidade / poder discriminante | ❌ | 🟡 | Regra 0 + catraca existem e a união está provada. **R1** (catraca sem dentes) e **R3** (célula corrompe a evidência) impedem o ✅ |
| 6 | Testing standards | ✅ | ✅ | |
| 7 | Segurança | ✅ | ✅ | `CHECK` novo reforça |
| 8 | Sequência de tasks | 🟡 | ✅ | dependência declarada com plano B executável |
| 9 | Anti-alucinação | ❌ | ✅ | reproduzi B1/B2/B4 por execução; premissa da `245` corrigida |
| 10 | Prontidão para o @dev | ❌ | 🟡 | pronta, com **R1/R2/R3** aplicadas na implementação |

**Placar: 8 ✅ · 2 🟡 · 0 ❌ → GO.**

## 7. Handoff

Vai para **@dev**. As três correções são obrigatórias e vão com **evidência colada** no Dev Agent
Record:

| # | Correção | Onde |
|---|---|---|
| **R1** | Catraca vira asserção em `pnpm test` (subprocesso `eslint` com `cwd: packages/web`, filtrado por `ruleId`). `npx eslint src` sozinho sai **exit 0** com warnings — medido | AC1 / Task 1 |
| **R2** | `PERMITIDOS.size === 242`: exportar + resolver por `import.meta.url` (a), ou recalcular no teste e declarar o subprocesso como ponte (b). Import da raiz dá **ENOENT** — medido | AC1 / Task 1 |
| **R3** | Célula de vivacidade em `BEGIN ... ROLLBACK` + `coalesce(waba_id,'')`. Os 2 `UPDATE` bombam `updated_at` pelo trigger e quebram a prova da AC6.3 | AC6 / Task 3 |

**@qa:** o gate deve conferir que R1 falha de verdade (mutação: tirar uma entrada da allowlist ⇒
`pnpm test` vermelho) e que a célula da AC6 não deixou resíduo em `updated_at`.

*— Pax, equilibrando prioridades 🎯*
