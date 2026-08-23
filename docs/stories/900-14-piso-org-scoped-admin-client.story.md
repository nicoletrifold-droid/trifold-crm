# Story 900-14 — `createOrgScopedAdminClient()` + regra de ESLint

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 1 — Isolamento
- **Story:** 900-14
- **Status:** Ready for Review — 8/8 ACs.
- **Priority:** P0 — endereça o **risco R1 do epic**, o maior do projeto
- **Complexity:** M
- **Created:** 2026-08-23
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @architect (Aria)

---

## Contexto — por que esta é a story mais importante da Onda 1

O gate da Onda 0 mede o **banco**. Ele não vê a aplicação, e a aplicação é onde está o risco:

| Fato | Medido em 2026-08-23 |
|---|---|
| Route handlers no total | **318** |
| Usando `createAdminClient()` (service-role, **bypassa RLS**) | **129** |
| Arquivos que importam `createAdminClient` | 237 |

Service-role ignora RLS por completo. Nessas 129 rotas, **todo o isolamento depende de alguém ter
escrito `.eq("org_id", appUser.org_id)` à mão** — e basta esquecer uma vez. É a mesma dependência
que a auditoria apontou em P8 e P12, e é por isso que NFR-5 do epic diz: *"RLS é a rede, não o
piso"*.

Esta story cria o piso.

**Ela não corrige as 129 rotas** — isso é a `900-15`, deliberadamente separada porque migrar 129
handlers é trabalho G e precisa ser priorizado por PII primeiro. Aqui entregamos a ferramenta e o
lint que impede o problema de crescer.

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** um client service-role que injeta o filtro de organização automaticamente, e um lint que
sinaliza todo uso do client cru,
**Para que** esquecer `.eq("org_id", …)` deixe de ser possível por omissão — hoje o isolamento de
129 rotas depende de disciplina humana repetida a cada query.

---

## Scope

### IN
- `createOrgScopedAdminClient(orgId)` em `packages/web/src/lib/supabase/org-scoped-admin.ts`,
  que injeta escopo de org em `select`, `update`, `delete` e no payload de `insert`.
- Conhecimento de quais tabelas **têm** `org_id`, derivado do `schema-snapshot.json` já versionado
  pela `900-2a` — tabela sem `org_id` não pode receber o filtro (quebraria a query).
- Regra ESLint `aios/no-unscoped-admin-client`, em **`warn`** nesta story.
- Allowlist de arquivos autorizados a usar o client cru, com justificativa.
- Testes cobrindo injeção, tabelas sem `org_id`, e a recusa de `orgId` inválido.

### OUT
- **Migrar as 129 rotas** — `900-15`. Aqui a regra é `warn`, não `error`, justamente porque
  transformá-la em `error` sem migrar quebraria o build de imediato.
- Alterar `createAdminClient()` — ele continua existindo e é usado legitimamente por crons e
  webhooks cross-org.
- Qualquer mudança de comportamento em rota existente.

---

## Acceptance Criteria

- [x] **AC1 — O client existe e força escopo:** `createOrgScopedAdminClient(orgId)` retorna um
  client cujo `.from(t).select()` aplica `.eq("org_id", orgId)` automaticamente quando `t` tem
  `org_id`.

- [x] **AC2 — Escopo no `insert`:** `.from(t).insert(payload)` injeta `org_id: orgId` no payload
  (objeto ou array), **sobrescrevendo** valor divergente — um `org_id` forjado no corpo da
  requisição não pode vencer o escopo do chamador.

- [x] **AC3 — `update` e `delete` escopados:** ambos recebem `.eq("org_id", orgId)`, para que
  UPDATE/DELETE cego não atinja linha de outra org.

- [x] **AC4 — Tabela sem `org_id` não é filtrada:** para tabelas de plataforma (`organizations`,
  `platform_services`, …), o client **não** injeta filtro — injetar quebraria a query. A lista sai
  do `schema-snapshot.json`, não de um array escrito à mão que envelhece em silêncio.

- [x] **AC5 — `orgId` inválido é recusado na origem:** `orgId` vazio, `undefined` ou não-UUID faz a
  função **lançar**, nunca devolver um client sem escopo. Um client "escopado" com `orgId`
  undefined seria pior que o client cru, porque parece seguro.

- [x] **AC6 — Regra de ESLint em `warn`:** `aios/no-unscoped-admin-client` sinaliza
  `createAdminClient` fora da allowlist. Em `warn` — `error` é da `900-15`, depois da migração.

- [x] **AC7 — Allowlist com justificativa:** arquivos que legitimamente usam o client cru (crons
  cross-org, webhooks que resolvem a org pelo payload) ficam numa allowlist com motivo por entrada.

- [x] **AC8 — Zero mudança de comportamento:** nenhuma rota existente é alterada. `pnpm test`,
  `lint` e `type-check` seguem verdes.

---

## Tasks / Subtasks

- [x] **T1** — Derivar a lista de tabelas com `org_id` do `schema-snapshot.json` (AC4)
- [x] **T2** — Implementar o proxy: `select`/`update`/`delete`/`insert` (AC1-AC3)
- [x] **T3** — Validação de `orgId` (AC5)
- [x] **T4** — Regra de ESLint + allowlist (AC6, AC7)
- [x] **T5** — Testes e validações (AC8)

---

## Dev Notes

**O proxy precisa ser transparente.** As rotas encadeiam (`.select().eq().order().limit()`), então o
retorno tem de continuar sendo o query builder do Supabase — a injeção acontece **uma vez**, no
ponto de entrada, e o resto da cadeia segue intacto.

**Por que a lista de tabelas vem do snapshot.** Um array manual de "tabelas sem `org_id`" começa
correto e apodrece: tabela nova nasce e ninguém lembra da lista. O snapshot já é gerado, versionado
e aparece em diff — e a R3 do gate acusa tabela nova sem `org_id`, fechando o ciclo.

**A AC2 merece atenção.** Sobrescrever o `org_id` do payload não é preciosismo: é o vetor de IDOR
mais direto que existe numa API multi-tenant — cliente manda `org_id` de outra empresa no corpo e o
service-role obedece. O epic trata isso no FR-3 ("INSERT com `org_id` forjado").

## Dev Agent Record

### Agent Model Used
@dev (Dex) — 2026-08-23.

### A decisão de desenho que define a story: catraca em vez de 237 avisos

Ligar a regra sem allowlist produziria **237 avisos de uma vez** — e 237 avisos não são um alarme,
são papel de parede. O time aprende a rolar a tela e a regra morre no primeiro dia. É o mesmo erro
que a `900-2a` quase cometeu com os 164 falsos positivos da R2.

Apliquei a catraca do gate. A allowlist tem duas seções com significados **opostos**:

| Seção | Entradas | Significado |
|---|---|---|
| `legitimos` | **60** | cross-org por desenho: crons (`forEachActiveOrg` virá na `900-23`), webhooks que resolvem a org pelo payload (`900-24`), e o próprio wrapper. **Ficam.** |
| `legado` | **178** | dívida. **A lista só diminui** — é a `900-15` que a esvazia. |

Resultado medido: **0 avisos da regra hoje**, e um arquivo novo com `createAdminClient` **é
sinalizado** (verificado criando um arquivo temporário: 2 avisos). A regra impede o problema de
crescer sem punir quem não o criou.

O wrapper precisou entrar em `legitimos` — ele encapsula `createAdminClient` de propósito, e
sinalizá-lo seria a regra acusando a solução que ela existe para promover.

### Por que a lista de tabelas vem do snapshot

`TABELAS_COM_ORG_ID` é derivada de `schema-snapshot.json`, não de um array escrito à mão. Um array
manual nasce correto e apodrece — tabela nova aparece e ninguém lembra —, e **o modo de falha é
silencioso**: o client simplesmente deixa de escopar aquela tabela. O snapshot é gerado por
introspecção, versionado e aparece em diff; a R3 do gate acusa tabela nova sem `org_id`, fechando o
ciclo. Há teste que denuncia se alguém trocar por array manual.

### Três decisões que valem registro

**`orgId` inválido lança, não degrada.** Devolver um client "escopado" com `orgId` undefined seria
**pior que o client cru**: pareceria seguro, e `.eq("org_id", undefined)` no PostgREST não filtra
nada. Falhar aqui é barulhento e imediato; falhar depois é silencioso e vaza.

**O `insert` sobrescreve `org_id` do payload.** Não é preciosismo — é o vetor de IDOR mais direto
numa API multi-tenant: o cliente manda o `org_id` de outra empresa no corpo e o service-role
obedece. Cobre o FR-3 do epic ("INSERT com `org_id` forjado"). Há teste dedicado, inclusive para
insert em lote.

**Tabela sem `org_id` não é filtrada.** Injetar o filtro em `organizations` quebraria a query — e
quebrar é pior que não escopar, porque tabela sem `org_id` não é dado de tenant.

### O que esta story deliberadamente NÃO faz

Não migra nenhuma das 178 rotas de legado (é a `900-15`, priorizando PII primeiro) e não promove a
regra para `error` — fazê-lo antes da migração quebraria o build no primeiro dia. Nenhuma rota
existente foi tocada: `type-check`, `lint` e `test` seguem verdes, e os 29 warnings de lint são os
mesmos de antes.

### Testes
17 casos em `org-scoped-admin.test.ts`: validação de `orgId` (5), injeção em select/update/delete e
encadeamento (4), insert com IDOR e lote (4), tabelas sem `org_id` e origem da lista (4).

### File List
- `packages/web/src/lib/supabase/org-scoped-admin.ts` (novo) — o piso
- `packages/web/src/lib/supabase/org-scoped-admin.test.ts` (novo) — 17 testes
- `packages/web/eslint-rules/no-unscoped-admin-client.mjs` (novo) — a regra
- `packages/web/eslint.config.mjs` — registra o plugin `aios` em `warn`
- `docs/audits/admin-client-allowlist.json` (novo) — 60 legítimos + 178 legado
- `docs/stories/900-14-piso-org-scoped-admin-client.story.md` (novo)
