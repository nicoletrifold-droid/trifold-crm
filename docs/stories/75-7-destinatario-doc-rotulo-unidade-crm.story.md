# Story 75-7 — Seletor "Destinatário": rótulo usa o número de unidade do CRM (fallback)

## Metadata
- **Status:** Done
- **Epic:** 58 — Portal do Cliente
- **Branch:** main

## Context
Na 75-6, o seletor "Destinatário" (upload de documento da obra) monta o rótulo a partir de `cliente_obras.numero_unidade` (vínculo do portal). Porém o número da unidade é, na prática, editado e mantido em **`clientes_obras_vinculos.numero_unidade`** (vínculo do CRM) — as telas de edição (`obras/[obra_id]/clientes/[user_id]` e `clientes/[id]/obras/[vinculo_id]`) gravam nessa tabela. Resultado: só os poucos clientes que têm `numero_unidade` em `cliente_obras` aparecem como "Nome — unidade X"; o restante cai pro nome.

Solução (display-only, sem mexer no modelo): ao montar `docDestinatarios` na página admin da obra, usar o número da unidade do CRM como **fallback**, casando pelo e-mail do cliente — que a página **já resolve** (o array `clientes`, vindo de `clientes_obras_vinculos`, tem `email`, `numero_unidade` e `portalUserId`).

Não altera o vínculo do documento (continua ancorado em `cliente_obras.id`) nem a RLS — é só o texto do rótulo.

## Acceptance Criteria
- [x] AC1: Em `dashboard/obras/[obra_id]/page.tsx`, o rótulo de cada item de `docDestinatarios` passa a ser "Nome — unidade X" quando houver `numero_unidade` em `cliente_obras` **OU** (fallback) em `clientes_obras_vinculos` casado pelo e-mail do cliente; caso contrário, só "Nome".
- [x] AC2: A precedência é: `cliente_obras.numero_unidade` (se já preenchido) → senão o do CRM. Os clientes que já mostravam unidade continuam mostrando.
- [x] AC3: Sem mudança no `id` do destinatário (continua `cliente_obras.id`), na API de upload, na RLS ou no vínculo do documento. Mudança restrita à construção do rótulo na página.
- [x] AC4: Sem alteração de schema. Sem regressão no seletor (clientes sem unidade em nenhuma das tabelas continuam aparecendo só pelo nome).

## Out of Scope
- Unificar `numero_unidade` numa fonte única (dívida dos "dois sistemas paralelos" CRM/portal) — backlog.
- Permitir editar `numero_unidade` de `cliente_obras` por uma tela.

## Dependencies
- Nenhuma. `clientes` (com email + numero_unidade do CRM + portalUserId) já é computado na página.

## Complexity
- **T-shirt:** XS (um mapa email→unidade e um fallback no rótulo, em 1 arquivo).

## Business Value
O seletor passa a mostrar a unidade para todos os clientes que já têm unidade cadastrada (na aba Clientes), facilitando escolher o destinatário certo do documento sem recadastro.

## Risks
- Baixo. É só rótulo. No pior caso (e-mail não casa), cai pro nome, como hoje.

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS, deploy via @devops.

## File List
- `docs/stories/75-7-destinatario-doc-rotulo-unidade-crm.story.md` (this file)
- `packages/web/src/app/dashboard/obras/[obra_id]/page.tsx` (to update)

## Dev Notes (@dev / Dex)
- `dashboard/obras/[obra_id]/page.tsx`: mapa `crmUnidadePorEmail` (a partir do array `clientes`, já resolvido de `clientes_obras_vinculos`); rótulo do `docDestinatarios` usa `row.numero_unidade ?? crmUnidadePorEmail.get(email)`. Match por e-mail (lowercase). Só rótulo; `id` continua `cliente_obras.id`.
- type-check 0 erros no arquivo; eslint EXIT 0.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC4. Simulação em prod (Yarden): rótulos com unidade vão de 2 → 3 com o fallback. O ganho imediato é pequeno porque o `numero_unidade` está vazio em ambas as tabelas para ~40/43 clientes — o fix habilita o fluxo correto (preencher unidade na aba Clientes passa a refletir no seletor). Display-only, sem regressão; type-check/eslint OK. Pronta para @devops *push.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO. Status Draft → Ready.
- @dev (Dex): fallback de unidade pelo CRM no rótulo do seletor. Status Ready → InReview.
- @qa (Quinn): QA gate PASS (simulação 2→3 em prod; gap real é dado faltante). Pronta para @devops *push.
- @devops (Gage): push em produção (commit 5e1f2d1). Status → Done.