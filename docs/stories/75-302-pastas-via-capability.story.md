# Story 75-302 — Perfis de Acesso 2.0 · F3-1: Pastas via `can("pastas.gerenciar")`

**Story ID:** 75-302
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** S (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, verificação em dev]
- **Tipo:** migração de gate (F3, 1º módulo; template das próximas — F1/F2 em prod)

---

## Story

Como **admin**, quero **que o acesso ao módulo Pastas seja decidido pela capability
`pastas.gerenciar`** (matriz + exceções, sem dev), porque hoje ele é uma lista hardcoded
(`PASTA_MANAGER_ROLES`) que inclusive CONTRADIZ a matriz em produção: a Silmara
(`auxadministrativo`) tem o módulo Pastas LIGADO e a lista a bloqueia.

**Mudança de comportamento INTENCIONAL e aprovada pelo Marcos (13/08, pergunta direta):**
a Silmara PASSA a acessar Pastas — o módulo ligado passa a valer de verdade, via herança
da F1 (role customizado sem linha de capability herda do módulo). Todos os demais perfis:
comportamento idêntico (seed explícito da mig 225 decide).

## Context (conferido em `main` @ `333344d5`, 13/08)

- **Fonte única hoje:** `lib/pastas/roles.ts` → `PASTA_MANAGER_ROLES = [admin, supervisor,
  gerente-comercial, imob]` + `isPastaManager(role)`.
- **Consumidores (grep exaustivo):** 12 rotas API (`api/pastas/**`, `api/pasta-links/**`,
  padrão `if (!isPastaManager(appUser.role)) 403`) · 3 páginas (`dashboard/pastas/{,[id],
  imobiliarias}/page.tsx`, padrão redirect) · **`imobiliariasGuard`** (`lib/imob/guard.ts:37`
  = `canAccess("imob") OR isPastaManager` — o caso OR-composto do QA C-2 da 75-300) ·
  **`lib/notificacoes.ts:784`** (`.in("role", PASTA_MANAGER_ROLES)` — seleção de
  DESTINATÁRIOS, não autorização).
- **Diff seed × gate (QA C-1):** seed de `pastas.gerenciar` na mig 225 = admin, supervisor,
  gerente-comercial, imob (true) — **idêntico** à constante. Único delta = Silmara, por
  herança (o aprovado).
- **⚠️ Acoplamento que decide o desenho do guard:** a página
  `dashboard/pastas/imobiliarias` (gate de Pastas) consome as APIs de imobiliárias
  (gate `imobiliariasGuard`). Se a página liberar a Silmara e o guard não, a tela quebra
  para ela. O comentário do próprio guard (75-148) documenta a intenção: "perfis que só
  têm Pastas precisam listar/criar/editar imobiliária". Logo o ramo do guard vira
  `can("pastas.gerenciar")` — o acoplamento é DE NEGÓCIO, preservado.
  (`imob.imobiliarias_gerenciar` do registro fica para a F3 do IMOB decidir; segue
  não-enforced.)

## Decisão de desenho

1. **`lib/pastas/roles.ts` vira o gate assíncrono:** `canManagePastas(userId, orgId)` =
   `can(userId, orgId, "pastas.gerenciar")`. Rotas e páginas trocam a chamada síncrona pela
   assíncrona (mesmos 403/redirect). Constante e `isPastaManager` REMOVIDOS.
2. **`imobiliariasGuard`:** ramo `isPastaManager(role)` → `await canManagePastas(...)`.
3. **Destinatários de notificação acompanham a matriz:** a query `.in("role", CONSTANTE)`
   vira resolução por `role_permissions` reusando `resolveCapabilityDecision` (role-level,
   sem exceções): elegível = linha explícita `pastas.gerenciar` ?? módulo `pastas` (admin
   sempre). Silmara passa a ser notificada — coerente com o acesso que ganhou.
4. **`enforced: true` em `pastas.gerenciar` NA MESMA story** — a ação aparece na matriz e
   nas exceções com efeito real (regra anti-"botão que mente").
5. **Template F3 (fica de modelo):** (a) diff seed×gate ANTES de trocar; (b) OR-composto =
   compor, não substituir; (c) matar a constante no mesmo PR; (d) enforced junto do gate;
   (e) destinatário de notificação ≠ autorização, mas segue a matriz quando a semântica é
   "quem gerencia o módulo".

## Acceptance Criteria

- [x] **AC1** — Zero referência a `PASTA_MANAGER_ROLES`/`isPastaManager` no código (grep);
      12 rotas + 3 páginas + guard decidem por `canManagePastas`/`can()`.
- [x] **AC2** — Comportamento: admin/supervisor/gerente-comercial/imob idênticos (seed);
      demais perfis conhecidos seguem bloqueados (seed false explícito); **Silmara GANHA
      acesso** (herança, aprovado) — provado por resolução simulada (mesma tabela-verdade
      da F1) e/ou verificação em dev.
- [x] **AC3** — `imobiliariasGuard` mantém os dois ramos (módulo imob OU gestor de pastas);
      quem só tem Pastas continua gerenciando imobiliárias (inclusive a Silmara — a tela
      dentro de Pastas não quebra).
- [x] **AC4** — Destinatários da notificação de Pastas = quem a matriz diz que gerencia
      Pastas (decisão pura testada; Silmara incluída).
- [x] **AC5** — `pastas.gerenciar` enforced; linha de ação visível na matriz sob Pastas e
      nas Exceções; exceção individual passa a valer para Pastas.
- [x] **AC6** — Gates verdes (suíte, tsc forçado, eslint base 24, build) + verificação em
      dev com evidência (admin acessa Pastas e Imobiliárias; matriz mostra a ação).
- [x] **AC7** — Limites: RLS de pastas intocada (F4); perfil revisor "Deferido" segue
      futuro; `imob.imobiliarias_gerenciar` segue não-enforced (F3 do IMOB).

## Escopo

**IN:** `lib/pastas/roles.ts` (reescrito) · 12 rotas API · 3 páginas · `lib/imob/guard.ts` ·
`lib/notificacoes.ts` (destinatários) · `lib/capabilities.ts` (flag + helper de elegibilidade
por role se necessário) · testes (espelho do seed + elegibilidade).

**OUT:** RLS (F4) · demais módulos · UI nova (F2 já cobre) · exceções retroativas.

## Riscos

1. **Tela de imobiliárias quebrada p/ quem só tem Pastas** se o guard divergir da página —
   desarmado pelo AC3 (mesma capability nos dois).
2. **Notificação mudando destinatários silenciosamente** — AC4 exige teste puro da decisão
   e o delta declarado (só +Silmara).
3. **Rota esquecida** — AC1 é grep até zerar; a remoção da constante faz o compilador
   apontar sobras.

## Tasks

- [x] **T1 (AC5)** — `enforced: true` + teste do espelho (seed = ex-constante).
- [x] **T2 (AC1)** — `canManagePastas` + troca nas 12 rotas e 3 páginas.
- [x] **T3 (AC3)** — `imobiliariasGuard` composto.
- [x] **T4 (AC4)** — destinatários via matriz (decisão pura + teste).
- [x] **T5 (AC1)** — remover constante/`isPastaManager`; grep zero.
- [x] **T6 (AC2, AC6)** — gates + verificação em dev + resolução simulada da Silmara.

## Change Log

- 2026-08-13 · @sm (River) · Draft (template F3).
- 2026-08-13 · @po (Pax) · **GO (9/10)** — exigências incorporadas: AC2 tem de PROVAR o
  delta da Silmara (não só afirmar); AC4 com teste puro obrigatório; guard composto
  documentado como decisão de negócio (75-148), não conveniência. Status → **Ready**.

## File List

| arquivo | ação |
|---|---|
| `lib/pastas/roles.ts` | **reescrito** — `canManagePastas()` (constante e `isPastaManager` REMOVIDOS) |
| 11 rotas `api/pastas/**` + `api/pasta-links/**` | gate → `await canManagePastas(appUser.id, appUser.org_id)` (14 call sites; rotas com 2 métodos têm 2) |
| 3 páginas `dashboard/pastas/**` | idem com `user.id, user.orgId` |
| `lib/imob/guard.ts` | ramo pastas do `imobiliariasGuard` → `canManagePastas` (composição preservada) |
| `lib/notificacoes.ts` | destinatários de nova pasta = matriz (`roleEligibleForCapability`) |
| `lib/capabilities.ts` | `pastas.gerenciar` enforced + `roleEligibleForCapability` (pura) |
| `lib/capabilities.test.ts` | +4 testes (espelho, Silmara, explicit-false, admin) + asserts de enforced atualizados |
| 3 arquivos `.test.ts` de rotas/notificação | mocks adaptados ao gate por capability |

## Dev Agent Record

**Fable 5 · @dev (Dex) · YOLO · 13/08/2026** · Branch `feat/75-302-pastas-capability` (de `333344d5`).

- **Diff seed × gate (C-1):** `pastas.gerenciar` seed [admin, supervisor, gerente-comercial, imob] = `PASTA_MANAGER_ROLES` — idênticos; teste congela o espelho.
- **AC2 PROVADO com dados reais de prod** (resolução simulada em SQL, mesma ordem da `has_capability`, usuários ativos): **Silmara → true** (o delta aprovado); 4 corretores → false; 2 obras → false; 4 supervisores → true. Zero mudança além da aprovada.
- **Guard composto (C-2 aplicado):** `canAccess("imob") OR canManagePastas(...)` — a tela de imobiliárias dentro de Pastas não quebra para quem só tem Pastas (Silmara inclusive).
- **Notificação segue a matriz:** destinatários por `roleEligibleForCapability` (explícito ?? módulo; admin sempre) — Silmara passa a ser notificada, coerente com o acesso.
- **Smoke em dev (Playwright, read-only): 3/3** — `/dashboard/pastas` e `/dashboard/pastas/imobiliarias` acessíveis p/ admin; matriz mostra a ação "Gerenciar pastas" sob Pastas.
- **Gates:** suíte **2331 passed** (185 arquivos; +4 testes, 5 arquivos de teste adaptados) · tsc 0 (forçado) · eslint = base 24 · build 0 · grep `PASTA_MANAGER_ROLES|isPastaManager` = só comentários históricos.
- **Não observado:** Silmara navegando (conta real — NÃO gerei sessão dela por princípio); a prova é a simulação SQL + tabela-verdade. Exceção individual de Pastas: mesma mecânica validada na 75-301.

## QA Results

### 2026-08-13 · Quinn (@qa) · Round 1 — **PASS · quality score 96**

Primeira story F3 do template e a mais limpa até aqui: diff seed×gate idêntico e congelado em
teste; o único delta de comportamento é o APROVADO pelo Marcos, provado com dados reais; guard
OR-composto tratado como o C-2 pedia; constante morta no mesmo PR; enforced junto do gate.
Sem concerns novos. Observação (não-issue): a nota da mig do perfil "Deferido" (revisor)
continua futura — quando vier, é 1 toggle na matriz, não código.
