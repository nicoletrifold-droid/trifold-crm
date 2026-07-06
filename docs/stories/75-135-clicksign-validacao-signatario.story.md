# Story 75-135 — Assinatura: validar nome completo + e-mail/telefone no formulário (antes da Clicksign)

## Metadata
- **Status:** Done · **Epic:** Pastas · **PR:** #132 · **Complexidade:** XS (2 pontos) · **Branch:** feat/75-135-clicksign-validacao-signatario
- **executor:** @dev · **quality_gate:** @qa

## Contexto
No modal "Enviar para assinatura" (`pasta-detail.tsx`), o gestor pode clicar em Enviar com dados que a Clicksign rejeita, recebendo um **erro técnico cru** (ex.: `400: name não está em um formato válido`) quando o nome tem só 1 palavra, ou e-mail digitado errado (`marcos@trifold.eng,br`). Precisamos validar **antes** de chamar a API, com mensagens claras em PT. Ver [[project-clicksign-integracao]].

## Escopo
**IN:**
1. **`lib/clicksign/validation.ts`** (novo + teste): `validateSignerForm({ name, email, phone, auth })` → `string | null` (mensagem de erro ou null se ok). Regras:
   - **Nome:** ≥ 2 palavras (nome e sobrenome) — a Clicksign rejeita 1 palavra.
   - **E-mail:** se preenchido, formato válido; se `auth = email`, obrigatório.
   - **Telefone:** se `auth = whatsapp|sms`, obrigatório (≥ 10 dígitos com DDD).
   - Pelo menos um contato (e-mail ou telefone).
2. **`pasta-detail.tsx` → `submitSignature`:** chamar `validateSignerForm` antes do fetch; se retornar mensagem, exibir em `signError` e **não** enviar. Enviar os campos já com `.trim()`.

**OUT:** validação server-side na rota (a Clicksign já valida; aqui é UX); máscara de telefone; auto-correção de e-mail.

## Acceptance Criteria
1. **Given** nome com 1 palavra (ex.: "Marcos"), **when** clico em Enviar, **then** aparece "Informe o nome completo (nome e sobrenome)." e **nada** é enviado à Clicksign.
2. **Given** e-mail inválido (ex.: `x@y,br`), **then** "E-mail inválido." e não envia.
3. **Given** `auth = e-mail` sem e-mail, **then** pede o e-mail; **given** `auth = WhatsApp/SMS` sem telefone válido, **then** pede telefone com DDD.
4. **Given** dados válidos (nome completo + contato coerente), **then** o envio segue normalmente (comportamento atual).
5. `validateSignerForm` com testes cobrindo cada regra. tsc/lint/vitest limpos.

## Tasks (@dev)
- [ ] `lib/clicksign/validation.ts` + `validation.test.ts`.
- [ ] `submitSignature`: validar antes do fetch, `signError`, trims.
- [ ] tsc/eslint/vitest.

## Riscos
- **Muito baixo.** Só adiciona um guard client-side + função pura testável. Não altera a rota nem a integração.

## Dev Agent Record (@dev — 2026-07-06)
- **`lib/clicksign/validation.ts`** (+6 testes): `validateSignerForm({name,email,phone,auth})`. Nome ≥2 palavras; e-mail com regex estrito; e-mail obrigatório se auth=email; telefone ≥10 dígitos se auth=whatsapp/sms; ao menos um contato.
- **`pasta-detail.tsx` → `submitSignature`:** valida antes do fetch → `signError` + return; envia campos com `.trim()`.
- **QA loop pegou bug real:** 1º regex (`[^\s@]+@[^\s@]+\.[^\s@]+`) aceitava `trifold.eng,br` (vírgula) — trocado por `/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/`.
- **Checks:** tsc 0 · eslint 0 · vitest 780/780 (+6).
- **Files:** `lib/clicksign/validation.ts` (+test); `[id]/_components/pasta-detail.tsx`.

## QA Results (@qa — 2026-07-06)
- **PASS.** AC1 (nome 1 palavra bloqueado) ✓ · AC2 (e-mail inválido/vírgula bloqueado — regressão coberta) ✓ · AC3 (e-mail obrigatório auth=email; telefone com DDD auth=whatsapp/sms) ✓ · AC4 (dados válidos seguem) ✓ · AC5 (6 testes; tsc/eslint/780) ✓. Guard client-side puro; rota/integração inalteradas.

## Change Log
- 2026-07-06 — @devops — Branch + commit + push + **PR #132** + merge. Status → Done.
- 2026-07-06 — @qa — **QA GATE: PASS** (loop pegou regex frouxo → corrigido). 5 ACs, 780/780.
- 2026-07-06 — @dev — Implementado (validação do signatário). Status → InReview.
- 2026-07-06 — @po — **GO (10/10)**. Status Draft → Ready → InProgress.
- 2026-07-06 — @sm — Story criada (Draft).
