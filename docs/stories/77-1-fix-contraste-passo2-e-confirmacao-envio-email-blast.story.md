# Story 77-1 — Contraste no Passo 2 do wizard de Email Blast + confirmação visual pós-criação

## Metadata
- **Status:** Done
- **Epic:** 57 — Melhorias Operacionais CRM
- **Branch:** main

## Context
Continuação da Story 76-1 (mesma sessão de uso real do wizard de Email Blast pelo usuário). Dois problemas adicionais identificados:

**Bug 1 — Mesma causa-raiz da 76-1, componente diferente:** em `step-content.tsx` (Passo 2 — Conteúdo), os campos "Nome da campanha" (`<input>`), "Template de email" (`<select>`) e "Assunto" (`<input>`) não definem cor de texto explícita, herdando o cinza claro do navegador. Texto digitado fica ilegível — visto no print do usuário com "ghlshsh" e "gigi" praticamente invisíveis nos campos.

**Bug 2 — Sem confirmação pós-criação:** em `wizard.tsx`, `handleConfirm` (chamada ao `POST /api/admin/email-blasts`) ao ter sucesso apenas faz `router.push("/dashboard/sistema/email-blasts")` + `router.refresh()`, sem qualquer confirmação visual. O usuário não tem como saber se a criação do blast funcionou sem abrir a lista e procurar a linha manualmente.

**Importante (limite do que a confirmação pode afirmar):** a criação do blast só coloca os destinatários na fila (`email_sends_queue`); o envio real é assíncrono via cron com rate limiting (100/dia). `blast-list.tsx` já tem status (Rascunho/Agendado/Em andamento/Concluído) e barra de progresso `sent_count/total_recipients` — essa é a fonte de verdade sobre entrega. A confirmação desta story deve dizer "criado com sucesso, N leads na fila", nunca "enviado"/"entregue".

## Acceptance Criteria
- [x] AC1: Os 3 campos do Passo 2 (`Nome da campanha`, `Template de email`, `Assunto`) exibem texto com contraste adequado (`text-stone-800`) tanto ao digitar quanto nas opções do `<select>` (`bg-white` explícito no select para a lista de opções).
- [x] AC2: Ao confirmar a criação do blast com sucesso, o usuário é redirecionado para `/dashboard/sistema/email-blasts` com um banner de sucesso visível (verde, dismissível, mesmo padrão visual do banner de erro já existente: `rounded-lg border ... bg-{cor}-50 text-{cor}-700`).
- [x] AC3: O texto do banner é proporcional à realidade — informa quantos leads entraram na fila e se o envio é imediato ou agendado para uma data (nunca afirma "enviado"/"entregue", já que a entrega real é assíncrona).
- [x] AC4: Após exibido uma vez, o banner não reaparece em um refresh da página (query params de sucesso são limpos da URL via `router.replace`).
- [x] AC5: Nenhuma mudança de comportamento funcional na criação do blast em si (payload do `POST /api/admin/email-blasts` permanece o mesmo) — só o que acontece após o sucesso.

## Out of Scope
- Qualquer alteração no schema de `email_blasts` / `email_sends_queue` ou na lógica de rate limiting do cron.
- Adicionar biblioteca de toast (ex: sonner) — reusar o padrão de banner inline já existente no próprio código, evitando nova dependência (IDS: REUSE > CREATE).
- Notificação em tempo real de progresso de envio (isso já existe via status/progress bar na lista).

## Dependencies
- Nenhuma. Fixes isolados em 3 componentes já existentes do wizard de Email Blast.

## Complexity
- **T-shirt:** S (2 arquivos com fix de contraste idêntico ao da 76-1 + 1 fluxo de query param/banner novo, porém simples e sem nova dependência).

## Business Value
Evita que o admin digite "no escuro" no Passo 2 (mesmo problema já resolvido no Passo 3 pela Story 76-1) e dá segurança de que a ação de criar o blast realmente funcionou, sem precisar adivinhar ou recarregar a lista para confirmar.

## Risks
- Baixo. Bug 1 é puramente visual (mesmo padrão já validado na 76-1). Bug 2 usa query params + banner reaproveitando padrão existente — sem novo estado persistido, sem novo endpoint.

## Definition of Done
- ACs atendidos, lint OK nos 3 arquivos, validação visual confirmando contraste e banner, QA gate PASS, commit/push via @devops.

## File List
- `docs/stories/77-1-fix-contraste-passo2-e-confirmacao-envio-email-blast.story.md` (this file)
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-content.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/_components/blast-list.tsx`

## Dev Notes (@dev / Dex)
- Bug 1: aplicar exatamente o mesmo padrão da Story 76-1 (`text-stone-800` + `bg-white` explícitos) nas classNames de `input` (Nome da campanha, linha ~58-64), `select` (Template de email, linha ~69-78) e `input` (Assunto, linha ~87-92) em `step-content.tsx`.
- Bug 2: em `wizard.tsx`, no `handleConfirm`, após `res.ok`, montar query string com dados já disponíveis na resposta/estado local (ex: `recipients` = `audience.recipientCount`, `mode` = `scheduledFor ? "scheduled" : "now"`, `scheduledFor` se aplicável) e redirecionar via `router.push(\`/dashboard/sistema/email-blasts?created=1&recipients=${n}&mode=${mode}${scheduledFor ? \`&scheduledFor=${encodeURIComponent(scheduledFor)}\` : ""}\`)`.
- Em `blast-list.tsx`, usar `useSearchParams` (Next.js) para ler `created`/`recipients`/`mode`/`scheduledFor` no mount, renderizar banner verde condicional acima da tabela, e chamar `router.replace("/dashboard/sistema/email-blasts")` (sem os params) para não persistir em refresh — atenção para não disparar isso em loop (rodar só uma vez, ex. dentro do mesmo `useEffect` que já busca `fetchData`, ou um efeito dedicado com guarda).
- Texto sugerido do banner: `"Blast criado com sucesso — {N} lead(s) na fila. Envio {imediato / agendado para {data em pt-BR}}."`

## Dev Agent Record

### Completion Notes
- AC1: `text-stone-800` + `bg-white` explícitos aplicados nos 3 campos de `step-content.tsx` (input Nome da campanha, select Template de email, input Assunto) — mesmo padrão da Story 76-1.
- AC2-AC4: `wizard.tsx` agora monta `URLSearchParams` (`created=1`, `recipients`, `mode=now|scheduled`, `scheduledFor` se aplicável) e redireciona com eles. `blast-list.tsx` lê via `useSearchParams`, monta a mensagem do banner (verde, dismissível, mesmo padrão do banner de erro), e chama `router.replace("/dashboard/sistema/email-blasts")` (sem params) logo em seguida para não reaparecer em refresh — segui o padrão de client components já existentes no app que usam `useSearchParams` sem `Suspense` wrapper (`task-date-filter.tsx`, `lead-search.tsx`), já que a página é SSR dinâmica (`getServerUser()`), não geração estática.
- AC5: payload do `POST /api/admin/email-blasts` em `handleConfirm` não foi alterado — só o que acontece depois do `res.ok`.
- ESLint: 0 erros nos 3 arquivos. Um warning pré-existente (não introduzido por esta story) permanece em `blast-list.tsx` linha 51 (`eslint-disable` órfão em código anterior à story).
- CodeRabbit (WSL) não aplicável neste ambiente macOS — mesma situação documentada na Story 76-1.

### File List
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/step-content.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/novo/_components/wizard.tsx`
- `packages/web/src/app/dashboard/sistema/email-blasts/_components/blast-list.tsx`

## QA Results (@qa / Quinn)
**Veredito: PASS**

Revisão sobre o commit `465582d9` (diff isolado, 3 arquivos de produto + story).

| Check | Resultado |
|---|---|
| 1. Code review | ✅ Diff mínimo, reusa padrão já validado na 76-1 (contraste) e o padrão de banner de erro já existente no wizard (sucesso em verde) |
| 2. Testes | ⚠️ Sem teste automatizado novo — mesma justificativa da 76-1 (mudança visual/fluxo simples, sem suíte prévia no componente). Não bloqueante. |
| 3. Acceptance Criteria | ✅ AC1–AC5 confirmados no diff: `text-stone-800`+`bg-white` nos 3 campos (AC1); banner verde dismissível pós-redirect (AC2); texto do banner checado explicitamente — usa "criado com sucesso" / "na fila" / "Envio imediato/agendado", **nunca** "enviado" ou "entregue" (AC3); `router.replace` limpa os query params logo após ler (AC4); payload do `POST /api/admin/email-blasts` em `handleConfirm` inalterado (AC5) |
| 4. Regressões | ✅ Diff cirúrgico nos 3 arquivos, nenhuma outra lógica tocada (Step 1/Audiência intocado) |
| 5. Performance | ✅ N/A — um `useEffect` extra e leitura de query params, custo desprezível |
| 6. Segurança | ✅ N/A — query params são só metadados de UX (contagem/modo/data), sem dado sensível; nenhum novo endpoint |
| 7. Documentação | ✅ Story com Contexto, ACs, Dev Notes/Completion Notes e Change Log completos |

**Verificação extra — `useSearchParams` sem `Suspense`:** confirmado que `page.tsx` (`email-blasts/page.tsx`) chama `getServerUser()` → `createClient()` do Supabase SSR, que lê cookies de auth. Uso de `cookies()` força a rota para renderização dinâmica no Next.js App Router, tirando-a da geração estática — logo o requisito de `Suspense` em torno de `useSearchParams` (que só se aplica a rotas estaticamente pré-renderizadas) não se aplica aqui. Mesmo padrão já usado sem problemas em outros componentes do app (`task-date-filter.tsx`, `lead-search.tsx`), ambos atrás de autenticação. Não é regressão de build.

**Observação (não bloqueante):** a lista aberta (`<option>`) de um `<select>` nativo pode, em alguns navegadores, manter estilização de dark-mode do SO independente das classes Tailwind aplicadas ao elemento fechado — o fix resolve o problema relatado (valor selecionado ilegível no campo fechado), mas se o menu aberto também aparecer com baixo contraste em algum navegador específico, o hardening correto seria `style={{ colorScheme: "light" }}` no `<select>`. Registrar como possível débito técnico se reportado novamente.

**CodeRabbit:** não executado (WSL indisponível neste ambiente macOS) — mitigado com ESLint independente (reexecutado nesta revisão: 0 erros, 1 warning pré-existente não relacionado a esta story) + revisão manual do diff completo.

Pronta para `@devops *push`.

## Change Log
- @sm (River): story criada em Draft, documentando os 2 fixes de UX reportados pelo usuário no Passo 2 e pós-confirmação do wizard de Email Blast (continuação da sessão da Story 76-1).
- @po (Pax): validação via checklist de 10 pontos → **GO** (10/10). Status Draft → Ready.
- @dev (Dex): AC1-AC5 implementados nos 3 arquivos, ESLint OK. Status Ready → InReview. Pronta para @qa *qa-gate.
- @qa (Quinn): QA gate PASS (7/7 checks). Pronta para @devops *push.
- @devops (Gage): pre-push OK (lint limpo, sem divergência nova de origin/main). Push para origin/main (`fc8ee7e3`). Status InReview → Done.
