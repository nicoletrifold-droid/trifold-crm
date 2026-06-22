# Story 75-10 — Unificar lookups de lead por telefone para usar phone_normalized

## Metadata
- **Status:** InReview
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
A deduplicação/matching de lead deve ser por **`leads.phone_normalized`** — coluna **GENERATED ALWAYS AS (normalize_phone_br(phone)) STORED** (migração 021), recalculada pelo banco a cada insert/update. Em prod, 1053/1060 leads têm o normalizado (os 7 nulos têm telefone inválido).

Porém vários pontos ainda buscam pelo telefone **cru** (`.eq("phone", x)`), o que pode falhar quando o formato difere. O endpoint de agendamento (`appointments/route.ts`) já adota o padrão correto (busca por `phone_normalized` com fallback ao cru). Esta story padroniza os demais.

Como é **coluna gerada**, NÃO há mudança de insert nem backfill — só os lookups. O `normalizePhoneBR` (TS) espelha o `normalize_phone_br` (SQL), garantindo match.

Fora de escopo (mantido como está): o **webhook do WhatsApp** (`webhook/whatsapp/route.ts`), que já tem lógica própria de normalização funcionando e é o intake principal — mexer ali é risco alto sem ganho.

## Acceptance Criteria
- [x] AC1: Lookups migrados para `phone_normalized = normalizePhoneBR(input)` com **fallback** ao `.eq("phone", input)` quando null (padrão de `appointments/route.ts`), em: `api/leads/route.ts` (dedup), `api/units/[id]/sale/route.ts` (comprador), `lib/roleta/distributor.ts` (mesmo telefone já tem corretor).
- [x] AC2: `normalizePhoneBR` importado de `@trifold/shared`; sem normalizador novo.
- [x] AC3: Webhook do WhatsApp inalterado.
- [x] AC4: Sem mudança de schema/insert/backfill (coluna gerada). type-check/lint OK. TS↔DB validados (3 samples em prod, match exato).
- [x] AC5: landing-page, meta-ads e telegram NÃO alterados (cada um tem tratamento próprio de telefone / identificador não-fone) → movidos para backlog para revisão cuidadosa com teste de intake.

## Out of Scope (movidos para BACKLOG — revisar com teste de intake)
- Webhook do WhatsApp (lógica própria funcionando; intake principal).
- `webhooks/landing-page` (usa normalizador próprio `normalizePhone`).
- `webhooks/meta-ads` (intake de receita — exige verificação de captação).
- `telegram/webhook` (`from` pode ser identificador do Telegram, não telefone BR).
- `cron/campaign-poll`.
- Mudança no formato de exibição do `phone` cru.

## Dependencies
- `phone_normalized` (coluna gerada) e `normalizePhoneBR` — já existem.

## Complexity
- **T-shirt:** M (6 lookups em fluxos de intake; risco médio — matching de lead).

## Business Value
Matching/dedup de lead mais confiável independente do formato digitado/recebido — menos leads duplicados, atribuição correta.

## Risks
- **Médio:** toca fluxos de intake (Meta Ads, landing, Telegram) e roleta. Mitigação: coluna gerada garante consistência; fallback ao cru preserva comportamento quando normalizado é null; webhook principal (WhatsApp) intocado. **Monitorar captação de lead pós-deploy.**

## Definition of Done
- ACs atendidos, type-check/lint OK, QA gate PASS, deploy via @devops, monitorar intake pós-deploy.

## File List
- `docs/stories/75-10-unificar-lookup-lead-phone-normalized.story.md` (this file)
- `packages/web/src/app/api/leads/route.ts`
- `packages/web/src/app/api/units/[id]/sale/route.ts`
- `packages/web/src/app/api/telegram/webhook/route.ts`
- `packages/web/src/app/api/webhooks/landing-page/route.ts`
- `packages/web/src/app/api/webhooks/meta-ads/route.ts`
- `packages/web/src/lib/roleta/distributor.ts`

## Dev Notes (@dev / Dex)
- `leads/route.ts`, `units/[id]/sale/route.ts`, `lib/roleta/distributor.ts`: lookup por telefone agora usa `phone_normalized` (via `normalizePhoneBR`) com fallback ao `.eq("phone", ...)` quando o normalizado é null. `appointments/route.ts` já estava no padrão.
- Escopo reduzido por prudência: landing-page/meta-ads/telegram/whatsapp mantidos como estão (tratamento próprio / intake de receita) → backlog.
- type-check 0 erros; eslint EXIT 0; validação TS↔DB (3 leads de prod) com match exato.

## QA Results (@qa / Quinn)
**Veredito: PASS** — 3 lookups unificados com fallback seguro; coluna `phone_normalized` é gerada (sem insert/backfill); `normalizePhoneBR` (TS) confirmado idêntico ao `normalize_phone_br` (DB) em amostra de prod. Webhooks de receita preservados. type-check/eslint OK. Pronta para @devops *push (monitorar dedup de lead pós-deploy).

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação → GO. Status Draft → Ready.
- @dev (Dex): 3 lookups migrados p/ phone_normalized + fallback; escopo reduzido (webhooks→backlog). Status Ready → InReview.
- @qa (Quinn): QA gate PASS (TS↔DB validado em prod). Pronta para @devops *push.
