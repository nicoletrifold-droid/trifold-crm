# Story — Badge de aprovações pendentes por obra na lista de Obras

**Status:** Done
**Epic:** Obras / Aprovações de upload ([[project-modulo-lancamentos]] é irmão; aqui é `obras`)
**Relacionado:** migration `033_obra_upload_aprovacoes.sql` (tabela + índice `obra_id`); badge global do menu (`app/dashboard/layout.tsx:146-152`); aba Aprovações (`obras/[obra_id]/_components/aprovacoes-tab.tsx` + deep-link `?tab=aprovacoes`)
**Complexidade:** S (mudança de FRONTEND, 1 arquivo: `app/dashboard/obras/page.tsx`; sem migration, sem backend novo)

## Contexto
O menu lateral mostra um badge laranja em **"Obras"** (ex.: "14"). Esse número é a soma **global**
de aprovações de upload pendentes (`obra_upload_aprovacoes`, `status='pendente'`, filtrado só por
`org_id` — `layout.tsx:146-152`), gate para **admin/supervisor** (`isAdminOrSupervisorObras`,
`layout.tsx:109-110`). Ao clicar, o usuário cai na lista de Obras (`obras/page.tsx`) que **não mostra
de qual obra vêm essas pendências** — a pessoa vê "14" mas não sabe se é Solum, Yarden ou Vind, e se
perde. Feedback direto do diretor: "ao clicar tem que mostrar sobre qual obra está falando; e ao
clicar na obra, sobre qual item".

### O que já existia (não recriar)
- **Drill-down por item:** a página da obra tem a aba **"Aprovações"** (`aprovacoes-tab.tsx`) que
  lista os itens pendentes daquela obra e permite aprovar/rejeitar. O "ver qual item ao clicar na
  obra" **já funcionava**.
- **Deep-link para a aba:** `obras/[obra_id]/page.tsx:218-219,331` lê `searchParams.tab` e passa
  como `initialTab` ao `ObraDetailTabs`, que valida contra `["fases","fotos","documentos",
  "mensagens","clientes","aprovacoes"]` (`obra-detail-tabs.tsx:419-424`). Logo
  `/dashboard/obras/{id}?tab=aprovacoes` abre direto na aba Aprovações.

### Elo que faltava
A **lista de Obras** não expõe a fatia por obra. Este é o único gap: quebrar o "14" por obra na
listagem, com link direto para a aba Aprovações.

## Story
**As a** admin/supervisor que aprova uploads de obra,
**I want** ver na lista de Obras quantas aprovações pendentes cada obra tem, com um clique que me leva
direto para a aba Aprovações daquela obra,
**so that** eu não me perca com o número agregado do menu — sei exatamente qual obra tratar e chego
nos itens em um clique.

## Acceptance Criteria
1. **AC1** — Em `/dashboard/obras`, um usuário **admin/supervisor** vê uma coluna **"Pendências"**;
   cada obra com pendências mostra um selo laranja clicável (`● N a aprovar`) e as sem pendência
   mostram `—`.
2. **AC2** — A **soma** das contagens exibidas (ativas **+ arquivadas**) é **igual** ao badge "Obras"
   do menu lateral — mesma fonte (`obra_upload_aprovacoes`, `status='pendente'`, `org_id`), apenas
   agrupada por `obra_id`.
3. **AC3** — Clicar no selo navega para `/dashboard/obras/{id}?tab=aprovacoes` e a página abre **já
   na aba Aprovações** daquela obra (reusa o deep-link existente).
4. **AC4** — **Gate igual ao do menu:** a coluna/selo só aparece para **admin/supervisor**. Outros
   perfis (ex.: `obras`, `corretor`) **não** veem a coluna e **não** disparam a query extra.
5. **AC5** — **Sem regressão:** as colunas existentes (Nome, Status, Progresso, Data prevista,
   Gerenciar/Reativar) e o estado vazio continuam corretos; `colSpan` do estado vazio acompanha a
   coluna nova (6 quando há a coluna, 5 quando não).
6. **AC6** — **Sem migration, sem backend novo, sem alteração de RLS.** Só leitura via client
   server-side já existente; nenhuma rota criada.

## Tasks / Subtasks
- [x] **Task 1 — Query por obra** (AC1, AC2, AC4)
  - [x] `canApprove = user.role === "admin" || user.role === "supervisor"` (acesso a `obras` já
        garantido por `canAccess` no topo da página).
  - [x] Se `canApprove`: `select("obra_id")` de `obra_upload_aprovacoes` com `.eq("org_id")` +
        `.eq("status","pendente")`; reduzir para `Record<obra_id, number>` em JS (poucas linhas —
        contagem = badge do menu). PostgREST não faz GROUP BY direto pelo client, então a agregação
        é feita em memória.
- [x] **Task 2 — Coluna + selo** (AC1, AC3, AC5)
  - [x] Helper `PendenciaCell({obraId, count})`: `count<=0` → `—`; senão `<Link>` laranja
        `● {count} a aprovar` para `/dashboard/obras/{id}?tab=aprovacoes`.
  - [x] `<th>Pendências</th>` condicional a `canApprove`, entre Status e Progresso.
  - [x] `<td>` condicional nas linhas **ativas** e **arquivadas** (arquivadas também contam para bater
        com o menu — AC2).
  - [x] `colSpan` do estado vazio: `canApprove ? 6 : 5`.
- [x] **Task 3 — Verificação** (AC1-AC6)
  - [x] `tsc --noEmit` → 0 erros no arquivo. `eslint` no arquivo → 0.
  - [x] `next build` → (preencher pelo @qa).

## Dev Notes
- **Arquivo único:** `packages/web/src/app/dashboard/obras/page.tsx`.
- **Reuso > criação:** reaproveita a fonte de dados do badge do menu e o deep-link `?tab=aprovacoes`
  que já existia; não cria endpoint nem componente de aba.
- **Gate por role** espelha `layout.tsx:109-110` (admin/supervisor). Coerente com a exibição do badge
  do menu — quem não vê o "14" também não vê a coluna.
- **Arquivadas contam:** o badge do menu NÃO filtra `deleted_at`; para a soma bater, a coluna também
  aparece nas obras arquivadas.
- **Tema:** selo usa classes light + `dark:` (`bg-orange-100 … dark:bg-orange-500/15`), coerente com
  os demais badges da página ([[feedback-theme-convention]] — `/dashboard` é light/dark).

### Testing
- Sem teste unitário (server component; mesmo padrão de 75-151/153). Verificação por build +
  conferência E2E em prod/preview.
- Cenários: (1) admin/supervisor: coluna aparece, soma = "14" do menu; (2) clique no selo → abre aba
  Aprovações; (3) perfil sem permissão de aprovar → sem coluna; (4) obra arquivada com pendência conta.

## Out of Scope
- Aba **Aprovações** e fluxo de aprovar/rejeitar — já existem, inalterados.
- Badge do **menu lateral** — inalterado (continua sendo a soma global).
- Backend/rotas/RLS/migration — nada tocado.

## Riscos
- **Soma não bater com o menu** se a coluna esquecer as arquivadas → mitigado (AC2 + Task 2 inclui
  arquivadas).
- **Coluna vazar para perfil sem permissão** → mitigado pelo gate `canApprove` (AC4).
- **PostgREST sem GROUP BY** → contagem em memória; volume pequeno (nº de pendências da org), custo
  desprezível.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 0.1 | Story criada: quebrar o badge global "Obras" por obra na lista, com selo clicável → aba Aprovações. 1 arquivo (`obras/page.tsx`), sem migration/backend. | @sm (River) |
| 2026-07-15 | 1.0 | Validada (@po). ACs testáveis, escopo IN/OUT claro, dependências (migration 033, deep-link `?tab=aprovacoes`, gate do layout) conferidas contra o código. GO. Draft→Ready. | @po (Pax) |
| 2026-07-15 | 1.1 | Implementada (@dev). `obras/page.tsx`: `canApprove` + query agrupada por `obra_id` + coluna/selo `PendenciaCell` linkando `?tab=aprovacoes`, ativas+arquivadas, colSpan ajustado. tsc 0 erros, eslint 0. Ready→Review. | @dev (Dex) |
| 2026-07-15 | 1.2 | QA gate **PASS** (@qa). tsc 0, eslint 0, `next build` Compiled successfully (rota `/dashboard/obras` gerada como dynamic, sem erro server/client). Sem regressão nas colunas existentes; gate por role confere com o badge do menu; deep-link `?tab=aprovacoes` reusado. E2E visual (soma = badge do menu, clique abre aba) delegado à conferência em preview/prod. Review→Done. | @qa (Quinn) |

## Dev Agent Record
### Agent Model Used
claude-opus-4-8[1m]

### Debug Log References
- `tsc --noEmit` → 0 erros em `obras/page.tsx`.
- `eslint src/app/dashboard/obras/page.tsx` → 0.
- `next build` → (registrado no QA Results).

### Completion Notes
Mudança 100% frontend em `packages/web/src/app/dashboard/obras/page.tsx`:
1. `PendenciaCell` (helper de render): selo laranja `● N a aprovar` linkando
   `/dashboard/obras/{id}?tab=aprovacoes`, ou `—` quando zero.
2. `canApprove` (admin/supervisor) + query `select("obra_id")` filtrada por org+status pendente,
   agregada em `pendentesPorObra` (Record<id, count>).
3. `<th>Pendências</th>` e `<td>` condicionais (ativas + arquivadas), `colSpan` do vazio 6/5.

### File List
- `packages/web/src/app/dashboard/obras/page.tsx` (modificado)
- `docs/stories/obras-pendencias-aprovacao-por-obra.story.md` (novo)

## QA Results

### Review Date: 2026-07-15
### Reviewed By: Quinn (Test Architect)

**Escopo real:** 1 arquivo de produto alterado (`packages/web/src/app/dashboard/obras/page.tsx`) +
story (novo). Zero backend, zero migration, zero RLS → AC6 confirmado pelo diff.

**Traceability AC→código (7 checks):**

| # | Check | Veredito | Evidência |
|---|-------|----------|-----------|
| 1 | Code review | **PASS** | `PendenciaCell` limpo; query reusa a MESMA fonte do badge do menu (`obra_upload_aprovacoes`, `status='pendente'`, `org_id`), só agregando por `obra_id` em memória. |
| 2 | Unit tests | **PASS** | Sem teste novo (server component, padrão 75-151/153). Nenhuma suíte tocada. |
| 3 | Acceptance criteria | **PASS** | AC1 (coluna+selo), AC2 (soma inclui arquivadas = badge menu), AC3 (link `?tab=aprovacoes` reusa deep-link existente `obra-detail-tabs.tsx:419-424`), AC4 (gate `canApprove` = admin/supervisor), AC5 (colSpan 6/5), AC6 (sem backend/migration). |
| 4 | No regressions | **PASS** | Colunas existentes intactas; coluna e query só existem sob `canApprove` (perfis sem permissão não disparam query). `next build` gera `/dashboard/obras` sem erro. |
| 5 | Performance | **PASS** | 1 select extra só para admin/supervisor; volume = nº de pendências da org (pequeno); agregação O(n) em memória. |
| 6 | Security | **PASS** | Nenhuma permissão nova; gate por role espelha o do layout; leitura via client server-side já existente (RLS vigente). |
| 7 | Documentation | **PASS** | Story + Dev Agent Record + este gate. |

**Build/qualidade:** `tsc --noEmit` → 0 erros; `eslint` no arquivo → 0; `next build` → **Compiled
successfully** (`/dashboard/obras` = ƒ dynamic, sem erro de fronteira server/client).

**A conferir em preview/prod (E2E, não bloqueia):**
1. Soma dos selos (ativas+arquivadas) == número do badge "Obras" do menu.
2. Clique no selo abre a obra **já na aba Aprovações**.
3. Perfil `obras`/`corretor` **não** vê a coluna.

### Gate Status
Gate: PASS → docs/qa/gates/obras-pendencias-aprovacao-por-obra.yml

— Quinn 🛡️
