# Story 900-21b — Allowlist de Admin-Client Re-triada + Esqueleto de `org_integrations`/`whatsapp_config` (Onda 2, Fatia 1)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 2 — "Para de errar" (plano de 3 ondas aprovado pelo dono do produto). Esta story cobre
  **só os Passos 1 e 3** do plano da Onda 2 (re-triagem da allowlist + a migration base). Os Passos
  2 (`forEachActiveOrg`), 4 (resolução de org nos webhooks), 5 (crons defeituosos) e 6 (teste de
  duas orgs) são stories seguintes — **não entram aqui**.
- **Story:** 900-21b — ver seção "Numeração" abaixo para a justificativa completa do número.
- **Status:** Ready for Review — implementada pelo `@dev` em 2026-08-29. **As 6 ACs cumpridas**, cada
  uma com mutação executada e vermelho observado. **R1/R2/R3 do parecer @po aplicadas** (catraca do
  ESLint virou asserção em `pnpm test`; `PERMITIDOS` exportado e resolvido por `import.meta.url`;
  célula de vivacidade da AC6 em `BEGIN…ROLLBACK` com `coalesce`). **Task 2.6 (aplicar em produção)
  fica pendente para o `@devops`** — não é do `@dev`, e produção não foi tocada por escrita nenhuma
  nesta story (só leituras). Pronta para o `@qa`.
- **Priority:** P0 — bloqueia toda a Onda 2. Sem a migration desta story (`org_integrations` +
  UNIQUE parciais de `whatsapp_config`), nenhuma story de webhook/cron da Onda 2 tem onde escrever
  status de integração por org nem a garantia estrutural que fecha o `.maybeSingle()` duplo. Sem o
  Passo 1 (allowlist re-triada), qualquer PR de cron da Onda 2 terá de argumentar contra um arquivo
  que diz, por escrito, que o arquivo já está correto.
- **Complexity:** M — 2 ACs de conteúdo (allowlist, migration) + 1 AC de prova de não-regressão.
  Uma migration só (regra R9 do gate de tenancy), um arquivo de teste estrutural novo.
- **Depends on:** PR #525 (Story 900-3c) mergeado. `pnpm db:apply`/`pnpm db:status` **não existem em
  `origin/main` hoje** — medido `git show origin/main:package.json | grep "db:apply\|db:status"` →
  vazio; os dois só existem em `story/900-3c-registro-migrations` (PR #525, `state: OPEN`,
  `mergedAt: null`, medido 2026-08-29). As Tasks 2.4 e 2.6 (aplicar via `db:apply`) dependem deles.
  **Plano B se #525 não tiver mergeado quando esta story for implementada:** aplicar a migration
  `246` manualmente via Management API. *[@dev 2026-08-29 — citação corrigida: `scripts/lib/management-api.ts`
  **também só existe no PR #525**, o mesmo que o plano B tenta contornar (ressalva medida pelo @po
  na revalidação v2). O transporte que existe em `origin/main` é o `runSql` **inline** em
  `scripts/reset-tenancy-testdb.ts:252` (`POST api.supabase.com/v1/projects/{ref}/database/query`),
  com `splitStatements` já exportado em `:268`; reusá-lo custa uma linha de `export`, ou ~15 linhas
  copiadas. Foi este o caminho usado — ver Dev Agent Record.]* Com as mesmas evidências (saída das
  mutações de controle) coladas no Dev Agent Record — não bloquear a story por isso, só declarar
  qual dos dois caminhos foi usado.
- **Created:** 2026-08-29
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @data-engineer (Dara) + @dev (Dex) — a migration (`org_integrations`,
  `whatsapp_config`, `provision_org()`) é de @data-engineer; o teste estrutural da allowlist
  (`scripts/admin-client-allowlist.test.ts`) e a reescrita do JSON são de @dev, seguindo o mesmo
  split que o epic já usa para `900-21` (`Executor: @data-engineer + @dev`).
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[supabase_project_review, migration_review, code_review]`

---

## Numeração — por que `900-21b`, e por que não `900-16` nem um número novo qualquer

Esta é uma decisão que precisa estar registrada, porque os três candidatos óbvios estavam errados:

**1. `900-16` está descartado — é dívida P1 já rastreada, com dono e conteúdo diferentes.**
`docs/backlog.md` tem um item `[Epic 900] 🟡 900-16` (adicionado em 2026-08-28, validação @po da
`900-22b`) que afirma, textualmente: *"não há `docs/stories/900-16-*.story.md`"* e manda
*"draftar `900-16` (`platform_admins` com níveis `owner/operator/support`, `platform_audit_log`
append-only, `platform_audit()`, `requirePlatformAdmin` evoluindo...)"*. Reusar esse número para
conteúdo diferente (allowlist + `org_integrations`) quebraria essa referência rastreada e o grafo
de dependências do próprio epic (`900-21`/`900-22` citam `Dep: ..., 900-16`). **Confirmado que a
memória do @sm dizia "próxima numeração = 900-16" antes desta story — essa nota estava certa sobre
"próximo número sequencial disponível", mas não é uma trava contra a dívida já registrada. Esta
story corrige a rota.**

**2. O conteúdo desta story já tem dono no epic: `900-21`.** A seção `#### 900-21 —
role_default_permissions + provision_org() idempotente` (linhas 807-819 do epic) descreve, quase
literalmente, metade do que esta story entrega: *"Semeia: ... `org_integrations` `disconnected` por
provider ... **Esqueleto de `org_integrations` criado nesta story** (tabela + `org_id` + `provider`
+ `status` + `config jsonb` com identificadores públicos + `UNIQUE (org_id, provider)` + RLS):
`provision_org` a semeia... O que fica para `900-47` é o que é de fato da Onda 7: `secret_ref`/Vault,
índices UNIQUE de roteamento reverso, `resolveIntegration`, `platform_shared`."`

**3. Mas `900-21` já foi parcialmente consumido — sem `org_integrations`.** `supabase/migrations/240_provision_org.sql`
já existe, com cabeçalho *"Story 900-21 (Epic 900, Onda 2)"* e PR #498 — mas entrega só
`organizations` + roles + `role_permissions` + `kanban_stages`. **Não** cria `role_default_permissions`
(a outra AC de `900-21`, ainda em aberto), **não** cria `org_integrations`, **não** semeia
`whatsapp_config`. É o mesmo padrão de divergência que a própria `900-22b` já documentou no epic
para a assinatura de `provision_org()` ("nota de rastreabilidade") — `900-21` foi entregue em fatias,
sem story file formal, e esta é a continuação da fatia que faltou.

**Decisão [AUTO-DECISÃO]:** numerar esta story `900-21b` — sufixo de letra da mesma convenção que o
epic já usa para reabertura/split (`900-27a/b`, `900-42a/b`, `900-14b`, `900-3b/900-3c`), continuando
especificamente a parte de `900-21` que a migration `240` deixou pendente (`org_integrations` +
seed de `whatsapp_config`). **`role_default_permissions`/o teste de paridade com
`getHardcodedPermissions()` continuam de fora** — não é escopo desta story nem do plano da Onda 2;
fica como dívida nomeada (ver Dev Notes).

**4. O Passo 1 (re-triagem da allowlist) é bundlado aqui por instrução explícita do dono do
produto**, não porque seja tecnicamente parte de `900-21` — é um tema ortogonal (governança de
ESLint, não provisionamento de org). O plano aprovado define esta story como "a primeira fatia da
Onda 2", cobrindo os Passos 1+3 juntos. Registrado para quem ler esta story depois e estranhar a
mistura de assuntos.

**Ação de follow-up (fora desta story, para o @sm/@po decidirem):** `role_default_permissions`
segue sem número dedicado. Se virar prioridade, sugestão de numeração é `900-21c` (não `900-16`,
pelos motivos acima).

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** (a) um arquivo de governança de admin-client que diga a verdade sobre quais crons
realmente iteram todas as orgs corretamente vs. quais estão travados/defeituosos, e (b) o esqueleto
de schema (`org_integrations`, UNIQUE parciais em `whatsapp_config`, `provision_org()` estendido)
que fecha o `.maybeSingle()` duplo e dá a toda organização nova um lugar para guardar status de
integração,
**Para que** as próximas stories da Onda 2 (migração dos crons, resolução de org nos webhooks)
tenham um alvo verdadeiro para migrar e um schema pronto para escrever, sem que produção — hoje com
uma única org — mude de comportamento em nenhum caminho existente.

---

## Context

O `docs/audits/admin-client-allowlist.json` (nascido na `900-14`, congelado em `2026-08-23`)
classifica hoje **48 das 62 entradas** de `legitimos` com a string idêntica, copiada:
*"cron cross-org: itera todas as orgs por desenho (900-23 formaliza com forEachActiveOrg)"*. Essa
string é factualmente **falsa** para pelo menos 6 desses crons — 3 estão travados numa única org via
`DEFAULT_ORG_ID` (`daily-report`, `nicole-agenda-reconcile`, e `nicole-health`, que **nem está na
allowlist** — achado desta story, ver AC1) e 3 têm bugs medidos que fazem o cron processar/alertar
só sobre uma fração das orgs, com sucesso registrado (`meta-ads-intelligence`, `meta-capi-dispatch`,
`followup`). Se a Onda 2 começar migrando código de cron sem corrigir a allowlist primeiro, cada PR
terá de argumentar contra um arquivo que diz, por escrito, que o arquivo já está certo — a
"afirmação oposta ao defeito" citada pelo dono do produto.

Ao mesmo tempo, o `.maybeSingle()` duplo que o Passo 4 da Onda 2 vai fechar (rotas que leem
`whatsapp_config` por `org_id` ou por `phone_number_id` sem `UNIQUE` que impeça duas linhas ativas
da mesma org, ou o mesmo número em duas orgs) precisa da **migration base** primeiro — sem ela,
Passos 4 e 5 não têm uma garantia de banco para se apoiar, só uma convenção de aplicação.

**Decisões do dono do produto que ampliam o desenho original (respondidas 2026-08-29):**
1. **Segredos de integração:** Supabase Vault, sem criptografia adicional na aplicação. **Verificado
   e confirmado:** `supabase_vault v0.3.1` + `pgcrypto v1.3` instalados nos dois projetos
   (`dsopqkqjkmhytudaaolv` e `xnxvygyfyyyzwhiuoehz`) — isso fecha a pergunta que `docs/architecture/adr/adr-005-tenant-secrets-storage.md`
   deixava em aberto ("Status: Proposed — depende de confirmar disponibilidade do Supabase Vault no
   plano atual"). **Esta story não popula `secret_ref`** (fica nulo, ver AC3) — só registra o fato
   para quem for atualizar o status do ADR (fora da autoridade do @sm, ver Dev Notes).
2. **Integrações configuráveis por empresa — SEIS:** `whatsapp`, `meta_ads`, `meta_capi`, `sienge`,
   `telegram`, `google` — **`resend` fica de fora** (permanece da plataforma, o SaaS envia por
   conta própria). O campo `config` do provider **`meta_capi`** (não do `meta_ads`) precisa
   reservar a chave `dataset_id` desde o nascimento da tabela (o `meta-capi-dispatch`, numa story
   futura, vai resolver o dataset por org a partir daí); `meta_ads` reserva `page_id`.
   *[@dev 2026-08-29 — correção de coerência: este item ainda listava 5 providers e punha o
   `dataset_id` no `meta_ads`, contradizendo AC3/AC4/AC5 depois da decisão B6 do @po. Ressalva
   registrada na revalidação v2 do parecer; corrigida aqui para que quem leia o Context antes das
   ACs não semeie a forma errada.]*
3. **WhatsApp:** toda empresa terá WABA própria (número verificado na Meta — providência externa por
   cliente, pré-condição para a empresa nova funcionar, não código). Isso **confirma** a decisão já
   travada no plano: o roteamento de org por WhatsApp continua sendo por
   `whatsapp_config.phone_number_id` (a mesma linha que já traz o `access_token`), **não** por
   `org_integrations` — evita duas fontes de verdade para o mesmo identificador. Ver AC3 para como
   isso resolve uma inconsistência do texto original do plano.

---

## Scope

### IN (esta story entrega)
1. **Passo 1 — Allowlist re-triada.** `docs/audits/admin-client-allowlist.json` reestruturado em
   `plataforma` / `itera-orgs` / `alvos-onda-2` / `legitimos` (residual) / `legado` (intocado).
   Teste estrutural novo (`scripts/admin-client-allowlist.test.ts` + `scripts/lib/allowlist-lint.ts`)
   que falha se um caminho aparece em duas seções, se uma entrada de `itera-orgs` não tem `:linha`
   no motivo, se `alvos-onda-2` passou do prazo, se uma seção está vazia/ausente, ou se
   `PERMITIDOS.size` da regra ESLint diverge do total de entradas do arquivo. **Correção do @po
   (B1): esta linha NÃO é "zero código de aplicação"** — `packages/web/eslint-rules/no-unscoped-admin-client.mjs`
   também é tocado (une as 5 chaves ao montar `PERMITIDOS`, hoje só lê `legitimos`+`legado`), porque
   sem isso a reestruturação apaga a isenção de ~51 arquivos em silêncio (ver AC1).
2. **Passo 3 — Migration base** (`246_org_integrations_e_unicidade_whatsapp.sql`):
   - Duas `UNIQUE` parciais em `whatsapp_config` (`phone_number_id`, `org_id`, ambas `WHERE
     status='active'`).
   - Tabela `org_integrations` (`UNIQUE (org_id, provider)`, RLS, um índice `UNIQUE` parcial de
     roteamento reverso para `meta_ads`, `CHECK` que impede `whatsapp` de guardar identificador
     próprio).
   - `provision_org()` estendida para semear `whatsapp_config` (`inactive`) e as **6** linhas
     `disconnected` de `org_integrations` (`whatsapp`, `meta_ads`, `meta_capi`, `sienge`, `telegram`,
     `google` — decisão do @po, B6), mantendo a assinatura `(p_name, p_slug)`.
   - Backfill da(s) org(ns) já existente(s).
3. **Prova de não-regressão** (AC6): produção — hoje com uma única org — dá exatamente a mesma
   resposta em todo caminho de leitura que já existe hoje, antes e depois da migration.

### OUT (não entra nesta story — próximas stories da Onda 2)
- `forEachActiveOrg` e a migração dos crons `itera-orgs`/`alvos-onda-2` para usá-lo (Passo 2,
  `900-23`).
- Resolução de org nos webhooks (`resolveOrgByWhatsAppPhone`, `resolveOrgByMetaPage`,
  `resolveSoleOrg`) e o dual-run `WEBHOOK_ORG_ROUTING` (Passo 4, `900-24`).
- Correção de código dos crons defeituosos/travados listados em `alvos-onda-2` (Passo 5,
  provavelmente `900-20`).
- Camadas A/B de teste de duas orgs (Passo 6).
- `secret_ref`/Vault, `resolveIntegration`, view `org_integrations_public`, painel de configuração
  por empresa (Onda 7, `900-47`+ — o dono do produto antecipou a *intenção* do painel, mas não o
  mecanismo de segredo; ver Context).
- `role_default_permissions` (a outra AC pendente de `900-21`, ver seção "Numeração").
- Qualquer mudança de comportamento em produção.

---

## Acceptance Criteria

- [x] **AC1 — Allowlist re-triada em 4 seções + residual, com teste estrutural E regra ESLint atualizada (Passo 1):**

  **Correções aplicadas nesta revisão, a pedido do @po (`docs/qa/po-validation-900-21b.md`,
  NO-GO 2026-08-29): B1 (regra ESLint precisa unir as 5 chaves), B2 (regra 0 de vivacidade + AC de
  catraca via ESLint real), B3 (`platform/orgs/route.ts` estava à deriva, entra em `legitimos`),
  B4 (aritmética corrigida: 242, não 241), C5 (ressalva do `nicole-health` carregada para o motivo).**

  **Novo formato do `legitimos`** (as chaves `_aviso`, `congeladoEm` e `legado` permanecem como
  estão; `legado` — 178 entradas — **não é tocado**, é ortogonal, pertence à `900-15`):
  ```jsonc
  {
    "_aviso": "...",
    "congeladoEm": "2026-08-23",
    "reclassificadoEm": "2026-08-29",
    "plataforma": { /* 16 entradas — permanente, motivo genérico */ },
    "itera-orgs": { /* 24 entradas (19 implementações + 5 testes-irmãos) — motivo TEM que citar arquivo:linha do loop */ },
    "alvos-onda-2": { /* 12 entradas (9 rotas + 3 testes-irmãos) — motivo + campo alvosExpiramEm */ },
    "legitimos": { /* 12 entradas — residual, motivo já correto ou herdado, fora do escopo de correção de código desta story */ },
    "legado": [ /* 178 — intocado */ ]
  }
  ```

  **`plataforma` (16, não 15 — correção B4) — permanente, motivo do tipo "custo de plataforma,
  nunca migra":** 9 crons `billing-*` **em 10 entradas** (`billing-collect-anthropic`,
  `billing-collect-resend`, `billing-collect-supabase`, `billing-collect-vercel`,
  `billing-collection-health`, `billing-cost-anomaly`, `billing-monthly-summary` **+**
  `billing-monthly-summary.test.ts` — duas chaves, um cron; era contado como "9" na v1, mas ocupa
  10 posições no JSON —, `billing-reminders`, `billing-subscription-enrich`) + `keep-alive` (só
  verifica conectividade, `SELECT id FROM organizations LIMIT 1`, sem processar org nenhuma) +
  `webhook-health` (monitora a saúde da própria infraestrutura de webhook) +
  `purge-rejected-uploads` (retention policy sem filtro de org, por desenho —
  `obra_upload_aprovacoes` inteira, `purge-rejected-uploads/route.ts:29-33`) + as 3 definições
  próprias (`src/lib/supabase/admin-helpers.ts`, `src/lib/supabase/admin.ts`,
  `src/lib/supabase/org-scoped-admin.ts`) = **10 + 1 + 1 + 1 + 3 = 16**. **Motivo:** *"cross-org de
  plataforma: dado da própria Trifold, sem dimensão de org, permanente — não migra para
  `forEachActiveOrg`"* (para os 4 crons cujo próprio código já comenta isso:
  `billing-collection-health:145`, `billing-cost-anomaly:156`, `billing-monthly-summary:222`,
  `billing-reminders:27,190`).

  **`itera-orgs` (19 implementações + 5 testes-irmãos = 24) — motivo TEM que citar `arquivo:linha`
  do loop, medido em 2026-08-29. Confirmado pelo @po linha a linha (19/19 exatas):**

  | # | Arquivo | linha do loop | como itera |
  |---|---|---|---|
  | 1 | `analytics-report/route.ts` | 117 | `for (const org of orgs)` — de `organizations` |
  | 2 | `appointment-email-reminders/route.ts` | 51 | `for (const appointment of appointments ?? [])`, `org_id` por linha |
  | 3 | `appointment-whatsapp-reminders/route.ts` | 109 | `for (const appointment of appointments ?? [])`, `org_id` por linha |
  | 4 | `aprovacoes-digest/route.ts` | 52 | `for (const [orgId, obras] of byOrg)` |
  | 5 | `boleto-scan/route.ts` | 130 | `for (const cliente of clientes ?? [])`, org via `obra.org_id` |
  | 6 | `bolsao-rebalance/route.ts` | 70-71 | `for (const cfg of configs ?? [])`, `orgId = cfg.org_id` |
  | 7 | `campaign-poll/route.ts` | 158 | `for (const campaign of campaigns)`, org via `campaign.org_id` |
  | 8 | `email-automations/route.ts` | 61 | `for (const automation of automations ?? [])`, `org_id` por linha |
  | 9 | `email-queue/route.ts` | 53 | `for (const orgId of orgIds)` — distinct de `pendingOrgs` |
  | 10 | `enrich-leads/route.ts` | 60 | `for (const conv of conversations)`, org via `conv.org_id` |
  | 11 | `meta-sync-entities/route.ts` | 58 | `for (const account of accounts)`, org via `account.org_id` |
  | 12 | `meta-sync-health/route.ts` | 111 | `for (const orgId of orgIds)` — distinct de `meta_ad_accounts` |
  | 13 | `meta-sync-insights/route.ts` | 159 | `for (const account of accounts)`, org via `account.org_id` |
  | 14 | `meta-sync-placement/route.ts` | 81 | `for (const account of accounts)`, org via `account.org_id` |
  | 15 | `obras-approval-reminder/route.ts` | 52 | `for (const [orgId, { count, ids }] of byOrg.entries())` |
  | 16 | `roleta-retry/route.ts` | 74 | `for (const lead of leads ?? [])`, org via `lead.org_id` |
  | 17 | `sienge-customer-sync/route.ts` | 44 | `for (const c of clientes ?? [])`, org via `c.org_id` |
  | 18 | `sla-alerts/route.ts` | 110-111 | `for (const cfg of configs ?? [])`, `orgId = cfg.org_id` |
  | 19 | `meta-leads-retry/route.ts` | 63 | `for (const event of events ?? [])`, org resolvida por evento |

  Mais os 5 arquivos `.test.ts` que exercitam os itens 5, 6, 10, 17, 19 (`boleto-scan.test.ts`,
  `bolsao-rebalance.test.ts`, `enrich-leads.test.ts`, `meta-leads-retry.test.ts`,
  `roleta-retry.test.ts`) — classificação segue o arquivo de implementação, sem `:linha` própria
  (motivo: `"teste do item acima — classificação segue o arquivo de implementação"`).

  **`alvos-onda-2` (9 rotas + 3 testes-irmãos = 12, contagem inalterada mas ressalva do
  `nicole-health` corrigida — C5) — motivo + `alvosExpiramEm: "2026-09-30"` (30 dias, ver Dev Notes
  para o raciocínio da data):**

  | Arquivo | Classe | Achado |
  |---|---|---|
  | `daily-report/route.ts` + `.test.ts` | travado | `DEFAULT_ORG_ID` (`:16`), só sobrescrito por `DAILY_REPORT_ORG_ID` (`:33`) |
  | `nicole-agenda-reconcile/route.ts` + `.test.ts` | travado | `DEFAULT_ORG_ID` (`:30`), usado em `:76` |
  | `nicole-health/route.ts` | **reclassificação, NÃO migração para `forEachActiveOrg`** — NOVO, achado nesta story | `DEFAULT_ORG_ID` (`:31`), usado em `:117,126,157,166`. Criado **2026-08-28** (commit `51d21d1e`), **depois** do congelamento da allowlist (`2026-08-23`) — nunca foi adicionado. Medido: `npx eslint src/app/api/cron/nicole-health/route.ts` acusa **2 warnings** hoje (`aios/no-unscoped-admin-client`), silenciosos porque a regra está em `warn`. **Motivo a gravar no JSON, citando o Passo 2 do plano (correção C5 do @po):** *"NÃO migra para `forEachActiveOrg` — avisa o admin da Trifold que a API de IA parou, é vigia de plataforma; migrar criaria N alertas para o mesmo incidente, o oposto do que o arquivo existe para evitar. Correção correta: remover os filtros por `DEFAULT_ORG_ID` para ver erros de todas as orgs, incluir org no corpo do alerta."* Quem pegar a `900-20`/próxima story do Passo 5 tem que ler esta ressalva antes de envolvê-lo num loop. |
  | `meta-ads-intelligence/route.ts` | defeituoso | `accounts[0]!.org_id` (`:231`) vira "a org" para as 10 chamadas seguintes — com 2+ orgs, processa e aponta êxito só para a primeira |
  | `meta-capi-dispatch/route.ts` + `.test.ts` | defeituoso | `select` de `leads` (`:101-103`) usa só `.in("id", leadIds)`, sem `.eq("org_id", ...)` — outbox de todas as orgs processada como se fosse uma |
  | `followup/route.ts` | defeituoso | lookup de `whatsapp_config` (`:168`) roda **antes** do `for (const rule of rules)` (`:192`) — usa o template/config de uma org só para todas as regras. **Achado do @po, mais grave que o descrito:** o lookup filtra só por `status='active'`, sem `org_id` nenhum — não é "usa a config errada", é "usa qualquer linha ativa que o banco devolver primeiro". |
  | `calendly-sync/route.ts` | órfão não agendado | ausente de `packages/web/vercel.json` (37 crons agendados; 40 diretórios em `src/app/api/cron/`) — decisão (manter/apagar) adiada para a Onda 3 |
  | `supremo-history-sync/route.ts` | órfão não agendado | idem — usa `SUPREMO_ORG_ID` fixo, mesmo padrão de travamento, mas nem roda hoje |
  | `supremo-sync/route.ts` | órfão não agendado | idem |

  **`legitimos` residual (12, não 11 — correção B3):** os 9 webhooks + `admin-invite.ts` +
  `platform-query.ts` (motivo já correto, herdado) **mais `src/app/api/platform/orgs/route.ts`**,
  achado nesta revisão a pedido do @po. Este arquivo usa `createAdminClient()` (`:75`) e chama
  `db.rpc("provision_org", ...)` (`:76`) — **exatamente a função que a AC4 desta story modifica** —,
  não estava na allowlist (0 ocorrências), acusa 2 warnings hoje, e foi criado em `544f3d73`
  (2026-08-24, PR #498, o mesmo PR dissecado na seção "Numeração" para a migration `240` — a story
  tinha lido o #498 pela migration e não pela rota que ele também adicionou). Motivo, espelhando
  `admin-invite.ts` (mesma família — caminho cross-org sancionado do painel `/platform`):
  `"Rota do painel /platform que provisiona empresa cliente (Story 900-21/PR #498): chama provision_org() com service-role; a autorização acontece na rota (platform-guard.ts), não no SQL (platform/orgs/route.ts:75-76)"`.

  **Verificação de aritmética desta AC (corrigida — B4):**

  | Seção | Qtd |
  |---|---|
  | `plataforma` | 16 |
  | `itera-orgs` (19 implementações + 5 testes-irmãos) | 24 |
  | `alvos-onda-2` (9 rotas + 3 testes-irmãos, `nicole-health` já incluso nas 9) | 12 |
  | `legitimos` residual (9 webhooks + `admin-invite.ts` + `platform-query.ts` + `platform/orgs/route.ts` novo) | 12 |
  | **Subtotal (era `legitimos`, 62 originais)** | **64** = 62 + 2 achados (`nicole-health`, `platform/orgs/route.ts`) |
  | `legado` (intocado) | 178 |
  | **TOTAL** | **242** |

  A v1 desta AC somava `241` — errada em dois lugares que se cancelavam (contava `plataforma` como
  15 em vez de 16, e somava `+1` do `nicole-health` que já estava dentro do 12 de `alvos-onda-2`,
  contando-o duas vezes) — e ainda faltava o achado do `platform/orgs/route.ts`. **242 é o número
  certo, e o teste da AC1 tem que assertar `242` (ou `Object.values(json).flat/keys length` somado
  programaticamente) contra `PERMITIDOS.size` da regra ESLint pós-correção do B1 — nunca em prosa.**
  O plano estimava `~10` para `alvos-onda-2`; medido são 12 (3 pares de teste que o plano não contava
  separadamente).

  **[AUTO-DECISÃO, confirmada pelo @po] Webhooks (9) e `admin-invite.ts`/`platform-query.ts` (2)
  permanecem na chave `legitimos`, sem seção nova, sem motivo alterado.** O problema medido pelo
  dono do produto era especificamente sobre a string copiada dos **crons** ("cron cross-org: itera
  todas as orgs por desenho") — o motivo dos webhooks já é diferente e já é preciso ("webhook:
  resolve a org pelo payload, não tem sessão de usuário (900-24)"), e corrigir o *código* deles é
  explicitamente Passo 4/`900-24`, fora desta story. `src/app/api/platform/orgs/route.ts` entra na
  MESMA chave (não em `plataforma`), pela mesma razão que `admin-invite.ts` está lá: é código
  cross-org sancionado do painel, não dado de plataforma sem dimensão de org.

  **[AUTO-DECISÃO] `provision_org()` não gera número de migration nem entra na allowlist** — é uma
  função, não uma rota, e não usa `createAdminClient()` (roda com `SECURITY DEFINER`). Fora do
  escopo desta AC.

  **Correção obrigatória B1 — a própria regra ESLint precisa mudar.**
  `packages/web/eslint-rules/no-unscoped-admin-client.mjs:31` hoje faz:
  ```js
  const PERMITIDOS = new Set([...Object.keys(allowlist.legitimos ?? {}), ...(allowlist.legado ?? [])])
  ```
  Só lê `legitimos` e `legado`. Movendo 51 das 62 entradas atuais para `plataforma`/`itera-orgs`/
  `alvos-onda-2`, `PERMITIDOS` cai de 240 para 189 — **51 arquivos perdem a isenção em silêncio**
  (severidade da regra é `warn`, então nada quebra visivelmente — nenhum CI fica vermelho). Medido
  pelo @po, por mutação real (aplicada e revertida): mover `analytics-report/route.ts` de
  `legitimos` para `itera-orgs`, exatamente como esta AC manda, acendeu **2 warnings** num arquivo
  antes silencioso. **Correção:** `no-unscoped-admin-client.mjs` passa a unir as 5 chaves:
  ```js
  const PERMITIDOS = new Set([
    ...Object.keys(allowlist.plataforma ?? {}),
    ...Object.keys(allowlist["itera-orgs"] ?? {}),
    ...Object.keys(allowlist["alvos-onda-2"] ?? {}),
    ...Object.keys(allowlist.legitimos ?? {}),
    ...(allowlist.legado ?? []),
  ])
  ```
  Isto é código de aplicação (`packages/web/eslint-rules/`) — a frase "zero código de aplicação" do
  Scope IN item 1 da v1 desta story estava errada e foi removida (ver Scope).

  **Teste estrutural (`scripts/lib/allowlist-lint.ts` + `scripts/admin-client-allowlist.test.ts`):**
  função pura `validarAllowlist(json): Violacao[]` com **quatro** regras (Regra 0 acrescentada —
  correção B2):
  0. **Vivacidade das seções** — `plataforma`, `itera-orgs`, `alvos-onda-2` e `legitimos` existem e
     nenhuma é vazia; contagens mínimas: `plataforma.length >= 16`, `itera-orgs.length >= 24`,
     `alvos-onda-2.length >= 12`, `legitimos.length >= 12`. Sem esta regra, uma seção grafada errado
     (`iteraOrgs` em vez de `itera-orgs`) faz as Regras 1-3 iterarem zero entradas e devolverem `[]`
     — o mesmo "verde por vacuidade" da `900-3c` (medido pelo @po).
  1. **Caminho em duas seções** — nenhuma chave de `plataforma`/`itera-orgs`/`alvos-onda-2`/
     `legitimos` pode se repetir entre as quatro (comparação por união de `Object.keys`).
  2. **`itera-orgs` sem `:linha`** — todo motivo de `itera-orgs` precisa casar `/:\d+/` (permite
     `:52` e `:70-71`, ambos com dígito após `:`).
  3. **`alvos-onda-2` vencido** — todo `alvosExpiramEm` precisa ser uma data `>= hoje` (comparação
     `Date`); vencida ⇒ violação nomeando o arquivo e o prazo.

  **O carrasco real não é o `grep` nem só o `validarAllowlist` — é o próprio ESLint por AST
  (correção B2).** Testado pelo @po: um `grep -rl "createAdminClient("` acusa 195 arquivos, 4 fora
  da allowlist, dos quais **2 são falso positivo** (`src/lib/tenancy/platform-query-scan.ts` e seu
  teste — são o *scanner daquela string*, não um uso real; o ESLint por AST corretamente não os
  acusa). Um AC de `grep` mediria o arquivo, não o comportamento.

  **AC de catraca, executável, não descritiva:**
  ```bash
  cd packages/web && npx eslint src
  ```
  **Baseline medido nesta revisão (2026-08-29), antes de qualquer correção — exatamente 2
  arquivos, 4 warnings:**
  ```
  src/app/api/cron/nicole-health/route.ts
     2:10  warning  createAdminClient() usa service-role...  aios/no-unscoped-admin-client
    69:17  warning  createAdminClient() usa service-role...  aios/no-unscoped-admin-client
  src/app/api/platform/orgs/route.ts
    21:10  warning  createAdminClient() usa service-role...  aios/no-unscoped-admin-client
    75:14  warning  createAdminClient() usa service-role...  aios/no-unscoped-admin-client
  ```
  **Depois desta story, `npx eslint src` tem que sair com 0 ocorrências de
  `aios/no-unscoped-admin-client`.** Se sair diferente de 0 (nos dois arquivos acima ou em qualquer
  outro), a reestruturação regrediu (B1) ou a varredura perdeu outro arquivo (B3).

  **Verificação (mutação que reprova, controle de vivacidade obrigatório):**
  - Fixture em memória (não o arquivo real) com `analytics-report/route.ts` duplicado em
    `plataforma` **e** `itera-orgs` → `validarAllowlist` retorna 1 violação nomeando o caminho e as
    duas seções.
  - Fixture com uma entrada de `itera-orgs` cujo motivo não tem `:` seguido de dígito → 1 violação.
  - Fixture com `alvos-onda-2` tendo `alvosExpiramEm: "2020-01-01"` → 1 violação nomeando o arquivo
    e o prazo vencido.
  - **Fixture com a chave `itera-orgs` renomeada para `iteraOrgs`** → Regra 0 acende (seção
    ausente), nunca `[]` silencioso — é o controle de vivacidade que fecha o buraco que o @po achou.
  - **Controle positivo:** o arquivo real, pós-reescrita desta AC, roda `validarAllowlist` e
    retorna `[]` (zero violações) — se este caso não passar, as mutações acima não provam nada
    sobre o arquivo de verdade, só sobre a função.
  - `cd packages/web && npx eslint src` (pós-reescrita do JSON **e** da regra) sai **0**
    ocorrências de `aios/no-unscoped-admin-client` — não só no `nicole-health`, no `src` inteiro.
  - `PERMITIDOS.size` (regra ESLint, pós-correção B1) === `242` (ou o total programático lido do
    JSON) — assertado no teste, não em prosa.
  [Source: plano aprovado, Onda 2, Passo 1; medição direta desta story em 2026-08-29; correções
  obrigatórias B1-B4 de `docs/qa/po-validation-900-21b.md`;
  `packages/web/eslint-rules/no-unscoped-admin-client.mjs`; `packages/web/vercel.json`]

- [x] **AC2 — Duas `UNIQUE` parciais em `whatsapp_config` (Passo 3, parte 1):**
  ```sql
  CREATE UNIQUE INDEX whatsapp_config_phone_ativo ON whatsapp_config (phone_number_id)
    WHERE status = 'active' AND phone_number_id IS NOT NULL;

  CREATE UNIQUE INDEX whatsapp_config_org_ativo ON whatsapp_config (org_id)
    WHERE status = 'active';
  ```
  A segunda é a subestimada — mas seu alcance real é **menor do que a v1 desta AC afirmava**
  (correção C1 do @po, aplicada). São **31 call sites** com `.maybeSingle()`/`.single()` em
  `whatsapp_config` em `packages/web/src`, dos quais **27 filtram por `org_id`** — mas **só 18
  desses 27 também filtram `.eq("status","active")`**. Só para esses 18 o índice
  `whatsapp_config_org_ativo` (parcial, `WHERE status='active'`) torna a duplicata estruturalmente
  impossível. **Os outros 9 continuam expostos** — filtram só por `org_id`, então uma org com 1
  linha `active` + 1 linha `inactive` (que passa a existir a partir da AC4 desta mesma story, que
  semeia `whatsapp_config` `inactive` para org nova) continua devolvendo 2 linhas,
  `.maybeSingle()` continua `null`, o mesmo silêncio de antes:
  ```
  app/api/cron/bolsao-rebalance/route.ts:326         lib/notificacoes.ts:491
  app/api/cron/sla-alerts/route.ts:133                lib/notificacoes.ts:596
  lib/appointments/notify-imob-visit.ts:24            lib/notificacoes.ts:693
  lib/reports/send-daily-report.ts:21                 lib/notificacoes.ts:856
  lib/alerts/admin-whatsapp.ts:48
  ```
  **Esta AC fecha 18 dos 27 (67%); os outros 9 ficam nomeados como exposição residual, não
  resolvidos aqui** — o encaminhamento (`.eq("status","active")` nos 9, ou tornar o índice
  incondicional) é decisão de outra story, não desta. Uma AC que declarasse "27 call sites ficam
  seguros" sem essa ressalva fecharia o defeito só no papel — e a própria AC4 desta story (semeando
  `inactive`) torna o cenário residual **mais** provável, não menos.

  **Pré-condição, obrigatória rodar ANTES de aplicar, em cada ambiente (controle positivo
  read-only — nunca um script destrutivo):**
  ```sql
  -- as duas têm que devolver ZERO linhas antes de aplicar. Se voltar linha, a migration
  -- FALHA ao criar o índice (23505) — é isso que se quer descobrir, não contornar.
  SELECT phone_number_id, count(*) FROM whatsapp_config
    WHERE status = 'active' AND phone_number_id IS NOT NULL
    GROUP BY phone_number_id HAVING count(*) > 1;

  SELECT org_id, count(*) FROM whatsapp_config
    WHERE status = 'active'
    GROUP BY org_id HAVING count(*) > 1;
  ```

  **Verificação (mutação que reprova):**
  - No `trifold-crm-dev`, antes de aplicar: inserir uma segunda linha `active` no mesmo `org_id` de
    uma linha já existente (dado sintético, descartado depois) → `CREATE UNIQUE INDEX
    whatsapp_config_org_ativo` **tem que falhar** com `23505` — se passar, o índice não está fazendo
    nada e o resto da AC é teatro. Remover a linha sintética e reaplicar limpo.
  - Pós-aplicação: `INSERT` de uma segunda linha `active` no mesmo `org_id` (ou mesmo
    `phone_number_id`) → falha com `23505`, nomeando o índice violado.
  [Source: plano aprovado, Onda 2, Passo 3]

- [x] **AC3 — `org_integrations` (esqueleto, Passo 3 parte 2):**
  **Correção obrigatória B6 (@po): 6 providers, não 5 — `meta_ads` e `meta_capi` são linhas
  separadas.** Decisão do @po, três razões: (1) `status` é por linha — um cron pode ter o CAPI
  funcionando e o Ads quebrado (ou o inverso), e uma linha `meta` única não tem onde guardar dois
  estados independentes; (2) assimetria de reversibilidade — juntar depois é `DELETE`, separar
  depois é `ALTER` numa tabela que já roteia webhook (mesmo argumento que esta story já usa para
  `secret_ref`); (3) é o único jeito de "7 → 6" (a contagem do dono do produto) fechar sozinho:
  7 − `resend` = 6 só funciona com as duas linhas separadas. `dataset_id` sai do `config` de
  `meta_ads` e vai para `meta_capi`.
  ```sql
  CREATE TABLE org_integrations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('whatsapp', 'meta_ads', 'meta_capi', 'sienge', 'telegram', 'google')),
    status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'error')),
    config jsonb NOT NULL DEFAULT '{}',
    secret_ref text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, provider),
    -- Torna a decisão travada do plano EXECUTÁVEL, não só comentário (correção C2 do @po): WhatsApp
    -- resolve a org por whatsapp_config.phone_number_id (AC2), nunca por org_integrations — sem
    -- este CHECK, nada impede uma story futura de escrever phone_number_id aqui e recriar as duas
    -- fontes de verdade que a decisão existe para evitar.
    CONSTRAINT whatsapp_sem_identificador_proprio
      CHECK (provider <> 'whatsapp' OR NOT (config ? 'phone_number_id'))
  );

  CREATE INDEX idx_org_integrations_org ON org_integrations(org_id);

  -- Roteamento reverso do webhook Meta Ads (900-24, story futura): dado o page_id do payload,
  -- achar a org em O(1). NÃO existe índice equivalente para 'whatsapp' aqui — decisão travada do
  -- plano (reafirmada pelo dono do produto): WhatsApp resolve por whatsapp_config.phone_number_id
  -- (AC2 desta mesma migration), não por org_integrations. Ver nota "AUTO-DECISÃO" abaixo. O
  -- provider 'meta_capi' NÃO tem índice equivalente por page_id — ele guarda dataset_id, sem uso
  -- de roteamento reverso de webhook nesta onda.
  CREATE UNIQUE INDEX org_integrations_meta_page_ativo
    ON org_integrations ((config->>'page_id'))
    WHERE provider = 'meta_ads' AND config->>'page_id' IS NOT NULL;

  ALTER TABLE org_integrations ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "org_integrations_select" ON org_integrations
    FOR SELECT USING (org_id = public.user_org_id());

  CREATE POLICY "org_integrations_manage" ON org_integrations
    FOR ALL USING (org_id = public.user_org_id() AND public.is_admin());

  CREATE TRIGGER set_updated_at BEFORE UPDATE ON org_integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  ```
  - `secret_ref` **declarado e nulo** — a coluna existe só para a story do painel (futura,
    provavelmente `900-47`) não precisar de `ALTER TABLE` numa tabela que já roteia webhook.
  - `config` nasce com as chaves documentadas por provider (não impostas por DDL, jsonb é
    schema-less, mas **seed** — ver AC4): `meta_ads → {"page_id": null}`, `meta_capi →
    {"dataset_id": null}`. Os outros 4 providers (`whatsapp`, `sienge`, `telegram`, `google`) nascem
    com `config = '{}'`.
  - **RLS ligada, com policy de escrita** (regra R1 do gate de tenancy: RLS desabilitada em tabela
    com `org_id` é FAIL) — mesmo padrão de `whatsapp_config` (`whatsapp_config_select`/
    `whatsapp_config_manage`), usando `is_admin()` (nome do ADR-005) em vez de `user_role() =
    'admin'` (nome usado por `whatsapp_config`) — as duas funções existem no schema
    (`047_roles_permissions.sql`); esta tabela é nova, então segue o nome que o ADR já documentou.
  - **R3 do gate de tenancy** (tabela nova sem `org_id NOT NULL`): satisfeito, `org_id NOT NULL`.
  - **Trade-off aceito, nomeado:** `provider`/`status` são `CHECK IN (...)`, não uma tabela de
    lookup. Acrescentar um provider novo (Onda 7) exige migration nova — mesmo trade-off que
    `via` já aceitou em `trifold_migrations_aplicadas` (migration 245).

  **[AUTO-DECISÃO] Por que só UM índice de roteamento reverso (`meta_ads`), não dois como o texto
  original do plano sugeria ("os dois índices UNIQUE parciais de roteamento reverso... para
  `meta_ads`, `config->>'phone_number_id'` para `whatsapp`").** A seção "Decisões travadas" do
  MESMO plano, e a resposta do dono do produto a esta story, dizem o oposto: *"Resolução do
  WhatsApp | por `whatsapp_config.phone_number_id`, não por `org_integrations` | Evita duas fontes
  de verdade..."* — reafirmado agora com "o access token sai da mesma linha que resolve a org...
  sem lookup cruzado, sem duas fontes de verdade". As duas frases do plano se contradizem
  textualmente; a "Decisões travadas" é mais específica e foi reafirmada por último, então prevalece.
  Um índice `org_integrations ((config->>'phone_number_id'))` nunca é criado nesta story — se uma
  story futura decidir different, precisa reabrir esta decisão explicitamente, não presumir.

  **Verificação (mutação que reprova):**
  - `pnpm gate:tenancy` (ou o script equivalente, contra `trifold-crm-dev`) não reporta R1/R2/R3
    FAIL para `org_integrations`.
  - Inserir uma segunda linha `meta_ads` com o mesmo `config->>'page_id'` de outra linha (org
    diferente, dado sintético) → falha com `23505`.
  - `INSERT` de uma segunda linha `(org_id, provider)` repetida → falha (violação do `UNIQUE
    (org_id, provider)`), nomeando a constraint.
  - `SELECT * FROM org_integrations` autenticado como usuário de outra org → 0 linhas (RLS ativa).
  - `UPDATE org_integrations SET config = '{"phone_number_id": "5511999999999"}' WHERE provider =
    'whatsapp'` (dado sintético) → **falha**, nomeando `whatsapp_sem_identificador_proprio` — se
    passar, o `CHECK` da correção C2 não está fazendo nada.
  - `INSERT` de uma linha com `provider = 'meta'` (valor antigo, não mais válido) → falha no
    `CHECK (provider IN (...))`, prova de que só os 6 valores corretos são aceitos.
  [Source: plano aprovado, Onda 2, Passo 3; epic §900-21 (linha 816); ADR-005 §5; resposta do dono
  do produto, 2026-08-29 (integrações por empresa, WABA própria); decisão B6/correção C2 de
  `docs/qa/po-validation-900-21b.md`]

- [x] **AC4 — `provision_org()` semeia `whatsapp_config` + `org_integrations` (Passo 3 parte 3):**
  Reproduzir **integralmente** o corpo atual de `provision_org` (migration `240`, sem mudança de
  assinatura — continua `(p_name text, p_slug text) RETURNS uuid`) via `CREATE OR REPLACE FUNCTION`,
  inserindo os dois blocos novos **entre** o `INSERT INTO kanban_stages` (bloco 4 da função atual) e
  o `RETURN v_org_id;`:
  ```sql
  -- ---------------------------------------------------------------------------
  -- 5. whatsapp_config — skeleton inativo. Todo org tem que ter UMA linha (27 call
  --    sites fazem .eq('org_id', X).maybeSingle() nela); a ausência produz o mesmo
  --    silêncio que "config quebrada".
  -- ---------------------------------------------------------------------------
  INSERT INTO whatsapp_config (org_id, status)
  SELECT v_org_id, 'inactive'
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_config WHERE org_id = v_org_id);

  -- ---------------------------------------------------------------------------
  -- 6. org_integrations — catálogo disconnected por provider. resend fica de
  --    fora (decisão do dono do produto, 2026-08-29): permanece da plataforma.
  --    meta_ads e meta_capi são linhas SEPARADAS (decisão do @po, B6): status
  --    é por linha, e "Ads quebrado com CAPI funcionando" não tem casa numa
  --    linha única.
  -- ---------------------------------------------------------------------------
  INSERT INTO org_integrations (org_id, provider, status, config) VALUES
    (v_org_id, 'whatsapp',  'disconnected', '{}'),
    (v_org_id, 'meta_ads',  'disconnected', '{"page_id": null}'),
    (v_org_id, 'meta_capi', 'disconnected', '{"dataset_id": null}'),
    (v_org_id, 'sienge',    'disconnected', '{}'),
    (v_org_id, 'telegram',  'disconnected', '{}'),
    (v_org_id, 'google',    'disconnected', '{}')
  ON CONFLICT (org_id, provider) DO NOTHING;
  ```
  - `roleta_config`, `follow_up_rules`, `email_templates` e `properties` **ficam de fora**: a
    ausência delas é segura (org sem `roleta_config` simplesmente não participa da roleta — falha
    aberta e correta). Não confundir com `whatsapp_config`, que é indispensável.
  - Idempotência: `provision_org` já é idempotente por `slug` (reexecutar retoma o que falta); os
    dois blocos novos seguem esse contrato — `WHERE NOT EXISTS` para `whatsapp_config` (não tem
    `UNIQUE(org_id)` incondicional, só a parcial `WHERE status='active'` da AC2) e `ON CONFLICT` para
    `org_integrations` (tem `UNIQUE (org_id, provider)`).
  - **[DECIDIDO pelo @po — B6, substitui a discrepância "5 vs 6-7" da v1 desta AC.]** O dono do
    produto disse "o plano listava 7 providers; agora são 6". A v1 desta story tinha semeado 5
    (a tabela de decisão do dono do produto marcava 5 "sim" + `resend` "não"), registrando a
    discrepância sem resolver. O @po resolveu: **6**, com `meta_ads` e `meta_capi` como linhas
    distintas (`7 − resend = 6` só fecha com essa separação — ver justificativa completa acima na
    AC3). Providers seedados: `whatsapp`, `meta_ads`, `meta_capi`, `sienge`, `telegram`, `google`.

  **Verificação (mutação que reprova):**
  - `SELECT provision_org('Empresa Teste', 'empresa-teste-900-21b')` no `trifold-crm-dev` →
    `SELECT count(*) FROM whatsapp_config WHERE org_id = <retorno>` = 1, `status = 'inactive'`;
    `SELECT count(*) FROM org_integrations WHERE org_id = <retorno>` = **6**, todas `status =
    'disconnected'`.
  - Reexecutar `provision_org('Empresa Teste', 'empresa-teste-900-21b')` (mesmo slug) → contagens
    continuam 1 e **6** (idempotência, sem duplicar).
  - `SELECT config FROM org_integrations WHERE org_id = <retorno> AND provider = 'meta_ads'` →
    `{"page_id": null}`.
  - `SELECT config FROM org_integrations WHERE org_id = <retorno> AND provider = 'meta_capi'` →
    `{"dataset_id": null}`.
  [Source: plano aprovado, Onda 2, Passo 3; resposta do dono do produto, 2026-08-29; decisão B6 de
  `docs/qa/po-validation-900-21b.md`]

- [x] **AC5 — Backfill da(s) org(ns) já existente(s):**
  ```sql
  -- org_integrations: toda organizations sem as 6 linhas ganha as que faltam.
  INSERT INTO org_integrations (org_id, provider, status, config)
  SELECT o.id, p.provider, 'disconnected',
         CASE WHEN p.provider = 'meta_ads'  THEN '{"page_id": null}'::jsonb
              WHEN p.provider = 'meta_capi' THEN '{"dataset_id": null}'::jsonb
              ELSE '{}'::jsonb END
  FROM organizations o
  CROSS JOIN (VALUES ('whatsapp'), ('meta_ads'), ('meta_capi'), ('sienge'), ('telegram'), ('google')) AS p(provider)
  ON CONFLICT (org_id, provider) DO NOTHING;

  -- whatsapp_config: toda organizations sem NENHUMA linha ganha o skeleton inativo.
  -- Esperado: 0 linhas afetadas em produção (Trifold já tem whatsapp_config ativa) — a query
  -- existe para orgs de teste/dev criadas antes desta migration, não para mudar o dado real.
  INSERT INTO whatsapp_config (org_id, status)
  SELECT o.id, 'inactive'
  FROM organizations o
  WHERE NOT EXISTS (SELECT 1 FROM whatsapp_config wc WHERE wc.org_id = o.id);
  ```
  - `org_integrations.status = 'disconnected'` no backfill **não reflete** se a integração já está
    de fato configurada via env global (ex.: Sienge/Telegram da Trifold já funcionam hoje via env).
    Reconciliar `org_integrations.status` com a realidade é trabalho da story do painel — **fora do
    escopo desta story**, registrado para não confundir "linha existe" com "integração
    verificada".

  **Verificação (mutação que reprova):**
  - Pós-migration, no `trifold-crm-dev`: `SELECT count(*) FROM organizations o WHERE NOT EXISTS
    (SELECT 1 FROM org_integrations oi WHERE oi.org_id = o.id GROUP BY oi.org_id HAVING count(*) = 6)`
    → 0 (toda org tem exatamente 6 linhas).
  - `SELECT count(*) FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM whatsapp_config wc WHERE
    wc.org_id = o.id)` → 0 (toda org tem pelo menos uma linha de `whatsapp_config`).
  [Source: plano aprovado, Onda 2, Passo 3 ("mais o backfill da org existente")]

- [x] **AC6 — Produção não muda de comportamento (restrição inegociável do dono do produto):**
  Com uma única org (o caso real de produção hoje), todo caminho **existente de leitura** dá
  exatamente a mesma resposta antes e depois desta story. **Correção obrigatória B5 (@po): a
  verificação anterior ("qualquer rota... diff vazio") não era executável e não provava que a
  comparação enxergava diferença nenhuma — corrigida abaixo com lista fechada + célula de
  vivacidade.** Como se prova, item a item:
  1. **`whatsapp_config` (AC2), escopado à LEITURA (correção C6 — o `23505` é mudança intencional
     no caminho de ESCRITA, não afirmar "nenhum caminho muda" sem esse recorte):** as duas `UNIQUE`
     parciais são restrições de **escrita futura**, não filtram leitura nenhuma. Prova: `SELECT *
     FROM whatsapp_config WHERE org_id = <trifold-org-id>` devolve a mesma linha, com o mesmo `id`,
     antes e depois de aplicar a migration. **Medido pelo @po, reforça esta AC:** não existe hoje
     nenhum `insert`/`update`/`upsert` em `whatsapp_config` em `packages/web/src` — só leituras — 
     então o `23505` novo (AC2) não pode atingir nenhum caminho de escrita **existente**; ele só
     passa a valer para escrita futura (a story de onboarding/painel que vier a escrever nessa
     tabela).
  2. **`org_integrations` (AC3):** tabela nova, sem nenhum consumidor em `packages/`. Prova: `git
     grep -n "org_integrations" packages/` (pré-existente a esta story) → 0 ocorrências — nada lê
     nem escreve nela hoje, então criá-la não pode mudar resposta de rota nenhuma. **Confirmado pelo
     @po, medido de novo.**
  3. **`provision_org()` (AC4):** os blocos novos só executam quando a função é **chamada** (fluxo
     de criação de org nova, via `/platform/orgs/new` — a mesma rota corrigida pela B3 desta
     revisão). A org existente da Trifold não passa por `provision_org()` de novo — os blocos novos
     não a tocam. Prova: comparar `updated_at` da linha de `whatsapp_config` da Trifold, antes e
     depois da migration, é idêntico — nenhum `UPDATE` roda sobre ela.
  4. **Backfill (AC5):** aditivo por construção (`INSERT ... ON CONFLICT DO NOTHING` /
     `WHERE NOT EXISTS`) — nunca faz `UPDATE`/`DELETE` em linha existente.
  5. **Allowlist (AC1):** arquivo JSON consumido só por ESLint (lint-time) e pelo teste novo — não
     é importado por nenhum código de runtime. **Confirmado pelo @po, varredura do repo inteiro:**
     os únicos consumidores fora do executável são `docs/` e memórias de agente. Reclassificar
     entradas não muda comportamento de nenhuma rota em produção, por definição.

  **Verificação (mutação que reprova) — corrigida (B5), com lista fechada e célula de vivacidade:**

  1. **Enumerar, não "qualquer rota".** O instrumento é `pnpm test` completo (regressão de todo o
     código já testado) **mais** as seguintes 5 consultas SQL nomeadas contra `trifold-crm-dev`,
     capturadas ANTES e DEPOIS de aplicar a migration `246`:
     ```sql
     -- 1. Linha da org Trifold em whatsapp_config, por inteiro
     SELECT * FROM whatsapp_config WHERE org_id = (SELECT id FROM organizations WHERE slug = 'trifold' LIMIT 1);
     -- 2. Contagem total de linhas em whatsapp_config (não pode crescer para orgs já existentes)
     SELECT org_id, count(*) FROM whatsapp_config GROUP BY org_id ORDER BY org_id;
     -- 3. organizations inalterada
     SELECT id, name, slug, is_active, updated_at FROM organizations ORDER BY id;
     -- 4. Nenhum consumidor novo de org_integrations além do que esta story cria
     SELECT count(*) FROM org_integrations; -- pré-migration: erro "relation does not exist"; pós: >= (orgs × 6)
     -- 5. gate:tenancy sem FAIL novo
     ```
     As 5 saídas (pré e pós) vão coladas no Dev Agent Record — comparação linha a linha, não "diff
     vazio" declarado.
  2. **Célula de vivacidade, obrigatória antes de declarar "sem diferença" (é o que fecha o buraco
     que o @po achou — "diff vazio entre duas capturas que nunca aconteceram é verde igual"):**
     antes de rodar a comparação real, plantar uma diferença sintética e provar que o procedimento a
     **enxerga**:
     ```sql
     -- Plantar (dado sintético, em trifold-crm-dev):
     UPDATE whatsapp_config SET waba_id = waba_id || '-x'
       WHERE org_id = (SELECT id FROM organizations WHERE slug = 'trifold' LIMIT 1);
     -- Rodar a consulta 1 acima → TEM que vir diferente da captura "antes". Se vier igual, o
     -- procedimento de comparação está cego e nada do resto desta AC vale.
     -- Reverter:
     UPDATE whatsapp_config SET waba_id = replace(waba_id, '-x', '')
       WHERE org_id = (SELECT id FROM organizations WHERE slug = 'trifold' LIMIT 1);
     -- Só ENTÃO rodar o antes/depois de verdade da migration 246.
     ```
  3. `pnpm test` completo (não só os arquivos tocados) — nenhuma regressão em teste pré-existente.
  [Source: pedido central do dono do produto, restrição inegociável desta story; correções B5/C6 de
  `docs/qa/po-validation-900-21b.md`]

---

## Tasks / Subtasks

*(ordem: Task 1 é independente — pode rodar em paralelo com 2-5, que dependem umas das outras.
Task 2 depende de PR #525 mergeado OU do plano B de aplicação manual — ver Metadata, B7.)*

- [x] **Task 1 — Allowlist re-triada + regra ESLint atualizada (AC1) — @dev**
  - [x] 1.0 **(NOVA — B2)** Capturar o baseline ANTES de qualquer mudança: `cd packages/web && npx
    eslint src`, confirmar exatamente 2 arquivos / 4 warnings (`nicole-health/route.ts`,
    `platform/orgs/route.ts`); colar a saída no Dev Agent Record. Este é o controle de vivacidade
    que prova que a régua da Task 1.6 mede alguma coisa.
  - [x] 1.1 Reescrever `docs/audits/admin-client-allowlist.json` nas 5 chaves (`plataforma`,
    `itera-orgs`, `alvos-onda-2`, `legitimos` residual — incluindo `platform/orgs/route.ts`, B3 —,
    `legado` intocado), usando as listas exatas da AC1. Total esperado: **242** (B4).
  - [x] 1.2 **(NOVA — B1)** Atualizar `packages/web/eslint-rules/no-unscoped-admin-client.mjs:31`
    para unir as 5 chaves ao montar `PERMITIDOS`, não só `legitimos`+`legado`. Isto É código de
    aplicação — a Task 1 deixou de ser "zero código" (ver Scope IN).
  - [x] 1.3 Escrever `scripts/lib/allowlist-lint.ts` com `validarAllowlist(json): Violacao[]` e as
    **quatro** regras (Regra 0 vivacidade das seções + contagens mínimas — B2 —, caminho duplicado,
    `itera-orgs` sem `:linha`, `alvos-onda-2` vencido).
  - [x] 1.4 Escrever `scripts/admin-client-allowlist.test.ts` com as 4 mutações (incluindo a de
    Regra 0: seção renomeada) + o controle positivo (arquivo real → `[]`) + a asserção
    `PERMITIDOS.size === 242` contra a regra ESLint atualizada.
  - [x] 1.5 Rodar `cd packages/web && npx eslint src` (repo inteiro, não só `nicole-health`) e
    confirmar **0** ocorrências de `aios/no-unscoped-admin-client`; colar a saída no Dev Agent
    Record — este é o "depois" que fecha o baseline da Task 1.0.
  - [x] 1.6 Rodar `pnpm test scripts/admin-client-allowlist.test.ts` e colar a saída.

- [x] **Task 2 — Migration `246` (AC2 + AC3 + AC4 + AC5) — @data-engineer**
  - [x] 2.0 **(NOVA — B7)** Confirmar se PR #525 (Story 900-3c) já mergeou. Se **sim**: `pnpm
    db:apply`/`pnpm db:status` disponíveis, seguir 2.4/2.6 normalmente. Se **não**: aplicar via
    Management API direto (mesmo transporte de `scripts/lib/management-api.ts`/
    `reset-tenancy-testdb.ts`), documentando no Dev Agent Record qual caminho foi usado.
  - [x] 2.1 Reconfirmar o número de migration livre no dia da implementação (comando de varredura
    completa com `git fetch --prune origin` primeiro — ver `feedback_remedir_numeros_contra_o_banco`
    na memória do @sm). Medido nesta revisão em 2026-08-29: **`246` livre em todas as refs.**
    **Correção B8: `245_registro_de_migrations.sql` NÃO está em `origin/main`** (main está em
    `77f225d1`, maior migration lá é `244`); a `245` existe só em
    `refs/heads/story/900-3c-registro-migrations` / PR #525 (`OPEN`, `mergedAt: null`). `246`
    continua correta — a varredura por **todas as refs** (não só `main`) é justamente o que a
    enxerga e evita colidir com ela, que é o comportamento certo (mesma lição da `900-3b`/`900-3c`).
  - [x] 2.2 Rodar as duas queries de pré-condição da AC2 no `trifold-crm-dev` **e** em produção
    (read-only); colar os dois resultados (esperado: 0 linhas nos dois ambientes) no Dev Agent
    Record antes de escrever a migration.
  - [x] 2.3 Escrever `supabase/migrations/246_org_integrations_e_unicidade_whatsapp.sql` com: as
    duas `UNIQUE` parciais (AC2), `CREATE TABLE org_integrations` completo com **6** providers, RLS,
    o índice de roteamento reverso e o `CHECK whatsapp_sem_identificador_proprio` (AC3),
    `CREATE OR REPLACE FUNCTION provision_org` reproduzindo o corpo atual da `240` + os dois blocos
    novos com **6** linhas de `org_integrations` (AC4), o backfill com **6** providers (AC5), e um
    bloco `ROLLBACK (NFR-8)` em comentário no fim (padrão de `240`/`245`).
  - [x] 2.4 Aplicar no `trifold-crm-dev` via `pnpm db:apply` (se PR #525 mergeado) ou via
    Management API direto (Task 2.0); rodar as mutações de controle da AC2/AC3/AC4/AC5 (incluindo
    o `CHECK` do C2 e o `provider IN (...)` de 6 valores) e colar as saídas.
  - [x] 2.5 Rodar `pnpm gate:tenancy` contra `trifold-crm-dev` e confirmar 0 FAIL novo (R1/R2/R3
    para `org_integrations`).
  - [ ] 2.6 Aplicar em produção (migration é aditiva e não muda comportamento no caminho de
    leitura — AC6 — mesmo critério que a `900-3c` já usou para a `245`; **não** aplicar backfill de
    `whatsapp_config` em produção manualmente sem antes confirmar via AC6.1 que a linha da Trifold é
    preservada).

- [x] **Task 3 — Prova de não-regressão (AC6) — @data-engineer + @dev**
  - [x] 3.1 Rodar a célula de vivacidade da AC6 (plantar `UPDATE waba_id`, confirmar vermelho,
    reverter) ANTES de qualquer comparação real — se o procedimento não acender aqui, não prosseguir.
  - [x] 3.2 Capturar as 5 consultas SQL nomeadas da AC6 ANTES de aplicar a migration `246`.
  - [x] 3.3 Depois de aplicar (Task 2), capturar as mesmas 5 consultas de novo e comparar linha a
    linha com a captura da 3.2; colar as duas capturas + o diagnóstico no Dev Agent Record.
  - [x] 3.4 Rodar `pnpm test` completo (não só os arquivos novos); confirmar 0 regressão.
  - [x] 3.5 `git grep -n "org_integrations" packages/` (pré-migration, controle) → colar a saída
    (esperado 0, prova de que a tabela não tinha consumidor antes desta story).

---

## Dev Notes

### Numeração da migration — `246`, remedida em 2026-08-29. **Correção B8 (@po): a justificativa da v1 estava errada, embora a conclusão estivesse certa**
```bash
git fetch --prune origin
for r in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin); do
  git ls-tree --name-only "$r" -- supabase/migrations/ 2>/dev/null | sed 's|.*/||'
done | grep -oE "^[0-9]{3}[a-z]?_" | sort -u | tail -5
# → ..., 244_, 245_
```
**A v1 desta story dizia "`245_registro_de_migrations.sql` já está em `origin/main`" — isso é
FALSO**, medido pelo @po e reconfirmado aqui: `git show origin/main:package.json` não tem
`db:apply`/`db:status`, e `origin/main` está em `77f225d1` com maior migration `244`. A `245`
existe **só** em `refs/heads/story/900-3c-registro-migrations`, no PR #525 (`state: OPEN`,
`mergedAt: null`). **A escolha de `246` continua correta** — não porque `245` esteja em `main`, mas
porque a varredura **por todas as refs** (não só `main`) enxerga a `245` na branch do PR aberto e
evita colidir com ela; é exatamente o comportamento que essa varredura existe para garantir. Uma
premissa falsa que leva à conclusão certa é mais perigosa que uma que leva à errada — sobrevive à
revisão e é citada como fato depois. E ela escondia o **B7**: se `245` estivesse mesmo em `main`,
`db:apply`/`db:status` estariam disponíveis — não estão (ver Metadata, "Depends on"). Nenhum PR
aberto (114 branches remotas conferidas) carrega migration `246+`. **Reconfirmar de novo no dia da
implementação da Task 2** — mesma lição da `900-3c`: o número só é seguro até o próximo merge.

### Por que a allowlist tem uma seção `legitimos` residual, e não só as 4 seções do plano — números corrigidos (B3, B4)
O texto do plano diz "Quatro seções: `plataforma`... `itera-orgs`... `alvos-onda-2`... `legado`...".
Medido, com os números corrigidos desta revisão: as 4 seções somam `16 + 24 + 12 + 178 = 230`, mas o
total de entradas hoje (`legitimos` 62 + `legado` 178, **mais 2 achados desta story** — `nicole-health`
e `platform/orgs/route.ts` — = 242) é **242**. A diferença (12) é exatamente os 9 webhooks +
`admin-invite.ts` + `platform-query.ts` + `platform/orgs/route.ts` (12 no total, era 11 antes de o
@po achar o `platform/orgs/route.ts` — B3) — arquivos cujo motivo **já está correto** hoje (não é o
problema que este Passo resolve) e cuja correção de *código*, quando houver, é story futura, não
esta. Preservá-los sob a chave `legitimos`, sem tocar no conteúdo, é o caminho que não perde
governança (nenhum arquivo some da allowlist) nem expande o escopo que o dono do produto delimitou.

### `platform/orgs/route.ts` — o segundo arquivo à deriva, achado pelo @po (B3)
A story tinha lido o PR #498 pela migration `240` (para justificar a numeração `900-21b`) e não
tinha lido o #498 pela rota que ele também adicionou. `src/app/api/platform/orgs/route.ts` chama
`createAdminClient()` (`:75`) e `db.rpc("provision_org", ...)` (`:76`) — a mesma função que a AC4
desta story modifica — e nunca esteve na allowlist. Mesma classe de achado que `nicole-health`
(arquivo real, com uso real de `createAdminClient()`, fora de qualquer governança), mas por um
motivo diferente: `nicole-health` nasceu DEPOIS do congelamento (`51d21d1e`, 2026-08-28);
`platform/orgs/route.ts` nasceu ANTES (`544f3d73`, 2026-08-24) — foi um buraco desde o início, não
um arquivo novo. A lição para qualquer story futura de re-triagem: "arquivo criado depois do
congelamento" e "arquivo que a varredura por string simplesmente nunca cobriu" são dois modos de
falha diferentes, e a segunda é a mais perigosa porque não tem uma data que a denuncie.

### Regra ESLint precisa mudar junto com o JSON — a lição central desta revisão (B1, B2)
A v1 desta story tratou a re-triagem como "zero código de aplicação" porque o JSON, por si só, não
executa nada. O erro foi esquecer que **algo lê esse JSON em runtime de lint**:
`packages/web/eslint-rules/no-unscoped-admin-client.mjs` monta `PERMITIDOS` só a partir de
`legitimos`+`legado`. Toda reestruturação de um arquivo de dados que tem um consumidor programático
precisa perguntar "o consumidor lê a forma nova, ou só a antiga?" antes de declarar "zero código" —
o mesmo tipo de pergunta que a `900-15` já fez para `org-scoped-admin.ts`/`docs/audits/schema-snapshot.json`.
Generaliza: reestruturar forma de um artefato de dado sem reconferir cada consumidor programático é
o mesmo defeito, em roupagem de JSON, que os defeitos de `.maybeSingle()` que esta onda inteira
existe para fechar em SQL.

### `nicole-health` — o achado que a re-triagem por si só não pegaria sem checar contra o código real
```bash
$ npx eslint src/app/api/cron/nicole-health/route.ts
  2:10  warning  createAdminClient() usa service-role... aios/no-unscoped-admin-client
  69:17 warning  createAdminClient() usa service-role... aios/no-unscoped-admin-client
✖ 2 problems (0 errors, 2 warnings)
```
Criado em `51d21d1e` (2026-08-28, Story 87-19), **depois** do `congeladoEm: 2026-08-23` da
allowlist. A regra ESLint (`aios/no-unscoped-admin-client`) já o sinaliza — mas como severidade é
`warn`, ninguém percebeu. Mesmo padrão de travamento dos outros dois (`DEFAULT_ORG_ID` em `:31`,
usado em `:117,126,157,166`). Entra em `alvos-onda-2` como achado novo desta re-triagem, não como
item do plano original (que só citava `daily-report`/`nicole-agenda-reconcile` no texto do Passo 1,
mas cita `nicole-health` explicitamente na tabela do Passo 2 — a re-triagem desta story só formaliza
o que o Passo 2 já sabia).

**Correção C5 (@po): a classificação em `alvos-onda-2` não podia dizer só "travado".** O Passo 2 do
plano é explícito — `nicole-health` é *"reclassificação, não migração"*: avisa o admin da Trifold
quando a API de IA para, é vigia de plataforma, e migrá-lo para `forEachActiveOrg` criaria N
alertas para o mesmo incidente (o oposto do que o arquivo existe para evitar). `alvos-onda-2` é o
artefato de handoff que a `900-20`/próxima story de Passo 5 vai ler — se o motivo dissesse só
"travado", ao lado de `daily-report`/`nicole-agenda-reconcile` (que migram de verdade), o próximo
executor envolveria o `nicole-health` num loop por engano. A ressalva completa (remover os 5
filtros por `DEFAULT_ORG_ID`, incluir org no corpo do alerta, NÃO migrar) foi movida para dentro do
motivo da entrada no JSON (ver tabela de `alvos-onda-2` na AC1), não deixada só aqui no Dev Notes.

### Por que a data de `alvosExpiramEm` é `2026-09-30`
Não há uma regra do plano para a duração do prazo — decisão autônoma. 30 dias a partir da criação
desta story (2026-08-29) dá espaço para as stories seguintes da Onda 2 (Passo 2 =
`forEachActiveOrg`, provavelmente `900-23`; Passo 5 = correção dos defeituosos, provavelmente
`900-20`) rodarem no ritmo observado do epic (múltiplas fatias por semana). Se a Onda 2 atrasar além
disso, é exatamente o sinal que o teste estrutural existe para dar — forçar alguém a olhar de novo,
não deixar o prazo virar papel de parede.

### `org_integrations` — por que não populei o índice de roteamento reverso de `whatsapp`
Ver AC3, bloco "[AUTO-DECISÃO]". Resumo: o texto do Passo 3 do plano lista dois índices; a seção
"Decisões travadas" do mesmo documento e a resposta do dono do produto a esta story (ponto 3) dizem
que WhatsApp resolve por `whatsapp_config`, não por `org_integrations` — as duas fontes do plano se
contradizem, e a mais específica (e reafirmada por último) prevalece. **Confirmado pelo @po (C2):**
a decisão em si está certa, e a razão está registrada nos três lugares certos (comentário do SQL,
AC3, este Dev Notes) — mas faltava o carrasco. **Aplicado: `CONSTRAINT whatsapp_sem_identificador_proprio
CHECK (provider <> 'whatsapp' OR NOT (config ? 'phone_number_id'))`** na própria tabela (AC3). Sem
isso, nada impedia uma story futura de escrever `phone_number_id` na linha `whatsapp` de
`org_integrations` e recriar as duas fontes de verdade que a decisão existe para evitar — reabrir a
decisão sem o `CHECK` custava zero (um `UPDATE`); com ele, custa uma migration, que é exatamente o
custo que a decisão travada quis impor.

### Providers de `org_integrations` — 6, com `meta_capi` separado (decisão B6 do @po)
A v1 desta story semeava 5 providers (`whatsapp`, `meta_ads`, `sienge`, `telegram`, `google`) e
registrava, sem resolver, a divergência entre a contagem "7 → 6" do dono do produto e a tabela de
decisão dele mesmo (5 "sim" + `resend` "não"). O @po resolveu: **6**, separando `meta_ads` de
`meta_capi`. Argumento central: `status` é **por linha**, e uma org pode ter o CAPI funcionando com
o Ads quebrado (ou o inverso) — uma linha `meta` única não tem onde guardar dois estados
independentes. Reforçado pela assimetria de reversibilidade (juntar depois é `DELETE`; separar
depois é `ALTER` numa tabela que já roteia webhook) e pela aritmética do dono do produto só fechar
com a separação (`7 − resend = 6`). Consequência aplicada em AC3/AC4/AC5: `CHECK (provider IN
('whatsapp','meta_ads','meta_capi','sienge','telegram','google'))`, `dataset_id` sai do `config` de
`meta_ads` e vai para `meta_capi`, seed/backfill de 5 → 6 linhas por org.

### `role_default_permissions` — a outra metade de `900-21`, ainda pendente
O epic (linha 809-810) também atribui a `900-21` uma tabela `role_default_permissions` como fonte
única dos defaults por role × módulo, substituindo a duplicação `getHardcodedPermissions()`
(TS) ↔ SQL, com um "teste de paridade" entre as duas. **Nem a migration `240` nem esta story
entregam isso.** Fica como dívida nomeada — não é bloqueante para a Onda 2 (nenhum Passo do plano
depende dela), mas é uma AC do epic ainda sem story. Não é escopo desta story resolver; só registrar
para não se perder de novo.

### Vault confirmado — atualização de ADR-005 fora da autoridade do @sm
`docs/architecture/adr/adr-005-tenant-secrets-storage.md` tem `Status: Proposed — depende de
confirmar disponibilidade do Supabase Vault no plano atual`. Essa pergunta está **respondida**
(`supabase_vault v0.3.1` + `pgcrypto v1.3` confirmados nos dois projetos, 2026-08-29) — mas editar
o ADR é decisão do `@architect` (dono técnico do documento, conforme o próprio cabeçalho do ADR),
não do `@sm`. Registrado aqui para quem pegar a próxima story que toque `org_integrations.secret_ref`
levar a atualização junto.

### `platform_audit_log` — reforço aplicado em `docs/backlog.md`
A pedido do dono do produto ("trilha de quem leu qual segredo... reforce isso no item de backlog
que já existe"), foi adicionado um parágrafo ao item `[Epic 900] 🟡 900-16` existente em
`docs/backlog.md`, com a consequência nomeada: sem `platform_audit_log`, um platform admin lê o
token de WhatsApp de qualquer cliente (quando `secret_ref`/Vault existir, Onda 7) sem deixar rastro.
Não reabri a investigação nem editei o mérito do item — só acrescentei o parágrafo, append-only,
como o `Change Log` de qualquer story.

### WABA própria por cliente — pré-condição externa, não código
Toda empresa nova precisa de WABA própria com número verificado na Meta antes de o WhatsApp
funcionar para ela. Isso é providência de negócio/operação (cadastro na Meta Business Suite), não
uma Task desta story — mas é uma pré-condição real para a org nova operar, e por isso está
documentada aqui para quem for escrever a story do painel/onboarding (Onda 7).

### `supabase_migrations.schema_migrations` / ferramental de aplicação
Herdado da `900-3b`/`900-3c`, sem mudança nesta story: `pnpm db:status`/`pnpm db:apply` (via
`scripts/lib/management-api.ts`) são o caminho de promoção; `supabase db push` continua proibido
(prefixos duplicados + ledger nativo congelado + `CREATE INDEX CONCURRENTLY` em 4 arquivos
`_remote_only.sql`). O job de CI da `900-3c` (leitura pura, `pnpm db:status`) vai avisar
automaticamente se esta story trouxer `246` sem aplicar no teste.

### Testing Standards
Migration validada por execução real contra `trifold-crm-dev` (padrão já estabelecido pela
`900-3`/`900-3b`/`900-3c`), com evidência colada no Dev Agent Record. O teste estrutural da
allowlist (AC1) é Vitest puro (`scripts/**/*.test.ts`, já incluído em `vitest.config.ts`), sem
dependência de banco — roda em CI normalmente, sem job novo. **O carrasco de completude (B2) não é
Vitest — é `npx eslint src` de verdade**, rodado como comando (Tasks 1.0 e 1.5), porque é o único
instrumento que enxerga um `createAdminClient()` novo fora da allowlist sem depender da forma do
JSON estar certa.

---

## Testing

### Abordagem
- **AC1 (allowlist):** Vitest puro, sem banco — `pnpm test scripts/admin-client-allowlist.test.ts`
  — **mais** `cd packages/web && npx eslint src` (comando real, baseline 2 arquivos/4 warnings antes,
  0 ocorrências depois — B2). O teste Vitest cobre a *forma* do JSON; o ESLint cobre se o *runtime
  de lint* concorda com essa forma — as duas são necessárias, nenhuma sozinha basta (lição B1/B2).
- **AC2-AC5 (migration):** execução real contra `trifold-crm-dev`, evidência colada no Dev Agent
  Record — mesmo padrão de `900-3`/`900-3b`/`900-3c`. Sem suíte Vitest nova para o schema (é DDL,
  não lógica de aplicação); as mutações de controle são SQL direto via `pnpm db:apply`/Management
  API.
- **AC6 (não-regressão):** `pnpm test` completo + diff de resposta manual das rotas que leem
  `whatsapp_config`, antes/depois da migration no `trifold-crm-dev`.

---

## Change Log

| Data | Autor | Mudança |
|---|---|---|
| 2026-08-29 | @sm (River) | Draft inicial. Cobre Passos 1+3 da Onda 2 (plano aprovado). Numeração decidida: `900-21b` (não `900-16`, reservado como dívida P1 no backlog; não um número novo solto, porque o conteúdo de `org_integrations`/`provision_org` já pertence a `900-21` no epic, entregue em fatias). `alvos-onda-2` medido em **12**, não `~10` (plano estimava; diferença são os pares de teste + `nicole-health`, achado novo). Reverse-routing index de `org_integrations` restrito a `meta_ads` (contradição no texto do plano resolvida a favor da "Decisões travadas" + resposta do dono do produto). Providers seedados: 5 (`whatsapp`, `meta_ads`, `sienge`, `telegram`, `google`) — discrepância "7→6" do dono do produto registrada, não resolvida em silêncio, para o @po confirmar. Parágrafo append-only adicionado a `docs/backlog.md` (item `[Epic 900] 🟡 900-16`) reforçando a dependência de `platform_audit_log`. |
| 2026-08-29 | @sm (River) | **Revisão pós-NO-GO do @po** (`docs/qa/po-validation-900-21b.md`), 8 correções obrigatórias aplicadas com saída de execução real, não redação: **B1** — `no-unscoped-admin-client.mjs` passa a unir as 5 chaves (`Zero código de aplicação` removido do Scope); medido por mutação que 51 arquivos perdiam a isenção em silêncio. **B2** — Regra 0 de vivacidade (seções existentes/não-vazias/contagens mínimas) + carrasco real (`npx eslint src`, baseline medido = 2 arquivos/4 warnings hoje, alvo = 0). **B3** — `src/app/api/platform/orgs/route.ts` (achado do @po: 2 warnings, PR #498, chama a mesma `provision_org()` que a AC4 modifica) entra em `legitimos` residual (11 → 12). **B4** — aritmética corrigida: `plataforma` 15→**16** (`billing-monthly-summary` ocupa 2 chaves), removido o double-count do `nicole-health`; total **242** (não 241), assertado no teste. **B5** — AC6 ganhou lista fechada de 5 consultas SQL nomeadas + célula de vivacidade obrigatória (plantar `UPDATE waba_id`, provar vermelho, reverter, só então comparar de verdade). **B6** — decisão do @po: **6** providers, não 5 — `meta_ads`/`meta_capi` separados (`status` é por linha; fecha "7→6"); `dataset_id` migrou para `meta_capi`; AC3/AC4/AC5 atualizadas. **B7** — `Depends on: PR #525` declarado na Metadata, com plano B (Management API direta) se não tiver mergeado. **B8** — corrigida a premissa falsa "`245` já está em `origin/main`" (não está; existe só no PR #525 aberto) — a conclusão (`246` livre) continua certa, pela razão certa (varredura por todas as refs). **Recomendadas aplicadas:** C1 (AC2 escopada a 18/27 call sites, 9 nomeados como exposição residual), C2 (`CHECK whatsapp_sem_identificador_proprio` torna a decisão do WhatsApp executável, não só comentário), C5 (ressalva "reclassificação, não migração" do `nicole-health` movida para dentro do motivo em `alvos-onda-2`), C6 (AC6.1 escopada à leitura). **C3/C4 não aplicadas aqui** — são responsabilidade do próprio @po (nota de rastreabilidade no epic + registro da `900-21b` no epic), fora da autoridade do @sm. |

| 2026-08-29 | @dev (Dex) | **Implementação.** As 6 ACs cumpridas, cada uma com mutação executada e vermelho medido (M1/M2/M3 na allowlist; 23505 nos dois índices parciais; 23505/23514 nas 4 invariantes de `org_integrations`; RLS com fixture de duas orgs). **R1 aplicada** — a catraca do ESLint virou asserção dentro de `pnpm test` (subprocesso `--format=json` filtrado por `ruleId`, `cwd: packages/web`), com célula de vivacidade dos dois lados via `--stdin-filename`; `npx eslint src` sozinho sai `exit=0`, remedido por mim. **R2 aplicada pela opção (a)** — `PERMITIDOS` exportado e o JSON resolvido por `import.meta.url`; import da raiz saía `ENOENT` e agora devolve `242`. **R3 aplicada** — célula da AC6 em `BEGIN … ROLLBACK` com `coalesce(waba_id,'')`; provado por sha1 que a célula acende e que o `ROLLBACK` desfaz inclusive o `updated_at` do trigger. **Ressalvas do @po fechadas:** Regra 3 passou a iterar entradas (exige o campo, não só valida quem o tem); Context §2 corrigido de 5 para **6** providers com `dataset_id` em `meta_capi`; citação do plano B corrigida (`scripts/lib/management-api.ts` só existe no PR #525 — o transporte em `main` é o `runSql` inline de `reset-tenancy-testdb.ts:252`, com `splitStatements` em `:268`). **Duas divergências medidas e registradas, não normalizadas:** (1) o `trifold-crm-dev` não tem org `trifold` nem linha de `whatsapp_config`, então as consultas da AC6 escritas com `slug='trifold'` casariam zero linhas e a célula não acenderia — corrigido usando a org que existe e provando o zero de produção com controle de vivacidade; (2) a AC1 se contradizia (Regra 2 exige `:linha` em todo motivo de `itera-orgs`, mas prescrevia motivo sem `:linha` para os 5 testes-irmãos) — fechado acrescentando o `arquivo:linha` da implementação ao motivo do teste, em vez de abrir exceção por sufixo `.test.ts`. **Task 2.6 (produção) não executada** — é do `@devops`; produção só foi lida. |

---

## Dev Agent Record

### Agent Model Used
`claude-opus-5[1m]` — @dev (Dex), modo YOLO, 2026-08-29.

### Debug Log References
Branch `story/900-21b-allowlist-org-integrations`, criada de `origin/main` (`77f225d1`).
Transporte SQL: **plano B** (ver Task 2.0). Credenciais e PAT ficaram fora do repositório; nenhuma
saída crua de subcomando remoto foi colada aqui, e a única linha de `whatsapp_config` de produção
nunca foi impressa (a AC6.1 compara **sha256 da linha inteira** + colunas não-sensíveis, porque
`SELECT *` traz `access_token`/`verify_token`).

---

### 1. AC1 — allowlist re-triada, regra ESLint e as duas réguas

**Task 1.0 — baseline, ANTES de qualquer mudança** (`cd packages/web && npx eslint src`):

```
ocorrências: 4
  - src/app/api/cron/nicole-health/route.ts:2
  - src/app/api/cron/nicole-health/route.ts:69
  - src/app/api/platform/orgs/route.ts:21
  - src/app/api/platform/orgs/route.ts:75
exit do eslint (sem filtro): 0        ← R1 confirmada: a catraca não tinha dentes
```

Reproduz o baseline da AC1 **byte a byte** (2 arquivos, 4 warnings, linhas 2/69/21/75) e a medição
do @po. O `exit=0` é a R1 medida por mim, não herdada.

**Task 1.1 — reescrita do JSON.** Conferência programática na geração (aborta se perder entrada):

```
plataforma: 16 | itera-orgs: 24 | alvos-onda-2: 12 | legitimos: 12
união das 4 seções: 64 | legado: 178 | TOTAL: 242
perdidos: []
novos: ["src/app/api/cron/nicole-health/route.ts","src/app/api/platform/orgs/route.ts"]
legado idêntico (ordem+conteúdo): true | _aviso idêntico: true | congeladoEm idêntico: true
```

**Todos os 19 `arquivo:linha` de `itera-orgs` foram reconferidos contra o código** (não copiados da
story): os 19 casaram exatamente. Idem `daily-report:16/33`, `nicole-agenda-reconcile:30/76`,
`nicole-health:31,117,126,157,166`, `meta-ads-intelligence:231`, `meta-capi-dispatch:101-103`,
`followup:168`/`:192`, `purge-rejected-uploads:29-33`, `keep-alive:24`, `platform/orgs:21,75-76`, e
os 4 comentários de `plataforma` (`billing-collection-health:145`, `billing-cost-anomaly:156`,
`billing-monthly-summary:222`, `billing-reminders:27,190`). Órfãos reconferidos contra
`vercel.json`: **37 crons agendados, 40 diretórios, órfãos = calendly-sync, supremo-history-sync,
supremo-sync**.

**Task 1.2 + R2 — regra ESLint.** Aplicada a união das 5 chaves (B1) **e** a correção de causa raiz
da R2: a resolução do JSON passou de `join(process.cwd(), "..", "..")` para
`import.meta.url`, e `PERMITIDOS` virou `export`. Medido antes e depois, da **raiz** do repo:

```
antes:  import("./packages/web/eslint-rules/…mjs")  →  ENOENT '/Users/docs/audits/…json'
depois: import("./packages/web/eslint-rules/…mjs")  →  PERMITIDOS.size = 242
```

Escolhida a opção **(a)** do parecer (exportar + `import.meta.url`), não a (b): ela conserta a causa
(a regra só carregava com `cwd === packages/web`) e torna a asserção-ponte literal. O subprocesso do
R1 continua sendo o carrasco de completude — os dois convivem, cada um medindo uma coisa.

**Task 1.5 — depois:**

```
aios/no-unscoped-admin-client — ocorrências: 0
total warnings em src (todas as regras): 31     (eram 35; os 4 que sumiram são os do baseline)
total errors em src: 0
```

**Task 1.6 — `pnpm test scripts/admin-client-allowlist.test.ts`: 15 testes, 15 passando, 16,03 s.**

#### As mutações — vermelho medido, com shasum de restauração

| # | mutação (no arquivo em disco) | resultado |
|---|---|---|
| **M1** | tirar `nicole-health/route.ts` da allowlist (`grep -c` = 0 no disco) | **4 testes vermelhos**: `validarAllowlist` do arquivo real ≠ `[]`, união 241≠242, `PERMITIDOS.size` 241≠242, e `eslint src` volta a acusar 2 ocorrências |
| **M2** | reverter a regra para ler só `legitimos`+`legado` (estado pré-B1) | **3 vermelhos**: `PERMITIDOS.size` = **190** (não 242) e `eslint src` acusa **85 ocorrências**; a célula de vivacidade também acende do lado errado (`analytics-report` deixa de ser isento) — é a B1 reproduzida por execução |
| **M3** | grafar `iteraOrgs` no arquivo **real** | **5 vermelhos**, incluindo a Regra 0 (`seção "itera-orgs" ausente`) e `PERMITIDOS.size` = 218 |

Restauração conferida por `shasum`, não por `git diff`:
`501550334baede5afdfc28148024d188d89a0d40  docs/audits/admin-client-allowlist.json` ·
`2157a8650c50754ee414d07903c096ba44cca947  packages/web/eslint-rules/no-unscoped-admin-client.mjs`
— idênticos antes e depois das três mutações; suíte de volta a **15/15**.

#### Vivacidade da própria catraca (adição minha, não pedida pela AC)

"Zero ocorrências" é indistinguível de "o ESLint não rodou" e de "a allowlist isentou o repo
inteiro". O teste prova os **dois lados** por `--stdin-filename`, sem escrever nada em `src/`:

```
mesmo código-fonte, caminho FORA da allowlist  (cron/__vivacidade_900_21b__/route.ts)  → 2 hits
mesmo código-fonte, caminho DENTRO             (cron/analytics-report/route.ts)        → 0 hits
```

E a varredura de `src` só é aceita se analisou **> 100 arquivos**.

#### Divergências entre a story e o que foi implementado (AC1)

1. **Contradição interna da AC1, fechada.** A AC manda que a Regra 2 exija `/:\d+/` em **todo**
   motivo de `itera-orgs`, e ao mesmo tempo prescreve para os 5 testes-irmãos o motivo
   `"teste do item acima — classificação segue o arquivo de implementação"`, **sem `:linha`**. As
   duas coisas juntas fazem o controle positivo (arquivo real → `[]`) falhar com 5 violações.
   **Resolvido acrescentando o `arquivo:linha` da implementação ao motivo do teste**
   (`"…(boleto-scan/route.ts:130)"`), em vez de abrir exceção para `*.test.ts` na Regra 2 — exceção
   por sufixo de nome seria um buraco permanente na régua, e o motivo fica mais informativo, não
   menos. Mesmo tratamento nos 3 testes-irmãos de `alvos-onda-2`.
2. **Regra 3 fechada pela ressalva do @po**: redigida sobre **entradas**, não sobre o campo — toda
   entrada de `alvos-onda-2` **tem** `alvosExpiramEm` no formato `YYYY-MM-DD` **e** ele é `>= hoje`.
   Sem isso, uma 13ª entrada sem o campo nunca venceria e a Regra 0 (`>= 12`) a aceitaria: isenção
   com prazo virando permanente pela porta dos fundos. Coberto por teste próprio.
3. **`alvos-onda-2` não ganhou campo `classe`.** [AUTO-DECISÃO] A AC tem uma coluna "Classe" na
   tabela, mas um campo que nenhuma regra verifica é peso morto que apodrece calado; a classe vai
   como prefixo do `motivo` (`travado:`, `defeituoso:`, `órfão não agendado:`), que é o que a
   própria AC faz no motivo do `nicole-health`.
4. **`PERMITIDOS.size === 242` é literal de propósito**, e o teste também assere o total lido do
   JSON contra o mesmo literal. Derivar o esperado da fonte que se vigia não reprova a fonte. Custo
   aceito e nomeado no código: mexer na allowlist obriga a mexer no número, em diff, com dono.

---

### 2. AC2/AC3/AC4/AC5 — migration `246`

**Task 2.0 (B7) — qual caminho foi usado.** PR #525 medido em 2026-08-29:
`{"number":525,"state":"OPEN","mergedAt":null}`, e `git show origin/main:package.json | grep -c
"db:apply\|db:status"` → **0**. Logo, **plano B**. Correção de fato: a Metadata mandava usar
`scripts/lib/management-api.ts`, que **também só existe no #525** (ressalva do @po). O transporte
que existe em `origin/main` é o `runSql` **inline** de `scripts/reset-tenancy-testdb.ts:252`, com
`splitStatements` exportado em `:268` — reproduzido num script de scratchpad (não versionado), com
o alvo resolvido por `scripts/lib/db-env.ts` (`resolverAmbiente`), que imprime o banner do ambiente
a cada chamada.

**Task 2.1 — número.** Após `git fetch --prune origin`: maiores prefixos em **todas** as refs =
`240,241,242,243,244,245`; varredura por ref procurando `246` → **nenhuma**. `245` está só em
`refs/heads/story/900-3c-registro-migrations` (PR #525 aberto), não em `main` — B8 confirmada.

**Task 2.2 — pré-condições da AC2 (read-only nos dois ambientes):**

```
teste     (xnxvygyfyyyzwhiuoehz):  []     ← zero duplicatas
produção  (dsopqkqjkmhytudaaolv):  []     ← zero duplicatas   (somente leitura)
```

**Controle de vivacidade das pré-condições** (mesma query com `HAVING count(*) > 0`) — e é aqui que
aparece a primeira divergência material:

```
teste:     []                                     ← whatsapp_config está VAZIA no dev
produção:  [{"chk":"phone_grp","n":1},{"chk":"org_grp","n":1}]
```

> **Divergência 1 — o `trifold-crm-dev` não tem a org `trifold` nem linha de `whatsapp_config`.**
> Medido: `organizations` = 1 linha, `slug = "org-teste-epic-900"`; `whatsapp_config` = **0 linhas**.
> Consequência direta: as consultas da AC6 e a célula de vivacidade, escritas com
> `WHERE slug = 'trifold'`, casariam **zero linhas** no dev — o `UPDATE` afetaria 0 linhas, a célula
> **não acenderia**, e a AC mandaria concluir *"o procedimento está cego"*. É a mesma classe de erro
> que a R3 apontou (procedimento que produz diagnóstico errado), por outra porta. **Corrigido**
> usando a org que de fato existe no ambiente (`ORDER BY created_at, id LIMIT 1`) e provando o zero
> de produção com o controle acima, em vez de aceitá-lo por vacuidade.

**Task 2.3 — `provision_org` reproduzida integralmente.** Provado por comparação de bytes (comentários
e espaço normalizados), não por leitura:

```
corpo 240: 2617 chars · corpo 246: 3183 chars
246 começa com o corpo da 240 inteiro até `RETURN v_org_id;`  →  True
delta = exatamente os blocos 5 (whatsapp_config, WHERE NOT EXISTS)
        e 6 (org_integrations, 6 linhas, ON CONFLICT DO NOTHING)
```

**Task 2.4 — AC2, mutações que reprovam** (todas em `BEGIN … ROLLBACK`, no `trifold-crm-dev`):

| caso | resultado |
|---|---|
| 2 linhas `active` da **mesma org** → `CREATE UNIQUE INDEX whatsapp_config_org_ativo` | `ERROR 23505: could not create unique index … Key (org_id)=(0000…0001) is duplicated` |
| 2 linhas `active` com o **mesmo `phone_number_id`** (orgs distintas) → `whatsapp_config_phone_ativo` | `ERROR 23505: … Key (phone_number_id)=(MESMO-PHONE) is duplicated` |
| **controle negativo:** as mesmas 2 linhas, a segunda `inactive` | índice **cria normalmente** — o predicado parcial discrimina, não é unicidade cega |

**Task 2.4 — AC3, mutações que reprovam** (pós-aplicação):

| caso | resultado |
|---|---|
| `INSERT` repetindo `(org_id, provider)` | `23505 … "org_integrations_org_id_provider_key" … Key (org_id, provider)=(0000…0001, whatsapp)` |
| mesmo `config->>'page_id'` em **duas orgs** | `23505 … "org_integrations_meta_page_ativo" … Key ((config ->> 'page_id'))=(132027046650861)` |
| **controle negativo:** `page_id` **distinto** nas duas orgs | passa — `"dois page_id distintos convivem"` |
| `UPDATE … config='{"phone_number_id":…}' WHERE provider='whatsapp'` | `23514 … violates check constraint "whatsapp_sem_identificador_proprio"` |
| **controle negativo:** a **mesma chave** em `provider='meta_ads'` | passa — o `CHECK` morde só `whatsapp`, como desenhado |
| `INSERT … provider='meta'` (valor antigo) | `23514 … violates check constraint "org_integrations_provider_check"` |

**RLS — fixture com DUAS orgs** (uma org só não distingue "filtrou certo" de "não filtrou"):
org B criada por `provision_org`, usuário admin sintético da org B, `SET LOCAL ROLE authenticated` +
`request.jwt.claims`, tudo em `BEGIN … ROLLBACK`:

```
visiveis_total: 6 | visiveis_da_propria_org_b: 6 | visiveis_da_org_a: 0 | sou_admin: true
(a tabela tinha 12 linhas nesse instante — 6 de A + 6 de B)
```

**Task 2.4 — AC4, `provision_org` (em `BEGIN … ROLLBACK`, chamada DUAS vezes com o mesmo slug):**

```
wa_linhas: 1 · wa_status: ["inactive"]
oi_linhas: 6 · oi_status: ["disconnected"]
oi_providers: ["google","meta_ads","meta_capi","sienge","telegram","whatsapp"]
cfg_meta_ads:  {"page_id": null}
cfg_meta_capi: {"dataset_id": null}
```

Idempotência: as contagens acima são **depois da segunda chamada**. [AUTO-DECISÃO] rodei em
transação revertida em vez de deixar `empresa-teste-900-21b` no dev — mesma evidência, zero resíduo,
e a captura da AC6 não fica contaminada por uma org que a story não pediu para existir.

**Task 2.4 — AC5, cobertura do backfill (com controle de vivacidade):**

```
orgs_sem_exatamente_6:        0     ← o que a AC pede
controle_vivacidade_com_5:    1     ← a MESMA query com "= 5" devolve 1; o 0 acima não é por vacuidade
orgs_sem_whatsapp_config:     0
orgs: 1 · org_integrations: 6
```

**Task 2.5 — `gate:tenancy`.** Primeira execução caiu em **modo snapshot contra o ref de PRODUÇÃO**
(`"fonte":"snapshot"`, `projectRef: dsopqkqjkmhytudaaolv`) — resultado que não diz nada sobre a
tabela nova. Refeita com introspecção ao vivo (`SUPABASE_MANAGEMENT_PAT` + `TENANCY_TARGET_REF`):

```
Gate de tenancy — R1-R4  (fonte: management-api, projeto: xnxvygyfyyyzwhiuoehz)
Violações por regra: { R1: 1, R2: 57, R3: 3, R6: 20, R7: 10, R8: 1 }
violações mencionando "org_integrations" no relatório inteiro: 0
R1 = supremo_sync_log · R3 = lead_facts, lead_memories, trifold_migrations_aplicadas
```

**`org_integrations` não aparece em violação nenhuma** — R1 (RLS ligada), R2 (policies) e R3
(`org_id NOT NULL`) satisfeitas. A **catraca do gate acusa `delta +8`, e isso é artefato de
medição, não regressão desta story**: o baseline (83 FAIL, 2026-08-23) foi medido contra
**produção**, e esta execução introspecta o **banco de teste**, que tem outro schema — as 3 R3 são
`lead_facts`/`lead_memories` (MemPalace, nunca existiram em produção) e `trifold_migrations_aplicadas`
(migration `245`, do PR #525, aplicada ao dev por aquela story). Nenhuma das 8 é minha.
Efeito colateral conhecido tratado: o gate **reescreve `docs/audits/gate-tenancy-report.json`**, que
é rastreado; restaurado com `git checkout --` nas duas execuções (`git status` limpo para ele).

**R9 é cego aqui, por construção.** `rodarR9()` usa `git diff --diff-filter=A origin/main...HEAD`,
que não enxerga arquivo **não commitado** — a migration `246` existe na árvore de trabalho, e o gate
imprimiu *"R9: nenhuma migration nova em relação a origin/main"*. Não é falha do gate; é o
`git diff` medindo commits. **R9 só passa a medir esta migration depois do commit** — quem fizer o
commit (fora da minha autoridade) deve rodar o gate de novo.

---

### 3. AC6 — produção não muda de comportamento

**Task 3.5 — controle prévio.** `git grep -n "org_integrations" -- packages/` → **nenhuma
ocorrência** (`exit=1`). Vivacidade do mesmo comando: `git grep -c "whatsapp_config" -- packages/`
devolve dezenas de arquivos. Ou seja: `org_integrations` nasce sem consumidor nenhum.

**Task 3.1 — célula de vivacidade, na forma corrigida pela R3** (`BEGIN … ROLLBACK` +
`coalesce(waba_id,'')`), rodada **antes** de qualquer comparação real. Como o dev não tem linha de
`whatsapp_config` (Divergência 1), a célula planta o cenário completo dentro da transação: cria a
linha, aplica o `UPDATE … coalesce(waba_id,'') || '-x'` **literal** da correção do @po, e também
mexe em `organizations.name` para que as 5 consultas sejam exercitadas.

```
captura "antes"            sha1 = 2a4cc195c5b4b223cf72896f84cf335996380cb5
captura dentro da célula   sha1 = 90c5d362d9673749b435d344650f4456d1715a2c   ← DIFERENTE: enxerga
captura depois do ROLLBACK sha1 = 2a4cc195c5b4b223cf72896f84cf335996380cb5   ← IDÊNTICA: zero resíduo
```

O `updated_at` de `organizations` **moveu dentro da transação** (`17:39:41` → `21:30:35`), que é
exatamente o efeito do trigger que a R3 descreve — e voltou ao valor original no `ROLLBACK`. É a
prova de que o `ROLLBACK` desfaz o trigger, e não só o valor.

**Tasks 3.2/3.3 — as 5 consultas nomeadas, antes e depois da `246` no `trifold-crm-dev`:**

| # | consulta | antes | depois | veredito |
|---|---|---|---|---|
| 1 | linha de `whatsapp_config` da org existente | `[]` | 1 linha, `status="inactive"`, sha256 `5bd5109d…` | **muda no dev, por desenho** (AC5: org sem linha ganha o skeleton) |
| 2 | `whatsapp_config` por org | `[]` | `[{org_id: 0000…0001, n: 1}]` | idem |
| 3 | `organizations` (id, name, slug, is_active, updated_at) | 1 linha | **idêntica, byte a byte** | **inalterada** |
| 4 | `org_integrations` | `"tabela nao existe"` | `"6"` | tabela nova, 1 org × 6 providers |
| 5 | total de `whatsapp_config` | `0` | `1` | idem 1/2 |

A consulta 1 sai como **sha256 da linha inteira** (`SELECT *` canônico) mais colunas não-sensíveis:
`SELECT *` traz `access_token`/`verify_token`, e segredo não vai para arquivo rastreado. A célula de
vivacidade prova que o hash **muda** quando a linha muda, então a comparação por hash tem o mesmo
poder discriminante do `SELECT *` colado — sem o vazamento.

**A prova que a AC6 realmente pede é sobre produção, e ela é read-only:**

```
-- dsopqkqjkmhytudaaolv, somente leitura
wa_backfill_afetaria:  0     ← o INSERT de whatsapp_config da AC5 não toca NENHUMA linha em produção
wa_orgs_com_linha:     1     ← controle: o 0 acima não é por `organizations` estar vazia
oi_backfill_criaria:   6     ← linhas novas numa tabela sem consumidor (Task 3.5)
orgs:                  1
```

Item a item da AC6:
1. **`whatsapp_config` (leitura):** os dois índices são parciais e só restringem **escrita**;
   nenhuma leitura é filtrada por eles. A linha da Trifold não é tocada — o backfill afetaria 0
   linhas lá, medido acima.
2. **`org_integrations`:** 0 consumidores em `packages/` antes desta story (medido, com vivacidade).
3. **`provision_org()`:** os blocos novos só rodam quando a função é **chamada**; a org existente não
   passa por ela de novo. No dev, `organizations` ficou **idêntica** antes/depois (consulta 3).
4. **Backfill:** só `INSERT`, com `ON CONFLICT DO NOTHING` / `WHERE NOT EXISTS`. Nenhum `UPDATE`,
   nenhum `DELETE` — verificável por leitura do arquivo.
5. **Allowlist:** JSON lido só em lint-time; `git grep` confirma zero import em runtime.

**Task 3.4 — suíte completa (`pnpm test`): 273 arquivos, 3501 testes passando, 6 `expected fail`,
0 falhas.** Nenhuma regressão em teste pré-existente.

> **Divergência 2 — a AC6 diz "a contagem de `whatsapp_config` não pode crescer para orgs já
> existentes", e no `trifold-crm-dev` ela cresce (0 → 1).** Não é violação: é exatamente o caso que
> a AC5 antecipa por escrito (*"a query existe para orgs de teste/dev criadas antes desta migration,
> não para mudar o dado real"*). A restrição do dono do produto é sobre **produção**, e lá o mesmo
> `INSERT` afeta **0 linhas** — provado read-only, com controle de vivacidade. Registrado em vez de
> normalizado para fora da comparação.

---

### 4. Verificações finais

| comando | resultado |
|---|---|
| `pnpm lint --force` | 8/8 tarefas OK — **0 errors**, 32 warnings (nenhum de `aios/no-unscoped-admin-client`) |
| `pnpm type-check --force` | 8/8 tarefas OK, `tsc --noEmit` limpo |
| `tsc` de `scripts/` (o CI não cobre) | **0 erros** em `scripts/lib/allowlist-lint.ts` e `scripts/admin-client-allowlist.test.ts`; os erros restantes são pré-existentes, em 18 scripts que esta story não toca |
| `pnpm test` | 273 arquivos · 3501 passando · 0 falhas |
| estado final do `trifold-crm-dev` | `orgs: 1 · org_integrations: 6 · whatsapp_config: 1 · users: 0 · índices novos: 4` — nenhum dado sintético sobreviveu |

### O que NÃO pôde ser medido

1. **Task 2.6 (aplicar em produção)** — fora da minha autoridade. Produção só foi **lida**. O
   `@devops` aplica; a evidência para decidir já está acima (as duas pré-condições zeradas, o
   backfill de `whatsapp_config` afetando 0 linhas, e a tabela nova sem consumidor).
2. **R9 do gate de tenancy** sobre a migration `246` — cego para arquivo não commitado (ver §2).
3. **`pnpm db:apply` / `pnpm db:status` e o job de CI da `900-3c`** — não existem em `origin/main`;
   quando o #525 mergear, o job vai avisar se a `246` não estiver aplicada no teste (ela está).
4. **A catraca do `gate:tenancy` contra um baseline de produção** — comparação entre schemas
   diferentes; o que vale desta execução é "0 violação em `org_integrations`", não o delta.

### File List

**Modificados**
- `docs/audits/admin-client-allowlist.json` — re-triado em 5 chaves (16/24/12/12/178 = 242);
  `_aviso`, `congeladoEm` e `legado` byte-idênticos; `reclassificadoEm: "2026-08-29"` acrescentado.
- `packages/web/eslint-rules/no-unscoped-admin-client.mjs` — união das 5 chaves (B1), resolução por
  `import.meta.url` e `export const PERMITIDOS` (R2), cabeçalho reescrito para descrever as 5 seções.
- `docs/stories/900-21b-allowlist-retriada-e-org-integrations.story.md` — checkboxes, Status,
  Change Log, este Dev Agent Record; **mais** duas correções de fato fora do Dev Agent Record,
  nomeadas no Change Log: Context §2 (5 → 6 providers, `dataset_id` em `meta_capi`) e a citação do
  plano B na Metadata (`scripts/lib/management-api.ts` não está em `main`).
- `docs/backlog.md` — parágrafo do `@sm` sobre `platform_audit_log`, transportado da branch anterior
  para esta (nenhuma edição de mérito minha).
- `docs/stories/epics/epic-900-saas-multi-tenant.md` — C3/C4 do `@po`, já na árvore de trabalho.

**Criados**
- `supabase/migrations/246_org_integrations_e_unicidade_whatsapp.sql`
- `scripts/lib/allowlist-lint.ts`
- `scripts/admin-client-allowlist.test.ts`

---

## QA Results

### Review Date: 2026-08-29

### Reviewed By: Quinn (Test Architect)

**Veredito: PASS.** As 6 ACs cumpridas. Reproduzi por execução, e não aceitei por relato, TODAS as
alegações do Dev Agent Record; acrescentei duas medições que faltavam e que são as que de fato
sustentam a restrição do dono do produto.

**O que remedi (execução minha, neste gate):**

| Alegação | Resultado |
|---|---|
| `16/24/12/12/178 = 242`, `perdidos: []`, `novos: 2`, `legado`/`_aviso`/`congeladoEm` byte-idênticos | **CONFERE** — contra `git show origin/main:…json`; interseção das 4 seções com `legado` também vazia |
| 0 ocorrências de `aios/no-unscoped-admin-client` em `src` | **CONFERE** — 1199 arquivos no relatório, 0 hits, 31 warnings totais, 0 errors |
| `pnpm lint --force` / `pnpm type-check --force` | **CONFERE** — 8/8 e 8/8, 0 errors, 32 warnings |
| `pnpm test` 273 arquivos / 3501 passando | **CONFERE** — 273 · 3501 · 6 expected fail · 0 falhas |
| `provision_org` da 246 reproduz a 240 integralmente | **CONFERE** — 61 linhas de prefixo comum, **nenhuma** linha da 240 ausente, delta = só os blocos 5 e 6; `REVOKE` idêntico (240:136 ≡ 246:235) |
| Esqueleto no `trifold-crm-dev` (RLS, 2 policies, 3 CHECKs, UNIQUE, 2 índices, 6 linhas) | **CONFERE** por introspecção direta; grants idênticos aos de `whatsapp_config`, nenhum a PUBLIC |
| Pré-condições zeradas em produção | **CONFERE** — `[]` nas duas, e a mesma query com `HAVING count(*) > 0` devolve 1 grupo em cada: o zero não é por vacuidade |
| Zero resíduo da célula de vivacidade (pedido explícito do @po) | **CONFERE** — `org-teste-epic-900` com `created_at = updated_at` = 17:39:41.436391Z, o valor "antes"; sem org `empresa-teste-900-21b`, sem `waba_id` com `-x` |

**Duas medições novas, que o Dev Agent Record não tinha e que fecham o furo da AC6:**

1. **A `provision_org` VIVA em produção não derivou do arquivo 240.** O @dev comparou a 246 contra o
   *arquivo*; se a função em produção tivesse sido alterada fora de migration, o `CREATE OR REPLACE`
   reverteria a deriva em silêncio — e "produção não muda de comportamento" seria falso exatamente no
   caminho que a story mais mexe. Medido por `pg_get_functiondef` (read-only): **63/63 linhas
   normalizadas idênticas à 240**. A 246 é aditiva em relação ao estado REAL, não só ao arquivo.
2. **Todas as funções que a 246 referencia existem em produção** (`is_admin`, `user_org_id`,
   `update_updated_at`). A migration foi aplicada e medida no banco de teste, cujo schema
   comprovadamente diverge (124 tabelas × 121); uma função ausente só apareceria no dia da aplicação.

**Mutações deste gate — as duas réguas são carrascos e são disjuntas.** As três do @dev (M1/M2/M3)
são válidas, mas todas deformam o arquivo de dados ou a regra; nenhuma exercita o modo de falha de
amanhã: um arquivo **novo e real** em `src`.

- **MQ-A** (tirar `platform/orgs/route.ts` da allowlist) → **4 vermelhos**: controle positivo, união
  241≠242, `PERMITIDOS.size` 241≠242, e `eslint src` volta a acusar 2 ocorrências.
- **MQ-B** (criar de verdade `src/app/api/cron/__qa_probe_900_21b__/route.ts` chamando
  `createAdminClient()`) → **1 vermelho, e só um**: a asserção da varredura de `src`. **Kill set
  disjunto do da MQ-A** — cada régua mata o que a outra não mata; não são colineares. Árvore
  restaurada, shasums idênticos aos do Dev Agent Record.

**Julgamentos pedidos:**

- **"A Trifold não mudou" é provado onde?** O A/B empírico rodou no ambiente que **não tem** o dado
  da garantia. O @dev acertou duas vezes ali: recusou o diagnóstico falso que a AC produziria com
  `slug='trifold'` no dev (em vez de colher o verde por vacuidade — o oposto do modo de falha da
  900-3c) e registrou a Divergência 2 em vez de normalizá-la para fora. O que substitui o A/B é uma
  **decomposição**, e reexecutei cada perna dela em produção read-only, mais as duas medições novas
  acima. **Suficiente como gate pré-aplicação; insuficiente como prova final** — e o resto só é
  mensurável depois de aplicar, que é passo do `@devops`. Deixei no gate a **captura PRÉ-aplicação**
  (sha256 da linha de `whatsapp_config` e de `organizations` em produção) para que a comparação
  pós-aplicação seja executável e não declarativa. Sem essa captura, depois de aplicar ninguém
  conseguiria provar que a linha não mudou.
- **Contradição da AC1 (Regra 2 × testes-irmãos):** resolução correta e pela razão certa. Exceção por
  sufixo `.test.ts` seria buraco permanente numa régua que existe para não deixar motivo apodrecer.
  Conferido: os 8 testes-irmãos carregam citação real e nenhuma das 24 entradas de `itera-orgs` fica
  sem `:dígito`. Amostrei 7 citações contra o código: **7/7 exatas**.
- **Delta +8 do gate de tenancy:** **artefato confirmado, nenhuma das 8 vem da 246.** Medido sem
  rodar o gate (que reescreve fixture rastreada): R1 = `supremo_sync_log`, com RLS desligada **só no
  dev** (em produção está ligada); as tabelas exclusivas do dev são `lead_facts`, `lead_memories`,
  `trifold_migrations_aplicadas` e `org_integrations`. `org_integrations` não cai em conjunto nenhum:
  RLS ligada, 2 policies cobrindo os 4 comandos, `org_id NOT NULL` — R1/R2/R3 satisfeitas por
  medição direta, não por ausência no relatório.
- **`classe` como prefixo em vez de campo:** aceito, mas é **equivalente com outro custo**, não
  estritamente melhor — nenhuma regra verifica o prefixo tampouco. O que ele tem a mais é não poder
  existir sem motivo. O custo cai sobre quem for **agir** sobre a classe na 900-20 (`startsWith` em
  prosa). Como a seção expira em 2026-09-30, é limitado; se sobreviver ao prazo, promover a campo
  verificado — nunca empurrar a data.
- **R9 cega para arquivo não commitado:** **confirmado por leitura do código** — `rodarR9()`
  (`scripts/gate-tenancy.ts:859`) roda `git diff --diff-filter=A origin/main...HEAD`, que compara
  commits. Mesmo padrão da 900-3c. Está no handoff do `@devops`.

**Achados (nenhum bloqueia; os dois primeiros viajam para a 900-24):**

- **ARCH-001 (medium)** — o `CHECK whatsapp_sem_identificador_proprio` é evadido pela grafia mais
  natural em TypeScript. Medido em `BEGIN…ROLLBACK`: `{"phone_number_id": …}` é bloqueado (23514),
  mas **`{"phoneNumberId": …}` passa** e `{"meta": {"phone_number_id": …}}` também. O comentário da
  246 diz que reabrir a decisão "custa uma migration"; medido, custa uma troca de grafia.
- **REL-001 (low)** — `whatsapp_config.status` não tem CHECK em produção (varchar livre): duas linhas
  `'Active'`/`'ACTIVE'` com o mesmo `phone_number_id` convivem e evadem os índices parciais. A AC2
  vale para o literal exato, não para o campo. Exposição só futura (0 caminhos de escrita hoje).
- **TEST-001 (low, pré-existente da 900-14)** — a regra AST não vê `import * as admin;
  admin.createAdminClient()` (0 hits) nem re-export. Nenhuma dessas formas existe hoje em `src`
  (medido), então a catraca é exata para a população atual.
- **DOC-001 (low)** — a Regra 3 é bomba-relógio por desenho: em **2026-10-01** o controle positivo
  fica vermelho. É o comportamento pretendido; a saída correta é esvaziar a seção, não renovar a data.

### Gate Status

Gate: PASS → docs/qa/gates/900.21b-allowlist-retriada-e-org-integrations.yml

**Condições de deploy (`@devops`, ver §5 do gate):** D1 aplicar a 246 em produção (pré-condições já
medidas e zeradas por mim); **D2 repetir os dois sha256 da captura PRÉ e exigir os mesmos valores**
(hash diferente ⇒ rollback pelo bloco NFR-8); D3 rodar `pnpm gate:tenancy` **depois** do commit e
restaurar `docs/audits/gate-tenancy-report.json`; D4 a branch salta 244 → 246 de propósito (a 245
vive no PR #525).

— Quinn, guardião da qualidade 🛡️

