# Story 83-2 — Wizard: seletor "Assunto ou Corpo" + dropdowns de Template A/B

## Metadata
- **Status:** InReview
- **Epic:** 83 — Teste A/B de Corpo no Email Blast (`docs/stories/epics/epic-83-ab-test-corpo-email-blast.md`)
- **Branch:** main

## Context
Segunda story do Epic 83. A Story 83-1 (schema) está `InReview` — não fechada formalmente ainda, mas já em produção (commit `dda097b0`, migration 183 aplicada em dev e prod: `email_blasts.ab_test_variable`, `body_variant_a_template_id`, `body_variant_a_slug`, `body_variant_b_template_id`, `body_variant_b_slug`). Esta story consome esse schema no wizard — sem tocar em backend de envio (isso é a Story 83-3).

Hoje, em `step-content.tsx`, quando "Ativar teste A/B" está marcado, o usuário só pode testar **assunto** (campos `subjectVariantA`/`subjectVariantB`, Epic 18). Esta story adiciona a opção de testar **corpo** em vez de assunto, via seleção de 2 templates já existentes — nunca as duas variáveis juntas (decisão de produto do Epic 83).

## Acceptance Criteria
- [x] AC1: Em `step-content.tsx`, quando `abTestEnabled` está marcado, aparece um seletor (radio) "O que testar?" com opções "Assunto" (selecionado por padrão) e "Corpo"
- [x] AC2: Modo "Assunto" selecionado: comportamento idêntico ao atual (Epic 18) — os campos "Assunto A"/"Assunto B" continuam aparecendo exatamente como hoje, sem nenhuma mudança visual ou de validação
- [x] AC3: Modo "Corpo" selecionado: os campos "Assunto A"/"Assunto B" desaparecem e no lugar aparecem 2 dropdowns "Template A" e "Template B", populados com os mesmos dados já buscados em `templates` (reaproveitar o `fetch("/api/admin/email-templates")` já existente no componente — não duplicar a chamada)
- [x] AC4: Modo "Corpo" exige Template A e Template B selecionados (e diferentes um do outro) antes de permitir avançar — `canProceed` estendido
- [x] AC5: `ContentData` (tipo exportado de `step-content.tsx`) ganha os campos `abTestVariable: "subject" | "body"`, `bodyVariantATemplateId: string`, `bodyVariantASlug: string`, `bodyVariantBTemplateId: string`, `bodyVariantBSlug: string`
- [x] AC6: `wizard.tsx` propaga os novos campos no `defaultContent` (valores default: `abTestVariable: "subject"`, demais strings vazias) — mesmo padrão já usado para `subjectVariantA`/`subjectVariantB`
- [x] AC7: Passo 3 (`step-schedule.tsx`, resumo de confirmação) mostra, quando `abTestEnabled && abTestVariable === "body"`, os nomes dos 2 templates selecionados como "Template A" / "Template B" (em vez do resumo de Assunto A/B, que continua para o modo "subject")
- [x] AC8: Nenhuma chamada nova a `POST /api/admin/email-blasts` nesta story — o body do request em `wizard.tsx` pode já incluir os novos campos no objeto enviado (preparação), mas a rota backend só é adaptada na Story 83-3

## Out of Scope
- Qualquer alteração em `api/admin/email-blasts/route.ts` (split, envio, uso do template por variante) — Story 83-3
- Qualquer alteração no endpoint `/stats` ou na tela de detalhe do blast — Story 83-4
- Toggle de "Ativar teste A/B" em si (já existe, Epic 18) — não recriar
- Validação de que os 2 templates escolhidos sejam de fato diferentes um do conteúdo (isso é responsabilidade de UI/UX, não de integridade de dados — cobrir apenas como validação de formulário, não como constraint de banco)

## Dependencies
- Story 83-1 (InReview, já em produção) — schema necessário já existe

## Complexity
- **T-shirt:** M (mudança de UI em 2 componentes + extensão de tipo, sem lógica de backend).

## Business Value
Permite ao usuário configurar de fato um teste A/B de corpo — sem esta story, o schema da 83-1 fica sem nenhuma forma de uso pelo usuário final.

## Risks
- Baixo-médio. Principal cuidado é não quebrar o modo "Assunto" existente (Epic 18, já em uso) ao introduzir o seletor — AC2 cobre isso explicitamente. Reaproveitar o estado `templates` já buscado evita uma segunda chamada de rede desnecessária e mantém os dois dropdowns (Template A/B) sempre em sincronia com a lista de templates ativos.

## Definition of Done
- ACs atendidos, lint OK, validação visual dos 3 estados (sem A/B, A/B de Assunto, A/B de Corpo) via prévia estática ou browser, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/83-2-wizard-seletor-corpo-template-ab.story.md` (this file)
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-content.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-schedule.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`

## Dev Notes (@dev / Dex)
- `step-content.tsx` já busca templates em `useEffect` (`fetch("/api/admin/email-templates")`, guardado em `const [templates, setTemplates] = useState<Template[]>([])`) — os 2 novos dropdowns "Template A"/"Template B" devem reaproveitar esse mesmo array, não criar um segundo fetch.
- O padrão de toggle já existente (`abTestEnabled`, checkbox) não muda — o seletor "O que testar?" só aparece **dentro** do bloco condicional que já existe quando `abTestEnabled` é true (mesmo `{templateId && abTestEnabled && (...)}` já usado hoje para os campos de assunto A/B).
- Em `wizard.tsx`, `defaultContent` (linhas ~19-28) segue o padrão: adicionar os 5 campos novos com valores vazios/`"subject"` como default, mesmo estilo de `abTestEnabled: false, subjectVariantA: "", subjectVariantB: ""` já existente.
- Em `step-schedule.tsx`, o bloco de resumo (linhas ~65-80) já faz `content.abTestEnabled ? (...assunto A/B...) : (...assunto único...)` — estender para 3 ramos: sem A/B, A/B de assunto, A/B de corpo (`content.abTestVariable === "body"`).
- Considerar impedir no formulário que Template A e Template B sejam o mesmo template (mensagem de validação simples, sem novo estado de erro complexo) — não é AC obrigatório de integridade de dados, mas evita um teste A/B sem sentido (testando o mesmo corpo contra ele mesmo).

## Dev Agent Record

### Completion Notes
- AC1-AC4: seletor "O que testar?" (radio Assunto/Corpo) adicionado em `step-content.tsx`, aparecendo só quando `abTestEnabled`. Modo Corpo troca os campos de Assunto A/B pelos dropdowns "Template A"/"Template B", reaproveitando o array `templates` já buscado (nenhum fetch novo). `canProceed` estendido para exigir os 2 templates preenchidos e diferentes entre si nesse modo; aviso inline quando A === B.
- AC5: `ContentData` ganhou `abTestVariable`, `bodyVariantATemplateId/Slug/Name` e `bodyVariantBTemplateId/Slug/Name`. Adicionei também `bodyVariantAName`/`bodyVariantBName` (além do pedido no AC) — necessário porque `step-schedule.tsx` não tem acesso ao array `templates` para resolver o nome a partir do id; mesmo padrão já usado para o template principal (`templateId`+`templateSlug`+`templateName` juntos).
- AC6: `defaultContent` em `wizard.tsx` atualizado com os 7 campos novos (`abTestVariable: "subject"` + as 6 variantes de corpo vazias).
- AC7: `step-schedule.tsx` estendido para 3 ramos mutuamente exclusivos: sem A/B (assunto único), A/B assunto (Epic 18, inalterado), A/B corpo (novo, mostra `bodyVariantAName`/`bodyVariantBName`).
- AC8: `wizard.tsx` já envia os novos campos no `POST /api/admin/email-blasts` (preparação) — a rota backend ainda ignora esses campos até a Story 83-3, sem quebrar nada (campos extras não usados pela rota atual).
- ESLint: 0 erros, 0 warnings novos nos 3 arquivos. `tsc --noEmit`: sem erros.
- **Validação visual:** prévia estática (Artifact) com os 3 estados do Passo 2 + o caso de validação (mesmo template nos dois lados) + o resumo do Passo 3 no modo Corpo.

### File List
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-content.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-schedule.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`
- `docs/stories/83-2-wizard-seletor-corpo-template-ab.story.md` (this file)

## QA Results (@qa / Quinn)

**Gate: PASS**

Revisão do diff completo (`1458a8e5`, 4 arquivos) contra os 8 ACs, com verificação independente:

- **AC1:** seletor "O que testar?" confirmado no JSX, gated por `templateId && abTestEnabled` (não depende da variável escolhida) — aparece corretamente sempre que A/B está ligado.
- **AC2 (risco de regressão, checado com atenção):** o bloco de Assunto A/B mudou de `{templateId && abTestEnabled && (...)}` para `{templateId && abTestEnabled && abTestVariable === "subject" && (...)}`. Como `abTestVariable` tem default `"subject"` (confirmado em `wizard.tsx` `defaultContent`), o comportamento visual e de fluxo é idêntico ao anterior sem nenhum clique extra necessário. `canProceed` para o ramo `subject` é textualmente a mesma expressão booleana de antes. **Sem regressão.**
- **AC3/AC4:** dropdowns "Template A"/"Template B" reaproveitam o array `templates` já buscado (nenhum novo `fetch` no diff). `canProceed` no ramo `body` exige `bodyVariantATemplateId`, `bodyVariantBTemplateId` truthy **e** diferentes entre si — testei mentalmente os 3 casos (ambos vazios, só um preenchido, os dois iguais) e todos corretamente bloqueiam o avanço. Aviso inline quando A === B confirmado no JSX.
- **AC5/AC6:** `ContentData` e `defaultContent` conferem campo a campo com a migration 183 (mesmos nomes: `body_variant_a/b_template_id`, `_slug`).
- **AC7:** confirmado nos 3 ramos mutuamente exclusivos em `step-schedule.tsx` (`abTestVariable === "subject"`, `=== "body"`, `!abTestEnabled`).
- **AC8:** `git show --stat` do commit não lista `api/admin/email-blasts/route.ts` — backend genuinamente intocado nesta story.
- **Campos extras (`bodyVariantAName`/`bodyVariantBName`), verificação independente da justificativa do dev:** confirmei que `StepSchedule` recebe apenas `content: ContentData` como prop (sem acesso a `templates`) — os campos de nome são de fato a única forma de exibir o resumo no Passo 3 sem duplicar a busca de templates. Justificativa procede, mesmo padrão já usado para `templateName` (carregado junto de `templateId`/`templateSlug`). Os campos de nome corretamente **não** são enviados ao backend no `POST` (só os ids/slugs, que têm coluna correspondente) — nenhuma sujeira de payload.
- **Lint/typecheck:** reconferidos de forma independente — 0 erros em ambos.

Nenhum CONCERNS. Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft a partir da seção 83.2 do Epic 83. Li o estado atual de `step-content.tsx`, `step-schedule.tsx` e `wizard.tsx` para garantir que os Dev Notes referenciam os padrões exatos já existentes (reaproveitar fetch de templates, mesmo estilo de defaultContent, extensão do resumo condicional em 3 ramos). Story 83-1 confirmada como dependência, ainda InReview mas já em produção.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Reconferi os Dev Notes diretamente contra o código (`step-content.tsx`, `wizard.tsx`) — referências a `templates`/`fetch` e ao `defaultContent` batem exatamente. 8 ACs testáveis, escopo bem delimitado (backend explicitamente fora, reservado para 83-3), dependência da Story 83-1 documentada com o status real (InReview, não Done, mas já em produção). Alinhamento com a seção 83.2 do epic confirmado. Status Draft → Ready.
- @dev (Dex): AC1-AC8 implementados (3 arquivos alterados). Adicionados 2 campos além do pedido (`bodyVariantAName`/`bodyVariantBName`) por necessidade real do AC7 — justificado nas Completion Notes. ESLint e typecheck OK, prévia visual dos 3 estados publicada. Status Ready → InReview. Pronta para @qa *qa-gate.
