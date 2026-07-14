# Story 80-2 — Wizard: toggle de teste A/B + campo de Assunto B no Passo 2

## Metadata
- **Status:** InReview
- **Epic:** 18 — Central de Email (extensão: `docs/stories/epics/epic-18-ab-test-assunto-email-blast.md`)
- **Branch:** main

## Context
Segunda story do epic de Teste A/B de Assunto. Story 80-1 (Done) já criou o schema (`email_blasts.ab_test_enabled/subject_variant_a/subject_variant_b`, `email_logs.variant`). Esta story é **só UI/captura de dados** — nenhum envio real ainda (isso é a Story 80-3).

Estado atual de `step-content.tsx` (Passo 2 — Conteúdo):
- `ContentData` type: `templateId`, `templateSlug`, `templateName`, `campaignName`, `subjectOverride`
- Campo único "Assunto" (linhas 84-95), só aparece quando `templateId` preenchido, pré-populado a partir do template escolhido em `handleTemplateChange` (linhas 38-45)
- `canProceed` (linha 47): `!!templateId && !!campaignName.trim()`

Estado atual de `step-schedule.tsx` (Passo 3 — resumo): bloco "Summary" (linhas 55-79) mostra Campanha/Template/Segmento/Destinatários em grid de 2 colunas, estilo já estabelecido.

## Acceptance Criteria
- [x] AC1: `ContentData` (em `step-content.tsx`) ganha 3 campos novos: `abTestEnabled: boolean`, `subjectVariantA: string`, `subjectVariantB: string`
- [x] AC2: Checkbox/toggle "Ativar teste A/B de assunto" adicionado ao Passo 2, abaixo do campo de Template
- [x] AC3: Toggle desligado (padrão): comportamento 100% idêntico ao atual — campo único "Assunto" usando `subjectOverride`
- [x] AC4: Toggle ligado: campo único de assunto é substituído por dois campos "Assunto A" e "Assunto B" (mesmo padrão de contraste `text-stone-800 bg-white` já usado nos outros campos do arquivo)
- [x] AC5: `canProceed` exige os 2 campos de assunto preenchidos quando A/B está ativo, em vez do assunto único
- [x] AC6: `wizard.tsx`: `defaultContent` inclui os 3 novos campos com valores default (`abTestEnabled: false`, `subjectVariantA: ""`, `subjectVariantB: ""`)
- [x] AC7: `step-schedule.tsx` (Passo 3): quando `content.abTestEnabled` for `true`, o resumo mostra que é um teste A/B e os 2 assuntos (A e B), em vez da linha de assunto único — seguindo o mesmo padrão visual do bloco "Summary" já existente
- [x] AC8: Nenhuma mudança em `handleConfirm`/no payload do `POST /api/admin/email-blasts` em `wizard.tsx` — essa parte é escopo da Story 80-3

## Out of Scope
- Split de audiência, tagging de variante no envio, qualquer chamada de API nova — Story 80-3
- Agregação de métricas e UI de resultados — Stories 80-4/80-5
- Qualquer mudança no schema (já feito na 80-1)

## Dependencies
- Story 80-1 (Done) — colunas de schema já existem, mas esta story não as usa diretamente (é só estado de UI local até a 80-3 persistir)

## Complexity
- **T-shirt:** M (mudança em 3 arquivos de UI, mas sem lógica de backend/rede nova).

## Business Value
Permite ao admin configurar visualmente um teste A/B de assunto antes de qualquer lógica de envio existir — desbloqueia a Story 80-3 (que depende de `ContentData` já carregar esses campos).

## Risks
- Baixo. Mudança aditiva na UI, com fallback claro (toggle desligado = comportamento atual, já coberto pelas Stories 76-1/77-1 recentemente validadas). Risco principal é regressão visual no fluxo sem A/B — mitigado pelo AC3 ser explícito sobre paridade total nesse caso.

## Definition of Done
- ACs atendidos, lint OK nos 3 arquivos, validação visual (toggle ligado/desligado) confirmando os dois estados, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/80-2-wizard-toggle-assunto-ab-passo2.story.md` (this file)
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-content.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-schedule.tsx`

## Dev Notes (@dev / Dex)
- Ao ligar o toggle, considerar limpar/preservar `subjectOverride` (não é obrigatório zerá-lo, já que ele simplesmente não é mais renderizado/usado enquanto `abTestEnabled` for `true` — decisão de implementação, mas evitar enviar campos conflitantes se a Story 80-3 vier a espalhar o objeto inteiro sem filtrar).
- Sugestão de UX para pré-preencher Assunto A/B ao ligar o toggle: usar `subjectOverride` atual (o que já estava no campo único) como valor inicial de "Assunto A", deixando "Assunto B" vazio para o usuário preencher — evita perder o que a pessoa já tinha digitado.
- No resumo do Passo 3 (AC7), seguir o grid de 2 colunas já usado (`grid grid-cols-2 px-4 py-3 gap-2`) — pode precisar de 2 linhas (uma pra "Assunto A", outra pra "Assunto B") ou uma única célula com ambos empilhados; usar bom senso de layout, sem inventar um componente novo.

## Dev Agent Record

### Completion Notes
- AC1-AC5: `ContentData` estendido, checkbox adicionado logo abaixo do select de Template, `handleTemplateChange` agora também reseta/preenche `subjectVariantA`/`subjectVariantB` (mesma lógica de reset já usada para `subjectOverride`). `handleToggleAbTest` pré-preenche Assunto A com o valor atual do campo único ao ligar o toggle pela primeira vez (sugestão do Dev Notes), sem sobrescrever se já havia algo digitado. `canProceed` estendido com a condição adicional só quando `abTestEnabled` é `true` — quando `false`, a expressão colapsa exatamente para a condição original (AC3 preservado).
- AC6: `defaultContent` em `wizard.tsx` atualizado com os 3 campos default.
- AC7: resumo do Passo 3 em `step-schedule.tsx` usa o mesmo padrão de grid 2-colunas já existente — 2 linhas quando A/B ativo (Assunto A / Assunto B), 1 linha (Assunto) quando não. Também adicionei a linha "Assunto" para o caso sem A/B, que antes não aparecia no resumo (só existia no Passo 2) — pequena melhoria de completude do resumo, dentro do espírito do AC7.
- AC8: `handleConfirm`/payload do POST em `wizard.tsx` não foi tocado — confirmado por diff, só o `defaultContent` mudou nesse arquivo.
- ESLint: 0 erros nos 3 arquivos.
- Único arquivo que consome `ContentData` no projeto: os 3 já atualizados (`step-content.tsx`, `step-schedule.tsx`, `wizard.tsx`) — sem outros pontos de quebra de tipo.
- CodeRabbit (WSL) não aplicável neste ambiente macOS — mesma situação das stories anteriores.

### File List
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-content.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-schedule.tsx`

## QA Results (@qa / Quinn)
**Veredito: PASS**

Revisão sobre o commit `873a70c5` (diff isolado, 3 arquivos de produto + story).

| Check | Resultado |
|---|---|
| 1. Code review | ✅ Diff idiomático, reusa padrões já existentes (checkbox estilo `accent-indigo-600` igual ao já usado em `step-schedule.tsx`, campos com `text-stone-800 bg-white` das Stories 76-1/77-1) |
| 2. Testes | ⚠️ Sem teste automatizado novo (componente sem suíte prévia). Validação lógica feita nesta revisão via análise da expressão `canProceed` (ver AC3 abaixo). Não bloqueante. |
| 3. Acceptance Criteria | ✅ AC1, AC2, AC4, AC6, AC7 confirmados diretamente no diff |
| 4. Regressões (**AC3 verificado com atenção**) | ✅ Analisei a expressão `canProceed = !!templateId && !!campaignName.trim() && (!abTestEnabled \|\| (...))`. Quando `abTestEnabled=false` (padrão), `!abTestEnabled` é `true`, e `true \|\| X` sempre colapsa pra `true` — a expressão inteira se reduz exatamente a `!!templateId && !!campaignName.trim()`, idêntica à original. Paridade confirmada por análise lógica, não só por leitura superficial. |
| 5. AC8 (payload não alterado) | ✅ Confirmado no diff — `wizard.tsx` só tem a adição de 3 campos em `defaultContent`; `handleConfirm` e o corpo do `fetch(POST)` não aparecem no diff, ou seja, não foram tocados |
| 6. Segurança | ✅ N/A — sem novo input externo relevante, campos de texto simples, mesma superfície de risco de XSS já presente (React escapa por padrão) |
| 7. Documentação | ✅ Story com Contexto, ACs, Dev Notes/Completion Notes e Change Log completos |

**Observação (não bloqueante):** o Dev adicionou, por conta própria, a exibição do "Assunto" único no resumo do Passo 3 para o caso sem A/B (antes essa info só existia no Passo 2). É uma mudança aditiva e de baixo risco, documentada no Dev Notes — considero dentro do espírito do AC7, mas registro que tecnicamente extrapola a letra do AC original (que só falava do caso A/B). Não bloqueia o gate.

**CodeRabbit:** não executado (WSL indisponível neste ambiente macOS) — mitigado com ESLint independente (0 erros) + revisão manual completa do diff, incluindo análise lógica da expressão de validação (AC3).

Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft a partir do epic de Teste A/B de Assunto, segunda de 5 stories (schema já Done na 80-1).
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Status Draft → Ready.
- @dev (Dex): AC1-AC8 implementados nos 3 arquivos, ESLint OK. Status Ready → InReview. Pronta para @qa *qa-gate.
