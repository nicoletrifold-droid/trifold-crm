# Story 900-23 — `forEachActiveOrg` + Crons Travados/Defeituosos Corrigidos (Onda 2, Fatia 2)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 2 — "Para de errar" (plano de 3 ondas aprovado pelo dono do produto). Esta story cobre
  **só os Passos 2 e 5** do plano da Onda 2 (`forEachActiveOrg` + correção dos crons travados/
  defeituosos + isolamento de erro nos que já iteram à mão). Os Passos 4 (resolução de org nos
  webhooks) e 6 (camadas A/B de teste de duas orgs) são stories seguintes — **não entram aqui**,
  por instrução explícita do dono do produto.
- **Story:** 900-23 — ver seção "Numeração" abaixo. **Corrige uma referência já commitada
  incorretamente no repositório** (ver achado abaixo).
- **Status:** **Ready for Review** — implementada pelo @dev em 2026-08-29 (ver Dev Agent Record).
  Revalidada pelo @po em 2026-08-29 (**GO, 8,5/10**): as 10
  correções C1-C10 foram aplicadas e cada carrasco foi verificado *rodando*, não lido. O @po
  acrescentou a **AC10** (o `trifoldOrgId()` como exceção nomeada: casa em `lib/tenancy/`,
  cabeçalho de exceção com sucessor nomeado, catraca do literal e desacoplamento de
  `DAILY_REPORT_ORG_ID`) e aplicou a R10 no próprio épico. Ver
  `docs/qa/po-validation-900-23.md`.
- **Priority:** P0 — bloqueia o Passo 4 (900-24, já reservado no epic) e o Passo 6. Sem
  `forEachActiveOrg` e sem os crons defeituosos corrigidos, a Onda 2 não tem como provar
  "duas orgs reais, comportamento correto" — os três crons defeituosos processariam só a
  primeira org encontrada, silenciosamente, exatamente o defeito que a Onda 2 existe para fechar.
- **Complexity:** G — 1 helper novo com 5 propriedades testadas por mutação, 2 crons migrados para
  o helper, 1 reclassificado (não migra), 3 crons com correção de código bespoke (sem o helper),
  6 crons ganhando só isolamento de erro, e a manutenção da allowlist que decorre de tudo isso.
  Zero migration nova (schema já entregue pela `900-21b`/migration `246`) — mas **uma dependência
  de ordem de deploy em produção**, ver Metadata "Depends on".
- **Depends on:**
  1. `900-21b` mergeada em `main` (entrega `org_integrations`, migration `246`) — **obrigatório**
     para a AC5 (correção do `meta-capi-dispatch`), que lê `org_integrations` para resolver o
     `dataset_id` por org. Medido em 2026-08-29: `900-21b` está em `Ready for Review` (PR #526,
     `mergeable: MERGEABLE`, checks verdes), ainda não mergeada. **Reconfirmar o status do PR #526
     no dia da implementação** — mesma lição de `feedback_remedir_numeros_contra_o_banco`.
  2. **Migration `246` aplicada em PRODUÇÃO antes (ou no mesmo deploy) do código da AC5.** A
     Task 2.6 da `900-21b` ("aplicar em produção") é do `@devops` e estava **pendente** no momento
     em que esta story foi rascunhada. Se o código desta story (que faz `SELECT ... FROM
     org_integrations`) for para produção antes da tabela existir lá, o `meta-capi-dispatch` de
     produção — que hoje funciona — passa a falhar ao resolver o dataset. Isso violaria a
     restrição central do dono do produto ("produção não muda de comportamento"). Ver AC5 e AC9
     para como isso é coberto (código defensivo + ordem de deploy declarada).
- **Created:** 2026-08-29
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex) — todo o conteúdo é TypeScript de aplicação (rotas de cron + um helper
  novo em `lib/tenancy/`). Não há DDL nesta story.
- **Quality Gate:** @architect (Aria) — mesmo padrão da `900-21b` (a matriz de ownership do epic
  atribui `900-23` a `@dev`, e o gate de arquitetura é quem valida um mecanismo compartilhado novo
  como `forEachActiveOrg`).
- **Quality Gate Tools:** `[code_review, migration_review]` — `migration_review` mantido só para
  conferir que **nenhuma** migration nova foi introduzida fora do escopo (regra R9 do gate de
  tenancy, "uma migration por story", não se aplica aqui porque são zero).

---

## Numeração — por que `900-23`, e a referência errada que já está no repositório

**1. `900-23` é o número que o próprio epic reserva para este conteúdo.** A seção
`docs/stories/epics/epic-900-saas-multi-tenant.md:838-845` já define `900-23` como
*"37 crons iteram orgs (`forEachActiveOrg`) — fim do `DEFAULT_ORG_ID`"*, com AC quase idêntica ao
Passo 2 do plano aprovado (`forEachActiveOrg(fn)` em `lib/tenancy/guard.ts` — nome de arquivo que
esta story corrige, ver Dev Notes —, isolamento de erro, log por org). **A contagem "37 crons
migrados" do epic é a que o plano aprovado corrige** (medido: só 2 migram de fato pelo helper —
`daily-report`, `nicole-agenda-reconcile` —, 1 reclassifica sem migrar — `nicole-health` —, 3 têm
correção bespoke sem o helper, 19 ficam como estão ganhando só isolamento de erro, **12** são
cross-org de plataforma permanente (a seção `plataforma` da allowlist tem 16 *entradas*, mas 4
delas não são crons — 1 `.test.ts` irmão de `billing-monthly-summary` e 3 libs de definição —,
então **12 implementações de cron**, correção C1 do @po), 3 são órfãos não agendados). A partição
inteira fecha **exatamente** em 40 (os 40 diretórios reais de `packages/web/src/app/api/cron/`):
`2 + 1 + 3 + 19 + 12 + 3 = 40`, sem sobra nem falta — o @po mediu essa soma como o sinal mais forte
de que a re-triagem da `900-21b` continua viva. Diferente do padrão `900-21b`
(onde o número do epic — `900-16` — já tinha dono e conteúdo **diferentes**, uma dívida P1 já
registrada no backlog), aqui `900-23` está **livre e é o mesmo assunto** — não há colisão, não há
motivo para sufixo de letra.

**2. Achado: a `docs/audits/admin-client-allowlist.json`, já commitada pela `900-21b` (nesta
mesma branch), referencia DOIS números diferentes para o conteúdo desta story — e um deles está
errado.** **Corrigido pelo @po (C1) — a contagem abaixo é a remedida contra `e8ea5433`, não a
estimativa da v1 deste draft (que dizia 9 e não tinha rodado o comando de verdade):**
```bash
$ python3 -c "
import json
d = json.load(open('docs/audits/admin-client-allowlist.json'))
alvos = [k for k, v in d['alvos-onda-2'].items() if '900-20' in v['motivo']]
print('itera-orgs cita 900-23:', sum('900-23' in v for v in d['itera-orgs'].values()))
print('alvos-onda-2 cita 900-20:', len(alvos))
for k in alvos: print(' -', k)
"
itera-orgs cita 900-23: 19
alvos-onda-2 cita 900-20: 6
 - src/app/api/cron/daily-report/route.ts
 - src/app/api/cron/nicole-agenda-reconcile/route.ts
 - src/app/api/cron/nicole-health/route.ts
 - src/app/api/cron/meta-ads-intelligence/route.ts
 - src/app/api/cron/meta-capi-dispatch/route.ts
 - src/app/api/cron/followup/route.ts
```
São **6**, não 9: os 3 arquivos `.test.ts` irmãos (`daily-report/route.test.ts`,
`nicole-agenda-reconcile/route.test.ts`, `meta-capi-dispatch/route.test.ts`) **não citam**
`900-20` no próprio motivo — só os `.ts` de implementação citam. As 19 entradas de `itera-orgs`
(Passo 2) já citam corretamente `"Passo 2 da Onda 2, 900-23"`. Os 6 acima citam **`900-20`** —
que é o número **real, já reservado pelo epic para outro conteúdo inteiramente diferente**
(`docs/stories/epics/epic-900-saas-multi-tenant.md:798`: *"Resolver de stage/imóvel + dual-run +
cutover + contract (14 arquivos)"*, dependente de `900-19`, sem nenhuma relação com crons). A
origem do erro está rastreada: o `@dev` da `900-21b` escreveu no Dev Notes daquela story,
especulativamente, *"Passo 5 = correção dos defeituosos, provavelmente 900-20"* — um palpite que
entrou no JSON committed sem checar se `900-20` já tinha dono. **Reusar `900-20` aqui repetiria
exatamente o erro que a numeração da `900-21b` evitou para `900-16`.**

**[AUTO-DECISÃO, confirmada pelo @po — Decisão 1 do parecer]** Esta story corrige as **6**
referências erradas para `900-23` como parte da Task 1/AC8 — ficam consistentes com as 19 que já
estavam certas. **Corrigir AQUI, não reabrir o PR #526** (três razões do @po, todas medidas):
(1) a Task 8 desta story reescreve essas mesmas entradas de qualquer forma, porque elas mudam de
seção (`alvos-onda-2` → `itera-orgs`/`plataforma`) — corrigir no #526 garantiria conflito de merge
nas mesmas linhas, em troca de nada; (2) o #526 já carrega `admin-client-allowlist.json` +
`allowlist-lint.ts` + `admin-client-allowlist.test.ts` + o épico (`gh pr view 526 --json files`) —
reabrir para trocar 6 strings de prosa custaria re-rodar o gate inteiro de um PR com migration;
(3) **corrigir lá apaga o registro** — o valor não é o número certo, é a *classe* (um palpite
hedgeado em Dev Notes atravessando para um artefato de governança commitado sem checagem de
colisão). Essa classe só sobrevive se a correção for visível, com dono e data — mesmo critério que
o épico já usa para a dívida da `900-16`.

**Condições da decisão, obrigatórias (não cosméticas):**
1. A contagem correta na AC8.1 é **6**, com a lista de arquivos colada (não "9" nem um número
   solto) — ver AC8.1.
2. **A `900-21b` ganha uma linha de Change Log** reconhecendo que o artefato subiu com a
   referência errada e apontando esta story como a correção (Task 8.0a) — senão o registro
   existe só do lado que conserta, e quem ler a `900-21b` no futuro não fica sabendo.
3. **A correção 8.1 sai em commit próprio**, antes das mudanças de seção da Task 8 (que movem
   `nicole-health`/`meta-ads-intelligence`/`meta-capi-dispatch`/`followup` de `alvos-onda-2` para
   `plataforma`/`itera-orgs`) — para o diff mostrar a troca de número separada da re-triagem.

**Por que esta story não propõe catraca automática contra esse tipo de erro (confirmado pelo
@po, com o motivo medido):** nenhum `grep` sobre este JSON pegaria o defeito — os dois números
(`900-20`, `900-23`) são válidos e reservados pelo próprio epic; o que estava errado era a **posse
semântica**, que grep não enxerga. E a regra óbvia ("todo número de story citado precisa ter
arquivo de story correspondente") reprovaria em falso `900-21`, `900-24` e `900-42a` — todas
referências legítimas *para frente*, sem arquivo ainda. Catraca falsa é pior que nenhuma.

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** um mecanismo compartilhado (`forEachActiveOrg`) que isole erro por organização e o
aplique aos 2 crons hoje travados numa única org, **mais** a correção de código dos 3 crons cujo
resultado está errado hoje mesmo com uma org só sendo processada com sucesso reportado
incorretamente, **mais** isolamento de erro básico nos 6 arquivos que já iteram orgs corretamente
mas abortam tudo no primeiro erro,
**Para que** a próxima story da Onda 2 (resolução de org nos webhooks, `900-24`) tenha um conjunto
de crons multi-tenant-corretos para se apoiar, e a Onda 2 consiga provar "duas orgs reais,
comportamento correto" sem depender de crons que hoje mentem sobre o próprio sucesso.

---

## Context

A `docs/audits/admin-client-allowlist.json`, re-triada pela `900-21b`, mede com precisão os 12
alvos originais do Passo 5 (9 rotas + 3 pares de teste). Esta story consome essa allowlist como
insumo — cada entrada de `alvos-onda-2` (exceto os 3 órfãos, fora de escopo aqui) tem um
`arquivo:linha` medido que é o ponto de partida da correção:

| Arquivo | Classe | Ação nesta story |
|---|---|---|
| `daily-report/route.ts` | travado (`DEFAULT_ORG_ID`) | **migra** para `forEachActiveOrg` |
| `nicole-agenda-reconcile/route.ts` | travado (`DEFAULT_ORG_ID`) | **migra** para `forEachActiveOrg` |
| `nicole-health/route.ts` | travado, mas vigia de plataforma | **reclassifica** — remove `DEFAULT_ORG_ID`, NÃO migra |
| `meta-ads-intelligence/route.ts` | defeituoso (`accounts[0]!.org_id`) | corrige **sem** o helper |
| `meta-capi-dispatch/route.ts` | defeituoso (outbox sem filtro de org) | corrige **sem** o helper — mais dataset por org |
| `followup/route.ts` | defeituoso (`whatsapp_config` fora do loop) | corrige **sem** o helper |
| `email-automations`, `email-queue`, `obras-approval-reminder`, `roleta-retry` | zero `try/catch` no loop de org | ganham isolamento de erro |
| `bolsao-rebalance`, `sla-alerts` | `try` só na folha (envio de WhatsApp), não no loop de org | ganham isolamento de erro |

**Por que 3 crons não usam o helper (achado confirmado nesta story, remedido linha a linha):**
- `meta-ads-intelligence` deriva a lista de contas de `meta_ad_accounts` (contas de anúncio
  ativas), **não** de `organizations` — uma organização pode ter zero, uma ou várias contas.
  `forEachActiveOrg` iteraria organizações que não têm nada para sincronizar; a fonte de verdade
  certa é `meta_ad_accounts`, agrupada por `org_id`.
- `meta-capi-dispatch` processa uma **fila** (`meta_capi_outbox`, já com `org_id NOT NULL`
  referenciando linhas específicas) — o trabalho certo é agrupar a fila por org, não perguntar a
  cada org "você tem outbox pendente?" (N queries vazias contra 1 `GROUP BY` em memória).
- `followup` já itera `follow_up_rules` (cada regra carrega o próprio `org_id`) — está, na
  prática, na mesma família dos 19 arquivos "itera-orgs" (deriva a org da linha, não de
  `organizations`). O único defeito é um lookup de configuração que roda **fora** do escopo de
  org, uma vez por execução em vez de uma vez por org.

Nenhum dos três precisa que `organizations` seja consultada — teriam N-1 iterações
desperdiçadas se usassem o helper. Isso é o mesmo argumento, já usado pelo plano aprovado, contra
migrar os 19 "itera-orgs": **regressão de eficiência trocar "deriva a org da linha" por "pergunte
a cada org"**.

---

## Scope

### IN (esta story entrega)
1. **`packages/web/src/lib/tenancy/for-each-org.ts`** (Passo 2) — as 5 propriedades da AC1.
2. **Migração de `daily-report` e `nicole-agenda-reconcile`** para `forEachActiveOrg` (AC2).
3. **Reclassificação de `nicole-health`** — remove `DEFAULT_ORG_ID`, adiciona rastreio de orgs
   afetadas no corpo do alerta, **não** migra (AC3).
4. **Correção bespoke de `meta-ads-intelligence`, `meta-capi-dispatch`, `followup`** (AC4, AC5,
   AC6) — cada um com o próprio defeito, sem o helper.
5. **Isolamento de erro (try/catch em volta do loop de org) em `email-automations`,
   `email-queue`, `obras-approval-reminder`, `roleta-retry`, `bolsao-rebalance`, `sla-alerts`**
   (AC7) — 6 arquivos, mudança pequena e cirúrgica em cada.
6. **Manutenção da `docs/audits/admin-client-allowlist.json`** (AC8) — correção da referência
   `900-20`→`900-23`; remoção das 4 entradas que deixam de chamar `createAdminClient()`
   (`daily-report` + `.test.ts`, `nicole-agenda-reconcile` + `.test.ts`); realocação de
   `nicole-health` para `plataforma`; realocação de `meta-ads-intelligence`,
   `meta-capi-dispatch` (+ `.test.ts`) e `followup` para `itera-orgs`, com `arquivo:linha` novo;
   `alvos-onda-2` termina só com os 3 órfãos (`calendly-sync`, `supremo-history-sync`,
   `supremo-sync`) — **é a mesma previsão que o plano aprovado faz explicitamente na sua própria
   seção "Verificação ponta a ponta" da Onda 2** ("`alvos-onda-2` reduzido aos 3 órfãos").
7. **Não-regressão de produção** (AC9), incluindo o cuidado específico do `meta-capi-dispatch`
   (não pode parar de enviar CAPI para a Trifold por causa desta correção).

### OUT (não entra nesta story — próximas stories da Onda 2)
- Resolução de org nos webhooks (`resolveOrgByWhatsAppPhone`, `resolveOrgByMetaPage`,
  `resolveSoleOrg`, dual-run `WEBHOOK_ORG_ROUTING`) — Passo 4, `900-24` (já reservado no epic).
- Camadas A/B de teste de duas orgs contra `trifold-crm-dev` — Passo 6.
- Órfãos não agendados (`calendly-sync`, `supremo-history-sync`, `supremo-sync`) — decisão adiada
  para a Onda 3, por instrução do próprio plano aprovado.
- Os **12** crons cross-org de plataforma (`billing-*`, `keep-alive`, `webhook-health`,
  `purge-rejected-uploads` — corrigido de "15/16", contagem de *entradas* da allowlist que
  incluía 3 libs + 1 teste; C1) — permanentes, não migram, já reclassificados pela `900-21b`.
- `secret_ref`/Vault para `org_integrations` — Onda 7. O `dataset_id` do CAPI **não** é segredo
  (é público, mesmo raciocínio já registrado em `capi-client.ts` para o Pixel do browser); o que
  continua global nesta onda é o **token**.
- `packages/web/src/lib/meta/form-capi.ts` (CAPI da landing page/formulário pago) — usa
  `sendCapiEvents` mas por um fluxo diferente (Story 86-11/86-12), sem outbox nem cron. Fora do
  escopo desta story; a extensão da assinatura de `sendCapiEvents` (AC5) é aditiva/opcional e não
  o afeta.

---

## Acceptance Criteria

- [x] **AC1 — `forEachActiveOrg` em `packages/web/src/lib/tenancy/for-each-org.ts` (Passo 2):**

  **Por que este arquivo, e não `lib/tenancy/guard.ts` (citado pelo epic).** `guard.ts` **não
  existe** no repositório (medido: `find packages/web/src/lib/tenancy -name "guard.ts"` → vazio).
  `platform-guard.ts` já ocupa o radical "guard" com um sentido diferente e já estabelecido —
  autorização de quem pode acessar `/platform` (`requirePlatformAdmin`) — e reusar o nome para
  "itere as orgs ativas" misturaria dois conceitos que não têm nada em comum. `for-each-org.ts`
  nomeia exatamente o que o arquivo faz, no mesmo padrão de nome-função de `admin-invite.ts`/
  `platform-query.ts`, os dois vizinhos mais recentes do diretório.

  **Assinatura:**
  ```ts
  import type { SupabaseClient } from "@supabase/supabase-js"

  export interface OrgAtiva {
    id: string
    name: string
  }

  export interface ResultadoPorOrg<T> {
    org: OrgAtiva
    ok: boolean
    resultado?: T
    erro?: string
  }

  export interface ResumoForEachOrg<T> {
    total: number
    sucesso: number
    falha: number
    resultados: ResultadoPorOrg<T>[]
  }

  export interface ForEachOrgOptions {
    /** Nome do cron/rota, vai em `source` de cada log. */
    source: string
    /**
     * Só `1` é implementado nesta story (Propriedade 3). Aceito no tipo para não
     * fechar a porta de paralelismo real numa Onda futura de escala de
     * plataforma — mas passar qualquer valor != 1 lança, em vez de fingir que
     * paraleliza. Prometer concorrência que não existe é pior que não aceitar
     * o parâmetro.
     */
    concurrency?: 1
  }

  export async function forEachActiveOrg<T>(
    fn: (org: OrgAtiva, db: SupabaseClient) => Promise<T>,
    options: ForEachOrgOptions
  ): Promise<ResumoForEachOrg<T>>

  /**
   * 200 quando total===0 (nada para processar) OU sucesso>=1; 500 só quando
   * total>0 E sucesso===0 (todas as orgs falharam). Ver Propriedade 5.
   */
  export function statusHttpParaResumo(resumo: ResumoForEachOrg<unknown>): 200 | 500
  ```

  **Cinco propriedades, cada uma com mutação que reprova:**

  1. **Isolamento de erro é a razão de ser.** Cada `fn(org, db)` roda dentro de um
     `try { … } catch (e) { … }` individual. Uma org cujo callback lança **nunca** aborta as
     seguintes, e `forEachActiveOrg` **nunca relança** — o pior caso é `resumo.falha === total`.
     **Mutação:** callback que lança para a 2ª de 3 orgs (array `["org-a", "org-b", "org-c"]`,
     `org-b` lança) → `resumo.resultados` tem 3 entradas, `org-a` e `org-c` com `ok: true`,
     `org-b` com `ok: false` e `erro` contendo a mensagem lançada; a chamada a `forEachActiveOrg`
     em si **não lança**.
  2. **`db` é `createOrgScopedAdminClient(org.id)`.** Não é `createAdminClient()` cru passado
     junto do id — é o client já proxied (Story 900-14) que injeta `.eq("org_id", org.id)`
     automaticamente em `select`/`update`/`delete`/`insert`/`upsert` de tabelas com `org_id`. É o
     que torna a peça estrutural: esquecer `.eq("org_id", …)` dentro do callback deixa de ser
     possível para tabelas cobertas pelo snapshot da `900-14`/`900-14b`.
     **Mutação — corrigida (C7 do @po): espiar a fábrica não basta.** O carrasco original
     ("afirmar que `createOrgScopedAdminClient` é chamado uma vez por org, com `org.id` exato")
     **passa** numa implementação que chama a fábrica, descarta o resultado e entrega
     `createAdminClient()` cru ao callback — prova que a fábrica foi invocada, não que o callback
     **recebeu** o client escopado. Carrasco real, por **identidade**: o mock de
     `createOrgScopedAdminClient` devolve uma sentinela **distinta por org**
     (`vi.fn((id: string) => ({ __org: id }))`), e o teste afirma, dentro do próprio callback (via
     `fn` de teste que captura o argumento recebido), `db === sentinelaEsperada(org.id)` em **cada**
     invocação — nunca `createAdminClient()` chamado direto dentro do próprio `for-each-org.ts`
     para o `db` do callback (só para a query de listagem de orgs ativas, que é necessariamente
     cross-org).
  3. **`concurrency` default `1`, sequencial.** `for (const org of orgsAtivas) { await fn(…) }`
     — nunca `Promise.all`/`Promise.allSettled`. Estes crons falam com Meta Graph e WhatsApp
     Cloud, que têm rate limit por token; paralelizar introduz `429` em cascata, o modo de falha
     novo que esta onda existe para eliminar, não para criar.
     **Mutação:** duas orgs, cada callback registra `push(órgão, "start")`/`push(órgão, "end")`
     num array compartilhado com um `await new Promise(r => setTimeout(r, 10))` no meio → a
     sequência tem que ser `[a-start, a-end, b-start, b-end]`, nunca intercalada. **Correção R6 do
     @po — vocabulário errado para função `async`:** passar `concurrency: 2` (ou qualquer valor
     != 1) não "lança síncrono" — uma `async function` sempre devolve uma Promise, então o caminho
     de erro **rejeita**. Teste correto: `await expect(forEachActiveOrg(fn, { concurrency: 2,
     source: "x" })).rejects.toThrow(/concurrency/)`, nomeando o valor recebido e "não
     implementado nesta story" na mensagem. **A validação do parâmetro roda ANTES de listar orgs
     ou invocar qualquer callback** — `fn` tem **zero** chamadas quando `concurrency` é inválido
     (nada de trabalho parcial antes de rejeitar).
  4. **Log por org + resumo, via `logEvent`/`system_events` (`org_id` nullable já existe).** Para
     cada org processada: `logEvent({ level: ok ? "info" : "error", category: "cron", event_type:
     "CRON_ORG_PROCESSADA" | "CRON_ORG_FALHOU", org_id: org.id, source: options.source, message,
     metadata: { erro? } })`. Ao final, **um** log de resumo com `org_id: undefined` (evento de
     plataforma, não de tenant — `buildRow` em `lib/logger.ts` já grava `null` quando `org_id` é
     omitido): `event_type: "CRON_RESUMO", metadata: { total, sucesso, falha, source }`.
     **Mutação:** `vi.mock("@web/lib/logger")`, contar chamadas — para 3 orgs (2 sucesso, 1
     falha) espera-se **4** chamadas a `logEvent` (3 por-org + 1 resumo), a de resumo com
     `org_id` ausente/`undefined` e `metadata.total === 3`.
     **Regra herdada por todo chamador que usa `dedupe_key` dentro do callback (R5 do @po,
     JSDoc obrigatório no helper):** o índice único que sustenta `logEventOnce`/dedupe
     (`ux_system_events_dedupe_key`, migration 218) é `(event_type, metadata->>'dedupe_key')` —
     **sem `org_id`**. Um `dedupe_key` que não embute `org.id` faz a org B ser suprimida como
     "duplicata" da org A no mesmo `event_type`. `forEachActiveOrg` não impõe isso por código (o
     dedupe é decisão de cada callback, não do helper), mas o JSDoc do arquivo tem que documentar
     a regra explicitamente, porque o helper é exatamente o que torna dois callbacks concorrentes
     (2 orgs na mesma run) reais pela primeira vez — ver AC2 para a aplicação concreta no
     `nicole-agenda-reconcile`.
  5. **200 com relatório quando `sucesso >= 1` ou `total === 0`; 500 só quando `total > 0` e
     `sucesso === 0`.** `total === 0` é o caso "zero orgs ativas" (banco vazio, ou todas
     `is_active = false`) — não é uma falha, é "nada para fazer", e não pode reagendar o cron
     inteiro. `statusHttpParaResumo` é a função pura que cada rota chama para decidir o `status`
     do `NextResponse.json`, para as 3 rotas (`daily-report`, `nicole-agenda-reconcile`, e
     qualquer futura) não reimplementarem a mesma regra 3 vezes.
     **Mutação (função pura, sem I/O):** `{ total: 3, sucesso: 1, falha: 2 }` → `200`;
     `{ total: 3, sucesso: 0, falha: 3 }` → `500`; `{ total: 0, sucesso: 0, falha: 0 }` → `200`.

  **Fonte da lista de orgs ativas** (a única query cross-org legítima do arquivo):
  ```ts
  const admin = createAdminClient()
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name")
    .eq("is_active", true)
  ```
  Erro na própria listagem (banco fora do ar) **não** é um "org falhou" — é um erro estrutural:
  `forEachActiveOrg` lança nesse caso específico (o único ponto onde a função pode lançar), porque
  não há org nenhuma para isolar o erro.

  **Correção obrigatória C8 do @po — JSDoc não é carrasco, e o modo de falha aqui é o pior
  possível.** Se a implementação, por engano, engolir o `error` da listagem e devolver `data ?? []`
  (lista vazia), o resultado cai em `total === 0` → **200** pela Propriedade 5 — banco de dados
  fora do ar vira "nada para fazer", com HTTP verde, em **todos** os crons que usarem o helper,
  para sempre, sem ninguém notar. **Teste obrigatório, não documentação:**
  ```ts
  it("erro ao listar organizations rejeita, e o callback NUNCA é chamado", async () => {
    // mock: .from("organizations").select(...).eq(...) devolve { data: null, error: {...} }
    const fn = vi.fn()
    await expect(forEachActiveOrg(fn, { source: "x" })).rejects.toThrow()
    expect(fn).not.toHaveBeenCalled()
  })
  ```
  Reverter a mutação (fazer a implementação tratar `error` como lista vazia em vez de relançar) —
  este teste tem que ficar vermelho.

  **Verificação de vivacidade da própria suíte:** controle positivo com 2 orgs reais (fixture em
  memória) e callback trivial (`async () => "ok"`) → `resumo` com `total: 2, sucesso: 2, falha: 0`,
  `statusHttpParaResumo(resumo) === 200`.

  [Source: plano aprovado, Onda 2, Passo 2; epic §900-23 (linhas 838-845, corrigido pela contagem
  medida desta story); `packages/web/src/lib/supabase/org-scoped-admin.ts`]

- [x] **AC2 — `daily-report` e `nicole-agenda-reconcile` migrados para `forEachActiveOrg`:**

  **`daily-report/route.ts`:**
  - `DEFAULT_ORG_ID` (linha 16) é removido. O corpo do handler passa a ser
    `return NextResponse.json(await construirRespostaDailyReport(resumo), { status:
    statusHttpParaResumo(resumo) })` onde `resumo = await forEachActiveOrg(callback, { source:
    "api/cron/daily-report" })`.
  - **A armadilha do vazamento de destinatários, resolvida sem env nova:** dentro do callback,
    `envList` (hoje lido de `DAILY_REPORT_RECIPIENTS`) só é passado para
    `resolveDailyReportRecipients` quando `org.id === trifoldOrgId()`. **`trifoldOrgId()` mora num
    módulo compartilhado novo, `packages/web/src/lib/reports/trifold-org.ts`** — não numa
    constante privada de `daily-report/route.ts`: o `nicole-agenda-reconcile` (ver abaixo)
    precisa da mesma comparação, e dois handlers `route.ts` do App Router não devem se importar
    um ao outro (cada um é um módulo de rota isolado). O módulo é pequeno e puro:
    ```ts
    const TRIFOLD_ORG_ID_LITERAL = "00000000-0000-0000-0000-000000000001"
    /** Identifica a Trifold entre as orgs ativas — não é mais um default de org a processar. */
    export function trifoldOrgId(): string {
      return process.env.DAILY_REPORT_ORG_ID ?? TRIFOLD_ORG_ID_LITERAL
    }
    ```
    Para qualquer outra org, `envList` vira `[]`: os destinatários vêm só da tela de
    Configurações daquela org (`resolveDailyReportRecipients` já trata lista vazia de env como
    "nenhum destinatário extra", comportamento pré-existente — ver `lib/reports/recipients.ts:44`).
    **Sem esta condição, os telefones em `DAILY_REPORT_RECIPIENTS` receberiam o relatório de TODAS
    as orgs** — vazamento de métricas de negócio criado pela própria correção, exatamente a
    armadilha nomeada pelo plano aprovado.
  - Zero destinatário (env não aplicável + tela vazia) continua devolvendo o `{ skipped: … }`
    específico daquela org — não interrompe o loop das outras.
  - `DAILY_REPORT_ORG_ID` **sobrevive**, mas muda de papel: hoje decide *qual org processar*;
    depois desta AC decide *para qual org (entre as ativas) a env de recipients/Telegram se
    aplica* — a mesma função `trifoldOrgId()` é reusada pelo `nicole-agenda-reconcile` (ver C5
    abaixo) para a mesma decisão. Comentário no código de `trifold-org.ts` explicitando os dois
    papéis (antes/depois) para quem ler a história de git.

  **`nicole-agenda-reconcile/route.ts`:**
  - `DEFAULT_ORG_ID` (linha 30) removido. `orgId` (linha 76) deixa de vir de
    `process.env.DAILY_REPORT_ORG_ID ?? DEFAULT_ORG_ID` e passa a ser o parâmetro `org.id` do
    callback.
  - **Achado a preservar:** o código atual reusa `DAILY_REPORT_ORG_ID` (o env var de OUTRO cron)
    como seu próprio fallback de org — coincidência histórica de quando só existia uma org. A
    remoção fecha essa dependência cruzada não-intencional sem precisar de nenhuma env nova.
  - **Correção obrigatória C5 do @po — a v1 desta AC afirmava o oposto do medido, e é o mesmo
    vazamento do `daily-report`, negado na segunda rota.** A v1 dizia *"este cron não tem o
    problema de 'env global vazando para outra org', porque o canal de aviso já é único sem lista
    por org configurável"* — **"não ter lista por org configurável" não é a prova de que não
    vaza, é a RAZÃO pela qual vaza**: sem destino por org, tudo cai no único destino que existe.
    Medido: `packages/web/src/lib/telegram.ts:1-8` lê `TELEGRAM_ADMIN_CHAT_ID` de env, **um chat
    só, global**. O corpo do alerta (`route.ts:170-180`) nomeia o lead (`Lead: *${a.lead_nome}*`),
    cita o **trecho da conversa** e traz o **deep link** `${APP_URL}/dashboard/leads/${a.lead_id}`.
    Sob `forEachActiveOrg` sem correção, o nome do lead da org B, a fala da Nicole com ele e o
    link direto para o cadastro dele vão para o Telegram administrativo da Trifold.
    **Tratamento, simétrico ao do `daily-report`:** dentro do callback, o despacho a
    `sendTelegramAdminAlert` (a chamada em `notificarAdmins`, linha ~184) só acontece quando
    `org.id === trifoldOrgId()` (mesma função de `lib/reports/trifold-org.ts`, importada — nunca
    duplicada — dos dois crons). Para qualquer outra org, os alertas continuam sendo **gravados em
    `system_events`** (`NICOLE_AFIRMACAO_SEM_LASTRO`, já emitido por caso, isso não muda) mas
    `notificarAdmins` **não é chamado** — `avisos_despachados` fica `0` para essa org, o dado
    já está no banco (rastreável via `system_events`/futura tela de admin da org), só não vai
    para o Telegram compartilhado da Trifold.
  - **Correção obrigatória C4 do @po — a Propriedade 1 do helper comeria uma AC da Story 87-6.**
    `route.ts:200-212` tem um `catch` que emite `NICOLE_LASTRO_FALHA` **antes** de devolver 500 —
    comentário no próprio código: *"Sem esta linha, uma falha de execução devolve 500 e NÃO deixa
    rastro... Foi essa ambiguidade que custou quatro dias de diagnóstico"*. O carrasco é
    `route.test.ts:302-309` (🔴 87-6). Se o corpo do handler for movido para dentro do callback e
    o `try/catch` local for apagado ("o helper agora trata"), o `NICOLE_LASTRO_FALHA` desaparece,
    substituído pelo `CRON_ORG_FALHOU` genérico do helper — a garantia de 87-6 morre sem ninguém
    ver, porque a v1 desta AC não mencionava `NICOLE_LASTRO_FALHA` uma única vez. **Correção: o
    callback MANTÉM seu próprio `try/catch` interno**, que:
    1. Faz o trabalho de hoje (`reconciliarAgenda`, reivindicação de alertas, recibo);
    2. No `catch`, emite `NICOLE_LASTRO_FALHA` com `org_id: org.id` (hoje é `org_id: orgId`, sem
       mudança de valor — só a origem da variável muda);
    3. **Relança** (`throw e`) — é o helper, não o callback, quem decide "500 geral se todas as
       orgs falharam" (Propriedade 5); o callback não devolve `NextResponse` nenhum, devolve ou
       lança, porque quem monta a resposta HTTP agora é a rota, depois de `forEachActiveOrg`
       terminar.
    O evento continua sendo emitido (substância preservada); a forma muda (não é mais a última
    coisa antes de um `return NextResponse.json(..., { status: 500 })` direto do handler — é
    emitido dentro do `catch` do callback, e o 500 real, quando só existe 1 org e ela falha, vem
    de `statusHttpParaResumo` devolvendo 500 porque `sucesso === 0 && total === 1 > 0`).
  - `reconciliarAgenda(admin, { desde, ate, orgId })` recebe o `db` escopado do callback no lugar
    de `admin` — o tipo é o mesmo (`SupabaseClient`), compatível por construção (`db` é um Proxy
    transparente sobre `createAdminClient()`, ver AC1 Propriedade 2).
  - `logEventOnce` continua por org (já era — o defeito nunca esteve aqui, só na resolução de
    qual org processar). **`dedupe_key` já embute `orgId` hoje** (`lastro:${orgId}:${dia}:${dias}d`,
    `route.ts:145`) — sob duas orgs reais isso passa a ser a garantia que evita a org B ser
    suprimida como "duplicata" da org A no mesmo dia (regra R5 da AC1) — a `900-23` não muda essa
    linha, só estende o teste que já existe (`:260`) para provar com 2 orgs.
  - **`?dry=1` (R4 do @po):** o modo diagnóstico (`route.ts:87-89`, `route.test.ts:173-182`) hoje
    devolve `{ dry: true, ...rel }` de uma execução de org única. Sob o helper, `?dry=1` continua
    fazendo sentido só **por org** — não existe "dry run de todas as orgs num JSON só" nesta
    story. Decisão: `dry=1` roda `forEachActiveOrg` normalmente, mas cada callback, no modo dry,
    devolve o relatório sem emitir evento nem despachar Telegram (comportamento de hoje,
    preservado por org); o corpo agregado da rota passa a ser `{ dry: true, resultados: [...] }`
    (um item por org), **mudança de forma** declarada explicitamente aqui e no `route.test.ts`
    atualizado — não é mais um único objeto `{ dry, lastro_pct, ... }` no topo.

  **Verificação (mutação que reprova, para os dois arquivos):**
  - Fixture com 2 orgs ativas (`org-trifold`, `org-b`) → `daily-report`: só `org-trifold` recebe
    os telefones da env; `org-b` recebe só os da própria tela (fixture com tela vazia → `org-b`
    aparece como `skipped` no resultado daquela org, sem abortar `org-trifold`).
  - `nicole-agenda-reconcile`: 2 orgs, cada uma com o próprio `reconciliarAgenda` chamado com o
    `orgId` correto (spy) — nunca os dois com o mesmo id.
  - **C5 — fixture com 2 orgs, org B com alertas** ⇒ **zero** chamadas a `sendTelegramAdminAlert`
    contendo qualquer dado da org B (nome de lead, trecho, link); `system_events` continua
    recebendo `NICOLE_AFIRMACAO_SEM_LASTRO` para a org B normalmente. Org Trifold continua
    despachando Telegram como hoje.
  - **C4 — reverter a mutação** (apagar o `try/catch` interno do callback, deixar só o helper
    isolar) → o teste `🔴 87-6` (adaptado para o novo formato de resposta) fica vermelho: zero
    eventos `NICOLE_LASTRO_FALHA` gravados quando `reconciliarAgenda` lança.
  - **C6 — Propriedade 5 amarrada na rota, não só na função pura** (a AC1 provava
    `statusHttpParaResumo` isolada; isto prova que a rota a *usa*, no mesmo padrão das asserções
    de `res.status` que `daily-report/route.test.ts:82`/`:111` já fazem hoje):
    - 2 orgs, 1 falha ⇒ `res.status === 200`, corpo identifica qual org falhou (por `orgId` ou
      `name`, não só a contagem);
    - 2 orgs, ambas falham ⇒ `res.status === 500`;
    - **0 orgs ativas** (fixture com `organizations` vazia) ⇒ `res.status === 200` e **zero**
      invocações do callback (spy).
  - **R5 — estender o teste de `dedupe_key`** (hoje `nicole-agenda-reconcile/route.test.ts:222-226`,
    1 org) **para 2 orgs**: cada uma gera `lastro:${orgId}:${dia}:${dias}d` com o `orgId` correto
    — **2 chaves distintas**, nunca uma suprimindo a outra por dedupe.
  - `grep -n "DEFAULT_ORG_ID" src/app/api/cron/daily-report/route.ts
    src/app/api/cron/nicole-agenda-reconcile/route.ts` → **0** ocorrências nos dois.
  - **R11 — o grep de nome não mede o defeito, só o rótulo; somar grep do literal.**
    `grep -c "00000000-0000-0000-0000-000000000001"` medido em `e8ea5433`: **daily-report:1,
    nicole-agenda-reconcile:1, nicole-health:1** (mais 4 ocorrências em outros 4 arquivos fora do
    escopo desta story — não tocar). **Depois** desta AC + AC3: `daily-report:0` e
    `nicole-agenda-reconcile:0` (os dois passam a *importar* `trifoldOrgId()`, sem literal
    próprio), `packages/web/src/lib/reports/trifold-org.ts:1` (novo — único lugar onde o literal
    da Trifold é declarado), `nicole-health/route.ts:1` (agora `PLATFORM_ALERT_ORG_ID`, ver AC3) —
    total nos arquivos de cron cai de 3 para 1 (`nicole-health`), com o literal remanescente da
    Trifold centralizado em 1 módulo compartilhado em vez de duplicado em 2 rotas. Colar os dois
    greps (antes/depois, este segundo cobrindo `lib/reports/trifold-org.ts` também) no Dev Agent
    Record.
  - **R3 — 3 asserções pré-existentes mudam de FORMA, não de garantia; nomeadas para não sumirem
    silenciosamente num "conserto de teste":**
    - `daily-report/route.test.ts:103-104` (`json.skipped` no nível raiz do corpo) — sob o
      helper, o corpo passa a ser por-org (`resultados: [...]`); o `skipped` daquela org migra
      para dentro do item correspondente. Reescrever a asserção para navegar até o item da org,
      não para remover a garantia "zero destinatário é explícito, nunca silencioso".
    - `nicole-agenda-reconcile/route.test.ts:176` (`body.dry === true` no topo) — vira
      `body.resultados[0].dry === true` (ver `?dry=1`, R4, acima).
    - `nicole-agenda-reconcile/route.test.ts:308` (`expect(await res.json()).toEqual({ error:
      "timeout lendo messages" })`, igualdade **exata** do corpo inteiro) — com 1 org falhando,
      o corpo passa a ser o resumo do `forEachActiveOrg` (`resultados[0].erro` contendo a
      mensagem), não `{ error: "..." }` solto. Reescrever para `toMatchObject`/navegação ao item,
      preservando a asserção de que a mensagem de erro real chega ao corpo da resposta.
  [Source: plano aprovado, Onda 2, Passo 5, tabela "quais migram"; correções C4/C5/C6/R3/R4/R5/R11
  de `docs/qa/po-validation-900-23.md`]

- [x] **AC3 — `nicole-health` reclassificado, NÃO migrado — remove `DEFAULT_ORG_ID`, rastreia
  orgs afetadas no corpo do alerta:**

  **Por que não migra (decisão já travada pela `900-21b`, C5, reafirmada aqui):** `nicole-health`
  é vigia de **plataforma** — avisa o admin da Trifold que a API de IA da Nicole parou de
  responder, agregando eventos de erro de **todas** as orgs num único canal WhatsApp. Migrar para
  `forEachActiveOrg` criaria N alertas para o mesmo incidente (um por org com erro), o oposto do
  que o comentário do próprio arquivo (linha 21-24) diz que o cron existe para evitar
  ("agregação de graça: 7 falhas viram 1 aviso, não 7").

  **As 5 ocorrências de `DEFAULT_ORG_ID` medidas (linhas 31, 117, 126, 157, 166) resolvidas
  assim, não uniformemente:**
  1. **Leitura de `system_events` (linhas 74-79): já não tem filtro de org** — lê erro de
     **todas** as orgs hoje. Isso não é o defeito. O defeito é que o `select` não traz `org_id`
     (`select("created_at, message, source")`), então mesmo lendo de todas as orgs, o código não
     sabe **quais**. **Adiciona `org_id` ao `select`.**
  2. **Agregação (`interface Agregado`, linha 40-43) ganha `orgsAfetadas: Set<string | null>`** —
     preenchido a cada evento (`org_id` pode ser `null` para eventos já hoje sem org). O corpo do
     alerta (linha 169-178) passa a incluir a linha `Orgs afetadas: ${[...orgsAfetadas].join(", ")
     || "desconhecida"}`.
  3. **Canal de entrega (`carregarConfigWhatsApp`, linha 117) permanece apontado para a org da
     Trifold** — é o WhatsApp que ENVIA o alerta ao admin, não um filtro do que é lido. Renomeado
     para `PLATFORM_ALERT_ORG_ID` (mesmo valor UUID), com JSDoc: *"canal de entrega do alerta de
     plataforma — não é o org_id do incidente, é de quem recebe o aviso"*.
  4. **`alertarAdminWhatsApp({ orgId: …, … })`, linha 166 — mesma razão do item 3**, também
     `PLATFORM_ALERT_ORG_ID` (é o org cujo `whatsapp_config` está sendo usado para enviar,
     não o org do incidente).
  5. **`org_id: DEFAULT_ORG_ID` nos dois `logEventOnce`/`logEvent` do próprio alerta (linhas 126,
     157) — removido, viram `org_id: undefined`.** Este é o `DEFAULT_ORG_ID` que a correção
     "remove" de fato: o alerta em si é um evento de plataforma (não pertence a nenhum tenant
     específico), então gravá-lo como se fosse da Trifold é a mesma classe de erro de atribuição
     que motivou esta reclassificação inteira. A informação de qual(is) org(ns) foram afetadas já
     vai em `metadata.orgs_afetadas`, não em `org_id`.

  **Consequência para a allowlist (AC8):** o arquivo continua chamando `createAdminClient()`
  (não migra) — mas o motivo muda de "achado, travado, correção pendente" para "vigia de
  plataforma, cross-org por desenho, permanente". Move de `alvos-onda-2` para `plataforma`.

  **Verificação (mutação que reprova):**
  - Fixture com eventos de erro de 2 orgs distintas dentro da janela → o alerta disparado tem
    `metadata.orgs_afetadas` com as 2, mesmo sendo um único aviso agregado.
  - `grep -n "DEFAULT_ORG_ID" src/app/api/cron/nicole-health/route.ts` → **0** ocorrências;
    `grep -n "PLATFORM_ALERT_ORG_ID" …` → **2** (as duas que sobrevivem, renomeadas).
  - Os dois `logEventOnce` do próprio alerta gravam sem `org_id` (spy captura `undefined`, nunca
    o UUID antigo).
  - Teste existente (`nicole-health/route.test.ts`, **17 casos** — corrigido, C1 do @po; a v1
    desta story dizia 27 sem ter rodado `npx vitest run`; medido em `e8ea5433`:
    `npx vitest run packages/web/src/app/api/cron/nicole-health/route.test.ts` →
    `Tests 17 passed (17)`) continua **100% verde** — nenhuma AC das stories anteriores (87-19)
    regride; a única mudança de comportamento observável é o novo campo `orgs_afetadas` no corpo
    do alerta.
  - **R11 (herdado da AC2) — grep do literal, não só do rótulo:** `grep -c
    "00000000-0000-0000-0000-000000000001" src/app/api/cron/nicole-health/route.ts` → **1** antes
    e **1** depois (`PLATFORM_ALERT_ORG_ID` é uma renomeação no lugar, não uma extração para
    módulo compartilhado — `nicole-health` não compartilha essa constante com nenhum outro cron).
  [Source: plano aprovado, Onda 2, Passo 2 (tabela "quais migram"); `alvos-onda-2` da 900-21b,
  motivo do `nicole-health` (correção C5)]

- [x] **AC4 — `meta-ads-intelligence` corrigido (sem o helper):**

  Hoje: `accounts[0]!.org_id` (linha 231) vira "a org" para **9** usos seguintes (corrigido de
  "~10" — R7 do @po, medido em `e8ea5433`): 7 `.eq("org_id", orgId)` (linhas 255, 274, 289, 298,
  307, 323, 331) + 2 escritas (`meta_sync_log:236`, e a atribuição `org_id: m.orgId` que alimenta
  o `upsert` em `meta_alerts:490`, onde `m.orgId` vem dos objetos `CampaignMetric` construídos com
  `orgId: c.org_id` na função que monta `campaignMetrics`). **O 10º match textual (`orgId:
  c.org_id`, linha 428) é outra coisa** — deriva o campo `orgId` de cada métrica a partir da
  própria linha de `campaigns` (`c.org_id`), não é um filtro `.eq()` nem lê a variável `orgId` do
  escopo externo; com contas de duas orgs, processa e registra `success` só para a primeira.

  **Correção:** agrupar `accounts` (já buscadas com `org_id`, linha 222-225) por `org_id`;
  envolver o bloco inteiro que hoje roda uma vez (linhas 244-578, dentro do `try` existente) num
  `for (const [orgId, contasDaOrg] of accountsByOrg)`, com **`try/catch` individual por
  iteração** — uma org com erro não pode abortar a sincronização das outras. `meta_sync_log`
  (hoje um `insert` antes do loop, um `update` no fim) passa a ser **um par insert/update por
  org**, dentro da iteração — sem isso, `meta-sync-health` (que lê `meta_sync_log` para decidir
  se o sync rodou) continuaria achando que rodou para todas quando só a última org processada de
  fato atualizou o log.
  - A resposta HTTP final agrega os resultados de todas as orgs (`campaigns_analyzed`,
    `alerts_fired`, `summary` por tipo de alerta, somados across orgs — mais um campo novo
    `por_org: Array<{ orgId, campaigns_analyzed, alerts_fired, error? }>` para diagnosticar sem
    abrir o log).
  - `syncLog` continua não-bloqueante (o padrão atual já trata `insert` retornando `null` sem
    abortar) — preservado por org.

  **Verificação (mutação que reprova):**
  - Fixture com contas de 2 orgs, a query de `meta_insights_daily` (linha 252-258, "verifica
    dado de ontem") devolvendo vazio só para a 1ª org → a 2ª org é processada normalmente
    (`campaigns_analyzed > 0` para ela), e o resultado da 1ª aparece como `skipped:
    "no_yesterday_data"` dentro de `por_org`, não como abort geral.
  - Fixture com a query de campanhas (linha 271-274) lançando exceção só para a 2ª org → a 1ª
    tem `meta_sync_log` com `status: "success"`; a 2ª tem `status: "error"` com
    `error_message` preenchido — **duas linhas**, uma por org, nunca uma só sobrescrita.
  - Restaurar `accounts[0]!.org_id` (reverter a mutação) → o teste do agrupamento por org fica
    vermelho (só processa 1 org mesmo com contas de 2).
  - **R7 do @po — o carrasco cobria `meta_sync_log` mas não `meta_alerts`.** Fixture com 2 orgs,
    cada uma gerando ao menos 1 alerta (`detectZeroLeadsActive` ou similar) → `meta_alerts` recebe
    linhas com o `org_id` de **cada** org correta (spy no `upsert`, ou leitura pós-fixture),
    nunca as duas com o `org_id` da primeira.
  - **R8 (dívida nomeada, não corrigida nesta story):** `meta_ad_accounts` não filtra
    `organizations.is_active`. Uma org suspensa com contas `status='active'` continua consumindo
    Graph API e gerando alertas. Registrado como débito explícito no Dev Notes — fora do escopo
    (o corte desta story é "resultado errado hoje", não "toda superfície de custo de plataforma").
  [Source: plano aprovado, Onda 2, Passo 5; allowlist `alvos-onda-2`, entrada
  `meta-ads-intelligence`, `:231`; correção R7/R8 de `docs/qa/po-validation-900-23.md`]

- [x] **AC5 — `meta-capi-dispatch` corrigido: outbox por org + dataset por org (sem o helper):**

  Hoje: `select` de `leads` (linha 100-103) usa só `.in("id", leadIds)`, sem `.eq("org_id", …)`
  — outbox de todas as orgs tratada como se fosse uma, e o `dataset_id`/token vêm de env global
  (`sendCapiEvents`, `packages/shared/src/meta/capi-client.ts:73`), então **PII de uma org pode
  ir para o dataset/pixel de outra**.

  **Decisão de produto (herdada do plano aprovado, reafirmada):** o **token** do CAPI continua
  global nesta onda (`META_CAPI_ACCESS_TOKEN`, sem mudança). Só o **`dataset_id`** passa a vir de
  `org_integrations` (provider `meta_capi`, `config->>'dataset_id'`, coluna entregue pela
  `900-21b`). Org sem dataset configurado não tem CAPI habilitado — pior que hoje só para essa
  org (que já não tinha nada garantido), nunca vaza para o pixel de outra.

  **Correção, passo a passo:**
  1. `select` do outbox (linha 78-83) ganha `org_id` na lista de colunas.
  2. Agrupar `outbox` por `org_id` (o `Map<orgId, OutboxRow[]>`), processar em loop, **cada
     org isolada em try/catch** (mesma razão da AC4).
  3. `select` de `leads` (linha 100-103) ganha **os dois filtros**: `.eq("org_id", orgId)` **e**
     `.in("id", leadIdsDaOrg)` — os dois, não um no lugar do outro. Um lead que foi removido (ou
     movido, hipoteticamente) não pode ser "resgatado" pela query da org vizinha se só o
     `.in("id", …)` estivesse presente; o `.eq("org_id", …)` sozinho sem o `.in` traria leads
     demais e quebraria o mapeamento outbox→lead por id.
  4. **Resolução do dataset por org**, antes de montar os eventos daquela org:
     ```ts
     const { data: integ, error: integErr } = await supabase
       .from("org_integrations")
       .select("config")
       .eq("org_id", orgId)
       .eq("provider", "meta_capi")
       .maybeSingle()

     const datasetId = (integ?.config as { dataset_id?: string } | null)?.dataset_id ?? null
     ```
     **Fail-safe por design, não só por acidente:** se a query falhar (erro de rede, ou —
     durante a janela entre este deploy e a aplicação da migration `246` em produção — a tabela
     ainda não existir), `integErr` é truthy e o código trata como "dataset indisponível", nunca
     lança. Isso é o que torna o deploy seguro **mesmo que** a ordem declarada em "Depends on"
     falhe por algum motivo operacional — defesa em profundidade, não substituto da ordem certa.
  5. Sem `datasetId` (config ausente, `null`, ou erro na consulta) ⇒ **todas as linhas daquela
     org viram `status: 'skipped'`, `last_error: 'capi_nao_configurado'`** — nunca `'sent'` (que
     mentiria que foi enviado) nem `'failed'` (que gastaria as 3 tentativas — `MAX_ATTEMPTS` —
     num problema de configuração que retry não resolve). `summary.skipped` incrementado.
     **Correção obrigatória C9 do @po — o estado precisa de voz, não só de coluna.** A v1 desta
     AC deixava `capi_nao_configurado` visível **só** em `meta_capi_outbox.last_error` — combinado
     com a dependência de ordem de deploy (AC5.2), isso é literalmente o defeito que a Onda 2
     existe para eliminar: comportamento errado, resposta 200, ninguém sabe. Toda vez que uma org
     cai neste ramo (uma vez por org por execução, não uma vez por linha — evita 50 eventos
     idênticos no pior caso de lote cheio): `logEvent({ level: "error", category: "cron",
     event_type: "CAPI_ORG_SEM_DATASET", org_id: orgId, source: "api/cron/meta-capi-dispatch",
     message: "meta_capi_outbox com linhas pendentes mas org_integrations sem dataset_id
     configurado", metadata: { linhas_puladas: n } })`.
  6. Com `datasetId` presente, `sendCapiEvents(events, { datasetId, testEventCode })` — **AC5.1
     abaixo estende a assinatura**.

  **AC5.1 — `sendCapiEvents` (packages/shared/src/meta/capi-client.ts) ganha `datasetId`
  opcional em `SendCapiEventsOptions`:**
  ```ts
  export interface SendCapiEventsOptions {
    testEventCode?: string
    /** Override por org (Story 900-23). Ausente → cai no fallback de env (compat retroativo). */
    datasetId?: string
  }
  ```
  Dentro da função: `const datasetId = options?.datasetId ?? process.env.META_CAPI_DATASET_ID ||
  '1337310707164669'`. **Aditivo e retrocompatível** — `packages/web/src/lib/meta/form-capi.ts`
  (outro chamador, fluxo diferente, fora do escopo desta story) não passa `datasetId` e continua
  com o comportamento de hoje, byte a byte.

  **AC5.2 — não-regressão do CAPI da Trifold em produção (bloqueante, ligado ao "Depends on";
  Decisão 2 do parecer do @po — mantida como AC, agora com as 3 peças que a tornam verificável,
  não só um desejo redigido em imperativo):**

  Produção hoje tem **uma** org, cujo `meta-capi-dispatch` funciona via
  `META_CAPI_DATASET_ID`/fallback hardcoded. Depois desta correção, a Trifold só continua
  recebendo eventos CAPI se `org_integrations` tiver, para o `provider = 'meta_capi'` da org da
  Trifold, `config->>'dataset_id'` igual ao valor que está em uso hoje
  (`process.env.META_CAPI_DATASET_ID`, ou o literal `'1337310707164669'` se a env não estiver
  setada em produção — **confirmar qual dos dois é o caso real antes de popular**, é leitura, não
  suposição).

  **Peça 1 — o seed precisa de recibo (não "deve existir").** A migration `246` (linhas 245-251)
  faz backfill de `meta_capi` com `{"dataset_id": null}` para toda org existente — a linha *deve*
  existir em produção depois que `246` for aplicada. **"Deve" não é prova.** Um `UPDATE ... WHERE
  org_id = ... AND provider = 'meta_capi'` que não encontra a linha afeta **0 linhas, em
  silêncio**. Exigir `RETURNING org_id, config->>'dataset_id' AS dataset_id`, com a linha
  devolvida colada no Dev Agent Record (rowcount = 1, valor = o confirmado), **mais** um `SELECT`
  de leitura separado logo depois, para provar que a escrita persistiu (não só que o comando
  devolveu uma linha na mesma transação).

  **Peça 2 — checagem pós-deploy, não só pré-deploy.** Depois da primeira execução do
  `meta-capi-dispatch` corrigido em produção: `SELECT count(*) FROM meta_capi_outbox WHERE
  status='skipped' AND last_error='capi_nao_configurado'` → esperado **0** para a org da Trifold.
  Resultado diferente de 0 nomeia, sozinho, que a ordem de deploy falhou — é o instrumento que
  fecha o "sem 500, sem alerta, sem log" que o C9 identificou (o `CAPI_ORG_SEM_DATASET` da Peça 3
  de AC5 item 5 é o alerta em tempo real; esta é a confirmação de que ele não disparou).

  **Peça 3 — plano B nomeado.** Se a Task 9.1 (leitura do valor real) ou a Task 9.3 (seed com
  `RETURNING`) não puderem ser concluídas no dia planejado do deploy, **o código desta AC não
  sobe** — o deploy do `meta-capi-dispatch` corrigido é feito em PR/release **separado** do
  restante desta story (que não tem essa dependência). Isso precisa estar escrito na Task 9, não
  presumido: a ordem depende de um passo manual, e um passo manual sem plano B escrito depende de
  alguém lembrar.

  **Task obrigatória, antes do deploy do código desta AC:** `@devops`/`@data-engineer` populam
  essa linha em produção com o `dataset_id` real (`UPDATE org_integrations SET config =
  jsonb_set(config, '{dataset_id}', to_jsonb(<valor confirmado>)) WHERE org_id = <id da Trifold>
  AND provider = 'meta_capi' RETURNING org_id, config->>'dataset_id'`) — **antes ou no mesmo
  deploy** do código do `meta-capi-dispatch`. Sem isso, o comportamento de produção muda (CAPI
  para de disparar para a Trifold), o que viola a restrição central desta story e da Onda 2
  inteira.

  **R9 (dívida nomeada, não corrigida nesta story):** o lote do CAPI é global e FIFO
  (`BATCH_SIZE = 50`, `*/3 * * * *`) — uma org com backlog grande monopoliza a fila de todas as
  outras. Volume atual (~22 leads/mês) torna isso teórico hoje; registrado como débito, não
  corrigido aqui.

  **Verificação (mutação que reprova):**
  - Fixture com outbox de 2 orgs (org A com `dataset_id` configurado, org B sem) → org A tem
    linhas `sent` (mock de `sendCapiEvents` retornando sucesso, chamado com `datasetId` = o da
    org A); org B tem linhas `skipped`/`capi_nao_configurado`, **zero chamadas** a
    `sendCapiEvents` para a org B, e **uma** chamada a `logEvent` com `event_type:
    "CAPI_ORG_SEM_DATASET"` e `org_id` da org B (C9).
  - `select` de `leads` mockado para devolver um lead de outra org (simulando ausência do
    `.eq("org_id", …)`) → com o filtro aplicado, esse lead não aparece no `leadById` da org
    errada; reverter o filtro (só `.in("id", …)`) faz o teste ficar vermelho (a mutação que
    reprova o próprio defeito original).
  - Reverter a mutação do fail-safe (query de `org_integrations` lançando em vez de devolver
    erro tratável) → o cron **não** derruba as outras orgs (try/catch por org, AC5 item 2), mas
    a org afetada fica `skipped` — nunca 500 geral — **e** emite `CAPI_ORG_SEM_DATASET` (não é um
    caminho silencioso diferente do "sem dataset configurado" — é o mesmo caminho, C9 cobre os
    dois).
  - `pnpm test packages/shared/src/meta/capi-client.test.ts` continua 100% verde (a extensão de
    `SendCapiEventsOptions` é aditiva, não deveria quebrar nenhum caso existente); mais um caso
    novo: `datasetId` explícito nas options tem prioridade sobre a env.
  [Source: plano aprovado, Onda 2, Passo 5, "meta-capi-dispatch (o mais grave)"; "Decisões
  travadas" (token do CAPI global, dataset por org); `900-21b` AC3/AC4 (org_integrations,
  provider `meta_capi`, `config.dataset_id`); correções C9/R9 e Decisão 2 de
  `docs/qa/po-validation-900-23.md`]

- [x] **AC6 — `followup` corrigido: lookup de `whatsapp_config` move para dentro do loop de
  regras (sem o helper):**

  Hoje (linhas 166-171): o lookup de templates aprovados (`whatsapp_config` por
  `status='active'`, sem `org_id`) roda **uma vez por execução**, antes do `for (const rule of
  rules)` (linha 192).

  **Diagnóstico corrigido (R1 do @po — a v1 desta AC estava errada, e o defeito real é pior do
  que "usa a config errada"):** o código faz `.eq("status","active").maybeSingle()`. Com **uma**
  linha ativa (hoje, produção), `maybeSingle()` funciona normalmente — não há bug visível. Mas
  com **duas** linhas ativas (o cenário que esta story existe para preparar), `maybeSingle()`
  **não devolve "a primeira"** — devolve **erro** (`PGRST116`, "mais de uma linha"). E o código
  faz `const { data: waCfg } = await supabase.from("whatsapp_config")...`, **descartando
  `error`** por completo. Consequência: no dia em que a segunda org tiver `whatsapp_config` ativa,
  `waCfg` vem `undefined`, a condição `if (waCfg?.waba_id && waCfg?.access_token)` falha, e o
  follow-up por template **morre para TODAS as orgs, em silêncio** — nem o
  `FOLLOWUP_TEMPLATES_INDISPONIVEIS` (que só dispara no `catch` de
  `listApprovedOpeningTemplates`, nunca alcançado) avisa. **Medir hoje, antes de qualquer deploy**
  (Task 6.0): `SELECT count(*) FROM whatsapp_config WHERE status='active'` em produção — se já
  for > 1, o follow-up por template já está quebrado agora, sem relação com esta story.

  **Correção:** extrair o bloco em uma função exportada e pura o suficiente para testar
  isoladamente:
  ```ts
  export async function carregarTemplatesAprovadosDaOrg(
    supabase: SupabaseClient,
    orgId: string
  ): Promise<Map<string, string>>
  ```
  Reproduz a lógica de hoje (linhas 167-188: chama `listApprovedOpeningTemplates` se houver
  `waba_id`/`access_token`, loga `FOLLOWUP_TEMPLATES_INDISPONIVEIS` em caso de erro — agora com
  `org_id: orgId` no evento, hoje ausente), mas com o `select` de `whatsapp_config` **filtrado por
  `org_id` além de `status='active'`** (`.eq("org_id", orgId).eq("status","active").maybeSingle()`).
  **Isto também fecha o `PGRST116` do diagnóstico corrigido acima**, pela mesma garantia que a
  migration `246`/AC2 da `900-21b` já entrega: o índice `whatsapp_config_org_ativo` (`UNIQUE
  (org_id) WHERE status='active'`) torna estruturalmente impossível uma org ter 2 linhas ativas —
  então `.eq("org_id", orgId)` reduz a consulta a, no máximo, 1 linha, e `maybeSingle()` deixa de
  poder devolver `PGRST116` **para esta query especificamente** (ela já filtra por org antes de
  checar unicidade). O `error` retornado pelo `maybeSingle()` continua sendo verificado
  explicitamente (não descartado) — defesa em profundidade contra qualquer outro erro (rede,
  RLS), não só o `PGRST116` que a migration já torna impossível aqui.
  - Dentro do `for (const rule of rules)` (linha 192), **cache por execução**:
    `const cacheTemplatesPorOrg = new Map<string, Map<string, string>>()` declarado antes do
    loop; para cada `rule`, `corpoDoTemplate = cacheTemplatesPorOrg.get(rule.org_id) ??
    await carregarTemplatesAprovadosDaOrg(supabase, rule.org_id)` (populando o cache na primeira
    vez) — **só busca 1x por org por execução**, não 1x por regra, preservando a razão de ser do
    comentário original ("uma chamada por run, não por lead").
  - `templatesConfigurados` (linha 162-163, "alguma regra usa `hsm_template`?") continua
    calculado sobre `rules` inteiro — decide **se vale a pena** montar o cache; não muda.
  - O restante do arquivo (linhas 192+, já filtra `.eq("org_id", rule.org_id)` corretamente em
    `leads`, conforme medido nesta story) **não muda** — o defeito estava isolado neste bloco.

  **Verificação (mutação que reprova):**
  - Fixture com 2 orgs, cada uma com `whatsapp_config` ativa e templates aprovados diferentes
    (nomes distintos) → regras da org A usam o corpo de template da org A, regras da org B usam
    o da org B — nunca cruzado.
  - `carregarTemplatesAprovadosDaOrg` chamada exatamente **1 vez por org distinta** presente em
    `rules`, não uma vez por regra (fixture com 3 regras, 2 da mesma org → 2 chamadas, não 3).
  - Reverter a extração (voltar ao lookup único antes do loop, sem filtro de `org_id`) → o teste
    de "corpo por org correto" fica vermelho (a mutação que reprova o próprio defeito original).
  - **R1 — o fake do teste precisa honrar `maybeSingle()` com 2+ linhas devolvendo erro**, nunca
    `linhas[0] ?? null` (a mesma lição já registrada para o webhook do WhatsApp na Onda 2 do
    plano). Fixture com 2 linhas `active` na tabela simulada, sem `.eq("org_id", …)` aplicado
    (simulando o código de HOJE) → o fake devolve `{ data: null, error: { code: "PGRST116" } }`, e
    o teste confirma que o `followup` de hoje trataria isso como canal indisponível para
    **todas** as regras (reproduz o R1 antes de aplicar a correção); com o filtro de `org_id`
    aplicado (código novo), a mesma fixture de 2 linhas (uma por org) devolve exatamente 1 por
    chamada, sem erro.
  - `pnpm test` nos testes existentes de `followup` (`notify-alert.test.ts`,
    `resolve-broker-name.test.ts`, se exercitarem qualquer caminho tocado) continua verde.
  [Source: plano aprovado, Onda 2, Passo 5, "cron/followup:167-171"; allowlist `alvos-onda-2`,
  entrada `followup`; correção R1 de `docs/qa/po-validation-900-23.md`]

- [x] **AC7 — Isolamento de erro (try/catch em volta do loop de org) nos 6 arquivos que já
  iteram corretamente:**

  **Critério, repetido de propósito:** estes 6 **não** migram para `forEachActiveOrg` — já
  derivam a org da própria linha que processam (lead, config, automação), e trocar por "para
  cada org, procure pendências" seria N queries vazias contra a iteração atual, que já é
  eficiente. O único ganho que falta é: um erro processando o item da org A não pode abortar o
  processamento dos itens da org B, que vêm depois no mesmo loop.

  | Arquivo | Loop a envolver | Estado hoje |
  |---|---|---|
  | `email-automations/route.ts` | `for (const automation of automations ?? [])` (:61) **e** `for (const automation of birthdayAutomations ?? [])` (:116) | zero `try/catch` |
  | `email-queue/route.ts` | `for (const orgId of orgIds)` (:53) | zero `try/catch` |
  | `obras-approval-reminder/route.ts` | `for (const [orgId, { count, ids }] of byOrg.entries())` (:52) | zero `try/catch` |
  | `roleta-retry/route.ts` | `for (const lead of leads ?? [])` (:74) | zero `try/catch` (só `console.error` no fetch inicial, fora do loop) |
  | `bolsao-rebalance/route.ts` | `for (const cfg of (configs ?? []) as CfgRow[])` (:70) | `try/catch` só na folha (envio de WhatsApp, :336/:367) |
  | `sla-alerts/route.ts` | `for (const cfg of (configs ?? []) as CfgRow[])` (:110) | `try/catch` só na folha (envio de WhatsApp, :24) |

  **Padrão de correção, igual nos 6 (~4 linhas de diff por arquivo):**
  ```ts
  for (const X of lista) {
    try {
      // corpo existente do loop, sem mudança de lógica interna
    } catch (e) {
      console.error(`[${NOME_DO_CRON}] falha processando ${identificador(X)}:`, e)
      resultados.falhas++ // ou o contador equivalente já existente no arquivo
      continue
    }
  }
  ```
  - **Nunca relança** — mesma propriedade 1 do `forEachActiveOrg`, aplicada manualmente aqui
    porque estes arquivos não usam o helper.
  - O `try/catch` já existente nas folhas de `bolsao-rebalance`/`sla-alerts` (envio de WhatsApp)
    **não muda** — continua tratando falha de rede/API separadamente; o novo `try/catch` externo
    é uma segunda camada, para qualquer coisa que dê errado **fora** do envio (query, cálculo,
    acesso a campo ausente).
  - **Correção obrigatória C10 do @po — a v1 desta AC afirmava um contador que não existe em
    metade dos arquivos, e o carrasco escrito ("o 2º item processou") passaria com o erro
    engolido em silêncio.** Medido, campo a campo, contra `e8ea5433`:

    | Arquivo | Retorno hoje | Campo de falha nomeado nesta AC |
    |---|---|---|
    | `email-queue/route.ts` | `{ processed, failed }` | **já existe** — `failed++` no `catch` |
    | `roleta-retry/route.ts` | `{ processed, distributed, fora_horario, sem_corretor, skipped, aguardando, nao_lead, relacionamento, outros }` — 8 contadores, nenhum de erro | **novo campo `erros: number`**, incrementado no `catch` |
    | `email-automations/route.ts` | `{ fired, skipped, ... }` | **novo campo `erros: number`** (um contador só, cobrindo os 2 loops — automações de `cron.daily` e de aniversário) |
    | `obras-approval-reminder/route.ts` | `{ processed, notified_orgs }` | **novo campo `orgs_com_erro: number`** |
    | `bolsao-rebalance/route.ts` | `{ ok: true, summary: [] }` — array de 1 entrada por org processada | **cada entrada do array ganha `{ orgId, ok: boolean, erro?: string }`** — a org que falhou aparece no array com `ok: false`, não some dele |
    | `sla-alerts/route.ts` | `{ ok: true, summary: [] }` — mesma forma | **mesmo tratamento**: `{ orgId, ok: boolean, erro?: string }` por entrada |

    Isto não é preciosismo de contagem: sem um campo **nomeado**, a implementação natural do
    padrão `catch { console.error(...); continue }` devolve **200 com corpo limpo**, trocando
    "aborta tudo, ruidosamente" por "erra em silêncio" — pior que o defeito original. O carrasco
    da verificação abaixo afirma **sobre o corpo da resposta** (`falhas >= 1` ou `ok: false`
    presente, com identificação de qual item/org), não só "o 2º item rodou".

  **Verificação (mutação que reprova, por arquivo — teste novo onde não existe, extensão onde
  já existe):**
  - `email-automations`, `email-queue`, `obras-approval-reminder`, `sla-alerts`: **não têm
    `.test.ts` hoje** (medido) — criar um teste mínimo por arquivo com 2 itens no loop (2
    orgs/2 automations/2 configs), o primeiro lançando uma exceção sintética (mock de query
    retornando erro, ou campo ausente que quebra um `.toFixed()`/acesso), o segundo processando
    normalmente → **o corpo da resposta** identifica o item que falhou pelo campo nomeado na
    tabela acima (`erros >= 1`, `orgs_com_erro >= 1`, ou entrada com `ok: false` no array,
    conforme o arquivo) **e** mostra o segundo item processado com sucesso; `res.status` ainda
    `200`.
  - `bolsao-rebalance.test.ts`, `roleta-retry.test.ts` (já existem): estender com o mesmo caso
    (erro na 1ª config/lead da lista, sucesso na 2ª) — controle positivo primeiro (suíte
    existente continua 100% verde), depois o caso novo, afirmando o campo de falha nomeado.
  - Reverter a mutação (tirar o `try/catch` do loop) em qualquer um dos 6 → o teste novo daquele
    arquivo fica vermelho (2º item deixa de ser processado porque o 1º lançou e abortou o loop
    inteiro).
  - Reverter só o campo de falha (manter o `try/catch`, mas fazer o `catch` só `continue` sem
    incrementar/preencher o campo nomeado) → o teste novo também fica vermelho — é o que garante
    que a implementação natural "engolir em silêncio" não passa no carrasco.
  [Source: plano aprovado, Onda 2, Passo 2, "Por que não migrar os 19" + Passo 5, tabela "quais
  migram", linha "já iteram à mão"; correção C10 de `docs/qa/po-validation-900-23.md`]

- [x] **AC8 — `docs/audits/admin-client-allowlist.json` atualizada (consequência de AC2-AC7):**

  **8.1 — Correção da referência errada (achado desta story, ver Numeração; contagem corrigida
  pelo C1 do @po — são 6, não 9), EM COMMIT PRÓPRIO, antes de 8.2-8.6 (Decisão 1, condição 3):**
  as **6** ocorrências de `900-20` nos motivos de `alvos-onda-2` (`daily-report/route.ts`,
  `nicole-agenda-reconcile/route.ts`, `nicole-health/route.ts`, `meta-ads-intelligence/route.ts`,
  `meta-capi-dispatch/route.ts`, `followup/route.ts` — a lista exata da seção Numeração) viram
  `900-23`. Este commit **não** move nenhuma entrada de seção — é só a troca de número, isolada,
  para o diff mostrar a correção separada da re-triagem de 8.2-8.6.

  **8.2 — Remoção (não realocação) de 4 entradas**, porque os arquivos deixam de chamar
  `createAdminClient()` depois de AC2 (usam o `db` escopado que `forEachActiveOrg` injeta):
  - `src/app/api/cron/daily-report/route.ts`
  - `src/app/api/cron/daily-report/route.test.ts`
  - `src/app/api/cron/nicole-agenda-reconcile/route.ts`
  - `src/app/api/cron/nicole-agenda-reconcile/route.test.ts`

  **8.3 — Realocação de `nicole-health` (AC3) de `alvos-onda-2` para `plataforma`**, motivo
  novo: *"vigia de plataforma: agrega erro de IA de todas as orgs num único canal de alerta
  administrativo; migrar para forEachActiveOrg criaria N alertas para o mesmo incidente (900-23,
  reclassificação aplicada — DEFAULT_ORG_ID removido, orgs afetadas no corpo do alerta)"*.

  **8.4 — Realocação de `meta-ads-intelligence`, `meta-capi-dispatch` (+ `.test.ts`),
  `followup`** (AC4/AC5/AC6) de `alvos-onda-2` para `itera-orgs`, com `arquivo:linha` **medido
  depois da correção** (não reutilizar as linhas antigas — o código muda de forma, as linhas
  mudam de número; medir de novo é obrigatório, mesma lição de `feedback_remedir_numeros_contra_o_banco`).

  **8.5 — Nova entrada em `itera-orgs`** para `packages/web/src/lib/tenancy/for-each-org.ts`
  (chama `createAdminClient()` para listar orgs ativas — a única query cross-org legítima do
  arquivo, AC1), motivo: *"o mecanismo em si (Passo 2, 900-23): lista organizations ativas para
  entregar a cada callback um client já escopado — a query cross-org é o ponto de entrada
  deliberado, não um vazamento"*. **Medir com `npx eslint` se `for-each-org.test.ts` também
  precisa de entrada própria** (só precisa se o arquivo de teste, e não só o mock, contiver uma
  chamada literal a `createAdminClient(` — não presumir, medir, mesmo padrão da correção B2 da
  `900-21b`).

  **8.6 — Resultado esperado, nomeado mas não travado em número exato antes da medição real:**
  `alvos-onda-2` termina só com os **3 órfãos** (`calendly-sync`, `supremo-history-sync`,
  `supremo-sync`) — **é a própria previsão do plano aprovado**, seção "Verificação ponta a
  ponta" da Onda 2: *"`alvos-onda-2` reduzido aos 3 órfãos"*. `plataforma` sobe de 16 para 17.
  `itera-orgs` sobe de 24 para pelo menos 28 (+3 implementações +1 teste do
  `meta-capi-dispatch`), mais o(s) `for-each-org.ts`/`.test.ts` conforme 8.5. **O total exato
  final é medido, não calculado em prosa aqui** — mesma disciplina que a correção B4 da `900-21b`
  impôs (a v1 daquela story errou a aritmética duas vezes por confiar em contagem manual em vez
  de programática).

  **8.7 — `scripts/admin-client-allowlist.test.ts` (da `900-21b`) precisa da asserção
  `PERMITIDOS.size` atualizada** para o novo total medido — não um número hardcoded diferente
  chutado aqui, mas a mesma asserção programática já existente, que vai recalcular sozinha contra
  o JSON e a regra ESLint.

  **Correção obrigatória C3 do @po — a afirmação "`allowlist-lint.ts` não muda" é FALSA.**
  `scripts/lib/allowlist-lint.ts:43-48` define `MINIMOS` (contagens mínimas por seção, Regra 0 —
  vivacidade). Hoje `MINIMOS["alvos-onda-2"] = 12`. A AC8.6 termina a seção em **3** (só os
  órfãos) — sem atualizar `MINIMOS`, a própria Regra 0 dispara **contra o resultado que a AC8
  declara como sucesso**, e `pnpm test scripts/admin-client-allowlist.test.ts` fica **vermelho**
  — o carrasco que a AC8 usa como prova reprova a própria entrega. As **4 regras** de
  `validarAllowlist` (a *lógica*: vivacidade, caminho duplicado, `:linha` obrigatório,
  `alvosExpiramEm` vencido) não mudam — mas os **dados** de `MINIMOS` dentro do mesmo arquivo
  **têm** que mudar:
  - `MINIMOS["alvos-onda-2"]`: `12` → `3`, com comentário no código nomeando que este é o estado
    terminal até a decisão dos 3 órfãos na Onda 3 (não um número arbitrário baixo).
  - `MINIMOS["plataforma"]` e `MINIMOS["itera-orgs"]` **sobem** para o novo piso medido em 8.6
    (não ficam parados no valor antigo) — um mínimo que fica para trás da realidade **para de
    pegar encolhimento**: uma seção caindo de 28 para 24 numa story futura passaria batida se o
    mínimo continuasse 24.

  **Verificação (mutação que reprova):**
  - `cd packages/web && npx eslint src` — baseline (ANTES desta story, herdado da `900-21b`): 0
    ocorrências de `aios/no-unscoped-admin-client` (a `900-21b` já zerou). **Depois** desta
    story: continua **0** — os arquivos que passam a chamar `createAdminClient()` de formas
    novas (`for-each-org.ts`) ou deixam de chamar (`daily-report`, `nicole-agenda-reconcile`)
    estão cobertos pela allowlist atualizada.
  - `pnpm test scripts/admin-client-allowlist.test.ts` — verde, incluindo a asserção
    `PERMITIDOS.size` contra o total novo **e** os `MINIMOS` atualizados (sem a correção C3, este
    comando fica vermelho pela Regra 0 — reproduzir o vermelho ANTES de corrigir `MINIMOS`, colar
    no Dev Agent Record, depois corrigir e reconfirmar verde).
  - **C2 — o carrasco original nascia verde: régua errada, corrigida.** `git grep -c
    '"900-20"'` (com aspas, token exato) sai **exit 1, zero saída** já em `e8ea5433`, **antes**
    de qualquer correção desta story — as ocorrências são `(900-20)` dentro da prosa do `motivo`,
    nunca um token entre aspas; a régua original mede uma forma que nunca existiu. Regra
    corrigida: `grep -c '900-20' docs/audits/admin-client-allowlist.json` (sem aspas no padrão),
    com **controle positivo obrigatório**: colar **6** (contagem real, medida na Numeração) ANTES
    da Task 8.1, e **0** DEPOIS. Sem o "antes", o "depois" não prova nada.
  [Source: `900-21b` AC1 (padrão herdado); achado da Numeração desta story; plano aprovado,
  "Verificação ponta a ponta" da Onda 2; correções C2/C3 de `docs/qa/po-validation-900-23.md`]

- [x] **AC9 — Produção não muda de comportamento (restrição inegociável do dono do produto):**

  Com uma única org (o caso real de produção hoje), todo cron corrigido nesta story dá
  exatamente a mesma resposta observável (destinatário recebe a mesma mensagem, CAPI recebe o
  mesmo evento no mesmo dataset, alerta dispara nas mesmas condições) antes e depois do deploy.
  **O banco de teste (`trifold-crm-dev`) não tem a org da Trifold** (medido pela `900-21b`: só
  `org-teste-epic-900`) — então a prova sobre o comportamento real da Trifold é **leitura contra
  produção** (read-only) ou **fixture** que reproduz a forma exata dos dados de produção (mesmos
  nomes de coluna, mesmos valores plausíveis), nunca execução destrutiva.

  **Como se prova, item a item:**
  1. **`daily-report`/`nicole-agenda-reconcile`:** produção tem 1 org ativa hoje
     (`SELECT count(*) FROM organizations WHERE is_active = true` → esperado `1`, leitura antes
     do deploy). `forEachActiveOrg` sobre 1 org ativa processa exatamente essa org — sem
     `DEFAULT_ORG_ID`/`DAILY_REPORT_ORG_ID`, o resultado é idêntico por construção (não há outra
     org para desviar o fluxo). A condição de escopo de `envList` (AC2) é satisfeita porque a
     única org ativa **é** a Trifold — `trifoldOrgId()` (literal, ou `DAILY_REPORT_ORG_ID` se
     setado) bate com o `id` dela (confirmar por leitura antes do deploy, não presumir pelo UUID
     hardcoded histórico).
  2. **`nicole-health`:** o corpo do alerta ganha um campo novo (`orgs_afetadas`) — é uma
     adição, não uma remoção; o texto anterior (tipo, ocorrências, período) continua idêntico.
     Confirmar por leitura do template de mensagem antes/depois (diff textual, não execução).
  3. **`meta-ads-intelligence`:** com 1 org ativa em `meta_ad_accounts`, o agrupamento por
     `org_id` produz **um** grupo — o loop roda exatamente 1 vez, mesmo resultado que hoje.
     **Correção R2 do @po: esta afirmação não tinha leitura que a sustentasse.** Prova:
     `SELECT count(DISTINCT org_id) FROM meta_ad_accounts WHERE status='active'` → esperado `1`.
  4. **`meta-capi-dispatch`:** coberto pela AC5.2 (Task obrigatória de seed do `dataset_id` em
     produção **antes** do deploy do código) — sem essa task, este item reprova por construção.
     Prova: `SELECT config->>'dataset_id' FROM org_integrations WHERE org_id = <trifold> AND
     provider = 'meta_capi'` devolve o mesmo valor que `process.env.META_CAPI_DATASET_ID`
     resolve hoje em produção (ou o literal `'1337310707164669'`, o que estiver de fato em uso —
     medir, não presumir).
  5. **`followup`:** com 1 org ativa, `carregarTemplatesAprovadosDaOrg` é chamada 1 vez (cache
     de execução com 1 entrada), resultado idêntico ao lookup único de hoje — a única org
     existente é, por definição, a única cujo `whatsapp_config` seria lido de qualquer forma.
     **Correção R2 do @po, ligada ao achado R1 (AC6): esta afirmação também não tinha leitura.**
     Prova: `SELECT count(*) FROM whatsapp_config WHERE status='active'` → esperado `1` — se vier
     `> 1`, o item 5 desta AC **e** o diagnóstico da AC6 mudam (o follow-up por template já
     estaria quebrado hoje, antes de qualquer deploy desta story).
  6. **Os 6 arquivos da AC7:** isolamento de erro é aditivo — só muda o comportamento quando um
     erro acontece no meio do loop (hoje aborta tudo; depois, isola). Com produção saudável
     (sem erros no meio do processamento), o resultado é idêntico. Não há como provar "quando
     dá erro" sem produzir um erro sintético — a prova aqui é a suíte de teste da AC7 (mutação
     controlada em fixture), não produção.

  **Correção obrigatória R3 do @po — "0 regressão em suíte pré-existente" é uma promessa falsa
  como estava escrita, e há prova. Reescrita como "efeito observável idêntico", nomeando as 3
  asserções cuja FORMA muda (não a garantia):**
  - `daily-report/route.test.ts:103-104` (`expect(json.skipped).toBeTruthy()` no nível raiz do
    corpo) — sob o helper, o corpo vira por-org; a asserção navega até o item da org em vez de
    ler a raiz. A garantia ("zero destinatário é explícito, nunca silencioso") não muda.
  - `nicole-agenda-reconcile/route.test.ts:176` (`expect(body.dry).toBe(true)` no topo) — vira
    `expect(body.resultados[0].dry).toBe(true)` (AC2, `?dry=1`/R4). A garantia ("dry run não tem
    efeito colateral") não muda.
  - `nicole-agenda-reconcile/route.test.ts:308` (`expect(await res.json()).toEqual({ error:
    "timeout lendo messages" })`, igualdade exata do corpo inteiro) — vira uma asserção que
    navega até `resultados[0].erro` (ou equivalente) contendo a mensagem, em vez de comparar o
    objeto raiz inteiro. A garantia ("a mensagem de erro real chega ao corpo da resposta") não
    muda.

  Sem nomear as três, o @dev "conserta os testes" durante a implementação e ninguém percebe qual
  garantia se moveu de lugar — exatamente o padrão que este item existe para prevenir.

  **Verificação (mutação que reprova, célula de vivacidade obrigatória):**
  - `pnpm test` completo (não só os arquivos tocados) — zero regressão **de efeito observável**
    (não de forma textual de asserção — as 3 exceções nomeadas acima mudam de forma por desenho).
  - Célula de vivacidade **antes** de qualquer leitura de produção "não mudou": alterar
    temporariamente (em ambiente local, nunca gravado em produção) um valor de fixture de teste
    para provar que a asserção de igualdade usada realmente falha quando os valores divergem —
    mesma lição da `900-21b` (B5): "diff vazio entre duas capturas que nunca aconteceram é verde
    igual". Confirmado pelo @po: a célula desta AC mexe em fixture de teste, nunca no banco —
    sem `UPDATE`, sem gatilho de `updated_at`, sem resíduo (diferente da armadilha que a `900-21b`
    encontrou consigo mesma).
  - **As 5 leituras read-only de produção** (corrigido de 3 para 5 — R2 do @po) citadas nos
    itens 1, 3, 4 e 5 acima (contagem de orgs ativas, id da org da Trifold, `dataset_id` em uso
    hoje, contagem distinta de `meta_ad_accounts` ativas por org, contagem de `whatsapp_config`
    ativas), coladas no Dev Agent Record — **antes** de qualquer deploy desta story.
  - **C6 (herdado de AC2) — as duas rotas migradas têm teste de `res.status`/corpo por cenário de
    orgs**, não só a função pura `statusHttpParaResumo` isolada (ver AC1/AC2).
  [Source: pedido central do dono do produto, restrição inegociável desta story; padrão AC6 da
  `900-21b`; correções R2/R3/C6 de `docs/qa/po-validation-900-23.md`]

- [x] **AC10 — `trifoldOrgId()` é exceção nomeada, com casa certa, prazo e catraca
  ([@po] revalidação 2026-08-29 — condição do GO):**

  O módulo compartilhado é a decisão **certa** (uma declaração do literal vence duas duplicadas, e
  a comparação é a mesma nos dois crons). Mas ele **reintroduz um identificador fixo da Trifold no
  código**, que é exatamente o que a FR-11/§900-20 existe para eliminar. Um identificador assim é
  aceitável como *marcador de plataforma temporário*; não é aceitável como arquivo comum. Três
  condições, todas verificáveis:

  **10.1 — Casa certa: `packages/web/src/lib/tenancy/trifold-org.ts`, não `lib/reports/`.**
  O módulo é importado pelo `nicole-agenda-reconcile`, que não é um relatório — e, mais
  importante, `lib/tenancy/` é onde o gate de tenancy, o §900-20 e qualquer revisor de
  multi-tenancy vão procurar. Exceção de tenancy guardada em `lib/reports/` é exceção num lugar
  que ninguém audita. Fica ao lado de `for-each-org.ts`, que é o vizinho conceitual real.

  **10.2 — O cabeçalho do módulo declara que é exceção, e quem a mata.** JSDoc que só diz o que a
  função faz não distingue "marcador temporário" de "constante de negócio". O cabeçalho tem que
  dizer, em texto:
  - **o que é:** marcador de *qual das orgs ativas é a Trifold*, usado só para escopar **canais
    globais de notificação** (`DAILY_REPORT_RECIPIENTS` e o Telegram administrativo) — nunca para
    decidir *qual org processar*, que é o papel que o `DEFAULT_ORG_ID` tinha e que morreu aqui;
  - **por que existe:** os dois canais têm **um destino único por env**, sem destino por org — e
    sem o marcador, iterar orgs manda dado da org B para o destino da Trifold (o vazamento da C5);
  - **quem o mata:** destino por org em `org_integrations` (`provider = 'telegram'` já existe desde
    a migration `246`; `resolveIntegration` é da `900-47`/Onda 7) para o Telegram, e a
    aposentadoria de `DAILY_REPORT_RECIPIENTS` em favor da tela de Configurações para o relatório.
    Enquanto os dois canais forem globais, o marcador fica — **e o cabeçalho diz isso, para o
    próximo leitor não achar que é permanente por omissão.**

  **10.3 — Catraca, não medição de uma vez.** A R11 pede os greps colados no Dev Agent Record:
  isso mede **hoje** e não impede o **próximo** UUID. Teste novo (mesma forma de
  `scripts/admin-client-allowlist.test.ts`, que já varre `src` e compara com um conjunto
  declarado): o literal `00000000-0000-0000-0000-000000000001` aparece em **exatamente** o
  conjunto declarado de arquivos, escrito no próprio teste com uma linha de justificativa por
  arquivo. Medido em `e8ea5433`: **7 ocorrências em 7 arquivos** — 3 de implementação
  (`daily-report/route.ts`, `nicole-agenda-reconcile/route.ts`, `nicole-health/route.ts`) e 4 de
  teste (`daily-report/route.test.ts`, `nicole-agenda-reconcile/route.test.ts`,
  `analytics-report/route.test.ts`, `properties/nicole-enabled.test.ts`). Depois desta story o
  conjunto de **implementação** é `lib/tenancy/trifold-org.ts` + `nicole-health/route.ts` — dois,
  nomeados. Um terceiro arquivo de implementação com o literal **reprova o teste**, que é a
  diferença entre "medimos" e "não cresce".
  **Mutação que reprova:** acrescentar o literal a um arquivo qualquer de `src` (ou remover um do
  conjunto declarado sem removê-lo do código) → o teste fica vermelho, nomeando o arquivo.

  **10.4 — `trifoldOrgId()` não lê `DAILY_REPORT_ORG_ID`.** A AC2 comemora, com razão, ter fechado
  a dependência cruzada de o `nicole-agenda-reconcile` usar o env var de **outro** cron como
  fallback de org — e a v2 a **recria, mais larga**: com `trifoldOrgId()` lendo
  `DAILY_REPORT_ORG_ID`, apontar o relatório diário para outra org passa a redirecionar também
  **para onde vai o Telegram do cron da agenda**, em silêncio. É a mesma classe da C5, um nível
  acima. Correção:
  ```ts
  // lib/tenancy/trifold-org.ts — sem env, um literal só
  export function trifoldOrgId(): string { return "00000000-0000-0000-0000-000000000001" }
  ```
  e o `daily-report` compõe **localmente** o que é dele:
  `const orgDaEnvDeRecipients = process.env.DAILY_REPORT_ORG_ID ?? trifoldOrgId()`.
  Comportamento de produção idêntico (a leitura da AC9 item 1 confirma se a env está setada), e o
  env de um cron deixa de governar o canal de outro.
  **Mutação que reprova:** setar `DAILY_REPORT_ORG_ID` para um id diferente no teste do
  `nicole-agenda-reconcile` → o despacho de Telegram **não** muda de org (com a correção); sem
  ela, muda — e é esse o vermelho.

  [Source: revalidação `docs/qa/po-validation-900-23.md`; FR-11/§900-20 do epic; migration `246`
  (`provider = 'telegram'`)]


---

## Tasks / Subtasks

*(ordem: Task 1 é pré-requisito de tudo. Tasks 2-3 dependem de Task 1. Tasks 4-6 são
independentes entre si e podem rodar em paralelo. Task 7 depende de 2-6 completas. Task 8
depende de `900-21b` mergeada — ver Metadata "Depends on". Task 8.0a é a condição 2 da Decisão 1
do parecer do @po e é a ÚNICA subtask desta story que toca um arquivo da `900-21b`.)*

- [x] **Task 1 — `forEachActiveOrg` (AC1)**
  - [x] 1.1 Escrever `packages/web/src/lib/tenancy/for-each-org.ts` com as 5 propriedades.
  - [x] 1.2 Escrever `packages/web/src/lib/tenancy/for-each-org.test.ts` com as 5 mutações + o
    controle positivo + o teste de identidade por sentinela (C7) + o teste de rejeição na
    listagem de orgs (C8) + o teste de `concurrency` inválido rejeitando antes de processar
    qualquer org (R6).
  - [x] 1.3 `pnpm test packages/web/src/lib/tenancy/for-each-org.test.ts` — colar saída.

- [x] **Task 2 — Migração de `daily-report`/`nicole-agenda-reconcile` (AC2)**
  - [x] 2.0 Criar **`packages/web/src/lib/tenancy/trifold-org.ts`** com `trifoldOrgId()` — literal
    puro, **sem** ler `DAILY_REPORT_ORG_ID` (AC10.1/10.4), com o cabeçalho de exceção da AC10.2.
  - [x] 2.1 Reescrever `daily-report/route.ts` sobre `forEachActiveOrg` + `trifoldOrgId()`.
  - [x] 2.2 Reescrever `nicole-agenda-reconcile/route.ts` sobre `forEachActiveOrg`, **mantendo**
    o `try/catch` interno do callback que emite `NICOLE_LASTRO_FALHA` e relança (C4) e escopando
    o despacho de `sendTelegramAdminAlert` a `org.id === trifoldOrgId()` (C5) — as outras orgs só
    gravam `system_events`.
  - [x] 2.3 Atualizar/estender `route.test.ts` dos dois com: cenário de 2 orgs; os 3 casos de
    Propriedade 5 na rota (C6 — 1 falha/200, todas falham/500, 0 orgs ativas/200+zero chamadas);
    o teste de `dedupe_key` com 2 orgs e 2 chaves distintas (R5); a preservação de
    `NICOLE_LASTRO_FALHA` (C4); o não-vazamento de PII de outra org no Telegram (C5); e a
    correção de forma das 3 asserções nomeadas em AC9/R3 (`daily-report/route.test.ts:103-104`,
    `nicole-agenda-reconcile/route.test.ts:176` e `:308`).
  - [x] 2.4 `grep -n "DEFAULT_ORG_ID"` nos dois arquivos → colar saída (esperado vazio).
  - [x] 2.5 `grep -c "00000000-0000-0000-0000-000000000001"` em `daily-report/route.ts`,
    `nicole-agenda-reconcile/route.ts` e `lib/tenancy/trifold-org.ts` → colar antes/depois (R11).

- [x] **Task 3 — `nicole-health` reclassificado (AC3)**
  - [x] 3.1 Renomear `DEFAULT_ORG_ID` → `PLATFORM_ALERT_ORG_ID` (2 usos que sobrevivem: canal de
    entrega e `alertarAdminWhatsApp`).
  - [x] 3.2 Adicionar `org_id` ao `select` de `system_events`; `orgsAfetadas` na agregação;
    campo no corpo do alerta.
  - [x] 3.3 Remover `org_id: DEFAULT_ORG_ID` dos 2 `logEventOnce` do próprio alerta (viram
    `org_id: undefined`).
  - [x] 3.4 `pnpm test src/app/api/cron/nicole-health/route.test.ts` (**17** casos existentes —
    corrigido de 27, C1 — + 1 novo de `orgs_afetadas`) — colar saída.
  - [x] 3.5 `grep -c "00000000-0000-0000-0000-000000000001"` em `nicole-health/route.ts` → 1
    antes, 1 depois (R11).

- [x] **Task 4 — `meta-ads-intelligence` (AC4) — @dev**
  - [x] 4.1 Agrupar `accounts` por `org_id`; envolver o corpo em loop com try/catch por org.
  - [x] 4.2 `meta_sync_log` insert/update por org.
  - [x] 4.3 Criar `route.test.ts` (não existe hoje) com o cenário de 2 orgs (uma falha, outra
    sucede) **e** a asserção de que `meta_alerts` recebe o `org_id` correto por org (R7).

- [x] **Task 5 — `meta-capi-dispatch` + `sendCapiEvents` (AC5, AC5.1, AC5.2) — @dev**
  - [ ] 5.0 **(bloqueante, antes do deploy)** ⚠️ PARCIAL (ver Dev Agent Record — a Vercel de produção não é legível desta máquina) Confirmar com leitura em produção qual `dataset_id`
    está de fato em uso hoje (env setada, ou literal de fallback) — colar no Dev Agent Record.
  - [x] 5.1 Estender `SendCapiEventsOptions` com `datasetId?` em `packages/shared/src/meta/capi-client.ts`.
  - [x] 5.2 `select` do outbox ganha `org_id`; agrupar por org; try/catch por org.
  - [x] 5.3 `select` de `leads` ganha `.eq("org_id", orgId)` mantendo o `.in("id", …)`.
  - [x] 5.4 Resolver `dataset_id` via `org_integrations` (provider `meta_capi`), fail-safe se a
    query errar.
  - [x] 5.5 Sem dataset → `skipped`/`capi_nao_configurado`, **mais** `logEvent`
    `CAPI_ORG_SEM_DATASET` uma vez por org por execução (C9) — sem chamar `sendCapiEvents`.
  - [x] 5.6 Atualizar `route.test.ts` existente com os 2 novos cenários (2 orgs, dataset
    ausente) + a asserção do `logEvent` de C9.
  - [x] 5.7 `pnpm test packages/shared/src/meta/capi-client.test.ts
    src/app/api/cron/meta-capi-dispatch/route.test.ts` — colar saída.

- [x] **Task 6 — `followup` (AC6) — @dev**
  - [x] 6.0 **(bloqueante, antes de codar)** Medir em produção: `SELECT count(*) FROM
    whatsapp_config WHERE status='active'` — se `> 1`, registrar que o follow-up por template já
    está quebrado hoje (R1), independente desta story.
  - [x] 6.1 Extrair `carregarTemplatesAprovadosDaOrg(supabase, orgId)`, com `.eq("org_id", orgId)`
    **e** `.eq("status","active")` — não descartar `error` do `maybeSingle()`.
  - [x] 6.2 Cache por execução (`Map<orgId, Map<template,body>>`) dentro do loop de `rules`.
  - [x] 6.3 Teste novo cobrindo: o cache (1 chamada por org distinta, não por regra), o
    isolamento de corpo de template entre 2 orgs, **e** o fake honrando `maybeSingle()` com 2+
    linhas devolvendo erro (R1) — reproduzindo o defeito de hoje antes de aplicar o filtro de
    `org_id`, depois confirmando que o filtro o fecha.

- [x] **Task 7 — Isolamento de erro nos 6 arquivos (AC7) — @dev**
  - [x] 7.1 `email-automations`: try/catch nos 2 loops (`:61`, `:116`) + campo `erros`.
  - [x] 7.2 `email-queue`: try/catch em `:53` (campo `failed` já existe, só o caminho de
    incremento faltava).
  - [x] 7.3 `obras-approval-reminder`: try/catch em `:52` + campo `orgs_com_erro`.
  - [x] 7.4 `roleta-retry`: try/catch em `:74` + campo `erros`.
  - [x] 7.5 `bolsao-rebalance`: try/catch em `:70` (externo ao existente nas folhas) + cada
    entrada do array `summary` ganha `{ orgId, ok, erro? }`.
  - [x] 7.6 `sla-alerts`: try/catch em `:110` (externo ao existente nas folhas) + mesmo
    tratamento de `summary` do item 7.5.
  - [x] 7.7 Testes novos para os 4 sem `.test.ts` hoje (`email-automations`, `email-queue`,
    `obras-approval-reminder`, `sla-alerts`); extensão dos 2 existentes
    (`bolsao-rebalance.test.ts`, `roleta-retry.test.ts`) — cada um afirmando **sobre o campo de
    falha nomeado no corpo da resposta** (C10), não só "o 2º item rodou".

- [x] **Task 8 — Allowlist (AC8) — @dev**
  - [x] 8.0 Confirmar `900-21b`/PR #526 mergeada (Metadata, "Depends on" item 1) antes de editar
    o JSON — evita conflito de merge no mesmo arquivo.
  - [x] 8.0a **(condição 2 da Decisão 1 do @po, único ponto de contato com a `900-21b`)**
    Adicionar uma linha ao Change Log de `docs/stories/900-21b-allowlist-retriada-e-org-integrations.story.md`
    reconhecendo que `docs/audits/admin-client-allowlist.json` subiu com 6 referências a
    `900-20` em vez de `900-23` (palpite hedgeado em Dev Notes que atravessou para o artefato
    commitado sem checagem de colisão) e apontando esta story (`900-23`) como a correção.
  - [x] 8.1 **(commit próprio, antes de 8.2-8.6 — condição 3 da Decisão 1)** Corrigir as **6**
    referências `900-20` → `900-23` (lista exata na seção Numeração). Rodar `grep -c '900-20'
    docs/audits/admin-client-allowlist.json` ANTES (esperado `6`) e DEPOIS (esperado `0`) — colar
    os dois (C2).
  - [x] 8.2 Remover as 4 entradas (`daily-report`, `nicole-agenda-reconcile`, + `.test.ts`).
  - [x] 8.3 Mover `nicole-health` para `plataforma`.
  - [x] 8.4 Mover `meta-ads-intelligence`, `meta-capi-dispatch` (+ `.test.ts`), `followup` para
    `itera-orgs`, com `arquivo:linha` remedido pós-correção.
  - [x] 8.5 Adicionar `for-each-org.ts` (e `.test.ts` se medido necessário) em `itera-orgs`.
  - [x] 8.6 **Atualizar `MINIMOS` em `scripts/lib/allowlist-lint.ts`** (C3):
    `alvos-onda-2: 12 → 3` (com comentário nomeando o estado terminal até a Onda 3), `plataforma`
    e `itera-orgs` subidos para o novo piso medido em 8.2-8.5.
  - [x] 8.7 `cd packages/web && npx eslint src` → colar saída, confirmar 0 ocorrências de
    `aios/no-unscoped-admin-client`.
  - [x] 8.8 Atualizar a asserção `PERMITIDOS.size` em `scripts/admin-client-allowlist.test.ts`
    para o total medido; rodar `pnpm test scripts/admin-client-allowlist.test.ts` **antes** de
    8.6 (esperado vermelho pela Regra 0/`MINIMOS` desatualizado — colar) e **depois** de 8.6
    (esperado verde — colar).

- [x] **Task 9 — Não-regressão + ordem de deploy do CAPI (AC9, AC5.2) — @dev + @devops**
  - [x] 9.1 Ler produção (read-only), as **5** consultas da AC9: contagem de orgs ativas, id da
    org da Trifold, `dataset_id` em uso, contagem distinta de `meta_ad_accounts` ativas,
    contagem de `whatsapp_config` ativas — colar no Dev Agent Record, **antes** de qualquer
    deploy.
  - [x] 9.2 `pnpm test` completo — colar saída, zero regressão de efeito observável (as 3
    exceções de forma nomeadas em AC9/R3 são esperadas e não contam como regressão).
  - [ ] 9.3 **(bloqueante — @devops/@data-engineer)** ⛔ NÃO EXECUTADA (ver Dev Agent Record) Seed do `org_integrations.config.dataset_id`
    da Trifold em produção, com o valor confirmado em 9.1, via `UPDATE ... RETURNING org_id,
    config->>'dataset_id'` — colar a linha devolvida (rowcount = 1) **e** um `SELECT` de leitura
    separado logo depois, **antes** do deploy do código da AC5 (Decisão 2, Peça 1).
  - [x] 9.4 Declarar no Dev Agent Record a ordem de deploy seguida (migration `246` já em
    produção via `900-21b` → seed 9.3 → deploy do código desta story) **e o plano B**: se 9.1/9.3
    não puderem ser concluídas no dia planejado, o código da AC5 (`meta-capi-dispatch` +
    `sendCapiEvents`) sai desta entrega e vai em PR separado — as demais ACs (1-4, 6-8) não têm
    essa dependência e podem seguir (Decisão 2, Peça 3).
  - [ ] 9.5 ⛔ NÃO EXECUTADA (depende do deploy) — **(pós-deploy, depois da primeira execução do `meta-capi-dispatch` corrigido em
    produção)** `SELECT count(*) FROM meta_capi_outbox WHERE status='skipped' AND
    last_error='capi_nao_configurado'` → esperado `0` para a org da Trifold — colar (Decisão 2,
    Peça 2; C9).

- [x] **Task 10 — `trifoldOrgId()` como exceção nomeada (AC10) — @dev**
  - [x] 10.1 Criar/mover o módulo para `packages/web/src/lib/tenancy/trifold-org.ts` (nunca
    `lib/reports/`); os dois crons importam de lá.
  - [x] 10.2 Escrever o cabeçalho de exceção (o que é, por que existe, quem o mata —
    `org_integrations.provider='telegram'` + aposentadoria de `DAILY_REPORT_RECIPIENTS`).
  - [x] 10.3 Escrever o teste de catraca do literal (conjunto declarado de arquivos, uma
    justificativa por arquivo) e rodar a mutação: acrescentar o literal num arquivo qualquer de
    `src` → vermelho nomeando o arquivo; remover → verde. Colar as duas saídas.
  - [x] 10.4 `trifoldOrgId()` sem `process.env`; o `daily-report` compõe
    `process.env.DAILY_REPORT_ORG_ID ?? trifoldOrgId()` localmente. Teste do
    `nicole-agenda-reconcile` com `DAILY_REPORT_ORG_ID` apontando para outro id → o destino do
    Telegram **não** muda.

---

## Dev Notes

### `packages/web/src/lib/tenancy/for-each-org.ts`, não `guard.ts`
Ver AC1. `guard.ts` não existe no repositório hoje; `platform-guard.ts` já ocupa o radical
"guard" com sentido de autorização (`requirePlatformAdmin`). O epic (`§900-23`) cita
`lib/tenancy/guard.ts` — é uma imprecisão herdada do desenho original, corrigida aqui pela mesma
razão que outras stories desta série já corrigiram detalhes do epic quando a medição real
diverge (ver `900-21b`, correção do índice de roteamento reverso de `whatsapp`).

### `concurrency` — por que o tipo aceita o parâmetro mas só `1` funciona
Ver AC1, Propriedade 3. A alternativa (nem aceitar o parâmetro) fecharia a porta para uma Onda
futura de escala de plataforma decidir paralelizar com um limite real (`p-limit`-like) sem
quebrar a assinatura de quem já chama `forEachActiveOrg`. A alternativa (aceitar e ignorar
silenciosamente) prometeria uma garantia que não existe — pior. Lançar com o valor nomeado na
mensagem é o meio-termo: quem tentar usar `concurrency: 3` hoje descobre imediatamente, no teste,
que não está implementado — não em produção, sob carga.

### Por que só 2 dos "3 travados" migram para o helper, e o terceiro não
`nicole-health` está listado como "travado" na allowlist da `900-21b` — mas a própria entrada já
carrega a ressalva "reclassificação, não migração" (correção C5 daquela story). Esta story
**preserva** essa decisão, não a reabre — só a executa (o texto já estava certo, faltava o
código). Ver AC3.

### Por que o `try/catch` interno do `nicole-agenda-reconcile` sobrevive dentro do callback (C4)
A tentação ao migrar um cron para `forEachActiveOrg` é apagar o `try/catch` local — "o helper
agora trata isso". Para a maioria dos crons isso é verdade. `nicole-agenda-reconcile` é a
exceção: ele tem uma AC de OUTRA story (87-6) amarrada a um efeito colateral específico do
`catch` (emitir `NICOLE_LASTRO_FALHA` **antes** do 500, para o dia não ficar indistinguível de
"o agendador não disparou" — o incidente que custou 4 dias de diagnóstico). O helper só sabe
"a org X falhou, com esta mensagem" — não sabe que, para *este* cron especificamente, a falha
também precisa virar um evento nomeado com semântica própria. **A regra geral, para qualquer
story futura que migre um cron para o helper:** antes de apagar um `try/catch` local, perguntar
se ele faz algo além de logar o erro genérico — se fizer (evento nomeado, compensação, métrica
específica), ele fica, emite o efeito colateral, e **relança** para o helper continuar
contabilizando a falha na Propriedade 1. Apagar sem perguntar é como o `NICOLE_LASTRO_FALHA`
teria desaparecido em silêncio.

### O vazamento de Telegram — a mesma armadilha do `daily-report`, negada na segunda rota (C5)
A v1 desta AC2 tratou `daily-report` e `nicole-agenda-reconcile` como tendo riscos diferentes —
"um tem env global de destinatários, o outro não tem lista configurável, então não vaza". A
segunda metade da frase está certa como fato e errada como conclusão: **"não ter destino por
org" é exatamente por que tudo cai no destino único que existe.** O padrão generaliza para
qualquer canal de notificação administrativa (Telegram, WhatsApp de admin, e-mail de time) que um
cron futuro migre para o helper: se o canal é um único destino fixo por env, migrar para
multi-org sem escopar QUEM recebe o quê recria o vazamento do `daily-report`, só que num canal
diferente. A pergunta a fazer, para todo canal assim: "quando a org B gerar este alerta, ele vai
para onde, e é apropriado que vá para lá?"

### `sendCapiEvents` — extensão aditiva, `form-capi.ts` fora do escopo
`packages/web/src/lib/meta/form-capi.ts` é o outro chamador de `sendCapiEvents`
(Story 86-11/86-12, CAPI disparado a partir do formulário da landing page, fluxo sem outbox nem
cron). A extensão de `SendCapiEventsOptions` com `datasetId?` é opcional — `form-capi.ts` não
precisa mudar uma linha, e continua lendo o dataset do jeito que lê hoje (env/fallback). Se uma
story futura quiser dataset por org também nesse fluxo, a assinatura já está pronta para isso —
mas decidir SE isso é necessário é fora da autoridade e do escopo desta story.

### Ordem de deploy — a dependência mais delicada desta story, agora com 3 peças verificáveis (Decisão 2)
A AC5/AC5.2/AC9 formam uma cadeia: `900-21b` mergeada → migration `246` aplicada em **produção**
(Task 2.6 daquela story, do `@devops`, estava pendente no momento deste draft) → seed do
`dataset_id` real da Trifold em `org_integrations`, **com `RETURNING` e leitura de confirmação**
(Task 9.3) → só então o deploy do código do `meta-capi-dispatch` corrigido → **checagem
pós-deploy** confirmando `0` linhas `skipped`/`capi_nao_configurado` para a Trifold (Task 9.5).
Errar essa ordem não quebra nada de forma ruidosa (o código é fail-safe, AC5 item 4) — **quebra
silenciosamente**, exatamente a classe de defeito que a Onda 2 inteira existe para eliminar: a
Trifold para de receber eventos CAPI, sem erro 500, sem alerta (até a C9, `CAPI_ORG_SEM_DATASET`,
existir), só `skipped`/`capi_nao_configurado` empilhando na outbox. O @po mediu que a v1 desta
story tratava a ordem certa como *desejo* ("Task obrigatória, antes do deploy") sem os
instrumentos que provam que ela foi seguida — um `UPDATE` que não acha a linha afeta 0 linhas e
não diz nada; **"deve existir" não é prova, `RETURNING` é.** Se o seed não puder acontecer no dia
planejado, o plano B (Task 9.4) é deploy dividido — o código da AC5 não sobe sozinho sem o seed
confirmado antes dele.

### `role_default_permissions`, órfãos, webhooks e correções do épico continuam fora
Nenhuma mudança de escopo em relação ao que a `900-21b` já registrou como dívida — esta story não
resolve `role_default_permissions` (pendente de `900-21`), não decide o destino dos 3 órfãos
(Onda 3), e não toca nenhum webhook (Passo 4, `900-24`). **R10 do parecer do @po** aponta duas
correções que o próprio épico precisa (`§900-23` ainda diz "37 crons migrados"; `epic-900:845`
diz `Dep: 900-20` para a `900-23`, que deveria ser `Dep: 900-21b`) — **o @po assumiu essas duas
correções como de sua própria alçada** (gestão de contexto do epic), não desta story. Registrado
aqui só para quem ler esta story depois não estranhar que o épico continua com os dois erros até
o @po aplicá-los.

### Débitos nomeados, não corrigidos nesta story (R8, R9)
- **R8 — `meta_ad_accounts` não filtra `organizations.is_active`.** Uma org suspensa (dívida em
  atraso, plano cancelado) com contas Meta `status='active'` continua sendo sincronizada e
  gerando alertas pelo `meta-ads-intelligence`. Custo de Graph API para uma org que não deveria
  mais estar sendo servida. Fora do corte desta story ("resultado errado hoje" para as orgs
  ativas reais) — candidato a AC de uma story de entitlement (Onda 3).
- **R9 — o lote do `meta-capi-dispatch` é global e FIFO** (`BATCH_SIZE = 50`, agendado a cada 3
  minutos). Uma org com backlog grande de outbox monopoliza o lote das outras orgs. Volume atual
  (~22 leads/mês, medido) torna isso teórico — não uma AC desta story, só um limite conhecido do
  desenho atual para quem for revisitar o `meta-capi-dispatch` quando o volume crescer.

### Testing Standards
Vitest puro para tudo (`packages/web/src/**/*.test.ts`, já incluído em `vitest.config.ts`), sem
dependência de banco — mesmo padrão de `admin-invite.test.ts`/`nicole-health/route.test.ts`
(fakes locais por arquivo, honrando `.eq()`/`.order()`/`.limit()`/`.maybeSingle()` de verdade —
**não** um fake compartilhado extraído, essa extração é escopo do Passo 6, fora desta story). O
carrasco de completude da allowlist (AC8) é `npx eslint src`, não Vitest — mesmo padrão B2 da
`900-21b`.

---

## Testing

### Abordagem
- **AC1 (`forEachActiveOrg`):** Vitest puro, fixture em memória, sem banco — as 5 mutações têm
  que reprovar quando a propriedade correspondente é revertida, incluindo a identidade por
  sentinela (C7), a rejeição na listagem (C8) e a rejeição pré-processamento de `concurrency`
  inválido (R6).
- **AC2-AC7 (crons):** Vitest com `vi.mock` de `@web/lib/supabase/admin`/`@web/lib/logger`
  (mesmo padrão de `nicole-health/route.test.ts`), fixtures com **duas** organizações sempre que
  a AC afirma isolamento — uma fixture com uma organização só não distingue "filtrou certo" de
  "não filtrou" (lição já registrada na memória do epic). Toda mutação que reprova precisa ter o
  vermelho reproduzido antes de reverter, mesma disciplina de `900-21b`. As rotas migradas
  (`daily-report`, `nicole-agenda-reconcile`) precisam de asserção de `res.status`/corpo por
  cenário (C6), não só a função pura de AC1.
- **AC8 (allowlist):** `pnpm test scripts/admin-client-allowlist.test.ts` (já existe, da
  `900-21b`) + `npx eslint src` como comando real. Rodar a suíte **antes** de corrigir `MINIMOS`
  (C3) para confirmar o vermelho, só então corrigir e reconfirmar verde.
- **AC9 (não-regressão):** `pnpm test` completo (efeito observável, não forma textual — 3
  exceções nomeadas em R3) + as **5** leituras read-only de produção (R2) coladas no Dev Agent
  Record, capturadas **antes** de qualquer deploy.

---

## Dev Agent Record

**Agent Model Used:** Claude Opus 5 (1M context) · @dev (Dex) · YOLO
**Branch:** `story/900-23-foreachactiveorg-crons`

### [AUTO-DECISÃO] Base da branch — `origin/main` + `e8ea5433` (o commit da `900-21b`)

A instrução do lead era criar a branch a partir de `origin/main`. Medido antes de começar:
`origin/main` **não contém** o substrato da AC8. `git ls-tree origin/main` mostra
`docs/audits/admin-client-allowlist.json` ainda no formato anterior à re-triagem (chaves
`legitimos` + `legado`, **sem** `plataforma`/`itera-orgs`/`alvos-onda-2`), e
`scripts/lib/allowlist-lint.ts` e `scripts/admin-client-allowlist.test.ts` **não existem lá** —
os três vivem só no PR #526. Reconfirmado no dia (`gh pr list`): **#526 continua aberto**,
`MERGEABLE`, `CLEAN`.

Com a branch em `origin/main` puro, a AC8 inteira (e a Task 8.8, que exige o vermelho da própria
catraca) seria insatisfazível — e, pior, mergear esta story depois do #526 deixaria
`MINIMOS["alvos-onda-2"] = 12` reprovando uma seção com 3 entradas: `pnpm test` **vermelho na
`main`**, causado por esta story. Como `e8ea5433` é literalmente `origin/main` (`77f225d1`) **+ 1
commit** — o head do #526, que a própria Metadata declara como dependência obrigatória —, a base
escolhida foi `e8ea5433`. É o desvio mínimo que torna a story executável.
**Consequência para o `@devops`: o PR desta story tem de entrar depois do #526** (ou com base
nele); mergeá-la antes levaria o conteúdo do #526 para a `main` por dentro deste PR.

### Task 1 — `forEachActiveOrg` (AC1)

`packages/web/src/lib/tenancy/for-each-org.ts` + `for-each-org.test.ts` — **15 testes, 15 verdes**.
As 6 mutações rodadas, cada uma restaurada e reconfirmada verde depois:

| # | Mutação aplicada | Resultado |
|---|---|---|
| M1 | `catch` relança (isolamento morre) | 🔴 **3 falham** / 12 passam |
| M2 | chama a fábrica, descarta o retorno e entrega `admin` cru ao callback (C7) | 🔴 **1 falha** / 14 passam |
| M3 | `for … await` → `Promise.all` | 🔴 **1 falha** / 14 passam |
| M4 | remove o `logEvent` de resumo | 🔴 **1 falha** / 14 passam |
| M5 | engole o `error` da listagem e devolve `data ?? []` (C8) | 🔴 **1 falha** / 14 passam |
| M6 | remove a validação de `concurrency` (R6) | 🔴 **2 falham** / 13 passam |
| — | **restaurado** | ✅ **15/15** |

C7 é por **identidade**: o mock de `createOrgScopedAdminClient` memoiza a sentinela num `Map`
(ressalva do @po — sem isso `toBe` compararia instâncias), e o teste captura o `db` **dentro do
callback** afirmando `db === sentinela(org.id)` em cada invocação, mais
`recebidos[0].db !== recebidos[1].db`.
C8 é o **par que discrimina**: erro de listagem `rejects.toThrow(/connection refused/)` com **zero**
callbacks, contra zero orgs ativas que **resolve** com `total: 0` e status 200.

**Divergência com a AC1 — resolvida na rodada do gate, não deixada como dívida.** A AC1 prescrevia
`logEvent` (fire-and-forget), e `lib/logger.ts:49-55` — escrito pela própria Story 87-6 — avisa que
numa lambda a promise pendente morre no `return` do handler. **O `CRON_RESUMO` é exatamente a
última escrita antes do response**, o caso que custou o recibo `NICOLE_LASTRO_DIARIO` perdido em
produção. Meu bloqueio alegado na primeira rodada ("o carrasco da Propriedade 4 conta chamadas de
`logEvent`") **não se sustentava**: `dedupe_key` é **opcional** em `logEventOnce`
(`logger.ts:100-101`), então sem chave o índice parcial nem toca a linha — é um insert normal,
só que aguardado. O helper usa `await logEventOnce(...)` nas 3 escritas.

O que estava em jogo não era o evento perdido: era **congelar o padrão errado num mecanismo
compartilhado que todo cron que migrar vai copiar**.

**Carrasco do `await`, não da chamada** (era o furo real): o duplo de `logEventOnce` só completa a
escrita num macrotask, com contador de geração para escrita órfã não vazar para o teste seguinte —
mesma forma de `nicole-agenda-reconcile/route.test.ts` (87-6). Mutações:

| Mutação | Resultado |
|---|---|
| tira **só** o `await` das 3 escritas (eventos preservados) | 🔴 1 falha / 15 passam, **em `for-each-org.test.ts`** |
| a mesma, medida **na rota** (`nicole-agenda-reconcile`) | 🔴 **3 falham** / 19 passam |
| volta para `logEvent` fire-and-forget | 🔴 **10 falham** / 6 passam |
| — restaurado | ✅ 16/16 e 22/22 |

**Efeito colateral bom:** a asserção `expect(logEventMock).not.toHaveBeenCalled()` de
`nicole-agenda-reconcile/route.test.ts:339` — que na primeira rodada eu tinha **enfraquecido** para
"nenhum `NICOLE_*` por `logEvent`" — voltou a valer **inteira**, e agora cobre mais que o original:
`logEvent` não é usado por ninguém nesta cadeia, nem pela rota nem pelo helper. Isso fecha junto o
R3 do gate: o "achado 3" e o "achado 4" da primeira rodada eram **o mesmo fato** — a concessão do
conjunto permitido (de ∅ para dois eventos) *era* a dívida do `logEvent`.

### Task 2 — `daily-report` e `nicole-agenda-reconcile` migrados (AC2)

`daily-report/route.test.ts`: **11/11**. `nicole-agenda-reconcile/route.test.ts`: **22/22**
(15 pré-existentes adaptados + 7 novos).

Mutações:

| Alvo | Mutação | Resultado |
|---|---|---|
| `daily-report` | `envDaOrg = envList` (env sem escopo de org) | 🔴 2 falham / 9 passam |
| `nicole-agenda-reconcile` | apaga o `try/catch` interno do callback (C4) | 🔴 3 falham / 19 passam |
| `nicole-agenda-reconcile` | `podeDespachar = true` (Telegram para toda org, C5) | 🔴 2 falham / 20 passam |
| `trifold-org.ts` | `trifoldOrgId()` volta a ler `DAILY_REPORT_ORG_ID` (AC10.4) | 🔴 1 falha na rota + 1 no módulo |
| `nicole-agenda-reconcile` | `dedupe_key` sem `orgId` (R5) | 🔴 4 falham / 18 passam |
| — | **restaurado** | ✅ 11/11 e 22/22 |

**C5 acende dos dois lados:** o teste afirma `telegramMock` chamado **1 vez** com "Célia" (Trifold
segue despachando como hoje) **e** nenhuma mensagem contendo "Ronaldo"/`lead-ronaldo` (org B), mais
`NICOLE_AFIRMACAO_SEM_LASTRO` gravado com `org_id` das **duas** orgs. Uma mutação que simplesmente
desligasse o Telegram reprovaria o primeiro lado.

**R11 — `grep -c "00000000-0000-0000-0000-000000000001"`:**

```
ANTES (e8ea5433)                                DEPOIS
daily-report/route.ts .................. 1      0
nicole-agenda-reconcile/route.ts ....... 1      0
nicole-health/route.ts ................. 1      1   (agora PLATFORM_ALERT_ORG_ID)
lib/tenancy/trifold-org.ts ............. —      1   (novo: a única declaração)
                              total cron 3      2
```

`grep -n "DEFAULT_ORG_ID"` em `daily-report/route.ts` e `nicole-agenda-reconcile/route.ts` →
**vazio nos dois** (Task 2.4).

**R3 — as 3 asserções que mudaram de FORMA, e uma 4ª que a story não previu.** As três nomeadas
(`daily-report/route.test.ts:103-104`, `nicole-agenda-reconcile/route.test.ts:176` e `:308`) foram
reescritas navegando até o item da org, com comentário no próprio teste dizendo o que mudou e que
a garantia é a mesma. **A quarta, achada durante a implementação e não prevista pela AC9/R3:**
`nicole-agenda-reconcile/route.test.ts:339` (`🔴 87-6 — a rota não usa mais logEvent
fire-and-forget`) afirmava `expect(logEventMock).not.toHaveBeenCalled()`. Sob o helper, `logEvent`
passa a ser chamado — **pelo helper**, com `CRON_ORG_PROCESSADA`/`CRON_RESUMO`. A garantia da 87-6
é "os eventos da **Nicole** são aguardados"; a asserção foi reescrita para
`tipos.filter(t => t.startsWith("NICOLE_")) === []` **mais** a lista exata dos `CRON_*`, o que é
mais forte que o original (o antigo não distinguia "nenhum logEvent" de "nenhum logEvent da
Nicole"). O mesmo vale para o `?dry=1` (`:179-181`), que também afirmava `logEventMock` nunca
chamado.

### Task 3 — `nicole-health` reclassificado (AC3)

**20/20** (17 pré-existentes — o número medido pelo @po, confirmado — + 3 novos).

| Mutação | Resultado |
|---|---|
| `select` sem `org_id` | 🔴 3 falham / 17 passam |
| volta `org_id: PLATFORM_ALERT_ORG_ID` nos 2 `logEventOnce` | 🔴 1 falha / 19 passam |
| — restaurado | ✅ 20/20 |

⚠️ **Achado durante a implementação — o primeiro carrasco nasceu cego.** Com o fake original, a
mutação "`select` sem `org_id`" ficava **verde**: o duplo de `system_events` ignorava a lista de
colunas e devolvia a linha inteira da fixture, `org_id` incluso. Corrigido no fake — ele agora
**projeta** as colunas pedidas (`colunas.split(",")`), e só então a mutação acende.

**E eu parei no primeiro (achado do @qa, gate CONCERNS) — eram cinco.** Ver a seção
"Carrascos cegos" abaixo.

⚠️ **Divergência com a AC3.2, deliberada e comentada no código.** A AC pede a linha
`Orgs afetadas: …` no **corpo do alerta**. Medido: `alertarAdminWhatsApp` não monta texto livre —
dispara o template **aprovado** `alerta_sistema_admin`, de **3 parâmetros fixos**. Um 4º parâmetro
faz a Meta devolver 400 e o alerta **para de sair** — mudança de comportamento em produção, que é
exatamente o que a AC9 proíbe. `orgs_afetadas` foi para `metadata` dos dois eventos e para o corpo
da resposta HTTP (`orgsAfetadas` no topo e por tipo em `porTipo`) — que é, aliás, onde a própria
verificação da AC3 afirma (*"o alerta disparado tem `metadata.orgs_afetadas` com as 2"*). O texto
do template fica para uma story que trate de template.

`grep -c` do literal em `nicole-health/route.ts`: **1 antes, 1 depois** (renomeação no lugar).
`grep -c "DEFAULT_ORG_ID"` → 1, e é uma menção em **comentário** explicando o que foi renomeado;
zero usos.

### Task 4 — `meta-ads-intelligence` (AC4)

`route.test.ts` **criado** (não existia): **7/7**. O fake é uma tabela em memória que honra
`.eq()/.in()/.gte()/.lte()/.limit()`.

| Mutação | Resultado |
|---|---|
| volta `accounts[0]!.org_id` | 🔴 **5 falham** / 2 passam |
| `catch` por org relança (sem isolamento) | 🔴 1 falha / 6 passam |
| — restaurado | ✅ 7/7 |

**R7 coberto:** o teste afirma que `meta_alerts` recebe o `org_id` de **cada** org (spy no
`upsert`, `orgsDosAlertas` = as duas, e o alerta de `camp-b` carrega o org B), além das **duas**
linhas de `meta_sync_log` — uma por org, nunca uma sobrescrita.

### Task 5 — `meta-capi-dispatch` + `sendCapiEvents` (AC5, AC5.1)

`meta-capi-dispatch/route.test.ts`: **17/17** (11 pré-existentes + 6 novos).
`packages/shared/src/meta/capi-client.test.ts`: **11/11** (9 + 2 novos).

| Mutação | Resultado |
|---|---|
| `leads` sem `.eq("org_id", …)` | 🔴 1 falha / 16 passam |
| remove o `logEvent CAPI_ORG_SEM_DATASET` (C9) | 🔴 2 falham / 15 passam |
| sem agrupamento por org (fila inteira como uma org) | 🔴 3 falham / 14 passam |
| `sendCapiEvents` ignora `options.datasetId` | 🔴 1 falha / 10 passam (capi-client) |
| — restaurado | ✅ 17/17 e 11/11 |

O fail-safe tem carrasco próprio: `org_integrations` devolvendo **erro** cai no **mesmo** caminho
do "sem dataset configurado" (skipped + `CAPI_ORG_SEM_DATASET`), nunca 500 e nunca um silêncio
diferente. E há o caso `dataset_id: null` — o estado exato que a migration `246` deixa depois do
backfill, antes do seed.

### Task 6 — `followup` (AC6)

`templates-por-org.test.ts` **criado**: **6/6**. O fake **honra `maybeSingle()`**: 2+ linhas
casando ⇒ `{ data: null, error: { code: "PGRST116" } }`, nunca `linhas[0] ?? null`.

| Mutação | Resultado |
|---|---|
| `whatsapp_config` sem `.eq("org_id", …)` | 🔴 3 falham / 3 passam |
| descarta o `error` do `maybeSingle()` (o código de HOJE) | 🔴 1 falha / 5 passam |
| remove o cache (1 busca por regra em vez de por org) | 🔴 1 falha / 5 passam |
| — restaurado | ✅ 6/6 |

Para o cache ter carrasco de verdade, extraí `criarCacheDeTemplatesPorOrg(supabase, carregar)` —
a contagem "2 chamadas para 3 regras de 2 orgs" não é observável de nenhum outro lugar, e o teste
afirma `r3 === r1` por identidade, não só por valor igual.

### Task 7 — isolamento de erro nos 6 arquivos (AC7)

Testes **criados** para os 4 que não tinham: `email-queue` (2), `obras-approval-reminder` (2),
`email-automations` (3), `sla-alerts` (2). Estendidos os 2 existentes: `bolsao-rebalance` (8 → 10),
`roleta-retry` (11 → 13). Todos com **controle positivo** antes do caso de falha.

**As DUAS mutações de C10 por arquivo** — tirar o `try/catch` **e** manter o `try/catch` revertendo
só o campo de falha:

| Arquivo | Campo nomeado | sem try/catch | só sem o campo |
|---|---|---|---|
| `email-queue` | `failed` (já existia; faltava o caminho) | 🔴 1/2 | 🔴 1/2 |
| `email-automations` | `erros` (novo, cobre os 2 laços) | 🔴 2/3 | 🔴 2/3 |
| `obras-approval-reminder` | `orgs_com_erro` (novo) | 🔴 1/2 | 🔴 1/2 |
| `roleta-retry` | `erros` (novo, 9º contador) | 🔴 1/13 | 🔴 1/13 |
| `bolsao-rebalance` | entrada `{ orgId, ok:false, erro }` no `summary` | 🔴 1/10 | 🔴 1/10 |
| `sla-alerts` | entrada `{ orgId, ok:false, erro }` no `summary` | 🔴 1/2 | 🔴 1/2 |

Nos dois que devolvem array, o `ok` do topo passou a agregar
(`summary.every((s) => s.ok !== false)`) — sem isso o corpo continuaria dizendo `ok: true` com uma
org quebrada dentro.

### Task 8 — allowlist (AC8)

**8.1 em commit próprio** (`e3a6f1fc`), antes da re-triagem, com a Change Log da `900-21b`
(condição 2) no mesmo commit — é o mesmo achado.

**C2 — controle positivo do carrasco certo:**
```
$ grep -c '900-20' docs/audits/admin-client-allowlist.json     # ANTES
6
$ grep -c '900-20' docs/audits/admin-client-allowlist.json     # DEPOIS
0
```

**8.6 — contagens medidas programaticamente (não calculadas em prosa):**

| Seção | Antes | Depois | `MINIMOS` |
|---|---|---|---|
| `plataforma` | 16 | **17** | 16 → 17 |
| `itera-orgs` | 24 | **29** | 24 → 29 |
| `alvos-onda-2` | 12 | **3** (só os 3 órfãos) | 12 → 3 |
| `legitimos` | 12 | 12 | 12 |
| **união total** | 242 | **239** | `TOTAL_ESPERADO` 242 → 239 |

239 = 242 − 4 (`daily-report` e `nicole-agenda-reconcile`, mais os dois `.test.ts`) + 1
(`lib/tenancy/for-each-org.ts`).

**8.5 — medido, não presumido:** `for-each-org.test.ts` **não** precisa de entrada. `npx eslint src
--format=json` acusava exatamente 2 ocorrências, ambas em `for-each-org.ts` (`:2` e `:115`); o
arquivo de teste só menciona o módulo dentro de `vi.mock`, que não é `CallExpression`.

**8.8 — vermelho ANTES, verde DEPOIS (C3), colado:**
```
# ANTES de corrigir MINIMOS/TOTAL_ESPERADO
Tests 3 failed | 12 passed (15)
  × `docs/audits/admin-client-allowlist.json` não tem violação nenhuma
      → seção "alvos-onda-2" tem 3 entradas, abaixo do mínimo re-triado de 12
  × a união das 4 seções + `legado` soma 242   → expected 239 to be 242
  × `PERMITIDOS` … tem exatamente as mesmas 242 entradas → expected 239 to be 242

# DEPOIS
Tests 15 passed (15)
```
Uma quarta asserção precisou mudar junto e não estava prevista: o caso *"seção abaixo do mínimo
re-triado acende, nomeando a contagem"* casava o literal `/15 entradas.*mínimo.*16/`, que é o piso
antigo de `plataforma`. Virou `/16 entradas.*mínimo.*17/` — **literal de propósito**, não derivado
de `MINIMOS`: uma asserção montada a partir da constante que vigia nunca reprovaria a constante.

**8.7:** `cd packages/web && npx eslint src --format=json` → **1210 arquivos analisados, 0
ocorrências** de `aios/no-unscoped-admin-client`.

### Task 10 — `trifoldOrgId()` como exceção nomeada (AC10)

Mora em `packages/web/src/lib/tenancy/trifold-org.ts` (**não** `lib/reports/`), com cabeçalho que
declara **o que é** (marcador de qual org ativa é a Trifold, só para escopar canais globais de
notificação — nunca para decidir qual org processar), **por que existe** (Telegram e
`DAILY_REPORT_RECIPIENTS` têm destino único por env) e **quem o mata**
(`org_integrations.provider='telegram'`, já criado pela `246`, + aposentadoria de
`DAILY_REPORT_RECIPIENTS`). Literal puro, **sem** `process.env` (10.4); o `daily-report` compõe
`process.env.DAILY_REPORT_ORG_ID ?? trifoldOrgId()` localmente.

**Catraca (10.3):** `trifold-org-literal.test.ts` varre `src` e compara com dois conjuntos
declarados — **2 arquivos de implementação** (`lib/tenancy/trifold-org.ts`,
`nicole-health/route.ts`) e 6 de teste, cada um com uma linha de justificativa. Mutações:

| Mutação | Resultado |
|---|---|
| criar `src/lib/__mutacao_900_23__.ts` com o literal | 🔴 falha **nomeando o arquivo**: `expected [ 'src/lib/__mutacao_900_23__.ts' ] to deeply equal []` |
| tirar `nicole-health/route.ts` do conjunto declarado sem tirar do código | 🔴 1 falha / 3 passam |
| — restaurado | ✅ 4/4 |

Tem célula de vivacidade da própria varredura (`varrer(SRC).length > 100`): "o conjunto bate" não
pode ser indistinguível de "a varredura leu zero arquivos".

### Task 9 — não-regressão e ordem de deploy (AC9, AC5.2)

**9.1 — as 5 leituras READ-ONLY de produção** (`dsopqkqjkmhytudaaolv`, service-role, só `GET` no
PostgREST; nenhum valor de segredo impresso):

| # | Consulta | Resultado |
|---|---|---|
| 1 | `organizations WHERE is_active = true` | **1** — `00000000-0000-0000-0000-000000000001` · slug `trifold` · "Trifold Engenharia" |
| 2 | id da org da Trifold | **bate byte a byte com o literal de `trifoldOrgId()`** — confirmado por leitura, não presumido pelo UUID histórico |
| 3 | `dataset_id` em uso hoje | ⚠️ **NÃO MEDIDO** — ver abaixo (e o mesmo vale para `DAILY_REPORT_ORG_ID`) |
| 4 | `count(DISTINCT org_id) FROM meta_ad_accounts WHERE status='active'` | **1** (1 conta, 1 org) |
| 5 | `count(*) FROM whatsapp_config WHERE status='active'` | **1** — o `PGRST116` do achado R1 **não** está ativo hoje; o follow-up por template funciona em produção |

**Leitura extra, decisiva para a ordem de deploy:** `org_integrations` **NÃO EXISTE em produção**
(`PGRST205`, "Could not find the table 'public.org_integrations'"). A migration `246` ainda não foi
aplicada lá — o pré-requisito nº 1 da cadeia da AC5.2 está **aberto**.

**O que NÃO pôde ser medido, e por quê (item 3).** `META_CAPI_DATASET_ID` **não está** em
`.env.producao` (raiz), então o valor em uso hoje seria o literal de fallback `'1337310707164669'`
de `capi-client.ts:73` — **mas isso é inferência, não leitura**. A fonte de verdade do runtime é a
Vercel, e a Vercel de produção **não é legível desta máquina**: o token da CLI local
(`~/Library/Application Support/com.vercel.cli/auth.json`) devolve
`{"error":{"code":"forbidden","message":"Not authorized"}}` para o `projectId` de
`.vercel/project.json`. É o gotcha já registrado das **duas contas Vercel** (produção é
`nicoletrifold-droid`). Fica para o `@devops`, que tem a conta certa: **ler
`META_CAPI_DATASET_ID` em Production e confirmar se é a env ou o fallback antes de qualquer seed.**

**9.2 — `pnpm test` completo:** `Test Files 282 passed (282)` · `Tests 3572 passed | 6 expected
fail (3578)`. Zero regressão de efeito observável. As 5 asserções que mudaram de **forma** (as 3
nomeadas em R3 + as 2 achadas por mim, `:179-181` e `:339`) estão comentadas no próprio teste,
dizendo o que mudou e que a garantia é a mesma.

**Célula de vivacidade da AC9 (em fixture, nunca no banco):** troquei o telefone do Alexandre na
fixture de `daily-report/route.test.ts` (`5544984070700` → `5544900000000`) → **2 testes vermelhos**;
revertido → **11/11**. Sem isso, "os valores continuam iguais" seria indistinguível de "a asserção
de igualdade não mede nada".

**9.3 — NÃO EXECUTADA.** É do `@devops`/`@data-engineer` e está **bloqueada duas vezes**: a tabela
`org_integrations` não existe em produção (migration `246` pendente) **e** o valor a semear não pôde
ser confirmado (item 3 acima). Produção foi apenas lida.

**9.4 — ordem de deploy declarada, e o PLANO B está ATIVO.**
Ordem correta: `#526` mergeado → migration `246` aplicada **em produção** → seed do `dataset_id` da
Trifold com `RETURNING` + `SELECT` de confirmação → deploy do código da AC5 → checagem pós-deploy
(9.5). Como 9.1-item-3 e 9.3 **não** foram concluídas, o plano B da Peça 3 **se aplica**:

> ⛔ **O código da AC5 (`meta-capi-dispatch/route.ts` + `sendCapiEvents`) NÃO deve subir para
> produção neste deploy.** As demais ACs (1-4, 6-8, 10) não têm essa dependência e podem seguir.

O código é fail-safe (org sem dataset ⇒ `skipped`/`capi_nao_configurado` + `CAPI_ORG_SEM_DATASET`,
nunca `sent` nem 500), mas fail-safe é **defesa em profundidade, não substituto da ordem certa**:
subir antes do seed faria a Trifold **parar de receber eventos CAPI**, que é precisamente a
violação da restrição central do dono do produto.

**9.5 — NÃO EXECUTADA** (é pós-deploy, e o deploy da AC5 está retido pelo plano B).

### Rodada do gate (CONCERNS) — carrascos cegos, os cinco

O @qa reproduziu o meu próprio achado do `nicole-health` e mediu que ele tinha **quatro irmãos
vivos**, dois deles exatamente sobre as linhas que as ACs 4 e 5 nomeiam como *a correção*. Um fake
que não projeta as colunas do `.select()` faz o campo chegar **pela fixture, não pelo código**: a
guarda existe e não guarda.

Todos os cinco fakes passaram a projetar (`projetar(linha, colunas)`, com `*` e joins passando
inteiros). Antes/depois da mesma mutação — tirar `org_id` da lista de colunas:

| Linha mutada | O que a AC promete dali | Antes (gate) | Depois |
|---|---|---|---|
| `meta-capi-dispatch/route.ts:87` | AC5 passo 1 — `select` do outbox com `org_id` | 🟢 17/17 (cego) | 🔴 **12 falham** / 5 passam |
| `meta-ads-intelligence/route.ts:224` | AC4 — agrupar `accounts` por `org_id` | 🟢 7/7 (cego) | 🔴 **5 falham** / 2 passam |
| `meta-ads-intelligence/route.ts:347` | R7 — `meta_alerts` com o `org_id` de cada org | 🟢 7/7 (cego) | 🔴 1 falha / 6 passam |
| `email-queue/route.ts:43` | agrupamento da fila por org | 🟢 2/2 (cego) | 🔴 **2 falham** / 0 |
| `roleta-retry/route.ts:48` | `distributeLeadToNextBroker(id, org_id)` | 🟢 (sem carrasco) | 🔴 1 falha / 13 passam |
| `nicole-health/route.test.ts:46` | AC3 — `org_id` no select de `system_events` | já corrigido por mim | 🔴 3 falham / 17 passam |

Para `roleta-retry` não bastava projetar: **não havia asserção nenhuma** sobre o `org_id` chegar ao
consumidor. Acrescentei o carrasco (`expect(distributeLeadToNextBroker).toHaveBeenCalledWith("l1",
"org-real")`) — 13 → **14 testes**.

### Rodada do gate — `skipped` do CAPI é TERMINAL: perda, não atraso

Medido, confirmando o @qa: **nada neste repositório devolve `meta_capi_outbox.status` de
`skipped` para `pending`**. O `CHECK` da migration 215 permite a volta; nenhum código a faz. Se a
AC5 subisse antes do seed do `dataset_id`, os eventos daquela org seriam **perdidos**, não adiados
— o que torna o plano B da Task 9.4 mais grave do que "esperar mais um ciclo".

O caminho de volta está agora **no código, ao lado da causa**
(`meta-capi-dispatch/route.ts`, no ramo `if (!datasetId)`), não só no gate:

```sql
UPDATE meta_capi_outbox
   SET status = 'pending', last_error = NULL
 WHERE status = 'skipped'
   AND last_error = 'capi_nao_configurado'
   AND org_id = '<org>'
RETURNING id, event_id;
```

É seguro reenfileirar porque `event_id` é determinístico e a Meta deduplica na janela de 48 h
(86-2/86-4). O filtro por `last_error` é o que impede ressuscitar as linhas de `'lead not found'`,
que são `skipped` por outra razão.

### Rodada do gate — correções factuais minhas

**"31 warnings, todos pré-existentes" era 30 + 1.** O warning
`followup/templates-por-org.test.ts:37:49 '_token' is defined but never used` está em arquivo
**criado por esta story** — não podia ser pré-existente. E a régua que usei (`git stash` + re-lint)
é **inerte** com as mudanças já commitadas: `git stash` não guarda nada e o "baseline" re-lintado é
a própria árvore da story. Régua que não move não mede. A régua que morde é a interseção
arquivo-a-arquivo (`git diff --name-only e8ea5433 HEAD` × arquivos com warning), que não depende do
estado do índice.
**Corrigido na fonte, não no texto:** o segundo parâmetro deixou de ser ignorado — o teste agora
**afirma o par `[wabaId, accessToken]`** de cada chamada
(`[["waba-a","tok-a"],["waba-b","tok-b"]]`), provando que a org A jamais lista templates com o
token da B. O warning some porque o parâmetro passou a ter uso, não porque foi renomeado.

**Fresta nova, registrada:** `DAILY_REPORT_ORG_ID` (`daily-report/route.ts:65`) tem **a mesma
cegueira de Vercel** do `META_CAPI_DATASET_ID` — não está em `.env.producao` e a Vercel de produção
não é legível desta máquina. Não sabemos se ela está setada em Production. Consequência prática:
se estiver setada apontando para outra org, os telefones de `DAILY_REPORT_RECIPIENTS` deixariam de
receber o relatório da Trifold no primeiro deploy. **Não é bloqueante** (com 1 org ativa o pior caso
é `envDaOrg = []` e a lista da tela continua valendo), mas o @devops deve **ler as duas envs na
conta certa** antes do deploy — não só a do CAPI.

**Ordem de merge — o texto do Change Log estava errado, e a consequência real é pior.** Medido:
`merge-base(origin/main, HEAD)` = `77f225d1`; `e8ea5433` é ancestral de `HEAD` e **não** de
`origin/main`; `origin/main..HEAD` = **3 commits**, o primeiro sendo `e8ea5433` = `headRefOid` do
PR #526. Mergear este PR antes do #526 **não deixa a `main` vermelha** — deixa a `main` **verde
tendo engolido o #526 inteiro, com `supabase/migrations/246_org_integrations_e_unicidade_whatsapp.sql`,
sem o gate nem o registro daquele PR**. Isso é pior que quebrar, porque passa despercebido. A
formulação correta é a do início deste Dev Agent Record; o Change Log foi alinhado a ela.

### Débitos nomeados (não corrigidos aqui, conforme a story)

- **R8** — `meta_ad_accounts` não filtra `organizations.is_active`: org suspensa com contas ativas
  continua consumindo Graph API. Candidato a story de entitlement (Onda 3).
- **R9** — lote do CAPI global e FIFO (`BATCH_SIZE = 50`, `*/3 * * * *`): uma org com backlog
  monopoliza a fila. Teórico no volume atual.
- ~~`forEachActiveOrg` loga por `logEvent` (fire-and-forget)~~ — **RESOLVIDO na rodada do gate**:
  migrado para `await logEventOnce(...)`, com carrasco que mede o `await`. Ver Task 1.
- **Novo (gate)** — `meta_capi_outbox.status = 'skipped'` é terminal: não há reenfileiramento
  automático. O SQL de recuperação está no código, ao lado da causa; automatizá-lo (ou permitir
  retry de `capi_nao_configurado` depois que o dataset aparecer) é candidato a story futura.
- **Novo (gate)** — `DAILY_REPORT_ORG_ID` compartilha a cegueira de Vercel do
  `META_CAPI_DATASET_ID`: o valor em Production não é legível desta máquina.
- **Novo** — `nicole-health` não pode publicar `orgs_afetadas` no texto do alerta enquanto o
  template aprovado `alerta_sistema_admin` tiver 3 parâmetros fixos (ver Task 3).

### File List

**Criados (11)** · **Modificados na rodada do gate:** os 5 fakes que não projetavam colunas + `for-each-org.ts`/`.test.ts` (logEventOnce) + `meta-capi-dispatch/route.ts` (SQL de recuperação)
- `packages/web/src/lib/tenancy/for-each-org.ts`
- `packages/web/src/lib/tenancy/for-each-org.test.ts`
- `packages/web/src/lib/tenancy/trifold-org.ts`
- `packages/web/src/lib/tenancy/trifold-org.test.ts`
- `packages/web/src/lib/tenancy/trifold-org-literal.test.ts`
- `packages/web/src/app/api/cron/meta-ads-intelligence/route.test.ts`
- `packages/web/src/app/api/cron/followup/templates-por-org.test.ts`
- `packages/web/src/app/api/cron/email-queue/route.test.ts`
- `packages/web/src/app/api/cron/email-automations/route.test.ts`
- `packages/web/src/app/api/cron/obras-approval-reminder/route.test.ts`
- `packages/web/src/app/api/cron/sla-alerts/route.test.ts`

**Modificados (23 no commit `cab7afae` + `900-21b.story.md` no commit `e3a6f1fc`)**
- `packages/web/src/app/api/cron/daily-report/route.ts` · `route.test.ts`
- `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts` · `route.test.ts`
- `packages/web/src/app/api/cron/nicole-health/route.ts` · `route.test.ts`
- `packages/web/src/app/api/cron/meta-ads-intelligence/route.ts`
- `packages/web/src/app/api/cron/meta-capi-dispatch/route.ts` · `route.test.ts`
- `packages/web/src/app/api/cron/followup/route.ts`
- `packages/web/src/app/api/cron/email-automations/route.ts`
- `packages/web/src/app/api/cron/email-queue/route.ts`
- `packages/web/src/app/api/cron/obras-approval-reminder/route.ts`
- `packages/web/src/app/api/cron/roleta-retry/route.ts` · `route.test.ts`
- `packages/web/src/app/api/cron/bolsao-rebalance/route.ts` · `route.test.ts`
- `packages/web/src/app/api/cron/sla-alerts/route.ts`
- `packages/shared/src/meta/capi-client.ts` · `capi-client.test.ts`
- `docs/audits/admin-client-allowlist.json`
- `scripts/lib/allowlist-lint.ts`
- `scripts/admin-client-allowlist.test.ts`
- `docs/stories/900-21b-allowlist-retriada-e-org-integrations.story.md` (só a linha de Change Log
  da Task 8.0a — já estava aplicada pelo @sm)

### Validações

| Comando | Resultado |
|---|---|
| `npx vitest run` (suíte completa) | ✅ **282 arquivos, 3574 passando**, 6 expected-fail (pós-gate; +2 testes novos: o do `await` no helper e o do `org_id` no `select` do `roleta-retry`) |
| `pnpm lint --force` | ✅ 0 erros, **30 warnings, todos pré-existentes** — o 31º era meu (`templates-por-org.test.ts:37 '_token'`) e foi **eliminado na fonte**, dando uso ao parâmetro. Régua: interseção `git diff --name-only e8ea5433 HEAD` × arquivos com warning (não `git stash`, que é inerte sobre mudança commitada) |
| `pnpm type-check --force` | ✅ 8/8 tarefas |
| `tsc` à mão em `scripts/` | ✅ `tsc --noEmit --strict … scripts/lib/allowlist-lint.ts scripts/admin-client-allowlist.test.ts` → **exit 0** |
| `npx eslint src --format=json` (packages/web) | ✅ 1210 arquivos, 0 ocorrências da regra |

**CodeRabbit CLI não executado** — o gatilho que vale neste repo é o GitHub App no PR (ver
`.claude/rules/coderabbit-integration.md`).


---

## Change Log

| Data | Autor | Mudança |
|---|---|---|
| 2026-08-29 | @dev (Dex) | **Rodada do gate CONCERNS — 6 correções, todas com prova em disco.** (1) **Os carrascos cegos eram CINCO, não um.** O @qa mediu que o meu achado do `nicole-health` tinha 4 irmãos vivos, dois deles sobre as linhas que as ACs 4 e 5 chamam de *a correção*. Todos os fakes passaram a projetar as colunas do `.select()`. A mesma mutação (tirar `org_id` do select) que saía VERDE agora: `meta-capi-dispatch:87` 17/17 → **12 vermelhos**; `meta-ads-intelligence:224` 7/7 → **5 vermelhos**; `:347` 7/7 → 1 vermelho; `email-queue:43` 2/2 → **2 vermelhos**; `roleta-retry:48` (que nem tinha asserção) → 1 vermelho, com carrasco novo afirmando `distributeLeadToNextBroker("l1","org-real")`. (2) **A dívida do `logEvent` não era aceitável e nem cara:** `dedupe_key` é opcional (`logger.ts:100-101`), então o helper migrou para `await logEventOnce(...)`. Carrasco que mede o **`await`**, não a chamada (duplo que só completa em macrotask + contador de geração): tirar só o `await` → 1 vermelho no módulo e **3 na rota**; voltar para `logEvent` → **10 vermelhos**. Efeito colateral: a asserção `expect(logEventMock).not.toHaveBeenCalled()` da 87-6, que eu tinha **enfraquecido**, voltou a valer INTEIRA e agora cobre mais que o original — o que fecha o R3 do gate (os meus "achados 3 e 4" eram o mesmo fato). (3) **`skipped` do CAPI é TERMINAL** — medido: nada no repo devolve a linha para `pending`; seriam eventos **perdidos, não adiados**. O SQL de recuperação (com `RETURNING` e o filtro por `last_error` que preserva as linhas de `'lead not found'`) foi para **dentro do código, ao lado da causa**, não só para o gate. (4) **"31 warnings todos pré-existentes" era 30+1** — o `'_token'` estava em arquivo criado por esta story, e a régua `git stash` que usei é inerte sobre mudança commitada. Corrigido **na fonte**: o teste passou a afirmar o par `[wabaId, accessToken]`, provando que a org A nunca lista com o token da B. (5) **Fresta nova registrada:** `DAILY_REPORT_ORG_ID` tem a mesma cegueira de Vercel do `META_CAPI_DATASET_ID` — o @devops precisa ler **as duas** envs na conta certa. (6) **Ordem de merge corrigida neste Change Log:** mergear antes do #526 não deixa a `main` vermelha — deixa a `main` **verde tendo engolido o #526 inteiro, com a migration `246`, sem gate próprio**, que passa despercebido. Suíte: **282 arquivos, 3574 passando** (+2 testes novos). Lint: **30 warnings, zero meus** — os 2 arquivos tocados que ainda aparecem têm as linhas com warning **byte-idênticas ao baseline** (`sed -n 'Np'` em HEAD × `e8ea5433`, conferido linha a linha). |
| 2026-08-29 | @dev (Dex) | **Implementacao — `Ready for Dev` -> `Ready for Review`.** As 10 ACs cumpridas, cada propriedade com a mutacao rodada e o vermelho medido (nao relido): 6 mutacoes no `forEachActiveOrg`, 5 nas duas rotas migradas, 2 no `nicole-health`, 2 no `meta-ads-intelligence`, 4 no `meta-capi-dispatch`/`capi-client`, 3 no `followup`, **12** na AC7 (as DUAS de C10 por arquivo — sem `try/catch` **e** so sem o campo de falha), 2 na catraca do literal, e o par vermelho->verde da Task 8.8. Suite completa: **282 arquivos, 3572 passando**. **[AUTO-DECISAO] Base da branch:** `origin/main` **nao contem** a allowlist re-triada nem `allowlist-lint.ts`/`admin-client-allowlist.test.ts` (medido: vivem so no PR #526, reconfirmado aberto/`MERGEABLE`/`CLEAN` no dia) — com a branch em `main` puro a AC8 seria insatisfazivel. Base = `e8ea5433`, que e `origin/main` + o commit da `900-21b`. **[CORRIGIDO na rodada do gate — esta linha dizia "a `main` **vermelha**", que e uma mecanica que nao se sustenta, e o @qa mediu qual e:** `origin/main..HEAD` sao **3 commits**, o primeiro sendo `e8ea5433` = `headRefOid` do #526. Mergear este PR antes do #526 nao deixa a `main` vermelha — deixa a `main` **verde tendo engolido o #526 inteiro, com a migration `246`, sem o gate nem o registro daquele PR**, que e pior porque passa despercebido. A formulacao certa sempre esteve no Dev Agent Record; era o Change Log que divergia dele.**] **Consequencia para o @devops: este PR entra DEPOIS do #526.** **Quatro achados registrados, nao normalizados:** (1) o carrasco do `select` do `nicole-health` **nasceu cego** — o fake ignorava a lista de colunas e devolvia `org_id` da fixture; corrigido para projetar as colunas, so entao a mutacao acende; (2) a AC3.2 pede `Orgs afetadas` no corpo do alerta, mas o canal e o template **aprovado** `alerta_sistema_admin` de 3 parametros fixos — um 4o devolve 400 e o alerta para de sair, violando a AC9; `orgs_afetadas` foi para `metadata` + corpo HTTP, que e onde a propria verificacao da AC3 afirma; (3) alem das 3 assercoes de forma nomeadas em R3, **duas** outras mudaram e a story nao previu — `nicole-agenda-reconcile/route.test.ts:339` e `:179-181` afirmavam `logEvent` **nunca** chamado, e o helper passa a chama-lo (`CRON_*`); reescritas para "nenhum `NICOLE_*` por `logEvent`", que e mais forte que o original; (4) a AC1 prescreve `logEvent` (fire-and-forget) e o `CRON_RESUMO` e a ultima escrita antes do response — exatamente o padrao que a 87-6 diagnosticou como perda de evento em lambda; segui a AC e registrei como divida. **[RESOLVIDO na rodada do gate: `dedupe_key` e OPCIONAL, entao o bloqueio que aleguei nao existia — migrado para `await logEventOnce(...)`, e os achados (3) e (4) eram o MESMO fato.]** **Task 8.1 em commit proprio** (`e3a6f1fc`), 6->0 no `grep -c '900-20'`. **AC9 — 5 leituras read-only de producao coladas; 4 confirmaram o esperado** (1 org ativa, e o id dela **bate byte a byte** com o literal de `trifoldOrgId()`; 1 org distinta em `meta_ad_accounts`; **1** `whatsapp_config` ativa — o `PGRST116` do R1 nao esta ativo hoje). **A 5a NAO pode ser medida:** `META_CAPI_DATASET_ID` nao esta em `.env.producao` e a Vercel de producao **nao e legivel desta maquina** (`forbidden` — gotcha das duas contas). **Leitura extra decisiva: `org_integrations` NAO EXISTE em producao** (`PGRST205`) — a migration `246` nao foi aplicada la. Com 9.1-item-3 e 9.3 abertas, **o plano B da Peca 3 esta ATIVO: o codigo da AC5 (`meta-capi-dispatch` + `sendCapiEvents`) NAO sobe neste deploy**; as demais ACs nao tem essa dependencia. Tasks 9.3 e 9.5 deixadas explicitamente **desmarcadas**. |
| 2026-08-29 | @po (Pax) | **Revalidação: GO (8,5/10).** As 10 correções C1-C10 conferidas uma a uma, com os carrascos rodados contra `e8ea5433` — não relidos. Confirmado: **C1** os 3 números batem (`grep -c '900-20'` → 6; `npx vitest run …/nicole-health/route.test.ts` → `Tests 17 passed (17)`; 12 crons em `plataforma`, e a partição fecha exatamente em 40); **C2** a régua nova mede a forma que existe, com controle positivo 6→0; **C3** a contradição sumiu (a *lógica* das 4 regras não muda, os *dados* de `MINIMOS` mudam) e a Task 8.8 ficou melhor do que eu pedi — vermelho ANTES de corrigir `MINIMOS`, verde depois, que é controle positivo sobre a própria catraca; **C4** o `try/catch` interno emite `NICOLE_LASTRO_FALHA` e **relança**, então a AC da 87-6 e a Propriedade 1 convivem (com 1 org falhando, `sucesso===0 && total===1` ⇒ 500 por `statusHttpParaResumo`, o status que o teste 🔴 87-6 afirma); **C5** a correção do Telegram acende nos dois sentidos — zero despacho com dado da org B **e** despacho preservado para a Trifold, então uma mutação que simplesmente desligasse o Telegram não passaria (o `telegramMock` já existe em `route.test.ts:181`); **C6/C7/C8** as três propriedades ganharam carrasco executável, e o par que eu queria está completo: erro de listagem **rejeita** (`rejects.toThrow` + zero callbacks) enquanto zero orgs ativas **resolve** (200 + zero callbacks) — são caminhos distinguíveis, e o segundo é o defeito; **C9** o `capi_nao_configurado` ganhou voz (`CAPI_ORG_SEM_DATASET`) mais a checagem pós-deploy da Task 9.5; **C10** campo de falha nomeado arquivo a arquivo, e a mutação decisiva foi acrescentada — reverter *só* o campo, mantendo o `try/catch`, também tem que ficar vermelho. **Ressalva registrada, não bloqueante:** o mock da sentinela (C7) precisa devolver o **mesmo** objeto por org entre chamadas, senão `toBe` compara instâncias diferentes — erra alto, nunca passa em falso. **Acrescentei a AC10 + Task 10** (autoridade de AC é do @po): o `trifoldOrgId()` é a decisão certa como mecanismo, mas como estava escrito era a porta de entrada para o próximo UUID — mora em `lib/reports/` (lugar que nenhum revisor de tenancy audita), tem JSDoc que descreve a função em vez de declarar a exceção, é medido uma vez em vez de travado por catraca, e — o achado desta rodada — `trifoldOrgId()` lendo `DAILY_REPORT_ORG_ID` **recria a dependência cruzada que a própria AC2 comemora ter fechado**, agora mais larga: apontar o relatório diário para outra org passaria a redirecionar, em silêncio, para onde vai o Telegram do cron da agenda. **R10 aplicada por mim no épico:** `§900-23` deixou de dizer "37 crons migrados" (agora a partição medida que fecha em 40, com a nota de que migrar os 19 seria regressão), `guard.ts`→`for-each-org.ts`, a ressalva de que o grep do nome não pega rename (os 2 literais que sobrevivem, e a dívida que o §900-20 herda), e `Dep: 900-20` → `Dep: 900-21b`. Segue para o @dev. |
| 2026-08-29 | @sm (River) | **Revisão pós-NO-GO do @po** (`docs/qa/po-validation-900-23.md`), 10 correções obrigatórias aplicadas, todas remedidas contra `e8ea5433` (não redação — comandos rodados de novo). **Decisão 1 executada:** correção da referência `900-20`→`900-23` mantida NESTA story (não reabre o PR #526), com as 3 condições do @po aplicadas — contagem corrigida para **6** (não 9, C1), Task 8.0a acrescentada para a linha de Change Log na `900-21b`, e Task 8.1 isolada como commit próprio antes da re-triagem de seção. **Decisão 2 executada:** AC5.2 ganhou as 3 peças que a tornam verificável — `RETURNING`+leitura de confirmação no seed (Task 9.3), checagem pós-deploy de `capi_nao_configurado=0` (Task 9.5), e plano B nomeado de deploy dividido (Task 9.4). **C1** — 3 números remedidos: `900-20` são 6 (não 9, os 3 `.test.ts` irmãos não citam); `nicole-health/route.test.ts` tem 17 casos (não 27, `npx vitest run` colado); `plataforma` tem 12 crons implementados (não 15/16 — 16 é a contagem de entradas, 4 das quais são 3 libs + 1 teste). **C2** — carrasco da AC8.7 trocado de `grep -c '"900-20"'` (já verde hoje, mede token entre aspas que nunca existiu) para `grep -c '900-20'`, com controle positivo 6→0. **C3** — `MINIMOS["alvos-onda-2"]` em `allowlist-lint.ts` precisa mudar de 12 para 3 (Task 8.6 nova), senão a Regra 0 reprova o próprio resultado que a AC8.6 declara como sucesso; `plataforma`/`itera-orgs` subidos para o novo piso, não deixados para trás. **C4** — `nicole-agenda-reconcile` mantém `try/catch` interno que emite `NICOLE_LASTRO_FALHA` (AC da 87-6) e relança, em vez de deixar o helper engolir o evento. **C5** — o achado mais grave: a v1 afirmava que `sendTelegramAdminAlert` não vazava entre orgs; corrigido para o oposto (canal global, corpo com PII) e tratado simetricamente ao `daily-report` — despacho só para `trifoldOrgId()`, outras orgs só gravam `system_events`. **C6** — Propriedade 5 (`statusHttpParaResumo`) ganhou teste na ROTA (2 orgs 1 falha→200, ambas falham→500, 0 orgs→200+zero callback), não só na função pura. **C7** — Propriedade 2 trocou "espiar a fábrica" por identidade de sentinela (`db === sentinela(org.id)`), fechando a mutação que descartava o client escopado. **C8** — o único ponto onde o helper lança ganhou teste (`rejects.toThrow` + zero chamadas ao callback), não só JSDoc. **C9** — `capi_nao_configurado` ganhou voz: `logEvent CAPI_ORG_SEM_DATASET` por org por execução. **C10** — o "contador que já existe nos 6 arquivos" era falso em 3; nomeado campo por arquivo (`erros`/`orgs_com_erro`/entrada `{orgId,ok,erro}` no array), com carrasco afirmando sobre o corpo da resposta, não só "o 2º item rodou". **Recomendações aplicadas:** R1 (diagnóstico do `followup` corrigido — `maybeSingle()` com 2 linhas ativas devolve erro descartado, não "a primeira", e a correção via `.eq("org_id",…)` fecha isso estruturalmente graças ao índice da `900-21b`); R2 (AC9 ganhou 2 leituras de produção a mais, total 5); R3 (AC9 reescrita como "efeito observável idêntico", com as 3 asserções que mudam de forma nomeadas); R4 (`?dry=1` documentado como corpo por-org); R5 (`dedupe_key` do `nicole-agenda-reconcile` — regra de embutir `org.id` promovida a JSDoc do helper + teste estendido a 2 orgs); R6 (vocabulário "lança síncrono"→"rejeita", corrigido na Propriedade 3); R7 (`meta-ads-intelligence` — contagem corrigida para 9 usos, mais teste de `org_id` em `meta_alerts`); R11 (grep do literal UUID somado ao grep do nome, com contagem antes/depois — motivou extrair `trifoldOrgId()` para módulo compartilhado `lib/reports/trifold-org.ts`, evitando duplicar o literal em 2 rotas). **R8/R9 registradas como dívida nomeada** (não corrigidas — fora do corte desta story). **R10 é do @po** (correções do próprio épico), não aplicada aqui. |
| 2026-08-29 | @po (Pax) | **Validação: NO-GO (6,0/10).** Parecer completo em `docs/qa/po-validation-900-23.md`. 10 correções obrigatórias, todas medidas rodando contra `e8ea5433`. As duas decisões pedidas: (1) **corrigir a referência `900-20` AQUI**, não reabrir o PR #526 — a Task 8 reescreve essas mesmas entradas de qualquer forma (conflito garantido), o #526 já carrega os 4 arquivos de governança, e corrigir lá apagaria o registro da classe do erro; condicionado a 6 (não 9), a uma linha de Change Log na `900-21b` e a commit próprio para a 8.1. (2) **A ordem de deploy do CAPI continua como AC**, mas falta torná-la verificável: recibo do seed (`RETURNING`, rowcount=1), checagem pós-deploy e voz para o `capi_nao_configurado`. Bloqueantes principais: C1 três números medidos errados (`900-20` são **6** e não 9; `nicole-health` tem **17** casos e não 27; plataforma são **12** crons e não 15/16); C2 o carrasco `git grep -c '"900-20"'` **já sai verde hoje**, antes de qualquer correção — as ocorrências são `(900-20)` em prosa, nunca token entre aspas; C3 `MINIMOS["alvos-onda-2"]=12` em `allowlist-lint.ts` reprova o estado final de 3 da AC8.6, e a AC afirma que esse arquivo "não muda"; C4 a Propriedade 1 do helper come o `NICOLE_LASTRO_FALHA` do `nicole-agenda-reconcile` (AC da 87-6, `route.ts:200-212`, teste `:302-309`), que a AC2 nunca menciona; C5 a AC2 afirma que o `sendTelegramAdminAlert` não vaza — mas é `TELEGRAM_ADMIN_CHAT_ID` global (`lib/telegram.ts:1-8`) e o corpo do alerta nomeia o lead, cita a conversa e traz deep link: sob 2 orgs, PII da org B vai para o Telegram da Trifold, a mesma armadilha do `DAILY_REPORT_RECIPIENTS` negada na segunda rota; C6/C7/C8 três das cinco propriedades do `forEachActiveOrg` sem carrasco de verdade (status HTTP nunca provado na rota, Propriedade 2 prova a chamada da fábrica e não o `db` entregue, e o único ponto onde o helper lança tem só JSDoc — se o erro de listagem virar lista vazia, banco fora do ar vira 200 "nada a fazer" em todo cron); C9 o `capi_nao_configurado` só existe numa coluna, sem log nem alerta; C10 o "contador que já existe nos 6" não existe em 3 deles (`obras-approval-reminder` não tem nenhum; `bolsao-rebalance`/`sla-alerts` devolvem array, não contador) — sem campo nomeado, `catch { console.error; continue }` passa no carrasco e a rota devolve 200 com corpo limpo. Mais 11 recomendações, incluindo duas correções no épico que são da alçada do @po (`§900-23` "37 crons migrados" → partição medida de 40; `epic-900:845` `Dep: 900-20` → `900-21b`). Status permanece `Draft`. |
| 2026-08-29 | @sm (River) | Draft inicial. Cobre Passos 2 (`forEachActiveOrg`) e 5 (crons travados/defeituosos/isolamento) da Onda 2 do plano aprovado — Passos 4 e 6 explicitamente fora, por instrução do dono do produto. Numeração: `900-23` (número já reservado pelo próprio epic para este conteúdo — sem colisão, diferente do caso `900-16`/`900-21b`). **Achado: a allowlist já commitada pela `900-21b` cita `900-20` (número de OUTRO conteúdo do epic — stage resolver) em 9 motivos do Passo 5, por um palpite não verificado do @dev daquela story — corrigido para `900-23` nesta story (AC8.1)**. Medido linha a linha em `daily-report`, `nicole-agenda-reconcile`, `nicole-health`, `meta-ads-intelligence`, `meta-capi-dispatch`, `followup`, e os 6 arquivos de isolamento — todas as referências de código (arquivo:linha) conferidas contra HEAD em 2026-08-29, não copiadas da allowlist sem checar. Decisão de design: `nicole-health` mantém 2 das 5 ocorrências de `DEFAULT_ORG_ID` (renomeadas `PLATFORM_ALERT_ORG_ID`, papel de canal de entrega, não de filtro) — as outras 3 (2 logs do próprio alerta + a leitura, que já não tinha filtro) são removidas/complementadas. Dependência de ordem de deploy declarada explicitamente para `meta-capi-dispatch` (AC5.2/AC9): migration `246` em produção + seed do `dataset_id` real da Trifold, ambos antes do deploy do código. |

---

## QA Results

**Gate:** `docs/qa/gates/900.23-foreachactiveorg-e-crons-corrigidos.yml`
**Reviewer:** Quinn (Test Architect) · 2026-08-29
**Decisão: CONCERNS** — o código está certo; o que segura o PASS é instrumento, não comportamento.
Nada bloqueia o merge.

### O que reproduzi por execução (não aceitei por relato)

Suíte completa `282 arquivos / 3572 passando / 6 expected-fail` ✅ · `type-check --force` 8/8 ✅ ·
`npx eslint src` **1210 arquivos, 0 ocorrências** de `aios/no-unscoped-admin-client` ✅ ·
allowlist `17 / 29 / 3 / 12 / 178`, união **239**, `MINIMOS` e `TOTAL_ESPERADO` alinhados,
`scripts/admin-client-allowlist.test.ts` 15/15 ✅ · `grep -c '900-20'` **6 em `e8ea5433` → 0 em
HEAD** ✅.

**14 mutações reproduzidas**, todas com a contagem que o @dev colou: C7 (1/14), C8 (1/14), AC10.4
(2 vermelhos em 2 arquivos), C5 (2/20), C4 (3/19), `envList` sem escopo (2/9), `leads` sem
`.eq(org_id)` (1/16), `followup` sem `.eq(org_id)` (3), `followup` descartando o `error` (1), C10
no `sla-alerts` nas duas variantes, e a catraca do literal acendendo **com o nome do arquivo**.
Mais **3 mutações minhas**, todas vermelhas: tirar só o `await` do `logEventOnce` do
`NICOLE_LASTRO_FALHA`; fixar `ok: true` no topo do `sla-alerts`; e a igualdade de forma do commit
`e3a6f1fc` (6 linhas removidas ≡ 6 adicionadas após normalizar `900-20`/`900-23` — prova que foi
só a troca de número, que `--numstat` não daria).

**Produção relida por mim, read-only:** 1 org ativa, `id` batendo byte a byte com o literal de
`trifoldOrgId()`; 1 `whatsapp_config` ativa; 1 org distinta em `meta_ad_accounts`; e
`org_integrations` → **`PGRST205`** (a tabela não existe — a `246` não está lá).

### Achado principal — o carrasco cego tem três irmãos (QA-900-23-1, high)

O @dev achou sozinho que o fake do `nicole-health` ignorava a lista de colunas do `.select()` e
consertou. **Não procurou a classe nos outros fakes.** Procurei. Removendo `org_id` do `select`:

| Arquivo:linha | O que a AC promete daquela linha | Suíte |
|---|---|---|
| `meta-capi-dispatch/route.ts:87` | AC5 passo 1 — "`select` do outbox ganha `org_id`" | **17/17 VERDE** |
| `meta-ads-intelligence/route.ts:224` | AC4 — agrupar `accounts` por `org_id` | **7/7 VERDE** |
| `meta-ads-intelligence/route.ts:347` | R7 — `meta_alerts` com o `org_id` de cada org | **7/7 VERDE** |

Sistêmico (`email-queue:43` e `roleta-retry:48` idem). De todos os fakes desta fatia, só o de
`nicole-health/route.test.ts:46` projeta colunas. As duas rotas afetadas são as que a própria
story chama de mais graves, e o `org_id` no `select` é a **primeira peça** da correção da AC5.
Conserto: copiar o padrão que já existe no repo, ~15 linhas.

### Julgamentos pedidos

- **Ordem de merge — CONFIRMADA, e mais grave que o Change Log diz.** Medido: `origin/main..HEAD`
  são **3 commits**, e o primeiro é `e8ea5433`, o `headRefOid` do PR #526 (OPEN/MERGEABLE/CLEAN).
  Mergear este PR antes do #526 não deixa a `main` vermelha — deixa a `main` **verde tendo
  engolido o #526 inteiro**, incluindo a migration `246`, sem o gate daquele PR. A formulação
  certa é a do Dev Agent Record, não a do Change Log.
- **Plano B / PR que entrega código que não ativa — COERENTE, não re-fatiar.** O fail-safe tem
  carrasco próprio, o estado tem voz (`CAPI_ORG_SEM_DATASET`), e re-fatiar obrigaria a renumerar
  a allowlist duas vezes. O risco é de **deploy**, não de merge. **Ressalva nova:** grepei e não
  existe caminho que devolva `meta_capi_outbox.status` de `skipped` para `pending` — se a AC5
  subir antes do seed, os eventos daquela janela são **perdidos, não adiados**. A SQL de
  recuperação está no gate (H4).
- **AC3.2 — divergência CORRETA.** Verifiquei o código: `admin-whatsapp.ts:99-104` monta
  exatamente 3 parâmetros para o template aprovado `alerta_sistema_admin`. Um 4º → 400 → o alerta
  para de sair → AC9 violada, e a AC9 é hierarquicamente superior à forma do texto da AC3.2. A
  própria "Verificação" da AC3 afirma sobre `metadata.orgs_afetadas`, que é onde ele pôs. Fica a
  ressalva de que o valor de usuário (o admin humano ver as orgs na mensagem) é entrega parcial.
- **Dívida do `logEvent` — NÃO aceitável como está, por ser barata, não por ser grave.**
  `logger.ts:53`, escrito pela 87-6, diz literalmente *"Se o evento é a ÚLTIMA escrita antes do
  response, use `logEventOnce` (aguardado)"* — e o `CRON_RESUMO` é exatamente isso. O bloqueio
  alegado ("invalidaria o carrasco da Propriedade 4") não se sustenta: medi que o `dedupe_key` de
  `logEventOnce` é **opcional** (`logger.ts:100-101`), então `await logEventOnce({…})` funciona; o
  custo real é 3 mocks + ~3 asserções. Congelar o padrão que a 87-6 diagnosticou dentro de um
  **mecanismo novo e compartilhado** é a parte que preocupa, não o evento de hoje.
- **R3 (5 asserções em vez de 3) — MEIA VERDADE.** Mais forte como garantia da 87-6 (o original
  não distinguia "nenhum `logEvent`" de "nenhum `logEvent` da Nicole"), e a lista exata
  `toEqual(["CRON_ORG_PROCESSADA","CRON_RESUMO"])` acende com um terceiro fire-and-forget. Mas
  como garantia de **rota** é concessão: o conjunto permitido saiu de ∅ para dois eventos — e essa
  concessão **é** a dívida acima, vista de outro ângulo. A story trata os dois achados como
  independentes; são o mesmo fato. Pagar a dívida devolve a asserção para `["CRON_ORG_PROCESSADA"]`
  e fecha os dois. (Contraprova que rodei: tirar só o `await` do `logEventOnce` do
  `NICOLE_LASTRO_FALHA` deixa 3 vermelhos — lá o `await` É medido. É o padrão a seguir.)
- **Garantia sobre a Trifold — cobre "não muda" na dimensão que importa.** Com o conjunto de orgs
  ativas provadamente unitário e o `id` batendo com o literal, `forEachActiveOrg` é
  indistinguível do `DEFAULT_ORG_ID` de hoje; idem 1 grupo em `meta_ad_accounts` e 1 entrada de
  cache no `followup`. Acrescentei uma checagem que faltava: a **forma** do corpo de resposta
  mudou em 5 rotas, e greppei os consumidores — nenhum código da aplicação lê esses corpos, só as
  entradas de `crons` do `vercel.json`, que olham status. Seguro. **Duas frestas, a mesma causa:**
  `META_CAPI_DATASET_ID` (já nomeada) e **`DAILY_REPORT_ORG_ID` (nova, ninguém nomeou)** —
  `daily-report/route.ts:65` lê essa env, ela não está em `.env.producao`, e a Vercel de produção
  não é legível daqui; se estiver setada com valor != o id da Trifold, os telefones de
  `DAILY_REPORT_RECIPIENTS` param de receber, em silêncio. Probabilidade baixa, custo de
  verificação zero (mesma ida do @devops).

### Correção factual ao Dev Agent Record

`pnpm lint --force` dá 0 erros / 31 warnings ✅, mas **"todos pré-existentes" é 30+1**:
`followup/templates-por-org.test.ts:37:49 '_token' is defined but never used` está num arquivo
**criado por esta story**. Os outros 2 da interseção são falso alarme (código byte-idêntico ao
baseline). A régua alegada (`git stash` + re-lint) é **inerte** com as mudanças já commitadas —
`git stash` não guarda nada e o "baseline" re-lintado é a própria árvore da story. A régua que
morde é a interseção arquivo-a-arquivo entre os warnings e `git diff --name-only e8ea5433 HEAD`.

### Recomendações

1. **Preferencial antes do merge:** QA-900-23-1 — projetar as colunas nos 2 fakes.
2. Story própria: QA-900-23-2 (`await logEventOnce` no `CRON_RESUMO`, fecha o R3 junto),
   QA-900-23-4 (catraca do literal só varre `packages/web/src`), QA-900-23-5 (indentação em
   `sla-alerts/route.ts:293`).
3. **@devops:** H1 (ordem de merge), H2 (ler 3 envs na Vercel), H3 (AC5 não sobe), H4 (o `skipped`
   não se auto-cura — leve a SQL).

*Nenhuma linha de código de aplicação foi alterada por este gate. Todas as mutações foram
restauradas e a árvore reconferida limpa. Produção: somente leitura.*

---

### QA Results — 2ª rodada (commit `0762e260`)

**Decisão: PASS.** As 6 concerns fechadas, cada uma com o vermelho reproduzido por mim.
Gate atualizado: `docs/qa/gates/900.23-foreachactiveorg-e-crons-corrigidos.yml`.

**Os 5 carrascos cegos — confirmados, número a número.** Mesma mutação (tirar `org_id` da lista de
colunas): `meta-capi-dispatch:87` 🔴 **12/5** · `meta-ads-intelligence:224` 🔴 **5/2** · `:347` 🔴
**1/6** · `email-queue:43` 🔴 **2/0** · `roleta-retry:48` 🔴 **1/13** (13→14 testes). Batem com o
alegado. O `roleta-retry` é o caso mais instrutivo: projetar não bastava porque **não havia
asserção olhando para o campo** — projeção sem consumidor é instrumento apontado para o vazio.

**`logEvent` → `await logEventOnce`.** Tirar só o `await` → 🔴 1 no módulo, 3 na rota (bate).
Voltar para `logEvent` → 🔴 **13** (o @dev disse 10; diferença de denominador, não de direção).
⚠️ Registro a armadilha para quem repetir: a mutação ingênua, sem reimportar `logEvent`, derruba
**41** por `ReferenceError` de carregamento — vermelho que não discrimina. O carrasco em si é de
primeira linha: duplo que só completa em macrotask **mais** contador de geração descartando a
escrita órfã, que é exatamente o que fez a M1 da 87-6 passar em falso na primeira rodada.
E o R3 fechou junto, como eu havia dito que fecharia: `expect(logEventMock).not.toHaveBeenCalled()`
voltou inteira (`:408`), com uma afirmação positiva a mais sobre o canal aguardado (`:411`, `:533`).

**`skipped` terminal — lugar certo.** Reconferi as duas afirmações do comentário em vez de aceitá-las:
`215:49` é `CHECK (status IN (...))` **sem restrição de transição**, e o único match de
`meta_capi_outbox` + `pending` no repositório é o próprio comentário novo. Pôr o SQL no ramo
`if (!datasetId)` é o que separa documento de instrumento — em incidente ninguém abre um `.yml`.
O filtro por `last_error` preservando `'lead not found'` é o detalhe que torna a receita segura.
Nit: `event_id` é **estável por linha** (`215:44` — `'visit_' || lead_id || '_' || random_uuid`),
não "determinístico"; a conclusão de segurança não muda.

**Lint.** 30 warnings, zero desta story. E o conserto foi melhor que o pedido: em vez de renomear
o `_token`, o duplo passou a capturar o par e o teste afirma `[["waba-a","tok-a"],["waba-b","tok-b"]]`
— o parâmetro deixou de ser ignorado porque virou garantia (a org A nunca lista com o token da B).

**Números:** suíte **282/3574** (+2) · lint 0 erros/30 warnings · type-check 8/8 · eslint 1210
arquivos, 0 ocorrências · allowlist 15/15, união 239 intacta · produção relida: 1 org ativa,
`org_integrations` ainda `PGRST205` (plano B segue ATIVO e correto).

**O sexto que você pediu — achei, e são três, mas não bloqueiam.** A escotilha de join do
`projetar()` (`colunas.includes("(")` devolve a linha inteira) desliga a projeção exatamente onde
`org_id` divide a string com um embed: `email-automations:54` (🟢 3/3), `:120` (🟢 3/3) e
`obras-approval-reminder:26` (🟢 2/2) seguem verdes sob a mutação. Dois desses fakes nem receberam
o helper — e, se recebessem, a escotilha os devolveria inteiros do mesmo jeito. **Não bloqueia
porque nenhuma AC desta story nomeia esses `select`:** os dois arquivos entram pela AC7, cuja
garantia (try/catch + campo de falha nomeado) tem carrasco próprio, medido. É a diferença entre
"a guarda da AC não guarda" (rodada 1) e "há superfície vizinha sem guarda" (agora). Conserto:
split de vírgulas de primeiro nível, ~6 linhas — junto com extrair o `projetar()`, que hoje está
duplicado byte a byte em 4 arquivos.

#### Handoff @devops — confirmado, com o H1 REESCRITO

⚠️ **A régua que escrevi no gate anterior era falsa e eu a corrijo aqui.** A `main` deste repo usa
**squash** (`77f225d1`, `eb1e45de`, `563e639f` — todos `(#NNN)`, sem merge commit). Simulei o
squash do #526 (`git commit-tree e8ea5433^{tree} -p origin/main`) e medi: `e8ea5433` **nunca** vira
ancestral da `main`, e `git log $SQ..HEAD` continua devolvendo 4 commits **para sempre**. Quem
esperar a régua de história ficar verde vai concluir errado.

1. #526 mergeado primeiro — `origin/main..HEAD` são 4 commits e o 1º é o `headRefOid` do #526;
   mergear antes leva o #526 (com a migration `246`) para a `main` sem gate próprio.
2. Depois: `git fetch origin && git merge origin/main` **nesta branch** (merge, não rebase).
3. **4 conflitos previstos** (medidos com `git merge-tree` contra a main simulada), todos add/add,
   resolução **OURS** em todos: `docs/audits/admin-client-allowlist.json`,
   `scripts/lib/allowlist-lint.ts`, `scripts/admin-client-allowlist.test.ts`,
   `docs/stories/900-21b-…story.md`. A migration `246` e `no-unscoped-admin-client.mjs`
   **auto-resolvem** — esta story não os tocou e o conteúdo é idêntico dos dois lados (conferido).
4. **Régua de conteúdo, DOIS pontos** — a única que discrimina pós-squash:
   `git diff origin/main HEAD --stat` **não pode listar** `246_*.sql` nem
   `no-unscoped-admin-client.mjs`. Na simulação: 36 arquivos, nenhum dos dois. ✅
5. **Não confie na aba "Files changed" do PR:** o GitHub usa diff de TRÊS pontos, e na simulação
   os três pontos listam `246_*.sql`, `no-unscoped-admin-client.mjs` e `allowlist-lint.ts` como se
   fossem desta story. A página mente até o passo 2 ser feito.
6. H2 (ler `META_CAPI_DATASET_ID`, `DAILY_REPORT_ORG_ID` e `DAILY_REPORT_RECIPIENTS` na conta
   `nicoletrifold-droid`) · H3 (o código da AC5 **não sobe** neste deploy) · H4 (se a ordem falhar,
   o SQL de recuperação já está no código, não neste gate).

*Nenhuma linha de aplicação alterada por este gate. As 11 mutações desta rodada foram restauradas
e `git status --short packages/ scripts/` está vazio. Produção: somente leitura.*
