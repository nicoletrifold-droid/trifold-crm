# Story 900-24 — Roteamento de Webhook por Identificador, com Dual-Run (Onda 2, Fatia 3)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 2 — "Para de errar" (plano de 3 ondas aprovado pelo dono do produto). Esta story cobre
  **só o Passo 4** (resolução de org nos webhooks). O Passo 6 (Camadas A/B de teste de duas orgs
  contra `trifold-crm-dev`) é a story seguinte — **não entra aqui**, por instrução explícita do
  dono do produto.
- **Story:** 900-24 — número já reservado pelo próprio epic para este conteúdo exato (§848-855:
  "Roteamento de webhook por identificador, com dual-run"), sem colisão medida (ver "Numeração").
- **Status:** **Ready for Review** — implementada pelo @dev em 2026-08-29 (ver Dev Agent Record).
- **Priority:** P0 — fecha o "bug agudo" da Onda 2: hoje, com duas orgs ativas, `webhook/whatsapp`
  e `webhooks/meta-ads` **descartam mensagens/leads das duas orgs em silêncio** (o `.maybeSingle()`
  com 2 linhas ativas devolve `null`, indistinguível de "não configurado"). É o mesmo modo de falha
  que a `900-23` já fechou para `cron/followup` — esta story fecha os outros 3 pontos.
- **Complexity:** G — **diverge do `Est: M` do epic §855 (correção C6, nomeada, não
  silenciada).** A subida de M para G reflete o que o epic não previa quando estimou: o
  dual-run com 3 modos (não só "resolve por identificador"), a migration `247` (`ARCH-001`, achado
  do gate da `900-21b`, posterior à estimativa do epic), e a exigência de um fake de teste fiel ao
  `postgrest-js` real (não o molde já existente) para o defeito central ser reprovável. 1 módulo
  novo com 3 resolvers + orquestração dual-run, 4 rotas modificadas (cada uma com um identificador
  diferente, uma delas — `landing-page` — com uma exceção de comportamento HTTP nomeada, ver AC5),
  1 migration, testes unitários (Camada A) com um fake novo fiel ao client real.
- **Depends on:**
  1. **`900-21b` — obrigatória, bloqueante para deploy (não para implementação).** Entrega
     `whatsapp_config_phone_ativo`/`whatsapp_config_org_ativo` (migration `246`, AC2) — as duas
     UNIQUE parciais que tornam "duas linhas ativas com o mesmo `phone_number_id`" uma
     impossibilidade estrutural em banco saudável, e `org_integrations` com o índice
     `org_integrations_meta_page_ativo` (AC3) que `resolveOrgByMetaPage` lê. Medido em 2026-08-29:
     **PR #526 ainda ABERTO** (`mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`, checks verdes) —
     mesmo estado que a `900-23` mediu ao ser rascunhada. **Reconfirmar no dia da implementação.**
  2. **`900-23` — declarada pelo epic (`Dep: 900-23`, §846), sem acoplamento técnico direto
     medido.** `forEachActiveOrg` (`lib/tenancy/for-each-org.ts`) é para crons, não para webhooks;
     `webhook-org.ts` (este módulo) não importa nada de `for-each-org.ts` nem de
     `lib/tenancy/trifold-org.ts`. Por medição (grafo de import, sobreposição de arquivo,
     numeração de migration), não há dependência de código/schema — a ligação real é de
     **sequenciamento do plano aprovado** (Passo 2/5 antes do Passo 4, mesma ordem que a `900-23`
     preservou ao herdar `Dep: 900-21b` em vez de `900-20`). Preservada aqui pela mesma razão que a
     `900-23` preservou a dela: não é autoridade do `@sm` reescrever o grafo de dependências do
     epic — só registrar a medição. Consequência prática: **esta story pode ser implementada em
     paralelo à `900-23`** (arquivos disjuntos: `app/api/cron/*` + `lib/tenancy/for-each-org.ts`
     de um lado, `app/api/webhook*/*` + `lib/tenancy/webhook-org.ts` do outro) — só o **merge**
     precisa respeitar a ordem declarada pelo epic. Medido em 2026-08-29: `900-23` está local,
     sem PR ainda, branch `story/900-23-foreachactiveorg-crons`. **Confirmado pelo @po
     (`docs/qa/po-validation-900-24.md`):** medido nos commits `ce07e09b`/`e3a6f1fc` — nenhum
     toca `app/api/webhook*`, `app/api/telegram` ou `lib/meta`; `246` continua o teto após
     `git fetch --prune`; implementação em paralelo é segura. **Ressalva do @po:** as duas
     stories editam `docs/audits/admin-client-allowlist.json` — conflito **textual**, não
     semântico. **Ordem para o `@devops`:** `#525 → #526 → 900-23 → 900-24` (a `900-24` nasce
     rebasada no PR da `900-23`, ou resolve o JSON na mão); a decisão da AC2 de não hardcodear o
     total e afirmar `PERMITIDOS.has(...)` já protege contra o pior caso desse conflito.
- **Created:** 2026-08-29
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex) — TypeScript de aplicação (4 rotas + 1 módulo novo) e 1 migration
  aditiva (`ALTER TABLE ... DROP/ADD CONSTRAINT`, sem `CREATE TABLE` novo).
- **Quality Gate:** @architect (Aria) — mesmo padrão da `900-21b`/`900-23` (mecanismo compartilhado
  novo entre 4 rotas + decisão de dual-run que outra story, a `900-20` futura, vai precisar imitar
  para `STAGE_RESOLVER`).
- **Quality Gate Tools:** `[code_review, migration_review, security_review]` — `security_review`
  acrescentado (não estava nas duas fatias anteriores) porque esta story decide explicitamente o
  que pode e o que nunca pode ir para `system_events`/`webhook_logs` (PII de lead) e fecha
  `ARCH-001`, um achado do gate anterior classificado como risco de arquitetura.

---

## Numeração — por que `900-24`, sem sufixo

O epic reserva `900-24` para exatamente este conteúdo (§848: *"Roteamento de webhook por
identificador, com dual-run"*, AC batendo linha a linha com o Passo 4 do plano aprovado: resolução
por `phone_number_id`/`page_id`, fallback para org única enquanto houver só uma, não-encontrou ⇒
200 + log, idempotência preservada, contador resolvido-por-identificador vs. caiu-no-fallback).
Diferente de `900-16` (que tinha DONO e CONTEÚDO diferentes — dívida P1 de `platform_admins`) e
igual ao caso da própria `900-23`, o número está livre e é o mesmo assunto: sem colisão, sem
necessidade de sufixo de letra.

**Migration livre remedida em 2026-08-29** (não presumida — mesma disciplina de
`feedback_remedir_numeros_contra_o_banco`):
```bash
git fetch --prune origin
for r in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin); do
  git ls-tree --name-only "$r" -- supabase/migrations/ 2>/dev/null | sed 's|.*/||'
done | grep -oE "^[0-9]{3}[a-z]?_" | sort -u | tail -3
# 244_ 245_ 246_
```
`246` é o teto em **todas** as refs remotas + locais, incluindo o PR #526 (que a carrega). Nenhum
PR aberto usa `247`. **Esta story usa `247`.** A branch local de `900-23` não introduz migration
nenhuma (confirmado: `git status` nela não lista nada em `supabase/migrations/`) — sem risco de
colisão entre as duas fatias.

---

## User Story

**Como** plataforma multi-tenant,
**Eu quero** que os 4 receptores de webhook (`webhook/whatsapp`, `webhooks/meta-ads`,
`webhooks/landing-page`, `telegram/webhook`) resolvam a organização certa a partir de um
identificador do próprio payload — em vez de "pegar a única config ativa que existir" —,
**Para que** uma segunda organização ativa não descarte mensagens/leads das duas em silêncio (o bug
agudo desta Onda), e para que a migração desse comportamento seja **observável e reversível**
antes de remover o caminho antigo.

---

## Context

### O bug agudo, medido em 2026-08-29

`packages/web/src/app/api/webhook/whatsapp/route.ts:394-398`:
```ts
const { data: config } = await supabase
  .from("whatsapp_config")
  .select("org_id, phone_number_id, access_token, coexistence_enabled")
  .eq("status", "active")
  .maybeSingle()

if (!config) {
  console.error("No active WhatsApp config found")
  return NextResponse.json({ status: "ok" })
}
```
Com 2 linhas `status='active'` (uma por org), `.maybeSingle()` — cujo `error` é **descartado** pela
desestruturação `const { data: config }` — devolve `config: null`. O webhook responde `200`,
registra só um `console.error` (que não vai a lugar nenhum em produção fora do log da Vercel), e
**nenhuma mensagem de nenhuma das duas orgs é processada**. Silencioso, sem alerta, sem rastro em
`system_events`.

`packages/web/src/lib/meta/process-lead.ts:677-685` (chamada em `:125`), a mesma forma com
`.single()`. **Correção factual pós-`@po` (C7): `.single()` não lança** — como `.maybeSingle()`,
devolve `{ data: null, error: {...} }` (só lançaria com `.throwOnError()` explícito, ausente aqui).
A diferença real é outra: com 0 OU 2+ linhas, `.single()` devolve o mesmo `PGRST116`/406 que
`.maybeSingle()` devolve só com 2+; e aqui também quem chama descarta o `error`
(`const { data } = await supabase...`), então o efeito observável é idêntico — `data: null`,
silencioso:
```ts
async function resolveOrgId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_config")
    .select("org_id")
    .eq("status", "active")
    .single()

  return data?.org_id ?? null
}
```

`packages/web/src/app/api/webhooks/landing-page/route.ts:486-493` e
`packages/web/src/app/api/telegram/webhook/route.ts:332-344` repetem a mesma classe de defeito —
a segunda até sem filtro nenhum (`organizations` sem `WHERE`, pega a primeira linha que a query
devolver, arbitrária).

**Os quatro têm a mesma causa raiz:** "existe org?" resolvido perguntando "existe UMA linha
ativa?" em vez de perguntar "qual org é dona **deste identificador do payload**?". Com uma org só,
as duas perguntas têm a mesma resposta — é por isso que o bug nunca apareceu em produção até hoje.

### Achado do @po (rodada 1, NO-GO, `docs/qa/po-validation-900-24.md`) — o molde de teste mente
duas vezes, e já se propagou uma vez

O @po rodou o código legado literal de `webhook/whatsapp/route.ts:394-398` contra dois fakes: o
molde `admin-invite.test.ts` e um fake fiel ao `@supabase/postgrest-js@2.101.1` instalado (lido em
`dist/index.cjs:129-140`, confirmado contra o PostgREST do `trifold-crm-dev` via HTTP **406**,
`PGRST116`). Resultado, com 2 configs `active`:

| fake | o legado processa | o bug agudo reproduz? |
|---|---|---|
| molde `admin-invite.test.ts` | `org-A` (`linhas[0]`) | **não** |
| fiel ao postgrest-js real | nada — descarta em silêncio | **sim** |

**O molde mente duas vezes, não uma:** erra `data` (`linhas[0]` em vez de `null`) **e** erra
`error` (`null` em vez de `PGRST116`/406) — e é justamente a leitura do `error` que o Context desta
story nomeia como causa raiz ("`error` descartado pela desestruturação"). Um fake que só corrige
`data` deixaria essa causa raiz **impossível de reprovar por teste**. **`.single()` é cego nos
mesmos dois sentidos** (0 linhas ⇒ `PGRST116`/"0 rows" no real, `null` liso no molde) e é o
terminal em 2 dos 4 pontos que esta story corrige (`process-lead.ts:681`,
`landing-page/route.ts:490`) — a correção não pode nomear só `.maybeSingle()`. **E o molde já se
propagou:** `platform/orgs/[id]/resend-admin-invite/route.test.ts:80` carrega a mesma linha
verbatim (latente lá — a query filtra por PK, 2 linhas é impossível —, mas é a cópia nº 2; esta
story seria a nº 3, e a primeira em que a cegueira pousa exatamente sobre o defeito que existe
para fechar). Tratado na AC10 (regra 3 do fake, reescrita).

### Achado do @po herdado da `900-23` — confirmado, nenhum outro `.maybeSingle()`/`.single()` com
`error` descartado sobrevive nos 4 receptores

A `900-23` já corrigiu `cron/followup:167-171` (o "quarto furo" do mesmo tipo, fora do escopo desta
story porque é um cron, não um webhook). Medido nesta story, nos 4 arquivos do escopo: os únicos
`.maybeSingle()`/`.single()` com `error` descartado relacionados a **resolução de org** são
exatamente os 4 acima — todos corrigidos pelas ACs 3-6. Outros `.maybeSingle()`/`.single()` nesses
mesmos arquivos (dedup de `messages` por `wamid`, checagem de lead existente por telefone, busca de
`kanban_stages` default) são checagens de **existência de linha**, não de **ambiguidade de org**, e
ficam fora do escopo — confundir as duas classes seria expandir a story para um refactor geral de
error-handling que a Onda 2 não pede.

### Herança obrigatória — `ARCH-001` (registrada em `docs/backlog.md`, dona explícita: `900-24`)

O gate da `900-21b` (`docs/qa/gates/900.21b-...yml`, achado `ARCH-001`, severidade medium) mediu
que `CONSTRAINT whatsapp_sem_identificador_proprio` — que deveria travar a invariante *"WhatsApp
resolve por `whatsapp_config.phone_number_id`, nunca por `org_integrations`"* — só reconhece a
grafia exata `phone_number_id` como **chave de topo**. Medido contra o Postgres de produção
(avaliação de expressão pura, read-only):

| `config` | o `CHECK` bloqueia? |
|---|---|
| `{"phone_number_id":"1"}` | **sim** |
| `{"phoneNumberId":"1"}` | **não** |
| `{"meta":{"phone_number_id":"1"}}` | **não** |
| `{"phone_number":"1"}` | **não** (fora do escopo do `CHECK` por desenho — ver AC7) |

`docs/backlog.md` (`[ARCH-001]`) já registra 3 opções e descarta uma sozinha: **(a)** normalizar a
forma de `config` por provider com schema validado; **(b)** alargar o `CHECK` para grafias
plausíveis, "sabendo que continua enumerando literais" — **"não deve ser escolhida por ser a mais
barata"** quando sozinha; **(c)** aceitar e mover a garantia para a camada que escreve, com teste.
**Decisão desta story (AC7):** nem (a) nem (c) têm onde pousar hoje — **nenhum código de aplicação
escreve em `org_integrations.config` ainda** (o seed da `900-21b` é a única escrita existente, via
SQL; o "painel de configuração" que escreveria de verdade é `900-47`, Onda 7, ainda sem story). Uma
"camada que escreve" validada em TS seria prematura — testaria um caminho que não existe. A escolha
é uma variante de **(a)**, não de (b): em vez de enumerar grafias literais (`phoneNumberId`,
`PhoneNumberId`, ...), o `CHECK` novo casa **estruturalmente** contra o texto serializado do
`jsonb` inteiro, com um padrão que ignora caixa e separador — fecha a classe (qualquer nesting,
qualquer combinação de `_`/camelCase), não uma lista de exemplos. Ver AC7 para a expressão exata e
por que ela não é "mais uma enumeração".

**`REL-001` (mesmo gate, severidade low) fica FORA desta story, deliberadamente.** Diferente de
`ARCH-001`, `docs/backlog.md` **não** atribui dona a `REL-001` — não tem `Dona:` no cabeçalho, ao
contrário do `ARCH-001` que diz explicitamente `Dona: 900-24`. É sobre `whatsapp_config.status` sem
`CHECK` de domínio (permitindo `'Active'`/`'ACTIVE'` evadirem os índices parciais da `900-21b`), e
o próprio gate registra "exposição só futura (0 caminhos de escrita hoje)" — mesma classe de "sem
onde pousar ainda" do parágrafo acima, mas sem o carimbo de dona que `ARCH-001` tem. Permanece
registrado em `docs/backlog.md`, não resolvido aqui.

---

## Scope

### IN (esta story entrega)
1. `packages/web/src/lib/tenancy/webhook-org.ts` — 3 resolvers (`resolveOrgByWhatsAppPhone`,
   `resolveOrgByMetaPage`, `resolveSoleOrg`) + o mecanismo de dual-run compartilhado
   (`decidirModoRoteamento`, `logOrgResolved`, `logOrgUnresolved`) que os 4 receptores usam. (AC1,
   AC2)
2. Os 4 receptores modificados para resolver a org pelo identificador do próprio payload, com
   fallback dual-run para o caminho legado enquanto `WEBHOOK_ORG_ROUTING` não for `identifier`.
   (AC3, AC4, AC5, AC6)
3. Migration `247` — fecha `ARCH-001`. (AC7)
4. Verificação de que nenhum outro `.maybeSingle()`/`.single()` com `error` descartado relacionado
   a resolução de org sobrevive nos 4 arquivos. (AC8)
5. Prova de que produção (uma org só) não muda de resposta. (AC9)
6. Testes unitários (Camada A) — fake que honra `.eq()`/`.limit()` e reprova o defeito central,
   lista de mutações executada. (AC10)

### OUT (não entra nesta story — próximas)
- **Passo 6 do plano (Camada B — integração de duas orgs reais contra `trifold-crm-dev`)** — story
  seguinte, por instrução explícita do dono do produto. Esta story só entrega a Camada A
  (unitária, sem banco).
- **Cutover em produção** (remover o fallback legado, promover `identifier` a único caminho) —
  Onda 3, depende de 7 dias de observação do contador desta story (`WEBHOOK_ORG_RESOLVED`).
- **`REL-001`** — registrado em `docs/backlog.md`, sem dona, não resolvido aqui (ver Context).
- **Vault/`secret_ref`** — `900-47`, Onda 7. `access_token` continua em `whatsapp_config` em texto
  plano, como já está hoje; esta story só evita um lookup cruzado extra, não muda onde o segredo
  mora.
- **UI/painel de configuração de `org_integrations`** — não existe hoje, não nasce aqui.

---

## Acceptance Criteria

- [x] **AC1 — `packages/web/src/lib/tenancy/webhook-org.ts`: os 3 resolvers.**

  **Regra não-negociável: `.limit(2)` + checagem de comprimento — nunca `.maybeSingle()`, nunca
  `.single()`.** É a linha que fecha o bug agudo: com `.limit(2)`, "achei duas" vira um estado
  nomeado (`"ambigua"`) e logado, em vez de um `null` indistinguível de "não achei".

  ```ts
  import type { SupabaseClient } from "@supabase/supabase-js"

  export type MotivoNaoResolvida = "nenhuma_correspondencia" | "ambigua" | "erro_consulta"

  export interface ResolucaoNaoResolvida {
    status: "nao_resolvida"
    motivo: MotivoNaoResolvida
    quantidadeEncontrada: number
  }

  export interface OrgResolvida {
    status: "resolvida"
    orgId: string
  }

  export type ResolucaoOrg = OrgResolvida | ResolucaoNaoResolvida

  /** Linha de `whatsapp_config` — mesmas 4 colunas que o código legado já selecionava, para o
   *  `access_token` continuar disponível ao chamador sem lookup cruzado (ver Dev Notes).
   *  `access_token: string | null` — **correção C2** (`docs/qa/po-validation-900-24.md`): a
   *  coluna é NULLABLE (medido), e o seed da `900-21b` cria linhas `whatsapp_config` `inactive`
   *  sem token. `resolveOrgByWhatsAppPhone` já filtra `status='active'`, então na prática uma
   *  linha resolvida tende a ter token — mas o TIPO não pode afirmar isso; o chamador
   *  (`webhook/whatsapp/route.ts`) guarda explicitamente antes de usar `config.access_token` nas
   *  ~8 chamadas à Graph API (AC3). */
  export interface WhatsAppConfigLinha {
    org_id: string
    phone_number_id: string | null
    access_token: string | null
    coexistence_enabled: boolean | null
  }

  export interface WhatsAppResolvida {
    status: "resolvida"
    config: WhatsAppConfigLinha
  }

  export type ResolucaoWhatsApp = WhatsAppResolvida | ResolucaoNaoResolvida

  /**
   * Resolve a org pelo `phone_number_id` do payload da Meta (`value.metadata.phone_number_id`,
   * que já chega em TODO webhook do WhatsApp Cloud API e hoje é descartado). Filtra também por
   * `status='active'` — replica a invariante que o código legado já impunha (só configs ativas
   * roteiam), sem o filtro nenhuma org "desconectada" com um `phone_number_id` remanescente
   * poderia sequestrar o roteamento.
   */
  export async function resolveOrgByWhatsAppPhone(
    db: SupabaseClient,
    phoneNumberId: string | null | undefined,
  ): Promise<ResolucaoWhatsApp> {
    if (!phoneNumberId) {
      return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
    }
    const { data, error } = await db
      .from("whatsapp_config")
      .select("org_id, phone_number_id, access_token, coexistence_enabled")
      .eq("phone_number_id", phoneNumberId)
      .eq("status", "active")
      .limit(2)

    if (error) {
      return { status: "nao_resolvida", motivo: "erro_consulta", quantidadeEncontrada: 0 }
    }
    const linhas = (data ?? []) as WhatsAppConfigLinha[]
    if (linhas.length === 1) return { status: "resolvida", config: linhas[0]! }
    if (linhas.length === 0) {
      return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
    }
    return { status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: linhas.length }
  }

  /**
   * Resolve a org pelo `page_id` do payload da Meta (`entry[0].id` — hoje logado em
   * `webhooks/meta-ads/route.ts:91` e jogado fora). Lê `org_integrations` (provider `meta_ads`),
   * NÃO `whatsapp_config` — são identificadores de fontes diferentes.
   */
  export async function resolveOrgByMetaPage(
    db: SupabaseClient,
    pageId: string | null | undefined,
  ): Promise<ResolucaoOrg> {
    if (!pageId) {
      return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
    }
    const { data, error } = await db
      .from("org_integrations")
      .select("org_id")
      .eq("provider", "meta_ads")
      .eq("config->>page_id", pageId)
      .limit(2)

    if (error) {
      return { status: "nao_resolvida", motivo: "erro_consulta", quantidadeEncontrada: 0 }
    }
    const linhas = (data ?? []) as Array<{ org_id: string }>
    if (linhas.length === 1) return { status: "resolvida", orgId: linhas[0]!.org_id }
    if (linhas.length === 0) {
      return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
    }
    return { status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: linhas.length }
  }

  /**
   * `landing-page` e `telegram` NÃO têm identificador de org no payload (decisão travada do
   * plano aprovado — UTM colide entre tenants). `resolveSoleOrg` NOMEIA a suposição em vez de
   * escondê-la num lookup de `whatsapp_config`/`organizations` sem filtro: resolve só quando há
   * EXATAMENTE uma org ativa; com 0 ou 2+, devolve o estado não-resolvida em vez de adivinhar.
   */
  export async function resolveSoleOrg(db: SupabaseClient): Promise<ResolucaoOrg> {
    const { data, error } = await db
      .from("organizations")
      .select("id")
      .eq("is_active", true)
      .limit(2)

    if (error) {
      return { status: "nao_resolvida", motivo: "erro_consulta", quantidadeEncontrada: 0 }
    }
    const linhas = (data ?? []) as Array<{ id: string }>
    if (linhas.length === 1) return { status: "resolvida", orgId: linhas[0]!.id }
    if (linhas.length === 0) {
      return { status: "nao_resolvida", motivo: "nenhuma_correspondencia", quantidadeEncontrada: 0 }
    }
    return { status: "nao_resolvida", motivo: "ambigua", quantidadeEncontrada: linhas.length }
  }
  ```

  **Verificação (mutação que reprova):**
  - Reverter `resolveOrgByWhatsAppPhone` para `.eq("status","active").maybeSingle()` (sem filtro
    de `phone_number_id`) → o teste de "duas orgs ativas, telefones diferentes" da AC10 passa a
    devolver `null`/erro descartado em vez de identificar a org certa — **vermelho**.
  - `quantidadeEncontrada` de um caso `"ambigua"` real (2 linhas inseridas no fake) tem que ser
    `2`, nunca `1` nem `undefined` — prova de que o código não caiu num `.length > 0` frouxo.
  [Source: mission do @po/dono do produto, 2026-08-29; plano aprovado, Onda 2, Passo 4;
  `feedback_contar_a_regua_e_quebrar_colinearidade.md`]

- [x] **AC2 — dual-run compartilhado: `decidirModoRoteamento`, `logOrgResolved`,
  `logOrgUnresolved`.**

  **Semântica de `both` — igual ao `STAGE_RESOLVER` que o próprio plano descreve para a `900-20`
  futura: computa os dois caminhos, USA o legado para o processamento real, loga divergência.**
  Não é "usa o que resolver primeiro" — é "usa sempre o legado, audita contra o novo". É o que
  torna a garantia "produção não muda de comportamento" verificável por construção, não por
  promessa.

  ```ts
  export type ModoRoteamento = "legacy" | "both" | "identifier"

  /**
   * Sem env var setada, o default é **"both"**, nunca "legacy" nem "identifier" silenciosos:
   * "legacy" silencioso perderia toda a instrumentação sem ninguém notar; "identifier" silencioso
   * mudaria comportamento sem aviso no primeiro ambiente que esquecer de configurar a var. "both"
   * é seguro nos dois eixos — com 1 org, dá a mesma resposta do legado, e já produz o contador.
   */
  export function decidirModoRoteamento(): ModoRoteamento {
    const valor = process.env.WEBHOOK_ORG_ROUTING
    if (valor === "legacy" || valor === "identifier") return valor
    return "both"
  }

  export type ReceptorWebhook = "whatsapp" | "meta_ads" | "landing_page" | "telegram"

  /**
   * Telemetria de ALTO VOLUME (todo webhook recebido, nos modos both/identifier) — fire-and-forget
   * (`logEvent`, não `logEventOnce`). É o contador do épico (§854: "resolvido por identificador vs.
   * caiu no fallback, observável antes de remover o fallback") e a fonte da query de corte da
   * Onda 3 (`event_type='WEBHOOK_ORG_RESOLVED'`, agrupado por `metadata->>'via'`).
   */
  export function logOrgResolved(params: {
    receptor: ReceptorWebhook
    via: "identifier" | "legacy"
    orgId: string
    /** null quando o modo é "identifier" puro (não computou o legado para comparar). */
    divergiu: boolean | null
  }): void {
    logEvent({
      level: "info",
      category: "webhook",
      event_type: "WEBHOOK_ORG_RESOLVED",
      source: `api/webhook/${params.receptor}`,
      org_id: params.orgId,
      message: `${params.receptor}: org resolvida via ${params.via}`,
      metadata: { via: params.via, divergiu: params.divergiu, receptor: params.receptor },
    })
  }

  /**
   * Caminho TERMINAL de "não resolveu" — a ÚLTIMA escrita antes do 200 (Story 87-6: por isso
   * AWAITED via `logEventOnce`, nunca fire-and-forget aqui — um `logEvent` não aguardado pode
   * morrer com a lambda no mesmo `return` que ele dispararia). NUNCA grava corpo bruto do
   * webhook — nem em `system_events.metadata`, nem em `webhook_logs.payload`. `identificador`
   * carrega só o identificador PRÓPRIO da org emissora (o `phone_number_id`/`page_id` do config
   * dela mesma), nunca dado do lead/mensagem.
   */
  export async function logOrgUnresolved(params: {
    receptor: ReceptorWebhook
    motivo: MotivoNaoResolvida
    quantidadeEncontrada: number
    identificador?: Record<string, string | null>
    webhookLogsSource: "whatsapp" | "meta_ads" | "landing_page" | "other"
  }): Promise<void> {
    const admin = createAdminClient()
    await Promise.all([
      logEventOnce({
        level: "warn",
        category: "webhook",
        event_type: "WEBHOOK_ORG_UNRESOLVED",
        source: `api/webhook/${params.receptor}`,
        message: `${params.receptor}: org não resolvida (${params.motivo})`,
        metadata: {
          motivo: params.motivo,
          quantidade_encontrada: params.quantidadeEncontrada,
          identificador: params.identificador ?? null,
        },
      }),
      admin.from("webhook_logs").insert({
        org_id: null,
        source: params.webhookLogsSource,
        event_type: "org_unresolved",
        payload: params.identificador ?? null,
        processing_error: `org_unresolved:${params.motivo}`,
        processed: true,
      }),
    ])
  }
  ```

  **`webhook-org.ts` entra em `docs/audits/admin-client-allowlist.json`, seção `legitimos`** — o
  `createAdminClient()` dentro de `logOrgUnresolved` é legítimo (não há org conhecida ainda; é
  exatamente a mesma razão que já justifica os 4 webhooks e `for-each-org.ts` na allowlist).
  Motivo: `"resolução de org do webhook / log de não-resolução — sem org conhecida ainda, grava
  webhook_logs/system_events com org_id NULL por desenho (Story 900-24)"`. Verificação: **não**
  hardcodear o total (a `900-23`, em paralelo, já está mudando esses números — ver
  `feedback_remedir_numeros_contra_o_banco`); a asserção é `PERMITIDOS.has("src/lib/tenancy/
  webhook-org.ts") === true` e `npx eslint src` continua saindo **0** ocorrências da regra.
  [Source: plano aprovado, Onda 2, Passo 4 ("Contador... observável antes de remover o
  fallback"); Story 87-6 (`logEvent` vs `logEventOnce`); `packages/web/eslint-rules/
  no-unscoped-admin-client.mjs:27`]

- [x] **AC3 — `webhook/whatsapp/route.ts`: `phone_number_id` do payload, dual-run.**

  Substitui o bloco de `:393-405` (ver Context). `phoneNumberId` vem de
  `value?.metadata?.phone_number_id` — já parseado em `value` na linha `202`, nunca precisou de
  parsing novo. Segue o padrão canônico descrito em Dev Notes ("Padrão de fiação dual-run"), com:
  - **legado:** a query atual (`status='active'`, sem filtro de telefone) — extraída para uma
    função local `legacyResolveActiveConfig`, sem mudar o SQL.
  - **identifier:** `resolveOrgByWhatsAppPhone(supabase, phoneNumberId)`.
  - **`webhookLogsSource: "whatsapp"`** (já existe no `CHECK` de `webhook_logs.source`, migration
    `015`).
  - **`identificador` do log:** `{ phone_number_id: phoneNumberId ?? null }` — é o identificador da
    PRÓPRIA org (WABA), nunca dado do lead que mandou a mensagem.

  Depois de resolvido, `config.access_token` continua alimentando as ~8 chamadas existentes
  (`:726`, `:736`, `:773`, `:783`, `:829`, `:836`, `:904`, `:1030`, `:1239`, `:1281`) **sem
  mudança de comportamento** — é por isso que o resolver devolve a linha inteira, não só `orgId`
  (ver AC1). **Correção C2:** como `WhatsAppConfigLinha.access_token` agora é `string | null`
  (tipo correto — a coluna é nullable), essas ~8 chamadas continuam recebendo o mesmo VALOR de
  runtime que recebiam antes (nada muda em produção — configs `active` têm token na prática hoje),
  mas o TypeScript passa a exigir uma guarda explícita; resolver com um `if (!config.access_token)`
  cedo (mesmo tratamento de "não resolvido" — `logOrgUnresolved` com `motivo: "erro_consulta"` não
  se aplica aqui, é um novo `motivo` fora da união atual **ou** reaproveitar
  `nenhuma_correspondencia` com nota — decisão de implementação do `@dev`, registrar qual foi
  escolhida no Dev Agent Record).

  **Verificação:** com `WEBHOOK_ORG_ROUTING=identifier` e duas orgs no fake (Camada A), enviar
  `phone_number_id` da org B processa a mensagem em B, não em A. Com `phone_number_id` desconhecido
  → 200, zero chamada a `findOrUpsertLead`, `WEBHOOK_ORG_UNRESOLVED` logado.
  [Source: mission do @po/dono do produto, 2026-08-29 — tabela "rota | mudança"]

- [x] **AC4 — `webhooks/meta-ads/route.ts` → `lib/meta/process-lead.ts`: `page_id` do payload,
  dual-run.**

  `firstEntry?.id` (o `page_id`) já é passado para `processMetaLead(leadgenId, value, firstEntry,
  logEntry?.id)` (`webhooks/meta-ads/route.ts:102`) — a rota HTTP não muda; a mudança inteira é
  dentro de `process-lead.ts`. Substitui o corpo de `resolveOrgId` (`:677-685`, chamada em
  `:125`):
  - **legado:** a função atual, renomeada `legacyResolveActiveOrgId` (mesma query, sem mudança de
    SQL).
  - **identifier:** `resolveOrgByMetaPage(supabase, (entry as { id?: string })?.id)`.
  - **`webhookLogsSource: "meta_ads"`.**
  - **`identificador` do log:** `{ page_id: (entry as { id?: string })?.id ?? null }`.

  **Assimetria nomeada (correção C1):** `resolveOrgByWhatsAppPhone` (AC1) filtra
  `status='active'` — a AC justifica com "org desconectada não pode sequestrar o roteamento".
  `resolveOrgByMetaPage` **não** filtra `org_integrations.status`, e a mesma frase se aplicaria
  literalmente. **Decisão: omitir o filtro é intencional, não esquecimento.** O seed da `900-21b`
  cria toda linha `meta_ads` como `disconnected`, e não existe UI para promover a `connected` até
  a `900-47` — exigir `status='connected'` faria o modo `identifier` **nunca** resolver nenhuma
  org via Meta Ads, mesmo depois de alguém configurar o `page_id` manualmente (único jeito
  possível hoje, via SQL direto). A assimetria fica registrada aqui para o gate não a ler como
  descuido.

  A função `fail()` já existente (`:105-114`) grava `processing_error` em `webhook_logs` — a
  chamada ao `resolveOrgId`/`resolveOrgByMetaPage` (`:125-128`) troca `fail("no_active_org: ...")`
  por: se não resolvido, chama `logOrgUnresolved` (novo, grava `system_events` — hoje este arquivo
  **não** escreve em `system_events`, só em `webhook_logs`) e então `fail(...)` com a mesma
  mensagem, preservando o `webhook_logs.processing_error` que o cron `meta-leads-retry` já lê.

  **Verificação:** com duas orgs (`org_integrations` provider `meta_ads`, `page_id` distintos),
  `page_id` da org B roteia o lead para B. `page_id` desconhecido → `fail()` + `logOrgUnresolved`,
  `webhook_logs.org_id` continua `NULL` (já é o comportamento hoje — a mudança é que agora também
  vai a `system_events`).
  [Source: mission do @po/dono do produto, 2026-08-29; `webhooks/meta-ads/route.ts:91` (o `page_id`
  já logado e hoje descartado)]

- [x] **AC5 — `webhooks/landing-page/route.ts`: troca `resolveOrgId()` por `resolveSoleOrg()` —
  REESCRITA pós-NO-GO (`docs/qa/po-validation-900-24.md`, B1).**

  **O que a v1 desta AC errou, medido pelo @po:** o argumento de "inalcançável" foi medido no
  resolver **que produção não consulta**. Em `both` (o modo de produção — Task 9.2), quem decide é
  `legacyResolveOrgId`/`legacyResolveActiveConfig` = `whatsapp_config.status='active'` — **estado
  operacional, não estrutura**, sem `CHECK` de domínio (`REL-001`, deixado aberto por esta mesma
  story), e já com um incidente real de credencial invalidada em produção (10/08/2026). Com
  `status` fora de `'active'` hoje o handler devolve **5xx** e o proxy `api/lead.js` re-tenta;
  aplicando o 200+log uniforme ao branch "não resolveu" **mesmo em `both`**, esse mesmo estado
  passaria a devolver 200 silencioso — reabrindo, no ponto exato, o incidente que o comentário de
  `:109-118` documenta ter corrigido ("*leads eram perdidos silenciosamente… só retornamos 200 se
  o lead foi realmente processado*"). **Segundo problema, não nomeado na v1:** a AC também trocava
  o *predicado* — legado pergunta `whatsapp_config.status='active'`, `resolveSoleOrg` pergunta
  `organizations.is_active=true` — populações que já divergem hoje no `trifold-crm-dev` (medido
  pelo @po: 1 org `is_active=true`, `whatsapp_config` com `status='inactive'`). Em produção elas
  coincidem por acidente de configuração (1 org, ambas as flags "verdadeiras" hoje), não por
  construção.

  **Correção (opção (i) do parecer, escolhida por preservar byte a byte o contrato hoje vigente
  sem depender de aprovação síncrona do dono do produto — AUTO-DECISÃO, documentada):** a regra
  "não resolveu ⇒ 200 + log" vale **só no modo `identifier`**. Em `legacy`/`both`, o comportamento
  de hoje fica **intocado**: `legado === null` continua devolvendo `{ ok: false }` → **5xx** — não
  existe caminho, em `legacy`/`both`, por onde um lead deixe de ser processado e a resposta vire
  200. O 200+log uniforme só passa a valer quando `WEBHOOK_ORG_ROUTING=identifier` for o modo
  ativo (cutover da Onda 3, fora desta story) — nesse ponto a troca de predicado
  (`whatsapp_config.status` → `organizations.is_active`) já terá sido aceita como parte do
  cutover, não introduzida de graça numa fatia que promete não mudar nada.

  - **legado:** a função `resolveOrgId` atual, renomeada `legacyResolveOrgId` — continua lendo
    `whatsapp_config` (`status='active'`), sem mudança de SQL, sem mudança de resposta HTTP.
  - **identifier:** `resolveSoleOrg(adminSupabase)`.
  - **`webhookLogsSource: "landing_page"`.**
  - **`identificador` do log:** nenhum identificador de payload existe aqui — só
    `{ quantidade_organizacoes_ativas: quantidadeEncontrada }` (sem chave `identificador`, ou com
    valor vazio — decisão de implementação, sem PII de qualquer forma).
  - `ctx.logId` (o `webhook_logs` já inserido em `:97-107`, ANTES da resolução) permanece a fonte
    de verdade nos 3 modos.
  - **Em `legacy`/`both`:** o branch "não resolveu" continua fazendo exatamente o que faz hoje —
    `console.error` + `{ ok: false }` → 5xx. `logOrgUnresolved`/`WEBHOOK_ORG_UNRESOLVED` **não são
    chamados** nesse branch (evitaria um log de "não resolvido" para um caminho que nem tentou
    resolver pelo identificador).
  - **Em `identifier`:** `resolveSoleOrg` decide sozinha; não resolvido → `logOrgUnresolved` +
    `processing_error: org_unresolved:{motivo}` + **200** (não mais 5xx — aceito, porque nesse
    modo o identifier já é o único caminho operativo, por decisão de cutover, não por efeito
    colateral desta story).

  **Verificação:** com `WEBHOOK_ORG_ROUTING=legacy` OU `both` (produção), o handler responde
  IDENTICAMENTE a hoje em todo cenário, inclusive "zero orgs ativas"/"config inativa" — mesma
  resposta HTTP, mesmo corpo, nenhum novo caminho de 200 silencioso. Só com
  `WEBHOOK_ORG_ROUTING=identifier` (Camada A, fake com 0/2+ orgs) o branch 200+log é alcançado.
  [Source: `docs/qa/po-validation-900-24.md`, correção B1; mission do @po/dono do produto,
  2026-08-29]

- [x] **AC6 — `telegram/webhook/route.ts`: troca `.limit(1).single()` por `resolveSoleOrg()`.**

  Substitui `:334-338` (`.from("organizations").select("id").limit(1).single()`, sem filtro de
  `is_active`, sem tratamento de erro — `!org` só cobre o caso de 0 linhas). Diferente dos outros
  3 receptores, este arquivo **nunca grava em `webhook_logs`** hoje (confirmado por grep — não há
  nenhuma chamada a `.from("webhook_logs")` em todo o arquivo) e **`webhook_logs.source` não tem
  `'telegram'` no `CHECK`** (migration `015`/`194`: só `meta_ads`, `whatsapp`, `google_forms`,
  `landing_page`, `imoveis_sync`, `other`).

  **[AUTO-DECISÃO]** Adicionar `'telegram'` ao `CHECK` custaria uma migration só para um rótulo de
  log, desproporcional ao escopo desta story (resolução de org, não expansão de schema de
  auditoria). **Reusar `source: "other"`**, com `event_type: "org_unresolved"` e o `receptor:
  "telegram"` já presente em `metadata` (via `system_events`, que não tem essa limitação de
  `CHECK`) carregando a informação que faltaria no rótulo. Telegram é canal de staging/teste (não
  produção — ver memória do projeto), o que reduz ainda mais o custo de não ter um rótulo dedicado.
  - **legado:** a query atual, renomeada `legacyResolveFirstOrg` (mantém o `.limit(1).single()`
    exatamente como está — não vira `resolveSoleOrg`, para o "legado" continuar sendo,
    literalmente, o comportamento de hoje).
  - **identifier:** `resolveSoleOrg(supabase)`.
  - **`webhookLogsSource: "other"`.**
  - **`identificador` do log:** nenhum (mesmo padrão do `landing-page`).

  **Verificação:** com 1 org, `orgId` idêntico ao que a query legada devolveria hoje (mesma org,
  única linha). Com 2 orgs no fake, `resolveSoleOrg` retorna `"ambigua"` — o legado (`limit(1)`)
  teria retornado uma delas **arbitrariamente**, sem aviso; o teste da AC10 prova que o modo
  `identifier` não repete essa arbitrariedade.
  [Source: mission do @po/dono do produto, 2026-08-29; `.aios-core`/memória do projeto — "Telegram
  = staging/teste, WhatsApp = produção"]

- [x] **AC7 — Migration `247`: fecha `ARCH-001` — REESCRITA pós-NO-GO (B3, B4, C3).**

  **B4 — o predicado da v1 não fechava a classe que a AC afirmava fechar.** `phone[_]?number[_]?id`
  bloqueia `PHONE_NUMBER_ID`/`phonenumberid`, mas o próprio Dev Notes da v1 citava
  `Phone-Number-Id` como exemplo "sem lista" — e o @po mediu que essa grafia **passa** (assim como
  `phone.number.id`, `phone number id`, `phone__number__id`; o `docs/backlog.md` já lista
  `phone-number-id` entre as grafias da opção (b) que a própria story rejeita). **Padrão
  corrigido, medido pelo @po contra 16 casos no `trifold-crm-dev` sem introduzir falso positivo
  novo na amostra dele:**
  ```sql
  -- 247: org_integrations — CONSTRAINT whatsapp_sem_identificador_proprio deixa de morder só a
  -- grafia exata `phone_number_id` (chave de topo) e passa a casar a ESTRUTURA do identificador
  -- (três palavras, nesta ordem, com até 2 caracteres não-alfanuméricos entre elas, qualquer
  -- caixa) em qualquer lugar do texto serializado do jsonb — qualquer nesting, chave OU valor.
  -- [Story 900-24 — fecha ARCH-001, docs/backlog.md, dona explícita desta story]
  --
  -- Pré-condição (rodar ANTES, read-only, nos dois ambientes): nenhuma linha 'whatsapp' hoje
  -- carrega o identificador em NENHUMA grafia — se isto voltar linha, a migration abaixo FALHA
  -- ao recriar o CHECK (23514), que é o comportamento correto (mesma disciplina da AC2/246).
  --   SELECT id, org_id, config FROM org_integrations
  --     WHERE provider = 'whatsapp'
  --       AND config::text ~* 'phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id';

  ALTER TABLE org_integrations DROP CONSTRAINT IF EXISTS whatsapp_sem_identificador_proprio;
  -- IF EXISTS (correção C3): esta migration depende de `246` (900-21b) ter sido aplicada primeiro
  -- — sem IF EXISTS, rodar `247` num banco sem `246` falha num DROP em vez de nomear a
  -- dependência de ordem. A dependência de deploy continua sendo do `@devops` (Metadata).

  ALTER TABLE org_integrations ADD CONSTRAINT whatsapp_sem_identificador_proprio
    CHECK (
      provider <> 'whatsapp'
      OR config::text !~* 'phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id'
    );

  COMMENT ON CONSTRAINT whatsapp_sem_identificador_proprio ON org_integrations IS
    'Story 900-24 — fecha ARCH-001 (gate da 900-21b), reescrito pós-NO-GO (B4). Casa a ESTRUTURA
     do identificador (case-insensitive, até 2 caracteres não-alfanuméricos entre as 3 palavras,
     qualquer nesting) contra o TEXTO serializado do jsonb inteiro — sobre CHAVES e VALORES, não
     só a chave de topo em grafia exata. Troca aceita, com custo nomeado: dentro do provider
     "whatsapp" (só ele — o guard `provider <> ''whatsapp''` protege os demais), qualquer VALOR
     que contenha a sequência (ex.: uma observação de texto livre citando "phone_number_id") é
     bloqueado como falso positivo — risco medido como baixo hoje porque não há escritor de
     aplicação para `config` além do seed da 900-21b até a 900-47. Não cobre phone_number sem id
     (fora do escopo original desta invariante) nem ofuscação deliberada (fora do modelo de
     ameaça: o objetivo é impedir reintrodução acidental por um segundo desenvolvedor, não um
     adversário).';
  ```

  **Por que isto NÃO é a opção (b) do backlog (rejeitada sozinha):** (b) era "listar grafias
  plausíveis" — uma enumeração que qualquer grafia não prevista evade (foi exatamente o furo que o
  @po encontrou na v1 desta AC). O padrão corrigido não enumera grafias — casa a **estrutura**
  (as três palavras, nesta ordem, com até 2 separadores não-alfanuméricos entre elas, em qualquer
  caixa) em qualquer profundidade de aninhamento do JSON, porque opera sobre o texto serializado
  inteiro, não sobre uma chave específica. Continua sendo, estritamente, um `CHECK` mais amplo —
  mas fecha a CLASSE do defeito medido pelo gate (grafia + nesting + separador), não só os 2
  exemplos originais.

  **Verificação (mutação que reprova, célula de vivacidade — mesmo padrão que a `900-21b` já
  estabeleceu para este `CHECK`, `BEGIN … ROLLBACK`). Correção B3: `UPDATE ... LIMIT` é sintaxe
  MySQL — rodado contra `trifold-crm-dev`, a v1 quebrava com `ERROR 42601` em TODAS as 5 células,
  igual nas que deviam falhar e nas que deviam passar, tornando a régua cega. Substituído por
  subquery em `id` (o `BEGIN…ROLLBACK` continua obrigatório — a tabela tem trigger
  `set_updated_at`):**
  ```sql
  BEGIN;
    -- as 3 formas que evadiam o CHECK antigo — têm que falhar agora com 23514:
    UPDATE org_integrations SET config = '{"phoneNumberId":"5511999999999"}'
      WHERE id = (SELECT id FROM org_integrations WHERE provider = 'whatsapp' LIMIT 1);
                                                          -- esperado: ERROR 23514
  ROLLBACK;
  BEGIN;
    UPDATE org_integrations SET config = '{"meta":{"phone_number_id":"5511999999999"}}'
      WHERE id = (SELECT id FROM org_integrations WHERE provider = 'whatsapp' LIMIT 1);
                                                          -- esperado: ERROR 23514
  ROLLBACK;
  BEGIN;
    -- NOVA (B4): a grafia que a v1 afirmava fechar e não fechava — tem que falhar agora:
    UPDATE org_integrations SET config = '{"Phone-Number-Id":"5511999999999"}'
      WHERE id = (SELECT id FROM org_integrations WHERE provider = 'whatsapp' LIMIT 1);
                                                          -- esperado: ERROR 23514
  ROLLBACK;
  BEGIN;
    -- controle negativo: a grafia original (que já funcionava) continua bloqueada:
    UPDATE org_integrations SET config = '{"phone_number_id":"5511999999999"}'
      WHERE id = (SELECT id FROM org_integrations WHERE provider = 'whatsapp' LIMIT 1);
                                                          -- esperado: ERROR 23514 (sempre bloqueou)
  ROLLBACK;
  BEGIN;
    -- controle negativo: a MESMA chave em provider='meta_ads' continua passando —
    -- o CHECK morde só 'whatsapp', como desenhado (900-21b já estabeleceu isto; confirmar que
    -- a mudança desta story não alargou o escopo por engano):
    UPDATE org_integrations SET config = '{"phone_number_id":"5511999999999"}'
      WHERE id = (SELECT id FROM org_integrations WHERE provider = 'meta_ads' LIMIT 1);
                                                          -- esperado: sucesso
  ROLLBACK;
  BEGIN;
    -- controle negativo: phone_number (sem id) continua fora do escopo (decisão nomeada acima):
    UPDATE org_integrations SET config = '{"phone_number":"5511999999999"}'
      WHERE id = (SELECT id FROM org_integrations WHERE provider = 'whatsapp' LIMIT 1);
                                                          -- esperado: sucesso
  ROLLBACK;
  BEGIN;
    -- NOVA (B4): falso positivo nomeado — troca aceita, auditável (ver COMMENT):
    UPDATE org_integrations SET config = '{"observacao":"o phone_number_id fica em whatsapp_config"}'
      WHERE id = (SELECT id FROM org_integrations WHERE provider = 'whatsapp' LIMIT 1);
                                                          -- esperado: ERROR 23514 (FP aceito)
  ROLLBACK;
  ```
  Rodar contra `trifold-crm-dev` (Task 7.3) e, no runbook do `@devops`, contra produção
  IMEDIATAMENTE após aplicar (Task 7.5) — mesma exigência D2 que o gate da `900-21b` já impôs
  (repetir a captura e exigir os mesmos valores).

  **`docs/backlog.md`: fechar `[ARCH-001]`** (mover para uma seção "Resolvido" ou remover com nota
  — decisão de forma do `@dev`/`@po`, o conteúdo é o que importa) quando a migration for aplicada
  em produção, não só mergeada. `REL-001`/`TEST-001`/`DOC-001` continuam intocados.
  [Source: `docs/backlog.md` `[ARCH-001]`; `docs/qa/gates/900.21b-...yml`; migration `246`,
  `900-21b`]

- [x] **AC8 — Varredura: zero outro `.maybeSingle()`/`.single()` de resolução de org com `error`
  descartado nos 4 arquivos.**

  Grep de verificação, escopado (não o repo inteiro — mediria arquivo errado):
  ```bash
  git grep -nE '\.(maybeSingle|single)\(\)' -- \
    packages/web/src/app/api/webhook/whatsapp/route.ts \
    packages/web/src/lib/meta/process-lead.ts \
    packages/web/src/app/api/webhooks/landing-page/route.ts \
    packages/web/src/app/api/telegram/webhook/route.ts
  ```
  Cada ocorrência remanescente precisa ser **lida** (não só contada) e classificada: checagem de
  **existência de linha** (dedup de mensagem por `wamid`, lead existente por telefone, stage
  default) — fora do escopo, ficam como estão — ou resolução de **org** — não pode sobrar nenhuma
  depois das ACs 3-6. Registrar a classificação na Task 8.1, arquivo por arquivo.
  [Source: mission do @po/dono do produto, 2026-08-29 — "confirme que não sobrou nenhum outro
  `.maybeSingle()` com error descartado"]

- [~] **AC9 — Restrição central: produção (uma org) não muda de resposta — REFORÇADA pós-NO-GO
  (B1, B2, C5).**

  **A prova tem duas camadas, não uma.** A v1 desta AC só tinha a camada de detecção (SQL
  pós-deploy) — o @po mediu que isso é **endereço, não carrasco**: nenhuma das 7 mutações/5
  propriedades da AC10 reprovava se, em `both`, o código passasse a usar `novo.orgId` em vez de
  `legado.orgId` — a única defesa contra a story inverter o comportamento da Trifold era a leitura
  humana do diff.

  1. **Camada 1 — invariante, PRÉ-deploy, com carrasco (AC10, mutação #8):** com
     `WEBHOOK_ORG_ROUTING=both`, o `orgId`/`config` que chega ao processamento é **sempre** o do
     caminho legado — testado por receptor (4 testes), plantando divergência forçada
     (legado ⇒ org-A, identifier ⇒ org-B) e afirmando que o processamento usou `org-A`. Esta é a
     prova que sustenta "o caminho novo nunca decide" — a AC9 sozinha nunca provaria isso, só
     mediria a consequência dias depois.
  2. **Camada 2 — observação, PÓS-deploy (as 6 consultas abaixo):** confirma em produção real o
     que a Camada 1 já garante por construção. Detecta drift/regressão futura, não substitui a
     Camada 1.

  **Consultas nomeadas, rodadas contra produção IMEDIATAMENTE após o deploy** (mesmo padrão da
  `900-21b`, D1-D2 do gate):
  ```sql
  -- 1. Confirma que produção segue com exatamente 1 org ativa (pré-condição da garantia):
  SELECT count(*) FROM organizations WHERE is_active = true;                    -- esperado: 1

  -- 2. A garantia de que o LEGADO decide não depende só da contagem de orgs — depende de o
  --    predicado do legado (whatsapp_config.status='active') e o do identifier
  --    (organizations.is_active=true) apontarem pra MESMA org. É essa equivalência, não a
  --    contagem de orgs, que sustenta "byte a byte idêntico" (achado B1 do @po — as duas
  --    populações já divergem HOJE no trifold-crm-dev):
  SELECT
    (SELECT org_id FROM whatsapp_config WHERE status = 'active' LIMIT 1) AS org_legado,
    (SELECT id FROM organizations WHERE is_active = true LIMIT 1) AS org_identifier;
                                                       -- esperado: as duas colunas iguais, em prod

  -- 3. PRÉ-CONDIÇÃO da query 4 (correção C5 — sem isto, "zero divergência" é indistinguível de
  --    "o contador não escreveu nada", porque logOrgResolved é fire-and-forget/logEvent, com
  --    perda medida em produção — Story 87-6, lib/logger.ts:46-54):
  SELECT count(*) FROM system_events WHERE event_type = 'WEBHOOK_ORG_RESOLVED';
                                                                     -- esperado: > 0 (contador vivo)

  -- 4. SÓ interpretar depois da query 3 confirmar > 0. Depois de 24h de tráfego real em modo
  --    "both": zero divergência.
  SELECT count(*) FROM system_events
    WHERE event_type = 'WEBHOOK_ORG_RESOLVED' AND (metadata->>'divergiu')::boolean = true;
                                                                                   -- esperado: 0

  -- 5. Nenhum WEBHOOK_ORG_UNRESOLVED em produção com 1 org só (branch inalcançável em
  --    `identifier` puro; e em legacy/both, landing-page nem chama este log — ver AC5):
  SELECT count(*) FROM system_events WHERE event_type = 'WEBHOOK_ORG_UNRESOLVED';
                                                                                   -- esperado: 0

  -- 6. O contador do épico (§854), pronto para a decisão de cutover da Onda 3:
  SELECT metadata->>'via' AS via, count(*) FROM system_events
    WHERE event_type = 'WEBHOOK_ORG_RESOLVED' GROUP BY 1;
                                             -- esperado: só a linha 'legacy', nenhuma 'identifier'
                                             -- pura (modo "both" nunca usa "identifier" como via)
  ```
  A query 6 sair só com `via='legacy'` é o resultado ESPERADO em modo `both` (AC2: "both" sempre
  usa o legado) — não é um sinal de que o código novo não roda; é a prova de que ele roda em modo
  sombra, exatamente como desenhado.
  [Source: `docs/qa/po-validation-900-24.md`, correções B1/B2/C5; mission do @po/dono do produto,
  2026-08-29 — "restrição central do dono do produto"; plano aprovado, "Verificação ponta a
  ponta", Onda 2]

- [x] **AC10 — Testes unitários (Camada A), fake que reprova o defeito central — REESCRITA
  pós-NO-GO (B2, B5, seção 0 do parecer).**

  `packages/web/src/lib/tenancy/webhook-org.test.ts`, com o fake extraído para
  `packages/web/src/lib/tenancy/__fixtures__/fake-supabase-postgrest.ts` (Task 10.1 — recomendação
  do parecer, evita uma terceira cópia divergente).

  **O molde `admin-invite.test.ts` (commit `2a8c8473`) mente duas vezes, medido pelo @po ao rodar
  o código legado literal contra os dois fakes (ver Context):**
  ```ts
  // admin-invite.test.ts:108-116 — NÃO copiar sem correção
  single: async () => {
    if (operacao === "insert") return usersInsert
    const linhas = selecionadas()
    return { data: linhas[0] ?? null, error: null }        // mente: 0 e 2+ linhas, mesmo formato
  },
  maybeSingle: async () => {
    const linhas = selecionadas()
    return { data: linhas[0] ?? null, error: null }        // mente: 2+ linhas vira "achei a 1ª"
  },
  ```
  Com este fake, o teste central desta story (`.maybeSingle()`/`.single()` legado descarta 2+
  linhas em silêncio) é **insatisfazível** — fica vermelho por causa do instrumento, não do
  código sob teste.

  **Regra 3 do fake, corrigida e completa (B5) — fiel ao `@supabase/postgrest-js@2.101.1`
  instalado, comportamento medido pelo @po contra o PostgREST real (`dist/index.cjs:129-140`,
  HTTP 406/`PGRST116`):**
  ```ts
  function resultadoSingular(linhas: Linha[]) {
    if (linhas.length === 1) return { data: linhas[0], error: null, status: 200 }
    const contagem = linhas.length === 0 ? "0 rows" : `${linhas.length} rows`
    return {
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned",
                details: `Results contain ${contagem}, application/vnd.pgrst.object+json requires 1 row` },
      status: 406,
    }
  }
  // .maybeSingle() e .single() COMPARTILHAM esta função — a diferença real entre os dois métodos
  // (0 linhas: .maybeSingle() no client real intercepta o PGRST116 de "0 rows" e devolve
  // {data:null, error:null}; .single() propaga o PGRST116) fica fora do escopo do fake porque
  // NENHUM dos 3 resolvers desta story usa .maybeSingle()/.single() como terminal — o fake existe
  // para reproduzir o LEGADO (que ainda usa os dois), não para ser um mock genérico do
  // postgrest-js inteiro. Se um teste futuro precisar da distinção de 0 linhas entre os dois
  // métodos, resolver então — não aqui.
  ```
  **Testes dedicados do fake** (Task 10.3, não asserções de canto): um por comportamento
  (`maybeSingle`/2+ linhas, `single`/0 linhas, `single`/2+ linhas), afirmando **`data` e
  `error.code`**, não só `data`.

  **Três regras do fake — atualizadas:**
  1. `.eq()`/`.limit()` filtram de verdade (molde já faz isso para `.eq()`/`.order()`/`.limit()` —
     reaproveitar a mesma implementação de builder).
  2. `.limit(n)` (terminal) devolve `{ data: linhas.slice(0, n), error: null }` — é o terminal que
     os 3 resolvers desta story usam, **não** `.maybeSingle()`/`.single()`.
  3. **`.maybeSingle()` E `.single()`** (regra ampliada — B5) devolvem `resultadoSingular()` acima,
     **incluindo o `error.code`**, para que testes que leem o `error` (não só o `data`) também
     tenham carrasco. Usada como controle de regressão pelo código LEGADO extraído
     (`legacyResolveActiveConfig`/`legacyResolveActiveOrgId`/`legacyResolveOrgId`/
     `legacyResolveFirstOrg`), nunca pelos 3 resolvers novos.

  **Lista de mutações — executada e registrada na story (Task 10.5, uma linha por mutação, com o
  resultado real, não previsto). 8 mutações (nova #8 — B2, a mais importante da rodada):**
  | # | Mutação | Esperado |
  |---|---|---|
  | 1 | `resolveOrgByWhatsAppPhone` sem o filtro `.eq("phone_number_id", ...)` (só `status='active'`) | vermelho — resolve a org errada com 2 configs ativas |
  | 2 | `resolveOrgByMetaPage` sem `.limit(2)` (`.maybeSingle()` puro) | vermelho — não distingue "ambígua" de "não encontrada" |
  | 3 | `resolveSoleOrg` sem o filtro `is_active` | vermelho — pega org inativa como se fosse a única |
  | 4 | `decidirModoRoteamento()` hardcoded para `"legacy"` | vermelho — teste de "both computa e loga divergência" falha (nenhum `WEBHOOK_ORG_RESOLVED` com `via` computado) |
  | 5 | `logOrgUnresolved` sem `await` (fire-and-forget) — **carrasco corrigido (B5):** o mock de `system_events`/`webhook_logs` resolve num **tick posterior** (`await new Promise(r => setTimeout(r, 0))` dentro do próprio fake), e a asserção roda **no retorno da rota**, não depois. Com mock síncrono (resolve no mesmo tick, como o molde fazia), a mutação **não reprova** — medido pelo @po: o teste passa mesmo sem `await` | vermelho (com o mock assíncrono) — a rota já respondeu e a escrita ainda não aconteceu |
  | 6 | `quantidadeEncontrada` fixo em `1` independente do array | vermelho — teste de "2 linhas → quantidadeEncontrada === 2" falha |
  | 7 | reverter `resolveOrgByWhatsAppPhone` para `.maybeSingle()` puro (sem `.limit`) | vermelho — com a regra 3 corrigida do fake (`error.code: "PGRST116"` incluso), o teste de ambiguidade vira `{data:null, error:PGRST116}`, e uma asserção que também lê `error` (não só `data`) reprova; sem a regra 3 corrigida, ficaria verde nos dois lados |
  | **8 (nova, B2)** | **no branch `both`, trocar `resolvido = { orgId: legado.orgId, via: "legacy" }` por `resolvido = { orgId: novo.orgId, via: "identifier" }`** | **vermelho — é a mutação que prova "o caminho novo nunca decide". Sem ela, nada na story detecta essa inversão antes da leitura humana do diff.** |

  **Teste da mutação #8 — por RECEPTOR, não genérico (4 testes, um por rota; a asserção (1) é a
  que importa, a (2) sozinha é a fábrica, não o objeto):** plantar legado ⇒ resolve para `org-A`,
  identifier ⇒ resolve para `org-B` (divergência forçada, telefones/`page_id`/contagem de orgs
  distintos no fake), rodar com `WEBHOOK_ORG_ROUTING=both`, e afirmar as duas coisas:
  1. **O `orgId` que efetivamente chega ao processamento é `org-A`** (para `webhook/whatsapp`:
     espiar o argumento passado a `findOrUpsertLead`; para `process-lead.ts`: o `org_id` do
     `INSERT`/`SELECT` de `leads`; para `landing-page`: idem; para `telegram`: idem).
  2. `logOrgResolved` foi chamado com `via: "legacy"` e `divergiu: true`.

  **Testes de propriedade mínimos (além da tabela de mutação):**
  - `resolveOrgByWhatsAppPhone`: 2 orgs, telefones distintos → cada telefone resolve à org certa;
    telefone inexistente → `nenhuma_correspondencia`; 2 configs ativas com o MESMO telefone
    (dado sintético) → `ambigua`, `quantidadeEncontrada === 2`.
  - `resolveOrgByMetaPage`: mesmo padrão, com `page_id`.
  - `resolveSoleOrg`: 1 org ativa → resolve; 0 → `nenhuma_correspondencia`; 2 → `ambigua`; 1 ativa
    + 1 inativa → resolve (a inativa não conta).
  - `decidirModoRoteamento`: env ausente/vazio → `"both"`; `"legacy"`/`"identifier"` explícitos →
    o valor; qualquer outra string → `"both"` (fail-safe, não lança).
  - `logOrgResolved`/`logOrgUnresolved`: espiar `createAdminClient`/`logEvent`/`logEventOnce`
    (mesmo padrão de `vi.mock` que `admin-invite.test.ts` já usa) — `logOrgUnresolved` nunca grava
    `payload`/`metadata` com chave que não seja `phone_number_id`/`page_id`/
    `quantidade_organizacoes_ativas`/`receptor` (teste de shape, não só de presença).
  - **Condição do AUTO-DECISÃO 1 (Telegram, `docs/qa/po-validation-900-24.md`):** o teste do
    Telegram afirma explicitamente `metadata.receptor === "telegram"` presente na chamada — não
    basta `source: "other"` estar certo, porque `'other'` sozinho não distingue Telegram de
    qualquer outro receptor futuro que reuse o mesmo valor.
  [Source: `docs/qa/po-validation-900-24.md`, correções B2/B5, seção 0; mission do @po/dono do
  produto, 2026-08-29 — lições 4 e 5; `feedback_correcao_que_muda_comportamento_precisa_de_novo_carrasco.md`;
  `packages/web/src/lib/tenancy/admin-invite.test.ts`]

---

## Tasks / Subtasks

- [x] **Task 1 — `webhook-org.ts`: os 3 resolvers (AC1) — @dev**
  - [x] 1.1 Criar `packages/web/src/lib/tenancy/webhook-org.ts` com os tipos e os 3 resolvers.
  - [x] 1.2 Confirmar (leitura, não suposição) que `whatsapp_config` tem as colunas
    `org_id, phone_number_id, access_token, coexistence_enabled` com esses nomes/tipos.
  - [x] 1.3 Confirmar que `org_integrations` aceita `.eq("config->>page_id", pageId)` (mesma
    sintaxe já usada em `webhook/whatsapp/route.ts:287` para outra coluna jsonb).

- [x] **Task 2 — dual-run compartilhado (AC2) — @dev**
  - [x] 2.1 `decidirModoRoteamento`, `logOrgResolved`, `logOrgUnresolved` em `webhook-org.ts`.
  - [x] 2.2 Adicionar `src/lib/tenancy/webhook-org.ts` a `docs/audits/admin-client-allowlist.json`
    → `legitimos`, com o motivo do AC2.
  - [x] 2.3 `npx eslint src` (dentro de `packages/web`) continua saindo 0 ocorrências da regra
    `aios/no-unscoped-admin-client`.

- [x] **Task 3 — `webhook/whatsapp/route.ts` (AC3) — @dev**
  - [x] 3.1 Extrair a query legada para `legacyResolveActiveConfig`.
  - [x] 3.2 Ler `phoneNumberId` de `value?.metadata?.phone_number_id`.
  - [x] 3.3 Fiar o padrão dual-run (Dev Notes) — legado sempre usado em `both`, `identifier` só
    decide sozinho no modo `identifier`.
  - [x] 3.4 Confirmar que `config.access_token` continua igual em todos os call sites existentes
    (grep antes/depois, contagem de ocorrências idêntica).

- [x] **Task 4 — `lib/meta/process-lead.ts` (AC4) — @dev**
  - [x] 4.1 Renomear `resolveOrgId` → `legacyResolveActiveOrgId` (mesmo corpo).
  - [x] 4.2 Adicionar `resolveOrgByMetaPage(supabase, entry?.id)` como caminho identifier.
  - [x] 4.3 Fiar o dual-run dentro de `processMetaLead`, preservando `fail()`/`markProcessed()`.
  - [x] 4.4 Adicionar a chamada a `logOrgUnresolved` no branch que hoje só chama `fail(...)`.

- [x] **Task 5 — `webhooks/landing-page/route.ts` (AC5) — @dev — REESCRITA pós-NO-GO (B1)**
  - [x] 5.1 Renomear `resolveOrgId` → `legacyResolveOrgId` (mesmo corpo, **byte a byte**, sem
    mudar a resposta HTTP do branch "não resolveu" em `legacy`/`both`).
  - [x] 5.2 Adicionar `resolveSoleOrg(adminSupabase)` como caminho identifier — usado sozinho
    **só** quando `WEBHOOK_ORG_ROUTING=identifier`.
  - [x] 5.3 **NÃO** tocar o branch "nenhuma org ativa" de `legacy`/`both` — continua `{ ok: false
    }` → 5xx, exatamente como hoje. O 200+log só existe dentro do branch `identifier` (código
    novo, não substitui o antigo).
  - [x] 5.4 Confirmar que o `webhook_logs` já inserido em `:97-107` é reaproveitado (não duplicar
    a linha), nos dois branches (5xx legado e 200 identifier).
  - [x] 5.5 Teste dedicado: com `WEBHOOK_ORG_ROUTING=legacy` e `WEBHOOK_ORG_ROUTING=both`, "zero
    orgs ativas"/"config inativa" continua respondendo 5xx (mesmo `status`, mesmo corpo que o
    teste teria capturado ANTES desta story — comparar snapshot).

- [x] **Task 6 — `telegram/webhook/route.ts` (AC6) — @dev**
  - [x] 6.1 Renomear a query atual → `legacyResolveFirstOrg` (mesmo corpo, `.limit(1).single()`).
  - [x] 6.2 Adicionar `resolveSoleOrg(supabase)` como caminho identifier.
  - [x] 6.3 Fiar o dual-run dentro do `try` já existente (`:332`).
  - [x] 6.4 Usar `webhookLogsSource: "other"` (AUTO-DECISÃO do AC6) — comentário no código
    explicando por que (`'telegram'` não está no `CHECK` de `webhook_logs.source`).

- [x] **Task 7 — Migration `247` (AC7) — @dev — REESCRITA pós-NO-GO (B3, B4, C3)**
  - [x] 7.1 Rodar a pré-condição (SELECT read-only, regex corrigido — B4) contra
    `trifold-crm-dev` — registrar a saída (esperado: 0 linhas).
  - [x] 7.2 Criar `supabase/migrations/247_org_integrations_check_whatsapp_grafias.sql` com
    `DROP CONSTRAINT IF EXISTS` (C3) e o padrão corrigido (B4).
  - [x] 7.3 Aplicar em `trifold-crm-dev`, rodar as **8** células de vivacidade
    (`BEGIN…ROLLBACK`, subquery por `id` — B3), registrar cada resultado real (não o esperado).
  - [x] 7.4 `pnpm gate:tenancy` (ou script equivalente) não reporta violação nova para
    `org_integrations`.
  - [ ] 7.5 (No runbook do `@devops`, fora desta story): rodar a pré-condição de novo em
    PRODUÇÃO antes de aplicar; aplicar; repetir as 8 células; fechar `[ARCH-001]` em
    `docs/backlog.md`.

- [x] **Task 8 — Varredura (AC8) — @dev**
  - [x] 8.1 Rodar o grep escopado, classificar cada ocorrência remanescente (existência de linha
    vs. resolução de org), registrar na story.

- [ ] **Task 9 — Configuração de ambiente (AC9) — @devops, fora do código desta story —
  correção C4 na justificativa da 9.1**
  - [ ] 9.1 `trifold-crm-dev`: `WEBHOOK_ORG_ROUTING=identifier` desde o dia 1. **Razão real
    (corrigida — C4): não é "com duas orgs o legado está quebrado" — hoje o `trifold-crm-dev` tem
    UMA org só** (`Org de Teste — Epic 900`, medida pelo @po), **com `whatsapp_config`
    `status='inactive'` e `phone_number_id` NULL** — o legado (`status='active'`) já não resolve
    nada lá hoje, independente desta story. Rodar `identifier` desde o dia 1 é o modo certo
    porque é o ambiente de TESTE do modo que a Onda 3 vai promover, não porque há uma segunda org
    (essa só chega no Passo 6, story seguinte). Com `identifier`, todo webhook de WhatsApp em
    `trifold-crm-dev` hoje cai em `WEBHOOK_ORG_UNRESOLVED` — **esperado**, não regressão (o
    legado também não resolvia).
  - [ ] 9.2 Produção: `WEBHOOK_ORG_ROUTING=both` (explícito — mesmo resultado do default, mas
    nomeado, para não depender do default implícito de código sobreviver a um refactor futuro).
  - [ ] 9.3 24h após o deploy, rodar as 6 queries da AC9 contra produção (na ordem — a query 3 é
    pré-condição da 4), colar o resultado real no Dev Agent Record.

- [x] **Task 10 — Testes (AC10) — @dev — REESCRITA pós-NO-GO (B2, B5)**
  - [x] 10.1 Extrair o fake corrigido para
    `packages/web/src/lib/tenancy/__fixtures__/fake-supabase-postgrest.ts` (recomendação de forma
    dentro de B5 do parecer — evita uma terceira cópia divergente do molde).
  - [x] 10.2 `webhook-org.test.ts` com o fake importado de `__fixtures__/`, as 3 regras da AC10
    (agora cobrindo `.single()` também — B5).
  - [x] 10.3 Testes dedicados do fake (não asserções de canto): um por comportamento
    (`maybeSingle`/2+, `single`/0, `single`/2+), afirmando `data` **e** `error.code`.
  - [x] 10.4 Mutação #8 (B2): 4 testes por receptor, divergência forçada em `both`, afirmando o
    `orgId` processado E a chamada a `logOrgResolved`.
  - [x] 10.5 Rodar a tabela de mutações (agora 8), registrar resultado real de cada uma (não o
    esperado) — incluindo a mutação #5 corrigida (mock com resolução em tick posterior).
  - [x] 10.6 Asserção da condição do AUTO-DECISÃO 1: teste do Telegram afirma
    `metadata.receptor === "telegram"` presente na chamada a `logOrgUnresolved`/`logOrgResolved`
    — `source: "other"` sozinho não pode ser o único discriminador.
  - [x] 10.7 `pnpm test` (dentro de `packages/web`) verde, incluindo os testes existentes dos 4
    arquivos modificados (`webhook/whatsapp`, `webhooks/meta-ads` se houver, `landing-page` se
    houver, `telegram` se houver — confirmar quais têm suíte hoje antes de assumir).

---

## Dev Notes

### Padrão de fiação dual-run (comum aos 4 receptores — descrito uma vez, aplicado 4x)

```ts
const modo = decidirModoRoteamento()
let resolvido: { orgId: string; via: "legacy" | "identifier" } | null = null

if (modo === "legacy") {
  const legado = await legacyResolve(...)
  if (legado) resolvido = { orgId: legado.orgId, via: "legacy" }
} else if (modo === "both") {
  const legado = await legacyResolve(...)
  const novo = await resolveXxx(...)               // um dos 3 resolvers de webhook-org.ts
  if (legado) {
    resolvido = { orgId: legado.orgId, via: "legacy" }
    logOrgResolved({
      receptor, via: "legacy", orgId: legado.orgId,
      divergiu: novo.status === "resolvida" ? novo.orgId !== legado.orgId : null,
    })
  }
  // legado null E novo resolvido: "both" AINDA preserva o comportamento antigo (sem processar) —
  // é sinal real de bug no legado, mas não é esta story que troca o operativo por conta disso.
} else {
  // "identifier" — só aqui o novo caminho decide sozinho.
  const novo = await resolveXxx(...)
  if (novo.status === "resolvida") {
    resolvido = { orgId: novo.orgId, via: "identifier" }
    logOrgResolved({ receptor, via: "identifier", orgId: novo.orgId, divergiu: null })
  }
}

if (!resolvido) {
  await logOrgUnresolved({ receptor, motivo: ..., quantidadeEncontrada: ..., identificador: ..., webhookLogsSource: ... })
  return NextResponse.json({ status: "ok" })
  // ⚠️ EXCEÇÃO NOMEADA (B1, pós-NO-GO): em `webhook/whatsapp`, `webhooks/meta-ads` e
  // `telegram/webhook`, o "não resolvido" do LEGADO já devolve 200 hoje — o esqueleto acima vale
  // igual nos 3 modos. Em `webhooks/landing-page` NÃO: hoje "não resolvido" no legado devolve
  // 5xx (o proxy `api/lead.js` trata como erro e re-tenta), e mudar isso silenciosamente reabriria
  // um incidente já corrigido (ver AC5). Lá, o 200+log só vale no branch "identifier" — em
  // `legacy`/`both`, `legado === null` continua devolvendo 5xx, byte a byte como hoje. AC5 tem o
  // esqueleto completo, reescrito — não copiar este bloco genérico para `landing-page`.
}
```

Cada receptor implementa `legacyResolve`/`resolveXxx` com a assinatura que já tem (para
`webhook/whatsapp`, `legacyResolve` devolve a linha inteira de `whatsapp_config`, não só
`orgId` — ver AC3). O ESQUELETO acima é o mesmo (com a exceção de `landing-page` marcada); os
TIPOS de retorno variam por receptor. Não criar uma função genérica `aplicarRoteamentoDual<T>()` —
a tentativa de generalizar os 4 tipos de retorno diferentes (linha completa vs. `orgId` puro, mais
a exceção de resposta HTTP da `landing-page`) custaria mais em genéricos TS do que economiza em
duplicação; 4 blocos pequenos e explícitos são mais fáceis de auditar que 1 genérico com union
type.

### Por que `resolveOrgByWhatsAppPhone` devolve a linha inteira, não só `orgId`

O código legado usa `config.access_token` em **8 pontos diferentes** do arquivo (download de
mídia, envio de mensagens, chamadas à Graph API). Se o resolver devolvesse só `orgId`, o chamador
precisaria de um SEGUNDO lookup em `whatsapp_config` para pegar o `access_token` — exatamente o
"lookup cruzado" que a mission chama de "token por org sai de brinde, sem Vault": o `select` já
traz as 4 colunas na mesma query, e o resolver preserva isso.

### `ARCH-001` — por que a opção escolhida não é "mais uma enumeração de grafias"

Ver Context e AC7. O ponto central: `phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id` com `~*`
sobre `config::text` é um predicado sobre **estrutura de token** (3 palavras, ordem fixa, até 2
separadores não-alfanuméricos entre elas), não uma lista de strings — nenhuma story futura precisa
voltar aqui para adicionar mais uma grafia à lista, porque não há lista. **Correção B4
(pós-NO-GO):** a v1 desta AC usava `phone[_]?number[_]?id` (só underscore opcional) e o Dev Notes
chegou a citar `Phone-Number-Id` como exemplo "sem lista" — o @po mediu que essa grafia **passava**
pelo padrão da v1, junto de `phone.number.id`/`phone number id`/`phone__number__id`. O padrão
corrigido fecha as 6, com o custo nomeado de casar VALORES (não só chaves) dentro do provider
`whatsapp` — ver o `COMMENT` da migration para os 3 falsos positivos medidos.

### `docs/backlog.md` — o que muda e o que não muda

`[ARCH-001]` fecha (quando a migration chegar a produção — Task 7.5, `@devops`). `[REL-001]`,
`[TEST-001]`, `[DOC-001]` continuam exatamente como estão — nenhum tem "Dona: 900-24" no
cabeçalho, só `[ARCH-001]` tem.

### Sobre a dependência `900-23` (medição, não suposição)

Ver Metadata "Depends on" — sem sobreposição de arquivo, sem import cruzado. A única coisa
realmente compartilhada é o VOCABULÁRIO de `system_events` (`category: "webhook"` vs `"cron"`,
mas o padrão "log por unidade + resumo" que `for-each-org.ts` estabeleceu para crons não se aplica
aqui — um webhook processa uma requisição por vez, não itera uma lista).

### `followup` (900-23) como precedente de "correção sem o helper genérico"

A `900-23` corrigiu `cron/followup:167-171` movendo o lookup de `whatsapp_config` para DENTRO do
loop de `rules`, escopado por `org_id` — não usando `forEachActiveOrg`. Esta story segue o mesmo
espírito: os 4 receptores usam os 3 resolvers COMPARTILHADOS (o que de fato se repete: a lógica de
"`.limit(2)` + nomear ambiguidade"), mas cada rota fia o dual-run à sua própria estrutura, sem um
wrapper genérico de composição — mesma lição, aplicada de novo.

### Telegram, `webhook_logs.source` e a AUTO-DECISÃO do AC6

Reforço: a alternativa (migration para adicionar `'telegram'` ao `CHECK`) foi considerada e
rejeitada por desproporção de escopo — uma migration inteira só para não perder um rótulo em uma
coluna que já tem `event_type`/`metadata` livres para carregar a mesma informação. Se uma story
futura precisar de `webhook_logs` completo para telegram (não só o caso "não resolveu"), essa
story decide a migration com o contexto certo — não esta.

### Ordem de implementação sugerida (não bloqueante entre si)

AC1 → AC2 → (AC3, AC4, AC5, AC6 em qualquer ordem, cada uma independente das outras 3) → AC7
(pode rodar em paralelo às ACs 3-6, é outro arquivo) → AC8 (precisa das 3-6 prontas) → AC10 (pode
começar assim que AC1/AC2 existirem, cresce junto com as demais) → AC9 (só depois do deploy).

### Testing Standards
- Framework: Vitest, mesmo padrão de `admin-invite.test.ts` (`vi.mock` de módulos, sem banco real).
- Camada B (integração contra `trifold-crm-dev`, duas orgs reais) é **fora desta story** — Passo 6
  do plano, story seguinte.
- CodeRabbit: sem seção dedicada nesta story — mesma convenção que `900-21b`/`900-23` já
  estabeleceram (o App do GitHub é o gatilho real; a chave `coderabbit_integration` não existe em
  `core-config.yaml`; ver `.claude/rules/coderabbit-integration.md`).

---

## Testing

### Abordagem
- **Camada A (esta story):** unitária, `vitest`, sem banco, fake fiel ao `@supabase/postgrest-js`
  real (`packages/web/src/lib/tenancy/__fixtures__/fake-supabase-postgrest.ts`) honrando
  `.eq()`/`.limit()` e reproduzindo — em `data` **e** `error` — a ambiguidade real de
  `.maybeSingle()`/`.single()` (correção B5, pós-NO-GO: o molde `admin-invite.test.ts` reproduzia
  só o `data`, o que tornava o defeito central desta story impossível de reprovar). Roda em CI
  normal.
- **Camada B (story seguinte, Passo 6):** integração contra `trifold-crm-dev` com duas orgs reais,
  incluindo o teardown com canário que o plano já especifica. Não iniciar aqui.
- **Migration `247`:** célula de vivacidade `BEGIN…ROLLBACK` (AC7), 8 casos (correções B3/B4),
  rodada manualmente contra `trifold-crm-dev` e, no runbook do `@devops`, contra produção.
- **Invariante pré-deploy (AC10, mutação #8 — correção B2):** "o caminho novo nunca decide em
  `both`" é provado por teste, por receptor, não só observado depois.
- **Produção pós-deploy:** as 6 queries nomeadas da AC9 (correções B1/C5), 24h depois do deploy.

---

## Change Log

| Data | Autor | Mudança |
|---|---|---|
| 2026-08-29 | @sm (River) | Draft inicial. Cobre o Passo 4 da Onda 2 do plano aprovado — resolução de org nos 4 receptores de webhook, com dual-run (`WEBHOOK_ORG_ROUTING`). Passo 6 (teste de duas orgs) explicitamente fora, por instrução do dono do produto. Herda `ARCH-001` do gate da `900-21b` (dona explícita em `docs/backlog.md`) — resolvido por `CHECK` estrutural (regex sobre `config::text`), não por enumeração de grafias (opção rejeitada pelo próprio backlog). `REL-001` registrado como explicitamente fora (sem dona atribuída). Dependências declaradas: `900-21b` (bloqueante para deploy, PR #526 medido aberto) e `900-23` (declarada pelo epic, sem acoplamento técnico medido — pode implementar em paralelo). Migration `247` remedida contra todas as refs (`246` é o teto, `247` livre). Numeração `900-24` sem sufixo (número já reservado pelo epic, mesmo conteúdo, sem colisão). Achado do @po herdado da `900-23` (nenhum outro `.maybeSingle()`/`.single()` de resolução de org com erro descartado nos 4 arquivos) confirmado por medição. AUTO-DECISÃO: `webhook_logs.source` para telegram usa `'other'` (não existe `'telegram'` no `CHECK`; migration nova para isso seria desproporcional ao escopo). AUTO-DECISÃO: mudança de comportamento explícita e aceita em `landing-page` para o caso "zero orgs ativas" (5xx → 200+log, inalcançável em produção hoje por haver 1 org só). |
| 2026-08-29 | @sm (River) | **Revisão pós-NO-GO do @po** (`docs/qa/po-validation-900-24.md`, 6,5/10), 5 correções obrigatórias + 7 recomendadas aplicadas — desenho preservado, nenhuma reabre a arquitetura. **B1 (AC5, a mais séria):** o argumento "inalcançável" da v1 foi medido no resolver que produção NÃO consulta (`resolveSoleOrg`, não `legacyResolveOrgId`); em `legacy`/`both` o legado usa `whatsapp_config.status='active'` — estado operacional, sem `CHECK` (`REL-001`), com incidente real em 10/08 — e o 200 uniforme reabriria "lead pago perdido em silêncio", o próprio incidente que `landing-page:109-118` corrigiu. **Corrigido:** 200+log só vale no modo `identifier`; em `legacy`/`both` o branch "não resolveu" continua devolvendo 5xx, byte a byte como hoje — AUTO-DECISÃO (opção (i) do parecer), documentada. **B2 (AC9/AC10):** a promessa central ("o caminho novo nunca decide" em `both`) não tinha carrasco — nenhuma das 7 mutações originais reprovava se `both` passasse a usar `novo.orgId`. **Corrigida:** mutação #8 nova + teste por receptor (4), afirmando o `orgId` processado E a chamada a `logOrgResolved`. **B3 (AC7):** as 5 células de vivacidade usavam `UPDATE ... LIMIT 1` (sintaxe MySQL) — `ERROR 42601` em todas, cego para o que deveria falhar/passar. Corrigido para subquery por `id`. **B4 (AC7):** o predicado `phone[_]?number[_]?id` não fechava a classe que a story afirmava fechar — `Phone-Number-Id`/`phone.number.id`/`phone number id`/`phone__number__id` passavam (o próprio Dev Notes citava `Phone-Number-Id` como "sem lista", e passava). Corrigido para `phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id`, com FP nomeado no `COMMENT` e 2 células novas de vivacidade. **B5 (AC10):** regra 3 do fake só corrigia `.maybeSingle()`/só `data` — o `error` (causa raiz nomeada no Context) e `.single()` (terminal em 2 dos 4 pontos corrigidos) continuavam mentindo; e a mutação #5 não reprovava com mock síncrono. Corrigido: regra 3 cobre os dois métodos, `data` **e** `error.code` (`PGRST116`/406, medido contra o postgrest-js real), mutação #5 com mock em tick posterior, fake extraído para `__fixtures__/` (o molde já se propagara uma vez para `resend-admin-invite/route.test.ts`, latente). **Recomendadas aplicadas:** C1 (assimetria de `status` entre resolvers nomeada na AC4, decisão de omitir mantida); C2 (`WhatsAppConfigLinha.access_token: string \| null`, guarda explícita); C3 (`DROP CONSTRAINT IF EXISTS`); C4 (justificativa da Task 9.1 corrigida — `trifold-crm-dev` tem 1 org hoje, não 2; razão real é "ambiente do modo que a Onda 3 promove", não "legado quebrado por 2 orgs"); C5 (query de divergência da AC9 ganhou pré-condição de vivacidade do contador); C6 (Complexity G vs. `Est: M` do epic reconciliada, nomeada); C7 (erro factual sobre `.single()` "lançar" corrigido no Context). AUTO-DECISÃO 1 (Telegram `source:'other'`) **confirmada pelo @po** — condição aplicada: AC10 agora afirma `metadata.receptor === "telegram"`. Dependência de `900-23` **confirmada pelo @po**, com ressalva de conflito textual em `admin-client-allowlist.json` registrada (ordem de merge: `#525 → #526 → 900-23 → 900-24`). |
| 2026-08-29 | @dev (Dex) | **Implementação (YOLO).** Branch nascida rebasada na da `900-23`. 3 resolvers + dual-run em `lib/tenancy/webhook-org.ts`; os 4 receptores fiados; migration `247` aplicada no `trifold-crm-dev` com **7/7** células de vivacidade conforme o esperado (e controle negativo: a forma v1, MySQL, devolve `42601` — a régua distingue). Tabela de mutações **executada**: as **11** ficaram VERMELHAS (prova por `sha256` do arquivo em disco, com a suíte exigida verde ANTES). O **alerta vinculante do @po** foi medido isoladamente: sob a mutação #8 a asserção **(1) reprova nos 4 receptores** e a **(2) permanece VERDE** — as duas estão implementadas, a (1) é o carrasco. Condição de GO cumprida: `[TEST-004]` aberto em `docs/backlog.md` com `Dona: 900-25`. **3 AUTO-DECISÕES registradas** nas Completion Notes, com destaque para duas: (a) o early-return de `access_token` nulo sugerido pela AC3 foi **recusado** — seria caminho novo de perda de dado em `legacy`/`both`, a mesma classe que a B1 recusou na `landing-page`; no lugar, os TIPOS ficaram honestos (`string | null`) sem mudar um byte de runtime; (b) `logOrgUnresolved` ganhou `webhookLogsExistenteId` porque a **Task 5.4 era insatisfazível** como estava (a mesma submissão ganhava DUAS linhas em `webhook_logs`; medido `expected 1, got 2` — a origem foi corrigida, não o teste). `[ARCH-001]` **não** foi fechado: anotado como "resolvido em código, aguardando produção", porque a AC7 exige a migration APLICADA. Validações: lint 0 errors · type-check verde · `pnpm test` 284 arquivos / 3646 testes / 0 falhas (**+66** novos). |
| 2026-08-29 | @dev (Dex) | **Gate `@qa`: CONCERNS, nenhum defeito vivo — 4 concerns fechadas, todas de régua ausente.** Ele mudou de tática (parou de mutar o helper, passou a mutar o **call site**) e achou **12 mutações verdes**. Rodei **13** (as dele + `webhookLogsSource` no `whatsapp`): **13/13 VERMELHAS** agora. **🟠 1 (PII, a mais séria):** a guarda era tautologia — o teste montava o `identificador` e conferia as chaves do próprio literal; PII de lead entrava verde nos 4 receptores, num log que grava com `org_id: null`. Fechada em 3 camadas: tipo fechado (`IdentificadorWebhook`, chave nova = erro de compilação — repõe a defesa perdida quando o tipo passou a aceitar `number`), filtro de **runtime** no helper (chave fora da allowlist não é gravada; só o NOME vai para `identificador_chaves_recusadas`, nunca o valor) e **um teste por receptor** com `toEqual` sobre o objeto EXATO que a rota passa. **🟠 2 (`await` do call site):** reusei o padrão da `900-23` — escrita que completa em **macrotask** + **contador de geração** contra a escrita órfã do teste anterior; asserção no RETORNO do handler, sem `flush()`. **🟡 3 e 4:** `webhookLogsExistenteId` e `webhookLogsSource` afirmados nos 4, dentro do mesmo `toEqual`. As 11 mutações da rodada anterior seguem **11/11 vermelhas** (a #5 abortou com `ALVO NÃO ENCONTRADO` após o refactor e voltou a acender com o alvo corrigido — a régua avisou em vez de passar verde). Alerta vinculante intacto: (1) VERMELHA nos 4, (2) VERDE nos 4. **Registrado o número que faltava** (medição do `@qa`): 946 `messages`/7d contra 2899 `system_events`/7d ⇒ o contador em `both` custa **~+30%** de escrita em `system_events` — aceitável e temporário (morre no cutover da Onda 3); se incomodar antes, o corte é amostragem, não remover o contador. Validações: lint **0 errors, 29 warnings = baseline de HEAD** · type-check verde · `pnpm test` 284 arquivos / 3656 testes / 0 falhas (**+76**). |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M) — @dev (Dex), modo YOLO, 2026-08-29.
Branch: `story/900-24-roteamento-webhook-identificador`, **nascida rebasada em
`story/900-23-foreachactiveorg-crons`** (`0762e260`), como o @po determinou por causa do conflito
textual em `docs/audits/admin-client-allowlist.json`.

### Debug Log References

**Remedições feitas ANTES de construir (não presumidas):**

| o que | comando | medido |
|---|---|---|
| teto de migration | `git fetch --prune origin` + varredura de todas as refs | **`246`** — `247` livre, confirmado |
| PR #526 (`246`) | `gh pr list` | **OPEN / CLEAN** — a `246` já está aplicada no `trifold-crm-dev` |
| colunas de `whatsapp_config` | `information_schema` do `trifold-crm-dev` | `access_token` **nullable**, `phone_number_id` **nullable**, `coexistence_enabled` NOT NULL |
| `.eq("config->>page_id")` | `pg_indexes` | índice `org_integrations_meta_page_ativo` existe sobre `(config->>'page_id')` |
| total da allowlist | contagem do JSON | **239 → 240** (`TOTAL_ESPERADO` do teste atualizado) |

**Task 7.1 — pré-condição da migration `247`** (read-only, `trifold-crm-dev`):
```
SELECT id, org_id, config FROM org_integrations
  WHERE provider='whatsapp' AND config::text ~* 'phone[^[:alnum:]]{0,2}number[^[:alnum:]]{0,2}id';
→ []   (0 linhas — a migration pode recriar o CHECK sem violar linha existente)
```

**Task 7.3 — as 7 células de vivacidade, cada uma em `BEGIN … ROLLBACK`, resultado REAL:**

| # | célula | esperado | **medido** |
|---|---|---|---|
| 1 | `{"phoneNumberId":…}` | `23514` | **`23514`** |
| 2 | `{"meta":{"phone_number_id":…}}` | `23514` | **`23514`** |
| 3 | `{"Phone-Number-Id":…}` (nova, B4) | `23514` | **`23514`** |
| 4 | controle `{"phone_number_id":…}` | `23514` | **`23514`** |
| 5 | controle `meta_ads` passa | sucesso | **sucesso** |
| 6 | controle `{"phone_number":…}` | sucesso | **sucesso** |
| 7 | FP nomeado `{"observacao":"… phone_number_id …"}` | `23514` | **`23514`** |

**7/7.** Controle negativo da própria régua (para "23514 em tudo" não ser indistinguível de "a
régua não mede"): rodei a forma **v1** (`UPDATE … WHERE provider='whatsapp' LIMIT 1`, sintaxe
MySQL) e ela devolve **`42601`** — a régua distingue sintaxe quebrada de violação de `CHECK`.
Rollback conferido depois: `org_integrations` segue com `whatsapp={}` e `meta_ads={"page_id":null}`.

**Task 7.4 — `pnpm gate:tenancy`:** `83 FAIL / 1 WARN`, **catraca OK, delta +0**, nenhuma violação
nova para `org_integrations`. (O gate reescreve `docs/audits/gate-tenancy-report.json` com
timestamp/`fonte` — efeito colateral conhecido, **revertido** com `git checkout`; não entra no diff.)

**Task 2.3 — ESLint:** `npx eslint src` em `packages/web` → **1214 arquivos analisados**,
**0 ocorrências** de `aios/no-unscoped-admin-client`, 0 errors. `pnpm lint --force`: **0 errors,
30 warnings** (as 30 são pré-existentes, nenhuma nos arquivos desta story).

**Task 10.5 — a tabela de mutações, resultado REAL (não previsto).** Cada mutação é aplicada **no
arquivo em disco**, com `sha256` antes/durante/depois e verificação de que o alvo sumiu (prova por
conteúdo, nunca por `git diff`); a suíte é exigida **VERDE antes** de qualquer mutação:

| # | mutação | medido |
|---|---|---|
| 1 | `resolveOrgByWhatsAppPhone` sem o filtro de telefone | **VERMELHO** |
| 2 | `resolveOrgByMetaPage` com `.maybeSingle()` no lugar do `.limit(2)` | **VERMELHO** |
| 3 | `resolveSoleOrg` sem o filtro `is_active` | **VERMELHO** |
| 4 | `decidirModoRoteamento()` hardcoded em `"legacy"` | **VERMELHO** |
| 5 | `logOrgUnresolved` sem `await` (mock em tick diferido) | **VERMELHO** |
| 6 | `quantidadeEncontrada` fixo em `1` (3 ocorrências) | **VERMELHO** |
| 7 | `resolveOrgByWhatsAppPhone` com `.maybeSingle()` puro | **VERMELHO** |
| **8a** | **whatsapp: em `both`, usar `novo` em vez do legado** | **VERMELHO** |
| **8b** | **meta_ads: idem** | **VERMELHO** |
| **8c** | **landing_page: idem** | **VERMELHO** |
| **8d** | **telegram: idem** | **VERMELHO** |

A mutação #6 só reprova com `replace_all`: o padrão aparece **3 vezes** e um `replace(…, 1)` teria
deixado a checagem "o alvo sumiu" falsa-negativa. Registrado porque é o modo de falha da régua, não
do código.

**O alerta vinculante do @po, medido isoladamente** (`vitest -t` por asserção; o `-t` é **regex**,
então `(1)` como filtro casava ZERO teste e devolvia exit 0 — falso VERDE. Corrigido para
substring sem metacaractere, com guarda que aborta se o filtro não casar nenhum teste):

| receptor | (1) sem mut | **(1) COM mut** | (2) sem mut | **(2) COM mut** |
|---|---|---|---|---|
| `whatsapp` | VERDE | **VERMELHO** | VERDE | **VERDE** |
| `meta_ads` | VERDE | **VERMELHO** | VERDE | **VERDE** |
| `landing_page` | VERDE | **VERMELHO** | VERDE | **VERDE** |
| `telegram` | VERDE | **VERMELHO** | VERDE | **VERDE** |

Confirma o que o @po mediu: **a asserção (1) é o único carrasco**; a (2) permanece verde sob a
mutação. As duas estão implementadas, nos 4 receptores.

**Gate `@qa` (CONCERNS, nenhum defeito vivo) — as 4 concerns, fechadas com carrasco.** Ele mudou
de tática: parou de mutar o HELPER e passou a mutar o CALL SITE. **12 mutações verdes** — código
certo nos 4 pontos, réguas ausentes. Rodei as 13 (as 12 dele + `webhookLogsSource` no `whatsapp`,
que a concern 4 implicava), mesma disciplina de `sha256` em disco:

| concern | mutação de call site | antes | **agora** |
|---|---|---|---|
| 🟠 1 PII | `+telefone_do_lead` (whatsapp) | VERDE | **VERMELHO** |
| 🟠 1 PII | `+email_do_lead` (meta_ads) | VERDE | **VERMELHO** |
| 🟠 1 PII | `+nome_do_lead` (landing_page) | VERDE | **VERMELHO** |
| 🟠 1 PII | `+chat_id` (telegram) | VERDE | **VERMELHO** |
| 🟠 2 await | `await` → `void` (whatsapp) | VERDE | **VERMELHO** |
| 🟠 2 await | `await` → `void` (meta_ads) | VERDE | **VERMELHO** |
| 🟠 2 await | `await` → `void` (landing_page) | VERDE | **VERMELHO** |
| 🟠 2 await | `await` → `void` (telegram) | VERDE | **VERMELHO** |
| 🟡 3 | sem `webhookLogsExistenteId` (meta_ads) | VERDE | **VERMELHO** |
| 🟡 3 | sem `webhookLogsExistenteId` (landing_page) | VERMELHO | **VERMELHO** |
| 🟡 4 | `webhookLogsSource` → `"other"` (whatsapp) | VERDE | **VERMELHO** |
| 🟡 4 | `webhookLogsSource` → `"other"` (meta_ads) | VERDE | **VERMELHO** |
| 🟡 4 | `webhookLogsSource` → `"other"` (landing_page) | VERDE | **VERMELHO** |

**13/13.** As 11 mutações da rodada anterior seguem **11/11 VERMELHAS** (re-rodadas depois do
refactor — a #5 acusou `ALVO NÃO ENCONTRADO` e abortou, porque o alvo textual mudou; corrigido o
alvo, voltou a acender. A régua avisou em vez de passar verde, que é o comportamento certo). O
alerta vinculante segue valendo: asserção (1) VERMELHA nos 4, (2) VERDE nos 4.

**Volume de escrita — o número que ninguém tinha (medição do `@qa`, registrada aqui).** O
invariante prova que a Trifold não muda de **decisão**; o que ele não cobre é que a **escrita**
muda. Medido por ele: **946 `messages` / 7d** contra **2899 `system_events` / 7d** — o
`WEBHOOK_ORG_RESOLVED`, um por webhook recebido em `both`, representa **~+30%** de volume em
`system_events`. Aceitável (é o contador que a Onda 3 precisa para decidir o cutover, e ele morre
no cutover), mas é custo, não zero. Se incomodar antes disso, o corte natural é amostragem no
`logOrgResolved` — não remover o contador.

**Task 8.1 — varredura escopada, classificação de TODAS as 40 ocorrências de código** (comentários
excluídos), por tabela e filtros:

| arquivo | resolução de ORG | existência de linha (fora do escopo) |
|---|---|---|
| `webhook/whatsapp/route.ts` | **1** — `whatsapp_config` só com `.eq("status")` = `legacyResolveActiveConfig` | 17 (dedup por `wamid`, `conversations` por `id`, `campaign_entries` por `org_id+phone`, `meta_*` por `org_id+id`, `leads` por `org_id+phone_normalized`, `kanban_stages` por `org_id+is_default`, 3 `upsert().select().single()` — estruturalmente 1 linha) |
| `lib/meta/process-lead.ts` | **1** — `legacyResolveActiveOrgId` | 9 |
| `webhooks/landing-page/route.ts` | **1** — `legacyResolveOrgId` | 5 |
| `telegram/webhook/route.ts` | **1** — `legacyResolveFirstOrg` | 5 |

As 4 remanescentes de resolução de org são **exatamente** as 4 funções `legacy*` extraídas, agora
isoladas atrás do dual-run. Nenhuma outra sobreviveu. As 8 ocorrências com filtro vazio foram
LIDAS (não só contadas): todas são `.insert()/.upsert().select().single()` devolvendo a linha
recém-escrita — 1 linha por construção.

**Baseline de produção (LEITURA APENAS, pré-deploy)** — as duas primeiras consultas da AC9 já
rodadas, para o `@devops` ter o "antes" ao repetir depois:
```
SELECT count(*) FROM organizations WHERE is_active = true;                → 1
SELECT (SELECT org_id FROM whatsapp_config WHERE status='active' LIMIT 1)
     = (SELECT id FROM organizations WHERE is_active = true LIMIT 1);     → true
SELECT status, access_token IS NULL, phone_number_id IS NULL, count(*)
  FROM whatsapp_config GROUP BY 1,2,3;    → active | false | false | 1
```
A equivalência de predicado (a consulta que o @po acrescentou em B1) **vale em produção hoje**, e a
única config ativa **tem** token e `phone_number_id` — os dois fatos que sustentam "byte a byte".

**Validações finais:** `pnpm lint --force` 0 errors · `pnpm type-check --force` **verde** ·
`npx tsc -p <tsconfig de scripts/>` — 38 erros, **todos pré-existentes** de resolução de módulo
(o ponto cego `MNT-001` já registrado no backlog), **0 no arquivo que esta story alterou**
(`scripts/admin-client-allowlist.test.ts`) · `pnpm test` **284 arquivos, 3646 testes, 0 falhas**
(**76** testes novos: 46 em `webhook-org.test.ts`, 8 em `telegram/webhook/route.test.ts`,
+7 whatsapp, +6 process-lead, +8 landing-page, +1 allowlist). Warnings de ESLint: **29 → 29**,
idêntico ao baseline de `HEAD` — zero novos.

### Completion Notes

**Decisões que a story deixou em aberto para o @dev — registradas com a razão:**

1. **[AUTO-DECISÃO] `access_token` nullable (C2 / AC3): NÃO usei o early-return sugerido.**
   A AC3 propunha `if (!config.access_token)` cedo, com o mesmo tratamento de "não resolvido".
   **Recusei, e a razão é a própria regra que a AC5/B1 estabeleceu nesta story:** um early-return
   ali seria um caminho NOVO de perda de dado em `legacy`/`both` — hoje, com token nulo, a mensagem
   inbound **é gravada** (lead + `messages`) e só as chamadas à Graph API falham com 401, que
   `alertCredencialMorta` já trata; com o guard, a mensagem deixaria de ser gravada e o webhook
   devolveria 200. É a mesma forma do incidente que a B1 recusou reabrir na `landing-page`.
   **O que fiz no lugar:** deixei o VALOR fluir exatamente como hoje e tornei os TIPOS honestos —
   `WhatsAppConfigLinha` declara `string | null` (como a coluna é), e os dois consumidores tipados
   (`lib/relacionamento/route-inbound.ts`, `lib/ai/send-library-media.ts`) passaram a aceitar
   `string | null` nos campos que só usam em template literal. Zero mudança de runtime, 4 linhas de
   tipo, e a nullability deixa de ser mentira em toda a cadeia. No terceiro consumidor
   (`sendWhatsAppTypingIndicator`) usei um `? :` no call site — porque o helper **já** trata falsy
   por dentro (`send-typing-indicator.ts:30`), então o `? :` reproduz o runtime de hoje literalmente.
   Medido antes de decidir: em **produção**, a única config `active` tem `access_token` e
   `phone_number_id` NÃO nulos — o estado é inalcançável hoje, o que torna a escolha barata; mas a
   direção certa continua sendo "não criar caminho de perda", não "o estado não acontece".
   Contagem de call sites de `config.access_token`: **11 → 11 preservados** (as 11 linhas originais,
   byte a byte) **+2** vindas do `? :` acima, no mesmo call site que já existia.

2. **[AUTO-DECISÃO] `logOrgUnresolved` ganhou `webhookLogsExistenteId` — a Task 5.4 era
   insatisfazível como estava.** A Task 5.4 exige confirmar que o `webhook_logs` já inserido em
   `landing-page:97-107` é REAPROVEITADO, "não duplicar a linha". Mas o `logOrgUnresolved` da AC2
   sempre **insere** a sua própria linha — então, rodando, a mesma submissão passava a ter DUAS
   linhas em `webhook_logs`, e o teste da Task 5.4 acendeu vermelho na primeira execução (medido:
   `expected 1, got 2`). **Não afrouxei o teste: corrigi a origem.** O parâmetro é opcional e
   explícito: com id, a linha do chamador é atualizada (`processing_error`); sem id
   (`whatsapp`/`telegram`, que não gravam nada hoje), a linha nasce ali, como a AC2 escreveu.
   `landing-page` e `meta_ads` passam o seu. Em `meta_ads` isso é deliberado e comentado: o
   `fail()` logo abaixo sobrescreve o `processing_error` com a mensagem legada — que é a que o cron
   `meta-leads-retry` lê, e o contrato dele não muda. **Dois testes novos** cobrem os dois ramos.

3. **[AUTO-DECISÃO] Onde moram os 4 testes da mutação #8.** A AC10 nomeia
   `webhook-org.test.ts`, mas a asserção (1) exige observar **o `orgId` que chega ao
   processamento** — só visível na suíte que tem o fake da rota. Coloquei cada teste na suíte que
   já é dona daquele receptor (e criei `app/api/telegram/webhook/route.test.ts`, que não existia).
   `webhook-org.test.ts` mantém tudo o que é unitário e aponta para os 4 no cabeçalho.
   A divergência é **forçada** plantando o resolver novo (`vi.mock` com `importOriginal`, delegando
   ao real por padrão para não mudar nenhum teste existente) em `org-B`, enquanto o fake do banco
   mantém `org-1` como resposta do legado.

**Sobre o fake (`__fixtures__/fake-supabase-postgrest.ts`) — o que ele faz além do que a AC pedia:**
além da regra 3 corrigida (`resultadoSingular` com `data` E `error.code`, para `.single()` e
`.maybeSingle()`), ele **projeta as colunas do `.select()`** — a lição das 5 fakes cegas da
`900-23`, que deixavam passar "tirei a coluna do select" — e registra as escritas **no momento em
que a promise RESOLVE**, não na chamada de `.insert()`. Essa segunda parte não é detalhe: na
primeira versão eu registrava na chamada, e a mutação #5 passou **VERDE**; foi preciso mover o
registro para a resolução para o `tickDiferido` virar carrasco de verdade.

**O que o gate do `@qa` mudou no código (4 concerns, nenhuma delas defeito vivo):**
- **Concern 1 (a mais séria) — a guarda de PII era tautologia.** O teste montava o `identificador`
  e conferia as chaves do próprio literal; acrescentar PII de lead aos 4 call sites ficava verde.
  Fechada em **três** camadas: (i) o tipo `IdentificadorWebhook` é
  `Partial<Record<ChaveIdentificador, …>>` — chave nova é erro de compilação, e `type-check` é
  gate (isto repõe a defesa que se perdeu quando o tipo passou a aceitar `number`); (ii) filtro de
  **runtime** no helper, para o que o tipo não cobre (`as any`, JSON, chamador em JS): chave fora
  da allowlist não é gravada e só o NOME dela vai para `identificador_chaves_recusadas` — nunca o
  valor, que é o que pode ser PII; (iii) o carrasco de verdade, **um teste por receptor** que
  afirma com `toEqual` o objeto EXATO que a rota passa, mais asserção de que nada do lead aparece
  no evento serializado.
- **Concern 2 — o `await` do CALL SITE não tinha carrasco.** A mutação #5 media o `await` INTERNO
  do helper (real: `logEventOnce`→`logEvent` acende 19 falhas), mas trocar `await` por `void` nos
  4 call sites ficava verde, porque o mock do logger resolvia no mesmo tick. Reusei o padrão que a
  `900-23` já tinha para isto: escrita que completa em **macrotask** + **contador de geração** (a
  escrita órfã do teste anterior cairia no array do teste seguinte e ele passaria por acidente —
  foi assim que a mutação M1 da 87-6 ficou verde na primeira rodada). A asserção roda no RETORNO
  do handler, sem `flush()`.
- **Concerns 3 e 4** — `webhookLogsExistenteId` e `webhookLogsSource` passaram a ser afirmados nos
  4 receptores, dentro do mesmo `toEqual` da concern 1 (um lugar só, sem asserção solta).

**Condição de GO do @po — cumprida.** `docs/backlog.md` ganhou **`[TEST-004]`** com
**`Dona: 900-25`** (escolhida por critério: é a story que constrói a camada de teste de duas orgs,
epic §857, `Dep: 900-22, 900-24` — a primeira que vai exercitar esses fakes com mais de uma linha
por tabela), as duas localizações (`admin-invite.test.ts:108,113` e
`resend-admin-invite/route.test.ts:80`), a medição (`postgrest-js@2.101.1`, `dist/index.cjs:129-140`,
`PGRST116`/406), a razão de serem latentes hoje e o encaminhamento (migrar para `__fixtures__/`).

**`[ARCH-001]` NÃO foi fechado.** Está anotado como *"resolvido em código, aguardando produção"* —
a AC7 é explícita: fecha quando a `247` for **aplicada em produção**, não quando for mergeada.
Fechá-lo agora seria dizer que a garantia existe onde ela ainda não existe.

**Divergências entre a story e o código, medidas:**
- A AC3 cita as chamadas de `access_token` em `:726 … :1281` como "~8"; são **11** no arquivo.
  Não muda nada da decisão, mas o número da story está baixo.
- A AC7 fala em "5 células" no texto de B3 e lista **7** no bloco SQL (as 2 novas de B4). Rodei as
  **7**; a contagem certa é 7, e a Task 7.3 já diz 7.
- A AC5 descreve o `identificador` do log como *"sem chave `identificador`, ou com valor vazio"*;
  usei `{ quantidade_organizacoes_ativas: N }`, que é a outra alternativa que a própria AC oferece
  na frase anterior. Isso obrigou o tipo de `identificador` a aceitar `number` além de
  `string | null` — a AC2 escrevia `Record<string, string | null>`.

**O que NÃO pôde ser medido nesta fatia (e por quê):**
- **As 6 consultas da AC9 (Camada 2)** são pós-deploy, 24h de tráfego real — Task 9.3, do
  `@devops`. As **duas primeiras** eu rodei agora em produção (leitura apenas) como baseline; as
  outras quatro dependem de `WEBHOOK_ORG_RESOLVED` existir, o que só acontece depois do deploy.
- **Prova sobre o dado da Trifold em banco de teste:** impossível — o `trifold-crm-dev` **não tem**
  a org da Trifold (só `Org de Teste — Epic 900`). Por isso a perna "não muda de comportamento" é
  provada por **invariante** (mutação #8, pré-deploy) e não por observação.
- **Camada B** (duas orgs reais contra o `trifold-crm-dev`): fora do escopo por instrução do dono
  do produto — Passo 6, story `900-25`.
- **CodeRabbit CLI:** não executado. O gatilho real deste repo é o GitHub App no PR
  (`.claude/rules/coderabbit-integration.md`), e a config de agente assume WSL.
- **Migration `247` em produção:** não aplicada — Task 7.5, runbook do `@devops`. Produção foi
  tocada **somente em leitura** nesta sessão.

### File List

**Criados (4)**
- `packages/web/src/lib/tenancy/webhook-org.ts` — 3 resolvers + dual-run compartilhado (AC1, AC2)
- `packages/web/src/lib/tenancy/__fixtures__/fake-supabase-postgrest.ts` — fake fiel ao postgrest-js (Task 10.1)
- `packages/web/src/lib/tenancy/webhook-org.test.ts` — 46 testes (AC10 + filtro de runtime da concern 1)
- `packages/web/src/app/api/telegram/webhook/route.test.ts` — 8 testes, suíte inexistente antes (AC6, AC10)
- `supabase/migrations/247_org_integrations_check_whatsapp_grafias.sql` — fecha `ARCH-001` (AC7)

**Modificados (9)**
- `packages/web/src/app/api/webhook/whatsapp/route.ts` — `legacyResolveActiveConfig` + dual-run (AC3)
- `packages/web/src/lib/meta/process-lead.ts` — `legacyResolveActiveOrgId` + dual-run (AC4)
- `packages/web/src/app/api/webhooks/landing-page/route.ts` — `legacyResolveOrgId` + dual-run com exceção HTTP (AC5)
- `packages/web/src/app/api/telegram/webhook/route.ts` — `legacyResolveFirstOrg` + dual-run (AC6)
- `packages/web/src/lib/relacionamento/route-inbound.ts` — tipo `waConfig` nullable (C2, só tipo)
- `packages/web/src/lib/ai/send-library-media.ts` — tipos `phoneNumberId`/`accessToken` nullable (C2, só tipo)
- `docs/audits/admin-client-allowlist.json` — `webhook-org.ts` em `legitimos` (Task 2.2)
- `scripts/admin-client-allowlist.test.ts` — `TOTAL_ESPERADO` 239→240 + asserção nominal da AC2
- `docs/backlog.md` — `[TEST-004]` novo (condição do @po) + `[ARCH-001]` anotado
- `packages/web/src/app/api/webhook/whatsapp/__tests__/route.test.ts` — +5 testes (mutação #8)
- `packages/web/src/lib/meta/process-lead.test.ts` — +4 testes (mutação #8)
- `packages/web/src/app/api/webhooks/landing-page/route.test.ts` — +6 testes (AC5 / Task 5.5 / mutação #8)

---

## QA Results

**Gate: CONCERNS** · Quinn (Test Architect) · 2026-08-30 · árvore sobre `0762e260` (sem commit)
Arquivo: `docs/qa/gates/900.24-roteamento-de-webhook-por-identificador.yml`

### O que eu reproduzi do zero (não aceitei relatado)

| alegação | como medi | resultado |
|---|---|---|
| migration `247` — 7 células | Management API contra `trifold-crm-dev`, `BEGIN…ROLLBACK` | **7/7** conforme |
| controle negativo da régua | forma v1 (sintaxe MySQL) | **42601** — a régua discrimina |
| a constraint aplicada | `pg_get_constraintdef` (objeto VIVO, não o arquivo) | idêntica ao `.sql` |
| pré-condição da `247` | `~*` sobre `config::text` | **0 linhas** |
| mutação #8, 4 receptores | mutação em disco + sha256 + guarda de filtro vazio | **(1) VERMELHA 4/4, (2) VERDE 4/4** |
| varredura da AC8 | extração automática por arquivo | **40** de código, 1 de org por arquivo |
| `access_token` 11 → 11 + 2 | `diff` do texto das linhas HEAD × worktree | exato |
| suíte | `npx vitest run` | **284 arq. / 3646 testes**, 0 falhas |
| eslint | `npx eslint src` em `packages/web` | **1214 arq. / 0** ocorrências |
| `gate:tenancy` | rodado e **restaurado** (sha256) | 83 FAIL, **delta +0**, fora do diff |
| baseline de produção | leitura apenas | 1 org ativa, predicados equivalentes, 0 `WEBHOOK_ORG_*` |
| filtro `config->>page_id` | PostgREST real + controle positivo (400/42703) | válido, não ignorado |

O 9º instrumento cego confere: `vitest -t` com filtro que não casa nada sai **exit 0** ("44
skipped"). Confirmei com controle próprio e construí minha própria guarda antes de medir.

### O décimo instrumento cego — e ele veio com três irmãos

Parei de mutar o helper e passei a mutar o **call site**. **12 mutações ficaram VERDES**, em 4
classes. Nenhuma é defeito hoje — o código está correto nos 4 pontos. São carrascos ausentes.

1. **QA-900-24-1 (medium) — a guarda de PII é uma tautologia.** O teste monta o `identificador`
   ele mesmo e afirma que as chaves do próprio literal estão na allowlist. Acrescentei PII de lead
   ao `identificador` nos **4** receptores (`telefone_do_lead`, `texto_da_mensagem`, `chat_id`,
   `email_do_lead`, `nome_do_lead`): **VERDE nos 4**. A AC10 e o docblock de `logOrgUnresolved`
   afirmam que "acrescentar uma chave nova exige passar por um teste vermelho" — **não exige**. E é
   o log que grava com `org_id: null`.
2. **QA-900-24-2 (medium) — `await logOrgUnresolved(...)` no call site não tem carrasco.** A mutação
   #5 é real (trocar `logEventOnce` por `logEvent` no helper acende **19 falhas**), mas mede o
   `await` INTERNO. Troquei `await` por `void` nos 4 call sites: **VERDE nos 4** — o mock de logger
   das suítes de rota é síncrono, e mock síncrono nunca prova `await`. É a camada em que a lambda
   congela (87-6).
3. **QA-900-24-3 (low) — `webhookLogsExistenteId` guardado só no `landing-page`.** Removê-lo lá:
   **VERMELHO**. Removê-lo no `meta_ads`: **VERDE**. A duplicata do "expected 1, got 2" volta em
   silêncio num dos dois receptores que usam o parâmetro.
4. **QA-900-24-4 (low) — `webhookLogsSource` guardado só no `telegram`** (o único que a AC nomeou).
   Trocar por `"other"` nos outros 3: **VERDE**.

### Julgamentos pedidos

- **Recusa da AC3/C2: CORRETA, e a neutralidade está provada.** A AC3 delegou a decisão; o
  argumento é o mesmo que a B1 estabeleceu (não criar caminho novo de perda); e eu medi: as 11
  linhas de `config.access_token` idênticas byte a byte, +2 do `? :`, que reproduz o runtime porque
  `send-typing-indicator.ts:30` já retorna cedo com campo falsy.
- **Task 5.4: conserta a FONTE.** Diante de um vermelho real, ele não afrouxou o teste — deu ao
  helper um parâmetro opcional explícito, com os dois ramos testados. (Ressalva: régua em 1 dos 2
  receptores — QA-900-24-3. E em `meta_ads` o `UPDATE` é sobrescrito pelo `fail()` logo abaixo,
  por desenho e comentado: lá quem carrega o sinal é o `system_events`.)
- **Os 4 testes nas suítes dos receptores: correto e necessário.** A asserção (1) observa o
  `org_id` que chega ao processamento, que só existe na suíte com a rota. **Nenhum é colinear:**
  cada mutação derrubou exatamente 1 teste, no arquivo do seu receptor.
- **As três divergências:** (a) "~8" vs **11** — a AC já se contradizia (diz ~8 e lista 10 linhas);
  o @dev está certo. (b) "5 células" vs **7** — prosa atrasada em relação ao B4; resolver a favor
  do SQL é o certo, e rodei as 7. (c) `number` no `identificador` — resolução certa de uma
  contradição entre AC2 e AC5 (serializar N como string seria pior para a query de corte da Onda
  3), com o custo de que o tipo deixa de barrar identificador numérico; como a guarda de shape já
  é cega, some a última linha de defesa. Reforça a QA-900-24-1.
- **A garantia sobre a Trifold por invariante: BASTA, e é a forma certa.** A prova certa para
  "dado que não existe no banco de teste" não é observar mais — é escolher uma prova que não
  dependa do dado. A mutação #8 afirma que em `both` quem chega ao processamento é o legado,
  qualquer que seja a org, e é carrasco medido em 4/4. O que ela **não** cobre e eu medi: a
  ESCRITA muda, mesmo com a resposta idêntica — produção ganha 1 INSERT em `system_events` por
  webhook resolvido. Dimensionei: 946 `messages`/7d contra 2899 `system_events`/7d, e a resolução
  fica depois do early-return dos payloads sem `messages[]` — ~+30% de escrita, aceitável, mas era
  um número que ninguém tinha.

### Extra medido (não é concern)

O `CHECK` da `247` fecha as 6 grafias do @po, mais aninhamento em array e ocorrência em VALOR.
**Evadem `phone___number___id` e `phone - _ number id`** (3+ separadores, fora do `{0,2}`) — está
declarado no `COMMENT` e fora do modelo de ameaça nomeado. Registro para não virar surpresa na
`900-47`.

### Veredicto

**CONCERNS.** Nenhum defeito vivo; o bug agudo está fechado e a prova é real. As 4 concerns são
carrascos ausentes — a 1 e a 2 valem o conserto antes do merge, porque a story **afirma** garantias
que a suíte não sustenta. Não commitei, não empurrei; produção foi tocada somente em leitura.
