# Story 76-1 — Corrigir contraste do campo de data/hora no wizard de Email Blast (Passo 3)

## Metadata
- **Status:** InReview
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
No wizard de criação de Email Blast (`/dashboard/sistema/email-blasts/novo`), o Passo 3 ("Agendamento e Confirmação") oferece a opção "Agendar para data específica", que revela um `<input type="datetime-local">`.

Esse input não define nenhuma cor de texto explícita (`step-schedule.tsx`), então os segmentos de data/hora ainda não preenchidos (dia/mês/ano/hora) são renderizados pelo navegador no cinza muito claro padrão — dificultando a leitura e dando a falsa impressão de que o campo já contém um valor válido (quando na verdade está vazio). Isso é o que efetivamente bloqueia o botão "Confirmar e Enviar", já que ele fica desabilitado enquanto `scheduledFor` estiver vazio (`disabled={submitting || (!sendNow && !scheduledFor)}`).

Reportado pelo usuário ao usar o wizard para agendar o disparo da campanha "Vind_Follow-up_Condições Julho/26".

## Acceptance Criteria
- [x] AC1: O `<input type="datetime-local">` do Passo 3 exibe texto com contraste adequado (cor escura, ex.: `text-stone-800`) tanto para os segmentos vazios quanto para o valor preenchido.
- [x] AC2: Um texto de apoio ("Selecione o dia e o horário do disparo.") é exibido abaixo do campo enquanto ele estiver vazio, deixando claro que o preenchimento é obrigatório para liberar o botão de confirmação.
- [x] AC3: Nenhuma mudança de comportamento funcional — a lógica de habilitar/desabilitar o botão "Confirmar e Enviar" (`disabled={submitting || (!sendNow && !scheduledFor)}`) permanece intacta.
- [x] AC4: Sem regressão visual nas outras opções do Passo 3 (radio "Enviar agora", resumo da campanha, aviso de audiência > 50 leads).

## Out of Scope
- Qualquer alteração na lógica de agendamento/distribuição de envio (`daysNeeded`, rate limiting).
- Redesenho do wizard como um todo — fix pontual de contraste.
- Substituição do `<input type="datetime-local">` nativo por um date-picker customizado.

## Dependencies
- Nenhuma. Fix isolado em um único componente client-side.

## Complexity
- **T-shirt:** XS (alteração de classes Tailwind + um parágrafo condicional).

## Business Value
Evita que o admin fique bloqueado sem entender por quê o botão de confirmação não libera ao agendar um disparo — reduz fricção e confusão no fluxo de Email Blast.

## Risks
- Nenhum risco relevante. Mudança puramente visual (cor de texto + hint), sem alteração de lógica de negócio ou schema.

## Definition of Done
- ACs atendidos, lint OK no arquivo, validação visual (screenshot/preview) confirmando contraste, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/76-1-fix-contraste-campo-data-email-blast.story.md` (this file)
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-schedule.tsx`

## Dev Notes (@dev / Dex)
- Diff revisado linha a linha contra os 4 ACs — confere exatamente: `text-stone-800` + `bg-white` explícitos no `<input type="datetime-local">` (AC1), `<p className="text-xs text-stone-400">Selecione o dia e o horário do disparo.</p>` condicional (`{!scheduledFor && ...}`) abaixo do campo (AC2). A condição `disabled={submitting || (!sendNow && !scheduledFor)}` do botão "Confirmar e Enviar" não foi tocada (AC3). Nenhum outro elemento do Passo 3 (radios, resumo, aviso >50 leads) foi alterado (AC4).
- ESLint no arquivo (`npx eslint step-schedule.tsx`): 0 erros, exit 0. `tsc --noEmit` completo do pacote crashou por stack overflow do ambiente (Node/stack de terceiros — reproduzido de forma independente da mudança, não é regressão introduzida por esta story).
- CodeRabbit self-healing (WSL) não aplicável neste ambiente (macOS, sem WSL) — gate de qualidade pré-commit coberto por ESLint direcionado no arquivo.
- Validação visual feita via Artifact comparando o próprio `<input type="datetime-local">` nativo (antes/depois), já que o Passo 3 do wizard fica atrás de autenticação e não foi possível automatizar login sem credenciais reais.
- Commit local criado (sem push — push é exclusivo do @devops).

## QA Results (@qa / Quinn)
**Veredito: PASS**

Revisão sobre o commit `9b054e7` (diff isolado, 1 arquivo de produto + story).

| Check | Resultado |
|---|---|
| 1. Code review | ✅ Diff mínimo e idiomático — reusa paleta `stone-*`/`indigo-*` já em uso no mesmo arquivo; wrapper `space-y-1` é o padrão do projeto para campo+hint |
| 2. Testes | ⚠️ Sem teste automatizado novo (componente não tinha suíte prévia; mudança é puramente visual/CSS — difícil de cobrir com unit test, exigiria e2e/visual regression inexistente no repo). Validação feita via inspeção do `<input type="datetime-local">` nativo (antes/depois). Não bloqueante para este escopo XS. |
| 3. Acceptance Criteria | ✅ AC1–AC4 confirmados linha a linha no diff: `text-stone-800`+`bg-white` no input (AC1); hint condicional `{!scheduledFor && ...}` (AC2); `disabled={...}` do botão intocado (AC3); nenhuma outra linha do Passo 3 alterada (AC4) |
| 4. Regressões | ✅ Diff cirúrgico (linhas 100-115 apenas) — radios, resumo da campanha e aviso de >50 leads fora do hunk, sem alteração |
| 5. Performance | ✅ N/A — apenas classes CSS, sem novo cálculo/render adicional relevante |
| 6. Segurança | ✅ N/A — sem input de usuário novo, sem dado sensível, sem superfície de ataque alterada |
| 7. Documentação | ✅ Story com Contexto, ACs, Dev Notes e Change Log completos |

**CodeRabbit:** não executado (WSL indisponível neste ambiente macOS) — mitigado com ESLint direcionado (reexecutado de forma independente nesta revisão: 0 erros, exit 0) + revisão manual do diff completo.

**Observação (não bloqueante):** registrar como débito técnico leve a ausência de cobertura e2e/visual-regression para este componente, caso o wizard de Email Blast ganhe mais lógica visual no futuro.

Pronta para `@devops *push`. (Nota: por permissão de agente, @qa não altera o campo Status — cabe a @devops mover para Done após o push, conforme `story-lifecycle.md`.)

## Change Log
- @sm (River): story criada em Draft, documentando fix de contraste já prototipado em sessão de debugging com o usuário.
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Status Draft → Ready.
- @dev (Dex): diff revisado contra os 4 ACs (todos atendidos), ESLint OK, commit local criado. Status Ready → InReview. Pronta para @qa *qa-gate.
