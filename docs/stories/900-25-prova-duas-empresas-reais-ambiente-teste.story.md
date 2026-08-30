# Story 900-25 — A Prova: Duas Empresas Reais no Ambiente de Teste (Onda 2, Fatia 4)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 2 — "Para de errar" (plano de 3 ondas aprovado pelo dono do produto). Esta story cobre
  **o Passo 6** do plano (`docs/…/vamos-por-partes-entao-crystalline-dongarra.md`, seção Onda 2):
  "A prova: teste de duas orgs" — Camada A (unitária, o que faltar) + Camada B (integração contra
  `trifold-crm-dev`, com duas empresas reais). É a última fatia da Onda 2: depois dela, o critério
  de saída da onda ("no `trifold-crm-dev`, com duas orgs reais, WhatsApp/Meta/crons entregam para a
  org certa, provado por teste automatizado") passa a ter prova, não promessa.
- **Story:** 900-25 — colisão de numeração com o epic §857 **resolvida pelo `@po`**, registrada no
  próprio epic (`epic-900-saas-multi-tenant.md`, notas em §857 e §952). Ver "Numeração" abaixo.
- **Status:** Ready for Review (Tasks 1-12 implementadas; Tasks 1-2 mergeadas no PR `#529`,
  Tasks 0 e 3-12 nesta branch) — desbloqueada em 2026-08-30: as 5 PRs (`#525`, `#526`, `#527`,
  `#528`, `#529`) estão **MERGED** em `main`, reconferidas com `gh pr view` no dia.
- **Condições do GO (v0.3, antes da Task 3 — custo de cronograma zero, Tasks 3-12 já esperam os
  4 PRs):** **N1** lista de FKs RESTRICT derivada de `pg_constraint` em runtime, não hardcoded (a
  lista da AC14 já está errada contra o catálogo vivo: são **4** RESTRICT, não 3 — falta
  `financial_notification_log` —, **87** CASCADE e não 75, e o SET NULL é `webhook_logs`, não
  `meta_ad_accounts`); **N2** `.env.teste` presente + vars ausentes ⇒ **falha**, não skip (a
  correção do D2 é de uma vez só — medido: exit 0 com 2 asserções falsas puladas assim que o
  arquivo some); **N3** a lição 1 do Context é falsa — `trifoldOrgId()` devolve
  `00000000-0000-0000-0000-000000000001`, que É o id de `org-teste-epic-900` em `trifold-crm-dev`
  (medido), e o fallback aponta para o canário; **N4** `TELEFONE_FIXTURE_900_25` passa por
  `normalizePhoneBR` (`recipients.ts:52-75`) e é descartado se não normalizar — o controle
  positivo da AC13 não passa como escrito. Menores 5-8 no mesmo passe.
- **Blocked by (Tasks 3-12 apenas):** ~~PR `#525`, `#526`, `#527`, `#528`~~ — **DESBLOQUEADO
  em 2026-08-30**: as quatro (mais a `#529`, das Tasks 1-2) estão `MERGED` em `main`. Medido no
  dia com `gh pr view 525 526 527 528 529 --json state`.
- **Desbloqueado desde já:** Task 1 (AC1) e Task 2 (AC2) — Camada A, tocam arquivos que já existem
  em `main` hoje (`webhook-org.test.ts`, `meta-ads-intelligence/route.test.ts`, os dois fakes do
  `TEST-004`), sem dependência de nenhum dos quatro PRs.
- **Priority:** P0 — é o critério de saída da Onda 2. Sem esta story, as três fatias anteriores
  (`900-21b`, `900-23`, `900-24`) são autodeclaradas corretas por unit test com fake, nunca
  observadas com dado real de duas organizações simultâneas.
- **Complexity:** G — reconferida na rodada 2 (Menor 8 do parecer): a story cresceu (AC3b nova, a
  AC11 virou arquivo próprio com fixtures/canário replicados, o teardown da AC14 ganhou derivação
  de `pg_constraint` em runtime + consumo do handoff da AC10 + um terceiro caso isolado na AC6),
  mas **G continua correto** — o crescimento é robustez do mesmo mecanismo, não escopo novo. 1
  config de vitest isolada + 1 guard de destino + ~14 asserções de integração contra banco real
  (algumas com setup/teardown não triviais: outbox do CAPI, stub de transporte, canário de
  teardown com derivação dinâmica de FKs) + migração de 2 fakes cegos (`TEST-004`) + auditoria
  (não reescrita) da Camada A das 3 fatias anteriores. Zero migration nova.
- **Depends on — as quatro, sem exceção (instrução explícita do dono do produto):**
  1. **`900-21b`** (PR #526) — `org_integrations` (6 providers), as duas UNIQUE parciais de
     `whatsapp_config` (migration `246`). As asserções 2 e 3 desta story testam exatamente este
     schema.
  2. **`900-23`** (PR #527) — `forEachActiveOrg`, `daily-report`/`nicole-agenda-reconcile`
     migrados, `meta-capi-dispatch`/`meta-ads-intelligence`/`followup` corrigidos. As asserções 8,
     9 e 10 exercitam este código.
  3. **`900-24`** (PR #528) — `webhook-org.ts` (3 resolvers + dual-run), os 4 receptores
     modificados, migration `247` (fecha `ARCH-001`). As asserções 4, 5, 6 e 7 exercitam este
     código.
  4. **`900-3c`** (PR #525) — `pnpm db:status`/`pnpm db:apply`, registro auditável de migrations
     aplicadas. Não é dependência de *código* (nenhum arquivo desta story importa nada do #525) —
     é dependência **operacional**: sem `db:status`, não existe comando confiável para confirmar
     que `trifold-crm-dev` está de fato na migration `247` antes de rodar a Camada B contra ele
     (`schema_migrations` nativo não serve — ver o epic, "achados que contradizem o que estava
     escrito"). A Task 0 desta story roda `pnpm db:status` como pré-condição.
  Medido em 2026-08-29: as **quatro** estão `Ready for Review`/em PR aberto, **nenhuma mergeada**
  (`#525`, `#526`, `#527`, `#528` — `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, checks
  `SUCCESS` nas quatro). **Bloqueio parcial, corrigido pelo `@po` (Decisão 2 do parecer) — a v0.1
  bloqueava demais.** Tasks 3-12 (Camada B, tudo que chama uma rota real ou lê `trifold-crm-dev`)
  não podem rodar contra branch — testariam a branch, não o sistema. **Tasks 1 e 2 (Camada A —
  auditoria de mutações + `TEST-004`) tocam arquivos que já existem em `main` hoje** e não têm
  dependência de nenhum dos quatro PRs — bloqueá-las atrasaria trabalho sem motivo. Ver os campos
  "Blocked by"/"Desbloqueado desde já" acima. **Reconfirmar o status dos quatro PRs no dia da
  implementação das Tasks 3-12** — mesma disciplina de `feedback_remedir_numeros_contra_o_banco`.
- **Created:** 2026-08-29
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @qa (Quinn) para Tasks 0, 3-12 — o epic já reserva esta atribuição (§857: *"executor
  `@qa`"*), e o conteúdo real desta story (depois da correção de escopo — ver Numeração) é
  integralmente autoria de teste: nenhum arquivo de `packages/web/src/app/**` de aplicação muda.
  Os únicos artefatos que não são `*.test.ts` são a config de vitest isolada e a migração dos 2
  fakes cegos (`TEST-004`) — mecânicos, dentro do escopo natural de quem escreve a suíte.
  **Exceção, roteada pelo `@po` na rodada 2 (`docs/qa/po-validation-900-25.md`):** Tasks 1 e 2 vão
  para **@dev** desde já — não dependem de nenhum dos 4 PRs nem dos achados N1-N4 da v0.3, e não
  há razão para esperar o `@qa` estar livre quando o `@dev` pode começar hoje.
- **Quality Gate:** @architect (Aria) — mesmo padrão das três fatias anteriores: valida um
  mecanismo compartilhado novo (`tests/tenancy/`, a guarda de destino, o padrão de stub de
  transporte) que vai ser reusado por toda story futura que precise de prova contra banco real.
- **Quality Gate Tools:** `[code_review, test_review, security_review]` — `security_review`
  porque a suíte lê/injeta dado real num banco (mesmo de teste) e decide o que pode e não pode
  aparecer em log (reusa a allowlist de `identificador` da `900-24`); `test_review` porque o
  produto final da story É a suíte, não código de aplicação.

---

## Numeração — colisão RESOLVIDA pelo `@po` (Decisão 1 do parecer)

`900-25` fica com o conteúdo do Passo 6 (Camada A + Camada B contra `trifold-crm-dev`), como este
draft já propunha. O epic reservava `900-25` para outro roteiro ("Org Trifold Sandbox" **em
produção**, `Dep: 900-22` — que não existe como story); o `@po` decidiu que esse roteiro **dobra
para `900-32`** (que já herdava a AC (b) do mesmo roteiro), sem número novo — partir um roteiro de
aceitação entre dois números é receita para as metades divergirem sem ninguém notar. Decisão
registrada em `docs/stories/epics/epic-900-saas-multi-tenant.md`, notas em §857 e §952. Medição
completa: `docs/qa/po-validation-900-25.md`, "Decisão 1".

**Migration:** zero nesta story. Teto remedido em 2026-08-29: `244_ 245_ 246_ 247_` — nenhum PR
aberto usa `248`. Nenhum arquivo `supabase/migrations/*.sql` nesta story.

---

## User Story

**Como** dono do produto,
**Eu quero** uma prova automatizada — não uma alegação — de que criar uma segunda empresa pelo
`provision_org()` resulta numa empresa que **funciona** (WhatsApp, Meta Ads, CAPI, crons) sem que a
Trifold mude de comportamento ou perca dado,
**Para que** a Onda 2 tenha um critério de saída verificável, e para que a próxima pessoa que
tocar `whatsapp_config`, `org_integrations` ou qualquer um dos 4 webhooks/6 crons desta onda tenha
um carrasco automático contra reintroduzir o bug agudo que ela existiu para fechar.

---

## Context

### Por que "unit test com fake" não basta — e por que isto não é dúvida sobre as 3 fatias anteriores

`900-21b`, `900-23` e `900-24` já têm Camada A (mutação, fake fiel ao `postgrest-js` real) cobrindo
cada mecanismo isoladamente. O que nenhuma delas prova, porque nenhuma tem como: que o **schema
real** aplicado em `trifold-crm-dev` de fato tem as UNIQUE parciais; que `provision_org()`
**executado contra Postgres de verdade** semeia as 6 linhas certas; que os 4 webhooks, quando
recebem um payload real com um `phone_number_id`/`page_id` real, resolvem para a org certa **e não
para a outra**; e que dois testes rodando o mesmo cenário em sentidos opostos (org B → B, org A →
A) não escondem um resolver que sempre acerta por coincidência. Fake nenhum reprova "o índice
não existe" — só o Postgres reprova.

### As quatro lições herdadas, com carrasco nomeado nesta story

1. **CORRIGIDA (N3 do parecer, rodada 2) — `trifoldOrgId()` RESOLVE em `trifold-crm-dev`, e é pior
   do que "não resolve": ele aponta para o canário.** A v0.2 afirmava "`trifold-crm-dev` NÃO tem a
   org da Trifold" — **medido como falso**: `trifoldOrgId()` (`lib/tenancy/trifold-org.ts:60-62`)
   devolve o literal `"00000000-0000-0000-0000-000000000001"`, e a **única** org ativa hoje em
   `trifold-crm-dev` é exatamente essa — `{"id":"00000000-...-000000000001","slug":"org-teste-
   epic-900","is_active":true}`. Ou seja: `trifoldOrgId()` resolve, sim, **para a própria org
   canário** que a AC14 promete nunca perturbar. A conclusão de desenho continua a mesma (override
   explícito de `DAILY_REPORT_ORG_ID` antes de rodar a AC13), mas a razão é mais forte do que a
   v0.2 escrevia: **sem o override, os telefones de `DAILY_REPORT_RECIPIENTS` valeriam para o
   canário**, não para "org inexistente" — um teste sem esse override não falharia por
   inexistência, contaminaria a org que a story usa para provar que nada foi tocado além do
   necessário. Ver AC13.
2. **`TEST-004` é desta story.** Duas cópias do fake defeituoso (`.maybeSingle()`/`.single()`
   devolvendo `linhas[0] ?? null`, nunca o `PGRST116`/406 real) seguem no repo:
   `packages/web/src/lib/tenancy/admin-invite.test.ts:108,113` e
   `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.test.ts:80`. Esta é a
   primeira story que exercita aqueles fakes com **mais de uma linha por tabela** — onde a cegueira
   deixa de ser latente. Ver AC2.
3. **Onze instrumentos cegos apareceram nesta onda** (`900-21b`: 5; `900-23`: 5 + 1 do `@po`;
   `900-24`: 1) — e o `@po` mediu um **12º na própria v0.1 desta story** (D2, ver Change Log):
   `vitest run` sem asserção nenhuma sai verde por desenho, e nada obrigava a evidência do
   contrário. Os dois instrumentos cegos da `900-24` ensinam a tática que esta story mais precisa:
   **mute o helper, o call site E o argumento** — um `vi.mock` plantado para forçar um cenário
   **apaga os argumentos da observação**. Na Camada B isso se traduz em: stubar `sendCapiEvents`
   (AC11) tem que **capturar** o argumento real (`events`, `options.datasetId` — contrato
   corrigido pelo `@po`, D6, não `(datasetId, events)` como a v0.1 escrevia), não só devolver
   sucesso — senão a asserção de isolamento ("nenhum evento de B saiu no dataset de A") é
   insatisfazível por desenho.
4. **`vitest -t` é regex e sai 0 quando não casa nada.** Qualquer comando de execução seletiva
   citado no Dev Agent Record desta story precisa vir acompanhado da contagem de testes rodados
   (não só "verde") — um filtro que não casa nada também sai verde.

### Por que a Camada B não pode ser "rodar as rotas reais contra todos os dados que existirem hoje"

O `trifold-crm-dev` é **compartilhado** com o dev local (decisão travada da Onda 1, risco aceito) e
pode ter outras orgs além das duas fixture desta story no momento em que a suíte roda (a própria
`org-teste-epic-900` já existe lá hoje). Duas consequências de desenho, aplicadas em toda AC que
usa `forEachActiveOrg` ou uma rota de cron real (AC12, AC13):
- **Nunca afirmar contagem total** (`resumo.total === 2`) — só afirmar sobre as entradas cujo
  `org.id` é uma das duas orgs fixture, por `find`, ignorando o resto da lista.
- **Nunca desativar/apagar orgs pré-existentes** para "limpar o cenário" — isso mutaria estado de
  outro trabalho em andamento na mesma base compartilhada. O isolamento da suíte é por **filtro na
  asserção**, não por controle do universo.

---

## Scope

### IN (esta story entrega)
1. **Auditoria da Camada A** das três fatias anteriores contra as 3 mutações que o Passo 6 do
   plano nomeia explicitamente, com fechamento de qualquer lacuna real encontrada (AC1).
2. **Resolução do `TEST-004`** — migração dos 2 fakes cegos para
   `packages/web/src/lib/tenancy/__fixtures__/fake-supabase-postgrest.ts` (já existe, criado pela
   `900-24`) (AC2).
3. **`tests/tenancy/cross-tenant.test.ts`**, com `vitest.tenancy.config.ts` isolado (novo arquivo,
   raiz, com alias `@trifold/shared` e carregamento de `.env.teste`), guarda de destino, guarda de
   skip-por-credencial-ausente, e a exigência executável de vivacidade (AC3, AC3b).
4. **`tests/tenancy/capi-dispatch.test.ts`**, arquivo separado (D6 do parecer do `@po` — isolamento
   de `vi.spyOn`, fixtures próprias) para a assertion 8 (AC11).
5. **As onze asserções da missão**, na ordem, cada uma AC própria (AC4-AC14).
6. **Não-regressão de produção** — declaração + verificação de que nada nesta story toca schema ou
   comportamento de produção (AC15).

### OUT (não entra nesta story)
- **O roteiro de produção do epic §857** ("Org Trifold Sandbox em produção") — ver Numeração.
  Sem número, sem dependência satisfazível ainda (`900-22`).
- **Job de CI** rodando a Camada B automaticamente em todo PR. A suíte é local/manual nesta story
  (mesmo padrão do `pnpm reset:testdb` antes do Passo 8 da Onda 1) — decisão que evita o custo
  nomeado em `feedback_job_de_ci_que_escreve_e_extra_caro.md`: um job de CI que roda contra banco
  compartilhado, sem lock, adiciona um segundo escritor concorrente ao mesmo risco que a Onda 1 já
  aceitou entre dev local e reset. Fica registrado como item deferido, com handoff nomeado: quando
  a Onda 3 decidir sobre lock/TTL (Passo 6, item 5, deferível da Onda 1), a mesma decisão libera
  este job.
- **Cutover em produção / remoção do fallback legado** — Onda 3, depende de 7 dias de observação
  do contador `WEBHOOK_ORG_RESOLVED` (fora do controle desta story).
- **`landing-page`/`telegram` na Camada B** — os dois usam `resolveSoleOrg()` (sem identificador
  de payload); a Camada A da `900-24` já teste a ambiguidade (2 orgs ⇒ `"ambigua"`) com fake fiel.
  A missão não lista assertion de integração para os dois, e testá-los contra banco real não
  acrescentaria cobertura que o fake não desse — ambos dependem só de `organizations.is_active`,
  já coberto pelas asserções 1/2.

---

## Acceptance Criteria

- [x] **AC1 — Auditoria da Camada A: as 3 mutações do Passo 6, medidas contra a suíte real, não
  redescritas de memória.**

  O plano nomeia 3 mutações explicitamente como o que a Camada A precisa reprovar: *"resolver que
  sempre devolve a org A → vermelho; `unresolved` devolvendo 500 em vez de 200 → vermelho;
  restaurar `accounts[0].org_id` → vermelho."* Medido nesta redação (não é trabalho de
  implementação — é o que o `@qa` confirma ao herdar a Task 1):

  | Mutação nomeada | Onde já existe (medido em 2026-08-29) |
  |---|---|
  | resolver sempre devolve a org A | `webhook-org.test.ts` (as 4 buscas de `"ambigua"` com `quantidadeEncontrada: 2` — reverter qualquer resolver para `.maybeSingle()` sem filtro de identificador faz esses testes falharem) |
  | `restaurar accounts[0].org_id` | `meta-ads-intelligence/route.test.ts:237`, teste nomeado **verbatim** `"🔴 processa as DUAS orgs — reverter para accounts[0].org_id deixa isto vermelho"` |
  | `unresolved` devolvendo 500 em vez de 200 | **NÃO confirmado nas fatias anteriores** para os 2 receptores que gravam `webhook_logs` antes de resolver (`webhooks/meta-ads`, `webhooks/landing-page`) — `webhook-org.test.ts` testa o retorno do **resolver** (`ResolucaoOrg`), não o **HTTP status** do handler; `landing-page`, em particular, tem a exceção nomeada da AC5 da `900-24` (200 só em `identifier`, 5xx em `legacy`/`both` — ver Context daquela story). |

  **Task obrigatória, não opcional:** para `webhook/whatsapp/route.test.ts` e
  `webhooks/meta-ads/route.test.ts` (Camada A, com fake — não Camada B), confirmar/adicionar o
  teste "com `WEBHOOK_ORG_ROUTING=identifier` e `phone_number_id`/`page_id` desconhecido, o handler
  responde HTTP `200`, nunca 4xx/5xx". Se já existir (medir antes de escrever), documentar o
  arquivo:linha no Dev Agent Record em vez de duplicar. Não expandir a lacuna para `landing-page`/
  `telegram` — a exceção da AC5 da `900-24` é deliberada, e "200 sempre" ali reprovaria um
  comportamento que a `900-24` decidiu manter.

  [Source: plano aprovado, Onda 2, Passo 6, "Lista de mutações executada"]

- [x] **AC2 — `TEST-004`: os 2 fakes cegos migrados para o fixture fiel.**

  `packages/web/src/lib/tenancy/admin-invite.test.ts` e
  `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.test.ts` passam a usar
  `criarFakeSupabase`/`resultadoSingular` de `__fixtures__/fake-supabase-postgrest.ts` (já
  existente) no lugar do builder local que devolve `linhas[0] ?? null` nos terminais singulares.

  **Migração é mecânica, mas com um carrasco de vivacidade obrigatório** (o próprio `TEST-004`
  avisa: "o risco é o de sempre com teste alheio — alguma asserção existente pode estar apoiada na
  mentira do molde"): depois da migração, `pnpm test` dos dois arquivos continua **100% verde**
  sem nenhuma asserção reescrita para "passar com o fake novo" — se alguma quebrar, a causa
  correta é a asserção estava certa mas o *setup* do teste montava uma fixture com 2+ linhas onde
  esperava 0/1 (ajustar o setup, não a asserção). Colar no Dev Agent Record: contagem de testes
  antes/depois nos 2 arquivos (idêntica), e se algum setup precisou de ajuste, qual e por quê.

  **Verificação — corrigida (D8 do parecer do `@po`): o padrão não é idêntico nos dois
  arquivos.** `admin-invite.test.ts` escreve `linhas[0] ?? null` (dois terminais, `.single()` E
  `.maybeSingle()`); `resend-admin-invite/route.test.ts` escreve `selecionadas()[0] ?? null`
  (**só** `.maybeSingle()` — não tem `.single()` nesse arquivo, o que muda o que "migração
  mecânica" significa lá: só um terminal a trocar, não dois). O grep de fechamento tem que casar
  os dois padrões, não um:
  ```bash
  grep -nE "\[0\] \?\? null" packages/web/src/lib/tenancy/admin-invite.test.ts \
    packages/web/src/app/api/platform/orgs/\[id\]/resend-admin-invite/route.test.ts
  ```
  → 0 ocorrências nos dois. **Não citar número de linha fixo no Dev Agent Record** (os números
  desta AC já estavam defasados em ~3 linhas na branch de rascunho — cite o terminal
  `.single()`/`.maybeSingle()`, que não desloca).

  [Source: `docs/backlog.md`, `[TEST-004]`; `docs/qa/po-validation-900-24.md`, rodada 2, item 6;
  `docs/qa/po-validation-900-25.md`, D8]

- [x] **AC3 — `tests/tenancy/cross-tenant.test.ts` + `vitest.tenancy.config.ts` isolado, com as
  duas guardas obrigatórias.**

  **Por que config separada, não um `include` a mais em `vitest.config.ts` (decisão pedida pela
  missão, com justificativa).** `vitest.config.ts` (raiz) roda em `pnpm test`, que é o gate rápido
  de todo PR — sem rede, sem credencial. Acrescentar `"tests/**/*.test.ts"` ao `include` faria
  **todo `pnpm test`** tentar resolver `TENANCY_TEST_SUPABASE_URL`, e um ambiente sem a credencial
  (todo contribuidor sem acesso ao projeto Supabase, todo runner de CI sem o secret) veria o job
  ficar vermelho por um motivo que não é dele. A guarda de skip (abaixo) mitiga isso, mas **não
  precisa mitigar** se o arquivo nunca entra no `include` padrão: `pnpm test` continua não sabendo
  que `tests/tenancy/` existe, do mesmo jeito que hoje não sabe. Config isolada + script dedicado
  (`pnpm test:tenancy`) nomeia a diferença em vez de escondê-la atrás de um `describe.skipIf`.

  ```ts
  // vitest.tenancy.config.ts (raiz, novo arquivo)
  import { defineConfig } from "vitest/config"
  import path from "path"

  export default defineConfig({
    resolve: {
      alias: {
        "@web": path.resolve(__dirname, "packages/web/src"),
        // Correção D1 do parecer do @po — SEM este alias, `@trifold/shared/constants/supabase-refs`
        // não resolve: medido executando ("Cannot find package '@trifold/shared'..."). `tests/` na
        // raiz não está dentro de nenhum pacote do workspace (`ls node_modules/@trifold/` → não
        // existe; o link real só existe em `packages/web/node_modules/@trifold/shared`), e
        // `packages/shared/package.json` não tem campo `exports` — o subpath só resolve porque o
        // alias reescreve o prefixo para dentro de `src/`, igual ao `@web` já faz.
        "@trifold/shared": path.resolve(__dirname, "packages/shared/src"),
        "server-only": path.resolve(__dirname, "packages/web/src/__mocks__/server-only.ts"),
      },
    },
    test: {
      include: ["tests/tenancy/**/*.test.ts"],
      // Integração com rede + service-role real: sequencial, sem paralelismo entre arquivos —
      // dois arquivos rodando provision_org("Org A", "org-a") ao mesmo tempo colidiriam no slug.
      fileParallelism: false,
      testTimeout: 30_000,
    },
  })
  ```
  `package.json` (raiz) ganha `"test:tenancy": "vitest run -c vitest.tenancy.config.ts"` — **nunca**
  entra em `pretest`/`test` nem em nenhum job do `ci.yml` nesta story (ver Scope OUT).

  **Guarda 1 — destino, mesma DEFINIÇÃO do `reset-tenancy-testdb.ts`, correção factual do `@po`
  (D1) sobre COMO ele importa:** `scripts/reset-tenancy-testdb.ts:63` importa por **caminho
  relativo** (`"../packages/shared/src/constants/supabase-refs"`), não pelo nome do pacote —
  `scripts/` não tem alias nenhum. A justificativa da v0.1 desta AC ("`scripts/` tem o mesmo
  `resolve.alias`") estava errada nos fatos. Com o alias acrescentado acima, `tests/tenancy/` pode
  usar o nome do pacote (consistente com `@web`, já usado no resto do arquivo) — a correção certa
  não é copiar a forma do import do script, é fazer o alias existir:
  ```ts
  import { ehRefDeProducao, extrairRefDeUrlSupabase } from "@trifold/shared/constants/supabase-refs"

  function confirmarDestinoDeTeste(): { url: string; ref: string } {
    const url = process.env.TENANCY_TEST_SUPABASE_URL
    if (!url) throw new Error("TENANCY_TEST_SUPABASE_URL ausente — guarda de skip deveria ter agido antes")
    const ref = extrairRefDeUrlSupabase(url)
    if (!ref || ehRefDeProducao(ref)) {
      throw new Error(
        `tests/tenancy recusa rodar: ${url} resolve para um ref de PRODUÇÃO (ou ref não reconhecido). ` +
          "Este suite cria/apaga organizações inteiras. TENANCY_TEST_SUPABASE_URL tem que ser xnxvygyfyyyzwhiuoehz.",
      )
    }
    return { url, ref }
  }
  ```
  **Verificação executável, obrigatória (correção D1):** um teste trivial que só importa
  `ehRefDeProducao` de `@trifold/shared/constants/supabase-refs` e afirma
  `ehRefDeProducao("dsopqkqjkmhytudaaolv") === true` roda **verde**, sozinho, antes de qualquer
  asserção de banco — prova que o alias resolve de fato, e não só na leitura do código.

  **Guarda 2 — `skip` só para QUEM NÃO TEM o ambiente; `throw` para quem TEM e a config quebrou —
  REESCRITA (N2 do parecer, rodada 2).** A v0.2 tratava "arquivo ausente" e "arquivo presente mas
  vars não chegaram" como o mesmo caso — os dois caindo em `skip`. Medido pelo `@po`: isso é o
  defeito da v0.1 **de volta**, só que disparado por um jeito diferente de quebrar (`.env.teste`
  apagado por engano, variável renomeada, máquina nova sem o `.gitignore` esperado) — o resultado é
  de novo `Tests N skipped`, `exit 0`, escondendo asserções que teriam falhado. **Os dois motivos
  do skip precisam de dois caminhos:**
  ```ts
  import { existsSync } from "node:fs"
  import path from "node:path"

  const arquivoEnvExiste = existsSync(path.resolve(__dirname, ".env.teste"))
  const credenciaisPresentes =
    !!process.env.TENANCY_TEST_SUPABASE_URL && !!process.env.TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY

  // Tem o arquivo mas as vars não chegaram a process.env ⇒ o LOADER quebrou (vitest.tenancy.config.ts
  // não carregou, ou a var foi renomeada) — isto NÃO é "ambiente ausente". Skip aqui seria a suíte
  // inteira sumir em silêncio na primeira vez que alguém renomear uma variável (v0.1, D2).
  if (arquivoEnvExiste && !credenciaisPresentes) {
    throw new Error(
      "tests/tenancy: .env.teste existe mas TENANCY_TEST_SUPABASE_URL/SERVICE_ROLE_KEY não " +
        "chegaram ao process.env — o loader do vitest.tenancy.config.ts quebrou ou a variável foi " +
        "renomeada. Isto NÃO é 'ambiente ausente': seria skip verde escondendo a suíte inteira.",
    )
  }

  // Sem o arquivo: contribuidor sem acesso ao projeto Supabase, runner sem o secret — skip legítimo,
  // como sempre foi.
  describe.skipIf(!credenciaisPresentes)("Camada B — duas empresas reais (trifold-crm-dev)", () => {
    // AC4-AC14 aqui dentro
  })

  if (!credenciaisPresentes) {
    // eslint-disable-next-line no-console
    console.warn(
      "[tests/tenancy] .env.teste ausente — suíte pulada (ambiente sem credencial), não falhada.",
    )
  }
  ```
  Custo: 6 linhas (a checagem `arquivoEnvExiste` + o `if`/`throw`). **A exigência 3 da AC3b
  (controle positivo, colado uma vez) continua obrigatória** — aquela prova que o instrumento
  nasceu vivo; esta prova que ele **continua** vivo depois que alguém mexeu na configuração, sem
  depender de ninguém reler o Dev Agent Record de uma story antiga.

  **Por que isto importa nomeadamente:** um `throw`/`fail` para quem genuinamente não tem a
  credencial (sem o arquivo) deixaria o CI de todo contribuidor externo vermelho por motivo errado
  — a mesma classe de erro que `feedback_it_fails_verde_por_erro_de_setup.md` e
  `feedback_filtro_de_teste_que_nao_casa_sai_verde.md` documentam pelo lado oposto (verde por
  motivo errado). O `throw` da v0.3 mira só o caso intermediário — arquivo presente, config
  quebrada — que é distinto dos dois extremos e não pode continuar caindo no mesmo `skip` deles.

  **Verificação:** rodar `pnpm test:tenancy` sem as duas env vars setadas → suíte inteira
  **pulada** (não falhada), com o aviso no stderr; rodar com `TENANCY_TEST_SUPABASE_URL` apontando
  para um ref inventado (ex.: `https://producao-falsa.supabase.co`) fora das duas allowlists → a
  suíte **falha** na primeira asserção, com a mensagem nomeando o ref recusado (nunca um erro de
  rede genérico — a guarda precisa disparar antes de qualquer `fetch`).

  [Source: mission do dono do produto, 2026-08-29; `scripts/reset-tenancy-testdb.ts` (guarda
  original); `packages/shared/src/constants/supabase-refs.ts`; `docs/qa/po-validation-900-25.md`, D1]

- [x] **AC3b — Vivacidade obrigatória do `pnpm test:tenancy` — o 12º instrumento cego (AC nova,
  D2 do parecer do `@po`).**

  **Medido pelo `@po`, executando a config exata da v0.1 desta story:** vitest **não lê nenhum
  `.env` deste repositório** — `.env.teste` não é um nome que o Vite/Vitest carregue sozinho
  (carrega `.env`/`.env.local`/`.env.[mode]`; quem lê `.env.teste` é `scripts/lib/db-env.ts`, que
  esta suíte não usa), e a raiz não tinha `setupFiles`. Resultado: `TENANCY_TEST_SUPABASE_URL`
  chega `undefined` dentro do teste. Combinado com a Guarda 2 da AC3, o efeito medido foi:
  ```
   Test Files  1 skipped (1)
        Tests  2 skipped (2)
  EXIT_CODE=0
  ```
  com **dois `expect(1).toBe(2)` propositalmente falsos dentro do bloco** — o `console.warn` nem
  aparece no fim da saída. **O estado *default* de `pnpm test:tenancy`, sem exportar nada à mão, é
  verde com zero asserção executada — e nenhuma AC anterior obrigava a evidência do contrário.**

  **Três exigências, nenhuma delas satisfeita por "documentar que dá pra exportar à mão":**

  1. **Carregamento de `.env.teste` executável, não manual.** `vitest.tenancy.config.ts` carrega o
     arquivo no próprio topo do config (roda no processo que sobe os workers, antes de qualquer
     teste — `process.env` já populado quando os workers herdam o ambiente), pelo mesmo padrão
     nativo que `scripts/lib/db-env.ts` já usa (sem dependência `dotenv` nova — `node:util.parseEnv`).
     **Nota de compatibilidade (Menor 6 do parecer, rodada 2): `node:util.parseEnv` só existe a
     partir do Node 20.12/21.7** — este projeto roda em `v25.6.1` (confirmado), mas
     `.claude/CLAUDE.md` documenta "Node 18+" como requisito, o que é uma divergência de escopo
     maior que esta story (não corrigida aqui — registrar como item para o `@devops` atualizar o
     requisito documentado). O loader não pode travar com um erro opaco num Node antigo:
     ```ts
     import { existsSync, readFileSync } from "node:fs"
     import { parseEnv } from "node:util"

     const ARQUIVO_ENV_TESTE = path.resolve(__dirname, ".env.teste")
     if (existsSync(ARQUIVO_ENV_TESTE)) {
       if (typeof parseEnv !== "function") {
         throw new Error(
           "tests/tenancy: node:util.parseEnv indisponível — requer Node 20.12+/21.7+. " +
             `Versão atual: ${process.version}.`,
         )
       }
       const doArquivo = parseEnv(readFileSync(ARQUIVO_ENV_TESTE, "utf-8"))
       for (const [chave, valor] of Object.entries(doArquivo)) {
         if (process.env[chave] === undefined) process.env[chave] = valor // process.env vence
       }
     }
     ```
     (vai no topo de `vitest.tenancy.config.ts`, antes do `export default defineConfig({...})`.)
  2. **Dev Agent Record obrigatório com a CONTAGEM de testes executados vs. pulados**, colada da
     saída real do comando (`Tests  N passed | M skipped`) — nunca só "rodei e ficou verde".
     `0 passed | N skipped` é **reprovação da story**, não sucesso silencioso.
  3. **Controle positivo de vivacidade, executado uma vez, com o vermelho colado no Dev Agent
     Record, depois revertido:** quebrar deliberadamente uma asserção de banco já escrita nas
     ACs seguintes (ex.: trocar `orgBId` por `orgAId` numa asserção da AC7), rodar
     `pnpm test:tenancy`, colar a saída **vermelha**, reverter a quebra. Mesmo padrão que
     `900-3b`/`900-21b` já estabeleceram para os próprios instrumentos delas: **instrumento sem
     vermelho não é instrumento.**

  [Source: `docs/qa/po-validation-900-25.md`, D2 (rodada 1, mecanismo do loader) e N2 (rodada 2,
  a Guarda 2 precisa distinguir skip legítimo de config quebrada — ver AC3);
  `feedback_filtro_de_teste_que_nao_casa_sai_verde.md`]

- [x] **AC4 — Assertion 1: `provision_org` idempotente, ids distintos.**

  ```ts
  const orgAId1 = await rpc("provision_org", { p_name: "Org A — 900-25", p_slug: "org-a-900-25" })
  const orgBId1 = await rpc("provision_org", { p_name: "Org B — 900-25", p_slug: "org-b-900-25" })
  expect(orgAId1).not.toBe(orgBId1)

  const orgAId2 = await rpc("provision_org", { p_name: "Org A — 900-25", p_slug: "org-a-900-25" })
  expect(orgAId2).toBe(orgAId1)
  // reexecutar não duplica: só existe UMA linha com esse slug
  // (nome corrigido — m3 do parecer do @po: é a LISTA de linhas, não uma contagem)
  const { data: linhasComEsseSlug } = await admin.from("organizations").select("id").eq("slug", "org-a-900-25")
  expect(linhasComEsseSlug).toHaveLength(1)
  ```
  Slug com sufixo `-900-25` (não `org-a`/`org-b` genérico) — evita colidir com qualquer fixture de
  story anterior que já tenha usado esses slugs no mesmo `trifold-crm-dev` compartilhado.

  **Mutação que reprova:** rodar contra uma migration `246`/`247` revertida localmente (ou, mais
  barato, ler o corpo de `provision_org` via `pg_get_functiondef` e confirmar que a seção 1
  ("idempotência mora aqui", `SELECT id INTO v_org_id FROM organizations WHERE slug = …`) está
  presente) — não é uma mutação executável nesta story (não se aplica migration revertida em
  ambiente compartilhado), é uma leitura de confirmação, registrada como tal no Dev Agent Record.

  [Source: mission do dono do produto; `supabase/migrations/246_org_integrations_e_unicidade_whatsapp.sql`, seção 3]

- [x] **AC5 — Assertion 2: seed — 1 `whatsapp_config` inactive + 6 `org_integrations`
  disconnected, por org.**

  ```ts
  for (const orgId of [orgAId, orgBId]) {
    const { data: wa } = await admin.from("whatsapp_config").select("status, phone_number_id, access_token").eq("org_id", orgId)
    expect(wa).toHaveLength(1)
    expect(wa![0]).toMatchObject({ status: "inactive", phone_number_id: null, access_token: null })

    const { data: integ } = await admin.from("org_integrations").select("provider, status").eq("org_id", orgId)
    expect(integ).toHaveLength(6)
    expect(new Set(integ!.map((i) => i.provider))).toEqual(
      new Set(["whatsapp", "meta_ads", "meta_capi", "sienge", "telegram", "google"]),
    )
    expect(integ!.every((i) => i.status === "disconnected")).toBe(true)
  }
  ```
  **Mutação que reprova:** contra um `provision_org` que "esquecesse" a seção 6 (comentar as 6
  linhas do `INSERT INTO org_integrations` na leitura do corpo da função via
  `pg_get_functiondef('provision_org'::regproc)`) o teste cairia de 6 para 0 — não executável como
  mutação real nesta story (mudaria a função em produção/teste), documentado como raciocínio, não
  como execução.

  **Nota (m4 do parecer do `@po`, para não virar "correção" ao contrário):** o plano aprovado
  (Passo 3) fala em **7** linhas de `org_integrations`; esta AC afirma **6**. **A story está
  certa** — migration `246:222-229` insere 6 (`resend` fica de fora, decisão do dono do produto,
  permanece da plataforma). Se alguém "corrigir" esta AC para 7 no futuro, a correção é que estará
  errada.

  [Source: mission do dono do produto; migration `246`, seção 3, blocos 5 e 6]

- [x] **AC6 — Assertion 3: as UNIQUE falham — a mais importante da story.**

  **"Se este passo passar sem erro, o índice não existe e todo o resto é teatro"** — citação
  literal da missão, e a razão de esta AC ser a primeira testada depois do seed, antes de qualquer
  asserção de comportamento.

  **Correção D3 do parecer do `@po` — a v0.1 desta AC era verde por colinearidade, e a própria
  AC a derrotava.** A migration `246` cria **duas** UNIQUE parciais em `whatsapp_config`:
  `whatsapp_config_phone_ativo` (por `phone_number_id`, `WHERE status='active'`) — a que esta AC
  existe para provar — e `whatsapp_config_org_ativo` (por `org_id`, `WHERE status='active'`) — a
  outra. O insert de teste da v0.1 usava `org_id: orgAId`, que a AC já tinha acabado de ativar duas
  linhas acima — violando **as duas** ao mesmo tempo. `expect(error!.code).toBe("23505")` continua
  verde mesmo se `whatsapp_config_phone_ativo` **não existir**, disparado só por
  `whatsapp_config_org_ativo`. A frase-tese da AC ("se este passo passar sem erro, o índice não
  existe") era derrotada pelo próprio código da AC. **O Postgres nomeia a constraint na mensagem
  de erro — é isso que discrimina, e a v0.2 afirma o nome, não só a classe.**

  ```ts
  // Ativa A e B com telefones distintos — isto TEM que funcionar (controle positivo).
  await admin.from("whatsapp_config").update({ status: "active", phone_number_id: "PA" }).eq("org_id", orgAId)
  await admin.from("whatsapp_config").update({ status: "active", phone_number_id: "PB" }).eq("org_id", orgBId)

  // (1) phone_ativo: terceira linha ativa com "PA" repetido — TEM que falhar, 23505,
  // NOMEANDO whatsapp_config_phone_ativo (o discriminante — D3).
  const { error } = await admin.from("whatsapp_config").insert({ org_id: orgAId, status: "active", phone_number_id: "PA" })
  expect(error).not.toBeNull()
  expect(error!.code).toBe("23505")
  expect(error!.message).toContain("whatsapp_config_phone_ativo")

  // (1b) phone_ativo, ISOLADO de verdade — Menor 7 do parecer (rodada 2): o caso (1) acima
  // discrimina HOJE por ORDEM DE OID (phone_ativo oid 79472 < org_ativo oid 79473 no dev atual —
  // o Postgres nomeia o primeiro índice que checa, e "primeiro" não é garantido pela migration,
  // é acidente de criação). Terceira org fixture "C", só para este caso, provisionada e
  // desmontada dentro do próprio bloco desta AC (não entra no conjunto A/B usado pelas demais):
  // insere ativa com o MESMO "PA" da org A, mas C não tem nenhuma outra linha própria — só
  // phone_ativo pode reprovar, org_ativo não tem o que reprovar (C não colide consigo mesma).
  const orgCId = await rpc("provision_org", { p_name: "Org C — 900-25 (isolamento phone_ativo)", p_slug: "org-c-900-25" })
  const { error: erroPhoneAtivoIsolado } = await admin.from("whatsapp_config")
    .insert({ org_id: orgCId, status: "active", phone_number_id: "PA" }) // "PA" já pertence à org A
  expect(erroPhoneAtivoIsolado).not.toBeNull()
  expect(erroPhoneAtivoIsolado!.code).toBe("23505")
  expect(erroPhoneAtivoIsolado!.message).toContain("whatsapp_config_phone_ativo")
  await admin.from("organizations").delete().eq("id", orgCId) // desmonte imediato, por id — org C não vaza para as outras ACs

  // (2) org_ativo, ISOLADO do (1) — bônus de simetria exigido pelo parecer: segunda linha ativa
  // na PRÓPRIA org B, com um phone_number_id DIFERENTE ("PB2") — não colide com nenhum telefone
  // existente, então só org_ativo pode reprovar. Sem este caso, org_ativo nasce "provado" por
  // acidente (carona no teste do phone_ativo), nunca por desenho.
  const { error: erroOrgAtivo } = await admin.from("whatsapp_config").insert({ org_id: orgBId, status: "active", phone_number_id: "PB2" })
  expect(erroOrgAtivo).not.toBeNull()
  expect(erroOrgAtivo!.code).toBe("23505")
  expect(erroOrgAtivo!.message).toContain("whatsapp_config_org_ativo")

  // org_integrations: page_id repetido entre A e B — mesma exigência, nomeando o índice
  // (migration 246:85-87, org_integrations_meta_page_ativo — sem condição de status).
  await admin.from("org_integrations").update({ config: { page_id: "PAGE-A" } }).eq("org_id", orgAId).eq("provider", "meta_ads")
  const { error: erroPageId } = await admin.from("org_integrations")
    .update({ config: { page_id: "PAGE-A" } }).eq("org_id", orgBId).eq("provider", "meta_ads")
  expect(erroPageId).not.toBeNull()
  expect(erroPageId!.code).toBe("23505")
  expect(erroPageId!.message).toContain("org_integrations_meta_page_ativo")
  ```
  **Controle positivo, obrigatório (o que a régua `900-3b`/`900-21b` já ensinou: instrumento sem
  vermelho não é instrumento):** antes de afirmar as falhas acima, afirmar que ativar A e B com
  telefones **distintos** (`"PA"`/`"PB"`) **funciona sem erro** — se essa etapa falhasse, o índice
  estaria excessivamente restritivo (falso positivo do teste), e as asserções de falha seguintes
  não provariam nada.

  [Source: mission do dono do produto, 2026-08-29 — citação literal; migration `246`, seção 1;
  `docs/qa/po-validation-900-25.md`, D3 (rodada 1) e Menor 7 (rodada 2, isolamento de
  `phone_ativo` sem depender de ordem de OID)]

- [x] **AC7 — Assertion 4: WhatsApp roteia por `phone_number_id`, nos dois sentidos.**

  Chama `POST` no handler real de `packages/web/src/app/api/webhook/whatsapp/route.ts`, com
  `WEBHOOK_ORG_ROUTING=identifier` setado no processo do teste e `SUPABASE_URL`/
  `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` **redirecionados para
  `TENANCY_TEST_SUPABASE_URL`/`TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY`** só durante este bloco
  (`createAdminClient()` lê os primeiros, não os `TENANCY_TEST_*` — ver Dev Notes, "Como o handler
  real enxerga `trifold-crm-dev`"), com HMAC calculado sobre o corpo usando um `META_APP_SECRET`
  de teste (qualquer valor fixo, setado no mesmo bloco):
  ```ts
  const body = JSON.stringify(payloadWhatsAppComPhoneNumberId("PB"))
  const assinatura = "sha256=" + crypto.createHmac("sha256", META_APP_SECRET_TESTE).update(body).digest("hex")
  const res = await POST(new NextRequest("http://localhost/api/webhook/whatsapp", {
    method: "POST", body, headers: { "x-hub-signature-256": assinatura },
  }))
  expect(res.status).toBe(200)
  ```
  Afirmar: `messages`/`conversations`/`leads` novos têm `org_id === orgBId`; a contagem de
  `messages`/`conversations`/`leads` da org A (medida ANTES do envio) fica **inalterada**. **E o
  simétrico**: repetir com `phone_number_id: "PA"` e afirmar org A recebe, org B fica inalterada.
  **Um resolver que sempre devolve B passaria no primeiro teste sozinho** — é por isso que os dois
  sentidos são obrigatórios, não um "e depois o outro por simetria assumida".

  [Source: mission do dono do produto, 2026-08-29; `packages/web/src/app/api/webhook/whatsapp/route.ts`
  (`export async function POST` em `:201` — corrigido, m1 do parecer; a resolução de org em `:433-483`)]

- [x] **AC8 — Assertion 5: a resposta não caiu no ramo antigo `if (!config) return "ok"` — a
  asserção que reprova o código de antes da onda.**

  Com as duas orgs ativas (AC6/AC7), afirmar que existe uma linha em `messages` com o `wamid`
  exato enviado no payload de teste (`metadata->>whatsapp_message_id`), e não apenas que o HTTP
  respondeu 200 — **200 sozinho não distingue "processou" de "caiu no ramo silencioso"**, porque os
  dois branches devolvem `{ status: "ok" }` (ver Context da `900-24`: o bug agudo original também
  respondia 200). A distinção só existe olhando o efeito no banco.
  ```ts
  const { data: msg } = await admin.from("messages")
    .select("id, org_id").eq("metadata->>whatsapp_message_id", wamidDeTeste).maybeSingle()
  expect(msg).not.toBeNull()
  expect(msg!.org_id).toBe(orgBId)
  ```

  [Source: mission do dono do produto, 2026-08-29; Context da `900-24`, "o bug agudo, medido"]

- [x] **AC9 — Assertion 6: Meta Ads roteia por `page_id`, com `webhook_logs.org_id` correto.**

  Mesmo padrão da AC7, para `packages/web/src/app/api/webhooks/meta-ads/route.ts`, com
  `entry[0].id` = `"PAGE-A"`/`"PAGE-B"` (configurados via `org_integrations` na AC6). Afirmar: o
  lead criado tem `org_id` da org dona daquele `page_id`; a linha em `webhook_logs` (já inserida
  pela rota **antes** de resolver a org — Task 5.4 da `900-24`) tem `org_id` igual ao mesmo valor
  depois do processamento, não `null`.

  [Source: mission do dono do produto, 2026-08-29; `packages/web/src/app/api/webhooks/meta-ads/route.ts`]

- [x] **AC10 — Assertion 7: `phone_number_id` desconhecido → 200 explícito, zero linha em
  `messages`, log estruturado nos dois lugares — REESCRITA (D5 do parecer do `@po`).**

  **O que a v0.1 errava, medido pelo `@po` lendo `logOrgUnresolved`
  (`webhook-org.ts:318-360`):** os dois artefatos que esta AC consulta nascem com `org_id = null`
  **por desenho** (é o ponto do log de não-resolvida — sem org conhecida, não há org para atribuir)
  — logo o teardown-por-id da AC14 **nunca** os alcança. `logOrgUnresolved` **não passa
  `dedupe_key`** para `logEventOnce`, então cada execução insere uma linha nova, sem dedupe. E o
  identificador da v0.1 era um **literal constante** (`"PHONE-DESCONHECIDO-900-25"`). Some os três:
  na 2ª execução exigida pela seção Testing, **duas** linhas casam o filtro, o `.maybeSingle()` da
  v0.1 devolve `{ data: null, error: { code: "PGRST116" } }` — e a v0.1, escrevendo
  `const { data: evento } = await …`, **descartava exatamente o `error`** que esta story inteira
  existe para parar de descartar. A AC reproduzia, dentro de si, o defeito que ela prova ter sido
  fechado.

  **Correção, com três partes:**
  1. **Identificador único por execução**, não um literal fixo: `PHONE-DESCONHECIDO-900-25-${runId}`,
     com `runId = crypto.randomUUID()` gerado uma vez no `beforeAll` da suíte. Mata a não-idempotência
     E preserva a preocupação original (não colidir com resíduo de outra suíte).
  2. **Nunca `.maybeSingle()`/`.single()` nesta suíte, em nenhuma leitura de verificação** — regra
     que vale para a story inteira (ver Testing Standards). Aqui, especificamente: `.order("created_at",
     { ascending: false }).limit(1)`, OU `.limit(2)` com `expect(linhas).toHaveLength(1)` explícito
     antes de indexar `linhas[0]`.
  3. **Toda query desta AC lê `{ data, error }` e afirma `error` nulo antes de usar `data`** — nunca
     desestruturar só `data`.

  ```ts
  const identificadorDesteRun = `PHONE-DESCONHECIDO-900-25-${runId}`
  const res = await POST(requisicaoComPhoneNumberId(identificadorDesteRun))
  expect(res.status).toBe(200) // AC — a Meta desabilita o webhook após falhas repetidas
  const { data: msgs, error: erroMsgs } = await admin.from("messages")
    .select("id").eq("metadata->>whatsapp_message_id", wamidDesteTeste)
  expect(erroMsgs).toBeNull()
  expect(msgs).toHaveLength(0)

  const { data: eventos, error: erroEventos } = await admin.from("system_events")
    .select("id, event_type, org_id, metadata").eq("event_type", "WEBHOOK_ORG_UNRESOLVED")
    .eq("metadata->identificador->>phone_number_id", identificadorDesteRun)
    .order("created_at", { ascending: false }).limit(1)
  expect(erroEventos).toBeNull()
  expect(eventos).toHaveLength(1)
  expect(eventos![0]!.org_id).toBeNull()

  const { data: logs, error: erroLogs } = await admin.from("webhook_logs")
    .select("id, org_id, processing_error").eq("payload->>phone_number_id", identificadorDesteRun)
    .order("created_at", { ascending: false }).limit(1)
  expect(erroLogs).toBeNull()
  expect(logs).toHaveLength(1)
  expect(logs![0]!.org_id).toBeNull()
  ```
  **Teardown desta AC, DE FATO consumido pela AC14 (Menor 5 do parecer, rodada 2 — a v0.2
  prometia esse handoff e nenhum dos dois lados o implementava):** os ids de `eventos![0]` e
  `logs![0]` capturados acima são empurrados para `idsComOrgIdNuloDaAC10.systemEvents`/
  `.webhookLogs` (estrutura compartilhada, populada aqui, lida pela Task 11.2 da AC14) — a única
  forma de apagar essas duas linhas específicas, já que elas nascem com `org_id: null` e nenhum
  filtro `.eq("org_id", …)` as alcança.

  [Source: mission do dono do produto, 2026-08-29 — citação literal do AC ("o 200 é AC — a Meta
  desabilita webhook após falhas repetidas"); `packages/web/src/lib/tenancy/webhook-org.ts`;
  `docs/qa/po-validation-900-25.md`, D5 (rodada 1), Menor 5 (rodada 2)]

- [x] **AC11 — Assertion 8: `meta-capi-dispatch` — outbox por org, transporte CAPI stubado,
  isolamento medido por `external_id` — REESCRITA (D6, D7 do parecer do `@po`).**

  **Correção D6 — o stub capturava o contrato errado.** Medido:
  `packages/shared/src/meta/capi-client.ts:76` → `sendCapiEvents(events: CapiEvent[], options?:
  SendCapiEventsOptions)`, chamado em `meta-capi-dispatch/route.ts:289` como `sendCapiEvents(events,
  { datasetId, ... })` — a v0.1 desta AC pedia capturar `(datasetId, events)`, ordem e forma
  erradas. O stub captura `(events, options)` e a asserção lê `options.datasetId`.

  **Correção D6, segunda parte — isolamento de arquivo, não `vi.mock` compartilhado.** `vi.mock`
  é **hoisted**: vale para o arquivo inteiro. Se esta AC morasse no mesmo arquivo de AC4-AC10/
  AC12-AC14, `vi.mock("@trifold/shared", …)` mockaria o barrel também para a Guarda 1 da AC3
  (`ehRefDeProducao` vem do mesmo `@trifold/shared`) — a mesma tática de "mute o helper, o call
  site E o argumento" que o Context desta story cita como lição das duas fatias anteriores,
  aplicada contra a própria story. **Esta AC mora em arquivo próprio:
  `tests/tenancy/capi-dispatch.test.ts`**, com as suas PRÓPRIAS duas orgs fixture (slugs
  `org-a-900-25-capi`/`org-b-900-25-capi` — `provision_org` é idempotente, então provisionar de
  novo em vez de reusar as orgs de `cross-tenant.test.ts` é seguro e mais simples do que
  coordenar teardown entre dois arquivos), provisionadas no próprio `beforeAll` deste arquivo e
  desmontadas no próprio `afterAll` (mesmo padrão de canário/teardown-por-id da AC14, replicado
  aqui — não compartilhado).

  **Correção D7 — efeito colateral não escopado: a varredura do cron é GLOBAL.** `GET` faz
  `.eq("status","pending")` em `meta_capi_outbox` **sem filtro de org** — linhas `pending` de
  QUALQUER organização no `trifold-crm-dev` compartilhado entrariam no lote. E `skipped` é
  **terminal**: o comentário da própria rota (`meta-capi-dispatch/route.ts:182-199`) diz que nada
  no repositório devolve `skipped` para `pending` — rodar esta AC sem cuidado poderia mutar,
  **permanentemente**, a fila de outra pessoa trabalhando no mesmo banco. **Pré-condição
  obrigatória, na Task 0 deste arquivo, que ABORTA (não ignora) se violada:**
  ```ts
  const { data: pendentesDeTerceiros, error } = await admin.from("meta_capi_outbox")
    .select("id, org_id").eq("status", "pending").not("org_id", "in", `(${orgAId},${orgBId})`)
  if (error) throw error
  if (pendentesDeTerceiros!.length > 0) {
    throw new Error(
      `AC11 abortada: ${pendentesDeTerceiros!.length} linha(s) 'pending' de outra(s) org(ns) em ` +
        `meta_capi_outbox (ids: ${pendentesDeTerceiros!.map((r) => r.id).join(", ")}) — rodar o ` +
        "cron real marcaria essas linhas como 'skipped' (terminal, irreversível). Não prosseguir.",
    )
  }
  ```

  **Stub, com o contrato certo (D6):**
  ```ts
  import * as capiClient from "@trifold/shared"
  const chamadasCapi: Array<{ events: CapiEvent[]; options?: SendCapiEventsOptions }> = []
  const stub = vi.spyOn(capiClient, "sendCapiEvents").mockImplementation(async (events, options) => {
    chamadasCapi.push({ events, options })
    return { success: true, events_received: events.length } // formato real — @dev confirma contra o tipo de retorno de sendCapiEvents
  })
  // afterAll: stub.mockRestore()
  ```
  `vi.spyOn` (não `vi.mock` factory) — não é hoisted, afeta só este arquivo, restaura sozinho.

  Setup: 2 leads fixture (um por org, órgãos próprios deste arquivo), inseridos direto em
  `meta_capi_outbox` com `status: 'pending'` e `event_id` determinístico; `org_integrations`
  (provider `meta_capi`) da org A atualizada com `config.dataset_id: 'dataset-teste-a-900-25'`;
  org B **permanece** com `dataset_id: null` (seed padrão — não precisa de setup extra).

  Roda o `GET` real de `packages/web/src/app/api/cron/meta-capi-dispatch/route.ts` (com
  `CRON_SECRET` de teste + `Authorization` correspondente + env redirecionada, mesmo padrão da
  AC7 — ver Dev Notes). Afirma:
  - Existe **uma** chamada ao stub com `options?.datasetId === 'dataset-teste-a-900-25'`; o
    `external_id` dentro dela (`sha256(leadA.id)`) está presente; `sha256(leadB.id)` **não** está —
    nem nesse array de events, nem em nenhuma outra chamada capturada.
  - Zero chamadas ao stub contendo qualquer evento de `leadB`.
  - A linha de outbox de B fica `status: 'skipped'`, `last_error: 'capi_nao_configurado'`.
  - **Nenhuma** linha (nem A, nem B) fica `status: 'sent'` a menos que o stub tenha sido chamado
    para ela — isto é, "sent" só existe onde o teste efetivamente viu a chamada, nunca por
    inferência do status sozinho (o carrasco real é a correspondência stub↔linha, não o rótulo).

  [Source: mission do dono do produto, 2026-08-29; `packages/web/src/app/api/cron/meta-capi-dispatch/route.ts`, `resolverDatasetId`/`processarOrg`; `docs/qa/po-validation-900-25.md`, D6 e D7]

- [x] **AC12 — Assertion 9: isolamento de erro entre orgs, com os dois `orgId` nomeados.**

  **Correção D9 do parecer do `@po`: esta AC também precisa do redirecionamento de env (Dev
  Notes) — a v0.1 não a listava.** `forEachActiveOrg` chama `createAdminClient()`
  **internamente** (`for-each-org.ts:132`) para listar `organizations` — a mesma
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` que a AC7 já redireciona. Sem o redirecionamento,
  sob `pnpm test:tenancy` essas vars chegam `undefined` (medido no D2) e o client vira
  `createClient("", "")` — nem erro nem sucesso limpo, um estado ambíguo que não testa nada.

  Chama `forEachActiveOrg` **diretamente** (não uma rota de cron específica) contra
  `trifold-crm-dev`, com o mesmo bloco `beforeEach`/`afterEach` de redirecionamento de env das
  demais ACs de rota real, e um callback de teste que lança só para a org A:
  ```ts
  const resumo = await forEachActiveOrg(
    async (org) => { if (org.id === orgAId) throw new Error("falha forçada 900-25"); return "ok" },
    { source: "tests/tenancy/isolamento-900-25" },
  )
  const entradaA = resumo.resultados.find((r) => r.org.id === orgAId)!
  const entradaB = resumo.resultados.find((r) => r.org.id === orgBId)!
  expect(entradaA.ok).toBe(false)
  expect(entradaA.erro).toContain("falha forçada 900-25")
  expect(entradaB.ok).toBe(true)
  ```
  **Por que a rota real (não um cron específico) é o alvo, e não `daily-report`/
  `nicole-agenda-reconcile`:** `forEachActiveOrg` lista `organizations WHERE is_active = true`
  **sem filtro** — no banco compartilhado, isso inclui `org-teste-epic-900` e qualquer outra org
  viva no momento. Testar contra o helper puro, com um callback sintético, isola exatamente a
  propriedade sob teste (isolamento de erro do mecanismo) sem depender de nenhum sistema externo
  (WhatsApp, Telegram, Meta) nem presumir o tamanho total da lista — a asserção é só sobre as
  entradas de A e B, por `find`, nunca sobre `resumo.total`/`resumo.sucesso`/`resumo.falha`
  globais (ver Context, "por que a Camada B não pode…").

  [Source: mission do dono do produto, 2026-08-29; `packages/web/src/lib/tenancy/for-each-org.ts`]

- [x] **AC13 — Assertion 10: `daily-report` — um despacho por org, `DAILY_REPORT_RECIPIENTS`
  escopado à org designada.**

  **A rota real** (`packages/web/src/app/api/cron/daily-report/route.ts`) — diferente da AC12,
  aqui o objetivo é a rota inteira, porque a propriedade sob teste é a composição
  `orgDaEnvDeRecipients = process.env.DAILY_REPORT_ORG_ID ?? trifoldOrgId()` **dentro** dela.

  **Ajuste obrigatório de ambiente para este teste — razão CORRIGIDA (N3, rodada 2; a v0.2 estava
  errada nos fatos).** `trifoldOrgId()` **resolve**, sim, em `trifold-crm-dev` — para
  `"00000000-0000-0000-0000-000000000001"`, que é **exatamente** o id da única org ativa hoje lá
  (`org-teste-epic-900`, o canário da AC14). A v0.2 dizia o oposto ("não resolve nada lá"): estava
  errada, e a versão certa é mais séria, não mais branda — **sem o override, os telefones de
  `DAILY_REPORT_RECIPIENTS` valeriam para o canário**, a org que a suíte inteira promete não
  perturbar (ver AC14), não para "org inexistente". O teste seta
  `process.env.DAILY_REPORT_ORG_ID = orgAId` (a org fixture A) só durante este bloco — desvia
  deliberadamente `orgDaEnvDeRecipients` do canário para uma org que a própria suíte controla e
  desmonta no fim (a rota já suporta esse override por desenho, ver `daily-report/route.ts:66` —
  corrigido de `:65`, m2 do parecer). **Relacionado:** `forEachActiveOrg` roda o callback do
  `daily-report` também para o canário (ele é uma org ativa como qualquer outra) — inofensivo
  graças ao stub do D7 abaixo, mais uma razão por que ele não é dispensável.

  **Correção D7 do parecer do `@po` — "as fixtures nascem `inactive`" NÃO basta como argumento de
  segurança.** `daily-report` roda `forEachActiveOrg` sobre **todas** as orgs ativas do
  `trifold-crm-dev` compartilhado, não só A e B; e `sendDailyReport`
  (`send-daily-report.ts:20-28`) checa `phone_number_id`/`access_token` — **não checa `status`**.
  Uma **terceira** org, que outro trabalho no mesmo banco tenha deixado com um token real
  configurado, receberia um `fetch` de verdade à Graph API só por esta suíte ter rodado a rota
  inteira. **Correção: stubar `sendDailyReport` — nunca deixar a chamada real acontecer, para
  NENHUMA org, independente do estado dela:**
  ```ts
  import * as sendDailyReportModule from "@web/lib/reports/send-daily-report"
  const chamadasEnvio: Array<{ orgId: string; recipients: string[] }> = []
  const stubEnvio = vi.spyOn(sendDailyReportModule, "sendDailyReport")
    .mockImplementation(async (_admin, orgId, recipients) => {
      chamadasEnvio.push({ orgId, recipients })
      return { sent: recipients.length, errors: [] }
    })
  // afterEach: stubEnvio.mockRestore()
  ```
  `vi.spyOn` (não `vi.mock`) — não hoisted, escopado a este bloco, sem o risco do D6. A asserção de
  escopo passa a ler `chamadasEnvio`, não mais depender de sucesso/falha do envio real:

  **Correção N4 (rodada 2) — o fixture da v0.2 não sobrevivia ao normalizador, e isso quebrava a
  metade positiva da prova.** A cadeia real é `resolveDailyReportRecipients` → `mergeRecipients`
  (`recipients.ts:52-75`), que faz `const tel = normalizePhoneBR(bruto); if (!tel || ...) return` —
  **um valor que não normaliza é descartado em silêncio**. A v0.2 usava
  `TELEFONE_FIXTURE_900_25 = "valor inventado sem significado"`: se não normalizasse,
  `destinatarios` ficaria vazio, a rota devolveria `{ skipped }`, `sendDailyReport` nunca seria
  chamado para A, `chamadaOrgA` seria `undefined`, e a asserção falharia — **não em silêncio**,
  mas o risco nomeado pelo `@po` é o conserto errado: um `@qa` apressado relaxa a asserção para
  `expect(chamadaOrgA).toBeDefined()`, que passa por qualquer motivo (inclusive o telefone
  descartado) e mata a metade **positiva** da prova ("a env FOI aplicada a A"), sobrevivendo só a
  negativa ("B não recebeu") — que sozinha não prova nada sobre A.

  **Correção: o fixture tem que ser um número em formato BR válido, numa faixa sem uso — inventado
  *sem dono*, não inventado *sem forma*** (DDD 11, prefixo de teste, nunca discado):
  ```ts
  /** Sobrevive a normalizePhoneBR: 11 dígitos, DDD 11, sem prefixo 55 → normaliza para "55" + dígitos. */
  const TELEFONE_FIXTURE_900_25 = "11999990000"
  const TELEFONE_FIXTURE_900_25_NORMALIZADO = normalizePhoneBR(TELEFONE_FIXTURE_900_25) // "5511999990000"
  ```
  E a asserção compara contra a forma **normalizada** — nunca a bruta, porque é isso que
  `mergeRecipients` de fato devolve:
  ```ts
  const res = await GET(requisicaoComCronSecret())
  const chamadaOrgA = chamadasEnvio.find((c) => c.orgId === orgAId)
  const chamadaOrgB = chamadasEnvio.find((c) => c.orgId === orgBId)
  expect(chamadaOrgA?.recipients).toEqual([TELEFONE_FIXTURE_900_25_NORMALIZADO]) // envList aplicado — metade POSITIVA
  expect(chamadaOrgB).toBeUndefined() // org B teve destinatarios.length===0 → nunca chama sendDailyReport — metade NEGATIVA
  ```
  **As duas metades são obrigatórias, nenhuma sozinha basta** — reafirmado aqui porque é
  precisamente o ponto que o conserto errado apagaria.

  Afirma também: `resultados` da resposta JSON contém **uma** entrada para A e **uma** para B
  (`find` por `orgId`, ignorando quaisquer outras orgs do banco compartilhado — "um despacho por
  org", não "só duas entradas no total").

  `process.env.DAILY_REPORT_RECIPIENTS = TELEFONE_FIXTURE_900_25` (a forma BRUTA vai na env — é a
  rota que normaliza, não o teste) restaurado ao valor original no `afterEach`/`afterAll`, junto
  de `DAILY_REPORT_ORG_ID`.

  [Source: mission do dono do produto, 2026-08-29; `packages/web/src/app/api/cron/daily-report/route.ts:50-92`;
  Context desta story, lição 1 (corrigida na rodada 2);
  `docs/qa/po-validation-900-25.md`, D7 e m2 (rodada 1), N3 e N4 (rodada 2)]

- [x] **AC14 — Assertion 11: teardown com canário — apaga por id, nunca por predicado —
  REESCRITA (D4 da rodada 1, com N1/Menor 5 da rodada 2 — a lista de FKs passa a ser derivada em
  runtime, não hardcoded).**

  **O que a v0.1 errava, medido pelo `@po`: o teardown NÃO PODIA dar certo, e o canário era
  estruturalmente incapaz de perceber.** `system_events.org_id` referencia `organizations(id)`
  **sem `ON DELETE CASCADE`** (`supabase/migrations/009_system_events.sql:6` —
  `org_id uuid REFERENCES organizations(id),`, portanto `NO ACTION`/RESTRICT). E a suíte
  **garantidamente** grava lá com o id das duas orgs fixture: `for-each-org.ts:155-174`
  (`logEventOnce({ org_id: org.id, … })`, uma vez por org por execução — dispara nas AC11/AC12/
  AC13) e `webhook-org.ts:224-229` (`logOrgResolved`, `logEvent({ …, org_id: params.orgId })` —
  dispara nas AC7/AC8/AC9). `DELETE FROM organizations WHERE id IN (A, B)` devolve **`23503`
  foreign_key_violation**, e o delete **não acontece** — as duas orgs fixture ficam vivas e
  `active` no banco compartilhado, para sempre, com a suíte reportando verde, porque
  `expect(depois).toEqual(antes)` mede uma **terceira** org (o canário) que ninguém tocou: ele
  prova "não apaguei demais", nunca "apaguei o que disse que apagaria". **Efeito de segunda
  ordem:** a 2ª execução exigida pela seção Testing acha A e B ainda `active` com `PA`/`PB` da
  execução anterior — e a AC5 (`toMatchObject({ status: "inactive", … })`) explode, na AC errada,
  fazendo quem depura suspeitar do `provision_org` em vez do teardown.

  **Correção N1 (parecer rodada 2) — a lista escrita à mão da v0.2 já estava errada contra o
  catálogo vivo, e por construção: `grep` mede o arquivo de migration; o `DELETE` obedece ao
  `pg_constraint`.** Medido pelo `@po` contra `trifold-crm-dev`:

  | Fato | v0.2 dizia | `pg_constraint` diz (medido) |
  |---|---|---|
  | FKs `NO ACTION`/RESTRICT para `organizations` | 3 | **4** — as 3 + `financial_notification_log` |
  | FKs `ON DELETE CASCADE` | 75 | **87** |
  | FK `ON DELETE SET NULL` | `meta_ad_accounts`/`meta_*` | **`webhook_logs.org_id`** — é a única |

  Migration renomeada, FK adicionada por `ALTER TABLE`, coluna redeclarada numa migration
  posterior — nada disso aparece num `grep`, e tudo aparece no catálogo. **Correção: a lista deixa
  de ser a fonte — vira comentário datado, e o teardown deriva a lista em runtime, uma vez, no
  início da suíte:**
  ```sql
  -- Executada uma vez, guardada em memória para o resto da suíte. Nunca envelhece porque nunca é
  -- escrita à mão — 'c' (CASCADE) e 'n' (SET NULL) não bloqueiam o DELETE; o resto bloqueia.
  SELECT DISTINCT c.conrelid::regclass::text AS tabela
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.confrelid = 'organizations'::regclass
    AND c.confdeltype NOT IN ('c', 'n');
  ```
  ```ts
  const { data: tabelasRestrict, error: erroConstraint } = await admin.rpc("sql", { query: SQL_ACIMA })
  // (ou o transporte equivalente já usado pelos scripts de migration desta onda — @dev decide)
  if (erroConstraint) throw erroConstraint
  for (const { tabela } of tabelasRestrict!) {
    const { error } = await admin.from(tabela).delete().in("org_id", [orgAId, orgBId])
    if (error) {
      throw new Error(
        `teardown: DELETE FROM ${tabela} falhou — ${error.message}. Isto é o Postgres nomeando a ` +
          "constraint ofensora, nunca ignorar nem tentar um DELETE mais permissivo.",
      )
    }
  }
  ```
  **Em 2026-08-30 isto devolvia 4 tabelas** (`system_events`, `visit_feedback`,
  `agent_media_assets`, `financial_notification_log`) — número citado só para contexto histórico
  no Dev Agent Record, nunca hardcoded no código do teardown.

  **Consequência que a lista errada escondia (N1): `webhook_logs.org_id` é `SET NULL`, não
  RESTRICT nem CASCADE.** As linhas de `webhook_logs` que a AC9 acabou de afirmar (`org_id` =
  a org resolvida pelo Meta Ads) **não são apagadas quando `organizations` é deletada — são
  anuladas** (`org_id` vira `null`), e ficam no banco compartilhado como resíduo a cada execução
  (não corrupção — a linha continua íntegra, só perde a referência). Registrado por escrito para o
  próximo leitor não achar isto um bug do teardown: é o comportamento correto da FK, e o resíduo é
  aceitável (mesma classe do risco já aceito da Onda 1 — banco compartilhado).

  **Handoff AC10 → AC14, agora de fato consumido (Menor 5 do parecer — a v0.2 prometia e não
  entregava).** A AC10 já captura os ids das linhas de `system_events`/`webhook_logs` que ela
  mesma cria com `org_id: null` (não alcançáveis por `.eq("org_id", ...)`, porque não têm org).
  O teardown desta AC consome esse MESMO array, deletando por id, **depois** das tabelas RESTRICT
  e **antes ou depois** de `organizations` (indiferente — não têm FK para ela com efeito
  bloqueante, já que nasceram com `org_id: null`):
  ```ts
  if (idsComOrgIdNuloDaAC10.systemEvents.length > 0) {
    await admin.from("system_events").delete().in("id", idsComOrgIdNuloDaAC10.systemEvents)
  }
  if (idsComOrgIdNuloDaAC10.webhookLogs.length > 0) {
    await admin.from("webhook_logs").delete().in("id", idsComOrgIdNuloDaAC10.webhookLogs)
  }
  ```

  **Checar o `error` de CADA delete, nunca `const { data } = await …`** — é a mesma causa raiz que
  a `900-24` existe para fechar, e não pode reaparecer no teardown da story que prova a `900-24`.
  Todo bloco acima já lê `{ error }` e lança.

  **Uma asserção de que o teardown SUCEDEU — independente do canário:**
  ```ts
  const { data: orgsRemanescentes, error } = await admin.from("organizations")
    .select("id").in("id", [orgAId, orgBId])
  if (error) throw error
  expect(orgsRemanescentes).toHaveLength(0) // "apaguei o suficiente" — pergunta que o canário não faz
  ```

  **O canário, preservado e estendido (D7 — `meta_capi_outbox` entra na lista, por causa da AC11):**
  ```ts
  const canario = { orgId: await idDeOrgPorSlug(admin, "org-teste-epic-900") }
  const antes = await contarLinhasDoCanario(admin, canario.orgId) // organizations, whatsapp_config,
                                                                    // org_integrations, meta_capi_outbox
  // … cria A e B, roda AC4-AC13 …
  await apagarOrgsDeTeste([orgAId, orgBId]) // tabelas RESTRICT DERIVADAS de pg_constraint (N1),
                                             // depois system_events/webhook_logs por id (handoff da
                                             // AC10), depois organizations — SEMPRE .eq("id", …)/
                                             // .in("id", [...]), NUNCA .eq("slug", "%900-25%")
  const depois = await contarLinhasDoCanario(admin, canario.orgId)
  expect(depois).toEqual(antes)         // "não apaguei demais"
  expect(orgsRemanescentes).toHaveLength(0) // "apaguei o que disse que apagaria" — as duas perguntas, não uma
  ```
  **Por que id, nunca predicado:** um teardown por `.like("slug", "%900-25%")` ou por intervalo de
  `created_at` é exatamente o tipo de `DELETE` que a Onda 2 existe para tornar impossível em código
  de produção — replicar o mesmo padrão frouxo no teardown do próprio teste que prova isolamento
  seria a ironia que o `reset-tenancy-testdb.ts` já nomeia no próprio cabeçalho.

  Se `org-teste-epic-900` não existir no momento da execução (ambiente mudou), a suíte **falha
  cedo**, na Task 0 (pré-condição), com mensagem nomeando a org esperada — nunca segue sem canário
  em silêncio.

  [Source: mission do dono do produto, 2026-08-29 — citação literal; `scripts/reset-tenancy-testdb.ts`,
  cabeçalho; `docs/qa/po-validation-900-25.md`, D4 (rodada 1) e N1/Menor 5 (rodada 2)]

- [x] **AC15 — Não-regressão de produção.**

  Esta story não altera nenhum arquivo de `packages/web/src/app/**` de aplicação, nenhuma
  migration, nenhum comportamento em runtime de produção — só adiciona testes e 1 config de
  vitest. `git diff --stat` (comparado contra `main`, depois do merge dos 4 PRs-dependência) mostra
  só arquivos sob `packages/web/src/lib/tenancy/admin-invite.test.ts`,
  `.../resend-admin-invite/route.test.ts`, `tests/tenancy/**`, `vitest.tenancy.config.ts`,
  `package.json` (script novo), e os testes de Camada A fechados pela AC1. Nenhum arquivo fora
  desses padrões.

  [Source: mission do dono do produto — restrição "produção não muda de comportamento", herdada de todas as fatias da Onda 2]

---

## Tasks / Subtasks

*(Correção de bloqueio, Decisão 2 do parecer do `@po`: Tasks 1-2 estão **desbloqueadas desde já**
— tocam arquivos já em `main`, sem dependência de PR nenhum. Task 0 é pré-condição só de **Tasks
3-12**. Task 3 (config isolada + guardas) é pré-requisito de 4-14. Dentro de 4-14, a ordem da
lista de assertions é a ordem recomendada — AC6 (assertion 3) depois de AC4/AC5 (assertions 1/2) e
antes de qualquer assertion de webhook, porque as UNIQUE são pré-condição de "ativar A e B com
telefones distintos" que as assertions 4-10 todas assumem. Task 8 (AC11) é um arquivo separado,
independente do restante de 4-14 — ver D6.)*

- [x] **Task 0 — pré-condição de execução (só Tasks 3-12) — @qa**
  - [x] 0.1 Confirmar (`gh pr view 525 526 527 528`) que os quatro PRs estão mergeados em `main`.
    Se não, parar — não implementar Tasks 3-12 contra branch (Tasks 1-2 podem prosseguir).
  - [x] 0.2 `pnpm db:status` (da `900-3c`) contra `trifold-crm-dev` — confirmar migration `247`
    aplicada. Colar saída no Dev Agent Record. **Ainda não medido pelo `@po`** (ele mediu `246`
    via `pg_index` na rodada 2, não `247` — este item continua de pé, não vira redundante).
  - [x] 0.3 Confirmar (leitura, `SELECT id FROM organizations WHERE slug = 'org-teste-epic-900'`)
    que a org canário da AC14 existe. **Já pré-verificado pelo `@po` na rodada 2** (org ativa,
    `whatsapp_config` inactive sem token, `meta_capi_outbox` vazia) — reconfirmar no dia, não
    pular por confiar no parecer.

- [x] **Task 1 — Auditoria de Camada A (AC1) — @dev — DESBLOQUEADA, roteada pelo `@po` na rodada 2
  (nenhum dos achados N1-N4 a toca; não precisa esperar a v0.3)**
  - [x] 1.1 Rodar as 3 mutações nomeadas contra a suíte atual (`webhook-org.test.ts`,
    `meta-ads-intelligence/route.test.ts`), colar resultado real.
  - [x] 1.2 Medir se `webhook/whatsapp/route.test.ts`/`webhooks/meta-ads/route.test.ts` já
    afirmam HTTP 200 no branch `unresolved` sob `identifier`; se não, adicionar.

- [x] **Task 2 — `TEST-004` (AC2) — @dev — DESBLOQUEADA, roteada pelo `@po` na rodada 2 (idem
  Task 1)**
  - [x] 2.1 Migrar `admin-invite.test.ts` para `criarFakeSupabase`/`resultadoSingular`.
  - [x] 2.2 Migrar `resend-admin-invite/route.test.ts` da mesma forma.
  - [x] 2.3 `pnpm test` dos dois arquivos — colar contagem antes/depois.
  - [x] 2.4 Fechar `[TEST-004]` em `docs/backlog.md` (mover para "Resolvidos" ou remover, com o
    commit desta story referenciado).

- [x] **Task 3 — `tests/tenancy/` + `vitest.tenancy.config.ts` + guardas (AC3, AC3b) — @qa**
  - [x] 3.1 Criar `vitest.tenancy.config.ts`, **com o alias `@trifold/shared` (D1)** e o
    carregamento de `.env.teste` no topo do arquivo (D2/AC3b.1).
  - [x] 3.2 Criar `tests/tenancy/support/` (ou local equivalente) com
    `confirmarDestinoDeTeste()` e a checagem de credenciais.
  - [x] 3.3 `package.json` (raiz): script `test:tenancy`.
  - [x] 3.4 Verificar as duas guardas isoladamente (sem credencial → skip; ref inventado → falha
    nomeada) antes de escrever qualquer assertion.
  - [x] 3.5 Teste de vivacidade do import (`ehRefDeProducao("dsopqkqjkmhytudaaolv") === true`) —
    verde, sozinho, antes de qualquer asserção de banco (D1).
  - [x] 3.6 **AC3b:** colar no Dev Agent Record a contagem real de testes (não "verde" solto);
    rodar o controle positivo (quebrar uma asserção, colar o vermelho, reverter).

- [x] **Task 4 — Fixtures A/B + provisionamento (AC4, AC5) — @qa**
  - [x] 4.1 `beforeAll`: canário (AC14, agora incluindo `meta_capi_outbox` — mas ver Task 8, que
    tem canário PRÓPRIO em arquivo separado) + `provision_org` × 2 + idempotência.
  - [x] 4.2 Seed verificado (AC5).

- [x] **Task 5 — UNIQUE (AC6) — @qa**
  - [x] 5.1 Controle positivo (A/B com telefones distintos, sem erro).
  - [x] 5.2 `whatsapp_config_phone_ativo`, com `error.message` nomeando a constraint (D3).
  - [x] 5.2b `whatsapp_config_phone_ativo` **isolado de verdade** — org C própria (provisionada e
    desmontada dentro do bloco, `"PA"` repetido, sem outra linha própria de C) — remove a
    dependência de ordem de OID que o caso 5.2 sozinho tinha (Menor 7).
  - [x] 5.3 `whatsapp_config_org_ativo` isolado (linha extra na org B com `"PB2"` — bônus de
    simetria do parecer), com `error.message` nomeando a constraint (D3).
  - [x] 5.4 `org_integrations_meta_page_ativo`, com `error.message` nomeando a constraint (D3).

- [x] **Task 6 — WhatsApp (AC7, AC8, AC10) — @qa**
  - [x] 6.1 Helper de payload + HMAC de teste (compartilhado entre AC7/AC8/AC10).
  - [x] 6.2 Redirecionamento de env para o handler real enxergar `trifold-crm-dev` — documentar
    exatamente quais vars e o `beforeEach`/`afterEach` que restaura.
  - [x] 6.3 AC10: `runId` único por execução (`beforeAll`), sem `.maybeSingle()`/`.single()` em
    nenhuma leitura de verificação, `{ data, error }` sempre desestruturados juntos (D5).

- [x] **Task 7 — Meta Ads (AC9) — @qa**

- [x] **Task 8 — `meta-capi-dispatch` (AC11) — @qa — arquivo PRÓPRIO
  `tests/tenancy/capi-dispatch.test.ts` (D6)**
  - [x] 8.0 Pré-condição que ABORTA se houver `meta_capi_outbox` `pending` de outra org (D7) —
    roda antes de provisionar A/B deste arquivo.
  - [x] 8.1 Fixtures A/B **próprias** deste arquivo (slugs `-capi`), canário próprio.
  - [x] 8.2 Stub de `sendCapiEvents` via `vi.spyOn` (não `vi.mock`), capturando `(events, options)`
    — contrato corrigido (D6).
  - [x] 8.3 Fixtures de lead + outbox.
  - [x] 8.4 Teardown próprio (mesmo padrão da AC14, replicado, não compartilhado).

- [x] **Task 9 — isolamento de erro (AC12) — @qa**
  - [x] 9.1 Redirecionamento de env **antes** de chamar `forEachActiveOrg` diretamente — faltava
    na v0.1 (D9).

- [x] **Task 10 — `daily-report` (AC13) — @qa**
  - [x] 10.1 Stub de `sendDailyReport` via `vi.spyOn` — nenhuma org (nem A/B, nem terceiros)
    recebe `fetch` real à Graph API (D7).
  - [x] 10.2 `TELEFONE_FIXTURE_900_25` em formato BR válido que sobrevive a `normalizePhoneBR`
    (ex. `"11999990000"`) — nunca um valor "sem forma" (N4). Asserção compara contra a forma
    **normalizada**, nomeando na AC por que a normalização acontece no meio do caminho.
  - [x] 10.3 `DAILY_REPORT_ORG_ID = orgAId` — justificativa corrigida: `trifoldOrgId()` resolve
    para o canário, não "não resolve nada" (N3).

- [x] **Task 11 — teardown com canário (AC14) — @qa**
  - [x] 11.0 Derivar a lista de tabelas RESTRICT via `pg_constraint` em runtime (query da AC14) —
    **nunca hardcodear** os nomes das tabelas no código do teardown (N1). Colar no Dev Agent
    Record a lista que a query devolveu no dia da execução, como registro histórico, não como
    fonte.
  - [x] 11.1 Limpar cada tabela da lista derivada por `org_id IN (orgAId, orgBId)`, checando
    `error` de cada delete, **antes** de deletar `organizations` (D4); se `error` mesmo assim, é
    uma 5ª FK RESTRICT nova — falhar nomeando, registrar dívida em `docs/backlog.md`.
  - [x] 11.2 Consumir o array de ids `org_id: null` capturado pela AC10 (`system_events` +
    `webhook_logs`), deletando por id — fecha o handoff que a v0.2 prometia e não entregava
    (Menor 5).
  - [x] 11.3 `DELETE FROM organizations` — checar `error`.
  - [x] 11.4 Asserção de teardown bem-sucedido (`orgsRemanescentes.toHaveLength(0)`), independente
    do canário (D4).
  - [x] 11.5 Documentar por escrito, na AC, que `webhook_logs.org_id` é `SET NULL` (não apagado —
    anulado) e que isso é resíduo aceitável, não corrupção (N1).

- [x] **Task 12 — não-regressão (AC15) — @qa**
  - [x] 12.1 `git diff --stat main...HEAD` — colar, confirmar padrão de arquivos.

---

## Dev Notes

### Como o handler real enxerga `trifold-crm-dev` dentro do teste

`createAdminClient()` (`packages/web/src/lib/supabase/admin.ts`) lê `SUPABASE_URL` (ou
`NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SERVICE_ROLE_KEY` — **não** `TENANCY_TEST_SUPABASE_URL`.
Para as ACs que invocam o `POST`/`GET` de uma rota real, ou qualquer helper que chame
`createAdminClient()` internamente — **AC7, AC8, AC9, AC10, AC11, AC12 (corrigido, D9 — `for-each-
org.ts:132` chama `createAdminClient()` para listar orgs), AC13** —, o teste precisa setar
`process.env.SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` para os valores
de `TENANCY_TEST_SUPABASE_URL`/`TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY` **dentro** do bloco do
teste (`beforeEach`/`afterEach` restaurando o valor anterior — não um `beforeAll` global do
arquivo, para o vazamento de env entre `describe` blocks não contaminar um teste que não deveria
tocar rede nenhuma). **Sempre depois de `confirmarDestinoDeTeste()` já ter validado o ref** — a
ordem importa: primeiro confirma que `TENANCY_TEST_SUPABASE_URL` não é produção, só então copia o
valor para as vars que o código de produção lê. (Achado D9 do parecer do `@po`: a v0.1 esquecia
a AC12 desta lista.)

### Por que não existe uma Camada B para `webhooks/landing-page`/`telegram/webhook`

Ver Scope OUT — decisão, não esquecimento.

### `vi.spyOn`, não `vi.mock`, para stubar transporte externo (D6)

`vi.mock(especificador, factory)` é **hoisted** pelo Vitest — a substituição vale para o
**arquivo inteiro**, incluindo qualquer outro import do mesmo especificador em qualquer outra
parte do arquivo (a guarda da AC3 importa `ehRefDeProducao` do mesmo `@trifold/shared` que a AC11
mockaria para interceptar `sendCapiEvents` — no mesmo arquivo, a guarda deixaria de ser real sem
ninguém perceber). `vi.spyOn(namespaceImportado, "nomeDoExport").mockImplementation(...)` não é
hoisted, afeta só o export nomeado, e se restaura com `.mockRestore()` — por isso é o padrão desta
story tanto para `sendCapiEvents` (AC11, em arquivo próprio por segurança extra) quanto para
`sendDailyReport` (AC13, no mesmo arquivo das demais ACs — seguro porque `vi.spyOn` não vaza para
o resto do arquivo do jeito que `vi.mock` vazaria).

### Regra de leitura desta story inteira (D5): nunca desestruturar só `data`

Toda query de verificação em `tests/tenancy/**` lê `{ data, error }` e afirma `error` nulo (ou o
código esperado) antes de usar `data`. É a mesma causa raiz que a `900-24` existe para fechar
(`error` descartado na desestruturação `const { data } = await …`) — não pode sobreviver dentro da
suíte que prova que ela foi fechada. Nenhum `.maybeSingle()`/`.single()` em leitura de verificação
desta suíte (Camada B só usa esses terminais dentro do código de PRODUÇÃO sob teste — nunca no
código do teste em si); preferir `.order(...).limit(1)` com `toHaveLength(1)` explícito.

### `provision_org` na Camada B vs. na `900-22b`

A `900-22b` já chama `provision_org` pela camada de rota (`/platform/orgs/new` → `provisionOrg()`
→ RPC). Esta story chama a RPC **diretamente** (`admin.rpc("provision_org", {...})`), sem passar
pela rota HTTP de `/platform` — decisão correta para esta story: o objeto sob teste é o
comportamento multi-tenant de webhooks/crons, não o fluxo de convite de admin (isso é
responsabilidade da `900-22b`, já testada lá). Chamar a rota inteira aqui duplicaria cobertura sem
acrescentar nada à pergunta que esta story faz.

### Testing Standards
- Framework: Vitest — mas com **dois** comandos distintos: `pnpm test` (padrão, sem rede) e
  `pnpm test:tenancy` (Camada B, com rede + service-role). Nunca confundir os dois no Dev Agent
  Record — colar sempre qual comando gerou qual saída.
- **`pnpm test:tenancy` verde só conta se a contagem real de testes executados for colada (AC3b —
  D2).** `0 passed | N skipped` não é sucesso, é a reprovação que a story existe para evitar.
- Toda asserção contra `trifold-crm-dev` é sobre as entradas nomeadas por id (`orgAId`/`orgBId`),
  nunca sobre contagem/estado total do banco compartilhado (Context, "por que a Camada B não
  pode…").
- **Nunca desestruturar só `data`** em nenhuma query de verificação (Dev Notes, regra D5) — sempre
  `{ data, error }`, sempre afirmar `error` antes de usar `data`.
- `vi.spyOn` (nunca `vi.mock` compartilhado) para qualquer stub de transporte externo dentro de um
  arquivo que também contenha a guarda de destino ou outras ACs (Dev Notes, D6).

---

## Testing

### Abordagem
1. `pnpm test` (raiz) — Camada A inteira (incluindo AC1/AC2 desta story), sem rede. Gate normal.
2. `pnpm test:tenancy` — Camada B (AC3-AC14), manual/local nesta story, contra `trifold-crm-dev`
   real. Sem credencial → skip limpo (AC3). **Sem asserções executadas → reprovação (AC3b, D2)**,
   nunca lido como "passou".
3. **Controle positivo de vivacidade (AC3b, obrigatório uma vez):** quebrar deliberadamente uma
   asserção de banco já escrita, rodar, colar o vermelho no Dev Agent Record, reverter.
4. `pnpm test:tenancy` rodado **duas vezes seguidas** (idempotência ponta a ponta) — a segunda
   execução não pode falhar por "slug já existe" nem deixar o canário divergente; é o teste da
   AC4 e da AC14 juntas, na prática, não só isoladas. **Só passa a ser um teste válido depois da
   correção D4** — na v0.1, o teardown quebrado fazia a 2ª execução falhar sempre, na AC errada
   (AC5, não AC14/AC4).
5. `tests/tenancy/capi-dispatch.test.ts` (AC11) roda **separadamente** — arquivo próprio, com o
   próprio `beforeAll`/`afterAll` (D6) — não é coberto pelas execuções 2/4 acima.

---

## Change Log

| Data | Versão | Descrição | Autor |
|---|---|---|---|
| 2026-08-30 | 0.6 | **Resposta ao gate `@qa` (CONCERNS, merge liberado).** **QA-900-25-1 corrigido** — o 17º instrumento cego, e o único da onda vindo de **limite de transporte**: o canário contava com `select("id").length` e `max_rows=1000` o fazia **saturar**, ficando VERDE sob a mutação que ele existe para pegar (medido pelo `@qa`: `3 failed` sem teto → `2 failed` com teto). Contagem passa a ser **agregada** (`count: "exact", head: true`) nos dois lugares que comparam contagens (canário e as metades "a outra empresa ficou inalterada"), **sem** perder a repetição só-para-transporte — o gate avisou para não trocar um problema pelo outro. Carrasco contra a regressão: `count === null` lança nomeando; dois vermelhos medidos + 5 asserções permanentes. **Menor do gate corrigido e ele estava certo:** a lista do canário vinha da fallout de UMA mutação, não do write-set — **`activities` faltava** (alvo de INSERT do `process-lead`, e havia 8 linhas dentro do canário que ninguém via). Lista rederivada do write-set, com critério escrito, 8 tabelas; carrasco de `activities` medido. Registrado que **`conversations` não tem carrasco possível** sem perturbar o canário. **QA-900-25-2 e o risco do ledger registrados em `docs/backlog.md` com dona `@devops`** (`MNT-001-B`, P1; ledger, P2) — e medi que reaplicar `246`/`247` é seguro (DDL idempotente), o risco residual é genérico. Resíduo dos experimentos apagado do canário **por id** (12 `activities`, 4 `leads`, 9 `webhook_logs`); canário invariante em 3 execuções limpas. `pnpm test:tenancy` → **30 passed / 0 skipped**. | @dev (Dex) |
| 2026-08-30 | 0.5 | **Tasks 0 e 3-12 implementadas pelo `@dev` (AC3-AC15 marcadas) — a Camada B existe e roda.** `pnpm test:tenancy` → **30 passed / 0 skipped**, em duas execuções seguidas (idempotência ponta a ponta). Controle positivo de vivacidade executado e colado (AC3b.3): mutação `orgBId`→`orgAId` na asserção central ⇒ `1 failed`, `AssertionError`, revertida byte-a-byte. **A AC9 ganhou o segundo sentido** por autocrítica, com a mutação "o resolver sempre devolve A" medida no código de produção (sentido A verde, sentido B vermelho) e revertida. As duas guardas medidas nos DOIS caminhos (sem `.env.teste` ⇒ skip, exit 0; `.env.teste` presente com var vazia ⇒ **throw**, exit 1). Lista de FKs bloqueantes **derivada de `pg_constraint` em runtime** — devolveu exatamente as 4 do parecer, incluindo `financial_notification_log`. **5 achados registrados nas Completion Notes**, sendo um de segurança: a guarda de destino escrita na AC3 **falhava aberta** para ref fora das duas allowlists, e o exemplo da própria AC mascarava o furo pelo hífen. Também: `messages` não tem `org_id` (AC8 insatisfazível como escrita — atendida pelo join com `conversations`), e `pnpm db:status` reporta `246`/`247` **PENDENTE** no ledger enquanto o catálogo diz que os objetos existem. | @dev (Dex) |
| 2026-08-30 | 0.4 | **Tasks 1 e 2 implementadas pelo `@dev` (AC1 e AC2 marcadas).** AC2: os 2 fakes cegos do `TEST-004` migrados para `criarFakeSupabase`; contagem idêntica (33 + 15 = 48 antes e depois); grep de fechamento nas duas formas → 0 ocorrências (controle: 2 e 1 contra os blobs de `origin/main`); `[TEST-004]` movido para "Concluído" no `docs/backlog.md`. AC1: as 3 mutações do Passo 6 rodadas e medidas (4, 5 e 2 vermelhos, todos `AssertionError`), e a lacuna do 3º receptor fechada com `webhooks/meta-ads/route.test.ts` **novo** (3 testes), cujo carrasco foi provado com a mutação que a própria AC1 nomeia. **3 achados registrados nas Completion Notes**, sendo um bloqueante de base: o substrato das duas tasks **não existe em `origin/main`** — a Decisão 2 do parecer foi medida na árvore da `900-24`. Extensões justificadas no fixture (`erroPorEscrita`, `resultadoMaybeSingle`). | @dev (Dex) |
| 2026-08-30 | 0.3 | **Correções N1-N4 + Menores 5-8 aplicadas pelo `@sm`, condição do GO condicional (rodada 2, `docs/qa/po-validation-900-25.md`).** **N1** AC14: a lista de FKs RESTRICT deixa de ser hardcoded — deriva de `pg_constraint` em runtime (`confdeltype NOT IN ('c','n')`), lista escrita vira comentário datado; tabela de fatos corrigida (4 RESTRICT incl. `financial_notification_log`, 87 CASCADE, `webhook_logs.org_id` é o único SET NULL); documentado que `webhook_logs` das AC7/AC9 fica com `org_id` anulado (resíduo aceitável, não corrupção) ao deletar as orgs. **N2** AC3 Guarda 2 reescrita: arquivo `.env.teste` ausente ⇒ `skip` (legítimo); arquivo presente mas vars não chegaram a `process.env` ⇒ `throw` nomeando a causa — fecha a janela em que a correção do D2 "escorregava" de volta ao defeito da v0.1. **N3** Context lição 1 e a justificativa da AC13 corrigidas: `trifoldOrgId()` RESOLVE em `trifold-crm-dev`, para a própria org canário — o override de `DAILY_REPORT_ORG_ID` continua certo, mas por uma razão mais séria (evitar contaminar o canário, não "org inexistente"). **N4** AC13: `TELEFONE_FIXTURE_900_25` trocado para um valor que sobrevive a `normalizePhoneBR` (`"11999990000"`), com a asserção comparando a forma normalizada — evita que a metade positiva da prova morra por descarte silencioso ou por um relaxamento futuro para `toBeDefined()`. **Menor 5**: handoff AC10→AC14 agora de fato consumido (array `idsComOrgIdNuloDaAC10`). **Menor 6**: loader de `.env.teste` ganha guarda defensiva para Node < 20.12/21.7, com nota sobre a divergência do requisito documentado em `CLAUDE.md`. **Menor 7**: AC6 ganha caso 5.2b (org C isolada) removendo a dependência de ordem de OID do caso 5.2. **Menor 8**: Complexity "G" reconfirmada por escrito. **Tasks 1 e 2 reatribuídas a `@dev`** (roteamento do `@po`, sem relação com N1-N4). | @sm (River) |
| 2026-08-30 | 0.2.1 | **Revalidação do `@po` — 🟢 GO condicional (rodada 2), 9.0/10.** `docs/qa/po-validation-900-25.md`, Rodada 2. **D1-D9 fechados**, sete deles verificados **executando**: o alias resolve o subpath (`Tests 2 passed`); `.env.teste` chega aos workers (`credenciaisPresentes=true`); o Postgres nomeia a constraint na mensagem (`duplicate key value violates unique constraint "probe_phone_ativo"`, medido em `TEMP TABLE` com `ROLLBACK`), então a AC6 fica vermelha se o índice sumir; `vi.spyOn` no barrel `@trifold/shared` (dois níveis de `export *`) **intercepta o call site real** — `chamadas_capturadas=1` —, idem para `sendDailyReport`. **4 achados novos para a v0.3, antes da Task 3:** **N1** (13º instrumento cego) a lista de FKs RESTRICT da AC14 é hardcoded a partir de grep em migration e já está errada contra `pg_constraint`; **N2** a correção do 12º cego é de uma vez só — sem `.env.teste`, `pnpm test:tenancy` volta a `exit 0` com 2 asserções falsas puladas; **N3** a lição 1 do Context é falsa (`trifoldOrgId()` é o id do canário no dev); **N4** o telefone-fixture da AC13 é descartado por `normalizePhoneBR`. **Tasks 1 e 2 liberadas para o `@dev` hoje** — nenhum dos quatro achados as toca. | @po (Pax) |
| 2026-08-30 | 0.2 | **Correções aplicadas pelo `@sm` em resposta ao parecer NO-GO (`docs/qa/po-validation-900-25.md`).** As 5 obrigatórias: **D1** alias `@trifold/shared` acrescentado a `vitest.tenancy.config.ts` (AC3) + teste de vivacidade do import; **D2** AC nova (**AC3b**) exigindo carregamento executável de `.env.teste` (sem dependência `dotenv` nova), contagem real de testes no Dev Agent Record, e controle positivo de vivacidade; **D3** AC6 reescrita — discriminante por nome de constraint (`error.message`) nos 3 índices, mais o caso isolado de `whatsapp_config_org_ativo` (bônus de simetria); **D4** AC14 reescrita — teardown limpa as 3 tabelas com FK RESTRICT (`system_events`, `visit_feedback`, `agent_media_assets`) por id antes de deletar `organizations`, com asserção own de "teardown sucedeu" independente do canário; **D5** AC10 reescrita — identificador único por execução (`runId`), zero `.maybeSingle()`/`.single()` em leitura de verificação, `{ data, error }` sempre juntos. As 4 recomendadas: **D6** AC11 movida para arquivo próprio (`tests/tenancy/capi-dispatch.test.ts`), stub trocado de `vi.mock` para `vi.spyOn` com contrato corrigido (`events, options`); **D7** AC11 ganha pré-condição que aborta se houver `meta_capi_outbox` pendente de terceiros, AC13 stuba `sendDailyReport` inteiro (nenhuma org recebe envio real); **D8** grep de fechamento da AC2 corrigido para casar os dois padrões distintos dos dois fakes; **D9** AC12 adicionada à lista de redirecionamento de env (Dev Notes). Reparos menores m1-m5 aplicados. **Decisão 1 do `@po` (numeração) e Decisão 2 (bloqueio parcial, campos de Metadata) incorporadas** — Numeração encolhida para 3 linhas + link ao epic; Metadata ganha os campos `Blocked by`/`Desbloqueado desde já`. | @sm (River) |
| 2026-08-29 | 0.1.1 | **Validação do `@po` — 🔴 NO-GO (rodada 1), 7.5/10.** Parecer completo em `docs/qa/po-validation-900-25.md`. 5 correções obrigatórias, todas medidas executando: **D1** o import da guarda da AC3 (`@trifold/shared/constants/supabase-refs`) não resolve a partir de `tests/` — falta alias no config; **D2** o 12º instrumento cego — vitest não lê `.env.teste`, logo `pnpm test:tenancy` sai **exit 0 com 0 asserções executadas** (medido: `2 skipped`, exit 0, escondendo `expect(1).toBe(2)`); **D3** a AC6 (o coração da story) é **verde por colinearidade** — o insert duplicado usa `org_id: orgAId`, que viola também `whatsapp_config_org_ativo`, então `code === '23505'` ficaria verde mesmo sem o índice que a AC existe para provar; **D4** o teardown da AC14 **não pode dar certo** — `system_events.org_id` é FK RESTRICT (migration `009:6`) e `forEachActiveOrg`/`logOrgResolved` gravam lá com o id das fixtures, e o canário é incapaz de perceber; **D5** a AC10 não é idempotente (identificador constante + artefatos com `org_id: null` inapagáveis por id + `error` descartado na desestruturação). **Decisão 1 (numeração):** `900-25` fica com o Passo 6; o roteiro de produção do epic §857 **dobra para `900-32`**, sem número novo — registrado em `epic-900-saas-multi-tenant.md` §857 e §952. **Decisão 2 (bloqueio):** procede, mas é **parcial** — Tasks 1-2 (Camada A/`TEST-004`) não dependem de merge nenhum e ficam liberadas. | @po (Pax) |
| 2026-08-29 | 0.1 | Draft inicial — Onda 2, Fatia 4 (Passo 6 do plano). Numeração `900-25` resolvida contra a colisão com o roteiro de produção do epic §857 (ver seção "Numeração"). Dependência das 4 fatias anteriores (`900-3c`/`900-21b`/`900-23`/`900-24`) declarada como bloqueante para implementação, não só para merge. | @sm (River) |

---

## Dev Agent Record

*(preenchido pelo @dev/@qa durante a implementação)*

### Agent Model Used

claude-opus-5 (1M) — `@dev` (Dex), modo YOLO, 2026-08-30. Escopo executado: **somente Tasks 1 e 2**.
Tasks 0 e 3-12 não foram tocadas.

**Rodada 2 (mesmo dia):** claude-opus-5 (1M) — `@dev` (Dex), modo YOLO, 2026-08-30. Escopo
executado: **Tasks 0 e 3-12** (AC3-AC15). Branch `story/900-25-prova-duas-empresas-ambiente-teste`,
criada a partir de `origin/main` (`aa584dfb`) — que agora contém `900-3c`, `900-21b`, `900-23`,
`900-24` e as Tasks 1-2 desta story. Nenhum `git push`, nenhum PR.

### Debug Log References

**Base da branch — AUTO-DECISÃO, e o achado que a motivou.** A missão pedia branch a partir de
`origin/main` (`77f225d1`). Medido antes de escrever qualquer linha (`git ls-tree` / `git cat-file -e`,
não suposição):

| artefato que AC1/AC2 exigem | `origin/main` | tip do PR #528 (`124ba608`) |
|---|---|---|
| `lib/tenancy/__fixtures__/fake-supabase-postgrest.ts` (o fixture da AC2) | **AUSENTE** | presente |
| `lib/tenancy/webhook-org.test.ts` (mutação 1 da AC1) | **AUSENTE** | presente |
| `app/api/cron/meta-ads-intelligence/route.test.ts` (mutação 2 da AC1) | **AUSENTE** | presente |
| `WEBHOOK_ORG_ROUTING` (o modo `identifier` da AC1) | **0 ocorrências** em `packages/`+`scripts/` | 7 arquivos |
| `[TEST-004]` em `docs/backlog.md` (Task 2.4) | **AUSENTE** | presente |
| `lib/tenancy/admin-invite.test.ts` e `.../resend-admin-invite/route.test.ts` (os 2 alvos) | presentes | presentes |

Comandos: `git ls-tree origin/main -- <path>`, `git cat-file -e origin/main:<path>`,
`git grep -l WEBHOOK_ORG_ROUTING origin/main -- packages scripts`,
`git log --oneline --diff-filter=A -- <fixture>` → `20a4eaf6` (`[Story 900-24]`).

Só os **dois arquivos que a AC2 modifica** estão em `main`; tudo que ela e a AC1 **consomem** vive
no PR #528. Branchear de `77f225d1` deixaria AC1 inteiramente insatisfazível e AC2 sem o fixture
para o qual migrar. Base escolhida: **`124ba608`** = `main` + a dependência declarada na própria
Metadata (`Blocked by: #528`) — mesmo desvio mínimo que a `900-23` fez com o `e8ea5433` do #526.
**Ordem de merge passa a ser obrigatória: #528 antes deste PR.**

**Task 1.1 — as 3 mutações do Passo 6, rodadas.** Nenhuma foi aceita sem antes excluir erro de
compilação: as 11 falhas são `AssertionError` (só uma `TypeError` derivada, em cascata da mesma
mutação), nunca `ReferenceError`/`SyntaxError`.

| # | Mutação, aplicada ao código de produção | Alvo | Resultado |
|---|---|---|---|
| 1 | "o resolver sempre devolve a org A": `resolveOrgByWhatsAppPhone` volta a `.maybeSingle()` **sem** `.eq("phone_number_id", …)` | `lib/tenancy/webhook-org.test.ts` | **4 vermelhos / 46** — inclui `2 configs ativas com o MESMO telefone → ambigua, quantidadeEncontrada === 2` e `usa .limit(2) como terminal — nunca .maybeSingle()/.single()` |
| 2 | "restaurar `accounts[0].org_id`": o agrupamento por org vira `Map.set(accounts[0]!.org_id, accounts)` | `app/api/cron/meta-ads-intelligence/route.test.ts` | **5 vermelhos / 7** — o teste verbatim `🔴 processa as DUAS orgs — reverter para accounts[0].org_id deixa isto vermelho` cai em `expected 1 to be 2` |
| 3 | "`unresolved` devolvendo 500 em vez de 200": o ramo `if (!config)` da rota do WhatsApp responde `500` | `app/api/webhook/whatsapp/__tests__/route.test.ts` | **2 vermelhos / 23** — `modo identifier sem correspondência: 200, nenhum lead, WEBHOOK_ORG_UNRESOLVED aguardado` e `a escrita de WEBHOOK_ORG_UNRESOLVED COMPLETA antes de a rota responder` |

Todas revertidas por cópia byte-a-byte do original; `grep -rn "MUTACAO " packages/web/src scripts` → 0,
e `git status --short` dos 6 arquivos de produção envolvidos → vazio.

**Task 1.2 — os dois receptores da "task obrigatória" da AC1.**

- **WhatsApp: JÁ EXISTIA** — não foi duplicado. O arquivo real é
  `app/api/webhook/whatsapp/__tests__/route.test.ts` (a AC cita
  `webhook/whatsapp/route.test.ts`, que não existe nesse caminho). Citando o teste, não a linha:
  `it("modo \`identifier\` sem correspondência: 200, nenhum lead, WEBHOOK_ORG_UNRESOLVED aguardado")`,
  no `describe` de dual-run. Carrasco provado pela mutação 3 acima.
- **Meta Ads: NÃO EXISTIA — arquivo criado.** `app/api/webhooks/meta-ads/route.test.ts` não existia
  em ref nenhum (`git ls-tree -r origin/main`/`HEAD` → zero blobs); aquele receptor não tinha
  **nenhum** teste. Criado com 3 testes. Carrasco provado com a mutação que a AC1 escreve ao pé da
  letra (resolver antes de responder e devolver `5xx` quando não resolve): **2 vermelhos / 3**,
  `expected 500 to be 200` nos dois. O terceiro (controle negativo, assinatura inválida → 403)
  **fica verde sob essa mutação** — prova que ele discrimina outra coisa e não é colinear.

**Task 2.3 — contagem antes/depois.**

| | `admin-invite.test.ts` | `resend-admin-invite/route.test.ts` | total |
|---|---|---|---|
| antes (blobs de `HEAD`) | 33 | 15 | **48 passed** |
| depois da migração | 33 | 15 | **48 passed** |

Suíte completa: **285 files / 3659 passed + 6 expected fail**. Baseline medido movendo só o arquivo
novo para fora e rodando de novo: **284 files / 3656 passed + 6 expected fail** — a diferença é
exatamente `+1 file / +3 tests`, o arquivo da Task 1.2. Nenhuma regressão.

**Régua de fechamento da AC2 (as duas formas, correção D8).**
`grep -nE "\[0\] \?\? null"` nos dois arquivos → **0 ocorrências**. Controle de vivacidade da
própria régua contra os blobs de origem: `git show HEAD:<arquivo 1>` → **2**, `<arquivo 2>` → **1**.
Sem esse controle, "0 ocorrências" seria compatível com um regex que não casa nada.
*(Nota de processo: na primeira passada a régua deu 4 hits — todos dentro dos comentários que eu
mesmo escrevi citando o molde antigo. A régua mede o arquivo, então quem se move é o texto, não a
régua: os comentários passaram a descrever o colapso sem reproduzir a forma literal.)*

**Validações.** `pnpm lint --force` → 0 errors / 30 warnings, **nenhum** nos 4 arquivos desta fatia.
`pnpm type-check --force` → 8/8 tasks OK. Sobre "`tsc` de `scripts/` à mão": **não existe instrumento
satisfazível** neste repo — não há `tsconfig.scripts.json`, o `ci.yml` só roda `pnpm type-check`
(turbo, por pacote), e o `tsconfig.json` da raiz não declara `paths`, então
`npx tsc -p tsconfig.json` acusa **15.015** erros em árvore limpa (14.980 fora de `scripts/`, quase
todos `TS2307` de `@web/*`). `git status --short -- scripts/` → vazio: zero arquivos de `scripts/`
tocados nesta fatia. Produção não foi acessada; nenhum banco foi consultado.

---

## Rodada 2 — Tasks 0 e 3-12 (Camada B)

**Task 0.1 — os PRs.** `gh pr view 525 526 527 528 529 --json state` → **MERGED** nas cinco.
`origin/main` = `aa584dfb`. Branch criada dela; a árvore de trabalho estava em
`story/900-24-…` e **atrás do remoto**, então nada foi commitado lá.

**Task 0.2 — `pnpm db:status`, e o achado que ele produziu.**
```
[db-env] ambiente=teste ref=xnxvygyfyyyzwhiuoehz escreve=false
Ambiente: teste · projeto xnxvygyfyyyzwhiuoehz
aplicada 268 · PENDENTE 2 · ALTERADA-APÓS-APLICAR 0 · ÓRFÃ-no-banco 0
PENDENTE (2):
  246_org_integrations_e_unicidade_whatsapp.sql
  247_org_integrations_check_whatsapp_grafias.sql
```
**O ledger e o catálogo discordam, e quem manda no teste é o catálogo.** Medido por
`pg_index`/`pg_constraint`/`information_schema` em `trifold-crm-dev`, os objetos das duas
migrations **existem**:

| objeto que a AC exercita | catálogo de `trifold-crm-dev` |
|---|---|
| `whatsapp_config_phone_ativo` | presente — `UNIQUE (phone_number_id) WHERE status='active' AND phone_number_id IS NOT NULL` |
| `whatsapp_config_org_ativo` | presente — `UNIQUE (org_id) WHERE status='active'` |
| `org_integrations_meta_page_ativo` | presente — `UNIQUE ((config->>'page_id')) WHERE provider='meta_ads' AND config->>'page_id' IS NOT NULL` |
| tabela `org_integrations` (6 providers, CHECK) | presente |
| `whatsapp_sem_identificador_proprio` | presente **na grafia da `247`** (`phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id`), não na da `246` |
| `provision_org` seções 5 e 6 | presentes (`pg_get_functiondef`), 6 linhas de `org_integrations` |

Causa: a última linha do ledger é `245_registro_de_migrations.sql` (`via=apply`, 2026-08-29
19:01). As `246`/`247` foram aplicadas ao banco de teste **fora** do `db:apply` (durante os gates
da `900-21b`/`900-24`), então o registro não as conhece. O espelho rastreado
`docs/audits/migrations-aplicadas.json` foi **regenerado pelo `db:status` e revertido**
(`git checkout --`), porque a AC15 não o lista e porque snapshotar `PENDENTE: 2` congelaria a
divergência em vez de corrigi-la. **Item para o `@devops`** (Completion Note 5).

**Task 0.3 — canário.** `SELECT id, slug, is_active FROM organizations` →
**uma** linha: `org-teste-epic-900`, ativa. Confere com a rodada 2 do parecer.

**Task 3.4 — as duas guardas, medidas nos dois caminhos.**

| cenário | comando | resultado medido | exit |
|---|---|---|---|
| ref inventado **sem hífen** | `TENANCY_TEST_SUPABASE_URL=https://producaofalsa.supabase.co pnpm test:tenancy` | `tests/tenancy recusa rodar: … NÃO está na allowlist de refs de teste (ref extraído: producaofalsa)` | 1 |
| ref **real** de produção | `…=https://dsopqkqjkmhytudaaolv.supabase.co` | `… (ref extraído: dsopqkqjkmhytudaaolv — e ele é um ref de PRODUÇÃO)` | 1 |
| exemplo literal da AC (com hífen) | `…=https://producao-falsa.supabase.co` | `… (ref extraído: <não reconhecido>)` | 1 |
| `.env.teste` **presente**, var não chega | `TENANCY_TEST_SUPABASE_URL= pnpm test:tenancy` | `Error: … .env.teste existe mas … não chegaram ao process.env — o loader do vitest.tenancy.config.ts quebrou ou a variável foi renomeada.` | **1** |
| `.env.teste` **ausente** (movido e restaurado) | `pnpm test:tenancy` | `Test Files 1 passed \| 2 skipped (3)` · `Tests 3 passed \| 16 skipped (19)` | **0** |

Os três primeiros **só passaram a valer depois da correção da Completion Note 1** — antes dela o
primeiro caso saía num erro de rede da Management API, que é o que a AC proíbe.
O `.env.teste` foi restaurado e conferido byte-a-byte contra a cópia de backup.

**Task 3.5 — vivacidade do alias (D1).** `tests/tenancy/alias-vivo.test.ts`, sem `skipIf`, roda
**3 passed** mesmo sem credencial: `ehRefDeProducao("dsopqkqjkmhytudaaolv") === true`, o controle
negativo (`…("xnxvygyfyyyzwhiuoehz") === false`, `ehRefDeTeste(…) === true` — sem ele um stub
`() => true` passaria) e a normalização de caixa do PR #524.

**Task 3.6 / AC3b.2 — a contagem real, colada, não "verde solto".**
```
 Test Files  4 passed (4)
      Tests  30 passed (30)
```
**30 passed | 0 skipped.** Execuções seguidas (Testing §4), sem reset entre elas: `30 passed` em
todas. Distribuição: `alias-vivo` 3 · `retry-transporte` 10 · `cross-tenant` 15 · `capi-dispatch` 2.

**Task 3.6 / AC3b.3 — controle positivo de vivacidade (o vermelho, colado, depois revertido).**
Mutação: na asserção central da AC7/AC8, `expect(conversas[0]!.org_id).toBe(orgBId)` → `orgAId`.
```
 FAIL  tests/tenancy/cross-tenant.test.ts > … > `PB` → org B recebe; org A fica INALTERADA; e a mensagem É GRAVADA (a asserção central)
AssertionError: expected 'ca532a8c-…' to be '61a7070f-…' // Object.is equality
 ❯ tests/tenancy/cross-tenant.test.ts:568:36

 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 18 passed (19)
```
`AssertionError` — **não** `ReferenceError`/`SyntaxError`/erro de setup: o vermelho é da asserção,
com erro de compilação excluído. Revertida por cópia byte-a-byte (`diff -q` → idêntico,
`grep -c MUTACAO-VIVACIDADE-900-25` → 0).

**Autocrítica que virou trabalho — a AC9 nasceu com UM sentido só, e a mutação prova por quê.**
Na revisão do próprio deliverable notei que eu tinha escrito a AC9 com `PAGE-A` apenas, embora a
AC nomeie os DOIS `page_id` e diga "mesmo padrão da AC7" — e a AC7 é onde a story escreve, com
todas as letras, que *"um resolver que sempre devolve B passaria no primeiro teste sozinho"*. A
AC9 virou `describe.each` com os dois sentidos. Para não aceitar a simetria como promessa, apliquei
ao código de produção a mutação que a própria lição descreve — `resolveOrgByMetaPage` ignora o
`pageId` do payload e filtra pelo literal da org A (`webhook-org.ts`):

| sentido | sob a mutação "sempre devolve a org A" |
|---|---|
| `PAGE-A → org A` | ✓ **VERDE** — e continuaria verde, sozinho, para sempre |
| `PAGE-B → org B` | ✗ **VERMELHO** — `AssertionError: expected '51faced5-…' to be '260643b6-…'` |

Uma primeira tentativa de mutação (remover o filtro e pegar `.limit(1)` por `created_at`) deixou os
**dois** sentidos vermelhos — ela resolvia para o **canário**, não para a org A, e por isso não
discriminava a colinearidade que eu queria medir. A mutação que vale é a segunda. `webhook-org.ts`
revertido por cópia byte-a-byte (`diff -q` idêntico, `grep -c MUTACAO-900-25` → 0,
`git status --short -- packages/` → vazio).

**Task 11.0 — a lista de FKs bloqueantes, DERIVADA em runtime.** Impressa pela própria suíte:
```
[900-25] FKs bloqueantes derivadas de pg_constraint (4): agent_media_assets.org_id,
financial_notification_log.org_id, system_events.org_id, visit_feedback.org_id
```
Bate com o N1 do parecer (**4**, incluindo `financial_notification_log`). Contagem por
`confdeltype` no dia: `a`(NO ACTION)=**4** · `c`(CASCADE)=**87** · `n`(SET NULL)=**1**, e o único
SET NULL é `webhook_logs.org_id` — os três números do N1, reconfirmados. **Nada disso está
hardcoded**: a query também deriva o NOME DA COLUNA (supor `org_id` seria a mesma classe de erro
num grau menor) e aborta nomeando se aparecer FK composta ou fora do schema `public`.

**O canário era CEGO para a classe de defeito que esta story existe para pegar — e quem contou
foi um experimento meu.** A primeira versão de `TABELAS_DO_CANARIO` tinha 4 tabelas
(`organizations`, `whatsapp_config`, `org_integrations`, `meta_capi_outbox`) e eu excluí `leads`
por escrito, com o argumento *"a suíte nunca cria lead no canário, então a contagem seria sempre
constante — asserção sem poder discriminante"*. Ao rodar a mutação `.order("created_at").limit(1)`
em `resolveOrgByMetaPage`, ela resolveu para **o canário** (a org mais antiga do banco). Medido no
banco depois daquela execução:

```
leads:        2 linhas, org_id = 00000000-…-000000000001  (o canário)
webhook_logs: 2 linhas, org_id = 00000000-…-000000000001
```

…e o canário reportou **`depois === antes`, verde**. Ou seja, a asserção "não perturbei nada além
das minhas fixtures" estava cega justamente para **um lead caindo na empresa errada**, que é o
defeito-mãe da onda. `leads`, `conversations` e `webhook_logs` entraram na lista. Reprova medida
com a MESMA mutação:

```
 × AC14 · assertion 11 — teardown por id: apaga o que disse que apagaria, e NADA além
AssertionError: expected { organizations: 1, …(6) } to deeply equal { organizations: 1, …(6) }
```

`system_events` continua fora, e esse motivo permanece medido: `forEachActiveOrg` grava
`CRON_ORG_PROCESSADA` para **toda** org ativa, canário incluído, em toda execução correta —
vermelho legítimo recorrente é o que ensina a ignorar o instrumento.
Todo o resíduo que os meus experimentos deixaram no canário foi apagado **por id** (2+2 leads,
5 `webhook_logs`), e uma execução limpa depois disso deixa `leads: []` e `webhook_logs: []`.

**A suíte era instável, e a instabilidade era de TRANSPORTE — medida, não suposta.** Em 6
execuções consecutivas, **2** morreram com `TypeError: fetch failed` numa leitura de verificação
qualquer (nunca a mesma). Corrigido com `comRetryDeTransporte`, que repete **só** o caso em que
ninguém respondeu. O discriminante é **conjuntivo**: repete apenas se o erro **não tem `code`** E
a mensagem casa um padrão de transporte. Um `{ error }` do PostgREST tem `code` (`23505`,
`PGRST116`, `23503`) — é o banco RESPONDENDO, e repeti-lo transformaria "o Postgres recusou" em
"tenta até dar certo", que é a classe de silêncio que esta onda existe para eliminar.

**Oito execuções seguidas depois do conserto saíram `25 passed` com ZERO repetições disparadas** —
a rede colaborou e o caminho de retry não foi exercitado por nenhuma delas. Mecanismo que só roda
quando dá azar, e que só é observado quando dá azar, é indistinguível de mecanismo quebrado: daí
`tests/tenancy/retry-transporte.test.ts` (5 asserções, sem rede, sem credencial), com dois
vermelhos medidos:

| mutação em `comRetryDeTransporte` | vermelho |
|---|---|
| remover `if (erro.code) return false` | `× mensagem de transporte MAS com \`code\`: não repete` — `expected 3 to be 1` |
| `TENTATIVAS_DE_TRANSPORTE = 1` | `× falha de TRANSPORTE seguida de sucesso` **e** `× falha de TRANSPORTE persistente` |

A primeira mutação derruba **um** dos dois testes de "não repete" — o caso híbrido (mensagem de
transporte **com** `code`). O outro sobrevive porque a mensagem de `23505` não casa o regex. Os
dois não são redundantes: é o híbrido que vigia o `code`.

**Resíduo no banco depois de tudo — medido, não presumido.**
```
orgs restantes:      [{"slug":"org-teste-epic-900","is_active":true}]        ← só o canário
whatsapp_config:     [{"status":"inactive","phone_number_id":null}]          ← só a do canário
meta_capi_outbox:    []
leads / conversas / messages (TOTAIS do banco): 0 / 0 / 0
webhook_logs casando '900-25' ou 'PHONE-DESCONHECIDO': 0
system_events com org_id apontando para org inexistente: 0
system_events casando '900-25': 8 → todas `CRON_RESUMO`, `org_id: null`, uma por execução
```
**Correção do gate (`@qa`), remedida por mim contra o banco: são 4 linhas por execução, não 2.**
Contagem exata antes e depois de UMA execução:

| `event_type` | `source` | `org_id` | antes | depois |
|---|---|---|---|---|
| `CRON_ORG_PROCESSADA` | `api/cron/daily-report` | **canário** | 62 | 63 |
| `CRON_ORG_PROCESSADA` | `tests/tenancy/isolamento-900-25` | **canário** | 62 | 63 |
| `CRON_RESUMO` | `api/cron/daily-report` | `null` | 62 | 63 |
| `CRON_RESUMO` | `tests/tenancy/isolamento-900-25` | `null` | 62 | 63 |

Duas são atribuídas ao canário e duas nascem com `org_id: null` (o resumo é evento de
**plataforma** — `for-each-org.ts` omite o `org_id` de propósito). **Um reparo na nota do gate:**
as `CRON_ORG_PROCESSADA` têm `metadata` vazia, mas **têm `source`** — são identificáveis, ao
contrário do que a nota dizia. Isso não muda o desenho: `forEachActiveOrg` não devolve os ids, e
caçá-las por `source`/janela seria o `DELETE` por predicado que esta story existe para tornar
impossível. A exclusão de `system_events` da lista do canário **fica mantida**, e agora com o
número certo. Resíduo documentado em `tests/tenancy/support/fixtures.ts`, mesma classe do
`webhook_logs` SET NULL (Task 11.5).

**Task 12.1 / AC15 — não-regressão, medida das DUAS formas.** `origin/main...HEAD` (merge-base) e
`origin/main..HEAD` (tip a tip) devolvem o **mesmo** conjunto — a branch está direto sobre a `main`,
sem divergência, então o controle não é redundante: ele é o que prova que o `...` não está medindo
uma base antiga (`feedback_regua_que_mistura_duas_revisoes`).
```
 docs/stories/900-25-…story.md      | 407 ++++++++--
 package.json                       |   1 +
 tests/tenancy/alias-vivo.test.ts   |  50 ++
 tests/tenancy/capi-dispatch.test.ts| 275 +++++++
 tests/tenancy/cross-tenant.test.ts | 860 +++++++++++++++++++++
 tests/tenancy/support/ambiente.ts  | 191 +++++
 tests/tenancy/support/fixtures.ts  | 223 ++++++
 vitest.tenancy.config.ts           |  84 ++
 8 files changed, 2027 insertions(+), 64 deletions(-)
```
Filtrando pelos padrões que a AC15 declara, **zero** arquivos fora deles. `git status --short --
packages/ scripts/ supabase/` → **vazio**: nenhuma mutação de produção sobrou na árvore.

**Validações.**
- `pnpm test` (Camada A, gate de PR): **287 files / 3693 passed + 6 expected fail**. Baseline
  medido **movendo `tests/tenancy/` e `vitest.tenancy.config.ts` para fora e rodando de novo**:
  **287 / 3693 + 6** — idênticos. Prova executada, não inferida, de que esta fatia **não entra**
  no `include` do `vitest.config.ts` (a decisão de desenho da AC3).
- `pnpm lint --force` → **0 errors, 30 warnings**, nenhum em arquivo desta fatia.
- `pnpm type-check --force` → **8/8 tasks OK**.
- ⚠️ **Nem `lint` nem `type-check` cobrem `tests/` na raiz** — provado:
  `npx tsc -p packages/web/tsconfig.json --listFiles | grep -c tests/tenancy` → **0**. É a mesma
  lacuna que o `[MNT-001]` do backlog já registra para `scripts/`, agora com um segundo ocupante.
  Type-check ad-hoc dos 5 arquivos novos, com os aliases da config isolada: **0 erros**.
  **A régua nasceu morta e o controle de vivacidade é quem contou:** na primeira montagem ela
  saía `EXIT=0` com um `const x: number = "string"` plantado — `tsc` abortava antes em
  `TS2688: Cannot find type definition file for 'node'` (o `typeRoots` resolve relativo ao
  arquivo de config, e o config estava fora do repo). Com `typeRoots` explícito, o erro plantado
  **acende** (`fixtures.ts(210,7): error TS2322`) e a árvore limpa sai `EXIT=0` — as duas
  medições, não só a segunda.
- Produção: **nenhum acesso**. Todas as consultas foram a `xnxvygyfyyyzwhiuoehz` (o banner
  `[db-env] ambiente=teste` aparece em cada uma). Nenhum valor de credencial foi ecoado.

### Completion Notes

**1. 🔴 Achado bloqueante de base: a Decisão 2 do parecer foi medida na árvore errada.** O parecer
afirma "Tasks 1 e 2 tocam arquivos que **existem hoje** — verifiquei os três". Os três existem **na
branch da `900-24`**, que era a árvore de trabalho no momento da medição; contra `origin/main`, os
três estão **ausentes** (tabela no Debug Log). O texto da AC2 herda o erro ao chamar o fixture de
"(já existente)". A conclusão prática do parecer continua certa — estas duas tasks não esperam
merge —, mas a razão está trocada: elas não podem ser **branchadas de `main`**. Registrado para o
`@po` corrigir a Metadata (`Desbloqueado desde já` diz "tocam arquivos que já existem em `main`
hoje", o que é falso para 3 dos 5 artefatos citados).

**2. O único vermelho da migração foi um predicado de setup, não uma asserção.** Exatamente o risco
que o `TEST-004` previa. O molde antigo consultava o hook de erro de escrita **só** nas cadeias
`update(...).eq(...)`: `insert(...).select().single()` tinha porta própria (`usersInsert`) que o
ignorava. Sob um fake que trata as duas escritas igual, o predicado `"auth_id" in payload` do teste
`vínculo do auth_id falha → failed` passou a casar **também** com o `insert` de `{ …, auth_id: null }`
— e o teste mediu a falha do insert acreditando medir a do update
(`expected "deadlock" to contain "não foi possível vinculá-la"`). Correção no **setup**: o hook do
fixture recebe a `operacao`, e o predicado virou `operacao === "update" && "auth_id" in payload`.
**Nenhuma asserção foi reescrita.** O outro predicado do arquivo (`"email" in payload`) tinha a
mesma ambiguidade latente e passava por sorte do cenário; foi corrigido junto.

**3. Onde o carrasco do `TEST-004` mora de verdade — medido, para não virar promessa.** Mutando
`resultadoSingular` de volta para a mentira do molde: os 2 arquivos migrados seguem **48/48
verdes**, e quem fica vermelho é **`webhook-org.test.ts`, 5 testes**. Ou seja, o valor da AC2 nunca
foi "estes 2 testes passam a reprovar o defeito" — nenhum deles faz consulta singular com 2+ linhas
—, e sim **remover as duas fontes de cópia da mentira**, deixando o carrasco num lugar só. O
carrasco de vivacidade que a missão pediu foi rodado à parte, com os corpos dos 3 fakes extraídos
verbatim dos blobs e o corpo literal de `legacyResolveActiveConfig` por cima, com 2 linhas
`status='active'`:

```
fake A  admin-invite.test.ts (molde original)          | PROCESSA org_id=org-A | bug reproduz? NAO
fake B  resend-admin-invite (a cópia nº 2)             | PROCESSA org_id=org-A | bug reproduz? NAO
fixture criarFakeSupabase (para onde os dois migraram) | DESCARTA (data=null)  | bug reproduz? SIM

controle (1 linha ativa; os 3 têm que PROCESSAR): A=org-A  B=org-A  fixture=org-A
```

**4. Duas extensões no fixture compartilhado, ambas com o caso na mão (não especulativas).**
(a) `erroPorEscrita(tabela, payload, operacao)` — sem ele, os 2 testes de "só o segundo `update`
falha" seriam **inexpressáveis**, porque `erroPorTabela` derruba a tabela inteira e a leitura do
passo 1 falharia primeiro (o teste passaria a medir outro ramo, verde). (b) `resultadoMaybeSingle` —
a v1 do fixture declarou fora de escopo a diferença de **0 linhas** entre `.single()` e
`.maybeSingle()` sob a premissa escrita "nenhum dos 3 resolvers da `900-24` usa esses terminais…
se um teste futuro precisar, resolve-se então, com o caso na mão". A AC2 invalidou a premissa: os
dois arquivos migrados **são** consumidores de `.maybeSingle()`, e um deles exercita 0 linhas
("org inexistente → 404"). Medido em `@supabase/postgrest-js@2.101.1` (`dist/index.cjs:129-141`):
com 0 linhas `.maybeSingle()` devolve `{ data: null, error: null, status: 200 }`. `resultadoSingular`
**não mudou** — segue sendo o de `.single()` e o carrasco do defeito da `900-24`.

**5. Divergências factuais menores das ACs, para o `@po`/`@sm`.** (a) AC1 cita
`webhook/whatsapp/route.test.ts`; o caminho real é `webhook/whatsapp/__tests__/route.test.ts`.
(b) AC1 trata `webhooks/meta-ads/route.test.ts` como "confirmar ou adicionar" — era **adicionar**,
o receptor não tinha teste nenhum. (c) Naquele receptor a resolução de org roda **dentro do
`after()`**, depois da resposta; o `200` não é consequência de o resolver ser gentil, e sim de a
resolução estar fora do caminho da resposta — é essa separação que o teste novo tranca, e é ela
que a mutação da AC1 quebra.

---

## Rodada 2 — Tasks 0 e 3-12

**1. 🔴 A guarda de destino escrita na AC3 falhava ABERTA — e quem provou foi a verificação da
própria AC3.** O snippet da AC recusa `!ref || ehRefDeProducao(ref)`. Executando o cenário que a
mesma AC prescreve ("ref inventado **fora das duas allowlists**"), medi:

```
TENANCY_TEST_SUPABASE_URL=https://producaofalsa.supabase.co pnpm test:tenancy
→ Error: tests/tenancy: consulta ao catálogo de producaofalsa falhou —
  {"message":"Invalid project ref: producaofalsa"}
```

A guarda **não disparou**: `producaofalsa` não está em `REFS_PERMITIDOS_PRODUCAO`, logo
`ehRefDeProducao` devolve `false` e o ref passa; a suíte só morre depois, num **erro de rede
genérico**, que é literalmente o que a AC proíbe ("a guarda precisa disparar antes de qualquer
`fetch`"). **O exemplo escrito na AC mascarava o furo:** `https://producao-falsa.supabase.co` tem
**hífen**, e o regex de `extrairRefDeUrlSupabase` é `[a-zA-Z0-9]+` — ele devolve `null`, o ramo
`!ref` dispara, e o teste "passa" pelo motivo errado. Um ref alfanumérico expõe o buraco.

Correção: `!ref || !ehRefDeTeste(ref)` — **allowlist**, não negação de denylist. Não é invenção
minha: é o que `packages/shared/src/constants/supabase-refs.ts` já documenta no próprio cabeçalho
(*"um ref que não está em nenhuma das duas listas é recusado, não presumido inofensivo"*), e é a
mesma classe de furo que o PR #524 fechou. É a segunda vez nesta onda que uma guarda de destino
nasce falhando aberta.

**2. 🔴 A AC8 é insatisfazível como escrita: `messages` NÃO tem coluna `org_id`.** Medido no
`information_schema` de `trifold-crm-dev`: `id, conversation_id, role, content, media_url,
media_type, metadata, created_at` — e o `INSERT` da rota (`whatsapp/route.ts`, caminho síncrono)
não passa `org_id`. A AC escreve `expect(msg!.org_id).toBe(orgBId)`, que resultaria em
`undefined !== orgBId`. **A PERGUNTA da AC continua respondível, e é respondida:** o escopo de
organização da mensagem é `messages.conversation_id → conversations.org_id`, e o teste afirma o
join inteiro (mensagem existe pelo `wamid` exato → conversa dela → `org_id` = B → lead da conversa
→ `org_id` = B). Não relaxei para "a mensagem existe": isso mataria metade da prova. Registrado
para o `@sm` corrigir o texto da AC8.

**3. 🟠 O ledger de migrations e o catálogo discordam no banco de teste.** `pnpm db:status`
(Task 0.2) reporta `246` e `247` como **PENDENTE**; o catálogo diz que **todos** os objetos das
duas existem (tabela detalhada no Debug Log — inclusive o CHECK na grafia da `247`, que é o
discriminante entre as duas versões da constraint). A última linha do ledger é
`245_registro_de_migrations.sql`: as duas foram aplicadas **fora** do `db:apply`, durante os gates
das fatias anteriores. **Consequência para esta story: nenhuma** — a Camada B exercita o catálogo,
não o ledger, e as 19 asserções passam. **Consequência para a Onda 3: o `db:status` do
`trifold-crm-dev` não é confiável como pré-condição enquanto isso não for regularizado** — que é
justamente o papel que a Task 0.2 lhe atribuía. Item para o `@devops`: registrar as duas no ledger
(sem reaplicar o DDL) ou documentar por que o banco de teste fica fora do registro.

**4. 🟡 O `console.warn` do skip legítimo não aparece na saída.** No cenário "`.env.teste`
ausente", o `console.warn` do módulo de suporte **não** é impresso pelo reporter default — mesma
coisa que o `@po` já tinha observado no D2. Isto **não** compromete a distinção que o N2 exige,
porque quem separa os dois casos é o `throw` (exit 1) contra o `skip` (exit 0), não a mensagem.
Mas vale escrito: quem depender do aviso visual não vai vê-lo. O sinal confiável é o par
`Tests 3 passed | 16 skipped` + `exit 0` — e note que **não é `0 passed`**: o
`alias-vivo.test.ts` roda sem credencial de propósito, exatamente para que "sem credencial" e
"`include` quebrado" não sejam o mesmo número na tela.

**5. 🟡 Divergências factuais menores, para o `@sm`/`@po`.**
(a) A AC11 escreve o retorno do stub como `{ success: true, events_received: … }`; o tipo real
(`CapiSendResult`) é **`eventsReceived`** — e a rota compara `result.eventsReceived ===
events.length` para decidir `sent`, então a grafia da AC deixaria toda linha em `failed`.
(b) A pré-condição da AC11 usa `.not("org_id","in",…)` com `orgAId`/`orgBId`, mas a Task 8.0 manda
rodá-la **antes** de provisionar as orgs — os ids não existem ainda. Implementei o predicado mais
estrito e mais simples que o momento permite: naquele ponto **qualquer** linha `pending` é de
terceiro.
(c) `meta-capi-dispatch/route.ts` lê `CRON_SECRET` no **escopo de módulo**, não no handler: import
estático da rota faria a AC11 falhar com 500 por artefato de ordem. Resolvido com `await import()`
depois do `aplicarEnv`.
(d) O canário da AC14 fica com **4** tabelas (as que a AC nomeia). `system_events` ficaria vermelho
por motivo legítimo — `forEachActiveOrg` grava `CRON_ORG_PROCESSADA` para **toda** org ativa,
inclusive o canário, nas AC12/AC13 —, e vermelho legítimo recorrente é o que ensina a ignorar o
instrumento.

**7. 🔴 Achei um instrumento cego DENTRO do meu próprio deliverable — o canário.** Eu tinha
excluído `leads` da contagem do canário com uma justificativa escrita ("a suíte nunca cria lead no
canário, logo a contagem é constante e a asserção não discrimina"). A justificativa era uma
alegação, e a mutação que rodei por outro motivo a falsificou: com o resolver quebrado, **2 leads
e 2 `webhook_logs` foram gravados dentro do canário** e o canário ficou **verde**. A asserção
"não perturbei nada além das minhas fixtures" era cega exatamente para *um lead caindo na empresa
errada* — o defeito-mãe da onda. `leads`, `conversations` e `webhook_logs` entraram; a reprova foi
medida com a mesma mutação (Debug Log). **A lição que sobra:** exclusão justificada numa lista de
vigilância é uma alegação como qualquer outra, e o jeito de testá-la é perguntar *"que defeito
REAL escreveria nesta tabela?"*, não *"a suíte correta escreve nesta tabela?"*.

**8. 🟠 A suíte era instável por transporte, e a mitigação precisou de carrasco própria.** 2 em 6
execuções morriam com `TypeError: fetch failed`. `comRetryDeTransporte` repete **só** o caso em
que ninguém respondeu, com discriminante conjuntivo (**sem `code`** E mensagem de transporte) —
porque repetir um `{ error }` do PostgREST seria transformar "o Postgres recusou" em "tenta até
dar certo". Depois do conserto, **8 execuções seguidas verdes com ZERO repetições disparadas**:
o caminho novo não foi exercitado por nenhuma delas. Daí `retry-transporte.test.ts`, que roda
sempre (sem rede, sem credencial) e tem os dois vermelhos colados no Debug Log. Anotado como
observação para o `@qa`: **a Camada B fala com rede, e rede falha** — se o gate vir um
`fetch failed` isolado, a leitura certa é transporte, não regressão; se vir repetição **com**
`code`, aí sim é regressão do discriminante.

**6. Onde a suíte descarta o `after()`, e por que isso não apaga argumento nenhum.** No receptor de
WhatsApp o `after()` é o pipeline da Nicole (Anthropic + Graph API + push ao corretor); a suíte o
**descarta**, porque a asserção central (AC8) mora no caminho **síncrono**, antes do 200 — rodá-lo
dispararia IA e envio real contra um banco compartilhado, a mesma classe de efeito colateral que o
D7 mandou escopar. No receptor de Meta Ads o `after()` **é** o objeto sob teste (a resolução de org
mora dentro dele, via `processMetaLead`), e ali ele é **executado**. A distinção é explícita no
cabeçalho do arquivo, não implícita. Na AC9, `triggerAutomations` e `distributeLeadToNextBroker`
são stubados por `vi.spyOn` pela mesma razão (transporte externo, não o objeto sob teste), e
`field_data` vai inline no payload para `fetchLeadData` não tocar a Graph API — zero chamada
externa em toda a suíte.

---

## Rodada 3 — resposta ao gate `@qa` (CONCERNS, merge liberado)

### QA-900-25-1 — o 17º cego: a prova não observava o próprio teto de leitura. **CORRIGIDO.**

O `@qa` mediu o que eu não: o canário contava com `select("id")` + `.length`, e `max_rows` deste
projeto é **1000**. Simulando a saturação e aplicando a MESMA mutação que o canário existe para
pegar:

```
sem teto simulado : 3 failed | 22 passed  → AC14 VERMELHA
com teto simulado : 2 failed | 23 passed  → AC14 VERDE
```

Os dezesseis cegos anteriores da onda vieram de **lógica**; este veio de **limite de transporte**,
que nenhuma leitura do código revela. E a ironia é minha: o comentário que eu tinha escrito
**recusava** `{ count: "exact", head: true }` "porque o helper de retry só sabe olhar
`{ data, error }`" — escolhendo, sem querer, exatamente a forma que satura.

**A correção não escolheu entre as duas coisas** (o gate avisou para não trocar um problema pelo
outro): `contarComRetryDeTransporte` é contagem **agregada** *com* a mesma disciplina de repetição
só-para-transporte. Aplicada nos **dois** lugares que comparavam contagens — o canário
(`contarLinhasDoCanario`) e as metades "a OUTRA empresa ficou inalterada" das AC7/AC8/AC9
(`contarDaOrg`), que tinham o mesmo defeito: duas contagens saturadas são **iguais entre si**
mesmo com vazamento no meio.

**Carrasco contra a regressão, e ele é o ponto:** `count: "exact", head: true` devolve
`count: number`; qualquer volta para `select()` de linhas devolve `count: null`, e o helper
**lança nomeando**. Dois vermelhos medidos:

| mutação | vermelho |
|---|---|
| canário volta a `select("id")` | a suíte **não roda**: `contagem do canário em organizations: a consulta não devolveu \`count\` — … satura no max_rows (1000) … (QA-900-25-1)`; `13 passed \| 17 skipped` |
| remover o `if (count === null)` do helper | `× \`count: null\` (alguém voltou a contar linhas) LANÇA nomeando a saturação` |

Mais 5 asserções permanentes em `retry-transporte.test.ts` (contagem agregada, `count: 0` válido,
`count: null` lança, transporte repete, erro de banco não repete).

### Menor do gate — a lista do canário vinha da fallout de UMA mutação. **CORRIGIDA, e ela estava mesmo incompleta.**

O gate está certo e o custo apareceu na hora: **`activities` é alvo de INSERT do próprio receptor
sob teste** (`process-lead.ts:422`, `lead_created`, **sempre**) e estava fora — e havia **8 linhas
de `activities` dentro do canário**, deixadas pelos meus experimentos, que nenhuma contagem viu.

A lista passou a ser derivada do **write-set**, com critério escrito: *entra toda tabela com
`org_id` na qual um caminho **síncrono exercitado por esta suíte** faz INSERT/UPSERT*. São **99**
as tabelas com `org_id` no schema (medido) — vigiar as 99 é caro e ruidoso; vigiar "as que deram
problema" é vigiar o passado. Ficou em **8**: `organizations`, `whatsapp_config`,
`org_integrations`, `meta_capi_outbox`, `leads`, `conversations`, **`activities`**, `webhook_logs`.

Carrasco medido para `activities`, com a mutação do lado do Meta Ads (o `process-lead` escreve
`leads` **e** `activities`):
```
AssertionError: expected { organizations: 1, …(7) } to deeply equal { organizations: 1, …(7) }
-   "activities": 2      -   "webhook_logs": 2
+   "activities": 4      +   "webhook_logs": 4
```

**O que NÃO consegui dar carrasco, e por quê — `conversations`.** Tentei pelo lado do WhatsApp
(`resolveOrgByWhatsAppPhone` ignorando o telefone): a mutação **não alcança o canário**, porque o
`whatsapp_config` do canário é `inactive` e o resolver filtra `status='active'`. Para roteá-la ao
canário eu teria que **ativar o `whatsapp_config` do canário** — perturbar exatamente a org que a
suíte promete não perturbar. `conversations` fica na lista por **derivação do write-set**, não por
vermelho demonstrado, e isto está escrito aqui em vez de subentendido. (A mutação do WhatsApp não
foi perdida: ela deixa `2 failed` nas AC7/AC8 e AC10, que é onde ela tinha de morder.)

### QA-900-25-2 — nada vigia o produto desta story. **REGISTRADO COM DONA, não consertado aqui.**

`docs/backlog.md` → **`MNT-001-B`**, P1, **dona `@devops`**, Onda 3. Terceiro ocupante da lacuna do
`MNT-001`, e o mais caro: com um erro de tipo grosseiro plantado em `tests/tenancy/`,
`type-check` 8/8 verde, `lint` 0 erros, `pnpm test` 287/3693 verde — **um PR que apague a suíte
inteira passa por todos os gates**. Sugestões na ordem de custo, incluindo a mais barata que
resolve o pior caso: uma catraca de **existência** dos arquivos da suíte.

### `db:status` — risco do `@qa` acolhido, e dimensionado

Registrado em `docs/backlog.md` (`[DB] O ledger … atrás do catálogo`), P2, dona `@devops`. O risco
que ele nomeou e eu não: com o ledger em PENDENTE, um `pnpm db:apply` futuro **reaplicaria**
`246`/`247`. **Medi a consequência:** `246` é idempotente por construção (`IF NOT EXISTS`,
`OR REPLACE`, `DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING`, `WHERE NOT EXISTS`) e `247` é
`DROP CONSTRAINT IF EXISTS` + `ADD` — **reaplicar estas duas é seguro**, e o `db:apply`
regularizaria o ledger sozinho. O risco residual é **genérico**: um ledger que mente arma o
`db:apply` para a próxima migration que não for idempotente.

### Estado do banco compartilhado depois de tudo

Todo o resíduo dos meus experimentos foi apagado **por id**, com os ids lidos e impressos antes de
cada `DELETE` (nunca por predicado): 12 `activities`, 4 `leads`, 9 `webhook_logs`. Canário depois:
`leads 0 · conversations 0 · activities 0 · webhook_logs 0` — e **invariante ao longo de 3
execuções limpas seguidas**. Fora do canário: só a org canário existe; `leads`/`conversations`/
`messages` totais do banco = **0/0/0**; `meta_capi_outbox` vazia.

### File List

**Modificados**
- `packages/web/src/lib/tenancy/admin-invite.test.ts` — AC2: molde local removido, migrado para
  `criarFakeSupabase`; predicado de erro de escrita passa a discriminar a operação.
- `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.test.ts` — AC2: idem, no
  terminal único (`.maybeSingle()`); o fake é construído por chamada para não congelar os arrays.
- `packages/web/src/lib/tenancy/__fixtures__/fake-supabase-postgrest.ts` — AC2: `erroPorEscrita`
  (com `operacao`) e `resultadoMaybeSingle`; docblock atualizado.
- `docs/backlog.md` — Task 2.4: `[TEST-004]` movido de "Pendente" para "Concluído", com a
  resolução medida.
- `docs/stories/900-25-prova-duas-empresas-reais-ambiente-teste.story.md` — checkboxes de AC1/AC2 e
  Tasks 1-2, Change Log, Dev Agent Record.

**Criados**
- `packages/web/src/app/api/webhooks/meta-ads/route.test.ts` — AC1/Task 1.2: primeiro teste desse
  receptor; 3 testes.

**Intocados de propósito** — nenhum arquivo de produção (`.ts` fora de `*.test.ts`/`__fixtures__/`)
foi modificado. As mutações das Tasks 1.1/1.2 foram aplicadas e revertidas byte-a-byte.

### File List — Rodada 2 (Tasks 0 e 3-12)

**Criados**
- `vitest.tenancy.config.ts` — AC3/AC3b: config isolada da Camada B. Loader executável de
  `.env.teste` (`node:util.parseEnv`, com guarda de Node < 20.12), alias `@trifold/shared` (D1),
  `fileParallelism: false`, `include` restrito a `tests/tenancy/**`. Os aliases de
  `@supabase/supabase-js` e `next` foram acrescentados por medição (nenhum dos dois existe em
  `node_modules/` da raiz — o pnpm os instala em `packages/web/node_modules`), e apontar para o
  mesmo caminho que `packages/web` resolve é o que faz o `vi.mock("next/server")` do teste
  alcançar o `after()` da rota.
- `tests/tenancy/support/ambiente.ts` — AC3: as duas guardas (destino **fail-closed** por
  allowlist, ver Completion Note 1; e o par `skip`/`throw` do N2), o client de service-role, o
  transporte de catálogo (`runSqlJson` da Management API, REUSADO de `scripts/lib/`) e o
  redirecionamento de env das Dev Notes.
- `tests/tenancy/support/fixtures.ts` — provisionamento, canário e teardown por id. A lista de
  tabelas com FK bloqueante é **derivada de `pg_constraint` em runtime** (N1) — tabela **e**
  coluna, com aborto nomeado para FK composta ou fora do schema `public`. Documenta o resíduo
  aceitável (`webhook_logs` SET NULL, `CRON_RESUMO` com `org_id: null`).
- `tests/tenancy/alias-vivo.test.ts` — Task 3.5 (D1): 3 asserções, **sem `skipIf`**, provando que
  o subpath de `@trifold/shared` resolve e que a função importada DISCRIMINA (controle negativo).
- `tests/tenancy/retry-transporte.test.ts` — carrasco do `comRetryDeTransporte` **e** do
  `contarComRetryDeTransporte`: 10 asserções, sem rede e sem credencial, provando que o primeiro
  repete transporte e **nunca** resposta do banco, e que o segundo **lança** se alguém voltar a
  contar linhas (QA-900-25-1).
- `tests/tenancy/cross-tenant.test.ts` — AC4-AC10, AC12, AC13, AC14. 15 testes (a AC9 é um
  `describe.each` de dois sentidos — ver Debug Log).
- `tests/tenancy/capi-dispatch.test.ts` — AC11, arquivo próprio (D6), com pré-condição de aborto
  (D7), fixtures/canário/teardown próprios. 2 testes.

**Modificados**
- `package.json` (raiz) — script `test:tenancy`. **Não** entra em `pretest`/`test` nem no
  `ci.yml` (Scope OUT).
- `docs/stories/900-25-prova-duas-empresas-reais-ambiente-teste.story.md` — checkboxes de
  AC3-AC15 e Tasks 0/3-12, Status, Change Log, Dev Agent Record, File List.
- `docs/backlog.md` — **fora dos padrões que a AC15 declara, e é deliberado**: o gate `@qa` pediu
  que `QA-900-25-2` fosse registrado *com dona*, e o achado do ledger idem. A AC15 foi escrita
  antes destes dois existirem; um item de backlog é documentação, não comportamento de produção,
  e a alternativa (deixar o achado só no Dev Agent Record de uma story fechada) é como dívida
  some. Duas entradas novas: `MNT-001-B` (P1, `@devops`) e o ledger do `trifold-crm-dev` (P2,
  `@devops`).

**Tocados e REVERTIDOS de propósito**
- `docs/audits/migrations-aplicadas.json` — regenerado pelo `pnpm db:status` da Task 0.2 (escrita
  documentada daquele comando) e revertido com `git checkout --`: a AC15 não o lista, e congelar
  `PENDENTE: 2` no espelho seria snapshotar a divergência em vez de corrigi-la (Completion Note 3).

**Intocados de propósito** — **nenhum** arquivo de `packages/**`, `scripts/**` ou
`supabase/migrations/**`. Zero migration nesta story. A mutação de vivacidade (AC3b.3) foi aplicada
e revertida byte-a-byte, em arquivo de teste desta própria fatia.

---

## QA Results

**Gate:** `docs/qa/gates/900.25-prova-duas-empresas-reais-ambiente-teste.yml`
**Veredicto: CONCERNS** — merge liberado, nenhuma concern bloqueia.
**Revisor:** Quinn (Test Architect) · 2026-08-30 · base `f08aa434` · ambiente medido:
`trifold-crm-dev` (`xnxvygyfyyyzwhiuoehz`). **Produção: nenhum acesso.**

### O que eu reproduzi (não reli — executei)

| alegação do `@dev` | medido por mim |
|---|---|
| `pnpm test:tenancy` 25 passed / 0 skipped | **25 passed (25)**, 4 execuções |
| asserção central viva (`orgBId`→`orgAId`) | `AssertionError` em `cross-tenant.test.ts:569`, **1 failed / 24 passed** — mutação cirúrgica, não arrasto |
| canário reprova lead na empresa errada | mutação de `resolveOrgByMetaPage` → **3 failed**, AC14 vermelha com `leads 0→2`, `webhook_logs 0→2` |
| FKs derivadas em runtime | catálogo: `a`=**4** · `c`=**87** · `n`=**1**; `financial_notification_log` dentro; `webhook_logs.org_id` o único SET NULL |
| guarda de destino fail-closed | `producaofalsa` (alfanumérico, fora das allowlists) → mensagem da guarda **antes de qualquer `fetch`**, exit 1 |
| guarda de credencial, dois caminhos | var vazia c/ arquivo → **throw, exit 1**; arquivo ausente → `8 passed \| 17 skipped`, **exit 0** |
| `messages` sem `org_id` | confirmado no `information_schema`; o join é load-bearing (é ele que a mutação de vivacidade morde) |
| AC15 | `merge-base == origin/main`; 9 arquivos, **zero** em `packages/`/`scripts/`/`supabase/` |
| Camada A + gates | `pnpm test` **287/3693 + 6 expected fail**; lint **0 erros**; type-check **8/8** |

**O que acrescentei à autocrítica do `@dev` sobre o canário:** medi a **disjunção**. Sob a mutação,
o delta vive **inteiramente** nas 3 tabelas que ele acrescentou — `organizations`,
`whatsapp_config`, `org_integrations` e `meta_capi_outbox` saem **idênticas**. Com a lista velha o
canário teria ficado verde com 2 leads na empresa errada dentro dele. A cegueira está provada,
não alegada.

### O décimo sétimo instrumento cego — medido

**A prova não observa o próprio teto de leitura.** O canário conta com
`select("id")` + `linhas.length`, e o PostgREST deste projeto tem `max_rows` = **1000** (lido da
config). Simulei o teto com a linha de base saturada e apliquei a mesma mutação de roteamento:

```
sem teto simulado : 3 failed | 22 passed  → AC9(×2) + AC14 VERMELHA
com teto simulado : 2 failed | 23 passed  → AC9(×2) + AC14 VERDE
```

Latente hoje (as tabelas vigiadas têm 0–6 linhas) — **nenhuma asserção desta story está
comprometida**. Mas é durabilidade do instrumento, e o conserto é uma linha
(`{ count: "exact", head: true }`, recusada no código por compatibilidade com `comRetryDeTransporte`).

### As 2 concerns (nenhuma bloqueia)

1. **QA-900-25-1 · MÉDIA · `@dev`** — o contador do canário satura no teto do PostgREST e perde
   poder discriminante em silêncio (acima).
2. **QA-900-25-2 · MÉDIA · `@devops`/Onda 3** — **nada no repositório vigia o produto desta story.**
   Plantei um erro de tipo grosseiro em `tests/tenancy/`: `type-check` **8/8 verde**, `lint`
   **0 erros**, `pnpm test` **287/3693 verde**. Um PR que quebre, esvazie ou **apague**
   `tests/tenancy/` passa por todos os gates. O `@dev` disclosou a metade do `type-check`; a
   consequência inteira é maior. Mínimo barato enquanto a Onda 3 não decide lock/TTL: incluir
   `tests/**` no `type-check`/`lint` da raiz (não precisa de rede nem credencial).

### As 3 renúncias — todas ACEITAS

`tests/` sem gate (a renúncia é honesta; a concern 2 é o tamanho real dela) · retry não
exercitado em campo (a substituição offline é a correta, e o discriminante conjuntivo tem carrasco
nas **duas** pernas) · mutação de `provision_org` (a alternativa era DDL experimental em banco
compartilhado, a classe que o D7 desta mesma story mandou escopar; e AC4/AC5 já acendem se as
seções 1 ou 6 sumirem).

### `db:status` divergente — nenhuma AC fica sem lastro

Confirmei o fato (ledger para na `245`) **e** o contrário no catálogo — inclusive o CHECK
`whatsapp_sem_identificador_proprio` na grafia da **247**, que é o discriminante entre as duas
versões. `grep` de `db:status|ledger|migrations-aplicadas` no bloco inteiro de ACs (linhas
216-1036) → **0 ocorrências**: a dependência existe só na Task 0.2, e o fato que ela queria
confirmar foi confirmado por instrumento mais forte. Item do `@devops`, com um risco a mais que a
story não nomeia: **com o ledger em PENDENTE, um `pnpm db:apply` futuro tentaria reaplicar
`246`/`247` no banco de teste.**

### Resíduo — aceito, com a contagem corrigida

`webhook_logs` SET NULL: na prática o resíduo é **zero** (a suíte guarda os ids que ela cria e
apaga por id — medi `webhook_logs` = 0 no fim). `CRON_RESUMO` com `org_id: null`: aceito pela razão
certa — a alternativa (caçar por `source`/janela) é o `DELETE` por predicado que a story existe
para tornar impossível. **Correção de contagem:** o resíduo real são **4 linhas por execução**
(189→193 medido), não 2 — as outras duas são `CRON_ORG_PROCESSADA` atribuídas ao **canário**, com
metadata vazia e sem marcador de `source`. A exclusão de `system_events` do canário **fica
mantida** (a justificativa é de mecanismo, não de conveniência), mas a frase "não perturbei nada
além das minhas fixtures" tem essa exceção, e ela merece o tamanho certo no texto.

### Menores

- A lista do canário é derivada de **uma mutação observada**, não do write-set do código sob teste.
  99 tabelas do banco carregam `org_id`; o canário vigia 7. `activities` é alvo de escrita do
  próprio receptor de WhatsApp sob teste e está fora (latente — o payload-fixture não dispara
  aquele ramo). `conversations` entrou **sem carrasco próprio**.
- Evidência colada envelheceu: o `--stat` da AC15 mostra 8 arquivos/2027 (HEAD é **9/2291**), e o
  docblock de `retry-transporte.test.ts` ainda diz "`20 passed`" (a suíte é **25**).

### Higiene do gate

4 mutações aplicadas, **todas revertidas** byte-a-byte (`diff -q` OK, `git status` das áreas de
código **vazio**, `grep` dos marcadores → 0). `.env.teste` movido e restaurado (`shasum -c` OK,
permissão 600). Banco de teste no estado final **idêntico** à linha de base que tirei antes de
começar — todo resíduo das minhas mutações (3 leads + 3 `webhook_logs` no canário) apagado **por
id**. `gate:tenancy` não executado. Nenhum commit, nenhum push.
