# Story 83-4 — Endpoint de stats devolve label da variante (template) + UI de detalhe exibe corretamente

## Metadata
- **Status:** Done
- **Epic:** 83 — Teste A/B de Corpo no Email Blast (`docs/stories/epics/epic-83-ab-test-corpo-email-blast.md`)
- **Branch:** main

## Context
Quarta e última story do Epic 83. Stories 83-1 (schema), 83-2 (wizard) e 83-3 (split/envio) já Done e em produção (commits `dda097b0`, `019eaaba`, `a7581f6d`). O teste A/B de corpo já funciona de ponta a ponta no backend — falta só a UI de resultados reconhecer e exibir esse modo.

Verifiquei o estado atual real de ambos os arquivos antes de escrever esta story (podem ter mudado desde a última leitura nesta sessão) — seguem exatamente como estavam desde a Story 80-5 (Epic 18), sem nenhuma alteração:
- `GET /api/admin/email-blasts/[id]/stats`: o `select` do blast só traz `ab_test_enabled, subject_variant_a, subject_variant_b` — não traz `ab_test_variable` nem as colunas de template por variante (schema já existe desde a Story 83-1, só não é lido ainda aqui). A agregação `aggregateVariant()`/`by_variant` já é 100% agnóstica ao que está sendo testado — **não precisa mudar**.
- `blast-detail.tsx`: título fixo "Teste A/B de assunto" e labels fixas mostrando `stats.subject_variant_a`/`stats.subject_variant_b` — precisa virar condicional por `ab_test_variable`.

## Acceptance Criteria
- [x] AC1: `select` do blast em `stats/route.ts` passa a incluir `ab_test_variable, body_variant_a_template_id, body_variant_b_template_id`
- [x] AC2: Quando `ab_test_variable === "body"`, o endpoint faz um join simples com `email_templates` (só para os 2 ids de template da variante) e inclui no payload os nomes resolvidos (ex.: `body_variant_a_name`, `body_variant_b_name`) — **sem** nenhuma mudança na agregação `aggregateVariant`/`by_variant`, que continua idêntica
- [x] AC3: Quando `ab_test_variable` é `"subject"` (ou blast sem A/B): payload idêntico ao de hoje, sem os campos de nome de template (ou com eles `null`) — nenhuma regressão
- [x] AC4: `blast-detail.tsx`: título da seção passa a ser "Teste A/B de assunto" ou "Teste A/B de corpo" conforme `ab_test_variable`
- [x] AC5: `blast-detail.tsx`: quando o modo é `"body"`, cada card de variante mostra o **nome do template** (`body_variant_a_name`/`body_variant_b_name`) em vez do texto do assunto — mesma estrutura visual lado a lado (Variante A / Variante B, enviados/abertos/cliques) já existente
- [x] AC6: **Sem nenhum indicador de "vencedor"/"líder"/badge de destaque entre as variantes** — mesma decisão de produto do Epic 18, agora estendida ao modo corpo. Não introduzir nenhuma lógica de comparação nesta story
- [x] AC7: Blasts sem A/B continuam mostrando só as estatísticas gerais, sem nenhuma seção de variante — comportamento já existente, não deve mudar

## Out of Scope
- Qualquer lógica de "vencedor automático" — não existe neste epic (nem no Epic 18)
- Mudança na agregação `aggregateVariant()` — já é agnóstica ao que está sendo testado, não precisa tocar
- Dashboard de analytics mais amplo (gráficos, comparação entre blasts) — fora de escopo, mesma linha do Epic 18

## Dependencies
- Stories 83-1, 83-2, 83-3 (todas Done) — esta é a última peça, consome o que já existe
- Story 80-5 (Epic 18, Done) — `blast-detail.tsx` já existe, esta story só estende

## Complexity
- **T-shirt:** M (join simples + branch condicional na UI, sem lógica de negócio nova).

## Business Value
Fecha o Epic 83 de ponta a ponta — sem esta story, um usuário que rodar um teste A/B de corpo não consegue ver, na tela de resultados, qual template correspondeu a qual variante (só números "cegos", sem saber o que foi testado).

## Risks
- Baixo. Mudança isolada e aditiva (novos campos no payload, novo ramo condicional na UI). Único cuidado: garantir que o modo `"subject"` e os blasts sem A/B continuem produzindo exatamente o mesmo payload/UI de hoje (AC3/AC7).

## Definition of Done
- ACs atendidos, lint OK, validação visual dos 3 estados (sem A/B, A/B assunto, A/B corpo) via prévia estática ou browser, teste manual do formato de dados (blast fabricado com `ab_test_variable="body"`, conferido campo a campo, removido depois), QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/83-4-stats-ui-detalhe-corpo-ab.story.md` (this file)
- `packages/web/src/app/api/admin/email-blasts/[id]/stats/route.ts`
- `packages/web/src/app/dashboard/sistema/email-blasts/[id]/_components/blast-detail.tsx`

## Dev Notes (@dev / Dex)
- O join com `email_templates` pode ser feito com 2 queries simples (`.select().eq("id", ...)` para cada template id) ou uma única query com `.in("id", [idA, idB])` — decisão de implementação, documentar no Dev Notes qual foi escolhida. Evitar um join SQL complexo desnecessário; o volume de dados é sempre 2 linhas.
- Reaproveitar a interface `BlastStats` já existente em `blast-detail.tsx`, só estendendo com os campos novos (`ab_test_variable`, `body_variant_a_name`, `body_variant_b_name`) — mesmo padrão já usado para os campos de assunto A/B.
- O título da seção hoje é hardcoded (`"Teste A/B de assunto"`) — trocar por uma expressão condicional simples baseada em `stats.ab_test_variable`.
- Teste manual (mesmo padrão das Stories 80-4/83-3): criar um blast fabricado com `ab_test_variable = "body"` e os 2 templates já existentes (reaproveitar, não criar novos), chamar a lógica do endpoint (ou a rota real via fetch autenticado, se viável) e conferir que o payload traz os nomes corretos. Limpar depois.

## Dev Agent Record

### Completion Notes
- AC1/AC2: `select` estendido com `ab_test_variable, body_variant_a_template_id, body_variant_b_template_id`. Join com `email_templates` via `.in("id", templateIds)` (uma query, não duas) — só executado quando `ab_test_variable === "body"`. `aggregateVariant`/`by_variant` **não foi tocado**.
- AC3: quando não é `"body"`, `bodyVariantAName`/`bodyVariantBName` ficam `null` (valor inicial, nunca sobrescrito) — payload para o modo assunto/sem A/B idêntico ao anterior, só com 2 campos `null` a mais (não quebra nenhum consumidor existente).
- AC4/AC5: título e conteúdo dos cards em `blast-detail.tsx` condicionais por `stats.ab_test_variable === "body"`. Estrutura visual idêntica entre os dois modos, só o texto muda.
- AC6: nenhum badge/indicador comparativo introduzido — inspecionei o JSX final, ambos os cards (A e B) usam markup idêntico, só trocando o texto e os números.
- AC7: caminho `!stats.by_variant` continua exatamente como estava (`by_variant` só é não-nulo quando `ab_test_enabled`, lógica do endpoint não mudou nesse ponto).
- **Teste manual em produção:** criei um blast fabricado (`ab_test_variable="body"`, reaproveitando os 2 templates já usados no teste da Story 83-3) + 2 `email_logs` (variant `a`/`b`, 1 aberto, 1 não), rodei a mesma lógica nova do endpoint via script, e o payload resultante bateu campo a campo com a interface `BlastStats` (incluindo `body_variant_a_name`/`body_variant_b_name` resolvidos corretamente: "Mensagem Aniversario IA" / "Vind_Follow-up_Condições Julho/26"). Cleanup do blast e dos logs confirmado, resíduo pós-cleanup reconfirmado vazio em ambas as tabelas.
- **Validação visual:** prévia estática com os 3 estados (sem A/B, A/B assunto, A/B corpo) usando os dados reais do teste.
- ESLint: 0 erros, 0 warnings novos. `tsc --noEmit`: sem erros.

### File List
- `packages/web/src/app/api/admin/email-blasts/[id]/stats/route.ts`
- `packages/web/src/app/dashboard/sistema/email-blasts/[id]/_components/blast-detail.tsx`
- `docs/stories/83-4-stats-ui-detalhe-corpo-ab.story.md` (this file)

## QA Results (@qa / Quinn)

**Gate: PASS**

Revisão do diff completo (`e457e995`, 3 arquivos) contra os 7 ACs, com verificação independente:

- **AC1/AC2:** `select` estendido corretamente. Confirmei que `aggregateVariant()` (linhas 77-89) é **byte-a-byte idêntica** à versão da Story 80-4 — não há nenhuma alteração na função de agregação. O join com `email_templates` usa uma única query `.in("id", templateIds)`, executada só quando `ab_test_variable === "body"`.
- **AC3 (não-regressão):** quando o modo não é `"body"`, `bodyVariantAName`/`bodyVariantBName` permanecem `null` (valor inicial nunca sobrescrito) — payload antigo mais 2 campos `null`, mudança aditiva e retrocompatível.
- **AC4/AC5:** título e conteúdo condicionais confirmados no diff, estrutura visual idêntica entre os 2 modos.
- **AC6 (verificado com atenção):** inspecionei o JSX final — os 2 cards (Variante A/B) usam markup **idêntico**, apenas alternando o texto (`Template: {nome}` vs texto do assunto) e os números da própria variante. Nenhuma comparação, ordenação condicional, badge ou destaque diferencial entre A e B.
- **AC7:** o gate `{stats.by_variant && (...)}` não está no diff — confirmado que não foi tocado, blasts sem A/B continuam mostrando só stats gerais.
- **Evidência do teste manual, reconferida de forma independente:** consultei `email_blasts` (por id e por nome `%STORY 83-4%`) e `email_logs` (`to_email LIKE '%83-4%'`) diretamente em produção — **zero resíduo confirmado** em ambas as tabelas, batendo com o relato do dev.
- **Lint/typecheck:** reconferidos de forma independente — 0 erros, 0 warnings novos.

Nenhum CONCERNS. Isso fecha o Epic 83 (4/4 stories). Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft a partir da seção 83.4 do Epic 83, última story. Reconferi o estado atual real de `stats/route.ts` e `blast-detail.tsx` antes de fixar os ACs — ambos seguem exatamente como na Story 80-5 (Epic 18), sem alterações nesta sessão. Dependências (83-1, 83-2, 83-3, 80-5) confirmadas Done.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Reconferi independentemente: `select` do blast em `stats/route.ts` realmente só traz `ab_test_enabled, subject_variant_a, subject_variant_b` (linha 18), e o título "Teste A/B de assunto" em `blast-detail.tsx` (linha 133) está de fato hardcoded — os Dev Notes descrevem o código real. 7 ACs testáveis, AC3/AC7 (não-regressão) claros e específicos. Alinhamento com a seção 83.4 do epic confirmado. Status Draft → Ready.
- @dev (Dex): AC1-AC7 implementados (2 arquivos alterados). Teste manual em produção com blast fabricado + templates reaproveitados, payload conferido campo a campo, cleanup e resíduo zero confirmados. Prévia visual dos 3 estados publicada. ESLint/typecheck OK. Status Ready → InReview. Pronta para @qa *qa-gate. **Última story do Epic 83.**
- @qa (Quinn): Gate PASS — `aggregateVariant()` confirmada idêntica, JSX das variantes confirmado sem indicador de vencedor, não-regressão do modo assunto/sem A/B verificada, zero resíduo do teste reconfirmado. Pronta para @devops *push.
- @devops (Gage): Push para origin/main (commits `b376c22f` + `5809d59a`). Rebase sem conflitos.
- @po (Pax): Story fechada. Status InReview → Done. Última story do Epic 83 — épico fechado (4/4 stories concluídas).
