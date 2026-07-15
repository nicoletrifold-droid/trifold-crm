# Story — CRECI jurídico no cadastro de imobiliárias

**Status:** Done
**Epic:** IMOB / Cadastro de imobiliárias ([[project-modulo-imob]], [[project-pastas-documentos]])
**Complexidade:** S (migration aditiva + form + whitelist + tipo; 1 coluna nova)

## Contexto
Pedido do diretor: incluir o campo **CRECI jurídico** (o CRECI da imobiliária / pessoa jurídica) no
cadastro de imobiliárias — "tanto pelo link quanto pelo uso interno".

**Esclarecimento (confirmado no código):** NÃO existe um formulário público de auto-cadastro de
imobiliária. O cadastro é sempre pelo **mesmo formulário compartilhado** `ImobiliariaFormModal`, usado
em: (1) tela interna do IMOB, (2) lista dentro de Pastas, (3) **"+ Cadastrar nova imobiliária" nos
fluxos "Nova pasta"/"Gerar link"**. Os "links" públicos (`pasta_links`, `/pasta/nova/[token]`) criam
**pastas** (dossiê do comprador), com a imobiliária travada — não cadastram imobiliária. Logo, editar o
formulário compartilhado **cobre os dois casos citados** (uso interno + cadastro no fluxo do link).

## Acceptance Criteria
1. **AC1** — O formulário de imobiliária (todas as 3 entradas) tem um campo **CRECI jurídico** (texto
   livre, opcional), logo após o CNPJ.
2. **AC2** — O valor é persistido em `imobiliarias.creci_juridico` na criação (POST) e na edição
   (PATCH).
3. **AC3** — A edição pré-preenche o campo com o valor salvo.
4. **AC4** — O CRECI jurídico aparece na listagem de imobiliárias (abaixo do CNPJ).
5. **AC5** — Migration **aditiva** (coluna nullable, `IF NOT EXISTS`) — sem impacto em dados/telas
   existentes.

## Tasks
- [x] Migration `173_imobiliarias_creci_juridico.sql` (`ADD COLUMN IF NOT EXISTS creci_juridico text`) —
      **aplicada em prod** via Management API (coluna confirmada).
- [x] `lib/imob/imobiliarias.ts`: `creci_juridico` na interface `Imobiliaria` + no whitelist
      `IMOBILIARIA_TEXT_FIELDS` (senão a API descarta o campo).
- [x] `imobiliaria-form-modal.tsx`: `creci_juridico` em `FormState`/`EMPTY`/`toForm` + input após CNPJ.
- [x] `imobiliarias-manager.tsx`: exibe "CRECI {valor}" na linha (abaixo do CNPJ).
- [x] Verificação: tsc 0, eslint 0, build OK, `npm test` 975 pass.

## Dev Notes
- Endpoints POST/PATCH (`/api/imob/imobiliarias`) não precisaram mudar: persistem o que
  `validateImobiliaria` retorna (basta o campo estar no whitelist).
- List pages usam `select("*")` → o campo já flui sem editar query.
- Numeração: 173 estava livre (172 era o maior). Gotcha conhecido de números duplicados (164/170) —
  173 conferido livre.

## Out of Scope
- Formulário público de auto-cadastro de imobiliária — não existe (esclarecido acima).
- CRECI "físico" individual — o pedido é o jurídico (da imobiliária); CRECI de corretor vive em outra
  tabela (`brokers`), fora do escopo.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 1.0 | Campo CRECI jurídico no cadastro de imobiliárias (form compartilhado cobre interno + fluxo do link). Migration 173 aplicada em prod. tsc/eslint/build OK, 975 testes. Done. | @dev+@qa |
| 2026-07-15 | 1.1 | Push por @devops. PR #204 squash-merged em `main` (`d3d7e9f8`). Deploy Vercel disparado (coluna 173 já em prod → entra funcionando). | @devops (Gage) |

## Dev Agent Record
### File List
- `supabase/migrations/173_imobiliarias_creci_juridico.sql` (novo — aplicada em prod)
- `packages/web/src/lib/imob/imobiliarias.ts`
- `packages/web/src/app/dashboard/imob/imobiliarias/_components/imobiliaria-form-modal.tsx`
- `packages/web/src/app/dashboard/imob/imobiliarias/_components/imobiliarias-manager.tsx`
- `docs/stories/imob-creci-juridico.story.md` (novo)

## QA Results
### Review Date: 2026-07-15 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | Campo no form compartilhado (cobre as 3 entradas); whitelist atualizado (persiste); tipo atualizado; exibido na lista. |
| Unit tests | PASS | 975 tests, sem regressão. |
| Acceptance criteria | PASS | AC1-AC5. |
| No regressions | PASS | Migration aditiva/nullable; endpoints e queries `select(*)` inalterados. |
| Security | PASS | Endpoints IMOB já gateados; campo é texto sanitizado pelo whitelist. |
| Documentation | PASS | Story + gate. |

Migration: 173 aplicada em prod (coluna `creci_juridico text` confirmada). Build: tsc 0 · eslint 0 · next build OK · npm test 975 pass.
Gate: PASS → docs/qa/gates/imob-creci-juridico.yml
— Quinn 🛡️
