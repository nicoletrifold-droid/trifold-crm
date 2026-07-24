# Story 75-216 — Leadgen Meta: phone NOT NULL — telefone-lixo preservado clampado

**Status:** Done
**Tipo:** Hotfix (follow-up da 75-215)
**Epic:** Integrações — Meta Ads
**Complexidade:** XS

## Contexto
A 75-215 tratava telefone-lixo como `phone=null`, mas `leads.phone` é **NOT NULL** (sem
precedente de vazio na base) — os 2 últimos eventos pendentes falharam com
`null value in column "phone"`. Política corrigida: preservar o que a pessoa digitou.

## Acceptance Criteria / Decisões
1. Telefone utilizável (normaliza e cabe em varchar(20)) → cru clampado a 50 (como sempre).
2. Lixo com 20+ dígitos → guarda só os 20 primeiros dígitos (trigger `normalize_phone_br`
   devolve os próprios dígitos; nunca estoura o varchar(20) do `phone_normalized`).
3. Lixo textual (menos de 10 dígitos) → texto clampado a 50 (normalizado sai NULL, coluna aceita).
4. Sem campo de telefone → `""`.
5. `metadata.incomplete` passa a significar "sem contato utilizável": telefone-lixo não conta.
6. Dedup por telefone só roda com telefone utilizável.

## Dev Agent Record
### File List
- `packages/web/src/lib/meta/process-lead.ts`
- `packages/web/src/lib/meta/process-lead.test.ts` (+1 teste; 16 no módulo)
- `docs/stories/75-216-leadgen-phone-not-null.story.md` (novo)

## QA Results
### Review Date: 2026-07-24 — Reviewed By: Quinn
Gate: PASS — 1207 testes na suíte; tsc/eslint/build limpos; invariantes de coluna
(phone ≤50, normalizado ≤20, NOT NULL) cobertos por teste e verificados contra o schema real.
— Quinn 🛡️

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-24 | 1.0 | Política de telefone-lixo compatível com NOT NULL. QA PASS. | @dev (Dex) + @qa (Quinn) |
