# Story 900-58 — Lista de Empresas: busca, filtros, coluna de Integrações e ações

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Frente 2 ("Console"), Fase 1 — entrega 1.4 de `docs/ux/console-plataforma.md` §6,
  **exceto** o item "Ativar/desativar" do menu `⋯` (esse é a story `900-60`).
- **Story:** 900-58 — próximo número livre desta leva (sem colisão, verificado 2026-08-31).
- **Status:** Ready for Review
- **Priority:** P1.
- **Complexity:** M.
- **Depends on:** **`900-57`** (casca da empresa) — a linha clicável e o item "Ver empresa" do
  menu `⋯` apontam para `/platform/orgs/[id]`, que só existe como rota real a partir daquela
  story. Sem ela, os links desta story levariam a uma rota sem `page.tsx` de Resumo (haveria
  404 só se `900-57` não tiver criado a rota-índice — nasce quebrado se implementado fora de
  ordem). Dado: 100% balde A (`organizations`, `org_integrations`).

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @dev (pre-commit).
- **Quality Gate Tools:** `[code_review]`.

---

## User Story
**Como** operador da Trifold,
**eu quero** buscar e filtrar a lista de empresas, ver de relance quantas integrações estão
conectadas ou em erro por empresa, e abrir uma empresa clicando na linha,
**para que** a lista pare de ser "só uma tabela" e vire uma ferramenta de trabalho — hoje ela só
tem uma ação (Reenviar convite) e nenhuma saída além dela.

---

## Acceptance Criteria

**AC1 — Busca por nome ou slug, via querystring (`?q=`), server-rendered.**
Campo de busca; filtra `organizations` onde `name ILIKE '%{q}%' OR slug ILIKE '%{q}%'`. Sem
JavaScript de cliente para a busca em si — `<form>` com `method="GET"` (ou `<input>` com
`onChange` que navega via `router.push`, decisão de @dev; qualquer uma satisfaz a AC porque o
filtro real acontece no servidor, lendo `searchParams`).

**AC2 — Filtro de status (`?status=ativas|inativas`, default = todas).**
Filtra por `organizations.is_active`.

**AC3 — Filtro "Só com pendência" (`?pendencia=1`).**
Mostra só orgs que têm **pelo menos uma** das duas condições: convite de admin pendente
(`deriveAdminInviteStatus() === "pending"`) OU pelo menos uma integração em erro
(`org_integrations.status = 'error'`). Espelha a mesma lógica de "Precisa de você" da story
`900-56` — **reaproveitar a mesma função de cálculo**, não duplicar a regra em dois lugares.

**AC4 — Coluna "Integrações": conectadas / em erro, contagem por org.**
Contagem de `org_integrations` por org (mais `whatsapp_config` para o provider WhatsApp, mesma
fonte de verdade que `montarTilesDoPainel` já usa — ver QA-900-51-2 citada em
`integracoes/page.tsx`), mostrando `status='connected'` (verde, ●) e `status='error'` (âmbar, ⚠).
Uma consulta só para todas as orgs da página — não uma por linha (evitar N+1, mesmo cuidado de
`orgs/page.tsx:40-44`).

**[@po 2026-08-31] Correção de mecanismo — a v0.1 dizia "consulta agregada … agrupada por
`org_id`", e isso não é executável neste projeto.** Medido em `trifold-crm-dev`, 2026-08-31:
`GET /rest/v1/organizations?select=count()` → **HTTP 400 `PGRST123` "Use of aggregate functions is
not allowed"**. Não há `GROUP BY` nem agregado pelo PostgREST aqui, e a forma
`select=tabela(count)` é **embedding** — exatamente o que a `900-42a` proíbe. **O agrupamento
acontece em memória**, sobre uma leitura única de `org_integrations` (`platformQuery
("org_integrations", "org_id, provider, status")`), igual ao `Map` que `orgs/page.tsx:40-44` já
monta. Sujeito à mesma regra de saturação da AC10.

**AC5 — Linha inteira clicável → `/platform/orgs/[id]`.**
Clicar em qualquer célula não-interativa da linha navega para a casca da empresa (`900-57`). Os
controles interativos da própria linha (botão "Reenviar", o menu `⋯` de AC6) **continuam
clicáveis normalmente** — não disparam a navegação da linha (ver Dev Notes, "conflito de
clique").

**AC6 — Menu `⋯` com 3 ações: Ver empresa · Integrações · Copiar identificador.**
- "Ver empresa" → mesmo destino do clique na linha (`/platform/orgs/[id]`).
- "Integrações" → `/platform/orgs/[id]/integracoes`.
- "Copiar identificador" → copia o `slug` para a área de transferência
  (`navigator.clipboard.writeText`), com feedback visual (ex. trocar o rótulo por "Copiado!" por
  2s). É a única parte desta story que precisa de `"use client"`.
- **"Ativar/Desativar" NÃO entra neste menu nesta story** — é mutação de plataforma com
  confirmação e trilha, escopo de `900-60`. O menu nasce com 3 itens e ganha o 4º naquela story,
  sem reescrever este componente do zero.

**AC7 — Coluna "Slug" isolada é removida; vira subtítulo do nome.**
Mesma célula do nome da empresa, com o slug em fonte menor/monoespaçada logo abaixo (já é o
padrão visual usado em `orgs/page.tsx:108-109` para o slug — só muda de coluna própria para
subtítulo).

**AC8 — Coluna "Plano" aparece como placeholder `—`, sem filtro.**
`plans`/`org_subscriptions` não existem (balde C). A coluna aparece na tabela (forma final visível
desde o dia 1, regra do desenho §3.5) mas **sem filtro dropdown** — filtrar por uma coluna que é
sempre `—` não tem utilidade nenhuma e criaria uma UI que finge escolha onde não há escolha.
**Não criar coluna nem filtro de "Origem"** (Trifold × auto-cadastro): essa distinção depende de
uma coluna nova em `organizations` que só nasce com o signup público (D15 do epic), fora do escopo
desta story (zero coluna nova).

**AC9 — Estados vazios diferenciados (partida × filtrado).**
- Vazio de partida (nenhuma org no sistema): card centralizado "Nenhuma empresa ainda. **[Criar a
  primeira]**" → `/platform/orgs/new`.
- Vazio filtrado (existe org, filtro não achou nada): "Nenhuma empresa com esses filtros.
  **[Limpar filtros]**" — nunca repete o convite de criação (regra do desenho §5).

**AC10 — Saturação declarada, não silenciosa (mesma regra da `900-56` AC9).**
Toda contagem desta story é feita em memória sobre uma página do PostgREST, cujo teto é **1000
linhas** — real e vivo: medido em produção em 2026-08-31, `GET /rest/v1/leads?select=id` com
`Prefer: count=exact` devolveu `content-range: 0-999/1974` (1.974 existem, 1.000 vieram). Se a
leitura de `org_integrations` (AC4) ou a de `users` para pendência (AC3) voltar **no teto**, a
célula mostra a forma `≥ N`, nunca um número exato que o sistema não sabe.
**Reaproveitar a constante e o helper de contagem criados na `900-56` (AC9)** — não escrever uma
segunda regra de saturação divergente. Se a `900-58` for implementada antes da `900-56`, o helper
nasce aqui e a `900-56` o reaproveita; em nenhuma ordem existem duas cópias.

**Nenhuma das duas stories pode alargar `platformQuery()` para obter `count: "exact"`** — o
arquivo é o objeto da `900-42a` (segurança, na mesma janela). Ver AC8 da `900-42a`.

---

## Tasks / Subtasks

- [x] **Task 1 (AC1, AC2, AC3) — Filtros server-side**
  - [x] 1.1 Ler `searchParams` em `orgs/page.tsx` (`q`, `status`, `pendencia`)
  - [x] 1.2 Extrair a regra "tem pendência" para uma função pura reaproveitável por `900-56` e
    esta story — ficou em `console-lista-empresas.ts` (`orgsComPendencia`), consumindo
    `Pendencia[]` de `pendenciasDeConvite`/`pendenciasDeIntegracao` em vez de um arquivo novo
- [x] **Task 2 (AC4) — Coluna Integrações**
  - [x] 2.1 Uma leitura de `org_integrations` + uma de `whatsapp_config`, agrupadas em memória
- [x] **Task 3 (AC5, AC6) — Interatividade da linha**
  - [x] 3.1 "Stretched link" (`<tr className="relative">` + `after:absolute after:inset-0`)
  - [x] 3.2 Componente cliente `OrgRowMenu` (`⋯`) com os 3 itens de AC6
- [x] **Task 4 (AC7, AC8) — Layout da tabela**
  - [x] 4.1 Slug como subtítulo
  - [x] 4.2 Coluna Plano com `—`
- [x] **Task 5 (AC9) — Estados vazios**
- [x] **Task 6 — Testes**
  - [x] 6.1 Teste de unidade da regra "tem pendência" (3 cenários da seção Testing)
  - [x] 6.2 Teste de saturação: abaixo do teto e **no** teto (AC10)
  - [x] 6.3 `pnpm --filter web type-check` limpo

---

## Dev Notes

### Arquivo a editar
`packages/web/src/app/platform/orgs/page.tsx` (156 linhas, lido nesta sessão) — já tem o padrão
de leitura (`platformQuery`, evitar N+1, desempate `created_at ASC`). Esta story estende esse
arquivo; não reescreve do zero.

### Conflito de clique — linha clicável + controles internos
Um `<tr onClick>` com um `<button>`/`<Link>` dentro é um problema clássico de React: o clique no
botão borbulha para a linha. Padrão recomendado (não prescritivo, decisão de @dev): "stretched
link" — um `<Link>` `absolute inset-0` dentro da célula não-interativa, e os controles
interativos (`ReenviarConvite`, o novo `OrgRowMenu`) com `relative z-10` para ficarem acima da
camada de clique. Evita precisar de `"use client"` na linha inteira só para lidar com
`stopPropagation`.

### Fonte de verdade de status de integração
`integracoes/page.tsx` já resolve isso (linhas 47-75): `org_integrations` para os providers
graváveis, `whatsapp_config` **especificamente** para WhatsApp (QA-900-51-2 mediu que
`org_integrations` mente para esse provider — a linha fica estruturalmente inescrevível por
`CHECK`). Reaproveitar `montarTilesDoPainel()` para não duplicar essa regra numa terceira consulta
divergente.

### `deriveAdminInviteStatus`
Mesma função já usada em `orgs/page.tsx` e na story `900-56`. A regra de "pendência" (AC3) é:
`deriveAdminInviteStatus(...) === "pending" || integraçõesEmErro > 0`.

---

## Testing

- **Framework:** Vitest para a função pura de "tem pendência" (extraída na Task 1.2).
- **Cenários:**
  1. Org com convite pendente e zero integrações em erro → `true`.
  2. Org sem convite pendente, 1 integração em erro → `true`.
  3. Org sem nenhuma das duas → `false`.
- **Gate de tipos:** `pnpm --filter web type-check` limpo.
- **Manual:** busca por nome parcial, busca por slug parcial, filtro de status, filtro de
  pendência, clique na linha, clique no `⋯`, clique em "Reenviar" (confirmar que nenhum dispara a
  navegação da linha por engano).

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml`. Revisão manual via
> Quality Gate desta story.

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 0.1 | Draft inicial — busca, filtros, coluna de integrações e menu de ações da lista de empresas (sem ativar/desativar, que é a `900-60`). | @sm (River) |
| 2026-08-31 | 0.2 | **Validada pelo @po (Pax) — GO, nota 7/10.** GO após correção do @po. AC4 pedia consulta agregada com GROUP BY, que o PostgREST deste projeto não faz (`PGRST123`). Reescrita para agrupamento em memória + AC10 nova (saturação, helper compartilhado com a 900-56). Status Draft → Ready. | @po (Pax) |
| 2026-08-31 | 0.3 | **Implementada.** Branch saída da `900-56/57` (medido: `origin/main` não tem a rota da empresa nem os helpers da AC10). Busca/filtros em memória com o motivo medido; `orgsComPendencia` sobre a saída das funções da "Precisa de você"; coluna Integrações cruzando tiles (conectadas) e linhas cruas (em erro). Achado corrigido: o menu `⋯` da última linha era recortado pelo `overflow-hidden` da tabela e ficava inalcançável. 53 testes novos, 5 mutações vermelhas. Status Ready → Ready for Review. | @dev (Dex) |
| 2026-08-31 | 0.4 | **Ressalvas fechadas (gate CONCERNS + PR #549).** DOC-001: recorte remedido no log do CI (17 → 18 arquivos, 312 → 365 testes) com a contaminação da árvore registrada e o `+52` do CI explicado — subtração entre duas bases de merge diferentes. DOC-002: `whatsapp_config` tem 3 linhas `inactive`, não está vazia. TEST-001: redação do fail-closed corrigida (a guarda melhora o diagnóstico, não o veredicto). REL-001: registrada como dívida nomeada, sem tocar código. CodeRabbit: identificador quebrado por quebra de linha no `.md`; e o `Esc` passou a devolver o foco ao botão `⋯` (2 testes novos, mutação 🔴). | @dev (Dex) |

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M) — @dev (Dex), 2026-08-31.

### Dependência: de onde esta branch saiu, e por quê

**`origin/main` NÃO tem o substrato desta story.** Medido com `git cat-file -e origin/main:<path>`
em `origin/main@1c3877a6`:

| caminho | em `origin/main` |
|---|---|
| `app/platform/orgs/[id]/page.tsx` | **ausente** |
| `app/platform/orgs/[id]/layout.tsx` | **ausente** |
| `lib/tenancy/console-visao-geral.ts` | **ausente** |
| `lib/tenancy/fonte-scan.ts` | **ausente** |
| `lib/tenancy/console-fail-closed.test.ts` | **ausente** |
| `app/platform/orgs/page.tsx` | presente |
| `lib/tenancy/platform-query.ts` | presente |

As três primeiras são o que a AC5 (destino do clique), a AC10 (`contarComTeto`,
`ContagemDeclarada`) e a exigência de "use, não duplique" o filtro de comentário dependem. Sair de
`main` faria a linha clicável levar a um segmento **sem `page.tsx`** — 404 antes do layout — e
obrigaria a uma segunda cópia do helper de saturação, que a AC10 proíbe em qualquer ordem.

**Branch: `story/900-58-lista-empresas-busca-filtros`, saída de
`story/900-56-57-console-plataforma` (PR #547, aberto).** Os PRs ficam empilhados: este só pode
ser mergeado depois do #547.

### Baseline usado
CI **`33453693612`** — workflow `CI` no tip da branch base (`c2720149`), **success**. Também
verde no `main@1c3877a6` (run `33436447950`). A árvore local tem arquivos de outras frentes
(`webhook-org.*`, `process-lead.*`, webhook do WhatsApp, docs) que **não** entraram em commit
nenhum desta story — os commits foram feitos caminho a caminho.

### Decisões

**[AUTO-DECISION] Busca/filtros em memória, não como filtro do PostgREST.**
Três razões medidas, não preferência: (a) a AC3 cruza três tabelas e não existe como filtro de
banco aqui — sem agregado (`?select=count()` → HTTP 400 `PGRST123`), sem `GROUP BY` e sem
embedding (fechado pela `900-42a`); (b) a AC9 precisa do total **não filtrado** para separar os
dois vazios, e obtê-lo com filtro no banco exigiria uma segunda consulta que pode divergir da
primeira; (c) a gramática de `.or()` é posicional, então uma vírgula digitada na caixa de busca
viraria sintaxe. O preço é o teto de 1.000 linhas, e ele está **declarado** (AC10). Efeito
colateral a favor do usuário: `%` e `_` são caractere, não curinga.

**[AUTO-DECISION] `orgsComPendencia` mora em `console-lista-empresas.ts` e recebe `Pendencia[]`,
em vez do `lib/tenancy/org-pendencia.ts` sugerido na Task 1.2.** A AC3 exige "a mesma função de
cálculo"; a função escrita não sabe o que é convite pendente nem integração em erro — ela reduz a
saída de `pendenciasDeConvite`/`pendenciasDeIntegracao` a um conjunto de ids. Um arquivo novo com
a regra reimplementada satisfaria a letra da task e violaria a AC.

**[AUTO-DECISION] `conectadas` sai dos TILES; `em erro` sai das LINHAS CRUAS.** Assimetria
deliberada. Contar `connected` nas linhas cruas é a QA-900-51-2 (o WhatsApp fica `disconnected`
para sempre); contar erro pelos tiles perderia `google`, que o `CHECK` da migration 246 aceita e
`montarTilesDoPainel` não devolve — e a empresa apareceria no filtro "só com pendência" com a
coluna ao lado afirmando zero erros, na mesma tela.

**[AUTO-DECISION] A coluna Status continua existindo.** O wireframe da §3.2 dobra o status no
marcador `●`/`○` do nome; nenhuma AC pede essa remoção, e a AC7 remove só a coluna Slug.

**[AUTO-DECISION] A ordem continua `created_at ASC`.** Não é indiferente — acima de 1.000
empresas é a ponta nova que o PostgREST corta —, mas inverter troca qual metade some sem eliminar
o problema, e não está em AC nenhuma. O `<AvisoDeTeto>` é o que impede a lista de mentir.

### Achado desta implementação: o menu `⋯` da ÚLTIMA linha era inalcançável

O menu nasceu `position: absolute` dentro da célula. A tabela mora num contêiner
`overflow-hidden` (é o que arredonda os cantos), e o contêiner **recorta** o menu. Medido no
navegador (3 empresas, viewport 1440×900): a caixa ficava em `y=399..505`, o contêiner terminava
em `y=415` — sobrava uma faixa de 16px e os três itens não podiam ser clicados. Pior que um menu
ausente: ele aparece e não obedece.

⚠️ `isVisible()` do Playwright respondia **`true`** para o item recortado — ele mede caixa e
`display`, não recorte de ancestral. Quem reprovou foi a captura de tela. Conserto: a caixa é
`position: fixed`, posicionada a partir de `getBoundingClientRect()` do botão, abre para cima
quando não cabe abaixo, e fecha na rolagem (senão ficaria órfã do botão).

### Vermelho → verde (mutação por conserto)

Cinco mutações aplicadas no disco, cada uma revertida em seguida. Suíte
`console-lista-empresas.test.ts` com **53** testes.

| # | mutação | resultado |
|---|---|---|
| M1 | `filtrarOrgs`: `&&` → `\|\|` entre busca e status | **2 falhas** |
| M2 | `estadoDaListaDeEmpresas`: remover o ramo `falhou` | **1 falha** |
| M3 | `conectadas` conta linha crua `status === "connected"` em vez do tile | **1 falha** |
| M4 | `emErro` conta pelos tiles (perde o `google`) | **1 falha** |
| M5 | `page.tsx`: `indisponivel: integracoesIndisponiveis` → `false` | **2 falhas** |
| — | fonte restaurada | **53 passam** |

M3 e M4 são os dois sentidos da mesma classe de equivalência (qual fonte decide cada metade da
coluna). Os controles positivos do próprio arquivo envenenam a fonte REAL para as formas de
texto-fonte, e o `it` final prova que a régua **não** acusa a fonte correta.

### Réguas

| régua | antes | depois |
|---|---|---|
| `tsc --noEmit` (`pnpm --filter web type-check`) | rc=0 | **rc=0** |
| `eslint .` em `packages/web` | 0 erros | **0 erros**, 0 avisos nos arquivos desta story |
| `pnpm --filter web build` | — | **rc=0**, `/platform/orgs` como rota dinâmica |
| suíte completa (`npx vitest run`) | CI verde no base | **302 arquivos, 4096 passam + 6 expected fail** |
| `lib/tenancy` + `painel` + `app/platform` | 17 arquivos / 312 testes | **18 / 367** |

⚠️ **Como esses números foram REmedidos (DOC-001).** A linha de recorte dizia "16 → 18 arquivos /
312 → 370" e não era reproduzível. As duas causas, e a procedência de cada número:

1. **Árvore suja.** O `370` saiu de um `vitest` rodado nesta árvore compartilhada, onde
   `webhook-org.test.ts` carrega ~136 linhas **não commitadas de outra frente** (53 testes na
   árvore, **48** commitados). O estado commitado do recorte é **365** — 370 menos os 5 que não
   são deste commit nem estão no índice.
2. **Fonte trocada por uma que não mede a árvore de trabalho.** A base agora vem do log do CI,
   não de contagem local: run **33453693612** (PR #547, `c2720149`) → **17 arquivos / 312
   testes** no recorte; run **33459113464** (PR #549, `00a3f3c6`) → **18 / 365**. Os dois logs
   trazem a contagem por arquivo do reporter do vitest; somei só os três diretórios. O `312` da
   base estava exato desde o início, e o `17` bate com `git ls-tree` (o `16` era contagem à mão).

**Delta no recorte: +1 arquivo, +53 testes** em `00a3f3c6` (18 / **365**), mais os **2** da
rodada 0.4 → **367**. Esse 367 é composição, não medição direta: 365 (CI, run 33459113464) menos
os 53 de `console-lista-empresas.test.ts` naquele run, mais os **55** que o arquivo tem agora
(`npx vitest run` naquele arquivo). Os outros 17 arquivos do recorte não foram tocados nesta
rodada. O CI confirma o 367 no próximo run — até lá, é aritmética declarada, não log. O que
FECHA a conta aqui: `npx vitest run` nos três diretórios devolve **372** nesta árvore, e 372
menos os **5** que `webhook-org.test.ts` carrega fora do índice dá exatamente **367**.

⚠️ **A suíte inteira roda 4.098 nesta árvore, e isso NÃO é o número desta branch.** O CI do
commit mede **4.082 + 6 xfail**; a diferença de 16 é `+2` desta rodada mais `+14` de três
arquivos de **outras frentes**, não commitados, que convivem na mesma árvore
(`webhook-org.test.ts`, `meta/process-lead.test.ts`, `webhook/whatsapp/__tests__/route.test.ts`:
**123** testes aqui contra **109** no CI). Toda contagem local desta branch tem que descontá-los.

⚠️ **E o `+52` do CI é outra grandeza — não o delta desta story.** A suíte inteira vai de
**301 arquivos / 4.030 passando + 6 xfail** (run 33453693612) para **302 / 4.082 + 6 xfail** (run
33459113464), e `4082 − 4030 = +52`. Essa subtração **mistura duas bases de merge**: os dois são
eventos `pull_request`, mas o #547 tem base `main` e o #549 tem base `story/900-56-57-console-plataforma`
(a pilha). Entre as duas bases há o PR #548, que **acrescentou um teste** a
`app/api/cron/boleto-scan/route.test.ts` — **17** `it` na `main`, **16** na pilha, num arquivo que
este commit nunca tocou (`git diff --name-only c2720149 00a3f3c6` no diretório: vazio). A conta
fecha exatamente: `+53` dentro do recorte `−1` fora dele `= +52` no total. O número honesto para
esta story é **+53**; o `+52` só apareceria se as duas medições tivessem a mesma base, e não têm.

`platform-query-scan.test.ts` ficou **vermelha** com a mudança: ela ancorava no literal
`platformQuery("users", "org_id, id, auth_id")`, e a projeção ganhou `created_at` (exigido por
`AdminDaOrg.criadoEm`, que `pendenciasDeConvite` pede — é a mesma projeção de
`app/platform/page.tsx`). Âncora atualizada. Aproveitei para tornar aquele recorte **fail-closed
explícito**: `indexOf` devolve `-1` quando a âncora some e `slice(-1)` devolve o último caractere
do arquivo.

⚠️ **Correção de redação (TEST-001).** A guarda melhora o DIAGNÓSTICO, não o veredicto. O
contrafactual foi medido pelo @qa: com a âncora quebrada **e** a guarda removida, o teste ainda
falha (`expected '\n' to match /\.eq\("role", "admin"\)/`), porque as duas asserções pós-`slice`
são `toMatch` **positivos** — `slice(-1)` jamais as aprovaria. A afirmação anterior ("poderia
virar aprovação por acidente") é falsa **para este teste**. A forma perigosa do `-1` é a
comparação de ORDEM, e ela existe na régua da base (`console-fail-closed.test.ts:486`) protegida
por dois `ocorrenciasNoCodigo(...) === 1` logo acima; não há furo vivo.

### Validado na tela

Servidor local (`pnpm dev`, `.env.development` → `trifold-crm-dev`, o **mesmo banco** do
`trifold-crm-teste.vercel.app`; a branch não está publicada na Vercel). Sessão de platform admin
de verdade — o e-mail veio de `users.is_platform_admin = true` no banco, não do formato do arquivo
de credenciais, que nunca foi impresso.

| o quê | observado |
|---|---|
| AC1 busca por nome (`?q=emp`) | 3 → **2 empresas**, subtítulo "2 empresas com estes filtros" |
| AC1 busca que só o slug satisfaz (`?q=empresa-a`) | **1 empresa** — o nome é "Empresa A — Teste", com espaços |
| AC1 pelo `<form method="GET">` | digitar "Empresa B" com `?status=ativas` aceso → `?status=ativas&q=Empresa+B`, 1 linha |
| AC2 `?status=inativas` | 0 linhas + "Nenhuma empresa com esses filtros. Limpar filtros" |
| AC2 `?status=lixo` | volta às 3 (allowlist positiva), nenhum filtro aceso |
| AC3 `?pendencia=1` sem pendência real | 0 linhas, vazio FILTRADO |
| AC3 `?pendencia=1` com 1 integração em erro | **exatamente a empresa em erro**, "1 empresa com estes filtros" |
| AC4 coluna | `● 0` com tudo `disconnected`; `● 1  ⚠ 1` após `meta_ads=connected` + `sienge=error` |
| AC5 clique na célula "Usuários" | `/platform/orgs` → `/platform/orgs/00000000-…-0001`; `elementFromPoint` naquele ponto devolve a âncora `A` da empresa |
| AC6 clique no `⋯` | **não navega**; itens `Ver empresa`, `Integrações`, `Copiar identificador`; hrefs corretos |
| AC6 copiar | rótulo vira `Copiado!` e a área de transferência contém `org-teste-epic-900` |
| AC6 menu da última linha | após o conserto, as três opções renderizam inteiras fora do recorte |
| AC7/AC8 | slug como subtítulo monoespaçado; cabeçalhos `EMPRESA · PLANO · ADMIN · INTEGRAÇÕES · USUÁRIOS · STATUS · CRIADA EM · AÇÕES`; Plano `—` em todas |
| console do navegador | **zero erros** |

Para a linha da AC4 foram alteradas TEMPORARIAMENTE duas linhas já existentes de
`org_integrations` no banco de teste (`empresa-a-teste`: `meta_ads` → `connected`, `sienge` →
`error`) e restauradas para `disconnected` em seguida; o script comparou `id:status` de todas as
18 linhas antes e depois e confirmou o estado restaurado. Nenhuma escrita em produção.

### O que NÃO consegui provar

1. **AC9, vazio de partida.** O banco de teste tem 3 empresas, então "Nenhuma empresa ainda.
   Criar a primeira" não pode renderizar ali. Coberto por teste de unidade
   (`estadoDaListaDeEmpresas`) e por régua de texto-fonte com recorte delimitado por ramo, com
   controle positivo que copia o texto do vazio filtrado para o ramo de partida e prova que a
   asserção ingênua sobre o arquivo inteiro ficaria verde.
2. **AC10 na tela.** Chegar ao teto exigiria 1.000 empresas no banco de teste. Coberto por
   unidade (`saturacaoHerdada` nos dois sentidos, e `indisponivel` vencendo a saturação).
3. **Leitura que não volta.** Não derrubei o PostgREST para ver o `—` e o aviso. Coberto por
   unidade e pela régua de call site (`falhou: orgsFalhou || pendenciaFalhou` medido no
   texto-fonte, com o envenenamento para `false` reprovando).
4. **O botão "Reenviar" não disparar a navegação da linha.** As 3 empresas do banco de teste têm
   admin ativo, então nenhum botão "Reenviar" existe na lista hoje (contado: 0). O mecanismo é o
   mesmo do `⋯` (`relative z-10` acima do pseudo-elemento), e esse **foi** medido na tela — o
   clique no `⋯` não navegou. A régua de texto-fonte exige o embrulho `relative z-10` em volta do
   `ReenviarConvite`.
5. **O tile do WhatsApp contando como conectado na TELA.** `whatsapp_config` tem **3 linhas** no
   banco de teste, uma por org, **todas `inactive`** (medido pelo @qa; a afirmação anterior,
   "está vazia", era falsa e era falsificável com uma chamada HTTP). Como nenhuma é `active`, o
   caminho do tile conectado não é alcançável ali sem escrita. Coberto por unidade com a forma exata medida em produção pela QA-900-51-2
   (`org_integrations.whatsapp = disconnected` convivendo com `whatsapp_config.status = active`),
   nos dois sentidos.
6. **CodeRabbit CLI não executado** — o review que vale neste repositório é o GitHub App, e ele
   dispara na abertura do PR (que é do @devops).

### Dívida nomeada — REL-001, deixada de fora DE PROPÓSITO

A coluna **Usuários** é o único contador desta tela **sem declaração**. O `porOrg` sai de
`platformQuery("users", "org_id")` e é renderizado cru: `paginaSaturada(usuarios)` nunca é
calculado e `usuariosFalhou` não entra em `listaIncompleta`. Com `users` no teto do PostgREST
(1.000), aquela célula mostraria um número exato que o sistema não sabe — exatamente o defeito
que a AC10 existe para impedir, na mesma linha da tabela.

**Por que não consertei aqui:** está fora da LETRA da AC10, que nomeia `org_integrations` e o
`users` da pendência, e não o contador da coluna. Medido em produção hoje: **113 usuários** — 11%
do teto. Custo do conserto: `contarComTeto` na leitura de `users` mais um termo em
`listaIncompleta`; é barato, mas é AC nova.

**Candidata natural: `900-61`**, que já mexe em diagnóstico de integração da empresa. Quem abrir
a story leva a régua junto — `paginaSaturada(usuarios)` sem `listaIncompleta` é meia declaração
e não vale.

⚠️ **Não a registrei em `docs/backlog.md` nem no `epic-900`:** os dois arquivos carregam
alterações **não commitadas de outra frente** nesta árvore (26 e 40 linhas), e `git add` de
qualquer um dos dois arrastaria o trabalho alheio para este commit. O registro no backlog fica
para quem é dono daquele bloco.

### File List

**Criados**
- `packages/web/src/lib/tenancy/console-lista-empresas.ts`
- `packages/web/src/lib/tenancy/console-lista-empresas.test.ts`
- `packages/web/src/app/platform/orgs/_components/org-row-menu.tsx`
- `packages/web/src/app/platform/_components/aviso-de-teto.tsx`

**Modificados**
- `packages/web/src/app/platform/orgs/page.tsx`
- `packages/web/src/app/platform/page.tsx` — só a extração do `AvisoDeTeto`, que virou
  compartilhado (a prop `oQue` é obrigatória: o que falta muda com a tela)
- `packages/web/src/lib/tenancy/platform-query-scan.test.ts` — âncora da projeção de admin +
  recorte fail-closed

**Modificados na rodada 0.4 (fechamento das ressalvas)**
- `packages/web/src/app/platform/orgs/_components/org-row-menu.tsx` — `Esc` devolve o foco ao
  botão `⋯` (CodeRabbit no PR #549)
- `packages/web/src/lib/tenancy/console-lista-empresas.test.ts` — a régua do retorno de foco e o
  controle positivo que a envenena (53 → 55 testes)

## QA Results

### Review Date: 2026-09-01
### Reviewed By: Quinn (Test Architect)

**Gate: CONCERNS** → `docs/qa/gates/900.58-lista-de-empresas-busca-filtros-acoes.yml`

As 10 ACs estão implementadas e com carrasco. Nada aqui foi aceito de segunda mão.

**Reproduzido.** A pilha (`git cat-file -e origin/main:<path>`: os 5 ausentes ausentes, os 2
presentes presentes). As **5 mutações declaradas**, com o número exato de vermelhos (2/1/1/1/2),
`tsc` rc=0 antes de cada contagem e `sha256` conferido na restauração. **M3 e M4 têm kill sets
disjuntos** — um teste cada, testes diferentes: a régua discrimina os dois sentidos da classe em
vez de colapsá-los. Mais **7 sondas minhas** (Q1–Q7), todas mortas — inclusive as dos "não
provados" nº 3 (`falhou: orgsFalhou || pendenciaFalhou` → `orgsFalhou`, 3 vermelhos) e nº 4
(tirar o `relative z-10` do `ReenviarConvite`, 1 vermelho). Réguas: `tsc` rc=0, `pnpm lint
--force` rc=0, `eslint` 0 problemas nos 7 arquivos, `build` rc=0 com `/platform/orgs` dinâmica,
suíte 302/4096 + 6 xfail.

**O instrumento que mentiu, reproduzido.** Playwright 1.60 local, sem rede: `<ul absolute>`
dentro de `overflow:hidden` vazando pela borda → `isVisible()` responde **`true`**, e
`elementFromPoint` no centro do último item devolve o `DIV` do contêiner, não o `LI`. Com
`fixed`, `isVisible()` responde `true` também. **`isVisible()` não distingue os dois casos;
`elementFromPoint` distingue.** A régua nova **não** se apoia nele: é texto-fonte
(`position: "fixed"` + `getBoundingClientRect` + fechar na rolagem, medida em par com o
`overflow-hidden` que continua existindo), e a sonda Q4 (`fixed` → `absolute`) a mata em 2
testes.

**Banco de teste restaurado.** `org_integrations` = 18 linhas, todas `disconnected`. Rastro
forense do rollback: exatamente as 2 linhas nomeadas na story carregam `updated_at`
`2026-09-01T01:08:42`, posterior a todas as outras. Alvo `xnxvygyfyyyzwhiuoehz`; produção só
lida (113 users / 1 org / 6 org_integrations — longe do teto).

**As 4 concerns — nenhuma bloqueia:**

1. **DOC-001 (medium).** A linha de recorte da tabela de Réguas não é reproduzível. Declarado
   "16 → 18 arquivos, 312 → 370 testes". Medido: a base `c2720149` tem **17** arquivos de teste
   nesses diretórios, não 16; e o "370" está contaminado — `webhook-org.test.ts` carrega 136
   linhas **não commitadas de outra frente** na árvore compartilhada (48 testes commitados × 53
   na árvore). Estado commitado: **365**. O `312` da base está exato. Delta real deste commit:
   **+1 arquivo, +53 testes**.
2. **DOC-002 (low).** "`whatsapp_config` está vazia no banco de teste" é **falso**: 3 linhas, uma
   por org, todas `inactive`, criadas antes do commit. A conclusão sobrevive (nenhuma é `active`,
   então o tile conectado não é alcançável), mas o motivo escrito não.
3. **REL-001 (low, dívida — não reabrir esta story).** A coluna **Usuários** é o único contador
   desta tela **sem declaração**: `paginaSaturada(usuarios)` nunca é calculado e `usuariosFalhou`
   não entra em `listaIncompleta`. Com `users` no teto, a célula mostra um número exato que o
   sistema não sabe — o defeito que a AC10 existe para impedir, na mesma linha. Fora da letra da
   AC10 e longe do teto hoje.
4. **TEST-001 (low).** O "fail-closed" de `platform-query-scan.test.ts` **não é portador do
   veredicto**. Contrafactual medido: com a âncora quebrada **e** a guarda nova removida, o teste
   ainda falha (`expected '\n' to match /\.eq\("role", "admin"\)/`) — as duas asserções
   pós-`slice` são `toMatch` positivos. A guarda melhora a mensagem, não o veredicto.

**Próximo passo:** DOC-001/DOC-002/TEST-001 são 3 edições de texto na story, sem tocar código.
REL-001 vai para dívida nomeada (candidata natural: `900-61`). O PR é **empilhado** sobre o #547
e não pode ser mergeado antes dele.
