# Story 75-68 — WhatsApp do gestor via template `aviso_roleta_gestor` (deep-link)

## Metadata
- **Status:** Review · **Epic:** 75 · **Branch:** main · **Complexidade:** S (2-3 pontos)
- **executor:** @dev · **quality_gate:** @qa · **quality_gate_tools:** [typecheck, lint, vitest]

## Story
**As a** gestor/diretor avisado de um lead da roleta, **I want** receber o WhatsApp de forma **proativa** e com
botão que **abre o lead exato**, **so that** eu acesse o lead direto (igual ao corretor), e não dependa da
janela de 24h nem caia em página genérica.

## Contexto
`notifyImobiliaria` (avisa o usuário-gestor configurado em `roleta_config.notify_user_on_distribution` /
`notify_user_on_fora_horario`) hoje envia o WhatsApp via `sendBrokerWhatsApp` = **mensagem de TEXTO**. Texto só
entrega dentro da janela de 24h → proativamente quase nunca chega. Push e e-mail do gestor já fazem deep-link
correto (`/dashboard/leads/{id}`). Falta só o WhatsApp.

O template HSM `aviso_roleta_gestor` (pt_BR) **já está APPROVED e com botão de URL dinâmica** (Story 75-67):
botão → `https://crm.trifold.eng.br/dashboard/leads/{{1}}`. Body: {{1}}=nome gestor, {{2}}=mensagem do evento,
{{3}}=lead (nome — telefone). **Sem dependência da Meta** (já aprovado) → deploy imediato.

## Escopo
**IN:**
1. `packages/web/src/lib/roleta/notify-broker.ts` — nova função `sendImobiliariaTemplate(admin, orgId, phone,
   gestorName, messageBody, leadLabel, leadId)` que envia `aviso_roleta_gestor` (body 3 params + componente
   `button` sub_type url index 0 com param = `leadId`), com `logWhatsappSend` (recipientType "gestor") e
   `AbortSignal.timeout`, espelhando `sendBrokerLeadTemplate`.
2. `notifyImobiliaria` — trocar a chamada `sendBrokerWhatsApp(...)` por `sendImobiliariaTemplate(...)`:
   - `gestorName` = `user.name`; `messageBody` = o `messageBody` do evento; `leadLabel` =
     `${lead.name ?? "Lead"}${lead.phone ? " — " + lead.phone : ""}`; `leadId` = `lead.id`.
3. Teste em `notify-broker.test.ts` — caso novo: `notifyImobiliaria` com `whatsapp_config` válida e telefone do
   gestor → `fetch` chamado com `type:"template"`, `name:"aviso_roleta_gestor"` e componente `button` com o
   `lead.id` no parâmetro.

**OUT:**
- Não mexer no template na Meta (já APPROVED/dinâmico).
- Não mudar push/e-mail do gestor (já corretos).
- Não mudar o corretor (Story 75-67) nem a seleção de quem é o gestor notificado.
- `sendBrokerWhatsApp` (texto) continua existindo p/ fluxos com `context` (agendamento 51-3).

## Acceptance Criteria
1. **Given** um lead distribuído/fora-de-horário com gestor configurado e `users.phone` preenchido, **when**
   `notifyImobiliaria` roda, **then** o WhatsApp é enviado como **template** `aviso_roleta_gestor` (proativo,
   fora da janela de 24h), não como texto.
2. **Given** o envio do template, **when** monta o payload, **then** inclui o componente `button` (sub_type url,
   index 0) com `lead.id` → botão abre `/dashboard/leads/{lead.id}` (lead exato).
3. **Given** body do template, **when** monta params, **then** {{1}}=nome do gestor, {{2}}=mensagem do evento,
   {{3}}=lead (nome — telefone).
4. **Given** gestor sem telefone, **when** `notifyImobiliaria` roda, **then** não tenta WhatsApp (push/e-mail
   seguem normais) — sem regressão.
5. typecheck/lint/vitest limpos.

## Dev Notes
- Espelhar `sendBrokerLeadTemplate` (mesmo endpoint, headers, timeout, logWhatsappSend). Botão dinâmico já
  aprovado, então o param NÃO causa 132018.
- Params de template não podem ter `\n`/tab/4+ espaços — `messageBody` e `leadLabel` são frases curtas, ok.
- Reuso: estende [[project-notificacoes-portal]] (issue #27 — gestor) e Story 75-67 (template já corrigido).

### Testing
- `vitest packages/web` (notify-broker.test.ts) + `type-check`/`lint`.
- Mock: `createAdminClient` retornando `whatsapp_config` válida + `users` com phone; `fetch` global; asserir payload.

## QA Results
- **Verdict:** PASS (gate `docs/qa/gates/75.68-gestor-whatsapp-template-deeplink.yml`) · readiness 9/10
- notify-broker 4/4 (2 novos) + roleta 43/43; `pnpm type-check` 8/8. AC1-AC5 cobertos.
- 1 obs low: 1º envio real do template ao gestor é a validação final.
- **Pendente @devops:** merge + deploy (sem migration, sem Meta). Status → Done após push.

## Riscos
- **Param de botão em template estático = 132018:** N/A aqui — `aviso_roleta_gestor` já está APPROVED como
  dinâmico (verificado). **Baixo.**
- **Texto do messageBody longo demais p/ param:** são frases curtas (≤ ~120 chars). **Baixo.**

## File List
- `packages/web/src/lib/roleta/notify-broker.ts` — nova `sendImobiliariaTemplate` (template `aviso_roleta_gestor`
  + componente button com lead.id + logWhatsappSend recipientType "gestor"); `notifyImobiliaria` passa a usá-la
  no lugar de `sendBrokerWhatsApp` (texto).
- `packages/web/src/lib/roleta/notify-broker.test.ts` — mocks por tabela (users/whatsapp_config) + fetch + log-send;
  2 casos novos (template c/ botão deep-link lead.id + body params; gestor sem telefone → sem WhatsApp).

## Dev Agent Record
- **Agent Model:** Claude Opus 4.8 (1M)
- **Completion Notes:**
  - `sendBrokerWhatsApp` (texto) preservada — ainda usada pelo `notifyBroker` no fluxo com `context` (agendamento 51-3).
  - Sem dependência da Meta nem migration: `aviso_roleta_gestor` já APPROVED/dinâmico (Story 75-67) → param de botão não causa 132018.
  - **Validação local:** `vitest` notify-broker 4/4 + roleta 43/43; `pnpm type-check` 8/8.
  - Push e e-mail do gestor inalterados (já deep-linkavam). Diretor: per-lead só se for o usuário configurado na roleta (sem mudança aqui).

## Change Log
- 2026-06-26 — @sm — Story criada. WhatsApp do gestor passa de texto → template `aviso_roleta_gestor` (já
  aprovado/dinâmico) com botão deep-link p/ o lead exato. Sem dependência da Meta. Ver [[project-notificacoes-portal]].
- 2026-06-26 — @po — Validação (10 pontos): **GO**, 9/10. Escopo claro e pequeno; 5 ACs testáveis; sem
  dependência externa (template já APPROVED); riscos N/A justificados; preserva push/email e o fluxo de texto
  com context. Status Draft → Ready.
- 2026-06-26 — @dev — Implementado: `sendImobiliariaTemplate` (template aviso_roleta_gestor + botão lead.id);
  `notifyImobiliaria` migrado de texto → template; +2 testes. notify-broker 4/4, roleta 43/43, type-check 8/8. Status Ready → Review.
- 2026-06-26 — @qa — Gate **PASS** (9/10), AC1-AC5 OK, sem regressão. 1 obs low (1º envio real valida). Pendente @devops: merge+deploy.
