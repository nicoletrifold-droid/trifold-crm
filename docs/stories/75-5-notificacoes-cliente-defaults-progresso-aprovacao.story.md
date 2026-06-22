# Story 75-5 — Notificações do cliente: defaults sem opt-in, evento de progresso e disparo na aprovação

## Metadata
- **Status:** InReview
- **Epic:** 58 — Portal do Cliente
- **Branch:** main

## Context
Investigação (ver conversa) mostrou que o sistema de notificações do portal está cabeado (dispatcher `lib/notificacoes.ts` → e-mail/Resend, WhatsApp/Cloud API, push/web-push), mas **não entrega na prática** por 3 lacunas. Verificado em produção: das 43 contas vinculadas ao Yarden, **nenhuma** tem linha em `obra_notificacao_prefs`.

Três fixes (priorizados pelo solicitante):

**Fix 1 — Defaults sem opt-in (maior impacto).** `notifyClientes` só itera linhas existentes de `obra_notificacao_prefs`. A tela mostra "E-mail ligado" por padrão, mas a GET (`api/cliente/.../notificacoes/route.ts:53`) retorna `prefs ?? DEFAULT_PREFS` **sem criar linha**. Logo, cliente que nunca salvou não recebe nada. Solução: ao notificar, tratar ausência de linha como `DEFAULT_PREFS` (e-mail + todos os eventos ligados; WhatsApp/push permanecem opt-in).

**Fix 2 — Evento de progresso.** O tipo `progresso` existe em `notificacoes.ts` mas nenhum endpoint o dispara. O PATCH da obra (`api/admin/obras/[obra_id]/route.ts`) edita `progress_pct` manualmente; deve disparar `notifyClientes("progresso")` quando o valor mudar.

**Fix 3 — Disparo na aprovação.** Quando upload do papel "obras" é **aprovado** (`api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts`), a foto/documento é inserida mas o cliente não é notificado. Deve disparar `nova_foto`/`novo_documento` conforme `aprovacao.tipo` ao aprovar.

Vale para **todas as obras**.

## Acceptance Criteria
- [x] AC1 (Fix 1): Em `notifyClientes`, todos os clientes vinculados (`cliente_obras`) são considerados; para cada um, usa-se a linha de `obra_notificacao_prefs` se existir, senão `DEFAULT_PREFS` (`email_enabled:true, whatsapp_enabled:false, push_enabled:false, notify_*:true`). Quem nunca salvou passa a receber **e-mail** (e os eventos marcados por padrão).
- [x] AC2 (Fix 1): Gates por canal preservados — e-mail só com `email_enabled` + e-mail do usuário; WhatsApp só com `whatsapp_enabled` + `phone` + org; push só com `push_enabled`. WhatsApp/push continuam exigindo opt-in explícito (defaults `false`), sem regressão.
- [x] AC3 (Fix 2): No PATCH da obra, quando `progress_pct` é enviado e **difere** do valor atual, dispara `notifyClientes(obra_id, "progresso", obra.name)` (fire-and-forget, não bloqueia a resposta). Se o valor não muda, não dispara.
- [x] AC4 (Fix 3): Na aprovação (`acao === "aprovar"`) de um upload, dispara `notifyClientes(obra_id, tipo === "foto" ? "nova_foto" : "novo_documento", obraName)` após a inserção. Rejeição não dispara notificação ao cliente.
- [x] AC5: Sem mudança de schema. Sem alteração na UI da tela de notificações. Eventos já existentes (upload direto de foto/doc, nova mensagem) seguem funcionando sem regressão.

## Out of Scope
- Disparo de progresso por mudança em **fase** individual (`obra_fases` PATCH) — só o progresso da obra (nível geral) por enquanto, para evitar spam.
- WhatsApp via template fora da janela de 24h (fix maior, depende de aprovação de template na Meta) — Fix 4 não está nesta story.
- Backfill/criação proativa de linhas em `obra_notificacao_prefs`.
- Verificar/setar `RESEND_API_KEY` no Vercel (operacional, fora do código).

## Dependencies
- Nenhuma migração. `notifyClientes` e tabelas já existem.

## Complexity
- **T-shirt:** S/M (refactor pontual do loop em `notificacoes.ts` + 2 disparos novos).

## Business Value
Faz as notificações realmente chegarem (e-mail por padrão para todos os clientes vinculados), cobre o evento de progresso e fecha o furo da fila de aprovação — sem exigir que o cliente configure nada.

## Risks
- **Médio:** ligar e-mail por padrão para todos os vinculados pode gerar volume/itens não desejados (ex.: contas internas vinculadas como cliente). Mitigação: WhatsApp/push seguem opt-in; e-mail respeita `email_enabled` quando a linha existe (cliente pode desligar). Observar primeiro disparo em produção.
- Dependência operacional: e-mail só sai se `RESEND_API_KEY` estiver no Vercel (fora do escopo de código; sinalizado ao solicitante).

## Definition of Done
- ACs atendidos, type-check/lint OK no escopo, QA gate PASS (inclui simulação read-only do merge de prefs em dados reais), deploy via @devops.

## File List
- `docs/stories/75-5-notificacoes-cliente-defaults-progresso-aprovacao.story.md` (this file)
- `packages/web/src/lib/notificacoes.ts` (to update — Fix 1)
- `packages/web/src/app/api/admin/obras/[obra_id]/route.ts` (to update — Fix 2)
- `packages/web/src/app/api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts` (to update — Fix 3)

## Dev Notes (@dev / Dex)
- Fix 1 (`notificacoes.ts`): adicionado `DEFAULT_PREFS`; `notifyClientes` agora busca `users` (id,name,email,phone) de TODOS os vinculados e um `prefsMap` de `obra_notificacao_prefs`; por usuário usa `prefsMap.get(id) ?? DEFAULT_PREFS`. E-mail gated por `email_enabled && user.email`; WhatsApp por `whatsapp_enabled && phone && org`; push por `push_enabled` (usa `user.id`). Removido o tipo antigo `ObraNotificacaoPrefs` (com join `users`).
- Fix 2 (`obras/[obra_id]/route.ts`): `existing` agora seleciona `progress_pct`; após o update, se `updates.progress_pct` é número e difere de `existing.progress_pct`, dispara `notifyClientes(obra_id,"progresso",obra.name)` fire-and-forget.
- Fix 3 (`aprovacoes/[id]/route.ts`): no ramo `acao === "aprovar"`, após obter `obraName`, dispara `notifyClientes(obra_id, tipo === "foto" ? "nova_foto" : "novo_documento", obraName)` fire-and-forget.
- type-check 0 erros no escopo; eslint EXIT 0.

## QA Results (@qa / Quinn)
**Veredito: PASS** — AC1–AC5. Simulação read-only sobre produção (obra Yarden, evento nova_foto): alvos de e-mail passaram de **0 → 43** (todos com e-mail), WhatsApp/push permanecem 0 (opt-in preservado). Fix 2 dispara só quando `progress_pct` muda; Fix 3 só na aprovação. Sem schema/UI; sem regressão nos eventos existentes. type-check/eslint OK. Pronta para @devops *push.
**Ressalva operacional:** entrega de e-mail depende de `RESEND_API_KEY` no Vercel (fora do código) — confirmar antes/depois do deploy.

## Change Log
- @sm (River): story criada em Draft.
- @po (Pax): validação 10/10 → GO (riscos de volume de e-mail documentados). Status Draft → Ready.
- @dev (Dex): Fix 1/2/3 implementados. Status Ready → InReview.
- @qa (Quinn): QA gate PASS (simulação 0→43 em prod). Pronta para @devops *push.
