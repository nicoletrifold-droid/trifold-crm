# Story 75-96 — IMOB: cadastro de imobiliárias — sócio, contatos do gerente e tipo de produto

## Metadata
- **Status:** Done (QA PASS) — pronto para @devops (push + PR + migration 133) · **Epic:** IMOB · **Branch:** feat/75-96-imob-cadastro-campos · **Complexidade:** M (3 pontos)
- **executor:** @dev + @data-engineer (migration) · **quality_gate:** @qa · **quality_gate_tools:** [migration em txn rollback, typecheck, lint, teste da validação]
- **Prioridade:** 🟢 Média — pedido do diretor (completar o cadastro do parceiro).

## Story
**As a** gestão, **I want** registrar o **sócio administrador/proprietário** (nome/tel/email), os **contatos do gerente** (tel/email) e **quais tipos de produto** a imobiliária trabalha, **so that** o perfil do parceiro fique completo e a gente saiba o segmento dela.

## Contexto
Estende o cadastro da Story 75-92 (tabela `imobiliarias` + `lib/imob/imobiliarias.ts` + `imobiliarias-manager.tsx`). Hoje o gerente só tem `gerente_nome`; não há sócio/proprietário nem tipo de produto.

## Escopo
**IN:**
1. **Migration 133** (ALTER TABLE `imobiliarias` ADD COLUMN):
   - `socio_nome text`, `socio_telefone text`, `socio_email text` (sócio administrador/proprietário).
   - `gerente_telefone text`, `gerente_email text`.
   - `tipos_produto text[] NOT NULL DEFAULT '{}'` com `CHECK (tipos_produto <@ ARRAY['mcmv','medio_padrao','medio_alto_padrao','alto_padrao'])` (só valores válidos).
2. **`lib/imob/imobiliarias.ts`:** `TIPOS_PRODUTO` (keys + labels) + campos novos no tipo `Imobiliaria`; `validateImobiliaria` valida os textos (socio/gerente) e `tipos_produto` (array de keys válidas, dedup, default []).
3. **Form** (`imobiliarias-manager.tsx`): bloco **"Sócio administrador / proprietário"** (nome/tel/email); tel+email no bloco do gerente; **tipo de produto** como checkboxes (múltipla escolha) com os 4 rótulos. Serializa no POST/PATCH.
4. **Lista:** mostrar os tipos de produto como badges (compacto) na linha da imobiliária.

**Tipos de produto (key → label):** `mcmv`→MCMV, `medio_padrao`→Médio Padrão, `medio_alto_padrao`→Médio Alto Padrão, `alto_padrao`→Alto Padrão.

**OUT:** não mexe no board/kanban; campos novos são opcionais (só `nome` segue obrigatório); sem DELETE.

## Acceptance Criteria
1. **Given** o form, **then** há bloco do **sócio adm/proprietário** (nome/tel/email) e **tel+email do gerente**.
2. **Given** o form, **then** há seleção **múltipla** de tipo de produto (MCMV / Médio / Médio Alto / Alto Padrão); marcar salva os selecionados.
3. **Given** salvar/editar, **then** os novos campos persistem; `tipos_produto` só aceita as 4 keys (inválido → erro 400 / barrado no CHECK).
4. **Given** a lista, **then** os tipos de produto aparecem como badges.
5. migration aplicável (txn rollback), CHECK barra valor inválido; validação testada; typecheck/lint limpos.

## Dev Notes
- `validateImobiliaria`: adicionar socio_*/gerente_* ao `IMOBILIARIA_TEXT_FIELDS`; tratar `tipos_produto` (se enviado: array; filtrar p/ só keys válidas de `TIPOS_PRODUTO`; dedup). Continuar sem deixar passar org_id/id/created_by.
- Form: `FormState` ganha os textos + `tipos_produto: string[]`; `toForm` mapeia (default []); checkbox toggler.
- Migration: `tipos_produto text[]` + CHECK `<@` (subset). Colunas texto nullable.
- Lista/badges: labels via `TIPOS_PRODUTO`.

## File List
- `supabase/migrations/133_imobiliarias_socio_gerente_produto.sql` (novo).
- `packages/web/src/lib/imob/imobiliarias.ts` — TIPOS_PRODUTO + campos + validação.
- `packages/web/src/lib/imob/imobiliarias.test.ts` — casos de tipos_produto + novos campos.
- `packages/web/src/app/dashboard/imob/imobiliarias/_components/imobiliarias-manager.tsx` — form (sócio/gerente/tipos) + badges na lista.

## PO Validation (@po Pax — 2026-07-01)
- **Verdict: GO.** Extensão direta da 75-92, escopo claro, ACs testáveis, CHECK garante integridade dos tipos, reuso do padrão existente (API/validação). Campos opcionais → sem quebrar cadastros já feitos. Status → Approved.

## Dev Agent Record (@dev Dex — 2026-07-01)
- [x] Migration `133_imobiliarias_socio_gerente_produto.sql`: +socio_nome/tel/email, gerente_telefone/email, `tipos_produto text[]` default `{}` + CHECK subset.
- [x] `lib/imob/imobiliarias.ts`: `TIPOS_PRODUTO`/`TIPO_PRODUTO_LABELS`; campos no tipo; validação de tipos_produto (array de keys válidas, dedup) + socio/gerente no whitelist.
- [x] `imobiliarias-manager.tsx`: bloco "Sócio administrador / proprietário"; tel+email do gerente; "pills" de tipo de produto (múltipla escolha, toggle); coluna "Produtos" (badges) na lista. `save()` já serializa via `{...form}`.
- [x] `imobiliarias.test.ts`: +3 casos (sócio/gerente trim, tipos válidos+dedup, tipos inválidos/não-array).
- **Checks:** `vitest` 9/9; `tsc` 0; `eslint` 0. Migration validada em txn rollback. NÃO aplicada em prod (=@devops).
- Branch `feat/75-96-imob-cadastro-campos` (a partir da main; independente da 75-95). Commit local (sem push).

## QA Results (@qa Quinn — 2026-07-01)
**Verdict: PASS.** ✅
- **Migration (txn rollback, prod):** `tipos_produto=[mcmv,alto_padrao]` ✅, sócio/gerente_email gravados ✅, **CHECK barrou tipo inválido ("luxo")** ✅. Revertido.
- **Rastreabilidade:** AC1 — form tem bloco do sócio + tel/email do gerente. AC2 — pills múltipla escolha (4 tipos). AC3 — validação (9/9) + CHECK no banco. AC4 — badges de produto na lista. AC5 — migration rollback + tsc/lint 0.
- **Observação:** campos novos opcionais (só `nome` obrigatório) → cadastros já feitos não quebram.

**Gate → PASS.** Pronto para @devops (push + PR + aplicar migration 133).

## Change Log
- 2026-07-01 — @qa (Quinn) — Gate PASS (migration txn rollback: tipos/CHECK/campos; validação 9/9; tsc/lint 0). Status → Done.
- 2026-07-01 — @dev (Dex) — migration 133 + lib (TIPOS_PRODUTO) + form (sócio/gerente/pills) + badges na lista. Sem push.
- 2026-07-01 — @po (Pax) — GO. Status Draft → Approved.
- 2026-07-01 — @sm — Story criada (Epic IMOB). Sócio adm/proprietário + contatos do gerente + tipo de produto (múltipla escolha) no cadastro de imobiliárias.
