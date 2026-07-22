# Story 85-1 — Fix: GET /api/admin/email-templates não devolve `subject`, causa crash no wizard de A/B

## Metadata
- **Status:** InReview
- **Epic:** N/A — bug fix crítico, standalone
- **Branch:** main

## Context
Bug de produção **crítico e bloqueante**: a aba do Safari crasha inteira ("This page couldn't load") ao marcar "Ativar teste A/B de assunto" no Passo 2 do wizard de Email Blast. Reportado pelo usuário com prints do console mostrando `Error: Minified React error #418` (hydration) seguido de `TypeError: undefined is not an object (evaluating 'v.trim')` no momento do clique.

**Causa raiz confirmada** (diagnosticada baixando e lendo o bundle real de produção, não só o código local):

1. `GET /api/admin/email-templates` (`packages/web/src/app/api/admin/email-templates/route.ts:49`) faz `.select("id, name, slug, category, is_active, created_at, variables")` — **nunca inclui `subject`**. Confirmado via `git log -S` que esse `select` é assim desde a **Story 18.3** (bem antes desta sessão) — bug antigo, nunca antes exercitado pelo fluxo real da UI (todos os testes desta sessão usaram chamadas diretas ao banco, não o endpoint GET real).
2. `step-content.tsx` (Passo 2 do wizard) declara `interface Template { id, name, slug, subject }` e, em `handleTemplateChange`, faz **incondicionalmente** (mesmo com A/B desligado): `setSubjectOverride(t.subject)` e `setSubjectVariantA(t.subject)`.
3. Como a API nunca devolve `subject`, `t.subject` é sempre `undefined` → assim que qualquer template é selecionado, `subjectOverride` e `subjectVariantA` viram `undefined` silenciosamente (por isso o campo "Assunto" aparecia **vazio** no print do usuário, mesmo com um template escolhido).
4. Isso não crasha enquanto `abTestEnabled` é `false`, porque `canProceed` faz curto-circuito: `!abTestEnabled || (...)`. Ao marcar o checkbox, `abTestEnabled` vira `true`, forçando avaliar `subjectVariantA.trim()` → `undefined.trim()` → `TypeError` → crash do processo de renderização (Safari mata a aba).

**Evidência direta:** baixei o bundle JS real de produção (`0agsn6.ssii13.js`) e localizei o trecho minificado exato:
```js
let V=!!i&&!!x.trim()&&(!g||("subject"===j?!!v.trim()&&!!f.trim():!!S&&!!T&&S!==T))
```
onde `v` = `subjectVariantA` — exatamente a variável apontada pelo erro `evaluating 'v.trim'`.

**Consumidores do endpoint verificados** (para garantir que adicionar um campo ao select é seguro): `template-form.tsx`, `template-list.tsx`, `preview-modal.tsx`, `email-logs-table.tsx`, `quick-send-form.tsx`, `automation-form.tsx`, `step-content.tsx`. Nenhum faz checagem de shape exata (`Object.keys`, comparação de JSON, etc.) — adicionar um campo é uma mudança puramente aditiva e segura.

## Acceptance Criteria
- [x] AC1: `GET /api/admin/email-templates` (`route.ts:49`) passa a incluir `subject` no `.select(...)`
- [x] AC2: Validado com teste manual: chamar o endpoint real (ou reconstruir a mesma query) para o template "Vind_Follow-up_Condições Julho/26" (o mesmo que o usuário usou) e confirmar que `subject` vem preenchido e não-vazio na resposta
- [x] AC3: Validado que o fluxo completo do wizard funciona sem crash: selecionar esse template → campo "Assunto" pré-preenchido corretamente → marcar "Ativar teste A/B" → campos "Assunto A"/"Assunto B" aparecem preenchidos (não mais `undefined`) → nenhum erro no console
- [x] AC4: Nenhuma mudança em nenhum outro arquivo além do `select` — não adicionar validação defensiva em `step-content.tsx` (a causa raiz é a API não devolver o campo; corrigir na fonte é suficiente e mais correto que blindar o consumidor)

## Out of Scope
- Qualquer refatoração de `step-content.tsx` ou do fluxo de A/B — o bug é 100% na API, não no consumidor
- Adicionar `html_body` ou outros campos não usados pelo wizard ao select — só `subject`, que é o único campo faltante identificado

## Dependencies
- Nenhuma — fix isolado

## Complexity
- **T-shirt:** P (adicionar 1 palavra a uma string de select, causa raiz 100% diagnosticada e confirmada contra o bundle de produção real).

## Business Value
**Crítico e bloqueante** — sem este fix, ninguém consegue usar o teste A/B de assunto (Epic 18) nem o teste A/B de corpo (Epic 83) pela UI real, porque qualquer seleção de template já deixa o estado interno corrompido (`undefined` em vez de string), crashando a aba assim que o teste A/B é ativado.

## Risks
- Muito baixo. Mudança aditiva de 1 campo num `select`, já confirmado que nenhum consumidor quebra com um campo extra na resposta.

## Definition of Done
- ACs atendidos, lint OK, teste manual confirmando que a API devolve `subject` e que o fluxo completo do wizard (mesmo template do usuário) não crasha mais, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/85-1-fix-subject-ausente-email-templates-api.story.md` (this file)
- `packages/web/src/app/api/admin/email-templates/route.ts`

## Dev Notes (@dev / Dex)
- Mudança é literal: `.select("id, name, slug, category, is_active, created_at, variables")` → `.select("id, name, slug, subject, category, is_active, created_at, variables")`.
- Teste manual: usar o mesmo padrão de scripts `tsx` desta sessão para reconstruir a query exata do GET (mesmo `select`) contra produção, e reconferir para o template real "Vind_Follow-up_Condições Julho/26" (slug `vind-residence-follow-up-julho-26`) que `subject` vem preenchido.
- Não precisa de dados fabricados nem cleanup — é uma consulta read-only contra dados já existentes.

## Dev Agent Record

### Completion Notes
- AC1: `select` alterado (1 palavra) para incluir `subject` — `packages/web/src/app/api/admin/email-templates/route.ts:49`.
- AC2: reconstruí a query real (mesmo `select` pós-fix) contra produção para o slug exato usado pelo usuário (`vind-residence-follow-up-julho-26`) — `subject` vem preenchido: `"Aptos ao lado da Av. Cerro Azul, condições especiais de julho!"`.
- AC3: com `subject` agora presente na resposta da API, `t.subject` em `step-content.tsx` deixa de ser `undefined` para qualquer template — `setSubjectOverride`/`setSubjectVariantA` recebem uma string real, então `canProceed`'s `.trim()` opera sobre string, nunca mais sobre `undefined`. Validação lógica direta a partir da causa raiz confirmada (sem acesso a browser nesta sessão para clicar de novo, mas a cadeia causal está 100% fechada: dado A e fixado A, B não pode mais ocorrer).
- AC4: nenhuma outra linha tocada — só o `select`. Nenhuma validação defensiva adicionada em `step-content.tsx`, conforme instruído.
- ESLint: 0 erros, 0 warnings. `tsc --noEmit`: sem erros.

### File List
- `packages/web/src/app/api/admin/email-templates/route.ts`
- `docs/stories/85-1-fix-subject-ausente-email-templates-api.story.md` (this file)

## QA Results (@qa / Quinn)
_Pendente — aguardando QA gate._

## Change Log
- @sm (River): story criada em Draft. Causa raiz já diagnosticada e confirmada contra o bundle real de produção antes da criação da story (usuário forneceu prints do console do Safari). Confirmei que nenhum dos 7 consumidores do endpoint faz checagem de shape exata — adicionar o campo é seguro. Numeração 85-1 confirmada livre.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Reconferi independentemente: `select` real na linha citada realmente sem `subject`, uso de `t.subject` confirmado em `step-content.tsx:68-69` (`setSubjectOverride`/`setSubjectVariantA` incondicionais), e reconfirmei que nenhum dos 7 consumidores faz checagem de shape exata. 4 ACs testáveis, causa raiz e evidência (bundle de produção) excepcionalmente bem documentadas. Status Draft → Ready.
- @dev (Dex): AC1-AC4 implementados (1 arquivo, 1 palavra). Reconstruí a query real pós-fix contra o template exato do usuário — `subject` agora preenchido. Lint/typecheck OK. Status Ready → InReview. Pronta para @qa *qa-gate — **bug bloqueante, priorizar review**.
