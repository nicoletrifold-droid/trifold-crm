# Story 75-299 — Error boundary do /dashboard (`app/dashboard/error.tsx`)

**Story ID:** 75-299
**Epic:** 75 (CRM Trifold) · **Status:** Ready for Review · **Estimativa:** S (~2 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, next build, repro manual]
- **Tipo:** dívida técnica de resiliência (rede de segurança de UI, revelada pela 75-298)

---

## Story

Como **usuário logado do CRM (gerente no /dashboard, corretor no /broker)**, quero **que uma
falha inesperada numa tela troque só o conteúdo daquela tela por um aviso em português com botão
"Tentar novamente" — mantendo o menu e a navegação de pé** —, porque hoje qualquer exceção não
tratada num server component me joga na página de erro genérica do Next (em inglês, sem menu,
sem caminho de volta a não ser o botão voltar do navegador).

Origem: **follow-up C-1 (severity `medium`)** do QA gate da 75-298 —
`docs/qa/gates/75.298-dashboard-filtro-tarefas-drill-down.yml` (seção `concerns`, id `C-1`) e a
seção *QA Results* de `docs/stories/75-298-dashboard-filtro-tarefas-drill-down.story.md`.
A 75-298 introduziu **de propósito** um caminho de erro que propaga (o fetch de `lead_tasks`
quando `tasks=` está na URL — decisão "barulho > número mentiroso", que o @qa julgou **correta**);
o que faltava não era a escolha, era o boundary. **A dívida é do diretório inteiro, não da 75-298.**

---

## Context

### O que existe hoje (conferido no código em `main` @ `db0a8572`, 12/08)

- **`/dashboard` e `/broker` não têm NENHUM error boundary.** `find packages/web/src/app -name
  "error.tsx" -o -name "global-error.tsx"` devolve exatamente 2 arquivos, ambos no portal do
  cliente:
  - `packages/web/src/app/cliente/[obra_id]/error.tsx`
  - `packages/web/src/app/cliente/[obra_id]/mensagens/error.tsx`
  - **Não existe `global-error.tsx` em lugar nenhum** — essa parte do relato do @qa está correta.
- ⚠️ **Correção ao C-1 (anti-alucinação):** o gate afirma "NÃO existe `error.tsx` em nenhum lugar
  de `packages/web/src/app`". **Falso** — existem os 2 acima. O que é verdade, e é o que importa
  para esta story: **nas duas áreas internas logadas (`/dashboard` e `/broker`) não há nenhum**.
  Bônus: esses 2 arquivos já fixam o padrão em pt-BR ("Erro ao carregar a página." +
  "Tentar novamente" + `console.error` em `useEffect` + exibição do `digest`) — logo isto é
  **REUSE de um padrão da casa**, não invenção.
- **O caminho que hoje LANÇA de verdade** (server component → sem boundary → tela genérica do
  Next): `fetchAllLeads` faz `if (error) throw error`
  (`packages/web/src/lib/analytics/fetch-all-leads.ts:46`) e é chamado de **UM único server
  component**: `packages/web/src/app/dashboard/leads/page.tsx:251-258` (o caminho novo da 75-298,
  só com `tasks=`).
- ⚠️ **Correção do @po (anti-alucinação):** o draft afirmava que
  `app/dashboard/analytics/page.tsx` era o "2º server component" que usa `fetchAllLeads`.
  **Falso** — `analytics/page.tsx` **não importa** `fetchAllLeads`; a única menção lá é um
  **comentário** na linha 476 (*"Quando encostar, usar `fetchAllLeads`"*). Conferido: `grep -rn
  "fetchAllLeads" packages/web/src` + a lista de `import` do arquivo.
  Os outros consumidores de `fetchAllLeads` **não são server components** e por isso **não são
  cobertos** por `error.tsx`: `app/api/analytics/executive/route.ts`,
  `app/api/analytics/leads-by-period/route.ts` (route handlers → devolvem 500 em JSON, o
  boundary nem entra) e `lib/analytics-report-data.ts` (PDF do relatório).
  → A necessidade medida é **1 caminho**, e 1 caminho já basta: é o caminho que a 75-298 acabou
  de criar na tela de maior uso do gerente. Mas o argumento é "1 medido", **não** "2 medidos".
- Em `/broker/leads/page.tsx:76-82` o fetch de `lead_tasks` **degrada** (`const [{ data: leads },
  { data: pendingTasks }, …]` — o `error` é descartado e todo consumo é `pendingTasks ?? []`),
  não lança — ou seja, no `/broker` a necessidade é **hipotética**; no `/dashboard` é medida.
- **O shell das duas áreas é idêntico**, e isso decide o desenho visual:
  - `dashboard/layout.tsx:304-330` → `<div className="min-h-screen bg-stone-50 dark:bg-stone-950">`
    + `<SidebarNav/>` + `<main className="lg:pl-56"><div className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-8 lg:py-8 lg:pb-8">{children}</div></main>`
  - `broker/layout.tsx:87` → **o mesmo** `bg-stone-50 dark:bg-stone-950` + o mesmo `<main className="lg:pl-56">` com o mesmo container.
  - Consequência: o boundary entra **no lugar do `{children}`, dentro do container já padded** →
    **o menu continua de pé** e o componente **não deve** pintar fundo de página nem
    `min-h-screen` (ao contrário dos 2 arquivos do `/cliente`, que são de tela cheia).

### 🔴 Descoberta técnica que muda a direção do lead: `reset` ≠ `unstable_retry`

`packages/web/AGENTS.md` avisa: *"This is NOT the Next.js you know … Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code."* Lido. **Next instalado: `16.2.2`**
(react `19.2.4`) — `packages/web/package.json`.

Em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`:

| prop | o que faz (texto do doc) | versão |
|---|---|---|
| `unstable_retry` | *"will try to **re-fetch** and re-render the error boundary's children"* | **adicionada em `v16.2.0`** |
| `reset` | *"In most cases, you should use `unstable_retry()` instead. However, if you have a specific reason to clear the error state and re-render the error boundary's children **without re-fetching** the contents…"* | v13 |

Confirmado no runtime instalado, não só no doc: `node_modules/next/dist/esm/client/components/error-boundary.js`
passa **as duas** props ao componente do usuário (linhas 86-87) e o `unstable_retry` (linhas
20-23) chama o `this.reset()` **por dentro**, somando o re-fetch.

**Por que isso é load-bearing e não preciosismo:** o caminho de reprodução desta story é uma
**falha transitória de fetch**. Com `reset()` o botão limparia o estado de erro e re-renderizaria
os children **sem buscar de novo** → o usuário clica "Tentar novamente" e nada acontece de útil
(ou re-lança). O botão só cumpre a promessa do rótulo com `unstable_retry()`.
→ **Desvio consciente do direcionamento do lead** ("botão chamando `reset()`"), com evidência
acima. O `reset` dos 2 arquivos do `/cliente` é o padrão pré-16.2 — dívida deles, não modelo.

**🔴 Correção do @po: "o `tsc` denuncia na hora" é FALSO.** O draft fiava a mitigação do risco
`unstable_` no typecheck. Conferido: o Next gera `packages/web/.next/types/validator.ts` e o
cabeçalho do próprio arquivo diz *"validates that all pages and layouts export the correct
types"* — os tipos gerados são `AppPageConfig`, `LayoutConfig` e `RouteHandlerConfig`. **Não há
validador para `error.tsx`** (`grep -n "error" .next/types/validator.ts` → **zero** ocorrências
em 4.201 linhas). Logo as props de `error.tsx` são tipadas **pela anotação que nós mesmos
escrevemos**: se um Next futuro renomear/remover `unstable_retry`, o `tsc` **passa limpo**, o
runtime injeta `undefined` e o clique em "Tentar novamente" morre num `TypeError` — exatamente o
botão que esta story existe para entregar, quebrado em silêncio até alguém clicar.
→ Consequência de desenho (AC2/T1): o retry é **escolhido em runtime** com fallback honesto para
`reset` (`unstable_retry ?? reset`), tipando `unstable_retry?: () => void` como **opcional** —
assim é o **nosso** tipo que obriga o fallback, e a degradação é "botão limpa o erro sem
re-buscar" em vez de "botão estoura". E essa escolha é uma **decisão pura** → tem teste
(ver Decisão 4, revisada).

### Limites do mecanismo (do mesmo doc, para o escopo não mentir)

- `error.js` envolve `page.js`, `loading.js`, `not-found.js` e os **layouts aninhados abaixo** —
  mas **NÃO envolve o `layout.js` do próprio segmento**. Logo `app/dashboard/error.tsx` **não**
  pega uma exceção lançada dentro de `dashboard/layout.tsx` (que faz várias queries; hoje todas
  degradam com `?? []`/`.then`). Só `global-error.tsx` pegaria — e está **fora de escopo** por
  decisão do lead (raio maior, mexe no layout raiz).
- Em **produção**, erro vindo de Server Component chega ao cliente com `message` **genérica** +
  um `digest` (o Next redige para não vazar detalhe sensível). Em dev vem a mensagem real.
  → a UI tem de ser útil **sem** depender do `message`, e o `digest` é o que casa com o log do
  servidor.
- Error boundary **não** pega erro em event handler nem em código async pós-render.

---

## Decisão de desenho

1. **Um componente-base reusado, dois arquivos de rota de 6 linhas cada.**
   `packages/web/src/components/ui/error-fallback.tsx` (client) concentra layout, texto,
   acessibilidade e o `console.error`; `app/dashboard/error.tsx` e `app/broker/error.tsx` só o
   instanciam. Um lugar para mudar quando o `unstable_` virar estável.
   *(REUSE > ADAPT > CREATE: o CREATE se justifica porque os 2 arquivos do `/cliente` são
   tela-cheia dark-only e não servem ao shell com sidebar; o padrão de texto/estrutura deles é
   preservado.)*
2. **[AUTO-DECISION] Escopo = `/dashboard` + `/broker`; `/cliente` fica follow-up.**
   O lead pediu para avaliar as 3 áreas logadas. Decisão:
   - **`/dashboard` — SIM (necessidade medida):** 2 server components que lançam de fato.
   - **`/broker` — SIM (custo ~zero, mesmo shell):** o componente-base nasce nesta story de
     qualquer jeito, o shell é byte a byte o mesmo (`bg-stone-50 dark:bg-stone-950` +
     `<main className="lg:pl-56">`), então custa **1 arquivo de 6 linhas e nenhuma decisão de
     design nova**. É a área do corretor, o maior volume de uso. O valor de uma rede de
     segurança é justamente para o erro que **não** foi medido — e o risco de adicioná-la é
     nulo (nada renderiza no fluxo felizes).
   - **`/cliente` — NÃO, follow-up:** (a) já tem 2 boundaries cobrindo as telas profundas
     (`[obra_id]` e `[obra_id]/mensagens`); um `app/cliente/error.tsx` só cobriria
     `page.tsx`/`selecionar`/`boleto`/`sem-obra`; (b) é **dark-only** com cor de marca própria
     (`#F27A5E`) → 3ª variante visual, não o mesmo componente; (c) é tela de **cliente final** —
     raio de impacto externo que uma dívida `medium` interna não justifica arrastar.
     → follow-up: unificar os 2 existentes + cobrir a raiz do `/cliente` no mesmo componente-base
     com variante dark-only.
   **[MARTELO @po] `/broker` FICA no escopo.** Conferido byte a byte: `broker/layout.tsx:87` é
   `<div className="min-h-screen bg-stone-50 dark:bg-stone-950">` e `:108-109` é
   `<main className="lg:pl-56">` + `<div className="mx-auto max-w-6xl px-4 py-6 pb-24 lg:px-8
   lg:py-8 lg:pb-8">` — **idêntico** a `dashboard/layout.tsx`. Então `/broker` não adiciona
   **nenhuma** decisão de design, só 1 arquivo de 6 linhas que instancia o componente-base que
   nasce nesta story de qualquer jeito. Cortar não economizaria risco (o risco é o
   componente-base, que fica), economizaria 6 linhas — e deixaria a área de **maior volume de
   uso** (corretor) descoberta numa story cuja razão de existir é justamente "rede de segurança
   para o erro que não foi medido". Escopo mínimo aqui seria falsa economia.
3. **Tema:** `/dashboard` e `/broker` exigem **par claro + `dark:`** em toda cor
   ([[feedback-theme-convention]]). Cartão no padrão do `dashboard/loading.tsx`
   (`rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800`) e
   botão no padrão do `dashboard/offline/page.tsx:26-31`
   (`bg-gray-900 dark:bg-stone-100 text-white dark:text-stone-900 …`). **Zero cor hardcoded sem
   par** — o `/broker` tem dívida de dark-hardcoded, mas arquivo NOVO não a herda.
4. **[REVISADA pelo @po] Sem teste de COMPONENTE — mas com 1 teste puro, que não é teatro.**
   - **Confirmado:** o projeto não tem jsdom nem happy-dom nem `@testing-library` (`grep jsdom`
     nos dois `package.json` → nada; `node_modules/.pnpm` → nada). Logo **teste de componente é
     impossível** hoje ([[feedback-projeto-sem-teste-de-componente]]) — a premissa do @sm está
     certa.
   - **Mas a premissa "não há decisão para extrair" caiu** com a descoberta acima: a escolha
     `unstable_retry ?? reset` **é** uma decisão, e é a decisão que sustenta o risco nº 1 desta
     story. A própria story já autorizava o gancho ("se aparecer alguma regra de fato decidível,
     **aí sim** extrair para função pura e testar"). Ela apareceu. → extrair
     `pickRetry({ unstable_retry, reset })` para um módulo `.ts` puro e testar.
   - 🔥 **GOTCHA de infra (conferido em `vitest.config.ts:12-16`):** o `include` é
     `packages/web/src/**/*.test.ts` — **`.test.tsx` NÃO roda**. Um teste em `.tsx` passaria
     verde por nunca ter sido executado. Logo: helper em `.ts` (ex.:
     `packages/web/src/lib/ui/error-retry.ts`, convenção da casa = par `x.ts` + `x.test.ts`,
     como `lib/boleto-lembrete-key.ts`) e teste em **`.test.ts`**.
   - O resto da verificação segue sendo **reprodução real em dev** (T4) + typecheck + lint +
     `next build`. Nada de fabricar teste para a parte visual.
5. **Zero mudança no fluxo feliz, zero migration, zero endpoint.** Nenhum arquivo existente de
   página, layout ou lib é tocado. `error.tsx` não renderiza nada enquanto nada lança.

---

## Acceptance Criteria

- [x] **AC1 — componente-base.** Existe `packages/web/src/components/ui/error-fallback.tsx`,
      client component (`"use client"`), que recebe o erro e um callback de retry, e renderiza:
      título amigável em **pt-BR**, o `digest` quando presente (rótulo tipo "Código: {digest}",
      para casar com o log do servidor), e botão **"Tentar novamente"** que dispara o callback.
      Loga o erro uma vez via `console.error` dentro de `useEffect` com dependência `[error]`
      (nunca `setState` em effect — [[feedback-router-refresh-nao-mexe-em-state-client]]).
      Tem `role="alert"` para leitor de tela.
- [x] **AC2 — `/dashboard` protegido, com re-fetch de verdade.** Existe
      `app/dashboard/error.tsx` (`"use client"`), tipado `error: Error & { digest?: string }`,
      que usa **`unstable_retry`** como fonte do retry — **não** `reset` como primeira escolha
      (justificativa medida na seção "Descoberta técnica"; `reset` não re-busca e o caso de uso é
      falha transitória de fetch).
- [x] **AC2b — o retry não pode estourar num upgrade do Next.** Como o `tsc` **não** valida as
      props de `error.tsx` (fato conferido em `.next/types/validator.ts`), a escolha do retry é
      feita por uma função **pura** — ex.: `pickRetry({ unstable_retry, reset })` — que devolve
      `unstable_retry` quando ele existe e **cai para `reset`** quando não existe, com
      `unstable_retry?: () => void` declarado **opcional** nos 2 arquivos de rota. Essa função
      mora num módulo `.ts` próprio (não dentro do `.tsx`) e tem **teste unitário em
      `*.test.ts`** (⚠️ `.test.tsx` não roda — `vitest.config.ts` só inclui `*.test.ts`) cobrindo
      os 2 ramos. O uso do `reset` no ramo de fallback conta como o "motivo escrito no código"
      e vem comentado.
- [x] **AC3 — o menu não cai.** Com o boundary ativo em `/dashboard/*`, a sidebar, o header e a
      navegação continuam renderizados e clicáveis (o boundary substitui só o `{children}` dentro
      do `<main>` do `dashboard/layout.tsx`). O componente **não** usa `min-h-screen` nem pinta
      fundo de página — não há faixa dupla nem scroll extra dentro do container `max-w-6xl`.
- [x] **AC4 — caminho REAL de reprodução, com o retry testado SEM editar o código no meio.**
      Em dev, com uma falha forçada no fetch de `lead_tasks`, abrir
      **`/dashboard/leads?tasks=atrasadas`** mostra o fallback desta story (pt-BR, dentro do
      layout) e **não** a página de erro genérica do Next. Em seguida, **um clique em "Tentar
      novamente" traz a lista de leads de volta sem recarregar a página** — este é o teste que
      distingue `unstable_retry` de `reset` (com `reset` a lista não volta).
      🔴 **[@po] A falha forçada tem de ser auto-extinguível, não "editar o arquivo e clicar".**
      Salvar o arquivo entre as duas observações dispara Fast Refresh, que remonta a árvore por
      conta própria — a lista voltaria mesmo com `reset`, e o teste daria **falso PASS** justo no
      ponto que é a razão de ser da story. Usar uma falha que falha **só na 1ª tentativa** e
      passa na 2ª **sem tocar no código** (ex.: contador em escopo de módulo —
      `let boom = 0; if (boom++ === 0) throw new Error("[75-299] falha forçada")`), assim o único
      evento entre "vi o fallback" e "vi a lista" é **o clique**.
      A falha forçada é **temporária e revertida** antes do commit (o diff final não a contém).
- [x] **AC5 — `/broker` protegido.** Existe `app/broker/error.tsx` usando o mesmo
      componente-base, com o mesmo comportamento de AC2/AC3 sobre `broker/layout.tsx`.
- [x] **AC6 — fluxo feliz intacto e sem dívida nova.** Nenhum arquivo de página/layout/lib
      existente é modificado; **nenhuma migration**; nenhum endpoint. Toda cor tem par
      claro+`dark:`. Gates verdes: suíte de testes sem regressão **e com o teste do AC2b
      efetivamente executado** (provar que ele aparece na saída do `vitest run`, não só que o
      arquivo existe), `tsc --noEmit` limpo, eslint sem **erro** novo (contar as 24 warnings
      pré-existentes como linha de base) e `next build` exit 0.
- [x] **AC7 — limites declarados, não escondidos.** A story/o código registram explicitamente
      que (a) **não** há `global-error.tsx` e ele está fora de escopo; (b) exceção lançada
      **dentro** de `dashboard/layout.tsx` ou `broker/layout.tsx` **continua** escapando para a
      tela genérica do Next (o boundary não cobre o layout do próprio segmento); (c) em produção
      a `message` de erro de Server Component é genérica por design do Next, e o `digest` é o
      elo com o log — a UI não promete detalhe que não terá; (d) **[@po]** os outros consumidores
      de `fetchAllLeads` **não ganham nada** com esta story — `app/api/analytics/executive` e
      `app/api/analytics/leads-by-period` são **route handlers** (falham em 500/JSON, sem
      boundary) e `lib/analytics-report-data.ts` é o PDF; (e) erro em **event handler** ou em
      código **async pós-render** não é pego por error boundary (é o caso, por exemplo, do
      `throw` em `broker/_components/broker-push-prompt.tsx:22`, que roda dentro de `subscribe()`).

## Escopo

**IN:** `src/components/ui/error-fallback.tsx` (novo) · `app/dashboard/error.tsx` (novo) ·
`app/broker/error.tsx` (novo) · `src/lib/ui/error-retry.ts` (novo — helper puro `pickRetry`) ·
`src/lib/ui/error-retry.test.ts` (novo) · reprodução manual em dev do caminho `?tasks=atrasadas`.

**OUT:** `global-error.tsx` (decisão do lead — raio maior, layout raiz) · `app/cliente/error.tsx`
e unificação dos 2 boundaries do portal (follow-up) · `not-found.tsx` de qualquer segmento ·
integração com serviço externo de erro (Sentry & cia — não existe no projeto hoje; `console.error`
vai para o log da Vercel) · boundaries por sub-rota (`dashboard/leads/error.tsx` etc.) ·
mudar o comportamento de `fetchAllLeads` (o throw é a decisão CERTA da 75-298 e fica) ·
os follow-ups C-2/C-3/C-4 da 75-298 (RPC dedicada, `org_id` da RPC, `taskFilter` no vazio do
broker) — outra story.

## Dependencies

- Next `16.2.2` já instalado (a prop `unstable_retry` existe desde `16.2.0`) — **nenhum upgrade**.
- Padrão de texto/estrutura: `app/cliente/[obra_id]/error.tsx` e
  `app/cliente/[obra_id]/mensagens/error.tsx` (referência de linguagem, **não** de estilo).
- Padrão visual: `app/dashboard/loading.tsx` (cartão) e `app/dashboard/offline/page.tsx:26-31`
  (botão claro+dark).
- Nada de banco: **zero migration**, zero RLS, zero RPC.

## Riscos

1. **`unstable_retry` é `unstable_`.** Pode ser renomeada num Next futuro.
   ⚠️ **A mitigação original era falsa** — "o `tsc` denuncia na hora" **não** vale: o Next não
   gera validador de tipos para `error.tsx` (só para page/layout/route handler — conferido em
   `.next/types/validator.ts`), então um rename passa pelo typecheck e só quebra no clique.
   **Mitigação real (AC2b):** o retry é escolhido por 1 função pura com fallback para `reset`,
   com `unstable_retry` tipado **opcional** (é o nosso tipo que obriga o fallback), coberta por
   teste unitário. Pior cenário num upgrade: o botão degrada para "limpa o erro sem re-buscar" —
   o comportamento pré-16.2 — em vez de estourar `TypeError`. O ponto único de mudança segue
   sendo o componente-base + 2 arquivos de 1 linha.
2. **Boundary que esconde bug.** Uma tela que "falha bonito" pode fazer um defeito real passar
   despercebido. Mitigação: `console.error` sempre (log da Vercel) + `digest` visível na tela,
   para o suporte correlacionar. **Não** usar `try/catch` silencioso em lugar nenhum — a régua
   "barulho > número mentiroso" da 75-298 continua valendo.
3. **Testar boundary em produção é destrutivo.** Não existe jeito honesto de "smoke" isso em prod
   sem quebrar algo de propósito para um usuário real. Mitigação: a validação é **em dev** (T4);
   em prod só se confirma que o fluxo feliz segue idêntico. **Proibido** forçar erro em prod.
   **[MARTELO @po] Gate ACEITO como está.** O que se pagaria para "provar em prod" é um erro real
   na tela de um corretor ou gerente; o que se ganharia é zero informação nova, porque a única
   diferença dev↔prod aqui é a **redação da `message`** pelo Next — que é comportamento do
   framework, não código nosso, e está documentado no AC7(c). A conferência em prod é fluxo
   feliz (T6); a **primeira observação legítima em prod** é reativa: quando um erro real
   acontecer, o `digest` da tela tem de casar com o `console.error` no log da Vercel. Isso é
   follow-up de operação, **não** gate desta story.
4. **Falso senso de cobertura.** `/dashboard` e `/broker` cobertos ≠ app coberto: layouts dos
   próprios segmentos, root layout e `/cliente` (parcial) seguem descobertos — AC7 obriga a
   escrever isso, para a próxima pessoa não presumir rede onde não tem.
5. **Divergência de estilo com os 2 arquivos do `/cliente`.** Ficarão 3 arquivos parecidos e um
   componente-base — deliberado por ora; o follow-up do `/cliente` fecha.

## Tasks

- [x] **T1 (AC: 1)** — Criar `src/components/ui/error-fallback.tsx`: `"use client"`, props
      `{ error: Error & { digest?: string }; onRetry: () => void; title?: string; scope: string }`
      (`scope` só para o prefixo do `console.error`, ex.: `[dashboard/error]`); `useEffect`
      com `console.error(scope, error.message, error.digest)`; `role="alert"`; cartão no padrão
      do `loading.tsx`; botão no padrão do `offline/page.tsx`; **par claro+`dark:` em toda cor**;
      sem `min-h-screen` e sem fundo de página.
- [x] **T1b (AC: 2b)** — Criar `src/lib/ui/error-retry.ts` com a função pura
      `pickRetry({ unstable_retry, reset })` → devolve `unstable_retry` se for função, senão
      `reset`; e `src/lib/ui/error-retry.test.ts` (⚠️ **`.test.ts`**, não `.tsx` — o
      `vitest.config.ts:12-16` só inclui `*.test.ts`) cobrindo os 2 ramos + o comentário
      explicando por que o fallback existe (o `tsc` não valida props de `error.tsx`).
- [x] **T2 (AC: 2, 2b, 3, 7)** — Criar `app/dashboard/error.tsx` consumindo o base e passando
      `onRetry={pickRetry({ unstable_retry, reset })}`, com as props tipadas
      `{ error: Error & { digest?: string }; reset: () => void; unstable_retry?: () => void }`.
      Comentário curto no arquivo com: versão do Next (`16.2.2`), o doc lido
      (`packages/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`
      — ⚠️ o repo é **pnpm**, o `next` real vive em `node_modules/.pnpm/next@16.2.2…`; o caminho
      acima é o symlink que funciona), o **porquê** de não ser `reset` como 1ª escolha (não
      re-busca), o porquê do fallback, + a nota de que o boundary não cobre o `layout.tsx` do
      próprio segmento.
- [x] **T3 (AC: 5)** — Criar `app/broker/error.tsx` idem (só o texto/`scope` muda).
- [x] **T4 (AC: 4)** — Reprodução real em dev: forçar falha no fetch de `lead_tasks`
      (`dashboard/leads/page.tsx`, dentro do `if (taskFilter)`) **com contador de módulo que
      falha só na 1ª tentativa** (ex.: `let boom = 0` no topo do arquivo +
      `if (boom++ === 0) throw new Error("[75-299] falha forçada")` dentro do `if (taskFilter)`),
      abrir `/dashboard/leads?tasks=atrasadas`, **conferir na tela**: fallback em pt-BR + sidebar
      de pé + `digest`/mensagem; **sem salvar nada**, clicar "Tentar novamente" e ver a lista
      voltar **sem reload**. ⛔ NÃO usar "editar o arquivo para remover a falha e depois clicar":
      o Fast Refresh remonta a árvore e o teste dá **falso PASS** mesmo com `reset`.
      Conferir também em **tema claro e escuro**. **Reverter a falha forçada** e provar no
      `git diff` que ela não ficou. Registrar o que foi visto (não "deve funcionar").
- [x] **T5 (AC: 6)** — Gates: suíte (`vitest run` — **colar a linha do novo teste na saída**, para
      provar que ele rodou e não foi filtrado pelo `include`), `tsc --noEmit` **forçado** (o
      `turbo type-check` costuma vir do cache — ver nota do @qa na 75-298), `eslint` comparando
      com a linha de base de 24 warnings, `next build` exit 0.
- [ ] **T6 (AC: 6)** — Pós-deploy: abrir `/dashboard`, `/dashboard/leads` e `/broker/leads` e
      confirmar que **nada mudou** no fluxo feliz. **Não** provocar erro em prod.

## Dev Notes

### Mapa de arquivos (conferido contra o código de `main` @ `db0a8572`, 12/08)

| arquivo | papel nesta story | fato verificado |
|---|---|---|
| `packages/web/src/components/ui/error-fallback.tsx` | **NOVO** — base | diretório existe (`message-text.tsx`, `qualificacao-comercial-badge.tsx`, `scrollable-x.tsx`, `source-badge.tsx`) |
| `packages/web/src/app/dashboard/error.tsx` | **NOVO** | não existe hoje |
| `packages/web/src/app/broker/error.tsx` | **NOVO** | não existe hoje |
| `packages/web/src/app/dashboard/layout.tsx:304-330` | onde o fallback aparece | `bg-stone-50 dark:bg-stone-950` + `<main className="lg:pl-56">` + container `max-w-6xl` |
| `packages/web/src/app/broker/layout.tsx:87` | idem | **mesmo** shell |
| `packages/web/src/app/dashboard/loading.tsx` | padrão do cartão | `rounded-lg bg-white p-5 shadow-sm dark:bg-stone-900 dark:ring-1 dark:ring-stone-800`, `role="status"` |
| `packages/web/src/app/dashboard/offline/page.tsx:26-31` | padrão do botão | `bg-gray-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-gray-700 dark:hover:bg-stone-200` |
| `packages/web/src/lib/ui/error-retry.ts` | **NOVO** — `pickRetry` puro | AC2b; par `x.ts` + `x.test.ts` é a convenção da casa (ex.: `lib/boleto-lembrete-key.ts`) |
| `packages/web/src/lib/ui/error-retry.test.ts` | **NOVO** — teste | ⚠️ `vitest.config.ts:12-16` inclui só `packages/web/src/**/*.test.ts` — `.test.tsx` **não roda** |
| `packages/web/src/app/dashboard/leads/page.tsx:251-258` | caminho de reprodução | `fetchAllLeads` de `lead_tasks` dentro de `if (taskFilter)` |
| `packages/web/src/lib/analytics/fetch-all-leads.ts:46` | a origem do throw | `if (error) throw error` |
| ~~`packages/web/src/app/dashboard/analytics/page.tsx`~~ | ❌ **NÃO é beneficiário** | corrigido pelo @po: **não importa** `fetchAllLeads`; só há um comentário na linha 476 |
| `packages/web/.next/types/validator.ts` | por que o `tsc` não salva | valida só `AppPageConfig`/`LayoutConfig`/`RouteHandlerConfig` — **zero** menção a `error.tsx` |
| `vitest.config.ts:12-16` | onde o teste tem de morar | `include: packages/web/src/**/*.test.ts` |
| `packages/web/src/app/cliente/[obra_id]/error.tsx` (+ `mensagens/`) | referência de linguagem | únicos `error.tsx` do repo; usam `reset` (padrão pré-16.2) e são tela-cheia dark-only |

### Assinatura esperada (do doc do Next 16.2, não de memória)

```tsx
// app/dashboard/error.tsx
"use client" // error boundary tem de ser Client Component

export default function DashboardError({
  error,
  reset,
  unstable_retry, // opcional DE PROPÓSITO: o tsc não valida props de error.tsx (ver Riscos §1)
}: {
  error: Error & { digest?: string }
  reset: () => void
  unstable_retry?: () => void
}) { /* … <ErrorFallback onRetry={pickRetry({ unstable_retry, reset })} … /> */ }
```

O runtime passa **as duas** props (`reset` e `unstable_retry`) —
`packages/web/node_modules/next/dist/esm/client/components/error-boundary.js:86-87` (e o
`unstable_retry`, definido em `:20-23`, faz `startTransition(() => { this.context?.refresh();
this.reset() })` — ou seja, é `reset` **+** re-fetch).
**[correção @po]** O draft dizia "declarar só a que se usa". **Declarar as duas** e tipar
`unstable_retry` como opcional: é o único mecanismo que faz o `tsc` **exigir** o fallback,
porque o Next não gera validador de tipo para `error.tsx`.

### Convenções que valem aqui

- [[feedback-theme-convention]] — `/dashboard` **e** `/broker` com par claro+`dark:`; só
  `/cliente` é sempre dark (e está fora do escopo).
- [[feedback-projeto-sem-teste-de-componente]] — sem jsdom; sem decisão pura a extrair aqui,
  então **declarar** a ausência de teste unitário em vez de inventar um.
- [[feedback-nao-quebrar-o-que-funciona]] — arquivos 100% novos; raio de impacto = zero no fluxo
  feliz.
- [[feedback-consultar-fonte-nao-duplicar-constante]] — nada de duplicar classes/cores: copiar o
  padrão dos arquivos citados no mapa.

## Testing

- **Unitário: 1 teste, e só 1** — `src/lib/ui/error-retry.test.ts` cobrindo `pickRetry` nos 2
  ramos (`unstable_retry` presente → usa ele; ausente → cai para `reset`). É a única decisão
  pura da story, e é a que sustenta o risco nº 1 (ver Decisão 4 revisada).
  ⚠️ **Nome do arquivo tem de terminar em `.test.ts`** — `vitest.config.ts:12-16` inclui apenas
  `packages/web/src/**/*.test.ts`; um `.test.tsx` **nunca roda** e daria falsa cobertura.
- **Teste de componente: não há**, e não é escolha — o projeto não tem jsdom/happy-dom/
  `@testing-library` instalados ([[feedback-projeto-sem-teste-de-componente]]). Não fabricar
  helper puro para a parte visual só para ter cobertura.
- **Manual (T4), obrigatório e o coração da story:** `/dashboard/leads?tasks=atrasadas` com falha
  forçada em dev (**contador de módulo que falha só na 1ª tentativa**) → fallback + sidebar viva;
  clique em "Tentar novamente" **sem salvar arquivo nenhum** → lista de volta **sem reload**.
  Conferir claro e escuro. ⛔ Editar o arquivo entre as duas observações invalida o teste
  (Fast Refresh remonta a árvore sozinho → falso PASS).
- **Estático:** `tsc --noEmit` (forçado, sem cache do turbo), `eslint` contra a base de 24
  warnings, `next build` exit 0, suíte inteira sem regressão. ⚠️ O `tsc` **não** valida as props
  de `error.tsx` (`.next/types/validator.ts` só cobre page/layout/route handler) — typecheck
  verde **não** prova que `unstable_retry` existe; quem prova isso é a T4.
- **Prod:** só conferência de fluxo feliz. Provocar erro em produção é proibido.

## File List

**5 arquivos, TODOS novos. Zero arquivo existente modificado** (`git diff main --stat` = vazio),
zero migration, zero endpoint, zero dependência nova.

| arquivo | ação | papel |
|---|---|---|
| `packages/web/src/components/ui/error-fallback.tsx` | **novo** | componente-base (client): cartão, texto pt-BR, `role="alert"`, `console.error`, botão |
| `packages/web/src/lib/ui/error-retry.ts` | **novo** | `pickRetry({ unstable_retry, reset })` — decisão pura do retry (AC2b) |
| `packages/web/src/lib/ui/error-retry.test.ts` | **novo** | 4 casos cobrindo os 2 ramos do `pickRetry` |
| `packages/web/src/app/dashboard/error.tsx` | **novo** | boundary do `/dashboard` + o racional técnico completo em comentário |
| `packages/web/src/app/broker/error.tsx` | **novo** | boundary do `/broker` (mesmo base, só `scope` muda) |
| ~~`packages/web/src/app/dashboard/leads/page.tsx`~~ | **tocado só em dev, REVERTIDO** | falha forçada da T4 — provado revertido (ver Dev Agent Record) |

## Dev Agent Record

**Agent Model Used:** Opus 5 (1M) — `claude-opus-5[1m]` · @dev (Dex) · modo **YOLO** · 12/08/2026
**Branch:** `feat/75-299-dashboard-error-boundary` (criada de `main` @ `db0a8572`) · **sem commit,
sem push** (o lead cuida do git).

### IDS protocol (SEARCH → DECIDE → LOG)

| artefato | busca feita | decisão |
|---|---|---|
| `error-fallback.tsx` | `grep -rn "ErrorFallback\|error-fallback"` em `packages/web/src` + `squads/` → **zero**; `find` de `error.tsx` → só os 2 do `/cliente`, inline e tela-cheia dark-only | **CREATE** justificado: os 2 do `/cliente` não são componente reusável e não servem ao shell com sidebar. Padrão de texto/estrutura deles **preservado** (REUSE de padrão) |
| `pickRetry` | `grep -rn "pickRetry\|unstable_retry"` → **zero** | **CREATE** (AC2b exige) |
| cartão / botão | `dashboard/loading.tsx` e `dashboard/offline/page.tsx:26-31` | **REUSE das classes exatas** — nada de cor inventada ([[feedback-consultar-fonte-nao-duplicar-constante]]) |
| pasta `src/lib/ui/` | não existia; convenção da casa = par `x.ts` + `x.test.ts` (ex.: `lib/boleto-lembrete-key.ts`) | **CREATE** da pasta, seguindo a convenção |

### Decisões autônomas

1. **[AUTO-DECISION] `useEffect` com deps `[error, scope]`, não `[error]`** (a AC1 pede `[error]`).
   Razão: `scope` é prop usada dentro do effect → `react-hooks/exhaustive-deps` abriria **warning
   novo** e estouraria a linha de base de 24 (AC6). O comportamento pedido é preservado
   integralmente: `scope` é literal fixo em cada arquivo de rota, nunca muda entre renders, logo
   continua **1 log por erro**. Documentado em comentário no arquivo.
2. **[AUTO-DECISION] `digest` em `dark:text-stone-500`, não `-600`.** O padrão copiado
   (`offline/page.tsx`) usa `stone-600`, mas **sobre `stone-950`**; no cartão o fundo é
   `stone-900` e na tela (conferido em T4, screenshot) `stone-600` ficou ilegível. O `digest` é
   exatamente o que o suporte precisa LER para casar com o log da Vercel (risco nº 2), então
   legibilidade venceu a cópia literal. Único desvio do padrão citado, comentado no código.
3. **[AUTO-DECISION] `error.message` é exibido** (linha discreta, `break-words`). A AC1 não pede
   nem proíbe; a T4 manda conferir "`digest`/mensagem" na tela, e é o padrão dos 2 arquivos do
   `/cliente`. Em produção o Next redige essa mensagem — por isso o texto útil em pt-BR **não
   depende** dela.
4. **[AUTO-DECISION] Ícone `AlertTriangle` (lucide)** no cartão — mesma família visual do
   `offline/page.tsx` (que usa `WifiOff`), `aria-hidden`, zero dependência nova.

### T4 — reprodução real em dev (o coração da story): **PASS**

**Como foi feito, por terminal** (não pilotei o Chrome do Marcos —
[[feedback-terminal-nao-navegador]]): `next dev` local + um script Playwright próprio
(headless, `@playwright/test` já instalado no repo). Sessão local obtida por **magic link de uso
único** (Auth admin API, `generate_link`) para a conta **seed** `lucas@trifold.com.br`
("Lucas Supervisor", role `admin`, `is_active=true`) — **nenhuma senha alterada, nenhum dado
escrito**. Motivo: não há projeto Supabase de dev configurado (`packages/web/.env.development`
não existe; `.env.local` é o de sempre) e não há credencial de teste; a seed
`corretor@trifold.com.br` tem `is_active=false` e é barrada pelo app.

**Falha forçada auto-extinguível**, como o @po exigiu — contador em escopo de módulo no
`dashboard/leads/page.tsx`, dentro do `if (taskFilter)`:
`let boom75299 = 0` + `if (boom75299++ === 0) throw new Error("[75-299] falha forçada")`,
mais um `console.error("… tentativa nº", n)` para o log do servidor contar as tentativas.
**Nenhum arquivo foi salvo entre as duas observações** — o único evento foi o clique.

**Observação 1** (`GET /dashboard/leads?tasks=atrasadas`, 1ª renderização):

- fallback desta story na tela, **não** a página genérica do Next
  (`/Application error: a .*-side exception/` → **não casa**);
- `role="alert"` presente · título **"Erro ao carregar esta tela."** · corpo pt-BR ·
  `[75-299] falha forçada` · **`Código: 609130018`** · botão "Tentar novamente";
- **menu de pé:** 29 links `nav a[href^="/dashboard"]` renderizados e o link `/dashboard/leads`
  visível/clicável (AC3); zero `<table>` (o conteúdo da tela é que caiu, só ele);
- sem faixa dupla e sem fundo de página — o cartão vive dentro do container `max-w-6xl`
  (screenshots `t4-{dark,light}-1-fallback.png`).

**Observação 2** (o **único** evento entre as duas foi **1 clique** em "Tentar novamente"):

- fallback desapareceu; `<table>` com **49 linhas**, `h1` "Leads", chip **"Tarefas atrasadas ×"**
  e o contador **"49 leads · tarefas atrasadas"** de volta;
- **sem reload**: um marcador posto em `window.__t4Marker` **antes** do clique **sobreviveu**
  depois dele, e a URL não mudou;
- 🔑 **a prova que separa `unstable_retry` de `reset`** está no log do SERVIDOR: aparece
  `tentativa nº 1` (que lançou) e, **após o clique**, `tentativa nº 2` — o server component
  **rodou de novo**, ou seja houve **re-fetch**. Com `reset()` não haveria segunda renderização
  no servidor e a lista não voltaria.

**Tema claro e escuro:** conferidos, cada um numa execução completa e independente (servidor
`next dev` reiniciado entre as duas para zerar o contador de módulo **sem editar arquivo**).
Ambos com par claro+`dark:` correto; o único ajuste que a conferência visual pediu foi o do
`digest` (decisão 2 acima), e depois dele o dark foi **re-executado do zero**.

**Reversão provada:** `git checkout -- packages/web/src/app/dashboard/leads/page.tsx` ·
`grep -rn "boom75299\|falha for" packages/web/src packages/ai/src packages/shared/src` → **vazio** ·
`git diff main --stat` → **vazio** (nenhum arquivo existente tocado) · `git status --short` mostra
só os 5 arquivos novos + esta story. (Os únicos hits residuais estavam em `packages/web/.next/`,
cache de build **gitignored**, e o `.next/dev` foi apagado depois.)

### T4 — o que NÃO foi observado (honestidade sobre AC5)

O boundary do **`/broker` não foi visto renderizando**: a conta usada é `admin` e
`/broker/leads` **redireciona para `/dashboard`**; a única seed de corretor
(`corretor@trifold.com.br`) está `is_active=false`. AC5 está apoiado em: arquivo existe, usa o
mesmo componente-base, mesmas props tipadas, shell idêntico conferido linha a linha,
`tsc` limpo e `next build` exit 0. **Não** está apoiado em observação de runtime — ponto para
o @qa decidir se exige.

### Verificação de fluxo feliz (equivalente local da T6, com a mesma sessão)

| rota | resultado |
|---|---|
| `/dashboard` | normal, `h1` "Dashboard", **boundary não aparece** |
| `/dashboard/leads` | normal, tabela presente, boundary não aparece |
| `/dashboard/leads?tasks=atrasadas` (sem falha forçada) | normal, tabela presente, boundary não aparece |
| `/broker/leads` | redireciona p/ `/dashboard` (conta admin) — sem erro |

### T5 — gates (saída real)

| gate | comando | resultado |
|---|---|---|
| suíte | `npx vitest run --reporter=verbose` | **184 arquivos, 2299 passed \| 6 expected fail (2305)** — sem regressão (era 183/2295 antes; +1 arquivo, +4 testes, todos meus) |
| teste do AC2b **rodou** | `grep error-retry.test.ts` na saída | 4 linhas `✓ packages/web/src/lib/ui/error-retry.test.ts > pickRetry > …` (prova de que o `include` não filtrou) |
| typecheck | `npx tsc --noEmit -p packages/web/tsconfig.json` (**forçado**, fora do turbo) | **exit 0** |
| lint | `npx eslint .` em `packages/web` (**direto**, sem cache) | **24 problems (0 errors, 24 warnings)** = linha de base **idêntica**; zero warning novo |
| build | `npx next build` em `packages/web` | **exit 0** · "✓ Compiled successfully in 21.7s" |

**AC2b re-conferido no artefato recém-gerado:** `.next/types/validator.ts` tem 4.201 linhas e
`grep -c "error"` → **0**. Confirmado de novo, com o build desta branch: o Next **não** gera
validador de tipo para `error.tsx` — o `tsc` verde não prova que `unstable_retry` existe, e a
única rede é o fallback do `pickRetry` (+ a T4).

### ⚠️ Achados de infra (pré-existentes, NÃO desta story — para o @qa/@devops)

1. **`npm run lint` / `npm run type-check` via turbo mascaram um erro real:** com cache eles dão
   FULL TURBO em 108ms; com `--force`, o pipeline quebra em **`@trifold/shared#build`** →
   `error TS2688: Cannot find type definition file for 'node'` (a pasta
   `packages/shared/node_modules/@types/` **não existe** — falta `pnpm install` nesse pacote).
   Não tem relação com esta story (nenhum arquivo de `packages/shared` foi tocado), mas é a
   confirmação da nota do @qa na 75-298 de que o gate estático tem de ser **forçado**. Por isso
   rodei `tsc` e `eslint` direto no pacote `web`.
2. **Matar o `next dev` corrompe `.next/dev/types/`** e o `tsc --noEmit` passa a acusar ~85
   `TS1005` em `routes.d.ts`/`validator.ts` — artefatos truncados, **não** código nosso.
   Cura: `rm -rf packages/web/.next/dev`. Feito antes do typecheck final (exit 0).
3. **Em dev o `console.error` do boundary aparece 2×** (`[dashboard/error] … 609130018` duas
   vezes). É o double-invoke de effects do React em desenvolvimento, não `setState` em effect nem
   log duplicado nosso; em produção é 1×. Registrado para o @qa não ler isso como bug.

### Self-critique

**Step 5.5 — bugs previstos e o que foi feito:**

1. *`pickRetry` devolve a função "solta" — se `unstable_retry`/`reset` dependessem de `this`, o
   botão estouraria.* **Conferido na fonte do runtime**
   (`next/dist/esm/client/components/error-boundary.js:16-25`): as duas são **propriedades de
   instância com arrow function**, já ligadas — passar a referência é seguro. Coberto pelo 4º
   caso do teste (identidade preservada).
2. *`error` undefined → `error.message` quebraria o próprio boundary.* O runtime só renderiza o
   componente quando `state.error` existe (`:80-92`); e o acesso é sempre guardado
   (`{error.message && …}`, `{error.digest && …}`).
3. *Warning novo de `exhaustive-deps` derrubando a linha de base de 24.* Previsto **antes** de
   rodar o lint → deps `[error, scope]` (decisão 1). Lint confirmou: 24, zero novo.
4. *Teste em `.tsx` que nunca roda* (a armadilha que o @po levantou). Evitado por construção +
   **provado** com `--reporter=verbose`.

**Edge cases considerados:** mensagem gigante (`break-words` + `min-w-0`, não estoura o
`max-w-6xl`) · **sem `digest`** (erro de client component: bloco omitido, UI segue útil) ·
`digest` sem `message` e vice-versa (ramos independentes) · erro **repetido** após o retry (novo
objeto `error` → novo log, desejado) · leitor de tela (`role="alert"`, ícone `aria-hidden`) ·
tema do sistema **e** toggle explícito (par claro+`dark:` em toda cor).

**Segurança:** nenhum segredo no código; zero `dangerouslySetInnerHTML`; o texto exibido é o que
o **próprio Next** já entrega ao cliente (e ele redige a mensagem de Server Component em
produção) — esta story não expõe nada que o framework já não expusesse; nenhuma escrita, nenhuma
query, nenhuma rota nova (logo nada de RLS/`isPublicRoute` a conferir).

**Step 6.5:** padrões da casa seguidos (alias `@web/*`, comentário-cabeçalho com o nº da story,
par `x.ts`+`x.test.ts`) · nenhum valor mágico · `console.error` é **requisito** da AC1, não
debug esquecido · nenhum código comentado, nenhum TODO solto, nenhum import não usado
(lint limpo).

### story-dod-checklist

| item | status |
|---|---|
| 1. Requisitos / AC | ✅ AC1-AC7 atendidas (AC5 sem observação de runtime — ver ressalva acima) |
| 2. Padrões & estrutura | ✅ classes copiadas da fonte, alias `@web/*`, sem cor sem par `dark:`, comentários onde a decisão é não-óbvia · **0 erro** e **0 warning novo** de lint |
| 3. Testes | ✅ 1 teste puro (4 casos) para a única decisão pura, **provado em execução**. Teste de componente: **N/A** — sem jsdom/happy-dom/`@testing-library` no projeto ([[feedback-projeto-sem-teste-de-componente]]) |
| 4. Funcionalidade verificada | ✅ T4 em dev, claro e escuro, com o retry validado por re-render **no servidor**; fluxo feliz reconferido em 4 rotas |
| 5. Administração da story | ✅ checkboxes, File List, este record, Change Log. **T6 fica aberta**: é pós-deploy, e o deploy é do @devops |
| 6. Build & config | ✅ `next build` exit 0 · zero dependência nova · zero env var nova · zero migration |
| 7. Documentação | ✅ os limites do AC7 (a-e) estão **no código**, nos comentários de `dashboard/error.tsx` e `broker/error.tsx`, não só na story |

- [x] Eu, @dev (Dex), confirmo que os itens aplicáveis acima foram endereçados.

### Pontos de atenção para o @qa

1. **AC5 sem evidência de runtime** — `/broker/error.tsx` não foi visto renderizando (falta
   credencial de corretor ativo). Decidir se exige.
2. **Desvio do padrão de cor citado na story** (`digest` em `stone-500`, não `stone-600`) —
   deliberado e comentado; era ilegível na tela.
3. **Desvio da AC1** no array de deps (`[error, scope]`) — para não abrir warning novo;
   comportamento equivalente.
4. **`error.message` na tela**: em produção vem a mensagem redigida pelo Next (genérica). Não é
   bug, é o desenho — a linha desaparece se vier vazia.
5. **Gates estáticos precisam ser forçados** (o turbo cacheia; e o pipeline `--force` quebra num
   problema pré-existente de `packages/shared`, item 1 dos achados de infra).
6. **`global-error.tsx`, o `layout.tsx` dos próprios segmentos e o `/cliente`** continuam
   descobertos — por decisão, escrito no AC7 e nos comentários.

## QA Results

_(preencher pelo @qa)_

## Story Draft Checklist (@sm — `story-draft-checklist.md`, rodado antes de entregar)

| Categoria | Status | Nota |
|---|---|---|
| 1. Goal & Context Clarity | **PASS** | origem rastreada ao C-1 do gate da 75-298; valor de usuário explícito (menu de pé + caminho de volta); dependência = só o Next já instalado |
| 2. Technical Implementation Guidance | **PASS** | 3 arquivos nomeados + mapa com linha:coluna dos padrões a copiar; assinatura do componente tirada do doc do pacote; exceção ao padrão da casa (`unstable_retry` × `reset` dos 2 arquivos do `/cliente`) explicitada |
| 3. Reference Effectiveness | **PASS** | referências apontam seção/linha (`error-boundary.js:86-87`, `fetch-all-leads.ts:46`, `offline/page.tsx:26-31`), e o conteúdo crítico está **resumido na story** — o @dev não precisa abrir o gate da 75-298 |
| 4. Self-Containment | **PASS** | limites do mecanismo (não cobre o layout do próprio segmento; `message` genérica em prod) escritos no corpo; suposições viraram Decisões numeradas |
| 5. Testing Guidance | **PASS** | ausência de teste unitário **justificada** (sem jsdom, sem decisão pura) + plano manual determinístico com o caminho REAL e o critério que separa `unstable_retry` de `reset` |
| 6. CodeRabbit Integration | **N/A** | `coderabbit_integration` ausente de `core-config.yaml` → skip notice abaixo |

**Veredito do @sm: READY para `@po *validate`** · clareza 9/10. Único ponto que eu mesmo
marcaria para o @po decidir: **manter ou cortar o `/broker`** (Decisão 2) — não é gap, é escolha.

## Validação do @po (Pax — `validate-next-story.md`, YOLO, 12/08)

**Veredito: GO · 9/10 · confiança ALTA.** Tudo conferido contra o código de `main` @ `db0a8572`.

### 10-point checklist (`story-lifecycle.md`)

| # | Item | Status |
|---|---|---|
| 1 | Título claro e objetivo | ✅ |
| 2 | Descrição completa (problema/necessidade) | ✅ origem rastreada ao C-1 do gate da 75-298 |
| 3 | AC testáveis | ✅ 8 ACs, todos observáveis; AC4 é o único manual e agora é determinístico |
| 4 | Escopo IN/OUT definido | ✅ OUT explícito e generoso (global-error, `/cliente`, C-2/C-4) |
| 5 | Dependências mapeadas | ✅ só o Next `16.2.2` já instalado; zero banco |
| 6 | Estimativa | ✅ S (~2 pts) — realista para 5 arquivos novos |
| 7 | Valor de negócio | ✅ menu de pé + caminho de volta em pt-BR; hoje = tela em inglês sem saída |
| 8 | Riscos documentados | ⚠️→✅ 5 riscos, **mas o nº 1 tinha mitigação falsa** (corrigida) |
| 9 | Definition of Done | ✅ AC6 com gates nomeados e linha de base de 24 warnings |
| 10 | Alinhamento com Epic/PRD | ✅ dívida técnica do épico 75, nascida de gate de QA |

**Executor assignment:** `executor: @dev` ≠ `quality_gate: @qa`, `quality_gate_tools` não vazio →
**PASS**. (A tabela da task sugere `@architect` para código; o projeto padroniza `@qa` —
`CLAUDE.md` REGRA ZERO e a 75-298. Convenção do projeto vence, sem issue.)

**Anti-alucinação — o que foi conferido no código, item por item:**

| Claim da story | Veredito |
|---|---|
| só 2 `error.tsx`, ambos em `cliente/[obra_id]`; nenhum `global-error.tsx` | ✅ `find` confirma |
| `/dashboard` e `/broker` sem boundary | ✅ |
| `fetch-all-leads.ts:46` = `if (error) throw error` | ✅ |
| `fetchAllLeads` em **2** server components (incl. `analytics/page.tsx`) | ❌ **FALSO** → corrigido: é **1** (`dashboard/leads/page.tsx`); `analytics/page.tsx` nem importa |
| `/broker/leads` degrada o `lead_tasks` | ✅ `{ data: pendingTasks }`, `error` descartado |
| shell `/dashboard` == shell `/broker` | ✅ `broker/layout.tsx:87` e `:108-109` idênticos |
| `loading.tsx` (cartão) e `offline/page.tsx:26-31` (botão) | ✅ classes exatas |
| Next `16.2.2` / react `19.2.4` | ✅ |
| doc: `unstable_retry` re-busca, adicionada em `v16.2.0`; `reset` não re-busca | ✅ `error.md:121`, `:157`, `:329` |
| runtime passa as 2 props (`:86-87`) e `unstable_retry` chama `reset` por dentro (`:20-23`) | ✅ |
| `error.js` não envolve o `layout.js` do próprio segmento | ✅ `error.md:96` |
| prod redige a `message`, sobra o `digest` | ✅ `error.md:111` |
| sem jsdom no projeto | ✅ nada em `package.json` nem no `.pnpm` |
| "se o upgrade quebrar, o `tsc` denuncia" | ❌ **FALSO** → corrigido (ver Riscos §1) |
| "a 75-298 está Done" | ⚠️ mergeada sim; campo `Status` dela ainda é "Ready for Review" |

**Martelo nos 4 pontos que o @sm deixou em aberto** — ver, no corpo:
Decisão 2 (`/broker` **FICA**), Riscos §1 + AC2b (`unstable_retry` **ACEITO**, com fallback real
em vez de mitigação imaginária), Decisão 4 revisada (**1 teste puro**, não zero), Riscos §3
(gate **dev-only ACEITO**).

**Issues:** 0 críticas remanescentes · 4 must-fix **já corrigidos neste arquivo** (claim do
`analytics/page.tsx`; mitigação falsa do `tsc`; T4 corrompida por Fast Refresh; `.test.tsx` que
nunca roda) · 1 should-fix corrigido (limites de cobertura: route handlers e PDF em AC7d/e) ·
1 nice-to-have anotado (`Status` da 75-298). **Nada bloqueia o @dev.**

## Notas de processo

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled in `core-config.yaml`.
> Quality validation will use manual review process only.

- **CodeRabbit:** a chave `coderabbit_integration` **não existe** em
  `.aios-core/core-config.yaml` → seção não renderizada, validação por revisão manual (@qa),
  igual à 75-298.
- **ClickUp (passos 5.1/5.3/5.4 da task `create-next-story`):** pulado — o projeto não usa MCP
  ClickUp neste fluxo; nenhuma story do épico 75 tem frontmatter `clickup`. Story vale localmente.
- **Numeração conferida antes de escrever:** não há `docs/stories/75-299*` (além desta), não há
  branch remota com `75-299` (87 heads em `origin`, remoto alcançável), e a 75-298 está
  **mergeada** em `db0a8572`. Próxima livre depois desta: **75-300**.
  - ⚠️ **[@po] pequena imprecisão corrigida:** o draft dizia que a 75-298 "está **Done**". O
    merge é real (`db0a8572`), mas o campo `Status` do arquivo dela ainda diz **"Ready for
    Review"** — ou seja, falta o `@po *close-story 75-298`. Não afeta esta story (numeração e
    dependência técnica seguem válidas), fica anotado como pendência de processo.

## Change Log

- 2026-08-12 — @sm (River): story criada a partir do **follow-up C-1 (medium)** do QA gate da
  75-298. Escopo decidido em `/dashboard` + `/broker` (`/cliente` → follow-up).
  🔑 **Desvio consciente do direcionamento do lead:** o retry usa **`unstable_retry`**, não
  `reset` — Next instalado é `16.2.2` e o doc do próprio pacote diz que `reset` **não re-busca**,
  o que quebraria o único caso de uso desta story (falha transitória de fetch).
  🔑 **Correção de fato ao C-1:** existem 2 `error.tsx` no repo (ambos no `/cliente`); o "nenhum"
  do gate valia para `/dashboard` e `/broker`. Status: **Draft** → próximo passo `@po *validate`.
- 2026-08-12 — @po (Pax): validação **GO 9/10**, confiança ALTA. Status **Draft → Ready**.
  4 must-fix corrigidos no arquivo:
  1. 🔴 **Anti-alucinação:** `app/dashboard/analytics/page.tsx` **não** usa `fetchAllLeads`
     (só um comentário na linha 476) — o caminho medido é **1**, não 2. Context + mapa de
     arquivos corrigidos; a justificativa da story sobrevive com 1 caminho.
  2. 🔴 **Mitigação falsa do risco nº 1:** "o `tsc` denuncia na hora" é **falso** — o Next não
     gera validador de tipos para `error.tsx` (`.next/types/validator.ts` cobre só page/layout/
     route handler). Novo **AC2b**: `pickRetry({ unstable_retry, reset })` puro + `unstable_retry`
     tipado **opcional** → o fallback passa a ser exigido pelo nosso próprio tipo, e o pior
     cenário num upgrade é degradar para o comportamento pré-16.2 em vez de estourar `TypeError`.
  3. 🔴 **T4 daria falso PASS:** "remover a falha e clicar" dispara Fast Refresh, que remonta a
     árvore sozinho — a lista voltaria até com `reset`. Agora a falha é um **contador de módulo**
     que falha só na 1ª tentativa, e o único evento entre as duas observações é o clique.
  4. 🔴 **`.test.tsx` nunca roda** (`vitest.config.ts:12-16` inclui só `*.test.ts`) — o helper vai
     para `src/lib/ui/error-retry.ts` e o teste para `error-retry.test.ts`, com T5 exigindo a
     prova de que ele apareceu na saída do `vitest run`.
  Should-fix: AC7 ganhou (d) route handlers/PDF que usam `fetchAllLeads` **não** são cobertos e
  (e) event handler/async pós-render também não.
  🔨 **Martelos:** `/broker` **FICA** (shell idêntico conferido linha a linha; cortar economiza
  6 linhas e deixa a área de maior uso descoberta) · `unstable_` **ACEITO** (com mitigação real,
  não imaginária) · **1 teste puro** em vez de zero (a decisão apareceu, como a própria story
  previa; teste de componente segue impossível — sem jsdom) · validação **dev-only ACEITA**
  (provar em prod custaria um erro real na tela de um corretor e não ensinaria nada novo).
- 2026-08-12 — @dev (Dex, Opus 5, YOLO): implementação completa na branch
  `feat/75-299-dashboard-error-boundary` (de `main` @ `db0a8572`). Status **Ready → Ready for
  Review**. **5 arquivos novos, zero arquivo existente modificado** (`git diff main --stat`
  vazio), zero migration.
  🔑 **T4 PASS com a prova que o @po pediu:** a falha auto-extinguível (contador de módulo)
  permitiu que o **único** evento entre "vi o fallback" e "vi a lista" fosse o clique — e o log do
  servidor mostra `tentativa nº 1` (lançou) e, **após o clique**, `tentativa nº 2`, ou seja o
  server component **rodou de novo**. É o re-fetch que `reset()` não faria: a escolha do
  `unstable_retry` ficou provada em runtime, não só no doc. Falha forçada **revertida** e provada
  no diff. Conferido em tema claro **e** escuro, em execuções independentes.
  🔑 **AC2b re-conferido contra o build desta branch:** `.next/types/validator.ts` (4.201 linhas)
  tem **zero** menção a `error.tsx` → o `tsc` verde não prova a existência de `unstable_retry`; a
  rede é o `pickRetry` com fallback, coberto por 4 casos em `error-retry.test.ts` (provados na
  saída do `vitest run --reporter=verbose`).
  ⚠️ **Ressalva declarada:** o boundary do `/broker` **não** foi observado em runtime (sem
  credencial de corretor ativo) — AC5 apoiada em código + typecheck + build.
  ⚠️ **3 achados de infra pré-existentes** registrados no Dev Agent Record (turbo mascarando
  `@trifold/shared#build` quebrado por falta de `@types/node`; `.next/dev/types` corrompido ao
  matar o `next dev`; `console.error` 2× em dev por double-invoke do React).
  3 desvios menores documentados: deps `[error, scope]`, `digest` em `stone-500`, `error.message`
  exibido. **Sem commit e sem push** — git é do lead/@devops.
