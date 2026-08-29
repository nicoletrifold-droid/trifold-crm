# Story 900-22b — Convite do admin da empresa nova + `platformQuery()`/`PLATFORM_READABLE_TABLES`

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 2 — Multi-org de verdade (sem venda ainda)
- **Story:** 900-22b — fecha dois pendentes de AC que a `900-21`/`900-22` (PR #498, commit
  `544f3d73`) não entregaram
- **Status:** Ready for Review — v0.3 aprovada pelo @po com GO 9/10
  (`docs/qa/po-validation-900-22b.md`, Revalidação v0.3); Draft → Ready → InProgress → Ready for Review em 2026-08-28
- **Priority:** P0 — sem isto, uma empresa provisionada em `/platform` não tem como logar. É o
  gate de aceite da `900-25` ("Trifold Sandbox" precisa logar via convite).
- **Complexity:** G (revisado de M — 2 blocos independentes, 11 tasks, ~11 arquivos, 1 migration,
  2 endpoints novos, 5 arquivos de teste; ver Dev Notes sobre possível split de PR)
- **Created:** 2026-08-28
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @dev (Dex)
- **Quality Gate:** @qa (Quinn)
- Migration é aditiva e de baixo risco (uma coluna nullable); revisão de @data-engineer é
  recomendada mas não bloqueante para o executor.

---

## Contexto — dois buracos na entrega da Onda 2, não dois épicos novos

O PR #498 entregou o painel `/platform` (guard, layout, lista, wizard) e `provision_org(p_name,
p_slug)` — migration `240_provision_org.sql`, aplicada em produção, idempotente por slug. Isso é
real e não é retrabalho.

Mas dois itens que já estavam na AC original de `900-21`/`900-22` (o épico, seção `§10 Onda 2`,
não uma leitura nova) não saíram no PR. Ambos foram **verificados contra o `HEAD` atual** antes
desta story, não herdados do documento:

**1. Não existe convite do admin.** A AC de `900-21` diz literalmente: *"Efeitos externos FORA da
transação, com retry: convite do admin via Supabase Auth + linha em `users` com `role='admin'` +
e-mail de boas-vindas. Falha ⇒ a org existe e o `/platform` mostra 'convite pendente' com botão de
reenviar."* Conferido em `packages/web/src/app/api/platform/orgs/route.ts`: o `POST` recebe só
`{ name, slug }`, chama `provision_org` e devolve `{ orgId, name, slug }`. Nenhum e-mail, nenhuma
linha em `users`, nenhum convite. Uma empresa provisionada hoje não tem ninguém que consiga logar
nela — bloqueia o teste de aceitação da `900-25`.

**2. `platformQuery()` e `PLATFORM_READABLE_TABLES` não existem.** A AC de `900-22` diz: *"nascem
nesta story, junto da primeira tela de `/platform`, com a lista provisória mínima (`organizations`,
`users`) e o comentário de topo 'lista PROVISÓRIA — consolidada por 900-42a, fechada por
900-42b'."* Conferido: `packages/web/src/app/platform/orgs/page.tsx` lê `organizations` e `users`
direto via `createAdminClient().from(...)`, com um comentário que diz *"Quando a Onda 6 trouxer
`platformQuery()`..."* — invertendo a ordem que o próprio épico define (linha 830 e linha 562 da
tabela de artefatos incrementais: `platformQuery()` nasce em `900-22`, é só **endurecida** em
`900-42a`, seis ondas depois). FR-28 exige um teste que varre `app/api/platform/**` procurando
`.from()` fora da lista — esse teste também não existe.

**Um terceiro item, medido e deliberadamente FORA de escopo:** a AC de `900-21` também previa
`platform_audit_log` recebendo uma entrada `action='org.create'` via `platform_audit()`. Nem a
tabela `platform_audit_log` nem a função `platform_audit()` existem em `supabase/migrations/`
ainda — o épico as lista como "implementadas em 900-16" (linha 297), mas `900-16` não tem story
correspondente em `docs/stories/900-16-*`. Isso é um terceiro buraco real, e o PR #498 já entrou em
produção com essa dependência declarada e não satisfeita — dívida herdada, não criada aqui. Esta
story **não fecha** esse buraco, mas **amplia** a superfície mutante que fica sem trilha (ver
`Scope OUT` e o item novo em `docs/backlog.md`, aberto nesta revisão a pedido do @po — SF-9).

---

## User Story

**Como** Trifold operando o painel `/platform`,
**Quero** que provisionar uma empresa também convide o administrador dela (com retry se o convite
falhar) e que toda leitura de `/platform` passe por um mecanismo único e auditável de tabelas
permitidas,
**Para que** uma empresa provisionada tenha alguém capaz de logar nela no mesmo dia, e para que a
superfície de dados que a Trifold consegue ler de um cliente — o único acesso que existirá, por
causa de D14 (sem impersonation) — seja uma lista fechada e crescente por regra, não uma consulta
solta em cada tela nova.

---

## Scope

### IN
- Campo "E-mail do admin" no wizard `/platform/orgs/new`.
- Coluna nova `organizations.admin_invite_email` (nullable, aditiva) — migration `244`.
- Rotina idempotente de convite (`ensureAdminInvited`), reusando o padrão já existente em
  `api/brokers/route.ts` e `api/users/[id]/reset-password/route.ts`: criar usuário no Supabase
  Auth, gravar `users` com `role='admin'`, enviar e-mail via `renderPasswordActionEmail`.
- Endpoint de reenvio: `POST /api/platform/orgs/[id]/resend-admin-invite`.
- Comportamento visível e testável quando o e-mail já existe no Supabase Auth (AC-A7).
- Badge "convite pendente" + botão "Reenviar" em `/platform/orgs`, com aviso não bloqueante quando
  o convite inicial falha (AC-A7).
- `packages/web/src/lib/tenancy/platform-query.ts`: `PLATFORM_READABLE_TABLES` (`organizations`,
  `users`) + `platformQuery()`, com rejeição de `"*"` em `columns`.
- Migração de `platform/orgs/page.tsx` (as duas leituras existentes) para `platformQuery()`.
- Detector puro e exportado de leitura crua (`detectRawTableReads`) + teste de varredura sobre
  `app/api/platform/**` **e** `app/platform/**` (ver justificativa e correções na AC-B4).

### OUT
- `platform_audit_log` / `platform_audit()` / entrada `action='org.create'` — buraco real, não
  desta story. **Esta story amplia essa dívida** (não apenas convive com ela): adiciona
  `POST /api/platform/orgs/[id]/resend-admin-invite` (cria conta Auth e dispara e-mail para um
  admin de cliente) e `UPDATE organizations SET admin_invite_email`, nenhum dos dois com entrada em
  auditoria — porque a tabela não existe. Registrado em `docs/backlog.md` (item aberto em
  2026-08-28) para não ficar só no corpo desta story, que sai do radar assim que vai para `Done`.
- Qualquer novo parâmetro em `provision_org()` — decisão registrada abaixo, é NÃO, e propagada para
  o épico (linha ~561 da tabela de artefatos e o bloco AC de `900-21`, addendum de 2026-08-28).
- `platform_admins` com níveis, `withPlatformAdmin`, regra R12 do gate — tudo `900-42a`.
- Fechar a lista `PLATFORM_READABLE_TABLES` contra PEND-4 — isso é `900-42b`, e só faz sentido
  quando existir mais de uma tabela sensível na lista.
- Plano, módulo, fatura — a Onda 2 inteira é sem isso (herdado de `900-21`/`900-22`).
- Tela de detalhe de uma org (`/platform/orgs/[id]`) — não existe ainda; fica para quando alguma
  story futura precisar dela.
- **`platformQuery()` não cobre escritas.** `.update()`/`.insert()` (o `UPDATE
  admin_invite_email` desta própria story, e todo `lib/tenancy/admin-invite.ts`) ficam fora do
  detector — ele varre qualquer `.from(<literal>)` cru (sem exigir `.select(` na mesma expressão,
  ver correção da AC-B4), não é um firewall geral de acesso a dado de plataforma. Ver AC-B4.

---

## Decisão registrada — assinatura de `provision_org()` NÃO muda nesta story

A arquitetura (`§7.4`) desenha o alvo final como `provision_org(p_name, p_slug, p_plan_id,
p_admin_email, p_admin_name, p_actor_user_id)`. A pergunta que motivou este registro: esta story
deveria estender a função SQL para aceitar `p_admin_email` (e persistir o e-mail do admin dentro da
mesma transação que cria a org), ou fazer isso inteiramente na camada de rota?

**Decisão: só na rota. `provision_org(text, text)` continua com a assinatura atual.**

Razões, na ordem que pesou:

1. **A própria migration `240` já declara, no comentário de topo, que criar o usuário admin é
   efeito externo e tem que acontecer FORA da transação** — exatamente o motivo de a função não
   criar `users`. Se o convite é externo por design, não há necessidade de o *parâmetro* que o
   alimenta estar dentro da função transacional: persistir `admin_invite_email` é um `UPDATE`
   simples em `organizations`, não uma operação que precise da atomicidade de `SECURITY DEFINER`.
2. **Overload de assinatura é o mesmo tipo de risco que o CON-7 do épico já documentou** —
   "duas migrations que fazem `CREATE OR REPLACE FUNCTION` da mesma função não conflitam no git e
   o último aplicado ganha em silêncio" (aconteceu com `roleta_pick_and_advance`). Uma segunda
   assinatura de `provision_org` (2 args e N args coexistindo) não é o mesmo bug, mas é a mesma
   *classe* de armadilha: um chamador futuro pode acertar a função errada por posição de
   argumento. Zero overload é mais simples de auditar que dois.
3. **`900-31` (Onda 3) precisa adicionar `p_plan_id` como não-nulo.** Se esta story já tivesse
   mudado a assinatura para incluir `p_admin_email`, a `900-31` teria que decidir entre estender a
   assinatura de 3 args de novo (piorando o overload) ou reconciliar duas migrations de
   `CREATE OR REPLACE`. Manter `provision_org` só com `(p_name, p_slug)` deixa exatamente **uma**
   assinatura viva para a `900-31` estender, quando ela precisar.
4. **Reuso, não invenção.** `api/brokers/route.ts` já resolve "criar usuário + Auth + e-mail" na
   camada de rota, sem precisar que nenhuma função SQL "saiba" do e-mail do convidado. Fazer o
   mesmo aqui é seguir um padrão já validado no projeto (IDS: REUSE > CREATE), em vez de inventar
   um caminho novo dentro do banco.

**Ressalva sobre a razão 3, registrada a pedido do @po:** "exatamente uma assinatura viva para a
`900-31` estender" só é verdade se `p_actor_user_id` (auditoria) também ficar de fora — o que É o
caso aqui, mas é uma decisão adicional, não uma consequência automática das razões 1-2. Quando a
`900-16` (que não existe ainda — ver Contexto) entrar, `provision_org` pode precisar mudar de
assinatura de novo para receber `p_actor_user_id`, ou a auditoria passa a ser gravada pela rota
(mesmo padrão desta story). Essa escolha não é desta story para fazer — é da `900-16`.

**Propagação obrigatória (fechada nesta revisão):** o épico continuava, até esta story, descrevendo
a assinatura de 6 argumentos como o estado atual, sem indicar que o PR #498 entregou só 2. Corrigido
em `docs/stories/epics/epic-900-saas-multi-tenant.md`: addendum na tabela de artefatos incrementais
(linha ~561) e no bloco de AC de `900-21` (§10 Onda 2), ambos datados 2026-08-28 e citando esta
story, para que quem draftar a `900-31` não leia o alvo antigo como se fosse o estado atual.

---

## Acceptance Criteria — Bloco A: convite do admin

- [x] **AC-A1 — Wizard exige e-mail do admin.** `/platform/orgs/new` ganha um campo obrigatório
  "E-mail do admin" (`type="email"`). Submissão sem preencher é bloqueada no cliente (`required`) E
  no servidor: `POST /api/platform/orgs` com `adminEmail` ausente/vazio devolve `400
  ADMIN_EMAIL_REQUIRED`.
  - **Vermelho hoje, confirmado:** a rota atual (`route.ts`) só lê `body.name`/`body.slug` — um
    `POST { name, slug }` sem `adminEmail` retorna `201` hoje. Um teste que faz esse POST e espera
    `400` falha no código atual e deve passar depois desta story.
  - **Teste precisa mockar `getPlatformAdmin` E `@web/lib/supabase/admin`** (`route.test.ts` hoje
    só importa `slugify` e não tem `vi.mock` nenhum — o arquivo muda de natureza nesta story). Sem
    o mock de `getPlatformAdmin`, o handler devolve `403` antes de chegar na validação de
    `adminEmail`, e o teste vermelho seria pelo motivo errado.
  - **Mutação que descobre regressão:** remover o `if (!adminEmail)` do handler, com os mocks
    acima instalados, faz o teste voltar a aceitar o POST sem e-mail — vermelho reintroduzido pelo
    motivo certo.

- [x] **AC-A2 — `organizations.admin_invite_email` persiste antes de qualquer efeito externo.**
  Migration `244_org_admin_invite_email.sql`, aditiva: `ALTER TABLE organizations ADD COLUMN
  admin_invite_email text`. A rota grava esse valor logo após `provision_org` retornar, **antes**
  de chamar `ensureAdminInvited` — para que o e-mail sobreviva mesmo se a criação do usuário Auth
  falhar (rede, rate limit do Supabase, o que for).
  - **Teste (client Supabase fake, sem banco real):** o fake registra a ordem das chamadas
    (`update("organizations", …)` antes de `ensureAdminInvited(...)`, este último injetado/mockado
    para lançar). A asserção é sobre a **ordem registrada no fake**, não uma consulta pós-chamada a
    um banco real — a suíte Vitest deste projeto não tem banco disponível. (Confirmação com o
    banco de dev descartável, se desejada, é passo manual — ver seção Testing.)
  - **Mutação:** inverter a ordem (chamar `ensureAdminInvited` antes do `UPDATE`) faz o teste falhar
    porque a sequência registrada no fake muda — exatamente o cenário que a AC existe para
    proteger.

- [x] **AC-A3 — `ensureAdminInvited(orgId, email)` é idempotente e reutilizada em dois pontos.**
  Função única em `packages/web/src/lib/tenancy/admin-invite.ts`, chamada por `POST
  /api/platform/orgs` (na criação) e por `POST /api/platform/orgs/[id]/resend-admin-invite` (no
  reenvio). Isolamento de dependências via `vi.mock("@web/lib/supabase/admin")` — o MESMO padrão
  já usado por `packages/web/src/app/api/brokers/route.test.ts` para este exato arquivo que a
  story reusa (não injeção de dependência custom; ver Testing). Comportamento:
  1. Busca `users` por `(org_id, role='admin')`. **Desempate determinístico se houver mais de uma
     linha** (a org "Trifold" legada provavelmente tem mais de um usuário `admin`):
     `ORDER BY created_at ASC LIMIT 1`. Se não existe nenhuma, insere um `users` novo com
     `auth_id: null`, `email`, `role: 'admin'`, `is_active: true` — `name` derivado do e-mail
     (parte antes do `@`, sem formatação inventada; editável depois em Usuários, que já tem
     capability `usuarios.editar`). Reexecutar com o mesmo `orgId` **não** cria uma segunda linha.
  2. Se o `users.auth_id` já está preenchido, retorna `{ status: "already_active" }` sem tocar no
     Supabase Auth — reenviar convite para quem já aceitou não pode recriar a conta. Se, além
     disso, `organizations.admin_invite_email` ainda estiver preenchido (ex.: reprovisionamento do
     mesmo slug com um e-mail de admin diferente — AC-A3.2b), a função limpa o campo para `NULL` e
     o retorno inclui `emailIgnored: true`, para a UI avisar que o segundo e-mail **não** foi
     convidado (nunca fica um endereço "pendente" que na prática já não será processado).
  3. Caso contrário, chama `adminSupabase.auth.admin.createUser({ email, password: <temp>,
     email_confirm: true, app_metadata: { role: "admin" } })` — o `app_metadata` é obrigatório
     (Story 75-205: role no JWT desde a criação, mesmo padrão comentado em `brokers/route.ts:73`,
     `users/route.ts:76`, `users/[id]/reset-password/route.ts:44`; sem ele o admin novo cai no
     fallback de `middleware.ts` `getUserRole`, uma query extra por request). Sucesso: grava
     `auth_id` em `users`, gera link via `generateLink({ type: "recovery", redirectTo:
     "${siteUrl}/reset-senha" })` e monta o link de ação com `linkData.properties.hashed_token` —
     `${siteUrl}/auth/callback?token_hash=${hashed_token}&type=recovery&next=/reset-senha` (Story
     75-139: `action_link` **não chega** em `/reset-senha`; é o mesmo comentário presente em
     `brokers/route.ts:139` e `reset-password/route.ts:69`, e reusar o `action_link` cru quebraria
     o convite). Envia e-mail com `renderPasswordActionEmail({ mode: "create" })`, tag `{ name:
     "type", value: "platform_admin_invite" }` — **diferente** de `"broker_invite"`, para não
     conflar as duas origens em métricas/auditoria de e-mail. Ao terminar com sucesso, limpa
     `organizations.admin_invite_email` para `NULL`.
  4. Falha em `createUser` (ex.: e-mail já registrado — unicidade global do Supabase Auth): ver
     AC-A7. Não é comportamento implícito desta AC.
  - **Teste, sem rede real:** com o fake do Supabase Auth Admin configurado para falhar em
    `createUser`, a função retorna `{ status: "failed", message }` **e** a linha em `users`
    continua existindo com `auth_id: null` — é essa linha que sustenta o "convite pendente" na
    tela.
  - **Mutação (a mais perigosa do bloco):** trocar `admin?.authId` (passo 2) por `admin?.id` no
    critério de "já ativo" faz a função marcar como `already_active` uma linha que **existe mas
    nunca teve `auth_id` setado** (o `id` é sempre truthy) — reportaria "convite aceito" para um
    admin que nunca recebeu conta. O teste correspondente usa um fixture com `id` preenchido e
    `authId: null` e espera que a função **prossiga** para `createUser`, não que retorne
    `already_active`.
  - **Mutação (idempotência):** remover a checagem de `auth_id` já preenchido por completo faz um
    teste de "reenviar para admin já ativo" acusar uma SEGUNDA chamada a `createUser`.

- [x] **AC-A4 — Endpoint de reenvio, guardado por platform admin.** `POST
  /api/platform/orgs/[id]/resend-admin-invite`: `403` se `getPlatformAdmin()` for `null`; `404` se
  a org não existir; `400 NO_PENDING_INVITE` se `organizations.admin_invite_email` for `null` **e**
  não houver `users(org_id, role='admin', auth_id IS NULL)` — nada para reenviar. Caso contrário,
  chama `ensureAdminInvited` e propaga o resultado (ver AC-A7 para o caso de falha).
  - **Mutação:** remover o guard de `getPlatformAdmin()` faz um teste que chama a rota sem sessão
    de plataforma deixar de devolver `403` — descobre a rota desprotegida na hora.

- [x] **AC-A5 — `/platform/orgs` mostra o estado do convite, com estado suficiente para distinguir
  "nunca convidado" de "convidado mas sem conta".** Função pura em `admin-invite.ts`:
  ```ts
  type AdminInviteStatus = "none" | "pending" | "active"

  function deriveAdminInviteStatus(input: {
    adminInviteEmail: string | null
    admin: { id: string; authId: string | null } | null
  }): AdminInviteStatus {
    if (input.admin?.authId) return "active"
    if (input.admin || input.adminInviteEmail) return "pending"
    return "none"
  }
  ```
  O campo `admin` (linha de `users` com `role='admin'` para a org, ou `null` se não existe) é o que
  resolve a ambiguidade que a v0.1 tinha: `adminInviteEmail: null` sozinho não dizia se não havia
  linha nenhuma (`"none"`, org legada sem rastro) ou se havia linha com `auth_id` nulo cujo e-mail
  de convite já tinha sido limpo por outro motivo — agora `admin` carrega a presença da linha
  independentemente do campo de e-mail.
  A tabela ganha uma coluna "Admin": badge âmbar "convite pendente" + botão "Reenviar" quando
  `"pending"`; badge verde "convidado" quando `"active"`; travessão quando `"none"`. Quando
  `ensureAdminInvited` retornar `emailIgnored: true` (AC-A3.2), a UI mostra um aviso adicional
  "e-mail informado foi ignorado — administrador já ativo".
  - **Teste unitário da função pura, 5 casos nomeados, entradas distintas em todos** (ver Testing):
    `"active"` (admin com `authId`), `"pending" — linha existe, sem auth, com e-mail ainda
    persistido` (admin sem `authId`, `adminInviteEmail` presente — reflete o estado real que a
    AC-A3 produz nesse caminho), `"pending" — linha existe, sem auth, SEM e-mail persistido`
    (admin sem `authId`, `adminInviteEmail: null` — o caso em que só o campo `admin` decide, ver
    Mutação 3), `"pending" — linha ainda não existe` (`admin: null`, `adminInviteEmail` presente —
    crash entre AC-A2 e AC-A3.1), `"none"` (`admin: null`, `adminInviteEmail: null`).
  - **Mutação 1:** trocar o `||` do segundo `if` por `&&` faz o caso "linha ainda não existe"
    (`admin: null`, `adminInviteEmail` presente) cair em `"none"` — perde o rastro do e-mail
    persistido pela AC-A2 exatamente no cenário em que ele é a única pista que sobrou.
  - **Mutação 2:** trocar `input.admin?.authId` por `input.admin?.id` no primeiro `if` faz o caso
    "linha existe, sem auth" virar `"active"` incorretamente (mesma mutação perigosa nomeada na
    AC-A3, agora do lado da UI) — reporta convite aceito quando não foi.
  - **Mutação 3 — prova de que `admin` é load-bearing, não redundante com `adminInviteEmail`:**
    trocar `if (input.admin || input.adminInviteEmail)` por `if (input.adminInviteEmail)` (removendo
    `admin` do segundo `if`) mantém os 4 casos anteriores verdes — os dois casos "pending" com
    e-mail preenchido continuam batendo pelo lado esquerdo do `||` que sobrou, e os dois sem e-mail
    não passam por esse `if`. É o caso "linha existe, sem auth, SEM e-mail persistido" que cai de
    `"pending"` para `"none"` sob essa mutação — o único cenário em que `admin` decide sozinho, e
    também um estado real: admin criado por AC-A3.1 cujo `admin_invite_email` já foi limpo pelo
    caminho `already_active` de outra org que reusa o mesmo e-mail (AC-A3.2b), ou qualquer futura
    rotina que limpe o campo sem tocar em `auth_id`.

- [x] **AC-A6 — `org_id` do admin nunca vem do cliente (verificável, não só por leitura de
  código).** Teste de 3 linhas: `POST /api/platform/orgs` com um corpo forjado contendo um campo
  extra `orgId: "<uuid-de-outra-org>"` junto de `name`/`slug`/`adminEmail` válidos; asserção de que
  a chamada de inserção em `users` (registrada no fake) usa o `orgId` **retornado por
  `provision_org()`**, nunca o `body.orgId`. Mesmo princípio para
  `resend-admin-invite/[id]`: o `orgId` usado é sempre o parâmetro de rota `[id]` (já validado
  contra `organizations` antes de chamar `ensureAdminInvited`), nunca um campo do corpo.

- [x] **AC-A7 — E-mail já existente no Supabase Auth (unicidade global) chega ao operador, não
  fica silencioso.** `ensureAdminInvited` captura o erro de `createUser` (ex.: "A user with this
  email address has already been registered"), loga estruturado (`console.error` com `{ orgId,
  adminEmail, authError: message }` — sem persistir em coluna nova; é o mínimo aceitável, não a
  única opção) e retorna `{ status: "failed", message }`. `POST /api/platform/orgs` (criação)
  continua devolvendo `201` — a org existe, não há rollback — com `{ orgId, name, slug, adminInvite:
  { status: "failed", message } }`. **Onde o aviso sobrevive, decidido para fechar a contradição
  apontada na validação** (o wizard atual faz `router.push` + `router.refresh` em qualquer sucesso
  de `201`, o que apagaria a mensagem antes de ser lida): quando `adminInvite.status === "failed"`,
  o wizard **não redireciona automaticamente** — mostra o aviso com a mensagem e um botão "Ver
  empresas" que só então navega para `/platform/orgs`, onde o badge "convite pendente" + "Reenviar"
  assume o resto. Quando `adminInvite.status` for `"invited"` (sucesso), o comportamento atual
  (redirecionar direto) continua — não há mensagem para perder nesse caminho.
  `POST /resend-admin-invite` devolve `400 { error: "ADMIN_INVITE_FAILED", message }` — mesmo
  padrão de `brokers/route.ts:78`, que já devolve `authError.message` com `400`; esse caminho não
  navega, então a mensagem chega ao operador sem risco de ser apagada.
  - **Teste:** fake do Supabase Auth Admin configurado para rejeitar `createUser` com uma mensagem
    `X`; `ensureAdminInvited` retorna `{ status: "failed", message: X }`; o handler de
    `resend-admin-invite` devolve `400` com corpo contendo `X`.
  - **Mutação:** engolir o erro (retornar `{ status: "failed" }` sem `message`, ou não propagar o
    `message` no corpo da resposta HTTP) faz o teste da rota de reenvio falhar — descobre a
    regressão de "falha silenciosa" que este AC existe para eliminar (era o furo mais provável no
    primeiro uso real, por causa da unicidade global de e-mail no Supabase Auth).

---

## Acceptance Criteria — Bloco B: `platformQuery()` + `PLATFORM_READABLE_TABLES`

- [x] **AC-B1 — A constante nasce com a lista mínima e o comentário exigido pelo épico.**
  `packages/web/src/lib/tenancy/platform-query.ts`:
  ```ts
  // lista PROVISÓRIA — consolidada por 900-42a, fechada por 900-42b
  export const PLATFORM_READABLE_TABLES = ["organizations", "users"] as const
  export type PlatformReadableTable = (typeof PLATFORM_READABLE_TABLES)[number]
  ```
  - **Vermelho hoje:** o arquivo não existe. `import` falha em qualquer teste que o referencie.
  - **Mutação:** apagar o comentário faz um teste de regex (`/lista PROVIS[ÓO]RIA/`) sobre o
    conteúdo do arquivo falhar — protege contra alguém "limpar" o comentário achando-o redundante.

- [x] **AC-B2 — `platformQuery()` rejeita tabela fora da lista em runtime, e rejeita `"*"` em
  `columns`.**
  ```ts
  export function platformQuery<T extends PlatformReadableTable>(
    table: T,
    columns: string,
    orgId?: string,
  ) {
    if (!PLATFORM_READABLE_TABLES.includes(table)) {
      throw new Error(`platformQuery: "${table}" fora de PLATFORM_READABLE_TABLES`)
    }
    if (columns.split(",").map((c) => c.trim()).includes("*")) {
      throw new Error(`platformQuery: "select *" não é permitido — liste as colunas`)
    }
    const db = createAdminClient()
    const query = db.from(table).select(columns)
    return orgId ? query.eq("org_id", orgId) : query
  }
  ```
  `columns` é obrigatório (não opcional) e a rejeição de `"*"` fecha, já nesta story e não só na
  `900-42a`, o caso "nunca `select('*')` em `users`" para quem passa pela função — o scanner da
  AC-B4 (item 4) continua existindo como defesa em profundidade para quem **não** passar por ela.
  - **Teste (tabela):** `platformQuery("leads" as PlatformReadableTable, "id")` lança. `as` força o
    TypeScript a aceitar em compile-time — é exatamente o caminho que a checagem em runtime existe
    para fechar (um `table` que chega por variável, não por literal, engana o tipo mas não a
    função).
  - **Teste (colunas):** `platformQuery("users", "*")` lança; `platformQuery("users", "id, *,
    email")` também lança (não só o caso `"*"` sozinho).
  - **Mutação:** remover qualquer um dos dois `if` faz o teste correspondente passar de "lança"
    para "não lança" — vermelho limpo em cada um, independentemente.

- [x] **AC-B3 — `/platform/orgs/page.tsx` usa `platformQuery()` nas leituras que já faz hoje, mais
  uma consulta dedicada para o admin (sem o corte de 1000 linhas do PostgREST).**
  Troca `createAdminClient().from("organizations").select(...)` por
  `platformQuery("organizations", "id, name, slug, is_active, created_at, admin_invite_email")`.
  Para a contagem de usuários por org, mantém a leitura já existente (pré-existente, fora do
  escopo desta story — ver nota abaixo), agora via `platformQuery("users", "org_id")`. Para o
  estado do admin (AC-A5), usa uma consulta **dedicada e filtrada por `role`**:
  `platformQuery("users", "org_id, auth_id").eq("role", "admin")` — o retorno do `platformQuery` é
  o query builder do Supabase, então o `.eq()` extra é encadeamento normal, não uma segunda função.
  Filtrar por `role='admin'` evita o corte de 1000 linhas do PostgREST que uma leitura sem filtro
  sofreria numa org grande (mesma classe de defeito corrigido na Story 75-198,
  `brokers/route.ts:27-29` — `get_brokers_active_lead_counts`), porque o número de linhas
  `role='admin'` é limitado pelo número de orgs, não pelo número total de usuários.
  - **Nota de escopo, não corrigida aqui:** a contagem total de usuários por org (query sem filtro
    de `role`) já tinha esse mesmo corte de 1000 linhas **antes** desta story (comportamento
    herdado de `900-22`). Esta story não o introduz nem o esconde, mas também não é um dos dois
    buracos que ela existe para fechar — registrar como item adjacente, não widen scope em
    silêncio.
  - **Teste estático:** o arquivo `orgs/page.tsx` **não importa** `createAdminClient` (assert sobre
    a linha de import) e **importa** `platformQuery`; `detectRawTableReads()` (AC-B4) aplicado ao
    conteúdo do arquivo devolve `[]`.
  - **Mutação:** reverter qualquer uma das três leituras para `createAdminClient().from(...)` faz
    `detectRawTableReads()` voltar a encontrar o literal — cai independentemente de qual das três
    for revertida, porque o detector varre o arquivo inteiro, não uma string fixa por leitura.

- [x] **AC-B4 — Detector puro de leitura crua + teste de varredura sobre `app/api/platform/**` e
  `app/platform/**`, decompostos para que a régua consiga acender.**
  A regra é **"qualquer `.from(<literal>)` chamado sobre um identificador que não seja `Buffer` ou
  `Array`, em qualquer lugar dos dois diretórios"** — não "tabela fora da lista". A lista fechada é
  aplicada em **runtime** pela AC-B2; o scanner é uma segunda rede que garante que **nenhum**
  `.from()` cru sobrevive fora de `platformQuery()`, porque depois da AC-B3 o único caminho
  sancionado (`platformQuery`) nunca emite `.from(<literal>)` nesses diretórios — logo, zero
  ocorrências é o estado correto do código pós-story, e a AC não precisa (nem pode) diferenciar
  tabela permitida de proibida no nível do texto-fonte.
  ```ts
  // packages/web/src/lib/tenancy/platform-query-scan.ts
  //
  // Ancora em `.from("literal")` e trata o receiver POR EXCLUSÃO (não por adjacência ao ponto) —
  // a v0.2 usava `(\w+)\.from\(` exigindo o identificador coladinho no `.from(`, e isso é cego
  // para a forma que o Prettier produz em query encadeada (`await db\n  .from("x")`, 1.511 das
  // 1.768 ocorrências reais de `.from("<literal>")` em packages/web/src, incluindo o próprio
  // orgs/page.tsx e platform-guard.ts) e para receiver-chamada (`createAdminClient().from("x")`,
  // 13 ocorrências, e a forma que a mutação da AC-B3 usa). Medido contra o código real antes de
  // fixar esta versão — ver docs/qa/po-validation-900-22b.md, Revalidação v0.2, §B.
  export function detectRawTableReads(source: string): string[] {
    const pattern = /(?:^|[^\w$])(\w*)\s*\.\s*from\(\s*["']([a-zA-Z_]\w*)["']\s*\)/g
    const hits: string[] = []
    for (const match of source.matchAll(pattern)) {
      const [, receiver, table] = match
      if (receiver === "Buffer" || receiver === "Array") continue
      hits.push(table)
    }
    return hits
  }
  ```
  A AC exige três peças nomeadas, para não repetir os três defeitos apontados na validação:
  1. **Detector puro e exportado, testado com fixtures INLINE no arquivo de teste** (não lidas do
     disco) — cinco formas, todas commitadas como string literal:
     - literal de uma linha: `db.from("leads")` → `["leads"]`.
     - multilinha (argumento quebrado): `` db.from(\n  "leads"\n) `` → `["leads"]` (a regex casa
       `\s*` incluindo quebras de linha; nenhum split por `\n` no meio do caminho).
     - **receiver em linha anterior:** `` await db\n  .from("leads")\n  .select("id") `` →
       `["leads"]` — é a forma dominante do repositório (1.511 ocorrências reais) e a que
       `orgs/page.tsx:29-30` já usa hoje para `organizations`; sem este caso a fixture do item 3
       não fecha (ver abaixo).
     - **receiver como chamada:** `createAdminClient().from("leads").select("id")` → `["leads"]`
       — é a forma que a mutação nomeada da AC-B3 usa; sem este caso essa mutação não fica
       vermelha (recorrência de MF-3, fechada aqui).
     - homônimo: `Buffer.from("hex")` e `Array.from([1,2,3])` → `[]` (excluídos pelo `receiver`
       capturado — funciona tanto para receiver adjacente quanto em linha anterior).
  2. **Um `it` separado, sobre a árvore real dos dois diretórios, esperando `[]` — com exclusão
     explícita e comentada de `*.test.ts`, `__tests__/` e `__fixtures__/`, e varredura restrita a
     arquivos `.ts`/`.tsx`** (um `.md`/`.json` com um trecho de exemplo de código dentro de
     `app/platform/**` não deve acender — sem essa restrição, o próximo dev tenderia a afrouxar a
     exclusão para calar ruído em vez de restringir a extensão). A exclusão de `*.test.ts` está na
     AC porque, sem ela, o próprio arquivo de teste (que contém as strings `db.from("leads")` como
     fixture) seria varrido e o teste nunca ficaria verde — é o defeito "a régua se lê a si mesma"
     apontado na validação. O comentário no código explica o motivo, para que ninguém "limpe" a
     exclusão achando-a redundante. **`platform-query-scan.test.ts` fica em
     `packages/web/src/lib/tenancy/`, ao lado do detector e da fixture** — fora dos dois diretórios
     varridos, para que a segurança de não se autodetectar não dependa da exclusão declarada (mesmo
     raciocínio já aplicado à fixture do item 3, não só a ela).
  3. **Fixture commitado (não `git stash`)** com o conteúdo do `orgs/page.tsx` **anterior** a esta
     story — arquivo separado em `packages/web/src/lib/tenancy/__fixtures__/orgs-page-pre-900-22b.txt`
     (fora dos dois diretórios varridos — `lib/tenancy/`, não `app/platform/`
     nem `app/api/platform/` — então nem depende da exclusão de `__fixtures__/` do item 2 para não se
     autodetectar; a convenção `__fixtures__/` do item 2 continua valendo para proteger fixtures que
     algum dia sejam colocados dentro dos diretórios varridos).
     `detectRawTableReads()` aplicado a esse fixture **deve** devolver `["organizations", "users"]`
     — é a prova, reproduzível e commitada, de que o detector pega o problema que existia até este
     PR. (O `orgs/page.tsx` pré-story lê `organizations`/`users`, que **estão** na lista — a prova
     de vermelho da v0.1 desta story rodava o scanner errado contra esse mesmo arquivo e ficava
     verde por engano; com a regra "qualquer `.from(<literal>)`", em vez de "fora da lista", o
     mesmo fixture acende corretamente.)
  - **O que esta AC NÃO cobre, declarado para não virar alegação implícita de cobertura total:**
    escritas (`.update()`, `.insert()`) ficam fora — o `UPDATE admin_invite_email` desta própria
    story e todo `lib/tenancy/admin-invite.ts` não são varridos, porque `platformQuery()` é
    mecanismo de leitura, não um firewall geral. Ver `Scope OUT`.

---

## Tasks / Subtasks

- [x] **T1 — Migration 244** (AC-A2): `organizations.admin_invite_email text`, aditiva,
  `IF NOT EXISTS`, rollback documentado no arquivo (NFR-8). Reconferir contra `origin/main` no
  momento de aplicar — procurar **colisão** (o número já existe?), não "próximo número livre" (já
  existem dois arquivos `240_*` no repo: `240_followup_nicole_por_lead.sql` e
  `240_provision_org.sql` — o precedente de colisão é real, não hipotético).
- [x] **T2 — Wizard** (AC-A1): campo "E-mail do admin" em `orgs/new/page.tsx`; `POST` inclui
  `adminEmail` no body; UI mostra aviso não bloqueante quando `adminInvite.status === "failed"`
  (AC-A7).
- [x] **T3 — Rota de criação** (AC-A1, AC-A2, AC-A6, AC-A7): validação de `adminEmail`, `UPDATE
  admin_invite_email` logo após `provision_org`, chamada a `ensureAdminInvited`, propagação do
  resultado no corpo da resposta.
- [x] **T4 — `admin-invite.ts`** (AC-A3, AC-A5, AC-A7): `ensureAdminInvited()` +
  `deriveAdminInviteStatus()` puros e testáveis via `vi.mock("@web/lib/supabase/admin")`.
- [x] **T5 — Rota de reenvio** (AC-A4, AC-A7): `api/platform/orgs/[id]/resend-admin-invite/route.ts`.
- [x] **T6 — UI de status** (AC-A5, AC-A7): coluna "Admin" em `orgs/page.tsx` + botão "Reenviar" +
  aviso de "e-mail ignorado" (client component, já que precisa de `onClick`/`fetch`) em
  `platform/orgs/_components/`.
- [x] **T7 — `platform-query.ts`** (AC-B1, AC-B2): constante + função, com rejeição de `"*"`.
- [x] **T8 — `platform-query-scan.ts`** (AC-B4): `detectRawTableReads()` puro e exportado.
- [x] **T9 — Migrar `orgs/page.tsx` para `platformQuery`** (AC-B3), incluindo a consulta dedicada
  `role='admin'`. Depende de T7 e T8 (o teste estático de AC-B3 usa `detectRawTableReads`).
- [x] **T10 — Teste de varredura + fixture commitado** (AC-B4): `platform-query-scan.test.ts` em
  `packages/web/src/lib/tenancy/` (fora dos diretórios varridos — SF-A), unit test do detector com
  fixtures inline (5 formas, incluindo receiver em linha anterior e receiver-chamada) + `it` de
  varredura real restrito a `.ts`/`.tsx` com exclusões (SF-B) + fixture pré-story em
  `__fixtures__/`.
- [x] **T11** — Testes unitários de `admin-invite.ts` e `platform-query.ts` (ver Testing).

---

## Dev Notes

### Número de migration — reconferir, não herdar
`origin/main` tem migrations até `243_capability_live_coach.sql` (medido em 2026-08-28, commit
`0c2b4eb8`). `244` está livre nessa medição. **Reconferir contra `origin/main` no momento de abrir
o PR, procurando colisão explicitamente** — já existe um precedente real de dois arquivos `240_*`
no próprio repositório (`240_followup_nicole_por_lead.sql`, `240_provision_org.sql`); a pergunta
certa é "o número 244 já existe?", não "qual é o próximo?". `local main` desta branch está em
`0a037103`, que é ancestral de `origin/main` e só tem migrations até `241` — quem contar
localmente chegaria em `242` e colidiria.
`[Source: git ls-tree origin/main -- supabase/migrations/, medido 2026-08-28]`

### `users.name` NOT NULL sem campo de nome no wizard
O épico descreve o wizard como "nome, slug, e-mail do admin" — três campos, sem nome do admin
(`§10 Onda 2`, linha 826 do épico). `users.name` é `varchar(255) NOT NULL`
(`001_base_schema.sql:77`), então precisa de algum valor. Em vez de inventar um parser "inteligente"
de nome a partir do e-mail, o valor é a parte antes do `@`, sem tratamento — simples, previsível, e
já editável depois via a tela de Usuários (capability `usuarios.editar`, que o próprio admin novo
tem, porque `provision_org` dá `can_access=true` em todos os 26 módulos para o role `admin`).

### Reuso confirmado — não é o único ponto que faz isso
`packages/web/src/app/api/brokers/route.ts` (linhas ~62-160): cria usuário via
`adminSupabase.auth.admin.createUser`, grava `users`, gera link via `generateLink({ type:
"recovery", redirectTo: "${siteUrl}/reset-senha" })`, envia e-mail com `renderPasswordActionEmail`.
`packages/web/src/app/api/users/[id]/reset-password/route.ts` tem o mesmo idioma para o caso de
"usuário sem `auth_id`" (fluxo legado) — é a MESMA situação de um admin com convite pendente. A
`ensureAdminInvited` desta story é esse idioma extraído para reuso, não um mecanismo novo.
`[Source: packages/web/src/app/api/brokers/route.ts; packages/web/src/app/api/users/[id]/reset-password/route.ts]`

### Precedente de teste — `brokers/route.test.ts` é o padrão a seguir, não um caminho inédito
`packages/web/src/app/api/brokers/route.test.ts` já faz `vi.mock("@web/lib/supabase/admin", () =>
({ createAdminClient: () => ({}) }))`, `vi.mock("@web/lib/email", () => ({ sendEmail: async () =>
({}) }))` e `vi.mock("@web/lib/email-layout", () => ({ renderPasswordActionEmail: () => "" }))` —
é o teste do MESMO arquivo que esta story reusa como padrão. Esse teste hoje só exercita `GET`
(contagem de leads ativos, Story 75-198); nenhum teste no repositório exercita ainda o caminho
`auth.admin.createUser` em si — mas o **precedente de mockar os três módulos envolvidos já existe
e é estabelecido**, então os testes desta story (AC-A1, AC-A3, AC-A7) estendem um padrão em uso, não
inventam um. O fake para `admin-invite.ts` precisa, além disso, de um builder mínimo para
`.from("users")` (`select`/`insert`/`update`) — não existe em `brokers/route.test.ts` porque aquele
arquivo só testa `GET`; construir esse builder aqui segue a mesma forma "objeto literal fino", não
uma biblioteca de mock de Supabase.
`[Source: packages/web/src/app/api/brokers/route.test.ts]`

### `sendEmail()` não relança
`packages/web/src/lib/email.ts` → `sendEmail()` retorna `{ id, error }`, nunca lança. Se o envio
falhar DEPOIS de `auth_id` já gravado (Auth OK, e-mail não), `deriveAdminInviteStatus` classifica
como `"active"` porque `auth_id` já existe — o admin existe no Supabase Auth mas nunca recebeu o
link. **Risco pequeno e aceito nesta story**: ele pode pedir "esqueci minha senha" pelo fluxo normal
de login assim que existir, e qualquer futura tela de detalhe de usuário no `/platform` (fora de
escopo aqui) pode expor um reenvio genérico. Não modelar agora — é o mesmo princípio de "não
alargar em silêncio" que o épico usa para `PLATFORM_READABLE_TABLES`.
`[Source: packages/web/src/lib/email.ts]`

### `getEmailSettings` funciona sem `email_settings` semeado
`provision_org` não semeia `email_settings` para a org nova (fora do escopo dele). `getEmailSettings`
já trata isso: `.maybeSingle()` retorna `null` → cai no `DEFAULT_SETTINGS` (remetente
`contato@trifold.com.br`). Não é um bloqueio, é comportamento existente.
`[Source: packages/web/src/lib/email.ts:33-40]`

### RLS de `organizations` já cobre a coluna nova
`004_rls_policies.sql:72` — `org_select_own` restringe `SELECT` em `organizations` à própria org
do usuário logado. `admin_invite_email` não abre uma leitura cross-tenant nova: um usuário comum
de outra empresa já não conseguia ler a linha da org alheia antes desta coluna existir, e continua
não conseguindo depois. `/platform` lê via `createAdminClient()` (service-role, bypassa RLS por
desenho — é a própria razão de a Onda 6 precisar de `platformQuery()`), então a proteção real para
o super-admin não é RLS, é a lista fechada da AC-B1/B2. Nenhuma migration de policy é necessária
nesta story.
`[Source: supabase/migrations/004_rls_policies.sql:72]`

### `platformQuery()` cria seu próprio client
O épico declara a assinatura como `platformQuery(table, orgId)` — dois argumentos, sem client
explícito. Como `.select()` do Supabase sempre exige colunas, a assinatura real ficou
`platformQuery(table, columns, orgId?)`, criando `createAdminClient()` internamente (mesmo padrão
de todo o resto de `/platform`, que já usa exclusivamente o client de service-role). `orgId` é
opcional porque as leituras que `orgs/page.tsx` já faz hoje são cross-org (listam TODAS as orgs) —
filtrar por `orgId` quebraria o comportamento atual. `900-31`/`900-35`/`900-44` (telas de detalhe
de uma org específica) é que vão de fato passar `orgId`. O retorno é o query builder do Supabase,
então filtros adicionais (ex.: `.eq("role", "admin")` na AC-B3) são encadeamento normal.
`[Source: epic-900 linha 829; packages/web/src/app/platform/orgs/page.tsx atual]`

### Onde NÃO mexer
`packages/web/src/app/api/platform/orgs/route.ts` já usa `db.rpc("provision_org", ...)` — chamada
de RPC, não leitura de tabela, fora do escopo de `platformQuery()` (que só existe para
`.from(table).select(...)`). Não envolver a chamada de RPC na varredura da AC-B4.

### Complexidade e possível split de PR
A validação do @po notou que `M` estava subestimado para 2 blocos independentes, 11 tasks, ~11
arquivos, 1 migration, 2 endpoints novos e 5 arquivos de teste — ajustado para `G` nesta revisão.
O Bloco B (`platformQuery`) **não depende** do Bloco A e é o que destrava a `900-35` mais cedo; o
@dev pode avaliar dividir em dois PRs (B primeiro, por ser menor e sem migration de dado sensível)
se o tamanho combinado dificultar a revisão — não é uma exigência desta story, é uma opção que
fica registrada para quem for sequenciar o trabalho.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.
> To enable, set `coderabbit_integration.enabled: true` in core-config.yaml

---

## Dev Notes — Testing

**Padrão do repositório, corrigido nesta revisão:** a v0.1 desta story afirmava que "não existe
precedente de mock do Supabase Auth Admin API no repositório" — **falso, e medido**: há 20+
arquivos `*.test.ts` com `vi.mock`, e ≥10 fazem `vi.mock("@web/lib/supabase/admin", ...)`.
`packages/web/src/app/api/brokers/route.test.ts` — o teste do **exato arquivo** que esta story
declara reusar — já mocka `@web/lib/supabase/admin`, `@web/lib/email` (`sendEmail`) e
`@web/lib/email-layout` (`renderPasswordActionEmail`). O caminho de rede (criação de conta Auth,
idempotência, falha parcial) **é** testado automaticamente nesta story, seguindo esse precedente —
não é empurrado para validação manual.

**Testes unitários (Vitest), com `vi.mock`, sem rede real:**
- `admin-invite.test.ts`:
  - `deriveAdminInviteStatus`: 5 casos nomeados, **entradas distintas em todos os cinco**:
    1. `{ adminInviteEmail: null, admin: { id: "u1", authId: "auth-1" } } → "active"`
    2. `{ adminInviteEmail: "x@acme.com", admin: { id: "u1", authId: null } } → "pending"` (linha
       existe, `createUser` falhou ou ainda não rodou, e-mail ainda persistido)
    3. `{ adminInviteEmail: null, admin: { id: "u1", authId: null } } → "pending"` (linha existe,
       sem auth, **sem** e-mail persistido — o único caso em que `admin` decide sozinho; mata a
       mutação "trocar `input.admin || input.adminInviteEmail` por `input.adminInviteEmail`", que
       os 4 casos da v0.2 não matavam — MF-B)
    4. `{ adminInviteEmail: "x@acme.com", admin: null } → "pending"` (e-mail persistido, linha
       ainda não inserida — janela entre AC-A2 e AC-A3.1)
    5. `{ adminInviteEmail: null, admin: null } → "none"` (org legada sem rastro nenhum)
  - `ensureAdminInvited` com `vi.mock("@web/lib/supabase/admin")` fornecendo um fake com
    `auth.admin.createUser`, `auth.admin.generateLink` e um builder mínimo de `.from("users")`
    (`select`/`insert`/`update`, registrando chamadas para asserção de ordem — AC-A2). Casos: (a)
    `createUser` sucesso → `auth_id` gravado, e-mail limpo, tag `platform_admin_invite`; (b)
    `createUser` falha → `{status:"failed", message}`, linha em `users` preservada com `auth_id:
    null` (AC-A3, AC-A7); (c) admin já ativo → nenhuma chamada a `createUser`, `emailIgnored` quando
    aplicável (AC-A3.2); (d) desempate por `created_at ASC` com fixture de duas linhas `role='admin'`
    (SF-5).
- `platform-query.test.ts`: `platformQuery` lança para tabela fora da lista; lança para `columns`
  contendo `"*"` (isolado e em lista); não lança para `"organizations"`/`"users"` com colunas
  explícitas; aplica `.eq("org_id", …)` só quando `orgId` é passado (via spy no client fake).
- `packages/web/src/lib/tenancy/platform-query-scan.test.ts` (path fixado — SF-A, fora dos dois
  diretórios varridos, ao lado do detector): `detectRawTableReads()` com as 5 fixtures inline
  (literal, multilinha de argumento, receiver em linha anterior, receiver-chamada, homônimo)
  descritas na AC-B4; depois, um `it` de varredura real dos dois diretórios, restrito a
  `.ts`/`.tsx` (SF-B) e excluindo `*.test.ts`/`__tests__/`/`__fixtures__/`, esperando `[]`; e a
  leitura do fixture commitado `__fixtures__/orgs-page-pre-900-22b.txt` esperando
  `["organizations", "users"]` (fecha só depois da correção do regex — MF-A).
- `route.test.ts` (existente, `orgs/route.ts`): adicionar `vi.mock` de `getPlatformAdmin` e de
  `@web/lib/supabase/admin`; casos novos — `POST` sem `adminEmail` → `400` (AC-A1); `POST` com
  `orgId` forjado no corpo → `users` inserido com o `orgId` de `provision_org`, não o do corpo
  (AC-A6); `POST` com `createUser` falhando → resposta `201` com `adminInvite.status: "failed"`
  (AC-A7). Testes existentes de `slugify` continuam intocados.
- `resend-admin-invite/route.test.ts` (novo): `403` sem `getPlatformAdmin`; `404` org inexistente;
  `400 NO_PENDING_INVITE` sem nada pendente; `400 ADMIN_INVITE_FAILED` com mensagem propagada
  quando `ensureAdminInvited` falha (AC-A4, AC-A7).

**Manual, contra Supabase de dev (não Vitest) — só para o que Vitest genuinamente não cobre:**
- Provisionar uma org nova pelo wizard com e-mail real de teste, confirmar chegada do e-mail e
  login funcional via o link (fim a fim, incluindo o envio real pelo Resend).
- Confirmar visualmente o badge e o aviso de "e-mail ignorado" na UI.

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-28 | 0.1 | Draft inicial — fecha os dois buracos de AC de 900-21/900-22 (convite do admin, `platformQuery`/`PLATFORM_READABLE_TABLES`), com decisão registrada de manter `provision_org()` sem novos parâmetros | @sm (River) |
| 2026-08-28 | 0.2 | Correções obrigatórias da validação @po (NO-GO 6/10, `docs/qa/po-validation-900-22b.md`): reescreve AC-B3/AC-B4 (detector puro `detectRawTableReads`, regra "qualquer `.from(<literal>)`", fixture commitado fora dos diretórios varridos — MF-1/MF-2/MF-3); corrige assinatura de `deriveAdminInviteStatus` para distinguir "sem linha de admin" de "linha com auth_id nulo" (MF-4); adiciona AC-A7 (e-mail já existente no Supabase Auth, MF-5); corrige seção Testing removendo alegação falsa de ausência de precedente de mock e aponta `brokers/route.test.ts` (MF-6); aplica SF-1 a SF-13 (vi.mock declarado, ordem de chamadas em vez de consulta real, mocks nomeados na AC-A1, e-mail divergente em reprovisionamento tratado, desempate determinístico de múltiplos admins, AC-A6 verificável por teste, `platformQuery` rejeita `"*"`, addendum no épico sobre a assinatura de `provision_org`, item de backlog para `900-16`, `app_metadata`/`hashed_token` explícitos, consulta dedicada `role='admin'` contra o corte de 1000 linhas, escopo de escritas declarado como não coberto); complexidade revisada de M para G | @sm (River) |
| 2026-08-28 | 0.3 | Correções obrigatórias da revalidação @po (NO-GO 8/10, seção "Revalidação — v0.2" de `docs/qa/po-validation-900-22b.md`): MF-A — regex de `detectRawTableReads` trocado de receiver-adjacente (`(\w+)\.from\(`) para receiver-por-exclusão, cobrindo a forma dominante do repositório (receiver em linha anterior, 1.511 ocorrências) e receiver-chamada (`createAdminClient().from(...)`); fixtures inline ampliadas de 3 para 5 formas; a fixture commitada pré-story agora fecha a asserção `["organizations","users"]` sem editar a fixture, e a mutação nomeada da AC-B3 volta a ficar vermelha; MF-B — 5º caso de `deriveAdminInviteStatus` (`admin` preenchido sem `authId` e sem `adminInviteEmail`) mais Mutação 3, provando que o campo `admin` é load-bearing e não redundante com `adminInviteEmail`; SF-A — path de `platform-query-scan.test.ts` fixado em `lib/tenancy/`, fora dos diretórios varridos; SF-B — varredura real restrita a `.ts`/`.tsx`; SF-C — contradição entre aviso não bloqueante e `router.push` na AC-A7 resolvida (wizard não redireciona automaticamente quando `adminInvite.status === "failed"`, só quando o operador confirma) | @sm (River) |
| 2026-08-28 | 1.0 | Implementação (@dev, YOLO). Bloco A: migration `244` (`organizations.admin_invite_email`, aditiva, rollback documentado), campo obrigatório no wizard, `ensureAdminInvited`/`deriveAdminInviteStatus`/`persistAdminInviteEmail` em `lib/tenancy/admin-invite.ts`, endpoint `POST /api/platform/orgs/[id]/resend-admin-invite`, coluna "Admin" com badge e botão "Reenviar". Bloco B: `PLATFORM_READABLE_TABLES` + `platformQuery()` (recusa tabela fora da lista e `"*"` em `columns`), `detectRawTableReads()`, varredura dos dois diretórios de plataforma e fixture pré-story commitada; `orgs/page.tsx` migrado. Régua estática medida **vermelha** (1 falha, 2 hits em `orgs/page.tsx`) antes da T9 e **verde** (12/12) depois, no mesmo PR. 19 mutações executadas e revertidas, todas com vermelho pelo motivo previsto — a tabela MUT1/MUT2/MUT3 do @po foi reproduzida exatamente. Desvios registrados nas Completion Notes: `UPDATE admin_invite_email` movido para `admin-invite.ts` (a rota está dentro do diretório varrido), coluna `id` acrescentada à consulta da AC-B3, `201` explícito na criação (era `200`), redirect do wizard suprimido também em `already_active`. | @dev (Dex) |
| 2026-08-28 | 1.1 | Correções do gate @qa (CONCERNS, merge liberado): **MNT-001** — `platform-query.ts` e `admin-invite.ts` entram em `admin-client-allowlist.json` → `legitimos` com motivo por arquivo (warnings 7→2; os 2 herdados do PR #498 foram para o backlog, não para a allowlist); **REL-001** — `.order("created_at", { ascending: true })` na consulta de admin de `orgs/page.tsx`, alinhando o desempate da LEITURA ao da escrita; **SEC-002** — senha temporária passa de `Math.random()` para `crypto.randomUUID()`; **SEC-001** — comentário de topo de `platform-query.ts` documenta que a recusa de `"*"` não cobre embedding do PostgREST, com dona nomeada (`900-42a`). REL-001 e SEC-002 chegaram sem carrasco (apagá-las deixava 12/12 e 22/22 verdes): acrescentei régua estática para o `.order` e teste de spy duplo para a senha, e confirmei o vermelho de ambas por mutação. Débito para `docs/backlog.md`: SEC-001, TEST-001 (pontos cegos do detector medidos), MNT-002 (critério do precedente `lib/tenancy/`) e os 2 arquivos do #498. Suíte completa reexecutada: 257 arquivos, 3.146 verdes. | @dev (Dex) |
| 2026-08-28 | 1.2 | Correções do CodeRabbit (PR #522, CHANGES_REQUESTED). **3 achados novos:** (a) os fakes de Supabase das duas suítes passaram a honrar `.eq`/`.order`/`.limit` — antes, apagar o filtro de org ficava VERDE, ou seja, o teste era cego à invariante de isolamento de tenant; 7 mutações confirmam, uma por cláusula e por arquivo; (b) `ensureAdminInvited` deixou de devolver `"invited"` quando o vínculo do `auth_id`, o `generateLink` ou o `sendEmail` falham — agora devolve `failed` com mensagem e NÃO limpa `admin_invite_email`, mantendo o "Reenviar" disponível; (c) e-mail divergente entre a linha pendente e o convite passa a ser reconciliado em `users.email`/`name` ANTES do `createUser`. **Minors aceitos:** `persistAdminInviteEmail` loga o erro do UPDATE em vez de engoli-lo; `adminEmail` ganha validação de formato (`400 ADMIN_EMAIL_INVALID`) para não provisionar org com admin fantasma; `module-contract.test.ts` novo, sem `vi.mock`, fecha o buraco de mocks de módulo inteiro fabricarem símbolos renomeados. **Minors descartados com motivo:** corte de 1000 linhas da contagem de usuários (herdado da `900-22`, a AC-B3 manda registrar como item adjacente — foi para o backlog) e o gate `.yml` do @qa (artefato alheio). **SEC-001 e TEST-001 não tocados** — dona `900-42a`. Backlog: escopo do item da allowlist remedido para **1 arquivo / 2 warnings** (a `orgs/page.tsx` parou de avisar ao ser migrada) e item novo do corte de 1000 linhas. | @dev (Dex) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M) — @dev (Dex), modo YOLO autônomo, 2026-08-28.

### Debug Log References

**C-2 — a varredura nasceu VERMELHA, e isso foi OBSERVADO antes da migração (não afirmado).**
Rodei `platform-query-scan.test.ts` logo depois da T8 e ANTES da T9:

```
Tests  1 failed | 8 passed (9)
× nenhum `.from(<literal>)` cru sobrevive em app/platform/** e app/api/platform/**
  AssertionError: expected [ { …(2) } ] to deeply equal []
  + [ { "arquivo": "app/platform/orgs/page.tsx",
        "tabelas": [ "organizations", "users" ] } ]
```

Depois da T9 (migração para `platformQuery`), o MESMO arquivo de teste:
`Tests 12 passed (12)`. O par vermelho→verde está no mesmo PR, medido nos dois pontos.
A contagem bate com a do @po (2 hits, 4 arquivos varridos — hoje são 5, com a rota de reenvio).

**C-4 — colisão de migration, remedida contra `origin/main` (não contada localmente).**
`git ls-tree origin/main -- supabase/migrations/` → maior número `243_capability_live_coach.sql`;
`grep '/244_'` em `origin/main` → nenhuma ocorrência. A árvore local desta branch para em `241`,
então contar localmente daria `242`, que colide com `242_coach_suggestions.sql`. Reconferido duas
vezes (início e fim da implementação).

**Mutações executadas — cada uma aplicada, vista vermelha, e revertida.**
Nenhum teste desta story ficou verde sem ter sido visto vermelho pelo motivo certo.

| Mutação | Arquivo | Testes que caíram |
|---|---|---|
| remove `if (!adminEmail)` (AC-A1) | `orgs/route.ts` | 3 (400, trim, "não provisiona") |
| convite ANTES do `UPDATE` (AC-A2) | `orgs/route.ts` | 1 — só o teste de ordem |
| `admin?.auth_id` → `admin?.id` (AC-A3, a mais perigosa) | `admin-invite.ts` | 1 |
| remove a checagem de `auth_id` (AC-A3 idempotência) | `admin-invite.ts` | 3 |
| `\|\|` → `&&` no 2º `if` (AC-A5 MUT1) | `admin-invite.ts` | casos 3 e 4 |
| `admin?.authId` → `admin?.id` (AC-A5 MUT2) | `admin-invite.ts` | casos 2 e 3 |
| remove `input.admin` do 2º `if` (AC-A5 MUT3) | `admin-invite.ts` | **só o caso 3** |
| `message: ""` no retorno de falha (AC-A7) | `admin-invite.ts` | 1 |
| remove o guard `getPlatformAdmin` (AC-A4) | `resend-admin-invite/route.ts` | 2 |
| não propaga `message` no corpo HTTP (AC-A7) | `resend-admin-invite/route.ts` | 1 |
| remove o `400 NO_PENDING_INVITE` (AC-A4) | `resend-admin-invite/route.ts` | 1 |
| apaga o comentário `lista PROVISÓRIA` (AC-B1) | `platform-query.ts` | 1 |
| remove o `if` da lista de tabelas (AC-B2) | `platform-query.ts` | 2 |
| remove o `if` que recusa `"*"` (AC-B2) | `platform-query.ts` | 2 |
| remove a exclusão de `Buffer`/`Array` (AC-B4) | `platform-query-scan.ts` | 1 |
| reverte a leitura de `organizations` (AC-B3) | `orgs/page.tsx` | 2 |
| reverte a contagem de `users` (AC-B3) | `orgs/page.tsx` | 2 |
| reverte a consulta dedicada de admin (AC-B3) | `orgs/page.tsx` | 2 |
| walker do scan ignora todo arquivo (vivacidade) | `platform-query-scan.test.ts` | 1 |

A tabela de MUT1/MUT2/MUT3 do @po (Revalidação v0.3, seção B) foi reproduzida **exatamente**:
MUT1 mata os casos 3 e 4; MUT2 mata os casos 2 e 3; MUT3 mata **só** o caso 3. O 5º caso
(`admin` preenchido, sem `authId`, sem `adminInviteEmail`) é de fato o único carrasco da MUT3 —
o campo `admin` é load-bearing, medido e não só alegado.

**Validações finais:**
- `npx tsc --noEmit` em `packages/web` → exit 0 (7 erros de tipo foram introduzidos e
  corrigidos no caminho; ver Completion Notes, item 3).
- `npx eslint src/lib/tenancy src/app/platform src/app/api/platform` → 0 erros, 7 warnings
  (baseline da mesma varredura antes da story: 0 erros, 4 warnings) — ver Completion Notes, item 4.
- `npx vitest run` (suíte completa) → 257 arquivos, 3.146 testes verdes, 6 `expected fail`.
  Baseline sem esta story: 253 arquivos, 3.082 verdes. Delta: +4 arquivos, +64 testes, 0 quebras.
- `npm run gate:tenancy` → catraca OK, delta +0 (83 FAIL, igual ao baseline de 2026-08-23).
  O relatório que o gate reescreve (`docs/audits/gate-tenancy-report.json`) foi revertido —
  é artefato de execução, não entrega desta story.

### Correções do gate @qa (CONCERNS → aplicadas em 2026-08-28)

Gate: `docs/qa/gates/900.22b-convite-do-admin-e-platformquery.yml`. Nenhuma das quatro toca a
lógica que as ACs medem, então o par vermelho→verde da AC-B4 não precisou ser remedido — mas a
suíte inteira foi reexecutada depois de todas.

| ID | O que mudou | Vermelho que sustenta |
|---|---|---|
| **MNT-001** | `src/lib/tenancy/platform-query.ts` e `src/lib/tenancy/admin-invite.ts` entram em `docs/audits/admin-client-allowlist.json` → `legitimos`, com motivo por arquivo | n/a (governança) — verificado pela contagem de warnings, abaixo |
| **REL-001** | `.order("created_at", { ascending: true })` na consulta dedicada de admin em `orgs/page.tsx`: o desempate da LEITURA passa a ser o mesmo da escrita | régua estática nova em `platform-query-scan.test.ts`; remover o `.order` derruba 1 teste |
| **SEC-002** | senha temporária passa a vir de `crypto.randomUUID()` (precedente de `users/[id]/reset-password/route.ts`) em vez de `Math.random()` (precedente de `brokers/route.ts`) | teste novo com spy duplo; voltar para `Math.random()` derruba 1 teste |
| **SEC-001** | comentário de topo de `platform-query.ts` documenta que a recusa de `"*"` **não** cobre embedding do PostgREST; dona nomeada: `900-42a` | n/a (só comentário) — o furo foi medido com controles positivos, ver abaixo |

**Dois furos de verificação que eu mesmo abri e fechei nesta rodada.** REL-001 e SEC-002 chegaram
como "uma linha cada" e, aplicadas cruas, **nenhuma das duas tinha vermelho**: apagar o `.order`
deixava 12/12 verdes, e voltar para `Math.random()` deixava 22/22 verdes. Correção sem carrasco é
alegação, não conserto. Acrescentei uma régua estática para o `.order` e um teste de spy duplo
(`crypto.randomUUID` chamado / `Math.random` **não** chamado) para a senha, e confirmei o vermelho
dos dois por mutação antes de dar por feito.

**SEC-001 remedido por mim, com controles positivos** (não reproduzi de ouvido):

```
platformQuery("organizations", "*")                      → lança  ✔ controle positivo
platformQuery("organizations", "id, *")                  → lança  ✔ controle positivo
platformQuery("organizations", "id, users(*)")           → PASSA  ✘ furo
platformQuery("organizations", "id, leads(name, phone)") → PASSA  ✘ furo
```

Embedding do PostgREST: 84 arquivos de `packages/web/src` usam o idioma na minha medição (o @qa
mediu 83 — recortes de grep ligeiramente diferentes; a ordem de grandeza é a mesma e a conclusão
não muda).

**Warnings: 7 → 2, não 7 → 5 como o gate previu.** A previsão contava 1 warning por arquivo
allowlistado; a regra emite **1 por ocorrência** (import + cada call site). Quebra real:

| Momento | `orgs/route.ts` | `orgs/page.tsx` | `admin-invite.ts` | `platform-query.ts` | Total |
|---|---|---|---|---|---|
| baseline (antes da story) | 2 | 2 | — | — | **4** |
| depois da story, antes da allowlist | 2 | 0 | 3 | 2 | **7** |
| depois da allowlist | 2 | 0 | 0 | 0 | **2** |

Os 2 que sobram são os herdados do PR #498, num arquivo só, e foram para o backlog em vez da
allowlist (escopo de MNT-001 respeitado). Efeito líquido da story sobre a régua: **4 → 2** — ela
removeu 2 warnings ao migrar `orgs/page.tsx` para `platformQuery()`.

**Débito registrado em `docs/backlog.md`** (4 itens novos): `SEC-001` (embedding, dona `900-42a`),
`TEST-001` (pontos cegos do detector — template literal e variável, ambos medidos como `[]`; mais a
guarda de vivacidade que assere só `total > 0`), `MNT-002` (o precedente "se acender, mova para
`lib/tenancy/`" precisa de critério escrito, senão vira depósito de fuga da régua) e os 2 arquivos
herdados do #498 fora da allowlist.

**Revalidação após as 4 correções:** `tsc --noEmit` exit 0 · `eslint` 0 erros / 2 warnings ·
suíte completa 257 arquivos, 3.146 verdes, 6 `expected fail` (idêntica à de antes das correções) ·
testes da story 5 arquivos, 72 verdes (eram 70; +2 dos carrascos novos).

### Correções do CodeRabbit (PR #522, CHANGES_REQUESTED → aplicadas em 2026-08-28)

13 comentários. **2 não foram tocados por terem dona declarada**: `platform-query.ts` (SEC-001,
embedding — o CodeRabbit confirmou por consulta à doc do `supabase-js` 2.49.0) e
`platform-query-scan.ts` (TEST-001, template literal), ambos de `900-42a`. **1 é operacional**
(aplicar a migration `244` antes do deploy do código) e é precondição do @devops, não mudança de
código.

| # | Achado | O que mudou | Mutação que ficou vermelha |
|---|---|---|---|
| **1** | fakes de Supabase ignoravam `.eq`/`.order`/`.limit` — apagar o filtro de org ficava VERDE | os dois fakes (`admin-invite.test.ts` e `resend-admin-invite/route.test.ts`) passaram a filtrar, ordenar e limitar de verdade sobre linhas reais | 7 mutações, uma por cláusula e por arquivo — ver tabela abaixo |
| **2** | `ensureAdminInvited` devolvia `"invited"` mesmo com falha depois do `createUser` | 3 pontos passam a devolver `{status:"failed", message}` e a **não** limpar `admin_invite_email`: vínculo do `auth_id`, `generateLink` (erro ou sem `hashed_token`) e `sendEmail` (que devolve `{error}` e nunca lança) | `if (vinculoErro)`→`if(false)` cai 1; `if (linkErro \|\| !hashed_token)`→`if(false)` cai 2; `if (envioErro)`→`if(false)` cai 1 |
| **3** | e-mail divergente: Auth criado com o endereço novo, `auth_id` gravado na linha com o antigo | `ensureAdminInvited` reconcilia `users.email`/`name` **antes** do `createUser` quando a linha PENDENTE tem outro endereço | remover o `if` de reconciliação cai 3 |
| Minor | `persistAdminInviteEmail` engolia o erro do `UPDATE` | passa a logar estruturado (não relança: a org existe e o convite ainda pode dar certo) | `if (error)`→`if(false)` cai 1 |
| Minor | `adminEmail` só era checado como "não vazio" (`admin@` passava) | `400 ADMIN_EMAIL_INVALID` antes de `provision_org` | remover a regex cai 2 |
| Minor/Major | mocks de módulo inteiro fabricam símbolos: renomear um export deixa tudo verde | `module-contract.test.ts` novo, **sem nenhum `vi.mock`**, assere existência e aridade de 6 módulos | n/a (é a rede que não existia) |

**As 7 mutações do achado #1 — cada uma matou exatamente o seu próprio teste:**

| Mutação | Arquivo mutado | Teste que caiu |
|---|---|---|
| remove `.eq("org_id")` | `admin-invite.ts` | "não enxerga o admin de OUTRA org" |
| remove `.eq("role","admin")` | `admin-invite.ts` | "não confunde admin com usuário de outro papel" |
| remove `.order("created_at")` | `admin-invite.ts` | "desempata pegando o MAIS ANTIGO" |
| remove `.eq("org_id")` | `resend-admin-invite/route.ts` | "não enxerga o admin de OUTRA org" |
| remove `.eq("role")` | `resend-admin-invite/route.ts` | "não confunde admin com outro papel" |
| remove `.order("created_at")` | `resend-admin-invite/route.ts` | "desempata pegando o MAIS ANTIGO" |
| remove `.eq("id", orgId)` | `resend-admin-invite/route.ts` | "[id] inexistente é 404 mesmo com outra org no banco" |

**O fake honesto já cobrou um teste na hora de entrar.** `"passa o [id] da rota para
ensureAdminInvited"` passava **por engano**: ele chamava com `org-da-rota` enquanto o banco falso
só tinha `org-1`, e o duplo cego devolvia a org fixa ignorando o `.eq("id", …)`. Com o filtro
honrado virou `404`. Corrigi a fixture (a org agora existe com esse id) — é a demonstração, dentro
da própria suíte, do que o achado #1 dizia.

**Onde cada `.order("created_at")` é medido — três call sites, três réguas, sem sobreposição e sem
buraco** (a pergunta explícita do gate):

| Call site | Régua | Tipo |
|---|---|---|
| `orgs/page.tsx` (lista, server component sem harness) | `platform-query-scan.test.ts` → "a consulta dedicada de admin desempata pelo mesmo critério da escrita" | estática (texto do arquivo) |
| `admin-invite.ts` → `ensureAdminInvited` | `admin-invite.test.ts` → "desempata múltiplos admins pegando o MAIS ANTIGO" | comportamental (fake ordena de verdade) |
| `resend-admin-invite/route.ts` | `resend-admin-invite/route.test.ts` → "desempata pegando o admin MAIS ANTIGO" | comportamental |

A régua estática é usada **só** onde não há como executar o código (server component); os outros
dois são comportamentais. Nenhuma cobre o mesmo call site duas vezes.

**Minors descartados, com motivo:**
- **contagem de usuários por org sofre o corte de 1000 linhas** (`orgs/page.tsx`) — real, mas
  **herdado da `900-22`** e declarado fora de escopo pela própria AC-B3 ("Nota de escopo, não
  corrigida aqui... registrar como item adjacente, não widen scope em silêncio"). Fiz o que a AC
  manda: registrei em `docs/backlog.md` em vez de corrigir aqui.
- **`docs/qa/gates/900.22b-*.yml` descreve MNT-001 como pendente** — o arquivo de gate é artefato
  do @qa; não edito parecer alheio. O que era meu nessa observação era a Completion Note nº 4 da
  v1.0, que ficou obsoleta quando o gate autorizou a edição da allowlist: marcada como SUPERADA.

### Completion Notes List

1. **`persistAdminInviteEmail()` mora em `admin-invite.ts`, não na rota — e isso não é
   preferência de estilo.** A T3 pede o `UPDATE admin_invite_email` "na rota", mas
   `app/api/platform/orgs/route.ts` está DENTRO de um dos dois diretórios que a AC-B4 varre
   exigindo zero `.from(<literal>)` cru. Um `db.from("organizations").update(...)` ali acenderia a
   régua sem que houvesse nada errado — e a saída natural seria afrouxar a exclusão, que é
   exatamente o defeito que os dois NO-GO anteriores existiram para matar (C-1). A escrita foi
   movida para `lib/tenancy/admin-invite.ts`, que o Scope OUT da própria story já agrupa com "o
   `UPDATE admin_invite_email` desta própria story". A ordem exigida pela AC-A2 continua
   verificável: o fake registra `update organizations` antes de `ensureAdminInvited`.
2. **Nenhum comentário novo precisou ser reescrito por causa do detector, mas o risco era real
   (C-1).** O cabeçalho de `orgs/page.tsx` foi reescrito nesta story e a frase natural seria
   "antes líamos `db.from("organizations")`". Foi escrito como "uma leitura crua nesta tela" de
   propósito. Zero exclusões foram afrouxadas; o walker do teste mantém `*.test.ts`,
   `__tests__/` e `__fixtures__/` com o comentário de "NÃO REMOVER" e o motivo.
3. **`platformQuery(table, columns: string, …)` degrada a tipagem da linha — custo documentado,
   não desleixo.** Como `columns` é um `string` de runtime (é o que permite recusar `"*"`), o
   client tipado do Supabase não infere a forma da linha e devolve `GenericStringError[]`. Todos
   os chamadores precisam de `as unknown as <Linha>[]`. Isso gerou 5 dos 7 erros de `tsc` que
   apareceram e foram corrigidos. Registrado em comentário no topo de `platform-query.ts` para
   que a `900-42a`, ao endurecer, saiba que recuperar a tipagem exige trocar `string` por um
   genérico de literal.
4. ~~**7 warnings de `aios/no-unscoped-admin-client`...**~~ **SUPERADO na v1.1** — o gate @qa
   tomou a decisão de governança (MNT-001) e a allowlist foi editada; warnings hoje: **2**, todos
   herdados do PR #498. O texto original fica abaixo como registro do que foi decidido e por quem.
   4. **7 warnings de `aios/no-unscoped-admin-client` (baseline eram 4) — não bloqueiam, mas
   merecem decisão de quem tem autoridade.** A regra manda allowlistar casos legitimamente
   cross-org em `docs/audits/admin-client-allowlist.json`. `platform-query.ts` é *o* caminho
   cross-org sancionado desta story, e `admin-invite.ts` também é cross-org por natureza
   (a Trifold convida o admin de uma empresa que não é a dela). Nenhum arquivo de `/platform`
   está hoje na allowlist — nem os que o PR #498 já tinha deixado avisando. **Não editei a
   allowlist**: é artefato de governança, a story não pede, e `npm run lint` passa (0 erros).
   Fica como decisão para @qa/@po.
5. **Wizard: o redirect é suprimido também em `already_active`, não só em `failed`.**
   `[AUTO-DECISION]` A AC-A7 nomeia só `"failed"` (não navega) e `"invited"` (navega), e não diz
   o que fazer com `already_active`. Reprovisionar um slug existente com outro e-mail produz
   `already_active` + `emailIgnored`, e a AC-A5 exige que a UI diga que o e-mail foi ignorado —
   `router.push` apagaria essa mensagem pelo mesmíssimo mecanismo que a AC-A7 documenta.
   Regra implementada: navega **só** quando `status === "invited"`. Motivo: é a leitura que
   preserva as duas ACs; o contrário perderia uma mensagem que a AC-A5 manda mostrar.
6. **Divergência: a AC-B3 lista `platformQuery("users", "org_id, auth_id")`, mas
   `deriveAdminInviteStatus` exige `{ id, authId }`.** A coluna `id` foi acrescentada
   (`"org_id, id, auth_id"`) — sem ela a AC-A5 não tem como montar o parâmetro `admin`.
7. **Divergência: a AC-A1 afirma que o `POST` sem `adminEmail` "retorna `201` hoje". Retornava
   `200`** — o handler pré-story fazia `NextResponse.json({ orgId, name, slug })` sem `status`.
   O vermelho da AC-A1 continua válido (o teste espera `400` e recebia `2xx`), e a AC-A7 exige
   `201`, então o `{ status: 201 }` passou a ser explícito.
8. **Divergência menor: `renderPasswordActionEmail` vive em `@web/lib/email-layout/` (diretório
   com `index.ts`), não em `email-layout.ts`.** O import é idêntico; só a nota da story sugeria
   um arquivo único.
9. **`ensureAdminInvited` não reescreve `users.email` quando a linha já existe com outro
   endereço.** A AC-A3.3 manda usar o parâmetro `email` em `createUser`/`generateLink`/`sendEmail`
   e não fala em atualizar a linha. Mantido literal. Efeito prático: a conta Auth nasce com o
   e-mail convidado e o login funciona (a resolução é por `auth_id`), mas `users.email` pode ficar
   com o endereço antigo até alguém editar em Usuários. Não inventei o `UPDATE` que fecharia isso.
10. **Migration criada, NÃO aplicada em banco nenhum.** `244_org_admin_invite_email.sql` é
    aditiva (`ADD COLUMN IF NOT EXISTS`, nullable, sem default, sem backfill) e documenta o
    rollback. Nenhum DDL foi executado em produção nem em dev por este agente.
11. **Flake observado e descartado.** Uma execução da suíte completa às 14:24 acusou 3 falhas em
    `webhook/whatsapp/__tests__/route.test.ts`. Ela rodou enquanto dois processos `tsc`
    saturavam a CPU. Reexecutada com a máquina ociosa: verde. Baseline (sem esta story) e árvore
    final (com esta story) estão ambas verdes na suíte completa. Não é regressão desta story,
    mas fica registrado como fragilidade sob carga daquele arquivo.

### File List

**Criados**
- `supabase/migrations/244_org_admin_invite_email.sql`
- `packages/web/src/lib/tenancy/platform-query.ts`
- `packages/web/src/lib/tenancy/platform-query.test.ts`
- `packages/web/src/lib/tenancy/platform-query-scan.ts`
- `packages/web/src/lib/tenancy/platform-query-scan.test.ts`
- `packages/web/src/lib/tenancy/__fixtures__/orgs-page-pre-900-22b.txt`
- `packages/web/src/lib/tenancy/admin-invite.ts`
- `packages/web/src/lib/tenancy/admin-invite.test.ts`
- `packages/web/src/lib/tenancy/module-contract.test.ts` (CodeRabbit #522 — contrato de exportação, sem `vi.mock`)
- `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.ts`
- `packages/web/src/app/api/platform/orgs/[id]/resend-admin-invite/route.test.ts`
- `packages/web/src/app/platform/orgs/_components/reenviar-convite.tsx`

**Modificados**
- `packages/web/src/app/api/platform/orgs/route.ts`
- `packages/web/src/app/api/platform/orgs/route.test.ts`
- `packages/web/src/app/platform/orgs/page.tsx`
- `packages/web/src/app/platform/orgs/new/page.tsx`
- `docs/audits/admin-client-allowlist.json` (gate @qa, MNT-001 — 2 entradas em `legitimos`)
- `docs/backlog.md` (gate @qa — SEC-001, TEST-001, MNT-002 e os 2 arquivos herdados do #498)
- `docs/stories/900-22b-convite-do-admin-e-platformquery.story.md`

---

## QA Results

_A preencher por @qa._

### Review Date: 2026-08-28

### Reviewed By: Quinn (Test Architect)

### Método — o que eu medi, e não aceitei por relato

O Debug Log desta story é uma **alegação**. Reproduzi o núcleo dela com as mãos:

1. **Par vermelho→verde da varredura estática.** Restaurei `orgs/page.tsx` para a versão de `HEAD`
   e rodei `platform-query-scan.test.ts`. A varredura acusou
   `[{ arquivo: "app/platform/orgs/page.tsx", tabelas: ["organizations","users"] }]` — a **mesma
   saída literal** do Debug Log. Com as 12 asserções atuais o placar é `4 failed | 8 passed`; os
   8 verdes são exatamente os 8 do relato, o que fecha a aritmética do `1 failed | 8 passed` no
   estado pré-T9 (9 testes, sem o `describe` de AC-B3). Restaurada a versão da story: `12 passed`.
2. **Procedência da fixture.** `diff` entre `git show HEAD:.../orgs/page.tsx` e
   `__fixtures__/orgs-page-pre-900-22b.txt` → **byte-idênticos**. A prova commitada é o arquivo
   pré-story de verdade, não um recorte ajustado para produzir a asserção.
3. **As três mutações de `deriveAdminInviteStatus`, executadas por mim.** MUT1 (`||`→`&&`) mata os
   casos **3 e 4**; MUT2 (`authId`→`id`) mata os casos **2 e 3**; MUT3 (remove `input.admin`) mata
   **só o caso 3**. Bate exatamente com a tabela do @po. O campo `admin` é load-bearing — medido,
   não alegado.
4. **Guarda de vivacidade.** Mutei o walker para ignorar todo arquivo: `1 failed | 11 passed`. Ela
   existe, é o único carrasco, e sem ela o `it` de varredura ficaria de fato trivialmente verde.
5. **AC-A2 sobrevive ao move.** Não bastava a mutação trivial (que só prova ausência). Rodei a
   variante em que `persistAdminInviteEmail` **executa**, apenas depois do convite: cai 1 teste, o
   de ordem. A asserção é sobre ORDEM. Mover o `UPDATE` para `admin-invite.ts` **não** enfraqueceu
   a AC-A2.
6. **Controle positivo da régua pós-move.** Injetei uma leitura crua de verdade
   (`await db` ⏎ `.from("leads")`) na rota de reenvio: varredura **vermelha**, acusando `["leads"]`
   naquele arquivo. A régua continua acendendo contra leitura crua dentro do diretório varrido.
7. **Suíte, com baseline medido e não inferido.** Com a story: `257 arquivos | 3.146 passed | 6
   expected fail`. Movi os 4 arquivos de teste novos para fora e restaurei `orgs/route.test.ts` de
   `HEAD`: `253 | 3.082 | 6 expected fail`. **Delta +4/+64, zero quebras.** Confere.
8. **`tsc --noEmit` exit 0. `eslint` 0 erros / 7 warnings. `gate:tenancy` catraca +0** (83 FAIL,
   relatório de execução restaurado).
9. **Migration 244.** Livre contra `origin/main` (maior é `243_capability_live_coach.sql`;
   `origin/main` já avançou para `0c2b4eb8` e continua sem 244). **Nenhum DDL aplicado**: consultei
   os dois projetos Supabase pela Management API — prod `dsopqkqjkmhytudaaolv` e dev
   `xnxvygyfyyyzwhiuoehz`; nos dois, `organizations.admin_invite_email` não existe e
   `schema_migrations` não tem `244%`.
10. **Flake do WhatsApp — não é regressão.** `webhook/whatsapp/__tests__/route.test.ts`: 12/12 em 3
    execuções isoladas, verde na suíte completa com a story e verde na baseline sem ela. O arquivo
    não importa nada que esta story toca.

Toda mutação foi revertida e a árvore reconferida: suíte completa verde de novo ao final
(`257 | 3.146`), `git status` idêntico ao estado inicial.

### Os pontos que o coordenador pediu para julgar

**Mover o `UPDATE` da rota para `lib/tenancy/admin-invite.ts` — decisão CERTA.** A justificativa é
sólida (a rota está no diretório varrido; escrever ali acenderia a régua com código correto e a
saída natural seria afrouxar a exclusão — o C-1 do @po), e o resultado foi **medido**: a AC-A2
continua discriminando ordem (item 5 acima) e a régua continua acendendo contra leitura crua (item
6). Nenhuma exclusão foi afrouxada. O que fica é um **precedente** — "se a régua acende, mova o
código para lib/tenancy" — que aplicado por reflexo esvazia a régua sem nunca tocar nela. Registrado
como `MNT-002` para a `900-42a` fixar o critério.

**Allowlist: sim, allowlistar antes do merge.** O `_aviso` do próprio
`docs/audits/admin-client-allowlist.json` diz que arquivo novo que precise do client cru vai para
`legitimos` com motivo. `platform-query.ts` é *o* caminho cross-org sancionado do painel; deixá-lo
anônimo no meio de 7 warnings é o oposto do que a allowlist produz. São 2 entradas JSON com
justificativa, não mudança de código. Os 2 arquivos herdados do PR #498 **não** são desta story —
backlog. O @dev acertou em não editar governança por conta própria; a decisão está tomada aqui
(`MNT-001`).

**Degradação de tipagem do `platformQuery` — custo ACEITÁVEL nesta onda.** O parâmetro de runtime é
justamente o que permite recusar `"*"`, e o débito está escrito no topo de `platform-query.ts` **com
o caminho de saída nomeado** (trocar `string` por genérico de literal). Não é dívida que a `900-42a`
herda sem saber — ela herda com a nota na cara. Fica só a recomendação de não replicar
`as unknown as` sem comentário nas telas de `900-31`/`900-35`/`900-44` (`ARCH-001`).

**As 5 divergências.** Quatro eram fatos do repositório ou erros de transcrição da story e estavam
certas de resolver no código: `200`→`201` (a AC-A7 já exigia 201; o vermelho da AC-A1 não dependia
do número), coluna `id` na consulta de admin (a assinatura de `deriveAdminInviteStatus` na AC-A5 a
exige — a AC-B3 é que transcreveu incompleto), `renderPasswordActionEmail` em `lib/email-layout/`, e
o `UPDATE` movido. A **quinta** — `[AUTO-DECISION]` de não redirecionar em `already_active` — é a
única que merecia um ping ao @sm: é comportamento de produto visível ao operador, e preencher buraco
de AC é papel do @sm/@po, não do executor. Como a leitura é a única que preserva AC-A5 e AC-A7
simultaneamente, está escrita, é reversível e nenhuma AC ficou violada, **não retorna a story** —
fica como observação de processo.

### Achados novos deste gate (não estavam no Debug Log nem no parecer do @po)

- **`SEC-001` (medium) — a recusa de `"*"` não cobre embedding do PostgREST.** Sonda com controles
  positivos: `platformQuery("organizations", "*")` e `("organizations", "id, *")` são recusados;
  `("organizations", "id, users(*)")` **passa** (o split por vírgula nunca vê um elemento igual a
  `"*"`). Como todo o schema tem `org_id uuid REFERENCES organizations(id)`, o embedding também
  contorna a própria `PLATFORM_READABLE_TABLES`: `platformQuery("organizations", "id, leads(name,
  phone)")` leria `leads` — deliberadamente fora da lista — **sem emitir `.from()` cru**, logo sem
  acender o scanner da AC-B4. Embedding é idioma corrente aqui (83 arquivos usam). **Sem exposição
  viva** (os 3 chamadores usam listas planas), mas a tese "a lista fechada é a única fronteira real
  sob D14" é mais estreita do que o texto afirma. Owner: `900-42a`.
- **`REL-001` (low)** — o desempate determinístico foi aplicado na escrita (`ensureAdminInvited` e
  rota de reenvio usam `.order("created_at" ASC).limit(1)`) e **esquecido na leitura**: a consulta de
  admin em `orgs/page.tsx` não tem `.order`. Numa org com mais de um admin — a "Trifold" legada, o
  caso que a própria AC-A3 cita — o badge pode apontar para uma linha e o botão Reenviar agir sobre
  outra, devolvendo `400 NO_PENDING_INVITE` sem explicação. Conserto: uma linha.
- **`SEC-002` (low)** — senha temporária via `Math.random()`. É cópia byte a byte de
  `brokers/route.ts:67`, portanto reuso fiel e não invenção; mas o principal aqui é o admin de uma
  empresa inteira, a janela é indefinida, e o repositório **já tem** o padrão forte
  (`crypto.randomUUID()` em `users/[id]/reset-password/route.ts:42`) — corrigir também seria reuso.
- **`TEST-001` (low)** — pontos cegos medidos do detector, não declarados no docstring (que só
  documenta o falso **positivo**): `db.from(\`leads\`)` → `[]` e `db.from(VAR)` → `[]`
  (`db.schema("public").from("leads")` → `["leads"]`, esse pega). E a guarda de vivacidade assere
  apenas `total > 0` (hoje 6 arquivos) — pega a cegueira total, não uma quebra parcial do walker.
- **`DOC-001` (low)** — a `R9` do `gate:tenancy` roda `git diff --diff-filter=A origin/main...HEAD`,
  só enxerga arquivo **commitado**. Com a árvore não commitada ela reportou "nenhuma migration nova",
  ou seja **não exercitou a 244**. Sem consequência (244 é `ADD COLUMN` puro, sem função), mas o
  "gate:tenancy +0" é verdadeiro **e vazio** quanto a 244. @devops deve rodar de novo após o commit.

### Compliance Check

- Coding Standards: ✓ (0 erros de lint; 7 warnings da regra `warn` — ver `MNT-001`)
- Project Structure: ✓
- Testing Strategy: ✓ — vermelho medido antes do verde, mutações com carrasco identificado, fixture
  de procedência verificável, guarda de vivacidade presente e provada como único carrasco
- All ACs Met: ✓ (12/12 implementadas; AC-B2 com a limitação de escopo do `SEC-001`)

### Gate Status

Gate: CONCERNS → docs/qa/gates/900.22b-convite-do-admin-e-platformquery.yml

### Recommended Status

**✗ Changes Required** — 3 correções curtas antes do merge (`MNT-001` allowlist, `REL-001` `.order`,
`SEC-002` `crypto.randomUUID`) + 1 comentário (`SEC-001` na doc de `platform-query.ts`). Nenhuma
delas toca a lógica que as ACs medem, e nenhuma exige remedir o par vermelho→verde. O corpo da
story está sólido: é a implementação mais bem instrumentada que passou por este gate nesta onda.
Nada aplicado em banco — a migration `244` continua só como arquivo.
