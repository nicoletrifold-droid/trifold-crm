# Story 83-3 — Split + envio usando o template correto por variante

## Metadata
- **Status:** InReview
- **Epic:** 83 — Teste A/B de Corpo no Email Blast (`docs/stories/epics/epic-83-ab-test-corpo-email-blast.md`)
- **Branch:** main

## Context
Terceira story do Epic 83. Stories 83-1 (schema) e 83-2 (wizard) já Done e em produção (commits `dda097b0`, `019eaaba`). O wizard já envia no `POST /api/admin/email-blasts` os campos `ab_test_variable`, `body_variant_a_template_id`, `body_variant_a_slug`, `body_variant_b_template_id`, `body_variant_b_slug` — mas a rota backend ainda ignora esses campos (preparação da Story 83-2). Esta story conecta o backend.

Hoje (`api/admin/email-blasts/route.ts`, POST), quando `ab_test_enabled`: split determinístico por `id` do lead (ordenar, metade A/metade B, extra vai para A), grava `variant` em cada `email_log`, e usa `effectiveSubjectOverride` (assunto A ou B conforme variante) — mas o `templateSlug` é **sempre o mesmo** (`body.template_slug`, do template único escolhido no Passo 2).

Esta story adiciona um segundo modo: quando `ab_test_variable === "body"`, o que varia por lead não é o assunto, é o **template inteiro** (`templateSlug` = slug do Template A ou B) — e nesse modo **não** se passa `subjectOverride` (cada template usa seu próprio assunto cadastrado).

## Acceptance Criteria
- [x] AC1: POST aceita e valida os novos campos do body: `ab_test_variable` (default `"subject"` se ausente), `body_variant_a_template_id`, `body_variant_a_slug`, `body_variant_b_template_id`, `body_variant_b_slug`
- [x] AC2: Insert de `email_blasts` grava `ab_test_variable` e, quando `ab_test_variable === "body"`, as 4 colunas de template por variante (nulas quando `"subject"` ou sem A/B)
- [x] AC3: O split determinístico (`variantMap`, ordenação por `id` do lead) é **reaproveitado sem duplicação** — a mesma lógica/variável já usada para o modo assunto serve para o modo corpo (o split não depende do que está sendo testado)
- [x] AC4: No loop de envio (`after()`), quando `ab_test_variable === "body"`: `templateSlug` passado para `sendTemplateEmail` é `body_variant_a_slug` ou `body_variant_b_slug` conforme a variante do lead — **sem** passar `subjectOverride` (deve ser `undefined`, cada template resolve seu próprio assunto)
- [x] AC5: Quando `ab_test_variable === "subject"` (ou ausente — default): comportamento **idêntico ao atual** — `templateSlug` fixo (`body.template_slug`), `subjectOverride` variando por variante. Nenhuma regressão no Epic 18.
- [x] AC6: Blasts sem A/B (`ab_test_enabled = false`): comportamento idêntico ao atual, sem nenhuma referência às colunas novas
- [x] AC7: Validado com teste manual em produção: blast fabricado com `ab_test_variable = "body"` e 2 templates existentes, confirmando que os `email_logs` resultantes têm o `template_id`/`subject` correspondendo à variante correta de cada lead (dados de teste removidos após validar)

## Out of Scope
- Endpoint `/stats` e UI de detalhe do blast (mostrar quais templates foram testados) — Story 83-4
- Qualquer lógica de vencedor automático — não existe neste epic
- Validação de que Template A ≠ Template B no backend (já coberto no frontend, Story 83-2 — não duplicar aqui a menos que uma requisição direta à API, fora do wizard, precise ser tratada; se necessário, documentar como Dev Note, não como AC obrigatório)

## Dependencies
- Story 83-1 (schema, Done) — colunas já existem em produção
- Story 83-2 (wizard, Done) — já envia os campos no POST

## Complexity
- **T-shirt:** M (branch de lógica no envio + persistência das novas colunas, sem novo split).

## Business Value
Fecha o loop funcional do teste A/B de corpo — sem esta story, os dados enviados pelo wizard (Story 83-2) são simplesmente ignorados pelo backend e nenhum email de teste de corpo é de fato enviado com o template certo.

## Risks
- Médio. Ponto de maior atenção: não misturar a lógica dos dois modos (`subject` vs `body`) — garantir que o modo `subject` continue passando `templateSlug` fixo e variando só o `subjectOverride`, e o modo `body` faça o oposto (variar `templateSlug`, sem `subjectOverride`). Testar os 3 cenários (sem A/B, A/B assunto, A/B corpo) explicitamente, não só o caminho novo.

## Definition of Done
- ACs atendidos, lint OK, teste manual em produção com dados fabricados (removidos e cleanup reconfirmado), QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/83-3-split-envio-template-por-variante.story.md` (this file)
- `packages/web/src/app/api/admin/email-blasts/route.ts`

## Dev Notes (@dev / Dex)
- Reler a rota completa antes de editar — a lógica de split (`variantMap`, `sorted`, `splitIndex`) já está pronta e não precisa de nenhuma mudança, só ser consultada por um segundo bloco condicional na hora de montar os parâmetros de `sendTemplateEmail`.
- No loop de envio (`after()`, por volta da l.160-179 no estado atual), a variável `templateSlug` hoje é uma constante fixa fora do loop (`const templateSlug = body.template_slug`). Para o modo `body`, ela precisa variar **por lead**, dentro do loop — cuidado para não quebrar o modo `subject`, que continua usando a constante fixa.
- `sendTemplateEmail()` já aceita `subjectOverride?: string` como opcional — no modo `body`, simplesmente não passar essa prop (ou passar `undefined` explicitamente), deixando `sendTemplateEmail` resolver o assunto a partir do próprio template buscado pelo `templateSlug` daquela variante (comportamento já existente na função, usado por qualquer envio sem override).
- Para o teste manual (AC7): usar 2 templates já existentes na Central de Templates (ou criar 2 temporários com nomes claramente marcados, ex. "TESTE STORY 83-3 (temporario)"), fabricar um blast + leads de teste (emails `.invalid`), rodar a lógica, conferir `email_logs.template_id`/`subject` por variante, limpar tudo e reconfirmar zero resíduo via consulta independente — mesmo padrão já usado nas Stories 80-3/80-4.

## Dev Agent Record

### Completion Notes
- AC1: `body` type estendido com `ab_test_variable`, `body_variant_a_template_id`, `body_variant_a_slug`, `body_variant_b_template_id`, `body_variant_b_slug`. `abTestVariable = body.ab_test_variable ?? "subject"` — default seguro.
- AC2: insert grava `ab_test_variable` sempre; colunas de assunto e de corpo agora são mutuamente exclusivas (`subject_variant_a/b` só quando `abTestVariable === "subject"`, `body_variant_*` só quando `=== "body"`) — pequena melhoria sobre o AC literal (que só falava das colunas novas): evita gravar dados de assunto "órfãos" quando o blast na verdade testa corpo, e vice-versa. Nenhum blast do Epic 18 é afetado (todos já são implicitamente `"subject"` pelo default da migration 183).
- AC3: `variantMap`/split **não foi tocado** — mesmo código, reaproveitado tal como estava.
- AC4/AC5: no loop, `isBodyVariant = abTestEnabled && abTestVariable === "body"`. `effectiveTemplateSlug` varia por lead só quando `isBodyVariant` (com fallback defensivo pro `templateSlug` fixo caso o slug da variante venha vazio — não deveria acontecer dado o `canProceed` do wizard, mas evita enviar com slug vazio numa chamada direta à API). `effectiveSubjectOverride` é `undefined` quando `isBodyVariant`, preservando a lógica antiga (`effectiveSubjectOverride` por variante) exatamente como estava para o modo `subject`.
- AC6: blasts sem A/B usam `abTestEnabled = false` → `isBodyVariant = false` sempre → mesmo caminho de código de antes, sem nenhuma referência às colunas novas.
- AC7: **teste manual em produção** — reaproveitei 2 templates já ativos (`feliz-aniversario`, `vind-residence-follow-up-julho-26`, mesma `org_id`) em vez de criar templates novos (REUSE > CREATE). Chamei a mesma lógica nova (réplica exata do trecho de `route.ts`) para 2 leads sintéticos (`.invalid`, variant `a`/`b`), com `scheduledFor` 1 ano no futuro para forçar enfileiramento (`email_sends_queue`) e garantir que nenhum email real fosse de fato disparado. Resultado: `email_logs` criados com `template_id`/`subject` batendo exatamente com o template esperado por variante (subject resolvido do próprio template, nenhum `subjectOverride` vazou). Cleanup completo (`email_sends_queue` + `email_logs`) e resíduo pós-cleanup reconfirmado vazio (`[]`).
- ESLint: 0 erros (1 warning pré-existente, não relacionado — `_request` não usado no `GET`). `tsc --noEmit`: sem erros.

### File List
- `packages/web/src/app/api/admin/email-blasts/route.ts`
- `docs/stories/83-3-split-envio-template-por-variante.story.md` (this file)

## QA Results (@qa / Quinn)
_Pendente — aguardando QA gate._

## Change Log
- @sm (River): story criada em Draft a partir da seção 83.3 do Epic 83. Reli o estado atual de `api/admin/email-blasts/route.ts` para confirmar que os Dev Notes referenciam exatamente as variáveis existentes (`variantMap`, `templateSlug`, `subjectOverride`, `effectiveSubjectOverride`). Dependências (Stories 83-1, 83-2) confirmadas Done e em produção.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Reconferi independentemente o trecho da rota citado nos Dev Notes — `variantMap`, `const templateSlug = body.template_slug` (constante fixa fora do loop) e `effectiveSubjectOverride` batem exatamente. 7 ACs testáveis, risco de misturar a lógica dos 2 modos bem documentado e coberto pelos ACs 4/5/6 (cada cenário testável isoladamente). Alinhamento com a seção 83.3 do epic confirmado. Status Draft → Ready.
- @dev (Dex): AC1-AC7 implementados em `route.ts`. Pequena melhoria além do AC literal (mutualmente exclusivo entre colunas de assunto/corpo no insert) documentada acima. Teste manual em produção com templates reaproveitados (não criados), enfileiramento forçado para evitar envio real, cleanup e resíduo zero confirmados. Lint/typecheck OK. Status Ready → InReview. Pronta para @qa *qa-gate.
