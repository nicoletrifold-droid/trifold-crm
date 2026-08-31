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
| 2026-08-31 | 0.3 | **Implementada.** Todas as 7 ACs entregues e verificadas no ambiente de teste com sessão real de platform admin (404 → 200 nas 6 abas; 404 de verdade para empresa inexistente). A paleta do `/dashboard` foi provada **inalterada por comparação de markup renderizado** entre `main` e a branch, não por inspeção visual. Status Ready → Ready for Review. | @dev (Dex) |

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

**Modificados**
- `packages/web/src/app/platform/orgs/[id]/integracoes/page.tsx`
- `packages/web/src/components/integrations/integrations-panel.tsx`
- `packages/web/src/lib/integrations/painel/providers.ts`

## QA Results
_(Preenchido pelo @qa.)_
