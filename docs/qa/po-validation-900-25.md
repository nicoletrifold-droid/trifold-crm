# Parecer do `@po` — Story 900-25 (A Prova: Duas Empresas Reais no Ambiente de Teste)

- **Story:** `docs/stories/900-25-prova-duas-empresas-reais-ambiente-teste.story.md`
- **Autor do draft:** @sm (River) · **Validado por:** @po (Pax) · **Data:** 2026-08-29
- **Onda 2, Fatia 4** (Passo 6 do plano aprovado) · **Rodada 1**

## Veredicto: 🔴 **NO-GO** — 5 correções obrigatórias, 4 recomendadas

**Score: 7.5/10 nominal — reprovado assim mesmo, e a razão é a natureza desta story.**
Nas três fatias anteriores a régua era um subproduto; aqui **a régua é o produto**. Cinco
defeitos medidos fazem o instrumento ficar cego ou impossível — e dois deles (D3, D4) deixam
**verdes, sob a mutação que existem para pegar**, exatamente as duas asserções que a própria
story chama de coração da prova. Uma story cujo único entregável é evidência não pode nascer
sem carrasco do próprio carrasco.

**O que está muito bom, e não quero que se perca no rewrite:** a seção "Numeração" (medida, não
opinada); o Scope OUT com razão nomeada por item; a decisão de config isolada em vez de
`describe.skipIf` dentro do `pnpm test`; a exigência de controle positivo na AC6; a insistência
nos dois sentidos (AC7); a captura de argumento no stub (AC11); o teardown por id; e a regra
"nunca afirmar contagem total" no banco compartilhado. Onze dos quinze ACs sobrevivem intactos.

---

## Decisão 1 — a colisão de numeração: **RESOLVIDA E REGISTRADA** (autoridade do `@po`)

`900-25` **fica com o conteúdo do Passo 6** (Camada A + Camada B no `trifold-crm-dev`), como o
`@sm` propôs. Três razões, medidas:

1. A missão do dono do produto (2026-08-29) atribui `900-25` ao Passo 6, por escrito.
2. `docs/backlog.md`, `[TEST-004]:97` já registrou `Dona: 900-25` para este conteúdo **antes** de
   a story existir.
3. O roteiro do epic §857 **não é construível hoje**: `Dep: 900-22`, e `900-22` não existe como
   story (só `900-22b`, recorte parcial) — verificado em `docs/stories/`.

**O que o `@sm` deixou em aberto, e eu decidi (não adiei):** o roteiro de produção do §857
("Org Trifold Sandbox", ACs (a), (c), (d), (e)) **dobra para `900-32`**, que já havia absorvido a
AC (b) pelo mesmo motivo (entitlement). **Não recebe número novo.** Um roteiro de aceitação
partido em dois números, com a metade (b) já morando em `900-32`, é a receita para as duas
metades divergirem — e ninguém percebe, porque cada uma passa sozinha. `Dep: 900-22` passa a ser
dependência de `900-32`.

**Registrado no epic:** `docs/stories/epics/epic-900-saas-multi-tenant.md` — nota em §857
(colisão + destino) e nota em §952 (`900-32` herda o roteiro inteiro).

**Ação para a story:** a seção "Numeração" pode encolher para 3 linhas + link para o epic. O
parágrafo "Fica registrado para o `@po` resolver antes da Onda 3" sai — está resolvido.

---

## Decisão 2 — o bloqueio de implementação: **PROCEDE, mas é PARCIAL** (o `@sm` bloqueou demais)

**Medido em 2026-08-29** (`gh pr list --state open --json number,mergeable,mergeStateStatus`):
`#525`, `#526`, `#527`, `#528` — as quatro `MERGEABLE`/`CLEAN`, **nenhuma mergeada**. O branch
atual é `story/900-24-roteamento-webhook-identificador`. A afirmação do `@sm` está correta nos
fatos.

**Procede para as Tasks 3-12.** Rodar Camada B contra uma branch mede a branch, não o sistema; e
`900-3c` é pré-condição operacional real (Task 0.2 usa `pnpm db:status`, e `schema_migrations`
nativo não serve).

**NÃO procede para as Tasks 1 e 2.** A Task 1 (auditoria de Camada A, AC1) e a Task 2
(`TEST-004`, AC2) tocam arquivos que **existem hoje** — verifiquei os três:
`packages/web/src/lib/tenancy/webhook-org.test.ts`,
`packages/web/src/app/api/cron/meta-ads-intelligence/route.test.ts` (o teste verbatim da AC1 está
mesmo em **:237**) e os dois fakes do `TEST-004`. Bloquear essas duas tasks atrasa trabalho que
não depende de merge nenhum.

**Correção obrigatória de forma (C0):** o bloqueio sai da prosa e vira campo de Metadata:

```
- **Status:** Draft — **BLOQUEADA PARCIALMENTE**
- **Blocked by (Tasks 3-12 apenas):** PR #525, #526, #527, #528 — todas abertas em 2026-08-29.
  Reconfirmar no dia da implementação.
- **Desbloqueado desde já:** Task 1 (AC1) e Task 2 (AC2) — Camada A, arquivos já em `main`.
```

---

## 🔴 Correções OBRIGATÓRIAS (bloqueiam o GO)

### D1 — O import da guarda da AC3 **não resolve**. Medido, não inferido.

Rodei a config exata da AC3 (`vitest.tenancy.config.ts` como está no draft, `include:
["tests/tenancy/**/*.test.ts"]`) com o import exato da guarda:

```
Error: Cannot find package '@trifold/shared/constants/supabase-refs'
       imported from /Users/.../trifold-crm/tests/tenancy-probe/probe.test.ts
```

E a forma nua também falha:

```
Error: Cannot find package '@trifold/shared' imported from .../tests/tenancy-probe/probe.test.ts
```

Causa: `tests/` na raiz não está dentro de nenhum pacote do workspace. `ls node_modules/@trifold/`
→ **não existe**; o link real é `packages/web/node_modules/@trifold/shared`. Além disso
`packages/shared/package.json` **não tem campo `exports`** (`main: "src/index.ts"`), então o
subpath `constants/supabase-refs` não existiria nem com o link — o caminho real é
`src/constants/supabase-refs.ts`.

**A justificativa escrita na AC3 também está errada nos fatos.** Ela diz que o import é do pacote
"não de `scripts/lib/db-env.ts` — `tests/` roda sob o `vitest` isolado, que não tem o mesmo
`resolve.alias` de `scripts/`". `scripts/` não tem alias nenhum:
`scripts/reset-tenancy-testdb.ts:63` importa por **caminho relativo**
(`"../packages/shared/src/constants/supabase-refs"`).

**Correção:** `vitest.tenancy.config.ts` ganha o alias explícito, e a AC3 passa a exibi-lo:

```ts
alias: {
  "@web": path.resolve(__dirname, "packages/web/src"),
  "@trifold/shared": path.resolve(__dirname, "packages/shared/src"),
  "server-only": path.resolve(__dirname, "packages/web/src/__mocks__/server-only.ts"),
}
```

E a AC3 ganha verificação executável: *"um teste trivial que só importa `ehRefDeProducao` roda
verde antes de qualquer asserção de banco"*. Sem isso o `@qa` descobre isto na primeira execução
— barato — mas a AC estaria mentindo, e AC que mente é o que esta onda inteira existe para matar.

---

### D2 — O 12º instrumento cego: o estado **natural** de `pnpm test:tenancy` é "verde com zero asserções".

Duas medições, com a config da AC3:

**(a) o vitest não lê nenhum `.env` deste repositório.** Com a config da AC3, dentro do teste:

```
TENANCY_TEST_SUPABASE_URL=undefined
TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY=undefined
SUPABASE_URL=undefined
NEXT_PUBLIC_SUPABASE_URL=undefined
```

As três `TENANCY_TEST_*` **existem** em `.env.teste` (raiz) — mas `.env.teste` não é nome que o
Vite carregue (ele carrega `.env`, `.env.local`, `.env.[mode]`, e o mode de `vitest run` é
`test`), e quem lê `.env.teste` é `scripts/lib/db-env.ts`, que esta suíte não usa. A raiz também
não tem `setupFiles`.

**(b) a guarda 2, exatamente como escrita, sai 0 escondendo asserções que falhariam.** Rodei
`describe.skipIf(!credenciaisPresentes)` com duas asserções deliberadamente falsas
(`expect(1).toBe(2)`):

```
 Test Files  1 skipped (1)
      Tests  2 skipped (2)
EXIT_CODE=0
```

O `console.warn` nem aparece no fim da saída.

**Somando (a) e (b):** quem rodar `pnpm test:tenancy` do jeito documentado, sem `export` manual,
recebe **exit 0, zero asserção executada, nenhum aviso visível**. A story cujo produto é a prova
tem, por default, um comando que reporta sucesso provando nada — e **nenhum AC obriga a evidência
do contrário**. A lição 4 do próprio Context ("filtro que não casa nada também sai verde") está
escrita e não virou AC.

**Correção — AC nova (chame de AC3b), com três exigências:**
1. **Como as credenciais entram** documentado e executável. Ou `vitest.tenancy.config.ts` carrega
   `.env.teste` explicitamente (`dotenv.config({ path: ".env.teste" })` no topo do config), ou o
   script vira `"test:tenancy": "tsx --env-file=.env.teste ..."` ou equivalente. **Não** deixar
   "exporte à mão" como contrato — é isso que transforma o skip em default permanente.
2. **Dev Agent Record obrigatório com a contagem de testes EXECUTADOS vs. pulados**, colada da
   saída real (`Tests  N passed`), nunca só "verde". Um `0 passed | 14 skipped` reprova a story.
3. **Controle positivo de vivacidade, executado uma vez e colado:** quebrar deliberadamente **uma**
   asserção de banco (ex.: `expect(msg!.org_id).toBe(orgAId)` no teste que deveria dar `orgBId`),
   rodar, colar o **vermelho**, reverter. É o mesmo padrão que a `900-3b`/`900-21b` já estabeleceram:
   instrumento sem vermelho não é instrumento.

---

### D3 — AC6, o coração da story, está **verde por colinearidade**. A mutação que ela existe para pegar não a reprova.

A migration `246` cria **duas** UNIQUE parciais em `whatsapp_config` (linhas 40-49):

```sql
CREATE UNIQUE INDEX whatsapp_config_phone_ativo ON whatsapp_config (phone_number_id)
  WHERE status = 'active' AND phone_number_id IS NOT NULL;   -- (1) a que a AC6 quer provar
CREATE UNIQUE INDEX whatsapp_config_org_ativo  ON whatsapp_config (org_id)
  WHERE status = 'active';                                    -- (2) a outra
```

A AC6 insere a terceira linha **em `org_id: orgAId`** — e a org A **já tem** uma linha `active`
(a própria AC6 acabou de ativá-la duas linhas acima). Essa inserção viola as **duas**. A asserção
é só `expect(error!.code).toBe("23505")`.

**Consequência:** se `whatsapp_config_phone_ativo` — o índice cuja ausência a story diz tornar
"todo o resto teatro" — **não existisse**, a asserção continuaria verde, disparada por
`whatsapp_config_org_ativo`. A frase-tese da AC ("se este passo passar sem erro, o índice não
existe") é derrotada pelo próprio código da AC.

**Correção:** afirmar o **nome da constraint**, não só a classe do erro. O Postgres devolve
`duplicate key value violates unique constraint "<nome>"`, e o PostgREST propaga em `message`:

```ts
expect(error!.code).toBe("23505")
expect(error!.message).toContain("whatsapp_config_phone_ativo")   // ← o discriminante
```

E, na segunda metade, o espelho para `org_integrations_meta_page_ativo` (migration `246:85-87`,
que é `WHERE provider='meta_ads' AND config->>'page_id' IS NOT NULL` — sem condição de `status`,
então o cenário da AC funciona; falta só nomear o índice).

**Bônus obrigatório de simetria:** acrescentar a asserção de que `whatsapp_config_org_ativo`
**também** existe, com um caso que só ele reprova (segunda linha `active` na org B com um
`phone_number_id` **diferente**, `"PB2"`) — hoje ela nasce provada por acidente e não por
desenho.

---

### D4 — AC14: o teardown **não pode dar certo**, e o canário é estruturalmente incapaz de perceber.

`system_events.org_id` referencia `organizations(id)` **sem `ON DELETE CASCADE`**
(`supabase/migrations/009_system_events.sql:6` — `org_id uuid REFERENCES organizations(id),`),
portanto `NO ACTION`/RESTRICT. E a suíte **garantidamente** grava lá com o id das duas orgs:

- `for-each-org.ts:155-174` — `await logEventOnce({ org_id: org.id, … })`, **aguardado**, uma vez
  por org por execução: dispara em AC11, AC12 e AC13;
- `webhook-org.ts:224-229` — `logEvent({ … org_id: params.orgId })` em `logOrgResolved`: dispara
  em AC7, AC8 e AC9.

Então, quando a AC14 rodar `DELETE FROM organizations WHERE id IN (A, B)`, o Postgres devolve
**`23503` foreign_key_violation** e o delete **não acontece**.

**E o canário passa mesmo assim.** `expect(depois).toEqual(antes)` mede uma **terceira** org
(`org-teste-epic-900`), que ninguém tocou. Ele prova *"não apaguei demais"* e é incapaz de provar
*"apaguei o que disse que apagaria"*. As duas orgs fixture ficam vivas e `active` no banco
compartilhado, para sempre, com a suíte verde.

**Segunda ordem, e é a que fecha o argumento:** a seção Testing §3 exige rodar `pnpm test:tenancy`
**duas vezes seguidas**. Na segunda, `provision_org` é idempotente e devolve **os mesmos ids** —
mas `whatsapp_config` daquelas orgs ficou `status: 'active', phone_number_id: 'PA'/'PB'` da
execução anterior, então **a AC5 falha na 2ª execução**
(`toMatchObject({ status: "inactive", phone_number_id: null, access_token: null })`). Ou seja: o
defeito do teardown não é silencioso para sempre — ele explode na AC errada, e quem for depurar
vai suspeitar do `provision_org`.

**Correção — a AC14 precisa de três coisas que hoje não tem:**
1. **A lista de tabelas do teardown, em ordem de dependência**, incluindo as que são RESTRICT.
   Medido: das FKs para `organizations`, **75 são `ON DELETE CASCADE`**, mas **4 não são** —
   `system_events` (009:6), `visit_feedback` (011:29 e 180:15), `agent_media_assets` (099:40); e
   `meta_*` (015:156) é `ON DELETE SET NULL`. `system_events` é a que esta suíte garantidamente
   povoa.
2. **Checar o `error` de cada delete.** O padrão `const { data } = await …` que descarta `error`
   é *a causa raiz que a `900-24` existe para fechar* — não pode reaparecer no teardown da story
   que prova a `900-24`.
3. **Uma asserção de que o teardown SUCEDEU** — não só o canário:
   `expect(await orgsPorId([orgAId, orgBId])).toHaveLength(0)`. O canário responde "não apaguei
   demais"; esta responde "apaguei o suficiente". As duas perguntas são independentes e a story
   só faz uma.

---

### D5 — AC10 não é idempotente, e o artefato que ela afirma é **inapagável por id, por desenho**.

Li `logOrgUnresolved` (`webhook-org.ts:318-360`). Os dois artefatos que a AC10 consulta nascem
com `org_id = null` **deliberadamente** — é o ponto do log de não-resolvida:

```ts
logEventOnce({ event_type: "WEBHOOK_ORG_UNRESOLVED", metadata: { …, identificador, … } })  // sem org_id
admin.from("webhook_logs").insert({ org_id: null, payload: identificador, … })
```

(Boa notícia: as duas queries da AC10 estão **certas** na forma —
`metadata->identificador->>phone_number_id` e `payload->>phone_number_id` funcionam, porque
`payload` recebe o `identificador` filtrado, e `phone_number_id` está em
`CHAVES_IDENTIFICADOR_PERMITIDAS`. Conferi.)

Mas: (i) esses dois registros **não têm `org_id`**, logo o teardown-por-id da AC14 nunca os
remove; (ii) `logOrgUnresolved` **não passa `dedupe_key`** para `logEventOnce`, e sem
`dedupe_key` o helper é um `insert` comum (`logger.ts:100-124`) — cada execução insere uma linha
nova; (iii) o identificador da AC10 é um literal **constante** entre execuções
(`"PHONE-DESCONHECIDO-900-25"`).

**Na 2ª execução exigida pelo Testing §3:** 2 linhas casam o filtro, `.maybeSingle()` devolve
`{ data: null, error: { code: "PGRST116" } }`, e a AC10 — que escreve
`const { data: evento } = await …`, **descartando o `error`** — reporta `evento === null` e depois
estoura `TypeError` em `log!.org_id`. A AC reproduz, dentro de si, o defeito exato que a onda
existe para matar.

**Correção:**
- Identificador **único por execução**: `PHONE-DESCONHECIDO-900-25-${runId}` (`runId` = `crypto.randomUUID()`
  do `beforeAll`), não um literal fixo. Isso também mata a colisão com resíduo de outra suíte no
  banco compartilhado, que era a preocupação já correta da AC.
- Trocar `.maybeSingle()` por `.order("created_at", { ascending: false }).limit(1)` **ou** afirmar
  explicitamente `expect(linhas).toHaveLength(1)`.
- **Nunca desestruturar só `data` nesta suíte.** Vale como regra da story inteira, em Testing
  Standards: toda query da Camada B lê `{ data, error }` e afirma `error` nulo. É uma linha de
  Dev Notes e fecha uma classe inteira.
- O teardown captura e apaga **por id** as linhas de `system_events`/`webhook_logs` criadas com
  `org_id: null` durante a execução (guardadas no momento em que a AC10 as encontra).

---

## 🟡 Correções RECOMENDADAS (não bloqueiam, mas o `@qa` vai tropeçar)

### D6 — AC11: o stub captura um contrato que não existe.

Medido: `packages/shared/src/meta/capi-client.ts:76` →
`sendCapiEvents(events: CapiEvent[], options?: SendCapiEventsOptions)`; e o call site
(`meta-capi-dispatch/route.ts:289`) → `sendCapiEvents(events, { datasetId, ...testEventCode })`.
A AC pede capturar **`(datasetId, events)`** — ordem e forma erradas. Corrigir para capturar
`(events, options)` e afirmar `options.datasetId`.

**E um efeito que a AC não nomeia:** `vi.mock("@trifold/shared", …)` é **hoisted e vale para o
arquivo inteiro**. Num único `cross-tenant.test.ts` com AC4-AC14, o barrel fica mockado também
para a guarda da AC3 (`ehRefDeProducao` vem do mesmo `@trifold/shared`). Ou a AC11 mora em
arquivo próprio (`tests/tenancy/capi-dispatch.test.ts`), ou a AC diz explicitamente
`importOriginal` + spread e o `@qa` prova que a guarda continua sendo a real. Esta é a mesma
tática que o Context da story cita como lição dos dois últimos achados — e ela se aplica à
própria story.

### D7 — Os **efeitos colaterais** na base compartilhada não estão escopados; só as asserções estão.

A regra do Context ("nunca afirmar contagem total", "nunca apagar orgs pré-existentes") protege a
**leitura**. A **escrita** fica desprotegida, e duas ACs rodam rotas que varrem o banco inteiro:

- **AC13** roda o `daily-report` completo, que é `forEachActiveOrg` sobre **todas** as orgs ativas
  do `trifold-crm-dev`. O argumento de segurança da story ("as fixtures nascem `inactive`") não
  cobre uma **terceira** org: `sendDailyReport` (`send-daily-report.ts:20-28`) checa
  `phone_number_id`/`access_token` — **não checa `status`**. Uma org que outro dev tenha semeado
  com token real recebe `fetch` na Graph API de verdade.
- **AC11** roda o `meta-capi-dispatch`, cuja varredura de `meta_capi_outbox` é **global**
  (`summary.scanned = outbox.length`). Linhas `pending` de terceiros viram `skipped` — e o
  comentário da própria rota (linhas 182-199) diz que **nada neste repositório devolve `skipped`
  para `pending`**. É mutação **terminal** em dado de outra pessoa.

**Correção:** duas pré-condições na Task 0, que abortam nomeando as linhas ofensoras —
(a) nenhuma org ativa além de A e B tem `whatsapp_config.access_token` não-nulo;
(b) zero linhas `meta_capi_outbox` com `status='pending'` fora de A e B.
E o canário da AC14 estende-se a `meta_capi_outbox`.

### D8 — AC2: metade da régua **nasce verde**, hoje, sem migração nenhuma.

Rodei o grep exatamente como a AC o escreve:

```
$ grep -n "linhas\[0\] ?? null" .../admin-invite.test.ts .../resend-admin-invite/route.test.ts
.../admin-invite.test.ts:111:      return { data: linhas[0] ?? null, error: null }
.../admin-invite.test.ts:115:      return { data: linhas[0] ?? null, error: null }
```

**Zero ocorrências no segundo arquivo** — porque a cegueira dele está escrita
`selecionadas()[0] ?? null` (`resend-admin-invite/route.test.ts:80`). A verificação da AC2 já
passa para metade do escopo antes de qualquer trabalho. Corrigir o padrão (`\[0\] ?? null`, ou um
grep por arquivo). Dois detalhes menores no mesmo pacote: as linhas citadas (108/113) estão
defasadas em ~3 nesta branch (o real é **111** e **115**) — cite o **terminal** (`single` /
`maybeSingle`), não o número; e o arquivo 2 tem **só** `maybeSingle`, sem `single`, o que muda o
que "migração mecânica" significa lá.

### D9 — AC12 ficou de fora da lista de redirecionamento de env, e precisa dele.

Dev Notes lista AC7/AC8/AC9/AC10/AC11/AC13 como as que precisam de
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` redirecionados. Mas `forEachActiveOrg` chama
`createAdminClient()` **internamente** (`for-each-org.ts:132`), que lê as mesmas vars
(`lib/supabase/admin.ts:6-12`). Sob `pnpm test:tenancy` essas vars são `undefined` (medido em D2),
ou seja `createClient("", "")`. Incluir AC12 na lista.

---

## Reparos menores (fazer no mesmo passe, não geram rodada nova)

| # | Item | Medido |
|---|---|---|
| m1 | `[Source]` da AC7 cita `webhook/whatsapp/route.ts:433-483` | `export async function POST` está em **:201** |
| m2 | AC13 cita `daily-report/route.ts:65` | `orgDaEnvDeRecipients` está em **:66** |
| m3 | AC4: `const { data: contagem } = …; expect(contagem).toHaveLength(1)` | a variável é a lista de linhas, não a contagem — renomear (funciona, mas o nome mente) |
| m4 | O plano (Passo 3) diz **7** linhas de `org_integrations`; a story diz **6** | a **story está certa**: migration `246:222-229` insere **6** (`resend` fora, por decisão do dono do produto). Vale uma nota, para ninguém "corrigir" a story para 7 |
| m5 | Metadata diz "Não é o conteúdo que o epic reserva sob o mesmo número (colisão medida e resolvida ali)" | substituir por link para a nota do epic §857 (agora escrita) |

---

## Checklist de validação (10 pontos)

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Título claro e objetivo | ✅ | |
| 2 | Descrição completa | ✅ | Context é exemplar, com as 4 lições nomeadas |
| 3 | ACs testáveis | ⚠️ 0.5 | D3 e D4 tornam duas ACs não-discriminantes; D5 torna uma não-idempotente; D1 torna uma não-executável |
| 4 | Escopo IN/OUT | ✅ | OUT com razão por item, incluindo o handoff do job de CI |
| 5 | Dependências mapeadas | ⚠️ 0.5 | Corretas nos fatos, mas em prosa, e bloqueiam demais (Tasks 1-2) |
| 6 | Estimativa de complexidade | ✅ | G, coerente |
| 7 | Valor de negócio | ✅ | é o critério de saída da Onda 2 |
| 8 | Riscos documentados | ⚠️ 0.5 | leitura no banco compartilhado coberta; **escrita/envio** não (D7) |
| 9 | Critérios de Done | ⚠️ 0.5 | falta o único que importa aqui: "a suíte rodou de fato" (D2) |
| 10 | Alinhamento com epic/plano | ✅ | colisão medida; as 11 asserções batem com o Passo 6 |
| | **Total** | **7.5/10** | |

**Por que 7.5 não vira GO:** a régua de ≥7 pressupõe que os defeitos remanescentes são de
acabamento. Aqui os cinco obrigatórios estão **no mecanismo de prova**, e três deles (D2, D3, D4)
produzem **verde sem evidência** — que é o modo de falha que a Onda 2 inteira existe para
eliminar. Aprovar seria fechar a onda com a mesma classe de defeito que ela veio caçar.

---

## Caminho para o GO

1. Aplicar **D1-D5** (obrigatórias) e **D6-D9** + m1-m5 (mesmo passe).
2. Metadata ganha o campo de bloqueio explícito (C0), com Tasks 1-2 desbloqueadas.
3. Seção "Numeração" encolhe e aponta para o epic (já atualizado).
4. Devolver para `@po` — rodada 2. Não é reescrita: são ~5 ACs tocadas e 1 AC nova (AC3b).

---

## Change Log deste parecer

| Data | Rodada | Veredicto | Autor |
|---|---|---|---|
| 2026-08-29 | 1 | 🔴 NO-GO — 5 obrigatórias (D1-D5), 4 recomendadas (D6-D9), 5 menores | @po (Pax) |

---
---

# Rodada 2 — revalidação da v0.2 (2026-08-30)

## Veredicto: 🟢 **GO condicional**

As **5 obrigatórias (D1-D5) e as 4 recomendadas (D6-D9) estão fechadas** — verifiquei as sete que
tinham como ser verificadas **executando**, não lendo. Nenhuma AC nasce mais verde sob a mutação
que ela existe para pegar, que era o motivo do NO-GO da rodada 1.

**Condição:** quatro achados novos (N1-N4) entram em `v0.3` **antes de a Task 3 começar**. Custo
de cronograma: **zero** — os quatro vivem em Tasks 3-12, que já estão bloqueadas nos 4 PRs.
**Tasks 1 e 2 vão para o `@dev` hoje**, sem esperar a v0.3: nenhum dos quatro achados toca AC1 ou
AC2.

---

## O que eu medi (não li) — as nove correções

### D1 ✅ — o alias resolve, e a função importada é a real

Rodei a config **exata** da v0.2 (alias `@trifold/shared` → `packages/shared/src`) com o import
exato da guarda:

```
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

`ehRefDeProducao("dsopqkqjkmhytudaaolv") === true` passou pelo subpath
`@trifold/shared/constants/supabase-refs`. O alias de string do Vite reescreve prefixo, então o
subpath resolve mesmo sem `exports` em `packages/shared/package.json`. **A verificação executável
da AC3 (Task 3.5) é o teste certo e ele funciona.**

### D2 ✅ (mecanismo) — `.env.teste` entra, e os workers herdam

Mesma execução, com o loader `node:util.parseEnv` no topo do config:

```
>>>D1D2 credenciaisPresentes=true url="https://xnxvygyfyyyzwhiuoehz.supabase.co"
```

O `process.env` mutado no config (processo principal) **chega aos workers**. O buraco do
"exit 0 com zero asserções" está fechado **para a configuração atual**. Ver N2 — ele não está
fechado para o futuro.

### D3 ✅ — a colinearidade morreu, e o discriminante é real

Medi contra Postgres de verdade (`trifold-crm-dev`, transação com `TEMP TABLE` + `ROLLBACK`, zero
resíduo), replicando as duas UNIQUE parciais da migration `246`:

```
ERROR:  23505: duplicate key value violates unique constraint "probe_phone_ativo"
DETAIL:  Key (phone_number_id)=(PA) already exists.
```

O nome da constraint **está** na mensagem. Sob a mutação (remover `whatsapp_config_phone_ativo`),
a mensagem passa a nomear `whatsapp_config_org_ativo` e o
`expect(error!.message).toContain("whatsapp_config_phone_ativo")` **fica vermelho**. É discriminante.
O caso (2) — segunda linha ativa na org B com `"PB2"` — isola `whatsapp_config_org_ativo` de
verdade: nenhum telefone colide, só ele pode reprovar. O bônus de simetria está correto.

**Bônus da medição:** confirmei que a migration `246` já está aplicada em `trifold-crm-dev` —
`pg_index` de `whatsapp_config` lista `whatsapp_config_phone_ativo` (oid 79472) e
`whatsapp_config_org_ativo` (oid 79473). Ver N-menor 7 sobre a ordem dos oids.

### D4 ✅ (comportamento) — o teardown passa a poder dar certo · ⚠️ ver N1 (a lista)

`system_events` está na lista, que era a tabela que **garantidamente** bloqueava o delete. Com ela
limpa antes, `DELETE FROM organizations` deixa de bater no `23503`, e a asserção nova
(`expect(orgsRemanescentes).toHaveLength(0)`) faz a pergunta que o canário não fazia. O efeito de
2ª ordem (2ª execução achando A/B ainda `active` ⇒ AC5 explodindo na AC errada) **some**. A
"defesa contra a lista ficar velha" (falhar nomeando o erro do Postgres) é a decisão certa e é o
que segura o N1.

### D5 ✅ — a story parou de reproduzir o próprio bug

`runId` único por execução, `.order(...).limit(1)` no lugar de `.maybeSingle()`,
`{ data, error }` sempre juntos, e a regra promovida a Testing Standards para a suíte inteira. As
duas linhas com `org_id: null` deixam de colidir entre execuções. Ver N-menor 5 (o handoff dos ids
para a AC14 ficou pela metade).

### D6 ✅ — medi o que a v0.1 só supunha: o `vi.spyOn` **intercepta o call site real**

Esta era a mais arriscada, porque `@trifold/shared` é um barrel com **dois níveis** de `export *`
(`index.ts` → `./meta` → `./capi-client`) e não havia garantia de que a propriedade fosse
redefinível, nem de que o consumidor visse o spy. Construí um consumidor que imita o call site de
`meta-capi-dispatch/route.ts:289` e medi:

```
>>>D6 spyOn_erro=null
>>>D6 chamadas_capturadas=1 retorno={"success":true}
```

Funciona: `vi.spyOn(barrel, "sendCapiEvents")` é aceito **e** o call site real cai no stub, com o
argumento capturado. Contrato `(events, options)` confirmado contra
`packages/shared/src/meta/capi-client.ts:76`.

### D7 ✅ — o stub do `sendDailyReport` também intercepta, e era necessário mesmo

```
>>>D7 spyOn_erro=null
>>>D7 chamadas_capturadas=1 retorno={"sent":1,"errors":[]}
```

E medi o banco compartilhado para dimensionar o risco que ele fecha: `trifold-crm-dev` tem **1 org
ativa** hoje (`org-teste-epic-900`, `whatsapp_config` `inactive`, sem `phone_number_id`, sem
`access_token`) e **`meta_capi_outbox` vazia**. Ou seja: hoje as pré-condições da AC11 passam e
nenhum envio real aconteceria de qualquer jeito — mas o stub é o que torna isso **verdade por
desenho** em vez de por sorte do estado do banco, que é exatamente o ponto do D7. A pré-condição
de aborto da AC11 (`pending` de terceiros) está bem escrita e é executável.

### D8 ✅ — o grep agora casa os dois padrões

`grep -nE "\[0\] \?\? null"` cobre `linhas[0] ?? null` **e** `selecionadas()[0] ?? null`. A
instrução de citar o terminal em vez do número de linha está lá.

### D9 ✅ — AC12 entrou na lista de redirect (AC + Dev Notes + Task 9.1)

---

## 🔴 N1 — O 13º instrumento cego: a lista de FKs RESTRICT é escrita à mão, a partir da fonte errada — e **já está errada**

Foi a resposta à pergunta "o que esta prova não consegue observar de si mesma".

A AC14 depende de uma lista **hardcoded** de tabelas com FK bloqueante para `organizations`. Essa
lista veio de `grep` nos arquivos de migration — inclusive de três números que **eu** entreguei na
rodada 1. Consultei agora o catálogo vivo de `trifold-crm-dev` (`pg_constraint`, que é o que o
Postgres vai realmente aplicar no `DELETE`):

| Fato | A story diz | O catálogo diz (medido) |
|---|---|---|
| FKs `NO ACTION`/RESTRICT | 3 (`system_events`, `visit_feedback`, `agent_media_assets`) | **4** — as 3 **+ `financial_notification_log`** |
| FKs `ON DELETE CASCADE` | 75 | **87** |
| FK `ON DELETE SET NULL` | `meta_ad_accounts`/`meta_*` (`015:156`) | **`webhook_logs.org_id`** — e é a única |

Três afirmações "medidas" da AC14, três erradas. A causa é única e é a lição: **o `grep` mede o
arquivo de migration; o `DELETE` obedece ao catálogo.** Migration renomeada, FK adicionada por
`ALTER TABLE`, coluna redeclarada em migration posterior — nada disso aparece no grep, e tudo
aparece no `pg_constraint`.

**Impacto prático hoje: baixo.** `financial_notification_log` não recebe linha nenhuma desta suíte
(quem escreve lá é Epic 20/78), e a "defesa contra a lista ficar velha" converte a incompletude em
**vermelho nomeado**, não em falha silenciosa — o `@sm` acertou em pôr essa defesa. **Impacto
estrutural: é o padrão que a story existe para matar**, replicado dentro do teardown dela.

**Correção obrigatória (v0.3):** derivar a lista em runtime, não escrevê-la. Uma query, e ela
nunca envelhece:

```sql
SELECT DISTINCT c.conrelid::regclass::text AS tabela
FROM pg_constraint c
WHERE c.contype = 'f'
  AND c.confrelid = 'organizations'::regclass
  AND c.confdeltype NOT IN ('c', 'n');   -- 'c'=CASCADE (não bloqueia), 'n'=SET NULL (não bloqueia)
```

O teardown itera o resultado dessa query, deletando `.in("org_id", [orgAId, orgBId])` em cada
tabela, antes de `organizations`. A lista escrita à mão vira **comentário** ("em 2026-08-30 isto
devolvia 4 tabelas: …"), nunca o mecanismo. E a tabela de fatos da AC14 é corrigida com os números
acima.

**Consequência secundária, que a lista errada escondia:** `webhook_logs.org_id` é **SET NULL**.
Logo, ao deletar A e B, as linhas de `webhook_logs` que a AC9 acabou de afirmar (`org_id` = a org
resolvida) **não são apagadas — são anuladas**, e ficam no banco compartilhado com `org_id: null`
a cada execução. É resíduo, não corrupção, mas a AC14 deve dizer isso por escrito e incluir
`webhook_logs` no que o teardown limpa por id (ela já capta ids na AC10; é o mesmo array).

---

## 🔴 N2 — A correção do 12º cego é de **uma vez só**: o buraco reabre sozinho

O D2 foi a correção mais importante da rodada, e ela funciona **hoje**. Mas as três exigências da
AC3b são: um loader no config (mecânico e permanente ✅) e **duas obrigações de documento** — colar
a contagem, rodar o controle positivo uma vez. As duas prendem o **fechamento desta story** e não
prendem mais ninguém depois.

Medi o que acontece quando a configuração escorrega — arquivo de env ausente (ou uma var
renomeada, ou `.env.teste` no `.gitignore` de uma máquina nova):

```
 Test Files  1 skipped (1)
      Tests  2 skipped (2)
EXIT=0
```

…escondendo `expect(1).toBe(2)` e `expect("a").toBe("b")`. **É byte a byte o defeito da v0.1, de
volta.** A User Story desta fatia promete "um carrasco automático contra reintroduzir o bug" — e a
suíte não tem carrasco contra **se re-cegar**.

**Correção obrigatória (v0.3): distinguir os dois motivos do skip.** O `skip` existe para quem
**não tem** o ambiente; ele não deve cobrir quem **tem** e quebrou a config:

```ts
const arquivoEnvExiste = existsSync(path.resolve(__dirname, "../../.env.teste"))
const credenciaisPresentes = !!process.env.TENANCY_TEST_SUPABASE_URL &&
                             !!process.env.TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY

// Tem o arquivo mas não tem as vars ⇒ config quebrada, não "ambiente ausente". Falha, alto.
if (arquivoEnvExiste && !credenciaisPresentes) {
  throw new Error(
    "tests/tenancy: .env.teste existe mas TENANCY_TEST_SUPABASE_URL/SERVICE_ROLE_KEY não chegaram " +
      "ao process.env — o loader do vitest.tenancy.config.ts quebrou ou a var foi renomeada. " +
      "Isto NÃO é 'ambiente ausente': seria skip verde escondendo a suíte inteira (v0.1, D2).",
  )
}
describe.skipIf(!credenciaisPresentes)(…)   // sem o arquivo ⇒ contribuidor externo ⇒ skip, como hoje
```

Custo: 6 linhas. Ganho: o vermelho vira automático em vez de depender de alguém reler o Dev Agent
Record de uma story de agosto. **A exigência 3 da AC3b (controle positivo colado) continua — ela é
a prova de que o instrumento nasceu vivo; esta é a prova de que ele continua vivo.**

---

## 🟠 N3 — A lição 1 do Context é **falsa**, e o caminho de fallback aponta para o canário

O Context (lição 1) e a AC13 afirmam: *"`trifold-crm-dev` NÃO tem a org da Trifold
(`trifoldOrgId()` não resolve nada lá)"*. Medido:

- `packages/web/src/lib/tenancy/trifold-org.ts:60-62` → `trifoldOrgId()` devolve o literal
  `"00000000-0000-0000-0000-000000000001"`.
- `SELECT id, slug FROM organizations` em `trifold-crm-dev` → **uma** org:
  `{"id":"00000000-0000-0000-0000-000000000001","slug":"org-teste-epic-900","is_active":true}`.

Ou seja: `trifoldOrgId()` resolve, sim — **para a própria org canário**. A conclusão de desenho da
AC13 (usar o override `DAILY_REPORT_ORG_ID`) continua **certa**, mas a razão escrita está errada, e
a razão certa é mais forte: sem o override, `orgDaEnvDeRecipients` cai em `trifoldOrgId()` e os
telefones de `DAILY_REPORT_RECIPIENTS` passam a valer **para a org que a suíte promete não
perturbar**. Corrigir a lição 1 e a justificativa da AC13 com o fato medido — o próximo leitor vai
tomar decisão em cima dessa frase.

(Relacionado: `forEachActiveOrg` roda o callback do `daily-report` também para o canário, que hoje
é a 3ª org ativa. Com o stub do D7 isso é inofensivo — mais uma evidência de que o stub era
necessário, e não excesso de zelo.)

---

## 🟠 N4 — O controle positivo da AC13 **não passa como escrito**: o telefone-fixture é filtrado

A AC13 manda usar `TELEFONE_FIXTURE_900_25`, *"valor inventado sem significado — nunca um número
real"*, e afirma `expect(chamadaOrgA?.recipients).toEqual([TELEFONE_FIXTURE_900_25])`.

Mas a cadeia real é `resolveDailyReportRecipients` → `mergeRecipients`
(`packages/web/src/lib/reports/recipients.ts:52-75`), e ela faz:

```ts
const tel = normalizePhoneBR(bruto)
if (!tel || vistos.has(tel)) return      // ← valor que não normaliza é DESCARTADO em silêncio
```

Dois resultados possíveis, os dois ruins: (a) o valor inventado **não normaliza** ⇒ `destinatarios`
fica vazio ⇒ a rota devolve `{ skipped }` ⇒ `sendDailyReport` nunca é chamado para A ⇒
`chamadaOrgA` é `undefined` ⇒ a asserção falha; (b) normaliza mas em **outra forma** ⇒ o `toEqual`
compara bruto contra normalizado ⇒ falha.

Falha alto, não em silêncio — por isso é 🟠 e não 🔴. **O risco real é o conserto errado:** um
`@qa` apressado relaxa para `expect(chamadaOrgA).toBeDefined()` e a AC13 perde a metade positiva
(que a env **foi** aplicada a A), ficando só com a metade negativa (que B não recebeu) — que
sozinha é satisfazível por qualquer motivo, inclusive pelo telefone ter sido descartado.

**Correção:** o fixture tem de ser um número que sobreviva ao `normalizePhoneBR` (formato BR
válido, faixa sem uso — não precisa ser inventado *sem forma*, precisa ser inventado *sem dono*), e
a asserção compara contra `normalizePhoneBR(TELEFONE_FIXTURE_900_25)`, nomeando na AC que a
normalização acontece no meio do caminho.

---

## 🟡 Menores (mesmo passe da v0.3)

| # | Achado | Medição |
|---|---|---|
| 5 | A AC10 diz que os ids das linhas com `org_id: null` "alimentam a AC14", mas **a AC14 não os consome** — nem o código dela nem a Task 11.1 (que só fala em `org_id IN (A,B)`). Handoff que nenhum dos dois lados executa. Com o `runId` do D5 vira só resíduo, não quebra — mas escrever e não fazer é pior que não escrever | leitura de AC10 vs. AC14/Task 11 |
| 6 | O loader usa `node:util.parseEnv`, que só existe a partir do **Node 20.12/21.7**. Este ambiente é `v25.6.1` ✅, mas `.claude/CLAUDE.md` documenta "Node 18+" como requisito. Ou o config degrada com `typeof parseEnv === "function"`, ou o requisito de Node sobe por escrito | `node -e "require('node:util').parseEnv"` → `function`; `node --version` → `v25.6.1` |
| 7 | AC6 caso (1) é discriminante, **mas por ordem de OID**: medi que, criando `org_ativo` primeiro, o Postgres passa a nomear `zz_org_ativo` no mesmo insert. Hoje o dev tem `phone_ativo` oid **79472** < `org_ativo` **79473** (a ordem da migration `246`), então passa. Um caso totalmente isolado — terceira org fixture "C" com `phone_number_id: "PA"`, onde só `phone_ativo` pode disparar — removeria a dependência de ordem, simétrico ao que o caso (2) já faz | dois `TEMP TABLE` com ordem de criação invertida |
| 8 | Complexity segue "G" com a story tendo crescido (AC3b nova, arquivo separado da AC11, teardown maior). Não muda o veredicto, mas vale reconferir a estimativa antes do sprint | — |

---

## Checklist de validação (10 pontos) — rodada 2

| # | Critério | v0.1 | v0.2 | Observação |
|---|---|---|---|---|
| 1 | Título claro | ✅ | ✅ | |
| 2 | Descrição completa | ✅ | ✅ | |
| 3 | ACs testáveis | ⚠️ 0.5 | ✅ | D1/D3/D4/D5 fechados **medindo**; N4 é implementabilidade, falha alto |
| 4 | Escopo IN/OUT | ✅ | ✅ | |
| 5 | Dependências mapeadas | ⚠️ 0.5 | ✅ | campos `Blocked by`/`Desbloqueado desde já` em Metadata |
| 6 | Complexidade | ✅ | ⚠️ 0.5 | ver menor 8 |
| 7 | Valor de negócio | ✅ | ✅ | |
| 8 | Riscos documentados | ⚠️ 0.5 | ✅ | D7 fecha o efeito colateral; medi o banco e confirmei |
| 9 | Critérios de Done | ⚠️ 0.5 | ⚠️ 0.5 | AC3b prende esta story, não as próximas (N2) |
| 10 | Alinhamento epic/plano | ✅ | ✅ | Decisões 1 e 2 incorporadas |
| | **Total** | **7.5** | **9.0** | |

**Por que 9.0 vira GO e 7.5 não virava:** o corte nunca foi a nota, foi a pergunta *"alguma AC
nasce verde sob a mutação que ela existe para pegar?"*. Na v0.1 três nasciam. Na v0.2, **nenhuma** —
verifiquei sete delas executando. N1 e N2 não produzem verde-sem-evidência: N1 produz **vermelho
nomeado** (a defesa que o `@sm` escreveu segura), e N2 é uma janela futura, não o estado atual.

---

## Condições do GO

**Antes da Task 3** (custo de cronograma zero — Tasks 3-12 já esperam os 4 PRs):
1. **N1** — lista de FKs derivada de `pg_constraint` em runtime; tabela de fatos da AC14 corrigida
   (4 RESTRICT, 87 CASCADE, `webhook_logs` é o SET NULL); `webhook_logs` no teardown por id.
2. **N2** — `.env.teste` presente + vars ausentes ⇒ **falha**, não skip. 6 linhas.
3. **N3** — Context lição 1 e justificativa da AC13 corrigidas: `trifoldOrgId()` **é** o id do
   canário em `trifold-crm-dev`.
4. **N4** — `TELEFONE_FIXTURE_900_25` com forma que sobrevive ao `normalizePhoneBR`; asserção
   comparando o valor normalizado.
5. Menores 5-8 no mesmo passe.

**Hoje, sem esperar a v0.3:**
- **Task 1 (AC1)** e **Task 2 (AC2)** vão para o `@dev`. Nenhum dos quatro achados as toca.

**No dia da implementação das Tasks 3-12:** reconfirmar os 4 PRs (`gh pr view 525 526 527 528`).
Reconfirmei em 2026-08-30: as quatro seguem **abertas**, `MERGEABLE`/`CLEAN`.

**Já confirmado por mim, o `@qa` não precisa repetir na Task 0:** migration `246` **está aplicada**
em `trifold-crm-dev` (os dois índices existem em `pg_index`); a org canário `org-teste-epic-900`
**existe** e está ativa; `meta_capi_outbox` está **vazia**; nenhuma `whatsapp_config` com token.
(A Task 0.2 com `pnpm db:status` continua valendo — ela confirma a `247`, que eu não medi.)

---

## Change Log deste parecer

| Data | Rodada | Veredicto | Autor |
|---|---|---|---|
| 2026-08-29 | 1 | 🔴 NO-GO — 5 obrigatórias (D1-D5), 4 recomendadas (D6-D9), 5 menores | @po (Pax) |
| 2026-08-30 | 2 | 🟢 **GO condicional** — D1-D9 fechados (7 verificados executando); 4 achados novos (N1-N4) + 4 menores para a v0.3, antes da Task 3; Tasks 1-2 liberadas hoje | @po (Pax) |
