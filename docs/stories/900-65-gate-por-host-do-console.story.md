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
   147 `page.tsx` totais menos 9 sob `/platform` = 138; 333 `route.ts` totais menos 7 sob
   `api/platform` = 326 — os dois muito acima de 100; reconfira no dia da implementação, os números
   crescem).
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
  - [x] `pnpm --filter web test -- papel-do-host` localmente (não em CI headless sem rede, se a
        rede permanecer instável — registrar se não rodou)
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

### File List

Novos:
- `packages/web/src/lib/tenancy/papel-do-host.ts`
- `packages/web/src/lib/tenancy/papel-do-host.test.ts`

Modificados:
- `packages/web/src/proxy.ts`
- `packages/web/src/lib/supabase/middleware.ts`

Não tocados, por AC:
- `packages/web/src/lib/tenancy/platform-guard.ts` (AC8)
- `packages/web/src/app/api/platform/**` (AC8)
- `packages/web/src/app/login/actions.ts` (AC5)

---

## QA Results
_A preencher pelo @qa durante o gate._
