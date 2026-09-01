# Story 900-56 — Navegação de plataforma de verdade + `/platform` (Visão Geral, faixa 1)

## Metadata
- **Epic:** 900 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** Frente 2 ("Console") do pedido de 2026-08-31 do dono do produto — antecipação
  explícita de conteúdo da Onda 6 do epic (`900-44`, hoje um mini-épico de 6 telas), fatiada em
  stories menores seguindo o desenho de `docs/ux/console-plataforma.md` §6, Fase 1 (entregas 1.1
  e 1.6 do documento, combinadas nesta story — ver "Por que combinadas" abaixo).
- **Story:** 900-56 — próximo número livre. Verificado em 2026-08-31: maior story do epic
  existente (local + todas as refs remotas, `git fetch --prune`) é `900-55`; `900-56` não existe
  em nenhum lugar.
- **Status:** Ready for Review
- **Priority:** P1 — é a correção estrutural mais barata do diagnóstico do dono do produto ("é uma
  cópia de uma empresa"): a navegação de 1 item é o primeiro sintoma citado em
  `console-plataforma.md` §0.
- **Complexity:** M.
- **Depends on:** nenhuma. 100% balde A (dado já existe e é consultável hoje): `organizations`,
  `users`, `org_integrations` — as 3 primeiras tabelas de `PLATFORM_READABLE_TABLES`. **Não
  depende de `900-42a`** (SEC-001): esta tela não mostra nenhum dado de dentro de uma empresa —
  só identidade, status de convite e status de integração, já dentro das 5 tabelas permitidas
  (regra de segurança da casca, `console-plataforma.md` §3.3).

### Por que 1.1 (navegação) e 1.6 (visão geral, faixa 1) viraram uma story só
O desenho do @ux lista as duas como entregas separadas da Fase 1, mas nenhuma delas é útil
sozinha entregue em produção: a navegação sem o item "Visão geral" resolvendo deixaria o link
"Visão geral" apontando para uma rota vazia ou 404 — pior do que a barra de 1 item que já existe
hoje. **[AUTO-DECISÃO]** Combinar → decisão: uma story só entrega a barra E a rota `/platform`
com conteúdo real (ainda que só a faixa 1). Motivo: evita um estado intermediário pior que o
atual (link morto na navegação principal), e as duas partes compartilham a mesma decisão de dado
(nenhuma tabela nova, tudo A).

### Executor Assignment
- **Executor:** @dev (Dex).
- **Quality Gate:** @dev (pre-commit) — story de frontend/agregação, sem schema novo.
- **Quality Gate Tools:** `[code_review]`.

---

## User Story
**Como** operador da Trifold,
**eu quero** uma barra de navegação de verdade em `/platform` (com os 5 itens do desenho, mesmo
que dois deles ainda não tenham tela) e uma "Visão geral" que abre em `/platform` mostrando o
essencial da operação — quantas empresas ativas, quantas novas, quem precisa de mim agora —,
**para que** o console pare de parecer um pedaço solto do CRM de um cliente e vire, de fato, o
painel que eu abro de manhã.

---

## Acceptance Criteria

**AC1 — Barra de navegação com 5 itens, substituindo o link único de hoje.**
`packages/web/src/app/platform/layout.tsx` (hoje só tem "Empresas") passa a ter: **Visão geral**
(`/platform`), **Empresas** (`/platform/orgs`), **Cobrança**, **Uso & saúde**, **Trilha**
(`/platform/trilha`). Mantém a barra escura (`slate-950`/`slate-900`) e o badge âmbar
`PLATAFORMA` — **sem mudar isso**, é a proteção descrita em `console-plataforma.md` §2.4 e não é
objeto desta story.

**AC2 — Cobrança e Uso & saúde aparecem desabilitados, não como link morto.**
`/platform/cobranca` e `/platform/uso` não existem nesta fase (fase 4 e fase 2 do desenho,
respectivamente — nenhuma delas é balde A). **[AUTO-DECISÃO]** Em vez de linkar para uma rota que
2 dá 404, os dois itens aparecem na barra como texto não clicável (`<span>`, não `<Link>`), com um
rótulo pequeno "em breve" — mesmo espírito da regra "fundação ausente usa `—`, nunca finge que
existe" do desenho (§5). Trilha e Empresas são `<Link>` normais (rotas reais).

**AC3 — `/platform` resolve com conteúdo, não 404.**
Hoje `/platform` não tem `page.tsx` — só o `layout.tsx` existe, e não há index. Cria-se
`packages/web/src/app/platform/page.tsx`.

**AC4 — Faixa "Operação": 4 cards, todos com dado real.**
*(Mecanismo de contagem: em memória, sobre as linhas devolvidas por `platformQuery()` — ver Dev
Notes, "Contagem". Nenhum card pode usar `count()` do PostgREST nem embedding; nenhum card pode
motivar mudança em `platform-query.ts`. Todos os 4 obedecem a AC9.)*
1. **Empresas ativas** — `count` de `organizations.is_active = true`; subtexto "N inativa(s)" se
   `count(is_active=false) > 0`.
2. **Novas no período** — `count` de `organizations.created_at >= (agora - período)`. Período
   default 30 dias, com 2 links adicionais (7 dias / 90 dias) via querystring `?dias=30` (server
   component, sem JS de cliente — `<Link href="?dias=7">`).
3. **Convites pendentes** — reaproveita `deriveAdminInviteStatus()` (já usado em `orgs/page.tsx`)
   sobre todas as orgs; conta quantas têm status `"pending"`.
4. **Integrações com erro** — `count` de linhas de `org_integrations` com `status = 'error'`
   (todas as orgs, soma simples — não é "por org", é o total de linhas em erro).

**AC5 — "Precisa de você": lista de pendências, sem paginação nesta fase.**
Duas classes de item, cada uma com link de ação:
- **Convite de admin pendente** — uma linha por org com `deriveAdminInviteStatus() === "pending"`,
  texto "{Empresa} — convite do admin pendente há N dias", botão "Reenviar" (reaproveita a mesma
  ação de `POST /api/platform/orgs/{id}/resend-admin-invite` já usada em `orgs/page.tsx` via o
  componente `ReenviarConvite`). **N dias** é calculado a partir de `users.created_at` da linha do
  admin pendente quando ela existe (linha `role='admin'` sem `auth_id`); se só existir
  `admin_invite_email` sem linha de usuário ainda, usa `organizations.created_at` — não inventar
  uma terceira fonte de tempo que não existe no banco.
- **Integração em erro** — uma linha por (org, provider) com `org_integrations.status = 'error'`,
  texto "{Empresa} — {Provider} em erro", link "Ver empresa" para `/platform/orgs/{id}`. **Sem
  "desde quando" nem "por quê"** nesta story — essas duas informações exigem `last_check_at`/
  `last_error`, que não existem em `org_integrations` ainda (ver story `900-61`, que cria as
  colunas). Se a lista estiver vazia nas duas classes, a seção "Precisa de você" inteira não
  renderiza (nem título vazio) — mesma regra do desenho (§3.1, "faixa sem fundação não renderiza
  vazia — não renderiza"; aqui é seção, mesmo princípio).

**AC6 — "Entraram recentemente": até 5 orgs mais novas, sem paginação.**
`organizations` ordenadas por `created_at DESC`, `LIMIT 5`, cada linha mostra nome, data de
criação, "admin ativo"/"admin pendente"/"sem admin" (reaproveita `deriveAdminInviteStatus`), e
contagem de integrações conectadas (`org_integrations.status='connected'` daquela org). Vazio de
partida: "Nenhuma empresa ainda. **Criar a primeira**" com link para `/platform/orgs/new` — só
quando não houver NENHUMA org no sistema (não quando o filtro de período não achar nada; esta
seção não tem filtro de período).

**AC7 — Faixas 2 (Receita) e 3 (Margem) NÃO renderizam.**
Nenhum placeholder, nenhum "em breve", nenhum card vazio para MRR, cancelamentos, custo de infra
por cliente. Essas faixas dependem de `plans`/`org_subscriptions`/`ai_usage_events`, que não
existem — mostrar um card vazio afirmaria um "zero" que seria mentira (regra do desenho, §5: "0 e
não medido são coisas diferentes"). Ver `console-plataforma.md` §3.1 para o motivo completo.

**AC8 — Sem gráfico.**
Nenhum componente de série temporal nesta story — número + delta textual, nunca gráfico (regra do
desenho, §3.1: "sem gráficos na fase 1").

**AC9 — Contagem saturada não vira número errado: vira número declarado como incompleto.**
Como toda contagem desta story é feita em memória sobre uma página do PostgREST (Dev Notes), cada
consulta de contagem **verifica se voltou no teto** e, se voltou, a tela **para de afirmar um
número exato**:
- Se `linhas.length >= TETO_POSTGREST` (constante nomeada, valor `1000`, com comentário citando a
  medição `content-range: 0-999/1974`), o card exibe **`≥ 1000`** (ou "mais de 1000"), nunca
  `1000` seco.
- Vale para os 4 cards da AC4 e para as duas listas da AC5.
- Teste de unidade obrigatório da função de contagem: **(i)** abaixo do teto → número exato;
  **(ii)** exatamente no teto → forma `≥`. Sem o caso (ii) a regra nasce não-exercitada.

Motivo, e é a regra do dono do produto aplicada literalmente: *"nenhuma tela pode exibir número
que o sistema não sabe"*. Com 1.000 linhas na mão e 1.974 no banco, o sistema **não sabe** o
total — e um `1000` silencioso é pior que `≥ 1000`, porque parece uma medida.

---

## Tasks / Subtasks

- [x] **Task 1 (AC1, AC2) — Navegação**
  - [x] 1.1 Editar `platform/layout.tsx`: trocar o `<div>` de 1 link por 5 itens
  - [x] 1.2 Cobrança/Uso & saúde como `<span>` desabilitado com rótulo "em breve"
- [x] **Task 2 (AC3, AC4) — `/platform/page.tsx` e faixa Operação**
  - [x] 2.1 Criar `packages/web/src/app/platform/page.tsx`, `export const dynamic =
    "force-dynamic"` (mesmo padrão de `orgs/page.tsx`)
  - [x] 2.2 Ler `searchParams` para o período (`dias`, default `30`, validar contra `[7,30,90]`)
  - [x] 2.3 4 queries via `platformQuery()` — nenhum `.from()` cru (arquivo cai em `app/platform/**`,
    varrido por `platform-query-scan.ts`)
  - [x] 2.4 4 cards, layout conforme wireframe §3.1 do desenho
- [x] **Task 3 (AC5) — "Precisa de você"**
  - [x] 3.1 Query de convites pendentes (reaproveitar padrão de `orgs/page.tsx:56-58` para
    `adminRows`)
  - [x] 3.2 Query de integrações em erro
  - [x] 3.3 Reaproveitar `<ReenviarConvite orgId={...} />` (já existe em
    `orgs/_components/reenviar-convite.tsx`)
  - [x] 3.4 Regra de não-renderização quando ambas as listas estão vazias
- [x] **Task 4 (AC6) — "Entraram recentemente"**
  - [x] 4.1 Query `organizations ORDER BY created_at DESC LIMIT 5`
  - [x] 4.2 Estado vazio de partida (organizações = 0)
- [x] **Task 5 — Testes**
  - [x] 5.1 Teste de unidade da função de cálculo de "N dias" do convite pendente (separar em
    helper puro testável, não deixar inline no JSX)
  - [x] 5.2 Teste de unidade da função de contagem: abaixo do teto e **no** teto (AC9)
  - [x] 5.3 `pnpm --filter web type-check` limpo

---

## Dev Notes

### Layout atual (para editar)
`packages/web/src/app/platform/layout.tsx` (39 linhas, lido nesta sessão) — hoje:
```tsx
<Link href="/platform/orgs" className="text-sm font-medium hover:text-amber-400">
  Empresas
</Link>
```
Vira um `<nav>` com os 5 itens. Preservar `bg-slate-950`, `border-slate-800 bg-slate-900`, badge
`bg-amber-500 ... text-slate-950` — nenhuma dessas classes muda (AC1).

### Padrão de leitura já estabelecido (reaproveitar, não reinventar)
`orgs/page.tsx` (156 linhas, lido nesta sessão) já faz exatamente o tipo de agregação que esta
story precisa: contagem de usuários por org "numa consulta só, evita N+1" (linhas 40-44), e a
consulta dedicada e filtrada por `role='admin'` para não sofrer o corte de 1000 linhas do
PostgREST (linhas 46-58, comentário explica por quê). **Reusar o mesmo padrão** para as queries
desta story, inclusive o mesmo desempate `created_at ASC` quando relevante.

### `deriveAdminInviteStatus`
`packages/web/src/lib/tenancy/admin-invite.ts` (lido nesta sessão), função pura:
```ts
export function deriveAdminInviteStatus(input: {
  adminInviteEmail: string | null
  admin: { id: string; authId: string | null } | null
}): AdminInviteStatus // "none" | "pending" | "active"
```
Já é o que `orgs/page.tsx` usa. Não recriar a lógica.

### `platformQuery()` — assinatura e restrição
`platformQuery<T>(table, columns, orgId?)` — `table` restrito a `PLATFORM_READABLE_TABLES`
(`organizations`, `users`, `org_integrations`, `platform_audit_log`, `whatsapp_config`), `columns`
sem `"*"` (ver story `900-42a`, que também fecha o embedding — mas esta story não usa embedding
em nenhuma consulta, então não depende de `900-42a` estar mergeada primeiro). Import: `import {
platformQuery } from "@web/lib/tenancy/platform-query"`.

### Corte de 1000 linhas do PostgREST
Vale para todas as 4 queries desta story se o número de empresas crescer muito — não é risco
concreto hoje (poucos clientes), mas a query de "convites pendentes" e "integrações em erro" já
seguem o padrão filtrado (não `count(*)` cego) que evita o problema, igual `orgs/page.tsx`.

### ⚠️ Contagem: `count: "exact", head: true` NÃO é alcançável por `platformQuery()` — medido
**[@po 2026-08-31] Este bloco substitui a instrução anterior, que era inexequível.** A versão 0.1
desta story mandava "usar `count: 'exact', head: true` do Supabase". Isso **não existe** pelo
caminho que a Task 2.3 obriga a usar:

- `platformQuery(table, columns, orgId?)` chama `db.from(table).select(columns)` com **um só
  argumento** (`platform-query.ts:112`) — não há por onde passar o objeto de opções que carrega
  `count`/`head`.
- A sintaxe de agregado do PostgREST também não serve: `GET /rest/v1/organizations?select=count()`
  devolve **HTTP 400 `PGRST123` "Use of aggregate functions is not allowed"** (agregados estão
  desligados neste projeto Supabase — medido em `trifold-crm-dev`, 2026-08-31).
- E `select=tabela(count)` é **embedding** — a forma exata que a `900-42a` existe para proibir.

**Logo, a única contagem possível nesta story é: trazer as linhas e contar em memória** — o mesmo
que `orgs/page.tsx:40-44` já faz. Isso é aceitável para o volume de hoje (3 empresas) e **só** sob
a regra da AC9, que torna a saturação audível em vez de silenciosa.

**O teto de 1000 é real e está vivo em produção**, não é folclore: medido em 2026-08-31,
`GET /rest/v1/leads?select=id` com `Prefer: count=exact` devolveu `content-range: 0-999/1974` —
1.974 linhas existem, 1.000 vieram. Uma contagem em memória sobre essa tabela erraria por 974 sem
emitir erro nenhum.

**Não conserte isso alargando `platformQuery()` dentro desta story.** Esse arquivo é o objeto da
`900-42a` (segurança, em voo na mesma janela); duas stories editando `platform-query.ts` em
paralelo é como se perde uma correção de segurança num merge. Se a assinatura precisar de
`count`, é story própria — ver a AC8 da `900-42a`.

---

## Testing

- **Framework:** Vitest para o helper de cálculo de "N dias" (função pura, extrair de qualquer
  JSX). Não precisa de teste de componente React nesta story (sem framework de testing-library
  configurado para RSC neste projeto — mesmo padrão das demais telas de `/platform`, que não têm
  teste de render).
- **Cenários do helper:**
  1. Admin pendente com linha de usuário → dias calculados a partir de `users.created_at`.
  2. Só `admin_invite_email`, sem linha de usuário → dias a partir de `organizations.created_at`.
  3. Nenhuma pendência → "Precisa de você" não renderiza (testar a condição, não o JSX).
- **Gate de tipos:** `pnpm --filter web type-check` limpo.

---

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> `coderabbit_integration.enabled` não existe em `.aios-core/core-config.yaml`. Revisão manual via
> Quality Gate desta story (@dev, pre-commit).

---

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 0.1 | Draft inicial — Frente 2 (Console) do pedido de 2026-08-31, Fase 1, entregas 1.1+1.6 combinadas. | @sm (River) |
| 2026-08-31 | 0.2 | **Validada pelo @po (Pax) — GO, nota 7/10.** GO após correção do @po. Defeito corrigido: as ACs mandavam contar com `count: "exact", head: true`, inalcançável por `platformQuery()` (um só argumento em `.select()`), e agregados do PostgREST estão desligados (`PGRST123`). AC4 reescrita, AC9 nova (saturação declarada), Dev Notes de contagem substituída. Status Draft → Ready. | @po (Pax) |
| 2026-08-31 | 0.3 | **Implementada.** Uma divergência medida contra a AC2: `/platform/trilha` **não existe** (medido: HTTP 404 no ambiente de teste, com sessão de platform admin), então o item "Trilha" nasce desabilitado como Cobrança e Uso, em vez de `<Link>`. Ver Dev Agent Record → "Divergência". Status Ready → Ready for Review. | @dev (Dex) |
| 2026-08-31 | 0.4 | **Concerns do gate fechadas (QA-900-56-1/2/3/4).** As 4 consultas passam a LER o `error`: `ContagemDeclarada` ganha o terceiro estado `indisponivel`, `formatarContagem` devolve `—`, e o vazio de partida ("Nenhuma empresa ainda") só renderiza quando a consulta de `organizations` SUCEDEU. "N integrações conectadas" passa a herdar saturação de `org_integrations` **e** de `whatsapp_config`, e a contar por `rotuloDeStatusDoTile(...).tom === "ok"` — a tradução única de status, em vez de uma terceira. O predicado do período saiu do `page.tsx` para `ehNovaNoPeriodo()`, com carrasco de borda. 7 mutações novas, cada uma com `tsc --noEmit` rc=0 medido antes do vermelho. | @dev (Dex) |
| 2026-08-31 | 0.5 | **Rodada 3 — os 4 achados do CodeRabbit (PR #547) fechados, e medidos.** O achado desta story era o **consumidor cego**: a rodada 2 criou o sinal `adminsFalhou` e deixou `pendenciasDeConvite` e a coluna de admin de "Entraram recentemente" sem lê-lo — com a consulta de `users` caída, toda org com `admin_invite_email` virava pendência por falta de dado. `adminsIndisponiveis` passa a ser campo obrigatório. ⚠️ **Os quatro consertos entraram em produção ANTES de existir régua, e a mutação mostrou que três eram decorativos** (verdes com o conserto neutralizado); `console-fail-closed.test.ts` (48 testes) é o que os transforma em entrega. Ver Dev Agent Record → "Rodada 3", inclusive os dois defeitos da própria régua e a correção do delta de testes. | @dev (Dex) |
| 2026-08-31 | 0.6 | **Rodada 4 — 2ª passada do CodeRabbit no PR #547 (4 achados `Minor`).** Os DOIS primeiros eram defeitos na própria régua construída na rodada 3: `expect(todos).toContain(estadoDaEmpresaDeclarado(…))` aceitava todo o contradomínio (mutante que devolve `"inativa"` sobre leitura caída ficava VERDE — medido), e `expect("").not.toContain(…)` comparava dois literais. Trocadas por asserções que medem. `diasDesdeOConvite` devolvia `NaN` com carimbo ilegível ("pendente há NaN dias") e passa a devolver `null`, com a tela dizendo que não mediu. Datas do console ganharam fuso fixo (`FUSO_DO_CONSOLE`), com régua ABSOLUTA sobre `app/platform/**`. Ver Dev Agent Record → "Rodada 4". | @dev (Dex) |


## Dev Agent Record

### Agent Model Used
Claude Opus 5 (1M) — @dev (Dex), modo YOLO autônomo.

### Divergência medida contra a AC2 — "Trilha" nasce desabilitada, não como `<Link>`

A AC1 lista Trilha com a rota `/platform/trilha` e a AC2 afirma que "Trilha e Empresas são
`<Link>` normais (**rotas reais**)". **A segunda metade dessa frase é falsa, e foi medida.**

- Na árvore: não existe `packages/web/src/app/platform/trilha/page.tsx`.
- No ar: `GET https://trifold-crm-teste.vercel.app/platform/trilha`, com cookie de sessão de um
  platform admin de verdade, devolve **404** (a mesma resposta de `/platform/cobranca` e
  `/platform/uso`). Sem sessão, todas as rotas de `/platform` respondem `307 → /login`, e é por
  isso que a medição foi feita autenticada — sem cookie, 404 e "não autenticado" são
  indistinguíveis.
- A própria `900-57` diz isso com todas as letras, na AC2: o link "Ver trilha" da empresa aponta
  para a aba local "**não** para `/platform/trilha` cross-org (essa é a story `900-59`, que ainda
  não existe quando esta for implementada)".

Aplicar a AC2 ao pé da letra produziria exatamente o defeito que o **motivo** da própria AC2
proíbe: *"em vez de linkar para uma rota que dá 404"*. Escolhi obedecer ao motivo e não à letra:
Trilha aparece como `<span>` "em breve", com o comentário no `layout.tsx` explicando por quê e
qual story a liga. **Um `<Link>` volta a ser correto no PR da `900-59`, e o comentário nomeia
isso.**

### Decisão de implementação além da letra da AC6 — a contagem de "integrações conectadas"

A AC6 manda contar `org_integrations.status='connected'` da org. Fazer só isso reintroduziria o
defeito **QA-900-51-2**, que está documentado em `lib/integrations/painel/providers.ts`: a linha
`whatsapp` de `org_integrations` é **estruturalmente inescrevível** (CHECK
`whatsapp_sem_identificador_proprio` da migration 247) e fica `disconnected` para sempre — em
produção, o painel dizia "Não conectado" sobre um canal que estava no ar.

Então a contagem passa por `montarTilesDoPainel()`, a montagem única e compartilhada, alimentada
por uma quarta consulta a `whatsapp_config` (tabela **já** em `PLATFORM_READABLE_TABLES`, e só as
colunas não-secretas). **Provado na tela, não deduzido:** com a `sienge` da Empresa A em
`connected` e o `whatsapp_config` dela em `active`, o card mostrou **"2 integrações conectadas"**.
Uma contagem só por `org_integrations` teria mostrado 1.

O card "Integrações com erro" (AC4.4) e a lista de erro (AC5) continuam **literais** sobre
`org_integrations.status='error'`, porque a derivação de WhatsApp só produz `active`/`inactive` —
ela não tem como servir a pergunta "está em erro?".

### Débito registrado, não consertado

`/platform` faz 4 consultas cross-org e conta em memória. Isso é correto para o volume de hoje e
**declarado** pela AC9 quando a página satura, mas não é o desenho final: a contagem certa exige
estender a assinatura de `platformQuery()` para alcançar `Prefer: count=exact` — proibido nesta
story pela AC8 da `900-42a`, e story própria.

### Debug Log References

| Medição | Resultado |
|---|---|
| `GET /platform` no ambiente de teste (main), sessão de platform admin | **404** — a rota não resolvia |
| `GET /platform/orgs/{id}` idem | **404** — a empresa não existia como objeto |
| `GET /platform/{cobranca,uso,trilha}` idem | **404** nas três |
| `GET /platform` na branch (local, MESMO banco de teste) | **200**, 4 cards com dado real |
| `?dias=7` / `?dias=90` / `?dias=99999` / `?dias=abc` | rótulo "últimos 7/90/30/30 dias" — allowlist positiva funcionando na tela |
| "Precisa de você" com base limpa | **seção inteira não renderiza** (nem o título) |
| "Precisa de você" com 1 integração em erro | renderiza `⚠ Empresa A — Teste — Meta — Recebimento de Leads em erro [Ver empresa]`, e o card foi de `0` para `1 ⚠ veja abaixo` |
| Mutação `saturada` medida sobre o valor filtrado em vez da página | 1 teste VERMELHO |
| Mutação `diasDesdeOConvite` sempre usando `organizations.created_at` | 2 testes VERMELHOS |
| Mutação `>=` → `>` no teto | 2 testes VERMELHOS |

Os estados de `org_integrations`/`whatsapp_config` da Empresa A foram alterados **temporariamente
no banco de TESTE** para exercitar os caminhos populados e **revertidos em seguida** (conferido:
zero linhas fora de `disconnected`, `whatsapp_config` de volta a `inactive`/`null`).

### Completion Notes List

- **Não provado na tela, e por quê:**
  1. **AC9 na forma `≥ N`.** Exige uma página no teto de 1.000 linhas; o banco de teste tem 3
     empresas. Coberto por teste de unidade nos dois casos que a AC exige (abaixo do teto e
     **exatamente** no teto), mais o caso que separa "saturação da página" de "valor filtrado".
  2. **Vazio de partida da AC6** ("Nenhuma empresa ainda. Criar a primeira"). Exigiria zerar as
     empresas do banco compartilhado. O ramo existe e é a única alternativa de `orgs.length === 0`.
  3. **Classe "convite pendente" da AC5 na tela.** As três contas do ambiente de teste têm admin
     ativo, e forjar uma pendência exigiria anular o `auth_id` de uma conta de login viva. Coberta
     por 4 testes de unidade em `pendenciasDeConvite`, incluindo as duas fontes de tempo.
  4. **Discriminação do período pela contagem.** As 3 empresas foram criadas há ≤ 2 dias, então
     `7`, `30` e `90` dias devolvem as mesmas 3. O que a tela discrimina — e foi verificado — é o
     rótulo e a normalização da querystring.
- Nenhuma consulta usa `count()`, agregado ou embedding; `platform-query.ts` **não foi tocado**.
- A régua `nao-consumo.test.ts` acendeu para as duas páginas novas por causa de uma **menção em
  comentário** ao nome da coluna que aponta para o Vault. Corrigi **reescrevendo os comentários**,
  não acrescentando as páginas à lista autorizada: entrar naquela lista é abrir mão de a régua
  acender no dia em que a página passar a ler o cofre de verdade.

### File List

**Criados**
- `packages/web/src/app/platform/page.tsx`
- `packages/web/src/lib/tenancy/console-visao-geral.ts`
- `packages/web/src/lib/tenancy/console-visao-geral.test.ts`
- `packages/web/src/lib/tenancy/console-fail-closed.test.ts` *(rodada 3 — a régua das duas stories)*

**Modificados**
- `packages/web/src/app/platform/layout.tsx`
- `packages/web/src/app/platform/page.tsx` *(rodada 3 — os dois consumidores cegos ao `adminsFalhou`)*
- `packages/web/src/lib/tenancy/console-visao-geral.ts` *(rodada 3 — `adminsIndisponiveis` obrigatório)*
- `packages/web/src/lib/tenancy/console-visao-geral.test.ts` *(rodada 3 — o `it` do consumidor cego)*
- `packages/web/src/lib/tenancy/console-fail-closed.test.ts` *(rodada 4 — as duas asserções vacuosas + as réguas de fuso e de `dias`)*
- `packages/web/src/lib/tenancy/console-visao-geral.ts` *(rodada 4 — `diasDesdeOConvite` devolve `number | null`)*
- `packages/web/src/lib/tenancy/console-visao-geral.test.ts` *(rodada 4 — o carimbo ilegível)*
- `packages/web/src/app/platform/page.tsx` *(rodada 4 — fuso fixo e o ramo do `dias === null`)*
- `packages/web/src/app/platform/orgs/page.tsx` *(rodada 4 — o 5º call site de data, achado pela varredura de `app/platform/**`)*

### Rodada 4 — a 2ª passada do CodeRabbit (PR #547), e o defeito estava no instrumento

**Achado 1 — `console-fail-closed.test.ts:235`, asserção que aceita todo o contradomínio.**
`expect(todos).toContain(estadoDaEmpresaDeclarado({ falhou: true, org: null }))`, com `todos` sendo
os TRÊS estados do tipo. Não pode falhar: o `tsc` já proíbe um quarto valor, então ela media o
compilador. **Medido, não deduzido:** com `estadoDaEmpresaDeclarado` mutado para devolver
`"inativa"` no cruzamento `falhou && !org` (`tsc --noEmit` rc=0), a asserção original fica VERDE e
a nova fica VERMELHA — e `"○ inativa"` sobre uma leitura que não voltou é literalmente a afirmação
que o `describe` inteiro existe para impedir. Virou três `it`: o caso específico
(`toBe("desconhecido")`), o par dos dois estados reais, e a alcançabilidade dos três — este último
no mesmo formato já usado para `estadoDaLeitura`, com âncora literal.

**Achado 2 — `:608`, dois literais.** `expect("").not.toContain("{AVISO…}")` é decidida em tempo de
leitura. ⚠️ Amarrá-la ao valor (`expect(recorte).not.toContain(…)`) **também não resolve**: com
`recorte === ""` ela é *entailed* pelo `toBe("")` da linha de cima, e nenhuma mutação a derruba sem
derrubar aquela primeiro — verificado aplicando o fail-open em `trechoDelimitado`, que acendeu a
linha anterior, não esta. O que MEDE o veneno é a contagem: `ocorrenciasNoCodigo(fonte, AVISO)`
ancorado em `1` na fonte correta, e `N - 1` na envenenada.

**Achado 4 — `console-visao-geral.ts:211`, `NaN` na tela.** `new Date("30/08/2026").getTime()` é
`NaN`, e `Math.max(0, Math.floor(NaN))` continua `NaN`: "convite do admin pendente há NaN dias".
Agora `number | null`, e a tela escreve "(não foi possível medir há quanto tempo)". ⚠️ **O tipo
não é o carrasco:** `number | null` num filho de JSX compila (React renderiza `null` como vazio), e
a tela escreveria "pendente há  dias" sem o `tsc` ver nada — quem guarda é a régua de texto-fonte
sobre o call site, com controle positivo.

### Fechamento das concerns do gate (rodada 2) — QA-900-56-1/2/3/4

**QA-900-56-1 — o erro de consulta descartado.** As 4 leituras passaram a guardar a resposta
inteira em vez de desestruturar só `data`. `leituraFalhou()` é fail-closed nos dois sinais: `error`
não nulo **e** `data` nulo sem erro — "não consegui ler" e "li e não havia nada" são fatos
diferentes, e só o segundo pode virar número. `ContagemDeclarada` ganhou o terceiro estado
`indisponivel`, `formatarContagem` devolve `—`, e `indisponivel` **vence** `saturada`: sem leitura
não há nem piso a declarar.

A troca de assinatura de `contarComTeto` (booleano posicional → objeto `{ saturacaoHerdada,
indisponivel }`) foi deliberada: com dois booleanos em sequência, trocar um pelo outro na chamada
seria invisível na leitura e o `tsc` não teria como reprovar. E de fato o `type-check` reprovou o
único call site antigo — o carrasco pegou a mudança antes de eu procurá-la.

O vazio DE PARTIDA ("Nenhuma empresa ainda. Criar a primeira") virou o terceiro ramo: só renderiza
quando a consulta de `organizations` SUCEDEU. E a seção "Precisa de você" passou a renderizar
também quando alguma leitura falhou, mesmo com zero pendências — sumir com ela ali afirmaria "nada
precisa de você", que é o mesmo zero com cara de medida por outro caminho.

**QA-900-56-2 + QA-900-56-4, no mesmo lugar.** `conectadas` virou `ContagemDeclarada`, herdando
`paginaSaturada(integracoes) || paginaSaturada(linhasWhatsApp)` e a indisponibilidade das duas
leituras. O predicado passou a ser `rotuloDeStatusDoTile(t.status).tom === "ok"` — a tradução única
que a `900-57` criou, em vez da terceira. **Declaro o limite:** esta linha específica não tem
carrasco próprio, porque `page.tsx` é RSC e não há harness de render; o que tem carrasco é a função
que ela agora chama (`providers.ts`) e o mecanismo de declaração (`console-visao-geral.ts`). O
ganho é ter eliminado a duplicata, não ter provado o call site.

**QA-900-56-3 — decidido: mover.** O conserto era exatamente mover a função, então não havia razão
para declarar e seguir. `ehNovaNoPeriodo(org, corte)` foi para `console-visao-geral.ts` com 5 `it`
cobrindo a borda exata, ±1 ms, o mesmo instante em outro fuso, carimbo impossível de parsear e a
discriminação dos três períodos — que é justamente o que a tela não conseguiu discriminar.

#### Mutações desta rodada — cada vermelho precedido de `tsc --noEmit` rc=0

| # | mutação | tsc | resultado |
|---|---|---|---|
| m1 | `formatarContagem` sem o ramo `indisponivel` | rc=0 | 2 VERMELHOS |
| m2 | `contarComTeto` filtra ANTES de checar `indisponivel` (o `valor` vaza) | rc=0 | 1 VERMELHO |
| m3 | `leituraFalhou` só olha `error`, ignora `data` nulo | rc=0 | 1 VERMELHO |
| m4 | `ehNovaNoPeriodo`: `>=` → `>` | rc=0 | 2 VERMELHOS |
| m4b | `ehNovaNoPeriodo` compara STRING de data em vez de instante | rc=0 | 2 VERMELHOS |

Harness fora da árvore: guarda os bytes, aborta se a mutação sair inerte, roda `tsc`, roda o alvo,
restaura e confere `sha256`. Todas as restaurações conferiram.

#### Correção de registro

O relato da rodada 1 trocou dois rótulos, e o @qa está certo: **297 é o BASELINE**, não a árvore
(a árvore daquela rodada tinha 299), e **3.934 é `passed`**, não o total (3.940 com os 6 xfail).
Os números estavam certos; os rótulos, não.

#### Réguas (rodada 2)

| medição | valor |
|---|---|
| baseline da árvore real (sem os arquivos destas duas stories) | 297 arquivos · 3.934 `passed` · 6 xfail (3.940 total) |
| árvore agora | **300 arquivos · 3.985 `passed` · 6 xfail (3.991 total)** · rc=0 |
| delta | **+3 arquivos · +51 testes · xfail INALTERADO** |
| `turbo lint --force` | rc=0 — 0 erros, 30 warnings, **nenhum** em arquivo desta leva |
| `turbo type-check --force` | rc=0 — 8/8 |
| `build` de `packages/web` | rc=0 — as 9 rotas de `/platform` registradas |

O delta fecha por dois caminhos independentes: `3.985 − 3.934 = 51` e a soma dos três arquivos
das stories (`console-paleta` 14 + `console-visao-geral` 32 + `linha-da-trilha` 5 = 51).

### Rodada 3 — os 4 achados do CodeRabbit (PR #547), e o que as mutações disseram deles

**A ordem foi a errada, e está registrada como aconteceu:** os quatro consertos entraram no
código de PRODUÇÃO **antes** de existir régua. Só depois escrevi `console-fail-closed.test.ts` e
mutei os consertos — e três dos quatro saíram **VERDES com o conserto neutralizado**. Eram
decorativos: certos no comportamento, indefesos contra a próxima edição. O que os tornou entrega
foi a régua, não o commit que os escreveu.

O achado desta story é o **consumidor cego**: a rodada 2 criou o sinal `adminsFalhou` e deixou
`pendenciasDeConvite` e a coluna de admin de "Entraram recentemente" sem lê-lo. Com a consulta de
`users` caída, `adminPorOrg` nasce vazio, e "não há linha de admin" fica indistinguível de "não li
a linha de admin": toda org com `admin_invite_email` virava pendência, com dias contados a partir
de `organizations.created_at` e botão de reenvio. `adminsIndisponiveis` é campo **obrigatório** de
propósito — omiti-lo é erro de compilação, e foi o `type-check` que apontou os call sites.

#### Três comentários afirmavam uma régua que não existia

Enquanto os consertos estavam sem carrasco, três comentários no código já citavam
`console-fail-closed.test.ts` como se ele existisse ("é medido no texto-fonte por…"). Isso é
**exatamente a classe de defeito que estas duas stories perseguem** — uma tela, ou um comentário,
afirmando um fato que ninguém mediu — cometida dentro delas. Fica registrado: hoje o arquivo
existe e mede o que os três comentários prometem, mas houve uma janela em que a prosa era a única
prova.

#### As três mutações, cada uma com `tsc --noEmit` rc=0 medido ANTES da contagem

| # | mutação | tsc | antes da régua | agora |
|---|---|---|---|---|
| r1 | `adminsIndisponiveis: adminsFalhou` → `false` no call site | rc=0 | VERDE | **3 VERMELHOS** |
| r2 | apagar os ramos `desconhecido`/`falhou` nos 3 arquivos de tela | rc=0 | VERDE | **13 VERMELHOS** |
| r3 | `.limit(LIMITE_DE_LINHAS)` + `haMais: linhas.length >= limite` | rc=0 | VERDE | **4 VERMELHOS** |

Os 4 arquivos de produção foram restaurados e conferidos por `shasum -c`.

#### Dois defeitos na própria régua, achados pela mutação — e consertados no TESTE, não na tela

1. **A asserção media no lugar errado, e o código de produção estava certo.** A ordem "o ramo do
   fail-closed vem ANTES da frase que afirma ausência" era medida sobre o recorte, e o recorte da
   Trilha fecha no `</div>` do próprio aviso — a frase mora fora dele, `indexOf` devolvia `-1` e a
   comparação reprovava uma tela correta. Medir sobre o **arquivo cru** seria pior: a Trilha
   **cita** "Nenhuma ação registrada ainda" num comentário **acima** do ramo, e a citação inverte a
   ordem — falso vermelho por outro caminho. Conserto: medir só sobre **código** (`codigoDe`) e
   exigir que as **duas âncoras sejam únicas** (`ocorrenciasNoCodigo(...) === 1`) — com duas
   ocorrências o `indexOf` compara um par que ninguém escolheu, e a asserção de ordem vira sorte.
2. **O número esperado era conferido contra a fonte já envenenada.** No controle positivo que
   apaga um ramo do Resumo, a contagem de ocorrências do aviso era medida depois do veneno.
   **Não** troquei 3 por 2: o `3` ficou ancorado na fonte **correta**, e o esperado da envenenada
   passou a ser derivado como `N − 1`. É o **par** que prova que a mutação apagou exatamente um
   ramo; um número solto ficaria verde no dia em que a fonte perdesse um cartão por outro motivo.

#### Correção a uma instrução recebida

A metade `>=` da terceira mutação **não** vive em `app/platform/orgs/[id]/trilha/page.tsx`. A
página só passou a buscar `LIMITE_DE_LINHAS + 1`; o predicado está em
`lib/tenancy/console-leitura.ts`, em `recortarComExcedente` (`haMais: linhas.length > limite`). A
mutação completa exige tocar os dois arquivos — e é por isso que ela mata 4 testes, e não 1.

#### Correção ao delta de testes que circulou

O `+15` que circulou **não era desta frente**. Contado por arquivo: daqui saiu
`console-fail-closed.test.ts` (48 testes) e **um** `it` novo em `console-visao-geral.test.ts`; o
resto do movimento da suíte é de frentes vizinhas na mesma árvore de trabalho compartilhada.

#### Réguas (rodada 3)

| medição | valor |
|---|---|
| suíte cheia | **301 arquivos · 4.034 `passed` · 6 xfail (4.040 total)** · rc=0 |
| baseline sem o arquivo novo | 300 · 3.986 · 6 |
| delta | **+1 arquivo · +48 testes · xfail INALTERADO** (`4.034 − 3.986 = 48`, e o arquivo novo tem 48/48) |
| `tsc --noEmit` | rc=0 |
| `eslint` | rc=0 |


## QA Results

### Gate: **CONCERNS** — @qa (Quinn), 2026-08-31
**Arquivo:** `docs/qa/gates/900.56-navegacao-e-visao-geral-do-console.yml`
**Base medida:** `b968387e` sobre `1393fa68`, na **árvore de trabalho real** (que carrega os 6
arquivos não commitados da `900-55`, que não toquei).

**Nenhum defeito vivo. Nenhuma regressão. Duas decisões contra a letra da AC, as duas certas.**

#### Baseline e delta — resolvidos contra a árvore, não contra o CI

| | arquivos | passed | xfail |
|---|---|---|---|
| árvore real (com a story) | **299** | **3966** | 6 |
| os 2 arquivos da story sozinhos | 2 | 32 | — |
| **baseline derivada** | **297** | **3934** | 6 |
| **delta** | **+2** | **+32** | **inalterado** |

Bate com o declarado. Dois rótulos estavam trocados no relato: os `297` são do **baseline**, não
da árvore (a árvore tem 299), e `3.934` é a contagem de `passed`, não o total (3.940 com os 6
xfail). Os números estão certos. A atribuição dos 32 ao trabalho da `900-55` fecha
aritmeticamente (`3.902 + 32 = 3.934`) e é corroborada por **+11 blocos `it(` e 3 `it.each`
novos** nos 3 arquivos de teste daquela frente.

#### Mutações — todas com `tsc --noEmit` rc=0 medido ANTES do vermelho

| # | mutação | tsc | resultado |
|---|---|---|---|
| q5 | `saturada` medida sobre o valor filtrado | rc=0 | 1 VERMELHO |
| q6 | `diasDesdeOConvite` sempre pela org | rc=0 | 2 VERMELHOS |
| q7 | `paginaSaturada`: `>=` → `>` | rc=0 | 2 VERMELHOS |
| q10 | `normalizarPeriodo` vira passthrough | rc=0 | 1 VERMELHO |
| q12 | `rotuloDoProvider` sem guarda | **rc=2** → remodelada com `!` → rc=0 | 1 VERMELHO |
| q13 | `.from("leads")` cru em `app/platform/**` | rc=0 | 1 VERMELHO |

A q12 na forma ingênua **não compila** (`noUncheckedIndexedAccess`): contar aquele vermelho sem
olhar o `tsc` teria creditado ao teste um mérito que é do compilador.

#### As duas decisões contra a letra
- **"Trilha" desabilitada em vez de `<Link>` — CERTO.** `app/platform/trilha/page.tsx` não
  existe e o `build` não registra a rota. A AC2 é internamente contraditória e o motivo escrito
  nela ("em vez de linkar para uma rota que dá 404") é verificável; a letra, não.
  *Nit:* o comentário do `layout.tsx` diz que a `900-59` "ainda não foi escrita" — ela existe na
  árvore com **Status: Ready** (não commitada).
- **"Integrações conectadas" por `montarTilesDoPainel()` — CERTO, e não hipotético.** Reproduzi a
  aritmética (2 × 1) e fui além: **em produção, hoje**, `org_integrations` tem 6 linhas, **todas
  `disconnected`**, e `whatsapp_config` tem **1 `active` com `phone_number_id`**. A contagem
  literal diria "0 integrações conectadas" sobre uma empresa com o canal no ar. A QA-900-51-2 não
  seria reintroduzida em tese — nasceria acesa na primeira renderização.

#### Nenhum número inventado — conferido tela por tela
Zero ocorrência de `R$` / `MRR` / receita / margem fora de comentário. Faixas 2 e 3 não
renderizam. O único `0` literal renderizado é o `<code>0</code>` dentro da frase que explica por
que não se exibe `0`. **7 dos 8 números da Visão geral declaram saturação** — o oitavo é a
concern 2.

#### Concerns (4, nenhuma bloqueante)

| id | sev | o quê |
|---|---|---|
| QA-900-56-1 | média | As 4 consultas descartam `error`: uma falha de leitura vira "Empresas ativas: **0**" e o convite "Nenhuma empresa ainda. Criar a primeira". É a regra da AC9 por uma porta que a AC9 não enumera. Padrão pré-existente no repositório; primeira vez que vira número de manchete. |
| QA-900-56-2 | média | `N integrações conectadas` é o único número sem declaração de saturação — e `org_integrations` é a **primeira** das 4 páginas a alcançar o teto (~200 empresas, contra 1.000 para `organizations`). A consulta não tem `order by`, então as empresas mais novas — as que a seção mostra — são as menos prováveis de sobreviver ao corte. |
| QA-900-56-3 | baixa | O predicado do período decide um NÚMERO e mora no `page.tsx`, contra a regra que `console-visao-geral.ts` declara no próprio topo. Sem carrasco, e é o item que o @dev declara não ter discriminado na tela. |
| QA-900-56-4 | baixa | `t.status === "connected" \|\| t.status === "active"` é uma **terceira** tradução de `status`, ao lado da que a `900-57` acabou de centralizar para eliminar exatamente isso. Uma linha: usar `rotuloDeStatusDoTile(...).tom === "ok"`. |

#### Os 5 itens não provados na tela — meu julgamento
Forma `≥ N`: **basta** (mutações q5 e q7 atacam por lados opostos). Classe "convite pendente":
**basta** (4 testes, q6 mata em dois describes). Trilha com conteúdo: justificativa **correta** —
`platform_audit_log` tem 0 linhas em produção **e** no teste, medido. Vazio de partida: é o item
mais fraco, e não por si — é o mesmo ramo onde um erro de consulta aterrissa (QA-900-56-1).
Discriminação de período: **não basta** → QA-900-56-3.

#### Réguas
`turbo lint --force` rc=0 (0 erros; 30 warnings, **nenhum** em arquivo desta story) ·
`turbo type-check --force` rc=0, 8/8 · `build` de `packages/web` rc=0, 7 rotas de `/platform`
registradas e **nenhuma** `/platform/trilha` · `platform-query.ts` **intocado**, conferido contra
o commit e contra a árvore · teto de 1.000 **não morde nenhuma das 4 contagens hoje** (1, 5, 6 e
1 linha em produção).

**Merge liberado.** QA-900-56-1 e QA-900-56-2 antes do próximo PR que tocar esta tela.

