# Story 75-215 — Leadgen Meta: dedup por phone_normalized, telefone-lixo e roleta na recuperação tardia

**Status:** Done
**Tipo:** Bug fix (follow-up da 75-214)
**Epic:** Integrações — Meta Ads
**Complexidade:** S

## Contexto
A visibilidade de erros criada na 75-214 expôs por que os 12 leads se perdiam: o retry falhou
com erros **pré-existentes** do webhook original (antes engolidos em silêncio):
1. **10× `duplicate key ... idx_leads_org_phone_normalized_unique`** — o dedup buscava por
   `phone` cru, mas o unique vive em `phone_normalized` (trigger). O telefone do Meta
   (`+5544...`) quase nunca bate com o formato armazenado → o "lead novo" colidia no índice.
   Ou seja: essas 10 pessoas JÁ ERAM leads (entraram depois por outro canal).
2. **2× `value too long for varchar(50)/varchar(20)`** — telefone-lixo (texto livre no campo
   do form) estourava `leads.phone`/`phone_normalized`.

Decisão Marcos (24/07): recuperação tardia deve **distribuir via roleta** normalmente
("para não beneficiar ninguém") — só não dispara automations.

## Acceptance Criteria
1. **AC1** — Dedup por `phone_normalized` (via `normalizePhoneBR` do `@trifold/shared`, mesma
   régua do trigger); `maybeSingle` no lugar de `single`.
2. **AC2** — Insert que colide no unique (23505) faz fallback: acha o lead dono do telefone e
   cai no caminho de update (corrida entre eventos também coberta).
3. **AC3** — Telefone inválido/normalizado >20 chars → `phone=null` no insert (valor cru
   preservado em `metadata.field_data`); `phone` cru clampado a 50.
4. **AC4** — `ProcessMetaLeadOptions` divide `sideEffects` em `automations` e `distribute`;
   recuperação tardia = `{ automations: false, distribute: true }` (roleta real: teto,
   round-robin, empreendimento, notificação ao corretor).

## Tasks
- [x] `lib/meta/process-lead.ts`: normalizePhoneBR + dedup por phone_normalized + fallback 23505 + clamp.
- [x] Cron `meta-leads-retry`: nova política (`automations:false, distribute:true` p/ ≥6h).
- [x] Testes: 2 novos (telefone-lixo, fallback 23505) + 3 atualizados. Suíte 1206 pass, tsc/eslint/build OK.

## Dev Agent Record
### File List
- `packages/web/src/lib/meta/process-lead.ts`
- `packages/web/src/lib/meta/process-lead.test.ts`
- `packages/web/src/app/api/cron/meta-leads-retry/route.ts`
- `packages/web/src/app/api/cron/meta-leads-retry/route.test.ts`
- `docs/stories/75-215-meta-dedup-phone-normalizado.story.md` (novo)

## QA Results
### Review Date: 2026-07-24 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| AC1 dedup normalizado | PASS | Mesma régua do trigger SQL (normalize_phone_br ≡ normalizePhoneBR); unique é (org_id, phone_normalized). |
| AC2 fallback 23505 | PASS | Teste cobre colisão → update no dono; corrida entre eventos idem. |
| AC3 telefone-lixo | PASS | Teste: texto no campo → phone null + metadata.incomplete=true; cru preservado no field_data. |
| AC4 roleta na recuperação | PASS | distribute usa `distributeLeadToNextBroker` real (guards perdido/bolsão, teto, horário, notificação). |
| No regressions | PASS | Suíte 1206 pass; caminho fresco continua automations+roleta. |

Gate: PASS
— Quinn 🛡️

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-24 | 1.0 | Fix completo + política de roleta na recuperação. QA PASS. | @dev (Dex) + @qa (Quinn) |
