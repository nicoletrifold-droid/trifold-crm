---
name: project-epic86
description: Epic 86 (Meta CAPI/Pixel tracking) — stories criadas, runtimes distintos, decisões arquiteturais travadas por story
metadata:
  type: project
---

Epic 86 — Conversions API (CAPI) e Rastreamento Meta (`docs/stories/epics/epic-86-meta-capi-tracking.md`).
Objetivo original: evento "Visitou" (86-1 a 86-8, outbox+cron via stage `visitou` no kanban).
Depois expandiu para Pixel+CAPI em pontos de entrada de lead que não tinham tracking nenhum.

**Story 86-9** (Ready for Review, QA PASS): Pixel + CAPI no formulário de qualificação
(`/formulario/[token]`, dentro de `packages/web`, Next.js). Substituiu as 86-5/6/7 (apontavam
para uma landing que nunca foi criada — correção de curso registrada na própria 86-9).
Criou o padrão de referência: `visitor_id` em localStorage, `event_id` gerado no browser e
reaproveitado no servidor (dedup 48h), `external_id` com múltiplos valores, rota separada
`/tracking` para eventos de topo de funil (antes do lead existir), `metadata.meta_ad` no lead
para o cron 86-4 herdar atribuição de graça. AC7: `st` (UF via DDD) sim, `ct` (cidade) nunca —
teste dedicado proíbe regressão.

**Story 86-10**: reservada (não criada ainda) — follow-up de e-mail opcional no passo de
agendamento do formulário de qualificação (mencionado em "Fora de escopo" da 86-9). Não confundir
com outros tópicos de tracking.

**Story 86-11** (Draft, v0.2 revisada 2026-08-24): Pixel + CAPI na landing estática do Vind Residence
(`landing-pages/vind-residence/`, servida via rewrite do projeto Vercel `trifold-design-system`
em `trifold.eng.br/vindresidence/`). Runtime **completamente diferente** da 86-9: projeto Vercel
standalone, fora do workspace pnpm, sem `package.json` deps, sem bundler/TypeScript — `api/lead.js`
é Node CommonJS cru. Decisão travada: **Opção A** — CAPI disparado do lado do CRM (estende
`POST /api/webhooks/landing-page`, endpoint hoje genérico/compartilhado com WordPress), reusando
`packages/shared/src/meta/*` sem duplicar, e SEM precisar de nenhuma env var nova (credenciais já
vivem no projeto `trifold-crm`). Nova sub-rota `POST /api/webhooks/landing-page/track` para
ViewContent/InitiateCheckout (antes do lead existir), mesmo princípio da rota `/tracking` da 86-9.
**Os 5 eventos completos** (revisado a pedido do usuário, v0.2 — v0.1 tinha `CompleteRegistration`
fora de escopo): `PageView`, `ViewContent`, `InitiateCheckout` (gatilho: primeiro `focus` em
nome/whatsapp, form é atômico/single-step), `Lead`, `CompleteRegistration`. `CompleteRegistration`
**sem gatilho temporal distinto de `Lead`** — dispara no mesmo instante (mesma condição: servidor
confirma lead criado/atualizado), com `event_id` próprio (`tracking.complete_registration_event_id`),
via `FORM_CAPI_EVENTS.COMPLETE_REGISTRATION` já existente em `capi-payload.ts` (criada na 86-9,
nenhuma constante nova). Ressalva documentada explicitamente na story (não é erro, é ausência
genuína de segundo passo nesta landing — diferente da 86-9 onde `CompleteRegistration` marca
`finalizar: true`). Advanced Matching e `st`/`ct` continuam fora de escopo (follow-up). CSP de
`landing-pages/trifold-design-system/vercel.json` precisa ganhar `connect.facebook.net`/
`www.facebook.com` nos 3 blocos `/vindresidence*` (não no 4º, catch-all).

**Descoberta importante (verificar antes de agir):** o `vercel.json` do `trifold-design-system`
e o `.vercel/project.json` do `vind-residence` apontam consistentemente para o projeto Vercel
`vind-residence` (sem "-teste" no nome). Se alguém mencionar `vind-residence-teste.vercel.app`,
tratar como possivelmente desatualizado/outro projeto — confirmar com `vercel project ls` antes
de qualquer mudança de env var ou deploy.

**Convenção de deploy de `landing-pages/*`:** direto do diretório local via
`vercel deploy --prod --yes --scope trifold-s-projects`, sem git commit/PR/CI — intencionalmente
fora do pipeline do monorepo. Não dispensa @po/@dev/@qa antes da implementação; só muda a fase
final de @devops (deploy direto, não PR).

## Numeração
Próxima story do Epic 86 após 86-11 seria 86-12 (86-10 permanece reservada/não criada para o
follow-up de e-mail da 86-9).
