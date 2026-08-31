# Story 900-57 — A Casca da Empresa: `/platform/orgs/[id]` com abas

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Frente 2 ("Console"), Fase 1 — entregas 1.2 + 1.3 de `docs/ux/console-plataforma.md`
  §6, combinadas (ver "Por que combinadas").
- **Story:** 900-57 — próximo número livre (900-56 é a anterior desta mesma leva; verificado
  contra `git fetch --prune` em 2026-08-31, sem colisão).
- **Status:** Ready for Review
- **Priority:** P0 — **é a correção estrutural principal do desenho do @ux.** Hoje
  `/platform/orgs/[id]` não existe como rota; só existe `/platform/orgs/[id]/integracoes`, uma
  tela solta que usa a paleta `stone-*` (do `/dashboard`) em vez de `slate-*` (do console) — e é
  isso que faz o painel "parecer uma cópia de uma empresa" (`console-plataforma.md` §0, citação
  direta do dono do produto).
- **Complexity:** M.
- **Depends on:** nenhuma story de código nova. Reaproveita `org_integrations`, `platform_audit_log`
  e `users`, já em `PLATFORM_READABLE_TABLES`. **Não depende de `900-42a`**: nenhuma consulta desta
  story usa embedding, e nenhum dado exibido é "de dentro da empresa" no sentido do SEC-001 (é
  identidade/status/trilha, todos dentro das 5 tabelas permitidas — regra de segurança da casca,
  `console-plataforma.md` §3.3). Recomenda-se sequenciar depois de `900-56` (nav), mas não é bloqueio
  técnico.

### Por que 1.2 (casca+abas) e 1.3 (correção de paleta) viraram uma story só
**[AUTO-DECISÃO]** Absorver a tela de integrações para dentro da casca (1.2) sem corrigir a
paleta (1.3) entregaria exatamente o defeito que motivou o pedido: uma aba dentro do console
ainda pintada como o CRM do cliente. As duas mudanças resolvem, juntas, a mesma queixa — separar
teria produzido um estado intermediário pior que o atual.

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @dev (pre-commit).
- **Quality Gate Tools:** `[code_review]`.

---

## User Story
**Como** operador da Trifold,
**eu quero** abrir uma empresa e ver uma casca própria — identidade, administrador, status de
integrações, e placeholders honestos para o que ainda não existe (plano, uso) —, com abas
(Resumo, Plano, Uso, Integrações, Usuários, Trilha) na MESMA linguagem visual do resto do
console,
**para que** o console pare de parecer um enxerto do CRM do cliente dentro do painel da Trifold.

---

## Acceptance Criteria

**AC1 — `/platform/orgs/[id]` nasce como rota real, com casca.**
Cria-se `packages/web/src/app/platform/orgs/[id]/layout.tsx`: busca a org via `platformQuery
("organizations", "id, name, slug, is_active, created_at")`, chama `notFound()` (de
`next/navigation`) se não existir. Renderiza: link "← Empresas"; faixa de identidade com borda
esquerda âmbar (nome, slug, status ativa/inativa); nav de 6 abas (Resumo · Plano · Uso ·
Integrações · Usuários · Trilha), todas `slate-*`.

**AC2 — Resumo é a rota default (`/platform/orgs/[id]`), 100% dado real ou "fundação ausente".**
Cria-se `packages/web/src/app/platform/orgs/[id]/page.tsx` com 3 blocos com dado real e 2 com
placeholder honesto — nunca `0`:
1. **Identidade** (dado A: `organizations`) — nome, identificador (slug), criada em, status. **Sem
   botão "Editar"** — não existe rota de edição de org nesta story nem em nenhuma story anterior;
   incluir o botão seria prometer uma ação que não existe (Artigo IV).
2. **Administrador** (dado A: `users` + a mesma lógica de `deriveAdminInviteStatus` já usada em
   `orgs/page.tsx`) — e-mail, status do convite, botão "Reenviar convite" quando pendente
   (reaproveita `<ReenviarConvite orgId={...} />`).
3. **Integrações** (dado A: `org_integrations` + `whatsapp_config`, reaproveitando
   `montarTilesDoPainel`) — resumo compacto (nome do provider + badge de status, sem os campos de
   edição), com link "Ver integrações" para a aba Integrações.
4. **Plano & Cobrança** — card "○ Fundação ausente — planos e faturas ainda não existem no
   sistema" (texto do desenho §3.3), sem número nenhum.
5. **Uso (30 dias)** — card "○ Medição ausente — nenhum contador por empresa existe hoje", sem
   número nenhum.
6. **Últimas ações da plataforma** — até 5 linhas de `platform_audit_log` filtradas por
   `org_id`, ordenadas por `created_at DESC` (reaproveita o padrão de consulta já usado em
   `integracoes/page.tsx:53-60`, sem o filtro `target_table`). Vazio: "Nenhuma ação registrada.".
   Link "Ver trilha" para a aba Trilha desta mesma story (AC5) — **não** para `/platform/trilha`
   cross-org (essa é a story `900-59`, que ainda não existe quando esta for implementada; a aba
   local não depende dela).

**AC3 — Integrações vira aba, com a MESMA URL de hoje.**
`app/platform/orgs/[id]/integracoes/page.tsx` continua em `/platform/orgs/[id]/integracoes` —
não muda de rota (evita quebrar qualquer link salvo) — mas passa a renderizar DENTRO da casca
(herda o `layout.tsx` de AC1 automaticamente, por estrutura de pastas do Next.js). O conteúdo
funcional da tela (5 tiles graváveis + Google somente-leitura + trilha local) **não muda** — só a
paleta (AC4).

**AC4 — Correção de paleta: `stone-*` → `slate-*`, via prop no componente compartilhado.**
`packages/web/src/components/integrations/integrations-panel.tsx` (usado por `/platform` E por
`/dashboard/configuracoes/integracoes`) ganha uma prop nova, ex. `palette?: "stone" | "slate"`,
default `"stone"` — **o `/dashboard` não muda de aparência** (nenhum comportamento visual novo
sem a prop). `/platform/orgs/[id]/integracoes/page.tsx` passa `palette="slate"`. O card do Google
(fora do componente compartilhado, dentro do próprio `integracoes/page.tsx`) troca as classes
`stone-*` por `slate-*` diretamente (é local, não precisa de prop).

**[@po 2026-08-31] Duas precisões medidas, para o @dev não tropeçar:**
- **Contagem real:** `grep -c 'stone-'` devolve **18** linhas em `integrations-panel.tsx` (a
  Dev Note diz 16) e **8** linhas em `integracoes/page.tsx`. Consumidores do componente
  compartilhado: exatamente **2** (`/platform/orgs/[id]/integracoes` e
  `/dashboard/configuracoes/integracoes`) — nenhum terceiro.
- **`components/integrations/**` é território vigiado.** `dashboard-platform-boundary.test.ts`
  (900-51/AC9) proíbe que qualquer arquivo sob `components/integrations/**` importe `platformQuery`
  ou o caminho de leitura de plataforma — é a defesa contra o componente compartilhado virar ponte
  do service-role para o `/dashboard`. **A prop `palette` é puramente de apresentação e não
  esbarra nisso** — mas resolver diferença de paleta buscando dado dentro do componente, sim.
  O dado continua descendo por props, como hoje.

**AC5 — Trilha vira aba, com dado real (org-scoped).**
Cria-se `packages/web/src/app/platform/orgs/[id]/trilha/page.tsx`: lista `platform_audit_log`
filtrada por `org_id`, ordenada por `created_at DESC`, sem paginação nesta fase (limite razoável,
ex. 100 linhas — esta story não decide filtro de período, isso é uma melhoria futura). Vazio:
"Nenhuma ação registrada ainda.". **Extrair a lógica de renderização de uma linha de trilha (ator,
ação, quando) para um componente pequeno reaproveitável** — a story `900-59` (Trilha cross-org) o
reaproveita, em vez de duplicar o JSX.

**AC6 — Plano, Uso e Usuários nascem como abas-esqueleto, honestas.**
Três rotas novas (`.../plano`, `.../uso`, `.../usuarios`), cada uma só com um card "○ Fundação
ausente" e uma frase dizendo o que falta (ex. Plano: "planos e módulos ainda não existem no
sistema — depende das tabelas `plans`/`org_subscriptions`"; Uso: idem, "depende de um agregado de
uso por empresa"; Usuários: "listagem de usuários da empresa ainda não foi construída — o card
Administrador do Resumo já mostra o admin"). **Nenhuma consulta a tabela nova, nenhuma promessa de
prazo.** Isto só existe para que a navegação de abas seja completa desde o primeiro dia (regra do
desenho: "a forma final fica visível desde o dia 1").

**AC7 — Empresa inexistente devolve 404 de verdade, não uma tela em branco.**
`notFound()` do `next/navigation` na `layout.tsx` (AC1) cobre as 6 abas de uma vez — nenhuma
precisa reimplementar a checagem.

---

## Tasks / Subtasks

- [x] **Task 1 (AC1, AC7) — Casca**
  - [x] 1.1 Criar `platform/orgs/[id]/layout.tsx`: busca da org, `notFound()`, faixa de
    identidade, nav de 6 abas
- [x] **Task 2 (AC2) — Resumo**
  - [x] 2.1 Criar `platform/orgs/[id]/page.tsx` com os 6 blocos
  - [x] 2.2 Reaproveitar `deriveAdminInviteStatus`, `<ReenviarConvite />`, `montarTilesDoPainel`
- [x] **Task 3 (AC3, AC4) — Integrações movida + paleta**
  - [x] 3.1 Adicionar prop `palette` em `integrations-panel.tsx`, threadar pelos subcomponentes
    (`Tile`, `Badge`) que hoje hardcodam `stone-*` (16 ocorrências, ver Dev Notes)
  - [x] 3.2 `integracoes/page.tsx`: passar `palette="slate"`, trocar as classes locais do card do
    Google
- [x] **Task 4 (AC5) — Trilha (aba)**
  - [x] 4.1 Criar `platform/orgs/[id]/trilha/page.tsx`
  - [x] 4.2 Extrair componente de linha de trilha reaproveitável
- [x] **Task 5 (AC6) — Abas-esqueleto**
  - [x] 5.1 Criar `.../plano/page.tsx`, `.../uso/page.tsx`, `.../usuarios/page.tsx`
- [x] **Task 6 — Testes**
  - [x] 6.1 `pnpm --filter web type-check` limpo
  - [x] 6.2 Conferir que `/dashboard/configuracoes/integracoes` não mudou visualmente (palette
    default preservado)

---

## Dev Notes

### Arquivos existentes relevantes (todos já lidos nesta sessão)
- `packages/web/src/app/platform/orgs/[id]/integracoes/page.tsx` (118 linhas) — a tela órfã que
  vira aba. **Não muda de path.**
- `packages/web/src/components/integrations/integrations-panel.tsx` (334 linhas) — componente
  compartilhado. `grep -n "stone-" integrations-panel.tsx` devolve 16 ocorrências (linhas 80-87,
  157-322 aproximadamente) — todas precisam da prop `palette` para virar condicionais. `Tile` é um
  componente-função separado dentro do mesmo arquivo (linha 96) e também usa `stone-*` — precisa
  receber `palette` como prop própria, não só o componente-pai.
- `packages/web/src/lib/tenancy/admin-invite.ts` — `deriveAdminInviteStatus()`.
- `packages/web/src/app/platform/orgs/_components/reenviar-convite.tsx` — componente já pronto,
  recebe `orgId`.
- `packages/web/src/lib/integrations/painel/providers.ts` — `montarTilesDoPainel()`.

### Migration 248 — `platform_audit_log`
Colunas: `id, actor_user_id, actor_type, org_id, action, target_table, target_id, metadata,
created_at`. Índice `(org_id, created_at DESC)` já existe — a query desta story (AC2 e AC5) usa
exatamente esse índice, sem scan.

### `notFound()` em layout do App Router
Layouts do Next.js **podem** chamar `notFound()` (de `next/navigation`) durante a renderização —
o comportamento é o mesmo de uma page: renderiza o `not-found.tsx` mais próximo (ou o genérico, se
não houver um customizado em `platform/`). Evita reimplementar "Empresa não encontrada" em 6
lugares.

### Sobre `google_oauth_tokens`
A leitura específica de `google_oauth_tokens` que `integracoes/page.tsx` já faz (linha 34)
**continua nessa mesma página** — o `layout.tsx` novo (AC1) só busca `id, name, slug, is_active,
created_at`, sem esse campo. Pequena duplicação de fetch de `organizations` entre layout e página
é aceitável e já é o padrão do repositório (cada rota confirma a org de novo, ex.
`resend-admin-invite/route.ts`).

---

## Testing

- **Framework:** nenhum teste de render de componente React (sem infra de testing-library para
  RSC neste projeto). Foco em `type-check` e revisão manual da paleta.
- **Cenários manuais a documentar no Dev Agent Record:**
  1. `/platform/orgs/{id-existente}` → Resumo renderiza os 6 blocos.
  2. `/platform/orgs/{id-inexistente}` → 404.
  3. `/platform/orgs/{id}/integracoes` → mesma URL de antes, agora com paleta `slate-*` e dentro da
     casca.
  4. `/dashboard/configuracoes/integracoes` (do cliente) → paleta **inalterada** (`stone-*`).
- **Gate de tipos:** `pnpm --filter web type-check` limpo.

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
| 2026-08-31 | 0.1 | Draft inicial — casca da empresa + correção de paleta, a correção estrutural principal do desenho do @ux. | @sm (River) |
| 2026-08-31 | 0.2 | **Validada pelo @po (Pax) — GO, nota 8/10.** GO. Nenhum defeito bloqueante. Acrescentadas à AC4 duas precisões medidas (18 linhas `stone-`, não 16; 2 consumidores; a régua `dashboard-platform-boundary.test.ts` que vigia `components/integrations/**`). Status Draft → Ready. | @po (Pax) |
| 2026-08-31 | 0.3 | **Implementada.** Todas as 7 ACs entregues e verificadas no ambiente de teste com sessão real de platform admin (404 → 200 nas 6 abas; 404 de verdade para empresa inexistente). A paleta do `/dashboard` foi provada por **comparação de markup renderizado** entre `main` e a branch, não por inspeção visual. ⚠️ *Corrigido na v0.4: a frase original dizia "inalterada", e a medição sustentava menos que isso — ver QA-900-57-2.* Status Ready → Ready for Review. | @dev (Dex) |
| 2026-08-31 | 0.4 | **Concerns do gate fechadas (QA-900-57-1/2/3).** A régua da AC4 fechou a CLASSE, não só as duas instâncias: `linhasDeCodigo()` única (filtrando `*`, `//`, `/*` e `{/*`) nas quatro asserções de texto-fonte, e recorte DELIMITADO de call site (`<Tag` até o `/>` que o fecha) no lugar do `slice` até o EOF — os três furos (q8, M3, q4c) reproduzidos VERDES antes e VERMELHOS depois, com `tsc` rc=0 nos seis casos, mais um controle positivo por furo. `campoMono` acrescentado à tabela de paletas: `` `${classes.campo} font-mono` `` concatenava e mudava a ordem dos tokens do campo de senha; agora o valor é byte a byte o da `main@1393fa68`. `rotuloDoAtor` exportado e coberto nos 4 caminhos. | @dev (Dex) |
| 2026-08-31 | 0.5 | **Rodada 3 — os 4 achados do CodeRabbit (PR #547) fechados, e medidos.** As três telas da casca afirmavam "empresa não existe", "○ inativa", "Nenhum administrador convidado", "○ Não conectado" e "Nenhuma ação registrada" a partir de consultas que descartavam o `error`; a Trilha acendia "há mais registros" sem evidência de uma linha a mais. Novos `console-leitura.ts` (vocabulário dos três estados, `falhou` obrigatório) e `fonte-scan.ts` (os primitivos de varredura saíram de `console-paleta.test.ts`). ⚠️ **Os consertos entraram em produção ANTES de existir régua, e a mutação mostrou que três eram decorativos.** Ver Dev Agent Record → "Rodada 3", inclusive os três comentários que citavam uma régua inexistente e os dois defeitos da própria régua. | @dev (Dex) |

## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M) — @dev (Dex), modo YOLO autônomo.

### O antes e o depois, medidos — não descritos

`/platform/orgs/[id]` de fato não era rota. Com cookie de sessão de um platform admin real contra
`https://trifold-crm-teste.vercel.app` (que segue a `main`):

| Rota | `main` | branch (local, MESMO banco de teste) |
|---|---|---|
| `/platform/orgs/{id}` | **404** | **200** — Resumo com os 6 blocos |
| `/platform/orgs/{id}/plano` · `/uso` · `/usuarios` · `/trilha` | **404** nas quatro | **200** nas quatro |
| `/platform/orgs/{id}/integracoes` | 200 (solta, sem casca) | 200, dentro da casca |
| `/platform/orgs/{uuid-inexistente}` | 404 | **404** (AC7 — `notFound()` do layout, uma vez para as 6 abas) |

A medição foi feita **autenticada** de propósito: sem cookie, toda rota de `/platform` responde
`307 → /login`, e nesse estado "404" e "não autenticado" são indistinguíveis.

### AC4 — a prova de que o `/dashboard` não mudou é o MARKUP, não o olho

"Conferir que a tela do cliente não mudou visualmente" é o tipo de checagem que passa por
inspeção distraída. O que foi feito: buscar `/dashboard/configuracoes/integracoes` **na `main`**
(ambiente de teste) e **na branch** (local), com a mesma sessão, e comparar as classes de fato
renderizadas nos 5 tiles e nos badges.

- `main` → `tile-*: rounded-lg border border-stone-800 bg-stone-900 p-5`; badge neutro
  `bg-stone-500/15 text-stone-300`.
- branch → **exatamente as mesmas strings**, nos 5 tiles e nos 3 badges.
- `/platform/orgs/{id}/integracoes` na branch → `border-slate-800 bg-slate-900` nos 5 tiles, badge
  neutro `bg-slate-500/15 text-slate-300`, e o badge do card do Google (fora do componente
  compartilhado) também em `slate`.

A prop é de apresentação e não esbarra em `dashboard-platform-boundary.test.ts` — nenhum dado
entra ou sai por ela, e o componente continua sem importar o caminho de leitura de plataforma
(a régua roda e passa).

### Onde a paleta ficou, e por que o carrasco não é "o teste da prop"

A tabela de classes mora em `components/integrations/paleta.ts`, **fora** do componente. Isso é o
que torna possível a régua central de `lib/tenancy/console-paleta.test.ts`: *zero literal de
escala de cinza sobrevive dentro de `integrations-panel.tsx`*, e *zero classe da escala do CRM
sobrevive em `app/platform/**`*. Um teste que só chamasse a função de paleta ficaria verde com
metade dos 18 lugares ainda remendados — que é o defeito da story, só que menor.

Duas fugas encontradas e fechadas durante a construção da própria régua, ambas medidas:
1. `expect(fonte).toContain("classes={classes}")` passava VERDE com o `classes` do `<Tile>`
   apagado, porque o `<Badge>` sozinho já satisfazia a busca. Agora os dois call sites são
   medidos separadamente.
2. `expect(fonte).toContain('palette="slate"')` passava VERDE com a prop apagada do JSX, porque um
   **comentário de topo** citava `palette="slate"` em prosa. O comentário foi reescrito **e** a
   medição foi estreitada para linhas que não são comentário — as duas coisas, porque qualquer uma
   sozinha volta a apodrecer no próximo PR.

Interpolação (`` `bg-${paleta}-900` ``) foi recusada: Tailwind v4 descobre classe varrendo
texto-fonte, e uma classe montada em runtime **não existe no CSS gerado**. A tela sairia sem fundo
e sem borda, e nada nesta base reprovaria isso.

### Consequências da AC1 sobre a AC3 que a story não previu

A AC3 diz que o conteúdo da tela de integrações "não muda, só a paleta". Mas a casca da AC1 passou
a renderizar `← Empresas` e o nome da empresa — que a página já tinha. Manter os dois mostraria o
link de volta e a identidade **duas vezes na mesma tela**. Removi os da página (o `<h1>` virou um
`<h2>` "Integrações", sem repetir o nome da empresa) e o import de `Link`, que ficou órfão.

### Refatoração pequena, e o motivo dela

A tradução `status → rótulo + tom` saiu de dentro de `integrations-panel.tsx` para
`lib/integrations/painel/providers.ts`. Motivo: o card "Integrações" do Resumo é uma **segunda**
superfície mostrando status de integração, e duas traduções do mesmo `status` são o começo de
duas telas do console discordando sobre o mesmo fato — que é literalmente a QA-900-51-2.

Pelo mesmo motivo, o Resumo monta os tiles por `montarTilesDoPainel()` e lê `whatsapp_config`:
com a Empresa A em `whatsapp_config.status='active'`, o card mostrou **"WhatsApp ● Conectado"**.
Lendo só `org_integrations` diria "Não conectado" sobre um canal no ar.

### O que o Resumo NÃO pede, de propósito

A projeção de `org_integrations` no Resumo é `provider, status` — **sem** a coluna que aponta para
o cofre do Vault. Ela só serve para "configurado / não configurado", que é assunto da aba
Integrações. Isso também mantém a página **fora** da lista autorizada de `nao-consumo.test.ts`
(AC6 da 900-51): entrar naquela lista, ainda que por menção em comentário, é abrir mão de a régua
acender no dia em que a página passar a ler o cofre de verdade. A régua chegou a acender por uma
menção em comentário durante a construção, e o conserto foi **reescrever o comentário**.

### Completion Notes List

- Sem botão "Editar" na Identidade (AC2.1): não existe rota de edição de org em story nenhuma.
- "Ver trilha" aponta para a aba local, **não** para `/platform/trilha` — que não existe (404
  medido) e é da `900-59`.
- O card Uso diz "**Medição** ausente" e não "Fundação ausente" (texto literal da AC2.5): aqui o
  dado cru existe, o que falta é o agregado — e a distinção importa para quem for construí-lo.
- **Não provado na tela:** o card "Últimas ações da plataforma" e a aba Trilha com CONTEÚDO.
  `platform_audit_log` tem **0 linhas** no banco de teste, e ela é append-only por trigger +
  `REVOKE` — inserir uma linha para tirar um print seria sujeira permanente numa tabela que não
  aceita `DELETE`. Os dois estados vazios foram vistos; o componente de linha extraído
  (`LinhaDaTrilhaDaPlataforma`) é exercitado só por type-check.
- **Não provado na tela:** o Resumo com convite de admin **pendente**. As três contas do ambiente
  de teste têm admin ativo, e forjar a pendência exigiria anular o `auth_id` de uma conta de login
  viva.

### File List

**Criados**
- `packages/web/src/app/platform/orgs/[id]/layout.tsx`
- `packages/web/src/app/platform/orgs/[id]/page.tsx`
- `packages/web/src/app/platform/orgs/[id]/plano/page.tsx`
- `packages/web/src/app/platform/orgs/[id]/uso/page.tsx`
- `packages/web/src/app/platform/orgs/[id]/usuarios/page.tsx`
- `packages/web/src/app/platform/orgs/[id]/trilha/page.tsx`
- `packages/web/src/app/platform/orgs/_components/abas-da-empresa.tsx`
- `packages/web/src/app/platform/_components/linha-da-trilha.tsx`
- `packages/web/src/components/integrations/paleta.ts`
- `packages/web/src/lib/tenancy/console-paleta.test.ts`
- `packages/web/src/app/platform/_components/linha-da-trilha.test.ts` *(rodada 2 — QA-900-57-3)*
- `packages/web/src/lib/tenancy/console-leitura.ts` *(rodada 3 — o vocabulário dos três estados)*
- `packages/web/src/lib/tenancy/fonte-scan.ts` *(rodada 3 — os primitivos de varredura de texto-fonte)*

**Modificados**
- `packages/web/src/app/platform/orgs/[id]/layout.tsx` *(rodada 3 — o `error` que virava `notFound()` por acidente)*
- `packages/web/src/app/platform/orgs/[id]/page.tsx` *(rodada 3 — as CINCO consultas)*
- `packages/web/src/app/platform/orgs/[id]/trilha/page.tsx` *(rodada 3 — `LIMITE + 1` e o `haMais` com evidência)*
- `packages/web/src/lib/tenancy/console-paleta.test.ts` *(rodada 3 — helpers extraídos para `fonte-scan.ts`)*
- `packages/web/src/app/platform/orgs/[id]/integracoes/page.tsx`
- `packages/web/src/components/integrations/integrations-panel.tsx`
- `packages/web/src/components/integrations/paleta.ts` *(rodada 2 — `campoMono`)*
- `packages/web/src/app/platform/_components/linha-da-trilha.tsx` *(rodada 2 — `rotuloDoAtor` exportado)*
- `packages/web/src/app/platform/layout.tsx` *(rodada 2 — o comentário da `900-59`)*
- `packages/web/src/lib/integrations/painel/providers.ts`

### Fechamento das concerns do gate (rodada 2) — QA-900-57-1/2/3

**QA-900-57-1 — a classe, não as instâncias.** O @qa tem razão sobre o erro de método: eu tinha
consertado as duas asserções que me morderam e deixado as outras duas como estavam. Reproduzi os
três furos ANTES de tocar em nada, para não consertar uma hipótese: os três saíram `tsc` rc=0 com
a régua **10/10 VERDE**, exatamente como o gate descreve.

O conserto é uma função só, usada nas quatro asserções de texto-fonte, mais um recorte delimitado:

- `linhasDeCodigo()` filtra `*`, `//`, `/*` **e `{/*`** — a quarta forma é a idiomática dentro de
  JSX num `.tsx`, e era a que passava (q4c).
- `callSiteDe(fonte, tag)` recorta de `<Tag` até o `/>` **que o fecha**, em vez de fatiar até o fim
  do arquivo. Era o `slice` até o EOF que fazia o recorte do `<Badge>` conter o do `<Tile>` (M3):
  o conjunto de morte do Badge era superset do do Tile, e a asserção do Badge só acendia quando os
  dois perdessem a prop. Agora os dois recortes são disjuntos, e a régua afirma isso
  explicitamente (`doTile` não contém `<Badge`, e vice-versa).
- A varredura de COR (`linhasComEscala`) **continua medindo o arquivo inteiro**, de propósito: ali
  ignorar comentário afrouxaria uma afirmação absoluta. O filtro é só para as asserções positivas.

E um controle positivo por furo, envenenando a fonte real com a forma exata que escapava — e cada
um afirma também que a forma ANTIGA da asserção continuaria verde, que é a medida do que se ganhou.
Os três são fail-closed: se a âncora do envenenamento não casar (reindentação, renomeação), o
`not.toBe(fonte)` reprova em vez de aprovar por mutação inerte.

| furo | forma | com a régua ANTIGA | com a régua NOVA | tsc |
|---|---|---|---|---|
| q8 | comentário citando `classesDaPaleta(palette)` | 10/10 VERDE | **2 VERMELHOS** | rc=0 nos dois |
| M3 | só o call site do `<Badge>` perde a prop | 10/10 VERDE | **2 VERMELHOS** | rc=0 nos dois |
| q4c | comentário JSX `{/* … */}` no lugar da prop | 10/10 VERDE | **2 VERMELHOS** | rc=0 nos dois |

**Nota de método, medida durante o trabalho:** a primeira forma que escrevi para o q4c punha o
`{/* … */}` em posição de ATRIBUTO, dentro da tag — e isso é erro de sintaxe (`tsc` rc=2, TS1005).
Se eu tivesse contado aquele vermelho, teria creditado ao teste um mérito do compilador. A forma
que o @qa mediu é a de posição de FILHO, e é essa que compila e escapava.

**QA-900-57-2 — a frase e a medição.** A frase do Change Log foi corrigida (v0.3 agora aponta para
esta rodada), e escolhi também o conserto mais forte que o @qa sugeriu: `campoMono` é um papel
próprio na tabela. `` `${classes.campo} font-mono` `` CONCATENA — o token ia para o fim da string em
vez do meio, e era exatamente essa a diferença dos 4 atributos que ele achou. Agora o valor de
`PALETAS.stone.campoMono` é **byte a byte** o `class` do `<input type="password">` em
`main@1393fa68`, e há um `it` que ancora nessa string literal (montada sem o prefixo da escala,
para o arquivo da régua não conter o literal que ele varre) e reprova a volta da concatenação.
Conferi também que a adição não quebrou a descoberta do Tailwind: os tokens de cor das duas
paletas continuam no CSS emitido pelo `build`.

**QA-900-57-3 — a justificativa que não se aplicava.** Ele está certo: `linha-da-trilha.tsx` é
render puro de objeto simples. `rotuloDoAtor` foi exportada e ganhou 5 `it` cobrindo os 4 caminhos
(`actor_label` string útil / ausente / vazia ou só espaço / de tipo errado) mais uma guarda de
vivacidade sobre a própria constante do rótulo — sem ela, `ATOR_SEM_ROTULO = ""` deixaria os
quatro caminhos verdes com a coluna "quem" em branco na tela.

O arquivo é `.test.ts` e **não** `.test.tsx`: o `include` do `vitest.config.ts` casa só `*.test.ts`,
então um `.tsx` existiria no repositório e nunca rodaria — pior que não existir.

| # | mutação | tsc | resultado |
|---|---|---|---|
| m5 | `rotuloDoAtor` sem `.trim()` | rc=0 | 1 VERMELHO |
| m6 | `rotuloDoAtor` sem a guarda `typeof === "string"` | rc=0 | 1 VERMELHO |
| m7 | `ATOR_SEM_ROTULO` vira `""` | rc=0 | 1 VERMELHO |

**Um achado meu, não pedido pelo gate:** o primeiro fixture que escrevi usava
`00000000-0000-0000-0000-000000000001` como `id` da linha de trilha — que é o `organizations.id`
da Trifold. `trifold-org-literal.test.ts` reprovou na suíte cheia. Corrigi **movendo o fixture para
fora da população vigiada** (um UUID sintético), não acrescentando o arquivo à lista de
autorizados: entrar naquela lista custa a régua no dia em que o literal aparecer ali de verdade.

#### Registro corrigido

O comentário de `app/platform/layout.tsx` dizia que a `900-59` "ainda não foi escrita". Ela existe
na árvore (`docs/stories/900-59-trilha-de-plataforma.story.md`, **Status `Ready`**), só não está
commitada. O comentário agora diz o estado certo e nomeia o que muda quando ela entrar.

#### Réguas (rodada 2)

Medidas na mesma árvore de trabalho compartilhada (os 6 arquivos não commitados da `900-55`
continuam intocados). Detalhe do delta no gate irmão da `900-56`.

| medição | valor |
|---|---|
| suíte | **300 arquivos · 3.985 `passed` · 6 xfail (3.991 total)** · rc=0 |
| delta sobre o baseline `297 / 3.934 / 6` | **+3 arquivos · +51 testes · xfail inalterado** |
| `turbo lint --force` | rc=0 — 0 erros, 30 warnings, nenhum em arquivo desta leva |
| `turbo type-check --force` | rc=0 — 8/8 |
| `build` de `packages/web` | rc=0; tokens de cor das duas paletas presentes no CSS emitido |

### Rodada 3 — os 4 achados do CodeRabbit (PR #547) na casca da empresa

**A ordem foi a errada, e está registrada como aconteceu:** os consertos entraram no código de
PRODUÇÃO **antes** de existir régua. Só depois escrevi `console-fail-closed.test.ts` e mutei os
consertos — **três dos quatro saíram VERDES com o conserto neutralizado**. Eram decorativos:
certos no comportamento, indefesos contra a próxima edição. O gêmeo deste registro está na
`900-56`; aqui ficam as três telas da casca.

Os três achados desta story são a mesma classe: o PostgREST não lança em falha — devolve
`{ data: null, error }` — e `data ?? []` transforma "não consegui ler" em "li e não havia nada",
que vira **texto** na tela.

| arquivo | o que a tela afirmava sem ter medido |
|---|---|
| `orgs/[id]/layout.tsx` | "empresa não existe". O destino continua `notFound()` — fail-closed — mas agora por leitura explícita do `error`, e não por acidente do `?? []`. |
| `orgs/[id]/page.tsx` | as **cinco** consultas descartavam o `error`: `○ inativa` sobre empresa no ar, "Nenhum administrador convidado", "○ Não conectado" nos 4 tiles (a QA-900-51-2 por outra porta) e "Nenhuma ação registrada". |
| `orgs/[id]/trilha/page.tsx` | "há mais registros que esta tela ainda não pagina" — com `.limit(LIMITE)` e exatamente `LIMITE` linhas, o aviso acendia sem existir uma 101ª linha. |

`console-leitura.ts` é o vocabulário dos três estados, com o `falhou` como campo **obrigatório**:
esquecê-lo é erro de compilação, não uma tela que mente. `fonte-scan.ts` tirou
`linhasDeCodigo`/`codigoDe`/`callSiteDe` de `console-paleta.test.ts` porque um **segundo** arquivo
de régua passou a precisar deles — a terceira cópia de um detector que já ficou verde três vezes
com a prop de paleta neutralizada seria o começo do apodrecimento.

#### Três comentários afirmavam uma régua que não existia

Enquanto os consertos estavam sem carrasco, três comentários no código já citavam
`console-fail-closed.test.ts` como se ele existisse. É **exatamente a classe de defeito que esta
story persegue** — afirmar um fato que ninguém mediu — cometida dentro dela. Hoje o arquivo existe
e mede o que os comentários prometem; houve uma janela em que a prosa era a única prova.

#### As três mutações, cada uma com `tsc --noEmit` rc=0 medido ANTES da contagem

| # | mutação | tsc | antes da régua | agora |
|---|---|---|---|---|
| r1 | `adminsIndisponiveis: adminsFalhou` → `false` no call site | rc=0 | VERDE | **3 VERMELHOS** |
| r2 | apagar os ramos `desconhecido`/`falhou` nos 3 arquivos de tela | rc=0 | VERDE | **13 VERMELHOS** |
| r3 | `.limit(LIMITE_DE_LINHAS)` + `haMais: linhas.length >= limite` | rc=0 | VERDE | **4 VERMELHOS** |

Os 4 arquivos de produção foram restaurados e conferidos por `shasum -c`.

**Correção a uma instrução recebida:** a metade `>=` da r3 **não** vive em
`orgs/[id]/trilha/page.tsx` — a página só passou a buscar `LIMITE_DE_LINHAS + 1`. O predicado está
em `lib/tenancy/console-leitura.ts`, em `recortarComExcedente` (`haMais: linhas.length > limite`).
A mutação completa exige tocar os dois arquivos, e é por isso que ela mata 4 testes.

#### Dois defeitos na própria régua — consertados no TESTE, com o código de produção certo

1. **A asserção media no lugar errado.** A ordem "o ramo do fail-closed vem ANTES da frase que
   afirma ausência" era medida sobre o recorte; o recorte da Trilha fecha no `</div>` do próprio
   aviso e a frase mora fora dele, então `indexOf` devolvia `-1` e a régua reprovava uma tela
   correta. Medir sobre o **arquivo cru** seria pior: a Trilha **cita** "Nenhuma ação registrada
   ainda" num comentário **acima** do ramo, e a citação inverte a ordem — falso vermelho. Conserto:
   medir só sobre **código** (`codigoDe`) e exigir as **duas âncoras únicas**
   (`ocorrenciasNoCodigo(...) === 1`), senão o `indexOf` compara um par arbitrário.
2. **O número esperado era conferido contra a fonte já envenenada.** No controle positivo que
   apaga o ramo do cartão "Administrador" do Resumo. **Não** troquei 3 por 2: o `3` ficou ancorado
   na fonte **correta** e o da envenenada passou a ser derivado como `N − 1` — é o **par** que
   prova que o veneno apagou exatamente um ramo.

#### Correção ao delta de testes que circulou

O `+15` que circulou **não era desta frente**. Contado por arquivo: daqui saiu
`console-fail-closed.test.ts` (48 testes) e um `it` novo em `console-visao-geral.test.ts`;
`console-paleta.test.ts` só perdeu os helpers para `fonte-scan.ts`, sem mudar de contagem. O resto
do movimento da suíte é de frentes vizinhas na mesma árvore compartilhada.

#### Réguas (rodada 3)

| medição | valor |
|---|---|
| suíte cheia | **301 arquivos · 4.034 `passed` · 6 xfail (4.040 total)** · rc=0 |
| baseline sem o arquivo novo | 300 · 3.986 · 6 |
| delta | **+1 arquivo · +48 testes · xfail INALTERADO** |
| `tsc --noEmit` | rc=0 |
| `eslint` | rc=0 |


## QA Results

### Gate: **CONCERNS** — @qa (Quinn), 2026-08-31
**Arquivo:** `docs/qa/gates/900.57-casca-da-empresa-com-abas.yml`
**Base medida:** `cc8383f0` sobre `b968387e` sobre `1393fa68`, na árvore de trabalho real.

**O produto está certo. A régua que o protege tem três furos — todos com `tsc` rc=0 e a régua
inteira 10/10 verde. Nenhum defeito vivo, nenhuma regressão.**

#### A prova de não-regressão do CRM — reproduzida, e o que ela realmente diz
Reconstruí o A/B renderizando o **mesmo componente** de `main@1393fa68` e da branch com a **mesma
entrada** (`renderToStaticMarkup`, harness fora da árvore, sem sessão e sem banco), cobrindo os 3
tons de badge e os 5 tiles:

- **77 atributos `class`; 73 idênticos, 4 diferentes.**
- As 4 são os `<input type="password">` dos tiles graváveis: `font-mono` mudou de posição
  (`… px-2 py-1 font-mono text-sm text-stone-100` → `… px-2 py-1 text-sm text-stone-100 font-mono`),
  por causa de `` `${classes.campo} font-mono` ``. **Mesmo multiconjunto de tokens, zero efeito
  visual** — utilitários não conflitantes, e a ordem da cascata vem da folha, não do atributo.
- **A sua afirmação medida — "os 5 tiles e os 3 badges têm exatamente as mesmas strings" — é
  VERDADEIRA.** Verifiquei: os 8 estão entre os 73 idênticos.
- A frase do Change Log ("provada inalterada por comparação de markup") é mais larga que a
  medição: o markup **não** é byte a byte igual; é visualmente equivalente com 4 atributos de
  ordem trocada. → QA-900-57-2.
- **Controle positivo:** com `palette="slate"` o markup muda, e
  `markupSlate.replaceAll("slate-","stone-")` reproduz `main` **exceto** pelas mesmas 4 posições —
  isto é, a troca de paleta é exatamente uma substituição de escala e nada mais.

#### As duas réguas cegas que você pegou — confirmadas mortas
| # | mutação | tsc | resultado |
|---|---|---|---|
| M2 | `<Tile … classes={classes}>` → `classes={PALETAS.stone}` | rc=0 | 1 VERMELHO |
| M4 | remove `palette="slate"` do JSX | rc=0 | 1 VERMELHO |
| q4d | remove a prop **e** ressuscita a citação em comentário de **bloco** | rc=0 | 1 VERMELHO |
| M1 | `PALETA_PADRAO` `stone` → `slate` (o `/dashboard` mudaria de cara) | rc=0 | 1 VERMELHO |

#### A terceira da família — e ela veio em três
| # | asserção | forma do furo | tsc | régua |
|---|---|---|---|---|
| **q8** | `toContain("classesDaPaleta(palette)")` no arquivo inteiro | **comentário** | rc=0 | **10/10 VERDE** |
| **M3** | `slice(indexOf("<Badge"))` … `toContain("classes={classes}")` | **call site vizinho** | rc=0 | **10/10 VERDE** |
| **q4c** | filtro de comentário que cobre `*` e `//` | **comentário JSX `{/* */}`** | rc=0 | **10/10 VERDE** |

- **q8 é o pior.** `const classes = classesDaPaleta(palette)` vira `PALETAS.stone`, com um
  comentário citando a chamada. A prop fica **inteiramente decorativa** e a tela de integrações do
  console volta INTEIRA à escala do CRM — o defeito da story em tamanho natural. A varredura de
  `stone-` não vê nada: `PALETAS.stone` é um identificador, não contém o literal `stone-`.
- **M3, medido:** `indexOf("<Badge")` = offset **6285**, `indexOf("<Tile")` = **11984**. O `slice`
  do Badge vai até o **fim do arquivo** e engole o call site do `<Tile>` — 2 ocorrências de
  `classes={classes}` no pedaço do Badge, 1 no do Tile. O conjunto de morte da asserção do Badge é
  **SUPERSET** do da do Tile: ela só acende quando os **dois** perdem a prop. O comentário do teste
  afirma "medir os DOIS call sites separadamente"; um está medido, o outro é colinear. Você fechou
  a direção Tile→Badge e abriu a imagem espelhada.
- **q4c, isolado:** comentário de bloco (`* …`) → **VERMELHO**; comentário JSX (`{/* … */}`) →
  **VERDE**. O filtro cobre a forma que tinha mordido e não cobre a idiomática num `.tsx`.

**O padrão:** o conserto mirou a **forma** que doeu, não a **classe** ("asserção sobre texto-fonte
que qualquer vizinho pode satisfazer").

#### A régua de segurança que você NÃO contornou — confirmado
`nao-consumo.test.ts` **intocado**; `AUTORIZADOS` com as mesmas 8 chaves; **nenhuma** das páginas
novas entrou; zero `secret_ref`/`decrypted_secrets`/`reveal_last4` nas 10 fontes novas; zero
`access_token` em `app/platform/**`. **Controle positivo (q11):** uma menção a `secret_ref` em
comentário no `/platform/page.tsx` deixa a régua **VERMELHA** — ela continua mordendo as páginas
novas, que é exatamente o que se perde ao entrar na lista. **Seu argumento está certo e o preço
foi pago no lugar certo.**

#### Concerns
| id | sev | o quê |
|---|---|---|
| **QA-900-57-1** | **alta** | Os três furos acima. **Peço o conserto antes do merge** — ~8 linhas de teste, zero de produção. A régua É a entrega da AC4 tanto quanto a prop; com o q8 aberto o defeito volta inteiro e volta verde. |
| QA-900-57-2 | baixa | O markup do `/dashboard` não é byte a byte igual (4 de 77, sem efeito visual). Corrigir a frase do Change Log, ou dar um papel próprio ao campo mono (`campoMono`) e restaurar a igualdade exata. |
| QA-900-57-3 | baixa | `LinhaDaTrilhaDaPlataforma` e `rotuloDoAtor` não têm carrasco nenhum — só type-check. Sua justificativa está **correta** (`platform_audit_log` tem **0 linhas em produção e no teste**, medido, e é append-only), mas "não há infra de render" **não se aplica**: é render puro de objeto simples. O harness que usei para o A/B cobre os 4 caminhos de `rotuloDoAtor` em ~10 linhas, sem sessão e sem banco. Mais barato ainda: exportar `rotuloDoAtor` como função pura. |

#### Conserto pedido para QA-900-57-1
1. **Uma função só** para as quatro asserções de texto-fonte: `linhasDeCodigo(fonte)` filtrando
   `*`, `//`, `/*` **e `{/*`**. Fecha q8 e q4c.
2. **Delimitar o call site**, em vez de `slice` até o fim: recortar do `<Badge` até o primeiro
   `/>` (idem para `<Tile`). Fecha M3 e torna os dois conjuntos de morte **disjuntos**.
3. **Um controle positivo por furo**, envenenando a fonte real — a régua já tem esse idioma no
   `it` "o detector está VIVO contra o arquivo real". Sem isso o conserto vira prosa, e prosa não
   é herdada pelo próximo PR.

#### Observações
- **A recusa da interpolação está PROVADA, não só argumentada.** Verifiquei o outro lado, que era
  o risco real: os **22 tokens de cor** da tabela estão no CSS emitido pelo `build`. O Tailwind v4
  (detecção automática, sem `tailwind.config`) varre o `.ts` — se não varresse, as duas telas
  sairiam sem fundo e nada nesta base reprovaria.
- **A população da régua "as DUAS telas montam os tiles pela MESMA função" cresceu de 2 para 4.**
  O Resumo e a Visão geral são a 3ª e a 4ª superfície; as duas usam a função compartilhada
  (conferi), mas não estão na lista. Não é regressão — é uma lista menor que a população que ela
  cobre.
- **As consequências não previstas da AC1 sobre a AC3 estão certas** (remover `← Empresas` e o
  `<h1>` duplicados, e o import órfão de `Link`).
- **Banco de teste revertido, confirmado:** `org_integrations` 18/18 `disconnected`;
  `whatsapp_config` 3/3 `inactive`, `phone_number_id` nulo em todas.
- **Em produção a QA-900-51-2 está VIVA hoje:** `org_integrations` 6/6 `disconnected` e
  `whatsapp_config` 1 `active` com `phone_number_id`. A montagem compartilhada do Resumo é
  necessária, não preventiva.

#### Réguas
`turbo lint --force` rc=0 (0 erros; 30 warnings, nenhum em arquivo desta story) ·
`turbo type-check --force` rc=0, 8/8 · `build` rc=0 com as 6 rotas da casca registradas ·
suíte **299 / 3966 passed / 6 xfail**, delta **+2 arquivos, +32 testes**, xfail inalterado ·
`platform-query-scan`, varredura de paleta em `app/platform/**` e `nao-consumo` todas provadas
**vivas** contra os arquivos novos, por controle positivo com `tsc` rc=0.

**Merge tecnicamente liberado — peço QA-900-57-1 antes.**

