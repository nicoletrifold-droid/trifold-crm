# Story 75-152 — Corrigir fallback de domínio dos links de notificação (app.trifold.com.br → crm.trifold.eng.br)

**Status:** Ready for Review
**Epic:** Notificações / distribuição de leads
**Complexidade:** XS (4 trocas de string, sem migration)
**Relacionado:** incidente do link da distribuição (env `NEXT_PUBLIC_APP_URL` errada em prod)

## Contexto
Corretores reclamaram que, ao clicar no link de "Ver lead" enviado na distribuição, **não caíam
no sistema** (bounce pro login). Causa-raiz: em produção `NEXT_PUBLIC_APP_URL` estava
`https://trifold-crm.vercel.app` (domínio da Vercel) em vez de `https://crm.trifold.eng.br`.
Como a sessão do corretor é do domínio custom, o cookie não valia no `vercel.app` → login.

**Já corrigido em prod** (env + redeploy, 2026-07-13): `NEXT_PUBLIC_APP_URL=https://crm.trifold.eng.br`.
O botão do WhatsApp da distribuição (template `novo_lead_corretor`) já estava correto — a URL do
botão é fixada na Meta como `https://crm.trifold.eng.br/broker/leads/{{1}}`.

Esta story é a **blindagem no código**: o *fallback* usado quando a env falta era
`https://app.trifold.com.br` — um domínio que **nem resolve (NXDOMAIN)**. Se a env sumir/errar de
novo, os links quebram silenciosamente. Trocar o fallback para o domínio real elimina esse risco.

## Acceptance Criteria
1. **AC1** — Todos os fallbacks `?? "https://app.trifold.com.br"` em código de produção passam a
   `?? "https://crm.trifold.eng.br"`.
2. **AC2** — Nenhuma referência a `app.trifold.com.br` sobra em código de produção (`packages/**`,
   exceto fixtures de teste, que são valores explícitos e não dependem do fallback).
3. **AC3** — Comportamento com a env **presente** inalterado (o fallback só age quando a env falta).
4. **AC4** — tsc/eslint limpos; suíte de testes sem regressão.

## Tasks
- [x] `lib/roleta/notify-broker.ts` (linhas 46, 240): fallback → `crm.trifold.eng.br`.
- [x] `lib/broker/notify-on-reply.ts` (linha 100): fallback → `crm.trifold.eng.br`.
- [x] `lib/notificacoes.ts` (linhas 210, 295, 406): fallback → `crm.trifold.eng.br`.
- [x] Conferir: fixture `notify-on-reply.test.ts` usa `appUrl` explícito (não depende do fallback) → sem alteração.
- [x] tsc + eslint + vitest.

## Dev Notes
- Escopo é só o **fallback** (branch `??`). A fonte da verdade continua sendo a env
  `NEXT_PUBLIC_APP_URL` (agora correta em prod).
- Não confundir com `NEXT_PUBLIC_SITE_URL` (usado em auth/reset/reminders) — esse já era
  `crm.trifold.eng.br` e não muda.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-07-13 | 0.1 | Story criada + implementada (fallback → crm.trifold.eng.br). | @sm/@dev |
