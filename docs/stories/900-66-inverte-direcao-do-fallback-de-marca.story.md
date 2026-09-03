# Story 900-66 — Sob flag desligada, os fallbacks de URL/marca deixam de resolver para a Trifold quando ninguém sabe a resposta

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Fundação do whitelabel de três camadas — item **1** dos três itens que "mudam a
  direção da falha" (`docs/architecture/whitelabel-e-migracao-jud.md`, §2.3, §5, §8.2).
- **Story:** 900-66 — número reconfirmado livre em 2026-09-03 (mesma verificação da 900-65: maior
  story existente é `900-64`, nenhuma referência a `900-65`/`900-66` em branches, refs remotos ou
  PRs abertos).
- **Status:** Ready for Review
- **Priority:** P0 — é o invariante estrutural do épico: "enquanto houver uma org, falha para a
  Trifold é o estado seguro. A partir da segunda, o estado seguro passa a ser falhar para o neutro
  ou falhar fechado — nunca para a marca de outro cliente" (`whitelabel-e-migracao-jud.md` §2.3).
  Toda story de whitelabel que vier depois desta herda o vazamento se a direção não for trocada
  antes.
- **Complexity:** M — mecanicamente repetitivo (a maioria dos sítios é a mesma linha de código
  copiada 23 vezes), mas com dois desenhos de resolver DIFERENTES (URL vs. texto) e uma auditoria
  ponto a ponto do tratamento de erro em cada chamador. Sob flag **desligada por padrão** — risco
  de produção é nenhum enquanto a flag não for ligada (fora do escopo desta story).

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @dev (Dex), pré-commit.
- **Quality Gate Tools:** `[code_review]`. Sem `migration_review` (nenhuma migration — nenhum dos
  sítios em escopo grava dado; ver "Fora do escopo" para os que gravam).

---

## User Story
**Como** dono do produto preparando a plataforma para o primeiro tenant real,
**eu quero** que os pontos do código que hoje "não sabem a resposta e assumem a Trifold" passem a
poder falhar fechado (sob uma flag, desligada por padrão),
**para que** nenhum tenant novo receba, por omissão, um link, uma URL de e-mail ou um nome que
pertence à Trifold.

---

## O invariante, e por que é um item de arquitetura, não uma lista de bugs

`whitelabel-e-migracao-jud.md` §2.3 nomeia o padrão: **39 ocorrências em 31 arquivos** têm a forma
`X ?? "…Trifold…"` ou `cond ? "…Trifold…" : …`. É **correto hoje** (uma org só, a resposta certa
por acaso é sempre a mesma) e vira **vazamento de marca no instante em que existirem duas orgs**.

Esta story **remedeu o número contra o código**, porque a régua deste repositório é "recontar
pega erro que a citação de outro documento não pega" (lição já registrada:
`feedback_remedir_numeros_contra_o_banco`). O resultado, medido em 2026-09-03 com
`git grep`/regex sobre `packages/web/src` (excluindo `*.test.ts`), **diverge** do "39 em 31" do
doc-fonte, e a divergência tem 5 causas nomeadas abaixo — cada uma é uma correção ao doc-fonte, não
um erro desta story.

### O que ENTRA — 29 ocorrências em 25 arquivos

> ⚠️ **Corrigido pelo @po em 2026-09-03 (era "28 em 24").** A régua de `grep` abaixo é impecável e
> reproduz exatamente 27 em 23 — mas a **lista que ela produz é incompleta**, e o próprio doc-fonte
> já dizia isso: `whitelabel-e-migracao-jud.md` **§4.4** nomeia dois sítios que esta régua não
> alcança. Um deles é um fallback genuíno da classe alvo (o **sítio 28**, abaixo). Ver Change Log.

| Classe | Ocorr. | Arq. | Exemplo |
|---|---:|---:|---|
| **URL** — casados pela régua de `grep` | 27 | 23 | `api/leads/[id]/reativar/route.ts:24` |
| **URL** — **invisível à régua** (cadeia multilinha, aspas simples) | 1 | 1 | `app/login/actions.ts:160-164` |
| **Texto** — nome do corretor cai para `"Trifold"` quando `appUser.name` está vazio | 1 | 1 | `lib/whatsapp/opening-context.ts:56` |

A lista completa dos 27 sítios de URL está na seção "Os 27 sítios de URL" abaixo — **não redigida à
mão sem mostrar a régua**: é o resultado literal de
```
grep -rnE 'process\.env\.NEXT_PUBLIC_(APP|SITE)_URL\s*\?\?\s*"https://crm\.trifold\.eng\.br"' packages/web/src --include='*.ts' --include='*.tsx'
```
rodado em 2026-09-03 contra a árvore de trabalho desta sessão (`story/900-15-migrar-rotas-pii`,
sincronizada — reconferir contra `origin/main` no dia da implementação, mesma disciplina da
`admin-saas-isolamento-por-host.md` §1.1).

### 🔴 Sítio 28 — `app/login/actions.ts:160-164`, achado pelo @po lendo o doc-fonte §4.4

Este sítio **não** aparece no `grep` acima, por duas razões que não têm nada a ver com ele ser
menos importante:
1. É uma cadeia de **quatro** termos, quebrada em **cinco linhas** — o `??` final e o literal ficam
   em linhas diferentes, e a régua é `grep` linha a linha.
2. O literal usa **aspas simples**, e a régua exige aspas duplas.

Estado medido em 2026-09-03:
```ts
const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  headersList.get('origin') ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://crm.trifold.eng.br'
```
É **exatamente** o padrão que esta story existe para corrigir — e é o mais consequente dos 28: é a
base do **link de recuperação de senha** (`${baseUrl}/auth/callback?token_hash=…`, linha 213). Com
um segundo tenant, o e-mail de "redefina sua senha" de outra empresa levaria a pessoa para
`crm.trifold.eng.br`.

**Tratamento nesta story:** entra no escopo, com a diferença de que o resolver recebe o valor **já
composto pelos três primeiros termos** — a precedência env → `origin` → env existe por um motivo
medido e comentado no próprio arquivo (Server Actions recebem `origin` vazio em produção), e não
pode ser reordenada aqui:
```ts
const baseUrl = resolveAppUrlFallback(
  process.env.NEXT_PUBLIC_SITE_URL ?? headersList.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL
)
```

**A régua também é corrigida** (AC10): passa a varrer o arquivo inteiro como texto, não linha a
linha, e a aceitar as duas formas de aspas — do contrário a régua desta story continuaria cega
exatamente ao sítio que ela deixou passar.

---

### O que fica FORA, e por quê — 6 correções ao "39 em 31" do doc-fonte

| # | Sítio(s) | Por que fica fora desta story |
|---|---|---|
| 1 | `sidebar-nav-brand.ts` (`resolveSidebarBrand`) | **Já está corrigido.** É o próprio doc-fonte que o descreve como "o único com teste" (§2.3) — implementado na Story 900-64. Incluí-lo aqui seria reabrir trabalho fechado. |
| 2 | `lib/email-layout/components/header.ts:14,17` (`isTrifold` por regex) | É o alvo **exclusivo** da Story 900-67 (o item 2 desta mesma leva de três). Incluir aqui duplicaria o trabalho e criaria dois donos para o mesmo arquivo. |
| 3 | 4 sítios de `apt.location ?? "Stand Trifold"` (`app/broker/agenda/page.tsx:325`, `app/dashboard/agenda/page.tsx:390`, `app/agendar/cancelar/[token]/page.tsx:121`, `api/appointments/route.ts:171`) | Pertencem ao **item 10** da tabela do doc-fonte (`whitelabel-e-migracao-jud.md` §5, linha "`Stand Trifold` e defaults gravados em dado"), que é **dado já gravado** (17 de 98 `appointments` têm o literal na coluna) e exige expand→migrate→contract — mecanismo diferente de uma flag de leitura. Story futura, não esta. |
| 4 | `api/cron/daily-report/route.ts:65` (`DAILY_REPORT_ORG_ID ?? trifoldOrgId()`) | **Medido e excluído deliberadamente.** Não é o mesmo padrão de risco: o comentário do próprio arquivo (linhas 40-53) explica que esta composição existe para **restringir** `DAILY_REPORT_RECIPIENTS` (canal global, sem destino por org) à org da Trifold — sem ela, os telefones da Trifold receberiam métricas de **todas** as empresas. Inverter a direção aqui **criaria** o vazamento que o Story 900-23 fechou, não o contrário. `trifoldOrgId()` é uma exceção nomeada e vigiada por `trifold-org-literal.test.ts` — não mexer. |
| 5 | `api/cron/billing-reminders/route.ts:92,94` (`` `[Trifold] Fatura VENCIDA…` ``) | **Falso positivo do padrão.** Não é um fallback de ambiguidade — é um literal **incondicional em todos os ramos** do ternário (vencida / vence hoje / vence em N dias todos dizem `"[Trifold]"`); não há ramo "não-Trifold" com o qual comparar. É alerta de billing interno enviado a **todos** os admins ativos, sem filtro `org_id` ("dado da plataforma", comentário do próprio arquivo) — é candidato a virar `"[Jud]"` diretamente (sem condicional), classe de trabalho do censo geral do épico, não desta story. |

| 6 | `lib/notificacoes.ts:764` (`const CRM_BASE = "https://crm.trifold.eng.br"`) + 5 sítios de **texto exibido** (`app/broker/instalar/page.tsx:46,131,193`, `app/dashboard/configuracoes/corretores/novo/page.tsx:179`, `api/cron/billing-reminders/route.ts:81`) | **Acrescentado pelo @po.** `CRM_BASE` é nomeado pelo doc-fonte §4.4 junto com o sítio 28, mas **não é um fallback**: é constante incondicional, sem `??`, sem env — não há ramo "não sei" para redirecionar. Mesma classe do `"[Trifold]"` da linha 5 desta tabela. Os 5 de texto exibido são cópia para o olho humano ("acesse crm.trifold.eng.br pelo Safari"), não roteamento. **Todos os 6 ficam fora, mas ficam NOMEADOS na AC10** — a régua os declara como residual esperado, em vez de não os enxergar. |

`api/cron/billing-reminders/route.ts:30` (`const APP_URL = … ?? "https://crm.trifold.eng.br"`)
**continua dentro** do escopo — é o mesmo padrão mecânico de URL dos outros 26 sítios, mesmo
estando no mesmo arquivo dos dois excluídos acima; a exclusão é específica às linhas 92/94, não ao
arquivo inteiro.

**`packages/ai` fica inteiramente fora desta story, por instrução explícita do coordenador desta
missão** (não é achado meu). Note a tensão: o próprio doc-fonte, §2.3, lista
`packages/ai/src/prompts/index.ts:84-88` (5 slugs cujo fallback do banco é a persona hard-coded da
Trifold, padrão `overrides?.["…"] || PERSONALITY_PROMPT`) como um dos exemplos do invariante dos
"39 em 31". Ou seja, o próprio conjunto que o doc-fonte cita como "39" **inclui** pelo menos um
sítio de `packages/ai` — e esta story, seguindo a instrução recebida, **não o toca**. Isso não é
uma omissão silenciosa: fica registrado aqui, e nenhuma AC desta story afirma cobrir os "39"
originais — cobre os **28** medidos e listados acima, com as 5 exclusões justificadas.

---

## Acceptance Criteria

**AC1 — Flag única, desligada por padrão.**
Env var `TENANT_FALLBACK_FAIL_CLOSED` (booleana, string `"true"`/ausente), lida por
`process.env["TENANT_FALLBACK_FAIL_CLOSED"] === "true"` (notação de colchete, mesmo padrão da
Story 900-65 — mesma razão: alguns dos 24 arquivos em escopo rodam em rota de API/cron do Node,
não do edge, então o gotcha do bundle do proxy não se aplica universalmente aqui, mas a
consistência de estilo entre as duas stories da mesma leva vale mais do que a distinção). Ausente
⇒ comportamento **byte a byte igual ao de hoje**, em todos os 28 sítios.

**AC2 — Resolver de URL: um só, para os 27 sítios.**
Novo arquivo `packages/web/src/lib/tenancy/app-url-fallback.ts`, exportando:
```ts
export function resolveAppUrlFallback(envValue: string | undefined): string
```
- `envValue` não-vazio ⇒ devolve `envValue`, **sempre**, independente da flag (dormente hoje,
  igual ao doc-fonte §4.5 já registrava — nenhuma das duas rotas depende de flag quando a env está
  setada).
- `envValue` ausente/vazio e `TENANT_FALLBACK_FAIL_CLOSED` **não** é `"true"` ⇒ devolve o literal
  de hoje, `"https://crm.trifold.eng.br"`.
- `envValue` ausente/vazio e `TENANT_FALLBACK_FAIL_CLOSED === "true"` ⇒ **lança**
  `AppUrlIndisponivelError` (classe de erro nova, exportada do mesmo módulo). **[AUTO-DECISÃO]**
  "neutro da Jud" vs. "falhar fechado" → **falhar fechado** (reason: o doc-fonte §4.5 registra que
  não há domínio Jud confirmado nem resolução DNS medida nesta sessão — inventar uma URL neutra
  seria uma string sem lastro; lançar erro é auditável, não finge um domínio que pode não existir,
  e é exatamente a opção que `whitelabel-e-migracao-jud.md` §2.3 oferece como alternativa
  igualmente válida: "falhar para o neutro da Jud **ou** falhar fechado").

**AC3 — Os 28 call sites de URL passam a usar o resolver, sem mudar a assinatura pública de cada função.**
Os 27 sítios listados na seção "Os 27 sítios de URL" **mais o sítio 28** (`app/login/actions.ts:160-164`,
com a forma composta descrita na seção própria dele). Cada um troca
`process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.trifold.eng.br"` (ou a variante `SITE_URL`) por
`resolveAppUrlFallback(process.env.NEXT_PUBLIC_APP_URL)` (ou `SITE_URL`, conforme o sítio).

**AC4 — Tratamento de erro auditado por sítio, e o que acontece DEPOIS do `catch` é definido.**
_(Reescrita pelo @po em 2026-09-03 — a versão 0.1 dizia "capturar, logar e não interromper o
restante do fluxo", sem dizer com que URL o fluxo continua. Todos os 28 sítios existem para
**montar um link** que vai num e-mail ou numa mensagem; "continuar" sem URL produz
`undefined/broker/leads/x` na caixa de entrada de um cliente — pior do que o vazamento que a story
quer fechar, e silencioso. Ver Change Log.)_

Para cada um dos 28 sítios, o @dev confirma (e registra no Dev Agent Record, um por um) se a
chamada já está dentro de um bloco best-effort (try/catch que loga e segue, sem derrubar o
restante — padrão já documentado nos crons de billing e em `notificacoes.ts`) ou se é um caminho
sem proteção. **Não adivinhar a estrutura de nenhum arquivo** — ler cada um antes de editar.

**A regra do desfecho, uniforme nos 28: quem não tem URL não envia.** Ao capturar
`AppUrlIndisponivelError`, o sítio **abandona o envio daquela mensagem/e-mail** — não monta link
com string vazia, não monta link parcial, não cai para nenhum literal. Loga estruturado
(`console.error("[900-66] app-url indisponível — envio abortado", { sitio, orgId? })`, usando o
padrão de log já existente no arquivo) e **não derruba o restante do laço** (nas rotas que iteram
orgs ou destinatários, o erro de um item continua isolado dos outros, como hoje).

Isso é "falhar fechado" de verdade e é coerente com a AC2: a flag ligada significa *não sei qual é
a URL desta org*, e a única resposta honesta a isso é **não mandar a mensagem**, não mandar uma
mensagem quebrada. Enquanto a flag estiver desligada (padrão, e o estado de todo ambiente real
nesta story), nenhum destes caminhos é alcançável.

**AC5 — Resolver de texto: corretor-name, org-aware, para `opening-context.ts:56`.**
Este sítio é diferente dos 27: tem `appUser.org_id` disponível no escopo do chamador
(`loadOpeningContext`), e `lib/tenancy/trifold-org.ts` já expõe `trifoldOrgId()`. Novo export no
mesmo módulo `app-url-fallback.ts` (ou um segundo arquivo pequeno, `nome-corretor-fallback.ts`, à
escolha do @dev — não é decisão que precise de duas alternativas na story):
```ts
export function resolveCorretorFallbackName(input: { orgId: string; flagLigada: boolean }): string
```
- `flagLigada === false` ⇒ sempre `"Trifold"` (literal de hoje, byte a byte, para **qualquer**
  org — é o comportamento atual, incondicional).
- `flagLigada === true` e `input.orgId === trifoldOrgId()` ⇒ `"Trifold"` (byte-idêntico para a
  Trifold real, mesmo com a flag ligada).
- `flagLigada === true` e `input.orgId !== trifoldOrgId()` ⇒ `"Equipe"`. **[AUTO-DECISÃO]** termo
  genérico em vez de tentar buscar o nome real da org (reason: `loadOpeningContext` não carrega
  `organizations.name` hoje, e adicionar uma query só para este fallback rar-de-acontecer
  extrapolaria o escopo de "mudar a direção" para "adicionar capacidade nova" — fica para uma story
  de e-mails/mensagens transacionais com marca real, mesma classe de trabalho que a 900-67
  explicitamente não assume).
`lib/whatsapp/opening-context.ts:56` passa a chamar
`resolveCorretorFallbackName({ orgId: appUser.org_id, flagLigada: process.env["TENANT_FALLBACK_FAIL_CLOSED"] === "true" })`
em vez de `appUser.name?.trim() || "Trifold"` — preservando `appUser.name?.trim() ||` como
primeira tentativa (nome real do corretor continua vencendo; o resolver só decide o fallback).

**AC6 — Snapshot: flag desligada ⇒ literal de hoje, nos 28 sítios.**
Suíte nova, `packages/web/src/lib/tenancy/app-url-fallback.test.ts`:
- `resolveAppUrlFallback(undefined)` sem a flag ⇒ `"https://crm.trifold.eng.br"` (string exata).
- `resolveAppUrlFallback("")` sem a flag ⇒ idem (string vazia é "ausente", mesmo tratamento de
  `??`/`||` que o código de hoje já dá).
- `resolveCorretorFallbackName({ orgId: trifoldOrgId(), flagLigada: false })` ⇒ `"Trifold"`.
- `resolveCorretorFallbackName({ orgId: "qualquer-outro", flagLigada: false })` ⇒ `"Trifold"`
  também (a flag desligada é incondicional — é o ponto central do AC).

**AC7 — Snapshot: flag ligada ⇒ direção nova.**
- `resolveAppUrlFallback(undefined)` com a flag ligada ⇒ lança `AppUrlIndisponivelError`.
- `resolveAppUrlFallback("https://qualquer.com")` com a flag ligada ⇒ devolve
  `"https://qualquer.com"` inalterado (env setada sempre vence, com ou sem flag — AC2).
- `resolveCorretorFallbackName({ orgId: trifoldOrgId(), flagLigada: true })` ⇒ `"Trifold"`.
- `resolveCorretorFallbackName({ orgId: "org-fictícia-qualquer", flagLigada: true })` ⇒
  `"Equipe"`.

**AC8 — Controle: usar o literal cru da Trifold em teste novo é proibido — importar `trifoldOrgId()`.**
`packages/web/src/lib/tenancy/trifold-org-literal.test.ts` (Story 900-23) vigia que o UUID
`"00000000-0000-0000-0000-000000000001"` só apareça nos arquivos declarados nela. Qualquer teste
novo desta story que precise do org id da Trifold **importa `trifoldOrgId()`** — nunca hardcoda o
literal. Se, por algum motivo, um arquivo novo precisar conter o literal diretamente, ele **tem**
que ser adicionado à lista declarada em `trifold-org-literal.test.ts` (`TESTES_AUTORIZADOS`), com
justificativa — do contrário a suíte da 900-23 fica vermelha.

**AC9 — `pnpm --filter web test` de verdade, não `rc=0` vazio.**
Confirmar, ao rodar a suíte nova, que os testes desta story efetivamente aparecem na saída (nome
do arquivo, contagem de `it`s > 0) — é uma das doze armadilhas catalogadas nesta leva
(`pnpm --filter web test` saindo `rc=0` sem rodar nada). Se a rede instável impedir a execução
nesta sessão de draft, isso é tarefa do @dev, não desta validação de draft.

**AC10 — 🔴 O carrasco de ALCANCE: a suíte falha se qualquer sítio ficar para trás.**
_(AC acrescentada pelo @po em 2026-09-03 — ver Change Log.)_

As AC6/AC7 testam o **resolver isolado**. Nenhuma delas fica vermelha se o @dev migrar 21 dos 28
sítios e esquecer 7: o resolver continua correto, os 8 casos continuam passando, e a story fecha
com 25% do trabalho não feito e verde. É a armadilha "régua que prende presença mas não alcance",
e o §5 (item 1) do doc-fonte pede explicitamente prova sobre os **sítios**, não sobre a função.

Régua nova em `app-url-fallback.test.ts`, sobre o **código-fonte de produção**:
1. Usar `arquivosDeProducao()` e `linhasDeCodigo()` de `@web/lib/tenancy/fonte-scan` para varrer
   `packages/web/src`. `linhasDeCodigo()` remove comentários — obrigatório, porque `notificacoes.ts`
   tem **6 comentários** contendo `crm.trifold.eng.br` e uma régua de texto cru os contaria como
   sítios (armadilha "comentário enganando régua de texto-fonte").
2. Casar o literal `crm.trifold.eng.br` no **arquivo inteiro como texto**, não linha a linha, e
   aceitar aspas simples **e** duplas — é a correção da régua que deixou o sítio 28 passar.
3. Montar um `Map<arquivo, contagem>` do residual e asseverar na forma de conjunto:
   ```ts
   expect([...residual.keys()].sort()).toEqual(RESIDUAL_DECLARADO.sort())
   ```
   **`.toEqual` sobre as chaves ordenadas, nunca `.has(x)`** — `.has` só prova que os declarados
   estão lá, e fica verde com 7 arquivos a mais que ninguém migrou.
4. `RESIDUAL_DECLARADO` é exatamente a tabela "O que fica FORA" desta story, com um comentário por
   entrada dizendo qual linha da tabela a autoriza:
   `header.ts` (900-67) · `notificacoes.ts` (`CRM_BASE`, linha 6) ·
   `billing-reminders/route.ts` (linha 81, texto exibido) · `broker/instalar/page.tsx` ·
   `dashboard/configuracoes/corretores/novo/page.tsx`.
5. **C-vivacidade:** asseverar que o residual **antes** da migração seria > 20 arquivos — ou, de
   forma mais barata e igualmente viva, asseverar que `RESIDUAL_DECLARADO.length` é 5 **e** que a
   varredura devolveu pelo menos um arquivo (uma régua que varre zero arquivo por erro de caminho
   passa verde contra lista vazia; esta não).
6. **Mutação que reprova:** reverter **um** dos 28 sítios para o literal deixa a suíte vermelha,
   nomeando o arquivo. O @dev registra no Dev Agent Record que rodou essa mutação e viu vermelho —
   não que "a régua parece correta".

**AC11 — CON herdado, registrado para a story que ligar a flag.**
Os 6 sítios com `SITE_URL` (`brokers` ×2, `admin/clientes/[id]/senha`, `users/[id]/reset-password`,
`admin-invite`, `appointment-email-reminders`) **mais o sítio 28** alimentam o `redirectTo` de
convite/recuperação do Supabase. `whitelabel-e-migracao-jud.md` §4.3 mede que `site_url` e
`uri_allow_list` são **globais do projeto Supabase, não por org**, e que um host fora da lista faz o
Supabase **descartar o redirect em silêncio** e jogar o usuário no `site_url` — ou seja, na Trifold.
Esta story não resolve isso (é configuração de projeto, não código) e não promete resolver; o que
ela faz é **nomear**: qualquer URL que o resolver venha a devolver para um tenant precisa estar na
`uri_allow_list` **antes** de a flag ser ligada, senão trocar o fallback não muda o destino real do
usuário. Registrar como CON na story futura que ligar `TENANT_FALLBACK_FAIL_CLOSED`.

---

## Os 27 sítios de URL (lista completa — a régua que sustenta "27 em 23")

| # | Arquivo | Linha | Variável de env |
|---:|---|---:|---|
| 1 | `app/api/brokers/route.ts` | 132 | `SITE_URL` |
| 2 | `app/api/brokers/route.ts` | 291 | `SITE_URL` |
| 3 | `app/api/leads/[id]/reativar/route.ts` | 24 | `APP_URL` |
| 4 | `app/api/leads/[id]/transferir/route.ts` | 13 | `APP_URL` |
| 5 | `app/api/admin/clientes/[id]/senha/route.ts` | 75 | `SITE_URL` |
| 6 | `app/api/agendar/[token]/route.ts` | 15 | `APP_URL` |
| 7 | `app/api/users/[id]/reset-password/route.ts` | 31 | `SITE_URL` |
| 8 | `app/api/cron/billing-monthly-summary/route.ts` | 33 | `APP_URL` |
| 9 | `app/api/cron/billing-reminders/route.ts` | 30 | `APP_URL` |
| 10 | `app/api/cron/billing-collection-health/route.ts` | 35 | `APP_URL` |
| 11 | `app/api/cron/bolsao-rebalance/route.ts` | 16 | `APP_URL` |
| 12 | `app/api/cron/sla-alerts/route.ts` | 61 | `APP_URL` |
| 13 | `app/api/cron/nicole-agenda-reconcile/route.ts` | 44 | `APP_URL` |
| 14 | `app/api/cron/appointment-email-reminders/route.ts` | 7 | `SITE_URL` |
| 15 | `app/api/cron/billing-cost-anomaly/route.ts` | 30 | `APP_URL` |
| 16 | `app/api/cron/nicole-health/route.ts` | 76 | `APP_URL` |
| 17 | `lib/notificacoes.ts` | 233 | `APP_URL` |
| 18 | `lib/notificacoes.ts` | 318 | `APP_URL` |
| 19 | `lib/notificacoes.ts` | 429 | `APP_URL` |
| 20 | `lib/portal/conversa.ts` | 85 | `APP_URL` |
| 21 | `lib/broker/notify-price-escalation.ts` | 78 | `APP_URL` |
| 22 | `lib/broker/notify-on-reply.ts` | 103 | `APP_URL` |
| 23 | `lib/tenancy/admin-invite.ts` | 271 | `SITE_URL` |
| 24 | `lib/relacionamento/notify-relationship.ts` | 26 | `APP_URL` |
| 25 | `lib/relacionamento/notify-relationship-on-reply.ts` | 13 | `APP_URL` |
| 26 | `lib/roleta/notify-broker.ts` | 63 | `APP_URL` |
| 27 | `lib/roleta/notify-broker.ts` | 369 | `APP_URL` |

Todos sob `packages/web/src/`. Números de linha medidos em 2026-09-03 — reconferir contra
`origin/main` (ou a base de merge) no dia da implementação; código muda, a lista pode precisar de
±1-2 linhas de ajuste, mas a régua de contagem (`grep -rnE` da seção acima) é o que revalida o
conjunto, não esta tabela por si.

---

## Fora do escopo

- Os 5 sítios excluídos da seção "O que fica FORA" (já justificados um a um).
- Todo `packages/ai` (instrução explícita do coordenador; tensão registrada acima).
- Ligar `TENANT_FALLBACK_FAIL_CLOSED` em qualquer ambiente real — story futura, e depende de uma
  decisão de produto sobre o que fazer quando o resolver lança `AppUrlIndisponivelError` em cada
  um dos 27 call sites em produção (a AC4 desta story só garante que o erro é capturado e logado,
  não decide a UX/observabilidade final de "URL indisponível" em cada fluxo).
- Escolher um domínio real para a Jud. Sem isso, "neutro da Jud" não é implementável com lastro —
  por isso a AC2 escolheu "falhar fechado".

---

## Tasks / Subtasks

- [x] **Task 1 — `app-url-fallback.ts`: resolver de URL (AC1, AC2)**
  - [x] `resolveAppUrlFallback(envValue)` + `AppUrlIndisponivelError`
  - [x] Leitura da flag por colchete

- [x] **Task 2 — Migrar os 28 sítios (AC3, AC4)**
  - [x] Para cada linha da tabela "Os 27 sítios de URL": ler o arquivo, confirmar proteção de erro
        existente ou adicionar, trocar a expressão pelo resolver
  - [x] **Sítio 28** — `app/login/actions.ts:160-164`, na forma composta da seção própria dele
        (preservar a precedência env → `origin` → env; ela existe por um motivo comentado no arquivo)
  - [x] Registrar no Dev Agent Record, sítio a sítio, se já havia try/catch ou se foi adicionado,
        **e qual é o desfecho do `catch`** (AC4: abandona o envio, não monta link parcial)

- [x] **Task 3 — Resolver de texto do corretor (AC5)**
  - [x] `resolveCorretorFallbackName`
  - [x] Trocar `opening-context.ts:56`

- [x] **Task 4 — Testes (AC6, AC7, AC8, AC9)**
  - [x] `app-url-fallback.test.ts` com os 8 casos das AC6/AC7
  - [x] Confirmar que nenhum teste novo hardcoda o UUID da Trifold (AC8) — importar `trifoldOrgId()`
  - [x] Rodar `pnpm --filter web test` e colar a contagem real de testes no Dev Agent Record

- [x] **Task 4b — Carrasco de alcance (AC10)**
  - [x] Varredura de `packages/web/src` com `arquivosDeProducao()`/`linhasDeCodigo()` de
        `lib/tenancy/fonte-scan.ts` (comentários removidos), arquivo inteiro como texto, as duas aspas
  - [x] `expect([...residual.keys()].sort()).toEqual(RESIDUAL_DECLARADO.sort())` — **nunca `.has()`**
  - [x] Rodar a mutação (reverter 1 sítio) e **colar o vermelho** no Dev Agent Record

- [x] **Task 5 — Auditoria de exclusão**
  - [x] Confirmar por `git diff` que os 6 grupos da tabela "O que fica FORA" **não** aparecem no
        File List desta story — e que os 5 arquivos de `RESIDUAL_DECLARADO` (AC10.4) são exatamente
        os mesmos que a tabela autoriza

---

## Dev Notes

### Por que dois resolvers, não um genérico
URL e nome-de-corretor têm formas de falha diferentes: URL vazia sem env é ambígua até o momento
em que alguém tenta usá-la (por isso "falhar fechado" faz sentido — melhor um erro alto do que um
link quebrado silencioso num e-mail); nome de corretor vazio SEMPRE tem um valor de exibição válido
(mesmo "Equipe" é um texto renderizável). Generalizar os dois num resolver só criaria um tipo de
retorno `string | never` disfarçado — mais confuso do que dois exports pequenos.

### Onde ficam as coisas
- Novo: `packages/web/src/lib/tenancy/app-url-fallback.ts`
- Novo: `packages/web/src/lib/tenancy/app-url-fallback.test.ts`
- Tocados: os 23 arquivos únicos da tabela "Os 27 sítios de URL" + `lib/whatsapp/opening-context.ts`
- NÃO tocados: `lib/tenancy/sidebar-nav-brand.ts`, `lib/email-layout/components/header.ts`,
  `app/broker/agenda/page.tsx`, `app/dashboard/agenda/page.tsx`,
  `app/agendar/cancelar/[token]/page.tsx`, `api/appointments/route.ts`,
  `api/cron/daily-report/route.ts`, `packages/ai/**`. `api/cron/billing-reminders/route.ts:92,94`
  também não — só a linha 30 desse arquivo muda.

### Sobreposição de arquivos com a Story 900-67 — sequenciar, não paralelizar
_(Acrescentado pelo @po.)_ As duas stories desta leva dizem "**Depende de:** nada", e é verdade em
termos de lógica — mas **5 arquivos são tocados pelas duas**: `app/api/brokers/route.ts`,
`app/api/admin/clientes/[id]/senha/route.ts`, `app/api/users/[id]/reset-password/route.ts`,
`lib/tenancy/admin-invite.ts`, `app/api/cron/appointment-email-reminders/route.ts` — mais
`app/login/actions.ts`, que passou a ser tocado pelas duas por causa do sítio 28. As duas mexem em
**linhas diferentes** de cada um (900-66 na leitura de env; 900-67 na chamada de
`renderPasswordActionEmail`/`renderBaseLayout`), então não há conflito semântico — mas há conflito
de merge quase garantido se forem para PRs concorrentes. **Recomendação:** merge sequencial,
900-66 → 900-67, e a 900-67 rebasa. Não é bloqueio de nenhuma das duas.

### Precedente de proveniência
Documentar no topo de `app-url-fallback.ts` a origem da decisão (mesmo padrão de
`fonte-scan.ts`/`trifold-org.ts`): cita `whitelabel-e-migracao-jud.md` §2.3 e esta story.

### Testing
- Vitest, `packages/web/src/lib/tenancy/app-url-fallback.test.ts`.
- `trifold-org-literal.test.ts` roda na mesma suíte — qualquer violação da AC8 quebra ele, não o
  teste novo desta story. Rodar a suíte inteira de `lib/tenancy/`, não só o arquivo novo, antes de
  marcar a story como pronta.

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
| 2026-09-03 | 0.3 | **Implementada (@dev).** Censo remedido contra `origin/main` (`f3992973`): a régua reproduz 27 em 23, mais o sítio 28 e o sítio da AC5 = **29 sítios em 25 arquivos**, todos migrados. Novo `lib/tenancy/app-url-fallback.ts` concentra a decisão. AC4 auditada e registrada uso a uso (30 usos de URL). AC10 vermelho→verde por **duas** mutações; a segunda prova que a cegueira foi consertada: com o sítio 28 revertido para aspas simples em 5 linhas, o `grep` herdado conta **0** e a régua nova fica vermelha nomeando o arquivo. Réguas: `tsc` rc=0 · lint 0 erros/30 warnings (= baseline) · `pnpm test` da raiz 318/4379+6 · build verde. **Três desvios da letra registrados**, o principal sendo `RESIDUAL_DECLARADO` com 6 entradas em vez de 5 — a sexta é o próprio resolver, que precisa conter o literal por ser o destino dos 28. | Dex (@dev) |
| 2026-09-03 | 0.2 | **Validação do @po — NO-GO na v0.1, corrigido para GO.** Confirmei contra o código, uma a uma, as afirmações da story: a régua de `grep` reproduz **exatamente 27 em 23**; as 5 exclusões conferem todas (`sidebar-nav-brand.ts` existe em `components/layout/` e foi corrigido na 900-64; `header.ts:14` é o regex alvo da 900-67; os 4 `"Stand Trifold"` estão nas linhas citadas, e o 4º — `api/appointments/route.ts:171` — é o **sítio de escrita**, o que confirma expand→migrate→contract; os 3 ramos do ternário de `billing-reminders:92,94` dizem `"[Trifold]"`, sem ramo não-Trifold, confirmando "literal incondicional"). **A exclusão do `daily-report` está certa e é a mais importante:** o comentário do arquivo (linhas 68-73) e a Story 900-23 (linhas 421-422) dizem, com essas palavras, que sem a condição *"os telefones em `DAILY_REPORT_RECIPIENTS` receberiam o relatório de TODAS as orgs — vazamento de métricas de negócio criado pela própria correção"*. Aplicar a regra em lote ali teria desfeito uma proteção. Precisão: o vazamento não é um bug que a 900-23 *fechou*; é uma armadilha que a migração da 900-23 *criaria* e que ela preveniu no mesmo movimento — a conclusão operacional ("não mexer") não muda. **Três correções aplicadas:** (1) 🔴 **sítio 28** — `app/login/actions.ts:160-164` é um fallback genuíno da classe alvo (base do link de recuperação de senha), invisível à régua porque a cadeia é multilinha e usa aspas simples; o doc-fonte §4.4 **já o nomeava** e a story o perdeu. Régua impecável, lista incompleta. Entrou no escopo, e a régua da AC10 foi desenhada para não repetir a cegueira. (2) 🔴 **AC10 nova** — não havia carrasco de **alcance**: migrar 21 de 28 sítios deixava a suíte inteira verde. (3) 🟠 **AC4 reescrita** — dizia "capturar, logar e não interromper", sem dizer com que URL o fluxo segue; todos os 28 sítios montam um link, então "seguir" produziria link quebrado em e-mail de cliente. Agora: quem não tem URL **não envia**. Mais AC11 (CON do `uri_allow_list` global, §4.3) e uma nota de sequenciamento com a 900-67 (6 arquivos em comum). | Pax (@po) |
| 2026-09-03 | 0.1 | Draft inicial — item 1 dos três itens de fundação do whitelabel. Número reconfirmado livre (mesma verificação da 900-65). Remedido o "39 em 31" do doc-fonte contra o código: 28 ocorrências reais em 24 arquivos entram no escopo (27 URL + 1 texto), com 5 exclusões justificadas (900-64 já corrigido, header.ts é da 900-67, "Stand Trifold" é dado gravado — item 10 do doc-fonte, `daily-report`'s `trifoldOrgId()` é escopo deliberado e não um vazamento, `billing-reminders` linhas 92/94 são literal incondicional, não fallback de ambiguidade). `packages/ai` excluído por instrução do coordenador — tensão com o próprio doc-fonte registrada explicitamente. | River (@sm) |

---

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M context) — @dev (Dex), modo YOLO autônomo.

### Contexto de execução
- **Branch:** `story/900-66-inverte-direcao-do-fallback-de-marca`, criada de `origin/main` em
  `f3992973`.
- **Baseline do CI** (run **33637807839**, `headSha f3992973` — o MESMO commit que é a base desta
  branch): `lint` 0 erros / 30 warnings · `type-check` verde · `test` **317 arquivos, 4369
  passed + 6 expected fail (4375)**.
- ⚠️ **A árvore de trabalho é compartilhada**: 6 arquivos de outra frente
  (`webhook/whatsapp/route.ts` + teste, `lib/meta/process-lead.ts` + teste,
  `lib/tenancy/webhook-org.ts` + teste) estão modificados e **não foram tocados nem commitados**.
  Eles explicam a divergência entre o número local e o do CI — medida agora em **−14 testes**,
  exatamente o valor previsto no briefing.

### Censo remedido contra `origin/main` (não contra o dia do draft)
A régua de `grep` da story reproduziu **27 ocorrências em 23 arquivos** na base desta branch —
igual ao que o @po mediu. Somados o **sítio 28** (`app/login/actions.ts`) e o sítio de texto da
AC5 (`opening-context.ts`), o escopo executado é **29 sítios em 25 arquivos**.

### AC4 — auditoria sítio a sítio: proteção que já existia e desfecho do "sem URL"
Nenhum arquivo foi editado sem ser lido antes. **Regra uniforme: quem não tem URL não envia** —
nenhum sítio monta link vazio, parcial, nem cai para literal.

| # | Sítio | Proteção que já existia | Desfecho quando não há URL |
|---:|---|---|---|
| 1 | `api/brokers/route.ts:132` | nenhuma (e-mail após o `insert`) | `return 201` com o corretor criado; o convite não sai |
| 2 | `api/brokers/route.ts:291` | `if (linkData?…)` | `generateLink` nem é chamado; criação de usuário/broker segue |
| 3 | `api/leads/[id]/reativar:263` | `void … .catch` | push não sai; reativação e 200 inalterados |
| 4 | `api/leads/[id]/transferir:103` | `void … .catch` | push não sai; transferência e resposta inalteradas |
| 5 | `api/admin/clientes/[id]/senha:75` | `return 500` em erro de link | **503** com mensagem — rota staff síncrona, quem clicou precisa saber |
| 6 | `api/agendar/[token]:304` | `void … .catch` | push aos usuários imob não sai; WhatsApp (sem link) segue |
| 7 | `api/users/[id]/reset-password:31` | `return 500` em erro de link | **503**; resolvido **antes** de criar conta no Auth |
| 8 | `cron/billing-monthly-summary:102` | nenhuma | `skipped: app_url_indisponivel`; **dedup do período não é reivindicado** |
| 9 | `cron/billing-reminders:105` (builder) | `.catch` por destinatário | `skipped`; nenhum `last_alerted_on` carimbado |
| 10 | `cron/billing-reminders:229` (push) | `.catch` por destinatário | idem (mesma guarda, antes do laço) |
| 11 | `cron/billing-collection-health:209` | `.catch` por destinatário | `skipped`, sem dedup consumido |
| 12 | `cron/bolsao-rebalance:222` | `try` por org | pré-aviso da org não sai; `preAvisoSent=false`; demais orgs seguem |
| 13 | `cron/bolsao-rebalance:308` | `try` por org | `return false` — o contrato que a função já tem para "nenhum envio" |
| 14 | `cron/sla-alerts:233` (corretor) | `try` por org + `.catch` | não envia **e não marca** `sla_alerta_corretor_em`: marcar sem enviar suprimiria para sempre um alerta que nunca houve |
| 15 | `cron/sla-alerts:259` (gestor) | `try` por org + `.catch` | push não sai; WhatsApp de escalonamento e `markGestor` seguem (aconteceram) |
| 16 | `cron/nicole-agenda-reconcile:242` | `try` por org | Telegram não sai; o caso continua **gravado** em `system_events` |
| 17 | `cron/appointment-email-reminders:74` | `try` por compromisso | só o e-mail **ao lead** (que carrega o botão) não sai; o do corretor segue |
| 18 | `cron/billing-cost-anomaly:60,76,247` | `.catch` por destinatário | `skipped` antes do laço; nenhum marcador gravado |
| 19 | `cron/nicole-health:364` | `logEventOnce` | `continue` — `{{1}}` é o link, e `{{1}}` vazio derruba o template (75-356) |
| 20-22 | `lib/notificacoes.ts:233,318,429` | `try` best-effort | `return` — o mesmo desfecho que a pausa do portal já usa acima |
| 23 | `lib/portal/conversa.ts:85` | `try` best-effort | `return`; push e e-mail existem só para levar à conversa |
| 24 | `lib/broker/notify-price-escalation.ts:78` | `try` best-effort | `return` |
| 25 | `lib/broker/notify-on-reply.ts:103` | `try` best-effort | `return` |
| 26 | `lib/tenancy/admin-invite.ts:271` | retorno tipado `failed` | `status:"failed"` com mensagem — a UI não afirma um envio que não houve |
| 27 | `lib/relacionamento/notify-relationship.ts:26` | `.catch` por canal | `return`; o e-mail é literalmente um `<a href>` para esta URL |
| 28 | `lib/relacionamento/notify-relationship-on-reply.ts:54` | `try` best-effort | `return` |
| 29 | `lib/roleta/notify-broker.ts:63` | nenhuma | `return result` (`push/email/whatsapp` todos `false`) — os **três** canais levam o deep link |
| 30 | `lib/roleta/notify-broker.ts:369` | `Promise.allSettled` | `return` |
| **28** | `app/login/actions.ts:160-164` | retorno genérico anti-enumeração | `return genericSuccess` — **não envia**, e a resposta continua indistinguível (AC3 da 75-139) |
| AC5 | `lib/whatsapp/opening-context.ts:56` | — | não lança: devolve `"Equipe"`; `appUser.name` continua vencendo |

> A tabela tem 30 linhas de URL porque quatro arquivos têm **dois usos** cada — os 27 sítios do
> `grep` são pontos de *declaração*, e a AC4 pede o desfecho de cada *uso*.

### Vermelho → verde (mutação, AC10.6)
`tsc --noEmit` **rc=0** antes de contar cada vermelho. Restauro por `cp` + `shasum -c` — nunca
`git checkout --`.

1. **Mutante 1** — `lib/roleta/notify-broker.ts`, reverter `const appUrl = base.url` para o literal:
   `tsc rc=0`; suíte **1 failed | 23 passed**, com
   `AssertionError: expected [ …(7) ] to deeply equal [ …(6) ]` e `+ "lib/roleta/notify-broker.ts"`.
   Restaurado: `shasum -c` **OK**.
2. **Mutante 2 — o que prova que a cegueira foi consertada** — `app/login/actions.ts`, reverter
   o sítio 28 para a cadeia de 5 linhas com **aspas simples**:
   - a régua **herdada** (o `grep -rnE` da story) conta **0** — segue cega;
   - a régua **nova** (AC10) fica vermelha e nomeia `+ "app/login/actions.ts"`.
   Restaurado: `shasum -c` **OK**.

### Réguas
| Régua | Resultado |
|---|---|
| `pnpm --filter web type-check` | **rc=0** (`tsc --noEmit`, sem saída) |
| `pnpm --filter web lint` | **0 erros, 30 warnings** — idêntico ao baseline do CI |
| `pnpm test` (**da raiz**, nunca `--filter web`) | **318 arquivos, 4379 passed + 6 expected fail (4385)** |
| `pnpm --filter web build` | verde |
| Suíte nova isolada | `app-url-fallback.test.ts` — **24 testes**, todos passando |

Conferência da contagem: `4369 + 24 (suíte nova) − 14 (frente alheia na árvore) = 4379`. O `+1`
arquivo é exatamente `app-url-fallback.test.ts`.

⚠️ Antes do `type-check` foi preciso apagar `packages/web/.next/types` e `.next/dev/types`:
sobraram do checkout anterior (a branch da 900-64) e apontavam para uma rota que não existe em
`origin/main` — dois `TS2307` que não são desta story. Cache de build, não versionado.

### Três desvios da letra das AC, todos medidos
1. 🔴 **`RESIDUAL_DECLARADO` tem 6 entradas, não 5** (AC10.4/10.5). A sexta é
   `lib/tenancy/app-url-fallback.ts`, o módulo que esta story cria: ele **precisa** conter o
   literal, porque é para onde os 28 apontam agora. A AC foi escrita antes de o resolver existir.
   Não é uma exclusão a mais — é o destino da migração, e o teste ainda afirma que o literal
   aparece ali **uma vez só**. Alternativa recusada: esconder o módulo da varredura, que seria
   afrouxar a régua para caber no número em vez de corrigir o número.
2. 🟠 **Os call sites chamam `tentarAppUrl(env, sitio)`, não `resolveAppUrlFallback(env)` cru**
   (letra da AC3). `resolveAppUrlFallback` **lança**; espalhá-lo cru pelos 28 sítios produziria
   exatamente os 500 que a AC4 proíbe. `tentarAppUrl` é uma casca de 12 linhas em volta dele que
   devolve `{ok:false}` — e a escolha do desfecho fica **visível na linha seguinte de cada
   sítio** (`return 503`, `continue`, `return result`), que é o que a AC4 manda auditar. O
   `catch` é estreito: qualquer erro que não seja `AppUrlIndisponivelError` continua propagando,
   e há um `it` que mede isso pelo `try` (não pelo argumento).
3. 🟡 **Env setada como string vazia passa a ser tratada como ausente.** O código de hoje usa
   `??`, que devolveria `""` e produziria `"/dashboard"` como link absoluto num e-mail. É a
   direção segura, é o que a AC6 prescreve, e o repositório tem **dois** incidentes de env
   gravada vazia em silêncio pela CLI da Vercel. Com env preenchida — todo ambiente real — a
   saída é byte a byte a de hoje.

### O que NÃO consegui provar
- **Que a flag ligada se comporta bem em runtime.** Nada nesta story liga
  `TENANT_FALLBACK_FAIL_CLOSED` em ambiente nenhum, e os 30 desfechos acima são alcançáveis
  **apenas** com ela ligada. O que está provado é o desenho (unitário) e o alcance (estático);
  o comportamento fim-a-fim de um cron abortando envio **não** foi exercitado.
- **A AC11 continua sendo uma restrição declarada, não medida.** Não consultei o
  `uri_allow_list` do projeto Supabase (produção é só-leitura por Management API nesta sessão, e
  a lista é configuração de projeto). O CON fica registrado para a story que ligar a flag.
- **A prova de "byte a byte" é por construção e por teste unitário**, não por comparação de saída
  real: não há ambiente com a Trifold em pé nesta sessão para diffar e-mail contra e-mail.
- **CodeRabbit não executado** — o CLI falha nesta máquina (`WebSocket closed`); o gatilho real é
  o GitHub App, no PR.

### Debug Log References
Nenhuma entrada — nenhum bloqueio de 3 tentativas.

### Completion Notes
- Um módulo novo concentra a decisão: `lib/tenancy/app-url-fallback.ts`, com
  `resolveAppUrlFallback`, `AppUrlIndisponivelError`, `tentarAppUrl` e
  `resolveCorretorFallbackName`. O UUID da Trifold **não** aparece nele (AC8): importa
  `trifoldOrgId()`.
- Task 5 (auditoria de exclusão) conferida por `git diff --name-only`: **zero** arquivos entre
  `sidebar-nav-brand.ts`, `header.ts`, os quatro do `"Stand Trifold"`, `daily-report/route.ts`,
  `broker/instalar/page.tsx`, `corretores/novo/page.tsx` e `packages/ai/**`. Em
  `billing-reminders/route.ts` a única linha com "Trifold" removida é a **30**; as **81/92/94**
  seguem intactas.
- Nenhum commit inclui os 6 arquivos da outra frente. `git add` foi path a path, nunca `-A`;
  nenhum `git stash`; nenhum `git push`.

### File List
**Novos (2)**
- `packages/web/src/lib/tenancy/app-url-fallback.ts`
- `packages/web/src/lib/tenancy/app-url-fallback.test.ts`

**Modificados (24)**
- `packages/web/src/app/api/brokers/route.ts`
- `packages/web/src/app/api/leads/[id]/reativar/route.ts`
- `packages/web/src/app/api/leads/[id]/transferir/route.ts`
- `packages/web/src/app/api/admin/clientes/[id]/senha/route.ts`
- `packages/web/src/app/api/agendar/[token]/route.ts`
- `packages/web/src/app/api/users/[id]/reset-password/route.ts`
- `packages/web/src/app/api/cron/billing-monthly-summary/route.ts`
- `packages/web/src/app/api/cron/billing-reminders/route.ts`
- `packages/web/src/app/api/cron/billing-collection-health/route.ts`
- `packages/web/src/app/api/cron/bolsao-rebalance/route.ts`
- `packages/web/src/app/api/cron/sla-alerts/route.ts`
- `packages/web/src/app/api/cron/nicole-agenda-reconcile/route.ts`
- `packages/web/src/app/api/cron/appointment-email-reminders/route.ts`
- `packages/web/src/app/api/cron/billing-cost-anomaly/route.ts`
- `packages/web/src/app/api/cron/nicole-health/route.ts`
- `packages/web/src/app/login/actions.ts`
- `packages/web/src/lib/notificacoes.ts`
- `packages/web/src/lib/portal/conversa.ts`
- `packages/web/src/lib/broker/notify-price-escalation.ts`
- `packages/web/src/lib/broker/notify-on-reply.ts`
- `packages/web/src/lib/tenancy/admin-invite.ts`
- `packages/web/src/lib/relacionamento/notify-relationship.ts`
- `packages/web/src/lib/relacionamento/notify-relationship-on-reply.ts`
- `packages/web/src/lib/roleta/notify-broker.ts`
- `packages/web/src/lib/whatsapp/opening-context.ts`

_(25 modificados contando `opening-context.ts`, que é o sítio da AC5 e não de URL.)_

---

## QA Results
_A preencher pelo @qa durante o gate._
