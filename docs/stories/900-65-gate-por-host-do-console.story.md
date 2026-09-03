# Story 900-65 — Gate por host do console: `admin.judtecnologia.com.br` sem tocar `crm.trifold.eng.br`

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Fundação do whitelabel de três camadas — item **0** dos três itens que "mudam a
  direção da falha" (`docs/architecture/whitelabel-e-migracao-jud.md`, §5, §8). É o único dos três
  cujo desenho já estava quase inteiramente medido antes desta story, em
  `docs/architecture/admin-saas-isolamento-por-host.md` (2026-08-31) — esta story converte a
  recomendação em ACs, não redescobre o desenho.
- **Story:** 900-65 — número reconfirmado livre em 2026-09-03 contra `docs/stories/` (maior
  existente: `900-64`), `git branch -a`, `git for-each-ref` (heads + remotes) e
  `gh pr list --state open` (nenhum PR aberto usa `900-65`+). Ver Change Log.
- **Status:** Ready for Review
- **Priority:** P0 — é um dos três itens que precisam entrar **antes** de qualquer story de
  whitelabel, porque toda story nova nasce com o vazamento de marca embutido enquanto a direção
  não mudar (`whitelabel-e-migracao-jud.md`, §5.1).
- **Complexity:** M — dois arquivos novos (função pura + réguas), um arquivo existente tocado em
  dois pontos (`proxy.ts`, `middleware.ts`), zero migration, zero rota nova. O trabalho real é a
  régua derivada do filesystem (§4.1 do doc-fonte), não a lógica em si.
- **Depende de:** nada. É mergeável inerte — sem a env var, o gate nunca decide nada
  (`PLATFORM_ADMIN_HOSTS` ausente ⇒ `papelDoHost()` devolve `"app"` para todo host).
- **NÃO inclui (fase 2, deliberadamente separada — ver "Fora do escopo" abaixo):** ligar a env var
  em qualquer ambiente real, fechar `/platform` nos hosts de CRM (simetria), ou resolver a marca
  (título/logo) por host no `layout.tsx` — essa é a Story 900-67 e outras futuras, não esta.

### Executor Assignment
- **Executor:** @dev (Dex). Único executor — é função pura + integração num arquivo já existente,
  sem schema.
- **Quality Gate:** @dev (Dex), pré-commit.
- **Quality Gate Tools:** `[code_review]`. Sem `migration_review` (nenhuma migration). Sem
  `security_review` de superfície nova — o gate NÃO é fronteira de autorização (ver AC9); a
  autorização real continua sendo `requirePlatformAdmin()`/`getPlatformAdmin()`, que esta story
  não toca.

---

## User Story
**Como** dono do produto que está transformando a Trifold em Jud Tecnologia,
**eu quero** um host `admin.judtecnologia.com.br` que sirva **somente** o console de plataforma
(`/platform`, `/api/platform/**`), sem afetar em nada `crm.trifold.eng.br`,
**para que** eu possa oferecer aos operadores da Jud um painel com identidade própria, revertível
sem deploy, sem arriscar a produção que já existe.

---

## O que este item resolve, e por que vem primeiro

`whitelabel-e-migracao-jud.md` §0(1): **não migrar o domínio da Trifold — adicionar um novo para a
Jud.** Isso zera a classe de risco "interrupção" inteira (webhooks, PWA instalado, push,
`site_url`/`uri_allow_list` do Supabase) porque `crm.trifold.eng.br` nunca muda. O único trabalho
que sobra é o **gate** que decide, por host, se a requisição pode ver `/platform` ou o resto do
produto.

Esta story **não liga nada em produção**. Ela entrega o mecanismo, inerte por padrão, com a régua
que prova que ele funciona antes do merge — e a ativação real (Story seguinte, fora deste escopo)
é uma sequência operacional de env var + sonda, sem código novo.

---

## Decisão de mecanismo — já tomada pelo `@architect`, não redecidida aqui

`admin-saas-isolamento-por-host.md` §3 avaliou 4 mecanismos e recomendou **gate no
`packages/web/src/proxy.ts`** sobre os outros três (route group/rewrite do `next.config.ts`, app
separado `packages/admin`, `vercel.json` com `has: host`). Resumo do motivo, para quem só ler esta
story:

| Mecanismo | Por que perde |
|---|---|
| `rewrites()` do `next.config.ts` | Congela no build (troca de host exige rebuild, não env var); precisa de matcher negativo ilegível para "tudo exceto `/platform`"; nenhum `vitest` o exercita |
| App separado `packages/admin` | É o destino certo, mas cega 4 réguas de fronteira existentes (`platform-query-scan.ts`, `dashboard-platform-boundary.test.ts`, `nao-consumo.test.ts`, `console-fail-closed.test.ts`) que varrem caminho literal dentro de `packages/web/src` — mover `/platform` para fora as faz passar verde sem medir nada |
| `vercel.json` com `has: host` | Provavelmente inerte contra rota de filesystem (`rewrites` do Vercel roda depois do filesystem); não é código, não roda em `vitest` |
| **Gate no `proxy.ts`** ✅ | Função pura testável, ativação/reversão por env var sem deploy, roda antes de `updateSession` (mais barato, 404 sem tocar Supabase) |

---

## Acceptance Criteria

**AC1 — `papelDoHost()`, função pura, arquivo novo.**
Criar `packages/web/src/lib/tenancy/papel-do-host.ts` exportando:
```ts
export function papelDoHost(host: string | null): "admin" | "app"
```
- Fonte: env var **não-pública** `PLATFORM_ADMIN_HOSTS`, lista de hosts separada por vírgula, lida
  por notação de colchete `process.env["PLATFORM_ADMIN_HOSTS"]` — **nunca** `process.env.X`. Motivo
  medido neste repo: `NEXT_PUBLIC_*` é inlinado como `undefined` no bundle do proxy nos builds da
  Vercel (`lib/supabase/middleware.ts:37-47` já documenta e contorna o mesmo problema para
  `SUPABASE_URL`). `PLATFORM_ADMIN_HOSTS` não é `NEXT_PUBLIC_`, mas a leitura por colchete é o
  padrão já estabelecido neste arquivo para env lida em edge/middleware — siga-o.
- Vazia ou ausente ⇒ conjunto vazio ⇒ `papelDoHost()` devolve `"app"` para **todo** host. Esta é a
  garantia de retrocompatibilidade e a chave de ligar/desligar (AC9).
- Comparação **case-insensitive**, hosts normalizados (minúsculas, sem porta).

**AC2 — `decidirNoHostAdmin()`, mesma função pura, mesmo módulo.**
```ts
export function decidirNoHostAdmin(input: { pathname: string }):
  | { tipo: "segue" }
  | { tipo: "reescreve"; para: string }
  | { tipo: "bloqueado" }
```
Allowlist — **tudo que não estiver aqui é `"bloqueado"`** (deny-by-default):

| Caminho | Decisão |
|---|---|
| `/platform`, `/platform/**` | `segue` |
| `/api/platform/**` | `segue` |
| `/login` | `segue` |
| `/auth/**` | `segue` |
| `/reset-senha` | `segue` |
| `/favicon.ico` | `segue` |
| `/` | `reescreve` para `/platform` |
| todo o resto | `bloqueado` |

**AC3 — Aplicação no `proxy.ts`, ANTES de `updateSession`.**
Em `packages/web/src/proxy.ts`:
1. Ler `request.headers.get("host")` (normalizado) — **nunca** `request.nextUrl.hostname`.
2. Se `papelDoHost(host) === "admin"`: aplicar `decidirNoHostAdmin({ pathname })`.
   - `"bloqueado"` ⇒ `new NextResponse(null, { status: 404 })`, **sem** chamar `updateSession`.
   - `"reescreve"` ⇒ `NextResponse.rewrite(new URL(decisao.para, request.url))` (rewrite, não
     redirect — não expõe a existência de outra árvore).
   - `"segue"` ⇒ prossegue para `updateSession` normalmente.
3. Se `papelDoHost(host) === "app"`: comportamento **idêntico ao de hoje**, sem nenhum desvio —
   `updateSession` roda exatamente como antes desta story.
4. Toda resposta **bloqueada** no host admin carrega o cabeçalho
   `X-Robots-Tag: noindex, nofollow`.

**AC4 — Corpo do 404 é nu, não o `not-found` do App Router.**
`new NextResponse(null, { status: 404 })` (ou `text/plain` curto). **Não** reescrever para uma rota
inexistente e deixar o Next renderizar `not-found` — isso passaria pelo `layout.tsx` raiz, que hoje
é o chrome do Trifold CRM (title, metadata), vazando marca da Trifold no host da Jud. Resposta nua
também é trivialmente assertável por `curl` (sem body para inspecionar).

**AC5 — Destino pós-login ciente do host: só o bounce de `middleware.ts` sobrevive como pendência.**
Medido nesta story (2026-09-03, atualização do achado de `admin-saas-isolamento-por-host.md` §3.5):
`app/login/actions.ts` **já** roteia `is_platform_admin === true` para `/platform` (mudança
posterior à data daquele documento, não relacionada a esta story) — **não precisa de alteração**.
O que sobrevive é `packages/web/src/lib/supabase/middleware.ts:135-139`
(`if (user && pathname === "/login") { url.pathname = "/dashboard"; ... }`), que roda **antes** de
qualquer lógica de role e sempre aponta para `/dashboard` — no host admin, um operador já logado
que revisita `/login` bate nesse bounce e cai em 404 (porque `/dashboard` está bloqueado lá).
**Ajustar esse ponto**: quando `papelDoHost(host) === "admin"`, o destino do bounce é `/platform`
em vez de `/dashboard`. No host `"app"`, o destino continua `/dashboard`, **byte a byte igual ao de
hoje**.

**AC6 — As réguas com os controles C1-C5, derivadas do filesystem (não de lista escrita à mão).**
_(C6, o controle do host de tenant, está na AC10 — acrescentada pelo @po.)_
Novo arquivo de teste (nome sugerido: `packages/web/src/lib/tenancy/papel-do-host.test.ts`):
1. Varrer `packages/web/src/app/**/page.tsx` e `**/route.ts` (mesmo idioma de
   `platform-query-scan.ts`/`dashboard-platform-boundary.test.ts` — varredura real, não fixture),
   converter caminho de arquivo em pathname de rota (`[id]` → valor concreto, `(grupo)` removido).
2. Particionar em "sob `/platform` ou `/api/platform`" e "fora".
3. **C1 — vivacidade:** o conjunto "fora de `/platform`" tem **> 100** rotas (medido nesta sessão:
   147 `page.tsx` totais menos 9 sob `/platform` = 138; 332 `route.ts` totais menos 6 sob
   `api/platform` = 326 — os dois muito acima de 100; reconfira no dia da implementação, os números
   crescem).
   _Os quatro números acima foram **medidos** por varredura de `packages/web/src/app/**` contra
   `origin/main` em 2026-09-03 (não escritos de cabeça); `332`/`6` corrigem o `333`/`7` do draft, e o
   derivado não muda: 326 + 138 = 464._
4. Para cada rota de "fora", com `PLATFORM_ADMIN_HOSTS` apontando para um host de teste, asseverar
   `decidirNoHostAdmin({ pathname }).tipo === "bloqueado"`.
5. Para cada rota de "dentro", asseverar `"segue"`.
6. **C2 — controle positivo nomeado:** além do laço, asseverar explicitamente `"bloqueado"` para
   `/dashboard`, `/broker`, `/cliente/x`, `/pasta/x`, `/agendar/x`, `/formulario/x`,
   `/portal-viewer/x`, `/api/cron/keep-alive`, `/api/webhook/whatsapp`.
7. **C3 — controle negativo (o no-op):** com `PLATFORM_ADMIN_HOSTS` vazia, asseverar que *toda*
   rota, em *todo* host, devolve `"segue"` de `papelDoHost`/`decidirNoHostAdmin` combinados (ou
   seja, `papelDoHost` já devolve `"app"` e a decisão nem é consultada — o teste prova isso, não
   assume).
8. **C4 — mutação:** o próprio arquivo de teste documenta, em comentário, que trocar a allowlist
   por "permite tudo" ou o deny-by-default por blocklist precisa deixar a suíte vermelha — não é
   obrigatório automatizar a mutação, mas a régua tem que ser estruturalmente incapaz de passar sob
   essas duas mudanças (allowlist positiva + laço que testa TODAS as rotas fora, não uma amostra).
9. **C5:** asseverar que o destino do bounce de `middleware.ts` (AC5) é `/platform` quando
   `papelDoHost(host) === "admin"` e `/dashboard` quando `"app"` — extraindo a decisão de destino
   para uma função pura testável se o `middleware.ts` não permitir testar o bounce diretamente sem
   `NextRequest`/`NextResponse` reais (ver Dev Notes).

**AC7 — Latência/round-trip: caminho bloqueado não chama `updateSession`.**
Verificável por leitura do `proxy.ts`: a chamada a `updateSession` só acontece depois da decisão
"segue", nunca antes. Sem teste de performance — é garantido pela ordem do código, e o AC4/AC3 já
cobrem a forma da resposta bloqueada.

**AC8 — Nenhuma linha de `platform-guard.ts` muda.**
O gate por host **não é** fronteira de autorização e não substitui `requirePlatformAdmin()` /
`getPlatformAdmin()`. Esta story não toca `lib/tenancy/platform-guard.ts` nem os 7 handlers sob
`api/platform/**`. Confirmar por `git diff` que esses arquivos não aparecem no File List.

**AC9 — Sem a env var, zero desvio (retrocompatibilidade).**
Com `PLATFORM_ADMIN_HOSTS` ausente do ambiente (estado de hoje, em todos os ambientes reais), o
`proxy.ts` produz exatamente a mesma sequência de chamadas de antes desta story — `updateSession`
roda para 100% das requisições, sem branch novo observável. Coberto por C3 (AC6.7).

**AC10 — 🔴 Um host de tenant NUNCA pode ser promovido a host admin, mesmo se a env var mandar.**
_(AC acrescentada pelo @po na validação de 2026-09-03 — ver Change Log.)_

O argumento de segurança inteiro desta story é "reversível por env var, sem deploy". Ele cobre o
caso "liguei e quero desligar". Ele **não** cobre o caso "liguei com o valor errado" — e o valor
errado tem um desfecho que este programa de trabalho proíbe explicitamente: se
`PLATFORM_ADMIN_HOSTS` contiver `crm.trifold.eng.br`, o deny-by-default da AC2 passa a devolver
`"bloqueado"` para as **326 rotas de API e 138 páginas** fora de `/platform`, e o CRM inteiro da
Trifold responde 404. Uma env var digitada errada derruba o host que o plano de arquitetura diz que
**nunca** pode ser aposentado (`whitelabel-e-migracao-jud.md` §4.2/§4.4: PWA instalado, 39
assinaturas de push, e o logo absoluto de todo e-mail já entregue apontam para ele).

`papelDoHost()` **descarta** qualquer host que esteja na lista de hosts de tenant conhecidos, e
devolve `"app"` para ele — mesmo que `PLATFORM_ADMIN_HOSTS` o inclua:
- Constante `HOSTS_DE_TENANT` no próprio `papel-do-host.ts`, contendo hoje `crm.trifold.eng.br`
  (mesma classe de "exceção nomeada, com casa certa e cabeçalho de proveniência" que
  `lib/tenancy/trifold-org.ts` estabeleceu na Story 900-23 — não é um literal solto).
- O descarte é **audível**: `console.error("[900-65] host de tenant recusado em PLATFORM_ADMIN_HOSTS", { host })`.
  Descartar em silêncio transformaria um erro de configuração em "o console admin simplesmente não
  liga", sem ninguém saber por quê.
- **Régua (C6):** com `PLATFORM_ADMIN_HOSTS = "crm.trifold.eng.br,admin.judtecnologia.com.br"`,
  asseverar `papelDoHost("crm.trifold.eng.br") === "app"` **e**
  `papelDoHost("admin.judtecnologia.com.br") === "admin"` — as duas na mesma asserção, porque a
  primeira sozinha fica verde se a função simplesmente parar de funcionar. Asseverar também que
  `decidirNoHostAdmin` nunca é consultada para o host de tenant (a mesma prova de C3).
- **Mutação que reprova:** remover `crm.trifold.eng.br` de `HOSTS_DE_TENANT` deixa a suíte vermelha.

---

## Fora do escopo — explicitamente, para não reabrir por engano

- **Ligar `PLATFORM_ADMIN_HOSTS` em qualquer ambiente** (teste ou produção), anexar o domínio
  `admin.judtecnologia.com.br` na Vercel, emitir certificado, ou rodar as 7 sondas de `curl` do
  doc-fonte (§4.3). Isso é a "Story 2" do plano do `@architect` (`admin-saas-isolamento-por-host.md`
  §9), puramente operacional, sem código.
- **Fechar `/platform` nos hosts de CRM** (simetria). Doc-fonte §3.6: "desligada no primeiro passo,
  ligada num segundo" — deliberadamente depois de verificar que o host admin funciona, para não
  perder o único acesso hoje (`crm.trifold.eng.br/platform`) no mesmo deploy.
- **Marca (título/logo) por host no `layout.tsx`.** É a Story 900-67 desta mesma leva (`isTrifold`
  por `org_id`) mais uma story futura de marca-por-host — não confundir os dois: 900-67 resolve
  qual marca aparece no **e-mail** por `org_id`; a marca do **host admin** (título "Jud" em vez de
  "Trifold CRM" na tela de login de `admin.…`) é trabalho novo, fora desta leva de três, nomeado no
  doc-fonte §8.2 e não rascunhado aqui.
- **`platform_admins` com níveis, `X-Robots-Tag` fora do host admin, trilha de acesso ao console.**
  Fora do recorte dos três itens de fundação.

---

## Tasks / Subtasks

- [x] **Task 1 — `papel-do-host.ts` (AC1, AC2)**
  - [x] `papelDoHost(host)` lendo `process.env["PLATFORM_ADMIN_HOSTS"]` por colchete
  - [x] `decidirNoHostAdmin({ pathname })` com a allowlist da AC2
  - [x] JSDoc no topo do arquivo citando `admin-saas-isolamento-por-host.md` como origem da decisão
        de mecanismo (mesmo padrão de proveniência de `trifold-org.ts`/`fonte-scan.ts`)

- [x] **Task 2 — Integração no `proxy.ts` (AC3, AC4, AC7)**
  - [x] Ler host normalizado de `request.headers.get("host")`
  - [x] Aplicar a decisão ANTES de `updateSession`
  - [x] 404 nu + `X-Robots-Tag: noindex, nofollow` para `"bloqueado"`
  - [x] `NextResponse.rewrite` para `"reescreve"`

- [x] **Task 3 — Bounce de `/login` ciente do host (AC5)**
  - [x] **Extrair** o destino do bounce (`middleware.ts:136`, medido pelo @po em 2026-09-03 —
        `if (user && pathname === "/login")`) para uma **função pura exportada**, p. ex.
        `destinoDoBounceDeLogin(papel: "admin" | "app"): string`. "Parametrizar sem extrair" não
        serve: a C5 da AC6 assevera esse destino num `*.test.ts`, e o bounce só é alcançável de
        dentro de `updateSession`, que exige `NextRequest`/`NextResponse` reais. Sem a extração, a
        C5 nasce sem carrasco
  - [x] Confirmar que `login/actions.ts` genuinely já não precisa de mudança (reconferir a leitura
        desta story antes de tocar o arquivo — não presumir)

- [x] **Task 4 — As 5 réguas (AC6)**
  - [x] Varredura do filesystem (reusar o idioma de `platform-query-scan.ts` se houver helper
        exportável; senão, escrever local — não copiar constantes)
  - [x] C1 vivacidade, C2 controle positivo nomeado, C3 controle negativo (no-op), C4 nota de
        mutação estrutural, C5 destino do bounce

- [x] **Task 4b — Guard do host de tenant (AC10)**
  - [x] `HOSTS_DE_TENANT` em `papel-do-host.ts`, com cabeçalho de proveniência
  - [x] Descarte audível (`console.error`), nunca silencioso
  - [x] C6: as duas asserções na mesma régua (tenant ⇒ `"app"`, host da Jud ⇒ `"admin"`)

- [x] **Task 5 — Conferência manual**
  - [x] `npx vitest run packages/web/src/lib/tenancy/papel-do-host.test.ts packages/web/src/proxy.test.ts`
        **da raiz do repo** (não em CI headless sem rede, se a rede permanecer instável —
        registrar se não rodou).
        ⚠️ O comando que esta Task pedia antes — `pnpm --filter web test -- papel-do-host` —
        **sai rc=0 sem executar nada**: `packages/web/package.json` não tem script `test` (só
        `test:e2e`), e o `vitest.config.ts` vive na raiz. Corrigido pelo achado QA-900-65-6.
  - [x] Ler o diff final e confirmar AC8 (zero linha em `platform-guard.ts` ou nos 7 handlers)

---

## Dev Notes

### Gotchas medidos, já resolvidos por outros arquivos deste repo — siga o precedente
- **Notação de colchete para env não-`NEXT_PUBLIC_` em edge/middleware:** `lib/supabase/middleware.ts:37-47`
  já resolve exatamente este problema para `SUPABASE_URL`/`SUPABASE_ANON_KEY`. Leia esse trecho
  antes de escrever `papel-do-host.ts`.
- **`request.nextUrl.hostname` vs `request.headers.get("host")`:** o doc-fonte §3.1 registra que
  `nextUrl.hostname` pode devolver `localhost` em middleware; use sempre `headers.get("host")`.
- **`matcher` do `proxy.ts` já exclui imagens por extensão** (`.svg/.png/.jpg/.jpeg/.gif/.webp`) —
  o gate nunca vê essas requisições. É um item conhecido e aceito (doc-fonte §8.9), não desta story.

### Onde ficam as coisas
- Novo: `packages/web/src/lib/tenancy/papel-do-host.ts`
- Novo: `packages/web/src/lib/tenancy/papel-do-host.test.ts`
- Tocado: `packages/web/src/proxy.ts` (12 linhas hoje — ver conteúdo atual no repo antes de editar)
- Tocado: `packages/web/src/lib/supabase/middleware.ts` (só o bounce de `/login`, linhas ~135-139
  na leitura desta story — reconfira o número de linha no momento de editar)
- NÃO tocado: `packages/web/src/app/login/actions.ts` (AC5 já explica por quê)

### Testing
- Framework: Vitest, mesmo idioma de `platform-query-scan.test.ts` e
  `dashboard-platform-boundary.test.ts` (varredura do filesystem real, nunca fixture escrita à
  mão para a lista de rotas).
- `include` do `vitest.config.ts` (raiz do repo) casa `*.test.ts` — **não** `.tsx`. Como
  `papel-do-host.ts` é puro TS (sem JSX), isso não é uma armadilha aqui, mas vale registrar como
  lição geral desta leva: qualquer decisão futura que precise virar `.tsx` tem que ter a lógica
  extraída para função pura em `.ts`, senão a suíte nunca roda (precedente:
  `sidebar-nav-brand.ts`, comentário de topo).
- O `vitest.config.ts` também exclui `.aios-core/**` e `node_modules/**` — não relevante aqui, só
  para orientação.
- Rede está instável na sessão em que esta story foi rascunhada — se `pnpm --filter web test` não
  puder ser executado no ambiente do @dev por qualquer bloqueio de ambiente, registrar isso
  explicitamente no Dev Agent Record em vez de declarar sucesso sem ter rodado.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> A chave `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml` (conferido
> nesta sessão). Quality validation via revisão manual apenas. O review automático real deste
> repositório é o GitHub App do CodeRabbit (`.coderabbit.yaml`, dispara em PR contra `main`) — não
> depende desta seção.

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-09-03 | 1.2 | **Correção de número na AC6.3 (@po).** A C1 dizia `333` `route.ts` menos `7` sob `api/platform`; medi eu mesmo contra `origin/main` (`git ls-tree -r`, commit `6a02c523`) e o verdadeiro é **332 menos 6** — um a menos nos dois lados. As outras duas contagens da C1 conferem ao arquivo (`147` `page.tsx`, `9` sob `/platform`), e a partição foi conferida por listagem: os 6 `route.ts` estão todos sob `app/api/platform/`, as 9 `page.tsx` sob `app/platform/`. **Nenhuma conclusão da story muda**: o derivado é idêntico (326 + 138 = 464) e a cardinalidade total 479 = 15 + 464 segue valendo. Acrescentei na AC6.3 a linha de proveniência (medido, contra quê, em que data) — a lição desta onda é que constante escrita de cabeça é a que apodrece, como no "não depende de nada" da 900-67 e no "hoje há um host de inquilino" desta mesma story. Escopo mínimo: só a AC6.3; nenhuma outra AC, task, QA Results ou linha de terceiro tocada; gate segue **PASS**. | Pax (@po) |
| 2026-09-03 | 1.1 | **Consertos do gate CONCERNS (@dev).** Os tres achados fechados; `proxy.ts` e `middleware.ts` NAO foram tocados (hash identico ao commit `c01cfa03`). **QA-900-65-1:** em vez de adotar o host que o gate citou, enumerei a classe e sondei cada candidato — sao **quatro** hosts servindo o CRM (os dois `-teste.vercel.app` tambem, e sao justamente os candidatos naturais da sonda pre-DNS), nao dois; a prosa deixou de afirmar completude e nomeia por que nao pode (alias por deployment e de cardinalidade ilimitada). **QA-900-65-2:** `normalizarHost` corta o ponto final de FQDN e o JSDoc, que afirmava o contrario, foi reescrito com a razao estrutural (a funcao vale nas duas pontas). **QA-900-65-3:** `proxy.test.ts` novo, com o duble um nivel ABAIXO do que o gate propos (`createServerClient` em vez do modulo `updateSession`) — assim `proxy()` e `updateSession()` sao os reais e morrem os **dois** sobreviventes, nao so o primeiro. Bateria re-rodada INTEIRA: **18 mutantes, 18 mortos**, `tsc` rc=0 em todas, controle negativo 39/39 antes e depois. Contraprova medida: M15 e M16 sobrevivem 32/32 a regua so de FORMA. A formulacao do M15 do gate nao compilava (TS2339 por narrowing de codigo inalcancavel) e foi reformulada. Raiz: 319 / 4394 / 6 (baseline 318 / 4385 / 6), lint 0 erros, type-check rc=0, build 5/5. Task 5 corrigida para a invocacao da raiz; **AC6.3 (333/7 em vez de 332/6) NAO tocada — pendencia do @po**. | Dex (@dev) |
| 2026-09-03 | 1.0 | **Implementada (@dev, YOLO).** Módulo novo `lib/tenancy/papel-do-host.ts` com as quatro funções puras mais `HOSTS_DE_TENANT`; gate no `proxy.ts` antes de `updateSession`; bounce de `/login` ciente do host via função extraída. Régua nova de 30 testes, derivada de `readdirSync` sobre `src/app/**`: cardinalidade das duas partições afirmada com número (479 = 15 dentro + 464 fora), três dimensões independentes além da contagem (conservação, unicidade, largura de topo) e alfabeto declarado nas duas camadas. Bateria de 14 mutantes, 14 mortos, `tsc` rc=0 em todas. Três medições divergiram da story e estão registradas nas Completion Notes sem contorno: a contagem crua de `route.ts` (332/6, não 333/7 — derivado idêntico), a linha do bounce (138, não 136) e a reconfirmação de que `login/actions.ts` não precisa de mudança. Duas âncoras acrescentadas além da letra da AC6, com justificativa: sem elas M6, M9, M10, M11 e M12 sobreviveriam. | Dex (@dev) |
| 2026-09-03 | 0.2 | **Validação do @po (GO).** Remedi as 5 afirmações medidas da story contra o código e todas conferem exatamente: `proxy.ts` tem 12 linhas; a notação de colchete tem precedente em `lib/supabase/middleware.ts:36-47`; o bounce de `/login` está na **linha 136** (a story dizia ~135-139); `login/actions.ts:100-101` de fato já roteia `is_platform_admin === true` para `/platform`, confirmando a correção da story ao doc-fonte; e a contagem da C1 bate ao arquivo (`147` `page.tsx`, `9` sob `/platform`; `333` `route.ts`, `7` sob `api/platform`). Duas correções aplicadas: (1) **AC10 nova** — `PLATFORM_ADMIN_HOSTS` com o valor errado (contendo `crm.trifold.eng.br`) derrubaria as 464 rotas do CRM da Trifold em 404, e a story não tinha guard nenhum contra isso; o argumento "reversível por env var" cobria "liguei e quero desligar", não "liguei errado". (2) Task 3 endurecida de "extrair **ou parametrizar**" para **extrair**: a C5 assevera o destino do bounce num `*.test.ts` e o bounce só é alcançável via `updateSession`, então "parametrizar sem extrair" faria a C5 nascer sem carrasco. | Pax (@po) |
| 2026-09-03 | 0.1 | Draft inicial — item 0 dos três itens de fundação do whitelabel. Número `900-65` reconfirmado livre contra `docs/stories/`, `git branch -a`, `git for-each-ref` (heads+remotes) e `gh pr list --state open` (nenhuma referência a `900-65`+ em nenhuma delas, medido em 2026-09-03). Reusa o desenho já medido em `admin-saas-isolamento-por-host.md` (2026-08-31), com uma atualização própria: `login/actions.ts` já roteia `is_platform_admin` para `/platform` (mudança posterior à data daquele doc), então só o bounce de `middleware.ts:/login` precisa de tratamento (AC5) — não os dois pontos que o doc-fonte original previa. | River (@sm) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M context) — @dev (Dex), modo YOLO autônomo.

### Debug Log References
Branch `story/900-65-gate-por-host-do-console`, criada de `origin/main` (sem empilhar nos PRs
em voo #565/#566). Nenhum arquivo comum divergiu.

### Completion Notes

#### O que foi entregue

- **AC1/AC2/AC10** — `packages/web/src/lib/tenancy/papel-do-host.ts` (novo): `papelDoHost()`,
  `decidirNoHostAdmin()`, `decidirPorHost()`, `destinoDoBounceDeLogin()`, `normalizarHost()` e a
  constante `HOSTS_DE_TENANT` com cabeçalho de proveniência (mesma classe de `trifold-org.ts`).
  Env lida por `process.env["PLATFORM_ADMIN_HOSTS"]`, em colchete, **a cada chamada** — sem cache
  de módulo, que faria o gate depender da ordem de importação e as réguas medirem o estado do
  primeiro teste. Descarte de host de inquilino é audível via `console.error`.
- **AC3/AC4/AC7** — `proxy.ts`: decisão antes de `updateSession`; `"bloqueado"` devolve
  `new NextResponse(null, { status: 404 })` com `X-Robots-Tag: noindex, nofollow`;
  `"reescreve"` usa `NextResponse.rewrite`; `"segue"` cai na linha que já existia.
- **AC5** — `lib/supabase/middleware.ts`: o destino do bounce de `/login` passou a ser
  `destinoDoBounceDeLogin(papelDoHost(request.headers.get("host")))`. Função **extraída**, não
  parametrizada, como a Task 3 endurecida exigia.
- **AC6/AC9** — `papel-do-host.test.ts` (novo), 30 testes, com C1 a C6.
- **AC8** — confirmado por `git status`: `lib/tenancy/platform-guard.ts` e
  `app/api/platform/**` não aparecem no escopo. Zero linhas.

#### Como a régua da AC6 evita aprovar o vazio

Ela deriva a lista de rotas de `readdirSync` sobre `src/app/**`, nunca de lista escrita à mão, e
afirma **cardinalidade das duas partições** com número: `ARQUIVOS.length > 400` (medido 479),
`DENTRO.length >= 10` (medido 15), `FORA.length > 100` (medido 464), e as duas `> 0`
explicitamente. Além da contagem, mede **três dimensões independentes**:

1. **Conservação** — `DENTRO + FORA === ARQUIVOS`, partição exaustiva e disjunta.
2. **Unicidade** — nenhum pathname sai duas vezes. Foi ela que matou a mutação do conversor que
   colapsa tudo em `/x` mantendo os 479 (M14): a contagem sozinha não vê essa mutação.
3. **Largura** — os 10 segmentos de topo do produto estão representados. Contagem não distingue
   "464 rotas do produto" de "464 rotas de um diretório só".

**Alfabeto declarado nas duas camadas** (está na tabela do cabeçalho do arquivo de teste): no
**caminho de arquivo** um segmento é `[A-Za-z0-9._-]+` ou `[...]` ou `(...)`; no **pathname** é
`[A-Za-z0-9._-]+` e nada mais. As formas que só a camada de arquivo enxerga — `(grupo)`,
`_privado`, `@slot` — são exatamente onde a régua ficaria cega, e as três estão tratadas:
`(grupo)` tem carrasco sintético (zero ocorrências na árvore real hoje) e `_privado`/`@slot`
fazem o conversor **lançar** em vez de inventar um pathname.

**Esta régua lê o filesystem, não texto-fonte.** As duas únicas asserções que leem fonte estão
marcadas no próprio `it` e leem **código**, com comentário removido por `codigoDe` de
`fonte-scan.ts` — e a do `proxy.ts` mede **posição na pilha** (o 404 e o rewrite antes da chamada
a `updateSession`), não presença de texto, com cada índice conferido contra `-1` antes de entrar
na comparação de ordem.

#### Bateria de mutação — 14 mutantes, 14 mortos, zero sobreviventes

Rodada **inteira, do zero**, depois da versão final da régua. `tsc --noEmit` deu **rc=0 em todas
as 14** antes de qualquer vermelho ser contado. Controle negativo (forma correta) antes e depois:
**30 verdes, 0 vermelhos**. Restauro por `cp` + `shasum -a 256 -c`, só dos arquivos mutados; o
arquivo autorado (`papel-do-host.test.ts`) tem cópia e hash próprios, em diretório separado.

| # | Mutação | Arquivo | Vermelho |
|---|---|---|---|
| M1 | allowlist vira "permite tudo" | `papel-do-host.ts` | 5 |
| M2 | deny-by-default vira blocklist | `papel-do-host.ts` | 5 |
| M3 | `decidirPorHost` sem o return antecipado de `"app"` | `papel-do-host.ts` | 3 |
| M4 | `destinoDoBounceDeLogin` sempre `/platform` | `papel-do-host.ts` | 1 |
| M5 | `HOSTS_DE_TENANT` vazia | `papel-do-host.ts` | 4 |
| M6 | middleware volta ao destino fixo `/dashboard` | `middleware.ts` | 1 |
| M7 | `normalizarHost` sem case-fold | `papel-do-host.ts` | 2 |
| M8 | guarda de inquilino compara o token cru | `papel-do-host.ts` | 1 |
| M9 | `updateSession` antes da decisão | `proxy.ts` | 1 |
| M10 | proxy lê `nextUrl.hostname` | `proxy.ts` | 1 |
| M11 | 404 com corpo e sem `X-Robots-Tag` | `proxy.ts` | 1 |
| M12 | proxy renderiza `not-found` em vez do 404 nu | `proxy.ts` | 1 |
| M13 | conversor devolve lista vazia | `papel-do-host.test.ts` | 8 |
| M14 | conversor colapsa tudo em `/x` | `papel-do-host.test.ts` | 7 |

**M3 é a mutação obrigatória do caminho `"app"`**: ela é o único desvio possível para um host que
não é admin, e mata os 3 testes de não-consulta (C3 e C6). **M13** é o carrasco da vivacidade da
AC6 — sem ele, a régua sobre lista vazia aprovaria tudo. **M14** só morre pela segunda dimensão
(unicidade), não pela contagem.

#### Réguas

- `pnpm lint --force`: **0 erros**, 30 avisos, todos pré-existentes e nenhum em arquivo desta story.
- `pnpm type-check --force`: 8 tasks, **rc=0**.
- `pnpm build`: 5 tasks successful. Não reproduziu o `Ecmascript file had an error` de
  `capi-hashing`.
- Suíte da raiz (`npx vitest run`): **318 arquivos, 4385 passed, 6 expected fail**.
  Baseline local medido nesta mesma árvore com a régua nova excluída: **317, 4355, 6**. Delta
  exato desta story: **+1 arquivo, +30 testes, +0 expected fail**. Contra o baseline da `main`
  (run `33637807839`, sha `f3992973`: 317 / 4369 / 6), a divergência local↔CI é de 14 testes a
  menos localmente — o valor estável desta sessão, causado pelos arquivos alheios sujos na árvore.
- ⚠️ `pnpm --filter web test -- papel-do-host` (o comando da Task 5) **sai rc=0 sem rodar nada**:
  não existe script `test` em `packages/web`. Rodei da raiz, que é onde o `vitest.config.ts` vive.

#### Três afirmações da story que medi e saíram diferentes — sem contornar

1. **C1, contagem crua de `route.ts`:** a story diz "333 `route.ts` totais menos 7 sob
   `api/platform` = 326". Medido em `origin/main` (2026-09-03): **332 totais menos 6 sob
   `api/platform` = 326**. Os dois lados estão um a menos, e o **derivado bate exatamente**
   (326 handlers e 138 páginas fora, 464 no total). A conclusão da AC10 e o piso `> 100` da C1
   não mudam. Provável causa: o @po mediu numa árvore com um handler a mais sob `api/platform`.
2. **Linha do bounce:** o Change Log do @po diz "linha **136**". Em `origin/main` o
   `url.pathname = "/dashboard"` está na **linha 138** (a linha 136 é o `if (user && pathname ===
   "/login")`). A story original dizia "~135-139", que contém as duas.
3. **`login/actions.ts`:** reconferido antes de tocar em nada — `is_platform_admin` já vem na
   mesma consulta e já roteia para `/platform` **antes** de todos os ramos por `role`, com
   precedência declarada em comentário pela Story 900-56. **Nenhuma mudança feita**, como a AC5
   previa.

#### Uma decisão autônoma que a story deixava aberta

`[AUTO-DECISION]` A AC6.9 pede que a C5 assevere o destino do bounce, mas asseverar só a função
pura deixaria `destinoDoBounceDeLogin` livre de nunca ser consumida pelo `middleware.ts` — a
régua ficaria verde com o bounce fixo de volta. Acrescentei uma âncora de **consumo** que lê o
**código** do `middleware.ts` (comentários removidos) e exige a chamada mais a ausência do
destino fixo. Motivo: sem ela a C5 mede a função, não o comportamento. M6 é o carrasco dessa
âncora, e sem a âncora M6 sobreviveria.

Pela mesma razão acrescentei o `describe` de AC3/AC4/AC7 sobre o `proxy.ts`, que a AC7 declarava
"verificável por leitura": M9 (`updateSession` antes da decisão), M10 (`nextUrl.hostname`), M11
(404 com corpo) e M12 (`not-found`) sobreviveriam todas sem ele — e M12 é justamente o defeito
que vazaria a marca da Trifold no host da Jud.

### Rodada de consertos do gate ⚠️ CONCERNS (2026-09-03, @dev)

Três achados fechados. Os dois de código eram **1 linha cada**; o terceiro era régua faltando.

#### QA-900-65-1 (HIGH) — a lista da AC10 era falsa, e a população era maior que a medida

O achado estava certo: `HOSTS_DE_TENANT` tinha um host e a prosa afirmava "Hoje há um".
Antes de aplicar a correção de 1 literal que o gate prescreveu, **enumerei a classe** em vez de
adotar o achado — "que hosts servem o CRM?", não "o host que o gate citou existe?". Levantei os
candidatos por varredura de `*.vercel.app` no repo (envs, docs, configs) e sondei cada um com
`GET /login` + `GET /dashboard`. **São quatro, não dois:**

| Host | `/login` | `/dashboard` | Servia o CRM? |
|---|---|---|---|
| `crm.trifold.eng.br` | 200 `<title>Trifold CRM</title>` | 307 → `/login` | ✅ (já estava) |
| `trifold-crm.vercel.app` | 200 `<title>Trifold CRM</title>` | 307 → `/login` | ✅ (o que o gate achou) |
| `trifold-crm-teste.vercel.app` | 200 `<title>Trifold CRM</title>` | 307 → `/login` | ✅ **novo** |
| `trifold-crm-teste-three.vercel.app` | 200 `<title>Trifold CRM</title>` | 307 → `/login` | ✅ **novo** |
| `trifold-crm-staging.vercel.app` | 404 | — | ❌ (não é o CRM) |
| `staging.trifold-crm.vercel.app` | não resolve | — | ❌ |

Os dois `-teste` são justamente os candidatos mais prováveis para a sonda pré-DNS que o gate
nomeia como cenário de alcance — o operador que quer ver o console antes do DNS pega um alias de
teste, não o de produção.

**A prosa agora não afirma completude, e diz por quê:** a Vercel também publica um alias por
**deployment** (`trifold-{hash}-{team}.vercel.app`), de cardinalidade ilimitada, servindo o mesmo
CRM. Fechá-los exigiria casar por **padrão** em vez de por lista — desenho que esta story não
toma. Consequência nomeada no próprio cabeçalho da constante, para não repetir o defeito de
afirmar mais do que se mediu. Não consegui enumerar os domínios pela API da Vercel: o token da CLI
nesta máquina é da conta `freelans-dev`, e o projeto de produção vive em outra conta (`403 Not
authorized`) — registrado como limite da medição, não contornado.

**Régua:** duas asserções novas na C6, e as duas são necessárias — a primeira prova **presença**
na constante (por literais âncora escritos à mão, nunca derivados de `HOSTS_DE_TENANT`, senão o
teste concordaria com qualquer conteúdo, inclusive com o que o gate reprovou), a segunda prova
**efeito** (para cada host, a env nomeando-o ⇒ `"app"` **e** `console.error` audível ⇒ o token
chegou à guarda, não deixou de casar por acidente).

#### QA-900-65-2 (MEDIUM) — ponto final de FQDN, e o JSDoc que afirmava o contrário

Reproduzido no módulo vivo antes de consertar: `PLATFORM_ADMIN_HOSTS="crm.trifold.eng.br."` +
`Host: crm.trifold.eng.br.` ⇒ **`"admin"`**. `normalizarHost` ganhou `.replace(/\.+$/, "")`
depois da remoção da porta. O JSDoc foi reescrito: ele afirmava que o ponto final "cai em `app`,
o lado seguro", e essa conclusão só valia na direção do **pedido** — na direção da **allowlist**
era o furo. O texto agora nomeia a razão estrutural (a função é aplicada nas duas pontas, então
cada forma que ela não colapsa é furo de guarda) e mantém a exceção que continua verdadeira:
Unicode/punycode só afeta a ponta do pedido, porque nenhuma dessas formas é escrita alternativa
de um literal ASCII de `HOSTS_DE_TENANT`.

Efeito colateral desejado: o ponto final também deixa de quebrar a promoção legítima do host
admin — asseverado no mesmo `it`, para que a normalização seja medida como *colapso*, não como
*descarte*.

#### QA-900-65-3 (MEDIUM) — as âncoras mediam FORMA; agora há carrasco de COMPORTAMENTO

Arquivo novo `packages/web/src/proxy.test.ts` (7 testes, ~140ms). **Nenhuma linha de `proxy.ts` ou
`middleware.ts` mudou nesta rodada** — os dois sobreviventes morreram por régua, não por conserto
de comportamento, e `shasum -a 256` + `git status` confirmam os dois arquivos byte a byte iguais
ao commit `c01cfa03`.

**Onde o dublê foi posto, e por que não onde o gate pôs.** O carrasco do gate dublava
`@web/lib/supabase/middleware` (o módulo `updateSession`) e matava M15 **2/3** — mas deixaria M16
vivo, porque o bounce de `/login` mora **dentro** de `updateSession`. Desci o dublê um nível, para
`createServerClient` de `@supabase/ssr` — a fronteira do Supabase. Com ele aí, `proxy()` **e**
`updateSession()` são os reais em todos os 7 testes, e os **dois** mutantes morrem. Ganho de
brinde: a sonda de NÃO-chamada da AC7 passa a medir o round-trip ao Supabase de verdade (o custo
que a AC7 existe para evitar), não a chamada a uma função intermediária.

**Contraprova, medida nos dois sentidos:**

| | régua só de FORMA (a anterior) | + `proxy.test.ts` |
|---|---|---|
| **M15** (404 incondicional no topo do `proxy()`) | 🟢 32/32 SOBREVIVE | 🔴 **6 vermelhos** |
| **M16** (`url.pathname = "/platform"` após o bounce) | 🟢 32/32 SOBREVIVE | 🔴 **2 vermelhos** |

⚠️ **A formulação do M15 do gate não compilava aqui.** `return` incondicional no topo torna o
resto inalcançável, o `tsc` narrowa `decisao` para `never` e sai
`TS2339: Property 'para' does not exist on type 'DecisaoDeHost'` — rc=2. Vermelho com erro de
compilação não conta, e mutante que não compila também não. Reformulei com um predicado opaco ao
compilador (`request.method !== "___METODO_QUE_NAO_EXISTE___"`), que é incondicional na prática e
deixa o resto alcançável para o `tsc`: rc=0, e aí sim o mutante vale.

#### QA-900-65-6 — o comando inerte da Task 5 (corrigido) e a AC6.3 (**não** corrigida)

A linha de comando da Task 5 foi trocada para a invocação da raiz, com o motivo registrado no
próprio checkbox. **A AC6.3 continua com `333/7` e eu não a toquei**: é texto de AC, e a divergência
já está registrada acima como medida (`332/6`, derivado idêntico: 326 + 138 = 464, nenhuma
conclusão muda). 🔴 **Fica como pendência para o @po**, dono da seção.

#### QA-900-65-4 e QA-900-65-5 (LOW) — dívida nomeada, sem conserto

População **0 medida** nas duas, e as duas são fail-closed:
- `ARQUIVOS_DE_ROTA` não conhece `route.tsx`/`page.ts`/`.js`/`.jsx` — se aparecer um, a régua
  sub-conta, mas o deny-by-default em produção continua negando a rota invisível.
- Rota de interceptação (`(.)foto`, `(..)foto`) vaza para o pathname — e o alfabeto da C1 a
  reprova, deixando a régua **vermelha** em vez de silenciosamente errada.

Não consertei nenhuma das duas: o custo é maior que a dívida e nenhuma tem sítio hoje. Ficam
nomeadas aqui e no gate.

#### Bateria re-rodada INTEIRA — 18 mutantes, 18 mortos

Troca de régua invalida os vermelhos de **todas** as mutações, então nenhum número foi herdado da
rodada anterior. Controle negativo **39/39 verde antes e depois**, `tsc` rc=0 antes de contar
qualquer vermelho, restauro por `cp` + `shasum -a 256 -c` dos 5 arquivos após **cada** mutante, e
o manifesto conferiu em todas as 18 iterações.

| Mutante | Alvo | 🔴 |
|---|---|---|
| M01 allowlist vira "permite tudo" | `papel-do-host.ts` | 6 |
| M02 deny-by-default vira blocklist | `papel-do-host.ts` | 6 |
| M03 `decidirPorHost` sem o return antecipado de `"app"` | `papel-do-host.ts` | 5 |
| M04 `destinoDoBounceDeLogin` sempre `/platform` | `papel-do-host.ts` | 3 |
| M05 `HOSTS_DE_TENANT` vazia | `papel-do-host.ts` | 6 |
| M06 middleware volta ao destino fixo `/dashboard` | `middleware.ts` | 2 |
| M07 `normalizarHost` sem case-fold | `papel-do-host.ts` | 2 |
| M08 guarda de inquilino compara o token cru | `papel-do-host.ts` | 2 |
| M09 `updateSession` antes da decisão | `proxy.ts` | 6 |
| M10 proxy lê `nextUrl.hostname` | `proxy.ts` | 1 |
| M11 404 com corpo e sem `X-Robots-Tag` | `proxy.ts` | 2 |
| M12 proxy reescreve para rota inexistente (`not-found`) | `proxy.ts` | 3 |
| M13 conversor devolve lista vazia | `papel-do-host.test.ts` | 8 |
| M14 conversor colapsa tudo em `/x` | `papel-do-host.test.ts` | 7 |
| **M15 404 incondicional inserido no topo do `proxy()`** | `proxy.ts` | **6** |
| **M16 `url.pathname = "/platform"` após o bounce** | `middleware.ts` | **2** |
| **M17 `HOSTS_DE_TENANT` volta a um host só** | `papel-do-host.ts` | **2** |
| **M18 `normalizarHost` sem o corte do ponto final** | `papel-do-host.ts` | **2** |

M17 e M18 são as contraprovas dos consertos 1 e 2: **são literalmente o código commitado**, e o
código commitado passava 30/30. Os vermelhos vieram das asserções novas, não de efeito colateral.

#### Réguas da rodada de consertos — todas da raiz

- Suíte da raiz: **319 arquivos · 4394 passed | 6 expected fail**. Baseline do gate:
  318 / 4385 / 6. Delta desta rodada: **+1 arquivo, +9 testes, +0 expected fail** — exatamente os
  7 do `proxy.test.ts` e as 2 asserções novas da C6/`normalizarHost`.
- `pnpm lint --force`: **0 erros**, 30 avisos — os mesmos 30 pré-existentes, nenhum em arquivo
  desta story.
- `pnpm type-check --force`: 8 tasks, **rc=0**.
- `pnpm build`: **5 tasks successful**.
- Divergência local↔CI de 14 testes: inalterada, mesma causa (árvore compartilhada com outras
  sessões).

#### A Trifold, byte a byte

O caminho `"app"` não foi tocado — e agora isso é **medido, não lido**: com a env ligada,
`/dashboard`, `/api/webhook/whatsapp`, `/broker` e `/` no host de inquilino alcançam o Supabase
(1 chamada a `createServerClient` cada) e **nenhuma** responde 404; sem a env, até o host admin
alcança; e o bounce de `/login` devolve `/dashboard` no papel `"app"`. As duas mudanças de código
desta rodada só andam na direção segura: `HOSTS_DE_TENANT` maior só move host de `"admin"` para
`"app"`, e o corte do ponto final normaliza igual nas duas pontas, então nenhum host de inquilino
pode virar admin por ele.

### File List

Novos:
- `packages/web/src/lib/tenancy/papel-do-host.ts`
- `packages/web/src/lib/tenancy/papel-do-host.test.ts`
- `packages/web/src/proxy.test.ts` *(rodada de consertos do gate — carrasco comportamental do
  `proxy()`, achado QA-900-65-3)*

Modificados:
- `packages/web/src/proxy.ts`
- `packages/web/src/lib/supabase/middleware.ts`

⚠️ **Na rodada de consertos do gate, `proxy.ts` e `middleware.ts` NÃO foram tocados de novo** —
`shasum -a 256` e `git status` confirmam os dois byte a byte iguais ao commit `c01cfa03`. Os dois
mutantes sobreviventes do gate morreram por **régua nova**, não por mudança de comportamento.

Não tocados, por AC:
- `packages/web/src/lib/tenancy/platform-guard.ts` (AC8)
- `packages/web/src/app/api/platform/**` (AC8)
- `packages/web/src/app/login/actions.ts` (AC5)

---

## QA Results

### Rodada 2 (re-gate do delta) — Gate: ✅ **PASS** — `docs/qa/gates/900.65-gate-por-host-do-console.yml`
**Revisor:** Quinn (Test Architect) · 2026-09-03 · escopo: só o delta dos consertos

#### Os dois refutes: os DOIS procedem — e num deles o erro era meu
- **QA-900-65-1.** Refeitas as sondas: os quatro hosts respondem **200 com
  `<title>Trifold CRM</title>`** em `/login` e **307** em `/dashboard`;
  `trifold-crm-staging.vercel.app` dá 404 e de fato não é o CRM. A tabela da story reproduz byte a
  byte. **"Deixar de afirmar completude" é suficiente para esta story**: nenhuma LISTA fecha uma
  classe infinita, os quatro hosts que um humano escolheria para a sonda pré-DNS estão fechados, e
  o host de cliente já estava. O resíduo virou dívida nomeada (**QA-900-65-8**, LOW). O limite do
  token da Vercel (`403`, outra conta) fica **registrado, não contornado** — a existência do alias
  por deployment permanece declarada, não medida.
- **QA-900-65-3.** As **duas metades** medidas separadamente: **(a)** escrevi o carrasco exatamente
  como o prescrevi (dublê do módulo `@web/lib/supabase/middleware`), apliquei o M16 e ele ficou
  **3/3 VERDE** — minha prescrição era um teste que exigia a cegueira; **(b)** com o dublê dele em
  `createServerClient`, **M15 morre 6🔴 e M16 morre 2🔴**. O nível certo do dublê é a **fronteira
  externa**, não o módulo vizinho.
- **M15 reformulado:** `tsc` **rc=0**, e **incondicional na prática** — medido em 7 métodos HTTP
  (`GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS` = 404). Minha formulação original não compilava (TS2339
  por narrowing de código inalcançável): mutante que não compila não é mutante. Erro meu, aceito.

#### Bateria e contraprova — reproduzidas
`M15` FORMA 🟢**32/32** · comportamento 🔴**6** · `M16` FORMA 🟢**32/32** · comportamento 🔴**2** ·
`M17` 🔴**2** · `M18` 🔴**2** — todas com `tsc` rc=0. M17 e M18 são literalmente o código de
`c01cfa03`, então são contraprova válida dos consertos 1 e 2. Controle negativo **39/39** antes e
depois de cada mutação.

#### `proxy.ts` e `middleware.ts` NÃO foram tocados — confirmado
`sha256` idêntico ao de `c01cfa03` nos dois (`dde5a51b…` e `e1a97511…`), e nenhum dos dois aparece
em `git status`. Os sobreviventes morreram **por régua**. (Nota: não existe
`packages/web/src/middleware.ts` — o arquivo é `lib/supabase/middleware.ts`.)

#### A Trifold, reproduzida
Com a env ligada, as 4 rotas do host de inquilino alcançam o Supabase (1 chamada cada) e nenhuma é
404; sem a env, até o host admin alcança; o bounce devolve `/dashboard` no papel `"app"` e
`/platform` no `"admin"`, na mesma asserção.

#### Réguas — idênticas ao declarado
**319 · 4394 passed | 6 expected fail** (+1 arquivo, +9 testes: 7 do `proxy.test.ts` + 2 da C6/AC1)
· `lint --force` 0 erros/30 avisos · `type-check --force` rc=0 · `build` 5/5. Restauro por `cp` +
`shasum -a 256 -c`, manifesto 5/5 OK ao fim.

#### Um achado novo, que **não bloqueia** — QA-900-65-7 (MEDIUM, população 0)
O carrasco novo é comportamental de verdade (status, headers, corpo, `location`, contagem de
chamadas — zero `toContain` sobre fonte). Mas o predicado do caminho `"app"` é `not.toBe(404)`, que
é o dano do **M15**, não o dano geral. Medido: inserção **depois** de `await updateSession(request)`
devolvendo `redirect("/manutencao")` para todo `crm.trifold.eng.br` exceto `/login` passa
**39/39 com `tsc` rc=0** — e derruba 100% do tráfego não-`/login` do cliente. **População 0 hoje**
(`proxy.ts` é byte a byte o já validado). Conserto medido nos dois sentidos: comparar
`[status, location]` de `proxy(req)` com o de `updateSession(req)` direto — 🔴 sob o mutante,
🟢 no código limpo.

#### Pendência que não é do @dev
**AC6.3 segue com `333/7`.** Medido agora: **332** `route.ts` / **6** sob `api/platform`; derivado
**idêntico** (326 + 138 = 464). É seção do @po e o @dev fez certo em não tocar. **Não bloqueia** —
a régua C1 lê o filesystem, não o texto da AC.

**Décima oitava armadilha:** *o dublê que viabiliza a mutação apaga o defeito irmão.* Ao prescrever
um dublê, pergunte "que código deixa de executar por causa dele?" — se algum defeito da story mora
nessa região, o dublê está alto demais.

---

### Gate: ⚠️ CONCERNS — `docs/qa/gates/900.65-gate-por-host-do-console.yml`
**Revisor:** Quinn (Test Architect) · 2026-09-03 · branch `story/900-65-gate-por-host-do-console`, 1 commit sobre `origin/main`

#### O caminho `"app"` — provado por comportamento, não por leitura
O padrão de prova exigido (a Trifold byte a byte igual) foi verificado **chamando o `proxy()` real
com `NextRequest` real**, fora da árvore: host de inquilino recebe `updateSession` em 4/4 rotas
(`/dashboard`, `/api/webhook/whatsapp`, `/broker`, `/`); **sem** a env, até
`admin.judtecnologia.com.br/dashboard` recebe `updateSession`; o bounce devolve `/dashboard` no
papel `"app"`. `M3` reproduzido: **3 vermelhos**, `tsc` rc=0.

#### Réguas reproduzidas
318 arquivos · 4385 passed | 6 expected fail (**idêntico ao declarado**) · arquivo da story 30/30 ·
`lint --force` 0 erros/30 avisos · `type-check --force` rc=0. Restauro por `cp` + `shasum -a 256 -c`
conferido após **cada** mutação; `git status` dos 4 alvos limpo ao fim.

#### Mutantes
- **Reproduzidos:** `M3` 3🔴 · `M12` 1🔴 · `M13` 8🔴 · `M14` 7🔴 — todos com `tsc` rc=0.
- **`M14b` (novo, deste gate):** conversor truncando o pathname em 2 segmentos — preserva 479/15/464,
  conservação, alfabeto e largura, e morre **só** na unicidade (+ o carrasco sintético): **2🔴**.
  A tese da AC6 se sustenta e fica mais forte que o próprio `M14` (que também morre por contagem,
  porque `DENTRO` esvazia). A **AC6 não é suspeita**.
- **Censo da AC6 conferido item a item:** 479 = 15 + 464 ✅ · 333 segmentos distintos, zero fora do
  alfabeto ✅ · zero `(grupo)` (carrasco sintético justificado) ✅ · 55 diretórios `_*` com **zero**
  arquivo de rota dentro ✅ · lê filesystem, e as 2 asserções de fonte leem **código** e **posição**,
  cada índice contra `-1` dentro do `it` ✅.
- **As duas âncoras extras: escopo legítimo, não invenção.** Não acrescentam comportamento de
  produto; são medição, e sem elas `M6`, `M9`, `M10`, `M11` e `M12` ficavam sem carrasco — inclusive
  o `M12`, o vazamento de marca. A ressalva é a **natureza** delas, abaixo.

#### As três divergências registradas: todas confirmadas
1. `origin/main` tem **332** `route.ts` e **6** sob `api/platform`; derivado idêntico (326 + 138 = 464).
   Nenhuma conclusão muda.
2. `url.pathname = "/dashboard"` está na linha **138** de `origin/main`; a **136** é o `if`.
3. `login/actions.ts` intocado e já roteando `is_platform_admin` para `/platform`. **AC8 confirmada**
   por `git diff`: 5 arquivos, nenhum deles `platform-guard.ts` nem `api/platform/**`.

#### Concerns (detalhe e conserto no gate)
- **QA-900-65-1 · HIGH — a lista da AC10 está incompleta e a prosa é falsa.** `HOSTS_DE_TENANT` diz
  "hoje há um"; medido: `https://trifold-crm.vercel.app/login` responde **200 com
  `<title>Trifold CRM</title>`**, e `papelDoHost` devolve **`"admin"`** para ele se a env o nomear.
  População: **≥1 host real**, e o cenário de alcance é a story de ativação (sonda pré-DNS num alias
  `*.vercel.app`). Conserto: 1 linha + 1 asserção.
- **QA-900-65-2 · MEDIUM — ponto final de FQDN evade a guarda.** Env `crm.trifold.eng.br.` + `Host`
  na mesma forma ⇒ `"admin"`. O JSDoc do `normalizarHost` afirma o oposto. Conserto: 1 linha.
- **QA-900-65-3 · MEDIUM — as âncoras do `proxy.ts`/bounce são régua de FORMA.** Dois mutantes de
  inserção passam **30/30 com `tsc` rc=0** e desviam o caminho `"app"` (um deles: 404 para 100% das
  requisições de `crm.trifold.eng.br`). O carrasco comportamental existia: escrito neste gate em
  ~30 linhas, mata o mutante **2/3**.
- **QA-900-65-4/5 · LOW (dívida, população 0):** varredura cega a `route.tsx`/`page.ts`; rotas de
  interceptação `(.)`/`(..)` vazam para o pathname — mas o alfabeto da C1 as reprova (fail-closed).
- **QA-900-65-6 · LOW (dono: @po):** a Task 5 manda rodar `pnpm --filter web test`, que **sai rc=0
  sem executar nada** (não existe script `test` em `packages/web`); e a AC6.3 segue com 333/7.

**Décima sétima armadilha:** *a normalização é medida só na direção do pedido.* A função é usada nas
duas pontas (host que chega e token da allowlist), e a conclusão "forma estranha cai no lado seguro"
só vale na ponta do pedido. Caixa e porta são colapsadas — e testadas; o ponto final não é.
