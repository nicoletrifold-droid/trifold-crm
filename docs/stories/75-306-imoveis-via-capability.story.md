# Story 75-306 — Perfis de Acesso 2.0 · F3-5: Imóveis via capabilities

**Story ID:** 75-306
**Epic:** 75 (CRM Trifold) · **Status:** InReview · **Estimativa:** S (~3 pts)

- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [vitest, typecheck, lint, next build, smoke em dev]
- **Tipo:** migração de gate (F3-5; inclui a 1ª capability ADICIONADA pós-fundação → mig 226)

## Story

Como **admin**, quero **as 7 ações de Imóveis decididas pela matriz** — `criar`, `editar`,
`apagar`, `vender_unidade`, `tipologias_editar`, `resetar_status_unidade`, `ativar_nicole` —
substituindo as constantes `IMOVEIS_EDIT_ROLES`/`IMOVEIS_CREATE_ROLES` (12 gates em 2 camadas)
e 2 checagens inline.

## 🔴 Capability NOVA no caminho: `imoveis.tipologias_editar` (mig 226)

Espelho estrito encontrou uma assimetria REAL: editar/excluir tipologia é `[admin, supervisor]`
inline, mas CRIAR tipologia é `IMOVEIS_EDIT_ROLES` (4 roles). Nenhuma capability existente
espelha o PATCH sem mudar comportamento → nasceu `imoveis.tipologias_editar` [A,S] (o DELETE
mapeia em `imoveis.apagar`, semanticamente correto). **Mig 226 = re-execução completa e
idempotente do gerador** (ON CONFLICT DO NOTHING; só as 10 linhas novas entram) — o caminho
de evolução previsto na F1. ⚠️ Ordem de deploy: **226 aplicada em prod ANTES do merge**
(sem o seed, o PATCH de tipologia herdaria o módulo `imoveis` e ABRIRIA p/ corretor).
Aplicada e validada 13/08 (admin+supervisor true; demais false).

## Acceptance Criteria

- [x] **AC1** — Constantes/`canEditImoveis(role)`/`canCreateImoveis(role)` substituídos:
      helpers agora são async via `can()`; 9 sites de API via `requireCapability` (+1 via flag
      pura no `isValidTransition` — a máquina de estados recebe a DECISÃO, não o role);
      5 páginas via helpers. Grep das constantes = só comentários históricos.
- [x] **AC2** — Espelho estrito ×7 congelado em teste (editar [A,S,OBR,GR]; criar/apagar/
      vender/nicole/tipologias [A,S]; resetar [A]). Zero delta de comportamento.
- [x] **AC3** — 7 capabilities enforced na matriz/exceções.
- [x] **AC4** — Mig 226 gerada pelo gerador (nunca digitada), aplicada em prod ANTES do
      merge, validada por query.
- [x] **AC5** — Gates verdes + smoke 10/10. Testes de 2 stories antigas (87-13, 75-280)
      adaptados: o mock de `requireCapability` decide pelo SEED do registro (mantém o
      espírito "a decisão não é constante mockada").
- [x] **AC6** — Limites: RLS `properties_manage` (god-gate) intocada — F4; visualização
      segue o módulo `imoveis` (inclui corretor).

## Change Log

- 2026-08-13 · @sm (River) · Draft (template F3).
- 2026-08-13 · @po (Pax) · **GO (9/10)** — exigido: a assimetria de tipologias vira capability
  própria (não alargar OBR/GR sem decisão do Marcos); ordem migration→deploy explícita. → Ready.

## File List

| arquivo | ação |
|---|---|
| `lib/permissions-imoveis.ts` | reescrito — helpers async via can(); constantes REMOVIDAS |
| 7 rotas `api/properties|units|typologies/**` | 10 gates → `requireCapability`/flag pura |
| 5 páginas `dashboard/properties/**` | helpers async |
| `api/units/[id]/route.ts` | `isValidTransition(from, to, canResetStatus)` — pura de verdade agora |
| `lib/capabilities.ts` | +1 capability (tipologias_editar) · 7 enforced |
| `supabase/migrations/226_capability_imoveis_tipologias.sql` | **nova (gerada)** — aplicada em prod 13/08 |
| `scripts/gen-capability-seed.mts` | saída documentada como genérica (NNN) |
| 2 arquivos `.test.ts` (87-13 nicole-enabled, 75-280 route) | mocks decidem pelo CAPABILITY_SEED |

## Dev Agent Record

**Fable 5 · @dev (Dex) · YOLO · 13/08/2026** · Branch `feat/75-306-imoveis-capability`.

- Diff seed×gate ×7: idênticos (congelados). A assimetria de tipologias foi PRESERVADA (não
  corrigida — alinhamento OBR/GR é decisão de negócio, anotada no registro).
- `isValidTransition` ganhou de brinde: era "pura" com decisão de role embutida; agora recebe
  a decisão — testável de verdade.
- Smoke (read-only) 10/10: properties com Novo/Editar p/ admin; /new sem redirect; 7 ações
  na matriz. Gates: suíte **2337 passed** · tsc 0 · eslint base 24 · build 0.
- Mig 226 aplicada em prod ANTES do merge (inerte até o deploy) — validada: 2 roles true.

## QA Results

### 2026-08-13 · Quinn (@qa) · Round 1 — **PASS · quality score 95**

O caso mais completo do template até aqui: capability nova + migration aditiva + ordem de
deploy tratada como requisito (o widening window do PATCH de tipologia foi identificado e
fechado ANTES de existir). Adaptação dos testes antigos preservou a tese original deles
(decisão real, não constante). Sem concerns.
