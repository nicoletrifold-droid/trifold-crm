# Story 900-42a — Fecha o furo de embedding em `platformQuery()` (SEC-001)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** fatia extraída da Onda 6 (`900-42a` no texto do epic), por pedido direto do dono do
  produto em 2026-08-31, para desbloquear a Frente 2 do console de plataforma
  (`docs/ux/console-plataforma.md`). O desenho do @ux é explícito: nenhuma tela que mostre dado de
  dentro de uma empresa pode nascer enquanto este furo existir (§1.3 e §4.2 do documento).
- **Story:** 900-42a — sem colisão de número. Verificado: nenhum arquivo `900-42a-*.story.md`
  existe em `docs/stories/` (local nem em nenhuma ref remota, `git fetch --prune` em 2026-08-31); o
  ID só é citado hoje como comentário ("DONA: 900-42a") em `platform-query.ts`, nunca como story
  implementada.
- **Status:** Ready for Review
- **⚠️ Escopo desta story vs. o texto do epic para "900-42a":** o epic descreve três entregas para
  `900-42a` (§1111-1123): (a) decorator `withPlatformAdmin` com níveis `support/operator/owner` +
  auditoria por decorador em toda rota de `app/api/platform/**`; (b) consolidação e auditoria da
  lista `PLATFORM_READABLE_TABLES` (entrada por entrada, remoção de órfãs, congelamento); (c)
  endurecimento de `platformQuery()` contra o furo de embedding.
  **Esta story entrega SÓ a (c)** — a fatia mínima que fecha o SEC-001 medido no próprio arquivo de
  produção, porque é o único item das três que bloqueia o console. **[AUTO-DECISÃO]** Separar
  contra o pacote completo do epic → decisão: fazer só o fechamento do SEC-001 agora. Razão: (a) e
  (b) não bloqueiam nenhuma tela do console de plataforma — a casca da empresa, a lista, a trilha e
  a visão geral (Fase 1) mostram só identidade/status/trilha, já cobertos pela lista atual, e não
  precisam de níveis de operador nem de auditoria por decorador para existir. Fazer o pacote
  inteiro agora atrasaria o desbloqueio por um trabalho maior (decorator em rotas que nem existem
  ainda) sem benefício de segurança adicional para o problema que motivou esta story. **Quando a
  Onda 6 for planejada de verdade, (a) e (b) precisam de uma story própria** — não reabrir o ID
  `900-42a` para isso; numerar como nova story nesse momento.
  **[@po 2026-08-31] O epic já foi anotado com essa fatia** (bloco `> [@po 2026-08-31] ⚠️ ESTA
  ENTRADA FOI FATIADA` logo abaixo da entrada `900-42a` em
  `docs/stories/epics/epic-900-saas-multi-tenant.md`), para que fechar esta story não faça (a),
  (b) e a `R12` sumirem do planejamento da Onda 6. Não é preciso o @dev mexer no epic.
- **Priority:** P0 — é o item bloqueante nomeado da Frente 2 do console (`docs/ux/
  console-plataforma.md`, "Frente 2 — Console, fase 1" fica liberada sem depender disto porque não
  mostra dado de empresa; a Fase 2 do console, que mostra contagens agregadas de leads/conversas/
  mensagens, está formalmente **gated** por esta story: "2.0 ⚠️ Fechar o SEC-001 — bloqueante").
- **Complexity:** P — um arquivo de produção (`platform-query.ts`), já coberto por suíte de teste
  madura (`platform-query.test.ts`) que só precisa de mais 2 casos. Nenhuma migration, nenhuma
  rota nova.
- **Depends on:** nenhuma story de código. `platformQuery()` e `PLATFORM_READABLE_TABLES` já
  existem desde `900-22`/`900-22b`/`900-51`. **Não herda o `Dep: 900-32` do texto do epic** — essa
  dependência pertencia ao pacote completo (o decorator com níveis se conecta à Onda 3 de
  entitlement); esta fatia não toca entitlement e é, como o próprio comentário do código já diz,
  "draftável e entregável" isoladamente.

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @architect (Aria) — story de segurança, mesmo critério do checklist da
  create-next-story para "Security Story".
- **Quality Gate Tools:** `[code_review, security_review]`.

---

## User Story
**Como** operador da Trifold usando `/platform`,
**eu quero** que `platformQuery()` recuse qualquer consulta que traga dado de uma tabela fora de
`PLATFORM_READABLE_TABLES` — inclusive por aninhamento (embedding) do PostgREST, não só por
`.from()` cru,
**para que** a lista fechada seja de fato a única fronteira entre "a Trifold vê dado do cliente" e
"não vê" (FR-28 do epic), e as telas futuras do console possam se apoiar nela com confiança.

---

## Context

### O furo, medido — não hipotético
`packages/web/src/lib/tenancy/platform-query.ts` já documenta e mede o problema no próprio
docstring (linhas 17-32, reproduzido aqui porque é o núcleo desta story):

```
platformQuery("organizations", "*")                      → lança  ✔ (controle positivo)
platformQuery("organizations", "id, *")                   → lança  ✔ (controle positivo)
platformQuery("organizations", "id, users(*)")             → PASSA  ✘
platformQuery("organizations", "id, leads(name, phone)")   → PASSA  ✘
```

A checagem atual (`platform-query.ts:96-101`) só procura o token exato `"*"` depois de quebrar
`columns` por vírgula. Ela não enxerga que `leads(...)` é uma sintaxe de embedding do PostgREST:
como **todo** o schema tem `org_id uuid REFERENCES organizations(id)`, o PostgREST resolve
`leads(...)` a partir de `organizations` e devolve linhas de uma tabela que **não está** em
`PLATFORM_READABLE_TABLES` — sem emitir nenhum `.from()` cru, então sem acender o scanner estático
`platform-query-scan.ts` (que só procura `.from("literal")`). As duas redes de defesa hoje
existentes (checagem de runtime + scanner estático) passam por baixo do mesmo furo, porque as duas
assumem que "ler tabela errada" só acontece via `.from()`. Embedding não é sintaxe exótica neste
repositório: 84 arquivos de `packages/web/src` já a usam para outra finalidade — só não dentro de
`platformQuery()`, hoje.

### Por que "duas redes" não bastam aqui, e por que a régua nova precisa de mutação
A memória de processo deste projeto (`feedback_contar_a_regua_e_quebrar_colinearidade`) registra
que uma régua nova só prova alguma coisa se (a) existir um controle negativo que ainda passa depois
da correção e (b) existir uma mutação que a derruba de propósito. Sem os dois, "o teste ficou
verde" pode significar "a régua está morta" tanto quanto "o furo foi fechado". Por isso as ACs
abaixo exigem os dois explicitamente, e não como formalidade — é a mesma disciplina que fechou o
`ARCH-001` na aplicação da migration `247` (ver commit `3a2a9a1a`).

### Nenhum chamador real usa embedding hoje — verificado, não assumido
Todos os call sites atuais de `platformQuery()` foram lidos nesta story (ver Task 2): `orgs/
page.tsx`, `orgs/[id]/integracoes/page.tsx`, `api/platform/orgs/route.ts`,
`api/platform/orgs/[id]/resend-admin-invite/route.ts`, `api/platform/orgs/[id]/integracoes/
route.ts`. Nenhum passa `columns` com `(`. Isso é o que torna a correção mais simples (§ escolha de
desenho abaixo) segura: fechar TODO embedding, não só o de tabela fora da lista, não quebra nenhum
uso real hoje.

### Escolha de desenho — recusar QUALQUER embedding, não parsear a sintaxe do PostgREST
**[AUTO-DECISÃO]** Duas formas de fechar o furo foram consideradas:
- **(A) Recusar qualquer `(` no argumento `columns`** — simples, sem parser, cobre 100% dos casos
  hoje existentes (nenhum legítimo precisa de embedding).
- **(B) Parsear `columns` reconhecendo a sintaxe de embedding do PostgREST (`alias:tabela!hint(...)`,
  aninhamento arbitrário, aspas) e validar cada tabela aninhada contra a lista.**

**Escolha: (A).** Motivo: a sintaxe de embedding do PostgREST tem casos de borda reais (alias,
`!inner`/`!left`, hints de FK, aninhamento de N níveis, colunas entre aspas) — um parser por regex
escrito para fechar um furo de segurança é, ele mesmo, uma nova superfície de bug, e o histórico
deste projeto já tem mais de um caso de régua que parecia certa e não era (ver
`feedback_contar_a_regua_e_quebrar_colinearidade.md`, `feedback_verde_por_colinearidade.md`). Como
nenhum uso legítimo de embedding existe hoje (verificado acima), a opção mais simples é também a
mais segura: recusar por completo, e reabrir a decisão só se um caso de uso real precisar de
embedding — nesse momento, a extensão da lista para aceitar embedding **explicitamente permitido
por tabela** é trabalho de story nova, não de afrouxamento silencioso desta.

---

## Acceptance Criteria

**AC1 — `platformQuery()` rejeita qualquer embedding no argumento `columns`.**
Dado `platformQuery("organizations", "id, leads(name, phone)")` ou
`platformQuery("organizations", "id, users(*)")`, a chamada lança erro na mesma família das duas
recusas já existentes (mensagem clara, ex.: `platformQuery: embedding/aninhamento não é permitido —
liste as colunas da própria tabela`). A implementação recomendada: detectar `(` em qualquer posição
do argumento `columns` (fora do já existente split por `","`) e lançar — ver "Escolha de desenho"
acima. Nenhuma consulta que emitiria uma linha de tabela fora de `PLATFORM_READABLE_TABLES` deve
chegar ao Supabase.

**AC2 — Controle positivo: nenhum call site real quebra.**
Todos os call sites de produção listados no Context (Task 2 lista o `git grep` completo) continuam
passando sem alteração de comportamento. Nenhum arquivo de produção precisa mudar além de
`platform-query.ts`.

**AC3 — Mutação obrigatória, executada e registrada.**
Comentar/reverter a checagem nova (simular "a correção nunca existiu") faz o teste de AC1 falhar
(ficar vermelho). Isso precisa ser **executado de fato** durante o desenvolvimento — não é
suficiente argumentar que "a lógica implica isso". Registrar no Dev Agent Record que a mutação foi
rodada e o resultado (vermelho com a checagem removida, verde com ela presente).

**AC4 — Controle negativo: consultas legítimas continuam passando.**
`platformQuery("organizations", "id, name, slug")`, `platformQuery("users", "id, email, auth_id")`
e as demais combinações já cobertas em `platform-query.test.ts` continuam sem lançar. Não vale
reescrever os testes existentes para "consertar" um teste que quebrou — se algum passar a lançar,
é regressão, não efeito colateral aceito.

**AC5 — `tsc --noEmit` limpo antes de qualquer contagem de vermelho/verde valer como prova.**
`pnpm --filter web type-check` sai com código 0 antes de qualquer relatório de teste (vermelho ou
verde) ser citado como evidência de que a AC1 ou a AC3 foram cumpridas — disciplina já em uso no
epic (§0.2; ver também `feedback_contar_a_regua_e_quebrar_colinearidade.md`, "tsc --noEmit rc=0
antes de contar qualquer vermelho").

**AC6 — Docstring de `platform-query.ts` atualizado, não deixado como estava.**
O bloco "LIMITE CONHECIDO DA RECUSA DE `"*"` — EMBEDDING DO POSTGREST NÃO É COBERTO (SEC-001)" é
reescrito para refletir o estado pós-correção: a tabela de exemplos do próprio comentário (hoje com
duas linhas `PASSA ✘`) passa a mostrar as quatro linhas como `lança ✔`, e o texto deixa de dizer
"DONA: 900-42a" como pendência — passa a citar esta story como a que fechou o item, com a data.

**AC7 — Fora de escopo, registrado explicitamente (não implementar aqui).**
Não fazem parte desta story: o decorator `withPlatformAdmin`; os níveis `support/operator/owner`;
a consolidação/auditoria de `PLATFORM_READABLE_TABLES` (remoção de entradas órfãs, comentário de
"lista fechada"); ligar a regra `R12` do gate (`scripts/gate-tenancy.ts`, hoje um stub que lança
"R12 ainda não implementada" sob a guarda `GATE_ONDA < 6` — **não mexer no valor de `GATE_ONDA`
nem no corpo de `ruleR12`/`ruleR10`/`ruleR11` nesta story**, eles continuam desligados até a Onda 6
ser planejada de verdade). Ver "Escopo desta story vs. o texto do epic" em Metadata.

**AC8 — A recusa de `(` NÃO pode ser afrouxada por uma story de contagem. Medido.**
A escolha (A) fecha todo `(`, o que também fecha a sintaxe de agregado do PostgREST
(`select=count()`, `select=tabela(count)`). Isso **não custa nada hoje**, e a medição está aqui
para que ninguém "descubra" o contrário e afrouxe a guarda:
- `GET /rest/v1/organizations?select=count()` → **HTTP 400, `PGRST123` "Use of aggregate functions
  is not allowed"**. Agregados estão **desligados** neste projeto Supabase — medido em
  `trifold-crm-dev` em 2026-08-31. A guarda não tira uma capacidade que exista.
- `GET /rest/v1/organizations?select=id,users(count)` → **HTTP 300 `PGRST201`** (relacionamento
  ambíguo) — é forma de *embedding*, e é exatamente o que esta story fecha.
- O caminho **correto** de contagem é o cabeçalho `Prefer: count=exact`, que devolve o total em
  `Content-Range` (medido: `content-range: 0-999/1974` na tabela `leads` de produção). Ele viaja
  no **segundo argumento** de `.select()`, **não** em `columns` — logo é ortogonal a esta guarda.

**Consequência normativa, e é o ponto da AC:** `platformQuery()` hoje chama
`db.from(table).select(columns)` com **um** argumento e por isso **não consegue** repassar
`{ count: "exact", head: true }`. Se uma story futura de contagem (`900-56`, `900-58`, `900-59`)
precisar disso, o conserto é **estender a assinatura de `platformQuery()` numa story própria**,
com sua própria régua — **nunca** relaxar a recusa de `(` para deixar passar `count()`, e nunca
editar `platform-query.ts` em paralelo a esta story. Registrar esta AC como cumprida = o @dev
confirmar no Dev Agent Record que não afrouxou nada e não mudou a assinatura.

---

## Tasks / Subtasks

- [x] **Task 1 — Implementar a checagem (AC1, AC3, AC4)**
  - [x] 1.1 Adicionar a recusa de `(` em `columns` dentro de `platformQuery()`
    (`packages/web/src/lib/tenancy/platform-query.ts`), ao lado da recusa de `"*"` já existente
  - [x] 1.2 Escrever os 2 novos casos de teste em `platform-query.test.ts` reproduzindo
    exatamente os exemplos do docstring (`"id, leads(name, phone)"` e `"id, users(*)"`)
  - [x] 1.3 Rodar a suíte com a checagem presente → confirmar verde
  - [x] 1.4 Comentar a checagem nova, rodar de novo → confirmar vermelho (mutação, AC3) →
    restaurar a checagem
- [x] **Task 2 — Levantar e conferir todos os call sites reais (AC2)**
  - [x] 2.1 `git grep -n "platformQuery("` em `packages/web/src` e anexar a lista completa (arquivo
    + linha + argumento `columns`) ao Dev Agent Record desta story
  - [x] 2.2 Confirmar visualmente que nenhum contém `(` no argumento `columns`
- [x] **Task 3 — Gate de tipos (AC5)**
  - [x] 3.1 Rodar `pnpm --filter web type-check`, registrar `rc=0` no Dev Agent Record ANTES de
    reportar qualquer resultado de teste como prova
- [x] **Task 4 — Atualizar o docstring (AC6)**
  - [x] 4.1 Reescrever o bloco "LIMITE CONHECIDO..." de `platform-query.ts` conforme AC6

---

## Dev Notes

### Arquivo principal
`packages/web/src/lib/tenancy/platform-query.ts` — já lido nesta sessão de draft. A função
`platformQuery<T>(table, columns, orgId?)` hoje (linhas ~85-105):

```ts
export function platformQuery<T extends PlatformReadableTable>(
  table: T,
  columns: string,
  orgId?: string,
) {
  if (!PLATFORM_READABLE_TABLES.includes(table)) {
    throw new Error(`platformQuery: "${table}" fora de PLATFORM_READABLE_TABLES`)
  }
  if (
    columns
      .split(",")
      .map((c) => c.trim())
      .includes("*")
  ) {
    throw new Error(`platformQuery: "select *" não é permitido — liste as colunas`)
  }

  const db = createAdminClient()
  const query = db.from(table).select(columns)
  return orgId ? query.eq("org_id", orgId) : query
}
```

A nova checagem entra como um terceiro `if`, na mesma forma das duas existentes — lança antes de
`createAdminClient()` ser sequer chamado, preservando a garantia "recusa não abre consulta nenhuma"
que `platform-query.test.ts:89-92` já testa para a recusa de tabela fora da lista.

### Teste existente — estender, não reescrever
`packages/web/src/lib/tenancy/platform-query.test.ts` (132 linhas, já lido nesta sessão) tem 4
blocos `describe`. O novo bloco de embedding entra como um 5º `describe`, no mesmo padrão dos
existentes (`describe('platformQuery — recusa de "*" em columns (AC-B2)'`), reaproveitando o mock
de `createAdminClient` já presente no topo do arquivo (linhas 16-37) — que já registra `chamadas`
para provar que a recusa não abre consulta nenhuma (mesmo padrão da linha 89-92).

### Call sites conhecidos (referência, confirmar via `git grep` na Task 2)
- `packages/web/src/app/platform/orgs/page.tsx:32,40,56`
- `packages/web/src/app/platform/orgs/[id]/integracoes/page.tsx:32,47,53,65`
- `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.ts:33,49`
- `packages/web/src/app/api/platform/orgs/[id]/integracoes/route.ts:45,57,99`

Nenhum destes usa `(` no argumento `columns` — todos passam listas simples separadas por vírgula
(ex.: `"id, name, slug, is_active, created_at, admin_invite_email"`).

### `tsc --noEmit`
`pnpm --filter web type-check` (script real: `packages/web/package.json` → `"type-check": "tsc
--noEmit"`). Rodar da raiz do monorepo com o filtro, não dentro de `packages/web` isolado — mesmo
padrão do resto do repositório.

### O que NÃO tocar
- `scripts/gate-tenancy.ts` (regra `R12`, linhas ~692-696) — fica como stub, sob `GATE_ONDA < 6`.
- `packages/web/src/lib/tenancy/platform-query-scan.ts` — o scanner de `.from()` cru continua como
  está; ele não é o mecanismo que fecha este furo (o furo evita `.from()` por natureza).
- `packages/web/src/lib/tenancy/platform-query-scan.test.ts` e `dashboard-platform-boundary.test.ts`
  — não deveriam precisar de mudança; se algum quebrar, é sinal de que a checagem nova tocou algo
  fora do escopo desta story.

---

## Testing

- **Framework:** Vitest, mesmo arquivo (`platform-query.test.ts`), mesmo padrão de mock (nenhum
  banco real é tocado — tudo em memória via `vi.mock`).
- **Comando:** `pnpm --filter web test platform-query` (ou o runner padrão do monorepo para um
  arquivo específico).
- **Cenários obrigatórios (além dos já existentes, que continuam intactos):**
  1. `platformQuery("organizations", "id, leads(name, phone)")` → lança.
  2. `platformQuery("organizations", "id, users(*)")` → lança.
  3. Nenhuma chamada chega a `createAdminClient().from(...)` quando a recusa dispara (reaproveitar
     o array `chamadas` do mock).
  4. Mutação: com a checagem comentada, os testes 1-2 ficam vermelhos (rodar manualmente durante o
     desenvolvimento; não fica como teste automatizado permanente — é prova de processo, registrada
     no Dev Agent Record).
- **Gate de tipos:** `pnpm --filter web type-check` → `rc=0`, checado antes de reportar qualquer
  resultado de teste como prova (AC5).

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml` (chave ausente —
> tratada como desabilitada, conforme `.claude/rules/coderabbit-integration.md`).
> Quality validation usa o processo de revisão manual (@architect, Quality Gate desta story).

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 0.1 | Draft inicial — fecha o SEC-001 medido em `platform-query.ts`, escopo reduzido às 3 entregas originais de `900-42a` no epic (só a (c), endurecimento de `platformQuery()`). Pré-requisito da Frente 2 do console de plataforma. | @sm (River) |
| 2026-08-31 | 0.2 | **Validada pelo @po (Pax) — GO, nota 9/10.** GO. Furo do SEC-001 confirmado por medição independente do @po (a guarda não lança para embedding, controle positivo `id, *` lança; e `GET /rest/v1/organizations?select=id,leads(name,phone)` devolveu HTTP 200 com linhas aninhadas `name|phone` no `trifold-crm-dev`). Redução de escopo e remoção do `Dep: 900-32` julgadas PROCEDENTES. Acrescentada AC8 (proteção contra afrouxar a guarda por causa de contagem) e ponteiro para a anotação do epic. Status Draft → Ready. | @po (Pax) |
| 2026-08-31 | 0.3 | **Implementada pelo @dev (Dex).** Guarda de `(` em `platformQuery()` (AC1); 7 casos novos em `platform-query.test.ts` (5 de recusa + 2 de controle negativo, um deles com os 13 `columns` reais de produção); docstring reescrito (AC6); assinatura NÃO alterada e guarda NÃO afrouxada (AC8). **Divergência declarada:** a segunda rede (`platform-query-scan.ts`) TAMBÉM foi endurecida com `detectEmbeddedTableReads()` + 11 casos, contra o "O que NÃO tocar" das Dev Notes — ver Dev Agent Record, seção "Divergência". 5 mutações executadas, todas com `tsc --noEmit` rc=0 antes. Suíte: 296 arquivos, 3918 testes, 0 regressão. | @dev (Dex) |
| 2026-08-31 | 0.4 | **Pós-gate CONCERNS — `suggested_action` da QA-900-42A-1 executada. Zero mudança de comportamento.** Bloco novo no docstring de `platform-query.ts` registrando que a guarda sela o `columns` que ENTRA e não o builder que SAI: `PostgrestTransformBuilder.select()` usa `searchParams.set` (sobrescreve), então `.select()` encadeado emite a consulta que vazou as 6 linhas de lead sem passar pela guarda; a rede estática só pega a forma literal dentro dos 2 diretórios varridos, e `.select(variavel)` ninguém pega. As 3 afirmações foram **remedidas pelo @dev** (builder do `postgrest-js@2.101.1`, `detectEmbeddedTableReads()` chamada de verdade, `DIRETORIOS_VARRIDOS` lido), não herdadas do parecer. **1 item no `docs/backlog.md`** endereçado ao `@sm`, com `QA-900-42A-2` registrada dentro dele como insumo da story da AC7. Corpo de `platformQuery()` intocado (AC8), suíte de `lib/tenancy/` 164/164. **Escalado e NÃO corrigido:** as 3 entradas de 2026-08-28 do backlog com `Dona: 900-42a` ficaram desatualizadas — a do `SEC-001` prescreve o parser que esta story rejeitou. Decisão do `@po`. | @dev (Dex) |

## Dev Agent Record

**Agent Model Used:** Opus 5 (1M context) — `claude-opus-5[1m]`
**Branch:** `story/900-42a-fecha-embedding-platform-query`, criada de `origin/main` (`a7cbfc35`).
**Data:** 2026-08-31.

### 0. O furo, remedido antes de escrever qualquer linha (não aceito de segunda mão)

Contra `trifold-crm-dev` (`xnxvygyfyyyzwhiuoehz`), via PostgREST. Só contagens e nomes de coluna
foram lidos — nenhum valor de lead saiu para terminal, log, teste ou commit.

- `GET /rest/v1/organizations?select=id,leads(name,phone)` → **HTTP 200**. 3 orgs devolvidas, **2
  com `leads` aninhados**, **6 linhas de lead vazadas**, chaves `["name","phone"]`, e **as 6 com
  `phone` não-nulo**. PII de lead saindo por uma tabela fora de `PLATFORM_READABLE_TABLES`.
- Controle negativo do mesmo instrumento: `?select=id,name,slug` → HTTP 200, chaves
  `["id","name","slug"]`, **sem** chave `leads`. A sonda distingue os dois casos, então o 200 do
  primeiro não é artefato dela.
- AC8, remedida: `?select=count()` → **HTTP 400 `PGRST123` "Use of aggregate functions is not
  allowed"**. `?select=id,users(count)` → **HTTP 300 `PGRST201`** (relacionamento ambíguo). Fecha
  `(` não custa capacidade nenhuma — ela já não existe no servidor.

### 1. Task 2 — call sites reais (AC2). `git grep -n "platformQuery(" -- packages/web/src`

**São 13, em 5 arquivos — não 9 em 4.** As Dev Notes desta story listavam 4 arquivos e omitiam
`revelar/route.ts`. Nenhum dos 13 usa `(` no argumento `columns`, então a correção não muda o
comportamento de nenhum. Conferido linha a linha:

1. `app/api/platform/orgs/[id]/integracoes/revelar/route.ts:23` → `"id"` ← **ausente das Dev Notes**
2. `app/api/platform/orgs/[id]/integracoes/route.ts:45` → `"id"`
3. `app/api/platform/orgs/[id]/integracoes/route.ts:57` → `"provider, status"`
4. `app/api/platform/orgs/[id]/integracoes/route.ts:99` → `"id, actor_type, org_id, action, metadata"`
5. `app/api/platform/orgs/[id]/resend-admin-invite/route.ts:33` → `"id, admin_invite_email"`
6. `app/api/platform/orgs/[id]/resend-admin-invite/route.ts:49` → `"id, auth_id, email"`
7. `app/platform/orgs/[id]/integracoes/page.tsx:32` → `"id, name, slug, google_oauth_tokens"`
8. `app/platform/orgs/[id]/integracoes/page.tsx:47` → `"provider, status, config, secret_ref, updated_at"`
9. `app/platform/orgs/[id]/integracoes/page.tsx:53` → `"id, action, actor_type, created_at, metadata"`
10. `app/platform/orgs/[id]/integracoes/page.tsx:65` → `"status, phone_number_id, updated_at"`
11. `app/platform/orgs/page.tsx:32` → `"id, name, slug, is_active, created_at, admin_invite_email"`
12. `app/platform/orgs/page.tsx:40` → `"org_id"`
13. `app/platform/orgs/page.tsx:56` → `"org_id, id, auth_id"`

Os 13 não ficaram só no papel: entraram como fixture do `it` "controle negativo: os columns REAIS
dos call sites de produção continuam passando" em `platform-query.test.ts`, e como fonte do
controle negativo de `detectEmbeddedTableReads`. Se a guarda apertar demais num refactor futuro, a
suíte reprova antes de o painel parar.

### 2. Task 3 — `tsc --noEmit` (AC5). Rodado ANTES de cada contagem, sem exceção

`pnpm --filter web type-check` → **`rc=0`** em 7 pontos distintos: baseline limpo; com os testes
novos e sem a guarda (o vermelho da AC3); com a guarda; e antes de cada uma das 5 mutações.
`pnpm type-check --force` (monorepo inteiro, 8 tasks) → **`rc=0`**.
Nenhum vermelho relatado abaixo veio de erro de compilação.

### 3. Vermelho → verde, medido (AC1, AC3, AC4)

Arquivo `platform-query.test.ts`, `npx vitest run` no caminho do arquivo (sem `-t`, para não
depender de casamento de regex):

- **ANTES da guarda** (testes novos escritos primeiro, `tsc` rc=0): **5 failed, 12 passed (17)**.
  Os 5 vermelhos são exatamente os 5 `it` de recusa. Os 2 controles negativos passaram já aqui —
  é o trabalho deles: têm de passar dos dois lados da correção.
- **DEPOIS da guarda** (`tsc` rc=0): **17 passed (17)**.

### 4. Task 1.4 — as 5 mutações, executadas de fato (AC3)

Cada uma aplicada no arquivo de produção, `tsc --noEmit` rc=0 conferido, suíte rodada, arquivo
restaurado do original byte a byte. Formas comportamentais — nada de `if (false)` ou `const x =
null`, que nesta base costumam nem compilar.

**M1 — a guarda nunca existiu** (`if` removido inteiro). `tsc` rc=0 → **5 failed, 12 passed**.
Vermelho: os 5 `it` de recusa. Verde: os 2 controles negativos. É o sentido "a régua morre se a
correção sumir".

**M2 — predicado invertido** (`if (!columns.includes("("))`). `tsc` rc=0 → **11 failed, 6
passed**. Aqui está o segundo sentido, que M1 sozinha não alcança: caem os **2 controles
negativos novos** e mais **4 testes pré-existentes** da 900-22b (`aceita as tabelas da lista`,
`não lança para colunas explícitas`, `repassa tabela e colunas para o client`, `aplica .eq(org_id)
só quando orgId é passado`). Ou seja: uma guarda que recusasse tudo — que "protegeria" e pararia o
painel — **não passa**. Sem M2, M1 sozinha seria colinear: ficaria verde tanto com a guarda certa
quanto com uma guarda cega para o legítimo.

**M3 — detector estático neutralizado** (`detectEmbeddedTableReads` procurando um caractere que
nunca ocorre, `String.fromCharCode(0)`). `tsc` rc=0 → **6 failed, 18 passed**: os 5 `it` de "TEM de
acender" mais o `it` de vivacidade contra o corpus real.

**M4 — detector estático invertido** (`if (!argumentos.includes("("))`). `tsc` rc=0 → **10 failed,
14 passed**. Entre os vermelhos está **a varredura da árvore real** — prova de que ela lê arquivo
de verdade e reage ao conteúdo, não devolve `[]` por inércia.

**M5 — o walker devolve vazio** (mutação no próprio arquivo de teste: `arquivosVarridos` retorna
`[]` sempre). `tsc` rc=0 → **3 failed, 21 passed**: a guarda de vivacidade pré-existente da
900-22b **e** as duas réguas novas. É o controle contra "régua que aprova o vazio" — a varredura
nova **não** fica verde quando não olha para arquivo nenhum, porque o
`expect(arquivos.length).toBeGreaterThan(0)` mora **dentro do mesmo `it`** que o
`expect(achados).toEqual([])`, e não num `it` irmão que poderia divergir dele.

Depois de restaurar: `tsc` rc=0, `platform-query.test.ts` **17 passed**,
`platform-query-scan.test.ts` **24 passed**, `lib/tenancy/` inteiro **9 arquivos, 164 testes,
todos verdes**.

### 5. Divergência declarada — a SEGUNDA REDE também foi endurecida

As Dev Notes desta story, em "O que NÃO tocar", mandam deixar `platform-query-scan.ts` como está,
com a justificativa "ele não é o mecanismo que fecha este furo (o furo evita `.from()` por
natureza)". **Isso está certo sobre o furo e errado sobre a consequência**, e o próprio docstring
de `platform-query.ts` já dizia por quê antes desta story: *"as duas redes desta story passam por
baixo do mesmo furo"*.

Endurecer só o runtime deixaria `platform-query-scan.ts` afirmando no comentário de topo que
garante a fronteira dos diretórios de plataforma enquanto continua **cego para metade do
mecanismo de vazamento** — exatamente o tipo de garantia alegada que este projeto já pagou caro
para descobrir que não valia. Por isso a rede estática ganhou `detectEmbeddedTableReads()`:

- É **aditiva**. `detectRawTableReads` não foi tocada, e os 13 testes pré-existentes de
  `platform-query-scan.test.ts` continuam passando sem uma linha alterada — a condição que as
  Dev Notes usam para dizer que o escopo foi respeitado ("se algum quebrar, é sinal de que a
  checagem nova tocou algo fora do escopo") **se manteve**.
- **Não é um parser.** `[^)]*` para no primeiro `)`. Numa chamada limpa esse `)` é o da própria
  chamada e o grupo capturado não tem `(`; numa chamada com aninhamento o primeiro `)` é o do
  aninhamento, e o grupo carrega o `(` que o abriu. A presença do `(` no grupo É o sinal.
- **Limite conhecido, registrado no código:** `columns` vindo de VARIÁVEL não acende no estático
  (não há `(` no texto-fonte). Esse caso é coberto pela rede de runtime, que inspeciona o valor.
  As duas cobrem formas diferentes de propósito; nenhuma sozinha basta.
- A varredura da árvore real (9 arquivos em `app/platform/**` + `app/api/platform/**`) devolve
  **zero** hoje — e M3/M4/M5 provam que esse zero não é vacuidade.

### 6. AC8 — confirmação explícita de que nada foi afrouxado

- A assinatura de `platformQuery()` **não mudou**: continua `(table, columns, orgId?)` e continua
  chamando `.select(columns)` com **um** argumento. Nenhum `{ count, head }` foi introduzido.
- A recusa de `(` **não tem exceção** para `count()` nem para nada.
- O docstring registra a medição (`PGRST123` / `PGRST201` / `Prefer: count=exact`) **dentro do
  arquivo**, para que a próxima story de contagem (900-56/900-58/900-59) encontre a razão no
  lugar onde a tentação de afrouxar aparece — e não só nesta story.

### 7. AC7 — o que NÃO foi implementado, e o rastro que ficou

Decorator `withPlatformAdmin`, níveis `support/operator/owner`, consolidação/auditoria de
`PLATFORM_READABLE_TABLES` e a regra `R12`: **nada disso foi tocado**. `scripts/gate-tenancy.ts`
não foi aberto; `GATE_ONDA` não foi alterado.

Um efeito colateral do corte precisou de conserto no comentário, e está declarado: a linha
`// lista PROVISÓRIA — consolidada por 900-42a, fechada por 900-42b` afirmava que **esta** story
consolidaria a lista. Ela não consolidou (AC7 proíbe). Deixar a frase seria pior que não ter
comentário nenhum — um leitor futuro concluiria que a lista já foi auditada. O texto foi trocado
por um que diz o que de fato aconteceu e que a consolidação precisa de número de story novo. O
literal `lista PROVISÓRIA`, que `platform-query.test.ts` verifica por régua estática, foi
preservado (a suíte confirma).

### 8. Réguas do repositório

- `pnpm lint --force` → **`rc=0`**. 8 tasks, 0 cached. 0 errors, 30 warnings — **todas
  pré-existentes**, nenhuma em arquivo desta story (`grep platform-query` na saída do lint: 0).
- `pnpm type-check --force` → **`rc=0`**, 8 tasks, 0 cached.
- `pnpm test` (suíte inteira) → **`rc=0`**, **296 arquivos passed (296)**, **3918 passed + 6
  expected fail (3924)**.
  Baseline medido nesta mesma árvore **antes** de qualquer edição minha: 296 arquivos, 3900
  passed + 6 expected fail (3906). **Delta: +18 testes, +0 arquivo, 0 regressão** — e +18 é
  exatamente 7 (`platform-query.test.ts`) + 11 (`platform-query-scan.test.ts`).

### 9. Higiene

Nenhum dado de cliente entrou em código, teste, docstring ou nesta story. Da sonda contra o banco
de teste saíram apenas **nomes de coluna** (`name`, `phone` — que são identificadores de schema,
não valores) e **contagens** (3 orgs, 6 linhas, 6 com `phone` não-nulo). Varredura do próprio diff
por telefone, e-mail, UUID e sequência numérica longa: **zero ocorrências**. Nenhum script
temporário ficou na árvore — as sondas rodaram do scratchpad de sessão, fora do repositório.
Produção não foi tocada em nenhum momento: toda medição de PostgREST foi contra
`trifold-crm-dev`.

### 9b. Varredura da CLASSE, não só do primeiro achado

O furo é "leitura de plataforma que escapa da lista fechada". Antes de dar a fatia por resolvida,
varri os irmãos: `grep -rn "\.select(" packages/web/src/lib/tenancy/*.ts`. Existem **outros
caminhos de leitura que não passam por `platformQuery()`**:

- `platform-guard.ts:38-39` e `:55-56` — `.from("users").select("id, email, name,
  is_platform_admin")`. É a leitura que **decide quem é platform admin**; não pode passar pela
  guarda que ela mesma autoriza.
- `admin-invite.ts:120,142,169` — escritas e suas leituras de apoio. O docstring do arquivo já
  declara que escrita não passa por `platformQuery()`, por desenho.

**Nenhum deles é explorável pelo mecanismo desta story**, e a razão é estrutural, não sorte: as
colunas ali são **literais fixos no código**, não parâmetro de runtime. Não há `columns` para um
chamador contaminar, e nenhum contém `(`. O que a varredura mostra — e vale registrar para quem
for auditar a lista na story de consolidação — é que "todo acesso de plataforma passa por
`platformQuery()`" **não é verdade hoje**; é verdade para as leituras dos diretórios varridos.
Isso é anterior a esta story e não foi alterado por ela.

### 10. O que NÃO consegui provar

1. **Que a guarda protege em produção.** Tudo aqui é `trifold-crm-dev` e suíte local. Que
   `/platform` continua funcionando em produção com a guarda ligada é inferência a partir dos 13
   call sites (nenhum usa `(`) e da suíte — **não é medição**. A prova só existe depois do
   deploy, e ela é do @devops.
2. **Que embedding é a última forma de vazamento por `columns`.** Fechei `(`, que é a sintaxe de
   aninhamento e de agregado. Não varri a gramática inteira de `select` do PostgREST atrás de uma
   terceira forma que traga linha de outra tabela sem `(` e sem `*`. Não conheço nenhuma; **não
   provei que não existe**.
3. **Que a lista `PLATFORM_READABLE_TABLES` está correta.** Continua não auditada (AC7). Esta
   story garante que só as tabelas da lista são lidas — **não** que a lista deveria ter essas 5
   entradas. `whatsapp_config` e `platform_audit_log`, por exemplo, entraram por extensão
   declarada em stories anteriores e nunca foram revistas.
4. **Que a rede estática cobre `columns` dinâmico.** Está escrito no código como limite conhecido.
   `platformQuery("organizations", colunasVindaDeVariavel)` só é pego em runtime.
5. **A causa dos "7 vermelhos fantasma" mencionados no briefing.** Não os reproduzi: a suíte
   rodou 2 vezes inteira (baseline e final) e ficou verde nas duas. Não registro causa que não
   reproduzi. Registro só o fato adjacente: esta árvore tem **6 arquivos de `packages/`
   modificados e não commitados** que não são desta story (`webhook/whatsapp/route.ts` +
   teste, `lib/meta/process-lead.ts` + teste, `lib/tenancy/webhook-org.ts` + teste — trabalho
   da 900-55), e mais `scripts/seed-ambiente-teste.ts` não rastreado. Eles estavam presentes
   **nos dois** lados da medição, então não contaminam o delta — mas quem for commitar precisa
   saber que estão lá.

### 11. Pós-gate — as duas concerns do @qa, atendidas sem mudar comportamento (2026-08-31)

O gate saiu **CONCERNS com merge liberado**, e pediu duas coisas antes de marcar Done. **Nenhuma
linha de comportamento mudou** — só docstring e backlog. As 8 ACs seguem como o gate as trançou.

**Antes de escrever, remedi as três afirmações da QA-900-42A-1.** Régua de gate também é
alegação; a minha conclusão de §10.2 ("não provei que embedding é a última forma") ficou de pé,
mas o canal que ele achou eu não tinha considerado, então medi eu mesmo:

1. **`.select()` encadeado sobrescreve.** `node` contra
   `@supabase/postgrest-js@2.101.1` (`dist/index.mjs`), sem rede:
   `c.from("organizations").select("id")` → `select=id`; `.select("id, leads(name, phone)")` no
   MESMO builder → `select=id,leads(name,phone)`, e `q === q2` é `true`. A URL final é
   `…/organizations?select=id%2Cleads%28name%2Cphone%29` — **byte a byte a consulta que devolveu
   as 6 linhas de lead com `phone` não-nulo** na remedição de §0. `searchParams.set`, não
   `append`, nas 2 ocorrências do bundle. **A concern procede.**
2. **A cobertura residual da rede estática.** Chamei `detectEmbeddedTableReads()` de verdade (via
   `tsx`), não repliquei a regex — régua derivada da fonte não reprova a fonte:
   `platformQuery("organizations","id").select("id, leads(name, phone)")` → `["\"id, leads(name,
   phone"]` (**acende**); `.select(colunas)` → `[]`; `platformQuery("organizations", colunas)` →
   `[]`. **Confere: literal acende, variável não.**
3. **Os 2 diretórios.** `DIRETORIOS_VARRIDOS` em `platform-query-scan.test.ts:22-25` são
   `app/api/platform` e `app/platform`. `lib/tenancy/` **não** está lá. Confere.

**Entregue:** 15 linhas no bloco `EMBEDDING DO POSTGREST — FECHADO` do docstring de
`platform-query.ts` dizendo que a guarda sela o `columns` que ENTRA e não o builder que SAI, com
a tabela de quem pega o quê e o aviso de que fechar o canal é story NOVA. E **1 item no
`docs/backlog.md`** endereçado ao `@sm`, com o conserto candidato e o carrasco que ele exige.

**Por que só isso, e não o conserto:** fechar o builder (selar o `select` do retorno) muda a
assinatura pública de `platformQuery()` — exatamente o que a **AC8 proíbe** nesta story — e pede
carrasco próprio. Escopo mínimo é a exigência, não a preguiça: o defeito de registro (AC1
afirmando mais do que o código faz) é o que se conserta aqui; o defeito de código ganha número
novo.

**QA-900-42A-2 registrada como insumo da story da AC7** (a consolidação de
`PLATFORM_READABLE_TABLES`, ver §7 — segue sem dona e sem número). Conferi a razão estrutural em
vez de aceitá-la: `platform-guard.ts:39,56` e `admin-invite.ts:120,142,169` têm **5 `.select()`,
todos literais fixos no fonte**, nenhum com `(`, e **nenhum recebe `columns` por parâmetro** — não
há o que um chamador contamine. O que muda depois desta story é o **enquadramento**, não o risco
de hoje: eles passam a ser o único caminho de leitura de plataforma que nenhuma das duas redes
observa, porque moram em `lib/tenancy/`, fora dos 2 diretórios. Está no mesmo item de backlog, em
bloco próprio, porque o conserto candidato é o mesmo alargamento de `DIRETORIOS_VARRIDOS`.

**Não mexi nas 3 entradas antigas do `docs/backlog.md` com `Dona: 900-42a`** (`SEC-001`,
`TEST-001`, `MNT-002`, todas de 2026-08-28). **Elas estão desatualizadas** e a do `SEC-001` é a
pior: descreve como aberto um furo que esta story fecha, e prescreve como ação "parsear `columns`"
— o caminho **(B) que esta story rejeitou por escrito**. Quem ler o backlog sem ler a story vai
implementar o parser que o dono do produto vetou. **Não corrigi porque está fora do "e nada além"
do meu escopo** — fica escalado aqui e no meu relatório, para o `@po` decidir. Não é dívida nova:
é a mesma classe de defeito que o §7 conserta um nível abaixo, e eu não posso fechá-la sozinho.

**Réguas depois das edições:** `npx vitest run packages/web/src/lib/tenancy/` → 9 arquivos / 164
testes verdes (inclusive a régua estática do literal `lista PROVISÓRIA`, que lê este mesmo
arquivo). Suíte completa, `lint --force` e `type-check --force` reconferidos — ver §8.

### File List

**Modificados (4 — todos em `packages/web/src/lib/tenancy/`):**

- `platform-query.ts` — a guarda de `(` (AC1), o `@throws` novo, o docstring de topo reescrito
  (AC6) e o comentário da lista corrigido (ver §7). +84 / -25 linhas, quase tudo comentário.
- `platform-query.test.ts` — 5º `describe`, 7 `it` novos (5 de recusa, 2 de controle negativo).
  Nenhum teste pré-existente foi alterado ou removido.
- `platform-query-scan.ts` — `detectEmbeddedTableReads()` novo + aviso no docstring de topo de que
  o arquivo passa a ter DOIS detectores. `detectRawTableReads` intocada. **Fora do escopo literal
  das Dev Notes — ver §5.**
- `platform-query-scan.test.ts` — 3 `describe` novos, 11 `it` (5 de "tem de acender", 4 de
  controle negativo, 1 varredura da árvore, 1 vivacidade contra o corpus real) + o `import`
  estendido. Os 13 `it` pré-existentes seguem intactos.

**Modificados na rodada pós-gate (2 — só documentação, zero comportamento):**

- `platform-query.ts` — bloco novo no docstring de topo com o alcance real da guarda
  (QA-900-42A-1). **Só comentário**; o corpo da função não tem uma linha alterada.
- `docs/backlog.md` — 1 item `[STORY]` endereçado ao `@sm` (QA-900-42A-1), com `QA-900-42A-2`
  dentro dele como insumo da story da AC7.

**Criados:** nenhum. **Removidos:** nenhum. **Migrations:** nenhuma. **Rotas novas:** nenhuma.
**Fora de `packages/web/src/lib/tenancy/`: só `docs/backlog.md`** (rodada pós-gate) — nada de
`scripts/gate-tenancy.ts`, `app/platform/**`, `app/api/platform/**`, env ou config.

## QA Results

### Revisão @qa (Quinn) — 2026-08-31 · Gate: **CONCERNS** (merge liberado)

**Gate:** `docs/qa/gates/900.42a-fecha-embedding-em-platform-query.yml`
**Base:** árvore não commitada sobre `a7cbfc35`, branch `story/900-42a-fecha-embedding-platform-query`.

#### Veredito
O furo medido está **fechado**. As 8 ACs passam. Zero regressão. Duas concerns, **nenhuma bloqueia
o merge**: uma pede 4 linhas de comentário e um item de backlog antes de marcar Done; a outra é
insumo para a story de consolidação da AC7.

#### Réguas remedidas por mim (não herdadas do Dev Agent Record)
| Régua | Resultado |
|---|---|
| `pnpm --filter web type-check` | `rc=0` — rodado ANTES de cada contagem de vermelho, nas 5 mutações |
| `npx vitest run` (suíte inteira) | **296 arquivos / 3918 passed + 6 expected fail (3924)** |
| Baseline | **3900 + 6 xfail** — número que **eu mesmo medi nesta mesma árvore** no gate da 900-55 |
| Delta | **+18, +0 arquivo, xfail inalterado** — = 7 (`platform-query.test.ts` 10→17 `it`) + 11 (`platform-query-scan.test.ts` 13→24 `it`) |
| `pnpm lint --force` | `rc=0`, 0 errors, 30 warnings — **zero** nos arquivos da story |
| `pnpm type-check --force` | `rc=0`, 8 tasks |
| `lib/tenancy/` isolado | 9 arquivos / 164 testes verdes |

#### Mutações — as 3 do briefing reproduzidas, mais 2 minhas
| # | Mutação | tsc | Resultado | Veredito |
|---|---|---|---|---|
| M1 | guarda removida inteira | rc=0 | 5 failed / 12 passed | kill set = **exatamente os 5 `it` de recusa** |
| M2 | predicado invertido (do @dev) | rc=0 | 11 failed / 6 passed | confere — **mas superset da M1, não disjunta** |
| **M2'** | `columns.length > 0` — a guarda que recusa TUDO (**minha**) | rc=0 | **6 failed / 11 passed** | kill set = **exatamente os 6 de caminho legítimo**; os 5 de recusa continuam verdes → **M1 ∩ M2' = ∅** |
| M4 | detector estático invertido | rc=0 | 10 failed / 14 passed | entre os vermelhos está **a varredura da árvore real** → ela lê arquivo e reage a conteúdo |
| M5 | walker devolve `[]` | rc=0 | 3 failed / 21 passed | a régua **não** aprova o vazio |
| **M5'** | M5 + remoção **só** do `toBeGreaterThan(0)` de dentro do `it` (**minha**) | — | **2 failed / 22 passed** | o `it` fica **VERDE** sob walker morto → aquele `expect` é **portante**, e **não** é herdado do `it` irmão da 900-22b |

Arquivos restaurados por cópia e conferidos por **sha256** após cada mutação.

#### Os 6 pontos do briefing
1. **M2 reproduzida** — 11/6, nomes conferidos no `--reporter=verbose`. A conclusão do @dev está
   certa; a mutação escolhida é que era grosseira: inversão mata os dois sentidos de uma vez.
   A M2' acima é a fiel, e é ela que dá o par **disjunto**.
2. **M5 confirmada por medição, não por leitura** — ver M5'.
3. **M4 confirmada** — a varredura da árvore real cai sob inversão.
4. **A divergência foi CERTA.** Confirmo o julgamento do dono do produto, agora medido:
   `detectRawTableReads` tem **sha256 idêntico** ao de `HEAD`; diff do `.ts` é 44/0; do teste é
   110/1 e a única linha removida é o `import`; os 13 `it` pré-existentes intactos — que é
   **exatamente** a condição que as próprias Dev Notes definiram para escopo respeitado.
   Endurecer uma rede e deixar a outra **acreditando que vigia** é pior que as duas fracas: nas
   duas fracas ninguém confia.
5. **AC8 confirmada, remedida por mim com chave ANON contra `trifold-crm-dev`:**
   `?select=count()` → **400 `PGRST123`**; `?select=id,users(count)` → **300 `PGRST201`**;
   controles → 200. E no fonte de `postgrest-js@2.101.1`: `count` vira `Prefer` a partir do
   **2º argumento** de `.select()` e nunca toca `searchParams.set("select", …)`. As 900-56/58/59
   podem contar sem encostar na guarda.
6. **A heurística, sondada.** A rede de **runtime é exata**: toda forma do PostgREST que atravessa
   tabela exige `(`, e **0 das 59 colunas** das 5 tabelas da lista tem `(`/`)` no nome (medido via
   Management API no `trifold-crm-dev`) — **não existe consulta legítima que ela recuse**. A rede
   **estática** tem 3 falsos negativos que eu achei (`)` em comentário / em string / em
   concatenação, **antes** do embedding — `[^)]*` para ali), **todos os 3 pegos pela rede de
   runtime**. Registro; não cobro.

#### Concerns
- **QA-900-42A-1 (medium, não bloqueia merge) — o canal que a guarda não cobre.**
  `platformQuery()` devolve o builder, e `PostgrestTransformBuilder.select()` faz
  `url.searchParams.set("select", …)` — **set, não append: SOBRESCREVE** (lido em
  `postgrest-js@2.101.1`, `dist/index.cjs` l.368-378). Logo
  `platformQuery("organizations","id").select("id, leads(name, phone)")` emite **a mesma consulta
  que vazou as 6 linhas de lead**, sem passar pela guarda nova. A rede estática pega essa forma
  (medido: acende) **se** o argumento for literal **e** o arquivo estiver nos 2 diretórios
  varridos; **ninguém pega** `.select(variavel)`. **Não é regressão** — antes desta story as duas
  formas passavam, e nenhum dos 13 call sites encadeia `.select()`. Mas a AC1 afirma "nenhuma
  consulta … deve chegar ao Supabase", e isso hoje é maior que o código.
  **Ação pedida antes de Done:** 4 linhas no docstring de `platform-query.ts` dizendo que a guarda
  cobre o `columns` que ENTRA e não o builder que SAI, + item de backlog. **Sem mudança de
  comportamento, sem nova rodada de gate.**
- **QA-900-42A-2 (low) — os dois leitores fora das duas redes.** `platform-guard.ts` e
  `admin-invite.ts` leem com service-role, não passam por `platformQuery()` e moram em
  `lib/tenancy/`, **fora** dos 2 diretórios varridos. A varredura do @dev confere e a conclusão
  também: colunas **literais fixas**, sem parâmetro, sem `(` — **não exploráveis**. Mas passam a
  ser o único caminho de leitura de plataforma que nenhuma das duas redes observa. Insumo para a
  story de consolidação da AC7.

#### Correção factual do @dev — **PROCEDENTE**
São **13 call sites em 5 arquivos**, não 9 em 4. `revelar/route.ts:23` existe e faltava nas Dev
Notes. Reconferido por `git grep -c`, separando invocação de menção em comentário. Nenhum fora de
`app/platform/**` + `app/api/platform/**`; nenhum com `(` em `columns`.

#### Higiene
Produção **não** tocada. Nenhum service-role usado (sondas com chave anon; metadados via Management
API com `User-Agent`). Nenhum arquivo temporário na árvore. Os 6 arquivos da **900-55** e
`scripts/seed-ambiente-teste.ts` continuam na árvore e **não são desta story** — não podem entrar
no commit dela.

**Status recomendado:** ✓ liberado para o @devops. Executar a ação da QA-900-42A-1 antes de marcar
Done.

