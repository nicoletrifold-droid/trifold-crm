# Validação PO — Story 900-22b (`convite do admin` + `platformQuery()`)

- **Arquivo:** `docs/stories/900-22b-convite-do-admin-e-platformquery.story.md`
- **Épico:** `docs/stories/epics/epic-900-saas-multi-tenant.md` — §10 Onda 2 (`900-21`, `900-22`)
- **Branch:** `story/900-22b-convite-admin` (local `main` = `0a037103`)
- **Entrega anterior auditada:** `544f3d73` (PR #498)
- **Validador:** @po (Pax) · **Data:** 2026-08-28
- **Checklist:** `validate-next-story.md` (10 pontos) + auditoria cética das ACs

## Veredicto

**NO-GO.** Implementation Readiness: **6/10.** Confiança de implementação bem-sucedida: **Média.**

O diagnóstico da story está certo e é verificado — os dois buracos existem, foram medidos contra o
`HEAD`, e a story não inventa nada de arquitetura. O que reprova é a **camada de prova**: três das
ACs de teste (AC-B3, AC-B4, AC-A5) não conseguem ficar vermelhas do jeito que estão escritas, e uma
delas se contradiz internamente. Se implementadas literalmente, a suíte nasce verde sem medir nada —
exatamente o modo de falha que esta story tentou antecipar ao nomear mutações.

Nenhuma correção obrigatória exige repensar o escopo. Todas são cirúrgicas nas ACs.

---

## 1. Verificações factuais pedidas (todas remedidas, nada herdado)

| # | Alegação da story | Resultado | Evidência |
|---|---|---|---|
| 1 | `POST /api/platform/orgs` só lê `name`/`slug`, sem convite | **CONFIRMADO** | `packages/web/src/app/api/platform/orgs/route.ts` — `body: { name?, slug? }`, `db.rpc("provision_org", { p_name, p_slug })`, retorno `{ orgId, name, slug }`. Zero e-mail, zero `users`. |
| 2 | `platformQuery()`/`PLATFORM_READABLE_TABLES` não existem | **CONFIRMADO** | `packages/web/src/lib/tenancy/` contém **apenas** `platform-guard.ts`. `orgs/page.tsx` faz `const db = createAdminClient()` + `db.from("organizations")` / `db.from("users")`, com o comentário invertido ("Quando a Onda 6 trouxer `platformQuery()`"). |
| 3 | O épico manda `platformQuery()` nascer na `900-22` | **CONFIRMADO** | épico linha 829 (AC de `900-22`), linha 562 (tabela de artefatos: nasce `900-22`, endurecida `900-42a`), FR-28 linha 373. |
| 4 | `platform_audit_log` / `platform_audit()` não existem | **CONFIRMADO** | `grep -rn platform_audit supabase/migrations/` → **zero**. Não há `docs/stories/900-16-*`. O épico declara a tabela nascendo na `900-16` (linhas 297, 556, 753-758). |
| 5 | Migration `244` livre | **CONFIRMADO com ressalva** | `origin/main` = `0c2b4eb8`; maior migration = `243_capability_live_coach.sql`. **Ressalva:** a árvore local desta branch só tem até `241` — quem contar localmente escolhe `242` e colide. A instrução da T1 de reconferir contra `origin/main` está correta e é obrigatória. **Segunda ressalva:** já existe colisão viva no repo (`240_followup_nicole_por_lead.sql` **e** `240_provision_org.sql`) — a conferência tem que ser "o número está livre?", não "qual é o próximo?". |
| 6 | Nenhuma AC toca artefato de Onda 3 | **CONFIRMADO** | `PLATFORM_READABLE_TABLES` = `["organizations","users"]` (idêntico ao épico linha 829). Nenhuma AC menciona `plans`, `org_subscriptions`, `org_billing_periods`, `plan_modules`, `org_module_grants`. O `Scope OUT` mantém a menção negativa herdada de `900-21`. Sem inversão de onda. |
| 7 | Reuso do padrão de `brokers/route.ts` | **CONFIRMADO** | `packages/web/src/app/api/brokers/route.ts:62-160` e `api/users/[id]/reset-password/route.ts:33-85` fazem exatamente `createUser` → `users` → `generateLink` → `renderPasswordActionEmail` → `sendEmail`. |
| 8 | `users.name` é `NOT NULL` | **CONFIRMADO** | `001_base_schema.sql:77` (`name varchar(255) NOT NULL`). `role` é enum `user_role` com `'admin'` válido (linhas 49-53). |
| 9 | `sendEmail()` não relança | **CONFIRMADO** | `lib/email.ts` retorna `{ id, error }`. |
| 10 | RLS de `organizations` cobre a coluna nova | **CONFIRMADO** | `004_rls_policies.sql:72`. |

---

## 2. As ACs têm poder discriminante? (auditoria mutação a mutação)

Julguei cada mutação nomeada pelo @sm perguntando *"esse teste realmente cai, ou passa por outro
caminho?"*. Resultado: **4 de 9 mutações não derrubam o teste proposto.**

| AC | Mutação nomeada | Derruba o teste? | Julgamento |
|---|---|---|---|
| A1 | remover `if (!adminEmail)` | **Sim**, se o teste mockar `getPlatformAdmin` | Discriminante. Sem o mock o teste recebe `403`, não `400` — vermelho pelo motivo errado (ver SF-3). |
| A2 | inverter a ordem `UPDATE` ↔ `ensureAdminInvited` | **Sim, se** o teste asseverar ordem de chamadas no fake | O texto pede "consulta direta pós-chamada" a `organizations`, o que exige banco real. Ver SF-2. |
| A3 | remover a checagem de `auth_id` preenchido | **Sim** | Discriminante — desde que o fake possa ser instalado (ver MF-6/SF-1). |
| A4 | remover o guard `getPlatformAdmin()` | **Sim** | Discriminante e limpa. A melhor AC do bloco A. |
| A5 | trocar `\|\|` por `&&` no caso `"pending"` | **NÃO — a função não pode existir como especificada** | Ver MF-4. |
| B1 | apagar o comentário "lista PROVISÓRIA" | **Sim** | Discriminante (regex sobre o conteúdo do arquivo). |
| B2 | remover o `if` de runtime | **Sim** | Discriminante. O `as PlatformReadableTable` no teste é o detalhe certo — sem ele o TS bloquearia em compile-time e o teste mediria o tipo, não a função. |
| B3 | reverter uma das duas trocas | **NÃO** | Ver MF-3. |
| B4 | as 4 formas de varredura | **NÃO (itens 1 e "prova de vermelho")** | Ver MF-1 e MF-2. |

### O caso mais suspeito confirmado: a régua que varre o repo (AC-B4)

Três defeitos independentes, todos verificados:

**(a) A regra declarada não pode ficar vermelha contra a própria prova de vermelho.**
A AC diz varrer *"contra `.from()` **fora da lista**"*. A prova de vermelho proposta é rodar o
scanner contra o `orgs/page.tsx` **anterior** à AC-B3. Mas esse arquivo lê `organizations` e
`users` — **as duas tabelas que ESTÃO na lista**. Um detector que só acende para tabela fora da
lista fica **verde** contra o arquivo que a AC apresenta como a prova de que ele funciona. A regra
útil aqui não é "tabela fora da lista", é **"qualquer `.from(<literal>)` nesses dois diretórios"** —
porque, depois da AC-B3, `platformQuery()` é o único caminho sancionado e ele não emite `.from(`
literal nesses diretórios.

**(b) O item 1 e o item 3 da própria AC se contradizem.**
Item 1 exige que `.from("leads")` sozinho **acenda**. Item 3 diz para ancorar o padrão em
`.from(<literal>)` **seguido de `.select(` na mesma expressão** (para não pegar `Buffer.from`).
Sob a âncora do item 3, o fixture do item 1 (`.from("leads")` sem `.select(`) **não acende**. Uma
das duas tem que mudar.

**(c) A régua se lê a si mesma.**
A T9 coloca o teste em `packages/web/src/app/platform/__tests__/platform-readable-tables.test.ts` —
**dentro** de um dos diretórios varridos. Os fixtures das mutações (`.from("leads")`,
`.from("users").select("*")`) são strings no próprio arquivo de teste: a varredura da árvore real
vai encontrá-los no código-fonte do próprio teste. O desfecho previsível é o @dev "consertar"
excluindo `*.test.ts` da varredura — e a partir daí **as quatro mutações deixam de ser exercíveis**,
sobrando um passeio de diretório que nasce verde e nunca foi provado capaz de acender.

A correção que fecha (a), (b) e (c) de uma vez está em MF-1/MF-2.

---

## 3. A decisão de não alterar `provision_org()` — coerente, mas não propagada

**Pergunta:** a decisão diverge da AC de `900-21` no épico (que pede
`provision_org(p_name, p_slug, p_plan_id, p_admin_email, p_admin_name, p_actor_user_id)`)? Se
diverge, está justificada e registrada, ou é atalho?

**Julgamento: é decisão legítima, não atalho — mas o registro está no lugar errado.**

O que sustenta a decisão (verificado, não aceito por alegação):

1. O comentário de topo da própria `240_provision_org.sql` declara, textualmente, *"Não cria o
   usuário admin. Convite por e-mail é efeito externo, tem que acontecer FORA da transação"*. A
   decisão da story é **coerente com o artefato já em produção**, não com um desenho novo.
2. O CON-7 do épico (duas migrations com `CREATE OR REPLACE` da mesma função, último aplicado ganha
   em silêncio) é risco real e documentado. Zero overload é auditável; dois não são.
3. `900-31` (épico linha 560) é declaradamente a dona de estender a assinatura com `p_plan_id`.
   Deixar uma assinatura viva para ela estender é ordenação correta.

**Três ressalvas, e a terceira é a que gera correção obrigatória:**

- A divergência **não foi introduzida por esta story** — quem entregou `provision_org(text, text)`
  foi o PR #498 (`900-21`). Esta story é a primeira a registrá-la. Isso é mérito, não demérito.
- A razão nº 3 é **parcialmente frágil**: `p_actor_user_id` desaparece junto com a auditoria. Quando
  a `900-16` entrar, `provision_org` provavelmente muda de assinatura de novo (ou a auditoria passa
  a ser gravada pela rota). Ou seja, "exatamente uma assinatura viva para a `900-31` estender" só
  vale se a auditoria ficar **na rota** — o que é uma decisão adicional que a story deveria declarar
  explicitamente, e não declara.
- **O épico continua dizendo a assinatura de 6 argumentos.** Linha 560 da tabela de artefatos e a AC
  de `900-21` (§10) não foram tocadas. O @sm/@dev que draftar a `900-31` vai ler a assinatura antiga
  como alvo. Ver **SF-8**.

---

## 4. Idempotência do convite — parcialmente coberta, com dois furos

Rodei os cenários de reexecução contra as ACs:

| Cenário | Coberto? | Onde |
|---|---|---|
| Reprovisionar mesmo slug ⇒ segunda linha `users` admin | **Sim** | AC-A3.1 (busca antes de inserir) |
| Reenviar para admin **que já logou** ⇒ recriar conta Auth / sobrescrever convite aceito | **Sim, duas vezes** | AC-A3.2 (`already_active`, sem tocar no Auth) **e** AC-A4 (`400 NO_PENDING_INVITE`). Este era o cenário mais perigoso e está fechado. |
| Reenviar quando não há nada pendente | **Sim** | AC-A4 |
| Convite falha ⇒ e-mail se perde | **Sim** | AC-A2 (persistir antes do efeito externo) |
| **E-mail já existe no Supabase Auth** (unicidade global) | **NÃO** | Ver **MF-5** |
| **Reprovisionar mesmo slug com e-mail de admin DIFERENTE** | **NÃO** | Ver SF-4 |
| **Org com mais de um `users(role='admin')`** | **NÃO** | Ver SF-5 |

O furo do e-mail já existente é o mais provável de acontecer no primeiro uso real: o Supabase Auth
tem unicidade global de e-mail, e o operador da Trifold vai testar com um e-mail que já é usuário
(dele mesmo, ou de alguém que já é corretor em outra org). `createUser` falha, a função retorna
`{ status: "failed" }`, **e esse status não vai para lugar nenhum** — a org fica "convite pendente"
para sempre, sem motivo visível, e o botão Reenviar falha em silêncio a cada clique. É precisamente
a falha silenciosa que a story existe para eliminar do outro lado.

---

## 5. `platform_audit_log` fora de escopo — decisão correta, registro incompleto

**Julgamento: manter fora está CERTO. Não torna a story incoerente. Mas o registro é insuficiente.**

Por que está certo:
- O épico é explícito (linhas 753-758) que a tabela **nasce append-only na mesma migration que a
  cria** — `REVOKE UPDATE, DELETE` é *atributo de nascimento, não de refino*. Criar `platform_audit_log`
  aqui, de passagem, sem o desenho completo da `900-16` (`platform_admins`, níveis, `actor_email`
  desnormalizado), é pior que não criar: entrega mutável a trilha do provisionamento do primeiro
  cliente, violando o NFR-13 exatamente no ponto que a `900-16` foi movida de onda para proteger.
- Esta story **não toca `provision_org()`**. A AC de `900-21` que exige `action='org.create'` é da
  função SQL, não desta rota. Não há incoerência interna.
- A `900-16` é dependência declarada tanto de `900-21` quanto de `900-22` (épico: `Dep: 900-19, 900-16`
  e `Dep: 900-16, 900-21`). Ou seja, **o PR #498 já entrou com essa dependência violada**. É dívida
  herdada, não criada aqui.

Por que o registro é insuficiente (**SF-9**):
- A `900-16` **não existe em `docs/backlog.md`** (grep: zero ocorrências de `900-16`). Está registrada
  só no corpo desta story — que vai para `Done` e some do radar. Precisa de item de backlog.
- Mais importante: **esta story adiciona uma superfície mutante NOVA e não auditada** —
  `POST /api/platform/orgs/[id]/resend-admin-invite`, que dispara e-mail e cria conta Auth para um
  cliente, mais o `UPDATE organizations SET admin_invite_email`. Sob D14 (sem impersonation), a
  trilha é o único mecanismo de accountability da Trifold sobre dado de cliente. A story precisa
  dizer, no `Scope OUT`, que está **ampliando** a dívida da `900-16`, não só convivendo com ela.

---

## 6. Checklist de 10 pontos

| # | Item | Status | Nota |
|---|---|---|---|
| 1 | Completude de template | ✅ PASS | Todas as seções de `story-tmpl.yaml` presentes (status, executor-assignment, story, ACs, coderabbit, tasks, dev-notes+testing, change-log, dev-agent-record, qa-results). Zero placeholder. |
| 1.1 | Executor assignment | ✅ PASS | `@dev` executor, `@qa` quality gate, distintos. Coerente com o tipo (código+migration aditiva). Nota sobre `@data-engineer` recomendado-não-bloqueante é proporcional. |
| 2 | Estrutura de arquivos / source tree | ✅ PASS | Todos os paths existem ou são criações declaradas. `lib/tenancy/` confirmado. Seção "Onde NÃO mexer" é um acerto. |
| 3 | Completude de UI | 🟡 PARCIAL | Wizard, badge âmbar/verde/travessão e botão Reenviar especificados; falta o estado de erro do reenvio na UI (ligado a MF-5). |
| 4 | Satisfação das ACs pelas tasks | ✅ PASS | T1-T10 mapeiam 1:1 para AC-A1..A6 e AC-B1..B4. Sem AC órfã, sem task órfã. |
| 5 | Testabilidade / instruções de teste | ❌ **FAIL** | MF-1, MF-2, MF-3, MF-4, MF-6. É o ponto que reprova. |
| 6 | Segurança | 🟡 PARCIAL | AC-A4 (guard no reenvio) é forte. AC-A6 é boa em intenção mas **não verificável** — "verifica por leitura de código" não produz artefato que o QA gate possa checar (SF-6). |
| 7 | Sequência de tasks | ✅ PASS | T1 (migration) → T2/T3 (rota) → T4 (lib) → T5/T6 → T7/T8 → T9/T10. Ordem correta; T8 depende de T7, declarado. |
| 8 | CodeRabbit | ✅ N/A | `coderabbit_integration` ausente de `core-config.yaml` ⇒ desabilitado. A story renderiza o aviso de skip corretamente. |
| 9 | Anti-alucinação | 🟡 PARCIAL | 9 de 10 alegações técnicas conferidas contra arquivo/linha. **Uma é falsa** (MF-6: "não existe precedente de mock"). Referência `contar-a-regua` aponta para memória de agente (`.claude/agent-memory/aios-sm/`), não para artefato do projeto — o @dev não tem como abrir (NTH-1). |
| 10 | Prontidão para o @dev | 🟡 PARCIAL | Contexto técnico é excelente e auto-contido (Dev Notes cobrem `users.name`, `sendEmail`, `getEmailSettings`, RLS, assinatura de `platformQuery`). O que falta é a forma dos testes e 2 caminhos de erro. |

---

## 7. Correções OBRIGATÓRIAS (bloqueiam o GO)

**MF-1 — AC-B4: trocar a regra de "`.from()` fora da lista" para "`.from(<literal>)` em qualquer
lugar dos dois diretórios".**
Justificativa explícita na AC: depois da AC-B3, `platformQuery()` é o único caminho sancionado, e
ele não emite `.from(` literal nesses diretórios; a lista fechada é enforcada em runtime pela AC-B2,
não pelo scanner. Sem essa troca, a própria prova de vermelho da AC (o `orgs/page.tsx` antigo, que
lê `organizations` e `users` — ambas **na** lista) fica verde. Ajustar também os 4 fixtures para
serem consistentes com a âncora escolhida (o fixture do item 1 precisa incluir `.select(` se a
âncora do item 3 exigir `.select(`, ou a âncora precisa ser outra).

**MF-2 — AC-B4: decompor a régua e tirar os fixtures da árvore varrida.**
A AC deve exigir três coisas nomeadas:
(a) um detector **puro e exportado**, ex.: `detectarLeituraCrua(conteudo: string): string[]`, testado
contra as 4 mutações como **strings inline no teste** (é o único jeito de o vermelho ser medido e
commitado, e resolve o "git stash" que não é artefato reproduzível);
(b) um `it` separado que roda o mesmo detector sobre a árvore real dos dois diretórios esperando
zero — **com exclusão explícita de `*.test.ts`, `__tests__/` e `__fixtures__/`**, declarada na AC e
comentada no código com o motivo (senão a régua se lê a si mesma);
(c) um fixture **commitado** com o conteúdo pré-AC-B3 do `orgs/page.tsx`, contra o qual o detector
puro deve acender — é a prova de que a régua pega o problema que existia até este PR.

**MF-3 — AC-B3: o grep proposto já dá zero HOJE. Substituir.**
`orgs/page.tsx` não contém a string `createAdminClient().from(` — o código atual é
`const db = createAdminClient()` na linha do topo e `db.from("organizations")` mais abaixo. Um grep
por `createAdminClient().from(` retorna **zero antes e zero depois**, e a mutação nomeada ("reverter
uma das duas trocas faz o grep voltar a achar uma ocorrência") é **falsa**: reverter para
`db.from("users")` continua dando zero. Poder discriminante nulo.
Substituir por: (i) o arquivo **não importa** `createAdminClient` (assert sobre a linha de import) e
**importa** `platformQuery`; e (ii) o detector puro de MF-2 aplicado ao conteúdo do arquivo devolve
lista vazia. Ambas caem se qualquer uma das duas trocas for revertida.

**MF-4 — AC-A5: a assinatura de `deriveAdminInviteStatus` não comporta os casos que a própria
story exige.**
Com `{ adminInviteEmail, adminAuthId }`, os casos 3 e 4 da seção Testing têm **entradas idênticas**
(`adminInviteEmail: null, adminAuthId: null`) e resultados **diferentes** (`"pending"` vs `"none"`).
A função não distingue "não existe linha de admin" de "existe linha de admin com `auth_id` nulo" —
que é justamente a diferença entre "convite pendente" e "org legada sem rastro". Nenhuma
implementação passa nos dois testes; o @dev vai inventar a saída.
Corrigir a assinatura para carregar o terceiro estado, ex.:
`deriveAdminInviteStatus({ adminInviteEmail, adminUserId, adminAuthId })` ou
`({ adminInviteEmail, admin: { id, authId } | null })`. Corrigir também "3 casos nomeados" (a AC)
vs. 4 casos listados (Testing), e reescrever a mutação `||`→`&&` contra a assinatura nova.

**MF-5 — AC nova: e-mail já existente no Supabase Auth (unicidade global).**
Definir o comportamento e torná-lo visível. Mínimo aceitável: `ensureAdminInvited` persiste o motivo
da falha (mensagem do `authError`) — em coluna, em log estruturado ou no retorno da rota de reenvio —
e a rota de reenvio devolve essa mensagem ao operador (o precedente `brokers/route.ts:78` devolve
`authError.message` com `400`). Sem isso, "convite pendente" vira um estado terminal sem diagnóstico
e o botão Reenviar falha em silêncio indefinidamente. Incluir o caso na UI (AC-A5 / T6).

**MF-6 — Corrigir a alegação falsa da seção Testing sobre ausência de precedente de mock.**
A story afirma: *"nenhum teste aqui faz mock do Supabase Auth Admin API porque não existe precedente
disso no repositório"* e *"testes de rota neste projeto são majoritariamente funções puras
extraídas"*. **Falso, e medido:** há 20+ `*.test.ts` com `vi.mock`, e ≥10 com
`vi.mock("@web/lib/supabase/admin", ...)`. `packages/web/src/app/api/brokers/route.test.ts` —
o teste do **exato arquivo** que esta story declara reusar — já mocka `@web/lib/supabase/admin`,
`@web/lib/email` (`sendEmail`) e `@web/lib/email-layout` (`renderPasswordActionEmail`), e monta um
builder falso `from(table) → { select, eq }`.
Isso importa porque a alegação é o que justifica empurrar o caminho mais arriscado (criação de conta
Auth de cliente, idempotência, falha parcial) para **validação manual**. Com o precedente, a
verificação automatizada é uma extensão trivial do padrão existente. Corrigir a justificativa e
apontar `brokers/route.test.ts` como o padrão a seguir.

---

## 8. Correções recomendadas (não bloqueiam, mas o @dev vai tropeçar)

- **SF-1 — `ensureAdminInvited(orgId, email)` não tem como receber o "client fake".** A AC-A3 pede um
  "objeto literal implementando só `createUser`/`generateLink`", mas a assinatura não recebe client e
  a função também precisa de `.from("users")` (select/insert/update). Resolver via
  `vi.mock("@web/lib/supabase/admin")` (padrão de `brokers/route.test.ts`, ver MF-6) **ou** por
  injeção explícita (`deps = { db, auth }`). Declarar qual, senão o @dev decide na hora e o teste
  vira mock de biblioteca disfarçado.
- **SF-2 — AC-A2: "consulta direta pós-chamada" a `organizations` exige banco real**, que a suíte
  Vitest não tem. Reescrever como asserção de **ordem de chamadas** no client falso: o
  `update({ admin_invite_email })` em `organizations` foi registrado **antes** da chamada de convite.
  Assim a mutação "inverter a ordem" fica de fato vermelha. Idem para o "`to_regclass`/`information_schema`
  acusa a ausência" — isso não roda no Vitest; se for critério, é conferência manual no banco de dev,
  e deve estar na seção Manual.
- **SF-3 — AC-A1: nomear os mocks.** O teste de `POST` sem `adminEmail` precisa mockar
  `@web/lib/tenancy/platform-guard` (`getPlatformAdmin`) e `@web/lib/supabase/admin`; sem isso o
  handler devolve `403` e o teste falha pelo motivo errado. Notar que `route.test.ts` hoje só importa
  `slugify` e não tem nenhum `vi.mock` — o arquivo muda de natureza.
- **SF-4 — Reprovisionar o mesmo slug com e-mail de admin DIFERENTE.** `provision_org` é idempotente,
  a rota grava o novo `admin_invite_email`, `ensureAdminInvited` encontra o admin ativo e devolve
  `already_active` — o segundo e-mail é **silenciosamente ignorado** e a coluna fica com um endereço
  que nunca será convidado. Definir: rejeitar (`409`), ou ignorar avisando o operador. Hoje a AC não
  diz nada e o operador vê sucesso.
- **SF-5 — Org com mais de um `users(role='admin')`.** A AC-A3.1 diz "busca `users` por
  `(org_id, role='admin')`" sem definir desempate; a org legada da Trifold quase certamente tem mais
  de um. Especificar seleção determinística (`order by created_at asc limit 1`, ou casar por `email`).
- **SF-6 — AC-A6 não é verificável.** "Verifica por leitura de código" não deixa artefato para o QA
  gate, e o épico moveu essa AC de onda **porque é vetor de escalada cross-tenant**. Teste de 3 linhas
  que fecha: `POST` com `{ name, slug, adminEmail, orgId: "<outra-org>" }` no corpo e asserção de que
  a linha `users` criada usa o `orgId` retornado por `provision_org`, não o do corpo.
- **SF-7 — AC-B2 alega antecipar "nunca `select('*')` em `users`" e não antecipa.** Tornar `columns`
  obrigatório **não** impede `platformQuery("users", "*")`. Ou remover a alegação, ou rejeitar `"*"`
  em runtime (duas linhas) — o que também fecha o furo que a varredura da AC-B4 item 4 não alcança
  (ela procura `.from("users").select("*")` literal, padrão que deixa de existir justamente depois da
  AC-B3).
- **SF-8 — Propagar a divergência de `provision_org` para o épico.** Linha 560 da tabela de artefatos
  incrementais e a AC de `900-21` (§10) ainda declaram a assinatura de 6 argumentos. Adicionar
  addendum: assinatura entregue = `(p_name, p_slug)`; `p_admin_email`/`p_admin_name` resolvidos na
  camada de rota (`900-22b`); `p_actor_user_id` pendente junto com a `900-16`; `p_plan_id` continua
  sendo trabalho da `900-31`. Sem isso, quem draftar a `900-31` lê o alvo errado — mesmo tipo de
  quebra de rastreabilidade que motivou a renumeração `900-15`→`900-14b`.
- **SF-9 — Registrar a dívida da `900-16` no backlog e declarar a ampliação.** `900-16` não aparece
  em `docs/backlog.md`. Abrir item ("`platform_audit_log` + `platform_audit()` + `platform_admins`
  com níveis — dependência declarada de `900-21`/`900-22`, não entregue no PR #498") e acrescentar
  no `Scope OUT` desta story que ela **adiciona** superfície mutante não auditada
  (`resend-admin-invite`, `UPDATE admin_invite_email`), aumentando a dívida em vez de apenas
  conviver com ela.
- **SF-10 — `app_metadata: { role: "admin" }` no `createUser` (Story 75-205).** Ausente da AC-A3.3
  ("mesmo padrão de `brokers/route.ts`" é vago demais para um detalhe que os **três** precedentes
  marcam com comentário explícito: `brokers/route.ts:73,172,281`, `users/route.ts:76`,
  `users/[id]/reset-password/route.ts:43`). Sem ele o admin novo cai no fallback de
  `middleware.ts:getUserRole` (query extra por request).
- **SF-11 — Construção do link com `hashed_token` (Story 75-139).** A AC-A3.3 cita
  `generateLink({ type: "recovery", redirectTo })` e para aí. O detalhe que faz o convite funcionar é
  usar `linkData.properties.hashed_token` para montar
  `${siteUrl}/auth/callback?token_hash=…&type=recovery&next=/reset-senha` — **`action_link` não chega
  em `/reset-senha`**, e isso já queimou uma vez (comentário idêntico em `brokers/route.ts:139` e
  `reset-password/route.ts:69`). Nomear na AC.
- **SF-12 — Corte de 1000 linhas do PostgREST no `select` de `users`.** A AC-B3 passa a derivar o
  badge de admin da mesma leitura sem filtro que hoje só conta usuários
  (`platformQuery("users", "org_id, role, auth_id")`). Numa org grande, a linha do admin pode cair
  fora das 1000 primeiras e o badge mostra o estado errado — mesma classe do defeito corrigido na
  Story 75-198 (`brokers/route.ts:27-29`). Filtrar `role='admin'` numa consulta dedicada, ou paginar.
- **SF-13 — Declarar o que a régua NÃO cobre.** Sob a âncora `.from(<lit>)` + `.select(`, as
  **escritas** desta própria story (`db.from("organizations").update(...)` na rota, e todo o
  `lib/tenancy/admin-invite.ts`, que fica fora dos dois diretórios varridos) passam livres — por
  desenho, já que `platformQuery()` é mecanismo de leitura. Dizer isso explicitamente na AC-B4, senão
  o próximo leitor conclui que o acesso a dado de plataforma está integralmente coberto.

---

## 9. Melhorias opcionais

- **NTH-1 — Referência `contar-a-regua` não é acessível ao @dev.** Ela resolve para
  `.claude/agent-memory/aios-sm/feedback_contar_a_regua_e_quebrar_colinearidade.md` — memória de
  outro agente, não artefato do projeto. Ou inlinar a convenção (uma frase: "toda régua declara
  literal / multilinha / homônimo") ou citar o path completo.
- **NTH-2 — Reconferência de migration: procurar colisão, não sucessor.** Já existem dois `240` no
  repo (`240_followup_nicole_por_lead.sql`, `240_provision_org.sql`). A T1 deve dizer "confirmar que
  `244` não existe em `origin/main`", não "pegar o próximo número".
- **NTH-3 — Complexidade declarada `M` parece subestimada:** 2 blocos independentes, 10 tasks, ~9
  arquivos, 1 migration, 1 endpoint novo, 4 arquivos de teste. Considerar `G`, ou avaliar se o Bloco B
  (`platformQuery`) sai em PR separado — ele não depende do Bloco A e é o que destrava a `900-35`.
- **NTH-4 — Limpar `admin_invite_email` no caminho `already_active`.** A AC-A3.4 só limpa em caso de
  sucesso do passo 3; no caminho `already_active` o endereço fica persistido para sempre (dado
  pessoal parado sem função). A precedência de `"active"` sobre `"pending"` na AC-A5 esconde o efeito
  na UI, mas o dado continua lá.

---

## 10. O que está bom e deve ser preservado na revisão

Registro explícito para que a correção não desfaça o que já está certo:

- Todo o diagnóstico dos dois buracos é **medido contra o `HEAD`**, com arquivo e comportamento
  atual citados. Zero herança de documento.
- A decisão de `provision_org()` está registrada **na story**, com quatro razões ordenadas por peso e
  ancorada no CON-7 do épico. Falta só propagar (SF-8).
- A menção negativa a `platform_audit_log` segue o padrão que o próprio épico exige (linha 579: *"uma
  menção negativa vale mais que a ausência de menção"*).
- AC-A4 e AC-B2 são as duas ACs mais bem construídas do documento: guard removível ⇒ `403` some;
  `if` de runtime removível ⇒ o `throw` some. O `as PlatformReadableTable` no teste da AC-B2 é
  precisamente o detalhe que impede o teste de medir o tipo em vez da função.
- A cobertura de "reenviar para admin já ativo" está fechada por **duas** ACs independentes
  (A3.2 e A4) — era o cenário destrutivo mais plausível e está protegido em profundidade.
- Dev Notes antecipam corretamente `users.name NOT NULL`, o `sendEmail()` que não relança, o
  `getEmailSettings` sem seed, e a razão de a RLS não precisar de migration nova.

---

## 11. Caminho para o GO

1. MF-1 + MF-2 + MF-3 → reescrever AC-B3 e AC-B4 (a régua e a prova dela).
2. MF-4 → corrigir a assinatura de `deriveAdminInviteStatus` e os 4 casos de teste.
3. MF-5 → AC nova para e-mail já existente no Auth, com o erro chegando ao operador.
4. MF-6 → corrigir a seção Testing e apontar `brokers/route.test.ts` como padrão.
5. Aplicar SF-1..SF-13 no que for barato (SF-8/SF-9 são de rastreabilidade e custam 2 edições).
6. Revalidar. Com MF-1..MF-6 fechados, a story vai para **9/10** — a base técnica já está no lugar.

*Revalidação pelo @po antes de acionar o @dev.*

— Pax, equilibrando prioridades 🎯

---
---

# Revalidação — Story 900-22b v0.2

- **Data:** 2026-08-28 · **Validador:** @po (Pax)
- **Escopo:** as 6 correções obrigatórias da v0.1 + as edições fora da story (épico, backlog)
- **Método:** cada alegação conferida contra o arquivo; o detector proposto foi **executado**
  contra o código real, não lido.

## Veredicto v0.2

**NO-GO.** Implementation Readiness: **8/10** (era 6/10). Confiança: **Média-Alta.**

Cinco das seis correções obrigatórias estão **fechadas e verificadas**. A sexta — a régua estática —
teve a **estrutura** corrigida exatamente como pedido (detector puro exportado, fixtures inline,
fixture commitada fora dos diretórios varridos, exclusões declaradas, regra reescrita para "qualquer
`.from(<literal>)`"), mas o **regex concreto que a story agora especifica não implementa a regra que
a story declara**. Rodei o detector contra o código real: ele falha na própria asserção que a AC-B4
exige, e a mutação nomeada da AC-B3 continua não ficando vermelha.

É a mesma classe de defeito da v0.1 numa forma nova — só que agora é **um regex**, não um redesenho.
O caminho para o GO é curto e mecânico.

---

## A. Placar das 6 correções obrigatórias

| MF | O que era | Status v0.2 | Evidência |
|---|---|---|---|
| MF-1 | Regra "fora da lista" não acendia contra a própria prova | 🟡 **PARCIAL** | Texto corrigido (AC-B4 linha 385: *"qualquer `.from(<literal>)` … — não 'tabela fora da lista'"*), com a justificativa certa (a lista é enforçada em runtime pela AC-B2). Grep por "fora da lista" no arquivo: 5 ocorrências, **todas legítimas** (citação do FR-28, AC-B2 runtime, e as duas que negam explicitamente). **Mas o regex não realiza a regra** — ver §B. |
| MF-2 | Régua se lia a si mesma; "git stash" não é artefato | ✅ **FECHADO** | Detector puro exportado em `lib/tenancy/platform-query-scan.ts` (fora dos dois diretórios varridos). Fixtures inline (3 formas). `it` separado sobre a árvore real com exclusão de `*.test.ts`/`__tests__/`/`__fixtures__/` **declarada na AC** e com exigência de comentário no código explicando o motivo. Fixture commitada em `lib/tenancy/__fixtures__/orgs-page-pre-900-22b.txt` — fora de `app/platform/**` e `app/api/platform/**`, portanto não depende da exclusão para não se autodetectar. Estrutura correta. |
| MF-3 | Grep `createAdminClient().from(` dava zero antes e depois | 🟡 **PARCIAL** | O grep vazio saiu; entrou a asserção certa (arquivo **não importa** `createAdminClient`, **importa** `platformQuery`) + `detectRawTableReads()` devolvendo `[]`. **Mas a mutação nomeada voltou a ser falsa** — ver §B.3. |
| MF-4 | 2 casos de teste com entradas idênticas e saídas diferentes | ✅ **FECHADO** (com lacuna de mutação, ver SF-A) | Assinatura nova `{ adminInviteEmail, admin: { id, authId } \| null }`. Os 4 casos da seção Testing têm entradas **de fato distintas**: `(null, {id,authId})`, `("x@acme.com", {id,authId:null})`, `("x@acme.com", null)`, `(null, null)`. Nenhum par colide. Mutação 2 (`admin?.authId`→`admin?.id`) é nova, perigosa e corretamente nomeada nos dois lados (AC-A3 e AC-A5). |
| MF-5 | E-mail já existente no Auth ficava silencioso | ✅ **FECHADO** | AC-A7 nova. `{status:"failed", message}` propagado: criação devolve `201` + `adminInvite:{status,message}` (sem rollback, correto); reenvio devolve `400 ADMIN_INVITE_FAILED` com a mensagem, citando o precedente real `brokers/route.ts:78`. Mutação nomeada ("engolir o `message`") derruba o teste da rota. |
| MF-6 | Alegação falsa de ausência de precedente de mock | ✅ **FECHADO** | Seção Testing reescrita, com a autocorreção explícita e os números certos (20+ com `vi.mock`, ≥10 com `vi.mock("@web/lib/supabase/admin")`). Honesto no detalhe que importa: reconhece que **nenhum** teste hoje exercita `auth.admin.createUser` e que o builder de `.from("users")` precisa ser construído — sem transformar isso em desculpa para empurrar o caminho para manual. O caminho Auth/DB voltou para Vitest (AC-A1, A3, A6, A7 + `resend-admin-invite/route.test.ts` novo). |

---

## B. O bloqueio: o regex do `detectRawTableReads` não implementa a regra declarada

Executei o detector exatamente como a AC-B4 o especifica, contra o código real do repositório.

```js
const pattern = /(\w+)\.from\(\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s*\)/g
```

O `(\w+)` exige que o receiver esteja **coladinho** no `.from(`. Três consequências medidas:

### B.1 — A fixture commitada NÃO produz o resultado que a AC exige (bloqueante)

A AC-B4 item 3 declara: *"`detectRawTableReads()` aplicado a esse fixture **deve** devolver
`["organizations", "users"]` — é a prova, reproduzível e commitada, de que o detector pega o
problema que existia até este PR."*

Medido contra o `orgs/page.tsx` real (que é o que a fixture reproduz):

```
detectRawTableReads(page.tsx pré-story) => ["users"]
AC-B4 exige                             => ["organizations","users"]
```

Motivo: `packages/web/src/app/platform/orgs/page.tsx:29-30` é

```
  const { data: orgs } = await db
    .from("organizations")
```

— receiver `db` na **linha anterior**. O `(\w+)\.` não atravessa a quebra de linha. A leitura de
`users` (linha 41) é adjacente (`await db.from("users")`) e por isso essa aparece.

**Por que isso é bloqueante e não cosmético:** a AC coloca o @dev diante de uma asserção
insatisfazível. O desfecho ruim é o provável: **editar a fixture** (juntar `db` e `.from(` numa
linha) para a asserção fechar. Aí a "fixture commitada do código pré-story" deixa de ser o código
pré-story, e a prova de vermelho volta a ser encenação — exatamente o defeito que a v0.1 foi
reprovada por ter.

### B.2 — O detector é cego para a forma dominante do repositório (bloqueante)

Varri os 1.175 arquivos `.ts`/`.tsx` de `packages/web/src`:

| Forma de `.from("<literal>")` | Ocorrências | O regex pega? |
|---|---|---|
| receiver adjacente (`db.from("x")`) | **244** | sim |
| receiver na linha anterior (`await db\n  .from("x")`) | **1.511** | **não** |
| receiver é chamada (`createAdminClient().from("x")`) | **13** | **não** |

A forma cega é **6× mais comum** que a forma coberta — é o que o Prettier produz para query
encadeada, e é o que os próprios arquivos de `/platform` já usam hoje (`orgs/page.tsx:29`,
`platform-guard.ts:37,54`). Um scanner que varre a árvore real e devolve `[]` porque não enxerga a
forma que o repo usa é a definição de régua que nasce verde: ela ficaria verde mesmo se o @dev
esquecesse de migrar `orgs/page.tsx` inteiro, desde que o Prettier quebrasse a linha.

As 3 fixtures inline da AC não descobrem isso: "multilinha" ali é *argumento* multilinha
(`db.from(\n "leads"\n)`, que o `\s*` cobre), não *receiver* em linha anterior — que é a forma real.

### B.3 — A mutação nomeada da AC-B3 continua falsa (recorrência de MF-3)

AC-B3 diz: *"reverter qualquer uma das três leituras para `createAdminClient().from(...)` faz
`detectRawTableReads()` voltar a encontrar o literal"*. Medido:

```
detectRawTableReads('createAdminClient().from("leads").select("id")') => []
```

O receiver é uma **chamada**, não um identificador; `(\w+)` não casa `)`. A mutação nomeada, escrita
com a string literal que a própria AC-B3 usa no texto ("Troca `createAdminClient().from("organizations")…`"),
**não fica vermelha**. É a MF-3 de volta, com outro mecanismo.

Sobra a primeira metade da asserção da AC-B3 (o arquivo não importa `createAdminClient`), que é real
e discriminante — então a AC-B3 não está morta, está com uma das duas pernas quebrada.

### Correção requerida (MF-A) — uma linha de regex + um caso de fixture

Ancorar no `.from(` e tratar o receiver por exclusão, em vez de exigir um identificador colado:

```ts
// casa `db.from("x")`, `await db\n  .from("x")` e `createAdminClient().from("x")`;
// exclui `Buffer.from` / `Array.from` olhando o que vem imediatamente antes do ponto.
const pattern = /(?:^|[^\w$])(\w*)\s*\.\s*from\(\s*["']([a-zA-Z_]\w*)["']\s*\)/g
```
(ou qualquer forma equivalente — o que a AC precisa **fixar** não é a implementação, é o conjunto de
formas que ela obriga a acender.)

E acrescentar às fixtures inline do item 1 as **duas** formas que hoje escapam, como casos nomeados:

4. **receiver em linha anterior:** `` await db\n  .from("leads")\n  .select("id") `` → `["leads"]`
   — é a forma dominante do repo (1.511 ocorrências) e a do próprio `orgs/page.tsx`.
5. **receiver como chamada:** `createAdminClient().from("leads").select("id")` → `["leads"]`
   — é a forma que a mutação da AC-B3 usa.

Com isso, a asserção `["organizations","users"]` da fixture commitada passa a fechar **sem tocar na
fixture**, e a mutação da AC-B3 volta a ser verdadeira. Manter o caso homônimo (`Buffer.from`,
`Array.from` → `[]`) como está — ele continua sendo o guarda contra falso positivo.

---

## C. Focos pedidos pelo coordenador

**1. A fixture commitada realmente acende?** **Não, não completamente.** A regra escrita está certa
("qualquer `.from(<literal>)`", sem resquício de "fora da lista" — grep conferido, 5 ocorrências
todas legítimas). O que falha é o regex: acende `users` e **não** acende `organizations`, contra a
asserção `["organizations","users"]` que a própria AC declara. Ou seja: o defeito não é mais
conceitual (regra errada), é de implementação (regra certa, régua torta). §B.1.

**2. O detector fugiu da autoleitura?** **Sim, e bem.**
- `platform-query-scan.ts` (o detector) → `lib/tenancy/`, **fora** dos dois diretórios varridos.
- Fixture commitada → `lib/tenancy/__fixtures__/`, **fora** dos dois diretórios. A story explicita
  que por isso ela nem depende da exclusão de `__fixtures__/` — raciocínio correto, e a convenção
  fica valendo para fixtures futuras que caiam dentro.
- `platform-query.ts` → também em `lib/tenancy/`, **não é varrido**. E, ainda que fosse, seu
  `db.from(table)` usa **variável**, não literal — o regex exige `["']`. Duplamente seguro.
- **Único ponto não declarado:** o **caminho do arquivo de teste** do scanner. A T10 e a seção
  Testing dizem `platform-query-scan.test.ts` sem path. Se ficar ao lado do detector em
  `lib/tenancy/`, está fora da varredura; se for para `app/platform/__tests__/`, a exclusão declarada
  o cobre. Os dois desfechos são seguros — mas vale fixar (SF-A) para não depender de sorte.

**3. Os 4 casos têm entradas de fato distintas?** **Sim, verificado par a par** — nenhum par de
entradas colide, e as saídas esperadas são coerentes com a implementação de 3 linhas apresentada na
AC-A5. MF-4 fechado. **Ressalva não bloqueante em SF-B:** falta o caso que prova que o campo novo é
load-bearing.

**4. Edições no épico e no backlog?** **Corretas, no lugar certo, e estritamente aditivas.**
`git diff` mostra 3 hunks, **zero remoções**:
- Épico linha 561 — nova linha na tabela de artefatos incrementais, imediatamente **abaixo** da linha
  original de `provision_org()` (que fica intacta), marcada como "nota de rastreabilidade", datada,
  citando `900-22b`, e dizendo o que interessa: *"Quem draftar a `900-31` deve ler esta linha antes
  de assumir a assinatura de 6 argumentos de `§7.4` como alvo — o alvo real … é `(p_name, p_slug,
  p_plan_id)`"*.
- Épico linha ~819 — bullet novo no fim do bloco de AC de `900-21`, antes do `**Dep:**`. Não altera
  nenhuma AC existente; acrescenta o estado real e amarra `p_actor_user_id` à `900-16`.
- `docs/backlog.md` — item `[Epic 900] 🟡 900-16 …` no topo de "Pendente", P1, com origem rastreada
  a este parecer, os números remedidos (linhas 297/556/753-758 do épico, zero em migrations, zero
  story), a constatação de que o PR #498 entrou com a dependência violada, e — o que eu tinha pedido
  explicitamente — o registro de que a `900-22b` **amplia** a dívida, nomeando as duas superfícies
  novas sem trilha.

SF-8 e SF-9 fechados. Nada além do registro da divergência foi tocado.

---

## D. Correções obrigatórias da v0.2 (curtas)

**MF-A — Consertar o regex de `detectRawTableReads` e ampliar as fixtures inline.** §B acima. Sem
isso, a fixture commitada não fecha a asserção que a AC exige (o @dev tende a "consertar" editando a
fixture, matando a prova), a varredura da árvore real é cega para 1.511 das 1.768 ocorrências reais
da forma que ela existe para pegar, e a mutação nomeada da AC-B3 permanece falsa. Duas fixtures
novas: receiver em linha anterior e receiver como chamada.

**MF-B — Acrescentar o 5º caso de `deriveAdminInviteStatus`: `{ adminInviteEmail: null, admin: { id: "u1", authId: null } } → "pending"`.**
Os 4 casos atuais **não matam** a mutação que remove o campo recém-adicionado: se alguém trocar
`if (input.admin || input.adminInviteEmail)` por `if (input.adminInviteEmail)`, os quatro continuam
verdes (caso 2 tem e-mail preenchido, caso 3 tem e-mail preenchido, casos 1 e 4 não passam por esse
`if`). Ou seja, o conjunto de testes **não prova que `admin` é load-bearing** — que era a razão de
existir da correção MF-4. O caso novo é a única entrada em que `admin` decide sozinho, e ele também
é um estado real do sistema (admin criado por AC-A3.1, e-mail limpo pelo caminho `already_active` da
AC-A3.2). Uma linha de teste.

---

## E. Recomendações (não bloqueiam)

- **SF-A — Fixar o caminho de `platform-query-scan.test.ts`.** Sugestão: `lib/tenancy/`, ao lado do
  detector e da fixture, fora dos diretórios varridos — assim a segurança não depende da exclusão.
- **SF-B — Declarar que o `it` de varredura só lê `.ts`/`.tsx`.** Não está dito; sem isso, um
  `.md`/`.json` dentro de `app/platform/**` com um trecho de código de exemplo acende a régua e o
  próximo dev afrouxa a exclusão para calar o ruído.
- **SF-C — AC-A7: o aviso não bloqueante e o `router.push` se atropelam.** A AC diz que o wizard
  *"mostra um aviso não bloqueante com a mensagem **e** redireciona para `/platform/orgs`"*. O
  wizard atual (`orgs/new/page.tsx`) faz `router.push` + `router.refresh` no sucesso — o aviso some
  antes de ser lido. Definir: ou o aviso exige um clique para continuar, ou não redireciona no caso
  `failed`, ou a mensagem viaja para a lista. Como está, a mensagem que a AC-A7 existe para tornar
  visível pode não chegar ao operador na criação (no reenvio chega, porque a tela não navega).
- **SF-D — Nota da tabela do épico usa as colunas como prosa.** A linha nova preenche
  "nasce/estende/dono" com texto corrido em vez dos IDs de story que as outras linhas usam. É
  legível e está ao lado da linha certa, mas quebra o formato da tabela — considerar um rodapé
  abaixo da tabela, com a linha original ganhando só um "⚠️ ver nota".

---

## F. Caminho para o GO

1. MF-A (regex + 2 fixtures inline) e MF-B (1 caso de teste) — ambos cirúrgicos.
2. SF-A a SF-D se couberem no mesmo passe.
3. Revalidação: com MF-A e MF-B fechados a story vai para **9/10** e libera o @dev.

O que a v0.2 já resolveu é substancial e não deve ser mexido: a estrutura decomposta da régua, a
assinatura de `deriveAdminInviteStatus`, a AC-A7, a seção Testing corrigida com autocrítica
explícita, os treze SF, e as duas edições de rastreabilidade fora da story — que estão certas e são
o tipo de trabalho que costuma ser esquecido.

— Pax, equilibrando prioridades 🎯

---
---

# Revalidação — Story 900-22b v0.3

- **Data:** 2026-08-28 · **Validador:** @po (Pax)
- **Escopo:** MF-A e MF-B (bloqueantes da v0.2) + SF-A/SF-B/SF-C + as duas armadilhas do padrão novo
- **Método:** o regex foi **executado** contra o código real, as 5 fixtures, as armadilhas de
  receiver vazio e o `platform-query.ts`; as 3 mutações de `deriveAdminInviteStatus` foram
  **simuladas** contra os 5 casos. Nada foi aceito por leitura.

## Veredicto v0.3

# ✅ **GO** — Implementation Readiness **9/10** · Confiança: **Alta**

As duas pendências bloqueantes estão fechadas, e fechadas de verdade — não no texto, na medição.
A régua estática desta story passou a ser a mais bem instrumentada que já validei neste epic: ela
tem **vermelho medido na árvore real**, não só em fixture.

---

## A. MF-A — regex de `detectRawTableReads` · **FECHADO**

Rodei o padrão novo `(?:^|[^\w$])(\w*)\s*\.\s*from\(\s*["']([a-zA-Z_]\w*)["']\s*\)` contra tudo que
a AC-B4 exige:

| Fixture exigida pela AC-B4 item 1 | Resultado | Esperado |
|---|---|---|
| literal `db.from("leads")` | `["leads"]` | ✅ |
| argumento multilinha `db.from(\n "leads"\n)` | `["leads"]` | ✅ |
| **receiver em linha anterior** `await db\n .from("leads")` | `["leads"]` | ✅ **(era o furo da v0.2)** |
| **receiver como chamada** `createAdminClient().from("leads")` | `["leads"]` | ✅ **(era o furo da v0.2)** |
| homônimo `Buffer.from` / `Array.from` | `[]` | ✅ |

**A asserção do item 3 agora fecha sem editar a fixture** — este era o ponto exato do NO-GO:

```
detectRawTableReads(orgs/page.tsx pré-story) => ["organizations","users"]
AC-B4 item 3 exige                           => ["organizations","users"]
```

**E a mutação nomeada da AC-B3 voltou a ser verdadeira:** `createAdminClient().from("leads")` agora
devolve `["leads"]` (na v0.2 devolvia `[]`). A recorrência de MF-3 está fechada.

### Bônus que a story não reivindica, e vale registrar

Rodei a varredura **exatamente como a AC-B4 item 2 a especifica** (`.ts`/`.tsx`, excluindo
`*.test.ts`/`__tests__/`/`__fixtures__/`) contra a árvore real de hoje:

```
packages/web/src/app/platform/orgs/page.tsx => ["organizations","users"]
total de hits hoje (pré-AC-B3): 2 | arquivos varridos: 4
```

Ou seja: **o `it` de varredura da árvore real nasce VERMELHO hoje e só fica verde depois que a
AC-B3 migrar o arquivo.** Isso é estritamente mais forte do que a story promete (ela só reivindica
"nasce verde contra o código pós-story, com a fixture provando o vermelho"). A régua tem vermelho
próprio, medido, na árvore de verdade — a colinearidade que motivou os dois NO-GO anteriores está
eliminada na raiz, não contornada.

### Armadilha (a) — `(\w*)` aceita vazio: testada, **não compromete**

| Entrada | Resultado | Julgamento |
|---|---|---|
| `.from("leads")` sem receiver nenhum | `["leads"]` | **Correto e desejado** — é literalmente o shape de uma linha de continuação (`await db` ⏎ `.from("x")`) vista isoladamente. Acender é o comportamento certo. |
| `Buffer.from("hex")`, `Buffer .from(...)`, `Buffer\n .from(...)` | `[]` | ✅ A exclusão sobrevive às três formas — o regex é guloso da esquerda para a direita e captura `Buffer` antes de tentar o casamento vazio. Era o risco real do `(\w*)`, e ele não se concretiza. |
| `// legado: db.from("leads")` (comentário de linha) | `["leads"]` | Falso positivo — ver condição C-1. |
| `/* db.from("leads") */` (comentário de bloco) | `["leads"]` | Falso positivo — ver condição C-1. |
| trecho de SQL em template string | `["leads"]` | Falso positivo — ver condição C-1. |

Os falsos positivos **falham na direção segura**: fazem o teste ficar **vermelho** quando o código
está certo (ruído, visível, autocorretivo), nunca **verde** quando o código está errado. É a
direção oposta de tudo que reprovei nas versões anteriores. Medi também se algum comentário
existente nos dois diretórios já dispararia: **zero ocorrências hoje** — a varredura não nasce
vermelha por ruído. Não bloqueia; vira condição de carregamento para o @dev.

### Armadilha (b) — `platform-query.ts` se autoacende? **Não, por dois motivos independentes**

1. Ele mora em `lib/tenancy/`, **fora** dos dois diretórios varridos.
2. Ainda que fosse varrido: seu `db.from(table)` usa **variável**, e o regex exige literal entre
   aspas. Testado: `[]`. A linha da constante `PLATFORM_READABLE_TABLES = ["organizations","users"]`
   também não acende (não há `.from(`).

Confirmado seguro em profundidade.

---

## B. MF-B — 5º caso e a Mutação 3 · **FECHADO**

Simulei as três mutações contra os cinco casos:

| Implementação | Casos que ficam vermelhos |
|---|---|
| ORIGINAL | nenhum (todos verdes) ✅ |
| MUT1 (`\|\|` → `&&`) | caso 3 e caso 4 |
| MUT2 (`admin?.authId` → `admin?.id`) | caso 2 e caso 3 |
| **MUT3 (remove `input.admin` do 2º `if`)** | **só o caso 3** |

**A alegação da story está exatamente certa:** a Mutação 3 é capturada **unicamente** pelo caso novo
`{ adminInviteEmail: null, admin: { id, authId: null } } → "pending"`. Sem ele, a mutação que apaga
o campo recém-introduzido — isto é, a que desfaz a correção MF-4 — passaria despercebida. Agora o
conjunto de testes **prova que `admin` é load-bearing**, que era a pendência.

Os cinco casos continuam com entradas distintas duas a duas, e nenhuma mutação fica sem carrasco.

---

## C. SF-A / SF-B / SF-C — conferidos

| SF | Verificação |
|---|---|
| **SF-A** | ✅ AC-B4 item 2 fixa `platform-query-scan.test.ts` em `packages/web/src/lib/tenancy/`, ao lado do detector e da fixture, **fora** dos dois diretórios varridos — com a justificativa correta ("para que a segurança de não se autodetectar não dependa da exclusão declarada"). Cinto e suspensório, do jeito certo. |
| **SF-B** | ✅ AC-B4 item 2 restringe a `.ts`/`.tsx`, e explica o porquê no termo que importa: sem a restrição, o próximo dev afrouxaria a **exclusão** para calar ruído de `.md`/`.json`, em vez de restringir a **extensão**. |
| **SF-C** | ✅ AC-A7 resolve a contradição de forma explícita e assimétrica: em `"failed"` o wizard **não** navega (mostra a mensagem + botão "Ver empresas"); em `"invited"` mantém o `router.push` atual. A justificativa nomeia o mecanismo real (`router.push` + `router.refresh` apagariam a mensagem) e observa que o caminho de reenvio não navega, logo não tinha o problema. |

**Change Log:** entrada v0.3 presente, datada, apontando para a seção "Revalidação — v0.2" deste
parecer e enumerando MF-A, MF-B, SF-A, SF-B, SF-C. Rastreabilidade íntegra nas três versões.

**Épico e backlog:** sem alterações novas desde a v0.2 (já validadas e aprovadas lá).
**Migration `244`:** remedida agora contra `origin/main` — maior é `243_capability_live_coach.sql`.
Continua livre.

---

## D. Condições que o @dev precisa carregar para a implementação

Nenhuma bloqueia o início. São quatro coisas para não desfazer sem perceber:

**C-1 — O detector acende dentro de comentário e de template string. Se ficar vermelho por isso,
NÃO afrouxe as exclusões.** Medido: `// legado: db.from("organizations")` acende. Hoje há **zero**
comentários assim nos dois diretórios, então a varredura não nasce vermelha por ruído — mas esta
própria story reescreve o cabeçalho de `orgs/page.tsx` (o comentário atual fala de
`createAdminClient` e de `platformQuery`), e é natural querer escrever "antes usávamos
`db.from("organizations")`". Se acontecer: reescreva o comentário sem a chamada literal (ex.:
"`.from()` cru"), **ou** remova comentários antes de casar o regex. O que não pode é mexer na lista
de exclusão de diretórios/arquivos — é ela que impede a régua de se ler a si mesma, e o comentário
exigido pela AC-B4 item 2 existe exatamente para avisar isso.

**C-2 — A varredura da árvore real nasce VERMELHA e é assim que tem que ser.** Antes da AC-B3 ela
acusa `["organizations","users"]` em `orgs/page.tsx`. Não trate como bug de setup: é a prova viva de
que a régua mede. Ela vira verde ao final da T9, e é esse par (vermelho→verde no mesmo PR) que o
@qa deve conferir no gate.

**C-3 — Vocabulário de status: `"invited"` aparece uma única vez, na AC-A7.** A AC-A3 define
`"already_active"` e `"failed"`, mas nunca nomeia o status de sucesso; a AC-A7 o chama de
`"invited"` ao descrever o comportamento do wizard. Fixe `"invited"` como o nome do caminho feliz no
tipo de retorno de `ensureAdminInvited` e não introduza um segundo termo (`"sent"`, `"ok"`) — a UI
da T2 e da T6 compara contra essa string.

**C-4 — Ordem de dependência entre tasks.** T9 (migrar `orgs/page.tsx`) depende de T7 **e** T8, e a
story diz isso. Na prática: T8 (detector) antes de T9, senão o teste estático da AC-B3 não tem o que
chamar. E a T1 (migration `244`) exige reconferir **colisão** contra `origin/main` no momento de
abrir o PR — a árvore local desta branch só tem até `241`, então contar localmente daria `242` e
colidiria.

---

## E. Encerramento

Três rodadas, e o que mudou entre elas é a diferença entre uma story que *afirma* medir e uma que
*mede*. A v0.1 tinha uma régua que não podia acender; a v0.2 tinha a régua certa com um regex torto;
a v0.3 tem a régua rodando vermelho na árvore real antes do PR e verde depois. As duas edições de
rastreabilidade fora da story (addendum no épico sobre `provision_org`, item de backlog para a
`900-16` não entregue) seguem corretas e são o tipo de trabalho que normalmente se perde.

O ponto de menos 1 no score é o falso positivo em comentário (C-1) — que falha alto, não silencioso,
e por isso não segura a implementação.

**Story liberada para `@dev *develop`.** Status sugerido: `Draft` → `Ready`.

— Pax, equilibrando prioridades 🎯
