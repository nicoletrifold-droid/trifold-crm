# Story 900-67 — O logo da Trifold no cabeçalho do e-mail deixa de ser decidido por regex no nome, e passa a ser por `org_id`

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Fundação do whitelabel de três camadas — item **2** dos três itens que "mudam a
  direção da falha" (`docs/architecture/whitelabel-e-migracao-jud.md`, §2.3, §5, §8).
- **Story:** 900-67 — número reconfirmado livre em 2026-09-03 (mesma verificação da 900-65/900-66).
- **Status:** Ready for Review
- **Priority:** P0 — o doc-fonte chama este item de "prova viva" do invariante do item 1: o bug
  **já existe hoje** e a org que o dispara **já está planejada** (`900-25`, "Org Trifold Sandbox").
  Não é um risco hipotético para quando houver um segundo cliente — é um defeito latente que a
  própria leva de trabalho em andamento vai ativar.
- **Complexity:** S no mecanismo central (uma função pura + um `if`), M no total pela auditoria de
  10 pontos de chamada que hoje não passam org nenhuma para a decisão.
- **Depende de:** nada em termos de merge (nenhuma outra story precisa entrar antes). Referencia
  `lib/tenancy/trifold-org.ts` (`trifoldOrgId()`), já existente desde a Story 900-23.

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @dev (Dex), pré-commit.
- **Quality Gate Tools:** `[code_review]`. Sem `migration_review`. Sem `security_review` de
  superfície nova — nenhuma rota, nenhuma escrita nova; é troca de decisão dentro de um template
  de e-mail já existente.

---

## User Story
**Como** dono do produto,
**eu quero** que o cabeçalho do e-mail só mostre a logo/wordmark da Trifold quando o e-mail é
genuinamente da Trifold — nunca por causa do NOME de outra organização casar com uma palavra,
**para que** nenhuma organização, hoje ou no futuro, receba a marca de outra por acidente de texto.

---

## O bug, como ele é hoje

`packages/web/src/lib/email-layout/components/header.ts:14`:
```ts
const isTrifold = !orgName || /trifold/i.test(orgName)
```
Duas formas de disparo, ambas erradas:
1. **`orgName` ausente/vazio** ⇒ assume Trifold. É o mesmo invariante da Story 900-66 (item 1), mas
   este arquivo é o alvo **exclusivo** desta story — não duplicar trabalho entre as duas (ver
   `900-66`, tabela "O que fica FORA", linha 2).
2. **`orgName` contém a substring `"trifold"` (case-insensitive)** ⇒ assume Trifold, mesmo sendo
   uma org **diferente**. A Story `900-25` ("prova de duas empresas reais em ambiente de teste")
   planeja criar uma org chamada **"Trifold Sandbox"** — que casa com este regex e receberia, nos
   e-mails dela, exatamente o `<img>` com `alt="Trifold"` e a URL
   `https://crm.trifold.eng.br/logo-trifold-email.png` que deveria ser exclusiva da Trifold real.

Byte exato do branch de hoje (não copiar de memória — usar esta string na régua de snapshot):
```html
<img src="https://crm.trifold.eng.br/logo-trifold-email.png" alt="Trifold" width="263" height="28" style="height:28px;width:263px;display:block;border:0;outline:none;text-decoration:none;">
```

---

## O achado que muda o tamanho do trabalho: NENHUM chamador passa a org real hoje

Medido nesta sessão (2026-09-03) e já registrado, de forma independente, pela Story `900-64`
("E-mail fica fora — achado NOVO", linhas 115-159 daquele arquivo): **as 10 chamadas que alcançam
`renderBaseLayout`/`header.ts` hoje passam um `orgName` literal fixo — nenhuma deriva o nome (ou
qualquer identificador) da org real do usuário.** Consequência direta para esta story: **trocar só
a lógica de `header.ts` não fecha o buraco** — se nenhum chamador passar um `org_id` real, a nova
decisão nunca tem informação para decidir corretamente, e o comportamento observável não muda em
nenhum caminho de produção. Corrigir isso é, portanto, parte do escopo mínimo desta story — não uma
extensão dela.

| # | Chamador | `orgName` hoje | `org_id` disponível no escopo do chamador? | Entra nesta story? |
|---|---|---|---|---|
| 1 | `app/api/admin/email-templates/preview/route.ts:24` | `{ orgName: "Trifold" }` | Sim (`user.orgId`, mas é ferramenta de preview do admin, não um envio real) | **Explícito** — ver AC5 |
| 2 | `app/api/cron/appointment-email-reminders/route.ts:83,104` | `{ orgName: "Trifold" }` ×2 | Sim (`appointment.org_id`) | **Sim** — AC4 |
| 3 | `lib/auto-vincular-cliente-obra.ts:140` | `{ orgName: "Portal de Obras" }` | Sim (`orgId`, parâmetro da função) | **NÃO** — ver "Fora do escopo" |
| 4 | `lib/tenancy/admin-invite.ts:296` (via `renderPasswordActionEmail`) | `"Trifold CRM"` hardcoded em `password-action.ts:52` | Sim (`orgId`, parâmetro obrigatório da função) | **Sim** — AC4 |
| 5 | `app/api/admin/clientes/[id]/senha/route.ts:97` (idem) | idem | Sim (`appUser.org_id`) | **Sim** — AC4 |
| 6 | `app/api/users/[id]/reset-password/route.ts:68` (idem) | idem | Sim (`appUser.org_id`) | **Sim** — AC4 |
| 7 | `app/login/actions.ts:215` (idem) | idem | Sim (`appUser.org_id`, já lido em `emailOrgId` na linha 229) | **Sim** — AC4 |
| 8 | `app/api/brokers/route.ts:143` (idem) | idem | Sim (`appUser.org_id`) | **Sim** — AC4 |
| 9 | `app/api/brokers/route.ts:302` (idem) | idem | Sim (`appUser.org_id`) | **Sim** — AC4 |

(A tabela usa a mesma numeração de 10 pontos que a `900-64` já fixou, com a preview do item 1
contada à parte porque ela não é um envio real.)

---

## O que esta story NÃO faz — e por que não confundir com a "story futura" que a 900-64 já nomeou

A `900-64` (linhas 187-194) já reservou explicitamente uma story futura, sem número: **"E-mails
transacionais mostram a marca da empresa, não a da Trifold"**, com escopo (a) caminho de **imagem**
para org não-Trifold no e-mail (hoje `header.ts` só sabe fazer `<span>{orgName}</span>` — texto,
nunca uma logo, para qualquer org que não seja a Trifold), (b) derivar `organizations.name`/
`logo_url` **reais** nos 10 pontos de chamada, (c) decidir o destino da cópia hardcoded de
`password-action.ts` ("no sistema da **Trifold**", no corpo, não só no `orgName`).

**Esta story faz só o item 2 do plano do `@architect`: consertar QUAL DECISÃO abre o branch da
logo — não o que os dois branches renderizam.** Depois desta story:
- Org = Trifold real ⇒ continua vendo a logo da Trifold, byte a byte igual a hoje.
- Qualquer outra org (incluindo "Trifold Sandbox") ⇒ passa a ver `<span>{orgName}</span>` (texto),
  **nunca mais a logo da Trifold** — mas o texto dentro do `<span>` continua sendo o literal
  hardcoded de hoje ("Trifold", "Trifold CRM"...) até a story futura da `900-64` resolver isso.
  **Isso não é uma lacuna escondida**: está na AC7 desta story, explicitamente.

---

## Acceptance Criteria

**AC1 — Nova decisão pura, sem regex.**
Novo arquivo `packages/web/src/lib/email-layout/header-brand.ts`, exportando:
```ts
export function isMarcaTrifold(orgId: string | null | undefined): boolean
```
- `orgId === trifoldOrgId()` (importado de `@web/lib/tenancy/trifold-org` — **nunca** hardcodar o
  literal; ver AC9) ⇒ `true`.
- Qualquer outro valor, **incluindo `null`/`undefined`** ⇒ `false`. Isto inverte o comportamento de
  hoje para o caso "não sei" (`!orgName` ⇒ hoje `true`; aqui, `orgId` desconhecido ⇒ `false`) —
  é o mesmo invariante do item 1 (falhar fechado/neutro, nunca para a marca de outro), aplicado ao
  único arquivo que é alvo exclusivo desta story.
- **Sem regex sobre nome.** A função nem recebe `orgName` como parâmetro — a decisão não pode mais
  ser influenciada por texto.

**AC2 — `header.ts` usa a nova decisão, mantém o `orgName` só para o texto do branch não-Trifold.**
`renderHeader` passa a receber `{ orgName, orgId }` em vez de só `orgName: string`:
```ts
export function renderHeader(input: { orgName: string; orgId?: string | null }): string
```
- `isMarcaTrifold(input.orgId)` substitui a linha 14 atual (`const isTrifold = !orgName || /trifold/i.test(orgName)`).
- O restante da função (os dois branches, `<img>` vs. `<span>{orgName}</span>`) **não muda**.

**AC3 — `EmailLayoutOptions`/`renderBaseLayout` threadam `orgId`.**
`packages/web/src/lib/email-layout/types.ts`: `EmailLayoutOptions` ganha `orgId?: string | null`.
`renderBaseLayout` (`index.ts`) passa `{ orgName, orgId }` para `renderHeader` (hoje passa só
`orgName`).

**AC4 — 8 chamadores threadam o `org_id` real que já têm no escopo.**
Para os itens 2, 4, 5, 6, 7, 8, 9 da tabela acima (8 call sites — `appointment-email-reminders`
conta 2), adicionar `orgId: <variável já existente no escopo>` à chamada de `renderBaseLayout` (via
`renderPasswordActionEmail`, cujo parâmetro precisa crescer — ver AC6) ou diretamente. **Nenhuma
query nova.** Cada um desses 8 pontos já tem a variável (`appointment.org_id`, `appUser.org_id`,
`orgId` de parâmetro) — é passar o valor que já existe, não buscar um novo.

**AC5 — O 9º chamador (preview do admin) passa `orgId: trifoldOrgId()` explicitamente.**
`app/api/admin/email-templates/preview/route.ts:24` é uma ferramenta de preview interna — não é um
envio real a um tenant. **[AUTO-DECISÃO]** manter o comportamento de hoje (sempre mostra a logo da
Trifold, porque é o que a ferramenta foi feita para pré-visualizar) passando explicitamente
`orgId: trifoldOrgId()`, em vez de omitir o campo (o que agora resultaria em `isMarcaTrifold(undefined) === false`,
mudando o preview sem necessidade). Reason: byte a byte igual ao de hoje é mais seguro do que
inventar um comportamento novo para uma ferramenta interna sem pedido explícito.

**AC6 — `renderPasswordActionEmail` ganha `orgId`, propagado a `renderBaseLayout`.**
`packages/web/src/lib/email-layout/components/password-action.ts`: o parâmetro
`params: { userName, actionLink, siteUrl, mode }` ganha `orgId?: string | null`, repassado à
chamada interna de `renderBaseLayout(..., { orgName: "Trifold CRM", orgId, previewText })`. Os 6
chamadores de `renderPasswordActionEmail` (itens 4-9 da tabela) passam o `orgId` que já têm.

**AC7 — `auto-vincular-cliente-obra.ts` não passa `orgId` — e isso vira estado explícito, não ausência.**
_(Reescrita pelo @po em 2026-09-03. A v0.1 se contradizia em três lugares: a AC pedia "uma linha de
comentário explicando por quê", a Task 6 pedia "`git diff` **vazio** para ele", os Dev Notes diziam
"a única task desta story **sem nenhuma linha de código alterada**" e "Onde ficam as coisas" o
listava como "explicitamente NÃO tocado". Um comentário É uma linha alterada; as quatro instruções
não podem ser satisfeitas ao mesmo tempo. Resolvido a favor do comentário — ver Change Log.)_

**O que o @dev faz:** o arquivo **recebe um comentário** (e nada mais — zero mudança de
comportamento, zero mudança de assinatura, a chamada `renderBaseLayout(..., { orgName: "Portal de
Obras" })` fica byte a byte igual). O comentário nomeia a Story 900-67, diz que a omissão do
`orgId` é **deliberada**, e diz o que aconteceria se alguém a "consertasse". O arquivo **aparece**
no File List, com a nota "só comentário". A régua da AC11 é o que garante que ninguém remova o
comentário e complete a fiação depois.

Confirmado por leitura (e reconfirmado pelo @po em 2026-09-03: `orgId` é parâmetro da função na
linha 22 e já é passado a `sendEmail` na linha 147 — o valor está mesmo em escopo, o traço procede): hoje ele passa `{ orgName: "Portal de Obras" }`, que já não casa
com o regex antigo (`isTrifold` já é `false` para esse texto) — então já renderiza o branch de
texto, mesmo para a org real da Trifold. Se este chamador passasse a threadar `orgId` real, e esse
`orgId` fosse o da própria Trifold, a NOVA lógica (AC1) resolveria `isMarcaTrifold === true` e
trocaria o texto "Portal de Obras" pela **logo**, mudando o e-mail da Trifold de hoje —
**exatamente a regressão que este programa de trabalho proíbe** (`whitelabel-e-migracao-jud.md`:
"com a org da Trifold, a saída é byte a byte igual à de hoje"). Por isso este chamador é excluído,
e não por omissão.

**E a exclusão não custa nada em vazamento de marca** (observação do @po): o texto que este sítio
renderiza é `"Portal de Obras"` — genérico, sem marca de ninguém. Diferente dos outros 9, deixá-lo
como está não expõe nenhum tenant à marca da Trifold. A exclusão é segura nos dois sentidos, não só
no da Trifold.

**AC8 — Snapshot: org = Trifold ⇒ byte a byte igual a hoje, nos dois níveis.**
Suíte nova, `packages/web/src/lib/email-layout/header-brand.test.ts` (função pura) +
teste adicionado a `packages/web/src/lib/email-layout/__tests__/email-layout.test.ts` (integração
com `renderBaseLayout`):
- `isMarcaTrifold(trifoldOrgId())` ⇒ `true`. `isMarcaTrifold("qualquer-outro-uuid")` ⇒ `false`.
  `isMarcaTrifold(null)` ⇒ `false`. `isMarcaTrifold(undefined)` ⇒ `false`.
- `renderHeader({ orgName: "Trifold", orgId: trifoldOrgId() })` ⇒ contém a string exata do `<img>`
  citada na seção "O bug, como ele é hoje" (comparação **de string completa**, não só
  `toContain("Trifold")` — é o mesmo padrão de "asserção que não alcança" catalogado nesta leva:
  `toContain` sozinho não prova QUAL branch renderizou).
- `renderHeader({ orgName: "Trifold Sandbox", orgId: "outro-org-id-qualquer" })` ⇒ **NÃO** contém
  `<img`; contém `<span` com o texto `"Trifold Sandbox"`. Este é o teste nomeado que materializa a
  ameaça descrita na Story `900-25` — nomear a org como `"Trifold Sandbox"` explicitamente no teste,
  não uma org genérica qualquer, para que o vínculo com o caso real fique registrado no próprio
  código do teste.
- `renderHeader({ orgName: "", orgId: undefined })` ⇒ **NÃO** contém `<img` (inverte o
  `!orgName ⇒ true` de hoje — é a AC1 em ação para o caso "nada informado").

**AC9 — Catraca do literal da Trifold: usar `trifoldOrgId()`, não o UUID cru.**
Mesma regra da Story 900-66 AC8: qualquer teste ou código novo desta story que precise do org id
da Trifold **importa `trifoldOrgId()`** de `@web/lib/tenancy/trifold-org`. Hardcodar o literal
`"00000000-0000-0000-0000-000000000001"` em `header-brand.ts` ou em qualquer teste novo, sem
declarar o arquivo em `trifold-org-literal.test.ts`, deixa aquela suíte vermelha.

**AC10 — O teste existente que hoje descreve o bug passa a descrever a correção.**
`packages/web/src/lib/email-layout/__tests__/email-layout.test.ts:38-41`
(`it('falls back to Trifold when orgName is not provided', …)`) testa exatamente o comportamento
que esta story inverte para o caso "nada informado" (AC8, último item). Atualizar esse teste para
refletir a nova regra (sem `orgId`, ou com `orgId` de outra org, **não** cai para Trifold) —
**não apagar silenciosamente**; deixar claro no Change Log que este teste específico mudou de
sentido, com uma linha explicando por quê (é exatamente o tipo de mudança "correção que muda
comportamento precisa de novo carrasco" — o teste antigo *era* o carrasco do bug).

**AC11 — 🔴 O carrasco: todo call site passa `orgId`, com UMA exceção declarada.**
_(AC acrescentada pelo @po em 2026-09-03 — ver Change Log.)_

Esta story faz o item 2 do plano do `@architect`, mas as AC4/AC5/AC6 fazem, sem dizer, a **metade
de fiação do item 9** ("`orgId` nos call sites que não têm"). E o item 9 tem uma prova exigida que
esta story não tinha: *"teste que **falha** se algum call site chamar sem `orgId` (regra de lint ou
scanner estático, como o `platform-query-scan.ts`)"*. Sem ela, a story deixa **duas portas abertas**:

1. **Um call site novo nasce sem `orgId`** — `isMarcaTrifold(undefined) === false`, o e-mail perde
   a logo da Trifold em silêncio, e nada fica vermelho.
2. **Alguém "completa" a fiação em `auto-vincular-cliente-obra.ts`** — que é exatamente a regressão
   que a AC7 existe para impedir. Hoje a única defesa é prosa numa story fechada. É o padrão que
   este repositório já pagou para aprender: exceção sem catraca vira a porta do próximo.

Régua nova (arquivo à escolha do @dev; sugestão: `header-brand.test.ts`), sobre o **código-fonte**:
1. `arquivosDeProducao()` + `callSiteDe()`/`ocorrenciasNoCodigo()` de `@web/lib/tenancy/fonte-scan`
   — `linhasDeCodigo()` remove comentários antes de qualquer casamento. Isto é **obrigatório** aqui,
   porque a AC7 acabou de mandar escrever um comentário em `auto-vincular-cliente-obra.ts` que
   menciona `orgId`; uma régua de texto cru leria esse comentário como se o sítio estivesse fiado.
2. Achar todos os call sites de `renderBaseLayout(` e `renderPasswordActionEmail(` em
   `packages/web/src`, excluindo `*.test.ts` e as próprias definições (`email-layout/index.ts`,
   `components/password-action.ts`).
3. Particionar em "passa `orgId`" e "não passa", e asseverar **na forma de conjunto**:
   ```ts
   expect([...semOrgId.keys()].sort()).toEqual(["src/lib/auto-vincular-cliente-obra.ts"])
   ```
   **`.toEqual` sobre as chaves ordenadas, nunca `.has()`** — `.has` fica verde se três call sites
   novos aparecerem sem `orgId`. Um único elemento esperado, nomeado, com a AC7 citada em comentário
   ao lado.
4. **C-vivacidade:** asseverar que o total de call sites encontrados é **10** (medido pelo @po em
   2026-09-03: 4 diretos — `preview`, `appointment-email-reminders` ×2, `auto-vincular` — mais 6 via
   `renderPasswordActionEmail`). Uma varredura que devolve zero call site por erro de caminho passa
   verde contra uma partição vazia; esta não.
5. **Mutação que reprova:** remover `orgId` de **um** dos 9 fiados deixa a suíte vermelha nomeando o
   arquivo; **acrescentar** `orgId` em `auto-vincular-cliente-obra.ts` também deixa vermelha. As
   **duas** mutações rodadas e coladas no Dev Agent Record — a segunda é a que fecha a porta da AC7,
   e é a que costuma ser esquecida ("invariante de um lado só").

---

## Fora do escopo

- **Caminho de imagem para org não-Trifold.** Fica em texto (`<span>`), como hoje. Story futura
  já nomeada pela `900-64`.
- **Derivar `organizations.name`/`logo_url` reais nos 10 pontos de chamada.** Continuam com o
  texto literal hardcoded ("Trifold", "Trifold CRM", "Portal de Obras") — só a decisão IMG-vs-TEXTO
  muda, não o conteúdo do texto.
- **Reescrever a cópia hardcoded de `password-action.ts`** ("no sistema da **Trifold**", no corpo
  e no assunto). Fora do escopo — nomeado pela `900-64` como parte da story futura.
- **`auto-vincular-cliente-obra.ts`.** Ver AC7 — excluído deliberadamente.
- **Marca por host** (título "Jud" no host admin). Fora desta leva de três — ver Story 900-65,
  seção "Fora do escopo".

---

## Tasks / Subtasks

- [x] **Task 1 — `header-brand.ts` (AC1)**
  - [x] `isMarcaTrifold(orgId)` importando `trifoldOrgId()`

- [x] **Task 2 — `header.ts`/`types.ts`/`index.ts` (AC2, AC3)**
  - [x] `renderHeader` recebe `{ orgName, orgId }`
  - [x] `EmailLayoutOptions.orgId`
  - [x] `renderBaseLayout` repassa `orgId`

- [x] **Task 3 — `password-action.ts` (AC6)**
  - [x] `renderPasswordActionEmail` ganha `orgId?: string | null`, repassa a `renderBaseLayout`

- [x] **Task 4 — 8 call sites com `org_id` real (AC4)**
  - [x] `appointment-email-reminders/route.ts` ×2
  - [x] `admin-invite.ts`
  - [x] `api/admin/clientes/[id]/senha/route.ts`
  - [x] `api/users/[id]/reset-password/route.ts`
  - [x] `login/actions.ts`
  - [x] `api/brokers/route.ts` ×2

- [x] **Task 5 — Preview do admin (AC5)**
  - [x] `email-templates/preview/route.ts` passa `orgId: trifoldOrgId()` explicitamente

- [x] **Task 6 — `auto-vincular-cliente-obra.ts`: só o comentário (AC7)**
  - [x] Ler o arquivo. Acrescentar **apenas** o comentário sobre a chamada da linha 132-140,
        citando a Story 900-67 e o motivo (threading `orgId` aqui trocaria "Portal de Obras" pela
        logo da Trifold para a própria Trifold — regressão proibida)
  - [x] Confirmar por `git diff` que a **única** mudança no arquivo é o comentário: zero mudança de
        comportamento, `{ orgName: "Portal de Obras" }` byte a byte igual
  - [x] Listar o arquivo no File List com a nota "só comentário (AC7)"

- [x] **Task 7 — Testes (AC8, AC9, AC10)**
  - [x] `header-brand.test.ts`
  - [x] Atualizar `email-layout.test.ts` (o teste da linha 38-41 e os que testam `renderHeader`
        indiretamente via `renderBaseLayout`)
  - [x] Confirmar zero literal cru novo (AC9)

- [x] **Task 8 — Carrasco de alcance (AC11)**
  - [x] Varredura de call sites com `fonte-scan.ts` (comentários removidos — a AC7 acabou de plantar
        um comentário que menciona `orgId` no arquivo que a régua tem que ver como "sem `orgId`")
  - [x] `expect([...semOrgId.keys()].sort()).toEqual([...])` — **nunca `.has()`**
  - [x] Vivacidade: total de call sites === 10
  - [x] Rodar **as duas** mutações (tirar `orgId` de um fiado; pôr `orgId` no `auto-vincular`) e
        colar os dois vermelhos no Dev Agent Record

---

## Dev Notes

### Por que `trifoldOrgId()` e não uma segunda constante
`lib/tenancy/trifold-org.ts` já existe, já é a "exceção nomeada" vigiada por
`trifold-org-literal.test.ts`, e seu cabeçalho já avisa: qualquer arquivo novo que precise saber
"qual org é a Trifold" deve **importar a função**, não duplicar o UUID. Esta story é exatamente
esse caso de uso — reusar, não criar uma segunda fonte de verdade.

### A ordem de implementação sugerida
1. `header-brand.ts` + teste (isolado, sem dependência de nenhum outro arquivo desta story).
2. `header.ts` + `types.ts` + `index.ts` (a mudança de assinatura — compila e os testes existentes
   de `email-layout.test.ts` começam a falhar de forma **esperada** até a Task 7).
3. `password-action.ts`.
4. Os 8 call sites (Task 4), um de cada vez, cada um é um diff pequeno e independente dos outros.
5. `email-templates/preview/route.ts` (Task 5).
6. Confirmar `auto-vincular-cliente-obra.ts` (Task 6) — deve ser a única task desta story sem
   nenhuma linha de código alterada.
7. Testes (Task 7) por último, fechando o ciclo vermelho→verde.

### Onde ficam as coisas
- Novo: `packages/web/src/lib/email-layout/header-brand.ts`
- Novo: `packages/web/src/lib/email-layout/header-brand.test.ts`
- Tocados: `header.ts`, `types.ts`, `index.ts`, `password-action.ts`,
  `app/api/cron/appointment-email-reminders/route.ts`, `lib/tenancy/admin-invite.ts`,
  `app/api/admin/clientes/[id]/senha/route.ts`, `app/api/users/[id]/reset-password/route.ts`,
  `app/login/actions.ts`, `app/api/brokers/route.ts`,
  `app/api/admin/email-templates/preview/route.ts`,
  `lib/email-layout/__tests__/email-layout.test.ts`
- Tocado **só em comentário** (zero mudança de comportamento): `lib/auto-vincular-cliente-obra.ts`
  (AC7 — corrigido pelo @po; a v0.1 dizia "explicitamente NÃO tocado", o que contradizia a própria
  AC7, que manda escrever um comentário).

### `org_id` é `NOT NULL` no banco — não invente um caminho nulo
_(Acrescentado pelo @po, 2026-09-03.)_ A AC1 manda `isMarcaTrifold(null | undefined) ⇒ false`, e
isso está certo como contrato da função pura. Mas ao fiar os 8 call sites, **não** escreva
`orgId: appUser.org_id ?? undefined` "por segurança": `users.org_id` é
`uuid NOT NULL REFERENCES organizations(id)` (`supabase/migrations/001_base_schema.sql:74`) e
`appointments.org_id` idem (`006_appointments.sql:10`). Em runtime o valor nunca é nulo. Se o tipo
gerado do Supabase disser `string | null`, resolva no ponto de leitura de forma **audível** — nunca
com um `??` silencioso que, se um dia disparasse, trocaria a logo da Trifold por texto sem nenhum
sinal. `login/actions.ts:229` já faz `appUser.org_id ?? undefined` hoje para o `sendEmail`; ao
reusar `emailOrgId` na AC4, saiba que é isso que está reusando.

### Sobreposição de arquivos com a Story 900-66 — sequenciar
_(Acrescentado pelo @po.)_ As duas dizem "**Depende de:** nada", e é verdade em lógica, mas **6
arquivos** são tocados pelas duas (`api/brokers/route.ts`, `api/admin/clientes/[id]/senha/route.ts`,
`api/users/[id]/reset-password/route.ts`, `lib/tenancy/admin-invite.ts`,
`api/cron/appointment-email-reminders/route.ts`, `app/login/actions.ts`), em linhas diferentes.
Sem conflito semântico; com conflito de merge quase certo se forem PRs concorrentes. Merge
sequencial 900-66 → 900-67, e esta rebasa. Não é bloqueio.

### Testing
- Vitest. `include` do `vitest.config.ts` casa `*.test.ts` — todos os arquivos desta story já são
  `.ts` (sem JSX), não há armadilha de `.tsx` aqui.
- A suíte de `header-brand.test.ts` deve usar `toContain`/comparação de string **completa** para o
  `<img>`, não só a presença da palavra "Trifold" — ver a nota em AC8 sobre "asserção que não
  alcança".

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> A chave `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml` (conferido
> nesta sessão). Quality validation via revisão manual apenas. O review automático real deste
> repositório é o GitHub App do CodeRabbit (`.coderabbit.yaml`), independente desta seção.

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-03 | 0.3 | **Implementada pelo @dev.** Todas as 8 tasks fechadas; `type-check` rc=0, `lint` 0 erros, `test` 318/318 (4372 passed), `build` 5/5. Baseline do CI da `main`: run **33637807839** (sha `f3992973`) — 317 arquivos / 4369 passed; local divergia em 14 pelos 6 arquivos de outra frente, medido dos dois lados. **Duas descobertas que mudaram o entregável, e as duas vieram de mutação, não de leitura:** (1) 🔴 a M2 obrigatória da AC11.5 (pôr `orgId` no `auto-vincular`) ficou **VERDE** — meu detector era `/\borgId\s*[,:]/` e o atalho na última posição (`orgId }`, sem vírgula final) não casava; a régua declarava a porta da AC7 fechada com a porta aberta. Corrigido para `[,:}]`, M1 re-rodada contra o detector novo, ambas vermelhas. (2) 🔴 a mutação do filtro de comentário (AC11.1) ficou **VERDE duas vezes**: primeiro porque eu pusera o comentário da AC7 **acima** da chamada, fora da região recortada; depois porque toda menção a `orgId` na minha prosa estava entre crases, nunca em posição de chave. Só ficou vermelha quando o comentário passou a viver **dentro dos parênteses** da chamada e a nomear a forma concreta proibida. **Desvio declarado da letra da AC7/Task 6** (que diziam "sobre a chamada"): o comentário está **dentro** dos parênteses, pelo motivo acima — espírito preservado, +16/−0, as 16 linhas todas `//`, `{ orgName: "Portal de Obras" }` intacto. Também rodadas M1 (tira `orgId` de um fiado) e M4 (reintroduz o regex no `header.ts`, 5 vermelhos incl. o teste nomeado "Trifold Sandbox"). **Fora do escopo, a pedido do coordenador:** `whitelabel-e-migracao-jud.md` ganhou a §5.2 com os dois pré-requisitos duros de LIGAR a flag do item 1 — verifiquei as 3 afirmações do CodeRabbit contra a branch da 900-66 (não existem em `origin/main`) e as registrei **corrigidas em dois pontos**: em `bolsao-rebalance:263` o comentário afirma que o claim não é consumido e o código contradiz; em `sla-alerts:265` a justificativa do autor só vale dentro de `if (wppConfig)`, e ali a supressão é **permanente** (`sla_alerta_gestor_em`), não uma janela. **Não provado:** nada em produção; que o `orgId` de cada sítio seja o do destinatário (a régua mede presença, não valor); e o merge com a 900-66 — 6 arquivos em comum, e em `login/actions.ts` eu **movi** a declaração de `emailOrgId`. Não resolvi por conta, como instruído. | Dex (@dev) |
| 2026-09-03 | 0.2 | **Validação do @po — NO-GO na v0.1, corrigido para GO.** Confirmei tudo contra o código: `header.ts:14` tem o regex exatamente como citado; o `<img>` da seção "O bug" é **byte a byte** o que o arquivo produz (`width="263" height="28"`, `alt="Trifold"`, mesmo `style`); `renderHeader` é hoje posicional (`orgName: string`), então a AC2 descreve a mudança certa; os **10** call sites existem nos arquivos nomeados (4 diretos + 6 via `renderPasswordActionEmail`), e a afirmação central da story — **nenhum passa `org_id` real, todos passam literal** — confere um a um (`"Trifold"` ×3, `"Portal de Obras"`, `"Trifold CRM"` em `password-action.ts:52`). Portanto **procede**: consertar só a função de decisão seria código morto em produção, e ampliar o escopo para a fiação é o escopo mínimo, não uma extensão. **O traço da quase-falha também procede, e é o achado mais valioso da leva:** `auto-vincular-cliente-obra.ts` recebe `orgId` como parâmetro (linha 22) e já o usa em `sendEmail` (linha 147) — o valor está mesmo em escopo; passa `{ orgName: "Portal de Obras" }` (linha 140), que **não** casa `/trifold/i`, logo hoje renderiza texto; com a lógica nova e o `orgId` real da Trifold, viraria a logo — regressão para a própria Trifold. Achado lendo o chamador, não pelo padrão. Acrescento que a exclusão é **duplamente** segura: "Portal de Obras" é texto genérico, então mantê-la não expõe nenhum tenant à marca da Trifold. **Três correções aplicadas:** (1) 🔴 **AC7 se contradizia** com a Task 6, os Dev Notes e o File List — a AC mandava escrever um comentário, os outros três exigiam `git diff` vazio; resolvido a favor do comentário, com o arquivo declarado no File List como "só comentário". (2) 🔴 **AC11 nova** — a story fazia metade da fiação do **item 9** do doc-fonte sem a prova que o item 9 exige ("teste que falha se algum call site chamar sem `orgId`"), deixando duas portas abertas: call site novo nasce sem `orgId` em silêncio, e a exceção da AC7 não tinha nada além de prosa impedindo que o próximo a "consertasse". A régua declara a exceção como conjunto de um elemento e exige **as duas** mutações. (3) 🟡 Dev Note sobre `org_id` ser `NOT NULL` nas duas tabelas — para o @dev não introduzir um `?? undefined` defensivo que trocaria a logo por texto sem sinal. Mais a nota de sequenciamento com a 900-66 (6 arquivos em comum). | Pax (@po) |
| 2026-09-03 | 0.1 | Draft inicial — item 2 dos três itens de fundação do whitelabel. Número reconfirmado livre (mesma verificação da 900-65/900-66). Escopo ampliado, deliberadamente, além do que `header.ts` sozinho resolveria: os 10 pontos de chamada já mapeados pela Story 900-64 (nenhum passa `org_id` real hoje) precisam threadar o valor, senão a correção de `header.ts` é código morto em produção. 1 dos 10 (`auto-vincular-cliente-obra.ts`) fica explicitamente de fora, por regrediria a própria Trifold se incluído (AC7). O teste existente que hoje documenta o bug (`email-layout.test.ts:38-41`) é atualizado, não apagado, com o motivo registrado (AC10). | River (@sm) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M context) — @dev (Dex), modo YOLO autônomo, 2026-09-03.

### Debug Log References

**Baseline — medido nos dois lados, como a onda exige.**

| Onde | Arquivos | Testes |
|---|---|---|
| CI da `main`, run **33637807839** (sha `f3992973`, = base desta branch) | 317 | 4369 passed · 6 expected fail (4375) |
| Local, nesta árvore, ANTES de qualquer mudança minha | 317 | 4355 passed · 6 expected fail (4361) |
| Local, DEPOIS | **318** | **4372 passed · 6 expected fail (4378)** |

A divergência local↔CI é de **14 testes**, exatamente a informada no briefing — os 6 arquivos de
outra frente sujos na árvore (`webhook/whatsapp`, `meta/process-lead`, `tenancy/webhook-org` + os 3
testes deles). Não toquei em nenhum. Delta meu: **+1 arquivo, +17 testes** (15 novos em
`header-brand.test.ts`; `+3 −1` em `email-layout.test.ts`, o `−1` sendo o teste da AC10 que mudou
de sentido).

**Validações finais (raiz, `--force`):** `pnpm type-check` rc=0 · `pnpm lint` **0 erros**, 30
warnings (todos pré-existentes) · `pnpm test` 318/318 · `pnpm build` 5/5 successful.
O `Ecmascript file had an error` que o build imprime é pré-existente e alheio
(`packages/shared/src/meta/capi-hashing.ts` importando `crypto`) — o build conclui, e o CI da `main`
com ele passa verde.

**Restauro sempre por `cp` + `shasum -a 256 -c`, nunca `git checkout --`** (a árvore tem 9 arquivos
alheios; um `checkout` de caminho errado apagaria trabalho de outra sessão).

### Completion Notes

#### As mutações (AC11.5) — e as duas que a régua NÃO reprovou de primeira

`tsc --noEmit` rc=0 confirmado antes de contar cada vermelho, para não confundir erro de compilação
com reprovação.

| # | Mutação | tsc | Resultado |
|---|---|---|---|
| **M1** | tira `orgId: appUser.org_id,` do 1º call site de `api/brokers/route.ts` | rc=0 | 🔴 **2 failed / 13 passed** — nomeia `src/app/api/brokers/route.ts` no conjunto E derruba a contagem (2→1) no `Record` dos fiados |
| **M2** | põe `orgId` em `auto-vincular-cliente-obra.ts` (a porta da AC7) | rc=0 | 🔴 **2 failed / 13 passed** — `semOrgId` vira `[]` e o arquivo aparece no `Record` dos fiados |
| **M3** | tira o `codigoDe()` da varredura (filtro de comentário desligado, AC11.1) | — | 🔴 **2 failed / 13 passed** — o comentário da AC7 passa a ser lido como fiação e a exceção fica invisível |
| **M4** | reintroduz o defeito: `isMarcaTrifold(orgId) \|\| /trifold/i.test(orgName)` | rc=0 | 🔴 **5 failed / 25 passed** — incl. o teste nomeado `"Trifold Sandbox"` |

🔴 **A M2 ficou VERDE na primeira rodada, e o achado é da régua, não do código.**
Meu detector era `/\borgId\s*[,:]/`. A mutação natural em `auto-vincular` é
`{ orgName: "Portal de Obras", orgId }` — **atalho na última posição, sem vírgula final**. `orgId }`
não casa `[,:]`, então a régua declarava a porta fechada com a porta aberta. Corrigido para
`/\borgId\s*[,:}]/`, com o motivo escrito ao lado da constante; **M1 re-rodada** contra o detector
corrigido (segue vermelha) e M2 então vermelha. Foi a mutação obrigatória do lado que "costuma ser
esquecido" que achou — invariante de um lado só, exatamente como a AC11 previu.

🔴 **A M3 ficou VERDE duas vezes, e isso mudou o texto da AC7.**
1ª: eu havia escrito o comentário da AC7 **acima** da linha `const html = renderBaseLayout(` —
fora da região que a régua recorta. Movi o comentário para **dentro dos parênteses da chamada**
(imediatamente acima de `{ orgName: "Portal de Obras" }`), que é onde alguém editaria.
2ª: ainda verde, porque toda menção a `orgId` na minha prosa estava entre crases (`` `orgId` ``),
seguida de crase — nunca em posição de chave. Acrescentei ao comentário a linha que diz a forma
concreta proibida: `` // Concretamente: NÃO acrescente `orgId,` nem `orgId: orgId` a este objeto. ``
Só então o filtro virou **carregador**: sem `codigoDe()`, essa prosa faz a varredura classificar o
sítio como fiado e a exceção some. Sem essas duas rodadas eu teria entregue a AC11.1 como prosa.

#### Desvio da LETRA da AC7 / Task 6 — declarado

A AC7 e a Task 6 dizem "acrescentar o comentário **sobre** a chamada da linha 132-140". Escrevi-o
**dentro** dos parênteses da chamada. Motivo: acima da chamada, o comentário fica fora da região que
a régua da AC11 mede, e o filtro `codigoDe()` que a **própria AC11.1 declara obrigatório** vira
inerte (medido: M3 verde). O espírito da AC7 é preservado byte a byte — **12→16 linhas adicionadas,
0 removidas, e as 16 são todas `//`**; `{ orgName: "Portal de Obras" }` está intacto, zero mudança
de assinatura, zero mudança de comportamento.

#### Um achado que NÃO é desta story, registrado onde ele será lido

`docs/architecture/whitelabel-e-migracao-jud.md` ganhou a §5.2, com os **dois pré-requisitos duros
de LIGAR a flag do item 1**. Não consertei nenhum dos dois — a 900-67 é o item 2 e não toca nenhum
daqueles arquivos. Verifiquei as 3 afirmações do CodeRabbit contra o código da branch
`story/900-66-…` (elas **não existem em `origin/main`**: `tentarAppUrl` entra com o PR #565) e as
registrei **corrigidas em dois pontos**:
- `bolsao-rebalance:263` — o comentário escrito ali afirma *"o claim anti-flood não é consumido"*, e
  **o código contradiz**: a RPC da 263 já devolveu `true` antes de `sendBolsaoDigest` rodar.
- `sla-alerts:265` — o mais grave dos quatro, e o que a leitura rápida perdoa. O comentário do autor
  ("o WhatsApp já saiu sem link") só vale **dentro** de `if (wppConfig)`. Sem WhatsApp e sem URL,
  nada sai e o lead é marcado assim mesmo — e ali a supressão **não é janela**: `sla_alerta_gestor_em`
  é gravado uma vez e o gate da linha 246 é `!lead.sla_alerta_gestor_em`, **permanente para o lead**.

#### O que NÃO consegui provar

- **Nada em produção.** Não há e-mail enviado por esta branch, nem render em ambiente real. A
  promessa "byte a byte igual para a Trifold" é provada por `toBe` sobre a string completa do
  cabeçalho e por um `toBe` que iguala os dois documentos trocando só o elemento de marca — é prova
  de unidade, não de entrega.
- **O `orgId` que cada call site passa ser mesmo o da org do destinatário.** A régua da AC11 mede
  **presença** da fiação, não corretude do valor. Um `orgId: outraCoisa` passaria verde.
- **O merge com a 900-66.** Ela toca os mesmos 6 arquivos (`api/brokers`, `clientes/[id]/senha`,
  `users/[id]/reset-password`, `admin-invite`, `appointment-email-reminders`, `login/actions`) em
  linhas diferentes e **não está mergeada** (PR #565). Ramifiquei de `origin/main`, então o conflito
  ainda não existe — mas **existirá** e é do @devops resolver na ordem 900-66 → 900-67.
  ⚠️ Em `login/actions.ts` o risco é maior que "linhas diferentes": **movi** a declaração de
  `const emailOrgId` para antes da chamada de `renderPasswordActionEmail`, e a 900-66 mexe nesse
  mesmo arquivo. Não resolvi por conta, como instruído.

### File List

**Novos**
- `packages/web/src/lib/email-layout/header-brand.ts` — `isMarcaTrifold()` (AC1)
- `packages/web/src/lib/email-layout/header-brand.test.ts` — AC8 (função pura + `renderHeader` +
  `renderBaseLayout`) e AC11 (carrasco de alcance). 15 testes.

**Modificados — mecanismo**
- `packages/web/src/lib/email-layout/components/header.ts` — AC2
- `packages/web/src/lib/email-layout/types.ts` — AC3
- `packages/web/src/lib/email-layout/index.ts` — AC3
- `packages/web/src/lib/email-layout/components/password-action.ts` — AC6

**Modificados — fiação (9 call sites)**
- `packages/web/src/app/api/cron/appointment-email-reminders/route.ts` — ×2, `appointment.org_id`
- `packages/web/src/lib/tenancy/admin-invite.ts` — `orgId` (parâmetro)
- `packages/web/src/app/api/admin/clientes/[id]/senha/route.ts` — `appUser.org_id`
- `packages/web/src/app/api/users/[id]/reset-password/route.ts` — `appUser.org_id`
- `packages/web/src/app/login/actions.ts` — reusa `emailOrgId` (declaração **movida** para antes da
  chamada, para que cabeçalho e `sendEmail` não possam divergir)
- `packages/web/src/app/api/brokers/route.ts` — ×2, `appUser.org_id`
- `packages/web/src/app/api/admin/email-templates/preview/route.ts` — AC5, `trifoldOrgId()` explícito

**Modificado — só comentário (AC7)**
- `packages/web/src/lib/auto-vincular-cliente-obra.ts` — **+16 / −0, todas `//`**. Zero mudança de
  comportamento; `{ orgName: "Portal de Obras" }` byte a byte igual.

**Modificado — teste**
- `packages/web/src/lib/email-layout/__tests__/email-layout.test.ts` — AC10

**Modificado — documentação (fora do escopo da story, a pedido do coordenador)**
- `docs/architecture/whitelabel-e-migracao-jud.md` — nova §5.2

**NÃO tocados** (frentes alheias na árvore): `webhook/whatsapp/route.ts` + teste,
`meta/process-lead.ts` + teste, `tenancy/webhook-org.ts` + teste, `docs/backlog.md`,
`docs/qa/gates/900.42a-…`, `docs/stories/epics/epic-900-…`.

---

## QA Results
_A preencher pelo @qa durante o gate._
