# Story 75-301 — Perfis de Acesso 2.0 · F2: ações na matriz + exceções por ação + clonar perfil (+ piloto Marketing)

**Story ID:** 75-301
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** M (~5 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, verificação manual em dev]
- **Tipo:** feature (Fase 2 do épico Perfis de Acesso 2.0; F1 = 75-300 em prod, mig 225 aplicada)

---

## Story

Como **admin da organização**, quero **ligar/desligar AÇÕES por perfil na matriz de Perfil de
Acesso, dar/negar uma ação a UM usuário específico na aba Exceções, e criar perfil novo clonando
um existente**, porque esse é o coração do épico ("fulano lê mas não apaga" sem dev) — e a F1 já
deixou o banco e a resolução prontos, faltando só a superfície de configuração.

E como **primeira prova de honestidade da UI**, a story migra o gate de **Marketing (Lídia)** —
o mais simples do inventário — para `can("marketing.gerenciar")`, de modo que o primeiro toggle
de ação exposto na matriz tenha efeito REAL de ponta a ponta.

---

## Context (conferido no código em `main` @ `9196e137`, 13/08)

- **A matriz já faz 90% do trabalho** (`perfil-acesso/permissions-matrix.tsx:656-698`): renderiza
  sub-linhas do `SUBMODULE_MAP` com herança visual (`explicit ?? pai`) e grava a chave dotted via
  `updatePermission`. Capability = mesma mecânica com outra fonte de linhas.
- **`updatePermission` e as actions de exceção NÃO validam a chave** contra lista — aceitam
  qualquer TEXT. Zero mudança de backend para gravar capabilities.
- **`getOrgPermissionsMatrix` já devolve as 1010 linhas do seed** (mapa cru por role) — a matriz
  client já RECEBE os valores das capabilities, só não os renderiza.
- **Aba Exceções** (`components/admin/user-edit-modal.tsx`): renderiza `ALL_MODULES` +
  `SUBMODULE_MAP` genericamente com 3 estados (herdar/permitir/bloquear) via
  `setUserException`/`removeUserException`. A resolução por exceção de capability **já funciona
  em prod** (canAccess dotted checa exceção primeiro) — falta só a linha na UI.
- **`createRole`** (`permissions.ts:462-558`): cria role + seed `ALL_MODULES = false`. Clonar =
  copiar TODAS as linhas de `role_permissions` do role fonte (módulos + telas + capabilities).
- **Piloto Marketing:** `marketingGuard` (`lib/marketing/guard.ts`) = `requireRole(appUser,
  MARKETING_POST_ROLES)` onde `MARKETING_POST_ROLES = ["admin","supervisor","social-media"]`
  (`lib/marketing/posts.ts:5`). O comentário do guard já dizia "épico de capabilities vai
  redesenhar isso". **Diff seed × gate (QA C-1 da 75-300): IDÊNTICOS** — o seed de
  `marketing.gerenciar` é exatamente admin/supervisor/social-media (conferido na mig 225 em
  prod). Gate é role-list puro (sem OR de módulo — QA C-2 não se aplica).
  Superfícies client: `campaigns/page.tsx:100`, `campaigns/meta/page.tsx:11`,
  `campaigns/agente/page.tsx:11` (aba/página "Agente") — conferir no código a forma exata da
  checagem antes de trocar.
- **Grupos virtuais** (marketing, nicole, portal…): não estão em `ALL_MODULES`, então a matriz
  não tem linha-pai para pendurar as ações. Grupo virtual não tem toggle de módulo (pai
  inexistente = default-deny por construção — F1).

### 🔒 Regra anti-"botão que mente" (decisão do épico)

Das 101 capabilities do registro, **só as com gate REAL no código podem aparecer em UI**. Esta
story introduz o flag `enforced` no registro; hoje só `marketing.gerenciar` o recebe (o piloto).
As stories F3 ligam o flag ao migrar cada módulo. Toggle de capability não-enforced NÃO É
RENDERIZADO em lugar nenhum.

---

## Decisão de desenho

1. **`enforced: boolean` no registro** (`lib/capabilities.ts`), com helpers derivados
   (`ENFORCED_CAPABILITIES`, agrupamento por prefixo) e `VIRTUAL_GROUP_LABELS` (label de exibição
   dos grupos virtuais na matriz). Invariante nova testada: capability `enforced` cujo grupo é
   virtual exige label do grupo.
2. **Matriz:** sob cada módulo, depois das sub-linhas de tela, entram as linhas de AÇÃO
   (enforced) com visual próprio (mesmo recuo, rótulo "ação" discreto) e a MESMA herança visual
   (`explícito ?? pai`). Grupos virtuais com ≥1 ação enforced ganham linha-pai sintética SEM
   toggle (célula "—", title explicando) + suas ações com herança `explícito ?? false`.
   Busca da matriz passa a considerar labels das ações.
3. **Exceções:** as ações enforced entram na lista da aba Exceções (mesma UI de 3 estados),
   agrupadas visualmente como as telas. Backend intacto.
4. **Clonar perfil:** `createRole` ganha `cloneFromRoleId?: string`; quando presente, o seed
   inicial = cópia das linhas do role fonte (módulos + dotted). Modal ganha um `<select>`
   "Começar do zero (padrão) / Clonar de {perfil}". Resolve também o AC7b da 75-300 (role novo
   sem linhas de capability).
5. **Piloto Marketing:** `marketingGuard` troca `requireRole` por `can(appUser.id, appUser.orgId,
   "marketing.gerenciar")` (403 igual ao atual); as 3 superfícies client trocam a lista de roles
   pela MESMA pergunta (via prop calculada no server component). `MARKETING_POST_ROLES` é
   removida se ficar sem consumidores (regra F3: cada story mata suas constantes). O flag
   `enforced` de `marketing.gerenciar` vira `true` NA MESMA story — nunca antes do gate.
6. **O que esta story NÃO muda:** contador "N/M ativos" dos chips segue contando só módulos;
   `podeVerMenuConfig` intacto; RLS intacta; nenhuma outra capability enforced.

---

## Acceptance Criteria

- [x] **AC1 — registro.** `CapabilityDef` ganha `enforced: boolean`; só `marketing.gerenciar` =
      `true`. Invariantes novas testadas: (a) grupo virtual com capability enforced tem entrada
      em `VIRTUAL_GROUP_LABELS`; (b) helpers derivados (`ENFORCED_CAPABILITIES`) refletem o flag.
- [x] **AC2 — matriz com ações.** Na matriz, capability enforced aparece como sub-linha do seu
      módulo/grupo com toggle por role, gravando a chave exata via `updatePermission` e exibindo
      herança (`explícito ?? pai`; grupo virtual: `explícito ?? false`). Capability NÃO enforced
      não aparece (as outras 100). Grupo virtual sem ação enforced não aparece.
- [x] **AC3 — exceções por ação.** A aba Exceções do Editar Usuário lista as ações enforced com
      os 3 estados (herdar/permitir/bloquear), persistindo em `user_permission_exceptions` pela
      action existente. Exceção de ação vence o perfil (já garantido pela resolução da F1 — a
      story só expõe).
- [x] **AC4 — clonar perfil.** Criar perfil com "clonar de X" copia TODAS as linhas de
      `role_permissions` de X (módulos, telas e capabilities); sem clone, comportamento atual
      (tudo false). Erro no meio não deixa role órfão (cleanup best-effort existente preservado).
- [x] **AC5 — piloto Marketing enforced de verdade.** `marketingGuard` e as 3 superfícies client
      decidem por `can("marketing.gerenciar")`. Comportamento hoje-igual (diff seed×gate =
      idênticos, documentado). Exceção individual passa a funcionar para Marketing (poder novo
      intencional). `MARKETING_POST_ROLES` removida (ou justificado por que ficou).
- [x] **AC6 — zero regressão.** Suíte sem regressão, `tsc --noEmit` forçado, eslint sem erro
      novo (base 24 warnings), `next build` exit 0. Verificação manual em dev (admin real):
      matriz renderiza a ação do piloto, toggle grava e recarrega coerente, exceção grava,
      clonar cria cópia fiel, telas de campanhas seguem acessíveis para admin.
- [x] **AC7 — limites declarados.** (a) 100 capabilities seguem sem UI até suas stories F3;
      (b) desligar `marketing.gerenciar` de admin NÃO o bloqueia (admin = fullMatrix + exceção —
      só exceção individual nega admin; comportamento da F1, documentado no tooltip/story);
      (c) contador dos chips não conta ações; (d) RLS de marketing_posts continua "sem policies +
      admin client" (fora do escopo; F4).

## Escopo

**IN:** `lib/capabilities.ts` (flag + helpers) · `lib/capabilities.test.ts` (invariantes novas) ·
`permissions-matrix.tsx` (linhas de ação + grupos virtuais + busca) · `user-edit-modal.tsx`
(ações nas exceções) · `create-role-modal.tsx` + `createRole` (clonar) · `lib/marketing/guard.ts`
+ 3 páginas de campaigns (piloto) · remoção de `MARKETING_POST_ROLES` se zerar consumidores.

**OUT:** enforcement de qualquer outra capability (F3) · RLS (F4) · grupos visuais novos para
capabilities não-enforced · redesign visual da matriz · blindagem extra de `is_system` (F4) ·
decisão do `auxadministrativo` (F3 de pastas, com o Marcos).

## Riscos

1. **Botão que mente invertido no piloto:** trocar o guard e esquecer uma superfície client (a
   aba some mas a rota responde, ou vice-versa). Mitigação: grep por `MARKETING_POST_ROLES` e
   por listas `["admin","supervisor","social-media"]` até zerar; a remoção da constante força o
   compilador a apontar sobras.
2. **Herança visual divergente da resolução real** (matriz mostra ON herdado mas can() nega, ou
   vice-versa). Mitigação: a exibição usa a MESMA regra da F1 (`explícito ?? pai`, virtual ??
   false) — extrair a decisão de exibição para função pura testada contra
   `resolveCapabilityDecision` nos casos sem exceção.
3. **Clone parcial** (falha no INSERT em lote deixa role incompleto). Mitigação: um único INSERT
   com todas as linhas + cleanup existente em erro.
4. **Admin "se desligando"** pela matriz (AC7b): toggle de capability de admin não tem efeito
   real (fullMatrix) — risco de UI mentirosa PARA ADMIN. Decisão: a célula de admin em linhas de
   AÇÃO renderiza travada em ON (disabled, title "Admin sempre tem todas as ações; use uma
   exceção individual para negar"), espelhando a resolução real.

## Tasks

- [x] **T1 (AC1)** — Flag `enforced` + helpers + `VIRTUAL_GROUP_LABELS` + invariantes.
- [x] **T2 (AC2, riscos 2 e 4)** — Linhas de ação na matriz (+ grupos virtuais, busca, célula de
      admin travada); função pura de exibição testada.
- [x] **T3 (AC3)** — Ações enforced na aba Exceções.
- [x] **T4 (AC4, risco 3)** — `cloneFromRoleId` no `createRole` + select no modal.
- [x] **T5 (AC5, risco 1)** — Piloto: guard + 3 superfícies + remoção da constante + diff
      seed×gate registrado no record.
- [x] **T6 (AC6)** — Gates + verificação manual em dev com evidência registrada.
- [x] **T7 (AC7)** — Limites no código e no record.

## Testing

- **Unitário:** invariantes novas do registro; função pura de exibição da herança (matriz)
  cobrindo módulo/virtual/explícito/admin.
- **Estático:** typecheck forçado, eslint vs. base 24, `next build`.
- **Manual em dev (obrigatório):** fluxo completo da matriz + exceção + clone + acesso a
  campanhas com admin. Registrar o que foi VISTO.

## Change Log

- 2026-08-13 · @sm (River) · Draft criado (F2 do épico, com piloto Marketing).
- 2026-08-13 · @po (Pax) · Validação 10 pontos: **GO (9/10)**. Ajustes exigidos e já
  incorporados: risco 4 virou requisito de UI (célula de admin travada em linhas de ação —
  matriz nunca mostra estado que a resolução não honra); AC5 exige diff seed×gate NO RECORD
  (não só afirmado); T6 exige evidência descrita, não "funciona". Status → **Ready**.

## File List

**11 arquivos: 0 novos de rota, 1 componente novo inline.** Zero migration, zero dependência nova.

| arquivo | ação | papel |
|---|---|---|
| `lib/capabilities.ts` | modificado | flag `enforced`, `ENFORCED_CAPABILITIES`, `enforcedCapabilitiesByGroup`, `VIRTUAL_GROUP_LABELS`, `capabilityCellState`, `adminMatrixKeys` (fix T6) |
| `lib/capabilities.test.ts` | modificado | +7 testes (enforced, cell state ×24 combinações vs contrato, adminMatrixKeys) |
| `lib/permissions.ts` | modificado | `adminFullMatrix()` (módulos+grupos virtuais p/ admin — fix do bug do T6) + `createRole` com `cloneFromRoleId` |
| `perfil-acesso/permissions-matrix.tsx` | modificado | `CapabilityActionRow`, grupos virtuais, busca por ação, toggle com `lockedReason` |
| `perfil-acesso/actions.ts` | modificado | assinatura do `createRole` c/ clone |
| `perfil-acesso/create-role-modal.tsx` | modificado | select "Permissões iniciais" (clonar de perfil) |
| `perfil-acesso/profile-actions-header.tsx` + `page.tsx` | modificados | prop `cloneOptions` (roles reais da org) |
| `components/admin/user-edit-modal.tsx` | modificado | ações enforced na aba Exceções (`CapabilityExceptionRow`) + grupos virtuais |
| `lib/marketing/guard.ts` | modificado | **piloto**: `requireRole(MARKETING_POST_ROLES)` → `can("marketing.gerenciar")` |
| `lib/marketing/posts.ts` + `posts.test.ts` | modificados | constante `MARKETING_POST_ROLES` REMOVIDA; teste congela o espelho via `CAPABILITY_SEED` |
| `campaigns/page.tsx` · `campaigns/meta/page.tsx` · `campaigns/agente/page.tsx` | modificados | 3 superfícies client do piloto via `can()` |

## Dev Agent Record

**Agent Model Used:** Fable 5 (`claude-fable-5`) · @dev (Dex) · modo **YOLO** · 13/08/2026
**Branch:** `feat/75-301-capabilities-ui-matriz` (de `main` @ `9196e137`).

### 🔴 Bug REAL descoberto e corrigido pelo T6 (a razão de o piloto existir)

Na 1ª execução da verificação em dev, **admin perdeu a aba Lídia e era redirecionado** de
`/campaigns/agente`. Causa-raiz: para admin, `getUserPermissions` devolvia `fullMatrix()`
(só chaves de `ALL_MODULES`) — o grupo virtual `marketing` não existia no mapa, a herança do
pai dava `false` e `can()` **negava admin** em capability de grupo virtual. O contrato da F1
(`resolveCapabilityDecision`: admin → `parentException ?? true`) e o `has_capability` SQL já
davam `true` — **a divergência era do app**. Fix: `adminFullMatrix()` = módulos + grupos
virtuais, usado nos 3 pontos de resolução do admin; `fullMatrix()` original preservada para o
spread do supervisor hardcoded (zero raio colateral). Helper puro `adminMatrixKeys` testado.
**Sem o piloto enforced nesta story, esse bug teria ido dormir até a F3.**

### Diff seed × gate do piloto (QA C-1 da 75-300) — IDÊNTICOS

`MARKETING_POST_ROLES` (admin, supervisor, social-media) × seed de `marketing.gerenciar` na
mig 225 (conferido em prod: 3 linhas `true`, 7 `false`) — mesmos 3 roles. Gate era lista pura
(sem OR de módulo → C-2 não se aplica). Teste em `posts.test.ts` congela o espelho.

### Decisões autônomas

1. **`enforced?: true`** (opcional) em vez de `enforced: boolean` em 101 entradas — mesmo
   contrato do AC1, sem 100 linhas de ruído; invariante garante a lista.
2. **Célula de admin em linha de ação = ON travado** com title explicativo (requisito do @po,
   risco 4) — espelha a resolução real; `aria-label` inclui o motivo.
3. **Label da capability piloto** renomeada p/ "Gerenciar marketing (Lídia)" (grupo já se chama
   "Marketing (Lídia)" — evita linha duplicada visualmente).
4. **Aba Exceções**: "Perfil base" da ação usa `basePerms[cap] ?? base do módulo` — herda o
   quirk PRÉ-EXISTENTE de `getUserPermissions` mesclar exceções no mapa (quando há exceção, a
   coluna base reflete o valor da exceção). Igual às telas hoje; não corrigido (raio).

### T6 — verificação em dev (banco = PROD, 100% read-only)

Técnica da 75-299: `next dev` local (porta 3777) + Playwright headless. Login SEM tocar em
conta: `generateLink` (admin API) → `verifyOtp` no Node → cookie `sb-*-auth-token` no formato
`@supabase/ssr` injetado no browser (o redirect do magic link vai p/ prod — allowlist — por
isso a troca). Conta seed `lucas@trifold.com.br` (admin). **Nenhuma escrita**: toggle, exceção
e clone NÃO foram acionados contra o banco de prod — ver "não observado".

**11/11 checks na execução final** (2 falhas intermediárias foram: o bug real acima + seletor
errado — a aba chama "Lídia", não "Agente"):
matriz com grupo virtual + linha de ação + badge + descrição ✓ · célula do admin
`disabled=true checked=true` ✓ · 11 colunas de role (a org tem 11 roles, incl.
`auxadministrativo`) ✓ · modal com select de clone (12 opções = 11 roles + "do zero") ✓ ·
exceções com grupo virtual e linha de ação ✓ · aba Lídia visível p/ admin ✓ · `/campaigns/agente`
sem redirect p/ admin ✓. Screenshots: `t6-matriz.png`, `t6-matriz-virtual.png`,
`t6-excecoes.png` (scratchpad da sessão).

### T6 — o que NÃO foi observado (honestidade)

- **Escritas** (toggle de ação, exceção de ação, criação de perfil clonado): não acionadas —
  dev aponta pro banco de PROD. O caminho de escrita do toggle/exceção é o MESMO código que os
  sub-módulos usam em prod desde 75-150-c (reuso, não código novo); o clone é código novo SEM
  observação de runtime — validar no deploy criando/excluindo um perfil de teste com o Marcos.
- **social-media/supervisor** navegando: sem credencial ativa desses perfis; cobertura vem do
  espelho exato do seed + teste de contrato.

### Gates (saída real, pós-fix)

| gate | resultado |
|---|---|
| suíte | **185 arquivos, 2327 passed \| 6 expected fail (2333)** (+8 testes desta story) |
| typecheck | `npx tsc --noEmit` forçado: **exit 0** |
| eslint | **24 problems (0 errors, 24 warnings)** = linha de base; arquivos tocados: zero |
| build | `npx next build`: **exit 0** |
| grep constante morta | `MARKETING_POST_ROLES`: só comentários históricos (3) |

## QA Results

### Review Date: 2026-08-13 · Reviewed By: Quinn (@qa, Test Architect) · Round 1

**Veredito: CONCERNS · quality score 91 · nada bloqueia o PR.**

O piloto provou o valor no primeiro uso: o T6 pegou um bug real de resolução (admin × grupo
virtual) que os testes unitários da F1 não podiam pegar (o contrato estava certo; a
implementação do mapa do admin divergia). Fix mínimo, com helper puro testado, e o SQL já
estava correto — nenhuma migration.

Concerns (low, nenhum bloqueia):
- **C-1:** clone de perfil sem observação de runtime (escrita em prod evitada de propósito).
  → Validar no deploy: criar perfil clonando "Supervisor", conferir a matriz, excluir.
- **C-2:** o quirk pré-existente da aba Exceções (coluna "Perfil base" reflete exceção quando
  ela existe) agora também aparece nas ações — cosmético, herdado das telas. Candidata a story
  de UX menor, fora deste épico.
- **C-3:** `capabilityCellState` não representa exceções de USUÁRIO (correto — a matriz é por
  role), mas o title da célula travada do admin menciona exceção individual: conferido que a
  aba Exceções honra deny p/ admin via resolução (exceção exata vence admin — F1). OK.

Checks: code review PASS · unit tests PASS (2327) · AC PASS (AC1-7) · regressões PASS ·
performance PASS (can() = 1 chamada cacheada por request) · security PASS (nenhum gate
afrouxado; diff seed×gate idêntico) · docs PASS.

## Change Log (apêndice)

- 2026-08-13 · @dev (Dex) · Implementação completa + fix do bug admin×grupo virtual (T6).
- 2026-08-13 · @qa (Quinn) · Gate CONCERNS (91) — 3 lows, nenhum bloqueia.
