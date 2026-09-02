# Story 900-64 — A marca da empresa aparece no lugar da Trifold: METADE 2 de 2 — **na barra lateral** (login e e-mail continuam dizendo Trifold)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Frente 2 ("Console"), Fase 1 — metade 2 de 2 da resposta do dono do produto que deu
  origem à `900-62`/`900-63`. Ver `900-63`, seção "ESTA STORY SOZINHA NÃO ENTREGA O QUE FOI
  PEDIDO", que já nomeia e reserva esta story.
- **Story:** 900-64 — número reconfirmado livre em 2026-09-01 contra `docs/stories/`,
  `git fetch --prune` (todas as `refs/remotes`) e `git rev-list --all` (nenhum commit local em
  nenhuma branch contém arquivo com este número).
- **Status:** Ready for Review — implementada pelo @dev em 2026-09-02 (ver Dev Agent Record e Change Log v0.3)
- **Priority:** P1 — sem esta story, a `900-63` guarda um arquivo que ninguém vê. As duas juntas
  são o pedido completo do dono do produto ("hoje toda empresa mostra a marca da Trifold").
- **Complexity:** S — o escopo que sobrevive à decisão abaixo é troca de prop em um componente
  já existente + uma leitura de coluna já existente, sem migration, sem RPC, sem rota nova.
- **Depends on:**
  - **`900-63`** (guardar o arquivo) — dependência dura. `organizations.logo_url` só passa a
    ter valor não-nulo depois que a `900-63` existir e um platform admin enviar um logo. Sem
    ela, esta story troca "sempre Trifold" por "sempre Trifold, porque não há outro valor" —
    tecnicamente completa, visualmente indistinguível de não ter sido feita, até a primeira
    empresa ter um logo.
  - **NÃO depende de `900-62`** — não toca `name`/`slug`/contato/fiscal, nem a projeção da
    página de plataforma que a `900-62`/`900-63` disputam (ver "Superfícies fora do console de
    plataforma" abaixo — esta story não entra em `app/platform/**` em nenhum ponto).

### Executor Assignment
- **Executor:** @dev (Dex). Um único executor — não há trabalho de schema/migration/RLS nesta
  story (ver "Por que não há migration" abaixo).
- **Quality Gate:** @dev (Dex), pré-commit.
- **Quality Gate Tools:** `[code_review]`. Sem `migration_review` (nenhuma migration).
  Sem `security_review` (nenhuma superfície de escrita nova, nenhum bucket novo, nenhuma rota
  nova; a leitura é a MESMA coluna que `settings`/`name`, já lida hoje pelas duas telas que esta
  story toca, sob a mesma policy RLS — ver AC7).

---

## User Story
**Como** operador que usa o CRM (dashboard ou app do corretor),
**eu quero** ver a marca da minha própria empresa em vez da marca da Trifold,
**para que** o sistema pareça o produto da minha empresa, não um produto de terceiros com o meu
nome dentro.

**Como** dono do produto,
**eu quero** que o logo enviado na `900-63` realmente apareça em algum lugar,
**para que** "hoje toda empresa mostra a marca da Trifold" deixe de ser verdade para quem
enviou um logo.

---

## 🔴 Decisão obrigatória desta story: quais das 3 superfícies entram, e por quê

A `900-63` mediu 3 superfícies que hoje mostram a marca da Trifold de forma fixa. As 3 foram
reconferidas nesta sessão (linhas atuais, não herdadas do draft anterior):

| # | Superfície | Linhas medidas hoje | Entra nesta story? |
|---|---|---|---|
| 1 | `packages/web/src/components/layout/sidebar-nav.tsx` | `197-198` (logo desktop), `288-289` (logo mobile), `294` (rótulo de texto mobile) | **SIM** — ver AC1-AC9 |
| 2 | `packages/web/src/app/login/page.tsx` | `46-47` (logo), `54` (título "Trifold CRM"), `240` (rodapé "Trifold Engenharia — Maringá, PR") | **NÃO** — ver seção "Login fica fora" |
| 3 | `packages/web/src/lib/email-layout/components/*` | `header.ts`, `password-action.ts`, e os ~8 pontos de chamada em `packages/web/src/app/**` | **NÃO** — ver seção "E-mail fica fora" |

### Por que o sidebar entra e é a superfície fácil — medido, não presumido

`SidebarNav` (`components/layout/sidebar-nav.tsx`) é renderizado por dois layouts, e os dois
**já conhecem a org da sessão** antes de chamá-lo:
- `packages/web/src/app/dashboard/layout.tsx:111` — `const user = await getServerUser()`,
  `user.orgId` disponível; o componente é instanciado em `~338`.
- `packages/web/src/app/broker/layout.tsx:34` — mesmo padrão, `user.orgId` disponível; o
  componente é instanciado em `~95`.

Os dois **já leem `organizations` sob RLS** hoje (`.from("organizations").select("settings")`
em `dashboard/layout.tsx:264` e `broker/layout.tsx:66`, condicionado a
`permissions["materiais"]`) — a mesma tabela, o mesmo padrão de acesso, só faltando um campo na
projeção e uma chamada incondicional (o logo precisa aparecer para toda org, não só quando o
módulo Materiais está ligado).

**Não há resolução de tenant a inventar aqui.** A org já é conhecida pela sessão autenticada —
diferente do login (abaixo). É por isso que esta é "a superfície fácil": o trabalho é passar uma
prop nova para um componente existente, não descobrir quem é o cliente.

### Login fica fora — é story de arquitetura de tenant, não CSS

**Medido, não suposto:** `find packages/web/src/app -maxdepth 2 -type d -name "[*]"` não
encontra nenhuma rota `[slug]`, `[org]` ou equivalente; `login/page.tsx` é um formulário estático
(`"use client"`, sem parâmetro de rota, sem `useSearchParams` para org) que recebe e-mail/senha e
só sabe a qual empresa a pessoa pertence **depois** que `login()` (`login/actions.ts`) autentica
e lê `org_id` do usuário. Antes disso — no momento em que a página `/login` é renderizada — não
existe nenhum dado no request que aponte para uma empresa específica: nem subdomínio, nem path,
nem cookie de tenant.

Trocar a marca ali exigiria **decidir e construir** um desses mecanismos primeiro (ex.:
subdomínio por org, ou um seletor de empresa antes do formulário de senha, ou um cookie setado
por um passo anterior) — nenhum existe hoje. Isso é decisão de arquitetura multi-tenant, do
tamanho da própria fundação que o Epic 900 está construindo, não um `if` a mais numa tela.

**O que o operador vê no login, e por quê:** a marca da Trifold, sempre, para qualquer empresa,
exatamente como hoje. Não há regressão (ninguém via a própria marca lá antes; ninguém vê depois
desta story), só a lacuna que continua aberta e nomeada.

**Story futura, ainda sem número (fica para @sm rascunhar quando houver decisão de produto
sobre QUAL mecanismo de resolução usar):** algo como *"Login por empresa — resolver o tenant
antes da sessão existir"*. Não é uma AC de canto de nenhuma story existente; é arquitetura nova,
e o dono do produto precisa decidir o mecanismo antes dela ser rascunhada (subdomínio? seletor?
link mágico por empresa?) — decisão que não cabe a este agente tomar sozinho.

### E-mail fica fora — achado NOVO, mais grave do que o herdado da `900-63`

A `900-63` já tinha medido que `orgName` em `email-layout` cai de volta para `"Trifold"` quando
não informado. **A medição desta sessão foi além: nenhum dos chamadores atuais informa um
`orgName` derivado da empresa real — todos passam um literal fixo, e em um dos casos o texto
"Trifold" está escrito dentro do PRÓPRIO corpo do e-mail, não só no cabeçalho.**

**[@po 2026-09-01 — recontado. A v0.1 dizia 8; são 10.]** O `git grep` da v0.1 usava o padrão
`"renderBaseLayout(\|orgName:"`, que **não casa** uma chamada de `renderPasswordActionEmail({`
(ela não contém nenhum dos dois). Recontado com
`git grep -n "renderBaseLayout(\|renderPasswordActionEmail(\|orgName:" -- packages/web/src/app
packages/web/src/lib | grep -v 'lib/email-layout/'`, são **10** pontos de chamada, e os que
passam por `password-action.ts` são **6**, não 4 — faltavam as duas de
`api/brokers/route.ts` (criação de corretor e reenvio de senha), que é justamente o caminho pelo
qual **todo corretor de uma empresa nova recebe o primeiro e-mail do sistema**:

| Chamador | O que passa hoje |
|---|---|
| `api/admin/email-templates/preview/route.ts:24` | `{ orgName: "Trifold" }` — literal |
| `api/cron/appointment-email-reminders/route.ts:83,104` | `{ orgName: "Trifold" }` (x2) — literal |
| `lib/auto-vincular-cliente-obra.ts:140` | `{ orgName: "Portal de Obras" }` — literal, nem é o nome de uma empresa |
| `lib/tenancy/admin-invite.ts:296` (via `renderPasswordActionEmail`) | `orgName: "Trifold CRM"` hardcoded dentro de `password-action.ts:52` |
| `api/admin/clientes/[id]/senha/route.ts:97` (idem) | idem |
| `api/users/[id]/reset-password/route.ts:68` (idem) | idem |
| `login/actions.ts:215` (idem) | idem |
| `api/brokers/route.ts:143` (idem) | idem — **omitido na v0.1** |
| `api/brokers/route.ts:302` (idem) | idem — **omitido na v0.1** |

**Zero das 10 chamadas deriva o nome (ou o logo) da org real do usuário.** E em
`password-action.ts:26-30`, o texto "Trifold" está escrito **dentro do assunto e do corpo**
("Redefina sua senha — Trifold CRM", "sistema da `<strong>Trifold</strong>`"), não só no
parâmetro `orgName` — trocar isso é reescrever cópia de e-mail transacional que alcança **6**
pontos de chamada, não plugar um `logoUrl` novo em `EmailLayoutOptions`.

`header.ts:14-18` já tem um `isTrifold` (`/trifold/i.test(orgName)`) que, quando falso, renderiza
um `<span>{orgName}</span>` — texto, nunca uma imagem. Não existe hoje nenhum caminho de imagem
para org não-Trifold no e-mail.

**Consequência para o escopo:** fazer o e-mail mostrar o logo de verdade não é "adicionar um
parâmetro" — é (a) estender `EmailLayoutOptions`/`renderHeader` com um caminho de imagem para
org não-Trifold, (b) buscar `organizations.name` e `organizations.logo_url` reais em **10**
pontos de chamada que hoje não buscam org nenhuma, e (c) reescrever a cópia hardcoded de
`password-action.ts`, que alcança **6** desses pontos. É um projeto de "e-mails transacionais
deixam de ser mono-tenant", ortogonal a "trocar o logo" — do tamanho comparável ao próprio login,
e igualmente fora do escopo desta story.

### 🔴 A lacuna comercial, nomeada — não é "sem regressão", é um defeito conhecido que fica aberto

"Sem regressão" descreve a Trifold, que é a única empresa em produção hoje. **Descrito do ponto
de vista de uma empresa nova, o estado atual é este, e ele precisa estar escrito aqui e não só
num relatório de validação:**

> Uma empresa que entrar no CRM amanhã — inclusive uma que já tenha enviado o próprio logo pela
> `900-63` e o veja na barra lateral por esta story — **manda para os próprios corretores e
> clientes e-mails assinados "Trifold"**. O convite do administrador
> (`lib/tenancy/admin-invite.ts:296`), a criação de cada corretor (`api/brokers/route.ts:143`), o
> reenvio de senha (`:302`), o "esqueci minha senha" do login (`login/actions.ts:215`), a
> redefinição pelo painel (`api/users/[id]/reset-password/route.ts:68`) e a senha do cliente do
> portal (`api/admin/clientes/[id]/senha/route.ts:97`) — **todos** chegam com assunto
> "Redefina sua senha — Trifold CRM" e o corpo "no sistema da **Trifold**". A pessoa recebe, do
> sistema da própria empresa, um e-mail com o nome de um terceiro. É o mesmo pedido do dono do
> produto ("hoje toda empresa mostra a marca da Trifold") **continuando verdadeiro no canal de
> maior alcance externo do produto** — e-mail sai da empresa, a barra lateral não.

Esta story **não conserta isso** e não pode ser descrita como se consertasse. Nem o @dev na
conclusão, nem o @qa no gate, nem qualquer resumo de release podem dizer "a marca da empresa
aparece no lugar da Trifold" sem o qualificador **"na barra lateral do CRM e do app do corretor"**.
Mesma regra normativa que a AC0 da `900-63` já fixou para "o logo fica guardado".

**Story futura à qual esta lacuna pertence — ainda sem número, a rascunhar pelo @sm:**
*"E-mails transacionais mostram a marca da empresa, não a da Trifold"*. Escopo mínimo dela:
(a) estender `email-layout` com um caminho de imagem para org não-Trifold (`header.ts:14-18` hoje
só sabe fazer `<span>{orgName}</span>`), (b) derivar `name`/`logo_url` reais nos 10 pontos de
chamada, (c) decidir o que fazer com a cópia hardcoded de `password-action.ts:26-30` e com o
`orgName: "Portal de Obras"` de `auto-vincular-cliente-obra.ts:140`, que nem nome de empresa é.
**Prioridade sugerida: acima da story do login** — o login é visto só por quem já sabe em que
sistema está entrando; o e-mail chega a quem não sabe.

---

## Superfícies fora do console de plataforma — as armadilhas da leva NÃO se aplicam aqui

O levantamento da leva atual (`900-62`/`900-63`) documentou três armadilhas medidas:
`platform/orgs/[id]/page.tsx:84` (projeção), `platformQuery()` recusando aninhamento/`*`, e
`platform-query-scan.ts` não acendendo para `storage.from("org-logos")`. **As três foram
reconferidas contra os arquivos que esta story de fato toca, e nenhuma se aplica:**

- `sidebar-nav.tsx`, `dashboard/layout.tsx` e `broker/layout.tsx` estão fora de
  `app/platform/**` e `app/api/platform/**` — a varredura de `platform-query-scan.test.ts`
  (`AC-B4`) só percorre esses dois diretórios (medido no cabeçalho de
  `lib/tenancy/platform-query-scan.ts:5-8`). Esta story não os toca.
- Nenhuma leitura desta story passa por `platformQuery()` — que é o leitor cross-tenant exclusivo
  do console de plataforma (`getPlatformAdmin()`). As leituras aqui são as mesmas
  `.from("organizations")` sob RLS de sessão que `dashboard/layout.tsx`/`broker/layout.tsx` já
  fazem hoje para `settings.materiais_url` — sem cruzar org nenhuma.
- Não há migration, então não há numeração a coordenar com `900-62`/`900-63`.

Registrado para que ninguém — `@dev`, `@qa` — presuma que essas guardas do console de plataforma
precisam de atenção aqui. Elas não precisam.

---

## Por que não há migration

`organizations.logo_url` já existe (`001_base_schema.sql:62`) e já está preenchível pela
`900-63`. Esta story só lê a coluna — nenhum DDL, nenhuma RPC, nenhuma policy nova.

---

## Acceptance Criteria

**AC1 — `SidebarNav` ganha duas props novas, opcionais, sem quebrar quem já o chama.**
Em `packages/web/src/components/layout/sidebar-nav.tsx`, `SidebarNavProps` ganha:
```ts
orgName?: string | null
orgLogoUrl?: string | null
```
Ambas opcionais — qualquer chamador que não as passar (se algum aparecer no futuro) continua
vendo exatamente o comportamento de hoje (marca da Trifold).

**AC2 — Helper puro que decide qual marca mostrar, testável sem DOM.**
Novo helper exportado (mesmo arquivo ou um módulo pequeno ao lado, ex.
`sidebar-nav-brand.ts`), sem dependência de React nem de `window`:
```ts
export function resolveSidebarBrand(input: {
  orgLogoUrl?: string | null
  orgName?: string | null
  imgFailed: boolean
}): { src: string; alt: string; isCustom: boolean }
```
- `imgFailed === true` OU `orgLogoUrl` vazio/nulo → `{ src: "/logo-trifold.webp", alt: "Trifold",
  isCustom: false }` (o comportamento de HOJE, byte a byte).
- `orgLogoUrl` presente E `imgFailed === false` → `{ src: orgLogoUrl, alt: orgName ?? "Logo da
  empresa", isCustom: true }`.
**Por que um helper puro:** `sidebar-nav.test.ts` (precedente medido) usa
`renderToStaticMarkup` porque não há `jsdom`/Testing Library no projeto — esse harness não
executa handlers de evento (`onError` de imagem quebrada nunca dispara em markup estático). Sem
extrair a decisão para uma função pura, o caminho "imagem quebrou → cai para o fallback" (AC4)
ficaria sem teste automatizado possível. Com o helper, o caso `imgFailed: true` é testável
diretamente, sem simular um `<img>` de verdade.

**AC3 — Logo do desktop (linha atual `197-201`) usa o helper, e a `className` passa a ser
CONDICIONAL.**
```tsx
<Image src={brand.src} alt={brand.alt} width={143} height={143}
  className={brand.isCustom ? CLASSES_LOGO_CLIENTE : CLASSES_LOGO_TRIFOLD}
  onError={() => setImgFailed(true)} />
```
- `CLASSES_LOGO_TRIFOLD` = `"brightness-0 dark:brightness-0 dark:invert"` — **exatamente a string
  de hoje** (linha `201`), byte a byte. É o filtro monocromático pensado para a wordmark da
  Trifold.
- `CLASSES_LOGO_CLIENTE` = **sem nenhum filtro** (`brightness-0`/`invert` fora) — um logo de
  cliente enviado a cores não pode ser forçado a preto-e-branco pela classe pensada para a
  wordmark da Trifold — **mais uma restrição de altura**, ver abaixo.

**[@po 2026-09-01] Restrição de altura — a geometria foi MEDIDA e a v0.1 estava errada.**
O slot **não é quadrado**. Medido: o contêiner do logo desktop é `flex h-20 shrink-0 items-center
px-5` (**80 px de altura**, ~184 px de largura útil dentro da `aside` de `w-56`), e
`public/logo-trifold.webp` é **800×96** (proporção 8,3:1). O `<Image width={143} height={143}>`
não distorce hoje porque o preflight do Tailwind v4 (`@import "tailwindcss"` em `globals.css`)
aplica `img { height: auto }`, que vence o atributo `height` — a wordmark renderiza ~143×17 e
cabe folgada nos 80 px.

A consequência: com `height: auto`, um logo de cliente **quadrado** (a forma mais comum de logo
de empresa) renderiza **143×143** e **estoura os 80 px do cabeçalho** — não há `overflow-hidden`
nesse `div`. O logo do cliente sairia por cima da navegação. Por isso `CLASSES_LOGO_CLIENTE`
**precisa** conter uma trava de caixa que funcione para qualquer proporção, p.ex.
`"max-h-12 w-auto object-contain"` (48 px de teto dentro dos 80 px do slot). A escolha exata das
classes é do @dev; a **regra** é: nenhuma proporção de logo enviado pode ultrapassar a altura do
contêiner. Isso não é polimento — sem a trava, a story entrega a marca do cliente quebrando o
layout, que é pior do que continuar mostrando a Trifold.

**AC4 — Falha de carregamento degrada para o fallback declarado, nunca para espaço vazio.**
`onError` no `<Image>` seta um estado local (`imgFailed`, componente já é `"use client"`) que
realimenta o helper (AC2) e troca `brand` para o fallback Trifold no próximo render — nunca
remove a imagem da árvore. Cobre o caso da AC4 do pedido original ("imagem que não carrega tem
de degradar para o fallback declarado, não para espaço vazio").

**[@po 2026-09-01] Limite de medição desta AC, declarado — não é cobertura, é lacuna nomeada.**
O carrasco da AC4 mede o **helper** (`imgFailed: true` → fallback), não a **fiação**
(`onError` → `setImgFailed(true)` → helper). Medido: o mock de `next/image` em
`sidebar-nav.test.ts:47-49` é
`({ src, alt }) => createElement("img", { src, alt })` — ele **descarta `onError`** junto com
todo o resto das props. Nem com jsdom o `onError` de `<img>` dispararia em `renderToStaticMarkup`.
Portanto: **a fiação de `onError` não tem carrasco automatizado nesta story e não pode ser
declarada coberta por ninguém** (nem pelo @dev na conclusão, nem pelo @qa no gate). O que a
protege é (a) o helper testado, (b) a revisão de código do Quality Gate, e (c) o fato de o
desfecho da falha ser o estado de HOJE (marca da Trifold), ou seja, falha na direção segura.
Conferência manual sugerida ao @dev: apontar `logo_url` para uma URL inexistente em ambiente de
teste e confirmar que a marca da Trifold reaparece.

**AC5 — Logo do mobile (linhas atuais `288-294`) usa o mesmo helper, o rótulo de texto some
quando o logo é customizado, e o filtro do mobile segue a MESMA regra da AC3.**
Hoje a barra mobile mostra logo + texto "Trifold" lado a lado (`288-294`). Quando
`brand.isCustom`, o `<span>Trifold</span>` (linha `294`) **não é renderizado** — mesma lógica que
`email-layout/header.ts:12-13` já usa como precedente ("o logo já contém o wordmark"; aqui
aplicado ao mobile, não ao e-mail). Quando `!brand.isCustom`, mantém o texto "Trifold" exatamente
como hoje.

**[@po 2026-09-01] O mobile também tem filtro, e a v0.1 esquecia dele.** Medido: a linha `292` é
`className="dark:brightness-0 dark:invert"` (sem o `brightness-0` do modo claro que o desktop
tem, mas com os dois no modo escuro). Sem condicionar essa string, um logo de cliente **a cores**
sairia **preto e invertido no tema escuro do celular** — exatamente o defeito que a AC3 proíbe no
desktop, sobrevivendo em outra superfície. A regra da AC3 vale aqui na íntegra: filtro só quando
`!brand.isCustom`; quando `isCustom`, sem filtro e com a mesma trava de caixa
(`object-contain` + largura/altura automáticas dentro do `h-14` da barra mobile).

**AC6 — `dashboard/layout.tsx` busca `logo_url`/`name` e passa para `SidebarNav`.**
Query nova, incondicional (diferente da consulta de `materiais_url`, que só roda se o módulo
está ligado — o logo precisa aparecer para toda org):
```ts
const { data: orgBrand } = await supabase
  .from("organizations")
  .select("name, logo_url")
  .eq("id", user.orgId)
  .maybeSingle()
```
`.maybeSingle()`, não `.single()`. **[@po 2026-09-01 — justificativa corrigida]** o motivo não é
que `.single()` "lança": no `supabase-js` ele **devolve** `{ data: null, error: PGRST116 }` (HTTP
406) em 0 linhas, não levanta exceção — é assim que as duas leituras de `settings` que já existem
nestes arquivos (`dashboard/layout.tsx:265`, `broker/layout.tsx:66`, ambas com `.single()`)
sobrevivem hoje. O motivo de usar `.maybeSingle()` é que 0 linhas **não é erro** para esta
leitura: ela roda para toda org e o resultado vazio tem significado ("sem logo"), então
`.maybeSingle()` é a forma que **não** polui o log com um erro que não é erro. Resultado
passado como `orgName={orgBrand?.name}` / `orgLogoUrl={orgBrand?.logo_url}` no `<SidebarNav>`
(hoje em `~338`). Falha de leitura (`error` não nulo) **não bloqueia a página** — cai no
`undefined`, que o helper (AC2) já trata como "sem logo customizado" (fail-open para o estado
seguro de hoje, mesmo padrão de `atalhoDoConsole`/`liveBadges`, que também não travam a página se
falharem).

**AC7 — `broker/layout.tsx` recebe o mesmo tratamento, mesma query, mesma prop.**
Mesma leitura incondicional de `name, logo_url`, passada ao `<SidebarNav>` em `~95`. Duas
implementações da mesma regra (dashboard e broker), porque `SidebarNav` é compartilhado mas cada
layout já faz sua própria busca de dados hoje (não há um data-loader comum a extrair — seria
escopo novo não pedido).

**AC8 — RLS confirmada, sem policy nova.**
`org_select_own` (`004_rls_policies.sql:72`) é policy de LINHA (`org_id = auth org do usuário`),
não de coluna — `logo_url` é lido pela mesma policy que já libera `settings`/`name` para o mesmo
usuário. Nenhuma migration de RLS. (Verificação, não implementação — se algum ambiente divergir
disso, é achado a reportar, não a "consertar" silenciosamente dentro desta story.)

**AC9 — `next/image` já aceita a URL pública do bucket `org-logos`, sem mudar `next.config.ts`.**
`images.remotePatterns` (`next.config.ts`) já inclui `{ protocol: "https", hostname:
"*.supabase.co", pathname: "/storage/v1/object/**" }` — a forma da URL pública devolvida por
`getPublicUrl()` da `900-63` casa esse padrão. Nenhuma mudança de configuração nesta story.
(Verificação declarada. **[@po 2026-09-01 — correção]** a v0.1 dizia que um host fora do padrão
"quebra com erro visível". Não quebra visivelmente: `/_next/image` responde **400**, o `<img>`
dispara `onError`, e a AC4 **cai de volta para a marca da Trifold** — ou seja, o sintoma de um
host não permitido é "o logo do cliente simplesmente não aparece", indistinguível de "a empresa
não enviou logo". Isso é fail-safe e está certo assim, mas **não é auto-denunciante**: se um dia
a `900-63` passar a gravar `logo_url` de outro host, o achado será um cliente reclamando, não um
build vermelho. Registrado como limite conhecido, não como risco a consertar preventivamente
aqui.)

**AC10 — Sem admin-client, sem allowlist.**
Nenhuma rota desta story chama `createAdminClient()` — as duas leituras (AC6/AC7) são
`createClient()` de sessão, já em uso nos dois arquivos. `docs/audits/admin-client-allowlist.
json` não precisa de entrada nova.

**AC11 — Fora de escopo, declarado.**
- Login (`login/page.tsx`) — ver seção "Login fica fora" acima. Continua mostrando a marca da
  Trifold para toda empresa.
- E-mails transacionais (`lib/email-layout/*`) — ver seção "E-mail fica fora" acima. Continuam
  mostrando a marca da Trifold (ou "Portal de Obras", no caso já hardcoded) para toda empresa.
- Qualquer outro consumidor de `SidebarNav` além de `dashboard/layout.tsx` e `broker/layout.tsx`
  — `git grep -rln "SidebarNav" packages/web/src/app` mediu exatamente esses dois; se um
  terceiro aparecer no futuro, herda o comportamento de fallback (AC1, props opcionais) sem
  precisar desta story ser reaberta.
- Processar a imagem no servidor (recorte, redimensionamento, normalização de fundo, conversão
  de formato) — nada é processado, consistente com a `900-63`, que também guarda o arquivo como
  veio. **[@po 2026-09-01 — a v0.1 desta linha estava errada e virou requisito na AC3.]** Ela
  dizia "o slot já é quadrado o bastante para a maioria dos logos". Medido: o slot **não é
  quadrado** (contêiner `h-20` = 80 px de altura, `<Image width={143}>`) e o próprio asset da
  Trifold é **800×96**. Com `img { height: auto }` do preflight do Tailwind v4, um logo de
  cliente quadrado renderiza 143×143 e **estoura o cabeçalho**. Continua fora de escopo
  processar a imagem; **entrou no escopo** (AC3/AC5) a trava de caixa em CSS que faz qualquer
  proporção caber. Não são a mesma coisa: uma é pipeline de imagem, a outra é uma classe.

**AC12 — [@po 2026-09-01] As duas ligações de layout têm carrasco ESTÁTICO. Sem isto, AC6 e AC7
não têm régua nenhuma.**
`dashboard/layout.tsx` e `broker/layout.tsx` são server components `async` com dezenas de
consultas — não são renderizáveis no harness da Task 5. Sem uma asserção própria, a mutação
"o layout não passa prop nenhuma" deixa **o helper (Task 1) e o componente (Task 5) verdes** e a
story inteira invisível mesmo depois da `900-63` entrar — que é exatamente o desfecho que esta
story existe para evitar. Uma função pura bem testada com quem a alimenta sem régua é o mesmo
verde vazio um andar acima.

O mecanismo **já existe neste arquivo de teste** e é o precedente a copiar:
`sidebar-nav.test.ts` usa `callSiteDe(fonte, "<SidebarNav")` + `ocorrenciasNoCodigo(...)` de
`@web/lib/tenancy/fonte-scan` para provar a ligação de `atalhoDoConsole` no `dashboard/layout.tsx`.
Exigido aqui, para **os dois** layouts (hoje o arquivo só conhece o do dashboard):
- O call site de `<SidebarNav` em `dashboard/layout.tsx` contém `orgName={` **e** `orgLogoUrl={`.
- O call site de `<SidebarNav` em `broker/layout.tsx` contém `orgName={` **e** `orgLogoUrl={`.
- Cada asserção precede-se do fail-closed do precedente (`expect(callSite.length)
  .toBeGreaterThan(0)`), senão um recorte vazio aprova em silêncio.
- O texto passa por `codigoDe`/`ocorrenciasNoCodigo` (que ignoram comentário), senão um
  comentário citando a prop satisfaz a régua.

**AC13 — [@po 2026-09-01] O mock de `next/image` do harness PRECISA repassar `className`, senão a
régua da AC3 nasce verde desligada.**
Medido em `sidebar-nav.test.ts:47-49`, o mock atual é:
```ts
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }),
}))
```
Ele **descarta `className`** (e `onError`, e todo o resto). Qualquer asserção do tipo "o markup
do logo customizado **não** tem `brightness-0`" passaria **mesmo com a `className` deixada
incondicional** — a classe nunca chega ao HTML, com ou sem a correção. É a mesma família do
defeito que o @qa derrubou na `900-60` (régua que não pode reprovar).

Exigido: estender o mock para repassar `className` (e só o que a régua precisa medir), p.ex.
`({ src, alt, className }) => createElement("img", { src, alt, className })`. Medido que isso é
seguro para as asserções que já existem no arquivo (elas medem `data-atalho-console`, `href`,
`/platform`, `Marcos Teste`, `Sair` — nenhuma string de classe do componente contém esses
tokens). **Contraprova obrigatória antes de fechar a story:** com o mock estendido, deixar a
`className` do desktop incondicional e confirmar que a asserção da AC3 **reprova**; só então
reverter. Se ela não reprovar, a régua está morta e a AC3 não está medida.

---

## Tasks / Subtasks

- [x] **Task 1 (AC2) — Helper puro `resolveSidebarBrand`**
  - [x] 1.1 Implementar a função, sem dependência de React/DOM
  - [x] 1.2 Testes unitários: sem `orgLogoUrl` → fallback; com `orgLogoUrl` e `imgFailed=false`
    → customizado; com `orgLogoUrl` e `imgFailed=true` → fallback (o carrasco do AC4)
- [x] **Task 2 (AC1, AC3, AC4, AC5) — `SidebarNav`**
  - [x] 2.1 Props novas (`orgName`, `orgLogoUrl`) em `SidebarNavProps`
  - [x] 2.2 Estado `imgFailed` (componente já é `"use client"`)
  - [x] 2.3 Logo desktop usa o helper + `onError`; classes de filtro só quando `!isCustom`;
    trava de caixa (`max-h-*`/`object-contain`) quando `isCustom` — AC3
  - [x] 2.4 Logo mobile usa o helper + `onError`; rótulo de texto condicionado a `!isCustom`;
    **e o filtro `dark:brightness-0 dark:invert` da linha `292` também condicionado** — AC5
- [x] **Task 3 (AC6) — `dashboard/layout.tsx`**
  - [x] 3.1 Query incondicional `name, logo_url` via `.maybeSingle()`
  - [x] 3.2 Passar `orgName`/`orgLogoUrl` para `<SidebarNav>`
- [x] **Task 4 (AC7) — `broker/layout.tsx`**
  - [x] 4.1 Mesma query, mesmas props
- [x] **Task 5 — Testes de caracterização em `sidebar-nav.test.ts`** (padrão medido do arquivo:
  `.test.ts`, `renderToStaticMarkup`, `next/image`/`next/link` mockados)
  - [x] 5.0 **(AC13) Estender o mock de `next/image` para repassar `className`** — o mock atual
    (`sidebar-nav.test.ts:47-49`) só repassa `src`/`alt`, e sem isto a asserção 5.2 sobre classes
    nasce verde desligada. Rodar `sidebar-nav.test.ts` depois de estender e antes de mudar o
    componente, para confirmar que as asserções que já existem no arquivo continuam passando.
  - [x] 5.1 Sem `orgLogoUrl` → markup idêntico ao de hoje (byte a byte na parte do logo):
    `<img src="/logo-trifold.webp" alt="Trifold">` (desktop e mobile) + texto "Trifold" no mobile
    + a `className` de hoje **presente** (`brightness-0 dark:brightness-0 dark:invert` no desktop,
    `dark:brightness-0 dark:invert` no mobile)
  - [x] 5.2 Com `orgLogoUrl` → `<img src={orgLogoUrl}>`, `alt={orgName}`, SEM o texto "Trifold"
    no mobile, SEM as classes `brightness-0`/`invert` no desktop **nem no mobile**, e COM a trava
    de caixa da AC3 presente na `className`
  - [x] 5.3 **(AC13) Contraprova:** deixar a `className` do desktop incondicional e confirmar que
    5.2 **reprova**; reverter. Registrar o resultado no Dev Agent Record — "a régua reprovou
    quando devia" é o único jeito de saber que ela mede algo.
- [x] **Task 5b (AC12) — Carrasco estático das duas ligações de layout**
  - [x] 5b.1 `dashboard/layout.tsx`: `callSiteDe(fonte, "<SidebarNav")` contém `orgName={` e
    `orgLogoUrl={`, com o fail-closed de `callSite.length > 0` (precedente já no arquivo)
  - [x] 5b.2 `broker/layout.tsx`: idem — **o arquivo de teste hoje não conhece este layout**;
    adicionar a constante de caminho ao lado de `LAYOUT_DO_CRM`
  - [x] 5b.3 Contraprova: apagar uma das props de um dos layouts e confirmar que **só** a
    asserção daquele layout reprova (os conjuntos de morte precisam ser disjuntos, como as duas
    metades da 900-56 já são neste mesmo arquivo)
- [x] **Task 6 — Verificação (não implementação)**
  - [x] 6.1 Confirmar `org_select_own` cobre `logo_url` (AC8) — leitura da policy, sem alterar
  - [x] 6.2 Confirmar `next.config.ts` `remotePatterns` cobre a URL pública do bucket (AC9) —
    leitura, sem alterar
  - [x] 6.3 Conferência manual do desfecho de falha (AC4, que não tem carrasco): apontar
    `logo_url` para uma URL inexistente **no ambiente de teste** e confirmar que a marca da
    Trifold reaparece — nunca espaço vazio
- [x] **Task 7 — Gate de tipos**
  - [x] 7.1 `pnpm --filter web type-check` limpo

---

## Dev Notes

### Efeito visível — e quando ele aparece
Enquanto nenhuma empresa tiver `logo_url` preenchido (**reconferido pelo @po em 2026-09-01,
direto em produção, por agregado somente-leitura via Management API:
`SELECT count(*), count(logo_url) FROM organizations` → `{total_orgs: 1, com_logo: 0}`** — a
mesma medição que a `900-63` reporta), esta story é tecnicamente completa mas **visualmente
invisível** — toda org continua vendo a marca da Trifold, porque é exatamente o que o helper
(AC2) devolve na ausência de `orgLogoUrl`. O efeito só aparece depois que a `900-63` for
implementada, deployada, e um platform admin enviar o primeiro logo. Isso é esperado e
consistente com a ordem declarada `900-63` → `900-64` na story irmã — não é um defeito desta
story, é a natureza de "a metade que consome" vir depois de "a metade que produz".

### Precedentes lidos nesta sessão
- `packages/web/src/components/layout/sidebar-nav.test.ts` — molde do harness de teste
  (`renderToStaticMarkup`, sem jsdom, `next/image`/`next/link` mockados como `<img>`/`<a>`
  simples). Este é o motivo da AC2 extrair um helper puro: o harness não executa `onError`.
- `packages/web/src/lib/email-layout/components/header.ts:12-18` — precedente da regra "logo já
  contém o wordmark, esconder o texto ao lado" (aplicada aqui ao mobile do sidebar, não ao
  e-mail, que fica fora do escopo).
- `packages/web/src/app/dashboard/layout.tsx:260-270` / `broker/layout.tsx:61-70` — padrão de
  leitura condicional de `organizations.settings` já em uso; esta story adiciona uma leitura
  irmã, incondicional, para `logo_url`/`name`.
- `next.config.ts` — `images.remotePatterns` já cobre `*.supabase.co/storage/v1/object/**`;
  verificado, não seria necessário mexer mesmo que a `900-63` já estivesse em produção.

### Ordem de implementação sugerida
Esta story pode ser implementada em paralelo à `900-63` (não depende dela para o CÓDIGO
funcionar — o helper trata `orgLogoUrl` ausente/nulo desde o dia 1). A dependência é só de
VALOR: sem a `900-63` em produção, não há `logo_url` para consumir. Nada impede escrever e
mergear esta story antes, desde que os testes de caracterização (Task 5) provem que o
comportamento de hoje não muda para nenhuma org sem logo.

**[@po 2026-09-01] Duas ordens diferentes, para não confundir quem lê:**
- **Ordem de MERGE: livre.** Qualquer uma das duas pode entrar primeiro sem quebrar nada. Se esta
  entrar antes, `logo_url` é sempre nulo e o helper devolve a marca da Trifold — idêntico a hoje.
- **Ordem de VALOR: `900-63` → `900-64`, dura e declarada.** É a ordem que a `900-63` fixou no
  próprio título ("METADE 1 de 2 — guardar o arquivo; a exibição é a `900-64`") e na seção "ESTA
  STORY SOZINHA NÃO ENTREGA O QUE FOI PEDIDO". Enquanto **as duas** não estiverem em produção
  **e** um platform admin não tiver enviado um logo, **nenhuma das duas pode ser anunciada como
  "o logo da empresa"** — a `900-63` sem esta guarda um arquivo que ninguém vê; esta sem aquela
  exibe um campo que ninguém preencheu. A régua da AC9 (`getPublicUrl` casa `remotePatterns`) é
  verificação contra o desenho declarado da `900-63`; se a `900-63` mudar a forma da URL antes de
  entrar, esta AC precisa ser reconferida — não presumida.

---

## Testing
- **Framework:** Vitest, mesmo padrão de `sidebar-nav.test.ts` (`.test.ts`, `renderToStaticMarkup`
  de `react-dom/server`, sem jsdom).
- **Helper puro (AC2):** testes unitários diretos, sem render — cobre o caso `imgFailed` que o
  harness de render não alcança.
- **Caracterização (Task 5):** garante ZERO regressão visual para toda org sem logo (o caso de
  100% das orgs em produção hoje — 1 de 1, reconferido pelo @po).
- **[@po] Mock de `next/image` (Task 5.0 / AC13):** o mock do arquivo **precisa** repassar
  `className` antes de qualquer asserção sobre classes existir; senão a régua da AC3 nasce verde
  desligada. Contraprova obrigatória em 5.3.
- **[@po] Ligação dos layouts (Task 5b / AC12):** asserção **estática** sobre o call site de
  `<SidebarNav>` nos DOIS layouts (`callSiteDe`/`ocorrenciasNoCodigo` de
  `@web/lib/tenancy/fonte-scan`, precedente já usado neste mesmo arquivo para `atalhoDoConsole`).
  Sem ela, AC6 e AC7 não têm régua e a story pode passar inteira sem que nenhum layout passe as
  props.
- **[@po] O que NÃO tem carrasco, declarado:** a fiação `onError → setImgFailed → helper` (AC4).
  O mock de `next/image` descarta `onError` e `renderToStaticMarkup` não executa handlers.
  Conferência manual em 6.3; ninguém pode declarar essa fiação coberta.
- **Gate de tipos:** `pnpm --filter web type-check` limpo.
- Sem migration, sem RLS nova, sem rota nova — nenhum teste de integração de banco/API é exigido
  por esta story.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml`. Revisão manual
> via Quality Gate desta story (@dev).

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-01 | 0.1 | Draft inicial. Metade 2 de 2 do pedido de logo (a `900-63` é a metade 1, "guardar"; esta é "exibir"). Das 3 superfícies medidas pela `900-63` (`sidebar-nav.tsx`, `login/page.tsx`, `lib/email-layout/*`), só o sidebar entra: a org já é conhecida na sessão nos dois layouts que o renderizam (`dashboard/layout.tsx`, `broker/layout.tsx`), sem resolução de tenant nova. **Login fica fora**, declarado como decisão de arquitetura (nenhuma rota `[slug]`/subdomínio existe; a org só é conhecida DEPOIS do login) — nomeada como story futura, sem número. **E-mail fica fora**, com achado novo mais grave do que o herdado da `900-63`: as 8 chamadas reais de `renderBaseLayout`/`renderPasswordActionEmail` no repositório hoje passam `orgName` **literal e hardcoded** ("Trifold", "Trifold CRM", "Portal de Obras" — nenhuma deriva a org real), e em `password-action.ts` o texto "Trifold" está escrito dentro do assunto/corpo do e-mail, não só no parâmetro — tornar o e-mail multi-tenant é projeto do tamanho do login, também nomeado como story futura sem número. Escopo do sidebar: 2 props novas opcionais em `SidebarNavProps`, um helper puro `resolveSidebarBrand` (extraído especificamente porque o harness de teste do componente, medido em `sidebar-nav.test.ts`, usa `renderToStaticMarkup` sem jsdom e não executa `onError`), fallback declarado para logo ausente E para imagem que falha ao carregar (nunca espaço vazio). Confirmado sem migration (coluna já existe), sem RLS nova (`org_select_own` é policy de linha, cobre `logo_url` pela mesma regra de `settings`), sem mudança em `next.config.ts` (`*.supabase.co/storage/v1/object/**` já coberto), sem allowlist de admin-client (leituras via `createClient()` de sessão, não `createAdminClient()`), e fora do alcance das guardas do console de plataforma (`platformQuery`/`platform-query-scan.ts`) — arquivos tocados por esta story estão fora de `app/platform/**`. Efeito visível declarado como dependente da `900-63` estar em produção com ao menos uma org com logo enviado (hoje: 0 de 1). | @sm (River) |
| 2026-09-01 | 0.2 | **Validação @po — GO (8/10) com 6 correções aplicadas no próprio arquivo, e Status Draft → Ready.** As três decisões do @sm foram reconferidas contra o código e **as três procedem**: (1) *login fora* — nenhuma das 96 rotas dinâmicas de `app/**` é slug de tenant, não existe `middleware.ts`, e o `useSearchParams` do `login/page.tsx` só lê `reset`/`error`; (2) *e-mail fora* — as chamadas passam literal, confirmado uma a uma, e `password-action.ts:26-27,29-30` tem "Trifold" no assunto e no corpo; (3) *sidebar entra* — `dashboard/layout.tsx:111`/`broker/layout.tsx:36` já têm `user.orgId` e já leem `.from("organizations")` sob RLS de sessão (`:265`/`:66`), então somar dois campos é barato. Também reconferidos: `logo_url` em `001_base_schema.sql:62`; `org_select_own` em `004_rls_policies.sql:72` é `FOR SELECT USING (id = public.user_org_id())`, de linha, sem restrição de coluna; `remotePatterns` em `next.config.ts:51-56`; `platform-query-scan.ts` limitado a `app/platform/**` e `app/api/platform/**` (e agora com DOIS detectores, 900-42a); `SidebarNav` tem exatamente 2 consumidores; `vitest.config.ts` coleta só `*.test.ts` (a armadilha da `900-60` não se repete aqui); `docs/audits/admin-client-allowlist.json` existe e não precisa de entrada; a linha `84` de `app/platform/orgs/[id]/page.tsx` (projeção do `platformQuery`, disputada com `900-62`/`900-63`) **não é tocada** por esta story e a regra "somar, nunca substituir" segue valendo intacta; e **0 de 1** org em produção tem `logo_url` (medido pelo @po por agregado somente-leitura via Management API — a alegação de zero regressão procede). **As 6 correções:** (a) **AC13 nova** — o mock de `next/image` em `sidebar-nav.test.ts:47-49` só repassa `src`/`alt`, então a asserção da Task 5.2 sobre as classes `brightness-0`/`invert` **nasceria verde desligada**, mesma família do defeito que o @qa derrubou na `900-60`; agora o mock precisa repassar `className` e há contraprova obrigatória (5.3). (b) **AC12 nova** — AC6/AC7 (os layouts passando as props) **não tinham carrasco nenhum**: sem eles, helper e componente ficam verdes e a story sai invisível mesmo com a `900-63` em produção; o mecanismo (`callSiteDe`/`ocorrenciasNoCodigo`) já existe no mesmo arquivo de teste, usado para `atalhoDoConsole`, e agora é exigido para os DOIS layouts (o arquivo hoje só conhece o do dashboard). (c) **Geometria medida e AC11 corrigida** — a v0.1 dizia "o slot já é quadrado o bastante"; medido, o contêiner é `h-20` (80 px) e `public/logo-trifold.webp` é **800×96**; com `img { height: auto }` do preflight do Tailwind v4, um logo de cliente **quadrado** renderiza 143×143 e estoura o cabeçalho — a trava de caixa em CSS entrou na AC3/AC5 como requisito. (d) **AC5 ampliada** — o filtro `dark:brightness-0 dark:invert` da linha `292` (mobile) escapava da regra da AC3 e deixaria o logo colorido do cliente preto e invertido no tema escuro do celular. (e) **Recontagem do e-mail: 8 → 10 chamadas, 4 → 6 via `password-action.ts`** — o grep da v0.1 (`renderBaseLayout(\|orgName:`) não casa `renderPasswordActionEmail({` e perdia `api/brokers/route.ts:143` e `:302`, que é o caminho pelo qual todo corretor de uma empresa nova recebe o primeiro e-mail do sistema; a **lacuna comercial** ("uma empresa nova manda para os próprios corretores e clientes e-mails assinados Trifold") passou a estar escrita na story, com os 6 pontos nomeados e a story futura à qual pertence. (f) **Três justificativas imprecisas corrigidas** — `.single()` não "lança" no `supabase-js` (devolve `PGRST116`/406); host fora de `remotePatterns` não dá "erro visível", dá 400 no `/_next/image` → `onError` → fallback silencioso para a Trifold; e a AC4 **não tem carrasco** para a fiação `onError → setImgFailed` (o mock descarta `onError`), agora declarada como lacuna nomeada com conferência manual em 6.3. Título e ordem também ajustados: o H1 passou a carregar o qualificador "METADE 2 de 2 — na barra lateral (login e e-mail continuam dizendo Trifold)", espelhando a regra que a `900-63` já aplica ao próprio título, e a Dev Note separa **ordem de merge (livre)** de **ordem de valor (`900-63` → `900-64`, dura)**. | @po (Pax) |
| 2026-09-02 | 0.3 | **Implementada pelo @dev (Dex) — Status Ready → Ready for Review.** Branch `story/900-64-marca-da-empresa`, empilhada sobre `story/900-63-logo-da-empresa` (head `fc2fe0ae`, PR #562). Entrega: helper puro `resolveSidebarBrand` em `sidebar-nav-brand.ts` (arquivo `.ts`, nao `.tsx` — o `include` do vitest so coleta `*.test.ts`), 2 props opcionais e 4 constantes de classe em `sidebar-nav.tsx` (desktop e mobile tem filtros e caixas diferentes), `onError` nas duas superficies, rotulo de texto do mobile condicionado, e a leitura incondicional de `name, logo_url` com `.maybeSingle()` nos DOIS layouts. **Reguas:** baseline do CI run `33652012162` (head `fc2fe0ae`, success) = 319 arquivos / 4484 / 6; depois desta story, local 320 / 4495 / 6 (+1 arquivo, +25 testes). O numero LOCAL do baseline (319 / 4470 / 6) diverge do CI por causa dos 6 arquivos de outra frente na arvore de trabalho, que nao entram em commit. `type-check` rc=0, `lint --force` 0 erros, `type-check --force` 8/8, `build` 5/5. **9 mutantes**, todos com `tsc --noEmit` rc=0 antes do vermelho e restauro por `cp` + `shasum -c`: className do desktop (2 vermelhos), className do mobile (2), rotulo do mobile (1), dashboard sem `orgLogoUrl` (2, so os do CRM), broker sem `orgName` (2, so os do corretor — conjuntos DISJUNTOS nos dois sentidos), argumento trocado por `user.name` (2), helper ignorando `imgFailed` (1), classe do cliente aplicada sempre (1), e a projecao sem `logo_url` (registrada como vermelho NAO-limpo: `tsc` rc=2 / TS2339, o merito e do compilador). **O controle negativo da AC13:** com o mock ANTIGO e o mesmo mutante da className, a suite fica **36/36 VERDE** — a medicao exata do que a extensao do mock comprou. **Na tela** (ambiente de teste, login pelo formulario): logo PNG 512x512 quadrado e colorido enviado pela tela da 900-63; o `next/image` aceitou a URL remota (AC9 provada viva, sem 400); o logo renderizou **48x48 dentro de um cabecalho de 223x80, sem estourar** (sem a trava iria a 143x143); saiu **colorido** no desktop claro, no desktop escuro e no topo do mobile escuro; o rotulo de texto sumiu (contagem 0); e forcando `/_next/image` a 404 o elemento **trocou sozinho** para o asset da Trifold e o rotulo reapareceu — a conferencia manual da AC4, que continua **sem carrasco automatizado**. **Nao provado na tela:** a barra do app do corretor (o ambiente nao tem conta `role: broker` e criar uma seria escrita fora da autorizacao) — a ligacao daquele layout esta provada pela regua estatica da AC12, pelo `tsc` e pelo `build`. **Fixture devolvida:** 3 orgs, `logo_url` NULL nas tres, balde vazio (remocao pela tela), Empresa A com contato/fiscal e 2 integracoes em `error`; `reset:testdb` nao executado; producao nao tocada. **Achados abertos, nao consertados de proposito:** (a) nitidez do logo do cliente no topo do mobile — `width={24}` gera srcset de 24w/48w e a trava permite ate 128 px de largura; a AC3 mediu geometria, nao resolucao, e expandir escopo sem AC nao se faz; (b) a janela de 1 h do CDN apos REMOVER um logo nao afeta esta story, porque quem decide e `logo_url`, que vai a NULL na hora. **Ressalva contra mim mesmo:** para diagnosticar a falha de login imprimi os rotulos e o comprimento dos valores do arquivo de credenciais — zero caractere de valor saiu, mas o arquivo proibe imprimir a propria estrutura, e o caminho certo era ler `EMAIL_PLATFORM_ADMIN` de dentro do script desde o inicio. **O qualificador continua obrigatorio:** login e e-mails transacionais seguem dizendo Trifold para toda empresa. | @dev (Dex) |

## Dev Agent Record

**Agente:** @dev (Dex) · **Modelo:** Claude Opus 4.6 · **Data:** 2026-09-02
**Branch:** `story/900-64-marca-da-empresa` — criada de `story/900-63-logo-da-empresa` (head
`fc2fe0ae`, PR #562 aberto). ⚠️ **PR EMPILHADO.** O GitHub não reaponta base de PR empilhado: quando
o #562 mergear, é preciso `gh pr edit --base main` neste antes de mergear.

### O que esta story entrega, com o qualificador que ninguém pode omitir

A marca da empresa aparece no lugar da Trifold **na barra lateral do CRM e do app do corretor**.
**O login continua dizendo "Trifold CRM" e os e-mails transacionais continuam assinados "Trifold"
para toda empresa** — as duas lacunas seguem abertas, nomeadas nas seções homônimas da story, e a
do e-mail é a de maior alcance externo (6 dos 10 pontos de chamada passam por
`password-action.ts:26-30`, que tem a palavra escrita no assunto e no corpo).

### Baseline e resultado — medidos, e por que o número local diverge do CI

Baseline: **CI run `33652012162`**, workflow `CI`, head `fc2fe0ae`, conclusão `success` —
**319 arquivos / 4484 passaram / 6 expected fail (4490)**.
Baseline local, mesma árvore: **319 / 4470 / 6 (4476)**. A divergência de 14 testes é dos **6
arquivos de outra frente** que a árvore de trabalho carrega (`webhook/whatsapp/route.ts` + teste,
`lib/meta/process-lead.ts` + teste, `lib/tenancy/webhook-org.ts` + teste) — modificados, não novos,
por isso a contagem de ARQUIVOS bate e a de TESTES não. Nenhum deles entra em commit desta story.

Depois desta story, local: **320 / 4495 / 6 (4501)** — `+1` arquivo e `+25` testes
(10 do helper + 15 novos em `sidebar-nav.test.ts`). Projeção para o CI: **320 / 4509 / 6**.

`pnpm --filter web type-check` rc=0. `pnpm lint --force` 8/8, **0 erros** (30 warnings pré-existentes,
**nenhum** nos arquivos desta story). `pnpm type-check --force` 8/8. `pnpm build` 5/5.

### Vermelho → verde: 9 mutantes, cada um com `tsc --noEmit` rc=0 antes do vermelho

Restauro sempre por **`cp` + `shasum -c`** (nunca `git checkout` — ele apagaria os 6 arquivos
alheios). Os 6 hashes conferiram `OK` depois de cada rodada.

**1. `className` do desktop incondicional (AC13 / Task 5.3)** — `tsc` rc=0 · **2 vermelhos**:
"as duas imagens são o logo da empresa…" e "nenhuma das duas superfícies carrega
`brightness-0`/`invert`…".

**1b. O CONTROLE NEGATIVO que prova a AC13.** Com o **mock antigo** (`({src, alt})`, sem
`className`) e o **mesmo mutante 1** ainda no componente: **36/36 VERDE**. É a medição exata do que
a extensão do mock comprou — antes dela, o logo colorido de um cliente saía preto-e-branco e a
suíte inteira aprovava. Para o controle valer, as asserções que citam classe foram degradadas para
`src` (a classe não existe no HTML sem o mock estendido); a única variável foi o mock.

**2. `className` do mobile incondicional (AC5, o filtro que escapava)** — `tsc` rc=0 · **2
vermelhos**, os mesmos dois `it`. Sem a correção da AC5, este era o defeito que sobrevivia na outra
superfície.

**3. `<span>Trifold</span>` do mobile incondicional (AC5)** — `tsc` rc=0 · **1 vermelho**: "a marca
da Trifold some do HTML inteiro". Conjunto de morte **diferente** dos mutantes 1 e 2 — filtro e
rótulo são medidos por asserções distintas.

**4. `dashboard/layout.tsx` sem `orgLogoUrl` (AC12 / Task 5b.3)** — `tsc` rc=0 · **2 vermelhos, os
dois de "o CRM"**. Os dois `it` de "o app do corretor" ficaram **VERDES**.

**5. `broker/layout.tsx` sem `orgName` (o sentido inverso)** — `tsc` rc=0 · **2 vermelhos, os dois
de "o app do corretor"**. Os do CRM, **verdes**. Os conjuntos de morte são **disjuntos** nos dois
sentidos — a régua distingue "os dois passam" de "um passa".

**6. `orgName={user.name}` no dashboard (o argumento é o carrasco)** — `tsc` rc=0 · **2 vermelhos
só do CRM**. A régua mede a EXPRESSÃO, não a presença do nome da prop: trocar a fonte de verdade
reprova.

**7. Helper ignora `imgFailed` (carrasco da AC4)** — `tsc` rc=0 · **1 vermelho**: "`imgFailed` vence
o logo da empresa (AC4)".

**8. Classe do cliente aplicada SEMPRE (regressão no caminho da Trifold)** — `tsc` rc=0 · **1
vermelho**: "as duas imagens são o asset da Trifold, com as classes de filtro de HOJE". A
caracterização de zero-regressão reprova nos dois sentidos.

**9. `.select("name")` no broker (o insumo)** — este NÃO é vermelho limpo e está registrado como
tal: `tsc` **rc=2**, `TS2339: Property 'logo_url' does not exist on type '{ name: any; }'`. O
compilador é quem mata a mutação de projeção (o `.select()` narrowa o tipo da linha). A régua
estática também acende, e o vermelho dela é independente do erro de compilação porque ela lê
TEXTO-FONTE — mas o mérito principal é do `tsc`, e creditá-lo ao teste seria falso.

### Task 6.3 — a conferência manual da AC4, feita no navegador de verdade

A fiação `onError → setImgFailed → resolveSidebarBrand` **não tem carrasco automatizado** (o mock
descarta `onError` e `renderToStaticMarkup` não executa handler). Conferida à mão, ambiente de
TESTE (`xnxvygyfyyyzwhiuoehz`), login **pelo formulário**, sem forjar sessão:

Forçando `**/_next/image**` a responder `404` no navegador, o `<img>` do topo do mobile trocou
sozinho para `src=/_next/image?url=%2Flogo-trifold.webp`, `alt="Trifold"`,
`class="dark:brightness-0 dark:invert"`, permaneceu **na árvore e visível**, e o rótulo de texto
"Trifold" **reapareceu** (contagem 0 → 1). É o desfecho declarado: nunca espaço vazio.

⚠️ Ressalva honesta: a interceptação derruba **todo** `/_next/image`, inclusive o asset de fallback
— por isso a captura mostra o ícone de imagem quebrada. O que o navegador prova é a **troca de
estado** (`src`/`alt`/`class`/rótulo voltaram para a marca da Trifold); a renderização do asset em
si é o caminho já exercitado pelo estado sem logo. **Ninguém pode declarar a AC4 coberta.**

### O que foi visto na tela, com o logo trocado

Logo enviado **pela tela da 900-63** (`/platform/orgs/00000000-…-0001`, botão "Enviar logo"),
PNG **512×512 quadrado e colorido** — as duas propriedades que a AC3/AC5 precisam provar. `logo_url`
gravado como
`https://xnxvygyfyyyzwhiuoehz.supabase.co/storage/v1/object/public/org-logos/…/logo.png?v=f703f5e7bb0a6ffa`.

- **AC9 provada VIVA, não só por leitura de config:** o `next/image` aceitou a URL remota —
  `src=/_next/image?url=…supabase.co…&w=384&q=75` carregou (`complete: true`,
  `naturalWidth 256`). Nenhum `400`, nenhum `onError`.
- **AC3 (geometria) — o defeito que o @po mediu, não aconteceu.** O logo quadrado renderizou
  **48×48** dentro de um cabeçalho de **223×80**; medido no DOM, `estoura: false`. Sem a trava
  `max-h-12` ele teria ido a **143×143** (o `<Image width={143}>` com `img { height: auto }` do
  preflight) e passado por cima da navegação. Para comparação, o **antes** medido na mesma tela:
  o asset da Trifold (800×96) renderiza **143×17**.
- **AC3/AC5 (filtro) — o logo saiu COLORIDO** no desktop claro, no desktop **escuro** e no topo do
  mobile **escuro** (`class` sem `brightness-0`/`invert` nas três). Era exatamente o tema escuro do
  celular que a v0.1 da story deixava escapar.
- **AC5 (rótulo)** — com logo customizado, `header span:text-is("Trifold")` conta **0**. O texto
  sumiu, como manda a AC.
- **`alt`** — "Org de Teste — Epic 900", o nome real da empresa, nas duas superfícies.

**O que NÃO foi visto na tela:** a barra do **app do corretor** (`/broker`). O ambiente de teste não
tem conta com `role: broker` (as três do arquivo de credenciais são admin/plataforma) e criar uma
seria escrita fora da autorização desta tarefa. A ligação daquele layout está provada pela régua
estática da AC12 (mutante 5), pelo `tsc` e pelo `build` — **não** pelo navegador.

**Fixture devolvida e conferida ao final:** 3 orgs, **`logo_url` NULL nas três**, balde `org-logos`
**vazio** (removido **pela tela**, botão "Remover"), Empresa A com `contato` + `fiscal` intactos e
**2 integrações em `error`**. `pnpm reset:testdb` **não foi executado**. Produção não foi tocada em
nenhum momento, nem para leitura.

### Higiene de segredo — uma ressalva contra mim mesmo

A senha do ambiente foi lida **de dentro do script**, junto com `EMAIL_PLATFORM_ADMIN`, e **nunca**
impressa, mascarada, copiada para outro arquivo ou passada como argumento de ferramenta.

⚠️ **Mas eu desobedeci a instrução nº 3 do próprio arquivo de credenciais**: para descobrir por que
o login falhava, imprimi os **rótulos** e o **comprimento** de cada valor. Zero caractere de valor
saiu, e o problema real era outro (eu usava `plataforma@example.com`, de `public.users`, quando o
e-mail de login mora no campo `EMAIL_PLATFORM_ADMIN` do arquivo). Ainda assim o arquivo diz "nao
imprima a estrutura", e eu imprimi. **O caminho certo, para a próxima vez: ler os campos de que se
precisa de dentro do script e imprimir só o veredito — inclusive o e-mail.**

### Decisões autônomas

`[AUTO-DECISION]` Onde mora o helper → arquivo novo `sidebar-nav-brand.ts`, ao lado do componente
(razão: IDS — `grep` por `resolveSidebarBrand`/`sidebar-nav-brand` e pelos 10 usos de
`logo-trifold` não achou nenhum resolvedor de marca reutilizável; REUSE e ADAPT descartados por
inexistência de candidato. O sufixo `.ts` e não `.tsx` é obrigatório: `vitest.config.ts` coleta
`packages/web/src/**/*.test.ts` e um `.test.tsx` nunca rodaria).

`[AUTO-DECISION]` Quatro constantes de classe, não duas → desktop e mobile têm filtros
**diferentes** hoje (`brightness-0 dark:brightness-0 dark:invert` contra
`dark:brightness-0 dark:invert`) e caixas diferentes (`h-20` contra `h-14`). Duas constantes
forçariam uma das duas superfícies a mudar de comportamento sem AC que peça.

`[AUTO-DECISION]` Trava de caixa = `h-auto max-h-N w-auto max-w-* object-contain` → com largura E
altura em `auto`, o navegador usa o tamanho intrínseco e as duas restrições `max-*` preservam a
razão de aspecto (CSS 2.1 §10.4 para elemento substituído). Fixar só `max-h-*` distorceria o logo,
porque o atributo `width` do `next/image` continuaria valendo.

`[AUTO-DECISION]` `trim()` em `orgLogoUrl` e `orgName` → a AC fala em "vazio/nulo"; `""` e `"   "`
passam por um `NOT NULL` e `??` não os pega. `alt=""` marcaria a imagem como decorativa e apagaria
a marca justamente para quem depende do leitor de tela — daí `ALT_GENERICO_DA_EMPRESA`.

`[AUTO-DECISION]` **Não** condicionar `width`/`height` do `<Image>` → ficam `143`/`24` como hoje.
Ver o achado aberto abaixo; expandir escopo sem AC não se faz, e reportar o achado se faz.

### Achados abertos — não consertados aqui, de propósito

🟡 **Nitidez do logo do cliente no topo do mobile.** O `<Image width={24} height={24}>` faz o
`next/image` gerar `srcset` de 24w/48w. Com a trava `max-w-32`, um logo largo pode ocupar até
128 px de largura — em tela 3x isso pediria ~384 px, e o recurso servido tem 48. O logo do teste
(quadrado, teto de 32 px de altura) não expôs o problema, e nenhuma AC fala em resolução: a AC3
mediu **geometria** (o layout quebra), não **nitidez**. Não expandi o escopo. Conserto de uma linha
numa story futura: condicionar `width`/`height` a `brand.isCustom` — e, se for feito, a régua tem de
crescer junto (o mock precisaria repassar `width`/`height`).

🟡 **A janela de 1 hora do CDN, herdada da medição do @devops.** Depois de REMOVER um logo, a mesma
URL pública ainda responde `200` por até 1 h (`cache-control: public, max-age=3600`). Isso **não**
afeta esta story: quem decide é `organizations.logo_url`, que vai a `NULL` na hora, e o helper cai
para a marca da Trifold no primeiro render seguinte. **Trocar** um logo é seguro por construção — a
URL é versionada por `?v=<sha do conteúdo>`, então bytes novos = URL nova. Medido no round-trip
desta sessão: `?v=f703f5e7bb0a6ffa` no envio, `logo_url` `NULL` na remoção.

🟡 **A AC8 continua sendo verificação, e nada mudou.** `org_select_own`
(`004_rls_policies.sql:72-73`) é `FOR SELECT USING (id = public.user_org_id())` — policy de LINHA,
sem restrição de coluna. `logo_url` sai pela mesma porta de `settings`/`name`. Nenhuma migration.

### Fora do alcance das guardas do console — CONFERIDO, não copiado da declaração

`platform-query-scan.test.ts` varre exatamente `path.join(SRC, "app/platform")` e
`app/api/platform` (lidos no arquivo de teste, linhas 22-26). Os 4 arquivos desta story estão em
`components/layout/`, `app/dashboard/` e `app/broker/` — **fora dos dois**. Nenhuma leitura passa
por `platformQuery()`; as duas são `createClient()` de sessão, o mesmo caminho que os dois layouts
já usam para `settings`. `createAdminClient()` não é chamado: `docs/audits/admin-client-allowlist.json`
não precisa de entrada (AC10). `next.config.ts:49-56` não foi tocado (AC9).

### File List

- `packages/web/src/components/layout/sidebar-nav-brand.ts` — **novo**. Helper puro (AC2).
- `packages/web/src/components/layout/sidebar-nav-brand.test.ts` — **novo**. 10 testes, inclui o
  único carrasco de `imgFailed` (AC4, nível de helper).
- `packages/web/src/components/layout/sidebar-nav.tsx` — 2 props opcionais, estado `imgFailed`,
  4 constantes de classe, `onError` nas duas superfícies, rótulo do mobile condicionado (AC1, AC3,
  AC4, AC5).
- `packages/web/src/components/layout/sidebar-nav.test.ts` — mock de `next/image` estendido para
  repassar `className` (AC13); 15 testes novos: caracterização sem logo, comportamento com logo, e
  o carrasco estático dos DOIS layouts (AC12).
- `packages/web/src/app/dashboard/layout.tsx` — leitura incondicional `name, logo_url` +
  `.maybeSingle()` e as 2 props no call site (AC6).
- `packages/web/src/app/broker/layout.tsx` — idem (AC7).

Sem migration, sem RLS, sem rota, sem mudança de configuração.

## QA Results
_(Preenchido pelo @qa.)_
