# Story — Campo "Observação" no cadastro de lead do corretor

**Status:** Done
**Epic:** Leads / Cadastro
**Relacionado:** [[project-lead-enriquecimento]] (coluna `leads.observacao`, mig 154), form do admin `dashboard/leads/new`
**Complexidade:** XS (2 arquivos: modal do corretor + endpoint `/api/leads`; sem migration)

## Contexto
O form de cadastro de lead do **admin** (`/dashboard/leads/new`) tem o campo **"Observação"** (anotações
livres: perfil, contexto, o que foi conversado), gravado em `leads.observacao` (mig 154). O modal
**"Cadastrar Lead" do corretor** (`/broker/leads` → `NewLeadModal`) **não tinha** esse campo. Pedido do
diretor: dar o mesmo campo ao corretor.

Detalhe: o modal do corretor já tinha um input "Campanha / Observação" — mas ele mapeia para
`utm_campaign` (não é o `observacao`). Mantido; adicionado o `observacao` real como textarea separado
(igual ao admin, que tem os dois).

## Causa da ausência
Admin e corretor usam caminhos diferentes: admin via server action `createLead` (grava `observacao`
direto); corretor via `POST /api/leads`, cujo insert **não** incluía `observacao`. A coluna já existe.

## Acceptance Criteria
1. **AC1** — O modal "Cadastrar Lead" do corretor (`/broker/leads`) tem um campo **Observação**
   (textarea, placeholder igual ao admin).
2. **AC2** — Ao cadastrar, o texto é salvo em `leads.observacao` e aparece na edição do lead
   (`lead-edit-form` já lê/exibe `observacao`).
3. **AC3** — Campo opcional; vazio grava `null`. Demais campos do modal inalterados.
4. **AC4** — Sem migration (coluna `leads.observacao` já existe — mig 154).

## Tasks
- [x] `broker/_components/new-lead-modal.tsx`: `observacao` no state/reset + textarea + no POST body.
- [x] `api/leads/route.ts`: `observacao: body.observacao?.trim() || null` no insert.
- [x] Verificação: tsc 0, eslint 0, build OK, `npm test` 975 pass.

## Out of Scope
- Renomear/alterar o campo "Campanha / Observação" (utm_campaign) — mantido como está.
- Demais campos de enriquecimento (finalidade/orçamento/prazo/forma_pagamento) no modal do corretor.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-15 | 1.0 | Add campo Observação no modal de cadastro de lead do corretor + persistência em `/api/leads`. tsc/eslint/build OK, 975 testes. Done. | @dev+@qa |

## Dev Agent Record
### File List
- `packages/web/src/app/broker/_components/new-lead-modal.tsx`
- `packages/web/src/app/api/leads/route.ts`
- `docs/stories/broker-cadastro-lead-observacao.story.md` (novo)

## QA Results
### Review Date: 2026-07-15 — Reviewed By: Quinn
| Check | Veredito | Evidência |
|-------|----------|-----------|
| Code review | PASS | Textarea bound a `form.observacao`; enviado no POST; endpoint persiste em `leads.observacao`. Padrão do admin. |
| Unit tests | PASS | 89 files / 975 tests, sem regressão. |
| Acceptance criteria | PASS | AC1-AC4. |
| No regressions | PASS | Aditivo (novo campo opcional + 1 chave no insert); demais campos intactos. |
| Security | PASS | `/api/leads` já autoriza broker; sem mudança de escopo. |
| Documentation | PASS | Story + gate. |

Build: tsc 0 · eslint 0 · next build OK · npm test 975 pass.
Gate: PASS → docs/qa/gates/broker-cadastro-lead-observacao.yml
— Quinn 🛡️
