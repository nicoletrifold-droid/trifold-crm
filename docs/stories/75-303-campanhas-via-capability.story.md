# Story 75-303 — Perfis de Acesso 2.0 · F3-2: Campanhas & Meta Ads via capabilities

**Story ID:** 75-303
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** S (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, smoke em dev]
- **Tipo:** migração de gate (F3-2, template da 75-302; F1/F2/F3-1 em prod)

## Story

Como **admin**, quero **as 5 ações de Campanhas/Meta Ads decididas pela matriz**
(`campanhas.gerenciar`, `campanhas.disparar`, `campanhas.meta_sincronizar`,
`campanhas.meta_acionar`, `campanhas.meta_ver`), porque hoje são 19 checagens hardcoded —
incluindo 2 usos do proxy `canAccess("sistema")` como "é admin?" (achado do inventário).

**Zero mudança de comportamento** (diff seed × gate, QA C-1):
- `campanhas.gerenciar`/`disparar` seed [admin, supervisor] = `requireRole(["admin","supervisor"])` dos 15 sites ✓
- `meta_sincronizar`/`meta_acionar`/`meta_ver` seed [admin] = `requireRole(["admin"])` / inline `role !== "admin"` / proxy `canAccess("sistema")` (só admin tem o módulo sistema) ✓

## Context (conferido em `main` @ `b09a7784`, 13/08)

- **15 sites em `api/campaigns/**`** com `requireRole(["admin","supervisor"])`:
  gerenciar = route(54,127) · [id]/route(13,83) · activate(12) · pause(12) · images(12,36,85) ·
  upload-image(20) · entries(12); disparar = send-whatsapp(43) · send-emails(14) ·
  import-csv(54) · discover-fields(80).
- **4 sites em `api/meta-ads/**`**: sync(8) `["admin"]` → meta_sincronizar ·
  [id]/action(20) `["admin"]` → meta_acionar · [id]/actions(30) `["admin"]` → meta_ver ·
  [id]/creatives(99) inline `role !== "admin"` → meta_ver.
- **2 páginas com o proxy** `canAccess("sistema")`: `campaigns/meta/page.tsx:9` (Sync + painel)
  → `can("campanhas.meta_sincronizar")`; `campaigns/meta/[campaign_id]/page.tsx:13` (ações +
  log) → `can("campanhas.meta_acionar")`. Hoje ambos = admin; seeds = [admin] — idêntico.
- **Primitiva nova da F3:** `requireCapability(appUser, key)` em `api-auth.ts` (espelho async
  do `requireRole`) — vira o padrão das próximas stories.
- **Fora desta story:** o "modo admin" do `AgentChatPanel` (confirmar/cancelar ações do agente)
  continua recebendo a mesma prop — as capabilities `agente.*` têm F3 própria; hoje tudo é
  admin-only nos dois modelos, então a prop pode trocar de fonte sem delta.

## Acceptance Criteria

- [x] **AC1** — 19 checagens hardcoded de campanhas/meta substituídas por
      `requireCapability`/`can()` com o mapeamento acima; grep de
      `requireRole` em `api/campaigns|api/meta-ads` = zero.
- [x] **AC2** — Comportamento idêntico p/ todos os perfis (seeds = listas antigas; testes
      congelam os 5 espelhos).
- [x] **AC3** — 5 capabilities enforced; ações aparecem na matriz sob Campanhas e nas Exceções.
- [x] **AC4** — `requireCapability` criado em `api-auth.ts`, documentado como padrão F3.
- [x] **AC5** — Gates verdes + smoke em dev (admin: telas de campanhas/meta funcionam; matriz
      mostra as ações).
- [x] **AC6** — Limites: `AgentChatPanel` interno segue com a prop atual (F3 do agente);
      RLS (F4) intocada.

## Riscos

1. **Proxy `canAccess("sistema")` também servia de "é admin" para o painel do agente** —
   mitigado: seed [admin] = proxy hoje; delta zero; F3 do agente refina.
2. **Site esquecido** — grep até zerar (AC1).

## Tasks

- [x] **T1 (AC4)** — `requireCapability` em api-auth.
- [x] **T2 (AC1,2)** — swap dos 19 sites + 2 páginas.
- [x] **T3 (AC3)** — enforced ×5 + testes-espelho.
- [x] **T4 (AC5)** — gates + smoke.

## Change Log

- 2026-08-13 · @sm (River) · Draft (template 75-302).
- 2026-08-13 · @po (Pax) · **GO (9/10)** — exigido: mapear entries→gerenciar explicitamente
  (leitura vs escrita fica p/ quando houver demanda — não inventar granularidade); prop das
  páginas meta documentada como troca de FONTE sem delta. Status → **Ready**.

## File List

| arquivo | ação |
|---|---|
| `lib/api-auth.ts` | **`requireCapability(appUser, key)`** — primitiva padrão F3 (espelho async do requireRole) |
| 11 rotas `api/campaigns/**` | 15 sites `requireRole(["admin","supervisor"])` → `requireCapability` (gerenciar ×11, disparar ×4) |
| 4 rotas `api/meta-ads/**` | sync→meta_sincronizar · action→meta_acionar · actions/creatives→meta_ver (creatives era inline `role !== "admin"`) |
| `campaigns/meta/page.tsx` + `meta/[campaign_id]/page.tsx` | proxy `canAccess("sistema")` → `can(meta_sincronizar)` / `can(meta_acionar)` |
| `lib/capabilities.ts` | 5 caps enforced |
| `lib/capabilities.test.ts` | +2 testes-espelho; asserts de enforced atualizados (7 caps) |

## Dev Agent Record

**Fable 5 · @dev (Dex) · YOLO · 13/08/2026** · Branch `feat/75-303-campanhas-capability` (de `b09a7784`).

- **Diff seed × gate (C-1):** gerenciar/disparar [A,S] = requireRole antigo ✓ · meta_* [A] =
  requireRole(["admin"]) / inline / proxy sistema ✓ — congelado em 2 testes. **Zero delta.**
- **19 sites trocados** (15 campaigns + 4 meta-ads, incl. o inline de creatives) + 2 páginas;
  grep `requireRole` em `api/campaigns|api/meta-ads` = **0**.
- **2 usos do proxy `canAccess("sistema")` eliminados** (achado do inventário: "sistema como
  é-admin"); restam 4 no app (usuários, leads/bulk, obras) — módulos de F3 futuras.
- **Smoke em dev (read-only): 7/7** — campanhas e meta abrem p/ admin, botão Sincronizar
  presente, 5 ações na matriz sob Campanhas.
- **Gates:** suíte **2333 passed** · tsc 0 · eslint = base 24 · build 0.
- **Não observado:** supervisor navegando (sem credencial ativa); coberto pelo espelho exato +
  testes. Painel do agente (AgentChatPanel) segue com a prop atual — F3 do agente (AC6).

## QA Results

### 2026-08-13 · Quinn (@qa) · Round 1 — **PASS · quality score 95**

Template F3 executado limpo pela 2ª vez. Destaque: `requireCapability` em api-auth padroniza
as próximas stories (1 linha por site). Espelhos congelados; proxy "sistema" reduzido de 6→4
usos. Observação (não-issue): `entries` (leitura) ficou sob `gerenciar` — granularidade
leitura/escrita de campanhas só se houver demanda (decisão do @po mantida).
